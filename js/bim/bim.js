/* Estimate Pro BIM — building elements as CAD entities (so select / move / copy / rotate / undo / layers / properties all work),
   levels, wall joins (L-corners mitred, T-junctions butted), plan representation (cut walls with door / window gaps and symbols),
   and quantities (IS 1200 style deductions) per element.

   Units: millimetres. A level = { id, name, elev (finished level of the floor, mm), h (floor-to-floor height, mm) }.
   Element entities (t):
     wall    { a, b, th, h, base, lvl, mat: "brick"|"block"|"rcc"|"stone", ext: bool, just: "c"|"l"|"r", finI, finE }
     door / window / opening  { host: wall id, at (mm from wall start along the centre line), w, h, sill, preset, swing: "l"|"r", flip: bool, kind }
     slab    { pts (outline, ccw), holes: [[…]], th, lvl, off (top offset from level, mm), kind: "floor"|"roof"|"chajja"|"landing" }
     column  { p, w, d, rot, lvl, h (null = level height), shape: "rect"|"circle", base }
     beam    { a, b, w, d (depth), lvl, top (offset of top from next floor level / level top, mm) }
     footing { p, L, B, D, rot, lvl, df (depth of footing bottom below the level, mm), ped: {w, d}, pcc: {off, th}, ws (working space) }
     roof    { pts, kind: "flat"|"shed"|"gable"|"hip", slope (deg), th, lvl, off, mat: "rcc"|"gi"|"tile"|"puf", over (overhang, mm), dir (deg, for shed / gable ridge) }
     stair   { p, dir (deg), w, n (risers), R, T, wt (waist), lvl, kind: "straight"|"dogleg", land (landing length) }
     room    { pts, name, lvl, floor: "vitrified"|…, skirt (mm), ceil: bool }
     railing { pts, h, lvl } */
