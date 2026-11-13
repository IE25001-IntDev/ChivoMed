import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, conectar, desconectar } from './dobles/dom_minimo.js';
import DefaultError from '../src/js/entities/default_error.js';
import { MemoriaVistas } from '../src/js/boundary/vistas/memoria_vistas.js';

// Datos inventados; nunca datos reales.
const UUID = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NORTE = { idClinica: UUID(10), nombreClinica: 'Clínica Prueba Norte' };
const SUR = { idClinica: UUID(20), nombreClinica: 'Clínica Prueba Sur' };
const DOC_NORTE = { idPersonaRol: UUID(11), codigoRol: 'DOCTOR', nombreRol: 'Doctor', ...NORTE, activa: true };
const ADM_NORTE = { idPersonaRol: UUID(12), codigoRol: 'ADMINISTRACION', nombreRol: 'Administración', ...NORTE, activa: false };
const DOC_SUR = { idPersonaRol: UUID(21), codigoRol: 'DOCTOR', nombreRol: 'Doctor', ...SUR, activa: false };
const ASIGNACIONES = [DOC_NORTE, ADM_NORTE, DOC_SUR];
const sesionCon = a => ({
    usuario: { idUsuario: UUID(1), idPersona: UUID(2), nombres: 'Persona', apellidos: 'De Prueba' },
    rolActivo: { idPersonaRol: a.idPersonaRol, codigo: a.codigoRol, idClinica: a.idClinica, nombreClinica: a.nombreClinica },
    csrfToken: 'csrf-prueba',
});

/** Deja correr los microtasks y las promesas pendientes de los dobles. */
const asentar = () => new Promise(resolve => setTimeout(resolve, 0));

let VistaDashboard;
let ControladorDashboard;
before(async () => {
    instalarDom();
    ({ default: VistaDashboard } = await import('../src/js/boundary/vistas/vista_dashboard.js'));
    ({ ControladorDashboard } = await import('../src/js/boundary/vistas/controlador_dashboard.js'));
});

/**
 * Vista conectada a un controlador real con servicios dobles. Cuenta cuántas notificaciones
 * llegan a la vista (cada una es un repintado) envolviendo `suscribir`.
 */
function montar({ cambiarRol = async () => ({}), enLinea = true } = {}) {
    let ultimo = null;
    const controlador = new ControladorDashboard({
        servicio: {
            asignaciones: async () => ({ data: ASIGNACIONES }),
            cambiarRol: async id => { ultimo = id; return { data: await cambiarRol(id) }; },
        },
        obtenerSesion: async () => sesionCon(ASIGNACIONES.find(a => a.idPersonaRol === ultimo)),
        conexion: { enLinea, suscribir: () => () => {} },
        memoria: new MemoriaVistas(),
        reloj: () => new Date(2026, 10, 13, 9, 30),
    });
    const espia = { repintados: 0, detenido: 0 };
    const suscribir = controlador.suscribir;
    controlador.suscribir = fn => suscribir((cambios, estado) => { espia.repintados++; fn(cambios, estado); });
    const detener = controlador.detener.bind(controlador);
    controlador.detener = () => { espia.detenido++; detener(); };

    const vista = new VistaDashboard();
    vista.contexto = { sesion: sesionCon(DOC_NORTE), soloLectura: false };
    vista.controlador = controlador;
    const eventos = [];
    vista.addEventListener('sesion-actualizada', e => eventos.push(e));
    const $ = id => vista.shadowRoot.getElementById(id);
    return { vista, controlador, espia, eventos, $ };
}

const radios = vista => vista.shadowRoot.querySelectorAll('input[name="asignacion"]');

