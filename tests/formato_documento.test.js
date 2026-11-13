import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crearValidadorFormato, sinRestriccion } from '../src/js/control/formato_documento.js';

// La expresión del DUI de la demo del backend; los números son inventados.
const DUI = '^[0-9]{8}-[0-9]$';

describe('formato_documento: crearValidadorFormato', () => {
    test('el DUI de la demo exige ocho dígitos, guion y un dígito, completos', () => {
        const valida = crearValidadorFormato(DUI);
        assert.equal(valida('12345678-9'), true);
        for (const malo of ['1234567-8', '123456789', '12345678-9X', 'x12345678-9', '']) assert.equal(valida(malo), false, malo);
    });

    test('recorta el valor antes de comparar, como Pattern.matches(expresion, valor.trim())', () => {
        assert.equal(crearValidadorFormato(DUI)('  12345678-9 '), true);
    });

    test('null, en blanco y "." no imponen formato', () => {
        for (const libre of [null, undefined, '', '   ', '.']) {
            assert.equal(sinRestriccion(libre), true, String(libre));
            assert.equal(crearValidadorFormato(libre), null, String(libre));
        }
        assert.equal(sinRestriccion('..'), false, 'solo "." exacto es sin restricción');
    });

    test('una expresión que JS no compila no valida: decide el backend', () => {
        assert.equal(crearValidadorFormato('(sin cerrar'), null);
    });

    test('la alternativa se ancla completa, no por partes', () => {
        const alternativa = crearValidadorFormato('A|B');
        assert.equal(alternativa('A'), true);
        assert.equal(alternativa('AB'), false);
    });
});
