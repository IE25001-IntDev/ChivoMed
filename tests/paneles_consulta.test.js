import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, conectar, desconectar } from './dobles/dom_minimo.js';
import { normalizarConsultas } from '../src/js/boundary/vistas/controlador_consultas.js';
import { pasosPendientes, MENSAJES } from '../src/js/boundary/vistas/controlador_consulta.js';
import { UUID, paso, pendiente, procedimiento, consultaB6, examen } from './dobles/consulta.js';

before(async () => {
    instalarDom();
    await import('../src/js/boundary/components/consulta/panel_paso_actual.js');
    await import('../src/js/boundary/components/consulta/panel_examenes_paso.js');
    await import('../src/js/boundary/components/consulta/panel_cierre_consulta.js');
});

function montar(tag, modelo, tipos) {
    const el = new (customElements.get(tag))();
    el.modelo = Object.freeze(modelo);
    conectar(el);
    const eventos = [];
    for (const tipo of tipos) el.addEventListener(tipo, e => eventos.push(e));
    return { el, eventos, $: id => el.shadowRoot.getElementById(id), q: s => el.shadowRoot.querySelectorAll(s) };
}

const [consulta] = normalizarConsultas([consultaB6()]);
const pasoActual = consulta.procedimientos[0].pasos[1];
const modeloPaso = (extra = {}) => ({
    paso: pasoActual, procedimiento: 'Procedimiento 1', pendientes: pasosPendientes(consulta), indicaFin: false,
    borrador: '', editable: true, aviso: null, motivo: null, ofrecerRetroceso: true, motivoRetroceso: null,
    confirmando: false, accion: null, ...extra,
});
const EVENTOS_PASO = ['cambiar-borrador', 'avanzar', 'retroceder', 'confirmar', 'cancelar', 'elegir-paso'];

