import DefaultEntity from "./default_entity.js";

/** Contrato JSON de TipoDocumento en GalenoSV (TipoDocumentoDto.java). */
class TipoDocumento extends DefaultEntity {
    constructor(datos = {}) {
        super({
            idTipoDocumento: null,
            nombre: null,
            indicaciones: null,
            expresionRegular: null,
            activo: null,
        }, datos);
    }
}

export default TipoDocumento;
