/**
 * Lógica del asistente público de búsqueda de citas (HU1) sin DOM.
 * Pasos: 1 tipo de documento, 2 número, 3 clínica, 4 fechas, 5 resultados con el ticket PDF.
 *
 * El controlador solo escribe en su estado reactivo (`estado`, `suscribir`); nunca llama a la vista.
 * Reglas (docs/reportes/hu1-plan.md):
 *  - Ir y volver entre pasos nunca borra lo escrito; un cambio solo invalida los datos derivados:
 *    tipo o número → clínicas, clínica elegida y resultados (el alcanzado vuelve al 2);
 *    clínica o fechas → solo los resultados (el alcanzado vuelve al 4).
 *  - Por el límite de 60 POST cada 5 min: las clínicas se piden una vez por par (tipo, número
 *    recortado), las citas solo si cambia un criterio, nada se repite mientras hay una petición en
 *    curso, y un 429 bloquea las búsquedas hasta la hora de Retry-After.
 *  - El número no sale de este estado ni de la memoria en RAM (memoria_vistas): nunca va a la URL,
 *    al historial ni al disco.
 * Todo llega por inyección para probarse con node --test.
 */
import CitasPublicasService, { segundosDeEspera } from "../../control/citas_publicas_service.js";
import { listarTiposDocumento as listarTiposHttp, MENSAJES_POR_CODIGO, CODIGO_SIN_RED } from "../../control/auth_service.js";
import { autoformatear, crearValidadorFormato } from "../../control/formato_documento.js";
import { crearEstado } from "../../control/estado_reactivo.js";
import { hoySV, sumarDias, diasEntre, esFechaISO, ZONA_SV } from "../fechas_sv.js";
import { memoria as memoriaCompartida } from "./memoria_vistas.js";
import { conexion as conexionCompartida } from "../pwa/conexion.js";

/** Sin sesión no hay usuario: la clave es fija y se borra al cerrar o iniciar sesión, o al recargar. */
export const CLAVE_MEMORIA = "publico:citas";
export const MAX_NUMERO_DOCUMENTO = 50;
/** El backend compara ChronoUnit.DAYS.between(desde, hasta) > 366 (D1: manda el código). */
export const MAX_DIAS_RANGO = 366;
export const DIAS_POR_DEFECTO = 30;

export const PASOS = Object.freeze([
    Object.freeze({ numero: 1, nombre: "Tipo de documento" }),
    Object.freeze({ numero: 2, nombre: "Número de documento" }),
    Object.freeze({ numero: 3, nombre: "Clínica" }),
    Object.freeze({ numero: 4, nombre: "Fechas" }),
    Object.freeze({ numero: 5, nombre: "Resultados" }),
]);

export const MENSAJES = Object.freeze({
    tipoRequerido: "Selecciona el tipo de documento.",
    numeroRequerido: "Escribe tu número de documento.",
    numeroLargo: `El número no puede tener más de ${MAX_NUMERO_DOCUMENTO} caracteres.`,
    numeroSaltos: "El número no puede tener saltos de línea.",
    clinicaRequerida: "Selecciona una clínica.",
    fechasInvalidas: "Escribe dos fechas válidas.",
    rangoInvertido: "La fecha inicial no puede ser posterior a la final.",
    rangoLargo: `Entre la fecha inicial y la final puede haber como máximo ${MAX_DIAS_RANGO} días.`,
    sinClinicas: "No encontramos clínicas para esa búsqueda. Revisa el tipo y el número de documento.",
    sinCitas: "No hay citas en ese rango de fechas.",
    datos: "Revisa los datos de la búsqueda.",
    conexion: "No pudimos conectar con el servicio. Revisa tu conexión e inténtalo de nuevo.",
    generico: "No pudimos completar la búsqueda. Inténtalo de nuevo más tarde.",
    ticketNoExiste: "No pudimos generar el ticket de esta cita.",
    ticketFallido: "No pudimos descargar el ticket. Inténtalo de nuevo.",
    tiposSinRed: "Necesitas conexión para cargar los tipos de documento.",
    sinRedBuscar: "Necesitas conexión para buscar.",
    sinRedTicket: "Necesitas conexión para descargar el ticket.",
    limite: hora => `Hiciste muchas búsquedas seguidas. Podrás intentarlo de nuevo a las ${hora}.`,
    memoria: hora => `Sin conexión. Mostrando la búsqueda de las ${hora}.`,
});

