import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    ControladorConsultas, MENSAJES, MAX_DIAS, validarRango, normalizarConsultas, arbolDePasos, motivoNoAtender,
    etiquetaEstado, resumenResultado, mensajeDeError, accionAtender, esPasoDeMiRol,
} from '../src/js/boundary/vistas/controlador_consultas.js';
import { MemoriaVistas } from '../src/js/boundary/vistas/memoria_vistas.js';
import DefaultError from '../src/js/entities/default_error.js';

// Datos inventados; nunca datos reales de pacientes.
const UUID = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const asentar = () => new Promise(resolve => setTimeout(resolve, 0));
const errorHttp = (status, code = null, message = '') => new DefaultError({ status, code, message });

const paso = (n, extra = {}) => ({
    idConsultaProcedimientoPaso: UUID(100 + n), nombre: `Paso ${n}`, orden: n, nivel: 0, estado: 'COMPLETADO',
    responsable: { nombre: 'Persona Responsable', rol: 'Doctor' },
    fechaInicio: '2026-11-13T08:00:00-06:00', fechaFin: '2026-11-13T08:10:00-06:00', tieneValor: true, ...extra,
});
const consulta = (n, extra = {}) => ({
    idConsulta: UUID(n), fechaInicio: '2026-11-13T08:00:00-06:00', fechaFin: null, pendienteParaMi: true,
    paciente: { nombres: 'Paciente', apellidos: `Prueba ${n}`, fechaNacimiento: '1999-12-31', edad: 26, documentos: [{ tipoDocumento: 'DUI', numero: '00000000-0' }] },
    procedimientos: [{ idConsultaProcedimiento: UUID(50 + n), nombre: 'Procedimiento de prueba', fechaInicio: null, fechaFin: null,
        pasos: [paso(1), paso(2, { nivel: 1, estado: 'PENDIENTE', fechaFin: null, tieneValor: false })] }],
    ...extra,
});
const sesionCon = (idPersonaRol = UUID(900), usuario = 1) => ({
    usuario: { idUsuario: UUID(800 + usuario) }, rolActivo: { idPersonaRol, codigo: 'DOCTOR' }, csrfToken: 'csrf-prueba',
});

function conexionDoble(enLinea = true) {
    const suscriptores = new Set();
    return {
        enLinea,
        suscribir: fn => { suscriptores.add(fn); return () => suscriptores.delete(fn); },
        emitir(valor) { this.enLinea = valor; for (const fn of [...suscriptores]) fn(valor); },
    };
}

/** Controlador con dobles. El reloj marca 2026-11-13 09:30 en El Salvador. */
function preparar({ dashboard = async () => [consulta(1), consulta(2)], valorPaso = async id => ({ idConsultaProcedimientoPaso: id, valor: 'Registro de prueba', fechaFin: null }),
    enLinea = true, memoria = new MemoriaVistas() } = {}) {
    const llamadas = { dashboard: [], valorPaso: [] };
    const conexion = conexionDoble(enLinea);
    const controlador = new ControladorConsultas({
        servicio: {
            dashboard: async filtros => { llamadas.dashboard.push(filtros); return { data: await dashboard(filtros) }; },
            valorPaso: async id => { llamadas.valorPaso.push(id); return { data: await valorPaso(id) }; },
        },
        conexion, memoria,
        reloj: () => new Date('2026-11-13T15:30:00Z'),
    });
    const lotes = [];
    controlador.suscribir(cambios => lotes.push([...cambios].sort()));
    return { controlador, llamadas, conexion, memoria, lotes };
}

