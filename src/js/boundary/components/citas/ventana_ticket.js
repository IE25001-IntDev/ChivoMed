/**
 * <ventana-ticket> (HU1): ventana modal (<dialog> con showModal) que muestra el PDF del ticket de una
 * cita dentro de la página. Solo presentación: la abre y la cierra la propiedad `modelo`.
 *
 * `modelo` = { abierto, cita, ticket, motivo }:
 *  - `abierto`: true o false; cerrada, el resto puede faltar.
 *  - `cita`: { idConsulta, fechaInicio, nombreClinica }.
 *  - `ticket`: null o { estado, archivo, error, descargado }; `estado` es "descargando", "listo" o
 *    "error"; `archivo` es { blob, nombre } y solo está con "listo".
 *  - `motivo`: null o el texto que explica por qué no se puede pedir el PDF ahora (sin red, límite).
 *
 * Con el PDF cargado ("listo"), lo muestra en un <iframe> con una URL blob: que se libera al cerrar
 * o al cambiar el archivo. Si el navegador no puede mostrar un PDF dentro de la página
 * (navigator.pdfViewerEnabled no es true, p. ej. Chrome de Android), muestra "No se puede mostrar
 * el ticket aquí" y el botón de descarga, en vez de quedar en blanco. `visorPdf` (boolean) permite
 * fijarlo en las pruebas.
 *
 * Emite (bubbles, composed):
 *  - 'descargar-pdf' { idConsulta }: botón "Descargar PDF".
 *  - 'cerrar-ticket' { idConsulta }: botón "Cerrar" o la X, Esc (evento close del <dialog>) o clic fuera.
 * El foco inicial va a la X; devolverlo al botón "Ver ticket" al cerrar le toca a la vista.
 * Los datos van con textContent.
 */
import { Plantilla } from "../../plantilla.js";
import { FechasSV } from "../../../control/fechas_sv.js";
import { ComponenteChivoMed } from "../componente_chivomed.js";

export const TEXTOS = Object.freeze({
    cargando: "Cargando el ticket…",
    noVisible: "No se puede mostrar el ticket aquí.",
    noVisibleAyuda: "Descarga el PDF para verlo en tu dispositivo.",
    descargado: "PDF descargado.",
});

const PLANTILLA = new Plantilla(`
<dialog class="invitacion ventana-ticket" id="ventana" aria-labelledby="titulo" aria-describedby="detalle">
  <div class="invitacion-cuerpo ticket-cuerpo">
    <div class="ticket-encabezado">
      <h2 class="invitacion-titulo" id="titulo">Ticket de la cita</h2>
      <button class="cerrar-ventana" id="cerrar-x" type="button" aria-label="Cerrar ticket" autofocus>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
    </div>
    <p class="invitacion-texto" id="detalle"></p>
    <div class="ticket-visor" id="visor">
      <p class="ticket-aviso" id="cargando" role="status">Cargando el ticket…</p>
      <iframe class="ticket-pdf" id="pdf" title="Ticket de la cita en PDF" hidden></iframe>
      <div class="ticket-aviso" id="no-visible" hidden>
        <p class="ticket-aviso-titulo">No se puede mostrar el ticket aquí.</p>
        <p class="invitacion-texto">Descarga el PDF para verlo en tu dispositivo.</p>
      </div>
      <p class="ticket-aviso error-campo" id="error" role="alert" hidden></p>
    </div>
    <p class="estado-ticket" id="estado" role="status"></p>
    <div class="invitacion-acciones">
      <button class="accion accion-secundaria" id="cerrar" type="button">Cerrar</button>
      <button class="accion accion-principal" id="descargar" type="button">Descargar PDF</button>
    </div>
  </div>
</dialog>`);

