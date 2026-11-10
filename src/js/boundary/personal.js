/**
 * Orquestador de la Vista de Personal de Clínica (Boundary)
 * Conecta los Web Components de administración y parametrización con los servicios de Control de GalenoSV.
 * Regla BCE: boundary -> control -> entities.
 */

// Importar Web Components
import './components/personal/personal-header.js';
import './components/personal/navegacion-personal.js';
import './components/personal/panel-contexto.js';
import './components/personal/panel-catalogo-simple.js';
import './components/personal/panel-examenes.js';
import './components/personal/panel-protocolos.js';

// Importar Servicios de Control
import {
    AtencionService,
    ClinicaService,
    RolService,
    TipoDocumentoService,
    TipoMedioContactoService,
    TipoExamenService,
    ExamenService,
    ExamenTipoExamenService,
    ProcedimientoService,
    ProcedimientoPasoService,
    ProcedimientoPasoExamenService,
    PersonaRolService,
    PersonaService,
} from '../control/index.js';
import DefaultError from '../entities/default_error.js';

// Instancias de servicios
const atencionService = new AtencionService();
const clinicaService = new ClinicaService();
const rolService = new RolService();
const tipoDocumentoService = new TipoDocumentoService();
const tipoMedioContactoService = new TipoMedioContactoService();
const tipoExamenService = new TipoExamenService();
const examenService = new ExamenService();
const examenTipoExamenService = new ExamenTipoExamenService();
const procedimientoService = new ProcedimientoService();
const procedimientoPasoService = new ProcedimientoPasoService();
const procedimientoPasoExamenService = new ProcedimientoPasoExamenService();
const personaRolService = new PersonaRolService();
const personaService = new PersonaService();

// Estado de la Vista
const estado = {
    seccionActiva: 'contexto',
    clinicaActiva: null,
    operadorActivo: null,
    contextoSesion: null,
    clinicas: [],
    roles: [],
    personas: [],
    rolesPersonal: [],
    documentos: [],
    contactos: [],
    tiposExamen: [],
    examenes: [],
    clasificacionesExamen: [],
    procedimientos: [],
    procedimientoSeleccionadoId: null,
    pasosProcedimiento: [],
    pasoSeleccionadoId: null,
    examenesConfiguradosPaso: [],
};

// Referencias del DOM
const elHeader = document.querySelector('personal-header');
const elNav = document.querySelector('navegacion-personal');
const elPanelContexto = document.querySelector('panel-contexto');
const elPanelCatalogo = document.querySelector('panel-catalogo-simple');
const elPanelExamenes = document.querySelector('panel-examenes');
const elPanelProtocolos = document.querySelector('panel-protocolos');
const elFeedback = document.getElementById('feedbackBanner');
const elFeedbackText = document.getElementById('feedbackText');
const btnCerrarFeedback = document.getElementById('btnCerrarFeedback');

if (btnCerrarFeedback) {
    btnCerrarFeedback.addEventListener('click', () => {
        if (elFeedback) elFeedback.className = 'feedback-banner';
    });
}

/**
 * Notificaciones en pantalla
 */
function mostrarFeedback(mensaje, tipo = 'info', duracionMs = 5000) {
    if (!elFeedback || !elFeedbackText) return;
    elFeedback.className = `feedback-banner visible ${tipo}`;
    elFeedbackText.textContent = mensaje;

    if (duracionMs > 0) {
        setTimeout(() => {
            if (elFeedbackText.textContent === mensaje) {
                elFeedback.className = 'feedback-banner';
            }
        }, duracionMs);
    }
}

/**
 * Manejo unificado de errores distinguiendo 401/403, 5xx/red y errores de cliente.
 */
function manejarError(error, accion = 'operación') {
    console.error(`Error en ${accion}:`, error);
    let msg = `Error al realizar ${accion}.`;
    if (error instanceof DefaultError) {
        if (error.status === 401) {
            msg = `Sesión no autorizada o expirada (401) al cargar ${accion}. Por favor inicie sesión en GalenoSV.`;
        } else if (error.status === 403) {
            msg = `Acceso denegado (403): Permisos insuficientes para ${accion}.`;
        } else if (error.status === 0 || error.code === 'conexion.error') {
            msg = `Fallo de conexión o red: No se pudo comunicar con el servidor para ${accion}.`;
        } else if (error.status >= 500) {
            msg = `Error interno del servidor (${error.status}) al procesar ${accion}.`;
        } else {
            msg = `${error.message || 'Error del servidor'} (Código: ${error.code || error.status})`;
        }
    } else if (error?.message) {
        msg = error.message;
    }
    mostrarFeedback(msg, 'error', 8000);
}

