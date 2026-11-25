/**
 * <vista-dashboard> (HU3): selector de rol y clínica del empleado (parte 1) y espacio para las
 * consultas del día (parte 2). La lógica vive en ControladorDashboard; aquí solo se pinta.
 * La vista se suscribe al estado reactivo del controlador al conectarse y cancela al
 * desconectarse; repinta según las claves que cambiaron. El controlador nunca llama a la vista.
 *
 * Recibe del router `contexto` = { sesion, soloLectura?, ... }. Acepta `controlador` asignado antes
 * de conectarse (pruebas); si no, crea el suyo.
 * Slot `consultas`: al conectarse agrega <lista-consultas slot="consultas"> (parte 2) como hijo y,
 * tras un cambio de rol, le pasa la sesión nueva para que vuelva a buscar.
 * Emite 'sesion-actualizada' { sesion } (bubbles, composed) cuando el estado publica `sesionCambiada`.
 * F8: con una consulta en curso (estado.enCurso) muestra "Tienes una consulta en curso", el enlace
 * "Ir a la consulta en curso" y "Salir de la consulta", y le pasa `enCurso` a <lista-consultas>.
 */
import { ControladorDashboard, MENSAJES } from "../../control/controladores/controlador_dashboard.js";
import { AuthService } from "../../control/auth_service.js";
import { MENSAJE_SIN_RED } from "../../control/controlador_conexion.js";
import "../components/dashboard/lista_consultas.js";
import { Plantilla } from "../plantilla.js";
import { ComponenteChivoMed } from "../components/componente_chivomed.js";

/** F8: textos fijos del aviso de consulta en curso. */
const TEXTOS = Object.freeze({
    enCurso: "Tienes una consulta en curso.",
    irEnCurso: "Ir a la consulta en curso",
    salir: "Salir de la consulta",
    saliendo: "Saliendo…",
});

const PLANTILLA = new Plantilla(`
<section class="tarjeta" aria-labelledby="titulo">
  <h1 id="titulo" tabindex="-1">Dashboard</h1>
  <p class="subtitulo" id="activo" aria-live="polite"></p>

  <p class="aviso" id="estado" role="status" hidden></p>
  <div class="mensaje-error" id="error" role="alert" tabindex="-1" hidden>
    <p id="error-texto"></p>
    <button class="boton boton-secundario" id="reintentar" type="button">Volver a intentar</button>
  </div>
  <p class="aviso aviso-motivo" id="aviso" role="alert" tabindex="-1" hidden></p>
  <div class="region-en-curso" id="region-en-curso" role="status">
    <p class="aviso aviso-en-curso" id="en-curso-texto" hidden></p>
    <p class="aviso aviso-exito" id="confirmacion" tabindex="-1" hidden></p>
  </div>
  <div class="acciones-en-curso" id="acciones-en-curso" hidden>
    <a class="boton boton-secundario" id="ir-en-curso"></a>
    <button class="boton boton-secundario" id="salir" type="button"></button>
  </div>
  <div class="herramientas-vista">
  <h2 id="titulo-roles">Tu rol y clínica</h2>
  <form id="selector" aria-labelledby="titulo-roles" novalidate>
    <div class="campo">
      <label for="clinica">Clínica donde estás asignado</label>
      <select id="clinica" name="clinica"></select>
    </div>
    <details class="roles-desplegables" id="roles">
      <summary id="rol-elegido"></summary>
      <div id="grupos" class="lista-roles"></div>
    </details>
    <p class="aviso aviso-red" id="sin-red" hidden></p>
    <button class="boton boton-principal" id="usar" type="submit" aria-describedby="sin-red">Usar este rol</button>
  </form>
  </div>
</section>

<section class="tarjeta" id="consultas" aria-labelledby="titulo-consultas">
  <h2 id="titulo-consultas">Consultas de hoy</h2>
  <slot name="consultas">
    <p class="subtitulo" id="consultas-pendiente">Pronto verás aquí las consultas que debes atender hoy.</p>
  </slot>
</section>`);

