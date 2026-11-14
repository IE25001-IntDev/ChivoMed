import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    MENSAJES, MAX_TEXTO, mensajeDeErrorConsulta, CODIGOS_POR_ROL, pasosPendientes, elegirPasoActual,
    motivoBloqueo, puedeOfrecerRetroceso, motivoNoRetroceder, puedeCerrar, nombreDeOrden, validarOrden, servicioConsulta,
} from '../src/js/boundary/vistas/controlador_consulta.js';
import { normalizarConsultas } from '../src/js/boundary/vistas/controlador_consultas.js';
import { MemoriaVistas } from '../src/js/boundary/vistas/memoria_vistas.js';
import {
    UUID, ID_CONSULTA, ID_ROL_DOCTOR, asentar, errorHttp, paso, pendiente, procedimiento, consultaB6, sesionCon, examen, preparar,
} from './dobles/consulta.js';

// ------------------------------------------------------------------------------ funciones puras

describe('mensajeDeErrorConsulta', () => {
    test('cada 409 y 400 conocido del retroceso, el cierre y las órdenes tiene su motivo propio', () => {
        for (const code of ['consulta.retrocesoPrimerPaso', 'consulta.retrocesoConRegistros', 'consulta.retrocesoAnteriorPendiente',
            'consulta.retrocesoRamificado', 'consulta.pasoYaCompletado', 'consulta.yaCerrada', 'consulta.completeAntesCerrar',
            'consulta.ordenPasoCompletado', 'consulta.pasosPrevios', 'consulta.examenObligatorio', 'consulta.examenNoAsignable',
            'consulta.indicacionesValidas', 'consulta.pasoSinDefinicionHistorica', 'consulta.cerrarAntesRetomar']) {
            const mensaje = mensajeDeErrorConsulta(errorHttp(409, code, 'Detalle del backend'));
            assert.ok(mensaje && mensaje !== 'Detalle del backend' && mensaje !== MENSAJES.generico, code);
        }
        assert.match(mensajeDeErrorConsulta(errorHttp(409, 'consulta.retrocesoPrimerPaso')), /primer paso/);
        assert.match(mensajeDeErrorConsulta(errorHttp(409, 'consulta.retrocesoConRegistros')), /registros/);
    });
    test('procedimientoSinFinal usa el message del backend, que trae el nombre del procedimiento', () => {
        assert.equal(mensajeDeErrorConsulta(errorHttp(409, 'consulta.procedimientoSinFinal', 'El procedimiento X no ha llegado a un paso final.')),
            'El procedimiento X no ha llegado a un paso final.');
        assert.match(mensajeDeErrorConsulta(errorHttp(409, 'consulta.procedimientoSinFinal', '')), /paso final/);
    });
    test('B8: cada rechazo por rol tiene su mensaje; noResponsablePaso usa el del backend, que trae el rol', () => {
        assert.equal(mensajeDeErrorConsulta(errorHttp(403, 'consulta.noResponsablePaso', 'Este paso lo atiende el rol Enfermera.')),
            'Este paso lo atiende el rol Enfermera.');
        assert.equal(mensajeDeErrorConsulta(errorHttp(403, 'consulta.noResponsablePaso', '')), MENSAJES.otroRol);
        assert.equal(mensajeDeErrorConsulta(errorHttp(403, 'consulta.soloFinalizador', 'x')), MENSAJES.soloFinalizador);
        assert.equal(mensajeDeErrorConsulta(errorHttp(403, 'consulta.soloEmpleado', 'x')), MENSAJES.soloEmpleado);
        assert.equal(mensajeDeErrorConsulta(errorHttp(403, 'consulta.rolClinica', 'x')), MENSAJES.rolClinica);
        assert.equal(mensajeDeErrorConsulta(errorHttp(409, 'consulta.sinPasoParaRol', 'x')), MENSAJES.sinPasoParaRol);
        assert.deepEqual([...CODIGOS_POR_ROL].sort(), ['consulta.noResponsablePaso', 'consulta.rolClinica', 'consulta.sinPasoParaRol',
            'consulta.soloEmpleado', 'consulta.soloFinalizador']);
    });
    test('un 409 o 400 desconocido muestra el message del backend; sin él, el genérico', () => {
        assert.equal(mensajeDeErrorConsulta(errorHttp(409, 'otro.codigo', 'Motivo del backend.')), 'Motivo del backend.');
        assert.equal(mensajeDeErrorConsulta(errorHttp(400, 'otro.codigo', '')), MENSAJES.generico);
    });
    test('red, sesión, permiso, inexistente y 5xx', () => {
        assert.equal(mensajeDeErrorConsulta(errorHttp(0, 'conexion.error')), MENSAJES.conexion);
        assert.equal(mensajeDeErrorConsulta(errorHttp(401)), MENSAJES.sesionFinalizada);
        assert.equal(mensajeDeErrorConsulta(errorHttp(403, 'auth.permiso')), MENSAJES.sinPermiso);
        assert.equal(mensajeDeErrorConsulta(errorHttp(404)), MENSAJES.noEncontrada);
        assert.equal(mensajeDeErrorConsulta(errorHttp(500, 'x', 'NullPointerException')), MENSAJES.generico, 'no expone detalles internos');
        assert.equal(mensajeDeErrorConsulta(errorHttp(409, 'constructor', '')), MENSAJES.generico);
    });
});

