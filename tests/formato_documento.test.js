import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { autoformatear, crearValidadorFormato, gruposDeDigitos, sinRestriccion } from '../src/js/control/formato_documento.js';

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

describe('formato_documento: autoformatear', () => {
    const LICENCIA = '^[0-9]{4}-[0-9]{6}-[0-9]{3}-[0-9]$';
    const PASAPORTE = '^[A-Z][0-9]{8}$';

    test('reconoce solo expresiones de grupos de dígitos separados por guion', () => {
        assert.deepEqual(gruposDeDigitos(DUI), [8, 1]);
        assert.deepEqual(gruposDeDigitos(LICENCIA), [4, 6, 3, 1]);
        assert.deepEqual(gruposDeDigitos('\\d{8}-\\d'), [8, 1]);
        for (const otra of [PASAPORTE, '^[0-9]{9}$', null, '.', '^[0-9]+-[0-9]$']) assert.equal(gruposDeDigitos(otra), null, String(otra));
    });

    test('DUI: inserta el guion al llegar el dígito verificador', () => {
        assert.equal(autoformatear('12345678', DUI, '1234567'), '12345678');
        assert.equal(autoformatear('123456789', DUI, '12345678'), '12345678-9');
        assert.equal(autoformatear('123456789', DUI), '12345678-9', 'pegado de una vez');
        assert.equal(autoformatear('12345678-90', DUI, '12345678-9'), '12345678-9', 'no pasa del largo');
    });

    test('licencia: guiones entre cada grupo', () => {
        assert.equal(autoformatear('12345678901234', LICENCIA), '1234-567890-123-4');
        assert.equal(autoformatear('12345', LICENCIA, '1234'), '1234-5');
    });

    test('no toca el valor al borrar, con letras ni con tipos sin grupos', () => {
        assert.equal(autoformatear('12345678-', DUI, '12345678-9'), '12345678-');
        assert.equal(autoformatear(' 123456789', DUI, ''), ' 123456789');
        assert.equal(autoformatear('A12345678', PASAPORTE, 'A1234567'), 'A12345678');
        assert.equal(autoformatear('123456789', null, ''), '123456789');
        assert.equal(autoformatear(undefined, DUI), '');
    });
});
