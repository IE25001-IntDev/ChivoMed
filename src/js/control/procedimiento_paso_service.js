import DefaultService from "./default_service.js";
import ProcedimientoPaso from "../entities/procedimiento_paso.js";
import ConsultaProcedimientoPasoService from "./consulta_procedimiento_paso_service.js";
import ProcedimientoPasoExamenService from "./procedimiento_paso_examen_service.js";
import ProcedimientoPasoSecuenciaService from "./procedimiento_paso_secuencia_service.js";

/** Servicio REST de ProcedimientoPaso; hereda CRUD y respuestas comunes de DefaultService. */
class ProcedimientoPasoService extends DefaultService {
    constructor(opciones = {}) {
        super("procedimientos-pasos", ProcedimientoPaso, opciones);
    }

    /** Servicio de /procedimientos-pasos/{id}/examenes-configurados. */
    examenesConfigurados(id) {
        return this.relacionados(id, "examenes-configurados", ProcedimientoPasoExamenService, ["POST"]);
    }

    /** Servicio de /procedimientos-pasos/{id}/secuencias. */
    secuencias(id) {
        return this.relacionados(id, "secuencias", ProcedimientoPasoSecuenciaService, []);
    }

    /** Servicio de /procedimientos-pasos/{id}/pasos-consulta. */
    pasosConsulta(id) {
        return this.relacionados(id, "pasos-consulta", ConsultaProcedimientoPasoService, []);
    }
}

export default ProcedimientoPasoService;
