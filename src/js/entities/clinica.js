import DefaultEntity from "./default_entity.js";

/** Contrato JSON de Clinica en GalenoSV (ClinicaDto.java). */
class Clinica extends DefaultEntity {
    constructor(datos = {}) {
        super({
            idClinica: null,
            nombre: null,
            activo: null,
            tipo: null,
            comentarios: null,
        }, datos);
    }
}

export default Clinica;
