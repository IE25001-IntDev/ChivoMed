/**
 * <panel-cierre-consulta> (HU4): cierre de la consulta, con confirmación en dos pasos.
 * Solo presentación.
 *
 * Propiedad `modelo` (congelado, lo arma <vista-consulta>): { motivo, confirmando, accion }.
 * Emite (bubbles, composed): 'cerrar' { observaciones }, 'confirmar', 'cancelar'.
 */
import { Plantilla } from "../../plantilla.js";
import { ControladorConsulta } from "../../../control/controladores/controlador_consulta.js";
import { ComponenteChivoMed } from "../componente_chivomed.js";

const PLANTILLA = new Plantilla(`
<section class="panel panel-cierre" aria-labelledby="titulo">
  <h2 id="titulo">Cerrar consulta</h2>
  <p class="indicaciones">Ya no quedan pasos pendientes. Al cerrarla, la consulta queda en solo lectura.</p>
  <div class="campo">
    <label for="observaciones">Observaciones (opcional)</label>
    <textarea id="observaciones" rows="3" maxlength="255" aria-describedby="contador-observaciones"></textarea>
    <p class="indicaciones" id="contador-observaciones" aria-live="polite"></p>
  </div>
  <button class="boton boton-principal" id="cerrar" type="button" aria-describedby="motivo-cierre">Cerrar consulta</button>
  <p class="motivo" id="motivo-cierre" hidden></p>
  <div class="confirmacion" id="confirmacion" role="group" aria-labelledby="texto-confirmacion" hidden>
    <p id="texto-confirmacion">¿Cerrar la consulta? Después ya no se podrán registrar pasos ni órdenes.</p>
    <div class="acciones-paso">
      <button class="boton boton-principal" id="confirmar" type="button">Confirmar cierre</button>
      <button class="boton boton-secundario" id="cancelar" type="button">Cancelar</button>
    </div>
  </div>
</section>`);

class PanelCierreConsulta extends ComponenteChivoMed {
    #alCerrar = () => this.emitir("cerrar", { observaciones: this.$("observaciones").value });
    #alConfirmar = () => this.emitir("confirmar");
    #alCancelar = () => this.emitir("cancelar");
    #alEscribir = () => { this.$("contador-observaciones").textContent = ControladorConsulta.textoContador(this.$("observaciones").value); };

    connectedCallback() {
        this.montar(PLANTILLA, "vistas.css", "consulta.css");
        this.escuchar(this.$("cerrar"), "click", this.#alCerrar);
        this.escuchar(this.$("confirmar"), "click", this.#alConfirmar);
        this.escuchar(this.$("cancelar"), "click", this.#alCancelar);
        this.escuchar(this.$("observaciones"), "input", this.#alEscribir);
        this.#alEscribir();
        this.pintar();
    }

    disconnectedCallback() {
        this.dejarDeEscuchar();
    }

    /** Lleva el foco a la confirmación o, al cancelarla, de vuelta al botón. */
    enfocar(destino = "cerrar") {
        this.$?.(destino === "confirmacion" ? "confirmar" : "cerrar")?.focus();
    }

    pintar() {
        const m = this.modelo;
        if (!m) return;
        const cerrando = m.accion === "cierre";
        this.$("cerrar").disabled = Boolean(m.motivo) || Boolean(m.confirmando);
        this.$("cerrar").textContent = cerrando ? "Cerrando…" : "Cerrar consulta";
        this.$("motivo-cierre").hidden = !m.motivo || Boolean(m.accion);
        this.$("motivo-cierre").textContent = m.motivo ?? "";
        this.$("confirmacion").hidden = !m.confirmando;
        if (m.motivo) this.$("observaciones").setAttribute("readonly", "");
        else this.$("observaciones").removeAttribute("readonly");
        this.setAttribute("aria-busy", String(cerrando));
    }
}

customElements.define("panel-cierre-consulta", PanelCierreConsulta);
export default PanelCierreConsulta;
