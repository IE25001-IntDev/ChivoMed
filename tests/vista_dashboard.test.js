import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, conectar, desconectar } from './dobles/dom_minimo.js';
import DefaultError from '../src/js/entities/default_error.js';
import { MemoriaVistas } from '../src/js/control/memoria_vistas.js';

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
    ({ ControladorDashboard } = await import('../src/js/control/controladores/controlador_dashboard.js'));
});

/**
 * Vista conectada a un controlador real con servicios dobles. Cuenta cuántas notificaciones
 * llegan a la vista (cada una es un repintado) envolviendo `suscribir`.
 */
function montar({ cambiarRol = async () => ({}), enLinea = true, idConsulta = null, salirDeConsulta = async () => null } = {}) {
    let ultimo = null;
    const llamadas = { salirDeConsulta: 0 };
    const controlador = new ControladorDashboard({
        servicio: {
            asignaciones: async () => ({ data: ASIGNACIONES }),
            cambiarRol: async id => { ultimo = id; return { data: await cambiarRol(id) }; },
            contexto: async () => ({ data: { idPersonaRol: DOC_NORTE.idPersonaRol, idConsulta } }),
            salirDeConsulta: async () => { llamadas.salirDeConsulta++; return { status: 204, data: await salirDeConsulta() }; },
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
    return { vista, controlador, espia, eventos, $, llamadas };
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

    test('el encabezado de las consultas toma el título que avisa <lista-consultas>', async () => {
        const { vista, $ } = montar();
        conectar(vista);
        assert.equal($('titulo-consultas').textContent, 'Consultas de hoy');
        vista.dispatchEvent(new CustomEvent('titulo-consultas', { detail: { titulo: 'Consultas del 21 oct 2026 al 20 nov 2026' } }));
        assert.equal($('titulo-consultas').textContent, 'Consultas del 21 oct 2026 al 20 nov 2026');
        desconectar(vista);
        vista.dispatchEvent(new CustomEvent('titulo-consultas', { detail: { titulo: 'Otro' } }));
        assert.equal($('titulo-consultas').textContent, 'Consultas del 21 oct 2026 al 20 nov 2026', 'desconectada no escucha');
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

    test('agrega <lista-consultas slot="consultas"> con la sesión del contexto, una sola vez', () => {
        const { vista } = montar();
        conectar(vista);
        assert.ok(vista.shadowRoot.querySelector('slot[name="consultas"]'));
        const [lista] = vista.children;
        assert.equal(lista.localName, 'lista-consultas');
        assert.equal(lista.slot, 'consultas');
        assert.equal(lista.contexto.sesion.rolActivo.idPersonaRol, DOC_NORTE.idPersonaRol);
        desconectar(vista);
        conectar(vista);
        assert.equal(vista.children.length, 1);
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
        assert.equal(vista.children[0].contexto.sesion.rolActivo.idPersonaRol, DOC_SUR.idPersonaRol, 'la lista recibe la sesión nueva');
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
        // F8: texto propio del frontend, no el message del backend.
        assert.equal($('aviso').textContent, 'Tienes una consulta en curso. Sal de ella o ciérrala antes de cambiar de rol.');
        assert.notEqual($('aviso').textContent, motivo);
        assert.equal(vista.shadowRoot.activeElement, $('aviso'));
        assert.equal(vista.shadowRoot.querySelector('input:checked').value, DOC_NORTE.idPersonaRol);
        assert.equal(eventos.length, 0);
    });
});

describe('<vista-dashboard>: consulta en curso (F8)', () => {
    const EN_CURSO = UUID(500);

    test('la región role="status" está siempre en el DOM y visible; sin consulta en curso su contenido se oculta', async () => {
        const { vista, $ } = montar();
        conectar(vista);
        await asentar();
        assert.equal($('region-en-curso').getAttribute('role'), 'status');
        assert.equal($('region-en-curso').hidden, false);
        assert.equal($('en-curso-texto').hidden, true);
        assert.equal($('acciones-en-curso').hidden, true);
        assert.equal($('confirmacion').hidden, true);
        assert.equal($('ir-en-curso').hasAttribute('href'), false);
    });

    test('la región role="status" solo contiene textos: el enlace y el botón quedan fuera', () => {
        const { vista, $ } = montar({ idConsulta: EN_CURSO });
        conectar(vista);
        const etiquetas = nodo => [...nodo.children].flatMap(h => [h.localName, ...etiquetas(h)]);
        assert.deepEqual(etiquetas($('region-en-curso')), ['p', 'p']);
        assert.equal($('acciones-en-curso').getAttribute('role'), null);
    });

    test('los destinos de focus() son enfocables: #error, #aviso y #confirmacion tienen tabindex="-1"', () => {
        const { vista, $ } = montar();
        conectar(vista);
        for (const id of ['error', 'aviso', 'confirmacion']) assert.equal($(id).getAttribute('tabindex'), '-1', id);
    });

    test('con consulta en curso: aviso, enlace #/consulta/{id} con su texto y botón "Salir de la consulta"', async () => {
        const { vista, $ } = montar({ idConsulta: EN_CURSO });
        conectar(vista);
        await asentar();
        assert.equal($('region-en-curso').hidden, false);
        assert.equal($('acciones-en-curso').hidden, false);
        assert.equal($('en-curso-texto').hidden, false);
        assert.equal($('en-curso-texto').textContent, 'Tienes una consulta en curso.');
        assert.equal($('ir-en-curso').getAttribute('href'), `#/consulta/${EN_CURSO}`);
        assert.equal($('ir-en-curso').textContent, 'Ir a la consulta en curso');
        assert.equal($('salir').textContent, 'Salir de la consulta');
        assert.equal($('salir').disabled, false);
    });

    test('pasa enCurso a <lista-consultas> para la insignia de la tarjeta', async () => {
        const { vista } = montar({ idConsulta: EN_CURSO });
        conectar(vista);
        await asentar();
        const [lista] = vista.children;
        assert.equal(lista.enCurso, EN_CURSO);
    });

    test('"Salir de la consulta" hace el DELETE, oculta el aviso, quita el enlace y enfoca la confirmación', async () => {
        const { vista, $, llamadas } = montar({ idConsulta: EN_CURSO });
        conectar(vista);
        await asentar();
        $('salir').dispatchEvent(new Event('click'));
        await asentar();
        assert.equal(llamadas.salirDeConsulta, 1);
        assert.equal($('region-en-curso').hidden, false, 'la región no se oculta');
        assert.equal($('acciones-en-curso').hidden, true);
        assert.equal($('ir-en-curso').hasAttribute('href'), false);
        assert.equal($('confirmacion').hidden, false);
        assert.equal($('confirmacion').textContent, 'Saliste de la consulta. Ya puedes cambiar de rol.');
        assert.equal(vista.shadowRoot.activeElement, $('confirmacion'));
        assert.equal(vista.children[0].enCurso, null);
    });

    test('mientras sale, el botón dice "Saliendo…" y se deshabilita', async () => {
        let soltar;
        const { vista, $ } = montar({ idConsulta: EN_CURSO, salirDeConsulta: () => new Promise(r => { soltar = r; }) });
        conectar(vista);
        await asentar();
        $('salir').dispatchEvent(new Event('click'));
        await asentar();
        assert.equal($('salir').disabled, true);
        assert.equal($('salir').textContent, 'Saliendo…');
        soltar(null);
        await asentar();
        assert.equal($('acciones-en-curso').hidden, true);
    });

    test('si salir falla (401), el error se muestra y enfoca, y el aviso con el enlace sigue', async () => {
        const { vista, $ } = montar({ idConsulta: EN_CURSO,
            salirDeConsulta: async () => { throw new DefaultError({ status: 401, code: 'auth.sesion', message: 'Vuelva a iniciar sesión.' }); } });
        conectar(vista);
        await asentar();
        $('salir').dispatchEvent(new Event('click'));
        await asentar();
        assert.equal($('error').hidden, false);
        assert.equal($('error-texto').textContent, 'Tu sesión ha finalizado. Vuelve a iniciar sesión.');
        assert.equal(vista.shadowRoot.activeElement, $('error'));
        assert.equal($('acciones-en-curso').hidden, false);
        assert.equal($('ir-en-curso').getAttribute('href'), `#/consulta/${EN_CURSO}`);
    });

    test('409 → Salir → Usar este rol: termina con el rol cambiado y sin mensajes de la salida', async () => {
        let enConsulta = true;
        const { vista, $, eventos } = montar({
            idConsulta: EN_CURSO,
            cambiarRol: async () => {
                if (enConsulta) throw new DefaultError({ status: 409, code: 'rolCambio.cerrarAntesCambiar', message: 'Cierre la consulta antes de cambiar de médico o rol.' });
                return {};
            },
            salirDeConsulta: async () => { enConsulta = false; return null; },
        });
        conectar(vista);
        await asentar();
        const elegir = () => {
            radios(vista).find(r => r.value === ADM_NORTE.idPersonaRol).checked = true;
            $('selector').dispatchEvent(new Event('submit', { cancelable: true }));
        };
        elegir();
        await asentar();
        assert.equal($('aviso').hidden, false);
        assert.equal($('acciones-en-curso').hidden, false);
        $('salir').dispatchEvent(new Event('click'));
        await asentar();
        assert.equal($('aviso').hidden, true);
        elegir();
        await asentar();
        assert.equal(eventos.length, 1, 'sesion-actualizada');
        assert.equal($('confirmacion').hidden, true);
        assert.equal($('confirmacion').textContent, '');
        assert.equal($('activo').textContent, 'Estás atendiendo como Administración en Clínica Prueba Norte.');
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
