import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import '../src/js/boundary/pwa/sw_logica.js';

const SW = globalThis.ChivoMedSW;
const BASE = 'http://127.0.0.1:3000/';
const url = ruta => new URL(ruta, BASE).href;
const json = (datos, status = 200) => new Response(JSON.stringify(datos), { status, headers: { 'Content-Type': 'application/json' } });

/** Doble de CacheStorage que registra cada operación. */
function crearCaches(inicial = {}) {
    const almacen = new Map(Object.entries(inicial).map(([nombre, entradas]) => [nombre, new Map(Object.entries(entradas))]));
    const registro = { abiertos: [], puestos: [], borrados: [], agregados: [] };
    return {
        almacen, registro,
        async open(nombre) {
            registro.abiertos.push(nombre);
            if (!almacen.has(nombre)) almacen.set(nombre, new Map());
            const mapa = almacen.get(nombre);
            const clave = solicitud => (typeof solicitud === 'string' ? solicitud : solicitud.url);
            return {
                async match(solicitud) { return mapa.get(clave(solicitud))?.clone(); },
                async put(solicitud, respuesta) { registro.puestos.push([nombre, clave(solicitud)]); mapa.set(clave(solicitud), respuesta); },
                async addAll(solicitudes) { registro.agregados.push(...solicitudes); for (const s of solicitudes) mapa.set(clave(s), new Response('ok')); },
            };
        },
        async keys() { return [...almacen.keys()]; },
        async delete(nombre) { registro.borrados.push(nombre); return almacen.delete(nombre); },
    };
}

/** Doble de fetch: responde con `respuesta(url)` o lanza TypeError si no hay red. */
function crearFetch(respuesta = () => new Response('red')) {
    const llamadas = [];
    const fn = async solicitud => {
        const destino = typeof solicitud === 'string' ? solicitud : solicitud.url;
        llamadas.push(destino);
        const r = respuesta(destino);
        if (r instanceof Error) throw r;
        return r;
    };
    fn.llamadas = llamadas;
    return fn;
}
const sinRed = () => crearFetch(() => new TypeError('Failed to fetch'));
const get = (ruta, extra = {}) => ({ method: 'GET', url: url(ruta), mode: 'cors', ...extra });

describe('clasificar', () => {
    const { ESTRATEGIAS: E } = SW;
    const casos = [
        ['navegación a la raíz', get('/', { mode: 'navigate' }), E.SHELL],
        ['navegación a una página vieja', get('/inicio.html', { mode: 'navigate' }), E.SHELL],
        ['módulo del shell', get('/js/boundary/router.js'), E.RED_PRIMERO_SHELL],
        ['hoja de estilos del shell', get('/resources/vistas.css'), E.RED_PRIMERO_SHELL],
        ['módulo del shell con query', get('/js/boundary/router.js?v=2'), E.NINGUNA],
        ['archivo fuera del precache', get('/js/boundary/medico.js'), E.NINGUNA],
        ['catálogo público', get('/galenosv/api/publico/tipos-documento'), E.PUBLICO],
        ['otro recurso público', get('/galenosv/api/publico/citas?doc=1'), E.PUBLICO],
        ['sesión', get('/galenosv/api/auth/me'), E.NINGUNA],
        ['datos clínicos', get('/galenosv/api/consultas/123/procedimientos'), E.NINGUNA],
        ['login (escritura)', { method: 'POST', url: url('/galenosv/api/auth/login') }, E.NINGUNA],
        ['escritura pública', { method: 'POST', url: url('/galenosv/api/publico/tipos-documento') }, E.NINGUNA],
        ['HEAD del shell', { method: 'HEAD', url: url('/index.html') }, E.NINGUNA],
        ['otro origen', { method: 'GET', url: 'https://otro.example/index.html', mode: 'navigate' }, E.NINGUNA],
        ['URL inválida', { method: 'GET', url: 'no es una url' }, E.NINGUNA],
    ];
    for (const [nombre, solicitud, esperada] of casos) {
        test(`${nombre} → ${esperada}`, () => assert.equal(SW.clasificar(solicitud, BASE), esperada));
    }
    test('fuera del alcance del service worker no se intercepta', () => {
        assert.equal(SW.clasificar(get('/otra-app/', { mode: 'navigate' }), url('/chivomed/')), SW.ESTRATEGIAS.NINGUNA);
    });
});

describe('esCatalogoCacheable', () => {
    test('solo los catálogos permitidos y sin query', () => {
        assert.equal(SW.esCatalogoCacheable(url('/galenosv/api/publico/tipos-documento')), true);
        assert.equal(SW.esCatalogoCacheable(url('/galenosv/api/publico/tipos-documento/')), true);
        assert.equal(SW.esCatalogoCacheable(url('/galenosv/api/publico/tipos-documento?x=1')), false);
        assert.equal(SW.esCatalogoCacheable(url('/galenosv/api/publico/citas')), false);
        assert.equal(SW.esCatalogoCacheable(url('/galenosv/api/tipos-documento')), false);
    });
});

