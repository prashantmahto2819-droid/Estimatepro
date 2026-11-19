/* Estimate Pro — Design Studio → CAD Studio 3D: the "dsmodel" entity.
   A dsmodel is a list of simple solid parts (boxes, cylinders, tubes, prisms, members, I-sections, sheets) in LOCAL millimetres,
   built by the Design Studio builders (js/ds/to3d*.js) from a module's dimensions. It is drawn in plan and in the 3D view and can be moved / rotated.
     { t:"dsmodel", p:[x,y], rot (°), z (mm above the level, optional), lvl, name, mod (Design Studio module id), parts:[…] }
   Part formats (x, y in plan, z up, all mm; look = id from EP.bim.LOOKS, e.g. "concrete", "steel", "brick", "soil", "water"):
     ["b", cx, cy, w, d, z0, z1, look, rotDeg?]          box (w along local x, d along local y)
     ["c", cx, cy, r, z0, z1, look, r1?]                 vertical cylinder / cone (r1 = top radius)
     ["t", cx, cy, rOut, rIn, z0, z1, look]              vertical tube (hollow cylinder)
     ["p", [[x,y],…], z0, z1, look, holes?]              polygon prism (holes: array of polygons)
     ["m", [x,y,z], [x,y,z], bw, bh, look, rollDeg?]     rectangular member between two 3D points (bw across, bh deep)
     ["i", [x,y,z], [x,y,z], B, D, tf, tw, look, rollDeg?]  I-section member (flange width B, depth D, flange tf, web tw)
     ["q", [x,y,z], [x,y,z], [x,y,z], [x,y,z], look]     thin two-sided sheet through four 3D points */
