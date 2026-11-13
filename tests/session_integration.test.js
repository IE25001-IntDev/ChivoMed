import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { verificarSesionActual, obtenerSesion, fijarSesionVista } from '../src/js/control/auth_service.js';
import DefaultService from '../src/js/control/default_service.js';
const originalFetch = globalThis.fetch;
/** Servicio de subcolección como los que crea relacionados(): recibe un único objeto de opciones. */
class Subcoleccion extends DefaultService { constructor(opciones) { super(opciones.recurso, null, opciones); } }
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const sesion = codigo => ({ usuario: { idUsuario: id(1), idPersona: id(2), nombres: 'Persona', apellidos: 'Prueba' },
    rolActivo: { codigo, idPersonaRol: id(3), idClinica: id(4), nombreClinica: 'Clínica de prueba' }, csrfToken: 'csrf-prueba' });
afterEach(() => { globalThis.fetch = originalFetch; fijarSesionVista(null); });
test('las escrituras anidadas conservan la verificación de sesión y el token CSRF', async () => {
    let comprobaciones=0;
    // relacionados() crea el servicio de la subcolección; debe heredar autenticar y fetchImpl del padre.
    const consultas = new DefaultService('consultas', null, { autenticar: async () => { comprobaciones++; return sesion('DOCTOR'); }, fetchImpl: async (url, opciones) => {
        assert.ok(url.endsWith(`/consultas/${id(2)}/procedimientos`)); assert.equal(opciones.headers.get('X-CSRF-Token'),'csrf-prueba');
        assert.equal(opciones.credentials,'include'); assert.equal(opciones.cache,'no-store');
        return Response.json({idConsultaProcedimiento:id(7)}, {status:201});
    } });
    await consultas.relacionados(id(2), 'procedimientos', Subcoleccion, ['POST']).crear({idProcedimiento:id(8)});
    assert.equal(comprobaciones,1);
});
test('un cambio de cuenta en otra pestaña impide guardar incluso al volver a intentar', async () => {
    const original=sesion('DOCTOR'); globalThis.fetch=async () => Response.json(original);
    fijarSesionVista(await obtenerSesion());
    const otra={...original,usuario:{...original.usuario,idUsuario:id(9)}};
    globalThis.fetch=async () => Response.json(otra);
    for(let intento=0;intento<2;intento++) await assert.rejects(verificarSesionActual(),{status:409});
});
test('la sesión vencida bloquea la escritura antes de enviarla', async () => {
    const servicio=new DefaultService('consultas',null,{autenticar:async()=>{throw Object.assign(new Error('Sesión finalizada'),{status:401});},fetchImpl:()=>assert.fail('No debe guardar')});
    await assert.rejects(servicio.modificar(id(1),{observaciones:'Nota'}),{status:401});
});
