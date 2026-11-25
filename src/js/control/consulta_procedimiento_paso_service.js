import DefaultService from "./default_service.js";
import ConsultaProcedimientoPaso from "../entities/consulta_procedimiento_paso.js";
import OrdenExamenService from "./orden_examen_service.js";
import OrdenExamen from "../entities/orden_examen.js";

/** Servicio REST de ConsultaProcedimientoPaso; hereda CRUD y respuestas comunes de DefaultService. */
class ConsultaProcedimientoPasoService extends DefaultService {
    constructor(opciones = {}) {
        super("consultas-procedimientos-pasos", ConsultaProcedimientoPaso, { metodos: ["POST", "PUT", "DELETE"], ...opciones });
    }

    /** Servicio de /consultas-procedimientos-pasos/{id}/ordenes-examen. */
    ordenesExamen(id) {
        return this.relacionados(id, "ordenes-examen", OrdenExamenService, ["POST"]);
    }

    completar(id, valor = null, opciones = {}) {
        return this.solicitar("PUT", `${this.ruta(id)}/finalizacion`, {
            ...opciones, data: { valor },
        });
    }

    /**
     * HU4: reabre el paso anterior y elimina este paso vacío; envía observaciones e indicaciones del retroceso.
     * Responde con el paso anterior reabierto, que conserva su valor.
     */
    retroceder(id, notas = undefined, opciones = {}) {
        return this.solicitar("PUT", `${this.ruta(id)}/retroceso`, { ...opciones, data: notas });
    }

    /**
     * HU4: exámenes activos que se pueden ordenar en este paso, por nombre:
     * [{ idExamen, nombre, tiposExamen: [{ idTipoExamen, nombre }] }] (tipos activos, por nombre; B8).
     */
    examenesAsignables(id, opciones = {}) {
        return this.solicitar("GET", `${this.ruta(id)}/examenes-asignables`, { ...opciones, Entidad: null });
    }

    /**
     * HU4: emite una orden de un examen asignable (POST …/ordenes-examen). El backend exige hoy
     * `idConsultaProcedimientoPaso` también en el cuerpo, así que siempre se envía. Las indicaciones
     * son opcionales con examen: si vienen vacías no se envían.
     */
    ordenar(id, { idExamen, indicaciones } = {}, opciones = {}) {
        const datos = { idConsultaProcedimientoPaso: id, idExamen };
        if (typeof indicaciones === "string" && indicaciones.trim()) datos.indicaciones = indicaciones.trim();
        return this.solicitar("POST", `${this.ruta(id)}/ordenes-examen`, { ...opciones, data: datos, Entidad: OrdenExamen });
    }
}

export default ConsultaProcedimientoPasoService;
