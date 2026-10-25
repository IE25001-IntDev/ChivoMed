import './simple_card.js';
import { fecha, estadoConsulta } from '../patient_format.js';

class TarjetaConsulta extends HTMLElement {
    constructor() { super(); this.root = this.attachShadow({mode: 'open'}); }
    set consulta(value) { this._consulta = value; this.render(); }
    get consulta() { return this._consulta; }
    connectedCallback() { this.render(); }
    render() {
        if (!this._consulta) { this.root.replaceChildren(); return; }
        const c = this._consulta;
        const card = document.createElement('tarjeta-simple');
        const titulo = document.createElement('div'); titulo.slot = 'titulo';
        titulo.textContent = `Consulta · ${estadoConsulta(c)}`;
        const contenido = document.createElement('div'); contenido.slot = 'contenido';
        for (const text of [`Inicio: ${fecha(c.fechaInicio)}`,
            ...(c.fechaFin ? [`Finalización: ${fecha(c.fechaFin)}`] : []),
            c.observaciones || 'Sin observaciones registradas.']) {
            const p = document.createElement('p'); p.textContent = text; contenido.append(p);
        }
        const pie = document.createElement('div'); pie.slot = 'pie';
        pie.textContent = c.referenciaExterna ? `Referencia: ${c.referenciaExterna}` : estadoConsulta(c);
        card.append(titulo, contenido, pie);
        this.root.replaceChildren(card);
    }
}
customElements.define('tarjeta-consulta', TarjetaConsulta);
export default TarjetaConsulta;
