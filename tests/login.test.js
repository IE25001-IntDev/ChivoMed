import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ControladorLogin, MENSAJES, destinoTrasLogin } from '../src/js/boundary/vistas/controlador_login.js';
import { crearValidadorFormato } from '../src/js/control/formato_documento.js';

const UUID = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DUI = { idTipoDocumento: UUID(1), nombre: 'DUI', indicaciones: 'Ocho dígitos, guion y dígito verificador.', expresionRegular: '\\d{8}-\\d' };
const PASAPORTE = { idTipoDocumento: UUID(2), nombre: 'Pasaporte', indicaciones: null, expresionRegular: null };
const sesion = codigo => ({ usuario: { idUsuario: UUID(9) }, rolActivo: { codigo }, csrfToken: 'csrf-prueba' });

/** Doble del servicio de autenticación que registra cada llamada. */
function servicioDoble({ tipos = [DUI, PASAPORTE], login = async () => sesion('DOCTOR'), cierre = async () => {} } = {}) {
    const llamadas = { listar: 0, login: [], cierre: [] };
    return {
        llamadas,
        listarTiposDocumento: async () => { llamadas.listar++; if (tipos instanceof Error) throw tipos; return tipos; },
        iniciarSesion: async (...args) => { llamadas.login.push(args); return login(...args); },
        cerrarSesion: async token => { llamadas.cierre.push(token); return cierre(token); },
    };
}

async function preparar(opciones) {
    const servicio = servicioDoble(opciones);
    const estados = [];
    const controlador = new ControladorLogin({ servicio });
    // Cada notificación guarda una copia: el estado reactivo es uno solo y cambia en el lugar.
    controlador.suscribir((_cambios, estado) => estados.push({ ...estado }));
    await controlador.cargarTipos();
    return { controlador, servicio, estados };
}

describe('ControladorLogin: tipos de documento', () => {
    test('carga los tipos y avisa a la vista mientras carga y al terminar', async () => {
        const { controlador, estados } = await preparar();
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(estados[0].cargandoTipos, true);
        assert.equal(estados.at(-1).cargandoTipos, false);
        assert.ok(Object.isFrozen(controlador.estado.tipos));
        assert.equal(controlador.estado.cargandoTipos, false);
        assert.deepEqual(controlador.estado.tipos, [DUI, PASAPORTE]);
        assert.equal(controlador.tipo(UUID(1)), DUI);
        assert.equal(controlador.tipo('otro'), null);
    });

    test('si fallan los tipos se muestra el mensaje del servicio y la lista queda vacía', async () => {
        const { controlador } = await preparar({ tipos: new Error('No pudimos cargar los tipos de documento.') });
        assert.deepEqual(controlador.estado.tipos, []);
        assert.equal(controlador.estado.errorTipos, 'No pudimos cargar los tipos de documento.');
    });
});

describe('ControladorLogin: validación', () => {
    test('exige tipo y número antes de llamar al servicio', async () => {
        const { controlador, servicio } = await preparar();
        assert.equal(await controlador.enviar({ idTipoDocumento: '', numeroDocumento: '   ' }), null);
        assert.deepEqual(controlador.estado.errores, { tipo: MENSAJES.tipoRequerido, numero: MENSAJES.numeroRequerido });
        assert.ok(Object.isFrozen(controlador.estado.errores));
        assert.equal(servicio.llamadas.login.length, 0);
    });

    test('un tipo que no está en la lista se trata como no seleccionado', async () => {
        const { controlador } = await preparar();
        assert.equal(controlador.validar({ idTipoDocumento: UUID(99), numeroDocumento: '123' }).tipo, MENSAJES.tipoRequerido);
    });

    test('aplica la expresión regular del tipo al número completo y muestra las indicaciones', async () => {
        const { controlador, servicio } = await preparar();
        for (const numero of ['1234567-8', '12345678', '12345678-9X', 'x12345678-9']) {
            const errores = controlador.validar({ idTipoDocumento: DUI.idTipoDocumento, numeroDocumento: numero });
            assert.match(errores.numero, /formato de DUI\. Ocho dígitos/, numero);
        }
        assert.equal(controlador.validar({ idTipoDocumento: DUI.idTipoDocumento, numeroDocumento: ' 12345678-9 ' }).numero, null);
        await controlador.enviar({ idTipoDocumento: DUI.idTipoDocumento, numeroDocumento: '1234' });
        assert.equal(servicio.llamadas.login.length, 0);
    });

    test('un tipo sin expresión acepta cualquier número no vacío dentro del límite', async () => {
        const { controlador } = await preparar();
        assert.equal(controlador.validar({ idTipoDocumento: PASAPORTE.idTipoDocumento, numeroDocumento: 'A1B2C3' }).numero, null);
        assert.equal(controlador.validar({ idTipoDocumento: PASAPORTE.idTipoDocumento, numeroDocumento: 'A'.repeat(51) }).numero, MENSAJES.numeroLargo);
    });

    test('crearValidadorFormato ignora expresiones vacías o inválidas en lugar de bloquear el acceso', () => {
        assert.equal(crearValidadorFormato(null), null);
        assert.equal(crearValidadorFormato('  '), null);
        assert.equal(crearValidadorFormato('(sin cerrar'), null);
        const alternativa = crearValidadorFormato('A|B');
        assert.equal(alternativa('A'), true);
        assert.equal(alternativa('AB'), false, 'la alternativa se ancla completa, no por partes');
    });
});

