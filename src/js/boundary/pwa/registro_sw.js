/** Registro del service worker (src/sw.js), cuyo alcance es toda la carpeta src/. */
const URL_SW = new URL("../../../sw.js", import.meta.url);

export class RegistroServiceWorker {
    /** Devuelve el registro, o null si el navegador no admite service workers o el registro falla. */
    static registrar(opciones = {}) {
        return new Promise(resolve => {
            const { navegador = globalThis.navigator, url = URL_SW } = opciones;
            if (!navegador?.serviceWorker) {
                resolve(null);
                return;
            }
            // updateViaCache "none": el navegador revisa sw.js y sus importScripts sin usar la caché HTTP.
            resolve(new Promise(registrar => registrar(navegador.serviceWorker.register(url.href,
                { scope: new URL("./", url).href, updateViaCache: "none" })))
                .then(registro => RegistroServiceWorker.#registrado(navegador, registro))
                .catch(error => {
                    console.warn("No se pudo registrar el service worker:", error?.message);
                    return null;
                }));
        });
    }

    /** Tras registrar: pide al SW que reclame la página o renueve la copia, según corresponda. */
    static #registrado(navegador, registro) {
        // Ctrl+Shift+R deja la página sin control aunque haya un SW activo (activate no se repite y
        // no hay claim): sin red, las hojas de estilo de las vistas fallarían. Se le pide que la reclame.
        // En la primera instalación `active` es null y el claim de activate ya la toma.
        if (!navegador.serviceWorker.controller && registro?.active) registro.active.postMessage({ tipo: "reclamar" });
        // Cada inicio con red renueva la copia sin conexión (el SW solo cambia a ella si quedó
        // completa). Sin red no se pide nada y nada se borra.
        if (navegador.onLine === true && registro?.active) registro.active.postMessage({ tipo: "renovar" });
        return registro;
    }
}