describe('pasos pendientes y paso actual', () => {
    const [varios] = normalizarConsultas([consultaB6({ procedimientos: [
        procedimiento(1, [paso(1), pendiente(2, { responsable: { nombre: 'Persona', rol: 'Doctor' } })]),
        procedimiento(2, [paso(3), pendiente(4, { rolPaso: { idRol: ID_ROL_DOCTOR, nombre: 'Doctor' } })]),
    ] })]);
    const doctor = { idRol: ID_ROL_DOCTOR, nombreRol: 'Doctor' };
    test('pasosPendientes lista los PENDIENTE de todos los procedimientos con el nombre del procedimiento', () => {
        assert.deepEqual(pasosPendientes(varios).map(p => [p.paso.nombre, p.procedimiento]), [['Paso 2', 'Procedimiento 1'], ['Paso 4', 'Procedimiento 2']]);
        assert.equal(Object.isFrozen(pasosPendientes(varios)), true);
        assert.deepEqual(pasosPendientes(null), []);
    });
    test('elegirPasoActual: sin pendientes, null; con uno, ese', () => {
        const [cerrada] = normalizarConsultas([consultaB6({ procedimientos: [procedimiento(1, [paso(1)])] })]);
        assert.equal(elegirPasoActual(cerrada, doctor), null);
        const [una] = normalizarConsultas([consultaB6()]);
        assert.equal(elegirPasoActual(una, null).nombre, 'Paso 2');
    });
    test('elegirPasoActual: con varios prefiere el del rol activo por idRol; un elegido válido gana y uno inválido se ignora', () => {
        assert.equal(elegirPasoActual(varios, doctor).nombre, 'Paso 4');
        assert.equal(elegirPasoActual(varios, { nombreRol: 'Doctor' }).nombre, 'Paso 2', 'sin idRol no compara: nunca por nombre');
        assert.equal(elegirPasoActual(varios, { idRol: UUID(701) }).nombre, 'Paso 2', 'ninguno coincide: el primero');
        assert.equal(elegirPasoActual(varios, doctor, UUID(102)).nombre, 'Paso 2');
        assert.equal(elegirPasoActual(varios, doctor, UUID(101)).nombre, 'Paso 4', 'un completado no se elige');
    });
});

