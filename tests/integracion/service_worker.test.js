import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createContext, runInContext } from 'node:vm';

// Ejecuta los dos scripts reales; solo sustituye las APIs del navegador, sin simular su lógica.
function worker({ fallaInstalacion = false } = {}) {
    const eventos = new Map();
    const almacen = new Map([['chivomed-shell-antiguo', new Map()], ['otra-app', new Map()]]);
    const acciones = [];
    let enLinea = true;
    const contexto = createContext({ URL, Request, Response,
        registration: { scope: 'http://localhost:3000/' },
        clients: { claim: async () => { acciones.push('claim'); } },
        skipWaiting: async () => { acciones.push('skipWaiting'); },
        addEventListener: (tipo, fn) => eventos.set(tipo, fn),
        fetch: async solicitud => {
            if (!enLinea) throw new TypeError('sin red');
            const destino = typeof solicitud === 'string' ? solicitud : solicitud.url;
            return destino.includes('/galenosv/api/publico/')
                ? new Response('[]', { headers: { 'Content-Type': 'application/json' } })
                : new Response('red');
        },
        caches: {
            keys: async () => [...almacen.keys()],
            delete: async nombre => { acciones.push(nombre); return almacen.delete(nombre); },
            open: async nombre => {
                if (!almacen.has(nombre)) almacen.set(nombre, new Map());
                const cache = almacen.get(nombre);
                return {
                    addAll: async solicitudes => {
                        if (fallaInstalacion) throw new Error('precache incompleto');
                        for (const r of solicitudes) cache.set(r.url, new Response('copia instalada'));
                        acciones.push('precache');
                    },
                    match: async r => cache.get(typeof r === 'string' ? r : r.url)?.clone(),
                    put: async (r, respuesta) => {
                        const destino = typeof r === 'string' ? r : r.url;
                        if (destino.includes('/galenosv/api/') && !destino.includes('/publico/tipos-documento')) assert.fail('Solo se guardan catálogos públicos');
                        cache.set(destino, respuesta);
                    },
                };
            },
        },
    });
    contexto.self = contexto;
    const cargar = archivo => {
        const url = new URL(`../../src/${archivo}`, import.meta.url);
        runInContext(readFileSync(url, 'utf8'), contexto, { filename: fileURLToPath(url) });
    };
    contexto.importScripts = archivo => {
        assert.equal(archivo, './js/boundary/pwa/sw_logica.js');
        cargar(archivo);
    };
    cargar('sw.js');
    return { contexto, eventos, acciones, almacen, sinRed: () => { enLinea = false; } };
}

function emitir(w, tipo, datos = {}) {
    let promesa = null;
    w.eventos.get(tipo)({ ...datos, waitUntil: p => { promesa = p; }, respondWith: p => { promesa = p; } });
    return promesa;
}

test('PWA: instalación completa antes de activar; limpieza conserva cachés ajenos', async () => {
    const w = worker();
    await emitir(w, 'install');
    assert.deepEqual(w.acciones, ['precache', 'skipWaiting']);
    assert.equal(w.almacen.get(w.contexto.ChivoMedSW.CACHE_SHELL).size, w.contexto.ChivoMedSW.PRECACHE.length);
    await emitir(w, 'activate');
    assert.deepEqual(w.acciones.slice(2), ['chivomed-shell-antiguo', 'claim']);
    assert.equal(w.almacen.has('otra-app'), true);
});

test('PWA: una instalación incompleta rechaza y no toma el control', async () => {
    const w = worker({ fallaInstalacion: true });
    await assert.rejects(emitir(w, 'install'), /precache incompleto/);
    assert.deepEqual(w.acciones, []);
});

test('PWA: navegación y módulos funcionan sin red; sesión y escrituras quedan fuera del caché', async () => {
    const w = worker();
    await emitir(w, 'install');
    const request = { url: 'http://localhost:3000/js/boundary/router.js', method: 'GET', mode: 'cors' };
    assert.equal(await (await emitir(w, 'fetch', { request })).text(), 'red');
    w.sinRed();
    assert.equal(await (await emitir(w, 'fetch', { request })).text(), 'copia instalada');
    const navegacion = { ...request, url: 'http://localhost:3000/', mode: 'navigate' };
    assert.equal(await (await emitir(w, 'fetch', { request: navegacion })).text(), 'copia instalada');
    for (const [method, ruta] of [['GET', 'auth/me'], ['GET', 'atencion/dashboard'], ['POST', 'publico/citas'], ['PUT', 'consultas/1/cierre']]) {
        assert.equal(emitir(w, 'fetch', { request: { method, url: `http://localhost:3000/galenosv/api/${ruta}` } }), null);
    }
});

test('PWA: solo el mensaje reclamar extiende el evento hasta clients.claim()', async () => {
    const w = worker();
    assert.equal(emitir(w, 'message', { data: { tipo: 'desconocido' } }), null);
    await emitir(w, 'message', { data: { tipo: 'reclamar' } });
    assert.deepEqual(w.acciones, ['claim']);
});

test('PWA: el mensaje renovar descarga una copia nueva y, sin red, se sirve de ella', async () => {
    const w = worker();
    await emitir(w, 'install');
    const promesa = emitir(w, 'message', { data: { tipo: 'renovar' } });
    assert.ok(promesa, 'renovar extiende el evento con waitUntil');
    assert.equal(await promesa, true);
    const SW = w.contexto.ChivoMedSW;
    assert.equal(w.almacen.has(SW.CACHE_SHELL), false, 'la copia instalada se reemplaza');
    w.sinRed();
    const request = { url: 'http://localhost:3000/js/boundary/router.js', method: 'GET', mode: 'cors' };
    assert.equal(await (await emitir(w, 'fetch', { request })).text(), 'red');
});
