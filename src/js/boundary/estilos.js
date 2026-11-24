/** Hojas de estilos propias de la SPA (carpeta resources/). */
export class Estilos {
    /** Hoja de estilos propia enlazada dentro del Shadow DOM de una vista o del shell. */
    static hojaDeEstilos(archivo) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = new URL(`../../resources/${archivo}`, import.meta.url).href;
        return link;
    }
}
