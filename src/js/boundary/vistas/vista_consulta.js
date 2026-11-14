/**
 * <vista-consulta> (HU4) en #/consulta/:id: seguimiento de una consulta seleccionada en el dashboard.
 * La lógica vive en ControladorConsulta; aquí solo se pinta. La vista se suscribe al estado
 * reactivo al conectarse, cancela al desconectarse y repinta según las claves que cambiaron.
 *
 * Muestra la cabecera (paciente, inicio y estado), el recorrido de pasos por nivel con el actual
 * marcado, y por <slot> tres paneles: `paso` (<panel-paso-actual>), `examenes`
 * (<panel-examenes-paso>) y `cierre` (<panel-cierre-consulta>). Traduce sus eventos a métodos del
 * controlador y, cuando termina una acción, mueve el foco.
 *
 * Recibe del router `contexto` = { params: { id }, sesion, soloLectura }. Acepta `controlador`
 * asignado antes de conectarse (pruebas).
 */
import {
    ControladorConsulta, MENSAJES, motivoNoRetroceder, puedeOfrecerRetroceso, puedeCerrar,
} from "./controlador_consulta.js";
import { arbolDePasos, etiquetaEstado } from "./controlador_consultas.js";
import { hojaDeEstilos } from "./estilos.js";
import { plantilla } from "../plantilla.js";
import { formatearFecha, formatearFechaHora, ZONA_SV } from "../fechas_sv.js";
import "../components/consulta/panel_paso_actual.js";
import "../components/consulta/panel_examenes_paso.js";
import "../components/consulta/panel_cierre_consulta.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PLANTILLA = plantilla(`
<section class="tarjeta cabecera-consulta" aria-labelledby="titulo">
  <div class="fila">
    <h1 id="titulo" tabindex="-1">Consulta</h1>
    <a class="volver" href="#/dashboard">Volver al dashboard</a>
  </div>
  <p class="aviso" id="estado" role="status" hidden></p>
  <div class="mensaje-error" id="error" role="alert" tabindex="-1" hidden>
    <p id="error-texto"></p>
    <a id="en-curso" hidden>Ir a la consulta en curso</a>
    <button class="boton boton-secundario" id="reintentar" type="button">Volver a intentar</button>
  </div>
  <div id="datos" hidden>
    <h2 id="paciente"></h2>
    <dl class="datos-consulta">
      <div><dt>Edad</dt><dd id="edad"></dd></div>
      <div><dt>Documentos</dt><dd id="documentos"></dd></div>
      <div><dt>Inicio</dt><dd id="inicio"></dd></div>
      <div><dt>Estado</dt><dd><span class="insignia" id="estado-consulta"></span></dd></div>
    </dl>
  </div>
  <p class="aviso" id="bloqueo" role="status" hidden></p>
  <p class="aviso" id="aviso" role="status" tabindex="-1" hidden></p>
</section>
<div class="distribucion-consulta" id="distribucion" hidden>
  <section class="panel columna" aria-labelledby="titulo-recorrido">
    <h2 id="titulo-recorrido">Recorrido de la consulta</h2>
    <div class="procedimientos" id="recorrido"></div>
  </section>
  <div class="columna">
    <div class="mensaje-error" id="error-accion" role="alert" tabindex="-1" hidden>
      <p id="error-accion-texto"></p>
    </div>
    <div class="mensaje-error" id="error-detalle" role="alert" hidden>
      <p id="error-detalle-texto"></p>
      <button class="boton boton-secundario" id="reintentar-detalle" type="button">Volver a intentar</button>
    </div>
    <slot name="paso"></slot>
    <slot name="examenes"></slot>
    <slot name="cierre"></slot>
  </div>
