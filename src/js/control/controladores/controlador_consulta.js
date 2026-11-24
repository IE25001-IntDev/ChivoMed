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
import AtencionService from "../atencion_service.js";
import ConsultaService from "../consulta_service.js";
import ConsultaProcedimientoPasoService from "../consulta_procedimiento_paso_service.js";
import ProcedimientoPasoService from "../procedimiento_paso_service.js";
import { EstadoReactivo } from "../estado_reactivo.js";
import { MemoriaVistas, memoria as memoriaCompartida } from "../memoria_vistas.js";
import { conexion as conexionCompartida } from "../conexion.js";
import { ControladorConexion, MENSAJE_SIN_DATOS } from "../controlador_conexion.js";
import { ControladorConsultas, MENSAJES as MENSAJES_DASHBOARD } from "./controlador_consultas.js";
import { Validaciones } from "../validaciones.js";

export const MAX_TEXTO = 255;
const NINGUNA = Object.freeze([]);
const congelar = Object.freeze;

export const MENSAJES = Object.freeze({
    otroRol: MENSAJES_DASHBOARD.otroRol,
    soloFinalizador: MENSAJES_DASHBOARD.soloFinalizador,
    soloEmpleado: "Solo el personal de la clínica puede atender consultas.",
    rolClinica: "Elige tu rol y clínica en el dashboard.",
    sinPasoParaRol: "Esta consulta no tiene un paso pendiente para tu rol.",
    sinSeleccion: "No pudimos seleccionar esta consulta para atenderla. Vuelve a intentarlo.",
    cerrada: "Esta consulta ya está cerrada.",
    cerradaAhora: "Consulta cerrada.",
    sinRed: ControladorConexion.motivoSinConexion("registrar la atención"),
    sinRedCarga: MENSAJE_SIN_DATOS,
    desdeMemoria: ControladorConexion.mensajeGuardado,
    /** F8: texto propio para consulta.cerrarAntesRetomar; se ignora el message del backend. */
    enCurso: "Tienes otra consulta en curso. Sal de ella o ciérrala antes de atender esta.",
    sinRedSalir: ControladorConexion.motivoSinConexion("salir de la consulta"),
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

/**
 * F9: errores propios de un examen; la serie sigue con el siguiente. Cualquier otro (paso
 * completado, consulta cerrada, rechazo por rol, sesión, red, desconocido) corta la serie.
 */
const ERRORES_POR_EXAMEN = Object.freeze(["consulta.examenNoAsignable", "consulta.examenObligatorio"]);

/** Servicio por defecto (fachada): adapta los servicios REST a las operaciones que usa el controlador. */
export class ServicioConsulta {
    #atencion;
    #consultas;
    #pasos;
    #definiciones;

    constructor({
        atencion = new AtencionService(), consultas = new ConsultaService(),
        pasos = new ConsultaProcedimientoPasoService(), definiciones = new ProcedimientoPasoService(),
    } = {}) {
        this.#atencion = atencion;
        this.#consultas = consultas;
        this.#pasos = pasos;
        this.#definiciones = definiciones;
    }

    retomar(id) { return this.#consultas.retomar(id); }
    contexto() { return this.#atencion.contexto(); }
    consulta(id) { return this.#atencion.consulta(id); }
    paso(id) { return this.#pasos.buscarPorId(id); }
    definicion(id) { return this.#definiciones.buscarPorId(id); }
    ordenes(id) { return this.#pasos.ordenesExamen(id).listar(); }
    asignables(id) { return this.#pasos.examenesAsignables(id); }
    completar(id, valor) { return this.#pasos.completar(id, valor); }
    retroceder(id) { return this.#pasos.retroceder(id); }
    ordenar(id, datos) { return this.#pasos.ordenar(id, datos); }
    cerrar(id, notas) { return this.#consultas.cerrar(id, notas); }
    salirDeConsulta() { return this.#atencion.salirDeConsulta(); }
}

const SIN_DETALLE = congelar({ idPaso: null, cargando: false, error: null, valorGuardado: null, indicaFin: null, ordenes: NINGUNA, asignables: NINGUNA });

export class ControladorConsulta {
    /** Estado reactivo del controlador (composición): `estado` lo publica y `suscribir` delega en él. */
    #reactivo;
    /** Recibe una función que se llama con el Set de claves que cambiaron y el estado; devuelve la función que cancela. */
    suscribir = fn => this.#reactivo.suscribir(fn);
    #servicio;
    #conexion;
    #memoria;
    #reloj;
    #secuencia = 0;
    #secuenciaDetalle = 0;
    #cancelarConexion = null;

    /**
     * @param opciones opcional, con:
     *   - `servicio`: las operaciones de ServicioConsulta, que resuelven { data }.
     *   - `conexion`: objeto con `enLinea` y `suscribir`.
     *   - `memoria`: una MemoriaVistas (memoria_vistas.js).
     *   - `reloj`: función que devuelve la fecha actual.
     */
    constructor({ servicio, conexion = conexionCompartida, memoria = memoriaCompartida, reloj = () => new Date() } = {}) {
        this.#servicio = servicio ?? new ServicioConsulta();
        this.#conexion = conexion;
        this.#memoria = memoria;
        this.#reloj = reloj;
        this.#reactivo = new EstadoReactivo({
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
        this.estado = this.#reactivo.estado;
    }

    // ---------------------------------------------------------------- derivados para la vista

    get pasoActual() { return ControladorConsulta.elegirPasoActual(this.estado.consulta, this.estado.sesion?.rolActivo, this.estado.idElegido); }

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

    get pendientes() { return ControladorConsulta.pasosPendientes(this.estado.consulta); }

    /** Motivo de solo lectura de toda la vista, o null. */
    get bloqueo() {
        const { consulta, atendiendo, enLinea, soloLectura, desdeMemoria } = this.estado;
        return ControladorConsulta.motivoBloqueo({ consulta, atendiendo, enLinea, soloLectura: soloLectura || desdeMemoria });
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
    #cargar(opciones = {}) {
        return new Promise(resolve => {
            const { retomar = false } = opciones;
            const id = ++this.#secuencia;
            const { idConsulta, soloLectura } = this.estado;
            if (!this.#conexion.enLinea || soloLectura) {
                this.#mostrarMemoria(id);
                resolve();
                return;
            }
            this.estado.cargando = true;
            // .catch al final: el try original envolvía la lectura, el retomar y el detalle.
            resolve(new Promise(leer => leer(this.#leerConsulta(idConsulta)))
                .then(consulta => {
                    if (id !== this.#secuencia) return undefined;
                    if (!retomar) return this.#aplicarCarga(id, consulta, this.estado.atendiendo, null);
                    if (!consulta.pendienteParaMi || consulta.fechaFin) return this.#aplicarCarga(id, consulta, false, null);
                    return this.#retomarSiToca(id, idConsulta, consulta);
                })
                .catch(error => this.#fallaDeCarga(id, error)));
        });
    }

    /**
     * PUT …/sesion de una consulta abierta que le toca al rol activo. Si ya no le toca (o se cerró),
     * la vuelve a leer y queda en solo lectura con su motivo; cualquier otro rechazo detiene la carga.
     */
    #retomarSiToca(id, idConsulta, consulta) {
        // Dos argumentos: el try interno solo envolvía el PUT; lo que relanza va al catch de #cargar.
        return new Promise(retomar => retomar(this.#servicio.retomar(idConsulta)))
            .then(() => ({ consulta, atendiendo: true, aviso: null }), error => {
                if (error?.code !== "consulta.yaCerrada" && !CODIGOS_POR_ROL.includes(error?.code)) throw error;
                if (id !== this.#secuencia) return null;
                const aviso = ControladorConsulta.mensajeDeErrorConsulta(error);
                return this.#leerConsulta(idConsulta).then(releida => ({ consulta: releida, atendiendo: false, aviso }));
            })
            .then(resultado => {
                if (resultado === null || id !== this.#secuencia) return undefined;
                return this.#aplicarCarga(id, resultado.consulta, resultado.atendiendo, resultado.aviso);
            });
    }

    /** Publica la consulta leída y pide el detalle del paso actual. */
    #aplicarCarga(id, consulta, atendiendo, aviso) {
        Object.assign(this.estado, { consulta, atendiendo, cargando: false, error: null, desdeMemoria: false });
        if (aviso) this.estado.aviso = aviso;
        return this.#cargarDetalle(id);
    }

    /** El catch de #cargar: lo guardado si no hubo red, o el error (y el enlace a la consulta en curso). */
    #fallaDeCarga(id, error) {
        if (id !== this.#secuencia) return undefined;
        if (error?.status === 0 && this.#guardado()) {
            this.#mostrarMemoria(id);
            return undefined;
        }
        Object.assign(this.estado, { cargando: false, consulta: null, detalle: SIN_DETALLE, error: ControladorConsulta.mensajeDeErrorConsulta(error), desdeMemoria: false });
        if (error?.code === "consulta.cerrarAntesRetomar") return this.#buscarEnCurso(id);
        return undefined;
    }

    #leerConsulta(idConsulta) {
        return new Promise(resolve => resolve(this.#servicio.consulta(idConsulta))).then(({ data }) => {
            const [consulta] = ControladorConsultas.normalizarConsultas([data]);
            if (!consulta || consulta.idConsulta !== idConsulta) throw Object.assign(new Error("ausente"), { status: 404 });
            return consulta;
        });
    }

    #buscarEnCurso(id) {
        return new Promise(resolve => resolve(this.#servicio.contexto()))
            .then(({ data }) => {
                if (id !== this.#secuencia) return;
                const enCurso = Validaciones.esTexto(data?.idConsulta) && data.idConsulta !== this.estado.idConsulta ? data.idConsulta : null;
                this.estado.enCurso = enCurso;
            })
            .catch(() => { /* Sin el enlace, el mensaje sigue siendo útil. */ });
    }

    /**
     * Pide los datos del paso actual: registro, órdenes y asignables en paralelo, y luego `indicaFin`
     * de su definición. Solo si el rol activo atiende la consulta (los datos clínicos del paso no
     * se piden en solo lectura).
     */
    #cargarDetalle(idCarga = this.#secuencia) {
        return new Promise(resolve => {
            const paso = this.pasoActual;
            const consulta = this.estado.consulta;
            const idDetalle = ++this.#secuenciaDetalle;
            if (!paso || !this.atiende || consulta?.fechaFin) {
                this.estado.detalle = SIN_DETALLE;
                this.estado.borrador = "";
                if (this.estado.aviso === MENSAJES.reabierto) this.estado.aviso = null;
                this.#reiniciarExamenes();
                this.#guardarEnMemoria();
                resolve();
                return;
            }
            const idPaso = paso.idConsultaProcedimientoPaso;
            const previo = this.estado.detalle.idPaso === idPaso ? this.estado.detalle : SIN_DETALLE;
            // F9: el filtro, la selección y el resultado son del paso; otro paso empieza de cero.
            if (previo === SIN_DETALLE) this.#reiniciarExamenes();
            this.estado.detalle = congelar({ ...previo, idPaso, cargando: true, error: null });
            const aplicar = (registro, ordenes, asignables, definicion) => {
                if (idDetalle !== this.#secuenciaDetalle || idCarga !== this.#secuencia) return;
                const valorGuardado = Validaciones.esTexto(registro?.data?.valor) ? registro.data.valor : null;
                this.estado.detalle = congelar({
                    idPaso, cargando: false, error: null, valorGuardado,
                    indicaFin: definicion ? definicion.data?.indicaFin === true : null,
                    ordenes: ControladorConsulta.#normalizarOrdenes(ordenes?.data), asignables: ControladorConsulta.normalizarAsignables(asignables?.data),
                });
                this.#depurarExamenes();
                this.#restaurarBorrador();
                this.#guardarEnMemoria();
            };
            // Las tres peticiones salen durante la llamada, como antes; .catch al final, como el try.
            resolve(new Promise(pedir => pedir(Promise.all([
                this.#servicio.paso(idPaso), this.#servicio.ordenes(idPaso), this.#servicio.asignables(idPaso),
            ])))
                .then(([registro, ordenes, asignables]) => {
                    const idDefinicion = registro?.data?.idProcedimientoPaso;
                    // Sin definición no se esperaba nada: se sigue sin agregar una microtarea.
                    if (!idDefinicion) return aplicar(registro, ordenes, asignables, null);
                    return Promise.resolve(this.#servicio.definicion(idDefinicion))
                        .then(definicion => aplicar(registro, ordenes, asignables, definicion));
                })
                .catch(error => {
                    if (idDetalle !== this.#secuenciaDetalle || idCarga !== this.#secuencia) return;
                    const error_ = [0, 401, 403, 404].includes(error?.status) ? ControladorConsulta.mensajeDeErrorConsulta(error) : MENSAJES.detalle;
                    this.estado.detalle = congelar({ ...previo, idPaso, cargando: false, error: error_ });
                }));
        });
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
        if (filtro && !ControladorConsulta.categoriasDe(asignables).some(t => t.idTipoExamen === filtro)) this.estado.filtroExamenes = "";
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
    salirYAtender() {
        return new Promise(resolve => {
            const { enCurso, saliendo, cargando } = this.estado;
            if (!enCurso || saliendo || cargando) { resolve(false); return; }
            if (!this.#conexion.enLinea || this.estado.soloLectura) {
                this.estado.error = MENSAJES.sinRedSalir;
                resolve(false);
                return;
            }
            const id = this.#secuencia;
            this.estado.saliendo = true;
            // Dos argumentos: el try solo envolvía el DELETE.
            resolve(new Promise(salir => salir(this.#servicio.salirDeConsulta())).then(() => {
                if (id !== this.#secuencia) return false;
                Object.assign(this.estado, { saliendo: false, error: null, enCurso: null, errorAccion: null });
                return this.#cargar({ retomar: true }).then(() => true);
            }, error => {
                if (id !== this.#secuencia) return false;
                // El enlace a la consulta en curso se conserva: sigue en la sesión.
                Object.assign(this.estado, { saliendo: false, error: ControladorConsulta.mensajeDeErrorConsulta(error) });
                return false;
            }));
        });
    }

    /** null si se puede pedir el retroceso; si no, su motivo. Solo se ofrece si el paso no es el primero. */
    get motivoNoRetroceder() {
        return this.motivoNoActuar ?? ControladorConsulta.motivoNoRetroceder(this.estado.detalle);
    }

    /**
     * Ejecuta una acción del flujo con su indicador. Si sale bien vuelve a leer la consulta y el
     * paso actual; si falla deja el motivo en `errorAccion` sin perder lo cargado ni el borrador.
     * Algunos rechazos significan que lo mostrado quedó viejo, así que también se recarga.
     */
    #ejecutar(accion, operacion, opciones = {}) {
        return new Promise(resolve => {
            const { alTerminar, alFallar, recargarTras = new Set(["consulta.pasoYaCompletado", "consulta.yaCerrada", ...CODIGOS_POR_ROL]) } = opciones;
            Object.assign(this.estado, { accion, errorAccion: null, confirmando: null });
            const idCarga = this.#secuencia;
            let ok = false;
            // .catch después del .then: el try también envolvía alTerminar.
            resolve(new Promise(operar => operar(operacion()))
                .then(() => {
                    if (idCarga !== this.#secuencia) return false;
                    ok = true;
                    return Promise.resolve(alTerminar?.()).then(() => ok);
                })
                .catch(error => {
                    if (idCarga !== this.#secuencia) return false;
                    this.estado.errorAccion = ControladorConsulta.mensajeDeErrorConsulta(error);
                    const recarga = recargarTras.has(error?.code) ? this.#recargar() : Promise.resolve();
                    return recarga.then(() => alFallar?.(error)).then(() => ok);
                })
                .finally(() => {
                    if (idCarga === this.#secuencia) {
                        Object.assign(this.estado, { accion: null, acabado: congelar({ accion, ok }) });
                    }
                }));
        });
    }

    /** Vuelve a leer la consulta y el paso actual, sin retomarla. Un fallo no borra lo mostrado. */
    #recargar() {
        const id = this.#secuencia;
        return new Promise(resolve => resolve(this.#servicio.consulta(this.estado.idConsulta)))
            .then(({ data }) => {
                if (id !== this.#secuencia) return undefined;
                const [consulta] = ControladorConsultas.normalizarConsultas([data]);
                if (!consulta || consulta.idConsulta !== this.estado.idConsulta) throw Object.assign(new Error("ausente"), { status: 404 });
                this.estado.consulta = consulta;
                return this.#cargarDetalle(id);
            })
            .catch(error => {
                if (id !== this.#secuencia) return;
                this.estado.errorAccion ??= ControladorConsulta.mensajeDeErrorConsulta(error);
            });
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
            alTerminar: () => new Promise(resolve => {
                this.#olvidarBorrador(idPaso);
                Object.assign(this.estado, { idElegido: null, aviso: null, borrador: "" });
                resolve(this.#recargar());
            }),
        });
    }

    /** Pide retroceder: si hay algo escrito, primero pide confirmar que se descartará. */
    pedirRetroceso() {
        if (!ControladorConsulta.puedeOfrecerRetroceso(this.pasoActual) || this.motivoNoRetroceder) return Promise.resolve(false);
        if (this.estado.borrador.trim()) {
            Object.assign(this.estado, { confirmando: "retroceso", errorAccion: null });
            return Promise.resolve(false);
        }
        return this.#retroceder();
    }

    #retroceder() {
        if (!ControladorConsulta.puedeOfrecerRetroceso(this.pasoActual) || this.motivoNoRetroceder) return Promise.resolve(false);
        const idPaso = this.pasoActual.idConsultaProcedimientoPaso;
        let anterior = null;
        const operacion = () => new Promise(resolve => resolve(this.#servicio.retroceder(idPaso)))
            .then(respuesta => { anterior = respuesta?.data ?? null; });
        return this.#ejecutar("retroceder", operacion, {
            alTerminar: () => new Promise(resolve => {
                this.#olvidarBorrador(idPaso);
                const idAnterior = Validaciones.esTexto(anterior?.idConsultaProcedimientoPaso) ? anterior.idConsultaProcedimientoPaso : null;
                // El paso reabierto muestra su valor guardado, no un borrador viejo de antes de completarlo.
                if (idAnterior) this.#olvidarBorrador(idAnterior);
                Object.assign(this.estado, { idElegido: idAnterior, aviso: null, borrador: "" });
                resolve(this.#recargar());
            }),
        });
    }

    /** Pide cerrar la consulta; queda esperando la confirmación. */
    pedirCierre(observaciones = "") {
        if (this.bloqueo || this.estado.accion || !ControladorConsulta.puedeCerrar(this.estado.consulta)) return false;
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
        if (this.bloqueo || !ControladorConsulta.puedeCerrar(this.estado.consulta)) return Promise.resolve(false);
        const notas = this.#observaciones ? { observaciones: this.#observaciones } : {};
        return this.#ejecutar("cierre", () => this.#servicio.cerrar(this.estado.idConsulta, notas), {
            recargarTras: new Set(["consulta.completeAntesCerrar", "consulta.procedimientoSinFinal", "consulta.yaCerrada", ...CODIGOS_POR_ROL]),
            alTerminar: () => new Promise(resolve => {
                this.#observaciones = "";
                this.estado.aviso = MENSAJES.cerradaAhora;
                resolve(this.#recargar());
            }),
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
    #actualizarListas(idPaso, campos) {
        return new Promise(resolve => resolve(Promise.all(campos.map(c => (c === "ordenes" ? this.#servicio.ordenes(idPaso) : this.#servicio.asignables(idPaso))))))
            .then(respuestas => {
                if (this.estado.detalle.idPaso !== idPaso) return;
                const cambios = {};
                campos.forEach((c, i) => { cambios[c] = c === "ordenes" ? ControladorConsulta.#normalizarOrdenes(respuestas[i]?.data) : ControladorConsulta.normalizarAsignables(respuestas[i]?.data); });
                this.estado.detalle = congelar({ ...this.estado.detalle, ...cambios });
                this.#depurarExamenes();
                this.#guardarEnMemoria();
            });
    }

    // ---------------------------------------------------------------- F9: varios exámenes

    /** idExamen ya ordenados en el paso actual: salen marcados y deshabilitados ("Ya ordenado"). */
    get examenesOrdenados() { return ControladorConsulta.idsOrdenados(this.estado.detalle.ordenes); }

    /** Elige la categoría del filtro: "" (Todas) o una de las categorías de los asignables. */
    elegirCategoria(idTipoExamen) {
        const id = typeof idTipoExamen === "string" ? idTipoExamen : "";
        if (id && !ControladorConsulta.categoriasDe(this.estado.detalle.asignables).some(t => t.idTipoExamen === id)) return;
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
    asignarExamenes(opciones = {}) {
        return new Promise(resolve => {
            const { indicaciones } = opciones;
            if (this.motivoNoActuar) { resolve(false); return; }
            const { asignables, ordenes } = this.estado.detalle;
            const idsExamen = this.estado.seleccionExamenes;
            const invalida = ControladorConsulta.validarAsignacion({ idsExamen, indicaciones }, asignables, ordenes);
            if (invalida) {
                this.estado.errorAccion = invalida;
                resolve(false);
                return;
            }
            const idPaso = this.pasoActual.idConsultaProcedimientoPaso;
            const resultados = [];
            const publicar = () => {
                const emitidos = new Set(resultados.filter(r => r.ok).map(r => r.idExamen));
                Object.assign(this.estado, {
                    resultadoExamenes: congelar(resultados),
                    seleccionExamenes: congelar(this.estado.seleccionExamenes.filter(id => !emitidos.has(id))),
                });
            };
            const serie = {
                idPaso, idsExamen, indicaciones, resultados, publicar, recargarAsignables: false,
                nombre: id => asignables.find(e => e.idExamen === id).nombre,
            };
            this.estado.resultadoExamenes = null;
            resolve(this.#ejecutar("orden", () => this.#ordenarDesde(0, serie).then(publicar), {
                recargarTras: RECARGAR_TRAS_ORDEN,
                alTerminar: () => this.#actualizarListas(idPaso, serie.recargarAsignables ? ["ordenes", "asignables"] : ["ordenes"])
                    .catch(error => { this.estado.errorAccion = ControladorConsulta.mensajeDeErrorConsulta(error); }),
            }).then(ok => ok && resultados.some(r => r.ok)));
        });
    }

    /**
     * F9: emite la orden del examen `i` y, al terminar, la del siguiente: EN SERIE, como el for…of
     * original (nunca en paralelo). Un error propio del examen se anota y se sigue; cualquier otro
     * marca los que faltan como "No se envió.", publica y corta la serie relanzando el error.
     */
    #ordenarDesde(i, serie) {
        if (i >= serie.idsExamen.length) return Promise.resolve();
        const idExamen = serie.idsExamen[i];
        // .catch después del .then: el try también envolvía el registro del éxito.
        return new Promise(resolve => resolve(this.#servicio.ordenar(serie.idPaso, { idExamen, indicaciones: serie.indicaciones })))
            .then(() => {
                serie.resultados.push(congelar({ idExamen, nombre: serie.nombre(idExamen), ok: true, mensaje: MENSAJES.ordenEmitida }));
            })
            .catch(error => {
                serie.resultados.push(congelar({ idExamen, nombre: serie.nombre(idExamen), ok: false, mensaje: ControladorConsulta.mensajeDeErrorConsulta(error) }));
                if (ERRORES_POR_EXAMEN.includes(error?.code)) {
                    serie.recargarAsignables ||= error.code === "consulta.examenNoAsignable";
                    return;
                }
                for (const resto of serie.idsExamen.slice(i + 1)) {
                    serie.resultados.push(congelar({ idExamen: resto, nombre: serie.nombre(resto), ok: false, mensaje: MENSAJES.noEnviado }));
                }
                serie.publicar();
                throw error;
            })
            .then(() => this.#ordenarDesde(i + 1, serie));
    }

    cambiarBorrador(valor) {
        const borrador = typeof valor === "string" ? valor : "";
        this.estado.borrador = borrador;
        this.#memoria.guardar(this.#claveBorrador(this.estado.detalle.idPaso ?? this.pasoActual?.idConsultaProcedimientoPaso), borrador);
    }

    /** Traduce un error del servicio a un texto para el usuario, sin detalles internos. */
    static mensajeDeErrorConsulta(error) {
        const code = error?.code;
        if (code && Object.hasOwn(USAR_MENSAJE_BACKEND, code)) return Validaciones.esTexto(error.message) ? error.message.trim() : USAR_MENSAJE_BACKEND[code];
        if (code && Object.hasOwn(POR_CODIGO, code)) return POR_CODIGO[code];
        switch (error?.status) {
            case 0: return MENSAJES.conexion;
            case 401: return MENSAJES.sesionFinalizada;
            case 403: return MENSAJES.sinPermiso;
            case 404: return MENSAJES.noEncontrada;
            case 400: case 409: return Validaciones.esTexto(error.message) ? error.message.trim() : MENSAJES.generico;
            default: return MENSAJES.generico;
        }
    }

    /** Pasos PENDIENTE de la consulta, en orden, con el nombre de su procedimiento. */
    static pasosPendientes(consulta) {
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
    static elegirPasoActual(consulta, rolActivo, idElegido = null) {
        const pendientes = ControladorConsulta.pasosPendientes(consulta).map(p => p.paso);
        if (!pendientes.length) return null;
        return pendientes.find(p => p.idConsultaProcedimientoPaso === idElegido)
            ?? pendientes.find(p => ControladorConsultas.esPasoDeMiRol(p, rolActivo))
            ?? pendientes[0];
    }

    /**
     * Motivo por el que toda la vista queda en solo lectura, en orden de prioridad; null si se puede
     * atender. `atendiendo` es true si la consulta se seleccionó en la sesión (PUT …/sesion).
     */
    static motivoBloqueo({ consulta, atendiendo = false, enLinea = true, soloLectura = false }) {
        if (!consulta) return null;
        if (consulta.fechaFin) return MENSAJES.cerrada;
        if (!consulta.pendienteParaMi) return ControladorConsultas.motivoNoAtender(consulta);
        if (!enLinea || soloLectura) return MENSAJES.sinRed;
        if (!atendiendo) return MENSAJES.sinSeleccion;
        return null;
    }

    /** Retroceder solo se ofrece si el paso no es el primero de su procedimiento. */
    static puedeOfrecerRetroceso(paso) {
        return Boolean(paso) && paso.nivel > 0;
    }

    /** null si se puede retroceder; si no, el motivo que el frontend ya conoce (el backend decide el resto). */
    static motivoNoRetroceder({ ordenes = NINGUNA, valorGuardado = null } = {}) {
        if (ordenes.length) return MENSAJES.retrocesoConOrdenes;
        if (Validaciones.esTexto(valorGuardado)) return MENSAJES.retrocesoConRegistro;
        return null;
    }

    /** El cierre se ofrece cuando la consulta está abierta, tiene procedimientos y no quedan pasos PENDIENTE. */
    static puedeCerrar(consulta) {
        return Boolean(consulta) && !consulta.fechaFin && consulta.procedimientos.length > 0 && ControladorConsulta.pasosPendientes(consulta).length === 0;
    }

    /** Nombre que se muestra para una orden emitida. */
    static nombreDeOrden(orden, asignables) {
        if (!orden?.idExamen) return MENSAJES.sinExamen;
        return asignables.find(e => e.idExamen === orden.idExamen)?.nombre ?? MENSAJES.examenNoDisponible;
    }

    /** Tipos de examen activos de un examen asignable (B8): válidos, sin repetir y congelados. */
    static #normalizarTipos(datos) {
        if (!Array.isArray(datos)) return NINGUNA;
        const vistos = new Set();
        const tipos = [];
        for (const t of datos) {
            if (!t || !Validaciones.esTexto(t.idTipoExamen) || !Validaciones.esTexto(t.nombre) || vistos.has(t.idTipoExamen)) continue;
            vistos.add(t.idTipoExamen);
            tipos.push(congelar({ idTipoExamen: t.idTipoExamen, nombre: t.nombre.trim() }));
        }
        return congelar(tipos);
    }

    /**
     * DTO de GET …/examenes-asignables: [{ idExamen, nombre, tiposExamen: [{ idTipoExamen, nombre }] }].
     * Sin `tiposExamen` queda [] (el filtro por categoría se oculta).
     */
    static normalizarAsignables(datos) {
        if (!Array.isArray(datos)) return NINGUNA;
        return congelar(datos.filter(e => e && Validaciones.esTexto(e.idExamen) && Validaciones.esTexto(e.nombre))
            .map(e => congelar({ idExamen: e.idExamen, nombre: e.nombre.trim(), tiposExamen: ControladorConsulta.#normalizarTipos(e.tiposExamen) })));
    }

    /** F9: categorías del filtro: la unión de los tipos de los asignables, por nombre. */
    static categoriasDe(asignables) {
        const porId = new Map();
        for (const e of asignables ?? NINGUNA) for (const t of e.tiposExamen ?? NINGUNA) if (!porId.has(t.idTipoExamen)) porId.set(t.idTipoExamen, t);
        return congelar([...porId.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
    }

    /** F9: asignables de una categoría; "" (Todas) los devuelve todos. */
    static examenesVisibles(asignables, idTipoExamen = "") {
        if (!idTipoExamen) return asignables;
        return congelar(asignables.filter(e => e.tiposExamen.some(t => t.idTipoExamen === idTipoExamen)));
    }

    /** F9: idExamen ya ordenados en el paso. El backend no impide repetir una orden; el frontend sí. */
    static idsOrdenados(ordenes) {
        return congelar([...new Set((ordenes ?? NINGUNA).map(o => o?.idExamen).filter(Validaciones.esTexto))]);
    }

    /** F9: texto de cuántos exámenes hay seleccionados. */
    static textoSeleccion(n) {
        if (!n) return "Ningún examen seleccionado";
        return n === 1 ? "1 seleccionado" : `${n} seleccionados`;
    }

    /** F9: valida la asignación de varios exámenes antes de enviarla. Devuelve el mensaje o null. */
    static validarAsignacion({ idsExamen, indicaciones } = {}, asignables = NINGUNA, ordenes = NINGUNA) {
        if (!Array.isArray(idsExamen) || idsExamen.length === 0) return MENSAJES.seleccionVacia;
        if (!idsExamen.every(id => asignables.some(e => e.idExamen === id))) return MENSAJES.examenAjeno;
        const ordenados = ControladorConsulta.idsOrdenados(ordenes);
        const repetido = idsExamen.find(id => ordenados.includes(id));
        if (repetido) return MENSAJES.yaOrdenado(asignables.find(e => e.idExamen === repetido).nombre);
        if (typeof indicaciones === "string" && indicaciones.trim().length > MAX_TEXTO) return `Las indicaciones admiten hasta ${MAX_TEXTO} caracteres.`;
        return null;
    }

    static #normalizarOrdenes(datos) {
        if (!Array.isArray(datos)) return NINGUNA;
        return congelar(datos.filter(o => o && Validaciones.esTexto(o.idOrdenExamen)).map(o => congelar({
            idOrdenExamen: o.idOrdenExamen,
            idExamen: Validaciones.esTexto(o.idExamen) ? o.idExamen : null,
            indicaciones: Validaciones.esTexto(o.indicaciones) ? o.indicaciones.trim() : null,
            fechaCreacion: Validaciones.esTexto(o.fechaCreacion) ? o.fechaCreacion : null,
        })));
    }
}
