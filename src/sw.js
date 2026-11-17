/* Service worker de ChivoMed. Toda la lógica está en js/boundary/pwa/sw_logica.js (probada con node --test). */
importScripts("./js/boundary/pwa/sw_logica.js");

const { responder, precachear, limpiarVersionesViejas, atenderMensaje } = self.ChivoMedSW;
const base = self.registration.scope;

self.addEventListener("install", event => {
    event.waitUntil(precachear({ caches, base }).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
    event.waitUntil(limpiarVersionesViejas(caches).then(() => self.clients.claim()));
});

// Una página sin control (cargada con Ctrl+Shift+R) pide que se la reclame, y cada inicio con red
// pide renovar la copia sin conexión; ver registro_sw.js.
self.addEventListener("message", event => {
    const promesa = atenderMensaje(event.data, { clients: self.clients, caches, fetch: solicitud => fetch(solicitud), base });
    if (promesa) event.waitUntil(promesa);
});

self.addEventListener("fetch", event => {
    const respuesta = responder(event.request, { fetch: solicitud => fetch(solicitud), caches, base });
    if (respuesta) event.respondWith(respuesta);
});