</div>`);

const hora = fecha => (fecha instanceof Date
    ? fecha.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", timeZone: ZONA_SV }) : "");

class VistaConsulta extends HTMLElement {
    #controlador = null;
    #cancelar = null;
    #paneles = null;
    /** Última acción que pidió el usuario: decide dónde se muestra `errorAccion`. */
    #ultimaPedida = null;
    #manejadores = [];
    /** Contexto del router: { params: { id }, sesion, soloLectura, ... }. */
    contexto = null;

    set controlador(valor) {
        if (this.#cancelar) throw new Error("El controlador se asigna antes de conectar la vista.");
        this.#controlador = valor;
    }

    get controlador() { return this.#controlador; }

    /** Paneles hijos (para pruebas): { paso, examenes, cierre }. */
    get paneles() { return this.#paneles; }

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        const raiz = this.shadowRoot;
        if (!raiz.childElementCount) raiz.append(hojaDeEstilos("vistas.css"), hojaDeEstilos("consulta.css"), PLANTILLA.clonar());
        this.$ = id => raiz.getElementById(id);
        if (!this.#paneles) this.#crearPaneles();
        const c = () => this.#controlador;
        this.#escuchar(this.$("reintentar"), "click", () => c().reintentar());
        this.#escuchar(this.$("reintentar-detalle"), "click", () => c().reintentarDetalle());
        const { paso, examenes, cierre } = this.#paneles;
        this.#escuchar(paso, "cambiar-borrador", e => c().cambiarBorrador(e.detail.valor));
        this.#escuchar(paso, "avanzar", () => this.#pedir("avanzar", () => c().avanzar()));
        this.#escuchar(paso, "retroceder", () => this.#pedir("retroceder", () => c().pedirRetroceso()));
        this.#escuchar(paso, "elegir-paso", e => c().elegirPaso(e.detail.idPaso));
        this.#escuchar(examenes, "emitir-orden", e => this.#pedir("orden", () => c().emitirOrden(e.detail)));
        this.#escuchar(cierre, "cerrar", e => this.#pedir("cierre", () => c().pedirCierre(e.detail.observaciones)));
        for (const panel of [paso, cierre]) {
            this.#escuchar(panel, "confirmar", () => c().confirmar());
            this.#escuchar(panel, "cancelar", () => this.#cancelarConfirmacion(panel));
        }

        this.#controlador ??= new ControladorConsulta();
        this.#cancelar = this.#controlador.suscribir((cambios, estado) => this.#pintar(estado, cambios));
        const ctx = this.contexto ?? {};
        this.#controlador.iniciar(ctx.params?.id ?? null, ctx.sesion ?? null, { soloLectura: Boolean(ctx.soloLectura) });
        this.#pintar(this.#controlador.estado, null);
    }

    disconnectedCallback() {
        for (const [el, tipo, fn] of this.#manejadores) el.removeEventListener(tipo, fn);
        this.#manejadores = [];
        this.#cancelar?.();
        this.#cancelar = null;
        this.#controlador?.detener();
    }

    #escuchar(el, tipo, fn) {
        const manejador = event => { if (event.target !== this) event.stopPropagation?.(); fn(event); };
        el.addEventListener(tipo, manejador);
        this.#manejadores.push([el, tipo, manejador]);
    }

    #crearPaneles() {
        const crear = (tag, slot) => {
            const el = document.createElement(tag);
            el.slot = slot;
            el.setAttribute("slot", slot);
            el.hidden = true;
            this.append(el);
            return el;
        };
        this.#paneles = {
            paso: crear("panel-paso-actual", "paso"),
            examenes: crear("panel-examenes-paso", "examenes"),
            cierre: crear("panel-cierre-consulta", "cierre"),
        };
    }

    #pedir(accion, operacion) {
        this.#ultimaPedida = accion;
        return operacion();
    }

    #cancelarConfirmacion(panel) {
        this.#controlador.cancelar();
        panel.enfocar?.();
    }

    /** `cambios` es el Set de claves del lote, o null para el pintado completo inicial. */
    #pintar(estado, cambios) {
        const cambio = (...claves) => !cambios || claves.some(c => cambios.has(c));
        const ctrl = this.#controlador;
        this.#pintarCabecera(estado, ctrl, cambio);
        if (cambio("consulta", "idElegido", "sesion")) this.#pintarRecorrido(estado, ctrl);
        this.#pintarPaneles(estado, ctrl);
        this.#pintarErrores(estado, cambio);
        if (cambios) this.#moverFoco(estado, cambios);
    }

    #pintarCabecera(estado, ctrl, cambio) {
        const { consulta } = estado;
        const estadoTexto = estado.cargando && !consulta ? "Cargando la consulta…"
            : estado.desdeMemoria ? MENSAJES.desdeMemoria(hora(estado.actualizadoEn)) : null;
        this.$("estado").hidden = !estadoTexto;
        this.$("estado").textContent = estadoTexto ?? "";

        this.$("error").hidden = !estado.error;
        this.$("error-texto").textContent = estado.error ?? "";
        const enCurso = typeof estado.enCurso === "string" && UUID.test(estado.enCurso) ? estado.enCurso : null;
        this.$("en-curso").hidden = !enCurso;
        if (enCurso) this.$("en-curso").setAttribute("href", `#/consulta/${enCurso}`);
        else this.$("en-curso").removeAttribute("href");
        this.$("reintentar").hidden = Boolean(enCurso);
        this.$("reintentar").disabled = !estado.enLinea || estado.cargando;

        this.$("datos").hidden = !consulta;
        this.$("distribucion").hidden = !consulta;
        if (consulta && cambio("consulta")) {
            const { paciente } = consulta;
            this.$("paciente").textContent = paciente.nombre;
            const edad = paciente.edad === null ? "No registrada" : `${paciente.edad} ${paciente.edad === 1 ? "año" : "años"}`;
            this.$("edad").textContent = paciente.fechaNacimiento ? `${edad} (nació el ${formatearFecha(paciente.fechaNacimiento)})` : edad;
            this.$("documentos").textContent = paciente.documentos.length
                ? paciente.documentos.map(d => `${d.tipoDocumento} ${d.numero}`).join(" · ") : "Sin documentos registrados";
            this.$("inicio").textContent = formatearFechaHora(consulta.fechaInicio);
            this.$("estado-consulta").textContent = consulta.fechaFin ? `Cerrada el ${formatearFechaHora(consulta.fechaFin)}` : "Abierta";
            this.$("estado-consulta").className = consulta.fechaFin ? "insignia cerrada" : "insignia abierta";
        }
        const bloqueo = consulta ? ctrl.bloqueo : null;
        this.$("bloqueo").hidden = !bloqueo;
        this.$("bloqueo").textContent = bloqueo ?? "";
        // El aviso de paso reabierto va en el panel del paso; los demás, aquí.
        const aviso = estado.aviso && estado.aviso !== MENSAJES.reabierto ? estado.aviso : null;
        this.$("aviso").hidden = !aviso;
        this.$("aviso").textContent = aviso ?? "";
    }

    #pintarRecorrido(estado, ctrl) {
        const { consulta } = estado;
        if (!consulta) {
            this.$("recorrido").replaceChildren();
            return;
        }
        const actual = ctrl.pasoActual?.idConsultaProcedimientoPaso ?? null;
        const procedimientos = consulta.procedimientos.map(p => {
            const seccion = document.createElement("section");
            seccion.className = "procedimiento";
            seccion.append(this.#texto("h3", p.nombre));
            const arbol = arbolDePasos(p.pasos);
            seccion.append(arbol.length ? this.#lista(arbol, actual, "arbol-pasos") : this.#texto("p", "Sin pasos registrados.", "vacio"));
            return seccion;
        });
        if (!procedimientos.length) procedimientos.push(this.#texto("p", "Sin procedimientos registrados.", "vacio"));
        this.$("recorrido").replaceChildren(...procedimientos);
    }

    #texto(tag, contenido, clase) {
        const nodo = document.createElement(tag);
        nodo.textContent = contenido;
        if (clase) nodo.className = clase;
        return nodo;
    }

    #lista(nodos, actual, clase) {
        const ol = document.createElement("ol");
        if (clase) ol.className = clase;
        for (const { paso, hijos } of nodos) {
            const li = document.createElement("li");
            const caja = document.createElement("div");
            caja.className = "paso-recorrido";
            if (paso.idConsultaProcedimientoPaso === actual) caja.setAttribute("aria-current", "step");
            const titulo = document.createElement("p");
            titulo.className = "paso-titulo";
            const clase = paso.estado === "PENDIENTE" ? "pendiente" : paso.estado === "COMPLETADO" ? "completado" : "otro";
            titulo.append(this.#texto("span", paso.nombre), this.#texto("span", etiquetaEstado(paso.estado), `insignia ${clase}`));
            const responsable = paso.responsable
                ? [paso.responsable.nombre, paso.responsable.rol].filter(Boolean).join(" · ") : "Sin responsable asignado";
            const fechas = `${formatearFechaHora(paso.fechaInicio)} – ${paso.fechaFin ? formatearFechaHora(paso.fechaFin) : "En curso"}`;
            caja.append(titulo, this.#texto("p", responsable, "meta"), this.#texto("p", fechas, "meta"));
            li.append(caja);
            if (hijos.length) li.append(this.#lista(hijos, actual));
            ol.append(li);
        }
        return ol;
    }

    #pintarPaneles(estado, ctrl) {
        const { paso: panelPaso, examenes: panelExamenes, cierre: panelCierre } = this.#paneles;
        const { consulta, detalle, accion, confirmando } = estado;
        const atiende = ctrl.atiende;
        const abierta = Boolean(consulta) && !consulta.fechaFin;
        const paso = ctrl.pasoActual;
        const motivo = ctrl.motivoNoActuar;

        panelPaso.hidden = !abierta;
        if (abierta) {
            const procedimiento = consulta.procedimientos.find(p => p.pasos.includes(paso))?.nombre ?? null;
            panelPaso.modelo = Object.freeze({
                paso, procedimiento, pendientes: ctrl.pendientes, indicaFin: detalle.indicaFin === true,
                borrador: estado.borrador, editable: atiende, aviso: estado.aviso === MENSAJES.reabierto ? estado.aviso : null,
                motivo, ofrecerRetroceso: puedeOfrecerRetroceso(paso), motivoRetroceso: motivoNoRetroceder(detalle),
                confirmando: confirmando === "retroceso", accion,
            });
        }

        const conExamenes = abierta && atiende && Boolean(paso) && detalle.idPaso === paso?.idConsultaProcedimientoPaso && !detalle.cargando && !detalle.error;
        panelExamenes.hidden = !conExamenes;
        if (conExamenes) {
            panelExamenes.modelo = Object.freeze({
                asignables: detalle.asignables, ordenes: detalle.ordenes, motivo, accion,
                error: this.#ultimaPedida === "orden" ? estado.errorAccion : null,
            });
        }

        const conCierre = atiende && puedeCerrar(consulta);
        panelCierre.hidden = !conCierre;
        if (conCierre) {
            const motivoCierre = ctrl.bloqueo ?? (accion ? MENSAJES.accionEnCurso : null);
            panelCierre.modelo = Object.freeze({ motivo: motivoCierre, confirmando: confirmando === "cierre", accion });
        }
    }

    #pintarErrores(estado, cambio) {
        const enPanel = this.#ultimaPedida === "orden";
        const errorAccion = enPanel ? null : estado.errorAccion;
        this.$("error-accion").hidden = !errorAccion;
        this.$("error-accion-texto").textContent = errorAccion ?? "";
        if (cambio("detalle", "enLinea")) {
            const error = estado.detalle.error;
            this.$("error-detalle").hidden = !error;
            this.$("error-detalle-texto").textContent = error ?? "";
            this.$("reintentar-detalle").disabled = !estado.enLinea;
        }
    }

    /** Foco tras un cambio relevante: confirmación, fin de una acción, error. */
    #moverFoco(estado, cambios) {
        const { paso, examenes, cierre } = this.#paneles;
        if (cambios.has("confirmando") && estado.confirmando) {
            (estado.confirmando === "cierre" ? cierre : paso).enfocar?.("confirmacion");
            return;
        }
        if (cambios.has("errorAccion") && estado.errorAccion) {
            if (this.#ultimaPedida === "orden") examenes.enfocarError?.();
            else this.$("error-accion").focus();
            return;
        }
        if (cambios.has("acabado") && estado.acabado?.ok) {
            const { accion } = estado.acabado;
            if (accion === "orden") examenes.limpiar?.();
            else if (accion === "cierre") this.$("aviso").focus();
            else paso.enfocar?.("titulo");
            return;
        }
        if (cambios.has("error") && estado.error) this.$("error").focus();
    }
}

customElements.define("vista-consulta", VistaConsulta);
export default VistaConsulta;
