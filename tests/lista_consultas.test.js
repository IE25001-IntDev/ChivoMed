import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { instalarDom, conectar } from './dobles/dom_minimo.js';
import { normalizarConsultas } from '../src/js/boundary/vistas/controlador_consultas.js';

// Datos inventados; nunca datos reales de pacientes.
const UUID = n => `20000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const asentar = () => new Promise(resolve => setTimeout(resolve, 0));
const paso = (n, extra = {}) => ({
    idConsultaProcedimientoPaso: UUID(100 + n), nombre: `Paso ${n}`, orden: n, nivel: 0, estado: 'COMPLETADO',
    responsable: { nombre: 'Persona Responsable', rol: 'Doctor' },
    fechaInicio: '2026-11-13T08:00:00-06:00', fechaFin: '2026-11-13T08:10:00-06:00', tieneValor: true, ...extra,
});
const consultaCruda = (n, extra = {}) => ({
    idConsulta: UUID(n), fechaInicio: '2026-11-13T08:00:00-06:00', fechaFin: null, pendienteParaMi: true,
    paciente: { nombres: 'Paciente', apellidos: `Prueba ${n}`, fechaNacimiento: '1999-12-31', edad: 26, documentos: [{ tipoDocumento: 'DUI', numero: '00000000-0' }] },
    procedimientos: [{ idConsultaProcedimiento: UUID(50 + n), nombre: 'Procedimiento de prueba', fechaInicio: null, fechaFin: null,
        pasos: [paso(1), paso(2, { nivel: 1, estado: 'PENDIENTE', fechaFin: null, tieneValor: false }), paso(3, { nivel: 2, tieneValor: false })] }],
    ...extra,
});
const normal = (n, extra) => normalizarConsultas([consultaCruda(n, extra)])[0];

before(async () => {
    instalarDom();
    await import('../src/js/boundary/components/dashboard/tarjeta_consulta_dashboard.js');
});

function tarjeta(consulta, { motivo = null, valores = {} } = {}) {
    const Clase = customElements.get('tarjeta-consulta-dashboard');
    const el = new Clase();
    el.consulta = consulta;
    el.motivo = motivo;
    el.valores = valores;
    conectar(el);
    const eventos = [];
    for (const tipo of ['ver-registro', 'reintentar-registro', 'atender']) el.addEventListener(tipo, e => eventos.push(e));
    return { el, eventos, $: id => el.shadowRoot.getElementById(id), q: s => el.shadowRoot.querySelectorAll(s) };
}

describe('<tarjeta-consulta-dashboard>', () => {
    test('muestra las generales del paciente, la fecha de inicio y el estado', () => {
        const { $ } = tarjeta(normal(1));
        assert.equal($('paciente').textContent, 'Paciente Prueba 1');
        assert.match($('generales').textContent, /^26 años · Nació el 31 dic 1999$/);
        assert.equal($('documentos').textContent, 'DUI 00000000-0');
        assert.match($('inicio').textContent, /13 nov 2026.*8:00/);
        assert.equal($('estado').textContent, 'Abierta');
    });

    test('sin edad ni documentos lo dice; una consulta cerrada muestra su cierre', () => {
        const c = normal(1, { fechaFin: '2026-11-13T10:00:00-06:00', paciente: { nombres: 'Sin', apellidos: 'Datos', fechaNacimiento: null, edad: null, documentos: [] } });
        const { $ } = tarjeta(c);
        assert.equal($('generales').textContent, 'Edad no registrada');
        assert.equal($('documentos').textContent, 'Sin documentos registrados');
        assert.match($('estado').textContent, /^Cerrada el 13 nov 2026/);
    });

    test('resalta pendienteParaMi con insignia de texto y clase, no solo con color', () => {
        const si = tarjeta(normal(1));
        assert.equal(si.$('pendiente').hidden, false);
        assert.equal(si.$('pendiente').textContent, 'Pendiente para ti');
        assert.match(si.$('tarjeta').className, /\bpendiente\b/);
        const no = tarjeta(normal(2, { pendienteParaMi: false }));
        assert.equal(no.$('pendiente').hidden, true);
        assert.doesNotMatch(no.$('tarjeta').className, /\bpendiente\b/);
    });

    test('los pasos van en <ol> anidados según nivel, con estado, responsable y fechas', () => {
        const { el, q } = tarjeta(normal(1));
        const raiz = el.shadowRoot.querySelector('ol.arbol-pasos');
        assert.equal(raiz.children.length, 1, 'un paso de nivel 0');
        const nivel1 = raiz.children[0].querySelector('ol');
        assert.equal(nivel1.children.length, 1);
        assert.ok(nivel1.children[0].querySelector('ol'), 'el paso de nivel 2 cuelga del de nivel 1');
        const nombres = q('.paso-nombre').map(n => n.textContent);
        assert.deepEqual(nombres, ['Paso 1', 'Paso 2', 'Paso 3']);
        const estados = q('.insignia-estado').map(n => n.textContent);
        assert.deepEqual(estados, ['Completado', 'Pendiente', 'Completado']);
        assert.ok(q('.meta').some(m => m.textContent === 'Persona Responsable · Doctor'));
        assert.ok(q('.meta').some(m => /En curso$/.test(m.textContent)), 'el paso pendiente sin fin');
    });

    test('"Ver registro" solo en pasos con tieneValor y emite ver-registro con el id', () => {
        const { q, eventos } = tarjeta(normal(1));
        const botones = q('button.boton-pequeno');
        assert.equal(botones.length, 1);
        assert.equal(botones[0].getAttribute('aria-expanded'), 'false');
        assert.equal(botones[0].getAttribute('aria-controls'), `registro-${UUID(101)}`);
        botones[0].dispatchEvent(new Event('click'));
        assert.equal(eventos[0].type, 'ver-registro');
        assert.deepEqual(eventos[0].detail, { idPaso: UUID(101) });
        assert.equal(eventos[0].bubbles && eventos[0].composed, true);
    });

    test('el panel muestra cargando, el valor, "Sin valor registrado" o el error con reintentar', () => {
        const { el, $, eventos } = tarjeta(normal(1));
        const panel = $(`registro-${UUID(101)}`);
        const boton = el.shadowRoot.querySelector('button.boton-pequeno');
        el.valores = { [UUID(101)]: { abierto: true, cargando: true } };
        assert.equal(panel.hidden, false);
        assert.equal(boton.getAttribute('aria-expanded'), 'true');
        assert.equal(boton.textContent, 'Ocultar registro');
        assert.equal(panel.textContent, 'Cargando registro…');
        el.valores = { [UUID(101)]: { abierto: true, cargado: true, valor: 'Presión 120/80\nPulso 70', fechaFin: null } };
        assert.equal(panel.querySelector('p.valor').textContent, 'Presión 120/80\nPulso 70');
        el.valores = { [UUID(101)]: { abierto: true, cargado: true, valor: null } };
        assert.equal(panel.textContent, 'Sin valor registrado.');
        el.valores = { [UUID(101)]: { abierto: true, error: 'No pudimos cargar el registro.' } };
        assert.equal(panel.querySelector('[role="alert"]').textContent, 'No pudimos cargar el registro.');
        panel.querySelector('button').dispatchEvent(new Event('click'));
        assert.equal(eventos.at(-1).type, 'reintentar-registro');
        el.valores = { [UUID(101)]: { abierto: false, cargado: true, valor: 'x' } };
        assert.equal(panel.hidden, true);
        assert.equal(boton.textContent, 'Ver registro');
    });

    test('cambiar solo valores no reconstruye los pasos; cambiar la consulta sí', () => {
        const { el } = tarjeta(normal(1));
        const primerPaso = el.shadowRoot.querySelector('li.paso');
        el.valores = { [UUID(101)]: { abierto: true, cargando: true } };
        assert.equal(el.shadowRoot.querySelector('li.paso'), primerPaso);
        el.consulta = normal(1);
        assert.notEqual(el.shadowRoot.querySelector('li.paso'), primerPaso);
    });

    test('"Atender" habilitado sin motivo emite atender; con motivo queda deshabilitado y explica por qué', async () => {
        const ok = tarjeta(normal(1));
        assert.equal(ok.$('atender').disabled, false);
        assert.equal(ok.$('motivo').hidden, true);
        ok.$('atender').dispatchEvent(new Event('click'));
        assert.deepEqual(ok.eventos.at(-1).detail, { idConsulta: UUID(1) });
        const no = tarjeta(normal(2, { pendienteParaMi: false }), { motivo: 'Le corresponde a Doctor.' });
        assert.equal(no.$('atender').disabled, true);
        assert.equal(no.$('motivo').hidden, false);
        assert.equal(no.$('motivo').textContent, 'Le corresponde a Doctor.');
        assert.equal(no.$('atender').getAttribute('aria-describedby'), 'motivo');
        await asentar();
    });

    test('los datos con HTML se muestran como texto y no crean elementos', () => {
        const c = normal(1, { paciente: { nombres: '<b>Nombre</b>', apellidos: '<img src=x>', edad: 1, fechaNacimiento: null, documentos: [] } });
        const { el, $ } = tarjeta(c, { valores: { [UUID(101)]: { abierto: true, cargado: true, valor: '<script>x</script>' } } });
        assert.equal($('paciente').textContent, '<b>Nombre</b> <img src=x>');
        assert.equal(el.shadowRoot.querySelectorAll('b').length, 0);
        assert.equal(el.shadowRoot.querySelectorAll('img').length, 0);
        assert.equal(el.shadowRoot.querySelectorAll('script').length, 0);
        assert.equal(el.shadowRoot.querySelector('p.valor').textContent, '<script>x</script>');
        assert.equal($('generales').textContent, '1 año');
    });

    test('un procedimiento sin pasos y una consulta sin procedimientos lo dicen', () => {
        const sinPasos = tarjeta(normal(1, { procedimientos: [{ idConsultaProcedimiento: UUID(60), nombre: 'Vacío', pasos: [] }] }));
        assert.ok(sinPasos.q('p.vacio').some(p => p.textContent === 'Sin pasos registrados.'));
        const sinProc = tarjeta(normal(2, { procedimientos: [] }));
        assert.ok(sinProc.q('p.vacio').some(p => p.textContent === 'Sin procedimientos registrados.'));
    });
});

// ---------------------------------------------------------------------------------------------
// <lista-consultas>
// ---------------------------------------------------------------------------------------------
import { ControladorConsultas, MENSAJES } from '../src/js/boundary/vistas/controlador_consultas.js';
import { MemoriaVistas } from '../src/js/boundary/vistas/memoria_vistas.js';
import { desconectar } from './dobles/dom_minimo.js';

const sesionCon = (idPersonaRol = UUID(900)) => ({ usuario: { idUsuario: UUID(800) }, rolActivo: { idPersonaRol, codigo: 'DOCTOR' }, csrfToken: 'csrf-prueba' });

function montarLista({ dashboard = async () => [consultaCruda(1), consultaCruda(2, { pendienteParaMi: false })], enLinea = true } = {}) {
    const llamadas = { dashboard: [], valorPaso: [] };
    const conexion = { enLinea, suscriptores: new Set(), suscribir(fn) { this.suscriptores.add(fn); return () => this.suscriptores.delete(fn); },
        emitir(v) { this.enLinea = v; for (const fn of [...this.suscriptores]) fn(v); } };
    const controlador = new ControladorConsultas({
        servicio: {
            dashboard: async f => { llamadas.dashboard.push(f); return { data: await dashboard(f) }; },
            valorPaso: async id => { llamadas.valorPaso.push(id); return { data: { valor: 'Registro de prueba' } }; },
        },
        conexion, memoria: new MemoriaVistas(), reloj: () => new Date('2026-11-13T15:30:00Z'),
    });
    const espia = { repintados: 0 };
    const suscribir = controlador.suscribir;
    controlador.suscribir = fn => suscribir((c, e) => { espia.repintados++; fn(c, e); });
    const Clase = customElements.get('lista-consultas');
    const lista = new Clase();
    lista.contexto = { sesion: sesionCon(), soloLectura: false };
    lista.controlador = controlador;
    const navegaciones = [];
    lista.addEventListener('navegar', e => navegaciones.push(e));
    const $ = id => lista.shadowRoot.getElementById(id);
    const tarjetas = () => $('cuadricula').children;
    return { lista, controlador, llamadas, conexion, espia, navegaciones, $, tarjetas };
}

describe('<lista-consultas>', () => {
    before(async () => { await import('../src/js/boundary/components/dashboard/lista_consultas.js'); });

    test('al conectarse muestra hoy en el filtro y, al cargar, una tarjeta por consulta y el resumen', async () => {
        const { lista, $, tarjetas, llamadas } = montarLista();
        conectar(lista);
        assert.equal($('desde').value, '2026-11-13');
        assert.equal($('hasta').value, '2026-11-13');
        assert.equal($('estado').textContent, 'Cargando consultas…');
        await asentar();
        assert.deepEqual(llamadas.dashboard, [{ desde: '2026-11-13', hasta: '2026-11-13' }]);
        assert.equal(tarjetas().length, 2);
        assert.equal(tarjetas()[0].localName, 'tarjeta-consulta-dashboard');
        assert.match($('resumen').textContent, /^2 consultas del 13 nov 2026$/);
        assert.equal($('estado').hidden, true);
    });

    test('sin consultas muestra el estado vacío', async () => {
        const { lista, $, tarjetas } = montarLista({ dashboard: async () => [] });
        conectar(lista);
        await asentar();
        assert.equal(tarjetas().length, 0);
        assert.equal($('resumen').textContent, MENSAJES.sinConsultas);
    });

    test('cambiar consultas reconstruye las tarjetas; cambiar solo valores las conserva', async () => {
        const { lista, controlador, tarjetas } = montarLista();
        conectar(lista);
        await asentar();
        const primera = tarjetas()[0];
        await controlador.alternarRegistro(UUID(101));
        await asentar();
        assert.equal(tarjetas()[0], primera, 'misma tarjeta');
        assert.equal(primera.valores[UUID(101)].valor, 'Registro de prueba');
        controlador.estado.consultas = normalizarConsultas([consultaCruda(3)]);
        await asentar();
        assert.notEqual(tarjetas()[0], primera);
        assert.equal(tarjetas().length, 1);
    });

    test('un rango de más de 31 días se marca en el formulario y no se pide', async () => {
        const { lista, $, llamadas } = montarLista();
        conectar(lista);
        await asentar();
        $('desde').value = '2026-10-01';
        $('hasta').value = '2026-11-13';
        $('filtro').dispatchEvent(new Event('submit', { cancelable: true }));
        await asentar();
        assert.equal($('error-rango').hidden, false);
        assert.equal($('error-rango').textContent, MENSAJES.rangoExcedido);
        assert.equal($('desde').getAttribute('aria-invalid'), 'true');
        assert.equal(lista.shadowRoot.activeElement, $('desde'));
        assert.equal(llamadas.dashboard.length, 1, 'solo la carga inicial');
        $('desde').value = '2026-10-14';
        $('desde').dispatchEvent(new Event('change'));
        await asentar();
        assert.equal($('error-rango').hidden, true);
        assert.equal($('desde').hasAttribute('aria-invalid'), false);
        $('filtro').dispatchEvent(new Event('submit', { cancelable: true }));
        await asentar();
        assert.deepEqual(llamadas.dashboard.at(-1), { desde: '2026-10-14', hasta: '2026-11-13' });
    });

    test('"Hoy" vuelve a la fecha de hoy y busca', async () => {
        const { lista, $, llamadas } = montarLista();
        conectar(lista);
        await asentar();
        $('desde').value = '2026-11-01';
        $('desde').dispatchEvent(new Event('change'));
        $('hoy').dispatchEvent(new Event('click'));
        await asentar();
        assert.equal($('desde').value, '2026-11-13');
        assert.deepEqual(llamadas.dashboard.at(-1), { desde: '2026-11-13', hasta: '2026-11-13' });
    });

    test('"Atender" en una tarjeta permitida emite navegar a /consulta/<id>; la otra explica el motivo', async () => {
        const { lista, tarjetas, navegaciones } = montarLista();
        conectar(lista);
        await asentar();
        const [permitida, ajena] = tarjetas();
        assert.equal(permitida.motivo, null);
        assert.equal(ajena.motivo, 'Le corresponde a Persona Responsable.');
        conectar(permitida);
        permitida.shadowRoot.getElementById('atender').dispatchEvent(new Event('click'));
        await asentar();
        assert.equal(navegaciones.length, 1);
        assert.deepEqual(navegaciones[0].detail, { ruta: `/consulta/${UUID(1)}` });
        assert.equal(navegaciones[0].bubbles && navegaciones[0].composed, true);
    });

    test('el rol activo no decide: con Atención al público valen pendienteParaMi y el motivo de cada tarjeta', async () => {
        const { lista, tarjetas } = montarLista();
        const marta = sesionCon();
        marta.rolActivo.codigo = 'ADMINISTRACION';
        lista.contexto = { sesion: marta, soloLectura: false };
        conectar(lista);
        await asentar();
        const [propia, ajena] = tarjetas();
        assert.equal(propia.motivo, null);
        assert.equal(ajena.motivo, 'Le corresponde a Persona Responsable.');
    });

    test('si solo falta cerrar la consulta, el botón dice "Cerrar consulta"', async () => {
        const cerrarla = consultaCruda(1);
        cerrarla.procedimientos[0].pasos = cerrarla.procedimientos[0].pasos.map(p => ({ ...p, estado: 'COMPLETADO' }));
        const { lista, tarjetas } = montarLista({ dashboard: async () => [cerrarla, consultaCruda(2)] });
        conectar(lista);
        await asentar();
        const [cierre, normal] = tarjetas();
        conectar(cierre);
        conectar(normal);
        assert.equal(cierre.shadowRoot.getElementById('atender').textContent, 'Cerrar consulta');
        assert.equal(normal.shadowRoot.getElementById('atender').textContent, 'Atender');
    });

    test('sin red, "Atender" se deshabilita en las tarjetas sin reconstruirlas', async () => {
        const { lista, tarjetas, conexion } = montarLista();
        conectar(lista);
        await asentar();
        const primera = tarjetas()[0];
        conexion.emitir(false);
        await asentar();
        assert.equal(tarjetas()[0], primera);
        assert.equal(primera.motivo, MENSAJES.sinRedAtender);
    });

    test('un error del servicio se muestra con "Volver a intentar"', async () => {
        const { lista, $, llamadas } = montarLista({ dashboard: async () => { throw Object.assign(new Error('x'), { status: 403, code: 'auth.rolActivo' }); } });
        conectar(lista);
        await asentar();
        assert.equal($('error').hidden, false);
        assert.equal($('error-texto').textContent, MENSAJES.sinRol);
        $('reintentar').dispatchEvent(new Event('click'));
        await asentar();
        assert.equal(llamadas.dashboard.length, 2);
    });

    test('al desconectarse cancela la suscripción; un cambio de sesión después de reconectar vuelve a buscar', async () => {
        const { lista, controlador, espia, llamadas } = montarLista();
        conectar(lista);
        await asentar();
        desconectar(lista);
        const antes = espia.repintados;
        controlador.estado.error = 'no debe pintarse';
        await asentar();
        assert.equal(espia.repintados, antes);
        lista.sesion = sesionCon(UUID(901)); // desconectada: solo se guarda
        assert.equal(llamadas.dashboard.length, 1);
        conectar(lista);
        await asentar();
        lista.sesion = sesionCon(UUID(902));
        await asentar();
        assert.equal(controlador.estado.sesion.rolActivo.idPersonaRol, UUID(902));
        assert.equal(llamadas.dashboard.length, 3);
    });

    test('"Buscar paciente" filtra las tarjetas y el resumen sin pedir nada al backend', async () => {
        const { lista, $, tarjetas, llamadas } = montarLista({ dashboard: async () => [
            consultaCruda(1, { paciente: { nombres: 'Ana', apellidos: 'Martínez', documentos: [] } }),
            consultaCruda(2, { paciente: { nombres: 'Julia', apellidos: 'Flores', documentos: [] } }),
        ] });
        conectar(lista);
        await asentar();
        assert.equal(tarjetas().length, 2);
        $('busqueda').value = 'flores';
        $('busqueda').dispatchEvent(new Event('input'));
        await asentar();
        assert.equal(tarjetas().length, 1);
        assert.equal(tarjetas()[0].consulta.paciente.nombre, 'Julia Flores');
        assert.equal($('resumen').textContent, '1 de 2 consultas coinciden con «flores».');
        assert.equal(llamadas.dashboard.length, 1);
    });

    test('avisa el título del rango mostrado con "titulo-consultas"', async () => {
        const { lista, controlador } = montarLista();
        const titulos = [];
        lista.addEventListener('titulo-consultas', e => titulos.push(e.detail.titulo));
        conectar(lista);
        await asentar();
        assert.equal(titulos.at(-1), 'Consultas de hoy');
        controlador.cambiarFechas('2026-11-12', '2026-11-12');
        await controlador.buscar();
        await asentar();
        assert.match(titulos.at(-1), /^Consultas del 12 nov.? 2026$/);
    });
});
