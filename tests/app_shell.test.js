import { test, describe, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, conectar, desconectar } from './dobles/dom_minimo.js';
import { crearVentana, instalarVentana, hasta } from './dobles/ventana_doble.js';

// Datos inventados; nunca datos reales.
const UUID = n => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sesion = (codigo = 'DOCTOR') => ({
    usuario: { idUsuario: UUID(1), idPersona: UUID(2), nombres: 'Ana', apellidos: 'Prueba' },
    rolActivo: { idPersonaRol: UUID(3), codigo, idClinica: UUID(4), nombreClinica: 'Clínica de prueba' },
    csrfToken: 'csrf-prueba',
});
const json = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
const pausa = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms));

// `conexion` se crea al importarse con la `window` que haya: la ventana falsa va antes del import.
let ventana;
let restaurar;
let memoria;
const navegadorOriginal = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const fetchOriginal = globalThis.fetch;
const registros = [];
const borrados = [];
let peticiones;

before(async () => {
    instalarDom();
    ventana = crearVentana();
    restaurar = instalarVentana(ventana);
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true, writable: true,
        value: { serviceWorker: { register: async (url, opciones) => { registros.push({ url, opciones }); return {}; } } },
    });
    globalThis.caches = {
        keys: async () => ['chivomed-shell-v', 'chivomed-datos-v'],
        delete: async nombre => { borrados.push(nombre); return true; },
    };
    ({ memoria } = await import('../src/js/boundary/vistas/memoria_vistas.js'));
    await import('../src/js/boundary/components/app_shell.js');
});

after(() => {
    restaurar();
    Object.defineProperty(globalThis, 'navigator', navegadorOriginal);
    delete globalThis.caches;
});

const montados = [];
beforeEach(() => {
    memoria.limpiar();
    registros.length = 0;
    borrados.length = 0;
    document.title = '';
    servidor(() => json({ code: 'auth.sesion' }, 401));
});
afterEach(async () => {
    for (const s of montados.splice(0)) if (s.isConnected) desconectar(s);
    if (!ventana.navigator.onLine) ventana.cambiarRed(true);
    globalThis.fetch = fetchOriginal;
    await pausa(5); // que terminen los setTimeout(0) de 'sesion-expirada'
});

/** fetch falso para /auth/me: `responder(url)` devuelve la Response (o lanza, como sin red). */
function servidor(responder) {
    peticiones = [];
    globalThis.fetch = async (url, opciones) => { peticiones.push({ url, ...opciones }); return responder(url); };
}

async function montar(hash, tag) {
    ventana.location.hash = hash;
    ventana.historial.length = 0;
    const shell = conectar(document.createElement('app-shell'));
    montados.push(shell);
    const raiz = shell.shadowRoot;
    const ctx = {
        shell, raiz,
        contenido: () => raiz.getElementById('contenido'),
        vista: () => raiz.getElementById('contenido').children[0],
        barra: () => raiz.querySelector('session-bar'),
        esperar: (nombre, ms) => hasta(() => ctx.vista()?.localName === nombre, { ms, mensaje: `no se montó <${nombre}>` }),
    };
    if (tag) await ctx.esperar(tag);
    return ctx;
}

describe('<app-shell>: estructura', () => {
    test('la plantilla se clona una sola vez aunque el shell se reconecte', async () => {
        const ctx = await montar('#/citas', 'vista-citas');
        const hijos = ctx.raiz.childElementCount;
        desconectar(ctx.shell);
        conectar(ctx.shell);
        assert.equal(ctx.raiz.childElementCount, hijos);
        assert.equal(ctx.raiz.querySelectorAll('main').length, 1);
    });

    test('"Saltar al contenido" enfoca <main> sin cambiar el hash, que el router leería como ruta', async () => {
        const ctx = await montar('#/citas', 'vista-citas');
        const clic = new Event('click', { cancelable: true });
        ctx.raiz.querySelector('.saltar').dispatchEvent(clic);
        assert.equal(clic.defaultPrevented, true);
        assert.equal(ctx.raiz.activeElement, ctx.contenido());
        assert.equal(ventana.location.hash, '#/citas');
    });

    test('registra el service worker al conectarse', async () => {
        await montar('#/citas', 'vista-citas');
        assert.equal(registros.length, 1);
        assert.match(registros[0].url, /\/src\/sw\.js$/);
        assert.equal(registros[0].opciones.updateViaCache, 'none');
    });
});

