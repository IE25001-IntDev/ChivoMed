import DefaultService from "./default_service.js";
import Consulta from "../entities/consulta.js";

/** Servicio REST de Consulta (HU4): seleccionarla en la sesión y cerrarla. */
class ConsultaService extends DefaultService {
    constructor(opciones = {}) {
        super("consultas", Consulta, opciones);
    }

    cerrar(id, notas = {}, opciones = {}) {
        return this.solicitar("PUT", `${this.ruta(id)}/cierre`, { ...opciones, data: notas });
    }

    retomar(id, opciones = {}) {
        return this.solicitar("PUT", `${this.ruta(id)}/sesion`, opciones);
    }
}

export default ConsultaService;
