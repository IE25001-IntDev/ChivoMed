import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// El DOM mínimo no aplica CSS. Esta prueba fija la regla que hace que `hidden` oculte el host:
// sin ella, `:host { display: ... }` (regla de autor) gana a `[hidden] { display: none }` del navegador.
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const OCULTO = /:host\(\[hidden\]\)\s*\{\s*display:\s*none\s*!important;?\s*\}/;

async function archivos(dir) {
    const salida = [];
    for (const entrada of await readdir(dir, { withFileTypes: true })) {
        const ruta = join(dir, entrada.name);
        if (entrada.isDirectory()) salida.push(...await archivos(ruta));
        else if (/\.(css|js)$/.test(entrada.name)) salida.push(ruta);
    }
    return salida;
}

/** Hojas de estilo de un archivo: el .css entero, o cada bloque <style> de un .js. */
function hojas(ruta, texto) {
    if (ruta.endsWith('.css')) return [texto];
    return [...texto.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]);
}

/** Selectores de reglas que solo apuntan al host y le dan un display distinto de none. */
function hostsConDisplay(css) {
    const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '');
    return [...sinComentarios.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(([, selector, cuerpo]) => selector.split(',').some(s => /^\s*:host(\((?!\[hidden\])[^)]*\))?\s*$/.test(s))
            && /(^|;|\s)display\s*:\s*(?!none)/.test(cuerpo))
        .map(([, selector]) => selector.trim());
}

test('cada hoja con :host { display } también oculta el host con hidden', async () => {
    const faltan = [];
    for (const ruta of await archivos(SRC)) {
        const texto = await readFile(ruta, 'utf8');
        hojas(ruta, texto).forEach((css, i) => {
            const hosts = hostsConDisplay(css);
            if (hosts.length && !OCULTO.test(css)) faltan.push(`${relative(SRC, ruta)} [hoja ${i + 1}]: ${hosts.join(' | ')}`);
        });
    }
    assert.deepEqual(faltan, []);
});

test('el detector reconoce los casos que importan', () => {
    assert.deepEqual(hostsConDisplay(':host { display: block; }'), [':host']);
    assert.deepEqual(hostsConDisplay(':host(app-shell) { display: flex; }'), [':host(app-shell)']);
    assert.deepEqual(hostsConDisplay('@media (max-width: 9px) { :host { display: block; } }'), [':host']);
    assert.deepEqual(hostsConDisplay(':host{display:block;color:red}'), [':host']);
    assert.deepEqual(hostsConDisplay(':host([hidden]) { display: none !important; }'), []);
    assert.deepEqual(hostsConDisplay(':host(:hover) .tarjeta { display: grid; }'), []);
    assert.deepEqual(hostsConDisplay(':host { color: red; }'), []);
    assert.equal(OCULTO.test(':host([hidden]) { display: none; }'), false, 'sin !important no basta');
});
