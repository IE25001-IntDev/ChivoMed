/**
 * <lista-consultas> (HU3, parte 2): filtro de fechas y cuadrícula de consultas del dashboard.
 * Va en el <slot name="consultas"> de <vista-dashboard>. La lógica vive en ControladorConsultas:
 * la lista se suscribe a su estado al conectarse, cancela al desconectarse y repinta por claves.
 *
 * Propiedades: `contexto` = { sesion, soloLectura } antes de conectarse; `sesion` después de un
 * cambio de rol; `controlador` inyectable antes de conectarse (pruebas).
 * Emite 'navegar' { ruta } (bubbles, composed) cuando el estado publica `navegarA`, y
 * 'titulo-consultas' { titulo } (bubbles) cuando cambia el rango mostrado, para el encabezado de
 * la sección de <vista-dashboard>. "Buscar paciente" filtra lo cargado sin pedir nada al backend.
 */
import { ControladorConsultas, motivoNoAtender, resumenResultado } from "../../vistas/controlador_consultas.js";
import { hojaDeEstilos } from "../../vistas/estilos.js";
import { plantilla } from "../../plantilla.js";
import { ZONA_SV } from "../../fechas_sv.js";
import "./tarjeta_consulta_dashboard.js";

const PLANTILLA = plantilla(`
<form class="filtro-fechas" id="filtro" novalidate aria-label="Filtrar consultas por fecha">
  <div class="campo">
    <label for="desde">Desde</label>
    <input id="desde" name="desde" type="date" required aria-describedby="error-rango" />
  </div>
  <div class="campo">
    <label for="hasta">Hasta</label>
    <input id="hasta" name="hasta" type="date" required aria-describedby="error-rango" />
  </div>
  <div class="acciones-filtro">
    <button class="boton boton-principal" id="buscar" type="submit">Buscar</button>
    <button class="boton boton-secundario" id="hoy" type="button">Hoy</button>
  </div>
  <p class="error-campo" id="error-rango" role="alert" hidden></p>
</form>
<div class="campo campo-busqueda">
  <label for="busqueda">Buscar paciente</label>
  <input id="busqueda" name="busqueda" type="search" maxlength="100" autocomplete="off"
    placeholder="Nombre o número de documento" aria-describedby="resumen" />
</div>
<p class="aviso" id="estado" role="status" hidden></p>
<div class="mensaje-error" id="error" role="alert" hidden>
  <p id="error-texto"></p>
  <button class="boton boton-secundario" id="reintentar" type="button">Volver a intentar</button>
</div>
<p class="resumen" id="resumen" aria-live="polite"></p>
<div class="cuadricula-consultas" id="cuadricula"></div>`);

