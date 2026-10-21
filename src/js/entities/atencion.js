import DefaultEntity from "./default_entity.js";

/** Contexto de la sesión HTTP compartida con GalenoSV. */
class Atencion extends DefaultEntity {
    constructor(datos = {}) {
        super({ idPersonaRol: null, idConsulta: null }, datos);
    }
}

export default Atencion;
