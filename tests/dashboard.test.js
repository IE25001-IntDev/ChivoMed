import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import AtencionService from '../src/js/control/atencion_service.js';
import DefaultError from '../src/js/entities/default_error.js';
import {
    ControladorDashboard, MENSAJES, CODIGO_CERRAR_ANTES, normalizarAsignaciones, agruparPorClinica,
    mensajeDeError, mensajeMemoria,
} from '../src/js/boundary/vistas/controlador_dashboard.js';
import { MemoriaVistas } from '../src/js/boundary/vistas/memoria_vistas.js';
import { MENSAJE_SIN_RED } from '../src/js/boundary/pwa/controlador_conexion.js';

// Datos inventados; nunca datos reales de pacientes ni de personal.
const UUID = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Doble de fetch que registra cada petición y responde con `respuesta`. */
function fetchDoble(respuesta) {
    const peticiones = [];
    const fetchImpl = async (url, opciones) => {
        peticiones.push({ url, opciones });
        return typeof respuesta === 'function' ? respuesta(url, opciones) : respuesta.clone();
    };
    return { peticiones, fetchImpl };
}

describe('AtencionService', () => {
    const base = { baseUrl: 'http://api.prueba/galenosv/api', autenticar: async () => ({ csrfToken: 'csrf-prueba' }) };

    test('asignaciones() pide GET /atencion/asignaciones y devuelve los DTO planos', async () => {
        const dto = { idPersonaRol: UUID(1), codigoRol: 'DOCTOR', nombreRol: 'Doctor', idClinica: UUID(2), nombreClinica: 'Clínica Prueba Norte', activa: true };
        const { peticiones, fetchImpl } = fetchDoble(Response.json([dto]));
        const respuesta = await new AtencionService({ ...base, fetchImpl }).asignaciones();
        assert.equal(peticiones[0].url, 'http://api.prueba/galenosv/api/atencion/asignaciones');
        assert.equal(peticiones[0].opciones.method, 'GET');
        assert.equal(peticiones[0].opciones.headers.has('X-CSRF-Token'), false, 'un GET no envía CSRF');
        assert.deepEqual(respuesta.data, [dto]);
        assert.equal(Object.getPrototypeOf(respuesta.data[0]), Object.prototype, 'no se convierte a la entidad Atencion');
    });

    test('cambiarRol() hace PUT /atencion/rol-activo con { idPersonaRol } y el token CSRF', async () => {
        const { peticiones, fetchImpl } = fetchDoble(Response.json({ idPersonaRol: UUID(3), idConsulta: null }));
        await new AtencionService({ ...base, fetchImpl }).cambiarRol(UUID(3));
        assert.equal(peticiones[0].url, 'http://api.prueba/galenosv/api/atencion/rol-activo');
        assert.equal(peticiones[0].opciones.method, 'PUT');
        assert.equal(peticiones[0].opciones.headers.get('X-CSRF-Token'), 'csrf-prueba');
        assert.deepEqual(JSON.parse(peticiones[0].opciones.body), { idPersonaRol: UUID(3) });
    });

    test('el 409 de una consulta en curso llega como DefaultError con su code y mensaje', async () => {
        const cuerpo = { code: 'rolCambio.cerrarAntesCambiar', message: 'Cierre la consulta antes de cambiar de médico o rol.' };
        const { fetchImpl } = fetchDoble(Response.json(cuerpo, { status: 409 }));
        await assert.rejects(new AtencionService({ ...base, fetchImpl }).cambiarRol(UUID(3)), error =>
            error instanceof DefaultError && error.status === 409 && error.code === cuerpo.code && error.message === cuerpo.message);
    });
});

// ---------------------------------------------------------------------------------------------
// ControladorDashboard
// ---------------------------------------------------------------------------------------------

const NORTE = { idClinica: UUID(10), nombreClinica: 'Clínica Prueba Norte' };
const SUR = { idClinica: UUID(20), nombreClinica: 'Clínica Prueba Sur' };
const DOC_NORTE = { idPersonaRol: UUID(11), codigoRol: 'DOCTOR', nombreRol: 'Doctor', ...NORTE, activa: true };
const ADM_NORTE = { idPersonaRol: UUID(12), codigoRol: 'ADMINISTRACION', nombreRol: 'Administración', ...NORTE, activa: false };
const DOC_SUR = { idPersonaRol: UUID(21), codigoRol: 'DOCTOR', nombreRol: 'Doctor', ...SUR, activa: false };
const ASIGNACIONES = [DOC_SUR, ADM_NORTE, DOC_NORTE];

