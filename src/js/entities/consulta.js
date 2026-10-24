import DefaultEntity from "./default_entity.js";

/** Contrato JSON de Consulta en GalenoSV (ConsultaDto.java). */
class Consulta extends DefaultEntity {
    constructor(datos = {}) {
        super({
            idConsulta: null,
            fechaInicio: null,
            fechaFin: null,
            referenciaExterna: null,
            observaciones: null,
            idPersonaRol: null,
        }, datos);
    }
}

export default Consulta;
