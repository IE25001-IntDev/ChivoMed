import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    RUTAS, RUTA_NO_ENCONTRADA, RUTA_POR_DEFECTO, RUTA_LOGIN, RUTA_INICIO_EMPLEADO, ROLES_EMPLEADO, inicioPorRol,
} from '../src/js/boundary/rutas.js';
import { resolverRuta } from '../src/js/boundary/router.js';
import { ROLES } from '../src/js/control/auth_service.js';

const UUID = '10000000-0000-4000-8000-000000000001';
const TODAS = [...RUTAS, RUTA_NO_ENCONTRADA];

describe('Tabla de rutas', () => {
    test('solo existen las rutas de las 4 HU', () => {
        assert.deepEqual(RUTAS.map(r => r.patron), ['/citas', '/login', '/dashboard', '/consulta/:id']);
    });

    test('la ruta por defecto es #/citas y es pública', () => {
        const { ruta } = resolverRuta(`#${RUTA_POR_DEFECTO}`, RUTAS);
        assert.equal(RUTA_POR_DEFECTO, '/citas');
        assert.equal(ruta.roles, undefined);
        assert.ok(!ruta.soloInvitados);
    });

    test('el login es solo para invitados y no exige rol', () => {
        const { ruta } = resolverRuta(`#${RUTA_LOGIN}`, RUTAS);
        assert.equal(ruta.soloInvitados, true);
        assert.equal(ruta.roles, undefined);
    });

    test('dashboard y consulta exigen exactamente los roles DOCTOR y ADMINISTRACION', () => {
        assert.deepEqual([...ROLES_EMPLEADO].sort(), ['ADMINISTRACION', 'DOCTOR']);
        for (const hash of [`#${RUTA_INICIO_EMPLEADO}`, `#/consulta/${UUID}`]) {
            assert.deepEqual(resolverRuta(hash, RUTAS).ruta.roles, ROLES_EMPLEADO, hash);
        }
    });

    test('los roles usados existen en el contrato de /auth/me', () => {
        for (const ruta of RUTAS) for (const rol of ruta.roles ?? []) assert.ok(Object.hasOwn(ROLES, rol), rol);
    });

    test('la consulta solo acepta un UUID como :id', () => {
        assert.equal(resolverRuta(`#/consulta/${UUID}`, RUTAS).ruta.tag, 'vista-consulta');
        assert.equal(resolverRuta('#/consulta/1', RUTAS).ruta, null);
    });

    test('cada vista tiene un nombre de custom element válido y único', () => {
        const tags = TODAS.map(r => r.tag);
        for (const tag of tags) assert.match(tag, /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/, tag);
        assert.equal(new Set(tags).size, tags.length);
    });

    test('cada vista tiene título, módulo en snake_case y función de carga', () => {
        for (const ruta of TODAS) {
            assert.ok(ruta.titulo?.trim(), ruta.tag);
            assert.match(ruta.modulo, /^\.\/vistas\/[a-z0-9_]+\.js$/, ruta.tag);
            assert.equal(typeof ruta.cargar, 'function', ruta.tag);
        }
    });

    test('la tabla no se puede modificar en tiempo de ejecución', () => {
        assert.ok(Object.isFrozen(RUTAS));
        assert.ok(RUTAS.every(Object.isFrozen));
        assert.ok(Object.isFrozen(ROLES_EMPLEADO));
    });

    const archivo = ruta => fileURLToPath(new URL(ruta.modulo, new URL('../src/js/boundary/', import.meta.url)));

    test('el módulo de cada vista existe en disco', () => {
        for (const ruta of TODAS) assert.ok(existsSync(archivo(ruta)), archivo(ruta));
    });
});

describe('inicioPorRol', () => {
    for (const rol of ['DOCTOR', 'ADMINISTRACION']) {
        test(`${rol} inicia en el dashboard`, () => assert.equal(inicioPorRol({ rolActivo: { codigo: rol } }), '/dashboard'));
    }
    for (const valor of [{ rolActivo: { codigo: 'PACIENTE' } }, { rolActivo: { codigo: '__proto__' } }, { rolActivo: {} }, null, undefined]) {
        test(`sin inicio para ${JSON.stringify(valor)}`, () => assert.equal(inicioPorRol(valor), null));
    }
});
