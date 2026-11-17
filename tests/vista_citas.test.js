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
        assert.match(ctx.$('mensaje').textContent, /formato de DUI/);
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

describe('<vista-citas>: máscara del número', () => {
    test('una letra en DUI no queda en el campo y el guion se pone solo', async () => {
        const ctx = montar();
        conectar(ctx.vista);
        await asentar();
        ctx.$('tipo').value = DUI.idTipoDocumento;
        ctx.$('tipo').dispatchEvent(new Event('change'));
        ctx.$('numero').value = '1';
        ctx.$('numero').dispatchEvent(new Event('input'));
        ctx.$('numero').value = '1a';
        ctx.$('numero').dispatchEvent(new Event('input'));
        assert.equal(ctx.$('numero').value, '1', 'la letra se quita del campo');
        ctx.$('numero').value = '123456789';
        ctx.$('numero').dispatchEvent(new Event('input'));
        assert.equal(ctx.$('numero').value, '12345678-9');
        desconectar(ctx.vista);
    });
});

describe('<vista-citas>: campos que se desbloquean en orden', () => {
    test('pinta disabled desde el estado y "Buscar citas" dice qué falta', async () => {
        const ctx = montar();
        conectar(ctx.vista);
        await asentar();
        assert.equal(typeof ctx.estado.habilitado, 'object', 'el controlador publica habilitado');
        for (const id of ['numero', 'clinica', 'desde', 'hasta', 'buscar']) assert.equal(ctx.$(id).disabled, true, `${id} bloqueado`);
        assert.ok(ctx.$('buscar').getAttribute('aria-describedby').split(' ').includes('falta'));
        assert.equal(ctx.$('falta').textContent, ctx.estado.falta);
        ctx.$('tipo').value = DUI.idTipoDocumento;
        ctx.$('tipo').dispatchEvent(new Event('change'));
        await asentar();
        assert.equal(ctx.$('numero').disabled, false);
        ctx.$('numero').value = NUMERO;
        ctx.$('numero').dispatchEvent(new Event('input'));
        await asentar();
        await asentar();
        assert.equal(ctx.$('clinica').disabled, false);
        assert.equal(ctx.$('desde').disabled, true);
        ctx.$('clinica').value = NORTE.idClinica;
        ctx.$('clinica').dispatchEvent(new Event('change'));
        await asentar();
        assert.equal(ctx.$('desde').disabled, false);
        assert.equal(ctx.$('hasta').disabled, false);
        assert.equal(ctx.$('buscar').disabled, false);
        assert.equal(ctx.$('falta').hidden, true);
        desconectar(ctx.vista);
    });
});

describe('<vista-citas>: errores en un solo recuadro arriba del formulario', () => {
    const errores = ctx => ctx.$('mensaje').querySelectorAll('li').map(li => li.textContent);

    test('no hay mensajes debajo de los campos', () => {
        const ctx = montar();
        conectar(ctx.vista);
        for (const id of ['tipo-error', 'numero-error', 'clinica-error', 'rango-error']) assert.equal(ctx.$(id), null, id);
        assert.equal(ctx.vista.shadowRoot.querySelectorAll('.error-campo').length, 0);
        desconectar(ctx.vista);
    });

    test('al salir del número inválido: recuadro con role=alert, aria-invalid y aria-describedby; el foco no se mueve', async () => {
        const ctx = montar();
        conectar(ctx.vista);
        await asentar();
        ctx.$('tipo').value = DUI.idTipoDocumento;
        ctx.$('tipo').dispatchEvent(new Event('change'));
        ctx.$('numero').value = '123';
        ctx.$('numero').dispatchEvent(new Event('input'));
        ctx.$('desde').focus();
        ctx.$('numero').dispatchEvent(new Event('change'));
        await asentar();
        assert.equal(ctx.$('mensaje').getAttribute('role'), 'alert');
        assert.equal(ctx.$('mensaje').hidden, false);
        assert.equal(errores(ctx).length, 1);
        assert.match(errores(ctx)[0], /formato de DUI\. Ocho dígitos/);
        assert.equal(ctx.$('numero').getAttribute('aria-invalid'), 'true');
        assert.ok(ctx.$('numero').getAttribute('aria-describedby').split(' ').includes('mensaje'));
        assert.equal(ctx.vista.shadowRoot.activeElement, ctx.$('desde'));
        desconectar(ctx.vista);
    });

    test('Enter en el número inválido lleva el foco al primer campo con error', async () => {
        const ctx = montar();
        conectar(ctx.vista);
        await asentar();
        ctx.$('tipo').value = DUI.idTipoDocumento;
        ctx.$('tipo').dispatchEvent(new Event('change'));
        ctx.$('numero').value = '123';
        ctx.$('numero').dispatchEvent(new Event('input'));
        ctx.$('desde').focus();
        const enter = Object.assign(new Event('keydown', { cancelable: true }), { key: 'Enter' });
        ctx.$('numero').dispatchEvent(enter);
        await asentar();
        await asentar();
        assert.equal(ctx.vista.shadowRoot.activeElement, ctx.$('numero'));
        assert.equal(errores(ctx).length, 1);
        desconectar(ctx.vista);
    });

    test('documento sin clínicas: el mismo texto neutro en el recuadro y el número marcado', async () => {
        const ctx = montar({ clinicas: [] });
        conectar(ctx.vista);
        await asentar();
        ctx.$('tipo').value = DUI.idTipoDocumento;
        ctx.$('tipo').dispatchEvent(new Event('change'));
        ctx.$('numero').value = NUMERO;
        ctx.$('numero').dispatchEvent(new Event('input'));
        await asentar();
        await asentar();
        assert.deepEqual(errores(ctx), ['No encontramos ese documento registrado como paciente.']);
        assert.equal(ctx.$('numero').getAttribute('aria-invalid'), 'true');
        desconectar(ctx.vista);
    });

    test('errores de red y de campo comparten el recuadro; un campo sin error no lo referencia', async () => {
        const ctx = montar();
        conectar(ctx.vista);
        await asentar();
        ctx.controlador.fijarFechas({ desde: '2026-11-20', hasta: '2026-11-01' });
        await asentar();
        assert.ok(errores(ctx).includes('La fecha inicial no puede ser posterior a la final.'));
        assert.equal(ctx.$('desde').getAttribute('aria-invalid'), 'true');
        assert.ok((ctx.$('hasta').getAttribute('aria-describedby') ?? '').split(' ').includes('mensaje'));
        assert.ok(!(ctx.$('tipo').getAttribute('aria-describedby') ?? '').split(' ').includes('mensaje'));
        desconectar(ctx.vista);
    });
});

