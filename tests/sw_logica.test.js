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

describe('atenderMensaje: reclamar una página sin control (Ctrl+Shift+R)', () => {
    const clientesDoble = () => {
        const llamadas = { claim: 0 };
        return { llamadas, clients: { claim: async () => { llamadas.claim++; } } };
    };

    test('{ tipo: "reclamar" } llama una vez a clients.claim() y devuelve su promesa', async () => {
        const { llamadas, clients } = clientesDoble();
        const promesa = SW.atenderMensaje({ tipo: 'reclamar' }, { clients });
        assert.ok(promesa instanceof Promise);
        await promesa;
        assert.equal(llamadas.claim, 1);
    });

    test('cualquier otro mensaje se ignora: devuelve null y no reclama', () => {
        const { llamadas, clients } = clientesDoble();
        for (const datos of [null, undefined, 'reclamar', 7, {}, { tipo: 'otro' }, { tipo: 'RECLAMAR' }]) {
            assert.equal(SW.atenderMensaje(datos, { clients }), null, JSON.stringify(datos));
        }
        assert.equal(llamadas.claim, 0);
    });

    test('sw.js escucha "message" y pasa la promesa de atenderMensaje a waitUntil', async () => {
        const { readFileSync } = await import('node:fs');
        const codigo = readFileSync(new URL('../src/sw.js', import.meta.url), 'utf8');
        assert.match(codigo, /addEventListener\(\s*["']message["']/);
        assert.match(codigo, /atenderMensaje\(\s*event\.data\s*,\s*\{\s*clients:\s*self\.clients\s*,\s*caches\s*,\s*fetch:[^}]*,\s*base\s*\}\s*\)/);
        assert.match(codigo, /event\.waitUntil\(/);
    });
});

// Punto 4: caché renovado en cada inicio con red, sin perder el modo sin conexión.
describe('renovar: copia nueva completa del precache y los catálogos', () => {
    const TIPOS_URL = url('/galenosv/api/publico/tipos-documento');
    const fetchNuevo = (marca = 'nuevo', falla = null) => crearFetch(destino => {
        if (falla && destino.endsWith(falla)) return new TypeError('Failed to fetch');
        if (destino === TIPOS_URL) return json([{ nombre: `DUI ${marca}` }]);
        return new Response(`${marca} ${new URL(destino).pathname}`);
    });
    const inicial = () => crearCaches({
        [SW.CACHE_SHELL]: { [url('/index.html')]: new Response('instalado /index.html') },
        [SW.CACHE_DATOS]: { [TIPOS_URL]: json([{ nombre: 'DUI instalado' }]) },
        'chivomed-shell-2026-01-01.1': {}, 'otra-app-v1': {},
    });
    const sinRedIndice = async caches => (await SW.responder(get('/', { mode: 'navigate' }), { fetch: sinRed(), caches, base: BASE })).text();
    const sinRedTipos = async caches => (await SW.responder(get('/galenosv/api/publico/tipos-documento'), { fetch: sinRed(), caches, base: BASE })).json();
    const nombresChivomed = async caches => (await caches.keys()).filter(n => n.startsWith(SW.PREFIJO)).sort();

    test('renovación completa: cambia al caché nuevo y borra los anteriores', async () => {
        assert.equal(typeof SW.renovar, 'function');
        const caches = inicial();
        const fetch = fetchNuevo();
        assert.equal(await SW.renovar({ caches, fetch, base: BASE }), true);
        assert.equal(fetch.llamadas.length, SW.PRECACHE.length + SW.CATALOGOS_PUBLICOS.length);
        const vigentes = await SW.cachesVigentes(caches);
        assert.notEqual(vigentes.shell, SW.CACHE_SHELL);
        assert.equal(caches.almacen.get(vigentes.shell).size, SW.PRECACHE.length);
        assert.deepEqual(await nombresChivomed(caches), [SW.CACHE_VIGENTE, vigentes.datos, vigentes.shell].sort());
        assert.ok((await caches.keys()).includes('otra-app-v1'), 'los cachés ajenos no se tocan');
        assert.equal(await sinRedIndice(caches), 'nuevo /index.html');
        assert.deepEqual(await sinRedTipos(caches), [{ nombre: 'DUI nuevo' }]);
    });

    test('fallo a medias: se descarta la copia nueva y se conserva la anterior', async () => {
        assert.equal(typeof SW.renovar, 'function');
        const caches = inicial();
        assert.equal(await SW.renovar({ caches, fetch: fetchNuevo('primera'), base: BASE }), true);
        const antes = await nombresChivomed(caches);
        assert.equal(await SW.renovar({ caches, fetch: fetchNuevo('segunda', '/js/boundary/router.js'), base: BASE }), false);
        assert.deepEqual(await nombresChivomed(caches), antes);
        assert.equal(await sinRedIndice(caches), 'primera /index.html');
        assert.deepEqual(await sinRedTipos(caches), [{ nombre: 'DUI primera' }]);
    });

    test('un catálogo que no responde 200 JSON también descarta la copia', async () => {
        assert.equal(typeof SW.renovar, 'function');
        const caches = inicial();
        const fetch = crearFetch(destino => (destino === TIPOS_URL ? json({ code: 'x' }, 503) : new Response('nuevo')));
        assert.equal(await SW.renovar({ caches, fetch, base: BASE }), false);
        assert.deepEqual(await nombresChivomed(caches), ['chivomed-shell-2026-01-01.1', SW.CACHE_DATOS, SW.CACHE_SHELL].sort());
        assert.equal(await sinRedIndice(caches), 'instalado /index.html');
    });

    test('sin red no se borra nada', async () => {
        assert.equal(typeof SW.renovar, 'function');
        const caches = inicial();
        assert.equal(await SW.renovar({ caches, fetch: sinRed(), base: BASE }), false);
        assert.deepEqual(caches.registro.borrados.filter(n => !n.includes(String(SW.VERSION) + '-')), []);
        assert.deepEqual(await nombresChivomed(caches), ['chivomed-shell-2026-01-01.1', SW.CACHE_DATOS, SW.CACHE_SHELL].sort());
        assert.equal(await sinRedIndice(caches), 'instalado /index.html');
    });

    test('dos pestañas a la vez: una sola descarga y un único juego final', async () => {
        assert.equal(typeof SW.renovar, 'function');
        const caches = inicial();
        const fetch = fetchNuevo();
        const contexto = { clients: { claim: async () => {} }, caches, fetch, base: BASE };
        const a = SW.atenderMensaje({ tipo: 'renovar' }, contexto);
        const b = SW.atenderMensaje({ tipo: 'renovar' }, contexto);
        assert.ok(a instanceof Promise);
        assert.equal(a, b, 'la segunda pestaña espera la misma renovación');
        assert.equal(await a, true);
        assert.equal(fetch.llamadas.length, SW.PRECACHE.length + SW.CATALOGOS_PUBLICOS.length);
        assert.equal((await nombresChivomed(caches)).length, 3);
        assert.equal(await sinRedIndice(caches), 'nuevo /index.html');
    });

    test('lo que se sirve y se guarda en tiempo de ejecución usa el caché vigente', async () => {
        assert.equal(typeof SW.renovar, 'function');
        const caches = inicial();
        await SW.renovar({ caches, fetch: fetchNuevo(), base: BASE });
        const { datos, shell } = await SW.cachesVigentes(caches);
        await SW.responder(get('/galenosv/api/publico/tipos-documento'), { fetch: crearFetch(() => json([{ nombre: 'DUI red' }])), caches, base: BASE });
        assert.deepEqual(await (await caches.almacen.get(datos).get(TIPOS_URL).clone()).json(), [{ nombre: 'DUI red' }]);
        const modulo = await SW.responder(get('/js/boundary/router.js'), { fetch: sinRed(), caches, base: BASE });
        assert.equal(await modulo.text(), 'nuevo /js/boundary/router.js');
        assert.ok(caches.almacen.has(shell));
    });

    test('activate conserva el caché vigente y su puntero', async () => {
        assert.equal(typeof SW.renovar, 'function');
        const caches = inicial();
        await SW.renovar({ caches, fetch: fetchNuevo(), base: BASE });
        const antes = await nombresChivomed(caches);
        await SW.limpiarVersionesViejas(caches);
        assert.deepEqual(await nombresChivomed(caches), antes);
        assert.equal(await sinRedIndice(caches), 'nuevo /index.html');
    });
});
