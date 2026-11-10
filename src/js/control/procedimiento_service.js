import DefaultService from "./default_service.js";
import Procedimiento from "../entities/procedimiento.js";
import ConsultaProcedimientoService from "./consulta_procedimiento_service.js";
import ProcedimientoPasoService from "./procedimiento_paso_service.js";

/** Servicio REST de Procedimiento; hereda CRUD y respuestas comunes de DefaultService. */
class ProcedimientoService extends DefaultService {
    constructor(opciones = {}) {
        super("procedimientos", Procedimiento, opciones);
    }

    /** Servicio de /procedimientos/{id}/pasos. */
    pasos(id) {
        return this.relacionados(id, "pasos", ProcedimientoPasoService, ["POST"]);
    }

    /** Servicio de /procedimientos/{id}/consultas-procedimientos. */
    consultasProcedimientos(id) {
        return this.relacionados(id, "consultas-procedimientos", ConsultaProcedimientoService, []);
    }
}

export default ProcedimientoService;