describe('<vista-citas>: invitación a instalar', () => {
    test('al pulsar "Buscar citas" válido se pide en el mismo clic y la búsqueda sigue', async () => {
        const ctx = montar();
        const invitaciones = [];
        const escuchar = e => invitaciones.push(e);
        document.addEventListener('ofrecer-instalacion', escuchar);
        try {
            conectar(ctx.vista);
            await asentar();
            ctx.$('tipo').value = DUI.idTipoDocumento;
            ctx.$('tipo').dispatchEvent(new Event('change'));
            ctx.enviar();
            assert.equal(invitaciones.length, 0, 'sin datos válidos no se ofrece');
            ctx.$('numero').value = NUMERO;
            ctx.$('numero').dispatchEvent(new Event('input'));
            await asentar();
            await asentar();
            ctx.$('clinica').value = NORTE.idClinica;
            ctx.$('clinica').dispatchEvent(new Event('change'));
            ctx.enviar();
            assert.equal(invitaciones.length, 1, 'dentro del mismo submit, antes de esperar');
            await asentar();
            await asentar();
            assert.equal(ctx.llamadas.citas, 1, 'la búsqueda continúa aunque se rechace');
        } finally {
            document.removeEventListener('ofrecer-instalacion', escuchar);
            desconectar(ctx.vista);
        }
    });
});

