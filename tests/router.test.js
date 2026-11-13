import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarHash, resolverRuta, rutaDeRetorno, Router } from '../src/js/boundary/router.js';

const UUID = '10000000-0000-4000-8000-000000000001';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPLEADO = ['DOCTOR', 'ADMINISTRACION'];

// Rutas de prueba con la misma forma que rutas.js, sin cargar módulos reales.
function crearRutas(cargas = []) {
    const cargar = tag => async () => { cargas.push(tag); };
    return [
        { patron: '/citas', tag: 'vista-citas', cargar: cargar('vista-citas') },
        { patron: '/login', tag: 'vista-login', soloInvitados: true, cargar: cargar('vista-login') },
        { patron: '/dashboard', tag: 'vista-dashboard', roles: EMPLEADO, cargar: cargar('vista-dashboard') },
        { patron: '/consulta/:id', tag: 'vista-consulta', roles: EMPLEADO, restricciones: { id: UUID_RE }, cargar: cargar('vista-consulta') },
    ];
}
const NO_ENCONTRADA = { patron: null, tag: 'vista-no-encontrada' };
const SIN_CONEXION = { patron: null, tag: 'vista-sin-conexion' };

/** Ventana falsa: hashchange asíncrono y solo cuando el hash cambia, como en el navegador. */
function crearVentana(hashInicial = '') {
    const ventana = new EventTarget();
    let hash = hashInicial;
    const cambiar = nuevo => {
        if (nuevo === hash) return;
        hash = nuevo;
        setTimeout(() => ventana.dispatchEvent(new Event('hashchange')), 0);
    };
    ventana.historial = [];
    ventana.reemplazos = [];
    ventana.location = {
        get hash() { return hash; },
        set hash(valor) { ventana.historial.push(valor); cambiar(valor); },
        replace(url) { ventana.reemplazos.push(url); cambiar(url); },
    };
    // Simula que el usuario escribe otra dirección o pulsa Atrás.
    ventana.ir = nuevo => cambiar(nuevo);
    return ventana;
}

const sesion = codigo => ({ usuario: { idUsuario: UUID }, rolActivo: { codigo, idPersonaRol: UUID, idClinica: UUID } });
const error = status => Object.assign(new Error(`HTTP ${status}`), { status });
const sinRed = () => Object.assign(new Error('No pudimos conectar con el servicio.'), { status: 0, code: 'conexion.error' });

function preparar({ hash = '', autenticar = async () => { throw error(401); }, sesionSinRed = () => null, sinConexion = SIN_CONEXION } = {}) {
    const ventana = crearVentana(hash);
    const montajes = [];
    const errores = [];
    const cargas = [];
    let llamadasAuth = 0;
    const router = new Router({
        rutas: crearRutas(cargas),
        noEncontrada: NO_ENCONTRADA,
        porDefecto: '/citas',
        login: '/login',
        inicioPorRol: s => (EMPLEADO.includes(s?.rolActivo?.codigo) ? '/dashboard' : null),
        ventana,
        autenticar: (...args) => { llamadasAuth++; return autenticar(...args); },
        montar: (tag, contexto) => montajes.push({ tag, contexto }),
        mostrarError: (err, contexto) => errores.push({ err, contexto }),
        esErrorDeRed: err => err?.code === 'conexion.error',
        sesionSinRed,
        sinConexion,
    });
    return { router, ventana, montajes, errores, cargas, auth: () => llamadasAuth };
}

/** Deja correr los hashchange encadenados (redirecciones) y la navegación pendiente. */
async function asentar(router) {
    for (let i = 0; i < 6; i++) {
        await new Promise(resolve => setTimeout(resolve, 0));
        await router.pendiente;
    }
}

describe('normalizarHash', () => {
    for (const [hash, ruta] of [['', '/'], ['#', '/'], ['#/', '/'], ['#/citas', '/citas'], ['#/citas/', '/citas'],
        ['#//dashboard//', '/dashboard'], ['#citas', '/citas'], ['#/consulta/abc', '/consulta/abc']]) {
        test(`"${hash}" se normaliza a "${ruta}"`, () => assert.equal(normalizarHash(hash).ruta, ruta));
    }
    test('la query va dentro del hash y no se mezcla con la ruta', () => {
        const { ruta, query } = normalizarHash('#/login?sesion=finalizada&volver=%2Fdashboard');
        assert.equal(ruta, '/login');
        assert.equal(query.get('sesion'), 'finalizada');
        assert.equal(query.get('volver'), '/dashboard');
    });
});

