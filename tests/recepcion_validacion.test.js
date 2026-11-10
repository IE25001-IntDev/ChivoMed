import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import RecepcionService from '../src/js/control/recepcion_service.js';
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sesion={usuario:{idUsuario:id(1),idPersona:id(2),nombres:'Secretaría',apellidos:'Prueba'},rolActivo:{idPersonaRol:id(3),idClinica:id(4),codigo:'ADMINISTRACION',nombreClinica:'Clínica de prueba'},csrfToken:'csrf-prueba'};
const datos={nombres:'María José',apellidos:'Muñoz de León',fechaNacimiento:'2000-01-01T00:00:00.000Z'};
test('nombres y apellidos inválidos no consultan ni escriben datos, al registrar y editar',async()=>{
    globalThis.fetch=()=>assert.fail('No debe consultar la sesión para datos inválidos');
    const servicio=new RecepcionService({fetchImpl:()=>assert.fail('No debe guardar')});
    for(const campo of ['nombres','apellidos']) for(const valor of ['Ana1','123','Peña٢','Ana@','Ana-María','Ana_María','   ','x'.repeat(256)]) {
        for(const persona of [undefined,id(8)]) await assert.rejects(servicio.guardarPaciente(sesion,{...datos,[campo]:valor},persona),/solo admiten letras/);
    }
});
test('fechas imposibles, vacías y futuras no se envían al servidor',async()=>{
    globalThis.fetch=()=>assert.fail('No debe consultar la sesión');
    const servicio=new RecepcionService();
    for(const fechaNacimiento of ['',null,'no-es-fecha','2000-02-30T00:00:00.000Z','3000-01-01T00:00:00.000Z']) {
        await assert.rejects(servicio.guardarPaciente(sesion,{...datos,fechaNacimiento}),/fecha de nacimiento/);
    }
});
test('se conservan letras, tildes, ñ y nombres compuestos válidos',async()=>{
    globalThis.fetch=async()=>Response.json(sesion);
    const envios=[];
    const servicio=new RecepcionService({fetchImpl:async(url,opciones)=>{envios.push({url,datos:JSON.parse(opciones.body)});return Response.json({idPersona:id(7)}, {status:201});}});
    for(const nombres of ['María José','Iñaki','José\u0301','李 明']) await servicio.guardarPaciente(sesion,{...datos,nombres});
    assert.deepEqual(envios.map(e=>e.datos.nombres),['María José','Iñaki','José\u0301','李 明']);
    assert.ok(envios.every(e=>e.url.endsWith('/recepcion/pacientes')));
});
