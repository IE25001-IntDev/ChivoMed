import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { instalarDom } from './dobles/dom_minimo.js';
import { plantilla } from '../src/js/boundary/plantilla.js';
import '../src/js/boundary/pwa/sw_logica.js';

describe('plantilla()', () => {
    test('importar y declarar una plantilla no necesita document (es perezosa)', () => {
        assert.equal(typeof globalThis.document, 'undefined');
        assert.doesNotThrow(() => plantilla('<p id="x"></p>'));
    });

    describe('con DOM', () => {
        before(() => instalarDom());

        test('crea el <template> una sola vez y cada clon es independiente', () => {
            const original = document.createElement;
            let creados = 0;
            document.createElement = tag => { if (tag === 'template') creados++; return original(tag); };
            try {
                const P = plantilla('<p id="x">Hola</p>');
                const a = P.clonar();
                const b = P.clonar();
                assert.equal(creados, 1);
                a.getElementById('x').textContent = 'cambiado';
                assert.equal(b.getElementById('x').textContent, 'Hola');
            } finally {
                document.createElement = original;
            }
        });
    });

    test('exige el HTML como texto', () => {
        assert.throws(() => plantilla(null), TypeError);
    });
});

describe('Norma de innerHTML en la SPA', () => {
    test('ningún JS que carga la SPA asigna innerHTML salvo plantilla.js', () => {
        const archivos = globalThis.ChivoMedSW.PRECACHE.filter(r => r.endsWith('.js') && !r.endsWith('/plantilla.js'));
        assert.ok(archivos.length > 20);
        for (const ruta of archivos) {
            const codigo = readFileSync(new URL(`../src/${ruta.replace(/^\.\//, '')}`, import.meta.url), 'utf8');
            assert.doesNotMatch(codigo, /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(/, ruta);
        }
    });
});
