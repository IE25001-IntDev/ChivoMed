import { escapeHtml, formatearFecha } from '../../utils.js';

/**
 * Web Component: <workbench-medico>
 * Replicación fiel de la estación clínica 'consulta.xhtml' de GalenoSV.
 * Incluye:
 * - Encabezado Clínico con bloqueo/guardia de navegación segura.
 * - Pestaña 1: Procedimientos y Pasos (Notas diagnósticas, guardado parcial, cierre, catálogo de procedimientos y ejecución de pasos).
 * - Pestaña 2: Registro de Exámenes en Consulta (Vinculación de exámenes al paso mediante tipos de examen).
 * - Pestaña 3: Órdenes de Exámenes (Emisión de recetas y solicitudes de laboratorio con indicaciones).
 * - Pestaña 4: Resultados de Exámenes (Captura de valores e interpretación médica).
 */
class WorkbenchMedico extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._consulta = null;
        this._paciente = null;
        this._documentos = [];
        this._clinica = null;
        this._medico = null;
        this._procedimientos = [];
        this._catalogoProcedimientos = [];
        this._catalogoTiposExamen = [];
        this._pasoSeleccionadoId = null;
        this._ordenesPaso = [];
        this._pestañaActiva = 'tab-pasos'; // 'tab-pasos', 'tab-reg-examen', 'tab-ordenes', 'tab-resultados'
        this._isSesionActiva = false;
        this._cargando = false;
        this._accionEnCurso = null;
        this._notasDraft = '';
        this._refExternaDraft = '';
        this._mostrarFormResultadoId = null;
    }

    // Setters y Getters
    set consulta(val) {
        this._consulta = val;
        if (val) {
            this._notasDraft = val.observaciones || '';
            this._refExternaDraft = val.referenciaExterna || '';
        }
        this.render();
    }
    get consulta() { return this._consulta; }

    set paciente(val) { this._paciente = val; this.render(); }
    get paciente() { return this._paciente; }

    set documentos(val) { this._documentos = Array.isArray(val) ? val : []; this.render(); }
    set clinica(val) { this._clinica = val; this.render(); }
    set medico(val) { this._medico = val; this.render(); }
    set procedimientos(val) { this._procedimientos = Array.isArray(val) ? val : []; this.render(); }
    set catalogoProcedimientos(val) { this._catalogoProcedimientos = Array.isArray(val) ? val : []; this.render(); }
    set catalogoTiposExamen(val) { this._catalogoTiposExamen = Array.isArray(val) ? val : []; this.render(); }
    set pasoSeleccionadoId(val) { this._pasoSeleccionadoId = val; this.render(); }
    set ordenesPaso(val) { this._ordenesPaso = Array.isArray(val) ? val : []; this.render(); }
    set isSesionActiva(val) { this._isSesionActiva = Boolean(val); this.render(); }
    set cargando(val) { this._cargando = Boolean(val); this.render(); }
    set accionEnCurso(val) { this._accionEnCurso = val; this.render(); }

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

    getPasoActivo() {
        if (!this._pasoSeleccionadoId) return null;
        for (const proc of this._procedimientos) {
            const paso = (proc.pasos || []).find(p => p.idConsultaProcedimientoPaso === this._pasoSeleccionadoId);
            if (paso) return { paso, proc };
        }
        return null;
    }

    render() {
        if (!this._consulta) {
            this.shadowRoot.innerHTML = `
                <style>
                    :host {
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                        min-height: calc(100vh - 190px);
                        background: var(--card-glass, rgba(29, 51, 56, 0.64));
                        backdrop-filter: blur(28px) saturate(180%);
                        -webkit-backdrop-filter: blur(28px) saturate(180%);
                        border: 1px dashed var(--border-strong, rgba(160, 208, 193, 0.25));
                        border-radius: var(--card-radius, 20px);
                        padding: 6rem 3rem;
                        text-align: center;
                        color: var(--muted, #a2b9b8);
                        box-shadow: var(--card-shadow, var(--glass-shadow));
                        box-sizing: border-box;
                    }
                    .icon { font-size: 4rem; margin-bottom: 1rem; }
                    h3 { color: var(--text, #e2f0eb); margin-bottom: 0.65rem; font-size: 1.45rem; font-weight: 700; }
                    p { max-width: 560px; margin: 0 auto; line-height: 1.7; font-size: 0.95rem; }
                </style>
                <div class="icon">🩺</div>
                <h3>Estación de Trabajo Clínica (Workbench Médico)</h3>
                <p>Selecciona una consulta del listado lateral para abrir el expediente activo del paciente, gestionar procedimientos, prescribir exámenes y registrar diagnósticos.</p>
            `;
            return;
        }

        const c = this._consulta;
        const p = this._paciente;
        const nombrePaciente = p 
            ? `${p.nombres || ''} ${p.apellidos || ''}`.trim()
            : (c.pacienteNombre || 'Paciente');
        const edad = this.calcularEdad(p?.fechaNacimiento);
        const fechaInicio = formatearFecha(c.fechaInicio);
        const fechaFin = c.fechaFin ? formatearFecha(c.fechaFin) : null;
        const isCerrada = Boolean(c.fechaFin);
        const pasoActivoObj = this.getPasoActivo();

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: flex;
                    flex-direction: column;
                    gap: 2rem;
                    min-height: calc(100vh - 190px);
                    box-sizing: border-box;
                }
                .card {
                    background: var(--card-glass, rgba(29, 51, 56, 0.64));
                    backdrop-filter: blur(28px) saturate(180%);
                    -webkit-backdrop-filter: blur(28px) saturate(180%);
                    border: 1px solid var(--card-border, rgba(172, 223, 206, 0.12));
                    border-radius: var(--card-radius, 20px);
                    box-shadow: var(--card-shadow, var(--glass-shadow));
                    overflow: hidden;
                    color: var(--text, #e2f0eb);
                    transition: var(--transition-card, all 0.28s ease);
                }
                /* Encabezado Clínico de Consulta */
                .clinical-header {
                    padding: 1.75rem 2.25rem;
                    border-left: 6px solid var(--accent, #78d4b0);
                    background: var(--surface-muted, rgba(0, 0, 0, 0.15));
                }
                .header-top {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    flex-wrap: wrap;
                    gap: 1.25rem;
                    margin-bottom: 1rem;
                }
                .patient-name-box {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    flex-wrap: wrap;
                }
                .patient-title {
                    font-size: 1.45rem;
                    font-weight: 700;
                    color: var(--text, #e2f0eb);
                }
                .badge {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.45rem;
                    padding: 0.3rem 0.75rem;
                    border-radius: 9999px;
                    font-size: 0.75rem;
                    font-weight: 700;
                }
                .badge-open { background: var(--mint-soft, #284b43); color: var(--accent-text, #8bdbbc); }
                .badge-closed { background: var(--badge-inactive-bg, rgba(0,0,0,0.3)); color: var(--muted, #a2b9b8); }
                .badge-session-active { background: rgba(2, 132, 199, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); }
                .nav-lock-banner {
                    display: flex;
                    align-items: center;
                    gap: 0.65rem;
                    background: rgba(245, 158, 11, 0.15);
                    color: #fbbf24;
                    border: 1px solid rgba(245, 158, 11, 0.25);
                    padding: 0.65rem 1.15rem;
                    border-radius: 9999px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    margin-top: 0.65rem;
                }
                .header-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                    gap: 1.25rem;
                    margin-top: 1.25rem;
                    padding-top: 1.25rem;
                    border-top: 1px solid var(--border, rgba(172, 223, 206, 0.1));
                }
                .meta-col {
                    display: flex;
                    flex-direction: column;
                    gap: 0.25rem;
                }
                .meta-label {
                    font-size: 0.72rem;
                    text-transform: uppercase;
                    color: var(--muted, #a2b9b8);
                    font-weight: 700;
                    letter-spacing: 0.05em;
                }
                .meta-val {
                    font-size: 0.92rem;
                    font-weight: 600;
                    color: var(--text, #e2f0eb);
                }

                /* Sistema de Pestañas (Tabs) */
                .tabs-header {
                    display: flex;
                    background: var(--surface-muted, rgba(0, 0, 0, 0.15));
                    border-bottom: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                    overflow-x: auto;
                    padding: 0.65rem 1rem;
                    gap: 0.6rem;
                }
                .tab-btn {
                    padding: 0.65rem 1.25rem;
                    border-radius: 9999px;
                    font-size: 0.875rem;
                    font-weight: 600;
                    color: var(--muted, #a2b9b8);
                    background: transparent;
                    border: 1px solid transparent;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 0.65rem;
                    white-space: nowrap;
                    transition: all 0.22s var(--ease-spring, cubic-bezier(0.16, 1, 0.3, 1));
                }
                .tab-btn:hover {
                    color: var(--text, #e2f0eb);
                    background: var(--surface-muted, rgba(255, 255, 255, 0.05));
                }
                .tab-btn.active {
                    color: var(--accent-text, #8bdbbc);
                    background: var(--mint-soft, #284b43);
                    border-color: rgba(120, 212, 176, 0.35);
                    font-weight: 700;
                    box-shadow: 0 2px 8px var(--glow-mint);
                }
                .tab-pane {
                    display: none;
                    padding: 2.25rem 2.5rem;
                    flex: 1;
                    min-height: 480px;
                }
                .tab-pane.active {
                    display: block;
                }

                /* Formularios y Botones Comunes */
                .form-section {
                    background: var(--surface-solid, #20383d);
                    border: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                    border-radius: 18px;
                    padding: 1.75rem 2rem;
                    margin-bottom: 2rem;
                }
                .form-row {
                    display: flex;
                    gap: 1.25rem;
                    margin-bottom: 1.15rem;
                    flex-wrap: wrap;
                }
                .form-group {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 0.55rem;
                    min-width: 240px;
                }
                .form-label {
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: var(--text, #e2f0eb);
                }
                .input-text, .textarea-input, .select-input {
                    padding: 0.7rem 1rem;
                    min-height: 2.75rem;
                    border: 1px solid var(--border-strong, rgba(172, 223, 206, 0.2));
                    border-radius: 10px;
                    font-size: 0.9rem;
                    font-family: inherit;
                    box-sizing: border-box;
                    outline: none;
                    background: var(--surface-solid, rgba(16, 31, 37, 0.7));
                    color: var(--text, #e2f0eb);
                    transition: all 0.2s;
                }
                .input-text:focus, .textarea-input:focus, .select-input:focus {
                    border-color: var(--accent, #78d4b0);
                    box-shadow: 0 0 0 2px rgba(120, 212, 176, 0.15);
                }
                .textarea-input {
                    resize: vertical;
                    min-height: 85px;
                }
                .btn {
                    padding: 0.65rem 1.35rem;
                    border-radius: 9999px;
                    font-size: 0.875rem;
                    font-weight: 600;
                    cursor: pointer;
                    border: none;
                    display: inline-flex;
                    align-items: center;
                    gap: 0.65rem;
                    transition: all 0.22s var(--ease-spring, cubic-bezier(0.16, 1, 0.3, 1));
                }
                .btn-sm {
                    padding: 0.45rem 0.95rem;
                    font-size: 0.825rem;
                    gap: 0.55rem;
                }
                .btn:disabled { opacity: 0.6; cursor: not-allowed; }
                .btn:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 15px var(--glow-mint, rgba(45, 133, 111, 0.2));
                }
                .btn:active:not(:disabled) {
                    transform: scale(0.97);
                }
                .btn-primary { background: var(--accent, #78d4b0); color: var(--on-accent, #122e2a); font-weight: 700; }
                .btn-primary:hover:not(:disabled) { background: #8bdbbc; }
                .btn-success { background: #16a34a; color: white; }
                .btn-success:hover:not(:disabled) { background: #15803d; }
                .btn-danger { background: #dc2626; color: white; }
                .btn-danger:hover:not(:disabled) { background: #b91c1c; }
                .btn-outline { background: transparent; border: 1px solid var(--border-strong, rgba(172, 223, 206, 0.25)); color: var(--text, #e2f0eb); }
                .btn-outline:hover:not(:disabled) { background: var(--surface-muted, rgba(255, 255, 255, 0.06)); border-color: var(--accent, #78d4b0); }

                /* Tablas y Listas */
                .proc-card {
                    border: 1px solid var(--border, rgba(172, 223, 206, 0.12));
                    border-radius: 16px;
                    margin-bottom: 1.25rem;
                    overflow: hidden;
                    background: var(--surface-solid, #20383d);
                    transition: var(--transition-card, all 0.28s ease);
                }
                .proc-header {
                    background: var(--surface-muted, rgba(0, 0, 0, 0.15));
                    padding: 1rem 1.35rem;
                    border-bottom: 1px solid var(--border, rgba(172, 223, 206, 0.1));
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-weight: 700;
                    font-size: 0.95rem;
                    color: var(--text, #e2f0eb);
                }
                .step-item {
                    border-bottom: 1px solid var(--border, rgba(172, 223, 206, 0.08));
                    padding: 1.25rem 1.5rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                    background: transparent;
                    transition: all 0.2s ease;
                }
                .step-item:hover {
                    background: var(--surface-muted, rgba(255, 255, 255, 0.02));
                }
                .step-item.active-step {
                    background: var(--mint-soft, rgba(40, 75, 67, 0.4));
                    border-left: 4px solid var(--accent, #78d4b0);
                }
                .step-item.completed {
                    border-left: 4px solid var(--accent, #78d4b0);
                    background: var(--surface-muted, rgba(32, 56, 61, 0.4));
                }
                .step-top {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-weight: 600;
                    font-size: 0.92rem;
                    color: var(--text, #e2f0eb);
                }
                .step-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 0.75rem;
                    align-items: center;
                    margin-top: 0.65rem;
                    flex-wrap: wrap;
                }
                .step-meta {
                    font-size: 0.8rem;
                    color: var(--muted, #a2b9b8);
                    margin-right: auto;
                }
                .step-callout {
                    background: var(--mint-soft, #284b43);
                    border: 1px solid var(--border-strong, rgba(160, 208, 193, 0.25));
                    border-radius: 12px;
                    padding: 1rem 1.35rem;
                    margin-bottom: 1.25rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 0.9rem;
                    color: var(--accent-text, #8bdbbc);
                    font-weight: 600;
                    box-shadow: 0 2px 10px var(--glow-mint);
                }
            </style>

            <!-- 1. ENCABEZADO CLÍNICO DE LA CONSULTA -->
            <div class="card clinical-header">
                <div class="header-top">
                    <div>
                        <div class="patient-name-box">
                            <span class="patient-title">👤 ${escapeHtml(nombrePaciente)}</span>
                            <span class="badge ${isCerrada ? 'badge-closed' : 'badge-open'}">
                                ${isCerrada ? 'Finalizada' : 'En Consulta'}
                            </span>
                            ${this._isSesionActiva ? `
                                <span class="badge badge-session-active">⚡ En Sesión</span>
                            ` : ''}
                        </div>
                        <div style="font-size: 0.8rem; color: var(--muted, #a2b9b8); margin-top: 0.25rem;">
                            ID: <code>${escapeHtml(c.idConsulta)}</code> | Sede: <strong>${escapeHtml(this._clinica?.nombre || 'Clínica Principal')}</strong>
                        </div>
                    </div>

                    ${!isCerrada && !this._isSesionActiva ? `
                        <button type="button" class="btn btn-outline" id="btnRetomarSesion" title="Establecer como consulta activa en la sesión médica">
                            ⚡ Retomar
                        </button>
                    ` : ''}
                </div>

                ${!isCerrada ? `
                    <div class="nav-lock-banner">
                        <span>🔒</span>
                        <span>Consulta en curso: La navegación a otras áreas está protegida para asegurar la trazabilidad del acto médico.</span>
                    </div>
                ` : ''}

                <div class="header-grid">
                    <div class="meta-col">
                        <span class="meta-label">Edad</span>
                        <span class="meta-val">🎂 ${escapeHtml(edad)}</span>
                    </div>
                    <div class="meta-col">
                        <span class="meta-label">Documentos</span>
                        <span class="meta-val">
                            ${this._documentos.length > 0 
                                ? this._documentos.map(d => escapeHtml(d.valor)).join(', ') 
                                : 'Sin documento'}
                        </span>
                    </div>
                    <div class="meta-col">
                        <span class="meta-label">Inicio</span>
                        <span class="meta-val">📅 ${escapeHtml(fechaInicio)}</span>
                    </div>
                    <div class="meta-col">
                        <span class="meta-label">Cierre</span>
                        <span class="meta-val">🏁 ${escapeHtml(fechaFin || 'En progreso')}</span>
                    </div>
                </div>
            </div>

            <!-- 2. SISTEMA DE 4 PESTAÑAS (WORKBENCH DE CONSULTA.XHTML) -->
            <div class="card">
                <div class="tabs-header" role="tablist">
                    <button type="button" role="tab" class="tab-btn ${this._pestañaActiva === 'tab-pasos' ? 'active' : ''}" data-tab="tab-pasos">
                        📋 Procedimientos
                    </button>
                    <button type="button" role="tab" class="tab-btn ${this._pestañaActiva === 'tab-reg-examen' ? 'active' : ''}" data-tab="tab-reg-examen">
                        🔬 Registro
                    </button>
                    <button type="button" role="tab" class="tab-btn ${this._pestañaActiva === 'tab-ordenes' ? 'active' : ''}" data-tab="tab-ordenes">
                        🧪 Órdenes
                    </button>
                    <button type="button" role="tab" class="tab-btn ${this._pestañaActiva === 'tab-resultados' ? 'active' : ''}" data-tab="tab-resultados">
                        📊 Resultados
                    </button>
                </div>

                <!-- PESTAÑA 1: PROCEDIMIENTOS Y PASOS CLÍNICOS -->
                <div class="tab-pane ${this._pestañaActiva === 'tab-pasos' ? 'active' : ''}" id="tab-pasos">
                    <!-- Formulario de Diagnóstico / Notas y Cierre -->
                    <div class="form-section">
                        <div class="form-row">
                            <div class="form-group" style="flex: 2;">
                                <label class="form-label" for="txtNotas">Diagnóstico y Observaciones Clínicas:</label>
                                <textarea 
                                    class="textarea-input" 
                                    id="txtNotas" 
                                    placeholder="Notas del médico, diagnóstico clínico, evolución del paciente..."
                                    ${isCerrada ? 'disabled' : ''}
                                >${escapeHtml(this._notasDraft)}</textarea>
                            </div>
                            <div class="form-group" style="flex: 1;">
                                <label class="form-label" for="txtRefExterna">Referencia Externa / Expediente:</label>
                                <input 
                                    type="text" 
                                    class="input-text" 
                                    id="txtRefExterna" 
                                    placeholder="Ej: EXP-2026-004" 
                                    value="${escapeHtml(this._refExternaDraft)}"
                                    ${isCerrada ? 'disabled' : ''}
                                />
                            </div>
                        </div>

                        ${!isCerrada ? `
                            <div style="display: flex; justify-content: flex-end; gap: 0.85rem;">
                                <button type="button" class="btn btn-primary" id="btnGuardarNotas" ${this._accionEnCurso === 'guardar-notas' ? 'disabled' : ''}>
                                    ${this._accionEnCurso === 'guardar-notas' ? '⏳ Guardando...' : '💾 Guardar'}
                                </button>
                                <button type="button" class="btn btn-danger" id="btnCerrarConsulta" ${this._accionEnCurso === 'cerrar-consulta' ? 'disabled' : ''}>
                                    ${this._accionEnCurso === 'cerrar-consulta' ? '⏳ Finalizando...' : '🔒 Cerrar'}
                                </button>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Incorporación de Procedimiento del Catálogo -->
                    ${!isCerrada ? `
                        <div class="form-section" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
                            <div>
                                <strong style="font-size: 0.9rem; color: var(--text, #e2f0eb);">Incorporar Procedimiento:</strong>
                                <div style="font-size: 0.8rem; color: var(--muted, #a2b9b8);">Agrega protocolos clínicos desde el catálogo de la clínica.</div>
                            </div>
                            <div style="display: flex; gap: 0.75rem; align-items: center;">
                                <select class="select-input" id="selectProc">
                                    <option value="">-- Seleccionar Procedimiento --</option>
                                    ${this._catalogoProcedimientos.map(pr => `
                                        <option value="${escapeHtml(pr.idProcedimiento)}">${escapeHtml(pr.nombre)}</option>
                                    `).join('')}
                                </select>
                                <button type="button" class="btn btn-primary" id="btnAgregarProc" ${this._accionEnCurso === 'agregar-proc' ? 'disabled' : ''}>
                                    ${this._accionEnCurso === 'agregar-proc' ? '⏳...' : '➕ Agregar'}
                                </button>
                            </div>
                        </div>
                    ` : ''}

                    <!-- Lista de Procedimientos y Pasos -->
                    <div>
                        <h4 style="margin-bottom: 0.75rem; color: var(--text, #e2f0eb);">Ejecución de Pasos Clínicos</h4>
                        ${this._procedimientos.length === 0 ? `
                            <div style="padding: 2rem; text-align: center; color: var(--muted, #a2b9b8); border: 1px dashed var(--border, rgba(172, 223, 206, 0.2)); border-radius: 12px; background: var(--surface-muted, rgba(0, 0, 0, 0.1));">
                                No hay procedimientos registrados en esta consulta. Agrega uno arriba para comenzar.
                            </div>
                        ` : this._procedimientos.map(proc => `
                            <div class="proc-card">
                                <div class="proc-header">
                                    <span>🔬 ${escapeHtml(proc.nombre || 'Procedimiento')}</span>
                                    <span style="font-size: 0.8rem; color: var(--muted, #a2b9b8);">ID: ${escapeHtml((proc.idConsultaProcedimiento || '').slice(0, 8))}</span>
                                </div>
                                <div>
                                    ${(proc.pasos || []).length === 0 ? `
                                        <div style="padding: 1rem; color: var(--muted, #a2b9b8); font-size: 0.85rem;">No hay pasos en este procedimiento.</div>
                                    ` : proc.pasos.map((paso, idx) => {
                                        const isActivo = paso.idConsultaProcedimientoPaso === this._pasoSeleccionadoId;
                                        const isCompleted = paso.estado === 'COMPLETADO' || Boolean(paso.fechaFin);
                                        const isMine = paso.idPersonaRol && paso.idPersonaRol === this._medico?.idPersonaRol;
                                        const isWorking = this._accionEnCurso === paso.idConsultaProcedimientoPaso;

                                        return `
                                            <div class="step-item ${isActivo ? 'active-step' : ''} ${isCompleted ? 'completed' : ''}">
                                                <div class="step-top">
                                                    <span>Paso ${idx + 1}: ${escapeHtml(paso.nombrePaso || paso.idProcedimientoPaso || 'Paso Clínico')}</span>
                                                    <span class="badge ${isCompleted ? 'badge-open' : 'badge-closed'}">
                                                        ${escapeHtml(paso.estado || (isCompleted ? 'Completado' : 'Pendiente'))}
                                                    </span>
                                                </div>

                                                <div>
                                                    ${isCompleted ? `
                                                        <div style="font-size: 0.85rem; color: var(--text, #e2f0eb); background: var(--surface-muted, rgba(0, 0, 0, 0.2)); padding: 0.65rem 0.85rem; border-radius: 8px; border: 1px solid var(--border);">
                                                            <strong>Nota clínica:</strong> ${escapeHtml(paso.valor || 'Sin notas.')}
                                                        </div>
                                                    ` : `
                                                        <input 
                                                            type="text" 
                                                            class="input-text" 
                                                            id="inputVal-${escapeHtml(paso.idConsultaProcedimientoPaso)}" 
                                                            placeholder="Signos vitales, medidas, notas clínicas del paso..."
                                                            value="${escapeHtml(paso.valor || '')}"
                                                            style="width: 100%; margin-top: 0.25rem;"
                                                        />
                                                    `}
                                                </div>

                                                <div class="step-actions">
                                                    <span class="step-meta">
                                                        ${paso.idPersonaRol 
                                                            ? (isMine ? '✅ Asignado a ti' : `👤 Responsable: ${escapeHtml(paso.idPersonaRol.slice(0, 8))}...`) 
                                                            : '⚠️ Sin responsable'}
                                                    </span>

                                                    <button type="button" class="btn btn-sm btn-outline btn-select-step" data-id="${escapeHtml(paso.idConsultaProcedimientoPaso)}">
                                                        ${isActivo ? '✔️ Activo' : '👉 Seleccionar'}
                                                    </button>

                                                    ${!isCompleted && !isCerrada ? `
                                                        ${!isMine ? `
                                                            <button type="button" class="btn btn-sm btn-outline btn-asignar-paso" data-id="${escapeHtml(paso.idConsultaProcedimientoPaso)}" ${isWorking ? 'disabled' : ''}>
                                                                ✋ Asignar
                                                            </button>
                                                        ` : ''}
                                                        <button type="button" class="btn btn-sm btn-success btn-completar-paso" data-id="${escapeHtml(paso.idConsultaProcedimientoPaso)}" ${isWorking ? 'disabled' : ''}>
                                                            ${isWorking ? '⏳...' : '✔️ Completar'}
                                                        </button>
                                                    ` : ''}
                                                </div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- PESTAÑA 2: REGISTRO DE EXÁMENES EN CONSULTA (VINCULACIÓN A PASO) -->
                <div class="tab-pane ${this._pestañaActiva === 'tab-reg-examen' ? 'active' : ''}" id="tab-reg-examen">
                    ${pasoActivoObj ? `
                        <div class="step-callout">
                            <span>Paso seleccionado: <strong>${escapeHtml(pasoActivoObj.paso.nombrePaso || 'Paso')}</strong> (${escapeHtml(pasoActivoObj.proc.nombre)})</span>
                            <span style="font-size: 0.8rem;">ID: ${escapeHtml(pasoActivoObj.paso.idConsultaProcedimientoPaso.slice(0, 8))}...</span>
                        </div>

                        ${!isCerrada ? `
                            <div class="form-section">
                                <h4 style="margin-bottom: 0.75rem; color: var(--text, #e2f0eb);">Vincular Examen al Paso Clínico</h4>
                                <div class="form-row">
                                    <div class="form-group">
                                        <label class="form-label" for="selectTipoExamenReg">Tipo de Examen:</label>
                                        <select class="select-input" id="selectTipoExamenReg">
                                            <option value="">-- Seleccionar Tipo de Examen --</option>
                                            ${this._catalogoTiposExamen.map(te => `
                                                <option value="${escapeHtml(te.idTipoExamen)}">${escapeHtml(te.nombre)}</option>
                                            `).join('')}
                                        </select>
                                    </div>
                                    <div class="form-group">
                                        <label class="form-label" for="inputNombreExamenReg">Nombre del Examen:</label>
                                        <input type="text" class="input-text" id="inputNombreExamenReg" placeholder="Ej: Hemograma completo, Glucosa en ayunas..."/>
                                    </div>
                                </div>
                                <div class="form-group" style="margin-bottom: 0.85rem;">
                                    <label class="form-label" for="txtObsExamenReg">Observaciones / Indicaciones Clínicas:</label>
                                    <input type="text" class="input-text" id="txtObsExamenReg" placeholder="Notas adicionales sobre la prueba diagnóstica..."/>
                                </div>
                                <div style="display: flex; justify-content: flex-end; margin-top: 1.25rem;">
                                    <button type="button" class="btn btn-primary" id="btnVincularExamen" ${this._accionEnCurso === 'vincular-examen' ? 'disabled' : ''}>
                                        ${this._accionEnCurso === 'vincular-examen' ? '⏳ Registrando...' : '🔗 Registrar'}
                                    </button>
                                </div>
                            </div>
                        ` : ''}
                    ` : `
                        <div style="padding: 2.5rem; text-align: center; color: var(--muted, #a2b9b8);">
                            <div style="font-size: 2rem; margin-bottom: 0.5rem;">👈</div>
                            <strong>No hay un paso clínico seleccionado.</strong>
                            <p style="font-size: 0.85rem; margin-top: 0.25rem;">Regresa a la pestaña "Procedimientos" y pulsa "Seleccionar" en el paso correspondiente.</p>
                        </div>
                    `}
                </div>

                <!-- PESTAÑA 3: ÓRDENES DE EXÁMENES (LABORATORIO / GABINETE) -->
                <div class="tab-pane ${this._pestañaActiva === 'tab-ordenes' ? 'active' : ''}" id="tab-ordenes">
                    ${pasoActivoObj ? `
                        <div class="step-callout">
                            <span>Paso activo: <strong>${escapeHtml(pasoActivoObj.paso.nombrePaso || 'Paso')}</strong> (${escapeHtml(pasoActivoObj.proc.nombre)})</span>
                            <span style="font-size: 0.8rem;">ID: ${escapeHtml(pasoActivoObj.paso.idConsultaProcedimientoPaso.slice(0, 8))}...</span>
                        </div>

                        ${!isCerrada ? `
                            <div class="form-section">
                                <h4 style="margin-bottom: 0.75rem; color: var(--text, #e2f0eb);">Prescribir Orden de Examen</h4>
                                <div class="form-group" style="margin-bottom: 1rem;">
                                    <label class="form-label" for="inputIndicacionesOrden">Indicaciones Médicas para Laboratorio:</label>
                                    <input 
                                        type="text" 
                                        class="input-text" 
                                        id="inputIndicacionesOrden" 
                                        placeholder="Ej: Perfil lipídico y enzimas hepáticas con 12h de ayuno..."
                                    />
                                </div>
                                <div style="display: flex; justify-content: flex-end;">
                                    <button type="button" class="btn btn-primary" id="btnCrearOrden" ${this._accionEnCurso === 'crear-orden' ? 'disabled' : ''}>
                                        ${this._accionEnCurso === 'crear-orden' ? '⏳ Prescribiendo...' : '📋 Prescribir'}
                                    </button>
                                </div>
                            </div>
                        ` : ''}

                        <div>
                            <h4 style="margin-bottom: 0.75rem; color: var(--text, #e2f0eb);">Órdenes Emitidas para este Paso</h4>
                            ${this._ordenesPaso.length === 0 ? `
                                <div style="padding: 1.5rem; text-align: center; color: var(--muted, #a2b9b8); border: 1px dashed var(--border, rgba(172, 223, 206, 0.2)); border-radius: 12px; background: var(--surface-muted, rgba(0, 0, 0, 0.1));">
                                    No se han emitido órdenes de laboratorio para este paso.
                                </div>
                            ` : this._ordenesPaso.map(o => `
                                <div class="card" style="padding: 1.25rem 1.5rem; margin-bottom: 1rem; background: var(--surface-solid, #20383d); border: 1px solid var(--border);">
                                    <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.5rem;">
                                        <span>Orden #${escapeHtml((o.idOrdenExamen || '').slice(0, 8))}</span>
                                        <span style="color: var(--muted, #a2b9b8); font-weight: normal;">📅 ${escapeHtml(formatearFecha(o.fechaCreacion))}</span>
                                    </div>
                                    <div style="font-size: 0.9rem; color: var(--text, #e2f0eb);">
                                        <strong>Indicaciones:</strong> ${escapeHtml(o.indicaciones || 'Sin indicaciones')}
                                    </div>
                                    <div style="margin-top: 0.5rem; font-size: 0.8rem; color: var(--muted, #a2b9b8);">
                                        ${(o.resultados || []).length > 0 
                                            ? `✅ ${o.resultados.length} resultado(s) procesado(s). Ver en pestaña Resultados.`
                                            : '⏳ Pendiente de resultados de laboratorio.'}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div style="padding: 2.5rem; text-align: center; color: var(--muted, #a2b9b8);">
                            <div style="font-size: 2rem; margin-bottom: 0.5rem;">👈</div>
                            <strong>Selecciona un paso clínico para ver o emitir sus órdenes de laboratorio.</strong>
                        </div>
                    `}
                </div>

                <!-- PESTAÑA 4: RESULTADOS DE EXÁMENES -->
                <div class="tab-pane ${this._pestañaActiva === 'tab-resultados' ? 'active' : ''}" id="tab-resultados">
                    ${pasoActivoObj ? `
                        <div class="step-callout">
                            <span>Paso activo: <strong>${escapeHtml(pasoActivoObj.paso.nombrePaso || 'Paso')}</strong> (${escapeHtml(pasoActivoObj.proc.nombre)})</span>
                            <span style="font-size: 0.8rem;">ID: ${escapeHtml(pasoActivoObj.paso.idConsultaProcedimientoPaso.slice(0, 8))}...</span>
                        </div>

                        <div>
                            <h4 style="margin-bottom: 0.75rem; color: var(--text, #e2f0eb);">Captura y Consulta de Resultados</h4>
                            ${this._ordenesPaso.length === 0 ? `
                                <div style="padding: 1.5rem; text-align: center; color: var(--muted, #a2b9b8); border: 1px dashed var(--border, rgba(172, 223, 206, 0.2)); border-radius: 12px; background: var(--surface-muted, rgba(0, 0, 0, 0.1));">
                                    No hay órdenes de examen asociadas a este paso para capturar resultados.
                                </div>
                            ` : this._ordenesPaso.map(o => {
                                const resultados = o.resultados || [];
                                const isFormOpen = this._mostrarFormResultadoId === o.idOrdenExamen;

                                return `
                                    <div class="card" style="padding: 1.25rem 1.5rem; margin-bottom: 1.25rem; background: var(--surface-solid, #20383d); border: 1px solid var(--border);">
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.65rem;">
                                            <div>
                                                <strong>Orden #${escapeHtml((o.idOrdenExamen || '').slice(0, 8))}</strong>
                                                <div style="font-size: 0.85rem; color: var(--muted, #a2b9b8); margin-top: 0.15rem;">Indicación: ${escapeHtml(o.indicaciones || 'General')}</div>
                                            </div>
                                            ${!isCerrada ? `
                                                <button type="button" class="btn btn-sm btn-outline btn-toggle-res" data-id="${escapeHtml(o.idOrdenExamen)}">
                                                    ${isFormOpen ? '✕ Cancelar' : '➕ Resultado'}
                                                </button>
                                            ` : ''}
                                        </div>

                                        ${resultados.length > 0 ? `
                                            <div style="background: var(--mint-soft, rgba(40, 75, 67, 0.3)); border: 1px solid var(--border-strong); border-radius: 12px; padding: 1rem 1.25rem; margin-top: 0.75rem;">
                                                ${resultados.map(r => `
                                                    <div style="font-size: 0.9rem; color: var(--accent-text, #8bdbbc); margin-bottom: 0.35rem;">
                                                        <strong>Valor Reportado:</strong> ${escapeHtml(r.resultado || 'Sin valor')}
                                                    </div>
                                                    ${r.interpretacion ? `
                                                        <div style="font-size: 0.85rem; color: var(--text, #e2f0eb);">
                                                            <strong>Interpretación Médica:</strong> ${escapeHtml(r.interpretacion)}
                                                        </div>
                                                    ` : ''}
                                                `).join('')}
                                            </div>
                                        ` : `
                                            <div style="font-size: 0.8rem; color: var(--accent, #78d4b0); margin-top: 0.35rem;">
                                                ⏳ Sin resultados capturados para esta orden.
                                            </div>
                                        `}

                                        ${isFormOpen ? `
                                            <div style="background: var(--surface-muted, rgba(0, 0, 0, 0.2)); border: 1px dashed var(--border-strong); border-radius: 12px; padding: 1.25rem; margin-top: 1rem; display: flex; flex-direction: column; gap: 0.85rem;">
                                                <div class="form-group">
                                                    <label class="form-label" for="inputRes-${escapeHtml(o.idOrdenExamen)}">Resultado / Valor Medido:</label>
                                                    <input type="text" class="input-text" id="inputRes-${escapeHtml(o.idOrdenExamen)}" placeholder="Ej: Glucosa 95 mg/dL, Leucocitos 7,200 /mm³..."/>
                                                </div>
                                                <div class="form-group">
                                                    <label class="form-label" for="inputInterp-${escapeHtml(o.idOrdenExamen)}">Interpretación Médica:</label>
                                                    <input type="text" class="input-text" id="inputInterp-${escapeHtml(o.idOrdenExamen)}" placeholder="Ej: Parámetros dentro de rangos normales de referencia..."/>
                                                </div>
                                                <div style="display: flex; justify-content: flex-end; gap: 0.85rem; margin-top: 0.5rem;">
                                                    <button type="button" class="btn btn-success btn-guardar-res" data-id="${escapeHtml(o.idOrdenExamen)}" ${this._accionEnCurso === 'guardar-res' ? 'disabled' : ''}>
                                                        ${this._accionEnCurso === 'guardar-res' ? '⏳ Guardando...' : '💾 Guardar'}
                                                    </button>
                                                </div>
                                            </div>
                                        ` : ''}
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    ` : `
                        <div style="padding: 2.5rem; text-align: center; color: var(--muted, #a2b9b8);">
                            <div style="font-size: 2rem; margin-bottom: 0.5rem;">👈</div>
                            <strong>Selecciona un paso clínico para capturar o revisar resultados de laboratorio.</strong>
                        </div>
                    `}
                </div>
            </div>
        `;

        // 3. REGISTRO DE EVENTOS DOM
        // Cambio de pestaña
        this.shadowRoot.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget.dataset.tab;
                this._pestañaActiva = target;
                this.render();
            });
        });

        // Retomar en sesión
        const btnRetomar = this.shadowRoot.getElementById('btnRetomarSesion');
        if (btnRetomar) {
            btnRetomar.addEventListener('click', () => {
                this.dispatchEvent(new CustomEvent('retomar-consulta', {
                    detail: { idConsulta: c.idConsulta },
                    bubbles: true,
                    composed: true,
                }));
            });
        }

        // Guardar notas parciales
        const txtNotas = this.shadowRoot.getElementById('txtNotas');
        const txtRef = this.shadowRoot.getElementById('txtRefExterna');
        if (txtNotas) {
            txtNotas.addEventListener('input', (e) => { this._notasDraft = e.target.value; });
        }
        if (txtRef) {
            txtRef.addEventListener('input', (e) => { this._refExternaDraft = e.target.value; });
        }

        const btnGuardarNotas = this.shadowRoot.getElementById('btnGuardarNotas');
        if (btnGuardarNotas) {
            btnGuardarNotas.addEventListener('click', () => {
                this.dispatchEvent(new CustomEvent('guardar-notas', {
                    detail: {
                        idConsulta: c.idConsulta,
                        observaciones: this._notasDraft,
                        referenciaExterna: this._refExternaDraft,
                    },
                    bubbles: true,
                    composed: true,
                }));
            });
        }

        // Cerrar consulta
        const btnCerrar = this.shadowRoot.getElementById('btnCerrarConsulta');
        if (btnCerrar) {
            btnCerrar.addEventListener('click', () => {
                if (!confirm('¿Deseas finalizar y cerrar esta consulta médica?')) return;
                this.dispatchEvent(new CustomEvent('cerrar-consulta', {
                    detail: {
                        idConsulta: c.idConsulta,
                        observaciones: this._notasDraft,
                    },
                    bubbles: true,
                    composed: true,
                }));
            });
        }

        // Agregar procedimiento
        const btnAddProc = this.shadowRoot.getElementById('btnAgregarProc');
        const selectProc = this.shadowRoot.getElementById('selectProc');
        if (btnAddProc && selectProc) {
            btnAddProc.addEventListener('click', () => {
                const idProcedimiento = selectProc.value;
                if (!idProcedimiento) return;
                this.dispatchEvent(new CustomEvent('agregar-procedimiento', {
                    detail: { idProcedimiento },
                    bubbles: true,
                    composed: true,
                }));
            });
        }

        // Asignar responsable a paso
        this.shadowRoot.querySelectorAll('.btn-asignar-paso').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idPaso = e.currentTarget.dataset.id;
                this.dispatchEvent(new CustomEvent('asignar-responsable', {
                    detail: { idPaso },
                    bubbles: true,
                    composed: true,
                }));
            });
        });

        // Completar paso
        this.shadowRoot.querySelectorAll('.btn-completar-paso').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idPaso = e.currentTarget.dataset.id;
                const inputVal = this.shadowRoot.getElementById(`inputVal-${idPaso}`);
                const valor = inputVal ? inputVal.value.trim() : '';
                this.dispatchEvent(new CustomEvent('completar-paso', {
                    detail: { idPaso, valor },
                    bubbles: true,
                    composed: true,
                }));
            });
        });

        // Seleccionar paso para exámenes
        this.shadowRoot.querySelectorAll('.btn-select-step').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idPaso = e.currentTarget.dataset.id;
                this._pasoSeleccionadoId = idPaso;
                this.render();
                this.dispatchEvent(new CustomEvent('seleccionar-paso', {
                    detail: { idPaso },
                    bubbles: true,
                    composed: true,
                }));
            });
        });

        // Vincular examen en Pestaña 2
        const btnVincular = this.shadowRoot.getElementById('btnVincularExamen');
        const selectTipoEx = this.shadowRoot.getElementById('selectTipoExamenReg');
        const inputNombreEx = this.shadowRoot.getElementById('inputNombreExamenReg');
        const txtObsEx = this.shadowRoot.getElementById('txtObsExamenReg');
        if (btnVincular && selectTipoEx && inputNombreEx) {
            btnVincular.addEventListener('click', () => {
                const idTipoExamen = selectTipoEx.value;
                const nombre = inputNombreEx.value.trim();
                const observaciones = txtObsEx ? txtObsEx.value.trim() : '';
                if (!this._pasoSeleccionadoId || !idTipoExamen || !nombre) {
                    alert('Debes seleccionar el tipo de examen y colocar un nombre.');
                    return;
                }
                this.dispatchEvent(new CustomEvent('registrar-examen-paso', {
                    detail: {
                        idPaso: this._pasoSeleccionadoId,
                        idTipoExamen,
                        nombre,
                        observaciones,
                    },
                    bubbles: true,
                    composed: true,
                }));
            });
        }

        // Crear orden en Pestaña 3
        const btnCrearOrden = this.shadowRoot.getElementById('btnCrearOrden');
        const inputIndOrden = this.shadowRoot.getElementById('inputIndicacionesOrden');
        if (btnCrearOrden && inputIndOrden) {
            btnCrearOrden.addEventListener('click', () => {
                const indicaciones = inputIndOrden.value.trim();
                if (!indicaciones || !this._pasoSeleccionadoId) return;
                this.dispatchEvent(new CustomEvent('crear-orden-examen', {
                    detail: {
                        idPaso: this._pasoSeleccionadoId,
                        indicaciones,
                    },
                    bubbles: true,
                    composed: true,
                }));
                inputIndOrden.value = '';
            });
        }

        // Toggle formulario resultado en Pestaña 4
        this.shadowRoot.querySelectorAll('.btn-toggle-res').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                this._mostrarFormResultadoId = this._mostrarFormResultadoId === id ? null : id;
                this.render();
            });
        });

        // Guardar resultado en Pestaña 4
        this.shadowRoot.querySelectorAll('.btn-guardar-res').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idOrdenExamen = e.currentTarget.dataset.id;
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
                this._mostrarFormResultadoId = null;
            });
        });
    }
}

customElements.define('workbench-medico', WorkbenchMedico);
export default WorkbenchMedico;

