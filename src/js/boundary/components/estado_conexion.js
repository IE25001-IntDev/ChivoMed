/**
 * <estado-conexion>: avisa si la app está en línea o sin conexión.
 * La región aria-live existe siempre para que los lectores de pantalla anuncien cada cambio.
 * Las vistas deshabilitan sus acciones de red suscribiéndose a `conexion` (pwa/conexion.js).
 */
import { conexion } from "../pwa/conexion.js";
import { hojaDeEstilos } from "../vistas/estilos.js";
import { plantilla } from "../plantilla.js";

const PLANTILLA = plantilla(`
<div class="estado-red" id="estado" role="status" aria-live="polite" aria-atomic="true">
  <span class="punto" aria-hidden="true"></span><span id="texto"></span>
</div>`);

const AVISO_RESTABLECIDA_MS = 4000;

class EstadoConexion extends HTMLElement {
    #cancelar = null;
    #temporizador = null;

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        if (!this.shadowRoot.childElementCount) {
            this.shadowRoot.append(hojaDeEstilos("pwa.css"), PLANTILLA.clonar());
        }
        this.#cancelar = conexion.suscribir(enLinea => this.#pintar(enLinea, true));
        this.#pintar(conexion.enLinea, false);
    }

    disconnectedCallback() {
        this.#cancelar?.();
        clearTimeout(this.#temporizador);
    }

    #pintar(enLinea, cambio) {
        const estado = this.shadowRoot.getElementById("estado");
        const texto = this.shadowRoot.getElementById("texto");
        clearTimeout(this.#temporizador);
        estado.dataset.estado = enLinea ? "en-linea" : "sin-red";
        if (!enLinea) {
            estado.hidden = false;
            texto.textContent = "Sin conexión. Puedes seguir navegando; las acciones que necesitan internet están deshabilitadas.";
        } else if (cambio) {
            estado.hidden = false;
            texto.textContent = "Conexión restablecida.";
            this.#temporizador = setTimeout(() => { estado.hidden = true; texto.textContent = ""; }, AVISO_RESTABLECIDA_MS);
        } else {
            estado.hidden = true;
            texto.textContent = "";
        }
    }
}

customElements.define("estado-conexion", EstadoConexion);
export default EstadoConexion;
