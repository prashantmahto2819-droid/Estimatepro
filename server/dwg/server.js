/* EstimatePro — DWG → DXF converter service.
   POST /convert  (header x-key: <DWG_KEY>, body: the .dwg file, ≤ 40 MB) → the .dxf file (ASCII), or JSON { ok:false, error }.
   GET  /health   → { ok:true, tool:"dwg2dxf …" }
   Runs LibreDWG's dwg2dxf as a separate program for every file, in a temporary folder that is removed afterwards. Only the
   EstimatePro Cloudflare Worker calls it (it checks the user's sign-in and adds the key); nothing is stored. */
"use strict";
const http = require("http"), fs = require("fs"), os = require("os"), path = require("path"), { execFile } = require("child_process");
const KEY = process.env.DWG_KEY || "", PORT = +process.env.PORT || 8088, MAX = 40 * 1024 * 1024;
if (KEY.length < 24) { console.error("Set DWG_KEY (24+ characters) before starting."); process.exit(1); }
let busy = 0;
const send = (res, code, obj, type) => { res.writeHead(code, { "content-type": type || "application/json" }); res.end(type ? obj : JSON.stringify(obj)); };
http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") return execFile("dwg2dxf", ["--version"], (e, out) => send(res, 200, { ok: !e, tool: String(out || "").trim().split("\n")[0] }));
  if (req.method !== "POST" || req.url !== "/convert") return send(res, 404, { ok: false, error: "not_found" });
  if ((req.headers["x-key"] || "") !== KEY) return send(res, 401, { ok: false, error: "unauthorized" });
  if (busy >= 3) return send(res, 503, { ok: false, error: "busy" });
  const chunks = []; let size = 0, bad = false;
  req.on("data", (c) => { size += c.length; if (size > MAX) { bad = true; req.destroy(); } else chunks.push(c); });
  req.on("end", () => {
    if (bad) return; const buf = Buffer.concat(chunks);
    if (buf.length < 64 || buf.slice(0, 4).toString("latin1") !== "AC10") return send(res, 400, { ok: false, error: "not_dwg" });
    busy++; const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dwg-")), inp = path.join(dir, "in.dwg"), out = path.join(dir, "out.dxf");
    const done = () => { busy--; fs.rm(dir, { recursive: true, force: true }, () => {}); };
    fs.writeFileSync(inp, buf);
    execFile("dwg2dxf", ["-y", "-o", out, inp], { timeout: 90000, maxBuffer: 4 * 1024 * 1024 }, (e, so, se) => {
      if (!fs.existsSync(out)) { done(); return send(res, 422, { ok: false, error: "convert_failed", detail: String(se || (e && e.message) || "").slice(-300) }); }
      const dxf = fs.readFileSync(out); done(); send(res, 200, dxf, "application/dxf");
    });
  });
}).listen(PORT, () => console.log("DWG converter on port " + PORT));