const sesionCon = (asignacion, usuario = 1) => ({
    usuario: { idUsuario: UUID(usuario), idPersona: UUID(90), nombres: 'Persona', apellidos: 'De Prueba' },
    rolActivo: { idPersonaRol: asignacion.idPersonaRol, codigo: asignacion.codigoRol, idClinica: asignacion.idClinica, nombreClinica: asignacion.nombreClinica },
    csrfToken: 'csrf-prueba',
});
const errorHttp = (status, code = null, message = '') => new DefaultError({ status, code, message });

/** Conexión falsa: `enLinea` modificable y `emitir()` para simular los eventos online/offline. */
function conexionDoble(enLinea = true) {
    const suscriptores = new Set();
    return {
        enLinea,
        suscribir: fn => { suscriptores.add(fn); return () => suscriptores.delete(fn); },
        emitir(valor) { this.enLinea = valor; for (const fn of [...suscriptores]) fn(valor); },
        get suscritos() { return suscriptores.size; },
    };
}

/** Prepara el controlador con dobles de servicio, /auth/me, conexión, memoria real y reloj fijo. */
function preparar({ asignaciones = async () => ASIGNACIONES, cambiarRol = async id => ({ idPersonaRol: id, idConsulta: null }),
    obtenerSesion, enLinea = true, memoria = new MemoriaVistas(), reloj = () => new Date(2026, 10, 13, 9, 30) } = {}) {
    const llamadas = { asignaciones: 0, cambiarRol: [], obtenerSesion: 0 };
    const estados = [];
    const sesionesNuevas = [];
    let ultimoCambio = null;
    const conexion = conexionDoble(enLinea);
    const controlador = new ControladorDashboard({
        servicio: {
            asignaciones: async () => { llamadas.asignaciones++; return { data: await asignaciones() }; },
            cambiarRol: async id => { llamadas.cambiarRol.push(id); ultimoCambio = id; return { data: await cambiarRol(id) }; },
        },
        obtenerSesion: async () => {
            llamadas.obtenerSesion++;
            if (obtenerSesion) return obtenerSesion();
            return sesionCon(ASIGNACIONES.find(a => a.idPersonaRol === ultimoCambio));
        },
        conexion, memoria, reloj,
        alCambiar: estado => estados.push(estado),
        alCambiarSesion: sesion => sesionesNuevas.push(sesion),
    });
    return { controlador, llamadas, estados, sesionesNuevas, conexion, memoria };
}

describe('normalizarAsignaciones', () => {
    test('conserva las asignaciones válidas y recorta los textos', () => {
        const [a] = normalizarAsignaciones([{ ...DOC_NORTE, nombreRol: '  Doctor ', nombreClinica: ' Clínica Prueba Norte ' }]);
        assert.deepEqual(a, DOC_NORTE);
        assert.ok(Object.isFrozen(a));
    });

    test('descarta roles que no son de empleado, entradas incompletas y repetidas', () => {
        const datos = [
            { ...DOC_NORTE },
            { ...DOC_NORTE },
            { ...DOC_SUR, idPersonaRol: UUID(30), codigoRol: 'PACIENTE', nombreRol: 'Paciente' },
            { ...ADM_NORTE, idPersonaRol: 'no-es-uuid' },
            { ...ADM_NORTE, idPersonaRol: UUID(31), idClinica: null },
            { ...ADM_NORTE, idPersonaRol: UUID(32), nombreClinica: '  ' },
            null,
        ];
        assert.deepEqual(normalizarAsignaciones(datos).map(a => a.idPersonaRol), [DOC_NORTE.idPersonaRol]);
    });

    test('sin nombreRol usa el nombre conocido del código; una respuesta que no es lista da []', () => {
        assert.equal(normalizarAsignaciones([{ ...ADM_NORTE, nombreRol: null }])[0].nombreRol, 'Administración');
        assert.deepEqual(normalizarAsignaciones({ data: [] }), []);
    });
});

