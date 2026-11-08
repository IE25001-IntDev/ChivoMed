/**
 * Orquestador de la Vista Médica (Boundary)
 * Conecta los Web Components presentacionales (<workbench-medico>, <cola-pacientes>, <medico-header>)
 * con los servicios de Control de GalenoSV.
 * Regla BCE: boundary -> control -> entities.
 */

// Importar Web Components
import './components/medico/medico-header.js';
import './components/medico/cola-pacientes.js';
import './components/medico/workbench-medico.js';

// Importar Servicios de Control
import {
    AtencionService,
    PersonaRolService,
    ConsultaService,
    ConsultaProcedimientoService,
    ConsultaProcedimientoPasoService,
    OrdenExamenService,
    ClinicaService,
    PersonaService,
    ProcedimientoService,
    TipoExamenService,
} from '../control/index.js';
import DefaultError from '../entities/default_error.js';

// Instancias de servicios
const atencionService = new AtencionService();
const personaRolService = new PersonaRolService();
const consultaService = new ConsultaService();
const clinicaService = new ClinicaService();
const personaService = new PersonaService();
const procedimientoService = new ProcedimientoService();
const tipoExamenService = new TipoExamenService();

// Constante de Rol en GalenoSV (verificado en la base de datos)
const ROL_DOCTOR_ID = '97e502bb-6127-4cf2-aae4-1e5491912864';

// Estado global de la Vista
const estado = {
    medicoActivo: null,
    clinicaActiva: null,
    doctoresDisponibles: [],
    consultas: [],
    consultaSeleccionada: null,
    consultaCargandoseId: null,
    pasoCargandoseId: null,
    pasoSeleccionadoId: null,
    procedimientosConsulta: [],
    ordenesPaso: [],
    catalogoProcedimientos: [],
    catalogoTiposExamen: [],
    idConsultaActivaSesion: null,
};

// Referencias a elementos del DOM
const elHeader = document.querySelector('medico-header');
const elCola = document.querySelector('cola-pacientes');
const elWorkbench = document.querySelector('workbench-medico');
const elFeedback = document.getElementById('feedbackBanner');
const elFeedbackText = document.getElementById('feedbackText');
const btnCerrarFeedback = document.getElementById('btnCerrarFeedback');

if (btnCerrarFeedback) {
    btnCerrarFeedback.addEventListener('click', () => {
        if (elFeedback) elFeedback.className = 'feedback-banner';
    });
}

/**
 * Muestra un mensaje de notificación/alerta en la interfaz.
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
 * Manejo centralizado de errores de la API.
 */
function manejarError(error, accion = 'operación') {
    console.error(`Error en ${accion}:`, error);
    let msg = `Error al realizar ${accion}.`;
    if (error instanceof DefaultError) {
        msg = `${error.message || 'Error del servidor'} (Código: ${error.code || error.status})`;
    } else if (error?.message) {
        msg = error.message;
    }
    mostrarFeedback(msg, 'error', 7000);
}

/**
 * Inicialización: carga sesión, médico activo, catálogos y lista de consultas.
 */
