import DefaultService from "./default_service.js";
import OrdenExamen from "../entities/orden_examen.js";
import ExamenResultadoService from "./examen_resultado_service.js";

/** Servicio REST de OrdenExamen; hereda CRUD y respuestas comunes de DefaultService. */
class OrdenExamenService extends DefaultService {
    constructor(opciones = {}) {
        super("ordenes-examen", OrdenExamen, { metodos: ["POST", "PUT", "DELETE"], ...opciones });
    }

    /** Servicio de /ordenes-examen/{id}/resultados. */
    resultados(id) {
        return this.relacionados(id, "resultados", ExamenResultadoService, ["POST"]);
    }
}

export default OrdenExamenService;
