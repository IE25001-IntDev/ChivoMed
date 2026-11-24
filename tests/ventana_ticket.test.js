import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, conectar, desconectar } from './dobles/dom_minimo.js';
import { MemoriaVistas } from '../src/js/boundary/vistas/memoria_vistas.js';
import { ControladorInstalacion, EVENTO_OFRECER, EVENTO_INSTALAR } from '../src/js/boundary/pwa/controlador_instalacion.js';
import DefaultError from '../src/js/entities/default_error.js';

// Datos inventados; nunca datos reales de pacientes.
const UUID = n => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DUI = Object.freeze({ idTipoDocumento: UUID(1), nombre: 'DUI', indicaciones: null, expresionRegular: '^[0-9]{8}-[0-9]$' });
const NORTE = Object.freeze({ idClinica: UUID(10), nombre: 'Clínica Prueba Norte' });
const cita = (n, nombrePaciente = 'Paciente Prueba Uno') => Object.freeze({ idConsulta: UUID(30 + n), fechaInicio: '2026-11-12T08:00:00-06:00',
    nombreClinica: NORTE.nombre, nombrePaciente, procedimientos: Object.freeze(['Consulta general']) });
const NUMERO = '12345678-9';
const AHORA = Date.UTC(2026, 10, 13, 15, 30);
const asentar = () => new Promise(resolve => setTimeout(resolve, 0));

let VentanaTicket;
let VistaCitas;
let InstallPrompt;
let ControladorCitas;
let MENSAJES;
let TEXTOS;
let detectarVisorPdf;

before(async () => {
    instalarDom();
    globalThis.location = { hash: '#/citas' };
    ({ default: VentanaTicket, TEXTOS, detectarVisorPdf } = await import('../src/js/boundary/components/citas/ventana_ticket.js'));
    ({ default: VistaCitas } = await import('../src/js/boundary/vistas/vista_citas.js'));
    ({ default: InstallPrompt } = await import('../src/js/boundary/components/install_prompt.js'));
    ({ ControladorCitas, MENSAJES } = await import('../src/js/boundary/vistas/controlador_citas.js'));
});
after(() => { delete globalThis.location; });

/** URL.createObjectURL/revokeObjectURL falsos y un registro de lo que pasa, en orden. */
let registro;
let urlOriginal;
let crearOriginal;
beforeEach(() => {
    registro = { creadas: [], revocadas: [], anclas: [], orden: [] };
    urlOriginal = { crear: URL.createObjectURL, revocar: URL.revokeObjectURL };
    let n = 0;
    URL.createObjectURL = blob => { registro.creadas.push(blob); return `blob:prueba/${++n}`; };
    URL.revokeObjectURL = url => registro.revocadas.push(url);
    crearOriginal = document.createElement;
    document.createElement = tag => {
        const el = crearOriginal(tag);
        if (tag === 'a') {
            registro.anclas.push(el);
            el.addEventListener('click', () => { el.pulsadoConectado = Boolean(el.parentNode); registro.orden.push(`descarga:${el.download}`); });
        }
        return el;
    };
});
afterEach(() => {
    URL.createObjectURL = urlOriginal.crear;
    URL.revokeObjectURL = urlOriginal.revocar;
    document.createElement = crearOriginal;
});

// ---------------------------------------------------------------------------------------------
// <ventana-ticket> sola
// ---------------------------------------------------------------------------------------------

function ventanaSola(modelo, { visorPdf = true } = {}) {
    const el = new VentanaTicket();
    el.visorPdf = visorPdf;
    el.modelo = modelo;
    conectar(el);
    const eventos = [];
    el.addEventListener('cerrar-ticket', e => eventos.push(e));
    el.addEventListener('descargar-pdf', e => eventos.push(e));
    return { el, eventos, $: id => el.shadowRoot.getElementById(id) };
}

const PDF = Object.freeze({ blob: new Blob(['%PDF-1.4']), nombre: 'ticket-cita-70000000.pdf' });
const abierta = (ticket, extra = {}) => Object.freeze({ abierto: true, cita: cita(1), ticket, motivo: null, ...extra });

