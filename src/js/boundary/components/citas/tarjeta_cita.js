/**
 * <tarjeta-cita> (HU1): una cita de la búsqueda pública. Solo presentación.
 * Propiedad `modelo` = { cita: { idConsulta, fechaInicio, nombreClinica, nombrePaciente, procedimientos },
 *   motivoTicket: null o el texto que explica por qué no se puede ver el ticket ahora }.
 * Emite 'ver-ticket' { idConsulta } (bubbles, composed); el ticket se muestra en <ventana-ticket>.
 * `enfocarTicket()` devuelve el foco al botón "Ver ticket" (al cerrar esa ventana).
 * Los datos van con textContent; sin nombrePaciente no se muestra la línea "Paciente:".
 */
import { Plantilla } from "../../plantilla.js";
import { FechasSV } from "../../../control/fechas_sv.js";
import { ComponenteChivoMed } from "../componente_chivomed.js";

const PLANTILLA = new Plantilla(`
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

class TarjetaCita extends ComponenteChivoMed {
    #alVer = () => {
        const id = this.modelo?.cita?.idConsulta;
        if (!id || this.$("ver").disabled) return;
        this.emitir("ver-ticket", { idConsulta: id });
    };

    connectedCallback() {
        this.montar(PLANTILLA, "vistas.css", "citas.css");
        this.escuchar(this.$("ver"), "click", this.#alVer);
        this.pintar();
    }

    disconnectedCallback() {
        this.dejarDeEscuchar();
    }

    /** Devuelve el foco al botón "Ver ticket". */
    enfocarTicket() {
        this.$("ver")?.focus();
    }

    pintar() {
        const { cita, motivoTicket = null } = this.modelo ?? {};
        if (!cita) return;
        const fecha = FechasSV.formatearFechaHora(cita.fechaInicio);
        this.$("fecha").textContent = fecha;
        this.$("clinica").textContent = cita.nombreClinica;
        const procedimientos = cita.procedimientos ?? [];
        this.$("procedimientos").replaceChildren(...procedimientos.map(nombre => this.texto("li", nombre)));
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
