import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import DefaultService from '../src/js/control/default_service.js';
import DefaultEntity from '../src/js/entities/default_entity.js';
import DefaultResponse from '../src/js/entities/default_response.js';
import DefaultError from '../src/js/entities/default_error.js';

class MockEntity extends DefaultEntity {
    constructor(datos = {}) {
        super({ id: null, nombre: null, activo: false }, datos);
    }
}

describe('DefaultService (Suite de Pruebas Unitarias P2-2)', () => {

    test('listar() sin filtros realiza GET a la ruta base del recurso', async () => {
        let peticionCapturada = null;
        const fakeFetch = async (url, opts) => {
            peticionCapturada = { url, opts };
            return new Response(JSON.stringify([{ id: '1', nombre: 'Test 1' }]), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        };

        const servicio = new DefaultService('elementos', MockEntity, {
            baseUrl: 'http://api.local/galenosv',
            fetchImpl: fakeFetch
        });

        const res = await servicio.listar();
        assert.equal(peticionCapturada.opts.method, 'GET');
        assert.equal(peticionCapturada.url, 'http://api.local/galenosv/elementos');
        assert.ok(res instanceof DefaultResponse);
        assert.equal(res.status, 200);
        assert.equal(res.data.length, 1);
        assert.ok(res.data[0] instanceof MockEntity);
        assert.equal(res.data[0].nombre, 'Test 1');
    });

    test('listar() con filtros serializa correctamente query params y filtra nulos/indefinidos', async () => {
        let urlCapturada = null;
        const fakeFetch = async (url) => {
            urlCapturada = url;
            return new Response(JSON.stringify([]), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        };

        const servicio = new DefaultService('elementos', MockEntity, {
            baseUrl: 'http://api.local',
            fetchImpl: fakeFetch
        });

        await servicio.listar({
            pagina: 2,
            limite: 25,
            orden: 'nombre,asc',
            activo: true,
            ignorado: null,
            indefinido: undefined
        });

        const url = new URL(urlCapturada);
        assert.equal(url.searchParams.get('pagina'), '2');
        assert.equal(url.searchParams.get('limite'), '25');
        assert.equal(url.searchParams.get('orden'), 'nombre,asc');
        assert.equal(url.searchParams.get('activo'), 'true');
        assert.equal(url.searchParams.has('ignorado'), false);
        assert.equal(url.searchParams.has('indefinido'), false);
    });

    test('buscarPorId() con 200 OK devuelve entidad mapeada', async () => {
        let peticionCapturada = null;
        const fakeFetch = async (url, opts) => {
            peticionCapturada = { url, opts };
            return new Response(JSON.stringify({ id: 'uuid-100', nombre: 'Elemento 100', activo: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        };

        const servicio = new DefaultService('elementos', MockEntity, {
            baseUrl: 'http://api.local',
            fetchImpl: fakeFetch
        });

        const res = await servicio.buscarPorId('uuid-100');
        assert.equal(peticionCapturada.url, 'http://api.local/elementos/uuid-100');
        assert.equal(peticionCapturada.opts.method, 'GET');
        assert.ok(res.data instanceof MockEntity);
        assert.equal(res.data.id, 'uuid-100');
        assert.equal(res.data.nombre, 'Elemento 100');
        assert.equal(res.data.activo, true);
    });

    test('buscarPorId() con ID inválido lanza TypeError sin realizar petición de red', async () => {
        let seLlamoFetch = false;
        const fakeFetch = async () => {
            seLlamoFetch = true;
            return new Response('{}');
        };

        const servicio = new DefaultService('elementos', MockEntity, { fetchImpl: fakeFetch });

        await assert.rejects(async () => {
            await servicio.buscarPorId(null);
        }, TypeError);

        await assert.rejects(async () => {
            await servicio.buscarPorId('');
        }, TypeError);

        await assert.rejects(async () => {
            await servicio.buscarPorId('   ');
        }, TypeError);

        assert.equal(seLlamoFetch, false);
    });

    test('crear() envía POST con Content-Type application/json y resuelve 201 Created', async () => {
        let peticionCapturada = null;
        const fakeFetch = async (url, opts) => {
            peticionCapturada = { url, opts };
            return new Response(JSON.stringify({ id: 'nuevo-1', nombre: 'Creado' }), {
                status: 201,
                statusText: 'Created',
                headers: { 'Content-Type': 'application/json' }
            });
        };

        const servicio = new DefaultService('elementos', MockEntity, {
            baseUrl: 'http://api.local',
            fetchImpl: fakeFetch
        });

        const payload = { nombre: 'Creado' };
        const res = await servicio.crear(payload);

        assert.equal(peticionCapturada.opts.method, 'POST');
        assert.equal(peticionCapturada.opts.headers.get('Content-Type'), 'application/json');
        assert.equal(peticionCapturada.opts.body, JSON.stringify(payload));
        assert.equal(res.status, 201);
        assert.equal(res.data.nombre, 'Creado');
    });

    test('PUT o POST sin cuerpo no envían Content-Type, aunque venga en las cabeceras', async () => {
        const capturadas = [];
        const fakeFetch = async (url, opts) => {
            capturadas.push(opts);
            return new Response(null, { status: 204 });
        };
        const servicio = new DefaultService('elementos', MockEntity, {
            baseUrl: 'http://api.local', fetchImpl: fakeFetch,
            headers: { 'Content-Type': 'application/json' },
        });
        await servicio.solicitar('PUT', 'elementos/uuid-1/accion');
        await servicio.solicitar('POST', 'elementos/uuid-1/accion', { headers: { 'Content-Type': 'application/json' } });
        await servicio.eliminar('uuid-1');
        for (const opts of capturadas) {
            assert.equal(opts.body, undefined);
            assert.equal(opts.headers.has('Content-Type'), false);
        }
    });

    test('actualizar() envía PUT a la ruta con ID y cabecera application/json', async () => {
        let peticionCapturada = null;
        const fakeFetch = async (url, opts) => {
            peticionCapturada = { url, opts };
            return new Response(JSON.stringify({ id: 'uuid-1', nombre: 'Actualizado' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        };

        const servicio = new DefaultService('elementos', MockEntity, {
            baseUrl: 'http://api.local',
            fetchImpl: fakeFetch
        });

        const res = await servicio.actualizar('uuid-1', { nombre: 'Actualizado' });
        assert.equal(peticionCapturada.opts.method, 'PUT');
        assert.equal(peticionCapturada.url, 'http://api.local/elementos/uuid-1');
        assert.equal(peticionCapturada.opts.headers.get('Content-Type'), 'application/json');
        assert.equal(res.data.nombre, 'Actualizado');
    });

    test('modificar() envía PATCH con Content-Type application/merge-patch+json', async () => {
        let peticionCapturada = null;
        const fakeFetch = async (url, opts) => {
            peticionCapturada = { url, opts };
            return new Response(JSON.stringify({ id: 'uuid-1', nombre: 'Parcial' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        };

        const servicio = new DefaultService('elementos', MockEntity, {
            baseUrl: 'http://api.local',
            fetchImpl: fakeFetch
        });

        await servicio.modificar('uuid-1', { nombre: 'Parcial' });
        assert.equal(peticionCapturada.opts.method, 'PATCH');
        assert.equal(peticionCapturada.url, 'http://api.local/elementos/uuid-1');
        assert.equal(peticionCapturada.opts.headers.get('Content-Type'), 'application/merge-patch+json');
    });

    test('eliminar() envía DELETE y soporta respuestas 204 No Content y 200 OK', async () => {
        let peticionCapturada = null;
        const fakeFetch204 = async (url, opts) => {
            peticionCapturada = { url, opts };
            return new Response(null, { status: 204, statusText: 'No Content' });
        };

        const servicio204 = new DefaultService('elementos', MockEntity, {
            baseUrl: 'http://api.local',
            fetchImpl: fakeFetch204
        });

        const res204 = await servicio204.eliminar('uuid-del');
        assert.equal(peticionCapturada.opts.method, 'DELETE');
        assert.equal(res204.status, 204);
        assert.equal(res204.data, null);

        const fakeFetch200 = async (url, opts) => {
            peticionCapturada = { url, opts };
            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        };

        const servicio200 = new DefaultService('elementos', MockEntity, {
            baseUrl: 'http://api.local',
            fetchImpl: fakeFetch200
        });

        const res200 = await servicio200.eliminar('uuid-del');
        assert.equal(res200.status, 200);
    });

    test('Manejo de errores HTTP (401, 403, 404, 500) rechaza DefaultError con status y datos del servidor', async () => {
        const casosError = [
            { status: 401, body: { code: 'seguridad.noAutenticado', message: 'Sesión no válida' } },
            { status: 403, body: { code: 'seguridad.prohibido', message: 'Permiso denegado' } },
            { status: 404, body: { code: 'recurso.noEncontrado', message: 'No existe el registro' } },
            { status: 500, body: { code: 'servidor.error', message: 'Fallo interno en base de datos' } }
        ];

        for (const caso of casosError) {
            const fakeFetch = async () => new Response(JSON.stringify(caso.body), {
                status: caso.status,
                headers: { 'Content-Type': 'application/json' }
            });

            const servicio = new DefaultService('elementos', MockEntity, {
                baseUrl: 'http://api.local',
                fetchImpl: fakeFetch
            });

            await assert.rejects(async () => {
                await servicio.buscarPorId('uuid-err');
            }, (err) => {
                assert.ok(err instanceof DefaultError, 'Debe ser instancia de DefaultError');
                assert.equal(err.status, caso.status);
                assert.equal(err.code, caso.body.code);
                assert.equal(err.message, caso.body.message);
                return true;
            });
        }
    });

    test('exigirMetodo() lanza DefaultError 405 si la operación no está habilitada', async () => {
        const servicioSoloLectura = new DefaultService('elementos', MockEntity, {
            metodos: [] // Ningún método de mutación permitido
        });

        await assert.rejects(async () => {
            await servicioSoloLectura.crear({ nombre: 'Test' });
        }, (err) => {
            assert.ok(err instanceof DefaultError);
            assert.equal(err.status, 405);
            assert.equal(err.code, 'metodo.noPermitido');
            return true;
        });

        await assert.rejects(async () => {
            await servicioSoloLectura.eliminar('123');
        }, (err) => {
            assert.ok(err instanceof DefaultError);
            assert.equal(err.status, 405);
            return true;
        });
    });

    test('Fallo de conexión en fetchImpl lanza DefaultError status 0 y conexion.error', async () => {
        const fakeFetch = async () => {
            throw new TypeError('Failed to fetch (network error)');
        };

        const servicio = new DefaultService('elementos', MockEntity, {
            baseUrl: 'http://api.local',
            fetchImpl: fakeFetch
        });

        await assert.rejects(async () => {
            await servicio.listar();
        }, (err) => {
            assert.ok(err instanceof DefaultError);
            assert.equal(err.status, 0);
            assert.equal(err.code, 'conexion.error');
            assert.equal(err.message, 'No se pudo conectar con GalenoSV.');
            return true;
        });
    });

    test('Cancelación con AbortController real lanza DefaultError status 0 y solicitud.cancelada', async () => {
        const controller = new AbortController();

        const fakeFetch = async (url, opts) => {
            if (opts.signal?.aborted) {
                const err = new DOMException('The operation was aborted', 'AbortError');
                throw err;
            }
            throw new Error('No debió llegar aquí');
        };

        const servicio = new DefaultService('elementos', MockEntity, {
            baseUrl: 'http://api.local',
            fetchImpl: fakeFetch
        });

        controller.abort();

        await assert.rejects(async () => {
            await servicio.listar({}, { signal: controller.signal });
        }, (err) => {
            assert.ok(err instanceof DefaultError);
            assert.equal(err.status, 0);
            assert.equal(err.code, 'solicitud.cancelada');
            return true;
        });
    });

    test('Respuesta 200 con JSON malformado lanza DefaultError respuesta.invalida', async () => {
        const fakeFetch = async () => new Response('<html>Error de Gateway</html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' }
        });

        const servicio = new DefaultService('elementos', MockEntity, {
            baseUrl: 'http://api.local',
            fetchImpl: fakeFetch
        });

        await assert.rejects(async () => {
            await servicio.listar();
        }, (err) => {
            assert.ok(err instanceof DefaultError);
            assert.equal(err.code, 'respuesta.invalida');
            return true;
        });
    });

    test('relacionados() instancia un subservicio con la ruta jerárquica esperada', async () => {
        let peticionCapturada = null;
        const fakeFetch = async (url, opts) => {
            peticionCapturada = { url, opts };
            return new Response(JSON.stringify([]), { status: 200 });
        };

        class MockSubServicio extends DefaultService {
            constructor(opciones = {}) {
                super('documentos', MockEntity, opciones);
            }
        }

        const servicioPadre = new DefaultService('personas', MockEntity, {
            baseUrl: 'http://api.local',
            fetchImpl: fakeFetch
        });

        const subservicio = servicioPadre.relacionados('uuid-persona-1', 'documentos', MockSubServicio, ['POST']);
        assert.equal(subservicio.recurso, 'personas/uuid-persona-1/documentos');

        await subservicio.listar();
        assert.equal(peticionCapturada.url, 'http://api.local/personas/uuid-persona-1/documentos');
    });

    test('respuesta "blob": data es un Blob y se conservan las cabeceras', async () => {
        const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
        const servicio = new DefaultService('publico', null, {
            baseUrl: 'http://api.local', autenticar: null,
            fetchImpl: async () => new Response(pdf, { status: 200, headers: {
                'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="x.pdf"' } }),
        });
        const res = await servicio.solicitar('POST', 'publico/x', { data: { a: 1 }, respuesta: 'blob' });
        assert.ok(res.data instanceof Blob);
        assert.deepEqual([...new Uint8Array(await res.data.arrayBuffer())], [...pdf]);
        assert.equal(res.headers['content-type'], 'application/pdf');
        assert.equal(res.headers['content-disposition'], 'attachment; filename="x.pdf"');
    });

    test('respuesta "blob": un error se sigue leyendo como JSON', async () => {
        const servicio = new DefaultService('publico', null, {
            baseUrl: 'http://api.local', autenticar: null,
            fetchImpl: async () => new Response(JSON.stringify({ code: 'cita.noExiste', message: 'No encontramos esa cita.' }),
                { status: 404, headers: { 'Content-Type': 'application/json' } }),
        });
        await assert.rejects(servicio.solicitar('POST', 'publico/x', { data: {}, respuesta: 'blob' }),
            e => e instanceof DefaultError && e.status === 404 && e.code === 'cita.noExiste');
    });

    test('autenticar: null desactiva CSRF y auth/me en escrituras', async () => {
        let headers = null;
        // En el navegador el valor por defecto es verificarSesionActual: null debe ganarle.
        globalThis.window = {};
        let servicio;
        try {
            servicio = new DefaultService('publico', null, {
                baseUrl: 'http://api.local', autenticar: null,
                fetchImpl: async (_url, opts) => { headers = opts.headers; return new Response('[]', { status: 200 }); },
            });
        } finally {
            delete globalThis.window;
        }
        assert.equal(servicio.autenticar, null);
        await servicio.solicitar('POST', 'publico/x', { data: {} });
        assert.equal(headers.has('X-CSRF-Token'), false);
    });
});
