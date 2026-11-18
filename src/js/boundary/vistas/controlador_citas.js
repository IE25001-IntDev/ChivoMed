/**
 * Lógica del asistente público de búsqueda de citas (HU1) sin DOM.
 * Pasos: 1 tipo de documento, 2 número, 3 clínica, 4 fechas, 5 resultados con el ticket PDF.
 *
 * El controlador solo escribe en su estado reactivo (`estado`, `suscribir`); nunca llama a la vista.
 * Reglas (docs/reportes/hu1-plan.md, cambiadas el 2026-11-17):
 *  - Los campos se desbloquean en orden (`habilitado`): número tras elegir el tipo; clínica cuando
 *    el número cumple la expresión y llegaron sus clínicas; fechas tras elegir clínica; "Buscar
 *    citas" con todo válido. `falta` dice qué falta. Con máscara, las clínicas se piden en cuanto
 *    el número queda completo; sin máscara, al salir del campo.
 *  - Cambiar el tipo vacía el número y todo lo que sigue; cambiar el número o la clínica vacía lo
 *    que sigue. Las fechas vuelven al rango por defecto; fechas → solo los resultados.
 *  - Por el límite de 60 POST cada 5 min: las clínicas se piden una vez por par (tipo, número
 *    recortado), las citas solo si cambia un criterio, nada se repite mientras hay una petición en
 *    curso, y un 429 bloquea las búsquedas hasta la hora de Retry-After.
 *  - El número nunca va a la URL ni al historial. Desde el 2026-11-17, la última búsqueda con éxito
 *    (con su número) va a disco por memoria_vistas para verla sin red; caduca a las 8 horas y
 *    "Nueva búsqueda" la borra.
 * Todo llega por inyección para probarse con node --test.
 */
import CitasPublicasService, { segundosDeEspera } from "../../control/citas_publicas_service.js";
import { listarTiposDocumento as listarTiposHttp, MENSAJES_POR_CODIGO, CODIGO_SIN_RED } from "../../control/auth_service.js";
import { crearValidadorFormato, sinRestriccion } from "../../control/formato_documento.js";
import { crearEstado } from "../../control/estado_reactivo.js";
import { hoySV, sumarDias, diasEntre, esFechaISO, ZONA_SV } from "../fechas_sv.js";
import { memoria as memoriaCompartida, CLAVE_PUBLICA_CITAS, VIGENCIA_MS } from "./memoria_vistas.js";
import { conexion as conexionCompartida } from "../pwa/conexion.js";
import { MENSAJE_SIN_DATOS, mensajeGuardado } from "../pwa/controlador_conexion.js";

/** Sin sesión no hay usuario: la clave es fija; se borra con "Nueva búsqueda", a las 8 horas y al cerrar o iniciar sesión. */
export const CLAVE_MEMORIA = CLAVE_PUBLICA_CITAS;
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
    /** Mismo texto exista o no la persona: el backend responde 200 [] en ambos casos. */
    sinClinicas: "No encontramos ese documento registrado como paciente.",
    sinCitas: "No hay citas en ese rango de fechas.",
    datos: "Revisa los datos de la búsqueda.",
    conexion: "No pudimos conectar con el servicio. Revisa tu conexión e inténtalo de nuevo.",
    generico: "No pudimos completar la búsqueda. Inténtalo de nuevo más tarde.",
    ticketNoExiste: "No pudimos generar el ticket de esta cita.",
    ticketFallido: "No pudimos descargar el ticket. Inténtalo de nuevo.",
    tiposSinRed: "Necesitas conexión para cargar los tipos de documento.",
    sinRedBuscar: "Necesitas conexión para buscar.",
    sinRedTicket: "Necesitas conexión para descargar el ticket.",
    faltaTipo: "Falta elegir el tipo de documento.",
    faltaNumero: "Falta completar el número de documento.",
    faltaClinica: "Falta elegir la clínica.",
    faltaFechas: "Falta escribir un rango de fechas válido.",
    limite: hora => `Hiciste muchas búsquedas seguidas. Podrás intentarlo de nuevo a las ${hora}.`,
    memoria: mensajeGuardado,
    sinDatos: MENSAJE_SIN_DATOS,
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

