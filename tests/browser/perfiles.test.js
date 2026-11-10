import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';
import config from '../../bs-config.cjs';

const id = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const clinica = { idClinica:id(50),nombre:'Clínica Central',activo:true };
const roles = ['PACIENTE','DOCTOR','ADMINISTRACION'].map((codigo,i)=>({idRol:id(10+i),codigo,nombre:codigo,activo:true}));
const personas = [{idPersona:id(1),nombres:'Ana',apellidos:'Pérez',fechaNacimiento:'2000-01-01T00:00:00.000Z'},
    {idPersona:id(3),nombres:'Doctor',apellidos:'Prueba'}, {idPersona:id(5),nombres:'Secretaría',apellidos:'Prueba'}];
const asignaciones = personas.map((p,i)=>({idPersonaRol:id(2+i*2),idPersona:p.idPersona,idRol:roles[i].idRol,idClinica:clinica.idClinica}));
const consultas = [];
const sesiones = new Map();
const escrituras = [];
let browser,backend,frontend,base,numero=100,fallarProximaCarga=false;
const listen = server => new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const close = server => new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});
const json = (res,datos,status=200) => {res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(datos));};

before(async()=>{
    backend = http.createServer(async(req,res)=>{
        const url=new URL(req.url,'http://localhost');const ruta=url.pathname.replace('/galenosv/api/','');
        let datos={}; if(!['GET','HEAD'].includes(req.method)){let body='';for await(const chunk of req)body+=chunk;if(body)datos=JSON.parse(body);}
        const cookie=req.headers.cookie?.match(/CHIVO_TEST=([^;]+)/)?.[1];const sesion=sesiones.get(cookie);
        if(ruta==='auth/login') {
            const indice=['PACIENTE','DOCTOR','ADMINISTRACION'].indexOf(datos.identificador);
            if(indice<0||datos.password!=='prueba')return json(res,{message:'Credenciales incorrectas'},401);
            const token=String(numero++);const p=personas[indice];const rol=roles[indice];const asignacion=asignaciones[indice];
            sesiones.set(token,{usuario:{idUsuario:id(80+indice),...p},rolActivo:{...asignacion,codigo:rol.codigo,nombreClinica:clinica.nombre},csrfToken:`csrf-${token}`});
            res.writeHead(204,{'Set-Cookie':`CHIVO_TEST=${token}; Path=/galenosv; HttpOnly; SameSite=Lax`});return res.end();
        }
        if(!sesion)return json(res,{message:'Sesión finalizada'},401);
        if(ruta==='auth/me')return json(res,sesion);
        if(req.method!=='GET') {
            if(req.headers['x-csrf-token']!==sesion.csrfToken)return json(res,{message:'Token inválido'},403);
            escrituras.push({ruta,metodo:req.method,datos,rol:sesion.rolActivo.codigo});
        }
        if(ruta==='auth/logout'){sesiones.delete(cookie);res.writeHead(204);return res.end();}
        if(ruta==='atencion')return json(res,{idPersonaRol:sesion.rolActivo.idPersonaRol,idConsulta:null});
        if(ruta==='clinicas')return json(res,[clinica]);
        if(ruta===`clinicas/${clinica.idClinica}`)return json(res,clinica);
        if(ruta==='roles')return json(res,roles);
        if(ruta==='personas-roles' && fallarProximaCarga){fallarProximaCarga=false;return json(res,{message:'No pudimos actualizar el listado.'},503);}
        if(ruta==='personas-roles')return json(res,asignaciones.filter(a=>!url.searchParams.get('idRol')||a.idRol===url.searchParams.get('idRol')));
        if(ruta==='personas')return json(res,personas);
        if(ruta==='recepcion/pacientes' && req.method==='POST'){
            assert.equal(sesion.rolActivo.codigo,'ADMINISTRACION');
            const p={idPersona:id(numero++),...datos}; const asignacion={idPersonaRol:id(numero++),idPersona:p.idPersona,idClinica:clinica.idClinica,idRol:roles[0].idRol};
            personas.push(p);asignaciones.push(asignacion);return json(res,{idPersona:p.idPersona,idPersonaRol:asignacion.idPersonaRol},201);
        }
        const personaMatch=ruta.match(/^personas\/([^/]+)$/);
        if(personaMatch){const p=personas.find(p=>p.idPersona===personaMatch[1]);if(req.method==='PATCH')Object.assign(p,datos);return json(res,p);}
        const prMatch=ruta.match(/^personas-roles\/([^/]+)$/);
        if(prMatch)return json(res,asignaciones.find(a=>a.idPersonaRol===prMatch[1]));
        const nuevaConsulta=ruta.match(/^personas-roles\/([^/]+)\/consultas$/);
        if(nuevaConsulta){if(req.method==='POST'){const c={idConsulta:id(numero++),idPersonaRol:nuevaConsulta[1],fechaInicio:new Date().toISOString(),fechaFin:null,...datos};consultas.push(c);return json(res,c,201);}return json(res,consultas.filter(c=>c.idPersonaRol===nuevaConsulta[1]));}
        if(ruta==='consultas')return json(res,consultas);
        const consultaMatch=ruta.match(/^consultas\/([^/]+)$/);
        if(consultaMatch){const c=consultas.find(c=>c.idConsulta===consultaMatch[1]);if(req.method==='PATCH')Object.assign(c,datos);return json(res,c);}
        return json(res,[]);
    });
    await listen(backend);
    process.env.API_URL=`http://127.0.0.1:${backend.address().port}/galenosv/api`;
    const src=fileURLToPath(new URL('../../src/',import.meta.url));
    frontend=http.createServer(async(req,res)=>{
        if(req.url.startsWith('/galenosv/api/')){req.url=req.url.slice('/galenosv/api'.length);return config.server.middleware[0].handle(req,res);}
        const ruta=new URL(req.url,'http://localhost').pathname;const archivo=path.join(src,ruta==='/'?'index.html':ruta);
        try{const data=await readFile(archivo);res.writeHead(200,{'Content-Type':{'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'}[path.extname(archivo)]??'text/plain'});res.end(data);}
        catch{res.writeHead(404);res.end();}
    });
    await listen(frontend);base=`http://127.0.0.1:${frontend.address().port}`;
    browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();if(frontend)await close(frontend);if(backend)await close(backend);});
