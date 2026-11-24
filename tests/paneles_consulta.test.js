import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, conectar, desconectar } from './dobles/dom_minimo.js';
import { normalizarConsultas } from '../src/js/control/controladores/controlador_consultas.js';
import { pasosPendientes, MENSAJES } from '../src/js/control/controladores/controlador_consulta.js';
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
const LAB = Object.freeze({ idTipoExamen: UUID(501), nombre: 'Laboratorio clínico' });
const IMG = Object.freeze({ idTipoExamen: UUID(502), nombre: 'Imagenología' });
const conTipo = (n, ...tipos) => Object.freeze({ ...examen(n), tiposExamen: Object.freeze(tipos) });
const ASIGNABLES = Object.freeze([conTipo(1, LAB), conTipo(2, IMG), conTipo(3, IMG, LAB)]);
/** Modelo como lo arma <vista-consulta> a partir del controlador. */
const modeloExamenes = (extra = {}) => ({
    asignables: ASIGNABLES, ordenes: [], categorias: [IMG, LAB], filtro: '', visibles: ASIGNABLES, seleccion: [], ordenados: [],
    textoSeleccion: 'Ningún examen seleccionado', resultado: null, motivo: null, accion: null, error: null, ...extra,
});
const EVENTOS_EXAMENES = ['cambiar-categoria', 'alternar-examen', 'asignar-examenes'];
const casillas = q => q('input[type="checkbox"]');

