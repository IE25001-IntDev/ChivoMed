import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import PersonaService from '../src/js/control/persona_service.js';

describe('PersonaService (Caché en Memoria, Deduplicación y Concurrencia P1-1)', () => {
    beforeEach(() => {
        PersonaService.limpiarCache();
    });

    test('Deduplicación en vuelo: 10 llamadas concurrentes con el mismo ID sólo disparan 1 petición HTTP', async () => {
        let llamadasRed = 0;
        const fakeFetch = async () => {
            llamadasRed++;
            await new Promise(r => setTimeout(r, 20));
            return new Response(JSON.stringify({
                idPersona: 'uuid-1234',
                nombres: 'Carlos',
                apellidos: 'Mendoza'
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        };

        const servicio = new PersonaService({ fetchImpl: fakeFetch, baseUrl: 'http://test' });

        const promesas = Array.from({ length: 10 }, () => servicio.buscarPorId('uuid-1234'));
        const resultados = await Promise.all(promesas);

        assert.equal(llamadasRed, 1, 'Debió disparar exactamente 1 petición de red (deduplicada)');
        assert.equal(resultados.length, 10);
        for (const res of resultados) {
            assert.equal(res.data.nombres, 'Carlos');
        }
    });

    test('Cola de concurrencia: al solicitar 8 IDs distintos concurrentemente, nunca se superan 4 peticiones activas simultáneas', async () => {
        let activas = 0;
        let maxConcurrencia = 0;
        let peticionesTotales = 0;

        const fakeFetch = async (url) => {
            peticionesTotales++;
            activas++;
            if (activas > maxConcurrencia) {
                maxConcurrencia = activas;
            }
            // Simular latencia de red
            await new Promise(r => setTimeout(r, 25));
            activas--;

            const id = url.split('/').pop();
            return new Response(JSON.stringify({
                idPersona: id,
                nombres: `Persona-${id}`
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        };

        const servicio = new PersonaService({ fetchImpl: fakeFetch, baseUrl: 'http://test' });

        const promesas = Array.from({ length: 8 }, (_, i) => servicio.buscarPorId(`uuid-distinto-${i}`));
        const resultados = await Promise.all(promesas);

        assert.equal(peticionesTotales, 8, 'Deben ejecutarse las 8 peticiones');
        assert.equal(resultados.length, 8);
        assert.ok(maxConcurrencia <= 4, `La concurrencia máxima fue ${maxConcurrencia}, no debe superar 4`);
        assert.equal(maxConcurrencia, 4, 'Debió alcanzar exactamente el límite de concurrencia (4)');
    });

    test('Caché en memoria: llamadas subsecuentes no hacen petición a la red', async () => {
        let llamadasRed = 0;
        const fakeFetch = async () => {
            llamadasRed++;
            return new Response(JSON.stringify({
                idPersona: 'uuid-5678',
                nombres: 'Elena'
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        };

        const servicio = new PersonaService({ fetchImpl: fakeFetch, baseUrl: 'http://test' });

        const res1 = await servicio.buscarPorId('uuid-5678');
        assert.equal(llamadasRed, 1);
        assert.equal(res1.data.nombres, 'Elena');

        const res2 = await servicio.buscarPorId('uuid-5678');
        assert.equal(llamadasRed, 1, 'No debe realizar una segunda petición de red');
        assert.equal(res2.data.nombres, 'Elena');
    });

    test('Invalidación de caché al actualizar, modificar o eliminar', async () => {
        let llamadasRed = 0;
        const fakeFetch = async (url, opts = {}) => {
            llamadasRed++;
            const method = opts.method || 'GET';
            return new Response(JSON.stringify({
                idPersona: 'uuid-crud',
                nombres: method === 'GET' ? 'Original' : 'Modificado'
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        };

        const servicio = new PersonaService({ fetchImpl: fakeFetch, baseUrl: 'http://test' });

        // 1. Cargar en caché
        await servicio.buscarPorId('uuid-crud');
        assert.equal(PersonaService.tamanoCache(), 1);

        // 2. Invalidar con actualizar (PUT)
        await servicio.actualizar('uuid-crud', { nombres: 'Actualizado' });
        assert.equal(PersonaService.tamanoCache(), 0, 'actualizar debe invalidar la caché');

        // 3. Volver a cargar en caché
        await servicio.buscarPorId('uuid-crud');
        assert.equal(PersonaService.tamanoCache(), 1);

        // 4. Invalidar con modificar (PATCH)
        await servicio.modificar('uuid-crud', { nombres: 'Parcial' });
        assert.equal(PersonaService.tamanoCache(), 0, 'modificar debe invalidar la caché');

        // 5. Volver a cargar en caché
        await servicio.buscarPorId('uuid-crud');
        assert.equal(PersonaService.tamanoCache(), 1);

        // 6. Invalidar con eliminar (DELETE)
        await servicio.eliminar('uuid-crud');
        assert.equal(PersonaService.tamanoCache(), 0, 'eliminar debe invalidar la caché');
    });

    test('Prevención de condición de carrera: respuesta tardía en vuelo no repuebla caché tras invalidación', async () => {
        let responderLectura;
        const fakeFetch = async (url, opts = {}) => {
            const method = opts.method || 'GET';
            if (method === 'GET') {
                // Simular respuesta lenta que se demora
                return new Promise(resolve => {
                    responderLectura = () => resolve(new Response(JSON.stringify({
                        idPersona: 'uuid-carrera',
                        nombres: 'DatoViejo'
                    }), {
                        status: 200,
                        headers: { 'Content-Type': 'application/json' }
                    }));
                });
            }
            // Actualización rápida
            return new Response(JSON.stringify({
                idPersona: 'uuid-carrera',
                nombres: 'DatoNuevo'
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        };

        const servicio = new PersonaService({ fetchImpl: fakeFetch, baseUrl: 'http://test' });

        // 1. Iniciar lectura lenta (queda en vuelo)
        const promesaLectura = servicio.buscarPorId('uuid-carrera');

        // 2. Antes de que termine la lectura, se dispara una actualización
        await servicio.actualizar('uuid-carrera', { nombres: 'DatoNuevo' });

        // 3. Ahora termina la lectura lenta que traía datos viejos
        responderLectura();
        await promesaLectura;

        // 4. La caché NO debe haber sido repoblada con el dato viejo
        assert.equal(PersonaService.tamanoCache(), 0, 'La caché no debe contener datos viejos tras una invalidación concurrente');
    });

    test('Aislamiento de caché y peticiones en vuelo por baseUrl', async () => {
        let llamadasServicioA = 0;
        let llamadasServicioB = 0;

        const fakeFetchA = async () => {
            llamadasServicioA++;
            await new Promise(r => setTimeout(r, 20));
            return new Response(JSON.stringify({ idPersona: '1', nombres: 'Persona A' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        };

        const fakeFetchB = async () => {
            llamadasServicioB++;
            await new Promise(r => setTimeout(r, 20));
            return new Response(JSON.stringify({ idPersona: '1', nombres: 'Persona B' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        };

        const servicioA = new PersonaService({ fetchImpl: fakeFetchA, baseUrl: 'http://servidor-a' });
        const servicioB = new PersonaService({ fetchImpl: fakeFetchB, baseUrl: 'http://servidor-b' });

        // Disparar simultáneamente: no deben deduplicarse entre sí por tener baseUrl distinto
        const [resA, resB] = await Promise.all([
            servicioA.buscarPorId('1'),
            servicioB.buscarPorId('1')
        ]);

        assert.equal(llamadasServicioA, 1);
        assert.equal(llamadasServicioB, 1);
        assert.equal(resA.data.nombres, 'Persona A');
        assert.equal(resB.data.nombres, 'Persona B');
    });

    test('Búsqueda iniciada tras mutación no comparte una petición en vuelo obsoleta', async () => {
        let peticionesGet = 0;
        let responderPrimeraLectura;

        const fakeFetch = async (url, opts = {}) => {
            const method = opts.method || 'GET';
            if (method === 'GET') {
                peticionesGet++;
                if (peticionesGet === 1) {
                    return new Promise(resolve => {
                        responderPrimeraLectura = () => resolve(new Response(JSON.stringify({
                            idPersona: 'uuid-desvinculada',
                            nombres: 'DatoViejo'
                        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
                    });
                }
                // Segunda lectura tras la mutación
                return new Response(JSON.stringify({
                    idPersona: 'uuid-desvinculada',
                    nombres: 'DatoFresco'
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            // PUT
            return new Response(JSON.stringify({
                idPersona: 'uuid-desvinculada',
                nombres: 'DatoFresco'
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        };

        const servicio = new PersonaService({ fetchImpl: fakeFetch, baseUrl: 'http://test' });

        // 1. Iniciar primera lectura (queda en vuelo)
        const p1 = servicio.buscarPorId('uuid-desvinculada');

        // 2. Ocurre una mutación concurrente
        await servicio.actualizar('uuid-desvinculada', { nombres: 'DatoFresco' });

        // 3. Se inicia una segunda lectura mientras la primera sigue en el limbo
        const p2 = servicio.buscarPorId('uuid-desvinculada');

        // 4. Ahora resuelve la primera lectura antigua
        responderPrimeraLectura();

        const [res1, res2] = await Promise.all([p1, p2]);

        assert.equal(res1.data.nombres, 'DatoViejo', 'La primera petición devolvió su resultado');
        assert.equal(res2.data.nombres, 'DatoFresco', 'La búsqueda posterior no debió reutilizar la promesa obsoleta');
        assert.equal(peticionesGet, 2, 'Debieron ejecutarse 2 peticiones GET separadas');
    });

    test('Soporta ID falsy válido como 0 sin deshabilitar caché ni deduplicación', async () => {
        let llamadasRed = 0;
        const fakeFetch = async () => {
            llamadasRed++;
            return new Response(JSON.stringify({
                idPersona: '0',
                nombres: 'Cero'
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        };

        const servicio = new PersonaService({ fetchImpl: fakeFetch, baseUrl: 'http://test' });

        const [r1, r2] = await Promise.all([
            servicio.buscarPorId(0),
            servicio.buscarPorId(0)
        ]);

        assert.equal(llamadasRed, 1, 'Deduplica también para ID numérico 0');
        assert.equal(r1.data.nombres, 'Cero');
        assert.equal(r2.data.nombres, 'Cero');
        assert.equal(PersonaService.tamanoCache(), 1, 'Guarda en caché ID 0');
    });
});
