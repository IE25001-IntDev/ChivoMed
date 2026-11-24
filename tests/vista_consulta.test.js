import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, conectar, desconectar } from './dobles/dom_minimo.js';
import { MENSAJES } from '../src/js/boundary/vistas/controlador_consulta.js';
import { MemoriaVistas } from '../src/js/boundary/vistas/memoria_vistas.js';
import {
    UUID, ID_CONSULTA, asentar, errorHttp, paso, pendiente, procedimiento, consultaB6, sesionCon, preparar,
} from './dobles/consulta.js';

before(async () => {
    instalarDom();
    await import('../src/js/boundary/vistas/vista_consulta.js');
});

/** Monta la vista con un controlador de dobles. Los paneles hijos se conectan como lo haría el navegador. */
async function montar({ sesion = sesionCon(), soloLectura = false, ...opciones } = {}) {
    const base = preparar({ sesion, ...opciones });
    const espia = { repintados: 0 };
    const suscribir = base.controlador.suscribir;
    base.controlador.suscribir = fn => suscribir((c, e) => { espia.repintados++; fn(c, e); });
    const vista = new (customElements.get('vista-consulta'))();
    vista.contexto = { params: { id: ID_CONSULTA }, sesion, soloLectura };
    vista.controlador = base.controlador;
    conectar(vista);
    for (const panel of Object.values(vista.paneles)) conectar(panel);
    await asentar(); await asentar();
    const $ = id => vista.shadowRoot.getElementById(id);
    const p = (panel, id) => vista.paneles[panel].shadowRoot.getElementById(id);
    return { ...base, vista, espia, $, p };
}

