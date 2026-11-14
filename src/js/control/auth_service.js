import { API_CONFIG } from "./api_config.js";

/**
 * Regla de empleado (B8): cualquier rol activo excepto Paciente, incluso un rol sin código.
 * El código solo sirve para reconocer PACIENTE; para mostrar el rol se usa `nombreRol`.
 */
export const CODIGO_PACIENTE = "PACIENTE";
export const ROL_SIN_NOMBRE = "Rol sin nombre";

/** true si la sesión tiene un rol activo que no es PACIENTE. */
export function esEmpleado(sesion) {
    const rol = sesion?.rolActivo;
    return Boolean(rol) && typeof rol.idPersonaRol === "string" && rol.codigo !== CODIGO_PACIENTE;
}

/** Nombre visible del rol activo; un rol sin nombre muestra un texto neutro, nunca el código. */
export function nombreDeRol(rolActivo) {
    return typeof rolActivo?.nombreRol === "string" && rolActivo.nombreRol.trim() ? rolActivo.nombreRol.trim() : ROL_SIN_NOMBRE;
}

let sesionActual;
let sesionVista;
export function fijarSesionVista(sesion) { sesionVista = sesion; }
export async function verificarSesionActual() {
    const anterior = sesionVista ?? sesionActual;
    const actual = await obtenerSesion();
    if (anterior && (actual.usuario.idUsuario !== anterior.usuario.idUsuario
        || actual.rolActivo.idPersonaRol !== anterior.rolActivo.idPersonaRol
        || actual.rolActivo.idClinica !== anterior.rolActivo.idClinica)) {
        throw new AuthError("La sesión cambió. Recarga la página antes de guardar.", 409);
    }
    return actual;
}