describe('<app-shell>: montaje de rutas', () => {
    test('sin hash va a la búsqueda de citas, reemplazando la entrada del historial', async () => {
        const ctx = await montar('', 'vista-citas');
        assert.equal(ventana.location.hash, '#/citas');
        assert.deepEqual(ventana.historial, [], 'una redirección no crea entrada en el historial');
        assert.equal(ctx.vista().contexto.path, '/citas');
    });

    test('una ruta pública: monta la vista, oculta la barra de sesión y anuncia el título', async () => {
        const ctx = await montar('#/citas', 'vista-citas');
        assert.equal(ctx.contenido().children.length, 1);
        assert.equal(ctx.barra().hidden, true);
        assert.equal(ctx.barra().sesion, null);
        assert.equal(document.title, 'Búsqueda de citas | ChivoMed');
        assert.equal(ctx.raiz.getElementById('anuncio').textContent, 'Búsqueda de citas');
        assert.equal(ctx.raiz.activeElement, null, 'la primera carga respeta el foco del navegador');
        assert.equal(peticiones.length, 0, 'una ruta pública no consulta la sesión');
    });

    test('una ruta desconocida monta <vista-no-encontrada> con la dirección pedida', async () => {
        const ctx = await montar('#/no-existe', 'vista-no-encontrada');
        assert.equal(ctx.vista().contexto.path, '/no-existe');
        assert.equal(document.title, 'Página no encontrada | ChivoMed');
    });

    test('una ruta de empleado con sesión: muestra la barra con esa sesión y la recuerda para el modo sin red', async () => {
        servidor(() => json(sesion()));
        const ctx = await montar('#/dashboard', 'vista-dashboard');
        assert.match(peticiones[0].url, /\/auth\/me$/);
        assert.equal(ctx.barra().hidden, false);
        assert.equal(ctx.barra().sesion.usuario.idUsuario, UUID(1));
        assert.equal(memoria.sesion.usuario.idUsuario, UUID(1));
        assert.equal(ctx.vista().contexto.soloLectura, false);
    });

    test('una ruta de empleado sin sesión (401) lleva al login con el aviso y la ruta de vuelta', async () => {
        const ctx = await montar('#/dashboard', 'vista-login');
        assert.equal(ventana.location.hash, '#/login?sesion=finalizada&volver=%2Fdashboard');
        assert.equal(ctx.barra().hidden, true);
        assert.equal(memoria.sesion, null);
    });

    test('un 401 al verificar la sesión borra la sesión de respaldo y los datos guardados', async () => {
        memoria.recordarSesion(sesion());
        memoria.guardar(`${UUID(1)}:dashboard.ultimo:${UUID(3)}`, { consultas: [] });
        await montar('#/dashboard', 'vista-login');
        assert.equal(memoria.sesion, null);
        assert.equal(memoria.leer(`${UUID(1)}:dashboard.ultimo:${UUID(3)}`), null);
    });

    test('al navegar, el foco va al título de lo montado o, si no tiene, a <main>', async () => {
        const ctx = await montar('#/citas', 'vista-citas');
        servidor(() => json({}, 500));
        ventana.location.hash = '#/dashboard';
        await hasta(() => ctx.contenido().querySelector('section[role="alert"]'));
        assert.equal(ctx.raiz.activeElement, ctx.contenido().querySelector('h1'));
        // En el DOM mínimo la vista montada no se conecta y no tiene <h1>: se usa <main>.
        ventana.location.hash = '#/no-existe';
        await ctx.esperar('vista-no-encontrada');
        assert.equal(ctx.raiz.activeElement, ctx.contenido());
    });
});