describe('<vista-consulta>', () => {
    test('al conectarse carga la consulta del id de la ruta y muestra paciente, recorrido y paneles', async () => {
        const { vista, $, p, llamadas } = await montar();
        assert.deepEqual(llamadas.slice(0, 2), [['consulta', ID_CONSULTA], ['retomar', ID_CONSULTA]]);
        assert.equal($('paciente').textContent, 'Paciente De Prueba');
        assert.equal($('edad').textContent, '26 años (nació el 31 dic 1999)');
        assert.equal($('documentos').textContent, 'DUI 00000000-0');
        assert.equal($('estado-consulta').textContent, 'Abierta');
        assert.equal($('distribucion').hidden, false);
        const actual = vista.shadowRoot.querySelectorAll('div[aria-current="step"]');
        assert.equal(actual.length, 1);
        assert.match(actual[0].textContent, /^Paso 2/);
        const anidadas = vista.shadowRoot.querySelectorAll('ol').filter(ol => ol.parentNode?.parentNode?.localName === 'ol');
        assert.equal(anidadas.length, 1, 'el paso 2 cuelga del 1');
        assert.equal(vista.paneles.paso.hidden, false);
        assert.equal(vista.paneles.examenes.hidden, false);
        assert.equal(vista.paneles.cierre.hidden, true, 'aún hay pasos pendientes');
        assert.equal(p('paso', 'nombre').textContent, 'Paso 2');
        assert.equal(p('paso', 'avanzar').disabled, false);
        assert.equal(vista.paneles.paso.getAttribute('slot'), 'paso');
    });

    test('los datos se pintan como texto: un nombre con HTML no crea elementos', async () => {
        const { vista, $ } = await montar({ respuestas: { consulta: () => consultaB6({
            paciente: { nombres: '<img src=x onerror=alert(1)>', apellidos: '', documentos: [] },
            procedimientos: [procedimiento(1, [paso(1, { nombre: '<script>x</script>' }), pendiente(2)])],
        }) } });
        assert.equal($('paciente').textContent, '<img src=x onerror=alert(1)>');
        assert.equal(vista.shadowRoot.querySelectorAll('img').length, 0);
        assert.equal(vista.shadowRoot.querySelectorAll('script').length, 0);
    });

    test('los eventos de los paneles llegan al controlador', async () => {
        const { vista, controlador, nombres, llamadas } = await montar();
        const { paso: panelPaso, examenes } = vista.paneles;
        panelPaso.dispatchEvent(new CustomEvent('cambiar-borrador', { detail: { valor: 'Atención' } }));
        assert.equal(controlador.estado.borrador, 'Atención');
        examenes.dispatchEvent(new CustomEvent('cambiar-categoria', { detail: { idTipoExamen: '' } }));
        examenes.dispatchEvent(new CustomEvent('alternar-examen', { detail: { idExamen: UUID(301), marcado: true } }));
        assert.deepEqual(controlador.estado.seleccionExamenes, [UUID(301)]);
        examenes.dispatchEvent(new CustomEvent('asignar-examenes', { detail: { indicaciones: '' } }));
        await asentar(); await asentar();
        assert.deepEqual(llamadas.filter(l => l[0] === 'ordenar'), [['ordenar', UUID(102), { idExamen: UUID(301), indicaciones: '' }]]);
        panelPaso.dispatchEvent(new CustomEvent('avanzar'));
        await asentar(); await asentar();
        assert.deepEqual(llamadas.find(l => l[0] === 'completar'), ['completar', UUID(102), 'Atención']);
    });

    test('si no le toca al rol activo, todo queda en solo lectura con a quién le corresponde', async () => {
        const { vista, $, p, nombres } = await montar({ respuestas: { consulta: () => consultaB6({ pendienteParaMi: false,
            procedimientos: [procedimiento(1, [paso(1), pendiente(2, { responsable: { nombre: 'Lucía Pérez', rol: 'Enfermera' } })])] }) } });
        assert.deepEqual(nombres(), ['consulta']);
        assert.equal($('bloqueo').hidden, false);
        assert.equal($('bloqueo').textContent, 'Le corresponde a Lucía Pérez.');
        assert.equal(vista.paneles.examenes.hidden, true);
        assert.equal(vista.paneles.cierre.hidden, true);
        assert.equal(p('paso', 'avanzar').disabled, true);
        assert.equal(p('paso', 'motivo').textContent, 'Le corresponde a Lucía Pérez.');
        assert.equal(p('paso', 'valor').hasAttribute('readonly'), true);
    });

    test('409 cerrarAntesRetomar: el error enlaza a la consulta en curso y recibe el foco', async () => {
        const { vista, $ } = await montar({ respuestas: {
            retomar: errorHttp(409, 'consulta.cerrarAntesRetomar'),
            contexto: () => ({ idConsulta: UUID(2) }),
        } });
        assert.equal($('error').hidden, false);
        assert.equal($('error-texto').textContent, MENSAJES.enCurso);
        assert.equal($('en-curso').hidden, false);
        assert.equal($('en-curso').getAttribute('href'), `#/consulta/${UUID(2)}`);
        assert.equal($('reintentar').hidden, true);
        assert.equal($('distribucion').hidden, true);
        assert.equal(vista.shadowRoot.activeElement, $('error'));
    });

    test('un 409 del retroceso se muestra junto a los paneles y recibe el foco', async () => {
        const { vista, $ } = await montar({ respuestas: { retroceder: errorHttp(409, 'consulta.retrocesoRamificado', 'x') } });
        vista.paneles.paso.dispatchEvent(new CustomEvent('retroceder'));
        await asentar(); await asentar();
        assert.equal($('error-accion').hidden, false);
        assert.match($('error-accion-texto').textContent, /ramificación/);
        assert.equal(vista.shadowRoot.activeElement, $('error-accion'));
    });

    test('asignar sin selección: el error va al panel de exámenes, no arriba, y recibe el foco', async () => {
        const { vista, $, p } = await montar();
        vista.paneles.examenes.dispatchEvent(new CustomEvent('asignar-examenes', { detail: { indicaciones: '' } }));
        await asentar();
        assert.equal($('error-accion').hidden, true);
        assert.equal(p('examenes', 'error-orden').textContent, MENSAJES.seleccionVacia);
        assert.equal(vista.paneles.examenes.shadowRoot.activeElement, p('examenes', 'error-orden'));
    });

    test('al asignar varios exámenes el foco va al resultado y se vacían las indicaciones', async () => {
        const { vista, p, q = s => vista.paneles.examenes.shadowRoot.querySelectorAll(s) } = await montar();
        const examenes = vista.paneles.examenes;
        for (const id of [UUID(301), UUID(302)]) {
            examenes.dispatchEvent(new CustomEvent('alternar-examen', { detail: { idExamen: id, marcado: true } }));
        }
        await asentar();
        assert.equal(p('examenes', 'seleccionados').textContent, '2 seleccionados');
        p('examenes', 'indicaciones').value = 'En ayunas';
        examenes.dispatchEvent(new CustomEvent('asignar-examenes', { detail: { indicaciones: 'En ayunas' } }));
        await asentar(); await asentar(); await asentar();
        assert.deepEqual(q('#lista-resultado span.texto-resultado').map(s => s.textContent),
            ['Examen 1: Orden emitida.', 'Examen 2: Orden emitida.']);
        assert.equal(examenes.shadowRoot.activeElement, p('examenes', 'resultado'));
        assert.equal(p('examenes', 'indicaciones').value, '');
    });

    test('una asignación cortada (500) también enfoca el resultado y conserva las indicaciones', async () => {
        const { vista, $, p, llamadas } = await montar({ respuestas: { ordenar: errorHttp(500) } });
        const examenes = vista.paneles.examenes;
        for (const id of [UUID(301), UUID(302)]) {
            examenes.dispatchEvent(new CustomEvent('alternar-examen', { detail: { idExamen: id, marcado: true } }));
        }
        p('examenes', 'indicaciones').value = 'En ayunas';
        examenes.dispatchEvent(new CustomEvent('asignar-examenes', { detail: { indicaciones: 'En ayunas' } }));
        await asentar(); await asentar(); await asentar();
        assert.equal(llamadas.filter(l => l[0] === 'ordenar').length, 1, 'tras un error que no es del examen no se sigue');
        assert.deepEqual(examenes.shadowRoot.querySelectorAll('#lista-resultado span.estado-resultado').map(s => s.textContent),
            ['No emitida', 'No emitida']);
        assert.equal(p('examenes', 'error-orden').hidden, false);
        assert.equal($('error-accion').hidden, true);
        assert.equal(examenes.shadowRoot.activeElement, p('examenes', 'resultado'));
        assert.equal(p('examenes', 'indicaciones').value, 'En ayunas');
    });

    test('pedir el retroceso con algo escrito muestra la confirmación y le pasa el foco', async () => {
        const { vista, p } = await montar();
        vista.paneles.paso.dispatchEvent(new CustomEvent('cambiar-borrador', { detail: { valor: 'Algo' } }));
        vista.paneles.paso.dispatchEvent(new CustomEvent('retroceder'));
        await asentar();
        assert.equal(p('paso', 'confirmacion').hidden, false);
        assert.equal(vista.paneles.paso.shadowRoot.activeElement, p('paso', 'confirmar'));
        vista.paneles.paso.dispatchEvent(new CustomEvent('cancelar'));
        await asentar();
        assert.equal(p('paso', 'confirmacion').hidden, true);
    });

    test('sin pasos pendientes aparece el cierre; al cerrar queda en solo lectura con aviso', async () => {
        let cerrada = false;
        const { vista, $, p } = await montar({ respuestas: {
            consulta: () => consultaB6({ fechaFin: cerrada ? '2026-11-13T10:00:00-06:00' : null, procedimientos: [procedimiento(1, [paso(1), paso(2, { nivel: 1 })])] }),
            cerrar: () => { cerrada = true; return {}; },
        } });
        assert.equal(vista.paneles.cierre.hidden, false);
        vista.paneles.cierre.dispatchEvent(new CustomEvent('cerrar', { detail: { observaciones: '' } }));
        await asentar();
        assert.equal(p('cierre', 'confirmacion').hidden, false);
        vista.paneles.cierre.dispatchEvent(new CustomEvent('confirmar'));
        await asentar(); await asentar(); await asentar();
        assert.equal($('aviso').textContent, MENSAJES.cerradaAhora);
        assert.equal($('bloqueo').textContent, MENSAJES.cerrada);
        assert.match($('estado-consulta').textContent, /^Cerrada el/);
        assert.equal(vista.paneles.cierre.hidden, true);
        assert.equal(vista.paneles.paso.hidden, true);
    });

    test('sin red y sin datos guardados: pide conexión y no deja reintentar', async () => {
        const sinDatos = await montar({ enLinea: false });
        assert.equal(sinDatos.$('error').hidden, false);
        assert.equal(sinDatos.$('error-texto').textContent, 'No se puede conectar con el servidor y no hay datos guardados.');
        assert.equal(sinDatos.$('reintentar').disabled, true);
        assert.equal(sinDatos.$('distribucion').hidden, true);
    });

    test('sin red con datos guardados: muestra la consulta y el borrador en solo lectura, con la hora', async () => {
        const memoria = new MemoriaVistas();
        const antes = await montar({ memoria });
        antes.vista.paneles.paso.dispatchEvent(new CustomEvent('cambiar-borrador', { detail: { valor: 'Borrador guardado' } }));
        await asentar();
        desconectar(antes.vista);

        const { vista, $, p, nombres } = await montar({ memoria, enLinea: false });
        assert.deepEqual(nombres(), []);
        assert.equal($('error').hidden, true);
        assert.equal($('estado').hidden, false);
        assert.match($('estado').textContent, /^Sin conexión con el servidor\. Mostrando lo guardado a las 09:30\./);
        assert.equal($('paciente').textContent, 'Paciente De Prueba');
        assert.equal($('bloqueo').textContent, MENSAJES.sinRed);
        assert.equal(vista.paneles.paso.hidden, false);
        assert.equal(p('paso', 'valor').value, 'Borrador guardado');
        assert.equal(p('paso', 'avanzar').disabled, true);
        assert.equal(p('paso', 'motivo').textContent, MENSAJES.sinRed);
    });

    test('repinta por claves: escribir no reconstruye el recorrido', async () => {
        const { vista, $ } = await montar();
        const primero = $('recorrido').children[0];
        vista.paneles.paso.dispatchEvent(new CustomEvent('cambiar-borrador', { detail: { valor: 'Texto' } }));
        await asentar();
        assert.equal($('recorrido').children[0], primero);
    });

    test('al desconectarse cancela la suscripción y deja de escuchar a los paneles', async () => {
        const { vista, controlador, espia } = await montar();
        desconectar(vista);
        const antes = espia.repintados;
        controlador.cambiarBorrador('después');
        await asentar();
        assert.equal(espia.repintados, antes);
        vista.paneles.paso.dispatchEvent(new CustomEvent('cambiar-borrador', { detail: { valor: 'ignorado' } }));
        assert.equal(controlador.estado.borrador, 'después');
    });
});

