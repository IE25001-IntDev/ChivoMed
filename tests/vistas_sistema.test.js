import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, conectar, desconectar } from './dobles/dom_minimo.js';
import { RUTA_POR_DEFECTO, RUTA_NO_ENCONTRADA, RUTA_SIN_CONEXION } from '../src/js/boundary/rutas.js';

before(async () => {
    instalarDom();
    await import('../src/js/boundary/vistas/vista_aviso.js');
});

// <vista-aviso> toma su configuración de la ruta que la monta: el contexto del router siempre trae `ruta`.
const RUTAS_AVISO = { 'no-encontrada': RUTA_NO_ENCONTRADA, 'sin-conexion': RUTA_SIN_CONEXION };

function montar(aviso, contexto) {
    const vista = document.createElement('vista-aviso');
    vista.contexto = { ruta: RUTAS_AVISO[aviso], ...contexto };
    const eventos = [];
    vista.addEventListener('navegar', e => eventos.push(e));
    conectar(vista);
    return { vista, eventos, $: id => vista.shadowRoot.getElementById(id) };
}

describe('<vista-aviso> de ruta no encontrada', () => {
    test('muestra la dirección pedida y ofrece volver a la búsqueda de citas', () => {
        const { vista, $ } = montar('no-encontrada', { path: '/no-existe' });
        assert.equal($('ruta').textContent, '#/no-existe');
        const enlace = vista.shadowRoot.querySelector('a');
        assert.equal(enlace.getAttribute('href'), `#${RUTA_POR_DEFECTO}`);
        assert.equal(enlace.textContent, 'Ir a la búsqueda de citas');
    });

    test('una dirección con HTML se muestra como texto y no crea elementos', () => {
        const { $ } = montar('no-encontrada', { path: '/<img src=x onerror=alert(1)>' });
        assert.equal($('ruta').textContent, '#/<img src=x onerror=alert(1)>');
        assert.equal($('ruta').children.length, 0);
    });

    test('sin path en el contexto muestra solo "#"', () => {
        const { $ } = montar('no-encontrada');
        assert.equal($('ruta').textContent, '#');
    });

    test('el título se puede enfocar para que el shell lleve ahí el foco al navegar', () => {
        const { $ } = montar('no-encontrada', { path: '/x' });
        assert.equal($('titulo').localName, 'h1');
        assert.equal($('titulo').getAttribute('tabindex'), '-1');
    });

    test('al reconectarse no duplica el contenido y pinta la ruta nueva', () => {
        const { vista, $ } = montar('no-encontrada', { path: '/a' });
        desconectar(vista);
        vista.contexto = { ...vista.contexto, path: '/b' };
        conectar(vista);
        assert.equal(vista.shadowRoot.querySelectorAll('section').length, 1);
        assert.equal($('ruta').textContent, '#/b');
    });
});

describe('<vista-aviso> sin conexión', () => {
    test('"Volver a intentar" pide otra vez la ruta, cruzando el Shadow DOM', () => {
        const { $, eventos } = montar('sin-conexion', { path: '/dashboard', query: new URLSearchParams() });
        $('reintentar').click();
        assert.equal(eventos.length, 1);
        assert.deepEqual(eventos[0].detail, { ruta: '/dashboard' });
        assert.equal(eventos[0].bubbles, true);
        assert.equal(eventos[0].composed, true);
    });

    test('conserva la query de la ruta pedida', () => {
        const query = new URLSearchParams({ volver: '/consulta/1' });
        const { $, eventos } = montar('sin-conexion', { path: '/login', query });
        $('reintentar').click();
        assert.equal(eventos[0].detail.ruta, `/login?${query}`);
    });

    test('sin path en el contexto reintenta la raíz', () => {
        const { $, eventos } = montar('sin-conexion');
        $('reintentar').click();
        assert.equal(eventos[0].detail.ruta, '/');
    });

    test('explica que no hay servidor ni datos guardados', () => {
        const { $ } = montar('sin-conexion', { path: '/dashboard' });
        assert.ok($('detalle'), 'hay un párrafo con el detalle');
        assert.match($('detalle').textContent, /^No se puede conectar con el servidor y no hay datos guardados\./);
    });

    test('el botón no se deshabilita: navigator.onLine puede equivocarse', () => {
        const { $ } = montar('sin-conexion', { path: '/dashboard' });
        assert.equal($('reintentar').disabled, false);
        assert.equal($('titulo').getAttribute('tabindex'), '-1');
    });

    test('al desconectarse deja de escuchar el botón; al reconectarse vuelve, sin duplicar', () => {
        const { vista, $, eventos } = montar('sin-conexion', { path: '/dashboard' });
        desconectar(vista);
        $('reintentar').click();
        assert.equal(eventos.length, 0);
        conectar(vista);
        assert.equal(vista.shadowRoot.querySelectorAll('button').length, 1);
        $('reintentar').click();
        assert.equal(eventos.length, 1);
    });
});

