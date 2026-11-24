/**
 * Router por hash (#/ruta?query) sin dependencias del DOM.
 * Recibe la ventana, la autenticación y el montaje por inyección para poder probarse con node --test.
 */

export class Router {
    #opciones;
    #secuencia = 0;
    #manejador = () => { this.pendiente = this.procesar(); };

    /**
     * @param opciones objeto con:
     *   - `rutas`: arreglo con las definiciones de ruta.
     *   - `noEncontrada`: definición montada cuando ninguna ruta coincide.
     *   - `porDefecto`: ruta usada para '#', '#/' o hash vacío.
     *   - `login`: ruta del login.
     *   - `inicioPorRol`: función que recibe la sesión y devuelve la ruta de inicio, o null.
     *   - `esEmpleado` (opcional): función que recibe la sesión y decide si entra a las rutas `empleado`.
     *   - `ventana`: objeto con `location` (con `hash` y `replace(url)`), `addEventListener` y `removeEventListener`.
     *   - `autenticar`: función que devuelve una promesa que resuelve la sesión o rechaza con { status }.
     *   - `montar`: función que recibe el tag y el contexto y monta la vista.
     *   - `mostrarError` (opcional): función que recibe el error y el contexto.
     *   - `esErrorDeRed` (opcional): función que recibe el error y devuelve true si `autenticar` falló por falta de red (no por 401).
     *   - `sesionSinRed` (opcional): función que devuelve la última sesión de empleado verificada que se guardó en memoria, o null.
     *   - `sinConexion` (opcional): definición montada en una ruta protegida sin red y sin sesión en memoria.
     */
    constructor(opciones) {
        this.#opciones = { mostrarError: () => {}, esEmpleado: () => false, esErrorDeRed: () => false, sesionSinRed: () => null, sinConexion: null, ...opciones };
        this.pendiente = Promise.resolve();
    }

    iniciar() {
        this.#opciones.ventana.addEventListener("hashchange", this.#manejador);
        this.pendiente = this.procesar();
        return this.pendiente;
    }

    detener() {
        this.#opciones.ventana.removeEventListener("hashchange", this.#manejador);
        this.#secuencia++;
    }

    /** Navegación del usuario: crea una entrada en el historial. */
    navegar(ruta) {
        const { ventana } = this.#opciones;
        const destino = `#${ruta}`;
        if (ventana.location.hash === destino) {
            this.pendiente = this.procesar();
        } else {
            ventana.location.hash = destino;
        }
        return this.pendiente;
    }

