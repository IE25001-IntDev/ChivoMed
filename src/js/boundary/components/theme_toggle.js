/**
 * <theme-toggle>: botón de modo claro u oscuro.
 * El tema vive en <html data-theme> y en la meta theme-color (los pone theme_init.js antes de cargar
 * los estilos). Al pulsarlo se alterna y se recuerda en localStorage. Sin preferencia guardada sigue
 * al sistema (prefers-color-scheme). Los botones de la página y de otras pestañas se mantienen
 * sincronizados con el evento EVENTO_CAMBIO_TEMA y con el evento storage.
 * La clave de localStorage y los colores son los mismos que usa theme_init.js.
 */
import { Plantilla } from "../plantilla.js";
import { ComponenteChivoMed } from "./componente_chivomed.js";

const CLAVE_TEMA = "chivomed-theme";
const EVENTO_CAMBIO_TEMA = "chivomed-theme-change";
const COLOR_BARRA = Object.freeze({ dark: "#101f25", light: "#edf5f2" });

const PLANTILLA = new Plantilla(`<button class="theme-button" type="button" aria-label="Modo oscuro" aria-pressed="false">
    <svg class="moon-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z"/></svg>
    <svg class="sun-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4 19 5"/></svg>
    <span class="theme-label"></span>
</button>`);

class SelectorTema extends ComponenteChivoMed {
    #sistema = window.matchMedia("(prefers-color-scheme: dark)");
    #alPulsar = () => this.#fijarTema(document.documentElement.dataset.theme === "dark" ? "light" : "dark", true);
    #alCambiarTema = () => this.#pintarBoton();
    #alCambiarSistema = () => {
        let guardado;
        try { guardado = localStorage.getItem(CLAVE_TEMA); } catch { /* El almacenamiento es opcional. */ }
        if (guardado !== "dark" && guardado !== "light") this.#fijarTema(this.#sistema.matches ? "dark" : "light");
    };
    #alCambiarAlmacenamiento = evento => {
        if (evento.key === CLAVE_TEMA || evento.key === null) {
            this.#fijarTema(evento.newValue === "dark" || evento.newValue === "light"
                ? evento.newValue : this.#sistema.matches ? "dark" : "light");
        }
    };

    connectedCallback() {
        this.montar(PLANTILLA, "components.css");
        this.escuchar(this.#boton(), "click", this.#alPulsar);
        this.escuchar(this.#sistema, "change", this.#alCambiarSistema);
        this.escuchar(window, "storage", this.#alCambiarAlmacenamiento);
        this.escuchar(window, EVENTO_CAMBIO_TEMA, this.#alCambiarTema);
        this.#pintarBoton();
    }

    disconnectedCallback() {
        this.dejarDeEscuchar();
    }

    #boton() {
        return this.shadowRoot.querySelector("button");
    }

    /** Aplica el tema al documento y a la barra del navegador; con `recordar`, lo guarda. */
    #fijarTema(tema, recordar = false) {
        document.documentElement.dataset.theme = tema;
        document.querySelector('meta[name="theme-color"]').content = COLOR_BARRA[tema];
        if (recordar) {
            try { localStorage.setItem(CLAVE_TEMA, tema); } catch { /* Se conserva el tema de esta sesión. */ }
        }
        window.dispatchEvent(new Event(EVENTO_CAMBIO_TEMA));
    }

    #pintarBoton() {
        const oscuro = document.documentElement.dataset.theme === "dark";
        const boton = this.#boton();
        boton.setAttribute("aria-pressed", String(oscuro));
        boton.title = oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
        this.shadowRoot.querySelector(".theme-label").textContent = oscuro ? "Modo claro" : "Modo oscuro";
    }
}

customElements.define("theme-toggle", SelectorTema);
export default SelectorTema;
