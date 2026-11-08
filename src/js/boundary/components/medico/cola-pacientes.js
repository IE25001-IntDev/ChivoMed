import { escapeHtml, formatearFecha } from '../../utils.js';
import {
    filtrarColeccion,
    crearBuscadorDebounce,
    resaltarCoincidencias,
} from '../../../control/busqueda_util.js';

/**
 * Web Component: <cola-pacientes>
 * Componente presentacional para la lista de consultas y pacientes en espera o en curso.
 * Emite: 'seleccionar-consulta'
 */
class ColaPacientes extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._consultas = [];
        this._consultaSeleccionadaId = null;
        this._cargando = false;
        this._filtro = 'todas'; // 'todas', 'activas', 'cerradas'
        this._filtroTexto = '';
        this._debounceBuscar = crearBuscadorDebounce(() => this.render(), 180);
    }

    set consultas(val) {
        this._consultas = Array.isArray(val) ? val : [];
        this.render();
    }

    get consultas() {
        return this._consultas;
    }

    set consultaSeleccionadaId(id) {
        this._consultaSeleccionadaId = id;
        this.render();
    }

    set cargando(val) {
        this._cargando = Boolean(val);
        this.render();
    }

    connectedCallback() {
        this.render();
    }

    filtrarConsultas() {
        let base = this._consultas;
        if (this._filtro === 'activas') {
            base = this._consultas.filter(c => !c.fechaFin);
        } else if (this._filtro === 'cerradas') {
            base = this._consultas.filter(c => Boolean(c.fechaFin));
        }
        return filtrarColeccion(base, this._filtroTexto, {
            campos: ['pacienteNombre', 'observaciones', 'idConsulta']
        });
    }

    render() {
        const consultasFiltradas = this.filtrarConsultas();

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: flex;
                    flex-direction: column;
                    min-height: calc(100vh - 190px);
                    background: var(--card-glass, rgba(29, 51, 56, 0.65));
                    backdrop-filter: blur(28px) saturate(180%);
                    -webkit-backdrop-filter: blur(28px) saturate(180%);
                    border: 1px solid var(--card-border, rgba(172, 223, 206, 0.14));
                    border-radius: var(--card-radius, 20px);
                    overflow: hidden;
                    box-shadow: var(--card-shadow, var(--glass-shadow));
                    transition: var(--transition-card, all 0.28s ease);
                    box-sizing: border-box;
                }
                .panel-header {
                    padding: 1.35rem 1.75rem;
                    background: var(--surface-muted, rgba(0, 0, 0, 0.15));
                    border-bottom: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .panel-title {
                    font-size: 1.05rem;
                    font-weight: 700;
                    color: var(--text, #e2f0eb);
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }
                .counter-badge {
                    background: var(--mint-soft, #284b43);
                    color: var(--accent-text, #8bdbbc);
                    border: 1px solid var(--border-strong, rgba(160, 208, 193, 0.2));
                    border-radius: 9999px;
                    padding: 0.22rem 0.65rem;
                    font-size: 0.75rem;
                    font-weight: bold;
                    box-shadow: 0 0 10px var(--glow-mint);
                }
                .filter-tabs {
                    display: flex;
                    padding: 0.75rem 1.25rem;
                    gap: 0.65rem;
                    border-bottom: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                    background: var(--surface-muted, rgba(0, 0, 0, 0.12));
                }
                .tab-btn {
                    flex: 1;
                    padding: 0.6rem 1rem;
                    font-size: 0.85rem;
                    font-weight: 600;
                    border: 1px solid transparent;
                    border-radius: 9999px;
                    background: transparent;
                    color: var(--muted, #a2b9b8);
                    cursor: pointer;
                    transition: all 0.22s var(--ease-spring, cubic-bezier(0.16, 1, 0.3, 1));
                    text-align: center;
                }
                .tab-btn:hover {
                    color: var(--text, #e2f0eb);
                    background: var(--surface-muted, rgba(255, 255, 255, 0.05));
                }
                .tab-btn.active {
                    color: var(--accent-text, #8bdbbc);
                    background: var(--mint-soft, #284b43);
                    border-color: rgba(120, 212, 176, 0.3);
                    font-weight: 700;
                    box-shadow: 0 2px 8px var(--glow-mint);
                }
                .search-bar-wrap {
                    position: relative;
                    padding: 1rem 1.5rem;
                    background: var(--surface-muted, rgba(0, 0, 0, 0.08));
                    border-bottom: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                    display: flex;
                    align-items: center;
                }
                .search-ico {
                    position: absolute;
                    left: 2.15rem;
                    font-size: 0.95rem;
                    color: var(--muted, #a2b9b8);
                    pointer-events: none;
                }
                .search-input {
                    width: 100%;
                    padding: 0.75rem 2.2rem 0.75rem 2.85rem;
                    min-height: 2.9rem;
                    border: 1px solid var(--border-strong, rgba(172, 223, 206, 0.2));
                    border-radius: 9999px;
                    font-size: 0.9rem;
                    outline: none;
                    background: var(--surface-solid, #20383d);
                    color: var(--text, #e2f0eb);
                    box-sizing: border-box;
                    transition: all 0.2s ease;
                }
                .search-input:focus {
                    border-color: var(--accent, #78d4b0);
                    box-shadow: 0 0 0 2px rgba(120, 212, 176, 0.2);
                }
                .btn-clear {
                    position: absolute;
                    right: 2.15rem;
                    border: none;
                    background: transparent;
                    color: var(--muted, #a2b9b8);
                    cursor: pointer;
                    font-size: 0.85rem;
                    padding: 0.25rem;
                }
                .btn-clear:hover { color: var(--text, #e2f0eb); }
                .list-container {
                    flex: 1;
                    max-height: calc(100vh - 360px);
                    overflow-y: auto;
                    padding: 1.25rem 1.5rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.85rem;
                }
                .item-card {
                    padding: 1.15rem 1.25rem;
                    border: 1px solid var(--card-border, rgba(172, 223, 206, 0.12));
                    border-radius: 14px;
                    cursor: pointer;
                    transition: all 0.25s var(--ease-spring, cubic-bezier(0.16, 1, 0.3, 1));
                    background: var(--surface-solid, #20383d);
                    display: flex;
                    flex-direction: column;
                    gap: 0.55rem;
                }
                .item-card:hover {
                    border-color: var(--accent, #78d4b0);
                    background: var(--card-glass-hover, rgba(32, 58, 64, 0.85));
                    transform: translateY(-3px);
                    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15), 0 0 16px var(--glow-mint);
                }
                .item-card.selected {
                    border-color: var(--accent, #78d4b0);
                    background: var(--mint-soft, #284b43);
                    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.2), 0 0 22px var(--glow-mint);
                    transform: translateY(-2px);
                }
                .item-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 0.65rem;
                }
                .patient-name {
                    font-weight: 700;
                    font-size: 0.95rem;
                    color: var(--text, #e2f0eb);
                }
                .status-chip {
                    font-size: 0.72rem;
                    font-weight: 700;
                    padding: 0.25rem 0.65rem;
                    border-radius: 9999px;
                    text-transform: uppercase;
                    white-space: nowrap;
                }
                .chip-active {
                    background: rgba(16, 185, 129, 0.2);
                    color: var(--accent, #78d4b0);
                    border: 1px solid rgba(120, 212, 176, 0.3);
                    box-shadow: 0 0 8px rgba(120, 212, 176, 0.2);
                }
                .chip-closed {
                    background: var(--badge-inactive-bg, rgba(0, 0, 0, 0.25));
                    color: var(--badge-inactive-color, var(--muted, #a2b9b8));
                    border: 1px solid var(--border, rgba(172, 223, 206, 0.1));
                }
                .item-meta {
                    font-size: 0.78rem;
                    color: var(--muted, #a2b9b8);
                }
                .item-obs {
                    font-size: 0.8rem;
                    color: var(--muted, #a2b9b8);
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .empty-container {
                    padding: 2.5rem 1rem;
                    text-align: center;
                    color: var(--muted, #a2b9b8);
                    font-size: 0.85rem;
                }
                .empty-icon {
                    font-size: 2rem;
                    margin-bottom: 0.5rem;
                    opacity: 0.7;
                }
                .loading-indicator {
                    padding: 1.5rem;
                    text-align: center;
                    color: var(--accent, #78d4b0);
                    font-size: 0.85rem;
                }
                mark.resaltado-paciente {
                    background: var(--mint-soft, #284b43);
                    color: var(--accent-text, #8bdbbc);
                    font-weight: 700;
                    padding: 0.05rem 0.25rem;
                    border-radius: 3px;
                }
            </style>

            <div class="panel-header">
                <div class="panel-title">
                    <span>📋 Pacientes</span>
                    <span class="counter-badge">${consultasFiltradas.length}</span>
                </div>
            </div>

            <div class="search-bar-wrap">
                <span class="search-ico">🔍</span>
                <input type="text" class="search-input" id="inputBuscarPacientes" placeholder="Buscar paciente, motivo o ID..." value="${escapeHtml(this._filtroTexto)}"/>
                ${this._filtroTexto ? `<button type="button" class="btn-clear" id="btnClearPacientes">✕</button>` : ''}
            </div>

            <div class="filter-tabs" role="tablist">
                <button type="button" role="tab" class="tab-btn ${this._filtro === 'todas' ? 'active' : ''}" data-filtro="todas">Todas</button>
                <button type="button" role="tab" class="tab-btn ${this._filtro === 'activas' ? 'active' : ''}" data-filtro="activas">Activas</button>
                <button type="button" role="tab" class="tab-btn ${this._filtro === 'cerradas' ? 'active' : ''}" data-filtro="cerradas">Cerradas</button>
            </div>

            <div class="list-container">
                ${this._cargando ? `
                    <div class="loading-indicator">⏳ Cargando consultas...</div>
                ` : consultasFiltradas.length === 0 ? `
                    <div class="empty-container">
                        <div class="empty-icon">📂</div>
                        <div>No hay consultas ${this._filtroTexto ? 'que coincidan con la búsqueda.' : 'registradas para este filtro.'}</div>
                    </div>
                ` : consultasFiltradas.map(c => {
                    const isSelected = c.idConsulta === this._consultaSeleccionadaId;
                    const isActiva = !c.fechaFin;
                    const fechaTxt = formatearFecha(c.fechaInicio);
                    const nombrePaciente = c.pacienteNombre || `Paciente #${(c.idPersonaRol || '').slice(0, 8)}`;

                    return `
                        <div class="item-card ${isSelected ? 'selected' : ''}" data-id="${escapeHtml(c.idConsulta)}" tabindex="0" role="button" aria-pressed="${isSelected}">
                            <div class="item-row">
                                <span class="patient-name">${resaltarCoincidencias(nombrePaciente, this._filtroTexto, 'resaltado-paciente')}</span>
                                <span class="status-chip ${isActiva ? 'chip-active' : 'chip-closed'}">
                                    ${isActiva ? 'En Atención' : 'Finalizada'}
                                </span>
                            </div>
                            <div class="item-meta">🕐 ${escapeHtml(fechaTxt)}</div>
                            ${c.observaciones ? `<div class="item-obs" title="${escapeHtml(c.observaciones)}">💬 ${resaltarCoincidencias(c.observaciones, this._filtroTexto, 'resaltado-paciente')}</div>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        this.shadowRoot.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this._filtro = e.target.dataset.filtro;
                this.render();
            });
        });

        const inputBuscar = this.shadowRoot.getElementById('inputBuscarPacientes');
        if (inputBuscar) {
            inputBuscar.addEventListener('input', (e) => {
                this._filtroTexto = e.target.value;
                this._debounceBuscar();
            });
        }

        const btnClear = this.shadowRoot.getElementById('btnClearPacientes');
        if (btnClear) {
            btnClear.addEventListener('click', () => {
                this._filtroTexto = '';
                this.render();
            });
        }

        this.shadowRoot.querySelectorAll('.item-card').forEach(card => {
            const handleSelect = () => {
                const id = card.dataset.id;
                const consulta = this._consultas.find(c => c.idConsulta === id);
                this._consultaSeleccionadaId = id;
                this.render();

                this.dispatchEvent(new CustomEvent('seleccionar-consulta', {
                    detail: { idConsulta: id, consulta },
                    bubbles: true,
                    composed: true,
                }));
            };

            card.addEventListener('click', handleSelect);
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelect();
                }
            });
        });
    }
}

customElements.define('cola-pacientes', ColaPacientes);
export default ColaPacientes;
