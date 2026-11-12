import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ControladorInstalacion, MODOS } from '../src/js/boundary/pwa/controlador_instalacion.js';

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
    const controlador = new ControladorInstalacion({ ventana, alCambiar: e => estados.push(e.modo) });
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
        assert.equal(await controlador.instalar(), 'accepted');
        assert.equal(aviso.llamadasPrompt, 1);
        assert.equal(controlador.estado.modo, MODOS.INSTALANDO);
        ventana.dispatchEvent(new Event('appinstalled'));
        assert.equal(controlador.estado.modo, MODOS.INSTALADA);
        assert.match(controlador.estado.mensaje, /instalada/);
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
