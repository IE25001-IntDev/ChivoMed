/**
 * Lógica de la vista de una consulta (HU4) sin DOM.
 *
 * Al iniciar retoma la consulta en la sesión (PUT /consultas/{id}/sesion), la lee con
 * GET /atencion/consultas/{id} (misma forma que un elemento del dashboard) y, del paso PENDIENTE
 * actual, pide su registro, sus órdenes, los exámenes asignables y si es el último paso
 * (`indicaFin` de su definición). Son peticiones fijas: nunca una por paso o procedimiento.
 *
 * Acciones: completar el paso ("Avanzar", o "Completar paso" si es el último), retroceder al
 * anterior, emitir órdenes y cerrar la consulta. Solo el rol DOCTOR atiende; los demás roles, una
 * consulta cerrada o la falta de red dejan la vista en solo lectura con su motivo.
 *
 * El controlador solo escribe en su estado reactivo (`estado`, `suscribir`); nunca llama a la vista.
 * Lo cargado y el borrador quedan en memoria_vistas (nunca en disco) para seguir mostrándolos sin red.
 */
import AtencionService from "../../control/atencion_service.js";
import ConsultaService from "../../control/consulta_service.js";
import ConsultaProcedimientoPasoService from "../../control/consulta_procedimiento_paso_service.js";
import ProcedimientoPasoService from "../../control/procedimiento_paso_service.js";
import { crearEstado } from "../../control/estado_reactivo.js";
import { MemoriaVistas, memoria as memoriaCompartida } from "./memoria_vistas.js";
import { conexion as conexionCompartida } from "../pwa/conexion.js";
import { normalizarConsultas, ROL_ATIENDE, MENSAJES as MENSAJES_DASHBOARD } from "./controlador_consultas.js";

export const MAX_TEXTO = 255;
const NINGUNA = Object.freeze([]);
const congelar = Object.freeze;
const texto = valor => typeof valor === "string" && valor.trim().length > 0;

export const MENSAJES = Object.freeze({
    soloDoctor: MENSAJES_DASHBOARD.soloDoctor,
    cerrada: "Esta consulta ya está cerrada.",
    cerradaAhora: "Consulta cerrada.",
    sinRed: "Sin conexión: necesitas red para registrar la atención.",
    sinRedCarga: "Necesitas conexión para abrir esta consulta.",
    desdeMemoria: hora => `Sin conexión. Mostrando la consulta guardada a las ${hora}.`,
    enCurso: "Tienes otra consulta en curso. Ciérrala antes de atender esta.",
    noEncontrada: "No encontramos esta consulta en tu clínica.",
    sinPermiso: "No tienes permiso para atender esta consulta.",
    sesionFinalizada: "Tu sesión ha finalizado. Vuelve a iniciar sesión.",
    conexion: "No pudimos conectar con el servicio. Revisa tu conexión e inténtalo de nuevo.",
    generico: "No pudimos completar la operación. Inténtalo de nuevo.",
    detalle: "No pudimos cargar el paso actual. Inténtalo de nuevo.",
    cargandoPaso: "Cargando el paso actual…",
    reabierto: "Paso reabierto: se cargó lo que se había registrado. Al avanzar se guardará lo que esté en este campo.",
    sinPendientes: "No quedan pasos pendientes en esta consulta.",
    retrocesoConOrdenes: "Este paso ya tiene órdenes de examen; no se puede retroceder.",
    retrocesoConRegistro: "Este paso ya tiene un registro guardado; no se puede retroceder.",
    accionEnCurso: "Espera a que termine la operación en curso.",
    examenRequerido: "Elige un examen de la lista.",
    textoLargo: `Admite hasta ${MAX_TEXTO} caracteres.`,
    sinExamen: "Orden sin examen asociado",
    examenNoDisponible: "Examen ya no disponible",
});

