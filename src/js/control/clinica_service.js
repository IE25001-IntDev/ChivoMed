import DefaultService from "./default_service.js";
import Clinica from "../entities/clinica.js";
import ConsultaService from "./consulta_service.js";
import PersonaService from "./persona_service.js";
import PersonaRolService from "./persona_rol_service.js";

/** Servicio REST de Clinica; hereda CRUD y respuestas comunes de DefaultService. */
class ClinicaService extends DefaultService {
    constructor(opciones = {}) {
        super("clinicas", Clinica, opciones);
    }

    /** Servicio de /clinicas/{id}/personas. */
    personas(id) {
        return this.relacionados(id, "personas", PersonaService, ["POST"]);
    }

    /** Servicio de /clinicas/{id}/personas-roles. */
    personasRoles(id) {
        return this.relacionados(id, "personas-roles", PersonaRolService, ["POST", "PUT", "PATCH", "DELETE"]);
    }

    /** Servicio de /clinicas/{id}/consultas. */
    consultas(id) {
        return this.relacionados(id, "consultas", ConsultaService, []);
    }
}

export default ClinicaService;
