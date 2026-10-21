import DefaultService from "./default_service.js";
import Examen from "../entities/examen.js";
import ExamenTipoExamenService from "./examen_tipo_examen_service.js";

/** Servicio REST de Examen; hereda CRUD y respuestas comunes de DefaultService. */
class ExamenService extends DefaultService {
    constructor(opciones = {}) {
        super("examenes", Examen, opciones);
    }

    /** Servicio de /examenes/{id}/clasificaciones. */
    clasificaciones(id) {
        return this.relacionados(id, "clasificaciones", ExamenTipoExamenService, ["POST", "PUT", "PATCH", "DELETE"]);
    }
}

export default ExamenService;
