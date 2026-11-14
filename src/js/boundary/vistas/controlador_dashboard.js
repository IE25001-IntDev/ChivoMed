/**
 * Lógica del selector de rol y clínica del dashboard (HU3, parte 1) sin DOM.
 * Carga las asignaciones del empleado, las agrupa por clínica, marca la activa, cambia el rol
 * (PUT /atencion/rol-activo) y refresca la sesión con /auth/me. Guarda en memoria lo último
 * cargado para seguir mostrándolo sin red. Todo llega por inyección para probarse con node --test.
 *
 * El controlador solo escribe en su estado reactivo (`estado`, `suscribir`); nunca llama a la vista.
 * Un cambio de rol confirmado se publica en `estado.sesionCambiada`.
 */
import AtencionService from "../../control/atencion_service.js";
import { obtenerSesion as obtenerSesionHttp, CODIGO_PACIENTE, ROL_SIN_NOMBRE } from "../../control/auth_service.js";
import { MemoriaVistas, memoria as memoriaCompartida } from "./memoria_vistas.js";
import { conexion as conexionCompartida } from "../pwa/conexion.js";
import { MENSAJE_SIN_RED } from "../pwa/controlador_conexion.js";
import { crearEstado } from "../../control/estado_reactivo.js";

export const CODIGO_CERRAR_ANTES = "rolCambio.cerrarAntesCambiar";
const CLAVE_MEMORIA = "dashboard.asignaciones";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MENSAJES = Object.freeze({
    sinRed: "Sin conexión. Tus roles se mostrarán cuando vuelvas a conectarte.",
    conexion: "No pudimos conectar con el servicio. Revisa tu conexión e inténtalo de nuevo.",
    sesionFinalizada: "Tu sesión ha finalizado. Vuelve a iniciar sesión.",
    sinPermiso: "No tienes permiso para usar esa asignación. Comunícate con tu clínica.",
    noDisponible: "El selector de rol todavía no está disponible.",
    generico: "No pudimos cargar tus roles. Inténtalo de nuevo.",
    cambioFallido: "No pudimos cambiar tu rol. Inténtalo de nuevo.",
    cerrarAntes: "Cierra la consulta en curso antes de cambiar de rol.",
    sesionNoActualizada: "Cambiaste de rol, pero no pudimos actualizar tu sesión. Recarga la página.",
    soloLectura: "Estás sin conexión: puedes ver tus roles, pero cambiar de rol requiere red.",
    sinAsignaciones: "No tienes roles de empleado activos en ninguna clínica.",
});

const texto = valor => typeof valor === "string" && valor.trim().length > 0;

/** Hora corta para "datos de las HH:MM". */
export function formatearHora(fecha) {
    return fecha instanceof Date && !Number.isNaN(fecha.getTime())
        ? fecha.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit" })
        : "";
}

export function mensajeMemoria(fecha) {
    const hora = formatearHora(fecha);
    return hora ? `Sin conexión. Mostrando tus roles guardados a las ${hora}.` : "Sin conexión. Mostrando tus roles guardados.";
}

/**
 * Valida y limpia el DTO de GET /atencion/asignaciones. Descarta entradas incompletas, repetidas o
 * de PACIENTE (defensa: el backend ya las excluye). Un rol sin código es de empleado (B8).
 */
export function normalizarAsignaciones(datos) {
    if (!Array.isArray(datos)) return [];
    const vistos = new Set();
    const resultado = [];
    for (const a of datos) {
        if (!a || typeof a.idPersonaRol !== "string" || !UUID.test(a.idPersonaRol)
            || typeof a.idClinica !== "string" || !UUID.test(a.idClinica)
            || a.codigoRol === CODIGO_PACIENTE || !(a.codigoRol == null || texto(a.codigoRol)) || !texto(a.nombreClinica)
            || vistos.has(a.idPersonaRol)) continue;
        vistos.add(a.idPersonaRol);
        resultado.push(Object.freeze({
            idPersonaRol: a.idPersonaRol,
            codigoRol: texto(a.codigoRol) ? a.codigoRol : null,
            nombreRol: texto(a.nombreRol) ? a.nombreRol.trim() : ROL_SIN_NOMBRE,
            idClinica: a.idClinica,
            nombreClinica: a.nombreClinica.trim(),
            activa: a.activa === true,
        }));
    }
    return resultado;
}

