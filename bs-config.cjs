const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
try { process.loadEnvFile(path.join(__dirname, ".env")); }
catch (error) { if (error.code !== "ENOENT") throw error; }

module.exports = {
  server: {
    baseDir: path.join(__dirname, "src"),
    index: "index.html",
    middleware: [{
      route: "/galenosv/api",
      handle(req, res) {
        const base = (process.env.API_URL || "http://127.0.0.1:9080/galenosv/api").replace(/\/+$/, "");
        const target = new URL(`${base}/${req.url.replace(/^\/+/, "")}`);
        const upstream = (target.protocol === "https:" ? https : http).request(target, {
          method: req.method,
          headers: { ...req.headers, host: target.host },
        }, response => {
          res.writeHead(response.statusCode, response.headers);
          response.on("error", () => res.destroy());
          response.pipe(res);
        });
        upstream.setTimeout(9000, () => upstream.destroy());
        upstream.on("error", () => {
          if (res.headersSent) return res.destroy();
          res.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
          res.end(JSON.stringify({ message: "El servicio no está disponible." }));
        });
        req.on("aborted", () => upstream.destroy());
        req.pipe(upstream);
      },
    }],
  },
  files: [path.join(__dirname, "src/**/*")],
  watchEvents: ["add", "change", "unlink"],
  watchOptions: {
    ignoreInitial: true,
  },
  listen: "127.0.0.1",
  port: Number(process.env.PORT || 3000),
  open: "local",
  online: false,
  ui: false,
  notify: false,
  ghostMode: false,
};
