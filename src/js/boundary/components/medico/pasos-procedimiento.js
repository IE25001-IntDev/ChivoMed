import { escapeHtml } from '../../utils.js';

/**
 * Web Component: <pasos-procedimiento>
 * Componente presentacional para los procedimientos clínicos y sus pasos asignados.
 * Emite: 'asignar-responsable', 'completar-paso', 'seleccionar-paso', 'agregar-procedimiento'
 */
class PasosProcedimiento extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._procedimientos = [];
        this._catalogoProcedimientos = [];
        this._pasoSeleccionadoId = null;
        this._idPersonaRolDoctor = null;
        this._consultaCerrada = false;
        this._accionEnCurso = null; // idPaso o 'agregar-proc'
    }

    set procedimientos(val) {
        this._procedimientos = Array.isArray(val) ? val : [];
        this.render();
    }

    get procedimientos() {
        return this._procedimientos;
    }

    set catalogoProcedimientos(val) {
        this._catalogoProcedimientos = Array.isArray(val) ? val : [];
        this.render();
    }

    set pasoSeleccionadoId(val) {
        this._pasoSeleccionadoId = val;
        this.render();
    }

    set idPersonaRolDoctor(val) {
        this._idPersonaRolDoctor = val;
        this.render();
    }

    set consultaCerrada(val) {
        this._consultaCerrada = Boolean(val);
        this.render();
    }

    set accionEnCurso(val) {
        this._accionEnCurso = val;
        this.render();
    }

    connectedCallback() {
        this.render();
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    background: var(--glass, rgba(29, 51, 56, 0.7));
                    backdrop-filter: blur(24px);
                    -webkit-backdrop-filter: blur(24px);
                    border: 1px solid var(--border, rgba(172, 223, 206, 0.14));
                    border-radius: 16px;
                    padding: 1.5rem;
                    box-shadow: var(--glass-shadow);
                }
                .section-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1.25rem;
                    border-bottom: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                    padding-bottom: 0.85rem;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                }
                .title {
                    font-size: 1.15rem;
                    font-weight: 700;
                    color: var(--text, #e2f0eb);
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .add-proc-bar {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .select-proc {
                    padding: 0.45rem 0.85rem;
                    border-radius: 9999px;
                    border: 1px solid var(--border-strong, rgba(172, 223, 206, 0.25));
                    background: var(--surface-solid, #20383d);
                    color: var(--text, #e2f0eb);
                    font-size: 0.85rem;
                    outline: none;
                }
                .select-proc option {
                    background: #172a2e;
                    color: #e2f0eb;
                }
                .btn {
                    padding: 0.45rem 0.95rem;
                    border-radius: 9999px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    border: none;
                    transition: all 0.15s ease;
                    display: inline-flex;
                    align-items: center;
                    gap: 0.35rem;
                }
                .btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .btn-primary {
                    background: var(--accent, #78d4b0);
                    color: var(--on-accent, #122e2a);
                    font-weight: 700;
                }
                .btn-primary:hover:not(:disabled) {
                    background: #8bdbbc;
                    box-shadow: 0 0 12px rgba(120, 212, 176, 0.3);
                }
                .btn-success {
                    background: #10b981;
                    color: #064e3b;
                    font-weight: 700;
                }
                .btn-success:hover:not(:disabled) {
                    background: #34d399;
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
                .proc-card {
                    border: 1px solid var(--border, rgba(172, 223, 206, 0.15));
                    border-radius: 12px;
                    margin-bottom: 1rem;
                    overflow: hidden;
                    background: rgba(0, 0, 0, 0.18);
                }
                .proc-header {
                    background: rgba(255, 255, 255, 0.03);
                    padding: 0.75rem 1rem;
                    border-bottom: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .proc-title {
                    font-weight: 700;
                    font-size: 0.95rem;
                    color: var(--text, #e2f0eb);
                }
                .steps-list {
                    padding: 0.85rem 1rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }
                .step-item {
                    border: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                    border-radius: 10px;
                    padding: 0.85rem 1rem;
                    background: var(--surface-solid, #20383d);
                    transition: all 0.15s;
                }
                .step-item.selected {
                    border-color: var(--accent, #78d4b0);
                    box-shadow: 0 0 0 2px rgba(120, 212, 176, 0.25);
                }
                .step-item.completed {
                    border-left: 4px solid var(--accent, #78d4b0);
                }
                .step-top {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 0.5rem;
                }
                .step-name {
                    font-weight: 700;
                    font-size: 0.9rem;
                    color: var(--text, #e2f0eb);
                }
                .badge-step {
                    font-size: 0.7rem;
                    font-weight: 700;
                    padding: 0.2rem 0.5rem;
                    border-radius: 9999px;
                    text-transform: uppercase;
                }
                .badge-completed {
                    background: var(--mint-soft, #284b43);
                    color: var(--accent-text, #8bdbbc);
                    border: 1px solid var(--border-strong, rgba(160, 208, 193, 0.25));
                }
                .badge-pending {
                    background: rgba(245, 158, 11, 0.15);
                    color: #fbbf24;
                    border: 1px solid rgba(245, 158, 11, 0.3);
                }
                .step-body {
                    display: flex;
                    flex-direction: column;
                    gap: 0.65rem;
                }
                .step-input {
                    width: 100%;
                    box-sizing: border-box;
                    padding: 0.6rem 0.75rem;
                    border: 1px solid var(--border-strong, rgba(172, 223, 206, 0.25));
                    border-radius: 8px;
                    font-size: 0.85rem;
                    resize: vertical;
                    min-height: 55px;
                    background: rgba(0, 0, 0, 0.25);
                    color: var(--text, #e2f0eb);
                    font-family: inherit;
                    outline: none;
                }
                .step-input:focus {
                    border-color: var(--accent, #78d4b0);
                    box-shadow: 0 0 0 2px rgba(120, 212, 176, 0.2);
                }
                .step-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 0.5rem;
                    align-items: center;
                    flex-wrap: wrap;
                }
                .step-meta {
                    font-size: 0.78rem;
                    color: var(--muted, #a2b9b8);
                    margin-right: auto;
                }
                .empty-procs {
                    padding: 2.5rem 1rem;
                    text-align: center;
                    color: var(--muted, #a2b9b8);
                    border: 1px dashed var(--border-strong, rgba(172, 223, 206, 0.25));
                    border-radius: 12px;
                }
            </style>

            <div class="section-header">
                <div class="title">
                    <span>🩺 Procedimientos y Pasos Clínicos</span>
                </div>

                ${!this._consultaCerrada ? `
                    <div class="add-proc-bar">
                        <select class="select-proc" id="selectNuevoProc">
                            <option value="">-- Seleccionar Procedimiento --</option>
                            ${this._catalogoProcedimientos.map(p => `
                                <option value="${escapeHtml(p.idProcedimiento)}">${escapeHtml(p.nombre)}</option>
                            `).join('')}
                        </select>
                        <button type="button" class="btn btn-primary" id="btnAddProc" ${this._accionEnCurso === 'agregar-proc' ? 'disabled' : ''}>
                            ${this._accionEnCurso === 'agregar-proc' ? '⏳ Agregando...' : '+ Agregar'}
                        </button>
                    </div>
                ` : ''}
            </div>

            <div class="procs-container">
                ${this._procedimientos.length === 0 ? `
                    <div class="empty-procs">
                        <p>No hay procedimientos asociados a esta consulta aún.</p>
                        ${!this._consultaCerrada ? '<p style="font-size: 0.85rem; margin-top: 0.35rem;">Selecciona uno arriba para iniciarlo.</p>' : ''}
                    </div>
                ` : this._procedimientos.map(proc => `
                    <div class="proc-card">
                        <div class="proc-header">
                            <span class="proc-title">🔬 ${escapeHtml(proc.nombre || 'Procedimiento Médico')}</span>
                            <span style="font-size: 0.8rem; color: var(--muted, #a2b9b8);">ID: ${escapeHtml((proc.idConsultaProcedimiento || '').slice(0, 8))}</span>
                        </div>

                        <div class="steps-list">
                            ${(proc.pasos || []).length === 0 ? `
                                <div style="color: var(--muted, #a2b9b8); font-size: 0.85rem; padding: 0.5rem;">
                                    No hay pasos registrados para este procedimiento.
                                </div>
                            ` : proc.pasos.map((paso, idx) => {
                                const isSelected = paso.idConsultaProcedimientoPaso === this._pasoSeleccionadoId;
                                const isCompleted = paso.estado === 'COMPLETADO' || Boolean(paso.fechaFin);
                                const isMine = paso.idPersonaRol === this._idPersonaRolDoctor;
                                const isWorking = this._accionEnCurso === paso.idConsultaProcedimientoPaso;

                                return `
                                    <div class="step-item ${isSelected ? 'selected' : ''} ${isCompleted ? 'completed' : ''}" data-id="${escapeHtml(paso.idConsultaProcedimientoPaso)}">
                                        <div class="step-top">
                                            <span class="step-name">Paso ${idx + 1}: ${escapeHtml(paso.nombrePaso || paso.idProcedimientoPaso || 'Paso Clínico')}</span>
                                            <span class="badge-step ${isCompleted ? 'badge-completed' : 'badge-pending'}">
                                                ${escapeHtml(paso.estado || (isCompleted ? 'Completado' : 'Pendiente'))}
                                            </span>
                                        </div>

                                        <div class="step-body">
                                            ${isCompleted ? `
                                                <div style="font-size: 0.85rem; color: var(--text, #e2f0eb); background: rgba(0, 0, 0, 0.25); border: 1px solid var(--border, rgba(172, 223, 206, 0.12)); padding: 0.6rem 0.85rem; border-radius: 6px;">
                                                    <strong>Resultado/Nota registrada:</strong> ${escapeHtml(paso.valor || 'Sin notas adicionales.')}
                                                </div>
                                            ` : `
                                                <textarea
                                                    class="step-input"
                                                    id="inputVal-${escapeHtml(paso.idConsultaProcedimientoPaso)}"
                                                    placeholder="Escribe aquí las observaciones clínicas, diagnóstico o resultado de este paso..."
                                                >${escapeHtml(paso.valor || '')}</textarea>
                                            `}

                                            <div class="step-actions">
                                                <span class="step-meta">
                                                    ${paso.idPersonaRol
                                                        ? (isMine ? '✅ Asignado a ti' : `👤 Responsable: ${escapeHtml(paso.idPersonaRol.slice(0, 8))}...`)
                                                        : '⚠️ Sin responsable asignado'}
                                                </span>

                                                <button type="button" class="btn btn-outline btn-select-paso" data-id="${escapeHtml(paso.idConsultaProcedimientoPaso)}">
                                                    🔬 Ver Exámenes
                                                </button>

                                                ${!isCompleted && !this._consultaCerrada ? `
                                                    ${!isMine ? `
                                                        <button type="button" class="btn btn-outline btn-asignar" data-id="${escapeHtml(paso.idConsultaProcedimientoPaso)}" ${isWorking ? 'disabled' : ''}>
                                                            ${isWorking ? '⏳...' : '✋ Asignarme'}
                                                        </button>
                                                    ` : ''}

                                                    <button type="button" class="btn btn-success btn-completar" data-id="${escapeHtml(paso.idConsultaProcedimientoPaso)}" ${isWorking ? 'disabled' : ''}>
                                                        ${isWorking ? '⏳ Guardando...' : '✔️ Completar Paso'}
                                                    </button>
                                                ` : ''}
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        const btnAdd = this.shadowRoot.getElementById('btnAddProc');
        const selectProc = this.shadowRoot.getElementById('selectNuevoProc');
        if (btnAdd && selectProc) {
            btnAdd.addEventListener('click', () => {
                const idProcedimiento = selectProc.value;
                if (!idProcedimiento) return;
                this.dispatchEvent(new CustomEvent('agregar-procedimiento', {
                    detail: { idProcedimiento },
                    bubbles: true,
                    composed: true,
                }));
            });
        }

        this.shadowRoot.querySelectorAll('.btn-asignar').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idPaso = e.target.dataset.id;
                this.dispatchEvent(new CustomEvent('asignar-responsable', {
                    detail: { idPaso },
                    bubbles: true,
                    composed: true,
                }));
            });
        });

        this.shadowRoot.querySelectorAll('.btn-completar').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idPaso = e.target.dataset.id;
                const input = this.shadowRoot.getElementById(`inputVal-${idPaso}`);
                const valor = input ? input.value : '';
                this.dispatchEvent(new CustomEvent('completar-paso', {
                    detail: { idPaso, valor },
                    bubbles: true,
                    composed: true,
                }));
            });
        });

        this.shadowRoot.querySelectorAll('.btn-select-paso').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idPaso = e.target.dataset.id;
                this._pasoSeleccionadoId = idPaso;
                this.render();
                this.dispatchEvent(new CustomEvent('seleccionar-paso', {
                    detail: { idPaso },
                    bubbles: true,
                    composed: true,
                }));
            });
        });
    }
}

customElements.define('pasos-procedimiento', PasosProcedimiento);
export default PasosProcedimiento;
