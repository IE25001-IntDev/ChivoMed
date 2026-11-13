/**
 * Lógica de las consultas del dashboard (HU3, parte 2) sin DOM.
 * Filtra por fechas de El Salvador (hoy por defecto, máximo 31 días contando ambos extremos),
 * carga GET /atencion/dashboard, arma la jerarquía de pasos por `nivel`, pide bajo demanda lo
 * registrado en un paso y decide si una consulta se puede atender y, si no, por qué.
 *
 * El controlador solo escribe en su estado reactivo (`estado`, `suscribir`); nunca llama a la vista.
 * "Atender" publica `estado.navegarA = { ruta }` (un objeto nuevo cada vez).
 * Lo cargado queda en memoria_vistas (nunca en disco) para seguir mostrándolo sin red.
 */
import AtencionService from "../../control/atencion_service.js";
import { crearEstado } from "../../control/estado_reactivo.js";
import { MemoriaVistas, memoria as memoriaCompartida } from "./memoria_vistas.js";
import { conexion as conexionCompartida } from "../pwa/conexion.js";
import { hoySV, esFechaISO, diasEntre, formatearFecha } from "../fechas_sv.js";

export const MAX_DIAS = 31;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VACIO = Object.freeze({});
const NINGUNA = Object.freeze([]);

export const MENSAJES = Object.freeze({
    fechaInvalida: "Escribe fechas válidas en los dos campos.",
    rangoInvertido: "La fecha inicial no puede ser posterior a la final.",
    rangoExcedido: `Elige un rango de ${MAX_DIAS} días como máximo, contando el primero y el último.`,
    conexion: "No pudimos conectar con el servicio. Revisa tu conexión e inténtalo de nuevo.",
    sinRed: "Sin conexión. Las consultas de estas fechas se mostrarán cuando vuelvas a conectarte.",
    sinRedRegistro: "Sin conexión. Podrás ver este registro cuando vuelvas a conectarte.",
    sesionFinalizada: "Tu sesión ha finalizado. Vuelve a iniciar sesión.",
    sinRol: "Tu sesión no tiene un rol activo. Elige un rol arriba.",
    sinAsignacion: "Tu rol activo ya no está autorizado. Elige otro rol o comunícate con tu clínica.",
    sinPermiso: "No tienes permiso para ver estas consultas.",
    pasoNoExiste: "No encontramos este registro. Actualiza la lista e inténtalo de nuevo.",
    generico: "No pudimos cargar las consultas. Inténtalo de nuevo.",
    registroGenerico: "No pudimos cargar el registro. Inténtalo de nuevo.",
    cerrada: "Esta consulta ya está cerrada.",
    sinPendiente: "No tienes pasos pendientes en esta consulta.",
    sinRedAtender: "Sin conexión: para atender una consulta necesitas red.",
    soloDoctor: "Solo el rol Doctor puede atender consultas.",
    sinConsultas: "No hay consultas en estas fechas.",
});

const texto = valor => typeof valor === "string" && valor.trim().length > 0;
const textoONull = valor => (texto(valor) ? valor.trim() : null);
const congelar = Object.freeze;

/** Valida el filtro igual que el backend. Devuelve el mensaje o null si es válido. */
export function validarRango(desde, hasta) {
    if (!esFechaISO(desde) || !esFechaISO(hasta)) return MENSAJES.fechaInvalida;
    const dias = diasEntre(desde, hasta);
    if (dias < 0) return MENSAJES.rangoInvertido;
    if (dias + 1 > MAX_DIAS) return MENSAJES.rangoExcedido;
    return null;
}

