import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import config from "../bs-config.cjs";

test("el proxy local conserva ruta, cuerpo y cookies sin exponerlos en la URL", async t => {
    const apiUrl = process.env.API_URL;
    let disponible = true;
    const backend = http.createServer(async (req, res) => {
        if (!disponible) { req.socket.destroy(); return; }
        assert.equal(req.url, "/galenosv/api/auth/login?origen=prueba");
        assert.equal(req.method, "POST");
        assert.equal(req.headers.cookie, "JSESSIONID=sesion-sintetica");
        let body = "";
        for await (const fragmento of req) body += fragmento;
        assert.deepEqual(JSON.parse(body), { identificador: "persona", password: "prueba" });
        res.writeHead(204, { "Set-Cookie": "JSESSIONID=nueva-sesion; Path=/galenosv; HttpOnly" });
        res.end();
    });
    await new Promise(resolve => backend.listen(0, "127.0.0.1", resolve));
    process.env.API_URL = `http://127.0.0.1:${backend.address().port}/galenosv/api`;
    const proxy = http.createServer(config.server.middleware[0].handle);
    await new Promise(resolve => proxy.listen(0, "127.0.0.1", resolve));
    t.after(async () => {
        if (apiUrl === undefined) delete process.env.API_URL;
        else process.env.API_URL = apiUrl;
        await Promise.all([backend, proxy].map(server => new Promise(resolve => {
            server.closeAllConnections();
            server.close(resolve);
        })));
    });
    const url = `http://127.0.0.1:${proxy.address().port}/auth/login?origen=prueba`;
    const opciones = {
        method: "POST", headers: { "Content-Type": "application/json", Cookie: "JSESSIONID=sesion-sintetica" },
        body: JSON.stringify({ identificador: "persona", password: "prueba" }),
    };
    const respuesta = await fetch(url, opciones);
    assert.equal(respuesta.status, 204);
    assert.match(respuesta.headers.get("Set-Cookie"), /HttpOnly/);
    disponible = false;
    const error = await fetch(url, opciones);
    assert.equal(error.status, 503);
    assert.deepEqual(await error.json(), { message: "El servicio no está disponible." });
});