describe('agruparPorClinica', () => {
    test('agrupa por clínica, pone primero la activa y ordena los roles por nombre', () => {
        const grupos = agruparPorClinica(normalizarAsignaciones(ASIGNACIONES), DOC_SUR.idPersonaRol);
        assert.deepEqual(grupos.map(g => g.nombreClinica), ['Clínica Prueba Sur', 'Clínica Prueba Norte']);
        assert.deepEqual(grupos[1].roles.map(r => r.nombreRol), ['Administración', 'Doctor']);
    });

    test('marca solo la asignación de la sesión aunque el DTO diga otra cosa', () => {
        const roles = agruparPorClinica(normalizarAsignaciones(ASIGNACIONES), ADM_NORTE.idPersonaRol).flatMap(g => g.roles);
        assert.deepEqual(roles.filter(r => r.activa).map(r => r.idPersonaRol), [ADM_NORTE.idPersonaRol]);
    });

    test('sin sesión usa el campo activa del DTO; sin activa las clínicas van por nombre', () => {
        const conDto = agruparPorClinica(normalizarAsignaciones(ASIGNACIONES));
        assert.equal(conDto[0].nombreClinica, 'Clínica Prueba Norte');
        assert.equal(conDto[0].activa, true);
        const sinActiva = agruparPorClinica(normalizarAsignaciones([DOC_SUR, { ...DOC_NORTE, activa: false }]));
        assert.deepEqual(sinActiva.map(g => g.nombreClinica), ['Clínica Prueba Norte', 'Clínica Prueba Sur']);
    });
});

describe('mensajeDeError', () => {
    test('consulta en curso: usa el motivo del backend con 409 o con 400', () => {
        for (const status of [409, 400]) {
            assert.equal(mensajeDeError(errorHttp(status, CODIGO_CERRAR_ANTES, 'Cierre la consulta antes de cambiar de médico o rol.')),
                'Cierre la consulta antes de cambiar de médico o rol.');
        }
        assert.equal(mensajeDeError(errorHttp(409, CODIGO_CERRAR_ANTES)), MENSAJES.cerrarAntes);
    });

    test('traduce red, sesión, permiso, no disponible y genéricos sin exponer detalles', () => {
        assert.equal(mensajeDeError(errorHttp(0, 'conexion.error')), MENSAJES.conexion);
        assert.equal(mensajeDeError(errorHttp(401)), MENSAJES.sesionFinalizada);
        assert.equal(mensajeDeError(errorHttp(403, 'auth.asignacion', 'detalle')), MENSAJES.sinPermiso);
        assert.equal(mensajeDeError(errorHttp(404)), MENSAJES.noDisponible);
        assert.equal(mensajeDeError(errorHttp(409, null, 'La sesión cambió. Recarga la página antes de guardar.')),
            'La sesión cambió. Recarga la página antes de guardar.');
        assert.equal(mensajeDeError(errorHttp(500, 'error.interno', 'SQL interno')), MENSAJES.generico);
        assert.equal(mensajeDeError(errorHttp(500), { cambio: true }), MENSAJES.cambioFallido);
        assert.equal(mensajeDeError(new Error('módulo')), MENSAJES.generico);
    });
});

describe('ControladorDashboard: carga', () => {
    test('avisa que carga, agrupa, marca la activa de la sesión y guarda en memoria', async () => {
        const { controlador, estados, memoria } = preparar();
        await controlador.iniciar(sesionCon(DOC_NORTE));
        assert.ok(estados.some(e => e.cargando));
        const { estado } = controlador;
        assert.equal(estado.cargando, false);
        assert.equal(estado.error, null);
        assert.equal(estado.activa.idPersonaRol, DOC_NORTE.idPersonaRol);
        assert.equal(estado.grupos[0].nombreClinica, 'Clínica Prueba Norte');
        assert.equal(estado.desdeMemoria, false);
        assert.deepEqual(estado.actualizadoEn, new Date(2026, 10, 13, 9, 30));
        assert.equal(memoria.leer(MemoriaVistas.clave(sesionCon(DOC_NORTE), 'dashboard.asignaciones')).asignaciones.length, 3);
    });

    test('un 404 informa que el selector todavía no está disponible', async () => {
        const { controlador } = preparar({ asignaciones: async () => { throw errorHttp(404); } });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        assert.equal(controlador.estado.error, MENSAJES.noDisponible);
        assert.deepEqual(controlador.estado.grupos, []);
    });

    test('sin asignaciones queda vacío y sin error', async () => {
        const { controlador } = preparar({ asignaciones: async () => [] });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        assert.equal(controlador.estado.vacio, true);
        assert.equal(controlador.estado.error, null);
    });

    test('una respuesta vieja que llega tarde no pisa la nueva', async () => {
        let soltarPrimera;
        let llamada = 0;
        const { controlador } = preparar({
            asignaciones: () => (++llamada === 1
                ? new Promise(resolve => { soltarPrimera = () => resolve([DOC_SUR]); })
                : Promise.resolve(ASIGNACIONES)),
        });
        const primera = controlador.iniciar(sesionCon(DOC_NORTE));
        await controlador.cargar();
        soltarPrimera();
        await primera;
        assert.equal(controlador.estado.grupos.flatMap(g => g.roles).length, 3);
    });

    test('detener() cancela la suscripción a la red y descarta respuestas pendientes', async () => {
        let soltar;
        const { controlador, conexion } = preparar({ asignaciones: () => new Promise(resolve => { soltar = () => resolve(ASIGNACIONES); }) });
        const carga = controlador.iniciar(sesionCon(DOC_NORTE));
        assert.equal(conexion.suscritos, 1);
        controlador.detener();
        soltar();
        await carga;
        assert.equal(conexion.suscritos, 0);
        assert.deepEqual(controlador.estado.grupos, []);
    });
});

