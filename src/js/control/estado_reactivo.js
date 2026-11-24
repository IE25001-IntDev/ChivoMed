/**
 * Estado reactivo basado en Proxy, sin DOM.
 *
 *   const reactivo = new EstadoReactivo({ cargando: false, error: null });
 *   const cancelar = reactivo.suscribir((cambios, estado) => { if (cambios.has("error")) ... });
 *   reactivo.estado.cargando = true;   // se lee de inmediato; la notificación llega en un microtask
 *
 * Los controladores lo usan por composición: guardan la instancia en un campo privado, publican
 * `estado` y delegan `suscribir`.
 * - Agrupa todos los cambios de un mismo tick en una sola notificación.
 * - No notifica si el valor no cambió (Object.is) ni si volvió al original dentro del tick.
 * - Las claves quedan fijas: asignar una desconocida, borrar o definir propiedades lanza TypeError.
 * - Es superficial: solo detecta reemplazos. Los objetos y arreglos se guardan congelados y se
 *   reemplazan; mutarlos lanza TypeError en los módulos (modo estricto).
 */

/** Set de solo lectura con las claves que cambiaron en un lote. */
class Cambios extends Set {
    /** Lotes ya entregados. Es estático porque Set llama a add() desde su constructor, antes de los campos de instancia. */
    static #sellados = new WeakSet();

    /** Desde aquí el Set no admite cambios. */
    sellar() {
        Cambios.#sellados.add(this);
        return this;
    }

    add(valor) {
        if (Cambios.#sellados.has(this)) throw new TypeError("Los cambios notificados son de solo lectura.");
        return super.add(valor);
    }

    delete() { throw new TypeError("Los cambios notificados son de solo lectura."); }

    clear() { throw new TypeError("Los cambios notificados son de solo lectura."); }
}

export class EstadoReactivo {
    #datos;
    #claves;
    #suscriptores = new Set();
    /** Valor de cada clave al empezar el lote; null si no hay lote pendiente. */
    #originales = null;
    #programar;
    #alFallar;
    #proxy;

    /**
     * @param inicial objeto con las claves y los valores iniciales.
     * @param opciones opcional. `programar` recibe la función que notifica y la agenda (por defecto
     *   queueMicrotask); `alFallar` recibe el error que lance un suscriptor (por defecto console.error).
     */
    constructor(inicial, { programar = queueMicrotask, alFallar = error => console.error(error) } = {}) {
        this.#datos = { ...inicial };
        this.#claves = new Set(Object.keys(this.#datos));
        this.#programar = programar;
        this.#alFallar = alFallar;
        // Trampas como flechas: `this` es esta instancia, no el handler del Proxy.
        this.#proxy = new Proxy(this.#datos, {
            set: (objetivo, clave, valor) => this.#asignar(objetivo, clave, valor),
            deleteProperty: (_objetivo, clave) => {
                throw new TypeError(`No se puede borrar "${String(clave)}" del estado.`);
            },
            defineProperty: (_objetivo, clave) => {
                throw new TypeError(`No se puede definir "${String(clave)}" en el estado; asigna el valor.`);
            },
        });
    }

    /** Se lee y se asigna como un objeto. */
    get estado() {
        return this.#proxy;
    }

    /**
     * Recibe una función que se llama con el Set de claves que cambiaron y el estado. Devuelve la
     * función que cancela.
     */
    suscribir(fn) {
        if (typeof fn !== "function") throw new TypeError("suscribir() espera una función.");
        this.#suscriptores.add(fn);
        return () => { this.#suscriptores.delete(fn); };
    }

    #asignar(objetivo, clave, valor) {
        if (!this.#claves.has(clave)) throw new TypeError(`"${String(clave)}" no es una clave de este estado.`);
        if (Object.is(objetivo[clave], valor)) return true;
        if (!this.#originales) {
            this.#originales = new Map();
            // Se llama sin receptor, como antes: queueMicrotask del navegador lanza "Illegal invocation"
            // si se invoca como this.#programar(...). La flecha conserva el this de #notificar.
            const programar = this.#programar;
            programar(() => this.#notificar());
        }
        if (!this.#originales.has(clave)) this.#originales.set(clave, objetivo[clave]);
        objetivo[clave] = valor;
        return true;
    }

    #notificar() {
        const lote = this.#originales;
        this.#originales = null;
        const cambios = new Cambios([...lote].filter(([clave, antes]) => !Object.is(antes, this.#datos[clave])).map(([clave]) => clave)).sellar();
        if (!cambios.size) return;
        for (const fn of [...this.#suscriptores]) {
            if (!this.#suscriptores.has(fn)) continue; // Cancelado por otro suscriptor en esta misma vuelta.
            try {
                fn(cambios, this.#proxy);
            } catch (error) {
                const alFallar = this.#alFallar; // Sin receptor, igual que programar.
                alFallar(error);
            }
        }
    }
}
