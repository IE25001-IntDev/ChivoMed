/**
 * <vista-sin-conexion>: se monta en una ruta de empleado cuando no hay red para verificar la
 * sesión y no hay una sesión guardada en memoria. Reemplaza al login, que tampoco funcionaría sin red.
 * Emite 'navegar' { ruta } (bubbles, composed) para volver a intentar la ruta pedida. El botón no se
 * deshabilita sin red: navigator.onLine puede equivocarse, y reintentar sin red solo vuelve a esta vista.
 */
import { hojaDeEstilos } from "./estilos.js";

const PLANTILLA = `
<section class="tarjeta tarjeta-estrecha" aria-labelledby="titulo">
  <h1 id="titulo" tabindex="-1">Sin conexión</h1>
  <p class="subtitulo">Inicia sesión cuando vuelva la red. Al reconectarte, esta página se actualiza sola.</p>
  <button class="boton boton-principal" id="reintentar" type="button">Volver a intentar</button>
</section>`;

class VistaSinConexion extends HTMLElement {
    #alReintentar = () => this.#reintentar();
    /** Contexto del router: { path, query, rutaPedida, ... }. */
    contexto = null;

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        const raiz = this.shadowRoot;
        if (!raiz.childElementCount) {
            const plantilla = document.createElement("template");
            plantilla.innerHTML = PLANTILLA;
            raiz.append(hojaDeEstilos("vistas.css"), plantilla.content.cloneNode(true));
        }
        raiz.getElementById("reintentar").addEventListener("click", this.#alReintentar);
    }

    disconnectedCallback() {
        this.shadowRoot.getElementById("reintentar").removeEventListener("click", this.#alReintentar);
    }

    #reintentar() {
        const { path = "/", query } = this.contexto ?? {};
        const ruta = query?.size ? `${path}?${query}` : path;
        this.dispatchEvent(new CustomEvent("navegar", { bubbles: true, composed: true, detail: { ruta } }));
    }
}

customElements.define("vista-sin-conexion", VistaSinConexion);
export default VistaSinConexion;