function normalizarPaso(p) {
    if (!p || typeof p.idConsultaProcedimientoPaso !== "string" || !UUID.test(p.idConsultaProcedimientoPaso)) return null;
    const responsable = p.responsable && (texto(p.responsable.nombre) || texto(p.responsable.rol))
        ? congelar({ nombre: textoONull(p.responsable.nombre), rol: textoONull(p.responsable.rol) }) : null;
    return congelar({
        idConsultaProcedimientoPaso: p.idConsultaProcedimientoPaso,
        nombre: textoONull(p.nombre) ?? "Paso sin nombre",
        orden: Number.isFinite(p.orden) ? p.orden : null,
        nivel: Number.isInteger(p.nivel) && p.nivel >= 0 ? p.nivel : 0,
        estado: textoONull(p.estado),
        responsable,
        fechaInicio: textoONull(p.fechaInicio),
        fechaFin: textoONull(p.fechaFin),
        tieneValor: p.tieneValor === true,
    });
}

function normalizarProcedimiento(p) {
    if (!p || typeof p.idConsultaProcedimiento !== "string" || !UUID.test(p.idConsultaProcedimiento)) return null;
    return congelar({
        idConsultaProcedimiento: p.idConsultaProcedimiento,
        nombre: textoONull(p.nombre) ?? "Procedimiento sin nombre",
        fechaInicio: textoONull(p.fechaInicio),
        fechaFin: textoONull(p.fechaFin),
        pasos: congelar((Array.isArray(p.pasos) ? p.pasos : []).map(normalizarPaso).filter(Boolean)),
    });
}

/** Limpia y congela la respuesta del dashboard, conservando el orden del backend. */
export function normalizarConsultas(datos) {
    if (!Array.isArray(datos)) return NINGUNA;
    return congelar(datos.filter(c => c && typeof c.idConsulta === "string" && UUID.test(c.idConsulta)).map(c => {
        const p = c.paciente ?? {};
        const nombre = [p.nombres, p.apellidos].filter(texto).map(t => t.trim()).join(" ");
        return congelar({
            idConsulta: c.idConsulta,
            fechaInicio: textoONull(c.fechaInicio),
            fechaFin: textoONull(c.fechaFin),
            pendienteParaMi: c.pendienteParaMi === true,
            paciente: congelar({
                nombre: nombre || "Paciente sin nombre registrado",
                edad: Number.isInteger(p.edad) && p.edad >= 0 ? p.edad : null,
                fechaNacimiento: esFechaISO(p.fechaNacimiento) ? p.fechaNacimiento : null,
                documentos: congelar((Array.isArray(p.documentos) ? p.documentos : [])
                    .filter(d => d && texto(d.tipoDocumento) && texto(d.numero))
                    .map(d => congelar({ tipoDocumento: d.tipoDocumento.trim(), numero: d.numero.trim() }))),
            }),
            procedimientos: congelar((Array.isArray(c.procedimientos) ? c.procedimientos : []).map(normalizarProcedimiento).filter(Boolean)),
        });
    }));
}

/**
 * Jerarquía de pasos a partir de `nivel`, en el orden recibido: un paso de nivel n cuelga del
 * último paso anterior de nivel n − 1. Un salto (0 → 2) se ajusta al nivel anterior + 1.
 * Devuelve [{ paso, hijos: [...] }] congelado.
 */
export function arbolDePasos(pasos) {
    const raiz = [];
    const pila = [];
    for (const paso of pasos ?? []) {
        const pedido = Number.isInteger(paso?.nivel) && paso.nivel >= 0 ? paso.nivel : 0;
        const nivel = Math.min(pedido, pila.length);
        const nodo = { paso, hijos: [] };
        (nivel === 0 ? raiz : pila[nivel - 1].hijos).push(nodo);
        pila.length = nivel;
        pila.push(nodo);
    }
    const congelarNodo = nodo => congelar({ paso: nodo.paso, hijos: congelar(nodo.hijos.map(congelarNodo)) });
    return congelar(raiz.map(congelarNodo));
}

/** Único rol al que el backend le permite atender una consulta (HU4). */
export const ROL_ATIENDE = "DOCTOR";

/**
 * null si la consulta se puede atender; si no, el motivo para mostrar junto al botón.
 * `rol` es el código del rol activo; si se indica y no es DOCTOR, ese motivo va antes que todos.
 */
