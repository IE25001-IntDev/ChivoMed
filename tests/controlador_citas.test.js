import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    ControladorCitas, MENSAJES, CLAVE_MEMORIA, PASOS, validarNumero, validarRango, pasoAlcanzable,
    motivoNoBuscar, mensajeDeErrorCitas, rangoPorDefecto, formatearHoraSV,
} from '../src/js/boundary/vistas/controlador_citas.js';
import { MemoriaVistas } from '../src/js/boundary/vistas/memoria_vistas.js';
import DefaultError from '../src/js/entities/default_error.js';
import { AuthError, CODIGO_SIN_RED } from '../src/js/control/auth_service.js';

// Datos inventados; nunca datos reales de pacientes.
const UUID = n => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DUI = Object.freeze({ idTipoDocumento: UUID(1), nombre: 'DUI', indicaciones: 'Ocho dígitos, guion y un dígito.', expresionRegular: '^[0-9]{8}-[0-9]$' });
const PASAPORTE = Object.freeze({ idTipoDocumento: UUID(2), nombre: 'Pasaporte', indicaciones: null, expresionRegular: null });
const NORTE = Object.freeze({ idClinica: UUID(10), nombre: 'Clínica Prueba Norte' });
const SUR = Object.freeze({ idClinica: UUID(20), nombre: 'Clínica Prueba Sur' });
const CITA = Object.freeze({ idConsulta: UUID(30), fechaInicio: '2026-11-12T08:00:00-06:00', nombreClinica: NORTE.nombre, procedimientos: Object.freeze(['Consulta general']) });
const NUMERO = '12345678-9';
// 13 nov 2026, 09:30 en El Salvador (UTC-6).
const AHORA = Date.UTC(2026, 10, 13, 15, 30);

const asentar = () => new Promise(resolve => setTimeout(resolve, 0));

function preparar({ clinicas = [NORTE, SUR], citas = [CITA], tipos = [DUI, PASAPORTE], enLinea = true, memoria = new MemoriaVistas() } = {}) {
    const llamadas = { tipos: 0, clinicas: [], citas: [], ticket: [] };
    const respuestas = {
        tipos: async () => tipos,
        clinicas: async () => clinicas,
        citas: async () => citas,
        ticket: async id => ({ blob: new Blob(['%PDF']), nombre: `ticket-cita-${id.slice(0, 8)}.pdf` }),
    };
    const servicio = {
        clinicas: async doc => { llamadas.clinicas.push(doc); return respuestas.clinicas(doc); },
        citas: async (doc, criterios) => { llamadas.citas.push({ doc, criterios }); return respuestas.citas(doc, criterios); },
        ticket: async (id, doc) => { llamadas.ticket.push({ id, doc }); return respuestas.ticket(id, doc); },
    };
    const suscriptores = new Set();
    const conexion = { enLinea, suscribir: fn => { suscriptores.add(fn); return () => suscriptores.delete(fn); } };
    const red = valor => { conexion.enLinea = valor; for (const fn of [...suscriptores]) fn(valor); };
    const reloj = { ahora: AHORA };
    const temporizadores = [];
    const controlador = new ControladorCitas({
        servicio,
        listarTiposDocumento: async () => { llamadas.tipos++; return respuestas.tipos(); },
        conexion, memoria,
        reloj: () => new Date(reloj.ahora),
        temporizador: {
            programar: (fn, ms) => { const t = { fn, ms, activo: true }; temporizadores.push(t); return t; },
            cancelar: t => { if (t) t.activo = false; },
        },
    });
    return { controlador, estado: controlador.estado, llamadas, respuestas, red, reloj, temporizadores, memoria, suscriptores };
}

/** Recorre hasta el paso 4 con DUI y el número inventado. */
async function hastaFechas(ctx, { numero = NUMERO } = {}) {
    const { controlador } = ctx;
    await controlador.iniciar();
    controlador.elegirTipo(DUI.idTipoDocumento);
    controlador.siguiente();
    controlador.escribirNumero(numero);
    await controlador.siguiente();
    controlador.elegirClinica(NORTE.idClinica);
    controlador.siguiente();
}