(function () {
  "use strict";
  var EP = window.EP = window.EP || {}, G = EP.geom, CAD = EP.cad;
  var B = EP.bim = EP.bim || {};
  var TYPES = { wall: 1, door: 1, window: 1, opening: 1, slab: 1, column: 1, beam: 1, footing: 1, roof: 1, stair: 1, room: 1, railing: 1 };
  B.TYPES = TYPES; B.is = function (e) { return !!(e && TYPES[e.t]); };
  B.ctx = { doc: null };   // the document being drawn / measured (set by the editor)

  /* ---------- levels ---------- */
  function defaultBim() {
    return { levels: [{ id: "L0", name: "Ground floor", elev: 0, h: 3200 }, { id: "L1", name: "First floor", elev: 3200, h: 3200 }, { id: "L2", name: "Roof", elev: 6400, h: 1000 }],
      cur: "L0", ngl: -450, slabTh: 125, wallTh: 230, wallMat: "brick", showAll: false,
      rules: { brickDed: 0.1, plasterSmall: 0.5, plasterLarge: 3, lintel: true, lintelD: 150, lintelBear: 150, ws: 300 },
      steel: { footing: 80, column: 180, beam: 160, slab: 90, stair: 100, lintel: 100 }, map: {} };
  }
  B.ensure = function (d) { if (!d.bim) d.bim = defaultBim(); var df = defaultBim(); Object.keys(df).forEach(function (k) { if (d.bim[k] == null) d.bim[k] = df[k]; }); return d.bim; };
  B.level = function (d, id) { var b = B.ensure(d); return b.levels.filter(function (l) { return l.id === id; })[0] || b.levels[0]; };
  B.levelAbove = function (d, id) { var b = B.ensure(d), L = b.levels.slice().sort(function (x, y) { return x.elev - y.elev; }), i = L.findIndex(function (l) { return l.id === id; }); return i >= 0 && i + 1 < L.length ? L[i + 1] : null; };
  /* zone for SOR items: anything standing on a level at or above the ground-floor finished level (0) is "above plinth" */
  B.below = function (d, lvlId) { var L = B.level(d, lvlId); return L && L.elev < -1 ? "plinth" : "super"; };

  /* ---------- walls: centre line, sides, joins ---------- */
  function wallLine(w) { var u = G.norm(G.sub(w.b, w.a)), n = G.perp(u), off = w.just === "l" ? -w.th / 2 : w.just === "r" ? w.th / 2 : 0; return { a: G.add(w.a, G.mul(n, off)), b: G.add(w.b, G.mul(n, off)), u: u, n: n, L: G.dist(w.a, w.b) }; }
  B.wallLine = wallLine;
  function lineX(p1, d1, p2, d2) { var den = G.cross(d1, d2); if (Math.abs(den) < 1e-9) return null; var t = G.cross(G.sub(p2, p1), d2) / den; return G.add(p1, G.mul(d1, t)); }
  function walls(doc, lvl) { return doc.d.ents.filter(function (e) { return e.t === "wall" && (lvl == null || e.lvl === lvl); }); }
  /* end points of a wall after joining with its neighbours: { sL, sR, eL, eR } (L = left of a→b) */
  function wallPoly(w, all) {
    var c = wallLine(w), t = w.th / 2, tol = Math.max(5, w.th * 0.6);
    var res = { sL: G.add(c.a, G.mul(c.n, t)), sR: G.sub(c.a, G.mul(c.n, t)), eL: G.add(c.b, G.mul(c.n, t)), eR: G.sub(c.b, G.mul(c.n, t)), joins: [] };
    [0, 1].forEach(function (end) {
      var P = end ? c.b : c.a, d = end ? G.mul(c.u, -1) : c.u, pd = G.perp(d), myL1 = G.add(P, G.mul(pd, t)), myL2 = G.sub(P, G.mul(pd, t)), corner = [], tee = null;
      all.forEach(function (o) {
        if (o === w || o.lvl !== w.lvl) return; var oc = wallLine(o), tolO = Math.max(tol, o.th * 0.6);
        if (G.dist(oc.a, P) < tolO) corner.push({ o: o, c: oc, d: oc.u, P: oc.a });
        else if (G.dist(oc.b, P) < tolO) corner.push({ o: o, c: oc, d: G.mul(oc.u, -1), P: oc.b });
        else { var cp = G.closest({ k: "L", a: oc.a, b: oc.b }, P); if (cp.d <= o.th / 2 + tol && cp.t > 0.001 && cp.t < 0.999 && Math.abs(G.dot(c.u, oc.u)) < 0.995) tee = { o: o, c: oc }; }
      });
      var X1 = null, X2 = null;
      if (corner.length === 1) {
        var k = corner[0], ot = k.o.th / 2, op = G.perp(k.d); if (Math.abs(G.cross(d, k.d)) > 1e-6) {
          X1 = lineX(myL1, d, G.sub(k.P, G.mul(op, ot)), k.d); X2 = lineX(myL2, d, G.add(k.P, G.mul(op, ot)), k.d);
          // reject absurd mitres (very sharp angles): fall back to a butt end
          if (X1 && X2 && (G.dist(X1, P) > 6 * Math.max(t, ot) || G.dist(X2, P) > 6 * Math.max(t, ot))) { X1 = X2 = null; }
          res.joins.push({ end: end, kind: "L", with: k.o.id });
        }
      } else if (!corner.length && tee) {
        var oc2 = tee.c, side = G.dot(G.sub(end ? c.a : c.b, oc2.a), oc2.n) >= 0 ? 1 : -1, face = G.add(oc2.a, G.mul(oc2.n, side * tee.o.th / 2));
        X1 = lineX(myL1, d, face, oc2.u); X2 = lineX(myL2, d, face, oc2.u); res.joins.push({ end: end, kind: "T", with: tee.o.id });
      }
      if (X1 && X2) { if (!end) { res.sL = X1; res.sR = X2; } else { res.eR = X1; res.eL = X2; } }
    });
    return res;
  }
  B.wallPoly = function (doc, w) { var cc = doc.c ? doc.c(w) : {}; if (!cc.wp) cc.wp = wallPoly(w, walls(doc, w.lvl)); return cc.wp; };
  /* openings in a wall: [{ e, s0, s1 (mm along the centre line), z0, z1 (above wall base) }] */
  /* wall left standing in the two top corners of an arched opening (mm²): rectangle − half ellipse over the rise */
/* safety grill of a window: bars measured from the centre of the opening (xs) and from its sill (zs), and its weight in 12 mm square bars with a 25 × 5 flat all round */
  B.grillOf = function (o) { var pat = o.grill || (o.kind === "grill" ? "v" : ""); if (!pat || pat === "none" || o.t !== "window") return null; var fw = 50, W = o.w - 2 * fw, Hh = o.h - 2 * fw, xs = [], zs = [], fill = function (arr, len, step, off) { var n = Math.max(1, Math.round(len / step)), st = len / n; for (var i = 1; i < n; i++) arr.push(off + i * st); }; if (W < 150 || Hh < 150) return null;
    if (pat === "v") { fill(xs, W, 110, -W / 2); zs.push(Hh / 2); } else if (pat === "h") { fill(zs, Hh, 120, 0); fill(xs, W, 600, -W / 2); } else if (pat === "sq") { fill(xs, W, 150, -W / 2); fill(zs, Hh, 150, 0); } else if (pat === "dia") { var sp = 212, diag = [], c; for (c = -W / 2 - Hh + sp / 2; c < W / 2; c += sp) { var xa = Math.max(-W / 2, c), xb = Math.min(W / 2, c + Hh); if (xb - xa > 20) diag.push([xa, xa - c, xb, xb - c]); } for (c = -W / 2 + sp / 2; c < W / 2 + Hh; c += sp) { var xc = Math.max(-W / 2, c - Hh), xd = Math.min(W / 2, c); if (xd - xc > 20) diag.push([xc, c - xc, xd, c - xd]); } var dl = diag.reduce(function (t, g) { return t + Math.hypot(g[2] - g[0], g[3] - g[1]); }, 0); return { pat: pat, xs: [], zs: [], diag: diag, W: W, H: Hh, fw: fw, kg: dl / 1000 * 1.13 + 2 * (W + Hh) / 1000 * 0.98 }; }
    else if (pat === "ring") {   /* upright bars with a band of rings between two rails at mid height */
      fill(xs, W, 140, -W / 2); var band = Math.min(160, Hh * 0.28), zl = Hh / 2 - band / 2, zu = Hh / 2 + band / 2, edges = [-W / 2].concat(xs).concat([W / 2]), dg = [], rl = 0; zs.push(zl, zu);
      for (var ri = 0; ri + 1 < edges.length; ri++) { var cxr = (edges[ri] + edges[ri + 1]) / 2, rr = Math.min(band, edges[ri + 1] - edges[ri]) / 2 - 2; if (rr < 15) continue; for (var a = 0; a < 12; a++) { var t0 = a * Math.PI / 6, t1 = (a + 1) * Math.PI / 6; dg.push([cxr + rr * Math.cos(t0), Hh / 2 + rr * Math.sin(t0), cxr + rr * Math.cos(t1), Hh / 2 + rr * Math.sin(t1)]); } rl += 2 * Math.PI * rr; }
      return { pat: pat, xs: xs, zs: zs, diag: dg, W: W, H: Hh, fw: fw, kg: (xs.length * Hh + 2 * W) / 1000 * 1.13 + rl / 1000 * 0.62 + 2 * (W + Hh) / 1000 * 0.98 }; }
    else { fill(xs, W, 300, -W / 2); fill(zs, Hh, 150, 0); }
    var len = xs.length * Hh + zs.length * W; return { pat: pat, xs: xs, zs: zs, W: W, H: Hh, fw: fw, kg: len / 1000 * 1.13 + 2 * (W + Hh) / 1000 * 0.98 }; };
  B.archSp = function (o) { if (!o || !o.head) return 0; var r = o.head === "arch" ? o.w / 2 : o.head === "seg" ? o.w * 0.2 : o.head === "point" ? o.w * 0.866 : o.head === "horse" ? o.w * 0.75 : 0; if (!r || r > o.h - 300) return 0;
    if (o.head === "horse") return 0.11815 * o.w * o.w + 0.134 * o.w * (o.h - r);   /* what stays solid inside the w × h cut: round the circle (3r² − 2.5274r²) and the two piers under it */
    return o.head === "point" ? 0.2518 * o.w * o.w : o.w * r * (1 - Math.PI / 4); };
  B.openings = function (doc, w) {
    return doc.d.ents.filter(function (o) { return (o.t === "door" || o.t === "window" || o.t === "opening") && o.host === w.id; }).map(function (o) {
      var z0 = o.t === "door" ? 0 : (o.sill != null ? o.sill : 900); return { e: o, s0: o.at - o.w / 2, s1: o.at + o.w / 2, z0: z0, z1: z0 + o.h };
    }).sort(function (a, b) { return a.s0 - b.s0; });
  };
  function hostOf(doc, o) { var w = doc.get ? doc.get(o.host) : null; return w && w.t === "wall" ? w : null; }
  B.hostOf = hostOf;
  /* where a hosted element sits: centre point, direction along the wall, normal */
  B.place = function (doc, o) { var w = hostOf(doc, o); if (!w) return null; var c = wallLine(w); return { p: G.add(c.a, G.mul(c.u, o.at)), u: c.u, n: c.n, w: w, c: c }; };

  /* ---------- plan representation ---------- */
  function rot(p, ang) { var cs = Math.cos(ang), sn = Math.sin(ang); return [p[0] * cs - p[1] * sn, p[0] * sn + p[1] * cs]; }
  function rectAt(p, w, d, angDeg) { var a = (angDeg || 0) * Math.PI / 180; return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(function (q) { var r = rot(q, a); return [p[0] + r[0], p[1] + r[1]]; }); }
  B.rectAt = rectAt;
  /* lines that draw an element in plan: { segs: [segment], fill: [polygon…] (solid tint), dash: bool } */
  B.plan = function (doc, e) {
    if (B.EXT && B.EXT[e.t]) return B.EXT[e.t].plan(doc, e);
    var out = { segs: [], fill: [], dashed: [] }, L = function (a, b, arr) { (arr || out.segs).push({ k: "L", a: a, b: b }); };
    if (e.t === "wall") {
      var P = B.wallPoly(doc, e), c = wallLine(e), ops = B.openings(doc, e);
      var proj = function (q) { return G.dot(G.sub(q, c.a), c.u); };
      // each side line, broken at the openings
      [[P.sL, P.eL], [P.sR, P.eR]].forEach(function (sd) {
        var s0 = proj(sd[0]), s1 = proj(sd[1]), at = function (s) { return G.lerp(sd[0], sd[1], (s - s0) / ((s1 - s0) || 1)); }, cur = s0;
        ops.forEach(function (o) { if (o.s1 <= cur || o.s0 >= s1) return; if (o.s0 > cur) L(at(cur), at(o.s0)); cur = Math.max(cur, o.s1); });
        if (cur < s1) L(at(cur), sd[1]);
      });
      L(P.sL, P.sR); L(P.eL, P.eR);
      ops.forEach(function (o) { var a = G.add(c.a, G.mul(c.u, o.s0)), b = G.add(c.a, G.mul(c.u, o.s1)), h = G.mul(c.n, e.th / 2); L(G.add(a, h), G.sub(a, h)); L(G.add(b, h), G.sub(b, h)); });
      out.fill.push({ pts: [P.sL, P.eL, P.eR, P.sR], holes: ops.map(function (o) { var a = G.add(c.a, G.mul(c.u, o.s0)), b = G.add(c.a, G.mul(c.u, o.s1)), h = G.mul(c.n, e.th / 2 + 1); return [G.add(a, h), G.add(b, h), G.sub(b, h), G.sub(a, h)]; }) });
      return out;
    }
    if (e.t === "door" || e.t === "window" || e.t === "opening") {
      var pl = B.place(doc, e); if (!pl) return out; var u = pl.u, n = pl.n, th = pl.w.th, a0 = G.sub(pl.p, G.mul(u, e.w / 2)), b0 = G.add(pl.p, G.mul(u, e.w / 2));
      if (B.archSp(e)) { var NA = 10, bul = th * 0.42, prevA = a0; for (var ia = 1; ia <= NA; ia++) { var ta = ia / NA, pa = G.add(G.add(a0, G.mul(u, e.w * ta)), G.mul(n, Math.sin(Math.PI * ta) * bul)); out.dashed.push({ k: "L", a: prevA, b: pa }); prevA = pa; } }   /* arched head: a dashed bow across the opening */
      if (e.t === "window") { [-0.5, -0.12, 0.12, 0.5].forEach(function (f) { L(G.add(a0, G.mul(n, th * f)), G.add(b0, G.mul(n, th * f))); }); if (e.sill != null && e.sill + e.h > (pl.w.h || 3000) - 1) {} return out; }
      if (e.t === "opening") { out.dashed.push({ k: "L", a: G.add(a0, G.mul(n, th / 2)), b: G.sub(b0, G.mul(n, th / 2)) }); out.dashed.push({ k: "L", a: G.sub(a0, G.mul(n, th / 2)), b: G.add(b0, G.mul(n, th / 2)) }); return out; }
      var side = e.flip ? -1 : 1, hinge = e.swing === "r" ? b0 : a0, other = e.swing === "r" ? a0 : b0, leafDir = G.mul(n, side), face = G.add(hinge, G.mul(n, side * th / 2)), leaves = e.kind === "double" ? 2 : 1;
      if (e.kind === "shutter") { L(G.add(a0, G.mul(n, th * 0.2)), G.add(b0, G.mul(n, th * 0.2))); out.dashed.push({ k: "L", a: G.add(a0, G.mul(n, th * 0.45)), b: G.add(b0, G.mul(n, th * 0.45)) }); return out; }
      if (e.kind === "sliding") { L(G.add(a0, G.mul(n, side * th * 0.25)), G.add(G.lerp(a0, b0, 0.55), G.mul(n, side * th * 0.25))); L(G.add(G.lerp(a0, b0, 0.45), G.mul(n, -side * th * 0.0)), G.add(b0, G.mul(n, -side * th * 0.0))); return out; }
      var lw = e.w / leaves;
      for (var i = 0; i < leaves; i++) {
        var hg = i === 0 ? hinge : other, fc = G.add(hg, G.mul(n, side * th / 2)), toward = G.norm(G.sub(i === 0 ? other : hinge, hg)), tip = G.add(fc, G.mul(leafDir, lw));
        L(fc, tip); var a1 = G.ang(fc, G.add(fc, G.mul(toward, lw))), a2 = G.ang(fc, tip), sw = G.an(a2 - a1) < Math.PI ? { s: a1, e: a2 } : { s: a2, e: a1 };
        out.segs.push({ k: "A", c: fc, r: lw, s: sw.s, e: sw.e });
      }
      return out;
    }
    if (e.t === "column") {
      if (e.shape === "circle") { out.segs.push({ k: "A", c: e.p, r: e.w / 2, s: 0, e: G.TAU, full: true }); out.fill.push({ circle: { c: e.p, r: e.w / 2 } }); return out; }
      var q = B.colPoly(e); out.segs = G.polySegs(q, true); out.fill.push({ pts: q, holes: [] }); return out;
    }
    if (e.t === "beam") { var bl = wallLine({ a: e.a, b: e.b, th: e.w }), h2 = G.mul(bl.n, e.w / 2); out.dashed = G.polySegs([G.add(e.a, h2), G.add(e.b, h2), G.sub(e.b, h2), G.sub(e.a, h2)], true); return out; }
    if (e.t === "footing") { var f = rectAt(e.p, e.L, e.B, e.rot); out.dashed = G.polySegs(f, true); if (e.pcc) out.dashed = out.dashed.concat(G.polySegs(rectAt(e.p, e.L + 2 * e.pcc.off, e.B + 2 * e.pcc.off, e.rot), true)); if (e.ped) out.segs = G.polySegs(rectAt(e.p, e.ped.w, e.ped.d, e.rot), true); return out; }
    if (e.t === "slab") { var sl = (e.pts || []).map(function (p) { return [p[0], p[1], 0]; }); out.dashed = G.plineSegs(sl, true); (e.holes || []).forEach(function (h) { out.dashed = out.dashed.concat(G.polySegs(h, true)); var hb = [Infinity, Infinity, -Infinity, -Infinity]; h.forEach(function (p) { G.ext(hb, p); }); L([hb[0], hb[1]], [hb[2], hb[3]], out.dashed); L([hb[0], hb[3]], [hb[2], hb[1]], out.dashed); }); return out; }
    if (e.t === "roof") {
      var rp = e.pts || []; out.dashed = G.polySegs(rp, true);
      var ho = e.kind === "hip" || e.kind === "gable" ? B.hipOrtho(e) : null;
      if (ho) ho.creases.forEach(function (c) { L(c[0], c[1]); });
      else if (e.kind === "gable" || e.kind === "hip") { var r = roofRidge(e); if (r) { L(r.a, r.b); if (e.kind === "hip") r.hips.forEach(function (h) { L(h[0], h[1]); }); } }
      if (e.kind === "shed") { var bb = polyBox(rp), ctr = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2], dr = [Math.cos((e.dir || 0) * Math.PI / 180), Math.sin((e.dir || 0) * Math.PI / 180)]; L(G.sub(ctr, G.mul(dr, 600)), G.add(ctr, G.mul(dr, 600))); L(G.add(ctr, G.mul(dr, 600)), G.add(G.add(ctr, G.mul(dr, 400)), G.mul(G.perp(dr), 150))); }
      return out;
    }
    if (e.t === "stair") { var S = stairGeom(e); S.plan.forEach(function (s) { L(s[0], s[1]); }); out.segs.push.apply(out.segs, []); return out; }
    if (e.t === "room") { out.dashed = G.polySegs(e.pts, true); return out; }
    if (e.t === "railing") { out.segs = B.railPlan ? B.railPlan(e) : G.polySegs(e.pts, false); return out; }
    return out;
  };
  function polyBox(P) { var b = [Infinity, Infinity, -Infinity, -Infinity]; P.forEach(function (p) { G.ext(b, p); }); return b; }
  B.polyBox = polyBox;
  /* gable / hip ridge for a (near) rectangular outline */
  function roofRidge(e) {
    var P = e.pts; if (!P || P.length < 4) return null;
    // frame of the outline = direction of its longest edge, folded to within ±45° of the drawing axes (0 for an axis-parallel outline)
    var th = 0, best = 0, Q = Math.PI / 2; for (var i = 0; i < P.length; i++) { var p = P[i], q = P[(i + 1) % P.length], l = G.dist(p, q); if (l > best + 1e-6) { best = l; th = Math.atan2(q[1] - p[1], q[0] - p[0]); } }
    th = ((th % Q) + Q) % Q; if (th > Q / 2) th -= Q; if (Math.abs(th) < 1e-4) th = 0;
    var c = Math.cos(th), s = Math.sin(th), toL = function (p) { return [p[0] * c + p[1] * s, -p[0] * s + p[1] * c]; }, toW = function (p) { return th ? [p[0] * c - p[1] * s, p[0] * s + p[1] * c] : p; };
    var bb = polyBox(th ? P.map(toL) : P), W = bb[2] - bb[0], H = bb[3] - bb[1], along = e.dir != null ? Math.abs(Math.cos(e.dir * Math.PI / 180 - th)) > 0.5 : W >= H, cy = (bb[1] + bb[3]) / 2, cx = (bb[0] + bb[2]) / 2, half = (along ? H : W) / 2, hip = e.kind === "hip" ? half : 0;
    var C = [[bb[0], bb[1]], [bb[2], bb[1]], [bb[2], bb[3]], [bb[0], bb[3]]].map(toW);   // corners of the frame: 00, 10, 11, 01
    var a = toW(along ? [bb[0] + hip, cy] : [cx, bb[1] + hip]), b = toW(along ? [bb[2] - hip, cy] : [cx, bb[3] - hip]);
    return { a: a, b: b, half: half, along: along, c: C, th: th, hips: along ? [[C[0], a], [C[3], a], [C[1], b], [C[2], b]] : [[C[0], a], [C[1], a], [C[3], b], [C[2], b]] };
  }
  B.roofRidge = roofRidge;
  /* stair: steps along dir from p; dog-leg turns back after a landing */
  function stairGeom(e) {
    var dir = (e.dir || 0) * Math.PI / 180, u = [Math.cos(dir), Math.sin(dir)], n = G.mul(G.perp(u), +e.side === -1 ? -1 : 1), w = e.w, T = e.T, R = e.R, N = e.n, steps = [], plan = [];
    var flights = e.kind === "dogleg" || e.kind === "lshape" ? [Math.ceil(N / 2), Math.floor(N / 2)] : [N], land = e.land || w, z = 0, origin = e.p;
    if (e.kind === "dogleg" && String(e.winder) === "3" && N >= 11) {   /* the half turn is made on six winders round the two inner corners instead of a landing */
      var gpD = e.gap || 100, naD = Math.ceil((N - 6) / 2), nbD = N - 6 - naD, LD = naD * T, WDd = 2 * w + gpD, ad = function (a, b) { return G.add(G.add(origin, G.mul(u, a)), G.mul(n, b)); }, r1 = [], r2 = [], kd, tnD = Math.tan(Math.PI / 6) * w, deepD = R + (e.wt || 150) + 100;
      for (kd = 0; kd < naD; kd++) { var sD = { a: ad(kd * T, 0), u: u, n: n, w: w, T: T, z0: z, z1: z + R }; steps.push(sD); r1.push(sD); z += R; plan.push([ad(kd * T, 0), ad(kd * T, w)]); }
      var I1 = ad(LD, w), I2 = ad(LD, w + gpD), zWd = z, far0 = LD + w, WP = [[I1, ad(LD, 0), ad(LD + tnD, 0)], [I1, ad(LD + tnD, 0), ad(far0, 0), ad(far0, w - tnD)], [I1, ad(far0, w - tnD), ad(far0, w + gpD), I2], [I2, ad(far0, w + gpD), ad(far0, w + gpD + tnD)], [I2, ad(far0, w + gpD + tnD), ad(far0, WDd), ad(LD + tnD, WDd)], [I2, ad(LD + tnD, WDd), ad(LD, WDd)]];
      WP.forEach(function (P) { var cx = 0, cy = 0; P.forEach(function (q) { cx += q[0]; cy += q[1]; }); steps.push({ poly: P, c: [cx / P.length, cy / P.length], a: P[1], u: u, n: n, w: w, T: T, z0: z, z1: z + R, thin: deepD, wind: true }); z += R; plan.push([P[0], P[1]]); });
      plan.push([I2, ad(LD, WDd)]);
      for (kd = 0; kd < nbD; kd++) { var sE = { a: ad(LD - kd * T, w + gpD), u: G.mul(u, -1), n: n, w: w, T: T, z0: z, z1: z + R, last: kd === nbD - 1 }; steps.push(sE); r2.push(sE); z += R; if (kd) plan.push([ad(LD - kd * T, w + gpD), ad(LD - kd * T, WDd)]); }
      var endU = LD - nbD * T; plan.push([ad(0, 0), ad(far0, 0)], [ad(far0, 0), ad(far0, WDd)], [ad(far0, WDd), ad(endU, WDd)], [ad(endU, WDd), ad(endU, w + gpD)], [ad(endU, w + gpD), I2], [I1, ad(0, w)], [ad(0, w / 2), ad(LD + w / 2, w / 2)], [ad(LD + w / 2, w / 2), ad(LD + w / 2, w + gpD + w / 2)], [ad(LD + w / 2, w + gpD + w / 2), ad(endU + T, w + gpD + w / 2)]);
      return { steps: steps, plan: plan, flights: [naD, nbD], runs: [r1, r2], lenD: far0, windRail: [[ad(LD, 50), zWd, ad(far0 - 50, 50), zWd + 1.5 * R], [ad(far0 - 50, 50), zWd + 1.5 * R, ad(far0 - 50, WDd - 50), zWd + 4.5 * R], [ad(far0 - 50, WDd - 50), zWd + 4.5 * R, ad(LD, WDd - 50), zWd + 6 * R]], landEdges: null };
    }
    if (e.kind === "lshape" && String(e.winder) === "3" && N >= 7) {   /* the turn is made on three winders round the inner corner instead of a landing */
      var na = Math.ceil((N - 3) / 2), nb = N - 3 - na, Lw = na * T, aw = function (a, b) { return G.add(G.add(origin, G.mul(u, a)), G.mul(n, b)); }, f1s = [], f2s = [], kw, tn = Math.tan(Math.PI / 6) * w, deep = R + (e.wt || 150) + 100;
      for (kw = 0; kw < na; kw++) { var sA = { a: aw(kw * T, 0), u: u, n: n, w: w, T: T, z0: z, z1: z + R }; steps.push(sA); f1s.push(sA); z += R; plan.push([aw(kw * T, 0), aw(kw * T, w)]); }
      var I = aw(Lw, w), zW = z, wp = [[I, aw(Lw, 0), aw(Lw + tn, 0)], [I, aw(Lw + tn, 0), aw(Lw + w, 0), aw(Lw + w, w - tn)], [I, aw(Lw + w, w - tn), aw(Lw + w, w)]];
      wp.forEach(function (P) { var cx = 0, cy = 0; P.forEach(function (q) { cx += q[0]; cy += q[1]; }); steps.push({ poly: P, c: [cx / P.length, cy / P.length], a: P[1], u: u, n: n, w: w, T: T, z0: z, z1: z + R, thin: deep, wind: true }); z += R; plan.push([I, P[1]]); });
      plan.push([I, aw(Lw + w, w)]);
      for (kw = 0; kw < nb; kw++) { var sB = { a: aw(Lw, w + kw * T), u: n, n: u, w: w, T: T, z0: z, z1: z + R, last: kw === nb - 1 }; steps.push(sB); f2s.push(sB); z += R; if (kw) plan.push([aw(Lw, w + kw * T), aw(Lw + w, w + kw * T)]); }
      var WDw = w + nb * T; plan.push([aw(0, 0), aw(Lw + w, 0)], [aw(Lw + w, 0), aw(Lw + w, WDw)], [aw(Lw + w, WDw), aw(Lw, WDw)], [aw(Lw, WDw), aw(Lw, w)], [aw(Lw, w), aw(0, w)], [aw(0, w / 2), aw(Lw + w / 2, w / 2)], [aw(Lw + w / 2, w / 2), aw(Lw + w / 2, WDw - T)]);
      return { steps: steps, plan: plan, flights: [na, nb], L: true, L0: Lw, wdL: WDw, runs: [f1s, f2s], windRail: [[aw(Lw, 50), zW, aw(Lw + w - 50, 50), zW + 1.5 * R], [aw(Lw + w - 50, 50), zW + 1.5 * R, aw(Lw + w - 50, w), zW + 3 * R]] };
    }
    if (e.kind === "lshape") {   /* first flight along the going, a square quarter landing, second flight turned to the side */
      var L0 = (flights[0] - 1) * T, c0 = G.add(origin, G.mul(u, L0)), z0L = function () { return flights[0] * R; };
      for (var i0 = 0; i0 < flights[0]; i0++) { var last0 = i0 === flights[0] - 1; steps.push({ a: G.add(origin, G.mul(u, i0 * T)), u: u, n: n, w: w, T: last0 ? w : T, z0: z, z1: z + R, last: last0, lw: last0 ? w : 0 }); z += R; if (!last0 || true) plan.push([G.add(origin, G.mul(u, i0 * T)), G.add(G.add(origin, G.mul(u, i0 * T)), G.mul(n, w))]); }
      var o1 = G.add(c0, G.mul(n, w));
      for (var i1 = 0; i1 < flights[1]; i1++) { var a1 = G.add(o1, G.mul(n, i1 * T)); steps.push({ a: a1, u: n, n: u, w: w, T: T, z0: z, z1: z + R, last: i1 === flights[1] - 1 }); z += R; plan.push([a1, G.add(a1, G.mul(u, w))]); }
      var e1 = G.add(o1, G.mul(n, flights[1] * T)), far = G.add(origin, G.mul(u, L0 + w));
      plan.push([origin, far], [far, G.add(far, G.mul(n, w))], [G.add(origin, G.mul(n, w)), G.add(c0, G.mul(n, w))], [o1, e1], [G.add(far, G.mul(n, w)), G.add(e1, G.mul(u, w))], [e1, G.add(e1, G.mul(u, w))]);
      plan.push([G.add(origin, G.mul(n, w / 2)), G.add(G.add(c0, G.mul(u, w / 2)), G.mul(n, w / 2))], [G.add(G.add(c0, G.mul(u, w / 2)), G.mul(n, w / 2)), G.add(G.add(e1, G.mul(u, w / 2)), G.mul(n, -T))]);
      return { steps: steps, plan: plan, flights: flights, L: true, L0: L0, wdL: w + flights[1] * T, landEdges: [[c0, far, z0L()], [far, G.add(far, G.mul(n, w)), z0L()]] };
    }
    if (e.kind === "ushape") {   /* three flights round a well with two square quarter landings */
      var n2 = Math.max(2, Math.round(N / 3)), rest = Math.max(3, N - n2), n1 = Math.floor(rest / 2) + 1, n3 = Math.max(1, rest - n1), U0 = (n1 - 1) * T, d0 = G.add(origin, G.mul(u, U0)), zl1, zl2, at = function (a, b) { return G.add(G.add(origin, G.mul(u, a)), G.mul(n, b)); }, k;
      for (k = 0; k < n1; k++) { var lu = k === n1 - 1; steps.push({ a: at(k * T, 0), u: u, n: n, w: w, T: lu ? w : T, z0: z, z1: z + R, last: lu, lw: lu ? w : 0 }); z += R; plan.push([at(k * T, 0), at(k * T, w)]); } zl1 = z;
      for (k = 0; k < n2; k++) { var lu2 = k === n2 - 1; steps.push({ a: at(U0, w + k * T), u: n, n: u, w: w, T: lu2 ? w : T, z0: z, z1: z + R, last: lu2, lw: lu2 ? w : 0 }); z += R; plan.push([at(U0, w + k * T), at(U0 + w, w + k * T)]); } zl2 = z;
      var W2 = w + (n2 - 1) * T, WD = W2 + w, ua = U0 - n3 * T;
      for (k = 0; k < n3; k++) { steps.push({ a: at(U0 - k * T, W2), u: G.mul(u, -1), n: n, w: w, T: T, z0: z, z1: z + R, last: k === n3 - 1 }); z += R; plan.push([at(U0 - k * T, W2), at(U0 - k * T, WD)]); }
      plan.push([at(0, 0), at(U0 + w, 0)], [at(U0 + w, 0), at(U0 + w, WD)], [at(U0 + w, WD), at(ua, WD)], [at(ua, WD), at(ua, W2)], [at(ua, W2), at(U0, W2)], [at(U0, W2), at(U0, w)], [at(U0, w), at(0, w)], [at(0, w), at(0, 0)], [at(0, w / 2), at(U0 + w / 2, w / 2)], [at(U0 + w / 2, w / 2), at(U0 + w / 2, W2 + w / 2)], [at(U0 + w / 2, W2 + w / 2), at(ua + T, W2 + w / 2)]);
      return { steps: steps, plan: plan, flights: [n1, n2, n3], U: true, U0: U0, W2: W2, ua: ua, landEdges: [[at(U0, 0), at(U0 + w, 0), zl1], [at(U0 + w, 0), at(U0 + w, w), zl1], [at(U0 + w, W2), at(U0 + w, WD), zl2], [at(U0 + w, WD), at(U0, WD), zl2]] };
    }
    if (e.kind === "spiral") {   /* treads round a centre post; e.p is the corner of the square it stands in */
      var Ro = w + 75, ri = 75, cS = G.add(G.add(origin, G.mul(u, Ro)), G.mul(n, Ro)), sa = Math.max(15, Math.min(45, +e.sa || 30)) * Math.PI / 180, rot = (u[0] * n[1] - u[1] * n[0]) >= 0 ? 1 : -1, th0 = Math.atan2(-n[1], -n[0]), pt = function (r, th) { return [cS[0] + r * Math.cos(th), cS[1] + r * Math.sin(th)]; };
      var topA = Math.max(sa, Math.PI / 3);   /* the last tread is the platform at floor level: at least 60° wide */
      for (var si = 0; si < N; si++) { var lastS = si === N - 1, t0 = th0 + rot * si * sa, t1 = t0 + rot * (lastS ? topA : sa), tm = (t0 + t1) / 2, poly = [pt(ri, t0), pt(Ro, t0), pt(Ro, t0 + (t1 - t0) / 4), pt(Ro, tm), pt(Ro, t0 + (t1 - t0) * 3 / 4), pt(Ro, t1), pt(ri, t1)];
        steps.push({ poly: poly, c: pt(Ro * 0.6, tm), a: pt(Ro - 50, t0), b: pt(Ro - 50, t1), u: [-Math.sin(tm) * rot, Math.cos(tm) * rot], n: [Math.cos(tm), Math.sin(tm)], w: w, T: Ro * 0.67 * sa, z0: z, z1: z + R, last: lastS, thin: 60, flat: lastS }); z += R; plan.push([pt(ri, t0), pt(Ro, t0)]); }
      var thE = th0 + rot * ((N - 1) * sa + topA); plan.push([pt(ri, thE), pt(Ro, thE)]);
      var ring = []; for (var ci = 0; ci <= 24; ci++) ring.push(pt(Ro, ci * Math.PI / 12)); for (ci = 0; ci < 24; ci++) plan.push([ring[ci], ring[ci + 1]]); for (ci = 0; ci < 8; ci++) plan.push([pt(ri, ci * Math.PI / 4), pt(ri, (ci + 1) * Math.PI / 4)]);
      var postP = []; for (ci = 0; ci < 12; ci++) postP.push(pt(ri, ci * Math.PI / 6));
      return { steps: steps, plan: plan, flights: [N], S: true, c: cS, Ro: Ro, thEnd: thE, rot: rot, topA: topA, post: { pts: postP, h: N * R + 1000 } };
    }
    flights.forEach(function (cnt, fi) {
      var treads = cnt - 1, o = fi === 0 ? origin : G.add(G.add(origin, G.mul(u, (flights[0] - 1) * T)), G.mul(n, w + (e.gap || 100))), dirU = fi === 0 ? u : G.mul(u, -1);
      if (fi === 1) o = G.add(G.add(origin, G.mul(u, (flights[0] - 1) * T)), G.mul(n, w + (e.gap || 100)));
      for (var i = 0; i < cnt; i++) { var a = G.add(o, G.mul(dirU, i * T)); steps.push({ a: a, u: dirU, n: n, w: w, T: i < treads ? T : (fi === 0 && flights.length > 1 ? land : T), z0: z, z1: z + R, last: i === cnt - 1, lw: i === cnt - 1 && fi === 0 && flights.length > 1 ? 2 * w + (e.gap || 100) : 0 }); z += R; }
      for (var j = 0; j <= treads; j++) { var q = G.add(o, G.mul(dirU, j * T)); plan.push([q, G.add(q, G.mul(n, w))]); }
      plan.push([o, G.add(o, G.mul(dirU, treads * T))], [G.add(o, G.mul(n, w)), G.add(G.add(o, G.mul(n, w)), G.mul(dirU, treads * T))]);
    });
    if (flights.length > 1) { var lo = G.add(origin, G.mul(u, (flights[0] - 1) * T)), lw2 = 2 * w + (e.gap || 100); plan.push([G.add(lo, G.mul(u, land)), G.add(G.add(lo, G.mul(u, land)), G.mul(n, lw2))], [lo, G.add(lo, G.mul(u, land))], [G.add(lo, G.mul(n, lw2)), G.add(G.add(lo, G.mul(n, lw2)), G.mul(u, land))]); }
    // walking line arrow
    plan.push([G.add(origin, G.mul(n, w / 2)), G.add(G.add(origin, G.mul(n, w / 2)), G.mul(u, Math.max(T, (flights[0] - 1) * T)))]);
    var LE = null; if (flights.length > 1) { var lo2 = G.add(origin, G.mul(u, (flights[0] - 1) * T)), lwd = 2 * w + (e.gap || 100), zl = flights[0] * R, f1 = G.add(lo2, G.mul(u, land)); LE = [[lo2, f1, zl], [f1, G.add(f1, G.mul(n, lwd)), zl], [G.add(f1, G.mul(n, lwd)), G.add(lo2, G.mul(n, lwd)), zl]]; }
    return { steps: steps, plan: plan, flights: flights, landEdges: LE };
  }
  B.stairGeom = stairGeom;
  /* railing lines of a stair: for each flight and each railed edge, the start and end on plan with the tread heights there; `gapBar` joins the two flights across the well at the landing */
  B.stairRails = function (e) { var mode = e.rail == null ? "" : e.rail; if (!mode || mode === "none") return []; var S = stairGeom(e), out = [], k0 = 0, multi = S.flights.length > 1;
    if (S.S) { S.steps.forEach(function (st) { if (st.flat) return; out.push({ p0: st.a, z0: st.z1, p1: st.b, z1: st.z1 + e.R, u: st.u, n: 1, len: Math.hypot(G.dist(st.a, st.b), e.R) }); }); return out; }   /* the platform at the top is railed with the opening */   /* a spiral is railed on its outer edge */
    S.flights.forEach(function (cnt, fi) { var st = S.runs ? S.runs[fi] : S.steps.slice(k0, k0 + cnt); k0 += cnt; if (!st.length) return; var a = st[0], b = st[st.length - 1], offs = [];
      /* the first flight has the well on its far edge, the later flights on their near edge */
      var inner = fi === 0 ? e.w - 50 : 50, outer = fi === 0 ? 50 : e.w - 50; if (!multi) { inner = e.w - 50; outer = 50; }
      if (mode === "in" || mode === "both") offs.push(inner); if (mode === "out" || mode === "both") offs.push(outer);
      var toLand = !!b.lw;   /* the last step of this flight is a landing: the rail stops where the landing begins */
      offs.forEach(function (o) { var p0 = G.add(a.a, G.mul(a.n, o)), p1 = toLand ? G.add(b.a, G.mul(b.n, o)) : G.add(G.add(b.a, G.mul(b.u, e.T)), G.mul(b.n, o)), zE = toLand ? b.z1 : b.z1 + e.R; out.push({ p0: p0, z0: a.z1, p1: p1, z1: zE, u: a.u, n: toLand ? st.length - 1 : st.length, len: Math.hypot(G.dist(p0, p1), zE - a.z1) }); }); });
    if (multi && !S.L && !S.U && !S.runs && (mode === "in" || mode === "both")) { var f0 = S.flights[0], Lb = S.steps[f0 - 1], F1 = S.steps[f0]; if (Lb && F1) { var qa = G.add(Lb.a, G.mul(Lb.n, e.w - 50)), qb = G.add(F1.a, G.mul(F1.n, 50)); out.push({ p0: qa, z0: Lb.z1, p1: qb, z1: Lb.z1, u: Lb.n, n: 1, flat: true, len: G.dist(qa, qb) }); } }   /* across the well at the landing */
    if ((mode === "out" || mode === "both") && S.windRail) S.windRail.forEach(function (g) { out.push({ p0: g[0], z0: g[1], p1: g[2], z1: g[3], u: G.norm(G.sub(g[2], g[0])), n: 1, wind: true, len: Math.hypot(G.dist(g[0], g[2]), g[3] - g[1]) }); });   /* round the outside of the winders */
    if ((mode === "out" || mode === "both") && S.landEdges) S.landEdges.forEach(function (g) { var d = G.dist(g[0], g[1]); if (d > 100) out.push({ p0: g[0], z0: g[2], p1: g[1], z1: g[2], u: G.norm(G.sub(g[1], g[0])), n: 1, flat: true, land: true, len: d }); });   /* outer edges of the landings */
    return out; };
  /* a spiral that goes round more than once: clear height from a tread to the tread one turn above (null = less than a full turn) */
  B.spiralTurn = function (e) { if (e.kind !== "spiral") return null; var sa = Math.max(15, Math.min(45, +e.sa || 30)); if (e.n * sa <= 360 + sa) return null; return Math.floor(360 / sa) * e.R - 60; };
  /* least clear height over the treads under the solid part of the slab above (null = open above everywhere) */
  B.stairHead = function (doc, e) { var Lv = B.level(doc.d, e.lvl), base = Lv ? Lv.elev : 0, top = base + e.n * e.R, S = stairGeom(e), min = null, low = 0;
    var slabs = doc.d.ents.filter(function (s) { if (s.t !== "slab" || !s.pts) return false; var Ls = B.level(doc.d, s.lvl), zt = (Ls ? Ls.elev : 0) + (s.off || 0); return Math.abs(zt - top) <= 60; });
    S.steps.forEach(function (st) { var c = st.c || G.add(G.add(st.a, G.mul(st.u, e.T / 2)), G.mul(st.n, e.w / 2)); slabs.forEach(function (s) { if (!G.inPoly(c, s.pts) || (s.holes || []).some(function (h) { return G.inPoly(c, h); })) return; var hd = top - (s.th || 125) - (base + st.z1); if (min == null || hd < min) min = hd; if (hd < 2100) low++; }); });
    return { min: min, low: low }; };
  /* the rectangle a stair covers on plan: start corner, along the going, across the flights */
  B.stairOutline = function (e) { var S = stairGeom(e), dir = (e.dir || 0) * Math.PI / 180, u = [Math.cos(dir), Math.sin(dir)], n = G.mul(G.perp(u), +e.side === -1 ? -1 : 1), p = e.p, at = function (a, b) { return G.add(G.add(p, G.mul(u, a)), G.mul(n, b)); }, len, wd, hole = null, ek = null, inP = null, w = e.w;
    if (S.S) { len = wd = 2 * S.Ro; hole = []; ek = []; for (var i = 0; i < 24; i++) { var th = S.thEnd - S.rot * i * Math.PI / 12; hole.push([S.c[0] + (S.Ro + 40) * Math.cos(th), S.c[1] + (S.Ro + 40) * Math.sin(th)]); ek.push(i < 4 ? null : true); } inP = [S.c[0] + S.Ro * 0.5, S.c[1]]; }   /* the first 60° back from the last tread are left open: there you step off */
    else if (S.U) { len = S.U0 + w; wd = S.W2 + w; var ua = Math.max(0, S.ua); hole = [at(0, 0), at(len, 0), at(len, wd), at(ua, wd), at(ua, S.W2), at(0, S.W2)]; ek = ["near", "front", "far", null, true, "back"]; inP = at(len - w / 2, w / 2); }
    else if (S.L) { len = S.L0 + w; wd = S.wdL; var L0 = S.L0; hole = [at(0, 0), at(len, 0), at(len, wd), at(L0, wd), at(L0, w), at(0, w)]; ek = ["near", "front", null, true, true, "back"]; inP = at(len - w / 2, w / 2); }
    else { var dog = S.flights.length > 1; len = S.lenD || (dog ? (S.flights[0] - 1) * e.T + (e.land || w) : e.n * e.T); wd = dog ? 2 * w + (e.gap || 100) : w; }
    return { len: len, wd: wd, u: u, n: n, L: !!S.L, pts: [p, at(len, 0), at(len, wd), at(0, wd)], hole: hole, ek: ek, inP: inP || at(len / 2, wd / 2) }; };
  /* clear distances from the stair to the walls of its level: [behind the first step, beyond the far end, on the start side, on the other side] (null = no wall met within 20 m), and the walls it runs into */
  B.stairClear = function (doc, e) { var O = B.stairOutline(e), W = doc.d.ents.filter(function (w) { return w.t === "wall" && w.lvl === e.lvl; }).map(function (w) { return B.wallPoly(doc, w); }).filter(Boolean).map(function (P) { return [P.sL, P.eL, P.eR, P.sR]; });
    var ray = function (o, d) { var best = null; W.forEach(function (Q) { for (var i = 0; i < 4; i++) { var a = Q[i], b = Q[(i + 1) % 4], ex = b[0] - a[0], ey = b[1] - a[1], den = d[0] * ey - d[1] * ex; if (Math.abs(den) < 1e-9) continue; var t = ((a[0] - o[0]) * ey - (a[1] - o[1]) * ex) / den, k = ((a[0] - o[0]) * d[1] - (a[1] - o[1]) * d[0]) / den; if (t >= -1 && k >= 0 && k <= 1 && (best == null || t < best)) best = t; } }); return best != null && best < 20000 ? Math.max(0, best) : null; };
    var mid = function (i, j) { return G.mid(O.pts[i], O.pts[j]); }, neg = function (v) { return [-v[0], -v[1]]; }, hit = 0, c = G.mid(O.pts[0], O.pts[2]);
    W.forEach(function (Q) { var inQ = function (q) { return G.inPoly(q, Q); }, sh = O.pts.map(function (q) { return [q[0] + (c[0] - q[0]) * 0.04, q[1] + (c[1] - q[1]) * 0.04]; }); var X = function (p1, p2, p3, p4) { var d1 = (p4[0] - p3[0]) * (p1[1] - p3[1]) - (p4[1] - p3[1]) * (p1[0] - p3[0]), d2 = (p4[0] - p3[0]) * (p2[1] - p3[1]) - (p4[1] - p3[1]) * (p2[0] - p3[0]), d3 = (p2[0] - p1[0]) * (p3[1] - p1[1]) - (p2[1] - p1[1]) * (p3[0] - p1[0]), d4 = (p2[0] - p1[0]) * (p4[1] - p1[1]) - (p2[1] - p1[1]) * (p4[0] - p1[0]); return d1 * d2 < 0 && d3 * d4 < 0; }, cross = false; for (var i = 0; i < 4 && !cross; i++) for (var j = 0; j < 4; j++) if (X(sh[i], sh[(i + 1) % 4], Q[j], Q[(j + 1) % 4])) { cross = true; break; } if (cross || sh.some(inQ) || inQ(c) || Q.some(function (q) { return G.inPoly(q, sh); })) hit++; });
    return { back: ray(mid(0, 3), neg(O.u)), front: ray(mid(1, 2), O.u), near: ray(mid(0, 1), neg(O.n)), far: ray(mid(2, 3), O.n), hit: hit, out: O }; };

  /* room / area detection: walls as solid footprints (door gaps closed), columns; other building elements ignored */
  /* column cross-sections. w × d is the overall size; tw = thickness of the legs of L / T / + sections; octagon and hexagon are measured across the flats (w). */
  B.COL_SHAPES = [["rect", "Rectangular"], ["circle", "Circular"], ["octagon", "Octagonal"], ["hexagon", "Hexagonal"], ["L", "L shape"], ["T", "T shape"], ["plus", "Plus (+) shape"]];
  B.colLegs = function (e) { return e.shape === "L" || e.shape === "T" || e.shape === "plus"; };
  B.colRound = function (e) { return e.shape === "circle" || e.shape === "octagon" || e.shape === "hexagon"; };
  B.colPoly = function (e) {
    var w = e.w, d = e.d || e.w, t = Math.max(50, Math.min(e.tw || 230, w, d)), a = w / 2, b = d / 2, h = t / 2, P;
    switch (e.shape) {
      case "circle": P = []; for (var i = 0; i < 24; i++) P.push([a * Math.cos(i / 24 * G.TAU), a * Math.sin(i / 24 * G.TAU)]); break;
      case "octagon": case "hexagon": var n = e.shape === "octagon" ? 8 : 6, R = a / Math.cos(Math.PI / n); P = []; for (var k = 0; k < n; k++) P.push([R * Math.cos(Math.PI / n + k / n * G.TAU), R * Math.sin(Math.PI / n + k / n * G.TAU)]); break;
      case "L": P = [[-a, -b], [a, -b], [a, -b + t], [-a + t, -b + t], [-a + t, b], [-a, b]]; break;
      case "T": P = [[-h, -b], [h, -b], [h, b - t], [a, b - t], [a, b], [-a, b], [-a, b - t], [-h, b - t]]; break;
      case "plus": P = [[-h, -b], [h, -b], [h, -h], [a, -h], [a, h], [h, h], [h, b], [-h, b], [-h, h], [-a, h], [-a, -h], [-h, -h]]; break;
      default: return rectAt(e.p, w, d, e.rot);
    }
    var r = (e.rot || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return P.map(function (q) { return [e.p[0] + q[0] * c - q[1] * s, e.p[1] + q[0] * s + q[1] * c]; });
  };
  B.colSection = function (e) {
    var W0 = Math.round(e.w), D0 = Math.round(e.d || e.w); if (e.shape === "circle") return { A: Math.PI * e.w * e.w / 4, P: Math.PI * e.w, label: "Ø" + W0 };
    var P = B.colPoly(e), per = 0; P.forEach(function (p, i) { per += G.dist(p, P[(i + 1) % P.length]); });
    var nm = { octagon: "octagonal " + W0 + " across flats", hexagon: "hexagonal " + W0 + " across flats", L: "L " + W0 + "×" + D0 + ", " + Math.round(Math.min(e.tw || 230, e.w, e.d || e.w)) + " thick", T: "T " + W0 + "×" + D0 + ", " + Math.round(Math.min(e.tw || 230, e.w, e.d || e.w)) + " thick", plus: "+ " + W0 + "×" + D0 + ", " + Math.round(Math.min(e.tw || 230, e.w, e.d || e.w)) + " thick" }[e.shape];
    return { A: Math.abs(G.plineArea(P)), P: per, label: nm || W0 + "×" + D0 };
  };
  B.roomOpts = function (doc) {
    return { only: function (e) { return !TYPES[e.t] || e.t === "wall" || e.t === "column"; },
      segs: function (e) { if (e.t === "wall") { var P = B.wallPoly(doc, e); return G.polySegs([P.sL, P.eL, P.eR, P.sR], true); } if (e.t === "column") return e.shape === "circle" ? [{ k: "A", c: e.p, r: e.w / 2, s: 0, e: G.TAU, full: true }] : G.polySegs(B.colPoly(e), true); return null; } };
  };
  /* Hip roof over an L / T / U … outline (every side parallel or square to the roof's frame, more than four corners).
     With the same slope on every side, the roof height at a point is slope × its distance to the nearest side, measured square to the frame —
     so every eave stays level and valleys form at the inside corners. The outline is cut into small cells; a cell lying on one roof plane is kept whole,
     a cell crossed by one hip / valley / ridge line is cut exactly along it. Returns { polys: [[[x, y, run], …]], creases: [[p, q, run1, run2]], top } (run = horizontal distance
     from the eave, height = run × tan(slope)), or null when the outline is not of this kind. Cached per element. */
  var hipCache = new WeakMap();
  B.hipOrtho = function (e) {
    if (hipCache.has(e)) return hipCache.get(e); var res = hipOrthoCalc(e); if (!res && e.kind === "hip") res = hipConvex(e); hipCache.set(e, res); return res;
  };
  /* Hip roof on a convex outline with slanting sides (trapezium, parallelogram, triangle, pentagon…): one plane per side.
     On a convex outline the roof is the lower envelope of the side planes, so the plane of side i covers the part of the
     outline that is nearer to side i than to any other side — found by clipping the outline with the bisector of each pair.
     Rectangles are left to the ordinary ridge roof; outlines with inside corners and slanting sides are not handled (null). */
  function hipConvex(e) {
    var P = (e.pts || []).map(function (p) { return [p[0], p[1]]; }); if (P.length > 1 && G.dist(P[0], P[P.length - 1]) < 1) P.pop(); if (P.length < 3 || P.length > 24) return null;
    if (G.plineArea(P) < 0) P.reverse();
    P = P.filter(function (p, i) { var a = P[(i + P.length - 1) % P.length], b = P[(i + 1) % P.length]; return Math.abs(G.cross(G.sub(p, a), G.sub(b, p))) > 2 * (G.dist(a, p) + G.dist(p, b)) / 2; });
    var n = P.length; if (n < 3) return null; var right = 0;
    for (var i = 0; i < n; i++) { var a = P[(i + n - 1) % n], b = P[i], c = P[(i + 1) % n], cr = G.cross(G.sub(b, a), G.sub(c, b)); if (cr <= 0) return null; if (Math.abs(G.dot(G.norm(G.sub(b, a)), G.norm(G.sub(c, b)))) < 0.01) right++; }
    if (n === 4 && right === 4) return null;
    var E = P.map(function (a, k) { var b = P[(k + 1) % n], u = G.norm(G.sub(b, a)); return { a: a, b: b, n: [-u[1], u[0]] }; }), D = function (k, p) { return (p[0] - E[k].a[0]) * E[k].n[0] + (p[1] - E[k].a[1]) * E[k].n[1]; };
    var polys = [], creases = [], top = 0;
    for (var k = 0; k < n; k++) {
      var poly = P.slice();
      for (var j = 0; j < n && poly.length > 2; j++) { if (j === k) continue; var f = function (p) { return D(j, p) - D(k, p); }, out = [];
        for (var m = 0; m < poly.length; m++) { var p0 = poly[m], p1 = poly[(m + 1) % poly.length], f0 = f(p0), f1 = f(p1); if (f0 >= -1e-6) out.push(p0); if ((f0 > 1e-6 && f1 < -1e-6) || (f0 < -1e-6 && f1 > 1e-6)) { var t = f0 / (f0 - f1); out.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t]); } }
        poly = out; }
      if (poly.length < 3 || Math.abs(G.plineArea(poly)) < 100) continue;
      var pg = poly.map(function (p) { var r = Math.max(0, D(k, p)); if (r > top) top = r; return [p[0], p[1], r]; }); polys.push(pg);
      for (var q = 0; q < pg.length; q++) { var A0 = pg[q], B0 = pg[(q + 1) % pg.length]; if (A0[2] > 1 || B0[2] > 1) creases.push({ a: [A0[0], A0[1]], b: [B0[0], B0[1]], r0: A0[2], r1: B0[2] }); }
    }
    if (polys.length < 3) return null;
    return { polys: polys, creases: creases.map(function (x) { return [x.a, x.b, x.r0, x.r1]; }), top: top, outline: P, gables: [], eaves: E.map(function (x) { return [x.a, x.b]; }) };
  }
  function hipOrthoCalc(e) {
    var P0 = e.pts, R = P0 && P0.length > 4 ? roofRidge(e) : null; if (!R) return null;
    var th = R.th || 0, c = Math.cos(th), s = Math.sin(th), toL = function (p) { return [p[0] * c + p[1] * s, -p[0] * s + p[1] * c]; }, toW = function (p) { return [p[0] * c - p[1] * s, p[0] * s + p[1] * c]; };
    var Q = P0.map(toL), TOL = 5; if (G.plineArea(Q) < 0) Q.reverse();
    /* drop corners that lie on a straight side, then every side must be parallel to an axis of the frame */
    Q = Q.filter(function (p, i) { var a = Q[(i + Q.length - 1) % Q.length], b = Q[(i + 1) % Q.length]; return Math.abs(G.cross(G.sub(p, a), G.sub(b, p))) > TOL * (G.dist(a, p) + G.dist(p, b)) / 2 || G.dot(G.sub(p, a), G.sub(b, p)) < 0; });
    if (Q.length <= 4) return null;
    var E = [], okAll = true;
    Q.forEach(function (a, i) { var b = Q[(i + 1) % Q.length]; if (Math.abs(a[0] - b[0]) <= TOL) E.push({ ax: 0, c: (a[0] + b[0]) / 2, lo: Math.min(a[1], b[1]), hi: Math.max(a[1], b[1]) }); else if (Math.abs(a[1] - b[1]) <= TOL) E.push({ ax: 1, c: (a[1] + b[1]) / 2, lo: Math.min(a[0], b[0]), hi: Math.max(a[0], b[0]) }); else okAll = false; });
    if (!okAll) return null;
    Q = Q.map(function (p, i) { var e0 = E[(i + Q.length - 1) % Q.length], e1 = E[i], q = [p[0], p[1]]; q[e0.ax] = e0.c; q[e1.ax] = e1.c; return q; });   // exactly square
    /* gable roof: the end of each wing is a gable wall, not a roof plane — a side between two outside corners that is not wider than its wing is long (the narrowest ends first; two neighbouring sides are never both gables) */
    var nE = E.length, EALL = E, gableEnds = [];
    if (e.kind === "gable") {
      var convex = Q.map(function (p, i) { var a = Q[(i + nE - 1) % nE], b = Q[(i + 1) % nE]; return G.cross(G.sub(p, a), G.sub(b, p)) > 0; }), len = E.map(function (x) { return x.hi - x.lo; }), isG = E.map(function () { return false; });
      var ratio = E.map(function (x, i) { var p = (i + nE - 1) % nE, n = (i + 1) % nE; return convex[i] && convex[n] ? Math.max(len[p], len[n]) / Math.max(len[i], 1) : 0; });   // how much longer the wing runs than this end is wide
      E.map(function (x, i) { return i; }).sort(function (i, j) { return ratio[j] - ratio[i]; }).forEach(function (i) { var p = (i + nE - 1) % nE, n = (i + 1) % nE; if (ratio[i] >= 0.999 && !isG[p] && !isG[n]) isG[i] = true; });
      gableEnds = E.filter(function (x, i) { return isG[i]; }); E = E.filter(function (x, i) { return !isG[i]; });
      if (E.length < 2) return null;
    }
    /* the roof plane at a point: the nearest side; beyond the end of a side (inside corners) it is the side that turns the corner */
    function at(p) {
      var bd = Infinity, bax = 0, bc = 0;
      for (var i = 0; i < E.length; i++) { var ed = E[i], perp = Math.abs(p[ed.ax] - ed.c), o = p[1 - ed.ax], over = Math.max(ed.lo - o, o - ed.hi, 0), d = perp, ax = ed.ax, cc = ed.c; if (over > perp) { d = over; ax = 1 - ed.ax; cc = o < ed.lo ? ed.lo : ed.hi; } if (d < bd - 1e-7) { bd = d; bax = ax; bc = cc; } }
      return { d: bd, ax: bax, c: bc, k: bax + ":" + Math.round(bc * 10) };
    }
    var uniq = function (a) { a = a.slice().sort(function (x, y) { return x - y; }); return a.filter(function (v, i) { return !i || v - a[i - 1] > 0.5; }); };
    var xs = uniq(Q.map(function (p) { return p[0]; })), ys = uniq(Q.map(function (p) { return p[1]; }));
    /* Every hip, valley and ridge lies on one of a few lines: the two diagonals through each crossing of a side's line in x with a side's line in y,
       and the lines midway between two parallel sides. Cutting the outline along all of them leaves pieces that each lie on a single roof plane. */
    var lines = [];   // a·x + b·y = c
    xs.forEach(function (x) { ys.forEach(function (y) { lines.push([1, -1, x - y], [1, 1, x + y]); }); });
    for (var i1 = 0; i1 < xs.length; i1++) for (var i2 = i1 + 1; i2 < xs.length; i2++) lines.push([1, 0, (xs[i1] + xs[i2]) / 2]);
    for (var j1 = 0; j1 < ys.length; j1++) for (var j2 = j1 + 1; j2 < ys.length; j2++) lines.push([0, 1, (ys[j1] + ys[j2]) / 2]);
    lines = lines.filter(function (l, i) { return !lines.some(function (m, k) { return k < i && m[0] === l[0] && m[1] === l[1] && Math.abs(m[2] - l[2]) < 0.5; }); });
    if (lines.length > 260) return null;   // a very intricate outline: leave it to the simple roof
    var cells = [];
    for (var i = 0; i < xs.length - 1; i++) for (var j = 0; j < ys.length - 1; j++) if (G.inPoly([(xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2], Q)) cells.push([[xs[i], ys[j]], [xs[i + 1], ys[j]], [xs[i + 1], ys[j + 1]], [xs[i], ys[j + 1]]]);
    function half(pts, l, sg) { var o = []; for (var i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length], ga = sg * (l[0] * a[0] + l[1] * a[1] - l[2]), gb = sg * (l[0] * b[0] + l[1] * b[1] - l[2]); if (ga <= 1e-6) o.push(a); if ((ga < -1e-6 && gb > 1e-6) || (ga > 1e-6 && gb < -1e-6)) { var t = ga / (ga - gb); o.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } } return o; }
    lines.forEach(function (l) {
      var next = [];
      cells.forEach(function (cl) { var mn = Infinity, mx = -Infinity; cl.forEach(function (q) { var v = l[0] * q[0] + l[1] * q[1] - l[2]; if (v < mn) mn = v; if (v > mx) mx = v; }); if (mn > -1e-6 || mx < 1e-6) { next.push(cl); return; } var a = half(cl, l, 1), b = half(cl, l, -1); if (a.length >= 3) next.push(a); if (b.length >= 3) next.push(b); });
      cells = next;
    });
    var polys = [], cr = [], top = 0, edgeMap = {}, rk = function (q) { return Math.round(q[0] * 20) + "_" + Math.round(q[1] * 20); };
    cells.forEach(function (cl) {
      var cx = 0, cy = 0; cl.forEach(function (q) { cx += q[0]; cy += q[1]; }); cx /= cl.length; cy /= cl.length;
      if (Math.abs(G.plineArea(cl)) < 1) return;
      var pl = at([cx, cy]), sg = [cx, cy][pl.ax] >= pl.c ? 1 : -1, hs = cl.map(function (q) { var r = Math.max(0, sg * (q[pl.ax] - pl.c)); if (r > top) top = r; return r; });
      polys.push(cl.map(function (q, i) { var w = toW(q); return [w[0], w[1], hs[i]]; }));
      cl.forEach(function (q, i) { var q2 = cl[(i + 1) % cl.length], ka = rk(q), kb = rk(q2); if (ka === kb) return; var key = ka < kb ? ka + "|" + kb : kb + "|" + ka, prev = edgeMap[key]; if (prev) { if (prev.k !== pl.k && (hs[i] > 0.5 || hs[(i + 1) % cl.length] > 0.5)) cr.push([q, q2, hs[i], hs[(i + 1) % cl.length]]); } else edgeMap[key] = { k: pl.k }; });   // an edge shared by two pieces on different planes is a hip / valley / ridge
    });
    /* join the little pieces of each hip / valley / ridge line into one segment */
    var groups = {};
    cr.forEach(function (sg2) { var a = sg2[0], b = sg2[1], dx = b[0] - a[0], dy = b[1] - a[1], kind, off, ta, tb; if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return;
      if (Math.abs(dy) < 1e-6 * Math.abs(dx) + 1e-6) { kind = "h"; off = a[1]; ta = a[0]; tb = b[0]; } else if (Math.abs(dx) < 1e-6 * Math.abs(dy) + 1e-6) { kind = "v"; off = a[0]; ta = a[1]; tb = b[1]; } else if (dx * dy > 0) { kind = "p"; off = a[1] - a[0]; ta = a[0]; tb = b[0]; } else { kind = "n"; off = a[1] + a[0]; ta = a[0]; tb = b[0]; }
      var key = kind + Math.round(off); (groups[key] = groups[key] || []).push(ta <= tb ? { t0: ta, t1: tb, a: a, b: b, r0: sg2[2], r1: sg2[3] } : { t0: tb, t1: ta, a: b, b: a, r0: sg2[3], r1: sg2[2] }); });
    var creases = [];
    Object.keys(groups).forEach(function (k) { var L2 = groups[k].sort(function (p, q) { return p.t0 - q.t0; }), cur = null; L2.forEach(function (x) { if (cur && x.t0 <= cur.t1 + 2) { if (x.t1 > cur.t1) { cur.t1 = x.t1; cur.b = x.b; cur.r1 = x.r1; } } else { if (cur) creases.push(cur); cur = { t0: x.t0, t1: x.t1, a: x.a, b: x.b, r0: x.r0, r1: x.r1 }; } }); if (cur) creases.push(cur); });
    /* gable walls: along each gable end, the roof line above it */
    var gables = gableEnds.map(function (ge) {
      var pts = {}; cells.forEach(function (cl) { if (Math.abs(G.plineArea(cl)) < 1) return; cl.forEach(function (q) { if (Math.abs(q[ge.ax] - ge.c) < 0.05 && q[1 - ge.ax] >= ge.lo - 0.05 && q[1 - ge.ax] <= ge.hi + 0.05) pts[Math.round(q[1 - ge.ax] * 20)] = q; }); });
      return Object.keys(pts).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { var q = pts[k], w = toW(q); return [w[0], w[1], at(q).d]; });
    }).filter(function (g) { return g.length >= 2; });
    return { polys: polys, creases: creases.map(function (x) { return [toW(x.a), toW(x.b), x.r0, x.r1]; }), top: top, outline: Q.map(toW), gables: gables, eaves: E.map(function (x) { var a = [0, 0], b = [0, 0]; a[x.ax] = b[x.ax] = x.c; a[1 - x.ax] = x.lo; b[1 - x.ax] = x.hi; return [toW(a), toW(b)]; }) };
  }
  /* Outer outline(s) of the walls of a level — the outside faces of the building, one closed loop (counter-clockwise) per group of joined walls.
     The centre lines are split where walls meet or cross, the outside of that network is walked, and each edge is pushed out by half its wall thickness.
     Returns [{ pts, area }] largest first; walls that do not close a loop give nothing. */
  B.wallOutlines = function (doc, lvl) {
    var W = walls(doc, lvl).filter(function (w) { return doc.visible ? doc.visible(w) : true; }).map(function (w) { var c = wallLine(w); return { a: c.a, b: c.b, th: w.th, L: c.L }; }).filter(function (w) { return w.L > 1; });
    if (W.length < 3) return [];
    /* nodes: ends that touch (within half a wall), an end that stops on another wall (T), and crossings */
    var nodes = [], nid = function (p, tol) { for (var i = 0; i < nodes.length; i++) if (G.dist(nodes[i], p) <= tol) return i; nodes.push([p[0], p[1]]); return nodes.length - 1; };
    W.forEach(function (w) { w.cuts = []; });
    W.forEach(function (w, i) {
      ["a", "b"].forEach(function (k) {
        var p = w[k], best = null;
        W.forEach(function (o, j) { if (j === i) return; var u = G.norm(G.sub(o.b, o.a)), s = G.dot(G.sub(p, o.a), u), q = G.add(o.a, G.mul(u, s)), dd = G.dist(p, q), reach = o.th / 2 + w.th / 2 + 5; if (s > reach && s < o.L - reach && dd <= o.th / 2 + 5 && (!best || dd < best.dd)) best = { dd: dd, q: q, o: o, s: s }; });
        if (best) { w[k] = best.q; best.o.cuts.push(best.s); }   // T junction: the end sits on the other wall's centre line
      });
    });
    for (var i = 0; i < W.length; i++) for (var j = i + 1; j < W.length; j++) {   // X crossings
      var a = W[i], b = W[j], x = G.intersect({ k: "L", a: a.a, b: a.b }, { k: "L", a: b.a, b: b.b })[0]; if (!x) continue;
      var sa = G.dist(a.a, x), sb = G.dist(b.a, x); if (sa > 5 && sa < G.dist(a.a, a.b) - 5) a.cuts.push(sa); if (sb > 5 && sb < G.dist(b.a, b.b) - 5) b.cuts.push(sb);
    }
    var adj = {}, link = function (p, q, th) { if (p === q) return; (adj[p] = adj[p] || {})[q] = Math.max(th, (adj[p] || {})[q] || 0); (adj[q] = adj[q] || {})[p] = adj[p][q]; };
    W.forEach(function (w) {
      var L = G.dist(w.a, w.b); if (L < 1) return; var u = G.norm(G.sub(w.b, w.a)), tol = Math.max(5, w.th * 0.6), ss = [0].concat(w.cuts.filter(function (s) { return s > 1 && s < L - 1; }).sort(function (x, y) { return x - y; })).concat([L]), prev = null;
      ss.forEach(function (s, k) { var n = nid(G.add(w.a, G.mul(u, s)), k === 0 || k === ss.length - 1 ? tol : 5); if (prev != null) link(prev, n, w.th); prev = n; });
    });
    /* walk the outside of every group of joined walls: start at its lowest node, always take the right-most turn */
    var seen = {}, out = [], ang = function (p, q) { return Math.atan2(nodes[q][1] - nodes[p][1], nodes[q][0] - nodes[p][0]); };
    Object.keys(adj).map(Number).sort(function (p, q) { return nodes[p][1] - nodes[q][1] || nodes[p][0] - nodes[q][0]; }).forEach(function (start) {
      if (seen[start]) return;
      var comp = [start], st = [start]; seen[start] = 1; while (st.length) { var c = st.pop(); Object.keys(adj[c]).forEach(function (n) { n = +n; if (!seen[n]) { seen[n] = 1; comp.push(n); st.push(n); } }); }
      if (comp.length < 3) return;
      var next = function (from, at, back) { var bestN = null, bestA = 9; Object.keys(adj[at]).forEach(function (n) { n = +n; var t = ang(at, n) - back; while (t <= 1e-9) t += G.TAU; while (t > G.TAU + 1e-9) t -= G.TAU; if (t < bestA) { bestA = t; bestN = n; } }); return bestN; };
      var path = [start], n1 = next(null, start, Math.PI + 1e-6), prevN = start, curN = n1, guard = 0; if (n1 == null) return;
      while (guard++ < 4 * comp.length + 8) { path.push(curN); var nx = next(prevN, curN, ang(curN, prevN)); if (nx == null) break; if (curN === start && nx === n1) break; prevN = curN; curN = nx; }
      path.pop();   // the walk ends back on the start node
      for (var ch = true; ch && path.length > 2;) { ch = false; for (var k = 0; k < path.length; k++) { var n = path.length; if (path[(k + n - 1) % n] === path[(k + 1) % n]) { if (k + 1 < n) path.splice(k, 2); else { path.splice(k, 1); path.splice(0, 1); } ch = true; break; } } }   // dead-end walls: out and back
      if (path.length < 3) return;
      /* push each edge out by half its wall (outside is on the right when walking counter-clockwise) */
      var n = path.length, E = path.map(function (p, k) { var q = path[(k + 1) % n], u = G.norm(G.sub(nodes[q], nodes[p])), d = adj[p][q] / 2; return { p: G.add(nodes[p], [u[1] * d, -u[0] * d]), u: u, d: d }; }), pts = [];
      for (var k2 = 0; k2 < n; k2++) { var e0 = E[(k2 + n - 1) % n], e1 = E[k2], cr = G.cross(e0.u, e1.u); if (Math.abs(cr) < 1e-6) { if (G.dot(e0.u, e1.u) > 0 && Math.abs(e0.d - e1.d) < 1e-6) continue; pts.push(e1.p); continue; } var x2 = lineX(e0.p, e0.u, e1.p, e1.u); if (x2) pts.push(x2); }
      var A = G.plineArea(pts); if (pts.length >= 3 && A > 1e4) out.push({ pts: pts, area: A });
    });
    return out.sort(function (p, q) { return q.area - p.area; });
  };
  /* segments for picking / snapping (all plan lines) */
  B.segs = function (e) { var doc = B.ctx.doc; if (!doc) return []; var p = B.plan(doc, e); return p.segs.concat(p.dashed); };

  /* ---------- transforms ---------- */
  B.xform = function (e, M) {
    if (B.EXT && B.EXT[e.t]) return B.EXT[e.t].xform(e, M);
    var o = JSON.parse(JSON.stringify(e)), P = function (p) { return G.mApply(M, p); }, det = M[0] * M[3] - M[1] * M[2], rr = Math.atan2(M[1], M[0]) * 180 / Math.PI, sc = Math.sqrt(Math.abs(det));
    switch (e.t) {
      case "wall": case "beam": o.a = P(e.a); o.b = P(e.b); if (det < 0 && e.t === "wall" && e.just && e.just !== "c") o.just = e.just === "l" ? "r" : "l"; break;
      case "slab": case "roof": case "room": case "railing": o.pts = e.pts.map(P); if (e.holes) o.holes = e.holes.map(function (h) { return h.map(P); }); if (e.dir != null) o.dir = det < 0 ? -e.dir + 2 * rr : e.dir + rr; break;
      case "column": case "footing": o.p = P(e.p); o.rot = (e.rot || 0) + (det < 0 ? -rr : rr); break;
      case "stair": o.p = P(e.p); var sd0 = (e.dir || 0) * Math.PI / 180, sq = P([e.p[0] + Math.cos(sd0) * 1000, e.p[1] + Math.sin(sd0) * 1000]); o.dir = Math.atan2(sq[1] - o.p[1], sq[0] - o.p[0]) * 180 / Math.PI; if (det < 0) o.side = +e.side === -1 ? 1 : -1; break;
      case "door": case "window": case "opening":
        var doc = B.ctx.doc, pl = doc && B.place(doc, e); if (!pl) break;
        var np = P(pl.p), c = pl.c; o.at = Math.max(e.w / 2, Math.min(c.L - e.w / 2, G.dot(G.sub(np, c.a), c.u))); if (det < 0) o.flip = !e.flip; break;
    }
    return o;
  };
  B.bbox = function (e) { var S = B.segs(e), b = G.bboxSegs(S); if (e.t === "slab" || e.t === "roof" || e.t === "room") e.pts.forEach(function (p) { G.ext(b, p); }); return b; };

  /* ---------- quantities ---------- */
  function area(P) { return Math.abs(G.plineArea(P.map(function (p) { return [p[0], p[1], 0]; }))); }
  B.area = area;
  function wallH(doc, w) { var b = B.ensure(doc.d), L = B.level(doc.d, w.lvl); return w.h != null ? w.h : Math.max(500, L.h - b.slabTh); }
  B.wallH = wallH;
  /* returns rows: { k (quantity key), dim: "V"|"A"|"L"|"N"|"M", v (mm³ / mm² / mm / count / kg), label, f (formula text), z: "plinth"|"super" } */
  B.qty = function (doc, e) {
    if (B.EXT && B.EXT[e.t]) return B.EXT[e.t].qty(doc, e);
    var d = doc.d, bs = B.ensure(d), R = bs.rules, rows = [], zone = function (lvl) { return B.below(d, lvl); }, push = function (k, dim, v, label, f, z) { if (v > 1e-9) rows.push({ k: k, dim: dim, v: v, label: label, f: f || "", z: z || zone(e.lvl) }); };
    var m = function (v) { return (v / 1000).toFixed(3); };
    /* steel from the modelled bars (BBS) when the element has reinforcement; returns false to fall back to the thumb rule */
    var rfPush = function (k, what, z) { if (!B.hasRf || !B.hasRf(e)) return false; var br = B.bars(doc, e); if (!br || !br.sets.length) return false; rows.push({ k: k, dim: "M", v: br.kg, label: "Reinforcement — " + what + " (from bars / BBS)", f: br.sets.map(function (x) { return x.nb + "×" + x.dia + "φ " + x.what.toLowerCase(); }).join(", "), z: z || zone(e.lvl), rf: true }); return true; };
    if (e.t === "wall") {
      var P = B.wallPoly(doc, e), H = wallH(doc, e), A = area([P.sL, P.eL, P.eR, P.sR]), c = wallLine(e), ops = B.openings(doc, e), vol = A * H, ded = 0, lint = 0, lintV = 0;
      ops.forEach(function (o) { var oa = (o.s1 - o.s0) * Math.min(o.z1, H) - 0; if (oa / 1e6 > R.brickDed) ded += ((o.s1 - o.s0) * (Math.min(o.z1, H) - o.z0) - B.archSp(o.e)) * e.th; if (R.lintel && e.mat !== "rcc" && o.z1 < H - 50 && !B.archSp(o.e)) { var ll = (o.s1 - o.s0) + 2 * R.lintelBear; lint += ll; lintV += ll * e.th * R.lintelD; } });
      var net = vol - ded - lintV, mat = e.mat || "brick";
      push(mat === "rcc" ? "rcc_wall" : mat === "block" ? "block" : mat === "stone" ? "stone" : "brick", "V", net, (mat === "rcc" ? "RCC wall" : mat === "block" ? "Block masonry" : mat === "stone" ? "Stone masonry" : "Brick masonry") + " " + Math.round(e.th) + " mm", "plan area " + (A / 1e6).toFixed(3) + " m² × h " + m(H) + " m − openings " + (ded / 1e9).toFixed(3) + " m³" + (lintV ? " − lintels " + (lintV / 1e9).toFixed(3) + " m³" : ""));
      if (mat === "rcc") { push("shut_wall", "A", 2 * c.L * H, "Shuttering — RCC wall (both faces)", "2 × " + m(c.L) + " × " + m(H)); push("steel_wall", "M", net / 1e9 * (bs.steel.column || 150), "Reinforcement — RCC wall (thumb rule " + (bs.steel.column || 150) + " kg/m³)", ""); }
      if (lintV) { push("rcc_lintel", "V", lintV, "RCC lintels over openings", "Σ(opening + 2 × " + R.lintelBear + " bearing) × " + Math.round(e.th) + " × " + R.lintelD); push("shut_lintel", "A", lint * (2 * R.lintelD + e.th), "Shuttering — lintels", "sides + soffit"); push("steel_lintel", "M", lintV / 1e9 * bs.steel.lintel, "Reinforcement — lintels (thumb rule " + bs.steel.lintel + " kg/m³)", ""); }
      // plaster on each face (IS 1200: openings ≤ 0.5 m² not deducted; 0.5–3 m² deduct one face, no jambs; > 3 m² deduct both faces, add jambs)
      var faces = [[P.sL, P.eL], [P.sR, P.eR]], extSide = B.extSide(doc, e); var finA = e.fin && B.finArea ? B.finArea(doc, e, ops, H) : [0, 0];
      faces.forEach(function (f, i) {
        var Lf = G.dist(f[0], f[1]), gross = Lf * H, dd = 0, jamb = 0;
        ops.forEach(function (o) { var oa = (o.s1 - o.s0) * (Math.min(o.z1, H) - o.z0) - B.archSp(o.e); if (oa / 1e6 <= R.plasterSmall) return; if (oa / 1e6 <= R.plasterLarge) { if (i === 0) dd += oa; return; } dd += oa; jamb += (2 * (o.z1 - o.z0) + (o.s1 - o.s0)) * e.th / 2; });
        var isExt = e.ext && extSide === i, net2 = gross - dd + jamb;
        push(isExt ? "plaster_ext" : "plaster_int", "A", net2, (isExt ? "External plaster / finish" : "Internal plaster") + " — face " + (i ? "B" : "A"), m(Lf) + " × " + m(H) + " − openings" + (jamb ? " + jambs" : ""));
        push(isExt ? "paint_ext" : "paint_int", "A", Math.max(0, net2 - finA[i]), (isExt ? "Exterior painting" : "Interior painting"), finA[i] ? "plaster area − tiles / cladding" : "same as plaster");
      });
      if (e.fin && B.finQty) B.finQty(doc, e, ops, H, function (k, v, label, f) { push(k, "A", v, label, f); });
      return rows;
    }
    if (e.t === "door" || e.t === "window" || e.t === "opening") {
      if (e.t === "opening") return rows;
      push(e.t === "door" ? (e.mat === "steel" ? "door_steel" : e.mat === "pvc" ? "door_pvc" : e.mat === "al" ? "door_al" : "door_flush") : (e.mat === "upvc" ? "win_upvc" : "win_al"), "A", e.w * e.h - B.archSp(e), (e.t === "door" ? "Door shutter " : "Window ") + (e.preset || "") + " " + Math.round(e.w) + "×" + Math.round(e.h), m(e.w) + " × " + m(e.h));
      var gr = e.t === "window" && B.grillOf ? B.grillOf(e) : null; if (gr) push("ms_grill", "M", gr.kg, "Steel grill of window " + (e.preset || "") + " " + Math.round(e.w) + "×" + Math.round(e.h) + " — " + ({ v: "upright bars", h: "level bars", sq: "square grid", box: "oblong grid", dia: "diamond grid", ring: "upright bars with a band of rings" }[gr.pat] || "bars"), (gr.pat === "ring" ? gr.xs.length + " uprights and 2 rails with " + Math.round(gr.diag.length / 12) + " rings of 10 mm round; bars" : (gr.xs.length + gr.zs.length + (gr.diag || []).length) + " bars")+ " of 12 mm square + flat all round (weight by length — check with the fabricator's drawing)");
      if (e.t === "door" && +e.casing > 20 && !e.head) push("door_architrave", "L", 2 * (2 * e.h + e.w + 2 * (+e.casing)), "Architrave (moulded beading) round the door frame, both faces — " + Math.round(+e.casing) + " mm", "2 × (2 × " + m(e.h) + " + " + m(e.w + 2 * (+e.casing)) + ") — the rate item is for 50 × 12 mm; change it for another size");
      if (e.t === "door") push("door_frame", "L", 2 * e.h + e.w, "Door frame (running length) " + (e.preset || ""), "2 × " + m(e.h) + " + " + m(e.w));
      push(e.t === "door" ? "count_door" : "count_window", "N", 1, (e.t === "door" ? "Doors " : "Windows ") + (e.preset || ""), "1 no.");
      return rows;
    }
    if (e.t === "slab") {
      var Ap = area(e.pts) - (e.holes || []).reduce(function (s, h) { return s + area(h); }, 0), per = G.segsLength(G.polySegs(e.pts, true)), z = zone(e.lvl);
      push("rcc_slab", "V", Ap * e.th, (e.kind === "chajja" ? "RCC chajja / sunshade" : "RCC slab") + " " + Math.round(e.th) + " mm", (Ap / 1e6).toFixed(3) + " m² × " + m(e.th), z);
      var perH = (e.holes || []).reduce(function (t, h) { return t + G.segsLength(G.polySegs(h, true)); }, 0);   /* the sides of openings (stair wells, ducts) are shuttered too */
      push("shut_slab", "A", Ap + (per + perH) * e.th, "Shuttering — slab soffit + edges", "soffit " + (Ap / 1e6).toFixed(3) + " m² + edge " + m(per) + (perH ? " + sides of openings " + m(perH) : "") + " × " + m(e.th), z);
      if (!rfPush("steel_slab", "slab", z)) push("steel_slab", "M", Ap * e.th / 1e9 * bs.steel.slab, "Reinforcement — slab (thumb rule " + bs.steel.slab + " kg/m³)", "", z);
      if (e.kind !== "chajja") {   /* the soffit over the walls that carry the slab is not plastered */
        var Lsl = B.level(d, e.lvl), zTop = (Lsl ? Lsl.elev : 0) + (e.off || 0), Aw = 0, nW = 0, Ab = 0, nB = 0, WQ = [];
        d.ents.forEach(function (w) { if (w.t !== "wall") return; var Lw = B.level(d, w.lvl); if (!Lw) return; var wt = Lw.elev + (w.base || 0) + (w.h != null ? w.h : Lw.h); if (wt < zTop - e.th - 200 || wt > zTop + 50) return; var P = B.wallPoly(doc, w); if (!P) return; var Q = [P.sL, P.eL, P.eR, P.sR], c = [(Q[0][0] + Q[2][0]) / 2, (Q[0][1] + Q[2][1]) / 2]; if (!G.inPoly(c, e.pts) || (e.holes || []).some(function (h) { return G.inPoly(c, h); })) return; Aw += Math.abs(area(Q)); nW++; WQ.push(Q); });
        d.ents.forEach(function (b) { if (b.t !== "beam" || !b.a || !b.b) return; var Lb2 = B.level(d, b.lvl); if (!Lb2 || Math.abs(Lb2.elev + Lb2.h - zTop) > 200) return; var mb = G.mid(b.a, b.b); if (!G.inPoly(mb, e.pts) || WQ.some(function (Q) { return G.inPoly(mb, Q); })) return; Ab += G.dist(b.a, b.b) * (b.w || 230); nB++; });   /* beams not sitting on a wall: their soffit is in the beam's own plaster */
        if (Aw + Ab > Ap * 0.5) { var kf = Ap * 0.5 / (Aw + Ab); Aw *= kf; Ab *= kf; }
        push("ceiling_plaster", "A", Ap - Aw - Ab, "Ceiling plaster (soffit)", Aw + Ab > 0 ? (Ap / 1e6).toFixed(3) + " m²" + (Aw > 0 ? " − over " + nW + " wall" + (nW > 1 ? "s " : " ") + (Aw / 1e6).toFixed(3) + " m²" : "") + (Ab > 0 ? " − under " + nB + " beam" + (nB > 1 ? "s " : " ") + (Ab / 1e6).toFixed(3) + " m²" : "") : "", z); }
      return rows;
    }
    if (e.t === "column") {
      var Lc = B.level(d, e.lvl), Hc = e.h != null ? e.h : Lc.h, cs = B.colSection(e), Ac = cs.A, pc = cs.P;
      push("rcc_col", "V", Ac * Hc, "RCC column " + cs.label, (Ac / 1e6).toFixed(4) + " m² × " + m(Hc) + " m");
      push("shut_col", "A", pc * Hc, "Shuttering — columns", m(pc) + " × " + m(Hc));
      if (!rfPush("steel_col", "columns")) push("steel_col", "M", Ac * Hc / 1e9 * bs.steel.column, "Reinforcement — columns (thumb rule " + bs.steel.column + " kg/m³)", "");
      return rows;
    }
    if (e.t === "beam") {
      var Lb = G.dist(e.a, e.b), dd2 = Math.max(0, e.d - bs.slabTh);
      push("rcc_beam", "V", Lb * e.w * dd2, "RCC beam " + Math.round(e.w) + "×" + Math.round(e.d) + " (below slab)", m(Lb) + " × " + m(e.w) + " × " + m(dd2));
      push("shut_beam", "A", Lb * (e.w + 2 * dd2), "Shuttering — beams (soffit + sides)", m(Lb) + " × (" + m(e.w) + " + 2 × " + m(dd2) + ")");
      if (!rfPush("steel_beam", "beams")) push("steel_beam", "M", Lb * e.w * dd2 / 1e9 * bs.steel.beam, "Reinforcement — beams (thumb rule " + bs.steel.beam + " kg/m³)", "");
      return rows;
    }
    if (e.t === "footing") {
      var lvlF = B.level(d, e.lvl), ngl = bs.ngl, bot = lvlF.elev - e.df, pcc = e.pcc || { off: 150, th: 100 }, ws = e.ws != null ? e.ws : R.ws, depth = ngl - (bot - pcc.th);
      var eL = e.L + 2 * pcc.off + 2 * ws, eB = e.B + 2 * pcc.off + 2 * ws, exc = eL * eB * Math.max(0, depth), pv = (e.L + 2 * pcc.off) * (e.B + 2 * pcc.off) * pcc.th, fv = e.L * e.B * e.D, pedH = e.ped ? Math.max(0, lvlF.elev - (bot + e.D)) : 0, pedV = e.ped ? e.ped.w * e.ped.d * pedH : 0;
      push("excavation", "V", exc, "Excavation for footing", m(eL) + " × " + m(eB) + " × depth " + m(depth) + " (incl. " + ws + " mm working space)", "plinth");
      push("pcc", "V", pv, "PCC 1:4:8 under footing", m(e.L + 2 * pcc.off) + " × " + m(e.B + 2 * pcc.off) + " × " + m(pcc.th), "plinth");
      push("rcc_found", "V", fv + pedV, "RCC footing" + (e.ped ? " + pedestal" : ""), m(e.L) + " × " + m(e.B) + " × " + m(e.D) + (pedV ? " + " + m(e.ped.w) + " × " + m(e.ped.d) + " × " + m(pedH) : ""), "plinth");
      push("shut_found", "A", 2 * (e.L + e.B) * e.D + (e.ped ? 2 * (e.ped.w + e.ped.d) * pedH : 0), "Shuttering — footing sides" + (e.ped ? " + pedestal" : ""), "", "plinth");
      if (!rfPush("steel_found", "footing", "plinth")) push("steel_found", "M", (fv + pedV) / 1e9 * bs.steel.footing, "Reinforcement — footing (thumb rule " + bs.steel.footing + " kg/m³)", "", "plinth");
      var belowGL = Math.max(0, Math.min(ngl, bot + e.D) - bot); var below = pv + e.L * e.B * Math.min(e.D, belowGL) + (e.ped ? e.ped.w * e.ped.d * Math.max(0, ngl - (bot + e.D)) : 0);
      push("backfill", "V", Math.max(0, exc - below), "Back-filling with excavated earth", "excavation − PCC − concrete below ground", "plinth");
      return rows;
    }
    if (e.t === "roof") {
      var Ar = area(e.pts), sl = (e.slope || 0) * Math.PI / 180, slopeA = e.kind === "flat" ? Ar : Ar / Math.cos(sl);
      if (e.mat === "rcc" || e.kind === "flat") { push("rcc_slab", "V", slopeA * (e.th || 125), "RCC roof slab " + Math.round(e.th || 125) + " mm", (slopeA / 1e6).toFixed(3) + " m² × " + m(e.th || 125)); push("shut_slab", "A", Ar, "Shuttering — roof slab", ""); push("steel_slab", "M", slopeA * (e.th || 125) / 1e9 * bs.steel.slab, "Reinforcement — roof slab (thumb rule)", ""); push("waterproof", "A", Ar, "Roof waterproofing / treatment", ""); }
      else push(e.mat === "tile" ? "roof_tile" : e.mat === "puf" ? "roof_puf" : "roof_gi", "A", slopeA, (e.mat === "tile" ? "Roof tiles" : e.mat === "puf" ? "PUF insulated roof panels" : "GI / colour-coated roof sheets") + " (on slope)", (Ar / 1e6).toFixed(3) + " m² ÷ cos " + (e.slope || 0) + "°");
      return rows;
    }
    if (e.t === "stair") {
      if (e.kind === "spiral") { var Sp = stairGeom(e), saD = Math.max(15, Math.min(45, +e.sa || 30)), ring = Math.PI * (Sp.Ro * Sp.Ro - 75 * 75), ta = ring * ((Sp.steps.length - 1) * saD + Sp.topA * 180 / Math.PI) / 360, postH = e.n * e.R + 1000;
        if (e.mat === "steel") { var kg = ta / 1e6 * 0.006 * 7850 * 1.3 + postH / 1000 * 19.5; push("ms_stair", "M", kg, "Steel spiral staircase — " + e.n + " treads in 6 mm chequered plate with stiffeners, and a 150 mm pipe post", (ta / 1e6).toFixed(2) + " m² of treads × 6 mm × 7850 × 1.3 + post " + m(postH) + " m × 19.5 kg/m (approximate weight — check with the fabricator's drawing)"); }
        else { push("rcc_stair", "V", ta * 60 + Math.PI * 75 * 75 * postH, "Spiral staircase — " + e.n + " treads of 60 mm and the centre post (precast / cast RCC)", e.n + " treads, outer radius " + m(Sp.Ro)); push("stair_finish", "A", ta, "Stair finish — treads", ""); }
        var RLs = B.stairRails(e); if (RLs.length) push("railing", "L", RLs.reduce(function (t, r) { return t + r.len; }, 0), "Spiral stair railing on the outer edge", ""); return rows; }
      var S = stairGeom(e), steps = S.steps.length, run = (e.n - S.flights.length) * e.T, rise = e.n * e.R, incl = Math.hypot(run, rise), stepsV = steps * e.T * e.R / 2 * e.w, waist = incl * e.w * (e.wt || 150), landV = S.U ? 2 * e.w * e.w * (e.wt || 150) : S.L ? e.w * e.w * (e.wt || 150) : S.flights.length > 1 ? (2 * e.w + (e.gap || 100)) * (e.land || e.w) * (e.wt || 150) : 0;
      push("rcc_stair", "V", stepsV + waist + landV, "RCC staircase (waist slab + steps" + (landV ? " + landing" : "") + ")", e.n + " risers × " + e.R + " / treads " + e.T + ", width " + e.w);
      push("shut_stair", "A", incl * e.w + steps * e.R * e.w, "Shuttering — stairs", "");
      push("stair_finish", "A", steps * (e.T + e.R) * e.w, "Stair finish — treads + risers", "");
      var RL = B.stairRails(e); if (RL.length) { var rl = RL.reduce(function (t, r) { return t + r.len; }, 0); push("railing", "L", rl, "Stair railing (" + RL.length + " run" + (RL.length > 1 ? "s" : "") + ", measured on the slope)", RL.map(function (r) { return m(r.len); }).join(" + ")); }
      push("steel_stair", "M", (stepsV + waist + landV) / 1e9 * bs.steel.stair, "Reinforcement — stair (thumb rule)", "");
      return rows;
    }
    if (e.t === "room") {
      var Agross = area(e.pts), perR = G.segsLength(G.polySegs(e.pts, true)), lvlR = B.level(d, e.lvl), nmR = e.name || "room";
      /* openings in the floor slab of this room (stair wells, ducts) carry no flooring */
      var Ahole = 0; d.ents.forEach(function (sl) { if (sl.t !== "slab" || !sl.holes || !sl.holes.length) return; var Ls = B.level(d, sl.lvl), zt = (Ls ? Ls.elev : 0) + (sl.off || 0); if (Math.abs(zt - lvlR.elev) > 60) return; sl.holes.forEach(function (h) { var cx = 0, cy = 0; h.forEach(function (q) { cx += q[0]; cy += q[1]; }); if (G.inPoly([cx / h.length, cy / h.length], e.pts)) Ahole += area(h); }); });
      var Aroom = Math.max(0, Agross - Ahole);
      /* doors and openings on the walls of this room: no skirting across them */
      var dW = 0, dN = 0; d.ents.forEach(function (o) { if (o.t !== "door" && o.t !== "opening") return; if (o.t === "opening" && (o.sill || 0) > 50) return; var pl = B.place(doc, o); if (!pl || !pl.w || pl.w.lvl !== e.lvl) return; var tol = (pl.w.th || 230) / 2 + 80, best = Infinity; for (var k = 0; k < e.pts.length; k++) { var a = e.pts[k], b = e.pts[(k + 1) % e.pts.length], L2 = G.dist(a, b); if (L2 < 1) continue; var t = Math.max(0, Math.min(1, ((pl.p[0] - a[0]) * (b[0] - a[0]) + (pl.p[1] - a[1]) * (b[1] - a[1])) / (L2 * L2))), dd = Math.hypot(pl.p[0] - a[0] - (b[0] - a[0]) * t, pl.p[1] - a[1] - (b[1] - a[1]) * t); if (dd < best) best = dd; } if (best <= tol) { dW += o.w || 0; dN++; } });
      dW = Math.min(dW, perR);
      push("floor_" + (e.floor || "vitrified"), "A", Aroom, "Flooring — " + nmR + " (" + (e.floor || "vitrified tiles") + ")", (Agross / 1e6).toFixed(3) + " m²" + (Ahole ? " − openings in the floor " + (Ahole / 1e6).toFixed(3) + " m²" : ""));
      if (e.skirt) push("skirting", "A", (perR - dW) * e.skirt, "Skirting " + e.skirt + " mm — " + nmR, (dW ? "(" + m(perR) + " − " + dN + " door" + (dN > 1 ? "s " : " ") + m(dW) + ")" : m(perR)) + " × " + m(e.skirt));
      if (e.ceil) push("false_ceiling", "A", Agross, "False ceiling — " + nmR, "");
      if (lvlR.elev <= 0) push("pcc_floor", "V", Aroom * 75, "PCC under floor 75 mm — " + nmR, "", "plinth");
      if (+e.fl < -5) { var sk = -(+e.fl); push("sunk_fill", "V", Aroom * sk, "Filling of the sunk floor — " + nmR + " (" + Math.round(sk) + " mm, taken as lean concrete 1:5:10; change the item if brick-bat or cinder filling is used)", (Aroom / 1e6).toFixed(3) + " m² × " + m(sk)); push("wp_sunken", "A", Aroom + perR * sk, "Waterproofing of the sunk floor — " + nmR, "floor " + (Aroom / 1e6).toFixed(3) + " m² + sides " + m(perR) + " × " + m(sk)); }
      if (+e.fl > 5) { push("backfill", "V", Aroom * (+e.fl), "Filling under the raised floor — " + nmR + " (" + Math.round(+e.fl) + " mm)", (Aroom / 1e6).toFixed(3) + " m² × " + m(+e.fl)); if (dW > 0) push("brick", "V", dW * 115 * (+e.fl), "Brick edge of the raised floor at the door" + (dN > 1 ? "s" : "") + " — " + nmR, m(dW) + " × 0.115 × " + m(+e.fl) + " (the walls of the room hold the filling elsewhere)"); }
      return rows;
    }
    if (e.t === "railing") { if (B.railQty) B.railQty(e, push); else push("railing", "L", G.segsLength(G.polySegs(e.pts, false)), "Railing / handrail", ""); return rows; }
    return rows;
  };
  /* which face of an exterior wall is outside: 0 = left face (A), 1 = right face (B) */
  B.extSide = function (doc, w) {
    var all = walls(doc, w.lvl), cx = 0, cy = 0, n = 0; all.forEach(function (o) { cx += o.a[0] + o.b[0]; cy += o.a[1] + o.b[1]; n += 2; }); if (!n) return 0;
    var c = wallLine(w), mid = G.mid(c.a, c.b), toC = G.sub([cx / n, cy / n], mid); return G.dot(toC, c.n) > 0 ? 1 : 0;
  };
  B.allQty = function (doc, filter) {
    var out = []; doc.d.ents.forEach(function (e) { if (!B.is(e) || (filter && !filter(e))) return; B.qty(doc, e).forEach(function (r) { r.id = e.id; r.t = e.t; r.lvl = e.lvl; out.push(r); }); });
    return out;
  };

  /* ---------- door / window presets (reference configurations — edit sizes to your specification) ---------- */
  B.DOORS = [
    { id: "D1", name: "Main door 1000×2100 (panelled / solid wood)", w: 1000, h: 2100, mat: "wood", kind: "single" },
    { id: "D2", name: "Room door 900×2100 (flush shutter)", w: 900, h: 2100, mat: "flush", kind: "single" },
    { id: "D3", name: "Toilet door 750×2100 (PVC / WPC)", w: 750, h: 2100, mat: "pvc", kind: "single" },
    { id: "D4", name: "Double door 1200×2100", w: 1200, h: 2100, mat: "flush", kind: "double" },
    { id: "D5", name: "Steel door 1200×2100", w: 1200, h: 2100, mat: "steel", kind: "double" },
    { id: "D6", name: "Double door 1500×2100 (wood panelled, main entrance)", w: 1500, h: 2100, mat: "wood", kind: "double", style: "panel" },
    { id: "D7", name: "Double door 1800×2100 (wood panelled, main entrance)", w: 1800, h: 2100, mat: "wood", kind: "double", style: "panel" },
    { id: "D8", name: "Double door 1500×2400 (wood panelled, tall hall door)", w: 1500, h: 2400, mat: "wood", kind: "double", style: "panel" },
    { id: "D9", name: "Double door 1800×2100 (flush shutters)", w: 1800, h: 2100, mat: "flush", kind: "double" },
    { id: "FR1", name: "French door 1500×2100 (glazed, aluminium)", w: 1500, h: 2100, mat: "al", kind: "double", style: "glass" },
    { id: "FR2", name: "French door 1800×2100 (glazed, aluminium)", w: 1800, h: 2100, mat: "al", kind: "double", style: "glass" },
    { id: "FR3", name: "French door 1500×2100 (glazed, wood frame)", w: 1500, h: 2100, mat: "wood", kind: "double", style: "glass" },
    { id: "SG1", name: "Steel grill gate 1800×2100 (double leaf)", w: 1800, h: 2100, mat: "steel", kind: "double", style: "grill" },
    { id: "SG2", name: "Steel grill gate 1500×2100 (double leaf)", w: 1500, h: 2100, mat: "steel", kind: "double", style: "grill" },
    { id: "D10", name: "Double door 1200×2100 (aluminium + glass)", w: 1200, h: 2100, mat: "al", kind: "double", style: "glass" },
    { id: "D11", name: "Bathroom door 700×2000 (PVC / WPC)", w: 700, h: 2000, mat: "pvc", kind: "single" },
    { id: "D12", name: "Single door 1000×2100 (wood panelled)", w: 1000, h: 2100, mat: "wood", kind: "single", style: "panel" },
    { id: "D13", name: "Main door 1200×2400 (wood panelled, tall)", w: 1200, h: 2400, mat: "wood", kind: "single", style: "panel" },
    { id: "D14", name: "Glazed single door 900×2100 (aluminium + glass)", w: 900, h: 2100, mat: "al", kind: "single", style: "glass" },
    { id: "D15", name: "Steel grill door 1000×2100 (security)", w: 1000, h: 2100, mat: "steel", kind: "single", style: "grill" },
    { id: "D16", name: "Fire-rated double door 1800×2100 (steel)", w: 1800, h: 2100, mat: "steel", kind: "double" },
    { id: "RS1", name: "Rolling shutter 3000×3000 (steel, shop front)", w: 3000, h: 3000, mat: "steel", kind: "shutter" },
    { id: "RS2", name: "Rolling shutter 2400×2400 (steel)", w: 2400, h: 2400, mat: "steel", kind: "shutter" },
    { id: "SD", name: "Sliding glass door 1800×2100 (aluminium)", w: 1800, h: 2100, mat: "al", kind: "sliding" },
    { id: "SD2", name: "Sliding glass door 2400×2100 (aluminium)", w: 2400, h: 2100, mat: "al", kind: "sliding" },
    { id: "FD", name: "Fire-rated steel door 1000×2100", w: 1000, h: 2100, mat: "steel", kind: "single" }
  ];
  B.WINDOWS = [
    { id: "W1", name: "Window 1500×1200, sill 900 (aluminium sliding, 3-track)", w: 1500, h: 1200, sill: 900, mat: "al", kind: "sliding" },
    { id: "W2", name: "Window 1200×1200, sill 900 (aluminium sliding)", w: 1200, h: 1200, sill: 900, mat: "al", kind: "sliding" },
    { id: "W3", name: "Window 900×1200, sill 900 (casement)", w: 900, h: 1200, sill: 900, mat: "al", kind: "casement" },
    { id: "W4", name: "Window 1800×1500, sill 750 (uPVC sliding)", w: 1800, h: 1500, sill: 750, mat: "upvc", kind: "sliding" },
    { id: "KW", name: "Kitchen window 1000×900, sill 1050", w: 1000, h: 900, sill: 1050, mat: "al", kind: "sliding" },
    { id: "V1", name: "Ventilator 600×450, sill 1800 (louvered / exhaust)", w: 600, h: 450, sill: 1800, mat: "al", kind: "louvre" },
    { id: "W5", name: "Window 1200×1500, sill 900 (casement 2-leaf, aluminium)", w: 1200, h: 1500, sill: 900, mat: "al", kind: "casement2" },
    { id: "W6", name: "Window 1500×1500, sill 900 (casement 2-leaf, uPVC)", w: 1500, h: 1500, sill: 900, mat: "upvc", kind: "casement2" },
    { id: "W7", name: "Window 1200×1200, sill 900 (teak wood, casement 2-leaf)", w: 1200, h: 1200, sill: 900, mat: "wood", kind: "casement2" },
    { id: "W8", name: "Window 900×900, sill 1000 (steel grill + glass)", w: 900, h: 900, sill: 1000, mat: "steel", kind: "grill" },
    { id: "W9", name: "Window 1200×1200, sill 900 (grill + sliding)", w: 1200, h: 1200, sill: 900, mat: "al", kind: "grill" },
    { id: "W10", name: "Window 2100×1200, sill 900 (aluminium sliding, 3-track)", w: 2100, h: 1200, sill: 900, mat: "al", kind: "sliding" },
    { id: "BW", name: "Bathroom window 600×600, sill 1500 (louvered)", w: 600, h: 600, sill: 1500, mat: "al", kind: "louvre" },
    { id: "V2", name: "Ventilator 450×450, sill 2000 (exhaust)", w: 450, h: 450, sill: 2000, mat: "al", kind: "louvre" },
    { id: "FX2", name: "Fixed glazing 1800×1200, sill 900 (aluminium)", w: 1800, h: 1200, sill: 900, mat: "al", kind: "fixed" },
    { id: "FX3", name: "Floor-to-ceiling fixed glass 1500×2400, sill 0", w: 1500, h: 2400, sill: 0, mat: "al", kind: "fixed" },
    { id: "FX", name: "Fixed glazing 1200×1500, sill 600", w: 1200, h: 1500, sill: 600, mat: "al", kind: "fixed" }
  ];
  B.MATS = { brick: "Brick", block: "Concrete / AAC block", rcc: "RCC", stone: "Stone" };
})();
