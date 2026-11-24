import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { MENSAJES, MAX_TEXTO, textoSeleccion } from '../src/js/boundary/vistas/controlador_consulta.js';
import { MemoriaVistas } from '../src/js/boundary/vistas/memoria_vistas.js';
import {
    UUID, ID_CONSULTA, asentar, errorHttp, paso, pendiente, procedimiento, consultaB6, sesionCon, examen, preparar,
} from './dobles/consulta.js';
import { conexionConServidor, detenerConexiones } from './dobles/conexion_servidor.js';

/** Consulta con un estado que cambia como en el backend: avanzar crea el paso 3, retroceder lo borra. */
function flujo({ respuestas = {}, ...opciones } = {}) {
    const servidor = { pasos: [paso(1), pendiente(2)], fechaFin: null, valores: {} };
    const consulta = () => consultaB6({ fechaFin: servidor.fechaFin, procedimientos: [procedimiento(1, servidor.pasos)] });
    const base = preparar({
        ...opciones,
        respuestas: {
            consulta,
            paso: id => ({ idConsultaProcedimientoPaso: id, valor: servidor.valores[id] ?? null, idProcedimientoPaso: UUID(400) }),
            completar: (id, valor) => {
                servidor.valores[id] = valor;
                servidor.pasos = servidor.pasos.map(p => (p.idConsultaProcedimientoPaso === id ? { ...p, estado: 'COMPLETADO', fechaFin: '2026-11-13T09:00:00-06:00' } : p));
                if (id === UUID(102)) servidor.pasos = [...servidor.pasos, pendiente(3, { nivel: 2 })];
                return { idConsultaProcedimientoPaso: id, estado: 'COMPLETADO' };
            },
            retroceder: id => {
                servidor.pasos = servidor.pasos.filter(p => p.idConsultaProcedimientoPaso !== id)
                    .map(p => (p.idConsultaProcedimientoPaso === UUID(102) ? { ...p, estado: 'PENDIENTE', fechaFin: null } : p));
                return { idConsultaProcedimientoPaso: UUID(102), estado: 'PENDIENTE', valor: servidor.valores[UUID(102)] ?? null };
            },
            cerrar: () => { servidor.fechaFin = '2026-11-13T10:00:00-06:00'; return { idConsulta: ID_CONSULTA }; },
            ...respuestas,
        },
    });
    return { ...base, servidor };
}

