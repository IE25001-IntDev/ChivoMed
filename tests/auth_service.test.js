import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { iniciarSesion, obtenerSesion, cerrarSesion, ROLES } from "../src/js/control/auth_service.js";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function sesion(codigo = "DOCTOR") {
    return {
        usuario: {
            idUsuario: "10000000-0000-4000-8000-000000000001",
            idPersona: "10000000-0000-4000-8000-000000000002",
            nombres: "Persona", apellidos: "de prueba",
        },
        rolActivo: {
            idPersonaRol: "10000000-0000-4000-8000-000000000003",
            idClinica: "10000000-0000-4000-8000-000000000004",
            codigo, nombreClinica: "Clínica de prueba",
        },
        csrfToken: "token-sintetico-de-prueba",
    };
}

test("el login envía credenciales en JSON y verifica la sesión antes de permitir la entrada", async () => {
    const llamadas = [];
    globalThis.fetch = async (url, opciones) => {
        llamadas.push({ url, opciones });
        return url.endsWith("/login") ? new Response(null, { status: 204 }) : Response.json(sesion());
    };
    assert.deepEqual(await iniciarSesion("usuario@example.invalid", " clave de prueba "), sesion());
    assert.equal(llamadas.length, 2);
    assert.equal(llamadas[0].url, "/galenosv/api/auth/login");
    assert.equal(llamadas[0].opciones.method, "POST");
    assert.deepEqual(JSON.parse(llamadas[0].opciones.body), {
        identificador: "usuario@example.invalid", password: " clave de prueba ",
    });
    assert.equal(llamadas[1].url, "/galenosv/api/auth/me");
    for (const { url, opciones } of llamadas) {
        assert.equal(opciones.credentials, "include");
        assert.equal(opciones.cache, "no-store");
        assert.equal(opciones.redirect, "error");
        assert.ok(opciones.signal instanceof AbortSignal);
        assert.equal(url.includes("clave"), false);
    }
});

test("un login rechazado no consulta /me ni expone el error interno", async () => {
    let peticiones = 0;
    globalThis.fetch = async () => {
        peticiones++;
        return Response.json({ message: "Detalle interno que no debe mostrarse" }, { status: 401 });
    };
    await assert.rejects(iniciarSesion("persona", "prueba"), {
        status: 401, message: "Usuario o contraseña incorrectos.",
    });
    assert.equal(peticiones, 1);
});

for (const codigo of Object.keys(ROLES)) {
    test(`acepta la identidad autenticada con rol ${codigo}`, async () => {
        globalThis.fetch = async () => Response.json(sesion(codigo));
        assert.equal((await obtenerSesion()).rolActivo.codigo, codigo);
    });
}

test("rechaza una respuesta de sesión inválida o un rol desconocido", async () => {
    for (const datos of [null, {}, sesion("SUPERUSUARIO"), sesion("__proto__"),
        { ...sesion(), usuario: { idUsuario: { toString: "invalido" } } },
        { ...sesion(), csrfToken: "" }, { ...sesion(), csrfToken: "token\r\ninyectado" }]) {
        globalThis.fetch = async () => Response.json(datos);
        await assert.rejects(obtenerSesion(), /No pudimos cargar tu acceso/);
    }
});

test("un HTTP 200 con HTML o JSON roto no concede acceso", async () => {
    for (const respuesta of [new Response("<html>Login</html>"),
        new Response("{", { headers: { "Content-Type": "application/json" } })]) {
        globalThis.fetch = async () => respuesta;
        await assert.rejects(obtenerSesion(), /No pudimos verificar tu sesión/);
    }
});

test("un POST de login correcto no basta si /me rechaza la sesión", async () => {
    globalThis.fetch = async url => new Response(null, { status: url.endsWith("/login") ? 204 : 401 });
    await assert.rejects(iniciarSesion("persona", "prueba"), { status: 401 });
});

test("distingue una sesión vencida, servicio ausente y exceso de intentos", async () => {
    for (const [status, mensaje] of [[401, /sesión ha finalizado/], [403, /autorizar/],
        [404, /todavía no está disponible/], [429, /demasiados intentos/], [503, /más tarde/]]) {
        globalThis.fetch = async () => new Response(null, { status });
        await assert.rejects(obtenerSesion(), error => error.status === status && mensaje.test(error.message));
    }
});

test("informa errores de conexión y tiempo de espera sin revelar detalles", async () => {
    for (const [error, mensaje] of [[new TypeError("detalle de red"), /conectar/],
        [new DOMException("detalle interno", "TimeoutError"), /tardó demasiado/]]) {
        globalThis.fetch = async () => { throw error; };
        await assert.rejects(obtenerSesion(), mensaje);
    }
});

test("el logout envía el token CSRF y conserva el error si falla el servidor", async () => {
    globalThis.fetch = async (url, opciones) => {
        assert.equal(url, "/galenosv/api/auth/logout");
        assert.equal(opciones.method, "POST");
        assert.equal(opciones.headers["X-CSRF-Token"], sesion().csrfToken);
        assert.equal(opciones.credentials, "include");
        return new Response(null, { status: 503 });
    };
    await assert.rejects(cerrarSesion(sesion().csrfToken), { status: 503 });
});

test("no intenta cerrar una sesión sin token CSRF válido", async () => {
    globalThis.fetch = async () => { assert.fail("No debe enviar la petición"); };
    for (const token of [undefined, "", "  ", "token\ninyectado"]) {
        await assert.rejects(cerrarSesion(token), /verificar tu sesión/);
    }
});
