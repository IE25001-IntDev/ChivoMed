import DefaultService from "./default_service.js";
import PersonaRol from "../entities/persona_rol.js";
import ConsultaService from "./consulta_service.js";
import ConsultaProcedimientoPasoService from "./consulta_procedimiento_paso_service.js";

/** Servicio REST de PersonaRol; hereda CRUD y respuestas comunes de DefaultService. */
class PersonaRolService extends DefaultService {
    constructor(opciones = {}) {
        super("personas-roles", PersonaRol, opciones);
    }

    /** Servicio de /personas-roles/{id}/consultas. */
    consultas(id) {
        return this.relacionados(id, "consultas", ConsultaService, ["POST", "PUT", "PATCH"]);
    }

    /** Servicio de /personas-roles/{id}/pasos-consulta. */
    pasosConsulta(id) {
        return this.relacionados(id, "pasos-consulta", ConsultaProcedimientoPasoService, []);
    }
}

export default PersonaRolService;