/**
 * Ejecuta una petición capturando y distinguiendo errores sin silenciarlos como listas vacías.
 */
async function consultarConManejo(promesa, descripcion, fallback = { data: [] }) {
    try {
        return await promesa;
    } catch (err) {
        manejarError(err, descripcion);
        return fallback;
    }
}

/**
 * Recarga la lista de asignaciones PersonaRol enriquecida con nombres
 */
async function recargarRolesPersonal() {
    const resPR = await consultarConManejo(personaRolService.listar(), 'asignaciones de personal');
    const asignaciones = resPR.data || [];

    estado.rolesPersonal = await Promise.all(asignaciones.map(async (pr) => {
        let nombrePersona = `Persona #${(pr.idPersona || '').slice(0, 8)}`;
        if (pr.idPersona) {
            try {
                const p = await personaService.buscarPorId(pr.idPersona);
                nombrePersona = `${p.data.nombres || ''} ${p.data.apellidos || ''}`.trim();
            } catch (err) {
                manejarError(err, `detalles de la persona ${(pr.idPersona || '').slice(0, 8)}`);
            }
        }
        const r = estado.roles.find(rol => rol.idRol === pr.idRol);
        return {
            ...pr,
            nombrePersona,
            nombreRol: r?.nombre || 'Rol Asignado',
        };
    }));
}

/**
 * Inicialización de la pantalla de administración
 */
async function inicializar() {
    try {
        if (elHeader) elHeader.cargando = true;
        mostrarFeedback('Cargando catálogos del hospital y sesión operativa...', 'info', 2000);

        // 1. Cargar Clínicas, Roles, Personas y todos los Catálogos maestros con notificación ante errores
        const [resClinicas, resRoles, resPersonas, resDocs, resContactos, resExamenes, resProcs] = await Promise.all([
            consultarConManejo(clinicaService.listar(), 'sedes clínicas'),
            consultarConManejo(rolService.listar(), 'roles institucionales'),
            consultarConManejo(personaService.listar(), 'directorio de personas'),
            consultarConManejo(tipoDocumentoService.listar(), 'tipos de documento'),
            consultarConManejo(tipoMedioContactoService.listar(), 'medios de contacto'),
            consultarConManejo(examenService.listar(), 'catálogo de exámenes'),
            consultarConManejo(procedimientoService.listar(), 'protocolos médicos'),
        ]);

        estado.clinicas = resClinicas.data || [];
        estado.roles = resRoles.data || [];
        estado.personas = resPersonas.data || [];
        estado.documentos = resDocs.data || [];
        estado.contactos = resContactos.data || [];
        estado.examenes = resExamenes.data || [];
        estado.procedimientos = resProcs.data || [];
        estado.clinicaActiva = estado.clinicas[0] || null;

        // Leer parámetro de URL si se desea abrir una sección específica
        const urlParams = new URLSearchParams(window.location.search);
        const seccionUrl = urlParams.get('seccion');
        if (seccionUrl && ['contexto', 'clinicas', 'roles', 'documentos', 'contactos', 'examenes', 'protocolos'].includes(seccionUrl)) {
            estado.seccionActiva = seccionUrl;
        }

        // 2. Cargar Asignaciones de personal (PersonaRol)
        await recargarRolesPersonal();

        // 3. Verificar contexto de sesión
        try {
            const resContexto = await atencionService.contexto();
            estado.contextoSesion = resContexto.data || null;

            if (estado.contextoSesion?.idPersonaRol) {
                const asignacionActiva = estado.rolesPersonal.find(pr => pr.idPersonaRol === estado.contextoSesion.idPersonaRol);
                if (asignacionActiva) {
                    estado.operadorActivo = {
                        idPersonaRol: asignacionActiva.idPersonaRol,
                        nombreCompleto: asignacionActiva.nombrePersona,
                        rolNombre: asignacionActiva.nombreRol,
                    };
                    if (asignacionActiva.idClinica) {
                        const clinicaEncontrada = estado.clinicas.find(c => c.idClinica === asignacionActiva.idClinica);
                        if (clinicaEncontrada) {
                            estado.clinicaActiva = clinicaEncontrada;
                        }
                    }
                }
            }
        } catch {
            // Sesión no inicializada
        }

        actualizarHeader();
        actualizarNavegacion();
        cambiarSeccion(estado.seccionActiva);

        mostrarFeedback('Módulo de personal y administración listo.', 'success', 3000);
    } catch (error) {
        manejarError(error, 'la inicialización del módulo de personal');
    } finally {
        if (elHeader) elHeader.cargando = false;
    }
}

