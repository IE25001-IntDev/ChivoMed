/** Configurar antes de crear los servicios si cambia el despliegue de GalenoSV. */
export const API_CONFIG = {
    baseUrl: (typeof window !== "undefined")
        ? "/galenosv/api"
        : (process.env?.API_URL || "http://localhost:9080/galenosv/api"),
    credentials: "include",
};
