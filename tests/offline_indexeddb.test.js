import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { crearAlmacenOffline, NOMBRE_BASE, ALMACEN } from '../src/js/control/almacen_offline.js';
import { MemoriaVistas, VIGENCIA_MS, RANURA_SESION, ranuraDe } from '../src/js/control/memoria_vistas.js';
import { ControladorConsultas } from '../src/js/control/controladores/controlador_consultas.js';
import * as memoriaVistas from '../src/js/control/memoria_vistas.js';
import { ControladorCitas, CLAVE_MEMORIA as CLAVE_CITAS, MENSAJES as MENSAJES_CITAS } from '../src/js/control/controladores/controlador_citas.js';
import { FechasSV } from '../src/js/control/fechas_sv.js';
import { crearIndexedDbDoble } from './dobles/indexeddb_doble.js';
import { ControladorConexion } from '../src/js/control/controlador_conexion.js';
import { listarTiposDocumento, CABECERA_COPIA } from '../src/js/control/auth_service.js';

// Datos inventados (demo del guion): Carlos Gómez, Doctor en Clínica Santa Ana; Lucía Pérez, Enfermera.
const UUID = n => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const asentar = () => new Promise(resolve => setTimeout(resolve, 5));
const CARLOS = UUID(1);
const LUCIA = UUID(2);
const sesionDe = (idUsuario, idPersonaRol = UUID(10)) => ({
    usuario: { idUsuario, idPersona: UUID(3), nombres: 'Carlos', apellidos: 'Gómez' },
    rolActivo: { idPersonaRol, codigo: 'DOCTOR', nombreRol: 'Doctor', idClinica: UUID(4), nombreClinica: 'Clínica Santa Ana' },
    csrfToken: 'csrf-secreto',
});
const AHORA = new Date('2026-11-13T15:30:00Z'); // 09:30 en El Salvador
const reloj = (ms = 0) => () => new Date(AHORA.getTime() + ms);

/** Lo que hay en disco, leído directamente del doble. */
const disco = fabrica => Object.fromEntries(fabrica.bases.get(NOMBRE_BASE)?.get(ALMACEN) ?? []);

/** `documento` recibe "servidor-respondio" de DefaultService y auth_service (null: no escucha). */
function nuevaMemoria(fabrica, desfase = 0, { documento = null } = {}) {
    return new MemoriaVistas({ persistencia: crearAlmacenOffline(fabrica), reloj: reloj(desfase), documento });
}

const consultaDemo = {
    idConsulta: UUID(20), fechaInicio: '2026-11-13T08:00:00-06:00', fechaFin: null, pendienteParaMi: true,
    paciente: { nombres: 'Ana', apellidos: 'Martínez', fechaNacimiento: '1992-04-10', edad: 34, documentos: [{ tipoDocumento: 'DUI', numero: '01000004-4' }] },
    procedimientos: [{ idConsultaProcedimiento: UUID(21), nombre: 'Consulta general', fechaInicio: null, fechaFin: null,
        pasos: [{ idConsultaProcedimientoPaso: UUID(22), nombre: 'Triaje', orden: 1, nivel: 0, estado: 'COMPLETADO',
            responsable: { nombre: 'Lucía Pérez', rol: 'Enfermera' }, fechaInicio: null, fechaFin: null, tieneValor: true }] }],
};

function conexionDoble(enLinea) {
    return { enLinea, suscribir: () => () => {} };
}

function controladorDashboard(memoria, { enLinea, dashboard = async () => [consultaDemo] } = {}) {
    const llamadas = [];
    const controlador = new ControladorConsultas({
        servicio: {
            dashboard: async filtros => { llamadas.push(filtros); return { data: await dashboard(filtros) }; },
            valorPaso: async () => ({ data: null }),
        },
        conexion: conexionDoble(enLinea), memoria, reloj: reloj(),
    });
    return { controlador, llamadas };
}

