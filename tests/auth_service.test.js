import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
    iniciarSesion, obtenerSesion, cerrarSesion, listarTiposDocumento, MENSAJES_POR_CODIGO, esEmpleado, nombreDeRol, ROL_SIN_NOMBRE,
} from "../src/js/control/auth_service.js";

const TIPO = "10000000-0000-4000-8000-0000000000aa";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; delete globalThis.document; });

/** Doble de document que cuenta los avisos "sesion-expirada" de auth_service. */
function contarExpiraciones() {
    const conteo = { valor: 0 };
    globalThis.document = new EventTarget();
    globalThis.document.addEventListener("sesion-expirada", () => { conteo.valor++; });
    return conteo;
}

const NOMBRES_ROL = { DOCTOR: "Doctor", ENFERMERA: "Enfermera", ADMINISTRACION: "Atención al público", PACIENTE: "Paciente" };

function sesion(codigo = "DOCTOR", nombreRol = NOMBRES_ROL[codigo] ?? "Rol de prueba") {
    return {
        usuario: {
            idUsuario: "10000000-0000-4000-8000-000000000001",
            idPersona: "10000000-0000-4000-8000-000000000002",
            nombres: "Carlos", apellidos: "Gómez",
        },
        rolActivo: {
            idPersonaRol: "10000000-0000-4000-8000-000000000003",
            idClinica: "10000000-0000-4000-8000-000000000004",
            codigo, nombreRol, nombreClinica: "Clínica Santa Ana",
        },
        csrfToken: "token-sintetico-de-prueba",
    };
}

test("el login envía tipo y número de documento, sin contraseña, y verifica la sesión antes de entrar", async () => {
    const llamadas = [];
    globalThis.fetch = async (url, opciones) => {
        llamadas.push({ url, opciones });
        return url.endsWith("/login") ? new Response(null, { status: 204 }) : Response.json(sesion());
    };
    assert.deepEqual(await iniciarSesion(TIPO, "  00000000-0 "), sesion());
    assert.equal(llamadas.length, 2);
    assert.equal(llamadas[0].url, "/galenosv/api/auth/login");
    assert.equal(llamadas[0].opciones.method, "POST");
    assert.equal(llamadas[0].opciones.headers["Content-Type"], "application/json");
    const cuerpo = JSON.parse(llamadas[0].opciones.body);
    assert.deepEqual(cuerpo, { idTipoDocumento: TIPO, numeroDocumento: "00000000-0" });
    assert.equal("password" in cuerpo, false);
    assert.equal(llamadas[1].url, "/galenosv/api/auth/me");
    for (const { url, opciones } of llamadas) {
        assert.equal(opciones.credentials, "include");
        assert.equal(opciones.cache, "no-store");
        assert.equal(opciones.redirect, "error");
        assert.ok(opciones.signal instanceof AbortSignal);
        assert.equal(url.includes("00000000"), false, "el documento no viaja en la URL");
    }
});

test("no envía el login con un tipo que no es UUID o un número vacío, largo o con saltos de línea", async () => {
    globalThis.fetch = async () => assert.fail("No debe enviar la petición");
    for (const [tipo, numero] of [["", "123"], ["no-uuid", "123"], [null, "123"], [TIPO, ""], [TIPO, "   "],
        [TIPO, undefined], [TIPO, "1".repeat(51)], [TIPO, "123\r\nX-Inyectada: 1"]]) {
        await assert.rejects(iniciarSesion(tipo, numero), { status: 400, message: /tipo y el número de documento/ });
    }
});

test("un login rechazado no consulta /me, no expone el error interno ni avisa sesión expirada", async () => {
    const expiraciones = contarExpiraciones();
    let peticiones = 0;
    globalThis.fetch = async () => {
        peticiones++;
        return Response.json({ message: "Detalle interno que no debe mostrarse" }, { status: 401 });
    };
    await assert.rejects(iniciarSesion(TIPO, "00000000-0"), {
        status: 401, message: "No reconocemos ese documento como personal activo de una clínica.",
    });
    assert.equal(peticiones, 1);
    assert.equal(expiraciones.valor, 0);
});

test("un 403 auth.origen del login explica el origen; los demás 403 conservan su mensaje", async () => {
    const error403 = code => async () => Response.json({ status: 403, code, message: "Detalle interno" }, { status: 403 });
    globalThis.fetch = error403("auth.origen");
    await assert.rejects(iniciarSesion(TIPO, "00000000-0"), {
        status: 403, code: "auth.origen", message: MENSAJES_POR_CODIGO["auth.origen"],
    });
    assert.match(MENSAJES_POR_CODIGO["auth.origen"], /http:\/\/localhost:3000/);
    for (const code of ["auth.csrf", "constructor", null]) {
        globalThis.fetch = error403(code);
        await assert.rejects(iniciarSesion(TIPO, "00000000-0"), {
            status: 403, message: "Este acceso es solo para el personal de la clínica.",
        });
    }
    globalThis.fetch = async () => new Response("<html>403</html>", { status: 403, headers: { "Content-Type": "text/html" } });
    await assert.rejects(iniciarSesion(TIPO, "00000000-0"), error => error.code === null && /solo para el personal/.test(error.message));
});

