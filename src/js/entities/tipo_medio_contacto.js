import DefaultEntity from "./default_entity.js";

/** Contrato JSON de TipoMedioContacto en GalenoSV (TipoMedioContactoDto.java). */
class TipoMedioContacto extends DefaultEntity {
    constructor(datos = {}) {
        super({
            idTipoMedioContacto: null,
            nombre: null,
            indicaciones: null,
            expresionRegular: null,
            activo: null,
        }, datos);
    }
}

export default TipoMedioContacto;
