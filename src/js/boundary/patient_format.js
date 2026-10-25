export function fecha(valor) {
    if (!valor || Number.isNaN(new Date(valor).getTime())) return 'Sin fecha registrada';
    return new Intl.DateTimeFormat('es-SV', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(valor));
}

export function estadoConsulta(consulta) {
    return consulta.fechaFin ? 'Finalizada' : 'En curso';
}

export function fechaResultado(registro) {
    const fechas = registro.resultados.map(r => r.fechaCreacion).filter(v => v && !Number.isNaN(Date.parse(v)));
    return fechas.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}

export function resultadoReciente(registro, ahora = Date.now()) {
    return registro.resultados.some(resultado => {
        const tiempo = Date.parse(resultado.fechaCreacion);
        return tiempo <= ahora && tiempo >= ahora - 30 * 86400000;
    });
}

/** Physical disk paths and executable URL schemes are never exposed as links. */
export function enlaceAdjunto(ruta, baseUrl, origen) {
    if (!ruta?.trim() || /^[a-z]:[\\/]/i.test(ruta) || ruta.startsWith('\\\\')) return null;
    try {
        const api = new URL(baseUrl.replace(/\/?$/, '/'), origen);
        const url = new URL(ruta, new URL('../', api));
        return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
}
