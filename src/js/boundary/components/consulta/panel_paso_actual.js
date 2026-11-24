/**
 * <panel-paso-actual> (HU4): el paso PENDIENTE que se atiende. Solo presentación.
 *
 * Propiedad `modelo` (congelado, lo arma <vista-consulta>):
 *   { paso, procedimiento, pendientes: [{ paso, procedimiento }], indicaFin, borrador, editable,
 *     aviso, motivo, ofrecerRetroceso, motivoRetroceso, confirmando, accion }
 * Emite (bubbles, composed): 'cambiar-borrador' { valor }, 'avanzar', 'retroceder', 'confirmar',
 * 'cancelar', 'elegir-paso' { idPaso }.
 * El texto que se escribe no se pisa: el campo solo se actualiza si el borrador del modelo cambió
 * por otra razón (precarga de un paso reabierto, cambio de paso).
 */
import { Plantilla } from "../../plantilla.js";
import { FechasSV } from "../../../control/fechas_sv.js";
import { ComponenteChivoMed } from "../componente_chivomed.js";

const PLANTILLA = new Plantilla(`
<section class="panel" aria-labelledby="titulo">
  <h2 id="titulo" tabindex="-1">Paso actual</h2>
  <fieldset class="selector-pasos" id="selector" hidden>
    <legend>Hay varios pasos pendientes. Elige cuál atender:</legend>
    <div class="opciones-pasos" id="opciones"></div>
  </fieldset>
  <p class="vacio" id="sin-paso" hidden>No quedan pasos pendientes en esta consulta.</p>
  <div class="contenido-paso" id="contenido">
    <div class="encabezado-paso">
      <h3 id="nombre"></h3>
      <p class="meta" id="procedimiento"></p>
      <p class="meta" id="responsable"></p>
      <p class="meta" id="desde"></p>
    </div>
    <p class="aviso" id="aviso" role="status" hidden></p>
    <div class="campo">
      <label for="valor">Atención brindada</label>
      <textarea id="valor" rows="6" aria-describedby="ayuda-valor"></textarea>
      <p class="indicaciones" id="ayuda-valor">Se guarda al completar el paso.</p>
    </div>
    <div class="acciones-paso">
      <button class="boton boton-principal" id="avanzar" type="button" aria-describedby="motivo">Avanzar</button>
      <button class="boton boton-secundario" id="retroceder" type="button" aria-describedby="motivo" hidden>Retroceder al paso anterior</button>
    </div>
    <p class="motivo" id="motivo" hidden></p>
    <div class="confirmacion" id="confirmacion" role="group" aria-labelledby="texto-confirmacion" hidden>
      <p id="texto-confirmacion">Se descartará lo que escribiste en este paso. ¿Retroceder de todos modos?</p>
      <div class="acciones-paso">
        <button class="boton boton-principal" id="confirmar" type="button">Retroceder</button>
        <button class="boton boton-secundario" id="cancelar" type="button">Cancelar</button>
      </div>
    </div>
  </div>
</section>`);

class PanelPasoActual extends ComponenteChivoMed {
    #pintado = null;
    #alEscribir = () => this.emitir("cambiar-borrador", { valor: this.$("valor").value });
    #alAvanzar = () => this.emitir("avanzar");
    #alRetroceder = () => this.emitir("retroceder");
    #alConfirmar = () => this.emitir("confirmar");
    #alCancelar = () => this.emitir("cancelar");