async function entrar(rol){const context=await browser.newContext();const page=await context.newPage();await page.goto(base);await page.getByLabel('Usuario o correo electrónico').fill(rol);await page.getByLabel('Contraseña',{exact:true}).fill('prueba');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();return {context,page};}
for(const [rol,ruta] of [['PACIENTE','pacientes/homepage-user.html'],['DOCTOR','medico/atencion.html'],['ADMINISTRACION','personal/administracion.html']]){
    test(`login real en navegador dirige ${rol} a su vista y permite salir`,async()=>{
        const {context,page}=await entrar(rol);
        try{await page.waitForURL(`**/${ruta}`);await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.waitForURL('**/index.html?sesion=finalizada');assert.ok(escrituras.some(e=>e.ruta==='auth/logout'&&e.rol===rol));}
        finally{await context.close();}
    });
}
test('un paciente que abre administración vuelve a su portal sin cargar catálogos',async()=>{
    const {context,page}=await entrar('PACIENTE');try{await page.waitForURL('**/pacientes/homepage-user.html');await page.goto(`${base}/paginas/personal/administracion.html`);await page.waitForURL('**/pacientes/homepage-user.html');assert.equal(await page.locator('panel-recepcion').count(),0);}finally{await context.close();}
});
test('una sesión vencida vuelve al login al actualizar el expediente',async()=>{
    const {context,page}=await entrar('PACIENTE');try{await page.waitForURL('**/pacientes/homepage-user.html');await page.getByText('Ana Pérez · Clínica Central',{exact:true}).waitFor();sesiones.clear();await page.getByRole('button',{name:'Actualizar',exact:true}).click();await page.waitForURL('**/index.html?sesion=finalizada');}finally{await context.close();}
});
test('secretaría registra y edita paciente, y abre consulta con cookie y CSRF',async()=>{
    const {context,page}=await entrar('ADMINISTRACION');try{
        await page.waitForURL('**/personal/administracion.html');
        const panel=page.locator('panel-recepcion');
        await panel.getByLabel('Nombres',{exact:true}).fill('María');await panel.getByLabel('Apellidos',{exact:true}).fill('López');await panel.getByLabel('Fecha de nacimiento',{exact:true}).fill('1999-03-12');
        await panel.getByRole('button',{name:'Guardar paciente',exact:true}).click();await panel.getByRole('button',{name:'Editar a María López',exact:true}).click();
        await panel.getByLabel('Nombres',{exact:true}).fill('María Elena');await panel.getByRole('button',{name:'Guardar paciente',exact:true}).click();
        await panel.getByRole('button',{name:'Editar a María Elena López',exact:true}).waitFor();
        const nuevo=asignaciones.at(-1);await panel.getByLabel('Paciente',{exact:true}).selectOption(nuevo.idPersonaRol);await panel.getByLabel('Motivo de atención',{exact:true}).fill('Control general');await panel.getByRole('button',{name:'Abrir consulta',exact:true}).click();
        await panel.getByText('Registro guardado correctamente.',{exact:true}).waitFor();
        assert.ok(escrituras.some(e=>e.ruta==='recepcion/pacientes'&&e.datos.nombres==='María'));
        assert.ok(escrituras.some(e=>e.metodo==='PATCH'&&e.datos.nombres==='María Elena'));
        assert.ok(consultas.some(c=>c.idPersonaRol===nuevo.idPersonaRol&&c.observaciones==='Control general'));
    }finally{await context.close();}
});
test('la vista médica conserva la identidad autenticada y nunca cambia al primer doctor',async()=>{
    const desde=escrituras.length;const {context,page}=await entrar('DOCTOR');try{
        await page.waitForURL('**/medico/atencion.html');
        await page.locator('medico-header').getByText('Doctor Prueba',{exact:false}).waitFor();
        assert.equal(await page.locator('medico-header select').count(),0);
        assert.equal(escrituras.slice(desde).some(e=>e.ruta==='atencion/rol-activo'),false);
    }finally{await context.close();}
});

