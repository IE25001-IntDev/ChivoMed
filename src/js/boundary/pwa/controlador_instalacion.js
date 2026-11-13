/**
 * Lógica de <install-prompt> sin DOM: beforeinstallprompt, appinstalled y app ya instalada.
 * Recibe la ventana por inyección para probarse con dobles en node --test.
 *
 * El controlador solo escribe en su estado reactivo (`estado`, `suscribir`); nunca llama a la vista.
 */
import { crearEstado } from "../../control/estado_reactivo.js";

export const MODOS = Object.freeze({
    NO_DISPONIBLE: "no-disponible",
    DISPONIBLE: "disponible",
    INSTALANDO: "instalando",
    INSTALADA: "instalada",
});

export class ControladorInstalacion {
    #ventana;
    #evento = null;
    #consulta = null;
    #alOfrecer = evento => this.#ofrecer(evento);
    #alInstalar = () => this.#instalada();
    #alCambiarModo = consulta => { if (consulta.matches) this.#instalada(); };

    /**
     * @param {object} opciones
     * @param {EventTarget & { matchMedia?: Function, navigator?: object }} opciones.ventana
     */
    constructor({ ventana }) {
        this.#ventana = ventana;
        const { estado, suscribir } = crearEstado({ modo: MODOS.NO_DISPONIBLE, mensaje: null });
        /** Estado reactivo: se lee como un objeto; los cambios se avisan por `suscribir`. */
        this.estado = estado;
        /** (fn: (cambios: Set<string>, estado) => void) => cancelar */
        this.suscribir = suscribir;
    }

    /** true si la app ya corre instalada (ventana independiente) o en iOS desde la pantalla de inicio. */
    yaInstalada() {
        const v = this.#ventana;
        return Boolean(v?.matchMedia?.("(display-mode: standalone)")?.matches
            || v?.matchMedia?.("(display-mode: window-controls-overlay)")?.matches
            || v?.navigator?.standalone === true);
    }

    iniciar() {
        const v = this.#ventana;
        if (!v) return;
        v.addEventListener("beforeinstallprompt", this.#alOfrecer);
        v.addEventListener("appinstalled", this.#alInstalar);
        this.#consulta = v.matchMedia?.("(display-mode: standalone)") ?? null;
        this.#consulta?.addEventListener?.("change", this.#alCambiarModo);
        if (this.yaInstalada()) this.#actualizar({ modo: MODOS.INSTALADA, mensaje: null });
    }

    detener() {
        const v = this.#ventana;
        if (!v) return;
        v.removeEventListener("beforeinstallprompt", this.#alOfrecer);
        v.removeEventListener("appinstalled", this.#alInstalar);
        this.#consulta?.removeEventListener?.("change", this.#alCambiarModo);
    }

    /** Muestra el diálogo del navegador. Devuelve "accepted", "dismissed" o null si no se pudo. */
    async instalar() {
        if (!this.#evento || this.estado.modo !== MODOS.DISPONIBLE) return null;
        const evento = this.#evento;
        this.#evento = null; // El evento solo se puede usar una vez.
        this.#actualizar({ modo: MODOS.INSTALANDO, mensaje: null });
        try {
            await evento.prompt();
            const { outcome } = await evento.userChoice;
            if (outcome === "accepted") {
                // appinstalled confirma; mientras tanto se informa que se está instalando.
                if (this.estado.modo !== MODOS.INSTALADA) this.#actualizar({ modo: MODOS.INSTALANDO, mensaje: "Instalando ChivoMed…" });
            } else if (this.estado.modo !== MODOS.INSTALADA) {
                this.#actualizar({ modo: MODOS.NO_DISPONIBLE, mensaje: null });
            }
            return outcome;
        } catch {
            if (this.estado.modo !== MODOS.INSTALADA) {
                this.#actualizar({ modo: MODOS.NO_DISPONIBLE, mensaje: "No se pudo abrir la instalación. Usa el menú del navegador." });
            }
            return null;
        }
    }

    #ofrecer(evento) {
        evento.preventDefault?.(); // Se muestra nuestro botón en vez del aviso automático del navegador.
        if (this.estado.modo === MODOS.INSTALADA || this.yaInstalada()) return;
        this.#evento = evento;
        this.#actualizar({ modo: MODOS.DISPONIBLE, mensaje: null });
    }

    #instalada() {
        this.#evento = null;
        this.#actualizar({ modo: MODOS.INSTALADA, mensaje: "ChivoMed quedó instalada en este dispositivo." });
    }

    #actualizar(cambios) {
        Object.assign(this.estado, cambios);
    }
}