describe('<panel-paso-actual>', () => {
    test('muestra el paso con textContent: un nombre con HTML se pinta como texto', () => {
        const [rara] = normalizarConsultas([consultaB6({ procedimientos: [procedimiento(1, [pendiente(2, { nombre: '<img src=x onerror=alert(1)>' })])] })]);
        const { $, q } = montar('panel-paso-actual', modeloPaso({ paso: rara.procedimientos[0].pasos[0] }), EVENTOS_PASO);
        assert.equal($('nombre').textContent, '<img src=x onerror=alert(1)>');
        assert.equal(q('img').length, 0);
        assert.equal($('responsable').textContent, 'Responsable: Persona Responsable · Doctor');
        assert.equal($('procedimiento').textContent, 'Procedimiento: Procedimiento 1');
    });

    test('"Avanzar" o "Completar paso" según indicaFin; los botones emiten sus eventos', () => {
        const { $, eventos, el } = montar('panel-paso-actual', modeloPaso(), EVENTOS_PASO);
        assert.equal($('avanzar').textContent, 'Avanzar');
        $('avanzar').dispatchEvent(new Event('click'));
        $('retroceder').dispatchEvent(new Event('click'));
        assert.deepEqual(eventos.map(e => e.type), ['avanzar', 'retroceder']);
        assert.equal(eventos[0].bubbles && eventos[0].composed, true);
        el.modelo = Object.freeze(modeloPaso({ indicaFin: true }));
        assert.equal($('avanzar').textContent, 'Completar paso');
    });

    test('escribir emite cambiar-borrador; el modelo no pisa lo escrito si trae el mismo texto', () => {
        const { $, eventos, el } = montar('panel-paso-actual', modeloPaso({ borrador: 'Registro previo' }), EVENTOS_PASO);
        assert.equal($('valor').value, 'Registro previo', 'precarga del paso reabierto');
        $('valor').value = 'Registro previo y más';
        $('valor').dispatchEvent(new Event('input'));
        assert.deepEqual(eventos.at(-1).detail, { valor: 'Registro previo y más' });
        el.modelo = Object.freeze(modeloPaso({ borrador: 'Registro previo y más' }));
        assert.equal($('valor').value, 'Registro previo y más');
    });

    test('con motivo (sin red, otro rol) los dos botones se deshabilitan y se explica por qué', () => {
        const { $ } = montar('panel-paso-actual', modeloPaso({ motivo: MENSAJES.sinRed }), EVENTOS_PASO);
        assert.equal($('avanzar').disabled, true);
        assert.equal($('retroceder').disabled, true);
        assert.equal($('motivo').hidden, false);
        assert.equal($('motivo').textContent, MENSAJES.sinRed);
        assert.equal($('avanzar').getAttribute('aria-describedby'), 'motivo');
    });

    test('Retroceder: oculto en el primer paso; deshabilitado con su propio motivo si hay órdenes', () => {
        const primero = montar('panel-paso-actual', modeloPaso({ ofrecerRetroceso: false }), EVENTOS_PASO);
        assert.equal(primero.$('retroceder').hidden, true);
        assert.equal(primero.$('motivo').hidden, true);
        const conOrdenes = montar('panel-paso-actual', modeloPaso({ motivoRetroceso: MENSAJES.retrocesoConOrdenes }), EVENTOS_PASO);
        assert.equal(conOrdenes.$('avanzar').disabled, false);
        assert.equal(conOrdenes.$('retroceder').disabled, true);
        assert.equal(conOrdenes.$('motivo').textContent, MENSAJES.retrocesoConOrdenes);
    });

    test('la confirmación del retroceso aparece y sus botones emiten confirmar y cancelar', () => {
        const { $, eventos, el } = montar('panel-paso-actual', modeloPaso({ confirmando: true }), EVENTOS_PASO);
        assert.equal($('confirmacion').hidden, false);
        $('confirmar').dispatchEvent(new Event('click'));
        $('cancelar').dispatchEvent(new Event('click'));
        assert.deepEqual(eventos.map(e => e.type), ['confirmar', 'cancelar']);
        el.enfocar('confirmacion');
        assert.equal(el.shadowRoot.activeElement, $('confirmar'));
    });

    test('durante la acción el botón dice qué pasa y el panel está ocupado', () => {
        const { $, el } = montar('panel-paso-actual', modeloPaso({ accion: 'avanzar', motivo: MENSAJES.accionEnCurso }), EVENTOS_PASO);
        assert.equal($('avanzar').textContent, 'Guardando…');
        assert.equal($('motivo').hidden, true);
        assert.equal(el.getAttribute('aria-busy'), 'true');
    });

    test('el aviso de paso reabierto y el campo de solo lectura', () => {
        const { $ } = montar('panel-paso-actual', modeloPaso({ aviso: MENSAJES.reabierto, editable: false }), EVENTOS_PASO);
        assert.equal($('aviso').hidden, false);
        assert.equal($('aviso').textContent, MENSAJES.reabierto);
        assert.equal($('valor').hasAttribute('readonly'), true);
    });

    test('el selector solo aparece con varios pendientes, marca el actual y emite elegir-paso', () => {
        const uno = montar('panel-paso-actual', modeloPaso(), EVENTOS_PASO);
        assert.equal(uno.$('selector').hidden, true);
        const [varios] = normalizarConsultas([consultaB6({ procedimientos: [procedimiento(1, [pendiente(2, { nivel: 0 })]), procedimiento(2, [pendiente(4, { nivel: 0 })])] })]);
        const pendientes = pasosPendientes(varios);
        const { $, q, eventos } = montar('panel-paso-actual', modeloPaso({ pendientes, paso: pendientes[1].paso }), EVENTOS_PASO);
        assert.equal($('selector').hidden, false);
        const radios = q('input[type="radio"]');
        assert.deepEqual(radios.map(r => r.checked), [false, true]);
        radios[0].checked = true;
        radios[0].dispatchEvent(new Event('change'));
        assert.deepEqual(eventos.at(-1).detail, { idPaso: UUID(102) });
    });

    test('sin paso pendiente muestra el mensaje y oculta el formulario', () => {
        const { $ } = montar('panel-paso-actual', modeloPaso({ paso: null, pendientes: [] }), EVENTOS_PASO);
        assert.equal($('sin-paso').hidden, false);
        assert.equal($('contenido').hidden, true);
    });

    test('al desconectarse deja de emitir', () => {
        const { $, eventos, el } = montar('panel-paso-actual', modeloPaso(), EVENTOS_PASO);
        desconectar(el);
        $('avanzar').dispatchEvent(new Event('click'));
        assert.equal(eventos.length, 0);
    });
});

const orden = (n, extra = {}) => ({ idOrdenExamen: UUID(600 + n), idExamen: UUID(301), indicaciones: null, fechaCreacion: '2026-11-13T08:30:00-06:00', ...extra });
const modeloExamenes = (extra = {}) => ({ asignables: [examen(1), examen(2)], ordenes: [], motivo: null, accion: null, error: null, ...extra });