describe('ControladorCitas: funciones puras', () => {
    test('PASOS: cinco pasos con nombre', () => {
        assert.deepEqual(PASOS.map(p => p.nombre), ['Tipo de documento', 'Número de documento', 'Clínica', 'Fechas', 'Resultados']);
    });

    test('validarNumero: vacío, largo, saltos de línea y formato del tipo', () => {
        assert.equal(validarNumero(DUI, '   '), MENSAJES.numeroRequerido);
        assert.equal(validarNumero(PASAPORTE, 'A'.repeat(51)), MENSAJES.numeroLargo);
        assert.equal(validarNumero(PASAPORTE, 'A'.repeat(50)), null);
        assert.equal(validarNumero(PASAPORTE, 'A\nB'), MENSAJES.numeroSaltos);
        assert.match(validarNumero(DUI, '1234'), /formato de DUI\. Ocho dígitos/);
        assert.equal(validarNumero(DUI, ` ${NUMERO} `), null);
        assert.equal(validarNumero(null, NUMERO), MENSAJES.tipoRequerido);
    });

    test('validarRango: sigue al backend, DAYS.between(desde, hasta) <= 366', () => {
        assert.equal(validarRango('2026-01-01', '2027-01-02'), null, '366 días de diferencia: se acepta');
        assert.equal(validarRango('2026-01-01', '2027-01-03'), MENSAJES.rangoLargo, '367: no');
        assert.equal(validarRango('2026-11-13', '2026-11-13'), null, 'un día');
        assert.equal(validarRango('2026-11-14', '2026-11-13'), MENSAJES.rangoInvertido);
        assert.equal(validarRango('2026-02-30', '2026-03-01'), MENSAJES.fechasInvalidas);
        assert.equal(validarRango('', '2026-03-01'), MENSAJES.fechasInvalidas);
    });

    test('rangoPorDefecto: de hoy − 30 a hoy + 30 en El Salvador', () => {
        assert.deepEqual(rangoPorDefecto(() => new Date(AHORA)), { desde: '2026-10-14', hasta: '2026-12-13' });
        // 13 nov a las 23:30 en El Salvador ya es 14 nov en UTC: manda el día de El Salvador.
        assert.deepEqual(rangoPorDefecto(() => new Date(Date.UTC(2026, 10, 14, 5, 30))), { desde: '2026-10-14', hasta: '2026-12-13' });
    });

    test('pasoAlcanzable: solo del 1 al alcanzado', () => {
        assert.equal(pasoAlcanzable(3, 3), true);
        assert.equal(pasoAlcanzable(4, 3), false);
        assert.equal(pasoAlcanzable(0, 3), false);
        assert.equal(pasoAlcanzable(1.5, 3), false);
    });

    test('motivoNoBuscar: sin red, bloqueo por límite o ninguno', () => {
        assert.equal(motivoNoBuscar({ enLinea: false, bloqueadoHasta: null }, AHORA), MENSAJES.sinRedBuscar);
        assert.equal(motivoNoBuscar({ enLinea: true, bloqueadoHasta: AHORA + 60000 }, AHORA), MENSAJES.limite(formatearHoraSV(AHORA + 60000)));
        assert.equal(motivoNoBuscar({ enLinea: true, bloqueadoHasta: AHORA - 1 }, AHORA), null);
        assert.equal(motivoNoBuscar({ enLinea: true, bloqueadoHasta: null }, AHORA), null);
    });

    test('formatearHoraSV: HH:MM en El Salvador', () => {
        assert.equal(formatearHoraSV(AHORA), '09:30');
    });

    test('mensajeDeErrorCitas: por código y status, sin detalles internos', () => {
        const e = (status, code, message = 'interno') => new DefaultError({ status, code, message });
        assert.equal(mensajeDeErrorCitas(e(400, 'validacion.invalida')), MENSAJES.datos);
        assert.equal(mensajeDeErrorCitas(e(400, 'json.invalido')), MENSAJES.datos);
        assert.equal(mensajeDeErrorCitas(e(400, 'citas.rango', 'El rango de fechas no es válido.')), 'El rango de fechas no es válido.');
        assert.match(mensajeDeErrorCitas(e(403, 'auth.origen')), /localhost:3000/);
        assert.equal(mensajeDeErrorCitas(e(0, 'conexion.error')), MENSAJES.conexion);
        assert.equal(mensajeDeErrorCitas(e(404, 'cita.noExiste')), MENSAJES.ticketNoExiste);
        assert.equal(mensajeDeErrorCitas(e(500, 'error.interno', 'NullPointerException')), MENSAJES.generico);
    });
});