async function inicializar() {
    try {
        if (elHeader) elHeader.cargando = true;
        mostrarFeedback('Iniciando estación médica y conectando con GalenoSV...', 'info', 2000);

        // 1. Cargar clínicas
        const resClinicas = await clinicaService.listar();
        const clinicas = resClinicas.data || [];
        estado.clinicaActiva = clinicas[0] || null;

        // 2. Cargar catálogos de procedimientos y tipos de examen
        const [resProcedimientos, resTiposExamen] = await Promise.all([
            procedimientoService.listar().catch(() => ({ data: [] })),
            tipoExamenService.listar().catch(() => ({ data: [] })),
        ]);

        estado.catalogoProcedimientos = resProcedimientos.data || [];
        estado.catalogoTiposExamen = resTiposExamen.data || [];

        if (elWorkbench) {
            elWorkbench.catalogoProcedimientos = estado.catalogoProcedimientos;
            elWorkbench.catalogoTiposExamen = estado.catalogoTiposExamen;
            elWorkbench.clinica = estado.clinicaActiva;
        }

        // 3. Cargar doctores de la clínica activa
        const filtroDoctores = { idRol: ROL_DOCTOR_ID };
        if (estado.clinicaActiva?.idClinica) {
            filtroDoctores.idClinica = estado.clinicaActiva.idClinica;
        }

        const resDoctores = await personaRolService.listar(filtroDoctores).catch(() => ({ data: [] }));
        const rolesDoctores = resDoctores.data || [];

        const doctoresConNombres = await Promise.all(rolesDoctores.map(async (docRol) => {
            let nombreCompleto = `Doctor #${(docRol.idPersonaRol || '').slice(0, 8)}`;
            if (docRol.idPersona) {
                try {
                    const resP = await personaService.buscarPorId(docRol.idPersona);
                    const p = resP.data;
                    nombreCompleto = `Dr. ${p.nombres || ''} ${p.apellidos || ''}`.trim();
                } catch {
                    // Mantener fallback
                }
            }
            return {
                idPersonaRol: docRol.idPersonaRol,
                idPersona: docRol.idPersona,
                nombreCompleto,
            };
        }));

        estado.doctoresDisponibles = doctoresConNombres;

        // 4. Verificar contexto de sesión HTTP
        try {
            const contextoSesion = await atencionService.contexto();
            if (contextoSesion?.data?.idPersonaRol) {
                const docEncontrado = doctoresConNombres.find(d => d.idPersonaRol === contextoSesion.data.idPersonaRol);
                estado.medicoActivo = docEncontrado || {
                    idPersonaRol: contextoSesion.data.idPersonaRol,
                    nombreCompleto: `Doctor Activo (${(contextoSesion.data.idPersonaRol || '').slice(0, 8)})`,
                };
            }
            if (contextoSesion?.data?.idConsulta) {
                estado.idConsultaActivaSesion = contextoSesion.data.idConsulta;
            }
        } catch {
            // Sesión HTTP no iniciada aún
        }

        if (!estado.medicoActivo && doctoresConNombres.length > 0) {
            const primerDoctor = doctoresConNombres[0];
            try {
                await atencionService.cambiarRol(primerDoctor.idPersonaRol);
                estado.medicoActivo = primerDoctor;
            } catch (err) {
                console.warn('No se pudo establecer rol en sesión HTTP:', err);
            }
        }

        // Actualizar cabecera
        if (elHeader) {
            elHeader.medico = estado.medicoActivo ? {
                idPersonaRol: estado.medicoActivo.idPersonaRol,
                nombres: estado.medicoActivo.nombreCompleto || 'Doctor',
                apellidos: '',
            } : null;
            elHeader.clinica = estado.clinicaActiva;
            elHeader.rolesDisponibles = doctoresConNombres;
        }

        if (elWorkbench) {
            elWorkbench.medico = estado.medicoActivo;
        }

        // 5. Cargar consultas de la clínica
        await cargarConsultas();

        // Si la sesión ya tenía una consulta activa, abrirla directamente
        if (estado.idConsultaActivaSesion) {
            await seleccionarConsulta(estado.idConsultaActivaSesion);
        }

        mostrarFeedback('Estación médica lista y sincronizada con GalenoSV.', 'success', 3000);
    } catch (error) {
        manejarError(error, 'la inicialización de la estación');
    } finally {
        if (elHeader) elHeader.cargando = false;
    }
}

/**
 * Carga la lista de consultas desde el backend y actualiza <cola-pacientes>.
 */
