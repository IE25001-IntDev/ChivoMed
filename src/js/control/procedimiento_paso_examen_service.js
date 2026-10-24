import DefaultService from "./default_service.js";
import ProcedimientoPasoExamen from "../entities/procedimiento_paso_examen.js";

/** Servicio REST de ProcedimientoPasoExamen; hereda CRUD y respuestas comunes de DefaultService. */
class ProcedimientoPasoExamenService extends DefaultService {
    constructor(opciones = {}) {
        super("procedimientos-pasos-examenes", ProcedimientoPasoExamen, opciones);
    }
}

export default ProcedimientoPasoExamenService;
