/**
 * Formato del número de documento según la `expresionRegular` de su tipo, alineado con el backend
 * (AbstractModel.FormatoExpresion): null, texto en blanco o "." significan sin restricción, y la
 * expresión debe cubrir el valor recortado completo (Pattern.matches).
 * Es solo una ayuda para el usuario: el backend decide. Una expresión que JS no compila no valida.
 */

/** true si la expresión no impone formato (mismo criterio que FormatoExpresion.sinRestriccion). */
export function sinRestriccion(expresionRegular) {
    return typeof expresionRegular !== "string" || !expresionRegular.trim() || expresionRegular === ".";
}

/** Prueba de valor completo (recortado) para la expresión; null si no hay restricción o no compila. */
export function crearValidadorFormato(expresionRegular) {
    if (sinRestriccion(expresionRegular)) return null;
    try {
        const patron = new RegExp(`^(?:${expresionRegular})$`);
        return valor => patron.test(typeof valor === "string" ? valor.trim() : "");
    } catch {
        return null; // El backend vuelve a validar; una expresión mal escrita no bloquea al usuario.
    }
}

/**
 * Grupos de dígitos de una expresión hecha solo de dígitos separados por guiones, como la del DUI
 * (`^[0-9]{8}-[0-9]$` → [8, 1]) o la de la licencia (`^[0-9]{4}-[0-9]{6}-[0-9]{3}-[0-9]$`).
 * null para cualquier otra forma (p. ej., el pasaporte `^[A-Z][0-9]{8}$`): esas no se autoformatean.
 */
export function gruposDeDigitos(expresionRegular) {
    if (sinRestriccion(expresionRegular)) return null;
    const cuerpo = expresionRegular.trim().replace(/^\^/, "").replace(/\$$/, "");
    const grupos = [];
    for (const parte of cuerpo.split(/-(?![^[]*\])/)) {
        const m = /^(?:\[0-9\]|\\d)(?:\{(\d{1,2})\})?$/.exec(parte);
        if (!m) return null;
        grupos.push(m[1] ? Number(m[1]) : 1);
    }
    return grupos.length > 1 && grupos.every(n => n > 0) ? grupos : null;
}

/**
 * Inserta los guiones del formato mientras se escribe hacia adelante: "010000044" → "01000004-4".
 * El guion se agrega cuando llega el primer dígito del grupo siguiente. No toca el valor si se está
 * borrando (es más corto que `anterior`), si tiene caracteres que no son dígitos ni guiones, o si
 * el tipo no tiene una expresión de grupos de dígitos. Es solo ayuda: el backend valida.
 */
export function autoformatear(valor, expresionRegular, anterior = "") {
    const texto = typeof valor === "string" ? valor : "";
    const grupos = gruposDeDigitos(expresionRegular);
    if (!grupos || texto.length <= (typeof anterior === "string" ? anterior.length : 0) || /[^0-9-]/.test(texto)) return texto;
    const digitos = texto.replace(/-/g, "").slice(0, grupos.reduce((a, b) => a + b, 0));
    const partes = [];
    let inicio = 0;
    for (const largo of grupos) {
        if (inicio >= digitos.length) break;
        partes.push(digitos.slice(inicio, inicio + largo));
        inicio += largo;
    }
    return partes.join("-");
}
