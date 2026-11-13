import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, conectar, desconectar } from './dobles/dom_minimo.js';
import { crearVentana, instalarVentana } from './dobles/ventana_doble.js';

const CLAVE = 'chivomed-theme';
const COLOR = { dark: '#101f25', light: '#edf5f2' };

let ventana;
let restaurar;
before(async () => {
    instalarDom();
    ventana = crearVentana();
    restaurar = instalarVentana(ventana);
    await import('../src/js/boundary/components/theme_toggle.js');
});
after(() => restaurar());

// Cada prueba empieza en claro, con el sistema en claro y sin preferencia guardada.
beforeEach(() => {
    ventana.localStorage.falla = false;
    ventana.localStorage.clear();
    ventana.matchMedia().matches = false;
    document.documentElement.dataset.theme = 'light';
});
// Los botones de una prueba no deben seguir escuchando en la siguiente.
const montados = [];
afterEach(() => { for (const b of montados.splice(0)) if (b.isConnected) desconectar(b); });

const html = () => document.documentElement;
const meta = () => document.querySelector('meta[name="theme-color"]');

function montar() {
    const boton = conectar(document.createElement('theme-toggle'));
    montados.push(boton);
    const $ = selector => boton.shadowRoot.querySelector(selector);
    return { boton, $, pulsar: () => $('button').click() };
}

function almacenamiento(key, newValue) {
    return Object.assign(new Event('storage'), { key, newValue });
}

describe('<theme-toggle>: estado inicial', () => {
    test('en claro ofrece pasar a oscuro', () => {
        const { $ } = montar();
        assert.equal($('button').getAttribute('aria-pressed'), 'false');
        assert.equal($('button').title, 'Cambiar a modo oscuro');
        assert.equal($('.theme-label').textContent, 'Modo oscuro');
    });

    test('en oscuro (puesto por theme_init) ofrece volver a claro', () => {
        html().dataset.theme = 'dark';
        const { $ } = montar();
        assert.equal($('button').getAttribute('aria-pressed'), 'true');
        assert.equal($('button').title, 'Cambiar a modo claro');
        assert.equal($('.theme-label').textContent, 'Modo claro');
    });
});

describe('<theme-toggle>: clic', () => {
    test('alterna el tema del documento, el color de la barra y lo recuerda', () => {
        const t = montar();
        t.pulsar();
        assert.equal(html().dataset.theme, 'dark');
        assert.equal(meta().content, COLOR.dark);
        assert.equal(ventana.localStorage.getItem(CLAVE), 'dark');
        assert.equal(t.$('button').getAttribute('aria-pressed'), 'true');
        t.pulsar();
        assert.equal(html().dataset.theme, 'light');
        assert.equal(meta().content, COLOR.light);
        assert.equal(ventana.localStorage.getItem(CLAVE), 'light');
        assert.equal(t.$('.theme-label').textContent, 'Modo oscuro');
    });

    test('dos botones quedan sincronizados', () => {
        const uno = montar();
        const otro = montar();
        uno.pulsar();
        assert.equal(otro.$('button').getAttribute('aria-pressed'), 'true');
        assert.equal(otro.$('.theme-label').textContent, 'Modo claro');
    });

    test('sin almacenamiento (modo privado) el tema cambia igual en la sesión', () => {
        ventana.localStorage.falla = true;
        const t = montar();
        assert.doesNotThrow(() => t.pulsar());
        assert.equal(html().dataset.theme, 'dark');
        assert.equal(t.$('button').getAttribute('aria-pressed'), 'true');
    });
});

describe('<theme-toggle>: tema del sistema', () => {
    test('sin preferencia guardada sigue al sistema', () => {
        const t = montar();
        ventana.cambiarSistema(true);
        assert.equal(html().dataset.theme, 'dark');
        assert.equal(t.$('button').getAttribute('aria-pressed'), 'true');
        assert.equal(ventana.localStorage.getItem(CLAVE), null, 'seguir al sistema no guarda una preferencia');
        ventana.cambiarSistema(false);
        assert.equal(html().dataset.theme, 'light');
    });

    test('con preferencia guardada no cambia', () => {
        const t = montar();
        t.pulsar(); // guarda 'dark'
        ventana.cambiarSistema(false);
        assert.equal(html().dataset.theme, 'dark');
    });

    test('sin almacenamiento también sigue al sistema', () => {
        ventana.localStorage.falla = true;
        montar();
        ventana.cambiarSistema(true);
        assert.equal(html().dataset.theme, 'dark');
    });
});

describe('<theme-toggle>: cambios desde otra pestaña', () => {
    test('aplica el tema guardado en otra pestaña', () => {
        const t = montar();
        ventana.dispatchEvent(almacenamiento(CLAVE, 'dark'));
        assert.equal(html().dataset.theme, 'dark');
        assert.equal(t.$('button').getAttribute('aria-pressed'), 'true');
    });

    test('si otra pestaña borra el almacenamiento o guarda un valor inválido, vuelve al tema del sistema', () => {
        montar();
        html().dataset.theme = 'light';
        ventana.matchMedia().matches = true;
        ventana.dispatchEvent(almacenamiento(null, null));
        assert.equal(html().dataset.theme, 'dark');
        ventana.matchMedia().matches = false;
        ventana.dispatchEvent(almacenamiento(CLAVE, 'morado'));
        assert.equal(html().dataset.theme, 'light');
    });

    test('ignora las demás claves', () => {
        montar();
        ventana.dispatchEvent(almacenamiento('otra-clave', 'dark'));
        assert.equal(html().dataset.theme, 'light');
    });
});

describe('<theme-toggle>: ciclo de vida', () => {
    test('al desconectarse deja de escuchar el clic, el sistema y las otras pestañas', () => {
        const t = montar();
        desconectar(t.boton);
        t.pulsar();
        ventana.cambiarSistema(true);
        ventana.dispatchEvent(almacenamiento(CLAVE, 'dark'));
        assert.equal(html().dataset.theme, 'light');
        assert.equal(t.$('button').getAttribute('aria-pressed'), 'false');
    });

    test('al reconectarse no duplica el botón y vuelve a funcionar', () => {
        const t = montar();
        desconectar(t.boton);
        conectar(t.boton);
        assert.equal(t.boton.shadowRoot.querySelectorAll('button').length, 1);
        t.pulsar();
        assert.equal(html().dataset.theme, 'dark');
    });
});
