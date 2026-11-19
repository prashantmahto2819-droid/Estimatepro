/* Estimate Pro — Design Studio → 3D builders, batch 1b: boundary wall, wind / dust barrier, circular water tank, underground sump, brick tank,
   septic tank + soak pits, inspection chambers, recharge pits / trenches, oil & grease trap, fencing.
   Sizes come from the module's result (quantity rows and summary text) when it has been run, otherwise from the inputs.
   Ground level is z = 0; buried parts go below it. Plan x = along the structure, y = across; the model is centred on the origin. */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {}, T = DS.to3d = DS.to3d || { builders: {} };
  if (window.EP && EP.bim && EP.bim.LOOKS && !EP.bim.LOOKS.sand) { EP.bim.LOOKS.sand = { n: "Sand / filter media", c: "#d8c79a", p: EP.bim.PT.soil, g: 0.02 }; }

  /* ---------- small helpers ---------- */
  function fin(x) { return typeof x === "number" && isFinite(x); }
  function N(x, d, lo, hi) { x = +x; if (!fin(x)) x = d; if (lo != null && x < lo) x = lo; if (hi != null && x > hi) x = hi; return x; }
  function mm(x, d, lo, hi) { return N(+x * 1000, d, lo, hi); }
  function rowsOf(res, dre) { var q = (res && res.quantities) || []; for (var i = 0; i < q.length; i++) if (dre.test(q[i].description || "")) return q[i].rows || []; return []; }
  function rowOf(res, dre, rre) { var rs = rowsOf(res, dre); for (var i = 0; i < rs.length; i++) if (!rre || rre.test(rs[i].description || "")) return rs[i]; return null; }
  function sum(res, key) { var s = res && res.summary && res.summary[key]; return typeof s === "string" ? s : ""; }
  function nums(s) { var m = String(s || "").match(/-?\d+(?:\.\d+)?/g); return m ? m.map(Number) : []; }
  function rectPts(cx, cy, w, d) { return [[cx - w / 2, cy - d / 2], [cx + w / 2, cy - d / 2], [cx + w / 2, cy + d / 2], [cx - w / 2, cy + d / 2]]; }
  function shift(parts, dx, dy) {
    return parts.map(function (p) {
      var q = p.slice(), t = q[0];
      if (t === "b" || t === "c" || t === "t") { q[1] += dx; q[2] += dy; }
      else if (t === "p") { q[1] = q[1].map(function (a) { return [a[0] + dx, a[1] + dy]; }); if (q[5]) q[5] = q[5].map(function (h) { return h.map(function (a) { return [a[0] + dx, a[1] + dy]; }); }); }
      else if (t === "m") { q[1] = [q[1][0] + dx, q[1][1] + dy, q[1][2]]; q[2] = [q[2][0] + dx, q[2][1] + dy, q[2][2]]; }
      else if (t === "i") { q[1] = [q[1][0] + dx, q[1][1] + dy, q[1][2]]; q[2] = [q[2][0] + dx, q[2][1] + dy, q[2][2]]; }
      else if (t === "q") { for (var k = 1; k <= 4; k++) q[k] = [q[k][0] + dx, q[k][1] + dy, q[k][2]]; }
      return q;
    });
  }
  /* four wall boxes round an inside Lin × Bin rectangle (centred at cx, cy), thickness t, between z0 and z1 */
  function walls(H, cx, cy, Lin, Bin, t, z0, z1, look) {
    if (z1 - z0 < 1) return [];
    return [H.box(cx, cy - Bin / 2 - t / 2, Lin + 2 * t, t, z0, z1, look), H.box(cx, cy + Bin / 2 + t / 2, Lin + 2 * t, t, z0, z1, look),
      H.box(cx - Lin / 2 - t / 2, cy, t, Bin, z0, z1, look), H.box(cx + Lin / 2 + t / 2, cy, t, Bin, z0, z1, look)];
  }
  /* a pipe (square section) between two plan points at height z */
  function pipe(H, x0, y0, x1, y1, z, dia, look) { if (Math.hypot(x1 - x0, y1 - y0) < 5) return null; return H.member([x0, y0, z], [x1, y1, z], dia, dia, look || "upvc"); }
  function vpipe(H, x, y, z0, z1, r, look) { if (z1 - z0 < 1) return null; return H.cyl(x, y, r, z0, z1, look || "upvc"); }
  function clean(arr) { return arr.filter(function (p) { return p && p.length; }); }

  /* =================== boundary wall =================== */
  T.reg("boundary_wall", function (v, res, H) {
    var h = mm(v.height, 2100, 600, 6000), sp = mm(v.spacing, 3000, 1000, 8000), tw = /115/.test(String(v.wall_t)) ? 115 : 230;
    var pa = N(v.pillar_a, 230, 100, 800), pb = N(v.pillar_b, 230, 100, 800), bb = N(v.pb_b, 230, 100, 600), bD = N(v.pb_D, 300, 100, 800), df = mm(v.df, 1200, 300, 4000);
    var fr = rowOf(res, /pillar footings & pillars/i, /Footings/i), fL = fr && fr.length ? fr.length * 1000 : (N(v.ftg_L, 1.05, 0.5, 4) * 1000), fD = fr && fr.depth ? fr.depth * 1000 : N(v.ftg_D, 450, 200, 1500);
    fL = N(fL, 1050, 400, 4000); fD = N(fD, 450, 150, 1500);
    var total = N(v.length, 100, 3, 1e5) * 1000, nTot = Math.max(1, Math.round(total / sp)), nB = Math.min(nTot, 12), x0 = -nB * sp / 2;
    var cop = !/None/i.test(String(v.coping)), copT = cop ? 75 : 0, barbed = String(v.barbed || ""), y = 0, P = [];
    var plinthTop = 0, wallTop = h - copT, ftop = -df + fD;
    for (var i = 0; i <= nB; i++) {
      var x = x0 + i * sp;
      P.push(H.box(x, y, fL + 200, fL + 200, -df - 100, -df, "concrete"), H.box(x, y, fL, fL, -df, -df + fD, "concrete"), H.box(x, y, pa, pb, ftop, h, "concrete"));
      if (/Y-angles/i.test(barbed)) {
        var pl = 600; P.push(H.box(x, y, 50, 50, h, h + pl, "steel_member"));
        [-1, 1].forEach(function (s) { P.push(H.member([x, y, h + 300], [x, y + s * 260, h + pl + 20], 35, 35, "steel_member")); });
      } else if (/straight/i.test(barbed)) P.push(H.box(x, y, 50, 50, h, h + 450, "steel_member"));
    }
    for (var j = 0; j < nB; j++) {
      var cx = x0 + (j + 0.5) * sp, bay = sp - pa;
      P.push(H.box(cx, y, bay, bb, -bD, plinthTop, "concrete"));
      P.push(H.box(cx, y, bay, tw, plinthTop, wallTop, "brick"));
      if (cop) P.push(H.box(cx, y, sp, tw + 50, wallTop, h, "concrete"));
      var xa = x0 + j * sp, xb = xa + sp;
      if (/Y-angles/i.test(barbed)) { for (var k = 0; k < 4; k++) [-1, 1].forEach(function (s) { P.push(H.member([xa, y + s * (60 + 60 * k), h + 200 + 130 * k], [xb, y + s * (60 + 60 * k), h + 200 + 130 * k], 8, 8, "steel_member")); }); }
      else if (/straight/i.test(barbed)) { for (var k2 = 0; k2 < 4; k2++) P.push(H.member([xa, y, h + 90 + 110 * k2], [xb, y, h + 90 + 110 * k2], 8, 8, "steel_member")); }
    }
    return { name: "Boundary wall – " + (h / 1000).toFixed(2) + " m high, pillars @ " + (sp / 1000).toFixed(2) + " m" + (nB < nTot ? " (" + nB + " of " + nTot + " bays shown)" : ""), parts: clean(P) };
  });

  /* =================== wind / dust barrier =================== */
  T.reg("wind_barrier", function (v, res, H) {
    var h = mm(v.height, 8000, 2000, 30000), sp = mm(v.post_s, 4000, 1500, 12000), total = mm(v.length, 120000, 3000, 1e8), nTot = Math.max(2, Math.round(total / sp)), nB = Math.min(nTot, 12);
    var S = DS.sections && DS.sections.section, sps = sum(res, "Posts"), nm = String(sps).match(/IS(?:MB|HB) \d+/g) || [String(v.post_chk || "ISMB 300")];
    function sec(name, fb) { var s = null; try { s = S && S(name); } catch (e) { s = null; } return s && s.h ? s : fb; }
    var pI = sec(nm[0], { h: 400, b: 140, tf: 16, tw: 9 }), pE = sec(nm[1] || nm[0], pI);
    var gm = sum(res, "Girts").match(/(\d+) rows ISMC (\d+)/), nG = gm ? +gm[1] : 8, gSec = sec("ISMC " + (gm ? gm[2] : String(v.girt_chk || "ISMC 100").replace(/\D/g, "")), { h: 100, b: 50, tf: 7.5, tw: 4.7 });
    nG = N(nG, 8, 2, 20);
    var fI = rowOf(res, /RCC M\d+ in footings/i, /Intermediate footings/i), fE = rowOf(res, /RCC M\d+ in footings/i, /End-zone footings/i), pdI = rowOf(res, /RCC M\d+ in footings/i, /Intermediate pedestals/i), pdE = rowOf(res, /RCC M\d+ in footings/i, /End-zone pedestals/i);
    var fdep = mm(v.found_depth, 1500, 500, 5000), ped = mm(v.ped_above, 300, 100, 1500);
    var fSz = fI && fI.length ? fI.length * 1000 : 2400, fTh = fI && fI.depth ? fI.depth * 1000 : 400, fSzE = fE && fE.length ? fE.length * 1000 : fSz + 300, pSz = pdI && pdI.length ? pdI.length * 1000 : 650, pSzE = pdE && pdE.length ? pdE.length * 1000 : pSz + 50;
    fSz = N(fSz, 2400, 400, 6000); fTh = N(fTh, 400, 150, 1500); fSzE = N(fSzE, fSz, 400, 6000); pSz = N(pSz, 650, 200, 1500); pSzE = N(pSzE, pSz, 200, 1500);
    var nEnd = 2; try { var er = rowOf(res, /single sections/i, /end zone/i); if (er && er.nos) nEnd = Math.max(1, Math.min(Math.round(er.nos / 2), Math.floor(nB / 3) || 1)); } catch (e) { nEnd = 2; }
    var cl = String(v.cladding || ""), cLook = /Profiled/i.test(cl) ? "sheet_gi" : /HDPE/i.test(cl) ? "paint_green" : "aluminium", x0 = -nB * sp / 2, P = [], y = 0;
    var zPost0 = ped, zTop = h, fly = /Fly/i.test(String(v.fly || ""));
    for (var i = 0; i <= nB; i++) {
      var x = x0 + i * sp, end = i < nEnd || i > nB - nEnd, s = end ? pE : pI, fs = end ? fSzE : fSz, ps = end ? pSzE : pSz;
      P.push(H.box(x, y, fs + 200, fs + 200, -fdep - 100, -fdep, "concrete"), H.box(x, y, fs, fs, -fdep, -fdep + fTh, "concrete"), H.box(x, y, ps, ps, -fdep + fTh, ped, "concrete"));
      P.push(H.box(x, y, Math.max(s.b + 120, 250), Math.max(s.h + 120, 300), ped, ped + 20, "steel_member"));
      P.push(H.ibeam([x, y, ped + 20], [x, y, zTop], s.b, s.h, s.tf, s.tw, "steel_member"));
    }
    var yg = 0, off = pI.h / 2 + gSec.h / 2 + 5;
    for (var r = 0; r < nG; r++) {
      var z = ped + 400 + r * (h - ped - 600) / Math.max(1, nG - 1);
      for (var j = 0; j < nB; j++) {
        var xa = x0 + j * sp, xb = xa + sp;
        P.push(H.member([xa, y + off, z], [xb, y + off, z], gSec.h, gSec.b, "steel_member", 90));
        if (fly && r % 2 === 1) P.push(H.member([xa + sp / 2, y + off, z], [xa + sp / 2, y + pI.b * 0 + 0, z - 300], 20, 20, "steel_member"));
      }
    }
    for (var j2 = 0; j2 < nB; j2++) {
      var xa2 = x0 + j2 * sp + 40, xb2 = x0 + (j2 + 1) * sp - 40, yc = y + off + gSec.h / 2 + 10;
      P.push(H.quad([xa2, yc, ped + 100], [xb2, yc, ped + 100], [xb2, yc, zTop], [xa2, yc, zTop], cLook));
    }
    return { name: "Wind / dust barrier – " + (h / 1000).toFixed(1) + " m high, posts @ " + (sp / 1000).toFixed(1) + " m" + (nB < nTot ? " (" + nB + " of " + nTot + " bays shown)" : ""), parts: clean(P) };
  });

  /* =================== circular RCC water tank on ground =================== */
  T.reg("water_tank", function (v, res, H) {
    var Hw = mm(v.water_depth, 3500, 500, 20000), fb = mm(v.freeboard, 300, 100, 2000), D = 0;
    var sm = sum(res, "Size"), dm = sm.match(/Ø\s*([\d.]+)\s*m\s*×\s*([\d.]+)\s*m\s*\(water\s*([\d.]+)/);
    var Ht = Hw + fb;
    if (dm) { D = +dm[1] * 1000; Ht = +dm[2] * 1000; Hw = +dm[3] * 1000; }
    else if (/Diameter given/i.test(String(v.size_mode))) D = mm(v.D, 10000, 1000, 80000);
    else D = Math.sqrt(4 * N(v.capacity, 250, 1, 1e6) * 1e9 / (Math.PI * Hw));
    D = N(D, 10000, 1000, 80000); Ht = N(Ht, Hw + fb, 500, 25000);
    var wm = sum(res, "Wall").match(/(\d+)\s*mm/), tw = wm ? +wm[1] : (fin(+v.t) && +v.t > 0 ? +v.t * 1000 : 200); tw = N(tw, 200, 100, 1000);
    var br = rowOf(res, /RCC M\d+ in water tank/i, /Base slab/i), tb = br && br.depth ? br.depth * 1000 : 250; tb = N(tb, 250, 100, 1500);
    var Rin = D / 2, Rout = Rin + tw, Rb = Rout + 150, P = [];
    P.push(H.cyl(0, 0, Rb + 100, -tb - 100, -tb, "concrete"), H.cyl(0, 0, Rb, -tb, 0, "concrete"), H.tube(0, 0, Rout, Rin, 0, Ht, "concrete"));
    P.push(H.cyl(0, 0, Rin - 5, 0, Math.min(Hw, Ht), "water"));
    P.push(pipe(H, Rout, 0, Rout + 1500, 0, 400, 200, "steel_member"), pipe(H, -Rout - 1500, 0, -Rout, 0, Math.min(Hw, Ht) - 200, 150, "steel_member"));
    P.push(H.member([Rout + 20, 1200, 0], [Rout + 20, 1200, Ht + 900], 40, 40, "steel_member"), H.member([Rout + 20, 1500, 0], [Rout + 20, 1500, Ht + 900], 40, 40, "steel_member"));
    for (var k = 0; k < 4; k++) P.push(H.member([Rout + 20, 1200, 250 + k * (Ht + 500) / 3], [Rout + 20, 1500, 250 + k * (Ht + 500) / 3], 30, 30, "steel_member"));
    return { name: "Circular water tank Ø" + (D / 1000).toFixed(2) + " m × " + (Ht / 1000).toFixed(2) + " m (water " + (Hw / 1000).toFixed(1) + " m)", parts: clean(P) };
  });

  /* =================== shared rectangular RCC / brick tank (below ground) =================== */
  function manholes(Lin, Bin, n, size) { var out = [], k = Math.max(0, Math.min(Math.round(+n || 0), 4)); for (var i = 0; i < k; i++) out.push(rectPts(-Lin / 2 + Lin * (i + 1) / (k + 1), 0, size, size)); return out; }

  /* =================== underground sump =================== */
  T.reg("underground_sump", function (v, res, H) {
    var Hw = mm(v.depth, 2500, 500, 15000), fb = mm(v.freeboard, 300, 100, 2000), L, B, ins = sum(res, "Sump (inside)").match(/([\d.]+)\s*×\s*([\d.]+)\s*m,\s*water\s*([\d.]+)/);
    if (ins) { L = +ins[1] * 1000; B = +ins[2] * 1000; Hw = +ins[3] * 1000; }
    else if (/Given/i.test(String(v.size_mode))) { L = mm(v.L, 8000, 500, 80000); B = mm(v.B, 5000, 500, 80000); }
    else { var area = N(v.capacity, 100, 1, 1e6) * 1e9 / Hw, ratio = N(v.ratio, 1.5, 1, 6); B = Math.sqrt(area / ratio); L = ratio * B; }
    L = N(L, 8000, 500, 80000); B = N(B, 5000, 500, 80000);
    var tw = N((sum(res, "Walls").match(/(\d+)\s*mm/) || [0, v.tw_chk || 300])[1], 300, 100, 1500), bs = sum(res, "Base slab"), tb = N((bs.match(/(\d+)\s*mm/) || [0, v.tb_chk || 350])[1], 350, 100, 1500), proj = (bs.match(/projection\s*([\d.]+)/) ? +bs.match(/projection\s*([\d.]+)/)[1] * 1000 : N(v.proj_chk, 0.6, 0, 3) * 1000);
    var covered = !/Open top/i.test(String(v.roof)), tr = N((sum(res, "Roof slab").match(/(\d+)\s*mm/) || [0, v.tr_chk || 250])[1], 250, 100, 1000);
    var lv = sum(res, "Levels"), fl = lv.match(/floor\s*(-?[\d.]+)/), tp = lv.match(/top\s*([+-]?[\d.]+)/), tw2 = lv.match(/TWL\s*(-?[\d.]+)/);
    var top = tp ? +tp[1] * 1000 : mm(v.top_gl, 300, -2000, 3000), floorZ = fl ? +fl[1] * 1000 : top - (covered ? tr : 0) - (Hw + fb), roofBot = covered ? top - tr : top, wTop = Math.max(floorZ + 500, roofBot), twl = tw2 ? +tw2[1] * 1000 : floorZ + Hw;
    var n = Math.max(1, Math.min(Math.round(N(v.nos, 1, 1, 10)), 3)), one = [];
    one.push(H.box(0, 0, L + 2 * tw + 2 * proj + 200, B + 2 * tw + 2 * proj + 200, floorZ - tb - 100, floorZ - tb, "concrete"), H.box(0, 0, L + 2 * tw + 2 * proj, B + 2 * tw + 2 * proj, floorZ - tb, floorZ, "concrete"));
    one = one.concat(walls(H, 0, 0, L, B, tw, floorZ, wTop, "concrete"));
    one.push(H.box(0, 0, L - 10, B - 10, floorZ, Math.min(twl, wTop), "water"));
    if (covered) {
      var mh = manholes(L, B, v.manholes, 600);
      one.push(H.prism(rectPts(0, 0, L + 2 * tw, B + 2 * tw), roofBot, top, "concrete", mh));
      mh.forEach(function (q) { var cx = (q[0][0] + q[2][0]) / 2; one.push(H.box(cx, 0, 700, 700, top, top + 100, "concrete"), H.box(cx, 0, 640, 640, top + 100, top + 130, "steel_member")); });
    }
    var P = []; for (var i = 0; i < n; i++) P = P.concat(i ? shift(one, 0, i * (B + 2 * tw + 2 * proj + 1500)) : one);
    return { name: "Underground sump – inside " + (L / 1000).toFixed(2) + " × " + (B / 1000).toFixed(2) + " m, water " + (Hw / 1000).toFixed(2) + " m" + (n > 1 ? " (" + n + " nos)" : ""), parts: clean(P) };
  });

  /* =================== brick masonry tank =================== */
  T.reg("brick_tank", function (v, res, H) {
    var Hw = mm(v.depth, 1800, 500, 8000), fb = mm(v.freeboard, 300, 100, 2000), L, B, ins = sum(res, "Tank (inside)").match(/([\d.]+)\s*×\s*([\d.]+)\s*m,\s*water\s*([\d.]+)/);
    if (ins) { L = +ins[1] * 1000; B = +ins[2] * 1000; Hw = +ins[3] * 1000; }
    else { var area = N(v.cap_kl, 20, 1, 1e5) * 1e9 / Hw, ratio = N(v.ratio, 1.5, 1, 6); B = Math.sqrt(area / ratio); L = ratio * B; }
    L = N(L, 4000, 500, 50000); B = N(B, 3000, 500, 50000);
    var wl = sum(res, "Walls").match(/(\d+)\s*\/\s*(\d+)/), t1 = wl ? +wl[1] : N(v.t_base_chk, 345, 115, 600), t2 = wl ? +wl[2] : N(v.t_top_chk, 230, 115, 600);
    var bs = sum(res, "Base / roof").match(/(\d+)\s*mm.*?\/\s*(\d+)\s*mm/), tb = bs ? +bs[1] : 150, tr = bs ? +bs[2] : 120, proj = N(v.proj_chk, 0.15, 0, 1) * 1000;
    var hb = N(v.h_base_chk, 1.2, 0.3, 6) * 1000, covered = !/Open tank/i.test(String(v.roof)), lv = sum(res, "Levels"), fl = lv.match(/FL\s*(-?[\d.]+)/), tp = lv.match(/top\s*([+-]?[\d.]+)/), tw = lv.match(/TWL\s*(-?[\d.]+)/);
    var top = tp ? +tp[1] * 1000 : 300, floorZ = fl ? +fl[1] * 1000 : top - (covered ? tr : 0) - Hw - fb, roofBot = covered ? top - tr : top, wTop = Math.max(floorZ + 500, roofBot), twl = tw ? +tw[1] * 1000 : floorZ + Hw;
    var bd = sum(res, "RCC bands").match(/(\d+)\s*nos\s*@\s*([\d.]+)/), nb = bd ? +bd[1] : 2, bsp = bd ? +bd[2] * 1000 : 900, bh = N(v.band_h_chk, 150, 75, 400), P = [];
    hb = Math.min(hb, wTop - floorZ);
    P.push(H.box(0, 0, L + 2 * t1 + 2 * proj + 200, B + 2 * t1 + 2 * proj + 200, floorZ - tb - 100, floorZ - tb, "concrete"), H.box(0, 0, L + 2 * t1 + 2 * proj, B + 2 * t1 + 2 * proj, floorZ - tb, floorZ, "concrete"));
    P = P.concat(walls(H, 0, 0, L, B, t1, floorZ, floorZ + hb, "brick"), walls(H, 0, 0, L, B, t2, floorZ + hb, wTop, "brick"));
    for (var i = 1; i <= Math.min(nb, 6); i++) { var zb = floorZ + i * bsp, tt = zb < floorZ + hb ? t1 : t2; if (zb + bh > wTop) break; P = P.concat(walls(H, 0, 0, L, B, tt, zb - bh / 2, zb + bh / 2, "concrete")); }
    P.push(H.box(0, 0, L - 10, B - 10, floorZ, Math.min(twl, wTop), "water"));
    if (/2 \(/.test(String(v.compart)) || /2 compartments/.test(sum(res, "Tank (inside)"))) P.push(H.box(0, 0, 115, B, floorZ, wTop - 100, "brick"));
    if (covered) {
      var mh = manholes(L, B, /2 \(/.test(String(v.compart)) ? 2 : 1, 600);
      P.push(H.prism(rectPts(0, 0, L + 2 * t2 + 2 * 0, B + 2 * t2), roofBot, top, "concrete", mh));
      mh.forEach(function (q) { var cx = (q[0][0] + q[2][0]) / 2; P.push(H.box(cx, 0, 660, 660, top, top + 100, "concrete"), H.box(cx, 0, 600, 600, top + 100, top + 125, "steel_member")); });
    }
    P.push(pipe(H, L / 2 + t2, B / 4, L / 2 + t2 + 1200, B / 4, floorZ + 300, 100, "steel_member"), pipe(H, -L / 2 - t2 - 1200, -B / 4, -L / 2 - t2, -B / 4, Math.min(twl, wTop) - 100, 100, "steel_member"));
    var n = Math.max(1, Math.min(Math.round(N(v.nos, 1, 1, 10)), 3)), Q = [];
    P = clean(P); for (var k = 0; k < n; k++) Q = Q.concat(k ? shift(P, 0, k * (B + 2 * t1 + 2 * proj + 1500)) : P);
    return { name: "Brick masonry tank – inside " + (L / 1000).toFixed(2) + " × " + (B / 1000).toFixed(2) + " m, water " + (Hw / 1000).toFixed(2) + " m" + (n > 1 ? " (" + n + " nos)" : ""), parts: Q };
  });

  /* =================== septic tank + soak pits =================== */
  T.reg("septic_tank", function (v, res, H) {
    var L, B, Hl = mm(v.liq_depth, 1200, 400, 4000), fb = mm(v.freeboard, 300, 100, 1500), ins = sum(res, "Tank (inside)").match(/([\d.]+)\s*×\s*([\d.]+)\s*m,\s*liquid\s*([\d.]+)/);
    if (ins) { L = +ins[1] * 1000; B = +ins[2] * 1000; Hl = +ins[3] * 1000; } else { B = Hl * 1.33; L = B * N(v.ratio, 3, 1.5, 6); }
    L = N(L, 4700, 800, 40000); B = N(B, 1600, 500, 20000);
    var wl = String(v.walls || sum(res, "Walls")), tw = /230/.test(sum(res, "Walls") || wl) && !/345/.test(sum(res, "Walls") || wl) ? 230 : /RCC/i.test(sum(res, "Walls") || wl) ? 200 : 345;
    var sl = sum(res, "Base / cover slab").match(/(\d+)\s*mm\s*\/\s*(\d+)\s*mm/), tb = sl ? +sl[1] : 150, tc = sl ? +sl[2] : 100, proj = 150;
    var lv = sum(res, "Levels"), fl = lv.match(/floor\s*(-?[\d.]+)/), inl = lv.match(/inlet\s*(-?[\d.]+)/), twl = lv.match(/TWL\s*(-?[\d.]+)/);
    var floorZ = fl ? +fl[1] * 1000 : -(Hl + fb + 100 + 450), top = floorZ + Hl + fb + tc, roofBot = top - tc, wTop = roofBot, liq = twl ? +twl[1] * 1000 : floorZ + Hl, inletZ = inl ? +inl[1] * 1000 : liq + 50;
    top = Math.max(top, roofBot + tc); var c1 = sum(res, "Compartments").match(/([\d.]+)\s*\+\s*([\d.]+)/), c1L = c1 ? +c1[1] * 1000 : L * 2 / 3;
    c1L = N(c1L, L * 2 / 3, 300, L - 300); var xp = -L / 2 + c1L, P = [];
    P.push(H.box(0, 0, L + 2 * tw + 2 * proj + 200, B + 2 * tw + 2 * proj + 200, floorZ - tb - 100, floorZ - tb, "concrete"), H.box(0, 0, L + 2 * tw + 2 * proj, B + 2 * tw + 2 * proj, floorZ - tb, floorZ, "concrete"));
    P = P.concat(walls(H, 0, 0, L, B, tw, floorZ, wTop, /RCC/i.test(wl) && tw === 200 ? "concrete" : "brick"));
    P.push(H.box(0, 0, L - 10, B - 10, floorZ, liq, "water"));
    var sw = 230, slotZ0 = liq - 300, slotZ1 = liq - 50;
    P.push(H.box(xp, 0, sw, B, floorZ, slotZ0, "brick"), H.box(xp, 0, sw, B, slotZ1, wTop, "brick"), H.box(xp, -B / 2 + 300, sw, 600, slotZ0, slotZ1, "brick"), H.box(xp, B / 2 - 300, sw, 600, slotZ0, slotZ1, "brick"));
    var m1 = rectPts(-L / 2 + c1L / 2, 0, 600, 450), m2 = rectPts(xp + (L - c1L) / 2, 0, 600, 450);
    P.push(H.prism(rectPts(0, 0, L + 2 * tw, B + 2 * tw), roofBot, top, "concrete", [m1, m2]));
    [[-L / 2 + c1L / 2], [xp + (L - c1L) / 2]].forEach(function (a) { P.push(H.box(a[0], 0, 700, 550, top, top + 100, "concrete"), H.box(a[0], 0, 640, 490, top + 100, top + 125, "steel_member")); });
    P.push(vpipe(H, -L / 2 + 250, 0, inletZ - 450, inletZ + 200, 55), vpipe(H, L / 2 - 250, 0, liq - 450, liq + 200, 55), pipe(H, -L / 2 - tw - 1000, 0, -L / 2 + 250, 0, inletZ + 100, 100));
    P.push(vpipe(H, L / 2 - 600, B / 4, top, top + 2000, 25, "upvc"));
    var dm = sum(res, "Disposal").match(/(\d+)\s*soak pit.*?([\d.]+)\s*m dia\s*×\s*([\d.]+)/i), np = dm ? Math.min(+dm[1], 6) : 0, pd = dm ? +dm[2] * 1000 : 0, ph = dm ? +dm[3] * 1000 : 0;
    if (np > 0 && pd > 300 && ph > 300) {
      var lr = 230, Ri = pd / 2, Ro = Ri + lr, gap = 1000, x00 = L / 2 + tw + 1500 + Ro;
      for (var i = 0; i < np; i++) {
        var px = x00 + Math.floor(i / 2) * (2 * Ro + gap), py = (i % 2 ? 1 : -1) * (Ro + gap / 2) * (np > 1 ? 1 : 0), pTop = -200;
        P.push(H.tube(px, py, Ro, Ri, pTop - ph, pTop, "brick"), H.cyl(px, py, Ri - 5, pTop - ph, pTop - 100, "gravel"), H.cyl(px, py, Ri - 5, pTop - ph + 100, pTop - 100, "gravel"), H.cyl(px, py, Ro + 100, pTop, pTop + 100, "concrete"), H.cyl(px, py, 300, pTop + 100, pTop + 130, "steel_member"));
        P.push(pipe(H, L / 2 + tw, 0, px - Ro, py, floorZ + Hl * 0.9, 100), pipe(H, px - Ro, 0, px - Ro, py, floorZ + Hl * 0.9, 100));
      }
    }
    return { name: "Septic tank " + (L / 1000).toFixed(2) + " × " + (B / 1000).toFixed(2) + " m, liquid " + (Hl / 1000).toFixed(2) + " m" + (np ? " + " + np + " soak pit(s)" : ""), parts: clean(P) };
  });

  /* =================== inspection chamber(s) =================== */
  T.reg("inspection_chamber", function (v, res, H) {
    var d = mm(v.depth, 1200, 300, 8000), ch = sum(res, "Chamber").match(/(\d+)\s*×\s*(\d+)/), L = ch ? +ch[1] : N(v.L_chk, 1.2, 0.4, 5) * 1000, B = ch ? +ch[2] : N(v.B_chk, 0.9, 0.4, 5) * 1000;
    var tw = N((sum(res, "Walls").match(/(\d+)\s*mm/) || [0, v.t_chk || 230])[1], 230, 100, 600), pd = N(v.pipe_dia, 150, 50, 1200), ts = 150;
    var nn = (sum(res, "Number").match(/(\d+)\s*nos/) || [0, 1])[1]; nn = Math.max(1, Math.min(+nn || 1, 6));
    var run = N(v.run_len, 60, 1, 1e4) * 1000, spc = nn > 1 ? Math.min(run / (nn - 1), 30000) : 0, one = function (cx) {
      var P = [], floorZ = -d, top = 0, ho = rectPts(cx, 0, 455, 610);
      P.push(H.box(cx, 0, L + 2 * tw + 300, B + 2 * tw + 300, floorZ - 250, floorZ - 100, "concrete"), H.box(cx, 0, L + 2 * tw + 200, B + 2 * tw + 200, floorZ - 100, floorZ, "concrete"));
      P = P.concat(walls(H, cx, 0, L, B, tw, floorZ, top - ts, "brick"));
      P.push(H.prism(rectPts(cx, 0, L + 2 * tw, B + 2 * tw), top - ts, top, "concrete", [ho]), H.box(cx, 0, 560, 715, top, top + 30, "steel_member"), H.box(cx, 0, 460, 615, top + 30, top + 55, "steel_member"));
      P.push(H.box(cx, B / 3, L, B / 3 - 10, floorZ, floorZ + 200, "concrete"), H.box(cx, -B / 3, L, B / 3 - 10, floorZ, floorZ + 200, "concrete"));
      for (var k = 0; k < 3; k++) P.push(H.box(cx - L / 2 + 120, 0, 25, 150, floorZ + 300 + k * 330, floorZ + 325 + k * 330, "steel_member"));
      return P;
    }, P = [], x0 = -spc * (nn - 1) / 2, invZ = -d + 200 + pd / 2;
    for (var i = 0; i < nn; i++) P = P.concat(one(x0 + i * spc));
    var stub = 1000 + tw; P.push(pipe(H, x0 - L / 2 - tw - 1000, 0, x0 - L / 2, 0, invZ, pd), pipe(H, x0 + (nn - 1) * spc + L / 2, 0, x0 + (nn - 1) * spc + L / 2 + stub, 0, invZ - 30, pd));
    for (var j = 0; j < nn - 1; j++) P.push(pipe(H, x0 + j * spc + L / 2, 0, x0 + (j + 1) * spc - L / 2, 0, invZ - 15 * j, pd));
    return { name: "Inspection chamber " + L + " × " + B + " mm, " + (d / 1000).toFixed(2) + " m deep" + (nn > 1 ? " (" + nn + " nos on the line)" : ""), parts: clean(P) };
  });

  /* =================== recharge pit / trench =================== */
  T.reg("recharge_pit", function (v, res, H) {
    var st = sum(res, "Structure"), m = st.match(/(\d+)\s*×\s*(\w+)\s+([\d.]+)\s*×\s*([\d.]+)\s*×\s*([\d.]+)/), n = m ? +m[1] : N(v.n_chk, 1, 1, 20), L = m ? +m[3] * 1000 : mm(v.L_chk, 1500), B = m ? +m[4] * 1000 : mm(v.B_chk, 1000), D = m ? +m[5] * 1000 : mm(v.D_chk, 2500);
    n = Math.max(1, Math.min(Math.round(n), 6)); L = N(L, 2000, 400, 60000); B = N(B, 2000, 400, 20000); D = N(D, 2500, 500, 12000);
    var bore = /bore/i.test(String(v.rtype)) || /bore/i.test(st), lt = 230, one = [], silt = 900, sx = -(L / 2 + lt + 600 + silt / 2);
    one.push(H.box(0, 0, L + 2 * lt, B + 2 * lt, -D - 100, -D, "concrete"));
    one = one.concat(walls(H, 0, 0, L, B, lt, -D, 0, "brick"));
    one.push(H.box(0, 0, L, B, -D, -D * 0.5, "stone"), H.box(0, 0, L, B, -D * 0.5, -D * 0.25, "gravel"), H.box(0, 0, L, B, -D * 0.25, -50, "sand"));
    one.push(H.box(0, 0, L + 2 * lt + 100, B + 2 * lt + 100, -50, 0, "concrete"));
    one = one.concat(walls(H, sx, 0, silt, silt, lt, -700, 0, "brick"), [H.box(sx, 0, silt + 2 * lt, silt + 2 * lt, -850, -700, "concrete"), H.box(sx, 0, silt + 2 * lt, silt + 2 * lt, 0, 80, "concrete"), H.box(sx, 0, 460, 460, 80, 105, "steel_member")]);
    one.push(vpipe(H, sx - silt / 2 - lt - 150, 0, -300, 2200, 55), pipe(H, sx + silt / 2, 0, -L / 2, 0, -400, 110));
    if (bore) one.push(H.cyl(0, 0, 75, -D - Math.min(N(v.bore_depth, 20, 3, 100) * 1000, 8000), -D, "steel_member"));
    var P = [], gap = 1500, w = L + 2 * lt + 2 * lt + silt + 1200 + 300;
    for (var i = 0; i < n; i++) P = P.concat(i ? shift(one, 0, i * (B + 2 * lt + gap)) : one);
    return { name: "Rain-water recharge " + n + " × " + (L / 1000).toFixed(2) + " × " + (B / 1000).toFixed(2) + " × " + (D / 1000).toFixed(2) + " m" + (bore ? " with bore" : ""), parts: clean(P) };
  });

  /* =================== oil & grease trap =================== */
  T.reg("oil_trap", function (v, res, H) {
    var cm = sum(res, "Chambers").match(/silt\s*([\d.]+)\s*\+\s*oil\s*([\d.]+)\s*\+\s*clear\s*([\d.]+)\s*m\s*×\s*([\d.]+)\s*m,\s*liquid\s*([\d.]+)/), L1, L2, L3, B, Hl;
    if (cm) { L1 = +cm[1] * 1000; L2 = +cm[2] * 1000; L3 = +cm[3] * 1000; B = +cm[4] * 1000; Hl = +cm[5] * 1000; } else { L1 = mm(v.L1_chk, 1200); L2 = mm(v.L2_chk, 1500); L3 = mm(v.L3_chk, 800); B = mm(v.B_chk, 1000); Hl = mm(v.depth, 1000); }
    L1 = N(L1, 1500, 300, 15000); L2 = N(L2, 1500, 300, 15000); L3 = N(L3, 800, 300, 15000); B = N(B, 1000, 300, 10000); Hl = N(Hl, 1000, 300, 5000);
    var tw = 230, tp = 230, tb = 150, proj = 150, Hin = Hl + 300, Lin = L1 + L2 + L3 + 2 * tp, floorZ = -(Hin + 150), P = [], one = [];
    one.push(H.box(0, 0, Lin + 2 * tw + 2 * proj + 200, B + 2 * tw + 2 * proj + 200, floorZ - tb - 100, floorZ - tb, "concrete"), H.box(0, 0, Lin + 2 * tw + 2 * proj, B + 2 * tw + 2 * proj, floorZ - tb, floorZ, "concrete"));
    one = one.concat(walls(H, 0, 0, Lin, B, tw, floorZ, floorZ + Hin, "brick"));
    one.push(H.box(0, 0, Lin - 10, B - 10, floorZ, floorZ + Hl, "water"));
    var xa = -Lin / 2 + L1 + tp / 2, xb = xa + tp / 2 + L2 + tp / 2;
    one.push(H.box(xa, 0, tp, B, floorZ + 300, floorZ + Hin, "brick"), H.box(xb, 0, tp, B, floorZ, floorZ + Hl, "brick"));
    var x1 = -Lin / 2 + L1 / 2, x2 = xa + tp / 2 + L2 / 2, x3 = xb + tp / 2 + L3 / 2;
    [[x1, L1], [x2, L2], [x3, L3]].forEach(function (c) { one.push(H.box(c[0], 0, c[1] + 40, B + 2 * tw, floorZ + Hin, floorZ + Hin + 60, "concrete"), H.box(c[0], 0, Math.min(c[1] * 0.5, 600), Math.min(B * 0.6, 600), floorZ + Hin + 60, floorZ + Hin + 85, "steel_member")); });
    one.push(pipe(H, -Lin / 2 - tw - 1000, 0, -Lin / 2 + 100, 0, floorZ + Hl - 100, 150), pipe(H, Lin / 2 - 100, 0, Lin / 2 + tw + 1000, 0, floorZ + Hl - 200, 150), vpipe(H, x2, B / 3, floorZ + Hl - 500, floorZ + Hl + 200, 55));
    var n = Math.max(1, Math.min(Math.round(N(v.nos, 1, 1, 10)), 2)); one = clean(one);
    for (var i = 0; i < n; i++) P = P.concat(i ? shift(one, 0, i * (B + 2 * tw + 2 * proj + 1500)) : one);
    return { name: "Oil & grease trap – silt " + (L1 / 1000).toFixed(2) + " + oil " + (L2 / 1000).toFixed(2) + " + clear " + (L3 / 1000).toFixed(2) + " m × " + (B / 1000).toFixed(2) + " m", parts: P };
  });

  /* =================== fencing =================== */
  T.reg("fencing", function (v, res, H) {
    var h = mm(v.height, 1800, 800, 5000), sp = mm(v.post_s, 2500, 1000, 6000), total = mm(v.length, 500000, 5000, 1e9), nTot = Math.max(1, Math.round(total / sp)), nB = Math.min(nTot, 20), x0 = -nB * sp / 2;
    var ft = String(v.ftype || ""), chain = /Chain link/i.test(ft), conc = /concertina/i.test(ft), bBlk = mm(v.blk_b, 450, 200, 1500), dBlk = mm(v.blk_d, 600, 300, 2000), post = String(v.post || ""), ns = N(v.strands, 8, 2, 14), P = [];
    var rcc = /RCC/i.test(post), leg = /50/.test(post) ? 50 : 65, tt = 6, strut = Math.max(1, Math.round(nTot / Math.max(1, Math.round(N(v.corners, 4, 0, 40) + nTot / 10))));
    var chainTop = chain ? h - 450 : 0;
    function angle(x, z0, z1) { return ["p", [[x - leg / 2, -leg / 2], [x + leg / 2, -leg / 2], [x + leg / 2, -leg / 2 + tt], [x - leg / 2 + tt, -leg / 2 + tt], [x - leg / 2 + tt, leg / 2], [x - leg / 2, leg / 2]], z0, z1, "steel_member", null]; }
    for (var i = 0; i <= nB; i++) {
      var x = x0 + i * sp; P.push(H.box(x, 0, bBlk, bBlk, -dBlk, 0, "concrete"));
      P.push(rcc ? H.box(x, 0, 150, 150, 0, h, "concrete") : angle(x, 0, h));
      if (i % 10 === 0 || i === 0 || i === nB) { P.push(H.member([x, 0, h * 0.8], [x + 900, 0, 0], 50, 50, "steel_member")); if (i === 0 || i === nB) P.push(H.member([x, 0, h * 0.8], [x + (i === 0 ? 900 : -900), 0, 0], 50, 50, "steel_member")); }
    }
    for (var j = 0; j < nB; j++) {
      var xa = x0 + j * sp + (rcc ? 75 : leg / 2), xb = x0 + (j + 1) * sp - (rcc ? 75 : leg / 2);
      if (chain) P.push(H.quad([xa, 0, 50], [xb, 0, 50], [xb, 0, chainTop], [xa, 0, chainTop], "aluminium"));
      if (chain && !conc) for (var k = 0; k < 3; k++) P.push(H.member([xa, 0, chainTop + 100 + k * 120], [xb, 0, chainTop + 100 + k * 120], 8, 8, "steel_member"));
      else if (conc) for (var k2 = 0; k2 < 3; k2++) P.push(H.member([xa, k2 === 1 ? 60 : -60, chainTop + 120 + (k2 === 2 ? 220 : 0)], [xb, k2 === 1 ? 60 : -60, chainTop + 120 + (k2 === 2 ? 220 : 0)], 40, 40, "steel_member"));
      else if (!chain) for (var k3 = 0; k3 < Math.min(ns, 10); k3++) P.push(H.member([xa, 0, 150 + k3 * (h - 250) / Math.max(1, Math.min(ns, 10) - 1)], [xb, 0, 150 + k3 * (h - 250) / Math.max(1, Math.min(ns, 10) - 1)], 8, 8, "steel_member"));
    }
    return { name: "Fencing – " + (h / 1000).toFixed(2) + " m high, posts @ " + (sp / 1000).toFixed(1) + " m" + (nB < nTot ? " (" + nB + " of " + nTot + " bays shown)" : ""), parts: clean(P) };
  });
})();