describe('responder: auth, escrituras y datos clínicos', () => {
    for (const solicitud of [get('/galenosv/api/auth/me'), get('/galenosv/api/consultas'),
        { method: 'POST', url: url('/galenosv/api/auth/logout') }, { method: 'PUT', url: url('/galenosv/api/consultas/1/cierre') }]) {
        test(`${solicitud.method} ${new URL(solicitud.url).pathname} no se intercepta ni toca la caché`, () => {
            const caches = crearCaches();
            const fetch = crearFetch();
            assert.equal(SW.responder(solicitud, { fetch, caches, base: BASE }), null);
            assert.equal(fetch.llamadas.length, 0);
            assert.deepEqual(caches.registro.abiertos, []);
        });
    }
});

describe('responder: navegación servida desde index.html', () => {
    test('en línea pide index.html a la red, sin importar la ruta navegada', async () => {
        const fetch = crearFetch(() => new Response('<html>nuevo</html>'));
        const respuesta = await SW.responder(get('/inicio.html?x=1', { mode: 'navigate' }), { fetch, caches: crearCaches(), base: BASE });
        assert.deepEqual(fetch.llamadas, [url('/index.html')]);
        assert.equal(await respuesta.text(), '<html>nuevo</html>');
    });

    test('sin red responde con el index.html precacheado', async () => {
        const caches = crearCaches({ [SW.CACHE_SHELL]: { [url('/index.html')]: new Response('<html>cache</html>') } });
        const respuesta = await SW.responder(get('/', { mode: 'navigate' }), { fetch: sinRed(), caches, base: BASE });
        assert.equal(await respuesta.text(), '<html>cache</html>');
    });

    test('si el servidor responde con error se usa el precache', async () => {
        const caches = crearCaches({ [SW.CACHE_SHELL]: { [url('/index.html')]: new Response('<html>cache</html>') } });
        const respuesta = await SW.responder(get('/', { mode: 'navigate' }), {
            fetch: crearFetch(() => new Response('caído', { status: 502 })), caches, base: BASE,
        });
        assert.equal(await respuesta.text(), '<html>cache</html>');
    });

    test('sin red ni precache responde 503 en texto', async () => {
        const respuesta = await SW.responder(get('/', { mode: 'navigate' }), { fetch: sinRed(), caches: crearCaches(), base: BASE });
        assert.equal(respuesta.status, 503);
        assert.match(await respuesta.text(), /Sin conexión/);
    });
});

describe('responder: archivos del shell', () => {
    test('en línea siempre usa la red y no reescribe el precache', async () => {
        const caches = crearCaches();
        const fetch = crearFetch(() => new Response('export {}'));
        await SW.responder(get('/js/boundary/router.js'), { fetch, caches, base: BASE });
        assert.deepEqual(fetch.llamadas, [url('/js/boundary/router.js')]);
        assert.deepEqual(caches.registro.puestos, []);
    });

    test('sin red responde desde el precache', async () => {
        const caches = crearCaches({ [SW.CACHE_SHELL]: { [url('/js/boundary/router.js')]: new Response('// cache') } });
        const respuesta = await SW.responder(get('/js/boundary/router.js'), { fetch: sinRed(), caches, base: BASE });
        assert.equal(await respuesta.text(), '// cache');
    });

    test('un 404 de la red sin copia en precache se devuelve tal cual', async () => {
        const respuesta = await SW.responder(get('/js/boundary/router.js'), {
            fetch: crearFetch(() => new Response('no', { status: 404 })), caches: crearCaches(), base: BASE,
        });
        assert.equal(respuesta.status, 404);
    });
});

