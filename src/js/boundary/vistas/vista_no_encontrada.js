/** <vista-no-encontrada>: ruta desconocida dentro de la SPA. */
import { hojaDeEstilos } from "./estilos.js";
import { RUTA_POR_DEFECTO } from "../rutas.js";
import { plantilla } from "../plantilla.js";

const PLANTILLA = plantilla(`
<section class="tarjeta tarjeta-estrecha" aria-labelledby="titulo">
  <h1 id="titulo" tabindex="-1">No encontramos esta página</h1>
  <p class="subtitulo">La dirección <code id="ruta"></code> no existe en ChivoMed.</p>
  <a class="boton boton-principal" href="#${RUTA_POR_DEFECTO}">Ir a la búsqueda de citas</a>
</section>`);

class VistaNoEncontrada extends HTMLElement {
    contexto = null;

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        if (!this.shadowRoot.childElementCount) {
            this.shadowRoot.append(hojaDeEstilos("vistas.css"), PLANTILLA.clonar());
        }
        // textContent: la ruta viene de la URL y nunca se interpreta como HTML.
        this.shadowRoot.getElementById("ruta").textContent = `#${this.contexto?.path ?? ""}`;
    }
}

customElements.define("vista-no-encontrada", VistaNoEncontrada);
export default VistaNoEncontrada;
