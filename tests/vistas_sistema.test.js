import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, conectar, desconectar } from './dobles/dom_minimo.js';
import { RUTA_POR_DEFECTO } from '../src/js/boundary/rutas.js';

before(async () => {
    instalarDom();
    await import('../src/js/boundary/vistas/vista_no_encontrada.js');
    await import('../src/js/boundary/vistas/vista_sin_conexion.js');
});

function montar(tag, contexto) {
    const vista = document.createElement(tag);
    if (contexto !== undefined) vista.contexto = contexto;
    const eventos = [];
    vista.addEventListener('navegar', e => eventos.push(e));
    conectar(vista);
    return { vista, eventos, $: id => vista.shadowRoot.getElementById(id) };
}

describe('<vista-no-encontrada>', () => {
    test('muestra la dirección pedida y ofrece volver a la búsqueda de citas', () => {
        const { vista, $ } = montar('vista-no-encontrada', { path: '/no-existe' });
        assert.equal($('ruta').textContent, '#/no-existe');
        const enlace = vista.shadowRoot.querySelector('a');
        assert.equal(enlace.getAttribute('href'), `#${RUTA_POR_DEFECTO}`);
        assert.equal(enlace.textContent, 'Ir a la búsqueda de citas');
    });

    test('una dirección con HTML se muestra como texto y no crea elementos', () => {
        const { $ } = montar('vista-no-encontrada', { path: '/<img src=x onerror=alert(1)>' });
        assert.equal($('ruta').textContent, '#/<img src=x onerror=alert(1)>');
        assert.equal($('ruta').children.length, 0);
    });

    test('sin contexto muestra solo "#"', () => {
        const { $ } = montar('vista-no-encontrada');
        assert.equal($('ruta').textContent, '#');
    });

    test('el título se puede enfocar para que el shell lleve ahí el foco al navegar', () => {
        const { $ } = montar('vista-no-encontrada', { path: '/x' });
        assert.equal($('titulo').localName, 'h1');
        assert.equal($('titulo').getAttribute('tabindex'), '-1');
    });

    test('al reconectarse no duplica el contenido y pinta la ruta nueva', () => {
        const { vista, $ } = montar('vista-no-encontrada', { path: '/a' });
        desconectar(vista);
        vista.contexto = { path: '/b' };
        conectar(vista);
        assert.equal(vista.shadowRoot.querySelectorAll('section').length, 1);
        assert.equal($('ruta').textContent, '#/b');
    });
});

describe('<vista-sin-conexion>', () => {
    test('"Volver a intentar" pide otra vez la ruta, cruzando el Shadow DOM', () => {
        const { $, eventos } = montar('vista-sin-conexion', { path: '/dashboard', query: new URLSearchParams() });
        $('reintentar').click();
        assert.equal(eventos.length, 1);
        assert.deepEqual(eventos[0].detail, { ruta: '/dashboard' });
        assert.equal(eventos[0].bubbles, true);
        assert.equal(eventos[0].composed, true);
    });

    test('conserva la query de la ruta pedida', () => {
        const query = new URLSearchParams({ volver: '/consulta/1' });
        const { $, eventos } = montar('vista-sin-conexion', { path: '/login', query });
        $('reintentar').click();
        assert.equal(eventos[0].detail.ruta, `/login?${query}`);
    });

    test('sin contexto reintenta la raíz', () => {
        const { $, eventos } = montar('vista-sin-conexion');
        $('reintentar').click();
        assert.equal(eventos[0].detail.ruta, '/');
    });

    test('el botón no se deshabilita: navigator.onLine puede equivocarse', () => {
        const { $ } = montar('vista-sin-conexion', { path: '/dashboard' });
        assert.equal($('reintentar').disabled, false);
        assert.equal($('titulo').getAttribute('tabindex'), '-1');
    });

    test('al desconectarse deja de escuchar el botón; al reconectarse vuelve, sin duplicar', () => {
        const { vista, $, eventos } = montar('vista-sin-conexion', { path: '/dashboard' });
        desconectar(vista);
        $('reintentar').click();
        assert.equal(eventos.length, 0);
        conectar(vista);
        assert.equal(vista.shadowRoot.querySelectorAll('button').length, 1);
        $('reintentar').click();
        assert.equal(eventos.length, 1);
    });
});
