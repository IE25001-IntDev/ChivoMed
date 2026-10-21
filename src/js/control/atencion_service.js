import DefaultService from "./default_service.js";
import Atencion from "../entities/atencion.js";

/** Selección del rol y consulta activos en la sesión HTTP de GalenoSV. */
class AtencionService extends DefaultService {
    constructor(opciones = {}) {
        super("atencion", Atencion, { metodos: [], ...opciones });
    }

    contexto(opciones = {}) {
        return this.solicitar("GET", this.recurso, opciones);
    }

    cambiarRol(idPersonaRol, opciones = {}) {
        return this.solicitar("PUT", `${this.recurso}/rol-activo`, {
            ...opciones, data: { idPersonaRol },
        });
    }
}

export default AtencionService;
