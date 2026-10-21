import DefaultResponse from "../entities/default_response.js";
import DefaultError from "../entities/default_error.js";
import { API_CONFIG } from "./api_config.js";

/** CRUD compartido. Todas las operaciones resuelven DefaultResponse o rechazan DefaultError. */
class DefaultService {
    constructor(recurso, Entidad, opciones = {}) {
        this.recurso = opciones.recurso ?? recurso;
        this.Entidad = Entidad;
        this.baseUrl = (opciones.baseUrl ?? API_CONFIG.baseUrl).replace(/\/+$/, "");
        this.credentials = opciones.credentials ?? API_CONFIG.credentials;
        this.headers = new Headers(opciones.headers);
        this.fetchImpl = opciones.fetchImpl ?? globalThis.fetch.bind(globalThis);
        this.metodos = new Set(opciones.metodos ?? ["POST", "PUT", "PATCH", "DELETE"]);
    }

    ruta(id) {
        if (id === null || id === undefined || String(id).trim() === "") {
            throw new TypeError("El identificador es obligatorio.");
        }
        return `${this.recurso}/${encodeURIComponent(id)}`;
    }

    async solicitar(metodo, ruta, { data, filtros = {}, Entidad = this.Entidad,
        headers: adicionales, ...opciones } = {}) {
        const query = new URLSearchParams();
        for (const [campo, valor] of Object.entries(filtros)) {
            if (valor !== undefined && valor !== null) query.set(campo, valor);
        }
        const url = `${this.baseUrl}/${ruta}${query.size ? `?${query}` : ""}`;
        const headers = new Headers(this.headers);
        new Headers(adicionales).forEach((valor, campo) => headers.set(campo, valor));
        if (!headers.has("Accept")) headers.set("Accept", "application/json");
        if (data !== undefined && !headers.has("Content-Type")) {
            headers.set("Content-Type", metodo === "PATCH"
                ? "application/merge-patch+json" : "application/json");
        }
        const body = data === undefined ? undefined : JSON.stringify(data);
        let respuesta;
        let texto;
        try {
            respuesta = await this.fetchImpl(url, {
                credentials: this.credentials, ...opciones, method: metodo, headers, body,
            });
            texto = await respuesta.text();
        } catch (cause) {
            const cancelada = cause.name === "AbortError" || opciones.signal?.aborted;
            throw new DefaultError({ status: 0,
                code: cancelada ? "solicitud.cancelada" : "conexion.error",
                message: cancelada ? "La solicitud fue cancelada." : "No se pudo conectar con GalenoSV.",
                path: url, cause });
        }
        const cabeceras = Object.fromEntries(respuesta.headers.entries());
        let datos = null;
        if (texto) {
            try {
                datos = JSON.parse(texto);
            } catch (cause) {
                if (respuesta.ok) {
                    throw new DefaultError({ status: respuesta.status, code: "respuesta.invalida",
                        message: "GalenoSV devolvió una respuesta JSON inválida.",
                        path: url, headers: cabeceras, data: texto, cause });
                }
                datos = texto;
            }
        }
        if (!respuesta.ok) {
            throw new DefaultError({ status: respuesta.status,
                code: datos?.code ?? "http.error",
                message: datos?.message ?? (respuesta.statusText || `Error HTTP ${respuesta.status}.`),
                path: datos?.path ?? url, timestamp: datos?.timestamp ?? null,
                details: datos?.details ?? [], headers: cabeceras, data: datos });
        }
        const convertir = (dato) => dato === null || !Entidad ? dato : new Entidad(dato);
        return new DefaultResponse({ status: respuesta.status, message: respuesta.statusText,
            data: Array.isArray(datos) ? datos.map(convertir) : convertir(datos), headers: cabeceras });
    }

    listar(filtros = {}, opciones = {}) {
        return this.solicitar("GET", this.recurso, { ...opciones, filtros });
    }

    buscarPorId(id, opciones = {}) {
        return this.solicitar("GET", this.ruta(id), opciones);
    }

    async crear(datos, opciones = {}) {
        this.exigirMetodo("POST");
        return this.solicitar("POST", this.recurso, { ...opciones, data: datos });
    }

    async actualizar(id, datos, opciones = {}) {
        this.exigirMetodo("PUT");
        return this.solicitar("PUT", this.ruta(id), { ...opciones, data: datos });
    }

    async modificar(id, cambios, opciones = {}) {
        this.exigirMetodo("PATCH");
        // Enviar solo los campos presentes; null conserva el significado de Merge Patch.
        return this.solicitar("PATCH", this.ruta(id), { ...opciones, data: cambios });
    }

    async eliminar(id, opciones = {}) {
        this.exigirMetodo("DELETE");
        return this.solicitar("DELETE", this.ruta(id), opciones);
    }

    relacionados(id, coleccion, Servicio, metodos = []) {
        return new Servicio({ baseUrl: this.baseUrl, credentials: this.credentials,
            headers: this.headers, fetchImpl: this.fetchImpl,
            recurso: `${this.ruta(id)}/${coleccion}`, metodos });
    }

    exigirMetodo(metodo) {
        if (!this.metodos.has(metodo)) {
            throw new DefaultError({ status: 405, code: "metodo.noPermitido",
                message: `${metodo} no está habilitado para ${this.recurso}.`, path: this.recurso });
        }
    }
}

export default DefaultService;
