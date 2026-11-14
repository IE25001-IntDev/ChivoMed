import DefaultService from "./default_service.js";
import ProcedimientoPaso from "../entities/procedimiento_paso.js";

/** Servicio REST de ProcedimientoPaso (HU4): la definición del paso, para saber si es el último (`indicaFin`). */
class ProcedimientoPasoService extends DefaultService {
    constructor(opciones = {}) {
        super("procedimientos-pasos", ProcedimientoPaso, opciones);
    }
}

export default ProcedimientoPasoService;
