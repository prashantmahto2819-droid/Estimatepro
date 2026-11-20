/* Wall finishes — tiles, dado, ACP, wall panels, stone cladding laid on a wall face.
   wall.fin = { f1: { k, fc, z0, z1, s0, s1, th, look, col, ded }, ... }   (object map so it can be edited by path "b.fin.f1.z0")
   k = preset id, fc = 0 (face A) | 1 (face B); z0/z1 from the wall base (blank z1 = wall height); s0/s1 along the wall centre line (blank = full face);
   th = layer thickness (mm); ded = false keeps openings covered (default: openings are cut out). */
(function () {
  var EP = window.EP, B = EP.bim, G = EP.geom, K = 0.001;
  if (!B) return;
  B.FIN = {
    tile: { n: "Wall tiles (full height)", th: 12, z1: null, look: "tile_wall", key: "wall_tile", looks: ["tile_wall", "tile_ceramic", "tile_vitrified", "marble", "granite", "kota", "porcelain", "brick"] },
    dado: { n: "Dado tiles (1.2 m)", th: 12, z1: 1200, look: "tile_wall", key: "wall_tile", looks: ["tile_wall", "tile_ceramic", "tile_vitrified", "marble", "granite", "kota", "porcelain", "brick"] },
    acp: { n: "ACP cladding", th: 50, z1: null, look: "acp_silver", key: "acp_panel", looks: ["acp_silver", "acp_champagne", "acp_charcoal", "acp_red", "acp_blue", "acp_white", "aluminium", "steel_black"] },
    hpl: { n: "Wall panel — HPL / wood", th: 18, z1: null, look: "hpl_wood", key: "wall_panel", looks: ["hpl_wood", "hpl_white", "wood", "wood_light", "laminate_white", "laminate_beige", "fabric_grey", "fabric_blue", "fabric_brown"] },
    wpc: { n: "Wall panel — WPC", th: 20, z1: null, look: "wpc_brown", key: "wall_panel", looks: ["wpc_brown", "wpc_grey", "wood", "wood_light", "hpl_wood"] },
    stone: { n: "Stone cladding", th: 30, z1: null, look: "stone_cladding", key: "stone_veneer", looks: ["stone_cladding", "stone_cladding_w", "kota", "granite", "marble", "stone", "brick"] }
  };
  if (B.FIN_MORE) Object.assign(B.FIN, B.FIN_MORE);   // more panelling kinds from the catalogue files
  B.MAP = B.MAP || {};
  B.MAP.wall_tile = Object.assign({ c: [["cpwd23", "8.31"]], q: /ceramic glazed wall tiles|glazed wall tiles/i }, B.MAP.wall_tile || {});
  B.MAP.acp_panel = Object.assign({}, B.MAP.acp_panel || { q: /ACP.*panel|aluminium composite/i }, { c: [["cpwd23", "8.32"]] });
  B.MAP.wall_panel = Object.assign({}, B.MAP.wall_panel || { q: /wall panel|WPC panel|HPL/i }, { c: [["cpwd23", "9.133.1.1"]] });

  B.finList = function (w) { var o = w.fin || {}; return Object.keys(o).sort(function (a, b) { return (+a.slice(1) || 0) - (+b.slice(1) || 0); }).map(function (id) { return Object.assign({ id: id }, o[id]); }); };
  B.finNew = function (w, kind, fc) {
    var P = B.FIN[kind] || B.FIN.tile, n = 1; while (w.fin && w.fin["f" + n]) n++;
    return { id: "f" + n, f: { k: kind, fc: fc, th: P.th, z0: 0, z1: P.z1 == null ? undefined : P.z1, look: P.look, ded: true } };
  };
  function faceGeom(doc, w) {
    var P = B.wallPoly(doc, w), c = B.wallLine(w);
    return [[P.sL, P.eL], [P.sR, P.eR]].map(function (f) {
      var s0 = G.dot(G.sub(f[0], c.a), c.u), s1 = G.dot(G.sub(f[1], c.a), c.u), mid = G.lerp(f[0], f[1], 0.5), rel = G.sub(mid, c.a), along = G.mul(c.u, G.dot(rel, c.u)), nn = G.sub(rel, along), l = Math.hypot(nn[0], nn[1]) || 1;
      return { a: f[0], b: f[1], s0: s0, s1: s1, n: [nn[0] / l, nn[1] / l] };
    });
  }
  /* resolve each finish to rectangles (s, z) on its face with openings cut out */
  B.finItems = function (doc, w, ops, H) {
    var out = [], faces = faceGeom(doc, w);
    B.finList(w).forEach(function (f) {
      [0, 1].forEach(function (fi) {
        if (!(f.fc === "both" || +f.fc === fi)) return;
        var F = faces[fi], lo = Math.min(F.s0, F.s1), hi = Math.max(F.s0, F.s1), s0 = Math.max(lo, f.s0 == null ? lo : +f.s0), s1 = Math.min(hi, f.s1 == null ? hi : +f.s1), z0 = Math.max(0, +f.z0 || 0), z1 = Math.min(H, f.z1 == null || f.z1 === "" ? H : +f.z1);
        if (!(s1 - s0 > 1 && z1 - z0 > 1)) return;
        var cuts = f.ded === false ? [] : ops.map(function (o) { return { s0: Math.max(s0, o.s0), s1: Math.min(s1, o.s1), z0: Math.max(z0, o.z0), z1: Math.min(z1, o.z1) }; }).filter(function (o) { return o.s1 > o.s0 && o.z1 > o.z0; });
        var bs = [s0, s1]; cuts.forEach(function (o) { bs.push(o.s0, o.s1); }); bs = bs.filter(function (x, i, a) { return a.indexOf(x) === i; }).sort(function (a, b) { return a - b; });
        var rects = [], area = 0;
        for (var i = 0; i < bs.length - 1; i++) {
          var a = bs[i], b = bs[i + 1], mid = (a + b) / 2, iv = cuts.filter(function (o) { return o.s0 <= mid && o.s1 >= mid; }).sort(function (p, q) { return p.z0 - q.z0; }), zc = z0;
          iv.forEach(function (o) { if (o.z0 > zc) rects.push([a, b, zc, o.z0]); zc = Math.max(zc, o.z1); });
          if (zc < z1) rects.push([a, b, zc, z1]);
        }
        rects.forEach(function (r) { area += (r[1] - r[0]) * (r[3] - r[2]); });
        out.push({ id: f.id, f: f, face: fi, rects: rects, area: area, gross: (s1 - s0) * (z1 - z0), s0: s0, s1: s1, z0: z0, z1: z1 });
      });
    });
    return out;
  };
  /* area covered on each face (paint is not measured under these) */
  B.finArea = function (doc, w, ops, H) { var a = [0, 0]; B.finItems(doc, w, ops, H).forEach(function (it) { a[it.face] += it.area; }); return a; };
  B.finQty = function (doc, w, ops, H, push) {
    B.finItems(doc, w, ops, H).forEach(function (it) {
      var P = B.FIN[it.f.k] || B.FIN.tile, ext = w.ext && B.extSide(doc, w) === it.face;
      push(P.key, it.area, P.n + " " + Math.round(it.f.th || P.th) + " mm — " + (ext ? "outer" : "inner") + " face " + (it.face ? "B" : "A"), ((it.s1 - it.s0) / 1000).toFixed(3) + " × " + ((it.z1 - it.z0) / 1000).toFixed(3) + " m" + (it.gross - it.area > 1 ? " − openings" : ""));
    });
  };
  /* 3D: thin slabs laid on the face */
  B.finMesh = function (M, doc, w, z0, H, ops) {
    var faces = faceGeom(doc, w), V = function (p, z) { return [p[0] * K, p[1] * K, z * K]; };
    B.finItems(doc, w, ops, H).forEach(function (it) {
      var F = faces[it.face], th = +it.f.th || 12, look = B.look(it.f.look && B.LOOKS[it.f.look] ? it.f.look : (B.FIN[it.f.k] || B.FIN.tile).look, it.f.col || null), ds = F.s1 - F.s0 || 1;
      function at(s, off) { var t = (s - F.s0) / ds, p = G.lerp(F.a, F.b, t); return [p[0] + F.n[0] * off, p[1] + F.n[1] * off]; }
      function q4(a, b, c, d) { M.quad(a, b, c, d, look); M.quad(d, c, b, a, look); }
      it.rects.forEach(function (r) {
        var A0 = V(at(r[0], th), z0 + r[2]), A1 = V(at(r[1], th), z0 + r[2]), A2 = V(at(r[1], th), z0 + r[3]), A3 = V(at(r[0], th), z0 + r[3]);
        var B0 = V(at(r[0], 0), z0 + r[2]), B1 = V(at(r[1], 0), z0 + r[2]), B2 = V(at(r[1], 0), z0 + r[3]), B3 = V(at(r[0], 0), z0 + r[3]);
        q4(A0, A1, A2, A3);
        q4(B0, B1, A1, A0); q4(A3, A2, B2, B3); q4(B0, A0, A3, B3); q4(A1, B1, B2, A2);
        M.edge(A0, A1); M.edge(A1, A2); M.edge(A2, A3); M.edge(A3, A0);
      });
    });
  };
})();
