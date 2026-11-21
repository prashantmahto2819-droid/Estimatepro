/* Estimate Pro BIM — "runs": decoration and cladding drawn by points, from a start point to an end point (and round corners).
   entity { t: "run", kind, pts: [[x, y]…], closed, side: 1 | -1, z, h, mw, led, ledLook, look, lvl }
   Two families:
   - profile runs: a moulding / light section swept along the line with mitred corners (cornice, band, skirting, LED strip…)
   - panel runs: cladding built module by module along the line up to a height (WPC louvres, ACP panels, fins…), with
     optional LED lines in the joints, at the top / bottom, or both.
   The line is the wall face; the run stands out on the chosen side. Commands: RUN (MOULDING, LEDLINE), CLADDING (WPC, ACP). */
(function () {
  "use strict";
  var EP = window.EP, CAD = EP.cad, G = EP.geom, B = EP.bim; if (!B || !CAD) return;
  B.TYPES.run = 1; B.EXT = B.EXT || {};
  var Gc = "plaster_grc", Wp = "plaster_pop_white";
  /* profile: [[offset0, offset1, z0, z1, look | null (= the run's own material)]…], mm; z = default height of its underside above the floor */
  var RUNS = B.RUNS = {
    cornice: { n: "Cornice moulding 150 (inside, wall top)", fam: "p", z: 2850, look: Wp, key: "run_cornice", pr: [[0, 40, 0, 30], [0, 70, 30, 60], [0, 110, 60, 85], [0, 150, 85, 120], [0, 120, 120, 135], [0, 170, 135, 150]] },
    cornice_ext: { n: "External cornice 300 (cement / GRC)", fam: "p", z: 2900, look: Gc, key: "run_cornice", pr: [[0, 60, 0, 50], [0, 110, 50, 100], [0, 180, 100, 160], [0, 250, 160, 230], [0, 220, 230, 255], [0, 320, 255, 300]] },
    band: { n: "Plaster band 150 × 40", fam: "p", z: 3000, look: Gc, key: "run_band", pr: [[0, 25, 0, 20], [0, 40, 20, 130], [0, 25, 130, 150]] },
    band_flat: { n: "Flat plaster band 230 × 20", fam: "p", z: 900, look: Gc, key: "run_band", pr: [[0, 20, 0, 230]] },
    groove_band: { n: "Band with groove 230", fam: "p", z: 900, look: Gc, key: "run_band", pr: [[0, 50, 0, 90], [0, 20, 90, 140], [0, 50, 140, 230]] },
    dado_rail: { n: "Dado / chair rail", fam: "p", z: 900, look: Wp, key: "run_band", pr: [[0, 15, 0, 15], [0, 35, 15, 50], [0, 20, 50, 70]] },
    skirting: { n: "Moulded skirting 150", fam: "p", z: 0, look: Wp, key: "skirting", pr: [[0, 20, 0, 110], [0, 30, 110, 135], [0, 15, 135, 150]] },
    skirting_tile: { n: "Tile / stone skirting 100", fam: "p", z: 0, look: "granite_black", key: "skirting", pr: [[0, 12, 0, 100]] },
    plinth_band: { n: "Plinth band 450 (offset)", fam: "p", z: 0, look: Gc, key: "run_band", pr: [[0, 40, 0, 400], [0, 25, 400, 450]] },
    sill_band: { n: "Sill / coping band with drip 75", fam: "p", z: 825, look: Gc, key: "run_band", pr: [[0, 100, 0, 25], [0, 120, 25, 75]] },
    pelmet: { n: "Curtain pelmet / cove box 150 × 150", fam: "p", z: 2550, look: "gypsum_white", key: "false_ceiling", pr: [[130, 150, 0, 150], [0, 150, 138, 150], [100, 114, 110, 122, "led"]], led: 1 },
    led_strip: { n: "LED strip (surface)", fam: "p", z: 2700, look: "led_warm", key: "led_strip", pr: [[0, 10, 0, 14, "led"]], led: 1 },
    led_profile: { n: "LED profile light (aluminium channel)", fam: "p", z: 2400, look: "aluminium", key: "led_strip", pr: [[0, 22, 0, 4], [0, 22, 26, 30], [0, 6, 4, 26], [6, 24, 5, 25, "led"]], led: 1 },
    led_cove: { n: "Cove LED (hidden behind an upstand)", fam: "p", z: 2500, look: "gypsum_white", key: "led_strip", pr: [[0, 90, 0, 12], [78, 90, 12, 70], [20, 36, 12, 24, "led"]], led: 1 },
    led_floor: { n: "Skirting / floor LED line", fam: "p", z: 0, look: "aluminium", key: "led_strip", pr: [[0, 14, 0, 6], [0, 14, 24, 30], [2, 16, 6, 24, "led"]], led: 1 },
    led_neon: { n: "Neon flex line (colour)", fam: "p", z: 2200, look: "led_pink", key: "led_strip", pr: [[0, 16, 0, 16, "led"]], led: 1, ledLook: "led_pink" },
    wpc_louvre: { n: "WPC louvre (fluted) cladding", fam: "c", z: 0, h: 2700, look: "wpc_brown", key: "wall_panel", mw: 40, gen: "batten", bw: 25, dp: 25, back: 8 },
    wpc_louvre_wide: { n: "WPC louvre — wide ribs", fam: "c", z: 0, h: 2700, look: "wpc_grey", key: "wall_panel", mw: 90, gen: "batten", bw: 60, dp: 30, back: 8 },
    charcoal_louvre: { n: "Charcoal louvre panel", fam: "c", z: 0, h: 2700, look: "panel_charcoal", key: "wall_panel", mw: 30, gen: "batten", bw: 18, dp: 12, back: 6 },
    wood_batten: { n: "Wooden battens on wall", fam: "c", z: 0, h: 2700, look: "wood_teak", key: "wall_panel", mw: 80, gen: "batten", bw: 40, dp: 40, back: 0 },
    wpc_plank: { n: "WPC planks (horizontal) cladding", fam: "c", z: 0, h: 2700, look: "wpc_brown", key: "wall_panel", mw: 2900, rh: 150, gen: "grid", dp: 20, gv: 6 },
    acp_panels: { n: "ACP panel cladding (grid with grooves)", fam: "c", z: 0, h: 3000, look: "acp_silver", key: "acp_panel", mw: 1220, rh: 1000, gen: "grid", dp: 50, gv: 14 },
    acp_planks: { n: "ACP vertical planks (wooden look)", fam: "c", z: 0, h: 3000, look: "acp_wood_teak", key: "acp_panel", mw: 300, rh: 0, gen: "grid", dp: 40, gv: 8 },
    hpl_panels: { n: "HPL / exterior laminate panels", fam: "c", z: 0, h: 3000, look: "hpl_wood", key: "wall_panel", mw: 1220, rh: 1500, gen: "grid", dp: 30, gv: 8 },
    stone_strips: { n: "Stone strip cladding", fam: "c", z: 0, h: 3000, look: "stone_cladding_slate", key: "stone_veneer", mw: 100000, rh: 0, gen: "grid", dp: 30, gv: 0 },
    alu_fins: { n: "Aluminium / ACP fins (vertical, standing out)", fam: "c", z: 0, h: 3000, look: "aluminium_wood", key: "acp_panel", mw: 300, gen: "batten", bw: 50, dp: 200, back: 0 },
    glass_panels: { n: "Back-painted glass panels", fam: "c", z: 0, h: 2700, look: "glass_white_lacquer", key: "wall_panel", mw: 900, rh: 0, gen: "grid", dp: 12, gv: 3 }
  };
  /* fitted units drawn from a start point to an end point: the number of shutters follows the length.
     rows: [bottom, top, type] above the unit's underside — sh shutters, gl glass shutters, dr drawers, mx shutters and drawers
     alternately, sl sliding panels, op open shelves. The last row ends at the unit's height. */
  Object.assign(RUNS, {
    wardrobe_hinged: { n: "Wardrobe — hinged shutters", fam: "u", z: 0, h: 2100, dp: 600, mw: 450, pl: 80, rows: [[80, 2100, "sh"]], look: "laminate_oak", key: "wardrobe" },
    wardrobe_loft: { n: "Wardrobe with loft (full height)", fam: "u", z: 0, h: 2700, dp: 600, mw: 450, pl: 80, rows: [[80, 2100, "sh"], [2100, 2700, "sh"]], look: "laminate_oak", key: "wardrobe" },
    wardrobe_slide: { n: "Wardrobe — sliding shutters", fam: "u", z: 0, h: 2400, dp: 650, mw: 900, pl: 80, rows: [[80, 2400, "sl"]], look: "laminate_oak", key: "wardrobe" },
    loft_only: { n: "Loft cabinet (above door / wardrobe)", fam: "u", z: 2100, h: 600, dp: 600, mw: 450, pl: 0, rows: [[0, 600, "sh"]], look: "laminate_oak", key: "wardrobe" },
    kitchen_base: { n: "Kitchen base units with counter", fam: "u", z: 0, h: 850, dp: 600, mw: 500, pl: 100, rows: [[100, 830, "mx"]], top: 20, look: "laminate_sage", key: "kitchen_unit", dim: "L" },
    kitchen_wall: { n: "Kitchen wall units", fam: "u", z: 1450, h: 700, dp: 350, mw: 500, pl: 0, rows: [[0, 700, "sh"]], look: "laminate_sage", key: "kitchen_unit", dim: "L", under: 1 },
    kitchen_tall: { n: "Kitchen tall unit (oven / pantry)", fam: "u", z: 0, h: 2150, dp: 600, mw: 600, pl: 100, rows: [[100, 800, "dr"], [800, 2150, "sh"]], look: "laminate_sage", key: "kitchen_unit", dim: "L" },
    kitchen_oven_tall: { n: "Kitchen tall unit with built-in oven and microwave", fam: "u", z: 0, h: 2150, dp: 600, mw: 600, pl: 100, rows: [[100, 700, "dr"], [700, 1300, "ov"], [1300, 1700, "ov"], [1700, 2150, "sh"]], look: "laminate_sage", key: "kitchen_unit", dim: "L" },
    kitchen_fridge_bay: { n: "Fridge bay — fridge with cabinet above and side panels", fam: "u", z: 0, h: 2150, dp: 650, mw: 900, pl: 0, rows: [[0, 1800, "fr"], [1820, 2150, "sh"]], look: "laminate_sage", key: "kitchen_unit", dim: "L" },
    tv_unit: { n: "TV unit — console with back panel", fam: "u", z: 250, h: 400, dp: 400, mw: 600, pl: 0, rows: [[0, 400, "dr"]], back: 2100, look: "laminate_oak", key: "tv_unit" },
    crockery: { n: "Crockery unit — glass shutters above", fam: "u", z: 0, h: 2100, dp: 450, mw: 450, pl: 80, rows: [[80, 850, "sh"], [900, 2100, "gl"]], look: "laminate_oak", key: "wardrobe" },
    bookshelf: { n: "Book shelf / display — open", fam: "u", z: 0, h: 2100, dp: 300, mw: 600, pl: 80, rows: [[80, 2100, "op"]], look: "laminate_oak", key: "bookshelf" },
    study_table: { n: "Study / work table with drawers", fam: "u", z: 0, h: 750, dp: 600, mw: 450, pl: 0, rows: [[450, 730, "dr"]], top: 20, legs: 1, look: "laminate_oak", key: "wardrobe" },
    vanity: { n: "Vanity / basin cabinet with top", fam: "u", z: 150, h: 650, dp: 500, mw: 450, pl: 0, rows: [[0, 630, "sh"]], top: 20, look: "laminate_charcoal", key: "wardrobe" },
    shoe_rack: { n: "Shoe cabinet", fam: "u", z: 0, h: 1000, dp: 350, mw: 450, pl: 80, rows: [[80, 1000, "sh"]], look: "laminate_oak", key: "shoe_rack" }
  });
  B.RUN_HANDLES = [["", "Bar handle"], ["knob", "Knob"], ["profile", "Handle-less (profile groove)"], ["gold", "Bar handle — gold"], ["black", "Bar handle — black"]];
  B.RUN_LED = [["", "No LED"], ["joint", "LED in the vertical joints"], ["top", "LED line at the top"], ["bottom", "LED line at the bottom"], ["both", "LED lines at top and bottom"], ["all", "LED in the joints, top and bottom"]];
  B.RUN_LEDLOOKS = ["led_warm", "led_cool", "led_daylight", "led_amber", "led_blue", "led_green", "led_pink"];
  function def(e) { return RUNS[e.kind] || RUNS.band; }
  function path(e) { var p = e.pts.map(function (q) { return [q[0], q[1]]; }); return p; }
  function runLen(e) { var p = path(e), L = 0; for (var i = 0; i + 1 < p.length; i++) L += G.dist(p[i], p[i + 1]); if (e.closed && p.length > 2) L += G.dist(p[p.length - 1], p[0]); return L; }
  /* the line moved sideways by off (positive = the run's side), corners mitred */
  function offsetPath(p, off, closed, side) {
    var n = p.length, out = [], o = off * side;
    function nrm(a, b) { var u = G.norm(G.sub(b, a)); return [u[1], -u[0]]; }   /* right-hand side of the direction of travel */
    for (var i = 0; i < n; i++) {
      var prev = i > 0 ? p[i - 1] : closed ? p[n - 1] : null, next = i < n - 1 ? p[i + 1] : closed ? p[0] : null, n1 = prev ? nrm(prev, p[i]) : null, n2 = next ? nrm(p[i], next) : null, m;
      if (n1 && n2) { var s = [n1[0] + n2[0], n1[1] + n2[1]], l = Math.hypot(s[0], s[1]); if (l < 1e-6) m = n1; else { var c = (s[0] * n1[0] + s[1] * n1[1]) / l, k = Math.min(1 / Math.max(c, 0.2), 4); m = [s[0] / l * k, s[1] / l * k]; } } else m = n1 || n2 || [0, 0];
      out.push([p[i][0] + m[0] * o, p[i][1] + m[1] * o]);
    }
    return out;
  }
  function segsOf(p, closed) { var s = []; for (var i = 0; i + 1 < p.length; i++) s.push([p[i], p[i + 1]]); if (closed && p.length > 2) s.push([p[p.length - 1], p[0]]); return s; }
  function ledLookOf(e) { var D = def(e), id = e.ledLook || D.ledLook || (D.led && /^led_/.test(e.look || D.look) ? (e.look || D.look) : "led_warm"); return B.LOOKS[id] ? id : "led_warm"; }
  B.runLedLen = function (e) {
    var D = def(e), L = runLen(e); if (D.fam === "p") return D.led ? L : 0; if (D.fam === "u") return 0;
    var m = e.led || "", H = e.h || D.h, mw = e.mw || D.mw, n = 0; if (m === "top" || m === "bottom") n += L; if (m === "both" || m === "all") n += 2 * L;
    if (m === "joint" || m === "all") { var step = D.gen === "batten" ? Math.max(mw * 8, 600) : mw; segsOf(path(e), e.closed).forEach(function (s) { n += Math.max(0, Math.floor(G.dist(s[0], s[1]) / step)) * H; }); }
    return n;
  };
  /* doors / windows / openings of walls that run along the segment a → b: [{ d0, d1, z0, z1 }] (d along the segment, z absolute) */
  function holesOn(doc, e, a, b) {
    var out = [], d = doc.d, len = G.dist(a, b); if (len < 5 || e.cut === false) return out; var u = G.norm(G.sub(b, a)), walls = {};
    d.ents.forEach(function (w) { if (w.t !== "wall" || (e.lvl && w.lvl && w.lvl !== e.lvl)) return; var uw = G.norm(G.sub(w.b, w.a)); if (Math.abs(u[0] * uw[1] - u[1] * uw[0]) > 0.03) return;
      var rel = G.sub(w.a, a), dist = Math.abs(rel[0] * u[1] - rel[1] * u[0]); if (dist <= (w.th || 230) / 2 + 120) walls[w.id] = w; });
    d.ents.forEach(function (h) { if ((h.t !== "door" && h.t !== "window" && h.t !== "opening") || !walls[h.host]) return; var w = walls[h.host], uw = G.norm(G.sub(w.b, w.a)), c = G.add(w.a, G.mul(uw, h.at || 0)), dc = (c[0] - a[0]) * u[0] + (c[1] - a[1]) * u[1], hw = (h.w || 900) / 2;
      if (dc + hw <= 0 || dc - hw >= len) return; var Lw = B.level(d, w.lvl), zb = (Lw ? Lw.elev : 0) + (w.base || 0) + (h.t === "door" ? 0 : (h.sill || 0)); out.push({ d0: dc - hw, d1: dc + hw, z0: zb, z1: zb + (h.h || 2100) }); });
    return out;
  }
  B.runHoles = holesOn;
  function unitMesh(M, e, D, H, p, z0, side, own, led) {
    var Hh = e.h || D.h, dp = Math.max(150, e.dp || D.dp), mw = Math.max(200, e.mw || D.mw), car = B.look(B.LOOKS[e.look2] ? e.look2 : "paint_pure_white"), dark = B.look("steel_matt_black"), glass = B.look("glass_clear"), topL = B.look(B.LOOKS[e.lookT] ? e.lookT : "granite_black"),
      hk = B.look(e.handle === "gold" ? "steel_gold_pvd" : e.handle === "black" ? "steel_matt_black" : "steel_ss"), hd = e.handle || "", tT = D.top || 0, rows = D.rows.map(function (r) { return r.slice(); });
    rows[rows.length - 1][1] = Math.max(rows[rows.length - 1][0] + 100, Hh - tT);
    segsOf(p, e.closed).forEach(function (s, sIdx) {
      var a = s[0], b = s[1], len0 = G.dist(a, b); if (len0 < 50) return; var u = G.norm(G.sub(b, a)), nv = [u[1] * side, -u[0] * side];
      /* an inside corner: this stretch starts where the previous one's front ends, and a filler closes the corner */
      var segsAll = segsOf(p, e.closed), prevS = sIdx > 0 ? segsAll[sIdx - 1] : null, cut0 = 0;
      if (prevS) { var pu = G.norm(G.sub(prevS[1], prevS[0])), pn = [pu[1] * side, -pu[0] * side]; if (pn[0] * u[0] + pn[1] * u[1] > 0.5) cut0 = Math.min(dp, len0 - 100); }
      var a0 = a; a = [a[0] + u[0] * cut0, a[1] + u[1] * cut0]; var len = len0 - cut0; if (len < 50) return;
      var at = function (d, off) { return [a[0] + u[0] * d + nv[0] * off, a[1] + u[1] * d + nv[1] * off]; }, st = function (d0, d1, o0, o1, za, zb, look) { if (d1 - d0 < 0.5 || zb - za < 0.5 || o1 - o0 < 0.5) return; H.boxAlong(M, at(d0, (o0 + o1) / 2), at(d1, (o0 + o1) / 2), o1 - o0, z0 + za, z0 + zb, look); };
      var n = Math.max(1, Math.round(len / mw)), cw = len / n, F = dp - 18;
      if (D.back) { st(0, len, 0, 18, -D.z + 100 > 0 ? 0 : 0, D.back, own); st(len * 0.12, len * 0.88, 18, 22, Hh + 40, Hh + 52, led); st(len * 0.1, len * 0.9, 18, 240, Hh + 950, Hh + 980, own); }
      if (D.pl) st(0, len, 0, dp - 60, 0, D.pl, dark);
      if (D.legs) { [[30, 80], [len - 80, len - 30]].forEach(function (q) { st(q[0], q[1], 30, 80, 0, Hh - tT, dark); st(q[0], q[1], dp - 80, dp - 30, 0, Hh - tT, dark); }); }
      rows.forEach(function (r, ri) {
        var za = r[0], zb = r[1], ty = r[2];
        if (e.open && (ty === "sh" || ty === "sl" || ty === "gl")) {   /* shutters off: the inside — back, partitions, shelves, hanging rail, drawers */
          st(0, len, 0, 12, za, zb, car); st(0, len, 0, F, za, za + 18, car); st(0, len, 0, F, zb - 18, zb, car); var nb = Math.max(1, Math.round(len / (mw * 2))), bw2 = len / nb;
          for (var pi = 0; pi <= nb; pi++) st(Math.max(0, pi * bw2 - 9), Math.min(len, pi * bw2 + 9), 0, F, za, zb, car);
          for (var bi = 0; bi < nb; bi++) { var b0 = bi * bw2 + 9, b1 = (bi + 1) * bw2 - 9, tall = zb - za > 1500;
            if (tall && bi % 2 === 0) { st(b0, b1, 0, F, zb - 400, zb - 382, car); st(b0 + 20, b1 - 20, F * 0.5 - 12, F * 0.5 + 12, zb - 480, zb - 456, hk); for (var hgi = 0; hgi < Math.floor((b1 - b0 - 80) / 90); hgi++) st(b0 + 50 + hgi * 90, b0 + 56 + hgi * 90, F * 0.2, F * 0.8, zb - 1400 + (hgi % 3) * 120, zb - 480, B.look(["paint_denim", "paint_wine", "paint_sand", "paint_slate"][hgi % 4])); st(b0, b1, F - 20, F - 2, za + 18, za + 220, own); st(b0, b1, F - 20, F - 2, za + 226, za + 428, own); st(b0, b1, 0, F, za + 430, za + 448, car); }
            else { var nsv = Math.max(1, Math.round((zb - za) / 380)); for (var si = 1; si < nsv; si++) st(b0, b1, 0, F, za + (zb - za) * si / nsv - 9, za + (zb - za) * si / nsv + 9, car); } }
          return; }
        st(0, len, D.back ? 18 : 0, F, za, zb, car);
        if (ty === "op") { for (var i = 0; i <= n; i++) st(Math.max(0, i * cw - 9), Math.min(len, i * cw + 9), 0, dp, za, zb, own); for (var z = za; z <= zb - 20; z += Math.max(250, (zb - za) / Math.max(1, Math.round((zb - za) / 350)))) st(0, len, 0, dp, z, z + 18, own); st(0, len, 0, dp, zb - 18, zb, own); st(0, len, 0, 12, za, zb, own); return; }
        if (ty === "sl") { var ns = Math.max(2, Math.round(len / mw)), sw = len / ns; for (var k = 0; k < ns; k++) { var o = k % 2 ? 22 : 0, mir = e.mirror && k % 2 === 1; st(k * sw + (k ? -15 : 0), (k + 1) * sw, F - 22 + o, F + o, za, zb, mir ? B.look("mirror") : own); if (hd !== "profile") st((k % 2 ? k * sw + 30 : (k + 1) * sw - 60), (k % 2 ? k * sw + 60 : (k + 1) * sw - 30), F + o, F + o + 6, za + (zb - za) * 0.35, za + (zb - za) * 0.65, hk); } st(0, len, F - 30, F + 30, zb - 30, zb, dark); st(0, len, F - 30, F + 30, za, za + 20, dark); return; }
        if (ty === "ov") { for (var ov = 0; ov < n; ov++) { var v0 = ov * cw + 1.5, v1 = (ov + 1) * cw - 1.5; st(v0, v1, F, dp, za + 1.5, zb - 1.5, B.look("steel_ss")); st(v0 + 25, v1 - 25, dp, dp + 4, za + 60, zb - 70, B.look("glass_black")); st(v0 + 60, v1 - 60, dp + 4, dp + 40, zb - 55, zb - 40, B.look("steel_ss")); st(v1 - 110, v1 - 40, dp, dp + 5, zb - 34, zb - 14, B.look("led_cool")); } return; }
        if (ty === "fr") { for (var fi = 0; fi < n; fi++) { var f0 = fi * cw + 30, f1 = (fi + 1) * cw - 30, fs = B.look("steel_ss"); st(fi * cw, fi * cw + 18, 0, dp, za, zb + 20, own); st((fi + 1) * cw - 18, (fi + 1) * cw, 0, dp, za, zb + 20, own); st(f0, f1, 40, dp - 60, za + 20, zb - 20, fs); st(f0, f1, dp - 60, dp - 20, za + 20, za + (zb - za) * 0.38, fs); st(f0, (f0 + f1) / 2 - 2, dp - 60, dp - 20, za + (zb - za) * 0.38 + 6, zb - 20, fs); st((f0 + f1) / 2 + 2, f1, dp - 60, dp - 20, za + (zb - za) * 0.38 + 6, zb - 20, fs); st((f0 + f1) / 2 - 40, (f0 + f1) / 2 - 20, dp - 20, dp + 20, za + (zb - za) * 0.5, zb - 300, dark); st((f0 + f1) / 2 + 20, (f0 + f1) / 2 + 40, dp - 20, dp + 20, za + (zb - za) * 0.5, zb - 300, dark); st((f0 + f1) / 2 - 150, (f0 + f1) / 2 + 150, dp - 20, dp + 20, za + (zb - za) * 0.38 - 60, za + (zb - za) * 0.38 - 40, dark); } return; }
        for (var m = 0; m < n; m++) {
          var d0 = m * cw + 1.5, d1 = (m + 1) * cw - 1.5, drawers = ty === "dr" || (ty === "mx" && m % 3 === 1), nd = drawers ? Math.max(1, Math.min(4, Math.round((zb - za) / 240))) : 1, hh = (zb - za) / nd;
          for (var q = 0; q < nd; q++) { var a0 = za + q * hh + 1.5, a1 = za + (q + 1) * hh - 1.5;
            if (ty === "gl") { st(d0, d0 + 45, F, dp, a0, a1, own); st(d1 - 45, d1, F, dp, a0, a1, own); st(d0, d1, F, dp, a0, a0 + 45, own); st(d0, d1, F, dp, a1 - 45, a1, own); st(d0 + 45, d1 - 45, F + 5, F + 11, a0 + 45, a1 - 45, glass); }
            else st(d0, d1, F, dp, a0, a1, own);
            if (hd === "profile") st(d0, d1, F + 2, dp + 1, a1 - 14, a1 - 4, dark);
            else if (drawers) { var mc = (d0 + d1) / 2; if (hd === "knob") st(mc - 14, mc + 14, dp, dp + 22, (a0 + a1) / 2 - 14, (a0 + a1) / 2 + 14, hk); else st(mc - Math.min(90, cw * 0.25), mc + Math.min(90, cw * 0.25), dp, dp + 22, (a0 + a1) / 2 - 6, (a0 + a1) / 2 + 6, hk); }
            else { var hx = m % 2 === 0 ? d1 - 45 : d0 + 33, zc = D.under || za > 1200 ? a0 + 90 : (zb - za) > 1200 ? za + Math.min(1000, (zb - za) * 0.5) : a1 - 90; if (ri > 0 && za >= 2000) zc = a0 + 90; if (hd === "knob") st(hx - 8, hx + 20, dp, dp + 22, zc - 14, zc + 14, hk); else st(hx, hx + 12, dp, dp + 22, zc - 70, zc + 70, hk); }
          }
        }
      });
      if (tT) st(-0, len, 0, dp + 25, Hh - tT, Hh, topL);
      if (tT && D.key === "kitchen_unit" && sIdx === 0) { var posOf = function (v) { return v === "left" ? 0.22 : v === "right" ? 0.78 : 0.5; }, ss = B.look("steel_ss"), blk = B.look("glass_black");
        if (e.sink && len > 900) { var sc = len * posOf(e.sink), sw = Math.min(800, len * 0.4); st(sc - sw / 2, sc + sw / 2, 70, dp - 70, Hh, Hh + 3, ss); st(sc - sw / 2 + 25, sc + sw / 2 - 25, 95, dp - 95, Hh + 3, Hh + 5, B.look("steel_matt_black")); st(sc - 14, sc + 14, 30, 58, Hh, Hh + 280, ss); st(sc - 12, sc + 12, 44, 200, Hh + 260, Hh + 282, ss); }
        if (e.hob && e.chimney && len > 900) { var cc = len * posOf(e.hob), cw2 = e.chimney === "900" ? 900 : 600, zc0 = Hh + 700; st(cc - cw2 / 2, cc + cw2 / 2, 0, 480, zc0, zc0 + 50, ss); st(cc - cw2 / 2 + 40, cc + cw2 / 2 - 40, 0, 400, zc0 + 50, zc0 + 110, ss); st(cc - 130, cc + 130, 0, 260, zc0 + 110, zc0 + 800, ss); st(cc - cw2 / 2 + 60, cc + cw2 / 2 - 60, 440, 470, zc0 - 4, zc0, B.look("led_warm")); }
        if (e.hob && len > 900) { var hc = len * posOf(e.hob), hw2 = Math.min(720, len * 0.35); st(hc - hw2 / 2, hc + hw2 / 2, 90, dp - 60, Hh, Hh + 8, blk); [[-0.25, 0.3], [0.25, 0.3], [-0.25, 0.7], [0.25, 0.7]].forEach(function (q) { var bx = hc + hw2 * q[0], by = 90 + (dp - 150) * q[1]; st(bx - 70, bx + 70, by - 70, by + 70, Hh + 8, Hh + 20, B.look("steel_matt_black")); st(bx - 35, bx + 35, by - 35, by + 35, Hh + 20, Hh + 26, ss); }); } }
      if (D.under && e.led !== "none") st(20, len - 20, dp - 120, dp - 100, -8, 0, led);
      if (e.led === "top" || e.led === "all") st(0, len, 10, 26, Hh, Hh + 12, led);
      if ((D.under || e.led) && H.lights) { var q2 = at(len / 2, dp + 200); H.lights.push([q2[0] / 1000, q2[1] / 1000, (z0 + (D.under ? -100 : Hh + 150)) / 1000, 0.5]); }
    });
  }
  function mesh(M, doc, e, H) {
    var D = def(e), L = B.level(doc.d, e.lvl), z0 = (L ? L.elev : 0) + (e.z == null ? D.z : e.z), side = +e.side === -1 ? -1 : 1, p = path(e); if (p.length < 2) return;
    var own = B.look(e.look && B.LOOKS[e.look] ? e.look : D.look, e.col), led = B.look(ledLookOf(e));
    if (D.fam === "p") {
      D.pr.forEach(function (r) { var a = offsetPath(p, r[0], e.closed, side), b = offsetPath(p, r[1], e.closed, side), n = p.length, cnt = e.closed && n > 2 ? n : n - 1;
        for (var i = 0; i < cnt; i++) { var j = (i + 1) % n; H.prism(M, [a[i], a[j], b[j], b[i]], z0 + r[2], z0 + r[3], r[4] === "led" ? led : r[4] ? B.look(r[4]) : own); } });
      if (D.led && H.lights) { var Lt = runLen(e), nL = Math.max(1, Math.min(8, Math.round(Lt / 1500))), acc = 0, sg = segsOf(p, e.closed), tot = Lt / nL, need = tot / 2; sg.forEach(function (s) { var l = G.dist(s[0], s[1]); while (need <= acc + l && l > 0) { var t = (need - acc) / l, q = [s[0][0] + (s[1][0] - s[0][0]) * t, s[0][1] + (s[1][1] - s[0][1]) * t]; H.lights.push([q[0] / 1000, q[1] / 1000, (z0 + 20) / 1000, 0.6, B.lightRGB ? B.lightRGB(ledLookOf(e)) : null]); need += tot; } acc += l; }); }
      return;
    }
    if (D.fam === "u") { unitMesh(M, e, D, H, p, z0, side, own, led); return; }
    var Hh = e.h || D.h, mw = Math.max(10, e.mw || D.mw), z1 = z0 + Hh, mode = e.led || "", joint = mode === "joint" || mode === "all", top = mode === "top" || mode === "both" || mode === "all", bot = mode === "bottom" || mode === "both" || mode === "all";
    segsOf(p, e.closed).forEach(function (s) {
      var a = s[0], b = s[1], len = G.dist(a, b); if (len < 5) return; var u = G.norm(G.sub(b, a)), nv = [u[1] * side, -u[0] * side];
      var at = function (d, off) { return [a[0] + u[0] * d + nv[0] * off, a[1] + u[1] * d + nv[1] * off]; }, holes = holesOn(doc, e, a, b), strip = function (d0, d1, o0, o1, za, zb, look, hi) { if (d1 - d0 < 0.5 || zb - za < 0.5) return;
        for (var q = hi || 0; q < holes.length; q++) { var h = holes[q]; if (h.d1 <= d0 || h.d0 >= d1 || h.z1 <= za || h.z0 >= zb) continue;
          strip(d0, h.d0, o0, o1, za, zb, look, q + 1); strip(h.d1, d1, o0, o1, za, zb, look, q + 1); var m0 = Math.max(d0, h.d0), m1 = Math.min(d1, h.d1); strip(m0, m1, o0, o1, za, h.z0, look, q + 1); strip(m0, m1, o0, o1, h.z1, zb, look, q + 1); return; }
        H.boxAlong(M, at(d0, (o0 + o1) / 2), at(d1, (o0 + o1) / 2), Math.abs(o1 - o0), za, zb, look); };
      var zb0 = z0 + (bot ? 30 : 0), zt1 = z1 - (top ? 30 : 0);
      if (D.gen === "batten") {
        if (D.back) strip(0, len, 0, D.back, z0, z1, own);
        var n = Math.max(1, Math.floor((len + (mw - D.bw)) / mw)), start = (len - ((n - 1) * mw + D.bw)) / 2, every = Math.max(1, Math.round(Math.max(mw * 8, 600) / mw));
        for (var i = 0; i < n; i++) { var d0 = start + i * mw; strip(d0, d0 + D.bw, D.back, D.back + D.dp, zb0, zt1, own); if (joint && i < n - 1 && i % every === every - 1) strip(d0 + D.bw + 1, d0 + mw - 1, D.back, D.back + Math.min(10, D.dp * 0.5), zb0, zt1, led); }
      } else {
        var gv = D.gv || 0, nx = Math.max(1, Math.round(len / mw)), cw = len / nx, rh = e.rh != null ? e.rh : D.rh, nz = rh > 0 ? Math.max(1, Math.round((zt1 - zb0) / rh)) : 1, ch = (zt1 - zb0) / nz;
        if (gv) strip(0, len, 0, D.dp - 6, z0, z1, B.look("aluminium_anodised_black"));
        for (var ix = 0; ix < nx; ix++) for (var iz = 0; iz < nz; iz++) strip(ix * cw + gv / 2, (ix + 1) * cw - gv / 2, gv ? D.dp - 6 : 0, D.dp, zb0 + iz * ch + gv / 2, zb0 + (iz + 1) * ch - gv / 2, own);
        if (joint) for (var jx = 1; jx < nx; jx++) strip(jx * cw - Math.max(gv, 16) / 2, jx * cw + Math.max(gv, 16) / 2, D.dp - 5, D.dp + 2, zb0, zt1, led);
      }
      if (top) strip(0, len, 2, D.dp + (D.back || 0) + 3, z1 - 30, z1, led); if (bot) strip(0, len, 2, D.dp + (D.back || 0) + 3, z0, z0 + 30, led);
      if (mode && H.lights) { var nl = Math.max(1, Math.min(4, Math.round(len / 2000))); for (var k = 0; k < nl; k++) { var q = at(len * (k + 0.5) / nl, D.dp + 150); H.lights.push([q[0] / 1000, q[1] / 1000, (top && !bot ? z1 - 100 : bot && !top ? z0 + 150 : (z0 + z1) / 2) / 1000, 0.55, B.lightRGB ? B.lightRGB(ledLookOf(e)) : null]); } }
    });
  }
  B.EXT.run = {
    plan: function (doc, e) { var D = def(e), p = path(e), side = +e.side === -1 ? -1 : 1, w = D.fam === "p" ? Math.max.apply(null, D.pr.map(function (r) { return r[1]; })) : D.fam === "u" ? Math.max(150, e.dp || D.dp) + (D.top ? 25 : 0) : (D.dp + (D.back || 0)), o = offsetPath(p, w, e.closed, side);
      var segs = G.polySegs(p, !!e.closed).concat(G.polySegs(o, !!e.closed)); if (!e.closed) { segs.push({ k: "L", a: p[0], b: o[0] }); segs.push({ k: "L", a: p[p.length - 1], b: o[o.length - 1] }); }
      return { segs: segs, fill: [], dashed: [] }; },
    labels: function () { return []; },
    xform: function (e, M) { var o = JSON.parse(JSON.stringify(e)); o.pts = e.pts.map(function (p) { return G.mApply(M, p); }); var det = M[0] * M[3] - M[1] * M[2]; if (det < 0) o.side = +e.side === -1 ? 1 : -1; return o; },
    qty: function (doc, e) { var D = def(e), L = runLen(e), z = e.lvl ? B.below(doc.d, e.lvl) : "super", m = function (v) { return (v / 1000).toFixed(2); }, rows = [];
      if (e.noq === true) return rows;
      if (D.fam === "u") { var Hu = e.h || D.h, du = Math.max(150, e.dp || D.dp); if (D.dim === "L") rows.push({ k: D.key, dim: "L", v: L, label: D.n, f: m(L) + " m run", z: z }); else rows.push({ k: D.key, dim: "A", v: L * Hu, label: D.n, f: m(L) + " × " + m(Hu) + " (front)", z: z });
        if (D.top && D.key === "kitchen_unit") rows.push({ k: "kitchen_counter", dim: "A", v: L * (du + 25), label: "Counter top — " + D.n, f: m(L) + " × " + m(du + 25), z: z });
        if (D.back) rows.push({ k: "wall_panel", dim: "A", v: L * D.back, label: "TV back panel", f: m(L) + " × " + m(D.back), z: z }); return rows; }
      if (D.fam === "p") { if (D.key !== "led_strip") rows.push({ k: D.key, dim: "L", v: L, label: D.n, f: m(L) + " m run", z: z }); }
      else { var Hh = e.h || D.h, Lv = B.level(doc.d, e.lvl), zr0 = (Lv ? Lv.elev : 0) + (e.z == null ? D.z : e.z), ded = 0; segsOf(path(e), e.closed).forEach(function (sg) { var ln = G.dist(sg[0], sg[1]); holesOn(doc, e, sg[0], sg[1]).forEach(function (h) { var w = Math.min(ln, h.d1) - Math.max(0, h.d0), hh = Math.min(zr0 + Hh, h.z1) - Math.max(zr0, h.z0); if (w > 0 && hh > 0) ded += w * hh; }); });
        rows.push({ k: D.key, dim: "A", v: Math.max(0, L * Hh - ded), label: D.n, f: m(L) + " × " + m(Hh) + (ded > 0 ? " − openings " + (ded / 1e6).toFixed(2) + " m²" : ""), z: z }); }
      var ll = B.runLedLen(e); if (ll > 0) rows.push({ k: "led_strip", dim: "L", v: ll, label: "LED strip / profile light", f: m(ll) + " m run", z: z });
      return rows; },
    mesh: mesh
  };
  B.runLen = runLen;
  B.MAP = B.MAP || {}; ["run_cornice", "run_band", "led_strip"].forEach(function (k) { if (!(k in B.MAP)) B.MAP[k] = null; });

  /* ---------- POP / gypsum ceiling designs inside a room (room.cdes) ---------- */
  B.CEIL_DES = [["", "Plain flat board"], ["tray", "Tray — border lowered, centre raised, cove light"], ["double", "Double-step tray with two light lines"], ["island", "Floating island in the centre with light round it"], ["border", "Border band only (centre open to the slab)"]];
  B.CEIL_SPOTS = [["", "No spot lights"], ["border", "Spots along the border"], ["grid", "Spots in a grid over the centre"], ["both", "Border and centre grid"]];
  function inset(P, d) { var a = 0; for (var i = 0; i < P.length; i++) { var q = P[(i + 1) % P.length]; a += P[i][0] * q[1] - q[0] * P[i][1]; } return offsetPath(P, d, true, a >= 0 ? -1 : 1); }
  function polyArea(P) { var a = 0; for (var i = 0; i < P.length; i++) { var q = P[(i + 1) % P.length]; a += P[i][0] * q[1] - q[0] * P[i][1]; } return Math.abs(a) / 2; }
  function ceilParts(e) { var P = e.pts.map(function (q) { return [q[0], q[1]]; }), bw = Math.max(150, +e.cbw || 600), box = B.polyBox(P), lim = Math.min(box[2] - box[0], box[3] - box[1]) / 2 - 150; bw = Math.min(bw, Math.max(150, lim)); var In = inset(P, bw); if (polyArea(In) < 1e5 || polyArea(In) >= polyArea(P)) In = null; return { P: P, bw: bw, In: In, In2: In ? (function () { var q = inset(P, bw * 1.7); return polyArea(q) > 1e5 && polyArea(q) < polyArea(In) ? q : null; })() : null }; }
  function alongPts(P, step) { var out = []; for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length], l = G.dist(a, b), n = Math.max(1, Math.round(l / step)); for (var k = 0; k < n; k++) { var t = (k + 0.5) / n; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } } return out; }
  function inPoly(p, P) { var c = false; for (var i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > p[1]) !== (P[j][1] > p[1]) && p[0] < (P[j][0] - P[i][0]) * (p[1] - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; }
  function ceilSpots(e, C) { var m = e.cspot || "", out = []; if (!m || !C.In) return out; if (m === "border" || m === "both") out = out.concat(alongPts(inset(C.P, C.bw / 2), 1200)); if (m === "grid" || m === "both") { var bb = B.polyBox(C.In), nx = Math.max(1, Math.round((bb[2] - bb[0]) / 1200)), ny = Math.max(1, Math.round((bb[3] - bb[1]) / 1200)); for (var i = 0; i < nx; i++) for (var j = 0; j < ny; j++) { var p = [bb[0] + (bb[2] - bb[0]) * (i + 0.5) / nx, bb[1] + (bb[3] - bb[1]) * (j + 0.5) / ny]; if (inPoly(p, C.In)) out.push(p); } } return out.slice(0, 80); }
  B.ceilInfo = function (e) { var C = ceilParts(e), led = 0, per = function (P) { var l = 0; for (var i = 0; i < P.length; i++) l += G.dist(P[i], P[(i + 1) % P.length]); return l; }; if (C.In && e.cdes && e.cdes !== "border") led += per(C.In); if (C.In2 && e.cdes === "double") led += per(C.In2); return { led: led, spots: ceilSpots(e, C).length }; };
  B.ceilDesign = function (M, doc, e, zf, H) {
    var d = doc.d, C = ceilParts(e), look = B.lookFor(d, "ceiling"), led = B.look(B.LOOKS[e.cled] ? e.cled : "led_warm"), drop = Math.max(60, +e.cdrop || 150), des = e.cdes;
    if (!C.In) { H.prism(M, C.P, zf, zf + 12, look, null, null, true); return; }
    var ring = function (Outer, Inner, z) { H.prism(M, Outer, z, z + 12, look, [Inner], null, true); }, fascia = function (Pl, z0, z1, withLed) { for (var i = 0; i < Pl.length; i++) { var a = Pl[i], b = Pl[(i + 1) % Pl.length]; H.boxAlong(M, a, b, 12, z0, z1, look); } if (withLed) { var Li = inset(Pl, des === "island" ? -14 : 14); for (var k = 0; k < Li.length; k++) H.boxAlong(M, Li[k], Li[(k + 1) % Li.length], 16, z1 - 34, z1 - 20, led); } };
    if (des === "tray" || des === "border") { ring(C.P, C.In, zf); fascia(C.In, zf, zf + drop, des === "tray"); if (des === "tray") H.prism(M, C.In, zf + drop, zf + drop + 12, look, null, null, true); }
    else if (des === "double") { ring(C.P, C.In, zf); fascia(C.In, zf, zf + drop * 0.5, true); if (C.In2) { ring(C.In, C.In2, zf + drop * 0.5); fascia(C.In2, zf + drop * 0.5, zf + drop, true); H.prism(M, C.In2, zf + drop, zf + drop + 12, look, null, null, true); } else H.prism(M, C.In, zf + drop * 0.5, zf + drop * 0.5 + 12, look, null, null, true); }
    else if (des === "island") { H.prism(M, C.P, zf + drop, zf + drop + 12, look, null, null, true); H.prism(M, C.In, zf, zf + 40, look, null, null, false); var Lo = inset(C.In, -4); for (var q = 0; q < Lo.length; q++) H.boxAlong(M, Lo[q], Lo[(q + 1) % Lo.length], 10, zf + 8, zf + 34, led); var Lw2 = inset(C.In, -45); for (var q2 = 0; q2 < Lw2.length; q2++) H.boxAlong(M, Lw2[q2], Lw2[(q2 + 1) % Lw2.length], 50, zf + drop - 3, zf + drop, led);   /* the wash of light on the ceiling above, round the island */ }
    else H.prism(M, C.P, zf, zf + 12, look, null, null, true);
    var sp = ceilSpots(e, C), cyl = B.AH && B.AH.cyl, V = B.AH && B.AH.V, wh = B.look("paint_pure_white");
    sp.forEach(function (p) { var zs = inPoly(p, C.In) && des !== "island" ? zf + (des === "double" && C.In2 && inPoly(p, C.In2) ? drop : des === "double" ? drop * 0.5 : des === "border" ? 0 : drop) : zf; if (des === "border" && inPoly(p, C.In)) return; H.box(M, p, 90, 90, 0, zs - 4, zs, wh); H.box(M, p, 56, 56, 0, zs - 6, zs - 4, led); });
    if (H.lights) { var bb = B.polyBox(C.P), n = Math.max(1, Math.min(4, Math.round(polyArea(C.P) / 9e6))); for (var i = 0; i < n; i++) H.lights.push([(bb[0] + (bb[2] - bb[0]) * (i + 0.5) / n) / 1000, (bb[1] + bb[3]) / 2000, (zf - 150) / 1000, 0.9, B.lightRGB ? B.lightRGB(B.LOOKS[e.cled] ? e.cled : "led_warm") : null]); }
  };
  var qty0 = B.qty; B.qty = function (doc, e) { var r = qty0.apply(this, arguments); if (e && e.t === "room" && e.ceil && e.cdes && r && r.length) { var info = B.ceilInfo(e), z = r[0].z; if (info.led > 0) r = r.concat([{ k: "led_strip", dim: "L", v: info.led, label: "LED strip / profile light — ceiling of " + (e.name || "room"), f: (info.led / 1000).toFixed(2) + " m run", z: z }]); if (info.spots) r = r.concat([{ k: "light_point", dim: "N", v: info.spots, label: "Spot light in false ceiling — " + (e.name || "room"), f: info.spots + " no.", z: z }]); } return r; };

  var cmds = CAD.commands, AL = CAD.aliases;
  function cmd(name, al, fn) { cmds[name] = { fn: fn }; (al || []).forEach(function (a) { AL[a] = name; }); }
  function kwOf(fam) { var o = {}; Object.keys(RUNS).forEach(function (k) { if (RUNS[k].fam === fam) o[k.split("_").map(function (w) { return w[0].toUpperCase() + w.slice(1); }).join("")] = k; }); return o; }
  /* points along the arc from a through m to c (without a itself), about one every 250 mm */
  function arcPts(a, m, c) { var k = G.circle3(a, m, c); if (!k || k.r > G.dist(a, c) * 50) return [c]; var t1 = Math.atan2(a[1] - k.c[1], a[0] - k.c[0]), t2 = Math.atan2(m[1] - k.c[1], m[0] - k.c[0]), t3 = Math.atan2(c[1] - k.c[1], c[0] - k.c[0]), nz = function (x) { x %= Math.PI * 2; return x < 0 ? x + Math.PI * 2 : x; }, ccw = nz(t2 - t1) < nz(t3 - t1), sw = ccw ? nz(t3 - t1) : -nz(t1 - t3), n = Math.max(6, Math.min(64, Math.ceil(Math.abs(sw) * k.r / 250))), P = [];
    for (var i = 1; i <= n; i++) { var t = t1 + sw * i / n; P.push(i === n ? [c[0], c[1]] : [k.c[0] + k.r * Math.cos(t), k.c[1] + k.r * Math.sin(t)]); } return P; }
  async function draw(ed, fam) {
    B.ensure(ed.doc.d); var KW = kwOf(fam), names = Object.keys(KW), memo = fam === "p" ? "runKind" : fam === "u" ? "unitKind" : "cladKind", cur = ed[memo] && RUNS[ed[memo]] && RUNS[ed[memo]].fam === fam ? ed[memo] : KW[names[0]];
    var kind = cur, side = ed.runSide === -1 ? -1 : 1, lvl = B.ensure(ed.doc.d).cur, pts = [], D = RUNS[kind];
    var head = function () { return RUNS[kind].n + " — start point"; };
    while (true) {
      var p = await ed.getPoint(pts.length ? "Next point (Enter to finish)" : head(), { opt: pts.length > 0, base: pts.length ? pts[pts.length - 1] : null, kw: pts.length ? (pts.length > 2 ? ["Arc", "Undo", "Close", "Flip"] : ["Arc", "Undo", "Flip"]) : ["Type", "Circle", "Flip"] });
      if (p === "Circle") { var cc = await ed.getPoint("Centre of the circle"), rr = await ed.getDist("Radius", { base: cc, def: 1000 }); if (!(rr > 20)) continue; var cp = [], nn = Math.max(16, Math.min(72, Math.ceil(2 * Math.PI * rr / 250))); for (var ci = 0; ci < nn; ci++) cp.push([cc[0] + rr * Math.cos(2 * Math.PI * ci / nn), cc[1] + rr * Math.sin(2 * Math.PI * ci / nn)]);
        ed.preview = null; ed.doc.add({ t: "run", kind: kind, pts: cp, closed: true, side: side, lvl: lvl }); ed[memo] = kind; ed.say(RUNS[kind].n + " added as a circle of radius " + Math.round(rr) + " mm. Use Flip side in Properties if it stands out the wrong way."); return; }
      if (p === "Arc") { var from = pts[pts.length - 1], ae = await ed.getPoint("End point of the curve", { base: from }), am; ed.preview = (function (k, sd, base) { return function (w) { return [{ t: "run", kind: k, pts: base.concat(arcPts(from, w, ae)), side: sd, lvl: lvl }]; }; })(kind, side, pts.slice()); am = await ed.getPoint("A point on the curve"); pts = pts.concat(arcPts(from, am, ae)); (function (k, sd) { ed.preview = function (w) { return [{ t: "run", kind: k, pts: pts.concat([[w[0], w[1]]]), side: sd, lvl: lvl }]; }; })(kind, side); continue; }
      if (p === "Type") { var pick = await ed.getKw("Which one?", names, names.filter(function (n) { return KW[n] === kind; })[0]); kind = KW[pick] || kind; ed[memo] = kind; continue; }
      if (p === "Flip") { side = -side; ed.runSide = side; ed.say("It now stands out on the other side of the line."); }
      else if (p === "Undo") { if (pts.length) pts.pop(); }
      else if (p === "Close") { ed.preview = null; ed.doc.add({ t: "run", kind: kind, pts: pts, closed: true, side: side, lvl: lvl }); ed.say(RUNS[kind].n + " added, " + (B.runLen({ pts: pts, closed: true }) / 1000).toFixed(2) + " m. Height, size, material and LED are in Properties."); return; }
      else if (p == null) break; else pts.push([p[0], p[1]]);
      (function (k, sd) { ed.preview = pts.length ? function (w) { return [{ t: "run", kind: k, pts: pts.concat([[w[0], w[1]]]), side: sd, lvl: lvl }]; } : null; })(kind, side);
    }
    ed.preview = null; if (pts.length < 2) return; ed[memo] = kind;
    ed.doc.add({ t: "run", kind: kind, pts: pts, closed: false, side: side, lvl: lvl });
    ed.say(RUNS[kind].n + " added, " + (B.runLen({ pts: pts }) / 1000).toFixed(2) + " m. Height, size, material and LED are in Properties.");
  }
  cmd("RUN", ["MOULDING", "MOLDING", "CORNICE", "LEDLINE", "LEDSTRIP", "SKIRTING"], function (ed) { return draw(ed, "p"); });
  cmd("CABINET", ["WARDROBE", "KITCHEN", "TVUNIT", "CUPBOARD", "ALMIRAH"], function (ed) { return draw(ed, "u"); });
  cmd("CLADDING", ["CLAD", "WPC", "ACP", "LOUVRE"], function (ed) { return draw(ed, "c"); });
})();
