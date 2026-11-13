import { escapeHtml, formatearFecha } from '../../utils.js';

/**
 * Web Component: <ficha-paciente>
 * Componente presentacional para la información del paciente y la consulta activa.
 * Emite: 'retomar-consulta'
 */
class FichaPaciente extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._consulta = null;
        this._paciente = null;
        this._documentos = [];
        this._retomando = false;
    }

    set consulta(val) {
        this._consulta = val;
        this.render();
    }

    get consulta() {
        return this._consulta;
    }

    set paciente(val) {
        this._paciente = val;
        this.render();
    }

    set documentos(val) {
        this._documentos = Array.isArray(val) ? val : [];
        this.render();
    }

    set retomando(val) {
        this._retomando = Boolean(val);
        this.render();
    }

    connectedCallback() {
        this.render();
    }

    calcularEdad(fechaNacimiento) {
        if (!fechaNacimiento) return 'No registrada';
        try {
            const hoy = new Date();
            const nac = new Date(fechaNacimiento);
            if (isNaN(nac.getTime())) return 'No registrada';
            let edad = hoy.getFullYear() - nac.getFullYear();
            const m = hoy.getMonth() - nac.getMonth();
            if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
            return `${edad} años`;
        } catch {
            return 'No registrada';
        }
    }

    render() {
        if (!this._consulta) {
            this.shadowRoot.innerHTML = `
                <style>
                    :host([hidden]) { display: none !important; }
                    :host {
                        display: block;
                        background: var(--glass, rgba(29, 51, 56, 0.7));
                        backdrop-filter: blur(20px);
                        -webkit-backdrop-filter: blur(20px);
                        border: 1px dashed var(--border-strong, rgba(172, 223, 206, 0.25));
                        border-radius: 16px;
                        padding: 2.5rem 1.5rem;
                        text-align: center;
                        color: var(--muted, #a2b9b8);
                    }
                    .icon { font-size: 2.5rem; margin-bottom: 0.5rem; }
                    h4 { color: var(--text, #e2f0eb); margin-bottom: 0.25rem; font-weight: 700; font-size: 1.1rem; }
                    p { margin: 0; font-size: 0.9rem; }
                </style>
                <div class="icon">👈</div>
                <h4>Selecciona un paciente de la lista</h4>
                <p>Haz clic en cualquier consulta del panel izquierdo para iniciar la atención clínica.</p>
            `;
            return;
        }

        const nombre = this._paciente
            ? `${this._paciente.nombres || ''} ${this._paciente.apellidos || ''}`.trim()
            : (this._consulta.pacienteNombre || 'Paciente');
        const edad = this.calcularEdad(this._paciente?.fechaNacimiento);
        const fechaInicio = formatearFecha(this._consulta.fechaInicio);
        const isCerrada = Boolean(this._consulta.fechaFin);

        this.shadowRoot.innerHTML = `
            <style>
                :host([hidden]) { display: none !important; }
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
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    border-bottom: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                    padding-bottom: 0.85rem;
                    margin-bottom: 1rem;
                    flex-wrap: wrap;
                    gap: 0.5rem;
                }
                .patient-title {
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: var(--text, #e2f0eb);
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .badge-status {
                    font-size: 0.75rem;
                    font-weight: 700;
                    padding: 0.25rem 0.65rem;
                    border-radius: 9999px;
                }
                .badge-open {
                    background: var(--mint-soft, #284b43);
                    color: var(--accent-text, #8bdbbc);
                    border: 1px solid var(--border-strong, rgba(160, 208, 193, 0.25));
                }
                .badge-closed {
                    background: rgba(0, 0, 0, 0.2);
                    color: var(--muted, #a2b9b8);
                    border: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                }
                .grid-info {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                    gap: 1rem;
                    margin-bottom: 1.25rem;
                }
                .info-item {
                    display: flex;
                    flex-direction: column;
                }
                .info-label {
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    color: var(--muted, #a2b9b8);
                    font-weight: 700;
                    letter-spacing: 0.04em;
                }
                .info-value {
                    font-size: 0.95rem;
                    font-weight: 600;
                    color: var(--text, #e2f0eb);
                    margin-top: 0.2rem;
                }
                .obs-card {
                    background: rgba(0, 0, 0, 0.2);
                    border: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                    border-radius: 10px;
                    padding: 0.85rem 1.15rem;
                }
                .obs-title {
                    font-size: 0.8rem;
                    font-weight: 700;
                    color: var(--accent, #78d4b0);
                    margin-bottom: 0.25rem;
                }
                .obs-text {
                    font-size: 0.9rem;
                    color: var(--text, #e2f0eb);
                    line-height: 1.4;
                }
                .btn-retomar {
                    background: var(--accent, #78d4b0);
                    color: var(--on-accent, #122e2a);
                    border: none;
                    border-radius: 9999px;
                    padding: 0.45rem 1rem;
                    font-size: 0.8rem;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.15s;
                }
                .btn-retomar:hover:not(:disabled) {
                    background: #8bdbbc;
                    box-shadow: 0 0 12px rgba(120, 212, 176, 0.3);
                }
                .btn-retomar:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                code {
                    background: rgba(0, 0, 0, 0.25);
                    padding: 0.15rem 0.4rem;
                    border-radius: 4px;
                    color: var(--accent, #78d4b0);
                }
            </style>

            <div class="header">
                <div>
                    <div class="patient-title">
                        <span>👤 ${escapeHtml(nombre)}</span>
                        <span class="badge-status ${isCerrada ? 'badge-closed' : 'badge-open'}">
                            ${isCerrada ? 'Finalizada' : 'En Consulta Activa'}
                        </span>
                    </div>
                    <div style="font-size: 0.8rem; color: var(--muted, #a2b9b8); margin-top: 0.25rem;">
                        ID Consulta: <code>${escapeHtml(this._consulta.idConsulta)}</code>
                    </div>
                </div>

                ${!isCerrada ? `
                    <button type="button" class="btn-retomar" id="btnRetomar" title="Establecer esta consulta activa en la sesión del servidor" ${this._retomando ? 'disabled' : ''}>
                        ${this._retomando ? '⏳ Retomando...' : '⚡ Retomar en Sesión'}
                    </button>
                ` : ''}
            </div>

            <div class="grid-info">
                <div class="info-item">
                    <span class="info-label">Edad</span>
                    <span class="info-value">🎂 ${escapeHtml(edad)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Inicio de Consulta</span>
                    <span class="info-value">📅 ${escapeHtml(fechaInicio)}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Documentos</span>
                    <span class="info-value">
                        ${this._documentos.length > 0
                            ? this._documentos.map(d => escapeHtml(d.valor)).join(', ')
                            : 'Ninguno registrado'}
                    </span>
                </div>
                ${this._consulta.referenciaExterna ? `
                    <div class="info-item">
                        <span class="info-label">Referencia Externa</span>
                        <span class="info-value">📎 ${escapeHtml(this._consulta.referenciaExterna)}</span>
                    </div>
                ` : ''}
            </div>

            <div class="obs-card">
                <div class="obs-title">Motivo de consulta / Observaciones iniciales:</div>
                <div class="obs-text">${escapeHtml(this._consulta.observaciones || 'Sin observaciones registradas al inicio.')}</div>
            </div>
        `;

        const btnRetomar = this.shadowRoot.getElementById('btnRetomar');
        if (btnRetomar) {
            btnRetomar.addEventListener('click', () => {
                this.dispatchEvent(new CustomEvent('retomar-consulta', {
                    detail: { idConsulta: this._consulta.idConsulta },
                    bubbles: true,
                    composed: true,
                }));
            });
        }
    }
}

customElements.define('ficha-paciente', FichaPaciente);
export default FichaPaciente;
