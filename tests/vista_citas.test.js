import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, conectar, desconectar } from './dobles/dom_minimo.js';
import { MemoriaVistas } from '../src/js/boundary/vistas/memoria_vistas.js';

// Datos inventados; nunca datos reales de pacientes.
const UUID = n => `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DUI = Object.freeze({ idTipoDocumento: UUID(1), nombre: 'DUI', indicaciones: 'Ocho dígitos, guion y un dígito.', expresionRegular: '^[0-9]{8}-[0-9]$' });
const NORTE = Object.freeze({ idClinica: UUID(10), nombre: 'Clínica Prueba Norte' });
const SUR = Object.freeze({ idClinica: UUID(20), nombre: 'Clínica Prueba Sur' });
const cita = n => Object.freeze({ idConsulta: UUID(30 + n), fechaInicio: '2026-11-12T08:00:00-06:00', nombreClinica: NORTE.nombre, procedimientos: Object.freeze(['Consulta general']) });
const NUMERO = '12345678-9';
const AHORA = Date.UTC(2026, 10, 13, 15, 30);
const asentar = () => new Promise(resolve => setTimeout(resolve, 0));

let VistaCitas;
let ControladorCitas;
const ubicacion = { hash: '#/citas' };
before(async () => {
    instalarDom();
    globalThis.location = ubicacion;
    globalThis.history = { pushState() { throw new Error('la búsqueda no debe tocar el historial'); },
        replaceState() { throw new Error('la búsqueda no debe tocar el historial'); } };
    ({ default: VistaCitas } = await import('../src/js/boundary/vistas/vista_citas.js'));
    ({ ControladorCitas } = await import('../src/js/boundary/vistas/controlador_citas.js'));
});
after(() => { delete globalThis.location; delete globalThis.history; });

function montar({ clinicas = [NORTE, SUR], citas = [cita(1), cita(2)], enLinea = true, memoria = new MemoriaVistas() } = {}) {
    const llamadas = { clinicas: 0, citas: 0, ticket: 0 };
    const controlador = new ControladorCitas({
        servicio: {
            clinicas: async documento => { llamadas.clinicas++; llamadas.documentoClinicas = documento; return clinicas; },
            citas: async (documento, criterios) => { llamadas.citas++; llamadas.criterios = { documento, ...criterios }; return citas; },
            ticket: async id => { llamadas.ticket++; return { blob: new Blob(['%PDF']), nombre: `ticket-cita-${id.slice(0, 8)}.pdf` }; },
        },
        listarTiposDocumento: async () => [DUI],
        conexion: { enLinea, suscribir: () => () => {} },
        memoria,
        reloj: () => new Date(AHORA),
        temporizador: { programar: () => null, cancelar: () => {} },
    });
    const espia = { repintes: [], detenido: 0, cancelados: 0 };
    const suscribir = controlador.suscribir;
    controlador.suscribir = fn => {
        const cancelar = suscribir((cambios, estado) => { espia.repintes.push(new Set(cambios)); fn(cambios, estado); });
        return () => { espia.cancelados++; cancelar(); };
    };
    const detener = controlador.detener.bind(controlador);
    controlador.detener = () => { espia.detenido++; detener(); };
    const vista = new VistaCitas();
    vista.controlador = controlador;
    const $ = id => vista.shadowRoot.getElementById(id);
    const enviar = () => $('form-busqueda').dispatchEvent(new Event('submit', { cancelable: true }));
    return { vista, controlador, estado: controlador.estado, espia, llamadas, $, enviar };
}

async function llenarFiltros(ctx) {
    const { $, enviar } = ctx;
    conectar(ctx.vista);
    await asentar();
    $('tipo').value = DUI.idTipoDocumento;
    $('tipo').dispatchEvent(new Event('change'));
    $('numero').value = NUMERO;
    $('numero').dispatchEvent(new Event('input'));
    $('numero').dispatchEvent(new Event('change'));
    await asentar();
    $('clinica').value = NORTE.idClinica;
    $('clinica').dispatchEvent(new Event('change'));
    enviar();
    await asentar();
}

describe('<vista-citas>: barra y resultados', () => {
    test('muestra todos los filtros juntos y gestiona conexión reactiva', async () => {
        const ctx = montar();
        conectar(ctx.vista);
        assert.ok(ctx.$('form-busqueda'));
        for (const id of ['tipo', 'numero', 'clinica', 'desde', 'hasta', 'buscar']) assert.ok(ctx.$(id), `${id} visible en la barra`);
        assert.equal(ctx.$('resultados').hidden, true, 'no muestra una lista vacía antes de buscar');
        await asentar();
        assert.deepEqual(ctx.$('tipo').querySelectorAll('option').map(o => o.value), ['', DUI.idTipoDocumento]);
        ctx.$('tipo').value = DUI.idTipoDocumento;
        ctx.$('tipo').dispatchEvent(new Event('change'));
        await asentar();
        assert.equal(ctx.$('numero-indicaciones').textContent, DUI.indicaciones);
        desconectar(ctx.vista);
        assert.equal(ctx.espia.cancelados, 1);
        assert.equal(ctx.espia.detenido, 1);
    });

    test('carga clínicas para el documento y manda todos los filtros en una búsqueda', async () => {
        const ctx = montar();
        await llenarFiltros(ctx);
        assert.deepEqual(ctx.llamadas.documentoClinicas, { idTipoDocumento: DUI.idTipoDocumento, numeroDocumento: NUMERO });
        assert.equal(ctx.llamadas.citas, 1);
        assert.deepEqual(ctx.llamadas.criterios, {
            documento: { idTipoDocumento: DUI.idTipoDocumento, numeroDocumento: NUMERO },
            idClinica: NORTE.idClinica, desde: ctx.estado.desde, hasta: ctx.estado.hasta,
        });
        const tarjetas = ctx.vista.children.filter(h => h.localName === 'tarjeta-cita');
        assert.equal(tarjetas.length, 2);
        assert.ok(tarjetas.every(t => t.slot === 'resultados'));
        assert.equal(tarjetas[0].modelo.cita.idConsulta, UUID(31));
        assert.ok(ctx.vista.shadowRoot.querySelector('slot[name="resultados"]'));
    });

    test('requiere elegir una clínica cuando el documento tiene más de una', async () => {
        const ctx = montar();
        conectar(ctx.vista);
        await asentar();
        ctx.$('tipo').value = DUI.idTipoDocumento;
        ctx.$('tipo').dispatchEvent(new Event('change'));
        ctx.$('numero').value = NUMERO;
        ctx.$('numero').dispatchEvent(new Event('input'));
        ctx.$('numero').dispatchEvent(new Event('change'));
        await asentar();
        assert.equal(ctx.$('clinica').querySelectorAll('option').length, 3);
        ctx.enviar();
        await asentar();
        assert.equal(ctx.estado.errores.clinica, 'Selecciona una clínica.');
        assert.equal(ctx.llamadas.citas, 0);
    });

    test('una sola clínica se preselecciona y muestra el mensaje de lista vacía', async () => {
        const ctx = montar({ clinicas: [NORTE], citas: [] });
        await llenarFiltros(ctx);
        assert.equal(ctx.estado.idClinica, NORTE.idClinica);
        assert.equal(ctx.$('sin-citas').hidden, false);
        assert.equal(ctx.$('sin-citas-texto').textContent, 'No hay citas en ese rango de fechas.');
    });

    test('al limpiar borra filtros y resultados sin tocar la URL', async () => {
        const ctx = montar();
        await llenarFiltros(ctx);
        ctx.$('nueva').click();
        await asentar();
        assert.equal(ctx.estado.numeroDocumento, '');
        assert.equal(ctx.estado.clinicas, null);
        assert.equal(ctx.estado.citas, null);
        assert.equal(ubicacion.hash, '#/citas');
        assert.equal(ctx.vista.children.filter(h => h.localName === 'tarjeta-cita').length, 0);
    });

    test('valida formato y rango sin enviar solicitudes incompletas', async () => {
        const ctx = montar();
        conectar(ctx.vista);
        await asentar();
        ctx.$('tipo').value = DUI.idTipoDocumento;
        ctx.$('tipo').dispatchEvent(new Event('change'));
        ctx.$('numero').value = '123';
        ctx.$('numero').dispatchEvent(new Event('input'));
        ctx.enviar();
        await asentar();
        assert.match(ctx.$('numero-error').textContent, /formato de DUI/);
        assert.equal(ctx.llamadas.clinicas, 0);
        assert.equal(ctx.$('numero').getAttribute('aria-invalid'), 'true');
    });

    test('mantiene el documento fuera de la URL y descarga el ticket PDF de una tarjeta', async () => {
        const urlOriginal = { crear: URL.createObjectURL, revocar: URL.revokeObjectURL };
        const creadas = [];
        const revocadas = [];
        URL.createObjectURL = blob => { creadas.push(blob); return 'blob:prueba/1'; };
        URL.revokeObjectURL = url => revocadas.push(url);
        const crear = document.createElement;
        const anclas = [];
        document.createElement = tag => {
            const el = crear(tag);
            if (tag === 'a') { anclas.push(el); el.addEventListener('click', () => { el.pulsadoConectado = Boolean(el.parentNode); }); }
            return el;
        };
        try {
            const ctx = montar();
            await llenarFiltros(ctx);
            assert.equal(ubicacion.hash, '#/citas');
            assert.ok(!ubicacion.hash.includes(NUMERO));
            const tarjeta = ctx.vista.children.find(h => h.localName === 'tarjeta-cita');
            tarjeta.dispatchEvent(new CustomEvent('descargar-ticket', { detail: { idConsulta: UUID(31) } }));
            await asentar();
            await asentar();
            assert.equal(ctx.llamadas.ticket, 1);
            assert.ok(creadas[0] instanceof Blob);
            assert.equal(anclas[0].href, 'blob:prueba/1');
            assert.equal(anclas[0].download, 'ticket-cita-60000000.pdf');
            assert.equal(anclas[0].pulsadoConectado, true);
            assert.deepEqual(revocadas, ['blob:prueba/1']);
            assert.equal(ctx.estado.tickets[UUID(31)].estado, 'entregado');
        } finally {
            URL.createObjectURL = urlOriginal.crear;
            URL.revokeObjectURL = urlOriginal.revocar;
            document.createElement = crear;
        }
    });

    test('muestra error de ticket y conserva las tarjetas en la búsqueda sin conexión', async () => {
        const memoria = new MemoriaVistas();
        const primera = montar({ memoria });
        await llenarFiltros(primera);
        primera.controlador.descargarTicket = async id => {
            primera.estado.tickets = Object.freeze({ [id]: Object.freeze({ estado: 'error', error: 'No pudimos generar el ticket de esta cita.' }) });
        };
        const tarjeta = primera.vista.children.find(h => h.localName === 'tarjeta-cita');
        tarjeta.dispatchEvent(new CustomEvent('descargar-ticket', { detail: { idConsulta: UUID(31) } }));
        await asentar();
        assert.equal(tarjeta.modelo.ticket.error, 'No pudimos generar el ticket de esta cita.');
        desconectar(primera.vista);

        const sinRed = montar({ memoria, enLinea: false });
        conectar(sinRed.vista);
        await asentar();
        assert.equal(sinRed.$('aviso-memoria').textContent, 'Sin conexión. Mostrando la búsqueda de las 09:30.');
        assert.equal(sinRed.vista.children.filter(h => h.localName === 'tarjeta-cita').length, 2);
        assert.equal(sinRed.$('buscar').disabled, true);
        desconectar(sinRed.vista);
    });
});
