/**
 * Lógica de la vista de login (HU2) sin DOM: estado, validación y envío.
 * Recibe el servicio por inyección para probarse con dobles en node --test.
 *
 * El controlador solo escribe en su estado reactivo (`estado`, `suscribir`); nunca llama a la vista.
 */
import { AuthService, auth } from "../auth_service.js";
import { RUTAS, RUTA_POR_DEFECTO, TablaRutas } from "../../boundary/rutas.js";
import { Router } from "../../boundary/router.js";
import { FormatoDocumento } from "../formato_documento.js";
import { EstadoReactivo } from "../estado_reactivo.js";

export const MENSAJES = Object.freeze({
    ...FormatoDocumento.MENSAJES,
    sesionFinalizada: "Inicia sesión con tu documento para continuar.",
});

const SIN_ERRORES = Object.freeze({ tipo: null, numero: null });

export class ControladorLogin {
    /** Estado reactivo del controlador (composición): `estado` lo publica y `suscribir` delega en él. */
    #reactivo;
    /** Recibe una función que se llama con el Set de claves que cambiaron y el estado; devuelve la función que cancela. */
    suscribir = fn => this.#reactivo.suscribir(fn);
    #servicio;

    /**
     * @param opciones opcional, con `servicio`: objeto con las funciones `listarTiposDocumento` e
     *   `iniciarSesion` (por defecto, las de auth_service.js).
     */
    constructor({ servicio = auth } = {}) {
        this.#servicio = servicio;
        this.#reactivo = new EstadoReactivo({
            cargandoTipos: false,
            tipos: Object.freeze([]),
            errorTipos: null,
            enviando: false,
            errores: SIN_ERRORES,
            mensaje: null,
        });
        /** Estado reactivo: se lee como un objeto; los cambios se avisan por `suscribir`. */
        this.estado = this.#reactivo.estado;
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
        return FormatoDocumento.autoformatear(valor, this.tipo(idTipoDocumento)?.expresionRegular, anterior);
    }

    cargarTipos() {
        return new Promise(resolve => {
            this.#actualizar({ cargandoTipos: true, errorTipos: null });
            resolve(new Promise(listar => listar(this.#servicio.listarTiposDocumento()))
                .then(tipos => {
                    this.#actualizar({ cargandoTipos: false, tipos: Object.freeze([...tipos]) });
                })
                .catch(error => {
                    this.#actualizar({ cargandoTipos: false, tipos: Object.freeze([]), errorTipos: error.message });
                }));
        });
    }

    /** Devuelve los errores de cada campo (null si es válido) sin modificar el estado. */
    validar({ idTipoDocumento, numeroDocumento }) {
        const tipo = this.tipo(idTipoDocumento);
        return Object.freeze({
            tipo: tipo ? null : MENSAJES.tipoRequerido,
            numero: FormatoDocumento.errorDelNumero(tipo, numeroDocumento),
        });
    }

    /** Devuelve la sesión si existe la persona y el documento activo. */
    enviar(datos) {
        return new Promise(resolve => {
            if (this.estado.enviando) {
                resolve(null);
                return;
            }
            const errores = this.validar(datos);
            if (errores.tipo || errores.numero) {
                this.#actualizar({ errores, mensaje: null });
                resolve(null);
                return;
            }
            this.#actualizar({ enviando: true, errores, mensaje: null });
            resolve(new Promise(iniciar => iniciar(this.#servicio.iniciarSesion(datos.idTipoDocumento, datos.numeroDocumento.trim())))
                .then(sesion => {
                    this.#actualizar({ enviando: false });
                    return sesion;
                })
                .catch(error => {
                    this.#actualizar({ enviando: false, mensaje: error.message });
                    return null;
                }));
        });
    }

    /** Ruta tras el login: protegida solo si el rol permite páginas de empleado. */
    static destinoTrasLogin(query, sesion) {
        const inicio = TablaRutas.inicioPorRol(sesion) ?? RUTA_POR_DEFECTO;
        const volver = Router.rutaDeRetorno(query?.get?.("volver") ?? null, RUTAS);
        if (!volver) return inicio;
        const protegida = Router.resolverRuta(volver, RUTAS).ruta?.empleado;
        return protegida && !AuthService.esEmpleado(sesion) ? inicio : volver;
    }
}
