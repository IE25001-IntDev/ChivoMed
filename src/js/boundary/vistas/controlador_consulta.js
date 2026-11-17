/**
 * Lógica de la vista de una consulta (HU4) sin DOM.
 *
 * Al iniciar lee la consulta con GET /atencion/consultas/{id} (misma forma que un elemento del
 * dashboard). Solo si le toca al rol activo (`pendienteParaMi`: un paso pendiente de su rol o
 * cerrarla) la selecciona en la sesión (PUT /consultas/{id}/sesion) y, del paso PENDIENTE actual,
 * pide su registro, sus órdenes, los exámenes asignables y si es el último paso (`indicaFin` de su
 * definición). Son peticiones fijas: nunca una por paso o procedimiento. Si no le toca, la vista
 * queda en solo lectura sin pedir la sesión ni los datos clínicos del paso.
 *
 * Acciones: completar el paso ("Avanzar", o "Completar paso" si es el último), retroceder al
 * anterior, emitir órdenes y cerrar la consulta. Cada paso lo atiende su rol responsable y cierra
 * quien completó el paso final (B8); lo decide el backend. Una consulta cerrada, una que no le toca
 * al rol activo o la falta de red dejan la vista en solo lectura con su motivo.
 *
 * El controlador solo escribe en su estado reactivo (`estado`, `suscribir`); nunca llama a la vista.
 * Lo cargado y el borrador quedan en memoria_vistas para seguir mostrándolos sin red; solo la
 * consulta (sin borrador ni valor guardado) va además a disco para verla tras recargar sin red.
 */
import AtencionService from "../../control/atencion_service.js";
import ConsultaService from "../../control/consulta_service.js";
import ConsultaProcedimientoPasoService from "../../control/consulta_procedimiento_paso_service.js";
import ProcedimientoPasoService from "../../control/procedimiento_paso_service.js";
import { crearEstado } from "../../control/estado_reactivo.js";
import { MemoriaVistas, memoria as memoriaCompartida } from "./memoria_vistas.js";
import { conexion as conexionCompartida } from "../pwa/conexion.js";
import { normalizarConsultas, motivoNoAtender, esPasoDeMiRol, MENSAJES as MENSAJES_DASHBOARD } from "./controlador_consultas.js";

export const MAX_TEXTO = 255;
const NINGUNA = Object.freeze([]);
const congelar = Object.freeze;
const texto = valor => typeof valor === "string" && valor.trim().length > 0;

export const MENSAJES = Object.freeze({
    otroRol: MENSAJES_DASHBOARD.otroRol,
    soloFinalizador: MENSAJES_DASHBOARD.soloFinalizador,
    soloEmpleado: "Solo el personal de la clínica puede atender consultas.",
    rolClinica: "Elige tu rol y clínica en el dashboard.",
    sinPasoParaRol: "Esta consulta no tiene un paso pendiente para tu rol.",
    sinSeleccion: "No pudimos seleccionar esta consulta para atenderla. Vuelve a intentarlo.",
    cerrada: "Esta consulta ya está cerrada.",
    cerradaAhora: "Consulta cerrada.",
    sinRed: "Sin conexión: necesitas red para registrar la atención.",
    sinRedCarga: "Necesitas conexión para abrir esta consulta.",
    desdeMemoria: hora => `Sin conexión. Mostrando la consulta guardada a las ${hora}.`,
    /** F8: texto propio para consulta.cerrarAntesRetomar; se ignora el message del backend. */
    enCurso: "Tienes otra consulta en curso. Sal de ella o ciérrala antes de atender esta.",
    sinRedSalir: "Sin conexión: necesitas red para salir de la consulta.",
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
    seleccionVacia: "Elige al menos un examen.",
    examenAjeno: "Elige exámenes de la lista.",
    yaOrdenado: nombre => `${nombre} ya está ordenado en este paso.`,
    ordenEmitida: "Orden emitida.",
    noEnviado: "No se envió.",
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
    "consulta.soloFinalizador": MENSAJES.soloFinalizador,
    "consulta.soloEmpleado": MENSAJES.soloEmpleado,
    "consulta.rolClinica": MENSAJES.rolClinica,
    "consulta.sinPasoParaRol": MENSAJES.sinPasoParaRol,
});