describe('motivos y reglas de las acciones', () => {
    const [abierta] = normalizarConsultas([consultaB6()]);
    const [cerrada] = normalizarConsultas([consultaB6({ fechaFin: '2026-11-13T10:00:00-06:00' })]);

    test('motivoBloqueo: cerrada, luego si no me toca (a quién le corresponde), luego sin red, luego sin seleccionar', () => {
        const [ajena] = normalizarConsultas([consultaB6({ pendienteParaMi: false, procedimientos: [procedimiento(1, [paso(1),
            pendiente(2, { responsable: { nombre: 'Lucía Pérez', rol: 'Enfermera' } })])] })]);
        assert.equal(motivoBloqueo({ consulta: abierta, atendiendo: true }), null);
        assert.equal(motivoBloqueo({ consulta: null }), null);
        assert.equal(motivoBloqueo({ consulta: cerrada, atendiendo: true, enLinea: false }), MENSAJES.cerrada);
        assert.equal(motivoBloqueo({ consulta: ajena, enLinea: false }), 'Le corresponde a Lucía Pérez.');
        assert.equal(motivoBloqueo({ consulta: abierta, atendiendo: true, enLinea: false }), MENSAJES.sinRed);
        assert.equal(motivoBloqueo({ consulta: abierta, atendiendo: true, soloLectura: true }), MENSAJES.sinRed);
        assert.equal(motivoBloqueo({ consulta: abierta, atendiendo: false }), MENSAJES.sinSeleccion);
        assert.equal(Object.hasOwn(MENSAJES, 'soloDoctor'), false);
    });
    test('Retroceder solo se ofrece si el paso no es el primero (nivel > 0)', () => {
        assert.equal(puedeOfrecerRetroceso({ nivel: 0 }), false);
        assert.equal(puedeOfrecerRetroceso({ nivel: 2 }), true);
        assert.equal(puedeOfrecerRetroceso(null), false);
    });
    test('motivoNoRetroceder: con órdenes o con un registro guardado; vacío, null', () => {
        assert.equal(motivoNoRetroceder({ ordenes: [{ idOrdenExamen: UUID(1) }] }), MENSAJES.retrocesoConOrdenes);
        assert.equal(motivoNoRetroceder({ valorGuardado: 'texto' }), MENSAJES.retrocesoConRegistro);
        assert.equal(motivoNoRetroceder({ valorGuardado: '  ' }), null);
        assert.equal(motivoNoRetroceder(), null);
    });
    test('puedeCerrar: abierta, con procedimientos y sin pendientes', () => {
        const [lista] = normalizarConsultas([consultaB6({ procedimientos: [procedimiento(1, [paso(1), paso(2, { nivel: 1 })])] })]);
        const [vacia] = normalizarConsultas([consultaB6({ procedimientos: [] })]);
        assert.equal(puedeCerrar(abierta), false);
        assert.equal(puedeCerrar(lista), true);
        assert.equal(puedeCerrar(vacia), false);
        assert.equal(puedeCerrar(normalizarConsultas([consultaB6({ fechaFin: '2026-11-13T10:00:00-06:00', procedimientos: [procedimiento(1, [paso(1)])] })])[0]), false);
    });
    test('nombreDeOrden: el nombre si está en la lista; si no, "Examen ya no disponible"; sin examen, su texto', () => {
        const asignables = [examen(1)];
        assert.equal(nombreDeOrden({ idExamen: UUID(301) }, asignables), 'Examen 1');
        assert.equal(nombreDeOrden({ idExamen: UUID(399) }, asignables), 'Examen ya no disponible');
        assert.equal(nombreDeOrden({ idExamen: null }, asignables), 'Orden sin examen asociado');
    });
    test('validarOrden: examen de la lista obligatorio; indicaciones opcionales hasta 255', () => {
        const asignables = [examen(1)];
        assert.equal(validarOrden({ idExamen: UUID(301) }, asignables), null);
        assert.equal(validarOrden({ idExamen: UUID(301), indicaciones: '' }, asignables), null);
        assert.equal(validarOrden({ idExamen: '' }, asignables), MENSAJES.examenRequerido);
        assert.equal(validarOrden({ idExamen: UUID(399) }, asignables), MENSAJES.examenRequerido);
        assert.equal(validarOrden({ idExamen: UUID(301), indicaciones: 'x'.repeat(MAX_TEXTO) }, asignables), null);
        assert.match(validarOrden({ idExamen: UUID(301), indicaciones: 'x'.repeat(MAX_TEXTO + 1) }, asignables), /255/);
    });
});

