/**
 * DOM mínimo para probar Web Components en node --test, sin dependencias.
 * Solo modela lo que usan las vistas: elementos con atributos y propiedades reflejadas
 * (id, className, hidden, disabled, checked, type, name, value), texto, eventos (EventTarget),
 * <template> con innerHTML y content.cloneNode, Shadow DOM abierto, getElementById,
 * querySelector(All) con selectores simples compuestos (tag, #id, .clase, [attr="v"], :checked)
 * foco, click() y remove(), y creación de Web Components registrados con document.createElement. Los eventos no
 * burbujean por el árbol, y agregar un elemento no llama a connectedCallback (usar conectar()).
 * No hay layout, estilos, CSS ni parseo de HTML general: la plantilla debe estar bien formada.
 *
 * instalarDom() pone en globalThis: document, HTMLElement, customElements (los que falten).
 */

const VACIOS = new Set(["input", "link", "br", "img", "meta", "hr"]);
const BOOLEANOS = ["hidden", "disabled", "checked"];

class NodoTexto {
    constructor(texto) { this.nodeType = 3; this.data = texto; this.parentNode = null; }
    get textContent() { return this.data; }
    cloneNode() { return new NodoTexto(this.data); }
}

class Contenedor extends EventTarget {
    constructor() {
        super();
        this.childNodes = [];
        this.parentNode = null;
    }

    get children() { return this.childNodes.filter(n => n instanceof Elemento); }
    get childElementCount() { return this.children.length; }

    get textContent() { return this.childNodes.map(n => n.textContent).join(""); }
    set textContent(valor) { this.replaceChildren(...(valor === "" || valor == null ? [] : [new NodoTexto(String(valor))])); }

    append(...nodos) {
        for (const nodo of nodos) {
            const hijos = nodo instanceof Fragmento ? [...nodo.childNodes] : [typeof nodo === "string" ? new NodoTexto(nodo) : nodo];
            for (const hijo of hijos) {
                hijo.parentNode?.childNodes.splice(hijo.parentNode.childNodes.indexOf(hijo), 1);
                hijo.parentNode = this;
                this.childNodes.push(hijo);
            }
        }
    }

    replaceChildren(...nodos) {
        for (const hijo of this.childNodes) hijo.parentNode = null;
        this.childNodes = [];
        this.append(...nodos);
    }

    *descendientes() {
        for (const hijo of this.children) {
            yield hijo;
            yield* hijo.descendientes();
        }
    }

    querySelectorAll(selector) {
        const coincide = compilar(selector);
        return [...this.descendientes()].filter(coincide);
    }

    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }

    getElementById(id) { return [...this.descendientes()].find(e => e.id === id) ?? null; }
}

class Fragmento extends Contenedor {
    cloneNode() {
        const copia = new Fragmento();
        copia.append(...this.childNodes.map(n => n.cloneNode(true)));
        return copia;
    }
}

class RaizSombra extends Contenedor {
    constructor(host) { super(); this.host = host; this.activeElement = null; }
}

class Elemento extends Contenedor {
    constructor(tag) {
        super();
        this.localName = tag.toLowerCase();
        this.tagName = tag.toUpperCase();
        this.atributos = new Map();
        this.hidden = false;
        this.disabled = false;
        this.checked = false;
    }

    getAttribute(nombre) { return this.atributos.get(nombre) ?? null; }
    hasAttribute(nombre) { return this.atributos.has(nombre); }
    removeAttribute(nombre) { this.atributos.delete(nombre); }
    setAttribute(nombre, valor) {
        if (BOOLEANOS.includes(nombre)) { this[nombre] = true; return; }
        this.atributos.set(nombre, String(valor));
    }

    get id() { return this.getAttribute("id") ?? ""; }
    set id(v) { this.setAttribute("id", v); }
    get className() { return this.getAttribute("class") ?? ""; }
    set className(v) { this.setAttribute("class", v); }
    get name() { return this.getAttribute("name") ?? ""; }
    set name(v) { this.setAttribute("name", v); }
    get type() { return this.getAttribute("type") ?? ""; }
    set type(v) { this.setAttribute("type", v); }
    get value() { return this.getAttribute("value") ?? ""; }
    set value(v) { this.setAttribute("value", v); }

    /** Como en el navegador, marcar un radio desmarca los demás del mismo grupo en su raíz. */
    get checked() { return this._checked; }
    set checked(v) {
        this._checked = Boolean(v);
        if (this._checked && this.type === "radio" && this.name) {
            for (const otro of raizDe(this).querySelectorAll(`input[name="${this.name}"]`)) if (otro !== this) otro._checked = false;
        }
    }