/**
 * Códigos cuyo `message` del backend es más útil que un texto fijo, con su respaldo: el del
 * procedimiento sin final trae su nombre y el del responsable trae el rol del paso.
 */
const USAR_MENSAJE_BACKEND = Object.freeze({
    "consulta.procedimientoSinFinal": "Un procedimiento no ha llegado a su paso final.",
    "consulta.noResponsablePaso": MENSAJES.otroRol,
});

/**
 * Rechazos por rol (B8): lo mostrado quedó viejo (ya no le toca al rol activo), así que se vuelve
 * a leer la consulta y queda en solo lectura con su motivo.
 */
export const CODIGOS_POR_ROL = Object.freeze(["consulta.noResponsablePaso", "consulta.soloFinalizador",
    "consulta.sinPasoParaRol", "consulta.soloEmpleado", "consulta.rolClinica"]);

/** Rechazos de una orden que dejan viejo lo mostrado: se recarga la consulta. */
const RECARGAR_TRAS_ORDEN = new Set(["consulta.ordenPasoCompletado", "consulta.pasoYaCompletado", "consulta.yaCerrada", ...CODIGOS_POR_ROL]);

/** Traduce un error del servicio a un texto para el usuario, sin detalles internos. */
export function mensajeDeErrorConsulta(error) {
    const code = error?.code;
    if (code && Object.hasOwn(USAR_MENSAJE_BACKEND, code)) return texto(error.message) ? error.message.trim() : USAR_MENSAJE_BACKEND[code];
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

/** Pasos PENDIENTE de la consulta, en orden, con el nombre de su procedimiento. */
export function pasosPendientes(consulta) {
    if (!consulta) return NINGUNA;
    return congelar(consulta.procedimientos.flatMap(p => p.pasos
        .filter(s => s.estado === "PENDIENTE")
        .map(paso => congelar({ paso, procedimiento: p.nombre }))));
}

/**
 * Paso actual: el elegido si sigue PENDIENTE; si no, el primero del rol activo (por `idRol`, cuando
 * el backend envía `rolPaso` y el rol activo trae `idRol`); si ninguno, el primero. null si no
 * quedan pendientes. Nunca compara roles por nombre.
 */
export function elegirPasoActual(consulta, rolActivo, idElegido = null) {
    const pendientes = pasosPendientes(consulta).map(p => p.paso);
    if (!pendientes.length) return null;
    return pendientes.find(p => p.idConsultaProcedimientoPaso === idElegido)
        ?? pendientes.find(p => esPasoDeMiRol(p, rolActivo))
        ?? pendientes[0];
}

/**
 * Motivo por el que toda la vista queda en solo lectura, en orden de prioridad; null si se puede
 * atender. `atendiendo` es true si la consulta se seleccionó en la sesión (PUT …/sesion).
 */
export function motivoBloqueo({ consulta, atendiendo = false, enLinea = true, soloLectura = false }) {
    if (!consulta) return null;
    if (consulta.fechaFin) return MENSAJES.cerrada;
    if (!consulta.pendienteParaMi) return motivoNoAtender(consulta);
    if (!enLinea || soloLectura) return MENSAJES.sinRed;
    if (!atendiendo) return MENSAJES.sinSeleccion;
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

/** Tipos de examen activos de un examen asignable (B8): válidos, sin repetir y congelados. */
function normalizarTipos(datos) {
    if (!Array.isArray(datos)) return NINGUNA;
    const vistos = new Set();
    const tipos = [];
    for (const t of datos) {
        if (!t || !texto(t.idTipoExamen) || !texto(t.nombre) || vistos.has(t.idTipoExamen)) continue;
        vistos.add(t.idTipoExamen);
        tipos.push(congelar({ idTipoExamen: t.idTipoExamen, nombre: t.nombre.trim() }));
    }
    return congelar(tipos);
}

/**
 * DTO de GET …/examenes-asignables: [{ idExamen, nombre, tiposExamen: [{ idTipoExamen, nombre }] }].
 * Sin `tiposExamen` queda [] (el filtro por categoría se oculta).
 */
export function normalizarAsignables(datos) {
    if (!Array.isArray(datos)) return NINGUNA;
    return congelar(datos.filter(e => e && texto(e.idExamen) && texto(e.nombre))
        .map(e => congelar({ idExamen: e.idExamen, nombre: e.nombre.trim(), tiposExamen: normalizarTipos(e.tiposExamen) })));
}

/** F9: categorías del filtro: la unión de los tipos de los asignables, por nombre. */
export function categoriasDe(asignables) {
    const porId = new Map();
    for (const e of asignables ?? NINGUNA) for (const t of e.tiposExamen ?? NINGUNA) if (!porId.has(t.idTipoExamen)) porId.set(t.idTipoExamen, t);
    return congelar([...porId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
}

/** F9: asignables de una categoría; "" (Todas) los devuelve todos. */
export function examenesVisibles(asignables, idTipoExamen = "") {
    if (!idTipoExamen) return asignables;
    return congelar(asignables.filter(e => e.tiposExamen.some(t => t.idTipoExamen === idTipoExamen)));
}

/** F9: idExamen ya ordenados en el paso. El backend no impide repetir una orden; el frontend sí. */
export function idsOrdenados(ordenes) {
    return congelar([...new Set((ordenes ?? NINGUNA).map(o => o?.idExamen).filter(texto))]);
}

/** F9: texto de cuántos exámenes hay seleccionados. */
export function textoSeleccion(n) {
    if (!n) return "Ningún examen seleccionado";
    return n === 1 ? "1 seleccionado" : `${n} seleccionados`;
}

/**
 * F9: errores propios de un examen; la serie sigue con el siguiente. Cualquier otro (paso
 * completado, consulta cerrada, rechazo por rol, sesión, red, desconocido) corta la serie.
 */
const ERRORES_POR_EXAMEN = Object.freeze(["consulta.examenNoAsignable", "consulta.examenObligatorio"]);

/** F9: valida la asignación de varios exámenes antes de enviarla. Devuelve el mensaje o null. */
export function validarAsignacion({ idsExamen, indicaciones } = {}, asignables = NINGUNA, ordenes = NINGUNA) {
    if (!Array.isArray(idsExamen) || idsExamen.length === 0) return MENSAJES.seleccionVacia;
    if (!idsExamen.every(id => asignables.some(e => e.idExamen === id))) return MENSAJES.examenAjeno;
    const ordenados = idsOrdenados(ordenes);
    const repetido = idsExamen.find(id => ordenados.includes(id));
    if (repetido) return MENSAJES.yaOrdenado(asignables.find(e => e.idExamen === repetido).nombre);
    if (typeof indicaciones === "string" && indicaciones.trim().length > MAX_TEXTO) return `Las indicaciones admiten hasta ${MAX_TEXTO} caracteres.`;
    return null;
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
        salirDeConsulta: () => atencion.salirDeConsulta(),
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
            /** true si esta consulta se seleccionó en la sesión (PUT …/sesion): le toca al rol activo. */
            atendiendo: false,
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
            /** { ruta } nuevo cuando hay que ir a otra vista (F8: al dashboard tras salir de la consulta). */
            navegarA: null,
            /** F8: true mientras "Salir de esa consulta y atender esta" espera el DELETE. */
            saliendo: false,
            /** F9: categoría elegida en el panel de exámenes: "" (Todas) o un idTipoExamen. */
            filtroExamenes: "",
            /** F9: idExamen seleccionados (congelado, en el orden de la lista). Se conserva al filtrar. */
            seleccionExamenes: NINGUNA,
            /** F9: resultado de la última asignación: [{ idExamen, nombre, ok, mensaje }] congelado, o null. */
            resultadoExamenes: null,
        });
        this.estado = estado;
        this.suscribir = suscribir;
    }

    // ---------------------------------------------------------------- derivados para la vista

    get pasoActual() { return elegirPasoActual(this.estado.consulta, this.estado.sesion?.rolActivo, this.estado.idElegido); }

    /** true si el rol activo atiende esta consulta ahora: seleccionada en la sesión, abierta y le toca. */
    get atiende() {
        const { consulta, atendiendo } = this.estado;
        return atendiendo && Boolean(consulta) && !consulta.fechaFin && consulta.pendienteParaMi;
    }

    /**
     * F8: true si esta consulta está seleccionada en la sesión y sigue abierta. No exige
     * `pendienteParaMi`: quien completó su paso y ya no tiene nada pendiente también debe poder salir.
     */
    get puedeSalir() {
        const { consulta, atendiendo } = this.estado;
        return atendiendo && Boolean(consulta) && !consulta.fechaFin;
    }

    get pendientes() { return pasosPendientes(this.estado.consulta); }

    /** Motivo de solo lectura de toda la vista, o null. */
    get bloqueo() {
        const { consulta, atendiendo, enLinea, soloLectura, desdeMemoria } = this.estado;
        return motivoBloqueo({ consulta, atendiendo, enLinea, soloLectura: soloLectura || desdeMemoria });
    }

    // ---------------------------------------------------------------- memoria

    #claveConsulta(id = this.estado.idConsulta) {
        const idPersonaRol = this.estado.sesion?.rolActivo?.idPersonaRol;
        return idPersonaRol
            ? MemoriaVistas.clave(this.estado.sesion, `consulta:${idPersonaRol}:${id}`)
            : null;
    }

    #claveBorrador(idPaso) {
        return idPaso ? MemoriaVistas.clave(this.estado.sesion, `consulta.borrador:${idPaso}`) : null;
    }

    /**
     * Lo guardado de esta consulta: la copia de la vista o, si no hay, la que dejó el dashboard en
     * `consultas.pendientes` (sin detalle del paso: se abre en solo lectura). null si no hay nada.
     */
    #guardado() {
        const propio = this.#memoria.leer(this.#claveConsulta());
        if (propio) return propio;
        const idPersonaRol = this.estado.sesion?.rolActivo?.idPersonaRol;
        const pendientes = idPersonaRol ? this.#memoria.leer(MemoriaVistas.clave(this.estado.sesion, `consultas.pendientes:${idPersonaRol}`)) : null;
        const consulta = pendientes?.consultas.find(c => c.idConsulta === this.estado.idConsulta);
        return consulta ? congelar({ consulta, detalle: SIN_DETALLE, en: pendientes.en }) : null;
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
            error: null, enCurso: null, errorAccion: null, confirmando: null, aviso: null, idElegido: null, atendiendo: false,
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
        const guardado = this.#guardado();
        if (!guardado) {
            Object.assign(this.estado, { cargando: false, consulta: null, detalle: SIN_DETALLE, error: MENSAJES.sinRedCarga, desdeMemoria: false });
            return;
        }
        Object.assign(this.estado, {
            cargando: false, error: null, consulta: guardado.consulta, detalle: guardado.detalle,
            desdeMemoria: true, actualizadoEn: guardado.en, atendiendo: false,
        });
        this.#restaurarBorrador();
    }

    /**
     * Carga la consulta. Con `retomar`, después de leerla la selecciona en la sesión, solo si está
     * abierta y le toca al rol activo. Un rechazo por rol la deja en solo lectura con su motivo.
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
            let consulta = await this.#leerConsulta(idConsulta);
            if (id !== this.#secuencia) return;
            let atendiendo = this.estado.atendiendo;
            let aviso = null;
            if (retomar) {
                atendiendo = false;
                if (consulta.pendienteParaMi && !consulta.fechaFin) {
                    try {
                        await this.#servicio.retomar(idConsulta);
                        atendiendo = true;
                    } catch (error) {
                        // Ya no le toca (o se cerró): se vuelve a leer y queda en solo lectura con su motivo.
                        // Cualquier otro rechazo detiene la carga.
                        if (error?.code !== "consulta.yaCerrada" && !CODIGOS_POR_ROL.includes(error?.code)) throw error;
                        if (id !== this.#secuencia) return;
                        aviso = mensajeDeErrorConsulta(error);
                        consulta = await this.#leerConsulta(idConsulta);
                    }
                    if (id !== this.#secuencia) return;
                }
            }
            Object.assign(this.estado, { consulta, atendiendo, cargando: false, error: null, desdeMemoria: false });
            if (aviso) this.estado.aviso = aviso;
            await this.#cargarDetalle(id);
        } catch (error) {
            if (id !== this.#secuencia) return;
            if (error?.status === 0 && this.#guardado()) {
                this.#mostrarMemoria(id);
                return;
            }
            Object.assign(this.estado, { cargando: false, consulta: null, detalle: SIN_DETALLE, error: mensajeDeErrorConsulta(error), desdeMemoria: false });
            if (error?.code === "consulta.cerrarAntesRetomar") await this.#buscarEnCurso(id);
        }
    }

    async #leerConsulta(idConsulta) {
        const { data } = await this.#servicio.consulta(idConsulta);
        const [consulta] = normalizarConsultas([data]);
        if (!consulta || consulta.idConsulta !== idConsulta) throw Object.assign(new Error("ausente"), { status: 404 });
        return consulta;
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
     * de su definición. Solo si el rol activo atiende la consulta (los datos clínicos del paso no
     * se piden en solo lectura).
     */
    async #cargarDetalle(idCarga = this.#secuencia) {
        const paso = this.pasoActual;
        const consulta = this.estado.consulta;
        const idDetalle = ++this.#secuenciaDetalle;
        if (!paso || !this.atiende || consulta?.fechaFin) {
            this.estado.detalle = SIN_DETALLE;
            this.estado.borrador = "";
            if (this.estado.aviso === MENSAJES.reabierto) this.estado.aviso = null;
            this.#reiniciarExamenes();
            this.#guardarEnMemoria();
            return;
        }
        const idPaso = paso.idConsultaProcedimientoPaso;
        const previo = this.estado.detalle.idPaso === idPaso ? this.estado.detalle : SIN_DETALLE;
        // F9: el filtro, la selección y el resultado son del paso; otro paso empieza de cero.
        if (previo === SIN_DETALLE) this.#reiniciarExamenes();
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
            this.#depurarExamenes();
            this.#restaurarBorrador();
            this.#guardarEnMemoria();
        } catch (error) {
            if (idDetalle !== this.#secuenciaDetalle || idCarga !== this.#secuencia) return;
            const error_ = [0, 401, 403, 404].includes(error?.status) ? mensajeDeErrorConsulta(error) : MENSAJES.detalle;
            this.estado.detalle = congelar({ ...previo, idPaso, cargando: false, error: error_ });
        }
    }

    /** F9: vuelve el filtro a "Todas" y vacía la selección y el resultado. */
    #reiniciarExamenes() {
        Object.assign(this.estado, { filtroExamenes: "", seleccionExamenes: NINGUNA, resultadoExamenes: null });
    }

    /**
     * F9: tras recargar los asignables o las órdenes, quita de la selección lo que ya no se puede
     * asignar o ya se ordenó, y vuelve a "Todas" si la categoría elegida desapareció.
     */
    #depurarExamenes() {
        const { asignables } = this.estado.detalle;
        const ordenados = this.examenesOrdenados;
        const seleccion = this.estado.seleccionExamenes.filter(id => asignables.some(e => e.idExamen === id) && !ordenados.includes(id));
        if (seleccion.length !== this.estado.seleccionExamenes.length) this.estado.seleccionExamenes = congelar(seleccion);
        const filtro = this.estado.filtroExamenes;
        if (filtro && !categoriasDe(asignables).some(t => t.idTipoExamen === filtro)) this.estado.filtroExamenes = "";
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

    /**
     * F8: sale de esta consulta sin cerrarla (DELETE /atencion/consulta) y publica la navegación al
     * dashboard. Pasos, registros y órdenes quedan igual; el borrador sigue en memoria.
     */
    salirDeConsulta() {
        if (!this.puedeSalir || this.estado.accion) return Promise.resolve(false);
        if (!this.#conexion.enLinea || this.estado.soloLectura || this.estado.desdeMemoria) {
            this.estado.errorAccion = MENSAJES.sinRedSalir;
            return Promise.resolve(false);
        }
        return this.#ejecutar("salir", () => this.#servicio.salirDeConsulta(), {
            recargarTras: new Set(),
            alTerminar: () => {
                Object.assign(this.estado, { atendiendo: false, navegarA: congelar({ ruta: "/dashboard" }) });
            },
        });
    }

    /**
     * F8: ante consulta.cerrarAntesRetomar, sale de la otra consulta (DELETE) y vuelve a cargar esta
     * con #cargar, que la lee y solo pide PUT …/sesion si sigue abierta y `pendienteParaMi`; si no,
     * queda en solo lectura. Devuelve true si el DELETE se hizo.
     */
    async salirYAtender() {
        const { enCurso, saliendo, cargando } = this.estado;
        if (!enCurso || saliendo || cargando) return false;
        if (!this.#conexion.enLinea || this.estado.soloLectura) {
            this.estado.error = MENSAJES.sinRedSalir;
            return false;
        }
        const id = this.#secuencia;
        this.estado.saliendo = true;
        try {
            await this.#servicio.salirDeConsulta();
        } catch (error) {
            if (id !== this.#secuencia) return false;
            // El enlace a la consulta en curso se conserva: sigue en la sesión.
            Object.assign(this.estado, { saliendo: false, error: mensajeDeErrorConsulta(error) });
            return false;
        }
        if (id !== this.#secuencia) return false;
        Object.assign(this.estado, { saliendo: false, error: null, enCurso: null, errorAccion: null });
        await this.#cargar({ retomar: true });
        return true;
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
    async #ejecutar(accion, operacion, { alTerminar, alFallar, recargarTras = new Set(["consulta.pasoYaCompletado", "consulta.yaCerrada", ...CODIGOS_POR_ROL]) } = {}) {
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
            recargarTras: new Set(["consulta.completeAntesCerrar", "consulta.procedimientoSinFinal", "consulta.yaCerrada", ...CODIGOS_POR_ROL]),
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

    /** Vuelve a pedir, en paralelo, las órdenes y/o los asignables del paso, sin recargar la consulta. */
    async #actualizarListas(idPaso, campos) {
        const respuestas = await Promise.all(campos.map(c => (c === "ordenes" ? this.#servicio.ordenes(idPaso) : this.#servicio.asignables(idPaso))));
        if (this.estado.detalle.idPaso !== idPaso) return;
        const cambios = {};
        campos.forEach((c, i) => { cambios[c] = c === "ordenes" ? normalizarOrdenes(respuestas[i]?.data) : normalizarAsignables(respuestas[i]?.data); });
        this.estado.detalle = congelar({ ...this.estado.detalle, ...cambios });
        this.#depurarExamenes();
        this.#guardarEnMemoria();
    }

    // ---------------------------------------------------------------- F9: varios exámenes

    /** idExamen ya ordenados en el paso actual: salen marcados y deshabilitados ("Ya ordenado"). */
    get examenesOrdenados() { return idsOrdenados(this.estado.detalle.ordenes); }

    /** Elige la categoría del filtro: "" (Todas) o una de las categorías de los asignables. */
    elegirCategoria(idTipoExamen) {
        const id = typeof idTipoExamen === "string" ? idTipoExamen : "";
        if (id && !categoriasDe(this.estado.detalle.asignables).some(t => t.idTipoExamen === id)) return;
        this.estado.filtroExamenes = id;
    }

    /** Marca o desmarca un examen asignable que todavía no está ordenado. La selección no depende del filtro. */
    alternarExamen(idExamen, marcado) {
        const { asignables } = this.estado.detalle;
        if (!asignables.some(e => e.idExamen === idExamen) || this.examenesOrdenados.includes(idExamen)) return;
        const elegidos = new Set(this.estado.seleccionExamenes);
        if (marcado) elegidos.add(idExamen);
        else elegidos.delete(idExamen);
        this.estado.seleccionExamenes = congelar(asignables.map(e => e.idExamen).filter(id => elegidos.has(id)));
    }

    /**
     * F9: emite una orden por examen seleccionado, EN SERIE (el backend recibe una por petición), con
     * las mismas indicaciones. Un error propio del examen se anota y se sigue; cualquier otro corta la
     * serie (los que faltan quedan "No se envió.") y se muestra como error de la acción. Publica
     * `resultadoExamenes`, deja seleccionados los que fallaron y recarga las órdenes una sola vez (y los
     * asignables si alguno dejó de serlo). Devuelve true si al menos una orden se emitió y no hubo corte.
     */
    async asignarExamenes({ indicaciones } = {}) {
        if (this.motivoNoActuar) return false;
        const { asignables, ordenes } = this.estado.detalle;
        const idsExamen = this.estado.seleccionExamenes;
        const invalida = validarAsignacion({ idsExamen, indicaciones }, asignables, ordenes);
        if (invalida) {
            this.estado.errorAccion = invalida;
            return false;
        }
        const idPaso = this.pasoActual.idConsultaProcedimientoPaso;
        const nombre = id => asignables.find(e => e.idExamen === id).nombre;
        const resultados = [];
        let recargarAsignables = false;
        const publicar = () => {
            const emitidos = new Set(resultados.filter(r => r.ok).map(r => r.idExamen));
            Object.assign(this.estado, {
                resultadoExamenes: congelar(resultados),
                seleccionExamenes: congelar(this.estado.seleccionExamenes.filter(id => !emitidos.has(id))),
            });
        };
        this.estado.resultadoExamenes = null;
        const ok = await this.#ejecutar("orden", async () => {
            for (const [i, idExamen] of idsExamen.entries()) {
                try {
                    await this.#servicio.ordenar(idPaso, { idExamen, indicaciones });
                    resultados.push(congelar({ idExamen, nombre: nombre(idExamen), ok: true, mensaje: MENSAJES.ordenEmitida }));
                } catch (error) {
                    resultados.push(congelar({ idExamen, nombre: nombre(idExamen), ok: false, mensaje: mensajeDeErrorConsulta(error) }));
                    if (ERRORES_POR_EXAMEN.includes(error?.code)) {
                        recargarAsignables ||= error.code === "consulta.examenNoAsignable";
                        continue;
                    }
                    for (const resto of idsExamen.slice(i + 1)) {
                        resultados.push(congelar({ idExamen: resto, nombre: nombre(resto), ok: false, mensaje: MENSAJES.noEnviado }));
                    }
                    publicar();
                    throw error;
                }
            }
            publicar();
        }, {
            recargarTras: RECARGAR_TRAS_ORDEN,
            alTerminar: () => this.#actualizarListas(idPaso, recargarAsignables ? ["ordenes", "asignables"] : ["ordenes"])
                .catch(error => { this.estado.errorAccion = mensajeDeErrorConsulta(error); }),
        });
        return ok && resultados.some(r => r.ok);
    }

    cambiarBorrador(valor) {
        const borrador = typeof valor === "string" ? valor : "";
        this.estado.borrador = borrador;
        this.#memoria.guardar(this.#claveBorrador(this.estado.detalle.idPaso ?? this.pasoActual?.idConsultaProcedimientoPaso), borrador);
    }
}
