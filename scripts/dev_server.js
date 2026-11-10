import http from 'node:http';
import https from 'node:https';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Only the server reads .env. Browser requests keep the same origin and cookies.
try { process.loadEnvFile(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const api = new URL(process.env.API_URL || 'http://localhost:9080/galenosv/api');
if (!['http:', 'https:'].includes(api.protocol)) throw new Error('API_URL debe ser una URL HTTP o HTTPS.');
const root = fileURLToPath(new URL('../src/', import.meta.url));
const apiPath = api.pathname.replace(/\/+$/, '');
const contextPath = apiPath.replace(/\/[^/]*$/, '');
const port = Number(process.env.PORT || 5173);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

function proxy(req, res, url) {
    const suffix = url.pathname.slice('/galenosv'.length);
    const target = new URL(api.origin);
    target.pathname = suffix === '/api' || suffix.startsWith('/api/')
        ? apiPath + suffix.slice('/api'.length) : contextPath + suffix;
    target.search = url.search;
    const request = (target.protocol === 'https:' ? https : http).request(target, {
        method: req.method, headers: { ...req.headers, host: target.host },
    }, upstream => {
        const headers = { ...upstream.headers };
        // Map the backend context consistently for session cookies and JSF redirects.
        const localPath = path => `/galenosv${path.slice(contextPath.length)}`;
        const inContext = path => path === contextPath || path.startsWith(`${contextPath}/`);
        if (headers['set-cookie']) headers['set-cookie'] = headers['set-cookie'].map(cookie =>
            cookie.replace(/;\s*Domain=[^;]+/ig, '').replace(/(Path=)([^;]*)/i,
                (match, key, path) => inContext(path) ? `${key}${localPath(path)}` : match));
        if (headers.location) {
            const location = new URL(headers.location, target);
            if (location.origin === target.origin && inContext(location.pathname)) {
                headers.location = localPath(location.pathname) + location.search + location.hash;
            }
        }
        res.writeHead(upstream.statusCode, headers); upstream.pipe(res);
        upstream.on('error', () => res.destroy());
    });
    request.setTimeout(30000, () => request.destroy(new Error('Timeout de Galeno')));
    request.on('error', () => {
        if (res.headersSent) { res.destroy(); return; }
        res.writeHead(502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ status: 502, code: 'galeno.noDisponible',
            message: 'No se pudo conectar con Galeno. Comprueba API_URL y que el servidor esté iniciado.', details: [] }));
    });
    req.on('aborted', () => request.destroy());
    req.pipe(request);
}

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/galenosv' || url.pathname.startsWith('/galenosv/')) {
            proxy(req, res, url); return;
        }
        if (!['GET', 'HEAD'].includes(req.method)) {
            res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
        }
        if (url.pathname === '/') {
            res.writeHead(302, { Location: '/src/paginas/pacientes/homepage-user.html' }); res.end(); return;
        }
        // Serve public sources only, never .env, .git or arbitrary project files.
        const path = decodeURIComponent(url.pathname);
        if (!path.startsWith('/src/')) { res.writeHead(404); res.end(); return; }
        const file = await realpath(resolve(root, path.slice('/src/'.length)));
        if (!file.startsWith(root.endsWith(sep) ? root : root + sep) || !(await stat(file)).isFile()) {
            res.writeHead(404); res.end(); return;
        }
        res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream',
            'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        res.end(req.method === 'HEAD' ? undefined : await readFile(file));
    } catch {
        if (!res.headersSent) res.writeHead(404);
        res.end();
    }
});
server.listen(port, '127.0.0.1', () => console.log(`ChivoMed: http://localhost:${port} · API de Galeno configurada con API_URL`));
