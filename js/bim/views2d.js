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
      var su = (pl.u[0] * ux + pl.u[1] * uy) >= 0 ? 1 : -1, hs = (o.swing === "r" ? 1 : -1) * su, opens = o.t === "door" ? !/slid|roll|shutter|fold/i.test(String(o.kind || "") + " " + String(o.preset || "")) : /^(win|casement)/.test(String(o.kind || "win")), two = /double|casement2/.test(String(o.kind || ""));
      tags.push({ u: Math.round(cU * 1000), v: Math.round(zb2 + o.h), s: (o.t === "door" ? "D " : "W ") + Math.round(o.w) + " × " + Math.round(o.h), sw: opens ? { u0: Math.round(cU * 1000 - o.w / 2), u1: Math.round(cU * 1000 + o.w / 2), v0: Math.round(zb2), v1: Math.round(zb2 + o.h - B.archSp(o) / Math.max(1, o.w) * 0), hs: hs, two: two } : null }); });
    /* finish marks: a wall painted on its own (not the finish of all outer walls) is named on the elevation it faces */
    var ownFin = 0;
    if (!sect) { var cxW = 0, cyW = 0, nW2 = 0; doc.d.ents.forEach(function (w) { if (w.t === "wall") { cxW += w.a[0] + w.b[0]; cyW += w.a[1] + w.b[1]; nW2 += 2; } });
      if (nW2) doc.d.ents.forEach(function (w) { if (w.t !== "wall" || !w.a || !w.b) return; var Lw = G.dist(w.a, w.b); if (Lw < 600) return; var uu = [(w.b[0] - w.a[0]) / Lw, (w.b[1] - w.a[1]) / Lw]; if (Math.abs(uu[0] * dv[0] + uu[1] * dv[1]) > 0.2) return;
        var mid = G.mid(w.a, w.b), nn = [-uu[1], uu[0]], outw = ((mid[0] - cxW / nW2) * nn[0] + (mid[1] - cyW / nW2) * nn[1]) >= 0 ? 1 : -1, facesOut = (nn[0] * outw * dv[0] + nn[1] * outw * dv[1]) < 0, useO = w.ext && facesOut, lk = useO ? w.lookO : w.lookI, cl = useO ? w.colO : w.colI; if (!lk && !cl) return;
        var Lv = B.level(doc.d, w.lvl), zb3 = (Lv ? Lv.elev : 0) + (w.base || 0), hW = w.h != null ? w.h : (Lv ? Lv.h : 3000), cU = (mid[0] * ux + mid[1] * uy) / 1000, cV = (zb3 + hW * 0.82) / 1000, cD = (mid[0] * dv[0] + mid[1] * dv[1]) / 1000 - (w.th || 230) / 2000, px = Math.floor((cU - u0) / s), py = Math.floor((cV - v0) / s); if (px < 0 || py < 0 || px >= W || py >= H) return; if (cD > far(px, py) + (w.th || 230) / 1000 + 0.05) return;
        var nmF = lk && B.LOOKS[lk] ? B.LOOKS[lk].n : (cl ? "painted " + cl : ""); if (!nmF) return; tags.push({ u: Math.round(cU * 1000), v: Math.round(zb3 + hW * 0.82), s: "Finish: " + nmF, sw: null }); ownFin++; }); }
    var notes = []; if (!sect) { var nm = function (cat) { var c = B.catLook(doc.d, cat); return c && B.LOOKS[c.l] ? B.LOOKS[c.l].n.replace(/^[A-Za-z ]+ — /, function (m0) { return m0; }) : ""; }, hasRoof = doc.d.ents.some(function (e) { return e.t === "roof"; }), rk = hasRoof ? (function () { var r = doc.d.ents.filter(function (e) { return e.t === "roof"; })[0]; return r.mat === "tile" ? "roof_tile" : r.mat === "rcc" || r.kind === "flat" ? "roof_rcc" : "roof_sheet"; })() : null;
      [[ownFin ? "Outer walls (where not marked)" : "Outer walls", "wall_ext"], ["Roof", rk], ["Windows", "win_frame"], ["Doors", "door"]].forEach(function (q) { if (!q[1]) return; var t = nm(q[1]); if (t) notes.push(q[0] + ": " + t); }); }
    var ext = [Infinity, Infinity, -Infinity, -Infinity]; lines.forEach(function (L) { G.ext(ext, L.a); G.ext(ext, L.b); });
    if (!isFinite(ext[0])) return null;
    return { lines: lines, fills: fills, tags: tags, notes: notes, ext: ext, ngl: ngl, levels: bs.levels.map(function (l) { return { name: l.name, elev: l.elev }; }), tris: tris.length / 10 };
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
    (res.tags || []).forEach(function (t) { var w = t.sw; if (!w) return; var mid = (w.v0 + w.v1) / 2, L2 = function (a2, b2) { ents.push({ t: "line", a: a2, b: b2, layer: "A-ELEV-LVL" }); };   /* opening marks: the point of the V is on the hinge side */
      if (w.two) { var um = (w.u0 + w.u1) / 2; L2([w.u0, mid], [um, w.v0]); L2([w.u0, mid], [um, w.v1]); L2([w.u1, mid], [um, w.v0]); L2([w.u1, mid], [um, w.v1]); }
      else { var hu = w.hs < 0 ? w.u0 : w.u1, ou = w.hs < 0 ? w.u1 : w.u0; L2([hu, mid], [ou, w.v0]); L2([hu, mid], [ou, w.v1]); } });
    (res.tags || []).forEach(function (t) { var h2 = 1.8 * N; ents.push({ t: "text", p: [t.u - tw(t.s, h2) / 2, t.v + 0.9 * N], s: t.s, h: h2, rot: 0, al: "l", layer: "A-ELEV-TXT" }); });
    var cx = (x0 + x1) / 2, ty = yb - 16 * N, H1 = 3.5 * N, wt = tw(title, H1);
    ents.push({ t: "text", p: [cx - wt / 2, ty], s: title, h: H1, rot: 0, al: "l", layer: "A-ELEV-TXT" }); ents.push({ t: "line", a: [cx - wt / 2, ty - 1.5 * N], b: [cx + wt / 2, ty - 1.5 * N], layer: "A-ELEV-GL" });
    ents.push({ t: "text", p: [cx - tw("Scale 1 : " + N, th) / 2, ty - 6 * N], s: "Scale 1 : " + N, h: th, rot: 0, al: "l", layer: "A-ELEV-TXT" }); G.ext(bb, [cx - wt / 2, ty - 7 * N]); G.ext(bb, [cx + wt / 2, ty]);
    (res.notes || []).forEach(function (nt, i) { var hn = 2 * N, yy = ty - 11 * N - i * 3.4 * N, wn = tw(nt, hn); ents.push({ t: "text", p: [cx - wn / 2, yy], s: nt, h: hn, rot: 0, al: "l", layer: "A-ELEV-TXT" }); G.ext(bb, [cx - wn / 2, yy - N]); G.ext(bb, [cx + wn / 2, yy]); });
    return { ents: ents, bb: bb };
  };

  function ensureLayers(ed) { var L = ed.doc.d.layers, miss = Object.keys(LAYERS).filter(function (k) { return !L[k]; }); if (!miss.length) return; var Lc = CAD.clone(L); miss.forEach(function (k) { Lc[k] = Object.assign({ on: true, lock: false, frz: false }, LAYERS[k]); }); ed.doc.set("layers", Lc); }
  function scaleOf(d) { return (d.layouts && d.layouts[0] && d.layouts[0].scale) || (d.sheet && d.sheet.scale) || 100; }
  function isViewBlock(n) { return /^(EL|SEC)-/.test(n || ""); }
  function isViewEnt(e) { return (e.t === "insert" && isViewBlock(e.block)) || e.layer === "A-SHEET" || e.layer === "A-SECT-MARK" || !!e.mepsh; }
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

  /* views that keep themselves up to date: a little after the model changes, sections, elevations, details and schedules are made again and folded into the same undo step */
  cmd("VIEWSAUTO", ["AUTOVIEWS", "VIEWSLIVE"], async function (ed) { var bs = CAD.clone(B.ensure(ed.doc.d)); bs.autoViews = !bs.autoViews; ed.doc.begin("Views update by themselves"); ed.doc.set("bim", bs); ed.doc.commit(); ed.say(bs.autoViews ? "On — sections, elevations, details and schedules are now made again by themselves about a second after the building changes (one Undo takes back the change and the view together). On a large drawing this can make editing slower; run this again to turn it off." : "Off — views change only when you press Update views."); });
  (function () { var tv = null, last = null;
    var touches = function (tx) { return tx.ops.some(function (op) { return [op.e, op.before, op.after].some(function (x) { return x && B.TYPES[x.t]; }); }); };
    var run = function (ed, tries) { var doc = ed.doc, d = doc.d; if (!d.bim || !d.bim.autoViews) return; if (doc.tx) { if (tries < 6) tv = setTimeout(function () { run(ed, tries + 1); }, 1500); return; }
      var top = doc.undoS[doc.undoS.length - 1]; if (!top || top === last || doc.redoS.length) return; last = top; if (top.label === "Update views" || !touches(top)) return;
      var n0 = doc.undoS.length; try { B.refreshViews(ed); } catch (er) { if (window.console) console.warn("views not updated", er); return; }
      if (doc.undoS.length === n0 + 1 && doc.undoS[n0 - 1] === top) { var v = doc.undoS.pop(); doc.undoS.pop(); var merged = { label: top.label, ops: top.ops.concat(v.ops) }; doc.undoS.push(merged); last = merged; } else last = doc.undoS[doc.undoS.length - 1]; };
    B.autoViewsHook = function (ed) { if (!ed.doc.d.bim || !ed.doc.d.bim.autoViews) return; clearTimeout(tv); tv = setTimeout(function () { run(ed, 0); }, 1100); }; })();
  cmd("VIEWSUPDATE", ["VU"], async function (ed) {
    var d = ed.doc.d, names = Object.keys(d.blocks).filter(isViewBlock).filter(function (n) { return insertsOf(ed, n).length; }), N = scaleOf(d), n = 0;
    var nd = 0, ns = 0; ed.doc.begin("Update views"); try { nd = B.refreshDetails ? B.refreshDetails(ed) : 0; SCH_KINDS.forEach(function (w) { if (insertsOf(ed, "SCH-" + w).length && makeSchedule(ed, w, N)) ns++; }); } finally { ed.doc.commit(); }
    if (!names.length) { ed.say(nd || ns ? (nd ? nd + " detail view(s) " : "") + (nd && ns ? "and " : "") + (ns ? ns + " schedule(s) " : "") + "brought up to date." : "No elevations, sections, details or schedules in this drawing yet. Use ELEVATION, SECTION, SHEET, DETAILVIEW or SCHEDULE."); return; }
    ensureLayers(ed); pruneSections(ed); names = names.filter(function (n2) { return insertsOf(ed, n2).length; }); names.forEach(function (nm) { if (makeView(ed, nm, N)) n++; }); ed.say(n + " view(s) redrawn from the model" + (nd ? ", " + nd + " detail view(s)" : "") + (ns ? ", " + ns + " schedule(s)" : "") + ".");
  });

  /* regenerate every placed view (used before plotting, so a sheet never prints an out-of-date elevation) */
  B.refreshViews = function (ed) { var d = ed.doc.d, names = Object.keys(d.blocks || {}).filter(isViewBlock).filter(function (n) { return insertsOf(ed, n).length; }), hasDet = d.ents.some(function (e) { return e.t === "insert" && e.det; }), hasSch = Object.keys(d.blocks || {}).some(function (k) { return /^SCH-/.test(k) && insertsOf(ed, k).length; }); if (!names.length && !hasDet && !hasSch) return 0; var N = scaleOf(d), n = 0; ed.doc.begin("Update views"); try { ensureLayers(ed); names.forEach(function (nm) { if (makeView(ed, nm, N)) n++; }); if (Object.keys(d.blocks).some(function (k) { return /^SCH-/.test(k) && insertsOf(ed, k).length; })) SCH_KINDS.forEach(function (w) { if (insertsOf(ed, "SCH-" + w).length) makeSchedule(ed, w, N); }); if (hasDet) n += B.refreshDetails(ed); } finally { ed.doc.commit(); } return n; };

  /* ---------- schedules as tables: doors / windows, room finishes ---------- */
  function table(title, heads, rows, widths, N) {
    var th = 2.5 * N, rh = 6 * N, ents = [], W = widths.reduce(function (a, b) { return a + b; }, 0) * N, y = 0, L = "A-SCHED";
    ents.push({ t: "text", p: [0, 2 * N], s: title, h: 3.5 * N, rot: 0, al: "l", layer: L });
    var all = [heads].concat(rows), H = all.length * rh; for (var i = 0; i <= all.length; i++) ents.push({ t: "line", a: [0, -i * rh], b: [W, -i * rh], layer: L });
    var x = 0; ents.push({ t: "line", a: [0, 0], b: [0, -H], layer: L }); widths.forEach(function (w) { x += w * N; ents.push({ t: "line", a: [x, 0], b: [x, -H], layer: L }); });
    all.forEach(function (r, ri) { var cx = 0; r.forEach(function (c, ci) { ents.push({ t: "text", p: [cx + 1.5 * N, -(ri + 1) * rh + 1.8 * N], s: String(c == null ? "" : c).slice(0, Math.floor(widths[ci] / 1.5)), h: th, rot: 0, al: "l", layer: L }); cx += widths[ci] * N; }); });
    return { ents: ents, bb: [0, -H, W, 6 * N] };
  }
  var SCH_KINDS = B.SCH_KINDS = ["Doors", "Rooms", "Columns", "Beams", "Walls", "Sheets", "Electrical", "Plumbing"];
  function makeSchedule(ed, what, N) {
    var d = ed.doc.d, doc = ed.doc, T;
    /* schedules added by other files (mep.js: Electrical, Plumbing) */
    if (B.SCH_EXTRA && B.SCH_EXTRA[what]) { T = B.SCH_EXTRA[what](ed, N, table); if (!T) return null; var Bx = Object.assign({}, ed.doc.d.blocks); Bx["SCH-" + what] = { base: [0, 0], ents: T.ents }; ed.doc.set("blocks", Bx); return T; }
    if (what === "Electrical" || what === "Plumbing" || what === "Single line" || what === "Isometric") return null;
    if (what === "Columns" || what === "Beams" || what === "Walls" || what === "Sheets") { var gg = {}, oo = [], add = function (k, row, q) { if (!gg[k]) { gg[k] = { row: row, n: 0, q: 0 }; oo.push(k); } gg[k].n++; gg[k].q += q || 0; }, mm2 = function (v) { return (v / 1000).toFixed(2); };
      if (what === "Columns") { d.ents.forEach(function (o) { if (o.t !== "column") return; var Lv = B.level(d, o.lvl), cs = B.colSection(o), H = o.h != null ? o.h : (Lv ? Lv.h : 3000); add([o.lvl, cs.label, Math.round(H)].join("|"), [Lv ? Lv.name : "", cs.label, mm2(H)], cs.A * H / 1e9); });
        if (!oo.length) return null; var cn = 0; T = table("COLUMN SCHEDULE", ["Mark", "Level", "Section (mm)", "Height (m)", "Nos", "Concrete (cum)"], oo.map(function (k) { var g2 = gg[k]; return ["C" + (++cn)].concat(g2.row, [g2.n, g2.q.toFixed(2)]); }), [14, 30, 40, 22, 12, 28], N); }
      else if (what === "Beams") { var bsl = B.ensure(d).slabTh || 0; d.ents.forEach(function (o) { if (o.t !== "beam") return; var Lv = B.level(d, o.lvl), L = G.dist(o.a, o.b); add([o.lvl, Math.round(o.w), Math.round(o.d)].join("|"), [Lv ? Lv.name : "", Math.round(o.w) + " × " + Math.round(o.d)], L); gg[[o.lvl, Math.round(o.w), Math.round(o.d)].join("|")].v = (gg[[o.lvl, Math.round(o.w), Math.round(o.d)].join("|")].v || 0) + L * o.w * Math.max(0, o.d - bsl) / 1e9; });
        if (!oo.length) return null; var bn = 0; T = table("BEAM SCHEDULE", ["Mark", "Level", "Size W × D (mm)", "Nos", "Total length (m)", "Concrete below slab (cum)"], oo.map(function (k) { var g2 = gg[k]; return ["B" + (++bn)].concat(g2.row, [g2.n, mm2(g2.q), (g2.v || 0).toFixed(2)]); }), [14, 30, 36, 12, 30, 44], N); }
      else if (what === "Walls") { d.ents.forEach(function (o) { if (o.t !== "wall") return; var Lv = B.level(d, o.lvl), H = B.wallH(doc, o), L = G.dist(o.a, o.b), LI = o.lookI && B.LOOKS[o.lookI] ? B.LOOKS[o.lookI].n : "default", LO = o.ext ? (o.lookO && B.LOOKS[o.lookO] ? B.LOOKS[o.lookO].n : "default") : "-"; add([o.lvl, Math.round(o.th), o.ext ? 1 : 0, o.mat || "", LI, LO].join("|"), [Lv ? Lv.name : "", Math.round(o.th) + " mm" + (o.mat ? " " + o.mat : ""), o.ext ? "Outer" : "Inner", LI, LO], L); gg[[o.lvl, Math.round(o.th), o.ext ? 1 : 0, o.mat || "", LI, LO].join("|")].v = (gg[[o.lvl, Math.round(o.th), o.ext ? 1 : 0, o.mat || "", LI, LO].join("|")].v || 0) + L * H / 1e6; });
        if (!oo.length) return null; var wn2 = 0; T = table("WALL SCHEDULE", ["Type", "Level", "Wall", "Position", "Inside finish", "Outside finish", "Length (m)", "Face area (sqm)"], oo.map(function (k) { var g2 = gg[k]; return ["W" + String.fromCharCode(65 + (wn2++ % 26))].concat(g2.row, [mm2(g2.q), (g2.v || 0).toFixed(1)]); }), [12, 26, 30, 18, 40, 40, 22, 28], N); }
      else { var SH = B.sheets ? B.sheets(ed) : []; if (!SH.length) return null; T = table("LIST OF SHEETS", ["Sheet", "Drawing no.", "Title", "Paper", "Scale"], SH.map(function (l, i) { return [l.id.replace(/^S/, ""), l.number || ("A-" + (i + 1 < 10 ? "0" : "") + (i + 1)), l.title || (l.id === "S1" ? "Plan, elevations and sections" : ""), l.paper + (l.land === false ? " portrait" : " landscape"), "1 : " + l.scale]; }), [14, 26, 70, 34, 20], N); }
      var Bl0 = Object.assign({}, ed.doc.d.blocks); Bl0["SCH-" + what] = { base: [0, 0], ents: T.ents }; ed.doc.set("blocks", Bl0); return T; }
    if (what === "Doors") { var g = {}, order = []; d.ents.forEach(function (o) { if (o.t !== "door" && o.t !== "window") return; if (!B.hostOf(doc, o)) return; var k = [o.t, Math.round(o.w), Math.round(o.h), o.t === "window" ? Math.round(o.sill || 0) : 0, o.kind || "", o.style || "", o.head || "", o.mat || ""].join("|"); if (!g[k]) { g[k] = { o: o, n: 0 }; order.push(k); } g[k].n++; });
      var dn = 0, wn = 0, SN = { "": "flush", groove: "flush, grooves", vgroove: "flush, grooves", panel: "panelled", panel6: "6 panels", carved: "main door", vision: "glass strip", halfglass: "half glass", glass: "glazed", louvre: "louvred", jali: "jali", grill: "grill" };
      order.sort(function (a, b) { return (g[a].o.t === g[b].o.t ? 0 : g[a].o.t === "door" ? -1 : 1) || g[b].o.w - g[a].o.w; });
      var rows = order.map(function (k) { var o = g[k].o, isD = o.t === "door"; return [(isD ? "D" + (++dn) : "W" + (++wn)), isD ? "Door" : "Window", Math.round(o.w) + " × " + Math.round(o.h), isD ? "-" : String(Math.round(o.sill || 0)), g[k].n, [isD ? (o.kind || "single") : ({ win: "openable", sliding: "sliding", fixed: "fixed glass", louvre: "louvred", grill: "with grill", casement2: "two shutters" }[o.kind] || o.kind || ""), isD ? (SN[o.style || ""] || o.style) : "", o.head === "arch" ? "round arch" : o.head === "seg" ? "flat arch" : o.head === "point" ? "pointed arch" : "", o.mat || ""].filter(Boolean).join(", ")]; });
      if (!rows.length) return null; T = table("DOOR AND WINDOW SCHEDULE", ["Mark", "Type", "Size W × H (mm)", "Sill (mm)", "Nos", "Description"], rows, [14, 20, 36, 20, 12, 70], N); }
    else { var FL = { vitrified: "Vitrified tiles", ceramic: "Ceramic tiles", kota: "Kota stone", granite: "Granite", ips: "IPS / CC" }, CD = { tray: "tray", double: "double step", island: "island", border: "border" };
      var rr = d.ents.filter(function (r) { return r.t === "room"; }).map(function (r) { var Lv = B.level(d, r.lvl); return [r.name || "Room", Lv ? Lv.name : "", (B.area(r.pts) / 1e6).toFixed(2), (G.segsLength(G.polySegs(r.pts, true)) / 1000).toFixed(2), FL[r.floor] || (r.floor ? r.floor : "-"), r.skirt ? String(r.skirt) : "-", r.ceil ? "Yes" + (r.cdes ? ", " + (CD[r.cdes] || r.cdes) : "") : "-"]; });
      if (!rr.length) return null; T = table("ROOM FINISH SCHEDULE", ["Room", "Level", "Area (sqm)", "Perimeter (m)", "Floor finish", "Skirting (mm)", "False ceiling"], rr, [36, 26, 22, 26, 34, 24, 34], N); }
    var Bl = Object.assign({}, ed.doc.d.blocks); Bl["SCH-" + what] = { base: [0, 0], ents: T.ents }; ed.doc.set("blocks", Bl); return T;
  }
  B.makeSchedule = makeSchedule;
  LAYERS["A-SCHED"] = { color: 7, lw: 0.18, lt: "CONTINUOUS" }; LAYERS["A-SYMB"] = { color: 7, lw: 0.25, lt: "CONTINUOUS" };
  cmd("SCHEDULE", ["SCH", "DOORSCHEDULE", "ROOMSCHEDULE"], async function (ed) {
    var w = await ed.getKw("Which schedule?", SCH_KINDS, ed.schKind || "Doors"), N = scaleOf(ed.doc.d); ed.schKind = w; ensureLayers(ed); var T = makeSchedule(ed, w, N);
    if (!T) { ed.say({ Doors: "No doors or windows in the model yet.", Rooms: "No rooms yet — use Room inside each room first.", Columns: "No columns in the model yet.", Beams: "No beams in the model yet.", Walls: "No walls in the model yet.", Sheets: "No sheets yet — use Sheet or Add sheet first.", Electrical: "No electrical items yet.", Plumbing: "No plumbing items yet." }[w] || "Nothing to show yet."); return; }
    if (insertsOf(ed, "SCH-" + w).length) { ed.say("The schedule on the drawing was brought up to date."); return; }
    var pb = planBox(ed), p = await ed.getPoint("Click where the table goes (its top-left corner), or press Enter to put it beside the drawing", { allowNone: true }), tl = p && p.length ? p : [pb ? pb[2] + 15 * N : 0, pb ? pb[3] : 0];
    ed.doc.add({ t: "insert", block: "SCH-" + w, p: [tl[0], tl[1] - 6 * N], sx: 1, sy: 1, rot: 0, layer: "A-SCHED" });
    ed.say(({ Doors: "Door and window", Rooms: "Room finish", Columns: "Column", Beams: "Beam", Walls: "Wall", Sheets: "Sheet list —", Electrical: "Electrical legend and DB", Plumbing: "Plumbing legend and pipe", "Single line": "Single line diagram —", Isometric: "Plumbing isometric —" })[w] + " schedule placed. Run SCHEDULE again (or Update views) after changes."); if (ed.zoomExtents) ed.zoomExtents();
  });
  cmd("NORTHPOINT", ["NP", "NORTH"], async function (ed) {
    var N = scaleOf(ed.doc.d), bs = B.ensure(ed.doc.d), ang = ((bs.sun && +bs.sun.north) || +bs.north || 0), p = await ed.getPoint("Click where the north point goes"), R = 8 * N, a = (90 - ang) * Math.PI / 180, dir = [Math.cos(a), Math.sin(a)], nr = [-dir[1], dir[0]]; ensureLayers(ed);
    var tip = G.add(p, G.mul(dir, R)), tail = G.sub(p, G.mul(dir, R)), L = "A-SYMB";
    ed.doc.add({ t: "circle", c: p, r: R, layer: L }); ed.doc.add({ t: "line", a: tail, b: tip, layer: L }); ed.doc.add({ t: "line", a: tip, b: G.add(G.sub(tip, G.mul(dir, 5 * N)), G.mul(nr, 2.5 * N)), layer: L }); ed.doc.add({ t: "line", a: tip, b: G.sub(G.sub(tip, G.mul(dir, 5 * N)), G.mul(nr, 2.5 * N)), layer: L });
    ed.doc.add({ t: "text", p: G.add(G.add(p, G.mul(dir, R + 2 * N)), [-1.4 * N, -1.5 * N]), s: "N", h: 4 * N, rot: 0, al: "l", layer: L }); ed.say("North point placed" + (ang ? " (north is " + ang + "° from the top of the drawing, as set in ☀ Sun)." : " — north is up. Set another direction in 3D → ☀ Sun → North."));
  });
  cmd("SCALEBAR", ["SB"], async function (ed) {
    var N = scaleOf(ed.doc.d), p = await ed.getPoint("Click where the scale bar starts"), unit = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 50000].filter(function (u) { return u >= 9 * N; })[0] || 50000, L = "A-SYMB", h = 1.5 * N; ensureLayers(ed);
    for (var i = 0; i < 4; i++) { var x0 = p[0] + i * unit, x1 = x0 + unit; ed.doc.add({ t: "pline", pts: [[x0, p[1], 0], [x1, p[1], 0], [x1, p[1] + h, 0], [x0, p[1] + h, 0]], closed: true, layer: L }); if (i % 2 === 0) ed.doc.add({ t: "hatch", pat: "SOLID", sc: 1, ang: 0, loops: [[[x0, p[1], 0], [x1, p[1], 0], [x1, p[1] + h, 0], [x0, p[1] + h, 0]]], layer: L }); }
    for (var k = 0; k <= 4; k++) { var v = k * unit / 1000, sv = (v % 1 ? v.toFixed(2).replace(/0$/, "") : String(v)) + (k === 4 ? " m" : ""); ed.doc.add({ t: "text", p: [p[0] + k * unit - sv.replace(" m", "").length * 0.7 * N, p[1] + h + 1.2 * N], s: sv, h: 2.5 * N, rot: 0, al: "l", layer: L }); }
    ed.doc.add({ t: "text", p: [p[0], p[1] - 4 * N], s: "Scale 1 : " + N, h: 2.5 * N, rot: 0, al: "l", layer: L }); ed.say("Scale bar for 1:" + N + " placed (" + (unit / 1000) + " m divisions).");
  });

  /* sheets of the drawing: layouts whose frame still exists; the frame's present position wins (it may have been moved) */
  B.sheets = function (ed) { var d = ed.doc.d, out = []; (d.layouts || []).forEach(function (l) { var fr = d.ents.filter(function (e) { return e.layer === "A-SHEET" && e.t === "pline" && (e.sheet === l.id || (!e.sheet && l.id === "S1")); })[0]; if (!fr && l.id !== "S1") return; var r = l.rect; if (fr) { var b = [Infinity, Infinity, -Infinity, -Infinity]; fr.pts.forEach(function (p) { G.ext(b, [p[0], p[1]]); }); r = b; } out.push(Object.assign({}, l, { rect: r })); }); return out; };
  /* a part of the drawing repeated at a larger (or smaller) scale beside it — a snapshot made of plain lines */
  function prims(ed, e, out, M, depth) { var doc = ed.doc, d = doc.d;
    if (e.t === "insert") { var Bk = d.blocks[e.block]; if (!Bk || depth > 6 || /^(DET|SCH)-/.test(e.block)) return; var M2 = G.mMul(M || [1, 0, 0, 1, 0, 0], G.mInsert(e, Bk.base)); Bk.ents.forEach(function (x) { prims(ed, x, out, M2, depth + 1); }); return; }
    if (B.TYPES[e.t]) { var pl; try { pl = B.plan(doc, M ? B.xform(e, M) : e); } catch (er) { return; } if (!pl) return; var conv = function (sg, lt) { var o = sg.k === "L" ? { t: "line", a: [sg.a[0], sg.a[1]], b: [sg.b[0], sg.b[1]] } : sg.full ? { t: "circle", c: [sg.c[0], sg.c[1]], r: sg.r } : { t: "arc", c: [sg.c[0], sg.c[1]], r: sg.r, a1: sg.s * 180 / Math.PI, a2: sg.e * 180 / Math.PI }; if (lt) o.lt = lt; o.layer = e.layer || "0"; out.push(o); };
      (pl.segs || []).forEach(function (sg) { conv(sg); }); (pl.dashed || []).forEach(function (sg) { conv(sg, "DASHED"); }); return; }
    if (e.t === "xline" || e.t === "ray" || e.t === "image") return; var c = CAD.clone(M ? G.xform(e, M) : e); delete c.id; out.push(c); }
  function detEnts(ed, x0, y0, x1, y1) { var d = ed.doc.d;
    var out = []; d.ents.forEach(function (e) { if (!ed.doc.visible(e) || e.layer === "A-SHEET" || e.layer === "A-DETAIL" || (e.t === "insert" && /^(DET|SCH)-/.test(e.block || ""))) return; var bb; try { bb = ed.doc.bbox(e); } catch (er) { return; } if (!bb || !isFinite(bb[0]) || bb[2] < x0 || bb[0] > x1 || bb[3] < y0 || bb[1] > y1) return; prims(ed, e, out, null, 0); });
    var clip = function (p, q) { var t0 = 0, t1 = 1, dx = q[0] - p[0], dy = q[1] - p[1], P = [-dx, dx, -dy, dy], Q = [p[0] - x0, x1 - p[0], p[1] - y0, y1 - p[1]]; for (var i = 0; i < 4; i++) { if (Math.abs(P[i]) < 1e-12) { if (Q[i] < 0) return null; } else { var r = Q[i] / P[i]; if (P[i] < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; } } } return [[p[0] + dx * t0, p[1] + dy * t0], [p[0] + dx * t1, p[1] + dy * t1]]; };
    var kept = []; out.forEach(function (e) {   /* lines and straight polylines are cut at the window; other things stay whole if their middle is inside */
      if (e.t === "line") { var c2 = clip(e.a, e.b); if (c2 && G.dist(c2[0], c2[1]) > 0.5) kept.push(Object.assign({}, e, { a: c2[0], b: c2[1] })); return; }
      if (e.t === "pline" && e.pts && !e.pts.some(function (q) { return q[2]; })) { var n = e.pts.length, m2 = e.closed ? n : n - 1; for (var i = 0; i < m2; i++) { var c3 = clip(e.pts[i], e.pts[(i + 1) % n]); if (c3 && G.dist(c3[0], c3[1]) > 0.5) kept.push({ t: "line", a: c3[0], b: c3[1], layer: e.layer, color: e.color, lt: e.lt }); } return; }
      var bb; try { bb = G.bbox(e, d.blocks); } catch (er) { return; } if (!bb || !isFinite(bb[0])) return; var mx = (bb[0] + bb[2]) / 2, my = (bb[1] + bb[3]) / 2; if (mx >= x0 && mx <= x1 && my >= y0 && my <= y1) kept.push(e); }); out = kept;
    return out; }
  B.refreshDetails = function (ed) { var n = 0, Bl = null; ed.doc.d.ents.forEach(function (e) { if (e.t !== "insert" || !e.det || !/^DET-/.test(e.block || "")) return; var w = e.det, out = detEnts(ed, w[0], w[1], w[2], w[3]); if (!out.length) return; Bl = Bl || Object.assign({}, ed.doc.d.blocks); Bl[e.block] = { base: [(w[0] + w[2]) / 2, (w[1] + w[3]) / 2], ents: out }; n++; }); if (Bl) ed.doc.set("blocks", Bl); return n; };
  cmd("DETAILVIEW", ["DETAIL", "ENLARGE", "BLOWUP"], async function (ed) {
    ensureLayers(ed); var d = ed.doc.d, N = scaleOf(d), a = await ed.getPoint("Detail — first corner of the part to repeat"); ed.preview = function (q) { return [{ t: "pline", pts: [[a[0], a[1], 0], [q[0], a[1], 0], [q[0], q[1], 0], [a[0], q[1], 0]], closed: true }]; };
    var b = await ed.getPoint("Opposite corner", { base: a }); ed.preview = null; var x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]); if (x1 - x0 < 10 || y1 - y0 < 10) return;
    var want = +(await ed.getNum("Scale of the detail 1 : ?  (the sheet is 1 : " + N + " — 50, 25, 20 or 10 make it larger)", { def: ed.detN || Math.max(1, Math.round(N / 2)) })); if (!(want >= 1)) return; ed.detN = want; var k = N / want;
    var out = detEnts(ed, x0, y0, x1, y1);
    if (!out.length) throw new Error("Nothing inside that window.");
    var w = (x1 - x0) * k, h = (y1 - y0) * k; ed.preview = function (q) { return [{ t: "pline", pts: [[q[0] - w / 2, q[1] - h / 2, 0], [q[0] + w / 2, q[1] - h / 2, 0], [q[0] + w / 2, q[1] + h / 2, 0], [q[0] - w / 2, q[1] + h / 2, 0]], closed: true }]; };
    var c = await ed.getPoint("Click where the detail goes (its centre)"); ed.preview = null; if (!c) return;
    var used = Object.keys(d.blocks || {}).filter(function (n) { return /^DET-/.test(n); }).length, mark = String.fromCharCode(65 + (used % 26)), name = "DET-" + mark + (used >= 26 ? used : ""), Ls = ed.doc.d.layers; ed.doc.begin("Detail view");
    if (!Ls["A-DETAIL"]) { var Lc = CAD.clone(Ls); Lc["A-DETAIL"] = { color: 6, lw: 0.25, lt: "DASHED", on: true, lock: false, frz: false }; ed.doc.set("layers", Lc); }
    var Bl = Object.assign({}, ed.doc.d.blocks); Bl[name] = { base: [(x0 + x1) / 2, (y0 + y1) / 2], ents: out }; ed.doc.set("blocks", Bl);
    ed.doc.add({ t: "insert", block: name, p: [c[0], c[1]], sx: k, sy: k, rot: 0, layer: "0", det: [x0, y0, x1, y1] });
    ed.doc.add({ t: "pline", pts: [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], closed: true, layer: "A-DETAIL" }); ed.doc.add({ t: "text", p: [x0, y1 + 1.5 * N], s: mark, h: 3.5 * N, rot: 0, al: "l", layer: "A-DETAIL", st: "b" });
    ed.doc.add({ t: "pline", pts: [[c[0] - w / 2, c[1] - h / 2, 0], [c[0] + w / 2, c[1] - h / 2, 0], [c[0] + w / 2, c[1] + h / 2, 0], [c[0] - w / 2, c[1] + h / 2, 0]], closed: true, layer: "A-DETAIL" });
    ed.doc.add({ t: "text", p: [c[0], c[1] - h / 2 - 6 * N], s: "DETAIL " + mark, h: 3.5 * N, rot: 0, al: "c", layer: "A-ELEV-TXT", st: "b" }); ed.doc.add({ t: "text", p: [c[0], c[1] - h / 2 - 10.5 * N], s: "Scale 1 : " + want, h: 2.5 * N, rot: 0, al: "c", layer: "A-ELEV-TXT" });
    ed.doc.commit(); ed.say("Detail " + mark + " placed at 1:" + want + " (" + (k >= 1 ? k.toFixed(k % 1 ? 1 : 0) + " times larger" : "smaller") + " than the sheet's 1:" + N + "). It is brought up to date by Update views and before every plot. Lines are cut at the window edge. Dimensions inside it show the enlarged size: dimension the original, not the detail.");
  });
  cmd("SHEETADD", ["ADDSHEET", "NEWSHEET", "SHEETFRAME"], async function (ed) {
    ensureLayers(ed); var d = ed.doc.d, paper = await ed.getKw("Paper size of the new sheet", Object.keys(CAD.PAPER), ed.shPaper || (d.sheet && d.sheet.size) || "A3"); ed.shPaper = paper;
    var ori = await ed.getKw("Sheet", ["Landscape", "Portrait"], ed.sheetOri || "Landscape"), land = ori !== "Portrait"; ed.sheetOri = ori;
    var N = +(await ed.getNum("Scale 1 : ?  (50 for details, 100 for plans, 200 for site plans)", { def: ed.shScale || scaleOf(d) })); if (!(N >= 1)) throw new Error("The scale must be 1 or more."); ed.shScale = N;
    var pp = land ? CAD.PAPER[paper] : [CAD.PAPER[paper][1], CAD.PAPER[paper][0]], w = (pp[0] - 20) * N, h = (pp[1] - 20 - 28) * N, fr = function (c) { return [[c[0] - w / 2, c[1] - h / 2, 0], [c[0] + w / 2, c[1] - h / 2, 0], [c[0] + w / 2, c[1] + h / 2, 0], [c[0] - w / 2, c[1] + h / 2, 0]]; };
    ed.preview = function (q) { return [{ t: "pline", pts: fr(q), closed: true }]; };
    var c = await ed.getPoint("Click the centre of the part this sheet shows (the frame is the printable area at 1:" + N + ")"); ed.preview = null; if (!c) return;
    var title = await ed.getText("Title of this sheet (Enter to skip)", { def: "" }); title = String(title == null ? "" : title).trim();
    var used = (ed.doc.d.layouts || []).map(function (l) { return l.id; }), k = 2; while (used.indexOf("S" + k) >= 0) k++; var id = "S" + k, P = fr(c), rect = [P[0][0], P[0][1], P[2][0], P[2][1]];
    ed.doc.begin("Add sheet"); ed.doc.add({ t: "pline", pts: P, closed: true, layer: "A-SHEET", sheet: id });
    ed.doc.add({ t: "text", sheet: id, p: [rect[0], rect[1] - 6 * N], s: "Sheet " + k + (title ? " - " + title : "") + " · " + paper + (land ? " landscape" : " portrait") + " · 1 : " + N, h: 3 * N, rot: 0, al: "l", layer: "A-SHEET" });
    ed.doc.set("layouts", (ed.doc.d.layouts || []).concat([{ id: id, paper: paper, scale: N, land: land, rect: rect, title: title, number: "A-" + (k < 10 ? "0" : "") + k }])); ed.doc.commit();
    ed.say("Sheet " + k + " added (" + paper + ", 1:" + N + "). Move the frame if needed — it prints where it stands. File ▾ → Plot PDF sheet lists every sheet and can print them all. Erase the frame to remove the sheet.");
  });
  cmd("SHEET", ["LAYOUT", "SHT"], async function (ed) {
    if (!hasModel(ed)) throw new Error("Draw the building first — the sheet is put together from the plan and the 3D model.");
    var d = ed.doc.d, paper = await ed.getKw("Paper size", Object.keys(CAD.PAPER), (d.sheet && d.sheet.size) || "A3"), what = await ed.getKw("Views on the sheet", ["Standard", "AllElevations"], "Standard"); var ori = await ed.getKw("Sheet", ["Landscape", "Portrait"], ed.sheetOri || "Landscape"), land = ori !== "Portrait"; ed.sheetOri = ori;
    ensureLayers(ed); pruneSections(ed); d = ed.doc.d;
    var views = (what === "AllElevations" ? ["Front", "Right", "Back", "Left"] : ["Front", "Right"]).map(function (k) { return "EL-" + k; }), secs = ((B.ensure(d).sections) || []).map(function (s) { return "SEC-" + s.id; });
    ed.doc.d.ents.filter(function (e) { return (e.t === "insert" && isViewBlock(e.block)) || (e.layer === "A-SHEET" && (!e.sheet || e.sheet === "S1")); }).forEach(function (e) { ed.doc.del(e.id); });
    var pb = planBox(ed); if (!pb) throw new Error("Nothing to put on a sheet.");
    var pp = land ? CAD.PAPER[paper] : [CAD.PAPER[paper][1], CAD.PAPER[paper][0]], aw = pp[0] - 20, ah = pp[1] - 20 - 28, cache = {}, STD = CAD.STD_SCALES.filter(function (s) { return s >= 20; }), pick = null;
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
    ed.doc.add({ t: "pline", pts: [[rect[0], rect[1], 0], [rect[2], rect[1], 0], [rect[2], rect[3], 0], [rect[0], rect[3], 0]], closed: true, layer: "A-SHEET", sheet: "S1" });
    ed.doc.add({ sheet: "S1", t: "text", p: [rect[0], rect[1] - 6 * N2], s: "Sheet " + paper + (land ? " landscape" : " portrait") + " · 1 : " + N2 + "   —   File ▾ → Plot PDF sheet → What to plot: Sheet layout", h: 3 * N2, rot: 0, al: "l", layer: "A-SHEET" });
    ed.doc.set("layouts", [{ id: "S1", paper: paper, scale: N2, land: land, rect: rect }].concat((d.layouts || []).filter(function (l) { return l.id !== "S1"; }))); ed.doc.set("sheet", Object.assign({}, d.sheet, { size: paper, scale: N2 }));
    ed.say("Sheet ready: plan" + (pick.place.length ? " + " + pick.place.length + " view(s)" : "") + " on " + paper + " at 1:" + N2 + ". Print it from File ▾ → Plot PDF sheet → Sheet layout."); if (ed.zoomExtents) ed.zoomExtents();
  });
})();
