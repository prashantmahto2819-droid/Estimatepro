/* Estimate Pro CAD — 2D computational geometry (pure functions, no DOM).
   Points are [x, y] in model millimetres (y up). Angles in radians unless noted.
   A segment is { k: "L", a, b } or { k: "A", c, r, s, e } (arc from angle s counter-clockwise to e; full circle: s = 0, e = 2π, full: true).
   Entities (see model.js) are turned into segments with segsOf(ent, blocks) for picking, snapping, trimming and lengths. */
(function () {
  "use strict";
  var EP = window.EP = window.EP || {};
  var TAU = Math.PI * 2, EPS = 1e-9;
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }
  function cross(a, b) { return a[0] * b[1] - a[1] * b[0]; }
  function len(a) { return Math.hypot(a[0], a[1]); }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function norm(a) { var l = len(a); return l < EPS ? [0, 0] : [a[0] / l, a[1] / l]; }
  function perp(a) { return [-a[1], a[0]]; }
  function mid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
  function lerp(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
  function ang(a, b) { return Math.atan2(b[1] - a[1], b[0] - a[0]); }
  function polar(c, r, t) { return [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]; }
  function an(t) { t %= TAU; return t < 0 ? t + TAU : t; }
  function sweep(s) { return s.full ? TAU : (an(s.e - s.s) || TAU); }
  function onArc(s, t) { if (s.full) return true; var d = an(t - s.s); return d <= sweep(s) + 1e-9; }
  function eq(a, b, tol) { return dist(a, b) <= (tol || 1e-6); }
  function rot(p, c, t) { var x = p[0] - c[0], y = p[1] - c[1], cs = Math.cos(t), sn = Math.sin(t); return [c[0] + x * cs - y * sn, c[1] + x * sn + y * cs]; }

  /* ---------- polyline bulges (DXF style: bulge = tan(θ/4), + = counter-clockwise) ---------- */
  function bulgeArc(p1, p2, b) {
    var th = 4 * Math.atan(b), d = dist(p1, p2); if (d < EPS) return null;
    var r = d / (2 * Math.sin(Math.abs(th) / 2)), m = mid(p1, p2), h = r * Math.cos(th / 2), dir = norm(sub(p2, p1)), n = perp(dir);
    // centre is on the left of the chord for b > 0 when |θ| < π; h = r·cos(θ/2) turns negative when |θ| > π, which moves it across
    var c = add(m, mul(n, h * (b > 0 ? 1 : -1)));
    var a1 = ang(c, p1), a2 = ang(c, p2);
    return b > 0 ? { k: "A", c: c, r: Math.abs(r), s: a1, e: a2 } : { k: "A", c: c, r: Math.abs(r), s: a2, e: a1, rev: true };
  }
  function arcBulge(c, p1, p2, ccw) { var a1 = ang(c, p1), a2 = ang(c, p2), sw = ccw ? an(a2 - a1) : -an(a1 - a2); return Math.tan(sw / 4); }

  /* ---------- segments of an entity ---------- */
  function approxEllipse(e, n) {
    n = n || 96; var a1 = e.a1 != null ? e.a1 * Math.PI / 180 : 0, a2 = e.a2 != null ? e.a2 * Math.PI / 180 : TAU, sw = an(a2 - a1) || TAU, pts = [], r = (e.rot || 0) * Math.PI / 180;
    var m = Math.max(8, Math.round(n * sw / TAU));
    for (var i = 0; i <= m; i++) { var t = a1 + sw * i / m, x = e.rx * Math.cos(t), y = e.ry * Math.sin(t); pts.push([e.c[0] + x * Math.cos(r) - y * Math.sin(r), e.c[1] + x * Math.sin(r) + y * Math.cos(r)]); }
    return pts;
  }
  function splinePts(e, n) {         // Catmull-Rom through the fit points (closed or open)
    var P = e.pts, out = []; if (!P || P.length < 2) return (P || []).slice(); if (P.length === 2) return P.slice();
    n = n || 12; var cl = !!e.closed, N = P.length, segs = cl ? N : N - 1;
    function pt(i) { if (cl) return P[(i + N) % N]; return P[Math.max(0, Math.min(N - 1, i))]; }
    for (var i = 0; i < segs; i++) {
      var p0 = pt(i - 1), p1 = pt(i), p2 = pt(i + 1), p3 = pt(i + 2);
      for (var j = 0; j < n; j++) { var t = j / n, t2 = t * t, t3 = t2 * t; out.push([0, 1].map(function (k) { return 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3); })); }
    }
    out.push(cl ? P[0].slice() : P[N - 1].slice()); return out;
  }
  function plineSegs(pts, closed) {
    var out = [], n = pts.length; if (n < 2) return out;
    for (var i = 0; i < (closed ? n : n - 1); i++) {
      var p = pts[i], q = pts[(i + 1) % n], b = p[2] || 0;
      if (eq(p, q, 1e-9)) continue;
      if (Math.abs(b) > 1e-9) { var A = bulgeArc(p, q, b); if (A) { A.pi = i; out.push(A); continue; } }
      out.push({ k: "L", a: [p[0], p[1]], b: [q[0], q[1]], pi: i });
    }
    return out;
  }
  function polySegs(pts, closed) { var o = []; for (var i = 0; i < pts.length - 1; i++) o.push({ k: "L", a: pts[i], b: pts[i + 1] }); if (closed && pts.length > 2) o.push({ k: "L", a: pts[pts.length - 1], b: pts[0] }); return o; }
  /* affine matrix [a, b, c, d, e, f]: x' = a x + c y + e, y' = b x + d y + f */
  function mApply(M, p) { return [M[0] * p[0] + M[2] * p[1] + M[4], M[1] * p[0] + M[3] * p[1] + M[5]]; }
  function mMul(A, B) { return [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]]; }
  function mInsert(ins, base) {   // block insert → matrix (scale, rotate, translate, block base point)
    var r = (ins.rot || 0) * Math.PI / 180, sx = ins.sx == null ? 1 : ins.sx, sy = ins.sy == null ? sx : ins.sy, cs = Math.cos(r), sn = Math.sin(r);
    var M = [cs * sx, sn * sx, -sn * sy, cs * sy, ins.p[0], ins.p[1]];
    return base && (base[0] || base[1]) ? mMul(M, [1, 0, 0, 1, -base[0], -base[1]]) : M;
  }
  function segsOf(e, blocks, depth) {
    switch (e.t) {
      case "line": return [{ k: "L", a: e.a, b: e.b }];
      case "xline": return [{ k: "L", a: sub(e.p, mul(norm(e.dir), 1e7)), b: add(e.p, mul(norm(e.dir), 1e7)), inf: true }];
      case "ray": return [{ k: "L", a: e.p, b: add(e.p, mul(norm(e.dir), 1e7)), inf: true }];
      case "pline": return plineSegs(e.pts, e.closed);
      case "circle": return [{ k: "A", c: e.c, r: e.r, s: 0, e: TAU, full: true }];
      case "arc": return [{ k: "A", c: e.c, r: e.r, s: e.a1 * Math.PI / 180, e: e.a2 * Math.PI / 180 }];
      case "ellipse": return polySegs(approxEllipse(e), e.a1 == null);
      case "spline": return polySegs(splinePts(e), false);
      case "hatch": return (e.loops || []).reduce(function (o, L) { return o.concat(plineSegs(L, true)); }, []);
      case "image": var q = rectPts(e); return polySegs(q, true);
      case "leader": return polySegs(e.pts, false);
      case "insert":
        var B = blocks && blocks[e.block]; if (!B || (depth || 0) > 8) return [];
        var M = mInsert(e, B.base), out = [];
        B.ents.forEach(function (x) { segsOf(x, blocks, (depth || 0) + 1).forEach(function (s) { out.push(xformSeg(s, M)); }); });
        return out;
      case "dim": return dimSegs(e);
      default: return EP.bim && EP.bim.TYPES[e.t] ? EP.bim.segs(e) : [];
    }
  }
  function rectPts(e) { var r = (e.rot || 0) * Math.PI / 180, p = e.p, w = e.w, h = e.h; return [[0, 0], [w, 0], [w, h], [0, h]].map(function (q) { return [p[0] + q[0] * Math.cos(r) - q[1] * Math.sin(r), p[1] + q[0] * Math.sin(r) + q[1] * Math.cos(r)]; }); }
  function dimSegs(d) { var g = dimGeom(d); return g ? g.lines.map(function (l) { return { k: "L", a: l[0], b: l[1] }; }) : []; }
  function xformSeg(s, M) {
    if (s.k === "L") return { k: "L", a: mApply(M, s.a), b: mApply(M, s.b) };
    var det = M[0] * M[3] - M[1] * M[2], sc = Math.sqrt(Math.abs(det)), c = mApply(M, s.c), rr = Math.atan2(M[1], M[0]);
    if (s.full) return { k: "A", c: c, r: s.r * sc, s: 0, e: TAU, full: true };
    if (det < 0) { var p1 = mApply(M, polar(s.c, s.r, s.s)), p2 = mApply(M, polar(s.c, s.r, s.e)); return { k: "A", c: c, r: s.r * sc, s: ang(c, p2), e: ang(c, p1) }; }
    return { k: "A", c: c, r: s.r * sc, s: s.s + rr, e: s.e + rr };
  }

  /* ---------- dimensions: geometry from definition points ---------- */
  function dimGeom(d) {
    var st = d.st || {}, ar = st.ar || 2.5, ex = st.exo || 1.25, ext = st.exe || 1.25, k = d.sc || 1;   // st.* in paper mm; k = drawing scale (model mm per paper mm)
    ar *= k; ex *= k; ext *= k;
    var lines = [], arrows = [], txt, tp, tr = 0, val;
    if (d.kind === "lin" || d.kind === "ali") {
      var a = d.a, b = d.b, p = d.p, dir;
      if (d.kind === "ali") dir = norm(sub(b, a));
      else { var hz = d.rot != null ? d.rot * Math.PI / 180 : (Math.abs(p[1] - (a[1] + b[1]) / 2) * 1.0001 >= Math.abs(p[0] - (a[0] + b[0]) / 2) ? 0 : Math.PI / 2); dir = [Math.cos(hz), Math.sin(hz)]; }
      if (len(dir) < EPS) return null;
      var n = perp(dir), off = dot(sub(p, a), n), a2 = add(a, mul(n, off)), b2 = add(b, mul(n, off + dot(sub(a, b), n)));
      val = Math.abs(dot(sub(b, a), dir));
      var sgA = Math.sign(dot(sub(a2, a), n)) || 1, sgB = Math.sign(dot(sub(b2, b), n)) || 1;
      lines.push([add(a, mul(n, sgA * ex)), add(a2, mul(n, sgA * ext))], [add(b, mul(n, sgB * ex)), add(b2, mul(n, sgB * ext))], [a2, b2]);
      var u = norm(sub(b2, a2)); arrows.push([a2, u], [b2, mul(u, -1)]);
      tr = Math.atan2(u[1], u[0]); if (tr > Math.PI / 2 + 1e-6 || tr < -Math.PI / 2 + 1e-6) tr += Math.PI;
      tp = add(mid(a2, b2), mul(perp([Math.cos(tr), Math.sin(tr)]), (st.gap || 1) * k));
    } else if (d.kind === "rad" || d.kind === "dia") {
      var c = d.c, r = d.r, at = d.p ? ang(c, d.p) : 0.7, pt = polar(c, r, at), pt2 = d.kind === "dia" ? polar(c, r, at + Math.PI) : c;
      val = d.kind === "dia" ? 2 * r : r; lines.push([pt2, d.p && dist(c, d.p) > r ? d.p : pt]);
      arrows.push([pt, norm(sub(c, pt))]); if (d.kind === "dia") arrows.push([pt2, norm(sub(c, pt2))]);
      tp = d.p || pt; tr = 0;
    } else if (d.kind === "ang") {
      var c2 = d.c, a1 = ang(c2, d.a), a2b = ang(c2, d.b), rr = dist(c2, d.p), sw = an(a2b - a1);
      val = sw * 180 / Math.PI; var segs = 32, prev = polar(c2, rr, a1);
      for (var i = 1; i <= segs; i++) { var q = polar(c2, rr, a1 + sw * i / segs); lines.push([prev, q]); prev = q; }
      arrows.push([polar(c2, rr, a1), [-Math.sin(a1), Math.cos(a1)]], [polar(c2, rr, a2b), [Math.sin(a2b), -Math.cos(a2b)]]);
      var am = a1 + sw / 2; tp = polar(c2, rr + (st.gap || 1) * k + (st.th || 2.5) * k * 0.5, am); tr = am - Math.PI / 2; if (tr > Math.PI / 2 || tr < -Math.PI / 2) tr += Math.PI;
    } else if (d.kind === "ord") {
      val = d.axis === "x" ? d.a[0] - (d.o ? d.o[0] : 0) : d.a[1] - (d.o ? d.o[1] : 0);
      lines.push([d.a, d.p]); tp = d.p; tr = d.axis === "x" ? Math.PI / 2 : 0;
    } else return null;
    return { lines: lines, arrows: arrows, val: val, tp: tp, tr: tr, ar: ar };
  }

  /* ---------- per segment ---------- */
  function segLen(s) { return s.k === "L" ? dist(s.a, s.b) : s.r * sweep(s); }
  function segStart(s) { return s.k === "L" ? s.a : polar(s.c, s.r, s.s); }
  function segEnd(s) { return s.k === "L" ? s.b : polar(s.c, s.r, s.full ? s.s + TAU : s.e); }
  function segAt(s, t) { return s.k === "L" ? lerp(s.a, s.b, t) : polar(s.c, s.r, s.s + sweep(s) * t); }
  function segParam(s, p) { if (s.k === "L") { var d = sub(s.b, s.a), l2 = dot(d, d); return l2 < EPS ? 0 : dot(sub(p, s.a), d) / l2; } return an(ang(s.c, p) - s.s) / sweep(s); }
  function closest(s, p) {
    if (s.k === "L") { var t = Math.max(0, Math.min(1, segParam(s, p))), q = lerp(s.a, s.b, t); return { p: q, t: t, d: dist(p, q) }; }
    var a = ang(s.c, p), q2, t2;
    if (onArc(s, a)) { q2 = polar(s.c, s.r, a); t2 = an(a - s.s) / sweep(s); }
    else { var A = segStart(s), B = segEnd(s); if (dist(p, A) < dist(p, B)) { q2 = A; t2 = 0; } else { q2 = B; t2 = 1; } }
    return { p: q2, t: t2, d: dist(p, q2) };
  }
  /* intersections of two segments. ext1 / ext2: treat lines as infinite and arcs as full circles */
  function intersect(s1, s2, ext1, ext2) {
    var out = [];
    if (s1.k === "L" && s2.k === "L") {
      var r = sub(s1.b, s1.a), q = sub(s2.b, s2.a), den = cross(r, q); if (Math.abs(den) < 1e-12) return out;
      var w = sub(s2.a, s1.a), t = cross(w, q) / den, u = cross(w, r) / den;
      if ((ext1 || (t >= -1e-9 && t <= 1 + 1e-9)) && (ext2 || (u >= -1e-9 && u <= 1 + 1e-9))) out.push(add(s1.a, mul(r, t)));
      return out;
    }
    if (s1.k === "A" && s2.k === "L") return intersect(s2, s1, ext2, ext1);
    if (s1.k === "L" && s2.k === "A") {
      var d = sub(s1.b, s1.a), f = sub(s1.a, s2.c), A = dot(d, d), B = 2 * dot(f, d), C = dot(f, f) - s2.r * s2.r, disc = B * B - 4 * A * C;
      if (A < EPS || disc < -1e-9) return out; disc = Math.sqrt(Math.max(0, disc));
      [(-B - disc) / (2 * A), (-B + disc) / (2 * A)].forEach(function (tt, i) {
        if (i === 1 && disc < 1e-12) return;
        if (!ext1 && (tt < -1e-9 || tt > 1 + 1e-9)) return;
        var P = add(s1.a, mul(d, tt)); if (ext2 || onArc(s2, ang(s2.c, P))) out.push(P);
      });
      return out;
    }
    var dd = dist(s1.c, s2.c); if (dd < EPS || dd > s1.r + s2.r + 1e-9 || dd < Math.abs(s1.r - s2.r) - 1e-9) return out;
    var a = (s1.r * s1.r - s2.r * s2.r + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, s1.r * s1.r - a * a)), m = add(s1.c, mul(sub(s2.c, s1.c), a / dd)), n = perp(norm(sub(s2.c, s1.c)));
    [add(m, mul(n, h)), add(m, mul(n, -h))].forEach(function (P, i) { if (i === 1 && h < 1e-9) return; if ((ext1 || onArc(s1, ang(s1.c, P))) && (ext2 || onArc(s2, ang(s2.c, P)))) out.push(P); });
    return out;
  }
  function segsLength(S) { return S.reduce(function (a, s) { return a + segLen(s); }, 0); }

  /* ---------- area (shoelace + bulge segments) ---------- */
  function plineArea(pts) {
    var A = 0, n = pts.length; if (n < 3 && !pts.some(function (p) { return p[2]; })) return 0;
    for (var i = 0; i < n; i++) {
      var p = pts[i], q = pts[(i + 1) % n]; A += p[0] * q[1] - q[0] * p[1];
      var b = p[2] || 0; if (b) { var th = 4 * Math.atan(b), c = dist(p, q), r = c / (2 * Math.sin(Math.abs(th) / 2)); A += 2 * Math.sign(b) * (r * r * (Math.abs(th) - Math.sin(Math.abs(th))) / 2); }
    }
    return A / 2;   // signed: + counter-clockwise
  }
  function entArea(e) {
    if (e.t === "circle") return Math.PI * e.r * e.r;
    if (e.t === "pline" && e.closed) return Math.abs(plineArea(e.pts));
    if (e.t === "ellipse" && e.a1 == null) return Math.PI * e.rx * e.ry;
    if (e.t === "hatch") return (e.loops || []).reduce(function (a, L, i) { var v = Math.abs(plineArea(L)); return i === 0 ? v : a - v; }, 0);
    if (e.t === "spline" && e.closed) return Math.abs(plineArea(splinePts(e)));
    if ((e.t === "slab" || e.t === "room" || e.t === "roof") && e.pts) return Math.abs(plineArea(e.pts.map(function (p) { return [p[0], p[1], 0]; })));
    return null;
  }
  function entLength(e, blocks) { if (e.t === "wall" || e.t === "beam") return dist(e.a, e.b); if (e.t === "door" || e.t === "window" || e.t === "opening") return e.w; if (e.t === "column" || e.t === "footing" || e.t === "slab" || e.t === "room" || e.t === "roof") return null; if (e.t === "text" || e.t === "dim" || e.t === "point" || e.t === "image" || e.t === "hatch") return null; return segsLength(segsOf(e, blocks)); }
  function inPoly(p, poly) { var c = false; for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) { var a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function loopPts(pts) {   // polygon with arcs flattened
    var out = []; plineSegs(pts, true).forEach(function (s) { if (s.k === "L") out.push(s.a); else { var n = Math.max(4, Math.ceil(sweep(s) / (Math.PI / 24))); for (var i = 0; i < n; i++) out.push(s.rev ? polar(s.c, s.r, s.e - sweep(s) * i / n) : polar(s.c, s.r, s.s + sweep(s) * i / n)); } }); return out;
  }

  /* ---------- bounding box ---------- */
  function bboxSegs(S) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    S.forEach(function (s) {
      if (s.inf) return;
      if (s.k === "L") [s.a, s.b].forEach(function (p) { ext(b, p); });
      else { ext(b, segStart(s)); ext(b, segEnd(s)); for (var k = 0; k < 4; k++) { var t = k * Math.PI / 2; if (onArc(s, t)) ext(b, polar(s.c, s.r, t)); } }
    });
    return b;
  }
  function ext(b, p) { if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1]; if (p[0] > b[2]) b[2] = p[0]; if (p[1] > b[3]) b[3] = p[1]; }
  function textBox(e) { var h = e.h || 2.5, lines = String(e.s || "").split("\n"), w = Math.max.apply(null, lines.map(function (l) { return l.length; })) * h * 0.62, H = lines.length * h * 1.5, r = (e.rot || 0) * Math.PI / 180;
    var al = e.al || "l", dx = al.indexOf("c") >= 0 ? -w / 2 : al.indexOf("r") >= 0 ? -w : 0, top = h;
    return [[dx, top - H], [dx + w, top - H], [dx + w, top], [dx, top]].map(function (q) { return [e.p[0] + q[0] * Math.cos(r) - q[1] * Math.sin(r), e.p[1] + q[0] * Math.sin(r) + q[1] * Math.cos(r)]; }); }
  function bbox(e, blocks) {
    if (e.t === "text") { var b = [Infinity, Infinity, -Infinity, -Infinity]; textBox(e).forEach(function (p) { ext(b, p); }); return b; }
    if (e.t === "point") return [e.p[0], e.p[1], e.p[0], e.p[1]];
    if (e.t === "dim") { var g = dimGeom(e), bb = bboxSegs(dimSegs(e)); if (g && g.tp) ext(bb, g.tp); return bb; }
    return bboxSegs(segsOf(e, blocks));
  }

  /* ---------- transforms (move / rotate / scale / mirror) on entities, by an affine matrix ---------- */
  function mTrans(dx, dy) { return [1, 0, 0, 1, dx, dy]; }
  function mRot(c, t) { var cs = Math.cos(t), sn = Math.sin(t); return [cs, sn, -sn, cs, c[0] - c[0] * cs + c[1] * sn, c[1] - c[0] * sn - c[1] * cs]; }
  function mScale(c, k) { return [k, 0, 0, k, c[0] * (1 - k), c[1] * (1 - k)]; }
  function mMirror(a, b) { var d = norm(sub(b, a)), cs = d[0] * d[0] - d[1] * d[1], sn = 2 * d[0] * d[1], M = [cs, sn, sn, -cs, 0, 0], p = mApply(M, a); M[4] = a[0] - p[0]; M[5] = a[1] - p[1]; return M; }
  function xform(e, M) {
    if (EP.bim && EP.bim.TYPES[e.t]) return EP.bim.xform(e, M);
    var det = M[0] * M[3] - M[1] * M[2], sc = Math.sqrt(Math.abs(det)), rr = Math.atan2(M[1], M[0]) * 180 / Math.PI, mir = det < 0, P = function (p) { var q = mApply(M, p); if (p.length > 2) q.push(mir ? -(p[2] || 0) : p[2]); return q; };
    var o = JSON.parse(JSON.stringify(e));
    switch (e.t) {
      case "line": o.a = P(e.a); o.b = P(e.b); break;
      case "xline": case "ray": o.p = P(e.p); var d2 = sub(mApply(M, add(e.p, e.dir)), o.p); o.dir = norm(d2); break;
      case "pline": case "spline": case "leader": o.pts = e.pts.map(P); break;
      case "point": o.p = P(e.p); break;
      case "circle": o.c = P(e.c); o.r = e.r * sc; break;
      case "arc":
        o.c = P(e.c); o.r = e.r * sc;
        if (mir) { var p1 = mApply(M, polar(e.c, e.r, e.a1 * Math.PI / 180)), p2 = mApply(M, polar(e.c, e.r, e.a2 * Math.PI / 180)); o.a1 = ang(o.c, p2) * 180 / Math.PI; o.a2 = ang(o.c, p1) * 180 / Math.PI; }
        else { o.a1 = e.a1 + rr; o.a2 = e.a2 + rr; } break;
      case "ellipse":
        o.c = P(e.c); o.rx = e.rx * sc; o.ry = e.ry * sc;
        if (mir) { var ax = mApply(M, polar(e.c, 1, (e.rot || 0) * Math.PI / 180)); o.rot = ang(o.c, [ax[0], ax[1]]) * 180 / Math.PI; if (e.a1 != null) { o.a1 = -e.a2; o.a2 = -e.a1; } }
        else o.rot = (e.rot || 0) + rr; break;
      case "text": o.p = P(e.p); o.h = e.h * sc; if (!mir) o.rot = (e.rot || 0) + rr; else { var dv = sub(mApply(M, polar(e.p, 1, (e.rot || 0) * Math.PI / 180)), mApply(M, e.p)); var t2 = Math.atan2(dv[1], dv[0]) * 180 / Math.PI; o.rot = Math.abs(t2) > 90 ? t2 + 180 : t2; } break;
      case "dim": ["a", "b", "p", "c", "o"].forEach(function (k) { if (e[k]) o[k] = P(e[k]); }); if (e.r) o.r = e.r * sc; if (e.rot != null && !mir) o.rot = e.rot + rr; break;
      case "hatch": o.loops = e.loops.map(function (L) { return L.map(P); }); if (mir) o.loops = o.loops.map(function (L) { return L.slice().reverse().map(function (p, i, arr) { var nx = arr[(i + 1) % arr.length]; return [p[0], p[1], -(nx[2] || 0)]; }); }); o.sc = (e.sc || 1) * sc; o.ang = (e.ang || 0) + (mir ? -rr : rr); break;
      case "insert": o.p = P(e.p); o.rot = (e.rot || 0) + rr; o.sx = (e.sx == null ? 1 : e.sx) * sc * (mir ? -1 : 1); o.sy = (e.sy == null ? (e.sx == null ? 1 : e.sx) : e.sy) * sc; if (mir) o.rot = (e.rot || 0) - rr; break;
      case "image": o.p = P(e.p); o.w = e.w * sc; o.h = e.h * sc; o.rot = (e.rot || 0) + rr; break;
      default: break;
    }
    return o;
  }

  /* ---------- offset ---------- */
  function offsetLineSeg(a, b, d) { var n = perp(norm(sub(b, a))); return [add(a, mul(n, d)), add(b, mul(n, d))]; }
  function sideOf(e, p, blocks) {   // + when p is on the left of the entity (or outside a circle)
    if (e.t === "circle" || e.t === "arc") return dist(p, e.c) > e.r ? 1 : -1;
    var S = segsOf(e, blocks), best = null; S.forEach(function (s) { var c = closest(s, p); if (!best || c.d < best.c.d) best = { s: s, c: c }; });
    if (!best) return 1; var s = best.s;
    if (s.k === "L") return cross(sub(s.b, s.a), sub(p, s.a)) >= 0 ? 1 : -1;
    var out = dist(p, s.c) > s.r; return (s.rev ? !out : out) ? -1 : 1;
  }
  function sideOfLine(e, p) { return cross(sub(e.b, e.a), sub(p, e.a)) >= 0 ? 1 : -1; }
  function offset(e, d, p, blocks) {
    var sd = sideOf(e, p, blocks) * d, o = JSON.parse(JSON.stringify(e)); delete o.id;
    if (e.t === "line" || e.t === "wall" || e.t === "beam") { var q = offsetLineSeg(e.a, e.b, e.t === "line" ? sd : sideOfLine(e, p) * d); o.a = q[0]; o.b = q[1]; return o; }
    if (e.t === "circle" || e.t === "arc") { o.r = e.r + (sideOf(e, p) > 0 ? d : -d); return o.r > 1e-6 ? o : null; }
    if (e.t === "xline" || e.t === "ray") { o.p = add(e.p, mul(perp(norm(e.dir)), sd)); return o; }
    if (e.t === "pline") {
      var pts = e.pts, n = pts.length, cl = e.closed, raw = [];
      for (var i = 0; i < (cl ? n : n - 1); i++) {
        var a = pts[i], b = pts[(i + 1) % n], bu = a[2] || 0;
        if (Math.abs(bu) > 1e-9) { var A = bulgeArc(a, b, bu), sgn = bu > 0 ? -1 : 1, rr = A.r + sgn * sd; if (rr <= 1e-6) return null; var a1 = polar(A.c, rr, ang(A.c, a)), b1 = polar(A.c, rr, ang(A.c, b)); raw.push({ a: a1, b: b1, bu: bu, arc: true }); }
        else { var q2 = offsetLineSeg(a, b, sd); raw.push({ a: q2[0], b: q2[1], bu: 0 }); }
      }
      var out = [];
      for (var j = 0; j < raw.length; j++) {
        var cur = raw[j], prev = raw[(j - 1 + raw.length) % raw.length], P0 = cur.a;
        if ((cl || j > 0) && !cur.arc && !prev.arc) { var X = intersect({ k: "L", a: prev.a, b: prev.b }, { k: "L", a: cur.a, b: cur.b }, true, true); if (X.length) P0 = X[0]; }
        else if ((cl || j > 0) && !eq(prev.b, cur.a, 1e-6)) out.push([prev.b[0], prev.b[1], 0]);
        out.push([P0[0], P0[1], cur.bu]);
      }
      if (!cl) { var last = raw[raw.length - 1]; out.push([last.b[0], last.b[1], 0]); }
      o.pts = out; return o;
    }
    if (e.t === "ellipse" || e.t === "spline") { var pp = e.t === "ellipse" ? approxEllipse(e) : splinePts(e); var pl = { t: "pline", pts: pp.map(function (x) { return [x[0], x[1], 0]; }), closed: e.t === "ellipse" ? e.a1 == null : !!e.closed, layer: e.layer }; return offset(pl, d, p); }
    return null;
  }

  /* ---------- trim / extend / break ---------- */
  function cutParams(seg, cutters, self) {
    var ts = [];
    cutters.forEach(function (c) { if (c === self) return; intersect(seg, c, false, false).forEach(function (P) { var t = segParam(seg, P); if (seg.k === "A" && seg.full) t = an(ang(seg.c, P)) / TAU; ts.push(t); }); });
    return ts.sort(function (a, b) { return a - b; });
  }
  /* entity e trimmed at the piece that contains pick point p, using cutting segments C. Returns list of new entities (0, 1 or 2) or null if nothing to trim */
  function trim(e, C, p, blocks) {
    if (e.t === "line" || e.t === "wall" || e.t === "beam") {
      var s = { k: "L", a: e.a, b: e.b }, ts = cutParams(s, C).filter(function (t) { return t > 1e-7 && t < 1 - 1e-7; }); if (!ts.length) return null;
      var tp = segParam(s, p), lo = 0, hi = 1; ts.forEach(function (t) { if (t < tp) lo = Math.max(lo, t); else hi = Math.min(hi, t); });
      var out = []; if (lo > 1e-7) out.push(Object.assign({}, e, { a: e.a, b: lerp(e.a, e.b, lo) })); if (hi < 1 - 1e-7) out.push(Object.assign({}, e, { a: lerp(e.a, e.b, hi), b: e.b })); return out;
    }
    if (e.t === "circle") {
      var sc = { k: "A", c: e.c, r: e.r, s: 0, e: TAU, full: true }, angs = []; C.forEach(function (c) { intersect(sc, c).forEach(function (P) { angs.push(an(ang(e.c, P))); }); });
      angs = uniq(angs.sort(function (a, b) { return a - b; })); if (angs.length < 2) return null;
      var ap = an(ang(e.c, p)), i = 0; while (i < angs.length && angs[i] < ap) i++;
      var aHi = angs[i % angs.length], aLo = angs[(i - 1 + angs.length) % angs.length];   // remove arc aLo→aHi (ccw) which contains ap
      return [{ t: "arc", c: e.c, r: e.r, a1: aHi * 180 / Math.PI, a2: aLo * 180 / Math.PI, layer: e.layer, color: e.color, lw: e.lw, lt: e.lt }];
    }
    if (e.t === "arc") {
      var sa = segsOf(e)[0], ts2 = []; C.forEach(function (c) { intersect(sa, c).forEach(function (P) { var t = an(ang(e.c, P) - sa.s) / sweep(sa); if (t > 1e-7 && t < 1 - 1e-7) ts2.push(t); }); });
      if (!ts2.length) return null; ts2 = uniq(ts2.sort(function (a, b) { return a - b; }));
      var tp2 = an(ang(e.c, p) - sa.s) / sweep(sa), lo2 = 0, hi2 = 1; ts2.forEach(function (t) { if (t < tp2) lo2 = Math.max(lo2, t); else hi2 = Math.min(hi2, t); });
      var sw = sweep(sa), out2 = [], A0 = sa.s * 180 / Math.PI;
      if (lo2 > 1e-7) out2.push(Object.assign({}, e, { a1: A0, a2: A0 + sw * lo2 * 180 / Math.PI }));
      if (hi2 < 1 - 1e-7) out2.push(Object.assign({}, e, { a1: A0 + sw * hi2 * 180 / Math.PI, a2: e.a2 }));
      return out2;
    }
    if (e.t === "pline") {
      var S = plineSegs(e.pts, e.closed), L = segsLength(S), cuts = [], acc = 0, pickD = null, bestD = Infinity;
      S.forEach(function (s) { var l = segLen(s); cutParams(s, C).forEach(function (t) { if (t > -1e-9 && t < 1 + 1e-9) cuts.push(acc + (s.rev ? 1 - t : t) * l); }); var cp = closest(s, p); if (cp.d < bestD) { bestD = cp.d; pickD = acc + (s.rev ? 1 - cp.t : cp.t) * l; } acc += l; });
      cuts = uniq(cuts.sort(function (a, b) { return a - b; })).filter(function (x) { return e.closed || (x > 1e-6 && x < L - 1e-6); });
      if (!cuts.length || (e.closed && cuts.length < 2)) return null;
      if (!e.closed) {
        var lo3 = 0, hi3 = L; cuts.forEach(function (x) { if (x < pickD) lo3 = Math.max(lo3, x); else hi3 = Math.min(hi3, x); });
        var o3 = []; if (lo3 > 1e-6) o3.push(Object.assign({}, e, { pts: subPline(e.pts, false, 0, lo3) })); if (hi3 < L - 1e-6) o3.push(Object.assign({}, e, { pts: subPline(e.pts, false, hi3, L) })); return o3;
      }
      var k = 0; while (k < cuts.length && cuts[k] < pickD) k++;
      var from = cuts[k % cuts.length], to = cuts[(k - 1 + cuts.length) % cuts.length];
      return [Object.assign({}, e, { closed: false, pts: subPline(e.pts, true, from, to < from ? to + L : to) })];
    }
    if (e.t === "xline" || e.t === "ray") {
      var s2 = segsOf(e)[0], ts3 = cutParams(s2, C); if (!ts3.length) return null; var tp3 = segParam(s2, p), lo4 = null, hi4 = null; ts3.forEach(function (t) { if (t < tp3) lo4 = lo4 == null ? t : Math.max(lo4, t); else hi4 = hi4 == null ? t : Math.min(hi4, t); });
      var out4 = [], A = s2.a, B = s2.b;
      if (e.t === "xline") { if (lo4 != null) out4.push({ t: "ray", p: lerp(A, B, lo4), dir: mul(norm(e.dir), -1), layer: e.layer }); if (hi4 != null) out4.push({ t: "ray", p: lerp(A, B, hi4), dir: norm(e.dir), layer: e.layer }); }
      else { if (lo4 != null) out4.push({ t: "line", a: e.p, b: lerp(A, B, lo4), layer: e.layer }); if (hi4 != null) out4.push({ t: "ray", p: lerp(A, B, hi4), dir: e.dir, layer: e.layer }); }
      return out4;
    }
    return null;
  }
  function uniq(a) { var o = []; a.forEach(function (x) { if (!o.length || Math.abs(x - o[o.length - 1]) > 1e-7) o.push(x); }); return o; }
  /* part of a polyline between distances d1..d2 along it (closed: wraps) */
  function subPline(pts, closed, d1, d2) {
    var S = plineSegs(pts, closed), L = segsLength(S), out = [];
    function push(P, b) { if (out.length && eq(out[out.length - 1], P, 1e-7)) { out[out.length - 1][2] = b; return; } out.push([P[0], P[1], b]); }
    var acc = 0, loops = closed ? 2 : 1;
    for (var lp = 0; lp < loops; lp++) for (var i = 0; i < S.length; i++) {
      var s = S[i], l = segLen(s), A = acc, B = acc + l; acc = B;
      var a = Math.max(d1, A), b = Math.min(d2, B); if (b - a <= 1e-9) continue;
      var ta = (a - A) / l, tb = (b - A) / l, P0 = pointOnSeg(s, ta), bul = 0;
      if (s.k === "A") { var sw = sweep(s) * (tb - ta); bul = Math.tan(sw / 4) * (s.rev ? -1 : 1); }
      push(P0, bul); var P1 = pointOnSeg(s, tb); push(P1, 0);
    }
    return out;
  }
  function pointOnSeg(s, t) { if (s.k === "L") return lerp(s.a, s.b, t); return s.rev ? polar(s.c, s.r, s.e - sweep(s) * t) : polar(s.c, s.r, s.s + sweep(s) * t); }
  /* extend the end of e nearest to p up to the nearest boundary */
  function extend(e, C, p) {
    if (e.t === "line" || e.t === "wall" || e.t === "beam") {
      var endB = dist(p, e.b) < dist(p, e.a), from = endB ? e.b : e.a, dir = norm(endB ? sub(e.b, e.a) : sub(e.a, e.b)), ray = { k: "L", a: from, b: add(from, dir) }, best = null;
      C.forEach(function (c) { intersect(ray, c, true, false).forEach(function (P) { var t = dot(sub(P, from), dir); if (t > 1e-6 && (best == null || t < best)) best = t; }); });
      if (best == null) return null; var np = add(from, mul(dir, best)); return Object.assign({}, e, endB ? { b: np } : { a: np });
    }
    if (e.t === "arc") {
      var sa = segsOf(e)[0], atEnd = dist(p, segEnd(sa)) < dist(p, segStart(sa)), full = { k: "A", c: e.c, r: e.r, s: 0, e: TAU, full: true }, bestA = null;
      C.forEach(function (c) { intersect(full, c, false, false).forEach(function (P) { var a = ang(e.c, P), d = atEnd ? an(a - sa.e) : an(sa.s - a); if (d > 1e-7 && d < TAU - sweep(sa) - 1e-9 && (bestA == null || d < bestA)) bestA = d; }); });
      if (bestA == null) return null; var deg = bestA * 180 / Math.PI; return Object.assign({}, e, atEnd ? { a2: e.a2 + deg } : { a1: e.a1 - deg });
    }
    if (e.t === "pline" && !e.closed && e.pts.length >= 2) {
      var n = e.pts.length, last = dist(p, e.pts[n - 1]) < dist(p, e.pts[0]), A = last ? e.pts[n - 2] : e.pts[1], B = last ? e.pts[n - 1] : e.pts[0];
      if ((last ? A[2] : B[2])) return null;
      var r = extend({ t: "line", a: A, b: B }, C, B); if (!r) return null;
      var pts = e.pts.map(function (q) { return q.slice(); }); if (last) pts[n - 1] = [r.b[0], r.b[1], 0]; else pts[0] = [r.b[0], r.b[1], pts[0][2] || 0];
      return Object.assign({}, e, { pts: pts });
    }
    return null;
  }

  /* ---------- fillet / chamfer between two lines ---------- */
  function fillet(e1, p1, e2, p2, r, chamfer) {
    var LN = { line: 1, wall: 1, beam: 1 }; if (!LN[e1.t] || !LN[e2.t]) return null;
    var X = intersect({ k: "L", a: e1.a, b: e1.b }, { k: "L", a: e2.a, b: e2.b }, true, true); if (!X.length) return null; X = X[0];
    // keep the part of each line on the side of the pick point
    function keep(e, p) { var d = norm(sub(p, X)), far = dot(sub(e.a, X), d) > dot(sub(e.b, X), d) ? e.a : e.b; return { far: far, dir: norm(sub(far, X)) }; }
    var k1 = keep(e1, p1), k2 = keep(e2, p2);
    if (!r || r < 1e-9) return { a: Object.assign({}, e1, { a: k1.far, b: X }), b: Object.assign({}, e2, { a: k2.far, b: X }), add: null };
    if (chamfer) { var c1 = add(X, mul(k1.dir, r)), c2 = add(X, mul(k2.dir, chamfer === true ? r : chamfer)); return { a: Object.assign({}, e1, { a: k1.far, b: c1 }), b: Object.assign({}, e2, { a: k2.far, b: c2 }), add: { t: "line", a: c1, b: c2, layer: e1.layer } }; }
    var th = Math.acos(Math.max(-1, Math.min(1, dot(k1.dir, k2.dir)))); if (th < 1e-6 || Math.abs(th - Math.PI) < 1e-6) return null;
    var tl = r / Math.tan(th / 2), T1 = add(X, mul(k1.dir, tl)), T2 = add(X, mul(k2.dir, tl)), bis = norm(add(k1.dir, k2.dir)), C = add(X, mul(bis, r / Math.sin(th / 2)));
    var a1 = ang(C, T1), a2 = ang(C, T2), ccw = an(a2 - a1) < Math.PI;
    return { a: Object.assign({}, e1, { a: k1.far, b: T1 }), b: Object.assign({}, e2, { a: k2.far, b: T2 }), add: { t: "arc", c: C, r: r, a1: (ccw ? a1 : a2) * 180 / Math.PI, a2: (ccw ? a2 : a1) * 180 / Math.PI, layer: e1.layer } };
  }
  /* join lines/arcs/plines that share end points into one polyline. Vertex i carries the bulge of the segment i → i+1 */
  function join(ents) {
    var pieces = ents.map(function (e) {
      if (e.t === "line") return [[e.a[0], e.a[1], 0], [e.b[0], e.b[1], 0]];
      if (e.t === "arc") { var s = segsOf(e)[0], P = segStart(s), Q = segEnd(s); return [[P[0], P[1], Math.tan(sweep(s) / 4)], [Q[0], Q[1], 0]]; }
      if (e.t === "pline" && !e.closed) return e.pts.map(function (p) { return [p[0], p[1], p[2] || 0]; });
      return null;
    }).filter(Boolean);
    if (!pieces.length) return null;
    function rev(P) { var n = P.length, o = []; for (var j = 0; j < n; j++) { var v = P[n - 1 - j]; o.push([v[0], v[1], j < n - 1 ? -(P[n - 2 - j][2] || 0) : 0]); } return o; }
    function cat(A, B) { var o = A.slice(0, -1).map(function (v) { return v.slice(); }); var t = A[A.length - 1]; o.push([t[0], t[1], B[0][2] || 0]); return o.concat(B.slice(1).map(function (v) { return v.slice(); })); }
    var cur = pieces.shift(), tol = 1e-3, changed = true;
    while (changed && pieces.length) {
      changed = false;
      for (var i = 0; i < pieces.length; i++) {
        var P = pieces[i], h = cur[0], t = cur[cur.length - 1];
        if (eq(t, P[0], tol)) cur = cat(cur, P);
        else if (eq(t, P[P.length - 1], tol)) cur = cat(cur, rev(P));
        else if (eq(h, P[P.length - 1], tol)) cur = cat(P, cur);
        else if (eq(h, P[0], tol)) cur = cat(rev(P), cur);
        else continue;
        pieces.splice(i, 1); changed = true; break;
      }
    }
    var closed = cur.length > 2 && eq(cur[0], cur[cur.length - 1], tol); if (closed) cur.pop();
    return { pts: cur, closed: closed, left: pieces.length };
  }
  /* explode: pline → lines/arcs; insert → its entities; dim → lines + text; hatch → boundary plines */
  function explode(e, blocks) {
    if (e.t === "pline") return plineSegs(e.pts, e.closed).map(function (s) { return s.k === "L" ? { t: "line", a: s.a, b: s.b } : { t: "arc", c: s.c, r: s.r, a1: s.s * 180 / Math.PI, a2: s.e * 180 / Math.PI }; });
    if (e.t === "insert") { var B = blocks && blocks[e.block]; if (!B) return null; var M = mInsert(e, B.base); return B.ents.map(function (x) { var y = xform(x, M); if (!y.layer || y.layer === "0") y.layer = e.layer; return y; }); }
    if (e.t === "hatch") return e.loops.map(function (L) { return { t: "pline", pts: L, closed: true }; });
    if (e.t === "dim") { var g = dimGeom(e); if (!g) return null; var o = g.lines.map(function (l) { return { t: "line", a: l[0], b: l[1] }; }); o.push({ t: "text", p: g.tp, s: e.txt || "", h: ((e.st || {}).th || 2.5) * (e.sc || 1), rot: g.tr * 180 / Math.PI, al: "c" }); return o; }
    return null;
  }
  /* array copies */
  function rectArray(n1, n2, dx, dy) { var M = []; for (var i = 0; i < n1; i++) for (var j = 0; j < n2; j++) if (i || j) M.push(mTrans(j * dx, i * dy)); return M; }
  function polarArray(c, n, total, rotItems, ref) {
    total = total || 360; var step = (Math.abs(total) >= 360 ? total / n : total / Math.max(1, n - 1)) * Math.PI / 180, M = [];
    for (var i = 1; i < n; i++) { var R = mRot(c, step * i); if (rotItems === false && ref) { var q = mApply(R, ref); R = mTrans(q[0] - ref[0], q[1] - ref[1]); } M.push(R); }
    return M;
  }
  /* circle / arc through 3 points */
  function circle3(a, b, c) {
    var d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])); if (Math.abs(d) < 1e-12) return null;
    var ux = ((a[0] * a[0] + a[1] * a[1]) * (b[1] - c[1]) + (b[0] * b[0] + b[1] * b[1]) * (c[1] - a[1]) + (c[0] * c[0] + c[1] * c[1]) * (a[1] - b[1])) / d;
    var uy = ((a[0] * a[0] + a[1] * a[1]) * (c[0] - b[0]) + (b[0] * b[0] + b[1] * b[1]) * (a[0] - c[0]) + (c[0] * c[0] + c[1] * c[1]) * (b[0] - a[0])) / d;
    return { c: [ux, uy], r: dist([ux, uy], a) };
  }
  function arc3(a, b, c) { var k = circle3(a, b, c); if (!k) return null; var t1 = ang(k.c, a), t2 = ang(k.c, b), t3 = ang(k.c, c), ccw = an(t2 - t1) < an(t3 - t1); return { t: "arc", c: k.c, r: k.r, a1: (ccw ? t1 : t3) * 180 / Math.PI, a2: (ccw ? t3 : t1) * 180 / Math.PI }; }
  function tangentPts(c, r, p) { var d = dist(c, p); if (d <= r) return []; var a = ang(c, p), b = Math.acos(r / d); return [polar(c, r, a + b), polar(c, r, a - b)]; }
  function perpFoot(s, p, ext) { if (s.k === "L") { var t = segParam(s, p); if (!ext && (t < 0 || t > 1)) return null; return lerp(s.a, s.b, t); } var a = ang(s.c, p); return onArc(s, a) || ext ? polar(s.c, s.r, a) : null; }

  EP.geom = { TAU: TAU, sub: sub, add: add, mul: mul, dot: dot, cross: cross, len: len, dist: dist, norm: norm, perp: perp, mid: mid, lerp: lerp, ang: ang, polar: polar, an: an, rot: rot, eq: eq,
    sweep: sweep, onArc: onArc, bulgeArc: bulgeArc, arcBulge: arcBulge, segsOf: segsOf, plineSegs: plineSegs, polySegs: polySegs, approxEllipse: approxEllipse, splinePts: splinePts, rectPts: rectPts, textBox: textBox,
    segLen: segLen, segStart: segStart, segEnd: segEnd, segAt: segAt, segParam: segParam, closest: closest, intersect: intersect, segsLength: segsLength,
    plineArea: plineArea, entArea: entArea, entLength: entLength, inPoly: inPoly, loopPts: loopPts, bbox: bbox, bboxSegs: bboxSegs, ext: ext,
    mApply: mApply, mMul: mMul, mInsert: mInsert, mTrans: mTrans, mRot: mRot, mScale: mScale, mMirror: mMirror, xform: xform, xformSeg: xformSeg,
    offset: offset, sideOf: sideOf, trim: trim, extend: extend, subPline: subPline, fillet: fillet, join: join, explode: explode, rectArray: rectArray, polarArray: polarArray,
    circle3: circle3, arc3: arc3, tangentPts: tangentPts, perpFoot: perpFoot, dimGeom: dimGeom };
})();
