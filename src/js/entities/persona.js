import DefaultEntity from "./default_entity.js";

/** Contrato JSON de Persona en GalenoSV (PersonaDto.java). */
class Persona extends DefaultEntity {
    constructor(datos = {}) {
        super({
            idPersona: null,
            nombres: null,
            apellidos: null,
            fechaNacimiento: null,
            fechaCreacion: null,
        }, datos);
    }
}

export default Persona;
