import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { ControladorInstalacion, MODOS } from '../src/js/boundary/pwa/controlador_instalacion.js';
import { instalarDom, conectar, desconectar } from './dobles/dom_minimo.js';

/** Deja correr los microtasks: la notificación del estado reactivo llega después del cambio. */
const asentar = () => new Promise(resolve => setTimeout(resolve, 0));

/** Doble de window: EventTarget con matchMedia (display-mode) y navigator. */
function crearVentana({ standalone = false, iosStandalone = undefined } = {}) {
    const ventana = new EventTarget();
    const consulta = new EventTarget();
    consulta.matches = standalone;
    ventana.consulta = consulta;
    ventana.matchMedia = q => (q === '(display-mode: standalone)' ? consulta : { matches: false });
    ventana.navigator = { standalone: iosStandalone };
    return ventana;
}

/** Doble de BeforeInstallPromptEvent con la elección del usuario. */
function crearAviso(outcome = 'accepted', { fallaPrompt = false } = {}) {
    const aviso = new Event('beforeinstallprompt', { cancelable: true });
    aviso.llamadasPrompt = 0;
    aviso.prompt = async () => { aviso.llamadasPrompt++; if (fallaPrompt) throw new Error('NotAllowedError'); };
    aviso.userChoice = Promise.resolve({ outcome, platform: 'web' });
    return aviso;
}

function preparar(opciones) {
    const ventana = crearVentana(opciones);
    const estados = [];
    const controlador = new ControladorInstalacion({ ventana });
    controlador.suscribir((_cambios, estado) => estados.push(estado.modo));
    controlador.iniciar();
    return { ventana, controlador, estados };
}