describe('ControladorLogin: envío', () => {
    for (const rol of ['DOCTOR', 'ADMINISTRACION']) {
        test(`el rol ${rol} entra con el número recortado`, async () => {
            const { controlador, servicio } = await preparar({ login: async () => sesion(rol) });
            const resultado = await controlador.enviar({ idTipoDocumento: DUI.idTipoDocumento, numeroDocumento: ' 12345678-9 ' });
            assert.equal(resultado.rolActivo.codigo, rol);
            assert.deepEqual(servicio.llamadas.login, [[DUI.idTipoDocumento, '12345678-9']]);
            assert.equal(controlador.estado.enviando, false);
            assert.equal(controlador.estado.mensaje, null);
            assert.equal(servicio.llamadas.cierre.length, 0);
        });
    }

    for (const rol of ['PACIENTE', 'SUPERUSUARIO', undefined]) {
        test(`un rol ${rol} no entra y su sesión se cierra en el servidor`, async () => {
            const { controlador, servicio } = await preparar({ login: async () => sesion(rol) });
            assert.equal(await controlador.enviar({ idTipoDocumento: PASAPORTE.idTipoDocumento, numeroDocumento: 'A1' }), null);
            assert.equal(controlador.estado.mensaje, MENSAJES.soloPersonal);
            assert.deepEqual(servicio.llamadas.cierre, ['csrf-prueba']);
        });
    }

    test('si cerrar la sesión ajena falla, igual se rechaza el acceso', async () => {
        const { controlador } = await preparar({
            login: async () => sesion('PACIENTE'), cierre: async () => { throw new Error('red'); },
        });
        assert.equal(await controlador.enviar({ idTipoDocumento: PASAPORTE.idTipoDocumento, numeroDocumento: 'A1' }), null);
        assert.equal(controlador.estado.mensaje, MENSAJES.soloPersonal);
    });

    test('un error del servicio se muestra tal cual y libera el formulario', async () => {
        const { controlador } = await preparar({
            login: async () => { throw Object.assign(new Error('No reconocemos ese documento.'), { status: 401 }); },
        });
        assert.equal(await controlador.enviar({ idTipoDocumento: PASAPORTE.idTipoDocumento, numeroDocumento: 'A1' }), null);
        assert.equal(controlador.estado.mensaje, 'No reconocemos ese documento.');
        assert.equal(controlador.estado.enviando, false);
    });

    test('mientras se envía, un segundo envío no llama otra vez al servicio', async () => {
        let liberar;
        const { controlador, servicio, estados } = await preparar({
            login: () => new Promise(resolve => { liberar = () => resolve(sesion('DOCTOR')); }),
        });
        const datos = { idTipoDocumento: PASAPORTE.idTipoDocumento, numeroDocumento: 'A1' };
        const primero = controlador.enviar(datos);
        assert.equal(controlador.estado.enviando, true);
        assert.equal(await controlador.enviar(datos), null);
        liberar();
        assert.ok(await primero);
        assert.equal(servicio.llamadas.login.length, 1);
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.ok(estados.some(e => e.enviando) && !controlador.estado.enviando);
    });

    test('un intento nuevo limpia el mensaje del intento anterior', async () => {
        let intento = 0;
        const { controlador } = await preparar({
            login: async () => { if (++intento === 1) throw new Error('Falló'); return sesion('DOCTOR'); },
        });
        const datos = { idTipoDocumento: PASAPORTE.idTipoDocumento, numeroDocumento: 'A1' };
        await controlador.enviar(datos);
        assert.equal(controlador.estado.mensaje, 'Falló');
        assert.ok(await controlador.enviar(datos));
        assert.equal(controlador.estado.mensaje, null);
    });
});

describe('destinoTrasLogin', () => {
    const query = volver => new URLSearchParams(volver === undefined ? '' : { volver });
    test('sin volver entra al dashboard', () => assert.equal(destinoTrasLogin(query()), '/dashboard'));
    test('vuelve a la consulta que se pidió', () => assert.equal(destinoTrasLogin(query(`/consulta/${UUID(5)}`)), `/consulta/${UUID(5)}`));
    for (const malo of ['//evil.example', 'https://evil.example', '/login', '/no-existe']) {
        test(`ignora volver=${malo}`, () => assert.equal(destinoTrasLogin(query(malo)), '/dashboard'));
    }
    test('tolera un contexto sin query', () => assert.equal(destinoTrasLogin(undefined), '/dashboard'));
});

describe('ControladorLogin: estado reactivo', () => {
    test('no acepta el callback alCambiar ni claves nuevas: solo suscribir()', () => {
        const controlador = new ControladorLogin({ servicio: servicioDoble(), alCambiar: () => { throw new Error('no se llama'); } });
        assert.equal(typeof controlador.suscribir, 'function');
        assert.throws(() => { controlador.estado.otra = 1; }, TypeError);
    });

    test('agrupa los cambios de un envío inválido en una sola notificación', async () => {
        const controlador = new ControladorLogin({ servicio: servicioDoble() });
        const lotes = [];
        controlador.suscribir(cambios => lotes.push([...cambios].sort()));
        await controlador.enviar({ idTipoDocumento: '', numeroDocumento: '' });
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.deepEqual(lotes, [['errores']]);
    });
});
