import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crearAlmacenOffline, NOMBRE_BASE, ALMACEN } from '../src/js/boundary/pwa/almacen_offline.js';
import { MemoriaVistas, VIGENCIA_MS, RANURA_SESION, ranuraDe } from '../src/js/boundary/vistas/memoria_vistas.js';
import { ControladorConsultas } from '../src/js/boundary/vistas/controlador_consultas.js';
import { crearIndexedDbDoble } from './dobles/indexeddb_doble.js';

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

function nuevaMemoria(fabrica, desfase = 0) {
    return new MemoriaVistas({ persistencia: crearAlmacenOffline(fabrica), reloj: reloj(desfase) });
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

    test('los borradores, los registros de "Ver registro" y la búsqueda pública nunca van a disco', async () => {
        const fabrica = crearIndexedDbDoble();
        const m = nuevaMemoria(fabrica);
        m.guardar('citas.busqueda', { numeroDocumento: '01000004-4' });
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
