const path = require("node:path");

module.exports = {
  server: {
    baseDir: path.join(__dirname, "src"),
    index: "index.html",
  },
  files: [path.join(__dirname, "src/**/*")],
  watchEvents: ["add", "change", "unlink"],
  watchOptions: {
    ignoreInitial: true,
  },
  listen: "127.0.0.1",
  port: 3000,
  open: "local",
  online: false,
  ui: false,
  notify: false,
  ghostMode: false,
};
