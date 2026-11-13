import { test, describe, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, conectar, desconectar } from './dobles/dom_minimo.js';
import { crearVentana, instalarVentana } from './dobles/ventana_doble.js';

const SIN_RED = 'Sin conexión. Puedes seguir navegando; las acciones que necesitan internet están deshabilitadas.';
const RESTABLECIDA = 'Conexión restablecida.';

// `conexion` (pwa/conexion.js) se crea al importarse con la `window` que haya: la ventana falsa va antes.
let ventana;
let restaurar;
before(async () => {
    instalarDom();
    ventana = crearVentana();
    restaurar = instalarVentana(ventana);
    await import('../src/js/boundary/components/estado_conexion.js');
});
after(() => restaurar());

const montados = [];
beforeEach(() => { mock.timers.enable({ apis: ['setTimeout'] }); });
afterEach(() => {
    for (const e of montados.splice(0)) if (e.isConnected) desconectar(e);
    if (!ventana.navigator.onLine) ventana.cambiarRed(true);
    mock.timers.reset();
});

function montar() {
    const aviso = conectar(document.createElement('estado-conexion'));
    montados.push(aviso);
    const estado = aviso.shadowRoot.getElementById('estado');
    const texto = () => aviso.shadowRoot.getElementById('texto').textContent;
    return { aviso, estado, texto };
}

describe('<estado-conexion>', () => {
    test('es una región viva: role="status", aria-live="polite" y aria-atomic', () => {
        const { estado } = montar();
        assert.equal(estado.getAttribute('role'), 'status');
        assert.equal(estado.getAttribute('aria-live'), 'polite');
        assert.equal(estado.getAttribute('aria-atomic'), 'true');
    });

    test('en línea al cargar no avisa nada', () => {
        const { estado, texto } = montar();
        assert.equal(estado.hidden, true);
        assert.equal(texto(), '');
        assert.equal(estado.getAttribute('data-estado'), 'en-linea');
    });

    test('sin red al cargar avisa de inmediato', () => {
        ventana.cambiarRed(false);
        const { estado, texto } = montar();
        assert.equal(estado.hidden, false);
        assert.equal(texto(), SIN_RED);
        assert.equal(estado.getAttribute('data-estado'), 'sin-red');
    });

    test('al perder la red avisa que las acciones que la necesitan están deshabilitadas', () => {
        const { estado, texto } = montar();
        ventana.cambiarRed(false);
        assert.equal(estado.hidden, false);
        assert.equal(texto(), SIN_RED);
        assert.equal(estado.getAttribute('data-estado'), 'sin-red');
    });

    test('al volver la red avisa "Conexión restablecida." y lo quita a los 4 s', () => {
        const { estado, texto } = montar();
        ventana.cambiarRed(false);
        ventana.cambiarRed(true);
        assert.equal(estado.hidden, false);
        assert.equal(texto(), RESTABLECIDA);
        assert.equal(estado.getAttribute('data-estado'), 'en-linea');
        mock.timers.tick(3999);
        assert.equal(texto(), RESTABLECIDA);
        mock.timers.tick(1);
        assert.equal(estado.hidden, true);
        assert.equal(texto(), '');
    });

    test('si la red se vuelve a cortar antes de los 4 s, el aviso de sin red no se borra', () => {
        const { estado, texto } = montar();
        ventana.cambiarRed(false);
        ventana.cambiarRed(true);
        mock.timers.tick(1000);
        ventana.cambiarRed(false);
        mock.timers.tick(5000);
        assert.equal(estado.hidden, false);
        assert.equal(texto(), SIN_RED);
    });

    test('al desconectarse deja de escuchar la red y cancela el temporizador', () => {
        const { aviso, texto } = montar();
        ventana.cambiarRed(false);
        ventana.cambiarRed(true);
        desconectar(aviso);
        mock.timers.tick(5000);
        assert.equal(texto(), RESTABLECIDA, 'el temporizador cancelado no borra el texto');
        ventana.cambiarRed(false);
        assert.equal(texto(), RESTABLECIDA, 'ya no escucha la red');
    });

    test('al reconectarse no duplica la región', () => {
        const { aviso } = montar();
        desconectar(aviso);
        conectar(aviso);
        assert.equal(aviso.shadowRoot.querySelectorAll('[role="status"]').length, 1);
    });
});