const hora = fecha => (fecha instanceof Date
    ? fecha.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", timeZone: ZONA_SV }) : "");

class ListaConsultas extends HTMLElement {
    #controlador = null;
    #cancelar = null;
    /** idConsulta → <tarjeta-consulta-dashboard> pintadas. */
    #tarjetas = new Map();
    #alBuscar = event => this.#buscar(event);
    #alCambiarFecha = () => this.#controlador.cambiarFechas(this.$("desde").value, this.$("hasta").value);
    #alHoy = () => {
        this.#controlador.hoy();
        // Si el usuario cambió una fecha en este mismo tick, el estado volvió a su valor original y no
        // notifica (A→B→A); los campos se alinean con el estado aquí mismo.
        this.$("desde").value = this.#controlador.estado.desde;
        this.$("hasta").value = this.#controlador.estado.hasta;
    };
    #alReintentar = () => this.#controlador.buscar();
    #alBuscarPaciente = () => this.#controlador.buscarPaciente(this.$("busqueda").value);
    contexto = null;

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
    }

    set controlador(valor) {
        if (this.#cancelar) throw new Error("El controlador se asigna antes de conectar la lista.");
        this.#controlador = valor;
    }

    get controlador() { return this.#controlador; }

    /** Cambio de rol hecho en el selector (parte 1): otra clínica, así que se vuelve a buscar. */
    set sesion(valor) {
        this.contexto = { ...this.contexto, sesion: valor };
        if (this.#cancelar) this.#controlador.cambiarSesion(valor);
    }

    connectedCallback() {
        const raiz = this.shadowRoot;
        if (!raiz.childElementCount) raiz.append(hojaDeEstilos("vistas.css"), hojaDeEstilos("consultas.css"), PLANTILLA.clonar());
        this.$ = id => raiz.getElementById(id);
        this.$("filtro").addEventListener("submit", this.#alBuscar);
        this.$("desde").addEventListener("change", this.#alCambiarFecha);
        this.$("hasta").addEventListener("change", this.#alCambiarFecha);
        this.$("hoy").addEventListener("click", this.#alHoy);
        this.$("reintentar").addEventListener("click", this.#alReintentar);
        this.$("busqueda").addEventListener("input", this.#alBuscarPaciente);
        this.#controlador ??= new ControladorConsultas();
        this.#cancelar = this.#controlador.suscribir((cambios, estado) => this.#pintar(estado, cambios));
        this.#tarjetas = new Map();
        this.#controlador.iniciar(this.contexto?.sesion ?? null, { soloLectura: Boolean(this.contexto?.soloLectura) });
        this.#pintar(this.#controlador.estado, null);
    }

    disconnectedCallback() {
        this.$("filtro").removeEventListener("submit", this.#alBuscar);
        this.$("desde").removeEventListener("change", this.#alCambiarFecha);
        this.$("hasta").removeEventListener("change", this.#alCambiarFecha);
        this.$("hoy").removeEventListener("click", this.#alHoy);
        this.$("reintentar").removeEventListener("click", this.#alReintentar);
        this.$("busqueda").removeEventListener("input", this.#alBuscarPaciente);
        this.#cancelar?.();
        this.#cancelar = null;
        this.#controlador?.detener();
    }

    /** `cambios` es el Set de claves del lote, o null para el pintado completo. */
    #pintar(estado, cambios) {
        const cambio = clave => !cambios || cambios.has(clave);
        if (cambios?.has("navegarA") && estado.navegarA) {
            this.dispatchEvent(new CustomEvent("navegar", { bubbles: true, composed: true, detail: { ruta: estado.navegarA.ruta } }));
        }
        // Las fechas solo se escriben cuando cambian en el estado, para no pisar lo que el usuario escribe.
        if (cambio("desde")) this.$("desde").value = estado.desde;
        if (cambio("hasta")) this.$("hasta").value = estado.hasta;
        this.$("error-rango").hidden = !estado.errorRango;
        this.$("error-rango").textContent = estado.errorRango ?? "";
        for (const id of ["desde", "hasta"]) {
            if (estado.errorRango) this.$(id).setAttribute("aria-invalid", "true");
            else this.$(id).removeAttribute("aria-invalid");
        }

        const aviso = estado.cargando && !estado.consultas.length ? "Cargando consultas…"
            : estado.desdeMemoria ? `Sin conexión. Mostrando las consultas guardadas a las ${hora(estado.actualizadoEn)}.` : null;
        this.$("estado").hidden = !aviso;
        this.$("estado").textContent = aviso ?? "";
        this.$("error").hidden = !estado.error;
        this.$("error-texto").textContent = estado.error ?? "";
        this.$("reintentar").disabled = !estado.enLinea || estado.cargando;
        this.$("filtro").setAttribute("aria-busy", String(estado.cargando));
        if (cambio("busqueda") && this.$("busqueda").value !== estado.busqueda) this.$("busqueda").value = estado.busqueda;
        if (cambio("consultas") || cambio("consultado") || cambio("cargando") || cambio("busqueda")) {
            this.$("resumen").textContent = estado.cargando ? "" : resumenResultado(estado.consultas, estado.consultado, estado.busqueda);
        }
        if (cambio("consultado")) {
            this.dispatchEvent(new CustomEvent("titulo-consultas", { bubbles: true, detail: { titulo: this.#controlador.titulo } }));
        }

        if (cambio("consultas") || cambio("busqueda")) this.#pintarTarjetas(estado);
        else {
            if (cambio("enLinea") || cambio("soloLectura")) this.#pintarMotivos(estado);
            if (cambio("valores")) for (const t of this.#tarjetas.values()) t.valores = estado.valores;
        }
    }

    #motivo(consulta) {
        return motivoNoAtender(consulta, this.#controlador.contextoAtender());
    }

    #pintarTarjetas(estado) {
        this.#tarjetas = new Map();
        const tarjetas = this.#controlador.consultasVisibles.map(consulta => {
            const tarjeta = document.createElement("tarjeta-consulta-dashboard");
            tarjeta.consulta = consulta;
            tarjeta.valores = estado.valores;
            tarjeta.motivo = this.#motivo(consulta);
            tarjeta.addEventListener("ver-registro", e => { e.stopPropagation(); this.#controlador.alternarRegistro(e.detail.idPaso); });
            tarjeta.addEventListener("reintentar-registro", e => { e.stopPropagation(); this.#controlador.cargarRegistro(e.detail.idPaso); });
            tarjeta.addEventListener("atender", e => { e.stopPropagation(); this.#controlador.atender(e.detail.idConsulta); });
            this.#tarjetas.set(consulta.idConsulta, tarjeta);
            return tarjeta;
        });
        this.$("cuadricula").replaceChildren(...tarjetas);
    }

    #pintarMotivos(estado) {
        for (const consulta of estado.consultas) {
            const tarjeta = this.#tarjetas.get(consulta.idConsulta);
            if (tarjeta) tarjeta.motivo = this.#motivo(consulta);
        }
    }

    #buscar(event) {
        event.preventDefault();
        this.#controlador.cambiarFechas(this.$("desde").value, this.$("hasta").value);
        if (this.#controlador.estado.errorRango) {
            this.$("desde").focus();
            return;
        }
        this.#controlador.buscar();
    }
}

customElements.define("lista-consultas", ListaConsultas);
export default ListaConsultas;
