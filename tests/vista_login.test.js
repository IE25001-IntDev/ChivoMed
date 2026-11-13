import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, conectar, desconectar } from './dobles/dom_minimo.js';

// Datos inventados; nunca datos reales.
const UUID = n => `70000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DUI = Object.freeze({ idTipoDocumento: UUID(1), nombre: 'DUI', indicaciones: 'Ocho dígitos, guion y dígito verificador.', expresionRegular: '^[0-9]{8}-[0-9]$' });
const sesion = codigo => ({ usuario: { idUsuario: UUID(9) }, rolActivo: { codigo }, csrfToken: 'csrf-prueba' });
const asentar = () => new Promise(resolve => setTimeout(resolve, 0));

let VistaLogin;
let ControladorLogin;
before(async () => {
    instalarDom();
    ({ default: VistaLogin } = await import('../src/js/boundary/vistas/vista_login.js'));
    ({ ControladorLogin } = await import('../src/js/boundary/vistas/controlador_login.js'));
});

function montar({ tipos = async () => [DUI], login = async () => sesion('DOCTOR'), query = new URLSearchParams() } = {}) {
    const llamadas = { login: [] };
    const controlador = new ControladorLogin({ servicio: {
        listarTiposDocumento: tipos,
        iniciarSesion: async (...args) => { llamadas.login.push(args); return login(...args); },
        cerrarSesion: async () => {},
    } });
    const espia = { notificaciones: 0, cancelados: 0 };
    const suscribir = controlador.suscribir;
    controlador.suscribir = fn => {
        const cancelar = suscribir((cambios, estado) => { espia.notificaciones++; fn(cambios, estado); });
        return () => { espia.cancelados++; cancelar(); };
    };
    const vista = new VistaLogin();
    vista.contexto = { query };
    vista.controlador = controlador;
    const eventos = [];
    vista.addEventListener('navegar', e => eventos.push(e));
    const $ = id => vista.shadowRoot.getElementById(id);
    const enviar = () => $('formulario').dispatchEvent(new Event('submit', { cancelable: true }));
    return { vista, controlador, espia, llamadas, eventos, $, enviar };
}

describe('<vista-login>: suscripción y pintado', () => {
    test('al conectarse pinta "Cargando tipos…" de inmediato y luego la lista', async () => {
        const ctx = montar();
        conectar(ctx.vista);
        assert.equal(ctx.$('tipo').querySelectorAll('option')[0].textContent, 'Cargando tipos…');
        assert.equal(ctx.$('enviar').disabled, true);
        await asentar();
        const opciones = ctx.$('tipo').querySelectorAll('option');
        assert.deepEqual(opciones.map(o => [o.value, o.textContent]), [['', 'Selecciona un tipo'], [DUI.idTipoDocumento, 'DUI']]);
        assert.equal(ctx.$('enviar').disabled, false);
        assert.ok(ctx.espia.notificaciones > 0, 'los cambios llegan por la suscripción');
    });

    test('al desconectarse cancela la suscripción', async () => {
        const ctx = montar();
        conectar(ctx.vista);
        await asentar();
        desconectar(ctx.vista);
        assert.equal(ctx.espia.cancelados, 1);
    });

    test('el controlador solo se asigna antes de conectar', () => {
        const ctx = montar();
        conectar(ctx.vista);
        assert.throws(() => { ctx.vista.controlador = ctx.controlador; });
    });

    test('elegir un tipo muestra sus indicaciones', async () => {
        const ctx = montar();
        conectar(ctx.vista);
        await asentar();
        ctx.$('tipo').value = DUI.idTipoDocumento;
        ctx.$('tipo').dispatchEvent(new Event('change'));
        assert.equal(ctx.$('numero-indicaciones').hidden, false);
        assert.equal(ctx.$('numero-indicaciones').textContent, DUI.indicaciones);
    });

    test('con ?sesion=finalizada muestra el aviso', () => {
        const ctx = montar({ query: new URLSearchParams('sesion=finalizada') });
        conectar(ctx.vista);
        assert.equal(ctx.$('aviso').hidden, false);
        assert.equal(ctx.$('aviso').textContent, 'Inicia sesión con tu documento para continuar.');
    });
});

describe('<vista-login>: envío', () => {
    test('errores de validación: aria-invalid, texto y foco en el primer campo con error', async () => {
        const ctx = montar();
        conectar(ctx.vista);
        await asentar();
        ctx.enviar();
        await asentar();
        assert.equal(ctx.$('tipo').getAttribute('aria-invalid'), 'true');
        assert.equal(ctx.$('tipo-error').textContent, 'Selecciona el tipo de documento.');
        assert.equal(ctx.$('numero-error').textContent, 'Escribe tu número de documento.');
        assert.equal(ctx.vista.shadowRoot.activeElement, ctx.$('tipo'));
        assert.equal(ctx.llamadas.login.length, 0);
    });

    test('un login válido emite navegar al dashboard con el número recortado', async () => {
        const ctx = montar();
        conectar(ctx.vista);
        await asentar();
        ctx.$('tipo').value = DUI.idTipoDocumento;
        ctx.$('numero').value = ' 12345678-9 ';
        ctx.enviar();
        await asentar();
        assert.deepEqual(ctx.llamadas.login, [[DUI.idTipoDocumento, '12345678-9']]);
        assert.equal(ctx.eventos.length, 1);
        assert.equal(ctx.eventos[0].detail.ruta, '/dashboard');
        assert.equal(ctx.$('tipo').value, DUI.idTipoDocumento, 'validar no reconstruye la lista ni pierde la selección');
    });

    test('mientras envía: botón "Verificando…" deshabilitado y aria-busy', async () => {
        let soltar;
        const ctx = montar({ login: () => new Promise(r => { soltar = () => r(sesion('DOCTOR')); }) });
        conectar(ctx.vista);
        await asentar();
        ctx.$('tipo').value = DUI.idTipoDocumento;
        ctx.$('numero').value = '12345678-9';
        ctx.enviar();
        await asentar();
        assert.equal(ctx.$('enviar').textContent, 'Verificando…');
        assert.equal(ctx.$('enviar').disabled, true);
        assert.equal(ctx.$('formulario').getAttribute('aria-busy'), 'true');
        soltar();
        await asentar();
        assert.equal(ctx.$('enviar').textContent, 'Ingresar');
    });

    test('un error del servicio se muestra y el foco va al número', async () => {
        const ctx = montar({ login: async () => { throw new Error('No reconocemos ese documento como personal activo de una clínica.'); } });
        conectar(ctx.vista);
        await asentar();
        ctx.$('tipo').value = DUI.idTipoDocumento;
        ctx.$('numero').value = '12345678-9';
        ctx.enviar();
        await asentar();
        assert.equal(ctx.$('mensaje').hidden, false);
        assert.equal(ctx.$('mensaje-texto').textContent, 'No reconocemos ese documento como personal activo de una clínica.');
        assert.equal(ctx.$('reintentar').hidden, true);
        assert.equal(ctx.vista.shadowRoot.activeElement, ctx.$('numero'));
        assert.equal(ctx.eventos.length, 0);
    });

    test('si fallan los tipos: mensaje, botón de reintento y lista vacía', async () => {
        let intento = 0;
        const ctx = montar({ tipos: async () => { if (++intento === 1) throw new Error('No pudimos cargar los tipos de documento.'); return [DUI]; } });
        conectar(ctx.vista);
        await asentar();
        assert.equal(ctx.$('mensaje-texto').textContent, 'No pudimos cargar los tipos de documento.');
        assert.equal(ctx.$('reintentar').hidden, false);
        assert.equal(ctx.$('tipo').querySelectorAll('option')[0].textContent, 'Sin tipos disponibles');
        ctx.$('reintentar').dispatchEvent(new Event('click'));
        await asentar();
        assert.equal(ctx.$('mensaje').hidden, true);
        assert.equal(ctx.$('tipo').querySelectorAll('option').length, 2);
    });
});
