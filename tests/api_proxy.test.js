import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

// node --test ejecuta cada archivo en su propio proceso: API_URL se fija antes de importar dev_server.js,
// que la lee al cargarse.
const cerrar = servidor => new Promise(resolve => { servidor.closeAllConnections(); servidor.close(resolve); });

test("el proxy de dev_server.js conserva ruta, query, cuerpo y cookies hacia el backend", async t => {
    let disponible = true;
    const cuerpo = { idTipoDocumento: "10000000-0000-4000-8000-000000000001", numeroDocumento: "00000000-0" };
    const backend = http.createServer(async (req, res) => {
        if (!disponible) { req.socket.destroy(); return; }
        assert.equal(req.url, "/galenosv/api/auth/login?origen=prueba");
        assert.equal(req.method, "POST");
        assert.equal(req.headers.cookie, "JSESSIONID=sesion-sintetica");
        let recibido = "";
        for await (const fragmento of req) recibido += fragmento;
        assert.deepEqual(JSON.parse(recibido), cuerpo);
        res.writeHead(204, { "Set-Cookie": "JSESSIONID=nueva-sesion; Path=/galenosv; HttpOnly" });
        res.end();
    });
    await new Promise(resolve => backend.listen(0, "127.0.0.1", resolve));
    process.env.API_URL = `http://127.0.0.1:${backend.address().port}/galenosv/api`;
    const { server: proxy } = await import("../scripts/dev_server.js");
    await new Promise(resolve => proxy.listen(0, "127.0.0.1", resolve));
    t.after(() => Promise.all([cerrar(backend), cerrar(proxy)]));

    const url = `http://127.0.0.1:${proxy.address().port}/galenosv/api/auth/login?origen=prueba`;
    const opciones = {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: "JSESSIONID=sesion-sintetica" },
        body: JSON.stringify(cuerpo),
    };
    const respuesta = await fetch(url, opciones);
    assert.equal(respuesta.status, 204);
    assert.match(respuesta.headers.get("Set-Cookie"), /HttpOnly/);

    disponible = false;
    const error = await fetch(url, opciones);
    assert.equal(error.status, 502);
    const datos = await error.json();
    assert.equal(datos.code, "gateway.error");
    assert.equal(JSON.stringify(datos).includes("127.0.0.1"), false, "no expone la dirección del backend");
});

test("la raíz sirve el shell de la SPA (index.html con <app-shell>)", async t => {
    const { server } = await import("../scripts/dev_server.js");
    const servidor = http.createServer((req, res) => server.emit("request", req, res));
    await new Promise(resolve => servidor.listen(0, "127.0.0.1", resolve));
    t.after(() => cerrar(servidor));
    const base = `http://127.0.0.1:${servidor.address().port}`;
    const raiz = await fetch(`${base}/`);
    assert.equal(raiz.status, 200);
    const html = await raiz.text();
    assert.match(html, /<app-shell>/);
    assert.match(html, /app_shell\.js/);
});
