import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import AtencionService from '../src/js/control/atencion_service.js';
import DefaultError from '../src/js/entities/default_error.js';
import { ControladorDashboard, MENSAJES, CODIGO_CERRAR_ANTES } from '../src/js/control/controladores/controlador_dashboard.js';
import { MemoriaVistas } from '../src/js/control/memoria_vistas.js';
import { MENSAJE_SIN_RED } from '../src/js/control/controlador_conexion.js';
import { conexionConServidor, detenerConexiones } from './dobles/conexion_servidor.js';

// Sin red o sin servidor, en solo lectura o no, cambiar de rol muestra un solo motivo.
const MOTIVO_AVISO = 'Sin conexión: necesitas conexión con el servidor para cambiar de rol.';

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
    const base = { baseUrl: 'http://api.prueba/galeno/api', autenticar: async () => ({ csrfToken: 'csrf-prueba' }) };

    test('asignaciones() pide GET /atencion/asignaciones y devuelve los DTO planos', async () => {
        const dto = { idPersonaRol: UUID(1), codigoRol: 'DOCTOR', nombreRol: 'Doctor', idClinica: UUID(2), nombreClinica: 'Clínica Prueba Norte', activa: true };
        const { peticiones, fetchImpl } = fetchDoble(Response.json([dto]));
        const respuesta = await new AtencionService({ ...base, fetchImpl }).asignaciones();
        assert.equal(peticiones[0].url, 'http://api.prueba/galeno/api/atencion/asignaciones');
        assert.equal(peticiones[0].opciones.method, 'GET');
        assert.equal(peticiones[0].opciones.headers.has('X-CSRF-Token'), false, 'un GET no envía CSRF');
        assert.deepEqual(respuesta.data, [dto]);
        assert.equal(Object.getPrototypeOf(respuesta.data[0]), Object.prototype, 'no se convierte a la entidad Atencion');
    });

    test('cambiarRol() hace PUT /atencion/rol-activo con { idPersonaRol } y el token CSRF', async () => {
        const { peticiones, fetchImpl } = fetchDoble(Response.json({ idPersonaRol: UUID(3), idConsulta: null }));
        await new AtencionService({ ...base, fetchImpl }).cambiarRol(UUID(3));
        assert.equal(peticiones[0].url, 'http://api.prueba/galeno/api/atencion/rol-activo');
        assert.equal(peticiones[0].opciones.method, 'PUT');
        assert.equal(peticiones[0].opciones.headers.get('X-CSRF-Token'), 'csrf-prueba');
        assert.deepEqual(JSON.parse(peticiones[0].opciones.body), { idPersonaRol: UUID(3) });
    });

    test('dashboard() pide GET /atencion/dashboard con desde y hasta', async () => {
        const { peticiones, fetchImpl } = fetchDoble(Response.json([]));
        const respuesta = await new AtencionService({ ...base, fetchImpl }).dashboard({ desde: '2026-11-01', hasta: '2026-11-13' });
        assert.equal(peticiones[0].url, 'http://api.prueba/galeno/api/atencion/dashboard?desde=2026-11-01&hasta=2026-11-13');
        assert.equal(peticiones[0].opciones.method, 'GET');
        assert.deepEqual(respuesta.data, []);
    });

    test('dashboard() sin fechas no envía parámetros (el backend usa hoy)', async () => {
        const { peticiones, fetchImpl } = fetchDoble(Response.json([]));
        await new AtencionService({ ...base, fetchImpl }).dashboard();
        assert.equal(peticiones[0].url, 'http://api.prueba/galeno/api/atencion/dashboard');
    });

    test('valorPaso() pide el valor del paso con el id codificado y devuelve el DTO plano', async () => {
        const dto = { idConsultaProcedimientoPaso: UUID(7), nombre: 'Paso', estado: 'COMPLETADO', fechaFin: null, valor: 'texto' };
        const { peticiones, fetchImpl } = fetchDoble(Response.json(dto));
        const servicio = new AtencionService({ ...base, fetchImpl });
        const respuesta = await servicio.valorPaso(UUID(7));
        assert.equal(peticiones[0].url, `http://api.prueba/galeno/api/atencion/dashboard/pasos/${UUID(7)}/valor`);
        assert.deepEqual(respuesta.data, dto);
        await servicio.valorPaso('a/b');
        assert.match(peticiones[1].url, /pasos\/a%2Fb\/valor$/);
        assert.throws(() => servicio.valorPaso(''), TypeError);
    });

    test('el 400 de rango del dashboard llega con su code', async () => {
        const { fetchImpl } = fetchDoble(Response.json({ code: 'dashboard.rangoExcedido', message: 'x' }, { status: 400 }));
        await assert.rejects(new AtencionService({ ...base, fetchImpl }).dashboard({ desde: '2026-01-01', hasta: '2026-12-31' }),
            error => error.status === 400 && error.code === 'dashboard.rangoExcedido');
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
    contexto = async () => ({ idPersonaRol: DOC_NORTE.idPersonaRol, idConsulta: null }), salirDeConsulta = async () => null,
    obtenerSesion, enLinea = true, conexion = conexionDoble(enLinea), memoria = new MemoriaVistas(), reloj = () => new Date(2026, 10, 13, 9, 30) } = {}) {
    const llamadas = { asignaciones: 0, cambiarRol: [], obtenerSesion: 0, contexto: 0, salirDeConsulta: 0 };
    const estados = [];
    const sesionesNuevas = [];
    let ultimoCambio = null;
    const controlador = new ControladorDashboard({
        servicio: {
            asignaciones: async () => { llamadas.asignaciones++; return { data: await asignaciones() }; },
            cambiarRol: async id => { llamadas.cambiarRol.push(id); ultimoCambio = id; return { data: await cambiarRol(id) }; },
            contexto: async () => { llamadas.contexto++; return { data: await contexto() }; },
            salirDeConsulta: async () => { llamadas.salirDeConsulta++; return { status: 204, data: await salirDeConsulta() }; },
        },
        obtenerSesion: async () => {
            llamadas.obtenerSesion++;
            if (obtenerSesion) return obtenerSesion();
            return sesionCon(ASIGNACIONES.find(a => a.idPersonaRol === ultimoCambio));
        },
        conexion, memoria, reloj,
    });
    // Igual que la vista: se suscribe al estado; el controlador no conoce a sus suscriptores.
    controlador.suscribir((cambios, estado) => {
        estados.push({ ...estado });
        if (cambios.has('sesionCambiada')) sesionesNuevas.push(estado.sesionCambiada);
    });
    return { controlador, llamadas, estados, sesionesNuevas, conexion, memoria };
}

