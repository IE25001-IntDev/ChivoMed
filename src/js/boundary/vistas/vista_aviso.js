/**
 * <vista-aviso>: tarjeta con un título, un texto y una acción. Reemplaza a <vista-no-encontrada> y
 * <vista-sin-conexion> y también es la caja de error de <app-shell>.
 * La configuración ({ titulo, texto, accion, destino, etiqueta, alerta }) sale de:
 *  - `contexto.ruta.aviso`, cuando el router la monta como vista de una ruta (RUTA_NO_ENCONTRADA y
 *    RUTA_SIN_CONEXION de rutas.js), o
 *  - la propiedad `aviso`, que asigna <app-shell> (tiene prioridad). Al asignarla se pinta en el acto, para que
 *    el shell pueda llevar el foco a su <h1> en cuanto la inserta.
 * Campos:
 *  - `texto`: un texto, o un arreglo de partes donde RUTA_PEDIDA se pinta como <code id="ruta"> con la
 *    dirección pedida. Todo se pinta con textContent: la ruta viene de la URL y el texto del error puede
 *    venir del servidor; nunca se interpretan como HTML.
 *  - `accion: "enlace"`: un enlace a `#destino` con el texto `etiqueta`.
 *  - `accion: "reintentar"`: un botón (por defecto "Volver a intentar"). No se deshabilita sin red:
 *    navigator.onLine puede equivocarse. Al pulsarlo:
 *      · montada por el router (con `contexto`), emite 'navegar' { ruta } con la ruta pedida y su query;
 *      · sin `contexto` (caja de error del shell), emite 'reintentar' y el shell vuelve a procesar la ruta.
 *    Los dos eventos tienen bubbles y composed.
 *  - `alerta: true`: la tarjeta lleva role="alert".
 */
import { Estilos } from "../estilos.js";
import { RUTA_PEDIDA } from "../rutas.js";
import { Plantilla } from "../plantilla.js";

const PLANTILLA = new Plantilla(`
<section class="tarjeta tarjeta-estrecha" aria-labelledby="titulo">
  <h1 id="titulo" tabindex="-1"></h1>
  <p class="subtitulo" id="detalle"></p>
</section>`);

const ETIQUETA_REINTENTAR = "Volver a intentar";

class VistaAviso extends HTMLElement {
    /** Botón de "reintentar" pintado, para dejar de escucharlo al desconectarse. */
    #boton = null;
    #aviso = null;
    #alReintentar = () => this.#reintentar();
    /** Contexto del router: { ruta, path, query, rutaPedida, ... }. */
    contexto = null;

    constructor() {
        super();
        this.attachShadow({ mode: "open" });
    }

    /** Configuración directa (caja de error del shell); si es null, se usa `contexto.ruta.aviso`. */
    get aviso() {
        return this.#aviso;
    }

    set aviso(valor) {
        this.#aviso = valor ?? null;
        if (this.#aviso) this.#pintar(this.#aviso);
    }

    connectedCallback() {
        this.#pintar(this.#aviso ?? this.contexto?.ruta?.aviso ?? {});
    }

    disconnectedCallback() {
        this.#boton?.removeEventListener("click", this.#alReintentar);
    }

    #pintar({ titulo = "", texto = "", accion = null, destino = "", etiqueta = null, alerta = false }) {
        const raiz = this.shadowRoot;
        if (!raiz.childElementCount) {
            raiz.append(Estilos.hojaDeEstilos("vistas.css"), PLANTILLA.clonar());
        }
        const seccion = raiz.querySelector("section");
        const h1 = raiz.getElementById("titulo");
        const detalle = raiz.getElementById("detalle");
        if (alerta) seccion.setAttribute("role", "alert");
        else seccion.removeAttribute("role");
        h1.textContent = titulo;
        detalle.replaceChildren(...this.#partes(texto));

        this.#boton?.removeEventListener("click", this.#alReintentar);
        this.#boton = null;
        const control = this.#crearAccion(accion, destino, etiqueta);
        seccion.replaceChildren(...[h1, detalle, control].filter(Boolean));
    }

    /** Nodos del párrafo: texto plano y, en lugar de RUTA_PEDIDA, un <code> con la dirección pedida. */
    #partes(texto) {
        const partes = Array.isArray(texto) ? texto : [texto];
        return partes.map(parte => {
            if (parte !== RUTA_PEDIDA) return String(parte); // replaceChildren lo agrega como nodo de texto.
            const codigo = document.createElement("code");
            codigo.id = "ruta";
            codigo.textContent = `#${this.contexto?.path ?? ""}`;
            return codigo;
        });
    }

    #crearAccion(accion, destino, etiqueta) {
        if (accion === "enlace") {
            const enlace = document.createElement("a");
            enlace.className = "boton boton-principal";
            enlace.setAttribute("href", `#${destino}`);
            enlace.textContent = etiqueta ?? "";
            return enlace;
        }
        if (accion === "reintentar") {
            const boton = document.createElement("button");
            boton.className = "boton boton-principal";
            boton.id = "reintentar";
            boton.type = "button";
            boton.textContent = etiqueta ?? ETIQUETA_REINTENTAR;
            boton.addEventListener("click", this.#alReintentar);
            this.#boton = boton;
            return boton;
        }
        return null;
    }

    #reintentar() {
        if (!this.contexto) {
            this.dispatchEvent(new CustomEvent("reintentar", { bubbles: true, composed: true }));
            return;
        }
        const { path = "/", query } = this.contexto;
        const ruta = query?.size ? `${path}?${query}` : path;
        this.dispatchEvent(new CustomEvent("navegar", { bubbles: true, composed: true, detail: { ruta } }));
    }
}

customElements.define("vista-aviso", VistaAviso);
export default VistaAviso;
