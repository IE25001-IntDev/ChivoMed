/** Instancia compartida del estado de conexión (red y servidor). Fuera del navegador (pruebas) siempre está en línea. */
import { ControladorConexion } from "./controlador_conexion.js";
import { verificarServidor } from "../../control/auth_service.js";

export const conexion = new ControladorConexion({
    ventana: typeof window === "undefined" ? null : window,
    documento: typeof document === "undefined" ? null : document,
    verificar: verificarServidor,
}).iniciar();