describe('ControladorDashboard: cambio de rol', () => {
    test('hace PUT, refresca /auth/me, cambia la activa y avisa la sesión nueva', async () => {
        const { controlador, llamadas, sesionesNuevas } = preparar();
        await controlador.iniciar(sesionCon(DOC_NORTE));
        assert.equal(await controlador.cambiar(DOC_SUR.idPersonaRol), true);
        assert.deepEqual(llamadas.cambiarRol, [DOC_SUR.idPersonaRol]);
        assert.equal(llamadas.obtenerSesion, 1);
        assert.equal(controlador.estado.activa.idPersonaRol, DOC_SUR.idPersonaRol);
        assert.equal(controlador.estado.grupos[0].nombreClinica, 'Clínica Prueba Sur');
        assert.equal(controlador.estado.sesion.rolActivo.idPersonaRol, DOC_SUR.idPersonaRol);
        assert.equal(controlador.estado.cambiando, null);
        assert.deepEqual(sesionesNuevas.map(s => s.rolActivo.idPersonaRol), [DOC_SUR.idPersonaRol]);
    });

    test('marca el cambio en curso e ignora un segundo clic mientras tanto', async () => {
        let soltar;
        const { controlador, llamadas, estados } = preparar({ cambiarRol: () => new Promise(resolve => { soltar = resolve; }) });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        const primero = controlador.cambiar(DOC_SUR.idPersonaRol);
        assert.equal(controlador.estado.cambiando, DOC_SUR.idPersonaRol);
        assert.equal(await controlador.cambiar(ADM_NORTE.idPersonaRol), false);
        soltar({});
        await primero;
        assert.deepEqual(llamadas.cambiarRol, [DOC_SUR.idPersonaRol]);
        assert.ok(estados.some(e => e.cambiando === DOC_SUR.idPersonaRol));
    });

    test('no llama al backend para la asignación activa ni para una que no está en la lista', async () => {
        const { controlador, llamadas } = preparar();
        await controlador.iniciar(sesionCon(DOC_NORTE));
        assert.equal(await controlador.cambiar(DOC_NORTE.idPersonaRol), false);
        assert.equal(await controlador.cambiar(UUID(999)), false);
        assert.deepEqual(llamadas.cambiarRol, []);
    });

    for (const status of [409, 400]) {
        test(`consulta en curso (${status} ${CODIGO_CERRAR_ANTES}): muestra el motivo y no cambia la activa`, async () => {
            const motivo = 'Cierre la consulta antes de cambiar de médico o rol.';
            const { controlador, llamadas, sesionesNuevas } = preparar({ cambiarRol: async () => { throw errorHttp(status, CODIGO_CERRAR_ANTES, motivo); } });
            await controlador.iniciar(sesionCon(DOC_NORTE));
            assert.equal(await controlador.cambiar(DOC_SUR.idPersonaRol), false);
            assert.equal(controlador.estado.aviso, motivo);
            assert.equal(controlador.estado.error, null);
            assert.equal(controlador.estado.activa.idPersonaRol, DOC_NORTE.idPersonaRol);
            assert.equal(llamadas.obtenerSesion, 0, 'sin cambio no se pide /auth/me');
            assert.deepEqual(sesionesNuevas, []);
        });
    }

    test('un 403 se informa como error y la activa no cambia', async () => {
        const { controlador } = preparar({ cambiarRol: async () => { throw errorHttp(403, 'auth.asignacion'); } });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        await controlador.cambiar(DOC_SUR.idPersonaRol);
        assert.equal(controlador.estado.error, MENSAJES.sinPermiso);
        assert.equal(controlador.estado.activa.idPersonaRol, DOC_NORTE.idPersonaRol);
    });

    test('si el PUT funciona pero /auth/me falla, pide recargar y no avisa una sesión nueva', async () => {
        const { controlador, sesionesNuevas } = preparar({ obtenerSesion: async () => { throw errorHttp(0, 'conexion.error'); } });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        assert.equal(await controlador.cambiar(DOC_SUR.idPersonaRol), false);
        assert.equal(controlador.estado.error, MENSAJES.sesionNoActualizada);
        assert.equal(controlador.estado.activa.idPersonaRol, DOC_NORTE.idPersonaRol);
        assert.deepEqual(sesionesNuevas, []);
    });
});