describe('<panel-examenes-paso>', () => {
    test('lista los asignables por nombre, con una opción vacía primero', () => {
        const { q } = montar('panel-examenes-paso', modeloExamenes(), ['emitir-orden']);
        assert.deepEqual(q('option').map(o => [o.value, o.textContent]), [['', 'Elige un examen'], [UUID(301), 'Examen 1'], [UUID(302), 'Examen 2']]);
    });

    test('enviar emite el examen y las indicaciones; limpiar() vacía el formulario y enfoca el examen', () => {
        const { $, eventos, el } = montar('panel-examenes-paso', modeloExamenes(), ['emitir-orden']);
        $('examen').value = UUID(302);
        $('indicaciones').value = 'En ayunas';
        $('indicaciones').dispatchEvent(new Event('input'));
        assert.equal($('contador-indicaciones').textContent, '9/255 caracteres');
        const envio = new Event('submit', { cancelable: true });
        $('formulario').dispatchEvent(envio);
        assert.equal(envio.defaultPrevented, true);
        assert.deepEqual(eventos[0].detail, { idExamen: UUID(302), indicaciones: 'En ayunas' });
        el.limpiar();
        assert.equal($('examen').value, '');
        assert.equal($('indicaciones').value, '');
        assert.equal(el.shadowRoot.activeElement, $('examen'));
    });

    test('las órdenes muestran el nombre del examen, o "Examen ya no disponible", o "Orden sin examen asociado"', () => {
        const { q } = montar('panel-examenes-paso', modeloExamenes({ ordenes: [
            orden(1, { indicaciones: 'Indicación <b>de prueba</b>' }), orden(2, { idExamen: UUID(399) }), orden(3, { idExamen: null }),
        ] }), ['emitir-orden']);
        const nombres = q('p.orden-nombre').map(p => p.textContent);
        assert.deepEqual(nombres, ['Examen 1', 'Examen ya no disponible', 'Orden sin examen asociado']);
        assert.equal(q('p.orden-indicaciones')[0].textContent, 'Indicación <b>de prueba</b>');
        assert.equal(q('b').length, 0);
        assert.equal(q('p.no-disponible').length, 2);
    });

    test('sin asignables oculta el formulario; sin órdenes lo dice', () => {
        const { $ } = montar('panel-examenes-paso', modeloExamenes({ asignables: [] }), ['emitir-orden']);
        assert.equal($('formulario').hidden, true);
        assert.equal($('sin-asignables').hidden, false);
        assert.equal($('sin-ordenes').hidden, false);
    });

    test('con motivo no se puede emitir; un error marca el examen y se anuncia', () => {
        const { $, el } = montar('panel-examenes-paso', modeloExamenes({ motivo: MENSAJES.sinRed }), ['emitir-orden']);
        assert.equal($('emitir').disabled, true);
        assert.equal($('motivo-orden').textContent, MENSAJES.sinRed);
        el.modelo = Object.freeze(modeloExamenes({ error: MENSAJES.examenRequerido }));
        assert.equal($('error-orden').hidden, false);
        assert.equal($('error-orden').getAttribute('role'), 'alert');
        assert.equal($('examen').getAttribute('aria-invalid'), 'true');
    });

    test('un cambio de órdenes no reconstruye la lista de exámenes (conserva la elección)', () => {
        const asignables = Object.freeze([examen(1), examen(2)]);
        const { $, el } = montar('panel-examenes-paso', modeloExamenes({ asignables }), ['emitir-orden']);
        $('examen').value = UUID(302);
        const opcion = $('examen').children[1];
        el.modelo = Object.freeze(modeloExamenes({ asignables, ordenes: [orden(1)] }));
        assert.equal($('examen').children[1], opcion);
        assert.equal($('examen').value, UUID(302));
    });
});

describe('<panel-cierre-consulta>', () => {
    const modelo = (extra = {}) => ({ motivo: null, confirmando: false, accion: null, ...extra });

    test('Cerrar emite las observaciones; la confirmación emite confirmar o cancelar', () => {
        const { $, eventos, el } = montar('panel-cierre-consulta', modelo(), ['cerrar', 'confirmar', 'cancelar']);
        $('observaciones').value = 'Notas finales';
        $('cerrar').dispatchEvent(new Event('click'));
        assert.deepEqual(eventos[0].detail, { observaciones: 'Notas finales' });
        assert.equal($('confirmacion').hidden, true);
        el.modelo = Object.freeze(modelo({ confirmando: true }));
        assert.equal($('confirmacion').hidden, false);
        assert.equal($('cerrar').disabled, true, 'mientras se confirma no se vuelve a pedir');
        $('confirmar').dispatchEvent(new Event('click'));
        $('cancelar').dispatchEvent(new Event('click'));
        assert.deepEqual(eventos.map(e => e.type), ['cerrar', 'confirmar', 'cancelar']);
    });

    test('con motivo se deshabilita y lo explica; durante el cierre dice "Cerrando…"', () => {
        const { $, el } = montar('panel-cierre-consulta', modelo({ motivo: MENSAJES.sinRed }), ['cerrar']);
        assert.equal($('cerrar').disabled, true);
        assert.equal($('motivo-cierre').textContent, MENSAJES.sinRed);
        assert.equal($('observaciones').hasAttribute('readonly'), true);
        el.modelo = Object.freeze(modelo({ accion: 'cierre', motivo: MENSAJES.accionEnCurso }));
        assert.equal($('cerrar').textContent, 'Cerrando…');
        assert.equal(el.getAttribute('aria-busy'), 'true');
    });

    test('el contador de observaciones refleja lo escrito', () => {
        const { $ } = montar('panel-cierre-consulta', modelo(), ['cerrar']);
        assert.equal($('contador-observaciones').textContent, '0/255 caracteres');
        $('observaciones').value = 'abc';
        $('observaciones').dispatchEvent(new Event('input'));
        assert.equal($('contador-observaciones').textContent, '3/255 caracteres');
    });
});