describe('resolverRuta', () => {
    const rutas = crearRutas();
    test('extrae el parámetro :id de una consulta', () => {
        const r = resolverRuta(`#/consulta/${UUID}`, rutas);
        assert.equal(r.ruta.tag, 'vista-consulta');
        assert.deepEqual(r.params, { id: UUID });
    });
    test('un :id que no es UUID no coincide', () => assert.equal(resolverRuta('#/consulta/123', rutas).ruta, null));
    test('segmentos de más no coinciden', () => assert.equal(resolverRuta(`#/consulta/${UUID}/extra`, rutas).ruta, null));
    test('una consulta sin id no coincide', () => assert.equal(resolverRuta('#/consulta', rutas).ruta, null));
    test('las rutas distinguen mayúsculas', () => assert.equal(resolverRuta('#/Dashboard', rutas).ruta, null));
    test('una codificación inválida no lanza excepción', () => assert.equal(resolverRuta('#/consulta/%E0%A4%A', rutas).ruta, null));
});

describe('rutaDeRetorno', () => {
    const rutas = crearRutas();
    for (const valido of ['/dashboard', `/consulta/${UUID}`, '/citas']) {
        test(`acepta ${valido}`, () => assert.equal(rutaDeRetorno(valido, rutas), valido));
    }
    for (const invalido of ['//evil.example', 'https://evil.example', '/\\evil', '/login', '/no-existe', 'dashboard', '', null, undefined, 42]) {
        test(`rechaza ${JSON.stringify(invalido)}`, () => assert.equal(rutaDeRetorno(invalido, rutas), null));
    }
});