test("un 401 de /auth/me sí avisa sesión expirada", async () => {
    const expiraciones = contarExpiraciones();
    globalThis.fetch = async () => new Response(null, { status: 401 });
    await assert.rejects(obtenerSesion(), { status: 401 });
    assert.equal(expiraciones.valor, 1);
});

// B8: cualquier rol activo excepto PACIENTE es de empleado, incluso un rol sin código.
for (const codigo of ["DOCTOR", "ENFERMERA", "ADMINISTRACION", "OTRO_ROL", null]) {
    test(`acepta la identidad autenticada con código ${codigo}`, async () => {
        globalThis.fetch = async () => Response.json(sesion(codigo));
        const recibida = await obtenerSesion();
        assert.equal(recibida.rolActivo.codigo, codigo);
        assert.ok(esEmpleado(recibida));
    });
}

test("acepta nombreRol null y lo muestra con un texto neutro, nunca con el código", async () => {
    globalThis.fetch = async () => Response.json(sesion("ENFERMERA", null));
    const recibida = await obtenerSesion();
    assert.equal(nombreDeRol(recibida.rolActivo), ROL_SIN_NOMBRE);
    assert.equal(nombreDeRol({ nombreRol: "  Enfermera " }), "Enfermera");
});

test("esEmpleado: rechaza PACIENTE, la falta de rol y un rol sin identificador", () => {
    assert.equal(esEmpleado(sesion("PACIENTE")), false);
    assert.equal(esEmpleado({ rolActivo: { codigo: "DOCTOR" } }), false);
    for (const valor of [null, undefined, {}, { rolActivo: null }]) assert.equal(esEmpleado(valor), false);
});

test("los tipos de documento se piden sin sesión y solo se devuelven los activos y bien formados", async () => {
    const llamadas = [];
    globalThis.fetch = async (url, opciones) => {
        llamadas.push({ url, opciones });
        return Response.json([
            { idTipoDocumento: "10000000-0000-4000-8000-0000000000b2", nombre: "Pasaporte", indicaciones: "", expresionRegular: null, activo: true },
            { idTipoDocumento: TIPO, nombre: " DUI ", indicaciones: "8 dígitos, guion y verificador.", expresionRegular: "\\d{8}-\\d", activo: true },
            { idTipoDocumento: "10000000-0000-4000-8000-0000000000c3", nombre: "Inactivo", activo: false },
            { idTipoDocumento: "no-uuid", nombre: "Malo" },
            { idTipoDocumento: "10000000-0000-4000-8000-0000000000d4", nombre: "  " },
            null,
        ]);
    };
    const tipos = await listarTiposDocumento();
    assert.equal(llamadas.length, 1);
    assert.equal(llamadas[0].url, "/galenosv/api/publico/tipos-documento");
    assert.equal(llamadas[0].opciones.method, "GET");
    assert.equal(llamadas[0].opciones.headers["X-CSRF-Token"], undefined);
    assert.deepEqual(tipos, [
        { idTipoDocumento: TIPO, nombre: "DUI", indicaciones: "8 dígitos, guion y verificador.", expresionRegular: "\\d{8}-\\d" },
        { idTipoDocumento: "10000000-0000-4000-8000-0000000000b2", nombre: "Pasaporte", indicaciones: null, expresionRegular: null },
    ]);
    assert.ok(tipos.every(Object.isFrozen));
});

test("si los tipos de documento fallan se informa sin avisar sesión expirada", async () => {
    const expiraciones = contarExpiraciones();
    for (const respuesta of [new Response(null, { status: 401 }), new Response(null, { status: 503 }),
        Response.json({ no: "es una lista" }), new Response("<html></html>")]) {
        globalThis.fetch = async () => respuesta;
        await assert.rejects(listarTiposDocumento(), /tipos de documento|no está disponible/);
    }
    assert.equal(expiraciones.valor, 0);
});

test("rechaza una respuesta de sesión inválida o con rol PACIENTE", async () => {
    for (const datos of [null, {}, sesion("PACIENTE"), sesion(""), sesion(42), sesion("DOCTOR", 7),
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
    await assert.rejects(iniciarSesion(TIPO, "00000000-0"), { status: 401 });
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

test("sin respuesta del servidor el error lleva el código de red; una respuesta HTTP no", async () => {
    globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
    await assert.rejects(obtenerSesion(), error => error.status === 0 && error.code === "conexion.error");
    globalThis.fetch = async () => new Response(null, { status: 503 });
    await assert.rejects(obtenerSesion(), error => error.status === 503 && error.code === null);
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