describe('almacen_offline', () => {
    test('sin IndexedDB no hay almacén', () => {
        assert.equal(crearAlmacenOffline(undefined), null);
        assert.equal(crearAlmacenOffline({}), null);
    });

    test('guarda, lee, borra un registro y vacía todo; una sola apertura de la base', async () => {
        const fabrica = crearIndexedDbDoble();
        const almacen = crearAlmacenOffline(fabrica);
        assert.equal(await almacen.guardar('a', { fecha: AHORA }), true);
        await almacen.guardar('b', 2);
        const leido = await almacen.leer(['a', 'b', 'c']);
        assert.deepEqual(Object.keys(leido), ['a', 'b']);
        assert.ok(leido.a.fecha instanceof Date, 'las fechas vuelven como Date');
        await almacen.guardar('b', null);
        assert.deepEqual(Object.keys(await almacen.leer(['a', 'b'])), ['a']);
        await almacen.borrar();
        assert.deepEqual(await almacen.leer(['a']), {});
        assert.equal(fabrica.aperturas, 1);
    });

    test('si IndexedDB falla, lee vacío y las escrituras resuelven false sin lanzar', async () => {
        const cerrada = crearAlmacenOffline(crearIndexedDbDoble({ fallarAlAbrir: true }));
        assert.deepEqual(await cerrada.leer(['a']), {});
        assert.equal(await cerrada.guardar('a', 1), false);
        assert.equal(await cerrada.borrar(), false);
        const llena = crearAlmacenOffline(crearIndexedDbDoble({ fallarAlEscribir: true }));
        assert.equal(await llena.guardar('a', 1), false);
    });
});

