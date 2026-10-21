import DefaultEntity from "./default_entity.js";

/** Contrato JSON de ConsultaProcedimientoPaso en GalenoSV (ConsultaProcedimientoPasoDto.java). */
class ConsultaProcedimientoPaso extends DefaultEntity {
    constructor(datos = {}) {
        super({
            idConsultaProcedimientoPaso: null,
            fechaInicio: null,
            fechaFin: null,
            estado: null,
            valor: null,
            idConsultaProcedimiento: null,
            idPersonaRol: null,
            idProcedimientoPaso: null,
        }, datos);
    }
}

export default ConsultaProcedimientoPaso;