describe('validarRango', () => {
    test('el mismo día y 31 días contando ambos extremos son válidos', () => {
        assert.equal(validarRango('2026-11-13', '2026-11-13'), null);
        assert.equal(validarRango('2026-11-01', '2026-12-01'), null);
        assert.equal(MAX_DIAS, 31);
    });
    test('32 días, rango invertido o fechas inválidas tienen su mensaje', () => {
        assert.equal(validarRango('2026-11-01', '2026-12-02'), MENSAJES.rangoExcedido);
        assert.equal(validarRango('2026-11-14', '2026-11-13'), MENSAJES.rangoInvertido);
        assert.equal(validarRango('2026-02-30', '2026-03-01'), MENSAJES.fechaInvalida);
        assert.equal(validarRango('', '2026-11-13'), MENSAJES.fechaInvalida);
    });
});

describe('normalizarConsultas', () => {
    test('conserva el orden, arma el nombre y congela todo', () => {
        const [a, b] = normalizarConsultas([consulta(2), consulta(1)]);
        assert.equal(a.idConsulta, UUID(2));
        assert.equal(b.paciente.nombre, 'Paciente Prueba 1');
        assert.ok(Object.isFrozen(a) && Object.isFrozen(a.procedimientos[0].pasos[0]));
    });
    test('descarta entradas sin UUID y tolera nulos del backend', () => {
        const datos = [
            { idConsulta: 'no-uuid' },
            null,
            { ...consulta(3), paciente: { nombres: null, apellidos: null, fechaNacimiento: null, edad: null, documentos: null },
                procedimientos: [{ idConsultaProcedimiento: UUID(60), nombre: null, pasos: [] },
                    { idConsultaProcedimiento: 'x' },
                    { idConsultaProcedimiento: UUID(61), nombre: 'P', pasos: [paso(9, { responsable: null, nombre: null, nivel: -2 }), { idConsultaProcedimientoPaso: 'x' }] }] },
        ];
        const [c] = normalizarConsultas(datos);
        assert.equal(normalizarConsultas(datos).length, 1);
        assert.equal(c.paciente.nombre, 'Paciente sin nombre registrado');
        assert.equal(c.paciente.edad, null);
        assert.equal(c.paciente.fechaNacimiento, null);
        assert.deepEqual(c.paciente.documentos, []);
        assert.equal(c.procedimientos.length, 2);
        assert.equal(c.procedimientos[0].nombre, 'Procedimiento sin nombre');
        assert.deepEqual(c.procedimientos[0].pasos, []);
        const [s] = c.procedimientos[1].pasos;
        assert.equal(c.procedimientos[1].pasos.length, 1);
        assert.equal(s.responsable, null);
        assert.equal(s.nombre, 'Paso sin nombre');
        assert.equal(s.nivel, 0);
    });
    test('una respuesta que no es lista da []', () => assert.deepEqual(normalizarConsultas({}), []));
});

describe('arbolDePasos', () => {
    const p = (id, nivel) => ({ id, nivel });
    const forma = nodos => nodos.map(n => (n.hijos.length ? [n.paso.id, forma(n.hijos)] : n.paso.id));
    test('lista plana en nivel 0', () => assert.deepEqual(forma(arbolDePasos([p('a', 0), p('b', 0)])), ['a', 'b']));
    test('cadena 0-1-2', () => assert.deepEqual(forma(arbolDePasos([p('a', 0), p('b', 1), p('c', 2)])), [['a', [['b', ['c']]]]]));
    test('hermanos en el mismo nivel y vuelta a la raíz', () => {
        assert.deepEqual(forma(arbolDePasos([p('a', 0), p('b', 1), p('c', 1), p('d', 0)])), [['a', ['b', 'c']], 'd']);
    });
    test('un salto de nivel se ajusta al anterior + 1', () => {
        assert.deepEqual(forma(arbolDePasos([p('a', 0), p('b', 2)])), [['a', ['b']]]);
        assert.deepEqual(forma(arbolDePasos([p('a', 3)])), ['a']);
    });
    test('un paso sin definición al final con nivel 0 vuelve a la raíz; conserva el orden', () => {
        assert.deepEqual(forma(arbolDePasos([p('a', 0), p('b', 1), p('sin-def', 0)])), [['a', ['b']], 'sin-def']);
    });
    test('el árbol queda congelado y acepta una lista vacía', () => {
        const arbol = arbolDePasos([p('a', 0), p('b', 1)]);
        assert.ok(Object.isFrozen(arbol) && Object.isFrozen(arbol[0].hijos));
        assert.deepEqual(arbolDePasos([]), []);
    });
});

