import DefaultService from "./default_service.js";
import MedioContacto from "../entities/medio_contacto.js";

/** Servicio REST de MedioContacto; hereda CRUD y respuestas comunes de DefaultService. */
class MedioContactoService extends DefaultService {
    constructor(opciones = {}) {
        super("medios-contacto", MedioContacto, opciones);
    }
}

export default MedioContactoService;
