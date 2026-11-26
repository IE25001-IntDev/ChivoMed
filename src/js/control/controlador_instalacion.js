/**
 * Lógica de <install-prompt> sin DOM: beforeinstallprompt, appinstalled y app ya instalada.
 * Recibe la ventana por inyección para probarse con dobles en node --test.
 *
 * El controlador solo escribe en su estado reactivo (`estado`, `suscribir`); nunca llama a la vista.
 *
 * Invitación: solo al abrir la ventana del ticket (vista_citas.js) se emite EVENTO_OFRECER en document y
 * <install-prompt> llama a invitar(), que pone `invitacion: true` (la vista abre su ventana propia)
 * cada vez, hasta que la app se instale. Con beforeinstallprompt, "Instalar" llama a
 * aceptarInvitacion() (prompt() dentro de ese clic); sin él (Firefox, o Chrome que todavía no la
 * ofrece), la ventana da instrucciones (`instrucciones: true`) con un solo botón "Entendido".
 * "Ahora no", "Entendido", Esc o clic fuera llaman a cerrarInvitacion(): la cierran solo esa vez.
 *
 * Al descargar un ticket, la vista emite EVENTO_INSTALAR después de entregar el PDF y
 * <install-prompt> llama a ofrecerAlDescargar(): con beforeinstallprompt sin usar abre el diálogo del
 * navegador (prompt()) en ese mismo toque; si ese evento ya se usó, no hace nada; si el navegador
 * nunca lo envió (Safari de iPhone, Firefox), hace lo mismo que invitar().
 *
 * Instalada: en modo standalone nunca se invita. appinstalled guarda CLAVE_INSTALADA en localStorage
 * y desde ahí no se invita, ni en una pestaña normal; beforeinstallprompt significa que no está
 * instalada y borra la marca. navigator.getInstalledRelatedApps(), si existe, sirve de apoyo.
 */
import { EstadoReactivo } from "./estado_reactivo.js";

/** Evento que emite la vista de citas (en document) al abrir la ventana del ticket, para invitar a instalar. */
export const EVENTO_OFRECER = "ofrecer-instalacion";
/** Evento que emite la vista (en document) al descargar un ticket, después de entregar el PDF. */
export const EVENTO_INSTALAR = "instalar-al-descargar";
/** Marca en localStorage: ChivoMed se instaló desde este navegador. */
const CLAVE_INSTALADA = "chivomed:instalada";

export class ControladorInstalacion {
    /** Modos del botón "Instalar app" (estado.modo). */
    static MODOS = Object.freeze({
        NO_DISPONIBLE: "no-disponible",
        DISPONIBLE: "disponible",
        INSTALANDO: "instalando",
        INSTALADA: "instalada",
    });

    /** Estado reactivo del controlador (composición): `estado` lo publica y `suscribir` delega en él. */
    #reactivo;
    /** Recibe una función que se llama con el Set de claves que cambiaron y el estado; devuelve la función que cancela. */
    suscribir = fn => this.#reactivo.suscribir(fn);
    #ventana;
    #evento = null;
    /** El beforeinstallprompt recibido ya se usó (prompt()) y no llegó otro. */
    #usado = false;
    /** getInstalledRelatedApps() la encontró instalada (y no llegó beforeinstallprompt después). */
    #relacionada = false;
    #consulta = null;
    #alOfrecer = evento => this.#ofrecer(evento);
    #alInstalar = () => this.#instalada();
    #alCambiarModo = consulta => { if (consulta.matches) this.#instalada(); };

    /**
     * @param opciones objeto con `ventana`: un EventTarget que puede tener `matchMedia` y `navigator`
     *   (window en el navegador; un doble en las pruebas).
     */
    constructor({ ventana }) {
        this.#ventana = ventana;
        this.#reactivo = new EstadoReactivo({ modo: ControladorInstalacion.MODOS.NO_DISPONIBLE, mensaje: null, invitacion: false, instrucciones: false });
        /** Estado reactivo: se lee como un objeto; los cambios se avisan por `suscribir`. */
        this.estado = this.#reactivo.estado;
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
        if (this.yaInstalada()) this.#actualizar({ modo: ControladorInstalacion.MODOS.INSTALADA, mensaje: null });
        this.#consultarRelacionadas();
    }

    /** Apoyo: si el navegador dice que ChivoMed está instalada, no se invita. Si no existe o falla, nada. */
    #consultarRelacionadas() {
        return new Promise(resolve => {
            const navegador = this.#ventana?.navigator;
            if (typeof navegador?.getInstalledRelatedApps !== "function") {
                resolve();
                return;
            }
            resolve(new Promise(consultar => consultar(navegador.getInstalledRelatedApps()))
                .then(apps => {
                    // Un beforeinstallprompt llegado mientras tanto manda: no está instalada.
                    if (Array.isArray(apps) && apps.length > 0 && !this.#evento) this.#relacionada = true;
                })
                .catch(() => { /* Se sigue con la marca. */ }));
        });
    }

