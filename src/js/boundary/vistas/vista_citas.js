/**
 * <vista-citas> (HU1): búsqueda pública de citas con filtros en una barra superior, sin sesión.
 * La lógica vive en ControladorCitas; aquí solo se pinta. La vista se suscribe al estado reactivo
 * al conectarse, cancela al desconectarse y repinta según las claves que cambiaron.
 *
 * Slot: una <tarjeta-cita slot="resultados"> por cita, como hijo de la vista. El número de documento
 * nunca sale del estado del controlador.
 * Acepta `controlador` asignado antes de conectarse (pruebas); si no, crea el suyo.
 */
import { ControladorCitas, MENSAJES, MAX_NUMERO_DOCUMENTO, motivoNoBuscar, formatearHoraSV } from "./controlador_citas.js";
import { formatearFecha } from "../fechas_sv.js";
import { hojaDeEstilos } from "./estilos.js";
import { plantilla } from "../plantilla.js";
import "../components/citas/tarjeta_cita.js";

const PLANTILLA = plantilla(`
<section class="tarjeta" aria-labelledby="titulo">
  <h1 id="titulo" tabindex="-1">Búsqueda de citas</h1>
  <p class="subtitulo">Consulta tus citas con tu documento, la clínica donde te atienden y un rango de fechas.</p>
  <p class="aviso" id="aviso-memoria" role="status" hidden></p>
  <div class="mensaje-error" id="mensaje" role="alert" hidden><p id="mensaje-texto"></p></div>
  <form id="form-busqueda" class="barra-busqueda" novalidate>
    <div class="campo">
      <label for="tipo">Tipo de documento</label>
      <select id="tipo" name="tipo" required aria-describedby="tipo-error"><option value="">Cargando tipos…</option></select>
      <p class="error-campo" id="tipo-error" hidden></p>
    </div>
    <div class="campo">
      <label for="numero">Número de documento</label>
      <input id="numero" name="numero" type="text" required autocomplete="off" spellcheck="false"
             maxlength="${MAX_NUMERO_DOCUMENTO}" aria-describedby="numero-indicaciones numero-error" />
      <p class="indicaciones" id="numero-indicaciones" hidden></p>
      <p class="error-campo" id="numero-error" hidden></p>
    </div>
    <div class="campo">
      <label for="clinica">Clínica</label>
      <select id="clinica" name="clinica" required aria-describedby="clinica-error">
        <option value="">Primero escribe tu documento</option>
      </select>
      <p class="error-campo" id="clinica-error" hidden></p>
    </div>
    <div class="rango-fechas">
      <div class="campo"><label for="desde">Desde</label><input id="desde" name="desde" type="date" required aria-describedby="rango-error" /></div>
      <div class="campo"><label for="hasta">Hasta</label><input id="hasta" name="hasta" type="date" required aria-describedby="rango-error" /></div>
      <p class="error-campo" id="rango-error" hidden></p>
    </div>
    <div class="acciones-busqueda">
      <p class="indicaciones" id="error-tipos" role="alert" hidden></p>
      <button class="boton boton-secundario" id="reintentar-tipos" type="button" hidden>Volver a cargar tipos</button>
      <p class="aviso aviso-motivo" id="motivo" hidden></p>
      <button class="boton boton-principal" id="buscar" type="submit">Buscar citas</button>
    </div>
  </form>

  <section class="resultados-citas" aria-labelledby="h-resultados">
    <h2 id="h-resultados" tabindex="-1">Resultados</h2>
    <p class="resumen-busqueda" id="resumen"></p>
    <div class="cuadricula-citas" id="resultados">
      <slot name="resultados"></slot>
    </div>
  <div class="aviso" id="sin-citas" hidden>
      <p id="sin-citas-texto"></p>
    </div>
    <button class="boton boton-secundario" id="nueva" type="button">Limpiar búsqueda</button>
  </section>

  <p class="pie-tarjeta">¿Trabajas en una clínica? <a href="#/login">Acceso del personal</a></p>
</section>`);

