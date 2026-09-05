/**
 * Local preview server for the ide.ankb WEB build (public/).
 * Serves static files + a lightweight /api stub so the UI can be reviewed
 * without Cloudflare. Not used in production.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "public");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  const send = (status, body, type = "application/json; charset=utf-8", extra = {}) => {
    res.writeHead(status, { "Content-Type": type, "Access-Control-Allow-Origin": "*", ...extra });
    res.end(body);
  };

  if (url.pathname.startsWith("/api/")) {
    // Minimal stand-in for the Cloudflare function.
    if (url.pathname === "/api/health") return send(200, JSON.stringify({ ok: true, mode: "local-preview" }));
    if (url.pathname === "/api/run" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body || "{}");
          if (!parsed.code) return send(400, JSON.stringify({ error: "code required" }));
          return send(200, JSON.stringify({
            success: false,
            stage: "error",
            stdout: "",
            stderr: "Bản preview local chưa có backend chạy code. Dùng Judge0 online khi deploy lên ide.ankb.qzz.io.",
            compile_error: "",
          }));
        } catch {
          return send(400, JSON.stringify({ error: "Invalid JSON" }));
        }
      });
      return;
    }
    if (url.pathname.startsWith("/api/oj/")) {
      return send(502, JSON.stringify({ error: "OJ proxy không khả dụng trong preview local" }));
    }
    return send(404, JSON.stringify({ error: `Unknown API ${url.pathname}` }));
  }

  let filePath = path.normalize(path.join(root, url.pathname === "/" ? "index.html" : url.pathname));
  if (!filePath.startsWith(root)) return send(403, "Forbidden", "text/plain");
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) filePath = path.join(root, "index.html");
    const ext = path.extname(filePath).toLowerCase();
    fs.readFile(filePath, (readErr, data) => {
      if (readErr) return send(404, "Not found", "text/plain");
      send(200, data, types[ext] || "application/octet-stream", { "Cache-Control": "no-store" });
    });
  });
});

const port = Number(process.env.PORT || 4173);
server.listen(port, "0.0.0.0", () => console.log(`web preview: http://0.0.0.0:${port}`));