/** Texto propio por `code` del backend (HU4). Los no listados usan el `message` del backend. */
const POR_CODIGO = Object.freeze({
    "consulta.yaCerrada": MENSAJES.cerrada,
    "consulta.cerrarAntesRetomar": MENSAJES.enCurso,
    "consulta.retrocesoPrimerPaso": "Es el primer paso del procedimiento; no hay un paso anterior al cual regresar.",
    "consulta.retrocesoConRegistros": "Este paso ya tiene registros (valor u órdenes de examen); no se puede retroceder.",
    "consulta.retrocesoAnteriorPendiente": "El paso anterior no está completado; no se puede retroceder.",
    "consulta.retrocesoRamificado": "Este paso es parte de una ramificación del procedimiento; no se puede retroceder automáticamente.",
    "consulta.pasoSinDefinicionHistorica": "Este paso no tiene definición en el catálogo; no se puede retroceder.",
    "consulta.pasoYaCompletado": "Este paso ya estaba completado. Actualizamos la consulta.",
    "consulta.pasosPrevios": "Completa primero los pasos anteriores.",
    "consulta.completeAntesCerrar": "Completa todos los pasos antes de cerrar la consulta.",
    "consulta.ordenPasoCompletado": "No se pueden emitir órdenes en un paso completado.",
    "consulta.examenObligatorio": MENSAJES.examenRequerido,
    "consulta.examenNoAsignable": "Ese examen ya no se puede asignar a este paso. Actualizamos la lista.",
    "consulta.indicacionesValidas": `Las indicaciones admiten hasta ${MAX_TEXTO} caracteres.`,
    "consulta.otraClinica": MENSAJES.noEncontrada,
    "auth.permiso": MENSAJES.sinPermiso,
});

/** Códigos cuyo `message` del backend es más útil que un texto fijo (p. ej., trae el nombre del procedimiento). */
const USAR_MENSAJE_BACKEND = new Set(["consulta.procedimientoSinFinal"]);

/** Traduce un error del servicio a un texto para el usuario, sin detalles internos. */
export function mensajeDeErrorConsulta(error) {
    const code = error?.code;
    if (USAR_MENSAJE_BACKEND.has(code)) return texto(error.message) ? error.message.trim() : "Un procedimiento no ha llegado a su paso final.";
    if (code && Object.hasOwn(POR_CODIGO, code)) return POR_CODIGO[code];
    switch (error?.status) {
        case 0: return MENSAJES.conexion;
        case 401: return MENSAJES.sesionFinalizada;
        case 403: return MENSAJES.sinPermiso;
        case 404: return MENSAJES.noEncontrada;
        case 400: case 409: return texto(error.message) ? error.message.trim() : MENSAJES.generico;
        default: return MENSAJES.generico;
    }
}

/** "Administración" → "ADMINISTRACION": compara el nombre del rol del dashboard con el código de la sesión. */
export function codigoDeRol(nombre) {
    return typeof nombre === "string" ? nombre.normalize("NFD").replace(/\p{M}/gu, "").trim().toUpperCase() : null;
}

/** Pasos PENDIENTE de la consulta, en orden, con el nombre de su procedimiento. */
export function pasosPendientes(consulta) {
    if (!consulta) return NINGUNA;
    return congelar(consulta.procedimientos.flatMap(p => p.pasos
        .filter(s => s.estado === "PENDIENTE")
        .map(paso => congelar({ paso, procedimiento: p.nombre }))));
}

/**
 * Paso actual: el elegido si sigue PENDIENTE; si no, el primero cuyo responsable tiene el rol
 * activo; si ninguno, el primero. null si no quedan pendientes.
 */
export function elegirPasoActual(consulta, codigoRol, idElegido = null) {
    const pendientes = pasosPendientes(consulta).map(p => p.paso);
    if (!pendientes.length) return null;
    return pendientes.find(p => p.idConsultaProcedimientoPaso === idElegido)
        ?? pendientes.find(p => codigoRol && codigoDeRol(p.responsable?.rol) === codigoRol)
        ?? pendientes[0];
}

