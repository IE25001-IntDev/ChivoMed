import './components/patient_nav.js';
import './components/simple_card.js';
import './components/card_consulta.js';
import PatientPortalService from '../control/patient_portal_service.js';
import { API_CONFIG } from '../control/api_config.js';
import { fecha, estadoConsulta, fechaResultado, resultadoReciente, enlaceAdjunto } from './patient_format.js';

const portal = new PatientPortalService();
const main = document.querySelector('main');
const pagina = document.body.dataset.page;
const titulos = {
    inicio: ['Tu salud, en un solo lugar', 'Consulta tu expediente y sigue cada etapa de tu atención.'],
    documentos: ['Mis documentos', 'Consulta y registra los documentos de tu expediente.'],
    consultas: ['Citas y consultas', 'Revisa tus atenciones en curso y tu historial de consultas.'],
    examenes: ['Mis exámenes', 'Consulta las órdenes de tus consultas y sus resultados recientes.'],
};
main.innerHTML = `<div class="hero"><div><span class="eyebrow">Portal del paciente</span><h1></h1><p class="intro"></p><p id="patient-context" class="context-label"></p></div><div class="portal-actions"><button id="refresh" class="secondary" type="button">Actualizar</button>${pagina === 'documentos' ? '<button id="open-form" type="button" disabled aria-expanded="false" aria-controls="record-form">+ Registrar documento</button>' : ''}</div></div><p id="feedback" role="status" class="status" aria-live="polite"></p><div id="error" class="notice portal-error" role="alert" hidden></div><section id="workspace"></section><footer class="page-footer">✚ ChivoMed · Tu espacio de salud y bienestar</footer>`;
main.querySelector('h1').textContent = titulos[pagina][0];
main.querySelector('.intro').textContent = titulos[pagina][1];
const workspace = document.querySelector('#workspace');
workspace.setAttribute('aria-label', titulos[pagina][0]);
const feedback = document.querySelector('#feedback');
const errorPanel = document.querySelector('#error');
const identidad = document.querySelector('#patient-context');
const refresh = document.querySelector('#refresh');
const openForm = document.querySelector('#open-form');
let controller;
let datos;
let enviando = false;

