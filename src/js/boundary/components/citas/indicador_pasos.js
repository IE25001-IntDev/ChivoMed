/**
 * <indicador-pasos>: indicador accesible de un asistente por pasos. Solo presentación.
 * Propiedad `modelo` = { pasos: [{ numero, nombre }], actual, alcanzado }.
 *  - <nav aria-label="Pasos de la búsqueda"> con un <ol>; el actual lleva aria-current="step".
 *  - Los pasos alcanzados son <button> cuyo nombre incluye el estado ("…, completado"); los
 *    futuros son texto con aria-disabled.
 * Emite 'ir-a-paso' { paso } (bubbles, composed) al pulsar un paso alcanzado distinto del actual.
 */
import { hojaDeEstilos } from "../../vistas/estilos.js";
import { plantilla } from "../../plantilla.js";

const PLANTILLA = plantilla(`
<nav class="indicador-pasos" aria-label="Pasos de la búsqueda">
  <ol class="lista-pasos" id="lista"></ol>
</nav>`);

class IndicadorPasos extends HTMLElement {
    #modelo = null;

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
        this.#pintar();
    }

    #pintar() {
        const { pasos = [], actual = 1, alcanzado = 1 } = this.#modelo ?? {};
        const total = pasos.length;
        const items = pasos.map(({ numero, nombre }) => {
            const li = document.createElement("li");
            const estado = numero === actual ? "paso actual" : numero < alcanzado || numero < actual ? "completado" : "disponible";
            li.className = numero === actual ? "paso actual" : numero <= alcanzado ? "paso alcanzado" : "paso futuro";
            if (numero === actual) li.setAttribute("aria-current", "step");
            const marca = document.createElement("span");
            marca.className = "numero-paso";
            marca.setAttribute("aria-hidden", "true");
            marca.textContent = String(numero);
            const texto = document.createElement("span");
            texto.className = "nombre-paso";
            texto.textContent = nombre;
            if (numero <= alcanzado) {
                const boton = document.createElement("button");
                boton.type = "button";
                boton.className = "boton-paso";
                boton.setAttribute("aria-label", `Paso ${numero} de ${total}: ${nombre}, ${estado}`);
                boton.append(marca, texto);
                boton.addEventListener("click", () => {
                    if (numero === this.#modelo?.actual) return;
                    this.dispatchEvent(new CustomEvent("ir-a-paso", { bubbles: true, composed: true, detail: { paso: numero } }));
                });
                li.append(boton);
            } else {
                li.setAttribute("aria-disabled", "true");
                const solo = document.createElement("span");
                solo.className = "solo-lectores";
                solo.textContent = `Paso ${numero} de ${total}: `;
                li.append(solo, marca, texto);
            }
            return li;
        });
        this.shadowRoot.getElementById("lista").replaceChildren(...items);
    }
}

customElements.define("indicador-pasos", IndicadorPasos);
export default IndicadorPasos;