    /** Redirección: reemplaza la entrada actual para no atrapar al usuario con el botón Atrás. */
    #redirigir(ruta) {
        this.#opciones.ventana.location.replace(`#${ruta}`);
    }

    procesar() {
        // El ejecutor corre en el acto: la secuencia sube y autenticar() se llama durante la llamada, como antes.
        return new Promise(resolve => {
            const id = ++this.#secuencia;
            const vigente = () => id === this.#secuencia;
            const o = this.#opciones;
            const resultado = Router.resolverRuta(o.ventana.location.hash, o.rutas);
            const { path, query, params } = resultado;

            if (path === "/") {
                resolve(this.#redirigir(o.porDefecto));
                return;
            }

            const ruta = resultado.ruta ?? o.noEncontrada;
            const contexto = { ruta, path, params, query, sesion: null, soloLectura: false };

            if (!(ruta.empleado || ruta.soloInvitados)) {
                resolve(this.#cargarYMontar(ruta, contexto, vigente));
                return;
            }

            // Lo que seguía después del try/catch de autenticar(), con o sin sesión.
            const continuar = () => {
                if (!vigente()) return undefined;
                if (contexto.sesion) {
                    const inicio = o.inicioPorRol(contexto.sesion);
                    if (ruta.soloInvitados && inicio) return this.#redirigir(inicio);
                    if (ruta.empleado && !o.esEmpleado(contexto.sesion)) {
                        return this.#redirigir(inicio ?? o.porDefecto);
                    }
                }
                return this.#cargarYMontar(ruta, contexto, vigente);
            };
            const sinSesion = error => {
                if (!vigente()) return undefined;
                if (ruta.empleado) {
                    if (error?.status === 401) {
                        const volver = query.size ? `${path}?${query}` : path;
                        return this.#redirigir(`${o.login}?sesion=finalizada&volver=${encodeURIComponent(volver)}`);
                    }
                    if (!o.esErrorDeRed(error)) return o.mostrarError(error, contexto);
                    // Sin red: con una sesión de empleado en memoria se entra en solo lectura;
                    // sin ella, se explica que falta la red en vez de mandar al login.
                    const respaldo = o.sesionSinRed();
                    if (respaldo && o.esEmpleado(respaldo)) {
                        contexto.sesion = respaldo;
                        contexto.soloLectura = true;
                    } else if (o.sinConexion) {
                        return this.#cargarYMontar(o.sinConexion, { ...contexto, ruta: o.sinConexion, rutaPedida: ruta }, vigente);
                    } else {
                        return o.mostrarError(error, contexto);
                    }
                }
                // Solo invitados: sin sesión (o sin poder verificarla) se muestra el login.
                return continuar();
            };
            // Dos argumentos: el try original solo envolvía autenticar(); los errores de lo que sigue se propagan.
            resolve(new Promise(autenticar => autenticar(o.autenticar())).then(sesion => {
                contexto.sesion = sesion;
                return continuar();
            }, sinSesion));
        });
    }

    #cargarYMontar(ruta, contexto, vigente) {
        // Dos argumentos: el try original solo envolvía cargar(); un error al montar se propaga.
        return new Promise(resolve => resolve(ruta.cargar?.())).then(() => {
            if (vigente()) this.#opciones.montar(ruta.tag, contexto);
        }, error => {
            if (vigente()) this.#opciones.mostrarError(error, contexto);
        });
    }

    /** Separa ruta y query del hash. '', '#' y '#/' se vuelven '/'; se quitan las barras finales. */
    static normalizarHash(hash = "") {
        const texto = String(hash).replace(/^#/, "");
        const indice = texto.indexOf("?");
        const crudo = indice === -1 ? texto : texto.slice(0, indice);
        const query = new URLSearchParams(indice === -1 ? "" : texto.slice(indice + 1));
        const ruta = `/${crudo.replace(/^\/+/, "")}`.replace(/\/+$/, "") || "/";
        return { ruta, query };
    }

    static #coincidir(patron, ruta, restricciones = {}) {
        const esperados = patron.split("/");
        const recibidos = ruta.split("/");
        if (esperados.length !== recibidos.length) return null;
        const params = {};
        for (let i = 0; i < esperados.length; i++) {
            const esperado = esperados[i];
            if (!esperado.startsWith(":")) {
                if (esperado !== recibidos[i]) return null;
                continue;
            }
            let valor;
            try { valor = decodeURIComponent(recibidos[i]); } catch { return null; }
            const nombre = esperado.slice(1);
            if (!valor || (restricciones[nombre] && !restricciones[nombre].test(valor))) return null;
            params[nombre] = valor;
        }
        return params;
    }

    /** Devuelve { ruta: definición | null, params, query, path }. */
    static resolverRuta(hash, rutas) {
        const { ruta: path, query } = Router.normalizarHash(hash);
        for (const ruta of rutas) {
            const params = Router.#coincidir(ruta.patron, path, ruta.restricciones);
            if (params) return { ruta, params, query, path };
        }
        return { ruta: null, params: {}, query, path };
    }

    /**
     * Valida el parámetro `volver` del login: solo rutas internas conocidas y que no sean solo para invitados.
     * Devuelve la ruta (con su query) o null.
     */
    static rutaDeRetorno(valor, rutas) {
        if (typeof valor !== "string" || !valor.startsWith("/") || valor.startsWith("//") || /[\\\s]/.test(valor)) return null;
        const { ruta } = Router.resolverRuta(valor, rutas);
        return ruta && !ruta.soloInvitados ? valor : null;
    }
}
