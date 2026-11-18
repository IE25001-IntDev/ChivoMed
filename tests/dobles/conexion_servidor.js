/**
 * Conexión real (ControladorConexion) con una ventana y un documento falsos, para probar las
 * acciones con el servidor caído: `caer()` y `responder()` emiten los mismos eventos que
 * DefaultService y auth_service ("servidor-caido" y "servidor-respondio"). La verificación
 * periódica nunca responde. Llamar a detenerConexiones() en afterEach para cancelar su temporizador.
 */
import { ControladorConexion } from '../../src/js/boundary/pwa/controlador_conexion.js';

const creadas = new Set();

export function conexionConServidor() {
    const ventana = new EventTarget();
    ventana.navigator = { onLine: true };
    const documento = new EventTarget();
    const conexion = new ControladorConexion({ ventana, documento, verificar: async () => false }).iniciar();
    creadas.add(conexion);
    return {
        conexion,
        caer: () => documento.dispatchEvent(new Event('servidor-caido')),
        responder: () => documento.dispatchEvent(new Event('servidor-respondio')),
    };
}

export function detenerConexiones() {
    for (const conexion of creadas) conexion.detener();
    creadas.clear();
}