/**
 * Agrupa por clínica y marca la asignación activa. La fuente de verdad es el rol activo de la
 * sesión (/auth/me); el campo `activa` del DTO solo se usa si no hay sesión.
 * La clínica activa va primero; el resto, por nombre. Los roles, por nombre.
 */
export function agruparPorClinica(asignaciones, idPersonaRolActivo = null) {
    const comparar = (a, b) => a.localeCompare(b, "es");
    const grupos = new Map();
    for (const a of asignaciones) {
        const activa = idPersonaRolActivo ? a.idPersonaRol === idPersonaRolActivo : a.activa;
        if (!grupos.has(a.idClinica)) grupos.set(a.idClinica, { idClinica: a.idClinica, nombreClinica: a.nombreClinica, activa: false, roles: [] });
        const grupo = grupos.get(a.idClinica);
        grupo.roles.push(Object.freeze({ ...a, activa }));
        grupo.activa ||= activa;
    }
    return Object.freeze([...grupos.values()]
        .map(g => Object.freeze({ ...g, roles: Object.freeze(g.roles.sort((a, b) => comparar(a.nombreRol, b.nombreRol))) }))
        .sort((a, b) => (b.activa - a.activa) || comparar(a.nombreClinica, b.nombreClinica)));
}

/** Traduce un error del servicio a un texto para el usuario, sin detalles internos. */
export function mensajeDeError(error, { cambio = false } = {}) {
    if (error?.code === CODIGO_CERRAR_ANTES) return texto(error.message) ? error.message : MENSAJES.cerrarAntes;
    switch (error?.status) {
        case 0: return MENSAJES.conexion;
        case 401: return MENSAJES.sesionFinalizada;
        case 403: return MENSAJES.sinPermiso;
        case 404: return MENSAJES.noDisponible;
        // 409 de verificarSesionActual ("La sesión cambió…") u otro conflicto: el mensaje ya es para el usuario.
        case 409: return texto(error.message) ? error.message : (cambio ? MENSAJES.cambioFallido : MENSAJES.generico);
        default: return cambio ? MENSAJES.cambioFallido : MENSAJES.generico;
    }
}

export class ControladorDashboard {
    #servicio;
    #obtenerSesion;
    #conexion;
    #memoria;
    #reloj;
    #secuencia = 0;
    #cancelarConexion = null;
    #asignaciones = [];
    #hayDatos = false;

    /**
     * @param {object} [opciones]
     * @param {{ asignaciones: Function, cambiarRol: Function }} [opciones.servicio] resuelven { data }
     * @param {() => Promise<object>} [opciones.obtenerSesion] GET /auth/me
     * @param {{ enLinea: boolean, suscribir: Function }} [opciones.conexion]
     * @param {MemoriaVistas} [opciones.memoria]
     * @param {() => Date} [opciones.reloj]
     */
    constructor({ servicio, obtenerSesion = obtenerSesionHttp, conexion = conexionCompartida,
        memoria = memoriaCompartida, reloj = () => new Date() } = {}) {
        this.#servicio = servicio ?? new AtencionService();
        this.#obtenerSesion = obtenerSesion;
        this.#conexion = conexion;
        this.#memoria = memoria;
        this.#reloj = reloj;
        const { estado, suscribir } = crearEstado({
            sesion: null,
            /** Sesión nueva tras un cambio de rol confirmado; nunca se escribe al iniciar. */
            sesionCambiada: null,
            soloLectura: false,
            enLinea: conexion.enLinea,
            cargando: false,
            cambiando: null,
            grupos: Object.freeze([]),
            activa: null,
            vacio: false,
            error: null,
            aviso: null,
            desdeMemoria: false,
            actualizadoEn: null,
        });
        /** Estado reactivo: se lee como un objeto; los cambios se avisan por `suscribir`. */
        this.estado = estado;
        /** (fn: (cambios: Set<string>, estado) => void) => cancelar */
        this.suscribir = suscribir;
    }