/** Motivo por el que toda la vista queda en solo lectura, en orden de prioridad; null si se puede atender. */
export function motivoBloqueo({ rol, consulta, enLinea = true, soloLectura = false }) {
    if (rol !== ROL_ATIENDE) return MENSAJES.soloDoctor;
    if (consulta?.fechaFin) return MENSAJES.cerrada;
    if (!enLinea || soloLectura) return MENSAJES.sinRed;
    return null;
}

/** Retroceder solo se ofrece si el paso no es el primero de su procedimiento. */
export function puedeOfrecerRetroceso(paso) {
    return Boolean(paso) && paso.nivel > 0;
}

/** null si se puede retroceder; si no, el motivo que el frontend ya conoce (el backend decide el resto). */
export function motivoNoRetroceder({ ordenes = NINGUNA, valorGuardado = null } = {}) {
    if (ordenes.length) return MENSAJES.retrocesoConOrdenes;
    if (texto(valorGuardado)) return MENSAJES.retrocesoConRegistro;
    return null;
}

/** El cierre se ofrece cuando la consulta está abierta, tiene procedimientos y no quedan pasos PENDIENTE. */
export function puedeCerrar(consulta) {
    return Boolean(consulta) && !consulta.fechaFin && consulta.procedimientos.length > 0 && pasosPendientes(consulta).length === 0;
}

/** Nombre que se muestra para una orden emitida. */
export function nombreDeOrden(orden, asignables) {
    if (!orden?.idExamen) return MENSAJES.sinExamen;
    return asignables.find(e => e.idExamen === orden.idExamen)?.nombre ?? MENSAJES.examenNoDisponible;
}

/** Valida una orden antes de enviarla. Devuelve el mensaje o null. */
export function validarOrden({ idExamen, indicaciones } = {}, asignables = NINGUNA) {
    if (!idExamen || !asignables.some(e => e.idExamen === idExamen)) return MENSAJES.examenRequerido;
    if (typeof indicaciones === "string" && indicaciones.trim().length > MAX_TEXTO) return `Las indicaciones admiten hasta ${MAX_TEXTO} caracteres.`;
    return null;
}

function normalizarAsignables(datos) {
    if (!Array.isArray(datos)) return NINGUNA;
    return congelar(datos.filter(e => e && texto(e.idExamen) && texto(e.nombre))
        .map(e => congelar({ idExamen: e.idExamen, nombre: e.nombre.trim() })));
}

function normalizarOrdenes(datos) {
    if (!Array.isArray(datos)) return NINGUNA;
    return congelar(datos.filter(o => o && texto(o.idOrdenExamen)).map(o => congelar({
        idOrdenExamen: o.idOrdenExamen,
        idExamen: texto(o.idExamen) ? o.idExamen : null,
        indicaciones: texto(o.indicaciones) ? o.indicaciones.trim() : null,
        fechaCreacion: texto(o.fechaCreacion) ? o.fechaCreacion : null,
    })));
}

/** Servicio por defecto: adapta los servicios REST a las operaciones que usa el controlador. */
export function servicioConsulta({
    atencion = new AtencionService(), consultas = new ConsultaService(),
    pasos = new ConsultaProcedimientoPasoService(), definiciones = new ProcedimientoPasoService(),
} = {}) {
    return {
        retomar: id => consultas.retomar(id),
        contexto: () => atencion.contexto(),
        consulta: id => atencion.consulta(id),
        paso: id => pasos.buscarPorId(id),
        definicion: id => definiciones.buscarPorId(id),
        ordenes: id => pasos.ordenesExamen(id).listar(),
        asignables: id => pasos.examenesAsignables(id),
        completar: (id, valor) => pasos.completar(id, valor),
        retroceder: id => pasos.retroceder(id),
        ordenar: (id, datos) => pasos.ordenar(id, datos),
        cerrar: (id, notas) => consultas.cerrar(id, notas),
    };
}

const SIN_DETALLE = congelar({ idPaso: null, cargando: false, error: null, valorGuardado: null, indicaFin: null, ordenes: NINGUNA, asignables: NINGUNA });