describe('<app-shell>: eventos de las vistas', () => {
    test('"navegar" crea una entrada en el historial y monta la ruta', async () => {
        const ctx = await montar('#/citas', 'vista-citas');
        ctx.shell.dispatchEvent(new CustomEvent('navegar', { detail: { ruta: '/no-existe' } }));
        assert.deepEqual(ventana.historial, ['#/no-existe']);
        await ctx.esperar('vista-no-encontrada');
    });

    test('"sesion-cerrada": borra la memoria y los cachés con datos y va al login sin el aviso de sesión finalizada', async () => {
        servidor(() => json(sesion()));
        const ctx = await montar('#/dashboard', 'vista-dashboard');
        servidor(() => json({}, 401));
        ctx.shell.dispatchEvent(new Event('sesion-cerrada'));
        assert.equal(memoria.sesion, null);
        assert.deepEqual(ventana.historial, ['#/login']);
        await ctx.esperar('vista-login');
        assert.deepEqual(borrados, ['chivomed-datos-v'], 'el caché del shell se conserva');
        assert.equal(ctx.barra().hidden, true);
    });

    test('"sesion-expirada" en una ruta de empleado lleva al login con el aviso', async () => {
        servidor(() => json(sesion()));
        const ctx = await montar('#/dashboard', 'vista-dashboard');
        servidor(() => json({}, 401));
        document.dispatchEvent(new Event('sesion-expirada'));
        await ctx.esperar('vista-login');
        assert.equal(ventana.historial[0], '#/login?sesion=finalizada');
        assert.equal(memoria.sesion, null);
        assert.deepEqual(borrados, ['chivomed-datos-v']);
    });

    test('"sesion-expirada" en una ruta pública no hace nada', async () => {
        await montar('#/citas', 'vista-citas');
        document.dispatchEvent(new Event('sesion-expirada'));
        await pausa();
        assert.deepEqual(ventana.historial, []);
        assert.deepEqual(borrados, []);
    });

    test('"sesion-expirada" cuando ya se está yendo al login solo borra los cachés', async () => {
        servidor(() => json(sesion()));
        const ctx = await montar('#/dashboard', 'vista-dashboard');
        servidor(() => new Promise(() => {})); // la verificación del login queda pendiente
        ventana.location.hash = '#/login';
        ventana.historial.length = 0;
        document.dispatchEvent(new Event('sesion-expirada'));
        await pausa();
        assert.deepEqual(borrados, ['chivomed-datos-v']);
        assert.deepEqual(ventana.historial, [], 'no navega otra vez');
        assert.equal(ctx.vista().localName, 'vista-dashboard');
    });

    test('"sesion-actualizada" (cambio de rol) actualiza la barra y la memoria en una ruta de empleado', async () => {
        servidor(() => json(sesion()));
        const ctx = await montar('#/dashboard', 'vista-dashboard');
        const nueva = sesion('ADMINISTRACION');
        ctx.shell.dispatchEvent(new CustomEvent('sesion-actualizada', { detail: { sesion: nueva } }));
        assert.equal(ctx.barra().sesion, nueva);
        assert.equal(memoria.sesion, nueva);
    });

    test('"sesion-actualizada" se ignora en una ruta pública o sin sesión', async () => {
        const ctx = await montar('#/citas', 'vista-citas');
        ctx.shell.dispatchEvent(new CustomEvent('sesion-actualizada', { detail: { sesion: sesion() } }));
        ctx.shell.dispatchEvent(new CustomEvent('sesion-actualizada'));
        assert.equal(ctx.barra().sesion, null);
        assert.equal(ctx.barra().hidden, true);
        assert.equal(memoria.sesion, null);
    });
});

