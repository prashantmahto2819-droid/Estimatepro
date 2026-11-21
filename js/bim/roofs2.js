/* Estimate Pro BIM — curved roofs: dome { t:"dome", c:[x,y], r, h, th, lvl, off, look } and barrel vault
   { t:"vault", a:[x,y], b:[x,y] (ends of the ridge line), w, h (rise), th, lvl, off, look }. `off` = springing above the floor of the level. */
(function () {
  "use strict";
  var EP = window.EP, CAD = EP.cad, B = EP.bim, G = EP.geom; if (!B || !CAD) return;
  var cmd = function (n, a, f) { CAD.commands[n] = { fn: f }; (a || []).forEach(function (x) { if (!CAD.commands[x] && !CAD.aliases[x]) CAD.aliases[x] = n; }); };
  B.TYPES.dome = 1; B.TYPES.vault = 1; B.EXT = B.EXT || {};
  var K = 0.001, m = function (v) { return (v / 1000).toFixed(2); };
  function zBase(doc, e) { var L = B.level(doc.d, e.lvl); return (L ? L.elev : 0) + (e.off != null ? e.off : (L ? L.h : 3000)); }
  function steel(doc) { var bs = B.ensure(doc.d); return (bs.steel && bs.steel.slab) || 90; }
  function rows(doc, e, A, name, f) { var th = e.th || 100, st = steel(doc), z = e.lvl ? B.below(doc.d, e.lvl) : "super";
    return [{ k: "rcc_slab", dim: "V", v: A * th, label: name + " " + Math.round(th) + " mm", f: f + " × " + m(th), z: z }, { k: "shut_slab", dim: "A", v: A, label: "Shuttering — " + name.toLowerCase() + " (curved)", f: f, z: z }, { k: "steel_slab", dim: "M", v: A * th / 1e9 * st, label: "Reinforcement — " + name.toLowerCase() + " (thumb rule " + st + " kg/m³)", f: "", z: z }]; }
  /* smooth shading: give the vertices written since index v0 the normal fn(x, y, z) (metres) instead of the flat one */
  function smooth(M, v0, fn) { var V = M.v; for (var i = v0; i + 14 <= V.length; i += 14) { var n = fn(V[i], V[i + 1], V[i + 2]), l = Math.hypot(n[0], n[1], n[2]) || 1; V[i + 3] = n[0] / l; V[i + 4] = n[1] / l; V[i + 5] = n[2] / l; } }
  function circ(c, r, n) { var P = []; for (var i = 0; i < n; i++) P.push([c[0] + r * Math.cos(2 * Math.PI * i / n), c[1] + r * Math.sin(2 * Math.PI * i / n)]); return P; }
  function ring(P) { return P.map(function (p, i) { return { k: "L", a: p, b: P[(i + 1) % P.length] }; }); }

  /* ---------- dome ---------- */
  B.domeInfo = function (e) { var r = e.r || 1500, cone = e.shape === "cone", h = Math.max(50, Math.min(e.h || r, cone ? r * 6 : r * 3)), R = (r * r + h * h) / (2 * h), dr = Math.max(0, +e.drum || 0); return { r: r, h: h, R: R, cone: cone, drum: dr, area: cone ? Math.PI * r * Math.hypot(r, h) : 2 * Math.PI * R * h, drumA: 2 * Math.PI * r * dr }; };
  /* radius of the dome surface at height t (0..h) above the springing */
  function domeRad(I, t) { if (I.cone) return I.r * Math.max(0, 1 - t / I.h); var zc = I.h - I.R, d = I.R * I.R - (t - zc) * (t - zc); return d > 0 ? Math.sqrt(d) : 0; }
  B.EXT.dome = {
    plan: function (doc, e) { var I = B.domeInfo(e); return { segs: ring(circ(e.c, I.r, 48)).concat([{ k: "L", a: [e.c[0] - I.r * 0.08, e.c[1]], b: [e.c[0] + I.r * 0.08, e.c[1]] }, { k: "L", a: [e.c[0], e.c[1] - I.r * 0.08], b: [e.c[0], e.c[1] + I.r * 0.08] }]), fill: [], dashed: ring(circ(e.c, I.r * 0.55, 32)) }; },
    labels: function () { return []; },
    xform: function (e, M) { var o = JSON.parse(JSON.stringify(e)), k = Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])) || 1; o.c = G.mApply(M, e.c); o.r = (e.r || 1500) * k; if (e.h) o.h = e.h * k; return o; },
    qty: function (doc, e) { var I = B.domeInfo(e), z = e.lvl ? B.below(doc.d, e.lvl) : "super", dq = I.drum > 0 ? [{ k: "rcc_slab", dim: "V", v: I.drumA * 230, label: "RCC drum wall under the " + (I.cone ? "cone" : "dome") + " 230 mm", f: "2π × " + m(I.r) + " × " + m(I.drum) + " × 0.23", z: z }, { k: "shut_wall", dim: "A", v: 2 * I.drumA, label: "Shuttering — drum wall (both faces, curved)", f: "", z: z }] : []; if (+e.ring > 0) { var rv = 2 * Math.PI * (I.r - 115) * 230 * (+e.ring); dq.push({ k: "rcc_beam", dim: "V", v: rv, label: "RCC ring beam at the base of the " + (I.cone ? "cone" : "dome") + " 230 × " + Math.round(+e.ring), f: "2π × " + m(I.r - 115) + " × 0.23 × " + m(+e.ring), z: z }); dq.push({ k: "shut_beam", dim: "A", v: 2 * Math.PI * (I.r - 115) * 2 * (+e.ring), label: "Shuttering — ring beam (curved, both faces)", f: "", z: z }); }
      return dq.concat(rows(doc, e, I.area, I.cone ? "RCC conical roof" : "RCC dome", "curved surface " + (I.area / 1e6).toFixed(2) + " m² (dia " + m(2 * I.r) + ", rise " + m(I.h) + ")")); },
    mesh: function (M, doc, e, H) { var I = B.domeInfo(e), zD = zBase(doc, e), z0 = zD + I.drum, th = Math.min(e.th || 100, I.r * 0.3), col = H.look("roof_rcc", e.look, e.col), NS = 40, NR = 14, c = e.c;
      if (+e.ring > 0) H.prism(M, circ(c, I.r + 20, NS), z0 - (+e.ring), z0, col, [circ(c, Math.max(50, I.r - 250), NS)], null, true);
      if (I.drum > 0) { H.prism(M, circ(c, I.r, NS), zD, z0, col, [circ(c, Math.max(50, I.r - 230), NS)], null, true); M.edge([c[0] * K + I.r * K, c[1] * K, zD * K], [c[0] * K + I.r * K, c[1] * K, z0 * K]); }
      var shell = function (dr, dz, inward) { var prev = null; for (var j = 0; j <= NR; j++) { var a = (j / NR) * Math.PI / 2, t = I.cone ? I.h * j / NR : I.h * Math.sin(a), rad = j === NR ? 0 : Math.max(0, domeRad(I, t) - dr), row = [];
          for (var i = 0; i < NS; i++) { var an = 2 * Math.PI * i / NS; row.push([(c[0] + rad * Math.cos(an)) * K, (c[1] + rad * Math.sin(an)) * K, (z0 + Math.max(0, t - dz)) * K]); }
          if (prev) for (var q = 0; q < NS; q++) { var q2 = (q + 1) % NS; if (j === NR) { if (inward) M.tri(prev[q], row[q], prev[q2], col); else M.tri(prev[q], prev[q2], row[q], col); } else if (inward) M.quad(prev[q2], prev[q], row[q], row[q2], col); else M.quad(prev[q], prev[q2], row[q2], row[q], col); }
          prev = row; } };
      var cx = c[0] * K, cy = c[1] * K, cz = (z0 + I.h - I.R) * K, v0 = M.v.length; var sl = I.r / I.h, nrm = I.cone ? function (sg) { return function (x, y) { var dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; return [sg * dx / l, sg * dy / l, sg * sl]; }; } : null; shell(0, 0, false); smooth(M, v0, I.cone ? nrm(1) : function (x, y, z) { return [x - cx, y - cy, z - cz]; });
      v0 = M.v.length; shell(th, th, true); smooth(M, v0, I.cone ? nrm(-1) : function (x, y, z) { return [cx - x, cy - y, cz - th * K - z]; });
      var P0 = circ(c, I.r, NS), P1 = circ(c, Math.max(0, I.r - th), NS); for (var i = 0; i < NS; i++) { var j = (i + 1) % NS, a0 = [P0[i][0] * K, P0[i][1] * K, z0 * K], a1 = [P0[j][0] * K, P0[j][1] * K, z0 * K], b0 = [P1[i][0] * K, P1[i][1] * K, z0 * K], b1 = [P1[j][0] * K, P1[j][1] * K, z0 * K]; M.quad(a1, a0, b0, b1, col); M.edge(a0, a1); } }
  };

  /* ---------- barrel vault ---------- */
  B.vaultInfo = function (e) { var w = e.w || 3000, h = Math.max(50, Math.min(e.h || w / 2, w / 2)), R = (w * w / 4 + h * h) / (2 * h), th = Math.asin(Math.min(1, (w / 2) / R)), L = G.dist(e.a, e.b); return { w: w, h: h, R: R, arc: 2 * R * th, L: L, area: 2 * R * th * L }; };
  function vaultRect(e) { var u = G.norm(G.sub(e.b, e.a)), n = G.mul(G.perp(u), (e.w || 3000) / 2); return [G.sub(e.a, n), G.sub(e.b, n), G.add(e.b, n), G.add(e.a, n)]; }
  B.EXT.vault = {
    plan: function (doc, e) { var P = vaultRect(e); return { segs: ring(P), fill: [], dashed: [{ k: "L", a: e.a, b: e.b }] }; },
    labels: function () { return []; },
    xform: function (e, M) { var o = JSON.parse(JSON.stringify(e)), k = Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])) || 1; o.a = G.mApply(M, e.a); o.b = G.mApply(M, e.b); o.w = (e.w || 3000) * k; if (e.h) o.h = e.h * k; return o; },
    qty: function (doc, e) { var I = B.vaultInfo(e); return rows(doc, e, I.area, "RCC barrel vault roof", "arc " + m(I.arc) + " × length " + m(I.L)); },
    mesh: function (M, doc, e, H) { var I = B.vaultInfo(e), z0 = zBase(doc, e), th = Math.min(e.th || 100, I.w * 0.2), col = H.look("roof_rcc", e.look, e.col), N = 20, u = G.norm(G.sub(e.b, e.a)), n = G.perp(u), zc = I.h - I.R;
      var prof = function (dr) { var P = [], half = I.w / 2 - dr, R2 = I.R - dr; for (var i = 0; i <= N; i++) { var s = -half + 2 * half * i / N, zz = zc + Math.sqrt(Math.max(0, R2 * R2 - s * s)); P.push([s, Math.max(0, zz)]); } return P; };
      var pt = function (base, s, zz) { return [(base[0] + n[0] * s) * K, (base[1] + n[1] * s) * K, (z0 + zz) * K]; }, O = prof(0), In = prof(th);
      var ax = e.a[0] * K, ay = e.a[1] * K, az = (z0 + zc) * K, rad = function (sg) { return function (x, y, z) { var dx = x - ax, dy = y - ay, t = dx * u[0] + dy * u[1]; return [sg * (dx - t * u[0]), sg * (dy - t * u[1]), sg * (z - az)]; }; }, i, v0 = M.v.length;
      for (i = 0; i < N; i++) M.quad(pt(e.a, O[i + 1][0], O[i + 1][1]), pt(e.a, O[i][0], O[i][1]), pt(e.b, O[i][0], O[i][1]), pt(e.b, O[i + 1][0], O[i + 1][1]), col);
      smooth(M, v0, rad(1)); v0 = M.v.length;
      for (i = 0; i < N; i++) M.quad(pt(e.a, In[i][0], In[i][1]), pt(e.a, In[i + 1][0], In[i + 1][1]), pt(e.b, In[i + 1][0], In[i + 1][1]), pt(e.b, In[i][0], In[i][1]), col);
      smooth(M, v0, rad(-1));
      for (i = 0; i < N; i++) {
        M.quad(pt(e.a, O[i][0], O[i][1]), pt(e.a, O[i + 1][0], O[i + 1][1]), pt(e.a, In[i + 1][0], In[i + 1][1]), pt(e.a, In[i][0], In[i][1]), col);
        M.quad(pt(e.b, O[i + 1][0], O[i + 1][1]), pt(e.b, O[i][0], O[i][1]), pt(e.b, In[i][0], In[i][1]), pt(e.b, In[i + 1][0], In[i + 1][1]), col);
        M.edge(pt(e.a, O[i][0], O[i][1]), pt(e.a, O[i + 1][0], O[i + 1][1])); M.edge(pt(e.b, O[i][0], O[i][1]), pt(e.b, O[i + 1][0], O[i + 1][1])); }
      [0, N].forEach(function (i) { M.edge(pt(e.a, O[i][0], O[i][1]), pt(e.b, O[i][0], O[i][1])); M.quad(pt(e.a, O[i][0], 0), pt(e.b, O[i][0], 0), pt(e.b, In[i][0], 0), pt(e.a, In[i][0], 0), col); }); }
  };

  function layerOf(ed) { return ed.doc.d.layers["A-ROOF"] ? "A-ROOF" : undefined; }
  cmd("DOME", ["GUMBAD", "DOMEROOF"], async function (ed) {
    var bs = B.ensure(ed.doc.d), L = B.level(ed.doc.d, bs.cur), rise = ed.domeRise || 0, c;
    var shape = ed.domeShape || "Dome", drum = ed.domeDrum || 0;
    while (true) { c = await ed.getPoint(shape + " — centre" + (rise ? " (rise " + Math.round(rise) + " mm)" : shape === "Cone" ? " (rise = radius)" : " (half sphere)") + (drum ? ", on a drum " + Math.round(drum) + " mm high" : ""), { kw: ["Rise", "Shape", "Drum"] });
      if (c === "Shape") { shape = ed.domeShape = await ed.getKw("Shape", ["Dome", "Cone"], shape); continue; } if (c === "Drum") { drum = ed.domeDrum = await ed.getDist("Height of the round wall (drum) under it (0 = none)", { def: drum || 0 }); continue; }
      if (c === "Rise") { rise = ed.domeRise = await ed.getDist("Height of the dome above its base (0 = half sphere)", { def: rise || 0 }); continue; } break; }
    ed.preview = function (q) { var r = G.dist(c, q); return r > 50 ? [{ t: "dome", c: [c[0], c[1]], r: r, h: rise || r, shape: shape === "Cone" ? "cone" : undefined, lvl: bs.cur }] : []; };
    var r = await ed.getDist("Radius at the base", { base: c, def: ed.domeR || 1500 }); ed.preview = null; if (!(r > 50)) return; ed.domeR = r;
    var e = { t: "dome", c: [c[0], c[1]], r: r, h: rise || r, th: 100, lvl: bs.cur, off: L ? L.h : 3000 }; if (shape === "Cone") e.shape = "cone"; if (drum > 0) e.drum = drum; if (layerOf(ed)) e.layer = layerOf(ed); ed.doc.add(e);
    var I = B.domeInfo(e); ed.say("Dome added: diameter " + m(2 * r) + " m, rise " + m(I.h) + " m, curved surface " + (I.area / 1e6).toFixed(2) + " m². It sits at the top of this level; the ring beam and the drum below are drawn separately. Height, thickness and material are in Properties.");
  });
  cmd("VAULT", ["BARRELVAULT", "CURVEDROOF", "ARCHROOF"], async function (ed) {
    var bs = B.ensure(ed.doc.d), L = B.level(ed.doc.d, bs.cur), w = ed.vaultW || 3000, rise = ed.vaultH || 0, a;
    while (true) { a = await ed.getPoint("Curved roof — one end of the centre line (width " + Math.round(w) + " mm, rise " + (rise ? Math.round(rise) + " mm" : "half round") + ")", { kw: ["Width", "Rise"] });
      if (a === "Width") { w = ed.vaultW = await ed.getDist("Width (span) of the roof", { def: w }); continue; } if (a === "Rise") { rise = ed.vaultH = await ed.getDist("Rise at the crown (0 = half round)", { def: rise || 0 }); continue; } break; }
    ed.preview = function (q) { return G.dist(a, q) > 50 ? [{ t: "vault", a: [a[0], a[1]], b: [q[0], q[1]], w: w, h: rise || w / 2, lvl: bs.cur }] : []; };
    var b = await ed.getPoint("Other end of the centre line", { base: a }); ed.preview = null; if (!b || G.dist(a, b) < 50) return;
    var e = { t: "vault", a: [a[0], a[1]], b: [b[0], b[1]], w: w, h: Math.min(rise || w / 2, w / 2), th: 100, lvl: bs.cur, off: L ? L.h : 3000 }; if (layerOf(ed)) e.layer = layerOf(ed); ed.doc.add(e);
    var I = B.vaultInfo(e); ed.say("Curved roof added: span " + m(I.w) + " m, rise " + m(I.h) + " m, length " + m(I.L) + " m, curved surface " + (I.area / 1e6).toFixed(2) + " m². Rise, thickness and material are in Properties.");
  });
})();
