/* Estimate Pro — Design Studio → 3D. Registry of "builders": a builder turns a module's input values (and, when available, its result) into a list of
   3D parts for the CAD Studio "dsmodel" entity (see js/bim/dsmodel.js for the part formats). All sizes in mm; x / y in plan, z up from the ground / level.
   DS.to3d.reg(moduleId, function (v, res, H) { return { name: "…", parts: [ … ] }; })   — H = the helper constructors below.
   v   = input values with defaults (the same object the module's run() receives; read the module's params for keys and units)
   res = the module's result when it has been run (may be null) — use it only to pick up sized values such as designed depth / bar diameter. */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {}, T = DS.to3d = DS.to3d || { builders: {} };
  T.reg = function (id, fn) { T.builders[id] = fn; };
  T.has = function (id) { return !!T.builders[id]; };
  T.build = function (id, v, res) {
    var fn = T.builders[id]; if (!fn) return null;
    var m = fn(v || {}, res || {}, T.H); if (!m || !m.parts) return null;
    m.parts = m.parts.filter(function (p) { return p && p.length; }); return m;
  };
  var TAU = Math.PI * 2;
  T.H = {
    /* box by centre */ box: function (cx, cy, w, d, z0, z1, look, rot) { return ["b", cx, cy, w, d, z0, z1, look || "concrete", rot || 0]; },
    /* box by two plan corners */ bx: function (x0, y0, x1, y1, z0, z1, look) { return ["b", (x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), z0, z1, look || "concrete", 0]; },
    cyl: function (cx, cy, r, z0, z1, look, r1) { return ["c", cx, cy, r, z0, z1, look || "concrete", r1]; },
    tube: function (cx, cy, rOut, rIn, z0, z1, look) { return ["t", cx, cy, rOut, rIn, z0, z1, look || "concrete"]; },
    prism: function (pts, z0, z1, look, holes) { return ["p", pts, z0, z1, look || "concrete", holes || null]; },
    /* rectangular member between two 3D points, section bw (across) × bh (deep) */ member: function (a, b, bw, bh, look, roll) { return ["m", a, b, bw, bh, look || "steel_member", roll || 0]; },
    /* I-section member: flange width B, depth D, flange tf, web tw */ ibeam: function (a, b, B, D, tf, tw, look, roll) { return ["i", a, b, B, D, tf, tw, look || "steel_member", roll || 0]; },
    /* thin sheet through four 3D points */ quad: function (a, b, c, d, look) { return ["q", a, b, c, d, look || "sheet_gi"]; },
    /* wedge: prism whose cross-section (in x–z) is the polygon pts [[x,z],…], extruded along y from y0 to y1. Built as a stack of thin horizontal slabs (steps of dz) so that sloped faces look right. */
    wedge: function (pts, y0, y1, look, dz) {
      var zs = pts.map(function (p) { return p[1]; }), zmin = Math.min.apply(null, zs), zmax = Math.max.apply(null, zs), n = Math.max(1, Math.ceil((zmax - zmin) / (dz || 100))), out = [];
      function xr(z) { var xs = []; for (var i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length]; if ((a[1] <= z && b[1] > z) || (b[1] <= z && a[1] > z)) xs.push(a[0] + (z - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); } xs.sort(function (p, q) { return p - q; }); return xs; }
      for (var k = 0; k < n; k++) { var za = zmin + (zmax - zmin) * k / n, zb = zmin + (zmax - zmin) * (k + 1) / n, xs = xr((za + zb) / 2); for (var j = 0; j + 1 < xs.length; j += 2) out.push(["b", (xs[j] + xs[j + 1]) / 2, (y0 + y1) / 2, xs[j + 1] - xs[j], y1 - y0, za, zb, look || "concrete", 0]); }
      return out;
    },
    ring: function (cx, cy, r, n) { var p = []; for (var i = 0; i < (n || 24); i++) { var a = i / (n || 24) * TAU; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return p; }
  };
})();
