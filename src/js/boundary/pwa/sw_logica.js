/**
 * Lógica del service worker de ChivoMed, sin dependencias del entorno.
 *
 * Es a la vez un script clásico (lo carga sw.js con importScripts) y un módulo ES válido
 * (lo importan las pruebas y caches_cliente.js): no usa import/export y publica su API
 * en globalThis.ChivoMedSW. Recibe fetch y caches por inyección para probarse con dobles.
 *
 * Reglas:
 *  - Solo se responden peticiones GET del mismo origen; el resto lo maneja el navegador.
 *  - Navegaciones → index.html (red primero, precache como respaldo).
 *  - Archivos del shell (lista PRECACHE) → red primero, precache como respaldo. No se reescribe
 *    el precache en tiempo de ejecución: offline siempre hay un conjunto coherente de una versión.
 *  - /galenosv/api/publico/* → red primero; solo los catálogos de CATALOGOS_PUBLICOS se guardan
 *    en caché y se usan como respaldo. Nada de datos clínicos.
 *  - Cualquier otra ruta de la API (auth, escrituras, datos clínicos) → nunca se toca ni se cachea.
 */
(function (raiz) {
    "use strict";

    // Cambiar en cada entrega: crea cachés nuevos y activate borra los anteriores.
    const VERSION = "2026-11-13.15";
    const PREFIJO = "chivomed-";
    const CACHE_SHELL = `${PREFIJO}shell-${VERSION}`;
    const PREFIJO_DATOS = `${PREFIJO}datos-`;
    const CACHE_DATOS = `${PREFIJO_DATOS}${VERSION}`;
    const RUTA_API = "/galenosv/api/";
    const CATALOGOS_PUBLICOS = Object.freeze(["tipos-documento"]);

    /** Rutas relativas al alcance del service worker (la carpeta src/). */
    const PRECACHE = Object.freeze([
        "./index.html",
        "./manifest.webmanifest",
        "./resources/favicon.svg",
        "./resources/iconos/icono-192.png",
        "./resources/iconos/icono-512.png",
        "./resources/iconos/icono-maskable-192.png",
        "./resources/iconos/icono-maskable-512.png",
        "./resources/app.css",
        "./resources/theme.css",
        "./resources/app_shell.css",
        "./resources/vistas.css",
        "./resources/components.css",
        "./resources/pwa.css",
        "./resources/consultas.css",
        "./resources/consulta.css",
        "./resources/citas.css",
        "./js/boundary/theme_init.js",
        "./js/boundary/router.js",
        "./js/boundary/rutas.js",
        "./js/boundary/plantilla.js",
        "./js/boundary/fechas_sv.js",
        "./js/boundary/components/app_shell.js",
        "./js/boundary/components/session_bar.js",
        "./js/boundary/components/theme_toggle.js",
        "./js/boundary/components/component_styles.js",
        "./js/boundary/components/install_prompt.js",
        "./js/boundary/components/estado_conexion.js",
        "./js/boundary/components/consulta/panel_cierre_consulta.js",
        "./js/boundary/components/consulta/panel_examenes_paso.js",
        "./js/boundary/components/consulta/panel_paso_actual.js",
        "./js/boundary/components/citas/indicador_pasos.js",
        "./js/boundary/components/citas/tarjeta_cita.js",
        "./js/boundary/components/dashboard/lista_consultas.js",
        "./js/boundary/components/dashboard/tarjeta_consulta_dashboard.js",
        "./js/boundary/vistas/estilos.js",
        "./js/boundary/vistas/controlador_login.js",
        "./js/boundary/vistas/controlador_citas.js",
        "./js/boundary/vistas/controlador_consulta.js",
        "./js/boundary/vistas/controlador_dashboard.js",
        "./js/boundary/vistas/controlador_consultas.js",
        "./js/boundary/vistas/memoria_vistas.js",
        "./js/boundary/vistas/vista_citas.js",
        "./js/boundary/vistas/vista_login.js",
        "./js/boundary/vistas/vista_dashboard.js",
        "./js/boundary/vistas/vista_consulta.js",
        "./js/boundary/vistas/vista_no_encontrada.js",
        "./js/boundary/vistas/vista_sin_conexion.js",
        "./js/boundary/pwa/sw_logica.js",
        "./js/boundary/pwa/almacen_offline.js",
        "./js/boundary/pwa/caches_cliente.js",
        "./js/boundary/pwa/registro_sw.js",
        "./js/boundary/pwa/controlador_instalacion.js",
        "./js/boundary/pwa/controlador_conexion.js",
        "./js/boundary/pwa/conexion.js",
        "./js/control/auth_service.js",
        "./js/control/api_config.js",
        "./js/control/atencion_service.js",
        "./js/control/citas_publicas_service.js",
        "./js/control/default_service.js",
        "./js/control/estado_reactivo.js",
        "./js/control/formato_documento.js",
        "./js/control/consulta_procedimiento_paso_service.js",
        "./js/control/consulta_procedimiento_service.js",
        "./js/control/consulta_service.js",
        "./js/control/examen_resultado_service.js",
        "./js/control/orden_examen_service.js",
        "./js/control/procedimiento_paso_examen_service.js",
        "./js/control/procedimiento_paso_secuencia_service.js",
        "./js/control/procedimiento_paso_service.js",
        "./js/entities/atencion.js",
        "./js/entities/default_entity.js",
        "./js/entities/default_error.js",
        "./js/entities/default_response.js",
        "./js/entities/consulta.js",
        "./js/entities/consulta_procedimiento.js",
        "./js/entities/consulta_procedimiento_paso.js",
        "./js/entities/examen.js",
        "./js/entities/examen_resultado.js",
        "./js/entities/orden_examen.js",
        "./js/entities/procedimiento_paso.js",
        "./js/entities/procedimiento_paso_examen.js",
        "./js/entities/procedimiento_paso_secuencia.js",
    ]);

    const ESTRATEGIAS = Object.freeze({
        SHELL: "shell",
        RED_PRIMERO_SHELL: "red-primero-shell",
        PUBLICO: "publico",
        NINGUNA: "ninguna",
    });

    function rutasPrecache(base) {
        return new Set(PRECACHE.map(ruta => new URL(ruta, base).pathname));
    }

    /** Decide la estrategia de una petición { method, url, mode } para un alcance `base`. */
    function clasificar(solicitud, base) {
        if ((solicitud.method ?? "GET").toUpperCase() !== "GET") return ESTRATEGIAS.NINGUNA;
        let url;
        try { url = new URL(solicitud.url); } catch { return ESTRATEGIAS.NINGUNA; }
        const alcance = new URL(base);
        if (url.origin !== alcance.origin) return ESTRATEGIAS.NINGUNA;
        if (url.pathname.startsWith(RUTA_API)) {
            return url.pathname.startsWith(`${RUTA_API}publico/`) ? ESTRATEGIAS.PUBLICO : ESTRATEGIAS.NINGUNA;
        }
        if (!url.pathname.startsWith(alcance.pathname)) return ESTRATEGIAS.NINGUNA;
        if (solicitud.mode === "navigate") return ESTRATEGIAS.SHELL;
        if (!url.search && rutasPrecache(base).has(url.pathname)) return ESTRATEGIAS.RED_PRIMERO_SHELL;
        return ESTRATEGIAS.NINGUNA;
    }

    /** Solo los catálogos públicos permitidos, sin query, se pueden guardar en caché. */
    function esCatalogoCacheable(urlTexto) {
        const url = new URL(urlTexto);
        const recurso = url.pathname.slice(`${RUTA_API}publico/`.length).replace(/\/+$/, "");
        return url.pathname.startsWith(`${RUTA_API}publico/`) && !url.search && CATALOGOS_PUBLICOS.includes(recurso);
    }

    function respuestaSinRed(tipo) {
        if (tipo === "json") {
            return new Response(JSON.stringify({ code: "sin.red", message: "Sin conexión a internet." }), {
                status: 503, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
            });
        }
        return new Response("Sin conexión a internet.", {
            status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        });
    }

    async function desdePrecache(urlTexto, caches) {
        const cache = await caches.open(CACHE_SHELL);
        return cache.match(urlTexto);
    }

    /** Navegación: siempre index.html; red primero para ver cambios, precache si no hay red. */
    async function servirShell(base, { fetch, caches }) {
        const indice = new URL("./index.html", base).href;
        try {
            const respuesta = await fetch(indice);
            if (respuesta.ok) return respuesta;
            return (await desdePrecache(indice, caches)) ?? respuesta;
        } catch {
            return (await desdePrecache(indice, caches)) ?? respuestaSinRed("texto");
        }
    }

    async function servirRedPrimeroShell(solicitud, { fetch, caches }) {
        try {
            const respuesta = await fetch(solicitud);
            if (respuesta.ok) return respuesta;
            return (await desdePrecache(solicitud.url, caches)) ?? respuesta;
        } catch {
            return (await desdePrecache(solicitud.url, caches)) ?? respuestaSinRed("texto");
        }
    }

    async function servirPublico(solicitud, { fetch, caches }) {
        const cacheable = esCatalogoCacheable(solicitud.url);
        try {
            const respuesta = await fetch(solicitud);
            const esJson = respuesta.headers.get("Content-Type")?.includes("application/json");
            if (cacheable && respuesta.status === 200 && esJson) {
                const cache = await caches.open(CACHE_DATOS);
                await cache.put(solicitud.url, respuesta.clone());
            }
            return respuesta;
        } catch {
            if (cacheable) {
                const cache = await caches.open(CACHE_DATOS);
                const guardada = await cache.match(solicitud.url);
                if (guardada) return guardada;
            }
            return respuestaSinRed("json");
        }
    }

    /** Devuelve una promesa de Response, o null si el navegador debe manejar la petición solo. */
    function responder(solicitud, { fetch, caches, base }) {
        switch (clasificar(solicitud, base)) {
            case ESTRATEGIAS.SHELL: return servirShell(base, { fetch, caches });
            case ESTRATEGIAS.RED_PRIMERO_SHELL: return servirRedPrimeroShell(solicitud, { fetch, caches });
            case ESTRATEGIAS.PUBLICO: return servirPublico(solicitud, { fetch, caches });
            default: return null;
        }
    }

    /** Descarga la lista completa; si un archivo falla, falla la instalación (addAll es atómico). */
    async function precachear({ caches, base, crearSolicitud = url => new Request(url, { cache: "reload" }) }) {
        const cache = await caches.open(CACHE_SHELL);
        await cache.addAll(PRECACHE.map(ruta => crearSolicitud(new URL(ruta, base).href)));
    }

    /** Borra los cachés de ChivoMed de otras versiones. Devuelve los nombres borrados. */
    async function limpiarVersionesViejas(caches) {
        const vigentes = new Set([CACHE_SHELL, CACHE_DATOS]);
        const viejos = (await caches.keys()).filter(nombre => nombre.startsWith(PREFIJO) && !vigentes.has(nombre));
        await Promise.all(viejos.map(nombre => caches.delete(nombre)));
        return viejos;
    }

    /** Borra todos los cachés de datos (de cualquier versión). Se usa al cerrar sesión. */
    async function limpiarDatos(caches) {
        const datos = (await caches.keys()).filter(nombre => nombre.startsWith(PREFIJO_DATOS));
        await Promise.all(datos.map(nombre => caches.delete(nombre)));
        return datos;
    }

    raiz.ChivoMedSW = Object.freeze({
        VERSION, CACHE_SHELL, CACHE_DATOS, PREFIJO, PREFIJO_DATOS, RUTA_API, CATALOGOS_PUBLICOS, PRECACHE, ESTRATEGIAS,
        clasificar, esCatalogoCacheable, responder, precachear, limpiarVersionesViejas, limpiarDatos,
    });
})(globalThis);
