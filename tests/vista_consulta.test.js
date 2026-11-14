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
        examenes.dispatchEvent(new CustomEvent('emitir-orden', { detail: { idExamen: UUID(301), indicaciones: '' } }));
        await asentar(); await asentar();
        assert.ok(nombres().includes('ordenar'));
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

    test('un error de orden se muestra en el panel de exámenes, no arriba', async () => {
        const { vista, $, p } = await montar();
        vista.paneles.examenes.dispatchEvent(new CustomEvent('emitir-orden', { detail: { idExamen: '' } }));
        await asentar();
        assert.equal($('error-accion').hidden, true);
        assert.equal(p('examenes', 'error-orden').textContent, MENSAJES.examenRequerido);
        assert.equal(vista.paneles.examenes.shadowRoot.activeElement, p('examenes', 'examen'));
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
        assert.equal(sinDatos.$('error-texto').textContent, MENSAJES.sinRedCarga);
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
        assert.match($('estado').textContent, /^Sin conexión\. Mostrando la consulta guardada a las 09:30/);
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
