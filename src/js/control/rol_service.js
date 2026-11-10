import DefaultService from "./default_service.js";
import Rol from "../entities/rol.js";
import PersonaService from "./persona_service.js";
import PersonaRolService from "./persona_rol_service.js";
import ProcedimientoPasoService from "./procedimiento_paso_service.js";

/** Servicio REST de Rol; hereda CRUD y respuestas comunes de DefaultService. */
class RolService extends DefaultService {
    constructor(opciones = {}) {
        super("roles", Rol, opciones);
    }

    /** Servicio de /roles/{id}/personas. */
    personas(id) {
        return this.relacionados(id, "personas", PersonaService, []);
    }

    /** Servicio de /roles/{id}/personas-roles. */
    personasRoles(id) {
        return this.relacionados(id, "personas-roles", PersonaRolService, ["POST", "PUT", "PATCH", "DELETE"]);
    }

    /** Servicio de /roles/{id}/procedimientos-pasos. */
    procedimientosPasos(id) {
        return this.relacionados(id, "procedimientos-pasos", ProcedimientoPasoService, []);
    }
}

export default RolService;
