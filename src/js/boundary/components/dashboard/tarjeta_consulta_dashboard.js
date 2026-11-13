/**
 * <tarjeta-consulta-dashboard> (HU3): una consulta del dashboard. Solo presentación.
 * Propiedades:
 *  - consulta: consulta normalizada por normalizarConsultas (reconstruye la tarjeta).
 *  - valores:  { [idPaso]: { abierto, cargando, cargado, valor, fechaFin, error } } (solo actualiza
 *              los paneles de registro que cambiaron).
 *  - motivo:   null si se puede atender; si no, el texto que explica por qué no.
 * Emite (bubbles, composed): 'ver-registro' { idPaso }, 'reintentar-registro' { idPaso },
 * 'atender' { idConsulta }.
 * Todos los datos se pintan con textContent; la plantilla es fija.
 */
import { hojaDeEstilos } from "../../vistas/estilos.js";
import { plantilla } from "../../plantilla.js";
import { arbolDePasos, etiquetaEstado } from "../../vistas/controlador_consultas.js";
import { formatearFecha, formatearFechaHora } from "../../fechas_sv.js";

const PLANTILLA = plantilla(`
<article class="tarjeta-consulta" id="tarjeta" aria-labelledby="paciente">
  <header class="cabecera-consulta">
    <div class="paciente">
      <h3 id="paciente"></h3>
      <p class="generales" id="generales"></p>
      <p class="generales" id="documentos"></p>
    </div>
    <p class="insignia insignia-pendiente" id="pendiente" hidden>Pendiente para ti</p>
  </header>
  <dl class="datos-consulta">
    <div><dt>Inicio</dt><dd id="inicio"></dd></div>
    <div><dt>Estado</dt><dd id="estado"></dd></div>
  </dl>
  <div class="procedimientos" id="procedimientos"></div>
  <footer class="pie-consulta">
    <button class="boton boton-principal" id="atender" type="button" aria-describedby="motivo">Atender</button>
    <p class="motivo" id="motivo" hidden></p>
  </footer>
</article>`);