(function () {
  "use strict";
  var EP = window.EP, B = EP.bim, G = EP.geom, K = 0.001, TAU = Math.PI * 2; if (!B) return;
  B.TYPES.dsmodel = 1; B.EXT = B.EXT || {};
  B.MAP = B.MAP || {}; if (!B.MAP.steel_struct) B.MAP.steel_struct = { q: /structural steel|fabricat.*steel|steel work.*(truss|shed|built.?up)/i };
  Object.assign(B.LOOKS, {
    water: { n: "Water", c: "#4f8fc0", p: B.PT.glass, g: 0.9, a: 0.55 }, earth: { n: "Earth fill", c: "#8c7356", p: B.PT.soil, g: 0.02 },
    steel_member: { n: "Structural steel", c: "#5f6b75", p: B.PT.plain, g: 0.45 }, rebar_steel: { n: "Reinforcement", c: "#7a4a2a", p: B.PT.plain, g: 0.4 }
  });
  function lk(id) { return B.look(B.LOOKS[id] ? id : "concrete"); }
  function V(p, z) { return [p[0] * K, p[1] * K, z * K]; }
  function xf(e) { var r = (e.rot || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), f = function (q) { return [e.p[0] + q[0] * c - q[1] * s, e.p[1] + q[0] * s + q[1] * c]; }; f.r = e.rot || 0; return f; }
  function ngon(cx, cy, r, n) { var p = []; for (var i = 0; i < n; i++) { var a = i / n * TAU; p.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return p; }
  function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add3(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul3(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function nrm3(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  /* frame of a member: t along the axis, s sideways (horizontal when possible), u "up" in the section; roll rotates the section about the axis */
  function frame(a, b, roll) {
    var t = nrm3(sub3(b, a)), s = cross3(t, [0, 0, 1]); if (Math.hypot(s[0], s[1], s[2]) < 1e-6) s = [1, 0, 0]; s = nrm3(s); var u = cross3(s, t);
    if (roll) { var r = roll * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r), s2 = add3(mul3(s, c), mul3(u, sn)), u2 = add3(mul3(u, c), mul3(s, -sn)); s = s2; u = u2; }
    return { t: t, s: s, u: u };
  }
  /* box with arbitrary orientation: centre line a→b, section w (along s) × h (along u), optional offset of the section centre along u / s */
  function obox(M, a, b, w, h, fr, offS, offU, col) {
    var o = add3(mul3(fr.s, offS || 0), mul3(fr.u, offU || 0)), A = add3(a, o), Bp = add3(b, o), cen = mul3(add3(A, Bp), 0.5), hs = w / 2, hu = h / 2, c = [];
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) { var d = add3(mul3(fr.s, q[0] * hs), mul3(fr.u, q[1] * hu)); c.push(add3(A, d)); });
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) { var d = add3(mul3(fr.s, q[0] * hs), mul3(fr.u, q[1] * hu)); c.push(add3(Bp, d)); });
    function face(i, j, k, l) { var p = [c[i], c[j], c[k], c[l]], n = cross3(sub3(p[1], p[0]), sub3(p[2], p[0])), fc = mul3(add3(p[0], p[2]), 0.5); if (dot3(n, sub3(fc, cen)) < 0) p = [p[0], p[3], p[2], p[1]]; M.quad(V2(p[0]), V2(p[1]), V2(p[2]), V2(p[3]), col); }
    face(0, 1, 2, 3); face(4, 5, 6, 7); face(0, 1, 5, 4); face(1, 2, 6, 5); face(2, 3, 7, 6); face(3, 0, 4, 7);
    for (var i = 0; i < 4; i++) { M.edge(V2(c[i]), V2(c[(i + 1) % 4])); M.edge(V2(c[4 + i]), V2(c[4 + (i + 1) % 4])); M.edge(V2(c[i]), V2(c[4 + i])); }
  }
  function V2(p) { return [p[0] * K, p[1] * K, p[2] * K]; }

  /* ---- plan view: footprints of the parts ---- */
  B.EXT.dsmodel = {
    plan: function (doc, e) {
      var X = xf(e), segs = [], pts = [], parts = (e.parts || []).filter(function (q) { return q[7] !== "rebar_steel" && q[6] !== "rebar_steel" && q[5] !== "rebar_steel"; }), mark = 0, zz;
      function P(q) { var g = X(q); pts.push(g); return g; }
      parts.forEach(function (q, i) {
        var t = q[0]; mark = segs.length; zz = t === "b" || t === "t" ? q[6] : t === "c" ? q[5] : t === "p" ? q[3] : t === "m" || t === "i" ? (q[1][2] + q[2][2]) / 2 : (q[1][2] + q[2][2] + q[3][2] + q[4][2]) / 4;
        if (t === "b") { var a = (q[8] || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), hw = q[3] / 2, hd = q[4] / 2, cs = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(function (o) { return P([q[1] + o[0] * c - o[1] * s, q[2] + o[0] * s + o[1] * c]); }); segs = segs.concat(G.polySegs(cs, true)); }
        else if (t === "c" || t === "t") { var g = P([q[1], q[2]]); segs.push({ k: "A", c: g, r: q[3], s: 0, e: TAU, full: true }); if (t === "t" && q[4] > 0) segs.push({ k: "A", c: g, r: q[4], s: 0, e: TAU, full: true }); pts.push([g[0] - q[3], g[1] - q[3]], [g[0] + q[3], g[1] + q[3]]); }
        else if (t === "p") { segs = segs.concat(G.polySegs(q[1].map(P), true)); (q[5] || []).forEach(function (h) { segs = segs.concat(G.polySegs(h.map(function (p) { return X(p); }), true)); }); }
        else if (t === "m" || t === "i") { var p1 = P([q[1][0], q[1][1]]), p2 = P([q[2][0], q[2][1]]); if (G.dist(p1, p2) > 1) segs.push({ k: "L", a: p1, b: p2 }); }
        else if (t === "q") { var cs2 = [q[1], q[2], q[3], q[4]].map(function (p) { return P([p[0], p[1]]); }); segs = segs.concat(G.polySegs(cs2, true)); }
        for (var si = mark; si < segs.length; si++) segs[si].z = zz;   /* height of the part: used by the isometric 2D view */
      });
      var bb = pts.length ? [Infinity, Infinity, -Infinity, -Infinity] : null; pts.forEach(function (p) { bb[0] = Math.min(bb[0], p[0]); bb[1] = Math.min(bb[1], p[1]); bb[2] = Math.max(bb[2], p[0]); bb[3] = Math.max(bb[3], p[1]); });
      var fill = bb ? [{ pts: [[bb[0], bb[1]], [bb[2], bb[1]], [bb[2], bb[3]], [bb[0], bb[3]]], col: "rgba(120,140,170,.10)" }] : [];
      if (segs.length > 3000) segs = segs.slice(0, 3000);
      return { segs: segs, fill: fill, dashed: [] };
    },
    labels: function (doc, e, h) { return []; },
    xform: function (e, M) { var o = JSON.parse(JSON.stringify(e)), det = M[0] * M[3] - M[1] * M[2], rr = Math.atan2(M[1], M[0]) * 180 / Math.PI; o.p = G.mApply(M, e.p); o.rot = (e.rot || 0) + (det < 0 ? -rr : rr); return o; },
    /* quantities measured from the parts: RCC (volume + shuttering), reinforcement and structural steel (kg), masonry, GI sheeting.
       Change the SOR item of any row in Σ Quantities. Earth, water, gravel and bitumen layers are not measured. */
    qty: function (doc, e) {
      var acc = {}, KG = 7850e-9;   /* kg per mm³ of steel */
      function add(k, dim, v, label, below, f) { if (!(v > 1e-6)) return; var z = below ? "plinth" : "super", id = k + "|" + z + "|" + label; if (!acc[id]) acc[id] = { k: k, dim: dim, v: 0, label: label, f: f || "from the 3D model parts", z: z }; acc[id].v += v; }
      function area(pts) { var a = 0; for (var i = 0; i < pts.length; i++) { var q = pts[(i + 1) % pts.length]; a += pts[i][0] * q[1] - q[0] * pts[i][1]; } return Math.abs(a) / 2; }
      function perim(pts) { var l = 0; for (var i = 0; i < pts.length; i++) l += G.dist(pts[i], pts[(i + 1) % pts.length]); return l; }
      var nm = e.name || "Design Studio model";
      (e.parts || []).forEach(function (q) {
        var t = q[0], look = t === "b" || t === "t" ? q[7] : t === "c" ? q[6] : t === "p" ? q[4] : q[t === "m" ? 5 : t === "i" ? 7 : 5], V = 0, As = 0, z0, z1;
        if (t === "b") { z0 = q[5]; z1 = q[6]; V = q[3] * q[4] * (z1 - z0); As = 2 * (q[3] + q[4]) * (z1 - z0) + q[3] * q[4]; }
        else if (t === "c") { z0 = q[4]; z1 = q[5]; var r = q[3], r1 = q[7] != null ? q[7] : r; V = Math.PI * (z1 - z0) * (r * r + r * r1 + r1 * r1) / 3; As = 2 * Math.PI * (r + r1) / 2 * (z1 - z0) + Math.PI * r1 * r1; }
        else if (t === "t") { z0 = q[5]; z1 = q[6]; V = Math.PI * (q[3] * q[3] - q[4] * q[4]) * (z1 - z0); As = 2 * Math.PI * (q[3] + q[4]) * (z1 - z0); }
        else if (t === "p") { z0 = q[2]; z1 = q[3]; var A0 = area(q[1]) - (q[5] || []).reduce(function (s2, h) { return s2 + area(h); }, 0); V = A0 * (z1 - z0); As = perim(q[1]) * (z1 - z0) + A0; }
        else if (t === "m") { var L1 = Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1], q[2][2] - q[1][2]); V = q[3] * q[4] * L1; z0 = Math.min(q[1][2], q[2][2]); z1 = Math.max(q[1][2], q[2][2]); }
        else if (t === "i") { var L2 = Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1], q[2][2] - q[1][2]); V = (2 * q[3] * q[5] + Math.max(0, q[4] - 2 * q[5]) * q[6]) * L2; z0 = Math.min(q[1][2], q[2][2]); z1 = Math.max(q[1][2], q[2][2]); }
        else if (t === "q") { var p = [q[1], q[2], q[3], q[4]], u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], w = [p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]], cx = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; As = Math.hypot(cx[0], cx[1], cx[2]); z0 = Math.min(p[0][2], p[2][2]); z1 = Math.max(p[0][2], p[2][2]); if (look === "sheet_gi") add("roof_gi", "A", As, "GI / colour-coated sheeting — " + nm, z1 <= 0); return; }
        var below = z1 <= 1;
        if (look === "concrete") { add("rcc_found", "V", V, "RCC / concrete — " + nm, below, "Σ part volumes"); add("shut_found", "A", As, "Shuttering — " + nm, below, "Σ exposed part faces"); }
        else if (look === "brick") add("brick", "V", V, "Brick masonry — " + nm, below, "Σ part volumes");
        else if (look === "stone") add("stone", "V", V, "Stone masonry — " + nm, below, "Σ part volumes");
        else if (look === "rebar_steel") add("steel", "M", V * KG, "Reinforcement (bars drawn in the model) — " + nm, below, "volume × 7850 kg/m³");
        else if (look === "steel_member" || look === "steel") add("steel_struct", "M", V * KG, "Structural steel — " + nm, below, "volume × 7850 kg/m³");
      });
      return Object.keys(acc).map(function (k) { return acc[k]; });
    },
    mesh: function (M, doc, e, H) {
      var L = B.level(doc.d, e.lvl), z0 = (L ? L.elev : 0) + (e.z || 0), X = xf(e), rot = e.rot || 0;
      function P3(p) { var g = X([p[0], p[1]]); return [g[0], g[1], z0 + p[2]]; }
      (e.parts || []).forEach(function (q) {
        var t = q[0];
        try {
          if (t === "b") H.box(M, X([q[1], q[2]]), q[3], q[4], rot + (q[8] || 0), z0 + q[5], z0 + q[6], lk(q[7]));
          else if (t === "c") { var cc = X([q[1], q[2]]); if (q[7] != null && Math.abs(q[7] - q[3]) > 1e-6) B.AH.cyl(M, cc, q[3], z0 + q[4], z0 + q[5], lk(q[6]), 28, q[7]); else H.prism(M, ngon(cc[0], cc[1], q[3], 28), z0 + q[4], z0 + q[5], lk(q[6])); }
          else if (t === "t") { var ct = X([q[1], q[2]]); H.prism(M, ngon(ct[0], ct[1], q[3], 32), z0 + q[5], z0 + q[6], lk(q[7]), [ngon(ct[0], ct[1], q[4], 32).reverse()]); }
          else if (t === "p") H.prism(M, q[1].map(function (p) { return X(p); }), z0 + q[2], z0 + q[3], lk(q[4]), (q[5] || []).map(function (h) { return h.map(function (p) { return X(p); }); }));
          else if (t === "m") { var a = P3(q[1]), b = P3(q[2]); if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) > 1) obox(M, a, b, q[3], q[4], frame(a, b, (q[6] || 0)), 0, 0, lk(q[5])); }
          else if (t === "i") {
            var a2 = P3(q[1]), b2 = P3(q[2]); if (Math.hypot(a2[0] - b2[0], a2[1] - b2[1], a2[2] - b2[2]) < 1) return;
            var fr = frame(a2, b2, q[8] || 0), Bf = q[3], D = q[4], tf = q[5], tw = q[6], col = lk(q[7]);
            obox(M, a2, b2, Bf, tf, fr, 0, D / 2 - tf / 2, col); obox(M, a2, b2, Bf, tf, fr, 0, -(D / 2 - tf / 2), col); obox(M, a2, b2, tw, Math.max(1, D - 2 * tf), fr, 0, 0, col);
          }
          else if (t === "q") { var p1 = V2(P3(q[1])), p2 = V2(P3(q[2])), p3 = V2(P3(q[3])), p4 = V2(P3(q[4])), cl = lk(q[5]); M.quad(p1, p2, p3, p4, cl); M.quad(p1, p4, p3, p2, cl); M.edge(p1, p2); M.edge(p2, p3); M.edge(p3, p4); M.edge(p4, p1); }
        } catch (er) { /* a bad part never stops the model */ }
      });
    }
  };
})();
