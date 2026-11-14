/**
 * Últimos datos cargados por las vistas, para seguir mostrándolos sin red (docs/plan.md, "Offline").
 * Se borran al cerrar o perder la sesión.
 *
 * También guarda la última sesión de empleado verificada con /auth/me, que el router usa como
 * respaldo de solo lectura cuando no hay red. Si se recuerda la primera sesión o la de otro usuario,
 * se borra todo lo anterior: los datos de una cuenta (o los públicos) nunca se muestran a otra.
 *
 * Copia en disco (IndexedDB, por el puerto `persistencia`): solo lo necesario para que las vistas de
 * empleado funcionen sin red después de recargar. Se guardan:
 *  - la sesión verificada, sin `csrfToken`, con la hora de la verificación;
 *  - el último dashboard (`dashboard.ultimo:*`) y las asignaciones (`dashboard.asignaciones`);
 *  - la consulta abierta (`consulta:{id}`), sin el valor guardado del paso.
 * Cada uno reemplaza al anterior. Nunca van a disco los borradores, lo leído en "Ver registro" ni la
 * búsqueda pública de citas (HU1), que sigue solo en memoria. `hidratar()` descarta la copia si la
 * sesión se verificó hace más de 8 horas (el máximo de una sesión en el backend).
 *
 * El estado es reactivo ({ sesion, datos }): `suscribir()` avisa cuando se guarda, se cambia de
 * sesión o se limpia. `datos` es un objeto congelado que se reemplaza en cada escritura.
 */
import { crearEstado } from "../../control/estado_reactivo.js";
import { crearAlmacenOffline } from "../pwa/almacen_offline.js";

const VACIO = Object.freeze(Object.create(null));

/** Vigencia de la copia en disco: el máximo de una sesión en el backend. */
export const VIGENCIA_MS = 8 * 60 * 60 * 1000;
/** Tiempo máximo que el arranque espera a IndexedDB. */
export const ESPERA_HIDRATAR_MS = 1500;

/** Registros en disco: uno por ranura. */
export const RANURA_SESION = "sesion";
const RANURAS_DATOS = Object.freeze(["dashboard", "asignaciones", "consulta"]);

/** Ranura en disco del nombre de una clave de datos, o null si no se persiste. */
export function ranuraDe(nombre) {
    if (nombre.startsWith("dashboard.ultimo:")) return "dashboard";
    if (nombre === "dashboard.asignaciones") return "asignaciones";
    if (nombre.startsWith("consulta:")) return "consulta";
    return null;
}

/** Lo que va a disco de cada ranura: la consulta sin el valor guardado del paso. */
function paraDisco(ranura, valor) {
    if (ranura !== "consulta" || !valor?.detalle) return valor;
    return { ...valor, detalle: { ...valor.detalle, valorGuardado: null } };
}

function congelarProfundo(valor) {
    if (valor && typeof valor === "object" && !(valor instanceof Date) && !Object.isFrozen(valor)) {
        for (const hijo of Object.values(valor)) congelarProfundo(hijo);
        Object.freeze(valor);
    }
    return valor;
}

export class MemoriaVistas {
    #estado;
    #suscribir;
    #persistencia;
    #reloj;

    /**
     * @param {object} [opciones]
     * @param {{ leer: Function, guardar: Function, borrar: Function }|null} [opciones.persistencia] almacén en disco
     * @param {() => Date} [opciones.reloj]
     */
    constructor({ persistencia = null, reloj = () => new Date() } = {}) {
        ({ estado: this.#estado, suscribir: this.#suscribir } = crearEstado({ sesion: null, datos: VACIO }));
        this.#persistencia = persistencia;
        this.#reloj = reloj;
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
        this.#persistir(clave, valor);
    }

    /** Copia en disco las claves persistibles del usuario de la sesión. */
    #persistir(clave, valor) {
        const id = this.#estado.sesion?.usuario?.idUsuario;
        if (!this.#persistencia || !id || !clave.startsWith(`${id}:`)) return;
        const ranura = ranuraDe(clave.slice(id.length + 1));
        if (!ranura) return;
        this.#persistencia.guardar(ranura, valor == null ? null : { clave, valor: paraDisco(ranura, valor) });
    }

    leer(clave) {
        return clave && Object.hasOwn(this.#estado.datos, clave) ? this.#estado.datos[clave] : null;
    }

    recordarSesion(sesion) {
        const id = sesion?.usuario?.idUsuario;
        if (typeof id !== "string" || !id) return;
        // Al iniciar sesión (no había) o cambiar de usuario se borra todo: lo guardado sin sesión
        // (la búsqueda pública de citas, con su número de documento) nunca pasa a una sesión.
        if (this.#estado.sesion?.usuario.idUsuario !== id) {
            this.#estado.datos = VACIO;
            this.#persistencia?.borrar();
        }
        this.#estado.sesion = sesion;
        if (this.#persistencia) {
            const { csrfToken, ...sinToken } = sesion;
            this.#persistencia.guardar(RANURA_SESION, { sesion: sinToken, verificadaEn: this.#reloj() });
        }
    }

    get sesion() { return this.#estado.sesion; }

    limpiar() {
        Object.assign(this.#estado, { datos: VACIO, sesion: null });
        this.#persistencia?.borrar();
    }

    /**
     * Carga la copia en disco al arrancar. Resuelve true si restauró la sesión de respaldo y sus
     * datos; false si no había copia, había caducado, no era válida o IndexedDB tardó demasiado.
     * Devuelve null (sin promesa) si no hay persistencia, para que el arranque no espere.
     */
    hidratar() {
        if (!this.#persistencia) return null;
        let temporizador;
        const limite = new Promise(resolve => {
            temporizador = setTimeout(() => resolve(false), ESPERA_HIDRATAR_MS);
            temporizador.unref?.();
        });
        const tarea = this.#hidratar().catch(() => false);
        return Promise.race([tarea, limite]).finally(() => clearTimeout(temporizador));
    }

    async #hidratar() {
        const registros = await this.#persistencia.leer([RANURA_SESION, ...RANURAS_DATOS]);
        const { sesion, verificadaEn } = registros?.[RANURA_SESION] ?? {};
        const id = sesion?.usuario?.idUsuario;
        const edad = verificadaEn instanceof Date ? this.#reloj().getTime() - verificadaEn.getTime() : Number.NaN;
        if (typeof id !== "string" || !id || !(edad >= 0 && edad <= VIGENCIA_MS)) {
            if (registros && Object.keys(registros).length) await this.#persistencia.borrar();
            return false;
        }
        // Una sesión verificada mientras se leía el disco manda: no se pisa con la copia.
        if (this.#estado.sesion) return false;
        const datos = Object.create(null);
        for (const ranura of RANURAS_DATOS) {
            const registro = registros[ranura];
            if (typeof registro?.clave === "string" && registro.clave.startsWith(`${id}:`)
                && ranuraDe(registro.clave.slice(id.length + 1)) === ranura && registro.valor != null) {
                datos[registro.clave] = congelarProfundo(registro.valor);
            }
        }
        Object.assign(this.#estado, { sesion, datos: Object.freeze(datos) });
        return true;
    }
}

/** Instancia compartida por el shell, el router y las vistas, con copia en IndexedDB si existe. */
export const memoria = new MemoriaVistas({ persistencia: crearAlmacenOffline() });
