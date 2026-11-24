import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { ControladorInstalacion, MODOS, EVENTO_INSTALAR } from '../src/js/boundary/pwa/controlador_instalacion.js';
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

// Punto 7: invitación a instalar al buscar o al ingresar, en cada vez, hasta que la app se instale.
describe('ControladorInstalacion: invitar hasta que la app se instale', () => {
    const conAlmacen = (opciones = {}, { bloqueado = false } = {}) => {
        const ctx = preparar(opciones);
        const datos = new Map();
        const almacen = { getItem: k => datos.get(k) ?? null, setItem: (k, v) => datos.set(k, String(v)), removeItem: k => datos.delete(k) };
        Object.defineProperty(ctx.ventana, 'localStorage', { get() { if (bloqueado) throw new Error('SecurityError'); return almacen; } });
        assert.equal(typeof ctx.controlador.invitar, 'function', 'existe invitar()');
        assert.equal(typeof ctx.controlador.cerrarInvitacion, 'function', 'existe cerrarInvitacion()');
        return { ...ctx, datos };
    };

    test('invitar() abre la ventana sin llamar a prompt(); aceptarla lo llama en ese clic', async () => {
        const { ventana, controlador } = conAlmacen();
        const aviso = crearAviso('dismissed');
        ventana.dispatchEvent(aviso);
        await asentar();
        assert.equal(controlador.invitar(), true);
        assert.equal(controlador.estado.invitacion, true);
        assert.equal(controlador.estado.instrucciones, false);
        assert.equal(aviso.llamadasPrompt, 0);
        const promesa = controlador.aceptarInvitacion();
        assert.equal(aviso.llamadasPrompt, 1, 'sin esperar: el navegador exige el gesto del usuario');
        assert.equal(controlador.estado.invitacion, false);
        assert.equal(await promesa, 'dismissed');
    });

    test('cerrarla vale solo esa vez: sale de nuevo en la siguiente', () => {
        const { ventana, controlador } = conAlmacen();
        ventana.dispatchEvent(crearAviso());
        assert.equal(controlador.invitar(), true);
        controlador.cerrarInvitacion();
        assert.equal(controlador.estado.invitacion, false);
        assert.equal(controlador.invitar(), true);
        assert.equal(controlador.invitar(), false, 'no se abre encima de sí misma');
    });

    test('sin beforeinstallprompt se abre con instrucciones y sin prompt() que llamar', () => {
        const { controlador } = conAlmacen();
        assert.equal(controlador.invitar(), true);
        assert.equal(controlador.estado.instrucciones, true);
        assert.equal(controlador.aceptarInvitacion(), null);
    });

    test('appinstalled guarda chivomed:instalada y desde ahí no sale, tampoco en otra carga', () => {
        const { ventana, controlador, datos } = conAlmacen();
        ventana.dispatchEvent(crearAviso());
        ventana.dispatchEvent(new Event('appinstalled'));
        assert.equal(datos.get('chivomed:instalada'), '1');
        assert.equal(controlador.invitar(), false);
        const otra = new ControladorInstalacion({ ventana });
        otra.iniciar();
        assert.equal(otra.invitar(), false, 'pestaña normal, sin beforeinstallprompt');
        assert.equal(otra.estado.modo, MODOS.NO_DISPONIBLE, 'el botón de la cabecera no cambia');
    });

    test('beforeinstallprompt borra la marca: no está instalada', () => {
        const { ventana, controlador, datos } = conAlmacen();
        datos.set('chivomed:instalada', '1');
        assert.equal(controlador.invitar(), false);
        ventana.dispatchEvent(crearAviso());
        assert.equal(datos.has('chivomed:instalada'), false);
        assert.equal(controlador.invitar(), true);
    });

    test('en modo standalone no sale nunca', () => {
        const { ventana, controlador, datos } = conAlmacen({ standalone: true });
        assert.equal(controlador.invitar(), false);
        ventana.dispatchEvent(crearAviso());
        assert.equal(controlador.invitar(), false);
        assert.equal(datos.has('chivomed:instalada'), false);
    });

    test('getInstalledRelatedApps: con resultados no sale; si falla o no existe, sigue con la marca', async () => {
        const conApoyo = conAlmacen();
        conApoyo.ventana.navigator.getInstalledRelatedApps = async () => [{ platform: 'webapp' }];
        const c1 = new ControladorInstalacion({ ventana: conApoyo.ventana });
        c1.iniciar();
        await asentar();
        assert.equal(c1.invitar(), false);
        conApoyo.ventana.dispatchEvent(crearAviso());
        assert.equal(c1.invitar(), true, 'beforeinstallprompt manda: no está instalada');
        const falla = conAlmacen();
        falla.ventana.navigator.getInstalledRelatedApps = async () => { throw new Error('NotSupported'); };
        const c2 = new ControladorInstalacion({ ventana: falla.ventana });
        c2.iniciar();
        await asentar();
        assert.equal(c2.invitar(), true);
        assert.equal(conAlmacen().controlador.invitar(), true, 'sin la API');
    });

    test('con localStorage bloqueado no se rompe', () => {
        const { ventana, controlador } = conAlmacen({}, { bloqueado: true });
        assert.doesNotThrow(() => ventana.dispatchEvent(crearAviso()));
        assert.equal(controlador.invitar(), true);
        controlador.cerrarInvitacion();
        assert.doesNotThrow(() => ventana.dispatchEvent(new Event('appinstalled')));
        assert.equal(controlador.invitar(), false, 'instalada en esta página');
    });

    test('ya no usa sessionStorage', () => {
        const { ventana, controlador } = conAlmacen();
        ventana.sessionStorage = { getItem() { throw new Error('no se usa'); }, setItem() { throw new Error('no se usa'); } };
        ventana.dispatchEvent(crearAviso());
        assert.equal(controlador.invitar(), true);
        controlador.cerrarInvitacion();
        assert.equal(controlador.invitar(), true);
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

describe('ControladorInstalacion: ofrecer al descargar un ticket', () => {
    test('con beforeinstallprompt sin usar llama a prompt() en ese toque, sin abrir la invitación', async () => {
        const { ventana, controlador } = preparar();
        const aviso = crearAviso('dismissed');
        ventana.dispatchEvent(aviso);
        await asentar();
        const promesa = controlador.ofrecerAlDescargar();
        assert.equal(aviso.llamadasPrompt, 1, 'sin esperar: dentro del gesto del usuario');
        assert.equal(controlador.estado.invitacion, false);
        assert.equal(await promesa, 'dismissed');
    });

    test('si el evento ya se usó (rechazado o con "Instalar" de la invitación) no hace nada', async () => {
        const { ventana, controlador } = preparar();
        const aviso = crearAviso('dismissed');
        ventana.dispatchEvent(aviso);
        await asentar();
        controlador.invitar();
        await controlador.aceptarInvitacion();
        assert.equal(controlador.ofrecerAlDescargar(), null);
        assert.equal(aviso.llamadasPrompt, 1);
        assert.equal(controlador.estado.invitacion, false, 'tampoco abre la invitación');
    });

    test('un beforeinstallprompt nuevo después de usar el anterior se puede ofrecer otra vez', async () => {
        const { ventana, controlador } = preparar();
        const primero = crearAviso('dismissed');
        ventana.dispatchEvent(primero);
        await asentar();
        await controlador.ofrecerAlDescargar();
        const segundo = crearAviso('dismissed');
        ventana.dispatchEvent(segundo);
        await asentar();
        controlador.ofrecerAlDescargar();
        assert.equal(segundo.llamadasPrompt, 1);
    });

    test('sin beforeinstallprompt (Safari de iPhone) hace lo mismo que invitar(): instrucciones', () => {
        const { controlador } = preparar();
        assert.equal(controlador.ofrecerAlDescargar(), null);
        assert.equal(controlador.estado.invitacion, true);
        assert.equal(controlador.estado.instrucciones, true);
    });

    test('con la invitación ya abierta no hace nada más', async () => {
        const { ventana, controlador } = preparar();
        const aviso = crearAviso();
        ventana.dispatchEvent(aviso);
        await asentar();
        controlador.invitar();
        assert.equal(controlador.ofrecerAlDescargar(), null);
        assert.equal(aviso.llamadasPrompt, 0);
    });

    for (const caso of ['standalone', 'iOS']) {
        test(`ya instalada (${caso}): no ofrece nada`, async () => {
            const { ventana, controlador } = preparar(caso === 'iOS' ? { iosStandalone: true } : { standalone: true });
            const aviso = crearAviso();
            ventana.dispatchEvent(aviso);
            await asentar();
            assert.equal(controlador.ofrecerAlDescargar(), null);
            assert.equal(aviso.llamadasPrompt, 0);
            assert.equal(controlador.estado.invitacion, false);
        });
    }

    test('instalada en este navegador (appinstalled) o instalándose: no ofrece nada', async () => {
        const { ventana, controlador } = preparar();
        ventana.dispatchEvent(new Event('appinstalled'));
        assert.equal(controlador.ofrecerAlDescargar(), null);
        assert.equal(controlador.estado.invitacion, false);
    });

    test('invitar() (búsqueda e inicio de sesión) no cambia: sigue abriendo la invitación con el evento sin usar', async () => {
        const { ventana, controlador } = preparar();
        const aviso = crearAviso();
        ventana.dispatchEvent(aviso);
        await asentar();
        assert.equal(controlador.invitar(), true);
        assert.equal(controlador.estado.instrucciones, false);
        assert.equal(aviso.llamadasPrompt, 0);
    });
});

describe('<install-prompt>: escucha la descarga del ticket', () => {
    test(`"${EVENTO_INSTALAR}" llama a ofrecerAlDescargar() y deja de escucharse al desconectarse`, async () => {
        instalarDom();
        const { default: InstallPrompt } = await import('../src/js/boundary/components/install_prompt.js');
        const ventana = crearVentana();
        const controlador = new ControladorInstalacion({ ventana });
        const el = new InstallPrompt();
        el.controlador = controlador;
        conectar(el);
        const aviso = crearAviso('dismissed');
        ventana.dispatchEvent(aviso);
        await asentar();
        document.dispatchEvent(new CustomEvent(EVENTO_INSTALAR));
        assert.equal(aviso.llamadasPrompt, 1);
        assert.equal(el.shadowRoot.getElementById('invitacion').open, false, 'no abre la invitación propia');
        await asentar();
        desconectar(el);
        const otro = crearAviso();
        ventana.dispatchEvent(otro);
        document.dispatchEvent(new CustomEvent(EVENTO_INSTALAR));
        assert.equal(otro.llamadasPrompt, 0);
    });
});
