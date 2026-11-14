/**
 * <vista-login> (HU2): acceso del personal con tipo y número de documento.
 * La lógica vive en ControladorLogin; aquí solo se pinta el estado y se emiten eventos.
 * La vista se suscribe al estado reactivo del controlador al conectarse y cancela al
 * desconectarse; el controlador nunca llama a la vista.
 * Acepta `controlador` asignado antes de conectarse (pruebas); si no, crea el suyo.
 * Emite 'navegar' { ruta } (bubbles, composed) cuando el personal puede entrar.
 */
import { ControladorLogin, MENSAJES, MAX_NUMERO_DOCUMENTO, destinoTrasLogin } from "./controlador_login.js";
import { hojaDeEstilos } from "./estilos.js";
import { conexion } from "../pwa/conexion.js";
import { MENSAJE_SIN_RED } from "../pwa/controlador_conexion.js";
import { plantilla } from "../plantilla.js";

const PLANTILLA = plantilla(`
<section class="tarjeta tarjeta-estrecha" aria-labelledby="titulo">
  <h1 id="titulo" tabindex="-1">Acceso del personal</h1>
  <p class="subtitulo">Ingresa con tu documento de identidad. Solo para el personal de la clínica.</p>
  <p class="aviso" id="aviso" role="status" hidden></p>
  <form id="formulario" novalidate>
    <div class="campo">
      <label for="tipo">Tipo de documento</label>
      <select id="tipo" name="tipo" required aria-describedby="tipo-error">
        <option value="">Cargando tipos…</option>
      </select>
      <p class="error-campo" id="tipo-error" hidden></p>
    </div>
    <div class="campo">
      <label for="numero">Número de documento</label>
      <input id="numero" name="numero" type="text" required autocomplete="off" spellcheck="false"
             maxlength="${MAX_NUMERO_DOCUMENTO}" aria-describedby="numero-indicaciones numero-error" />
      <p class="indicaciones" id="numero-indicaciones" hidden></p>
      <p class="error-campo" id="numero-error" hidden></p>
    </div>
    <div class="mensaje-error" id="mensaje" role="alert" hidden>
      <p id="mensaje-texto"></p>
      <button class="boton boton-secundario" id="reintentar" type="button" hidden>Volver a cargar</button>
    </div>
    <p class="aviso aviso-red" id="sin-red" hidden></p>
    <button class="boton boton-principal" id="enviar" type="submit" aria-describedby="sin-red">Ingresar</button>
  </form>
  <p class="pie-tarjeta">¿Eres paciente? <a href="#/citas">Busca tus citas</a></p>
</section>`);