describe('responder: /galenosv/api/publico/* (red primero)', () => {
    const TIPOS = '/galenosv/api/publico/tipos-documento';

    test('en línea devuelve la red y guarda el catálogo en el caché de datos', async () => {
        const caches = crearCaches();
        const respuesta = await SW.responder(get(TIPOS), { fetch: crearFetch(() => json([{ nombre: 'DUI' }])), caches, base: BASE });
        assert.deepEqual(await respuesta.json(), [{ nombre: 'DUI' }]);
        assert.deepEqual(caches.registro.puestos, [[SW.CACHE_DATOS, url(TIPOS)]]);
    });

    test('sin red usa la copia guardada del catálogo', async () => {
        const caches = crearCaches();
        await SW.responder(get(TIPOS), { fetch: crearFetch(() => json([{ nombre: 'DUI' }])), caches, base: BASE });
        const respuesta = await SW.responder(get(TIPOS), { fetch: sinRed(), caches, base: BASE });
        assert.deepEqual(await respuesta.json(), [{ nombre: 'DUI' }]);
    });

    test('sin red ni copia responde 503 JSON', async () => {
        const respuesta = await SW.responder(get(TIPOS), { fetch: sinRed(), caches: crearCaches(), base: BASE });
        assert.equal(respuesta.status, 503);
        assert.equal(respuesta.headers.get('Content-Type').startsWith('application/json'), true);
        assert.equal((await respuesta.json()).code, 'sin.red');
    });

    for (const [caso, respuesta] of [['un error 401', () => json({ message: 'x' }, 401)], ['un 200 que no es JSON', () => new Response('<html>')]]) {
        test(`no guarda ${caso}`, async () => {
            const caches = crearCaches();
            await SW.responder(get(TIPOS), { fetch: crearFetch(respuesta), caches, base: BASE });
            assert.deepEqual(caches.registro.puestos, []);
        });
    }

    test('un recurso público que no es catálogo (p. ej. citas) nunca se guarda ni se sirve de caché', async () => {
        const CITAS = '/galenosv/api/publico/citas?documento=00000000-0';
        const caches = crearCaches();
        await SW.responder(get(CITAS), { fetch: crearFetch(() => json([{ fecha: 'hoy' }])), caches, base: BASE });
        assert.deepEqual(caches.registro.puestos, []);
        const offline = await SW.responder(get(CITAS), { fetch: sinRed(), caches, base: BASE });
        assert.equal(offline.status, 503);
    });
});

describe('instalación y activación', () => {
    test('precachear descarga toda la lista (sin caché HTTP) en el caché versionado del shell', async () => {
        const caches = crearCaches();
        const pedidas = [];
        await SW.precachear({ caches, base: BASE, crearSolicitud: u => { pedidas.push(u); return u; } });
        assert.deepEqual(caches.registro.abiertos, [SW.CACHE_SHELL]);
        assert.deepEqual(pedidas, SW.PRECACHE.map(ruta => new URL(ruta, BASE).href));
        assert.equal(caches.almacen.get(SW.CACHE_SHELL).size, SW.PRECACHE.length);
    });

    test('por defecto cada archivo se pide con cache: "reload"', async () => {
        const caches = crearCaches();
        await SW.precachear({ caches, base: BASE });
        assert.equal(caches.registro.agregados.length, SW.PRECACHE.length);
        for (const solicitud of caches.registro.agregados) {
            assert.ok(solicitud instanceof Request);
            assert.equal(solicitud.cache, 'reload', solicitud.url);
        }
    });

    test('los nombres de caché incluyen la versión', () => {
        assert.equal(SW.CACHE_SHELL, `chivomed-shell-${SW.VERSION}`);
        assert.equal(SW.CACHE_DATOS, `chivomed-datos-${SW.VERSION}`);
        assert.ok(SW.CACHE_DATOS.startsWith(SW.PREFIJO_DATOS));
    });

    test('activate borra solo las versiones viejas de ChivoMed', async () => {
        const caches = crearCaches({
            'chivomed-shell-2026-01-01.1': {}, 'chivomed-datos-2026-01-01.1': {},
            [SW.CACHE_SHELL]: {}, [SW.CACHE_DATOS]: {}, 'otra-app-v1': {},
        });
        const borrados = await SW.limpiarVersionesViejas(caches);
        assert.deepEqual(borrados.sort(), ['chivomed-datos-2026-01-01.1', 'chivomed-shell-2026-01-01.1']);
        assert.deepEqual((await caches.keys()).sort(), [SW.CACHE_DATOS, SW.CACHE_SHELL, 'otra-app-v1'].sort());
    });

    test('limpiarDatos borra los cachés de datos de cualquier versión y conserva el shell', async () => {
        const caches = crearCaches({ 'chivomed-datos-vieja': {}, [SW.CACHE_DATOS]: {}, [SW.CACHE_SHELL]: {}, 'otra-app-v1': {} });
        const borrados = await SW.limpiarDatos(caches);
        assert.deepEqual(borrados.sort(), [SW.CACHE_DATOS, 'chivomed-datos-vieja'].sort());
        assert.deepEqual((await caches.keys()).sort(), [SW.CACHE_SHELL, 'otra-app-v1'].sort());
    });

    test('la API pública del módulo no se puede modificar', () => {
        assert.ok(Object.isFrozen(SW));
        assert.ok(Object.isFrozen(SW.PRECACHE));
        assert.ok(Object.isFrozen(SW.CATALOGOS_PUBLICOS));
    });
});
