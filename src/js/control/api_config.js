// Misma configuración que utilizan los servicios del frontend del equipo.
export const API_CONFIG = {
    baseUrl: globalThis.CHIVOMED_CONFIG?.baseUrl
        ?? (typeof process !== "undefined" ? process.env?.API_URL : undefined)
        ?? "/galenosv/api",
    credentials: "include",
};
