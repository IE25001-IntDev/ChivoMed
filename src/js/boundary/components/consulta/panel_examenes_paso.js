/**
 * <panel-examenes-paso> (HU4, F9): exámenes asignables del paso actual, con filtro por categoría y
 * casillas para ordenar varios a la vez, el resultado por examen y las órdenes emitidas.
 * Solo presentación: el filtro, la selección y la validación los decide ControladorConsulta.
 *
 * Propiedad `modelo` (congelado, lo arma <vista-consulta>):
 *   { asignables: [{ idExamen, nombre, tiposExamen }], ordenes: [{ idOrdenExamen, idExamen, indicaciones, fechaCreacion }],
 *     categorias: [{ idTipoExamen, nombre }], filtro, visibles: [examen], seleccion: [idExamen], ordenados: [idExamen],
 *     textoSeleccion, resultado: null | [{ idExamen, nombre, ok, mensaje }], motivo, accion, error }
 * Emite (bubbles, composed): 'cambiar-categoria' { idTipoExamen }, 'alternar-examen' { idExamen, marcado },
 * 'asignar-examenes' { indicaciones }.
 * `limpiar()` vacía las indicaciones sin mover el foco; `enfocarError()` y `enfocarResultados()` lo mueven.
 */
import { hojaDeEstilos } from "../../estilos.js";
import { plantilla } from "../../plantilla.js";
import { formatearFechaHora } from "../../../control/fechas_sv.js";
import { MAX_TEXTO, nombreDeOrden } from "../../../control/controladores/controlador_consulta.js";

const PLANTILLA = plantilla(`
<section class="panel" aria-labelledby="titulo">
  <h2 id="titulo">Exámenes</h2>
  <form class="formulario-orden" id="formulario" novalidate aria-label="Asignar exámenes">
    <div class="campo" id="campo-categoria">
      <label for="categoria">Categoría</label>
      <select id="categoria" name="categoria"></select>
    </div>
    <fieldset class="grupo-examenes" id="examenes" aria-describedby="seleccionados error-orden">
      <legend>Exámenes asignables</legend>
      <div class="casillas" id="casillas"></div>
      <p class="vacio" id="sin-visibles" hidden>No hay exámenes en esta categoría.</p>
    </fieldset>
    <p class="indicaciones" id="seleccionados" aria-live="polite"></p>
    <div class="campo">
      <label for="indicaciones">Indicaciones para todos los seleccionados (opcional)</label>
      <textarea id="indicaciones" name="indicaciones" rows="3" maxlength="255" aria-describedby="contador-indicaciones"></textarea>
      <p class="indicaciones" id="contador-indicaciones" aria-live="polite"></p>
    </div>
    <button class="boton boton-principal" id="asignar" type="submit" aria-describedby="motivo-orden">Asignar exámenes seleccionados</button>
    <p class="motivo" id="motivo-orden" hidden></p>
    <p class="error-campo" id="error-orden" role="alert" tabindex="-1" hidden></p>
  </form>
  <p class="vacio" id="sin-asignables" hidden>Este paso no tiene exámenes asignables.</p>
  <div class="resultado-examenes" id="resultado" role="status" tabindex="-1" aria-labelledby="titulo-resultado">
    <div id="resultado-contenido" hidden>
      <h3 id="titulo-resultado">Resultado de la asignación</h3>
      <ul class="lista-resultado" id="lista-resultado"></ul>
    </div>
  </div>
  <h3 id="titulo-ordenes">Órdenes emitidas en este paso</h3>
  <ol class="lista-ordenes" id="ordenes" aria-labelledby="titulo-ordenes"></ol>
  <p class="vacio" id="sin-ordenes" hidden>Todavía no hay órdenes en este paso.</p>
</section>`);

const contador = valor => `${valor.length}/${MAX_TEXTO} caracteres`;

