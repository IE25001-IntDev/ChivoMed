import DefaultService from "./default_service.js";
import TipoDocumento from "../entities/tipo_documento.js";
import DocumentoService from "./documento_service.js";

/** Servicio REST de TipoDocumento; hereda CRUD y respuestas comunes de DefaultService. */
class TipoDocumentoService extends DefaultService {
    constructor(opciones = {}) {
        super("tipos-documento", TipoDocumento, opciones);
    }

    /** Servicio de /tipos-documento/{id}/documentos. */
    documentos(id) {
        return this.relacionados(id, "documentos", DocumentoService, []);
    }
}

export default TipoDocumentoService;
