import { escapeHtml, formatearFecha } from '../../utils.js';

/**
 * Web Component: <ordenes-examen>
 * Componente presentacional para gestionar órdenes de exámenes y sus resultados dentro de un paso clínico.
 * Emite: 'crear-orden-examen', 'registrar-resultado-examen'
 */
class OrdenesExamen extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._idPaso = null;
        this._ordenes = [];
        this._consultaCerrada = false;
        this._mostrarFormResultado = null;
        this._cargando = false;
    }

    set idPaso(val) {
        this._idPaso = val;
        this.render();
    }

    get idPaso() {
        return this._idPaso;
    }

    set ordenes(val) {
        this._ordenes = Array.isArray(val) ? val : [];
        this.render();
    }

    get ordenes() {
        return this._ordenes;
    }

    set consultaCerrada(val) {
        this._consultaCerrada = Boolean(val);
        this.render();
    }

    set cargando(val) {
        this._cargando = Boolean(val);
        this.render();
    }

    connectedCallback() {
        this.render();
    }

    render() {
        if (!this._idPaso) {
            this.shadowRoot.innerHTML = `
                <style>
                    :host {
                        display: block;
                        background: var(--glass, rgba(29, 51, 56, 0.7));
                        backdrop-filter: blur(20px);
                        -webkit-backdrop-filter: blur(20px);
                        border: 1px dashed var(--border-strong, rgba(172, 223, 206, 0.25));
                        border-radius: 16px;
                        padding: 2rem 1.5rem;
                        text-align: center;
                        color: var(--muted, #a2b9b8);
                        font-size: 0.9rem;
                    }
                </style>
                <div>🔬 Selecciona un paso de procedimiento arriba para gestionar sus órdenes de examen o laboratorio.</div>
            `;
            return;
        }

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
                    border-bottom: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                    padding-bottom: 0.85rem;
                    margin-bottom: 1.25rem;
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
                .btn {
                    padding: 0.45rem 0.95rem;
                    border-radius: 9999px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    border: none;
                    transition: all 0.15s;
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
                .order-form {
                    background: rgba(0, 0, 0, 0.2);
                    border: 1px solid var(--border-strong, rgba(172, 223, 206, 0.2));
                    border-radius: 12px;
                    padding: 1.15rem;
                    margin-bottom: 1.25rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }
                .form-label {
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: var(--text, #e2f0eb);
                }
                .input-text {
                    padding: 0.6rem 0.85rem;
                    border: 1px solid var(--border-strong, rgba(172, 223, 206, 0.25));
                    border-radius: 8px;
                    font-size: 0.85rem;
                    width: 100%;
                    box-sizing: border-box;
                    background: var(--surface-solid, #20383d);
                    color: var(--text, #e2f0eb);
                    outline: none;
                    font-family: inherit;
                }
                .input-text:focus {
                    border-color: var(--accent, #78d4b0);
                    box-shadow: 0 0 0 2px rgba(120, 212, 176, 0.2);
                }
                .order-card {
                    border: 1px solid var(--border, rgba(172, 223, 206, 0.15));
                    border-radius: 12px;
                    padding: 1rem;
                    margin-bottom: 0.85rem;
                    background: var(--surface-solid, #20383d);
                }
                .order-top {
                    display: flex;
                    justify-content: space-between;
                    font-size: 0.85rem;
                    margin-bottom: 0.4rem;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                    color: var(--text, #e2f0eb);
                }
                .order-indicaciones {
                    font-size: 0.9rem;
                    color: var(--text, #e2f0eb);
                    font-weight: 500;
                    line-height: 1.4;
                }
                .result-box {
                    margin-top: 0.75rem;
                    background: var(--mint-soft, #284b43);
                    border: 1px solid var(--border-strong, rgba(160, 208, 193, 0.25));
                    border-radius: 8px;
                    padding: 0.75rem 1rem;
                    font-size: 0.85rem;
                    color: var(--accent-text, #8bdbbc);
                }
                .result-form {
                    margin-top: 0.75rem;
                    background: rgba(0, 0, 0, 0.2);
                    border: 1px dashed var(--border-strong, rgba(172, 223, 206, 0.25));
                    border-radius: 8px;
                    padding: 0.85rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.65rem;
                }
                .empty-orders {
                    text-align: center;
                    padding: 1.5rem;
                    color: var(--muted, #a2b9b8);
                    font-size: 0.85rem;
                }
            </style>

            <div class="section-header">
                <div class="title">
                    <span>🧪 Órdenes de Exámenes y Laboratorio</span>
                </div>
                <span style="font-size: 0.8rem; color: var(--muted, #a2b9b8);">Paso ID: ${escapeHtml(this._idPaso.slice(0, 8))}...</span>
            </div>

            ${!this._consultaCerrada ? `
                <div class="order-form">
                    <label class="form-label" for="inputIndicaciones">Nueva Orden de Examen:</label>
                    <input 
                        type="text" 
                        class="input-text" 
                        id="inputIndicaciones" 
                        placeholder="Ejemplo: Hemograma completo con plaquetas y glucosa en ayunas..."
                    />
                    <div style="display: flex; justify-content: flex-end;">
                        <button type="button" class="btn btn-primary" id="btnCrearOrden" ${this._cargando ? 'disabled' : ''}>
                            ${this._cargando ? '⏳ Emitiendo...' : '📋 Prescribir Examen'}
                        </button>
                    </div>
                </div>
            ` : ''}

            <div class="orders-list">
                ${this._ordenes.length === 0 ? `
                    <div class="empty-orders">No se han prescrito exámenes para este paso clínico.</div>
                ` : this._ordenes.map(orden => {
                    const fechaTxt = formatearFecha(orden.fechaCreacion);
                    const resultados = orden.resultados || [];
                    const isFormOpen = this._mostrarFormResultado === orden.idOrdenExamen;

                    return `
                        <div class="order-card">
                            <div class="order-top">
                                <strong>Orden #${escapeHtml((orden.idOrdenExamen || '').slice(0, 8))}</strong>
                                <span style="color: var(--muted, #a2b9b8);">📅 ${escapeHtml(fechaTxt)}</span>
                            </div>

                            <div class="order-indicaciones">
                                <strong>Indicaciones:</strong> ${escapeHtml(orden.indicaciones || 'Sin indicaciones específicas.')}
                            </div>

                            ${resultados.length > 0 ? `
                                <div class="result-box">
                                    ${resultados.map(r => `
                                        <div><strong>Resultado:</strong> ${escapeHtml(r.resultado || 'Sin valor')}</div>
                                        ${r.interpretacion ? `<div><strong>Interpretación:</strong> ${escapeHtml(r.interpretacion)}</div>` : ''}
                                    `).join('')}
                                </div>
                            ` : `
                                <div style="margin-top: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
                                    <span style="font-size: 0.8rem; color: #fbbf24;">⏳ Esperando resultados de laboratorio</span>
                                    ${!this._consultaCerrada ? `
                                        <button type="button" class="btn btn-outline btn-toggle-res" data-id="${escapeHtml(orden.idOrdenExamen)}">
                                            ${isFormOpen ? 'Cancelar' : '+ Registrar Resultado'}
                                        </button>
                                    ` : ''}
                                </div>

                                ${isFormOpen ? `
                                    <div class="result-form">
                                        <div class="form-label">Registrar Resultado:</div>
                                        <input type="text" class="input-text" id="inputRes-${escapeHtml(orden.idOrdenExamen)}" placeholder="Resultado (ej: Hemoglobina 14.5 g/dL, Leucocitos normales)"/>
                                        <input type="text" class="input-text" id="inputInterp-${escapeHtml(orden.idOrdenExamen)}" placeholder="Interpretación médica (ej: Valores dentro del rango normal)"/>
                                        <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
                                            <button type="button" class="btn btn-success btn-guardar-res" data-id="${escapeHtml(orden.idOrdenExamen)}" ${this._cargando ? 'disabled' : ''}>
                                                💾 Guardar Resultado
                                            </button>
                                        </div>
                                    </div>
                                ` : ''}
                            `}
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        const btnCrear = this.shadowRoot.getElementById('btnCrearOrden');
        const inputInd = this.shadowRoot.getElementById('inputIndicaciones');
        if (btnCrear && inputInd) {
            btnCrear.addEventListener('click', () => {
                const indicaciones = inputInd.value.trim();
                if (!indicaciones) return;
                this.dispatchEvent(new CustomEvent('crear-orden-examen', {
                    detail: { idPaso: this._idPaso, indicaciones },
                    bubbles: true,
                    composed: true,
                }));
                inputInd.value = '';
            });
        }

        this.shadowRoot.querySelectorAll('.btn-toggle-res').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                this._mostrarFormResultado = this._mostrarFormResultado === id ? null : id;
                this.render();
            });
        });

        this.shadowRoot.querySelectorAll('.btn-guardar-res').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idOrdenExamen = e.target.dataset.id;
                const inputRes = this.shadowRoot.getElementById(`inputRes-${idOrdenExamen}`);
                const inputInterp = this.shadowRoot.getElementById(`inputInterp-${idOrdenExamen}`);
                const resultado = inputRes ? inputRes.value.trim() : '';
                const interpretacion = inputInterp ? inputInterp.value.trim() : '';

                if (!resultado) return;

                this.dispatchEvent(new CustomEvent('registrar-resultado-examen', {
                    detail: { idOrdenExamen, resultado, interpretacion },
                    bubbles: true,
                    composed: true,
                }));
                this._mostrarFormResultado = null;
            });
        });
    }
}

customElements.define('ordenes-examen', OrdenesExamen);
export default OrdenesExamen;