async function cargarConsultas() {
    if (elCola) elCola.cargando = true;
    try {
        const filtros = {};
        if (estado.clinicaActiva?.idClinica) {
            filtros.idClinica = estado.clinicaActiva.idClinica;
        }

        const respuesta = await consultaService.listar(filtros);
        const lista = respuesta.data || [];

        // Enriquecer con nombres de pacientes si están disponibles
        for (const c of lista) {
            if (c.idPersonaRol && !c.pacienteNombre) {
                try {
                    const pr = await personaRolService.buscarPorId(c.idPersonaRol);
                    if (pr.data?.idPersona) {
                        const p = await personaService.buscarPorId(pr.data.idPersona);
                        c.pacienteNombre = `${p.data.nombres || ''} ${p.data.apellidos || ''}`.trim();
                    }
                } catch {
                    const idCorto = (c.idPersonaRol || '').slice(0, 8);
                    c.pacienteNombre = idCorto ? `Paciente (${idCorto})` : 'Paciente';
                }
            }
        }

        estado.consultas = lista;
        if (elCola) {
            elCola.consultas = lista;
        }
    } catch (error) {
        manejarError(error, 'la carga de pacientes');
    } finally {
        if (elCola) elCola.cargando = false;
    }
}

/**
 * Selecciona una consulta para abrirla en el Workbench Clínico.
 */
async function seleccionarConsulta(idConsulta) {
    if (!idConsulta) return;
    try {
        estado.consultaCargandoseId = idConsulta;
        mostrarFeedback('Cargando expediente clínico en el Workbench...', 'info', 1500);

        const resConsulta = await consultaService.buscarPorId(idConsulta);
        if (estado.consultaCargandoseId !== idConsulta) return;

        const consulta = resConsulta.data;
        estado.consultaSeleccionada = consulta;

        // Cargar datos del paciente
        let datosPaciente = null;
        let documentosPaciente = [];
        if (consulta.idPersonaRol) {
            try {
                const pr = await personaRolService.buscarPorId(consulta.idPersonaRol);
                if (pr.data?.idPersona) {
                    const [resPersona, resDocs] = await Promise.all([
                        personaService.buscarPorId(pr.data.idPersona).catch(() => null),
                        personaService.documentos(pr.data.idPersona).listar().catch(() => ({ data: [] })),
                    ]);
                    datosPaciente = resPersona?.data;
                    documentosPaciente = resDocs.data || [];
                }
            } catch (err) {
                console.warn('No se pudieron obtener detalles completos del paciente:', err);
            }
        }

        if (estado.consultaCargandoseId !== idConsulta) return;

        // Cargar procedimientos de la consulta
        await cargarProcedimientosConsulta(idConsulta);
        if (estado.consultaCargandoseId !== idConsulta) return;

        // Determinar si es la consulta activa en la sesión del servidor
        const isActivaSesion = (idConsulta === estado.idConsultaActivaSesion);

        // Actualizar Workbench
        if (elWorkbench) {
            elWorkbench.consulta = consulta;
            elWorkbench.paciente = datosPaciente;
            elWorkbench.documentos = documentosPaciente;
            elWorkbench.clinica = estado.clinicaActiva;
            elWorkbench.medico = estado.medicoActivo;
            elWorkbench.isSesionActiva = isActivaSesion;
            elWorkbench.procedimientos = estado.procedimientosConsulta;
            elWorkbench.catalogoProcedimientos = estado.catalogoProcedimientos;
            elWorkbench.catalogoTiposExamen = estado.catalogoTiposExamen;
            elWorkbench.pasoSeleccionadoId = null;
            elWorkbench.ordenesPaso = [];
            elWorkbench.accionEnCurso = null;
        }

        if (elCola) {
            elCola.consultaSeleccionadaId = idConsulta;
        }
    } catch (error) {
        manejarError(error, 'la apertura de la consulta en el workbench');
    }
}

/**
 * Carga los procedimientos y pasos de la consulta.
 */
