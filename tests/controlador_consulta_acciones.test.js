import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MENSAJES, MAX_TEXTO } from '../src/js/boundary/vistas/controlador_consulta.js';
import { MemoriaVistas } from '../src/js/boundary/vistas/memoria_vistas.js';
import {
    UUID, ID_CONSULTA, asentar, errorHttp, paso, pendiente, procedimiento, consultaB6, sesionCon, examen, preparar,
} from './dobles/consulta.js';

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
        assert.deepEqual(llamadas.find(l => l[0] === 'retroceder'), ['retroceder', UUID(103)]);
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

describe('ControladorConsulta: órdenes', () => {
    test('emite { idExamen, indicaciones } sobre el paso actual y solo recarga las órdenes', async () => {
        let ordenes = [];
        const { controlador, llamadas, nombres, iniciar } = flujo({ respuestas: {
            ordenes: () => ordenes,
            ordenar: (id, datos) => { ordenes = [{ idOrdenExamen: UUID(600), idExamen: datos.idExamen, indicaciones: datos.indicaciones ?? null }]; return ordenes[0]; },
        } });
        await iniciar();
        const antes = nombres().length;
        assert.equal(await controlador.emitirOrden({ idExamen: UUID(301), indicaciones: 'En ayunas' }), true);
        assert.deepEqual(llamadas.find(l => l[0] === 'ordenar'), ['ordenar', UUID(102), { idExamen: UUID(301), indicaciones: 'En ayunas' }]);
        assert.deepEqual(nombres().slice(antes), ['ordenar', 'ordenes']);
        assert.equal(controlador.estado.detalle.ordenes.length, 1);
        assert.equal(controlador.motivoNoRetroceder, MENSAJES.retrocesoConOrdenes, 'con una orden ya no se puede retroceder');
        assert.deepEqual(controlador.estado.acabado, { accion: 'orden', ok: true });
    });

    test('sin examen de la lista o con indicaciones de más de 255 no se envía', async () => {
        const { controlador, nombres, iniciar } = flujo();
        await iniciar();
        assert.equal(await controlador.emitirOrden({ idExamen: '' }), false);
        assert.equal(controlador.estado.errorAccion, MENSAJES.examenRequerido);
        assert.equal(await controlador.emitirOrden({ idExamen: UUID(399) }), false);
        assert.equal(await controlador.emitirOrden({ idExamen: UUID(301), indicaciones: 'x'.repeat(MAX_TEXTO + 1) }), false);
        assert.match(controlador.estado.errorAccion, /255/);
        assert.equal(nombres().includes('ordenar'), false);
    });

    test('400 examenNoAsignable: muestra el motivo y actualiza la lista de asignables', async () => {
        let asignables = [examen(1), examen(2)];
        const { controlador, iniciar } = flujo({ respuestas: {
            asignables: () => asignables,
            ordenar: () => { asignables = [examen(2)]; return errorHttp(400, 'consulta.examenNoAsignable', 'x'); },
        } });
        await iniciar();
        assert.equal(await controlador.emitirOrden({ idExamen: UUID(301) }), false);
        assert.match(controlador.estado.errorAccion, /ya no se puede asignar/);
        assert.deepEqual(controlador.estado.detalle.asignables.map(e => e.nombre), ['Examen 2']);
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
        await controlador.emitirOrden({ idExamen: UUID(301) });
        const guardado = memoria.leer(`${UUID(801)}:consulta:${ID_CONSULTA}`);
        assert.equal(guardado.detalle.ordenes.length, 1);
    });
});
