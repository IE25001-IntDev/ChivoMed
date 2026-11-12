/**
 * <vista-dashboard>: marcador de la fase 3. Existe para que el service worker pueda precachear
 * todos los módulos de rutas.js; la fase 3 lo reemplaza por la vista completa.
 */
import { hojaDeEstilos } from "./estilos.js";

const PLANTILLA = `
<section class="tarjeta" aria-labelledby="titulo">
  <h1 id="titulo" tabindex="-1">Dashboard</h1>
  <p class="subtitulo">Aquí verás las consultas que debes atender hoy. Esta vista se completa en la fase 3.</p>
</section>`;

class VistaDashboard extends HTMLElement {
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

customElements.define("vista-dashboard", VistaDashboard);
export default VistaDashboard;