describe('MemoriaVistas con copia en disco', () => {
    test('ranuraDe: solo el último dashboard, las asignaciones y la consulta van a disco', () => {
        assert.equal(ranuraDe(`dashboard.ultimo:${UUID(10)}`), 'dashboard');
        assert.equal(ranuraDe('dashboard.asignaciones'), 'asignaciones');
        assert.equal(ranuraDe(`consulta:${UUID(20)}`), 'consulta');
        for (const nombre of [`dashboard.consultas:${UUID(10)}:2026-11-13:2026-11-13`, `dashboard.valor:${UUID(22)}`,
            `consulta.borrador:${UUID(22)}`, 'citas.busqueda']) assert.equal(ranuraDe(nombre), null, nombre);
    });

    test('la sesión va a disco sin csrfToken y con la hora de verificación', async () => {
        const fabrica = crearIndexedDbDoble();
        nuevaMemoria(fabrica).recordarSesion(sesionDe(CARLOS));
        await asentar();
        const { sesion, verificadaEn } = disco(fabrica)[RANURA_SESION];
        assert.equal(sesion.csrfToken, undefined);
        assert.equal(sesion.usuario.idUsuario, CARLOS);
        assert.equal(verificadaEn.getTime(), AHORA.getTime());
    });

    test('los borradores y los registros de "Ver registro" nunca van a disco', async () => {
        const fabrica = crearIndexedDbDoble();
        const m = nuevaMemoria(fabrica);
        const sesion = sesionDe(CARLOS);
        m.recordarSesion(sesion);
        m.guardar(MemoriaVistas.clave(sesion, `consulta.borrador:${UUID(22)}`), 'texto a medio escribir');
        m.guardar(MemoriaVistas.clave(sesion, `dashboard.valor:${UUID(22)}`), { valor: 'PA 120/80' });
        m.guardar(MemoriaVistas.clave(sesion, `dashboard.consultas:${UUID(10)}:2026-11-13:2026-11-13`), { consultas: [] });
        await asentar();
        assert.deepEqual(Object.keys(disco(fabrica)), [RANURA_SESION]);
    });

    test('la consulta va a disco sin el valor guardado del paso; cada ranura reemplaza a la anterior', async () => {
        const fabrica = crearIndexedDbDoble();
        const m = nuevaMemoria(fabrica);
        const sesion = sesionDe(CARLOS);
        m.recordarSesion(sesion);
        m.guardar(MemoriaVistas.clave(sesion, `consulta:${UUID(20)}`), { consulta: consultaDemo, detalle: { valorGuardado: 'PA 120/80' }, en: AHORA });
        m.guardar(MemoriaVistas.clave(sesion, `consulta:${UUID(30)}`), { consulta: { ...consultaDemo, idConsulta: UUID(30) }, detalle: { valorGuardado: 'x' }, en: AHORA });
        await asentar();
        const registro = disco(fabrica).consulta;
        assert.equal(registro.clave, `${CARLOS}:consulta:${UUID(30)}`);
        assert.equal(registro.valor.detalle.valorGuardado, null);
        assert.equal(m.leer(MemoriaVistas.clave(sesion, `consulta:${UUID(20)}`)).detalle.valorGuardado, 'PA 120/80', 'en memoria se conserva');
    });

    test('recargar: otra instancia hidrata la sesión de respaldo y los datos, congelados', async () => {
        const fabrica = crearIndexedDbDoble();
        const antes = nuevaMemoria(fabrica);
        const sesion = sesionDe(CARLOS);
        antes.recordarSesion(sesion);
        const clave = MemoriaVistas.clave(sesion, `dashboard.ultimo:${UUID(10)}`);
        antes.guardar(clave, Object.freeze({ desde: '2026-11-13', hasta: '2026-11-13', consultas: [consultaDemo], en: AHORA }));
        await asentar();

        const despues = nuevaMemoria(fabrica, 60 * 60 * 1000);
        assert.equal(await despues.hidratar(), true);
        assert.equal(despues.sesion.usuario.idUsuario, CARLOS);
        assert.equal(despues.sesion.csrfToken, undefined);
        const guardado = despues.leer(clave);
        assert.equal(guardado.consultas[0].paciente.nombres, 'Ana');
        assert.ok(guardado.en instanceof Date);
        assert.ok(Object.isFrozen(guardado) && Object.isFrozen(guardado.consultas[0].paciente));
    });

    test('la copia caduca a las 8 horas de la última verificación y se borra del disco', async () => {
        const fabrica = crearIndexedDbDoble();
        nuevaMemoria(fabrica).recordarSesion(sesionDe(CARLOS));
        await asentar();
        assert.equal(await nuevaMemoria(fabrica, VIGENCIA_MS).hidratar(), true, 'justo a las 8 horas todavía vale');
        const tarde = nuevaMemoria(fabrica, VIGENCIA_MS + 1);
        assert.equal(await tarde.hidratar(), false);
        assert.equal(tarde.sesion, null);
        assert.deepEqual(disco(fabrica), {});
    });

    test('una copia sin fecha válida o sin usuario se descarta', async () => {
        const fabrica = crearIndexedDbDoble();
        const almacen = crearAlmacenOffline(fabrica);
        await almacen.guardar(RANURA_SESION, { sesion: sesionDe(CARLOS), verificadaEn: 'ayer' });
        assert.equal(await nuevaMemoria(fabrica).hidratar(), false);
        await almacen.guardar(RANURA_SESION, { sesion: { usuario: {} }, verificadaEn: AHORA });
        assert.equal(await nuevaMemoria(fabrica).hidratar(), false);
    });

    test('datos en disco de otro usuario no se cargan con la sesión guardada', async () => {
        const fabrica = crearIndexedDbDoble();
        const almacen = crearAlmacenOffline(fabrica);
        await almacen.guardar(RANURA_SESION, { sesion: sesionDe(CARLOS), verificadaEn: AHORA });
        await almacen.guardar('consulta', { clave: `${LUCIA}:consulta:${UUID(20)}`, valor: { consulta: consultaDemo } });
        const m = nuevaMemoria(fabrica);
        assert.equal(await m.hidratar(), true);
        assert.equal(m.leer(`${LUCIA}:consulta:${UUID(20)}`), null);
    });

    test('al entrar otra cuenta se borra la copia anterior; cerrar sesión la borra', async () => {
        const fabrica = crearIndexedDbDoble();
        const m = nuevaMemoria(fabrica);
        const carlos = sesionDe(CARLOS);
        m.recordarSesion(carlos);
        m.guardar(MemoriaVistas.clave(carlos, `consulta:${UUID(20)}`), { consulta: consultaDemo, detalle: null, en: AHORA });
        await asentar();
        m.recordarSesion(sesionDe(LUCIA));
        await asentar();
        assert.deepEqual(Object.keys(disco(fabrica)), [RANURA_SESION]);
        assert.equal(disco(fabrica)[RANURA_SESION].sesion.usuario.idUsuario, LUCIA);
        m.limpiar();
        await asentar();
        assert.deepEqual(disco(fabrica), {});
    });

    test('una sesión verificada mientras se leía el disco no se pisa con la copia', async () => {
        const fabrica = crearIndexedDbDoble();
        nuevaMemoria(fabrica).recordarSesion(sesionDe(CARLOS));
        await asentar();
        const m = nuevaMemoria(fabrica);
        const hidratando = m.hidratar();
        const lucia = sesionDe(LUCIA);
        m.recordarSesion(lucia);
        assert.equal(await hidratando, false);
        assert.equal(m.sesion, lucia);
    });

    test('sin persistencia, hidratar() no devuelve promesa y el arranque no espera', () => {
        assert.equal(new MemoriaVistas().hidratar(), null);
    });
});