describe('ControladorCitas: pasos y datos', () => {
    test('iniciar carga los tipos y arranca en el paso 1 con el rango por defecto', async () => {
        const { controlador, estado, llamadas } = preparar();
        await controlador.iniciar();
        assert.equal(llamadas.tipos, 1);
        assert.deepEqual(estado.tipos, [DUI, PASAPORTE]);
        assert.equal(estado.paso, 1);
        assert.equal(estado.alcanzado, 1);
        assert.equal(estado.desde, '2026-10-14');
        assert.equal(estado.hasta, '2026-12-13');
    });

    test('no avanza sin tipo ni con un número inválido; marca el error del campo', async () => {
        const { controlador, estado, llamadas } = preparar();
        await controlador.iniciar();
        controlador.siguiente();
        assert.equal(estado.paso, 1);
        assert.equal(estado.errores.tipo, MENSAJES.tipoRequerido);
        controlador.elegirTipo(DUI.idTipoDocumento);
        assert.equal(estado.errores.tipo, null);
        controlador.siguiente();
        controlador.escribirNumero('123');
        await controlador.siguiente();
        assert.equal(estado.paso, 2);
        assert.match(estado.errores.numero, /formato de DUI/);
        assert.equal(llamadas.clinicas.length, 0);
    });

    test('flujo completo: clínicas, clínica, fechas y resultados con el número recortado', async () => {
        const ctx = preparar();
        await hastaFechas(ctx, { numero: `  ${NUMERO} ` });
        const { controlador, estado, llamadas } = ctx;
        assert.deepEqual(llamadas.clinicas, [{ idTipoDocumento: DUI.idTipoDocumento, numeroDocumento: NUMERO }]);
        assert.equal(estado.paso, 4);
        await controlador.siguiente();
        assert.equal(estado.paso, 5);
        assert.equal(estado.alcanzado, 5);
        assert.deepEqual(estado.citas, [CITA]);
        assert.deepEqual(llamadas.citas[0].criterios, { idClinica: NORTE.idClinica, desde: '2026-10-14', hasta: '2026-12-13' });
        assert.equal(llamadas.citas[0].doc.numeroDocumento, NUMERO);
        assert.ok(Object.isFrozen(estado.errores));
    });

    test('con una sola clínica viene preseleccionada', async () => {
        const { controlador, estado } = preparar({ clinicas: [NORTE] });
        await controlador.iniciar();
        controlador.elegirTipo(DUI.idTipoDocumento);
        controlador.siguiente();
        controlador.escribirNumero(NUMERO);
        await controlador.siguiente();
        assert.equal(estado.idClinica, NORTE.idClinica);
    });

    test('sin clínicas: paso 3 con el mensaje neutro y sin poder avanzar', async () => {
        const { controlador, estado } = preparar({ clinicas: [] });
        await controlador.iniciar();
        controlador.elegirTipo(DUI.idTipoDocumento);
        controlador.siguiente();
        controlador.escribirNumero('99999999-9');
        await controlador.siguiente();
        assert.equal(estado.paso, 3);
        assert.deepEqual(estado.clinicas, []);
        assert.equal(MENSAJES.sinClinicas, 'No encontramos clínicas para esa búsqueda. Revisa el tipo y el número de documento.');
        controlador.siguiente();
        assert.equal(estado.paso, 3);
        assert.equal(estado.alcanzado, 3);
    });

    test('ir y volver entre pasos conserva lo escrito y no repite peticiones', async () => {
        const ctx = preparar();
        await hastaFechas(ctx);
        const { controlador, estado, llamadas } = ctx;
        await controlador.siguiente();
        controlador.irA(2);
        assert.equal(estado.paso, 2);
        assert.equal(estado.numeroDocumento, NUMERO);
        assert.equal(estado.alcanzado, 5);
        await controlador.siguiente();
        controlador.siguiente();
        await controlador.siguiente();
        assert.equal(estado.paso, 5);
        assert.equal(llamadas.clinicas.length, 1, 'las clínicas se piden una vez por par');
        assert.equal(llamadas.citas.length, 1, 'las citas no cambian de criterio');
        controlador.atras();
        assert.equal(estado.paso, 4);
        controlador.irA(1);
        assert.equal(estado.idTipoDocumento, DUI.idTipoDocumento);
        assert.equal(estado.idClinica, NORTE.idClinica);
        controlador.irA(5);
        assert.equal(estado.paso, 5);
    });

    test('irA no salta a un paso no alcanzado', async () => {
        const { controlador, estado } = preparar();
        await controlador.iniciar();
        controlador.irA(4);
        assert.equal(estado.paso, 1);
    });

    test('cambiar el número invalida clínicas y resultados, el alcanzado vuelve al 2 y las fechas se conservan', async () => {
        const ctx = preparar();
        await hastaFechas(ctx);
        const { controlador, estado, llamadas } = ctx;
        controlador.fijarFechas({ desde: '2026-11-01', hasta: '2026-11-30' });
        await controlador.siguiente();
        controlador.irA(2);
        controlador.escribirNumero('87654321-0');
        assert.equal(estado.alcanzado, 2);
        assert.equal(estado.clinicas, null);
        assert.equal(estado.idClinica, null);
        assert.equal(estado.citas, null);
        assert.equal(estado.desde, '2026-11-01');
        await controlador.siguiente();
        assert.equal(llamadas.clinicas.length, 2);
    });

    test('espacios alrededor del número no cuentan como cambio', async () => {
        const ctx = preparar();
        await hastaFechas(ctx);
        ctx.controlador.escribirNumero(` ${NUMERO}  `);
        assert.equal(ctx.estado.alcanzado, 4);
        assert.equal(ctx.estado.idClinica, NORTE.idClinica);
    });

    test('cambiar el tipo invalida igual que el número', async () => {
        const ctx = preparar();
        await hastaFechas(ctx);
        ctx.controlador.irA(1);
        ctx.controlador.elegirTipo(PASAPORTE.idTipoDocumento);
        assert.equal(ctx.estado.alcanzado, 2);
        assert.equal(ctx.estado.clinicas, null);
        assert.equal(ctx.estado.numeroDocumento, NUMERO, 'el número escrito se conserva');
    });

    test('cambiar la clínica o las fechas invalida solo los resultados', async () => {
        const ctx = preparar();
        await hastaFechas(ctx);
        const { controlador, estado, llamadas } = ctx;
        await controlador.siguiente();
        controlador.irA(3);
        controlador.elegirClinica(SUR.idClinica);
        assert.equal(estado.citas, null);
        assert.equal(estado.alcanzado, 4);
        assert.deepEqual(estado.clinicas, [NORTE, SUR]);
        controlador.siguiente();
        await controlador.siguiente();
        assert.equal(llamadas.citas.length, 2);
        controlador.irA(4);
        controlador.fijarFechas({ desde: '2026-11-01', hasta: estado.hasta });
        assert.equal(estado.citas, null);
        assert.equal(estado.alcanzado, 4);
        await controlador.siguiente();
        assert.equal(llamadas.citas.length, 3);
    });

    test('rango inválido: no busca y deja el error en el paso 4', async () => {
        const ctx = preparar();
        await hastaFechas(ctx);
        ctx.controlador.fijarFechas({ desde: '2026-01-01', hasta: '2027-01-03' });
        await ctx.controlador.siguiente();
        assert.equal(ctx.estado.paso, 4);
        assert.equal(ctx.estado.errores.rango, MENSAJES.rangoLargo);
        assert.equal(ctx.llamadas.citas.length, 0);
        ctx.controlador.fijarFechas({ desde: '2026-01-01', hasta: '2027-01-02' });
        await ctx.controlador.siguiente();
        assert.equal(ctx.estado.paso, 5, '366 días de diferencia sí se buscan');
    });

    test('400 citas.rango del backend: muestra su mensaje en el paso 4', async () => {
        const ctx = preparar();
        await hastaFechas(ctx);
        ctx.respuestas.citas = async () => { throw new DefaultError({ status: 400, code: 'citas.rango', message: 'El rango de fechas no es válido.' }); };
        await ctx.controlador.siguiente();
        assert.equal(ctx.estado.paso, 4);
        assert.equal(ctx.estado.errores.rango, 'El rango de fechas no es válido.');
    });

    test('sin citas: paso 5 con lista vacía', async () => {
        const ctx = preparar({ citas: [] });
        await hastaFechas(ctx);
        await ctx.controlador.siguiente();
        assert.equal(ctx.estado.paso, 5);
        assert.deepEqual(ctx.estado.citas, []);
    });

    test('mientras una petición está en curso se ignora el doble clic', async () => {
        const ctx = preparar();
        await ctx.controlador.iniciar();
        ctx.controlador.elegirTipo(DUI.idTipoDocumento);
        ctx.controlador.siguiente();
        ctx.controlador.escribirNumero(NUMERO);
        let soltar;
        ctx.respuestas.clinicas = () => new Promise(r => { soltar = () => r([NORTE]); });
        const primera = ctx.controlador.siguiente();
        assert.equal(ctx.estado.cargando, 'clinicas');
        ctx.controlador.siguiente();
        soltar();
        await primera;
        assert.equal(ctx.llamadas.clinicas.length, 1);
        assert.equal(ctx.estado.cargando, null);
    });

    test('"Nueva búsqueda" borra todo, número incluido, y vuelve al paso 1', async () => {
        const ctx = preparar();
        await hastaFechas(ctx);
        await ctx.controlador.siguiente();
        ctx.controlador.nuevaBusqueda();
        const { estado } = ctx;
        assert.equal(estado.paso, 1);
        assert.equal(estado.alcanzado, 1);
        assert.equal(estado.idTipoDocumento, '');
        assert.equal(estado.numeroDocumento, '');
        assert.equal(estado.clinicas, null);
        assert.equal(estado.citas, null);
        assert.equal(estado.desde, '2026-10-14');
        assert.equal(ctx.memoria.leer(CLAVE_MEMORIA), null);
        assert.deepEqual(estado.tipos, [DUI, PASAPORTE], 'el catálogo se conserva');
    });
});