describe('servicioConsulta', () => {
    test('adapta cada operación al servicio REST que le corresponde', async () => {
        const hechas = [];
        const espia = nombre => (...args) => { hechas.push([nombre, ...args]); return { listar: () => hechas.push(['listar']) }; };
        const s = servicioConsulta({
            atencion: { contexto: espia('contexto'), consulta: espia('consulta') },
            consultas: { retomar: espia('retomar'), cerrar: espia('cerrar') },
            pasos: { buscarPorId: espia('paso'), ordenesExamen: espia('ordenesExamen'), examenesAsignables: espia('asignables'),
                completar: espia('completar'), retroceder: espia('retroceder'), ordenar: espia('ordenar') },
            definiciones: { buscarPorId: espia('definicion') },
        });
        s.retomar('c'); s.contexto(); s.consulta('c'); s.paso('p'); s.definicion('d'); s.ordenes('p'); s.asignables('p');
        s.completar('p', 'v'); s.retroceder('p'); s.ordenar('p', { idExamen: 'e' }); s.cerrar('c', { observaciones: 'o' });
        assert.deepEqual(hechas, [['retomar', 'c'], ['contexto'], ['consulta', 'c'], ['paso', 'p'], ['definicion', 'd'],
            ['ordenesExamen', 'p'], ['listar'], ['asignables', 'p'], ['completar', 'p', 'v'], ['retroceder', 'p'],
            ['ordenar', 'p', { idExamen: 'e' }], ['cerrar', 'c', { observaciones: 'o' }]]);
    });
});

// ------------------------------------------------------------------------------ carga