describe('normalizarAsignaciones', () => {
    test('conserva las asignaciones válidas y recorta los textos', () => {
        const [a] = ControladorDashboard.normalizarAsignaciones([{ ...DOC_NORTE, nombreRol: '  Doctor ', nombreClinica: ' Clínica Prueba Norte ' }]);
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
        assert.deepEqual(ControladorDashboard.normalizarAsignaciones(datos).map(a => a.idPersonaRol), [DOC_NORTE.idPersonaRol]);
    });

    test('B8: acepta Enfermera y un rol sin código; descarta un código que no es texto', () => {
        const datos = [
            { ...DOC_SUR, idPersonaRol: UUID(40), codigoRol: 'ENFERMERA', nombreRol: 'Enfermera' },
            { ...DOC_SUR, idPersonaRol: UUID(41), codigoRol: null, nombreRol: 'Recepción' },
            { ...DOC_SUR, idPersonaRol: UUID(42), codigoRol: 7, nombreRol: 'Raro' },
        ];
        const roles = ControladorDashboard.normalizarAsignaciones(datos);
        assert.deepEqual(roles.map(a => [a.codigoRol, a.nombreRol]), [['ENFERMERA', 'Enfermera'], [null, 'Recepción']]);
    });

    test('sin nombreRol muestra un texto neutro, nunca el código; una respuesta que no es lista da []', () => {
        assert.equal(ControladorDashboard.normalizarAsignaciones([{ ...ADM_NORTE, nombreRol: null }])[0].nombreRol, 'Rol sin nombre');
        assert.deepEqual(ControladorDashboard.normalizarAsignaciones({ data: [] }), []);
    });
});

