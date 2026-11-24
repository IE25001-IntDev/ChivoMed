import { API_CONFIG } from "./api_config.js";
import { Validaciones } from "./validaciones.js";

/**
 * Regla de empleado (B8): cualquier rol activo excepto Paciente, incluso un rol sin código.
 * El código solo sirve para reconocer PACIENTE; para mostrar el rol se usa `nombreRol`.
 */
export const CODIGO_PACIENTE = "PACIENTE";
export const ROL_SIN_NOMBRE = "Rol sin nombre";

export class AuthError extends Error {
    /** `code` "conexion.error" marca que no hubo respuesta (sin red o tiempo agotado), como en DefaultError. */
    constructor(message, status = 0, code = null) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

export const CODIGO_SIN_RED = "conexion.error";
/**
 * Un solo criterio de "sin conexión con el servidor": 502, 503 y 504 (el proxy del servidor de
 * desarrollo sin backend, o el backend caído) se tratan como un fallo de red, con status 0 y
 * CODIGO_SIN_RED. Lo usan auth_service y DefaultService.
 */
export const STATUS_SIN_SERVIDOR = Object.freeze([502, 503, 504]);

/**
 * Cabecera con la que el service worker (sw_logica.js) marca una respuesta servida desde su copia:
 * no es una respuesta del backend.
 */
export const CABECERA_COPIA = "X-ChivoMed-Copia";
export const EVENTO_SERVIDOR_CAIDO = "servidor-caido";
export const EVENTO_SERVIDOR_RESPONDIO = "servidor-respondio";

const MENSAJES = Object.freeze({
    login: {
        400: "Revisa el tipo y el número de documento.",
        401: "No encontramos una persona con ese documento activo.",
        403: "Este acceso es solo para el personal de la clínica.",
    },
    sesion: {
        400: "No pudimos verificar tu sesión. Inténtalo de nuevo.",
        401: "Tu sesión ha finalizado. Vuelve a iniciar sesión.",
        403: "No fue posible autorizar tu acceso. Comunícate con tu clínica.",
    },
    publico: {
        400: "No pudimos cargar los tipos de documento.",
        401: "No pudimos cargar los tipos de documento.",
        403: "No pudimos cargar los tipos de documento.",
    },
});

/**
 * Mensajes por `code` del cuerpo de error del backend; tienen prioridad sobre los del status.
 * auth.origen: el backend solo acepta escrituras desde los orígenes de CHIVOMED_ORIGINS
 * (por defecto el puerto 3000 de localhost/127.0.0.1).
 */
export const MENSAJES_POR_CODIGO = Object.freeze({
    "auth.origen": "El servidor no acepta este origen; abre la app en http://localhost:3000",
});

/**
 * Servicio de autenticación (sesión HTTP con cookie y CSRF). Hay una sola instancia, `auth`, que
 * guarda la sesión validada por /auth/me y la que muestra la vista. Lo que no depende de esa sesión
 * (`esEmpleado`, `nombreDeRol`, `avisarServidor`) es estático.
 */
export class AuthService {
    /** Última sesión validada por /auth/me; null tras cerrar sesión. */
    #sesionActual;
    /** Sesión con la que se pintó la vista actual (la fija <app-shell>); manda sobre #sesionActual. */
    #sesionVista;

    /** true si la sesión tiene un rol activo que no es PACIENTE. */
    static esEmpleado(sesion) {
        const rol = sesion?.rolActivo;
        return Boolean(rol) && typeof rol.idPersonaRol === "string" && rol.codigo !== CODIGO_PACIENTE;
    }

    /** Nombre visible del rol activo; un rol sin nombre muestra un texto neutro, nunca el código. */
    static nombreDeRol(rolActivo) {
        return typeof rolActivo?.nombreRol === "string" && rolActivo.nombreRol.trim() ? rolActivo.nombreRol.trim() : ROL_SIN_NOMBRE;
    }

    /**
     * Avisa en document si el backend respondió, para el estado de conexión (controlador_conexion.js).
     * Sin respuesta (fallo de red o tiempo agotado), un 502/503/504 o la copia del service worker
     * avisan "servidor-caido"; cualquier otra respuesta, aunque sea un error, "servidor-respondio".
     * @param respuesta la Response del backend, o null si no hubo respuesta.
     */
    static avisarServidor(respuesta) {
        if (typeof document === "undefined") return;
        const respondio = Boolean(respuesta) && !STATUS_SIN_SERVIDOR.includes(respuesta.status)
            && !respuesta.headers?.get(CABECERA_COPIA);
        document.dispatchEvent(new Event(respondio ? EVENTO_SERVIDOR_RESPONDIO : EVENTO_SERVIDOR_CAIDO));
    }

    fijarSesionVista(sesion) {
        this.#sesionVista = sesion;
    }

