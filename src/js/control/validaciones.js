/**
 * Validaciones compartidas, sin DOM: una sola definición para servicios, controladores, vistas y rutas.
 */
export class Validaciones {
    /** UUID en texto (los id que manda el backend), sin importar mayúsculas. */
    static UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    /** Largo máximo del número de documento, igual en el login, la búsqueda de citas y el servicio. */
    static MAX_NUMERO_DOCUMENTO = 50;

    /** true si es un texto con algo más que espacios. */
    static esTexto(valor) {
        return typeof valor === "string" && valor.trim().length > 0;
    }
}
