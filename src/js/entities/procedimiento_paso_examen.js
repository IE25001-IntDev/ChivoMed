import DefaultEntity from "./default_entity.js";

/** Contrato JSON de ProcedimientoPasoExamen en GalenoSV (ProcedimientoPasoExamenDto.java). */
class ProcedimientoPasoExamen extends DefaultEntity {
    constructor(datos = {}) {
        super({
            idProcedimientoPasoExamen: null,
            fechaCreacion: null,
            activo: null,
            observaciones: null,
            idExamen: null,
            idProcedimientoPaso: null,
        }, datos);
    }
}

export default ProcedimientoPasoExamen;