describe('Dashboard sin red después de recargar', () => {
    test('muestra la última búsqueda guardada con su rango aunque no sea de hoy', async () => {
        const fabrica = crearIndexedDbDoble();
        const antes = nuevaMemoria(fabrica);
        const sesion = sesionDe(CARLOS);
        antes.recordarSesion(sesion);
        const enLinea = controladorDashboard(antes, { enLinea: true });
        await enLinea.controlador.iniciar(sesion);
        enLinea.controlador.cambiarFechas('2026-11-01', '2026-11-20');
        await enLinea.controlador.buscar();
        await asentar();

        // Recarga sin red: memoria nueva hidratada desde el disco y el router en solo lectura.
        const despues = nuevaMemoria(fabrica, 30 * 60 * 1000);
        assert.equal(await despues.hidratar(), true);
        const sinRed = controladorDashboard(despues, { enLinea: false });
        await sinRed.controlador.iniciar(despues.sesion, { soloLectura: true });
        const { estado } = sinRed.controlador;
        assert.deepEqual(sinRed.llamadas, []);
        assert.equal(estado.desdeMemoria, true);
        assert.deepEqual([estado.desde, estado.hasta], ['2026-11-01', '2026-11-20']);
        assert.equal(estado.consultas.length, 1);
        assert.equal(estado.consultas[0].paciente.nombre, 'Ana Martínez');
        assert.equal(estado.error, null);
    });

    test('sin nada guardado sigue avisando que falta la red', async () => {
        const m = new MemoriaVistas();
        const sesion = sesionDe(CARLOS);
        m.recordarSesion(sesion);
        const { controlador } = controladorDashboard(m, { enLinea: false });
        await controlador.iniciar(sesion, { soloLectura: true });
        assert.equal(controlador.estado.consultas.length, 0);
        assert.ok(controlador.estado.error);
    });
});

