import DefaultEntity from "./default_entity.js";

/** Contrato JSON de ExamenResultado en GalenoSV (ExamenResultadoDto.java). */
class ExamenResultado extends DefaultEntity {
    constructor(datos = {}) {
        super({
            idExamenResultado: null,
            fechaCreacion: null,
            resultado: null,
            interpretacion: null,
            rutaAtestado: null,
            idOrdenExamen: null,
        }, datos);
    }
}

export default ExamenResultado;
