import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { API_CONFIG } from '../../src/js/control/api_config.js';
import { obtenerSesion, verificarSesionActual, fijarSesionVista } from '../../src/js/control/auth_service.js';
import { ControladorCitas, MENSAJES as CITAS } from '../../src/js/boundary/vistas/controlador_citas.js';
import { ControladorLogin, destinoTrasLogin } from '../../src/js/boundary/vistas/controlador_login.js';
import { ControladorDashboard } from '../../src/js/boundary/vistas/controlador_dashboard.js';
import { ControladorConsultas } from '../../src/js/boundary/vistas/controlador_consultas.js';
import { ControladorConsulta, servicioConsulta } from '../../src/js/boundary/vistas/controlador_consulta.js';
import { MemoriaVistas } from '../../src/js/boundary/vistas/memoria_vistas.js';
import AtencionService from '../../src/js/control/atencion_service.js';
import ConsultaService from '../../src/js/control/consulta_service.js';
import ConsultaProcedimientoPasoService from '../../src/js/control/consulta_procedimiento_paso_service.js';
import ProcedimientoPasoService from '../../src/js/control/procedimiento_paso_service.js';
import { UUID, ID_CONSULTA, ID_ROL_DOCTOR, consultaB6, procedimiento, pendiente, conexionDoble } from '../dobles/consulta.js';

// Solo se sustituye el API remoto: controladores, servicios, fetch y proxy son los de producción.
// Todos los identificadores y datos son sintéticos. No se abre GalenoSV ni una base de datos.
const TIPO = UUID(10);
const CLINICA = UUID(11);
const PASO = UUID(102);
const DEFINICION = UUID(200);
const NUMERO = '00000000-0';
const reloj = () => new Date('2026-11-13T15:30:00Z');
const sesionInicial = () => ({
    usuario: { idUsuario: UUID(1), idPersona: UUID(1), nombres: 'Persona', apellidos: 'Sintética' },
    rolActivo: { idPersonaRol: UUID(2), idRol: ID_ROL_DOCTOR, codigo: 'DOCTOR', nombreRol: 'Doctor',
        idClinica: CLINICA, nombreClinica: 'Clínica Sintética' },
    csrfToken: 'csrf-sintetico',
});
const json = (data, status = 200, headers = {}) => ({ status, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) });
const vacio = { status: 204 };
const originalFetch = globalThis.fetch;
const originalBase = API_CONFIG.baseUrl;
const originalApi = process.env.API_URL;
let api, proxy, base, rutas, peticiones, inesperadas, sesion, controladores;

async function escuchar(servidor) {
    servidor.listen(0, '127.0.0.1');
    await once(servidor, 'listening');
    return `http://127.0.0.1:${servidor.address().port}`;
}
const cerrar = servidor => new Promise(resolve => {
    if (!servidor?.listening) return resolve();
    servidor.closeAllConnections();
    servidor.close(resolve);
});

before(async () => {
    api = http.createServer(async (req, res) => {
        try {
            const url = new URL(req.url, 'http://api.test');
            let body = '';
            for await (const trozo of req) body += trozo;
            const peticion = { metodo: req.method, ruta: url.pathname.replace('/galeno/api/', ''),
                query: Object.fromEntries(url.searchParams), headers: req.headers, body,
                datos: body ? JSON.parse(body) : null };
            peticiones.push(peticion);
            const clave = `${req.method} ${peticion.ruta}`;
            const responder = rutas.get(clave);
            if (!responder) inesperadas.push(clave);
            const respuesta = responder ? await responder(peticion) : json({ code: 'ruta.noPreparada' }, 500);
            res.writeHead(respuesta.status, respuesta.headers);
            res.end(respuesta.body);
        } catch (error) {
            inesperadas.push(error.message);
            res.writeHead(500);
            res.end();
        }
    });
    process.env.API_URL = `${await escuchar(api)}/galeno/api`;
    ({ server: proxy } = await import('../../scripts/dev_server.js'));
    base = await escuchar(proxy);
    API_CONFIG.baseUrl = '/galeno/api';
    globalThis.fetch = (url, opciones) => originalFetch(new URL(url, base), opciones);
});

after(async () => {
    globalThis.fetch = originalFetch;
    API_CONFIG.baseUrl = originalBase;
    if (originalApi === undefined) delete process.env.API_URL;
    else process.env.API_URL = originalApi;
    await Promise.all([cerrar(proxy), cerrar(api)]);
});

