/**
 * HU1: búsqueda pública de citas (PublicoResource del backend). Sin sesión ni CSRF, pero el backend
 * exige un Origin permitido, por eso todo pasa por el proxy del puerto 3000.
 *
 *  - POST publico/clinicas            { idTipoDocumento, numeroDocumento }              → [{ idClinica, nombre }]
 *  - POST publico/citas               { …documento, idClinica, desde, hasta }           → [{ idConsulta, fechaInicio, nombreClinica, procedimientos }]
 *  - POST publico/citas/{id}/ticket   { idTipoDocumento, numeroDocumento }              → application/pdf
 *
 * El número de documento solo viaja recortado en el cuerpo: nunca en la URL ni en un mensaje.
 * Las tres rutas comparten el límite de 60 solicitudes por IP cada 5 minutos (429 + Retry-After).
 */
import DefaultService from "./default_service.js";
import DefaultError from "../entities/default_error.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ESPERA_POR_DEFECTO = 300;

const texto = valor => typeof valor === "string" && valor.trim().length > 0;

/** Segundos de Retry-After de un 429; 300 (lo que envía el backend) si falta o no es válido. */
export function segundosDeEspera(error) {
    const valor = Number.parseInt(error?.headers?.["retry-after"], 10);
    return Number.isFinite(valor) && valor > 0 ? valor : ESPERA_POR_DEFECTO;
}

/** Nombre del archivo de Content-Disposition sin rutas; si no hay, ticket-cita-<8>.pdf como el backend. */
export function nombreDeArchivo(disposicion, idConsulta) {
    const crudo = typeof disposicion === "string" ? /filename="?([^";]+)"?/i.exec(disposicion)?.[1] : null;
    const nombre = crudo?.split(/[\\/]/).pop()?.replace(/[^\w.-]/g, "");
    return nombre && /\.pdf$/i.test(nombre) ? nombre : `ticket-cita-${String(idConsulta).slice(0, 8)}.pdf`;
}

function normalizarClinicas(datos) {
    if (!Array.isArray(datos)) return Object.freeze([]);
    return Object.freeze(datos
        .filter(c => c && typeof c.idClinica === "string" && UUID.test(c.idClinica) && texto(c.nombre))
        .map(c => Object.freeze({ idClinica: c.idClinica, nombre: c.nombre.trim() })));
}

function normalizarCitas(datos) {
    if (!Array.isArray(datos)) return Object.freeze([]);
    return Object.freeze(datos
        .filter(c => c && typeof c.idConsulta === "string" && UUID.test(c.idConsulta) && texto(c.fechaInicio))
        .map(c => Object.freeze({
            idConsulta: c.idConsulta,
            fechaInicio: c.fechaInicio,
            nombreClinica: texto(c.nombreClinica) ? c.nombreClinica.trim() : "",
            procedimientos: Object.freeze(Array.isArray(c.procedimientos) ? c.procedimientos.filter(texto) : []),
        })));
}

export default class CitasPublicasService extends DefaultService {
    constructor(opciones = {}) {
        super("publico", null, { autenticar: null, ...opciones, metodos: ["POST"] });
    }

    #documento({ idTipoDocumento, numeroDocumento } = {}) {
        return { idTipoDocumento, numeroDocumento: typeof numeroDocumento === "string" ? numeroDocumento.trim() : "" };
    }

    async clinicas(documento) {
        const { data } = await this.solicitar("POST", "publico/clinicas", { data: this.#documento(documento) });
        return normalizarClinicas(data);
    }

    async citas(documento, { idClinica, desde, hasta }) {
        const { data } = await this.solicitar("POST", "publico/citas",
            { data: { ...this.#documento(documento), idClinica, desde, hasta } });
        return normalizarCitas(data);
    }

    /** { blob, nombre } del PDF. Una respuesta que no es PDF se trata como error. */
    async ticket(idConsulta, documento) {
        // ruta() exige el id y lo codifica: "publico/{id}" → "publico/citas/{id}/ticket".
        const ruta = `publico/citas/${this.ruta(idConsulta).slice(this.recurso.length + 1)}/ticket`;
        const { data, headers } = await this.solicitar("POST", ruta, {
            data: this.#documento(documento), respuesta: "blob",
            headers: { Accept: "application/pdf, application/json" },
        });
        if (!String(headers["content-type"] ?? "").toLowerCase().startsWith("application/pdf")) {
            throw new DefaultError({ status: 200, code: "respuesta.invalida",
                message: "GalenoSV no devolvió un PDF.", path: ruta, headers });
        }
        return Object.freeze({ blob: data, nombre: nombreDeArchivo(headers["content-disposition"], idConsulta) });
    }
}
