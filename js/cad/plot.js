/* Estimate Pro CAD — plotting: vector PDF sheet (A4…A0, scale 1:N or fit, title block) and PNG image of the drawing.
   PDF is written directly (no library): lines, arcs (as fine polylines), solid fills, hatch lines, text (Helvetica, WinAnsi), dimensions,
   block inserts and image underlays (JPEG). */
(function () {
  "use strict";
  var EP = window.EP, G = EP.geom, CAD = EP.cad, UN = EP.units;
  var PAPER = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841] };
  var STD = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1250, 1500, 2000, 2500, 5000, 10000];

  function flatEnts(doc, list, M, out, depth) {
    list.forEach(function (e) {
      if (e.t === "insert") { var B = doc.d.blocks[e.block]; if (!B || depth > 8) return; var M2 = G.mMul(M || [1, 0, 0, 1, 0, 0], G.mInsert(e, B.base)); flatEnts(doc, B.ents.map(function (x) { var y = CAD.clone(x); if (!y.layer || y.layer === "0") y.layer = e.layer; if (y.color == null && e.color != null) y.color = e.color; return y; }), M2, out, depth + 1); return; }
      out.push(M ? G.xform(e, M) : e);
    });
    return out;
  }
  function rgbOf(doc, e, mono) {
    if (mono) return [0, 0, 0];
    var c = doc.colorOf(e, "light"); if (!/^#[0-9a-f]{6}$/i.test(c)) c = "#000000";
    var r = parseInt(c.slice(1, 3), 16) / 255, g = parseInt(c.slice(3, 5), 16) / 255, b = parseInt(c.slice(5, 7), 16) / 255;
    if (r > 0.85 && g > 0.85 && b > 0.85) return [0, 0, 0]; if (r > 0.8 && g > 0.8 && b < 0.3) return [0.6, 0.55, 0]; return [r, g, b];
  }
  function winAnsi(s) { var o = ""; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i), ch = s[i]; if (ch === "(" || ch === ")" || ch === "\\") o += "\\" + ch; else if (c < 128) o += ch; else if (c === 216 || ch === "Ø") o += "\\330"; else if (ch === "°") o += "\\260"; else if (ch === "±") o += "\\261"; else if (ch === "²") o += "\\262"; else if (ch === "³") o += "\\263"; else if (ch === "×") o += "\\327"; else if (ch === "–" || ch === "—") o += "-"; else o += "?"; } return o; }

  /* opts: { paper: "A3", land: true, scale: 100 | null (fit), area: [x0,y0,x1,y1] | null, mono, lw: true, title, number, project, drawnBy, org, date, units } */
  function pdf(doc, opts) {
    opts = opts || {};
    var pp = PAPER[opts.paper || "A3"], W = opts.land === false ? pp[1] : pp[0], H = opts.land === false ? pp[0] : pp[1], mg = 10, tbH = 28, mm2pt = 72 / 25.4;
    var area = opts.area || doc.extents(true) || [0, 0, 1000, 1000];
    var aw = W - 2 * mg, ah = H - 2 * mg - tbH, ex = Math.max(area[2] - area[0], 1e-6), ey = Math.max(area[3] - area[1], 1e-6);
    var N = opts.scale; if (!N) { var need = Math.max(ex / aw, ey / ah); N = STD.filter(function (s) { return s >= need; })[0] || Math.ceil(need); }
    var cx = (area[0] + area[2]) / 2, cy = (area[1] + area[3]) / 2, px0 = mg + aw / 2, py0 = mg + tbH + ah / 2;
    function P(p) { return [(px0 + (p[0] - cx) / N) * mm2pt, (py0 + (p[1] - cy) / N) * mm2pt]; }
    var s = [], imgs = [], self = { n: function (v) { return (Math.round(v * 100) / 100).toString(); } }, n = self.n;
    s.push("1 J 1 j");
    // clip to the drawing area
    s.push("q " + n(mg * mm2pt) + " " + n((mg + tbH) * mm2pt) + " " + n(aw * mm2pt) + " " + n(ah * mm2pt) + " re W n");
    var vis = doc.d.ents.filter(function (e) { return doc.visible(e); });
    var order = vis.filter(function (e) { return e.t === "image"; }).concat(vis.filter(function (e) { return e.t === "hatch"; }), vis.filter(function (e) { return e.t !== "image" && e.t !== "hatch"; }));
    var flat = flatEnts(doc, order, null, [], 0), curCol = null, curW = null;
    function col(e, fill) { var c = rgbOf(doc, e, opts.mono), k = c.map(function (v) { return n(v); }).join(" ") + (fill ? " rg" : " RG"); s.push(k); }
    function lw(e) { var w = opts.lw === false ? 0.18 : doc.lwOf(e); s.push(n(Math.max(0.1, w) * mm2pt) + " w"); }
    function dash(e) { var pat = CAD.LTYPES[doc.ltOf(e)]; if (!pat || !pat.length) { s.push("[] 0 d"); return; } s.push("[" + pat.map(function (x) { return n(x * mm2pt * (doc.d.ltscale || 1)); }).join(" ") + "] 0 d"); }
    function path(segs, close) {
      var first = true, last = null;
      segs.forEach(function (sg) {
        var pts; if (sg.k === "L") pts = [sg.a, sg.b]; else { var nseg = Math.max(8, Math.ceil(G.sweep(sg) / (Math.PI / 36))); pts = []; for (var i = 0; i <= nseg; i++) pts.push(G.polar(sg.c, sg.r, sg.s + G.sweep(sg) * i / nseg)); }
        pts.forEach(function (p, i) { var q = P(p); if (i === 0 && (first || !last || Math.abs(last[0] - q[0]) > 0.01 || Math.abs(last[1] - q[1]) > 0.01)) s.push(n(q[0]) + " " + n(q[1]) + " m"); else if (i > 0 || !first) s.push(n(q[0]) + " " + n(q[1]) + " l"); last = q; });
        first = false;
      });
      if (close) s.push("h");
    }
    function text(p, str, h, rot, al, e) {
      var hp = h / N * mm2pt; if (hp < 1) return; var r = (rot || 0) * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r), lines = String(str).split("\n"), hz = (al || "l")[0], vt = (al || "")[1] || "";
      lines.forEach(function (l, li) {
        var w = l.length * hp * (e && e.font === "courier" ? 0.6 : e && e.font === "times" ? 0.47 : e && /b/.test(e.st || "") ? 0.56 : 0.52), dx = hz === "c" ? -w / 2 : hz === "r" ? -w : 0, dy = vt === "t" ? -hp : vt === "m" ? -hp / 2 + (lines.length - 1) * hp * 0.75 : vt === "b" ? (lines.length - 1) * hp * 1.5 : 0;
        if (e && e.mt && !vt) dy = -hp; dy -= li * hp * 1.5;
        var q = P(p), x = q[0] + dx * cs - dy * sn, y = q[1] + dx * sn + dy * cs;
        s.push("BT /F" + ((e && ({ times: 4, courier: 8 })[e.font] || 0) + (e && ({ b: 2, i: 3, bi: 4 })[e.st] || 1)) + " " + n(hp) + " Tf " + [cs, sn, -sn, cs, x, y].map(n).join(" ") + " Tm (" + winAnsi(l) + ") Tj ET");
      });
    }
    flat.forEach(function (e) {
      if (e.t === "image") { var im = opts.images && opts.images[e.asset]; if (!im) return; var pts = G.rectPts(e).map(P), idx = imgs.length; imgs.push(im); var a = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[3][0] - pts[0][0], pts[3][1] - pts[0][1], pts[0][0], pts[0][1]]; s.push("q " + a.map(n).join(" ") + " cm /Im" + idx + " Do Q"); return; }
      if (e.t === "text") { col(e, true); text(e.p, e.s, e.h, e.rot, e.al, e); return; }
      if (e.t === "point") { col(e, true); var q = P(e.p); s.push(n(q[0] - 0.6) + " " + n(q[1] - 0.6) + " 1.2 1.2 re f"); return; }
      if (e.t === "hatch") {
        if (e.pat === "SOLID") { if (e.tag === "takeoff" && !opts.takeoff) return; var cc = rgbOf(doc, e, opts.mono && e.op == null), op = e.op == null ? 1 : e.op; if (opts.mono && e.op != null) cc = [0.5, 0.5, 0.5]; s.push(cc.map(function (v) { return n(1 - op * (1 - v)); }).join(" ") + " rg"); e.loops.forEach(function (L) { path(G.plineSegs(L, true), true); }); s.push("f*"); return; }
        var Hh = CAD.hatchLines(e, 80000); col(e, false); s.push("0.1 w [] 0 d"); Hh.segs.forEach(function (sg) { var a = P([sg[0], sg[1]]), b = P([sg[2], sg[3]]); s.push(n(a[0]) + " " + n(a[1]) + " m " + n(b[0]) + " " + n(b[1]) + " l"); }); s.push("S"); return;
      }
      if (e.t === "dim") {
        var st = doc.d.dim || {}, de = Object.assign({ st: st, sc: st.sc || 1 }, e), g = G.dimGeom(de); if (!g) return;
        col(e, false); s.push("0.18 w [] 0 d"); g.lines.forEach(function (l) { path([{ k: "L", a: l[0], b: l[1] }]); }); s.push("S");
        col(e, true); g.arrows.forEach(function (a) { var b = G.add(a[0], G.mul(a[1], g.ar)), nn = G.mul(G.perp(a[1]), g.ar / 6), q1 = P(a[0]), q2 = P(G.add(b, nn)), q3 = P(G.sub(b, nn)); s.push(n(q1[0]) + " " + n(q1[1]) + " m " + n(q2[0]) + " " + n(q2[1]) + " l " + n(q3[0]) + " " + n(q3[1]) + " l h f"); });
        text(g.tp, opts.dimText ? opts.dimText(e, g.val) : String(Math.round(g.val)), (st.th || 2.5) * de.sc, g.tr * 180 / Math.PI, "cb"); return;
      }
      if (e.t === "leader") { col(e, false); lw(e); dash(e); path(G.polySegs(e.pts, false)); s.push("S"); if (e.s) { col(e, true); var st2 = doc.d.dim || {}; text(e.pts[e.pts.length - 1], e.s, (st2.th || 2.5) * (st2.sc || 1), 0, "lm"); } return; }
      var segs = G.segsOf(e, doc.d.blocks); if (!segs.length) return;
      col(e, false); lw(e); dash(e); path(segs, false); s.push("S");
    });
    s.push("Q");
    // border + title block
    s.push("0 0 0 RG 0 0 0 rg [] 0 d 0.5 w " + n(mg * mm2pt) + " " + n(mg * mm2pt) + " " + n((W - 2 * mg) * mm2pt) + " " + n((H - 2 * mg) * mm2pt) + " re S");
    s.push("0.35 w " + n(mg * mm2pt) + " " + n((mg + tbH) * mm2pt) + " m " + n((W - mg) * mm2pt) + " " + n((mg + tbH) * mm2pt) + " l S");
    var cols = [0, 0.42, 0.62, 0.8, 1].map(function (f) { return mg + (W - 2 * mg) * f; });
    cols.slice(1, -1).forEach(function (x) { s.push(n(x * mm2pt) + " " + n(mg * mm2pt) + " m " + n(x * mm2pt) + " " + n((mg + tbH) * mm2pt) + " l S"); });
    function tb(x, y, str, h, bold) { s.push("BT /" + (bold ? "F2" : "F1") + " " + n(h * mm2pt) + " Tf " + n(x * mm2pt) + " " + n(y * mm2pt) + " Td (" + winAnsi(String(str || "")) + ") Tj ET"); }
    var y0 = mg + tbH;
    tb(cols[0] + 3, y0 - 7, opts.org || "", 3.2, true); tb(cols[0] + 3, y0 - 13, opts.project || "", 2.6); tb(cols[0] + 3, y0 - 19, opts.office || "", 2.4); tb(cols[0] + 3, y0 - 25, "Estimate Pro CAD", 2);
    tb(cols[1] + 3, y0 - 6, "TITLE", 2); tb(cols[1] + 3, y0 - 14, opts.title || doc.d.name || "", 3.6, true);
    tb(cols[2] + 3, y0 - 6, "SCALE", 2); tb(cols[2] + 3, y0 - 13, "1 : " + N + " (" + (opts.paper || "A3") + ")", 3.2, true); tb(cols[2] + 3, y0 - 20, "UNITS: " + (opts.units || "mm"), 2.2);
    tb(cols[3] + 3, y0 - 6, "DRAWING No.", 2); tb(cols[3] + 3, y0 - 13, opts.number || "D-01", 3.4, true); tb(cols[3] + 3, y0 - 20, "DATE: " + (opts.date || new Date().toLocaleDateString("en-IN")), 2.2); tb(cols[3] + 3, y0 - 25, "DRAWN: " + (opts.drawnBy || ""), 2.2);
    var content = s.join("\n");
    if (opts.raw) return { content: content, imgs: imgs, W: W, H: H, scale: N };
    // assemble the PDF
    var objs = [], enc = new TextEncoder();
    objs.push("<< /Type /Catalog /Pages 2 0 R >>");
    objs.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    var xo = imgs.map(function (_, i) { return "/Im" + i + " " + (17 + i) + " 0 R"; }).join(" ");
    objs.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + n(W * mm2pt) + " " + n(H * mm2pt) + "] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R /F4 8 0 R /F5 9 0 R /F6 10 0 R /F7 11 0 R /F8 12 0 R /F9 13 0 R /F10 14 0 R /F11 15 0 R /F12 16 0 R >>" + (xo ? " /XObject << " + xo + " >>" : "") + " >> >>");
    objs.push({ stream: enc.encode(content), dict: "" });
    objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>");
    objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-BoldOblique /Encoding /WinAnsiEncoding >>");
    ["Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic", "Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"].forEach(function (fn) { objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /" + fn + " /Encoding /WinAnsiEncoding >>"); });
    imgs.forEach(function (im) { objs.push({ stream: im.bytes, dict: "/Type /XObject /Subtype /Image /Width " + im.w + " /Height " + im.h + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode" }); });
    var parts = [enc.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")], offs = [], len = parts[0].length;
    objs.forEach(function (o, i) {
      var head, body, tail;
      if (typeof o === "string") { head = enc.encode((i + 1) + " 0 obj\n" + o + "\nendobj\n"); offs.push(len); parts.push(head); len += head.length; return; }
      head = enc.encode((i + 1) + " 0 obj\n<< " + o.dict + " /Length " + o.stream.length + " >>\nstream\n"); tail = enc.encode("\nendstream\nendobj\n");
      offs.push(len); parts.push(head, o.stream, tail); len += head.length + o.stream.length + tail.length;
    });
    var xref = "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n" + offs.map(function (o) { return ("0000000000" + o).slice(-10) + " 00000 n \n"; }).join("") + "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + len + "\n%%EOF\n";
    parts.push(enc.encode(xref));
    var total = parts.reduce(function (a, p) { return a + p.length; }, 0), out = new Uint8Array(total), k = 0; parts.forEach(function (p) { out.set(p, k); k += p.length; });
    return { bytes: out, scale: N, paper: [W, H] };
  }
  /* several sheets in one PDF: list = [opts of pdf()], one page each */
  function pdfPages(doc, list) {
    var mm2pt = 72 / 25.4, n = function (v) { return (Math.round(v * 100) / 100).toString(); }, enc = new TextEncoder(), pages = list.map(function (o) { return pdf(doc, Object.assign({}, o, { raw: true })); });
    var objs = [null, null, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-BoldOblique /Encoding /WinAnsiEncoding >>"].concat(["Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic", "Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"].map(function (fn) { return "<< /Type /Font /Subtype /Type1 /BaseFont /" + fn + " /Encoding /WinAnsiEncoding >>"; })), kids = [];
    pages.forEach(function (pg) { var pi = objs.length + 1, ci = pi + 1, first = ci + 1, xo = pg.imgs.map(function (_, i) { return "/Im" + i + " " + (first + i) + " 0 R"; }).join(" "); kids.push(pi + " 0 R");
      objs.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + n(pg.W * mm2pt) + " " + n(pg.H * mm2pt) + "] /Contents " + ci + " 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R /F5 7 0 R /F6 8 0 R /F7 9 0 R /F8 10 0 R /F9 11 0 R /F10 12 0 R /F11 13 0 R /F12 14 0 R >>" + (xo ? " /XObject << " + xo + " >>" : "") + " >> >>");
      objs.push({ stream: enc.encode(pg.content), dict: "" });
      pg.imgs.forEach(function (im) { objs.push({ stream: im.bytes, dict: "/Type /XObject /Subtype /Image /Width " + im.w + " /Height " + im.h + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode" }); }); });
    objs[0] = "<< /Type /Catalog /Pages 2 0 R >>"; objs[1] = "<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + kids.length + " >>";
    var parts = [enc.encode("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")], offs = [], len = parts[0].length;
    objs.forEach(function (o, i) { var head, tail; if (typeof o === "string") { head = enc.encode((i + 1) + " 0 obj\n" + o + "\nendobj\n"); offs.push(len); parts.push(head); len += head.length; return; }
      head = enc.encode((i + 1) + " 0 obj\n<< " + o.dict + " /Length " + o.stream.length + " >>\nstream\n"); tail = enc.encode("\nendstream\nendobj\n"); offs.push(len); parts.push(head, o.stream, tail); len += head.length + o.stream.length + tail.length; });
    parts.push(enc.encode("xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n" + offs.map(function (o) { return ("0000000000" + o).slice(-10) + " 00000 n \n"; }).join("") + "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + len + "\n%%EOF\n"));
    var total = parts.reduce(function (a2, q) { return a2 + q.length; }, 0), out = new Uint8Array(total), k = 0; parts.forEach(function (q) { out.set(q, k); k += q.length; });
    return { bytes: out, pages: pages.length };
  }
  /* image underlays for the PDF: { assetId: { bytes (JPEG), w, h } } from loaded HTMLImageElements */
  function jpegOf(img) {
    var cv = document.createElement("canvas"), k = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight)); cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
    var g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
    var b64 = cv.toDataURL("image/jpeg", 0.85).split(",")[1], bin = atob(b64), u = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return { bytes: u, w: cv.width, h: cv.height };
  }
  /* PNG of the drawing (extents or a given area) at a given width, light background */
  function png(ed, area, widthPx) {
    var b = area || ed.doc.extents(true) || [0, 0, 1000, 1000], W = widthPx || 2400, H = Math.round(W * Math.max(b[3] - b[1], 1) / Math.max(b[2] - b[0], 1)); H = Math.max(200, Math.min(H, 4000));
    var keep = { view: Object.assign({}, ed.view), W: ed.W, H: ed.H, dpr: ed.dpr, cv: ed.cv, ctx: ed.ctx, bg: ed.set.bg, grid: ed.set.grid, sel: ed.sel, hover: ed.hover, cross: ed.set.cross, snap: ed.snapPt };
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    ed.cv = cv; ed.ctx = cv.getContext("2d"); ed.W = W; ed.H = H; ed.dpr = 1; ed.set.bg = "light"; ed.set.grid = false; ed.sel = new Set(); ed.hover = null; ed.set.cross = false; ed.snapPt = null;
    ed.zoomBox(b, 0.03); try { ed.render(); } finally { var url = cv.toDataURL("image/png"); ed.view = keep.view; ed.W = keep.W; ed.H = keep.H; ed.dpr = keep.dpr; ed.cv = keep.cv; ed.ctx = keep.ctx; ed.set.bg = keep.bg; ed.set.grid = keep.grid; ed.sel = keep.sel; ed.hover = keep.hover; ed.set.cross = keep.cross; ed.snapPt = keep.snap; ed.dirty = true; return url; }
  }
  Object.assign(CAD, { plotPdfPages: pdfPages, plotPdf: pdf, plotPng: png, jpegOf: jpegOf, PAPER: PAPER, STD_SCALES: STD, flatEnts: flatEnts });
})();
