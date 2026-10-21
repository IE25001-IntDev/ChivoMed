import DefaultEntity from "./default_entity.js";

/** Contrato JSON de ProcedimientoPaso en GalenoSV (ProcedimientoPasoDto.java). */
class ProcedimientoPaso extends DefaultEntity {
    constructor(datos = {}) {
        super({
            idPasoPrevio: null,
            idProcedimientoPaso: null,
            nombre: null,
            indicaFin: null,
            idProcedimiento: null,
            idRol: null,
        }, datos);
    }
}

export default ProcedimientoPaso;
