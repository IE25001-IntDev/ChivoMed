import { test, describe, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { ControladorConexion, MENSAJE_SIN_RED, INTERVALO_VERIFICACION_MS } from '../src/js/boundary/pwa/controlador_conexion.js';
import { verificarServidor, CABECERA_COPIA } from '../src/js/control/auth_service.js';
import { conexion } from '../src/js/boundary/pwa/conexion.js';
import { registrarServiceWorker } from '../src/js/boundary/pwa/registro_sw.js';
import { limpiarCachesDeDatos } from '../src/js/boundary/pwa/caches_cliente.js';

function crearVentana(onLine = true) {
    const ventana = new EventTarget();
    ventana.navigator = { onLine };
    return ventana;
}

describe('ControladorConexion', () => {
    test('toma el estado inicial de navigator.onLine', () => {
        assert.equal(new ControladorConexion({ ventana: crearVentana(true) }).enLinea, true);
        assert.equal(new ControladorConexion({ ventana: crearVentana(false) }).enLinea, false);
    });

    test('avisa a los suscriptores en cada cambio, sin repetir el mismo estado', () => {
        const ventana = crearVentana(true);
        const controlador = new ControladorConexion({ ventana }).iniciar();
        const avisos = [];
        controlador.suscribir(enLinea => avisos.push(enLinea));
        for (const evento of ['offline', 'offline', 'online', 'online', 'offline']) ventana.dispatchEvent(new Event(evento));
        assert.deepEqual(avisos, [false, true, false]);
        assert.equal(controlador.enLinea, false);
    });

    test('cancelar la suscripción y detener() dejan de avisar', () => {
        const ventana = crearVentana(true);
        const controlador = new ControladorConexion({ ventana }).iniciar();
        const avisos = [];
        const cancelar = controlador.suscribir(enLinea => avisos.push(['a', enLinea]));
        controlador.suscribir(enLinea => avisos.push(['b', enLinea]));
        cancelar();
        ventana.dispatchEvent(new Event('offline'));
        controlador.detener();
        ventana.dispatchEvent(new Event('online'));
        assert.deepEqual(avisos, [['b', false]]);
        assert.equal(controlador.enLinea, false);
    });

    test('un suscriptor que se cancela durante el aviso no rompe a los demás', () => {
        const ventana = crearVentana(true);
        const controlador = new ControladorConexion({ ventana }).iniciar();
        const avisos = [];
        const cancelar = controlador.suscribir(() => { avisos.push('a'); cancelar(); });
        controlador.suscribir(() => avisos.push('b'));
        ventana.dispatchEvent(new Event('offline'));
        assert.deepEqual(avisos, ['a', 'b']);
    });

    test('sin ventana se considera en línea y no falla', () => {
        const controlador = new ControladorConexion({ ventana: null }).iniciar();
        assert.equal(controlador.enLinea, true);
        controlador.detener();
    });

    test('la instancia compartida funciona fuera del navegador', () => assert.equal(conexion.enLinea, true));
    test('el mensaje explica por qué la acción está deshabilitada', () => assert.match(MENSAJE_SIN_RED, /Sin conexión/));
});

// Punto 2: "servidor no disponible". DefaultService y auth_service avisan en document con
// "servidor-caido" (fallo de red, tiempo agotado o 502/503/504) y "servidor-respondio" (cualquier
// otra respuesta real del backend). Mientras está caído se verifica cada 20 s, al volver la red
// y al volver el foco a la pestaña.
describe('ControladorConexion: servidor no disponible', () => {
    beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
    afterEach(() => mock.timers.reset());

    /** Verificación falsa: resuelve lo que diga `respuestas` en orden (false por defecto) y cuenta las llamadas. */
    function crearVerificar(...respuestas) {
        const fn = async () => { fn.llamadas++; return respuestas.shift() ?? false; };
        fn.llamadas = 0;
        return fn;
    }
    function crear({ onLine = true, verificar = crearVerificar() } = {}) {
        const ventana = crearVentana(onLine);
        const documento = new EventTarget();
        const controlador = new ControladorConexion({ ventana, documento, verificar }).iniciar();
        const avisos = [];
        controlador.suscribir(enLinea => avisos.push([enLinea, controlador.motivo]));
        return { ventana, documento, controlador, avisos, verificar };
    }
    const caer = documento => documento.dispatchEvent(new Event('servidor-caido'));
    const responder = documento => documento.dispatchEvent(new Event('servidor-respondio'));
    const esperar = () => new Promise(resolver => setImmediate(resolver));

    test('servidor-caido marca sin conexión con motivo "servidor"; servidor-respondio vuelve a en línea', () => {
        const { documento, controlador, avisos } = crear();
        assert.equal(controlador.motivo, null);
        caer(documento);
        assert.equal(controlador.enLinea, false);
        assert.equal(controlador.motivo, 'servidor');
        caer(documento);
        responder(documento);
        assert.equal(controlador.enLinea, true);
        assert.equal(controlador.motivo, null);
        assert.deepEqual(avisos, [[false, 'servidor'], [true, null]]);
    });

    test('sin red el motivo es "sin-red"; al volver la red con el servidor caído pasa a "servidor" y verifica', async () => {
        const { ventana, documento, controlador, avisos, verificar } = crear();
        caer(documento);
        ventana.navigator.onLine = false;
        ventana.dispatchEvent(new Event('offline'));
        assert.equal(controlador.motivo, 'sin-red');
        ventana.navigator.onLine = true;
        ventana.dispatchEvent(new Event('online'));
        assert.equal(controlador.enLinea, false);
        assert.equal(controlador.motivo, 'servidor');
        await esperar();
        assert.equal(verificar.llamadas, 1);
        assert.deepEqual(avisos, [[false, 'servidor'], [false, 'sin-red'], [false, 'servidor']]);
    });

    test('mientras está caído verifica cada 20 s; cuando el backend responde queda en línea y deja de verificar', async () => {
        const { documento, controlador, verificar } = crear({ verificar: crearVerificar(false, true) });
        assert.equal(INTERVALO_VERIFICACION_MS, 20000);
        caer(documento);
        mock.timers.tick(19999);
        await esperar();
        assert.equal(verificar.llamadas, 0);
        mock.timers.tick(1);
        await esperar();
        assert.equal(verificar.llamadas, 1);
        assert.equal(controlador.enLinea, false);
        mock.timers.tick(20000);
        await esperar();
        assert.equal(verificar.llamadas, 2);
        assert.equal(controlador.enLinea, true);
        mock.timers.tick(60000);
        await esperar();
        assert.equal(verificar.llamadas, 2);
    });

    test('varios fallos seguidos no reinician el plazo de 20 s', async () => {
        const { documento, verificar } = crear();
        caer(documento);
        mock.timers.tick(15000);
        caer(documento);
        caer(documento);
        mock.timers.tick(5000);
        await esperar();
        assert.equal(verificar.llamadas, 1);
    });

    test('al volver el foco a la pestaña verifica de inmediato, solo si está caído', async () => {
        const { ventana, documento, verificar } = crear();
        ventana.dispatchEvent(new Event('focus'));
        documento.dispatchEvent(new Event('visibilitychange'));
        await esperar();
        assert.equal(verificar.llamadas, 0);
        caer(documento);
        documento.visibilityState = 'hidden';
        documento.dispatchEvent(new Event('visibilitychange'));
        await esperar();
        assert.equal(verificar.llamadas, 0);
        documento.visibilityState = 'visible';
        documento.dispatchEvent(new Event('visibilitychange'));
        await esperar();
        assert.equal(verificar.llamadas, 1);
        ventana.dispatchEvent(new Event('focus'));
        await esperar();
        assert.equal(verificar.llamadas, 2);
    });

    test('sin red no verifica (fallaría igual) pero sigue esperando su turno', async () => {
        const { ventana, documento, verificar } = crear();
        caer(documento);
        ventana.navigator.onLine = false;
        ventana.dispatchEvent(new Event('offline'));
        mock.timers.tick(20000);
        await esperar();
        assert.equal(verificar.llamadas, 0);
    });

    test('detener() deja de escuchar el documento y cancela la verificación programada', async () => {
        const { documento, controlador, verificar } = crear();
        caer(documento);
        controlador.detener();
        mock.timers.tick(40000);
        responder(documento);
        await esperar();
        assert.equal(verificar.llamadas, 0);
        assert.equal(controlador.enLinea, false);
    });
});

describe('verificarServidor (GET liviano, sin la copia del service worker)', () => {
    const fetchOriginal = globalThis.fetch;
    afterEach(() => { globalThis.fetch = fetchOriginal; });

    test('pide publico/tipos-documento?verificar=1 sin caché HTTP', async () => {
        const llamadas = [];
        globalThis.fetch = async (url, opciones) => { llamadas.push([url, opciones.cache, opciones.method ?? 'GET']); return Response.json([]); };
        assert.equal(await verificarServidor(), true);
        assert.deepEqual(llamadas, [['/galenosv/api/publico/tipos-documento?verificar=1', 'no-store', 'GET']]);
    });

    test('cualquier respuesta real del backend cuenta, aunque sea un error (401, 404, 500)', async () => {
        for (const status of [200, 401, 404, 500]) {
            globalThis.fetch = async () => new Response(null, { status });
            assert.equal(await verificarServidor(), true, `status ${status}`);
        }
    });

    test('un fallo de red, un 502/503/504 o la copia del service worker no cuentan', async () => {
        globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
        assert.equal(await verificarServidor(), false);
        for (const status of [502, 503, 504]) {
            globalThis.fetch = async () => new Response(null, { status });
            assert.equal(await verificarServidor(), false, `status ${status}`);
        }
        globalThis.fetch = async () => Response.json([], { headers: { [CABECERA_COPIA]: '1' } });
        assert.equal(await verificarServidor(), false);
    });
});

describe('registrarServiceWorker', () => {
    const avisoOriginal = console.warn;
    afterEach(() => { console.warn = avisoOriginal; });

    test('sin soporte de service workers devuelve null', async () => {
        assert.equal(await registrarServiceWorker({ navegador: {} }), null);
        assert.equal(await registrarServiceWorker({ navegador: undefined }), null);
    });

    test('registra src/sw.js con alcance en su carpeta y sin caché HTTP para las actualizaciones', async () => {
        const llamadas = [];
        const navegador = { serviceWorker: { register: async (...args) => { llamadas.push(args); return { scope: args[1].scope }; } } };
        const registro = await registrarServiceWorker({ navegador, url: new URL('http://127.0.0.1:3000/sw.js') });
        assert.deepEqual(llamadas, [['http://127.0.0.1:3000/sw.js', { scope: 'http://127.0.0.1:3000/', updateViaCache: 'none' }]]);
        assert.equal(registro.scope, 'http://127.0.0.1:3000/');
    });

    test('la URL por defecto apunta a src/sw.js', async () => {
        let registrada;
        await registrarServiceWorker({ navegador: { serviceWorker: { register: async u => { registrada = u; } } } });
        assert.ok(registrada.endsWith('/src/sw.js'), registrada);
    });

    // Ctrl+Shift+R carga la página sin control del SW y activate no vuelve a correr (no hay claim):
    // sin red, los <link> que crean las vistas fallan. Se le pide al SW activo que la reclame.
    const conActivo = ({ controller = null, active = undefined } = {}) => {
        const mensajes = [];
        const activo = active === undefined ? { postMessage: m => mensajes.push(m) } : active;
        return { mensajes, navegador: { serviceWorker: { controller, register: async () => ({ active: activo }) } } };
    };

    test('página sin control y SW activo: le pide que la reclame con { tipo: "reclamar" }', async () => {
        const { mensajes, navegador } = conActivo();
        await registrarServiceWorker({ navegador });
        assert.deepEqual(mensajes, [{ tipo: 'reclamar' }]);
    });

    test('página ya controlada: no envía mensaje', async () => {
        const { mensajes, navegador } = conActivo({ controller: {} });
        await registrarServiceWorker({ navegador });
        assert.deepEqual(mensajes, []);
    });

    test('primera instalación (sin SW activo todavía): no envía mensaje; activate hace el claim', async () => {
        const { navegador } = conActivo({ active: null });
        const registro = await registrarServiceWorker({ navegador });
        assert.deepEqual(registro, { active: null });
    });

    // Punto 4: cada inicio con red pide al SW que renueve su caché.
    test('con red y SW activo le pide { tipo: "renovar" }', async () => {
        const { mensajes, navegador } = conActivo({ controller: {} });
        navegador.onLine = true;
        await registrarServiceWorker({ navegador });
        assert.deepEqual(mensajes, [{ tipo: 'renovar' }]);
    });

    test('arranque sin red: no pide renovar', async () => {
        const { mensajes, navegador } = conActivo({ controller: {} });
        navegador.onLine = false;
        await registrarServiceWorker({ navegador });
        assert.deepEqual(mensajes, []);
    });

    test('si el registro falla devuelve null y no rompe la app', async () => {
        const avisos = [];
        console.warn = (...args) => avisos.push(args);
        const navegador = { serviceWorker: { register: async () => { throw new Error('SecurityError'); } } };
        assert.equal(await registrarServiceWorker({ navegador }), null);
        assert.equal(avisos.length, 1);
    });
});

describe('limpiarCachesDeDatos (al cerrar sesión)', () => {
    function crearCaches(nombres) {
        const lista = new Set(nombres);
        return { lista, keys: async () => [...lista], delete: async n => lista.delete(n) };
    }

    test('borra solo los cachés de datos y conserva el shell', async () => {
        const SW = globalThis.ChivoMedSW;
        const caches = crearCaches([SW.CACHE_SHELL, SW.CACHE_DATOS, 'chivomed-datos-vieja', 'otra-app']);
        const borrados = await limpiarCachesDeDatos(caches);
        assert.deepEqual(borrados.sort(), [SW.CACHE_DATOS, 'chivomed-datos-vieja'].sort());
        assert.deepEqual([...caches.lista].sort(), [SW.CACHE_SHELL, 'otra-app'].sort());
    });

    test('sin CacheStorage (o si falla) no rompe el cierre de sesión', async () => {
        assert.deepEqual(await limpiarCachesDeDatos(undefined), []);
        assert.deepEqual(await limpiarCachesDeDatos({ keys: async () => { throw new Error('SecurityError'); } }), []);
    });
});