describe('<ventana-ticket>: contenido', () => {
    test('detectarVisorPdf: solo navigator.pdfViewerEnabled === true cuenta', () => {
        assert.equal(detectarVisorPdf({ pdfViewerEnabled: true }), true);
        assert.equal(detectarVisorPdf({ pdfViewerEnabled: false }), false, 'Chrome de Android');
        assert.equal(detectarVisorPdf({}), false, 'navegador sin la propiedad');
        assert.equal(detectarVisorPdf(undefined), false);
    });

    test('cerrada no abre el diálogo; abierta usa showModal, foco en la X y datos con textContent', () => {
        const { el, $ } = ventanaSola({ abierto: false });
        assert.equal($('ventana').open, false);
        el.modelo = abierta({ estado: 'descargando' }, { cita: { ...cita(1), nombreClinica: 'Clínica <b>Uno</b>' } });
        assert.equal($('ventana').open, true);
        assert.equal(el.shadowRoot.activeElement, $('cerrar-x'));
        assert.match($('detalle').textContent, /Clínica <b>Uno<\/b>$/);
        assert.equal(el.shadowRoot.querySelectorAll('b').length, 0);
    });

    test('cargando: aviso de carga, aria-busy y "Descargar PDF" deshabilitado', () => {
        const { $ } = ventanaSola(abierta({ estado: 'descargando' }));
        assert.equal($('cargando').hidden, false);
        assert.equal($('cargando').textContent, TEXTOS.cargando);
        assert.equal($('visor').getAttribute('aria-busy'), 'true');
        assert.equal($('descargar').disabled, true);
        assert.equal($('pdf').hidden, true);
    });

    test('PDF cargado y el navegador puede mostrarlo: iframe con una URL blob: del PDF', () => {
        const { $ } = ventanaSola(abierta({ estado: 'listo', archivo: PDF, descargado: false }));
        assert.equal($('pdf').hidden, false);
        assert.equal($('pdf').getAttribute('src'), 'blob:prueba/1');
        assert.equal(registro.creadas[0], PDF.blob);
        assert.ok($('pdf').getAttribute('title'), 'el iframe tiene nombre accesible');
        assert.equal($('no-visible').hidden, true);
        assert.equal($('cargando').hidden, true);
        assert.equal($('descargar').disabled, false);
        assert.equal($('visor').getAttribute('aria-busy'), 'false');
    });

    test('repintar con el mismo PDF no crea otra URL; al cerrar se libera', () => {
        const { el, $ } = ventanaSola(abierta({ estado: 'listo', archivo: PDF, descargado: false }));
        el.modelo = abierta({ estado: 'listo', archivo: PDF, descargado: true });
        assert.equal(registro.creadas.length, 1);
        assert.equal($('estado').textContent, TEXTOS.descargado);
        el.modelo = { abierto: false };
        assert.deepEqual(registro.revocadas, ['blob:prueba/1']);
        assert.equal($('pdf').getAttribute('src'), null);
        assert.equal($('ventana').open, false);
    });

    test('PDF que no se puede mostrar (Chrome de Android): "No se puede mostrar el ticket aquí" y el botón de descarga', () => {
        const { $ } = ventanaSola(abierta({ estado: 'listo', archivo: PDF, descargado: false }), { visorPdf: false });
        assert.equal($('no-visible').hidden, false);
        assert.match($('no-visible').textContent, /No se puede mostrar el ticket aquí\./);
        assert.equal($('pdf').hidden, true, 'no queda un iframe en blanco');
        assert.equal($('pdf').getAttribute('src'), null);
        assert.equal(registro.creadas.length, 0);
        assert.equal($('descargar').disabled, false);
        assert.equal($('descargar').hidden, false);
    });

    test('error: alerta con el mensaje y "Descargar PDF" habilitado para reintentar', () => {
        const { $ } = ventanaSola(abierta({ estado: 'error', error: 'No pudimos descargar el ticket. Inténtalo de nuevo.' }));
        assert.equal($('error').hidden, false);
        assert.equal($('error').getAttribute('role'), 'alert');
        assert.equal($('error').textContent, 'No pudimos descargar el ticket. Inténtalo de nuevo.');
        assert.equal($('descargar').disabled, false);
    });

    test('sin conexión antes de cargar: dice el motivo y no deja descargar; con el PDF ya cargado sí deja', () => {
        const motivo = 'Sin conexión: necesitas conexión con el servidor para ver el ticket.';
        const { el, $ } = ventanaSola(abierta(null, { motivo }));
        assert.equal($('error').textContent, motivo);
        assert.equal($('descargar').disabled, true);
        el.modelo = abierta({ estado: 'listo', archivo: PDF, descargado: false }, { motivo });
        assert.equal($('descargar').disabled, false, 'el PDF ya está en memoria: descargarlo no pide nada');
        assert.equal($('error').hidden, true);
    });
});

