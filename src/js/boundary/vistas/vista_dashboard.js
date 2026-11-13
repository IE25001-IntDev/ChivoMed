/**
 * <vista-dashboard> (HU3): selector de rol y clínica del empleado (parte 1) y espacio para las
 * consultas del día (parte 2). La lógica vive en ControladorDashboard; aquí solo se pinta.
 * La vista se suscribe al estado reactivo del controlador al conectarse y cancela al
 * desconectarse; repinta según las claves que cambiaron. El controlador nunca llama a la vista.
 *
 * Recibe del router `contexto` = { sesion, soloLectura?, ... }. Acepta `controlador` asignado antes
 * de conectarse (pruebas); si no, crea el suyo.
 * Slot `consultas`: la lista de consultas (parte 2) se agrega como hijo con slot="consultas".
 * Emite 'sesion-actualizada' { sesion } (bubbles, composed) cuando el estado publica `sesionCambiada`.
 */
import { ControladorDashboard, mensajeMemoria, MENSAJES } from "./controlador_dashboard.js";
import { ROLES } from "../../control/auth_service.js";
import { hojaDeEstilos } from "./estilos.js";
import { MENSAJE_SIN_RED } from "../pwa/controlador_conexion.js";

const PLANTILLA = `
<section class="tarjeta" aria-labelledby="titulo">
  <h1 id="titulo" tabindex="-1">Dashboard</h1>
  <p class="subtitulo" id="activo" aria-live="polite"></p>

  <h2 id="titulo-roles">Tu rol y clínica</h2>
  <p class="aviso" id="estado" role="status" hidden></p>
  <div class="mensaje-error" id="error" role="alert" tabindex="-1" hidden>
    <p id="error-texto"></p>
    <button class="boton boton-secundario" id="reintentar" type="button">Volver a intentar</button>
  </div>
  <p class="aviso aviso-motivo" id="aviso" role="alert" tabindex="-1" hidden></p>
  <form id="selector" aria-labelledby="titulo-roles" novalidate>
    <div class="grupos-clinica" id="grupos"></div>
    <p class="aviso aviso-red" id="sin-red" hidden></p>
    <button class="boton boton-principal" id="usar" type="submit" aria-describedby="sin-red">Usar este rol</button>
  </form>
</section>

<section class="tarjeta" id="consultas" aria-labelledby="titulo-consultas">
  <h2 id="titulo-consultas">Consultas de hoy</h2>
  <slot name="consultas">
    <p class="subtitulo" id="consultas-pendiente">Pronto verás aquí las consultas que debes atender hoy.</p>
  </slot>
</section>`;

class VistaDashboard extends HTMLElement {
    #controlador = null;
    #cancelar = null;
    #alEnviar = event => this.#enviar(event);
    #alElegir = () => this.#pintarBoton(this.#controlador.estado);
    #alReintentar = () => this.#controlador.cargar();
    /** Contexto del router: { sesion, soloLectura, ... }. */
    contexto = null;

