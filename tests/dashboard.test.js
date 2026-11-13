import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import AtencionService from '../src/js/control/atencion_service.js';
import DefaultError from '../src/js/entities/default_error.js';

// Datos inventados; nunca datos reales de pacientes ni de personal.
const UUID = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Doble de fetch que registra cada petición y responde con `respuesta`. */
function fetchDoble(respuesta) {
    const peticiones = [];
    const fetchImpl = async (url, opciones) => {
        peticiones.push({ url, opciones });
        return typeof respuesta === 'function' ? respuesta(url, opciones) : respuesta.clone();
    };
    return { peticiones, fetchImpl };
}

describe('AtencionService', () => {
    const base = { baseUrl: 'http://api.prueba/galenosv/api', autenticar: async () => ({ csrfToken: 'csrf-prueba' }) };

    test('asignaciones() pide GET /atencion/asignaciones y devuelve los DTO planos', async () => {
        const dto = { idPersonaRol: UUID(1), codigoRol: 'DOCTOR', nombreRol: 'Doctor', idClinica: UUID(2), nombreClinica: 'Clínica Prueba Norte', activa: true };
        const { peticiones, fetchImpl } = fetchDoble(Response.json([dto]));
        const respuesta = await new AtencionService({ ...base, fetchImpl }).asignaciones();
        assert.equal(peticiones[0].url, 'http://api.prueba/galenosv/api/atencion/asignaciones');
        assert.equal(peticiones[0].opciones.method, 'GET');
        assert.equal(peticiones[0].opciones.headers.has('X-CSRF-Token'), false, 'un GET no envía CSRF');
        assert.deepEqual(respuesta.data, [dto]);
        assert.equal(Object.getPrototypeOf(respuesta.data[0]), Object.prototype, 'no se convierte a la entidad Atencion');
    });

    test('cambiarRol() hace PUT /atencion/rol-activo con { idPersonaRol } y el token CSRF', async () => {
        const { peticiones, fetchImpl } = fetchDoble(Response.json({ idPersonaRol: UUID(3), idConsulta: null }));
        await new AtencionService({ ...base, fetchImpl }).cambiarRol(UUID(3));
        assert.equal(peticiones[0].url, 'http://api.prueba/galenosv/api/atencion/rol-activo');
        assert.equal(peticiones[0].opciones.method, 'PUT');
        assert.equal(peticiones[0].opciones.headers.get('X-CSRF-Token'), 'csrf-prueba');
        assert.deepEqual(JSON.parse(peticiones[0].opciones.body), { idPersonaRol: UUID(3) });
    });

    test('el 409 de una consulta en curso llega como DefaultError con su code y mensaje', async () => {
        const cuerpo = { code: 'rolCambio.cerrarAntesCambiar', message: 'Cierre la consulta antes de cambiar de médico o rol.' };
        const { fetchImpl } = fetchDoble(Response.json(cuerpo, { status: 409 }));
        await assert.rejects(new AtencionService({ ...base, fetchImpl }).cambiarRol(UUID(3)), error =>
            error instanceof DefaultError && error.status === 409 && error.code === cuerpo.code && error.message === cuerpo.message);
    });
});