class VistaDashboard extends ComponenteChivoMed {
    #controlador = null;
    #cancelar = null;
    #lista = null;
    #alEnviar = event => this.#enviar(event);
    /** <lista-consultas> avisa el rango mostrado: "Consultas de hoy" o "Consultas del … al …". */
    #alTitular = event => {
        event.stopPropagation();
        if (typeof event.detail?.titulo === "string") this.$("titulo-consultas").textContent = event.detail.titulo;
    };
    #alElegir = () => {
        this.#pintarBoton(this.#controlador.estado);
        this.$("roles").removeAttribute("open");
        this.$("rol-elegido").focus();
    };
    #alClinica = () => {
        this.#pintarRoles(this.#controlador.estado);
        this.#pintarBoton(this.#controlador.estado);
    };
    #alReintentar = () => this.#controlador.cargar();
    #alSalir = () => this.#salir();
    /** Contexto del router: { sesion, soloLectura, ... }. */
    contexto = null;
    tituloHerramientas = "Rol y filtros";

    /** Controlador inyectado; solo se puede asignar antes de conectar la vista. */
    set controlador(valor) {
        if (this.#cancelar) throw new Error("El controlador se asigna antes de conectar la vista.");
        this.#controlador = valor;
    }

    get controlador() { return this.#controlador; }

    connectedCallback() {
        this.montar(PLANTILLA, "vistas.css");
        this.$("selector").addEventListener("submit", this.#alEnviar);
        this.$("grupos").addEventListener("change", this.#alElegir);
        this.$("clinica").addEventListener("change", this.#alClinica);
        this.$("reintentar").addEventListener("click", this.#alReintentar);
        this.$("salir").addEventListener("click", this.#alSalir);
        this.addEventListener("titulo-consultas", this.#alTitular);
        if (!this.#lista) {
            this.#lista = document.createElement("lista-consultas");
            this.#lista.slot = "consultas";
            this.#lista.contexto = { sesion: this.contexto?.sesion ?? null, soloLectura: Boolean(this.contexto?.soloLectura), enCurso: null };
            this.append(this.#lista);
        }
        this.#controlador ??= new ControladorDashboard();
        this.#cancelar = this.#controlador.suscribir((cambios, estado) => this.#pintar(estado, cambios));
        // iniciar() escribe la sesión y "cargando" de forma síncrona; el pintado completo va después
        // para que se vean de inmediato. Lo que llegue luego, llega por la suscripción.
        this.#controlador.iniciar(this.contexto?.sesion ?? null, { soloLectura: Boolean(this.contexto?.soloLectura) });
        this.#pintar(this.#controlador.estado, null);
    }

    disconnectedCallback() {
        this.$("selector").removeEventListener("submit", this.#alEnviar);
        this.$("grupos").removeEventListener("change", this.#alElegir);
        this.$("clinica").removeEventListener("change", this.#alClinica);
        this.$("reintentar").removeEventListener("click", this.#alReintentar);
        this.$("salir").removeEventListener("click", this.#alSalir);
        this.removeEventListener("titulo-consultas", this.#alTitular);
        this.#cancelar?.();
        this.#cancelar = null;
        this.#controlador?.detener();
    }

    /** `cambios` es el Set de claves del lote, o null para el pintado completo inicial. */
    #pintar(estado, cambios) {
        const cambio = clave => !cambios || cambios.has(clave);
        if (cambios?.has("sesionCambiada") && estado.sesionCambiada) {
            if (this.#lista) this.#lista.sesion = estado.sesionCambiada;
            this.emitir("sesion-actualizada", { sesion: estado.sesionCambiada });
        }

        const rol = estado.activa
            ? { nombre: estado.activa.nombreRol, clinica: estado.activa.nombreClinica }
            : { nombre: estado.sesion?.rolActivo ? AuthService.nombreDeRol(estado.sesion.rolActivo) : null, clinica: estado.sesion?.rolActivo?.nombreClinica };
        this.$("activo").textContent = rol.nombre && rol.clinica ? `Estás atendiendo como ${rol.nombre} en ${rol.clinica}.` : "";

        const avisoEstado = estado.cargando && !estado.grupos.length ? "Cargando tus roles…"
            : estado.soloLectura ? MENSAJES.soloLectura
            : estado.desdeMemoria ? ControladorDashboard.mensajeMemoria(estado.actualizadoEn)
            : estado.vacio ? MENSAJES.sinAsignaciones : null;
        this.$("estado").hidden = !avisoEstado;
        this.$("estado").textContent = avisoEstado ?? "";

        this.$("error").hidden = !estado.error;
        this.$("error-texto").textContent = estado.error ?? "";
        this.$("reintentar").disabled = !estado.enLinea || estado.cargando;
        this.$("aviso").hidden = !estado.aviso;
        this.$("aviso").textContent = estado.aviso ?? "";
        this.#pintarEnCurso(estado, cambio);

        if (cambio("grupos")) this.#pintarGrupos(estado);
        this.$("selector").hidden = !estado.grupos.length;
        this.$("selector").setAttribute("aria-busy", String(Boolean(estado.cambiando)));
        const sinRed = !estado.enLinea && !estado.soloLectura;
        this.$("sin-red").hidden = !sinRed;
        this.$("sin-red").textContent = sinRed ? MENSAJE_SIN_RED : "";
        this.#pintarBoton(estado);
    }

    /**
     * F8: la región role="status" nunca se oculta y solo tiene textos: el aviso de consulta en curso
     * y la confirmación al salir. El enlace a #/consulta/{id} y "Salir de la consulta" van fuera de
     * ella, para que el lector de pantalla anuncie solo el mensaje.
     */
    #pintarEnCurso(estado, cambio) {
        const enCurso = estado.enCurso;
        this.$("en-curso-texto").hidden = !enCurso;
        this.$("en-curso-texto").textContent = enCurso ? TEXTOS.enCurso : "";
        this.$("acciones-en-curso").hidden = !enCurso;
        const enlace = this.$("ir-en-curso");
        enlace.textContent = TEXTOS.irEnCurso;
        if (enCurso) enlace.setAttribute("href", `#/consulta/${enCurso}`);
        else enlace.removeAttribute("href");
        const salir = this.$("salir");
        salir.disabled = estado.saliendo || Boolean(estado.cambiando);
        salir.textContent = estado.saliendo ? TEXTOS.saliendo : TEXTOS.salir;
        this.$("confirmacion").hidden = !estado.confirmacion;
        this.$("confirmacion").textContent = estado.confirmacion ?? "";
        if (cambio("enCurso") && this.#lista) this.#lista.enCurso = enCurso;
    }

    /** Solo clínicas y roles que /atencion/asignaciones devuelve para esta cuenta. */
    #pintarGrupos(estado) {
        const opciones = estado.grupos.map(grupo => {
            const opcion = document.createElement("option");
            opcion.value = grupo.idClinica;
            opcion.textContent = grupo.nombreClinica;
            return opcion;
        });
        this.$("clinica").replaceChildren(...opciones);
        const actual = estado.activa?.idClinica ?? estado.sesion?.rolActivo?.idClinica;
        this.$("clinica").value = estado.grupos.some(g => g.idClinica === actual) ? actual : "";
        this.#pintarRoles(estado);
    }

    #pintarRoles(estado) {
        const grupo = estado.grupos.find(g => g.idClinica === this.$("clinica").value);
        const fieldset = document.createElement("fieldset");
        fieldset.className = "grupo-clinica";
        const legend = document.createElement("legend");
        legend.textContent = "Tus roles en esta clínica";
        fieldset.append(legend);
        for (const rol of grupo?.roles ?? []) {
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
            fieldset.append(label);
        }
        this.$("grupos").replaceChildren(fieldset);
        this.$("roles").removeAttribute("open");
    }

    #seleccion() {
        const id = this.shadowRoot.querySelector('input[name="asignacion"]:checked')?.value;
        const grupo = this.#controlador.estado.grupos.find(g => g.idClinica === this.$("clinica").value);
        return grupo?.roles.some(r => r.idPersonaRol === id) ? id : null;
    }

    #pintarBoton(estado) {
        const boton = this.$("usar");
        const seleccion = this.#seleccion();
        boton.disabled = Boolean(estado.cambiando) || estado.soloLectura || !estado.enLinea
            || !seleccion || seleccion === estado.activa?.idPersonaRol;
        const bloqueado = Boolean(estado.cambiando) || estado.soloLectura || !estado.enLinea;
        this.$("clinica").disabled = bloqueado;
        for (const radio of this.shadowRoot.querySelectorAll('input[name="asignacion"]')) radio.disabled = bloqueado;
        const rol = estado.grupos.flatMap(g => g.roles).find(r => r.idPersonaRol === seleccion);
        this.$("rol-elegido").textContent = rol ? `Rol: ${rol.nombreRol}` : "Selecciona tu rol";
        boton.textContent = estado.cambiando ? "Cambiando de rol…" : "Usar este rol";
    }

    /** F8: "Salir de la consulta". El foco va a la confirmación o al motivo del fallo. */
    #salir() {
        return new Promise(resolve => resolve(this.#controlador.salirDeConsulta())).then(salio => {
            if (!this.isConnected) return;
            const { aviso, error } = this.#controlador.estado;
            if (salio) this.$("confirmacion").focus();
            else if (aviso) this.$("aviso").focus();
            else if (error) this.$("error").focus();
        });
    }

    #enviar(event) {
        return new Promise(resolve => {
            event.preventDefault();
            const seleccion = this.#seleccion();
            if (!seleccion) { resolve(); return; }
            resolve(this.#controlador.cambiar(seleccion).then(cambio => {
                if (!this.isConnected || cambio) return;
                // Rechazado: la selección vuelve al rol vigente y el foco va al motivo.
                this.#pintarGrupos(this.#controlador.estado);
                this.#pintarBoton(this.#controlador.estado);
                const { aviso, error } = this.#controlador.estado;
                if (aviso) this.$("aviso").focus();
                else if (error) this.$("error").focus();
            }));
        });
    }
}

customElements.define("vista-dashboard", VistaDashboard);
export default VistaDashboard;
