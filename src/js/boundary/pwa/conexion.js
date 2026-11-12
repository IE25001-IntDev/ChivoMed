/** Instancia compartida del estado de red. Fuera del navegador (pruebas) siempre está en línea. */
import { ControladorConexion } from "./controlador_conexion.js";

export const conexion = new ControladorConexion({ ventana: typeof window === "undefined" ? null : window }).iniciar();
