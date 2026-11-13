/**
 * <vista-citas> (HU1): búsqueda pública de citas en un asistente de 5 pasos, sin sesión.
 * La lógica vive en ControladorCitas; aquí solo se pinta. La vista se suscribe al estado reactivo
 * al conectarse, cancela al desconectarse y repinta según las claves que cambiaron.
 *
 * Slots: <indicador-pasos slot="pasos"> y una <tarjeta-cita slot="resultados"> por cita, como
 * hijos de la vista. Todo el asistente vive en #/citas: los pasos no cambian el hash ni el historial,
 * y el número de documento nunca sale del estado del controlador.
 * Acepta `controlador` asignado antes de conectarse (pruebas); si no, crea el suyo.
 */
import { ControladorCitas, PASOS, MENSAJES, MAX_NUMERO_DOCUMENTO, motivoNoBuscar, formatearHoraSV } from "./controlador_citas.js";
import { formatearFecha } from "../fechas_sv.js";
import { hojaDeEstilos } from "./estilos.js";
import { plantilla } from "../plantilla.js";
import "../components/citas/indicador_pasos.js";
import "../components/citas/tarjeta_cita.js";

const PLANTILLA = plantilla(`
<section class="tarjeta" aria-labelledby="titulo">
  <h1 id="titulo" tabindex="-1">Búsqueda de citas</h1>
  <p class="subtitulo">Consulta tus citas con tu documento, la clínica donde te atienden y un rango de fechas.</p>
  <slot name="pasos"></slot>
  <p class="solo-lectores" id="anuncio" role="status"></p>
  <p class="aviso" id="aviso-memoria" role="status" hidden></p>
  <div class="mensaje-error" id="mensaje" role="alert" hidden><p id="mensaje-texto"></p></div>

  <section class="paso-asistente" id="paso-1" aria-labelledby="h-1">
    <h2 id="h-1" tabindex="-1">Tipo de documento</h2>
    <form id="form-1" novalidate>
      <div class="campo">
        <label for="tipo">¿Con qué documento te registraste?</label>
        <select id="tipo" name="tipo" required aria-describedby="tipo-error">
          <option value="">Cargando tipos…</option>
        </select>
        <p class="error-campo" id="tipo-error" hidden></p>
      </div>
      <div class="mensaje-error" id="error-tipos" role="alert" hidden>
        <p id="error-tipos-texto"></p>
        <button class="boton boton-secundario" id="reintentar-tipos" type="button">Volver a intentar</button>
      </div>
      <div class="acciones-paso">
        <button class="boton boton-principal" id="siguiente-1" type="submit">Siguiente</button>
      </div>
    </form>
  </section>

  <section class="paso-asistente" id="paso-2" aria-labelledby="h-2" hidden>
    <h2 id="h-2" tabindex="-1">Número de documento</h2>
    <form id="form-2" novalidate>
      <div class="campo">
        <label for="numero">Número de documento</label>
        <input id="numero" name="numero" type="text" required autocomplete="off" spellcheck="false"
               maxlength="${MAX_NUMERO_DOCUMENTO}" aria-describedby="numero-indicaciones numero-error" />
        <p class="indicaciones" id="numero-indicaciones" hidden></p>
        <p class="error-campo" id="numero-error" hidden></p>
      </div>
      <p class="aviso aviso-motivo" id="motivo-2" hidden></p>
      <div class="acciones-paso">
        <button class="boton boton-secundario" id="atras-2" type="button">Atrás</button>
        <button class="boton boton-principal" id="siguiente-2" type="submit" aria-describedby="motivo-2">Siguiente</button>
      </div>
    </form>
  </section>

  <section class="paso-asistente" id="paso-3" aria-labelledby="h-3" hidden>
    <h2 id="h-3" tabindex="-1">Clínica</h2>
    <form id="form-3" novalidate>
      <fieldset class="opciones-clinica" id="clinicas" aria-describedby="clinica-error">
        <legend>¿En qué clínica quieres buscar?</legend>
      </fieldset>
      <p class="aviso" id="sin-clinicas" role="status" hidden></p>
      <p class="error-campo" id="clinica-error" hidden></p>
      <div class="acciones-paso">
        <button class="boton boton-secundario" id="atras-3" type="button">Atrás</button>
        <button class="boton boton-principal" id="siguiente-3" type="submit">Siguiente</button>
      </div>
    </form>
  </section>

  <section class="paso-asistente" id="paso-4" aria-labelledby="h-4" hidden>
    <h2 id="h-4" tabindex="-1">Fechas</h2>
    <form id="form-4" novalidate>
      <div class="rango-fechas">
        <div class="campo">
          <label for="desde">Desde</label>
          <input id="desde" name="desde" type="date" required aria-describedby="rango-error" />
        </div>
        <div class="campo">
          <label for="hasta">Hasta</label>
          <input id="hasta" name="hasta" type="date" required aria-describedby="rango-error" />
        </div>
      </div>
      <p class="error-campo" id="rango-error" hidden></p>
      <p class="aviso aviso-motivo" id="motivo-4" hidden></p>
      <div class="acciones-paso">
        <button class="boton boton-secundario" id="atras-4" type="button">Atrás</button>
        <button class="boton boton-principal" id="buscar" type="submit" aria-describedby="motivo-4">Buscar citas</button>
      </div>
    </form>
  </section>

  <section class="paso-asistente" id="paso-5" aria-labelledby="h-5" hidden>
    <h2 id="h-5" tabindex="-1">Resultados</h2>
    <p class="resumen-busqueda" id="resumen"></p>
    <div class="cuadricula-citas" id="resultados">
      <slot name="resultados"></slot>
    </div>
    <div class="aviso" id="sin-citas" hidden>
      <p id="sin-citas-texto"></p>
      <button class="boton boton-secundario" id="cambiar-fechas" type="button">Cambiar fechas</button>
    </div>
    <div class="acciones-paso">
      <button class="boton boton-secundario" id="atras-5" type="button">Atrás</button>
      <button class="boton boton-secundario" id="nueva" type="button">Nueva búsqueda</button>
    </div>
  </section>

  <p class="pie-tarjeta">¿Trabajas en una clínica? <a href="#/login">Acceso del personal</a></p>
</section>`);

