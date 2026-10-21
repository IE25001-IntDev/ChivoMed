import DefaultService from "./default_service.js";
import TipoMedioContacto from "../entities/tipo_medio_contacto.js";
import MedioContactoService from "./medio_contacto_service.js";

/** Servicio REST de TipoMedioContacto; hereda CRUD y respuestas comunes de DefaultService. */
class TipoMedioContactoService extends DefaultService {
    constructor(opciones = {}) {
        super("tipos-medio-contacto", TipoMedioContacto, opciones);
    }

    /** Servicio de /tipos-medio-contacto/{id}/medios-contacto. */
    mediosContacto(id) {
        return this.relacionados(id, "medios-contacto", MedioContactoService, []);
    }
}

export default TipoMedioContactoService;
