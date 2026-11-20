/* Estimate Pro — catalogue 5: decoration for presentation views (people, vehicles, trees and plants, garden and road pieces).
   These are VIEW ONLY: def.deco = true → they never enter Σ Quantities or an estimate (see B.EXT.asset.qty).
   Any other library item can also be switched out of the quantities with "Count in the estimate: No" (e.noq). Schematic shapes. */
(function () {
  "use strict";
  var EP = window.EP, B = EP.bim, A = B && B.ASSET_LIB, mk = B && B.AH && B.AH.mk; if (!A || !mk) return;
  var PT = B.PT, DE = "Decoration (view only)";
  Object.assign(B.LOOKS, {
    deco_skin: { n: "Figure — skin", c: "#c99a78", p: PT.plain, g: 0.1 }, deco_hair: { n: "Figure — hair", c: "#2b2320", p: PT.plain, g: 0.2 },
    deco_cloth_blue: { n: "Cloth — blue", c: "#35619c", p: PT.plain, g: 0.05 }, deco_cloth_red: { n: "Cloth — red", c: "#b5413a", p: PT.plain, g: 0.05 }, deco_cloth_white: { n: "Cloth — white", c: "#eeeeea", p: PT.plain, g: 0.05 },
    deco_cloth_yellow: { n: "Cloth — yellow", c: "#e0b23c", p: PT.plain, g: 0.05 }, deco_cloth_grey: { n: "Cloth — dark grey", c: "#3f4347", p: PT.plain, g: 0.05 }, deco_cloth_green: { n: "Cloth — green", c: "#3f7d55", p: PT.plain, g: 0.05 },
    deco_car_white: { n: "Car paint — white", c: "#f1f2f2", p: PT.plain, g: 0.85 }, deco_car_red: { n: "Car paint — red", c: "#b32222", p: PT.plain, g: 0.85 }, deco_car_silver: { n: "Car paint — silver", c: "#b9bdc2", p: PT.plain, g: 0.9 },
    deco_car_black: { n: "Car paint — black", c: "#17181a", p: PT.plain, g: 0.9 }, deco_car_blue: { n: "Car paint — blue", c: "#1f4f8f", p: PT.plain, g: 0.85 }, deco_car_yellow: { n: "Paint — yellow (auto / bus)", c: "#e3b21a", p: PT.plain, g: 0.6 },
    deco_tyre: { n: "Tyre rubber", c: "#151515", p: PT.plain, g: 0.05 }, deco_carglass: { n: "Car glass", c: "#27343d", p: PT.plain, g: 0.9 },
    deco_leaf: { n: "Leaves — green", c: "#3f7a34", p: PT.grass, g: 0.05 }, deco_leaf_dark: { n: "Leaves — dark green", c: "#2a5a2c", p: PT.grass, g: 0.05 }, deco_leaf_light: { n: "Leaves — light green", c: "#7fae45", p: PT.grass, g: 0.05 },
    deco_trunk: { n: "Tree trunk", c: "#6b4a2f", p: PT.wood, s: 0.3, g: 0.05 }, deco_flower_red: { n: "Flowers — red", c: "#d2382f", p: PT.plain, g: 0.1 }, deco_flower_yellow: { n: "Flowers — yellow", c: "#f0c419", p: PT.plain, g: 0.1 },
    deco_flower_pink: { n: "Flowers — pink", c: "#e58aa8", p: PT.plain, g: 0.1 }, deco_flower_white: { n: "Flowers — white", c: "#f6f4ee", p: PT.plain, g: 0.1 }, deco_flower_purple: { n: "Flowers — purple (bougainvillea)", c: "#a23b8f", p: PT.plain, g: 0.1 },
    deco_asphalt: { n: "Road — asphalt", c: "#3b3d40", p: PT.concrete, g: 0.05 }, deco_roadpaint: { n: "Road marking — white", c: "#f4f4f0", p: PT.plain, g: 0.15 }, deco_roadpaint_y: { n: "Road marking — yellow", c: "#e9c21c", p: PT.plain, g: 0.15 },
    deco_footpath: { n: "Footpath pavers", c: "#b9aea0", p: PT.paver, s: 0.2, g: 0.05 }, deco_kerb: { n: "Kerb stone", c: "#c9c9c4", p: PT.concrete, g: 0.05 }, deco_water: { n: "Pond water", c: "#4f93b8", p: PT.plain, g: 0.9 },
    deco_rock: { n: "Garden rock", c: "#8a8780", p: PT.stone, s: 0.4, g: 0.05 }, deco_lawn: { n: "Lawn", c: "#5c9a45", p: PT.grass, g: 0.03 }, deco_soil: { n: "Planting soil", c: "#5b4433", p: PT.soil, g: 0.02 },
    deco_canvas: { n: "Umbrella canvas", c: "#e8dfc8", p: PT.plain, g: 0.05 }
  });
  Object.assign(B.CAT_FILL, (function () { var o = {}; o[DE] = "rgba(110,170,90,.12)"; return o; })());
  B.CAT_LAY = Object.assign(B.CAT_LAY || {}, (function () { var o = {}; o[DE] = "A-DECO"; return o; })());

  /* ----- extra part types for organic / vehicle shapes (on top of b, c, s, e, p of the common builder) -----
     ["x", [[x, z]…], y0, y1, look]              side profile extruded across the width (car bodies, bus, seats)
     ["w", x, y, r, width, tyre, rim]             wheel: axis across the width, standing on the ground
     ["g", x, y, z, rx, rz, look, seed, rough]    leaf / body blob: ellipsoid with a slightly irregular surface
     ["k", x0, y0, z0, x1, y1, z1, r0, r1, look]  limb / branch / tube between two points
     ["q", [[x, y, z] ×4], look]                  thin two-sided blade (palm leaflets, flags)                                  */
  var K = 0.001, TAU = Math.PI * 2;
  function hash(a, b, c) { var h = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return h - Math.floor(h); }
  function xmesh(parts) {
    return function (M, X, z0, LK, H) {
      var s = X.s, P3 = function (x, y, z) { var w = X([x, y]); return [w[0] * K, w[1] * K, (z0 + z * s) * K]; }, std = [];
      parts.forEach(function (q) {
        var t = q[0], col, i, j;
        if (t === "x") {
          var pr = q[1], y0 = q[2], y1 = q[3], ar = 0; col = LK(q[4]);
          for (i = 0; i < pr.length; i++) { var a = pr[i], b = pr[(i + 1) % pr.length]; ar += a[0] * b[1] - b[0] * a[1]; }
          if (ar < 0) pr = pr.slice().reverse();
          for (i = 0; i < pr.length; i++) { var p = pr[i], n = pr[(i + 1) % pr.length]; M.quad(P3(p[0], y1, p[1]), P3(n[0], y1, n[1]), P3(n[0], y0, n[1]), P3(p[0], y0, p[1]), col); }
          var ec = EP.earcut(pr, []); ec.tris.forEach(function (tr) { var A0 = ec.pts[tr[0]], B0 = ec.pts[tr[1]], C0 = ec.pts[tr[2]]; M.tri(P3(A0[0], y0, A0[1]), P3(B0[0], y0, B0[1]), P3(C0[0], y0, C0[1]), col); M.tri(P3(A0[0], y1, A0[1]), P3(C0[0], y1, C0[1]), P3(B0[0], y1, B0[1]), col); });
        } else if (t === "w") {
          var wx = q[1], wy = q[2], r = q[3], ww = q[4], N = 16, tyre = LK(q[5]), rim = LK(q[6] || "steel_ss");
          var ring = function (rr, hw, c2, capOnly) { for (var k2 = 0; k2 < N; k2++) { var a0 = k2 / N * TAU, a1 = (k2 + 1) / N * TAU, x0 = wx + rr * Math.cos(a0), zz0 = r + rr * Math.sin(a0), x1 = wx + rr * Math.cos(a1), zz1 = r + rr * Math.sin(a1);
            if (!capOnly) M.quad(P3(x0, wy + hw, zz0), P3(x1, wy + hw, zz1), P3(x1, wy - hw, zz1), P3(x0, wy - hw, zz0), c2);
            M.tri(P3(wx, wy - hw, r), P3(x0, wy - hw, zz0), P3(x1, wy - hw, zz1), c2); M.tri(P3(wx, wy + hw, r), P3(x1, wy + hw, zz1), P3(x0, wy + hw, zz0), c2); } };
          ring(r, ww / 2, tyre); ring(r * 0.58, ww / 2 + 6, rim, true); ring(r * 0.16, ww / 2 + 12, tyre, true);
        } else if (t === "g") {
          var gx = q[1], gy = q[2], gz = q[3], rx = q[4], rz = q[5], sd = q[7] || 1, ro = q[8] == null ? 0.22 : q[8], NL = 8, NA = 12; col = LK(q[6]);
          var R = function (li, ai) { return li === 0 || li === NL ? 1 : 1 + ro * (hash(li, ai % NA, sd) - 0.5) * 2; };
          var G3 = function (li, ai) { var tt = -Math.PI / 2 + li / NL * Math.PI, aa = ai / NA * TAU, k3 = R(li, ai); return P3(gx + rx * k3 * Math.cos(tt) * Math.cos(aa), gy + rx * k3 * Math.cos(tt) * Math.sin(aa), gz + rz * k3 * Math.sin(tt)); };
          for (i = 0; i < NL; i++) for (j = 0; j < NA; j++) M.quad(G3(i, j), G3(i, j + 1), G3(i + 1, j + 1), G3(i + 1, j), col);
        } else if (t === "k") {
          var a3 = [q[1], q[2], q[3]], b3 = [q[4], q[5], q[6]], r0 = q[7], r1 = q[8], d = [b3[0] - a3[0], b3[1] - a3[1], b3[2] - a3[2]], dl = Math.hypot(d[0], d[1], d[2]) || 1; col = LK(q[9]); d = [d[0] / dl, d[1] / dl, d[2] / dl];
          var ref = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], u = [d[1] * ref[2] - d[2] * ref[1], d[2] * ref[0] - d[0] * ref[2], d[0] * ref[1] - d[1] * ref[0]], ul = Math.hypot(u[0], u[1], u[2]); u = [u[0] / ul, u[1] / ul, u[2] / ul];
          var v = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];   // u × v = d needs v = d × u
          var NK = 8, pt = function (c, rr, ai) { var aa = ai / NK * TAU, cs = Math.cos(aa) * rr, sn = Math.sin(aa) * rr; return P3(c[0] + u[0] * cs + v[0] * sn, c[1] + u[1] * cs + v[1] * sn, c[2] + u[2] * cs + v[2] * sn); };
          for (i = 0; i < NK; i++) { M.quad(pt(a3, r0, i), pt(a3, r0, i + 1), pt(b3, r1, i + 1), pt(b3, r1, i), col); if (r1 > 1) M.tri(P3(b3[0], b3[1], b3[2]), pt(b3, r1, i), pt(b3, r1, i + 1), col); M.tri(P3(a3[0], a3[1], a3[2]), pt(a3, r0, i + 1), pt(a3, r0, i), col); }
        } else if (t === "q") {
          var Q = q[1].map(function (c) { return P3(c[0], c[1], c[2]); }); col = LK(q[2]); M.quad(Q[0], Q[1], Q[2], Q[3], col); M.quad(Q[3], Q[2], Q[1], Q[0], col);
        } else std.push(q);
      });
      if (std.length) stdMesh(std)(M, X, z0, LK, H);
    };
  }
  /* the common builder's mesh for the standard part types: made once per item through a throw-away definition */
  function stdMesh(parts) { mk("__tmp", "", DE, 1, 1, 1, "deco", { nb: 1 }, [], parts); var f = A.__tmp.mesh; delete A.__tmp; return f; }

  /* ----- builders (mm) ----- */
  function person(top, bottom, h, sit, hair) {
    var k = h / 1700, o = [], hr = hair || "deco_hair", S = function (v) { return v * k; };
    if (sit) {
      o.push(["k", S(-90), S(60), S(520), S(-90), S(430), S(540), S(80), S(68), bottom], ["k", S(90), S(60), S(520), S(90), S(430), S(540), S(80), S(68), bottom],
        ["k", S(-90), S(430), S(540), S(-90), S(440), S(60), S(62), S(48), bottom], ["k", S(90), S(430), S(540), S(90), S(440), S(60), S(62), S(48), bottom],
        ["b", S(-90), S(500), S(100), S(230), 0, S(70), "deco_tyre"], ["b", S(90), S(500), S(100), S(230), 0, S(70), "deco_tyre"],
        ["g", 0, S(20), S(820), S(185), S(330), top, 3, 0.05], ["k", S(-215), S(20), S(1050), S(-200), S(260), S(700), S(52), S(42), top], ["k", S(215), S(20), S(1050), S(200), S(260), S(700), S(52), S(42), top],
        ["k", 0, S(20), S(1120), 0, S(20), S(1200), S(48), S(48), "deco_skin"], ["g", 0, S(30), S(1310), S(105), S(125), "deco_skin", 5, 0.03], ["g", 0, S(5), S(1345), S(112), S(105), hr, 6, 0.05]);
      return o;
    }
    o.push(["b", S(-90), S(40), S(100), S(250), 0, S(70), "deco_tyre"], ["b", S(90), S(40), S(100), S(250), 0, S(70), "deco_tyre"],
      ["k", S(-90), 0, S(60), S(-95), 0, S(860), S(52), S(82), bottom], ["k", S(90), 0, S(60), S(95), 0, S(860), S(52), S(82), bottom],
      ["g", 0, 0, S(930), S(175), S(130), bottom, 2, 0.04], ["g", 0, 0, S(1180), S(190), S(300), top, 3, 0.05],
      ["k", S(-205), 0, S(1400), S(-250), S(30), S(1100), S(55), S(46), top], ["k", S(-250), S(30), S(1100), S(-235), S(90), S(830), S(44), S(36), "deco_skin"],
      ["k", S(205), 0, S(1400), S(250), S(30), S(1100), S(55), S(46), top], ["k", S(250), S(30), S(1100), S(235), S(90), S(830), S(44), S(36), "deco_skin"],
      ["k", 0, 0, S(1440), 0, 0, S(1510), S(50), S(48), "deco_skin"], ["g", 0, S(8), S(1610), S(100), S(122), "deco_skin", 5, 0.03], ["g", 0, S(-14), S(1650), S(108), S(100), hr, 6, 0.05]);
    return o;
  }
  /* car: side profiles extruded across the width. kind: hatch | sedan | suv | pickup */
  function car(L, W, H, paint, kind) {
    var h2 = L / 2, hw = W / 2, hood = kind === "suv" || kind === "pickup" ? H * 0.58 : H * 0.56, belt = hood + 60, zb = 200, wr = kind === "suv" || kind === "pickup" ? 360 : 320;
    var xw = L * 0.20, xrf = L * 0.03, xrr = kind === "sedan" ? -L * 0.20 : kind === "pickup" ? -L * 0.04 : -L * 0.34, xrb = kind === "sedan" ? -L * 0.33 : kind === "pickup" ? -L * 0.08 : -L * 0.45, o = [];
    var tail = kind === "sedan" ? belt - 30 : belt;
    var body = [[-h2 + 60, zb], [h2 - 90, zb], [h2 - 10, zb + 110], [h2, hood - 170], [h2 - 60, hood - 60], [xw + 150, hood], [xw, belt], [xrb, belt], [-h2 + 40, tail], [-h2, tail - 120], [-h2 + 10, zb + 110]];
    if (kind === "pickup") { body = [[-h2 + 60, zb], [h2 - 90, zb], [h2 - 10, zb + 110], [h2, hood - 170], [h2 - 60, hood - 60], [xw + 150, hood], [xw, belt], [xrb, belt], [xrb, belt - 380], [-h2 + 20, belt - 380], [-h2, zb + 110]];
      o.push(["x", [[xrb, belt - 380], [xrb, belt], [-h2 + 20, belt], [-h2 + 20, belt - 380]], hw - 70, hw, paint], ["x", [[xrb, belt - 380], [xrb, belt], [-h2 + 20, belt], [-h2 + 20, belt - 380]], -hw, -hw + 70, paint], ["x", [[-h2, belt - 380], [-h2 + 70, belt - 380], [-h2 + 70, belt], [-h2, belt]], -hw, hw, paint]); }
    o.push(["x", body, -hw, hw, paint]);
    var gh = [[xw - 10, belt], [xrf, H - 55], [xrr, H - 55], [xrb + 10, belt]];
    o.push(["x", gh, -hw * 0.9, hw * 0.9, "deco_carglass"], ["x", [[xrf - 60, H - 60], [xrf + 30, H], [xrr - 30, H], [xrr + 60, H - 60]], -hw * 0.9 - 8, hw * 0.9 + 8, paint]);
    /* pillars */
    [[xw - 10, xrf, 70], [xrb + 10, xrr, 80], [(xrf + xrr) / 2 - 30, (xrf + xrr) / 2 - 30, 70]].forEach(function (pl) { [-1, 1].forEach(function (sd) { o.push(["x", [[pl[0], belt], [pl[0] + pl[2], belt], [pl[1] + pl[2] * 0.8, H - 55], [pl[1], H - 55]], sd > 0 ? hw * 0.9 - 4 : -hw * 0.9 - 14, sd > 0 ? hw * 0.9 + 14 : -hw * 0.9 + 4, paint]); }); });
    /* wheels, arches, bumpers, lights, mirrors, plates */
    [L * 0.31, -L * 0.30].forEach(function (x) { [-1, 1].forEach(function (sd) { o.push(["w", x, sd * (hw - 105), wr, 210, "deco_tyre", "steel_ss"]); }); });
    o.push(["b", h2 - 20, 0, 90, W - 60, zb + 20, zb + 190, "deco_tyre"], ["b", -h2 + 20, 0, 90, W - 60, zb + 20, zb + 190, "deco_tyre"],
      ["b", h2 - 40, hw - 260, 60, 330, hood - 240, hood - 120, "led_warm"], ["b", h2 - 40, -hw + 260, 60, 330, hood - 240, hood - 120, "led_warm"], ["b", h2 - 15, 0, 40, W * 0.42, hood - 260, hood - 120, "deco_tyre"],
      ["b", -h2 + 30, hw - 240, 60, 300, tail - 250, tail - 130, "deco_flower_red"], ["b", -h2 + 30, -hw + 240, 60, 300, tail - 250, tail - 130, "deco_flower_red"],
      ["b", h2 + 2, 0, 16, 480, zb + 210, zb + 330, "deco_cloth_white"], ["b", -h2 - 2, 0, 16, 480, zb + 250, zb + 370, "deco_cloth_white"],
      ["b", xw - 120, hw + 70, 130, 150, belt - 20, belt + 90, paint], ["b", xw - 120, -hw - 70, 130, 150, belt - 20, belt + 90, paint],
      ["b", (xw + xrb) / 2, hw + 2, 90, 14, belt - 170, belt - 130, "steel_ss"], ["b", (xw + xrb) / 2, -hw - 2, 90, 14, belt - 170, belt - 130, "steel_ss"]);
    return o;
  }
  /* leafy tree: tapered trunk, branches, crown of irregular leaf clusters */
  function tree(o) {
    var H = o.h, R = o.r, fork = o.fork || H * 0.4, tr = o.tr || R * 0.085, sd = o.seed || 1, lk = o.leaf || ["deco_leaf", "deco_leaf_dark", "deco_leaf_light"], P = [], n = o.n || 6;
    P.push(["k", 0, 0, 0, 0, 0, fork * 0.25, tr * 1.5, tr * 1.05, "deco_trunk"], ["k", 0, 0, fork * 0.25, tr * 0.3, tr * 0.2, fork, tr * 1.05, tr * 0.8, "deco_trunk"]);
    var cz = fork + (H - fork) * 0.5, ch = (H - fork) * 0.5;
    for (var i = 0; i < n; i++) {
      var a = i / n * TAU + hash(i, sd, 1) * 0.8, rr = R * (0.45 + 0.25 * hash(i, sd, 2)), bz = fork + (H - fork) * (0.25 + 0.3 * hash(i, sd, 3)), bx = Math.cos(a) * rr, by = Math.sin(a) * rr;
      P.push(["k", tr * 0.3, tr * 0.2, fork * 0.92, bx, by, bz, tr * 0.5, tr * 0.2, "deco_trunk"]);
      P.push(["g", bx * 1.15, by * 1.15, bz + ch * 0.25, R * (0.42 + 0.14 * hash(i, sd, 4)), ch * (0.55 + 0.2 * hash(i, sd, 5)) * (o.flat || 1), lk[i % lk.length], sd * 10 + i, 0.3]);
    }
    P.push(["k", tr * 0.3, tr * 0.2, fork * 0.9, 0, 0, cz + ch * 0.2, tr * 0.6, tr * 0.2, "deco_trunk"], ["g", 0, 0, cz + ch * 0.35, R * 0.55, ch * 0.7 * (o.flat || 1), lk[0], sd * 10 + 9, 0.3], ["g", R * 0.1, -R * 0.08, cz - ch * 0.1, R * 0.62, ch * 0.5 * (o.flat || 1), lk[1 % lk.length], sd * 10 + 8, 0.3]);
    if (o.flower) for (var f = 0; f < 22; f++) { var fa = hash(f, sd, 7) * TAU, fr = R * (0.2 + 0.75 * Math.sqrt(hash(f, sd, 8))); P.push(["g", Math.cos(fa) * fr, Math.sin(fa) * fr, cz + ch * (0.45 + 0.5 * hash(f, sd, 9)) * (o.flat || 1), R * 0.13, R * 0.09, o.flower[f % o.flower.length], f + 3, 0.35]); }
    return P;
  }
  function palm(H, sd) {
    var P = [], n = 6, lean = 260, top = [lean, lean * 0.3, H]; for (var i = 0; i < n; i++) { var t0 = i / n, t1 = (i + 1) / n; P.push(["k", lean * t0 * t0, lean * 0.3 * t0 * t0, H * t0, lean * t1 * t1, lean * 0.3 * t1 * t1, H * t1, 190 - 70 * t0, 190 - 70 * t1, "deco_trunk"]); }
    P.push(["g", top[0], top[1], H + 60, 260, 200, "deco_trunk", 2, 0.1]);
    for (var f = 0; f < 11; f++) { var a = f / 11 * TAU + 0.2, c = Math.cos(a), s = Math.sin(a), len = 2300 + 500 * hash(f, sd, 1), up = 350 + 300 * hash(f, sd, 2), prev = [top[0], top[1], H + 80];
      for (var g = 1; g <= 4; g++) { var u = g / 4, pt = [top[0] + c * len * u, top[1] + s * len * u, H + 80 + up * Math.sin(u * 2.2) - 1200 * u * u], w0 = 330 * (1.15 - (g - 1) / 4), w1 = 330 * (1.15 - u);
        P.push(["k", prev[0], prev[1], prev[2], pt[0], pt[1], pt[2], 30, 16, "deco_leaf_dark"], ["q", [[prev[0] - s * w0, prev[1] + c * w0, prev[2] - 60], [prev[0] + s * w0, prev[1] - c * w0, prev[2] - 60], [pt[0] + s * w1, pt[1] - c * w1, pt[2] - 60], [pt[0] - s * w1, pt[1] + c * w1, pt[2] - 60]], f % 2 ? "deco_leaf" : "deco_leaf_dark"]); prev = pt; } }
    return P;
  }
  function bush(r, h, sd, lk, fl) { var P = []; for (var i = 0; i < 5; i++) { var a = i / 5 * TAU + sd; P.push(["g", Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, h * 0.42, r * 0.55, h * 0.42, lk[i % lk.length], sd * 7 + i, 0.3]); } P.push(["g", 0, 0, h * 0.62, r * 0.55, h * 0.38, lk[0], sd * 7 + 6, 0.3]); if (fl) for (var f = 0; f < 16; f++) { var fa = hash(f, sd, 3) * TAU, fr = r * 0.85 * Math.sqrt(hash(f, sd, 4)); P.push(["g", Math.cos(fa) * fr, Math.sin(fa) * fr, h * (0.55 + 0.4 * hash(f, sd, 5)), 75, 60, fl[f % fl.length], f, 0.3]); } return P; }
  function flowers(w, d, z, looks, n) { var o = []; for (var i = 0; i < n; i++) { var u = hash(i, 3, 1) - 0.5, v = hash(i, 5, 2) - 0.5; o.push(["g", u * w * 0.9, v * d * 0.9, z, 85, 70, looks[i % looks.length], i + 1, 0.3]); } return o; }
  var D = { deco: true }, DN = { nb: 1, deco: true };
  function dk(id, n, w, d, h, o, sy, pt) { var plain = pt.filter(function (q) { return "bcsep".indexOf(q[0]) >= 0; }); mk(id, n, DE, w, d, h, "deco", o, sy, plain.length === pt.length ? pt : []); A[id].deco = true; if (plain.length !== pt.length) A[id].mesh = xmesh(pt); }

  /* ----- people ----- */
  var psy = [["c", 0, 0, 220], ["l", 0, 0, 0, 260]];
  dk("deco_man", "Person — man standing", 550, 300, 1750, DN, psy, person("deco_cloth_blue", "deco_cloth_grey", 1750));
  dk("deco_woman", "Person — woman standing (saree colours)", 520, 300, 1620, DN, psy, person("deco_cloth_red", "deco_cloth_red", 1620).concat([["k", 0, -60, 1560, 0, -90, 1150, 60, 30, "deco_hair"], ["g", 0, 0, 480, 190, 480, "deco_cloth_red", 4, 0.05]]));
  dk("deco_man_2", "Person — man in white shirt", 550, 300, 1700, DN, psy, person("deco_cloth_white", "deco_cloth_blue", 1700));
  dk("deco_worker", "Person — site worker (yellow vest, helmet)", 550, 300, 1700, DN, psy, person("deco_cloth_yellow", "deco_cloth_grey", 1700, false, "deco_cloth_yellow").concat([["c", 0, 10, 135, 1645, 1660, "deco_cloth_yellow"]]));
  dk("deco_child", "Person — child", 400, 250, 1150, DN, [["c", 0, 0, 160]], person("deco_cloth_green", "deco_cloth_blue", 1150));
  dk("deco_person_sitting", "Person — sitting (place on a chair or bench)", 450, 600, 1300, DN, [["c", 0, 0, 200]], person("deco_cloth_white", "deco_cloth_grey", 1700, true));
  dk("deco_couple", "People — two standing together", 1300, 400, 1750, DN, [["c", -330, 0, 220], ["c", 330, 0, 210]], (function () { var sh = function (arr, dx) { return arr.map(function (q) { var c = q.slice(); if (c[0] === "k") { c[1] += dx; c[4] += dx; } else c[1] += dx; return c; }); }; return sh(person("deco_cloth_blue", "deco_cloth_grey", 1750), -330).concat(sh(person("deco_cloth_yellow", "deco_cloth_red", 1620), 330)); })());

  /* ----- vehicles ----- */
  var carSym = function (L, W) { return [["r", 0, 0, L, W], ["r", -L * 0.08, 0, L * 0.5, W * 0.85], ["l", L / 2, -W * 0.3, L / 2, W * 0.3], ["l", L * 0.2, -W * 0.42, L * 0.2, W * 0.42]]; };
  dk("deco_car_hatch", "Car — hatchback, red", 3800, 1700, 1500, DN, carSym(3800, 1700), car(3800, 1700, 1500, "deco_car_red", "hatch"));
  dk("deco_car_sedan", "Car — sedan, white", 4500, 1780, 1450, DN, carSym(4500, 1780), car(4500, 1780, 1450, "deco_car_white", "sedan"));
  dk("deco_car_sedan_black", "Car — sedan, black", 4600, 1800, 1450, DN, carSym(4600, 1800), car(4600, 1800, 1450, "deco_car_black", "sedan"));
  dk("deco_car_suv", "Car — SUV, silver", 4700, 1900, 1750, DN, carSym(4700, 1900), car(4700, 1900, 1750, "deco_car_silver", "suv"));
  dk("deco_car_suv_blue", "Car — SUV, blue", 4500, 1850, 1700, DN, carSym(4500, 1850), car(4500, 1850, 1700, "deco_car_blue", "suv"));
  dk("deco_pickup", "Pickup truck, white", 5200, 1850, 1800, DN, carSym(5200, 1850), car(5200, 1850, 1800, "deco_car_white", "pickup"));
  dk("deco_scooter", "Scooter", 1850, 700, 1150, DN, [["r", 0, 0, 1800, 350], ["l", 620, -330, 620, 330]], [["w", 640, 0, 230, 110, "deco_tyre", "steel_ss"], ["w", -620, 0, 230, 110, "deco_tyre", "steel_ss"],
    ["x", [[-900, 380], [-150, 300], [250, 300], [420, 520], [330, 560], [-100, 420], [-250, 700], [-850, 720]], -160, 160, "deco_car_red"], ["x", [[-820, 720], [-230, 700], [-200, 790], [-800, 800]], -150, 150, "deco_tyre"],
    ["x", [[380, 300], [560, 300], [520, 900], [400, 900]], -170, 170, "deco_car_red"], ["k", 470, 0, 880, 400, 0, 1080, 26, 22, "deco_tyre"], ["k", 400, -300, 1080, 400, 300, 1080, 20, 20, "deco_tyre"], ["g", 520, 0, 930, 90, 80, "led_warm", 2, 0.02], ["x", [[560, 250], [760, 380], [700, 480], [520, 420]], -90, 90, "deco_car_red"]]);
  dk("deco_bicycle", "Bicycle", 1750, 600, 1050, DN, [["l", -850, 0, 850, 0], ["l", 550, -280, 550, 280]], [["w", 560, 0, 330, 34, "deco_tyre", "deco_tyre"], ["w", -560, 0, 330, 34, "deco_tyre", "deco_tyre"],
    ["k", -560, 0, 330, -180, 0, 820, 17, 17, "deco_car_blue"], ["k", -180, 0, 820, 420, 0, 860, 17, 17, "deco_car_blue"], ["k", -90, 0, 330, 420, 0, 860, 19, 19, "deco_car_blue"], ["k", -90, 0, 330, -180, 0, 820, 17, 17, "deco_car_blue"], ["k", -560, 0, 330, -90, 0, 330, 14, 14, "deco_car_blue"],
    ["k", 560, 0, 330, 420, 0, 860, 15, 15, "deco_car_blue"], ["k", 420, 0, 860, 380, 0, 1010, 15, 15, "deco_tyre"], ["k", 380, -260, 1010, 380, 260, 1010, 14, 14, "deco_tyre"], ["k", -180, 0, 820, -210, 0, 930, 14, 14, "deco_tyre"], ["g", -230, 0, 950, 130, 35, "deco_tyre", 2, 0.02], ["g", -90, 0, 330, 90, 90, "steel_ss", 3, 0.02]]);
  dk("deco_auto", "Auto-rickshaw", 2700, 1350, 1750, DN, [["r", 0, 0, 2650, 1300], ["l", 1325, -300, 1325, 300]], [["w", 1000, 0, 210, 130, "deco_tyre", "steel_ss"], ["w", -850, 540, 210, 130, "deco_tyre", "steel_ss"], ["w", -850, -540, 210, 130, "deco_tyre", "steel_ss"],
    ["x", [[-1300, 260], [1150, 260], [1320, 420], [1250, 900], [700, 950], [-1300, 950]], -650, 650, "deco_car_yellow"], ["x", [[1250, 900], [1050, 1560], [980, 1560], [700, 950]], -600, 600, "deco_carglass"],
    ["x", [[-1320, 1500], [1100, 1560], [1000, 1720], [-1250, 1700]], -660, 660, "deco_cloth_grey"], ["x", [[-1300, 950], [-1250, 950], [-1250, 1520], [-1320, 1500]], -650, 650, "deco_cloth_grey"],
    ["k", 0, 640, 950, 0, 640, 1540, 22, 22, "deco_tyre"], ["k", 0, -640, 950, 0, -640, 1540, 22, 22, "deco_tyre"], ["g", 1300, 0, 700, 90, 80, "led_warm", 2, 0.02], ["x", [[-1100, 950], [-500, 950], [-500, 1000], [-1100, 1000]], -600, 600, "deco_cloth_green"]]);
  dk("deco_bus", "Bus (12 m)", 12000, 2550, 3200, DN, [["r", 0, 0, 12000, 2550], ["l", 6000, -900, 6000, 900]], (function () { var o = []; [3900, -3400].forEach(function (x) { [-1, 1].forEach(function (sd) { o.push(["w", x, sd * 1130, 490, 290, "deco_tyre", "steel_ss"]); }); });
    o.push(["x", [[-6000, 380], [5850, 380], [6000, 600], [6000, 1500], [-6000, 1500]], -1275, 1275, "deco_car_white"], ["x", [[-6000, 1500], [6000, 1500], [5880, 2600], [-5950, 2600]], -1262, 1262, "deco_carglass"], ["x", [[-5960, 2600], [5880, 2600], [5700, 3150], [-5850, 3150]], -1275, 1275, "deco_car_white"], ["x", [[-6000, 1050], [6000, 1050], [6000, 1300], [-6000, 1300]], -1282, 1282, "deco_car_blue"]);
    for (var x = -5000; x <= 5000; x += 1250) o.push(["b", x, 1268, 110, 20, 1500, 2600, "deco_car_white"], ["b", x, -1268, 110, 20, 1500, 2600, "deco_car_white"]);
    o.push(["b", 5990, 800, 40, 400, 700, 900, "led_warm"], ["b", 5990, -800, 40, 400, 700, 900, "led_warm"], ["b", -5990, 900, 40, 300, 900, 1200, "deco_flower_red"], ["b", -5990, -900, 40, 300, 900, 1200, "deco_flower_red"]); return o; })());

  /* ----- trees and plants ----- */
  var treeSym = function (r) { var o = [["c", 0, 0, r], ["c", 0, 0, r * 0.1]]; for (var i = 0; i < 6; i++) { var a = i / 6 * TAU + 0.3; o.push(["l", Math.cos(a) * r * 0.15, Math.sin(a) * r * 0.15, Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8]); } return o; };
  dk("deco_tree_round", "Tree — round canopy (neem / mango), 8 m", 6500, 6500, 8000, DN, treeSym(3250), tree({ h: 8000, r: 3250, seed: 2, n: 7 }));
  dk("deco_tree_small", "Tree — small ornamental, 4 m", 3000, 3000, 4200, DN, treeSym(1500), tree({ h: 4200, r: 1500, seed: 5, n: 5, leaf: ["deco_leaf_light", "deco_leaf"] }));
  dk("deco_tree_gulmohar", "Tree — flowering (gulmohar), 7 m", 8000, 8000, 7000, DN, treeSym(4000), tree({ h: 7000, r: 4000, seed: 7, n: 7, fork: 2600, flat: 0.6, flower: ["deco_flower_red", "deco_flower_red", "deco_flower_yellow"] }));
  dk("deco_tree_champa", "Tree — flowering (champa / frangipani), 4 m", 3600, 3600, 4000, DN, treeSym(1800), tree({ h: 4000, r: 1800, seed: 11, n: 6, fork: 1500, flat: 0.7, leaf: ["deco_leaf_dark", "deco_leaf"], flower: ["deco_flower_white", "deco_flower_yellow", "deco_flower_white"] }));
  dk("deco_tree_palm", "Palm tree, 8 m", 5500, 5500, 8800, DN, treeSym(2750), palm(7600, 3));
  dk("deco_tree_palm_small", "Palm tree, 4.5 m", 4500, 4500, 5400, DN, treeSym(2250), palm(4300, 6));
  dk("deco_tree_ashoka", "Tree — tall narrow (Ashoka), 8 m", 1800, 1800, 8000, DN, treeSym(900), (function () { var P = [["k", 0, 0, 0, 0, 0, 1400, 110, 80, "deco_trunk"]]; for (var i = 0; i < 7; i++) { var u = i / 6; P.push(["g", (i % 2 ? 60 : -60), (i % 3 ? 40 : -50), 1500 + u * 5600, 820 - u * 520, 700, i % 2 ? "deco_leaf_dark" : "deco_leaf", 20 + i, 0.28]); } return P; })());
  dk("deco_tree_pine", "Tree — pine / Christmas tree, 6 m", 3000, 3000, 6200, DN, treeSym(1500), [["k", 0, 0, 0, 0, 0, 1500, 150, 110, "deco_trunk"], ["k", 0, 0, 1100, 0, 0, 2700, 1500, 620, "deco_leaf_dark"], ["k", 0, 0, 2300, 0, 0, 3900, 1250, 470, "deco_leaf"], ["k", 0, 0, 3500, 0, 0, 5000, 950, 300, "deco_leaf_dark"], ["k", 0, 0, 4600, 0, 0, 6200, 620, 10, "deco_leaf"]]);
  dk("deco_bamboo", "Bamboo cluster", 1800, 1800, 5500, DN, treeSym(900), (function () { var o = []; for (var i = 0; i < 11; i++) { var a = i * 2.4, r = 120 + (i % 4) * 150, x = Math.cos(a) * r, y = Math.sin(a) * r, hh = 4200 + (i % 5) * 300, lx = x * 1.9, ly = y * 1.9; o.push(["k", x, y, 0, (x + lx) / 2, (y + ly) / 2, hh * 0.6, 34, 28, "deco_leaf_light"], ["k", (x + lx) / 2, (y + ly) / 2, hh * 0.6, lx * 1.25, ly * 1.25, hh, 28, 14, "deco_leaf_light"], ["g", lx * 1.15, ly * 1.15, hh * 0.88, 360, 620, i % 2 ? "deco_leaf" : "deco_leaf_light", i + 2, 0.4]); } return o; })());
  dk("deco_bush_round", "Shrub — round bush", 1200, 1200, 1000, DN, [["c", 0, 0, 600]], bush(600, 1000, 1, ["deco_leaf", "deco_leaf_dark"]));
  dk("deco_bush_flower", "Shrub — flowering (bougainvillea)", 1500, 1500, 1300, DN, [["c", 0, 0, 750]], bush(750, 1300, 2, ["deco_leaf_dark", "deco_leaf"], ["deco_flower_purple", "deco_flower_pink"]));
  dk("deco_bush_hibiscus", "Shrub — flowering (hibiscus, red)", 1300, 1300, 1500, DN, [["c", 0, 0, 650]], bush(650, 1500, 3, ["deco_leaf", "deco_leaf_light"], ["deco_flower_red"]));
  dk("deco_hedge_3m", "Hedge strip 3 m × 0.6 m (clipped)", 3000, 600, 900, D, [], (function () { var o = [["b", 0, 0, 2960, 520, 0, 760, "deco_leaf_dark"]]; for (var i = 0; i < 7; i++) o.push(["g", -1290 + i * 430, (i % 2 ? 30 : -30), 760, 300, 150, i % 2 ? "deco_leaf" : "deco_leaf_dark", i + 4, 0.3]); return o; })());
  dk("deco_flower_bed", "Flower bed 3 × 1 m (mixed colours)", 3000, 1000, 350, D, [], [["b", 0, 0, 3000, 1000, 0, 120, "deco_soil"]].concat(flowers(3000, 1000, 210, ["deco_flower_red", "deco_flower_yellow", "deco_flower_pink", "deco_flower_white", "deco_leaf_light", "deco_leaf"], 60)));
  dk("deco_flower_bed_round", "Flower bed — round Ø2.4 m with centre plant", 2400, 2400, 1200, DN, [["c", 0, 0, 1200], ["c", 0, 0, 400]], [["c", 0, 0, 1200, 0, 150, "deco_kerb"], ["c", 0, 0, 1100, 150, 200, "deco_soil"]].concat(flowers(1900, 1900, 290, ["deco_flower_yellow", "deco_flower_red", "deco_flower_white", "deco_leaf_light"], 44), bush(420, 1000, 4, ["deco_leaf_dark", "deco_leaf"]).map(function (q) { q[3] += 150; return q; })));
  dk("deco_planter_pot", "Potted plant — large floor pot", 600, 600, 1500, DN, [["c", 0, 0, 300]], [["c", 0, 0, 200, 0, 550, "tile_terracotta", 290], ["k", 0, 0, 500, 20, 10, 1000, 26, 18, "deco_trunk"]].concat(bush(360, 700, 5, ["deco_leaf", "deco_leaf_light"]).map(function (q) { q[3] += 820; return q; })));
  dk("deco_planter_box", "Planter box 1.2 m with plants", 1200, 400, 900, D, [], [["b", 0, 0, 1200, 400, 0, 450, "concrete"], ["b", 0, 0, 1120, 320, 450, 470, "deco_soil"], ["g", -380, 0, 650, 230, 210, "deco_leaf", 2, 0.3], ["g", 0, 0, 700, 260, 240, "deco_leaf_light", 3, 0.3], ["g", 380, 0, 650, 230, 210, "deco_leaf", 4, 0.3]]);
  dk("deco_creeper_wall", "Green wall / creeper panel 2.4 × 2.4 m", 2400, 150, 2400, { deco: true, m: "wall", z: 300 }, [["l", -1200, 0, 1200, 0]], (function () { var o = [["b", 0, 30, 2400, 60, 0, 2400, "deco_leaf_dark"]]; for (var i = 0; i < 36; i++) o.push(["g", -1100 + (i % 6) * 440, -20, 200 + Math.floor(i / 6) * 400, 230, 210, i % 3 ? "deco_leaf" : "deco_leaf_light", i + 1, 0.35]); return o; })());

  /* ----- garden ----- */
  dk("deco_lawn_10", "Lawn patch 10 × 10 m (view only)", 10000, 10000, 40, D, [], [["b", 0, 0, 10000, 10000, 0, 40, "deco_lawn"]]);
  dk("deco_pond", "Garden pond 4 × 2.5 m with rock edge", 4000, 2500, 300, DN, [["e", 0, 0, 2000, 1250]], (function () { var o = [["e", 0, 0, 2000, 1250, 0, 60, "deco_rock"], ["e", 0, 0, 1750, 1000, 60, 75, "deco_water"]]; for (var i = 0; i < 12; i++) { var a = i / 12 * Math.PI * 2; o.push(["s", Math.cos(a) * 1900, Math.sin(a) * 1150, 200 + (i % 3) * 60, 90, "deco_rock", 0.6]); } return o; })());
  dk("deco_rocks", "Garden rocks — group of three", 1800, 1400, 700, DN, [["c", -300, 0, 500], ["c", 450, 200, 320]], [["s", -300, 0, 520, 230, "deco_rock", 0.65], ["s", 450, 200, 330, 150, "deco_rock", 0.6], ["s", 250, -420, 240, 110, "deco_rock", 0.6]]);
  dk("deco_stepping", "Stepping stones — 5 in a line", 3400, 600, 50, DN, [["r", -1400, 0, 500, 500], ["r", -700, 0, 500, 500], ["r", 0, 0, 500, 500], ["r", 700, 0, 500, 500], ["r", 1400, 0, 500, 500]], [-1400, -700, 0, 700, 1400].map(function (x, i) { return ["b", x, (i % 2 ? 60 : -60), 500, 500, 0, 50, "stone"]; }));
  dk("deco_umbrella_set", "Garden umbrella with table and 4 chairs", 3000, 3000, 2500, DN, [["c", 0, 0, 1500], ["c", 0, 0, 450]], (function () { var o = [["c", 0, 0, 30, 0, 2300, "steel"], ["c", 0, 0, 1500, 2050, 2450, "deco_canvas", 40], ["c", 0, 0, 450, 700, 740, "wood_teak"], ["c", 0, 0, 200, 0, 30, "steel"]]; [[900, 0], [-900, 0], [0, 900], [0, -900]].forEach(function (c) { o.push(["b", c[0], c[1], 450, 450, 400, 450, "wood_teak"], ["b", c[0] * 1.24, c[1] * 1.24, c[0] ? 50 : 450, c[0] ? 450 : 50, 450, 900, "wood_teak"], ["b", c[0], c[1], 380, 380, 0, 400, "steel"]); }); return o; })());
  dk("deco_swing_garden", "Garden swing (jhoola) 2-seater", 2200, 1400, 2100, DN, [["r", 0, 0, 2200, 1400]], [["c", -1000, -600, 35, 0, 2100, "steel_matt_black"], ["c", -1000, 600, 35, 0, 2100, "steel_matt_black"], ["c", 1000, -600, 35, 0, 2100, "steel_matt_black"], ["c", 1000, 600, 35, 0, 2100, "steel_matt_black"], ["b", 0, 0, 2200, 60, 2040, 2100, "steel_matt_black"], ["b", 0, 0, 1500, 550, 450, 520, "wood_teak"], ["b", 0, 250, 1500, 50, 520, 1000, "wood_teak"], ["b", -720, 0, 20, 20, 520, 2040, "steel"], ["b", 720, 0, 20, 20, 520, 2040, "steel"], ["b", 0, 0, 2400, 1500, 2100, 2150, "deco_canvas"]]);
  dk("deco_garden_light", "Garden light post 3 m (view only)", 300, 300, 3200, DN, [["c", 0, 0, 150]], [["c", 0, 0, 110, 0, 200, "steel_matt_black", 60], ["c", 0, 0, 45, 200, 2900, "steel_matt_black"], ["s", 0, 0, 170, 3050, "led_warm"]]);

  /* ----- road pieces (view only — a measured road is the ROAD command) ----- */
  dk("deco_road_20", "Road 20 m — two lanes with kerbs, footpaths and markings (11 m wide)", 20000, 11000, 200, D, [["l", -10000, 0, 10000, 0], ["l", -10000, 3500, 10000, 3500], ["l", -10000, -3500, 10000, -3500]], (function () { var o = [["b", 0, 0, 20000, 7000, 0, 30, "deco_asphalt"], ["b", 0, 3280, 20000, 120, 30, 34, "deco_roadpaint"], ["b", 0, -3280, 20000, 120, 30, 34, "deco_roadpaint"]]; for (var x = -9000; x <= 9000; x += 3000) o.push(["b", x, 0, 1800, 120, 30, 34, "deco_roadpaint"]);
    [-1, 1].forEach(function (sd) { o.push(["b", 0, sd * 3575, 20000, 150, 0, 180, "deco_kerb"], ["b", 0, sd * 4575, 20000, 1850, 0, 150, "deco_footpath"]); for (var k = -9500; k <= 9500; k += 1000) o.push(["b", k, sd * 3575, 500, 152, 60, 182, (k / 1000) % 2 ? "deco_roadpaint_y" : "deco_tyre"]); }); return o; })());
  dk("deco_road_plain_20", "Road 20 × 7 m — carriageway only, with markings", 20000, 7000, 30, D, [["l", -10000, 0, 10000, 0]], (function () { var o = [["b", 0, 0, 20000, 7000, 0, 30, "deco_asphalt"], ["b", 0, 3350, 20000, 120, 30, 34, "deco_roadpaint"], ["b", 0, -3350, 20000, 120, 30, 34, "deco_roadpaint"]]; for (var x = -9000; x <= 9000; x += 3000) o.push(["b", x, 0, 1800, 120, 30, 34, "deco_roadpaint"]); return o; })());
  dk("deco_street_light", "Street light — double arm, 8 m (view only)", 3200, 400, 8200, DN, [["c", 0, 0, 150], ["l", -1500, 0, 1500, 0]], [["k", 0, 0, 0, 0, 0, 600, 130, 90, "steel"], ["k", 0, 0, 600, 0, 0, 7800, 90, 55, "steel"], ["k", 0, 0, 7700, 1400, 0, 8100, 40, 34, "steel"], ["k", 0, 0, 7700, -1400, 0, 8100, 40, 34, "steel"], ["b", 1500, 0, 520, 220, 8040, 8130, "steel"], ["b", -1500, 0, 520, 220, 8040, 8130, "steel"], ["b", 1500, 0, 440, 170, 8020, 8042, "led_warm"], ["b", -1500, 0, 440, 170, 8020, 8042, "led_warm"]]);
  dk("deco_sign_board", "Road sign on post (view only)", 700, 200, 2600, DN, [["c", 0, 0, 60]], [["k", 0, 0, 0, 0, 0, 2500, 38, 38, "steel"], ["c", 0, -40, 330, 1900, 1930, "deco_flower_red"], ["c", 0, -40, 250, 1930, 1934, "deco_cloth_white"]].map(function (q) { return q; }).concat([["x", [[-300, 1950], [300, 1950], [300, 2550], [-300, 2550]], -55, -35, "deco_car_blue"], ["x", [[-240, 2010], [240, 2010], [240, 2490], [-240, 2490]], -62, -54, "deco_cloth_white"]]).filter(function (q) { return q[0] !== "c"; }));
  dk("deco_road_junction", "Road junction 7 × 7 m (square, no markings)", 7000, 7000, 30, D, [], [["b", 0, 0, 7000, 7000, 0, 30, "deco_asphalt"]]);
  dk("deco_zebra", "Zebra crossing 7 × 3 m", 3000, 7000, 36, D, [], (function () { var o = []; for (var y = -3200; y <= 3200; y += 800) o.push(["b", 0, y, 3000, 400, 30, 36, "deco_roadpaint"]); return o; })());
  dk("deco_road_arrow", "Road arrow marking", 3000, 900, 36, DN, [["l", -1500, 0, 1500, 0]], [["b", -400, 0, 2200, 200, 30, 36, "deco_roadpaint"], ["p", [[700, -450], [1500, 0], [700, 450]], 30, 36, "deco_roadpaint"]]);
  dk("deco_footpath_10", "Footpath strip 10 × 1.8 m with kerb", 10000, 1800, 180, D, [], [["b", 0, 0, 10000, 1800, 0, 150, "deco_footpath"], ["b", 0, -850, 10000, 150, 0, 180, "deco_kerb"]]);
  dk("deco_driveway", "Driveway 6 × 3.5 m (pavers)", 6000, 3500, 40, D, [], [["b", 0, 0, 6000, 3500, 0, 40, "deco_footpath"]]);
  dk("deco_parking_lines", "Parking bay markings — 3 bays (7.5 × 5 m)", 7500, 5000, 36, D, [], [-3750, -1250, 1250, 3750].map(function (x) { return ["b", x, 0, 100, 5000, 30, 36, "deco_roadpaint"]; }).concat([["b", 0, 2450, 7600, 100, 30, 36, "deco_roadpaint"]]));
  dk("deco_divider", "Road divider with plants, 10 m", 10000, 1200, 900, D, [], [["b", 0, 0, 10000, 1200, 0, 250, "deco_kerb"], ["b", 0, 0, 9800, 1000, 250, 280, "deco_soil"]].concat((function () { var o = []; for (var x = -4400; x <= 4400; x += 1100) o.push(["s", x, 0, 380, 560, "deco_leaf_dark", 0.85]); return o; })()));
})();