/**
 * Máscara del número a partir de la expresión regular del tipo: una posición por carácter, cada una
 * `{ clase }` (p. ej. "[0-9]") o `{ literal }` (p. ej. "-"), con `{n}` expandido.
 * `^[0-9]{8}-[0-9]$` → 8 × [0-9], "-", [0-9]. Devuelve null (sin máscara) si la expresión no
 * compila o tiene algo que no es de largo fijo: |, *, +, ?, grupos, {n,m}, "." u otros escapes.
 */
export function mascaraDeExpresion(expresionRegular) {
    if (sinRestriccion(expresionRegular)) return null;
    try { new RegExp(expresionRegular); } catch { return null; }
    const cuerpo = expresionRegular.trim().replace(/^\^/, "").replace(/(?<!\\)\$$/, "");
    const posiciones = [];
    let i = 0;
    while (i < cuerpo.length) {
        let posicion;
        const c = cuerpo[i];
        if (c === "[") {
            const fin = cuerpo.indexOf("]", i + 2);
            if (fin < 0) return null;
            posicion = Object.freeze({ clase: cuerpo.slice(i, fin + 1) });
            i = fin + 1;
        } else if (c === "\\") {
            const siguiente = cuerpo[i + 1];
            if (siguiente === "d") posicion = Object.freeze({ clase: "[0-9]" });
            else if (siguiente && /[-.\/\\^$*+?()[\]{}|]/.test(siguiente)) posicion = Object.freeze({ literal: siguiente });
            else return null;
            i += 2;
        } else if ("|*+?(){}.^$".includes(c)) {
            return null;
        } else {
            posicion = Object.freeze({ literal: c });
            i += 1;
        }
        let veces = 1;
        if (cuerpo[i] === "{") {
            const m = /^\{(\d{1,2})\}/.exec(cuerpo.slice(i));
            if (!m) return null;
            veces = Number(m[1]);
            i += m[0].length;
        }
        for (let n = 0; n < veces; n++) posiciones.push(posicion);
    }
    return posiciones.length ? Object.freeze(posiciones) : null;
}

const pruebasDeClase = new Map();
function aceptaClase(clase, caracter) {
    if (!pruebasDeClase.has(clase)) pruebasDeClase.set(clase, new RegExp(`^${clase}$`));
    return pruebasDeClase.get(clase).test(caracter);
}

/**
 * Limpia `texto` con la máscara: en cada posición de clase entra solo un carácter que la cumpla
 * (la minúscula se convierte si la posición solo acepta mayúsculas); lo demás se descarta. Un literal
 * se pone solo cuando llega el siguiente carácter válido, así borrar funciona normal. Corta en el
 * largo de la máscara. Pegar texto pasa por la misma regla.
 */
export function aplicarMascara(mascara, texto) {
    if (!mascara) return typeof texto === "string" ? texto : "";
    let salida = "";
    for (const caracter of typeof texto === "string" ? texto : "") {
        if (salida.length >= mascara.length) break;
        const posicion = mascara[salida.length];
        if (posicion.literal !== undefined) {
            if (caracter === posicion.literal) { salida += caracter; continue; }
            // El literal se completa solo si el carácter cabe en la posición siguiente.
            let j = salida.length;
            let literales = "";
            while (j < mascara.length && mascara[j].literal !== undefined) literales += mascara[j++].literal;
            const valido = j < mascara.length ? caracterValido(mascara[j], caracter) : null;
            if (valido) salida += literales + valido;
            continue;
        }
        const valido = caracterValido(posicion, caracter);
        if (valido) salida += valido;
    }
    return salida;
}

