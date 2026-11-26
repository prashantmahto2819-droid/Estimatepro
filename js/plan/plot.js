/* Building Planner — plots that are not rectangles.
   A four-sided plot is given by its sides as in the sale deed / patwari map: front (on the road), right, rear, left, and one
   diagonal (front-left corner to rear-right corner). Without the diagonal the left side is taken square to the front.
   Corners in metres, front-left at (0, 0), the front along +x, the plot going back along +y: [FL, FR, BR, BL].
   The building is placed in the biggest rectangle (square to the front) that fits inside the plot less its setbacks; the cut-off
   corners stay open (parking, garden, tank, septic). */
(function () {
  var EP = window.EP = window.EP || {}, PL = EP.plan = EP.plan || {};
  var circ = function (p, r, q, s, pick) { /* intersection of circles (p, r) and (q, s); pick(point) chooses */ var dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy); if (d > r + s || d < Math.abs(r - s) || d === 0) return null;
    var a = (r * r - s * s + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r * r - a * a)), mx = p[0] + a * dx / d, my = p[1] + a * dy / d, c1 = [mx + h * dy / d, my - h * dx / d], c2 = [mx - h * dy / d, my + h * dx / d]; return pick(c1, c2); };
  PL.plotFromSides = function (o) {
    var a = +o.front, b = +o.right, c = +o.rear, d = +o.left, e = +o.diag || 0; if (!(a > 0 && b > 0 && c > 0 && d > 0)) return null;
    var FL = [0, 0], FR = [a, 0], BR, BL, up = function (p, q) { return p[1] >= q[1] ? p : q; };
    if (e > 0) { BR = circ(FL, e, FR, b, up); if (!BR) return null; BL = circ(FL, d, BR, c, function (p, q) { var cr = function (z) { return (BR[0] - FL[0]) * (z[1] - FL[1]) - (BR[1] - FL[1]) * (z[0] - FL[0]); }; return cr(p) > 0 ? p : q; }); }
    else { BL = [0, d]; BR = circ(FR, b, BL, c, up); }
    if (!BR || !BL) return null; var P = [FL, FR, BR, BL].map(function (q) { return [Math.round(q[0] * 1000) / 1000, Math.round(q[1] * 1000) / 1000]; });
    /* shift so that nothing is left of x = 0 */ var mnx = Math.min.apply(null, P.map(function (q) { return q[0]; })); if (mnx < 0) P = P.map(function (q) { return [q[0] - mnx, q[1]]; });
    return P;
  };
  /* any convex plot from its corner points (from a tap sketch or a CAD polyline): turned so that the chosen road side lies along
     +x at y = 0 with the plot behind it, starting at its left corner */
  PL.normPoly = function (pts, fi) {
    var P = pts.map(function (q) { return [+q[0], +q[1]]; }), n = P.length; if (n < 3) return null; fi = Math.max(0, Math.min(n - 1, fi | 0));
    var sa = 0; P.forEach(function (q, i) { var r = P[(i + 1) % n]; sa += q[0] * r[1] - r[0] * q[1]; }); if (sa < 0) { P = P.slice().reverse(); fi = (n - 2 - fi + n) % n; }
    P = P.slice(fi).concat(P.slice(0, fi)); var a = Math.atan2(P[1][1] - P[0][1], P[1][0] - P[0][0]), c = Math.cos(-a), sn = Math.sin(-a), o = P[0];
    P = P.map(function (q) { var x = q[0] - o[0], y = q[1] - o[1]; return [x * c - y * sn, x * sn + y * c]; });
    var mnx = Math.min.apply(null, P.map(function (q) { return q[0]; })); return P.map(function (q) { return [Math.round((q[0] - mnx) * 1000) / 1000, Math.round(q[1] * 1000) / 1000]; });
  };
  /* turn the plot so that one side wall (side: "left" = the last side, "right" = side 2) runs straight up the drawing: the building,
     always square to the drawing, then follows that side and the road side becomes the slanted one */
  PL.alignPoly = function (P, side) { if (!P || !side || side === "front") return P; var n = P.length, k = side === "right" ? 1 : n - 1, a = P[k], b = P[(k + 1) % n], ang = Math.atan2(b[1] - a[1], b[0] - a[0]), th = (Math.sin(ang) >= 0 ? Math.PI / 2 : -Math.PI / 2) - ang, c = Math.cos(th), sn = Math.sin(th);
    var Q = P.map(function (q) { return [q[0] * c - q[1] * sn, q[0] * sn + q[1] * c]; }), mx = Math.min.apply(null, Q.map(function (q) { return q[0]; })), my = Math.min.apply(null, Q.map(function (q) { return q[1]; }));
    return Q.map(function (q) { return [Math.round((q[0] - mx) * 1000) / 1000, Math.round((q[1] - my) * 1000) / 1000]; }); };
  PL.isConvex = function (P) { var sg = 0, n = P.length; for (var i = 0; i < n; i++) { var a = P[i], b = P[(i + 1) % n], c = P[(i + 2) % n], cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); if (Math.abs(cr) < 1e-9) continue; if (!sg) sg = Math.sign(cr); else if (Math.sign(cr) !== sg) return false; } return true; };
  /* setback of each side: the road side gets the front setback, sides facing back the rear one, the others left / right */
  PL.edgeSetbacks = function (P, R) { return P.map(function (q, i) { if (!i) return R.f; var r = P[(i + 1) % P.length], dx = r[0] - q[0], dy = r[1] - q[1], L = Math.hypot(dx, dy) || 1, nx = dy / L, ny = -dx / L; return ny > Math.abs(nx) ? R.r : ny < -Math.abs(nx) ? R.f : nx > 0 ? R.rt : R.l; }); };
  PL.polyArea = function (P) { var s = 0; P.forEach(function (q, i) { var r = P[(i + 1) % P.length]; s += q[0] * r[1] - r[0] * q[1]; }); return Math.abs(s) / 2; };
  PL.inPoly = function (p, P) { var c = false; for (var i = 0, j = P.length - 1; i < P.length; j = i++) { if ((P[i][1] > p[1]) !== (P[j][1] > p[1]) && p[0] < (P[j][0] - P[i][0]) * (p[1] - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; } return c; };
  /* each edge moved inwards by its own distance (convex plots), corners re-intersected */
  PL.insetPoly = function (P, dist) {
    var n = P.length, L = P.map(function (q, i) { var r = P[(i + 1) % n], dx = r[0] - q[0], dy = r[1] - q[1], l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l; return { p: [q[0] + nx * dist[i], q[1] + ny * dist[i]], d: [dx, dy] }; });
    return L.map(function (A, i) { var Bq = L[(i - 1 + n) % n], den = Bq.d[0] * A.d[1] - Bq.d[1] * A.d[0]; if (Math.abs(den) < 1e-9) return A.p; var t = ((A.p[0] - Bq.p[0]) * A.d[1] - (A.p[1] - Bq.p[1]) * A.d[0]) / den; return [Bq.p[0] + Bq.d[0] * t, Bq.p[1] + Bq.d[1] * t]; });
  };
  /* x-range of a convex polygon at height y */
  var span = function (P, y) { var xs = []; P.forEach(function (q, i) { var r = P[(i + 1) % P.length]; if ((q[1] - y) * (r[1] - y) <= 0 && q[1] !== r[1]) xs.push(q[0] + (y - q[1]) * (r[0] - q[0]) / (r[1] - q[1])); else if (q[1] === y) xs.push(q[0]); }); return xs.length ? [Math.min.apply(null, xs), Math.max.apply(null, xs)] : null; };
  PL.polySpan = span;
  /* biggest rectangle square to the front inside a convex polygon; rooms need at least 3 m each way */
  PL.maxRect = function (P) {
    var ys = P.map(function (q) { return q[1]; }), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys), st = Math.max(0.1, (y1 - y0) / 120), best = null;
    for (var a = y0; a <= y1; a += st) { var sa = span(P, a + 1e-6); if (!sa) continue; for (var b = a + 3; b <= y1 + 1e-6; b += st) { var sb = span(P, b - 1e-6); if (!sb) continue; var x0 = Math.max(sa[0], sb[0]), x1 = Math.min(sa[1], sb[1]); if (x1 - x0 < 3) continue; var A = (x1 - x0) * (b - a); if (!best || A > best.A + 1e-6) best = { A: A, r: [x0, a, x1, b] }; } }
    return best ? best.r.map(function (v) { return Math.round(v * 100) / 100; }) : null;
  };
  /* any simple plot, also one with an inward corner (L / T shaped): a 0.25 m grid of the points that are inside the plot and at
     least the setback of every side away from it, then the biggest rectangle of such points (histogram method) */
  var segD = function (p, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  PL.maxRectGrid = function (P, sb) {
    var st = 0.25, xs = P.map(function (q) { return q[0]; }), ys = P.map(function (q) { return q[1]; }), x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys), nx = Math.ceil((Math.max.apply(null, xs) - x0) / st), ny = Math.ceil((Math.max.apply(null, ys) - y0) / st);
    var ok = function (x, y) { if (!PL.inPoly([x, y], P)) return false; for (var i = 0; i < P.length; i++) if (segD([x, y], P[i], P[(i + 1) % P.length]) < sb[i] - 1e-6) return false; return true; };
    var h = new Array(nx + 1).fill(0), best = null;
    for (var j = 0; j <= ny; j++) { var y = y0 + j * st; for (var i = 0; i <= nx; i++) h[i] = ok(x0 + i * st, y) ? h[i] + 1 : 0;
      var stk = []; for (var k = 0; k <= nx + 1; k++) { var hk = k <= nx ? h[k] : 0; while (stk.length && h[stk[stk.length - 1]] >= hk) { var top = stk.pop(), height = h[top], left = stk.length ? stk[stk.length - 1] + 1 : 0, w = k - left; if (height > 1 && w > 1) { var W = (w - 1) * st, D = (height - 1) * st; if (W >= 3 && D >= 3 && (!best || W * D > best.A)) best = { A: W * D, r: [x0 + left * st, y - D, x0 + left * st + W, y] }; } } if (k <= nx) stk.push(k); } }
    return best ? best.r.map(function (v) { return Math.round(v * 100) / 100; }) : null;
  };
  /* what the layout engine sees: a rectangular "virtual plot" (the polygon's bounding box) whose setbacks put the buildable area
     exactly on the biggest rectangle; area, coverage and FAR still use the real plot area */
  PL.virtualPlot = function (P, R) {
    var sb = PL.edgeSetbacks(P, R), convex = PL.isConvex(P), inner = convex ? PL.insetPoly(P, sb) : P, rect = convex ? PL.maxRect(inner) : PL.maxRectGrid(P, sb); if (!rect) return null;
    var W = Math.max.apply(null, P.map(function (q) { return q[0]; })), D = Math.max.apply(null, P.map(function (q) { return q[1]; }));
    return { plot: { w: Math.round(W * 100) / 100, d: Math.round(D * 100) / 100 }, convex: convex, rules: Object.assign({}, R, { l: rect[0], f: rect[1], rt: Math.round((W - rect[2]) * 100) / 100, r: Math.round((D - rect[3]) * 100) / 100, irregular: 1 }), rect: rect, inner: inner, area: PL.polyArea(P) };
  };
  PL.plotSVG = function (P, v, sc) {
    var W = Math.max.apply(null, P.map(function (q) { return q[0]; })), D = Math.max.apply(null, P.map(function (q) { return q[1]; })); sc = sc || Math.min(260 / W, 260 / D);
    var X = function (x) { return (x * sc + 20).toFixed(1); }, Y = function (y) { return ((D - y) * sc + 14).toFixed(1); }, pts = function (Q) { return Q.map(function (q) { return X(q[0]) + "," + Y(q[1]); }).join(" "); }, o = [];
    o.push("<polygon points='" + pts(P) + "' fill='#f1f8e9' stroke='#33691e' stroke-width='2'/>");
    if (v) { o.push("<polygon points='" + pts(v.inner) + "' fill='none' stroke='#9e9e9e' stroke-dasharray='4 3'/>"); var r = v.rect; o.push("<rect x='" + X(r[0]) + "' y='" + Y(r[3]) + "' width='" + ((r[2] - r[0]) * sc).toFixed(1) + "' height='" + ((r[3] - r[1]) * sc).toFixed(1) + "' fill='#90caf9' fill-opacity='.6' stroke='#1565c0'/><text x='" + X((r[0] + r[2]) / 2) + "' y='" + Y((r[1] + r[3]) / 2) + "' font-size='10' text-anchor='middle'>" + (r[2] - r[0]).toFixed(2) + " × " + (r[3] - r[1]).toFixed(2) + " m</text>"); }
    var lab = P.length === 4 ? ["front", "right", "rear", "left"] : P.map(function (_, i) { return i ? "side " + (i + 1) : "front"; }); P.forEach(function (q, i) { var r2 = P[(i + 1) % P.length], L = Math.hypot(r2[0] - q[0], r2[1] - q[1]); o.push("<text x='" + X((q[0] + r2[0]) / 2) + "' y='" + Y((q[1] + r2[1]) / 2) + "' font-size='9' fill='#33691e' text-anchor='middle' dy='" + (i === 0 ? 11 : i === 2 ? -4 : 3) + "'>" + lab[i] + " " + L.toFixed(2) + "</text>"); });
    o.push("<text x='" + X(W / 2) + "' y='" + (D * sc + 40).toFixed(1) + "' font-size='10' text-anchor='middle'>▲ road</text>");
    return "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 " + (W * sc + 40).toFixed(0) + " " + (D * sc + 48).toFixed(0) + "' style='width:100%;max-width:320px;height:auto'>" + o.join("") + "</svg>";
  };
})();
