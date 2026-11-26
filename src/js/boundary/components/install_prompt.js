/**
 * <install-prompt>: botón para instalar la PWA.
 * Visible solo cuando el navegador ofrece la instalación (beforeinstallprompt); se oculta si la app
 * ya está instalada o cuando se instala (appinstalled). La lógica vive en ControladorInstalacion.
 * Se suscribe a su estado reactivo al conectarse y cancela al desconectarse.
 * Acepta `controlador` asignado antes de conectarse (pruebas); si no, crea uno por conexión.
 * Escucha EVENTO_OFRECER en document (solo lo emite la apertura de la ventana del ticket en
 * vista_citas.js; buscar citas y el login ya no invitan, por decisión del equipo) y pide al
 * controlador que invite a instalar (cada vez, hasta que la app se instale). Con `invitacion` abre su <dialog> modal
 * (showModal); al cerrarse devuelve el foco a donde estaba. Con beforeinstallprompt muestra
 * "Instalar" (llama a prompt() en ese clic, foco inicial) y "Ahora no"; con `instrucciones`, el texto
 * para instalar desde el menú del navegador y un solo botón "Entendido" (foco inicial). "Ahora no",
 * "Entendido", Esc o clic fuera la cierran solo esa vez. El botón "Instalar app" no cambia.
 * Escucha también EVENTO_INSTALAR (lo emite la búsqueda de citas al descargar un ticket, después de
 * entregar el PDF) y llama a ofrecerAlDescargar() dentro de ese mismo toque.
 * Si su ventana se abre encima de otra (la del ticket), Esc cierra solo esta, y al cerrarla el foco
 * vuelve al elemento de la otra ventana que lo tenía.
 */
import { ControladorInstalacion, EVENTO_OFRECER, EVENTO_INSTALAR } from "../../control/controlador_instalacion.js";
import { Plantilla } from "../plantilla.js";
import { ComponenteChivoMed } from "./componente_chivomed.js";

const TEXTO_INVITACION = "¿Quieres instalar ChivoMed en este dispositivo? Podrás abrirla como una aplicación y consultar tus datos guardados sin conexión.";
const TEXTO_INSTRUCCIONES = "Para instalar ChivoMed, abre el menú del navegador y elige Instalar ChivoMed o Agregar a la pantalla de inicio.";

const PLANTILLA = new Plantilla(`
<button class="instalar" id="instalar" type="button" hidden>
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14"/></svg>
  <span>Instalar app</span>
</button>
<p class="solo-lectores" id="estado" role="status" aria-live="polite"></p>
<dialog class="invitacion" id="invitacion" aria-labelledby="invitacion-titulo" aria-describedby="invitacion-texto">
  <div class="invitacion-cuerpo">
    <h2 class="invitacion-titulo" id="invitacion-titulo">Instalar ChivoMed</h2>
    <p class="invitacion-texto" id="invitacion-texto">¿Quieres instalar ChivoMed en este dispositivo? Podrás abrirla como una aplicación y consultar tus datos guardados sin conexión.</p>
    <div class="invitacion-acciones">
      <button class="accion accion-secundaria" id="invitacion-no" type="button">Ahora no</button>
      <button class="accion accion-principal" id="invitacion-instalar" type="button" autofocus>Instalar</button>
      <button class="accion accion-principal" id="invitacion-entendido" type="button" hidden>Entendido</button>
    </div>
  </div>
</dialog>`);

class InstallPrompt extends ComponenteChivoMed {
    #controlador = null;
    #inyectado = null;
    #cancelar = null;
    #alPulsar = () => this.#controlador.instalar();
    #alOfrecer = () => this.#controlador.invitar();
    #alInstalarAlDescargar = () => this.#controlador.ofrecerAlDescargar();
    #alAceptar = () => this.#controlador.aceptarInvitacion();
    #alRechazar = () => this.#controlador.cerrarInvitacion();
    /** Esc (o cualquier cierre que no pasó por el controlador) la cierra esa vez. */
    #alCerrarDialogo = () => { if (this.#controlador.estado.invitacion) this.#controlador.cerrarInvitacion(); };
    /** El cuerpo llena la ventana: un clic cuyo destino es el <dialog> mismo cayó en el fondo. */
    #alClicDialogo = event => { if (event.target === this.$("invitacion")) this.#controlador.cerrarInvitacion(); };

    /** Controlador inyectado; solo se puede asignar antes de conectar el componente. */
    set controlador(valor) {
        if (this.#cancelar) throw new Error("El controlador se asigna antes de conectar el componente.");
        this.#inyectado = valor;
    }

    get controlador() { return this.#controlador ?? this.#inyectado; }

    connectedCallback() {
        this.montar(PLANTILLA, "pwa.css");
        this.#controlador = this.#inyectado ?? new ControladorInstalacion({ ventana: window });
        this.#cancelar = this.#controlador.suscribir((_cambios, estado) => this.#pintar(estado));
        this.escuchar(this.$("instalar"), "click", this.#alPulsar);
        this.escuchar(this.$("invitacion-instalar"), "click", this.#alAceptar);
        this.escuchar(this.$("invitacion-no"), "click", this.#alRechazar);
        this.escuchar(this.$("invitacion-entendido"), "click", this.#alRechazar);
        this.escuchar(this.$("invitacion"), "close", this.#alCerrarDialogo);
        this.escuchar(this.$("invitacion"), "click", this.#alClicDialogo);
        this.escuchar(document, EVENTO_OFRECER, this.#alOfrecer);
        this.escuchar(document, EVENTO_INSTALAR, this.#alInstalarAlDescargar);
        this.#controlador.iniciar();
        this.#pintar(this.#controlador.estado);
    }

    disconnectedCallback() {
        this.dejarDeEscuchar();
        this.#cancelar?.();
        this.#cancelar = null;
        this.#controlador?.detener();
    }

    #pintar(estado) {
        const boton = this.$("instalar");
        boton.hidden = estado.modo !== ControladorInstalacion.MODOS.DISPONIBLE && estado.modo !== ControladorInstalacion.MODOS.INSTALANDO;
        boton.disabled = estado.modo === ControladorInstalacion.MODOS.INSTALANDO;
        this.$("estado").textContent = estado.mensaje ?? "";
        this.#pintarInvitacion(estado.invitacion, estado.instrucciones);
    }

    #pintarInvitacion(abierta, instrucciones) {
        const dialogo = this.$("invitacion");
        if (abierta && !dialogo.open) {
            this.$("invitacion-texto").textContent = instrucciones ? TEXTO_INSTRUCCIONES : TEXTO_INVITACION;
            this.$("invitacion-instalar").hidden = instrucciones;
            this.$("invitacion-no").hidden = instrucciones;
            this.$("invitacion-entendido").hidden = !instrucciones;
            dialogo.showModal();
            this.$(instrucciones ? "invitacion-entendido" : "invitacion-instalar").focus();
        } else if (!abierta && dialogo.open) {
            dialogo.close();
        }
    }
}

customElements.define("install-prompt", InstallPrompt);
export default InstallPrompt;
