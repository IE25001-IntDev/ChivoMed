/**
 * <vista-consulta>: marcador de la fase 3. Existe para que el service worker pueda precachear
 * todos los módulos de rutas.js; la fase 3 lo reemplaza por la vista completa.
 */
import { hojaDeEstilos } from "./estilos.js";
import { plantilla } from "../plantilla.js";

const PLANTILLA = plantilla(`
<section class="tarjeta" aria-labelledby="titulo">
  <h1 id="titulo" tabindex="-1">Consulta</h1>
  <p class="subtitulo">Aquí darás seguimiento a la consulta seleccionada. Esta vista se completa en la fase 3.</p>
</section>`);

class VistaConsulta extends HTMLElement {
    contexto = null;

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        if (this.shadowRoot.childElementCount) return;
        this.shadowRoot.append(hojaDeEstilos("vistas.css"), PLANTILLA.clonar());
    }
}

customElements.define("vista-consulta", VistaConsulta);
export default VistaConsulta;
