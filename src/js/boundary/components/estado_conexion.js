/**
 * <estado-conexion>: avisa si la app está en línea, sin red o sin conexión con el servidor
 * (el backend no responde: ver control/controlador_conexion.js).
 * La región aria-live (role="status") está siempre en el árbol de accesibilidad: nunca lleva `hidden`
 * ni display:none, porque muchos lectores no anuncian una región que aparece a la vez que su texto.
 * Solo cambia el texto; sin aviso, la franja se oculta a la vista (data-aviso="oculto", recortada como
 * .solo-lectores en pwa.css) y queda vacía.
 * Las vistas deshabilitan sus acciones de red suscribiéndose a `conexion` (control/conexion.js).
 */
import { conexion } from "../../control/conexion.js";
import { hojaDeEstilos } from "../estilos.js";
import { plantilla } from "../plantilla.js";

const PLANTILLA = plantilla(`
<div class="estado-red" id="estado" role="status" aria-live="polite" aria-atomic="true" data-aviso="oculto">
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
        clearTimeout(this.#temporizador);
        const sinServidor = !enLinea && conexion.motivo === "servidor";
        estado.dataset.estado = enLinea ? "en-linea" : sinServidor ? "sin-servidor" : "sin-red";
        if (sinServidor) {
            this.#avisar("Sin conexión con el servidor. Puedes ver lo guardado; las acciones que lo necesitan están deshabilitadas.");
        } else if (!enLinea) {
            this.#avisar("Sin red. Puedes seguir navegando; las acciones que necesitan internet están deshabilitadas.");
        } else if (cambio) {
            this.#avisar("Conexión restablecida.");
            this.#temporizador = setTimeout(() => this.#avisar(""), AVISO_RESTABLECIDA_MS);
        } else {
            this.#avisar("");
        }
    }

    /** Cambia solo el texto de la región; vacía, se oculta a la vista pero sigue en el árbol de accesibilidad. */
    #avisar(mensaje) {
        this.shadowRoot.getElementById("texto").textContent = mensaje;
        this.shadowRoot.getElementById("estado").dataset.aviso = mensaje ? "visible" : "oculto";
    }
}

customElements.define("estado-conexion", EstadoConexion);
export default EstadoConexion;
