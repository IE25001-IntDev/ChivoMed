/** Registro del service worker (src/sw.js), cuyo alcance es toda la carpeta src/. */
export const URL_SW = new URL("../../../sw.js", import.meta.url);

/** Devuelve el registro, o null si el navegador no admite service workers o el registro falla. */
export async function registrarServiceWorker({ navegador = globalThis.navigator, url = URL_SW } = {}) {
    if (!navegador?.serviceWorker) return null;
    try {
        // updateViaCache "none": el navegador revisa sw.js y sus importScripts sin usar la caché HTTP.
        return await navegador.serviceWorker.register(url.href, { scope: new URL("./", url).href, updateViaCache: "none" });
    } catch (error) {
        console.warn("No se pudo registrar el service worker:", error?.message);
        return null;
    }
}