describe('ControladorConsulta: carga', () => {
    test('si le toca: lee la consulta, la selecciona, pide paso, órdenes y asignables, y luego la definición: 6 peticiones', async () => {
        const { controlador, nombres, llamadas, iniciar } = preparar();
        await iniciar();
        assert.deepEqual(nombres(), ['consulta', 'retomar', 'paso', 'ordenes', 'asignables', 'definicion']);
        assert.deepEqual(llamadas[1], ['retomar', ID_CONSULTA]);
        assert.equal(controlador.estado.atendiendo, true);
        assert.deepEqual(llamadas.slice(2, 5).map(l => l[1]), [UUID(102), UUID(102), UUID(102)], 'los datos son del paso PENDIENTE');
        assert.deepEqual(llamadas[5], ['definicion', UUID(400)]);
        const { estado } = controlador;
        assert.equal(estado.cargando, false);
        assert.equal(estado.error, null);
        assert.equal(estado.consulta.paciente.nombre, 'Paciente De Prueba');
        assert.equal(controlador.pasoActual.idConsultaProcedimientoPaso, UUID(102));
        assert.equal(estado.detalle.indicaFin, false);
        assert.deepEqual(estado.detalle.asignables.map(e => e.nombre), ['Examen 1', 'Examen 2']);
        assert.equal(controlador.bloqueo, null);
        assert.equal(Object.isFrozen(estado.detalle) && Object.isFrozen(estado.consulta), true);
    });

    test('sin N+1: con cinco procedimientos se hacen las mismas peticiones que con uno', async () => {
        const procs = [1, 2, 3, 4, 5].map(n => procedimiento(n, [paso(n * 10), pendiente(n * 10 + 1)]));
        const { nombres, iniciar } = preparar({ respuestas: { consulta: () => consultaB6({ procedimientos: procs }) } });
        await iniciar();
        assert.equal(nombres().length, 6);
    });

    test('una consulta cerrada se muestra en solo lectura, sin seleccionarla ni pedir datos del paso', async () => {
        const { controlador, nombres, iniciar } = preparar({ respuestas: {
            consulta: () => consultaB6({ fechaFin: '2026-11-13T10:00:00-06:00', procedimientos: [procedimiento(1, [paso(1)])] }),
        } });
        await iniciar();
        assert.deepEqual(nombres(), ['consulta']);
        assert.equal(controlador.estado.error, null);
        assert.equal(controlador.bloqueo, MENSAJES.cerrada);
    });

    test('si se cerró entre la lectura y la selección (409 yaCerrada), se vuelve a leer y queda en solo lectura', async () => {
        let lecturas = 0;
        const { controlador, nombres, iniciar } = preparar({ respuestas: {
            retomar: errorHttp(409, 'consulta.yaCerrada'),
            consulta: () => (++lecturas === 1 ? consultaB6()
                : consultaB6({ fechaFin: '2026-11-13T10:00:00-06:00', procedimientos: [procedimiento(1, [paso(1)])] })),
        } });
        await iniciar();
        assert.deepEqual(nombres(), ['consulta', 'retomar', 'consulta']);
        assert.equal(controlador.estado.error, null);
        assert.equal(controlador.bloqueo, MENSAJES.cerrada);
    });

    for (const [status, code] of [[409, 'consulta.sinPasoParaRol'], [403, 'consulta.noResponsablePaso'], [403, 'consulta.soloFinalizador'],
        [403, 'consulta.soloEmpleado'], [403, 'consulta.rolClinica']]) {
        test(`${status} ${code} al seleccionarla: se vuelve a leer y queda en solo lectura con su mensaje`, async () => {
            let lecturas = 0;
            const { controlador, nombres, iniciar } = preparar({ respuestas: {
                retomar: errorHttp(status, code, 'Motivo del backend.'),
                consulta: () => consultaB6({ pendienteParaMi: ++lecturas === 1 }),
            } });
            await iniciar();
            assert.deepEqual(nombres(), ['consulta', 'retomar', 'consulta'], 'sin datos clínicos del paso');
            assert.equal(controlador.estado.error, null);
            assert.equal(controlador.estado.atendiendo, false);
            assert.equal(controlador.estado.aviso, mensajeDeErrorConsulta(errorHttp(status, code, 'Motivo del backend.')));
            assert.equal(controlador.bloqueo, 'Le corresponde a Persona Responsable.');
        });
    }

    test('409 cerrarAntesRetomar: muestra el motivo y ofrece la consulta en curso', async () => {
        const { controlador, nombres, iniciar } = preparar({ respuestas: {
            retomar: errorHttp(409, 'consulta.cerrarAntesRetomar', 'Cierre la consulta en curso antes de retomar otra.'),
            contexto: () => ({ idPersonaRol: UUID(900), idConsulta: UUID(2) }),
        } });
        await iniciar();
        assert.deepEqual(nombres(), ['consulta', 'retomar', 'contexto']);
        assert.equal(controlador.estado.error, MENSAJES.enCurso);
        assert.equal(controlador.estado.enCurso, UUID(2));
        assert.equal(controlador.estado.consulta, null);
    });

    test('403, 404 o una consulta distinta en la respuesta: un mensaje y nada que mostrar', async () => {
        for (const [respuestas, mensaje] of [
            [{ retomar: errorHttp(403, 'auth.permiso') }, MENSAJES.sinPermiso],
            [{ consulta: errorHttp(404, 'recurso.noExiste') }, MENSAJES.noEncontrada],
            [{ consulta: () => consultaB6({ idConsulta: UUID(9) }) }, MENSAJES.noEncontrada],
            [{ consulta: () => null }, MENSAJES.noEncontrada],
        ]) {
            const { controlador, iniciar } = preparar({ respuestas });
            await iniciar();
            assert.equal(controlador.estado.error, mensaje);
            assert.equal(controlador.estado.consulta, null);
        }
    });

    test('si no le toca (Carlos en el Triaje de Lucía): no la selecciona ni pide datos clínicos del paso; solo lectura', async () => {
        const { controlador, nombres, iniciar } = preparar({ respuestas: { consulta: () => consultaB6({ pendienteParaMi: false,
            procedimientos: [procedimiento(1, [paso(1), pendiente(2, { responsable: { nombre: 'Lucía Pérez', rol: 'Enfermera' } })])] }) } });
        await iniciar();
        assert.deepEqual(nombres(), ['consulta']);
        assert.equal(controlador.estado.atendiendo, false);
        assert.equal(controlador.bloqueo, 'Le corresponde a Lucía Pérez.');
        assert.equal(controlador.estado.detalle.idPaso, null);
        assert.equal(controlador.pasoActual.idConsultaProcedimientoPaso, UUID(102), 'igual se señala el paso actual');
    });

    test('un paso reabierto precarga su valor en el borrador y avisa; uno sin valor empieza vacío', async () => {
        const reabierto = preparar({ respuestas: { paso: id => ({ idConsultaProcedimientoPaso: id, valor: 'Registro anterior', idProcedimientoPaso: UUID(400) }) } });
        await reabierto.iniciar();
        assert.equal(reabierto.controlador.estado.borrador, 'Registro anterior');
        assert.equal(reabierto.controlador.estado.detalle.valorGuardado, 'Registro anterior');
        assert.equal(reabierto.controlador.estado.aviso, MENSAJES.reabierto);
        const nuevo = preparar();
        await nuevo.iniciar();
        assert.equal(nuevo.controlador.estado.borrador, '');
        assert.equal(nuevo.controlador.estado.aviso, null);
    });

    test('el borrador sobrevive a salir y volver a la vista en la misma sesión', async () => {
        const memoria = new MemoriaVistas();
        const uno = preparar({ memoria });
        await uno.iniciar();
        uno.controlador.cambiarBorrador('Escrito a medias');
        uno.controlador.detener();
        const dos = preparar({ memoria });
        await dos.iniciar();
        assert.equal(dos.controlador.estado.borrador, 'Escrito a medias');
    });

    test('un error en los datos del paso se informa sin perder la consulta y se puede reintentar', async () => {
        let falla = true;
        const { controlador, iniciar } = preparar({ respuestas: { ordenes: () => (falla ? errorHttp(500) : []) } });
        await iniciar();
        assert.equal(controlador.estado.consulta.idConsulta, ID_CONSULTA);
        assert.equal(controlador.estado.detalle.error, MENSAJES.detalle);
        falla = false;
        await controlador.reintentarDetalle();
        assert.equal(controlador.estado.detalle.error, null);
        assert.equal(controlador.estado.detalle.indicaFin, false);
    });

    test('con varios pendientes empieza en el del rol activo y el selector cambia de paso pidiendo sus datos', async () => {
        const { controlador, llamadas, iniciar } = preparar({ sesion: sesionCon('DOCTOR', 1, ID_ROL_DOCTOR), respuestas: { consulta: () => consultaB6({ procedimientos: [
            procedimiento(1, [pendiente(2, { nivel: 0, responsable: { nombre: 'Persona', rol: 'Doctor' } })]),
            procedimiento(2, [pendiente(4, { nivel: 0, rolPaso: { idRol: ID_ROL_DOCTOR, nombre: 'Doctor' } })]),
        ] }) } });
        await iniciar();
        assert.equal(controlador.pasoActual.idConsultaProcedimientoPaso, UUID(104));
        assert.equal(controlador.pendientes.length, 2);
        await controlador.elegirPaso(UUID(102));
        assert.equal(controlador.pasoActual.idConsultaProcedimientoPaso, UUID(102));
        assert.equal(controlador.estado.detalle.idPaso, UUID(102));
        assert.deepEqual(llamadas.filter(l => l[0] === 'paso').map(l => l[1]), [UUID(104), UUID(102)]);
        const antes = llamadas.length;
        await controlador.elegirPaso(UUID(999));
        assert.equal(llamadas.length, antes, 'un paso que no está pendiente no se elige');
    });

    test('una carga del paso que quedó obsoleta no pisa la del paso elegido después', async () => {
        const liberar = {};
        const { controlador, iniciar } = preparar({ sesion: sesionCon('DOCTOR', 1, ID_ROL_DOCTOR), respuestas: {
            consulta: () => consultaB6({ procedimientos: [
                procedimiento(1, [pendiente(2, { nivel: 0, responsable: { nombre: 'Persona', rol: 'Doctor' } })]),
                procedimiento(2, [pendiente(4, { nivel: 0, rolPaso: { idRol: ID_ROL_DOCTOR, nombre: 'Doctor' } })]),
            ] }),
            asignables: id => (id === UUID(102) ? new Promise(r => { liberar.lento = () => r([examen(9)]); }) : [examen(1)]),
        } });
        await iniciar();
        assert.equal(controlador.estado.detalle.idPaso, UUID(104), 'empieza en el paso del rol activo');
        const lento = controlador.elegirPaso(UUID(102));
        await asentar();
        const rapido = controlador.elegirPaso(UUID(104));
        await rapido;
        liberar.lento();
        await lento;
        assert.equal(controlador.estado.detalle.idPaso, UUID(104));
        assert.deepEqual(controlador.estado.detalle.asignables.map(e => e.nombre), ['Examen 1']);
    });
});