describe('motivoNoAtender', () => {
    const [abierta] = normalizarConsultas([consulta(1)]);
    test('abierta y pendiente para mí, con red: se puede atender', () => assert.equal(motivoNoAtender(abierta), null));
    test('cerrada', () => {
        const [c] = normalizarConsultas([consulta(1, { fechaFin: '2026-11-13T10:00:00-06:00' })]);
        assert.equal(motivoNoAtender(c), MENSAJES.cerrada);
    });
    // Demo del guion: SA-4 (Toma de presión de Julia) está pendiente para Lucía, Enfermera.
    const ajena = (pendiente, extra = {}) => normalizarConsultas([consulta(1, { pendienteParaMi: false, ...extra,
        procedimientos: [{ idConsultaProcedimiento: UUID(70), nombre: 'Control de hipertensión', pasos: [paso(1), paso(2, { estado: 'PENDIENTE', ...pendiente })] }] })])[0];
    const ROL_ENFERMERA = { idRol: UUID(600), nombre: 'Enfermera' };

    test('no es para mí: dice la persona asignada y, si llega rolPaso, el rol del paso', () => {
        const lucia = { nombre: 'Lucía Pérez', rol: 'Enfermera' };
        assert.equal(motivoNoAtender(ajena({ responsable: lucia, rolPaso: ROL_ENFERMERA })), 'Le corresponde a Lucía Pérez (Enfermera).');
        assert.equal(motivoNoAtender(ajena({ responsable: lucia })), 'Le corresponde a Lucía Pérez.', 'sin rolPaso no usa el rol de la persona');
        assert.equal(motivoNoAtender(ajena({ responsable: null, rolPaso: ROL_ENFERMERA })), 'Este paso lo atiende el rol Enfermera.');
    });
    test('no es para mí y no se sabe quién atiende el paso: respaldo genérico', () => {
        assert.equal(motivoNoAtender(ajena({ responsable: null })), MENSAJES.otroRol);
        assert.equal(MENSAJES.otroRol, 'Este paso lo atiende otro rol.');
    });
    test('sin pasos pendientes y no me toca: solo cierra quien completó el paso final', () => {
        const [todoListo] = normalizarConsultas([consulta(1, { pendienteParaMi: false, procedimientos: [{ idConsultaProcedimiento: UUID(70), nombre: 'P', pasos: [paso(1)] }] })]);
        assert.equal(motivoNoAtender(todoListo), MENSAJES.soloFinalizador);
    });
    test('sin red o en solo lectura no se puede atender', () => {
        assert.equal(motivoNoAtender(abierta, { enLinea: false }), MENSAJES.sinRedAtender);
        assert.equal(motivoNoAtender(abierta, { soloLectura: true }), MENSAJES.sinRedAtender);
    });
    test('no depende del rol activo: no hay lista fija de roles que atienden', () => {
        assert.equal(Object.hasOwn(MENSAJES, 'soloDoctor'), false);
        assert.equal(motivoNoAtender(abierta, { rol: 'ADMINISTRACION' }), null);
    });
    test('un rolPaso mal formado se descarta', () => {
        assert.equal(ajena({ rolPaso: { idRol: 'x', nombre: 'Enfermera' } }).procedimientos[0].pasos[1].rolPaso, null);
        assert.deepEqual(ajena({ rolPaso: ROL_ENFERMERA }).procedimientos[0].pasos[1].rolPaso, ROL_ENFERMERA);
    });
});

