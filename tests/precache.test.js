import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import '../src/js/boundary/pwa/sw_logica.js';
import { RUTAS, RUTA_NO_ENCONTRADA } from '../src/js/boundary/rutas.js';

const SW = globalThis.ChivoMedSW;
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const BOUNDARY = path.join(SRC, 'js/boundary');
const leer = archivo => readFileSync(path.join(SRC, archivo), 'utf8');
const relativo = absoluto => path.relative(SRC, absoluto).split(path.sep).join('/');
const precache = new Set(SW.PRECACHE.map(ruta => ruta.replace(/^\.\//, '')));

/** Archivos que referencia un archivo de src/: imports, importScripts, new URL(…, import.meta.url), CSS y HTML. */
function referencias(archivo) {
    const texto = leer(archivo);
    const dir = path.dirname(path.join(SRC, archivo));
    const desde = ruta => relativo(path.resolve(dir, ruta));
    const encontradas = [];
    const agregar = (re, resolver = desde) => { for (const m of texto.matchAll(re)) encontradas.push(resolver(m[1])); };
    if (archivo.endsWith('.js')) {
        agregar(/\bimport\s+(?:[^'"`;]*?\sfrom\s+)?["']([^"']+)["']/g);
        agregar(/\bimportScripts\(\s*["']([^"']+)["']/g);
        agregar(/new URL\(\s*["'`]([^"'`$]+\.(?:js|css))["'`]\s*,\s*import\.meta\.url\)/g);
        // hojaDeEstilos("x.css") resuelve dentro de resources/.
        agregar(/hojaDeEstilos\(\s*["']([^"']+)["']\s*\)/g, nombre => `resources/${nombre}`);
    } else if (archivo.endsWith('.css')) {
        agregar(/@import\s+url\(\s*["']?([^"')]+)["']?\s*\)/g);
    } else if (archivo.endsWith('.html')) {
        agregar(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"#:]+)"/g);
    } else if (archivo.endsWith('.webmanifest')) {
        for (const icono of JSON.parse(texto).icons) encontradas.push(desde(icono.src));
    }
    return encontradas;
}

/** Cierre de todo lo que la SPA puede cargar: index.html, el manifest y el módulo de cada ruta. */
function cierre() {
    const entradas = ['index.html', 'manifest.webmanifest',
        ...[...RUTAS, RUTA_NO_ENCONTRADA].map(r => relativo(path.resolve(BOUNDARY, r.modulo)))];
    const vistos = new Set();
    const pendientes = [...entradas];
    while (pendientes.length) {
        const archivo = pendientes.pop();
        if (vistos.has(archivo)) continue;
        vistos.add(archivo);
        if (/\.(js|css|html|webmanifest)$/.test(archivo) && existsSync(path.join(SRC, archivo))) pendientes.push(...referencias(archivo));
    }
    vistos.delete('sw.js'); // El script del service worker nunca se precachea: el navegador lo revisa en cada actualización.
    return vistos;
}

describe('Lista de precache', () => {
    test('incluye el módulo de cada ruta de rutas.js y la vista de no encontrada', () => {
        for (const ruta of [...RUTAS, RUTA_NO_ENCONTRADA]) {
            const archivo = relativo(path.resolve(BOUNDARY, ruta.modulo));
            assert.ok(precache.has(archivo), `${ruta.tag}: falta ${archivo}`);
        }
    });

    test('coincide exactamente con todo lo que la SPA puede cargar (sin faltantes ni sobrantes)', () => {
        const esperado = [...cierre()].sort();
        const actual = [...precache].sort();
        assert.deepEqual(actual.filter(a => !esperado.includes(a)), [], 'sobran en PRECACHE');
        assert.deepEqual(esperado.filter(e => !actual.includes(e)), [], 'faltan en PRECACHE');
    });

    test('cada archivo existe en disco (addAll falla completo si uno no existe)', () => {
        for (const archivo of precache) assert.ok(existsSync(path.join(SRC, archivo)), archivo);
    });

    test('no hay rutas repetidas ni archivos fuera de src/', () => {
        assert.equal(precache.size, SW.PRECACHE.length);
        for (const ruta of SW.PRECACHE) assert.match(ruta, /^\.\/(?!\.)/, ruta);
    });

    test('no se precachea el service worker, las páginas viejas ni la API', () => {
        for (const ruta of SW.PRECACHE) {
            assert.ok(!/(^|\/)sw\.js$/.test(ruta), ruta);
            assert.ok(!ruta.includes('paginas/') && !ruta.includes('galenosv/api'), ruta);
        }
        assert.ok(!precache.has('inicio.html') && !precache.has('portada.html'));
    });

    test('sw.js carga la lógica con importScripts desde la ruta precacheada', () => {
        const [importada] = referencias('sw.js');
        assert.equal(importada, 'js/boundary/pwa/sw_logica.js');
        assert.ok(precache.has(importada));
    });
});

describe('Manifest e íconos', () => {
    const manifest = JSON.parse(leer('manifest.webmanifest'));
    const dimensiones = archivo => {
        const png = readFileSync(path.join(SRC, archivo));
        assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${archivo} no es PNG`);
        return `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
    };

    test('nombre, modo de visualización, start_url y scope correctos', () => {
        assert.equal(manifest.name, 'ChivoMed');
        assert.ok(manifest.short_name && manifest.short_name.length <= 12);
        assert.equal(manifest.display, 'standalone');
        assert.equal(manifest.scope, './');
        const base = 'http://127.0.0.1:3000/';
        const inicio = new URL(manifest.start_url, base).href;
        assert.ok(inicio.startsWith(new URL(manifest.scope, base).href), 'start_url dentro del scope');
        assert.equal(new URL(manifest.start_url, base).hash, '', 'el router decide la ruta inicial');
    });

    test('los colores coinciden con el tema claro de la app', () => {
        const fondo = /--background:\s*(#[0-9a-f]{6})/i.exec(leer('resources/theme.css'))[1].toLowerCase();
        const meta = /<meta name="theme-color" content="(#[0-9a-f]{6})"/i.exec(leer('index.html'))[1].toLowerCase();
        assert.equal(manifest.background_color, fondo);
        assert.equal(manifest.theme_color, meta);
    });

    test('íconos PNG de 192 y 512 px en versión normal y maskable, con el tamaño declarado', () => {
        for (const proposito of ['any', 'maskable']) {
            const tamanos = manifest.icons.filter(i => i.purpose === proposito).map(i => i.sizes).sort();
            assert.deepEqual(tamanos, ['192x192', '512x512'], proposito);
        }
        for (const icono of manifest.icons) {
            assert.equal(icono.type, 'image/png');
            assert.equal(dimensiones(icono.src), icono.sizes, icono.src);
        }
    });

    test('index.html enlaza el manifest y el dev_server lo sirve con su tipo MIME', () => {
        assert.match(leer('index.html'), /<link rel="manifest" href="\.\/manifest\.webmanifest" \/>/);
        assert.match(readFileSync(new URL('../scripts/dev_server.js', import.meta.url), 'utf8'), /'\.webmanifest': 'application\/manifest\+json/);
    });
});
