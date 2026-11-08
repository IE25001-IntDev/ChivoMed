import { escapeHtml } from '../../utils.js';
import {
    filtrarColeccion,
    crearBuscadorDebounce,
    resaltarCoincidencias,
} from '../../../control/busqueda_util.js';

/**
 * Web Component: <panel-catalogo-simple>
 * Componente presentacional CRUD para catálogos simples del personal de clínica:
 * - Clínicas (clinica.xhtml)
 * - Roles (rol.xhtml)
 * - Tipos de Documento con validador interactivo de RegEx (tipoDocumento.xhtml)
 * - Tipos de Medio de Contacto con validador interactivo de RegEx (tipoMedioContacto.xhtml)
 *
 * Emite: 'guardar-item', 'eliminar-item'
 */
class PanelCatalogoSimple extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._tipoCatalogo = 'clinicas'; // 'clinicas', 'roles', 'documentos', 'contactos'
        this._items = [];
        this._itemEnEdicion = null;
        this._filtroBusqueda = '';
        this._mostrarFormulario = false;
        this._cargando = false;
        this._regexPruebaMuestra = '';
        this._debounceBuscar = crearBuscadorDebounce(() => this.render(), 180);
    }

    set tipoCatalogo(val) {
        if (this._tipoCatalogo !== val) {
            this._tipoCatalogo = val;
            this._mostrarFormulario = false;
            this._itemEnEdicion = null;
            this._filtroBusqueda = '';
            this._regexPruebaMuestra = '';
        }
        this.render();
    }
    get tipoCatalogo() { return this._tipoCatalogo; }

    set items(val) { this._items = Array.isArray(val) ? val : []; this.render(); }
    get items() { return this._items; }

    set cargando(val) { this._cargando = Boolean(val); this.render(); }

    cerrarFormulario() {
        this._mostrarFormulario = false;
        this._itemEnEdicion = null;
        this._regexPruebaMuestra = '';
        this.render();
    }

    connectedCallback() {
        this._onKeyDown = (e) => {
            if (e.key === 'Escape' && this._mostrarFormulario) {
                this._mostrarFormulario = false;
                this._itemEnEdicion = null;
                this.render();
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

    getConfig() {
        const configs = {
            clinicas: {
                titulo: '🏢 Sedes Clínicas',
                subtitulo: 'Administración de sedes y centros médicos.',
                idField: 'idClinica',
                campos: [
                    { name: 'nombre', label: 'Nombre de la Sede', type: 'text', required: true, placeholder: 'Ej: Hospital Central San Salvador' },
                    { name: 'tipo', label: 'Tipo de Establecimiento', type: 'text', placeholder: 'Ej: Hospital, Clínica General, Unidad Médica' },
                    { name: 'activo', label: 'Estado Operativo Activo', type: 'checkbox', default: true },
                    { name: 'comentarios', label: 'Observaciones / Horarios', type: 'textarea', placeholder: 'Comentarios o indicaciones generales...' },
                ],
                columnas: ['Nombre', 'Tipo', 'Estado', 'Comentarios'],
            },
            roles: {
                titulo: '👥 Roles',
                subtitulo: 'Roles institucionales de atención.',
                idField: 'idRol',
                campos: [
                    { name: 'nombre', label: 'Nombre del Rol', type: 'text', required: true, placeholder: 'Ej: Médico Especialista, Enfermero' },
                    { name: 'activo', label: 'Rol Activo', type: 'checkbox', default: true },
                    { name: 'observaciones', label: 'Descripción / Responsabilidades', type: 'textarea', placeholder: 'Alcance de las funciones del rol...' },
                ],
                columnas: ['Nombre', 'Estado', 'Observaciones'],
            },
            documentos: {
                titulo: '🪪 Documentos',
                subtitulo: 'Documentos legales y validación RegEx.',
                idField: 'idTipoDocumento',
                tieneRegex: true,
                campos: [
                    { name: 'nombre', label: 'Nombre del Documento', type: 'text', required: true, placeholder: 'Ej: DUI, NIT, Pasaporte' },
                    { name: 'expresionRegular', label: 'Expresión Regular (RegEx)', type: 'text', required: true, placeholder: 'Ej: ^\\d{8}-\\d$' },
                    { name: 'indicaciones', label: 'Instrucciones al Usuario', type: 'text', placeholder: 'Ej: Formato requerido: 8 dígitos guion 1 dígito' },
                    { name: 'activo', label: 'Documento Activo', type: 'checkbox', default: true },
                ],
                columnas: ['Nombre', 'RegEx de Validación', 'Indicaciones', 'Estado'],
            },
            contactos: {
                titulo: '📞 Medios de Contacto',
                subtitulo: 'Canales de comunicación del paciente.',
                idField: 'idTipoMedioContacto',
                tieneRegex: true,
                campos: [
                    { name: 'nombre', label: 'Nombre del Canal', type: 'text', required: true, placeholder: 'Ej: Teléfono Móvil, Correo Electrónico' },
                    { name: 'expresionRegular', label: 'Expresión Regular (RegEx)', type: 'text', required: true, placeholder: 'Ej: ^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+$' },
                    { name: 'indicaciones', label: 'Instrucciones de Captura', type: 'text', placeholder: 'Ej: Ingrese una dirección de correo válida' },
                    { name: 'activo', label: 'Canal Activo', type: 'checkbox', default: true },
                ],
                columnas: ['Nombre', 'RegEx de Validación', 'Indicaciones', 'Estado'],
            },
        };

        return configs[this._tipoCatalogo] || configs.clinicas;
    }

    evaluarRegex(patron, muestra) {
        if (!patron) return { valido: false, coincide: false, mensaje: 'Sin patrón' };
        try {
            const re = new RegExp(patron);
            if (!muestra) return { valido: true, coincide: false, mensaje: 'Patrón sintácticamente correcto' };
            const coincide = re.test(muestra);
            return {
                valido: true,
                coincide,
                mensaje: coincide ? '✅ La muestra coincide con el patrón' : '❌ La muestra NO coincide con el patrón',
            };
        } catch (e) {
            return { valido: false, coincide: false, mensaje: `Sintaxis RegEx inválida: ${e.message}` };
        }
    }

    render() {
        const config = this.getConfig();
        const itemsFiltrados = filtrarColeccion(this._items, this._filtroBusqueda, {
            campos: ['nombre', 'tipo', 'observaciones', 'comentarios', 'indicaciones', 'expresionRegular']
        });

        const idEdicion = this._itemEnEdicion ? this._itemEnEdicion[config.idField] : null;

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: block;
                    background: var(--card-glass, rgba(29, 51, 56, 0.7));
                    backdrop-filter: blur(28px) saturate(180%);
                    -webkit-backdrop-filter: blur(28px) saturate(180%);
                    border: 1px solid var(--card-border, rgba(172, 223, 206, 0.14));
                    border-radius: var(--card-radius, 20px);
                    padding: 1.75rem;
                    box-shadow: var(--card-shadow, var(--glass-shadow));
                    transition: var(--transition-card, all 0.28s ease);
                }
                .header-bar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                    padding-bottom: 1rem;
                    margin-bottom: 1.25rem;
                    flex-wrap: wrap;
                    gap: 0.75rem;
                }
                .title-box h3 {
                    font-size: 1.15rem;
                    color: var(--text, #e2f0eb);
                    font-weight: 700;
                    margin: 0;
                }
                .title-box p {
                    font-size: 0.85rem;
                    color: var(--muted, #a2b9b8);
                    margin-top: 0.25rem;
                    margin-bottom: 0;
                }
                .toolbar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 1rem;
                    gap: 1rem;
                    flex-wrap: wrap;
                }
                .search-box {
                    position: relative;
                    display: inline-flex;
                    align-items: center;
                    min-width: 280px;
                    max-width: 420px;
                    flex: 1;
                }
                .search-icon {
                    position: absolute;
                    left: 0.85rem;
                    font-size: 0.85rem;
                    color: var(--muted, #a2b9b8);
                    pointer-events: none;
                }
                .search-input {
                    padding: 0.55rem 2rem 0.55rem 2.3rem;
                    border: 1px solid var(--border-strong, rgba(172, 223, 206, 0.25));
                    border-radius: 9999px;
                    font-size: 0.85rem;
                    width: 100%;
                    outline: none;
                    background: var(--surface-solid, #20383d);
                    color: var(--text, #e2f0eb);
                    transition: all 0.2s;
                }
                .search-input:focus {
                    border-color: var(--accent, #78d4b0);
                    box-shadow: 0 0 0 2px rgba(120, 212, 176, 0.2);
                }
                .btn-clear-search {
                    position: absolute;
                    right: 0.75rem;
                    background: transparent;
                    border: none;
                    color: var(--muted, #a2b9b8);
                    cursor: pointer;
                    font-size: 0.85rem;
                    padding: 0.2rem;
                }
                .btn-clear-search:hover { color: var(--text, #e2f0eb); }
                mark.resaltado-busqueda {
                    background: var(--accent, #78d4b0);
                    color: var(--on-accent, #122e2a);
                    font-weight: 800;
                    padding: 0.1rem 0.3rem;
                    border-radius: 3px;
                }
                .btn {
                    padding: 0.45rem 1rem;
                    border-radius: 9999px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    cursor: pointer;
                    border: none;
                    display: inline-flex;
                    align-items: center;
                    gap: 0.35rem;
                    transition: all 0.22s var(--ease-spring, cubic-bezier(0.16, 1, 0.3, 1));
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
                    box-shadow: 0 0 16px rgba(120, 212, 176, 0.35);
                }
                .btn-outline { 
                    background: transparent; 
                    border: 1px solid var(--border-strong, rgba(172, 223, 206, 0.25)); 
                    color: var(--text, #e2f0eb); 
                }
                .btn-outline:hover:not(:disabled) { 
                    background: var(--surface-muted, rgba(255, 255, 255, 0.05)); 
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
                    max-width: 620px;
                    width: 100%;
                    max-height: 85vh;
                    overflow-y: auto;
                    padding: 1.75rem;
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
                    padding-bottom: 1rem;
                    margin-bottom: 1.25rem;
                }

                .modal-title {
                    font-size: 1.15rem;
                    font-weight: 700;
                    color: var(--accent, #78d4b0);
                    margin: 0;
                }

                .modal-subtitle {
                    font-size: 0.8rem;
                    color: var(--muted, #a2b9b8);
                    margin-top: 0.25rem;
                }

                .btn-close-modal {
                    background: var(--surface-muted, rgba(255, 255, 255, 0.06));
                    border: 1px solid var(--border, rgba(172, 223, 206, 0.15));
                    border-radius: 50%;
                    width: 32px;
                    height: 32px;
                    display: grid;
                    place-items: center;
                    color: var(--muted, #a2b9b8);
                    font-size: 0.9rem;
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
                    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
                    gap: 1rem;
                    margin-bottom: 1rem;
                }
                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.35rem;
                }
                .form-label {
                    font-size: 0.8rem;
                    font-weight: 700;
                    color: var(--text, #e2f0eb);
                }
                .input-field {
                    padding: 0.6rem 0.85rem;
                    border: 1px solid var(--border-strong, rgba(172, 223, 206, 0.25));
                    border-radius: 8px;
                    font-size: 0.85rem;
                    font-family: inherit;
                    box-sizing: border-box;
                    background: var(--surface-solid, #20383d);
                    color: var(--text, #e2f0eb);
                    outline: none;
                }
                .input-field:focus {
                    border-color: var(--accent, #78d4b0);
                    box-shadow: 0 0 0 2px rgba(120, 212, 176, 0.2);
                }
                .regex-tester {
                    background: var(--surface-muted, rgba(0, 0, 0, 0.25));
                    border: 1px dashed var(--border-strong, rgba(172, 223, 206, 0.25));
                    border-radius: 8px;
                    padding: 0.85rem;
                    margin-top: 0.5rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.4rem;
                }

                /* Tabla de Datos */
                .table-container {
                    overflow-x: auto;
                    border: 1px solid var(--border, rgba(172, 223, 206, 0.15));
                    border-radius: 12px;
                    background: var(--surface-solid, #20383d);
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 0.875rem;
                    text-align: left;
                }
                th {
                    background: var(--table-header-bg, rgba(0, 0, 0, 0.25));
                    color: var(--muted, #a2b9b8);
                    padding: 0.75rem 1rem;
                    font-weight: 700;
                    border-bottom: 1px solid var(--border, rgba(172, 223, 206, 0.15));
                }
                td {
                    padding: 0.75rem 1rem;
                    border-bottom: 1px solid rgba(172, 223, 206, 0.08);
                    color: var(--text, #e2f0eb);
                }
                tr:hover { background: var(--table-row-hover, rgba(255, 255, 255, 0.04)); }
                .badge {
                    display: inline-block;
                    padding: 0.2rem 0.5rem;
                    border-radius: 9999px;
                    font-size: 0.75rem;
                    font-weight: 700;
                }
                .badge-active { background: var(--mint-soft, #284b43); color: var(--accent-text, #8bdbbc); border: 1px solid var(--border-strong, rgba(160, 208, 193, 0.25)); }
                .badge-inactive { background: var(--badge-inactive-bg, rgba(0, 0, 0, 0.2)); color: var(--badge-inactive-color, var(--muted, #a2b9b8)); border: 1px solid var(--border, rgba(172, 223, 206, 0.12)); }
                .regex-code {
                    font-family: monospace;
                    background: var(--code-bg, rgba(0, 0, 0, 0.25));
                    padding: 0.15rem 0.45rem;
                    border-radius: 4px;
                    color: var(--accent, #78d4b0);
                    font-size: 0.8rem;
                }
            </style>

            <div class="header-bar">
                <div class="title-box">
                    <h3>${escapeHtml(config.titulo)}</h3>
                    <p>${escapeHtml(config.subtitulo)}</p>
                </div>
                <button type="button" class="btn btn-primary" id="btnToggleForm">
                    ➕ Nuevo
                </button>
            </div>

            ${this._mostrarFormulario ? `
                <div class="modal-backdrop" id="modalBackdrop">
                    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
                        <div class="modal-header">
                            <div>
                                <h4 id="modalTitle" class="modal-title">
                                    ${idEdicion ? '✏️ Editar Registro' : '➕ Nuevo Registro'}
                                </h4>
                                <div class="modal-subtitle">
                                    ${idEdicion ? `ID: ${escapeHtml(idEdicion)}` : escapeHtml(config.titulo)}
                                </div>
                            </div>
                            <button type="button" class="btn-close-modal" id="btnCloseModal" title="Cerrar ventana emergente" aria-label="Cerrar">✕</button>
                        </div>

                        <form id="formRegistro">
                            <div class="form-grid">
                                ${config.campos.map(c => {
                                    const val = this._itemEnEdicion ? this._itemEnEdicion[c.name] : (c.default !== undefined ? c.default : '');
                                    if (c.type === 'checkbox') {
                                        return `
                                            <div class="form-group" style="flex-direction: row; align-items: center; gap: 0.5rem; margin-top: 1.5rem;">
                                                <input type="checkbox" id="field-${c.name}" name="${c.name}" ${val ? 'checked' : ''}/>
                                                <label class="form-label" for="field-${c.name}">${escapeHtml(c.label)}</label>
                                            </div>
                                        `;
                                    }
                                    if (c.type === 'textarea') {
                                        return `
                                            <div class="form-group" style="grid-column: 1 / -1;">
                                                <label class="form-label" for="field-${c.name}">${escapeHtml(c.label)}</label>
                                                <textarea class="input-field" id="field-${c.name}" name="${c.name}" placeholder="${escapeHtml(c.placeholder || '')}">${escapeHtml(val || '')}</textarea>
                                            </div>
                                        `;
                                    }
                                    return `
                                        <div class="form-group">
                                            <label class="form-label" for="field-${c.name}">${escapeHtml(c.label)} ${c.required ? '<span style="color:#ef4444;">*</span>' : ''}</label>
                                            <input type="${c.type}" class="input-field" id="field-${c.name}" name="${c.name}" value="${escapeHtml(val || '')}" placeholder="${escapeHtml(c.placeholder || '')}" ${c.required ? 'required' : ''}/>
                                        </div>
                                    `;
                                }).join('')}
                            </div>

                            ${config.tieneRegex ? `
                                <div class="regex-tester">
                                    <label class="form-label" style="color: var(--accent, #78d4b0);">🧪 Probador de Expresión Regular en Vivo:</label>
                                    <input type="text" class="input-field" id="inputMuestraRegex" placeholder="Ingresa un valor de prueba para verificar si cumple la RegEx..." value="${escapeHtml(this._regexPruebaMuestra)}"/>
                                    <div id="regexFeedback" style="font-size: 0.8rem; font-weight: 600; color: var(--muted, #a2b9b8);">
                                        Ingresa un patrón arriba y escribe una muestra aquí para probar.
                                    </div>
                                </div>
                            ` : ''}

                            <div style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem;">
                                <button type="button" class="btn btn-outline" id="btnCancelarForm">✕ Cancelar</button>
                                <button type="submit" class="btn btn-primary" ${this._cargando ? 'disabled' : ''}>
                                    ${this._cargando ? '⏳ Guardando...' : '💾 Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ` : ''}

            <div class="toolbar">
                <div class="search-box">
                    <span class="search-icon">🔍</span>
                    <input type="text" class="search-input" id="inputBuscar" placeholder="Buscar por nombre, tipo u observaciones (insensible a tildes)..." value="${escapeHtml(this._filtroBusqueda)}"/>
                    ${this._filtroBusqueda ? `<button type="button" class="btn-clear-search" id="btnClearSearch">✕</button>` : ''}
                </div>
                <span style="font-size: 0.85rem; color: var(--muted, #a2b9b8);">
                    ${this._filtroBusqueda ? `Coincidencias: <strong>${itemsFiltrados.length}</strong> de ${this._items.length}` : `Total: <strong>${itemsFiltrados.length}</strong> registro(s)`}
                </span>
            </div>

            <div class="table-container">
                ${itemsFiltrados.length === 0 ? `
                    <div style="padding: 2.5rem; text-align: center; color: var(--muted, #a2b9b8);">
                        No se encontraron registros ${this._filtroBusqueda ? 'que coincidan con la búsqueda.' : 'en este catálogo.'}
                    </div>
                ` : `
                    <table>
                        <thead>
                            <tr>
                                ${config.columnas.map(col => `<th>${escapeHtml(col)}</th>`).join('')}
                                <th style="text-align: right;">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsFiltrados.map(item => {
                                const id = item[config.idField];
                                const isActivo = Boolean(item.activo);

                                return `
                                    <tr>
                                        <td><strong>${resaltarCoincidencias(item.nombre || 'Sin nombre', this._filtroBusqueda, 'resaltado-busqueda')}</strong></td>
                                        ${this._tipoCatalogo === 'clinicas' ? `
                                            <td>${resaltarCoincidencias(item.tipo || 'General', this._filtroBusqueda, 'resaltado-busqueda')}</td>
                                            <td><span class="badge ${isActivo ? 'badge-active' : 'badge-inactive'}">${isActivo ? 'Activa' : 'Inactiva'}</span></td>
                                            <td style="color: var(--muted, #a2b9b8);">${resaltarCoincidencias(item.comentarios || '—', this._filtroBusqueda, 'resaltado-busqueda')}</td>
                                        ` : ''}
                                        ${this._tipoCatalogo === 'roles' ? `
                                            <td><span class="badge ${isActivo ? 'badge-active' : 'badge-inactive'}">${isActivo ? 'Activo' : 'Inactivo'}</span></td>
                                            <td style="color: var(--muted, #a2b9b8);">${resaltarCoincidencias(item.observaciones || '—', this._filtroBusqueda, 'resaltado-busqueda')}</td>
                                        ` : ''}
                                        ${(this._tipoCatalogo === 'documentos' || this._tipoCatalogo === 'contactos') ? `
                                            <td><code class="regex-code">${resaltarCoincidencias(item.expresionRegular || '.', this._filtroBusqueda, 'resaltado-busqueda')}</code></td>
                                            <td style="color: var(--muted, #a2b9b8);">${resaltarCoincidencias(item.indicaciones || '—', this._filtroBusqueda, 'resaltado-busqueda')}</td>
                                            <td><span class="badge ${isActivo ? 'badge-active' : 'badge-inactive'}">${isActivo ? 'Activo' : 'Inactivo'}</span></td>
                                        ` : ''}
                                        <td style="text-align: right; white-space: nowrap;">
                                            <button type="button" class="btn btn-outline btn-edit" data-id="${escapeHtml(id)}">✏️ Editar</button>
                                            <button type="button" class="btn btn-danger btn-delete" data-id="${escapeHtml(id)}">🗑️ Eliminar</button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                `}
            </div>
        `;

        // Eventos
        const cerrarModal = () => {
            this._mostrarFormulario = false;
            this._itemEnEdicion = null;
            this.render();
        };

        const btnClose = this.shadowRoot.getElementById('btnCloseModal');
        if (btnClose) {
            btnClose.addEventListener('click', cerrarModal);
        }

        const modalBackdrop = this.shadowRoot.getElementById('modalBackdrop');
        if (modalBackdrop) {
            modalBackdrop.addEventListener('click', (e) => {
                if (e.target === modalBackdrop) {
                    cerrarModal();
                }
            });
        }

        const btnToggle = this.shadowRoot.getElementById('btnToggleForm');
        if (btnToggle) {
            btnToggle.addEventListener('click', () => {
                this._mostrarFormulario = true;
                this._itemEnEdicion = null;
                this.render();
            });
        }

        const btnCancel = this.shadowRoot.getElementById('btnCancelarForm');
        if (btnCancel) {
            btnCancel.addEventListener('click', cerrarModal);
        }

        const inputBuscar = this.shadowRoot.getElementById('inputBuscar');
        if (inputBuscar) {
            inputBuscar.addEventListener('input', (e) => {
                this._filtroBusqueda = e.target.value;
                this._debounceBuscar();
            });
        }

        const btnClearSearch = this.shadowRoot.getElementById('btnClearSearch');
        if (btnClearSearch) {
            btnClearSearch.addEventListener('click', () => {
                this._filtroBusqueda = '';
                this.render();
            });
        }

        // Live RegEx Tester
        const fieldRegex = this.shadowRoot.getElementById('field-expresionRegular');
        const inputMuestra = this.shadowRoot.getElementById('inputMuestraRegex');
        const regexFeedback = this.shadowRoot.getElementById('regexFeedback');

        const updateRegexFeedback = () => {
            if (!fieldRegex || !regexFeedback) return;
            const patron = fieldRegex.value.trim();
            const muestra = inputMuestra ? inputMuestra.value : '';
            this._regexPruebaMuestra = muestra;
            const res = this.evaluarRegex(patron, muestra);
            regexFeedback.textContent = res.mensaje;
            regexFeedback.style.color = res.valido ? (res.coincide ? '#15803d' : (muestra ? '#dc2626' : '#475569')) : '#dc2626';
        };

        if (fieldRegex && inputMuestra) {
            fieldRegex.addEventListener('input', updateRegexFeedback);
            inputMuestra.addEventListener('input', updateRegexFeedback);
        }

        // Submit Formulario
        const form = this.shadowRoot.getElementById('formRegistro');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const formData = new FormData(form);
                const datos = {};
                for (const campo of config.campos) {
                    if (campo.type === 'checkbox') {
                        datos[campo.name] = form.querySelector(`[name="${campo.name}"]`).checked;
                    } else {
                        const val = (formData.get(campo.name) || '').trim();
                        datos[campo.name] = val || null;
                    }
                }

                // Si tiene RegEx, verificar sintaxis
                if (config.tieneRegex && datos.expresionRegular) {
                    try {
                        new RegExp(datos.expresionRegular);
                    } catch (err) {
                        alert(`La expresión regular ingresada no es válida: ${err.message}`);
                        return;
                    }
                }

                this.dispatchEvent(new CustomEvent('guardar-item', {
                    detail: {
                        tipoCatalogo: this._tipoCatalogo,
                        id: idEdicion,
                        datos,
                    },
                    bubbles: true,
                    composed: true,
                }));

                this._mostrarFormulario = false;
                this._itemEnEdicion = null;
            });
        }

        // Editar
        this.shadowRoot.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const item = this._items.find(it => it[config.idField] === id);
                if (item) {
                    this._itemEnEdicion = item;
                    this._mostrarFormulario = true;
                    this.render();
                }
            });
        });

        // Eliminar
        this.shadowRoot.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                if (!confirm('¿Estás seguro de que deseas eliminar este registro del catálogo?')) return;
                this.dispatchEvent(new CustomEvent('eliminar-item', {
                    detail: {
                        tipoCatalogo: this._tipoCatalogo,
                        id,
                    },
                    bubbles: true,
                    composed: true,
                }));
            });
        });
    }
}

customElements.define('panel-catalogo-simple', PanelCatalogoSimple);
export default PanelCatalogoSimple;

