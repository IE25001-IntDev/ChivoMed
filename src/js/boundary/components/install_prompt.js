/**
 * <install-prompt>: botón para instalar la PWA.
 * Visible solo cuando el navegador ofrece la instalación (beforeinstallprompt); se oculta si la app
 * ya está instalada o cuando se instala (appinstalled). La lógica vive en ControladorInstalacion.
 * Se suscribe a su estado reactivo al conectarse y cancela al desconectarse.
 * Acepta `controlador` asignado antes de conectarse (pruebas); si no, crea uno por conexión.
 * Escucha EVENTO_OFRECER en document (lo emiten la búsqueda de citas y el login) y pide al
 * controlador que invite a instalar una sola vez por sesión. Con `invitacion` abre su <dialog> modal
 * (showModal); al cerrarse devuelve el foco a donde estaba. Con beforeinstallprompt muestra
 * "Instalar" (llama a prompt() en ese clic, foco inicial) y "Ahora no"; con `instrucciones`, el texto
 * para instalar desde el menú del navegador y un solo botón "Entendido" (foco inicial). "Ahora no",
 * "Entendido", Esc o clic fuera cuentan como rechazo de la sesión. El botón "Instalar app" no cambia.
 */
import { ControladorInstalacion, MODOS, EVENTO_OFRECER, DEPURAR } from "../pwa/controlador_instalacion.js";
import { hojaDeEstilos } from "../vistas/estilos.js";
import { plantilla } from "../plantilla.js";

const TEXTO_INVITACION = "¿Quieres instalar ChivoMed en este dispositivo? Podrás abrirla como una aplicación y consultar tus datos guardados sin conexión.";
const TEXTO_INSTRUCCIONES = "Para instalar ChivoMed, abre el menú del navegador y elige Instalar ChivoMed o Agregar a la pantalla de inicio.";

const PLANTILLA = plantilla(`
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

class InstallPrompt extends HTMLElement {
    #controlador = null;
    #inyectado = null;
    #cancelar = null;
    #alPulsar = () => this.#controlador.instalar();
    #alOfrecer = () => {
        console.debug(DEPURAR, "ofrecer-instalacion recibido"); // TEMPORAL (diagnóstico)
        this.#controlador.ofrecerUnaVez();
    };
    #alAceptar = () => this.#controlador.aceptarInvitacion();
    #alRechazar = () => this.#controlador.rechazarInvitacion();
    /** Esc (o cualquier cierre que no pasó por el controlador) cuenta como rechazo. */
    #alCerrarDialogo = () => { if (this.#controlador.estado.invitacion) this.#controlador.rechazarInvitacion(); };
    /** El cuerpo llena la ventana: un clic cuyo destino es el <dialog> mismo cayó en el fondo. */
    #alClicDialogo = event => { if (event.target === this.shadowRoot.getElementById("invitacion")) this.#controlador.rechazarInvitacion(); };
    /** Elemento con el foco antes de abrir la ventana, para devolvérselo al cerrarla. */
    #focoPrevio = null;

    /** Controlador inyectado; solo se puede asignar antes de conectar el componente. */
    set controlador(valor) {
        if (this.#cancelar) throw new Error("El controlador se asigna antes de conectar el componente.");
        this.#inyectado = valor;
    }

    get controlador() { return this.#controlador ?? this.#inyectado; }

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
    }

    connectedCallback() {
        if (!this.shadowRoot.childElementCount) {
            this.shadowRoot.append(hojaDeEstilos("pwa.css"), PLANTILLA.clonar());
        }
        this.#controlador = this.#inyectado ?? new ControladorInstalacion({ ventana: window });
        this.#cancelar = this.#controlador.suscribir((_cambios, estado) => this.#pintar(estado));
        this.shadowRoot.getElementById("instalar").addEventListener("click", this.#alPulsar);
        this.#escucharDialogo("addEventListener");
        document.addEventListener(EVENTO_OFRECER, this.#alOfrecer);
        this.#controlador.iniciar();
        this.#pintar(this.#controlador.estado);
    }

    disconnectedCallback() {
        this.shadowRoot.getElementById("instalar").removeEventListener("click", this.#alPulsar);
        this.#escucharDialogo("removeEventListener");
        document.removeEventListener(EVENTO_OFRECER, this.#alOfrecer);
        this.#cancelar?.();
        this.#cancelar = null;
        this.#controlador?.detener();
    }

    #escucharDialogo(metodo) {
        const $ = id => this.shadowRoot.getElementById(id);
        $("invitacion-instalar")[metodo]("click", this.#alAceptar);
        $("invitacion-no")[metodo]("click", this.#alRechazar);
        $("invitacion-entendido")[metodo]("click", this.#alRechazar);
        $("invitacion")[metodo]("close", this.#alCerrarDialogo);
        $("invitacion")[metodo]("click", this.#alClicDialogo);
    }

    #pintar(estado) {
        const boton = this.shadowRoot.getElementById("instalar");
        boton.hidden = estado.modo !== MODOS.DISPONIBLE && estado.modo !== MODOS.INSTALANDO;
        boton.disabled = estado.modo === MODOS.INSTALANDO;
        this.shadowRoot.getElementById("estado").textContent = estado.mensaje ?? "";
        this.#pintarInvitacion(estado.invitacion, estado.instrucciones);
    }

    #pintarInvitacion(abierta, instrucciones) {
        const $ = id => this.shadowRoot.getElementById(id);
        const dialogo = $("invitacion");
        if (abierta && !dialogo.open) {
            $("invitacion-texto").textContent = instrucciones ? TEXTO_INSTRUCCIONES : TEXTO_INVITACION;
            $("invitacion-instalar").hidden = instrucciones;
            $("invitacion-no").hidden = instrucciones;
            $("invitacion-entendido").hidden = !instrucciones;
            this.#focoPrevio = focoProfundo();
            console.debug(DEPURAR, "showModal()"); // TEMPORAL (diagnóstico)
            dialogo.showModal();
            $(instrucciones ? "invitacion-entendido" : "invitacion-instalar").focus();
        } else if (!abierta) {
            if (dialogo.open) dialogo.close();
            const previo = this.#focoPrevio;
            this.#focoPrevio = null;
            if (previo && previo.isConnected !== false) previo.focus?.();
        }
    }
}

/** El elemento con el foco, atravesando los Shadow DOM abiertos. */
function focoProfundo() {
    let actual = document.activeElement;
    while (actual?.shadowRoot?.activeElement) actual = actual.shadowRoot.activeElement;
    return actual;
}

customElements.define("install-prompt", InstallPrompt);
export default InstallPrompt;