test('el doctor abre el expediente preparado en recepción y guarda sus notas',async()=>{
    const {context,page}=await entrar('DOCTOR');try{
        await page.waitForURL('**/medico/atencion.html');
        await page.locator('cola-pacientes').getByRole('button',{name:/María Elena López/}).click();
        const workbench=page.locator('workbench-medico');
        await workbench.getByLabel('Diagnóstico y Observaciones Clínicas:',{exact:true}).fill('Evolución favorable');
        await workbench.locator('#btnGuardarNotas').click();
        await page.getByText('Notas diagnósticas guardadas satisfactoriamente.',{exact:true}).waitFor();
        assert.ok(escrituras.some(e=>e.rol==='DOCTOR'&&e.metodo==='PATCH'&&e.datos.observaciones==='Evolución favorable'));
    }finally{await context.close();}
});

test('recepción se adapta al móvil sin desbordar la página',async()=>{
    const {context,page}=await entrar('ADMINISTRACION');try{
        await page.waitForURL('**/personal/administracion.html');
        await page.locator('panel-recepcion').getByRole('button',{name:'Guardar paciente',exact:true}).waitFor();
        await mkdir(new URL('../../test-results/',import.meta.url),{recursive:true});
        await page.screenshot({path:fileURLToPath(new URL('../../test-results/recepcion-desktop.png',import.meta.url)),fullPage:true});
        await page.setViewportSize({width:390,height:844});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'La página debe ajustarse al ancho móvil');
        const menu=await page.locator('navegacion-personal').boundingBox();
        assert.ok(menu.x>=0 && menu.x+menu.width<=390,'El menú debe quedar completo dentro de la pantalla');
        await page.screenshot({path:fileURLToPath(new URL('../../test-results/recepcion-mobile.png',import.meta.url)),fullPage:true});
    }finally{await context.close();}
});