async function cargarProcedimientosConsulta(idConsulta) {
    try {
        const resProcs = await consultaService.procedimientos(idConsulta).listar();
        const procedimientos = resProcs.data || [];

        const procsConPasos = await Promise.all(procedimientos.map(async (proc) => {
            const servicioPasos = new ConsultaProcedimientoService().pasos(proc.idConsultaProcedimiento);
            const resPasos = await servicioPasos.listar().catch(() => ({ data: [] }));

            const cat = estado.catalogoProcedimientos.find(p => p.idProcedimiento === proc.idProcedimiento);

            return {
                ...proc,
                nombre: cat?.nombre || proc.observaciones || 'Procedimiento Médico',
                pasos: resPasos.data || [],
            };
        }));

        if (estado.consultaSeleccionada?.idConsulta !== idConsulta) return;

        estado.procedimientosConsulta = procsConPasos;
        if (elWorkbench) {
            elWorkbench.procedimientos = procsConPasos;
        }
    } catch (error) {
        manejarError(error, 'la carga de procedimientos');
    }
}

/**
 * Carga órdenes de examen y resultados de un paso seleccionado.
 */
async function cargarOrdenesPaso(idPaso) {
    if (!idPaso) return;
    try {
        estado.pasoCargandoseId = idPaso;
        estado.pasoSeleccionadoId = idPaso;

        const servicioPaso = new ConsultaProcedimientoPasoService();
        const resOrdenes = await servicioPaso.ordenesExamen(idPaso).listar();
        const ordenes = resOrdenes.data || [];

        const ordenesConResultados = await Promise.all(ordenes.map(async (o) => {
            const servicioOrden = new OrdenExamenService();
            const resRes = await servicioOrden.resultados(o.idOrdenExamen).listar().catch(() => ({ data: [] }));
            return {
                ...o,
                resultados: resRes.data || [],
            };
        }));

        if (estado.pasoCargandoseId !== idPaso) return;

        estado.ordenesPaso = ordenesConResultados;
        if (elWorkbench) {
            elWorkbench.pasoSeleccionadoId = idPaso;
            elWorkbench.ordenesPaso = ordenesConResultados;
        }
    } catch (error) {
        manejarError(error, 'la carga de órdenes de examen');
    }
}

// =========================================================================
// ESCUCHADORES DE EVENTOS DE LOS WEB COMPONENTS (Presentación -> Control)
// =========================================================================

// 1. Cambiar médico activo desde la cabecera
document.addEventListener('cambiar-doctor', async (e) => {
    const idPersonaRol = e.detail.idPersonaRol;
    if (!idPersonaRol) return;
    try {
        if (elHeader) elHeader.cargando = true;
        mostrarFeedback('Cambiando médico activo en la sesión...', 'info', 2000);

        await atencionService.cambiarRol(idPersonaRol);

        const docEncontrado = estado.doctoresDisponibles.find(d => d.idPersonaRol === idPersonaRol);
        estado.medicoActivo = docEncontrado || { idPersonaRol, nombreCompleto: `Doctor (${(idPersonaRol || '').slice(0, 8)})` };

        if (elHeader) {
            elHeader.medico = {
                idPersonaRol: estado.medicoActivo.idPersonaRol,
                nombres: estado.medicoActivo.nombreCompleto,
                apellidos: '',
            };
        }

        if (elWorkbench) {
            elWorkbench.medico = estado.medicoActivo;
        }

        mostrarFeedback(`Médico activo cambiado a: ${estado.medicoActivo.nombreCompleto}`, 'success', 3000);
    } catch (error) {
        manejarError(error, 'el cambio de médico activo');
    } finally {
        if (elHeader) elHeader.cargando = false;
    }
});

// 2. Refrescar datos desde la cabecera
document.addEventListener('refrescar-datos', async () => {
    try {
        if (elHeader) elHeader.cargando = true;
        await cargarConsultas();
        if (estado.consultaSeleccionada) {
            await seleccionarConsulta(estado.consultaSeleccionada.idConsulta);
        }
        mostrarFeedback('Datos sincronizados con éxito con GalenoSV.', 'success', 2500);
    } catch (error) {
        manejarError(error, 'la sincronización');
    } finally {
        if (elHeader) elHeader.cargando = false;
    }
});

// 3. Selección de consulta en la cola
document.addEventListener('seleccionar-consulta', (e) => {
    seleccionarConsulta(e.detail.idConsulta);
});