describe('<panel-examenes-paso>', () => {
    test('filtro "Categoría" con "Todas" más las categorías; una casilla con su nombre y sus tipos por examen visible', () => {
        const { $, q } = montar('panel-examenes-paso', modeloExamenes(), EVENTOS_EXAMENES);
        assert.equal($('campo-categoria').hidden, false);
        assert.deepEqual(q('option').map(o => [o.value, o.textContent]), [['', 'Todas'], [UUID(502), 'Imagenología'], [UUID(501), 'Laboratorio clínico']]);
        assert.deepEqual(casillas(q).map(c => c.value), [UUID(301), UUID(302), UUID(303)]);
        assert.deepEqual(q('label.casilla span.nombre-examen').map(s => s.textContent), ['Examen 1', 'Examen 2', 'Examen 3']);
        assert.equal(q('label.casilla span.meta')[2].textContent, 'Imagenología · Laboratorio clínico');
        assert.equal($('asignar').textContent, 'Asignar exámenes seleccionados');
        assert.equal($('seleccionados').textContent, 'Ningún examen seleccionado');
    });

    test('sin tiposExamen (sin categorías) el filtro se oculta y las casillas siguen', () => {
        const sinTipos = Object.freeze([examen(1), examen(2)].map(e => ({ ...e, tiposExamen: [] })));
        const { $, q } = montar('panel-examenes-paso', modeloExamenes({ asignables: sinTipos, visibles: sinTipos, categorias: [] }), EVENTOS_EXAMENES);
        assert.equal($('campo-categoria').hidden, true);
        assert.equal(casillas(q).length, 2);
        assert.equal(q('label.casilla span.meta').length, 0);
    });

    test('cambiar la categoría y marcar una casilla emiten sus eventos; no deciden nada', () => {
        const { $, q, eventos } = montar('panel-examenes-paso', modeloExamenes(), EVENTOS_EXAMENES);
        $('categoria').value = UUID(501);
        $('categoria').dispatchEvent(new Event('change'));
        const [, segunda] = casillas(q);
        segunda.checked = true;
        segunda.dispatchEvent(new Event('change'));
        assert.deepEqual(eventos.map(e => [e.type, e.detail]), [
            ['cambiar-categoria', { idTipoExamen: UUID(501) }], ['alternar-examen', { idExamen: UUID(302), marcado: true }]]);
        assert.ok(eventos.every(e => e.bubbles && e.composed));
    });

    test('la selección viene del modelo; cambiarla no reconstruye las casillas (el foco no se pierde)', () => {
        const { el, q, $ } = montar('panel-examenes-paso', modeloExamenes(), EVENTOS_EXAMENES);
        const antes = casillas(q);
        el.modelo = Object.freeze(modeloExamenes({ seleccion: [UUID(301), UUID(303)], textoSeleccion: '2 seleccionados' }));
        assert.deepEqual(casillas(q), antes, 'mismas casillas');
        assert.deepEqual(casillas(q).map(c => c.checked), [true, false, true]);
        assert.equal($('seleccionados').textContent, '2 seleccionados');
    });

    test('un examen ya ordenado sale marcado, deshabilitado y con "Ya ordenado"', () => {
        const { q } = montar('panel-examenes-paso', modeloExamenes({ ordenados: [UUID(302)], ordenes: [orden(1, { idExamen: UUID(302) })] }), EVENTOS_EXAMENES);
        const [, ordenada] = casillas(q);
        assert.equal(ordenada.checked, true);
        assert.equal(ordenada.disabled, true);
        assert.deepEqual(q('label.casilla span.insignia').map(s => s.textContent), ['Ya ordenado']);
        assert.equal(casillas(q)[0].disabled, false);
    });

    test('el filtro muestra solo los visibles; si no hay, lo dice', () => {
        const { el, q, $ } = montar('panel-examenes-paso', modeloExamenes({ filtro: UUID(502), visibles: [ASIGNABLES[1], ASIGNABLES[2]] }), EVENTOS_EXAMENES);
        assert.equal($('categoria').value, UUID(502));
        assert.deepEqual(casillas(q).map(c => c.value), [UUID(302), UUID(303)]);
        el.modelo = Object.freeze(modeloExamenes({ filtro: UUID(502), visibles: [] }));
        assert.equal($('sin-visibles').hidden, false);
    });

    test('enviar emite asignar-examenes con las indicaciones comunes; limpiar() las vacía sin mover el foco', () => {
        const { $, eventos, el } = montar('panel-examenes-paso', modeloExamenes(), EVENTOS_EXAMENES);
        $('indicaciones').value = 'En ayunas';
        $('indicaciones').dispatchEvent(new Event('input'));
        assert.equal($('contador-indicaciones').textContent, '9/255 caracteres');
        const envio = new Event('submit', { cancelable: true });
        $('formulario').dispatchEvent(envio);
        assert.equal(envio.defaultPrevented, true);
        assert.deepEqual(eventos.map(e => [e.type, e.detail]), [['asignar-examenes', { indicaciones: 'En ayunas' }]]);
        el.limpiar();
        assert.equal($('indicaciones').value, '');
        assert.equal($('contador-indicaciones').textContent, '0/255 caracteres');
        assert.equal(el.shadowRoot.activeElement, null);
    });

    test('mientras asigna dice "Asignando…" y las casillas se deshabilitan; con motivo no se puede asignar', () => {
        const { el, $, q } = montar('panel-examenes-paso', modeloExamenes({ accion: 'orden' }), EVENTOS_EXAMENES);
        assert.equal($('asignar').textContent, 'Asignando…');
        assert.ok(casillas(q).every(c => c.disabled));
        assert.equal($('formulario').getAttribute('aria-busy'), 'true');
        el.modelo = Object.freeze(modeloExamenes({ motivo: MENSAJES.sinRed }));
        assert.equal($('asignar').disabled, true);
        assert.equal($('motivo-orden').textContent, MENSAJES.sinRed);
    });

    test('el resultado por examen va en una región role="status" siempre presente, con texto y no solo color', () => {
        const { el, $, q } = montar('panel-examenes-paso', modeloExamenes(), EVENTOS_EXAMENES);
        assert.equal($('resultado').getAttribute('role'), 'status');
        assert.equal($('resultado').hidden, false);
        assert.equal($('resultado-contenido').hidden, true);
        el.modelo = Object.freeze(modeloExamenes({ resultado: [
            { idExamen: UUID(301), nombre: 'Examen <b>1</b>', ok: true, mensaje: 'Orden emitida.' },
            { idExamen: UUID(302), nombre: 'Examen 2', ok: false, mensaje: 'No se envió.' }] }));
        assert.equal($('resultado-contenido').hidden, false);
        const items = q('#lista-resultado li');
        assert.deepEqual(items.map(li => li.className), ['resultado-ok', 'resultado-fallo']);
        assert.deepEqual(q('#lista-resultado span.texto-resultado').map(s => s.textContent),
            ['Examen <b>1</b>: Orden emitida.', 'Examen 2: No se envió.']);
        assert.deepEqual(q('#lista-resultado span.estado-resultado').map(s => s.textContent), ['Emitida', 'No emitida']);
        assert.equal(q('b').length, 0);
        el.enfocarResultados();
        assert.equal(el.shadowRoot.activeElement, $('resultado'));
        assert.equal($('resultado').getAttribute('tabindex'), '-1');
    });

    test('un error se anuncia y enfocarError() lo enfoca', () => {
        const { el, $ } = montar('panel-examenes-paso', modeloExamenes({ error: MENSAJES.seleccionVacia }), EVENTOS_EXAMENES);
        assert.equal($('error-orden').hidden, false);
        assert.equal($('error-orden').getAttribute('role'), 'alert');
        assert.equal($('examenes').getAttribute('aria-invalid'), 'true');
        el.enfocarError();
        assert.equal(el.shadowRoot.activeElement, $('error-orden'));
    });

    test('las órdenes muestran el nombre del examen, o "Examen ya no disponible", o "Orden sin examen asociado"', () => {
        const { q } = montar('panel-examenes-paso', modeloExamenes({ ordenes: [
            orden(1, { indicaciones: 'Indicación <b>de prueba</b>' }), orden(2, { idExamen: UUID(399) }), orden(3, { idExamen: null }),
        ] }), EVENTOS_EXAMENES);
        const nombres = q('p.orden-nombre').map(p => p.textContent);
        assert.deepEqual(nombres, ['Examen 1', 'Examen ya no disponible', 'Orden sin examen asociado']);
        assert.equal(q('p.orden-indicaciones')[0].textContent, 'Indicación <b>de prueba</b>');
        assert.equal(q('b').length, 0);
        assert.equal(q('p.no-disponible').length, 2);
    });

    test('sin asignables oculta el formulario; sin órdenes lo dice', () => {
        const { $ } = montar('panel-examenes-paso', modeloExamenes({ asignables: [], visibles: [], categorias: [] }), EVENTOS_EXAMENES);
        assert.equal($('formulario').hidden, true);
        assert.equal($('sin-asignables').hidden, false);
        assert.equal($('sin-ordenes').hidden, false);
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
