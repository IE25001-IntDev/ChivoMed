/* Service worker de ChivoMed. Toda la lógica está en js/boundary/pwa/sw_logica.js (probada con node --test). */
importScripts("./js/boundary/pwa/sw_logica.js");

const { responder, precachear, limpiarVersionesViejas } = self.ChivoMedSW;
const base = self.registration.scope;

self.addEventListener("install", event => {
    event.waitUntil(precachear({ caches, base }).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
    event.waitUntil(limpiarVersionesViejas(caches).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
    const respuesta = responder(event.request, { fetch: solicitud => fetch(solicitud), caches, base });
    if (respuesta) event.respondWith(respuesta);
});
