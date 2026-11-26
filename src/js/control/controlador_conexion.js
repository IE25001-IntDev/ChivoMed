/**
 * Estado de conexión sin DOM, con suscriptores: `enLinea` es true solo si hay red y el backend responde.
 *  - Red: eventos online/offline de la ventana (navigator.onLine).
 *  - Servidor: DefaultService y auth_service avisan en el documento "servidor-caido" (fallo de red,
 *    tiempo agotado, 502/503/504 o la copia del service worker) y "servidor-respondio" (cualquier
 *    otra respuesta real del backend). Mientras está caído se verifica con `verificar()` cada
 *    INTERVALO_VERIFICACION_MS, al volver la red y al volver el foco a la pestaña.
 * `motivo` dice por qué no está en línea: "sin-red", "servidor" o null.
 */
import { EVENTO_SERVIDOR_CAIDO, EVENTO_SERVIDOR_RESPONDIO } from "./auth_service.js";

export const MENSAJE_SIN_RED = "Sin conexión con el servidor. Esta acción estará disponible cuando vuelva la conexión.";
export const INTERVALO_VERIFICACION_MS = 20000;
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
     * @param opciones objeto con:
     *   - `ventana`: un EventTarget que puede tener `navigator.onLine` (window en el navegador), o null.
     *   - `documento` (opcional): un EventTarget, o null.
     *   - `verificar` (opcional): función que devuelve una promesa que resuelve true si el backend
     *     respondió (auth_service.verificarServidor), o null.
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
        this.#temporizador = setTimeout(() => {
            this.#temporizador = null;
            // #programar solo corre al terminar la revisión.
            this.#revisar().then(() => this.#programar());
        }, INTERVALO_VERIFICACION_MS);
    }

    /** Verifica el backend si está marcado caído y hay red. Una sola verificación a la vez. */
    #revisar() {
        if (this.#servidor || !this.#red || !this.#verificar || this.#verificando) return Promise.resolve();
        this.#verificando = true;
        return new Promise(resolve => resolve(this.#verificar()))
            .catch(() => false)
            .finally(() => {
                this.#verificando = false;
            })
            // Primero se libera `verificando` y después se avisa.
            .then(respondio => {
                if (respondio) this.#disponible();
            });
    }

    #actualizar() {
        const enLinea = this.#red && this.#servidor;
        const motivo = !this.#red ? "sin-red" : !this.#servidor ? "servidor" : null;
        if (enLinea === this.enLinea && motivo === this.motivo) return;
        this.enLinea = enLinea;
        this.motivo = motivo;
        for (const fn of [...this.#suscriptores]) fn(enLinea);
    }

    /**
     * Motivo de una acción deshabilitada sin red o sin servidor: un solo texto para los dos casos.
     * @param accion texto de la acción, p. ej. "registrar la atención".
     */
    static motivoSinConexion(accion) {
        return `Sin conexión: necesitas conexión con el servidor para ${accion}.`;
    }

    /** Aviso de las vistas que muestran lo guardado sin conexión. `hora` es "HH:MM" (o vacía). */
    static mensajeGuardado(hora) {
        return hora
            ? `Sin conexión con el servidor. Mostrando lo guardado a las ${hora}.`
            : "Sin conexión con el servidor. Mostrando lo guardado.";
    }
}
