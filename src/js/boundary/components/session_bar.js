/**
 * <session-bar>: identidad del personal autenticado y cierre de sesión.
 * Recibe la sesión por la propiedad `sesion` (la pone <app-shell>).
 * Emite 'sesion-cerrada' (bubbles, composed) al cerrar sesión o si el servidor ya la había cerrado.
 */
import { cerrarSesion, ROLES } from "../../control/auth_service.js";
import { hojaDeEstilos } from "../vistas/estilos.js";

const PLANTILLA = `
<nav class="barra-sesion" aria-label="Tu sesión">
  <p class="identidad"><span id="nombre"></span> <span class="separador" aria-hidden="true">·</span>
    <span id="rol"></span> <span class="separador" aria-hidden="true">·</span> <span id="clinica"></span></p>
  <button class="boton boton-secundario" id="salir" type="button">Cerrar sesión</button>
  <p class="error-campo" id="error" role="alert" hidden></p>
</nav>`;

class SessionBar extends HTMLElement {
    #sesion = null;
    #alSalir = () => this.#salir();

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
    }

    set sesion(valor) {
        this.#sesion = valor ?? null;
        if (this.isConnected) this.#pintar();
    }

    get sesion() { return this.#sesion; }

    connectedCallback() {
        if (!this.shadowRoot.childElementCount) {
            const plantilla = document.createElement("template");
            plantilla.innerHTML = PLANTILLA;
            this.shadowRoot.append(hojaDeEstilos("app_shell.css"), plantilla.content.cloneNode(true));
        }
        this.shadowRoot.getElementById("salir").addEventListener("click", this.#alSalir);
        this.#pintar();
    }

    disconnectedCallback() {
        this.shadowRoot.getElementById("salir").removeEventListener("click", this.#alSalir);
    }

    #pintar() {
        const raiz = this.shadowRoot;
        const { usuario, rolActivo } = this.#sesion ?? {};
        raiz.getElementById("nombre").textContent = usuario ? `${usuario.nombres} ${usuario.apellidos}`.trim() : "";
        raiz.getElementById("rol").textContent = rolActivo ? ROLES[rolActivo.codigo] ?? "" : "";
        raiz.getElementById("clinica").textContent = rolActivo?.nombreClinica ?? "";
        raiz.getElementById("error").hidden = true;
        raiz.getElementById("salir").disabled = !this.#sesion;
    }

    async #salir() {
        const boton = this.shadowRoot.getElementById("salir");
        const error = this.shadowRoot.getElementById("error");
        boton.disabled = true;
        boton.textContent = "Cerrando sesión…";
        try {
            await cerrarSesion(this.#sesion?.csrfToken);
            this.#avisarCierre();
        } catch (falla) {
            if (falla.status === 401) { this.#avisarCierre(); return; }
            error.textContent = falla.message;
            error.hidden = false;
            boton.disabled = false;
        } finally {
            boton.textContent = "Cerrar sesión";
        }
    }

    #avisarCierre() {
        this.dispatchEvent(new CustomEvent("sesion-cerrada", { bubbles: true, composed: true }));
    }
}

customElements.define("session-bar", SessionBar);
export default SessionBar;
