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
  /* a piece of a curved wall (CURVEDWALL): the circle it lies on, from the piece next to it, and which of its ends join another piece */
  B.curveOf = function (doc, w) { if (!w.curve || !w.a || !w.b) return null; var near = function (p, q) { return Math.abs(p[0] - q[0]) < 2 && Math.abs(p[1] - q[1]) < 2; }, pa = null, pb = null;
    doc.d.ents.forEach(function (o) { if (o === w || o.id === w.id || o.t !== "wall" || !o.curve || o.lvl !== w.lvl) return; if (!pa) { if (near(o.b, w.a)) pa = o.a; else if (near(o.a, w.a)) pa = o.b; } if (!pb) { if (near(o.a, w.b)) pb = o.b; else if (near(o.b, w.b)) pb = o.a; } });
    var k = pa ? G.circle3(pa, w.a, w.b) : pb ? G.circle3(w.a, w.b, pb) : null; if (!k || !(k.r > 0) || k.r > G.dist(w.a, w.b) * 400) return null; return { c: k.c, r: k.r, ja: !!pa, jb: !!pb }; };
  function wall(M, doc, w, z0) {
    var cvK = w.curve ? B.curveOf(doc, w) : null, vSt = M.v.length, eSt = M.e.length;
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
    if (!(cvK && cvK.ja)) M.quad(v3(P.sR, z0), v3(P.sL, z0), v3(P.sL, z1), v3(P.sR, z1), col); if (!(cvK && cvK.jb)) M.quad(v3(P.eL, z0), v3(P.eR, z0), v3(P.eR, z1), v3(P.eL, z1), col);   /* the ends of a curved-wall piece that meet the next piece are inside the wall */
    M.edge(v3(P.sL, z0), v3(P.sL, z1)); M.edge(v3(P.sR, z0), v3(P.sR, z1)); M.edge(v3(P.eL, z0), v3(P.eL, z1)); M.edge(v3(P.eR, z0), v3(P.eR, z1)); M.edge(v3(P.sL, z1), v3(P.sR, z1)); M.edge(v3(P.eL, z1), v3(P.eR, z1));
    // reveals of each opening (through the thickness, on the centre-line frame)
    ops.forEach(function (o) {
      var col = lkI, h = G.mul(c.n, w.th / 2), at = function (s) { return G.add(c.a, G.mul(c.u, s)); }, A = at(o.s0), Bp = at(o.s1), zt = Math.min(o.z1, H), zb = o.z0;
      M.quad(v3(G.add(A, h), z0 + zb), v3(G.sub(A, h), z0 + zb), v3(G.sub(A, h), z0 + zt), v3(G.add(A, h), z0 + zt), col);       // jamb at s0 (faces +u)
      M.quad(v3(G.sub(Bp, h), z0 + zb), v3(G.add(Bp, h), z0 + zb), v3(G.add(Bp, h), z0 + zt), v3(G.sub(Bp, h), z0 + zt), col);    // jamb at s1
      if (zt < H - 0.5) M.quad(v3(G.add(A, h), z0 + zt), v3(G.sub(A, h), z0 + zt), v3(G.sub(Bp, h), z0 + zt), v3(G.add(Bp, h), z0 + zt), col);   // head (soffit)
      if (zb > 0.5) M.quad(v3(G.add(A, h), z0 + zb), v3(G.add(Bp, h), z0 + zb), v3(G.sub(Bp, h), z0 + zb), v3(G.sub(A, h), z0 + zb), col);      // sill
    });
    if (cvK) {   /* seen as one smooth curve: the faces are shaded round the centre and the lines at the joints between pieces are left out */
      var V = M.v, cx = cvK.c[0] * K, cy = cvK.c[1] * K; for (var vi = vSt; vi + 14 <= V.length; vi += 14) { if (Math.abs(V[vi + 5]) > 0.2) continue; var rx = V[vi] - cx, ry = V[vi + 1] - cy, rl = Math.hypot(rx, ry) || 1, dt = (V[vi + 3] * rx + V[vi + 4] * ry) / rl; if (Math.abs(dt) > 0.75) { var sg = dt > 0 ? 1 : -1; V[vi + 3] = sg * rx / rl; V[vi + 4] = sg * ry / rl; V[vi + 5] = 0; } }
      var J = []; if (cvK.ja) J.push([w.a[0] * K, w.a[1] * K]); if (cvK.jb) J.push([w.b[0] * K, w.b[1] * K]); if (J.length) { var E = M.e, keep = E.slice(0, eSt), tolJ = (w.th || 230) * K * 0.9; for (var ei = eSt; ei + 6 <= E.length; ei += 6) { var drop = J.some(function (q) { return Math.hypot(E[ei] - q[0], E[ei + 1] - q[1]) < tolJ && Math.hypot(E[ei + 3] - q[0], E[ei + 4] - q[1]) < tolJ; }); if (!drop) for (var ek = 0; ek < 6; ek++) keep.push(E[ei + ek]); } M.e = keep; } }
    if (B.finMesh && w.fin) { try { B.finMesh(M, doc, w, z0, H, ops); } catch (er) { /* a bad finish never stops the wall */ } }
  }
  /* element look → building category (if the user set it) → look of the element's material → category default */
  function byMat(d, cat, mat, elLook, elCol) {
    if (elLook && B.LOOKS[elLook]) return B.look(elLook, elCol);
    var set = (B.ensure(d).looks || {})[cat]; if (set && set.l) return B.lookFor(d, cat, null, elCol);
    return mat && B.MAT_LOOK[mat] ? B.look(B.MAT_LOOK[mat], elCol) : B.lookFor(d, cat, null, elCol);
  }
  /* ---------- doors & windows ---------- */
  function hosted(M, doc, o, z0) {
    var pl = B.place(doc, o); if (!pl) return; var d = doc.d, th = pl.w.th, u = pl.u, n = pl.n, zb = o.t === "door" ? 0 : (o.sill != null ? o.sill : 900), zt = zb + o.h, FRM = o.t === "door" ? ({ slim: [40, 75], heavy: [75, 125], stone: [50, 150], none: [6, 40] }[o.frm] || [50, 100]) : null, fw = FRM ? FRM[0] : 50;
    var mat = o.t === "door" ? (o.frm === "stone" ? B.lookFor(d, "granite") || byMat(d, "door_frame", null, o.lookF, o.colF) : byMat(d, "door_frame", null, o.lookF, o.colF)) : byMat(d, "win_frame", o.mat || "al", o.look, o.col), glass = B.lookFor(d, "glass"), frameD = o.t === "door" ? mat : mat;
    var A = G.sub(pl.p, G.mul(u, o.w / 2)), Bp = G.add(pl.p, G.mul(u, o.w / 2)), fd = o.t === "door" ? FRM[1] : 60;
    /* round or flat-arched head: the opening is cut square up to the crown; the corners above the springing are filled
       with the wall's own faces, and a door / window gets a glazed fan-light with an arched frame */
    var rise = o.head === "arch" ? o.w / 2 : o.head === "seg" ? o.w * 0.2 : o.head === "point" ? o.w * 0.866 : o.head === "horse" ? o.w * 0.75 : 0; if (rise > o.h - 300) rise = 0;
    var horse = rise && o.head === "horse";   /* horseshoe: the circle is as wide as the cut and runs 30° below its centre, so the jambs under it stand in by 13 % of the half width */
    if (rise) {
      var zTop = zt, hw = o.w / 2, wv = pl.w, xs = wv.ext ? B.extSide(doc, wv) : -1, lkI = B.lookFor(d, "wall_int", wv.lookI, wv.colI), lkO = wv.ext ? B.lookFor(d, "wall_ext", wv.lookO, wv.colO) : lkI, fcs = [xs === 0 ? lkO : lkI, xs === 1 ? lkO : lkI]; zt = zTop - rise;
      var pt3 = function (t, y, z) { return v3(G.add(G.add(pl.p, G.mul(u, t)), G.mul(n, y)), z0 + z); }, vq = function (P4, y0, y1, col, alpha) { var f = P4.map(function (q) { return pt3(q[0], y1, q[1]); }), b = P4.map(function (q) { return pt3(q[0], y0, q[1]); }), k = P4.length; for (var i = 1; i < k - 1; i++) { M.tri(f[0], f[i], f[i + 1], col, alpha); M.tri(b[0], b[i + 1], b[i], col, alpha); } for (var j = 0; j < k; j++) { var j2 = (j + 1) % k; M.quad(b[j], b[j2], f[j2], f[j], col, alpha); } };
      var SG = horse ? 24 : 18, TH = Math.PI / 6, arcPt = horse ? function (i, r) { var a = -TH + (Math.PI + 2 * TH) * i / SG; return [r * Math.cos(a), zt + hw * Math.sin(TH) + r * Math.sin(a)]; } : o.head === "point" ? function (i, r) { var x = r * Math.cos(Math.PI * i / SG), ax = Math.abs(x) + r; return [x, zt + Math.sqrt(Math.max(0, 4 * r * r - ax * ax))]; } : function (i, r, rz) { var a = Math.PI * i / SG; return [r * Math.cos(a), zt + rz * Math.sin(a)]; };
      if (horse) { var xS = hw * Math.cos(TH); [[xS, hw], [-hw, -xS]].forEach(function (q) { var pier = [[q[0], zb], [q[0], zt], [q[1], zt], [q[1], zb]]; vq(pier, 0, th / 2, fcs[0]); vq(pier, -th / 2, 0, fcs[1]); }); }   /* the piers the horseshoe springs from */
      for (var si = 0; si < SG; si++) { var p0 = arcPt(si, hw, rise), p1 = arcPt(si + 1, hw, rise), low = horse && (si < 3 || si >= SG - 3), quad = low ? [[p0[0], zt], [p0[0], p0[1]], [p1[0], p1[1]], [p1[0], zt]] : [[p0[0], p0[1]], [p0[0], zTop], [p1[0], zTop], [p1[0], p1[1]]]; vq(quad, 0, th / 2, fcs[0]); vq(quad, -th / 2, 0, fcs[1]); M.edge(pt3(p0[0], th / 2, p0[1]), pt3(p1[0], th / 2, p1[1])); M.edge(pt3(p0[0], -th / 2, p0[1]), pt3(p1[0], -th / 2, p1[1])); }
      if (o.t !== "opening") { var fm = o.t === "door" ? byMat(d, "door_frame", null, o.lookF, o.colF) : byMat(d, "win_frame", o.mat || "al", o.look, o.col), gls = B.lookFor(d, "glass"), fdp = (o.t === "door" ? 100 : 60) / 2, kk = (hw - 50) / hw;
        for (var ai = 0; ai < SG; ai++) { var o0 = arcPt(ai, hw, rise), o1 = arcPt(ai + 1, hw, rise), i0 = [o0[0] * kk, zt + (o0[1] - zt) * kk], i1 = [o1[0] * kk, zt + (o1[1] - zt) * kk]; vq([i0, o0, o1, i1], -fdp, fdp, fm); vq([[0, zt], i0, i1], -4, 4, gls, gls.a); }
        var nb = horse ? 0 : o.w > 1100 ? 3 : 1; if (horse) { var rH = hw - 50, cH = zt + hw * 0.5; [0, Math.PI / 3, 2 * Math.PI / 3, Math.PI].forEach(function (ba2) { var bx2 = Math.cos(ba2), bz2 = Math.sin(ba2); vq([[-bz2 * 15, cH + bx2 * 15], [bz2 * 15, cH - bx2 * 15], [rH * bx2 + bz2 * 15, cH + rH * bz2 - bx2 * 15], [rH * bx2 - bz2 * 15, cH + rH * bz2 + bx2 * 15]], -fdp * 0.6, fdp * 0.6, fm); }); }   /* glazing bars from the centre of the circle */
        for (var bi = 1; bi <= nb; bi++) { var ba = Math.PI * bi / (nb + 1), bx = Math.cos(ba), bz = Math.sin(ba), r1 = (hw - 50), tx = -bz * 15, tz = bx * 15 * (rise / hw); vq([[tx, zt + tz], [-tx, zt - tz], [r1 * bx - tx, zt + r1 * bz * (rise / hw) - tz], [r1 * bx + tx, zt + r1 * bz * (rise / hw) + tz]], -fdp * 0.6, fdp * 0.6, fm); } }
    }
    if (horse) { var xH = o.w / 2 * Math.cos(Math.PI / 6); A = G.sub(pl.p, G.mul(u, xH)); Bp = G.add(pl.p, G.mul(u, xH)); }   /* frame and leaf stand between the piers */
    // frame: two jambs + head (+ sill for windows); a frameless door has none
    if (o.frm !== "none" || o.t !== "door") box(M, G.add(A, G.mul(u, fw / 2)), fw, fd, Math.atan2(u[1], u[0]) * 180 / Math.PI, z0 + zb, z0 + zt, frameD);
    if (o.frm !== "none" || o.t !== "door") { box(M, G.sub(Bp, G.mul(u, fw / 2)), fw, fd, Math.atan2(u[1], u[0]) * 180 / Math.PI, z0 + zb, z0 + zt, frameD);
      boxAlong(M, A, Bp, fd, z0 + zt - fw, z0 + zt, frameD); }
    if (o.t === "door" && +o.casing > 20 && !o.head) { var cw = +o.casing, nC = G.perp(u), thC = ((pl.w && pl.w.th) || 230) / 2 + 9, angC = Math.atan2(u[1], u[0]) * 180 / Math.PI; [1, -1].forEach(function (sd) { var off = G.mul(nC, sd * thC); box(M, G.add(G.sub(A, G.mul(u, cw / 2)), off), cw, 18, angC, z0 + zb, z0 + zt + cw, frameD); box(M, G.add(G.add(Bp, G.mul(u, cw / 2)), off), cw, 18, angC, z0 + zb, z0 + zt + cw, frameD); boxAlong(M, G.add(A, off), G.add(Bp, off), 18, z0 + zt, z0 + zt + cw, frameD); }); }   /* architrave (casing) round the frame on both faces */
    if (o.t === "window") {
      boxAlong(M, A, Bp, fd, z0 + zb, z0 + zb + fw, mat);
      var ia = G.add(A, G.mul(u, fw)), ib = G.sub(Bp, G.mul(u, fw)), panes = o.kind === "louvre" ? 0 : (o.kind === "sliding" || o.kind === "casement2" ? 2 : 1);
      if (o.kind === "louvre") { for (var z = zb + fw + 60; z < zt - fw; z += 90) boxAlong(M, ia, ib, 70, z0 + z, z0 + z + 8, glass, Math.min(1, glass.a + 0.25)); }
      else { boxAlong(M, ia, ib, 8, z0 + zb + fw, z0 + zt - fw, glass); if (panes === 2) box(M, pl.p, 40, fd * 0.8, Math.atan2(u[1], u[0]) * 180 / Math.PI, z0 + zb + fw, z0 + zt - fw, mat); }
      var gr = B.grillOf ? B.grillOf(o) : null; if (gr) { var gm = o.kind === "grill" ? mat : B.look("steel_matt_black"), go = G.mul(n, o.kind === "grill" ? 0 : (o.flip ? -1 : 1) * Math.min(55, th / 2 - 20)), gc = G.add(pl.p, go), ga = G.add(ia, go), gb = G.add(ib, go), ang = Math.atan2(u[1], u[0]) * 180 / Math.PI;   /* bars a little inside the glass, on the side the window opens to */
        gr.xs.forEach(function (x) { box(M, G.add(gc, G.mul(u, x)), 12, 12, ang, z0 + zb + fw, z0 + zt - fw, gm); }); gr.zs.forEach(function (z) { boxAlong(M, ga, gb, 12, z0 + zb + fw + z - 6, z0 + zb + fw + z + 6, gm); });
        (gr.diag || []).forEach(function (g) { var L = Math.hypot(g[2] - g[0], g[3] - g[1]); if (L < 20) return; var px = -(g[3] - g[1]) / L * 6, pz = (g[2] - g[0]) / L * 6, P = function (x, z) { return v3(G.add(gc, G.mul(u, x)), z0 + zb + fw + z); }, a1 = P(g[0] - px, g[1] - pz), a2 = P(g[0] + px, g[1] + pz), b2 = P(g[2] + px, g[3] + pz), b1 = P(g[2] - px, g[3] - pz); M.quad(a1, a2, b2, b1, gm); M.quad(b1, b2, a2, a1, gm); }); }
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
      } else if (st === "groove") {   /* flush door with horizontal grooves (laminate look) */
        boxAlong(M, p0, p1, 35, zlo, zhi, leafCol); var dk = B.look("steel_matt_black"); for (var gi = 1; gi < 5; gi++) boxAlong(M, at(0), at(Lw), 37, zlo + HH * gi / 5 - 4, zlo + HH * gi / 5 + 4, dk);
      } else if (st === "vgroove") {   /* vertical grooves */
        boxAlong(M, p0, p1, 35, zlo, zhi, leafCol); var dk2 = B.look("steel_matt_black"); for (var vx = 1; vx < 4; vx++) boxAlong(M, at(Lw * vx / 4 - 3), at(Lw * vx / 4 + 3), 37, zlo, zhi, dk2);
      } else if (st === "panel6") {   /* six raised panels */
        boxAlong(M, p0, p1, 35, zlo, zhi, leafCol); var mg = Math.min(100, Lw * 0.12), cw6 = (Lw - 3 * mg) / 2, rows6 = [[0.06, 0.30], [0.36, 0.62], [0.68, 0.94]];
        rows6.forEach(function (r) { for (var c6 = 0; c6 < 2; c6++) boxAlong(M, at(mg + c6 * (cw6 + mg)), at(mg + c6 * (cw6 + mg) + cw6), 46, zlo + HH * r[0], zlo + HH * r[1], leafCol); });
      } else if (st === "vision") {   /* flush door with a narrow vertical glass strip */
        var gx0 = Lw * 0.68, gx1 = Lw * 0.82; boxAlong(M, p0, at(gx0), 35, zlo, zhi, leafCol); boxAlong(M, at(gx1), p1, 35, zlo, zhi, leafCol); boxAlong(M, at(gx0), at(gx1), 35, zlo, zlo + HH * 0.3, leafCol); boxAlong(M, at(gx0), at(gx1), 35, zlo + HH * 0.88, zhi, leafCol); boxAlong(M, at(gx0), at(gx1), 8, zlo + HH * 0.3, zlo + HH * 0.88, glass);
      } else if (st === "halfglass") {   /* glass above, panel below */
        var sw2 = 90; boxAlong(M, p0, at(sw2), 40, zlo, zhi, leafCol); boxAlong(M, at(Lw - sw2), p1, 40, zlo, zhi, leafCol); boxAlong(M, p0, p1, 40, zlo, zlo + HH * 0.45, leafCol); boxAlong(M, p0, p1, 40, zhi - sw2, zhi, leafCol); boxAlong(M, at(sw2), at(Lw - sw2), 8, zlo + HH * 0.45, zhi - sw2, glass); boxAlong(M, at(sw2 + 40), at(Lw - sw2 - 40), 48, zlo + HH * 0.08, zlo + HH * 0.38, leafCol);
      } else if (st === "louvre") {   /* louvred (bathroom / store) */
        boxAlong(M, p0, at(60), 38, zlo, zhi, leafCol); boxAlong(M, at(Lw - 60), p1, 38, zlo, zhi, leafCol); boxAlong(M, p0, p1, 38, zlo, zlo + 120, leafCol); boxAlong(M, p0, p1, 38, zhi - 80, zhi, leafCol); boxAlong(M, p0, p1, 38, zlo + HH * 0.5 - 30, zlo + HH * 0.5 + 30, leafCol);
        for (var lz = zlo + 150; lz < zhi - 110; lz += 55) { if (Math.abs(lz - (zlo + HH * 0.5)) < 50) continue; boxAlong(M, at(60), at(Lw - 60), 30, lz, lz + 14, leafCol); }
      } else if (st === "jali") {   /* frame with a lattice (jali) panel */
        boxAlong(M, p0, at(80), 40, zlo, zhi, leafCol); boxAlong(M, at(Lw - 80), p1, 40, zlo, zhi, leafCol); boxAlong(M, p0, p1, 40, zlo, zlo + 200, leafCol); boxAlong(M, p0, p1, 40, zhi - 100, zhi, leafCol);
        for (var jx = 80 + 70; jx < Lw - 100; jx += 70) boxAlong(M, at(jx - 6), at(jx + 6), 14, zlo + 200, zhi - 100, leafCol); for (var jz = zlo + 270; jz < zhi - 120; jz += 70) boxAlong(M, at(80), at(Lw - 80), 14, jz - 6, jz + 6, leafCol);
      } else if (st === "carved") {   /* main door: centre raised field with a border and a top light */
        boxAlong(M, p0, p1, 45, zlo, zhi, leafCol); var bm = Math.min(110, Lw * 0.12); boxAlong(M, at(bm), at(Lw - bm), 60, zlo + HH * 0.06, zlo + HH * 0.72, leafCol); boxAlong(M, at(bm + 60), at(Lw - bm - 60), 72, zlo + HH * 0.11, zlo + HH * 0.67, leafCol); boxAlong(M, at(bm + 130), at(Lw - bm - 130), 84, zlo + HH * 0.2, zlo + HH * 0.58, leafCol); boxAlong(M, at(bm), at(Lw - bm), 52, zlo + HH * 0.78, zlo + HH * 0.94, B.look("glass_frosted"));
      } else boxAlong(M, p0, p1, 35, zlo, zhi, leafCol);
      /* handle: lever on a plate for ordinary doors, a long pull bar for main / glass doors */
      if (o.handle !== "none" && st !== "grill") { var hk = B.look(o.handle === "gold" ? "steel_gold_pvd" : o.handle === "black" ? "steel_matt_black" : "steel_ss"), hx = Lw > 400 ? Lw - 70 : Lw / 2, pull = o.handle === "pull" || st === "carved";
        if (pull) { boxAlong(M, at(hx - 12), at(hx + 12), 110, zlo + 800, zlo + 830, hk); boxAlong(M, at(hx - 12), at(hx + 12), 110, zlo + 1270, zlo + 1300, hk); boxAlong(M, at(hx - 10), at(hx + 10), 20 + 110, zlo + 760, zlo + 1340, hk); boxAlong(M, at(hx - 12), at(hx + 12), 70, zlo + 780, zlo + 1320, B.look("steel_ss")); }
        else { boxAlong(M, at(hx - 22), at(hx + 22), 50, zlo + 960, zlo + 1120, hk); boxAlong(M, at(hx - 110), at(hx + 10), 120, zlo + 1030, zlo + 1050, hk); } }
    }
    var og = Math.max(0, Math.min(110, +o.open || 0)) * Math.PI / 180, sw = function (h, q) { var r = G.dist(h, q), dv = G.norm(G.sub(q, h)); return G.add(h, G.add(G.mul(dv, r * Math.cos(og)), G.mul(n, side * r * Math.sin(og)))); };   /* a door shown standing open: the leaf swung about its hinge to the side it opens */
    var fxR = Math.max(0.2, Math.min(0.5, +o.fixR || 0.33)), spP = o.swing === "r" ? G.lerp(la, lb, fxR) : G.lerp(la, lb, 1 - fxR);   /* double door with one fixed leaf: the split */
    if (o.kind === "double_fixed") { if (og > 0.01) { if (o.swing === "r") { leafShape(lb, sw(lb, G.add(spP, G.mul(u, 3)))); leafShape(la, G.sub(spP, G.mul(u, 3))); } else { leafShape(la, sw(la, G.sub(spP, G.mul(u, 3)))); leafShape(G.add(spP, G.mul(u, 3)), lb); } } else { leafShape(la, G.sub(spP, G.mul(u, 3))); leafShape(G.add(spP, G.mul(u, 3)), lb); } }
    else if (og > 0.01 && o.kind !== "sliding") { if (o.kind === "double") { var m2 = G.mid(la, lb); leafShape(la, sw(la, G.sub(m2, G.mul(u, 3)))); leafShape(lb, sw(lb, G.add(m2, G.mul(u, 3)))); } else if (o.swing === "r") leafShape(lb, sw(lb, la)); else leafShape(la, sw(la, lb)); }
    else if (o.kind === "double") { var m = G.mid(la, lb); leafShape(la, G.sub(m, G.mul(u, 3))); leafShape(G.add(m, G.mul(u, 3)), lb); }
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
    opts = opts || {}; var d = doc.d, bs = B.ensure(d), out = [], byId = [], ids = {}, maxElev = opts.upTo, DRV = null;
    B.ctx.doc = doc; var H = { look: function (cat, id, col) { return B.lookFor(d, cat, id, col); }, prism: prism, box: box, boxAlong: boxAlong, noGround: false, cutouts: [], lights: [] }; var LK = function (cat, e) { return B.lookFor(d, cat, e && e.look, e && e.col); };
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
          case "stair": var S = B.stairGeom(e); if (S.post) prism(M, ccw(S.post.pts), z0, z0 + S.post.h, B.look("steel_matt_black")); S.steps.forEach(function (st) { if (st.poly) { prism(M, ccw(st.poly), z0 + st.z1 - (e.kind === "spiral" && e.mat === "steel" ? 12 : (st.thin || 60)), z0 + st.z1, e.kind === "spiral" && e.mat === "steel" && !e.look ? B.look("steel_matt_black") : LK("stair", e)); return; } var a = st.a, u = st.u, n = st.n, wS = st.lw || st.w, q = ccw([a, G.add(a, G.mul(u, st.T)), G.add(G.add(a, G.mul(u, st.T)), G.mul(n, wS)), G.add(a, G.mul(n, wS))]); prism(M, q, z0 + Math.max(0, st.z1 - e.R - (e.wt || 150) - 100), z0 + st.z1, LK("stair", e)); });
            if (B.stairRails) { var rk = B.look("steel_ss"), rH = +e.railH || 900; B.stairRails(e).forEach(function (r) { var ang = Math.atan2(r.u[1], r.u[0]) * 180 / Math.PI, d = G.sub(r.p1, r.p0), np = Math.max(2, Math.round(r.n / 3) + 1), hx = G.mul(G.perp(G.norm(d)), 22), za = z0 + r.z0 + rH, zb = z0 + r.z1 + rH, sec = function (zo) { var c = [[G.sub(r.p0, hx), za + zo], [G.add(r.p0, hx), za + zo], [G.add(r.p1, hx), zb + zo], [G.sub(r.p1, hx), zb + zo]]; return c.map(function (q) { return v3(q[0], q[1]); }); }, lo = sec(-22), hi = sec(22);
              M.quad(hi[0], hi[1], hi[2], hi[3], rk); M.quad(hi[3], hi[2], hi[1], hi[0], rk); M.quad(lo[0], lo[1], lo[2], lo[3], rk); M.quad(lo[3], lo[2], lo[1], lo[0], rk); [[0, 3], [1, 2]].forEach(function (k) { M.quad(lo[k[0]], lo[k[1]], hi[k[1]], hi[k[0]], rk); M.quad(hi[k[0]], hi[k[1]], lo[k[1]], lo[k[0]], rk); });   /* sloping handrail */
              for (var pi2 = 0; pi2 < np; pi2++) { var f = pi2 / (np - 1), q = G.add(r.p0, G.mul(d, f)), zt = r.z0 + (r.z1 - r.z0) * f, stp = Math.min(r.n - 1, Math.floor(f * r.n - 1e-6)), zfoot = r.z0 + Math.max(0, stp) * e.R; box(M, q, 36, 36, ang, z0 + zfoot, z0 + zt + rH, rk); } }); }
            break;
          default: if (B.EXT && B.EXT[e.t] && B.EXT[e.t].mesh) B.EXT[e.t].mesh(M, doc, e, H); break;
          case "room": var flz = +e.fl || 0; if (flz > 5) prism(M, e.pts, L.elev, L.elev + flz - 2, B.look("concrete"), null, 1, false); prism(M, e.pts, L.elev + flz - 2, L.elev + flz + 3, B.look(e.look && B.LOOKS[e.look] ? e.look : B.FLOOR_LOOK[e.floor || ""] || "ips", e.col), null, 1, true);
            if (e.ceil && B.fceilH) { var zf = L.elev + B.fceilH(doc, e); if (e.cdes && B.ceilDesign) B.ceilDesign(M, doc, e, zf, H); else prism(M, e.pts, zf, zf + 12, B.lookFor(d, "ceiling"), null, null, true); }   // false ceiling board (underside at the set height)
            break;
          case "railing": B.railMesh(M, e, z0, { d: d, box: box, boxAlong: boxAlong }); break;
        }
      } catch (er) { console.warn("mesh", e.t, er); }
      var str = B.RF_TYPES && B.RF_TYPES[e.t];   // x-ray for the rebar view: structure faint, the rest almost invisible
      if (opts.rebar) for (var vi = 9; vi < M.v.length; vi += 14) M.v[vi] = Math.min(M.v[vi], str ? 0.18 : 0.06);
      if (!DRV) { DRV = {}; d.ents.forEach(function (x) { if (x.t === "pline" && x.layer === "A-DRIVEPATH" && x.drv != null && x.pts && x.pts.length > 1) DRV[x.drv] = x; }); }
      var dpl = e.t === "asset" ? DRV[e.id] : null, mv = e.t === "asset" && (+e.walk > 0 || dpl) && !((B.ASSET_LIB[e.kind] || {}).cut) ? { d: (+e.walk || 0) * (e.sc || 1) * K, rot: (e.rot || 0) * Math.PI / 180, dir: [Math.cos((e.rot || 0) * Math.PI / 180), Math.sin((e.rot || 0) * Math.PI / 180)] } : null;
      if (mv && dpl) { var pp = dpl.pts.map(function (q) { return [q[0] * K, q[1] * K]; }); if (dpl.closed) pp.push(pp[0]); var cm = [0]; for (var pi = 1; pi < pp.length; pi++) cm.push(cm[pi - 1] + Math.hypot(pp[pi][0] - pp[pi - 1][0], pp[pi][1] - pp[pi - 1][1])); mv.path = pp; mv.cum = cm; mv.len = cm[cm.length - 1]; mv.loop = !!dpl.closed; mv.spd = Math.max(0.3, (+dpl.spd || 20) / 3.6);
        /* gates on the route: the vehicle stops a little before each one for a moment, then drives through */
        mv.stops = []; d.ents.forEach(function (g) { if (g.t !== "asset" || !/^gate_(ms|sliding|collapsible|rolling)|boom_barrier/.test(g.kind || "")) return; var q = [g.p[0] * K, g.p[1] * K], best = null;
          for (var si = 1; si < pp.length; si++) { var A2 = pp[si - 1], B2 = pp[si], ab = [B2[0] - A2[0], B2[1] - A2[1]], l2 = ab[0] * ab[0] + ab[1] * ab[1] || 1, tq = Math.max(0, Math.min(1, ((q[0] - A2[0]) * ab[0] + (q[1] - A2[1]) * ab[1]) / l2)), dd = Math.hypot(q[0] - A2[0] - ab[0] * tq, q[1] - A2[1] - ab[1] * tq); if (!best || dd < best.d) best = { d: dd, s: cm[si - 1] + Math.sqrt(l2) * tq }; }
          if (best && best.d < 3) mv.stops.push(best.s); }); }   /* a path drawn for it with DRIVEPATH */   /* a vehicle that drives along its direction when ▶ Play is on */
      out.push({ id: e.id, idx: idx + 1, v: M.v, e: (opts.rebar && !str) || mv ? [] : M.e, mv: mv });
    });
    if (opts.rebar && B.rebarMesh) B.rebarMesh(doc, function (id) { return new Mesh(ids[id]); }, { filter: function (e) { return !!ids[e.id]; } }).forEach(function (M) { out.push({ id: byId[M.id - 1], idx: M.id, v: M.v, e: [] }); });
    var bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    out.forEach(function (m) { for (var i = 0; i < m.v.length; i += 14) { bb[0] = Math.min(bb[0], m.v[i]); bb[1] = Math.min(bb[1], m.v[i + 1]); bb[2] = Math.min(bb[2], m.v[i + 2]); bb[3] = Math.max(bb[3], m.v[i]); bb[4] = Math.max(bb[4], m.v[i + 1]); bb[5] = Math.max(bb[5], m.v[i + 2]); } });
    return { groups: out, byIdx: byId, bbox: isFinite(bb[0]) ? bb : [-5, -5, 0, 5, 5, 3], ngl: bs.ngl * K, ground: B.lookFor(d, "ground"), noGround: H.noGround, cutouts: H.cutouts, lights: H.lights };
  };
})();
