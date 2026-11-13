import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crearEstado } from '../src/js/control/estado_reactivo.js';

const tick = () => new Promise(resolve => queueMicrotask(resolve));

/** Estado con `programar` manual: las notificaciones solo corren al llamar a `vaciar()`. */
function manual(inicial) {
    const cola = [];
    const errores = [];
    const r = crearEstado(inicial, { programar: fn => cola.push(fn), alFallar: e => errores.push(e) });
    return { ...r, cola, errores, vaciar: () => { while (cola.length) cola.shift()(); } };
}

/** Suscriptor que registra cada lote como arreglo ordenado de claves. */
function registrar(suscribir) {
    const lotes = [];
    const cancelar = suscribir(cambios => lotes.push([...cambios].sort()));
    return { lotes, cancelar };
}

describe('crearEstado', () => {
    test('lee los valores iniciales y una escritura se ve de inmediato', () => {
        const { estado } = crearEstado({ a: 1, b: 'x' });
        assert.equal(estado.a, 1);
        estado.a = 2;
        assert.equal(estado.a, 2);
        assert.deepEqual({ ...estado }, { a: 2, b: 'x' });
    });

    test('un cambio notifica una vez y en el siguiente microtask, no antes', async () => {
        const { estado, suscribir } = crearEstado({ a: 1 });
        const { lotes } = registrar(suscribir);
        estado.a = 2;
        assert.deepEqual(lotes, [], 'no notifica de forma síncrona');
        await tick();
        assert.deepEqual(lotes, [['a']]);
    });

    test('con programar inyectado se agenda una sola tarea por lote', () => {
        const { estado, suscribir, cola, vaciar } = manual({ a: 1, b: 1 });
        const { lotes } = registrar(suscribir);
        estado.a = 2;
        estado.b = 2;
        estado.a = 3;
        assert.equal(cola.length, 1);
        vaciar();
        assert.deepEqual(lotes, [['a', 'b']]);
    });

    test('varios cambios del mismo tick, incluido Object.assign, llegan juntos', async () => {
        const { estado, suscribir } = crearEstado({ a: 1, b: 1, c: 1 });
        const { lotes } = registrar(suscribir);
        estado.a = 2;
        Object.assign(estado, { b: 2, c: 2 });
        await tick();
        assert.deepEqual(lotes, [['a', 'b', 'c']]);
    });

    test('asignar el mismo valor no notifica (primitivo, misma referencia y NaN)', async () => {
        const lista = Object.freeze([1]);
        const { estado, suscribir, cola } = manual({ n: 1, lista, x: NaN });
        estado.n = 1;
        estado.lista = lista;
        estado.x = NaN;
        assert.equal(cola.length, 0);
        const { lotes } = registrar(suscribir);
        await tick();
        assert.deepEqual(lotes, []);
    });

    test('A→B→A en el mismo tick no notifica; si otra clave cambió, solo llega esa', () => {
        const { estado, suscribir, vaciar } = manual({ a: 1, b: 1 });
        const { lotes } = registrar(suscribir);
        estado.a = 2; estado.a = 1;
        vaciar();
        assert.deepEqual(lotes, []);
        estado.a = 2; estado.b = 2; estado.a = 1;
        vaciar();
        assert.deepEqual(lotes, [['b']]);
    });

    test('cambios en ticks distintos generan notificaciones distintas', async () => {
        const { estado, suscribir } = crearEstado({ a: 1 });
        const { lotes } = registrar(suscribir);
        estado.a = 2;
        await tick();
        estado.a = 3;
        await tick();
        assert.deepEqual(lotes, [['a'], ['a']]);
    });

    test('cancelar detiene las notificaciones y se puede llamar dos veces', async () => {
        const { estado, suscribir } = crearEstado({ a: 1 });
        const { lotes, cancelar } = registrar(suscribir);
        cancelar();
        cancelar();
        estado.a = 2;
        await tick();
        assert.deepEqual(lotes, []);
    });

    test('varios suscriptores reciben el mismo lote; uno cancelado durante la vuelta ya no se llama', () => {
        const { estado, suscribir, vaciar } = manual({ a: 1 });
        const llamadas = [];
        let cancelarSegundo;
        suscribir(cambios => { llamadas.push(['1', [...cambios]]); cancelarSegundo(); });
        cancelarSegundo = suscribir(() => llamadas.push(['2']));
        suscribir(cambios => llamadas.push(['3', [...cambios]]));
        estado.a = 2;
        vaciar();
        assert.deepEqual(llamadas, [['1', ['a']], ['3', ['a']]]);
    });

    test('un suscriptor que lanza no impide a los demás y el error va a alFallar', () => {
        const { estado, suscribir, vaciar, errores } = manual({ a: 1 });
        const falla = new Error('falla de prueba');
        let segundo = 0;
        suscribir(() => { throw falla; });
        suscribir(() => segundo++);
        estado.a = 2;
        vaciar();
        assert.equal(segundo, 1);
        assert.deepEqual(errores, [falla]);
    });

    test('una clave desconocida, delete y defineProperty lanzan TypeError', () => {
        const { estado } = crearEstado({ a: 1 });
        assert.throws(() => { estado.b = 1; }, TypeError);
        assert.throws(() => { delete estado.a; }, TypeError);
        assert.throws(() => Object.defineProperty(estado, 'a', { value: 2 }), TypeError);
        assert.deepEqual(Object.keys(estado), ['a']);
    });

    test('el suscriptor recibe un Set de solo lectura y el propio estado', () => {
        const { estado, suscribir, vaciar } = manual({ a: 1 });
        let recibido;
        suscribir((cambios, e) => { recibido = { cambios, e }; });
        estado.a = 2;
        vaciar();
        assert.ok(recibido.cambios instanceof Set);
        assert.equal(recibido.cambios.has('a'), true);
        assert.equal(recibido.e, estado);
        assert.throws(() => recibido.cambios.add('b'), TypeError);
        assert.throws(() => recibido.cambios.delete('a'), TypeError);
        assert.throws(() => recibido.cambios.clear(), TypeError);
    });

    test('la reactividad es superficial: un arreglo congelado no se puede mutar, se reemplaza', async () => {
        const { estado, suscribir } = crearEstado({ lista: Object.freeze([1]) });
        const { lotes } = registrar(suscribir);
        assert.throws(() => estado.lista.push(2), TypeError);
        estado.lista = Object.freeze([...estado.lista, 2]);
        await tick();
        assert.deepEqual(lotes, [['lista']]);
        assert.deepEqual(estado.lista, [1, 2]);
    });

    test('suscribir exige una función', () => {
        assert.throws(() => crearEstado({}).suscribir(null), TypeError);
    });
});