describe('ControladorCitas: límite de solicitudes (429)', () => {
    test('bloquea las búsquedas hasta la hora de Retry-After y luego desbloquea', async () => {
        const ctx = preparar();
        await ctx.controlador.iniciar();
        ctx.controlador.elegirTipo(DUI.idTipoDocumento);
        ctx.controlador.siguiente();
        ctx.controlador.escribirNumero(NUMERO);
        ctx.respuestas.clinicas = async () => {
            throw new DefaultError({ status: 429, code: 'publico.demasiadasSolicitudes', headers: { 'retry-after': '300' } });
        };
        await ctx.controlador.siguiente();
        const { estado } = ctx;
        assert.equal(estado.paso, 2);
        assert.equal(estado.bloqueadoHasta, AHORA + 300000);
        assert.equal(estado.mensaje, 'Hiciste muchas búsquedas seguidas. Podrás intentarlo de nuevo a las 09:35.');
        await ctx.controlador.siguiente();
        assert.equal(ctx.llamadas.clinicas.length, 1, 'bloqueado: no se pide de nuevo');
        ctx.controlador.irA(1);
        assert.equal(estado.paso, 1, 'se puede seguir navegando');
        const [t] = ctx.temporizadores;
        assert.equal(t.ms, 300000);
        t.fn();
        assert.equal(estado.bloqueadoHasta, null);
        assert.equal(estado.mensaje, null);
    });
});

