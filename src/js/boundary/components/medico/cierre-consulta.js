import { escapeHtml } from '../../utils.js';

/**
 * Web Component: <cierre-consulta>
 * Componente presentacional para el cierre y alta de la atención médica.
 * Emite: 'cerrar-consulta'
 */
class CierreConsulta extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._idConsulta = null;
        this._consultaCerrada = false;
        this._observacionesFinales = '';
        this._observacionesDraft = '';
        this._cargando = false;
    }

    set idConsulta(val) {
        this._idConsulta = val;
        this.render();
    }

    get idConsulta() {
        return this._idConsulta;
    }

    set consultaCerrada(val) {
        this._consultaCerrada = Boolean(val);
        this.render();
    }

    set observacionesFinales(val) {
        this._observacionesFinales = val || '';
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
        if (!this._idConsulta) {
            this.shadowRoot.innerHTML = '';
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
                }
                .title {
                    font-size: 1.15rem;
                    font-weight: 700;
                    color: var(--text, #e2f0eb);
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                    margin-bottom: 1.25rem;
                }
                .form-label {
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: var(--text, #e2f0eb);
                }
                .textarea-cierre {
                    width: 100%;
                    box-sizing: border-box;
                    padding: 0.75rem 0.95rem;
                    border: 1px solid var(--border-strong, rgba(172, 223, 206, 0.25));
                    border-radius: 10px;
                    font-size: 0.85rem;
                    min-height: 90px;
                    resize: vertical;
                    font-family: inherit;
                    background: var(--surface-solid, #20383d);
                    color: var(--text, #e2f0eb);
                    outline: none;
                    line-height: 1.5;
                }
                .textarea-cierre:focus {
                    border-color: var(--accent, #78d4b0);
                    box-shadow: 0 0 0 2px rgba(120, 212, 176, 0.2);
                }
                .btn-cierre {
                    background: #ef4444;
                    color: white;
                    border: none;
                    border-radius: 9999px;
                    padding: 0.55rem 1.4rem;
                    font-size: 0.9rem;
                    font-weight: 700;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 0.5rem;
                    transition: all 0.15s;
                }
                .btn-cierre:hover:not(:disabled) {
                    background: #dc2626;
                    box-shadow: 0 0 12px rgba(239, 68, 68, 0.35);
                }
                .btn-cierre:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                .badge-finalizada {
                    background: var(--mint-soft, #284b43);
                    color: var(--accent-text, #8bdbbc);
                    border: 1px solid var(--border-strong, rgba(160, 208, 193, 0.25));
                    border-radius: 10px;
                    padding: 1rem 1.25rem;
                    text-align: center;
                    font-size: 0.95rem;
                    font-weight: 600;
                }
            </style>

            <div class="section-header">
                <div class="title">
                    <span>🏁 Conclusión y Cierre de Consulta</span>
                </div>
            </div>

            ${this._consultaCerrada ? `
                <div class="badge-finalizada">
                    ✅ Esta consulta ha sido finalizada formalmente en el sistema clínico.
                    ${this._observacionesFinales ? `<div style="font-weight: normal; margin-top: 0.35rem; color: var(--text, #e2f0eb); font-style: italic;">"${escapeHtml(this._observacionesFinales)}"</div>` : ''}
                </div>
            ` : `
                <div class="form-group">
                    <label class="form-label" for="txtObservaciones">Diagnóstico final / Indicaciones para el paciente:</label>
                    <textarea
                        class="textarea-cierre"
                        id="txtObservaciones"
                        placeholder="Ejemplo: Paciente con faringoamigdalitis aguda. Se indica reposo por 48h, amoxicilina 500mg c/8h por 7 días e hidratación constante. Cita de control en 5 días si no hay mejoría..."
                    >${escapeHtml(this._observacionesDraft)}</textarea>
                </div>

                <div style="display: flex; justify-content: flex-end;">
                    <button type="button" class="btn-cierre" id="btnCerrar" ${this._cargando ? 'disabled' : ''}>
                        ${this._cargando ? '⏳ Finalizando...' : '🔒 Finalizar y Cerrar Consulta Médica'}
                    </button>
                </div>
            `}
        `;

        const txtObs = this.shadowRoot.getElementById('txtObservaciones');
        if (txtObs) {
            txtObs.addEventListener('input', (e) => {
                this._observacionesDraft = e.target.value;
            });
        }

        const btnCerrar = this.shadowRoot.getElementById('btnCerrar');
        if (btnCerrar && txtObs) {
            btnCerrar.addEventListener('click', () => {
                const observaciones = txtObs.value.trim();
                if (!confirm('¿Estás seguro de que deseas finalizar esta consulta médica? Una vez cerrada, ya no se podrán agregar más pasos.')) {
                    return;
                }
                this.dispatchEvent(new CustomEvent('cerrar-consulta', {
                    detail: { idConsulta: this._idConsulta, observaciones },
                    bubbles: true,
                    composed: true,
                }));
            });
        }
    }
}

customElements.define('cierre-consulta', CierreConsulta);
export default CierreConsulta;
