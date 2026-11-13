/**
 * Últimos datos cargados por las vistas, solo en memoria (docs/plan.md, "Offline").
 * Nunca se escriben en disco (ni localStorage, ni IndexedDB, ni Cache Storage): se pierden al
 * recargar y se borran al cerrar o perder la sesión. Sirven para seguir mostrando datos sin red.
 *
 * También guarda la última sesión de empleado verificada con /auth/me, que el router usa como
 * respaldo de solo lectura cuando no hay red. Si se recuerda la sesión de otro usuario, se borra
 * todo lo anterior: los datos de una cuenta nunca se muestran a otra.
 *
 * El estado es reactivo ({ sesion, datos }): `suscribir()` avisa cuando se guarda, se cambia de
 * sesión o se limpia. `datos` es un objeto congelado que se reemplaza en cada escritura.
 */
import { crearEstado } from "../../control/estado_reactivo.js";

const VACIO = Object.freeze(Object.create(null));

export class MemoriaVistas {
    #estado;
    #suscribir;

    constructor() {
        ({ estado: this.#estado, suscribir: this.#suscribir } = crearEstado({ sesion: null, datos: VACIO }));
    }

    /** Clave de datos atada al usuario de la sesión; null si la sesión no trae usuario. */
    static clave(sesion, nombre) {
        const id = sesion?.usuario?.idUsuario;
        return typeof id === "string" && id ? `${id}:${nombre}` : null;
    }

    /** Avisa con (cambios, { sesion, datos }) en cada cambio. Devuelve la función para cancelar. */
    suscribir(fn) {
        return this.#suscribir(fn);
    }

    guardar(clave, valor) {
        const datos = this.#estado.datos;
        if (!clave || (Object.hasOwn(datos, clave) && Object.is(datos[clave], valor))) return;
        this.#estado.datos = Object.freeze(Object.assign(Object.create(null), datos, { [clave]: valor }));
    }

    leer(clave) {
        return clave && Object.hasOwn(this.#estado.datos, clave) ? this.#estado.datos[clave] : null;
    }

    recordarSesion(sesion) {
        const id = sesion?.usuario?.idUsuario;
        if (typeof id !== "string" || !id) return;
        if (this.#estado.sesion && this.#estado.sesion.usuario.idUsuario !== id) this.#estado.datos = VACIO;
        this.#estado.sesion = sesion;
    }

    get sesion() { return this.#estado.sesion; }

    limpiar() {
        Object.assign(this.#estado, { datos: VACIO, sesion: null });
    }
}

/** Instancia compartida por el shell, el router y las vistas. */
export const memoria = new MemoriaVistas();