describe('ControladorConsulta: avanzar', () => {
    test('manda el borrador recortado, recarga, elige el paso nuevo y limpia el borrador', async () => {
        const { controlador, llamadas, iniciar, memoria } = flujo();
        await iniciar();
        controlador.cambiarBorrador('  Atención brindada  ');
        assert.equal(await controlador.avanzar(), true);
        assert.deepEqual(llamadas.find(l => l[0] === 'completar'), ['completar', UUID(102), 'Atención brindada']);
        assert.equal(controlador.pasoActual.idConsultaProcedimientoPaso, UUID(103));
        assert.equal(controlador.estado.detalle.idPaso, UUID(103));
        assert.equal(controlador.estado.borrador, '');
        assert.equal(controlador.estado.accion, null);
        assert.deepEqual(controlador.estado.acabado, { accion: 'avanzar', ok: true });
        assert.equal(memoria.leer(`${UUID(801)}:consulta.borrador:${UUID(102)}`), null, 'el borrador del paso completado se olvida');
    });

    test('un borrador vacío se envía como null: nunca se inventa un valor', async () => {
        const { controlador, llamadas, iniciar } = flujo();
        await iniciar();
        controlador.cambiarBorrador('   ');
        await controlador.avanzar();
        assert.deepEqual(llamadas.find(l => l[0] === 'completar'), ['completar', UUID(102), null]);
    });

    test('un doble clic hace una sola petición', async () => {
        const { controlador, nombres, iniciar } = flujo();
        await iniciar();
        const [a, b] = [controlador.avanzar(), controlador.avanzar()];
        assert.deepEqual(await Promise.all([a, b]), [true, false]);
        assert.equal(nombres().filter(n => n === 'completar').length, 1);
    });

    test('un error conserva el borrador y deja el motivo; pasosPrevios es un 400 con su texto', async () => {
        const { controlador, iniciar } = flujo({ respuestas: { completar: errorHttp(400, 'consulta.pasosPrevios', 'x') } });
        await iniciar();
        controlador.cambiarBorrador('No se pierde');
        assert.equal(await controlador.avanzar(), false);
        assert.equal(controlador.estado.errorAccion, 'Completa primero los pasos anteriores.');
        assert.equal(controlador.estado.borrador, 'No se pierde');
        assert.deepEqual(controlador.estado.acabado, { accion: 'avanzar', ok: false });
    });

    test('409 pasoYaCompletado: avisa y recarga para mostrar el estado real', async () => {
        const { controlador, nombres, iniciar } = flujo({ respuestas: { completar: errorHttp(409, 'consulta.pasoYaCompletado') } });
        await iniciar();
        const antes = nombres().filter(n => n === 'consulta').length;
        await controlador.avanzar();
        assert.match(controlador.estado.errorAccion, /ya estaba completado/);
        assert.equal(nombres().filter(n => n === 'consulta').length, antes + 1);
    });

    test('bloqueado sin red, con otro rol o mientras carga el paso: no llama al backend', async () => {
        const sinRed = flujo();
        await sinRed.iniciar();
        sinRed.conexion.emitir(false);
        assert.equal(sinRed.controlador.motivoNoActuar, MENSAJES.sinRed);
        assert.equal(await sinRed.controlador.avanzar(), false);
        // El paso pendiente es de otro rol (pendienteParaMi false): solo lectura con a quién le corresponde.
        const ajena = flujo({ respuestas: { consulta: () => consultaB6({ pendienteParaMi: false }) } });
        await ajena.iniciar();
        assert.equal(ajena.controlador.motivoNoActuar, 'Le corresponde a Persona Responsable.');
        assert.equal(await ajena.controlador.avanzar(), false);
        for (const { nombres } of [sinRed, ajena]) assert.equal(nombres().includes('completar'), false);
    });

    test('un 403 noResponsablePaso al avanzar muestra el rol del backend y recarga en solo lectura', async () => {
        let mia = true;
        const { controlador, nombres, iniciar } = flujo({ respuestas: {
            consulta: () => consultaB6({ pendienteParaMi: mia }),
            completar: () => { mia = false; return errorHttp(403, 'consulta.noResponsablePaso', 'Este paso lo atiende el rol Enfermera.'); },
        } });
        await iniciar();
        controlador.cambiarBorrador('PA 120/80');
        assert.equal(await controlador.avanzar(), false);
        assert.equal(controlador.estado.errorAccion, 'Este paso lo atiende el rol Enfermera.');
        assert.equal(nombres().filter(n => n === 'consulta').length, 2, 'se volvió a leer la consulta');
        assert.equal(controlador.bloqueo, 'Le corresponde a Persona Responsable.');
        assert.equal(controlador.estado.detalle.idPaso, null, 'en solo lectura no quedan datos clínicos del paso');
    });

    test('en el último paso (indicaFin) se completa igual, y después se ofrece el cierre', async () => {
        // En el backend, completar el paso final no crea sucesores.
        let completado = false;
        const { controlador, iniciar } = flujo({ respuestas: {
            definicion: id => ({ idProcedimientoPaso: id, indicaFin: true }),
            completar: () => { completado = true; return {}; },
            consulta: () => consultaB6({ procedimientos: [procedimiento(1, completado ? [paso(1), paso(2, { nivel: 1 })] : [paso(1), pendiente(2)])] }),
        } });
        await iniciar();
        assert.equal(controlador.estado.detalle.indicaFin, true);
        controlador.cambiarBorrador('Diagnóstico final');
        assert.equal(await controlador.avanzar(), true);
        assert.equal(controlador.pasoActual, null);
        assert.equal(controlador.motivoNoActuar, MENSAJES.sinPendientes);
        assert.equal(controlador.pedirCierre(''), true);
    });
});

