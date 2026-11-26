/**
 * <panel-examenes-paso> (HU4): exámenes asignables del paso actual, con filtro por categoría y
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
import { Plantilla } from "../../plantilla.js";
import { FechasSV } from "../../../control/fechas_sv.js";
import { ControladorConsulta, MAX_TEXTO } from "../../../control/controladores/controlador_consulta.js";
import { ComponenteChivoMed } from "../componente_chivomed.js";

const PLANTILLA = new Plantilla(`
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

class PanelExamenesPaso extends ComponenteChivoMed {
    #pintado = null;
    /** Clave de las casillas pintadas (visibles + ordenados): solo se reconstruyen si cambia. */
    #claveCasillas = null;
    #alEnviar = event => {
        event.preventDefault();
        this.emitir("asignar-examenes", { indicaciones: this.$("indicaciones").value });
    };
    #alEscribir = () => { this.$("contador-indicaciones").textContent = ControladorConsulta.textoContador(this.$("indicaciones").value); };
    #alCambiarCategoria = () => { this.emitir("cambiar-categoria", { idTipoExamen: this.$("categoria").value }); };
    #alMarcar = event => {
        const casilla = event.currentTarget ?? event.target;
        this.emitir("alternar-examen", { idExamen: casilla.value, marcado: casilla.checked });
    };

    connectedCallback() {
        this.montar(PLANTILLA, "vistas.css", "consulta.css");
        this.escuchar(this.$("formulario"), "submit", this.#alEnviar);
        this.escuchar(this.$("indicaciones"), "input", this.#alEscribir);
        this.escuchar(this.$("categoria"), "change", this.#alCambiarCategoria);
        this.#alEscribir();
        this.#pintado = null;
        this.#claveCasillas = null;
        this.pintar();
    }

    disconnectedCallback() {
        this.dejarDeEscuchar();
    }

    /** Indicaciones escritas; viajan con el retroceso como motivo en el paso anterior. */
    get indicaciones() { return this.$("indicaciones")?.value ?? ""; }

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

    pintar() {
        const m = this.modelo;
        const antes = this.#pintado;
        this.#pintado = m;
        if (!m) return;
        if (antes?.categorias !== m.categorias) this.#pintarCategorias(m.categorias);
        this.$("campo-categoria").hidden = m.categorias.length === 0;
        this.$("categoria").value = m.filtro ?? "";
        this.#pintarCasillas(m);
        if (antes?.ordenes !== m.ordenes || antes?.asignables !== m.asignables) this.#pintarOrdenes(m);
        if (antes?.resultado !== m.resultado) this.#pintarResultado(m.resultado);

        this.$("indicaciones").readOnly = Boolean(m.confirmando || m.accion);
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
        this.$("categoria").replaceChildren(new Option("Todas", ""), ...categorias.map(c => new Option(c.nombre, c.idTipoExamen)));
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
        this.escuchar(casilla, "change", this.#alMarcar);
        etiqueta.append(casilla, this.texto("span", examen.nombre, "nombre-examen"));
        const tipos = examen.tiposExamen ?? [];
        if (tipos.length) {
            etiqueta.append(this.texto("span", tipos.map(t => t.nombre).join(" · "), "meta"));
        }
        if (ordenado) {
            etiqueta.append(this.texto("span", "Ya ordenado", "insignia"));
        }
        return etiqueta;
    }

    /** Cada resultado lleva su estado en texto ("Emitida"/"No emitida"), no solo en color. */
    #pintarResultado(resultado) {
        this.$("resultado-contenido").hidden = !resultado;
        this.$("lista-resultado").replaceChildren(...(resultado ?? []).map(r => {
            const li = document.createElement("li");
            li.className = r.ok ? "resultado-ok" : "resultado-fallo";
            li.append(this.texto("span", r.ok ? "Emitida" : "No emitida", "estado-resultado"),
                this.texto("span", `${r.nombre}: ${r.mensaje}`, "texto-resultado"));
            return li;
        }));
    }

    #pintarOrdenes({ ordenes, asignables }) {
        this.$("sin-ordenes").hidden = ordenes.length > 0;
        this.$("ordenes").replaceChildren(...ordenes.map(orden => {
            const li = document.createElement("li");
            li.className = "orden";
            const disponible = Boolean(orden.idExamen) && asignables.some(e => e.idExamen === orden.idExamen);
            li.append(this.texto("p", ControladorConsulta.nombreDeOrden(orden, asignables), disponible ? "orden-nombre" : "orden-nombre no-disponible"));
            if (orden.fechaCreacion) {
                li.append(this.texto("p", `Emitida el ${FechasSV.formatearFechaHora(orden.fechaCreacion)}`, "meta"));
            }
            if (orden.indicaciones) {
                li.append(this.texto("p", orden.indicaciones, "orden-indicaciones"));
            }
            return li;
        }));
    }
}

customElements.define("panel-examenes-paso", PanelExamenesPaso);
export default PanelExamenesPaso;
