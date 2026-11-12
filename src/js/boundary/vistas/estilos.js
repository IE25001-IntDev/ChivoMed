/** Hoja de estilos propia enlazada dentro del Shadow DOM de una vista o del shell. */
export function hojaDeEstilos(archivo) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL(`../../../resources/${archivo}`, import.meta.url).href;
    return link;
}
