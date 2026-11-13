import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import AtencionService from '../src/js/control/atencion_service.js';
import ConsultaProcedimientoPasoService from '../src/js/control/consulta_procedimiento_paso_service.js';
import OrdenExamen from '../src/js/entities/orden_examen.js';

// Datos inventados; nunca datos reales de pacientes ni de personal.
const UUID = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const BASE = 'http://api.prueba/galenosv/api';

function fetchDoble(respuesta) {
    const peticiones = [];
    const fetchImpl = async (url, opciones) => {
        peticiones.push({ url, opciones });
        return typeof respuesta === 'function' ? respuesta(url, opciones) : respuesta.clone();
    };
    return { peticiones, fetchImpl };
}

const opciones = fetchImpl => ({ baseUrl: BASE, fetchImpl, autenticar: async () => ({ csrfToken: 'csrf-prueba' }) });

describe('AtencionService.consulta (HU4, contrato B6)', () => {
    test('pide GET /atencion/consultas/{id} y devuelve el elemento plano, sin CSRF', async () => {
        const dto = { idConsulta: UUID(1), fechaInicio: '2026-11-13T08:00:00-06:00', fechaFin: null, procedimientos: [] };
        const { peticiones, fetchImpl } = fetchDoble(Response.json(dto));
        const respuesta = await new AtencionService(opciones(fetchImpl)).consulta(UUID(1));
        assert.equal(peticiones[0].url, `${BASE}/atencion/consultas/${UUID(1)}`);
        assert.equal(peticiones[0].opciones.method, 'GET');
        assert.equal(peticiones[0].opciones.headers.has('X-CSRF-Token'), false);
        assert.deepEqual(respuesta.data, dto);
        assert.equal(Object.getPrototypeOf(respuesta.data), Object.prototype);
    });

    test('codifica el id y rechaza uno vacío', async () => {
        const { peticiones, fetchImpl } = fetchDoble(Response.json({}));
        const servicio = new AtencionService(opciones(fetchImpl));
        await servicio.consulta('a/b');
        assert.match(peticiones[0].url, /consultas\/a%2Fb$/);
        assert.throws(() => servicio.consulta(''), TypeError);
    });
});

describe('ConsultaProcedimientoPasoService (HU4)', () => {
    test('retroceder() hace PUT …/retroceso sin cuerpo, con CSRF, y devuelve el paso reabierto', async () => {
        const dto = { idConsultaProcedimientoPaso: UUID(2), estado: 'PENDIENTE', valor: 'Registro de prueba' };
        const { peticiones, fetchImpl } = fetchDoble(Response.json(dto));
        const respuesta = await new ConsultaProcedimientoPasoService(opciones(fetchImpl)).retroceder(UUID(3));
        assert.equal(peticiones[0].url, `${BASE}/consultas-procedimientos-pasos/${UUID(3)}/retroceso`);
        assert.equal(peticiones[0].opciones.method, 'PUT');
        assert.equal(peticiones[0].opciones.body, undefined);
        assert.equal(peticiones[0].opciones.headers.get('X-CSRF-Token'), 'csrf-prueba');
        assert.equal(respuesta.data.valor, 'Registro de prueba');
    });

    test('un 409 del retroceso llega con su code y su message', async () => {
        const { fetchImpl } = fetchDoble(Response.json({ code: 'consulta.retrocesoPrimerPaso', message: 'Es el primer paso.' }, { status: 409 }));
        await assert.rejects(new ConsultaProcedimientoPasoService(opciones(fetchImpl)).retroceder(UUID(3)),
            error => error.status === 409 && error.code === 'consulta.retrocesoPrimerPaso' && error.message === 'Es el primer paso.');
    });

    test('examenesAsignables() pide GET …/examenes-asignables y devuelve los DTO planos', async () => {
        const dto = [{ idExamen: UUID(4), nombre: 'Examen de prueba' }];
        const { peticiones, fetchImpl } = fetchDoble(Response.json(dto));
        const respuesta = await new ConsultaProcedimientoPasoService(opciones(fetchImpl)).examenesAsignables(UUID(3));
        assert.equal(peticiones[0].url, `${BASE}/consultas-procedimientos-pasos/${UUID(3)}/examenes-asignables`);
        assert.equal(peticiones[0].opciones.method, 'GET');
        assert.deepEqual(respuesta.data, dto);
    });

    test('ordenar() manda el paso, el examen y las indicaciones recortadas', async () => {
        const dto = { idOrdenExamen: UUID(5), idConsultaProcedimientoPaso: UUID(3), idExamen: UUID(4), indicaciones: 'En ayunas', fechaCreacion: null };
        const { peticiones, fetchImpl } = fetchDoble(Response.json(dto, { status: 201 }));
        const respuesta = await new ConsultaProcedimientoPasoService(opciones(fetchImpl))
            .ordenar(UUID(3), { idExamen: UUID(4), indicaciones: '  En ayunas ' });
        assert.equal(peticiones[0].url, `${BASE}/consultas-procedimientos-pasos/${UUID(3)}/ordenes-examen`);
        assert.equal(peticiones[0].opciones.method, 'POST');
        assert.equal(peticiones[0].opciones.headers.get('X-CSRF-Token'), 'csrf-prueba');
        assert.deepEqual(JSON.parse(peticiones[0].opciones.body),
            { idConsultaProcedimientoPaso: UUID(3), idExamen: UUID(4), indicaciones: 'En ayunas' });
        assert.ok(respuesta.data instanceof OrdenExamen);
        assert.equal(respuesta.data.idExamen, UUID(4));
    });

    test('ordenar() sin indicaciones no envía el campo (son opcionales con examen)', async () => {
        for (const indicaciones of [undefined, '', '   ']) {
            const { peticiones, fetchImpl } = fetchDoble(Response.json({}, { status: 201 }));
            await new ConsultaProcedimientoPasoService(opciones(fetchImpl)).ordenar(UUID(3), { idExamen: UUID(4), indicaciones });
            assert.deepEqual(JSON.parse(peticiones[0].opciones.body), { idConsultaProcedimientoPaso: UUID(3), idExamen: UUID(4) });
        }
    });

    test('las órdenes listadas conservan idExamen, y es null en las anteriores a B5', async () => {
        const { fetchImpl } = fetchDoble(Response.json([
            { idOrdenExamen: UUID(6), idExamen: UUID(4), indicaciones: null },
            { idOrdenExamen: UUID(7), indicaciones: 'Orden antigua' },
        ]));
        const { data } = await new ConsultaProcedimientoPasoService(opciones(fetchImpl)).ordenesExamen(UUID(3)).listar();
        assert.equal(data[0].idExamen, UUID(4));
        assert.equal(data[1].idExamen, null);
    });
});
