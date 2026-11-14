import DefaultService from "./default_service.js";
import OrdenExamen from "../entities/orden_examen.js";

/** Servicio REST de las órdenes de examen de un paso (HU4): se listan y se crean desde el paso. */
class OrdenExamenService extends DefaultService {
    constructor(opciones = {}) {
        super("ordenes-examen", OrdenExamen, { metodos: ["POST", "PUT", "DELETE"], ...opciones });
    }
}

export default OrdenExamenService;
