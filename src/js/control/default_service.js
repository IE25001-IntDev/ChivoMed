import DefaultResponse from "../entities/default_response.js";
import DefaultError from "../entities/default_error.js";
import { API_CONFIG } from "./api_config.js";
import { AuthService, auth, STATUS_SIN_SERVIDOR } from "./auth_service.js";

/** CRUD compartido. Todas las operaciones resuelven DefaultResponse o rechazan DefaultError. */
class DefaultService {
    constructor(recurso, Entidad, opciones = {}) {
        this.recurso = opciones.recurso ?? recurso;
        this.Entidad = Entidad;
        this.baseUrl = (opciones.baseUrl ?? API_CONFIG.baseUrl).replace(/\/+$/, "");
        this.credentials = opciones.credentials ?? API_CONFIG.credentials;
        this.headers = new Headers(opciones.headers);
        this.fetchImpl = opciones.fetchImpl ?? globalThis.fetch.bind(globalThis);
        // `autenticar: null` es explícito (rutas públicas, sin CSRF ni auth/me): no se reemplaza por el valor por defecto.
        this.autenticar = Object.hasOwn(opciones, "autenticar") ? opciones.autenticar
            : (typeof window === "undefined" ? null : () => auth.verificarSesionActual());
        this.metodos = new Set(opciones.metodos ?? ["POST", "PUT", "PATCH", "DELETE"]);
    }

    ruta(id) {
        if (id === null || id === undefined || String(id).trim() === "") {
            throw new TypeError("El identificador es obligatorio.");
        }
        return `${this.recurso}/${encodeURIComponent(id)}`;
    }

    /**
     * `respuesta: "blob"` lee un cuerpo exitoso como Blob (p. ej. un PDF) en `data`; los errores se
     * siguen leyendo como JSON.
     */
    solicitar(metodo, ruta, parametros = {}) {
        // El ejecutor corre en el acto: un throw síncrono (p. ej. al leer los parámetros) es un rechazo, como en una async.
        return new Promise(resolve => {
            const { data, filtros = {}, Entidad = this.Entidad,
                headers: adicionales, respuesta: modo = "json", ...opciones } = parametros;
            const query = new URLSearchParams();
            for (const [campo, valor] of Object.entries(filtros)) {
                if (valor !== undefined && valor !== null) query.set(campo, valor);
            }
            const url = `${this.baseUrl}/${ruta}${query.size ? `?${query}` : ""}`;
            const headers = new Headers(this.headers);
            new Headers(adicionales).forEach((valor, campo) => headers.set(campo, valor));
            const pedido = { metodo, url, headers, data, modo, opciones, Entidad };
            if (!["GET", "HEAD", "OPTIONS"].includes(metodo) && this.autenticar) {
                // El error de autenticar se propaga tal cual (no pasa por el catch del fetch).
                resolve(Promise.resolve(this.autenticar()).then(sesion => {
                    headers.set("X-CSRF-Token", sesion.csrfToken);
                    return this.#enviar(pedido);
                }));
            } else {
                resolve(this.#enviar(pedido));
            }
        });
    }

    /** Fetch y lectura del cuerpo; su fallo es un DefaultError de status 0. El resto va en #responder. */
    #enviar({ metodo, url, headers, data, modo, opciones, Entidad }) {
        if (!headers.has("Accept")) headers.set("Accept", "application/json");
        // Content-Type solo acompaña a un cuerpo: un PUT/POST vacío con application/json
        // hace que el backend responda 400 json.invalido.
        if (data === undefined) {
            headers.delete("Content-Type");
        } else if (!headers.has("Content-Type")) {
            headers.set("Content-Type", metodo === "PATCH"
                ? "application/merge-patch+json" : "application/json");
        }
        const body = data === undefined ? undefined : JSON.stringify(data);
        return new Promise(resolve => resolve(this.fetchImpl(url, {
            credentials: this.credentials, cache: "no-store", redirect: "error",
            signal: AbortSignal.timeout(10000), ...opciones, method: metodo, headers, body,
        })))
            // La lectura del cuerpo sigue dentro de lo que atrapa el error: el timeout también puede cortarla.
            .then(respuesta => (modo === "blob" && respuesta.ok
                ? respuesta.blob().then(blob => ({ respuesta, blob, texto: undefined }))
                : respuesta.text().then(texto => ({ respuesta, blob: null, texto }))))
            // Dos argumentos: los throw de #responder se propagan sin pasar por el manejo del fallo de red.
            .then(({ respuesta, blob, texto }) => this.#responder(respuesta, blob, texto, url, Entidad), cause => {
                const cancelada = cause.name === "AbortError" || opciones.signal?.aborted;
                if (!cancelada) AuthService.avisarServidor(null);
                throw new DefaultError({ status: 0,
                    code: cancelada ? "solicitud.cancelada" : "conexion.error",
                    message: cancelada ? "La solicitud fue cancelada." : "No se pudo conectar con GalenoSV.",
                    path: url, cause });
            });
    }

    #responder(respuesta, blob, texto, url, Entidad) {
        AuthService.avisarServidor(respuesta);
        // Sin conexión con el servidor (proxy sin backend o backend caído): igual que un fallo de red.
        if (STATUS_SIN_SERVIDOR.includes(respuesta.status)) {
            throw new DefaultError({ status: 0, code: "conexion.error",
                message: "No se pudo conectar con GalenoSV.", path: url,
                headers: Object.fromEntries(respuesta.headers.entries()) });
        }
        const cabeceras = Object.fromEntries(respuesta.headers.entries());
        if (blob) {
            return new DefaultResponse({ status: respuesta.status, message: respuesta.statusText, data: blob, headers: cabeceras });
        }
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
            if (respuesta.status === 401 && typeof document !== "undefined") document.dispatchEvent(new Event("sesion-expirada"));
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

    crear(datos, opciones = {}) {
        // exigirMetodo lanza un 405 síncrono: dentro del ejecutor sigue siendo un rechazo.
        return new Promise(resolve => {
            this.exigirMetodo("POST");
            resolve(this.solicitar("POST", this.recurso, { ...opciones, data: datos }));
        });
    }

    actualizar(id, datos, opciones = {}) {
        return new Promise(resolve => {
            this.exigirMetodo("PUT");
            resolve(this.solicitar("PUT", this.ruta(id), { ...opciones, data: datos }));
        });
    }

    modificar(id, cambios, opciones = {}) {
        return new Promise(resolve => {
            this.exigirMetodo("PATCH");
            // Enviar solo los campos presentes; null conserva el significado de Merge Patch.
            resolve(this.solicitar("PATCH", this.ruta(id), { ...opciones, data: cambios }));
        });
    }

    eliminar(id, opciones = {}) {
        return new Promise(resolve => {
            this.exigirMetodo("DELETE");
            resolve(this.solicitar("DELETE", this.ruta(id), opciones));
        });
    }

    relacionados(id, coleccion, Servicio, metodos = []) {
        return new Servicio({ baseUrl: this.baseUrl, credentials: this.credentials,
            headers: this.headers, fetchImpl: this.fetchImpl, autenticar: this.autenticar,
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
