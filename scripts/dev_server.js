import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.resolve(rootDir, 'src');

// Cargar variables de entorno desde .env
const envPath = path.resolve(rootDir, '.env');
const env = {};
if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [k, ...v] = trimmed.split('=');
        if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
    }
}

const PORT = parseInt(process.env.PORT || env.PORT || '3000', 10);
const API_URL = (process.env.API_URL || env.API_URL || 'http://localhost:9080/galenosv/api').replace(/\/+$/, '');
const targetBackend = new URL(API_URL);

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
    // 1. Proxy para la API de GalenoSV
    const isApiRequest = req.url === '/galenosv/api' ||
                         req.url.startsWith('/galenosv/api/') ||
                         req.url.startsWith('/galenosv/api?');

    if (isApiRequest) {
        const subPath = req.url.slice('/galenosv/api'.length);
        const proxyUrl = new URL(API_URL + subPath);

        const headers = { ...req.headers, host: targetBackend.host };

        const proxyReq = http.request(proxyUrl, {
            method: req.method,
            headers,
        }, (proxyRes) => {
            // Manejo robusto de cabeceras de respuesta, preservando arrays como Set-Cookie
            for (const [key, value] of Object.entries(proxyRes.headers)) {
                if (key.toLowerCase() === 'set-cookie' && Array.isArray(value)) {
                    res.setHeader('Set-Cookie', value);
                } else if (value !== undefined) {
                    res.setHeader(key, value);
                }
            }
            res.writeHead(proxyRes.statusCode || 200);
            proxyRes.pipe(res);
        });

        // Cancelar petición al backend si el cliente cierra la conexión
        req.on('aborted', () => {
            proxyReq.destroy();
        });

        proxyReq.on('error', (err) => {
            console.error(`[Proxy Error] No se pudo conectar con GalenoSV en ${targetBackend.origin}:`, err.message);
            if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 502,
                    code: 'gateway.error',
                    message: 'El servicio de datos de GalenoSV no se encuentra disponible temporalmente.',
                }));
            }
        });

        req.pipe(proxyReq);
        return;
    }

    // 2. Servidor de archivos estáticos desde src/
    let reqPath;
    try {
        reqPath = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${PORT}`).pathname);
    } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('400 Solicitud Inválida: URL malformada');
        return;
    }
    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

    const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(srcDir, safePath);

    // Evitar directory traversal
    if (filePath !== srcDir && !filePath.startsWith(srcDir + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Acceso denegado');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`404 No Encontrado: ${reqPath}`);
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
    });
});

export { server };

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    server.listen(PORT, '127.0.0.1', () => {
        console.log(`\n🚀 Servidor ChivoMed (Estáticos + Proxy GalenoSV) corriendo en:`);
        console.log(`👉 http://127.0.0.1:${PORT}`);
        console.log(`🔗 Proxy configurado: /galenosv/api -> ${API_URL}\n`);
    });
}
