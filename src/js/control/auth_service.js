import { API_CONFIG } from "./api_config.js";

export const ROLES = Object.freeze({
    ADMINISTRACION: "Administración",
    DOCTOR: "Doctor",
    PACIENTE: "Paciente",
});

export class AuthError extends Error {
    constructor(message, status = 0) {
        super(message);
        this.status = status;
    }
}

async function solicitar(ruta, { method = "GET", datos, csrfToken } = {}) {
    const headers = { Accept: "application/json" };
    if (datos !== undefined) headers["Content-Type"] = "application/json";
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
    let respuesta;
    try {
        respuesta = await fetch(`${API_CONFIG.baseUrl.replace(/\/+$/, "")}/auth/${ruta}`, {
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
            : "No pudimos conectar con el servicio. Inténtalo de nuevo.");
    }
    if (!respuesta.ok) {
        const mensajes = {
            400: "Revisa tu usuario o correo y contraseña.",
            401: ruta === "login" ? "Usuario o contraseña incorrectos." : "Tu sesión ha finalizado. Vuelve a iniciar sesión.",
            403: "No fue posible autorizar tu acceso. Comunícate con tu clínica.",
            404: "El servicio de acceso todavía no está disponible.",
            429: "Hay demasiados intentos. Espera un momento antes de volver a intentarlo.",
        };
        throw new AuthError(mensajes[respuesta.status] ?? "El servicio no está disponible. Inténtalo más tarde.", respuesta.status);
    }
    return respuesta;
}

// Contrato propuesto de /auth/me; la identidad y el rol siempre los decide el backend.
// { usuario: { idUsuario, idPersona, nombres, apellidos },
//   rolActivo: { idPersonaRol, codigo, idClinica, nombreClinica }, csrfToken }
export async function obtenerSesion() {
    const respuesta = await solicitar("me");
    let sesion;
    try {
        if (!respuesta.headers.get("Content-Type")?.includes("application/json")) throw new Error();
        sesion = await respuesta.json();
    } catch {
        throw new AuthError("No pudimos verificar tu sesión. Inténtalo de nuevo.");
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const identificador = valor => typeof valor === "string" && uuid.test(valor);
    const texto = valor => typeof valor === "string" && valor.trim().length > 0;
    const { usuario, rolActivo, csrfToken } = sesion ?? {};
    if (!identificador(usuario?.idUsuario) || !identificador(usuario?.idPersona)
        || !texto(usuario?.nombres) || typeof usuario.apellidos !== "string"
        || !identificador(rolActivo?.idPersonaRol) || !identificador(rolActivo?.idClinica)
        || typeof rolActivo?.codigo !== "string" || !Object.hasOwn(ROLES, rolActivo.codigo)
        || !texto(rolActivo?.nombreClinica)
        || !texto(csrfToken) || /[\r\n]/.test(csrfToken)) {
        throw new AuthError("No pudimos cargar tu acceso. Comunícate con tu clínica.");
    }
    return sesion;
}

export async function iniciarSesion(identificador, password) {
    await solicitar("login", { method: "POST", datos: { identificador, password } });
    return obtenerSesion();
}

export async function cerrarSesion(csrfToken) {
    if (typeof csrfToken !== "string" || !csrfToken.trim() || /[\r\n]/.test(csrfToken)) {
        throw new AuthError("No pudimos verificar tu sesión. Recarga la página.");
    }
    await solicitar("logout", { method: "POST", csrfToken });
}
