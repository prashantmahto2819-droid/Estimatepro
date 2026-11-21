/* Estimate Pro BIM — 2D views made from the 3D model: elevations, sections and a sheet layout.
   B.viewLines(doc, { dir: [dx, dy], cut: mm | null }) → visible edges of the model seen along dir (hidden lines removed
   with a software depth buffer), in mm: x = distance along the view's right-hand axis, y = height.
   Commands: ELEVATION, SECTION, SHEET, VIEWSUPDATE. Each view is a block (EL-Front, SEC-A …), so it can be moved as one
   object and is redrawn in place when the model changes (VIEWSUPDATE). */
(function () {
  "use strict";
  var EP = window.EP, CAD = EP.cad, G = EP.geom, B = EP.bim; if (!B || !CAD) return;
  var DIRS = B.VIEW_DIRS = { Front: [0, 1], Back: [0, -1], Right: [-1, 0], Left: [1, 0] }, ST = 14;
  var LAYERS = { "A-ELEV": { color: 7, lw: 0.18, lt: "CONTINUOUS" }, "A-ELEV-CUT": { color: 7, lw: 0.5, lt: "CONTINUOUS" }, "A-ELEV-FILL": { color: 9, lw: 0.13, lt: "CONTINUOUS" }, "A-ELEV-GL": { color: 7, lw: 0.7, lt: "CONTINUOUS" }, "A-ELEV-LVL": { color: 8, lw: 0.13, lt: "DASHDOT" }, "A-ELEV-TXT": { color: 7, lw: 0.18, lt: "CONTINUOUS" }, "A-SECT-MARK": { color: 1, lw: 0.35, lt: "DASHDOT" }, "A-SHEET": { color: 5, lw: 0.35, lt: "CONTINUOUS" } };

  B.viewLines = function (doc, o) {
    o = o || {}; var d = doc.d, bs = B.ensure(d), dv = o.dir || [0, 1], ux = dv[1], uy = -dv[0], D0 = o.cut == null ? null : o.cut / 1000, sect = D0 != null;
    var sc = B.meshes(doc, { allLevels: true }), tris = [], edges = [], cuts = [], bb = [Infinity, Infinity, -Infinity, -Infinity];
    function pj(v, i) { return [v[i] * ux + v[i + 1] * uy, v[i + 2], v[i] * dv[0] + v[i + 1] * dv[1]]; }
    function lerp(a, b) { var t = (D0 - a[2]) / (b[2] - a[2]); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, D0]; }
    function clipSeg(a, b) { if (!sect) return [a, b]; var ia = a[2] >= D0 - 1e-6, ib = b[2] >= D0 - 1e-6; if (ia && ib) return [a, b]; if (!ia && !ib) return null; return ia ? [a, lerp(a, b)] : [lerp(b, a), b]; }
    function addTri(a, b, c, solid) {
      if (sect) {
        var P = [a, b, c], out = [], X = [];
        for (var i = 0; i < 3; i++) { var p = P[i], q = P[(i + 1) % 3], ip = p[2] >= D0, iq = q[2] >= D0; if (ip) out.push(p); if (ip !== iq) { var x = lerp(p, q); out.push(x); X.push(x); } }
        if (out.length < 3) return; if (X.length === 2 && solid) cuts.push([X[0][0], X[0][1], X[1][0], X[1][1], curG]);
        for (var k = 1; k < out.length - 1; k++) push(out[0], out[k], out[k + 1], solid);
      } else push(a, b, c, solid);
    }
    function push(a, b, c, solid) { tris.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], solid ? 1 : 0); [a, b, c].forEach(function (p) { if (p[0] < bb[0]) bb[0] = p[0]; if (p[1] < bb[1]) bb[1] = p[1]; if (p[0] > bb[2]) bb[2] = p[0]; if (p[1] > bb[3]) bb[3] = p[1]; }); }
    var curG = 0;
    sc.groups.forEach(function (g, gi) {
      var e = doc.get(g.id), v = g.v; if (!e || !v || !v.length) return; curG = gi;
      if (e.t === "asset") { var def = B.ASSET_LIB && B.ASSET_LIB[e.kind]; if (def && (def.deco || def.cut)) return; }
      var nT = v.length / (3 * ST), sil = nT <= 60000 ? {} : null;
      for (var t = 0; t < nT; t++) {
        var i0 = t * 3 * ST, a = pj(v, i0), b = pj(v, i0 + ST), c = pj(v, i0 + 2 * ST);
        addTri(a, b, c, v[i0 + 9] >= 0.5);
        if (sil) { var ar = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]), sg = Math.abs(ar) < 1e-9 ? 0 : ar > 0 ? 1 : -1, P3 = [a, b, c];
          for (var k = 0; k < 3; k++) { var p = P3[k], q = P3[(k + 1) % 3], kp = Math.round(p[0] * 2000) + "," + Math.round(p[1] * 2000) + "," + Math.round(p[2] * 2000), kq = Math.round(q[0] * 2000) + "," + Math.round(q[1] * 2000) + "," + Math.round(q[2] * 2000), key = kp < kq ? kp + "|" + kq : kq + "|" + kp, s0 = sil[key];
            if (!s0) sil[key] = { p: p, q: q, s: sg, n: 1 }; else { s0.n++; if (s0.s * sg < 0) s0.x = true; } } }
      }
      var E = g.e || []; for (var j = 0; j + 5 < E.length; j += 6) edges.push([pj(E, j), pj(E, j + 3)]);
      if (sil) Object.keys(sil).forEach(function (k) { var s = sil[k]; if (s.x && s.n === 2) edges.push([s.p, s.q]); });
    });
    if (!tris.length) return null;
    /* depth buffer */
    var w = bb[2] - bb[0], h = bb[3] - bb[1], s = Math.max(Math.max(w, h) / 1700, 0.004), W = Math.ceil(w / s) + 3, H = Math.ceil(h / s) + 3, zb = new Float32Array(W * H).fill(Infinity), u0 = bb[0] - s, v0 = bb[1] - s;
    for (var ti = 0; ti < tris.length; ti += 10) {
      if (!tris[ti + 9]) continue;
      var x0 = (tris[ti] - u0) / s, y0 = (tris[ti + 1] - v0) / s, z0 = tris[ti + 2], x1 = (tris[ti + 3] - u0) / s, y1 = (tris[ti + 4] - v0) / s, z1 = tris[ti + 5], x2 = (tris[ti + 6] - u0) / s, y2 = (tris[ti + 7] - v0) / s, z2 = tris[ti + 8];
      var den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2); if (Math.abs(den) < 1e-9) continue;
      var mnx = Math.max(0, Math.floor(Math.min(x0, x1, x2))), mxx = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2))), mny = Math.max(0, Math.floor(Math.min(y0, y1, y2))), mxy = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
      for (var py = mny; py <= mxy; py++) for (var px = mnx; px <= mxx; px++) {
        var cx = px + 0.5, cy = py + 0.5, l0 = ((y1 - y2) * (cx - x2) + (x2 - x1) * (cy - y2)) / den, l1 = ((y2 - y0) * (cx - x2) + (x0 - x2) * (cy - y2)) / den, l2 = 1 - l0 - l1;
        if (l0 < -0.001 || l1 < -0.001 || l2 < -0.001) continue; var z = l0 * z0 + l1 * z1 + l2 * z2, ix = py * W + px; if (z < zb[ix]) zb[ix] = z;
      }
    }
    function far(px, py) { var m = -Infinity; for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) { var x = px + a, y = py + b; if (x < 0 || y < 0 || x >= W || y >= H) return Infinity; var z = zb[y * W + x]; if (z > m) m = z; } return m; }
    var seen = {}, lines = [], ngl = bs.ngl || 0;
    function out(ax, ay, bx, by, kind) {
      ax *= 1000; ay *= 1000; bx *= 1000; by *= 1000;
      if (!sect) { if (ay < ngl && by < ngl) return; if (ay < ngl) { var t = (ngl - ay) / (by - ay); ax += (bx - ax) * t; ay = ngl; } else if (by < ngl) { var t2 = (ngl - by) / (ay - by); bx += (ax - bx) * t2; by = ngl; } }
      var A = [Math.round(ax), Math.round(ay)], Bq = [Math.round(bx), Math.round(by)]; if (A[0] === Bq[0] && A[1] === Bq[1]) return;
      if (A[0] > Bq[0] || (A[0] === Bq[0] && A[1] > Bq[1])) { var sw = A; A = Bq; Bq = sw; }
      var key = A[0] + "," + A[1] + "," + Bq[0] + "," + Bq[1]; if (seen[key]) { if (kind === "cut") seen[key].k = "cut"; return; } var L = { a: A, b: Bq, k: kind }; seen[key] = L; lines.push(L);
    }
    edges.forEach(function (ed0) {
      var cs = clipSeg(ed0[0], ed0[1]); if (!cs) return; var a = cs[0], b = cs[1], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 5e-4) return;
      var n = Math.max(1, Math.ceil(len / s)), run = -1, minRun = n > 5 ? 2 : 1;
      for (var i = 0; i <= n; i++) {
        var vis = false; if (i < n) { var t = (i + 0.5) / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t; vis = z <= far(Math.floor((x - u0) / s), Math.floor((y - v0) / s)) + 0.025; }
        if (vis && run < 0) run = i; else if (!vis && run >= 0) { if (i - run >= minRun) { var ta = run / n, tb = i / n; out(a[0] + (b[0] - a[0]) * ta, a[1] + (b[1] - a[1]) * ta, a[0] + (b[0] - a[0]) * tb, a[1] + (b[1] - a[1]) * tb, "e"); } run = -1; }
      }
    });
    cuts.forEach(function (c) { out(c[0], c[1], c[2], c[3], "cut"); });
    /* cut faces: chain each object's cut segments into closed outlines (mm), for the grey fill of cut parts */
    var fills = [], byG = {}; cuts.forEach(function (c) { (byG[c[4]] = byG[c[4]] || []).push(c); });
    Object.keys(byG).forEach(function (gk) {
      var segs = byG[gk].map(function (c) { return { a: [Math.round(c[0] * 1000), Math.round(c[1] * 1000)], b: [Math.round(c[2] * 1000), Math.round(c[3] * 1000)], u: false }; }).filter(function (q) { return q.a[0] !== q.b[0] || q.a[1] !== q.b[1]; }), at = {}, key = function (p) { return p[0] + "," + p[1]; };
      if (segs.length > 4000) return; segs.forEach(function (q, i) { (at[key(q.a)] = at[key(q.a)] || []).push(i); (at[key(q.b)] = at[key(q.b)] || []).push(i); });
      segs.forEach(function (q0) { if (q0.u) return; q0.u = true; var loop = [q0.a, q0.b], end = q0.b, guard = 0;
        while (guard++ < 5000) { if (end[0] === loop[0][0] && end[1] === loop[0][1]) break; var nx = (at[key(end)] || []).filter(function (i) { return !segs[i].u; })[0]; if (nx == null) { loop = null; break; } var q = segs[nx]; q.u = true; end = q.a[0] === end[0] && q.a[1] === end[1] ? q.b : q.a; loop.push(end); }
        if (!loop || loop.length < 4) return; loop.pop(); var ar = 0; for (var i = 0; i < loop.length; i++) { var j = (i + 1) % loop.length; ar += loop[i][0] * loop[j][1] - loop[j][0] * loop[i][1]; } if (Math.abs(ar) / 2 < 400) return; fills.push(loop); });
    });
    /* size tags for the doors and windows that face this view and are not hidden behind something */
    var tags = [];
    if (!sect) doc.d.ents.forEach(function (o) { if (o.t !== "door" && o.t !== "window") return; var pl = B.place(doc, o); if (!pl) return; if (Math.abs(pl.u[0] * dv[0] + pl.u[1] * dv[1]) > 0.2) return;
      var Lw = B.level(doc.d, pl.w.lvl), zb2 = (Lw ? Lw.elev : 0) + (pl.w.base || 0) + (o.t === "door" ? 0 : (o.sill != null ? o.sill : 900)), cU = (pl.p[0] * ux + pl.p[1] * uy) / 1000, cV = (zb2 + o.h / 2) / 1000, cD = (pl.p[0] * dv[0] + pl.p[1] * dv[1]) / 1000 - pl.w.th / 2000;
      var px = Math.floor((cU - u0) / s), py = Math.floor((cV - v0) / s); if (px < 0 || py < 0 || px >= W || py >= H) return; if (cD > far(px, py) + pl.w.th / 1000 + 0.05) return; if (zb2 < ngl - 1 && zb2 + o.h < ngl) return;
      tags.push({ u: Math.round(cU * 1000), v: Math.round(zb2 + o.h), s: (o.t === "door" ? "D " : "W ") + Math.round(o.w) + " × " + Math.round(o.h) }); });
    var ext = [Infinity, Infinity, -Infinity, -Infinity]; lines.forEach(function (L) { G.ext(ext, L.a); G.ext(ext, L.b); });
    if (!isFinite(ext[0])) return null;
    return { lines: lines, fills: fills, tags: tags, ext: ext, ngl: ngl, levels: bs.levels.map(function (l) { return { name: l.name, elev: l.elev }; }), tris: tris.length / 10 };
  };

  /* block content for a view: the lines, ground line, level marks and the title under it; bb = everything, in block coordinates */
  B.viewBlock = function (res, title, N) {
    var ents = [], x0 = res.ext[0], x1 = res.ext[2], th = 2.5 * N, tw = function (s, h) { return s.length * h * 0.58; }, bb = res.ext.slice();
    (res.fills || []).forEach(function (lp) { ents.push({ t: "hatch", pat: "SOLID", sc: 1, ang: 0, loops: [lp.map(function (q) { return [q[0], q[1], 0]; })], layer: "A-ELEV-FILL" }); });
    res.lines.forEach(function (L) { ents.push({ t: "line", a: L.a, b: L.b, layer: L.k === "cut" ? "A-ELEV-CUT" : "A-ELEV" }); });
    ents.push({ t: "line", a: [x0 - 8 * N, res.ngl], b: [x1 + 8 * N, res.ngl], layer: "A-ELEV-GL" }); G.ext(bb, [x1 + 8 * N, res.ngl]); G.ext(bb, [x0 - 8 * N, res.ngl]);
    var top = res.ext[3];
    res.levels.forEach(function (l) {
      if (l.elev > top + 1) return; var s = l.name.slice(0, 14) + " " + (l.elev >= 0 ? "+" : "-") + (Math.abs(l.elev) / 1000).toFixed(3), wv = tw(s, th), xr = x0 - 10 * N;
      ents.push({ t: "line", a: [xr - wv, l.elev], b: [x0 - 2 * N, l.elev], layer: "A-ELEV-LVL" }); ents.push({ t: "text", p: [xr - wv, l.elev + th * 0.4], s: s, h: th, rot: 0, al: "l", layer: "A-ELEV-TXT" }); G.ext(bb, [xr - wv, l.elev + th * 1.5]);
    });
    var glS = "GL  " + (res.ngl >= 0 ? "+" : "-") + (Math.abs(res.ngl) / 1000).toFixed(3), gw = tw(glS, th); ents.push({ t: "text", p: [x1 + 10 * N, res.ngl + th * 0.4], s: glS, h: th, rot: 0, al: "l", layer: "A-ELEV-TXT" }); G.ext(bb, [x1 + 10 * N + gw, res.ngl]);
    /* overall size: width under the view, height at the right (drawn as plain lines and text, so they plot anywhere) */
    var dimL = function (a, b, off, vert) { var s2 = ((vert ? b[1] - a[1] : b[0] - a[0]) / 1000).toFixed(2) + " m", tk = 1.2 * N, L2 = "A-ELEV-TXT";
      if (vert) { var xx = a[0] + off; ents.push({ t: "line", a: [xx, a[1]], b: [xx, b[1]], layer: L2 }, { t: "line", a: [xx - tk, a[1] - tk], b: [xx + tk, a[1] + tk], layer: L2 }, { t: "line", a: [xx - tk, b[1] - tk], b: [xx + tk, b[1] + tk], layer: L2 }, { t: "line", a: [a[0] + 2 * N, a[1]], b: [xx + tk, a[1]], layer: L2 }, { t: "line", a: [a[0] + 2 * N, b[1]], b: [xx + tk, b[1]], layer: L2 }, (b[1] - a[1] < tw(s2, th) + N ? { t: "text", p: [xx - 1.5 * N - tw(s2, th), (a[1] + b[1]) / 2 - th / 2], s: s2, h: th, rot: 0, al: "l", layer: L2 } : { t: "text", p: [xx - 0.8 * N, (a[1] + b[1]) / 2 - tw(s2, th) / 2], s: s2, h: th, rot: 90, al: "l", layer: L2 })); G.ext(bb, [xx + 2 * N, b[1]]); }
      else { var yy = a[1] - off; ents.push({ t: "line", a: [a[0], yy], b: [b[0], yy], layer: L2 }, { t: "line", a: [a[0] - tk, yy - tk], b: [a[0] + tk, yy + tk], layer: L2 }, { t: "line", a: [b[0] - tk, yy - tk], b: [b[0] + tk, yy + tk], layer: L2 }, { t: "line", a: [a[0], a[1] - 2 * N], b: [a[0], yy - tk], layer: L2 }, { t: "line", a: [b[0], a[1] - 2 * N], b: [b[0], yy - tk], layer: L2 }, { t: "text", p: [(a[0] + b[0]) / 2 - tw(s2, th) / 2, yy + 0.8 * N], s: s2, h: th, rot: 0, al: "l", layer: L2 }); } };
    var yb = Math.min(res.ext[1], res.ngl), chain = [res.ngl].concat(res.levels.map(function (l) { return l.elev; }).filter(function (z) { return z > res.ngl + 200 && z < top - 200; })).concat([top]).sort(function (p, q) { return p - q; });
    dimL([x0, yb], [x1, yb], 5 * N, false);
    if (top - res.ngl > 500) { if (chain.length > 2) { for (var ci = 0; ci + 1 < chain.length; ci++) dimL([x1 + 36 * N, chain[ci]], [x1 + 36 * N, chain[ci + 1]], 4 * N, true); dimL([x1 + 42 * N, res.ngl], [x1 + 42 * N, top], 4 * N, true); } else dimL([x1 + 26 * N, res.ngl], [x1 + 26 * N, top], 4 * N, true); }
    (res.tags || []).forEach(function (t) { var h2 = 1.8 * N; ents.push({ t: "text", p: [t.u - tw(t.s, h2) / 2, t.v + 0.9 * N], s: t.s, h: h2, rot: 0, al: "l", layer: "A-ELEV-TXT" }); });
    var cx = (x0 + x1) / 2, ty = yb - 16 * N, H1 = 3.5 * N, wt = tw(title, H1);
    ents.push({ t: "text", p: [cx - wt / 2, ty], s: title, h: H1, rot: 0, al: "l", layer: "A-ELEV-TXT" }); ents.push({ t: "line", a: [cx - wt / 2, ty - 1.5 * N], b: [cx + wt / 2, ty - 1.5 * N], layer: "A-ELEV-GL" });
    ents.push({ t: "text", p: [cx - tw("Scale 1 : " + N, th) / 2, ty - 6 * N], s: "Scale 1 : " + N, h: th, rot: 0, al: "l", layer: "A-ELEV-TXT" }); G.ext(bb, [cx - wt / 2, ty - 7 * N]); G.ext(bb, [cx + wt / 2, ty]);
    return { ents: ents, bb: bb };
  };

  function ensureLayers(ed) { var L = ed.doc.d.layers, miss = Object.keys(LAYERS).filter(function (k) { return !L[k]; }); if (!miss.length) return; var Lc = CAD.clone(L); miss.forEach(function (k) { Lc[k] = Object.assign({ on: true, lock: false, frz: false }, LAYERS[k]); }); ed.doc.set("layers", Lc); }
  function scaleOf(d) { return (d.layouts && d.layouts[0] && d.layouts[0].scale) || (d.sheet && d.sheet.scale) || 100; }
  function isViewBlock(n) { return /^(EL|SEC)-/.test(n || ""); }
  function isViewEnt(e) { return (e.t === "insert" && isViewBlock(e.block)) || e.layer === "A-SHEET" || e.layer === "A-SECT-MARK"; }
  function planBox(ed) { var b = [Infinity, Infinity, -Infinity, -Infinity], doc = ed.doc; doc.d.ents.forEach(function (e) { if (isViewEnt(e) || e.t === "xline" || e.t === "ray" || !doc.visible(e)) return; var x = doc.bbox(e); if (isFinite(x[0])) { G.ext(b, [x[0], x[1]]); G.ext(b, [x[2], x[3]]); } }); return isFinite(b[0]) ? b : null; }
  function viewSpec(d, name) {
    if (/^EL-/.test(name)) { var k = name.slice(3); return DIRS[k] ? { dir: DIRS[k], cut: null, title: k.toUpperCase() + " ELEVATION" } : null; }
    var id = name.slice(4), s = ((d.bim && d.bim.sections) || []).filter(function (x) { return x.id === id; })[0]; if (!s) return null;
    var u = G.norm(G.sub(s.b, s.a)), dir = [-u[1], u[0]]; return { dir: dir, cut: s.a[0] * dir[0] + s.a[1] * dir[1], title: "SECTION " + id + " - " + id };
  }
  /* compute one view and (re)define its block; returns { name, bb } or null */
  function makeView(ed, name, N, cache) {
    var d = ed.doc.d, sp = viewSpec(d, name); if (!sp) return null;
    var res = cache && cache[name]; if (!res) { res = B.viewLines(ed.doc, sp); if (cache) cache[name] = res; } if (!res) return null;
    var vb = B.viewBlock(res, sp.title, N), Bl = Object.assign({}, ed.doc.d.blocks); Bl[name] = { base: [0, 0], ents: vb.ents }; ed.doc.set("blocks", Bl);
    return { name: name, bb: vb.bb, n: res.lines.length };
  }
  function insertsOf(ed, name) { return ed.doc.d.ents.filter(function (e) { return e.t === "insert" && e.block === name; }); }
  function hasModel(ed) { return ed.doc.d.ents.some(function (e) { return B.is(e) && e.t !== "room"; }); }
  /* a section whose line was erased from the plan is forgotten, with its view */
  function pruneSections(ed) { var bs = B.ensure(ed.doc.d), S0 = bs.sections || []; if (!S0.length) return; var live = {}; ed.doc.d.ents.forEach(function (e) { if (e.sec) live[e.sec] = 1; }); var keep = S0.filter(function (s) { return live[s.id]; }); if (keep.length === S0.length) return;
    var nb = CAD.clone(bs); nb.sections = keep; ed.doc.set("bim", nb); S0.forEach(function (s) { if (!live[s.id]) insertsOf(ed, "SEC-" + s.id).forEach(function (e) { ed.doc.del(e.id); }); }); }
  B.makeView = makeView; B.planBox = planBox;

  var cmds = CAD.commands, AL = CAD.aliases;
  function cmd(name, al, fn) { cmds[name] = { fn: fn }; (al || []).forEach(function (a) { AL[a] = name; }); }

  cmd("ELEVATION", ["EL", "ELEV"], async function (ed) {
    if (!hasModel(ed)) throw new Error("Draw walls, slabs or a roof first — the elevation is made from the 3D model.");
    var k = await ed.getKw("Which elevation?", ["Front", "Back", "Left", "Right", "All"], "Front"), list = k === "All" ? Object.keys(DIRS) : [k], N = scaleOf(ed.doc.d), pb = planBox(ed), made = 0;
    ensureLayers(ed); var x = pb ? pb[0] : 0, yTop = pb ? pb[1] - 15 * N : 0;
    for (var i = 0; i < list.length; i++) {
      var name = "EL-" + list[i], had = insertsOf(ed, name).length, v = makeView(ed, name, N); if (!v) continue; made++;
      if (!had) { var p = list.length === 1 ? await ed.getPoint("Click where the " + list[i].toLowerCase() + " elevation goes (its lower-left corner), or press Enter to put it below the plan", { allowNone: true }) : null;
        var ll = p && p.length ? p : [x, yTop - (v.bb[3] - v.bb[1])]; ed.doc.add({ t: "insert", block: name, p: [ll[0] - v.bb[0], ll[1] - v.bb[1]], sx: 1, sy: 1, rot: 0, layer: "A-ELEV" }); x = ll[0] + (v.bb[2] - v.bb[0]) + 15 * N; }
    }
    ed.say(made ? made + " elevation(s) drawn from the model at 1:" + N + ". After changing the model, run VIEWSUPDATE to redraw them." : "Nothing to draw."); if (ed.zoomExtents && made) ed.zoomExtents();
  });

  cmd("SECTION", ["SEC", "SECT"], async function (ed) {
    if (!hasModel(ed)) throw new Error("Draw the building first — the section is cut from the 3D model.");
    var a = await ed.getPoint("Section line: click its first point on the plan"), b = await ed.getPoint("Second point of the section line", { base: a }); if (G.dist(a, b) < 10) return;
    var side = await ed.getKw("Look towards which side of the line (walking from the first point to the second)?", ["Left", "Right"], "Left"); if (side === "Right") { var t = a; a = b; b = t; }
    var bs = CAD.clone(B.ensure(ed.doc.d)), used = (bs.sections || []).map(function (s) { return s.id; }), id = "ABCDEFGHJKLMNPQRSTUVWXYZ".split("").filter(function (c) { return used.indexOf(c) < 0; })[0] || "S" + (used.length + 1);
    bs.sections = (bs.sections || []).concat([{ id: id, a: a, b: b }]); ed.doc.set("bim", bs); ensureLayers(ed);
    var N = scaleOf(ed.doc.d), u = G.norm(G.sub(b, a)), nrm = [-u[1], u[0]], h = 3.5 * N, mk = function (o) { ed.doc.add(Object.assign({ layer: "A-SECT-MARK", sec: id }, o)); };
    mk({ t: "line", a: G.sub(a, G.mul(u, 6 * N)), b: G.add(b, G.mul(u, 6 * N)) });
    [G.sub(a, G.mul(u, 6 * N)), G.add(b, G.mul(u, 6 * N))].forEach(function (p) { var tip = G.add(p, G.mul(nrm, 7 * N)); mk({ t: "line", a: p, b: tip, lt: "CONTINUOUS" }); mk({ t: "line", a: tip, b: G.add(tip, G.add(G.mul(nrm, -2.5 * N), G.mul(u, 1.2 * N))), lt: "CONTINUOUS" }); mk({ t: "line", a: tip, b: G.add(tip, G.add(G.mul(nrm, -2.5 * N), G.mul(u, -1.2 * N))), lt: "CONTINUOUS" }); mk({ t: "text", p: G.add(tip, [-h * 0.3, N]), s: id, h: h, rot: 0, al: "l" }); });
    var name = "SEC-" + id, v = makeView(ed, name, N); if (!v) { ed.say("The section line does not cut anything."); return; }
    var pb = planBox(ed), p = await ed.getPoint("Click where section " + id + " goes (its lower-left corner), or press Enter to put it beside the plan", { allowNone: true }), ll = p && p.length ? p : [pb[2] + 15 * N, pb[3] - (v.bb[3] - v.bb[1])];
    ed.doc.add({ t: "insert", block: name, p: [ll[0] - v.bb[0], ll[1] - v.bb[1]], sx: 1, sy: 1, rot: 0, layer: "A-ELEV" });
    ed.say("Section " + id + "-" + id + " drawn at 1:" + N + ". Cut parts are in thick lines. Erase the section line to remove it; VIEWSUPDATE redraws after changes."); if (ed.zoomExtents) ed.zoomExtents();
  });

  cmd("VIEWSUPDATE", ["VU"], async function (ed) {
    var d = ed.doc.d, names = Object.keys(d.blocks).filter(isViewBlock).filter(function (n) { return insertsOf(ed, n).length; }), N = scaleOf(d), n = 0;
    if (!names.length) { ed.say("No elevations or sections in this drawing yet. Use ELEVATION, SECTION or SHEET."); return; }
    ensureLayers(ed); pruneSections(ed); names = names.filter(function (n2) { return insertsOf(ed, n2).length; }); names.forEach(function (nm) { if (makeView(ed, nm, N)) n++; }); ed.say(n + " view(s) redrawn from the model.");
  });

  cmd("SHEET", ["LAYOUT", "SHT"], async function (ed) {
    if (!hasModel(ed)) throw new Error("Draw the building first — the sheet is put together from the plan and the 3D model.");
    var d = ed.doc.d, paper = await ed.getKw("Paper size", Object.keys(CAD.PAPER), (d.sheet && d.sheet.size) || "A3"), what = await ed.getKw("Views on the sheet", ["Standard", "AllElevations"], "Standard");
    ensureLayers(ed); pruneSections(ed); d = ed.doc.d;
    var views = (what === "AllElevations" ? ["Front", "Right", "Back", "Left"] : ["Front", "Right"]).map(function (k) { return "EL-" + k; }), secs = ((B.ensure(d).sections) || []).map(function (s) { return "SEC-" + s.id; });
    ed.doc.d.ents.filter(function (e) { return (e.t === "insert" && isViewBlock(e.block)) || e.layer === "A-SHEET"; }).forEach(function (e) { ed.doc.del(e.id); });
    var pb = planBox(ed); if (!pb) throw new Error("Nothing to put on a sheet.");
    var pp = CAD.PAPER[paper], aw = pp[0] - 20, ah = pp[1] - 20 - 28, cache = {}, STD = CAD.STD_SCALES.filter(function (s) { return s >= 20; }), pick = null;
    for (var si = 0; si < STD.length && !pick; si++) {
      var N = STD[si], gap = 12 * N, availW = (aw - 10) * N, availH = (ah - 10) * N, vs = views.map(function (n) { return makeView(ed, n, N, cache); }).filter(Boolean), ss = secs.map(function (n) { return makeView(ed, n, N, cache); }).filter(Boolean), place = [], T = pb.slice();
      var ngl = B.ensure(ed.doc.d).ngl || 0, Lx = Math.min(pb[0], vs.length ? vs[0].bb[0] : pb[0]), Rx = Lx + availW, flow = [], sx = pb[2] + gap;
      /* sections beside the plan while they fit, the rest flow with the elevations */
      ss.forEach(function (v) { var wv = v.bb[2] - v.bb[0]; if (sx + wv <= Rx && v.bb[3] - v.bb[1] <= Math.max(pb[3] - pb[1], availH * 0.6)) { var p = [sx - v.bb[0], pb[3] - v.bb[3]]; place.push({ n: v.name, p: p }); G.ext(T, [p[0] + v.bb[0], p[1] + v.bb[1]]); G.ext(T, [p[0] + v.bb[2], p[1] + v.bb[3]]); sx += wv + gap; } else flow.push(v); });
      flow = vs.concat(flow);
      var yTop = T[1] - gap, cur = Lx, row = [], first = true;
      var flush = function () { if (!row.length) return; var above = Math.max.apply(null, row.map(function (r) { return r.v.bb[3] - ngl; })), y = yTop - above - ngl, bot = Infinity; row.forEach(function (r) { place.push({ n: r.v.name, p: [r.px, y] }); G.ext(T, [r.px + r.v.bb[0], y + r.v.bb[1]]); G.ext(T, [r.px + r.v.bb[2], y + r.v.bb[3]]); bot = Math.min(bot, y + r.v.bb[1]); }); yTop = bot - gap; row = []; cur = Lx; };
      flow.forEach(function (v) { var wv = v.bb[2] - v.bb[0], px; if (first && v === vs[0]) { px = 0; cur = v.bb[2] + gap; } else { if (row.length && cur + wv > Rx) flush(); px = cur - v.bb[0]; cur += wv + gap; } first = false; row.push({ v: v, px: px }); });
      flush();
      if ((T[2] - T[0]) <= availW && (T[3] - T[1]) <= availH || si === STD.length - 1) pick = { N: N, place: place, T: T };
    }
    var N2 = pick.N, cx = (pick.T[0] + pick.T[2]) / 2, cy = (pick.T[1] + pick.T[3]) / 2, rect = [cx - aw * N2 / 2, cy - ah * N2 / 2, cx + aw * N2 / 2, cy + ah * N2 / 2];
    pick.place.forEach(function (q) { ed.doc.add({ t: "insert", block: q.n, p: q.p, sx: 1, sy: 1, rot: 0, layer: "A-ELEV" }); });
    ed.doc.add({ t: "pline", pts: [[rect[0], rect[1], 0], [rect[2], rect[1], 0], [rect[2], rect[3], 0], [rect[0], rect[3], 0]], closed: true, layer: "A-SHEET" });
    ed.doc.add({ t: "text", p: [rect[0], rect[1] - 6 * N2], s: "Sheet " + paper + " landscape · 1 : " + N2 + "   —   File ▾ → Plot PDF sheet → What to plot: Sheet layout", h: 3 * N2, rot: 0, al: "l", layer: "A-SHEET" });
    ed.doc.set("layouts", [{ id: "S1", paper: paper, scale: N2, land: true, rect: rect }]); ed.doc.set("sheet", Object.assign({}, d.sheet, { size: paper, scale: N2 }));
    ed.say("Sheet ready: plan" + (pick.place.length ? " + " + pick.place.length + " view(s)" : "") + " on " + paper + " at 1:" + N2 + ". Print it from File ▾ → Plot PDF sheet → Sheet layout."); if (ed.zoomExtents) ed.zoomExtents();
  });
})();
