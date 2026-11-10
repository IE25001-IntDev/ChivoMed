import { escapeHtml } from '../../utils.js';

/**
 * Web Component: <medico-header>
 * Componente presentacional para la barra superior del médico.
 * Muestra el perfil del médico activo, clínica y estado de conexión.
 * Emite: 'cambiar-doctor', 'refrescar-datos'
 */
class MedicoHeader extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._medico = null;
        this._clinica = null;
        this._rolesDisponibles = [];
        this._cargando = false;
    }

    set medico(val) {
        this._medico = val;
        this.render();
    }

    get medico() {
        return this._medico;
    }

    set clinica(val) {
        this._clinica = val;
        this.render();
    }

    set rolesDisponibles(val) {
        this._rolesDisponibles = Array.isArray(val) ? val : [];
        this.render();
    }

    set cargando(val) {
        this._cargando = Boolean(val);
        this.render();
    }

    connectedCallback() {
        try {
            const savedTheme = localStorage.getItem('chivomed-theme');
            if (savedTheme) {
                document.documentElement.setAttribute('data-theme', savedTheme);
            }
        } catch (_) {}
        this.render();
    }

    render() {
        const nombreMedico = this._medico
            ? `${this._medico.nombres || ''} ${this._medico.apellidos || ''}`.trim() || 'Médico'
            : 'Sin médico asignado';
        const nombreClinica = this._clinica?.nombre || 'Clínica Principal';

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    background: var(--glass, rgba(29, 51, 56, 0.7));
                    backdrop-filter: blur(28px) saturate(180%);
                    -webkit-backdrop-filter: blur(28px) saturate(180%);
                    border: 1px solid var(--border, rgba(172, 223, 206, 0.14));
                    border-radius: 9999px;
                    padding: 1.15rem 2.75rem;
                    box-shadow: var(--glass-shadow);
                    margin: 1.75rem 2.75rem 0.5rem;
                }
                .header-container {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    width: 100%;
                    flex-wrap: wrap;
                    gap: 1.5rem;
                }
                .brand-section {
                    display: flex;
                    align-items: center;
                    gap: 1.25rem;
                    padding-left: 0.5rem;
                }
                .brand-icon {
                    width: 48px;
                    height: 48px;
                    background: var(--accent, #78d4b0);
                    color: var(--on-accent, #122e2a);
                    border-radius: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.55rem;
                    font-weight: 800;
                    box-shadow: 0 0 16px rgba(120, 212, 176, 0.35);
                }
                .brand-title {
                    font-size: 1.35rem;
                    font-weight: 800;
                    color: var(--text, #e2f0eb);
                    line-height: 1.2;
                }
                .brand-subtitle {
                    font-size: 0.85rem;
                    color: var(--muted, #a2b9b8);
                    margin-top: 0.15rem;
                }
                .info-section {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding-right: 0.5rem;
                    flex-wrap: wrap;
                }
                .badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.5rem 1rem;
                    border-radius: 9999px;
                    font-size: 0.85rem;
                    font-weight: 600;
                }
                .badge-clinic {
                    background: var(--surface-solid, #20383d);
                    color: var(--text, #e2f0eb);
                    border: 1px solid var(--border, rgba(172, 223, 206, 0.15));
                }
                .badge-doctor {
                    background: var(--mint-soft, #284b43);
                    color: var(--accent-text, #8bdbbc);
                    border: 1px solid var(--border-strong, rgba(160, 208, 193, 0.25));
                }
                .select-doctor {
                    font-size: 0.85rem;
                    padding: 0.55rem 1.15rem;
                    border-radius: 9999px;
                    border: 1px solid var(--border-strong, rgba(172, 223, 206, 0.25));
                    background: var(--surface-solid, #20383d);
                    color: var(--text, #e2f0eb);
                    outline: none;
                    cursor: pointer;
                }
                .select-doctor:focus {
                    border-color: var(--accent, #78d4b0);
                }
                .nav-pill-btn {
                    padding: 0.55rem 1.15rem;
                    border-radius: 9999px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    text-decoration: none;
                    color: var(--muted, #a2b9b8);
                    background: var(--surface-muted, rgba(0, 0, 0, 0.15));
                    border: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                    transition: all 0.22s var(--ease-spring, cubic-bezier(0.16, 1, 0.3, 1));
                    display: inline-flex;
                    align-items: center;
                    gap: 0.65rem;
                }
                .nav-pill-btn:hover {
                    color: var(--text, #e2f0eb);
                    border-color: var(--accent, #78d4b0);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 15px var(--glow-mint, rgba(45, 133, 111, 0.2));
                }
                .nav-pill-btn:active {
                    transform: scale(0.97);
                }
                .btn-refresh {
                    background: var(--surface-solid, #20383d);
                    border: 1px solid var(--border, rgba(172, 223, 206, 0.15));
                    border-radius: 9999px;
                    padding: 0.55rem 1.15rem;
                    font-size: 0.85rem;
                    color: var(--text, #e2f0eb);
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 0.65rem;
                    transition: all 0.22s var(--ease-spring, cubic-bezier(0.16, 1, 0.3, 1));
                }
                .btn-refresh:hover:not(:disabled) {
                    background: var(--mint-soft, #284b43);
                    border-color: var(--accent, #78d4b0);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 15px var(--glow-mint, rgba(45, 133, 111, 0.2));
                }
                .btn-refresh:active:not(:disabled) {
                    transform: scale(0.97);
                }
                .btn-refresh:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
            </style>

            <div class="header-container">
                <div class="brand-section">
                    <div class="brand-icon">🩺</div>
                    <div>
                        <div class="brand-title">ChivoMed</div>
                        <div class="brand-subtitle">Estación de Atención Médica</div>
                    </div>
                </div>

                <div class="info-section">
                    <a href="../../index.html" class="nav-pill-btn">← Inicio</a>
                    <a href="../personal/administracion.html" class="nav-pill-btn">🏢 Administración</a>

                    <span class="badge badge-clinic">🏥 ${escapeHtml(nombreClinica)}</span>
                    <span class="badge badge-doctor">👨‍⚕️ ${escapeHtml(nombreMedico)}</span>

                    ${this._rolesDisponibles.length > 0 ? `
                        <label style="font-size: 0.8rem; color: var(--muted, #a2b9b8); font-weight: 600;" for="selectDoctor">
                            Médico:
                        </label>
                        <select class="select-doctor" id="selectDoctor" title="Seleccionar médico activo">
                            <option value="">-- Cambiar Médico --</option>
                            ${this._rolesDisponibles.map(r => `
                                <option value="${escapeHtml(r.idPersonaRol)}" ${this._medico?.idPersonaRol === r.idPersonaRol ? 'selected' : ''}>
                                    ${escapeHtml(r.nombreCompleto || r.idPersonaRol)}
                                </option>
                            `).join('')}
                        </select>
                    ` : ''}

                    <button type="button" class="btn-refresh" id="btnThemeToggle" title="Cambiar tema claro/oscuro">
                        🌓 Tema
                    </button>

                    <button type="button" class="btn-refresh" id="btnRefresh" title="Actualizar datos con GalenoSV" ${this._cargando ? 'disabled' : ''}>
                        ${this._cargando ? '⏳ Sincronizando...' : '🔄 Sincronizar'}
                    </button>
                </div>
            </div>
        `;

        const btnThemeToggle = this.shadowRoot.getElementById('btnThemeToggle');
        if (btnThemeToggle) {
            btnThemeToggle.addEventListener('click', () => {
                const html = document.documentElement;
                const current = html.getAttribute('data-theme') || 'dark';
                const next = current === 'dark' ? 'light' : 'dark';
                html.setAttribute('data-theme', next);
                try { localStorage.setItem('chivomed-theme', next); } catch (_) {}
                this.render();
            });
        }

        const select = this.shadowRoot.getElementById('selectDoctor');
        if (select) {
            select.addEventListener('change', (e) => {
                if (!e.target.value) return;
                this.dispatchEvent(new CustomEvent('cambiar-doctor', {
                    detail: { idPersonaRol: e.target.value },
                    bubbles: true,
                    composed: true,
                }));
            });
        }

        const btnRefresh = this.shadowRoot.getElementById('btnRefresh');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => {
                this.dispatchEvent(new CustomEvent('refrescar-datos', {
                    bubbles: true,
                    composed: true,
                }));
            });
        }
    }
}

customElements.define('medico-header', MedicoHeader);
export default MedicoHeader;
