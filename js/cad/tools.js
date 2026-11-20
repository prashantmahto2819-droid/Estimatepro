/* Estimate Pro CAD — commands (AutoCAD-style names and aliases). Each command is an async function of the editor.
   Typing a command name or alias in the command line (or a toolbar button) runs it; Esc cancels; Enter / Space finishes or repeats. */
(function () {
  "use strict";
  var EP = window.EP, G = EP.geom, CAD = EP.cad, UN = EP.units, Ed = CAD.Editor.prototype;
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;

  /* numeric prompt (factor, count …) */
  Ed.getNum = function (msg, o) { o = o || {}; return this.ask({ kind: "num", msg: msg, kw: o.kw, def: o.def, defTxt: o.def != null ? String(o.def) : "", base: o.base || null, int: o.int }); };
  var typed0 = Ed.typed;
  Ed.typed = function (txt) {
    var p = this.prompt; if (p && p.kind === "num") {
      var t = txt.trim(); if (!t) { this.answer(p.def != null ? p.def : null); return true; }
      var kw = (p.kw || []).filter(function (k) { return k.toUpperCase().indexOf(t.toUpperCase()) === 0; })[0]; if (kw) { this.answer(kw); return true; }
      var v = UN.evalNum(t); if (v == null || (p.int && (v !== Math.round(v) || v < 1))) { this.say("Requires " + (p.int ? "a whole number" : "a number") + "."); return true; } this.answer(v); return true;
    }
    return typed0.call(this, txt);
  };

  function E(ed, ids) { return ids.map(function (id) { return ed.doc.get(id); }).filter(function (e) { return e && ed.doc.editable(e); }); }
  function clearSel(ed) { ed.sel.clear(); ed.emitSel(); }
  function lastPt(ed, p) { ed.last = p; return p; }
  function cutters(ed, except, bb) {
    var doc = ed.doc, out = [], q = bb ? doc.idx.query(bb[0], bb[1], bb[2], bb[3]) : doc.d.ents;
    q.forEach(function (e) { if (e.id === except || !doc.visible(e) || e.t === "text" || e.t === "dim" || e.t === "image" || e.t === "point") return; doc.segs(e).forEach(function (s) { out.push(s); }); });
    return out;
  }
  function bigBox(ed, e) { var b = ed.doc.bbox(e), w = Math.max(b[2] - b[0], b[3] - b[1], 1) * 4; return [b[0] - w, b[1] - w, b[2] + w, b[3] + w]; }
  function replaceEnt(ed, e, list) {
    var base = { layer: e.layer }; ["color", "lw", "lt", "grp", "tag"].forEach(function (k) { if (e[k] != null) base[k] = e[k]; });
    var hosted = e.t === "wall" && EP.bim ? ed.doc.d.ents.filter(function (o) { return o.host === e.id; }).map(function (o) { var pl = EP.bim.place(ed.doc, o); return { o: CAD.clone(o), p: pl && pl.p }; }) : [];
    ed.doc.del(e.id); ed.sel.delete(e.id);
    var made = (list || []).map(function (n) { var x = Object.assign({}, base, n); delete x.id; return ed.doc.add(x); });
    hosted.forEach(function (h) {   // keep doors / windows in the piece of wall they sit in
      var best = null; made.forEach(function (w) { if (w.t !== "wall" || !h.p) return; var c = EP.bim.wallLine(w), s = G.dot(G.sub(h.p, c.a), c.u), off = Math.abs(G.dot(G.sub(h.p, c.a), c.n)); if (s - h.o.w / 2 >= -1 && s + h.o.w / 2 <= c.L + 1 && off < w.th) best = { w: w, s: s }; });
      if (best) ed.doc.mod(h.o.id, Object.assign(h.o, { host: best.w.id, at: best.s })); else ed.doc.del(h.o.id);
    });
    return made;
  }
  function xformAll(ed, ents, M, copy) { return ents.map(function (e) { var n = G.xform(e, M); if (copy) { delete n.id; return ed.doc.add(n); } ed.doc.mod(e.id, n); return e; }); }

  var C = {}, A = {};
  function cmd(name, aliases, fn, o) { C[name] = Object.assign({ fn: fn }, o || {}); (aliases || []).forEach(function (a) { A[a] = name; }); }

  /* ================= DRAW ================= */
  cmd("LINE", ["L"], async function (ed) {
    var first = lastPt(ed, await ed.getPoint("Specify first point")), prev = first, made = [];
    while (true) {
      ed.preview = function (w) { return [{ t: "line", a: prev, b: w }]; };
      var p = await ed.getPoint("Specify next point", { opt: true, base: prev, kw: made.length >= 2 ? ["Close", "Undo"] : ["Undo"] });
      if (p == null) break;
      if (p === "Undo") { var u = made.pop(); if (u) { ed.doc.del(u.id); prev = u.a; ed.last = prev; } continue; }
      if (p === "Close") { made.push(ed.doc.add({ t: "line", a: prev, b: first })); break; }
      made.push(ed.doc.add({ t: "line", a: prev, b: p })); prev = p;
    }
  });
  cmd("PLINE", ["PL"], async function (ed) {
    var pts = [], arc = false, width = ed.plw || 0, p0 = lastPt(ed, await ed.getPoint("Specify start point")); pts.push([p0[0], p0[1], 0]);
    function tanDir() { if (pts.length < 2) return null; var a = pts[pts.length - 2], b = pts[pts.length - 1]; if (!a[2]) return G.norm(G.sub(b, a)); var A2 = G.bulgeArc(a, b, a[2]), r = G.norm(G.sub(b, A2.c)); return a[2] > 0 ? G.perp(r) : G.mul(G.perp(r), -1); }
    function bulgeTo(q) { var b = pts[pts.length - 1], T = tanDir() || [1, 0], ch = G.sub(q, b), th = 2 * Math.atan2(G.cross(T, ch), G.dot(T, ch)); return Math.tan(th / 4); }
    while (true) {
      ed.preview = function (w) { var P = pts.map(function (x) { return x.slice(); }); P[P.length - 1][2] = arc ? bulgeTo(w) : 0; P.push([w[0], w[1], 0]); return [{ t: "pline", pts: P, closed: false, w: width }]; };
      var kw = arc ? ["Line", "Close", "Undo"] : ["Arc", "Close", "Undo", "Width"]; if (pts.length < 2) kw = kw.filter(function (k) { return k !== "Close"; });
      var p = await ed.getPoint("Specify next point", { opt: true, base: pts[pts.length - 1], kw: kw });
      if (p == null) break;
      if (p === "Arc") { arc = true; continue; } if (p === "Line") { arc = false; continue; }
      if (p === "Width") { width = ed.plw = await ed.getDist("Specify width", { def: width }); continue; }
      if (p === "Undo") { if (pts.length > 1) { pts.pop(); pts[pts.length - 1][2] = 0; } continue; }
      if (p === "Close") { if (arc) pts[pts.length - 1][2] = bulgeTo(pts[0]); ed.preview = null; ed.doc.add({ t: "pline", pts: pts, closed: true, w: width || undefined }); return; }
      pts[pts.length - 1][2] = arc ? bulgeTo(p) : 0; pts.push([p[0], p[1], 0]);
    }
    ed.preview = null; if (pts.length > 1) ed.doc.add({ t: "pline", pts: pts, closed: false, w: width || undefined });
  });
  function rectPts(a, b) { return [[a[0], a[1], 0], [b[0], a[1], 0], [b[0], b[1], 0], [a[0], b[1], 0]]; }
  cmd("RECTANG", ["REC", "RECTANGLE"], async function (ed) {
    var a = lastPt(ed, await ed.getPoint("Specify first corner point")), b;
    ed.preview = function (w) { return [{ t: "pline", pts: rectPts(a, w), closed: true }]; };
    var r = await ed.getPoint("Specify other corner point", { base: a, kw: ["Dimensions"] });
    if (r === "Dimensions") { var L = await ed.getDist("Specify length for rectangles", { def: ed.recL || 1000 }), W = await ed.getDist("Specify width for rectangles", { def: ed.recW || 1000 }); ed.recL = L; ed.recW = W; ed.preview = function (w) { return [{ t: "pline", pts: rectPts(a, [a[0] + (w[0] >= a[0] ? L : -L), a[1] + (w[1] >= a[1] ? W : -W)]), closed: true }]; }; var q = await ed.getPoint("Specify other corner point (side)", { base: a }); b = [a[0] + (q[0] >= a[0] ? L : -L), a[1] + (q[1] >= a[1] ? W : -W)]; }
    else b = r;
    if (!b) return; ed.preview = null; ed.doc.add({ t: "pline", pts: rectPts(a, b), closed: true });
  });
  cmd("POLYGON", ["POL"], async function (ed) {
    var n = ed.polyN = await ed.getNum("Enter number of sides", { def: ed.polyN || 6, int: true }); if (n < 3) throw new Error("At least 3 sides");
    var c = await ed.getPoint("Specify centre of polygon"), mode = await ed.getKw("Enter an option", ["Inscribed", "Circumscribed"], ed.polyM || "Inscribed"); ed.polyM = mode;
    function mk(p) { var r = G.dist(c, p), a0 = G.ang(c, p), rr = mode === "Inscribed" ? r : r / Math.cos(Math.PI / n), off = mode === "Inscribed" ? 0 : Math.PI / n; var P = []; for (var i = 0; i < n; i++) { var q = G.polar(c, rr, a0 + off + i * 2 * Math.PI / n); P.push([q[0], q[1], 0]); } return { t: "pline", pts: P, closed: true }; }
    ed.preview = function (w) { return [mk(w)]; };
    var r = await ed.getPoint("Specify radius of circle", { base: c }); if (typeof r === "number") r = G.polar(c, r, 0); ed.preview = null; ed.doc.add(mk(r));
  });
  Ed.radiusPoint = function () { return null; };
  cmd("CIRCLE", ["C"], async function (ed) {
    var p = await ed.getPoint("Specify centre point for circle", { kw: ["3P", "2P"] });
    if (p === "3P") { var a = await ed.getPoint("Specify first point on circle"), b = await ed.getPoint("Specify second point on circle", { base: a }); ed.preview = function (w) { var k = G.circle3(a, b, w); return k ? [{ t: "circle", c: k.c, r: k.r }] : []; }; var c3 = await ed.getPoint("Specify third point on circle", { base: b }), k3 = G.circle3(a, b, c3); if (!k3) throw new Error("Points are in a line"); ed.doc.add({ t: "circle", c: k3.c, r: k3.r }); return; }
    if (p === "2P") { var a2 = await ed.getPoint("Specify first end point of diameter"); ed.preview = function (w) { return [{ t: "circle", c: G.mid(a2, w), r: G.dist(a2, w) / 2 }]; }; var b2 = await ed.getPoint("Specify second end point of diameter", { base: a2 }); ed.doc.add({ t: "circle", c: G.mid(a2, b2), r: G.dist(a2, b2) / 2 }); return; }
    lastPt(ed, p); ed.preview = function (w) { return [{ t: "circle", c: p, r: G.dist(p, w) }]; };
    var r = await ed.getDist("Specify radius of circle", { base: p, kw: ["Diameter"], def: ed.cirR });
    if (r === "Diameter") { ed.preview = function (w) { return [{ t: "circle", c: p, r: G.dist(p, w) / 2 }]; }; var d = await ed.getDist("Specify diameter of circle", { base: p }); r = d / 2; }
    if (!(r > 0)) throw new Error("Radius must be more than zero"); ed.cirR = r; ed.doc.add({ t: "circle", c: p, r: r });
  });
  cmd("ARC", ["A"], async function (ed) {
    var p = await ed.getPoint("Specify start point of arc", { kw: ["Centre"] });
    if (p === "Centre") {
      var c = await ed.getPoint("Specify centre point of arc"), s = await ed.getPoint("Specify start point of arc", { base: c }), r = G.dist(c, s), a1 = G.ang(c, s) * R2D;
      ed.preview = function (w) { return [{ t: "arc", c: c, r: r, a1: a1, a2: G.ang(c, w) * R2D }]; };
      var e = await ed.getPoint("Specify end point of arc (counter-clockwise)", { base: c }); ed.doc.add({ t: "arc", c: c, r: r, a1: a1, a2: G.ang(c, e) * R2D }); return;
    }
    var m = await ed.getPoint("Specify second point of arc", { base: p }); ed.preview = function (w) { var a = G.arc3(p, m, w); return a ? [a] : []; };
    var q = await ed.getPoint("Specify end point of arc", { base: m }), A3 = G.arc3(p, m, q); if (!A3) throw new Error("Points are in a line"); ed.doc.add(A3);
  });
  cmd("ELLIPSE", ["EL"], async function (ed) {
    var a = await ed.getPoint("Specify axis endpoint of ellipse", { kw: ["Centre"] }), c, ax;
    if (a === "Centre") { c = await ed.getPoint("Specify centre of ellipse"); ed.preview = function (w) { return [{ t: "line", a: c, b: w }]; }; var e1 = await ed.getPoint("Specify endpoint of axis", { base: c }); ax = G.sub(e1, c); }
    else { ed.preview = function (w) { return [{ t: "line", a: a, b: w }]; }; var b = await ed.getPoint("Specify other endpoint of axis", { base: a }); c = G.mid(a, b); ax = G.sub(b, c); }
    var rx = G.len(ax), rot = Math.atan2(ax[1], ax[0]) * R2D;
    ed.preview = function (w) { var ry = Math.abs(G.dot(G.sub(w, c), G.perp(G.norm(ax)))); return [{ t: "ellipse", c: c, rx: rx, ry: Math.max(ry, 1e-6), rot: rot }]; };
    var d = await ed.getDist("Specify distance to other axis", { base: c }); ed.doc.add({ t: "ellipse", c: c, rx: rx, ry: d, rot: rot });
  });
  cmd("SPLINE", ["SPL"], async function (ed) {
    var pts = [lastPt(ed, await ed.getPoint("Specify first point"))];
    while (true) {
      ed.preview = function (w) { return [{ t: "spline", pts: pts.concat([w]) }]; };
      var p = await ed.getPoint("Enter next point", { opt: true, base: pts[pts.length - 1], kw: pts.length >= 3 ? ["Close", "Undo"] : ["Undo"] });
      if (p == null) break; if (p === "Undo") { if (pts.length > 1) pts.pop(); continue; } if (p === "Close") { ed.preview = null; ed.doc.add({ t: "spline", pts: pts, closed: true }); return; }
      pts.push(p);
    }
    ed.preview = null; if (pts.length > 1) ed.doc.add({ t: "spline", pts: pts });
  });
  cmd("POINT", ["PO"], async function (ed) { while (true) { var p = await ed.getPoint("Specify a point", { opt: true }); if (p == null) return; ed.doc.add({ t: "point", p: p }); } });
  cmd("XLINE", ["XL"], async function (ed) {
    var p = await ed.getPoint("Specify a point", { kw: ["Hor", "Ver", "Ang"] }), dir = null;
    if (p === "Hor") dir = [1, 0]; else if (p === "Ver") dir = [0, 1]; else if (p === "Ang") { var a = await ed.getAngle("Enter angle of xline", { def: 45 }); dir = [Math.cos(a * D2R), Math.sin(a * D2R)]; }
    if (dir) { while (true) { ed.preview = function (w) { return [{ t: "xline", p: w, dir: dir }]; }; var q = await ed.getPoint("Specify through point", { opt: true }); if (q == null) return; ed.doc.add({ t: "xline", p: q, dir: dir }); } }
    while (true) { ed.preview = function (w) { return G.dist(p, w) > 1e-9 ? [{ t: "xline", p: p, dir: G.norm(G.sub(w, p)) }] : []; }; var t = await ed.getPoint("Specify through point", { base: p , opt: true }); if (t == null) return; ed.doc.add({ t: "xline", p: p, dir: G.norm(G.sub(t, p)) }); }
  });
  cmd("RAY", [], async function (ed) { var p = await ed.getPoint("Specify start point"); while (true) { ed.preview = function (w) { return G.dist(p, w) > 1e-9 ? [{ t: "ray", p: p, dir: G.norm(G.sub(w, p)) }] : []; }; var t = await ed.getPoint("Specify through point", { base: p , opt: true }); if (t == null) return; ed.doc.add({ t: "ray", p: p, dir: G.norm(G.sub(t, p)) }); } });
  var JUST = { L: "l", C: "c", R: "r", M: "cm", TL: "lt", TC: "ct", TR: "rt", ML: "lm", MC: "cm", MR: "rm", BL: "lb", BC: "cb", BR: "rb" };
  async function textCmd(ed, multi) {
    var al = ed.txtAl || "l", p = await ed.getPoint("Specify start point of text", { kw: ["Justify"] });
    if (p === "Justify") { var j = await ed.getKw("Enter an option", ["L", "C", "R", "TL", "TC", "TR", "ML", "MC", "MR", "BL", "BC", "BR"], "L"); al = ed.txtAl = JUST[j] || "l"; p = await ed.getPoint("Specify point of text"); }
    var dsc = (ed.doc.d.dim && ed.doc.d.dim.sc) || 1, h = await ed.getDist("Specify height", { base: p, def: ed.txtH || 2.5 * dsc }); ed.txtH = h;
    var rot = await ed.getAngle("Specify rotation angle of text", { base: p, def: 0 }), lines = [], y = 0;
    while (true) {
      ed.preview = function () { return lines.length || true ? [{ t: "text", p: p, s: lines.concat(["_"]).join("\n"), h: h, rot: rot, al: al }] : []; };
      var s = await ed.getText(multi ? "Enter text line (empty line ends)" : "Enter text (empty line ends)");
      if (s == null || s === "") break;
      if (multi) lines.push(s); else { var q = G.polar(p, h * 1.5 * lines.length, (rot - 90) * D2R); ed.doc.add({ t: "text", p: q, s: s, h: h, rot: rot, al: al }); lines.push(s); }
    }
    ed.preview = null; if (multi && lines.length) ed.doc.add({ t: "text", p: p, s: lines.join("\n"), h: h, rot: rot, al: al, mt: true });
  }
  cmd("TEXT", ["T", "DT", "DTEXT"], function (ed) { return textCmd(ed, false); });
  cmd("MTEXT", ["MT"], function (ed) { return textCmd(ed, true); });
  cmd("LEADER", ["LE", "QLEADER"], async function (ed) {
    var pts = [await ed.getPoint("Specify leader arrow point")];
    while (true) { ed.preview = function (w) { return [{ t: "leader", pts: pts.concat([w]) }]; }; var p = await ed.getPoint("Specify next point", { base: pts[pts.length - 1] , opt: true }); if (p == null) break; pts.push(p); if (pts.length >= 3) break; }
    if (pts.length < 2) return; var s = await ed.getText("Enter annotation text"); ed.preview = null; ed.doc.add({ t: "leader", pts: pts, s: s || "" });
  });

  /* ---------- dimensions ---------- */
  async function dimLin(ed, kind) {
    var a = await ed.getPoint("Specify first extension line origin or <select object>", { allowNone: true }), b;
    if (a == null) { var pk = await ed.getEnt("Select object to dimension", { filter: function (e) { return e.t === "line" || e.t === "pline" || e.t === "circle" || e.t === "arc"; } }); var s = ed.doc.segs(pk.e), best = null; s.forEach(function (sg) { var c = G.closest(sg, pk.p); if (!best || c.d < best.d) best = { s: sg, d: c.d }; }); if (best.s.k === "L") { a = best.s.a; b = best.s.b; } else { a = G.polar(best.s.c, best.s.r, Math.PI); b = G.polar(best.s.c, best.s.r, 0); } }
    else { ed.preview = function (w) { return [{ t: "line", a: a, b: w }]; }; b = await ed.getPoint("Specify second extension line origin", { base: a }); }
    var rot = null, txt = null;
    while (true) {
      ed.preview = function (w) { return [Object.assign({ t: "dim", kind: kind, a: a, b: b, p: w }, rot != null ? { rot: rot } : {}, txt ? { txt: txt } : {})]; };
      var p = await ed.getPoint("Specify dimension line location", { kw: kind === "lin" ? ["Text", "Horizontal", "Vertical", "Rotated"] : ["Text"] });
      if (p === "Text") { txt = await ed.getText("Enter dimension text (<> = measured value)", { def: "<>" }); continue; }
      if (p === "Horizontal") { rot = 0; continue; } if (p === "Vertical") { rot = 90; continue; } if (p === "Rotated") { rot = await ed.getAngle("Specify angle of dimension line", { def: 0 }); continue; }
      ed.preview = null; var d = { t: "dim", kind: kind, a: a, b: b, p: p, layer: ed.doc.d.layers.DIM ? "DIM" : undefined }; if (rot != null) d.rot = rot; if (txt && txt !== "<>") d.txt = txt;
      ed.lastDim = ed.doc.add(d); return;
    }
  }
  cmd("DIMLINEAR", ["DLI", "DIM", "DIMLIN"], function (ed) { return dimLin(ed, "lin"); });
  cmd("DIMALIGNED", ["DAL"], function (ed) { return dimLin(ed, "ali"); });
  cmd("DIMCONTINUE", ["DCO"], async function (ed) {
    var base = ed.lastDim && ed.doc.get(ed.lastDim.id); if (!base || (base.kind !== "lin" && base.kind !== "ali")) { var pk = await ed.getEnt("Select continued dimension", { filter: function (e) { return e.t === "dim" && (e.kind === "lin" || e.kind === "ali"); } }); base = pk.e; }
    while (true) {
      var g = G.dimGeom(ed.dimEnt(base)), from = base.b, off = G.sub(g.lines[2][1], base.b);
      ed.preview = function (w) { return [Object.assign({}, base, { id: undefined, a: from, b: w, p: G.add(w, off) })]; };
      var q = await ed.getPoint("Specify a second extension line origin", { base: from , opt: true }); if (q == null) return;
      var nd = Object.assign({}, base, { a: from, b: q, p: G.add(q, off) }); delete nd.id; delete nd.txt; base = ed.lastDim = ed.doc.add(nd);
    }
  });
  cmd("DIMBASELINE", ["DBA"], async function (ed) {
    var base = ed.lastDim && ed.doc.get(ed.lastDim.id); if (!base) { var pk = await ed.getEnt("Select base dimension", { filter: function (e) { return e.t === "dim" && (e.kind === "lin" || e.kind === "ali"); } }); base = pk.e; }
    var step = ((ed.doc.d.dim.th || 2.5) * 3) * (ed.doc.d.dim.sc || 1), cur = base;
    while (true) {
      var g = G.dimGeom(ed.dimEnt(cur)), n = G.norm(G.sub(g.lines[2][0], base.a)), pp = G.add(cur.p, G.mul(n, step));
      ed.preview = function (w) { return [Object.assign({}, base, { id: undefined, b: w, p: pp })]; };
      var q = await ed.getPoint("Specify a second extension line origin", { base: base.a , opt: true }); if (q == null) return;
      var nd = Object.assign({}, base, { b: q, p: pp }); delete nd.id; delete nd.txt; cur = ed.lastDim = ed.doc.add(nd);
    }
  });
  cmd("DIMANGULAR", ["DAN"], async function (ed) {
    var f = function (e) { return e.t === "line"; }, l1 = await ed.getEnt("Select first line", { filter: f }), l2 = await ed.getEnt("Select second line", { filter: f });
    var X = G.intersect({ k: "L", a: l1.e.a, b: l1.e.b }, { k: "L", a: l2.e.a, b: l2.e.b }, true, true); if (!X.length) throw new Error("Lines are parallel"); X = X[0];
    var far = function (e, p) { return G.dist(e.a, X) > G.dist(e.b, X) ? e.a : e.b; }, A1 = far(l1.e), B1 = far(l2.e);
    function mk(w) { var a1 = G.ang(X, A1), a2 = G.ang(X, B1), aw = G.ang(X, w), d = G.dist(X, w); var inA = G.an(aw - a1) < G.an(a2 - a1); var pa = inA ? A1 : B1, pb = inA ? B1 : A1; if (!inA) { pa = B1; pb = A1; } return { t: "dim", kind: "ang", c: X, a: G.polar(X, 1, G.ang(X, pa)), b: G.polar(X, 1, G.ang(X, pb)), p: w }; }
    ed.preview = function (w) { return [mk(w)]; };
    var p = await ed.getPoint("Specify dimension arc line location"); ed.preview = null; ed.lastDim = ed.doc.add(Object.assign(mk(p), { layer: ed.doc.d.layers.DIM ? "DIM" : undefined }));
  });
  async function dimRad(ed, kind) {
    var pk = await ed.getEnt("Select arc or circle", { filter: function (e) { return e.t === "circle" || e.t === "arc"; } }), e = pk.e;
    ed.preview = function (w) { return [{ t: "dim", kind: kind, c: e.c, r: e.r, p: w }]; };
    var p = await ed.getPoint("Specify dimension line location"); ed.preview = null; ed.doc.add({ t: "dim", kind: kind, c: e.c, r: e.r, p: p, layer: ed.doc.d.layers.DIM ? "DIM" : undefined });
  }
  cmd("DIMRADIUS", ["DRA"], function (ed) { return dimRad(ed, "rad"); });
  cmd("DIMDIAMETER", ["DDI"], function (ed) { return dimRad(ed, "dia"); });
  cmd("DIMORDINATE", ["DOR"], async function (ed) {
    var a = await ed.getPoint("Specify feature location"); ed.preview = function (w) { var ax = Math.abs(w[0] - a[0]) < Math.abs(w[1] - a[1]) ? "x" : "y"; return [{ t: "dim", kind: "ord", a: a, p: ax === "x" ? [a[0], w[1]] : [w[0], a[1]], axis: ax, o: [0, 0] }]; };
    var w = await ed.getPoint("Specify leader endpoint", { base: a }); ed.preview = null; var ax = Math.abs(w[0] - a[0]) < Math.abs(w[1] - a[1]) ? "x" : "y"; ed.doc.add({ t: "dim", kind: "ord", a: a, p: ax === "x" ? [a[0], w[1]] : [w[0], a[1]], axis: ax, o: [0, 0], layer: ed.doc.d.layers.DIM ? "DIM" : undefined });
  });

  /* ---------- hatch / boundary ---------- */
  /* region containing point p: smallest closed entity around it (with islands), else a face traced through lines / arcs / open polylines */
  CAD.boundaryAt = function (doc, p, iso, opts) {
    opts = opts || {};
    var vis = doc.d.ents.filter(function (e) { return doc.visible(e) && (!iso || iso.has(e.id)) && e.t !== "text" && e.t !== "dim" && e.t !== "image" && e.t !== "hatch" && e.t !== "point" && (!opts.only || opts.only(e)); });
    var closed = vis.map(function (e) { var L = loopOf(e); return L ? { e: e, L: L, poly: G.loopPts(L), A: Math.abs(G.plineArea(L)) } : null; }).filter(Boolean);
    var around = closed.filter(function (c) { return G.inPoly(p, c.poly); }).sort(function (a, b) { return a.A - b.A; });
    var face = traceFace(vis, p, doc, opts.segs);
    var outer = null;
    if (face && (!around.length || Math.abs(G.plineArea(face)) < around[0].A - 1e-6)) outer = { L: face, poly: face.map(function (q) { return [q[0], q[1]]; }), A: Math.abs(G.plineArea(face)) };
    else if (around.length) outer = around[0];
    if (!outer) return null;
    var islands = closed.filter(function (c) { return c !== outer && c.A < outer.A && !G.inPoly(p, c.poly) && c.poly.every(function (q) { return G.inPoly(q, outer.poly); }); });
    islands = islands.filter(function (c) { return !islands.some(function (d) { return d !== c && d.A > c.A && c.poly.every(function (q) { return G.inPoly(q, d.poly); }); }); });   // only outermost islands
    return { loops: [outer.L].concat(islands.map(function (c) { return c.L; })), area: outer.A - islands.reduce(function (s, c) { return s + c.A; }, 0), outer: outer.L };
  };
  function loopOf(e) {
    if (e.t === "pline" && e.closed) return e.pts.map(function (q) { return [q[0], q[1], q[2] || 0]; });
    if (e.t === "pline" && e.pts.length > 2 && G.eq(e.pts[0], e.pts[e.pts.length - 1], 1e-6)) return e.pts.slice(0, -1).map(function (q) { return [q[0], q[1], q[2] || 0]; });
    if (e.t === "circle") return [[e.c[0] + e.r, e.c[1], 1], [e.c[0] - e.r, e.c[1], 1]];
    if (e.t === "ellipse" && e.a1 == null) return G.approxEllipse(e, 72).slice(0, -1).map(function (q) { return [q[0], q[1], 0]; });
    if (e.t === "spline" && e.closed) return G.splinePts(e, 10).slice(0, -1).map(function (q) { return [q[0], q[1], 0]; });
    return null;
  }
  /* planar face tracing through all segments near p */
  function traceFace(vis, p, doc, segsFn) {
    var segs = []; vis.forEach(function (e) { if (e.t === "xline" || e.t === "ray") return; (segsFn && segsFn(e) || doc.segs(e)).forEach(function (s) { if (s.k === "L") segs.push([s.a, s.b]); else { var n = Math.max(6, Math.ceil(G.sweep(s) / (Math.PI / 32))); for (var i = 0; i < n; i++) segs.push([G.polar(s.c, s.r, s.s + G.sweep(s) * i / n), G.polar(s.c, s.r, s.s + G.sweep(s) * (i + 1) / n)]); } }); });
    if (segs.length > 6000) return null;
    // split at intersections
    var cuts = segs.map(function () { return [0, 1]; });
    for (var i = 0; i < segs.length; i++) for (var j = i + 1; j < segs.length; j++) {
      var a = segs[i], b = segs[j]; if (Math.max(a[0][0], a[1][0]) < Math.min(b[0][0], b[1][0]) - 1e-6 || Math.max(b[0][0], b[1][0]) < Math.min(a[0][0], a[1][0]) - 1e-6 || Math.max(a[0][1], a[1][1]) < Math.min(b[0][1], b[1][1]) - 1e-6 || Math.max(b[0][1], b[1][1]) < Math.min(a[0][1], a[1][1]) - 1e-6) continue;
      var X = G.intersect({ k: "L", a: a[0], b: a[1] }, { k: "L", a: b[0], b: b[1] }); X.forEach(function (q) { cuts[i].push(G.segParam({ k: "L", a: a[0], b: a[1] }, q)); cuts[j].push(G.segParam({ k: "L", a: b[0], b: b[1] }, q)); });
    }
    var V = [], key = {}, tol = 1e-4; function vid(q) { var k = Math.round(q[0] / tol) + "," + Math.round(q[1] / tol); if (key[k] == null) { key[k] = V.length; V.push({ p: q, out: [] }); } return key[k]; }
    var E = [];
    segs.forEach(function (s, i) { var ts = cuts[i].filter(function (t) { return t >= -1e-9 && t <= 1 + 1e-9; }).sort(function (x, y) { return x - y; }); for (var k = 0; k + 1 < ts.length; k++) { if (ts[k + 1] - ts[k] < 1e-9) continue; var u = vid(G.lerp(s[0], s[1], ts[k])), v = vid(G.lerp(s[0], s[1], ts[k + 1])); if (u === v) continue; E.push([u, v]); } });
    E.forEach(function (e, i) { V[e[0]].out.push({ to: e[1], ang: G.ang(V[e[0]].p, V[e[1]].p) }); V[e[1]].out.push({ to: e[0], ang: G.ang(V[e[1]].p, V[e[0]].p) }); });
    // nearest edge hit by a ray to +x from p
    var best = null; E.forEach(function (e) { var A = V[e[0]].p, B = V[e[1]].p; if ((A[1] > p[1]) === (B[1] > p[1])) return; var x = A[0] + (p[1] - A[1]) * (B[0] - A[0]) / (B[1] - A[1]); if (x > p[0] && (!best || x < best.x)) best = { x: x, e: e }; });
    if (!best) return null;
    // walk with the face on the left: start along the edge going "up" (so p, on its left side… we need p left of direction)
    var u = best.e[0], v = best.e[1]; if (V[u].p[1] > V[v].p[1]) { var t = u; u = v; v = t; }   // edge goes upward; p is to its left
    var start = [u, v], face = [V[u].p], guard = 0;
    while (guard++ < 20000) {
      face.push(V[v].p);
      var back = G.ang(V[v].p, V[u].p), outs = V[v].out, nb = null, bestTurn = Infinity;
      outs.forEach(function (o) { var turn = G.an(back - o.ang); if (turn < 1e-9) turn = G.TAU; if (turn < bestTurn) { bestTurn = turn; nb = o; } });   // smallest clockwise from back = keep face on the left
      if (!nb) return null; u = v; v = nb.to;
      if (u === start[0] && v === start[1]) break;
    }
    face.pop(); if (face.length < 3) return null;
    var poly = face; if (G.plineArea(poly.map(function (q) { return [q[0], q[1], 0]; })) <= 0 || !G.inPoly(p, poly)) return null;
    // drop collinear points
    var out = []; for (var k = 0; k < poly.length; k++) { var a = poly[(k - 1 + poly.length) % poly.length], b = poly[k], c = poly[(k + 1) % poly.length]; if (Math.abs(G.cross(G.sub(b, a), G.sub(c, b))) > 1e-9 * Math.max(1, G.dist(a, b) * G.dist(b, c))) out.push([b[0], b[1], 0]); }
    return out.length >= 3 ? out : null;
  }
  cmd("HATCH", ["H", "BH"], async function (ed) {
    var pat = ed.hPat || "ANSI31", sc = ed.hSc || ((ed.doc.d.dim && ed.doc.d.dim.sc) || 1), ang = ed.hAng || 0, made = 0;
    while (true) {
      var p = await ed.getPoint("Pick internal point (" + pat + ", scale " + UN.trimNum(sc, 3) + ")", { opt: true, kw: ["Select objects", "Pattern", "Scale", "Angle"] });
      if (p == null) break;
      if (p === "Pattern") { pat = ed.hPat = (await ed.getKw("Pattern", Object.keys(CAD.HATCH), pat)).toUpperCase(); continue; }
      if (p === "Scale") { sc = ed.hSc = await ed.getNum("Pattern scale", { def: sc }); continue; }
      if (p === "Angle") { ang = ed.hAng = await ed.getAngle("Pattern angle", { def: ang }); continue; }
      if (p === "Select objects") { ed.sel.clear(); var ids = await ed.getSel("Select closed objects", { fresh: true }), loops = E(ed, ids).map(loopOf).filter(Boolean); clearSel(ed); if (!loops.length) { ed.say("No closed objects selected."); continue; } ed.doc.add({ t: "hatch", pat: pat, sc: sc, ang: ang, loops: loops, layer: ed.doc.d.layers.HATCH ? "HATCH" : undefined }); made++; continue; }
      var b = CAD.boundaryAt(ed.doc, p, ed.isolated); if (!b) { ed.say("No closed boundary found around that point."); continue; }
      ed.doc.add({ t: "hatch", pat: pat, sc: sc, ang: ang, loops: b.loops, layer: ed.doc.d.layers.HATCH ? "HATCH" : undefined }); made++;
      ed.say("Hatched area " + ed.fmtA(b.area));
    }
  });
  cmd("BOUNDARY", ["BO", "BPOLY"], async function (ed) {
    while (true) { var p = await ed.getPoint("Pick internal point", { opt: true }); if (p == null) return; var b = CAD.boundaryAt(ed.doc, p, ed.isolated); if (!b) { ed.say("No closed boundary found."); continue; } ed.doc.add({ t: "pline", pts: b.outer, closed: true }); ed.say("Boundary created — area " + ed.fmtA(Math.abs(G.plineArea(b.outer)))); }
  });

  /* ---------- blocks ---------- */
  cmd("BLOCK", ["B"], async function (ed) {
    var name = (await ed.getText("Enter block name")).trim(); if (!name) return; if (ed.doc.d.blocks[name]) { var ow = await ed.getKw("Block exists. Redefine?", ["Yes", "No"], "No"); if (ow !== "Yes") return; }
    var base = await ed.getPoint("Specify insertion base point"), ids = await ed.getSel("Select objects"), ents = E(ed, ids); if (!ents.length) return;
    var B = Object.assign({}, ed.doc.d.blocks); B[name] = { base: base, ents: ents.map(function (e) { var x = CAD.clone(e); delete x.id; return x; }) }; ed.doc.set("blocks", B);
    ents.forEach(function (e) { ed.doc.del(e.id); }); clearSel(ed); ed.doc.add({ t: "insert", block: name, p: base, sx: 1, sy: 1, rot: 0 }); ed.say("Block " + name + " created (" + ents.length + " objects).");
  });
  cmd("INSERT", ["I"], async function (ed, o) {
    var names = Object.keys(ed.doc.d.blocks).filter(function (n) { return n[0] !== "*"; }); if (!names.length) throw new Error("No blocks in this drawing. Make one with BLOCK.");
    var name = ed.insName && ed.doc.d.blocks[ed.insName] ? ed.insName : await ed.getText("Enter block name (" + names.slice(0, 12).join(", ") + (names.length > 12 ? "…" : "") + ")", { def: names[0] }); ed.insName = null;
    if (!ed.doc.d.blocks[name]) throw new Error("Block " + name + " not found"); var sc = 1, rot = 0;
    while (true) {
      ed.preview = function (w) { return [{ t: "insert", block: name, p: w, sx: sc, sy: sc, rot: rot }]; };
      var p = await ed.getPoint("Specify insertion point", { kw: ["Scale", "Rotate"] });
      if (p === "Scale") { sc = await ed.getNum("Scale factor", { def: sc }); continue; } if (p === "Rotate") { rot = await ed.getAngle("Rotation angle", { def: rot }); continue; }
      ed.preview = null; ed.doc.add({ t: "insert", block: name, p: p, sx: sc, sy: sc, rot: rot }); return;
    }
  });

  /* ================= MODIFY ================= */
  async function selBase(ed, verb) { var ids = await ed.getSel("Select objects to " + verb), ents = E(ed, ids); if (!ents.length) throw new Error("cancel"); return ents; }
  cmd("MOVE", ["M"], async function (ed) {
    var ents = await selBase(ed, "move"), b = await ed.getPoint("Specify base point", { kw: ["Displacement"] }), d;
    if (b === "Displacement") { var q = await ed.getPoint("Specify displacement (dx,dy)"); d = q; }
    else { ed.preview = function (w) { var M = G.mTrans(w[0] - b[0], w[1] - b[1]); return ents.map(function (e) { return G.xform(e, M); }); }; var p2 = await ed.getPoint("Specify second point", { base: b }); d = G.sub(p2, b); }
    ed.preview = null; xformAll(ed, ents, G.mTrans(d[0], d[1]));
  });
  cmd("COPY", ["CO", "CP"], async function (ed) {
    var ents = await selBase(ed, "copy"), b = await ed.getPoint("Specify base point");
    while (true) {
      ed.preview = function (w) { var M = G.mTrans(w[0] - b[0], w[1] - b[1]); return ents.map(function (e) { return G.xform(e, M); }); };
      var p = await ed.getPoint("Specify second point", { base: b, kw: ["Array"] , opt: true }); if (p == null) break;
      if (p === "Array") { var n = await ed.getNum("Number of items to array", { int: true, def: 3 }); ed.preview = function (w) { var o = []; for (var i = 1; i < n; i++) { var M = G.mTrans((w[0] - b[0]) * i, (w[1] - b[1]) * i); ents.forEach(function (e) { o.push(G.xform(e, M)); }); } return o; }; var q = await ed.getPoint("Specify second point", { base: b }); for (var i = 1; i < n; i++) xformAll(ed, ents, G.mTrans((q[0] - b[0]) * i, (q[1] - b[1]) * i), true); break; }
      xformAll(ed, ents, G.mTrans(p[0] - b[0], p[1] - b[1]), true);
    }
    ed.preview = null; clearSel(ed);
  });
  cmd("ROTATE", ["RO"], async function (ed) {
    var ents = await selBase(ed, "rotate"), b = await ed.getPoint("Specify base point"), copy = false, ref = 0;
    while (true) {
      ed.preview = function (w) { var M = G.mRot(b, G.ang(b, w) - ref * D2R); return ents.map(function (e) { return G.xform(e, M); }); };
      var a = await ed.getAngle("Specify rotation angle", { base: b, kw: ["Copy", "Reference"], def: ed.rotA || 90 });
      if (a === "Copy") { copy = true; ed.say("Rotating a copy of the selected objects."); continue; }
      if (a === "Reference") { ref = await ed.getAngle("Specify the reference angle", { def: 0 }); var na = await ed.getAngle("Specify the new angle", { base: b }); a = na - ref; }
      else a = a - 0; ed.rotA = a; ed.preview = null; xformAll(ed, ents, G.mRot(b, a * D2R), copy); return;
    }
  });
  cmd("SCALE", ["SC"], async function (ed) {
    var ents = await selBase(ed, "scale"), b = await ed.getPoint("Specify base point"), copy = false;
    while (true) {
      var f = await ed.getNum("Specify scale factor", { base: b, kw: ["Copy", "Reference"], def: ed.scF || 2 });
      if (f === "Copy") { copy = true; continue; }
      if (f === "Reference") { var r1 = await ed.getPoint("Specify reference length — first point", { base: b }), r2 = await ed.getPoint("Specify second point", { base: r1 }), rl = G.dist(r1, r2); var nl = await ed.getDist("Specify new length (true distance)", { base: b }); if (!(rl > 0)) throw new Error("Reference length is zero"); f = nl / rl; }
      if (!(f > 0)) throw new Error("Scale must be more than zero"); ed.scF = f; xformAll(ed, ents, G.mScale(b, f), copy); ed.say("Scaled by " + UN.trimNum(f, 6)); return;
    }
  });
  cmd("MIRROR", ["MI"], async function (ed) {
    var ents = await selBase(ed, "mirror"), a = await ed.getPoint("Specify first point of mirror line");
    ed.preview = function (w) { if (G.dist(a, w) < 1e-9) return []; var M = G.mMirror(a, w); return ents.map(function (e) { return G.xform(e, M); }).concat([{ t: "line", a: a, b: w, _pc: "#2ec27e" }]); };
    var b = await ed.getPoint("Specify second point of mirror line", { base: a }); ed.preview = null;
    var er = await ed.getKw("Erase source objects?", ["Yes", "No"], "No"); xformAll(ed, ents, G.mMirror(a, b), er !== "Yes"); clearSel(ed);
  });
  cmd("OFFSET", ["O"], async function (ed) {
    var d = await ed.getDist("Specify offset distance", { kw: ["Through", "Layer"], def: ed.offD }), through = false;
    if (d === "Through") through = true; else if (d === "Layer") { ed.offCur = !ed.offCur; ed.say("Offset objects go to the " + (ed.offCur ? "current layer" : "source layer")); d = await ed.getDist("Specify offset distance", { def: ed.offD }); }
    if (!through) ed.offD = d; clearSel(ed);
    while (true) {
      var pk = await ed.getEnt("Select object to offset (Enter to finish)", { allowNone: true, filter: function (e) { return /^(line|pline|circle|arc|xline|ray|ellipse|spline|wall|beam)$/.test(e.t); } }); if (!pk) return;
      var e = pk.e; ed.preview = function (w) { var dist = through ? G.closest(ed.doc.segs(e).reduce(function (bst, s) { var c = G.closest(s, w); return !bst || c.d < bst.d ? { s: s, d: c.d } : bst; }, null).s, w).d : d; var o = G.offset(e, dist, w, ed.doc.d.blocks); return o ? [o] : []; };
      var side = await ed.getPoint(through ? "Specify through point" : "Specify point on side to offset"); ed.preview = null;
      var dist = through ? ed.distTo(e, side) : d, o = G.offset(e, dist, side, ed.doc.d.blocks); if (!o) { ed.say("Cannot offset that object by this distance."); continue; }
      if (ed.offCur) o.layer = ed.doc.d.cur.layer; ed.doc.add(o);
    }
  });
  cmd("GRIPLINK", [], function (ed) { ed.set.linkGrips = ed.set.linkGrips === false; ed.say(ed.set.linkGrips ? "Joined corners move together (hold Alt while dragging to move one only)." : "Each corner now moves on its own."); });
  cmd("TRIM", ["TR"], async function (ed) {
    clearSel(ed); ed.say("Cutting edges: all visible objects. Pick the part to remove.");
    while (true) {
      var pk = await ed.getEnt("Select object to trim (Enter to finish)", { allowNone: true, kw: ["Undo"], filter: function (e) { return /^(line|pline|circle|arc|xline|ray|wall|beam)$/.test(e.t); } }); if (!pk) return;
      if (pk === "Undo") { ed.doc.commit(); ed.doc.undo(); ed.doc.begin("TRIM"); continue; }
      var e = pk.e, r = G.trim(e, cutters(ed, e.id, bigBox(ed, e)), pk.p, ed.doc.d.blocks);
      if (r === null) { ed.say("No cutting edge crosses that object."); continue; } replaceEnt(ed, e, r);
    }
  });
  cmd("EXTEND", ["EX"], async function (ed) {
    clearSel(ed); ed.say("Boundary edges: all visible objects. Pick near the end to extend.");
    while (true) {
      var pk = await ed.getEnt("Select object to extend (Enter to finish)", { allowNone: true, filter: function (e) { return /^(line|arc|pline|wall|beam)$/.test(e.t); } }); if (!pk) return;
      var r = G.extend(pk.e, cutters(ed, pk.e.id, null), pk.p); if (!r) { ed.say("Object does not meet a boundary when extended."); continue; } ed.doc.mod(pk.e.id, r);
    }
  });
  cmd("ERASE", ["E", "DEL"], async function (ed) { var ents = await selBase(ed, "erase"), ids = {}; ents.forEach(function (e) { ids[e.id] = 1; }); ed.doc.d.ents.filter(function (o) { return o.host && ids[o.host] && !ids[o.id]; }).forEach(function (o) { ents.push(o); }); ents.forEach(function (e) { ed.doc.del(e.id); }); clearSel(ed); ed.say(ents.length + " object(s) erased."); });
  cmd("EXPLODE", ["X"], async function (ed) { var ents = await selBase(ed, "explode"), n = 0; ents.forEach(function (e) { var p = G.explode(e, ed.doc.d.blocks); if (p && p.length) { replaceEnt(ed, e, p); n++; } }); clearSel(ed); ed.say(n + " object(s) exploded."); });
  cmd("JOIN", ["J"], async function (ed) { var ents = await selBase(ed, "join"), r = G.join(ents); if (!r || r.pts.length < 2) throw new Error("Nothing to join"); var base = ents[0]; ents.forEach(function (e) { ed.doc.del(e.id); }); ed.doc.add({ t: "pline", pts: r.pts, closed: r.closed, layer: base.layer }); clearSel(ed); ed.say("Joined into one " + (r.closed ? "closed " : "") + "polyline" + (r.left ? " (" + r.left + " piece(s) did not touch and were dropped)" : "") + "."); });
  async function filCh(ed, chamfer) {
    while (true) {
      var f = function (e) { return e.t === "line" || e.t === "wall" || e.t === "beam"; };
      var a = await ed.getEnt("Select first line", { kw: chamfer ? ["Distance"] : ["Radius"], filter: f });
      if (a === "Radius") { ed.filR = await ed.getDist("Specify fillet radius", { def: ed.filR || 0 }); continue; }
      if (a === "Distance") { ed.chD1 = await ed.getDist("Specify first chamfer distance", { def: ed.chD1 || 0 }); ed.chD2 = await ed.getDist("Specify second chamfer distance", { def: ed.chD2 || ed.chD1 }); continue; }
      var b = await ed.getEnt("Select second line", { filter: f }); if (a.e.id === b.e.id) throw new Error("Pick two different lines");
      var r = chamfer ? G.fillet(a.e, a.p, b.e, b.p, ed.chD1 || 0, ed.chD2 != null ? ed.chD2 : true) : G.fillet(a.e, a.p, b.e, b.p, ed.filR || 0);
      if (!r) throw new Error("Lines are parallel"); ed.doc.mod(a.e.id, r.a); ed.doc.mod(b.e.id, r.b); if (r.add) ed.doc.add(r.add); return;
    }
  }
  cmd("FILLET", ["F"], function (ed) { return filCh(ed, false); });
  cmd("CHAMFER", ["CHA"], function (ed) { return filCh(ed, true); });
  cmd("ARRAY", ["AR"], async function (ed) {
    var ents = await selBase(ed, "array"), t = await ed.getKw("Enter array type", ["Rectangular", "Polar"], "Rectangular");
    if (t === "Rectangular") {
      var rows = await ed.getNum("Number of rows", { int: true, def: 2 }), cols = await ed.getNum("Number of columns", { int: true, def: 3 });
      var dy = rows > 1 ? await ed.getDist("Distance between rows") : 0, dx = cols > 1 ? await ed.getDist("Distance between columns") : 0;
      G.rectArray(rows, cols, dx, dy).forEach(function (M) { xformAll(ed, ents, M, true); }); clearSel(ed); return;
    }
    var c = await ed.getPoint("Specify centre point of array"), n = await ed.getNum("Number of items (including the original)", { int: true, def: 6 }), fill = await ed.getAngle("Angle to fill (+ = counter-clockwise)", { def: 360 }), ri = await ed.getKw("Rotate items as copied?", ["Yes", "No"], "Yes");
    var bb = ents.reduce(function (b, e) { var x = ed.doc.bbox(e); G.ext(b, [x[0], x[1]]); G.ext(b, [x[2], x[3]]); return b; }, [Infinity, Infinity, -Infinity, -Infinity]);
    G.polarArray(c, n, fill, ri === "Yes", [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2]).forEach(function (M) { xformAll(ed, ents, M, true); }); clearSel(ed);
  });
  cmd("STRETCH", ["S"], async function (ed) {
    clearSel(ed); var a = await ed.getPoint("Select objects to stretch by crossing window — first corner"); ed.preview = function (w) { return [{ t: "pline", pts: rectPts(a, w), closed: true, _pc: "#2ec27e" }]; };
    var b = await ed.getPoint("Specify opposite corner"); ed.preview = null;
    var x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]), inW = function (p) { return p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1; };
    var ents = ed.inWindow(a, b, true).filter(function (e) { return ed.doc.editable(e); });
    var base = await ed.getPoint("Specify base point");
    function st(e, d) {
      var bb = ed.doc.bbox(e), full = bb[0] >= x0 && bb[2] <= x1 && bb[1] >= y0 && bb[3] <= y1, o = CAD.clone(e), mv = function (p) { return inW(p) ? [p[0] + d[0], p[1] + d[1]].concat(p.length > 2 ? [p[2]] : []) : p; };
      if (full) return G.xform(e, G.mTrans(d[0], d[1]));
      if (e.t === "line") { o.a = mv(e.a); o.b = mv(e.b); } else if (e.t === "pline" || e.t === "spline" || e.t === "leader") o.pts = e.pts.map(mv); else if (e.t === "dim") ["a", "b", "p"].forEach(function (k) { if (e[k]) o[k] = mv(e[k]); }); else if (e.t === "hatch") o.loops = e.loops.map(function (L) { return L.map(mv); }); else if (e.t === "text" || e.t === "insert" || e.t === "point") { if (inW(e.p)) return G.xform(e, G.mTrans(d[0], d[1])); }
      return o;
    }
    ed.preview = function (w) { var d = G.sub(w, base); return ents.map(function (e) { return st(e, d); }); };
    var q = await ed.getPoint("Specify second point", { base: base }); ed.preview = null; var dd = G.sub(q, base); ents.forEach(function (e) { ed.doc.mod(e.id, st(e, dd)); });
  });
  cmd("BREAK", ["BR"], async function (ed) {
    var pk = await ed.getEnt("Select object (the pick point is the first break point)", { filter: function (e) { return /^(line|pline|circle|arc)$/.test(e.t); } }), p1 = pk.p;
    var p2 = await ed.getPoint("Specify second break point", { kw: ["First"] }); if (p2 === "First") { p1 = await ed.getPoint("Specify first break point"); p2 = await ed.getPoint("Specify second break point"); }
    var e = pk.e, S = ed.doc.segs(e), proj = function (p) { return S.reduce(function (b, s) { var c = G.closest(s, p); return !b || c.d < b.d ? c : b; }, null).p; };
    var q1 = proj(p1), q2 = proj(p2), cut = [{ k: "A", c: q1, r: 1e-6, s: 0, e: G.TAU, full: true }, { k: "A", c: q2, r: 1e-6, s: 0, e: G.TAU, full: true }];
    var r = G.trim(e, cut, G.mid(q1, q2).length ? proj(G.mid(q1, q2)) : q1, ed.doc.d.blocks); if (!r) throw new Error("Could not break that object"); replaceEnt(ed, e, r);
  });
  cmd("MATCHPROP", ["MA"], async function (ed) {
    var src = (await ed.getEnt("Select source object")).e; clearSel(ed);
    while (true) { var t = await ed.getEnt("Select destination object (Enter to finish)", { allowNone: true }); if (!t) return; var o = CAD.clone(t.e); ["layer", "color", "lw", "lt"].forEach(function (k) { if (src[k] == null) delete o[k]; else o[k] = src[k]; }); if (src.t === "text" && t.e.t === "text") o.h = src.h; if (src.t === "hatch" && t.e.t === "hatch") { o.pat = src.pat; o.sc = src.sc; o.ang = src.ang; } ed.doc.mod(t.e.id, o); }
  });
  cmd("DIVIDE", ["DIV"], async function (ed) {
    var pk = await ed.getEnt("Select object to divide", { filter: function (e) { return /^(line|pline|circle|arc|spline|ellipse)$/.test(e.t); } }), n = await ed.getNum("Enter the number of segments", { int: true, def: 4 });
    var S = ed.doc.segs(pk.e), L = G.segsLength(S); for (var i = 1; i < (pk.e.t === "circle" ? n + 1 : n); i++) ed.doc.add({ t: "point", p: atLen(S, L * i / n) }); ed.say("Segment length " + ed.fmt(L / n));
  });
  cmd("MEASURE", ["ME"], async function (ed) {
    var pk = await ed.getEnt("Select object to measure", { filter: function (e) { return /^(line|pline|circle|arc|spline|ellipse)$/.test(e.t); } }), d = await ed.getDist("Specify length of segment");
    var S = ed.doc.segs(pk.e), L = G.segsLength(S), n = 0; for (var x = d; x < L - 1e-9; x += d) { ed.doc.add({ t: "point", p: atLen(S, x) }); n++; } ed.say(n + " points placed.");
  });
  function atLen(S, x) { for (var i = 0; i < S.length; i++) { var l = G.segLen(S[i]); if (x <= l + 1e-9) return G.segAt(S[i], l ? x / l : 0); x -= l; } return G.segEnd(S[S.length - 1]); }
  cmd("GROUP", ["G"], async function (ed) { var ents = await selBase(ed, "group"), gid = CAD.uid(); ents.forEach(function (e) { ed.doc.mod(e.id, Object.assign(CAD.clone(e), { grp: gid })); }); ed.say("Group of " + ents.length + " objects created."); });
  cmd("UNGROUP", [], async function (ed) { var ents = await selBase(ed, "ungroup"); ents.forEach(function (e) { if (e.grp) { var o = CAD.clone(e); delete o.grp; ed.doc.mod(e.id, o); } }); clearSel(ed); });
  cmd("DRAWORDER", ["DR"], async function (ed) {
    var ents = await selBase(ed, "re-order"), w = await ed.getKw("Enter object ordering option", ["Front", "Back"], "Front");
    ents.forEach(function (e) { var c = CAD.clone(e); ed.doc.del(e.id); ed.doc.rec({ k: "add", e: c, at: w === "Back" ? 0 : undefined }); }); ed.doc.rebuild();
  });
  cmd("COPYCLIP", ["COPYC"], async function (ed) { var ents = E(ed, Array.from(ed.sel)); if (!ents.length) { ed.say("Select objects first."); return; } ed.clip = ents.map(CAD.clone); try { localStorage.setItem("ep_cad_clip", JSON.stringify({ ents: ed.clip, blocks: ed.doc.d.blocks })); } catch (e) {} ed.say(ents.length + " object(s) copied."); });
  cmd("CUTCLIP", [], async function (ed) { var ents = E(ed, Array.from(ed.sel)); if (!ents.length) return; ed.clip = ents.map(CAD.clone); try { localStorage.setItem("ep_cad_clip", JSON.stringify({ ents: ed.clip, blocks: ed.doc.d.blocks })); } catch (e) {} ents.forEach(function (e) { ed.doc.del(e.id); }); clearSel(ed); });
  cmd("PASTECLIP", ["PASTE"], async function (ed) {
    var clip = ed.clip, blocks = null; if (!clip) { try { var j = JSON.parse(localStorage.getItem("ep_cad_clip") || "null"); if (j) { clip = j.ents; blocks = j.blocks; } } catch (e) {} } if (!clip || !clip.length) throw new Error("Clipboard is empty");
    if (blocks) { var B = Object.assign({}, ed.doc.d.blocks), add = false; Object.keys(blocks).forEach(function (n) { if (!B[n]) { B[n] = blocks[n]; add = true; } }); if (add) ed.doc.set("blocks", B); }
    var bb = clip.reduce(function (b, e) { var x = G.bbox(e, ed.doc.d.blocks); if (isFinite(x[0])) { G.ext(b, [x[0], x[1]]); } return b; }, [Infinity, Infinity, -Infinity, -Infinity]), base = [bb[0], bb[1]];
    ed.preview = function (w) { var M = G.mTrans(w[0] - base[0], w[1] - base[1]); return clip.map(function (e) { return G.xform(e, M); }); };
    var p = await ed.getPoint("Specify insertion point"); ed.preview = null; var M = G.mTrans(p[0] - base[0], p[1] - base[1]); clip.forEach(function (e) { var n = G.xform(e, M); delete n.id; if (!ed.doc.d.layers[n.layer]) n.layer = "0"; ed.doc.add(n); });
  });

  /* ================= INQUIRY ================= */
  cmd("DIST", ["DI"], async function (ed) { var a = await ed.getPoint("Specify first point"), b = await ed.getPoint("Specify second point", { base: a }); var d = G.sub(b, a); ed.say("Distance = " + ed.fmt(G.len(d)) + ", Angle = " + UN.trimNum((G.ang(a, b) * R2D + 360) % 360, 2) + "°, ΔX = " + ed.fmt(d[0]) + ", ΔY = " + ed.fmt(d[1])); });
  cmd("AREA", ["AA"], async function (ed) {
    var p = await ed.getPoint("Specify first corner point", { kw: ["Object"] });
    if (p === "Object") { var pk = await ed.getEnt("Select objects", { filter: function (e) { return G.entArea(e) != null; } }); var A = G.entArea(pk.e), L = G.entLength(pk.e, ed.doc.d.blocks); ed.say("Area = " + ed.fmtA(A) + (L != null ? ", Perimeter = " + ed.fmt(L) : "")); return { area: A, len: L }; }
    var pts = [p];
    while (true) { ed.preview = function (w) { return [{ t: "pline", pts: pts.concat([w]).map(function (q) { return [q[0], q[1], 0]; }), closed: true, _pc: "#2ec27e" }]; }; var q = await ed.getPoint("Specify next point", { base: pts[pts.length - 1] , opt: true }); if (q == null) break; pts.push(q); }
    ed.preview = null; var P = pts.map(function (q) { return [q[0], q[1], 0]; }), Ar = Math.abs(G.plineArea(P)), Ln = G.segsLength(G.plineSegs(P, true)); ed.say("Area = " + ed.fmtA(Ar) + ", Perimeter = " + ed.fmt(Ln));
  });
  cmd("ID", [], async function (ed) { var p = await ed.getPoint("Specify point"); ed.say("X = " + ed.fmt(p[0]) + "   Y = " + ed.fmt(p[1])); });
  cmd("LIST", ["LI"], async function (ed) {
    var ents = await selBase(ed, "list");
    ents.slice(0, 50).forEach(function (e) { var L = G.entLength(e, ed.doc.d.blocks), A = G.entArea(e); ed.say(e.t.toUpperCase() + " on layer " + e.layer + (L != null ? " · length " + ed.fmt(L) : "") + (A != null ? " · area " + ed.fmtA(A) : "") + (e.t === "text" ? " · \"" + e.s + "\"" : "") + (e.t === "insert" ? " · block " + e.block : "")); });
  });

  /* ================= VIEW / SETTINGS ================= */
  cmd("ZOOM", ["Z"], async function (ed) {
    var k = await ed.getKw("Zoom", ["Extents", "Window", "Object", "In", "Out"], "Extents");
    if (k === "Extents") ed.zoomExtents(); else if (k === "In") ed.zoomAt(ed.W / 2, ed.H / 2, 2); else if (k === "Out") ed.zoomAt(ed.W / 2, ed.H / 2, 0.5);
    else if (k === "Object") { var ents = await selBase(ed, "zoom to"), b = [Infinity, Infinity, -Infinity, -Infinity]; ents.forEach(function (e) { var x = ed.doc.bbox(e); G.ext(b, [x[0], x[1]]); G.ext(b, [x[2], x[3]]); }); ed.zoomBox(b); clearSel(ed); }
    else { var a = await ed.getPoint("Specify first corner"); ed.preview = function (w) { return [{ t: "pline", pts: rectPts(a, w), closed: true, _pc: "#4aa3ff" }]; }; var b2 = await ed.getPoint("Specify opposite corner"); ed.preview = null; ed.zoomBox([Math.min(a[0], b2[0]), Math.min(a[1], b2[1]), Math.max(a[0], b2[0]), Math.max(a[1], b2[1])], 0.02); }
  });
  cmd("PAN", ["P"], async function (ed) { ed.panMode = true; try { await ed.getKw("Drag to pan — press Esc or Enter to exit", ["Exit"], "Exit"); } finally { ed.panMode = false; } });
  cmd("REGEN", ["RE"], async function (ed) { ed.doc.flush(); ed.dirty = true; });
  cmd("ISOLATE", ["ISO", "ISOLATEOBJECTS"], async function (ed) { var ents = await selBase(ed, "isolate"); ed.isolated = new Set(ents.map(function (e) { return e.id; })); clearSel(ed); ed.say(ents.length + " object(s) isolated. UNISOLATE shows everything."); });
  cmd("UNISOLATE", ["UNISO", "UNHIDE"], async function (ed) { ed.isolated = null; ed.dirty = true; });
  cmd("SELECTALL", ["ALL"], async function (ed) { ed.selectAll(); });
  cmd("UNDO", ["U"], async function (ed) { setTimeout(function () { ed.undo(); }, 0); });
  cmd("REDO", [], async function (ed) { setTimeout(function () { ed.redo(); }, 0); });
  ["OSNAP", "ORTHO", "GRID", "POLAR", "OTRACK"].forEach(function (n) { cmd(n, [], async function (ed) { ed.toggle({ OSNAP: "osnap", ORTHO: "ortho", GRID: "grid", POLAR: "polar", OTRACK: "otrack" }[n]); }); });
  cmd("SNAP", ["SN"], async function (ed) { ed.toggle("gsnap"); });
  cmd("LWEIGHT", ["LWT"], async function (ed) { ed.toggle("lwt"); });
  cmd("LAYER", ["LA"], async function (ed) { if (ed.onPanel) ed.onPanel("layers"); });
  cmd("PROPERTIES", ["PR", "CH"], async function (ed) { if (ed.onPanel) ed.onPanel("props"); });
  cmd("UNITS", ["UN"], async function (ed) { if (ed.onPanel) ed.onPanel("settings"); });
  cmd("DIMSTYLE", ["D", "DST"], async function (ed) { if (ed.onPanel) ed.onPanel("settings"); });
  cmd("LAYOFF", [], async function (ed) { var pk = await ed.getEnt("Select an object on the layer to turn off"); var L = CAD.clone(ed.doc.d.layers); L[pk.e.layer].on = false; ed.doc.set("layers", L); });
  cmd("LAYON", [], async function (ed) { var L = CAD.clone(ed.doc.d.layers); Object.keys(L).forEach(function (k) { L[k].on = true; L[k].frz = false; }); ed.doc.set("layers", L); });
  cmd("HELP", ["?"], async function (ed) { ed.say("Commands: " + Object.keys(C).sort().map(function (k) { var al = Object.keys(A).filter(function (a) { return A[a] === k; }); return k + (al.length ? " (" + al.join(", ") + ")" : ""); }).join(" · ")); });
  /* quantity take-off: length / area / count of picked objects or a picked outline → estimate */
  cmd("TAKEOFF", ["TO", "QTO"], async function (ed) {
    var m = await ed.getKw("Measure", ["Objects", "Points", "Inside"], "Objects"), res = { ids: [], len: 0, area: 0, count: 0, layers: {} };
    if (m === "Objects") { var ents = E(ed, await ed.getSel("Select objects to measure")); ents.forEach(function (e) { var L = G.entLength(e, ed.doc.d.blocks), A = G.entArea(e); res.ids.push(e.id); res.count++; res.layers[e.layer] = 1; if (L) res.len += (e.t === "hatch" ? 0 : L); if (A) res.area += A; }); clearSel(ed); }
    else if (m === "Inside") { while (true) { var p = await ed.getPoint("Pick inside each area (Enter to finish)", { opt: true }); if (p == null) break; var b = CAD.boundaryAt(ed.doc, p, ed.isolated); if (!b) { ed.say("No closed boundary there."); continue; } res.area += b.area; res.len += G.segsLength(G.plineSegs(b.outer, true)); res.count++; ed.doc.add({ t: "hatch", pat: "SOLID", op: 0.25, color: 4, loops: b.loops, layer: ed.doc.d.layers.HATCH ? "HATCH" : undefined, tag: "takeoff" }); ed.say("Area " + ed.fmtA(b.area) + " (total " + ed.fmtA(res.area) + ")"); } }
    else { var pts = [await ed.getPoint("Specify first point")]; while (true) { ed.preview = function (w) { return [{ t: "pline", pts: pts.concat([w]).map(function (q) { return [q[0], q[1], 0]; }), closed: false, _pc: "#2ec27e" }]; }; var q = await ed.getPoint("Specify next point (Enter to finish)", { base: pts[pts.length - 1] , opt: true }); if (q == null) break; pts.push(q); } ed.preview = null; var P = pts.map(function (x) { return [x[0], x[1], 0]; }); res.len = G.segsLength(G.plineSegs(P, false)); res.area = pts.length > 2 ? Math.abs(G.plineArea(P)) : 0; res.count = 1; res.pts = P; }
    ed.say("Take-off: length " + ed.fmt(res.len) + " · area " + ed.fmtA(res.area) + " · count " + res.count);
    if (ed.onTakeoff) ed.onTakeoff(res);
    return res;
  });

  CAD.commands = C; CAD.aliases = A; CAD.loopOf = loopOf;
})();
