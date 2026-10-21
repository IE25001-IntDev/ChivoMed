import DefaultEntity from "./default_entity.js";

/** Contrato JSON de OrdenExamen en GalenoSV (OrdenExamenDto.java). */
class OrdenExamen extends DefaultEntity {
    constructor(datos = {}) {
        super({
            idOrdenExamen: null,
            fechaCreacion: null,
            indicaciones: null,
            idConsultaProcedimientoPaso: null,
        }, datos);
    }
}

export default OrdenExamen;
