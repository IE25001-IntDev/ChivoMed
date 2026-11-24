/**
 * <tarjeta-cita> (HU1): una cita de la búsqueda pública. Solo presentación.
 * Propiedad `modelo` = { cita: { idConsulta, fechaInicio, nombreClinica, nombrePaciente, procedimientos },
 *   motivoTicket: null o el texto que explica por qué no se puede ver el ticket ahora }.
 * Emite 'ver-ticket' { idConsulta } (bubbles, composed); el ticket se muestra en <ventana-ticket>.
 * `enfocarTicket()` devuelve el foco al botón "Ver ticket" (al cerrar esa ventana).
 * Los datos van con textContent; sin nombrePaciente no se muestra la línea "Paciente:".
 */
import { hojaDeEstilos } from "../../estilos.js";
import { plantilla } from "../../plantilla.js";
import { formatearFechaHora } from "../../../control/fechas_sv.js";

const PLANTILLA = plantilla(`
<article class="tarjeta-cita" aria-labelledby="fecha">
  <h3 id="fecha"></h3>
  <dl class="datos-cita">
    <div><dt>Clínica</dt><dd id="clinica"></dd></div>
  </dl>
  <h4 id="titulo-procedimientos">Procedimientos</h4>
  <ul class="procedimientos-cita" id="procedimientos" aria-labelledby="titulo-procedimientos"></ul>
  <p class="meta" id="sin-procedimientos" hidden>Sin procedimientos registrados.</p>
  <div class="pie-cita">
    <p class="paciente-cita" id="paciente" hidden><span class="etiqueta-paciente">Paciente:</span><span id="nombre-paciente"></span></p>
    <button class="boton boton-secundario" id="ver" type="button" aria-haspopup="dialog" aria-describedby="estado-ticket">Ver ticket</button>
    <p class="estado-ticket" id="estado-ticket" role="status"></p>
  </div>
</article>`);

class TarjetaCita extends HTMLElement {
    #modelo = null;
    #alVer = () => {
        const id = this.#modelo?.cita?.idConsulta;
        if (!id || this.shadowRoot.getElementById("ver").disabled) return;
        this.dispatchEvent(new CustomEvent("ver-ticket", { bubbles: true, composed: true, detail: { idConsulta: id } }));
    };

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
        if (!raiz.childElementCount) raiz.append(hojaDeEstilos("vistas.css"), hojaDeEstilos("citas.css"), PLANTILLA.clonar());
        this.$ = id => raiz.getElementById(id);
        this.$("ver").addEventListener("click", this.#alVer);
        this.#pintar();
    }

    disconnectedCallback() {
        this.$("ver").removeEventListener("click", this.#alVer);
    }

    /** Devuelve el foco al botón "Ver ticket". */
    enfocarTicket() {
        this.shadowRoot.getElementById("ver")?.focus();
    }

    #pintar() {
        const { cita, motivoTicket = null } = this.#modelo ?? {};
        if (!cita) return;
        const fecha = formatearFechaHora(cita.fechaInicio);
        this.$("fecha").textContent = fecha;
        this.$("clinica").textContent = cita.nombreClinica;
        const procedimientos = cita.procedimientos ?? [];
        this.$("procedimientos").replaceChildren(...procedimientos.map(nombre => {
            const li = document.createElement("li");
            li.textContent = nombre;
            return li;
        }));
        this.$("procedimientos").hidden = !procedimientos.length;
        this.$("sin-procedimientos").hidden = procedimientos.length > 0;

        const nombre = typeof cita.nombrePaciente === "string" ? cita.nombrePaciente : "";
        this.$("paciente").hidden = !nombre;
        this.$("nombre-paciente").textContent = nombre;

        const boton = this.$("ver");
        boton.disabled = Boolean(motivoTicket);
        boton.setAttribute("aria-label", `Ver ticket de la cita del ${fecha}`);
        const estado = this.$("estado-ticket");
        estado.className = motivoTicket ? "estado-ticket error-campo" : "estado-ticket";
        estado.textContent = motivoTicket ?? "";
    }
}

customElements.define("tarjeta-cita", TarjetaCita);
export default TarjetaCita;