    detener() {
        const v = this.#ventana;
        if (!v) return;
        v.removeEventListener("beforeinstallprompt", this.#alOfrecer);
        v.removeEventListener("appinstalled", this.#alInstalar);
        this.#consulta?.removeEventListener?.("change", this.#alCambiarModo);
    }

    #marcaInstalada() {
        try { return this.#ventana?.localStorage?.getItem(CLAVE_INSTALADA) === "1"; } catch { return false; }
    }

    #guardarMarca(instalada) {
        try {
            if (instalada) this.#ventana?.localStorage?.setItem(CLAVE_INSTALADA, "1");
            else this.#ventana?.localStorage?.removeItem(CLAVE_INSTALADA);
        } catch { /* localStorage bloqueado: en esta página manda el modo. */ }
    }

    /**
     * Invitación al buscar o al ingresar: abre la ventana propia (`invitacion: true`) cada vez, hasta
     * que la app se instale. Devuelve true si la abrió.
     */
    invitar() {
        if (this.estado.invitacion || this.yaInstalada() || this.#marcaInstalada() || this.#relacionada
            || this.estado.modo === ControladorInstalacion.MODOS.INSTALADA || this.estado.modo === ControladorInstalacion.MODOS.INSTALANDO) return false;
        const instrucciones = !this.#evento;
        this.#actualizar({ invitacion: true, instrucciones });
        return true;
    }

    /** true si no hay que ofrecer la instalación: ya instalada o instalándose. */
    #instaladaOInstalando() {
        return this.yaInstalada() || this.#marcaInstalada() || this.#relacionada
            || this.estado.modo === ControladorInstalacion.MODOS.INSTALADA || this.estado.modo === ControladorInstalacion.MODOS.INSTALANDO;
    }

    /**
     * Al descargar un ticket (ya entregado el PDF), en el mismo toque: con beforeinstallprompt sin
     * usar, prompt() directo; si ya se usó, nada; si el navegador nunca lo envió, invitar().
     * Devuelve la promesa de instalar() o null si no abrió el diálogo del navegador.
     */
    ofrecerAlDescargar() {
        if (this.#instaladaOInstalando() || this.estado.invitacion) return null;
        if (this.#evento && this.estado.modo === ControladorInstalacion.MODOS.DISPONIBLE) return this.instalar();
        if (!this.#usado) this.invitar();
        return null;
    }

    /** "Instalar" en la ventana: la cierra y llama a prompt() dentro de ese clic. */
    aceptarInvitacion() {
        if (!this.estado.invitacion || this.estado.instrucciones) return null;
        this.#actualizar({ invitacion: false });
        return this.instalar();
    }

    /** "Ahora no", "Entendido", Esc o clic fuera: la cierra solo esa vez. */
    cerrarInvitacion() {
        if (this.estado.invitacion) this.#actualizar({ invitacion: false });
    }

    /** Muestra el diálogo del navegador. Devuelve "accepted", "dismissed" o null si no se pudo. */
    instalar() {
        return new Promise(resolve => {
            if (!this.#evento || this.estado.modo !== ControladorInstalacion.MODOS.DISPONIBLE) {
                resolve(null);
                return;
            }
            const evento = this.#evento;
            this.#evento = null; // El evento solo se puede usar una vez.
            this.#usado = true;
            this.#actualizar({ modo: ControladorInstalacion.MODOS.INSTALANDO, mensaje: null });
            // prompt() se llama en el acto, dentro del gesto del usuario.
            resolve(new Promise(mostrar => mostrar(evento.prompt()))
                .then(() => evento.userChoice)
                .then(({ outcome }) => {
                    if (outcome === "accepted") {
                        // appinstalled confirma; mientras tanto se informa que se está instalando.
                        if (this.estado.modo !== ControladorInstalacion.MODOS.INSTALADA) this.#actualizar({ modo: ControladorInstalacion.MODOS.INSTALANDO, mensaje: "Instalando ChivoMed…" });
                    } else {
                        if (this.estado.modo !== ControladorInstalacion.MODOS.INSTALADA) this.#actualizar({ modo: ControladorInstalacion.MODOS.NO_DISPONIBLE, mensaje: null });
                    }
                    return outcome;
                })
                .catch(() => {
                    if (this.estado.modo !== ControladorInstalacion.MODOS.INSTALADA) {
                        this.#actualizar({ modo: ControladorInstalacion.MODOS.NO_DISPONIBLE, mensaje: "No se pudo abrir la instalación. Usa el menú del navegador." });
                    }
                    return null;
                }));
        });
    }

    #ofrecer(evento) {
        evento.preventDefault?.(); // Se muestra nuestro botón en vez del aviso automático del navegador.
        // El navegador solo lo ofrece si no está instalada: se borra la marca.
        this.#relacionada = false;
        this.#usado = false;
        this.#guardarMarca(false);
        if (this.estado.modo === ControladorInstalacion.MODOS.INSTALADA || this.yaInstalada()) return;
        this.#evento = evento;
        this.#actualizar({ modo: ControladorInstalacion.MODOS.DISPONIBLE, mensaje: null });
    }

    #instalada() {
        this.#evento = null;
        this.#guardarMarca(true);
        this.#actualizar({ modo: ControladorInstalacion.MODOS.INSTALADA, mensaje: "ChivoMed quedó instalada en este dispositivo.", invitacion: false });
    }

    #actualizar(cambios) {
        Object.assign(this.estado, cambios);
    }
}
