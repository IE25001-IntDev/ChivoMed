import DefaultService from "./default_service.js";
import ExamenTipoExamen from "../entities/examen_tipo_examen.js";

/** Servicio REST de ExamenTipoExamen; hereda CRUD y respuestas comunes de DefaultService. */
class ExamenTipoExamenService extends DefaultService {
    constructor(opciones = {}) {
        super("examenes-tipos-examen", ExamenTipoExamen, opciones);
    }
}

export default ExamenTipoExamenService;
