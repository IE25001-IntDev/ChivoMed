/**
 * Plantilla fija de un Web Component: un <template> que se crea una sola vez por módulo
 * (la primera vez que se clona) y luego solo se clona.
 *
 * Norma (docs/plan.md): este es el único lugar de la SPA que asigna innerHTML, y solo con HTML
 * constante del código. Nunca con datos del servidor, de la URL ni del usuario: esos se pintan
 * con textContent, atributos o propiedades sobre el clon.
 *
 *   const PLANTILLA = new Plantilla(`<h1 id="titulo"></h1>`);
 *   shadowRoot.append(PLANTILLA.clonar());
 *
 * Es perezosa a propósito: así importar un componente no necesita `document` (pruebas en Node).
 */
export class Plantilla {
    #html;
    #template = null;

    constructor(html) {
        if (typeof html !== "string") throw new TypeError("Plantilla espera el HTML como texto constante.");
        this.#html = html;
        Object.freeze(this);
    }

    clonar() {
        if (!this.#template) {
            this.#template = document.createElement("template");
            this.#template.innerHTML = this.#html;
        }
        return this.#template.content.cloneNode(true);
    }
}
