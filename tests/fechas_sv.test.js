import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hoySV, sumarDias, diasEntre, esFechaISO, formatearFecha, formatearFechaHora } from '../src/js/boundary/fechas_sv.js';

describe('fechas_sv', () => {
    test('hoySV usa el día de El Salvador aunque en UTC ya sea el día siguiente', () => {
        // 2026-11-13 23:30 en El Salvador (UTC−6) = 2026-11-14 05:30 UTC.
        assert.equal(hoySV(() => new Date('2026-11-14T05:30:00Z')), '2026-11-13');
        assert.equal(hoySV(() => new Date('2026-11-14T06:00:00Z')), '2026-11-14');
    });

    test('sumarDias y diasEntre cruzan meses, años y años bisiestos', () => {
        assert.equal(sumarDias('2026-11-13', 30), '2026-12-13');
        assert.equal(sumarDias('2026-12-31', 1), '2027-01-01');
        assert.equal(sumarDias('2028-02-28', 1), '2028-02-29');
        assert.equal(sumarDias('2026-03-01', -1), '2026-02-28');
        assert.equal(diasEntre('2026-11-01', '2026-12-01'), 30);
        assert.equal(diasEntre('2028-02-01', '2028-03-01'), 29);
        assert.equal(diasEntre('2026-11-13', '2026-11-13'), 0);
        assert.equal(diasEntre('2026-11-14', '2026-11-13'), -1);
        assert.throws(() => sumarDias('no', 1), RangeError);
    });

    test('esFechaISO exige formato yyyy-MM-dd y una fecha que exista', () => {
        assert.equal(esFechaISO('2026-11-13'), true);
        assert.equal(esFechaISO('2028-02-29'), true);
        for (const malo of ['2026-02-30', '2026-13-01', '13/11/2026', '2026-1-1', '', null, undefined]) {
            assert.equal(esFechaISO(malo), false, String(malo));
        }
    });

    test('formatearFechaHora muestra la hora de El Salvador; sin valor dice "Sin fecha"', () => {
        const texto = formatearFechaHora('2026-11-13T08:05:00-06:00');
        assert.match(texto, /13/);
        assert.match(texto, /8:05/);
        assert.equal(formatearFechaHora(null), 'Sin fecha');
        assert.equal(formatearFechaHora('basura'), 'Sin fecha');
    });

    test('formatearFecha no corre el día por la zona horaria', () => {
        assert.match(formatearFecha('2026-11-01'), /^1 /);
        assert.equal(formatearFecha('2026-02-30'), 'Sin fecha');
    });
});