describe('ControladorConsulta: retroceder', () => {
    async function enPaso3(opciones) {
        const f = flujo(opciones);
        await f.iniciar();
        f.controlador.cambiarBorrador('Registro del paso 2');
        await f.controlador.avanzar();
        assert.equal(f.controlador.pasoActual.idConsultaProcedimientoPaso, UUID(103));
        return f;
    }

    test('no se ofrece en el primer paso (nivel 0)', async () => {
        const { controlador, nombres, iniciar } = flujo({ respuestas: { consulta: () => consultaB6({ procedimientos: [procedimiento(1, [pendiente(1, { nivel: 0 })])] }) } });
        await iniciar();
        assert.equal(await controlador.pedirRetroceso(), false);
        assert.equal(nombres().includes('retroceder'), false);
    });

    test('sin nada escrito retrocede directo; el paso anterior queda actual con su valor precargado y aviso', async () => {
        const { controlador, llamadas } = await enPaso3();
        assert.equal(await controlador.pedirRetroceso(), true);
        assert.deepEqual(llamadas.find(l => l[0] === 'retroceder'), ['retroceder', UUID(103), { observaciones: '', indicaciones: '' }]);
        assert.equal(controlador.pasoActual.idConsultaProcedimientoPaso, UUID(102));
        assert.equal(controlador.estado.borrador, 'Registro del paso 2');
        assert.equal(controlador.estado.aviso, MENSAJES.reabierto);
        assert.deepEqual(controlador.estado.acabado, { accion: 'retroceder', ok: true });
    });

    test('con algo escrito pide confirmar; Cancelar no llama al backend y Confirmar sí', async () => {
        const { controlador, nombres } = await enPaso3();
        controlador.cambiarBorrador('Algo escrito');
        assert.equal(await controlador.pedirRetroceso(), false);
        assert.equal(controlador.estado.confirmando, 'retroceso');
        controlador.cancelar();
        assert.equal(controlador.estado.confirmando, null);
        assert.equal(nombres().includes('retroceder'), false);
        await controlador.pedirRetroceso();
        assert.equal(await controlador.confirmar(), true);
        assert.equal(nombres().filter(n => n === 'retroceder').length, 1);
        assert.equal(controlador.estado.confirmando, null);
    });

    test('con órdenes o con un registro guardado se deshabilita con su motivo, sin llamar al backend', async () => {
        const conOrdenes = flujo({ respuestas: { ordenes: () => [{ idOrdenExamen: UUID(600), idExamen: UUID(301) }] } });
        await conOrdenes.iniciar();
        assert.equal(conOrdenes.controlador.motivoNoRetroceder, MENSAJES.retrocesoConOrdenes);
        assert.equal(await conOrdenes.controlador.pedirRetroceso(), false);
        const conValor = flujo({ respuestas: { paso: id => ({ idConsultaProcedimientoPaso: id, valor: 'Guardado', idProcedimientoPaso: UUID(400) }) } });
        await conValor.iniciar();
        assert.equal(conValor.controlador.motivoNoRetroceder, MENSAJES.retrocesoConRegistro);
        for (const { nombres } of [conOrdenes, conValor]) assert.equal(nombres().includes('retroceder'), false);
    });

    test('cada 409 del retroceso muestra su motivo y no cambia de paso', async () => {
        for (const code of ['consulta.retrocesoPrimerPaso', 'consulta.retrocesoAnteriorPendiente', 'consulta.retrocesoRamificado', 'consulta.retrocesoConRegistros']) {
            const { controlador, iniciar } = flujo({ respuestas: { retroceder: errorHttp(409, code, 'x') } });
            await iniciar();
            assert.equal(await controlador.pedirRetroceso(), false);
            assert.ok(controlador.estado.errorAccion && controlador.estado.errorAccion !== 'x', code);
            assert.equal(controlador.pasoActual.idConsultaProcedimientoPaso, UUID(102));
        }
    });
});

