import DefaultEntity from "./default_entity.js";

/** Contrato JSON de ProcedimientoPasoSecuencia en GalenoSV (ProcedimientoPasoSecuenciaDto.java). */
class ProcedimientoPasoSecuencia extends DefaultEntity {
    constructor(datos = {}) {
        super({
            idProcedimientoPasoSecuencia: null,
            idProcedimientoPasoReferencia: null,
            tipoSecuencia: null,
            idProcedimientoPaso: null,
        }, datos);
    }
}

export default ProcedimientoPasoSecuencia;
