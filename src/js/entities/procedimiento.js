import DefaultEntity from "./default_entity.js";

/** Contrato JSON de Procedimiento en GalenoSV (ProcedimientoDto.java). */
class Procedimiento extends DefaultEntity {
    constructor(datos = {}) {
        super({
            idProcedimiento: null,
            nombre: null,
            activo: null,
            observaciones: null,
        }, datos);
    }
}

export default Procedimiento;
