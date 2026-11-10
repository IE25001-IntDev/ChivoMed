import { escapeHtml } from '../../utils.js';

/**
 * Web Component: <personal-header>
 * Cabecera para el módulo de personal y administración de clínica.
 * Emite: 'refrescar-datos'
 */
class PersonalHeader extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._clinica = null;
        this._operador = null;
        this._cargando = false;
    }

    set clinica(val) { this._clinica = val; this.render(); }
    set operador(val) { this._operador = val; this.render(); }
    set cargando(val) { this._cargando = Boolean(val); this.render(); }

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
        const nombreClinica = this._clinica?.nombre || 'Clínica Principal';
        const nombreOperador = this._operador?.nombreCompleto || 'Personal de Turno';
        const nombreRol = this._operador?.rolNombre || 'Administrador / Parametrizador';

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
                .badge-user {
                    background: var(--mint-soft, #284b43);
                    color: var(--accent-text, #8bdbbc);
                    border: 1px solid var(--border-strong, rgba(160, 208, 193, 0.25));
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
                    <div class="brand-icon">🏥</div>
                    <div>
                        <div class="brand-title">ChivoMed</div>
                        <div class="brand-subtitle">Personal y Administración</div>
                    </div>
                </div>

                <div class="info-section">
                    <a href="../../index.html" class="nav-pill-btn">← Inicio</a>


                    <span class="badge badge-clinic">🏢 ${escapeHtml(nombreClinica)}</span>
                    <span class="badge badge-user">👤 ${escapeHtml(nombreOperador)} (${escapeHtml(nombreRol)})</span>

                    <button type="button" class="btn-refresh" id="btnThemeToggle" title="Cambiar tema claro/oscuro">
                        🌓 Tema
                    </button>

                    <button type="button" class="btn-refresh" id="btnRefresh" title="Sincronizar con el backend" ${this._cargando ? 'disabled' : ''}>
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

customElements.define('personal-header', PersonalHeader);
export default PersonalHeader;