export function motivoNoAtender(consulta, { enLinea = true, soloLectura = false, rol } = {}) {
    if (rol !== undefined && rol !== ROL_ATIENDE) return MENSAJES.soloDoctor;
    if (!consulta) return MENSAJES.sinPendiente;
    if (consulta.fechaFin) return MENSAJES.cerrada;
    if (!consulta.pendienteParaMi) {
        const pendiente = consulta.procedimientos?.flatMap(p => p.pasos)
            .find(p => p.estado === "PENDIENTE" && (p.responsable?.rol || p.responsable?.nombre));
        return pendiente ? `Le corresponde a ${pendiente.responsable.rol ?? pendiente.responsable.nombre}.` : MENSAJES.sinPendiente;
    }
    if (!enLinea || soloLectura) return MENSAJES.sinRedAtender;
    return null;
}

export function etiquetaEstado(estado) {
    if (estado === "PENDIENTE") return "Pendiente";
    if (estado === "COMPLETADO") return "Completado";
    return estado ?? "Sin estado";
}

/** Resumen para el aria-live: "3 consultas del 13 nov 2026" o "… del 1 nov 2026 al 15 nov 2026". */
export function resumenResultado(consultas, consultado) {
    if (!consultado) return "";
    if (!consultas.length) return MENSAJES.sinConsultas;
    const cuantas = consultas.length === 1 ? "1 consulta" : `${consultas.length} consultas`;
    return consultado.desde === consultado.hasta
        ? `${cuantas} del ${formatearFecha(consultado.desde)}`
        : `${cuantas} del ${formatearFecha(consultado.desde)} al ${formatearFecha(consultado.hasta)}`;
}

/** Traduce un error del servicio a un texto para el usuario, sin detalles internos. */
export function mensajeDeError(error, { registro = false } = {}) {
    switch (error?.code) {
        case "dashboard.fecha": return MENSAJES.fechaInvalida;
        case "dashboard.rangoInvertido": return MENSAJES.rangoInvertido;
        case "dashboard.rangoExcedido": return MENSAJES.rangoExcedido;
        case "auth.rolActivo": return MENSAJES.sinRol;
        case "auth.asignacion": return MENSAJES.sinAsignacion;
        case "consulta.pasoNoExiste": return MENSAJES.pasoNoExiste;
        default: break;
    }
    switch (error?.status) {
        case 0: return MENSAJES.conexion;
        case 401: return MENSAJES.sesionFinalizada;
        case 403: return MENSAJES.sinPermiso;
        case 404: return registro ? MENSAJES.pasoNoExiste : MENSAJES.generico;
        default: return registro ? MENSAJES.registroGenerico : MENSAJES.generico;
    }
}

export class ControladorConsultas {
    #servicio;
    #conexion;
    #memoria;
    #reloj;
    #secuencia = 0;
    #cancelarConexion = null;

    /**
     * @param {object} [opciones]
     * @param {{ dashboard: Function, valorPaso: Function }} [opciones.servicio] resuelven { data }
     * @param {{ enLinea: boolean, suscribir: Function }} [opciones.conexion]
     * @param {MemoriaVistas} [opciones.memoria]
     * @param {() => Date} [opciones.reloj]
     */
    constructor({ servicio, conexion = conexionCompartida, memoria = memoriaCompartida, reloj = () => new Date() } = {}) {
        this.#servicio = servicio ?? new AtencionService();
        this.#conexion = conexion;
        this.#memoria = memoria;
        this.#reloj = reloj;
        const hoy = hoySV(reloj);
        const { estado, suscribir } = crearEstado({
            sesion: null,
            soloLectura: false,
            enLinea: conexion.enLinea,
            desde: hoy,
            hasta: hoy,
            errorRango: null,
            cargando: false,
            error: null,
            consultas: NINGUNA,
            /** { desde, hasta } del resultado mostrado; null si no hay resultado. */
            consultado: null,
            desdeMemoria: false,
            actualizadoEn: null,
            /** { [idPaso]: { abierto, cargando, cargado, valor, fechaFin, error } } */
            valores: VACIO,
            /** { ruta } nuevo cada vez que se pide atender una consulta. */
            navegarA: null,
        });
        this.estado = estado;
        this.suscribir = suscribir;
    }

