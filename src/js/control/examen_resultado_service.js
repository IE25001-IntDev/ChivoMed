import DefaultService from "./default_service.js";
import ExamenResultado from "../entities/examen_resultado.js";

/** Servicio REST de ExamenResultado; hereda CRUD y respuestas comunes de DefaultService. */
class ExamenResultadoService extends DefaultService {
    constructor(opciones = {}) {
        super("examenes-resultados", ExamenResultado, { metodos: ["POST", "PUT", "DELETE"], ...opciones });
    }
}

export default ExamenResultadoService;