    focus() {
        const raiz = raizDe(this);
        if (raiz instanceof RaizSombra) raiz.activeElement = this;
    }

    /** Como el navegador: emite 'click' (sin burbujear; ver la nota de arriba). */
    click() { this.dispatchEvent(new Event("click")); }

    remove() { this.parentNode?.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1); this.parentNode = null; }

    cloneNode(profundo = false) {
        const copia = crearElemento(this.localName);
        for (const [k, v] of this.atributos) copia.atributos.set(k, v);
        for (const b of BOOLEANOS) copia[b] = this[b];
        if (profundo) copia.append(...this.childNodes.map(n => n.cloneNode(true)));
        return copia;
    }
}

class Plantilla extends Elemento {
    constructor() { super("template"); this.content = new Fragmento(); }
    set innerHTML(html) { this.content.replaceChildren(...parsear(html)); }
}

function raizDe(nodo) {
    let actual = nodo;
    while (actual.parentNode) actual = actual.parentNode;
    return actual;
}

/** Selector simple compuesto: tag#id.clase[attr="valor"]:checked (sin combinadores ni listas). */
function compilar(selector) {
    const tag = /^[a-z][a-z0-9-]*/i.exec(selector)?.[0]?.toLowerCase();
    const id = /#([\w-]+)/.exec(selector)?.[1];
    const clases = [...selector.matchAll(/\.([\w-]+)/g)].map(m => m[1]);
    const atributos = [...selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map(m => [m[1], m[2]]);
    const marcado = selector.includes(":checked");
    return e => (!tag || e.localName === tag) && (!id || e.id === id)
        && clases.every(c => e.className.split(/\s+/).includes(c))
        && atributos.every(([k, v]) => (v === undefined ? e.hasAttribute(k) : e.getAttribute(k) === v))
        && (!marcado || e.checked);
}

/** Parser mínimo para plantillas bien formadas: etiquetas, atributos con comillas dobles y texto. */
function parsear(html) {
    const raiz = new Fragmento();
    const pila = [raiz];
    const token = /<\/([a-z][a-z0-9-]*)\s*>|<([a-z][a-z0-9-]*)((?:\s+[a-z-]+(?:="[^"]*")?)*)\s*\/?>|([^<]+)/gi;
    for (const [, cierre, apertura, atributos, texto] of html.matchAll(token)) {
        const actual = pila.at(-1);
        if (texto !== undefined) {
            if (texto.trim()) actual.append(new NodoTexto(texto.replace(/\s+/g, " ")));
        } else if (cierre) {
            if (pila.length > 1) pila.pop();
        } else {
            const elemento = crearElemento(apertura);
            for (const [, k, v] of (atributos ?? "").matchAll(/([a-z-]+)(?:="([^"]*)")?/gi)) elemento.setAttribute(k, v ?? "");
            actual.append(elemento);
            if (!VACIOS.has(elemento.localName)) pila.push(elemento);
        }
    }
    return raiz.childNodes.slice();
}

/** Como el navegador: un tag registrado en customElements crea una instancia de su clase. */
function crearElemento(tag) {
    const nombre = tag.toLowerCase();
    if (nombre === "template") return new Plantilla();
    const Clase = globalThis.customElements?.get?.(nombre);
    if (Clase) {
        const elemento = new Clase();
        elemento.localName = nombre;
        elemento.tagName = nombre.toUpperCase();
        return elemento;
    }
    return new Elemento(tag);
}

class HTMLElementDoble extends Elemento {
    constructor() {
        super("elemento-personalizado");
        this.shadowRoot = null;
        this.isConnected = false;
    }

    attachShadow() {
        this.shadowRoot = new RaizSombra(this);
        return this.shadowRoot;
    }
}

/** Instala los globales que falten. Devuelve el registro de customElements. */
export function instalarDom() {
    const registro = globalThis.customElements?.registro ?? new Map();
    if (!globalThis.HTMLElement) globalThis.HTMLElement = HTMLElementDoble;
    if (!globalThis.customElements) {
        globalThis.customElements = {
            registro,
            define(nombre, clase) {
                if (registro.has(nombre)) throw new Error(`${nombre} ya está definido`);
                registro.set(nombre, clase);
            },
            get: nombre => registro.get(nombre),
        };
    }
    if (!globalThis.document) {
        const documento = new EventTarget();
        documento.createElement = crearElemento;
        globalThis.document = documento;
    }
    return registro;
}

/** Simula insertar y quitar el componente del documento. */
export function conectar(elemento) {
    elemento.isConnected = true;
    elemento.connectedCallback?.();
    return elemento;
}

export function desconectar(elemento) {
    elemento.isConnected = false;
    elemento.disconnectedCallback?.();
    return elemento;
}