describe('accionAtender y esPasoDeMiRol', () => {
    test('"cerrar" si me toca y no quedan pasos pendientes; si no, "atender"', () => {
        const [cerrarla] = normalizarConsultas([consulta(1, { procedimientos: [{ idConsultaProcedimiento: UUID(70), nombre: 'P', pasos: [paso(1)] }] })]);
        assert.equal(accionAtender(cerrarla), 'cerrar');
        assert.equal(accionAtender(normalizarConsultas([consulta(1)])[0]), 'atender');
        assert.equal(accionAtender({ ...cerrarla, fechaFin: '2026-11-13T10:00:00-06:00' }), 'atender');
        assert.equal(accionAtender(null), 'atender');
    });
    test('compara solo por idRol, y solo si los dos lados lo traen', () => {
        const pasoEnfermera = { rolPaso: { idRol: UUID(600), nombre: 'Enfermera' } };
        assert.equal(esPasoDeMiRol(pasoEnfermera, { idRol: UUID(600) }), true);
        assert.equal(esPasoDeMiRol(pasoEnfermera, { idRol: UUID(601), nombreRol: 'Enfermera' }), false, 'nunca por nombre');
        assert.equal(esPasoDeMiRol(pasoEnfermera, { nombreRol: 'Enfermera' }), false);
        assert.equal(esPasoDeMiRol({ rolPaso: null }, { idRol: UUID(600) }), false);
    });
});

describe('textos', () => {
    test('etiquetaEstado traduce los estados conocidos y deja los demás tal cual', () => {
        assert.equal(etiquetaEstado('PENDIENTE'), 'Pendiente');
        assert.equal(etiquetaEstado('COMPLETADO'), 'Completado');
        assert.equal(etiquetaEstado('OTRO'), 'OTRO');
        assert.equal(etiquetaEstado(null), 'Sin estado');
    });
    test('resumenResultado', () => {
        assert.equal(resumenResultado([], null), '');
        assert.equal(resumenResultado([], { desde: '2026-11-13', hasta: '2026-11-13' }), MENSAJES.sinConsultas);
        assert.match(resumenResultado([1], { desde: '2026-11-13', hasta: '2026-11-13' }), /^1 consulta del 13 nov/);
        assert.match(resumenResultado([1, 2], { desde: '2026-11-01', hasta: '2026-11-15' }), /^2 consultas del 1 nov.* al 15 nov/);
    });
    test('mensajeDeError traduce los códigos del dashboard y los status', () => {
        assert.equal(mensajeDeError(errorHttp(400, 'dashboard.rangoExcedido')), MENSAJES.rangoExcedido);
        assert.equal(mensajeDeError(errorHttp(400, 'dashboard.rangoInvertido')), MENSAJES.rangoInvertido);
        assert.equal(mensajeDeError(errorHttp(400, 'dashboard.fecha')), MENSAJES.fechaInvalida);
        assert.equal(mensajeDeError(errorHttp(403, 'auth.rolActivo')), MENSAJES.sinRol);
        assert.equal(mensajeDeError(errorHttp(403, 'auth.asignacion')), MENSAJES.sinAsignacion);
        assert.equal(mensajeDeError(errorHttp(404, 'consulta.pasoNoExiste'), { registro: true }), MENSAJES.pasoNoExiste);
        assert.equal(mensajeDeError(errorHttp(0, 'conexion.error')), MENSAJES.conexion);
        assert.equal(mensajeDeError(errorHttp(500, 'error.interno', 'SQL interno')), MENSAJES.generico);
        assert.equal(mensajeDeError(errorHttp(500), { registro: true }), MENSAJES.registroGenerico);
    });
});

