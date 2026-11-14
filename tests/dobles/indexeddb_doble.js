/**
 * Doble mínimo de IndexedDB para node --test: solo lo que usa src/js/boundary/pwa/almacen_offline.js
 * (open con onupgradeneeded, objectStoreNames.contains, createObjectStore, transaction con
 * objectStore get/put/delete/clear y los eventos success, error y complete).
 *
 * Los valores se copian con structuredClone, como en el navegador: lo leído nunca es el mismo
 * objeto que se guardó y las fechas siguen siendo Date. Para simular una recarga de la página se
 * crea otro almacén con la misma fábrica: los datos quedan en `bases`.
 */
const asincrono = fn => setTimeout(fn, 0);

export function crearIndexedDbDoble({ fallarAlAbrir = false, fallarAlEscribir = false } = {}) {
    const bases = new Map();
    const fabrica = {
        aperturas: 0,
        bases,
        open(nombre) {
            fabrica.aperturas++;
            const solicitud = { result: undefined, error: null };
            asincrono(() => {
                if (fallarAlAbrir) {
                    solicitud.error = new Error("No se pudo abrir");
                    solicitud.onerror?.();
                    return;
                }
                const nueva = !bases.has(nombre);
                if (nueva) bases.set(nombre, new Map());
                const almacenes = bases.get(nombre);
                solicitud.result = {
                    objectStoreNames: { contains: n => almacenes.has(n) },
                    createObjectStore: n => { almacenes.set(n, new Map()); },
                    transaction(n, modo) {
                        const datos = almacenes.get(n);
                        const transaccion = { error: null };
                        const peticion = resultado => ({ result: resultado });
                        transaccion.objectStore = () => ({
                            get: clave => peticion(datos.has(clave) ? structuredClone(datos.get(clave)) : undefined),
                            put: (valor, clave) => {
                                if (modo !== "readwrite") throw new Error("Transacción de solo lectura");
                                if (!fallarAlEscribir) datos.set(clave, structuredClone(valor));
                                return peticion(clave);
                            },
                            delete: clave => { datos.delete(clave); return peticion(undefined); },
                            clear: () => { datos.clear(); return peticion(undefined); },
                        });
                        asincrono(() => {
                            if (fallarAlEscribir && modo === "readwrite") {
                                transaccion.error = new Error("Sin espacio");
                                transaccion.onerror?.();
                            } else {
                                transaccion.oncomplete?.();
                            }
                        });
                        return transaccion;
                    },
                };
                if (nueva) solicitud.onupgradeneeded?.();
                solicitud.onsuccess?.();
            });
            return solicitud;
        },
    };
    return fabrica;
}
