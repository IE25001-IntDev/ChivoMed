import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import CitasPublicasService, { segundosDeEspera, nombreDeArchivo } from '../src/js/control/citas_publicas_service.js';
import DefaultError from '../src/js/entities/default_error.js';

// Datos inventados; nunca datos reales de pacientes.
const UUID = n => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NUMERO = '12345678-9';
const DOC = { idTipoDocumento: UUID(1), numeroDocumento: `  ${NUMERO} ` };
const json = (cuerpo, status = 200, headers = {}) => new Response(JSON.stringify(cuerpo),
    { status, headers: { 'Content-Type': 'application/json', ...headers } });

function preparar(responder) {
    const llamadas = [];
    const servicio = new CitasPublicasService({
        baseUrl: '/galenosv/api',
        fetchImpl: async (url, opts) => { llamadas.push({ url, opts, cuerpo: opts.body ? JSON.parse(opts.body) : undefined }); return responder(url, opts); },
    });
    return { servicio, llamadas };
}

describe('CitasPublicasService: rutas y cuerpos', () => {
    test('clinicas: POST publico/clinicas con el número recortado solo en el cuerpo', async () => {
        const { servicio, llamadas } = preparar(() => json([{ idClinica: UUID(10), nombre: 'Clínica Prueba' }]));
        const clinicas = await servicio.clinicas(DOC);
        assert.deepEqual(clinicas, [{ idClinica: UUID(10), nombre: 'Clínica Prueba' }]);
        assert.ok(Object.isFrozen(clinicas) && Object.isFrozen(clinicas[0]));
        const [{ url, opts, cuerpo }] = llamadas;
        assert.equal(opts.method, 'POST');
        assert.equal(url, '/galenosv/api/publico/clinicas');
        assert.deepEqual(cuerpo, { idTipoDocumento: UUID(1), numeroDocumento: NUMERO });
        assert.ok(!url.includes(NUMERO));
    });

    test('citas: POST publico/citas con clínica y rango; normaliza y congela', async () => {
        const cita = { idConsulta: UUID(20), fechaInicio: '2026-11-12T08:00:00-06:00', nombreClinica: 'Clínica Prueba', procedimientos: ['Consulta general'] };
        const { servicio, llamadas } = preparar(() => json([cita, { idConsulta: 'no-uuid' }, null]));
        const citas = await servicio.citas(DOC, { idClinica: UUID(10), desde: '2026-11-01', hasta: '2026-11-30' });
        assert.deepEqual(citas, [cita], 'se descartan las entradas incompletas');
        assert.ok(Object.isFrozen(citas[0].procedimientos));
        assert.equal(llamadas[0].url, '/galenosv/api/publico/citas');
        assert.deepEqual(llamadas[0].cuerpo, { idTipoDocumento: UUID(1), numeroDocumento: NUMERO,
            idClinica: UUID(10), desde: '2026-11-01', hasta: '2026-11-30' });
        assert.ok(!llamadas[0].url.includes(NUMERO));
    });

    test('no envía CSRF ni consulta auth/me (ruta pública)', async () => {
        const { servicio, llamadas } = preparar(() => json([]));
        assert.equal(servicio.autenticar, null);
        await servicio.clinicas(DOC);
        assert.equal(llamadas.length, 1, 'una sola petición: sin auth/me');
        assert.equal(llamadas[0].opts.headers.has('X-CSRF-Token'), false);
    });
});

describe('CitasPublicasService: ticket', () => {
    test('lee el PDF como Blob y toma el nombre de Content-Disposition', async () => {
        const { servicio, llamadas } = preparar(() => new Response(new Uint8Array([0x25, 0x50]), { status: 200, headers: {
            'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="ticket-cita-30000000.pdf"' } }));
        const ticket = await servicio.ticket(UUID(20), DOC);
        assert.ok(ticket.blob instanceof Blob);
        assert.equal(ticket.nombre, 'ticket-cita-30000000.pdf');
        assert.equal(llamadas[0].url, `/galenosv/api/publico/citas/${UUID(20)}/ticket`);
        assert.deepEqual(llamadas[0].cuerpo, { idTipoDocumento: UUID(1), numeroDocumento: NUMERO });
        assert.match(llamadas[0].opts.headers.get('Accept'), /application\/pdf/);
    });

    test('sin Content-Disposition usa ticket-cita-<8>.pdf', async () => {
        const { servicio } = preparar(() => new Response(new Uint8Array([1]), { status: 200, headers: { 'Content-Type': 'application/pdf' } }));
        assert.equal((await servicio.ticket(UUID(20), DOC)).nombre, 'ticket-cita-30000000.pdf');
    });

    test('una respuesta que no es PDF es un error', async () => {
        const { servicio } = preparar(() => new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
        await assert.rejects(servicio.ticket(UUID(20), DOC), e => e instanceof DefaultError && e.code === 'respuesta.invalida');
    });

    test('404 cita.noExiste llega como DefaultError, sin el número en mensaje ni ruta', async () => {
        const { servicio } = preparar(() => json({ status: 404, code: 'cita.noExiste', message: 'No encontramos esa cita para el documento indicado.' }, 404));
        await assert.rejects(servicio.ticket(UUID(20), DOC), e => e.status === 404 && e.code === 'cita.noExiste'
            && !e.message.includes(NUMERO) && !String(e.path).includes(NUMERO));
    });

    test('nombreDeArchivo descarta rutas y caracteres raros', () => {
        assert.equal(nombreDeArchivo('attachment; filename="../../x.pdf"', UUID(20)), 'x.pdf');
        assert.equal(nombreDeArchivo('attachment', UUID(20)), 'ticket-cita-30000000.pdf');
        assert.equal(nombreDeArchivo(undefined, UUID(20)), 'ticket-cita-30000000.pdf');
    });
});

describe('CitasPublicasService: límite de solicitudes', () => {
    test('429 publico.demasiadasSolicitudes conserva Retry-After', async () => {
        const { servicio } = preparar(() => json({ code: 'publico.demasiadasSolicitudes', message: 'Espere.' }, 429, { 'Retry-After': '120' }));
        const error = await servicio.clinicas(DOC).catch(e => e);
        assert.equal(error.status, 429);
        assert.equal(error.code, 'publico.demasiadasSolicitudes');
        assert.equal(segundosDeEspera(error), 120);
    });

    test('segundosDeEspera usa 300 si falta o no es válido', () => {
        assert.equal(segundosDeEspera({ headers: {} }), 300);
        assert.equal(segundosDeEspera({ headers: { 'retry-after': 'mañana' } }), 300);
        assert.equal(segundosDeEspera(null), 300);
    });
});