// Punto 5: la búsqueda pública de citas (HU1) va a disco con su número, 8 horas.
describe('búsqueda de citas sin conexión (IndexedDB)', () => {
    const DUI = Object.freeze({ idTipoDocumento: UUID(40), nombre: 'DUI', indicaciones: null, expresionRegular: '^[0-9]{8}-[0-9]$' });
    const NORTE = Object.freeze({ idClinica: UUID(41), nombre: 'Clínica Prueba Norte' });
    const CITA = Object.freeze({ idConsulta: UUID(42), fechaInicio: '2026-11-12T08:00:00-06:00', nombreClinica: NORTE.nombre, procedimientos: Object.freeze(['Consulta general']) });
    const NUMERO = '01000004-4';

    function citas(memoria, { enLinea = true, desfase = 0 } = {}) {
        const llamadas = { clinicas: 0, citas: 0 };
        const controlador = new ControladorCitas({
            servicio: {
                clinicas: async () => { llamadas.clinicas++; return [NORTE]; },
                citas: async () => { llamadas.citas++; return [CITA]; },
                ticket: async () => { throw new Error('no se usa'); },
            },
            listarTiposDocumento: async () => [DUI],
            conexion: conexionDoble(enLinea), memoria, reloj: reloj(desfase),
            temporizador: { programar: () => null, cancelar: () => {} },
        });
        return { controlador, llamadas, estado: controlador.estado };
    }

    async function buscarConExito(memoria) {
        const c = citas(memoria);
        await c.controlador.iniciar();
        c.controlador.elegirTipo(DUI.idTipoDocumento);
        await c.controlador.escribirNumero(NUMERO);
        await c.controlador.buscar();
        assert.deepEqual(c.estado.citas, [CITA]);
        return c;
    }

    test('la búsqueda con éxito va a disco sin sesión: tipo, número, clínica, rango y resultados', async () => {
        assert.equal(typeof memoriaVistas.RANURA_PUBLICO, 'string', 'memoria_vistas define la ranura pública');
        const fabrica = crearIndexedDbDoble();
        await buscarConExito(nuevaMemoria(fabrica));
        await asentar();
        const registro = disco(fabrica)[memoriaVistas.RANURA_PUBLICO];
        assert.equal(registro.clave, CLAVE_CITAS);
        assert.equal(registro.valor.criterios.numeroDocumento, NUMERO);
        assert.equal(registro.valor.criterios.idTipoDocumento, DUI.idTipoDocumento);
        assert.equal(registro.valor.criterios.idClinica, NORTE.idClinica);
        assert.ok(registro.valor.criterios.desde && registro.valor.criterios.hasta);
        assert.deepEqual(registro.valor.citas, [CITA]);
    });

    test('al recargar sin red, #/citas muestra la búsqueda guardada con el aviso y sin buscar', async () => {
        const fabrica = crearIndexedDbDoble();
        await buscarConExito(nuevaMemoria(fabrica));
        await asentar();
        const recargada = nuevaMemoria(fabrica, 60 * 60 * 1000);
        assert.equal(await recargada.hidratar(), false, 'no hay sesión de empleado que restaurar');
        const sinRed = citas(recargada, { enLinea: false, desfase: 60 * 60 * 1000 });
        await sinRed.controlador.iniciar();
        assert.deepEqual(sinRed.estado.citas, [CITA]);
        assert.equal(sinRed.estado.numeroDocumento, NUMERO);
        assert.equal(sinRed.estado.desdeMemoria, true);
        assert.equal(MENSAJES_CITAS.memoria(FechasSV.hora(sinRed.estado.actualizadoEn)), 'Sin conexión con el servidor. Mostrando lo guardado a las 09:30.');
        assert.equal(sinRed.estado.habilitado.buscar, false, 'sin red no se puede buscar');
        await sinRed.controlador.buscar();
        assert.equal(sinRed.llamadas.citas, 0);
    });

    test('"Nueva búsqueda" borra lo guardado en disco', async () => {
        const fabrica = crearIndexedDbDoble();
        const c = await buscarConExito(nuevaMemoria(fabrica));
        await asentar();
        assert.ok(disco(fabrica)[memoriaVistas.RANURA_PUBLICO], 'antes estaba en disco');
        c.controlador.nuevaBusqueda();
        await asentar();
        assert.equal(disco(fabrica)[memoriaVistas.RANURA_PUBLICO], undefined);
    });

    test('a las 8 horas caduca: al recargar se borra y no se muestra', async () => {
        const fabrica = crearIndexedDbDoble();
        await buscarConExito(nuevaMemoria(fabrica));
        await asentar();
        assert.ok(disco(fabrica)[memoriaVistas.RANURA_PUBLICO], 'antes estaba en disco');
        const tarde = nuevaMemoria(fabrica, VIGENCIA_MS + 1);
        await tarde.hidratar();
        await asentar();
        assert.equal(tarde.leer(CLAVE_CITAS), null);
        assert.equal(disco(fabrica)[memoriaVistas.RANURA_PUBLICO], undefined);
    });

    test('con la página abierta, una búsqueda de hace más de 8 horas se borra al volver a #/citas', async () => {
        const fabrica = crearIndexedDbDoble();
        const memoria = nuevaMemoria(fabrica);
        await buscarConExito(memoria);
        await asentar();
        assert.ok(disco(fabrica)[memoriaVistas.RANURA_PUBLICO], 'antes estaba en disco');
        const despues = citas(memoria, { enLinea: false, desfase: VIGENCIA_MS + 1 });
        await despues.controlador.iniciar();
        await asentar();
        assert.equal(despues.estado.citas, null);
        assert.equal(memoria.leer(CLAVE_CITAS), null);
        assert.equal(disco(fabrica)[memoriaVistas.RANURA_PUBLICO], undefined);
    });

    test('al recargar sin sesión válida se borran solo los datos del empleado, no la búsqueda', async () => {
        const fabrica = crearIndexedDbDoble();
        await buscarConExito(nuevaMemoria(fabrica));
        await asentar();
        const almacen = crearAlmacenOffline(fabrica);
        await almacen.guardar('dashboard', { clave: `${CARLOS}:dashboard.ultimo:x`, valor: {} });
        const recargada = nuevaMemoria(fabrica);
        await recargada.hidratar();
        await asentar();
        assert.ok(recargada.leer(CLAVE_CITAS), 'la búsqueda se restaura');
        assert.equal(disco(fabrica).dashboard, undefined, 'lo del empleado sin sesión se borra');
        assert.ok(disco(fabrica)[memoriaVistas.RANURA_PUBLICO]);
    });

    // Punto 4: cargar con red ya no basta para borrarla (el backend puede estar caído). Se borra
    // solo cuando el backend responde al cargar; la copia del service worker no cuenta.
    test('al cargar con red no se borra ni se muestra todavía; se borra cuando el backend responde', async () => {
        const fabrica = crearIndexedDbDoble();
        await buscarConExito(nuevaMemoria(fabrica));
        await asentar();
        const documento = new EventTarget();
        const recargada = nuevaMemoria(fabrica, 60 * 60 * 1000, { documento });
        await recargada.hidratar();
        await asentar();
        assert.ok(recargada.leer(CLAVE_CITAS), 'sigue en memoria');
        assert.ok(disco(fabrica)[memoriaVistas.RANURA_PUBLICO], 'sigue en disco');
        const conRed = citas(recargada, { enLinea: true, desfase: 60 * 60 * 1000 });
        await conRed.controlador.iniciar();
        assert.equal(conRed.estado.citas, null, 'con conexión no se muestra como si fuera nueva');
        assert.equal(conRed.estado.numeroDocumento, '');
        documento.dispatchEvent(new Event('servidor-respondio'));
        await asentar();
        assert.equal(recargada.leer(CLAVE_CITAS), null);
        assert.equal(disco(fabrica)[memoriaVistas.RANURA_PUBLICO], undefined);
    });

    describe('copia del service worker frente a respuesta real del backend', () => {
        const fetchOriginal = globalThis.fetch;
        let conexion = null;
        afterEach(() => {
            globalThis.fetch = fetchOriginal;
            delete globalThis.document;
            conexion?.detener();
        });
        const TIPOS = [{ idTipoDocumento: UUID(40), nombre: 'DUI' }];

        async function cargarConRed() {
            const fabrica = crearIndexedDbDoble();
            await buscarConExito(nuevaMemoria(fabrica));
            await asentar();
            const documento = new EventTarget();
            globalThis.document = documento;
            const ventana = new EventTarget();
            ventana.navigator = { onLine: true };
            conexion = new ControladorConexion({ ventana, documento, verificar: async () => false }).iniciar();
            const recargada = nuevaMemoria(fabrica, 60 * 60 * 1000, { documento });
            await recargada.hidratar();
            return { fabrica, recargada };
        }

        test('una respuesta servida desde la copia no marca en línea ni borra la búsqueda guardada', async () => {
            const { fabrica, recargada } = await cargarConRed();
            globalThis.fetch = async () => Response.json(TIPOS, { headers: { [CABECERA_COPIA]: '1' } });
            assert.equal((await listarTiposDocumento()).length, 1);
            await asentar();
            assert.equal(conexion.enLinea, false);
            assert.equal(conexion.motivo, 'servidor');
            assert.ok(recargada.leer(CLAVE_CITAS));
            assert.ok(disco(fabrica)[memoriaVistas.RANURA_PUBLICO]);
            // #/citas, con la conexión marcada sin servidor, muestra lo guardado con el aviso.
            const c = new ControladorCitas({
                servicio: { clinicas: async () => [], citas: async () => [], ticket: async () => null },
                listarTiposDocumento: async () => [DUI], conexion, memoria: recargada, reloj: reloj(60 * 60 * 1000),
                temporizador: { programar: () => null, cancelar: () => {} },
            });
            await c.iniciar();
            assert.deepEqual(c.estado.citas, [CITA]);
            assert.equal(c.estado.desdeMemoria, true);
            c.detener();
        });

        test('una respuesta real del backend sí marca en línea y borra la búsqueda guardada', async () => {
            const { fabrica, recargada } = await cargarConRed();
            globalThis.fetch = async () => Response.json(TIPOS, { headers: { [CABECERA_COPIA]: '1' } });
            await listarTiposDocumento();
            globalThis.fetch = async () => Response.json(TIPOS);
            await listarTiposDocumento();
            await asentar();
            assert.equal(conexion.enLinea, true);
            assert.equal(recargada.leer(CLAVE_CITAS), null);
            assert.equal(disco(fabrica)[memoriaVistas.RANURA_PUBLICO], undefined);
        });
    });

    test('con la app abierta, si el servidor cae, #/citas muestra la búsqueda guardada al cargar', async () => {
        const fabrica = crearIndexedDbDoble();
        await buscarConExito(nuevaMemoria(fabrica));
        await asentar();
        const recargada = nuevaMemoria(fabrica, 60 * 60 * 1000, { documento: new EventTarget() });
        await recargada.hidratar();
        let avisar = () => {};
        const conexion = { enLinea: true, suscribir: fn => { avisar = fn; return () => {}; } };
        const c = new ControladorCitas({
            servicio: { clinicas: async () => [], citas: async () => [], ticket: async () => null },
            listarTiposDocumento: async () => [DUI], conexion, memoria: recargada, reloj: reloj(60 * 60 * 1000),
            temporizador: { programar: () => null, cancelar: () => {} },
        });
        await c.iniciar();
        assert.equal(c.estado.citas, null);
        conexion.enLinea = false;
        avisar(false);
        assert.deepEqual(c.estado.citas, [CITA]);
        assert.equal(c.estado.desdeMemoria, true);
        assert.equal(c.estado.numeroDocumento, NUMERO);
    });

    test('si se mostró sin servidor y después el backend vuelve, lo que se ve se queda en disco', async () => {
        const fabrica = crearIndexedDbDoble();
        await buscarConExito(nuevaMemoria(fabrica));
        await asentar();
        const documento = new EventTarget();
        const recargada = nuevaMemoria(fabrica, 60 * 60 * 1000, { documento });
        await recargada.hidratar();
        const sinRed = citas(recargada, { enLinea: false, desfase: 60 * 60 * 1000 });
        await sinRed.controlador.iniciar();
        assert.deepEqual(sinRed.estado.citas, [CITA]);
        documento.dispatchEvent(new Event('servidor-respondio'));
        await asentar();
        assert.ok(recargada.leer(CLAVE_CITAS), 'sigue en memoria');
        assert.ok(disco(fabrica)[memoriaVistas.RANURA_PUBLICO], 'sigue en disco');
    });

    test('al cargar la app sin red se restaura (y sigue en disco)', async () => {
        const fabrica = crearIndexedDbDoble();
        await buscarConExito(nuevaMemoria(fabrica));
        await asentar();
        const recargada = nuevaMemoria(fabrica, 60 * 60 * 1000);
        await recargada.hidratar();
        await asentar();
        assert.ok(recargada.leer(CLAVE_CITAS));
        assert.ok(disco(fabrica)[memoriaVistas.RANURA_PUBLICO]);
    });

    test('una búsqueda caducada se borra al cargar', async () => {
        const fabrica = crearIndexedDbDoble();
        await buscarConExito(nuevaMemoria(fabrica));
        await asentar();
        const tarde = nuevaMemoria(fabrica, VIGENCIA_MS + 1);
        await tarde.hidratar();
        await asentar();
        assert.equal(tarde.leer(CLAVE_CITAS), null);
        assert.equal(disco(fabrica)[memoriaVistas.RANURA_PUBLICO], undefined);
    });

    test('si se pierde la red con la página abierta, la búsqueda en pantalla se queda', async () => {
        const fabrica = crearIndexedDbDoble();
        let avisar = () => {};
        const memoria = nuevaMemoria(fabrica, 0);
        await memoria.hidratar();
        const c = await buscarConExito(memoria);
        const conexion = { enLinea: true, suscribir: fn => { avisar = fn; return () => {}; } };
        const otra = new ControladorCitas({
            servicio: { clinicas: async () => [], citas: async () => [], ticket: async () => null },
            listarTiposDocumento: async () => [DUI], conexion, memoria, reloj: reloj(),
            temporizador: { programar: () => null, cancelar: () => {} },
        });
        await otra.iniciar();
        conexion.enLinea = false;
        avisar(false);
        assert.deepEqual(otra.estado.citas, [CITA]);
        assert.deepEqual(c.estado.citas, [CITA]);
        assert.ok(disco(fabrica)[memoriaVistas.RANURA_PUBLICO]);
    });

    test('un empleado que inicia sesión borra la búsqueda pública del disco', async () => {
        const fabrica = crearIndexedDbDoble();
        const memoria = nuevaMemoria(fabrica);
        await buscarConExito(memoria);
        await asentar();
        assert.ok(disco(fabrica)[memoriaVistas.RANURA_PUBLICO], 'antes estaba en disco');
        memoria.recordarSesion(sesionDe(CARLOS));
        await asentar();
        assert.equal(disco(fabrica)[memoriaVistas.RANURA_PUBLICO], undefined);
    });
});