describe('Router', () => {
    test('sin hash redirige a #/citas sin crear entrada en el historial y monta la vista pública', async () => {
        const { router, ventana, montajes, auth } = preparar({ hash: '' });
        await router.iniciar();
        await asentar(router);
        assert.deepEqual(ventana.reemplazos, ['#/citas']);
        assert.deepEqual(ventana.historial, []);
        assert.deepEqual(montajes.map(m => m.tag), ['vista-citas']);
        assert.equal(auth(), 0, 'una ruta pública no consulta /auth/me');
    });

    test('una ruta desconocida monta la vista de no encontrada sin consultar la sesión', async () => {
        const { router, montajes, auth } = preparar({ hash: '#/no-existe' });
        await router.iniciar();
        assert.deepEqual(montajes.map(m => m.tag), ['vista-no-encontrada']);
        assert.equal(montajes[0].contexto.path, '/no-existe');
        assert.equal(auth(), 0);
    });

    test('sin sesión (401) una ruta de empleado redirige al login conservando la ruta pedida', async () => {
        const { router, ventana, montajes } = preparar({ hash: `#/consulta/${UUID}?paso=2` });
        await router.iniciar();
        await asentar(router);
        assert.deepEqual(ventana.reemplazos, [`#/login?sesion=finalizada&volver=${encodeURIComponent(`/consulta/${UUID}?paso=2`)}`]);
        assert.deepEqual(montajes.map(m => m.tag), ['vista-login']);
        assert.equal(montajes[0].contexto.query.get('volver'), `/consulta/${UUID}?paso=2`);
    });

    for (const rol of EMPLEADO) {
        test(`el rol ${rol} entra al dashboard y a la consulta`, async () => {
            const { router, ventana, montajes } = preparar({ hash: '#/dashboard', autenticar: async () => sesion(rol) });
            await router.iniciar();
            ventana.ir(`#/consulta/${UUID}`);
            await asentar(router);
            assert.deepEqual(montajes.map(m => m.tag), ['vista-dashboard', 'vista-consulta']);
            assert.equal(montajes[1].contexto.sesion.rolActivo.codigo, rol);
            assert.deepEqual(montajes[1].contexto.params, { id: UUID });
            assert.deepEqual(ventana.reemplazos, []);
        });
    }

    test('un rol que no es de empleado (PACIENTE) es redirigido a la ruta por defecto', async () => {
        const { router, ventana, montajes } = preparar({ hash: '#/dashboard', autenticar: async () => sesion('PACIENTE') });
        await router.iniciar();
        await asentar(router);
        assert.deepEqual(ventana.reemplazos, ['#/citas']);
        assert.deepEqual(montajes.map(m => m.tag), ['vista-citas']);
    });

    test('el login con una sesión de empleado activa redirige al dashboard', async () => {
        let autenticado = true;
        const { router, ventana, montajes } = preparar({
            hash: '#/login',
            autenticar: async () => { if (!autenticado) throw error(401); return sesion('DOCTOR'); },
        });
        await router.iniciar();
        await asentar(router);
        autenticado = false;
        assert.deepEqual(ventana.reemplazos, ['#/dashboard']);
        assert.deepEqual(montajes.map(m => m.tag), ['vista-dashboard']);
    });

    for (const [caso, falla] of [['401', error(401)], ['error de red', error(0)]]) {
        test(`el login se muestra cuando la sesión no se puede verificar (${caso})`, async () => {
            const { router, ventana, montajes, errores } = preparar({ hash: '#/login', autenticar: async () => { throw falla; } });
            await router.iniciar();
            assert.deepEqual(montajes.map(m => m.tag), ['vista-login']);
            assert.equal(montajes[0].contexto.sesion, null);
            assert.deepEqual(ventana.reemplazos, []);
            assert.equal(errores.length, 0);
        });
    }

    test('un error distinto de 401 en una ruta protegida se informa sin redirigir ni montar', async () => {
        const { router, ventana, montajes, errores } = preparar({ hash: '#/dashboard', autenticar: async () => { throw error(503); } });
        await router.iniciar();
        assert.deepEqual(ventana.reemplazos, []);
        assert.equal(montajes.length, 0);
        assert.equal(errores.length, 1);
        assert.equal(errores[0].err.status, 503);
        assert.equal(errores[0].contexto.ruta.tag, 'vista-dashboard');
    });

    test('si falla la carga del módulo de la vista se informa el error y no se monta', async () => {
        const montajes = [];
        const errores = [];
        const ruta = { patron: '/citas', tag: 'vista-citas', cargar: async () => { throw new Error('módulo no disponible'); } };
        const router = new Router({
            rutas: [ruta], noEncontrada: NO_ENCONTRADA, porDefecto: '/citas', login: '/login', inicioPorRol: () => null,
            ventana: crearVentana('#/citas'), autenticar: async () => null,
            montar: (tag) => montajes.push({ tag }), mostrarError: (err) => errores.push({ err }),
        });
        await router.iniciar();
        assert.equal(montajes.length, 0);
        assert.equal(errores[0].err.message, 'módulo no disponible');
        router.detener();
    });

    test('una verificación lenta de sesión no monta su vista sobre una navegación posterior', async () => {
        let liberar;
        const lenta = new Promise(resolve => { liberar = resolve; });
        const { router, ventana, montajes } = preparar({ hash: '#/dashboard', autenticar: () => lenta });
        const primera = router.iniciar();
        ventana.ir('#/citas');
        await asentar(router);
        liberar(sesion('DOCTOR'));
        await primera;
        await asentar(router);
        assert.deepEqual(montajes.map(m => m.tag), ['vista-citas']);
    });

    test('navegar() crea una entrada en el historial y monta la vista', async () => {
        const { router, ventana, montajes } = preparar({ hash: '#/citas' });
        await router.iniciar();
        router.navegar('/login');
        await asentar(router);
        assert.deepEqual(ventana.historial, ['#/login']);
        assert.deepEqual(montajes.map(m => m.tag), ['vista-citas', 'vista-login']);
    });

    test('navegar() a la ruta actual vuelve a montar la vista sin tocar el historial', async () => {
        const { router, ventana, montajes } = preparar({ hash: '#/citas' });
        await router.iniciar();
        await router.navegar('/citas');
        assert.deepEqual(ventana.historial, []);
        assert.deepEqual(montajes.map(m => m.tag), ['vista-citas', 'vista-citas']);
    });

    test('detener() deja de escuchar hashchange y cancela la navegación en curso', async () => {
        let liberar;
        const lenta = new Promise(resolve => { liberar = resolve; });
        const { router, ventana, montajes } = preparar({ hash: '#/dashboard', autenticar: () => lenta });
        const primera = router.iniciar();
        router.detener();
        liberar(sesion('DOCTOR'));
        await primera;
        ventana.ir('#/citas');
        await asentar(router);
        assert.equal(montajes.length, 0);
    });

    test('la vista se carga antes de montarse', async () => {
        const { router, montajes, cargas } = preparar({ hash: '#/citas' });
        await router.iniciar();
        assert.deepEqual(cargas, ['vista-citas']);
        assert.equal(montajes.length, 1);
    });
});