describe('<ventana-ticket>: eventos', () => {
    test('"Descargar PDF" emite descargar-pdf; deshabilitado no emite', () => {
        const { el, $, eventos } = ventanaSola(abierta({ estado: 'listo', archivo: PDF }));
        $('descargar').click();
        assert.deepEqual(eventos.map(e => [e.type, e.detail.idConsulta, e.bubbles, e.composed]), [['descargar-pdf', UUID(31), true, true]]);
        el.modelo = abierta({ estado: 'descargando' });
        $('descargar').click();
        assert.equal(eventos.length, 1);
    });

    test('se cierra con la X, con "Cerrar", con Esc y con un clic fuera; un clic dentro no la cierra', async () => {
        const { $, eventos } = ventanaSola(abierta({ estado: 'listo', archivo: PDF }));
        $('cerrar-x').click();
        $('cerrar').click();
        $('ventana').dispatchEvent(Object.assign(new Event('click'), {}));
        // Un clic en el cuerpo: el destino no es el <dialog>.
        const dentro = new Event('click');
        Object.defineProperty(dentro, 'target', { value: $('titulo') });
        $('ventana').dispatchEvent(dentro);
        // Esc: el navegador cierra el <dialog> y emite 'close'.
        $('ventana').close();
        await asentar();
        assert.deepEqual(eventos.map(e => e.type), ['cerrar-ticket', 'cerrar-ticket', 'cerrar-ticket', 'cerrar-ticket']);
    });

    test('un close atrasado de un cierre anterior no cierra la ventana ya reabierta', async () => {
        const { el, $, eventos } = ventanaSola(abierta({ estado: 'listo', archivo: PDF }));
        el.modelo = { abierto: false };
        el.modelo = abierta({ estado: 'listo', archivo: PDF });
        await asentar();
        assert.equal($('ventana').open, true);
        assert.equal(eventos.length, 0);
    });

    test('cerrarla desde el modelo no emite cerrar-ticket (el close llega después)', async () => {
        const { el, eventos } = ventanaSola(abierta({ estado: 'listo', archivo: PDF }));
        el.modelo = { abierto: false };
        await asentar();
        assert.equal(eventos.length, 0);
    });

    test('al desconectarse deja de escuchar y suelta el PDF', () => {
        const { el, $, eventos } = ventanaSola(abierta({ estado: 'listo', archivo: PDF }));
        desconectar(el);
        $('cerrar').click();
        $('descargar').click();
        assert.equal(eventos.length, 0);
        assert.deepEqual(registro.revocadas, ['blob:prueba/1']);
    });
});

// ---------------------------------------------------------------------------------------------
// <vista-citas> + <ventana-ticket> + <install-prompt>
// ---------------------------------------------------------------------------------------------

/** Doble de window para ControladorInstalacion (display-mode y navigator). */
function ventanaNavegador({ standalone = false } = {}) {
    const ventana = new EventTarget();
    const consulta = new EventTarget();
    consulta.matches = standalone;
    ventana.matchMedia = q => (q === '(display-mode: standalone)' ? consulta : { matches: false });
    ventana.navigator = {};
    return ventana;
}

/** Doble de BeforeInstallPromptEvent; prompt() queda en registro.orden. */
function crearAviso(outcome = 'dismissed', { fallaPrompt = false } = {}) {
    const aviso = new Event('beforeinstallprompt', { cancelable: true });
    aviso.llamadasPrompt = 0;
    aviso.prompt = async () => { aviso.llamadasPrompt++; registro.orden.push('prompt'); if (fallaPrompt) throw new Error('NotAllowedError'); };
    aviso.userChoice = Promise.resolve({ outcome, platform: 'web' });
    return aviso;
}

/**
 * Monta la vista con sus tarjetas, la ventana del ticket y <install-prompt>, y llega a los
 * resultados. `beforeinstallprompt`: true si el navegador lo ofrece (Chrome); false como Safari.
 */