function nodo(tag, texto, clase) {
    const element = document.createElement(tag);
    if (texto !== undefined) element.textContent = texto;
    if (clase) element.className = clase;
    return element;
}
function enlace(texto, url) { const a = nodo('a', texto); a.href = url; return a; }
function tarjeta(titulo, contenido, pie) {
    const card = document.createElement('tarjeta-simple');
    for (const [slot, value] of [['titulo', titulo], ['contenido', contenido], ['pie', pie]]) {
        const div = nodo('div'); div.slot = slot;
        if (value instanceof Node) div.append(value); else div.textContent = value ?? '';
        card.append(div);
    }
    return card;
}
function vacio(contenedor, mensaje) { contenedor.append(nodo('p', mensaje, 'empty')); }
function adjunto(ruta, texto) {
    const url = enlaceAdjunto(ruta, API_CONFIG.baseUrl, location.href);
    if (!url) return nodo('span', ruta ? 'El adjunto tiene una ruta interna; solicítalo a tu clínica.' : 'Sin adjunto');
    const a = enlace(texto, url); a.target = '_blank'; a.rel = 'noopener noreferrer'; return a;
}
function mostrarError(error) {
    const mensaje = error.status === 401 ? 'Tu sesión requiere identificación. Selecciona tu rol de paciente en Galeno y vuelve a actualizar.'
        : error.status === 403 ? (error.message || 'No tienes acceso al portal del paciente con la sesión actual.')
        : ['conexion.error', 'galeno.noDisponible'].includes(error.code) ? 'No se pudo conectar con Galeno. Comprueba que el servicio esté disponible y vuelve a actualizar.'
        : error.status >= 500 ? 'Galeno no pudo completar la operación. Intenta de nuevo en unos momentos.'
        : error.message || 'No se pudo completar la operación.';
    errorPanel.replaceChildren(nodo('p', mensaje));
    if (Array.isArray(error.details) && error.details.length) {
        const list = nodo('ul');
        error.details.forEach(detail => list.append(nodo('li', detail.message || 'Revisa los datos ingresados.')));
        errorPanel.append(list);
    }
    if (error.status === 401 || error.status === 403) {
        const base = API_CONFIG.baseUrl.replace(/\/api\/?$/, '/');
        const a = enlace('Abrir selección de rol en Galeno', `${base}paginas/cambiar-rol.xhtml`);
        a.target = '_blank'; a.rel = 'noopener'; errorPanel.append(a);
    }
    errorPanel.hidden = false;
}
function consultaCard(consulta) {
    const card = document.createElement('tarjeta-consulta'); card.consulta = consulta; return card;
}
function inicio() {
    const grid = nodo('div', undefined, 'grid');
    const abiertas = datos.consultas.filter(c => !c.fechaFin);
    const pendientes = datos.examenes.filter(e => !e.resultados.length);
    for (const [titulo, total, detalle, url] of [
        ['Mis documentos', datos.documentos.length, 'Documentos en tu expediente', 'documentos.html'],
        ['Consultas en curso', abiertas.length, 'Atenciones abiertas en tu clínica', 'consultas.html'],
        ['Órdenes pendientes', pendientes.length, 'Órdenes que aún no tienen resultados', 'examenes.html'],
    ]) {
        const content = nodo('div'); content.append(nodo('strong', total, 'metric'), nodo('span', detalle));
        grid.append(tarjeta(titulo, content, enlace('Ver detalles →', url)));
    }
    workspace.append(grid, nodo('h2', 'Tu atención actual'));
    const consultas = nodo('div', undefined, 'grid');
    abiertas.forEach(c => consultas.append(consultaCard(c)));
    if (!abiertas.length) vacio(consultas, 'No tienes consultas en curso en esta clínica.');
    workspace.append(consultas);
    workspace.append(tarjeta('Tu historial de atención', 'Revisa tus consultas finalizadas y sus resultados en el expediente de tu clínica.', enlace('Ver mis consultas →', 'consultas.html')));
}
function selector(label, opciones) {
    const toolbar = nodo('div', undefined, 'toolbar');
    const lbl = nodo('label', label); lbl.htmlFor = 'filter';
    const select = nodo('select'); select.id = 'filter';
    for (const [value, text] of opciones) { const option = nodo('option', text); option.value = value; select.append(option); }
    toolbar.append(lbl, select);
    return { toolbar, select };
}
function documentos() {
    const { toolbar, select } = selector('Tipo de documento', [['', 'Todos'], ...datos.tiposDocumento.map(t => [t.idTipoDocumento, t.nombre])]);
    const grid = nodo('div', undefined, 'grid'); grid.setAttribute('aria-live', 'polite');
    const form = nodo('form'); form.id = 'record-form'; form.hidden = true;
    form.innerHTML = '<h2>Registrar documento</h2><label>Tipo de documento<select name="idTipoDocumento" required></select></label><p id="type-help" class="field-help"></p><label>Número o referencia<input name="valor" required maxlength="255" placeholder="Número de identificación o referencia"></label><label>Ruta o enlace del adjunto (opcional)<input name="rutaFisica" maxlength="255" aria-describedby="attachment-help"></label><p id="attachment-help" class="field-help">Puedes asociar un archivo ya disponible mediante su ruta o enlace. La carga de archivos aún no está disponible.</p><button type="submit">Guardar documento</button> <button type="button" class="secondary" id="cancel">Cancelar</button>';
    const typeSelect = form.elements.idTipoDocumento;
    const activos = datos.tiposDocumento.filter(t => t.activo === true);
    for (const tipo of activos) { const option = nodo('option', tipo.nombre); option.value = tipo.idTipoDocumento; typeSelect.append(option); }
    function typeHelp() {
        form.querySelector('#type-help').textContent = activos.find(t => t.idTipoDocumento === typeSelect.value)?.indicaciones ?? '';
    }
    typeSelect.addEventListener('change', typeHelp); typeHelp();
    function toggle(show) {
        form.hidden = !show;
        openForm.setAttribute('aria-expanded', String(show));
        if (show) typeSelect.focus(); else openForm.focus();
    }
    openForm.disabled = !activos.length;
    openForm.onclick = () => toggle(form.hidden);
    form.querySelector('#cancel').onclick = () => toggle(false);
    if (!activos.length) workspace.append(nodo('p', 'Tu clínica no tiene tipos de documento activos para nuevos registros.', 'notice'));
    workspace.append(form, toolbar, grid);
    function render() {
        grid.replaceChildren();
        for (const doc of datos.documentos.filter(d => !select.value || d.idTipoDocumento === select.value)) {
            const tipo = datos.tiposDocumento.find(t => t.idTipoDocumento === doc.idTipoDocumento);
            grid.append(tarjeta(tipo?.nombre || 'Documento', doc.valor, adjunto(doc.rutaFisica, 'Abrir adjunto ↗')));
        }
        if (!grid.childElementCount) vacio(grid, 'No hay documentos registrados para este filtro.');
    }
    select.addEventListener('change', render); render();
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (enviando) return;
        const payload = Object.fromEntries(new FormData(form));
        if (!payload.valor.trim()) { form.elements.valor.focus(); feedback.textContent = 'Escribe el número o referencia del documento.'; return; }
        enviando = true; refresh.disabled = true; openForm.disabled = true;
        errorPanel.hidden = true; feedback.textContent = 'Guardando documento en Galeno…';
        const controls = [...form.querySelectorAll('button,input,select')]; controls.forEach(c => { c.disabled = true; });
        try {
            const documento = await portal.registrarDocumento(datos.contexto, payload, { signal: controller.signal });
            datos.documentos = datos.documentos.filter(d => d.idDocumento !== documento.idDocumento);
            datos.documentos.push(documento);
            select.value = ''; form.reset(); typeHelp(); render();
            feedback.textContent = 'Documento registrado en tu expediente de Galeno.';
            toggle(false);
        } catch (error) {
            if (error.code !== 'solicitud.cancelada') { feedback.textContent = ''; mostrarError(error); }
            if (['sesion.cambio', 'sesion.rolPacienteRequerido', 'sesion.pacienteRequerida'].includes(error.code) || [401, 403].includes(error.status)) {
                workspace.replaceChildren(); identidad.textContent = ''; datos = null;
            }
        } finally {
            enviando = false; refresh.disabled = false;
            controls.forEach(c => { c.disabled = false; });
            openForm.disabled = !datos || !activos.length;
            if (form.hidden && datos) openForm.focus();
            if (!form.hidden && form.isConnected) form.elements.valor.focus();
        }
    });
}
function consultas() {
    workspace.append(nodo('p', 'Para programar una cita futura, comunícate con tu clínica. La agenda en línea aún no está disponible.', 'notice'));
    const { toolbar, select } = selector('Mostrar consultas', [['', 'Todas'], ['abiertas', 'En curso'], ['finalizadas', 'Finalizadas']]);
    const grid = nodo('div', undefined, 'grid'); grid.setAttribute('aria-live', 'polite');
    workspace.append(toolbar, grid);
    function render() {
        grid.replaceChildren();
        const items = datos.consultas.filter(c => !select.value || (select.value === 'finalizadas' ? Boolean(c.fechaFin) : !c.fechaFin));
        items.sort((a, b) => (Date.parse(b.fechaInicio) || 0) - (Date.parse(a.fechaInicio) || 0));
        items.forEach(c => grid.append(consultaCard(c)));
        if (!items.length) vacio(grid, 'No hay consultas para mostrar en esta clínica con el filtro seleccionado.');
    }
    select.addEventListener('change', render); render();
}
function examenes() {
    const { toolbar, select } = selector('Mostrar exámenes', [['', 'Todos'], ['pendientes', 'Pendientes de resultados'], ['recientes', 'Con resultados en los últimos 30 días']]);
    const grid = nodo('div', undefined, 'grid'); grid.setAttribute('aria-live', 'polite');
    workspace.append(toolbar, grid);
    function render() {
        grid.replaceChildren();
        const items = datos.examenes.filter(r => !select.value || (select.value === 'pendientes' ? !r.resultados.length : resultadoReciente(r)));
        items.sort((a, b) => (Date.parse(fechaResultado(b) || b.orden.fechaCreacion) || 0) - (Date.parse(fechaResultado(a) || a.orden.fechaCreacion) || 0));
        for (const registro of items) {
            const { orden, resultados, consulta } = registro;
            const content = nodo('div');
            content.append(nodo('p', orden.indicaciones || 'Sin indicaciones adicionales.'), nodo('p', `Orden emitida: ${fecha(orden.fechaCreacion)}`), nodo('p', `Consulta: ${fecha(consulta.fechaInicio)} · ${estadoConsulta(consulta)}`));
            for (const resultado of resultados) {
                const details = nodo('details');
                details.append(nodo('summary', `Resultado del ${fecha(resultado.fechaCreacion)}`), nodo('p', resultado.resultado || 'Sin descripción.'));
                if (resultado.interpretacion) details.append(nodo('p', `Interpretación: ${resultado.interpretacion}`));
                if (resultado.rutaAtestado) details.append(adjunto(resultado.rutaAtestado, 'Abrir atestado ↗'));
                content.append(details);
            }
            grid.append(tarjeta('Orden de examen', content, resultados.length ? 'Con resultados disponibles' : 'Pendiente de resultados'));
        }
        if (!items.length) vacio(grid, 'No hay órdenes de examen para el filtro seleccionado en tus consultas de esta clínica.');
    }
    select.addEventListener('change', render); render();
}
async function cargar() {
    if (enviando) return;
    controller?.abort(); controller = new AbortController();
    const actual = controller;
    datos = null; workspace.replaceChildren(); identidad.textContent = '';
    errorPanel.hidden = true; feedback.textContent = 'Consultando tu expediente en Galeno…';
    refresh.disabled = true; if (openForm) { openForm.disabled = true; openForm.setAttribute('aria-expanded', 'false'); }
    workspace.setAttribute('aria-busy', 'true');
    try {
        const respuesta = await portal.cargar(pagina, { signal: actual.signal });
        if (actual.signal.aborted) return;
        datos = respuesta;
        identidad.textContent = `${[datos.contexto.persona.nombres, datos.contexto.persona.apellidos].filter(Boolean).join(' ')} · ${datos.contexto.clinica.nombre}`;
        ({ inicio, documentos, consultas, examenes })[pagina]();
        feedback.textContent = '';
    } catch (error) {
        if (!actual.signal.aborted) { feedback.textContent = ''; mostrarError(error); }
    } finally {
        if (controller === actual) { refresh.disabled = false; workspace.setAttribute('aria-busy', 'false'); }
    }
}
refresh.addEventListener('click', cargar);
window.addEventListener('pagehide', () => controller?.abort());
window.addEventListener('pageshow', event => { if (event.persisted) cargar(); });
cargar();