class TarjetaConsultaDashboard extends HTMLElement {
    #consulta = null;
    #valores = {};
    #motivo = null;
    /** idPaso → { boton, panel, pintado } de los pasos con registro. */
    #registros = new Map();
    #alAtender = () => this.#emitir("atender", { idConsulta: this.#consulta?.idConsulta });

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
    }

    set consulta(valor) {
        this.#consulta = valor ?? null;
        if (this.isConnected) this.#pintarTodo();
    }

    get consulta() { return this.#consulta; }

    set valores(valor) {
        this.#valores = valor ?? {};
        if (this.isConnected) this.#pintarRegistros();
    }

    get valores() { return this.#valores; }

    set motivo(valor) {
        this.#motivo = valor ?? null;
        if (this.isConnected) this.#pintarAtender();
    }

    get motivo() { return this.#motivo; }

    connectedCallback() {
        const raiz = this.shadowRoot;
        if (!raiz.childElementCount) raiz.append(hojaDeEstilos("vistas.css"), hojaDeEstilos("consultas.css"), PLANTILLA.clonar());
        this.$ = id => raiz.getElementById(id);
        this.$("atender").addEventListener("click", this.#alAtender);
        this.#pintarTodo();
    }

    disconnectedCallback() {
        this.$("atender").removeEventListener("click", this.#alAtender);
    }

    #emitir(tipo, detail) {
        this.dispatchEvent(new CustomEvent(tipo, { bubbles: true, composed: true, detail }));
    }

    #pintarTodo() {
        const c = this.#consulta;
        if (!c) return;
        const { paciente } = c;
        this.$("paciente").textContent = paciente.nombre;
        const edad = paciente.edad === null ? "Edad no registrada" : `${paciente.edad} ${paciente.edad === 1 ? "año" : "años"}`;
        this.$("generales").textContent = paciente.fechaNacimiento
            ? `${edad} · Nació el ${formatearFecha(paciente.fechaNacimiento)}` : edad;
        this.$("documentos").textContent = paciente.documentos.length
            ? paciente.documentos.map(d => `${d.tipoDocumento} ${d.numero}`).join(" · ") : "Sin documentos registrados";
        this.$("inicio").textContent = formatearFechaHora(c.fechaInicio);
        this.$("estado").textContent = c.fechaFin ? `Cerrada el ${formatearFechaHora(c.fechaFin)}` : "Abierta";
        this.$("pendiente").hidden = !c.pendienteParaMi;
        this.$("tarjeta").className = c.pendienteParaMi ? "tarjeta-consulta pendiente" : "tarjeta-consulta";

        this.#registros = new Map();
        const procedimientos = c.procedimientos.map(p => this.#procedimiento(p));
        if (!procedimientos.length) procedimientos.push(this.#texto("p", "Sin procedimientos registrados.", "vacio"));
        this.$("procedimientos").replaceChildren(...procedimientos);
        this.#pintarRegistros();
        this.#pintarAtender();
    }

    #texto(tag, contenido, clase) {
        const nodo = document.createElement(tag);
        nodo.textContent = contenido;
        if (clase) nodo.className = clase;
        return nodo;
    }

    #procedimiento(p) {
        const seccion = document.createElement("section");
        seccion.className = "procedimiento";
        seccion.append(this.#texto("h4", p.nombre));
        if (p.fechaInicio) {
            seccion.append(this.#texto("p", p.fechaFin
                ? `${formatearFechaHora(p.fechaInicio)} – ${formatearFechaHora(p.fechaFin)}`
                : `Desde ${formatearFechaHora(p.fechaInicio)}`, "meta"));
        }
        const arbol = arbolDePasos(p.pasos);
        seccion.append(arbol.length ? this.#lista(arbol, "arbol-pasos") : this.#texto("p", "Sin pasos registrados.", "vacio"));
        return seccion;
    }

    #lista(nodos, clase) {
        const ol = document.createElement("ol");
        if (clase) ol.className = clase;
        for (const { paso, hijos } of nodos) {
            const li = document.createElement("li");
            li.className = "paso";
            li.append(this.#paso(paso));
            if (hijos.length) li.append(this.#lista(hijos));
            ol.append(li);
        }
        return ol;
    }

    #paso(paso) {
        const caja = document.createElement("div");
        caja.className = "paso-detalle";
        const titulo = document.createElement("p");
        titulo.className = "paso-titulo";
        const estadoClase = paso.estado === "PENDIENTE" ? "pendiente" : paso.estado === "COMPLETADO" ? "completado" : "otro";
        titulo.append(this.#texto("span", paso.nombre, "paso-nombre"), this.#texto("span", etiquetaEstado(paso.estado), `insignia insignia-estado ${estadoClase}`));
        const responsable = paso.responsable
            ? [paso.responsable.nombre, paso.responsable.rol].filter(Boolean).join(" · ") : "Sin responsable asignado";
        const fechas = `${formatearFechaHora(paso.fechaInicio)} – ${paso.fechaFin ? formatearFechaHora(paso.fechaFin) : "En curso"}`;
        caja.append(titulo, this.#texto("p", responsable, "meta"), this.#texto("p", fechas, "meta"));
        if (paso.tieneValor) {
            const id = `registro-${paso.idConsultaProcedimientoPaso}`;
            const boton = this.#texto("button", "Ver registro", "boton boton-secundario boton-pequeno");
            boton.type = "button";
            boton.setAttribute("aria-expanded", "false");
            boton.setAttribute("aria-controls", id);
            boton.addEventListener("click", () => this.#emitir("ver-registro", { idPaso: paso.idConsultaProcedimientoPaso }));
            const panel = document.createElement("div");
            panel.className = "registro";
            panel.id = id;
            panel.hidden = true;
            caja.append(boton, panel);
            this.#registros.set(paso.idConsultaProcedimientoPaso, { boton, panel, pintado: undefined });
        }
        return caja;
    }

    /** Solo repinta los paneles cuyo registro cambió. */
    #pintarRegistros() {
        for (const [idPaso, registro] of this.#registros) {
            const v = this.#valores[idPaso];
            if (registro.pintado === v) continue;
            registro.pintado = v;
            const abierto = Boolean(v?.abierto);
            registro.boton.textContent = abierto ? "Ocultar registro" : "Ver registro";
            registro.boton.setAttribute("aria-expanded", String(abierto));
            registro.panel.hidden = !abierto;
            if (!abierto) continue;
            if (v.cargando) {
                registro.panel.replaceChildren(this.#texto("p", "Cargando registro…", "meta"));
            } else if (v.error) {
                const error = this.#texto("p", v.error, "error-campo");
                error.setAttribute("role", "alert");
                const reintentar = this.#texto("button", "Reintentar", "boton boton-secundario boton-pequeno");
                reintentar.type = "button";
                reintentar.addEventListener("click", () => this.#emitir("reintentar-registro", { idPaso }));
                registro.panel.replaceChildren(error, reintentar);
            } else {
                const contenido = v.valor === null || v.valor === undefined || v.valor === ""
                    ? this.#texto("p", "Sin valor registrado.", "meta") : this.#texto("p", v.valor, "valor");
                registro.panel.replaceChildren(contenido);
                if (v.fechaFin) registro.panel.append(this.#texto("p", `Registrado el ${formatearFechaHora(v.fechaFin)}`, "meta"));
            }
        }
    }

    #pintarAtender() {
        const motivo = this.#motivo;
        this.$("atender").disabled = Boolean(motivo);
        this.$("motivo").hidden = !motivo;
        this.$("motivo").textContent = motivo ?? "";
    }
}

customElements.define("tarjeta-consulta-dashboard", TarjetaConsultaDashboard);
export default TarjetaConsultaDashboard;