    #claveConsultas(desde, hasta) {
        const idPersonaRol = this.estado.sesion?.rolActivo?.idPersonaRol;
        return idPersonaRol ? MemoriaVistas.clave(this.estado.sesion, `dashboard.consultas:${idPersonaRol}:${desde}:${hasta}`) : null;
    }

    #claveValor(idPaso) {
        return MemoriaVistas.clave(this.estado.sesion, `dashboard.valor:${idPaso}`);
    }

    /** Conserva los registros abiertos o cargados de pasos que siguen en la lista. */
    #valoresVigentes(consultas) {
        const ids = new Set(consultas.flatMap(c => c.procedimientos.flatMap(p => p.pasos.map(s => s.idConsultaProcedimientoPaso))));
        const vigentes = Object.entries(this.estado.valores).filter(([id]) => ids.has(id));
        return vigentes.length ? congelar(Object.fromEntries(vigentes)) : VACIO;
    }

    #mostrar(guardado, consultado, { desdeMemoria }) {
        Object.assign(this.estado, {
            consultas: guardado.consultas,
            consultado,
            actualizadoEn: guardado.en,
            desdeMemoria,
            valores: this.#valoresVigentes(guardado.consultas),
            cargando: false,
            error: null,
        });
    }

    iniciar(sesion, { soloLectura = false } = {}) {
        this.#cancelarConexion?.();
        this.#cancelarConexion = this.#conexion.suscribir?.(enLinea => this.#alCambiarRed(enLinea)) ?? null;
        const hoy = hoySV(this.#reloj);
        Object.assign(this.estado, { sesion, soloLectura, enLinea: this.#conexion.enLinea, desde: hoy, hasta: hoy, errorRango: null });
        return this.buscar();
    }

    detener() {
        this.#cancelarConexion?.();
        this.#cancelarConexion = null;
        this.#secuencia++;
    }

    #alCambiarRed(enLinea) {
        this.estado.enLinea = enLinea;
        if (enLinea && (this.estado.desdeMemoria || this.estado.error)) this.buscar();
    }

    /** Actualiza el filtro y su validación; no busca. */
    cambiarFechas(desde, hasta) {
        Object.assign(this.estado, { desde, hasta, errorRango: validarRango(desde, hasta) });
    }

    hoy() {
        const hoy = hoySV(this.#reloj);
        this.cambiarFechas(hoy, hoy);
        return this.buscar();
    }

    /** Tras un cambio de rol: otra clínica y otro pendienteParaMi, así que se vacía y se vuelve a buscar. */
    cambiarSesion(sesion) {
        if (sesion?.rolActivo?.idPersonaRol === this.estado.sesion?.rolActivo?.idPersonaRol) return Promise.resolve();
        this.#secuencia++;
        Object.assign(this.estado, { sesion, consultas: NINGUNA, consultado: null, valores: VACIO, desdeMemoria: false, error: null });
        return this.buscar();
    }

    async buscar() {
        const { desde, hasta } = this.estado;
        const errorRango = validarRango(desde, hasta);
        this.estado.errorRango = errorRango;
        if (errorRango) return;
        const consultado = congelar({ desde, hasta });
        const clave = this.#claveConsultas(desde, hasta);
        const guardado = this.#memoria.leer(clave);
        if (!this.#conexion.enLinea) {
            this.#secuencia++;
            if (guardado) this.#mostrar(guardado, consultado, { desdeMemoria: true });
            else Object.assign(this.estado, { consultas: NINGUNA, consultado: null, valores: VACIO, cargando: false, error: MENSAJES.sinRed, desdeMemoria: false });
            return;
        }
        const id = ++this.#secuencia;
        if (guardado) this.#mostrar(guardado, consultado, { desdeMemoria: false });
        Object.assign(this.estado, { cargando: true, error: null });
        try {
            const { data } = await this.#servicio.dashboard({ desde, hasta });
            if (id !== this.#secuencia) return;
            const consultas = normalizarConsultas(data);
            const en = this.#reloj();
            this.#memoria.guardar(clave, congelar({ consultas, en }));
            this.#mostrar({ consultas, en }, consultado, { desdeMemoria: false });
        } catch (error) {
            if (id !== this.#secuencia) return;
            if (error?.status === 0 && guardado) {
                this.#mostrar(guardado, consultado, { desdeMemoria: true });
                return;
            }
            Object.assign(this.estado, { cargando: false, error: mensajeDeError(error), consultas: NINGUNA, consultado: null, valores: VACIO, desdeMemoria: false });
        }
    }

    #paso(idPaso) {
        for (const c of this.estado.consultas) {
            for (const p of c.procedimientos) {
                const paso = p.pasos.find(s => s.idConsultaProcedimientoPaso === idPaso);
                if (paso) return paso;
            }
        }
        return null;
    }

    #valor(idPaso, cambios) {
        const anterior = this.estado.valores[idPaso] ?? {};
        this.estado.valores = congelar({ ...this.estado.valores, [idPaso]: congelar({ ...anterior, ...cambios }) });
    }

    /** Abre o cierra lo registrado en un paso; lo pide una sola vez. */
    alternarRegistro(idPaso) {
        const actual = this.estado.valores[idPaso];
        if (actual?.abierto) {
            this.#valor(idPaso, { abierto: false });
            return Promise.resolve();
        }
        if (!this.#paso(idPaso)?.tieneValor) return Promise.resolve();
        if (actual?.cargando || actual?.cargado) {
            this.#valor(idPaso, { abierto: true });
            return Promise.resolve();
        }
        return this.cargarRegistro(idPaso);
    }

    /** Pide el registro de un paso (también sirve para reintentar tras un error). */
    async cargarRegistro(idPaso) {
        if (!this.#paso(idPaso)?.tieneValor || this.estado.valores[idPaso]?.cargando) return;
        const guardado = this.#memoria.leer(this.#claveValor(idPaso));
        if (guardado) {
            this.#valor(idPaso, { ...guardado, abierto: true, cargando: false, cargado: true, error: null });
            return;
        }
        if (!this.#conexion.enLinea) {
            this.#valor(idPaso, { abierto: true, cargando: false, error: MENSAJES.sinRedRegistro });
            return;
        }
        const sesion = this.estado.sesion;
        this.#valor(idPaso, { abierto: true, cargando: true, error: null });
        try {
            const { data } = await this.#servicio.valorPaso(idPaso);
            if (this.estado.sesion !== sesion || !this.#paso(idPaso)) return;
            const registro = congelar({ valor: typeof data?.valor === "string" ? data.valor : null, fechaFin: textoONull(data?.fechaFin) });
            this.#memoria.guardar(this.#claveValor(idPaso), registro);
            this.#valor(idPaso, { ...registro, cargando: false, cargado: true, error: null });
        } catch (error) {
            if (this.estado.sesion !== sesion || !this.#paso(idPaso)) return;
            this.#valor(idPaso, { cargando: false, error: mensajeDeError(error, { registro: true }) });
        }
    }

    /** Lo que decide motivoNoAtender, tomado del estado: red, solo lectura y código del rol activo. */
    contextoAtender() {
        const { enLinea, soloLectura, sesion } = this.estado;
        return { enLinea, soloLectura, rol: sesion?.rolActivo?.codigo ?? null };
    }

    /** Publica la ruta de la consulta solo si se puede atender. Devuelve true si la publicó. */
    atender(idConsulta) {
        const consulta = this.estado.consultas.find(c => c.idConsulta === idConsulta);
        if (!consulta || motivoNoAtender(consulta, this.contextoAtender())) return false;
        this.estado.navegarA = congelar({ ruta: `/consulta/${consulta.idConsulta}` });
        return true;
    }
}
