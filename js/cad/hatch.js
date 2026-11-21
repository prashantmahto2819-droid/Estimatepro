/* Estimate Pro CAD — hatch patterns (AutoCAD .pat style line families) clipped to boundary loops (even-odd).
   Family: [angle°, x0, y0, dx, dy, dash…]   (dash > 0 pen down, < 0 pen up, 0 dot) — lengths in pattern units (× hatch scale). */
(function () {
  "use strict";
  var EP = window.EP = window.EP || {}, G = EP.geom;
  var P = {
    SOLID: { d: "Solid fill" },
    ANSI31: { d: "45° lines — brick / masonry in section, general", f: [[45, 0, 0, 0, 3.175]] },
    ANSI32: { d: "Steel", f: [[45, 0, 0, 0, 9.525], [45, 4.49013, 0, 0, 9.525]] },
    ANSI37: { d: "45° cross-hatch — rubber / plastic / earth fill", f: [[45, 0, 0, 0, 3.175], [135, 0, 0, 0, 3.175]] },
    ANSI38: { d: "Aluminium", f: [[45, 0, 0, 0, 3.175], [135, 0, 0, 6.35, 3.175, 7.9375, -4.7625]] },
    CROSS: { d: "Square grid", f: [[0, 0, 0, 0, 3.175], [90, 0, 0, 0, 3.175]] },
    NET: { d: "Fine grid", f: [[0, 0, 0, 0, 1.5875], [90, 0, 0, 0, 1.5875]] },
    HORIZ: { d: "Horizontal lines", f: [[0, 0, 0, 0, 3.175]] },
    BRICK: { d: "Brick courses (elevation)", f: [[0, 0, 0, 0, 6.35], [90, 0, 0, 6.35, 6.35, 6.35, -6.35]] },
    BLOCK: { d: "Concrete block courses", f: [[0, 0, 0, 0, 10], [90, 0, 0, 10, 10, 10, -10]] },
    EARTH: { d: "Earth / soil", f: [[0, 0, 0, 6.35, 6.35, 6.35, -6.35], [0, 0, 2.38125, 6.35, 6.35, 6.35, -6.35], [0, 0, 4.7625, 6.35, 6.35, 6.35, -6.35], [90, 0.79375, 5.55625, -6.35, 6.35, 6.35, -6.35], [90, 3.175, 5.55625, -6.35, 6.35, 6.35, -6.35], [90, 5.55625, 5.55625, -6.35, 6.35, 6.35, -6.35]] },
    SAND: { d: "Sand / plaster (dots)", f: [[37.5, 0, 0, 1.123, 1.6, 0, -1.65], [7.5, 0, 0, 2.208, 2.0, 0, -1.6], [-32.5, -1.79, -0.94, 2.161, 1.6, 0, -1.05]] },
    CONC: { d: "Concrete (dots + aggregate)", f: [[50, 0, 0, 4.12, -5.89, 0.75, -8.25], [355, 0, 0, -2.03, 7.03, 0.6, -7.43], [100.45, 0.6, -0.05, 5.8, 7.32, 0.62, -7.67], [46.2, 0, 2, 2.3, -3.53, 0, -6.7], [96.7, 3.5, 1.1, 2.6, 3.47, 0, -6.1], [22.4, 1.3, 4.2, 2.1, 3.1, 0, -5.4]] },
    GRAVEL: { d: "Gravel / WBM / aggregate", f: [[228.0127875, 18.288, 25.4, 305.85, 1.88796, 1.12, -19.3], [184.969741, 16.256, 23.368, -305.8, 2.06, 2.04, -16.8], [132.5104471, 10.16, 22.352, 165.7, 2.33, 2.27, -14.6], [267.273689, 0.508, 18.288, 152.4, 1.62, 2.22, -27.7], [292.83365, 0, 16.256, 266.6, 1.62, 1.5, -21.7], [357.273689, 0.508, 14.986, 152.4, 1.62, 3.4, -29.8], [37.69424, 3.302, 14.732, -305.2, 1.69, 2.94, -18.0]] },
    DOTS: { d: "Dots", f: [[0, 0, 0, 0.79375, 1.5875, 0, -1.5875]] },
    ZIGZAG: { d: "Zig-zag / waterproofing", f: [[0, 0, 0, 3.175, 3.175, 3.175, -3.175], [90, 3.175, 0, 3.175, 3.175, 3.175, -3.175]] },
    WOOD: { d: "Wood grain (section)", f: [[0, 0, 0, 0, 6, 12, -4, 3, -4], [0, 0, 3, 7, 6, 8, -6]] },
    ANSI33: { d: "Bronze / brass / copper", f: [[45, 0, 0, 0, 6.35], [45, 4.49013, 0, 0, 6.35, 3.175, -1.5875]] },
    ANSI34: { d: "Plastic / rubber (groups of four lines)", f: [[45, 0, 0, 0, 19.05], [45, 4.49013, 0, 0, 19.05], [45, 8.98026, 0, 0, 19.05], [45, 13.4704, 0, 0, 19.05]] },
    ANSI35: { d: "Fire brick / refractory", f: [[45, 0, 0, 0, 6.35], [45, 4.49013, 0, 0, 6.35, 7.9375, -1.5875, 0, -1.5875]] },
    ANSI36: { d: "Marble / slate / glass", f: [[45, 0, 0, 5.55625, 3.175, 7.9375, -1.5875, 0, -1.5875]] },
    VERT: { d: "Vertical lines", f: [[90, 0, 0, 0, 3.175]] },
    DASH: { d: "Dashed lines", f: [[0, 0, 0, 3.175, 3.175, 3.175, -3.175]] },
    SQUARE: { d: "Small squares", f: [[0, 0, 0, 0, 3.175, 3.175, -3.175], [90, 0, 0, 0, 3.175, 3.175, -3.175]] },
    ANGLE: { d: "Angle steel / corner marks", f: [[0, 0, 0, 0, 6.985, 5.08, -1.905], [90, 0, 0, 0, 6.985, 5.08, -1.905]] },
    TILE: { d: "Square tiles — scale = tile size ÷ 10 (30 for 300 mm tiles in a mm drawing)", f: [[0, 0, 0, 0, 10], [90, 0, 0, 0, 10]] },
    TILE2X1: { d: "Tiles 2 : 1 with broken joints — scale = tile height ÷ 10", f: [[0, 0, 0, 0, 10], [90, 0, 0, 10, 10, 10, -10]] },
    HBONE: { d: "Herringbone — pavers / wooden floor", f: [[45, 0, 0, 4, 4, 12, -4], [135, 2.828427125, 2.828427125, 4, -4, 12, -4]] },
    HONEY: { d: "Honeycomb / hexagonal pavers", f: [[0, 0, 0, 4.7625, 2.74963, 3.175, -6.35], [120, 0, 0, 4.7625, 2.74963, 3.175, -6.35], [60, 3.175, 0, 4.7625, 2.74963, 3.175, -6.35]] },
    TRIANG: { d: "Triangles", f: [[60, 0, 0, 4.7625, 8.24889, 4.7625, -4.7625], [120, 0, 0, 4.7625, 8.24889, 4.7625, -4.7625], [0, -2.38125, 4.12445, 4.7625, 8.24889, 4.7625, -4.7625]] },
    STARS: { d: "Stars", f: [[0, 0, 0, 0, 5.49926, 3.175, -3.175], [60, 0, 0, 0, 5.49926, 3.175, -3.175], [120, 1.5875, 2.74963, 0, 5.49926, 3.175, -3.175]] },
    INSUL: { d: "Insulation", f: [[0, 0, 0, 0, 9.525], [0, 0, 3.175, 0, 9.525, 3.175, -3.175], [0, 0, 6.35, 0, 9.525, 3.175, -3.175]] },
    GRASS: { d: "Grass / lawn", f: [[90, 0, 0, 17.9605, 17.9605, 4.7625, -31.1585], [45, 0, 0, 0, 25.4, 4.7625, -20.6375], [135, 0, 0, 0, 25.4, 4.7625, -20.6375]] },
    WATER: { d: "Water (broken horizontal lines)", f: [[0, 0, 0, 0, 6, 10, -3, 4, -3], [0, 5, 3, 0, 6, 6, -14]] },
    STONE: { d: "Coursed stone masonry (elevation) — courses with broken joints", f: [[0, 0, 0, 0, 10], [90, 0, 0, 10, 17, 10, -10], [90, 6, 0, 10, 23, 10, -30]] },
    RUBBLE: { d: "Random rubble / stone pitching (irregular joints)", f: [[12, 0, 0, 7, 13, 9, -5], [78, 3, 2, 9, 11, 7, -6], [-35, 5, 1, 8, 12, 6, -8], [58, 1, 6, 11, 14, 5, -9]] },
    PCC: { d: "Plain concrete / lean concrete (sparse dots and dashes)", f: [[0, 0, 0, 5, 7, 0, -9], [60, 2, 3, 6, 8, 1.2, -12], [120, 6, 1, 7, 9, 1, -13]] }
  };
  /* hatch entity → world line segments [[x1,y1,x2,y2]…] and dot points (capped) */
  function lines(h, max) {
    max = max || 60000;
    var pat = P[(h.pat || "ANSI31").toUpperCase()]; if (!pat || !pat.f) return { segs: [], dots: [], solid: !pat || !pat.f };
    var polys = (h.loops || []).map(function (L) { return G.loopPts(L); }).filter(function (p) { return p.length > 2; }); if (!polys.length) return { segs: [], dots: [] };
    var edges = []; polys.forEach(function (pl) { for (var i = 0; i < pl.length; i++) edges.push([pl[i], pl[(i + 1) % pl.length]]); });
    var bb = [Infinity, Infinity, -Infinity, -Infinity]; polys.forEach(function (pl) { pl.forEach(function (p) { G.ext(bb, p); }); });
    var sc = h.sc || 1, ha = (h.ang || 0) * Math.PI / 180, segs = [], dots = [], count = 0;
    var corners = [[bb[0], bb[1]], [bb[2], bb[1]], [bb[2], bb[3]], [bb[0], bb[3]]];
    for (var fi = 0; fi < pat.f.length; fi++) {
      var F = pat.f[fi], a = F[0] * Math.PI / 180 + ha, u = [Math.cos(a), Math.sin(a)], n = [-u[1], u[0]];
      var o = G.rot([F[1] * sc, F[2] * sc], [0, 0], ha), off = [F[3] * sc, F[4] * sc], offW = [off[0] * u[0] - off[1] * u[1], off[0] * u[1] + off[1] * u[0]], dy = G.dot(offW, n);
      if (Math.abs(dy) < 1e-9) continue;
      var dash = F.slice(5).map(function (x) { return x * sc; }), dashLen = dash.reduce(function (s, x) { return s + Math.abs(x); }, 0); if (dashLen < 1e-9) dash = [];
      var ds = corners.map(function (c) { return G.dot(G.sub(c, o), n) / dy; }), k0 = Math.floor(Math.min.apply(null, ds)), k1 = Math.ceil(Math.max.apply(null, ds));
      if ((k1 - k0) > 20000) return { segs: [], dots: [], tooDense: true };
      for (var k = k0; k <= k1; k++) {
        var base = G.add(o, G.mul(offW, k)), ts = [];
        for (var ei = 0; ei < edges.length; ei++) {
          var A = edges[ei][0], B = edges[ei][1], d = G.sub(B, A), den = G.cross(u, d); if (Math.abs(den) < 1e-12) continue;
          var w = G.sub(A, base), t = G.cross(w, d) / den, s = G.cross(w, u) / den;
          if (s >= 0 && s < 1) ts.push(t);
        }
        if (ts.length < 2) continue; ts.sort(function (x, y) { return x - y; });
        for (var j = 0; j + 1 < ts.length; j += 2) {
          var t0 = ts[j], t1 = ts[j + 1]; if (t1 - t0 < 1e-9) continue;
          if (!dash.length) { segs.push([base[0] + u[0] * t0, base[1] + u[1] * t0, base[0] + u[0] * t1, base[1] + u[1] * t1]); if (++count > max) return { segs: segs, dots: dots, tooDense: true }; continue; }
          var ph = t0 - Math.floor(t0 / dashLen) * dashLen, pos = t0 - ph, di = 0;
          while (pos < t1) {
            var L = dash[di % dash.length], len = Math.abs(L), s0 = Math.max(pos, t0), s1 = Math.min(pos + len, t1);
            if (L > 0 && s1 > s0) { segs.push([base[0] + u[0] * s0, base[1] + u[1] * s0, base[0] + u[0] * s1, base[1] + u[1] * s1]); count++; }
            else if (L === 0 && pos >= t0 && pos <= t1) { dots.push([base[0] + u[0] * pos, base[1] + u[1] * pos]); count++; }
            pos += len; di++; if (count > max) return { segs: segs, dots: dots, tooDense: true };
          }
        }
      }
    }
    return { segs: segs, dots: dots };
  }
  EP.cad = EP.cad || {}; EP.cad.HATCH = P; EP.cad.hatchLines = lines;
})();