describe('Router sin conexión', () => {
    test('sin red y con una sesión de empleado en memoria monta la ruta protegida en solo lectura', async () => {
        const guardada = sesion('DOCTOR');
        const { router, ventana, montajes, errores } = preparar({
            hash: '#/dashboard', autenticar: async () => { throw sinRed(); }, sesionSinRed: () => guardada,
        });
        await router.iniciar();
        assert.deepEqual(montajes.map(m => m.tag), ['vista-dashboard']);
        assert.equal(montajes[0].contexto.sesion, guardada);
        assert.equal(montajes[0].contexto.soloLectura, true);
        assert.deepEqual(ventana.reemplazos, [], 'no manda al login');
        assert.equal(errores.length, 0);
    });

    test('sin red y sin sesión en memoria muestra la vista Sin conexión en vez del login', async () => {
        const { router, ventana, montajes, errores } = preparar({ hash: `#/consulta/${UUID}?paso=2`, autenticar: async () => { throw sinRed(); } });
        await router.iniciar();
        assert.deepEqual(montajes.map(m => m.tag), ['vista-sin-conexion']);
        assert.equal(montajes[0].contexto.ruta, SIN_CONEXION);
        assert.equal(montajes[0].contexto.rutaPedida.tag, 'vista-consulta');
        assert.equal(montajes[0].contexto.path, `/consulta/${UUID}`, 'conserva la ruta pedida para reintentar');
        assert.equal(montajes[0].contexto.sesion, null);
        assert.deepEqual(ventana.reemplazos, []);
        assert.equal(errores.length, 0);
    });

    test('una sesión en memoria que no es de empleado no sirve de respaldo', async () => {
        const { router, montajes } = preparar({
            hash: '#/dashboard', autenticar: async () => { throw sinRed(); }, sesionSinRed: () => sesion('PACIENTE'),
        });
        await router.iniciar();
        assert.deepEqual(montajes.map(m => m.tag), ['vista-sin-conexion']);
    });

    test('con red, la sesión en memoria no se usa: un 401 sigue llevando al login', async () => {
        const { router, ventana } = preparar({ hash: '#/dashboard', sesionSinRed: () => sesion('DOCTOR') });
        await router.iniciar();
        await asentar(router);
        assert.match(ventana.reemplazos[0], /^#\/login\?sesion=finalizada/);
    });

    test('un error que no es de red (503) se informa aunque haya sesión en memoria', async () => {
        const { router, montajes, errores } = preparar({
            hash: '#/dashboard', autenticar: async () => { throw error(503); }, sesionSinRed: () => sesion('DOCTOR'),
        });
        await router.iniciar();
        assert.equal(montajes.length, 0);
        assert.equal(errores[0].err.status, 503);
    });

    test('sin vista de Sin conexión configurada, el error de red se informa como antes', async () => {
        const { router, montajes, errores } = preparar({ hash: '#/dashboard', autenticar: async () => { throw sinRed(); }, sinConexion: null });
        await router.iniciar();
        assert.equal(montajes.length, 0);
        assert.equal(errores[0].err.code, 'conexion.error');
    });

    test('con sesión verificada en línea el contexto no es de solo lectura', async () => {
        const { router, montajes } = preparar({ hash: '#/dashboard', autenticar: async () => sesion('DOCTOR') });
        await router.iniciar();
        assert.equal(montajes[0].contexto.soloLectura, false);
    });
});
