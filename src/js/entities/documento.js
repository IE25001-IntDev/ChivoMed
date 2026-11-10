import DefaultEntity from "./default_entity.js";

/** Contrato JSON de Documento en GalenoSV (DocumentoDto.java). */
class Documento extends DefaultEntity {
    constructor(datos = {}) {
        super({
            idDocumento: null,
            valor: null,
            rutaFisica: null,
            idPersona: null,
            idTipoDocumento: null,
        }, datos);
    }
}

export default Documento;