async function montar({ citas = [cita(1)], enLinea = true, standalone = false, beforeinstallprompt = true,
    visorPdf = true, ticket = null } = {}) {
    const llamadas = { ticket: 0 };
    const respuestas = { ticket: ticket ?? (async id => ({ blob: new Blob(['%PDF']), nombre: `ticket-cita-${id.slice(0, 8)}.pdf` })) };
    const suscriptores = new Set();
    const conexion = { enLinea, suscribir: fn => { suscriptores.add(fn); return () => suscriptores.delete(fn); } };
    const red = valor => { conexion.enLinea = valor; for (const fn of [...suscriptores]) fn(valor); };
    const controlador = new ControladorCitas({
        servicio: {
            clinicas: async () => [NORTE],
            citas: async () => citas,
            ticket: async (id, doc) => { llamadas.ticket++; return respuestas.ticket(id, doc); },
        },
        listarTiposDocumento: async () => [DUI],
        conexion,
        memoria: new MemoriaVistas(),
        reloj: () => new Date(AHORA),
        temporizador: { programar: () => null, cancelar: () => {} },
    });
    const navegador = ventanaNavegador({ standalone });
    const instalacion = new ControladorInstalacion({ ventana: navegador });
    const prompt = new InstallPrompt();
    prompt.controlador = instalacion;
    conectar(prompt);
    const aviso = beforeinstallprompt ? crearAviso() : null;
    if (aviso) navegador.dispatchEvent(aviso);

    const vista = new VistaCitas();
    vista.controlador = controlador;
    conectar(vista);
    await asentar();
    const $v = id => vista.shadowRoot.getElementById(id);
    $v('tipo').value = DUI.idTipoDocumento;
    $v('tipo').dispatchEvent(new Event('change'));
    $v('numero').value = NUMERO;
    $v('numero').dispatchEvent(new Event('input'));
    await asentar();
    $v('form-busqueda').dispatchEvent(new Event('submit', { cancelable: true }));
    await asentar();
    await asentar();
    // La búsqueda invitó a instalar (comportamiento de siempre): se cierra para empezar limpio.
    instalacion.cerrarInvitacion();
    await asentar();

    const ventana = vista.children.find(h => h.localName === 'ventana-ticket');
    ventana.visorPdf = visorPdf;
    conectar(ventana);
    const tarjetas = vista.children.filter(h => h.localName === 'tarjeta-cita');
    for (const t of tarjetas) conectar(t);
    await asentar();
    const $t = id => ventana.shadowRoot.getElementById(id);
    const $i = id => prompt.shadowRoot.getElementById(id);
    const ofrecimientos = [];
    const alOfrecer = () => ofrecimientos.push('ofrecer');
    const alInstalar = () => ofrecimientos.push('instalar');
    document.addEventListener(EVENTO_OFRECER, alOfrecer);
    document.addEventListener(EVENTO_INSTALAR, alInstalar);
    /** Pulsa "Ver ticket" en la primera tarjeta y deja que llegue el PDF. */
    const verTicket = async (tarjeta = tarjetas[0]) => {
        tarjeta.shadowRoot.getElementById('ver').focus();
        tarjeta.shadowRoot.getElementById('ver').click();
        await asentar();
        await asentar();
    };
    const limpiar = () => {
        if (vista.isConnected) desconectar(vista);
        if (prompt.isConnected) desconectar(prompt);
        document.removeEventListener(EVENTO_OFRECER, alOfrecer);
        document.removeEventListener(EVENTO_INSTALAR, alInstalar);
    };
    return { vista, ventana, tarjetas, prompt, controlador, estado: controlador.estado, instalacion, aviso, llamadas,
        respuestas, red, $t, $i, verTicket, ofrecimientos, limpiar };
}

