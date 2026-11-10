/**
 * Utilidades compartidas de presentación para la capa Boundary (BCE).
 */

/**
 * Escapa caracteres peligrosos en texto plano para prevenir inyecciones HTML (XSS).
 * @param {unknown} str
 * @returns {string}
 */
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** Alias en español para consistencia en el proyecto */
export { escapeHtml as escaparHtml };

function normalizarParaResaltado(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

/**
 * Resalta de forma segura las coincidencias de la búsqueda dentro de un texto.
 * Respeta acentos y mayúsculas en el texto original mientras resalta la coincidencia.
 *
 * @param {string} textoOriginal - Texto donde se resaltará
 * @param {string} consulta - Términos de búsqueda
 * @param {string} [claseResaltado='resaltado-glass'] - Clase CSS a aplicar
 * @returns {string} HTML seguro con las etiquetas `<mark>`
 */
export function resaltarCoincidencias(textoOriginal, consulta, claseResaltado = 'resaltado-glass') {
    if (!textoOriginal) return '';
    if (!consulta) return escapeHtml(textoOriginal);

    const consultaNorm = normalizarParaResaltado(consulta);
    if (!consultaNorm) return escapeHtml(textoOriginal);

    const palabras = consultaNorm.split(' ').filter(Boolean);
    if (palabras.length === 0) return escapeHtml(textoOriginal);

    // Para resaltar preservando tildes del texto original:
    // Construimos una expresión regular que coincida con cada letra con o sin tildes
    const mapeoTildes = {
        'a': '[aáàäâã]',
        'e': '[eéèëê]',
        'i': '[iíìïî]',
        'o': '[oóòöôõ]',
        'u': '[uúùüû]',
        'c': '[cç]',
        'n': '[nñ]'
    };

    const patronesPalabras = palabras.map(palabra => {
        const chars = palabra.split('').map(ch => mapeoTildes[ch] || ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        return chars.join('');
    });

    const regex = new RegExp(patronesPalabras.join('|'), 'gi');
    const textoStr = String(textoOriginal);
    let resultado = '';
    let ultimoIndice = 0;

    for (const match of textoStr.matchAll(regex)) {
        const inicio = match.index;
        const fin = inicio + match[0].length;
        resultado += escapeHtml(textoStr.slice(ultimoIndice, inicio));
        resultado += `<mark class="${escapeHtml(claseResaltado)}">${escapeHtml(match[0])}</mark>`;
        ultimoIndice = fin;
    }

    resultado += escapeHtml(textoStr.slice(ultimoIndice));
    return resultado;
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

/** Valida las restricciones nativas también en acciones que no envían un formulario. */
export function validarCampos(campos) {
    let primero;
    for (const campo of [...campos].filter(c => c && !c.disabled)) {
        campo.setCustomValidity('');
        let mensaje = '';
        if (campo.required && typeof campo.value === 'string' && !campo.value.trim()) mensaje = 'Completa este campo; no puede contener solo espacios.';
        if (campo.maxLength >= 0 && campo.value.length > campo.maxLength) mensaje = `Este campo admite hasta ${campo.maxLength} caracteres.`;
        if (campo.validity.patternMismatch) mensaje = campo.title || 'El valor no tiene el formato requerido.';
        campo.setCustomValidity(mensaje);
        campo.setAttribute('aria-invalid', String(!campo.validity.valid));
        campo.addEventListener('input', () => { campo.setCustomValidity(''); campo.removeAttribute('aria-invalid'); }, { once: true });
        if (!campo.validity.valid) primero ??= campo;
    }
    if (primero) { primero.focus(); primero.reportValidity(); }
    return !primero;
}
