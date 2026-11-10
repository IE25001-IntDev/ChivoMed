/**
 * busqueda_util.js
 * Módulo de utilidades de búsqueda y filtrado reactivo para ChivoMed.
 * Diseñado con normalización de diacríticos, multi-términos, búsqueda profunda y debounce.
 */

/**
 * Normaliza un texto removiendo diacríticos (tildes), pasando a minúsculas
 * y colapsando espacios repetidos.
 * @param {unknown} texto - Texto a normalizar
 * @returns {string} Texto limpio y normalizado
 */
export function normalizarTexto(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Elimina acentos/tildes
        .toLowerCase()
        .trim()
        .replace(/\s+/g, ' ');
}

/**
 * Obtiene el valor de una propiedad de un objeto mediante una ruta con puntos (ej: "persona.nombre").
 * @param {object} obj - Objeto origen
 * @param {string} ruta - Ruta de la propiedad
 * @returns {unknown} Valor encontrado o undefined
 */
export function obtenerPropiedadPorRuta(obj, ruta) {
    if (!obj || typeof obj !== 'object' || !ruta) return undefined;
    return ruta.split('.').reduce((acc, parte) => (acc && acc[parte] !== undefined ? acc[parte] : undefined), obj);
}

/**
 * Evalúa si un valor coincide con una subcadena ya normalizada.
 * @param {unknown} valor - Valor a inspeccionar
 * @param {string} terminoNormalizado - Término normalizado
 * @returns {boolean}
 */
export function coincideTexto(valor, terminoNormalizado) {
    if (!terminoNormalizado) return true;
    const valorNorm = normalizarTexto(valor);
    return valorNorm.includes(terminoNormalizado);
}

/**
 * Extrae todas las cadenas inspeccionables de un objeto, limitando a campos si se especifican.
 * @param {object} item - Elemento a inspeccionar
 * @param {string[]} [campos] - Lista de campos a inspeccionar
 * @returns {string[]} Lista de textos normalizados
 */
export function extraerTextos(item, campos = []) {
    if (!item || typeof item !== 'object') {
        return [normalizarTexto(item)];
    }

    if (campos.length > 0) {
        return campos
            .map(campo => obtenerPropiedadPorRuta(item, campo))
            .filter(v => v !== null && v !== undefined)
            .map(normalizarTexto);
    }

    // Si no se especificaron campos, inspeccionar todas las propiedades de primer nivel
    const valores = [];
    for (const valor of Object.values(item)) {
        if (typeof valor === 'string' || typeof valor === 'number') {
            valores.push(normalizarTexto(valor));
        } else if (valor && typeof valor === 'object') {
            valores.push(...extraerTextos(valor));
        }
    }
    return valores;
}

/**
 * Filtra una colección en memoria aplicando normalización y soporte multi-término.
 *
 * Por ejemplo: "dr perez cardio" coincidirá con un registro si todos los términos
 * están presentes en cualquiera de los campos configurados (AND lógico entre palabras).
 *
 * @template T
 * @param {T[]} items - Lista de elementos
 * @param {string} consulta - Término o frase de búsqueda
 * @param {object} [opciones]
 * @param {string[]} [opciones.campos] - Lista de campos en los que buscar (soporta anidación con puntos)
 * @param {'todas'|'alguna'} [opciones.coincidencia='todas'] - 'todas' requiere todas las palabras; 'alguna' al menos una
 * @param {number} [opciones.limite] - Límite máximo de resultados a retornar
 * @returns {T[]} Elementos filtrados
 */
export function filtrarColeccion(items, consulta, opciones = {}) {
    if (!Array.isArray(items)) return [];
    const consultaNorm = normalizarTexto(consulta);
    if (!consultaNorm) return items.slice(0, opciones.limite || undefined);

    const palabras = consultaNorm.split(' ').filter(Boolean);
    const campos = opciones.campos || [];
    const modo = opciones.coincidencia || 'todas';

    const resultados = [];

    for (const item of items) {
        const textosItem = extraerTextos(item, campos);

        const coincidePalabra = (palabra) => {
            return textosItem.some(texto => texto.includes(palabra));
        };

        const pasaFiltro = modo === 'alguna'
            ? palabras.some(coincidePalabra)
            : palabras.every(coincidePalabra);

        if (pasaFiltro) {
            resultados.push(item);
            if (opciones.limite && resultados.length >= opciones.limite) {
                break;
            }
        }
    }

    return resultados;
}

/**
 * Crea una función con debounce para entradas de búsqueda en tiempo real,
 * evitando llamadas excesivas al escribir rápidamente.
 *
 * @param {Function} fn - Función a ejecutar tras el retardo
 * @param {number} [esperaMs=250] - Tiempo de espera en milisegundos
 * @returns {((...args: any[]) => void) & { cancel: () => void }}
 */
export function crearBuscadorDebounce(fn, esperaMs = 250) {
    let temporizador = null;

    const debounced = function (...args) {
        if (temporizador) clearTimeout(temporizador);
        temporizador = setTimeout(() => {
            temporizador = null;
            fn.apply(this, args);
        }, esperaMs);
    };

    debounced.cancel = () => {
        if (temporizador) {
            clearTimeout(temporizador);
            temporizador = null;
        }
    };

    return debounced;
}