// Punto 6: las consultas de hoy que me tocan van a disco con las mismas reglas.
describe('consultas pendientes de hoy en IndexedDB', () => {
    test('van a disco, se hidratan al recargar y cerrar sesión las borra', async () => {
        assert.equal(ranuraDe('consultas.pendientes:x'), 'pendientes');
        const fabrica = crearIndexedDbDoble();
        const memoria = nuevaMemoria(fabrica);
        const sesion = sesionDe(CARLOS);
        memoria.recordarSesion(sesion);
        const { controlador } = controladorDashboard(memoria, { enLinea: true });
        await controlador.iniciar(sesion);
        await asentar();
        const clave = MemoriaVistas.clave(sesion, `consultas.pendientes:${UUID(10)}`);
        assert.equal(disco(fabrica).pendientes?.clave, clave);
        const recargada = nuevaMemoria(fabrica);
        assert.equal(await recargada.hidratar(), true);
        assert.deepEqual(recargada.leer(clave).consultas.map(c => c.idConsulta), [UUID(20)]);
        recargada.limpiar();
        await asentar();
        assert.equal(disco(fabrica).pendientes, undefined);
    });

    test('caducan a las 8 horas con la sesión', async () => {
        const fabrica = crearIndexedDbDoble();
        const memoria = nuevaMemoria(fabrica);
        const sesion = sesionDe(CARLOS);
        memoria.recordarSesion(sesion);
        await controladorDashboard(memoria, { enLinea: true }).controlador.iniciar(sesion);
        await asentar();
        assert.ok(disco(fabrica).pendientes, 'antes estaban en disco');
        const tarde = nuevaMemoria(fabrica, VIGENCIA_MS + 1);
        assert.equal(await tarde.hidratar(), false);
        await asentar();
        assert.equal(disco(fabrica).pendientes, undefined);
    });
});
