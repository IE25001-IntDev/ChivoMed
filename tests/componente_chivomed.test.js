import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, conectar, desconectar } from './dobles/dom_minimo.js';

let ComponenteChivoMed;
let Plantilla;
let Prueba;
let ConVacio;

before(async () => {
    instalarDom();
    ({ ComponenteChivoMed } = await import('../src/js/boundary/components/componente_chivomed.js'));
    ({ Plantilla } = await import('../src/js/boundary/plantilla.js'));
    const PLANTILLA = new Plantilla('<p id="texto"></p>');
    Prueba = class extends ComponenteChivoMed {
        pintados = 0;
        connectedCallback() { this.montado = this.montar(PLANTILLA, 'vistas.css'); this.pintar(); }
        pintar() { this.pintados++; this.$('texto').textContent = this.modelo?.texto ?? ''; }
    };
    ConVacio = class extends ComponenteChivoMed {
        constructor() { super(Object.freeze({ abierto: false })); }
    };
    customElements.define('prueba-componente', Prueba);
    customElements.define('prueba-con-vacio', ConVacio);
});

describe('ComponenteChivoMed', () => {
    test('abre el Shadow DOM y monta la plantilla con sus hojas una sola vez', () => {
        const el = new Prueba();
        assert.ok(el.shadowRoot);
        conectar(el);
        assert.equal(el.montado, true);
        assert.equal(el.shadowRoot.childElementCount, 2, 'la hoja y el <p>');
        assert.ok(el.shadowRoot.querySelector('link'), 'la hoja de estilos');
        desconectar(el);
        conectar(el);
        assert.equal(el.montado, false, 'al reconectarse no vuelve a montar');
        assert.equal(el.shadowRoot.childElementCount, 2);
    });

    test('$(id) busca dentro del Shadow DOM', () => {
        const el = conectar(new Prueba());
        assert.equal(el.$('texto').localName, 'p');
        assert.equal(el.$('no-existe'), null);
    });

    test('modelo repinta solo si está conectado; null vuelve al modelo vacío', () => {
        const el = new Prueba();
        el.modelo = { texto: 'antes' };
        assert.equal(el.pintados, 0, 'sin conectar no pinta');
        conectar(el);
        assert.equal(el.$('texto').textContent, 'antes');
        el.modelo = { texto: 'después' };
        assert.equal(el.$('texto').textContent, 'después');
        el.modelo = null;
        assert.equal(el.modelo, null);
        const otro = new ConVacio();
        assert.deepEqual(otro.modelo, { abierto: false });
        otro.modelo = { abierto: true };
        otro.modelo = undefined;
        assert.deepEqual(otro.modelo, { abierto: false });
    });

    test('emitir burbujea y cruza el Shadow DOM, con detail o null', () => {
        const el = conectar(new Prueba());
        const eventos = [];
        el.addEventListener('algo', e => eventos.push(e));
        el.emitir('algo', { id: 1 });
        el.emitir('algo');
        assert.deepEqual(eventos.map(e => [e.bubbles, e.composed, e.detail]), [[true, true, { id: 1 }], [true, true, null]]);
    });
});