export class ControladorConsulta {
    #servicio;
    #conexion;
    #memoria;
    #reloj;
    #secuencia = 0;
    #secuenciaDetalle = 0;
    #cancelarConexion = null;

    /**
     * @param {object} [opciones]
     * @param {object} [opciones.servicio] operaciones de servicioConsulta(); resuelven { data }
     * @param {{ enLinea: boolean, suscribir: Function }} [opciones.conexion]
     * @param {MemoriaVistas} [opciones.memoria]
     * @param {() => Date} [opciones.reloj]
     */
    constructor({ servicio, conexion = conexionCompartida, memoria = memoriaCompartida, reloj = () => new Date() } = {}) {
        this.#servicio = servicio ?? servicioConsulta();
        this.#conexion = conexion;
        this.#memoria = memoria;
        this.#reloj = reloj;
        const { estado, suscribir } = crearEstado({
            sesion: null,
            soloLectura: false,
            enLinea: conexion.enLinea,
            idConsulta: null,
            cargando: false,
            /** Error de la carga de la consulta; con él no hay nada que mostrar. */
            error: null,
            /** idConsulta de la consulta en curso cuando esta no se pudo retomar (409). */
            enCurso: null,
            consulta: null,
            /** idConsultaProcedimientoPaso elegido en el selector; null usa el del rol activo. */
            idElegido: null,
            /** Datos del paso actual: { idPaso, cargando, error, valorGuardado, indicaFin, ordenes, asignables }. */
            detalle: SIN_DETALLE,
            borrador: "",
            /** Acción en curso: null, "avanzar", "retroceder", "orden" o "cierre". */
            accion: null,
            /** Error de la última acción; no borra lo cargado ni el borrador. */
            errorAccion: null,
            /** Acción que espera confirmación en la vista: null, "retroceso" o "cierre". */
            confirmando: null,
            /** Aviso informativo: paso reabierto, consulta cerrada ahora, etc. */
            aviso: null,
            desdeMemoria: false,
            actualizadoEn: null,
            /** Cambia (objeto nuevo) cuando una acción termina, para que la vista mueva el foco. */
            acabado: null,
            navegarA: null,
        });
        this.estado = estado;
        this.suscribir = suscribir;
    }

    // ---------------------------------------------------------------- derivados para la vista

    get rol() { return this.estado.sesion?.rolActivo?.codigo ?? null; }

    get pasoActual() { return elegirPasoActual(this.estado.consulta, this.rol, this.estado.idElegido); }

    get pendientes() { return pasosPendientes(this.estado.consulta); }

    /** Motivo de solo lectura de toda la vista, o null. */
    get bloqueo() {
        const { consulta, enLinea, soloLectura, desdeMemoria } = this.estado;
        return motivoBloqueo({ rol: this.rol, consulta, enLinea, soloLectura: soloLectura || desdeMemoria });
    }

    // ---------------------------------------------------------------- memoria

