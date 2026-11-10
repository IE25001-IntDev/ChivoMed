import AtencionService from './atencion_service.js';
import PersonaService from './persona_service.js';
import PersonaRolService from './persona_rol_service.js';
import RolService from './rol_service.js';
import ClinicaService from './clinica_service.js';
import TipoDocumentoService from './tipo_documento_service.js';
import DefaultError from '../entities/default_error.js';

function entidad(response, campo) {
    if (!response.data?.[campo]) {
        throw new DefaultError({ code: 'respuesta.invalida', message: 'Galeno devolvió un registro incompleto.' });
    }
    return response.data;
}

function lista(response) {
    if (!Array.isArray(response.data)) {
        throw new DefaultError({ code: 'respuesta.invalida', message: 'Galeno devolvió un listado inválido.' });
    }
    return response.data;
}

/** Patient records always descend from the assignment in Galeno's HTTP session. */
export default class PatientPortalService {
    constructor(opciones = {}) {
        this.atencion = new AtencionService(opciones);
        this.personas = new PersonaService(opciones);
        this.asignaciones = new PersonaRolService(opciones);
        this.roles = new RolService(opciones);
        this.clinicas = new ClinicaService(opciones);
        this.tiposDocumento = new TipoDocumentoService(opciones);
    }

    async contexto(opciones = {}) {
        const { data: sesion } = await this.atencion.contexto(opciones);
        if (!sesion?.idPersonaRol) {
            throw new DefaultError({ status: 401, code: 'sesion.pacienteRequerida',
                message: 'Selecciona tu rol de paciente en Galeno para acceder a tu expediente.' });
        }
        const asignacion = entidad(await this.asignaciones.buscarPorId(sesion.idPersonaRol, opciones), 'idPersonaRol');
        if (!asignacion.idPersona || !asignacion.idRol || !asignacion.idClinica) {
            throw new DefaultError({ status: 403, code: 'sesion.asignacionInvalida',
                message: 'Tu asignación debe tener una persona, una clínica y un rol de paciente.' });
        }
        const rol = entidad(await this.roles.buscarPorId(asignacion.idRol, opciones), 'idRol');
        if (rol.nombre?.trim().toLocaleLowerCase('es') !== 'paciente' || rol.activo !== true) {
            throw new DefaultError({ status: 403, code: 'sesion.rolPacienteRequerido',
                message: 'Este portal requiere el rol de paciente activo en Galeno.' });
        }
        const [persona, clinica] = await Promise.all([
            this.personas.buscarPorId(asignacion.idPersona, opciones).then(r => entidad(r, 'idPersona')),
            this.clinicas.buscarPorId(asignacion.idClinica, opciones).then(r => entidad(r, 'idClinica')),
        ]);
        if (clinica.activo !== true) {
            throw new DefaultError({ status: 403, code: 'sesion.clinicaInactiva',
                message: 'La clínica de tu sesión está inactiva. Selecciona una clínica activa en Galeno.' });
        }
        return { sesion, asignacion, rol, persona, clinica };
    }

    async cargar(pagina, opciones = {}) {
        const contexto = await this.contexto(opciones);
        const datos = { contexto, documentos: [], tiposDocumento: [], consultas: [], examenes: [] };
        const tareas = [];
        if (pagina === 'inicio' || pagina === 'documentos') {
            tareas.push(this.personas.documentos(contexto.persona.idPersona).listar({}, opciones)
                .then(r => { datos.documentos = lista(r); }));
        }
        if (pagina === 'documentos') {
            tareas.push(this.tiposDocumento.listar({}, opciones)
                .then(r => { datos.tiposDocumento = lista(r); }));
        }
        if (['inicio', 'consultas', 'examenes'].includes(pagina)) {
            tareas.push(this.asignaciones.consultas(contexto.asignacion.idPersonaRol).listar({}, opciones)
                .then(r => { datos.consultas = lista(r); }));
        }
        await Promise.all(tareas);
        if (pagina === 'inicio' || pagina === 'examenes') {
            datos.examenes = await this.ordenesDelPaciente(contexto, datos.consultas, opciones);
        }
        return datos;
    }

    async ordenesDelPaciente(contexto, consultas, opciones = {}) {
        const registros = [];
        const servicio = this.asignaciones.consultas(contexto.asignacion.idPersonaRol);
        // Do not read the global exam/order catalogs: they are not patient history.
        for (const consulta of consultas) {
            const procedimientos = servicio.procedimientos(consulta.idConsulta);
            for (const procedimiento of lista(await procedimientos.listar({}, opciones))) {
                const pasos = procedimientos.pasos(procedimiento.idConsultaProcedimiento);
                for (const paso of lista(await pasos.listar({}, opciones))) {
                    const ordenes = pasos.ordenesExamen(paso.idConsultaProcedimientoPaso);
                    for (const orden of lista(await ordenes.listar({}, opciones))) {
                        const resultados = lista(await ordenes.resultados(orden.idOrdenExamen).listar({}, opciones));
                        registros.push({ orden, resultados, consulta, procedimiento, paso });
                    }
                }
            }
        }
        return registros;
    }

    async registrarDocumento(contextoEsperado, datos, opciones = {}) {
        // A role switched in another tab must not write into the previous patient's file.
        const actual = await this.contexto(opciones);
        if (actual.asignacion.idPersonaRol !== contextoEsperado.asignacion.idPersonaRol
            || actual.persona.idPersona !== contextoEsperado.persona.idPersona
            || actual.clinica.idClinica !== contextoEsperado.clinica.idClinica) {
            throw new DefaultError({ status: 409, code: 'sesion.cambio',
                message: 'La sesión cambió. Actualiza el portal antes de registrar el documento.' });
        }
        const valor = String(datos.valor ?? '').trim();
        if (!valor || !datos.idTipoDocumento) {
            throw new DefaultError({ status: 400, code: 'validacion.error',
                message: 'Selecciona un tipo y escribe el número o referencia del documento.' });
        }
        const respuesta = await this.personas.documentos(actual.persona.idPersona).crear({
            idTipoDocumento: datos.idTipoDocumento,
            valor,
            rutaFisica: String(datos.rutaFisica ?? '').trim() || null,
        }, opciones);
        return entidad(respuesta, 'idDocumento');
    }
}
