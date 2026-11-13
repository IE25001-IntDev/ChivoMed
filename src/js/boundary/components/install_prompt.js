/**
 * <install-prompt>: botón para instalar la PWA.
 * Visible solo cuando el navegador ofrece la instalación (beforeinstallprompt); se oculta si la app
 * ya está instalada o cuando se instala (appinstalled). La lógica vive en ControladorInstalacion.
 * Se suscribe a su estado reactivo al conectarse y cancela al desconectarse.
 * Acepta `controlador` asignado antes de conectarse (pruebas); si no, crea uno por conexión.
 */
import { ControladorInstalacion, MODOS } from "../pwa/controlador_instalacion.js";
import { hojaDeEstilos } from "../vistas/estilos.js";
import { plantilla } from "../plantilla.js";

const PLANTILLA = plantilla(`
<button class="instalar" id="instalar" type="button" hidden>
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14"/></svg>
  <span>Instalar app</span>
</button>
<p class="solo-lectores" id="estado" role="status" aria-live="polite"></p>`);

class InstallPrompt extends HTMLElement {
    #controlador = null;
    #inyectado = null;
    #cancelar = null;
    #alPulsar = () => this.#controlador.instalar();

    /** Controlador inyectado; solo se puede asignar antes de conectar el componente. */
    set controlador(valor) {
        if (this.#cancelar) throw new Error("El controlador se asigna antes de conectar el componente.");
        this.#inyectado = valor;
    }

    get controlador() { return this.#controlador ?? this.#inyectado; }

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        if (!this.shadowRoot.childElementCount) {
            this.shadowRoot.append(hojaDeEstilos("pwa.css"), PLANTILLA.clonar());
        }
        this.#controlador = this.#inyectado ?? new ControladorInstalacion({ ventana: window });
        this.#cancelar = this.#controlador.suscribir((_cambios, estado) => this.#pintar(estado));
        this.shadowRoot.getElementById("instalar").addEventListener("click", this.#alPulsar);
        this.#controlador.iniciar();
        this.#pintar(this.#controlador.estado);
    }

    disconnectedCallback() {
        this.shadowRoot.getElementById("instalar").removeEventListener("click", this.#alPulsar);
        this.#cancelar?.();
        this.#cancelar = null;
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
