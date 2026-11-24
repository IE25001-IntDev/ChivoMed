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
 *  - Archivos del shell (lista PRECACHE) → red primero, precache como respaldo. El fetch no
 *    reescribe el precache: offline siempre hay un conjunto coherente.
 *  - Renovación ({ tipo: "renovar" }, en cada inicio con red): descarga de nuevo todo el precache y
 *    los catálogos públicos en cachés nuevos (`…-{generación}`). Solo si la copia queda completa y
 *    esta versión sigue siendo la activa se apunta a ella (caché CACHE_VIGENTE) y se borran las
 *    demás de su misma versión (las de otras versiones las borra limpiarVersionesViejas al
 *    activarse); si falla, o ya hay otra versión activa, se descarta y se conserva lo anterior. `cachesVigentes()` dice siempre de dónde servir; sin puntero, los de la instalación.
 *  - /galenosv/api/publico/* → red primero; solo los catálogos de CATALOGOS_PUBLICOS se guardan
 *    en caché y se usan como respaldo (sin red o con un 502/503/504), marcados con la cabecera
 *    CABECERA_COPIA. Nada de datos clínicos.
 *  - Cualquier otra ruta de la API (auth, escrituras, datos clínicos) → nunca se toca ni se cachea.
 */
(function (raiz) {
    "use strict";

    // Cambiar en cada entrega: crea cachés nuevos y activate borra los anteriores.
    const VERSION = "2026-11-24.2";
    const PREFIJO = "chivomed-";
    const CACHE_SHELL = `${PREFIJO}shell-${VERSION}`;
    const PREFIJO_DATOS = `${PREFIJO}datos-`;
    const CACHE_DATOS = `${PREFIJO_DATOS}${VERSION}`;
    const RUTA_API = "/galenosv/api/";
    const CATALOGOS_PUBLICOS = Object.freeze(["tipos-documento"]);
    /** Caché con la entrada de esta versión: { shell, datos } de la copia vigente (las de otras se borran). */
    const CACHE_VIGENTE = `${PREFIJO}vigente`;
    const CLAVE_VIGENTE = `https://chivomed.vigente/${VERSION}`;
    /** Marca una respuesta servida desde la copia: la página no la cuenta como respuesta del backend. */
    const CABECERA_COPIA = "X-ChivoMed-Copia";
    /** Respuestas que significan que el backend no responde (como STATUS_SIN_SERVIDOR de auth_service.js). */
    const STATUS_SIN_SERVIDOR = Object.freeze([502, 503, 504]);

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
        "./js/control/consulta_service.js",
        "./js/control/orden_examen_service.js",
        "./js/control/procedimiento_paso_service.js",
        "./js/entities/atencion.js",
        "./js/entities/default_entity.js",
        "./js/entities/default_error.js",
        "./js/entities/default_response.js",
        "./js/entities/consulta.js",
        "./js/entities/consulta_procedimiento_paso.js",
        "./js/entities/orden_examen.js",
        "./js/entities/procedimiento_paso.js",
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

    /** Nombres { shell, datos } de la copia vigente de esta versión; los de la instalación si no hay. */
    async function cachesVigentes(caches) {
        try {
            // Abrir crea el caché: solo se abre si ya existe.
            if (!(await caches.keys()).includes(CACHE_VIGENTE)) return { shell: CACHE_SHELL, datos: CACHE_DATOS };
            const guardado = await (await caches.open(CACHE_VIGENTE)).match(CLAVE_VIGENTE);
            const { shell, datos } = guardado ? await guardado.json() : {};
            if (typeof shell === "string" && shell.startsWith(`${CACHE_SHELL}-`)
                && typeof datos === "string" && datos.startsWith(`${CACHE_DATOS}-`)) return { shell, datos };
        } catch { /* Sin puntero legible se usan los de la instalación. */ }
        return { shell: CACHE_SHELL, datos: CACHE_DATOS };
    }

    /** Deja en el puntero (CACHE_VIGENTE) solo la entrada de esta versión, si existe el caché. */
    async function limpiarPuntero(caches) {
        if (!(await caches.keys()).includes(CACHE_VIGENTE)) return;
        const puntero = await caches.open(CACHE_VIGENTE);
        const viejas = (await puntero.keys()).filter(solicitud => solicitud.url !== CLAVE_VIGENTE);
        await Promise.all(viejas.map(solicitud => puntero.delete(solicitud)));
    }

    async function desdePrecache(urlTexto, caches) {
        const cache = await caches.open((await cachesVigentes(caches)).shell);
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

    /** La misma respuesta con la cabecera CABECERA_COPIA (las de Cache Storage no se pueden modificar). */
    function marcarCopia(respuesta) {
        const headers = new Headers(respuesta.headers);
        headers.set(CABECERA_COPIA, "1");
        return new Response(respuesta.body, { status: respuesta.status, statusText: respuesta.statusText, headers });
    }

    /** La copia guardada del catálogo, marcada como copia, o null si no es cacheable o no hay. */
    async function copiaPublica(solicitud, cacheable, caches) {
        if (!cacheable) return null;
        const cache = await caches.open((await cachesVigentes(caches)).datos);
        const guardada = await cache.match(solicitud.url);
        return guardada ? marcarCopia(guardada) : null;
    }

    async function servirPublico(solicitud, { fetch, caches }) {
        const cacheable = esCatalogoCacheable(solicitud.url);
        let respuesta;
        try {
            respuesta = await fetch(solicitud);
        } catch {
            return (await copiaPublica(solicitud, cacheable, caches)) ?? respuestaSinRed("json");
        }
        // 502, 503 y 504: el backend no responde (p. ej. el proxy sin backend); igual que sin red.
        if (STATUS_SIN_SERVIDOR.includes(respuesta.status)) {
            return (await copiaPublica(solicitud, cacheable, caches)) ?? respuesta;
        }
        const esJson = respuesta.headers.get("Content-Type")?.includes("application/json");
        if (cacheable && respuesta.status === 200 && esJson) {
            const cache = await caches.open((await cachesVigentes(caches)).datos);
            await cache.put(solicitud.url, respuesta.clone());
        }
        return respuesta;
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

    let generaciones = 0;
    let renovacionEnCurso = null;

    /** true si `nombre` es un caché de esta versión: el de la instalación o una de sus generaciones. */
    function esDeEstaVersion(nombre) {
        return [CACHE_SHELL, CACHE_DATOS].some(base => nombre === base || nombre.startsWith(`${base}-`));
    }

    /**
     * Renueva la copia sin conexión. Resuelve true si cambió a una copia nueva completa y false si
     * algo falló (sin red, un archivo o un catálogo) o si al terminar `esActiva()` dice que ya hay
     * otra versión activa: entonces se descarta lo nuevo y no se borra nada más. Mientras hay una en
     * curso, otra llamada (otra pestaña) recibe la misma promesa.
     */
    function renovar(opciones) {
        renovacionEnCurso ??= ejecutarRenovacion(opciones).finally(() => { renovacionEnCurso = null; });
        return renovacionEnCurso;
    }

    async function ejecutarRenovacion({ caches, fetch, base, esActiva = () => true, crearSolicitud = url => new Request(url, { cache: "reload" }) }) {
        const generacion = `${Date.now()}-${++generaciones}`;
        const nuevos = { shell: `${CACHE_SHELL}-${generacion}`, datos: `${CACHE_DATOS}-${generacion}` };
        const descargar = async (url, valida) => {
            const respuesta = await fetch(crearSolicitud(url));
            if (!valida(respuesta)) throw new Error(`Descarga incompleta: ${url}`);
            return [url, respuesta];
        };
        try {
            const archivos = await Promise.all(PRECACHE.map(ruta => descargar(new URL(ruta, base).href, r => r.ok)));
            const catalogos = await Promise.all(CATALOGOS_PUBLICOS.map(nombre => descargar(
                new URL(`${RUTA_API}publico/${nombre}`, base).href,
                r => r.status === 200 && Boolean(r.headers.get("Content-Type")?.includes("application/json")))));
            const shell = await caches.open(nuevos.shell);
            for (const [url, respuesta] of archivos) await shell.put(url, respuesta);
            const datos = await caches.open(nuevos.datos);
            for (const [url, respuesta] of catalogos) await datos.put(url, respuesta);
            // Otra versión se activó mientras se descargaba: el puntero y sus cachés son suyos.
            if (!esActiva()) throw new Error("Ya hay otra versión activa.");
            await (await caches.open(CACHE_VIGENTE)).put(CLAVE_VIGENTE, new Response(JSON.stringify(nuevos), {
                headers: { "Content-Type": "application/json" },
            }));
        } catch {
            await Promise.all([caches.delete(nuevos.shell), caches.delete(nuevos.datos)]);
            return false;
        }
        const conservar = new Set([nuevos.shell, nuevos.datos]);
        const anteriores = (await caches.keys()).filter(nombre => esDeEstaVersion(nombre) && !conservar.has(nombre));
        await Promise.all(anteriores.map(nombre => caches.delete(nombre)));
        await limpiarPuntero(caches);
        return true;
    }

    /** Borra los cachés de ChivoMed de otras versiones (conserva la copia vigente). Devuelve los borrados. */
    async function limpiarVersionesViejas(caches) {
        const { shell, datos } = await cachesVigentes(caches);
        const vigentes = new Set([CACHE_SHELL, CACHE_DATOS, CACHE_VIGENTE, shell, datos]);
        const viejos = (await caches.keys()).filter(nombre => nombre.startsWith(PREFIJO) && !vigentes.has(nombre));
        await Promise.all(viejos.map(nombre => caches.delete(nombre)));
        await limpiarPuntero(caches);
        return viejos;
    }

    /** Borra todos los cachés de datos (de cualquier versión). Se usa al cerrar sesión. */
    async function limpiarDatos(caches) {
        const datos = (await caches.keys()).filter(nombre => nombre.startsWith(PREFIJO_DATOS));
        await Promise.all(datos.map(nombre => caches.delete(nombre)));
        return datos;
    }

    /**
     * Mensaje de una página. { tipo: "reclamar" }: una página cargada con Ctrl+Shift+R queda sin
     * control del SW y activate no vuelve a correr; clients.claim() la toma para que, sin red, sus
     * hojas de estilo y módulos salgan del precache. { tipo: "renovar" }: la página arrancó con red
     * y pide renovar la copia sin conexión; `esActiva()` dice si esta versión sigue siendo la activa.
     * Devuelve la promesa, o null si se ignora.
     */
    function atenderMensaje(datos, { clients, caches, fetch, base, esActiva }) {
        if (datos?.tipo === "reclamar") return clients.claim();
        if (datos?.tipo === "renovar" && caches && fetch && base) return renovar({ caches, fetch, base, esActiva });
        return null;
    }

    raiz.ChivoMedSW = Object.freeze({
        VERSION, CACHE_SHELL, CACHE_DATOS, CACHE_VIGENTE, CABECERA_COPIA, STATUS_SIN_SERVIDOR, PREFIJO, PREFIJO_DATOS, RUTA_API, CATALOGOS_PUBLICOS, PRECACHE, ESTRATEGIAS,
        clasificar, esCatalogoCacheable, responder, precachear, limpiarVersionesViejas, limpiarDatos, atenderMensaje,
        cachesVigentes, renovar,
    });
})(globalThis);
