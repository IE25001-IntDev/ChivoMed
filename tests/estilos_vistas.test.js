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

// Medido en Chromium: cada campo de fecha mide unos 160 px por sí solo, así que lado a lado
// necesitan 332 px de interior en la barra, que solo hay a 460 px de ventana. Con la barra en una
// columna (max-width: 460px), "Desde" y "Hasta" van una debajo de la otra, a todo el ancho.
test('citas.css: con la barra en una columna, las fechas van una debajo de la otra', async () => {
    const css = (await readFile(join(SRC, 'resources/citas.css'), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
    const bloque = css.match(/@media\s*\(max-width:\s*460px\)\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/)?.[1] ?? '';
    assert.match(bloque, /\.barra-busqueda\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/, 'la barra va en una columna');
    const fechas = bloque.match(/\.rango-fechas\s*\{([^}]*)\}/)?.[1] ?? '';
    assert.match(fechas, /display:\s*grid/, '.rango-fechas es una cuadrícula');
    assert.match(fechas, /grid-template-columns:\s*1fr\s*(;|$)/, `.rango-fechas tiene una sola columna (hoy: "${fechas.trim()}")`);
    assert.doesNotMatch(css, /\.rango-fechas[^{]*\{[^}]*min-width:\s*0/, 'no se aprietan con min-width: 0');
});

// Medido en Chromium con barra de scroll: los cinco campos caben en una línea (cada fecha unos
// 160 px) desde 1053 px de ventana. Con unos 40 px de margen, porque el campo de fecha cambia con
// el idioma, por debajo de 1093 px la barra usa el acomodo de tres columnas.
test('citas.css: la fila de cinco campos solo se usa desde 1093 px', async () => {
    const css = (await readFile(join(SRC, 'resources/citas.css'), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
    const tres = [...css.matchAll(/@media\s*\(max-width:\s*(\d+)px\)\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)]
        .find(([, , cuerpo]) => /\.barra-busqueda\s*\{[^}]*repeat\(3,/.test(cuerpo));
    assert.ok(tres, 'existe el acomodo de tres columnas');
    assert.equal(Number(tres[1]), 1092, `el acomodo de tres columnas llega hasta ${tres[1]} px`);
    assert.match(css, /\.barra-busqueda\s*\{[^}]*grid-template-columns:\s*repeat\(5,/, 'la fila de cinco sigue siendo el acomodo ancho');
});

// Sin reservar el espacio de la barra de scroll vertical, al aparecer o desaparecer (p. ej. al ocultarse
// "Falta completar el número…" mientras se escribe) todo el contenido se recentra unos 7 px.
test('app.css: html reserva siempre el espacio de la barra de scroll', async () => {
    const css = (await readFile(join(SRC, 'resources/app.css'), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.match(css, /(^|\})\s*html\s*\{[^}]*scrollbar-gutter:\s*stable\s*(;|\})/);
});