describe('agruparPorClinica', () => {
    test('agrupa por clínica, pone primero la activa y ordena los roles por nombre', () => {
        const grupos = ControladorDashboard.agruparPorClinica(ControladorDashboard.normalizarAsignaciones(ASIGNACIONES), DOC_SUR.idPersonaRol);
        assert.deepEqual(grupos.map(g => g.nombreClinica), ['Clínica Prueba Sur', 'Clínica Prueba Norte']);
        assert.deepEqual(grupos[1].roles.map(r => r.nombreRol), ['Administración', 'Doctor']);
    });

    test('marca solo la asignación de la sesión aunque el DTO diga otra cosa', () => {
        const roles = ControladorDashboard.agruparPorClinica(ControladorDashboard.normalizarAsignaciones(ASIGNACIONES), ADM_NORTE.idPersonaRol).flatMap(g => g.roles);
        assert.deepEqual(roles.filter(r => r.activa).map(r => r.idPersonaRol), [ADM_NORTE.idPersonaRol]);
    });

    test('sin sesión usa el campo activa del DTO; sin activa las clínicas van por nombre', () => {
        const conDto = ControladorDashboard.agruparPorClinica(ControladorDashboard.normalizarAsignaciones(ASIGNACIONES));
        assert.equal(conDto[0].nombreClinica, 'Clínica Prueba Norte');
        assert.equal(conDto[0].activa, true);
        const sinActiva = ControladorDashboard.agruparPorClinica(ControladorDashboard.normalizarAsignaciones([DOC_SUR, { ...DOC_NORTE, activa: false }]));
        assert.deepEqual(sinActiva.map(g => g.nombreClinica), ['Clínica Prueba Norte', 'Clínica Prueba Sur']);
    });
});

