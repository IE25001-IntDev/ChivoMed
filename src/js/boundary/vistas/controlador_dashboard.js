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
import { MENSAJE_SIN_DATOS, mensajeGuardado, motivoSinConexion } from "../pwa/controlador_conexion.js";
import { crearEstado } from "../../control/estado_reactivo.js";
import { ZONA_SV } from "../fechas_sv.js";

export const CODIGO_CERRAR_ANTES = "rolCambio.cerrarAntesCambiar";
const CLAVE_MEMORIA = "dashboard.asignaciones";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const MENSAJES = Object.freeze({
    sinRed: MENSAJE_SIN_DATOS,
    conexion: "No pudimos conectar con el servicio. Revisa tu conexión e inténtalo de nuevo.",
    sesionFinalizada: "Tu sesión ha finalizado. Vuelve a iniciar sesión.",
    sinPermiso: "No tienes permiso para usar esa asignación. Comunícate con tu clínica.",
    noDisponible: "El selector de rol todavía no está disponible.",
    generico: "No pudimos cargar tus roles. Inténtalo de nuevo.",
    cambioFallido: "No pudimos cambiar tu rol. Inténtalo de nuevo.",
    /** F8: texto propio para rolCambio.cerrarAntesCambiar; se ignora el message del backend. */
    cerrarAntes: "Tienes una consulta en curso. Sal de ella o ciérrala antes de cambiar de rol.",
    salioDeConsulta: "Saliste de la consulta. Ya puedes cambiar de rol.",
    sesionNoActualizada: "Cambiaste de rol, pero no pudimos actualizar tu sesión. Recarga la página.",
    soloLectura: motivoSinConexion("cambiar de rol"),
    sinAsignaciones: "No tienes roles de empleado activos en ninguna clínica.",
});

const texto = valor => typeof valor === "string" && valor.trim().length > 0;

/** Hora corta para "datos de las HH:MM". */
export function formatearHora(fecha) {
    return fecha instanceof Date && !Number.isNaN(fecha.getTime())
        ? fecha.toLocaleTimeString("es-SV", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ZONA_SV })
        : "";
}

export function mensajeMemoria(fecha) {
    return mensajeGuardado(formatearHora(fecha));
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
    if (error?.code === CODIGO_CERRAR_ANTES) return MENSAJES.cerrarAntes;
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
     * @param opciones opcional, con:
     *   - `servicio`: objeto con `asignaciones`, `cambiarRol`, `contexto` y `salirDeConsulta`, que resuelven { data }.
     *   - `obtenerSesion`: función que pide GET /auth/me y devuelve una promesa con la sesión.
     *   - `conexion`: objeto con `enLinea` y `suscribir`.
     *   - `memoria`: una MemoriaVistas (memoria_vistas.js).
     *   - `reloj`: función que devuelve la fecha actual.
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
            /** F8: idConsulta en curso según GET /atencion, o null. Nunca se guarda en memoria ni en disco. */
            enCurso: null,
            /** F8: true mientras espera el DELETE /atencion/consulta. */
            saliendo: false,
            /** F8: confirmación tras salir de la consulta ("Saliste de la consulta…"). */
            confirmacion: null,
        });
        /** Estado reactivo: se lee como un objeto; los cambios se avisan por `suscribir`. */
        this.estado = estado;
        /** Recibe una función que se llama con el Set de claves que cambiaron y el estado; devuelve la función que cancela. */
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
        // GET /atencion sale a la vez que las asignaciones; si falla, solo se pierde el aviso.
        const contexto = this.#leerEnCurso().then(enCurso => {
            if (id === this.#secuencia) this.#actualizar({ enCurso });
        });
        try {
            const { data } = await this.#servicio.asignaciones();
            await contexto;
            if (id !== this.#secuencia) return;
            this.#asignaciones = normalizarAsignaciones(data);
            this.#hayDatos = true;
            const en = this.#reloj();
            this.#memoria.guardar(this.#clave(), Object.freeze({ asignaciones: this.#asignaciones, en }));
            this.#actualizar({ ...this.#derivados(), cargando: false, vacio: !this.#asignaciones.length,
                desdeMemoria: false, actualizadoEn: en, error: null });
        } catch (error) {
            await contexto;
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
            // Sin red, sin servidor o en solo lectura: el mismo motivo.
            this.#actualizar({ aviso: MENSAJES.soloLectura });
            return false;
        }
        this.#actualizar({ cambiando: idPersonaRol, error: null, aviso: null });
        try {
            await this.#servicio.cambiarRol(idPersonaRol);
        } catch (error) {
            // Consulta en curso: no es un fallo, es el motivo por el que no se puede cambiar. Se
            // ofrecen "Ir a la consulta en curso" y "Salir de la consulta"; si aún no se conoce su
            // id, se pide GET /atencion una sola vez.
            if (error?.code === CODIGO_CERRAR_ANTES) {
                const enCurso = this.estado.enCurso ?? await this.#leerEnCurso();
                this.#actualizar({ cambiando: null, aviso: mensajeDeError(error), confirmacion: null, enCurso });
            } else {
                this.#actualizar({ cambiando: null, error: mensajeDeError(error, { cambio: true }) });
            }
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
        // Con el rol ya cambiado, la confirmación de salida y el motivo del 409 dejan de aplicar.
        this.#actualizar({ ...this.#derivados(), cambiando: null, sesionCambiada: sesion, confirmacion: null, aviso: null });
        return true;
    }

    /** idConsulta en curso según GET /atencion, o null si no hay, no es un UUID o la petición falla. */
    async #leerEnCurso() {
        try {
            const { data } = await this.#servicio.contexto();
            return typeof data?.idConsulta === "string" && UUID.test(data.idConsulta) ? data.idConsulta : null;
        } catch {
            return null;
        }
    }

    /**
     * F8: sale de la consulta en curso sin cerrarla (DELETE /atencion/consulta). No reintenta el
     * cambio de rol: el usuario vuelve a pulsar "Usar este rol". Devuelve true si el backend respondió.
     */
    async salirDeConsulta() {
        if (this.estado.saliendo || this.estado.cambiando) return false;
        if (this.estado.soloLectura || !this.#conexion.enLinea) {
            // Sin red, sin servidor o en solo lectura: el mismo motivo.
            this.#actualizar({ aviso: MENSAJES.soloLectura });
            return false;
        }
        this.#actualizar({ saliendo: true, error: null, confirmacion: null });
        try {
            await this.#servicio.salirDeConsulta();
        } catch (error) {
            // 401: mismo texto que el resto de acciones; DefaultService ya emitió 'sesion-expirada'.
            this.#actualizar({ saliendo: false, error: mensajeDeError(error) });
            return false;
        }
        this.#actualizar({ saliendo: false, enCurso: null, aviso: null, confirmacion: MENSAJES.salioDeConsulta });
        return true;
    }
}