describe('ControladorConsulta: asignar varios exámenes (F9)', () => {
    const LAB = { idTipoExamen: UUID(501), nombre: 'Laboratorio clínico' };
    const IMG = { idTipoExamen: UUID(502), nombre: 'Imagenología' };
    const conTipos = () => [{ ...examen(1), tiposExamen: [LAB] }, { ...examen(2), tiposExamen: [IMG] }, { ...examen(3), tiposExamen: [LAB, IMG] }];

    /** Órdenes que cambian como en el backend: cada POST que sale bien agrega una. */
    function conOrdenes({ ordenar = () => null, asignables = conTipos, ...respuestas } = {}) {
        let ordenes = [];
        return flujo({ respuestas: {
            asignables, ordenes: () => ordenes,
            ordenar: async (id, datos) => {
                const fallo = await ordenar(id, datos);
                if (fallo) return fallo;
                const orden = { idOrdenExamen: UUID(600 + ordenes.length), idExamen: datos.idExamen, indicaciones: datos.indicaciones ?? null };
                ordenes = [...ordenes, orden];
                return orden;
            },
            ...respuestas,
        } });
    }
    const elegir = (controlador, ...ns) => { for (const n of ns) controlador.alternarExamen(UUID(300 + n), true); };
    const posts = llamadas => llamadas.filter(l => l[0] === 'ordenar');

    test('la selección se conserva al cambiar el filtro; "N seleccionados"', async () => {
        const { controlador, iniciar } = conOrdenes();
        await iniciar();
        elegir(controlador, 1, 2);
        controlador.elegirCategoria(IMG.idTipoExamen);
        assert.equal(controlador.estado.filtroExamenes, IMG.idTipoExamen);
        assert.deepEqual(controlador.estado.seleccionExamenes, [UUID(301), UUID(302)]);
        controlador.alternarExamen(UUID(301), false);
        assert.deepEqual(controlador.estado.seleccionExamenes, [UUID(302)]);
        assert.ok(Object.isFrozen(controlador.estado.seleccionExamenes));
        controlador.elegirCategoria(UUID(599));
        assert.equal(controlador.estado.filtroExamenes, IMG.idTipoExamen, 'una categoría que no existe se ignora');
        controlador.elegirCategoria('');
        assert.equal(controlador.estado.filtroExamenes, '');
        assert.equal(textoSeleccion(0), 'Ningún examen seleccionado');
        assert.equal(textoSeleccion(1), '1 seleccionado');
        assert.equal(textoSeleccion(3), '3 seleccionados');
    });

    test('no se puede seleccionar un examen ajeno ni uno ya ordenado en el paso', async () => {
        const { controlador, iniciar } = conOrdenes({ ordenes: () => [{ idOrdenExamen: UUID(600), idExamen: UUID(302) }] });
        await iniciar();
        controlador.alternarExamen(UUID(399), true);
        controlador.alternarExamen(UUID(302), true);
        assert.deepEqual(controlador.estado.seleccionExamenes, []);
        assert.deepEqual(controlador.examenesOrdenados, [UUID(302)]);
    });

    test('éxito: un POST por examen EN SERIE con las mismas indicaciones, una sola recarga de órdenes', async () => {
        const pendientes = [];
        const { controlador, llamadas, nombres, iniciar } = conOrdenes({
            ordenar: () => new Promise(resolve => pendientes.push(resolve)),
        });
        await iniciar();
        elegir(controlador, 3, 1);
        const antes = nombres().length;
        const asignando = controlador.asignarExamenes({ indicaciones: '  En ayunas ' });
        await asentar();
        assert.equal(posts(llamadas).length, 1, 'el segundo POST espera al primero');
        pendientes.shift()(null);
        await asentar();
        assert.equal(posts(llamadas).length, 2);
        pendientes.shift()(null);
        assert.equal(await asignando, true);
        assert.deepEqual(posts(llamadas).map(l => l[2]), [
            { idExamen: UUID(301), indicaciones: '  En ayunas ' }, { idExamen: UUID(303), indicaciones: '  En ayunas ' }],
        'en el orden de la lista; el servicio recorta las indicaciones');
        assert.deepEqual(nombres().slice(antes), ['ordenar', 'ordenar', 'ordenes']);
        assert.deepEqual(controlador.estado.resultadoExamenes, [
            { idExamen: UUID(301), nombre: 'Examen 1', ok: true, mensaje: MENSAJES.ordenEmitida },
            { idExamen: UUID(303), nombre: 'Examen 3', ok: true, mensaje: MENSAJES.ordenEmitida }]);
        assert.ok(Object.isFrozen(controlador.estado.resultadoExamenes));
        assert.deepEqual(controlador.estado.seleccionExamenes, []);
        assert.equal(controlador.estado.detalle.ordenes.length, 2);
        assert.equal(controlador.motivoNoRetroceder, MENSAJES.retrocesoConOrdenes, 'con órdenes ya no se puede retroceder');
        assert.deepEqual(controlador.estado.acabado, { accion: 'orden', ok: true });
    });

    test('éxito parcial: examenNoAsignable no corta; mensaje por examen y recarga órdenes y asignables una vez', async () => {
        let asignables = conTipos();
        const { controlador, llamadas, nombres, iniciar } = conOrdenes({
            asignables: () => asignables,
            ordenar: (id, { idExamen }) => {
                if (idExamen !== UUID(302)) return null;
                asignables = asignables.filter(e => e.idExamen !== UUID(302));
                return errorHttp(400, 'consulta.examenNoAsignable', 'x');
            },
        });
        await iniciar();
        elegir(controlador, 1, 2, 3);
        const antes = nombres().length;
        assert.equal(await controlador.asignarExamenes(), true);
        assert.equal(posts(llamadas).length, 3);
        assert.deepEqual(nombres().slice(antes).sort(), ['asignables', 'ordenar', 'ordenar', 'ordenar', 'ordenes'].sort());
        assert.deepEqual(controlador.estado.resultadoExamenes.map(r => [r.nombre, r.ok]), [['Examen 1', true], ['Examen 2', false], ['Examen 3', true]]);
        assert.match(controlador.estado.resultadoExamenes[1].mensaje, /ya no se puede asignar/);
        assert.equal(controlador.estado.errorAccion, null);
        assert.deepEqual(controlador.estado.detalle.asignables.map(e => e.nombre), ['Examen 1', 'Examen 3']);
        assert.deepEqual(controlador.estado.seleccionExamenes, [], 'el que falló ya no es asignable y se quita');
    });

    test('un fallo propio del examen que sigue asignable lo deja seleccionado para reintentar', async () => {
        const { controlador, iniciar } = conOrdenes({
            ordenar: (id, { idExamen }) => (idExamen === UUID(302) ? errorHttp(400, 'consulta.examenNoAsignable', 'x') : null),
        });
        await iniciar();
        elegir(controlador, 1, 2);
        await controlador.asignarExamenes();
        assert.deepEqual(controlador.estado.seleccionExamenes, [UUID(302)]);
    });

    test('pasoYaCompletado en el segundo corta la serie: el tercero "No se envió." y se recarga la consulta', async () => {
        const { controlador, llamadas, nombres, iniciar } = conOrdenes({
            ordenar: (id, { idExamen }) => (idExamen === UUID(302) ? errorHttp(409, 'consulta.pasoYaCompletado', 'x') : null),
        });
        await iniciar();
        elegir(controlador, 1, 2, 3);
        const antes = nombres().length;
        assert.equal(await controlador.asignarExamenes(), false);
        assert.equal(posts(llamadas).length, 2);
        assert.deepEqual(controlador.estado.resultadoExamenes.map(r => [r.nombre, r.ok, r.mensaje]), [
            ['Examen 1', true, MENSAJES.ordenEmitida],
            ['Examen 2', false, 'Este paso ya estaba completado. Actualizamos la consulta.'],
            ['Examen 3', false, MENSAJES.noEnviado]]);
        assert.equal(controlador.estado.errorAccion, 'Este paso ya estaba completado. Actualizamos la consulta.');
        assert.ok(nombres().slice(antes).includes('consulta'), 'recarga la consulta');
        assert.deepEqual(controlador.estado.acabado, { accion: 'orden', ok: false });
    });

    for (const [nombre, falla, mensaje] of [['401', errorHttp(401, 'auth.sesion'), MENSAJES.sesionFinalizada],
        ['red', errorHttp(0, 'conexion.error'), MENSAJES.conexion]]) {
        test(`un ${nombre} en el primero corta la serie y no recarga`, async () => {
            const { controlador, llamadas, nombres, iniciar } = conOrdenes({ ordenar: () => falla });
            await iniciar();
            elegir(controlador, 1, 2);
            const antes = nombres().length;
            assert.equal(await controlador.asignarExamenes(), false);
            assert.equal(posts(llamadas).length, 1);
            assert.deepEqual(nombres().slice(antes), ['ordenar']);
            assert.deepEqual(controlador.estado.resultadoExamenes.map(r => r.mensaje), [mensaje, MENSAJES.noEnviado]);
            assert.equal(controlador.estado.errorAccion, mensaje);
            assert.deepEqual(controlador.estado.seleccionExamenes, [UUID(301), UUID(302)], 'se conserva para reintentar');
        });
    }

    test('sin selección o con indicaciones de más de 255 no hay ningún POST', async () => {
        const { controlador, nombres, iniciar } = conOrdenes();
        await iniciar();
        assert.equal(await controlador.asignarExamenes(), false);
        assert.equal(controlador.estado.errorAccion, MENSAJES.seleccionVacia);
        elegir(controlador, 1);
        assert.equal(await controlador.asignarExamenes({ indicaciones: 'x'.repeat(MAX_TEXTO + 1) }), false);
        assert.match(controlador.estado.errorAccion, /255/);
        assert.equal(nombres().includes('ordenar'), false);
        assert.equal(controlador.estado.resultadoExamenes, null);
    });

    test('al cambiar de paso se reinician el filtro, la selección y el resultado', async () => {
        const { controlador, iniciar } = conOrdenes();
        await iniciar();
        elegir(controlador, 1);
        controlador.elegirCategoria(LAB.idTipoExamen);
        await controlador.asignarExamenes();
        elegir(controlador, 3);
        controlador.cambiarBorrador('Atención');
        await controlador.avanzar();
        assert.notEqual(controlador.pasoActual.idConsultaProcedimientoPaso, UUID(102));
        assert.equal(controlador.estado.filtroExamenes, '');
        assert.deepEqual(controlador.estado.seleccionExamenes, []);
        assert.equal(controlador.estado.resultadoExamenes, null);
    });

    test('si al recargar la categoría elegida ya no existe, el filtro vuelve a "Todas"', async () => {
        let asignables = conTipos();
        const { controlador, iniciar } = conOrdenes({
            asignables: () => asignables,
            ordenar: () => { asignables = [{ ...examen(1), tiposExamen: [LAB] }]; return errorHttp(400, 'consulta.examenNoAsignable', 'x'); },
        });
        await iniciar();
        controlador.elegirCategoria(IMG.idTipoExamen);
        elegir(controlador, 2);
        await controlador.asignarExamenes();
        assert.equal(controlador.estado.filtroExamenes, '');
    });
});

