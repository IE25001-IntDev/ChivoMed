import DefaultService from "./default_service.js";
import Consulta from "../entities/consulta.js";
import ConsultaProcedimientoService from "./consulta_procedimiento_service.js";

/** Servicio REST de Consulta; hereda CRUD y respuestas comunes de DefaultService. */
class ConsultaService extends DefaultService {
    constructor(opciones = {}) {
        super("consultas", Consulta, opciones);
    }

    /** Servicio de /consultas/{id}/procedimientos. */
    procedimientos(id) {
        return this.relacionados(id, "procedimientos", ConsultaProcedimientoService, ["POST"]);
    }

    cerrar(id, notas = {}, opciones = {}) {
        return this.solicitar("PUT", `${this.ruta(id)}/cierre`, { ...opciones, data: notas });
    }

    retomar(id, opciones = {}) {
        return this.solicitar("PUT", `${this.ruta(id)}/sesion`, opciones);
    }
}

export default ConsultaService;
