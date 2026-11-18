/**
 * Estado de conexión sin DOM, con suscriptores: `enLinea` es true solo si hay red y el backend responde.
 *  - Red: eventos online/offline de la ventana (navigator.onLine).
 *  - Servidor: DefaultService y auth_service avisan en el documento "servidor-caido" (fallo de red,
 *    tiempo agotado, 502/503/504 o la copia del service worker) y "servidor-respondio" (cualquier
 *    otra respuesta real del backend). Mientras está caído se verifica con `verificar()` cada
 *    INTERVALO_VERIFICACION_MS, al volver la red y al volver el foco a la pestaña.
 * `motivo` dice por qué no está en línea: "sin-red", "servidor" o null.
 */
import { EVENTO_SERVIDOR_CAIDO, EVENTO_SERVIDOR_RESPONDIO } from "../../control/auth_service.js";

export const MENSAJE_SIN_RED = "Sin conexión con el servidor. Esta acción estará disponible cuando vuelva la conexión.";
export const INTERVALO_VERIFICACION_MS = 20000;
/** Aviso de las vistas que muestran lo guardado sin conexión. `hora` es "HH:MM" (o vacía). */
export const mensajeGuardado = hora => (hora
    ? `Sin conexión con el servidor. Mostrando lo guardado a las ${hora}.`
    : "Sin conexión con el servidor. Mostrando lo guardado.");
export const MENSAJE_SIN_DATOS = "No se puede conectar con el servidor y no hay datos guardados.";

export class ControladorConexion {
    #ventana;
    #documento;
    #verificar;
    #red;
    #servidor = true;
    #temporizador = null;
    #verificando = false;
    #suscriptores = new Set();
    #alConectar = () => { this.#red = true; this.#actualizar(); this.#revisar(); };
    #alDesconectar = () => { this.#red = false; this.#actualizar(); };
    #alCaer = () => { this.#servidor = false; this.#actualizar(); this.#programar(); };
    #alResponder = () => this.#disponible();
    #alVolverFoco = () => { if (this.#documento?.visibilityState !== "hidden") this.#revisar(); };

    /**
     * @param {{ ventana: (EventTarget & { navigator?: { onLine?: boolean } }) | null,
     *   documento?: EventTarget | null, verificar?: (() => Promise<boolean>) | null }} opciones
     *   `verificar` resuelve true si el backend respondió (auth_service.verificarServidor).
     */
    constructor({ ventana, documento = null, verificar = null }) {
        this.#ventana = ventana;
        this.#documento = documento;
        this.#verificar = verificar;
        this.#red = ventana?.navigator?.onLine !== false;
        this.enLinea = this.#red;
        this.motivo = this.#red ? null : "sin-red";
    }

    iniciar() {
        this.#ventana?.addEventListener("online", this.#alConectar);
        this.#ventana?.addEventListener("offline", this.#alDesconectar);
        this.#ventana?.addEventListener("focus", this.#alVolverFoco);
        this.#documento?.addEventListener(EVENTO_SERVIDOR_CAIDO, this.#alCaer);
        this.#documento?.addEventListener(EVENTO_SERVIDOR_RESPONDIO, this.#alResponder);
        this.#documento?.addEventListener("visibilitychange", this.#alVolverFoco);
        return this;
    }

    detener() {
        this.#ventana?.removeEventListener("online", this.#alConectar);
        this.#ventana?.removeEventListener("offline", this.#alDesconectar);
        this.#ventana?.removeEventListener("focus", this.#alVolverFoco);
        this.#documento?.removeEventListener(EVENTO_SERVIDOR_CAIDO, this.#alCaer);
        this.#documento?.removeEventListener(EVENTO_SERVIDOR_RESPONDIO, this.#alResponder);
        this.#documento?.removeEventListener("visibilitychange", this.#alVolverFoco);
        clearTimeout(this.#temporizador);
        this.#temporizador = null;
    }

    /** Llama a `fn(enLinea)` en cada cambio de `enLinea` o de `motivo`. Devuelve la función para cancelar. */
    suscribir(fn) {
        this.#suscriptores.add(fn);
        return () => this.#suscriptores.delete(fn);
    }

    #disponible() {
        this.#servidor = true;
        clearTimeout(this.#temporizador);
        this.#temporizador = null;
        this.#actualizar();
    }

    /** Programa la próxima verificación si no hay una pendiente; varios fallos seguidos no reinician el plazo. */
    #programar() {
        if (this.#servidor || this.#temporizador !== null) return;
        this.#temporizador = setTimeout(async () => {
            this.#temporizador = null;
            await this.#revisar();
            this.#programar();
        }, INTERVALO_VERIFICACION_MS);
    }

    /** Verifica el backend si está marcado caído y hay red. Una sola verificación a la vez. */
    async #revisar() {
        if (this.#servidor || !this.#red || !this.#verificar || this.#verificando) return;
        this.#verificando = true;
        let respondio = false;
        try {
            respondio = await this.#verificar();
        } catch {
            respondio = false;
        } finally {
            this.#verificando = false;
        }
        if (respondio) this.#disponible();
    }

    #actualizar() {
        const enLinea = this.#red && this.#servidor;
        const motivo = !this.#red ? "sin-red" : !this.#servidor ? "servidor" : null;
        if (enLinea === this.enLinea && motivo === this.motivo) return;
        this.enLinea = enLinea;
        this.motivo = motivo;
        for (const fn of [...this.#suscriptores]) fn(enLinea);
    }
}