describe('ControladorConsulta: cierre', () => {
    const terminada = () => consultaB6({ procedimientos: [procedimiento(1, [paso(1), paso(2, { nivel: 1 })])] });

    test('solo sin pasos PENDIENTE; pide confirmar y Cancelar no llama al backend', async () => {
        const pendienteAun = flujo();
        await pendienteAun.iniciar();
        assert.equal(pendienteAun.controlador.pedirCierre(''), false);
        const { controlador, nombres, iniciar, servidor } = flujo();
        servidor.pasos = [paso(1), paso(2, { nivel: 1 })];
        await iniciar();
        assert.equal(controlador.pedirCierre('Notas'), true);
        assert.equal(controlador.estado.confirmando, 'cierre');
        controlador.cancelar();
        assert.equal(nombres().includes('cerrar'), false);
    });

    test('confirmado: manda las observaciones, recarga y queda en solo lectura con aviso', async () => {
        const { controlador, llamadas, iniciar, servidor } = flujo();
        servidor.pasos = [paso(1), paso(2, { nivel: 1 })];
        await iniciar();
        controlador.pedirCierre('  Atención finalizada ');
        assert.equal(await controlador.confirmar(), true);
        assert.deepEqual(llamadas.find(l => l[0] === 'cerrar'), ['cerrar', ID_CONSULTA, { observaciones: 'Atención finalizada' }]);
        assert.equal(controlador.estado.aviso, MENSAJES.cerradaAhora);
        assert.equal(controlador.bloqueo, MENSAJES.cerrada);
        assert.deepEqual(controlador.estado.acabado, { accion: 'cierre', ok: true });
    });

    test('sin observaciones no envía el campo (el backend conserva las existentes); más de 255 no se envía', async () => {
        const { controlador, llamadas, iniciar } = flujo({ respuestas: { consulta: terminada } });
        await iniciar();
        assert.equal(controlador.pedirCierre('x'.repeat(MAX_TEXTO + 1)), false);
        assert.match(controlador.estado.errorAccion, /255/);
        controlador.pedirCierre('   ');
        await controlador.confirmar();
        assert.deepEqual(llamadas.find(l => l[0] === 'cerrar'), ['cerrar', ID_CONSULTA, {}]);
    });

    test('los 409 del cierre muestran su motivo; procedimientoSinFinal usa el del backend', async () => {
        const { controlador, iniciar } = flujo({ respuestas: { consulta: terminada,
            cerrar: errorHttp(409, 'consulta.procedimientoSinFinal', 'El procedimiento Procedimiento 1 no ha llegado a un paso final.') } });
        await iniciar();
        controlador.pedirCierre('');
        assert.equal(await controlador.confirmar(), false);
        assert.equal(controlador.estado.errorAccion, 'El procedimiento Procedimiento 1 no ha llegado a un paso final.');
        assert.equal(controlador.bloqueo, null, 'sigue abierta');
    });
});

