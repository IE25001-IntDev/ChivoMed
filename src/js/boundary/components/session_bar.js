/**
 * <session-bar>: identidad del personal autenticado y cierre de sesión.
 * Recibe la sesión por la propiedad `sesion` (la pone <app-shell>).
 * Emite 'sesion-cerrada' (bubbles, composed) al cerrar sesión o si el servidor ya la había cerrado.
 */
import { AuthService, auth } from "../../control/auth_service.js";
import { conexion } from "../../control/conexion.js";
import { MENSAJE_SIN_RED } from "../../control/controlador_conexion.js";
import { Plantilla } from "../plantilla.js";
import { ComponenteChivoMed } from "./componente_chivomed.js";

const PLANTILLA = new Plantilla(`
<nav class="barra-sesion" aria-label="Tu sesión">
  <p class="identidad"><span id="nombre"></span> <span class="separador" aria-hidden="true">·</span>
    <span id="rol"></span> <span class="separador" aria-hidden="true">·</span> <span id="clinica"></span></p>
  <button class="boton boton-secundario" id="salir" type="button" aria-describedby="sin-red">Cerrar sesión</button>
  <p class="aviso-red" id="sin-red" hidden></p>
  <p class="error-campo" id="error" role="alert" hidden></p>
</nav>`);

class SessionBar extends ComponenteChivoMed {
    #sesion = null;
    #alSalir = () => this.#salir();
    #cancelarConexion = null;
    #saliendo = false;

    set sesion(valor) {
        this.#sesion = valor ?? null;
        if (this.isConnected) this.#pintar();
    }

    get sesion() { return this.#sesion; }

    connectedCallback() {
        this.montar(PLANTILLA, "app_shell.css");
        this.escuchar(this.$("salir"), "click", this.#alSalir);
        this.#cancelarConexion = conexion.suscribir(() => this.#pintarRed());
        this.#pintar();
    }

    disconnectedCallback() {
        this.dejarDeEscuchar();
        this.#cancelarConexion?.();
    }

    #pintar() {
        const { usuario, rolActivo } = this.#sesion ?? {};
        this.$("nombre").textContent = usuario ? `${usuario.nombres} ${usuario.apellidos}`.trim() : "";
        this.$("rol").textContent = rolActivo ? AuthService.nombreDeRol(rolActivo) : "";
        this.$("clinica").textContent = rolActivo?.nombreClinica ?? "";
        this.$("error").hidden = true;
        this.#pintarRed();
    }

    /** Cerrar sesión requiere red: sin conexión se deshabilita y se explica por qué. */
    #pintarRed() {
        const sinRed = !conexion.enLinea;
        this.$("sin-red").hidden = !sinRed;
        this.$("sin-red").textContent = sinRed ? MENSAJE_SIN_RED : "";
        this.$("salir").disabled = !this.#sesion || sinRed || this.#saliendo;
    }

    #salir() {
        return new Promise(resolve => {
            const boton = this.$("salir");
            const error = this.$("error");
            this.#saliendo = true;
            boton.disabled = true;
            boton.textContent = "Cerrando sesión…";
            resolve(new Promise(cerrar => cerrar(auth.cerrarSesion(this.#sesion?.csrfToken)))
                .then(() => this.#avisarCierre())
                .catch(falla => {
                    if (falla.status === 401) { this.#avisarCierre(); return; }
                    error.textContent = falla.message;
                    error.hidden = false;
                })
                .finally(() => {
                    this.#saliendo = false;
                    boton.textContent = "Cerrar sesión";
                    this.#pintarRed();
                }));
        });
    }

    #avisarCierre() {
        this.emitir("sesion-cerrada");
    }
}

customElements.define("session-bar", SessionBar);
export default SessionBar;