describe('ControladorCitas: ticket', () => {
    async function enResultados(opciones) {
        const ctx = preparar(opciones);
        await hastaFechas(ctx);
        await ctx.controlador.siguiente();
        return ctx;
    }

    test('descargando → listo con el archivo; ticketEntregado lo suelta', async () => {
        const ctx = await enResultados();
        const promesa = ctx.controlador.descargarTicket(CITA.idConsulta);
        assert.equal(ctx.estado.tickets[CITA.idConsulta].estado, 'descargando');
        await promesa;
        const ticket = ctx.estado.tickets[CITA.idConsulta];
        assert.equal(ticket.estado, 'listo');
        assert.equal(ticket.archivo.nombre, 'ticket-cita-40000000.pdf');
        assert.deepEqual(ctx.llamadas.ticket[0], { id: CITA.idConsulta, doc: { idTipoDocumento: DUI.idTipoDocumento, numeroDocumento: NUMERO } });
        ctx.controlador.ticketEntregado(CITA.idConsulta);
        assert.equal(ctx.estado.tickets[CITA.idConsulta].estado, 'entregado');
        assert.equal(ctx.estado.tickets[CITA.idConsulta].archivo, undefined);
    });

    test('404 cita.noExiste: error en la card', async () => {
        const ctx = await enResultados();
        ctx.respuestas.ticket = async () => { throw new DefaultError({ status: 404, code: 'cita.noExiste' }); };
        await ctx.controlador.descargarTicket(CITA.idConsulta);
        assert.deepEqual({ ...ctx.estado.tickets[CITA.idConsulta] }, { estado: 'error', error: MENSAJES.ticketNoExiste });
    });

    test('una cita que no está en los resultados no se pide', async () => {
        const ctx = await enResultados();
        await ctx.controlador.descargarTicket(UUID(99));
        assert.equal(ctx.llamadas.ticket.length, 0);
    });
});

