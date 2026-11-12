/** Limpieza de cachés desde la página (no depende de que el service worker esté activo). */
import "./sw_logica.js";

/** Borra los cachés con datos (catálogos públicos). Se llama al cerrar o perder la sesión. */
export function limpiarCachesDeDatos(cachesApi = globalThis.caches) {
    if (!cachesApi) return Promise.resolve([]);
    return globalThis.ChivoMedSW.limpiarDatos(cachesApi).catch(() => []);
}
