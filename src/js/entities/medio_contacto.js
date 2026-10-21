import DefaultEntity from "./default_entity.js";

/** Contrato JSON de MedioContacto en GalenoSV (MedioContactoDto.java). */
class MedioContacto extends DefaultEntity {
    constructor(datos = {}) {
        super({
            idMedioContacto: null,
            valor: null,
            fechaCreacion: null,
            idPersona: null,
            idTipoMedioContacto: null,
        }, datos);
    }
}

export default MedioContacto;
