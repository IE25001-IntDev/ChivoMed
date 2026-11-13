/**
 * Estado reactivo basado en Proxy, sin DOM.
 *
 *   const { estado, suscribir } = crearEstado({ cargando: false, error: null });
 *   const cancelar = suscribir((cambios, estado) => { if (cambios.has("error")) ... });
 *   estado.cargando = true;            // se lee de inmediato; la notificación llega en un microtask
 *
 * - Agrupa todos los cambios de un mismo tick en una sola notificación.
 * - No notifica si el valor no cambió (Object.is) ni si volvió al original dentro del tick.
 * - Las claves quedan fijas: asignar una desconocida, borrar o definir propiedades lanza TypeError.
 * - Es superficial: solo detecta reemplazos. Los objetos y arreglos se guardan congelados y se
 *   reemplazan; mutarlos lanza TypeError en los módulos (modo estricto).
 */

/** Set de solo lectura con las claves que cambiaron en un lote. */
const sellados = new WeakSet();
class Cambios extends Set {
    add(valor) {
        if (sellados.has(this)) throw new TypeError("Los cambios notificados son de solo lectura.");
        return super.add(valor);
    }
    delete() { throw new TypeError("Los cambios notificados son de solo lectura."); }
    clear() { throw new TypeError("Los cambios notificados son de solo lectura."); }
}

/**
 * @param {object} inicial claves y valores iniciales
 * @param {{ programar?: (fn: () => void) => void, alFallar?: (error: unknown) => void }} [opciones]
 * @returns {{ estado: object, suscribir: (fn: (cambios: Set<string>, estado: object) => void) => () => void }}
 */
export function crearEstado(inicial, { programar = queueMicrotask, alFallar = error => console.error(error) } = {}) {
    const datos = { ...inicial };
    const claves = new Set(Object.keys(datos));
    const suscriptores = new Set();
    /** Valor de cada clave al empezar el lote; null si no hay lote pendiente. */
    let originales = null;
    let estado = null;

    function notificar() {
        const lote = originales;
        originales = null;
        const cambios = new Cambios([...lote].filter(([clave, antes]) => !Object.is(antes, datos[clave])).map(([clave]) => clave));
        sellados.add(cambios);
        if (!cambios.size) return;
        for (const fn of [...suscriptores]) {
            if (!suscriptores.has(fn)) continue; // Cancelado por otro suscriptor en esta misma vuelta.
            try {
                fn(cambios, estado);
            } catch (error) {
                alFallar(error);
            }
        }
    }

    estado = new Proxy(datos, {
        set(objetivo, clave, valor) {
            if (!claves.has(clave)) throw new TypeError(`"${String(clave)}" no es una clave de este estado.`);
            if (Object.is(objetivo[clave], valor)) return true;
            if (!originales) {
                originales = new Map();
                programar(notificar);
            }
            if (!originales.has(clave)) originales.set(clave, objetivo[clave]);
            objetivo[clave] = valor;
            return true;
        },
        deleteProperty(_objetivo, clave) {
            throw new TypeError(`No se puede borrar "${String(clave)}" del estado.`);
        },
        defineProperty(_objetivo, clave) {
            throw new TypeError(`No se puede definir "${String(clave)}" en el estado; asigna el valor.`);
        },
    });

    function suscribir(fn) {
        if (typeof fn !== "function") throw new TypeError("suscribir() espera una función.");
        suscriptores.add(fn);
        return () => { suscriptores.delete(fn); };
    }

    return { estado, suscribir };
}
