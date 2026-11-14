import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
    RUTAS, RUTA_NO_ENCONTRADA, RUTA_POR_DEFECTO, RUTA_LOGIN, RUTA_INICIO_EMPLEADO, inicioPorRol,
} from '../src/js/boundary/rutas.js';
import { resolverRuta } from '../src/js/boundary/router.js';

const UUID = '10000000-0000-4000-8000-000000000001';
const TODAS = [...RUTAS, RUTA_NO_ENCONTRADA];

describe('Tabla de rutas', () => {
    test('solo existen las rutas de las 4 HU', () => {
        assert.deepEqual(RUTAS.map(r => r.patron), ['/citas', '/login', '/dashboard', '/consulta/:id']);
    });

    test('la ruta por defecto es #/citas y es pública', () => {
        const { ruta } = resolverRuta(`#${RUTA_POR_DEFECTO}`, RUTAS);
        assert.equal(RUTA_POR_DEFECTO, '/citas');
        assert.equal(ruta.empleado, undefined);
        assert.ok(!ruta.soloInvitados);
    });

    test('el login es solo para invitados y no exige rol', () => {
        const { ruta } = resolverRuta(`#${RUTA_LOGIN}`, RUTAS);
        assert.equal(ruta.soloInvitados, true);
        assert.equal(ruta.empleado, undefined);
    });

    test('dashboard y consulta exigen una sesión de empleado, sin lista fija de roles (B8)', () => {
        for (const hash of [`#${RUTA_INICIO_EMPLEADO}`, `#/consulta/${UUID}`]) {
            const { ruta } = resolverRuta(hash, RUTAS);
            assert.equal(ruta.empleado, true, hash);
            assert.equal(ruta.roles, undefined, hash);
        }
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
    });

    const archivo = ruta => fileURLToPath(new URL(ruta.modulo, new URL('../src/js/boundary/', import.meta.url)));

    test('el módulo de cada vista existe en disco', () => {
        for (const ruta of TODAS) assert.ok(existsSync(archivo(ruta)), archivo(ruta));
    });
});

describe('inicioPorRol', () => {
    const ID = '10000000-0000-4000-8000-000000000002';
    // Doctor (Carlos), Enfermera (Lucía), Atención al público (Marta, código ADMINISTRACION) y un rol sin código.
    for (const codigo of ['DOCTOR', 'ENFERMERA', 'ADMINISTRACION', null]) {
        test(`${codigo} inicia en el dashboard`, () => assert.equal(inicioPorRol({ rolActivo: { idPersonaRol: ID, codigo } }), '/dashboard'));
    }
    for (const valor of [{ rolActivo: { idPersonaRol: ID, codigo: 'PACIENTE' } }, { rolActivo: { codigo: 'DOCTOR' } }, { rolActivo: {} }, null, undefined]) {
        test(`sin inicio para ${JSON.stringify(valor)}`, () => assert.equal(inicioPorRol(valor), null));
    }
});
