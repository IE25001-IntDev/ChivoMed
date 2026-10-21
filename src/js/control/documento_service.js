import DefaultService from "./default_service.js";
import Documento from "../entities/documento.js";

/** Servicio REST de Documento; hereda CRUD y respuestas comunes de DefaultService. */
class DocumentoService extends DefaultService {
    constructor(opciones = {}) {
        super("documentos", Documento, opciones);
    }
}

export default DocumentoService;
