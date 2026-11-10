import { escapeHtml, resaltarCoincidencias } from '../../utils.js';
import {
    filtrarColeccion,
    crearBuscadorDebounce,
} from '../../../control/busqueda_util.js';

/**
 * Web Component: <panel-examenes>
 * Gestión de la taxonomía de exámenes de laboratorio y gabinete:
 * - Tipos de Examen (tipoExamen.xhtml)
 * - Exámenes Individuales (examen.xhtml)
 * - Clasificación y Asociación Examen ↔ Tipo Examen (examen_tipo_examen)
 *
 * Emite: 'guardar-tipo-examen', 'eliminar-tipo-examen', 'guardar-examen', 'eliminar-examen', 'asociar-examen-tipo', 'eliminar-asociacion'
 */
class PanelExamenes extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._tiposExamen = [];
        this._examenes = [];
        this._clasificaciones = [];
        this._subPestaña = 'tipos'; // 'tipos', 'examenes', 'clasificacion'
        this._cargando = false;
        this._itemEnEdicion = null;
        this._mostrarFormulario = false;
        this._filtroBusquedaTipos = '';
        this._filtroBusquedaExamenes = '';
        this._debounceBuscar = crearBuscadorDebounce(() => this.render(), 180);
    }

    set tiposExamen(val) { this._tiposExamen = Array.isArray(val) ? val : []; this.render(); }
    set examenes(val) { this._examenes = Array.isArray(val) ? val : []; this.render(); }
    set clasificaciones(val) { this._clasificaciones = Array.isArray(val) ? val : []; this.render(); }
    set cargando(val) { this._cargando = Boolean(val); this.render(); }

    cerrarFormulario() {
        this._mostrarFormulario = false;
        this._itemEnEdicion = null;
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

    render() {
        const tiposFiltrados = filtrarColeccion(this._tiposExamen, this._filtroBusquedaTipos, {
            campos: ['nombre', 'observaciones']
        });
        const examenesFiltrados = filtrarColeccion(this._examenes, this._filtroBusquedaExamenes, {
            campos: ['nombre', 'observaciones']
        });

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: flex;
                    flex-direction: column;
                    min-height: calc(100vh - 190px);
                    background: var(--card-glass, rgba(29, 51, 56, 0.7));
                    backdrop-filter: blur(28px) saturate(180%);
                    -webkit-backdrop-filter: blur(28px) saturate(180%);
                    border: 1px solid var(--card-border, rgba(172, 223, 206, 0.14));
                    border-radius: var(--card-radius, 20px);
                    padding: 3.25rem 3.75rem;
                    box-shadow: var(--card-shadow, var(--glass-shadow));
                    transition: var(--transition-card, all 0.28s ease);
                    box-sizing: border-box;
                }
                .section-header {
                    border-bottom: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                    padding-top: 0.5rem;
                    padding-bottom: 1.75rem;
                    margin-bottom: 2.25rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 1.25rem;
                }
                .title-box {
                    display: flex;
                    flex-direction: column;
                    gap: 0.5rem;
                    padding: 0.25rem 0.5rem;
                }
                .title-box h3 {
                    font-size: 1.35rem;
                    font-weight: 700;
                    color: var(--text, #e2f0eb);
                    margin: 0;
                }
                .title-box p {
                    font-size: 0.92rem;
                    color: var(--muted, #a2b9b8);
                    margin: 0;
                    line-height: 1.5;
                }
                .nav-pills {
                    display: flex;
                    gap: 0.65rem;
                    margin-bottom: 2.25rem;
                    background: var(--surface-muted, rgba(0, 0, 0, 0.15));
                    padding: 0.55rem;
                    border-radius: 9999px;
                    border: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                    width: fit-content;
                    flex-wrap: wrap;
                }
                .pill-btn {
                    padding: 0.7rem 1.35rem;
                    border-radius: 9999px;
                    font-size: 0.9rem;
                    font-weight: 600;
                    border: 1px solid transparent;
                    background: transparent;
                    color: var(--muted, #a2b9b8);
                    cursor: pointer;
                    transition: all 0.22s var(--ease-spring, cubic-bezier(0.16, 1, 0.3, 1));
                }
                .pill-btn:hover:not(:disabled) {
                    color: var(--text, #e2f0eb);
                    background: var(--surface-muted, rgba(255, 255, 255, 0.05));
                }
                .pill-btn.active {
                    background: var(--accent, #78d4b0);
                    color: var(--on-accent, #122e2a);
                    font-weight: 700;
                    box-shadow: 0 2px 10px var(--glow-mint);
                }
                .btn {
                    padding: 0.75rem 1.6rem;
                    border-radius: 9999px;
                    font-size: 0.92rem;
                    font-weight: 600;
                    cursor: pointer;
                    border: none;
                    display: inline-flex;
                    align-items: center;
                    gap: 0.65rem;
                    transition: all 0.22s var(--ease-spring, cubic-bezier(0.16, 1, 0.3, 1));
                }
                .btn-sm {
                    padding: 0.5rem 1.1rem;
                    font-size: 0.85rem;
                    gap: 0.55rem;
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
                    box-shadow: 0 0 12px rgba(120, 212, 176, 0.3);
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

                /* Barra de Búsqueda */
                .toolbar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 2.25rem;
                    gap: 1.5rem;
                    flex-wrap: wrap;
                }
                .search-box {
                    position: relative;
                    display: inline-flex;
                    align-items: center;
                    min-width: 320px;
                    max-width: 480px;
                    flex: 1;
                }
                .search-icon {
                    position: absolute;
                    left: 1.15rem;
                    font-size: 0.95rem;
                    color: var(--muted, #a2b9b8);
                    pointer-events: none;
                }
                .search-input {
                    padding: 0.85rem 2.6rem 0.85rem 2.85rem;
                    min-height: 3.1rem;
                    border: 1px solid var(--border-strong, rgba(172, 223, 206, 0.25));
                    border-radius: 9999px;
                    font-size: 0.92rem;
                    width: 100%;
                    outline: none;
                    background: var(--surface-solid, #20383d);
                    color: var(--text, #e2f0eb);
                    transition: all 0.2s;
                    box-sizing: border-box;
                }
                .search-input:focus {
                    border-color: var(--accent, #78d4b0);
                    box-shadow: 0 0 0 2px rgba(120, 212, 176, 0.2);
                }
                .btn-clear-search {
                    position: absolute;
                    right: 0.9rem;
                    background: transparent;
                    border: none;
                    color: var(--muted, #a2b9b8);
                    cursor: pointer;
                    font-size: 0.85rem;
                    padding: 0.25rem;
                }
                .btn-clear-search:hover { color: var(--text, #e2f0eb); }
                mark.resaltado-busqueda {
                    background: var(--accent, #78d4b0);
                    color: var(--on-accent, #122e2a);
                    font-weight: 800;
                    padding: 0.1rem 0.3rem;
                    border-radius: 3px;
                }

                /* Tablas */
                .table-container {
                    overflow-x: auto;
                    border: 1px solid var(--border, rgba(172, 223, 206, 0.15));
                    border-radius: 16px;
                    background: var(--surface-solid, #20383d);
                    flex: 1;
                    min-height: 360px;
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 0.9rem;
                    text-align: left;
                }
                th {
                    background: var(--table-header-bg, rgba(0, 0, 0, 0.25));
                    color: var(--muted, #a2b9b8);
                    padding: 1.15rem 1.5rem;
                    font-weight: 700;
                    border-bottom: 1px solid var(--border, rgba(172, 223, 206, 0.15));
                }
                td {
                    padding: 1.15rem 1.5rem;
                    border-bottom: 1px solid rgba(172, 223, 206, 0.08);
                    color: var(--text, #e2f0eb);
                }
                tr:hover { background: rgba(255, 255, 255, 0.04); }
                .table-actions {
                    display: inline-flex;
                    gap: 0.65rem;
                    align-items: center;
                }
                .badge {
                    display: inline-block;
                    padding: 0.25rem 0.65rem;
                    border-radius: 9999px;
                    font-size: 0.75rem;
                    font-weight: 700;
                }
                .badge-active { background: var(--mint-soft, #284b43); color: var(--accent-text, #8bdbbc); border: 1px solid var(--border-strong, rgba(160, 208, 193, 0.25)); }
                .badge-inactive { background: rgba(0, 0, 0, 0.2); color: var(--muted, #a2b9b8); border: 1px solid var(--border, rgba(172, 223, 206, 0.12)); }

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
                    max-width: 660px;
                    width: 100%;
                    max-height: 85vh;
                    overflow-y: auto;
                    padding: 2.5rem;
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
                    padding-bottom: 1.5rem;
                    margin-bottom: 1.75rem;
                }

                .modal-title {
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: var(--accent, #78d4b0);
                    margin: 0;
                }

                .modal-subtitle {
                    font-size: 0.85rem;
                    color: var(--muted, #a2b9b8);
                    margin-top: 0.35rem;
                }

                .btn-close-modal {
                    background: var(--surface-muted, rgba(255, 255, 255, 0.06));
                    border: 1px solid var(--border, rgba(172, 223, 206, 0.15));
                    border-radius: 50%;
                    width: 36px;
                    height: 36px;
                    display: grid;
                    place-items: center;
                    color: var(--muted, #a2b9b8);
                    font-size: 1rem;
                    cursor: pointer;
                    transition: all 0.15s;
                }

                .btn-close-modal:hover {
                    background: rgba(239, 68, 68, 0.2);
                    border-color: rgba(239, 68, 68, 0.4);
                    color: #f87171;
                }

                .form-card {
                    background: var(--surface-muted, rgba(0, 0, 0, 0.2));
                    border: 1px solid var(--border-strong, rgba(172, 223, 206, 0.2));
                    border-radius: 14px;
                    padding: 1.75rem;
                    margin-bottom: 1.75rem;
                }
                .form-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
                    gap: 1.5rem;
                    margin-bottom: 1.5rem;
                }
                .form-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.65rem;
                }
                .form-label {
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: var(--text, #e2f0eb);
                }
                .input-field {
                    padding: 0.7rem 1rem;
                    min-height: 2.75rem;
                    border: 1px solid var(--border-strong, rgba(172, 223, 206, 0.25));
                    border-radius: 10px;
                    font-size: 0.9rem;
                    font-family: inherit;
                    box-sizing: border-box;
                    background: var(--input-bg, var(--surface-solid, #20383d));
                    color: var(--text, #e2f0eb);
                    outline: none;
                }
                .input-field:focus {
                    border-color: var(--accent, #78d4b0);
                    box-shadow: 0 0 0 2px rgba(120, 212, 176, 0.2);
                }
                .input-field option {
                    background: var(--surface-solid, #172a2e);
                    color: var(--text, #e2f0eb);
                }
            </style>

            <div class="section-header">
                <div class="title-box">
                    <h3>🧪 Exámenes</h3>
                    <p>Categorías diagnósticas y pruebas de laboratorio.</p>
                </div>

                ${this._subPestaña !== 'clasificacion' ? `
                    <button type="button" class="btn btn-primary" id="btnToggleForm">
                        ➕ Nuevo
                    </button>
                ` : ''}
            </div>

            <div class="nav-pills" role="tablist">
                <button type="button" class="pill-btn ${this._subPestaña === 'tipos' ? 'active' : ''}" data-tab="tipos">
                    Categorías (${this._tiposExamen.length})
                </button>
                <button type="button" class="pill-btn ${this._subPestaña === 'examenes' ? 'active' : ''}" data-tab="examenes">
                    Pruebas (${this._examenes.length})
                </button>
                <button type="button" class="pill-btn ${this._subPestaña === 'clasificacion' ? 'active' : ''}" data-tab="clasificacion">
                    Vinculaciones (${this._clasificaciones.length})
                </button>
            </div>

            <!-- FORMULARIO PARA TIPOS O EXAMENES (VENTANA EMERGENTE) -->
            ${this._mostrarFormulario ? `
                <div class="modal-backdrop" id="modalBackdropExamen">
                    <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modalExamenTitle">
                        <div class="modal-header">
                            <div>
                                <h4 id="modalExamenTitle" class="modal-title">
                                    ${this._itemEnEdicion ? '✏️ Editar Registro' : `➕ Nuevo ${this._subPestaña === 'tipos' ? 'Tipo' : 'Examen'}`}
                                </h4>
                                <div class="modal-subtitle">
                                    ${this._itemEnEdicion ? `ID: ${escapeHtml(this._itemEnEdicion.idTipoExamen || this._itemEnEdicion.idExamen || '')}` : 'Datos de la prueba o categoría diagnóstica.'}
                                </div>
                            </div>
                            <button type="button" class="btn-close-modal" id="btnCloseModalExamen" title="Cerrar ventana emergente" aria-label="Cerrar">✕</button>
                        </div>

                        <form id="formExamen">
                            <div class="form-grid">
                                <div class="form-group">
                                    <label class="form-label" for="nombreEx">Nombre: *</label>
                                    <input type="text" class="input-field" id="nombreEx" name="nombre" required placeholder="Ej: Hematología, Hemograma..." value="${escapeHtml(this._itemEnEdicion?.nombre || '')}"/>
                                </div>
                                <div class="form-group" style="flex-direction: row; align-items: center; gap: 0.5rem; margin-top: 1.5rem;">
                                    <input type="checkbox" id="activoEx" name="activo" ${this._itemEnEdicion ? (this._itemEnEdicion.activo ? 'checked' : '') : 'checked'}/>
                                    <label class="form-label" for="activoEx">Estado Activo</label>
                                </div>
                                <div class="form-group" style="grid-column: 1 / -1;">
                                    <label class="form-label" for="obsEx">Observaciones:</label>
                                    <input type="text" class="input-field" id="obsEx" name="observaciones" placeholder="Indicaciones clínicas o de preparación..." value="${escapeHtml(this._itemEnEdicion?.observaciones || '')}"/>
                                </div>
                            </div>
                            <div style="display: flex; justify-content: flex-end; gap: 0.85rem; margin-top: 1.5rem;">
                                <button type="button" class="btn btn-outline" id="btnCancelForm">✕ Cancelar</button>
                                <button type="submit" class="btn btn-primary" ${this._cargando ? 'disabled' : ''}>
                                    ${this._cargando ? '⏳ Guardando...' : '💾 Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ` : ''}

            <!-- 1. VISTA DE TIPOS DE EXAMEN -->
            ${this._subPestaña === 'tipos' ? `
                <div class="toolbar">
                    <div class="search-box">
                        <span class="search-icon">🔍</span>
                        <input type="text" class="search-input" id="inputBuscarTipos" placeholder="Buscar categoría o especialidad (insensible a tildes)..." value="${escapeHtml(this._filtroBusquedaTipos)}"/>
                        ${this._filtroBusquedaTipos ? `<button type="button" class="btn-clear-search" id="btnClearSearchTipos">✕</button>` : ''}
                    </div>
                    <span style="font-size: 0.85rem; color: var(--muted, #a2b9b8);">
                        ${this._filtroBusquedaTipos ? `Coincidencias: <strong>${tiposFiltrados.length}</strong> de ${this._tiposExamen.length}` : `Total: <strong>${tiposFiltrados.length}</strong> categorías`}
                    </span>
                </div>

                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Nombre de la Especialidad / Categoría</th>
                                <th>Estado</th>
                                <th>Observaciones</th>
                                <th style="text-align: right;">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tiposFiltrados.length === 0 ? `
                                <tr><td colspan="4" style="text-align: center; color: var(--muted, #a2b9b8); padding: 2rem;">No se encontraron categorías ${this._filtroBusquedaTipos ? 'que coincidan con la búsqueda.' : 'registradas.'}</td></tr>
                            ` : tiposFiltrados.map(te => `
                                <tr>
                                    <td><strong>${resaltarCoincidencias(te.nombre, this._filtroBusquedaTipos, 'resaltado-busqueda')}</strong></td>
                                    <td><span class="badge ${te.activo ? 'badge-active' : 'badge-inactive'}">${te.activo ? 'Activo' : 'Inactivo'}</span></td>
                                    <td style="color: var(--muted, #a2b9b8);">${resaltarCoincidencias(te.observaciones || '—', this._filtroBusquedaTipos, 'resaltado-busqueda')}</td>
                                    <td style="text-align: right; white-space: nowrap;">
                                        <div class="table-actions">
                                            <button type="button" class="btn btn-sm btn-outline btn-edit-tipo" data-id="${escapeHtml(te.idTipoExamen)}">✏️ Editar</button>
                                            <button type="button" class="btn btn-sm btn-danger btn-del-tipo" data-id="${escapeHtml(te.idTipoExamen)}">🗑️ Eliminar</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : ''}

            <!-- 2. VISTA DE EXAMENES INDIVIDUALES -->
            ${this._subPestaña === 'examenes' ? `
                <div class="toolbar">
                    <div class="search-box">
                        <span class="search-icon">🔍</span>
                        <input type="text" class="search-input" id="inputBuscarExamenes" placeholder="Buscar prueba diagnóstica (insensible a tildes)..." value="${escapeHtml(this._filtroBusquedaExamenes)}"/>
                        ${this._filtroBusquedaExamenes ? `<button type="button" class="btn-clear-search" id="btnClearSearchExamenes">✕</button>` : ''}
                    </div>
                    <span style="font-size: 0.85rem; color: var(--muted, #a2b9b8);">
                        ${this._filtroBusquedaExamenes ? `Coincidencias: <strong>${examenesFiltrados.length}</strong> de ${this._examenes.length}` : `Total: <strong>${examenesFiltrados.length}</strong> pruebas`}
                    </span>
                </div>

                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Nombre de la Prueba Diagnóstica</th>
                                <th>Estado</th>
                                <th>Observaciones</th>
                                <th style="text-align: right;">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${examenesFiltrados.length === 0 ? `
                                <tr><td colspan="4" style="text-align: center; color: var(--muted, #a2b9b8); padding: 2rem;">No se encontraron pruebas ${this._filtroBusquedaExamenes ? 'que coincidan con la búsqueda.' : 'registradas.'}</td></tr>
                            ` : examenesFiltrados.map(ex => `
                                <tr>
                                    <td><strong>${resaltarCoincidencias(ex.nombre, this._filtroBusquedaExamenes, 'resaltado-busqueda')}</strong></td>
                                    <td><span class="badge ${ex.activo ? 'badge-active' : 'badge-inactive'}">${ex.activo ? 'Activo' : 'Inactivo'}</span></td>
                                    <td style="color: var(--muted, #a2b9b8);">${resaltarCoincidencias(ex.observaciones || '—', this._filtroBusquedaExamenes, 'resaltado-busqueda')}</td>
                                    <td style="text-align: right; white-space: nowrap;">
                                        <div class="table-actions">
                                            <button type="button" class="btn btn-sm btn-outline btn-edit-examen" data-id="${escapeHtml(ex.idExamen)}">✏️ Editar</button>
                                            <button type="button" class="btn btn-sm btn-danger btn-del-examen" data-id="${escapeHtml(ex.idExamen)}">🗑️ Eliminar</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : ''}

            <!-- 3. ASOCIACION EXAMEN <-> TIPO EXAMEN -->
            ${this._subPestaña === 'clasificacion' ? `
                <div class="form-card">
                    <h4 style="color: var(--accent, #78d4b0); margin-bottom: 0.75rem;">🔗 Vincular Prueba a Categoría</h4>
                    <form id="formClasificacion">
                        <div class="form-grid">
                            <div class="form-group">
                                <label class="form-label" for="selExamen">Prueba Diagnóstica:</label>
                                <select class="input-field" id="selExamen" required>
                                    <option value="">-- Seleccionar Prueba --</option>
                                    ${this._examenes.map(ex => `
                                        <option value="${escapeHtml(ex.idExamen)}">${escapeHtml(ex.nombre)}</option>
                                    `).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label" for="selTipoEx">Categoría / Especialidad:</label>
                                <select class="input-field" id="selTipoEx" required>
                                    <option value="">-- Seleccionar Categoría --</option>
                                    ${this._tiposExamen.map(te => `
                                        <option value="${escapeHtml(te.idTipoExamen)}">${escapeHtml(te.nombre)}</option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>
                        <div style="display: flex; justify-content: flex-end;">
                            <button type="submit" class="btn btn-primary" ${this._cargando ? 'disabled' : ''}>
                                ${this._cargando ? '⏳ Vinculando...' : '🔗 Vincular'}
                            </button>
                        </div>
                    </form>
                </div>

                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Prueba Diagnóstica</th>
                                <th>Categoría / Especialidad</th>
                                <th>Observaciones</th>
                                <th style="text-align: right;">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this._clasificaciones.length === 0 ? `
                                <tr><td colspan="4" style="text-align: center; color: var(--muted, #a2b9b8); padding: 2rem;">No hay asociaciones registradas. Vincula una arriba.</td></tr>
                            ` : this._clasificaciones.map(cl => {
                                const ex = this._examenes.find(e => e.idExamen === cl.idExamen);
                                const te = this._tiposExamen.find(t => t.idTipoExamen === cl.idTipoExamen);

                                return `
                                    <tr>
                                        <td><strong>${escapeHtml(ex?.nombre || cl.idExamen)}</strong></td>
                                        <td><span class="badge badge-active">${escapeHtml(te?.nombre || cl.idTipoExamen)}</span></td>
                                        <td style="color: var(--muted, #a2b9b8);">${escapeHtml(cl.observaciones || '—')}</td>
                                        <td style="text-align: right;">
                                            <button type="button" class="btn btn-sm btn-danger btn-del-clasif" data-id="${escapeHtml(cl.idExamenTipoExamen)}">✕ Quitar</button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            ` : ''}
        `;

        // Cambio de sub-pestaña
        this.shadowRoot.querySelectorAll('.pill-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this._subPestaña = e.currentTarget.dataset.tab;
                this._mostrarFormulario = false;
                this._itemEnEdicion = null;
                this.render();
            });
        });

        const btnToggle = this.shadowRoot.getElementById('btnToggleForm');
        if (btnToggle) {
            btnToggle.addEventListener('click', () => {
                this._mostrarFormulario = !this._mostrarFormulario;
                if (!this._mostrarFormulario) this._itemEnEdicion = null;
                this.render();
            });
        }

        const btnCancel = this.shadowRoot.getElementById('btnCancelForm');
        if (btnCancel) {
            btnCancel.addEventListener('click', () => {
                this._mostrarFormulario = false;
                this._itemEnEdicion = null;
                this.render();
            });
        }

        const btnCloseModal = this.shadowRoot.getElementById('btnCloseModalExamen');
        if (btnCloseModal) {
            btnCloseModal.addEventListener('click', () => {
                this._mostrarFormulario = false;
                this._itemEnEdicion = null;
                this.render();
            });
        }

        const modalBackdrop = this.shadowRoot.getElementById('modalBackdropExamen');
        if (modalBackdrop) {
            modalBackdrop.addEventListener('click', (e) => {
                if (e.target === modalBackdrop) {
                    this._mostrarFormulario = false;
                    this._itemEnEdicion = null;
                    this.render();
                }
            });
        }

        // Buscador de tipos / categorías
        const inputBuscarTipos = this.shadowRoot.getElementById('inputBuscarTipos');
        if (inputBuscarTipos) {
            inputBuscarTipos.addEventListener('input', (e) => {
                this._filtroBusquedaTipos = e.target.value;
                this._debounceBuscar();
            });
        }
        const btnClearSearchTipos = this.shadowRoot.getElementById('btnClearSearchTipos');
        if (btnClearSearchTipos) {
            btnClearSearchTipos.addEventListener('click', () => {
                this._filtroBusquedaTipos = '';
                this.render();
            });
        }

        // Buscador de pruebas / exámenes
        const inputBuscarExamenes = this.shadowRoot.getElementById('inputBuscarExamenes');
        if (inputBuscarExamenes) {
            inputBuscarExamenes.addEventListener('input', (e) => {
                this._filtroBusquedaExamenes = e.target.value;
                this._debounceBuscar();
            });
        }
        const btnClearSearchExamenes = this.shadowRoot.getElementById('btnClearSearchExamenes');
        if (btnClearSearchExamenes) {
            btnClearSearchExamenes.addEventListener('click', () => {
                this._filtroBusquedaExamenes = '';
                this.render();
            });
        }

        // Submit form tipos o examenes
        const formEx = this.shadowRoot.getElementById('formExamen');
        if (formEx) {
            formEx.addEventListener('submit', (e) => {
                e.preventDefault();
                const nombre = this.shadowRoot.getElementById('nombreEx').value.trim();
                const activo = this.shadowRoot.getElementById('activoEx').checked;
                const observaciones = this.shadowRoot.getElementById('obsEx').value.trim() || null;

                const eventName = this._subPestaña === 'tipos' ? 'guardar-tipo-examen' : 'guardar-examen';
                const idField = this._subPestaña === 'tipos' ? 'idTipoExamen' : 'idExamen';
                const id = this._itemEnEdicion ? this._itemEnEdicion[idField] : null;

                this.dispatchEvent(new CustomEvent(eventName, {
                    detail: { id, datos: { nombre, activo, observaciones } },
                    bubbles: true,
                    composed: true,
                }));

                this._mostrarFormulario = false;
                this._itemEnEdicion = null;
            });
        }

        // Submit form clasificación
        const formClasif = this.shadowRoot.getElementById('formClasificacion');
        if (formClasif) {
            formClasif.addEventListener('submit', (e) => {
                e.preventDefault();
                const idExamen = this.shadowRoot.getElementById('selExamen').value;
                const idTipoExamen = this.shadowRoot.getElementById('selTipoEx').value;
                if (!idExamen || !idTipoExamen) return;

                this.dispatchEvent(new CustomEvent('asociar-examen-tipo', {
                    detail: { idExamen, idTipoExamen },
                    bubbles: true,
                    composed: true,
                }));
            });
        }

        // Editar/Eliminar Tipos
        this.shadowRoot.querySelectorAll('.btn-edit-tipo').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                this._itemEnEdicion = this._tiposExamen.find(t => t.idTipoExamen === id);
                this._mostrarFormulario = true;
                this.render();
            });
        });

        this.shadowRoot.querySelectorAll('.btn-del-tipo').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                if (!confirm('¿Deseas eliminar este tipo de examen?')) return;
                this.dispatchEvent(new CustomEvent('eliminar-tipo-examen', { detail: { id }, bubbles: true, composed: true }));
            });
        });

        // Editar/Eliminar Examenes
        this.shadowRoot.querySelectorAll('.btn-edit-examen').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                this._itemEnEdicion = this._examenes.find(x => x.idExamen === id);
                this._mostrarFormulario = true;
                this.render();
            });
        });

        this.shadowRoot.querySelectorAll('.btn-del-examen').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                if (!confirm('¿Deseas eliminar este examen?')) return;
                this.dispatchEvent(new CustomEvent('eliminar-examen', { detail: { id }, bubbles: true, composed: true }));
            });
        });

        // Desvincular
        this.shadowRoot.querySelectorAll('.btn-del-clasif').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                if (!confirm('¿Deseas desvincular este examen de su categoría?')) return;
                this.dispatchEvent(new CustomEvent('eliminar-asociacion', { detail: { id }, bubbles: true, composed: true }));
            });
        });
    }
}

customElements.define('panel-examenes', PanelExamenes);
export default PanelExamenes;