describe('<vista-consulta>: salir de la consulta (F8)', () => {
    test('atendiendo: "Salir de la consulta" hace el DELETE y emite navegar a /dashboard', async () => {
        const { vista, $, nombres } = await montar();
        const navegaciones = [];
        vista.addEventListener('navegar', e => navegaciones.push(e));
        assert.equal($('acciones-salir').hidden, false);
        assert.equal($('salir').textContent, 'Salir de la consulta');
        assert.equal($('salir').getAttribute('aria-describedby'), 'salir-ayuda');
        $('salir').dispatchEvent(new Event('click'));
        await asentar(); await asentar();
        assert.ok(nombres().includes('salirDeConsulta'));
        assert.equal(navegaciones.length, 1);
        assert.deepEqual(navegaciones[0].detail, { ruta: '/dashboard' });
        assert.equal(navegaciones[0].bubbles && navegaciones[0].composed, true);
    });

    test('en solo lectura (no le toca) no se ofrece salir', async () => {
        const { $ } = await montar({ respuestas: { consulta: () => consultaB6({ pendienteParaMi: false }) } });
        assert.equal($('acciones-salir').hidden, true);
    });

    test('si salir falla (401), el motivo se muestra junto a los paneles, recibe el foco y no navega', async () => {
        const { vista, $ } = await montar({ respuestas: { salirDeConsulta: errorHttp(401, 'auth.sesion') } });
        const navegaciones = [];
        vista.addEventListener('navegar', e => navegaciones.push(e));
        $('salir').dispatchEvent(new Event('click'));
        await asentar(); await asentar();
        assert.equal($('error-accion').hidden, false);
        assert.equal($('error-accion-texto').textContent, MENSAJES.sesionFinalizada);
        assert.equal(vista.shadowRoot.activeElement, $('error-accion'));
        assert.equal(navegaciones.length, 0);
        assert.equal($('acciones-salir').hidden, false);
    });

    const conflicto = extra => ({
        retomar: errorHttp(409, 'consulta.cerrarAntesRetomar', 'Cierre la consulta en curso antes de retomar otra.'),
        contexto: () => ({ idConsulta: UUID(2) }),
        ...extra,
    });

    test('409 cerrarAntesRetomar: texto propio, el enlace y "Salir de esa consulta y atender esta"', async () => {
        const { $ } = await montar({ respuestas: conflicto() });
        assert.equal($('error-texto').textContent, 'Tienes otra consulta en curso. Sal de ella o ciérrala antes de atender esta.');
        assert.equal($('en-curso').getAttribute('href'), `#/consulta/${UUID(2)}`);
        assert.equal($('salir-y-atender').hidden, false);
        assert.equal($('salir-y-atender').textContent, 'Salir de esa consulta y atender esta');
        assert.equal($('acciones-salir').hidden, true, 'esta consulta no está seleccionada');
    });

    test('"Salir de esa consulta y atender esta": DELETE, vuelve a cargar y muestra esta consulta para atenderla', async () => {
        let enCurso = true;
        const { vista, $, p, nombres } = await montar({ respuestas: conflicto({
            retomar: () => (enCurso ? errorHttp(409, 'consulta.cerrarAntesRetomar') : { idConsulta: ID_CONSULTA }),
            salirDeConsulta: () => { enCurso = false; return null; },
        }) });
        $('salir-y-atender').dispatchEvent(new Event('click'));
        for (let i = 0; i < 4; i++) await asentar();
        assert.deepEqual(nombres().slice(0, 6), ['consulta', 'retomar', 'contexto', 'salirDeConsulta', 'consulta', 'retomar']);
        assert.equal($('error').hidden, true);
        assert.equal($('salir-y-atender').hidden, true);
        assert.equal($('distribucion').hidden, false);
        assert.equal(p('paso', 'avanzar').disabled, false);
        assert.equal($('acciones-salir').hidden, false);
        assert.equal(vista.shadowRoot.querySelectorAll('div[aria-current="step"]').length, 1);
    });

    test('mientras sale, "Salir de esa consulta y atender esta" dice "Saliendo…" y se deshabilita', async () => {
        let soltar;
        const { $ } = await montar({ respuestas: conflicto({ salirDeConsulta: () => new Promise(r => { soltar = r; }) }) });
        $('salir-y-atender').dispatchEvent(new Event('click'));
        await asentar();
        assert.equal($('salir-y-atender').disabled, true);
        assert.equal($('salir-y-atender').textContent, 'Saliendo…');
        soltar(null);
        await asentar(); await asentar();
    });

    test('si "Salir de esa consulta y atender esta" falla (red), el motivo recibe el foco y el enlace sigue', async () => {
        const { vista, $ } = await montar({ respuestas: conflicto({ salirDeConsulta: errorHttp(0, 'conexion.error') }) });
        $('salir-y-atender').dispatchEvent(new Event('click'));
        await asentar(); await asentar();
        assert.equal($('error-texto').textContent, MENSAJES.conexion);
        assert.equal($('en-curso').getAttribute('href'), `#/consulta/${UUID(2)}`);
        assert.equal($('salir-y-atender').hidden, false);
        assert.equal($('salir-y-atender').disabled, false);
        assert.equal(vista.shadowRoot.activeElement, $('error'));
    });
});

