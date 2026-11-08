import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { server } from '../scripts/dev_server.js';

describe('Servidor dev_server.js (Seguridad y Resiliencia)', () => {
    let testPort;
    let baseUrl;

    before((_, done) => {
        // Asignar puerto efímero automático (0) para no colisionar con el puerto 3000
        server.listen(0, '127.0.0.1', () => {
            testPort = server.address().port;
            baseUrl = `http://127.0.0.1:${testPort}`;
            done();
        });
    });

    after((_, done) => {
        server.close(done);
    });

    test('P0-3(a): URL malformada /%E0%A4%A responde 400 y no tumba el proceso', async () => {
        const respuesta = await new Promise((resolve, reject) => {
            const req = http.get(`${baseUrl}/%E0%A4%A`, (res) => {
                let cuerpo = '';
                res.on('data', chunk => { cuerpo += chunk; });
                res.on('end', () => resolve({ status: res.statusCode, cuerpo }));
            });
            req.on('error', reject);
        });

        assert.equal(respuesta.status, 400, 'Debe responder con código HTTP 400');
        assert.match(respuesta.cuerpo, /URL malformada/, 'El cuerpo debe indicar que la URL es malformada');
    });

    test('P0-3(b): Servidor sirve estáticos correctamente con 200 OK', async () => {
        const respuesta = await new Promise((resolve, reject) => {
            const req = http.get(`${baseUrl}/index.html`, (res) => {
                resolve({ status: res.statusCode, headers: res.headers });
            });
            req.on('error', reject);
        });

        assert.equal(respuesta.status, 200);
        assert.match(respuesta.headers['content-type'], /text\/html/);
    });

    test('P0-3(b): Acceso fuera de src/ es bloqueado con 403', async () => {
        const respuesta = await new Promise((resolve, reject) => {
            const req = http.get(`${baseUrl}/../scripts/dev_server.js`, (res) => {
                resolve({ status: res.statusCode });
            });
            req.on('error', reject);
        });

        assert.ok([400, 403, 404].includes(respuesta.status), 'No debe devolver 200 para archivos fuera de src');
    });
});
