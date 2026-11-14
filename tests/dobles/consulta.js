/**
 * Dobles compartidos por las pruebas de la HU4 (controlador, paneles y vista).
 * Datos inventados; nunca datos reales de pacientes ni de personal.
 */
import { ControladorConsulta } from '../../src/js/boundary/vistas/controlador_consulta.js';
import { MemoriaVistas } from '../../src/js/boundary/vistas/memoria_vistas.js';
import DefaultError from '../../src/js/entities/default_error.js';

export const UUID = n => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const ID_CONSULTA = UUID(1);
export const asentar = () => new Promise(resolve => setTimeout(resolve, 0));
export const errorHttp = (status, code = null, message = '') => new DefaultError({ status, code, message });

export const paso = (n, extra = {}) => ({
    idConsultaProcedimientoPaso: UUID(100 + n), nombre: `Paso ${n}`, orden: n, nivel: 0, estado: 'COMPLETADO',
    responsable: { nombre: 'Persona Responsable', rol: 'Doctor' },
    fechaInicio: '2026-11-13T08:00:00-06:00', fechaFin: '2026-11-13T08:10:00-06:00', tieneValor: true, ...extra,
});
export const pendiente = (n, extra = {}) => paso(n, { nivel: 1, estado: 'PENDIENTE', fechaFin: null, tieneValor: false, ...extra });
export const procedimiento = (n, pasos) => ({ idConsultaProcedimiento: UUID(50 + n), nombre: `Procedimiento ${n}`, fechaInicio: null, fechaFin: null, pasos });
export const consultaB6 = (extra = {}) => ({
    idConsulta: ID_CONSULTA, fechaInicio: '2026-11-13T08:00:00-06:00', fechaFin: null, pendienteParaMi: true,
    paciente: { nombres: 'Paciente', apellidos: 'De Prueba', fechaNacimiento: '1999-12-31', edad: 26, documentos: [{ tipoDocumento: 'DUI', numero: '00000000-0' }] },
    procedimientos: [procedimiento(1, [paso(1), pendiente(2)])],
    ...extra,
});
/** Identificador del rol Doctor en las pruebas que comparan `rolPaso.idRol` con el rol activo. */
export const ID_ROL_DOCTOR = UUID(700);
export const sesionCon = (codigo = 'DOCTOR', usuario = 1, idRol = undefined) => ({
    usuario: { idUsuario: UUID(800 + usuario) },
    rolActivo: { idPersonaRol: UUID(900), codigo, ...(idRol ? { idRol } : {}) },
    csrfToken: 'csrf-prueba',
});
export const examen = n => ({ idExamen: UUID(300 + n), nombre: `Examen ${n}` });

export function conexionDoble(enLinea = true) {
    const suscriptores = new Set();
    return {
        enLinea,
        suscribir: fn => { suscriptores.add(fn); return () => suscriptores.delete(fn); },
        emitir(valor) { this.enLinea = valor; for (const fn of [...suscriptores]) fn(valor); },
    };
}

/**
 * Servicio doble: cada operación registra su llamada (en orden) y resuelve { data } con la
 * respuesta configurada, que puede ser una función o un error para rechazar.
 */
export function servicioDoble(respuestas = {}) {
    const llamadas = [];
    const base = {
        retomar: () => ({ idConsulta: ID_CONSULTA }),
        contexto: () => ({ idPersonaRol: UUID(900), idConsulta: null }),
        consulta: () => consultaB6(),
        paso: id => ({ idConsultaProcedimientoPaso: id, estado: 'PENDIENTE', valor: null, idProcedimientoPaso: UUID(400) }),
        definicion: id => ({ idProcedimientoPaso: id, indicaFin: false }),
        ordenes: () => [],
        asignables: () => [examen(1), examen(2)],
        completar: id => ({ idConsultaProcedimientoPaso: id, estado: 'COMPLETADO' }),
        retroceder: () => ({ idConsultaProcedimientoPaso: UUID(101), estado: 'PENDIENTE', valor: 'Registro anterior' }),
        ordenar: (id, datos) => ({ idOrdenExamen: UUID(600), idConsultaProcedimientoPaso: id, ...datos }),
        cerrar: id => ({ idConsulta: id, fechaFin: '2026-11-13T10:00:00-06:00' }),
        ...respuestas,
    };
    const servicio = {};
    for (const [nombre, respuesta] of Object.entries(base)) {
        servicio[nombre] = async (...args) => {
            llamadas.push([nombre, ...args]);
            const valor = typeof respuesta === 'function' ? await respuesta(...args) : respuesta;
            if (valor instanceof Error) throw valor;
            return { data: valor };
        };
    }
    return { servicio, llamadas, nombres: () => llamadas.map(([n]) => n) };
}

export function preparar({ respuestas, enLinea = true, memoria = new MemoriaVistas(), sesion = sesionCon(), soloLectura = false } = {}) {
    const doble = servicioDoble(respuestas);
    const conexion = conexionDoble(enLinea);
    const controlador = new ControladorConsulta({ servicio: doble.servicio, conexion, memoria, reloj: () => new Date('2026-11-13T15:30:00Z') });
    const lotes = [];
    controlador.suscribir(cambios => lotes.push([...cambios].sort()));
    const iniciar = () => controlador.iniciar(ID_CONSULTA, sesion, { soloLectura });
    return { controlador, conexion, memoria, lotes, iniciar, ...doble };
}

