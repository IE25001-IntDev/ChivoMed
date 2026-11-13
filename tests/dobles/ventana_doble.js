/**
 * Ventana falsa para probar en node --test los componentes que usan `window`.
 * Solo modela lo que usa la SPA:
 *  - location.hash (asignarlo o replace() emite 'hashchange' si cambia; `historial` guarda cada hash asignado);
 *  - navigator.onLine y los eventos 'online'/'offline' (ver cambiarRed);
 *  - matchMedia('(prefers-color-scheme: dark)') con `matches` modificable (ver cambiarSistema);
 *  - localStorage en memoria, que puede lanzar excepción como en modo privado.
 * Los eventos se emiten sincrónicamente.
 */

export function crearAlmacen({ falla = false } = {}) {
    const datos = new Map();
    const fallar = () => { if (almacen.falla) throw new Error("almacenamiento no disponible"); };
    const almacen = {
        falla,
        getItem(clave) { fallar(); return datos.has(clave) ? datos.get(clave) : null; },
        setItem(clave, valor) { fallar(); datos.set(clave, String(valor)); },
        removeItem(clave) { fallar(); datos.delete(clave); },
        clear() { fallar(); datos.clear(); },
    };
    return almacen;
}

export function crearVentana({ hash = "", enLinea = true, oscuro = false, almacen = crearAlmacen() } = {}) {
    const ventana = new EventTarget();
    let hashActual = hash;
    const fijarHash = valor => {
        const nuevo = valor.startsWith("#") ? valor : `#${valor}`;
        if (nuevo === hashActual) return;
        hashActual = nuevo;
        ventana.dispatchEvent(new Event("hashchange"));
    };
    ventana.historial = [];
    ventana.location = {
        get hash() { return hashActual; },
        set hash(valor) { ventana.historial.push(valor); fijarHash(valor); },
        replace(url) { fijarHash(url.slice(url.indexOf("#"))); },
    };
    ventana.navigator = { onLine: enLinea };
    ventana.cambiarRed = valor => {
        ventana.navigator.onLine = valor;
        ventana.dispatchEvent(new Event(valor ? "online" : "offline"));
    };
    const medio = new EventTarget();
    medio.matches = oscuro;
    ventana.matchMedia = () => medio;
    ventana.cambiarSistema = valor => {
        medio.matches = valor;
        medio.dispatchEvent(new Event("change"));
    };
    ventana.localStorage = almacen;
    return ventana;
}

/** Pone la ventana y sus partes en globalThis (window, location, localStorage). Devuelve cómo restaurarlas. */
export function instalarVentana(ventana) {
    const claves = ["window", "location", "localStorage"];
    const previas = claves.map(clave => Object.getOwnPropertyDescriptor(globalThis, clave));
    const definir = (clave, value) => Object.defineProperty(globalThis, clave, { value, configurable: true, writable: true });
    definir("window", ventana);
    definir("location", ventana.location);
    definir("localStorage", ventana.localStorage);
    return () => claves.forEach((clave, i) => {
        if (previas[i]) Object.defineProperty(globalThis, clave, previas[i]);
        else delete globalThis[clave];
    });
}

/** Espera a que `condicion()` sea verdadera (las rutas cargan sus módulos con import() dinámico). */
export async function hasta(condicion, { ms = 2000, mensaje = "la condición no se cumplió" } = {}) {
    const limite = Date.now() + ms;
    while (!condicion()) {
        if (Date.now() > limite) throw new Error(mensaje);
        await new Promise(resolve => setTimeout(resolve, 2));
    }
}
