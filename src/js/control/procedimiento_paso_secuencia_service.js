import DefaultService from "./default_service.js";
import ProcedimientoPasoSecuencia from "../entities/procedimiento_paso_secuencia.js";

/** Servicio REST de ProcedimientoPasoSecuencia; hereda CRUD y respuestas comunes de DefaultService. */
class ProcedimientoPasoSecuenciaService extends DefaultService {
    constructor(opciones = {}) {
        super("procedimientos-pasos-secuencias", ProcedimientoPasoSecuencia, opciones);
    }
}

export default ProcedimientoPasoSecuenciaService;