describe('<app-shell>: errores', () => {
    test('un error del servidor se muestra en una alerta con su mensaje y se puede reintentar', async () => {
        servidor(() => json({}, 500));
        const ctx = await montar('#/dashboard');
        await hasta(() => ctx.contenido().querySelector('section[role="alert"]'));
        const alerta = ctx.contenido().querySelector('section');
        assert.equal(alerta.querySelector('h1').textContent, 'No pudimos abrir esta página');
        assert.equal(alerta.querySelector('p').textContent, 'El servicio no está disponible. Inténtalo más tarde.');
        assert.equal(document.title, 'Error | ChivoMed');
        assert.equal(ctx.barra().hidden, true);
        servidor(() => json(sesion()));
        alerta.querySelector('button').click();
        await ctx.esperar('vista-dashboard');
        assert.equal(peticiones.length, 1, 'reintentar vuelve a verificar la sesión');
    });

    test('una respuesta ilegible del servidor también se explica sin mostrar detalles internos', async () => {
        servidor(() => new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
        const ctx = await montar('#/dashboard');
        await hasta(() => ctx.contenido().querySelector('section[role="alert"]'));
        assert.equal(ctx.contenido().querySelector('p').textContent, 'No pudimos verificar tu sesión. Inténtalo de nuevo.');
    });
});

describe('<app-shell>: sin red', () => {
    const sinRed = () => { throw new TypeError('fetch failed'); };

    test('sin sesión en memoria monta <vista-sin-conexion> y, al volver la red, la ruta pedida', async () => {
        ventana.cambiarRed(false);
        servidor(sinRed);
        const ctx = await montar('#/dashboard', 'vista-sin-conexion');
        assert.equal(ctx.vista().contexto.rutaPedida.patron, '/dashboard');
        assert.equal(ventana.location.hash, '#/dashboard', 'no manda al login: sin red tampoco funcionaría');
        servidor(() => json(sesion()));
        ventana.cambiarRed(true);
        await ctx.esperar('vista-dashboard');
        assert.equal(ctx.vista().contexto.soloLectura, false);
    });

    test('con una sesión verificada antes entra en solo lectura con la barra visible', async () => {
        memoria.recordarSesion(sesion());
        ventana.cambiarRed(false);
        servidor(sinRed);
        const ctx = await montar('#/dashboard', 'vista-dashboard');
        assert.equal(ctx.vista().contexto.soloLectura, true);
        assert.equal(ctx.barra().hidden, false);
        servidor(() => json(sesion()));
        ventana.cambiarRed(true);
        await hasta(() => ctx.vista().contexto.soloLectura === false, { mensaje: 'no se volvió a verificar al volver la red' });
    });

    test('si se montó con red, volver a estar en línea no vuelve a procesar la ruta', async () => {
        servidor(() => json(sesion()));
        const ctx = await montar('#/dashboard', 'vista-dashboard');
        const vista = ctx.vista();
        ventana.cambiarRed(false);
        ventana.cambiarRed(true);
        await pausa();
        assert.equal(peticiones.length, 1);
        assert.equal(ctx.vista(), vista);
    });
});

describe('<app-shell>: desconexión', () => {
    test('deja de escuchar la navegación, el hash, la sesión y la red', async () => {
        servidor(() => json(sesion()));
        const ctx = await montar('#/dashboard', 'vista-dashboard');
        const vista = ctx.vista();
        desconectar(ctx.shell);
        ctx.shell.dispatchEvent(new CustomEvent('navegar', { detail: { ruta: '/citas' } }));
        assert.deepEqual(ventana.historial, [], '"navegar" ya no cambia el hash');
        ventana.location.hash = '#/no-existe';
        document.dispatchEvent(new Event('sesion-expirada'));
        ventana.cambiarRed(false);
        ventana.cambiarRed(true);
        await pausa();
        assert.equal(ctx.vista(), vista);
        assert.equal(peticiones.length, 1);
        assert.deepEqual(borrados, []);
        assert.equal(memoria.sesion.usuario.idUsuario, UUID(1));
    });

    test('montado sin red, al desconectarse ya no reacciona al volver la red', async () => {
        ventana.cambiarRed(false);
        servidor(() => { throw new TypeError('fetch failed'); });
        const ctx = await montar('#/dashboard', 'vista-sin-conexion');
        desconectar(ctx.shell);
        servidor(() => json(sesion()));
        ventana.cambiarRed(true);
        await pausa();
        assert.equal(peticiones.length, 0);
        assert.equal(ctx.vista().localName, 'vista-sin-conexion');
    });
});