describe('<vista-aviso>: configuración', () => {
    /** Aviso configurado por propiedad, sin contexto del router: así lo monta <app-shell> para un error. */
    function montarConAviso(aviso) {
        const vista = document.createElement('vista-aviso');
        vista.aviso = aviso;
        const eventos = [];
        vista.addEventListener('navegar', e => eventos.push(e));
        vista.addEventListener('reintentar', e => eventos.push(e));
        conectar(vista);
        return { vista, eventos, $: id => vista.shadowRoot.getElementById(id) };
    }

    test('las dos rutas de aviso montan el mismo componente con su configuración congelada', () => {
        for (const ruta of [RUTA_NO_ENCONTRADA, RUTA_SIN_CONEXION]) {
            assert.equal(ruta.tag, 'vista-aviso');
            assert.equal(ruta.modulo, './vistas/vista_aviso.js');
            assert.ok(Object.isFrozen(ruta.aviso), ruta.titulo);
            assert.ok(ruta.aviso.titulo.trim(), ruta.titulo);
        }
        assert.equal(RUTA_NO_ENCONTRADA.aviso.accion, 'enlace');
        assert.equal(RUTA_NO_ENCONTRADA.aviso.destino, RUTA_POR_DEFECTO);
        assert.equal(RUTA_SIN_CONEXION.aviso.accion, 'reintentar');
    });

    test('cada ruta pinta su título y una sola acción: enlace o botón', () => {
        const noEncontrada = montar('no-encontrada', { path: '/x' });
        assert.equal(noEncontrada.$('titulo').textContent, 'No encontramos esta página');
        assert.equal(noEncontrada.vista.shadowRoot.querySelectorAll('a').length, 1);
        assert.equal(noEncontrada.vista.shadowRoot.querySelector('button'), null);
        assert.equal(noEncontrada.$('detalle').textContent, 'La dirección #/x no existe en ChivoMed.');

        const sinConexion = montar('sin-conexion', { path: '/dashboard' });
        assert.equal(sinConexion.$('titulo').textContent, 'Sin conexión');
        assert.equal(sinConexion.vista.shadowRoot.querySelector('a'), null);
        assert.equal(sinConexion.$('reintentar').textContent, 'Volver a intentar');
        assert.equal(sinConexion.$('ruta'), null, 'sin la marca RUTA_PEDIDA no se muestra la dirección');
    });

    test('los avisos de ruta no son alertas; el aviso con alerta: true lleva role="alert"', () => {
        const { vista } = montar('sin-conexion', { path: '/dashboard' });
        assert.equal(vista.shadowRoot.querySelector('section').getAttribute('role'), null);
        const error = montarConAviso({ titulo: 'Error', texto: 'Algo falló.', accion: 'reintentar', alerta: true });
        assert.equal(error.vista.shadowRoot.querySelector('section').getAttribute('role'), 'alert');
        assert.equal(error.$('titulo').getAttribute('tabindex'), '-1');
    });

    test('sin contexto, "Volver a intentar" emite \'reintentar\' (no \'navegar\'), cruzando el Shadow DOM', () => {
        const { $, eventos } = montarConAviso({ titulo: 'Error', texto: 'Algo falló.', accion: 'reintentar' });
        $('reintentar').click();
        assert.equal(eventos.length, 1);
        assert.equal(eventos[0].type, 'reintentar');
        assert.equal(eventos[0].bubbles, true);
        assert.equal(eventos[0].composed, true);
    });

    test('un texto con HTML (p. ej. un mensaje del servidor) se pinta como texto y no crea elementos', () => {
        const html = '<img src=x onerror=alert(1)>';
        const { $ } = montarConAviso({ titulo: html, texto: html, accion: 'reintentar', etiqueta: html });
        assert.equal($('titulo').textContent, html);
        assert.equal($('detalle').textContent, html);
        assert.equal($('reintentar').textContent, html);
        assert.equal($('titulo').children.length, 0);
        assert.equal($('detalle').children.length, 0);
        assert.equal($('reintentar').children.length, 0);
    });

    test('la propiedad aviso tiene prioridad sobre la configuración de la ruta', () => {
        const vista = document.createElement('vista-aviso');
        vista.contexto = { ruta: RUTA_NO_ENCONTRADA, path: '/x' };
        vista.aviso = { titulo: 'Otro aviso', texto: 'Detalle.', accion: 'reintentar' };
        conectar(vista);
        assert.equal(vista.shadowRoot.getElementById('titulo').textContent, 'Otro aviso');
        assert.equal(vista.shadowRoot.querySelector('a'), null);
    });

    test('al reconectarse con otra configuración cambia la acción y el botón viejo deja de emitir', () => {
        const { vista, $, eventos } = montar('sin-conexion', { path: '/dashboard' });
        const boton = $('reintentar');
        desconectar(vista);
        vista.contexto = { ruta: RUTA_NO_ENCONTRADA, path: '/x' };
        conectar(vista);
        boton.click();
        assert.equal(eventos.length, 0);
        assert.equal($('reintentar'), null);
        assert.equal(vista.shadowRoot.querySelectorAll('a').length, 1);
        assert.equal(vista.shadowRoot.querySelectorAll('section').length, 1);
    });

    test('al asignar aviso se pinta sin esperar a conectarse, para que el shell enfoque su título', () => {
        const vista = document.createElement('vista-aviso');
        vista.aviso = { titulo: 'No pudimos abrir esta página', texto: 'Algo falló.', accion: 'reintentar', alerta: true };
        assert.equal(vista.shadowRoot.getElementById('titulo').textContent, 'No pudimos abrir esta página');
        assert.ok(vista.shadowRoot.querySelector('section[role="alert"]'));
        conectar(vista);
        assert.equal(vista.shadowRoot.querySelectorAll('section').length, 1, 'conectarse no duplica la plantilla');
        assert.equal(vista.shadowRoot.querySelectorAll('button').length, 1);
    });

    test('sin configuración no pinta acción ni falla', () => {
        const vista = conectar(document.createElement('vista-aviso'));
        assert.equal(vista.shadowRoot.getElementById('titulo').textContent, '');
        assert.equal(vista.shadowRoot.querySelector('a'), null);
        assert.equal(vista.shadowRoot.querySelector('button'), null);
    });
});
