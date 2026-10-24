import DefaultEntity from "./default_entity.js";

/** Contrato JSON de TipoExamen en GalenoSV (TipoExamenDto.java). */
class TipoExamen extends DefaultEntity {
    constructor(datos = {}) {
        super({
            idTipoExamen: null,
            nombre: null,
            activo: null,
            observaciones: null,
        }, datos);
    }
}

export default TipoExamen;
