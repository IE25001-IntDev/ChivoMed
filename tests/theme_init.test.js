import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom } from './dobles/dom_minimo.js';
import { crearVentana, instalarVentana } from './dobles/ventana_doble.js';

// theme_init.js es un script clásico que corre una vez al cargarse, antes de los estilos.
// Cada caso lo vuelve a ejecutar importándolo con otra query (el módulo se evalúa de nuevo).
const CLAVE = 'chivomed-theme';
const COLOR = { dark: '#101f25', light: '#edf5f2' };

let ventana;
let restaurar;
let caso = 0;
const ejecutar = () => import(`../src/js/boundary/theme_init.js?caso=${++caso}`);
const html = () => document.documentElement;
const meta = () => document.querySelector('meta[name="theme-color"]');

before(() => {
    instalarDom();
    ventana = crearVentana();
    restaurar = instalarVentana(ventana);
});
after(() => restaurar());

beforeEach(() => {
    ventana.localStorage.falla = false;
    ventana.localStorage.clear();
    ventana.matchMedia().matches = false;
    delete html().dataset.theme;
    meta().content = '';
});

describe('theme_init.js', () => {
    for (const tema of ['light', 'dark']) {
        test(`la preferencia guardada "${tema}" manda sobre el sistema`, async () => {
            ventana.localStorage.setItem(CLAVE, tema);
            ventana.matchMedia().matches = tema === 'light';
            await ejecutar();
            assert.equal(html().dataset.theme, tema);
            assert.equal(meta().content, COLOR[tema]);
        });
    }

    for (const oscuro of [true, false]) {
        test(`sin preferencia sigue al sistema (${oscuro ? 'oscuro' : 'claro'})`, async () => {
            ventana.matchMedia().matches = oscuro;
            await ejecutar();
            const tema = oscuro ? 'dark' : 'light';
            assert.equal(html().dataset.theme, tema);
            assert.equal(meta().content, COLOR[tema]);
        });
    }

    test('un valor guardado desconocido se ignora y se usa el del sistema', async () => {
        ventana.localStorage.setItem(CLAVE, 'sepia');
        ventana.matchMedia().matches = true;
        await ejecutar();
        assert.equal(html().dataset.theme, 'dark');
    });

    test('si localStorage lanza (modo privado), no falla y usa el del sistema', async () => {
        ventana.localStorage.falla = true;
        ventana.matchMedia().matches = true;
        await ejecutar();
        assert.equal(html().dataset.theme, 'dark');
        assert.equal(meta().content, COLOR.dark);
    });
});
