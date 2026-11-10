import { escapeHtml, validarCampos } from '../../utils.js';

/**
 * Web Component: <panel-contexto>
 * Replicación de 'cambiar-rol.xhtml' (Gestión de Contexto Operativo y Turnos).
 * Permite seleccionar la sede clínica física, la persona y su asignación activa en el servidor,
 * y registrar nuevas asignaciones de personal.
 *
 * Emite: 'activar-rol', 'crear-asignacion'
 */
class PanelContexto extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._clinicas = [];
        this._roles = [];
        this._personas = [];
        this._rolesDisponibles = [];
        this._idClinicaSeleccionada = null;
        this._contextoActual = null;
        this._mostrarFormNuevaAsignacion = false;
        this._cargando = false;
    }

    set clinicas(val) { this._clinicas = Array.isArray(val) ? val : []; this.render(); }
    set roles(val) { this._roles = Array.isArray(val) ? val : []; this.render(); }
    set personas(val) { this._personas = Array.isArray(val) ? val : []; this.render(); }
    set rolesDisponibles(val) { this._rolesDisponibles = Array.isArray(val) ? val : []; this.render(); }
    set idClinicaSeleccionada(val) { this._idClinicaSeleccionada = val; this.render(); }
    set contextoActual(val) { this._contextoActual = val; this.render(); }
    set cargando(val) { this._cargando = Boolean(val); this.render(); }

    cerrarFormulario() {
        this._mostrarFormNuevaAsignacion = false;
        this.render();
    }

    connectedCallback() {
        this._onKeyDown = (e) => {
            if (e.key === 'Escape' && this._mostrarFormNuevaAsignacion) {
                this._mostrarFormNuevaAsignacion = false;
                this.render();
            }
        };
        window.addEventListener('keydown', this._onKeyDown);
        this.render();
    }

    disconnectedCallback() {
        if (this._onKeyDown) {
            window.removeEventListener('keydown', this._onKeyDown);
        }
    }

    render() {
        const idRolActivo = this._contextoActual?.idPersonaRol || null;
        const clinicaActual = this._clinicas.find(c => c.idClinica === this._idClinicaSeleccionada) || this._clinicas[0];

        // Filtrar asignaciones de personal por la clínica seleccionada si aplica
        const rolesDeClinica = this._rolesDisponibles.filter(r => {
            if (!this._idClinicaSeleccionada) return true;
            return !r.idClinica || r.idClinica === this._idClinicaSeleccionada;
        });

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: flex;
                    flex-direction: column;
                    min-height: calc(100vh - 190px);
                    background: var(--card-glass, rgba(29, 51, 56, 0.7));
                    backdrop-filter: blur(28px) saturate(180%);
                    -webkit-backdrop-filter: blur(28px) saturate(180%);
                    border: 1px solid var(--card-border, rgba(172, 223, 206, 0.14));
                    border-radius: var(--card-radius, 20px);
                    padding: 3.25rem 3.75rem;
                    box-shadow: var(--card-shadow, var(--glass-shadow));
                    transition: var(--transition-card, all 0.28s ease);
                    box-sizing: border-box;
                }
                .section-header {
                    border-bottom: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                    padding-top: 0.5rem;
                    padding-bottom: 1.75rem;
                    margin-bottom: 2.25rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 1.25rem;
                }
                .title-box {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                    padding: 0.25rem 0.5rem;
                }
                .title {
                    font-size: 1.35rem;
                    font-weight: 700;
                    color: var(--text, #e2f0eb);
                    display: flex;
                    align-items: center;
                    gap: 0.85rem;
                    margin: 0;
                }
                .subtitle {
                    font-size: 0.92rem;
                    color: var(--muted, #a2b9b8);
                    margin: 0;
                    line-height: 1.5;
                }
                .current-badge-box {
                    background: var(--gradient-accent-card, linear-gradient(135deg, rgba(23, 131, 109, 0.88), rgba(120, 212, 176, 0.75)));
                    border: 1px solid var(--border-strong, rgba(160, 208, 193, 0.25));
                    border-radius: 18px;
                    padding: 1.75rem 2.25rem;
                    margin-bottom: 2.5rem;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    flex-wrap: wrap;
                    gap: 1.5rem;
                    box-shadow: 0 10px 25px var(--glow-mint, rgba(45, 133, 111, 0.25));
                    color: #ffffff;
                }
                .current-badge-text {
                    font-size: 1rem;
                    color: #ffffff;
                    font-weight: 700;
                    display: flex;
                    align-items: center;
                    gap: 0.65rem;
                    flex-wrap: wrap;
                }
                .current-badge-text code {
                    background: rgba(0, 0, 0, 0.25);
                    padding: 0.35rem 0.75rem;
                    border-radius: 8px;
                    color: #ffffff;
                    font-size: 0.95rem;
                }
                .form-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
                    gap: 2.25rem;
                    margin-bottom: 2.5rem;
                }
                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }
                .form-label {
                    font-size: 0.9rem;
                    font-weight: 700;
                    color: var(--text, #e2f0eb);
                }
                .select-input, .input-text {
                    padding: 0.85rem 1.25rem;
                    min-height: 3.1rem;
                    border: 1px solid var(--border-strong, rgba(172, 223, 206, 0.25));
                    border-radius: 12px;
                    font-size: 0.95rem;
                    background: var(--input-bg, var(--surface-solid, #20383d));
                    color: var(--text, #e2f0eb);
                    outline: none;
                    font-family: inherit;
                    box-sizing: border-box;
                    transition: border-color 0.15s, box-shadow 0.15s;
                }
                .select-input:focus, .input-text:focus {
                    border-color: var(--accent, #78d4b0);
                    box-shadow: 0 0 0 2px rgba(120, 212, 176, 0.25);
                }
                .select-input option {
                    background: var(--surface-solid, #172a2e);
                    color: var(--text, #e2f0eb);
                }
                .btn {
                    padding: 0.75rem 1.6rem;
                    border-radius: 9999px;
                    font-size: 0.92rem;
                    font-weight: 600;
                    cursor: pointer;
                    border: none;
                    display: inline-flex;
                    align-items: center;
                    gap: 0.65rem;
                    transition: all 0.22s var(--ease-spring, cubic-bezier(0.16, 1, 0.3, 1));
                }
                .btn:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 15px var(--glow-mint, rgba(45, 133, 111, 0.2));
                }
                .btn:active:not(:disabled) {
                    transform: scale(0.97);
                }
                .btn-primary {
                    background: var(--accent, #78d4b0);
                    color: var(--on-accent, #122e2a);
                    font-weight: 700;
                }
                .btn-primary:hover:not(:disabled) {
                    background: #8bdbbc;
                    box-shadow: 0 0 16px rgba(120, 212, 176, 0.35);
                }
                .btn-outline {
                    background: transparent;
                    border: 1px solid var(--border-strong, rgba(172, 223, 206, 0.25));
                    color: var(--text, #e2f0eb);
                }
                .btn-outline:hover {
                    background: var(--surface-muted, rgba(255, 255, 255, 0.05));
                    border-color: var(--accent, #78d4b0);
                }
                .btn:disabled { opacity: 0.6; cursor: not-allowed; }

                /* Ventana Emergente / Modal Glassmorphism */
                .modal-backdrop {
                    position: fixed;
                    inset: 0;
                    background: var(--modal-backdrop, rgba(8, 16, 19, 0.75));
                    backdrop-filter: blur(28px) saturate(180%);
                    -webkit-backdrop-filter: blur(28px) saturate(180%);
                    z-index: 2000;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 1.5rem;
                    animation: modalBackdropFadeIn 0.2s ease-out;
                }

                @keyframes modalBackdropFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }

                .modal-dialog {
                    background: var(--surface-solid, #172a2e);
                    border: 1px solid var(--border-strong, rgba(160, 208, 193, 0.28));
                    border-radius: var(--card-radius, 24px);
                    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(120, 212, 176, 0.1);
                    max-width: 660px;
                    width: 100%;
                    max-height: 85vh;
                    overflow-y: auto;
                    padding: 2.5rem;
                    animation: modalScaleIn 0.2s ease-out;
                    box-sizing: border-box;
                    backdrop-filter: blur(28px) saturate(180%);
                    -webkit-backdrop-filter: blur(28px) saturate(180%);
                }

                @keyframes modalScaleIn {
                    from { opacity: 0; transform: scale(0.95) translateY(-8px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }

                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    border-bottom: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                    padding-bottom: 1.5rem;
                    margin-bottom: 1.75rem;
                }

                .modal-title {
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: var(--accent, #78d4b0);
                    margin: 0;
                }

                .modal-subtitle {
                    font-size: 0.85rem;
                    color: var(--muted, #a2b9b8);
                    margin-top: 0.35rem;
                }

                .btn-close-modal {
                    background: var(--surface-muted, rgba(255, 255, 255, 0.06));
                    border: 1px solid var(--border, rgba(172, 223, 206, 0.15));
                    border-radius: 50%;
                    width: 36px;
                    height: 36px;
                    display: grid;
                    place-items: center;
                    color: var(--muted, #a2b9b8);
                    font-size: 1rem;
                    cursor: pointer;
                    transition: all 0.15s;
                }

                .btn-close-modal:hover {
                    background: rgba(239, 68, 68, 0.2);
                    border-color: rgba(239, 68, 68, 0.4);
                    color: #f87171;
                }
            </style>

            <div class="section-header">
                <div class="title-box">
                    <div class="title">
                        <span>👥 Turnos y Personal</span>
                    </div>
                    <div class="subtitle">
                        Asignación activa y turnos del personal por sede.
                    </div>
                </div>

                <button type="button" class="btn btn-primary" id="btnToggleNuevaAsignacion">
                    ➕ Asignar
                </button>
            </div>

            <div class="current-badge-box">
                <div class="current-badge-text">
                    <span>⚡ Sesión:</span>
                    <span>${idRolActivo ? `Rol ID: <code>${escapeHtml(idRolActivo.slice(0, 8))}...</code>` : 'Sin asignación activa en sesión'}</span>
                </div>
                <span style="font-size: 0.8rem; color: var(--accent-text, #8bdbbc);">Sede: <strong>${escapeHtml(clinicaActual?.nombre || 'General')}</strong></span>
            </div>

            <!-- FORMULARIO DE NUEVA ASIGNACIÓN DE PERSONAL (VENTANA EMERGENTE) -->
            ${this._mostrarFormNuevaAsignacion ? `
                <div class="modal-backdrop" id="modalBackdropContexto">
                    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modalAssignTitle">
                        <div class="modal-header">
                            <div>
                                <h4 id="modalAssignTitle" class="modal-title">➕ Asignar Personal</h4>
                                <div class="modal-subtitle">Vincula un profesional a una sede y rol para habilitar sus turnos.</div>
                            </div>
                            <button type="button" class="btn-close-modal" id="btnCloseModalContexto" title="Cerrar ventana emergente" aria-label="Cerrar">✕</button>
                        </div>

                        <form id="formNuevaAsignacion">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label class="form-label" for="selPersonaAsignar">Persona: *</label>
                                    <select class="select-input" id="selPersonaAsignar" required>
                                        <option value="">-- Seleccionar Persona --</option>
                                        ${this._personas.map(p => `
                                            <option value="${escapeHtml(p.idPersona)}">
                                                ${escapeHtml(p.nombres || '')} ${escapeHtml(p.apellidos || '')} (${escapeHtml((p.idPersona || '').slice(0, 8))}...)
                                            </option>
                                        `).join('')}
                                    </select>
                                </div>

                                <div class="form-group">
                                    <label class="form-label" for="selRolAsignar">Rol: *</label>
                                    <select class="select-input" id="selRolAsignar" required>
                                        <option value="">-- Seleccionar Rol --</option>
                                        ${this._roles.filter(r => r.activo === true).map(r => `
                                            <option value="${escapeHtml(r.idRol)}">${escapeHtml(r.nombre)}</option>
                                        `).join('')}
                                    </select>
                                </div>

                                <div class="form-group">
                                    <label class="form-label" for="selClinicaAsignar">Sede Clínica: *</label>
                                    <select class="select-input" id="selClinicaAsignar" required>
                                        ${this._clinicas.filter(c => c.activo === true).map(c => `
                                            <option value="${escapeHtml(c.idClinica)}" ${c.idClinica === this._idClinicaSeleccionada ? 'selected' : ''}>
                                                ${escapeHtml(c.nombre)}
                                            </option>
                                        `).join('')}
                                    </select>
                                </div>
                            </div>

                            <div style="display: flex; justify-content: flex-end; gap: 0.85rem; margin-top: 1.5rem;">
                                <button type="button" class="btn btn-outline" id="btnCancelNuevaAsign">✕ Cancelar</button>
                                <button type="submit" class="btn btn-primary" ${this._cargando ? 'disabled' : ''}>
                                    ${this._cargando ? '⏳ Guardando...' : '💾 Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ` : ''}

            <div class="form-grid">
                <div class="form-group">
                    <label class="form-label" for="selectClinica">1. Sede Hospitalaria:</label>
                    <select disabled class="select-input" id="selectClinica">
                        ${this._clinicas.filter(c => c.activo === true).map(cl => `
                            <option value="${escapeHtml(cl.idClinica)}" ${cl.idClinica === this._idClinicaSeleccionada ? 'selected' : ''}>
                                ${escapeHtml(cl.nombre)} (${escapeHtml(cl.tipo || 'General')})
                            </option>
                        `).join('')}
                    </select>
                </div>

                <div class="form-group">
                    <label class="form-label" for="selectPersonaRol">2. Personal y Turno Activo:</label>
                    <select disabled class="select-input" id="selectPersonaRol">
                        <option value="">-- Seleccionar Asignación --</option>
                        ${rolesDeClinica.map(pr => `
                            <option value="${escapeHtml(pr.idPersonaRol)}" ${pr.idPersonaRol === idRolActivo ? 'selected' : ''}>
                                ${escapeHtml(pr.nombrePersona || pr.idPersonaRol)} — ${escapeHtml(pr.nombreRol || 'Rol')}
                            </option>
                        `).join('')}
                    </select>
                </div>
            </div>

            <div style="display: flex; justify-content: flex-end;">
                <button hidden type="button" class="btn btn-primary" id="btnActivarRol" ${this._cargando ? 'disabled' : ''}>
                    ${this._cargando ? '⏳ Activando...' : '✔️ Activar'}
                </button>
            </div>
        `;

        // Modal nueva asignación
        const cerrarModalContexto = () => {
            this._mostrarFormNuevaAsignacion = false;
            this.render();
        };

        const btnCloseContexto = this.shadowRoot.getElementById('btnCloseModalContexto');
        if (btnCloseContexto) {
            btnCloseContexto.addEventListener('click', cerrarModalContexto);
        }

        const modalBackdropContexto = this.shadowRoot.getElementById('modalBackdropContexto');
        if (modalBackdropContexto) {
            modalBackdropContexto.addEventListener('click', (e) => {
                if (e.target === modalBackdropContexto) {
                    cerrarModalContexto();
                }
            });
        }

        const btnToggleNueva = this.shadowRoot.getElementById('btnToggleNuevaAsignacion');
        if (btnToggleNueva) {
            btnToggleNueva.addEventListener('click', () => {
                this._mostrarFormNuevaAsignacion = true;
                this.render();
            });
        }

        const btnCancelNueva = this.shadowRoot.getElementById('btnCancelNuevaAsign');
        if (btnCancelNueva) {
            btnCancelNueva.addEventListener('click', cerrarModalContexto);
        }

        // Submit nueva asignación
        const formNueva = this.shadowRoot.getElementById('formNuevaAsignacion');
        if (formNueva) {
            formNueva.addEventListener('submit', (e) => {
                e.preventDefault();
                if (!validarCampos(e.currentTarget.elements)) return;
                const idPersona = this.shadowRoot.getElementById('selPersonaAsignar').value;
                const idRol = this.shadowRoot.getElementById('selRolAsignar').value;
                const idClinica = this.shadowRoot.getElementById('selClinicaAsignar').value;
                if (!idPersona || !idRol || !idClinica) return;

                this.dispatchEvent(new CustomEvent('crear-asignacion', {
                    detail: { idPersona, idRol, idClinica },
                    bubbles: true,
                    composed: true,
                }));
                this._mostrarFormNuevaAsignacion = false;
                this.render();
            });
        }

        // Cambio de clínica
        const selectClinica = this.shadowRoot.getElementById('selectClinica');
        if (selectClinica) {
            selectClinica.addEventListener('change', (e) => {
                this._idClinicaSeleccionada = e.target.value;
                this.render();
                this.dispatchEvent(new CustomEvent('seleccionar-clinica', {
                    detail: { idClinica: this._idClinicaSeleccionada },
                    bubbles: true,
                    composed: true,
                }));
            });
        }

        // Activar rol en sesión
        const btnActivar = this.shadowRoot.getElementById('btnActivarRol');
        const selectPR = this.shadowRoot.getElementById('selectPersonaRol');
        if (btnActivar && selectPR) {
            btnActivar.addEventListener('click', () => {
                const idPersonaRol = selectPR.value;
                if (!idPersonaRol) {
                    alert('Debes seleccionar una asignación de personal.');
                    return;
                }
                this.dispatchEvent(new CustomEvent('activar-rol', {
                    detail: { idPersonaRol },
                    bubbles: true,
                    composed: true,
                }));
            });
        }
    }
}

customElements.define('panel-contexto', PanelContexto);
export default PanelContexto;
