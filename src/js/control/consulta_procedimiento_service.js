import DefaultService from "./default_service.js";
import ConsultaProcedimiento from "../entities/consulta_procedimiento.js";
import ConsultaProcedimientoPasoService from "./consulta_procedimiento_paso_service.js";

/** Servicio REST de ConsultaProcedimiento; hereda CRUD y respuestas comunes de DefaultService. */
class ConsultaProcedimientoService extends DefaultService {
    constructor(opciones = {}) {
        super("consultas-procedimientos", ConsultaProcedimiento, { metodos: ["POST", "PUT", "DELETE"], ...opciones });
    }

    /** Servicio de /consultas-procedimientos/{id}/pasos. */
    pasos(id) {
        return this.relacionados(id, "pasos", ConsultaProcedimientoPasoService, []);
    }
}

export default ConsultaProcedimientoService;