describe('ControladorConsultas: búsqueda', () => {
    test('por defecto busca hoy en El Salvador y guarda en memoria con la asignación y el rango', async () => {
        const { controlador, llamadas, memoria } = preparar();
        await controlador.iniciar(sesionCon());
        assert.deepEqual(llamadas.dashboard, [{ desde: '2026-11-13', hasta: '2026-11-13' }]);
        assert.equal(controlador.estado.consultas.length, 2);
        assert.deepEqual(controlador.estado.consultado, { desde: '2026-11-13', hasta: '2026-11-13' });
        const clave = MemoriaVistas.clave(sesionCon(), `dashboard.consultas:${UUID(900)}:2026-11-13:2026-11-13`);
        assert.equal(memoria.leer(clave).consultas.length, 2);
    });

    test('un rango de 32 días, invertido o inválido no se envía', async () => {
        const { controlador, llamadas } = preparar();
        await controlador.iniciar(sesionCon());
        for (const [desde, hasta, mensaje] of [['2026-11-01', '2026-12-02', MENSAJES.rangoExcedido],
            ['2026-11-14', '2026-11-13', MENSAJES.rangoInvertido], ['2026-11-31', '2026-12-01', MENSAJES.fechaInvalida]]) {
            controlador.cambiarFechas(desde, hasta);
            assert.equal(controlador.estado.errorRango, mensaje);
            await controlador.buscar();
        }
        assert.equal(llamadas.dashboard.length, 1, 'solo la búsqueda inicial');
        controlador.cambiarFechas('2026-11-01', '2026-12-01');
        assert.equal(controlador.estado.errorRango, null);
        await controlador.buscar();
        assert.deepEqual(llamadas.dashboard[1], { desde: '2026-11-01', hasta: '2026-12-01' });
    });

    test('un 400 del backend se muestra con su mensaje y vacía la lista', async () => {
        const { controlador } = preparar({ dashboard: async () => { throw errorHttp(400, 'dashboard.rangoExcedido'); } });
        await controlador.iniciar(sesionCon());
        assert.equal(controlador.estado.error, MENSAJES.rangoExcedido);
        assert.deepEqual(controlador.estado.consultas, []);
        assert.equal(controlador.estado.consultado, null);
    });

    test('una búsqueda vieja que llega tarde no pisa la nueva', async () => {
        let soltar;
        let n = 0;
        const { controlador } = preparar({ dashboard: () => (++n === 1 ? new Promise(r => { soltar = () => r([consulta(9)]); }) : Promise.resolve([consulta(1)])) });
        const primera = controlador.iniciar(sesionCon());
        await controlador.buscar();
        soltar();
        await primera;
        assert.deepEqual(controlador.estado.consultas.map(c => c.idConsulta), [UUID(1)]);
    });

    test('hoy() vuelve a la fecha de hoy y busca', async () => {
        const { controlador, llamadas } = preparar();
        await controlador.iniciar(sesionCon());
        controlador.cambiarFechas('2026-10-01', '2026-10-05');
        await controlador.hoy();
        assert.deepEqual(llamadas.dashboard.at(-1), { desde: '2026-11-13', hasta: '2026-11-13' });
    });

    test('cambiarSesion vacía la lista y vuelve a buscar; la misma asignación no hace nada', async () => {
        const { controlador, llamadas } = preparar();
        await controlador.iniciar(sesionCon());
        await controlador.cambiarSesion(sesionCon());
        assert.equal(llamadas.dashboard.length, 1);
        const otra = sesionCon(UUID(901));
        const busqueda = controlador.cambiarSesion(otra);
        assert.deepEqual(controlador.estado.consultas, [], 'se vacía antes de la respuesta');
        await busqueda;
        assert.equal(llamadas.dashboard.length, 2);
        assert.equal(controlador.estado.sesion, otra);
    });

    test('una búsqueda exitosa llega en un lote con consultas, cargando y actualizadoEn', async () => {
        const { controlador, lotes } = preparar();
        await controlador.iniciar(sesionCon());
        await asentar();
        assert.ok(lotes.some(l => ['actualizadoEn', 'cargando', 'consultado', 'consultas'].every(k => l.includes(k))));
    });
});