class VistaLogin extends HTMLElement {
    #controlador = null;
    #cancelar = null;
    #alEnviar = event => this.#enviar(event);
    #alCambiarTipo = () => this.#mostrarIndicaciones();
    #alReintentar = () => this.#controlador.cargarTipos();
    #alEscribirNumero = () => this.#formatearNumero();
    /** Último valor del número, para no reformatear mientras se borra. */
    #numeroAnterior = "";
    #tiposPintados = null;
    #cancelarConexion = null;
    #cargaPintada = null;
    /** Contexto del router: { query, sesion, ... }. */
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
            raiz.append(hojaDeEstilos("vistas.css"), PLANTILLA.clonar());
        }
        this.$ = id => raiz.getElementById(id);
        this.$("formulario").addEventListener("submit", this.#alEnviar);
        this.$("tipo").addEventListener("change", this.#alCambiarTipo);
        this.$("numero").addEventListener("input", this.#alEscribirNumero);
        this.$("reintentar").addEventListener("click", this.#alReintentar);
        const aviso = this.$("aviso");
        aviso.hidden = this.contexto?.query?.get("sesion") !== "finalizada";
        aviso.textContent = aviso.hidden ? "" : MENSAJES.sesionFinalizada;
        this.#cancelarConexion = conexion.suscribir(enLinea => {
            this.#pintar(this.#controlador.estado);
            // Al volver la red, si los tipos no cargaron, se reintenta sin pedirlo al usuario.
            if (enLinea && this.#controlador.estado.errorTipos) this.#controlador.cargarTipos();
        });
        this.#controlador ??= new ControladorLogin();
        this.#cancelar = this.#controlador.suscribir((_cambios, estado) => this.#pintar(estado));
        // cargarTipos() escribe "cargando" de forma síncrona; se pinta enseguida para que se vea ya.
        this.#controlador.cargarTipos();
        this.#pintar(this.#controlador.estado);
    }

    disconnectedCallback() {
        this.$("formulario").removeEventListener("submit", this.#alEnviar);
        this.$("tipo").removeEventListener("change", this.#alCambiarTipo);
        this.$("numero").removeEventListener("input", this.#alEscribirNumero);
        this.$("reintentar").removeEventListener("click", this.#alReintentar);
        this.#cancelarConexion?.();
        this.#cancelar?.();
        this.#cancelar = null;
    }

    #pintar(estado) {
        const select = this.$("tipo");
        // Se reconstruye solo si cambió la lista o el estado de carga, para no perder la selección al validar.
        if (this.#tiposPintados !== estado.tipos || this.#cargaPintada !== estado.cargandoTipos) {
            const seleccionado = select.value;
            const inicial = estado.cargandoTipos ? "Cargando tipos…"
                : estado.tipos.length ? "Selecciona un tipo" : "Sin tipos disponibles";
            const opcion = (texto, valor) => {
                const o = document.createElement("option");
                o.value = valor;
                o.textContent = texto;
                return o;
            };
            select.replaceChildren(opcion(inicial, ""), ...estado.tipos.map(t => opcion(t.nombre, t.idTipoDocumento)));
            select.value = estado.tipos.some(t => t.idTipoDocumento === seleccionado) ? seleccionado : "";
            this.#tiposPintados = estado.tipos;
            this.#cargaPintada = estado.cargandoTipos;
        }
        select.disabled = estado.cargandoTipos || !estado.tipos.length;
        this.#mostrarIndicaciones();

        this.#errorCampo("tipo", estado.errores.tipo);
        this.#errorCampo("numero", estado.errores.numero);

        const mensaje = estado.errorTipos ?? estado.mensaje;
        this.$("mensaje").hidden = !mensaje;
        this.$("mensaje-texto").textContent = mensaje ?? "";
        this.$("reintentar").hidden = !estado.errorTipos;

        // Ingresar y recargar necesitan red: sin conexión se deshabilitan con un mensaje.
        const sinRed = !conexion.enLinea;
        this.$("sin-red").hidden = !sinRed;
        this.$("sin-red").textContent = sinRed ? MENSAJE_SIN_RED : "";
        this.$("reintentar").disabled = sinRed;

        const enviar = this.$("enviar");
        enviar.disabled = estado.enviando || estado.cargandoTipos || !estado.tipos.length || sinRed;
        enviar.textContent = estado.enviando ? "Verificando…" : "Ingresar";
        this.$("formulario").setAttribute("aria-busy", String(estado.enviando));
    }

    #errorCampo(campo, error) {
        const control = this.$(campo);
        const texto = this.$(`${campo}-error`);
        texto.hidden = !error;
        texto.textContent = error ?? "";
        if (error) control.setAttribute("aria-invalid", "true");
        else control.removeAttribute("aria-invalid");
    }

    #formatearNumero() {
        const campo = this.$("numero");
        const formateado = this.#controlador.formatearNumero(this.$("tipo").value, campo.value, this.#numeroAnterior);
        if (formateado !== campo.value) campo.value = formateado;
        this.#numeroAnterior = formateado;
    }

    #mostrarIndicaciones() {
        const tipo = this.#controlador.tipo(this.$("tipo").value);
        const indicaciones = this.$("numero-indicaciones");
        indicaciones.hidden = !tipo?.indicaciones;
        indicaciones.textContent = tipo?.indicaciones ?? "";
    }

    async #enviar(event) {
        event.preventDefault();
        const datos = { idTipoDocumento: this.$("tipo").value, numeroDocumento: this.$("numero").value };
        const sesion = await this.#controlador.enviar(datos);
        if (!this.isConnected) return;
        if (sesion) {
            this.dispatchEvent(new CustomEvent("navegar", {
                bubbles: true, composed: true, detail: { ruta: destinoTrasLogin(this.contexto?.query) },
            }));
            return;
        }
        const { errores, mensaje } = this.#controlador.estado;
        if (errores.tipo) this.$("tipo").focus();
        else if (errores.numero) this.$("numero").focus();
        else if (mensaje) this.$("numero").focus();
    }
}

customElements.define("vista-login", VistaLogin);
export default VistaLogin;
