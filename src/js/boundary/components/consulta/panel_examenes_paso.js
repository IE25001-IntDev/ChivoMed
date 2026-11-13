/**
 * <panel-examenes-paso> (HU4): exámenes asignables del paso actual y órdenes emitidas.
 * Solo presentación.
 *
 * Propiedad `modelo` (congelado, lo arma <vista-consulta>):
 *   { asignables: [{ idExamen, nombre }], ordenes: [{ idOrdenExamen, idExamen, indicaciones, fechaCreacion }],
 *     motivo, accion, error }
 * Emite (bubbles, composed): 'emitir-orden' { idExamen, indicaciones }.
 * `limpiar()` vacía el formulario después de una orden emitida.
 */
import { hojaDeEstilos } from "../../vistas/estilos.js";
import { plantilla } from "../../plantilla.js";
import { formatearFechaHora } from "../../fechas_sv.js";
import { MAX_TEXTO, nombreDeOrden } from "../../vistas/controlador_consulta.js";

const PLANTILLA = plantilla(`
<section class="panel" aria-labelledby="titulo">
  <h2 id="titulo">Exámenes</h2>
  <form class="formulario-orden" id="formulario" novalidate aria-label="Emitir una orden de examen">
    <div class="campo">
      <label for="examen">Examen</label>
      <select id="examen" name="examen" required aria-describedby="error-orden"></select>
    </div>
    <div class="campo">
      <label for="indicaciones">Indicaciones (opcional)</label>
      <textarea id="indicaciones" name="indicaciones" rows="3" maxlength="255" aria-describedby="contador-indicaciones"></textarea>
      <p class="indicaciones" id="contador-indicaciones" aria-live="polite"></p>
    </div>
    <button class="boton boton-principal" id="emitir" type="submit" aria-describedby="motivo-orden">Emitir orden</button>
    <p class="motivo" id="motivo-orden" hidden></p>
    <p class="error-campo" id="error-orden" role="alert" hidden></p>
  </form>
  <p class="vacio" id="sin-asignables" hidden>Este paso no tiene exámenes asignables.</p>
  <h3 id="titulo-ordenes">Órdenes emitidas en este paso</h3>
  <ol class="lista-ordenes" id="ordenes" aria-labelledby="titulo-ordenes"></ol>
  <p class="vacio" id="sin-ordenes" hidden>Todavía no hay órdenes en este paso.</p>
</section>`);

const contador = valor => `${valor.length}/${MAX_TEXTO} caracteres`;

class PanelExamenesPaso extends HTMLElement {
    #modelo = null;
    #pintado = null;
    #alEnviar = event => {
        event.preventDefault();
        this.dispatchEvent(new CustomEvent("emitir-orden", {
            bubbles: true, composed: true,
            detail: { idExamen: this.$("examen").value, indicaciones: this.$("indicaciones").value },
        }));
    };
    #alEscribir = () => { this.$("contador-indicaciones").textContent = contador(this.$("indicaciones").value); };

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
    }

    set modelo(valor) {
        this.#modelo = valor ?? null;
        if (this.isConnected) this.#pintar();
    }

    get modelo() { return this.#modelo; }

    connectedCallback() {
        const raiz = this.shadowRoot;
        if (!raiz.childElementCount) raiz.append(hojaDeEstilos("vistas.css"), hojaDeEstilos("consulta.css"), PLANTILLA.clonar());
        this.$ = id => raiz.getElementById(id);
        this.$("formulario").addEventListener("submit", this.#alEnviar);
        this.$("indicaciones").addEventListener("input", this.#alEscribir);
        this.$("contador-indicaciones").textContent = contador(this.$("indicaciones").value);
        this.#pintado = null;
        this.#pintar();
    }

    disconnectedCallback() {
        this.$("formulario").removeEventListener("submit", this.#alEnviar);
        this.$("indicaciones").removeEventListener("input", this.#alEscribir);
    }

    /** Vacía el formulario tras emitir una orden. */
    limpiar() {
        if (!this.$) return;
        this.$("examen").value = "";
        this.$("indicaciones").value = "";
        this.#alEscribir();
        this.$("examen").focus();
    }

    enfocarError() {
        this.$?.("examen")?.focus();
    }

    #pintar() {
        const m = this.#modelo;
        const antes = this.#pintado;
        this.#pintado = m;
        if (!m) return;
        if (antes?.asignables !== m.asignables) this.#pintarAsignables(m.asignables);
        if (antes?.ordenes !== m.ordenes || antes?.asignables !== m.asignables) this.#pintarOrdenes(m);
        const sinAsignables = m.asignables.length === 0;
        this.$("formulario").hidden = sinAsignables;
        this.$("sin-asignables").hidden = !sinAsignables;
        this.$("emitir").disabled = Boolean(m.motivo);
        this.$("emitir").textContent = m.accion === "orden" ? "Emitiendo…" : "Emitir orden";
        this.$("motivo-orden").hidden = !m.motivo || Boolean(m.accion);
        this.$("motivo-orden").textContent = m.motivo ?? "";
        this.$("error-orden").hidden = !m.error;
        this.$("error-orden").textContent = m.error ?? "";
        if (m.error) this.$("examen").setAttribute("aria-invalid", "true");
        else this.$("examen").removeAttribute("aria-invalid");
        this.$("formulario").setAttribute("aria-busy", String(m.accion === "orden"));
    }

    #pintarAsignables(asignables) {
        const elegido = this.$("examen").value;
        const vacia = document.createElement("option");
        vacia.value = "";
        vacia.textContent = "Elige un examen";
        const opciones = asignables.map(e => {
            const opcion = document.createElement("option");
            opcion.value = e.idExamen;
            opcion.textContent = e.nombre;
            return opcion;
        });
        this.$("examen").replaceChildren(vacia, ...opciones);
        // Conserva la elección si el examen sigue en la lista.
        this.$("examen").value = asignables.some(e => e.idExamen === elegido) ? elegido : "";
    }

    #pintarOrdenes({ ordenes, asignables }) {
        this.$("sin-ordenes").hidden = ordenes.length > 0;
        this.$("ordenes").replaceChildren(...ordenes.map(orden => {
            const li = document.createElement("li");
            li.className = "orden";
            const nombre = document.createElement("p");
            const disponible = Boolean(orden.idExamen) && asignables.some(e => e.idExamen === orden.idExamen);
            nombre.className = disponible ? "orden-nombre" : "orden-nombre no-disponible";
            nombre.textContent = nombreDeOrden(orden, asignables);
            li.append(nombre);
            if (orden.fechaCreacion) {
                const fecha = document.createElement("p");
                fecha.className = "meta";
                fecha.textContent = `Emitida el ${formatearFechaHora(orden.fechaCreacion)}`;
                li.append(fecha);
            }
            if (orden.indicaciones) {
                const indicaciones = document.createElement("p");
                indicaciones.className = "orden-indicaciones";
                indicaciones.textContent = orden.indicaciones;
                li.append(indicaciones);
            }
            return li;
        }));
    }
}

customElements.define("panel-examenes-paso", PanelExamenesPaso);
export default PanelExamenesPaso;
