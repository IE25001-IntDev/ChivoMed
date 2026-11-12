/**
 * <install-prompt>: botón para instalar la PWA.
 * Visible solo cuando el navegador ofrece la instalación (beforeinstallprompt); se oculta si la app
 * ya está instalada o cuando se instala (appinstalled). La lógica vive en ControladorInstalacion.
 */
import { ControladorInstalacion, MODOS } from "../pwa/controlador_instalacion.js";
import { hojaDeEstilos } from "../vistas/estilos.js";

const PLANTILLA = `
<button class="instalar" id="instalar" type="button" hidden>
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14"/></svg>
  <span>Instalar app</span>
</button>
<p class="solo-lectores" id="estado" role="status" aria-live="polite"></p>`;

class InstallPrompt extends HTMLElement {
    #controlador = null;
    #alPulsar = () => this.#controlador.instalar();

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        if (!this.shadowRoot.childElementCount) {
            const plantilla = document.createElement("template");
            plantilla.innerHTML = PLANTILLA;
            this.shadowRoot.append(hojaDeEstilos("pwa.css"), plantilla.content.cloneNode(true));
        }
        this.#controlador = new ControladorInstalacion({ ventana: window, alCambiar: estado => this.#pintar(estado) });
        this.shadowRoot.getElementById("instalar").addEventListener("click", this.#alPulsar);
        this.#controlador.iniciar();
        this.#pintar(this.#controlador.estado);
    }

    disconnectedCallback() {
        this.shadowRoot.getElementById("instalar").removeEventListener("click", this.#alPulsar);
        this.#controlador?.detener();
    }

    #pintar(estado) {
        const boton = this.shadowRoot.getElementById("instalar");
        boton.hidden = estado.modo !== MODOS.DISPONIBLE && estado.modo !== MODOS.INSTALANDO;
        boton.disabled = estado.modo === MODOS.INSTALANDO;
        this.shadowRoot.getElementById("estado").textContent = estado.mensaje ?? "";
    }
}

customElements.define("install-prompt", InstallPrompt);
export default InstallPrompt;
