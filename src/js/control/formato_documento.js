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