describe('ControladorInstalacion', () => {
    test('sin aviso del navegador la instalación no está disponible', () => {
        const { controlador } = preparar();
        assert.equal(controlador.estado.modo, MODOS.NO_DISPONIBLE);
    });

    test('beforeinstallprompt evita el aviso automático y habilita el botón propio', () => {
        const { ventana, controlador } = preparar();
        const aviso = crearAviso();
        ventana.dispatchEvent(aviso);
        assert.equal(aviso.defaultPrevented, true);
        assert.equal(controlador.estado.modo, MODOS.DISPONIBLE);
    });

    test('al aceptar muestra el diálogo una vez, queda instalando y appinstalled lo confirma', async () => {
        const { ventana, controlador, estados } = preparar();
        const aviso = crearAviso('accepted');
        ventana.dispatchEvent(aviso);
        await asentar(); // En el navegador el aviso y el clic llegan en tareas distintas.
        assert.equal(await controlador.instalar(), 'accepted');
        assert.equal(aviso.llamadasPrompt, 1);
        assert.equal(controlador.estado.modo, MODOS.INSTALANDO);
        await asentar();
        ventana.dispatchEvent(new Event('appinstalled'));
        assert.equal(controlador.estado.modo, MODOS.INSTALADA);
        assert.match(controlador.estado.mensaje, /instalada/);
        await asentar();
        assert.deepEqual(estados, [MODOS.DISPONIBLE, MODOS.INSTALANDO, MODOS.INSTALANDO, MODOS.INSTALADA]);
    });

    test('al rechazar se oculta el botón y el aviso ya usado no se vuelve a mostrar', async () => {
        const { ventana, controlador } = preparar();
        const aviso = crearAviso('dismissed');
        ventana.dispatchEvent(aviso);
        assert.equal(await controlador.instalar(), 'dismissed');
        assert.equal(controlador.estado.modo, MODOS.NO_DISPONIBLE);
        assert.equal(await controlador.instalar(), null);
        assert.equal(aviso.llamadasPrompt, 1);
    });

    test('un nuevo beforeinstallprompt después de rechazar vuelve a habilitar la instalación', async () => {
        const { ventana, controlador } = preparar();
        ventana.dispatchEvent(crearAviso('dismissed'));
        await controlador.instalar();
        ventana.dispatchEvent(crearAviso('accepted'));
        assert.equal(controlador.estado.modo, MODOS.DISPONIBLE);
    });

    test('dos clics seguidos solo abren un diálogo', async () => {
        const { ventana, controlador } = preparar();
        const aviso = crearAviso();
        ventana.dispatchEvent(aviso);
        const [a, b] = await Promise.all([controlador.instalar(), controlador.instalar()]);
        assert.deepEqual([a, b], ['accepted', null]);
        assert.equal(aviso.llamadasPrompt, 1);
    });

    test('instalar sin aviso del navegador no hace nada', async () => {
        const { controlador } = preparar();
        assert.equal(await controlador.instalar(), null);
        assert.equal(controlador.estado.modo, MODOS.NO_DISPONIBLE);
    });

    test('si el diálogo falla se informa y se sugiere el menú del navegador', async () => {
        const { ventana, controlador } = preparar();
        ventana.dispatchEvent(crearAviso('accepted', { fallaPrompt: true }));
        assert.equal(await controlador.instalar(), null);
        assert.equal(controlador.estado.modo, MODOS.NO_DISPONIBLE);
        assert.match(controlador.estado.mensaje, /menú del navegador/);
    });

    test('appinstalled sin pasar por el botón (desde el menú del navegador) marca la app como instalada', () => {
        const { ventana, controlador } = preparar();
        ventana.dispatchEvent(new Event('appinstalled'));
        assert.equal(controlador.estado.modo, MODOS.INSTALADA);
    });

    for (const [caso, opciones] of [['display-mode standalone', { standalone: true }], ['navigator.standalone de iOS', { iosStandalone: true }]]) {
        test(`ya instalada (${caso}): se marca al iniciar e ignora beforeinstallprompt`, () => {
            const { ventana, controlador } = preparar(opciones);
            assert.equal(controlador.yaInstalada(), true);
            assert.equal(controlador.estado.modo, MODOS.INSTALADA);
            const aviso = crearAviso();
            ventana.dispatchEvent(aviso);
            assert.equal(controlador.estado.modo, MODOS.INSTALADA);
            assert.equal(aviso.defaultPrevented, true, 'tampoco se muestra el aviso del navegador');
        });
    }

    test('si la ventana pasa a modo standalone se marca como instalada', () => {
        const { ventana, controlador } = preparar();
        const cambio = new Event('change');
        cambio.matches = true;
        ventana.consulta.dispatchEvent(cambio);
        assert.equal(controlador.estado.modo, MODOS.INSTALADA);
    });

    test('detener() deja de escuchar los eventos', () => {
        const { ventana, controlador } = preparar();
        controlador.detener();
        ventana.dispatchEvent(crearAviso());
        ventana.dispatchEvent(new Event('appinstalled'));
        assert.equal(controlador.estado.modo, MODOS.NO_DISPONIBLE);
    });

    test('sin ventana (fuera del navegador) no falla', () => {
        const controlador = new ControladorInstalacion({ ventana: null });
        controlador.iniciar();
        controlador.detener();
        assert.equal(controlador.yaInstalada(), false);
    });
});

describe('ControladorInstalacion: estado reactivo', () => {
    test('no usa callback: expone suscribir() y sus claves son fijas', () => {
        const controlador = new ControladorInstalacion({ ventana: crearVentana(), alCambiar: () => { throw new Error('no se llama'); } });
        controlador.iniciar();
        assert.equal(typeof controlador.suscribir, 'function');
        assert.throws(() => { controlador.estado.otra = 1; }, TypeError);
    });

    test('cancelar la suscripción deja de avisar', async () => {
        const { ventana, controlador } = preparar();
        const avisos = [];
        const cancelar = controlador.suscribir(cambios => avisos.push([...cambios]));
        cancelar();
        ventana.dispatchEvent(crearAviso());
        await asentar();
        assert.deepEqual(avisos, []);
        assert.equal(controlador.estado.modo, MODOS.DISPONIBLE);
    });
});

