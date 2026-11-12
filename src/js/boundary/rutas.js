/**
 * Tabla de rutas de la SPA. Cada ruta monta un Web Component cargado bajo demanda.
 * `modulo` también sirve como lista de archivos a precargar en el service worker.
 */

export const RUTA_POR_DEFECTO = "/citas";
export const RUTA_LOGIN = "/login";
export const RUTA_INICIO_EMPLEADO = "/dashboard";
export const ROLES_EMPLEADO = Object.freeze(["DOCTOR", "ADMINISTRACION"]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function vista(archivo) {
    const modulo = `./vistas/${archivo}`;
    return { modulo, cargar: () => import(new URL(modulo, import.meta.url).href) };
}

export const RUTAS = Object.freeze([
    Object.freeze({ patron: "/citas", tag: "vista-citas", titulo: "Búsqueda de citas", ...vista("vista_citas.js") }),
    Object.freeze({ patron: RUTA_LOGIN, tag: "vista-login", titulo: "Iniciar sesión", soloInvitados: true, ...vista("vista_login.js") }),
    Object.freeze({ patron: RUTA_INICIO_EMPLEADO, tag: "vista-dashboard", titulo: "Dashboard", roles: ROLES_EMPLEADO, ...vista("vista_dashboard.js") }),
    Object.freeze({
        patron: "/consulta/:id", tag: "vista-consulta", titulo: "Consulta", roles: ROLES_EMPLEADO,
        restricciones: Object.freeze({ id: UUID }), ...vista("vista_consulta.js"),
    }),
]);

export const RUTA_NO_ENCONTRADA = Object.freeze({
    patron: null, tag: "vista-no-encontrada", titulo: "Página no encontrada", ...vista("vista_no_encontrada.js"),
});

/** Ruta inicial tras autenticarse; null si el rol no tiene vistas de empleado. */
export function inicioPorRol(sesion) {
    const codigo = sesion?.rolActivo?.codigo;
    return ROLES_EMPLEADO.includes(codigo) ? RUTA_INICIO_EMPLEADO : null;
}