export class AuthError extends Error {
    /** `code` "conexion.error" marca que no hubo respuesta (sin red o tiempo agotado), como en DefaultError. */
    constructor(message, status = 0, code = null) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

export const CODIGO_SIN_RED = "conexion.error";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NUMERO_DOCUMENTO = 50;

const MENSAJES = Object.freeze({
    login: {
        400: "Revisa el tipo y el número de documento.",
        401: "No reconocemos ese documento como personal activo de una clínica.",
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

/** `code` del cuerpo JSON de error, o null si no hay uno legible. No expone el resto del cuerpo. */
async function codigoDeError(respuesta) {
    try {
        if (!respuesta.headers.get("Content-Type")?.includes("application/json")) return null;
        const { code } = await respuesta.json();
        return typeof code === "string" && code ? code : null;
    } catch {
        return null;
    }
}

/**
 * @param {string} ruta relativa a la API, p. ej. "auth/me" o "publico/tipos-documento"
 * @param {{ method?: string, datos?: unknown, csrfToken?: string, tipo?: "login"|"sesion"|"publico" }} opciones
 *   `tipo` elige los mensajes; solo las rutas de sesión avisan "sesion-expirada" ante un 401.
 */
async function solicitar(ruta, { method = "GET", datos, csrfToken, tipo = "sesion" } = {}) {
    const headers = { Accept: "application/json" };
    if (datos !== undefined) headers["Content-Type"] = "application/json";
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
    let respuesta;
    try {
        respuesta = await fetch(`${API_CONFIG.baseUrl.replace(/\/+$/, "")}/${ruta}`, {
            method, headers,
            body: datos === undefined ? undefined : JSON.stringify(datos),
            credentials: API_CONFIG.credentials,
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(10000),
        });
    } catch (error) {
        throw new AuthError(error.name === "TimeoutError" || error.name === "AbortError"
            ? "La solicitud tardó demasiado. Inténtalo de nuevo."
            : "No pudimos conectar con el servicio. Inténtalo de nuevo.", 0, CODIGO_SIN_RED);
    }
    if (!respuesta.ok) {
        if (respuesta.status === 401 && tipo === "sesion" && typeof document !== "undefined") document.dispatchEvent(new Event("sesion-expirada"));
        const mensajes = {
            ...MENSAJES[tipo],
            404: "El servicio de acceso todavía no está disponible.",
            429: "Hay demasiados intentos. Espera un momento antes de volver a intentarlo.",
        };
        const general = tipo === "publico" ? MENSAJES.publico[400] : "El servicio no está disponible. Inténtalo más tarde.";
        const codigo = await codigoDeError(respuesta);
        const porCodigo = codigo && Object.hasOwn(MENSAJES_POR_CODIGO, codigo) ? MENSAJES_POR_CODIGO[codigo] : null;
        throw new AuthError(porCodigo ?? mensajes[respuesta.status] ?? general, respuesta.status, codigo);
    }
    return respuesta;
}

async function leerJson(respuesta, mensaje) {
    try {
        if (!respuesta.headers.get("Content-Type")?.includes("application/json")) throw new Error();
        return await respuesta.json();
    } catch {
        throw new AuthError(mensaje);
    }
}

/**
 * Tipos de documento activos para el login, sin sesión (GET /publico/tipos-documento).
 * Devuelve objetos con los campos de TipoDocumentoDto, ordenados por nombre.
 */
export async function listarTiposDocumento() {
    const mensaje = "No pudimos cargar los tipos de documento.";
    const datos = await leerJson(await solicitar("publico/tipos-documento", { tipo: "publico" }), mensaje);
    if (!Array.isArray(datos)) throw new AuthError(mensaje);
    const texto = valor => typeof valor === "string" && valor.trim().length > 0;
    const opcional = valor => (typeof valor === "string" && valor.trim() ? valor : null);
    return datos
        .filter(tipo => tipo && typeof tipo.idTipoDocumento === "string" && UUID.test(tipo.idTipoDocumento)
            && texto(tipo.nombre) && tipo.activo !== false)
        .map(tipo => Object.freeze({
            idTipoDocumento: tipo.idTipoDocumento,
            nombre: tipo.nombre.trim(),
            indicaciones: opcional(tipo.indicaciones),
            expresionRegular: opcional(tipo.expresionRegular),
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

// Contrato de /auth/me; la identidad y el rol siempre los decide el backend.
// { usuario: { idUsuario, idPersona, nombres, apellidos },
//   rolActivo: { idPersonaRol, codigo, nombreRol, idClinica, nombreClinica }, csrfToken }
// `codigo` es null en un rol creado sin código y `nombreRol` puede ser null (B8); un PACIENTE
// nunca es rol de sesión.
export async function obtenerSesion() {
    const sesion = await leerJson(await solicitar("auth/me"), "No pudimos verificar tu sesión. Inténtalo de nuevo.");
    const identificador = valor => typeof valor === "string" && UUID.test(valor);
    const texto = valor => typeof valor === "string" && valor.trim().length > 0;
    const { usuario, rolActivo, csrfToken } = sesion ?? {};
    if (!identificador(usuario?.idUsuario) || !identificador(usuario?.idPersona)
        || !texto(usuario?.nombres) || typeof usuario.apellidos !== "string"
        || !identificador(rolActivo?.idPersonaRol) || !identificador(rolActivo?.idClinica)
        || !(rolActivo.codigo === null || texto(rolActivo.codigo)) || rolActivo.codigo === CODIGO_PACIENTE
        || !(rolActivo.nombreRol == null || typeof rolActivo.nombreRol === "string")
        || !texto(rolActivo?.nombreClinica)
        || !texto(csrfToken) || /[\r\n]/.test(csrfToken)) {
        throw new AuthError("No pudimos cargar tu acceso. Comunícate con tu clínica.");
    }
    sesionActual = sesion;
    return sesion;
}

/**
 * Login del personal por documento, sin contraseña (contrato acordado, pendiente en el backend):
 * POST /auth/login con { idTipoDocumento, numeroDocumento } → 204 y cookie de sesión; luego GET /auth/me.
 */
export async function iniciarSesion(idTipoDocumento, numeroDocumento) {
    const numero = typeof numeroDocumento === "string" ? numeroDocumento.trim() : "";
    if (typeof idTipoDocumento !== "string" || !UUID.test(idTipoDocumento)
        || !numero || numero.length > MAX_NUMERO_DOCUMENTO || /[\r\n]/.test(numero)) {
        throw new AuthError(MENSAJES.login[400], 400);
    }
    await solicitar("auth/login", { method: "POST", tipo: "login", datos: { idTipoDocumento, numeroDocumento: numero } });
    return obtenerSesion();
}

export async function cerrarSesion(csrfToken) {
    if (typeof csrfToken !== "string" || !csrfToken.trim() || /[\r\n]/.test(csrfToken)) {
        throw new AuthError("No pudimos verificar tu sesión. Recarga la página.");
    }
    await solicitar("auth/logout", { method: "POST", csrfToken });
    sesionActual = null;
}