    /** Controlador inyectado; solo se puede asignar antes de conectar la vista. */
    set controlador(valor) {
        if (this.#cancelar) throw new Error("El controlador se asigna antes de conectar la vista.");
        this.#controlador = valor;
    }

    get controlador() { return this.#controlador; }

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
        this.$ = id => raiz.getElementById(id);
        this.$("selector").addEventListener("submit", this.#alEnviar);
        this.$("selector").addEventListener("change", this.#alElegir);
        this.$("reintentar").addEventListener("click", this.#alReintentar);
        this.#controlador ??= new ControladorDashboard();
        this.#cancelar = this.#controlador.suscribir((cambios, estado) => this.#pintar(estado, cambios));
        // iniciar() escribe la sesión y "cargando" de forma síncrona; el pintado completo va después
        // para que se vean de inmediato. Lo que llegue luego, llega por la suscripción.
        this.#controlador.iniciar(this.contexto?.sesion ?? null, { soloLectura: Boolean(this.contexto?.soloLectura) });
        this.#pintar(this.#controlador.estado, null);
    }

    disconnectedCallback() {
        this.$("selector").removeEventListener("submit", this.#alEnviar);
        this.$("selector").removeEventListener("change", this.#alElegir);
        this.$("reintentar").removeEventListener("click", this.#alReintentar);
        this.#cancelar?.();
        this.#cancelar = null;
        this.#controlador?.detener();
    }

    /** `cambios` es el Set de claves del lote, o null para el pintado completo inicial. */
    #pintar(estado, cambios) {
        const cambio = clave => !cambios || cambios.has(clave);
        if (cambios?.has("sesionCambiada") && estado.sesionCambiada) {
            this.dispatchEvent(new CustomEvent("sesion-actualizada", {
                bubbles: true, composed: true, detail: { sesion: estado.sesionCambiada },
            }));
        }

        const rol = estado.activa
            ? { nombre: estado.activa.nombreRol, clinica: estado.activa.nombreClinica }
            : { nombre: ROLES[estado.sesion?.rolActivo?.codigo], clinica: estado.sesion?.rolActivo?.nombreClinica };
        this.$("activo").textContent = rol.nombre && rol.clinica ? `Estás atendiendo como ${rol.nombre} en ${rol.clinica}.` : "";

        const avisoEstado = estado.cargando && !estado.grupos.length ? "Cargando tus roles…"
            : estado.soloLectura ? MENSAJES.soloLectura
            : estado.desdeMemoria ? mensajeMemoria(estado.actualizadoEn)
            : estado.vacio ? MENSAJES.sinAsignaciones : null;
        this.$("estado").hidden = !avisoEstado;
        this.$("estado").textContent = avisoEstado ?? "";

        this.$("error").hidden = !estado.error;
        this.$("error-texto").textContent = estado.error ?? "";
        this.$("reintentar").disabled = !estado.enLinea || estado.cargando;
        this.$("aviso").hidden = !estado.aviso;
        this.$("aviso").textContent = estado.aviso ?? "";

        if (cambio("grupos")) this.#pintarGrupos(estado);
        this.$("selector").hidden = !estado.grupos.length;
        this.$("selector").setAttribute("aria-busy", String(Boolean(estado.cambiando)));
        const sinRed = !estado.enLinea && !estado.soloLectura;
        this.$("sin-red").hidden = !sinRed;
        this.$("sin-red").textContent = sinRed ? MENSAJE_SIN_RED : "";
        this.#pintarBoton(estado);
    }

    /** Un <fieldset> por clínica con un radio por rol; la activa queda marcada. */
    #pintarGrupos(estado) {
        const grupos = estado.grupos.map(grupo => {
            const fieldset = document.createElement("fieldset");
            fieldset.className = "grupo-clinica";
            const legend = document.createElement("legend");
            legend.textContent = grupo.nombreClinica;
            fieldset.append(legend);
            for (const rol of grupo.roles) {
                const label = document.createElement("label");
                label.className = "opcion-rol";
                const radio = document.createElement("input");
                radio.type = "radio";
                radio.name = "asignacion";
                radio.value = rol.idPersonaRol;
                radio.checked = rol.activa;
                const nombre = document.createElement("span");
                nombre.textContent = rol.nombreRol;
                label.append(radio, nombre);
                if (rol.activa) {
                    const insignia = document.createElement("span");
                    insignia.className = "insignia";
                    insignia.textContent = "Rol actual";
                    label.append(insignia);
                }
                fieldset.append(label);
            }
            return fieldset;
        });
        this.$("grupos").replaceChildren(...grupos);
    }

    #seleccion() {
        return this.shadowRoot.querySelector('input[name="asignacion"]:checked')?.value ?? null;
    }

    #pintarBoton(estado) {
        const boton = this.$("usar");
        const seleccion = this.#seleccion();
        boton.disabled = Boolean(estado.cambiando) || estado.soloLectura || !estado.enLinea
            || !seleccion || seleccion === estado.activa?.idPersonaRol;
        boton.textContent = estado.cambiando ? "Cambiando de rol…" : "Usar este rol";
    }

    async #enviar(event) {
        event.preventDefault();
        const seleccion = this.#seleccion();
        if (!seleccion) return;
        const cambio = await this.#controlador.cambiar(seleccion);
        if (!this.isConnected || cambio) return;
        // Rechazado: la selección vuelve al rol vigente y el foco va al motivo.
        const activa = this.#controlador.estado.activa?.idPersonaRol;
        for (const radio of this.shadowRoot.querySelectorAll('input[name="asignacion"]')) radio.checked = radio.value === activa;
        this.#pintarBoton(this.#controlador.estado);
        const { aviso, error } = this.#controlador.estado;
        if (aviso) this.$("aviso").focus();
        else if (error) this.$("error").focus();
    }
}

customElements.define("vista-dashboard", VistaDashboard);
export default VistaDashboard;