const formatoHora = new Intl.DateTimeFormat("es-SV", { timeZone: ZONA_SV, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "HH:MM" en El Salvador para una fecha o milisegundos; "" si no es válida. */
export function formatearHoraSV(valor) {
    const ms = valor instanceof Date ? valor.getTime() : valor;
    return Number.isFinite(ms) ? formatoHora.format(ms) : "";
}

/** De hoy − 30 a hoy + 30 días de El Salvador: se ven citas pasadas, de hoy y futuras. */
export function rangoPorDefecto(reloj = () => new Date()) {
    const hoy = hoySV(reloj);
    return { desde: sumarDias(hoy, -DIAS_POR_DEFECTO), hasta: sumarDias(hoy, DIAS_POR_DEFECTO) };
}

/** Error del número para el tipo elegido (null si es válido). Mismas reglas que @NotBlank/@Size/@Pattern. */
export function validarNumero(tipo, numeroDocumento) {
    if (!tipo) return MENSAJES.tipoRequerido;
    const numero = typeof numeroDocumento === "string" ? numeroDocumento.trim() : "";
    if (!numero) return MENSAJES.numeroRequerido;
    if (numero.length > MAX_NUMERO_DOCUMENTO) return MENSAJES.numeroLargo;
    if (/[\r\n]/.test(numero)) return MENSAJES.numeroSaltos;
    const formato = crearValidadorFormato(tipo.expresionRegular);
    if (formato && !formato(numero)) {
        return tipo.indicaciones
            ? `El número no tiene el formato de ${tipo.nombre}. ${tipo.indicaciones}`
            : `El número no tiene el formato de ${tipo.nombre}.`;
    }
    return null;
}

/** Error del rango (null si es válido): fechas reales, desde ≤ hasta y diferencia ≤ 366 días. */
export function validarRango(desde, hasta) {
    if (!esFechaISO(desde) || !esFechaISO(hasta)) return MENSAJES.fechasInvalidas;
    const dias = diasEntre(desde, hasta);
    if (dias < 0) return MENSAJES.rangoInvertido;
    if (dias > MAX_DIAS_RANGO) return MENSAJES.rangoLargo;
    return null;
}

export function pasoAlcanzable(paso, alcanzado) {
    return Number.isInteger(paso) && paso >= 1 && paso <= alcanzado && paso <= PASOS.length;
}

/** Por qué no se puede hacer un POST ahora (sin red o bloqueado por el límite); null si se puede. */
export function motivoNoBuscar({ enLinea, bloqueadoHasta }, ahora) {
    if (!enLinea) return MENSAJES.sinRedBuscar;
    if (bloqueadoHasta && bloqueadoHasta > ahora) return MENSAJES.limite(formatearHoraSV(bloqueadoHasta));
    return null;
}

/** Texto para el usuario a partir de un DefaultError; nunca los detalles internos. */
export function mensajeDeErrorCitas(error) {
    const codigo = error?.code;
    if (codigo && Object.hasOwn(MENSAJES_POR_CODIGO, codigo)) return MENSAJES_POR_CODIGO[codigo];
    if (codigo === "citas.rango") return typeof error.message === "string" && error.message.trim() ? error.message : MENSAJES.rangoLargo;
    if (codigo === "validacion.invalida" || codigo === "json.invalido") return MENSAJES.datos;
    if (codigo === "cita.noExiste") return MENSAJES.ticketNoExiste;
    if (error?.status === 0 || codigo === CODIGO_SIN_RED) return MENSAJES.conexion;
    return MENSAJES.generico;
}

const SIN_ERRORES = Object.freeze({ tipo: null, numero: null, clinica: null, rango: null });
const VACIO = Object.freeze({});

export class ControladorCitas {
    #servicio;
    #listarTipos;
    #conexion;
    #memoria;
    #reloj;
    #temporizador;
    #cancelarConexion = null;
    #desbloqueo = null;
    #secuencia = 0;
    /** par "tipo\nnúmero recortado" → clínicas, para no repetir la petición. */
    #clinicasPorPar = new Map();
    /** Par con el que se cargaron las clínicas del estado; null si están invalidadas. */
    #parCargado = null;
    /** Criterios (JSON) de las citas del estado; null si están invalidadas. */
    #criteriosCargados = null;

    /**
     * @param {object} [opciones]
     * @param {{ clinicas: Function, citas: Function, ticket: Function }} [opciones.servicio]
     * @param {() => Promise<object[]>} [opciones.listarTiposDocumento]
     * @param {{ enLinea: boolean, suscribir: Function }} [opciones.conexion]
     * @param {import("./memoria_vistas.js").MemoriaVistas} [opciones.memoria]
     * @param {() => Date} [opciones.reloj]
     * @param {{ programar: (fn: Function, ms: number) => unknown, cancelar: (t: unknown) => void }} [opciones.temporizador]
     */
    constructor({ servicio, listarTiposDocumento = listarTiposHttp, conexion = conexionCompartida,
        memoria = memoriaCompartida, reloj = () => new Date(),
        temporizador = { programar: (fn, ms) => setTimeout(fn, ms), cancelar: t => clearTimeout(t) } } = {}) {
        this.#servicio = servicio ?? new CitasPublicasService();
        this.#listarTipos = listarTiposDocumento;
        this.#conexion = conexion;
        this.#memoria = memoria;
        this.#reloj = reloj;
        this.#temporizador = temporizador;
        const { estado, suscribir } = crearEstado({
            tipos: Object.freeze([]),
            cargandoTipos: false,
            errorTipos: null,
            paso: 1,
            alcanzado: 1,
            idTipoDocumento: "",
            numeroDocumento: "",
            idClinica: null,
            ...rangoPorDefecto(reloj),
            /** null: sin pedir (o invalidadas); [] : la búsqueda no encontró nada. */
            clinicas: null,
            citas: null,
            /** "clinicas" | "citas" | null */
            cargando: null,
            errores: SIN_ERRORES,
            /** Error general de la última acción (conexión, límite, servidor). */
            mensaje: null,
            /** Milisegundos hasta los que un 429 bloquea los POST; null si no hay bloqueo. */
            bloqueadoHasta: null,
            enLinea: conexion.enLinea,
            desdeMemoria: false,
            actualizadoEn: null,
            /** idConsulta → { estado: "descargando"|"listo"|"entregado"|"error", archivo?, error? } */
            tickets: VACIO,
        });
        this.estado = estado;
        this.suscribir = suscribir;
    }

    #actualizar(cambios) {
        Object.assign(this.estado, cambios);
    }

    #errores(cambios) {
        this.estado.errores = Object.freeze({ ...this.estado.errores, ...cambios });
    }

    tipo(idTipoDocumento = this.estado.idTipoDocumento) {
        return this.estado.tipos.find(t => t.idTipoDocumento === idTipoDocumento) ?? null;
    }

    #par() {
        return `${this.estado.idTipoDocumento}\n${this.estado.numeroDocumento.trim()}`;
    }

    #documento() {
        return { idTipoDocumento: this.estado.idTipoDocumento, numeroDocumento: this.estado.numeroDocumento.trim() };
    }

    #criterios() {
        const { idClinica, desde, hasta } = this.estado;
        return { idClinica, desde, hasta };
    }

    #motivo() {
        return motivoNoBuscar(this.estado, this.#reloj().getTime());
    }

    /** Muestra lo guardado en memoria (si hay), se suscribe a la red y carga los tipos. */
    iniciar() {
        this.#cancelarConexion?.();
        this.#cancelarConexion = this.#conexion.suscribir?.(enLinea => this.#alCambiarRed(enLinea)) ?? null;
        this.#actualizar({ enLinea: this.#conexion.enLinea });
        this.#restaurar();
        return this.cargarTipos();
    }

    detener() {
        this.#cancelarConexion?.();
        this.#cancelarConexion = null;
        this.#temporizador.cancelar(this.#desbloqueo);
        this.#desbloqueo = null;
        this.#secuencia++;
    }

    #restaurar() {
        const guardado = this.#memoria.leer(CLAVE_MEMORIA);
        if (!guardado) return;
        const { criterios, clinicas, citas, en } = guardado;
        this.#parCargado = `${criterios.idTipoDocumento}\n${criterios.numeroDocumento}`;
        this.#clinicasPorPar.set(this.#parCargado, clinicas);
        this.#criteriosCargados = JSON.stringify({ idClinica: criterios.idClinica, desde: criterios.desde, hasta: criterios.hasta });
        this.#actualizar({ ...criterios, clinicas, citas, paso: 5, alcanzado: 5,
            desdeMemoria: !this.#conexion.enLinea, actualizadoEn: en });
    }

    #alCambiarRed(enLinea) {
        // Al volver la red no se busca sola (límite de solicitudes); solo los tipos, que no cuentan.
        this.#actualizar({ enLinea, desdeMemoria: enLinea ? false : this.estado.desdeMemoria });
        if (enLinea && this.estado.errorTipos) this.cargarTipos();
    }

    async cargarTipos() {
        if (this.estado.cargandoTipos || this.estado.tipos.length) return;
        this.#actualizar({ cargandoTipos: true, errorTipos: null });
        try {
            const tipos = await this.#listarTipos();
            this.#actualizar({ cargandoTipos: false, tipos: Object.freeze([...tipos]) });
        } catch (error) {
            const sinRed = error?.code === CODIGO_SIN_RED || error?.status === 0;
            this.#actualizar({ cargandoTipos: false, errorTipos: sinRed ? MENSAJES.tiposSinRed : (error?.message || MENSAJES.generico) });
        }
    }

    /** Tipo o número cambiaron: se invalidan clínicas, clínica elegida y resultados. */
    #invalidarDocumento() {
        if (this.#parCargado === null || this.#parCargado === this.#par()) return;
        this.#parCargado = null;
        this.#criteriosCargados = null;
        this.#actualizar({ clinicas: null, idClinica: null, citas: null, tickets: VACIO,
            alcanzado: Math.min(this.estado.alcanzado, 2), desdeMemoria: false });
    }

    /** Clínica o fechas cambiaron: se invalidan solo los resultados. */
    #invalidarResultados() {
        if (this.#criteriosCargados === null || this.#criteriosCargados === JSON.stringify(this.#criterios())) return;
        this.#criteriosCargados = null;
        this.#actualizar({ citas: null, tickets: VACIO, alcanzado: Math.min(this.estado.alcanzado, 4), desdeMemoria: false });
    }

    elegirTipo(idTipoDocumento) {
        const id = typeof idTipoDocumento === "string" ? idTipoDocumento : "";
        if (id === this.estado.idTipoDocumento) return;
        this.#actualizar({ idTipoDocumento: id });
        this.#errores({ tipo: null, numero: null });
        this.#invalidarDocumento();
    }

    /** Guarda el número; al escribir hacia adelante inserta los guiones del formato (p. ej., DUI). */
    escribirNumero(valor) {
        const tipo = this.tipo(this.estado.idTipoDocumento);
        const numero = autoformatear(typeof valor === "string" ? valor : "", tipo?.expresionRegular, this.estado.numeroDocumento);
        if (numero === this.estado.numeroDocumento) return;
        this.#actualizar({ numeroDocumento: numero });
        if (this.estado.errores.numero) this.#errores({ numero: null });
        this.#invalidarDocumento();
    }

    elegirClinica(idClinica) {
        if (!this.estado.clinicas?.some(c => c.idClinica === idClinica) || idClinica === this.estado.idClinica) return;
        this.#actualizar({ idClinica });
        this.#errores({ clinica: null });
        this.#invalidarResultados();
    }

    fijarFechas({ desde = this.estado.desde, hasta = this.estado.hasta } = {}) {
        this.#actualizar({ desde: String(desde ?? ""), hasta: String(hasta ?? "") });
        if (this.estado.errores.rango) this.#errores({ rango: null });
        this.#invalidarResultados();
    }

    irA(paso) {
        if (pasoAlcanzable(paso, this.estado.alcanzado)) this.#actualizar({ paso });
    }

    atras() {
        if (this.estado.paso > 1) this.#actualizar({ paso: this.estado.paso - 1 });
    }

    #avanzar(paso) {
        this.#actualizar({ paso, alcanzado: Math.max(this.estado.alcanzado, paso) });
    }

    /** Valida el paso actual y avanza; en los pasos 2 y 4 hace la petición si hace falta. */
    siguiente() {
        if (this.estado.cargando) return Promise.resolve();
        switch (this.estado.paso) {
            case 1:
                if (!this.tipo()) { this.#errores({ tipo: MENSAJES.tipoRequerido }); return Promise.resolve(); }
                this.#avanzar(2);
                return Promise.resolve();
            case 2: return this.#buscarClinicas();
            case 3:
                if (!this.estado.clinicas?.some(c => c.idClinica === this.estado.idClinica)) {
                    if (this.estado.clinicas?.length) this.#errores({ clinica: MENSAJES.clinicaRequerida });
                    return Promise.resolve();
                }
                this.#avanzar(4);
                return Promise.resolve();
            case 4: return this.#buscarCitas();
            default: return Promise.resolve();
        }
    }

    #mostrarClinicas(clinicas) {
        this.#parCargado = this.#par();
        const idClinica = clinicas.length === 1 ? clinicas[0].idClinica
            : clinicas.some(c => c.idClinica === this.estado.idClinica) ? this.estado.idClinica : null;
        this.#actualizar({ clinicas, idClinica });
        this.#avanzar(3);
    }

    async #buscarClinicas() {
        const error = validarNumero(this.tipo(), this.estado.numeroDocumento);
        if (error) { this.#errores(this.tipo() ? { numero: error } : { tipo: error }); return; }
        if (this.#parCargado === this.#par() && this.estado.clinicas) { this.#avanzar(3); return; }
        const guardadas = this.#clinicasPorPar.get(this.#par());
        if (guardadas) { this.#mostrarClinicas(guardadas); return; }
        const motivo = this.#motivo();
        if (motivo) { this.#actualizar({ mensaje: motivo }); return; }
        const id = ++this.#secuencia;
        const par = this.#par();
        this.#actualizar({ cargando: "clinicas", mensaje: null });
        try {
            const clinicas = Object.freeze([...await this.#servicio.clinicas(this.#documento())]);
            if (id !== this.#secuencia) return;
            this.#clinicasPorPar.set(par, clinicas);
            this.#actualizar({ cargando: null });
            if (par === this.#par()) this.#mostrarClinicas(clinicas);
        } catch (error) {
            if (id !== this.#secuencia) return;
            this.#actualizar({ cargando: null });
            this.#fallo(error);
        }
    }

    async #buscarCitas() {
        const error = validarRango(this.estado.desde, this.estado.hasta);
        if (error) { this.#errores({ rango: error }); return; }
        const criterios = this.#criterios();
        const clave = JSON.stringify(criterios);
        if (this.#criteriosCargados === clave && this.estado.citas) { this.#avanzar(5); return; }
        const motivo = this.#motivo();
        if (motivo) { this.#actualizar({ mensaje: motivo }); return; }
        const id = ++this.#secuencia;
        const documento = this.#documento();
        this.#actualizar({ cargando: "citas", mensaje: null });
        try {
            const citas = Object.freeze([...await this.#servicio.citas(documento, criterios)]);
            if (id !== this.#secuencia) return;
            const en = this.#reloj().getTime();
            this.#criteriosCargados = clave;
            this.#memoria.guardar(CLAVE_MEMORIA, Object.freeze({
                criterios: Object.freeze({ ...documento, ...criterios }), clinicas: this.estado.clinicas, citas, en,
            }));
            this.#actualizar({ cargando: null, citas, tickets: VACIO, desdeMemoria: false, actualizadoEn: en });
            this.#avanzar(5);
        } catch (error) {
            if (id !== this.#secuencia) return;
            this.#actualizar({ cargando: null });
            if (error?.code === "citas.rango") this.#errores({ rango: mensajeDeErrorCitas(error) });
            else this.#fallo(error);
        }
    }

    /** 429: bloquea los POST hasta Retry-After; lo demás va a `mensaje`. */
    #fallo(error) {
        if (error?.status !== 429) { this.#actualizar({ mensaje: mensajeDeErrorCitas(error) }); return; }
        const segundos = segundosDeEspera(error);
        const bloqueadoHasta = this.#reloj().getTime() + segundos * 1000;
        this.#temporizador.cancelar(this.#desbloqueo);
        this.#desbloqueo = this.#temporizador.programar(() => {
            this.#desbloqueo = null;
            this.#actualizar({ bloqueadoHasta: null, mensaje: null });
        }, segundos * 1000);
        this.#actualizar({ bloqueadoHasta, mensaje: MENSAJES.limite(formatearHoraSV(bloqueadoHasta)) });
    }

    #ticket(idConsulta, valor) {
        this.estado.tickets = Object.freeze({ ...this.estado.tickets, [idConsulta]: Object.freeze(valor) });
    }

    async descargarTicket(idConsulta) {
        if (!this.estado.citas?.some(c => c.idConsulta === idConsulta)) return;
        if (this.estado.tickets[idConsulta]?.estado === "descargando" || this.#motivo()) return;
        this.#ticket(idConsulta, { estado: "descargando" });
        try {
            const archivo = await this.#servicio.ticket(idConsulta, this.#documento());
            this.#ticket(idConsulta, { estado: "listo", archivo });
        } catch (error) {
            if (error?.status === 429) {
                this.#fallo(error);
                this.#ticket(idConsulta, { estado: "error", error: this.estado.mensaje });
                return;
            }
            const mensaje = error?.code === "cita.noExiste" ? MENSAJES.ticketNoExiste
                : error?.status === 0 ? MENSAJES.conexion : MENSAJES.ticketFallido;
            this.#ticket(idConsulta, { estado: "error", error: mensaje });
        }
    }

    /** La vista ya entregó el archivo al navegador: se suelta el Blob. */
    ticketEntregado(idConsulta) {
        if (this.estado.tickets[idConsulta]?.estado === "listo") this.#ticket(idConsulta, { estado: "entregado" });
    }

    /** Borra todo lo escrito (número incluido) y lo guardado; conserva el catálogo de tipos. */
    nuevaBusqueda() {
        this.#secuencia++;
        this.#clinicasPorPar.clear();
        this.#parCargado = null;
        this.#criteriosCargados = null;
        this.#memoria.guardar(CLAVE_MEMORIA, null);
        this.#actualizar({ paso: 1, alcanzado: 1, idTipoDocumento: "", numeroDocumento: "", idClinica: null,
            ...rangoPorDefecto(this.#reloj), clinicas: null, citas: null, cargando: null, errores: SIN_ERRORES,
            mensaje: this.estado.bloqueadoHasta ? this.estado.mensaje : null,
            desdeMemoria: false, actualizadoEn: null, tickets: VACIO });
    }
}
