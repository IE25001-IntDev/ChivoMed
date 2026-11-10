import DefaultService from "./default_service.js";
import TipoExamen from "../entities/tipo_examen.js";
import ExamenService from "./examen_service.js";
import ExamenTipoExamenService from "./examen_tipo_examen_service.js";

/** Servicio REST de TipoExamen; hereda CRUD y respuestas comunes de DefaultService. */
class TipoExamenService extends DefaultService {
    constructor(opciones = {}) {
        super("tipos-examen", TipoExamen, opciones);
    }

    /** Servicio de /tipos-examen/{id}/examenes. */
    examenes(id) {
        return this.relacionados(id, "examenes", ExamenService, []);
    }

    /** Servicio de /tipos-examen/{id}/clasificaciones. */
    clasificaciones(id) {
        return this.relacionados(id, "clasificaciones", ExamenTipoExamenService, ["POST", "PUT", "PATCH", "DELETE"]);
    }
}

export default TipoExamenService;