function caracterValido(posicion, caracter) {
    if (aceptaClase(posicion.clase, caracter)) return caracter;
    const mayuscula = caracter.toUpperCase();
    return mayuscula !== caracter && aceptaClase(posicion.clase, mayuscula) ? mayuscula : null;
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
const NADA_HABILITADO = Object.freeze({ numero: false, clinica: false, fechas: false, buscar: false });
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
    /** Petición de clínicas en curso, para que buscar() y siguiente() la esperen en vez de repetirla. */
    #clinicasEnCurso = null;
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
            /** Qué campos se pueden usar ahora (congelado): se desbloquean en orden. */
            habilitado: NADA_HABILITADO,
            /** Qué falta para poder buscar; null si no falta nada (los motivos de red van aparte). */
            falta: MENSAJES.faltaTipo,
        });
        this.estado = estado;
        this.suscribir = suscribir;
    }

    #actualizar(cambios) {
        Object.assign(this.estado, cambios);
        this.#derivar();
    }

    #errores(cambios) {
        this.estado.errores = Object.freeze({ ...this.estado.errores, ...cambios });
    }

    /** Recalcula `habilitado` y `falta` a partir del resto del estado. */
    #derivar() {
        const e = this.estado;
        const tipo = this.tipo();
        const numeroValido = Boolean(tipo) && validarNumero(tipo, e.numeroDocumento) === null;
        const hayClinicas = numeroValido && Boolean(e.clinicas?.length);
        const clinica = hayClinicas && e.clinicas.some(c => c.idClinica === e.idClinica);
        const rango = validarRango(e.desde, e.hasta) === null;
        const habilitado = {
            numero: Boolean(tipo),
            clinica: hayClinicas && e.cargando !== "clinicas",
            fechas: clinica,
            buscar: clinica && rango && !e.cargando && !this.#motivo(),
        };
        const falta = !tipo ? MENSAJES.faltaTipo
            : !numeroValido || !e.clinicas ? MENSAJES.faltaNumero
            : !e.clinicas.length ? MENSAJES.sinClinicas
            : !clinica ? MENSAJES.faltaClinica
            : !rango ? MENSAJES.faltaFechas : null;
        if (Object.keys(habilitado).some(k => habilitado[k] !== e.habilitado[k])) e.habilitado = Object.freeze(habilitado);
        e.falta = falta;
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

    /**
     * Muestra la búsqueda guardada. La que se cargó del disco al abrir la app y el backend todavía no
     * confirmó (memoria.esCopiaDeDisco) solo se muestra sin conexión: si el backend responde, se borra.
     */
    #restaurar() {
        const guardado = this.#memoria.leer(CLAVE_MEMORIA);
        if (!guardado) return;
        if (this.#conexion.enLinea && this.#memoria.esCopiaDeDisco?.(CLAVE_MEMORIA)) return;
        // Mostrada sin conexión, es lo que se ve: no se borra cuando el backend vuelva.
        if (!this.#conexion.enLinea) this.#memoria.conservarCopiaDeDisco?.(CLAVE_MEMORIA);
        const { criterios, clinicas, citas, en } = guardado;
        const edad = this.#reloj().getTime() - en;
        if (!(edad >= 0 && edad <= VIGENCIA_MS)) { this.#memoria.guardar(CLAVE_MEMORIA, null); return; }
        this.#parCargado = `${criterios.idTipoDocumento}\n${criterios.numeroDocumento}`;
        this.#clinicasPorPar.set(this.#parCargado, clinicas);
        this.#criteriosCargados = JSON.stringify({ idClinica: criterios.idClinica, desde: criterios.desde, hasta: criterios.hasta });
        this.#actualizar({ ...criterios, clinicas, citas, paso: 5, alcanzado: 5,
            desdeMemoria: !this.#conexion.enLinea, actualizadoEn: en });
    }

    #alCambiarRed(enLinea) {
        // Al volver la red no se busca sola (límite de solicitudes); solo los tipos, que no cuentan.
        this.#actualizar({ enLinea, desdeMemoria: enLinea ? false : this.estado.desdeMemoria });
        // Sin conexión (p. ej. el servidor no respondió al cargar) se muestra lo guardado, si no hay nada en pantalla.
        if (!enLinea && !this.estado.citas && !this.estado.cargando) this.#restaurar();
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
        if (this.#parCargado === this.#par()) return;
        this.#secuencia++;
        this.#parCargado = null;
        this.#criteriosCargados = null;
        this.#actualizar({ clinicas: null, idClinica: null, citas: null, tickets: VACIO, cargando: null,
            ...rangoPorDefecto(this.#reloj), alcanzado: Math.min(this.estado.alcanzado, 2), desdeMemoria: false });
    }

    /** Clínica o fechas cambiaron: se invalidan solo los resultados. */
    #invalidarResultados() {
        if (this.#criteriosCargados === JSON.stringify(this.#criterios())) return;
        // Las fechas no invalidan una carga de clínicas, que depende solo del documento.
        if (this.estado.cargando !== "clinicas") this.#secuencia++;
        this.#criteriosCargados = null;
        this.#actualizar({ citas: null, tickets: VACIO, cargando: this.estado.cargando === "clinicas" ? "clinicas" : null,
            alcanzado: Math.min(this.estado.alcanzado, 4), desdeMemoria: false });
    }

    /** Cambiar el tipo vacía el número y todo lo que sigue. */
    elegirTipo(idTipoDocumento) {
        const id = typeof idTipoDocumento === "string" ? idTipoDocumento : "";
        if (id === this.estado.idTipoDocumento) return;
        this.#errores({ tipo: null, numero: null, clinica: null, rango: null });
        this.#actualizar({ idTipoDocumento: id, numeroDocumento: "" });
        this.#invalidarDocumento();
    }

    /** Guarda el número con la máscara del tipo (si su expresión se puede convertir en una). */
    /**
     * Guarda el número con la máscara del tipo (si su expresión se puede convertir en una). Con
     * máscara, en cuanto el número queda completo y válido se piden sus clínicas.
     */
    escribirNumero(valor) {
        const tipo = this.tipo(this.estado.idTipoDocumento);
        if (!tipo) return Promise.resolve();
        const mascara = mascaraDeExpresion(tipo.expresionRegular);
        const numero = aplicarMascara(mascara, typeof valor === "string" ? valor : "");
        if (numero === this.estado.numeroDocumento) return Promise.resolve();
        const cambio = numero.trim() !== this.estado.numeroDocumento.trim();
        if (this.estado.errores.numero || this.estado.errores.clinica) this.#errores({ numero: null, clinica: null });
        this.#actualizar({ numeroDocumento: numero });
        if (cambio) this.#invalidarDocumento();
        if (mascara && numero.length === mascara.length && !validarNumero(tipo, numero) && !this.estado.cargando) {
            return this.#buscarClinicas(false);
        }
        return Promise.resolve();
    }

    /** Cambiar la clínica vacía las fechas (vuelven al rango por defecto) y los resultados. */
    elegirClinica(idClinica) {
        if (!this.estado.clinicas?.some(c => c.idClinica === idClinica) || idClinica === this.estado.idClinica) return;
        this.#errores({ clinica: null, rango: null });
        this.#actualizar({ idClinica, ...rangoPorDefecto(this.#reloj) });
        this.#invalidarResultados();
    }

    fijarFechas({ desde = this.estado.desde, hasta = this.estado.hasta } = {}) {
        desde = String(desde ?? "");
        hasta = String(hasta ?? "");
        if (desde === this.estado.desde && hasta === this.estado.hasta) return;
        // El error del rango se ve al fijar las fechas: con fechas inválidas no se puede buscar.
        this.#errores({ rango: validarRango(desde, hasta) });
        this.#actualizar({ desde, hasta });
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
        // Las clínicas pueden estar llegando porque el número se completó: se espera esa petición.
        if (this.estado.cargando === "clinicas" && this.estado.paso === 2) return this.#esperarClinicas().then(() => this.siguiente());
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

    #mostrarClinicas(clinicas, avanzar = true) {
        this.#parCargado = this.#par();
        const idClinica = clinicas.length === 1 ? clinicas[0].idClinica
            : clinicas.some(c => c.idClinica === this.estado.idClinica) ? this.estado.idClinica : null;
        if (!clinicas.length) this.#errores({ numero: MENSAJES.sinClinicas });
        this.#actualizar({ clinicas, idClinica });
        if (avanzar) this.#avanzar(3);
    }

    /** Promesa de la petición de clínicas en curso (resuelve sin valor), o una resuelta si no hay. */
    #esperarClinicas() {
        return this.#clinicasEnCurso ?? Promise.resolve();
    }

    #buscarClinicas(avanzar = true) {
        const promesa = this.#pedirClinicas(avanzar);
        if (this.estado.cargando === "clinicas") {
            const enCurso = promesa.finally(() => { if (this.#clinicasEnCurso === enCurso) this.#clinicasEnCurso = null; });
            this.#clinicasEnCurso = enCurso;
            return enCurso;
        }
        return promesa;
    }

    async #pedirClinicas(avanzar) {
        const error = validarNumero(this.tipo(), this.estado.numeroDocumento);
        if (error) { this.#errores(this.tipo() ? { numero: error } : { tipo: error }); return; }
        if (this.#parCargado === this.#par() && this.estado.clinicas) {
            if (avanzar) this.#avanzar(3);
            return;
        }
        const guardadas = this.#clinicasPorPar.get(this.#par());
        if (guardadas) { this.#mostrarClinicas(guardadas, avanzar); return; }
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
            if (par === this.#par()) this.#mostrarClinicas(clinicas, avanzar);
        } catch (error) {
            if (id !== this.#secuencia) return;
            this.#actualizar({ cargando: null });
            this.#fallo(error);
        }
    }

    /** Carga las opciones de clínica al salir del documento, sin mover la pantalla. */
    prepararClinicas() {
        if (this.estado.cargando === "clinicas") return this.#esperarClinicas();
        if (this.estado.cargando || !this.tipo() || !this.estado.numeroDocumento.trim()) return Promise.resolve();
        return this.#buscarClinicas(false);
    }

    /** Valida la barra, carga clínicas si hace falta y luego consulta las citas. */
    async buscar() {
        if (this.estado.cargando === "clinicas") await this.#esperarClinicas();
        if (this.estado.cargando) return;
        this.#actualizar({ mensaje: null });
        if (!this.tipo()) { this.#errores({ tipo: MENSAJES.tipoRequerido }); return; }
        const error = validarNumero(this.tipo(), this.estado.numeroDocumento);
        if (error) { this.#errores({ numero: error }); return; }
        const errorRango = validarRango(this.estado.desde, this.estado.hasta);
        if (errorRango) { this.#errores({ rango: errorRango }); return; }
        const par = this.#par();
        if (!this.estado.clinicas) await this.#buscarClinicas(false);
        if (par !== this.#par()) return;
        if (!this.estado.clinicas || this.estado.mensaje) return;
        if (!this.estado.clinicas.some(c => c.idClinica === this.estado.idClinica)) {
            this.#errores(this.estado.clinicas.length ? { clinica: MENSAJES.clinicaRequerida } : { numero: MENSAJES.sinClinicas });
            return;
        }
        return this.#buscarCitas();
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
        const pendiente = this.estado.tickets[idConsulta];
        try {
            const archivo = await this.#servicio.ticket(idConsulta, this.#documento());
            if (this.estado.tickets[idConsulta] !== pendiente) return;
            this.#ticket(idConsulta, { estado: "listo", archivo });
        } catch (error) {
            if (this.estado.tickets[idConsulta] !== pendiente) return;
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
