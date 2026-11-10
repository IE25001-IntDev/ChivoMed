import DefaultEntity from "./default_entity.js";

/** Contrato JSON de Rol en GalenoSV (RolDto.java). */
class Rol extends DefaultEntity {
    constructor(datos = {}) {
        super({
            idRol: null,
            nombre: null,
            activo: null,
            observaciones: null,
        }, datos);
    }
}

export default Rol;