    #actualizar(cambios) {
        Object.assign(this.estado, cambios);
    }

    #clave() {
        return MemoriaVistas.clave(this.estado.sesion, CLAVE_MEMORIA);
    }

    /** Recalcula grupos y activa a partir de las asignaciones y la sesión vigentes. */
    #derivados() {
        const grupos = agruparPorClinica(this.#asignaciones, this.estado.sesion?.rolActivo?.idPersonaRol ?? null);
        const activa = grupos.flatMap(g => g.roles).find(r => r.activa) ?? null;
        return { grupos, activa };
    }

    /**
     * Prepara la vista con la sesión del router. Si hay datos en memoria del mismo usuario los
     * muestra de inmediato y luego recarga. `soloLectura` lo pone el router cuando no hay red.
     */
    iniciar(sesion, { soloLectura = false } = {}) {
        this.#cancelarConexion?.();
        this.#cancelarConexion = this.#conexion.suscribir?.(enLinea => this.#alCambiarRed(enLinea)) ?? null;
        this.#actualizar({ sesion, soloLectura, enLinea: this.#conexion.enLinea });
        const guardado = this.#memoria.leer(this.#clave());
        if (guardado) {
            this.#asignaciones = guardado.asignaciones;
            this.#hayDatos = true;
            // En línea se muestran mientras llega la respuesta; solo se avisa "guardados" sin red.
            this.#actualizar({ ...this.#derivados(), vacio: !guardado.asignaciones.length,
                desdeMemoria: !this.#conexion.enLinea, actualizadoEn: guardado.en });
        }
        return this.cargar();
    }

    detener() {
        this.#cancelarConexion?.();
        this.#cancelarConexion = null;
        this.#secuencia++;
    }

    #alCambiarRed(enLinea) {
        this.#actualizar({ enLinea, aviso: enLinea ? null : this.estado.aviso });
        if (enLinea && (this.estado.desdeMemoria || this.estado.error)) this.cargar();
    }

    async cargar() {
        const tieneDatos = this.#hayDatos;
        if (!this.#conexion.enLinea) {
            this.#actualizar(tieneDatos
                ? { cargando: false, desdeMemoria: true, error: null }
                : { cargando: false, error: MENSAJES.sinRed });
            return;
        }
        const id = ++this.#secuencia;
        this.#actualizar({ cargando: true, error: null });
        try {
            const { data } = await this.#servicio.asignaciones();
            if (id !== this.#secuencia) return;
            this.#asignaciones = normalizarAsignaciones(data);
            this.#hayDatos = true;
            const en = this.#reloj();
            this.#memoria.guardar(this.#clave(), Object.freeze({ asignaciones: this.#asignaciones, en }));
            this.#actualizar({ ...this.#derivados(), cargando: false, vacio: !this.#asignaciones.length,
                desdeMemoria: false, actualizadoEn: en, error: null });
        } catch (error) {
            if (id !== this.#secuencia) return;
            if (error?.status === 0 && tieneDatos) {
                this.#actualizar({ cargando: false, desdeMemoria: true, error: null });
                return;
            }
            this.#actualizar({ cargando: false, error: mensajeDeError(error) });
        }
    }

    /** Cambia el rol activo. Devuelve true solo si el backend lo aceptó y la sesión se refrescó. */
    async cambiar(idPersonaRol) {
        if (this.estado.cambiando) return false;
        const destino = this.#asignaciones.find(a => a.idPersonaRol === idPersonaRol);
        if (!destino || destino.idPersonaRol === this.estado.activa?.idPersonaRol) return false;
        if (this.estado.soloLectura || !this.#conexion.enLinea) {
            this.#actualizar({ aviso: this.estado.soloLectura ? MENSAJES.soloLectura : MENSAJE_SIN_RED });
            return false;
        }
        this.#actualizar({ cambiando: idPersonaRol, error: null, aviso: null });
        try {
            await this.#servicio.cambiarRol(idPersonaRol);
        } catch (error) {
            // Consulta en curso: no es un fallo, es el motivo por el que no se puede cambiar.
            if (error?.code === CODIGO_CERRAR_ANTES) this.#actualizar({ cambiando: null, aviso: mensajeDeError(error) });
            else this.#actualizar({ cambiando: null, error: mensajeDeError(error, { cambio: true }) });
            return false;
        }
        let sesion;
        try {
            sesion = await this.#obtenerSesion();
        } catch {
            this.#actualizar({ cambiando: null, error: MENSAJES.sesionNoActualizada });
            return false;
        }
        this.#actualizar({ sesion });
        this.#actualizar({ ...this.#derivados(), cambiando: null, sesionCambiada: sesion });
        return true;
    }
}