test('un guardado correcto se conserva aunque falle la recarga del listado',async()=>{
    const {context,page}=await entrar('ADMINISTRACION');try{
        await page.waitForURL('**/personal/administracion.html');const panel=page.locator('panel-recepcion');
        await panel.getByLabel('Nombres',{exact:true}).fill('Elena');await panel.getByLabel('Apellidos',{exact:true}).fill('Ramírez');
        await panel.getByLabel('Fecha de nacimiento',{exact:true}).fill('1985-04-20');
        const antes=escrituras.filter(e=>e.ruta==='recepcion/pacientes').length;fallarProximaCarga=true;
        await panel.getByRole('button',{name:'Guardar paciente',exact:true}).click();
        await panel.getByText('Registro guardado correctamente. No pudimos actualizar el listado.',{exact:true}).waitFor();
        await panel.getByRole('button',{name:'Volver a cargar pacientes',exact:true}).click();
        await panel.getByRole('button',{name:'Editar a Elena Ramírez',exact:true}).waitFor();
        assert.equal(escrituras.filter(e=>e.ruta==='recepcion/pacientes').length,antes+1);
    }finally{fallarProximaCarga=false;await context.close();}
});

test('nombres y apellidos bloquean números al escribir y pegar; aceptan tildes y ñ',async()=>{
    const {context,page}=await entrar('ADMINISTRACION');try{
        await page.waitForURL('**/personal/administracion.html');const panel=page.locator('panel-recepcion');
        const nombres=panel.getByLabel('Nombres',{exact:true});const apellidos=panel.getByLabel('Apellidos',{exact:true});
        await nombres.pressSequentially('Ana123');assert.equal(await nombres.inputValue(),'Ana');
        await apellidos.fill('Peña');
        assert.equal(await apellidos.evaluate(campo=>{
            const portapapeles=new DataTransfer();portapapeles.setData('text','López99');
            const evento=new ClipboardEvent('paste',{clipboardData:portapapeles,cancelable:true,bubbles:true});campo.dispatchEvent(evento);return evento.defaultPrevented;
        }),true);
        assert.equal(await apellidos.inputValue(),'Peña');
        await nombres.fill('María José');await panel.getByLabel('Fecha de nacimiento',{exact:true}).fill('2000-01-01');
        const antes=escrituras.length;
        for(const campo of [nombres,apellidos]){
            const original=await campo.inputValue();await campo.evaluate(c=>{c.value='Ana123';});
            assert.equal(await panel.locator('#paciente').evaluate(f=>f.checkValidity()),false);
            await panel.getByRole('button',{name:'Guardar paciente',exact:true}).click();
            assert.equal(escrituras.length,antes);await campo.fill(original);
        }
        assert.equal(await panel.locator('#paciente').evaluate(f=>f.checkValidity()),true);
        await panel.getByLabel('Fecha de nacimiento',{exact:true}).fill('3000-01-01');
        assert.equal(await panel.locator('#paciente').evaluate(f=>f.checkValidity()),false);
    }finally{await context.close();}
});

test('los catálogos rechazan nombres vacíos y respetan los tamaños de sus campos',async()=>{
    const {context,page}=await entrar('ADMINISTRACION');try{
        await page.waitForURL('**/personal/administracion.html');
        await page.locator('navegacion-personal').getByRole('tab',{name:/Roles/}).click();
        const panel=page.locator('panel-catalogo-simple');await panel.getByRole('button',{name:/Nuevo/}).click();
        const campo=panel.locator('[name="nombre"]');await campo.fill('   ');
        const antes=escrituras.length;await panel.getByRole('button',{name:/Guardar/}).click();
        assert.equal(await campo.evaluate(c=>c.validity.customError),true);assert.equal(escrituras.length,antes);
        await campo.fill('Rol 2');assert.equal(await campo.evaluate(c=>c.checkValidity()),true);
        assert.equal(await campo.getAttribute('maxlength'),'155');
        assert.equal(await panel.locator('[name="observaciones"]').getAttribute('maxlength'),'255');
    }finally{await context.close();}
});

test('el login rechaza una contraseña vacía o compuesta solo por espacios',async()=>{
    const context=await browser.newContext();const page=await context.newPage();try{
        await page.goto(base);await page.getByLabel('Usuario o correo electrónico').fill('ADMINISTRACION');
        await page.getByLabel('Contraseña',{exact:true}).fill('   ');
        await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
        await page.locator('#password-error').getByText('Escribe tu contraseña.',{exact:true}).waitFor();
        assert.equal(new URL(page.url()).pathname,'/');
    }finally{await context.close();}
});
