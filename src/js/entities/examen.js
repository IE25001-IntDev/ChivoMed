import DefaultEntity from "./default_entity.js";

/** Contrato JSON de Examen en GalenoSV (ExamenDto.java). */
class Examen extends DefaultEntity {
    constructor(datos = {}) {
        super({
            idExamen: null,
            nombre: null,
            activo: null,
            observaciones: null,
        }, datos);
    }
}

export default Examen;
