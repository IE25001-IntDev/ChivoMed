import { escapeHtml } from '../../utils.js';

/**
 * Web Component: <navegacion-personal>
 * Barra lateral de navegación entre los catálogos y áreas del personal de clínica.
 * Emite: 'cambiar-seccion'
 */
class NavegacionPersonal extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._seccionActiva = 'contexto';
        this._contadores = {};
    }

    set seccionActiva(val) {
        this._seccionActiva = val;
        this.render();
    }
    get seccionActiva() { return this._seccionActiva; }

    set contadores(val) {
        this._contadores = val || {};
        this.render();
    }

    connectedCallback() {
        this.render();
    }

    render() {
        const secciones = [
            { id: 'contexto', icono: '👥', titulo: 'Turnos', subtitulo: 'Sede y personal activo' },
            { id: 'clinicas', icono: '🏢', titulo: 'Clínicas', countKey: 'clinicas' },
            { id: 'roles', icono: '👥', titulo: 'Roles', countKey: 'roles' },
            { id: 'documentos', icono: '🪪', titulo: 'Documentos', countKey: 'documentos' },
            { id: 'contactos', icono: '📞', titulo: 'Contactos', countKey: 'contactos' },
            { id: 'examenes', icono: '🧪', titulo: 'Exámenes', countKey: 'examenes' },
            { id: 'protocolos', icono: '⚙️', titulo: 'Protocolos', countKey: 'procedimientos' },
        ];

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    min-height: calc(100vh - 190px);
                    background: var(--card-glass, rgba(29, 51, 56, 0.7));
                    backdrop-filter: blur(28px) saturate(180%);
                    -webkit-backdrop-filter: blur(28px) saturate(180%);
                    border: 1px solid var(--card-border, rgba(172, 223, 206, 0.14));
                    border-radius: var(--card-radius, 20px);
                    overflow: hidden;
                    box-shadow: var(--card-shadow, var(--glass-shadow));
                    transition: var(--transition-card, all 0.28s ease);
                }
                .nav-header {
                    padding: 1.35rem 1.75rem;
                    background: var(--surface-muted, rgba(255, 255, 255, 0.03));
                    border-bottom: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                    font-size: 1.05rem;
                    font-weight: 700;
                    color: var(--text, #e2f0eb);
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }
                .nav-list {
                    list-style: none;
                    padding: 1.15rem 1rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.65rem;
                    margin: 0;
                    flex: 1;
                }
                .nav-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0.95rem 1.35rem;
                    border-radius: 14px;
                    color: var(--muted, #a2b9b8);
                    font-size: 0.92rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.22s var(--ease-spring, cubic-bezier(0.16, 1, 0.3, 1));
                    border: 1px solid transparent;
                }
                .nav-item:hover {
                    background: var(--surface-muted, rgba(255, 255, 255, 0.05));
                    color: var(--text, #e2f0eb);
                    transform: translateX(4px);
                }
                .nav-item.active {
                    background: var(--mint-soft, rgba(120, 212, 176, 0.15));
                    color: var(--accent-text, #8bdbbc);
                    border-color: rgba(120, 212, 176, 0.35);
                    box-shadow: 0 0 20px var(--glow-mint, rgba(120, 212, 176, 0.2));
                    transform: translateX(5px);
                }
                .item-title-box {
                    display: flex;
                    align-items: center;
                    gap: 0.85rem;
                }
                .nav-badge {
                    font-size: 0.75rem;
                    padding: 0.25rem 0.65rem;
                    border-radius: 9999px;
                    background: var(--badge-inactive-bg, rgba(0, 0, 0, 0.2));
                    color: var(--badge-inactive-color, var(--muted, #a2b9b8));
                    font-weight: 700;
                    border: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                    transition: all 0.2s ease;
                }
                .nav-badge.active-badge {
                    background: var(--accent, #78d4b0);
                    color: var(--on-accent, #122e2a);
                    border-color: transparent;
                    box-shadow: 0 0 10px var(--glow-mint);
                }
                .nav-footer {
                    padding: 1.25rem 1.5rem;
                    background: var(--surface-muted, rgba(255, 255, 255, 0.02));
                    border-top: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    font-size: 0.78rem;
                    color: var(--muted, #a2b9b8);
                }
                .nav-footer-status {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                .status-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: var(--accent, #78d4b0);
                    box-shadow: 0 0 8px var(--glow-mint, rgba(120, 212, 176, 0.5));
                }
                .nav-footer-version {
                    font-weight: 600;
                    opacity: 0.75;
                }

                /* Modo Dock Flotante Inferior en Pantallas Móviles / Tabletas */
                @media (max-width: 960px) {
                    :host {
                        min-height: auto;
                        display: block;
                        position: fixed;
                        bottom: 1.25rem;
                        left: 50%;
                        transform: translateX(-50%);
                        z-index: 99;
                        width: auto;
                        max-width: 95vw;
                        border-radius: 9999px;
                        background: var(--dock-glass, rgba(18, 34, 38, 0.85));
                        box-shadow: var(--dock-shadow, 0 15px 40px rgba(0, 0, 0, 0.4));
                    }
                    .nav-header,
                    .nav-footer {
                        display: none;
                    }
                    .nav-list {
                        flex-direction: row;
                        padding: 0.5rem 0.85rem;
                        gap: 0.5rem;
                        overflow-x: auto;
                        scrollbar-width: none;
                    }
                    .nav-list::-webkit-scrollbar {
                        display: none;
                    }
                    .nav-item {
                        padding: 0.65rem 1.1rem;
                        border-radius: 9999px;
                        font-size: 0.85rem;
                        white-space: nowrap;
                    }
                    .nav-item:hover, .nav-item.active {
                        transform: translateY(-2px);
                    }
                }
            </style>

            <div class="nav-header">
                <span>📁 Administración</span>
            </div>

            <ul class="nav-list" role="tablist">
                ${secciones.map(sec => {
                    const isActive = sec.id === this._seccionActiva;
                    const count = sec.countKey ? this._contadores[sec.countKey] : null;

                    return `
                        <li class="nav-item ${isActive ? 'active' : ''}" data-id="${escapeHtml(sec.id)}" role="tab" aria-selected="${isActive}" tabindex="0">
                            <div class="item-title-box">
                                <span>${sec.icono}</span>
                                <span>${escapeHtml(sec.titulo)}</span>
                            </div>
                            ${sec.badge ? `
                                <span class="nav-badge ${isActive ? 'active-badge' : ''}">${escapeHtml(sec.badge)}</span>
                            ` : (count !== null && count !== undefined) ? `
                                <span class="nav-badge ${isActive ? 'active-badge' : ''}">${count}</span>
                            ` : ''}
                        </li>
                    `;
                }).join('')}
            </ul>

            <div class="nav-footer">
                <div class="nav-footer-status">
                    <span class="status-dot"></span>
                    <span>Sistema Activo</span>
                </div>
                <span class="nav-footer-version">ChivoMed v2.0</span>
            </div>
        `;

        this.shadowRoot.querySelectorAll('.nav-item').forEach(item => {
            const handleSelect = () => {
                const seccion = item.dataset.id;
                this._seccionActiva = seccion;
                this.render();

                this.dispatchEvent(new CustomEvent('cambiar-seccion', {
                    detail: { seccion },
                    bubbles: true,
                    composed: true,
                }));
            };

            item.addEventListener('click', handleSelect);
            item.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelect();
                }
            });
        });
    }
}

customElements.define('navegacion-personal', NavegacionPersonal);
export default NavegacionPersonal;

