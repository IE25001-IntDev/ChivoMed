/**
 * <vista-citas> (HU1): búsqueda pública de citas. Versión mínima de la fase 2;
 * el asistente de búsqueda se implementa en la fase 3.
 */
import { hojaDeEstilos } from "./estilos.js";

const PLANTILLA = `
<section class="tarjeta" aria-labelledby="titulo">
  <h1 id="titulo" tabindex="-1">Búsqueda de citas</h1>
  <p class="subtitulo">Muy pronto podrás buscar tus citas con tu documento, la clínica y un rango de fechas.</p>
  <p class="pie-tarjeta">¿Trabajas en una clínica? <a href="#/login">Acceso del personal</a></p>
</section>`;

class VistaCitas extends HTMLElement {
    contexto = null;

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        if (this.shadowRoot.childElementCount) return;
        const plantilla = document.createElement("template");
        plantilla.innerHTML = PLANTILLA;
        this.shadowRoot.append(hojaDeEstilos("vistas.css"), plantilla.content.cloneNode(true));
    }
}

customElements.define("vista-citas", VistaCitas);
export default VistaCitas;