function actualizarHeader() {
    if (elHeader) {
        elHeader.clinica = estado.clinicaActiva;
        elHeader.operador = estado.operadorActivo;
    }
}

function actualizarNavegacion() {
    if (elNav) {
        elNav.seccionActiva = estado.seccionActiva;
        elNav.contadores = {
            clinicas: estado.clinicas.length,
            roles: estado.roles.length,
            documentos: estado.documentos.length,
            contactos: estado.contactos.length,
            examenes: estado.examenes.length,
            procedimientos: estado.procedimientos.length,
        };
    }
}

/**
 * Cambia la sección activa del workspace
 */
async function cambiarSeccion(seccion) {
    estado.seccionActiva = seccion;
    actualizarNavegacion();

    // Cerrar cualquier ventana emergente/formulario abierto al cambiar de sección
    if (elPanelContexto?.cerrarFormulario) elPanelContexto.cerrarFormulario();
    if (elPanelCatalogo?.cerrarFormulario) elPanelCatalogo.cerrarFormulario();
    if (elPanelExamenes?.cerrarFormulario) elPanelExamenes.cerrarFormulario();
    if (elPanelProtocolos?.cerrarFormulario) elPanelProtocolos.cerrarFormulario();

    // Ocultar todos los paneles primero
    if (elPanelContexto) elPanelContexto.style.display = 'none';
    if (elPanelCatalogo) elPanelCatalogo.style.display = 'none';
    if (elPanelExamenes) elPanelExamenes.style.display = 'none';
    if (elPanelProtocolos) elPanelProtocolos.style.display = 'none';

    try {
        switch (seccion) {
            case 'contexto':
                if (elPanelContexto) {
                    elPanelContexto.style.display = 'block';
                    elPanelContexto.clinicas = estado.clinicas;
                    elPanelContexto.roles = estado.roles;
                    elPanelContexto.personas = estado.personas;
                    elPanelContexto.rolesDisponibles = estado.rolesPersonal;
                    elPanelContexto.idClinicaSeleccionada = estado.clinicaActiva?.idClinica;
                    elPanelContexto.contextoActual = estado.contextoSesion;
                }
                break;

            case 'clinicas':
                await recargarClinicas();
                mostrarCatalogoSimple('clinicas', estado.clinicas);
                break;

            case 'roles':
                await recargarRoles();
                mostrarCatalogoSimple('roles', estado.roles);
                break;

            case 'documentos':
                await recargarDocumentos();
                mostrarCatalogoSimple('documentos', estado.documentos);
                break;

            case 'contactos':
                await recargarContactos();
                mostrarCatalogoSimple('contactos', estado.contactos);
                break;

            case 'examenes':
                await recargarExamenes();
                if (elPanelExamenes) {
                    elPanelExamenes.style.display = 'block';
                    elPanelExamenes.tiposExamen = estado.tiposExamen;
                    elPanelExamenes.examenes = estado.examenes;
                    elPanelExamenes.clasificaciones = estado.clasificacionesExamen;
                }
                break;

            case 'protocolos':
                await recargarProtocolos();
                if (elPanelProtocolos) {
                    elPanelProtocolos.style.display = 'block';
                    elPanelProtocolos.procedimientos = estado.procedimientos;
                    elPanelProtocolos.roles = estado.roles;
                    elPanelProtocolos.examenes = estado.examenes;
                }
                break;
        }
    } catch (error) {
        manejarError(error, `la carga de ${seccion}`);
    }
}

function mostrarCatalogoSimple(tipo, items) {
    if (elPanelCatalogo) {
        if (elPanelCatalogo.cerrarFormulario) {
            elPanelCatalogo.cerrarFormulario();
        }
        elPanelCatalogo.style.display = 'block';
        elPanelCatalogo.tipoCatalogo = tipo;
        elPanelCatalogo.items = items;
    }
}