describe('<install-prompt>', () => {
    let InstallPrompt;
    before(async () => {
        instalarDom();
        ({ default: InstallPrompt } = await import('../src/js/boundary/components/install_prompt.js'));
    });

    function montar(opciones) {
        const ventana = crearVentana(opciones);
        const controlador = new ControladorInstalacion({ ventana });
        const espia = { cancelados: 0, detenido: 0 };
        const suscribir = controlador.suscribir;
        controlador.suscribir = fn => { const c = suscribir(fn); return () => { espia.cancelados++; c(); }; };
        const detener = controlador.detener.bind(controlador);
        controlador.detener = () => { espia.detenido++; detener(); };
        const el = new InstallPrompt();
        el.controlador = controlador;
        const $ = id => el.shadowRoot.getElementById(id);
        return { el, ventana, controlador, espia, $ };
    }

    test('sin aviso del navegador el botón está oculto; con el aviso aparece', async () => {
        const { el, ventana, $ } = montar();
        conectar(el);
        assert.equal($('instalar').hidden, true);
        ventana.dispatchEvent(crearAviso());
        await asentar();
        assert.equal($('instalar').hidden, false);
        assert.equal($('instalar').disabled, false);
    });

    test('ya instalada: oculto desde el primer pintado', () => {
        const { el, $ } = montar({ standalone: true });
        conectar(el);
        assert.equal($('instalar').hidden, true);
    });

    test('al pulsar: deshabilitado mientras instala, y appinstalled lo oculta y lo anuncia', async () => {
        const { el, ventana, $ } = montar();
        conectar(el);
        const aviso = crearAviso('accepted');
        ventana.dispatchEvent(aviso);
        await asentar();
        $('instalar').dispatchEvent(new Event('click'));
        await asentar();
        assert.equal(aviso.llamadasPrompt, 1);
        assert.equal($('instalar').disabled, true);
        assert.equal($('estado').textContent, 'Instalando ChivoMed…');
        ventana.dispatchEvent(new Event('appinstalled'));
        await asentar();
        assert.equal($('instalar').hidden, true);
        assert.equal($('estado').textContent, 'ChivoMed quedó instalada en este dispositivo.');
    });

    test('al desconectarse cancela la suscripción, detiene el controlador y suelta el clic', async () => {
        const { el, ventana, espia, $ } = montar();
        conectar(el);
        desconectar(el);
        assert.equal(espia.cancelados, 1);
        assert.equal(espia.detenido, 1);
        const aviso = crearAviso();
        ventana.dispatchEvent(aviso);
        $('instalar').dispatchEvent(new Event('click'));
        await asentar();
        assert.equal(aviso.llamadasPrompt, 0);
    });

    test('el controlador solo se asigna antes de conectar', () => {
        const { el, controlador } = montar();
        conectar(el);
        assert.throws(() => { el.controlador = controlador; });
    });

    test('sin controlador inyectado crea el suyo con la ventana real y escucha su aviso', async () => {
        const ventana = crearVentana();
        globalThis.window = ventana;
        try {
            const el = new InstallPrompt();
            assert.equal(el.controlador, null, 'antes de conectar no hay controlador');
            conectar(el);
            assert.ok(el.controlador instanceof ControladorInstalacion);
            const $ = id => el.shadowRoot.getElementById(id);
            assert.equal($('instalar').hidden, true);
            ventana.dispatchEvent(crearAviso());
            await asentar();
            assert.equal($('instalar').hidden, false);
            desconectar(el);
        } finally {
            delete globalThis.window;
        }
    });
});