describe('<vista-dashboard>: suscripción y pintado', () => {
    test('al conectarse pinta el estado inicial y, al cargar, los grupos y el rol activo', async () => {
        const { vista, $ } = montar();
        conectar(vista);
        assert.equal($('estado').hidden, false, 'pintado inicial síncrono: "Cargando tus roles…"');
        assert.equal($('estado').textContent, 'Cargando tus roles…');
        await asentar();
        assert.equal($('activo').textContent, 'Estás atendiendo como Doctor en Clínica Prueba Norte.');
        const legends = vista.shadowRoot.querySelectorAll('legend').map(l => l.textContent);
        assert.deepEqual(legends, ['Clínica Prueba Norte', 'Clínica Prueba Sur']);
        assert.equal(vista.shadowRoot.querySelector('input:checked').value, DOC_NORTE.idPersonaRol);
        assert.equal($('estado').hidden, true);
        assert.equal($('usar').disabled, true, 'la selección es el rol actual');
    });

    test('un cambio de estado hecho en el controlador repinta la vista en el siguiente microtask', async () => {
        const { vista, controlador, $ } = montar();
        conectar(vista);
        await asentar();
        controlador.estado.error = 'Error de prueba.';
        controlador.estado.aviso = 'Aviso de prueba.';
        assert.equal($('error').hidden, true, 'todavía no: la notificación va en un microtask');
        await asentar();
        assert.equal($('error').hidden, false);
        assert.equal($('error-texto').textContent, 'Error de prueba.');
        assert.equal($('aviso').textContent, 'Aviso de prueba.');
        controlador.estado.error = null;
        await asentar();
        assert.equal($('error').hidden, true);
    });

    test('varios cambios en el mismo tick producen un solo repintado', async () => {
        const { vista, controlador, espia } = montar();
        conectar(vista);
        await asentar();
        const antes = espia.repintados;
        Object.assign(controlador.estado, { error: 'a', aviso: 'b', cargando: true });
        controlador.estado.vacio = true;
        await asentar();
        assert.equal(espia.repintados - antes, 1);
    });

    test('cambiar grupos reconstruye los fieldsets; cambiar solo el error los conserva', async () => {
        const { vista, controlador } = montar();
        conectar(vista);
        await asentar();
        const primero = vista.shadowRoot.querySelector('fieldset');
        controlador.estado.error = 'otro';
        await asentar();
        assert.equal(vista.shadowRoot.querySelector('fieldset'), primero, 'mismos nodos');
        controlador.estado.grupos = Object.freeze([controlador.estado.grupos[1]]);
        await asentar();
        assert.notEqual(vista.shadowRoot.querySelector('fieldset'), primero);
        assert.equal(vista.shadowRoot.querySelectorAll('fieldset').length, 1);
    });

    test('mientras se cambia de rol el botón se deshabilita con su texto, y luego se restaura', async () => {
        const { vista, controlador, $ } = montar();
        conectar(vista);
        await asentar();
        controlador.estado.cambiando = DOC_SUR.idPersonaRol;
        await asentar();
        assert.equal($('usar').disabled, true);
        assert.equal($('usar').textContent, 'Cambiando de rol…');
        assert.equal($('selector').getAttribute('aria-busy'), 'true');
        controlador.estado.cambiando = null;
        await asentar();
        assert.equal($('usar').textContent, 'Usar este rol');
    });

    test('el slot "consultas" existe con el texto por defecto para la parte 2', () => {
        const { vista } = montar();
        conectar(vista);
        const slot = vista.shadowRoot.querySelector('slot[name="consultas"]');
        assert.ok(slot);
        assert.match(slot.textContent, /Pronto verás aquí las consultas/);
    });
});

describe('<vista-dashboard>: cambio de rol', () => {
    test('elegir otro rol y enviar cambia el rol y emite sesion-actualizada (no al montar)', async () => {
        const { vista, $, eventos } = montar();
        conectar(vista);
        await asentar();
        assert.equal(eventos.length, 0);
        const sur = radios(vista).find(r => r.value === DOC_SUR.idPersonaRol);
        sur.checked = true;
        $('selector').dispatchEvent(new Event('change'));
        assert.equal($('usar').disabled, false);
        $('selector').dispatchEvent(new Event('submit', { cancelable: true }));
        await asentar();
        assert.equal(eventos.length, 1);
        assert.equal(eventos[0].bubbles, true);
        assert.equal(eventos[0].composed, true);
        assert.equal(eventos[0].detail.sesion.rolActivo.idPersonaRol, DOC_SUR.idPersonaRol);
        assert.equal($('activo').textContent, 'Estás atendiendo como Doctor en Clínica Prueba Sur.');
    });

    test('con consulta en curso (409) muestra el motivo, lo enfoca y vuelve la selección al rol actual', async () => {
        const motivo = 'Cierre la consulta antes de cambiar de médico o rol.';
        const { vista, $, eventos } = montar({
            cambiarRol: async () => { throw new DefaultError({ status: 409, code: 'rolCambio.cerrarAntesCambiar', message: motivo }); },
        });
        conectar(vista);
        await asentar();
        radios(vista).find(r => r.value === ADM_NORTE.idPersonaRol).checked = true;
        $('selector').dispatchEvent(new Event('submit', { cancelable: true }));
        await asentar();
        assert.equal($('aviso').hidden, false);
        assert.equal($('aviso').textContent, motivo);
        assert.equal(vista.shadowRoot.activeElement, $('aviso'));
        assert.equal(vista.shadowRoot.querySelector('input:checked').value, DOC_NORTE.idPersonaRol);
        assert.equal(eventos.length, 0);
    });
});

describe('<vista-dashboard>: ciclo de vida', () => {
    test('al desconectarse cancela la suscripción y detiene el controlador', async () => {
        const { vista, controlador, espia, $ } = montar();
        conectar(vista);
        await asentar();
        desconectar(vista);
        assert.equal(espia.detenido, 1);
        const antes = espia.repintados;
        controlador.estado.error = 'no debe verse';
        await asentar();
        assert.equal(espia.repintados, antes, 'sin repintados después de desconectar');
        assert.equal($('error').hidden, true);
    });

    test('al reconectarse se vuelve a suscribir y pinta el estado actual', async () => {
        const { vista, controlador, $ } = montar();
        conectar(vista);
        await asentar();
        desconectar(vista);
        controlador.estado.aviso = 'Aviso mientras estaba desconectada.';
        await asentar();
        assert.equal($('aviso').hidden, true, 'desconectada no repinta');
        conectar(vista);
        assert.equal($('aviso').textContent, 'Aviso mientras estaba desconectada.', 'pintado completo al reconectar');
        await asentar();
        controlador.estado.aviso = 'Aviso tras reconectar.';
        await asentar();
        assert.equal($('aviso').textContent, 'Aviso tras reconectar.');
    });

    test('el controlador no se puede cambiar con la vista conectada', () => {
        const { vista, controlador } = montar();
        conectar(vista);
        assert.throws(() => { vista.controlador = controlador; }, /antes de conectar/);
    });
});
