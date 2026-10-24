import DefaultEntity from "./default_entity.js";

/** Contrato JSON de PersonaRol en GalenoSV (PersonaRolDto.java). */
class PersonaRol extends DefaultEntity {
    constructor(datos = {}) {
        super({
            idPersonaRol: null,
            fechaCreacion: null,
            idClinica: null,
            idPersona: null,
            idRol: null,
        }, datos);
    }
}

export default PersonaRol;