describe('ControladorConsultas: registro de un paso', () => {
    const ID = UUID(101); // paso(1): tieneValor

    test('lo pide una sola vez aunque haya doble clic o se cierre y se reabra', async () => {
        const { controlador, llamadas } = preparar();
        await controlador.iniciar(sesionCon());
        const a = controlador.alternarRegistro(ID);
        const b = controlador.alternarRegistro(ID); // segundo clic mientras carga: cierra, pero no cancela ni repite
        await Promise.all([a, b]);
        assert.equal(controlador.estado.valores[ID].valor, 'Registro de prueba');
        assert.equal(controlador.estado.valores[ID].abierto, false);
        await controlador.alternarRegistro(ID);
        assert.equal(controlador.estado.valores[ID].abierto, true);
        await controlador.alternarRegistro(ID);
        assert.equal(controlador.estado.valores[ID].abierto, false);
        await controlador.alternarRegistro(ID);
        assert.deepEqual(llamadas.valorPaso, [ID], 'una sola petición en total');
    });

    test('un paso sin valor registrado o desconocido no pide nada', async () => {
        const { controlador, llamadas } = preparar();
        await controlador.iniciar(sesionCon());
        await controlador.alternarRegistro(UUID(102));
        await controlador.alternarRegistro(UUID(999));
        assert.deepEqual(llamadas.valorPaso, []);
    });

    test('un 404 queda como error del paso y cargarRegistro reintenta', async () => {
        let falla = true;
        const { controlador, llamadas } = preparar({ valorPaso: async () => { if (falla) throw errorHttp(404, 'consulta.pasoNoExiste'); return { valor: 'ok' }; } });
        await controlador.iniciar(sesionCon());
        await controlador.alternarRegistro(ID);
        assert.equal(controlador.estado.valores[ID].error, MENSAJES.pasoNoExiste);
        falla = false;
        await controlador.cargarRegistro(ID);
        assert.equal(controlador.estado.valores[ID].valor, 'ok');
        assert.equal(controlador.estado.valores[ID].error, null);
        assert.equal(llamadas.valorPaso.length, 2);
    });

    test('un valor null se guarda como null (la vista dice "Sin valor registrado")', async () => {
        const { controlador } = preparar({ valorPaso: async () => ({ valor: null }) });
        await controlador.iniciar(sesionCon());
        await controlador.alternarRegistro(ID);
        assert.equal(controlador.estado.valores[ID].valor, null);
        assert.equal(controlador.estado.valores[ID].cargado, true);
    });

    test('sin red usa el registro guardado; si no hay, avisa', async () => {
        const memoria = new MemoriaVistas();
        const uno = preparar({ memoria });
        await uno.controlador.iniciar(sesionCon());
        await uno.controlador.alternarRegistro(ID);
        const dos = preparar({ memoria, enLinea: false });
        await dos.controlador.iniciar(sesionCon());
        await dos.controlador.alternarRegistro(ID);
        assert.equal(dos.controlador.estado.valores[ID].valor, 'Registro de prueba');
        assert.deepEqual(dos.llamadas.valorPaso, []);
        const tres = preparar({ memoria: new MemoriaVistas(), dashboard: async () => [consulta(1)] });
        await tres.controlador.iniciar(sesionCon());
        tres.conexion.emitir(false);
        await tres.controlador.alternarRegistro(ID);
        assert.equal(tres.controlador.estado.valores[ID].error, MENSAJES.sinRedRegistro);
    });

    test('una nueva búsqueda conserva los registros de pasos que siguen en la lista', async () => {
        const { controlador } = preparar();
        await controlador.iniciar(sesionCon());
        await controlador.alternarRegistro(ID);
        await controlador.buscar();
        assert.equal(controlador.estado.valores[ID].abierto, true);
    });
});