class PanelExamenesPaso extends HTMLElement {
    #modelo = null;
    #pintado = null;
    /** Clave de las casillas pintadas (visibles + ordenados): solo se reconstruyen si cambia. */
    #claveCasillas = null;
    #emitir = (tipo, detail) => this.dispatchEvent(new CustomEvent(tipo, { bubbles: true, composed: true, detail }));
    #alEnviar = event => {
        event.preventDefault();
        this.#emitir("asignar-examenes", { indicaciones: this.$("indicaciones").value });
    };
    #alEscribir = () => { this.$("contador-indicaciones").textContent = contador(this.$("indicaciones").value); };
    #alCambiarCategoria = () => { this.#emitir("cambiar-categoria", { idTipoExamen: this.$("categoria").value }); };
    #alMarcar = event => {
        const casilla = event.currentTarget ?? event.target;
        this.#emitir("alternar-examen", { idExamen: casilla.value, marcado: casilla.checked });
    };

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
        if (!raiz.childElementCount) raiz.append(hojaDeEstilos("vistas.css"), hojaDeEstilos("consulta.css"), PLANTILLA.clonar());
        this.$ = id => raiz.getElementById(id);
        this.$("formulario").addEventListener("submit", this.#alEnviar);
        this.$("indicaciones").addEventListener("input", this.#alEscribir);
        this.$("categoria").addEventListener("change", this.#alCambiarCategoria);
        this.#alEscribir();
        this.#pintado = null;
        this.#claveCasillas = null;
        this.#pintar();
    }

    disconnectedCallback() {
        this.$("formulario").removeEventListener("submit", this.#alEnviar);
        this.$("indicaciones").removeEventListener("input", this.#alEscribir);
        this.$("categoria").removeEventListener("change", this.#alCambiarCategoria);
        for (const casilla of this.#casillas()) casilla.removeEventListener("change", this.#alMarcar);
    }

    /** Vacía las indicaciones tras asignar; el foco lo decide la vista (va a los resultados). */
    limpiar() {
        if (!this.$) return;
        this.$("indicaciones").value = "";
        this.#alEscribir();
    }

    enfocarError() {
        this.$?.("error-orden")?.focus();
    }

    enfocarResultados() {
        this.$?.("resultado")?.focus();
    }

    #casillas() {
        return this.$("casillas").querySelectorAll('input[type="checkbox"]');
    }

    #pintar() {
        const m = this.#modelo;
        const antes = this.#pintado;
        this.#pintado = m;
        if (!m) return;
        if (antes?.categorias !== m.categorias) this.#pintarCategorias(m.categorias);
        this.$("campo-categoria").hidden = m.categorias.length === 0;
        this.$("categoria").value = m.filtro ?? "";
        this.#pintarCasillas(m);
        if (antes?.ordenes !== m.ordenes || antes?.asignables !== m.asignables) this.#pintarOrdenes(m);
        if (antes?.resultado !== m.resultado) this.#pintarResultado(m.resultado);

        const sinAsignables = m.asignables.length === 0;
        this.$("formulario").hidden = sinAsignables;
        this.$("sin-asignables").hidden = !sinAsignables;
        this.$("sin-visibles").hidden = m.visibles.length > 0;
        this.$("seleccionados").textContent = m.textoSeleccion ?? "";
        this.$("asignar").disabled = Boolean(m.motivo);
        this.$("asignar").textContent = m.accion === "orden" ? "Asignando…" : "Asignar exámenes seleccionados";
        this.$("motivo-orden").hidden = !m.motivo || Boolean(m.accion);
        this.$("motivo-orden").textContent = m.motivo ?? "";
        this.$("error-orden").hidden = !m.error;
        this.$("error-orden").textContent = m.error ?? "";
        if (m.error) this.$("examenes").setAttribute("aria-invalid", "true");
        else this.$("examenes").removeAttribute("aria-invalid");
        this.$("formulario").setAttribute("aria-busy", String(m.accion === "orden"));
    }

    #pintarCategorias(categorias) {
        const todas = document.createElement("option");
        todas.value = "";
        todas.textContent = "Todas";
        this.$("categoria").replaceChildren(todas, ...categorias.map(c => {
            const opcion = document.createElement("option");
            opcion.value = c.idTipoExamen;
            opcion.textContent = c.nombre;
            return opcion;
        }));
    }

    /**
     * Reconstruye las casillas solo si cambian los exámenes visibles o los ya ordenados; si solo
     * cambia la selección o la acción, sincroniza checked y disabled para no perder el foco.
     */
    #pintarCasillas({ visibles, ordenados, seleccion, accion }) {
        const yaOrdenados = new Set(ordenados);
        const clave = `${visibles.map(e => e.idExamen).join(",")}|${[...yaOrdenados].join(",")}`;
        if (clave !== this.#claveCasillas) {
            this.#claveCasillas = clave;
            for (const casilla of this.#casillas()) casilla.removeEventListener("change", this.#alMarcar);
            this.$("casillas").replaceChildren(...visibles.map(e => this.#crearCasilla(e, yaOrdenados.has(e.idExamen))));
        }
        const elegidos = new Set(seleccion);
        for (const casilla of this.#casillas()) {
            const ordenado = yaOrdenados.has(casilla.value);
            casilla.checked = ordenado || elegidos.has(casilla.value);
            casilla.disabled = ordenado || accion === "orden";
        }
    }

    #crearCasilla(examen, ordenado) {
        const etiqueta = document.createElement("label");
        etiqueta.className = "casilla";
        const casilla = document.createElement("input");
        casilla.type = "checkbox";
        casilla.name = "examen";
        casilla.value = examen.idExamen;
        casilla.addEventListener("change", this.#alMarcar);
        const nombre = document.createElement("span");
        nombre.className = "nombre-examen";
        nombre.textContent = examen.nombre;
        etiqueta.append(casilla, nombre);
        const tipos = examen.tiposExamen ?? [];
        if (tipos.length) {
            const meta = document.createElement("span");
            meta.className = "meta";
            meta.textContent = tipos.map(t => t.nombre).join(" · ");
            etiqueta.append(meta);
        }
        if (ordenado) {
            const insignia = document.createElement("span");
            insignia.className = "insignia";
            insignia.textContent = "Ya ordenado";
            etiqueta.append(insignia);
        }
        return etiqueta;
    }

    /** Cada resultado lleva su estado en texto ("Emitida"/"No emitida"), no solo en color. */
    #pintarResultado(resultado) {
        this.$("resultado-contenido").hidden = !resultado;
        this.$("lista-resultado").replaceChildren(...(resultado ?? []).map(r => {
            const li = document.createElement("li");
            li.className = r.ok ? "resultado-ok" : "resultado-fallo";
            const estado = document.createElement("span");
            estado.className = "estado-resultado";
            estado.textContent = r.ok ? "Emitida" : "No emitida";
            const texto = document.createElement("span");
            texto.className = "texto-resultado";
            texto.textContent = `${r.nombre}: ${r.mensaje}`;
            li.append(estado, texto);
            return li;
        }));
    }

    #pintarOrdenes({ ordenes, asignables }) {
        this.$("sin-ordenes").hidden = ordenes.length > 0;
        this.$("ordenes").replaceChildren(...ordenes.map(orden => {
            const li = document.createElement("li");
            li.className = "orden";
            const nombre = document.createElement("p");
            const disponible = Boolean(orden.idExamen) && asignables.some(e => e.idExamen === orden.idExamen);
            nombre.className = disponible ? "orden-nombre" : "orden-nombre no-disponible";
            nombre.textContent = nombreDeOrden(orden, asignables);
            li.append(nombre);
            if (orden.fechaCreacion) {
                const fecha = document.createElement("p");
                fecha.className = "meta";
                fecha.textContent = `Emitida el ${formatearFechaHora(orden.fechaCreacion)}`;
                li.append(fecha);
            }
            if (orden.indicaciones) {
                const indicaciones = document.createElement("p");
                indicaciones.className = "orden-indicaciones";
                indicaciones.textContent = orden.indicaciones;
                li.append(indicaciones);
            }
            return li;
        }));
    }
}

customElements.define("panel-examenes-paso", PanelExamenesPaso);
export default PanelExamenesPaso;