// =========================================================================
// RECARGAS DE DATOS POR SECCIÓN
// =========================================================================

async function recargarClinicas() {
    const res = await clinicaService.listar();
    estado.clinicas = res.data || [];
    actualizarHeader();
    actualizarNavegacion();
}

async function recargarRoles() {
    const res = await rolService.listar();
    estado.roles = res.data || [];
    actualizarNavegacion();
}

async function recargarDocumentos() {
    const res = await tipoDocumentoService.listar();
    estado.documentos = res.data || [];
    actualizarNavegacion();
}

async function recargarContactos() {
    const res = await tipoMedioContactoService.listar();
    estado.contactos = res.data || [];
    actualizarNavegacion();
}

async function recargarExamenes() {
    const [resTipos, resEx, resClasif] = await Promise.all([
        tipoExamenService.listar(),
        examenService.listar(),
        consultarConManejo(examenTipoExamenService.listar(), 'clasificaciones de examen'),
    ]);
    estado.tiposExamen = resTipos.data || [];
    estado.examenes = resEx.data || [];
    estado.clasificacionesExamen = resClasif.data || [];
    actualizarNavegacion();
}

async function recargarProtocolos() {
    const res = await procedimientoService.listar();
    estado.procedimientos = res.data || [];
    if (estado.examenes.length === 0) {
        const resEx = await consultarConManejo(examenService.listar(), 'catálogo de exámenes');
        estado.examenes = resEx.data || [];
    }
    actualizarNavegacion();
}

// =========================================================================
// ESCUCHADORES DE EVENTOS (Presentación -> Control)
// =========================================================================

// 1. Navegación
document.addEventListener('cambiar-seccion', (e) => {
    cambiarSeccion(e.detail.seccion);
});

// 2. Refrescar global
document.addEventListener('refrescar-datos', async () => {
    await inicializar();
    mostrarFeedback('Catálogos y contexto sincronizados con GalenoSV.', 'success', 2500);
});

// 3. Activar Rol en Sesión (cambiar-rol)
document.addEventListener('activar-rol', async (e) => {
    const { idPersonaRol } = e.detail;
    try {
        if (elPanelContexto) elPanelContexto.cargando = true;
        mostrarFeedback('Estableciendo rol activo en la sesión del servidor...', 'info', 2000);

        await atencionService.cambiarRol(idPersonaRol);

        const asignacion = estado.rolesPersonal.find(pr => pr.idPersonaRol === idPersonaRol);
        if (asignacion) {
            if (asignacion.idClinica) {
                const clinicaEncontrada = estado.clinicas.find(c => c.idClinica === asignacion.idClinica);
                if (clinicaEncontrada) {
                    estado.clinicaActiva = clinicaEncontrada;
                }
            }
            estado.operadorActivo = {
                idPersonaRol,
                nombreCompleto: asignacion.nombrePersona,
                rolNombre: asignacion.nombreRol,
            };
        }

        estado.contextoSesion = { idPersonaRol };
        actualizarHeader();
        if (elPanelContexto) {
            elPanelContexto.contextoActual = estado.contextoSesion;
            elPanelContexto.idClinicaSeleccionada = estado.clinicaActiva?.idClinica;
        }

        mostrarFeedback('Turno y rol activo establecidos satisfactoriamente en la sesión.', 'success', 3000);
    } catch (error) {
        manejarError(error, 'el cambio de turno y rol');
    } finally {
        if (elPanelContexto) elPanelContexto.cargando = false;
    }
});

// 3.1 Registrar Nueva Asignación de Personal (PersonaRol)
document.addEventListener('crear-asignacion', async (e) => {
    const { idPersona, idRol, idClinica } = e.detail;
    try {
        if (elPanelContexto) elPanelContexto.cargando = true;
        mostrarFeedback('Asignando personal a la clínica...', 'info', 1500);

        await personaRolService.crear({ idPersona, idRol, idClinica });
        mostrarFeedback('Asignación de personal registrada exitosamente.', 'success', 3000);

        await recargarRolesPersonal();
        if (elPanelContexto) {
            elPanelContexto.rolesDisponibles = estado.rolesPersonal;
        }
    } catch (error) {
        manejarError(error, 'la asignación de personal');
    } finally {
        if (elPanelContexto) elPanelContexto.cargando = false;
    }
});

