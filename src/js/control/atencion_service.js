import DefaultService from "./default_service.js";
import Atencion from "../entities/atencion.js";

/** Selección del rol y consulta activos en la sesión HTTP de GalenoSV. */
class AtencionService extends DefaultService {
    constructor(opciones = {}) {
        super("atencion", Atencion, { metodos: [], ...opciones });
    }

    contexto(opciones = {}) {
        return this.solicitar("GET", this.recurso, opciones);
    }

    /**
     * Asignaciones de empleado activas de la cuenta en todas sus clínicas (GET /atencion/asignaciones).
     * DTO plano: [{ idPersonaRol, codigoRol, nombreRol, idClinica, nombreClinica, activa }].
     */
    asignaciones(opciones = {}) {
        return this.solicitar("GET", `${this.recurso}/asignaciones`, { ...opciones, Entidad: null });
    }

    /**
     * Consultas de la clínica del rol activo entre dos días de El Salvador (GET /atencion/dashboard).
     * Sin fechas, el backend usa hoy. Máximo 31 días contando ambos extremos.
     */
    dashboard({ desde, hasta } = {}, opciones = {}) {
        return this.solicitar("GET", `${this.recurso}/dashboard`, { ...opciones, filtros: { desde, hasta }, Entidad: null });
    }

    /** Valor registrado en un paso: { idConsultaProcedimientoPaso, nombre, estado, fechaFin, valor }. */
    valorPaso(idConsultaProcedimientoPaso, opciones = {}) {
        if (!idConsultaProcedimientoPaso) throw new TypeError("El identificador del paso es obligatorio.");
        return this.solicitar("GET", `${this.recurso}/dashboard/pasos/${encodeURIComponent(idConsultaProcedimientoPaso)}/valor`,
            { ...opciones, Entidad: null });
    }

    /** PUT /atencion/rol-activo → { idPersonaRol, idConsulta }. Con consulta en curso: 409 rolCambio.cerrarAntesCambiar. */
    cambiarRol(idPersonaRol, opciones = {}) {
        return this.solicitar("PUT", `${this.recurso}/rol-activo`, {
            ...opciones, data: { idPersonaRol },
        });
    }
}

export default AtencionService;
