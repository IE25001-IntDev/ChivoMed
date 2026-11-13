/**
 * Fechas en la zona de El Salvador, sin DOM.
 * El backend trabaja con días de El Salvador (yyyy-MM-dd) y fechas con offset -06:00; el
 * navegador puede estar en otra zona, así que nunca se usa la hora local para decidir el día.
 */
export const ZONA_SV = "America/El_Salvador";
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DIA_MS = 86400000;

const formatoDia = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_SV, year: "numeric", month: "2-digit", day: "2-digit" });
const formatoFecha = new Intl.DateTimeFormat("es-SV", { timeZone: "UTC", dateStyle: "medium" });
const formatoFechaHora = new Intl.DateTimeFormat("es-SV", { timeZone: ZONA_SV, dateStyle: "medium", timeStyle: "short" });

/** Milisegundos UTC de la medianoche de un día 'yyyy-MM-dd'; NaN si no es una fecha real. */
function utc(iso) {
    const m = typeof iso === "string" ? ISO.exec(iso) : null;
    if (!m) return Number.NaN;
    const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const ms = Date.UTC(anio, mes - 1, dia);
    const fecha = new Date(ms);
    return fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia ? ms : Number.NaN;
}

/** true si es 'yyyy-MM-dd' y además una fecha que existe (rechaza 2026-02-30). */
export function esFechaISO(valor) {
    return !Number.isNaN(utc(valor));
}

/** Día de hoy en El Salvador como 'yyyy-MM-dd'. */
export function hoySV(reloj = () => new Date()) {
    const partes = Object.fromEntries(formatoDia.formatToParts(reloj()).map(p => [p.type, p.value]));
    return `${partes.year}-${partes.month}-${partes.day}`;
}

export function sumarDias(iso, dias) {
    const ms = utc(iso);
    if (Number.isNaN(ms)) throw new RangeError(`Fecha inválida: ${iso}`);
    return new Date(ms + dias * DIA_MS).toISOString().slice(0, 10);
}

/** Días de `desde` a `hasta` (0 si son el mismo día; negativo si están invertidas). */
export function diasEntre(desde, hasta) {
    return Math.round((utc(hasta) - utc(desde)) / DIA_MS);
}

/** 'yyyy-MM-dd' → "13 nov 2026" (sin desplazar el día por la zona del navegador). */
export function formatearFecha(iso) {
    const ms = utc(iso);
    return Number.isNaN(ms) ? "Sin fecha" : formatoFecha.format(ms);
}

/** Fecha ISO con offset → fecha y hora de El Salvador; "Sin fecha" si falta o es inválida. */
export function formatearFechaHora(valor) {
    const ms = valor ? Date.parse(valor) : Number.NaN;
    return Number.isNaN(ms) ? "Sin fecha" : formatoFechaHora.format(ms);
}