const FOCO_ERROR = Object.freeze({ 1: ["tipo", "tipo"], 2: ["numero", "numero"], 3: ["clinica", "clinicas"], 4: ["rango", "desde"] });

class VistaCitas extends HTMLElement {
    #controlador = null;
    #cancelar = null;
    #indicador = null;
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
        if (!this.#indicador) {
            this.#indicador = document.createElement("indicador-pasos");
            this.#indicador.slot = "pasos";
            this.append(this.#indicador);
        }
        this.#controlador ??= new ControladorCitas();
        const c = this.#controlador;
        this.#escuchar(this.#indicador, "ir-a-paso", e => c.irA(e.detail?.paso));
        for (const n of [1, 2, 3, 4]) this.#escuchar(this.$(`form-${n}`), "submit", e => this.#siguiente(e));
        for (const n of [2, 3, 4, 5]) this.#escuchar(this.$(`atras-${n}`), "click", () => c.atras());
        this.#escuchar(this.$("tipo"), "change", () => c.elegirTipo(this.$("tipo").value));
        this.#escuchar(this.$("numero"), "input", () => c.escribirNumero(this.$("numero").value));
        this.#escuchar(this.$("clinicas"), "change", () => c.elegirClinica(this.#clinicaMarcada()));
        for (const id of ["desde", "hasta"]) {
            this.#escuchar(this.$(id), "change", () => c.fijarFechas({ desde: this.$("desde").value, hasta: this.$("hasta").value }));
        }
        this.#escuchar(this.$("reintentar-tipos"), "click", () => c.cargarTipos());
        this.#escuchar(this.$("cambiar-fechas"), "click", () => c.irA(4));
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

    #clinicaMarcada() {
        return this.shadowRoot.querySelector('input[name="clinica"]:checked')?.value ?? null;
    }