describe('ControladorConsultas: atender', () => {
    test('publica la ruta solo si se puede atender, con un objeto nuevo cada vez', async () => {
        const { controlador } = preparar({ dashboard: async () => [consulta(1), consulta(2, { fechaFin: '2026-11-13T10:00:00-06:00' })] });
        await controlador.iniciar(sesionCon());
        assert.equal(controlador.atender(UUID(2)), false);
        assert.equal(controlador.estado.navegarA, null);
        assert.equal(controlador.atender(UUID(1)), true);
        const primera = controlador.estado.navegarA;
        assert.deepEqual(primera, { ruta: `/consulta/${UUID(1)}` });
        controlador.atender(UUID(1));
        assert.notEqual(controlador.estado.navegarA, primera, 'otro objeto: la vista vuelve a navegar');
        assert.equal(controlador.atender(UUID(99)), false);
    });

    test('el rol activo no decide: Atención al público atiende lo que es pendiente para ella (Marta, SA-6)', async () => {
        const { controlador } = preparar();
        const marta = sesionCon();
        marta.rolActivo.codigo = 'ADMINISTRACION';
        await controlador.iniciar(marta);
        assert.deepEqual(controlador.contextoAtender(), { enLinea: true, soloLectura: false });
        assert.equal(controlador.atender(UUID(1)), true);
    });

    test('sin red no se puede atender', async () => {
        const { controlador, conexion } = preparar();
        await controlador.iniciar(sesionCon());
        conexion.emitir(false);
        assert.equal(controlador.atender(UUID(1)), false);
    });
});

describe('ControladorConsultas: sin conexión', () => {
    async function memoriaConDatos() {
        const memoria = new MemoriaVistas();
        const { controlador } = preparar({ memoria });
        await controlador.iniciar(sesionCon());
        controlador.detener();
        return memoria;
    }

    test('con memoria del mismo rango la muestra con su hora y sin pedir nada', async () => {
        const memoria = await memoriaConDatos();
        const { controlador, llamadas } = preparar({ memoria, enLinea: false });
        await controlador.iniciar(sesionCon());
        assert.deepEqual(llamadas.dashboard, []);
        assert.equal(controlador.estado.desdeMemoria, true);
        assert.equal(controlador.estado.consultas.length, 2);
        assert.ok(controlador.estado.actualizadoEn instanceof Date);
    });

    test('sin memoria muestra el error; la memoria de otra asignación no se usa', async () => {
        const memoria = await memoriaConDatos();
        const { controlador } = preparar({ memoria, enLinea: false });
        await controlador.iniciar(sesionCon(UUID(901)));
        assert.equal(controlador.estado.error, MENSAJES.sinRed);
        assert.deepEqual(controlador.estado.consultas, []);
    });

    test('si la petición falla por red y hay memoria, se queda con lo guardado', async () => {
        const memoria = await memoriaConDatos();
        const { controlador } = preparar({ memoria, dashboard: async () => { throw errorHttp(0, 'conexion.error'); } });
        await controlador.iniciar(sesionCon());
        assert.equal(controlador.estado.desdeMemoria, true);
        assert.equal(controlador.estado.error, null);
    });

    test('al volver la red vuelve a buscar', async () => {
        const memoria = await memoriaConDatos();
        const { controlador, llamadas, conexion } = preparar({ memoria, enLinea: false });
        await controlador.iniciar(sesionCon());
        conexion.emitir(true);
        await asentar();
        assert.equal(llamadas.dashboard.length, 1);
        assert.equal(controlador.estado.desdeMemoria, false);
    });

    test('detener() descarta respuestas pendientes', async () => {
        let soltar;
        const { controlador } = preparar({ dashboard: () => new Promise(r => { soltar = () => r([consulta(1)]); }) });
        const busqueda = controlador.iniciar(sesionCon());
        controlador.detener();
        soltar();
        await busqueda;
        assert.deepEqual(controlador.estado.consultas, []);
    });
});
