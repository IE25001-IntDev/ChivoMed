import DefaultService from "./default_service.js";
import ConsultaProcedimientoPaso from "../entities/consulta_procedimiento_paso.js";
import OrdenExamenService from "./orden_examen_service.js";
import Examen from "../entities/examen.js";

/** Servicio REST de ConsultaProcedimientoPaso; hereda CRUD y respuestas comunes de DefaultService. */
class ConsultaProcedimientoPasoService extends DefaultService {
    constructor(opciones = {}) {
        super("consultas-procedimientos-pasos", ConsultaProcedimientoPaso, { metodos: ["POST", "PUT", "DELETE"], ...opciones });
    }

    /** Servicio de /consultas-procedimientos-pasos/{id}/ordenes-examen. */
    ordenesExamen(id) {
        return this.relacionados(id, "ordenes-examen", OrdenExamenService, ["POST"]);
    }

    asignarResponsable(id, idPersonaRol, opciones = {}) {
        return this.solicitar("PUT", `${this.ruta(id)}/responsable`, {
            ...opciones, data: { idPersonaRol },
        });
    }

    completar(id, valor = null, opciones = {}) {
        return this.solicitar("PUT", `${this.ruta(id)}/finalizacion`, {
            ...opciones, data: { valor },
        });
    }

    registrarExamen(id, datos, opciones = {}) {
        return this.solicitar("POST", `${this.ruta(id)}/examenes`, {
            ...opciones, data: datos, Entidad: Examen,
        });
    }
}

export default ConsultaProcedimientoPasoService;