    /** Envía el paso; si quedó un error de validación en el mismo paso, el foco va a su campo. */
    async #siguiente(event) {
        event.preventDefault();
        const c = this.#controlador;
        const paso = c.estado.paso;
        await c.siguiente();
        if (!this.isConnected || c.estado.paso !== paso) return;
        const [clave, campo] = FOCO_ERROR[paso] ?? [];
        if (clave && c.estado.errores[clave]) {
            const destino = campo === "clinicas" ? this.shadowRoot.querySelector('input[name="clinica"]') : this.$(campo);
            destino?.focus();
        } else if (c.estado.mensaje) {
            this.$(`h-${paso}`).focus();
        }
    }

    /** `cambios` es el Set de claves del lote, o null para el pintado completo inicial. */
    #pintar(estado, cambios) {
        const cambio = (...claves) => !cambios || claves.some(k => cambios.has(k));
        if (cambio("paso", "alcanzado")) this.#pintarPasos(estado, Boolean(cambios?.has("paso")));
        if (cambio("tipos", "cargandoTipos", "errorTipos", "idTipoDocumento")) this.#pintarTipos(estado);
        if (cambio("numeroDocumento") && this.$("numero").value !== estado.numeroDocumento) this.$("numero").value = estado.numeroDocumento;
        if (cambio("clinicas", "idClinica")) this.#pintarClinicas(estado);
        if (cambio("desde", "hasta")) {
            if (this.$("desde").value !== estado.desde) this.$("desde").value = estado.desde;
            if (this.$("hasta").value !== estado.hasta) this.$("hasta").value = estado.hasta;
        }
        if (cambio("errores")) {
            this.#errorCampo(this.$("tipo"), "tipo-error", estado.errores.tipo);
            this.#errorCampo(this.$("numero"), "numero-error", estado.errores.numero);
            this.#errorCampo(this.$("clinicas"), "clinica-error", estado.errores.clinica);
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

    #pintarPasos(estado, moverFoco) {
        this.#indicador.modelo = Object.freeze({ pasos: PASOS, actual: estado.paso, alcanzado: estado.alcanzado });
        for (const { numero } of PASOS) this.$(`paso-${numero}`).hidden = numero !== estado.paso;
        if (!moverFoco) return;
        const { nombre } = PASOS[estado.paso - 1];
        this.$("anuncio").textContent = `Paso ${estado.paso} de ${PASOS.length}: ${nombre}`;
        this.$(`h-${estado.paso}`).focus();
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
        this.$("error-tipos-texto").textContent = estado.errorTipos ?? "";
        const tipo = estado.tipos.find(t => t.idTipoDocumento === estado.idTipoDocumento);
        this.$("numero-indicaciones").hidden = !tipo?.indicaciones;
        this.$("numero-indicaciones").textContent = tipo?.indicaciones ?? "";
    }

    #pintarClinicas(estado) {
        const fieldset = this.$("clinicas");
        const leyenda = fieldset.querySelector("legend");
        const opciones = (estado.clinicas ?? []).map(clinica => {
            const label = document.createElement("label");
            label.className = "opcion-clinica";
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "clinica";
            radio.value = clinica.idClinica;
            const nombre = document.createElement("span");
            nombre.textContent = clinica.nombre;
            label.append(radio, nombre);
            return { label, radio, marcado: clinica.idClinica === estado.idClinica };
        });
        fieldset.replaceChildren(leyenda, ...opciones.map(o => o.label));
        for (const o of opciones) if (o.marcado) o.radio.checked = true;
        const vacias = Array.isArray(estado.clinicas) && !estado.clinicas.length;
        fieldset.hidden = vacias;
        this.$("sin-clinicas").hidden = !vacias;
        this.$("sin-clinicas").textContent = vacias ? MENSAJES.sinClinicas : "";
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
        this.$("siguiente-1").disabled = ocupado || !estado.tipos.length;
        this.$("reintentar-tipos").disabled = !estado.enLinea || estado.cargandoTipos;
        this.$("siguiente-2").disabled = ocupado || Boolean(motivo);
        this.$("siguiente-2").textContent = estado.cargando === "clinicas" ? "Buscando clínicas…" : "Siguiente";
        this.$("siguiente-3").disabled = ocupado || !estado.clinicas?.length;
        this.$("buscar").disabled = ocupado || Boolean(motivo);
        this.$("buscar").textContent = estado.cargando === "citas" ? "Buscando citas…" : "Buscar citas";
        for (const n of [2, 4]) {
            this.$(`motivo-${n}`).hidden = !motivo;
            this.$(`motivo-${n}`).textContent = motivo ?? "";
            this.$(`form-${n}`).setAttribute("aria-busy", String(ocupado));
        }
    }
}

customElements.define("vista-citas", VistaCitas);
export default VistaCitas;