describe('ControladorConsulta: acciones y cambios de contexto', () => {
    test('una acción que termina después de detener() no toca el estado', async () => {
        let liberar;
        const { controlador, iniciar } = flujo({ respuestas: { completar: () => new Promise(r => { liberar = r; }) } });
        await iniciar();
        const accion = controlador.avanzar();
        await asentar();
        controlador.detener();
        liberar({});
        assert.equal(await accion, false);
        assert.equal(controlador.estado.acabado, null);
    });

    test('la memoria guarda las órdenes nuevas para mostrarlas sin red', async () => {
        const memoria = new MemoriaVistas();
        let ordenes = [];
        const { controlador, iniciar } = flujo({ memoria, respuestas: {
            ordenes: () => ordenes, ordenar: () => { ordenes = [{ idOrdenExamen: UUID(600), idExamen: UUID(301) }]; return ordenes[0]; },
        } });
        await iniciar();
        controlador.alternarExamen(UUID(301), true);
        await controlador.asignarExamenes({ indicaciones: '' });
        const guardado = memoria.leer(`${UUID(801)}:consulta:${UUID(900)}:${ID_CONSULTA}`);
        assert.equal(guardado.detalle.ordenes.length, 1);
    });
});

// Punto 3: con el servidor caído (ControladorConexion real avisado con "servidor-caido") ninguna
// acción que escribe llama al backend y cada una dice su motivo. Si el servidor se cae en medio de
// una acción, se muestra el error, no se reintenta y no queda nada en cola para cuando vuelva.
describe('ControladorConsulta: ninguna escritura sin servidor', () => {
    afterEach(() => detenerConexiones());
    const sinServidor = () => errorHttp(0, 'conexion.error', 'No se pudo conectar con GalenoSV.');
    const contar = (nombres, nombre) => nombres().filter(n => n === nombre).length;

    /** Abre la consulta con el servidor disponible; `caer()` lo marca caído. */
    async function abierta(opciones = {}) {
        const red = conexionConServidor();
        const f = flujo({ ...opciones, conexion: red.conexion });
        await f.iniciar();
        return { ...f, ...red };
    }

    /** Tras la falla, el servidor vuelve: la acción no se repite sola. */
    async function vuelveSinRepetir({ responder, nombres }, nombre) {
        assert.equal(contar(nombres, nombre), 1);
        responder();
        await asentar();
        await asentar();
        assert.equal(contar(nombres, nombre), 1, `no se reintenta ${nombre}`);
    }

    test('sesión de paso: abrir con el servidor caído no pide PUT …/sesion y explica el motivo', async () => {
        const red = conexionConServidor();
        red.caer();
        const { controlador, nombres, iniciar } = flujo({ conexion: red.conexion });
        await iniciar();
        assert.equal(nombres().includes('retomar'), false);
        assert.equal(controlador.estado.atendiendo, false);
        assert.equal(controlador.estado.error, MENSAJES.sinRedCarga);
    });

    test('sesión de paso: si el servidor cae en el PUT …/sesion, muestra el error y no lo repite mientras siga caído', async () => {
        const red = conexionConServidor();
        const { controlador, nombres, iniciar } = flujo({ conexion: red.conexion, respuestas: { retomar: () => { red.caer(); return sinServidor(); } } });
        await iniciar();
        assert.equal(controlador.estado.error, MENSAJES.conexion);
        assert.equal(controlador.estado.atendiendo, false);
        await asentar();
        assert.equal(contar(nombres, 'retomar'), 1);
        // Al volver el servidor la vista se actualiza sola (vuelve a cargar), no antes.
    });

    test('finalización (y el registro del paso): con el servidor caído no llama al backend y dice el motivo', async () => {
        const { controlador, nombres, caer } = await abierta();
        controlador.cambiarBorrador('Registro escrito');
        caer();
        assert.equal(controlador.motivoNoActuar, MENSAJES.sinRed);
        assert.equal(await controlador.avanzar(), false);
        assert.equal(nombres().includes('completar'), false);
        assert.equal(controlador.estado.borrador, 'Registro escrito');
    });

    test('finalización: si el servidor cae al completar, muestra el error, conserva el registro y no reintenta', async () => {
        let caer;
        const f = await abierta({ respuestas: { completar: () => { caer(); return sinServidor(); } } });
        caer = f.caer;
        f.controlador.cambiarBorrador('Registro escrito');
        assert.equal(await f.controlador.avanzar(), false);
        assert.equal(f.controlador.estado.errorAccion, MENSAJES.conexion);
        assert.equal(f.controlador.estado.borrador, 'Registro escrito');
        assert.equal(f.controlador.motivoNoActuar, MENSAJES.sinRed);
        await vuelveSinRepetir(f, 'completar');
    });

    async function enPaso3(opciones) {
        const f = await abierta(opciones);
        f.controlador.cambiarBorrador('Registro del paso 2');
        assert.equal(await f.controlador.avanzar(), true);
        return f;
    }

    test('retroceso: con el servidor caído no llama al backend y dice el motivo', async () => {
        const { controlador, nombres, caer } = await enPaso3();
        caer();
        assert.equal(controlador.motivoNoRetroceder, MENSAJES.sinRed);
        assert.equal(await controlador.pedirRetroceso(), false);
        assert.equal(nombres().includes('retroceder'), false);
    });

    test('retroceso: si el servidor cae al retroceder, muestra el error y no reintenta', async () => {
        let caer;
        const f = await enPaso3({ respuestas: { retroceder: () => { caer(); return sinServidor(); } } });
        caer = f.caer;
        assert.equal(await f.controlador.pedirRetroceso(), false);
        assert.equal(f.controlador.estado.errorAccion, MENSAJES.conexion);
        assert.equal(f.controlador.pasoActual.idConsultaProcedimientoPaso, UUID(103));
        await vuelveSinRepetir(f, 'retroceder');
    });

    test('órdenes de examen: con el servidor caído no hay ningún POST y se dice el motivo', async () => {
        const { controlador, nombres, caer } = await abierta();
        controlador.alternarExamen(UUID(301), true);
        caer();
        assert.equal(controlador.motivoNoActuar, MENSAJES.sinRed);
        assert.equal(await controlador.asignarExamenes(), false);
        assert.equal(nombres().includes('ordenar'), false);
    });

    test('órdenes de examen: si el servidor cae en el primer POST, corta la serie, muestra el error y no reintenta', async () => {
        let caer;
        const f = await abierta({ respuestas: { ordenar: () => { caer(); return sinServidor(); } } });
        caer = f.caer;
        f.controlador.alternarExamen(UUID(301), true);
        f.controlador.alternarExamen(UUID(302), true);
        assert.equal(await f.controlador.asignarExamenes(), false);
        assert.equal(f.controlador.estado.errorAccion, MENSAJES.conexion);
        assert.deepEqual(f.controlador.estado.resultadoExamenes.map(r => r.mensaje), [MENSAJES.conexion, MENSAJES.noEnviado]);
        await vuelveSinRepetir(f, 'ordenar');
    });

    async function terminada(opciones) {
        const red = conexionConServidor();
        const f = flujo({ ...opciones, conexion: red.conexion });
        f.servidor.pasos = [paso(1), paso(2, { nivel: 1 })];
        await f.iniciar();
        return { ...f, ...red };
    }

    test('cierre: con el servidor caído no se ofrece ni llama al backend; el motivo es la falta de conexión', async () => {
        const { controlador, nombres, caer } = await terminada();
        caer();
        assert.equal(controlador.bloqueo, MENSAJES.sinRed);
        assert.equal(controlador.pedirCierre('Notas'), false);
        assert.equal(await controlador.confirmar(), false);
        assert.equal(nombres().includes('cerrar'), false);
    });

    test('cierre: si el servidor cae al cerrar, muestra el error y no reintenta', async () => {
        let caer;
        const f = await terminada({ respuestas: { cerrar: () => { caer(); return sinServidor(); } } });
        caer = f.caer;
        assert.equal(f.controlador.pedirCierre('Notas'), true);
        assert.equal(await f.controlador.confirmar(), false);
        assert.equal(f.controlador.estado.errorAccion, MENSAJES.conexion);
        assert.equal(f.controlador.estado.consulta.fechaFin, null);
        await vuelveSinRepetir(f, 'cerrar');
    });

    test('salir de la consulta en curso: con el servidor caído no hace el DELETE y dice el motivo', async () => {
        const { controlador, nombres, caer } = await abierta();
        caer();
        assert.equal(await controlador.salirDeConsulta(), false);
        assert.equal(controlador.estado.errorAccion, MENSAJES.sinRedSalir);
        assert.equal(nombres().includes('salirDeConsulta'), false);
    });

    test('salir de la consulta en curso: si el servidor cae en el DELETE, muestra el error y no reintenta', async () => {
        let caer;
        const f = await abierta({ respuestas: { salirDeConsulta: () => { caer(); return sinServidor(); } } });
        caer = f.caer;
        assert.equal(await f.controlador.salirDeConsulta(), false);
        assert.equal(f.controlador.estado.errorAccion, MENSAJES.conexion);
        assert.equal(f.controlador.estado.navegarA, null);
        await vuelveSinRepetir(f, 'salirDeConsulta');
    });
});