test('muestra el motivo recibido separado de la atención y oculta herramientas de un paso ajeno', async () => {
    const motivo = 'Observaciones: Revisar medición\nIndicaciones: Repetir en reposo';
    const { vista, controlador, p } = await montar({ respuestas: {
        paso: id => ({ idConsultaProcedimientoPaso: id, valor: 'Registro anterior', motivoRetroceso: motivo }),
        consulta: () => consultaB6({ procedimientos: [procedimiento(1, [pendiente(2),
            pendiente(3, { rolPaso: { idRol: UUID(701), nombre: 'Enfermera' } })])] }),
    } });
    assert.equal(p('paso', 'notas-retroceso').textContent, motivo);
    assert.equal(p('paso', 'valor').value, 'Registro anterior');
    assert.equal(p('paso', 'acciones-atencion').hidden, false);
    assert.equal(vista.hasAttribute('con-accion-fija'), true);
    await controlador.elegirPaso(UUID(103));
    await asentar();
    assert.equal(p('paso', 'acciones-atencion').hidden, true);
    assert.equal(p('paso', 'avanzar').hidden, true);
    assert.equal(p('paso', 'retroceder').hidden, true);
    assert.equal(p('paso', 'campo-atencion').hidden, true);
    assert.equal(vista.paneles.examenes.hidden, true);
    assert.equal(vista.hasAttribute('con-accion-fija'), false);
});
