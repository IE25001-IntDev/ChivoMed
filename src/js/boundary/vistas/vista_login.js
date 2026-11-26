/**
 * <vista-login> (HU2): acceso del personal con tipo y número de documento.
 * La lógica vive en ControladorLogin; aquí solo se pinta el estado y se emiten eventos.
 * La vista se suscribe al estado reactivo del controlador al conectarse y cancela al
 * desconectarse; el controlador nunca llama a la vista.
 * Acepta `controlador` asignado antes de conectarse (pruebas); si no, crea el suyo.
 * Emite 'navegar' { ruta } (bubbles, composed) cuando el personal puede entrar.
 */
import { ControladorLogin, MENSAJES } from "../../control/controladores/controlador_login.js";
import { conexion } from "../../control/conexion.js";
import { MENSAJE_SIN_RED } from "../../control/controlador_conexion.js";
import { Plantilla } from "../plantilla.js";
import { Validaciones } from "../../control/validaciones.js";
import { ComponenteChivoMed } from "../components/componente_chivomed.js";

const PLANTILLA = new Plantilla(`
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
             maxlength="${Validaciones.MAX_NUMERO_DOCUMENTO}" aria-describedby="numero-indicaciones numero-error" />
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

class VistaLogin extends ComponenteChivoMed {
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

    connectedCallback() {
        this.montar(PLANTILLA, "vistas.css");
        this.escuchar(this.$("formulario"), "submit", this.#alEnviar);
        this.escuchar(this.$("tipo"), "change", this.#alCambiarTipo);
        this.escuchar(this.$("numero"), "input", this.#alEscribirNumero);
        this.escuchar(this.$("reintentar"), "click", this.#alReintentar);
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
        this.dejarDeEscuchar();
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
            select.replaceChildren(new Option(inicial, ""), ...estado.tipos.map(t => new Option(t.nombre, t.idTipoDocumento)));
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

    #enviar(event) {
        return new Promise(resolve => {
            event.preventDefault();
            // Sin red o sin servidor no se envía, aunque el submit llegue sin pasar por el botón deshabilitado.
            if (!conexion.enLinea) { resolve(); return; }
            const datos = { idTipoDocumento: this.$("tipo").value, numeroDocumento: this.$("numero").value };
            resolve(this.#controlador.enviar(datos).then(sesion => {
                if (!this.isConnected) return;
                if (sesion) {
                    this.emitir("navegar", { ruta: ControladorLogin.destinoTrasLogin(this.contexto?.query, sesion) });
                    return;
                }
                const { errores, mensaje } = this.#controlador.estado;
                if (errores.tipo) this.$("tipo").focus();
                else if (errores.numero) this.$("numero").focus();
                else if (mensaje) this.$("numero").focus();
            }));
        });
    }
}

customElements.define("vista-login", VistaLogin);
export default VistaLogin;
