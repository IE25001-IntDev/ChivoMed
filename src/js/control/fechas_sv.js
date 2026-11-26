/**
 * Fechas en la zona de El Salvador, sin DOM.
 * El backend trabaja con días de El Salvador (yyyy-MM-dd) y fechas con offset -06:00; el
 * navegador puede estar en otra zona, así que nunca se usa la hora local para decidir el día.
 */
const ZONA_SV = "America/El_Salvador";

/** Día y hora de El Salvador (una sola definición para controladores, vistas y componentes). */
export class FechasSV {
    static #ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
    static #DIA_MS = 86400000;
    static #formatoDia = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_SV, year: "numeric", month: "2-digit", day: "2-digit" });
    static #formatoFecha = new Intl.DateTimeFormat("es-SV", { timeZone: "UTC", dateStyle: "medium" });
    static #formatoFechaHora = new Intl.DateTimeFormat("es-SV", { timeZone: ZONA_SV, dateStyle: "medium", timeStyle: "short" });
    static #formatoHora = new Intl.DateTimeFormat("es-SV", { timeZone: ZONA_SV, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

    /** "HH:MM" en El Salvador para una fecha o milisegundos; "" si no es válida. */
    static hora(valor) {
        const ms = FechasSV.#milisegundos(valor);
        return Number.isNaN(ms) ? "" : FechasSV.#formatoHora.format(ms);
    }

    /** Día de El Salvador ('yyyy-MM-dd') de una fecha o milisegundos; null si no es válida. */
    static diaDe(valor) {
        const ms = FechasSV.#milisegundos(valor);
        if (Number.isNaN(ms)) return null;
        const partes = Object.fromEntries(FechasSV.#formatoDia.formatToParts(ms).map(p => [p.type, p.value]));
        return `${partes.year}-${partes.month}-${partes.day}`;
    }

    /** true si es 'yyyy-MM-dd' y además una fecha que existe (rechaza 2026-02-30). */
    static esFechaISO(valor) {
        return !Number.isNaN(FechasSV.#utc(valor));
    }

    /** Día de hoy en El Salvador como 'yyyy-MM-dd'. Con un reloj que da una fecha inválida lanza RangeError. */
    static hoySV(reloj = () => new Date()) {
        const partes = Object.fromEntries(FechasSV.#formatoDia.formatToParts(reloj()).map(p => [p.type, p.value]));
        return `${partes.year}-${partes.month}-${partes.day}`;
    }

    static sumarDias(iso, dias) {
        const ms = FechasSV.#utc(iso);
        if (Number.isNaN(ms)) throw new RangeError(`Fecha inválida: ${iso}`);
        return new Date(ms + dias * FechasSV.#DIA_MS).toISOString().slice(0, 10);
    }

    /** Días de `desde` a `hasta` (0 si son el mismo día; negativo si están invertidas). */
    static diasEntre(desde, hasta) {
        return Math.round((FechasSV.#utc(hasta) - FechasSV.#utc(desde)) / FechasSV.#DIA_MS);
    }

    /** 'yyyy-MM-dd' → "13 nov 2026" (sin desplazar el día por la zona del navegador). */
    static formatearFecha(iso) {
        const ms = FechasSV.#utc(iso);
        return Number.isNaN(ms) ? "Sin fecha" : FechasSV.#formatoFecha.format(ms);
    }

    /** Fecha ISO con offset → fecha y hora de El Salvador; "Sin fecha" si falta o es inválida. */
    static formatearFechaHora(valor) {
        const ms = valor ? Date.parse(valor) : Number.NaN;
        return Number.isNaN(ms) ? "Sin fecha" : FechasSV.#formatoFechaHora.format(ms);
    }

    /** Milisegundos de una fecha o de un número; NaN si no es ninguno de los dos. */
    static #milisegundos(valor) {
        const ms = valor instanceof Date ? valor.getTime() : valor;
        return Number.isFinite(ms) ? ms : Number.NaN;
    }

    /** Milisegundos UTC de la medianoche de un día 'yyyy-MM-dd'; NaN si no es una fecha real. */
    static #utc(iso) {
        const m = typeof iso === "string" ? FechasSV.#ISO.exec(iso) : null;
        if (!m) return Number.NaN;
        const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
        const ms = Date.UTC(anio, mes - 1, dia);
        const fecha = new Date(ms);
        return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia ? ms : Number.NaN;
    }
}
