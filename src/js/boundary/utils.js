/**
 * Utilidades compartidas de presentación para la capa Boundary.
 */

/**
 * Escapa caracteres peligrosos en texto plano para prevenir inyecciones HTML (XSS).
 */
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Formatea una fecha ISO a formato local legible de forma segura.
 */
export function formatearFecha(fechaStr, conHora = true) {
    if (!fechaStr) return 'Sin fecha';
    try {
        const d = new Date(fechaStr);
        if (isNaN(d.getTime())) return String(fechaStr);
        return d.toLocaleDateString('es-SV', conHora ? {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        } : {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    } catch {
        return String(fechaStr);
    }
}

