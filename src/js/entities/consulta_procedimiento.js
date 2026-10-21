import DefaultEntity from "./default_entity.js";

/** Contrato JSON de ConsultaProcedimiento en GalenoSV (ConsultaProcedimientoDto.java). */
class ConsultaProcedimiento extends DefaultEntity {
    constructor(datos = {}) {
        super({
            idConsultaProcedimiento: null,
            idProcedimiento: null,
            fechaInicio: null,
            fechaFin: null,
            observaciones: null,
            idConsulta: null,
        }, datos);
    }
}

export default ConsultaProcedimiento;
