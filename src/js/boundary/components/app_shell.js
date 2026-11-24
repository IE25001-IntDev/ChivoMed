/**
 * <app-shell>: componente raíz de la SPA. Crea el router por hash y monta una vista por ruta.
 * Escucha:
 *  - 'navegar' { ruta } desde las vistas → navegación con historial.
 *  - 'sesion-cerrada' desde <session-bar> → vuelve al login.
 *  - 'sesion-expirada' en document (lo emite auth_service ante un 401) → login, solo en rutas protegidas.
 *  - 'sesion-actualizada' { sesion } desde una vista (cambio de rol) → actualiza la sesión de la
 *    vista (la que compara verificarSesionActual antes de escribir) y la barra de sesión.
 * Sin red, el router monta las rutas de empleado en solo lectura con la última sesión verificada
 * (memoria_vistas) o, si no hay, el aviso de sin conexión (<vista-aviso>); al volver la red se vuelve a verificar.
 * Un error al abrir una ruta se muestra también en un <vista-aviso> (con role="alert"); su evento
 * 'reintentar' vuelve a procesar la ruta.
 * Antes de la primera ruta espera a que memoria_vistas cargue su copia en IndexedDB, para que
 * una recarga sin red siga mostrando el último dashboard y la consulta abierta. Un 401 al verificar
 * la sesión también borra esa copia.
 * Además registra el service worker y, al cerrar o perder la sesión, borra los cachés con datos
 * y la memoria de las vistas.
 */
import { Router } from "../router.js";
import { RUTAS, RUTA_NO_ENCONTRADA, RUTA_SIN_CONEXION, RUTA_POR_DEFECTO, RUTA_LOGIN, TablaRutas } from "../rutas.js";
import { AuthService, auth, CODIGO_SIN_RED } from "../../control/auth_service.js";
import { RegistroServiceWorker } from "../pwa/registro_sw.js";
import { CachesCliente } from "../../control/caches_cliente.js";
import { memoria } from "../../control/memoria_vistas.js";
import { conexion } from "../../control/conexion.js";
import "./session_bar.js";
import "./theme_toggle.js";
import "./install_prompt.js";
import "./estado_conexion.js";
import "../vistas/vista_aviso.js";
import { Plantilla } from "../plantilla.js";
import { ComponenteChivoMed } from "./componente_chivomed.js";

const PLANTILLA = new Plantilla(`
<a class="saltar" href="#contenido">Saltar al contenido</a>
<header class="cabecera">
  <a class="marca" href="#${RUTA_POR_DEFECTO}" aria-label="ChivoMed, búsqueda de citas">
    <span class="marca-icono" aria-hidden="true">+</span><span>Chivo<span class="marca-acento">Med</span></span>
  </a>
  <div class="acciones-cabecera">
    <install-prompt></install-prompt>
    <theme-toggle></theme-toggle>
  </div>
</header>
<estado-conexion></estado-conexion>
<session-bar hidden></session-bar>
<main id="contenido" tabindex="-1"></main>
<p class="solo-lectores" id="anuncio" aria-live="polite"></p>
<footer class="pie"><p>ChivoMed · GalenoSV</p></footer>`);

