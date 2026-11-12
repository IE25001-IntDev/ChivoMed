/**
 * Lógica de la vista de login (HU2) sin DOM: estado, validación y envío.
 * Recibe el servicio por inyección para probarse con dobles en node --test.
 */
import { listarTiposDocumento, iniciarSesion, cerrarSesion } from "../../control/auth_service.js";
import { ROLES_EMPLEADO, RUTAS, RUTA_INICIO_EMPLEADO } from "../rutas.js";
import { rutaDeRetorno } from "../router.js";

export const MAX_NUMERO_DOCUMENTO = 50;

export const MENSAJES = Object.freeze({
    tipoRequerido: "Selecciona el tipo de documento.",
    numeroRequerido: "Escribe tu número de documento.",
    numeroLargo: `El número no puede tener más de ${MAX_NUMERO_DOCUMENTO} caracteres.`,
    soloPersonal: "Este acceso es solo para personal médico y administrativo.",
    sesionFinalizada: "Inicia sesión con tu documento para continuar.",
});

/** Convierte la expresión del catálogo en una prueba de valor completo; null si no hay o es inválida. */
export function crearValidadorFormato(expresionRegular) {
    if (typeof expresionRegular !== "string" || !expresionRegular.trim()) return null;
    try {
        const patron = new RegExp(`^(?:${expresionRegular})$`);
        return valor => patron.test(valor);
    } catch {
        return null; // El backend vuelve a validar; una expresión mal escrita no bloquea el acceso.
    }
}

/** Ruta a la que se entra después del login: el `volver` válido o el dashboard. */
export function destinoTrasLogin(query) {
    return rutaDeRetorno(query?.get?.("volver") ?? null, RUTAS) ?? RUTA_INICIO_EMPLEADO;
}

export class ControladorLogin {
    #servicio;
    #alCambiar;

    /**
     * @param {object} [opciones]
     * @param {{ listarTiposDocumento: Function, iniciarSesion: Function, cerrarSesion: Function }} [opciones.servicio]
     * @param {(estado: object) => void} [opciones.alCambiar]
     */
    constructor({ servicio = { listarTiposDocumento, iniciarSesion, cerrarSesion }, alCambiar = () => {} } = {}) {
        this.#servicio = servicio;
        this.#alCambiar = alCambiar;
        this.estado = {
            cargandoTipos: false,
            tipos: [],
            errorTipos: null,
            enviando: false,
            errores: { tipo: null, numero: null },
            mensaje: null,
        };
    }

    #actualizar(cambios) {
        this.estado = { ...this.estado, ...cambios };
        this.#alCambiar(this.estado);
    }

    tipo(idTipoDocumento) {
        return this.estado.tipos.find(t => t.idTipoDocumento === idTipoDocumento) ?? null;
    }

    async cargarTipos() {
        this.#actualizar({ cargandoTipos: true, errorTipos: null });
        try {
            const tipos = await this.#servicio.listarTiposDocumento();
            this.#actualizar({ cargandoTipos: false, tipos });
        } catch (error) {
            this.#actualizar({ cargandoTipos: false, tipos: [], errorTipos: error.message });
        }
    }

    /** Devuelve los errores de cada campo (null si es válido) sin modificar el estado. */
    validar({ idTipoDocumento, numeroDocumento }) {
        const tipo = this.tipo(idTipoDocumento);
        const numero = typeof numeroDocumento === "string" ? numeroDocumento.trim() : "";
        const errores = { tipo: null, numero: null };
        if (!tipo) errores.tipo = MENSAJES.tipoRequerido;
        if (!numero) errores.numero = MENSAJES.numeroRequerido;
        else if (numero.length > MAX_NUMERO_DOCUMENTO) errores.numero = MENSAJES.numeroLargo;
        else if (tipo) {
            const formato = crearValidadorFormato(tipo.expresionRegular);
            if (formato && !formato(numero)) {
                errores.numero = tipo.indicaciones
                    ? `El número no tiene el formato de ${tipo.nombre}. ${tipo.indicaciones}`
                    : `El número no tiene el formato de ${tipo.nombre}.`;
            }
        }
        return errores;
    }

    /** Devuelve la sesión si el personal puede entrar; null si hubo errores (quedan en el estado). */
    async enviar(datos) {
        if (this.estado.enviando) return null;
        const errores = this.validar(datos);
        if (errores.tipo || errores.numero) {
            this.#actualizar({ errores, mensaje: null });
            return null;
        }
        this.#actualizar({ enviando: true, errores, mensaje: null });
        try {
            const sesion = await this.#servicio.iniciarSesion(datos.idTipoDocumento, datos.numeroDocumento.trim());
            if (!ROLES_EMPLEADO.includes(sesion?.rolActivo?.codigo)) {
                // La sesión ya existe en el servidor: se cierra para no dejarla abierta.
                try { await this.#servicio.cerrarSesion(sesion?.csrfToken); } catch { /* Se informa el rechazo igual. */ }
                this.#actualizar({ enviando: false, mensaje: MENSAJES.soloPersonal });
                return null;
            }
            this.#actualizar({ enviando: false });
            return sesion;
        } catch (error) {
            this.#actualizar({ enviando: false, mensaje: error.message });
            return null;
        }
    }
}
