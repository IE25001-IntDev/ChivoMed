import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, conectar, desconectar } from './dobles/dom_minimo.js';
import { MemoriaVistas } from '../src/js/boundary/vistas/memoria_vistas.js';
import DefaultError from '../src/js/entities/default_error.js';

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
    globalThis.history = { pushState() { throw new Error('el asistente no debe tocar el historial'); },
        replaceState() { throw new Error('el asistente no debe tocar el historial'); } };
    ({ default: VistaCitas } = await import('../src/js/boundary/vistas/vista_citas.js'));
    ({ ControladorCitas } = await import('../src/js/boundary/vistas/controlador_citas.js'));
});
after(() => { delete globalThis.location; delete globalThis.history; });

function montar({ clinicas = [NORTE, SUR], citas = [cita(1), cita(2)], enLinea = true, memoria = new MemoriaVistas() } = {}) {
    const llamadas = { clinicas: 0, citas: 0, ticket: 0 };
    const respuestas = {
        ticket: async id => ({ blob: new Blob(['%PDF']), nombre: `ticket-cita-${id.slice(0, 8)}.pdf` }),
    };
    const controlador = new ControladorCitas({
        servicio: {
            clinicas: async () => { llamadas.clinicas++; return clinicas; },
            citas: async () => { llamadas.citas++; return citas; },
            ticket: async (id, doc) => { llamadas.ticket++; return respuestas.ticket(id, doc); },
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
    const enviar = n => $(`form-${n}`).dispatchEvent(new Event('submit', { cancelable: true }));
    return { vista, controlador, estado: controlador.estado, espia, llamadas, respuestas, $, enviar };
}

/** Hasta el paso 5 con DUI, el número inventado y la clínica Norte. */
async function hastaResultados(ctx) {
    const { vista, $, enviar } = ctx;
    conectar(vista);
    await asentar();
    $('tipo').value = DUI.idTipoDocumento;
    $('tipo').dispatchEvent(new Event('change'));
    enviar(1);
    await asentar();
    $('numero').value = NUMERO;
    $('numero').dispatchEvent(new Event('input'));
    enviar(2);
    await asentar();
    const radio = vista.shadowRoot.querySelectorAll('input[name="clinica"]').find(r => r.value === NORTE.idClinica);
    radio.checked = true;
    $('clinicas').dispatchEvent(new Event('change'));
    enviar(3);
    await asentar();
    enviar(4);
    await asentar();
}

const visible = (ctx, n) => !ctx.$(`paso-${n}`).hidden;

describe('<vista-citas>: suscripción y pintado', () => {
    test('al conectarse se suscribe, pinta el paso 1 y los tipos; al desconectarse cancela y detiene', async () => {
        const ctx = montar();
        conectar(ctx.vista);
        assert.equal(visible(ctx, 1), true);
        for (const n of [2, 3, 4, 5]) assert.equal(visible(ctx, n), false, `paso ${n} oculto`);
        await asentar();
        const opciones = ctx.$('tipo').querySelectorAll('option');
        assert.deepEqual(opciones.map(o => o.value), ['', DUI.idTipoDocumento]);
        assert.equal(opciones[1].textContent, 'DUI');
        desconectar(ctx.vista);
        assert.equal(ctx.espia.cancelados, 1);
        assert.equal(ctx.espia.detenido, 1);
    });

    test('repinta a partir de las claves que cambiaron (un lote por acción)', async () => {
        const ctx = montar();
        conectar(ctx.vista);
        await asentar();
        ctx.espia.repintes.length = 0;
        ctx.$('tipo').value = DUI.idTipoDocumento;
        ctx.$('tipo').dispatchEvent(new Event('change'));
        await asentar();
        assert.equal(ctx.espia.repintes.length, 1);
        assert.ok(ctx.espia.repintes[0].has('idTipoDocumento'));
        assert.equal(ctx.$('numero-indicaciones').textContent, DUI.indicaciones);
    });

    test('slots: <indicador-pasos slot="pasos"> y una <tarjeta-cita slot="resultados"> por cita', async () => {
        const ctx = montar();
        await hastaResultados(ctx);
        const hijos = ctx.vista.children;
        const indicador = hijos.find(h => h.localName === 'indicador-pasos');
        assert.equal(indicador.slot, 'pasos');
        assert.deepEqual({ ...indicador.modelo, pasos: undefined }, { pasos: undefined, actual: 5, alcanzado: 5 });
        const tarjetas = hijos.filter(h => h.localName === 'tarjeta-cita');
        assert.equal(tarjetas.length, 2);
        assert.ok(tarjetas.every(t => t.slot === 'resultados'));
        assert.equal(tarjetas[0].modelo.cita.idConsulta, UUID(31));
        assert.ok(ctx.vista.shadowRoot.querySelector('slot[name="pasos"]'));
        assert.ok(ctx.vista.shadowRoot.querySelector('slot[name="resultados"]'));
    });
});

describe('<vista-citas>: pasos, foco y errores', () => {
    test('al cambiar de paso el foco va al título y se anuncia "Paso N de 5: …"', async () => {
        const ctx = montar();
        conectar(ctx.vista);
        await asentar();
        assert.notEqual(ctx.vista.shadowRoot.activeElement?.id, 'h-1', 'el primer pintado no roba el foco');
        ctx.$('tipo').value = DUI.idTipoDocumento;
        ctx.$('tipo').dispatchEvent(new Event('change'));
        ctx.enviar(1);
        await asentar();
        assert.equal(visible(ctx, 2), true);
        assert.equal(ctx.vista.shadowRoot.activeElement, ctx.$('h-2'));
        assert.equal(ctx.$('anuncio').textContent, 'Paso 2 de 5: Número de documento');
    });

    test('un error de validación pone aria-invalid y lleva el foco al campo', async () => {
        const ctx = montar();
        conectar(ctx.vista);
        await asentar();
        ctx.$('tipo').value = DUI.idTipoDocumento;
        ctx.$('tipo').dispatchEvent(new Event('change'));
        ctx.enviar(1);
        await asentar();
        ctx.$('numero').value = '123';
        ctx.$('numero').dispatchEvent(new Event('input'));
        ctx.enviar(2);
        await asentar();
        assert.equal(ctx.$('numero').getAttribute('aria-invalid'), 'true');
        assert.match(ctx.$('numero').getAttribute('aria-describedby'), /numero-error/);
        assert.match(ctx.$('numero-error').textContent, /formato de DUI/);
        assert.equal(ctx.vista.shadowRoot.activeElement, ctx.$('numero'));
        assert.equal(ctx.llamadas.clinicas, 0);
    });

    test('ir y volver con el indicador conserva lo escrito en los campos', async () => {
        const ctx = montar();
        await hastaResultados(ctx);
        const indicador = ctx.vista.children.find(h => h.localName === 'indicador-pasos');
        indicador.dispatchEvent(new CustomEvent('ir-a-paso', { detail: { paso: 2 } }));
        await asentar();
        assert.equal(visible(ctx, 2), true);
        assert.equal(ctx.$('numero').value, NUMERO);
        ctx.$('atras-2').dispatchEvent(new Event('click'));
        await asentar();
        assert.equal(ctx.$('tipo').value, DUI.idTipoDocumento);
        indicador.dispatchEvent(new CustomEvent('ir-a-paso', { detail: { paso: 5 } }));
        await asentar();
        assert.equal(visible(ctx, 5), true);
        assert.equal(ctx.llamadas.clinicas, 1);
        assert.equal(ctx.llamadas.citas, 1);
    });

    test('sin clínicas: mensaje neutro y "Siguiente" deshabilitado', async () => {
        const ctx = montar({ clinicas: [] });
        conectar(ctx.vista);
        await asentar();
        ctx.$('tipo').value = DUI.idTipoDocumento;
        ctx.$('tipo').dispatchEvent(new Event('change'));
        ctx.enviar(1);
        await asentar();
        ctx.$('numero').value = '99999999-9';
        ctx.$('numero').dispatchEvent(new Event('input'));
        ctx.enviar(2);
        await asentar();
        assert.equal(visible(ctx, 3), true);
        assert.equal(ctx.$('sin-clinicas').hidden, false);
        assert.equal(ctx.$('sin-clinicas').textContent, 'No encontramos clínicas para esa búsqueda. Revisa el tipo y el número de documento.');
        assert.equal(ctx.$('siguiente-3').disabled, true);
    });

    test('sin citas: mensaje y botón para volver a las fechas', async () => {
        const ctx = montar({ citas: [] });
        await hastaResultados(ctx);
        assert.equal(ctx.$('sin-citas').hidden, false);
        ctx.$('cambiar-fechas').dispatchEvent(new Event('click'));
        await asentar();
        assert.equal(visible(ctx, 4), true);
    });

    test('"Nueva búsqueda" vacía el número y vuelve al paso 1', async () => {
        const ctx = montar();
        await hastaResultados(ctx);
        ctx.$('nueva').dispatchEvent(new Event('click'));
        await asentar();
        assert.equal(visible(ctx, 1), true);
        assert.equal(ctx.$('numero').value, '');
        assert.equal(ctx.vista.children.filter(h => h.localName === 'tarjeta-cita').length, 0);
    });
});

describe('<vista-citas>: privacidad', () => {
    test('el número nunca aparece en location.hash ni toca el historial', async () => {
        const ctx = montar();
        await hastaResultados(ctx);
        assert.equal(ubicacion.hash, '#/citas');
        assert.ok(!ubicacion.hash.includes(NUMERO));
    });

    test('el campo del número lleva autocomplete="off"', async () => {
        const ctx = montar();
        conectar(ctx.vista);
        assert.equal(ctx.$('numero').getAttribute('autocomplete'), 'off');
    });
});

describe('<vista-citas>: ticket', () => {
    test('descarga con un <a download> temporal, revoca la URL y avisa al controlador', async () => {
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
            await hastaResultados(ctx);
            const tarjeta = ctx.vista.children.find(h => h.localName === 'tarjeta-cita');
            tarjeta.dispatchEvent(new CustomEvent('descargar-ticket', { detail: { idConsulta: UUID(31) } }));
            await asentar();
            await asentar();
            assert.equal(ctx.llamadas.ticket, 1);
            assert.equal(creadas.length, 1);
            assert.ok(creadas[0] instanceof Blob);
            const [a] = anclas;
            assert.equal(a.href, 'blob:prueba/1');
            assert.equal(a.download, 'ticket-cita-60000000.pdf');
            assert.equal(a.pulsadoConectado, true, 'se pulsa dentro del documento');
            assert.equal(a.parentNode, null, 'y se quita después');
            assert.deepEqual(revocadas, ['blob:prueba/1']);
            assert.equal(ctx.estado.tickets[UUID(31)].estado, 'entregado');
            assert.equal(tarjeta.modelo.ticket.estado, 'entregado');
        } finally {
            URL.createObjectURL = urlOriginal.crear;
            URL.revokeObjectURL = urlOriginal.revocar;
            document.createElement = crear;
        }
    });

    test('404 cita.noExiste: la card recibe el error', async () => {
        const ctx = montar();
        await hastaResultados(ctx);
        ctx.respuestas.ticket = async () => { throw new DefaultError({ status: 404, code: 'cita.noExiste' }); };
        const tarjeta = ctx.vista.children.find(h => h.localName === 'tarjeta-cita');
        tarjeta.dispatchEvent(new CustomEvent('descargar-ticket', { detail: { idConsulta: UUID(31) } }));
        await asentar();
        assert.equal(tarjeta.modelo.ticket.error, 'No pudimos generar el ticket de esta cita.');
    });
});

describe('<vista-citas>: sin red', () => {
    test('restaura la búsqueda de memoria con el aviso y bloquea las acciones que necesitan red', async () => {
        const memoria = new MemoriaVistas();
        const primera = montar({ memoria });
        await hastaResultados(primera);
        desconectar(primera.vista);

        const ctx = montar({ memoria, enLinea: false });
        conectar(ctx.vista);
        await asentar();
        assert.equal(visible(ctx, 5), true);
        assert.equal(ctx.$('aviso-memoria').textContent, 'Sin conexión. Mostrando la búsqueda de las 09:30.');
        const tarjeta = ctx.vista.children.find(h => h.localName === 'tarjeta-cita');
        assert.equal(tarjeta.modelo.motivoTicket, 'Necesitas conexión para descargar el ticket.');
        const indicador = ctx.vista.children.find(h => h.localName === 'indicador-pasos');
        indicador.dispatchEvent(new CustomEvent('ir-a-paso', { detail: { paso: 4 } }));
        await asentar();
        assert.equal(ctx.$('buscar').disabled, true);
        assert.equal(ctx.$('motivo-4').textContent, 'Necesitas conexión para buscar.');
    });
});