// La invitación sale de la vista real y la recibe el <install-prompt> real (no se lanza desde document).
describe('<vista-citas> + <install-prompt>: ventana para instalar', () => {
    let InstallPrompt;
    let ControladorInstalacion;
    before(async () => {
        ({ default: InstallPrompt } = await import('../src/js/boundary/components/install_prompt.js'));
        ({ ControladorInstalacion } = await import('../src/js/boundary/pwa/controlador_instalacion.js'));
    });

    /** Una "carga de página": ventana doble con la sessionStorage de la pestaña e install-prompt real. */
    function cargarPagina(pestana = new Map(), { instalada = false } = {}) {
        const ventana = new EventTarget();
        ventana.matchMedia = q => ({ matches: instalada && q === '(display-mode: standalone)' });
        ventana.navigator = {};
        ventana.sessionStorage = { getItem: k => pestana.get(k) ?? null, setItem: (k, v) => pestana.set(k, String(v)) };
        const instalador = new InstallPrompt();
        instalador.controlador = new ControladorInstalacion({ ventana });
        conectar(instalador);
        const $i = id => instalador.shadowRoot.getElementById(id);
        assert.ok($i('invitacion'), '<install-prompt> trae su <dialog id="invitacion">');
        return { ventana, instalador, $i, dialogo: $i('invitacion'), pestana };
    }

    function aviso() {
        const e = new Event('beforeinstallprompt', { cancelable: true });
        e.llamadas = 0;
        e.prompt = () => { e.llamadas++; return Promise.resolve(); };
        e.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' });
        return e;
    }

    /** Abre la página con beforeinstallprompt y pulsa "Buscar citas" con el foco en el botón. */
    async function buscarConAviso(pagina = cargarPagina(), bip = aviso()) {
        const ctx = montar();
        pagina.ventana.dispatchEvent(bip);
        await asentar();
        conectar(ctx.vista);
        await asentar();
        ctx.$('tipo').value = DUI.idTipoDocumento;
        ctx.$('tipo').dispatchEvent(new Event('change'));
        ctx.$('numero').value = NUMERO;
        ctx.$('numero').dispatchEvent(new Event('input'));
        await asentar();
        ctx.$('clinica').value = NORTE.idClinica;
        ctx.$('clinica').dispatchEvent(new Event('change'));
        ctx.$('buscar').focus();
        ctx.enviar();
        await asentar();
        return { ...pagina, ctx, bip, cerrar: () => { desconectar(ctx.vista); desconectar(pagina.instalador); } };
    }

    test('"Buscar citas" válido abre la ventana accesible con el foco en "Instalar", y la búsqueda sigue', async () => {
        const p = await buscarConAviso();
        try {
            assert.equal(p.dialogo.open, true, 'la ventana se abre');
            assert.equal(p.bip.llamadas, 0, 'prompt() espera al clic en "Instalar"');
            assert.equal(p.dialogo.getAttribute('aria-labelledby'), 'invitacion-titulo');
            assert.equal(p.dialogo.getAttribute('aria-describedby'), 'invitacion-texto');
            assert.equal(p.$i('invitacion-titulo').textContent.trim(), 'Instalar ChivoMed');
            assert.equal(p.$i('invitacion-texto').textContent.trim(),
                '¿Quieres instalar ChivoMed en este dispositivo? Podrás abrirla como una aplicación y consultar tus datos guardados sin conexión.');
            assert.equal(p.$i('invitacion-instalar').textContent.trim(), 'Instalar');
            assert.equal(p.$i('invitacion-no').textContent.trim(), 'Ahora no');
            assert.equal(p.instalador.shadowRoot.activeElement, p.$i('invitacion-instalar'));
            await asentar();
            assert.equal(p.ctx.llamadas.citas, 1, 'la búsqueda no espera a la ventana');
            assert.equal(p.$i('instalar').hidden, false, 'el botón de siempre sigue igual');
        } finally { p.cerrar(); }
    });

    test('"Instalar" llama a prompt(), cierra la ventana y devuelve el foco', async () => {
        const p = await buscarConAviso();
        try {
            p.$i('invitacion-instalar').click();
            assert.equal(p.bip.llamadas, 1, 'dentro del clic en "Instalar"');
            await asentar();
            assert.equal(p.dialogo.open, false);
            assert.equal(document.activeElement, p.ctx.vista);
            assert.equal(p.ctx.vista.shadowRoot.activeElement, p.ctx.$('buscar'));
        } finally { p.cerrar(); }
    });

    for (const [nombre, rechazar] of [
        ['"Ahora no"', p => p.$i('invitacion-no').click()],
        ['Esc', p => { p.dialogo.dispatchEvent(new Event('cancel')); p.dialogo.close(); }],
        ['clic fuera', p => { const e = new Event('click'); Object.defineProperty(e, 'target', { value: p.dialogo }); p.dialogo.dispatchEvent(e); }],
    ]) {
        test(`${nombre} cierra la ventana, devuelve el foco y no vuelve a abrirse en la sesión`, async () => {
            const p = await buscarConAviso();
            try {
                rechazar(p);
                await asentar();
                await asentar();
                assert.equal(p.dialogo.open, false);
                assert.equal(p.bip.llamadas, 0);
                assert.equal(p.ctx.vista.shadowRoot.activeElement, p.ctx.$('buscar'));
                p.ctx.enviar();
                await asentar();
                assert.equal(p.dialogo.open, false, 'otra búsqueda en la misma página no la abre');
            } finally { p.cerrar(); }
            const recargada = await buscarConAviso(cargarPagina(p.pestana));
            try {
                assert.equal(recargada.dialogo.open, false, 'tras recargar, en la misma sesión, tampoco');
                assert.equal(recargada.$i('instalar').hidden, false);
            } finally { recargada.cerrar(); }
        });
    }

    test('un clic dentro de la ventana no cuenta como rechazo', async () => {
        const p = await buscarConAviso();
        try {
            const e = new Event('click');
            Object.defineProperty(e, 'target', { value: p.$i('invitacion-texto') });
            p.dialogo.dispatchEvent(e);
            await asentar();
            assert.equal(p.dialogo.open, true);
        } finally { p.cerrar(); }
    });

    test('una ventana sin respuesta (se recargó) no gasta la invitación de la sesión', async () => {
        const primera = await buscarConAviso();
        primera.cerrar();
        const segunda = await buscarConAviso(cargarPagina(primera.pestana));
        try {
            assert.equal(segunda.dialogo.open, true);
        } finally { segunda.cerrar(); }
    });

    test('no se abre sin beforeinstallprompt ni si la app ya está instalada', async () => {
        const pagina = cargarPagina();
        const ctx = montar();
        try {
            await llenarFiltros(ctx);
            assert.equal(pagina.dialogo.open, false, 'sin beforeinstallprompt');
            assert.equal(ctx.llamadas.citas, 1);
        } finally { desconectar(ctx.vista); desconectar(pagina.instalador); }
        const instalada = await buscarConAviso(cargarPagina(new Map(), { instalada: true }));
        try {
            assert.equal(instalada.dialogo.open, false, 'ya instalada');
            assert.equal(instalada.bip.llamadas, 0);
        } finally { instalada.cerrar(); }
    });
});