// 3.2 Seleccionar Clínica desde el Panel Contextual
document.addEventListener('seleccionar-clinica', (e) => {
    const { idClinica } = e.detail;
    const clinicaEncontrada = estado.clinicas.find(c => c.idClinica === idClinica);
    if (clinicaEncontrada) {
        estado.clinicaActiva = clinicaEncontrada;
        actualizarHeader();
    }
});

// 4. Guardar Item en Catálogos Simples (Crear / Actualizar)
document.addEventListener('guardar-item', async (e) => {
    const { tipoCatalogo, id, datos } = e.detail;
    try {
        if (elPanelCatalogo) elPanelCatalogo.cargando = true;
        mostrarFeedback('Guardando en catálogo de GalenoSV...', 'info', 1500);

        let servicio;
        if (tipoCatalogo === 'clinicas') servicio = clinicaService;
        else if (tipoCatalogo === 'roles') servicio = rolService;
        else if (tipoCatalogo === 'documentos') servicio = tipoDocumentoService;
        else if (tipoCatalogo === 'contactos') servicio = tipoMedioContactoService;

        if (id) {
            await servicio.actualizar(id, datos);
            mostrarFeedback('Registro actualizado correctamente.', 'success', 3000);
        } else {
            await servicio.crear(datos);
            mostrarFeedback('Nuevo registro creado exitosamente.', 'success', 3000);
        }

        await cambiarSeccion(tipoCatalogo);
    } catch (error) {
        manejarError(error, 'el guardado del registro');
    } finally {
        if (elPanelCatalogo) elPanelCatalogo.cargando = false;
    }
});

// 5. Eliminar Item en Catálogos Simples
document.addEventListener('eliminar-item', async (e) => {
    const { tipoCatalogo, id } = e.detail;
    try {
        mostrarFeedback('Eliminando registro...', 'info', 1500);

        let servicio;
        if (tipoCatalogo === 'clinicas') servicio = clinicaService;
        else if (tipoCatalogo === 'roles') servicio = rolService;
        else if (tipoCatalogo === 'documentos') servicio = tipoDocumentoService;
        else if (tipoCatalogo === 'contactos') servicio = tipoMedioContactoService;

        await servicio.eliminar(id);
        mostrarFeedback('Registro eliminado satisfactoriamente.', 'success', 3000);
        await cambiarSeccion(tipoCatalogo);
    } catch (error) {
        manejarError(error, 'la eliminación del registro');
    }
});

// 6. Exámenes: Tipos y Pruebas
document.addEventListener('guardar-tipo-examen', async (e) => {
    const { id, datos } = e.detail;
    try {
        if (elPanelExamenes) elPanelExamenes.cargando = true;
        if (id) await tipoExamenService.actualizar(id, datos);
        else await tipoExamenService.crear(datos);
        mostrarFeedback('Tipo de examen guardado exitosamente.', 'success', 3000);
        await recargarExamenes();
        if (elPanelExamenes) elPanelExamenes.tiposExamen = estado.tiposExamen;
    } catch (error) {
        manejarError(error, 'el guardado de tipo de examen');
    } finally {
        if (elPanelExamenes) elPanelExamenes.cargando = false;
    }
});

document.addEventListener('eliminar-tipo-examen', async (e) => {
    try {
        await tipoExamenService.eliminar(e.detail.id);
        mostrarFeedback('Tipo de examen eliminado.', 'success', 3000);
        await recargarExamenes();
        if (elPanelExamenes) elPanelExamenes.tiposExamen = estado.tiposExamen;
    } catch (error) {
        manejarError(error, 'la eliminación de tipo de examen');
    }
});

document.addEventListener('guardar-examen', async (e) => {
    const { id, datos } = e.detail;
    try {
        if (elPanelExamenes) elPanelExamenes.cargando = true;
        if (id) await examenService.actualizar(id, datos);
        else await examenService.crear(datos);
        mostrarFeedback('Examen diagnóstico guardado.', 'success', 3000);
        await recargarExamenes();
        if (elPanelExamenes) elPanelExamenes.examenes = estado.examenes;
    } catch (error) {
        manejarError(error, 'el guardado de examen');
    } finally {
        if (elPanelExamenes) elPanelExamenes.cargando = false;
    }
});