describe('ControladorCitas: sin red y memoria', () => {
    test('tipos sin red ni caché: aviso y reintento al volver la red', async () => {
        const ctx = preparar({ enLinea: false });
        ctx.respuestas.tipos = async () => { throw new AuthError('No pudimos conectar.', 0, CODIGO_SIN_RED); };
        await ctx.controlador.iniciar();
        assert.equal(ctx.estado.errorTipos, MENSAJES.tiposSinRed);
        ctx.respuestas.tipos = async () => [DUI];
        ctx.red(true);
        await asentar();
        assert.deepEqual(ctx.estado.tipos, [DUI]);
        assert.equal(ctx.estado.errorTipos, null);
    });

    test('sin red no se busca: motivo en el estado y ninguna petición', async () => {
        const ctx = preparar();
        await ctx.controlador.iniciar();
        ctx.controlador.elegirTipo(DUI.idTipoDocumento);
        ctx.controlador.siguiente();
        ctx.controlador.escribirNumero(NUMERO);
        ctx.red(false);
        assert.equal(ctx.estado.enLinea, false);
        await ctx.controlador.siguiente();
        assert.equal(ctx.estado.paso, 2);
        assert.equal(ctx.llamadas.clinicas.length, 0);
        ctx.red(true);
        await asentar();
        assert.equal(ctx.llamadas.clinicas.length, 0, 'al volver la red no busca sola');
    });

    test('guarda la búsqueda en memoria y la restaura en otra instancia (sin red: aviso con la hora)', async () => {
        const memoria = new MemoriaVistas();
        const ctx = preparar({ memoria });
        await hastaFechas(ctx);
        await ctx.controlador.siguiente();
        ctx.controlador.detener();
        const guardado = memoria.leer(CLAVE_MEMORIA);
        assert.ok(Object.isFrozen(guardado));
        assert.deepEqual(guardado.citas, [CITA]);

        const otra = preparar({ memoria, enLinea: false });
        await otra.controlador.iniciar();
        const { estado } = otra;
        assert.equal(estado.paso, 5);
        assert.equal(estado.alcanzado, 5);
        assert.deepEqual(estado.citas, [CITA]);
        assert.equal(estado.numeroDocumento, NUMERO);
        assert.equal(estado.desdeMemoria, true);
        assert.equal(MENSAJES.memoria(formatearHoraSV(estado.actualizadoEn)), 'Sin conexión. Mostrando la búsqueda de las 09:30.');
        otra.controlador.irA(2);
        await otra.controlador.siguiente();
        assert.equal(estado.paso, 3, 'las clínicas restauradas no necesitan red');
        assert.equal(otra.llamadas.clinicas.length, 0);
    });

    test('detener cancela la suscripción a la red', async () => {
        const ctx = preparar();
        await ctx.controlador.iniciar();
        assert.equal(ctx.suscriptores.size, 1);
        ctx.controlador.detener();
        assert.equal(ctx.suscriptores.size, 0);
    });
});
