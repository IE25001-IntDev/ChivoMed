import DefaultEntity from "./default_entity.js";

/** Contrato JSON de ExamenTipoExamen en GalenoSV (ExamenTipoExamenDto.java). */
class ExamenTipoExamen extends DefaultEntity {
    constructor(datos = {}) {
        super({
            idExamenTipoExamen: null,
            fechaCreacion: null,
            observaciones: null,
            idExamen: null,
            idTipoExamen: null,
        }, datos);
    }
}

export default ExamenTipoExamen;