test('retroceso conserva observaciones e indicaciones; un fallo conserva el borrador', async () => {
    const f = preparar({ respuestas: { retroceder: errorHttp(500) } });
    await f.iniciar();
    f.controlador.cambiarBorrador('Verificar medición');
    await f.controlador.pedirRetroceso('Repetir en reposo');
    assert.equal(f.controlador.estado.confirmando, 'retroceso');
    assert.equal(await f.controlador.confirmar(), false);
    assert.deepEqual(f.llamadas.find(l => l[0] === 'retroceder'), ['retroceder', UUID(102), {
        observaciones: 'Verificar medición', indicaciones: 'Repetir en reposo',
    }]);
    assert.equal(f.controlador.estado.borrador, 'Verificar medición');
});

test('paso de otro rol: no carga herramientas ni permite acciones aunque la consulta tenga otro paso mío', async () => {
    const f = preparar({ respuestas: { consulta: () => consultaB6({ procedimientos: [procedimiento(1, [
        pendiente(2), pendiente(3, { rolPaso: { idRol: UUID(701), nombre: 'Otro rol' } }),
    ])] }) } });
    await f.iniciar();
    assert.equal(f.controlador.atiendePaso, true);
    await f.controlador.elegirPaso(UUID(103));
    assert.equal(f.controlador.atiende, true);
    assert.equal(f.controlador.atiendePaso, false);
    assert.equal(f.controlador.motivoNoActuar, MENSAJES.otroRol);
    assert.equal(await f.controlador.avanzar(), false);
    assert.equal(await f.controlador.pedirRetroceso('Motivo'), false);
    assert.equal(f.llamadas.some(l => ['paso', 'ordenes', 'asignables', 'completar', 'retroceder'].includes(l[0]) && l[1] === UUID(103)), false);
});
