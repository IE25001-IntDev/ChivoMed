/**
 * busqueda_chivomed.js
 * Web Component <busqueda-chivomed> con estética Glassmorphism, diseño Dark Mode nativo,
 * resplandores en tonos menta/azul/lavanda y filtrado reactivo optimizado.
 */

import {
    filtrarColeccion,
    crearBuscadorDebounce,
    resaltarCoincidencias,
    escaparHtml
} from '../../control/busqueda_util.js';

// Iconos vectoriales consistentes con la identidad de ChivoMed
const ICONOS = {
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>`,
    clear: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>`,
    paciente: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>`,
    consulta: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
    </svg>`,
    examen: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 2v7.31"></path>
        <path d="M14 2v7.31"></path>
        <path d="M8.5 2h7"></path>
        <path d="M14 9.3a6.5 6.5 0 1 1-4 0"></path>
        <circle cx="12" cy="15" r="1.5"></circle>
    </svg>`,
    clinica: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"></rect>
        <line x1="12" y1="8" x2="12" y2="16"></line>
        <line x1="8" y1="12" x2="16" y2="12"></line>
    </svg>`
};

class BusquedaChivoMed extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this._datos = [];
        this._categoriaActiva = 'todas';
        this._consulta = '';
        this._mostrarResultados = false;
        this._debounceBuscar = crearBuscadorDebounce(() => this._actualizarResultados(), 180);
    }

    static get observedAttributes() {
        return ['placeholder', 'limite'];
    }

    connectedCallback() {
        this._renderBase();
        this._conectarEventos();
    }

    set items(lista) {
        this._datos = Array.isArray(lista) ? lista : [];
        this._actualizarResultados();
    }

    get items() {
        return this._datos;
    }

    get valor() {
        return this._consulta;
    }

    _renderBase() {
        const placeholder = this.getAttribute('placeholder') || 'Buscar pacientes, consultas, exámenes o clínicas...';

        this.shadowRoot.innerHTML = `
        <style>
            :host {
                display: block;
                position: relative;
                z-index: 100;
                width: 100%;
                max-width: 720px;
                margin: 0 auto;
                font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
                color: var(--text, #e2f0eb);
            }

            * {
                box-sizing: border-box;
            }

            /* Contenedor principal con efecto Glassmorphic */
            .glass-search-box {
                position: relative;
                z-index: 100;
                background: var(--glass, rgba(29, 51, 56, 0.65));
                border: 1px solid var(--border, rgba(172, 223, 206, 0.15));
                border-radius: 20px;
                padding: 8px 14px;
                box-shadow: var(--glass-shadow, 0 8px 32px rgba(0, 0, 0, 0.25)), inset 0 1px 0 rgba(211, 249, 232, 0.05);
                -webkit-backdrop-filter: blur(24px);
                backdrop-filter: blur(24px);
                transition: border-color 0.25s ease, box-shadow 0.25s ease, transform 0.2s ease;
            }

            .glass-search-box:focus-within {
                border-color: var(--accent, #78d4b0);
                box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35), 0 0 0 3px rgba(120, 212, 176, 0.18);
            }

            .search-input-row {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .search-icon-badge {
                display: grid;
                place-items: center;
                width: 38px;
                height: 38px;
                border-radius: 12px;
                background: var(--mint-soft, #284b43);
                color: var(--accent, #78d4b0);
                flex-shrink: 0;
                transition: transform 0.2s ease;
            }

            .glass-search-box:focus-within .search-icon-badge {
                transform: scale(1.05);
            }

            .search-icon-badge svg {
                width: 20px;
                height: 20px;
            }

            .search-input {
                flex: 1;
                background: transparent;
                border: none;
                outline: none;
                font-size: 15px;
                color: var(--text, #e2f0eb);
                font-family: inherit;
            }

            .search-input::placeholder {
                color: var(--muted, #a2b9b8);
                opacity: 0.8;
            }

            .btn-clear {
                display: none;
                align-items: center;
                justify-content: center;
                width: 26px;
                height: 26px;
                background: rgba(255, 255, 255, 0.08);
                border: 1px solid var(--border, rgba(172, 223, 206, 0.15));
                border-radius: 50%;
                color: var(--muted, #a2b9b8);
                cursor: pointer;
                transition: background 0.2s, color 0.2s;
            }

            .btn-clear:hover {
                background: rgba(255, 255, 255, 0.16);
                color: var(--text, #e2f0eb);
            }

            .btn-clear svg {
                width: 14px;
                height: 14px;
            }

            .btn-clear.visible {
                display: flex;
            }

            /* Píldoras de filtro por categoría */
            .category-filters {
                display: flex;
                gap: 8px;
                margin-top: 10px;
                padding-top: 8px;
                border-top: 1px solid var(--divider, rgba(160, 208, 193, 0.12));
                overflow-x: auto;
                scrollbar-width: none;
            }

            .category-filters::-webkit-scrollbar {
                display: none;
            }

            .filter-pill {
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                color: var(--muted, #a2b9b8);
                font-size: 11px;
                font-weight: 600;
                padding: 5px 12px;
                border-radius: 9999px;
                cursor: pointer;
                white-space: nowrap;
                transition: all 0.2s ease;
                display: inline-flex;
                align-items: center;
                gap: 5px;
            }

            .filter-pill:hover {
                background: var(--mint-soft, #284b43);
                color: var(--accent-text, #8bdbbc);
                border-color: var(--accent, #78d4b0);
            }

            .filter-pill.active {
                background: var(--accent, #78d4b0);
                color: var(--on-accent, #122e2a);
                border-color: var(--accent, #78d4b0);
                box-shadow: 0 2px 10px rgba(120, 212, 176, 0.25);
            }

            /* Contenedor de Resultados Flotantes Glass */
            .results-container {
                position: absolute;
                top: calc(100% + 10px);
                left: 0;
                right: 0;
                background: var(--window, rgba(26, 49, 53, 0.94));
                border: 1px solid var(--border-strong, rgba(160, 208, 193, 0.22));
                border-radius: 18px;
                box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(211, 249, 232, 0.06);
                -webkit-backdrop-filter: blur(24px);
                backdrop-filter: blur(24px);
                padding: 12px;
                z-index: 1000;
                max-height: 440px;
                overflow-y: auto;
                display: none;
            }

            .results-container.open {
                display: block;
                animation: fadeIn 0.2s ease-out;
            }

            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-6px); }
                to { opacity: 1; transform: translateY(0); }
            }

            .results-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 6px 10px 10px;
                border-bottom: 1px solid var(--divider, rgba(160, 208, 193, 0.12));
                font-size: 11px;
                letter-spacing: 0.5px;
                color: var(--muted, #a2b9b8);
                text-transform: uppercase;
                font-weight: 600;
            }

            .results-count-badge {
                background: var(--mint-soft, #284b43);
                color: var(--accent-text, #8bdbbc);
                padding: 2px 8px;
                border-radius: 10px;
                font-weight: 700;
            }

            .results-grid {
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-top: 10px;
            }

            /* Estilo idéntico a las floating-cards de la imagen */
            .floating-card-item {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px 14px;
                border: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                border-radius: 14px;
                background: var(--float, rgba(37, 64, 67, 0.75));
                box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
                -webkit-backdrop-filter: blur(16px);
                backdrop-filter: blur(16px);
                cursor: pointer;
                transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
                text-decoration: none;
                color: inherit;
            }

            .floating-card-item:hover {
                transform: translateX(4px);
                border-color: var(--accent, #78d4b0);
                background: var(--float, rgba(45, 80, 84, 0.85));
            }

            .floating-icon {
                display: grid;
                place-items: center;
                width: 36px;
                height: 36px;
                border-radius: 10px;
                flex-shrink: 0;
            }

            .floating-icon svg {
                width: 18px;
                height: 18px;
            }

            .floating-icon.mint {
                background: var(--mint-soft, #284b43);
                color: var(--accent-text, #8bdbbc);
            }

            .floating-icon.blue {
                background: var(--blue-soft, #263f51);
                color: var(--blue-text, #9dc6e0);
            }

            .floating-icon.lavender {
                background: var(--lavender-soft, #3c3553);
                color: var(--lavender-text, #c8b5e7);
            }

            .card-info {
                flex: 1;
                min-width: 0;
            }

            .card-title {
                display: block;
                font-size: 13px;
                font-weight: 650;
                color: var(--text, #e2f0eb);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .card-subtext {
                display: block;
                font-size: 11px;
                color: var(--muted, #a2b9b8);
                margin-top: 2px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .connection-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: var(--accent, #78d4b0);
                opacity: 0.5;
                transition: opacity 0.2s ease, transform 0.2s ease;
            }

            .floating-card-item:hover .connection-dot {
                opacity: 1;
                transform: scale(1.3);
            }

            .resaltado-glass {
                background: rgba(120, 212, 176, 0.28);
                color: #a7f3d0;
                padding: 1px 3px;
                border-radius: 4px;
                font-weight: 600;
            }

            .no-results {
                padding: 24px;
                text-align: center;
                color: var(--muted, #a2b9b8);
                font-size: 13px;
            }

            .no-results span {
                display: block;
                font-size: 20px;
                margin-bottom: 6px;
            }
        </style>

        <div class="glass-search-box">
            <div class="search-input-row">
                <div class="search-icon-badge" aria-hidden="true">
                    ${ICONOS.search}
                </div>
                <input 
                    type="text" 
                    class="search-input" 
                    id="inputSearch" 
                    placeholder="${escaparHtml(placeholder)}"
                    autocomplete="off"
                    spellcheck="false"
                />
                <button type="button" class="btn-clear" id="btnClear" aria-label="Limpiar búsqueda">
                    ${ICONOS.clear}
                </button>
            </div>

            <div class="category-filters" role="tablist" aria-label="Filtro de categorías">
                <button type="button" class="filter-pill active" data-cat="todas">✦ Todas</button>
                <button type="button" class="filter-pill" data-cat="paciente">Pacientes</button>
                <button type="button" class="filter-pill" data-cat="consulta">Consultas</button>
                <button type="button" class="filter-pill" data-cat="examen">Exámenes</button>
                <button type="button" class="filter-pill" data-cat="clinica">Clínicas</button>
            </div>

            <div class="results-container" id="resultsBox">
                <div class="results-header">
                    <span>Resultados de la clínica</span>
                    <span class="results-count-badge" id="resultsCount">0</span>
                </div>
                <div class="results-grid" id="resultsGrid"></div>
            </div>
        </div>
        `;
    }

    _conectarEventos() {
        const input = this.shadowRoot.getElementById('inputSearch');
        const btnClear = this.shadowRoot.getElementById('btnClear');
        const filterPills = this.shadowRoot.querySelectorAll('.filter-pill');

        input.addEventListener('input', (e) => {
            this._consulta = e.target.value;
            btnClear.classList.toggle('visible', Boolean(this._consulta));
            this._debounceBuscar();
        });

        input.addEventListener('focus', () => {
            if (this._consulta.trim().length > 0) {
                this._mostrarResultados = true;
                this._actualizarVisibilidadResultados();
            }
        });

        btnClear.addEventListener('click', () => {
            input.value = '';
            this._consulta = '';
            btnClear.classList.remove('visible');
            this._mostrarResultados = false;
            this._actualizarVisibilidadResultados();
            input.focus();
            this.dispatchEvent(new CustomEvent('busqueda-limpiada'));
        });

        filterPills.forEach(pill => {
            pill.addEventListener('click', () => {
                filterPills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this._categoriaActiva = pill.dataset.cat;
                this._actualizarResultados();
            });
        });

        // Ocultar resultados al hacer clic fuera del componente
        document.addEventListener('click', (e) => {
            if (!this.contains(e.target)) {
                this._mostrarResultados = false;
                this._actualizarVisibilidadResultados();
            }
        });
    }

    _actualizarVisibilidadResultados() {
        const box = this.shadowRoot.getElementById('resultsBox');
        if (box) {
            box.classList.toggle('open', this._mostrarResultados);
        }
    }

    _actualizarResultados() {
        const consulta = this._consulta.trim();
        const resultsBox = this.shadowRoot.getElementById('resultsBox');
        const resultsGrid = this.shadowRoot.getElementById('resultsGrid');
        const resultsCount = this.shadowRoot.getElementById('resultsCount');

        if (!resultsGrid) return;

        // Filtrar por categoría activa
        let itemsBase = this._datos;
        if (this._categoriaActiva !== 'todas') {
            itemsBase = itemsBase.filter(i => (i.categoria || i.tipo || '').toLowerCase().includes(this._categoriaActiva));
        }

        // Aplicar la función de filtrado con normalización y multi-términos
        const filtrados = filtrarColeccion(itemsBase, consulta, {
            campos: ['nombre', 'detalle', 'categoria', 'tipo', 'observaciones', 'identificador'],
            limite: parseInt(this.getAttribute('limite') || '15', 10)
        });

        resultsCount.textContent = `${filtrados.length} encontrados`;

        if (!consulta) {
            this._mostrarResultados = false;
            this._actualizarVisibilidadResultados();
            return;
        }

        this._mostrarResultados = true;
        this._actualizarVisibilidadResultados();

        if (filtrados.length === 0) {
            resultsGrid.innerHTML = `
                <div class="no-results">
                    <span>🩺</span>
                    No se encontraron coincidencias para "<strong>${escaparHtml(consulta)}</strong>".
                </div>
            `;
            return;
        }

        resultsGrid.innerHTML = filtrados.map(item => {
            const cat = String(item.categoria || item.tipo || 'clinica').toLowerCase();
            let tone = 'mint';
            let iconSvg = ICONOS.paciente;

            if (cat.includes('paciente')) {
                tone = 'mint';
                iconSvg = ICONOS.paciente;
            } else if (cat.includes('consulta')) {
                tone = 'blue';
                iconSvg = ICONOS.consulta;
            } else if (cat.includes('examen') || cat.includes('lab')) {
                tone = 'lavender';
                iconSvg = ICONOS.examen;
            } else {
                tone = 'mint';
                iconSvg = ICONOS.clinica;
            }

            const tituloResaltado = resaltarCoincidencias(item.nombre || 'Sin título', consulta);
            const detalleResaltado = resaltarCoincidencias(item.detalle || item.observaciones || item.tipo || '', consulta);

            return `
                <div class="floating-card-item" data-id="${escaparHtml(String(item.id || ''))}" tabindex="0">
                    <span class="floating-icon ${tone}">${iconSvg}</span>
                    <div class="card-info">
                        <strong class="card-title">${tituloResaltado}</strong>
                        <small class="card-subtext">${detalleResaltado}</small>
                    </div>
                    <span class="connection-dot" aria-hidden="true"></span>
                </div>
            `;
        }).join('');

        // Eventos de selección de tarjeta
        resultsGrid.querySelectorAll('.floating-card-item').forEach(el => {
            const id = el.dataset.id;
            const seleccionado = this._datos.find(i => String(i.id) === id);

            const manejarSeleccion = () => {
                this._mostrarResultados = false;
                this._actualizarVisibilidadResultados();
                this.dispatchEvent(new CustomEvent('item-seleccionado', {
                    detail: { item: seleccionado },
                    bubbles: true,
                    composed: true
                }));
            };

            el.addEventListener('click', manejarSeleccion);
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') manejarSeleccion();
            });
        });
    }
}

if (!customElements.get('busqueda-chivomed')) {
    customElements.define('busqueda-chivomed', BusquedaChivoMed);
}

export default BusquedaChivoMed;

