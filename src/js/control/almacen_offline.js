/**
 * Copia en disco (IndexedDB) de lo mínimo para usar las vistas de empleado sin red después de
 * recargar: la última sesión verificada (sin token CSRF), el último dashboard y la consulta abierta.
 * Lo decide y lo filtra memoria_vistas.js; este módulo solo lee y escribe registros por clave.
 *
 * Recibe `indexedDB` por inyección para probarse con un doble en node --test. Si IndexedDB no
 * existe o falla, las operaciones resuelven vacío o false: nunca rompen el arranque de la app.
 */
export const NOMBRE_BASE = "chivomed-offline";
export const ALMACEN = "registros";
const VERSION_BASE = 1;

export class AlmacenOffline {
    #fabrica;
    /** Promesa de la base abierta; null hasta el primer uso o tras un fallo al abrir. */
    #conexion = null;

    /** Se crea con AlmacenOffline.crear(), que revisa antes que el entorno tenga IndexedDB. */
    constructor(fabrica) {
        this.#fabrica = fabrica;
        Object.freeze(this);
    }

    /** Devuelve el almacén, o null si el entorno no tiene IndexedDB. */
    static crear(fabrica = globalThis.indexedDB) {
        if (!fabrica || typeof fabrica.open !== "function") return null;
        return new AlmacenOffline(fabrica);
    }

    /** { [clave]: valor } con las claves pedidas que existen; {} si falla. */
    leer(claves) {
        return new Promise(resolve => resolve(this.#operar("readonly", almacen => claves.map(clave => [clave, almacen.get(clave)]))))
            .then(solicitudes => {
                const registros = {};
                for (const [clave, solicitud] of solicitudes) {
                    if (solicitud.result !== undefined) registros[clave] = solicitud.result;
                }
                return registros;
            })
            .catch(() => ({}));
    }

    /** Guarda (o borra, con `valor` null) un registro. Resuelve true si se escribió. */
    guardar(clave, valor) {
        return new Promise(resolve => resolve(this.#operar("readwrite", almacen => (valor == null ? almacen.delete(clave) : almacen.put(valor, clave)))))
            .then(() => true)
            .catch(() => false);
    }

    /** Borra todos los registros. Resuelve true si se borró. */
    borrar() {
        return new Promise(resolve => resolve(this.#operar("readwrite", almacen => almacen.clear())))
            .then(() => true)
            .catch(() => false);
    }

    #abrir() {
        this.#conexion ??= new Promise((resolve, reject) => {
            const solicitud = this.#fabrica.open(NOMBRE_BASE, VERSION_BASE);
            solicitud.onupgradeneeded = () => {
                const base = solicitud.result;
                if (!base.objectStoreNames.contains(ALMACEN)) base.createObjectStore(ALMACEN);
            };
            solicitud.onsuccess = () => resolve(solicitud.result);
            solicitud.onerror = () => reject(solicitud.error ?? new Error("IndexedDB no disponible"));
            solicitud.onblocked = () => reject(new Error("IndexedDB bloqueada"));
        }).catch(error => {
            this.#conexion = null; // El siguiente intento vuelve a abrir.
            throw error;
        });
        return this.#conexion;
    }

    /** Ejecuta `accion(almacen)` en una transacción y resuelve cuando termina. */
    #operar(modo, accion) {
        return new Promise(resolve => resolve(this.#abrir()))
            .then(base => new Promise((resolve, reject) => {
                const transaccion = base.transaction(ALMACEN, modo);
                const resultado = accion(transaccion.objectStore(ALMACEN));
                transaccion.oncomplete = () => resolve(resultado);
                transaccion.onerror = () => reject(transaccion.error ?? new Error("Transacción fallida"));
                transaccion.onabort = () => reject(transaccion.error ?? new Error("Transacción abortada"));
            }));
    }
}
