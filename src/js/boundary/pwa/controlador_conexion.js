/**
 * Estado de la red sin DOM (online/offline) con suscriptores.
 * Nota: navigator.onLine=true solo indica que hay una red, no que el backend responda;
 * los servicios siguen manejando sus propios errores de conexión.
 */
export const MENSAJE_SIN_RED = "Sin conexión a internet. Esta acción estará disponible cuando vuelvas a conectarte.";

export class ControladorConexion {
    #ventana;
    #suscriptores = new Set();
    #alConectar = () => this.#cambiar(true);
    #alDesconectar = () => this.#cambiar(false);

    /** @param {{ ventana: (EventTarget & { navigator?: { onLine?: boolean } }) | null }} opciones */
    constructor({ ventana }) {
        this.#ventana = ventana;
        this.enLinea = ventana?.navigator?.onLine !== false;
    }

    iniciar() {
        this.#ventana?.addEventListener("online", this.#alConectar);
        this.#ventana?.addEventListener("offline", this.#alDesconectar);
        return this;
    }

    detener() {
        this.#ventana?.removeEventListener("online", this.#alConectar);
        this.#ventana?.removeEventListener("offline", this.#alDesconectar);
    }

    /** Llama a `fn(enLinea)` en cada cambio. Devuelve la función para cancelar la suscripción. */
    suscribir(fn) {
        this.#suscriptores.add(fn);
        return () => this.#suscriptores.delete(fn);
    }

    #cambiar(enLinea) {
        if (enLinea === this.enLinea) return;
        this.enLinea = enLinea;
        for (const fn of [...this.#suscriptores]) fn(enLinea);
    }
}