    connectedCallback() {
        this.montar(PLANTILLA, "vistas.css", "consulta.css");
        this.$("valor").addEventListener("input", this.#alEscribir);
        this.$("avanzar").addEventListener("click", this.#alAvanzar);
        this.$("retroceder").addEventListener("click", this.#alRetroceder);
        this.$("confirmar").addEventListener("click", this.#alConfirmar);
        this.$("cancelar").addEventListener("click", this.#alCancelar);
        this.#pintado = null;
        this.pintar();
    }

    disconnectedCallback() {
        this.$("valor").removeEventListener("input", this.#alEscribir);
        this.$("avanzar").removeEventListener("click", this.#alAvanzar);
        this.$("retroceder").removeEventListener("click", this.#alRetroceder);
        this.$("confirmar").removeEventListener("click", this.#alConfirmar);
        this.$("cancelar").removeEventListener("click", this.#alCancelar);
    }

    /** Lleva el foco al título del paso (tras avanzar o retroceder) o a la confirmación. */
    enfocar(destino = "titulo") {
        this.$?.(destino === "confirmacion" ? "confirmar" : "titulo")?.focus();
    }

    pintar() {
        const m = this.modelo;
        const antes = this.#pintado;
        this.#pintado = m;
        if (!m) return;
        const paso = m.paso;
        this.$("sin-paso").hidden = Boolean(paso);
        this.$("contenido").hidden = !paso;
        if (antes?.pendientes !== m.pendientes || antes?.paso !== paso) this.#pintarSelector(m);
        if (!paso) return;

        if (antes?.paso !== paso) {
            this.$("nombre").textContent = paso.nombre;
            this.$("procedimiento").textContent = m.procedimiento ? `Procedimiento: ${m.procedimiento}` : "";
            this.$("responsable").textContent = paso.responsable
                ? `Responsable: ${[paso.responsable.nombre, paso.responsable.rol].filter(Boolean).join(" · ")}` : "Sin responsable asignado";
            this.$("desde").textContent = paso.fechaInicio ? `Pendiente desde ${FechasSV.formatearFechaHora(paso.fechaInicio)}` : "";
        }
        // No se pisa lo que el usuario escribe: solo si el modelo trae otro texto.
        if (this.$("valor").value !== m.borrador) this.$("valor").value = m.borrador;
        if (m.editable) this.$("valor").removeAttribute("readonly");
        else this.$("valor").setAttribute("readonly", "");
        this.$("aviso").hidden = !m.aviso;
        this.$("aviso").textContent = m.aviso ?? "";

        const avanzando = m.accion === "avanzar";
        this.$("avanzar").textContent = avanzando ? "Guardando…" : (m.indicaFin ? "Completar paso" : "Avanzar");
        this.$("avanzar").disabled = Boolean(m.motivo);
        this.$("retroceder").hidden = !m.ofrecerRetroceso;
        this.$("retroceder").textContent = m.accion === "retroceder" ? "Retrocediendo…" : "Retroceder al paso anterior";
        this.$("retroceder").disabled = Boolean(m.motivo || m.motivoRetroceso);
        // El motivo general (sin red, otro rol) explica los dos botones; si no hay, se explica por qué
        // no se puede retroceder. Durante una acción el texto del botón ya dice qué pasa.
        const motivo = m.motivo ?? (m.ofrecerRetroceso ? m.motivoRetroceso : null);
        this.$("motivo").hidden = !motivo || Boolean(m.accion);
        this.$("motivo").textContent = motivo ?? "";
        this.$("confirmacion").hidden = !m.confirmando;
        this.setAttribute("aria-busy", String(m.accion === "avanzar" || m.accion === "retroceder"));
    }

    #pintarSelector(m) {
        const varios = m.pendientes.length > 1;
        this.$("selector").hidden = !varios;
        if (!varios) {
            this.$("opciones").replaceChildren();
            return;
        }
        const actual = m.paso?.idConsultaProcedimientoPaso;
        this.$("opciones").replaceChildren(...m.pendientes.map(({ paso, procedimiento }) => {
            const etiqueta = document.createElement("label");
            etiqueta.className = "opcion-paso";
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = "paso";
            radio.value = paso.idConsultaProcedimientoPaso;
            radio.addEventListener("change", () => { if (radio.checked) this.emitir("elegir-paso", { idPaso: radio.value }); });
            const texto = document.createElement("span");
            texto.textContent = `${paso.nombre} · ${procedimiento}`;
            etiqueta.append(radio, texto);
            radio.checked = paso.idConsultaProcedimientoPaso === actual;
            return etiqueta;
        }));
    }
}

customElements.define("panel-paso-actual", PanelPasoActual);
export default PanelPasoActual;
