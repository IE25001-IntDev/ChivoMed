import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, conectar, desconectar } from './dobles/dom_minimo.js';
import { formatearFechaHora } from '../src/js/control/fechas_sv.js';

// Datos inventados; nunca datos reales de pacientes.
const CITA = Object.freeze({ idConsulta: '50000000-0000-4000-8000-000000000001', fechaInicio: '2026-11-12T08:00:00-06:00',
    nombreClinica: 'Clínica Prueba <b>Norte</b>', nombrePaciente: 'Paciente <i>Prueba</i> Uno',
    procedimientos: Object.freeze(['Consulta general', 'Control']) });

before(async () => {
    instalarDom();
    await import('../src/js/boundary/components/citas/tarjeta_cita.js');
});

function tarjeta(modelo) {
    const el = new (customElements.get('tarjeta-cita'))();
    el.modelo = modelo;
    conectar(el);
    const eventos = [];
    el.addEventListener('ver-ticket', e => eventos.push(e));
    return { el, eventos, $: id => el.shadowRoot.getElementById(id) };
}

describe('<tarjeta-cita>', () => {
    test('pinta fecha y hora, clínica y procedimientos con textContent', () => {
        const { el, $ } = tarjeta({ cita: CITA, motivoTicket: null });
        assert.equal($('fecha').textContent, formatearFechaHora(CITA.fechaInicio));
        assert.equal($('clinica').textContent, 'Clínica Prueba <b>Norte</b>', 'el HTML del servidor queda como texto');
        assert.deepEqual(el.shadowRoot.querySelectorAll('li').map(li => li.textContent), ['Consulta general', 'Control']);
        assert.equal($('sin-procedimientos').hidden, true);
    });

    test('sin procedimientos muestra el aviso', () => {
        const { $ } = tarjeta({ cita: { ...CITA, procedimientos: [] }, motivoTicket: null });
        assert.equal($('sin-procedimientos').hidden, false);
        assert.equal($('procedimientos').hidden, true);
    });

    test('muestra el nombre del paciente junto a "Ver ticket", como texto', () => {
        const { el, $ } = tarjeta({ cita: CITA, motivoTicket: null });
        assert.equal($('paciente').hidden, false);
        assert.equal($('nombre-paciente').textContent, 'Paciente <i>Prueba</i> Uno', 'el HTML del servidor queda como texto');
        assert.equal($('paciente').parentNode, $('ver').parentNode, 'en el pie de la tarjeta, junto al botón');
        assert.equal(el.shadowRoot.querySelectorAll('i').length, 0);
    });

    test('sin nombrePaciente (null o vacío) no muestra la línea "Paciente:"', () => {
        const { el, $ } = tarjeta({ cita: { ...CITA, nombrePaciente: null }, motivoTicket: null });
        assert.equal($('paciente').hidden, true);
        assert.equal($('nombre-paciente').textContent, '');
        el.modelo = { cita: CITA, motivoTicket: null };
        assert.equal($('paciente').hidden, false);
        el.modelo = { cita: { ...CITA, nombrePaciente: '' }, motivoTicket: null };
        assert.equal($('paciente').hidden, true);
    });

    test('el botón dice "Ver ticket", tiene un nombre accesible propio y emite ver-ticket', () => {
        const { $, eventos } = tarjeta({ cita: CITA, motivoTicket: null });
        assert.equal($('ver').textContent, 'Ver ticket');
        assert.match($('ver').getAttribute('aria-label'), /^Ver ticket de la cita del /);
        assert.equal($('ver').getAttribute('aria-haspopup'), 'dialog');
        $('ver').dispatchEvent(new Event('click'));
        assert.equal(eventos.length, 1);
        assert.equal(eventos[0].detail.idConsulta, CITA.idConsulta);
        assert.equal(eventos[0].composed, true);
        assert.equal(eventos[0].bubbles, true);
    });

    test('con un motivo (sin conexión o límite) el botón se deshabilita y lo dice', () => {
        const motivo = 'Sin conexión: necesitas conexión con el servidor para ver el ticket.';
        const { el, $, eventos } = tarjeta({ cita: CITA, motivoTicket: motivo });
        assert.equal($('ver').disabled, true);
        assert.equal($('estado-ticket').textContent, motivo);
        assert.match($('estado-ticket').className, /error/);
        $('ver').dispatchEvent(new Event('click'));
        assert.equal(eventos.length, 0, 'deshabilitado: no emite');
        el.modelo = { cita: CITA, motivoTicket: null };
        assert.equal($('ver').disabled, false);
        assert.equal($('estado-ticket').textContent, '');
    });

    test('enfocarTicket() devuelve el foco al botón "Ver ticket"', () => {
        const { el, $ } = tarjeta({ cita: CITA, motivoTicket: null });
        el.enfocarTicket();
        assert.equal(el.shadowRoot.activeElement, $('ver'));
    });

    test('al desconectarse deja de escuchar el botón', () => {
        const { el, $, eventos } = tarjeta({ cita: CITA, motivoTicket: null });
        desconectar(el);
        $('ver').dispatchEvent(new Event('click'));
        assert.equal(eventos.length, 0);
    });
});
