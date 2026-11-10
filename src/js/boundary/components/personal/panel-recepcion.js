import { escapeHtml } from '../../utils.js';
import RecepcionService from '../../../control/recepcion_service.js';
import PersonaRolService from '../../../control/persona_rol_service.js';

class PanelRecepcion extends HTMLElement {
    constructor() { super(); this.attachShadow({ mode: 'open' }); this.servicio = new RecepcionService(); }
    set sesion(valor) { this._sesion = valor; this.cargar(); }
    async cargar(mensaje = '') {
        this.shadowRoot.innerHTML = '<p role="status">Cargando pacientes…</p>';
        try {
            this.pacientes = await this.servicio.pacientes(this._sesion.rolActivo.idClinica);
            this.render();
            this.shadowRoot.querySelector('#feedback').textContent = mensaje;
        } catch (error) {
            this.shadowRoot.querySelector('p').textContent = [mensaje, error.message].filter(Boolean).join(' ');
            const retry = document.createElement('button');
            retry.type = 'button'; retry.textContent = 'Volver a cargar pacientes';
            retry.onclick = () => this.cargar(mensaje);
            this.shadowRoot.append(retry);
        }
    }
    render() {
        this.shadowRoot.innerHTML = `<style>:host{display:block;color:var(--text,#183f35)}h2{margin-top:0}form,.listado{padding:1.5rem;border:1px solid var(--border,#b7cfc5);border-radius:1rem;margin-bottom:1.5rem;background:var(--surface-solid,#f5faf7)}.campos{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:1rem}label{display:grid;gap:.4rem}input,select,textarea,button{box-sizing:border-box;font:inherit;color:inherit;min-height:44px;padding:.65rem;border:1px solid var(--border,#aac4b8);border-radius:.5rem;background:var(--surface-solid,#fff);max-width:100%}button{cursor:pointer;margin-top:.75rem}button:disabled{opacity:.6;cursor:wait}input:focus-visible,select:focus-visible,button:focus-visible,textarea:focus-visible{outline:3px solid var(--accent,#278569);outline-offset:2px}ul{padding-left:1.2rem}li{margin-bottom:.75rem}p{line-height:1.5}</style>
            <h2>Recepción de pacientes</h2><p>Registra pacientes y prepara sus consultas en la clínica de tu sesión.</p>
            <p id="feedback" role="status" aria-live="polite"></p>
            <form id="paciente"><h3 id="titulo">Registrar paciente</h3><div class="campos"><label>Nombres<input name="nombres" maxlength="255" required></label><label>Apellidos<input name="apellidos" maxlength="255" required></label><label>Fecha de nacimiento<input name="fechaNacimiento" type="date" required max="${new Date().toLocaleDateString('en-CA')}"></label></div><button type="submit">Guardar paciente</button> <button type="button" id="cancelar" hidden>Cancelar edición</button></form>
            <form id="consulta"><h3>Abrir consulta</h3><label for="paciente-consulta">Paciente</label><select id="paciente-consulta" name="idPersonaRol" required><option value="">Selecciona un paciente</option>${this.pacientes.map(p => `<option value="${escapeHtml(p.idPersonaRol)}">${escapeHtml(p.persona.nombres)} ${escapeHtml(p.persona.apellidos)}</option>`).join('')}</select><label>Motivo de atención<textarea name="observaciones" maxlength="255" required></textarea></label><label>Referencia externa (opcional)<input name="referenciaExterna" maxlength="255"></label><button type="submit" ${this.pacientes.length ? '' : 'disabled'}>Abrir consulta</button></form>
            <section class="listado" aria-labelledby="listado-titulo"><h3 id="listado-titulo">Pacientes de esta clínica</h3><label>Buscar paciente<input type="search" id="buscar"></label><ul></ul></section>`;
        const root = this.shadowRoot;
        const form = root.querySelector('#paciente');
        const feedback = root.querySelector('#feedback');
        let editando;
        const listar = () => {
            const busqueda = root.querySelector('#buscar').value.toLocaleLowerCase('es');
            const lista = root.querySelector('ul'); lista.replaceChildren();
            for (const p of this.pacientes.filter(p => `${p.persona.nombres} ${p.persona.apellidos}`.toLocaleLowerCase('es').includes(busqueda))) {
                const li = document.createElement('li'); li.textContent = `${p.persona.nombres} ${p.persona.apellidos} `;
                const editar = document.createElement('button'); editar.type = 'button'; editar.textContent = 'Editar'; editar.setAttribute('aria-label', `Editar a ${p.persona.nombres} ${p.persona.apellidos}`);
                editar.onclick = () => { editando = p.idPersona; form.elements.nombres.value = p.persona.nombres; form.elements.apellidos.value = p.persona.apellidos;
                    form.elements.fechaNacimiento.value = p.persona.fechaNacimiento?.slice(0,10) ?? ''; root.querySelector('#titulo').textContent = 'Editar paciente'; root.querySelector('#cancelar').hidden = false; form.elements.nombres.focus(); };
                li.append(editar); lista.append(li);
            }
            if (!lista.childElementCount) lista.textContent = 'No hay pacientes para esta búsqueda.';
        };
        root.querySelector('#buscar').oninput = listar; listar();
        root.querySelector('#cancelar').onclick = () => { editando = null; form.reset(); root.querySelector('#titulo').textContent = 'Registrar paciente'; root.querySelector('#cancelar').hidden = true; };
        const enviar = async (event, operacion) => {
            event.preventDefault(); const formulario = event.currentTarget; if (this.enviando) return;
            const datos = Object.fromEntries(new FormData(formulario));
            if (Object.values(datos).some(v => v && !v.trim())) { feedback.textContent = 'Completa los campos con valores válidos.'; return; }
            this.enviando = true;
            const controles = [...root.querySelectorAll('input,select,textarea,button')]; controles.forEach(c => { c.disabled = true; });
            feedback.textContent = 'Guardando…';
            try { await operacion(datos); await this.cargar('Registro guardado correctamente.'); }
            catch (error) { feedback.textContent = error.message; controles.forEach(c => { c.disabled = false; }); }
            finally { this.enviando = false; }
        };
        form.onsubmit = e => enviar(e, datos => this.servicio.guardarPaciente(this._sesion, {
            nombres: datos.nombres.trim(), apellidos: datos.apellidos.trim(), fechaNacimiento: datos.fechaNacimiento ? `${datos.fechaNacimiento}T00:00:00.000Z` : null,
        }, editando));
        root.querySelector('#consulta').onsubmit = e => enviar(e, datos => new PersonaRolService().consultas(datos.idPersonaRol).crear({ observaciones: datos.observaciones.trim(), referenciaExterna: datos.referenciaExterna.trim() || null }));
    }
}
customElements.define('panel-recepcion', PanelRecepcion);
