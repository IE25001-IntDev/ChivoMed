/**
 * Últimos datos cargados por las vistas, solo en memoria (docs/plan.md, "Offline").
 * Nunca se escriben en disco (ni localStorage, ni IndexedDB, ni Cache Storage): se pierden al
 * recargar y se borran al cerrar o perder la sesión. Sirven para seguir mostrando datos sin red.
 *
 * También guarda la última sesión de empleado verificada con /auth/me, que el router usa como
 * respaldo de solo lectura cuando no hay red. Si se recuerda la sesión de otro usuario, se borra
 * todo lo anterior: los datos de una cuenta nunca se muestran a otra.
 */
export class MemoriaVistas {
    #datos = new Map();
    #sesion = null;

    /** Clave de datos atada al usuario de la sesión; null si la sesión no trae usuario. */
    static clave(sesion, nombre) {
        const id = sesion?.usuario?.idUsuario;
        return typeof id === "string" && id ? `${id}:${nombre}` : null;
    }

    guardar(clave, valor) {
        if (clave) this.#datos.set(clave, valor);
    }

    leer(clave) {
        return clave && this.#datos.has(clave) ? this.#datos.get(clave) : null;
    }

    recordarSesion(sesion) {
        const id = sesion?.usuario?.idUsuario;
        if (typeof id !== "string" || !id) return;
        if (this.#sesion && this.#sesion.usuario.idUsuario !== id) this.#datos.clear();
        this.#sesion = sesion;
    }

    get sesion() { return this.#sesion; }

    limpiar() {
        this.#datos.clear();
        this.#sesion = null;
    }
}

/** Instancia compartida por el shell, el router y las vistas. */
export const memoria = new MemoriaVistas();