// 4. Retomar consulta en sesión (Flujo de reanudación médica de GalenoSV)
document.addEventListener('retomar-consulta', async (e) => {
    try {
        mostrarFeedback('Reactivando consulta en la sesión médica...', 'info', 1500);
        await consultaService.retomar(e.detail.idConsulta);
        estado.idConsultaActivaSesion = e.detail.idConsulta;

        if (elWorkbench) {
            elWorkbench.isSesionActiva = true;
        }

        mostrarFeedback('⚡ Consulta retomada como activa en la sesión médica.', 'success', 3000);
    } catch (error) {
        manejarError(error, 'la reactivación de sesión médica');
    }
});

// 5. Guardado parcial de notas y referencia externa (Pestaña 1)
document.addEventListener('guardar-notas', async (e) => {
    const { idConsulta, observaciones, referenciaExterna } = e.detail;
    try {
        if (elWorkbench) elWorkbench.accionEnCurso = 'guardar-notas';
        mostrarFeedback('Guardando notas diagnósticas...', 'info', 1500);

        await consultaService.modificar(idConsulta, { observaciones, referenciaExterna });
        mostrarFeedback('Notas diagnósticas guardadas satisfactoriamente.', 'success', 3000);
    } catch (error) {
        manejarError(error, 'el guardado de notas diagnósticas');
    } finally {
        if (elWorkbench) elWorkbench.accionEnCurso = null;
    }
});

// 6. Agregar un nuevo procedimiento a la consulta (Pestaña 1)
document.addEventListener('agregar-procedimiento', async (e) => {
    if (!estado.consultaSeleccionada) return;
    try {
        if (elWorkbench) elWorkbench.accionEnCurso = 'agregar-proc';
        mostrarFeedback('Incorporando procedimiento médico...', 'info', 1500);

        const servicioProcs = consultaService.procedimientos(estado.consultaSeleccionada.idConsulta);
        await servicioProcs.crear({ idProcedimiento: e.detail.idProcedimiento });
        await cargarProcedimientosConsulta(estado.consultaSeleccionada.idConsulta);

        mostrarFeedback('Procedimiento incorporado a la consulta.', 'success', 3000);
    } catch (error) {
        manejarError(error, 'la incorporación del procedimiento');
    } finally {
        if (elWorkbench) elWorkbench.accionEnCurso = null;
    }
});

// 7. Asignarse como médico responsable de un paso clínico (Pestaña 1)
document.addEventListener('asignar-responsable', async (e) => {
    if (!estado.medicoActivo?.idPersonaRol) {
        mostrarFeedback('Debes seleccionar un perfil médico activo para asignarte.', 'error');
        return;
    }
    const idPaso = e.detail.idPaso;
    try {
        if (elWorkbench) elWorkbench.accionEnCurso = idPaso;
        const servicioPaso = new ConsultaProcedimientoPasoService();
        await servicioPaso.asignarResponsable(idPaso, estado.medicoActivo.idPersonaRol);
        await cargarProcedimientosConsulta(estado.consultaSeleccionada.idConsulta);
        mostrarFeedback('Te has asignado como responsable del paso clínico.', 'success', 3000);
    } catch (error) {
        manejarError(error, 'la asignación de responsable');
    } finally {
        if (elWorkbench) elWorkbench.accionEnCurso = null;
    }
});

// 8. Completar paso clínico con valor/medida (Pestaña 1)
document.addEventListener('completar-paso', async (e) => {
    const { idPaso, valor } = e.detail;
    try {
        if (elWorkbench) elWorkbench.accionEnCurso = idPaso;
        mostrarFeedback('Completando paso clínico...', 'info', 1500);

        const servicioPaso = new ConsultaProcedimientoPasoService();
        await servicioPaso.completar(idPaso, valor || 'Completado');
        await cargarProcedimientosConsulta(estado.consultaSeleccionada.idConsulta);

        mostrarFeedback('Paso clínico completado exitosamente.', 'success', 3000);
    } catch (error) {
        manejarError(error, 'la finalización del paso clínico');
    } finally {
        if (elWorkbench) elWorkbench.accionEnCurso = null;
    }
});

