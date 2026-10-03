import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
// Resolve from this script rather than assuming the caller's current directory.
const workspace = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };
const server = http.createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const target = resolve(workspace, `.${path === "/" ? "/demo.html" : path}`);
    if (!target.startsWith(workspace + sep) || !mime[extname(target)] || path.includes("..")) { res.writeHead(404); res.end("Not found"); return; }
    const body = await readFile(target); res.writeHead(200, { "Content-Type": mime[extname(target)], "Cache-Control": "no-store" }); res.end(body);
  } catch { res.writeHead(404); res.end("Not found"); }
});
server.listen(8765, "127.0.0.1", () => console.log("拾词体验页：http://127.0.0.1:8765/demo.html（Ctrl+C 停止）"));
server.on("error", error => { console.error(error.message); process.exitCode = 1; });