class AppShell extends ComponenteChivoMed {
    #router = null;
    #rutaActual = null;
    #primerMontaje = true;
    #montadaSinRed = false;
    #cancelarConexion = null;
    #alCambiarRed = enLinea => { if (enLinea && this.#montadaSinRed) this.#router.pendiente = this.#router.procesar(); };
    #alNavegar = event => { event.stopPropagation(); this.#router.navegar(event.detail.ruta); };
    #alCerrarSesion = () => this.#irAlLogin(false);
    #alActualizarSesion = event => {
        event.stopPropagation();
        const { sesion } = event.detail ?? {};
        if (!sesion || !this.#rutaActual?.empleado) return;
        auth.fijarSesionVista(sesion);
        memoria.recordarSesion(sesion);
        this.shadowRoot.querySelector("session-bar").sesion = sesion;
    };
    // Se difiere: si el 401 vino de la verificación del propio router, este ya redirigió al login.
    #alExpirar = () => setTimeout(() => {
        if (!this.#rutaActual?.empleado) return;
        if (Router.normalizarHash(location.hash).ruta !== RUTA_LOGIN) this.#irAlLogin(true);
        else CachesCliente.limpiarCachesDeDatos();
    }, 0);

    connectedCallback() {
        if (this.montar(PLANTILLA, "app_shell.css")) {
            // El enlace de salto no debe cambiar el hash: el router lo interpretaría como ruta.
            this.shadowRoot.querySelector(".saltar").addEventListener("click", event => {
                event.preventDefault();
                this.$("contenido").focus();
            });
        }
        this.#router = new Router({
            rutas: RUTAS,
            noEncontrada: RUTA_NO_ENCONTRADA,
            porDefecto: RUTA_POR_DEFECTO,
            login: RUTA_LOGIN,
            inicioPorRol: sesion => TablaRutas.inicioPorRol(sesion),
            esEmpleado: sesion => AuthService.esEmpleado(sesion),
            ventana: window,
            autenticar: () => auth.obtenerSesion().catch(error => {
                // Sin sesión en el servidor, la copia de otra sesión no sirve de respaldo.
                if (error?.status === 401) memoria.limpiar();
                throw error;
            }),
            montar: (tag, contexto) => this.#montar(tag, contexto),
            mostrarError: (error, contexto) => this.#mostrarError(error, contexto),
            esErrorDeRed: error => error?.code === CODIGO_SIN_RED,
            sesionSinRed: () => memoria.sesion,
            sinConexion: RUTA_SIN_CONEXION,
        });
        this.addEventListener("navegar", this.#alNavegar);
        this.addEventListener("sesion-cerrada", this.#alCerrarSesion);
        this.addEventListener("sesion-actualizada", this.#alActualizarSesion);
        document.addEventListener("sesion-expirada", this.#alExpirar);
        this.#cancelarConexion = conexion.suscribir(this.#alCambiarRed);
        const hidratando = memoria.hidratar();
        if (hidratando) hidratando.finally(() => { if (this.isConnected) this.#router.iniciar(); });
        else this.#router.iniciar();
        RegistroServiceWorker.registrar();
    }

    disconnectedCallback() {
        this.#router?.detener();
        this.removeEventListener("navegar", this.#alNavegar);
        this.removeEventListener("sesion-cerrada", this.#alCerrarSesion);
        this.removeEventListener("sesion-actualizada", this.#alActualizarSesion);
        document.removeEventListener("sesion-expirada", this.#alExpirar);
        this.#cancelarConexion?.();
    }

    #irAlLogin(expirada) {
        this.#rutaActual = null;
        auth.fijarSesionVista(null);
        memoria.limpiar();
        CachesCliente.limpiarCachesDeDatos();
        this.#router.navegar(expirada ? `${RUTA_LOGIN}?sesion=finalizada` : RUTA_LOGIN);
    }

    #montar(tag, contexto) {
        const vista = document.createElement(tag);
        vista.contexto = contexto;
        this.#rutaActual = contexto.ruta;
        this.#montadaSinRed = Boolean(contexto.soloLectura || contexto.ruta === RUTA_SIN_CONEXION);
        // Solo una sesión verificada con el servidor sirve de respaldo para entrar sin red.
        if (contexto.ruta.empleado && contexto.sesion && !contexto.soloLectura) memoria.recordarSesion(contexto.sesion);

        this.#mostrarSesion(contexto);
        this.$("contenido").replaceChildren(vista);
        this.#anunciar(contexto.ruta.titulo, vista);
    }

    /** La barra de sesión solo se muestra en rutas de empleado con sesión verificada. */
    #mostrarSesion(contexto) {
        const protegida = Boolean(contexto.ruta.empleado && contexto.sesion);
        auth.fijarSesionVista(protegida ? contexto.sesion : null);
        const barra = this.shadowRoot.querySelector("session-bar");
        barra.sesion = protegida ? contexto.sesion : null;
        barra.hidden = !protegida;
    }

    #mostrarError(error, contexto) {
        this.#rutaActual = contexto.ruta;
        this.#montadaSinRed = false;
        this.#mostrarSesion(contexto);
        const aviso = document.createElement("vista-aviso");
        aviso.aviso = Object.freeze({
            titulo: "No pudimos abrir esta página",
            // Solo los errores del servicio (con status HTTP) traen un mensaje pensado para el usuario;
            // los demás (p. ej. un módulo que no carga) pueden incluir URLs internas.
            texto: typeof error?.status === "number" && error.message
                ? error.message
                : "No pudimos cargar esta sección. Revisa tu conexión e inténtalo de nuevo.",
            accion: "reintentar",
            alerta: true,
        });
        aviso.addEventListener("reintentar", event => {
            event.stopPropagation();
            this.#router.pendiente = this.#router.procesar();
        });
        this.$("contenido").replaceChildren(aviso);
        this.#anunciar("Error", aviso);
    }

    #anunciar(titulo, contenedor) {
        document.title = `${titulo} | ChivoMed`;
        this.$("anuncio").textContent = titulo;
        // En la primera carga se respeta el foco del navegador; al navegar se lleva al título de la vista.
        if (this.#primerMontaje) { this.#primerMontaje = false; return; }
        const h1 = (contenedor.shadowRoot ?? contenedor).querySelector("h1");
        (h1 ?? this.$("contenido")).focus();
    }
}

customElements.define("app-shell", AppShell);
export default AppShell;
