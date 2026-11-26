import { Estilos } from "../estilos.js";

/**
 * Base de todos los Web Components de ChivoMed (vistas y componentes): reúne el esqueleto que se
 * repetía en cada uno.
 *  - El constructor abre el Shadow DOM (modo "open").
 *  - `montar(plantilla, ...hojas)` clona la plantilla fija con sus hojas de resources/ una sola vez:
 *    al reconectarse no se duplica. Devuelve true solo la vez que montó, para lo que se prepara
 *    una única vez (p. ej. un escuchador sobre un nodo de la plantilla).
 *  - `$(id)` busca por id dentro del Shadow DOM.
 *  - `emitir(tipo, detalle)` avisa hacia arriba con un CustomEvent que burbujea y cruza el Shadow DOM.
 *  - `modelo`: lo que pinta el componente. Al asignarlo se repinta con `pintar()` si está conectado;
 *    null o undefined vuelven al modelo vacío que la subclase pasa al constructor.
 * Los datos se pintan con textContent, atributos o propiedades; innerHTML solo con Plantilla.
 */
export class ComponenteChivoMed extends HTMLElement {
    #modelo;
    #modeloVacio;
    #escuchas = null;
    #controlador = null;

    /** @param modeloVacio valor de `modelo` al crearse y al asignarle null (por defecto null). */
    constructor(modeloVacio = null) {
        super();
        this.attachShadow({ mode: "open" });
        this.#modeloVacio = modeloVacio;
        this.#modelo = modeloVacio;
    }

    get modelo() {
        return this.#modelo;
    }

    set modelo(valor) {
        this.#modelo = valor ?? this.#modeloVacio;
        if (this.isConnected) this.pintar();
    }

    inyectarControlador(controlador) {
        if (this.isConnected) throw new Error("El controlador se inyecta antes de conectar el componente.");
        this.#controlador = controlador;
    }

    get controlador() {
        return this.#controlador;
    }

    usarControlador(crear) {
        return this.#controlador ??= crear();
    }

    /** Repinta a partir de `modelo`. Lo redefinen los componentes que usan `modelo`. */
    pintar() {}

    /**
     * Clona la plantilla dentro del Shadow DOM, después de las hojas de estilos, si aún está vacío.
     * @param plantilla una Plantilla (plantilla.js).
     * @param hojas nombres de archivos de resources/, p. ej. "vistas.css".
     * @returns true si montó ahora; false si ya estaba montado.
     */
    montar(plantilla, ...hojas) {
        if (this.shadowRoot.childElementCount) return false;
        this.shadowRoot.append(...hojas.map(hoja => Estilos.hojaDeEstilos(hoja)), plantilla.clonar());
        return true;
    }

    /** Elemento del Shadow DOM con ese id, o null. */
    $(id) {
        return this.shadowRoot.getElementById(id);
    }

    escuchar(objetivo, tipo, fn) {
        this.#escuchas ??= new AbortController();
        objetivo.addEventListener(tipo, fn, { signal: this.#escuchas.signal });
    }

    dejarDeEscuchar() {
        this.#escuchas?.abort();
        this.#escuchas = null;
    }

    texto(tag, contenido, clase) {
        const nodo = document.createElement(tag);
        nodo.textContent = contenido;
        if (clase) nodo.className = clase;
        return nodo;
    }

    /** Emite `tipo` desde el componente con bubbles y composed; `detalle` va en event.detail (null si falta). */
    emitir(tipo, detalle) {
        this.dispatchEvent(new CustomEvent(tipo, { bubbles: true, composed: true, detail: detalle }));
    }
}
