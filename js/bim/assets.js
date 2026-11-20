/* Estimate Pro — Phase G: parametric site & service assets, landscape areas and imported 3D models (GLB / glTF).
   asset   { t:"asset", kind, p:[x,y], rot (°), sc (scale), lvl, z (mounting height above the level, mm — optional), cap (tank litres) }
   land    { t:"land", pts, kind: "lawn" | "paver" | "gravel" | "bed" | "pcc", lvl }
   model3d { t:"model3d", asset (id in d.assets), p, rot, sc, z, lvl, name }  — geometry from B.GLB[asset] once loaded
   Assets are app-made symbols and simple 3D shapes (not manufacturer models); each counts as one item for the estimate. */
(function () {
  "use strict";
  var EP = window.EP, B = EP.bim, G = EP.geom, TAU = Math.PI * 2;
  B.EXT = B.EXT || {}; B.TYPES.asset = 1; B.TYPES.land = 1; B.TYPES.model3d = 1;
  Object.assign(B.LOOKS, {
    foliage: { n: "Foliage", c: "#4d7a35", p: B.PT.grass, g: 0.05 }, bark: { n: "Tree bark", c: "#6a4a2c", p: B.PT.wood, s: 0.08, g: 0.05 },
    ceramic: { n: "Ceramic (white)", c: "#f3f3f1", p: B.PT.plain, g: 0.8 }, steel_ss: { n: "Stainless steel", c: "#c8ccd1", p: B.PT.plain, g: 0.85 },
    plastic_black: { n: "Plastic (black)", c: "#2a2b2d", p: B.PT.plain, g: 0.35 }, plastic_white: { n: "Plastic (white)", c: "#ecebe6", p: B.PT.plain, g: 0.3 },
    lamp: { n: "Lamp (lit)", c: "#fff4c8", p: B.PT.plain, g: 0.2 }, gravel: { n: "Gravel", c: "#a39b8e", p: B.PT.concrete, g: 0.02 }, cast_iron: { n: "Cast iron", c: "#3a3c3f", p: B.PT.plain, g: 0.4 }
  });
  B.LOOK_CATS.push(["landscape", "Landscape items (trees, benches)", "foliage"], ["services", "Electrical & plumbing items", "plastic_white"], ["furniture", "Furniture items", "wood"], ["kitchen", "Kitchen items", "laminate_white"], ["finishes", "Wall panels & cladding", "acp_silver"]);

  /* ---------- small 3D helpers (mm in, metres out) ---------- */
  var K = 0.001; function V(p, z) { return [p[0] * K, p[1] * K, z * K]; }
  function cyl(M, c, r, z0, z1, col, N, r1) { N = N || 16; r1 = r1 == null ? r : r1; for (var i = 0; i < N; i++) { var a = i / N * TAU, b = (i + 1) / N * TAU, p0 = [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)], p1 = [c[0] + r * Math.cos(b), c[1] + r * Math.sin(b)], q0 = [c[0] + r1 * Math.cos(a), c[1] + r1 * Math.sin(a)], q1 = [c[0] + r1 * Math.cos(b), c[1] + r1 * Math.sin(b)]; M.quad(V(p0, z0), V(p1, z0), V(q1, z1), V(q0, z1), col); M.tri(V(c, z0), V(p1, z0), V(p0, z0), col); if (r1 > 0) M.tri(V(c, z1), V(q0, z1), V(q1, z1), col); } }
  function sphere(M, c, r, zc, col, sx) { sx = sx || 1; var NL = 7, NA = 12; for (var i = 0; i < NL; i++) { var t0 = -Math.PI / 2 + i / NL * Math.PI, t1 = -Math.PI / 2 + (i + 1) / NL * Math.PI; for (var j = 0; j < NA; j++) { var a0 = j / NA * TAU, a1 = (j + 1) / NA * TAU, P = function (t, a) { return [(c[0] + r * sx * Math.cos(t) * Math.cos(a)) * K, (c[1] + r * sx * Math.cos(t) * Math.sin(a)) * K, (zc + r * Math.sin(t)) * K]; }; M.quad(P(t0, a0), P(t0, a1), P(t1, a1), P(t1, a0), col); } } }
  function rect(c, w, d, ang) { return B.rectAt(c, w, d, ang); }
  function circ(c, r) { return { k: "A", c: c, r: r, s: 0, e: TAU, full: true }; }
  function L(a, b) { return { k: "L", a: a, b: b }; }

  /* ---------- the library ---------- */
  /* each: n name, cat, w × d plan size, h height (mm), mount "floor" | "ceiling" | "wall" (default height mz), key + SOR suggestion,
     sym(e, X) → plan segments (X maps local mm → drawing), mesh(M, X, z0, LK) */
  var A = B.ASSET_LIB = {
    tree: { n: "Tree", cat: "Landscape", w: 3000, d: 3000, h: 5500, key: "plant_tree", sym: function (X) { var s = [circ(X([0, 0]), 1500 * X.s), circ(X([0, 0]), 150 * X.s)]; for (var i = 0; i < 8; i++) { var a = i / 8 * TAU; s.push(L(X([Math.cos(a) * 300, Math.sin(a) * 300]), X([Math.cos(a) * 1300, Math.sin(a) * 1300]))); } return s; }, mesh: function (M, X, z0, LK) { var c = X([0, 0]), s = X.s; cyl(M, c, 150 * s, z0, z0 + 2600 * s, LK("bark"), 10, 110 * s); sphere(M, c, 1500 * s, z0 + 3900 * s, LK("foliage")); sphere(M, G.add(c, [500 * s, 300 * s]), 1000 * s, z0 + 4700 * s, LK("foliage")); } },
    palm: { n: "Palm tree", cat: "Landscape", w: 3500, d: 3500, h: 7000, key: "plant_tree", sym: function (X) { var s = [circ(X([0, 0]), 200 * X.s)]; for (var i = 0; i < 7; i++) { var a = i / 7 * TAU; s.push(L(X([0, 0]), X([Math.cos(a) * 1750, Math.sin(a) * 1750]))); } return s; }, mesh: function (M, X, z0, LK) { var c = X([0, 0]), s = X.s; cyl(M, c, 180 * s, z0, z0 + 6200 * s, LK("bark"), 10, 130 * s); for (var i = 0; i < 7; i++) { var a = i / 7 * TAU, tip = G.add(c, [Math.cos(a) * 1750 * s, Math.sin(a) * 1750 * s]), n = [-Math.sin(a) * 250 * s, Math.cos(a) * 250 * s]; M.tri(V(c, z0 + 6300 * s), V(G.add(G.lerp(c, tip, 0.5), n), z0 + 6500 * s), V(tip, z0 + 5600 * s), LK("foliage")); M.tri(V(c, z0 + 6300 * s), V(tip, z0 + 5600 * s), V(G.sub(G.lerp(c, tip, 0.5), n), z0 + 6500 * s), LK("foliage")); } } },
    shrub: { n: "Shrub", cat: "Landscape", w: 1200, d: 1200, h: 1100, key: "plant_shrub", sym: function (X) { var s = []; for (var i = 0; i < 10; i++) { var a = i / 10 * TAU, b = (i + 1) / 10 * TAU, r1 = i % 2 ? 600 : 480, r2 = i % 2 ? 480 : 600; s.push(L(X([Math.cos(a) * r1, Math.sin(a) * r1]), X([Math.cos(b) * r2, Math.sin(b) * r2]))); } return s; }, mesh: function (M, X, z0, LK) { sphere(M, X([0, 0]), 600 * X.s, z0 + 500 * X.s, LK("foliage"), 1); } },
    bench: { n: "Garden bench", cat: "Landscape", w: 1800, d: 500, h: 800, key: "bench", sym: function (X) { return G.polySegs(rect(X([0, 0]), 1800 * X.s, 500 * X.s, X.r), true).concat(G.polySegs(rect(X([0, 200]), 1800 * X.s, 80 * X.s, X.r), true)); }, mesh: function (M, X, z0, LK, H) { var s = X.s, w = LK("landscape_bench"); H.box(M, X([0, 0]), 1800 * s, 450 * s, X.r, z0 + 420 * s, z0 + 470 * s, w); H.box(M, X([0, 220]), 1800 * s, 60 * s, X.r, z0 + 470 * s, z0 + 800 * s, w); [-800, 800].forEach(function (x) { H.box(M, X([x, 0]), 80 * s, 420 * s, X.r, z0, z0 + 420 * s, LK("cast_iron")); }); } },
    lamp_post: { n: "Garden lamp post", cat: "Landscape", w: 400, d: 400, h: 3500, key: "lamp_post", sym: function (X) { return [circ(X([0, 0]), 200 * X.s), circ(X([0, 0]), 60 * X.s)]; }, mesh: function (M, X, z0, LK, H) { var c = X([0, 0]), s = X.s; cyl(M, c, 60 * s, z0, z0 + 3200 * s, LK("cast_iron"), 10, 45 * s); sphere(M, c, 180 * s, z0 + 3350 * s, LK("lamp")); } },
    street_light: { n: "Street light pole", cat: "Landscape", w: 1800, d: 400, h: 9000, key: "street_light", sym: function (X) { return [circ(X([0, 0]), 150 * X.s), L(X([0, 0]), X([1500, 0])), circ(X([1500, 0]), 120 * X.s)]; }, mesh: function (M, X, z0, LK, H) { var c = X([0, 0]), s = X.s; cyl(M, c, 110 * s, z0, z0 + 8800 * s, LK("steel"), 10, 60 * s); H.boxAlong(M, c, X([1500, 0]), 60 * s, z0 + 8700 * s, z0 + 8760 * s, LK("steel")); H.box(M, X([1500, 0]), 500 * s, 220 * s, X.r, z0 + 8580 * s, z0 + 8700 * s, LK("lamp")); } },
    manhole: { n: "Manhole / inspection chamber", cat: "Plumbing", w: 1200, d: 900, h: 900, key: "manhole", sym: function (X) { return G.polySegs(rect(X([0, 0]), 1200 * X.s, 900 * X.s, X.r), true).concat(G.polySegs(rect(X([0, 0]), 600 * X.s, 450 * X.s, X.r), true)); }, mesh: function (M, X, z0, LK, H) { var s = X.s; H.prism(M, rect(X([0, 0]), 1200 * s, 900 * s, X.r), z0 - 900 * s, z0 + 20, LK("concrete"), [rect(X([0, 0]), 900 * s, 600 * s, X.r)]); H.box(M, X([0, 0]), 600 * s, 450 * s, X.r, z0, z0 + 30, LK("cast_iron")); } },
    ewc: { n: "European WC", cat: "Plumbing", w: 400, d: 700, h: 780, key: "wc_ewc", sym: function (X) { var s = [], c = X([0, -60]); for (var i = 0; i < 16; i++) { var a = i / 16 * TAU, b = (i + 1) / 16 * TAU; s.push(L(X([Math.cos(a) * 180, -60 + Math.sin(a) * 250]), X([Math.cos(b) * 180, -60 + Math.sin(b) * 250]))); } return s.concat(G.polySegs(rect(X([0, 260]), 400 * X.s, 180 * X.s, X.r), true)); }, mesh: function (M, X, z0, LK, H) { var s = X.s, cer = LK("ceramic"); H.box(M, X([0, -60]), 360 * s, 480 * s, X.r, z0, z0 + 400 * s, cer); H.box(M, X([0, 260]), 400 * s, 180 * s, X.r, z0 + 400 * s, z0 + 780 * s, cer); } },
    iwc: { n: "Indian WC (Orissa pan)", cat: "Plumbing", w: 440, d: 580, h: 30, key: "wc_iwc", sym: function (X) { var s = []; for (var i = 0; i < 16; i++) { var a = i / 16 * TAU, b = (i + 1) / 16 * TAU; s.push(L(X([Math.cos(a) * 140, 40 + Math.sin(a) * 200]), X([Math.cos(b) * 140, 40 + Math.sin(b) * 200]))); } return s.concat(G.polySegs(rect(X([0, 0]), 440 * X.s, 580 * X.s, X.r), true)); }, mesh: function (M, X, z0, LK, H) { H.box(M, X([0, 0]), 440 * X.s, 580 * X.s, X.r, z0, z0 + 30, LK("ceramic")); } },
    basin: { n: "Wash basin", cat: "Plumbing", w: 550, d: 420, h: 900, mz: 0, key: "basin", sym: function (X) { var s = G.polySegs(rect(X([0, 0]), 550 * X.s, 420 * X.s, X.r), true); for (var i = 0; i < 16; i++) { var a = i / 16 * TAU, b = (i + 1) / 16 * TAU; s.push(L(X([Math.cos(a) * 200, -20 + Math.sin(a) * 140]), X([Math.cos(b) * 200, -20 + Math.sin(b) * 140]))); } return s; }, mesh: function (M, X, z0, LK, H) { var s = X.s; H.box(M, X([0, 0]), 550 * s, 420 * s, X.r, z0 + 750 * s, z0 + 900 * s, LK("ceramic")); cyl(M, X([0, 60]), 90 * s, z0, z0 + 750 * s, LK("ceramic"), 12); } },
    sink: { n: "Kitchen sink", cat: "Plumbing", w: 600, d: 450, h: 900, key: "sink", sym: function (X) { return G.polySegs(rect(X([0, 0]), 600 * X.s, 450 * X.s, X.r), true).concat(G.polySegs(rect(X([0, 0]), 480 * X.s, 340 * X.s, X.r), true)); }, mesh: function (M, X, z0, LK, H) { var s = X.s; H.prism(M, rect(X([0, 0]), 600 * s, 450 * s, X.r), z0 + 700 * s, z0 + 900 * s, LK("steel_ss"), [rect(X([0, 0]), 480 * s, 340 * s, X.r)]); H.box(M, X([0, 0]), 480 * s, 340 * s, X.r, z0 + 700 * s, z0 + 715 * s, LK("steel_ss")); } },
    floor_trap: { n: "Floor trap (nahani / gully)", cat: "Plumbing", w: 150, d: 150, h: 10, key: "floor_trap", sym: function (X) { var s = G.polySegs(rect(X([0, 0]), 150 * X.s, 150 * X.s, X.r), true); [-40, 0, 40].forEach(function (y) { s.push(L(X([-60, y]), X([60, y]))); }); return s; }, mesh: function (M, X, z0, LK, H) { H.box(M, X([0, 0]), 150 * X.s, 150 * X.s, X.r, z0, z0 + 8, LK("cast_iron")); } },
    tank: { n: "Water tank (PVC)", cat: "Plumbing", w: 1100, d: 1100, h: 1150, key: "water_tank", sym: function (X, e) { var r = tankD(e) / 2; return [circ(X([0, 0]), r * X.s), circ(X([0, 0]), 200 * X.s)]; }, mesh: function (M, X, z0, LK, H, e) { var D = tankD(e) * X.s, c = X([0, 0]); cyl(M, c, D / 2, z0, z0 + D * 1.05, LK("plastic_black"), 20, D / 2); cyl(M, c, D / 2, z0 + D * 1.05, z0 + D * 1.15, LK("plastic_black"), 20, 200 * X.s); } },
    light: { n: "Ceiling light point", cat: "Electrical", w: 300, d: 300, h: 60, mount: "ceiling", key: "light_point", sym: function (X) { return [circ(X([0, 0]), 150 * X.s), L(X([-106, -106]), X([106, 106])), L(X([-106, 106]), X([106, -106]))]; }, mesh: function (M, X, z0, LK) { cyl(M, X([0, 0]), 150 * X.s, z0, z0 + 60, LK("lamp"), 16); } },
    tube: { n: "Tube / batten light", cat: "Electrical", w: 1200, d: 80, h: 60, mount: "ceiling", key: "light_point", sym: function (X) { return G.polySegs(rect(X([0, 0]), 1200 * X.s, 80 * X.s, X.r), true).concat([L(X([-600, 0]), X([600, 0]))]); }, mesh: function (M, X, z0, LK, H) { H.box(M, X([0, 0]), 1200 * X.s, 80 * X.s, X.r, z0, z0 + 60, LK("lamp")); } },
    fan: { n: "Ceiling fan", cat: "Electrical", w: 1200, d: 1200, h: 450, mount: "ceiling", key: "fan", sym: function (X) { var s = [circ(X([0, 0]), 100 * X.s)]; for (var i = 0; i < 3; i++) { var a = i / 3 * TAU; s.push(L(X([Math.cos(a) * 100, Math.sin(a) * 100]), X([Math.cos(a) * 600, Math.sin(a) * 600]))); } return s; }, mesh: function (M, X, z0, LK, H) { var s = X.s, c = X([0, 0]), zt = z0 + 450; cyl(M, c, 15, zt - 350, zt, LK("plastic_white"), 8); cyl(M, c, 100 * s, zt - 420, zt - 330, LK("plastic_white"), 14); for (var i = 0; i < 3; i++) { var a = i / 3 * TAU; H.boxAlong(M, G.add(c, [Math.cos(a) * 100 * s, Math.sin(a) * 100 * s]), G.add(c, [Math.cos(a) * 600 * s, Math.sin(a) * 600 * s]), 90 * s, zt - 400, zt - 390, LK("plastic_white")); } } },
    switchboard: { n: "Switch board", cat: "Electrical", w: 250, d: 60, h: 180, mount: "wall", mz: 1200, key: "switchboard", sym: function (X) { return G.polySegs(rect(X([0, 0]), 250 * X.s, 60 * X.s, X.r), true).concat([L(X([-125, 0]), X([125, 0]))]); }, mesh: function (M, X, z0, LK, H) { H.box(M, X([0, 0]), 250 * X.s, 60 * X.s, X.r, z0, z0 + 180, LK("plastic_white")); } },
    socket: { n: "Power socket point", cat: "Electrical", w: 100, d: 50, h: 100, mount: "wall", mz: 300, key: "socket", sym: function (X) { return [circ(X([0, 0]), 60 * X.s), L(X([-60, 0]), X([60, 0]))]; }, mesh: function (M, X, z0, LK, H) { H.box(M, X([0, 0]), 100 * X.s, 50 * X.s, X.r, z0, z0 + 100, LK("plastic_white")); } },
    db: { n: "Distribution board", cat: "Electrical", w: 450, d: 120, h: 600, mount: "wall", mz: 1500, key: "db", sym: function (X) { return G.polySegs(rect(X([0, 0]), 450 * X.s, 120 * X.s, X.r), true).concat([L(X([-225, -60]), X([225, 60]))]); }, mesh: function (M, X, z0, LK, H) { H.box(M, X([0, 0]), 450 * X.s, 120 * X.s, X.r, z0, z0 + 600, LK("steel")); } },

    /* ===== FURNITURE ===== */
    bed_single: { n: "Single bed", cat: "Furniture", w: 2000, d: 900, h: 500, key: "bed_single",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 2000 * s, 900 * s, X.r), true).concat(G.polySegs(rect(X([-900, 0]), 200 * s, 900 * s, X.r), true)).concat([L(X([-750, -350]), X([-750, 350]))]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s, wd = LK("wood"); H.box(M, X([0, 0]), 2000 * s, 900 * s, X.r, z0, z0 + 350 * s, wd); H.box(M, X([0, 0]), 1900 * s, 800 * s, X.r, z0 + 350 * s, z0 + 450 * s, LK("fabric_grey")); H.box(M, X([-950, 0]), 100 * s, 900 * s, X.r, z0, z0 + 500 * s, wd); } },
    bed_double: { n: "Double bed", cat: "Furniture", w: 2000, d: 1500, h: 500, key: "bed_double",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 2000 * s, 1500 * s, X.r), true).concat(G.polySegs(rect(X([-900, 0]), 200 * s, 1500 * s, X.r), true)).concat([L(X([0, -750]), X([0, 750])), L(X([-750, -600]), X([-750, 600]))]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s, wd = LK("wood"); H.box(M, X([0, 0]), 2000 * s, 1500 * s, X.r, z0, z0 + 350 * s, wd); H.box(M, X([0, -350]), 1800 * s, 700 * s, X.r, z0 + 350 * s, z0 + 450 * s, LK("fabric_grey")); H.box(M, X([0, 350]), 1800 * s, 700 * s, X.r, z0 + 350 * s, z0 + 450 * s, LK("fabric_grey")); H.box(M, X([-950, 0]), 100 * s, 1500 * s, X.r, z0, z0 + 500 * s, wd); } },
    dining_table: { n: "Dining table (6 seater)", cat: "Furniture", w: 1500, d: 900, h: 750, key: "dining_table",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 1500 * s, 900 * s, X.r), true).concat([L(X([-750, 0]), X([750, 0])), L(X([0, -450]), X([0, 450]))]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s, wd = LK("wood"); H.box(M, X([0, 0]), 1500 * s, 900 * s, X.r, z0 + 700 * s, z0 + 750 * s, wd); [[-650, -370], [-650, 370], [650, -370], [650, 370]].forEach(function (p) { H.box(M, X(p), 60 * s, 60 * s, X.r, z0, z0 + 700 * s, wd); }); } },
    dining_table_4: { n: "Dining table (4 seater)", cat: "Furniture", w: 1200, d: 750, h: 750, key: "dining_table",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 1200 * s, 750 * s, X.r), true).concat([L(X([-600, 0]), X([600, 0]))]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s, wd = LK("wood"); H.box(M, X([0, 0]), 1200 * s, 750 * s, X.r, z0 + 700 * s, z0 + 750 * s, wd); [[-520, -300], [-520, 300], [520, -300], [520, 300]].forEach(function (p) { H.box(M, X(p), 55 * s, 55 * s, X.r, z0, z0 + 700 * s, wd); }); } },
    chair: { n: "Chair", cat: "Furniture", w: 450, d: 450, h: 900, key: "chair",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 450 * s, 450 * s, X.r), true).concat([L(X([-225, -200]), X([-225, 200]))]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s, wd = LK("wood"); H.box(M, X([0, 0]), 420 * s, 420 * s, X.r, z0 + 420 * s, z0 + 460 * s, wd); [[-180, -180], [-180, 180], [180, -180], [180, 180]].forEach(function (p) { H.box(M, X(p), 35 * s, 35 * s, X.r, z0, z0 + 420 * s, wd); }); H.box(M, X([-210, 0]), 30 * s, 420 * s, X.r, z0 + 460 * s, z0 + 900 * s, wd); } },
    sofa_3: { n: "Sofa (3 seat)", cat: "Furniture", w: 2100, d: 850, h: 850, key: "sofa",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 2100 * s, 850 * s, X.r), true).concat(G.polySegs(rect(X([-800, 0]), 300 * s, 850 * s, X.r), true)); },
      mesh: function (M, X, z0, LK, H) { var s = X.s, fb = LK("fabric_blue"); H.box(M, X([0, 0]), 2100 * s, 850 * s, X.r, z0, z0 + 400 * s, fb); H.box(M, X([100, 0]), 1900 * s, 700 * s, X.r, z0 + 400 * s, z0 + 550 * s, fb); H.box(M, X([-900, 0]), 300 * s, 850 * s, X.r, z0 + 400 * s, z0 + 850 * s, fb); H.box(M, X([0, -400]), 2100 * s, 80 * s, X.r, z0 + 400 * s, z0 + 620 * s, fb); H.box(M, X([0, 400]), 2100 * s, 80 * s, X.r, z0 + 400 * s, z0 + 620 * s, fb); } },
    sofa_2: { n: "Sofa (2 seat / love seat)", cat: "Furniture", w: 1500, d: 850, h: 850, key: "sofa",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 1500 * s, 850 * s, X.r), true).concat(G.polySegs(rect(X([-550, 0]), 300 * s, 850 * s, X.r), true)); },
      mesh: function (M, X, z0, LK, H) { var s = X.s, fb = LK("fabric_brown"); H.box(M, X([0, 0]), 1500 * s, 850 * s, X.r, z0, z0 + 400 * s, fb); H.box(M, X([100, 0]), 1300 * s, 700 * s, X.r, z0 + 400 * s, z0 + 550 * s, fb); H.box(M, X([-650, 0]), 200 * s, 850 * s, X.r, z0 + 400 * s, z0 + 850 * s, fb); H.box(M, X([0, -400]), 1500 * s, 80 * s, X.r, z0 + 400 * s, z0 + 620 * s, fb); H.box(M, X([0, 400]), 1500 * s, 80 * s, X.r, z0 + 400 * s, z0 + 620 * s, fb); } },
    sofa_L: { n: "L-shaped sofa", cat: "Furniture", w: 2400, d: 2000, h: 850, key: "sofa",
      sym: function (X) { var s = X.s; var pts = [X([-1200, -1000]), X([1200, -1000]), X([1200, -200]), X([400, -200]), X([400, 1000]), X([-1200, 1000])]; return G.polySegs(pts, true); },
      mesh: function (M, X, z0, LK, H) { var s = X.s, fb = LK("fabric_grey"); H.box(M, X([0, -600]), 2400 * s, 800 * s, X.r, z0, z0 + 400 * s, fb); H.box(M, X([-400, 400]), 800 * s, 1200 * s, X.r, z0, z0 + 400 * s, fb); H.box(M, X([100, -600]), 2200 * s, 650 * s, X.r, z0 + 400 * s, z0 + 550 * s, fb); H.box(M, X([-400, 400]), 650 * s, 1000 * s, X.r, z0 + 400 * s, z0 + 550 * s, fb); H.box(M, X([-1100, 0]), 200 * s, 2000 * s, X.r, z0 + 400 * s, z0 + 850 * s, fb); } },
    wardrobe: { n: "Wardrobe / almirah", cat: "Furniture", w: 1800, d: 600, h: 2100, key: "wardrobe",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 1800 * s, 600 * s, X.r), true).concat([L(X([0, -300]), X([0, 300])), L(X([-450, -150]), X([-450, 150])), L(X([450, -150]), X([450, 150]))]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s, wd = LK("wood"); H.box(M, X([0, 0]), 1800 * s, 600 * s, X.r, z0, z0 + 2100 * s, wd); H.box(M, X([0, 0]), 1780 * s, 20 * s, X.r, z0 + 1050 * s, z0 + 1060 * s, wd); } },
    desk: { n: "Study / office desk", cat: "Furniture", w: 1200, d: 600, h: 750, key: "desk",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 1200 * s, 600 * s, X.r), true).concat([L(X([-600, 200]), X([600, 200]))]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s, wd = LK("laminate_beige"); H.box(M, X([0, 0]), 1200 * s, 600 * s, X.r, z0 + 700 * s, z0 + 750 * s, wd); H.box(M, X([-550, 0]), 60 * s, 560 * s, X.r, z0, z0 + 700 * s, wd); H.box(M, X([550, 0]), 60 * s, 560 * s, X.r, z0, z0 + 700 * s, wd); H.box(M, X([300, 0]), 480 * s, 520 * s, X.r, z0 + 100 * s, z0 + 450 * s, wd); } },
    bookshelf: { n: "Bookshelf", cat: "Furniture", w: 900, d: 300, h: 1800, key: "bookshelf",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 900 * s, 300 * s, X.r), true).concat([L(X([-450, 0]), X([450, 0]))]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s, wd = LK("wood"); H.box(M, X([0, 0]), 900 * s, 300 * s, X.r, z0, z0 + 1800 * s, wd); [350, 700, 1050, 1400].forEach(function (h) { H.box(M, X([0, 0]), 860 * s, 280 * s, X.r, z0 + h * s, z0 + (h + 18) * s, wd); }); } },
    tv_unit: { n: "TV unit / console", cat: "Furniture", w: 1500, d: 400, h: 500, key: "tv_unit",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 1500 * s, 400 * s, X.r), true).concat([L(X([-500, -200]), X([-500, 200])), L(X([500, -200]), X([500, 200]))]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s, lm = LK("laminate_white"); H.box(M, X([0, 0]), 1500 * s, 400 * s, X.r, z0, z0 + 500 * s, lm); } },
    center_table: { n: "Center / coffee table", cat: "Furniture", w: 1200, d: 600, h: 450, key: "center_table",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 1200 * s, 600 * s, X.r), true).concat([L(X([-600, 0]), X([600, 0]))]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s, gl = LK("glass"); H.box(M, X([0, 0]), 1200 * s, 600 * s, X.r, z0 + 400 * s, z0 + 420 * s, gl); [[-500, -220], [-500, 220], [500, -220], [500, 220]].forEach(function (p) { H.box(M, X(p), 50 * s, 50 * s, X.r, z0, z0 + 400 * s, LK("steel")); }); } },
    shoe_rack: { n: "Shoe rack", cat: "Furniture", w: 800, d: 350, h: 900, key: "shoe_rack",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 800 * s, 350 * s, X.r), true).concat([L(X([-400, 0]), X([400, 0]))]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s, wd = LK("wood_light"); H.box(M, X([0, 0]), 800 * s, 350 * s, X.r, z0, z0 + 900 * s, wd); [200, 400, 600].forEach(function (h) { H.box(M, X([0, 0]), 760 * s, 320 * s, X.r, z0 + h * s, z0 + (h + 15) * s, wd); }); } },
    dressing_table: { n: "Dressing table with mirror", cat: "Furniture", w: 1000, d: 450, h: 1400, key: "dressing_table",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 1000 * s, 450 * s, X.r), true).concat([circ(X([-400, 0]), 180 * s)]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s, wd = LK("wood"); H.box(M, X([0, 0]), 1000 * s, 450 * s, X.r, z0, z0 + 750 * s, wd); H.box(M, X([0, -200]), 600 * s, 30 * s, X.r, z0 + 800 * s, z0 + 1400 * s, LK("chrome")); } },

    /* ===== KITCHEN ===== */
    kitchen_counter: { n: "Kitchen platform / counter", cat: "Kitchen", w: 2400, d: 600, h: 900, key: "kitchen_counter",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 2400 * s, 600 * s, X.r), true).concat([L(X([-800, -300]), X([-800, 300])), L(X([800, -300]), X([800, 300]))]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s; H.box(M, X([0, 0]), 2400 * s, 600 * s, X.r, z0, z0 + 860 * s, LK("laminate_white")); H.box(M, X([0, 0]), 2400 * s, 600 * s, X.r, z0 + 860 * s, z0 + 900 * s, LK("granite")); } },
    kitchen_counter_L: { n: "L-shaped kitchen platform", cat: "Kitchen", w: 2400, d: 2400, h: 900, key: "kitchen_counter",
      sym: function (X) { var s = X.s; var pts = [X([-1200, -1200]), X([1200, -1200]), X([1200, -600]), X([-600, -600]), X([-600, 1200]), X([-1200, 1200])]; return G.polySegs(pts, true); },
      mesh: function (M, X, z0, LK, H) { var s = X.s, lm = LK("laminate_white"), gr = LK("granite"); H.box(M, X([0, -900]), 2400 * s, 600 * s, X.r, z0, z0 + 860 * s, lm); H.box(M, X([0, -900]), 2400 * s, 600 * s, X.r, z0 + 860 * s, z0 + 900 * s, gr); H.box(M, X([-900, 300]), 600 * s, 1800 * s, X.r, z0, z0 + 860 * s, lm); H.box(M, X([-900, 300]), 600 * s, 1800 * s, X.r, z0 + 860 * s, z0 + 900 * s, gr); } },
    stove: { n: "Gas stove / hob", cat: "Kitchen", w: 600, d: 500, h: 100, key: "stove",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 600 * s, 500 * s, X.r), true).concat([circ(X([-150, 0]), 100 * s), circ(X([150, 0]), 80 * s)]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s; H.box(M, X([0, 0]), 600 * s, 500 * s, X.r, z0, z0 + 80 * s, LK("plastic_black")); cyl(M, X([-150, 0]), 100 * s, z0 + 80 * s, z0 + 100 * s, LK("steel_ss"), 16); cyl(M, X([150, 0]), 80 * s, z0 + 80 * s, z0 + 100 * s, LK("steel_ss"), 16); } },
    refrigerator: { n: "Refrigerator", cat: "Kitchen", w: 700, d: 700, h: 1800, key: "refrigerator",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 700 * s, 700 * s, X.r), true).concat([L(X([-350, -250]), X([350, -250]))]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s; H.box(M, X([0, 0]), 700 * s, 700 * s, X.r, z0, z0 + 1200 * s, LK("steel_ss")); H.box(M, X([0, 0]), 700 * s, 700 * s, X.r, z0 + 1210 * s, z0 + 1800 * s, LK("steel_ss")); } },
    chimney: { n: "Kitchen chimney", cat: "Kitchen", w: 600, d: 450, h: 700, mount: "wall", mz: 1800, key: "chimney",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 600 * s, 450 * s, X.r), true).concat([L(X([-200, -200]), X([200, 200])), L(X([-200, 200]), X([200, -200]))]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s; H.box(M, X([0, 0]), 600 * s, 450 * s, X.r, z0, z0 + 500 * s, LK("steel_ss")); H.box(M, X([0, 100]), 200 * s, 200 * s, X.r, z0 + 500 * s, z0 + 700 * s, LK("steel_ss")); } },
    microwave: { n: "Microwave oven", cat: "Kitchen", w: 500, d: 380, h: 300, key: "microwave",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 500 * s, 380 * s, X.r), true).concat([circ(X([80, 0]), 50 * s)]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s; H.box(M, X([0, 0]), 500 * s, 380 * s, X.r, z0, z0 + 300 * s, LK("plastic_black")); } },

    /* ===== SANITARY / PLUMBING (additional) ===== */
    bathtub: { n: "Bathtub", cat: "Plumbing", w: 1700, d: 750, h: 600, key: "bathtub",
      sym: function (X) { var s = X.s; var outer = G.polySegs(rect(X([0, 0]), 1700 * s, 750 * s, X.r), true); var inner = []; for (var i = 0; i < 20; i++) { var a = i / 20 * TAU, b = (i + 1) / 20 * TAU; inner.push(L(X([Math.cos(a) * 700, Math.sin(a) * 280]), X([Math.cos(b) * 700, Math.sin(b) * 280]))); } return outer.concat(inner); },
      mesh: function (M, X, z0, LK, H) { var s = X.s, cer = LK("porcelain"); H.prism(M, rect(X([0, 0]), 1700 * s, 750 * s, X.r), z0, z0 + 600 * s, cer, [rect(X([0, 0]), 1500 * s, 580 * s, X.r)]); } },
    shower: { n: "Shower enclosure", cat: "Plumbing", w: 900, d: 900, h: 2200, key: "shower",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 900 * s, 900 * s, X.r), true).concat([circ(X([0, 0]), 150 * s), L(X([-450, -450]), X([450, 450]))]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s, gl = LK("glass"); H.box(M, X([0, 0]), 900 * s, 20 * s, X.r, z0, z0 + 2000 * s, gl); H.box(M, X([0, -440]), 900 * s, 20 * s, X.r, z0, z0 + 2000 * s, gl); H.box(M, X([0, 0]), 900 * s, 900 * s, X.r, z0, z0 + 80 * s, LK("tile_ceramic")); cyl(M, X([0, 300]), 60 * s, z0 + 1800 * s, z0 + 2200 * s, LK("chrome"), 10); } },
    urinal: { n: "Urinal", cat: "Plumbing", w: 350, d: 350, h: 600, mount: "wall", mz: 600, key: "urinal",
      sym: function (X) { var s = X.s; var out = []; for (var i = 0; i < 12; i++) { var a = i / 12 * Math.PI, b = (i + 1) / 12 * Math.PI; out.push(L(X([Math.cos(a) * 175, -Math.sin(a) * 175]), X([Math.cos(b) * 175, -Math.sin(b) * 175]))); } out.push(L(X([-175, 0]), X([175, 0]))); return out; },
      mesh: function (M, X, z0, LK, H) { var s = X.s; H.box(M, X([0, 0]), 350 * s, 300 * s, X.r, z0, z0 + 600 * s, LK("ceramic")); } },
    geyser: { n: "Geyser / water heater", cat: "Plumbing", w: 400, d: 400, h: 600, mount: "wall", mz: 1800, key: "geyser",
      sym: function (X) { return [circ(X([0, 0]), 200 * X.s), circ(X([0, 0]), 80 * X.s)]; },
      mesh: function (M, X, z0, LK) { var s = X.s; cyl(M, X([0, 0]), 200 * s, z0, z0 + 600 * s, LK("plastic_white"), 16); } },
    wash_area: { n: "Washing machine area", cat: "Plumbing", w: 650, d: 650, h: 900, key: "wash_area",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 650 * s, 650 * s, X.r), true).concat([circ(X([0, 0]), 200 * s)]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s; H.box(M, X([0, 0]), 650 * s, 650 * s, X.r, z0, z0 + 900 * s, LK("plastic_white")); cyl(M, X([0, -50]), 200 * s, z0 + 550 * s, z0 + 560 * s, LK("glass_tint"), 20); } },

    /* ===== LANDSCAPE (additional) ===== */
    flower_pot: { n: "Flower pot / planter", cat: "Landscape", w: 500, d: 500, h: 500, key: "flower_pot",
      sym: function (X) { return [circ(X([0, 0]), 250 * X.s), circ(X([0, 0]), 180 * X.s)]; },
      mesh: function (M, X, z0, LK) { var s = X.s, c = X([0, 0]); cyl(M, c, 200 * s, z0, z0 + 350 * s, LK("ceramic"), 14, 250 * s); sphere(M, c, 220 * s, z0 + 420 * s, LK("foliage")); } },
    hedge: { n: "Hedge / boundary shrub", cat: "Landscape", w: 1500, d: 400, h: 1200, key: "hedge",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 1500 * s, 400 * s, X.r), true); },
      mesh: function (M, X, z0, LK, H) { var s = X.s; H.box(M, X([0, 0]), 1500 * s, 400 * s, X.r, z0, z0 + 1200 * s, LK("foliage")); } },
    fountain: { n: "Fountain", cat: "Landscape", w: 1500, d: 1500, h: 800, key: "fountain",
      sym: function (X) { return [circ(X([0, 0]), 750 * X.s), circ(X([0, 0]), 500 * X.s), circ(X([0, 0]), 100 * X.s)]; },
      mesh: function (M, X, z0, LK) { var s = X.s, c = X([0, 0]), st = LK("stone"); cyl(M, c, 750 * s, z0, z0 + 400 * s, st, 24, 700 * s); cyl(M, c, 500 * s, z0 + 400 * s, z0 + 420 * s, st, 20); cyl(M, c, 100 * s, z0 + 300 * s, z0 + 800 * s, st, 12, 80 * s); } },
    bollard: { n: "Bollard", cat: "Landscape", w: 200, d: 200, h: 900, key: "bollard",
      sym: function (X) { return [circ(X([0, 0]), 100 * X.s)]; },
      mesh: function (M, X, z0, LK) { cyl(M, X([0, 0]), 75 * X.s, z0, z0 + 900 * X.s, LK("steel"), 10, 75 * X.s); sphere(M, X([0, 0]), 85 * X.s, z0 + 900 * X.s, LK("steel")); } },
    dustbin: { n: "Dustbin / waste bin", cat: "Landscape", w: 500, d: 500, h: 900, key: "dustbin",
      sym: function (X) { return [circ(X([0, 0]), 250 * X.s), L(X([-250, 0]), X([250, 0]))]; },
      mesh: function (M, X, z0, LK) { var s = X.s; cyl(M, X([0, 0]), 230 * s, z0, z0 + 800 * s, LK("plastic_black"), 14, 200 * s); cyl(M, X([0, 0]), 240 * s, z0 + 800 * s, z0 + 850 * s, LK("plastic_black"), 14); } },
    gate: { n: "Main gate (MS)", cat: "Landscape", w: 3600, d: 100, h: 2100, key: "gate",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 3600 * s, 100 * s, X.r), true).concat([L(X([0, -50]), X([0, 50]))]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s, st = LK("steel"); H.box(M, X([-1700, 0]), 100 * s, 100 * s, X.r, z0, z0 + 2100 * s, st); H.box(M, X([1700, 0]), 100 * s, 100 * s, X.r, z0, z0 + 2100 * s, st); H.box(M, X([0, 0]), 3400 * s, 40 * s, X.r, z0 + 300 * s, z0 + 1800 * s, st); H.box(M, X([0, 0]), 3400 * s, 40 * s, X.r, z0 + 1800 * s, z0 + 2100 * s, st); } },
    pergola: { n: "Pergola / open shade", cat: "Landscape", w: 3000, d: 3000, h: 2800, key: "pergola",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 3000 * s, 3000 * s, X.r), true).concat([L(X([-1500, 0]), X([1500, 0])), L(X([0, -1500]), X([0, 1500]))]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s, wd = LK("wood"); [[-1400, -1400], [-1400, 1400], [1400, -1400], [1400, 1400]].forEach(function (p) { H.box(M, X(p), 150 * s, 150 * s, X.r, z0, z0 + 2600 * s, wd); }); for (var i = -2; i <= 2; i++) H.box(M, X([0, i * 600]), 3000 * s, 100 * s, X.r, z0 + 2600 * s, z0 + 2700 * s, wd); for (var j = -2; j <= 2; j++) H.box(M, X([j * 600, 0]), 100 * s, 3000 * s, X.r, z0 + 2700 * s, z0 + 2800 * s, wd); } },

    /* ===== HVAC / SERVICES (additional) ===== */
    ac_split: { n: "Split AC (indoor unit)", cat: "Electrical", w: 900, d: 250, h: 300, mount: "wall", mz: 2100, key: "ac_split",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 900 * s, 250 * s, X.r), true).concat([L(X([-350, -125]), X([350, -125]))]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s; H.box(M, X([0, 0]), 900 * s, 250 * s, X.r, z0, z0 + 300 * s, LK("plastic_white")); H.box(M, X([0, -100]), 750 * s, 30 * s, X.r, z0 + 50 * s, z0 + 250 * s, LK("plastic_white")); } },
    ac_outdoor: { n: "Split AC (outdoor unit)", cat: "Electrical", w: 800, d: 350, h: 600, key: "ac_outdoor",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 800 * s, 350 * s, X.r), true).concat([circ(X([0, 0]), 120 * s)]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s; H.box(M, X([0, 0]), 800 * s, 350 * s, X.r, z0, z0 + 600 * s, LK("steel")); } },
    exhaust_fan: { n: "Exhaust fan", cat: "Electrical", w: 300, d: 150, h: 300, mount: "wall", mz: 2400, key: "exhaust_fan",
      sym: function (X) { return [circ(X([0, 0]), 150 * X.s), L(X([-106, -106]), X([106, 106])), L(X([-106, 106]), X([106, -106]))]; },
      mesh: function (M, X, z0, LK, H) { var s = X.s; H.box(M, X([0, 0]), 300 * s, 150 * s, X.r, z0, z0 + 300 * s, LK("plastic_white")); } },
    cctv: { n: "CCTV camera", cat: "Electrical", w: 150, d: 150, h: 200, mount: "wall", mz: 2800, key: "cctv",
      sym: function (X) { return [circ(X([0, 0]), 75 * X.s), L(X([0, 0]), X([100, 0]))]; },
      mesh: function (M, X, z0, LK, H) { var s = X.s; H.box(M, X([0, 0]), 80 * s, 80 * s, X.r, z0, z0 + 80 * s, LK("plastic_white")); H.box(M, X([50, 0]), 130 * s, 60 * s, X.r, z0 + 30 * s, z0 + 100 * s, LK("plastic_white")); } },

    /* ===== WALL PANELS / CLADDING (as placeable items) ===== */
    acp_panel: { n: "ACP panel (elevation)", cat: "Finishes", w: 2400, d: 20, h: 2400, mount: "wall", mz: 0, key: "acp_panel",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 2400 * s, 20 * s, X.r), true).concat([L(X([-1200, 0]), X([1200, 0]))]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s; H.box(M, X([0, 0]), 2400 * s, 20 * s, X.r, z0, z0 + 2400 * s, LK("acp_silver")); } },
    wall_panel_wood: { n: "Wood wall panel", cat: "Finishes", w: 2400, d: 20, h: 2400, mount: "wall", mz: 0, key: "wall_panel",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 2400 * s, 20 * s, X.r), true).concat([L(X([-800, -10]), X([-800, 10])), L(X([0, -10]), X([0, 10])), L(X([800, -10]), X([800, 10]))]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s; H.box(M, X([0, 0]), 2400 * s, 20 * s, X.r, z0, z0 + 2400 * s, LK("hpl_wood")); } },
    wall_panel_wpc: { n: "WPC wall panel", cat: "Finishes", w: 2400, d: 20, h: 2400, mount: "wall", mz: 0, key: "wall_panel",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 2400 * s, 20 * s, X.r), true).concat([L(X([-600, -10]), X([-600, 10])), L(X([600, -10]), X([600, 10]))]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s; H.box(M, X([0, 0]), 2400 * s, 20 * s, X.r, z0, z0 + 2400 * s, LK("wpc_brown")); } },
    stone_veneer: { n: "Stone veneer cladding", cat: "Finishes", w: 2400, d: 30, h: 2400, mount: "wall", mz: 0, key: "stone_veneer",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 2400 * s, 30 * s, X.r), true); },
      mesh: function (M, X, z0, LK, H) { var s = X.s; H.box(M, X([0, 0]), 2400 * s, 30 * s, X.r, z0, z0 + 2400 * s, LK("stone_cladding")); } },

    /* ===== MISCELLANEOUS ===== */
    mirror: { n: "Mirror", cat: "Plumbing", w: 600, d: 10, h: 900, mount: "wall", mz: 1000, key: "mirror",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 600 * s, 10 * s, X.r), true); },
      mesh: function (M, X, z0, LK, H) { var s = X.s; H.box(M, X([0, 0]), 600 * s, 10 * s, X.r, z0, z0 + 900 * s, LK("chrome")); } },
    towel_rack: { n: "Towel rack / rod", cat: "Plumbing", w: 600, d: 80, h: 50, mount: "wall", mz: 1200, key: "towel_rack",
      sym: function (X) { var s = X.s; return [L(X([-300, 0]), X([300, 0]))]; },
      mesh: function (M, X, z0, LK, H) { var s = X.s; H.box(M, X([0, 0]), 600 * s, 30 * s, X.r, z0, z0 + 30 * s, LK("chrome")); } },
    ramp: { n: "Ramp (accessible)", cat: "Landscape", w: 3000, d: 1200, h: 600, key: "ramp",
      sym: function (X) { var s = X.s; return G.polySegs(rect(X([0, 0]), 3000 * s, 1200 * s, X.r), true).concat([L(X([-1500, 0]), X([1500, 0]))]); },
      mesh: function (M, X, z0, LK, H) { var s = X.s, cc = LK("concrete"); H.box(M, X([0, 0]), 3000 * s, 1200 * s, X.r, z0, z0 + 300 * s, cc); } },
    flag_pole: { n: "Flag pole", cat: "Landscape", w: 200, d: 200, h: 6000, key: "flag_pole",
      sym: function (X) { return [circ(X([0, 0]), 100 * X.s), circ(X([0, 0]), 40 * X.s)]; },
      mesh: function (M, X, z0, LK) { cyl(M, X([0, 0]), 60 * X.s, z0, z0 + 6000 * X.s, LK("steel"), 10, 30 * X.s); } }
  };
  function tankD(e) { var V = Math.max(200, +e.cap || 1000) * 1e6; return Math.round(Math.cbrt(4 * V / (1.05 * Math.PI))); }
  B.tankD = tankD;
  /* SOR suggestions for the asset counts (change them in Σ Quantities) */
  B.MAP = B.MAP || {}; Object.assign(B.MAP, {
    plant_tree: { c: [["hort", "2.14.1"]], q: /digging holes/i, books: ["hort"] }, plant_shrub: { c: [["hort", "2.14.3"]], q: /digging holes/i, books: ["hort"] },
    bench: null, lamp_post: { q: /garden light|bollard|post top/i, books: ["em22"] }, street_light: { q: /street light/i, books: ["em22"] },
    manhole: { c: [["cpwd23", "19.7.1.1"], ["cpwd", "19.7.1.1"]], q: /constructing brick masonry manhole/i }, wc_ewc: { c: [["cpwd23", "17.2.1"], ["cpwd", "17.2.1"]], q: /European type W\.?C/i },
    wc_iwc: { c: [["cpwd23", "17.13.2"], ["cpwd", "17.13.2"]], q: /Orissa pattern/i }, basin: { c: [["cpwd23", "17.7.1"], ["cpwd", "17.7.1"]], q: /fixing wash basin/i }, sink: { c: [["cpwd23", "17.10.1.1"], ["cpwd", "17.9.1"]], q: /kitchen sink/i },
    floor_trap: { c: [["cpwd23", "19.4.1.1"]], q: /gully trap/i }, water_tank: { c: [["cpwd23", "18.48"], ["cpwd", "18.48"]], q: /polyethylene water storage tank/i },
    light_point: { c: [["em22", "1.1.1"]], q: /wiring for light point/i, books: ["em22"] }, fan: { c: [["em22", "1.44"]], q: /ceiling fan/i, books: ["em22"] }, fan_point: { c: [["em22", "1.1.1"]], books: ["em22"] },
    switchboard: { q: /switch board|modular switch/i, books: ["em22"] }, socket: { c: [["em22", "1.23.4"]], q: /socket/i, books: ["em22"] }, db: { c: [["em22", "2.3.1"]], q: /MCB distribution board/i, books: ["em22"] },
    land_lawn: { c: [["hort", "2.10.1"]], q: /grassing/i, books: ["hort"] }, land_paver: { c: [["cpwd23", "16.91.1"], ["cpwd23", "16.68"]], q: /paver block/i }, land_gravel: { q: /gravel|brick ballast/i }, land_bed: { c: [["hort", "2.13"]], q: /beds for hedging/i, books: ["hort"] }, land_pcc: { c: [["cpwd23", "4.1.8"]], q: /cement concrete.*1:4:8/i },
    /* new items */
    bed_single: null, bed_double: null, dining_table: null, chair: null, sofa: null, wardrobe: null, desk: null, bookshelf: null, tv_unit: null, center_table: null, shoe_rack: null, dressing_table: null,
    kitchen_counter: { q: /kitchen platform|granite counter/i }, stove: null, refrigerator: null, chimney: null, microwave: null,
    bathtub: { q: /bath tub/i }, shower: { q: /shower enclosure|cubicle/i }, urinal: { c: [["cpwd23", "17.4.1"]], q: /urinal/i }, geyser: { q: /geyser|water heater/i }, wash_area: null,
    flower_pot: null, hedge: { c: [["hort", "2.13"]], q: /hedging/i, books: ["hort"] }, fountain: null, bollard: null, dustbin: null, gate: { q: /gate/i }, pergola: null,
    ac_split: { q: /split.*air.*conditioner|split.*AC/i }, ac_outdoor: null, exhaust_fan: { c: [["em22", "1.51"]], q: /exhaust fan/i, books: ["em22"] }, cctv: null,
    acp_panel: { q: /ACP.*panel|aluminium composite/i }, wall_panel: { q: /wall panel|WPC panel|HPL/i }, stone_veneer: { q: /stone.*veneer|stone.*cladding/i },
    mirror: { q: /mirror/i }, towel_rack: { q: /towel/i }, ramp: { q: /ramp/i }, flag_pole: null
  });

  function xf(e) { var s = e.sc || 1, r = (e.rot || 0) * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r), f = function (q) { return [e.p[0] + (q[0] * c - q[1] * sn) * s, e.p[1] + (q[0] * sn + q[1] * c) * s]; }; f.s = s; f.r = e.rot || 0; return f; }
  /* Where an item sits in height. Instead of one "height above the level" the user picks what to measure from (e.ref) and a distance (e.dz):
       floor   – item bottom is dz above the floor of its level
       fceil   – item hangs under the false ceiling of the room it is in, dz below it (0 = touching)
       ceiling – item hangs under the slab above (its underside), dz below it
       top     – item stands on top of the slab above (terrace), dz above it
     No e.ref = the item's own usual place (floor / wall height / ceiling), or the old e.z. */
  B.MOUNT_REFS = [["floor", "Floor of this level"], ["fceil", "False ceiling"], ["ceiling", "Slab underside (ceiling)"], ["top", "Top of the slab above (terrace)"]];
  /* false ceiling: height of its underside above the floor — the room's own value, else 300 mm under the slab (never below 2.1 m) */
  B.fceilH = function (doc, room, lvl) { var L = B.level(doc.d, room ? room.lvl : lvl), soffit = L.h - B.ensure(doc.d).slabTh; return room && room.fch != null && room.fch > 0 ? Math.min(room.fch, soffit) : Math.max(Math.min(2100, soffit), soffit - 300); };
  B.roomAt = function (doc, p, lvl, onlyCeil) { var hit = null; doc.d.ents.forEach(function (r) { if (hit || r.t !== "room" || r.lvl !== lvl || (onlyCeil && !r.ceil) || !r.pts) return; if (G.inPoly(p, r.pts)) hit = r; }); return hit; };
  function mountZ(doc, e, def) { var d = doc.d, L = B.level(d, e.lvl), bs = B.ensure(d);
    if (e.ref) { var dz = +e.dz || 0, hh = (def.h || 60) * (e.sc || 1), soffit = L.elev + L.h - bs.slabTh;
      if (e.ref === "floor") return L.elev + dz; if (e.ref === "ceiling") return soffit - hh - dz; if (e.ref === "top") return L.elev + L.h + dz;
      if (e.ref === "fceil") return L.elev + B.fceilH(doc, B.roomAt(doc, e.p, e.lvl, true), e.lvl) - hh - dz; }
    if (e.z != null) return L.elev + e.z;
    /* domes, shikhars: on top of the slab above this level */ if (def.mount === "top") return L.elev + L.h;  if (def.mount === "ceiling") return L.elev + L.h - bs.slabTh - (def.h || 60); if (def.mount === "wall") return L.elev + (def.mz || 1200); return L.elev + (def.mz || 0); }
  B.assetZ = mountZ;

  var CAT_FILL = B.CAT_FILL = { Landscape: "rgba(90,160,70,.15)", Plumbing: "rgba(80,160,220,.12)", Electrical: "rgba(220,200,50,.12)", Furniture: "rgba(160,120,60,.15)", Kitchen: "rgba(180,140,80,.12)", Finishes: "rgba(120,140,180,.10)" };
  /* Wall snapping for library items. Near a wall of its level an item jumps flush against the wall face on the cursor's side:
     wall-mounted items and sanitary ware turn their back (+y of the symbol) to the wall, everything else just turns parallel
     to the wall, keeping the nearest quarter turn to its present rotation. Returns { p, rot } or null when no wall is near. */
  B.assetWallSnap = function (doc, e, p) {
    var def = A[e.kind]; if (!def || def.cat === "Landscape" || def.mount === "ceiling" || !doc.idx) return null;
    B.ctx.doc = doc; var s = e.sc || 1, W = (def.w || 1000) * s, D = (def.d || 1000) * s, back = def.mount === "wall" || def.cat === "Plumbing", reach = Math.max(W, D) / 2 + 600, best = null;
    doc.idx.query(p[0] - reach - 300, p[1] - reach - 300, p[0] + reach + 300, p[1] + reach + 300).forEach(function (w) {
      if (w.t !== "wall" || (e.lvl && w.lvl !== e.lvl) || (doc.visible && !doc.visible(w))) return;
      var c = B.wallLine(w), v = G.sub(p, c.a), along = G.dot(v, c.u), dd = G.dot(v, c.n); if (along < 0 || along > c.L) return;
      var wa = Math.atan2(c.u[1], c.u[0]) * 180 / Math.PI, side = dd >= 0 ? 1 : -1, rot, ext;
      if (back) { rot = Math.atan2(-c.n[1] * side, -c.n[0] * side) * 180 / Math.PI - 90; ext = D / 2; }
      else { var k = Math.round(((e.rot || 0) - wa) / 90); rot = wa + k * 90; ext = (((k % 2) + 2) % 2 ? W : D) / 2; }
      var gap = Math.abs(dd) - w.th / 2 - ext; if (gap > 250 || (best && Math.abs(gap) >= Math.abs(best.gap))) return;   // only when the item is (nearly) touching the wall
      var half = (back || !(((Math.round((rot - wa) / 90) % 2) + 2) % 2) ? W : D) / 2, al = c.L > 2 * half ? Math.max(half, Math.min(c.L - half, along)) : along;   // keep it on the wall's length
      best = { gap: gap, p: G.add(G.add(c.a, G.mul(c.u, al)), G.mul(c.n, side * (w.th / 2 + ext))), rot: ((rot % 360) + 360) % 360 };
    });
    return best ? { p: best.p, rot: best.rot } : null;
  };
  B.EXT.asset = {
    plan: function (doc, e) { var def = A[e.kind] || A.tree, X = xf(e), s = e.sc || 1, fillCol = CAT_FILL[def.cat] || "rgba(140,140,140,.1)", fp = rect(X([0, 0]), (def.w || 1000) * s, (def.d || 1000) * s, (e.rot || 0)); return { segs: def.sym(X, e), fill: [{ pts: fp, col: fillCol }], dashed: def.mount === "ceiling" ? G.polySegs(fp, true) : [] }; },
    labels: function (doc, e, h) { return []; },
    xform: function (e, M) { var o = JSON.parse(JSON.stringify(e)), det = M[0] * M[3] - M[1] * M[2], rr = Math.atan2(M[1], M[0]) * 180 / Math.PI; o.p = G.mApply(M, e.p); o.rot = (e.rot || 0) + (det < 0 ? -rr : rr); var sc = Math.sqrt(Math.abs(det)); if (Math.abs(sc - 1) > 1e-6) o.sc = (e.sc || 1) * sc; return o; },
    qty: function (doc, e) { var def = A[e.kind] || A.tree, rows = [], z; if (e.noq === true || (def.deco && e.noq !== false)) return rows;   /* decoration and items switched off are for the view only */
      z = e.lvl ? B.below(doc.d, e.lvl) : "super"; if (e.kind === "tank") rows.push({ k: "water_tank", dim: "V", v: (+e.cap || 1000) * 1e6, label: "Water tank " + (+e.cap || 1000) + " litre", f: "capacity", z: z }); else if (def.q) { var sc = e.sc || 1, Wm = (def.w || 0) * sc, Hm = (def.q.h || def.h || 0) * sc, mm = function (v) { return (v / 1000).toFixed(2); };   // measured items: sqm, running metre or approximate weight instead of a count
        if (def.q.dim === "L") rows.push({ k: def.key, dim: "L", v: Wm, label: def.n, f: mm(Wm) + " m run", z: z });
        else if (def.q.dim === "M") rows.push({ k: def.key, dim: "M", v: Wm * Hm / 1e6 * def.q.kg, label: def.n, f: mm(Wm) + " × " + mm(Hm) + " m × " + def.q.kg + " kg/m² (approximate weight — check with the fabrication drawing)", z: z });
        else rows.push({ k: def.key, dim: "A", v: Wm * Hm, label: def.n, f: mm(Wm) + " × " + mm(Hm), z: z }); }
      else rows.push({ k: def.deco ? e.kind : def.key, dim: "N", v: 1, label: def.n, f: "1 no.", z: z });   /* a decoration item the user chose to count gets its own row */ if (e.kind === "fan") rows.push({ k: "fan_point", dim: "N", v: 1, label: "Fan point wiring", f: "1 point", z: z }); return rows; },
    mesh: function (M, doc, e, H) { var def = A[e.kind] || A.tree, d = doc.d, LK = function (id) { if (id === "landscape_bench") return B.lookFor(d, "landscape", e.look && B.LOOKS[e.look] ? e.look : "wood", e.col); return B.look(id); }; var zM = mountZ(doc, e, def); def.mesh(M, xf(e), zM, LK, H, e);
      /* a light fitting also lights the 3D view: a point just below a ceiling fitting, near the top of a standing one */
      if (H.lights && (def.cat === "Lighting" || /light|lamp|chandelier|bulb|lantern/i.test(def.n || "")) && !/switch|point wiring/i.test(def.n || "")) { var cL = xf(e)([0, 0]), sL = e.sc || 1, hL = (def.h || 100) * sL, up = def.mount === "ceiling" || def.mount === "top"; H.lights.push([cL[0] * 0.001, cL[1] * 0.001, (up ? zM - 120 : zM + hL * 0.9) * 0.001, hL > 2500 ? 3.2 : 1]); } }
  };
  /* ---------- landscape areas ---------- */
  var LAND = { lawn: ["Lawn (grassing)", "grass", "rgba(90,150,70,.35)"], paver: ["Paver blocks", "paver", "rgba(150,140,128,.4)"], gravel: ["Gravel / ballast", "gravel", "rgba(170,160,145,.35)"], bed: ["Planting bed (shrubbery)", "soil", "rgba(120,95,70,.35)"], pcc: ["PCC paving 1:4:8", "concrete", "rgba(170,170,170,.35)"] };
  B.LAND = LAND;
  B.EXT.land = {
    plan: function (doc, e) { var k = LAND[e.kind] || LAND.lawn; return { segs: G.polySegs(e.pts, true), fill: [{ pts: e.pts, col: k[2] }], dashed: [] }; },
    labels: function (doc, e, h) { var bb = B.polyBox(e.pts), k = LAND[e.kind] || LAND.lawn; return [{ p: [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2], s: k[0] + "\n" + (B.area(e.pts) / 1e6).toFixed(2) + " m²", h: h, al: "cm" }]; },
    xform: function (e, M) { var o = JSON.parse(JSON.stringify(e)); o.pts = e.pts.map(function (p) { return G.mApply(M, p); }); return o; },
    qty: function (doc, e) { var k = LAND[e.kind] || LAND.lawn; return [{ k: "land_" + (e.kind || "lawn"), dim: "A", v: B.area(e.pts), label: k[0], f: "plan area", z: e.lvl ? B.below(doc.d, e.lvl) : "super" }]; },
    mesh: function (M, doc, e, H) { var k = LAND[e.kind] || LAND.lawn, L = B.level(doc.d, e.lvl), z = (L ? L.elev : 0) + (e.z || 0); H.prism(M, e.pts, z - 30, z + 15, B.look(e.look && B.LOOKS[e.look] ? e.look : k[1], e.col), null, 1, true); }
  };

  /* ---------- imported 3D models (GLB / glTF 2.0) ---------- */
  B.GLB = {};   // asset id → { pos: Float32Array (x,y,z m, z up), col: Float32Array (r,g,b,a per vertex), n (vertices), bbox: [x0,y0,z0,x1,y1,z1] }
  B.parseGLTF = function (buf, name) {
    var dv = new DataView(buf), json, bin = null;
    if (dv.getUint32(0, true) === 0x46546C67) {
      var len = dv.getUint32(8, true), off = 12;
      while (off < len) { var cl = dv.getUint32(off, true), ct = dv.getUint32(off + 4, true), data = buf.slice(off + 8, off + 8 + cl); if (ct === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(data)); else if (ct === 0x004E4942) bin = data; off += 8 + cl; }
    } else json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf)));
    if (!json) throw new Error("Not a glTF / GLB file");
    var req = (json.extensionsRequired || []); if (req.length) throw new Error("This model needs " + req.join(", ") + " (compressed models are not supported — export without Draco / meshopt compression)");
    var buffers = (json.buffers || []).map(function (b, i) { if (b.uri == null) return bin; var m = /^data:.*?;base64,(.*)$/.exec(b.uri); if (!m) throw new Error("External .bin files are not supported — use a single .glb file"); var s = atob(m[1]), u = new Uint8Array(s.length); for (var k = 0; k < s.length; k++) u[k] = s.charCodeAt(k); return u.buffer; });
    function acc(i) {
      var a = json.accessors[i], bv = json.bufferViews[a.bufferView], buffer = buffers[bv.buffer], comp = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }[a.componentType], nc = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type], es = comp.BYTES_PER_ELEMENT, stride = bv.byteStride || nc * es, base = (bv.byteOffset || 0) + (a.byteOffset || 0), out = new Float32Array(a.count * nc), view = new DataView(buffer);
      var rd = { 5120: "getInt8", 5121: "getUint8", 5122: "getInt16", 5123: "getUint16", 5125: "getUint32", 5126: "getFloat32" }[a.componentType], norm = a.normalized ? { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType] : 0;
      for (var k = 0; k < a.count; k++) for (var c = 0; c < nc; c++) { var v = view[rd](base + k * stride + c * es, true); out[k * nc + c] = norm ? Math.max(v / norm, -1) : v; }
      return { d: out, n: nc, count: a.count };
    }
    function mat4(n) { if (n.matrix) return n.matrix.slice(); var t = n.translation || [0, 0, 0], r = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1], x = r[0], y = r[1], z = r[2], w = r[3]; return [(1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0, 2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0, 2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0, t[0], t[1], t[2], 1]; }
    function mm(a, b) { var o = new Array(16); for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) { var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
    var P = [], Cc = [], LIMIT = 600000;
    function prim(p, M) {
      if (p.mode != null && p.mode !== 4) return; var pos = acc(p.attributes.POSITION), idx = p.indices != null ? acc(p.indices).d : null, mat = p.material != null && json.materials ? json.materials[p.material] : null, pbr = mat && mat.pbrMetallicRoughness, bc = (pbr && pbr.baseColorFactor) || [0.8, 0.8, 0.8, 1], vc = p.attributes.COLOR_0 != null ? acc(p.attributes.COLOR_0) : null, alpha = mat && mat.alphaMode === "BLEND" ? bc[3] : 1;
      var n = idx ? idx.length : pos.count;
      for (var k = 0; k < n; k++) {
        if (P.length / 3 >= LIMIT) return; var vi = idx ? idx[k] : k, x = pos.d[vi * 3], y = pos.d[vi * 3 + 1], z = pos.d[vi * 3 + 2];
        var X = M[0] * x + M[4] * y + M[8] * z + M[12], Y = M[1] * x + M[5] * y + M[9] * z + M[13], Z = M[2] * x + M[6] * y + M[10] * z + M[14];
        P.push(X, -Z, Y);   // glTF is y-up → drawing z-up
        var r = bc[0], g = bc[1], b = bc[2]; if (vc) { r *= vc.d[vi * vc.n]; g *= vc.d[vi * vc.n + 1]; b *= vc.d[vi * vc.n + 2]; }
        Cc.push(Math.pow(r, 1 / 2.2), Math.pow(g, 1 / 2.2), Math.pow(b, 1 / 2.2), alpha);
      }
    }
    function walk(ni, parent) { var n = json.nodes[ni], M = mm(parent, mat4(n)); if (n.mesh != null) json.meshes[n.mesh].primitives.forEach(function (p) { prim(p, M); }); (n.children || []).forEach(function (c) { walk(c, M); }); }
    var I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], sc = json.scenes && json.scenes[json.scene || 0];
    if (sc) sc.nodes.forEach(function (ni) { walk(ni, I); }); else (json.meshes || []).forEach(function (m) { m.primitives.forEach(function (p) { prim(p, I); }); });
    if (!P.length) throw new Error("No triangles found in the model");
    var bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (var i = 0; i < P.length; i += 3) for (var k2 = 0; k2 < 3; k2++) { bb[k2] = Math.min(bb[k2], P[i + k2]); bb[k2 + 3] = Math.max(bb[k2 + 3], P[i + k2]); }
    return { pos: new Float32Array(P), col: new Float32Array(Cc), n: P.length / 3, bbox: bb, name: name || "", truncated: P.length / 3 >= LIMIT };
  };
  function mxf(e, g) { var s = (e.sc || 1) * 1000, r = (e.rot || 0) * Math.PI / 180, c = Math.cos(r), sn = Math.sin(r), cx = (g.bbox[0] + g.bbox[3]) / 2, cy = (g.bbox[1] + g.bbox[4]) / 2; return function (x, y) { x -= cx; y -= cy; return [e.p[0] + (x * c - y * sn) * s, e.p[1] + (x * sn + y * c) * s]; }; }
  B.EXT.model3d = {
    plan: function (doc, e) { var g = B.GLB[e.asset], out = { segs: [], fill: [], dashed: [] }; if (!g) { out.dashed = G.polySegs(B.rectAt(e.p, 1000, 1000, e.rot || 0), true); return out; } var f = mxf(e, g), b = g.bbox; out.segs = G.polySegs([f(b[0], b[1]), f(b[3], b[1]), f(b[3], b[4]), f(b[0], b[4])], true); out.dashed = [L(f(b[0], b[1]), f(b[3], b[4])), L(f(b[3], b[1]), f(b[0], b[4]))]; return out; },
    labels: function (doc, e, h) { var a = (doc.d.assets || {})[e.asset]; return [{ p: e.p, s: (e.name || (a && a.name) || "3D model") + (B.GLB[e.asset] ? "" : " (loading…)"), h: h * 0.8, al: "cm" }]; },
    xform: function (e, M) { var o = JSON.parse(JSON.stringify(e)), det = M[0] * M[3] - M[1] * M[2], rr = Math.atan2(M[1], M[0]) * 180 / Math.PI; o.p = G.mApply(M, e.p); o.rot = (e.rot || 0) + rr; var sc = Math.sqrt(Math.abs(det)); if (Math.abs(sc - 1) > 1e-6) o.sc = (e.sc || 1) * sc; return o; },
    qty: function (doc, e) { return e.count === false ? [] : [{ k: "model_" + (e.key || "item"), dim: "N", v: 1, label: e.name || "Imported 3D model", f: "1 no.", z: e.lvl ? B.below(doc.d, e.lvl) : "super" }]; },
    mesh: function (M, doc, e, H) {
      var g = B.GLB[e.asset], L = B.level(doc.d, e.lvl), z0 = (L ? L.elev : 0) + (e.z || 0); if (!g) { H.box(M, e.p, 1000, 1000, e.rot || 0, z0, z0 + 1000, B.look("plastic_white")); return; }
      var f = mxf(e, g), s = (e.sc || 1) * 1000, zb = g.bbox[2], P = g.pos, Cc = g.col, id = M.id;
      for (var i = 0; i + 8 < P.length; i += 9) {
        var a = f(P[i], P[i + 1]), b = f(P[i + 3], P[i + 4]), c = f(P[i + 6], P[i + 7]), k = i / 3 * 4, col = [Cc[k], Cc[k + 1], Cc[k + 2]]; col.a = Cc[k + 3]; col.p = 0; col.g = 0.3;
        M.tri([a[0] * K, a[1] * K, (z0 + (P[i + 2] - zb) * s) * K], [b[0] * K, b[1] * K, (z0 + (P[i + 5] - zb) * s) * K], [c[0] * K, c[1] * K, (z0 + (P[i + 8] - zb) * s) * K], col);
      }
    }
  };
  /* helpers shared with assets2.js (extra library items) */
  B.AH = { cyl: cyl, sphere: sphere, rect: rect, circ: circ, L: L, V: V };
})();
