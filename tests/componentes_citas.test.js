import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, conectar, desconectar } from './dobles/dom_minimo.js';
import { PASOS } from '../src/js/boundary/vistas/controlador_citas.js';
import { formatearFechaHora } from '../src/js/boundary/fechas_sv.js';

// Datos inventados; nunca datos reales de pacientes.
const CITA = Object.freeze({ idConsulta: '50000000-0000-4000-8000-000000000001', fechaInicio: '2026-11-12T08:00:00-06:00',
    nombreClinica: 'Clínica Prueba <b>Norte</b>', procedimientos: Object.freeze(['Consulta general', 'Control']) });

before(async () => {
    instalarDom();
    await import('../src/js/boundary/components/citas/indicador_pasos.js');
    await import('../src/js/boundary/components/citas/tarjeta_cita.js');
});

function indicador(modelo) {
    const el = new (customElements.get('indicador-pasos'))();
    el.modelo = modelo;
    conectar(el);
    const eventos = [];
    el.addEventListener('ir-a-paso', e => eventos.push(e));
    return { el, eventos, items: () => el.shadowRoot.querySelectorAll('li') };
}

describe('<indicador-pasos>', () => {
    test('nav con nombre accesible y un <li> por paso', () => {
        const { el, items } = indicador({ pasos: PASOS, actual: 1, alcanzado: 1 });
        assert.equal(el.shadowRoot.querySelector('nav').getAttribute('aria-label'), 'Pasos de la búsqueda');
        assert.equal(items().length, 5);
    });

    test('aria-current="step" solo en el actual; botones solo en los alcanzados', () => {
        const { items } = indicador({ pasos: PASOS, actual: 2, alcanzado: 3 });
        const li = items();
        assert.deepEqual(li.map(l => l.getAttribute('aria-current')), [null, 'step', null, null, null]);
        assert.deepEqual(li.map(l => Boolean(l.querySelector('button'))), [true, true, true, false, false]);
        assert.equal(li[0].querySelector('button').getAttribute('aria-label'), 'Paso 1 de 5: Tipo de documento, completado');
        assert.equal(li[1].querySelector('button').getAttribute('aria-label'), 'Paso 2 de 5: Número de documento, paso actual');
        assert.equal(li[2].querySelector('button').getAttribute('aria-label'), 'Paso 3 de 5: Clínica, disponible');
        assert.equal(li[3].getAttribute('aria-disabled'), 'true');
        assert.match(li[3].textContent, /Fechas/);
    });

    test('pulsar un paso alcanzado emite ir-a-paso con el número (bubbles, composed)', () => {
        const { items, eventos } = indicador({ pasos: PASOS, actual: 3, alcanzado: 3 });
        items()[0].querySelector('button').dispatchEvent(new Event('click'));
        assert.equal(eventos.length, 1);
        assert.equal(eventos[0].detail.paso, 1);
        assert.equal(eventos[0].bubbles, true);
        assert.equal(eventos[0].composed, true);
    });

    test('pulsar el paso actual no emite nada', () => {
        const { items, eventos } = indicador({ pasos: PASOS, actual: 2, alcanzado: 2 });
        items()[1].querySelector('button').dispatchEvent(new Event('click'));
        assert.equal(eventos.length, 0);
    });

    test('asignar un modelo nuevo repinta', () => {
        const { el, items } = indicador({ pasos: PASOS, actual: 1, alcanzado: 1 });
        el.modelo = { pasos: PASOS, actual: 4, alcanzado: 4 };
        assert.equal(items()[3].getAttribute('aria-current'), 'step');
        assert.equal(items().filter(l => l.querySelector('button')).length, 4);
    });
});

function tarjeta(modelo) {
    const el = new (customElements.get('tarjeta-cita'))();
    el.modelo = modelo;
    conectar(el);
    const eventos = [];
    el.addEventListener('descargar-ticket', e => eventos.push(e));
    return { el, eventos, $: id => el.shadowRoot.getElementById(id) };
}

describe('<tarjeta-cita>', () => {
    test('pinta fecha y hora, clínica y procedimientos con textContent', () => {
        const { el, $ } = tarjeta({ cita: CITA, ticket: null, motivoTicket: null });
        assert.equal($('fecha').textContent, formatearFechaHora(CITA.fechaInicio));
        assert.equal($('clinica').textContent, 'Clínica Prueba <b>Norte</b>', 'el HTML del servidor queda como texto');
        assert.deepEqual(el.shadowRoot.querySelectorAll('li').map(li => li.textContent), ['Consulta general', 'Control']);
        assert.equal($('sin-procedimientos').hidden, true);
    });

    test('sin procedimientos muestra el aviso', () => {
        const { $ } = tarjeta({ cita: { ...CITA, procedimientos: [] }, ticket: null, motivoTicket: null });
        assert.equal($('sin-procedimientos').hidden, false);
        assert.equal($('procedimientos').hidden, true);
    });

    test('el botón tiene un nombre accesible propio y emite descargar-ticket', () => {
        const { $, eventos } = tarjeta({ cita: CITA, ticket: null, motivoTicket: null });
        assert.match($('descargar').getAttribute('aria-label'), /^Descargar ticket de la cita del /);
        $('descargar').dispatchEvent(new Event('click'));
        assert.equal(eventos.length, 1);
        assert.equal(eventos[0].detail.idConsulta, CITA.idConsulta);
        assert.equal(eventos[0].composed, true);
    });

    test('estados del ticket: descargando, listo, error y motivo', () => {
        const { el, $, eventos } = tarjeta({ cita: CITA, ticket: { estado: 'descargando' }, motivoTicket: null });
        assert.equal($('descargar').disabled, true);
        assert.equal($('descargar').textContent, 'Descargando…');
        $('descargar').dispatchEvent(new Event('click'));
        assert.equal(eventos.length, 0, 'deshabilitado: no emite');

        el.modelo = { cita: CITA, ticket: { estado: 'entregado' }, motivoTicket: null };
        assert.equal($('descargar').disabled, false);
        assert.equal($('estado-ticket').textContent, 'Ticket descargado.');

        el.modelo = { cita: CITA, ticket: { estado: 'error', error: 'No pudimos generar el ticket de esta cita.' }, motivoTicket: null };
        assert.equal($('estado-ticket').textContent, 'No pudimos generar el ticket de esta cita.');
        assert.match($('estado-ticket').className, /error/);

        el.modelo = { cita: CITA, ticket: null, motivoTicket: 'Necesitas conexión para descargar el ticket.' };
        assert.equal($('descargar').disabled, true);
        assert.equal($('estado-ticket').textContent, 'Necesitas conexión para descargar el ticket.');
    });

    test('al desconectarse deja de escuchar el botón', () => {
        const { el, $, eventos } = tarjeta({ cita: CITA, ticket: null, motivoTicket: null });
        desconectar(el);
        $('descargar').dispatchEvent(new Event('click'));
        assert.equal(eventos.length, 0);
    });
});