describe('ControladorDashboard: sin conexión', () => {
    async function memoriaConDatos() {
        const memoria = new MemoriaVistas();
        const { controlador } = preparar({ memoria });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        controlador.detener();
        return memoria;
    }

    test('sin red y con memoria muestra los roles guardados con su hora, sin pedirlos', async () => {
        const memoria = await memoriaConDatos();
        const { controlador, llamadas } = preparar({ memoria, enLinea: false, reloj: () => new Date(2026, 10, 13, 11, 0) });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        assert.equal(llamadas.asignaciones, 0);
        assert.equal(controlador.estado.desdeMemoria, true);
        assert.deepEqual(controlador.estado.actualizadoEn, new Date(2026, 10, 13, 9, 30));
        assert.equal(controlador.estado.activa.idPersonaRol, DOC_NORTE.idPersonaRol);
        assert.match(mensajeMemoria(controlador.estado.actualizadoEn), /^Sin conexión\. Mostrando tus roles guardados a las .+\.$/);
    });

    test('si la petición falla por red y hay memoria, se queda con lo guardado', async () => {
        const memoria = await memoriaConDatos();
        const { controlador } = preparar({ memoria, asignaciones: async () => { throw errorHttp(0, 'conexion.error'); } });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        assert.equal(controlador.estado.desdeMemoria, true);
        assert.equal(controlador.estado.error, null);
        assert.equal(controlador.estado.grupos.length, 2);
    });

    test('sin red y sin memoria muestra el error de conexión', async () => {
        const { controlador } = preparar({ enLinea: false });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        assert.equal(controlador.estado.error, MENSAJES.sinRed);
    });

    test('la memoria de otro usuario no se usa', async () => {
        const memoria = await memoriaConDatos();
        const { controlador } = preparar({ memoria, enLinea: false });
        await controlador.iniciar(sesionCon(DOC_NORTE, 2));
        assert.equal(controlador.estado.error, MENSAJES.sinRed);
        assert.deepEqual(controlador.estado.grupos, []);
    });

    test('sin red no se intenta el cambio de rol y se explica por qué', async () => {
        const memoria = await memoriaConDatos();
        const { controlador, llamadas } = preparar({ memoria, enLinea: false });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        assert.equal(await controlador.cambiar(DOC_SUR.idPersonaRol), false);
        assert.equal(controlador.estado.aviso, MENSAJE_SIN_RED);
        assert.deepEqual(llamadas.cambiarRol, []);
    });

    test('en modo solo lectura (router sin red) no se cambia de rol', async () => {
        const memoria = await memoriaConDatos();
        const { controlador, llamadas } = preparar({ memoria });
        await controlador.iniciar(sesionCon(DOC_NORTE), { soloLectura: true });
        assert.equal(await controlador.cambiar(DOC_SUR.idPersonaRol), false);
        assert.equal(controlador.estado.aviso, MENSAJES.soloLectura);
        assert.deepEqual(llamadas.cambiarRol, []);
    });

    test('al volver la red recarga sola', async () => {
        const memoria = await memoriaConDatos();
        const { controlador, llamadas, conexion } = preparar({ memoria, enLinea: false });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        conexion.emitir(true);
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(llamadas.asignaciones, 1);
        assert.equal(controlador.estado.desdeMemoria, false);
        assert.equal(controlador.estado.enLinea, true);
    });

    test('en línea, la memoria se muestra mientras carga sin decir "sin conexión"', async () => {
        const memoria = await memoriaConDatos();
        const { controlador, estados } = preparar({ memoria });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        assert.equal(estados[0].grupos.length, 2, 'primer pintado con lo guardado');
        assert.ok(estados.every(e => !e.desdeMemoria));
    });
});