describe('<vista-citas>: ventana del ticket', () => {
    let ctx;
    afterEach(() => ctx?.limpiar());

    test('la tarjeta muestra el nombre del paciente junto a "Ver ticket"; sin nombre no muestra la línea', async () => {
        ctx = await montar({ citas: [cita(1), cita(2, null)] });
        const [con, sin] = ctx.tarjetas;
        assert.equal(con.shadowRoot.getElementById('nombre-paciente').textContent, 'Paciente Prueba Uno');
        assert.equal(con.shadowRoot.getElementById('paciente').hidden, false);
        assert.equal(con.shadowRoot.getElementById('ver').textContent, 'Ver ticket');
        assert.equal(sin.shadowRoot.getElementById('paciente').hidden, true);
    });

    test('"Ver ticket" abre la ventana con el PDF dentro, con una sola petición', async () => {
        ctx = await montar();
        await ctx.verTicket();
        assert.equal(ctx.estado.ticketAbierto, UUID(31));
        assert.equal(ctx.$t('ventana').open, true);
        assert.equal(ctx.$t('pdf').hidden, false);
        assert.equal(ctx.$t('pdf').getAttribute('src'), 'blob:prueba/1');
        assert.equal(ctx.llamadas.ticket, 1);
        assert.equal(registro.anclas.length, 0, 'abrir no descarga');
    });

    for (const [medio, cerrar] of [
        ['la X', ctx => ctx.$t('cerrar-x').click()],
        ['"Cerrar"', ctx => ctx.$t('cerrar').click()],
        ['Esc', ctx => ctx.$t('ventana').close()],
        ['un clic fuera', ctx => ctx.$t('ventana').dispatchEvent(new Event('click'))],
    ]) {
        test(`se cierra con ${medio}: suelta el PDF y el foco vuelve a "Ver ticket"`, async () => {
            ctx = await montar();
            await ctx.verTicket();
            ctx.$t('cerrar-x').focus();
            cerrar(ctx);
            await asentar();
            await asentar();
            assert.equal(ctx.estado.ticketAbierto, null);
            assert.deepEqual(ctx.estado.tickets, {});
            assert.equal(ctx.$t('ventana').open, false);
            assert.deepEqual(registro.revocadas, ['blob:prueba/1']);
            const tarjeta = ctx.tarjetas[0];
            assert.equal(document.activeElement, tarjeta);
            assert.equal(tarjeta.shadowRoot.activeElement, tarjeta.shadowRoot.getElementById('ver'));
        });
    }

    test('al volver a abrirla, el PDF se pide de nuevo', async () => {
        ctx = await montar();
        await ctx.verTicket();
        ctx.$t('cerrar').click();
        await asentar();
        await ctx.verTicket();
        assert.equal(ctx.llamadas.ticket, 2);
        assert.equal(ctx.$t('pdf').getAttribute('src'), 'blob:prueba/2');
    });

    test('"Descargar PDF" reutiliza el PDF cargado: mismo nombre, sin otra petición', async () => {
        ctx = await montar({ beforeinstallprompt: false, standalone: true });
        await ctx.verTicket();
        ctx.$t('descargar').click();
        await asentar();
        assert.equal(ctx.llamadas.ticket, 1);
        assert.equal(registro.anclas.length, 1);
        assert.equal(registro.anclas[0].download, 'ticket-cita-70000000.pdf');
        assert.equal(registro.anclas[0].pulsadoConectado, true);
        assert.equal(ctx.estado.tickets[UUID(31)].descargado, true);
        assert.equal(ctx.$t('estado').textContent, TEXTOS.descargado);
        ctx.$t('descargar').click();
        await asentar();
        assert.equal(ctx.llamadas.ticket, 1, 'una segunda descarga tampoco pide nada');
        assert.equal(registro.anclas.length, 2);
    });

    test('PDF que no se puede mostrar: aviso y descarga desde la ventana', async () => {
        ctx = await montar({ visorPdf: false, standalone: true });
        await ctx.verTicket();
        assert.equal(ctx.$t('no-visible').hidden, false);
        assert.equal(ctx.$t('pdf').hidden, true);
        ctx.$t('descargar').click();
        await asentar();
        assert.equal(registro.anclas.length, 1);
    });

    test('error de descarga: la ventana muestra el error y "Descargar PDF" lo pide otra vez y lo descarga', async () => {
        let falla = true;
        ctx = await montar({ standalone: true, ticket: async id => {
            if (falla) throw new DefaultError({ status: 500, code: 'error.interno' });
            return { blob: new Blob(['%PDF']), nombre: `ticket-cita-${id.slice(0, 8)}.pdf` };
        } });
        await ctx.verTicket();
        assert.equal(ctx.$t('error').textContent, MENSAJES.ticketFallido);
        assert.equal(ctx.$t('descargar').disabled, false);
        falla = false;
        ctx.$t('descargar').click();
        await asentar();
        await asentar();
        assert.equal(ctx.llamadas.ticket, 2);
        assert.equal(registro.anclas.length, 1);
        assert.equal(registro.anclas[0].download, 'ticket-cita-70000000.pdf');
    });

    test('error de descarga que persiste: no descarga ni ofrece instalar', async () => {
        ctx = await montar({ ticket: async () => { throw new DefaultError({ status: 404, code: 'cita.noExiste' }); } });
        await ctx.verTicket();
        ctx.ofrecimientos.length = 0;
        ctx.$t('descargar').click();
        await asentar();
        await asentar();
        assert.equal(ctx.$t('error').textContent, MENSAJES.ticketNoExiste);
        assert.equal(registro.anclas.length, 0);
        assert.deepEqual(ctx.ofrecimientos, []);
        assert.equal(ctx.aviso.llamadasPrompt, 0);
    });

    test('sin conexión: "Ver ticket" deshabilitado con el motivo; si se cae con la ventana abierta y sin PDF, no deja descargar', async () => {
        ctx = await montar();
        ctx.red(false);
        await asentar();
        const ver = ctx.tarjetas[0].shadowRoot.getElementById('ver');
        assert.equal(ver.disabled, true);
        assert.equal(ctx.tarjetas[0].shadowRoot.getElementById('estado-ticket').textContent, MENSAJES.sinRedTicket);
        ctx.$t('descargar').click();
        assert.equal(ctx.llamadas.ticket, 0);
        ctx.limpiar();

        const pendiente = Promise.withResolvers();
        ctx = await montar({ ticket: () => pendiente.promise });
        await ctx.verTicket();
        ctx.red(false);
        pendiente.reject(new DefaultError({ status: 0, code: 'conexion.error' }));
        await asentar();
        await asentar();
        assert.equal(ctx.$t('error').textContent, MENSAJES.conexion);
        assert.equal(ctx.$t('descargar').disabled, true);
        ctx.$t('descargar').click();
        await asentar();
        assert.equal(ctx.llamadas.ticket, 1, 'sin conexión no se pide otra vez');
        assert.equal(registro.anclas.length, 0);
    });

    test('sin conexión con el PDF ya cargado: se descarga igual (no hace falta la red)', async () => {
        ctx = await montar({ standalone: true });
        await ctx.verTicket();
        ctx.red(false);
        await asentar();
        assert.equal(ctx.$t('descargar').disabled, false);
        ctx.$t('descargar').click();
        await asentar();
        assert.equal(registro.anclas.length, 1);
        assert.equal(ctx.llamadas.ticket, 1);
    });

    test('salir de la vista con la ventana abierta la cierra y suelta el PDF', async () => {
        ctx = await montar();
        await ctx.verTicket();
        desconectar(ctx.vista);
        assert.equal(ctx.estado.ticketAbierto, null);
        assert.equal(ctx.$t('ventana').open, false);
        assert.deepEqual(registro.revocadas, ['blob:prueba/1']);
    });
});