    /** Relee /auth/me y rechaza con 409 si el usuario, el rol o la clínica cambiaron respecto de lo mostrado. */
    verificarSesionActual() {
        const anterior = this.#sesionVista ?? this.#sesionActual;
        return new Promise(resolve => resolve(this.obtenerSesion())).then(actual => {
            if (anterior && (actual.usuario.idUsuario !== anterior.usuario.idUsuario
                || actual.rolActivo?.idPersonaRol !== anterior.rolActivo?.idPersonaRol
                || actual.rolActivo?.idClinica !== anterior.rolActivo?.idClinica)) {
                throw new AuthError("La sesión cambió. Recarga la página antes de guardar.", 409);
            }
            return actual;
        });
    }

    /**
     * GET liviano para saber si el backend volvió: el catálogo público con `?verificar=1`, que el
     * service worker nunca sirve desde su copia (solo guarda el catálogo sin query). true si respondió.
     */
    verificarServidor() {
        return new Promise(resolve => resolve(fetch(`${API_CONFIG.baseUrl.replace(/\/+$/, "")}/publico/tipos-documento?verificar=1`, {
            headers: { Accept: "application/json" }, credentials: API_CONFIG.credentials,
            cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
        })))
            .then(respuesta => !STATUS_SIN_SERVIDOR.includes(respuesta.status) && !respuesta.headers.get(CABECERA_COPIA))
            .catch(() => false);
    }

