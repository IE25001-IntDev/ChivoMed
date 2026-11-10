import DefaultService from "./default_service.js";
import Persona from "../entities/persona.js";
import ConsultaService from "./consulta_service.js";
import DocumentoService from "./documento_service.js";
import MedioContactoService from "./medio_contacto_service.js";
import PersonaRolService from "./persona_rol_service.js";

/** Servicio REST de Persona; hereda CRUD y respuestas comunes de DefaultService. */
class PersonaService extends DefaultService {
    constructor(opciones = {}) {
        super("personas", Persona, opciones);
    }

    /** Servicio de /personas/{id}/documentos. */
    documentos(id) {
        return this.relacionados(id, "documentos", DocumentoService, ["POST", "PUT", "PATCH", "DELETE"]);
    }

    /** Servicio de /personas/{id}/medios-contacto. */
    mediosContacto(id) {
        return this.relacionados(id, "medios-contacto", MedioContactoService, ["POST", "PUT", "PATCH", "DELETE"]);
    }

    /** Servicio de /personas/{id}/personas-roles. */
    personasRoles(id) {
        return this.relacionados(id, "personas-roles", PersonaRolService, ["POST", "PUT", "PATCH", "DELETE"]);
    }

    /** Servicio de /personas/{id}/consultas. */
    consultas(id) {
        return this.relacionados(id, "consultas", ConsultaService, []);
    }
}

export default PersonaService;
