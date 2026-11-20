/* Estimate Pro BIM — 3D meshes from building elements (positions in metres, z up).
   EP.bim.meshes(doc, opts) → { groups: [{ id, tris: Float32Array (x,y,z,nx,ny,nz,r,g,b,a,id,pattern,size,gloss per vertex — B.VSTRIDE floats), edges: [x1,y1,z1,x2,y2,z2,…] }], bbox } */
(function () {
  "use strict";
  var EP = window.EP, G = EP.geom, B = EP.bim;
  var COL = { brick: [0.71, 0.36, 0.27], block: [0.66, 0.66, 0.64], rcc: [0.74, 0.73, 0.70], stone: [0.58, 0.54, 0.48], slab: [0.80, 0.79, 0.76], col: [0.68, 0.67, 0.64], beam: [0.70, 0.69, 0.66], footing: [0.55, 0.55, 0.52], pcc: [0.64, 0.61, 0.55],
    wood: [0.55, 0.36, 0.18], flush: [0.62, 0.45, 0.27], steel: [0.45, 0.50, 0.56], pvc: [0.88, 0.88, 0.86], al: [0.75, 0.77, 0.80], upvc: [0.95, 0.95, 0.94], glass: [0.62, 0.80, 0.92],
    gi: [0.43, 0.56, 0.64], tile: [0.66, 0.31, 0.18], puf: [0.85, 0.86, 0.88], floor: [0.85, 0.81, 0.72], rail: [0.35, 0.37, 0.40], plaster: [0.93, 0.91, 0.86], stair: [0.78, 0.77, 0.74] };
  B.COL = COL; B.VSTRIDE = 14;
  function Mesh(id) { this.id = id; this.v = []; this.e = []; }
  Mesh.prototype.tri = function (a, b, c, col, alpha) {
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2], nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz); if (l < 1e-12) return;
    nx /= l; ny /= l; nz /= l; var al = alpha == null ? (col.a == null ? 1 : col.a) : alpha, id = this.id, pt = col.p || 0, sz = col.s || 1, gl = col.g || 0;
    [a, b, c].forEach(function (p) { this.v.push(p[0], p[1], p[2], nx, ny, nz, col[0], col[1], col[2], al, id, pt, sz, gl); }, this);
  };
  Mesh.prototype.quad = function (a, b, c, d, col, alpha) { this.tri(a, b, c, col, alpha); this.tri(a, c, d, col, alpha); };
  Mesh.prototype.edge = function (a, b) { this.e.push(a[0], a[1], a[2], b[0], b[1], b[2]); };
  Mesh.prototype.loop = function (P) { for (var i = 0; i < P.length; i++) this.edge(P[i], P[(i + 1) % P.length]); };
  var K = 0.001;   // mm → m
  function v3(p, z) { return [p[0] * K, p[1] * K, z * K]; }
  /* polygon (with holes) at height z, facing up (+1) or down (-1) */
  function cap(M, outer, holes, z, up, col, alpha) {
    var r = EP.earcut(outer, holes || []);
    r.tris.forEach(function (t) { var a = v3(r.pts[t[0]], z), b = v3(r.pts[t[1]], z), c = v3(r.pts[t[2]], z); if (up > 0) M.tri(a, b, c, col, alpha); else M.tri(a, c, b, col, alpha); });
  }
  function ccw(P) { var a = 0; for (var i = 0; i < P.length; i++) { var p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a >= 0 ? P : P.slice().reverse(); }
  /* vertical sides of a ring from z0 to z1 (outward normals for a ccw ring; inward for holes when inward = true) */
  function sides(M, P, z0, z1, col, inward, alpha) {
    P = ccw(P); if (inward) P = P.slice().reverse();
    for (var i = 0; i < P.length; i++) { var p = P[i], q = P[(i + 1) % P.length]; M.quad(v3(p, z0), v3(q, z0), v3(q, z1), v3(p, z1), col, alpha); }
  }
  function prism(M, P, z0, z1, col, holes, alpha, noEdges, colB) {
    if (!P || P.length < 3 || z1 - z0 < 1e-6) return; P = ccw(P);
    cap(M, P, holes, z1, 1, col, alpha); cap(M, P, holes, z0, -1, colB || col, alpha); sides(M, P, z0, z1, col, false, alpha); (holes || []).forEach(function (h) { sides(M, h, z0, z1, col, true, alpha); });
    if (!noEdges) { M.loop(P.map(function (p) { return v3(p, z0); })); M.loop(P.map(function (p) { return v3(p, z1); })); P.forEach(function (p) { M.edge(v3(p, z0), v3(p, z1)); }); (holes || []).forEach(function (h) { M.loop(h.map(function (p) { return v3(p, z0); })); M.loop(h.map(function (p) { return v3(p, z1); })); }); }
  }
  /* box from a base rectangle (centre p, w along angle a, d across) */
  function box(M, p, w, d, ang, z0, z1, col, alpha) { prism(M, B.rectAt(p, w, d, ang), z0, z1, col, null, alpha); }
  function boxAlong(M, a, b, w, z0, z1, col, alpha) { var u = G.norm(G.sub(b, a)), n = G.mul(G.perp(u), w / 2); prism(M, [G.add(a, n), G.sub(a, n), G.sub(b, n), G.add(b, n)], z0, z1, col, null, alpha); }

  /* ---------- walls with openings ---------- */
  function wall(M, doc, w, z0) {
    var P = B.wallPoly(doc, w), H = B.wallH(doc, w), c = B.wallLine(w), ops = B.openings(doc, w), z1 = z0 + H, d = doc.d, xs = w.ext ? B.extSide(doc, w) : -1;
    var lkI = B.lookFor(d, "wall_int", w.lookI, w.colI), lkO = w.ext ? B.lookFor(d, "wall_ext", w.lookO, w.colO) : lkI, col = lkO, fc = [xs === 0 ? lkO : lkI, xs === 1 ? lkO : lkI];
    var proj = function (q) { return G.dot(G.sub(q, c.a), c.u); };
    // the two long faces in (s, z) coordinates, with opening holes
    [[P.sL, P.eL, 1], [P.sR, P.eR, -1]].forEach(function (f, fi) {
      var s0 = proj(f[0]), s1 = proj(f[1]), map = function (s, z) { var t = (s - s0) / ((s1 - s0) || 1); return v3(G.lerp(f[0], f[1], t), z0 + z); };
      var holes = ops.map(function (o) { var a = Math.max(o.s0, s0 + 1), b = Math.min(o.s1, s1 - 1), zt = Math.min(o.z1, H - 1), zb = Math.max(o.z0, o.z0 === 0 ? 0.0001 : o.z0); return b > a && zt > zb ? [[a, zb], [b, zb], [b, zt], [a, zt]] : null; }).filter(Boolean);
      var r = EP.earcut([[s0, 0], [s1, 0], [s1, H], [s0, H]], holes);
      r.tris.forEach(function (t) { var a = map(r.pts[t[0]][0], r.pts[t[0]][1]), b = map(r.pts[t[1]][0], r.pts[t[1]][1]), cc = map(r.pts[t[2]][0], r.pts[t[2]][1]); if (f[2] > 0) M.tri(a, cc, b, fc[fi]); else M.tri(a, b, cc, fc[fi]); });
      M.edge(map(s0, 0), map(s1, 0)); M.edge(map(s0, H), map(s1, H));
      holes.forEach(function (h) { M.loop(h.map(function (q) { return map(q[0], q[1]); })); });
    });
    // top, bottom, ends
    var foot = [P.sL, P.eL, P.eR, P.sR]; cap(M, ccw(foot), null, z1, 1, col); cap(M, ccw(foot), null, z0, -1, col);
    M.quad(v3(P.sR, z0), v3(P.sL, z0), v3(P.sL, z1), v3(P.sR, z1), col); M.quad(v3(P.eL, z0), v3(P.eR, z0), v3(P.eR, z1), v3(P.eL, z1), col);
    M.edge(v3(P.sL, z0), v3(P.sL, z1)); M.edge(v3(P.sR, z0), v3(P.sR, z1)); M.edge(v3(P.eL, z0), v3(P.eL, z1)); M.edge(v3(P.eR, z0), v3(P.eR, z1)); M.edge(v3(P.sL, z1), v3(P.sR, z1)); M.edge(v3(P.eL, z1), v3(P.eR, z1));
    // reveals of each opening (through the thickness, on the centre-line frame)
    ops.forEach(function (o) {
      var col = lkI, h = G.mul(c.n, w.th / 2), at = function (s) { return G.add(c.a, G.mul(c.u, s)); }, A = at(o.s0), Bp = at(o.s1), zt = Math.min(o.z1, H), zb = o.z0;
      M.quad(v3(G.add(A, h), z0 + zb), v3(G.sub(A, h), z0 + zb), v3(G.sub(A, h), z0 + zt), v3(G.add(A, h), z0 + zt), col);       // jamb at s0 (faces +u)
      M.quad(v3(G.sub(Bp, h), z0 + zb), v3(G.add(Bp, h), z0 + zb), v3(G.add(Bp, h), z0 + zt), v3(G.sub(Bp, h), z0 + zt), col);    // jamb at s1
      if (zt < H - 0.5) M.quad(v3(G.add(A, h), z0 + zt), v3(G.sub(A, h), z0 + zt), v3(G.sub(Bp, h), z0 + zt), v3(G.add(Bp, h), z0 + zt), col);   // head (soffit)
      if (zb > 0.5) M.quad(v3(G.add(A, h), z0 + zb), v3(G.add(Bp, h), z0 + zb), v3(G.sub(Bp, h), z0 + zb), v3(G.sub(A, h), z0 + zb), col);      // sill
    });  if (B.finMesh && w.fin) { try { B.finMesh(M, doc, w, z0, H, ops); } catch (er) { /* a bad finish never stops the wall */ } }
  }
  /* element look → building category (if the user set it) → look of the element's material → category default */
  function byMat(d, cat, mat, elLook, elCol) {
    if (elLook && B.LOOKS[elLook]) return B.look(elLook, elCol);
    var set = (B.ensure(d).looks || {})[cat]; if (set && set.l) return B.lookFor(d, cat, null, elCol);
    return mat && B.MAT_LOOK[mat] ? B.look(B.MAT_LOOK[mat], elCol) : B.lookFor(d, cat, null, elCol);
  }
  /* ---------- doors & windows ---------- */
  function hosted(M, doc, o, z0) {
    var pl = B.place(doc, o); if (!pl) return; var d = doc.d, th = pl.w.th, u = pl.u, n = pl.n, zb = o.t === "door" ? 0 : (o.sill != null ? o.sill : 900), zt = zb + o.h, fw = 50;
    var mat = o.t === "door" ? byMat(d, "door_frame", null, o.lookF, o.colF) : byMat(d, "win_frame", o.mat || "al", o.look, o.col), glass = B.lookFor(d, "glass"), frameD = o.t === "door" ? mat : mat;
    var A = G.sub(pl.p, G.mul(u, o.w / 2)), Bp = G.add(pl.p, G.mul(u, o.w / 2)), fd = o.t === "door" ? 100 : 60;
    // frame: two jambs + head (+ sill for windows)
    box(M, G.add(A, G.mul(u, fw / 2)), fw, fd, Math.atan2(u[1], u[0]) * 180 / Math.PI, z0 + zb, z0 + zt, frameD);
    box(M, G.sub(Bp, G.mul(u, fw / 2)), fw, fd, Math.atan2(u[1], u[0]) * 180 / Math.PI, z0 + zb, z0 + zt, frameD);
    boxAlong(M, A, Bp, fd, z0 + zt - fw, z0 + zt, frameD);
    if (o.t === "window") {
      boxAlong(M, A, Bp, fd, z0 + zb, z0 + zb + fw, mat);
      var ia = G.add(A, G.mul(u, fw)), ib = G.sub(Bp, G.mul(u, fw)), panes = o.kind === "louvre" ? 0 : (o.kind === "sliding" || o.kind === "casement2" ? 2 : 1);
      if (o.kind === "louvre") { for (var z = zb + fw + 60; z < zt - fw; z += 90) boxAlong(M, ia, ib, 70, z0 + z, z0 + z + 8, glass, Math.min(1, glass.a + 0.25)); }
      else { boxAlong(M, ia, ib, 8, z0 + zb + fw, z0 + zt - fw, glass); if (panes === 2) box(M, pl.p, 40, fd * 0.8, Math.atan2(u[1], u[0]) * 180 / Math.PI, z0 + zb + fw, z0 + zt - fw, mat); if (o.kind === "grill") { for (var gx = -o.w / 2 + fw + 100; gx < o.w / 2 - fw - 50; gx += 110) box(M, G.add(pl.p, G.mul(u, gx)), 14, 14, 0, z0 + zb + fw, z0 + zt - fw, mat); boxAlong(M, ia, ib, 14, z0 + (zb + zt) / 2, z0 + (zb + zt) / 2 + 14, mat); } }
      return;
    }
    if (o.t === "opening") return;
    // door leaf (closed), set back toward the swing side
    var side = o.flip ? -1 : 1, off = G.mul(n, side * (th / 2 - 25)), la = G.add(G.add(A, G.mul(u, fw)), off), lb = G.add(G.sub(Bp, G.mul(u, fw)), off), leafCol = o.kind === "sliding" ? glass : byMat(d, "door", o.mat || "flush", o.look, o.col);
    var zlo = z0 + 2, zhi = z0 + zt - fw, HH = zhi - zlo;
    if (o.kind === "shutter") { boxAlong(M, la, lb, 30, zlo, zhi, leafCol); for (var sz = zlo + 80; sz < zhi - 40; sz += 120) boxAlong(M, la, lb, 40, sz, sz + 12, leafCol); boxAlong(M, la, lb, 140, zhi - 160, zhi, leafCol); return; }
    function leafShape(p0, p1) {
      var ul = G.norm(G.sub(p1, p0)), Lw = G.dist(p0, p1), st = o.style || "";
      function at(t) { return G.add(p0, G.mul(ul, t)); }
      if (st === "panel") {
        boxAlong(M, p0, p1, 35, zlo, zhi, leafCol);
        var m1 = Math.min(120, Lw * 0.14), pz = [[zlo + HH * 0.07, zlo + HH * 0.44], [zlo + HH * 0.52, zlo + HH * 0.93]];
        pz.forEach(function (r) { boxAlong(M, at(m1), at(Lw - m1), 46, r[0], r[1], leafCol); });
      } else if (st === "glass") {
        var sw = 70, rb = Math.min(160, HH * 0.08);
        boxAlong(M, p0, at(sw), 45, zlo, zhi, leafCol); boxAlong(M, at(Lw - sw), p1, 45, zlo, zhi, leafCol);
        boxAlong(M, p0, p1, 45, zlo, zlo + rb, leafCol); boxAlong(M, p0, p1, 45, zhi - sw, zhi, leafCol);
        boxAlong(M, at(sw), at(Lw - sw), 8, zlo + rb, zhi - sw, glass);
        boxAlong(M, at(sw), at(Lw - sw), 30, zlo + HH * 0.48, zlo + HH * 0.48 + 40, leafCol);
        boxAlong(M, at(Lw / 2 - 15), at(Lw / 2 + 15), 30, zlo + rb, zhi - sw, leafCol);
      } else if (st === "grill") {
        boxAlong(M, p0, at(40), 40, zlo, zhi, leafCol); boxAlong(M, at(Lw - 40), p1, 40, zlo, zhi, leafCol);
        boxAlong(M, p0, p1, 40, zlo, zlo + 60, leafCol); boxAlong(M, p0, p1, 40, zhi - 60, zhi, leafCol); boxAlong(M, p0, p1, 30, zlo + HH * 0.5, zlo + HH * 0.5 + 30, leafCol);
        for (var gx = 110; gx < Lw - 60; gx += 110) boxAlong(M, at(gx - 8), at(gx + 8), 16, zlo + 60, zhi - 60, leafCol);
      } else boxAlong(M, p0, p1, 35, zlo, zhi, leafCol);
    }
    if (o.kind === "double") { var m = G.mid(la, lb); leafShape(la, G.sub(m, G.mul(u, 3))); leafShape(G.add(m, G.mul(u, 3)), lb); }
    else leafShape(la, lb);
  }
  /* ---------- roofs ---------- */
  function roof(M, doc, e, zBase) {
    var d = doc.d, P = ccw(e.pts), th = e.th || (e.mat === "rcc" ? 125 : 50), rcc = e.mat === "rcc" || e.kind === "flat", col = rcc ? B.lookFor(d, "roof_rcc", e.look, e.col) : byMat(d, e.mat === "tile" ? "roof_tile" : "roof_sheet", e.mat || "gi", e.look, e.col), under = rcc ? B.lookFor(d, "ceiling") : col, gab = B.lookFor(d, "wall_ext"), tn = Math.tan((e.slope || 0) * Math.PI / 180);
    if (e.kind === "flat" || !tn) { prism(M, P, zBase - th, zBase, col, null, null, false, under); return; }
    if (e.kind === "shed") {
      var dir = (e.dir || 0) * Math.PI / 180, u = [Math.cos(dir), Math.sin(dir)], mn = Math.min.apply(null, P.map(function (p) { return G.dot(p, u); })), zf = function (p) { return zBase + (G.dot(p, u) - mn) * tn; };
      var r = EP.earcut(P, []); r.tris.forEach(function (t) { var a = r.pts[t[0]], b = r.pts[t[1]], c = r.pts[t[2]]; M.tri(v3(a, zf(a)), v3(b, zf(b)), v3(c, zf(c)), col); M.tri(v3(a, zf(a) - th), v3(c, zf(c) - th), v3(b, zf(b) - th), col); });
      for (var i = 0; i < P.length; i++) { var p = P[i], q = P[(i + 1) % P.length]; M.quad(v3(p, zf(p) - th), v3(q, zf(q) - th), v3(q, zf(q)), v3(p, zf(p)), col); M.edge(v3(p, zf(p)), v3(q, zf(q))); }
      return;
    }
    var HO = (e.kind === "hip" || e.kind === "gable") && B.hipOrtho ? B.hipOrtho(e) : null;
    if (HO) {   // L / T / U … outline: one roof plane per side, valleys at the inside corners
      HO.polys.forEach(function (pg) { var q = pg.map(function (p) { return v3(p, zBase + p[2] * tn); }), b = pg.map(function (p) { return v3(p, zBase + p[2] * tn - th); }); for (var i = 1; i < q.length - 1; i++) { M.tri(q[0], q[i], q[i + 1], col); M.tri(b[0], b[i + 1], b[i], under); } });
      HO.creases.forEach(function (c) { M.edge(v3(c[0], zBase + c[2] * tn), v3(c[1], zBase + c[3] * tn)); });
      (HO.eaves || []).forEach(function (ev) { M.quad(v3(ev[0], zBase - th), v3(ev[1], zBase - th), v3(ev[1], zBase), v3(ev[0], zBase), col); M.quad(v3(ev[1], zBase - th), v3(ev[0], zBase - th), v3(ev[0], zBase), v3(ev[1], zBase), col); M.edge(v3(ev[0], zBase), v3(ev[1], zBase)); });
      (HO.gables || []).forEach(function (g) { for (var i = 0; i < g.length - 1; i++) { var a = g[i], b = g[i + 1], q = [v3(a, zBase - th), v3(b, zBase - th), v3(b, zBase + b[2] * tn), v3(a, zBase + a[2] * tn)]; M.quad(q[0], q[1], q[2], q[3], gab); M.quad(q[1], q[0], q[3], q[2], gab); M.edge(q[3], q[2]); } });   // gable wall up to the roof line (both faces)
      return;
    }
    var R = B.roofRidge(e); if (!R) { prism(M, P, zBase - th, zBase, col, null, null, false, under); return; }
    var zr = zBase + R.half * tn;
    var c00 = R.c[0], c10 = R.c[1], c11 = R.c[2], c01 = R.c[3], ra = R.a, rb = R.b, Z = function (p, z) { return v3(p, z); };
    function face(pts, zs) { if (pts.length === 3) { M.tri(Z(pts[0], zs[0]), Z(pts[1], zs[1]), Z(pts[2], zs[2]), col); M.tri(Z(pts[0], zs[0] - th), Z(pts[2], zs[2] - th), Z(pts[1], zs[1] - th), col); } else { M.quad(Z(pts[0], zs[0]), Z(pts[1], zs[1]), Z(pts[2], zs[2]), Z(pts[3], zs[3]), col); M.quad(Z(pts[0], zs[0] - th), Z(pts[3], zs[3] - th), Z(pts[2], zs[2] - th), Z(pts[1], zs[1] - th), col); } for (var i = 0; i < pts.length; i++) M.edge(Z(pts[i], zs[i]), Z(pts[(i + 1) % pts.length], zs[(i + 1) % pts.length])); }
    if (R.along) {
      face([c00, c10, rb, ra], [zBase, zBase, zr, zr]); face([c11, c01, ra, rb], [zBase, zBase, zr, zr]);
      if (e.kind === "hip") { face([c01, c00, ra], [zBase, zBase, zr]); face([c10, c11, rb], [zBase, zBase, zr]); }
      else { M.tri(Z(c01, zBase), Z(c00, zBase), Z(ra, zr), gab); M.tri(Z(c10, zBase), Z(c11, zBase), Z(rb, zr), gab); }
    } else {
      face([c10, c11, rb, ra], [zBase, zBase, zr, zr]); face([c01, c00, ra, rb], [zBase, zBase, zr, zr]);
      if (e.kind === "hip") { face([c00, c10, ra], [zBase, zBase, zr]); face([c11, c01, rb], [zBase, zBase, zr]); }
      else { M.tri(Z(c00, zBase), Z(c10, zBase), Z(ra, zr), gab); M.tri(Z(c11, zBase), Z(c01, zBase), Z(rb, zr), gab); }
    }
  }
  /* ---------- everything ---------- */
  B.meshes = function (doc, opts) {
    opts = opts || {}; var d = doc.d, bs = B.ensure(d), out = [], byId = [], ids = {}, maxElev = opts.upTo;
    B.ctx.doc = doc; var H = { look: function (cat, id, col) { return B.lookFor(d, cat, id, col); }, prism: prism, box: box, boxAlong: boxAlong, noGround: false, cutouts: [] }; var LK = function (cat, e) { return B.lookFor(d, cat, e && e.look, e && e.col); };
    d.ents.forEach(function (e) {
      if (!B.is(e) || (opts.only && !opts.only.has(e.id))) return; if (!opts.only && !doc.visible(e) && !opts.allLevels && !(e.lvl && opts.levels)) { var Lr = d.layers[e.layer]; if (Lr && (!Lr.on || Lr.frz)) return; }
      var L = B.level(d, e.lvl || (B.hostOf(doc, e) || {}).lvl), z0 = (L ? L.elev : 0) + (e.base || 0);
      if (maxElev != null && L && L.elev > maxElev + 1) return;
      var idx = byId.length; byId.push(e.id); ids[e.id] = idx + 1; var M = new Mesh(idx + 1);
      try {
        switch (e.t) {
          case "wall": wall(M, doc, e, z0); break;
          case "door": case "window": case "opening": var hw = B.hostOf(doc, e); if (hw) { var Lh = B.level(d, hw.lvl); hosted(M, doc, e, Lh.elev + (hw.base || 0)); } break;
          case "slab": var zt = L.elev + (e.off || 0); prism(M, e.pts, zt - e.th, zt, LK("slab", e), e.holes, null, false, e.kind === "floor" ? LK("slab", e) : B.lookFor(d, "ceiling")); break;
          case "column": var hc = e.h != null ? e.h : L.h; if (e.shape && e.shape !== "rect") prism(M, B.colPoly(e), z0, z0 + hc, LK("frame", e)); else box(M, e.p, e.w, e.d, e.rot, z0, z0 + hc, LK("frame", e)); break;
          case "beam": var top = L.elev + L.h + (e.top || 0); boxAlong(M, e.a, e.b, e.w, top - e.d, top, LK("frame", e)); break;
          case "footing": var bot = L.elev - e.df, pc = e.pcc || { off: 150, th: 100 }; box(M, e.p, e.L + 2 * pc.off, e.B + 2 * pc.off, e.rot, bot - pc.th, bot, LK("found")); box(M, e.p, e.L, e.B, e.rot, bot, bot + e.D, LK("found", e)); if (e.ped) box(M, e.p, e.ped.w, e.ped.d, e.rot, bot + e.D, L.elev, LK("found", e)); break;
          case "roof": roof(M, doc, e, L.elev + (e.off || 0)); break;
          case "stair": var S = B.stairGeom(e); S.steps.forEach(function (st) { var a = st.a, u = st.u, n = st.n, q = [a, G.add(a, G.mul(u, st.T)), G.add(G.add(a, G.mul(u, st.T)), G.mul(n, st.last && S.flights.length > 1 && st.T !== e.T ? 2 * e.w + (e.gap || 100) : st.w)), G.add(a, G.mul(n, st.last && S.flights.length > 1 && st.T !== e.T ? 2 * e.w + (e.gap || 100) : st.w))]; prism(M, q, z0 + Math.max(0, st.z1 - e.R - (e.wt || 150) - 100), z0 + st.z1, LK("stair", e)); }); break;
          default: if (B.EXT && B.EXT[e.t] && B.EXT[e.t].mesh) B.EXT[e.t].mesh(M, doc, e, H); break;
          case "room": prism(M, e.pts, L.elev - 2, L.elev + 3, B.look(e.look && B.LOOKS[e.look] ? e.look : B.FLOOR_LOOK[e.floor || ""] || "ips", e.col), null, 1, true);
            if (e.ceil && B.fceilH) { var zf = L.elev + B.fceilH(doc, e); prism(M, e.pts, zf, zf + 12, B.lookFor(d, "ceiling"), null, null, true); }   // false ceiling board (underside at the set height)
            break;
          case "railing": B.railMesh(M, e, z0, { d: d, box: box, boxAlong: boxAlong }); break;
        }
      } catch (er) { console.warn("mesh", e.t, er); }
      var str = B.RF_TYPES && B.RF_TYPES[e.t];   // x-ray for the rebar view: structure faint, the rest almost invisible
      if (opts.rebar) for (var vi = 9; vi < M.v.length; vi += 14) M.v[vi] = Math.min(M.v[vi], str ? 0.18 : 0.06);
      var mv = e.t === "asset" && +e.walk > 0 && !((B.ASSET_LIB[e.kind] || {}).cut) ? { d: +e.walk * (e.sc || 1) * K, dir: [Math.cos((e.rot || 0) * Math.PI / 180), Math.sin((e.rot || 0) * Math.PI / 180)] } : null;   /* a vehicle that drives along its direction when ▶ Play is on */
      out.push({ id: e.id, idx: idx + 1, v: M.v, e: (opts.rebar && !str) || mv ? [] : M.e, mv: mv });
    });
    if (opts.rebar && B.rebarMesh) B.rebarMesh(doc, function (id) { return new Mesh(ids[id]); }, { filter: function (e) { return !!ids[e.id]; } }).forEach(function (M) { out.push({ id: byId[M.id - 1], idx: M.id, v: M.v, e: [] }); });
    var bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    out.forEach(function (m) { for (var i = 0; i < m.v.length; i += 14) { bb[0] = Math.min(bb[0], m.v[i]); bb[1] = Math.min(bb[1], m.v[i + 1]); bb[2] = Math.min(bb[2], m.v[i + 2]); bb[3] = Math.max(bb[3], m.v[i]); bb[4] = Math.max(bb[4], m.v[i + 1]); bb[5] = Math.max(bb[5], m.v[i + 2]); } });
    return { groups: out, byIdx: byId, bbox: isFinite(bb[0]) ? bb : [-5, -5, 0, 5, 5, 3], ngl: bs.ngl * K, ground: B.lookFor(d, "ground"), noGround: H.noGround, cutouts: H.cutouts };
  };
})();
