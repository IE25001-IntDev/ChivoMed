/**
 * Router por hash (#/ruta?query) sin dependencias del DOM.
 * Recibe la ventana, la autenticación y el montaje por inyección para poder probarse con node --test.
 */

/** Separa ruta y query del hash. '', '#' y '#/' se vuelven '/'; se quitan las barras finales. */
export function normalizarHash(hash = "") {
    const texto = String(hash).replace(/^#/, "");
    const indice = texto.indexOf("?");
    const crudo = indice === -1 ? texto : texto.slice(0, indice);
    const query = new URLSearchParams(indice === -1 ? "" : texto.slice(indice + 1));
    const ruta = `/${crudo.replace(/^\/+/, "")}`.replace(/\/+$/, "") || "/";
    return { ruta, query };
}

function coincidir(patron, ruta, restricciones = {}) {
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
export function resolverRuta(hash, rutas) {
    const { ruta: path, query } = normalizarHash(hash);
    for (const ruta of rutas) {
        const params = coincidir(ruta.patron, path, ruta.restricciones);
        if (params) return { ruta, params, query, path };
    }
    return { ruta: null, params: {}, query, path };
}

/**
 * Valida el parámetro `volver` del login: solo rutas internas conocidas y que no sean solo para invitados.
 * Devuelve la ruta (con su query) o null.
 */
export function rutaDeRetorno(valor, rutas) {
    if (typeof valor !== "string" || !valor.startsWith("/") || valor.startsWith("//") || /[\\\s]/.test(valor)) return null;
    const { ruta } = resolverRuta(valor, rutas);
    return ruta && !ruta.soloInvitados ? valor : null;
}

export class Router {
    #opciones;
    #secuencia = 0;
    #manejador = () => { this.pendiente = this.procesar(); };

    /**
     * @param {object} opciones
     * @param {object[]} opciones.rutas
     * @param {object} opciones.noEncontrada definición montada cuando ninguna ruta coincide
     * @param {string} opciones.porDefecto ruta usada para '#', '#/' o hash vacío
     * @param {string} opciones.login ruta del login
     * @param {(sesion) => string|null} opciones.inicioPorRol
     * @param {(sesion) => boolean} [opciones.esEmpleado] decide si una sesión entra a las rutas `empleado`
     * @param {{ location: { hash: string, replace(url: string): void }, addEventListener: Function, removeEventListener: Function }} opciones.ventana
     * @param {() => Promise<object>} opciones.autenticar resuelve la sesión o rechaza con { status }
     * @param {(tag: string, contexto: object) => void} opciones.montar
     * @param {(error: Error, contexto: object) => void} [opciones.mostrarError]
     * @param {(error: Error) => boolean} [opciones.esErrorDeRed] true si `autenticar` falló por falta de red (no por 401)
     * @param {() => object|null} [opciones.sesionSinRed] última sesión de empleado verificada que se guardó en memoria
     * @param {object} [opciones.sinConexion] definición montada en una ruta protegida sin red y sin sesión en memoria
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

    async procesar() {
        const id = ++this.#secuencia;
        const vigente = () => id === this.#secuencia;
        const o = this.#opciones;
        const resultado = resolverRuta(o.ventana.location.hash, o.rutas);
        const { path, query, params } = resultado;

        if (path === "/") return this.#redirigir(o.porDefecto);

        const ruta = resultado.ruta ?? o.noEncontrada;
        const contexto = { ruta, path, params, query, sesion: null, soloLectura: false };

        if (ruta.empleado || ruta.soloInvitados) {
            try {
                contexto.sesion = await o.autenticar();
            } catch (error) {
                if (!vigente()) return;
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
            }
            if (!vigente()) return;
            if (contexto.sesion) {
                const inicio = o.inicioPorRol(contexto.sesion);
                if (ruta.soloInvitados && inicio) return this.#redirigir(inicio);
                if (ruta.empleado && !o.esEmpleado(contexto.sesion)) {
                    return this.#redirigir(inicio ?? o.porDefecto);
                }
            }
        }

        return this.#cargarYMontar(ruta, contexto, vigente);
    }

    async #cargarYMontar(ruta, contexto, vigente) {
        try {
            await ruta.cargar?.();
        } catch (error) {
            if (vigente()) this.#opciones.mostrarError(error, contexto);
            return;
        }
        if (vigente()) this.#opciones.montar(ruta.tag, contexto);
    }
}