describe('mensajeDeError', () => {
    test('consulta en curso (F8): siempre el texto propio, nunca el message del backend', () => {
        assert.equal(MENSAJES.cerrarAntes, 'Tienes una consulta en curso. Sal de ella o ciérrala antes de cambiar de rol.');
        for (const status of [409, 400]) {
            assert.equal(ControladorDashboard.mensajeDeError(errorHttp(status, CODIGO_CERRAR_ANTES, 'Cierre la consulta antes de cambiar de médico o rol.')),
                MENSAJES.cerrarAntes);
        }
        assert.equal(ControladorDashboard.mensajeDeError(errorHttp(409, CODIGO_CERRAR_ANTES)), MENSAJES.cerrarAntes);
    });

    test('traduce red, sesión, permiso, no disponible y genéricos sin exponer detalles', () => {
        assert.equal(ControladorDashboard.mensajeDeError(errorHttp(0, 'conexion.error')), MENSAJES.conexion);
        assert.equal(ControladorDashboard.mensajeDeError(errorHttp(401)), MENSAJES.sesionFinalizada);
        assert.equal(ControladorDashboard.mensajeDeError(errorHttp(403, 'auth.asignacion', 'detalle')), MENSAJES.sinPermiso);
        assert.equal(ControladorDashboard.mensajeDeError(errorHttp(404)), MENSAJES.noDisponible);
        assert.equal(ControladorDashboard.mensajeDeError(errorHttp(409, null, 'La sesión cambió. Recarga la página antes de guardar.')),
            'La sesión cambió. Recarga la página antes de guardar.');
        assert.equal(ControladorDashboard.mensajeDeError(errorHttp(500, 'error.interno', 'SQL interno')), MENSAJES.generico);
        assert.equal(ControladorDashboard.mensajeDeError(errorHttp(500), { cambio: true }), MENSAJES.cambioFallido);
        assert.equal(ControladorDashboard.mensajeDeError(new Error('módulo')), MENSAJES.generico);
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
            assert.equal(controlador.estado.aviso, MENSAJES.cerrarAntes);
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

    test('iniciar() no publica sesionCambiada; solo un cambio confirmado lo hace', async () => {
        const { controlador, sesionesNuevas } = preparar();
        await controlador.iniciar(sesionCon(DOC_NORTE));
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(controlador.estado.sesionCambiada, null);
        assert.deepEqual(sesionesNuevas, []);
        await controlador.cambiar(DOC_SUR.idPersonaRol);
        await new Promise(resolve => setTimeout(resolve, 0));
        assert.equal(controlador.estado.sesionCambiada, controlador.estado.sesion);
        assert.equal(sesionesNuevas.length, 1);
    });

    test('el controlador no acepta callbacks de la vista: todo pasa por el estado', () => {
        const { controlador } = preparar();
        assert.equal(typeof controlador.suscribir, 'function');
        assert.throws(() => { controlador.estado.inventada = 1; }, TypeError);
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
        assert.match(ControladorDashboard.mensajeMemoria(controlador.estado.actualizadoEn), /^Sin conexión con el servidor\. Mostrando lo guardado a las \d{2}:\d{2}\.$/);
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
        assert.equal(MENSAJES.sinRed, 'No se puede conectar con el servidor y no hay datos guardados.');
        assert.equal(ControladorDashboard.mensajeMemoria(null), 'Sin conexión con el servidor. Mostrando lo guardado.');
        assert.deepEqual(controlador.estado.grupos, []);
    });

    test('sin red no se intenta el cambio de rol y se explica por qué', async () => {
        const memoria = await memoriaConDatos();
        const { controlador, llamadas } = preparar({ memoria, enLinea: false });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        assert.equal(await controlador.cambiar(DOC_SUR.idPersonaRol), false);
        assert.equal(controlador.estado.aviso, MOTIVO_AVISO);
        assert.deepEqual(llamadas.cambiarRol, []);
    });

    test('en modo solo lectura (router sin red) no se cambia de rol', async () => {
        const memoria = await memoriaConDatos();
        const { controlador, llamadas } = preparar({ memoria });
        await controlador.iniciar(sesionCon(DOC_NORTE), { soloLectura: true });
        assert.equal(await controlador.cambiar(DOC_SUR.idPersonaRol), false);
        assert.equal(controlador.estado.aviso, MOTIVO_AVISO);
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

describe('ControladorDashboard: consulta en curso (F8)', () => {
    const EN_CURSO = UUID(500);
    const conCurso = async () => ({ idPersonaRol: DOC_NORTE.idPersonaRol, idConsulta: EN_CURSO });
    const cerrarAntes = async () => { throw errorHttp(409, CODIGO_CERRAR_ANTES, 'Cierre la consulta antes de cambiar de médico o rol.'); };

    test('carga GET /atencion en paralelo con las asignaciones y publica enCurso', async () => {
        let soltarContexto;
        const { controlador, llamadas } = preparar({
            contexto: () => new Promise(resolve => { soltarContexto = () => resolve({ idPersonaRol: DOC_NORTE.idPersonaRol, idConsulta: EN_CURSO }); }),
        });
        const carga = controlador.iniciar(sesionCon(DOC_NORTE));
        // Las dos peticiones salen antes de que responda cualquiera de ellas.
        assert.equal(llamadas.asignaciones, 1);
        assert.equal(llamadas.contexto, 1);
        soltarContexto();
        await carga;
        assert.equal(controlador.estado.enCurso, EN_CURSO);
        assert.equal(controlador.estado.grupos.length, 2);
    });

    test('sin consulta en curso, o con un id que no es UUID, enCurso queda null', async () => {
        for (const idConsulta of [null, 'no-es-uuid', 7]) {
            const { controlador } = preparar({ contexto: async () => ({ idPersonaRol: DOC_NORTE.idPersonaRol, idConsulta }) });
            await controlador.iniciar(sesionCon(DOC_NORTE));
            assert.equal(controlador.estado.enCurso, null);
        }
    });

    for (const [nombre, falla] of [['red', errorHttp(0, 'conexion.error')], ['500', errorHttp(500, 'error.interno', 'detalle')]]) {
        test(`si contexto() falla (${nombre}) las asignaciones se ven igual, enCurso es null y no hay error`, async () => {
            const { controlador } = preparar({ contexto: async () => { throw falla; } });
            await controlador.iniciar(sesionCon(DOC_NORTE));
            assert.equal(controlador.estado.enCurso, null);
            assert.equal(controlador.estado.error, null);
            assert.equal(controlador.estado.aviso, null);
            assert.equal(controlador.estado.grupos.length, 2);
            assert.equal(controlador.estado.activa.idPersonaRol, DOC_NORTE.idPersonaRol);
        });
    }

    test('409 con enCurso vacío: mensaje propio y contexto() se pide una sola vez más', async () => {
        let enCurso = null;
        const { controlador, llamadas } = preparar({
            contexto: async () => ({ idPersonaRol: DOC_NORTE.idPersonaRol, idConsulta: enCurso }),
            cambiarRol: cerrarAntes,
        });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        assert.equal(llamadas.contexto, 1);
        enCurso = EN_CURSO; // la consulta se abrió en otra pestaña
        assert.equal(await controlador.cambiar(DOC_SUR.idPersonaRol), false);
        assert.equal(controlador.estado.aviso, MENSAJES.cerrarAntes);
        assert.notEqual(controlador.estado.aviso, 'Cierre la consulta antes de cambiar de médico o rol.');
        assert.equal(llamadas.contexto, 2);
        assert.equal(controlador.estado.enCurso, EN_CURSO);
    });

    test('409 con enCurso ya conocido: no vuelve a pedir contexto()', async () => {
        const { controlador, llamadas } = preparar({ contexto: conCurso, cambiarRol: cerrarAntes });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        await controlador.cambiar(DOC_SUR.idPersonaRol);
        assert.equal(llamadas.contexto, 1);
        assert.equal(controlador.estado.enCurso, EN_CURSO);
        assert.equal(controlador.estado.aviso, MENSAJES.cerrarAntes);
    });

    test('409 → salirDeConsulta() → cambiar(): rol cambiado, enCurso null y sin mensajes de salida ni del 409', async () => {
        let enConsulta = true;
        const { controlador, llamadas } = preparar({
            contexto: async () => ({ idPersonaRol: DOC_NORTE.idPersonaRol, idConsulta: enConsulta ? EN_CURSO : null }),
            cambiarRol: async id => { if (enConsulta) await cerrarAntes(); return { idPersonaRol: id, idConsulta: null }; },
            salirDeConsulta: async () => { enConsulta = false; return null; },
        });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        assert.equal(await controlador.cambiar(DOC_SUR.idPersonaRol), false);
        assert.equal(controlador.estado.aviso, MENSAJES.cerrarAntes);

        assert.equal(await controlador.salirDeConsulta(), true);
        assert.equal(llamadas.salirDeConsulta, 1);
        assert.equal(controlador.estado.enCurso, null);
        assert.equal(controlador.estado.aviso, null, 'el motivo del 409 ya no aplica');
        assert.equal(controlador.estado.confirmacion, 'Saliste de la consulta. Ya puedes cambiar de rol.');
        assert.equal(controlador.estado.saliendo, false);

        assert.equal(await controlador.cambiar(DOC_SUR.idPersonaRol), true);
        assert.equal(controlador.estado.activa.idPersonaRol, DOC_SUR.idPersonaRol);
        assert.equal(controlador.estado.enCurso, null);
        // Con el rol ya cambiado no queda ningún mensaje de la salida ni del 409.
        assert.equal(controlador.estado.confirmacion, null);
        assert.equal(controlador.estado.aviso, null);
        assert.ok(![controlador.estado.confirmacion, controlador.estado.aviso, controlador.estado.error]
            .some(m => typeof m === 'string' && m.startsWith('Saliste de la consulta')));
        assert.deepEqual(llamadas.cambiarRol, [DOC_SUR.idPersonaRol, DOC_SUR.idPersonaRol], 'sin reintento automático');
    });

    test('marca saliendo mientras espera e ignora un segundo clic', async () => {
        let soltar;
        const { controlador, llamadas } = preparar({ contexto: conCurso, salirDeConsulta: () => new Promise(resolve => { soltar = resolve; }) });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        const primera = controlador.salirDeConsulta();
        assert.equal(controlador.estado.saliendo, true);
        assert.equal(await controlador.salirDeConsulta(), false);
        soltar(null);
        assert.equal(await primera, true);
        assert.equal(llamadas.salirDeConsulta, 1);
    });

    test('salirDeConsulta() con 401: sesión finalizada como en las otras acciones y enCurso se conserva', async () => {
        const { controlador } = preparar({ contexto: conCurso, salirDeConsulta: async () => { throw errorHttp(401, 'auth.sesion', 'Vuelva a iniciar sesión.'); } });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        assert.equal(await controlador.salirDeConsulta(), false);
        assert.equal(controlador.estado.error, MENSAJES.sesionFinalizada);
        assert.equal(controlador.estado.error, ControladorDashboard.mensajeDeError(errorHttp(401)), 'mismo texto que el 401 del cambio de rol');
        assert.equal(controlador.estado.enCurso, EN_CURSO);
        assert.equal(controlador.estado.confirmacion, null);
        assert.equal(controlador.estado.saliendo, false);
    });

    test('salirDeConsulta() con error de red: error de conexión y enCurso se conserva', async () => {
        const { controlador } = preparar({ contexto: conCurso, salirDeConsulta: async () => { throw errorHttp(0, 'conexion.error'); } });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        assert.equal(await controlador.salirDeConsulta(), false);
        assert.equal(controlador.estado.error, MENSAJES.conexion);
        assert.equal(controlador.estado.enCurso, EN_CURSO);
    });

    test('sin red no hace el DELETE y avisa que hace falta conexión', async () => {
        const { controlador, llamadas, conexion } = preparar({ contexto: conCurso });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        conexion.emitir(false);
        assert.equal(await controlador.salirDeConsulta(), false);
        assert.equal(llamadas.salirDeConsulta, 0);
        assert.equal(controlador.estado.aviso, MOTIVO_AVISO);
        assert.equal(controlador.estado.enCurso, EN_CURSO);
    });

    test('en solo lectura no hace el DELETE', async () => {
        const { controlador, llamadas } = preparar({ contexto: conCurso });
        await controlador.iniciar(sesionCon(DOC_NORTE), { soloLectura: true });
        assert.equal(await controlador.salirDeConsulta(), false);
        assert.equal(llamadas.salirDeConsulta, 0);
        assert.equal(controlador.estado.aviso, MOTIVO_AVISO);
    });

    test('enCurso no se escribe en MemoriaVistas ni en IndexedDB', async () => {
        const enDisco = [];
        const memoria = new MemoriaVistas({ persistencia: { leer: async () => null, guardar: (ranura, valor) => enDisco.push([ranura, valor]), borrar: () => {} } });
        memoria.recordarSesion(sesionCon(DOC_NORTE));
        const { controlador } = preparar({ memoria, contexto: conCurso });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        assert.equal(controlador.estado.enCurso, EN_CURSO);
        const guardado = memoria.leer(MemoriaVistas.clave(sesionCon(DOC_NORTE), 'dashboard.asignaciones'));
        assert.deepEqual(Object.keys(guardado).sort(), ['asignaciones', 'en']);
        assert.ok(enDisco.length > 0, 'las asignaciones sí van a disco');
        assert.ok(!JSON.stringify(enDisco).includes(EN_CURSO), 'el id de la consulta en curso no va a disco');
        assert.ok(!JSON.stringify(enDisco).includes('enCurso'));
    });

    test('sin red al iniciar no pide contexto() y enCurso queda null', async () => {
        const { controlador, llamadas } = preparar({ enLinea: false, contexto: conCurso });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        assert.equal(llamadas.contexto, 0);
        assert.equal(controlador.estado.enCurso, null);
    });
});

// Punto 3: con el servidor caído (ControladorConexion real avisado con "servidor-caido") no se
// cambia de rol ni se sale de la consulta en curso; si cae en medio, se muestra el error y no se reintenta.
describe('ControladorDashboard: ninguna escritura sin servidor', () => {
    afterEach(() => detenerConexiones());
    const sinServidor = () => errorHttp(0, 'conexion.error', 'No se pudo conectar con GalenoSV.');
    const conCurso = async () => ({ idPersonaRol: DOC_NORTE.idPersonaRol, idConsulta: UUID(77) });
    const pausa = () => new Promise(resolver => setTimeout(resolver, 0));

    test('cambiar de rol: con el servidor caído no se intenta y se explica por qué', async () => {
        const red = conexionConServidor();
        const { controlador, llamadas } = preparar({ conexion: red.conexion });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        red.caer();
        assert.equal(await controlador.cambiar(DOC_SUR.idPersonaRol), false);
        assert.equal(controlador.estado.aviso, MOTIVO_AVISO);
        assert.deepEqual(llamadas.cambiarRol, []);
    });

    test('cambiar de rol: si el servidor cae en el PUT, muestra el error y no reintenta al volver', async () => {
        const red = conexionConServidor();
        const { controlador, llamadas } = preparar({ conexion: red.conexion,
            cambiarRol: async () => { red.caer(); throw sinServidor(); } });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        assert.equal(await controlador.cambiar(DOC_SUR.idPersonaRol), false);
        assert.equal(controlador.estado.error, ControladorDashboard.mensajeDeError(sinServidor(), { cambio: true }));
        assert.equal(controlador.estado.cambiando, null);
        assert.equal(controlador.estado.activa.idPersonaRol, DOC_NORTE.idPersonaRol);
        red.responder();
        await pausa();
        assert.deepEqual(llamadas.cambiarRol, [DOC_SUR.idPersonaRol]);
    });

    test('salir de la consulta en curso: con el servidor caído no hace el DELETE y dice el motivo', async () => {
        const red = conexionConServidor();
        const { controlador, llamadas } = preparar({ conexion: red.conexion, contexto: conCurso });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        red.caer();
        assert.equal(await controlador.salirDeConsulta(), false);
        assert.equal(controlador.estado.aviso, MOTIVO_AVISO);
        assert.equal(llamadas.salirDeConsulta, 0);
    });

    test('salir de la consulta en curso: si el servidor cae en el DELETE, muestra el error y no reintenta al volver', async () => {
        const red = conexionConServidor();
        const { controlador, llamadas } = preparar({ conexion: red.conexion, contexto: conCurso,
            salirDeConsulta: async () => { red.caer(); throw sinServidor(); } });
        await controlador.iniciar(sesionCon(DOC_NORTE));
        assert.equal(await controlador.salirDeConsulta(), false);
        assert.equal(controlador.estado.error, ControladorDashboard.mensajeDeError(sinServidor()));
        red.responder();
        await pausa();
        assert.equal(llamadas.salirDeConsulta, 1);
    });
});