describe('ControladorConsulta: sin conexión', () => {
    test('sin red y sin datos en memoria no llama al backend y pide conexión', async () => {
        const { controlador, nombres, iniciar } = preparar({ enLinea: false });
        await iniciar();
        assert.deepEqual(nombres(), []);
        assert.equal(controlador.estado.error, MENSAJES.sinRedCarga);
    });

    test('sin red o en solo lectura muestra lo guardado, con el borrador, y bloquea las acciones', async () => {
        const memoria = new MemoriaVistas();
        const antes = preparar({ memoria });
        await antes.iniciar();
        antes.controlador.cambiarBorrador('Borrador guardado');
        antes.controlador.detener();
        for (const opciones of [{ enLinea: false }, { soloLectura: true }]) {
            const { controlador, nombres, iniciar } = preparar({ memoria, ...opciones });
            await iniciar();
            assert.deepEqual(nombres(), []);
            assert.equal(controlador.estado.desdeMemoria, true);
            assert.equal(controlador.estado.consulta.idConsulta, ID_CONSULTA);
            assert.equal(controlador.estado.detalle.idPaso, UUID(102));
            assert.equal(controlador.estado.borrador, 'Borrador guardado');
            assert.ok(controlador.estado.actualizadoEn instanceof Date);
            assert.equal(controlador.bloqueo, MENSAJES.sinRed);
        }
    });

    test('si la red se cae durante la carga, muestra lo guardado en lugar del error', async () => {
        const memoria = new MemoriaVistas();
        await preparar({ memoria }).iniciar();
        const { controlador, iniciar } = preparar({ memoria, respuestas: { consulta: errorHttp(0, 'conexion.error') } });
        await iniciar();
        assert.equal(controlador.estado.desdeMemoria, true);
        assert.equal(controlador.estado.error, null);
    });

    test('al perder la red con la vista abierta, todo queda bloqueado; al volver tras un error, recarga', async () => {
        let falla = true;
        const { controlador, conexion, nombres, iniciar } = preparar({ respuestas: { consulta: () => (falla ? errorHttp(503) : consultaB6()) } });
        await iniciar();
        assert.equal(controlador.estado.error, MENSAJES.generico);
        conexion.emitir(false);
        assert.equal(controlador.estado.enLinea, false);
        falla = false;
        conexion.emitir(true);
        await asentar(); await asentar();
        assert.equal(controlador.estado.error, null);
        // La primera carga falló al leer, antes de seleccionarla: solo la segunda la selecciona.
        assert.equal(nombres().filter(n => n === 'retomar').length, 1);
        conexion.emitir(false);
        assert.equal(controlador.bloqueo, MENSAJES.sinRed);
        assert.equal(controlador.estado.consulta.idConsulta, ID_CONSULTA, 'lo cargado sigue a la vista');
    });

    test('lo guardado por un usuario no se muestra a otro', async () => {
        const memoria = new MemoriaVistas();
        memoria.recordarSesion(sesionCon('DOCTOR', 1));
        await preparar({ memoria, sesion: sesionCon('DOCTOR', 1) }).iniciar();
        memoria.recordarSesion(sesionCon('DOCTOR', 2));
        const { controlador, iniciar } = preparar({ memoria, sesion: sesionCon('DOCTOR', 2), enLinea: false });
        await iniciar();
        assert.equal(controlador.estado.consulta, null);
        assert.equal(controlador.estado.error, MENSAJES.sinRedCarga);
    });

    test('detener() cancela la suscripción a la red y descarta respuestas pendientes', async () => {
        let liberar;
        const { controlador, conexion, iniciar } = preparar({ respuestas: { consulta: () => new Promise(r => { liberar = () => r(consultaB6()); }) } });
        const carga = iniciar();
        await asentar();
        controlador.detener();
        liberar();
        await carga;
        assert.equal(controlador.estado.consulta, null);
        conexion.emitir(false);
        assert.equal(controlador.estado.enLinea, true, 'ya no escucha la red');
    });
});
