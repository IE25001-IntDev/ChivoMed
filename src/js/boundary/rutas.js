import { AuthService } from "../control/auth_service.js";
import { Validaciones } from "../control/validaciones.js";

/**
 * Tabla de rutas de la SPA. Cada ruta monta un Web Component cargado bajo demanda.
 * `modulo` también sirve como lista de archivos a precargar en el service worker.
 * `empleado: true` exige una sesión con rol activo de empleado (cualquier rol excepto Paciente).
 */

export const RUTA_POR_DEFECTO = "/citas";
export const RUTA_LOGIN = "/login";
export const RUTA_INICIO_EMPLEADO = "/dashboard";

export class TablaRutas {
    /** `modulo` (ruta relativa al router) y `cargar`, que importa la vista bajo demanda. */
    static vista(archivo) {
        const modulo = `./vistas/${archivo}`;
        return { modulo, cargar: () => import(new URL(modulo, import.meta.url).href) };
    }

    /** Ruta inicial tras autenticarse; null si el rol no tiene vistas de empleado. */
    static inicioPorRol(sesion) {
        return AuthService.esEmpleado(sesion) ? RUTA_INICIO_EMPLEADO : null;
    }
}

export const RUTAS = Object.freeze([
    Object.freeze({ patron: "/citas", tag: "vista-citas", titulo: "Búsqueda de citas", ...TablaRutas.vista("vista_citas.js") }),
    Object.freeze({ patron: RUTA_LOGIN, tag: "vista-login", titulo: "Iniciar sesión", soloInvitados: true, ...TablaRutas.vista("vista_login.js") }),
    Object.freeze({ patron: RUTA_INICIO_EMPLEADO, tag: "vista-dashboard", titulo: "Dashboard", empleado: true, ...TablaRutas.vista("vista_dashboard.js") }),
    Object.freeze({
        patron: "/consulta/:id", tag: "vista-consulta", titulo: "Consulta", empleado: true,
        restricciones: Object.freeze({ id: Validaciones.UUID }), ...TablaRutas.vista("vista_consulta.js"),
    }),
]);

/** Parte del `texto` de un aviso que <vista-aviso> reemplaza por la dirección pedida, en un <code>. */
export const RUTA_PEDIDA = Symbol("ruta pedida");

/** Ruta desconocida: <vista-aviso> con la dirección pedida y un enlace a la búsqueda de citas. */
export const RUTA_NO_ENCONTRADA = Object.freeze({
    patron: null, tag: "vista-aviso", titulo: "Página no encontrada", ...TablaRutas.vista("vista_aviso.js"),
    aviso: Object.freeze({
        titulo: "No encontramos esta página",
        texto: Object.freeze(["La dirección ", RUTA_PEDIDA, " no existe en ChivoMed."]),
        accion: "enlace", destino: RUTA_POR_DEFECTO, etiqueta: "Ir a la búsqueda de citas",
    }),
});

/**
 * Ruta protegida pedida sin red y sin una sesión de empleado en memoria. Reemplaza al login, que tampoco
 * funcionaría sin red; "Volver a intentar" vuelve a pedir la ruta.
 */
export const RUTA_SIN_CONEXION = Object.freeze({
    patron: null, tag: "vista-aviso", titulo: "Sin conexión", ...TablaRutas.vista("vista_aviso.js"),
    aviso: Object.freeze({
        titulo: "Sin conexión",
        texto: "No se puede conectar con el servidor y no hay datos guardados. Al volver la conexión, esta página se actualiza sola.",
        accion: "reintentar",
    }),
});
