import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ControladorConexion, MENSAJE_SIN_RED } from '../src/js/boundary/pwa/controlador_conexion.js';
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