// 9. Seleccionar paso para ver exámenes (Pestañas 2, 3 y 4)
document.addEventListener('seleccionar-paso', (e) => {
    cargarOrdenesPaso(e.detail.idPaso);
});

// 10. Registrar/Vincular examen a paso en consulta (Pestaña 2: registrarExamen)
document.addEventListener('registrar-examen-paso', async (e) => {
    const { idPaso, idTipoExamen, nombre, observaciones } = e.detail;
    try {
        if (elWorkbench) elWorkbench.accionEnCurso = 'vincular-examen';
        mostrarFeedback('Vinculando examen diagnóstico al paso clínico...', 'info', 1500);

        const servicioPaso = new ConsultaProcedimientoPasoService();
        await servicioPaso.registrarExamen(idPaso, {
            idTipoExamen,
            nombre,
            observaciones,
        });

        await cargarOrdenesPaso(idPaso);
        mostrarFeedback('Examen diagnóstico vinculado al paso con éxito.', 'success', 3000);
    } catch (error) {
        manejarError(error, 'la vinculación del examen diagnóstico');
    } finally {
        if (elWorkbench) elWorkbench.accionEnCurso = null;
    }
});

// 11. Prescribir orden de examen (Pestaña 3: ordenesExamen.crear)
document.addEventListener('crear-orden-examen', async (e) => {
    const { idPaso, indicaciones } = e.detail;
    try {
        if (elWorkbench) elWorkbench.accionEnCurso = 'crear-orden';
        mostrarFeedback('Prescribiendo orden de laboratorio...', 'info', 1500);

        const servicioPaso = new ConsultaProcedimientoPasoService();
        await servicioPaso.ordenesExamen(idPaso).crear({ indicaciones });
        await cargarOrdenesPaso(idPaso);

        mostrarFeedback('Orden de laboratorio prescrita correctamente.', 'success', 3000);
    } catch (error) {
        manejarError(error, 'la prescripción del examen');
    } finally {
        if (elWorkbench) elWorkbench.accionEnCurso = null;
    }
});

// 12. Registrar resultado de examen (Pestaña 4: resultados.crear)
document.addEventListener('registrar-resultado-examen', async (e) => {
    const { idOrdenExamen, resultado, interpretacion } = e.detail;
    try {
        if (elWorkbench) elWorkbench.accionEnCurso = 'guardar-res';
        mostrarFeedback('Guardando resultado de examen...', 'info', 1500);

        const servicioOrden = new OrdenExamenService();
        await servicioOrden.resultados(idOrdenExamen).crear({ resultado, interpretacion });
        if (estado.pasoSeleccionadoId) {
            await cargarOrdenesPaso(estado.pasoSeleccionadoId);
        }

        mostrarFeedback('Resultado de examen registrado exitosamente.', 'success', 3000);
    } catch (error) {
        manejarError(error, 'el registro del resultado de examen');
    } finally {
        if (elWorkbench) elWorkbench.accionEnCurso = null;
    }
});

// 13. Cerrar consulta médica (Pestaña 1: cerrar)
document.addEventListener('cerrar-consulta', async (e) => {
    const { idConsulta, observaciones } = e.detail;
    try {
        if (elWorkbench) elWorkbench.accionEnCurso = 'cerrar-consulta';
        mostrarFeedback('Finalizando y cerrando la consulta médica...', 'info', 1500);

        await consultaService.cerrar(idConsulta, { observaciones });
        mostrarFeedback('Consulta médica cerrada exitosamente.', 'success', 4000);

        estado.idConsultaActivaSesion = null;
        await cargarConsultas();
        await seleccionarConsulta(idConsulta);
    } catch (error) {
        manejarError(error, 'el cierre de la consulta médica');
    } finally {
        if (elWorkbench) elWorkbench.accionEnCurso = null;
    }
});

// Iniciar al cargar el documento
window.addEventListener('DOMContentLoaded', inicializar);
