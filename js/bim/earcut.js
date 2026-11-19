/* Polygon (with holes) triangulation by horizontal band decomposition: robust for any simple outline and any number of holes
   (concave outlines, rectangular openings in wall faces, stair holes in slabs). Even-odd filling.
   EP.earcut(outer, holes) → { pts: [[x, y]…], tris: [[i, j, k]…] } with every triangle counter-clockwise (y up). */
(function () {
  "use strict";
  var EP = window.EP = window.EP || {};
  function earcut(outer, holes) {
    var rings = [outer].concat((holes || []).filter(function (h) { return h && h.length >= 3; })), edges = [], ys = [];
    rings.forEach(function (R) { for (var i = 0; i < R.length; i++) { var p = R[i], q = R[(i + 1) % R.length]; ys.push(p[1]); if (Math.abs(p[1] - q[1]) > 1e-12) edges.push(p[1] < q[1] ? [p, q] : [q, p]); } });
    ys.sort(function (a, b) { return a - b; }); var Y = []; ys.forEach(function (y) { if (!Y.length || y - Y[Y.length - 1] > 1e-9) Y.push(y); });
    var pts = [], tris = [];
    function xAt(e, y) { var p = e[0], q = e[1]; return p[0] + (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]); }
    for (var b = 0; b + 1 < Y.length; b++) {
      var y0 = Y[b], y1 = Y[b + 1], ym = (y0 + y1) / 2, act = [];
      edges.forEach(function (e) { if (e[0][1] <= ym && e[1][1] >= ym) act.push({ m: xAt(e, ym), a: xAt(e, y0), b: xAt(e, y1) }); });
      act.sort(function (p, q) { return p.m - q.m; });
      for (var k = 0; k + 1 < act.length; k += 2) {
        var L = act[k], Rr = act[k + 1], i0 = pts.length;
        pts.push([L.a, y0], [Rr.a, y0], [Rr.b, y1], [L.b, y1]);
        if (Rr.a - L.a > 1e-12) tris.push([i0, i0 + 1, i0 + 2]);
        if (Rr.b - L.b > 1e-12) tris.push([i0, i0 + 2, i0 + 3]);
      }
    }
    return { pts: pts, tris: tris };
  }
  EP.earcut = earcut;
})();