// Punto 7: invitación a instalar al buscar o al ingresar, una vez por sesión, con ventana propia.
describe('ControladorInstalacion: invitar una vez al buscar o al ingresar', () => {
    const conSesion = (opciones = {}) => {
        const ctx = preparar(opciones);
        const datos = new Map();
        ctx.ventana.sessionStorage = { getItem: k => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, String(v)) };
        return ctx;
    };

    test('ofrecerUnaVez() abre la invitación sin llamar a prompt(); aceptarla lo llama en ese clic', async () => {
        const { ventana, controlador } = conSesion();
        const aviso = crearAviso('dismissed');
        ventana.dispatchEvent(aviso);
        await asentar();
        assert.equal(controlador.ofrecerUnaVez(), true);
        assert.equal(controlador.estado.invitacion, true);
        assert.equal(aviso.llamadasPrompt, 0);
        const promesa = controlador.aceptarInvitacion();
        assert.equal(aviso.llamadasPrompt, 1, 'sin esperar: el navegador exige el gesto del usuario');
        assert.equal(controlador.estado.invitacion, false);
        assert.equal(await promesa, 'dismissed');
    });

    test('rechazarla no la vuelve a abrir en la sesión, aunque llegue otro beforeinstallprompt o se recargue', async () => {
        const { ventana, controlador } = conSesion();
        ventana.dispatchEvent(crearAviso());
        await asentar();
        controlador.ofrecerUnaVez();
        controlador.rechazarInvitacion();
        assert.equal(controlador.estado.invitacion, false);
        ventana.dispatchEvent(crearAviso());
        assert.equal(controlador.ofrecerUnaVez(), false);
        const otro = new ControladorInstalacion({ ventana });
        otro.iniciar();
        const tercero = crearAviso();
        ventana.dispatchEvent(tercero);
        assert.equal(otro.ofrecerUnaVez(), false, 'otra instancia en la misma sesión tampoco ofrece');
        assert.equal(tercero.llamadasPrompt, 0);
        assert.equal(controlador.estado.modo, MODOS.DISPONIBLE, 'el botón "Instalar app" sigue disponible');
    });

    test('no se abre si ya está instalada; sin beforeinstallprompt se abre con instrucciones', () => {
        const instalada = conSesion({ standalone: true });
        instalada.ventana.dispatchEvent(crearAviso());
        assert.equal(instalada.controlador.ofrecerUnaVez(), false);
        assert.equal(conSesion({ standalone: true }).controlador.ofrecerUnaVez(), false);
        const sinAviso = conSesion();
        assert.equal(sinAviso.controlador.ofrecerUnaVez(), true);
        assert.equal(sinAviso.controlador.estado.instrucciones, true);
        assert.equal(sinAviso.controlador.aceptarInvitacion(), null, 'sin beforeinstallprompt no hay prompt() que llamar');
        sinAviso.controlador.rechazarInvitacion();
        assert.equal(sinAviso.controlador.ofrecerUnaVez(), false, 'una vez por sesión');
    });

    test('si la persona la rechazó en el diálogo del navegador, no se abre después', async () => {
        const { ventana, controlador } = conSesion();
        ventana.dispatchEvent(crearAviso('dismissed'));
        await asentar();
        await controlador.instalar();
        ventana.dispatchEvent(crearAviso());
        assert.equal(controlador.ofrecerUnaVez(), false);
    });

    test('appinstalled con la invitación abierta la cierra', async () => {
        const { ventana, controlador } = conSesion();
        ventana.dispatchEvent(crearAviso());
        controlador.ofrecerUnaVez();
        ventana.dispatchEvent(new Event('appinstalled'));
        assert.equal(controlador.estado.invitacion, false);
    });

    test('sin sessionStorage (o si falla) solo se ofrece una vez por instancia', () => {
        const { ventana, controlador } = preparar();
        ventana.sessionStorage = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
        ventana.dispatchEvent(crearAviso());
        assert.equal(controlador.ofrecerUnaVez(), true);
        controlador.rechazarInvitacion();
        ventana.dispatchEvent(crearAviso());
        assert.equal(controlador.ofrecerUnaVez(), false);
    });
});

