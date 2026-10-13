"use strict";
// Test-only server for the production admin bundle and its same-origin API.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { API_ORIGIN } = require("../support/constants");
const root = path.resolve(__dirname, "../../../client/build");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    const upstream = http.request(API_ORIGIN + req.url, { method: req.method, headers: { ...req.headers, host: new URL(API_ORIGIN).host } }, (reply) => {
      res.writeHead(reply.statusCode, reply.headers); reply.pipe(res);
    });
    upstream.on("error", () => { res.writeHead(502); res.end("Test API unavailable"); });
    req.pipe(upstream); return;
  }
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const target = path.resolve(root, "." + pathname);
  if (!target.startsWith(root + path.sep) && target !== root) { res.writeHead(403); res.end(); return; }
  const file = fs.existsSync(target) && fs.statSync(target).isFile() ? target : path.join(root, "index.html");
  res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(4174, "127.0.0.1");
