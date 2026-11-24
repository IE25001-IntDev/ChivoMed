/**
 * Lógica de la vista de login (HU2) sin DOM: estado, validación y envío.
 * Recibe el servicio por inyección para probarse con dobles en node --test.
 *
 * El controlador solo escribe en su estado reactivo (`estado`, `suscribir`); nunca llama a la vista.
 */
import { listarTiposDocumento, iniciarSesion, esEmpleado } from "../../control/auth_service.js";
import { RUTAS, RUTA_POR_DEFECTO, inicioPorRol } from "../rutas.js";
import { rutaDeRetorno, resolverRuta } from "../router.js";
import { autoformatear, crearValidadorFormato } from "../../control/formato_documento.js";
import { crearEstado } from "../../control/estado_reactivo.js";
import { Validaciones } from "../../control/validaciones.js";

export const MENSAJES = Object.freeze({
    tipoRequerido: "Selecciona el tipo de documento.",
    numeroRequerido: "Escribe tu número de documento.",
    numeroLargo: `El número no puede tener más de ${Validaciones.MAX_NUMERO_DOCUMENTO} caracteres.`,
    sesionFinalizada: "Inicia sesión con tu documento para continuar.",
});

/** Ruta tras el login: protegida solo si el rol permite páginas de empleado. */
export function destinoTrasLogin(query, sesion) {
    const inicio = inicioPorRol(sesion) ?? RUTA_POR_DEFECTO;
    const volver = rutaDeRetorno(query?.get?.("volver") ?? null, RUTAS);
    if (!volver) return inicio;
    const protegida = resolverRuta(volver, RUTAS).ruta?.empleado;
    return protegida && !esEmpleado(sesion) ? inicio : volver;
}

const SIN_ERRORES = Object.freeze({ tipo: null, numero: null });

export class ControladorLogin {
    #servicio;

    /**
     * @param opciones opcional, con `servicio`: objeto con las funciones `listarTiposDocumento` e
     *   `iniciarSesion` (por defecto, las de auth_service.js).
     */
    constructor({ servicio = { listarTiposDocumento, iniciarSesion } } = {}) {
        this.#servicio = servicio;
        const { estado, suscribir } = crearEstado({
            cargandoTipos: false,
            tipos: Object.freeze([]),
            errorTipos: null,
            enviando: false,
            errores: SIN_ERRORES,
            mensaje: null,
        });
        /** Estado reactivo: se lee como un objeto; los cambios se avisan por `suscribir`. */
        this.estado = estado;
        /** Recibe una función que se llama con el Set de claves que cambiaron y el estado; devuelve la función que cancela. */
        this.suscribir = suscribir;
    }

    #actualizar(cambios) {
        Object.assign(this.estado, cambios);
    }

    tipo(idTipoDocumento) {
        return this.estado.tipos.find(t => t.idTipoDocumento === idTipoDocumento) ?? null;
    }

    /**
     * Número con los guiones del formato del tipo, al escribir hacia adelante (p. ej., DUI
     * "010000044" → "01000004-4"). `anterior` es el valor previo del campo: si el nuevo es más
     * corto (se está borrando), se devuelve tal cual.
     */
    formatearNumero(idTipoDocumento, valor, anterior) {
        return autoformatear(valor, this.tipo(idTipoDocumento)?.expresionRegular, anterior);
    }

    async cargarTipos() {
        this.#actualizar({ cargandoTipos: true, errorTipos: null });
        try {
            const tipos = await this.#servicio.listarTiposDocumento();
            this.#actualizar({ cargandoTipos: false, tipos: Object.freeze([...tipos]) });
        } catch (error) {
            this.#actualizar({ cargandoTipos: false, tipos: Object.freeze([]), errorTipos: error.message });
        }
    }

    /** Devuelve los errores de cada campo (null si es válido) sin modificar el estado. */
    validar({ idTipoDocumento, numeroDocumento }) {
        const tipo = this.tipo(idTipoDocumento);
        const numero = typeof numeroDocumento === "string" ? numeroDocumento.trim() : "";
        const errores = { tipo: null, numero: null };
        if (!tipo) errores.tipo = MENSAJES.tipoRequerido;
        if (!numero) errores.numero = MENSAJES.numeroRequerido;
        else if (numero.length > Validaciones.MAX_NUMERO_DOCUMENTO) errores.numero = MENSAJES.numeroLargo;
        else if (tipo) {
            const formato = crearValidadorFormato(tipo.expresionRegular);
            if (formato && !formato(numero)) {
                errores.numero = tipo.indicaciones
                    ? `El número no tiene el formato de ${tipo.nombre}. ${tipo.indicaciones}`
                    : `El número no tiene el formato de ${tipo.nombre}.`;
            }
        }
        return Object.freeze(errores);
    }

    /** Devuelve la sesión si existe la persona y el documento activo. */
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
            this.#actualizar({ enviando: false });
            return sesion;
        } catch (error) {
            this.#actualizar({ enviando: false, mensaje: error.message });
            return null;
        }
    }
}
