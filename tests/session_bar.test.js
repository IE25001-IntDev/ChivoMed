import { test, describe, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, conectar, desconectar } from './dobles/dom_minimo.js';
import { crearVentana, instalarVentana } from './dobles/ventana_doble.js';

// Datos inventados; nunca datos reales.
const UUID = n => `90000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sesion = (cambios = {}) => ({
    usuario: { idUsuario: UUID(1), idPersona: UUID(2), nombres: 'Ana', apellidos: 'Prueba ' },
    rolActivo: { idPersonaRol: UUID(3), codigo: 'DOCTOR', nombreRol: 'Doctor', idClinica: UUID(4), nombreClinica: 'Clínica de prueba' },
    csrfToken: 'csrf-prueba',
    ...cambios,
});
const asentar = () => new Promise(resolve => setTimeout(resolve, 0));

let ventana;
let restaurar;
let MENSAJE_SIN_RED;
const fetchOriginal = globalThis.fetch;
before(async () => {
    instalarDom();
    ventana = crearVentana();
    restaurar = instalarVentana(ventana);
    ({ MENSAJE_SIN_RED } = await import('../src/js/boundary/pwa/controlador_conexion.js'));
    await import('../src/js/boundary/components/session_bar.js');
});
after(() => restaurar());

const montados = [];
afterEach(() => {
    for (const b of montados.splice(0)) if (b.isConnected) desconectar(b);
    if (!ventana.navigator.onLine) ventana.cambiarRed(true);
    globalThis.fetch = fetchOriginal;
});

/** fetch falso: registra cada petición y responde con `responder()`. */
function servidor(responder = () => new Response(null, { status: 204 })) {
    const peticiones = [];
    globalThis.fetch = async (url, opciones) => { peticiones.push({ url, ...opciones }); return responder(); };
    return peticiones;
}

function montar(valor = sesion()) {
    const barra = document.createElement('session-bar');
    barra.sesion = valor;
    conectar(barra);
    montados.push(barra);
    const eventos = [];
    barra.addEventListener('sesion-cerrada', e => eventos.push(e));
    const $ = id => barra.shadowRoot.getElementById(id);
    return { barra, eventos, $ };
}

describe('<session-bar>: identidad', () => {
    test('muestra nombre completo, rol y clínica', () => {
        const { $ } = montar();
        assert.equal($('nombre').textContent, 'Ana Prueba');
        assert.equal($('rol').textContent, 'Doctor');
        assert.equal($('clinica').textContent, 'Clínica de prueba');
        assert.equal($('salir').disabled, false);
    });

    test('muestra nombreRol aunque el código sea null (B8) y nunca el código crudo', () => {
        const { $ } = montar(sesion({ rolActivo: { codigo: null, nombreRol: 'Enfermera', nombreClinica: 'Clínica Santa Ana' } }));
        assert.equal($('rol').textContent, 'Enfermera');
        const sinNombre = montar(sesion({ rolActivo: { codigo: 'ENFERMERA', nombreRol: null, nombreClinica: 'Clínica Santa Ana' } }));
        assert.equal(sinNombre.$('rol').textContent, 'Rol sin nombre');
    });

    test('sin sesión no hay datos y no se puede cerrar sesión', () => {
        const { $ } = montar(null);
        assert.equal($('nombre').textContent, '');
        assert.equal($('clinica').textContent, '');
        assert.equal($('salir').disabled, true);
    });

    test('asignar otra sesión estando conectada repinta', () => {
        const { barra, $ } = montar(null);
        barra.sesion = sesion({ rolActivo: { codigo: 'ADMINISTRACION', nombreRol: 'Atención al público', nombreClinica: 'Clínica Norte de prueba' } });
        assert.equal(barra.sesion.rolActivo.codigo, 'ADMINISTRACION');
        assert.equal($('rol').textContent, 'Atención al público');
        assert.equal($('clinica').textContent, 'Clínica Norte de prueba');
        assert.equal($('salir').disabled, false);
    });
});

describe('<session-bar>: sin red', () => {
    test('deshabilita "Cerrar sesión" y explica por qué; al volver la red lo habilita', () => {
        const { $ } = montar();
        assert.equal($('sin-red').hidden, true);
        ventana.cambiarRed(false);
        assert.equal($('salir').disabled, true);
        assert.equal($('sin-red').hidden, false);
        assert.equal($('sin-red').textContent, MENSAJE_SIN_RED);
        assert.equal($('salir').getAttribute('aria-describedby'), 'sin-red');
        ventana.cambiarRed(true);
        assert.equal($('salir').disabled, false);
        assert.equal($('sin-red').hidden, true);
        assert.equal($('sin-red').textContent, '');
    });
});

describe('<session-bar>: cerrar sesión', () => {
    test('hace un POST a auth/logout con el token CSRF y avisa con sesion-cerrada', async () => {
        let soltar;
        const peticiones = servidor(() => new Promise(r => { soltar = () => r(new Response(null, { status: 204 })); }));
        const { $, eventos } = montar();
        $('salir').click();
        assert.equal($('salir').textContent, 'Cerrando sesión…');
        assert.equal($('salir').disabled, true, 'deshabilitado de inmediato: el navegador no emite un segundo click');
        await asentar();
        assert.equal(peticiones.length, 1);
        assert.match(peticiones[0].url, /\/auth\/logout$/);
        assert.equal(peticiones[0].method, 'POST');
        assert.equal(peticiones[0].headers['X-CSRF-Token'], 'csrf-prueba');
        assert.equal(eventos.length, 0, 'no avisa antes de que responda el servidor');
        soltar();
        await asentar();
        assert.equal(eventos.length, 1);
        assert.equal(eventos[0].bubbles, true);
        assert.equal(eventos[0].composed, true, 'cruza el Shadow DOM hasta <app-shell>');
        assert.equal($('salir').textContent, 'Cerrar sesión');
    });

    test('si el servidor ya había cerrado la sesión (401), avisa igual', async () => {
        servidor(() => new Response(null, { status: 401 }));
        const { $, eventos } = montar();
        $('salir').click();
        await asentar();
        assert.equal(eventos.length, 1);
        assert.equal($('error').hidden, true);
    });

    test('otro error: lo muestra en una alerta, no avisa y deja reintentar', async () => {
        servidor(() => new Response(null, { status: 500 }));
        const { barra, $, eventos } = montar();
        $('salir').click();
        await asentar();
        assert.equal(eventos.length, 0);
        assert.equal($('error').hidden, false);
        assert.equal($('error').getAttribute('role'), 'alert');
        assert.equal($('error').textContent, 'El servicio no está disponible. Inténtalo más tarde.');
        assert.equal($('salir').disabled, false);
        assert.equal($('salir').textContent, 'Cerrar sesión');
        barra.sesion = sesion();
        assert.equal($('error').hidden, true, 'una sesión nueva limpia el error anterior');
    });

    test('sin respuesta del servidor muestra el error de conexión', async () => {
        globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
        const { $, eventos } = montar();
        $('salir').click();
        await asentar();
        assert.equal(eventos.length, 0);
        assert.equal($('error').textContent, 'No pudimos conectar con el servicio. Inténtalo de nuevo.');
    });

    test('una sesión sin token CSRF no envía la petición y lo explica', async () => {
        const peticiones = servidor();
        const { $, eventos } = montar(sesion({ csrfToken: '' }));
        $('salir').click();
        await asentar();
        assert.equal(peticiones.length, 0);
        assert.equal(eventos.length, 0);
        assert.equal($('error').textContent, 'No pudimos verificar tu sesión. Recarga la página.');
    });

    test('al desconectarse deja de escuchar el botón y la red', async () => {
        const peticiones = servidor();
        const { barra, $ } = montar();
        desconectar(barra);
        $('salir').click();
        ventana.cambiarRed(false);
        await asentar();
        assert.equal(peticiones.length, 0);
        assert.equal($('sin-red').hidden, true);
    });
});
