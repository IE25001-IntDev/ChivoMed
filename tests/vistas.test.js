import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { RUTAS, RUTA_NO_ENCONTRADA } from '../src/js/boundary/rutas.js';

// Node no tiene DOM: dobles mínimos de HTMLElement y customElements para comprobar que cada módulo
// registra su Web Component sin tocar el documento al importarse.
const registro = new Map();
before(() => {
    globalThis.HTMLElement = class {};
    globalThis.customElements = {
        define(nombre, clase) {
            if (registro.has(nombre)) throw new Error(`${nombre} ya está definido`);
            registro.set(nombre, clase);
        },
        get: nombre => registro.get(nombre),
    };
});

describe('Registro de Web Components', () => {
    test('cada vista define el tag que espera la tabla de rutas', async () => {
        for (const ruta of [...RUTAS, RUTA_NO_ENCONTRADA]) {
            const modulo = await import(new URL(ruta.modulo, new URL('../src/js/boundary/', import.meta.url)).href);
            assert.equal(registro.get(ruta.tag), modulo.default, ruta.tag);
        }
    });

    test('app-shell y session-bar se registran como Web Components', async () => {
        const shell = await import('../src/js/boundary/components/app_shell.js');
        const barra = await import('../src/js/boundary/components/session_bar.js');
        assert.equal(registro.get('app-shell'), shell.default);
        assert.equal(registro.get('session-bar'), barra.default);
        assert.ok(registro.has('theme-toggle'), 'el shell incluye el selector de tema');
        assert.ok(registro.has('install-prompt'), 'el shell incluye el botón de instalación');
        assert.ok(registro.has('estado-conexion'), 'el shell incluye el aviso de conexión');
    });

    test('index.html no contiene más elementos en el body que <app-shell>', async () => {
        const { readFile } = await import('node:fs/promises');
        const html = await readFile(new URL('../src/index.html', import.meta.url), 'utf8');
        const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
        const etiquetas = [...body.matchAll(/<([a-z][a-z0-9-]*)/g)].map(m => m[1]);
        assert.deepEqual(etiquetas, ['app-shell', 'noscript']);
        assert.match(body.trim(), /^<app-shell>[\s\S]*<\/app-shell>$/, 'noscript va dentro de <app-shell>');
    });
});
