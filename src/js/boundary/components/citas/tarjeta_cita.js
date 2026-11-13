/**
 * <tarjeta-cita> (HU1): una cita de la búsqueda pública. Solo presentación.
 * Propiedad `modelo` = { cita: { idConsulta, fechaInicio, nombreClinica, procedimientos },
 *   ticket: null | { estado: "descargando"|"listo"|"entregado"|"error", error? },
 *   motivoTicket: null | texto que explica por qué no se puede descargar ahora }.
 * Emite 'descargar-ticket' { idConsulta } (bubbles, composed). Los datos van con textContent.
 */
import { hojaDeEstilos } from "../../vistas/estilos.js";
import { plantilla } from "../../plantilla.js";
import { formatearFechaHora } from "../../fechas_sv.js";

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
    <button class="boton boton-secundario" id="descargar" type="button" aria-describedby="estado-ticket">Descargar ticket</button>
    <p class="estado-ticket" id="estado-ticket" role="status"></p>
  </div>
</article>`);

class TarjetaCita extends HTMLElement {
    #modelo = null;
    #alDescargar = () => {
        const id = this.#modelo?.cita?.idConsulta;
        if (!id || this.shadowRoot.getElementById("descargar").disabled) return;
        this.dispatchEvent(new CustomEvent("descargar-ticket", { bubbles: true, composed: true, detail: { idConsulta: id } }));
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
        this.$("descargar").addEventListener("click", this.#alDescargar);
        this.#pintar();
    }

    disconnectedCallback() {
        this.$("descargar").removeEventListener("click", this.#alDescargar);
    }

    #pintar() {
        const { cita, ticket = null, motivoTicket = null } = this.#modelo ?? {};
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

        const boton = this.$("descargar");
        const descargando = ticket?.estado === "descargando";
        boton.disabled = descargando || Boolean(motivoTicket);
        boton.textContent = descargando ? "Descargando…" : "Descargar ticket";
        boton.setAttribute("aria-label", `Descargar ticket de la cita del ${fecha}`);
        const estado = this.$("estado-ticket");
        const error = ticket?.estado === "error";
        estado.className = error || motivoTicket ? "estado-ticket error-campo" : "estado-ticket";
        estado.textContent = motivoTicket ?? (error ? ticket.error
            : ticket?.estado === "listo" || ticket?.estado === "entregado" ? "Ticket descargado." : "");
    }
}

customElements.define("tarjeta-cita", TarjetaCita);
export default TarjetaCita;