    #claveConsulta(id = this.estado.idConsulta) {
        return MemoriaVistas.clave(this.estado.sesion, `consulta:${id}`);
    }

    #claveBorrador(idPaso) {
        return idPaso ? MemoriaVistas.clave(this.estado.sesion, `consulta.borrador:${idPaso}`) : null;
    }

    #guardarEnMemoria() {
        const { consulta, detalle } = this.estado;
        if (!consulta) return;
        const en = this.#reloj();
        this.#memoria.guardar(this.#claveConsulta(), congelar({ consulta, detalle, en }));
        this.estado.actualizadoEn = en;
    }

    // ---------------------------------------------------------------- ciclo de vida

    iniciar(idConsulta, sesion, { soloLectura = false } = {}) {
        this.#cancelarConexion?.();
        this.#cancelarConexion = this.#conexion.suscribir?.(enLinea => this.#alCambiarRed(enLinea)) ?? null;
        Object.assign(this.estado, {
            idConsulta, sesion, soloLectura, enLinea: this.#conexion.enLinea,
            error: null, enCurso: null, errorAccion: null, confirmando: null, aviso: null, idElegido: null,
        });
        return this.#cargar({ retomar: true });
    }

    detener() {
        this.#cancelarConexion?.();
        this.#cancelarConexion = null;
        this.#secuencia++;
        this.#secuenciaDetalle++;
    }

    #alCambiarRed(enLinea) {
        this.estado.enLinea = enLinea;
        if (enLinea && (this.estado.desdeMemoria || this.estado.error)) this.#cargar({ retomar: true });
    }

    #mostrarMemoria(id) {
        if (id !== this.#secuencia) return;
        const guardado = this.#memoria.leer(this.#claveConsulta());
        if (!guardado) {
            Object.assign(this.estado, { cargando: false, consulta: null, detalle: SIN_DETALLE, error: MENSAJES.sinRedCarga, desdeMemoria: false });
            return;
        }
        Object.assign(this.estado, {
            cargando: false, error: null, consulta: guardado.consulta, detalle: guardado.detalle,
            desdeMemoria: true, actualizadoEn: guardado.en,
        });
        this.#restaurarBorrador();
    }

    /**
     * Carga la consulta. Con `retomar` primero la selecciona en la sesión (solo DOCTOR y abierta).
     * Sin red o en solo lectura muestra lo guardado en memoria, si existe.
     */
    async #cargar({ retomar = false } = {}) {
        const id = ++this.#secuencia;
        const { idConsulta, soloLectura } = this.estado;
        if (!this.#conexion.enLinea || soloLectura) {
            this.#mostrarMemoria(id);
            return;
        }
        this.estado.cargando = true;
        try {
            if (retomar && this.rol === ROL_ATIENDE) {
                try {
                    await this.#servicio.retomar(idConsulta);
                } catch (error) {
                    // Una consulta cerrada se muestra en solo lectura; cualquier otro rechazo detiene la carga.
                    if (error?.code !== "consulta.yaCerrada") throw error;
                }
            }
            if (id !== this.#secuencia) return;
            const { data } = await this.#servicio.consulta(idConsulta);
            if (id !== this.#secuencia) return;
            const [consulta] = normalizarConsultas([data]);
            if (!consulta || consulta.idConsulta !== idConsulta) throw Object.assign(new Error("ausente"), { status: 404 });
            Object.assign(this.estado, { consulta, cargando: false, error: null, desdeMemoria: false });
            await this.#cargarDetalle(id);
        } catch (error) {
            if (id !== this.#secuencia) return;
            if (error?.status === 0 && this.#memoria.leer(this.#claveConsulta())) {
                this.#mostrarMemoria(id);
                return;
            }
            Object.assign(this.estado, { cargando: false, consulta: null, detalle: SIN_DETALLE, error: mensajeDeErrorConsulta(error), desdeMemoria: false });
            if (error?.code === "consulta.cerrarAntesRetomar") await this.#buscarEnCurso(id);
        }
    }

    async #buscarEnCurso(id) {
        try {
            const { data } = await this.#servicio.contexto();
            if (id !== this.#secuencia) return;
            const enCurso = texto(data?.idConsulta) && data.idConsulta !== this.estado.idConsulta ? data.idConsulta : null;
            this.estado.enCurso = enCurso;
        } catch { /* Sin el enlace, el mensaje sigue siendo útil. */ }
    }

    /**
     * Pide los datos del paso actual: registro, órdenes y asignables en paralelo, y luego `indicaFin`
     * de su definición. Solo DOCTOR con la consulta abierta (los demás roles no tienen permiso).
     */
    async #cargarDetalle(idCarga = this.#secuencia) {
        const paso = this.pasoActual;
        const consulta = this.estado.consulta;
        const idDetalle = ++this.#secuenciaDetalle;
        if (!paso || this.rol !== ROL_ATIENDE || consulta?.fechaFin) {
            this.estado.detalle = SIN_DETALLE;
            this.estado.borrador = "";
            if (this.estado.aviso === MENSAJES.reabierto) this.estado.aviso = null;
            this.#guardarEnMemoria();
            return;
        }
        const idPaso = paso.idConsultaProcedimientoPaso;
        const previo = this.estado.detalle.idPaso === idPaso ? this.estado.detalle : SIN_DETALLE;
        this.estado.detalle = congelar({ ...previo, idPaso, cargando: true, error: null });
        try {
            const [registro, ordenes, asignables] = await Promise.all([
                this.#servicio.paso(idPaso), this.#servicio.ordenes(idPaso), this.#servicio.asignables(idPaso),
            ]);
            const idDefinicion = registro?.data?.idProcedimientoPaso;
            const definicion = idDefinicion ? await this.#servicio.definicion(idDefinicion) : null;
            if (idDetalle !== this.#secuenciaDetalle || idCarga !== this.#secuencia) return;
            const valorGuardado = texto(registro?.data?.valor) ? registro.data.valor : null;
            this.estado.detalle = congelar({
                idPaso, cargando: false, error: null, valorGuardado,
                indicaFin: definicion ? definicion.data?.indicaFin === true : null,
                ordenes: normalizarOrdenes(ordenes?.data), asignables: normalizarAsignables(asignables?.data),
            });
            this.#restaurarBorrador();
            this.#guardarEnMemoria();
        } catch (error) {
            if (idDetalle !== this.#secuenciaDetalle || idCarga !== this.#secuencia) return;
            const error_ = [0, 401, 403, 404].includes(error?.status) ? mensajeDeErrorConsulta(error) : MENSAJES.detalle;
            this.estado.detalle = congelar({ ...previo, idPaso, cargando: false, error: error_ });
        }
    }

    /** Borrador del paso actual: lo escrito en esta sesión o, si no hay, el valor guardado (paso reabierto). */
    #restaurarBorrador() {
        const { idPaso, valorGuardado } = this.estado.detalle;
        const escrito = this.#memoria.leer(this.#claveBorrador(idPaso));
        this.estado.borrador = typeof escrito === "string" ? escrito : (valorGuardado ?? "");
        this.estado.aviso = valorGuardado ? MENSAJES.reabierto : (this.estado.aviso === MENSAJES.reabierto ? null : this.estado.aviso);
    }

    /** Vuelve a pedir los datos del paso actual tras un error. */
    reintentarDetalle() {
        if (!this.estado.consulta || !this.#conexion.enLinea) return Promise.resolve();
        return this.#cargarDetalle();
    }

    /** Elige otro paso pendiente en el selector (solo hay selector si hay varios). */
    elegirPaso(idPaso) {
        if (!this.pendientes.some(p => p.paso.idConsultaProcedimientoPaso === idPaso)) return Promise.resolve();
        if (this.pasoActual?.idConsultaProcedimientoPaso === idPaso && this.estado.idElegido === idPaso) return Promise.resolve();
        Object.assign(this.estado, { idElegido: idPaso, errorAccion: null, confirmando: null });
        if (this.estado.desdeMemoria || !this.#conexion.enLinea) return Promise.resolve();
        return this.#cargarDetalle();
    }

    // ---------------------------------------------------------------- acciones

    /** Motivo por el que las acciones del paso actual no están disponibles, o null. */
    get motivoNoActuar() {
        if (this.bloqueo) return this.bloqueo;
        if (this.estado.accion) return MENSAJES.accionEnCurso;
        const paso = this.pasoActual;
        if (!paso) return MENSAJES.sinPendientes;
        const { detalle } = this.estado;
        if (detalle.error) return detalle.error;
        if (detalle.idPaso !== paso.idConsultaProcedimientoPaso || detalle.cargando) return MENSAJES.cargandoPaso;
        return null;
    }

    /** Vuelve a cargar todo (botón "Volver a intentar" de un error de carga). */
    reintentar() {
        if (!this.estado.idConsulta) return Promise.resolve();
        Object.assign(this.estado, { error: null, enCurso: null, errorAccion: null });
        return this.#cargar({ retomar: true });
    }

    /** null si se puede pedir el retroceso; si no, su motivo. Solo se ofrece si el paso no es el primero. */
    get motivoNoRetroceder() {
        return this.motivoNoActuar ?? motivoNoRetroceder(this.estado.detalle);
    }

    /**
     * Ejecuta una acción del flujo con su indicador. Si sale bien vuelve a leer la consulta y el
     * paso actual; si falla deja el motivo en `errorAccion` sin perder lo cargado ni el borrador.
     * Algunos rechazos significan que lo mostrado quedó viejo, así que también se recarga.
     */
    async #ejecutar(accion, operacion, { alTerminar, alFallar, recargarTras = new Set(["consulta.pasoYaCompletado", "consulta.yaCerrada"]) } = {}) {
        Object.assign(this.estado, { accion, errorAccion: null, confirmando: null });
        const idCarga = this.#secuencia;
        let ok = false;
        try {
            await operacion();
            if (idCarga !== this.#secuencia) return false;
            ok = true;
            await alTerminar?.();
        } catch (error) {
            if (idCarga !== this.#secuencia) return false;
            this.estado.errorAccion = mensajeDeErrorConsulta(error);
            if (recargarTras.has(error?.code)) await this.#recargar();
            await alFallar?.(error);
        } finally {
            if (idCarga === this.#secuencia) {
                Object.assign(this.estado, { accion: null, acabado: congelar({ accion, ok }) });
            }
        }
        return ok;
    }

    /** Vuelve a leer la consulta y el paso actual, sin retomarla. Un fallo no borra lo mostrado. */
    async #recargar() {
        const id = this.#secuencia;
        try {
            const { data } = await this.#servicio.consulta(this.estado.idConsulta);
            if (id !== this.#secuencia) return;
            const [consulta] = normalizarConsultas([data]);
            if (!consulta || consulta.idConsulta !== this.estado.idConsulta) throw Object.assign(new Error("ausente"), { status: 404 });
            this.estado.consulta = consulta;
            await this.#cargarDetalle(id);
        } catch (error) {
            if (id !== this.#secuencia) return;
            this.estado.errorAccion ??= mensajeDeErrorConsulta(error);
        }
    }

    #olvidarBorrador(idPaso) {
        this.#memoria.guardar(this.#claveBorrador(idPaso), null);
    }

    /**
     * Completa el paso actual con lo escrito ("Avanzar", o "Completar paso" si es el último).
     * Un borrador vacío se envía como null: nunca se inventa un valor.
     */
    avanzar() {
        if (this.motivoNoActuar) return Promise.resolve(false);
        const idPaso = this.pasoActual.idConsultaProcedimientoPaso;
        const valor = this.estado.borrador.trim() || null;
        return this.#ejecutar("avanzar", () => this.#servicio.completar(idPaso, valor), {
            alTerminar: async () => {
                this.#olvidarBorrador(idPaso);
                Object.assign(this.estado, { idElegido: null, aviso: null, borrador: "" });
                await this.#recargar();
            },
        });
    }

    /** Pide retroceder: si hay algo escrito, primero pide confirmar que se descartará. */
    pedirRetroceso() {
        if (!puedeOfrecerRetroceso(this.pasoActual) || this.motivoNoRetroceder) return Promise.resolve(false);
        if (this.estado.borrador.trim()) {
            Object.assign(this.estado, { confirmando: "retroceso", errorAccion: null });
            return Promise.resolve(false);
        }
        return this.#retroceder();
    }

    #retroceder() {
        if (!puedeOfrecerRetroceso(this.pasoActual) || this.motivoNoRetroceder) return Promise.resolve(false);
        const idPaso = this.pasoActual.idConsultaProcedimientoPaso;
        let anterior = null;
        return this.#ejecutar("retroceder", async () => { anterior = (await this.#servicio.retroceder(idPaso))?.data ?? null; }, {
            alTerminar: async () => {
                this.#olvidarBorrador(idPaso);
                const idAnterior = texto(anterior?.idConsultaProcedimientoPaso) ? anterior.idConsultaProcedimientoPaso : null;
                // El paso reabierto muestra su valor guardado, no un borrador viejo de antes de completarlo.
                if (idAnterior) this.#olvidarBorrador(idAnterior);
                Object.assign(this.estado, { idElegido: idAnterior, aviso: null, borrador: "" });
                await this.#recargar();
            },
        });
    }

    /** Pide cerrar la consulta; queda esperando la confirmación. */
    pedirCierre(observaciones = "") {
        if (this.bloqueo || this.estado.accion || !puedeCerrar(this.estado.consulta)) return false;
        const notas = typeof observaciones === "string" ? observaciones.trim() : "";
        if (notas.length > MAX_TEXTO) {
            this.estado.errorAccion = `Las observaciones admiten hasta ${MAX_TEXTO} caracteres.`;
            return false;
        }
        this.#observaciones = notas;
        Object.assign(this.estado, { confirmando: "cierre", errorAccion: null });
        return true;
    }

    #observaciones = "";

    #cerrar() {
        if (this.bloqueo || !puedeCerrar(this.estado.consulta)) return Promise.resolve(false);
        const notas = this.#observaciones ? { observaciones: this.#observaciones } : {};
        return this.#ejecutar("cierre", () => this.#servicio.cerrar(this.estado.idConsulta, notas), {
            recargarTras: new Set(["consulta.completeAntesCerrar", "consulta.procedimientoSinFinal", "consulta.yaCerrada"]),
            alTerminar: async () => {
                this.#observaciones = "";
                this.estado.aviso = MENSAJES.cerradaAhora;
                await this.#recargar();
            },
        });
    }

    /** Confirma la acción pendiente (retroceso o cierre). */
    confirmar() {
        const pendiente = this.estado.confirmando;
        if (pendiente === "retroceso") return this.#retroceder();
        if (pendiente === "cierre") return this.#cerrar();
        return Promise.resolve(false);
    }

    cancelar() {
        this.estado.confirmando = null;
        this.#observaciones = "";
    }

    /** Emite una orden de un examen asignable del paso actual; solo recarga las órdenes. */
    emitirOrden({ idExamen, indicaciones } = {}) {
        if (this.motivoNoActuar) return Promise.resolve(false);
        const invalida = validarOrden({ idExamen, indicaciones }, this.estado.detalle.asignables);
        if (invalida) {
            this.estado.errorAccion = invalida;
            return Promise.resolve(false);
        }
        const idPaso = this.pasoActual.idConsultaProcedimientoPaso;
        const actualizar = async campos => {
            const respuestas = await Promise.all(campos.map(c => (c === "ordenes" ? this.#servicio.ordenes(idPaso) : this.#servicio.asignables(idPaso))));
            if (this.estado.detalle.idPaso !== idPaso) return;
            const cambios = {};
            campos.forEach((c, i) => { cambios[c] = c === "ordenes" ? normalizarOrdenes(respuestas[i]?.data) : normalizarAsignables(respuestas[i]?.data); });
            this.estado.detalle = congelar({ ...this.estado.detalle, ...cambios });
            this.#guardarEnMemoria();
        };
        return this.#ejecutar("orden", () => this.#servicio.ordenar(idPaso, { idExamen, indicaciones }), {
            recargarTras: new Set(["consulta.ordenPasoCompletado", "consulta.pasoYaCompletado", "consulta.yaCerrada"]),
            alTerminar: () => actualizar(["ordenes"]).catch(error => { this.estado.errorAccion = mensajeDeErrorConsulta(error); }),
            // Un examen que dejó de ser asignable: se actualiza la lista para que no se vuelva a elegir.
            alFallar: error => (error?.code === "consulta.examenNoAsignable" ? actualizar(["asignables"]).catch(() => {}) : null),
        });
    }

    cambiarBorrador(valor) {
        const borrador = typeof valor === "string" ? valor : "";
        this.estado.borrador = borrador;
        this.#memoria.guardar(this.#claveBorrador(this.estado.detalle.idPaso ?? this.pasoActual?.idConsultaProcedimientoPaso), borrador);
    }
}