document.addEventListener('eliminar-examen', async (e) => {
    try {
        await examenService.eliminar(e.detail.id);
        mostrarFeedback('Examen eliminado.', 'success', 3000);
        await recargarExamenes();
        if (elPanelExamenes) elPanelExamenes.examenes = estado.examenes;
    } catch (error) {
        manejarError(error, 'la eliminación de examen');
    }
});

document.addEventListener('asociar-examen-tipo', async (e) => {
    const { idExamen, idTipoExamen } = e.detail;
    try {
        if (elPanelExamenes) elPanelExamenes.cargando = true;
        const servicioClasif = tipoExamenService.clasificaciones(idTipoExamen);
        await servicioClasif.crear({ idExamen, idTipoExamen });
        mostrarFeedback('Prueba vinculada a la categoría exitosamente.', 'success', 3000);
        await recargarExamenes();
        if (elPanelExamenes) elPanelExamenes.clasificaciones = estado.clasificacionesExamen;
    } catch (error) {
        manejarError(error, 'la vinculación examen-tipo');
    } finally {
        if (elPanelExamenes) elPanelExamenes.cargando = false;
    }
});

document.addEventListener('eliminar-asociacion', async (e) => {
    try {
        await examenTipoExamenService.eliminar(e.detail.id);
        mostrarFeedback('Asociación desvinculada.', 'success', 3000);
        await recargarExamenes();
        if (elPanelExamenes) elPanelExamenes.clasificaciones = estado.clasificacionesExamen;
    } catch (error) {
        manejarError(error, 'la desvinculación');
    }
});

// 7. Protocolos y Diseñador de Workflows
document.addEventListener('guardar-procedimiento', async (e) => {
    const { id, datos } = e.detail;
    try {
        if (elPanelProtocolos) elPanelProtocolos.cargando = true;
        if (id) await procedimientoService.actualizar(id, datos);
        else await procedimientoService.crear(datos);
        mostrarFeedback('Procedimiento clínico guardado.', 'success', 3000);
        await recargarProtocolos();
        if (elPanelProtocolos) elPanelProtocolos.procedimientos = estado.procedimientos;
    } catch (error) {
        manejarError(error, 'el guardado de procedimiento');
    } finally {
        if (elPanelProtocolos) elPanelProtocolos.cargando = false;
    }
});

document.addEventListener('eliminar-procedimiento', async (e) => {
    try {
        await procedimientoService.eliminar(e.detail.id);
        mostrarFeedback('Procedimiento eliminado.', 'success', 3000);
        await recargarProtocolos();
        if (elPanelProtocolos) {
            elPanelProtocolos.procedimientos = estado.procedimientos;
            elPanelProtocolos.procedimientoSeleccionadoId = null;
            elPanelProtocolos.pasos = [];
        }
    } catch (error) {
        manejarError(error, 'la eliminación de procedimiento');
    }
});

document.addEventListener('seleccionar-procedimiento', async (e) => {
    const id = e.detail.id;
    estado.procedimientoSeleccionadoId = id;
    try {
        mostrarFeedback('Cargando pasos del procedimiento...', 'info', 1000);
        const servicioPasos = procedimientoService.pasos(id);
        const res = await servicioPasos.listar();
        if (estado.procedimientoSeleccionadoId !== id) return; // Guard de concurrencia
        estado.pasosProcedimiento = res.data || [];
        if (elPanelProtocolos) {
            elPanelProtocolos.procedimientoSeleccionadoId = id;
            elPanelProtocolos.pasos = estado.pasosProcedimiento;
            elPanelProtocolos.pasoSeleccionadoId = null;
            elPanelProtocolos.examenesConfigurados = [];
        }
    } catch (error) {
        if (estado.procedimientoSeleccionadoId === id) {
            manejarError(error, 'la carga de pasos del procedimiento');
        }
    }
});

document.addEventListener('crear-paso', async (e) => {
    const { idProcedimiento, datos } = e.detail;
    try {
        if (elPanelProtocolos) elPanelProtocolos.cargando = true;
        const servicioPasos = procedimientoService.pasos(idProcedimiento);
        await servicioPasos.crear(datos);
        mostrarFeedback('Paso agregado al procedimiento.', 'success', 3000);

        if (estado.procedimientoSeleccionadoId === idProcedimiento) {
            const res = await servicioPasos.listar();
            if (estado.procedimientoSeleccionadoId === idProcedimiento) {
                estado.pasosProcedimiento = res.data || [];
                if (elPanelProtocolos) elPanelProtocolos.pasos = estado.pasosProcedimiento;
            }
        }
    } catch (error) {
        if (estado.procedimientoSeleccionadoId === idProcedimiento) {
            manejarError(error, 'la creación del paso');
        }
    } finally {
        if (elPanelProtocolos) elPanelProtocolos.cargando = false;
    }
});