class VentanaTicket extends ComponenteChivoMed {
    /** URL blob: del PDF que muestra el iframe, y el Blob del que salió. */
    #url = null;
    #blob = null;
    #alCerrar = () => this.#emitir("cerrar-ticket");
    #alDescargar = () => {
        if (this.$("descargar").disabled) return;
        this.#emitir("descargar-pdf");
    };
    /**
     * Esc (o cualquier cierre que no pidió el modelo) se avisa como cerrar. El evento close llega en
     * otra tarea: si para entonces la ventana ya se abrió de nuevo, es de un cierre anterior y se ignora.
     */
    #alCerrarDialogo = () => {
        if (this.modelo.abierto && !this.$("ventana").open) this.#emitir("cerrar-ticket");
    };
    /** El cuerpo llena la ventana: un clic cuyo destino es el <dialog> mismo cayó en el fondo. */
    #alClicDialogo = event => { if (event.target === this.$("ventana")) this.#emitir("cerrar-ticket"); };

    /** Si el navegador puede mostrar un PDF en la página; por defecto, navigator.pdfViewerEnabled. */
    visorPdf = VentanaTicket.detectarVisorPdf();

    constructor() {
        super(Object.freeze({ abierto: false }));
    }

    connectedCallback() {
        this.montar(PLANTILLA, "vistas.css", "pwa.css", "citas.css");
        this.escuchar(this.$("cerrar-x"), "click", this.#alCerrar);
        this.escuchar(this.$("cerrar"), "click", this.#alCerrar);
        this.escuchar(this.$("descargar"), "click", this.#alDescargar);
        this.escuchar(this.$("ventana"), "close", this.#alCerrarDialogo);
        this.escuchar(this.$("ventana"), "click", this.#alClicDialogo);
        this.pintar();
    }

    disconnectedCallback() {
        this.dejarDeEscuchar();
        this.#soltarPdf();
    }

    #emitir(tipo) {
        const idConsulta = this.modelo.cita?.idConsulta;
        if (!this.modelo.abierto || !idConsulta) return;
        this.emitir(tipo, { idConsulta });
    }

    pintar() {
        const { abierto, cita = null, ticket = null, motivo = null } = this.modelo;
        const dialogo = this.$("ventana");
        if (!abierto || !cita) {
            this.#soltarPdf();
            if (dialogo.open) dialogo.close();
            return;
        }
        this.$("detalle").textContent = [FechasSV.formatearFechaHora(cita.fechaInicio), cita.nombreClinica].filter(Boolean).join(" · ");
        const estado = ticket?.estado ?? null;
        const listo = estado === "listo" && Boolean(ticket.archivo?.blob);
        const mostrar = listo && this.visorPdf === true;
        const error = estado === "error" ? ticket.error : !listo && estado !== "descargando" ? motivo : null;

        this.$("cargando").hidden = estado !== "descargando";
        this.$("cargando").textContent = estado === "descargando" ? TEXTOS.cargando : "";
        this.$("no-visible").hidden = !listo || mostrar;
        this.$("error").hidden = !error;
        this.$("error").textContent = error ?? "";
        this.$("visor").setAttribute("aria-busy", String(estado === "descargando"));
        if (mostrar) this.#mostrarPdf(ticket.archivo.blob);
        else this.#soltarPdf();

        const descargar = this.$("descargar");
        descargar.disabled = estado === "descargando" || (!listo && Boolean(motivo));
        this.$("estado").textContent = listo && ticket.descargado ? TEXTOS.descargado : "";

        if (!dialogo.open) dialogo.showModal();
    }

    #mostrarPdf(blob) {
        const iframe = this.$("pdf");
        if (this.#blob !== blob) {
            this.#soltarPdf();
            this.#blob = blob;
            this.#url = URL.createObjectURL(blob);
            iframe.setAttribute("src", this.#url);
        }
        iframe.hidden = false;
    }

    /** Quita el PDF del iframe y libera su URL blob:. */
    #soltarPdf() {
        const iframe = this.$("pdf");
        if (iframe) {
            iframe.hidden = true;
            iframe.removeAttribute("src");
        }
        if (this.#url) URL.revokeObjectURL(this.#url);
        this.#url = null;
        this.#blob = null;
    }

    /** true si el navegador dice que puede mostrar un PDF dentro de la página. */
    static detectarVisorPdf(navegador = globalThis.navigator) {
        return navegador?.pdfViewerEnabled === true;
    }
}

customElements.define("ventana-ticket", VentanaTicket);
export default VentanaTicket;