class VistaCitas extends HTMLElement {
    #controlador = null;
    #cancelar = null;
    /** idConsulta → <tarjeta-cita> de los resultados pintados. */
    #tarjetas = new Map();
    #escuchas = [];
    #alDescargar = e => this.#controlador.descargarTicket(e.detail?.idConsulta);
    contexto = null;

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
        if (!raiz.childElementCount) raiz.append(hojaDeEstilos("vistas.css"), hojaDeEstilos("citas.css"), PLANTILLA.clonar());
        this.$ = id => raiz.getElementById(id);
        this.#controlador ??= new ControladorCitas();
        const c = this.#controlador;
        this.#escuchar(this.$("form-busqueda"), "submit", e => this.#buscar(e));
        this.#escuchar(this.$("tipo"), "change", () => {
            c.elegirTipo(this.$("tipo").value);
            c.prepararClinicas();
        });
        this.#escuchar(this.$("numero"), "input", () => {
            c.escribirNumero(this.$("numero").value);
            // Si la máscara descartó lo escrito, el estado no cambia y no hay repintado: se repone aquí.
            if (this.$("numero").value !== c.estado.numeroDocumento) this.$("numero").value = c.estado.numeroDocumento;
        });
        this.#escuchar(this.$("numero"), "change", () => c.prepararClinicas());
        this.#escuchar(this.$("clinica"), "change", () => c.elegirClinica(this.$("clinica").value));
        for (const id of ["desde", "hasta"]) {
            this.#escuchar(this.$(id), "change", () => c.fijarFechas({ desde: this.$("desde").value, hasta: this.$("hasta").value }));
        }
        this.#escuchar(this.$("reintentar-tipos"), "click", () => c.cargarTipos());
        this.#escuchar(this.$("nueva"), "click", () => c.nuevaBusqueda());
        this.#cancelar = c.suscribir((cambios, estado) => this.#pintar(estado, cambios));
        c.iniciar();
        this.#pintar(c.estado, null);
    }

    disconnectedCallback() {
        for (const [objetivo, tipo, fn] of this.#escuchas) objetivo.removeEventListener(tipo, fn);
        this.#escuchas = [];
        this.#cancelar?.();
        this.#cancelar = null;
        this.#controlador?.detener();
    }

    #escuchar(objetivo, tipo, fn) {
        objetivo.addEventListener(tipo, fn);
        this.#escuchas.push([objetivo, tipo, fn]);
    }

    /** Envía todos los filtros de una vez y enfoca el primer dato que necesite atención. */
    async #buscar(event) {
        event.preventDefault();
        const c = this.#controlador;
        await c.buscar();
        if (!this.isConnected) return;
        const error = c.estado.errores;
        const campo = error.tipo ? "tipo" : error.numero ? "numero" : error.clinica ? "clinica" : error.rango ? "desde" : null;
        if (campo) this.$(campo).focus();
        else if (c.estado.citas) this.$("h-resultados").focus();
    }

    /** `cambios` es el Set de claves del lote, o null para el pintado completo inicial. */
    #pintar(estado, cambios) {
        const cambio = (...claves) => !cambios || claves.some(k => cambios.has(k));
        if (cambio("tipos", "cargandoTipos", "errorTipos", "idTipoDocumento")) this.#pintarTipos(estado);
        if (cambio("numeroDocumento") && this.$("numero").value !== estado.numeroDocumento) this.$("numero").value = estado.numeroDocumento;
        if (cambio("clinicas", "idClinica", "cargando")) this.#pintarClinicas(estado);
        if (cambio("desde", "hasta")) {
            if (this.$("desde").value !== estado.desde) this.$("desde").value = estado.desde;
            if (this.$("hasta").value !== estado.hasta) this.$("hasta").value = estado.hasta;
        }
        if (cambio("errores")) {
            this.#errorCampo(this.$("tipo"), "tipo-error", estado.errores.tipo);
            this.#errorCampo(this.$("numero"), "numero-error", estado.errores.numero);
            this.#errorCampo(this.$("clinica"), "clinica-error", estado.errores.clinica);
            this.#errorCampo(this.$("desde"), "rango-error", estado.errores.rango);
            this.#errorCampo(this.$("hasta"), "rango-error", estado.errores.rango);
        }
        if (cambio("citas")) this.#pintarResultados(estado);
        if (cambio("tickets")) this.#entregarTickets(estado);
        if (cambio("citas", "tickets", "enLinea", "bloqueadoHasta")) this.#pintarTarjetas(estado);
        this.#pintarAcciones(estado);
        this.$("mensaje").hidden = !estado.mensaje;
        this.$("mensaje-texto").textContent = estado.mensaje ?? "";
        const memoria = estado.desdeMemoria && estado.citas ? MENSAJES.memoria(formatearHoraSV(estado.actualizadoEn)) : null;
        this.$("aviso-memoria").hidden = !memoria;
        this.$("aviso-memoria").textContent = memoria ?? "";
    }

    #pintarTipos(estado) {
        const select = this.$("tipo");
        const inicial = estado.cargandoTipos ? "Cargando tipos…" : estado.tipos.length ? "Selecciona un tipo" : "Sin tipos disponibles";
        const opcion = (texto, valor) => {
            const o = document.createElement("option");
            o.value = valor;
            o.textContent = texto;
            return o;
        };
        select.replaceChildren(opcion(inicial, ""), ...estado.tipos.map(t => opcion(t.nombre, t.idTipoDocumento)));
        select.value = estado.tipos.some(t => t.idTipoDocumento === estado.idTipoDocumento) ? estado.idTipoDocumento : "";
        select.disabled = estado.cargandoTipos || !estado.tipos.length;
        this.$("error-tipos").hidden = !estado.errorTipos;
        this.$("error-tipos").textContent = estado.errorTipos ?? "";
        this.$("reintentar-tipos").hidden = !estado.errorTipos;
        const tipo = estado.tipos.find(t => t.idTipoDocumento === estado.idTipoDocumento);
        this.$("numero-indicaciones").hidden = !tipo?.indicaciones;
        this.$("numero-indicaciones").textContent = tipo?.indicaciones ?? "";
    }

    #pintarClinicas(estado) {
        const select = this.$("clinica");
        const inicial = estado.cargando === "clinicas" ? "Cargando clínicas…"
            : estado.clinicas?.length ? "Selecciona una clínica" : "Primero escribe tu documento";
        const opcion = (texto, valor) => {
            const o = document.createElement("option");
            o.value = valor;
            o.textContent = texto;
            return o;
        };
        const opciones = (estado.clinicas ?? []).map(clinica => {
            return opcion(clinica.nombre, clinica.idClinica);
        });
        select.replaceChildren(opcion(inicial, ""), ...opciones);
        select.value = estado.clinicas?.some(c => c.idClinica === estado.idClinica) ? estado.idClinica : "";
        select.disabled = estado.cargando === "clinicas" || !opciones.length;
    }

    #errorCampo(control, idError, error) {
        const texto = this.$(idError);
        texto.hidden = !error;
        texto.textContent = error ?? "";
        if (error) control.setAttribute("aria-invalid", "true");
        else control.removeAttribute("aria-invalid");
    }

    #pintarResultados(estado) {
        const citas = estado.citas ?? [];
        for (const tarjeta of this.#tarjetas.values()) {
            tarjeta.removeEventListener("descargar-ticket", this.#alDescargar);
            tarjeta.remove();
        }
        this.#tarjetas = new Map(citas.map(cita => {
            const tarjeta = document.createElement("tarjeta-cita");
            tarjeta.slot = "resultados";
            tarjeta.addEventListener("descargar-ticket", this.#alDescargar);
            return [cita.idConsulta, tarjeta];
        }));
        this.append(...this.#tarjetas.values());
        const vacias = Array.isArray(estado.citas) && !citas.length;
        this.$("resultados").hidden = !citas.length;
        this.$("sin-citas").hidden = !vacias;
        this.$("sin-citas-texto").textContent = vacias ? MENSAJES.sinCitas : "";
        const clinica = estado.clinicas?.find(c => c.idClinica === estado.idClinica)?.nombre ?? "";
        const rango = `del ${formatearFecha(estado.desde)} al ${formatearFecha(estado.hasta)}`;
        this.$("resumen").textContent = citas.length
            ? `${citas.length} ${citas.length === 1 ? "cita" : "citas"} en ${clinica}, ${rango}.`
            : estado.citas ? `${clinica}, ${rango}.` : "";
    }

    #pintarTarjetas(estado) {
        const motivo = !estado.enLinea ? MENSAJES.sinRedTicket : motivoNoBuscar(estado, Date.now());
        for (const cita of estado.citas ?? []) {
            const tarjeta = this.#tarjetas.get(cita.idConsulta);
            if (tarjeta) tarjeta.modelo = Object.freeze({ cita, ticket: estado.tickets[cita.idConsulta] ?? null, motivoTicket: motivo });
        }
    }

    /** Un ticket "listo" se entrega al navegador con un <a download> temporal y se suelta. */
    #entregarTickets(estado) {
        for (const [idConsulta, ticket] of Object.entries(estado.tickets)) {
            if (ticket.estado !== "listo") continue;
            const url = URL.createObjectURL(ticket.archivo.blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = ticket.archivo.nombre;
            a.hidden = true;
            this.shadowRoot.append(a);
            a.click();
            a.remove();
            // Se revoca en el siguiente turno: el navegador ya tomó la descarga del clic.
            setTimeout(() => URL.revokeObjectURL(url), 0);
            this.#controlador.ticketEntregado(idConsulta);
        }
    }

    #pintarAcciones(estado) {
        const ocupado = Boolean(estado.cargando);
        const motivo = motivoNoBuscar(estado, Date.now());
        this.$("reintentar-tipos").disabled = !estado.enLinea || estado.cargandoTipos;
        this.$("buscar").disabled = ocupado || Boolean(motivo);
        this.$("buscar").textContent = estado.cargando === "clinicas" ? "Cargando clínicas…"
            : estado.cargando === "citas" ? "Buscando citas…" : "Buscar citas";
        this.$("motivo").hidden = !motivo;
        this.$("motivo").textContent = motivo ?? "";
        this.$("form-busqueda").setAttribute("aria-busy", String(ocupado));
    }
}

customElements.define("vista-citas", VistaCitas);
export default VistaCitas;