beforeEach(() => {
    peticiones = [];
    inesperadas = [];
    controladores = [];
    sesion = sesionInicial();
    fijarSesionVista(null);
    rutas = new Map([
        ['GET publico/tipos-documento', () => json([{ idTipoDocumento: TIPO, nombre: 'DUI', expresionRegular: '^[0-9]{8}-[0-9]$' }])],
        ['GET auth/me', () => json(sesion)],
        ['POST auth/login', () => vacio],
        ['POST publico/clinicas', () => json([{ idClinica: CLINICA, nombre: 'Clínica Sintética' }])],
        ['POST publico/citas', () => json([{ idConsulta: ID_CONSULTA, fechaInicio: '2026-11-13T09:00:00-06:00',
            nombreClinica: 'Clínica Sintética', procedimientos: ['Consulta general'] }])],
    ]);
});

afterEach(() => {
    for (const c of controladores) c.detener();
    fijarSesionVista(null);
    assert.deepEqual(inesperadas, [], 'toda petición debe estar prevista por el contrato de la prueba');
});

function registrar(controlador) { controladores.push(controlador); return controlador; }
const opciones = () => ({ conexion: conexionDoble(), memoria: new MemoriaVistas(), reloj });
const opcionesHttp = () => ({ autenticar: verificarSesionActual });
const escrituras = () => peticiones.filter(p => p.metodo !== 'GET');

async function citas(extra = {}) {
    const c = registrar(new ControladorCitas({ ...opciones(), ...extra }));
    await c.iniciar();
    c.elegirTipo(TIPO);
    c.escribirNumero(NUMERO);
    return c;
}

async function autenticar() {
    const c = new ControladorLogin();
    await c.cargarTipos();
    const recibida = await c.enviar({ idTipoDocumento: TIPO, numeroDocumento: ` ${NUMERO} ` });
    assert.equal(c.estado.mensaje, null);
    assert.deepEqual(recibida, sesion);
    fijarSesionVista(recibida);
    return recibida;
}