document.addEventListener('eliminar-paso', async (e) => {
    const id = e.detail.id;
    const procId = estado.procedimientoSeleccionadoId;
    try {
        await procedimientoPasoService.eliminar(id);
        mostrarFeedback('Paso eliminado.', 'success', 3000);

        if (procId && estado.procedimientoSeleccionadoId === procId) {
            const servicioPasos = procedimientoService.pasos(procId);
            const res = await servicioPasos.listar();
            if (estado.procedimientoSeleccionadoId === procId) {
                estado.pasosProcedimiento = res.data || [];
                if (elPanelProtocolos) elPanelProtocolos.pasos = estado.pasosProcedimiento;
            }
        }
    } catch (error) {
        if (procId && estado.procedimientoSeleccionadoId === procId) {
            manejarError(error, 'la eliminación del paso');
        }
    }
});

document.addEventListener('seleccionar-paso', async (e) => {
    const id = e.detail.id;
    estado.pasoSeleccionadoId = id;
    try {
        mostrarFeedback('Cargando exámenes autorizados del paso...', 'info', 1000);
        const servicioExamenes = procedimientoPasoService.examenesConfigurados(id);
        const res = await servicioExamenes.listar();
        if (estado.pasoSeleccionadoId !== id) return; // Guard de concurrencia
        estado.examenesConfiguradosPaso = res.data || [];

        if (elPanelProtocolos) {
            elPanelProtocolos.pasoSeleccionadoId = id;
            elPanelProtocolos.examenesConfigurados = estado.examenesConfiguradosPaso;
        }
    } catch (error) {
        if (estado.pasoSeleccionadoId === id) {
            manejarError(error, 'la carga de exámenes autorizados');
        }
    }
});

document.addEventListener('vincular-examen-paso-config', async (e) => {
    const { idProcedimientoPaso, datos } = e.detail;
    try {
        if (elPanelProtocolos) elPanelProtocolos.cargando = true;
        const servicioEx = procedimientoPasoService.examenesConfigurados(idProcedimientoPaso);
        await servicioEx.crear(datos);
        mostrarFeedback('Examen autorizado en este paso clínico.', 'success', 3000);

        if (estado.pasoSeleccionadoId === idProcedimientoPaso) {
            const res = await servicioEx.listar();
            if (estado.pasoSeleccionadoId === idProcedimientoPaso) {
                estado.examenesConfiguradosPaso = res.data || [];
                if (elPanelProtocolos) elPanelProtocolos.examenesConfigurados = estado.examenesConfiguradosPaso;
            }
        }
    } catch (error) {
        if (estado.pasoSeleccionadoId === idProcedimientoPaso) {
            manejarError(error, 'la autorización del examen');
        }
    } finally {
        if (elPanelProtocolos) elPanelProtocolos.cargando = false;
    }
});

document.addEventListener('eliminar-examen-paso-config', async (e) => {
    const id = e.detail.id;
    const pasoId = estado.pasoSeleccionadoId;
    try {
        await procedimientoPasoExamenService.eliminar(id);
        mostrarFeedback('Autorización de examen removida.', 'success', 3000);

        if (pasoId && estado.pasoSeleccionadoId === pasoId) {
            const servicioEx = procedimientoPasoService.examenesConfigurados(pasoId);
            const res = await servicioEx.listar();
            if (estado.pasoSeleccionadoId === pasoId) {
                estado.examenesConfiguradosPaso = res.data || [];
                if (elPanelProtocolos) elPanelProtocolos.examenesConfigurados = estado.examenesConfiguradosPaso;
            }
        }
    } catch (error) {
        if (pasoId && estado.pasoSeleccionadoId === pasoId) {
            manejarError(error, 'la eliminación de la autorización');
        }
    }
});

// Inicializar en DOMContentLoaded
window.addEventListener('DOMContentLoaded', inicializar);