    /**
     * Tipos de documento activos para el login, sin sesión (GET /publico/tipos-documento).
     * Devuelve objetos con los campos de TipoDocumentoDto, ordenados por nombre.
     */
    listarTiposDocumento() {
        const mensaje = "No pudimos cargar los tipos de documento.";
        return new Promise(resolve => resolve(this.#solicitar("publico/tipos-documento", { tipo: "publico" })))
            .then(respuesta => this.#leerJson(respuesta, mensaje))
            .then(datos => this.#normalizarTipos(datos, mensaje));
    }

    // Contrato de /auth/me; la identidad y el rol siempre los decide el backend.
    // { usuario: { idUsuario, idPersona, nombres, apellidos },
    //   rolActivo: { idPersonaRol, codigo, nombreRol, idClinica, nombreClinica } | null, csrfToken }
    // `idUsuario` se conserva como alias de `idPersona`; el backend ya no tiene tabla usuario.
    // `codigo` y `rolActivo` pueden ser null; los permisos de páginas dependen del rol.
    obtenerSesion() {
        return new Promise(resolve => resolve(this.#solicitar("auth/me")))
            .then(respuesta => this.#leerJson(respuesta, "No pudimos verificar tu sesión. Inténtalo de nuevo."))
            .then(sesion => this.#validarSesion(sesion));
    }

    /**
     * Login de persona por documento, sin contraseña:
     * POST /auth/login con { idTipoDocumento, numeroDocumento } → 204 y cookie de sesión; luego GET /auth/me.
     */
    iniciarSesion(idTipoDocumento, numeroDocumento) {
        // La validación lanza un 400 síncrono: dentro del ejecutor sigue siendo un rechazo.
        return new Promise(resolve => {
            const numero = typeof numeroDocumento === "string" ? numeroDocumento.trim() : "";
            if (typeof idTipoDocumento !== "string" || !Validaciones.UUID.test(idTipoDocumento)
                || !numero || numero.length > Validaciones.MAX_NUMERO_DOCUMENTO || /[\r\n]/.test(numero)) {
                throw new AuthError(MENSAJES.login[400], 400);
            }
            resolve(this.#solicitar("auth/login", { method: "POST", tipo: "login", datos: { idTipoDocumento, numeroDocumento: numero } }));
        }).then(() => this.obtenerSesion());
    }

    cerrarSesion(csrfToken) {
        return new Promise(resolve => {
            if (typeof csrfToken !== "string" || !csrfToken.trim() || /[\r\n]/.test(csrfToken)) {
                throw new AuthError("No pudimos verificar tu sesión. Recarga la página.");
            }
            resolve(this.#solicitar("auth/logout", { method: "POST", csrfToken }));
        }).then(() => {
            this.#sesionActual = null;
        });
    }

    /**
     * @param ruta ruta relativa a la API, p. ej. "auth/me" o "publico/tipos-documento".
     * @param opciones `method` (opcional), `datos` (cuerpo JSON, opcional), `csrfToken` (opcional) y
     *   `tipo`, que puede ser "login", "sesion" o "publico" y elige los mensajes; solo las rutas de
     *   sesión avisan "sesion-expirada" ante un 401.
     */
    #solicitar(ruta, opciones = {}) {
        return new Promise(resolve => {
            const { method = "GET", datos, csrfToken, tipo = "sesion" } = opciones;
            const headers = { Accept: "application/json" };
            if (datos !== undefined) headers["Content-Type"] = "application/json";
            if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
            // Dos argumentos: el try original solo envolvía el fetch; lo de #responder se propaga tal cual.
            resolve(new Promise(enviar => enviar(fetch(`${API_CONFIG.baseUrl.replace(/\/+$/, "")}/${ruta}`, {
                method, headers,
                body: datos === undefined ? undefined : JSON.stringify(datos),
                credentials: API_CONFIG.credentials,
                cache: "no-store",
                redirect: "error",
                signal: AbortSignal.timeout(10000),
            }))).then(respuesta => this.#responder(respuesta, tipo), error => {
                AuthService.avisarServidor(null);
                throw new AuthError(error.name === "TimeoutError" || error.name === "AbortError"
                    ? "La solicitud tardó demasiado. Inténtalo de nuevo."
                    : "No pudimos conectar con el servicio. Inténtalo de nuevo.", 0, CODIGO_SIN_RED);
            }));
        });
    }

    /** Respuesta del fetch de #solicitar: la devuelve si es ok; si no, rechaza con el AuthError que corresponde. */
    #responder(respuesta, tipo) {
        AuthService.avisarServidor(respuesta);
        // 502, 503 y 504: sin conexión con el servidor, igual que un fallo de red (como en DefaultService).
        if (STATUS_SIN_SERVIDOR.includes(respuesta.status)) {
            throw new AuthError("No pudimos conectar con el servicio. Inténtalo de nuevo.", 0, CODIGO_SIN_RED);
        }
        if (respuesta.ok) return respuesta;
        if (respuesta.status === 401 && tipo === "sesion" && typeof document !== "undefined") document.dispatchEvent(new Event("sesion-expirada"));
        const mensajes = {
            ...MENSAJES[tipo],
            404: "El servicio de acceso todavía no está disponible.",
            429: "Hay demasiados intentos. Espera un momento antes de volver a intentarlo.",
        };
        const general = tipo === "publico" ? MENSAJES.publico[400] : "El servicio no está disponible. Inténtalo más tarde.";
        return this.#codigoDeError(respuesta).then(codigo => {
            const porCodigo = codigo && Object.hasOwn(MENSAJES_POR_CODIGO, codigo) ? MENSAJES_POR_CODIGO[codigo] : null;
            throw new AuthError(porCodigo ?? mensajes[respuesta.status] ?? general, respuesta.status, codigo);
        });
    }

    /** `code` del cuerpo JSON de error, o null si no hay uno legible. No expone el resto del cuerpo. */
    #codigoDeError(respuesta) {
        return new Promise(resolve => {
            if (!respuesta.headers.get("Content-Type")?.includes("application/json")) {
                resolve(null);
                return;
            }
            resolve(respuesta.json().then(({ code }) => (typeof code === "string" && code ? code : null)));
        }).catch(() => null);
    }

    #leerJson(respuesta, mensaje) {
        return new Promise(resolve => {
            if (!respuesta.headers.get("Content-Type")?.includes("application/json")) throw new Error();
            resolve(respuesta.json());
        }).catch(() => {
            throw new AuthError(mensaje);
        });
    }

    #normalizarTipos(datos, mensaje) {
        if (!Array.isArray(datos)) throw new AuthError(mensaje);
        const opcional = valor => (typeof valor === "string" && valor.trim() ? valor : null);
        return datos
            .filter(tipo => tipo && typeof tipo.idTipoDocumento === "string" && Validaciones.UUID.test(tipo.idTipoDocumento)
                && Validaciones.esTexto(tipo.nombre) && tipo.activo !== false)
            .map(tipo => Object.freeze({
                idTipoDocumento: tipo.idTipoDocumento,
                nombre: tipo.nombre.trim(),
                indicaciones: opcional(tipo.indicaciones),
                expresionRegular: opcional(tipo.expresionRegular),
            }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    }

    /** Valida la respuesta de /auth/me y la guarda como sesión actual; si no es válida, lanza AuthError. */
    #validarSesion(sesion) {
        const identificador = valor => typeof valor === "string" && Validaciones.UUID.test(valor);
        const { usuario, rolActivo, csrfToken } = sesion ?? {};
        const rolInvalido = rolActivo !== null && (rolActivo === undefined || !identificador(rolActivo?.idPersonaRol)
            || !identificador(rolActivo?.idClinica)
            || !(rolActivo.codigo === null || Validaciones.esTexto(rolActivo.codigo))
            || !(rolActivo.nombreRol == null || typeof rolActivo.nombreRol === "string")
            || !Validaciones.esTexto(rolActivo.nombreClinica));
        if (!identificador(usuario?.idUsuario) || !identificador(usuario?.idPersona)
            || usuario.idUsuario !== usuario.idPersona || !Validaciones.esTexto(usuario?.nombres)
            || typeof usuario.apellidos !== "string" || rolInvalido
            || !Validaciones.esTexto(csrfToken) || /[\r\n]/.test(csrfToken)) {
            throw new AuthError("No pudimos cargar tu acceso. Comunícate con tu clínica.");
        }
        this.#sesionActual = sesion;
        return sesion;
    }
}

/** Instancia única: la sesión es una sola en toda la app. */
export const auth = new AuthService();
