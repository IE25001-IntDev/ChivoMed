/** Limpieza de cachés desde la página (no depende de que el service worker esté activo). */
import "../boundary/pwa/sw_logica.js";

export class CachesCliente {
    /** Borra los cachés con datos (catálogos públicos). Se llama al cerrar o perder la sesión. */
    static limpiarCachesDeDatos(cachesApi = globalThis.caches) {
        if (!cachesApi) return Promise.resolve([]);
        return globalThis.ChivoMedSW.limpiarDatos(cachesApi).catch(() => []);
    }
}
