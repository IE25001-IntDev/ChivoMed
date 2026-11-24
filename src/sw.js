/* Service worker de ChivoMed. Toda la lógica está en js/boundary/pwa/sw_logica.js (probada con node --test). */
importScripts("./js/boundary/pwa/sw_logica.js");

// Clase LogicaServiceWorker: se llaman sus métodos estáticos, sin desestructurarlos.
const sw = self.ChivoMedSW;
const base = self.registration.scope;

self.addEventListener("install", event => {
    event.waitUntil(sw.precachear({ caches, base }).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
    event.waitUntil(sw.limpiarVersionesViejas(caches).then(() => self.clients.claim()));
});

// Una página sin control (cargada con Ctrl+Shift+R) pide que se la reclame, y cada inicio con red
// pide renovar la copia sin conexión; ver registro_sw.js.
self.addEventListener("message", event => {
    // Al subir la VERSION, el SW anterior puede seguir renovando cuando el nuevo ya está activo.
    const esActiva = () => !self.serviceWorker || self.registration.active === self.serviceWorker;
    const promesa = sw.atenderMensaje(event.data, { clients: self.clients, caches, fetch: solicitud => fetch(solicitud), base, esActiva });
    if (promesa) event.waitUntil(promesa);
});

self.addEventListener("fetch", event => {
    const respuesta = sw.responder(event.request, { fetch: solicitud => fetch(solicitud), caches, base });
    if (respuesta) event.respondWith(respuesta);
});
