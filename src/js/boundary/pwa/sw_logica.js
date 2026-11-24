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
 *  - /galeno/api/publico/* → red primero; solo los catálogos de CATALOGOS_PUBLICOS se guardan
 *    en caché y se usan como respaldo (sin red o con un 502/503/504), marcados con la cabecera
 *    CABECERA_COPIA. Nada de datos clínicos.
 *  - Cualquier otra ruta de la API (auth, escrituras, datos clínicos) → nunca se toca ni se cachea.
 */
(function (raiz) {
    "use strict";

    /**
     * Toda la lógica es estática y cada método nombra la clase (nunca `this`), así sw.js y las
     * pruebas pueden llamar a ChivoMedSW.metodo(...) o pasar un método suelto sin perder nada.
     */
    class LogicaServiceWorker {
        // Cambiar en cada entrega: crea cachés nuevos y activate borra los anteriores.
        static VERSION = "2026-11-24.4";
        static PREFIJO = "chivomed-";
        static CACHE_SHELL = `${LogicaServiceWorker.PREFIJO}shell-${LogicaServiceWorker.VERSION}`;
        static PREFIJO_DATOS = `${LogicaServiceWorker.PREFIJO}datos-`;
        static CACHE_DATOS = `${LogicaServiceWorker.PREFIJO_DATOS}${LogicaServiceWorker.VERSION}`;
        static RUTA_API = "/galeno/api/";
        static CATALOGOS_PUBLICOS = Object.freeze(["tipos-documento"]);
        /** Caché con la entrada de esta versión: { shell, datos } de la copia vigente (las de otras se borran). */
        static CACHE_VIGENTE = `${LogicaServiceWorker.PREFIJO}vigente`;
        static #CLAVE_VIGENTE = `https://chivomed.vigente/${LogicaServiceWorker.VERSION}`;
        /** Marca una respuesta servida desde la copia: la página no la cuenta como respuesta del backend. */
        static CABECERA_COPIA = "X-ChivoMed-Copia";
        /** Respuestas que significan que el backend no responde (como STATUS_SIN_SERVIDOR de auth_service.js). */
        static STATUS_SIN_SERVIDOR = Object.freeze([502, 503, 504]);

        /** Rutas relativas al alcance del service worker (la carpeta src/). */
        static PRECACHE = Object.freeze([
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
            "./js/boundary/estilos.js",
            "./js/boundary/components/app_shell.js",
            "./js/boundary/components/session_bar.js",
            "./js/boundary/components/theme_toggle.js",
            "./js/boundary/components/install_prompt.js",
            "./js/boundary/components/estado_conexion.js",
            "./js/boundary/components/consulta/panel_cierre_consulta.js",
            "./js/boundary/components/consulta/panel_examenes_paso.js",
            "./js/boundary/components/consulta/panel_paso_actual.js",
            "./js/boundary/components/citas/tarjeta_cita.js",
            "./js/boundary/components/citas/ventana_ticket.js",
            "./js/boundary/components/dashboard/lista_consultas.js",
            "./js/boundary/components/dashboard/tarjeta_consulta_dashboard.js",
            "./js/boundary/vistas/vista_citas.js",
            "./js/boundary/vistas/vista_login.js",
            "./js/boundary/vistas/vista_dashboard.js",
            "./js/boundary/vistas/vista_consulta.js",
            "./js/boundary/vistas/vista_aviso.js",
            "./js/boundary/pwa/sw_logica.js",
            "./js/boundary/pwa/registro_sw.js",
            "./js/control/auth_service.js",
            "./js/control/api_config.js",
            "./js/control/atencion_service.js",
            "./js/control/citas_publicas_service.js",
            "./js/control/default_service.js",
            "./js/control/estado_reactivo.js",
            "./js/control/formato_documento.js",
            "./js/control/validaciones.js",
            "./js/control/memoria_vistas.js",
            "./js/control/fechas_sv.js",
            "./js/control/almacen_offline.js",
            "./js/control/caches_cliente.js",
            "./js/control/controlador_instalacion.js",
            "./js/control/controlador_conexion.js",
            "./js/control/conexion.js",
            "./js/control/controladores/controlador_login.js",
            "./js/control/controladores/controlador_citas.js",
            "./js/control/controladores/controlador_consulta.js",
            "./js/control/controladores/controlador_dashboard.js",
            "./js/control/controladores/controlador_consultas.js",
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

        static ESTRATEGIAS = Object.freeze({
            SHELL: "shell",
            RED_PRIMERO_SHELL: "red-primero-shell",
            PUBLICO: "publico",
            NINGUNA: "ninguna",
        });

        static #generaciones = 0;
        static #renovacionEnCurso = null;

        static #rutasPrecache(base) {
            return new Set(LogicaServiceWorker.PRECACHE.map(ruta => new URL(ruta, base).pathname));
        }

        /** Decide la estrategia de una petición { method, url, mode } para un alcance `base`. */
        static clasificar(solicitud, base) {
            if ((solicitud.method ?? "GET").toUpperCase() !== "GET") return LogicaServiceWorker.ESTRATEGIAS.NINGUNA;
            let url;
            try { url = new URL(solicitud.url); } catch { return LogicaServiceWorker.ESTRATEGIAS.NINGUNA; }
            const alcance = new URL(base);
            if (url.origin !== alcance.origin) return LogicaServiceWorker.ESTRATEGIAS.NINGUNA;
            if (url.pathname.startsWith(LogicaServiceWorker.RUTA_API)) {
                return url.pathname.startsWith(`${LogicaServiceWorker.RUTA_API}publico/`) ? LogicaServiceWorker.ESTRATEGIAS.PUBLICO : LogicaServiceWorker.ESTRATEGIAS.NINGUNA;
            }
            if (!url.pathname.startsWith(alcance.pathname)) return LogicaServiceWorker.ESTRATEGIAS.NINGUNA;
            if (solicitud.mode === "navigate") return LogicaServiceWorker.ESTRATEGIAS.SHELL;
            if (!url.search && LogicaServiceWorker.#rutasPrecache(base).has(url.pathname)) return LogicaServiceWorker.ESTRATEGIAS.RED_PRIMERO_SHELL;
            return LogicaServiceWorker.ESTRATEGIAS.NINGUNA;
        }

        /** Solo los catálogos públicos permitidos, sin query, se pueden guardar en caché. */
        static esCatalogoCacheable(urlTexto) {
            const url = new URL(urlTexto);
            const recurso = url.pathname.slice(`${LogicaServiceWorker.RUTA_API}publico/`.length).replace(/\/+$/, "");
            return url.pathname.startsWith(`${LogicaServiceWorker.RUTA_API}publico/`) && !url.search && LogicaServiceWorker.CATALOGOS_PUBLICOS.includes(recurso);
        }

        static #respuestaSinRed(tipo) {
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
        static cachesVigentes(caches) {
            // Abrir crea el caché: solo se abre si ya existe.
            return new Promise(resolve => resolve(caches.keys()))
                .then(claves => {
                    if (!claves.includes(LogicaServiceWorker.CACHE_VIGENTE)) return { shell: LogicaServiceWorker.CACHE_SHELL, datos: LogicaServiceWorker.CACHE_DATOS };
                    return Promise.resolve(caches.open(LogicaServiceWorker.CACHE_VIGENTE))
                        .then(puntero => puntero.match(LogicaServiceWorker.#CLAVE_VIGENTE))
                        .then(guardado => (guardado ? guardado.json() : {}))
                        .then(({ shell, datos }) => {
                            if (typeof shell === "string" && shell.startsWith(`${LogicaServiceWorker.CACHE_SHELL}-`)
                                && typeof datos === "string" && datos.startsWith(`${LogicaServiceWorker.CACHE_DATOS}-`)) return { shell, datos };
                            return { shell: LogicaServiceWorker.CACHE_SHELL, datos: LogicaServiceWorker.CACHE_DATOS };
                        });
                })
                // Sin puntero legible se usan los de la instalación.
                .catch(() => ({ shell: LogicaServiceWorker.CACHE_SHELL, datos: LogicaServiceWorker.CACHE_DATOS }));
        }

        /** Deja en el puntero (CACHE_VIGENTE) solo la entrada de esta versión, si existe el caché. */
        static #limpiarPuntero(caches) {
            return new Promise(resolve => resolve(caches.keys())).then(claves => {
                if (!claves.includes(LogicaServiceWorker.CACHE_VIGENTE)) return undefined;
                return Promise.resolve(caches.open(LogicaServiceWorker.CACHE_VIGENTE)).then(puntero => Promise.resolve(puntero.keys())
                    .then(solicitudes => {
                        const viejas = solicitudes.filter(solicitud => solicitud.url !== LogicaServiceWorker.#CLAVE_VIGENTE);
                        return Promise.all(viejas.map(solicitud => puntero.delete(solicitud)));
                    }))
                    .then(() => undefined);
            });
        }

        static #desdePrecache(urlTexto, caches) {
            return new Promise(resolve => resolve(LogicaServiceWorker.cachesVigentes(caches)))
                .then(({ shell }) => caches.open(shell))
                .then(cache => cache.match(urlTexto));
        }

        /** Navegación: siempre index.html; red primero para ver cambios, precache si no hay red. */
        static #servirShell(base, entorno) {
            return new Promise(resolve => {
                const { fetch, caches } = entorno;
                const indice = new URL("./index.html", base).href;
                // .catch después del .then: el try también envolvía la lectura del precache.
                resolve(new Promise(pedir => pedir(fetch(indice)))
                    .then(respuesta => (respuesta.ok ? respuesta : LogicaServiceWorker.#desdePrecache(indice, caches).then(copia => copia ?? respuesta)))
                    .catch(() => LogicaServiceWorker.#desdePrecache(indice, caches).then(copia => copia ?? LogicaServiceWorker.#respuestaSinRed("texto"))));
            });
        }

        static #servirRedPrimeroShell(solicitud, entorno) {
            return new Promise(resolve => {
                const { fetch, caches } = entorno;
                resolve(new Promise(pedir => pedir(fetch(solicitud)))
                    .then(respuesta => (respuesta.ok ? respuesta : LogicaServiceWorker.#desdePrecache(solicitud.url, caches).then(copia => copia ?? respuesta)))
                    .catch(() => LogicaServiceWorker.#desdePrecache(solicitud.url, caches).then(copia => copia ?? LogicaServiceWorker.#respuestaSinRed("texto"))));
            });
        }

        /** La misma respuesta con la cabecera CABECERA_COPIA (las de Cache Storage no se pueden modificar). */
        static #marcarCopia(respuesta) {
            const headers = new Headers(respuesta.headers);
            headers.set(LogicaServiceWorker.CABECERA_COPIA, "1");
            return new Response(respuesta.body, { status: respuesta.status, statusText: respuesta.statusText, headers });
        }

        /** La copia guardada del catálogo, marcada como copia, o null si no es cacheable o no hay. */
        static #copiaPublica(solicitud, cacheable, caches) {
            if (!cacheable) return Promise.resolve(null);
            return new Promise(resolve => resolve(LogicaServiceWorker.cachesVigentes(caches)))
                .then(({ datos }) => caches.open(datos))
                .then(cache => cache.match(solicitud.url))
                .then(guardada => (guardada ? LogicaServiceWorker.#marcarCopia(guardada) : null));
        }

        static #servirPublico(solicitud, entorno) {
            return new Promise(resolve => {
                const { fetch, caches } = entorno;
                const cacheable = LogicaServiceWorker.esCatalogoCacheable(solicitud.url);
                // Dos argumentos: el try solo envolvía el fetch; lo que sigue propaga sus errores.
                resolve(new Promise(pedir => pedir(fetch(solicitud))).then(respuesta => {
                    // 502, 503 y 504: el backend no responde (p. ej. el proxy sin backend); igual que sin red.
                    if (LogicaServiceWorker.STATUS_SIN_SERVIDOR.includes(respuesta.status)) {
                        return LogicaServiceWorker.#copiaPublica(solicitud, cacheable, caches).then(copia => copia ?? respuesta);
                    }
                    const esJson = respuesta.headers.get("Content-Type")?.includes("application/json");
                    if (cacheable && respuesta.status === 200 && esJson) {
                        return LogicaServiceWorker.cachesVigentes(caches)
                            .then(({ datos }) => caches.open(datos))
                            .then(cache => cache.put(solicitud.url, respuesta.clone()))
                            .then(() => respuesta);
                    }
                    return respuesta;
                }, () => LogicaServiceWorker.#copiaPublica(solicitud, cacheable, caches).then(copia => copia ?? LogicaServiceWorker.#respuestaSinRed("json"))));
            });
        }

        /** Devuelve una promesa de Response, o null si el navegador debe manejar la petición solo. */
        static responder(solicitud, { fetch, caches, base }) {
            switch (LogicaServiceWorker.clasificar(solicitud, base)) {
                case LogicaServiceWorker.ESTRATEGIAS.SHELL: return LogicaServiceWorker.#servirShell(base, { fetch, caches });
                case LogicaServiceWorker.ESTRATEGIAS.RED_PRIMERO_SHELL: return LogicaServiceWorker.#servirRedPrimeroShell(solicitud, { fetch, caches });
                case LogicaServiceWorker.ESTRATEGIAS.PUBLICO: return LogicaServiceWorker.#servirPublico(solicitud, { fetch, caches });
                default: return null;
            }
        }

        /** Descarga la lista completa; si un archivo falla, falla la instalación (addAll es atómico). */
        static precachear(opciones) {
            return new Promise(resolve => {
                const { caches, base, crearSolicitud = url => new Request(url, { cache: "reload" }) } = opciones;
                resolve(Promise.resolve(caches.open(LogicaServiceWorker.CACHE_SHELL))
                    .then(cache => cache.addAll(LogicaServiceWorker.PRECACHE.map(ruta => crearSolicitud(new URL(ruta, base).href))))
                    .then(() => undefined));
            });
        }

        /** true si `nombre` es un caché de esta versión: el de la instalación o una de sus generaciones. */
        static #esDeEstaVersion(nombre) {
            return [LogicaServiceWorker.CACHE_SHELL, LogicaServiceWorker.CACHE_DATOS].some(base => nombre === base || nombre.startsWith(`${base}-`));
        }

        /**
         * Renueva la copia sin conexión. Resuelve true si cambió a una copia nueva completa y false si
         * algo falló (sin red, un archivo o un catálogo) o si al terminar `esActiva()` dice que ya hay
         * otra versión activa: entonces se descarta lo nuevo y no se borra nada más. Mientras hay una en
         * curso, otra llamada (otra pestaña) recibe la misma promesa.
         */
        static renovar(opciones) {
            LogicaServiceWorker.#renovacionEnCurso ??= LogicaServiceWorker.#ejecutarRenovacion(opciones).finally(() => { LogicaServiceWorker.#renovacionEnCurso = null; });
            return LogicaServiceWorker.#renovacionEnCurso;
        }

        /** Guarda los pares [url, respuesta] desde el índice `i`, uno tras otro (en serie, como el for…of original). */
        static #guardarEnSerie(cache, pares, i) {
            if (i >= pares.length) return Promise.resolve();
            const [url, respuesta] = pares[i];
            return Promise.resolve(cache.put(url, respuesta)).then(() => LogicaServiceWorker.#guardarEnSerie(cache, pares, i + 1));
        }

        static #ejecutarRenovacion(opciones) {
            return new Promise(resolve => {
                const { caches, fetch, base, esActiva = () => true, crearSolicitud = url => new Request(url, { cache: "reload" }) } = opciones;
                const generacion = `${Date.now()}-${++LogicaServiceWorker.#generaciones}`;
                const nuevos = { shell: `${LogicaServiceWorker.CACHE_SHELL}-${generacion}`, datos: `${LogicaServiceWorker.CACHE_DATOS}-${generacion}` };
                const descargar = (url, valida) => new Promise(pedir => pedir(fetch(crearSolicitud(url)))).then(respuesta => {
                    if (!valida(respuesta)) throw new Error(`Descarga incompleta: ${url}`);
                    return [url, respuesta];
                });
                // Lo que envolvía el try: descargar todo, guardarlo en serie y mover el puntero.
                const copiaNueva = new Promise(descargarTodo => descargarTodo(Promise.all(LogicaServiceWorker.PRECACHE.map(ruta => descargar(new URL(ruta, base).href, r => r.ok)))))
                    .then(archivos => Promise.all(LogicaServiceWorker.CATALOGOS_PUBLICOS.map(nombre => descargar(
                        new URL(`${LogicaServiceWorker.RUTA_API}publico/${nombre}`, base).href,
                        r => r.status === 200 && Boolean(r.headers.get("Content-Type")?.includes("application/json")))))
                        .then(catalogos => Promise.resolve(caches.open(nuevos.shell))
                            .then(shell => LogicaServiceWorker.#guardarEnSerie(shell, archivos, 0))
                            .then(() => caches.open(nuevos.datos))
                            .then(datos => LogicaServiceWorker.#guardarEnSerie(datos, catalogos, 0))))
                    .then(() => {
                        // Otra versión se activó mientras se descargaba: el puntero y sus cachés son suyos.
                        if (!esActiva()) throw new Error("Ya hay otra versión activa.");
                        return caches.open(LogicaServiceWorker.CACHE_VIGENTE);
                    })
                    .then(puntero => puntero.put(LogicaServiceWorker.#CLAVE_VIGENTE, new Response(JSON.stringify(nuevos), {
                        headers: { "Content-Type": "application/json" },
                    })));
                // Dos argumentos: el try terminaba antes de borrar los anteriores; esos errores se propagan.
                resolve(copiaNueva.then(() => {
                    const conservar = new Set([nuevos.shell, nuevos.datos]);
                    return Promise.resolve(caches.keys())
                        .then(claves => {
                            const anteriores = claves.filter(nombre => LogicaServiceWorker.#esDeEstaVersion(nombre) && !conservar.has(nombre));
                            return Promise.all(anteriores.map(nombre => caches.delete(nombre)));
                        })
                        .then(() => LogicaServiceWorker.#limpiarPuntero(caches))
                        .then(() => true);
                }, () => Promise.all([caches.delete(nuevos.shell), caches.delete(nuevos.datos)]).then(() => false)));
            });
        }

        /** Borra los cachés de ChivoMed de otras versiones (conserva la copia vigente). Devuelve los borrados. */
        static limpiarVersionesViejas(caches) {
            let viejos;
            return new Promise(resolve => resolve(LogicaServiceWorker.cachesVigentes(caches)))
                .then(({ shell, datos }) => {
                    const vigentes = new Set([LogicaServiceWorker.CACHE_SHELL, LogicaServiceWorker.CACHE_DATOS, LogicaServiceWorker.CACHE_VIGENTE, shell, datos]);
                    return Promise.resolve(caches.keys()).then(claves => {
                        viejos = claves.filter(nombre => nombre.startsWith(LogicaServiceWorker.PREFIJO) && !vigentes.has(nombre));
                        return Promise.all(viejos.map(nombre => caches.delete(nombre)));
                    });
                })
                .then(() => LogicaServiceWorker.#limpiarPuntero(caches))
                .then(() => viejos);
        }

        /** Borra todos los cachés de datos (de cualquier versión). Se usa al cerrar sesión. */
        static limpiarDatos(caches) {
            let datos;
            return new Promise(resolve => resolve(caches.keys()))
                .then(claves => {
                    datos = claves.filter(nombre => nombre.startsWith(LogicaServiceWorker.PREFIJO_DATOS));
                    return Promise.all(datos.map(nombre => caches.delete(nombre)));
                })
                .then(() => datos);
        }

        /**
         * Mensaje de una página. { tipo: "reclamar" }: una página cargada con Ctrl+Shift+R queda sin
         * control del SW y activate no vuelve a correr; clients.claim() la toma para que, sin red, sus
         * hojas de estilo y módulos salgan del precache. { tipo: "renovar" }: la página arrancó con red
         * y pide renovar la copia sin conexión; `esActiva()` dice si esta versión sigue siendo la activa.
         * Devuelve la promesa, o null si se ignora.
         */
        static atenderMensaje(datos, { clients, caches, fetch, base, esActiva }) {
            if (datos?.tipo === "reclamar") return clients.claim();
            if (datos?.tipo === "renovar" && caches && fetch && base) return LogicaServiceWorker.renovar({ caches, fetch, base, esActiva });
            return null;
        }
    }

    raiz.ChivoMedSW = Object.freeze(LogicaServiceWorker);
})(globalThis);