describe('<install-prompt>: escucha la invitación de las vistas', () => {
    test('"ofrecer-instalacion" abre la ventana y deja de escucharse al desconectarse', async () => {
        instalarDom();
        const { default: InstallPrompt } = await import('../src/js/boundary/components/install_prompt.js');
        const ventana = crearVentana();
        const controlador = new ControladorInstalacion({ ventana });
        const el = new InstallPrompt();
        el.controlador = controlador;
        conectar(el);
        ventana.dispatchEvent(crearAviso());
        await asentar();
        document.dispatchEvent(new CustomEvent('ofrecer-instalacion'));
        await asentar();
        assert.equal(el.shadowRoot.getElementById('invitacion').open, true);
        el.shadowRoot.getElementById('invitacion-no').click();
        desconectar(el);
        document.dispatchEvent(new CustomEvent('ofrecer-instalacion'));
        assert.equal(controlador.estado.invitacion, false);
    });
});

// Diagnóstico temporal: cada salida temprana de la invitación se anuncia en console.debug.
describe('ControladorInstalacion: diagnóstico en consola (temporal)', () => {
    function conEspia(fn) {
        const original = console.debug;
        const mensajes = [];
        console.debug = (...args) => mensajes.push(args.join(' '));
        try { fn(mensajes); } finally { console.debug = original; }
        return mensajes;
    }
    const conSesion = (opciones = {}) => {
        const ctx = preparar(opciones);
        const datos = new Map();
        ctx.ventana.sessionStorage = { getItem: k => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, String(v)) };
        return ctx;
    };

    test('sin beforeinstallprompt', () => {
        const { controlador } = conSesion();
        const m = conEspia(() => controlador.ofrecerUnaVez());
        assert.ok(m.some(t => t.includes('[ChivoMed instalación]') && t.includes('sin beforeinstallprompt')), JSON.stringify(m));
    });

    test('ya ofrecida en esta sesión', () => {
        const { ventana, controlador } = conSesion();
        ventana.dispatchEvent(crearAviso());
        controlador.ofrecerUnaVez();
        controlador.rechazarInvitacion();
        const m = conEspia(() => controlador.ofrecerUnaVez());
        assert.ok(m.some(t => t.includes('ya ofrecida en esta sesión')), JSON.stringify(m));
    });

    test('ventana ya abierta', () => {
        const { ventana, controlador } = conSesion();
        ventana.dispatchEvent(crearAviso());
        controlador.ofrecerUnaVez();
        const m = conEspia(() => controlador.ofrecerUnaVez());
        assert.ok(m.some(t => t.includes('ventana ya abierta')), JSON.stringify(m));
    });

    test('ya instalada', () => {
        const { ventana, controlador } = conSesion({ standalone: true });
        ventana.dispatchEvent(crearAviso());
        const m = conEspia(() => controlador.ofrecerUnaVez());
        assert.ok(m.some(t => t.includes('ya instalada')), JSON.stringify(m));
    });

    test('se abre', () => {
        const { ventana, controlador } = conSesion();
        ventana.dispatchEvent(crearAviso());
        const m = conEspia(() => controlador.ofrecerUnaVez());
        assert.ok(m.some(t => t.includes('[ChivoMed instalación]') && t.includes('abre la ventana')), JSON.stringify(m));
    });

    test('<install-prompt> anuncia que recibió el evento y que abrió el <dialog>', async () => {
        instalarDom();
        const { default: InstallPrompt } = await import('../src/js/boundary/components/install_prompt.js');
        const ventana = crearVentana();
        const el = new InstallPrompt();
        el.controlador = new ControladorInstalacion({ ventana });
        conectar(el);
        ventana.dispatchEvent(crearAviso());
        const original = console.debug;
        const m = [];
        console.debug = (...args) => m.push(args.join(' '));
        try {
            document.dispatchEvent(new CustomEvent('ofrecer-instalacion'));
            await asentar();
        } finally { console.debug = original; desconectar(el); }
        assert.ok(m.some(t => t.includes('ofrecer-instalacion recibido')), JSON.stringify(m));
        assert.ok(m.some(t => t.includes('showModal()')), JSON.stringify(m));
    });
});
