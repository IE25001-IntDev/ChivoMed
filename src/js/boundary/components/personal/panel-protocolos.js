import { escapeHtml } from '../../utils.js';

/**
 * Web Component: <panel-protocolos>
 * Diseñador de Protocolos y Workflows Clínicos (procedimiento.xhtml).
 * Permite:
 * 1. CRUD de Procedimientos Médicos (nombre, activo, observaciones).
 * 2. Pasos del Procedimiento (nombre, rol responsable, indicaFin).
 * 3. Exámenes autorizados por paso (ProcedimientoPasoExamen).
 * 4. Secuencia y orden entre pasos (ProcedimientoPasoSecuencia).
 *
 * Emite: 'guardar-procedimiento', 'eliminar-procedimiento', 'seleccionar-procedimiento',
 *        'crear-paso', 'eliminar-paso', 'seleccionar-paso',
 *        'vincular-examen-paso-config', 'eliminar-examen-paso-config'
 */
class PanelProtocolos extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._procedimientos = [];
        this._roles = [];
        this._examenes = [];
        this._procedimientoSeleccionadoId = null;
        this._pasoSeleccionadoId = null;
        this._pasos = [];
        this._examenesConfigurados = [];
        this._secuencias = [];
        this._subPestaña = 'procedimiento'; // 'procedimiento', 'pasos', 'examenes-paso'
        this._mostrarFormProc = false;
        this._mostrarFormPaso = false;
        this._mostrarFormPasoExamen = false;
        this._procEnEdicion = null;
        this._cargando = false;
    }

    set procedimientos(val) { this._procedimientos = Array.isArray(val) ? val : []; this.render(); }
    set roles(val) { this._roles = Array.isArray(val) ? val : []; this.render(); }
    set examenes(val) { this._examenes = Array.isArray(val) ? val : []; this.render(); }
    set procedimientoSeleccionadoId(val) { this._procedimientoSeleccionadoId = val; this.render(); }
    set pasoSeleccionadoId(val) { this._pasoSeleccionadoId = val; this.render(); }
    set pasos(val) { this._pasos = Array.isArray(val) ? val : []; this.render(); }
    set examenesConfigurados(val) { this._examenesConfigurados = Array.isArray(val) ? val : []; this.render(); }
    set secuencias(val) { this._secuencias = Array.isArray(val) ? val : []; this.render(); }
    set cargando(val) { this._cargando = Boolean(val); this.render(); }

    cerrarFormulario() {
        this._mostrarFormProc = false;
        this._mostrarFormPaso = false;
        this._mostrarFormPasoExamen = false;
        this._procEnEdicion = null;
        this.render();
    }

    connectedCallback() {
        this._onKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (this._mostrarFormProc || this._mostrarFormPaso || this._mostrarFormPasoExamen) {
                    this._mostrarFormProc = false;
                    this._mostrarFormPaso = false;
                    this._mostrarFormPasoExamen = false;
                    this._procEnEdicion = null;
                    this.render();
                }
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
        const procActivo = this._procedimientos.find(p => p.idProcedimiento === this._procedimientoSeleccionadoId);
        const pasoActivo = this._pasos.find(p => p.idProcedimientoPaso === this._pasoSeleccionadoId);

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
                .title-box h3 { font-size: 1.35rem; font-weight: 700; color: var(--text, #e2f0eb); margin: 0; }
                .title-box p { font-size: 0.92rem; color: var(--muted, #a2b9b8); margin: 0; line-height: 1.5; }
                .nav-pills {
                    display: flex;
                    gap: 0.65rem;
                    margin-bottom: 2.25rem;
                    background: var(--surface-muted, rgba(0, 0, 0, 0.15));
                    padding: 0.55rem;
                    border-radius: 9999px;
                    border: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                    width: fit-content;
                    flex-wrap: wrap;
                }
                .pill-btn {
                    padding: 0.7rem 1.35rem;
                    border-radius: 9999px;
                    font-size: 0.9rem;
                    font-weight: 600;
                    border: 1px solid transparent;
                    background: transparent;
                    color: var(--muted, #a2b9b8);
                    cursor: pointer;
                    transition: all 0.22s var(--ease-spring, cubic-bezier(0.16, 1, 0.3, 1));
                }
                .pill-btn:hover:not(:disabled) {
                    color: var(--text, #e2f0eb);
                    background: var(--surface-muted, rgba(255, 255, 255, 0.05));
                }
                .pill-btn.active {
                    background: var(--accent, #78d4b0);
                    color: var(--on-accent, #122e2a);
                    font-weight: 700;
                    box-shadow: 0 2px 10px var(--glow-mint);
                }
                .pill-btn:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
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
                .btn-sm {
                    padding: 0.5rem 1.1rem;
                    font-size: 0.85rem;
                    gap: 0.55rem;
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
                }
                .btn-outline {
                    background: transparent;
                    border: 1px solid var(--border-strong, rgba(172, 223, 206, 0.25));
                    color: var(--text, #e2f0eb);
                }
                .btn-outline:hover:not(:disabled) {
                    background: rgba(255, 255, 255, 0.05);
                    border-color: var(--accent, #78d4b0);
                }
                .btn-danger {
                    background: rgba(239, 68, 68, 0.15);
                    color: #f87171;
                    border: 1px solid rgba(239, 68, 68, 0.3);
                }
                .btn-danger:hover:not(:disabled) {
                    background: rgba(239, 68, 68, 0.3);
                }
                .btn:disabled { opacity: 0.5; cursor: not-allowed; }

                .table-container {
                    overflow-x: auto;
                    border: 1px solid var(--border, rgba(172, 223, 206, 0.15));
                    border-radius: 16px;
                    background: var(--surface-solid, #20383d);
                    flex: 1;
                    min-height: 360px;
                }
                table { width: 100%; border-collapse: collapse; font-size: 0.9rem; text-align: left; }
                th {
                    background: var(--table-header-bg, rgba(0, 0, 0, 0.25));
                    color: var(--muted, #a2b9b8);
                    padding: 1.15rem 1.5rem;
                    font-weight: 700;
                    border-bottom: 1px solid var(--border, rgba(172, 223, 206, 0.15));
                }
                td {
                    padding: 1.15rem 1.5rem;
                    border-bottom: 1px solid rgba(172, 223, 206, 0.08);
                    color: var(--text, #e2f0eb);
                }
                tr:hover { background: rgba(255, 255, 255, 0.04); }
                tr.selected-row { background: var(--mint-soft, rgba(120, 212, 176, 0.18)); }
                .table-actions {
                    display: inline-flex;
                    gap: 0.65rem;
                    align-items: center;
                }

                .badge {
                    display: inline-block;
                    padding: 0.25rem 0.65rem;
                    border-radius: 9999px;
                    font-size: 0.75rem;
                    font-weight: 700;
                }
                .badge-active { background: var(--mint-soft, #284b43); color: var(--accent-text, #8bdbbc); border: 1px solid var(--border-strong, rgba(160, 208, 193, 0.25)); }
                .badge-inactive { background: rgba(0, 0, 0, 0.2); color: var(--muted, #a2b9b8); border: 1px solid var(--border, rgba(172, 223, 206, 0.12)); }

                .form-card {
                    background: var(--surface-muted, rgba(0, 0, 0, 0.2));
                    border: 1px solid var(--border-strong, rgba(172, 223, 206, 0.2));
                    border-radius: 14px;
                    padding: 1.75rem;
                    margin-bottom: 1.75rem;
                }

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
                .form-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
                    gap: 1.5rem;
                    margin-bottom: 1.5rem;
                }
                .form-group { display: flex; flex-direction: column; gap: 0.65rem; }
                .form-label { font-size: 0.9rem; font-weight: 700; color: var(--text, #e2f0eb); }
                .input-field {
                    padding: 0.8rem 1.15rem;
                    min-height: 3rem;
                    border: 1px solid var(--border-strong, rgba(172, 223, 206, 0.25));
                    border-radius: 12px;
                    font-size: 0.92rem;
                    font-family: inherit;
                    box-sizing: border-box;
                    background: var(--input-bg, var(--surface-solid, #20383d));
                    color: var(--text, #e2f0eb);
                    outline: none;
                }
                .input-field:focus {
                    border-color: var(--accent, #78d4b0);
                    box-shadow: 0 0 0 2px rgba(120, 212, 176, 0.2);
                }
                .input-field option {
                    background: var(--surface-solid, #172a2e);
                    color: var(--text, #e2f0eb);
                }
                .callout-active {
                    background: var(--mint-soft, #284b43);
                    border: 1px solid var(--border-strong, rgba(160, 208, 193, 0.25));
                    border-radius: 16px;
                    padding: 1.5rem 2rem;
                    margin-bottom: 2rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 0.92rem;
                    color: var(--accent-text, #8bdbbc);
                    font-weight: 600;
                    gap: 1.25rem;
                    flex-wrap: wrap;
                }
            </style>

            <div class="section-header">
                <div class="title-box">
                    <h3>⚙️ Protocolos</h3>
                    <p>Procedimientos, pasos y exámenes autorizados.</p>
                </div>

                ${this._subPestaña === 'procedimiento' ? `
                    <button type="button" class="btn btn-primary" id="btnToggleProcForm">
                        ➕ Nuevo
                    </button>
                ` : ''}
            </div>

            <div class="nav-pills" role="tablist">
                <button type="button" class="pill-btn ${this._subPestaña === 'procedimiento' ? 'active' : ''}" data-tab="procedimiento">
                    Procedimientos (${this._procedimientos.length})
                </button>
                <button type="button" class="pill-btn ${this._subPestaña === 'pasos' ? 'active' : ''}" data-tab="pasos" ${!procActivo ? 'disabled' : ''}>
                    Pasos ${procActivo ? `(${this._pasos.length})` : ''}
                </button>
                <button type="button" class="pill-btn ${this._subPestaña === 'examenes-paso' ? 'active' : ''}" data-tab="examenes-paso" ${!pasoActivo ? 'disabled' : ''}>
                    Exámenes ${pasoActivo ? `(${this._examenesConfigurados.length})` : ''}
                </button>
            </div>

            <!-- PESTAÑA 1: PROCEDIMIENTOS -->
            ${this._subPestaña === 'procedimiento' ? `
                ${this._mostrarFormProc ? `
                    <div class="modal-backdrop" id="modalBackdropProc">
                        <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modalProcTitle">
                            <div class="modal-header">
                                <div>
                                    <h4 id="modalProcTitle" class="modal-title">
                                        ${this._procEnEdicion ? '✏️ Editar Protocolo' : '➕ Nuevo Protocolo'}
                                    </h4>
                                    <div class="modal-subtitle">
                                        ${this._procEnEdicion ? `ID: ${escapeHtml(this._procEnEdicion.idProcedimiento || '')}` : 'Define un flujo clínico y sus características.'}
                                    </div>
                                </div>
                                <button type="button" class="btn-close-modal" id="btnCloseModalProc" title="Cerrar ventana emergente" aria-label="Cerrar">✕</button>
                            </div>
                            <form id="formProc">
                                <div class="form-grid">
                                    <div class="form-group">
                                        <label class="form-label" for="procNombre">Nombre: *</label>
                                        <input type="text" class="input-field" id="procNombre" required placeholder="Ej: Consulta Externa, Triage..." value="${escapeHtml(this._procEnEdicion?.nombre || '')}"/>
                                    </div>
                                    <div class="form-group" style="flex-direction: row; align-items: center; gap: 0.5rem; margin-top: 1.5rem;">
                                        <input type="checkbox" id="procActivo" ${this._procEnEdicion ? (this._procEnEdicion.activo ? 'checked' : '') : 'checked'}/>
                                        <label class="form-label" for="procActivo">Estado Activo</label>
                                    </div>
                                    <div class="form-group" style="grid-column: 1 / -1;">
                                        <label class="form-label" for="procObs">Observaciones:</label>
                                        <input type="text" class="input-field" id="procObs" placeholder="Descripción general del flujo..." value="${escapeHtml(this._procEnEdicion?.observaciones || '')}"/>
                                    </div>
                                </div>
                                <div style="display: flex; justify-content: flex-end; gap: 0.85rem; margin-top: 1.5rem;">
                                    <button type="button" class="btn btn-outline" id="btnCancelProc">✕ Cancelar</button>
                                    <button type="submit" class="btn btn-primary" ${this._cargando ? 'disabled' : ''}>
                                        ${this._cargando ? '⏳ Guardando...' : '💾 Guardar'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                ` : ''}

                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Nombre del Procedimiento</th>
                                <th>Estado</th>
                                <th>Observaciones</th>
                                <th style="text-align: right;">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this._procedimientos.length === 0 ? `
                                <tr><td colspan="4" style="text-align: center; color: var(--muted, #a2b9b8); padding: 2rem;">No hay procedimientos registrados. Crea uno arriba.</td></tr>
                            ` : this._procedimientos.map(pr => {
                                const isSelected = pr.idProcedimiento === this._procedimientoSeleccionadoId;
                                return `
                                    <tr class="${isSelected ? 'selected-row' : ''}">
                                        <td><strong>${escapeHtml(pr.nombre)}</strong></td>
                                        <td><span class="badge ${pr.activo ? 'badge-active' : 'badge-inactive'}">${pr.activo ? 'Activo' : 'Inactivo'}</span></td>
                                        <td style="color: var(--muted, #a2b9b8);">${escapeHtml(pr.observaciones || '—')}</td>
                                        <td style="text-align: right; white-space: nowrap;">
                                            <div class="table-actions">
                                                <button type="button" class="btn btn-sm btn-primary btn-select-proc" data-id="${escapeHtml(pr.idProcedimiento)}">
                                                    ${isSelected ? '✔️ Activo' : '⚙️ Pasos'}
                                                </button>
                                                <button type="button" class="btn btn-sm btn-outline btn-edit-proc" data-id="${escapeHtml(pr.idProcedimiento)}">✏️ Editar</button>
                                                <button type="button" class="btn btn-sm btn-danger btn-del-proc" data-id="${escapeHtml(pr.idProcedimiento)}">🗑️ Eliminar</button>
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            ` : ''}

            <!-- PESTAÑA 2: PASOS Y ROLES RESPONSABLES -->
            ${this._subPestaña === 'pasos' ? `
                ${procActivo ? `
                    <div class="callout-active">
                        <div>
                            <span>Procedimiento: <strong>${escapeHtml(procActivo.nombre)}</strong></span>
                            <span style="font-size: 0.8rem; margin-left: 0.75rem; opacity: 0.8;">ID: ${escapeHtml(procActivo.idProcedimiento.slice(0, 8))}...</span>
                        </div>
                        <button type="button" class="btn btn-primary" id="btnTogglePasoForm">➕ Paso</button>
                    </div>

                    ${this._mostrarFormPaso ? `
                        <div class="modal-backdrop" id="modalBackdropPaso">
                            <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modalPasoTitle">
                                <div class="modal-header">
                                    <div>
                                        <h4 id="modalPasoTitle" class="modal-title">➕ Agregar Paso</h4>
                                        <div class="modal-subtitle">Protocolo: <strong>${escapeHtml(procActivo.nombre)}</strong></div>
                                    </div>
                                    <button type="button" class="btn-close-modal" id="btnCloseModalPaso" title="Cerrar ventana emergente" aria-label="Cerrar">✕</button>
                                </div>
                                <form id="formPaso">
                                    <div class="form-grid">
                                        <div class="form-group">
                                            <label class="form-label" for="pasoNombre">Nombre del Paso: *</label>
                                            <input type="text" class="input-field" id="pasoNombre" required placeholder="Ej: Toma de signos vitales..."/>
                                        </div>
                                        <div class="form-group">
                                            <label class="form-label" for="pasoRol">Rol Responsable: *</label>
                                            <select class="input-field" id="pasoRol" required>
                                                <option value="">-- Seleccionar Rol --</option>
                                                ${this._roles.map(r => `
                                                    <option value="${escapeHtml(r.idRol)}">${escapeHtml(r.nombre)}</option>
                                                `).join('')}
                                            </select>
                                        </div>
                                        <div class="form-group">
                                            <label class="form-label" for="pasoPrevio">Paso Previo (Opcional):</label>
                                            <select class="input-field" id="pasoPrevio">
                                                <option value="">-- Inicial (Sin predecesor) --</option>
                                                ${this._pasos.map(p => `
                                                    <option value="${escapeHtml(p.idProcedimientoPaso)}">${escapeHtml(p.nombre)}</option>
                                                `).join('')}
                                            </select>
                                        </div>
                                        <div class="form-group" style="flex-direction: row; align-items: center; gap: 0.5rem; margin-top: 1.5rem;">
                                            <input type="checkbox" id="pasoIndicaFin"/>
                                            <label class="form-label" for="pasoIndicaFin">Indica Fin</label>
                                        </div>
                                    </div>
                                    <div style="display: flex; justify-content: flex-end; gap: 0.85rem; margin-top: 1.5rem;">
                                        <button type="button" class="btn btn-outline" id="btnCancelPaso">✕ Cancelar</button>
                                        <button type="submit" class="btn btn-primary" ${this._cargando ? 'disabled' : ''}>
                                            ${this._cargando ? '⏳ Guardando...' : '💾 Guardar'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    ` : ''}

                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Nombre del Paso</th>
                                    <th>Rol Responsable</th>
                                    <th>Paso Previo</th>
                                    <th>Fin</th>
                                    <th style="text-align: right;">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this._pasos.length === 0 ? `
                                    <tr><td colspan="6" style="text-align: center; color: var(--muted, #a2b9b8); padding: 2rem;">No hay pasos definidos. Agrega uno arriba.</td></tr>
                                ` : this._pasos.map((paso, idx) => {
                                    const rol = this._roles.find(r => r.idRol === paso.idRol);
                                    const pasoPrev = paso.idPasoPrevio ? this._pasos.find(p => p.idProcedimientoPaso === paso.idPasoPrevio) : null;
                                    const isSelected = paso.idProcedimientoPaso === this._pasoSeleccionadoId;

                                    return `
                                        <tr class="${isSelected ? 'selected-row' : ''}">
                                            <td><strong>${idx + 1}</strong></td>
                                            <td><strong>${escapeHtml(paso.nombre)}</strong></td>
                                            <td><span class="badge badge-active">${escapeHtml(rol?.nombre || paso.idRol || 'Cualquiera')}</span></td>
                                            <td style="color: var(--muted, #a2b9b8); font-size: 0.8rem;">${pasoPrev ? escapeHtml(pasoPrev.nombre) : (paso.idPasoPrevio ? escapeHtml(paso.idPasoPrevio.slice(0, 8)) : '— (Inicial)')}</td>
                                            <td>${paso.indicaFin ? '🏁 Sí' : 'No'}</td>
                                            <td style="text-align: right; white-space: nowrap;">
                                                <div class="table-actions">
                                                    <button type="button" class="btn btn-sm btn-outline btn-select-paso" data-id="${escapeHtml(paso.idProcedimientoPaso)}">
                                                        ${isSelected ? '✔️ Activo' : '🔬 Exámenes'}
                                                    </button>
                                                    <button type="button" class="btn btn-sm btn-danger btn-del-paso" data-id="${escapeHtml(paso.idProcedimientoPaso)}">🗑️ Eliminar</button>
                                                </div>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : `
                    <div style="padding: 2.5rem; text-align: center; color: var(--muted, #a2b9b8);">
                        Primero selecciona un procedimiento en la pestaña 1.
                    </div>
                `}
            ` : ''}

            <!-- PESTAÑA 3: EXAMENES CONFIGURADOS POR PASO -->
            ${this._subPestaña === 'examenes-paso' ? `
                ${pasoActivo ? `
                    <div class="callout-active">
                        <div>
                            <span>Paso: <strong>${escapeHtml(pasoActivo.nombre)}</strong> (Procedimiento: ${escapeHtml(procActivo?.nombre)})</span>
                            <span style="font-size: 0.8rem; margin-left: 0.75rem; opacity: 0.8;">ID: ${escapeHtml(pasoActivo.idProcedimientoPaso.slice(0, 8))}...</span>
                        </div>
                        <button type="button" class="btn btn-primary" id="btnTogglePasoExForm">➕ Examen</button>
                    </div>

                    ${this._mostrarFormPasoExamen ? `
                        <div class="modal-backdrop" id="modalBackdropPasoEx">
                            <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modalPasoExTitle">
                                <div class="modal-header">
                                    <div>
                                        <h4 id="modalPasoExTitle" class="modal-title">🔗 Autorizar Examen</h4>
                                        <div class="modal-subtitle">Paso: <strong>${escapeHtml(pasoActivo.nombre)}</strong></div>
                                    </div>
                                    <button type="button" class="btn-close-modal" id="btnCloseModalPasoEx" title="Cerrar ventana emergente" aria-label="Cerrar">✕</button>
                                </div>
                                <form id="formPasoExamen">
                                    <div class="form-grid">
                                        <div class="form-group">
                                            <label class="form-label" for="selExamenPaso">Prueba Diagnóstica: *</label>
                                            <select class="input-field" id="selExamenPaso" required>
                                                <option value="">-- Seleccionar Examen --</option>
                                                ${this._examenes.map(ex => `
                                                    <option value="${escapeHtml(ex.idExamen)}">${escapeHtml(ex.nombre)}</option>
                                                `).join('')}
                                            </select>
                                        </div>
                                        <div class="form-group">
                                            <label class="form-label" for="obsPasoExamen">Observaciones:</label>
                                            <input type="text" class="input-field" id="obsPasoExamen" placeholder="Condiciones para ordenar esta prueba..."/>
                                        </div>
                                    </div>
                                    <div style="display: flex; justify-content: flex-end; gap: 0.85rem; margin-top: 1.5rem;">
                                        <button type="button" class="btn btn-outline" id="btnCancelPasoEx">✕ Cancelar</button>
                                        <button type="submit" class="btn btn-primary" ${this._cargando ? 'disabled' : ''}>
                                            ${this._cargando ? '⏳ Guardando...' : '💾 Guardar'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    ` : ''}

                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Examen Autorizado</th>
                                    <th>Observaciones</th>
                                    <th>Estado</th>
                                    <th style="text-align: right;">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${this._examenesConfigurados.length === 0 ? `
                                    <tr><td colspan="4" style="text-align: center; color: var(--muted, #a2b9b8); padding: 2rem;">No hay exámenes autorizados para este paso.</td></tr>
                                ` : this._examenesConfigurados.map(pe => {
                                    const ex = this._examenes.find(x => x.idExamen === pe.idExamen);
                                    return `
                                        <tr>
                                            <td><strong>${escapeHtml(ex?.nombre || pe.idExamen)}</strong></td>
                                            <td style="color: var(--muted, #a2b9b8);">${escapeHtml(pe.observaciones || '—')}</td>
                                            <td><span class="badge ${pe.activo ? 'badge-active' : 'badge-inactive'}">${pe.activo ? 'Activo' : 'Inactivo'}</span></td>
                                            <td style="text-align: right;">
                                                <button type="button" class="btn btn-sm btn-danger btn-del-paso-examen" data-id="${escapeHtml(pe.idProcedimientoPasoExamen)}">✕ Quitar</button>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : `
                    <div style="padding: 2.5rem; text-align: center; color: var(--muted, #a2b9b8);">
                        Primero selecciona un paso clínico en la pestaña 2.
                    </div>
                `}
            ` : ''}
        `;

        // Eventos de Pestaña
        this.shadowRoot.querySelectorAll('.pill-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this._subPestaña = e.currentTarget.dataset.tab;
                this._mostrarFormProc = false;
                this._mostrarFormPaso = false;
                this._mostrarFormPasoExamen = false;
                this.render();
            });
        });

        const btnToggleProc = this.shadowRoot.getElementById('btnToggleProcForm');
        if (btnToggleProc) {
            btnToggleProc.addEventListener('click', () => {
                this._mostrarFormProc = true;
                this.render();
            });
        }

        const btnCancelProc = this.shadowRoot.getElementById('btnCancelProc');
        if (btnCancelProc) {
            btnCancelProc.addEventListener('click', () => {
                this._mostrarFormProc = false;
                this._procEnEdicion = null;
                this.render();
            });
        }

        const btnCloseModalProc = this.shadowRoot.getElementById('btnCloseModalProc');
        if (btnCloseModalProc) {
            btnCloseModalProc.addEventListener('click', () => {
                this._mostrarFormProc = false;
                this._procEnEdicion = null;
                this.render();
            });
        }

        const modalBackdropProc = this.shadowRoot.getElementById('modalBackdropProc');
        if (modalBackdropProc) {
            modalBackdropProc.addEventListener('click', (e) => {
                if (e.target === modalBackdropProc) {
                    this._mostrarFormProc = false;
                    this._procEnEdicion = null;
                    this.render();
                }
            });
        }

        // Submit Procedimiento
        const formProc = this.shadowRoot.getElementById('formProc');
        if (formProc) {
            formProc.addEventListener('submit', (e) => {
                e.preventDefault();
                const nombre = this.shadowRoot.getElementById('procNombre').value.trim();
                const activo = this.shadowRoot.getElementById('procActivo').checked;
                const observaciones = this.shadowRoot.getElementById('procObs').value.trim() || null;
                const id = this._procEnEdicion ? this._procEnEdicion.idProcedimiento : null;

                this.dispatchEvent(new CustomEvent('guardar-procedimiento', {
                    detail: { id, datos: { nombre, activo, observaciones } },
                    bubbles: true,
                    composed: true,
                }));

                this._mostrarFormProc = false;
                this._procEnEdicion = null;
            });
        }

        // Seleccionar/Editar/Eliminar Procedimiento
        this.shadowRoot.querySelectorAll('.btn-select-proc').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                this._procedimientoSeleccionadoId = id;
                this._subPestaña = 'pasos';
                this.dispatchEvent(new CustomEvent('seleccionar-procedimiento', { detail: { id }, bubbles: true, composed: true }));
            });
        });

        this.shadowRoot.querySelectorAll('.btn-edit-proc').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                this._procEnEdicion = this._procedimientos.find(p => p.idProcedimiento === id);
                this._mostrarFormProc = true;
                this.render();
            });
        });

        this.shadowRoot.querySelectorAll('.btn-del-proc').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                if (!confirm('¿Deseas eliminar este procedimiento del catálogo?')) return;
                this.dispatchEvent(new CustomEvent('eliminar-procedimiento', { detail: { id }, bubbles: true, composed: true }));
            });
        });

        // Controles de Paso
        const btnTogglePaso = this.shadowRoot.getElementById('btnTogglePasoForm');
        if (btnTogglePaso) {
            btnTogglePaso.addEventListener('click', () => {
                this._mostrarFormPaso = true;
                this.render();
            });
        }

        const btnCancelPaso = this.shadowRoot.getElementById('btnCancelPaso');
        if (btnCancelPaso) {
            btnCancelPaso.addEventListener('click', () => {
                this._mostrarFormPaso = false;
                this.render();
            });
        }

        const btnCloseModalPaso = this.shadowRoot.getElementById('btnCloseModalPaso');
        if (btnCloseModalPaso) {
            btnCloseModalPaso.addEventListener('click', () => {
                this._mostrarFormPaso = false;
                this.render();
            });
        }

        const modalBackdropPaso = this.shadowRoot.getElementById('modalBackdropPaso');
        if (modalBackdropPaso) {
            modalBackdropPaso.addEventListener('click', (e) => {
                if (e.target === modalBackdropPaso) {
                    this._mostrarFormPaso = false;
                    this.render();
                }
            });
        }

        // Submit Paso
        const formPaso = this.shadowRoot.getElementById('formPaso');
        if (formPaso) {
            formPaso.addEventListener('submit', (e) => {
                e.preventDefault();
                const nombre = this.shadowRoot.getElementById('pasoNombre').value.trim();
                const idRol = this.shadowRoot.getElementById('pasoRol').value;
                const indicaFin = this.shadowRoot.getElementById('pasoIndicaFin').checked;
                const idPasoPrevio = this.shadowRoot.getElementById('pasoPrevio')?.value || null;

                const datos = {
                    idProcedimiento: this._procedimientoSeleccionadoId,
                    nombre,
                    idRol,
                    indicaFin,
                };
                if (idPasoPrevio) {
                    datos.idPasoPrevio = idPasoPrevio;
                }

                this.dispatchEvent(new CustomEvent('crear-paso', {
                    detail: {
                        idProcedimiento: this._procedimientoSeleccionadoId,
                        datos,
                    },
                    bubbles: true,
                    composed: true,
                }));

                this._mostrarFormPaso = false;
                formPaso.reset();
            });
        }

        // Seleccionar/Eliminar Paso
        this.shadowRoot.querySelectorAll('.btn-select-paso').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                this._pasoSeleccionadoId = id;
                this._subPestaña = 'examenes-paso';
                this.dispatchEvent(new CustomEvent('seleccionar-paso', { detail: { id }, bubbles: true, composed: true }));
            });
        });

        this.shadowRoot.querySelectorAll('.btn-del-paso').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                if (!confirm('¿Deseas eliminar este paso del procedimiento?')) return;
                this.dispatchEvent(new CustomEvent('eliminar-paso', { detail: { id }, bubbles: true, composed: true }));
            });
        });

        // Controles de Examen en Paso
        const btnTogglePasoEx = this.shadowRoot.getElementById('btnTogglePasoExForm');
        if (btnTogglePasoEx) {
            btnTogglePasoEx.addEventListener('click', () => {
                this._mostrarFormPasoExamen = true;
                this.render();
            });
        }

        const btnCancelPasoEx = this.shadowRoot.getElementById('btnCancelPasoEx');
        if (btnCancelPasoEx) {
            btnCancelPasoEx.addEventListener('click', () => {
                this._mostrarFormPasoExamen = false;
                this.render();
            });
        }

        const btnCloseModalPasoEx = this.shadowRoot.getElementById('btnCloseModalPasoEx');
        if (btnCloseModalPasoEx) {
            btnCloseModalPasoEx.addEventListener('click', () => {
                this._mostrarFormPasoExamen = false;
                this.render();
            });
        }

        const modalBackdropPasoEx = this.shadowRoot.getElementById('modalBackdropPasoEx');
        if (modalBackdropPasoEx) {
            modalBackdropPasoEx.addEventListener('click', (e) => {
                if (e.target === modalBackdropPasoEx) {
                    this._mostrarFormPasoExamen = false;
                    this.render();
                }
            });
        }

        // Submit Examen en Paso
        const formPasoEx = this.shadowRoot.getElementById('formPasoExamen');
        if (formPasoEx) {
            formPasoEx.addEventListener('submit', (e) => {
                e.preventDefault();
                const idExamen = this.shadowRoot.getElementById('selExamenPaso').value;
                const observaciones = this.shadowRoot.getElementById('obsPasoExamen').value.trim() || null;

                this.dispatchEvent(new CustomEvent('vincular-examen-paso-config', {
                    detail: {
                        idProcedimientoPaso: this._pasoSeleccionadoId,
                        datos: {
                            idProcedimientoPaso: this._pasoSeleccionadoId,
                            idExamen,
                            observaciones,
                            activo: true,
                        },
                    },
                    bubbles: true,
                    composed: true,
                }));

                this._mostrarFormPasoExamen = false;
            });
        }

        this.shadowRoot.querySelectorAll('.btn-del-paso-examen').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                if (!confirm('¿Deseas quitar este examen del paso?')) return;
                this.dispatchEvent(new CustomEvent('eliminar-examen-paso-config', { detail: { id }, bubbles: true, composed: true }));
            });
        });
    }
}

customElements.define('panel-protocolos', PanelProtocolos);
export default PanelProtocolos;