describe('<vista-citas>: instalación al abrir y al descargar el ticket', () => {
    let ctx;
    afterEach(() => ctx?.limpiar());

    test('al abrir el ticket, si no está instalada, la invitación aparece encima de la ventana', async () => {
        ctx = await montar();
        await ctx.verTicket();
        assert.deepEqual(ctx.ofrecimientos, ['ofrecer']);
        assert.equal(ctx.$i('invitacion').open, true);
        assert.equal(ctx.$t('ventana').open, true, 'la ventana del ticket sigue abierta debajo');
        assert.equal(ctx.$i('invitacion-instalar').hidden, false);
        assert.equal(ctx.$i('invitacion-no').hidden, false);
    });

    test('aparece cada vez que se abre un ticket, mientras no esté instalada', async () => {
        ctx = await montar();
        await ctx.verTicket();
        ctx.$i('invitacion-no').click();
        await asentar();
        ctx.$t('cerrar').click();
        await asentar();
        await ctx.verTicket();
        assert.equal(ctx.$i('invitacion').open, true);
        assert.deepEqual(ctx.ofrecimientos, ['ofrecer', 'ofrecer']);
    });

    test('ya instalada (standalone): no se ofrece al abrir ni al descargar', async () => {
        ctx = await montar({ standalone: true });
        await ctx.verTicket();
        assert.equal(ctx.$i('invitacion').open, false);
        ctx.$t('descargar').click();
        await asentar();
        assert.equal(registro.anclas.length, 1);
        assert.equal(ctx.$i('invitacion').open, false);
        assert.equal(ctx.aviso.llamadasPrompt, 0);
    });

    test('"Instalar" llama a prompt() en ese clic; luego "Descargar PDF" solo descarga (el evento ya se usó)', async () => {
        ctx = await montar();
        await ctx.verTicket();
        ctx.$i('invitacion-instalar').click();
        assert.equal(ctx.aviso.llamadasPrompt, 1);
        await asentar();
        await asentar();
        assert.equal(ctx.$i('invitacion').open, false);
        ctx.$t('descargar').click();
        await asentar();
        assert.equal(registro.anclas.length, 1);
        assert.equal(ctx.aviso.llamadasPrompt, 1, 'no se vuelve a llamar');
        assert.equal(ctx.$i('invitacion').open, false, 'tampoco la invitación');
    });

    test('"Ahora no": cierra solo el aviso; "Descargar PDF" entrega el PDF y después llama a prompt() en el mismo toque', async () => {
        ctx = await montar();
        await ctx.verTicket();
        ctx.$i('invitacion-no').click();
        await asentar();
        assert.equal(ctx.$i('invitacion').open, false);
        assert.equal(ctx.$t('ventana').open, true);
        assert.equal(ctx.aviso.llamadasPrompt, 0);
        registro.orden.length = 0;
        ctx.$t('descargar').click();
        // Sin esperar: la descarga y prompt() ocurren dentro del clic.
        assert.deepEqual(registro.orden, ['descarga:ticket-cita-70000000.pdf', 'prompt']);
        await asentar();
        await asentar();
        // Rechazada la instalación, el PDF ya quedó descargado y una segunda descarga solo descarga.
        ctx.$t('descargar').click();
        await asentar();
        assert.deepEqual(registro.orden, ['descarga:ticket-cita-70000000.pdf', 'prompt', 'descarga:ticket-cita-70000000.pdf']);
    });

    test('si prompt() falla, el PDF ya se descargó', async () => {
        ctx = await montar();
        ctx.aviso.prompt = crearAviso('dismissed', { fallaPrompt: true }).prompt;
        await ctx.verTicket();
        ctx.$i('invitacion-no').click();
        await asentar();
        registro.orden.length = 0;
        ctx.$t('descargar').click();
        await asentar();
        await asentar();
        assert.deepEqual(registro.orden, ['descarga:ticket-cita-70000000.pdf', 'prompt']);
        assert.equal(registro.anclas[0].pulsadoConectado, true);
        assert.match(ctx.prompt.shadowRoot.getElementById('estado').textContent, /No se pudo abrir la instalación/);
    });

    test('sin beforeinstallprompt (Safari de iPhone): al abrir y al descargar, las instrucciones de siempre', async () => {
        ctx = await montar({ beforeinstallprompt: false });
        await ctx.verTicket();
        assert.equal(ctx.$i('invitacion').open, true);
        assert.equal(ctx.$i('invitacion-entendido').hidden, false);
        assert.equal(ctx.$i('invitacion-instalar').hidden, true);
        ctx.$i('invitacion-entendido').click();
        await asentar();
        await asentar(); // El 'close' del <dialog> llega en otra tarea, antes del siguiente toque.
        ctx.$t('descargar').click();
        await asentar();
        assert.equal(registro.anclas.length, 1, 'primero el PDF');
        assert.equal(ctx.$i('invitacion').open, true);
        assert.equal(ctx.$i('invitacion-entendido').hidden, false);
    });

    for (const [medio, cerrar] of [
        ['"Ahora no"', ctx => ctx.$i('invitacion-no').click()],
        ['Esc', ctx => ctx.$i('invitacion').close()],
        ['un clic fuera', ctx => ctx.$i('invitacion').dispatchEvent(new Event('click'))],
    ]) {
        test(`encima de la ventana del ticket, ${medio} cierra solo el aviso y el foco vuelve dentro de la ventana`, async () => {
            ctx = await montar();
            await ctx.verTicket();
            assert.equal(ctx.$i('invitacion').open, true);
            assert.equal(document.activeElement, ctx.prompt, 'el foco está en el aviso');
            cerrar(ctx);
            await asentar();
            await asentar();
            assert.equal(ctx.$i('invitacion').open, false);
            assert.equal(ctx.$t('ventana').open, true, 'la ventana del ticket sigue abierta');
            assert.equal(ctx.estado.ticketAbierto, UUID(31));
            assert.equal(document.activeElement, ctx.ventana);
            assert.equal(ctx.ventana.shadowRoot.activeElement, ctx.$t('cerrar-x'));
        });
    }
});
