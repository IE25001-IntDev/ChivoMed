import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MemoriaVistas, memoria } from '../src/js/boundary/vistas/memoria_vistas.js';

const UUID = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sesion = n => ({ usuario: { idUsuario: UUID(n) }, rolActivo: { codigo: 'DOCTOR' }, csrfToken: 'csrf-prueba' });

describe('MemoriaVistas', () => {
    test('la clave de datos va atada al usuario de la sesión', () => {
        assert.equal(MemoriaVistas.clave(sesion(1), 'dashboard'), `${UUID(1)}:dashboard`);
        assert.equal(MemoriaVistas.clave(null, 'dashboard'), null);
        assert.equal(MemoriaVistas.clave({ usuario: {} }, 'dashboard'), null);
    });

    test('guarda y lee por clave; una clave desconocida o nula devuelve null', () => {
        const m = new MemoriaVistas();
        m.guardar('a', { x: 1 });
        m.guardar(null, { x: 2 });
        assert.deepEqual(m.leer('a'), { x: 1 });
        assert.equal(m.leer('b'), null);
        assert.equal(m.leer(null), null);
    });

    test('recordar la sesión del mismo usuario conserva los datos', () => {
        const m = new MemoriaVistas();
        m.recordarSesion(sesion(1));
        m.guardar('a', 1);
        const nueva = { ...sesion(1), rolActivo: { codigo: 'ADMINISTRACION' } };
        m.recordarSesion(nueva);
        assert.equal(m.sesion, nueva);
        assert.equal(m.leer('a'), 1);
    });

    test('recordar la sesión de otro usuario borra los datos del anterior', () => {
        const m = new MemoriaVistas();
        m.recordarSesion(sesion(1));
        m.guardar('a', 1);
        m.recordarSesion(sesion(2));
        assert.equal(m.leer('a'), null);
        assert.equal(m.sesion.usuario.idUsuario, UUID(2));
    });

    test('una sesión sin usuario no se recuerda', () => {
        const m = new MemoriaVistas();
        m.recordarSesion({ rolActivo: { codigo: 'DOCTOR' } });
        assert.equal(m.sesion, null);
    });

    test('limpiar() borra los datos y la sesión', () => {
        const m = new MemoriaVistas();
        m.recordarSesion(sesion(1));
        m.guardar('a', 1);
        m.limpiar();
        assert.equal(m.sesion, null);
        assert.equal(m.leer('a'), null);
    });

    test('existe una instancia compartida', () => assert.ok(memoria instanceof MemoriaVistas));
});