test('HU1: filtros → clínicas → citas → PDF, con datos privados solo en el cuerpo', async () => {
    const contenido = '%PDF-1.4\n% ticket sintético\n%%EOF';
    rutas.set(`POST publico/citas/${ID_CONSULTA}/ticket`, () => ({ status: 200,
        headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="ticket.pdf"' }, body: contenido }));
    const c = await citas();
    await c.buscar();
    assert.equal(c.estado.citas[0].idConsulta, ID_CONSULTA);
    assert.equal(c.estado.citas[0].procedimientos[0], 'Consulta general');
    await c.descargarTicket(ID_CONSULTA);
    const ticket = c.estado.tickets[ID_CONSULTA];
    assert.equal(ticket.estado, 'listo');
    assert.equal(ticket.archivo.nombre, 'ticket.pdf');
    assert.equal(await ticket.archivo.blob.text(), contenido);
    c.ticketEntregado(ID_CONSULTA);
    assert.equal(c.estado.tickets[ID_CONSULTA].archivo, undefined);
    assert.deepEqual(escrituras().map(p => p.ruta), ['publico/clinicas', 'publico/citas', `publico/citas/${ID_CONSULTA}/ticket`]);
    for (const p of escrituras()) {
        assert.equal(p.datos.numeroDocumento, NUMERO);
        assert.equal(p.datos.idTipoDocumento, TIPO);
        assert.deepEqual(p.query, {});
        assert.equal(p.ruta.includes(NUMERO), false);
        assert.equal(p.headers['x-csrf-token'], undefined);
    }
    assert.equal(peticiones.some(p => p.ruta === 'auth/me'), false);
    assert.deepEqual(escrituras()[1].datos, { idTipoDocumento: TIPO, numeroDocumento: NUMERO,
        idClinica: CLINICA, desde: '2026-10-14', hasta: '2026-12-13' });
});

test('HU1: un 503 (sin servidor) da el mensaje de conexión y se puede reintentar; un 429 respeta Retry-After antes de volver a enviar', async () => {
    let desbloquear;
    let espera;
    const c = await citas({ temporizador: { programar(fn, ms) { desbloquear = fn; espera = ms; }, cancelar() {} } });
    rutas.set('POST publico/citas', () => json({ code: 'servicio.error', message: 'detalle privado' }, 503));
    await c.buscar();
    assert.equal(c.estado.mensaje, CITAS.conexion);
    rutas.set('POST publico/citas', () => json({ code: 'publico.demasiadasSolicitudes' }, 429, { 'Retry-After': '2' }));
    await c.buscar();
    assert.equal(espera, 2000);
    const cantidad = peticiones.length;
    await c.buscar();
    assert.equal(peticiones.length, cantidad);
    desbloquear();
    rutas.set('POST publico/citas', () => json([]));
    await c.buscar();
    assert.deepEqual(c.estado.citas, []);
    assert.equal(c.estado.mensaje, null);
});

test('HU2: el login real del frontend normaliza el documento y vuelve a la consulta solicitada', async () => {
    const recibida = await autenticar();
    assert.deepEqual(peticiones.map(p => `${p.metodo} ${p.ruta}`), ['GET publico/tipos-documento', 'POST auth/login', 'GET auth/me']);
    assert.deepEqual(escrituras()[0].datos, { idTipoDocumento: TIPO, numeroDocumento: NUMERO });
    assert.equal(destinoTrasLogin(new URLSearchParams({ volver: `/consulta/${ID_CONSULTA}` }), recibida), `/consulta/${ID_CONSULTA}`);
    assert.equal(destinoTrasLogin(new URLSearchParams({ volver: 'https://sitio-ajeno.test' }), recibida), '/dashboard');
});

test('HU2: 401 neutro conserva el formulario y no consulta una sesión inexistente', async () => {
    rutas.set('POST auth/login', () => json({ code: 'auth.credenciales', message: 'detalle privado' }, 401));
    const c = new ControladorLogin();
    await c.cargarTipos();
    assert.equal(await c.enviar({ idTipoDocumento: TIPO, numeroDocumento: NUMERO }), null);
    assert.equal(c.estado.enviando, false);
    assert.match(c.estado.mensaje, /No encontramos una persona/);
    assert.equal(peticiones.some(p => p.ruta === 'auth/me'), false);
});

test('HU3: cambio de clínica con CSRF y sesión refrescada; filtro local y lectura sin red', async () => {
    const recibida = await autenticar();
    const otra = { idPersonaRol: UUID(3), idClinica: UUID(12), codigoRol: null, nombreRol: 'Rol sintético', nombreClinica: 'Otra clínica' };
    rutas.set('GET atencion', () => json({ idPersonaRol: sesion.rolActivo.idPersonaRol, idConsulta: null }));
    rutas.set('GET atencion/asignaciones', () => json([
        { ...sesion.rolActivo, codigoRol: 'DOCTOR', activa: true }, otra,
    ]));
    rutas.set('PUT atencion/rol-activo', () => {
        sesion = { ...sesion, rolActivo: { ...otra, codigo: null, idRol: UUID(701) } };
        return json({ idPersonaRol: otra.idPersonaRol, idConsulta: null });
    });
    rutas.set('GET atencion/dashboard', () => json([consultaB6()]));
    const servicio = new AtencionService(opcionesHttp());
    const c = registrar(new ControladorDashboard({ ...opciones(), servicio }));
    await c.iniciar(recibida);
    assert.equal(c.estado.grupos.length, 2);
    assert.equal(await c.cambiar(otra.idPersonaRol), true);
    assert.equal(c.estado.sesionCambiada.rolActivo.idClinica, otra.idClinica);
    const cambio = peticiones.find(p => p.metodo === 'PUT');
    assert.deepEqual(cambio.datos, { idPersonaRol: otra.idPersonaRol });
    assert.equal(cambio.headers['x-csrf-token'], recibida.csrfToken);
    const indice = peticiones.indexOf(cambio);
    assert.equal(peticiones[indice - 1].ruta, 'auth/me');
    assert.equal(peticiones[indice + 1].ruta, 'auth/me');
    fijarSesionVista(c.estado.sesionCambiada);
    const opts = opciones();
    const lista = registrar(new ControladorConsultas({ ...opts, servicio }));
    await lista.iniciar(c.estado.sesionCambiada);
    assert.equal(lista.estado.consultas.length, 1);
    assert.deepEqual(peticiones.at(-1).query, { desde: '2026-11-13', hasta: '2026-11-13' });
    const cantidad = peticiones.length;
    lista.buscarPaciente('nadie');
    assert.equal(lista.consultasVisibles.length, 0);
    lista.buscarPaciente('Paciente');
    assert.equal(lista.consultasVisibles.length, 1);
    opts.conexion.emitir(false);
    await lista.buscar();
    assert.equal(lista.estado.desdeMemoria, true);
    assert.equal(peticiones.length, cantidad);
});

async function consulta({ pendienteParaMi = true } = {}) {
    const recibida = await autenticar();
    const datos = consultaB6({ pendienteParaMi, procedimientos: [procedimiento(1, [
        pendiente(2, { rolPaso: { idRol: ID_ROL_DOCTOR, nombre: 'Doctor' } }),
    ])] });
    rutas.set(`GET atencion/consultas/${ID_CONSULTA}`, () => json(datos));
    rutas.set(`PUT consultas/${ID_CONSULTA}/sesion`, () => json({ idConsulta: ID_CONSULTA }));
    rutas.set(`GET consultas-procedimientos-pasos/${PASO}`, () => json({ idConsultaProcedimientoPaso: PASO, idProcedimientoPaso: DEFINICION, valor: null }));
    rutas.set(`GET procedimientos-pasos/${DEFINICION}`, () => json({ idProcedimientoPaso: DEFINICION, indicaFin: false }));
    rutas.set(`GET consultas-procedimientos-pasos/${PASO}/ordenes-examen`, () => json([]));
    rutas.set(`GET consultas-procedimientos-pasos/${PASO}/examenes-asignables`, () => json([]));
    const servicio = servicioConsulta({ atencion: new AtencionService(opcionesHttp()), consultas: new ConsultaService(opcionesHttp()),
        pasos: new ConsultaProcedimientoPasoService(opcionesHttp()), definiciones: new ProcedimientoPasoService(opcionesHttp()) });
    const c = registrar(new ControladorConsulta({ ...opciones(), servicio }));
    await c.iniciar(ID_CONSULTA, recibida);
    assert.equal(c.estado.error, null);
    return { c, datos };
}

test('HU4: registra atención mediante servicios reales y relee el estado confirmado', async () => {
    const { c, datos } = await consulta();
    assert.equal(c.motivoNoActuar, null);
    const seleccion = peticiones.find(p => p.metodo === 'PUT');
    assert.equal(seleccion.body, '');
    assert.equal(seleccion.headers['content-type'], undefined);
    rutas.set(`PUT consultas-procedimientos-pasos/${PASO}/finalizacion`, () => {
        datos.procedimientos[0].pasos[0].estado = 'COMPLETADO';
        return json({ idConsultaProcedimientoPaso: PASO, valor: 'Atención sintética' });
    });
    c.cambiarBorrador('  Atención sintética  ');
    assert.equal(await c.avanzar(), true);
    assert.equal(c.pendientes.length, 0);
    assert.equal(c.estado.borrador, '');
    const guardado = peticiones.find(p => p.ruta.endsWith('/finalizacion'));
    assert.deepEqual(guardado.datos, { valor: 'Atención sintética' });
    assert.equal(guardado.headers['x-csrf-token'], sesion.csrfToken);
    assert.equal(peticiones.at(-1).ruta, `atencion/consultas/${ID_CONSULTA}`);
});

test('HU4: un 503 al guardar conserva el borrador y permite reintentar', async () => {
    const { c } = await consulta();
    rutas.set(`PUT consultas-procedimientos-pasos/${PASO}/finalizacion`, () => json({ code: 'servicio.error' }, 503));
    c.cambiarBorrador('No perder esta nota sintética');
    assert.equal(await c.avanzar(), false);
    assert.equal(c.estado.borrador, 'No perder esta nota sintética');
    assert.ok(c.estado.errorAccion);
    assert.equal(c.estado.accion, null);
    rutas.set(`PUT consultas-procedimientos-pasos/${PASO}/finalizacion`, () => json({ idConsultaProcedimientoPaso: PASO }));
    assert.equal(await c.avanzar(), true);
    assert.equal(peticiones.filter(p => p.ruta.endsWith('/finalizacion')).length, 2);
});

test('HU4: una consulta ajena al rol se lee sin seleccionarla ni permitir escrituras', async () => {
    const { c } = await consulta({ pendienteParaMi: false });
    const cantidad = peticiones.length;
    assert.ok(c.bloqueo);
    c.cambiarBorrador('Intento sintético');
    assert.equal(await c.avanzar(), false);
    assert.equal(peticiones.length, cantidad);
    assert.equal(peticiones.some(p => p.metodo === 'PUT'), false);
});
