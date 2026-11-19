/* Design Studio — modules_bridge (port of civilest/design/modules_bridge.py)
   Phase 4 – Road bridges and building frames.

   Modules
       slab_bridge     Simply supported RCC solid slab bridge – IRC 6 Class A (1/2 lanes) & 70R, effective width
       tbeam_bridge    T-beam girder bridge – Courbon's distribution, girder & deck slab design
       building_frame  Multi-storey RCC plane frame – gravity + IS 1893 equivalent static seismic, beam/column design */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var C = DS.core;
  var M = DS.modules_bridge = {};
  var F = C.pyfmt, R = C.pyround, S = C.pystr;

  function num(v) { return Number(v); }
  function P(key, label, def, unit, o) {          // Param(key, label, default, unit="", **kw)
    if (unit && typeof unit === "object") { o = unit; unit = undefined; }
    var p = { key: key, label: label, default: def };
    if (unit !== undefined) p.unit = unit;
    Object.keys(o || {}).forEach(function (k) { p[k] = o[k]; });
    return C.Param(p);
  }
  function maxOf(a) { return Math.max.apply(null, a); }
  function minOf(a) { return Math.min.apply(null, a); }

  var BR_REFS = ["IRC 5:2015 – General features of design", "IRC 6:2017 – Loads & load combinations",
    "IRC 112:2020 – Code of practice for concrete road bridges",
    "IRC 21:2000 – (superseded) effective width tables, still used for reference",
    "IRC SP-13 – Small bridges & culverts", "MoRTH Standard Plans for slab / T-beam superstructure",
    "D.J. Victor – Essentials of Bridge Engineering", "N. Krishna Raju – Design of Bridges",
    "Ponnuswamy – Bridge Engineering"];
  var FR_REFS = ["IS 456:2000", "IS 1893 (Part 1):2016 – Earthquake resistant design", "IS 13920:2016 – Ductile detailing",
    "IS 875 Parts 1 & 2", "SP 16 / SP 34", "Pillai & Menon – Reinforced Concrete Design",
    "S.K. Duggal – Earthquake Resistant Design of Structures"];
  M.BR_REFS = BR_REFS; M.FR_REFS = FR_REFS;

  // effective-width coefficient α – IRC 112 Annex B / IRC 21 Table (verify against your copy)
  var ALPHA_BL = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0];
  var ALPHA_SS = [0.40, 0.80, 1.16, 1.48, 1.72, 1.96, 2.12, 2.24, 2.36, 2.48, 2.60, 2.64, 2.72, 2.80, 2.84, 2.88, 2.92,
    2.96, 3.00, 3.00];
  var ALPHA_CONT = [0.40, 0.80, 1.16, 1.44, 1.68, 1.84, 1.96, 2.08, 2.16, 2.24, 2.28, 2.36, 2.40, 2.48, 2.48, 2.52, 2.56,
    2.60, 2.60, 2.60];
  M.ALPHA_BL = ALPHA_BL; M.ALPHA_SS = ALPHA_SS; M.ALPHA_CONT = ALPHA_CONT;

  function _union(intervals) {
    var tot = 0.0, cur = null;
    var srt = intervals.map(function (t) { return t.slice(); }).sort(function (p, q) { return p[0] - q[0] || p[1] - q[1]; });
    srt.forEach(function (t) {
      var a = t[0], b = t[1];
      if (cur === null || a > cur[1]) {
        if (cur) tot += cur[1] - cur[0];
        cur = [a, b];
      } else cur[1] = Math.max(cur[1], b);
    });
    if (cur) tot += cur[1] - cur[0];
    return tot;
  }
  function _spread(lines, half, lo, hi) {
    return _union(lines.map(function (x) { return [Math.max(lo, x - half), Math.min(hi, x + half)]; }));
  }
  M._union = _union; M._spread = _spread;

  /* IRC 6:2017 Table 6: lanes of Class A for a carriageway width (m): < 5.3 → 1, 5.3–9.6 → 2, 9.6–13.1 → 3 */
  function class_a_lanes(cw) { return cw < 5.3 ? 1 : cw < 9.6 ? 2 : 3; }
  /* IRC 6:2017 cl 204.4: reduction of longitudinal effects for more than two lanes loaded (3 lanes → 10 %) */
  function lane_reduction(k) { return k <= 2 ? 1.0 : k === 3 ? 0.9 : 0.8; }
  /* wheel lines of k Class A trains placed side by side from x0: 1.8 m gauge, 1.7 m between trains */
  function train_lines(x0, k) { var ls = []; for (var i = 0; i < k; i++) ls.push(x0 + 3.5 * i, x0 + 3.5 * i + 1.8); return ls; }
  M.class_a_lanes = class_a_lanes; M.lane_reduction = lane_reduction; M.train_lines = train_lines;

  function kgRows(bbs) {
    var CM = DS.common;
    return bbs.map(function (b) { return CM.kg_row(b.member + " " + b.mark + " " + F(b.dia, "g") + "Ø", b.nos, b.cut_length, b.dia * b.dia / 162); });
  }

  /* =========================================================================== SLAB BRIDGE */
  function run_slab_bridge(inp, mode) {
    var LD = DS.loads, RC = DS.rcc, CM = DS.common, D_ = DS.drawing, row = CM.row, Q = CM.Q, B_ = CM.B, RATE = CM.RATE;
    var c = new C.Calc("RCC solid slab bridge");
    var DT = DS.detailing;                          // bar-size rules (detailing.js)
    var fck = num(inp.fck), fy = num(inp.fy);
    var clear = num(inp.clear_span);
    var brg = num(inp.bearing);
    var cw = num(inp.carriageway);
    var kerb = num(inp.barrier_w);
    var B = cw + 2 * kerb;
    var cover = num(inp.cover);
    var wc = num(inp.wc) / 1000;
    c.section("Geometry");
    var L = c.calc("Effective span (c/c of bearings)", "L", "clear + brg", "m", "IRC 112 cl 7.? / IRC 5", { clear: clear, brg: brg });
    c.let("Overall width (carriageway + 2 crash barriers)", "B", B, "m", "IRC 5");
    var lanes = class_a_lanes(cw);
    c.let("Lanes of Class A", "n", lanes, "", "IRC 6 Table 6", "carriageway " + F(cw, "g") + " m: < 5.3 m → 1, 5.3–9.6 m → 2, ≥ 9.6 m → 3 lanes" +
      (lanes > 2 ? "; 10 % reduction for 3 lanes (IRC 6 cl 204.4)" : ""));
    var alpha = C.interp(B / L, ALPHA_BL, ALPHA_SS);
    c.calc("Effective-width coefficient α (simply supported)", "α", "a", "", "IRC 112 Annex B3 / IRC 21 Table",
      "B/L = " + F(B / L, ".2f"), { a: R(alpha, 3) });
    var D = mode === "check" ? num(inp.D) : C.ceil_to(Math.max(L * 1000 / 13, 300), 25);

    function actions(D) {
      var d = D - cover - 10;
      var g = 25 * D / 1000 + 22 * wc;
      var g_barrier = 2 * num(inp.barrier_load) / B;
      var Mdl = (g + g_barrier) * Math.pow(L, 2) / 8;
      var Vdl = (g + g_barrier) * (L / 2 - d / 1000);
      var Mwc = 22 * wc * Math.pow(L, 2) / 8, Vwc = 22 * wc * (L / 2 - d / 1000);   // surfacing part (ULS factor 1.75)
      // Class A
      var IA = LD.impact_class_a(L);
      var mv = LD.max_moment_moving(LD.CLASS_A.axles, LD.CLASS_A.spacing, L), Mtr = mv[0], Vtr = mv[1];
      var b1 = 0.50 + 2 * wc;
      var beff = alpha * (L / 2) * (1 - 0.5) + b1;
      var x1 = kerb + 0.15 + 0.25;
      var a_v = Math.max(d / 1000 + 0.6, 0.5);
      var beff_v = alpha * a_v * (1 - a_v / L) + b1;
      var ws = [], MA = 0, VA = 0;
      for (var k = 1; k <= lanes; k++) {          // 1 … lanes trains side by side, whichever gives the larger effect per m
        var lk = train_lines(x1, k), wk = _spread(lk, beff / 2, 0, B);
        ws.push(wk);
        MA = Math.max(MA, lane_reduction(k) * k * Mtr * (1 + IA) / wk);
        VA = Math.max(VA, lane_reduction(k) * k * Vtr * (1 + IA) / _spread(lk, beff_v / 2, 0, B));
      }
      var w1 = ws[0], w2 = ws[ws.length - 1];
      // 70R tracked
      var I70 = LD.impact_70r_tracked(L);
      var lt = Math.min(LD.CLASS_70R_TRACKED.length + 2 * wc, L);
      var M70tot = 700 * (2 * L - lt) / 8;
      var bt = 0.84 + 2 * wc;
      var beff70 = alpha * (L / 2) * 0.5 + bt;
      var xt = kerb + 1.2 + 0.42;
      var w70 = _spread([xt, xt + 2.06], beff70 / 2, 0, B);
      var M70 = cw >= 5.3 ? M70tot * (1 + I70) / w70 : 0.0;
      var V70 = 700 * (1 - (lt / 2 + d / 1000) / L) * (1 + I70) / _spread([xt, xt + 2.06], (alpha * a_v * (1 - a_v / L) +
        bt) / 2, 0, B);
      var Mll = Math.max(MA, M70), Vll = Math.max(VA, V70);
      return { d: d, g: g, Mdl: Mdl, Vdl: Vdl, Mwc: Mwc, Vwc: Vwc, IA: IA, Mtr: Mtr, beff: beff, w1: w1, w2: w2, ws: ws,
        MA: MA, M70: M70, I70: I70, w70: w70, Mll: Mll, Vll: Vll, beff70: beff70,
        Med: 1.35 * (Mdl - Mwc) + 1.75 * Mwc + 1.5 * Mll, Ved: 1.35 * (Vdl - Vwc) + 1.75 * Vwc + 1.5 * Vll, Ms: Mdl + 0.75 * Mll };
    }

    function shear_bars(a, D) {
      /* Bars giving enough flexural steel AND enough ρ for VRd,c ≥ VEd (avoids over-thick slabs). */
      var d = D - cover - 12;
      var sc = new C.Calc("s");
      var f = RC.flexure(sc, a.Med, 1000, d, fck, fy, "slab", D);
      var need = Math.max(f.Ast, RC.as_for_shear_irc112(a.Ved, 1000, d, fck));
      if (need === Infinity) return null;
      var bb = RC.slab_bars(need, d, D, true, DT ? { dias: [16, 20, 25, 32], smax: 200, rule: { member: "bridge_slab", role: "main" } } :
        { dias: [16, 20, 25, 32], smax: 200 });
      return [bb.dia, bb.spacing, bb];
    }

    var a;
    if (mode !== "check") {
      for (var it = 0; it < 60; it++) {
        a = actions(D);
        var sc = new C.Calc("s");
        var g = shear_bars(a, D);
        if (g) {
          var st = RC.design_strip(sc, a.Med, D, cover, fck, fy, "main", a.Ms, 0.3, null, g,
            { dia_pref: [16, 20, 25, 32], smax: 200 });
          RC.shear_irc112(sc, a.Ved, 1000, st.d, st.Ast_prov, fck);
          if (!sc.failures.length) break;
        }
        D += 25;
      }
    }
    a = actions(D);
    c.let("Slab thickness", "D", D, "mm");
    c.section("Dead load (per m width)");
    c.calc("Self-weight + wearing coat", "g", "25*D/1000 + 22*wc", "kN/m²", "IRC 6 cl 203", { D: D, wc: wc });
    c.calc("Crash barrier load spread over width", "gb", "2*Wb/B", "kN/m²", "", { Wb: num(inp.barrier_load), B: B });
    c.calc("Dead load moment", "Mg", "(g + gb)*L**2/8", "kN·m/m", "", { g: R(a.g, 3),
      gb: R(2 * num(inp.barrier_load) / B, 3), L: L });
    c.calc("of which surfacing (wearing coat)", "Mwc", "22*wc*L**2/8", "kN·m/m", "IRC 6 cl 203", { wc: wc, L: L });
    c.section("Live load – IRC Class A");
    c.calc("Impact factor (Class A, RCC)", "IF", "4.5/(6 + L)", "", "IRC 6 cl 208.2", { L: L });
    c.let("Max. moment of one Class A train on span", "Mtrain", R(a.Mtr, 2), "kN·m", "IRC 6 Fig 1 – train scan");
    c.calc("Effective width of one wheel at mid-span", "beff", "alpha*a*(1 - a/L) + b1", "m", "IRC 112 Annex B3",
      { alpha: R(alpha, 3), a: L / 2, L: L, b1: 0.5 + 2 * wc });
    c.let("Dispersion width – " + ["one", "two", "three"].slice(0, a.ws.length).join(" / ") + " train" + (a.ws.length > 1 ? "s" : ""),
      a.ws.map(function (_, i) { return "W" + (i + 1); }).join(" / "), a.ws.map(function (x) { return F(x, ".2f"); }).join(" / "), "m", "",
      "wheel lines 0.4 m from kerb face, 1.8 m gauge, 1.7 m between trains; overlaps merged");
    c.let("Class A moment per m", "MA", R(a.MA, 2), "kN·m/m");
    c.section("Live load – IRC 70R tracked");
    c.calc("Impact factor (70R tracked)", "IF70", "i", "", "IRC 6 cl 208.3", { i: R(a.I70, 3) });
    c.let("70R moment per m", "M70", R(a.M70, 2), "kN·m/m", "", "spread width " + F(a.w70, ".2f") + " m");
    c.section("Design actions (IRC 6 Annex B)");
    var Med = c.calc("ULS moment", "MEd", "1.35*(Mg - Mwc) + 1.75*Mwc + 1.5*Mq", "kN·m/m", "IRC 6 Table B.2 / Table 3.2",
      "surfacing ×1.75, other dead load ×1.35", { Mg: R(a.Mdl, 2), Mwc: R(a.Mwc, 2), Mq: R(a.Mll, 2) });
    var Ved = c.calc("ULS shear near support", "VEd", "1.35*(Vg - Vwc) + 1.75*Vwc + 1.5*Vq", "kN/m", "IRC 6 Table B.2 / Table 3.2",
      { Vg: R(a.Vdl, 2), Vwc: R(a.Vwc, 2), Vq: R(a.Vll, 2) });
    var Ms = c.calc("SLS (frequent) moment", "Ms", "Mg + 0.75*Mq", "kN·m/m", "IRC 6 Table B.3", { Mg: R(a.Mdl, 2),
      Mq: R(a.Mll, 2) });
    RC.cover_check(c, inp.exposure, cover, fck, "slab");
    var given = mode === "check" ? [num(inp.bar_dia), num(inp.bar_s)] : shear_bars(a, D);
    if (DT && mode !== "check" && given && given[2]) DT.record(c, "main bottom", given[2]);
    var main = RC.design_strip(c, Med, D, cover, fck, fy, "main bottom", Ms, 0.3, null, given ? given.slice(0, 2) : given,
      { dia_pref: [16, 20, 25, 32], smax: 200, rule: DT && mode === "check" ? { member: "bridge_slab", role: "main" } : null });
    RC.shear_irc112(c, Ved, 1000, main.d, main.Ast_prov, fck);
    var Mdist = c.calc("Distribution moment", "Mdist", "0.3*Mq + 0.2*Mg", "kN·m/m", "IRC 21 cl 305.18 (practice)",
      { Mq: R(a.Mll, 2), Mg: R(a.Mdl, 2) });
    var dist = RC.design_strip(c, 1.5 * Mdist, D, cover + main.dia, fck, fy, "distribution", 0, null, null, null,
      { dia_pref: [12, 16, 20], smax: 250, rule: DT ? { member: "bridge_slab", role: "dist", main_dia: main.dia } : null });
    var top = DT ? RC.slab_bars(0.0012 * 1000 * D / 2, D - cover - 10, D, false, { dias: [10, 12, 16],
      rule: { member: "bridge_slab", role: "dist", main_dia: main.dia } }) : RC.slab_bars(0.0012 * 1000 * D / 2, D - cover - 10, D, false, { dias: [10, 12] });
    if (DT) DT.record(c, "top steel (nominal)", top);
    c.let("Top steel (nominal, both ways)", "", F(top.dia, "g") + "Ø @ " + F(top.spacing, "g") + " c/c", "", "IRC 112 cl 16.6");
    c.thumb("Slab depth", L * 1000 / 12, D, "mm", "span/12 to span/15 for solid slab decks", "MoRTH standard plans");
    c.miss("Substructure: abutments / piers, bed blocks and foundations", "IRC 78 / IRC 112", "Critical");
    c.miss("Expansion joints, drainage spouts, approach slabs", "IRC SP-69 / IRC 5", "Important");
    c.miss("Footpath live load (if footpaths provided) and wind on live load", "IRC 6 cl 206 / 209", "Advisory");
    c.miss("Construction-stage checks and creep / shrinkage deflection", "IRC 112 cl 12.4", "Advisory");
    // BBS & quantities
    var Lt = L + 0.5;
    var BB = DS.bbs, run = Lt * 1000 - 2 * cover, wid = B * 1000 - 2 * cover;
    var m1 = BB.stock(BB.ubar(main.dia, run, D - 2 * cover), main.dia, fck, fy);
    var t1 = BB.split(top.dia, run, fck, fy), d1 = BB.straight(dist.dia, wid), t2 = BB.straight(top.dia, wid);
    var bbs = [BB.row("Deck slab", "M1", main.dia, "U (90° end bends at deck ends)", BB.count(B * 1000, main.spacing, cover), m1, "main bottom @ " + F(main.spacing, "g")),
    BB.row("Deck slab", "D1", dist.dia, "straight", BB.count(Lt * 1000, dist.spacing, cover), d1, "distribution bottom @ " + F(dist.spacing, "g")),
    BB.row("Deck slab", "T1", top.dia, "straight", BB.count(B * 1000, top.spacing, cover), t1, "top longitudinal"),
    BB.row("Deck slab", "T2", top.dia, "straight", BB.count(Lt * 1000, top.spacing, cover), t2, "top transverse")];
    var qty = [Q("RCC M" + F(fck, "g") + " in deck slab (excl. steel & shuttering)", "cum", [row("Deck slab", 1, Lt, B, D / 1000)],
      null, CM.rcc_rate(fck)),
    Q("Centering & shuttering for deck slab (incl. staging)", "sqm", [row("Soffit", 1, Lt, B),
      row("Edges", 2, Lt, null, D / 1000)],
      null, 900.0),
    Q("Reinforcement TMT Fe" + F(fy, "g") + " for deck", "kg", kgRows(bbs), null, RATE.rebar),
    Q("RCC crash barrier M40 (New Jersey type)", "rm", [row("Both sides", 2, Lt)], null, RATE.crash_barrier),
    Q("Mastic asphalt / bituminous wearing coat", "sqm", [row("Carriageway", 1, Lt, cw)], null,
      RATE.wearing_coat),
    Q("Strip seal expansion joint", "rm", [row("Two ends", 2, B)], null, RATE.expansion_joint),
    Q("Drainage spouts 100 mm", "nos", [row("Spouts", 2 * Math.max(2, Math.ceil(Lt / 5)))], null, 3500.0)];
    // drawings
    var cs = new D_.View("Cross section");
    var Bm = B * 1000, Dm = D;
    cs.rect(0, 0, Bm, Dm, "OUTLINE", "concrete");
    [0, Bm - kerb * 1000].forEach(function (x0) {
      cs.poly(x0 === 0 ? [[x0, Dm], [x0 + kerb * 1000, Dm], [x0 + kerb * 1000 - 0.25 * kerb * 1000, Dm + 900],
        [x0 + 0.35 * kerb * 1000, Dm + 900]] :
        [[x0, Dm], [x0 + kerb * 1000, Dm], [x0 + 0.65 * kerb * 1000, Dm + 900], [x0 + 0.25 * kerb * 1000, Dm + 900]],
      true, "OUTLINE", "concrete");
    });
    cs.rect(kerb * 1000, Dm, cw * 1000, wc * 1000, "OUTLINE", "black");
    for (var k = 0; k < 25; k++)
      cs.bar_dot(cover + main.dia / 2 + (Bm - 2 * cover - main.dia) * k / 24, cover + main.dia / 2, main.dia);
    cs.line(cover, Dm - cover, Bm - cover, Dm - cover, "REBAR");
    cs.dim(0, 0, Bm, 0, 10, F(Bm, ",.0f"));
    cs.dim(kerb * 1000, Dm + wc * 1000, (kerb + cw) * 1000, Dm + wc * 1000, -14, "CARRIAGEWAY " + F(cw * 1000, ",.0f"));
    cs.dim(Bm, 0, Bm, Dm, -8);
    var ls = new D_.View("Longitudinal section");
    var Lm = Lt * 1000;
    ls.rect(0, 0, Lm, Dm, "OUTLINE", "concrete");
    [0, Lm - brg * 1000].forEach(function (x) {
      ls.rect(x === 0 ? x - 300 : x, -1500, brg * 1000 + 300, 1500, "HIDDEN");
    });
    ls.line(cover, cover + main.dia, Lm - cover, cover + main.dia, "REBAR");
    ls.dim(brg * 500, -1500, Lm - brg * 500, -1500, 12, "EFFECTIVE SPAN " + F(L * 1000, ",.0f"));
    ls.text(Lm / 2, Dm + 400, "MAIN " + F(main.dia, "g") + "Ø @ " + F(main.spacing, "g") + ", DIST " + F(dist.dia, "g") + "Ø @ " + F(dist.spacing, "g") + ", " +
      "TOP " + F(top.dia, "g") + "Ø @ " + F(top.spacing, "g") + " BOTH WAYS", 2.2, { anchor: "middle" });
    var sheet = new D_.Sheet("RCC solid slab bridge – superstructure", "BR-11", [cs, ls],
      ["Concrete M" + F(fck, "g") + ", steel Fe" + F(fy, "g") + ", cover " + F(cover, "g") + " mm.",
        "Design loading: IRC Class A (" + S(lanes) + " lane" + (lanes > 1 ? "s" : "") + ") / 70R tracked, whichever " +
        "governs; impact as per IRC 6 cl 208.",
        "Wearing coat " + F(wc * 1000, ".0f") + " mm; crash barriers " + F(num(inp.barrier_load), "g") + " kN/m each side.",
        "Bearings: tar-paper / elastomeric pads on bed blocks as per substructure drawing."]);
    var summary = { "Effective span": F(L, ".2f") + " m", "Slab": F(D, "g") + " mm (L/D = " + F(L * 1000 / D, ".1f") + ")",
      "Governing LL": a.MA >= a.M70 ? "Class A" : "70R tracked",
      "Main bars": F(main.dia, "g") + "Ø @ " + F(main.spacing, "g"), "Distribution": F(dist.dia, "g") + "Ø @ " + F(dist.spacing, "g"),
      "MEd": F(Med, ".0f") + " kN·m/m", "Max utilisation": F(c.max_utilisation, ".2f") };
    return C.DesignResult({ module: "slab_bridge", title: "RCC solid slab bridge", inputs: inp, calc: c, summary: summary,
      drawings: [sheet], quantities: qty, bbs: bbs, tables: {}, references: BR_REFS });
  }
  M.run_slab_bridge = run_slab_bridge;

  var SB_PARAMS = [
    P("clear_span", "Clear span", 7.0, "m", { min: 3, max: 12, step: 0.25, group: "Geometry" }),
    P("bearing", "Bearing width / c-c offset", 0.40, "m", { min: 0.2, max: 1.0, step: 0.05, group: "Geometry" }),
    P("carriageway", "Carriageway width", 7.5, "m", { min: 4.25, max: 11, step: 0.25, group: "Geometry" }),
    P("barrier_w", "Crash barrier width (each side)", 0.50, "m", { min: 0.45, max: 1.5, step: 0.05, group: "Geometry" }),
    P("barrier_load", "Crash barrier self-weight", 10.0, "kN/m", { min: 5, max: 15, group: "Loads" }),
    P("wc", "Wearing coat thickness", 65.0, "mm", { min: 40, max: 100, step: 5, group: "Loads" }),
    P("fck", "Concrete grade", 35.0, "N/mm²", { kind: "select", options: [30.0, 35.0, 40.0], group: "Materials" }),
    P("fy", "Steel fy", 500.0, "N/mm²", { kind: "select", options: [415.0, 500.0], group: "Materials" }),
    P("exposure", "Exposure", "Moderate", { kind: "select", options: Object.keys(DS.materials.EXPOSURE), group: "Materials" }),
    P("cover", "Clear cover", 40.0, "mm", { min: 30, max: 75, step: 5, group: "Materials" }),
    P("D", "Slab thickness (check)", 600.0, "mm", { min: 250, max: 1200, step: 25, group: "My design", modes: ["check"] }),
    P("bar_dia", "Main bar dia (check)", 25.0, "mm", { kind: "select", options: [16.0, 20.0, 25.0, 32.0],
      group: "My design", modes: ["check"] }),
    P("bar_s", "Main bar spacing (check)", 100.0, "mm", { min: 75, max: 250, step: 5, group: "My design", modes: ["check"] })
  ];
  M.SB_PARAMS = SB_PARAMS;
  C.register({ id: "slab_bridge", phase: 4, category: "Bridges & frames", name: "RCC solid slab bridge", icon: "🌁",
    description: "Simply supported deck slab: IRC Class A (1 or 2 lanes) and 70R tracked with impact and effective " +
      "width, ULS/SLS combinations, flexure, crack width, shear, distribution steel, quantities.",
    params: SB_PARAMS, run: run_slab_bridge, references: BR_REFS, modes: ["design", "check"] });

  /* =========================================================================== T-BEAM BRIDGE (Courbon) */
  function run_tbeam(inp, mode) {
    var LD = DS.loads, RC = DS.rcc, CM = DS.common, D_ = DS.drawing, MT = DS.materials, row = CM.row, Q = CM.Q, B_ = CM.B, RATE = CM.RATE;
    var bar_area = MT.bar_area;
    var c = new C.Calc("T-beam girder bridge");
    var fck = num(inp.fck), fy = num(inp.fy);
    var L = num(inp.span);
    var n = Math.trunc(num(inp.girders));
    var s = num(inp.spacing);
    var cw = num(inp.carriageway);
    var kerb = num(inp.barrier_w);
    var B = cw + 2 * kerb;
    var ts = num(inp.deck_t) / 1000;
    var bw = num(inp.web) / 1000;
    var wc = 0.065;
    var cover = num(inp.cover);
    c.section("Geometry");
    c.let("Effective span", "L", L, "m");
    c.let("Girders × spacing", "n × s", S(n) + " × " + F(s, "g"), "m");
    c.let("Overall deck width", "B", B, "m");
    c.ok("Girders span the deck width", (n - 1) * s <= B, { detail: "(n−1)s = " + F((n - 1) * s, ".2f") + " ≤ B = " + F(B, ".2f") + " m", clause: "" });
    var D = mode === "check" ? num(inp.D) / 1000 : C.ceil_to(Math.max(L / 11, 0.9), 0.05);
    var xs = C.range(n).map(function (i) { return (i - (n - 1) / 2) * s; });
    var sx2 = C.sum(xs.map(function (x) { return x * x; }));
    c.section("Courbon's method – load distribution");
    c.ok("Courbon applicable (L/B ≥ 2 and stiff cross girders)", L / B >= 2.0, { detail: "L/B = " + F(L / B, ".2f"), clause: "Courbon / Victor",
      warn_only: true });
    var lanes = class_a_lanes(cw);
    c.let("Lanes of Class A", "n", lanes, "", "IRC 6 Table 6", "carriageway " + F(cw, "g") + " m: < 5.3 m → 1, 5.3–9.6 m → 2, ≥ 9.6 m → 3 lanes" +
      (lanes > 2 ? "; 10 % reduction for 3 lanes (IRC 6 cl 204.4)" : ""));
    // Class A placed as close to the left kerb as permitted; 1 … lanes trains, the larger share per girder governs
    var x_first = -B / 2 + kerb + 0.15 + 0.25;
    var DFA = xs.map(function () { return 0; }), eA = 0, kA = 1;
    for (var kl = 1; kl <= lanes; kl++) {
      var wheels = train_lines(x_first, kl), ek = C.sum(wheels) / wheels.length;
      xs.forEach(function (x, i) {        // Courbon: R_i = ΣP (1/n + e·x_i / Σx²)
        var f = lane_reduction(kl) * kl * (1 / n + ek * x / sx2);
        if (f > DFA[i]) { DFA[i] = f; if (i === 0) { eA = ek; kA = kl; } }
      });
    }
    // 70R tracked near kerb (1.2 m clearance)
    var x70 = -B / 2 + kerb + 1.2 + 0.42 + 1.03;
    var DF70 = xs.map(function (x) { return (1 / n + x70 * x / sx2); });
    var tbl = C.table({ "Girder": C.range(n).map(function (i) { return "G" + (i + 1); }), "x (m)": xs,
      "Class A factor": DFA, "70R factor": DF70 });
    var gi = 0;
    for (var i0 = 1; i0 < n; i0++) if (Math.max(DFA[i0], DF70[i0]) > Math.max(DFA[gi], DF70[gi])) gi = i0;
    c.calc("Eccentricity of Class A wheels from deck centre", "e", "ev", "m", "", { ev: R(eA, 3) });
    c.calc("Reaction factor of outer girder (Class A, " + S(kA) + " lane" + (kA > 1 ? "s" : "") + ")", "RA", "red*nl*(1/n + e*x/sx2)", "", "Courbon / IRC 6 cl 204.4",
      { red: lane_reduction(kA), nl: kA, n: n, e: R(eA, 3), x: R(xs[0], 3), sx2: R(sx2, 3) });
    c.calc("Reaction factor of outer girder (70R)", "R70", "1/n + e*x/sx2", "", "Courbon", { n: n, e: R(x70, 3),
      x: R(xs[0], 3), sx2: R(sx2, 3) });
    var overhang = (B - (n - 1) * s) / 2;          // deck cantilever beyond the outer girder axis

    /* actions on girder i: dead load from its tributary width (outer: overhang + s/2 with the full crash barrier;
       inner: s), surfacing on the carriageway part only, half / full cross-girder bays; LL by Courbon factors */
    function girder_i(D, i) {
      var outer = i === 0 || i === n - 1;
      var trib = outer ? overhang + s / 2 : s;
      var trib_wc = outer ? Math.max(trib - kerb, 0) : s;
      var g_slab = trib * ts * 25, g_wc = trib_wc * wc * 22;
      var g_web = bw * (D - ts) * 25;
      var g_bar = outer ? num(inp.barrier_load) : 0.0;
      var g = g_slab + g_wc + g_web + g_bar;
      var n_cross = Math.trunc(num(inp.cross_girders));
      var Pcg = (outer ? 0.5 : 1.0) * (s - bw) * num(inp.cross_web) / 1000 * (0.8 * D - ts) * 25;
      var Mdl = g * Math.pow(L, 2) / 8 + (n_cross >= 3 ? Pcg * L / 4 : 0);
      var Vdl = g * L / 2 + Pcg * (n_cross >= 3 ? 1.5 : 1);
      var Mwc = g_wc * Math.pow(L, 2) / 8, Vwc = g_wc * L / 2;
      var dfA = DFA[i], df70 = DF70[i];
      var mv = LD.max_moment_moving(LD.CLASS_A.axles, LD.CLASS_A.spacing, L), Mtr = mv[0], Vtr = mv[1];
      var IA = LD.impact_class_a(L);
      var MA = Mtr * (1 + IA) * dfA;                    // train moment × impact × Courbon share of the outer girder
      var lt = LD.CLASS_70R_TRACKED.length;
      var M70 = 700 * (2 * L - lt) / 8 * (1 + LD.impact_70r_tracked(L)) * df70;
      var V70 = 700 * (1 - lt / 2 / L) * (1 + LD.impact_70r_tracked(L)) * Math.max(df70, 0.5);
      var VA = Vtr * (1 + IA) * Math.max(dfA, 0.5);
      var Mll = Math.max(MA, M70), Vll = Math.max(VA, V70);
      return { i: i, outer: outer, trib: trib, trib_wc: trib_wc, g_slab: g_slab, g_wc: g_wc, g_web: g_web, g_bar: g_bar, Pcg: Pcg,
        g: g, Mdl: Mdl, Vdl: Vdl, Mwc: Mwc, Vwc: Vwc, MA: MA, M70: M70, Mll: Mll, Vll: Vll, IA: IA, Mtr: Mtr,
        Med: 1.35 * (Mdl - Mwc) + 1.75 * Mwc + 1.5 * Mll, Ved: 1.35 * (Vdl - Vwc) + 1.75 * Vwc + 1.5 * Vll, Ms: Mdl + 0.75 * Mll };
    }
    /* governing girder (largest ULS moment) */
    function girder(D) {
      var best = null;
      for (var i = 0; i < n; i++) { var a = girder_i(D, i); if (!best || a.Med > best.Med + 1e-9) best = a; }
      return best;
    }
    var BAR_PITCH = 32 + Math.max(32, 25);       // 32Ø bars, clear gap ≥ max(Ø, agg + 5) both ways (IRC 112 cl 16.2.2)
    var per_layer = Math.max(2, Math.floor((bw * 1000 - 2 * cover - 24 + Math.max(32, 25)) / BAR_PITCH));
    /* effective depth for nb 32Ø bars in layers of per_layer (centroid of the layers above the links) */
    function d_for(D, nb) {
      var left = nb, k = 0, sm = 0;
      while (left > 0) { var m = Math.min(per_layer, left); sm += m * (16 + k * BAR_PITCH); left -= m; k++; }
      return D * 1000 - cover - 12 - sm / nb;
    }

    var bf = Math.min(L / 6 * 1000 + bw * 1000 + 6 * ts * 1000, s * 1000);

    function design(cc, D, given) {
      var a = girder(D);
      // bars ↔ effective depth: iterate until the number of 32Ø bars (and so the layers) is stable
      var nb = given || 4, d = d_for(D, nb);
      if (!given) {
        for (var kk = 0; kk < 10; kk++) {
          var disc = 1 - 4.6 * a.Med * 1e6 / (fck * bf * d * d);
          var nb2 = Math.max(4, Math.ceil(0.5 * fck / fy * (1 - Math.sqrt(Math.max(disc, 0))) * bf * d / bar_area(32)));
          if (nb2 <= nb) break;
          nb = nb2; d = d_for(D, nb);
        }
      }
      var nlay = Math.ceil(nb / per_layer);
      cc.section("Girder flexure (T-section)");
      cc.calc("Effective depth (" + S(nb) + "-32Ø in " + S(nlay) + " layer" + (nlay > 1 ? "s" : "") + ")", "d", "D - c - 12 - ybar", "mm",
        "IRC 112 cl 16.2.2", S(Math.min(per_layer, nb)) + " bars per layer in the " + F(bw * 1000, ".0f") + " web, 12Ø links; ybar = bar-group centroid",
        { D: R(D * 1000), c: cover, ybar: R(D * 1000 - cover - 12 - d, 1) });
      cc.calc("Effective flange width", "bf", "min(L*1000/6 + bw + 6*Df, s*1000)", "mm", "IS 456 cl 23.1.2 / IRC 112 cl 7.6.1.2",
        { L: L, bw: bw * 1000, Df: ts * 1000, s: s });
      var Med = cc.calc("ULS moment on girder", "MEd", "1.35*(Mg - Mwc) + 1.75*Mwc + 1.5*Mq", "kN·m", "IRC 6 Table B.2 / Table 3.2",
        "surfacing ×1.75", { Mg: R(a.Mdl, 1), Mwc: R(a.Mwc, 1), Mq: R(a.Mll, 1) });
      var xu_fl = 0.87 * fy * 1 / (0.36 * fck * bf);     // eslint-disable-line no-unused-vars
      var Mf = 0.36 * fck * bf * ts * 1000 * (d - 0.42 * ts * 1000) / 1e6;
      cc.check("Neutral axis within flange (Mu ≤ Mu,flange)", Med, Mf, { unit: "kN·m", clause: "IS 456 Annex G-2.2" });
      var Ast = cc.calc("Tension steel (NA in flange)", "Ast", "0.5*fck/fy*(1 - sqrt(1 - 4.6*Mu*1e6/(fck*bf*d**2)))*bf*d",
        "mm²", "IS 456 Annex G-1.1(b)", { fck: fck, fy: fy, Mu: R(Med, 1), bf: R(bf), d: R(d) });
      cc.let("Main bars", "", S(nb) + "-32Ø (in " + S(nlay) + " layer" + (nlay > 1 ? "s" : "") + ", " + S(Math.min(per_layer, nb)) + " per layer)", "", "IRC 112 cl 16.2",
        "As = " + F(nb * bar_area(32), ".0f") + " mm²");
      cc.check("Steel provided ≥ required", nb * bar_area(32), Ast, { unit: "mm²", clause: "", mode: ">=" });
      RC.crack_width(cc, a.Ms, bw * 1000, D * 1000, d, nb * bar_area(32), cover + 12, 32,
        Math.max((bw * 1000 - 2 * cover - 24 - 32) / Math.max(Math.min(nb, per_layer) - 1, 1), 50), fck, 0.3, { tag: "(girder)" });
      cc.section("Girder shear");
      var Ved = cc.calc("ULS shear at support", "VEd", "1.35*(Vg - Vwc) + 1.75*Vwc + 1.5*Vq", "kN", "IRC 6 Table B.2 / Table 3.2",
        { Vg: R(a.Vdl, 1), Vwc: R(a.Vwc, 1), Vq: R(a.Vll, 1) });
      var z = 0.9 * d;
      // strut angle: the flattest permitted (cot θ = 2.5) unless the strut would crush – then the cot θ (≥ 1) at which
      // VRd,max = VEd; links and VRd,max use the same θ (IRC 112 cl 10.3.3.2, Eq. 10.7 / 10.8 with αcw = 1)
      var Kc = 0.6 * (1 - fck / 310) * 0.446 * fck * bw * 1000 * z / 1000, r_ = Kc / Math.max(Ved, 1e-6);
      var cot = r_ >= 2.9 ? 2.5 : r_ >= 2 ? (r_ + Math.sqrt(r_ * r_ - 4)) / 2 : 1.0;
      cot = cc.calc("Strut angle adopted", "cot θ", "c", "", "IRC 112 cl 10.3.3.2", "1 ≤ cot θ ≤ 2.5; flattest strut that does not crush",
        { c: R(Math.min(Math.max(cot, 1), 2.5), 3) });
      var VRmax = cc.calc("Max. shear (strut crushing, cot θ = " + F(cot, "g") + ")", "VRd,max",
        "0.6*(1 - fck/310)*0.446*fck*bw*z/(cot + 1/cot)/1000", "kN", "IRC 112 cl 10.3.3.2",
        { fck: fck, bw: bw * 1000, z: R(z), cot: cot });
      cc.check("VEd ≤ VRd,max", Ved, VRmax, { unit: "kN", clause: "IRC 112 cl 10.3.3.2" });
      var Asv_s = cc.calc("Shear links required (cot θ = " + F(cot, "g") + ")", "Asw/s", "Ved*1000/(z*0.87*fy*cot)", "mm²/mm",
        "IRC 112 cl 10.3.3.2", { Ved: R(Ved, 1), z: R(z), fy: fy, cot: cot });
      var legs = bw <= 0.35 ? 2 : 4;
      var sv = Math.max(Math.min(Math.floor(legs * bar_area(12) / Math.max(Asv_s, 1e-6) / 10) * 10, 300, 0.75 * d), 75);
      cc.let("Links adopted", "", S(legs) + "L-12Ø @ " + F(sv, "g") + " c/c near supports", "", "IRC 112 cl 16.5.2");
      return [a, Ast, nb, sv, legs, d, nlay];
    }

    if (mode !== "check") {
      for (var it = 0; it < 40; it++) {
        var sc = new C.Calc("s");
        design(sc, D);
        if (!sc.failures.length) break;
        D = R(D + 0.05, 3);
      }
    }
    c.let("Girder overall depth", "D", R(D * 1000), "mm");
    c.section("Girder loads");
    var a0 = girder(D);
    c.let("Governing girder", "", "G" + S(a0.i + 1) + (a0.outer ? " (outer)" : " (inner)"), "", "Courbon",
      "largest ULS moment of all girders; tributary width " + F(a0.trib, ".2f") + " m" + (a0.outer ? " = overhang " + F(overhang, ".2f") + " + s/2" : " = s"));
    c.calc("Dead load on governing girder", "g", "ts*25*bt + wc*22*bwc + bw*(D - ts)*25 + Wb", "kN/m", "IRC 6 cl 203",
      "deck over tributary width bt, surfacing over its carriageway part bwc, web, crash barrier (outer girder: full)",
      { ts: ts, bt: R(a0.trib, 3), wc: wc, bwc: R(a0.trib_wc, 3), bw: bw, D: D, Wb: a0.g_bar });
    c.calc("Impact (Class A)", "IF", "4.5/(6 + L)", "", "IRC 6 cl 208", { L: L });
    c.let("Max. moment of one Class A train", "Mtrain", R(a0.Mtr, 1), "kN·m", "train scan");
    c.let("LL moment on governing girder – Class A / 70R", "MLL", F(a0.MA, ".0f") + " / " + F(a0.M70, ".0f"), "kN·m");
    var dr = design(c, D, mode === "check" ? Math.trunc(num(inp.n32)) : null);
    var a = dr[0], nb = dr[2], sv = dr[3], legs = dr[4];
    if (per_layer < 3 || dr[6] > 4)
      c.warn("Web width for main bars", "only " + S(per_layer) + " × 32Ø fit per layer in a " + F(bw * 1000, ".0f") + " mm web → " + S(dr[6]) +
        " layers: the lever arm and crack control suffer – widen the web / provide a bottom bulb (≥ 300–400 mm)", "IRC 112 cl 16.2.2 / MoRTH plans");
    // deck slab (simplified, between girders)
    c.section("Deck slab between girders (simplified)");
    var l0 = s - bw;
    var alpha = 2.6;
    var beff = c.calc("Effective width of wheel (continuous slab)", "beff", "alpha*a*(1 - a/l0) + b1", "m",
      "IRC 112 Annex B3", { alpha: alpha, a: l0 / 2, l0: l0, b1: 0.5 + 2 * wc });
    var Mll = c.calc("LL moment (57 kN wheel, continuity 0.8)", "Mq", "0.8*57*(1 + IF)*l0/4/beff", "kN·m/m", "",
      { IF: R(Math.min(0.5, LD.impact_class_a(l0)), 3), l0: R(l0, 3), beff: R(beff, 3) });
    var Mdl = c.calc("DL moment", "Mg", "(25*t + 22*wc)*l0**2/10", "kN·m/m", "", { t: ts, wc: wc, l0: R(l0, 3) });
    var deck = RC.design_strip(c, 1.35 * Mdl + 1.5 * Mll, ts * 1000, cover, fck, fy, "deck slab (top & bottom)",
      Mdl + 0.75 * Mll, 0.3, null, null, { dia_pref: [12, 16, 20], smax: 200,
        rule: DS.detailing ? { member: "bridge_slab", role: "main" } : null });
    c.thumb("Girder depth", L * 1000 / 11, D * 1000, "mm", "span/10 to span/12", "Victor / MoRTH plans");
    c.thumb("Girder spacing", 2500, s * 1000, "mm", "2.0–3.0 m", "Practice");
    c.miss("Deck slab panels by Pigeaud's method (two-way action) – simplified one-way check used here",
      "IRC 112 Annex B / Pigeaud", "Important");
    c.miss("Cross-girder design and girder curtailment of bars", "IRC 112", "Important");
    c.miss("Bearings (elastomeric) design, expansion joints and substructure", "IRC 83 Part II / IRC 78", "Critical");
    c.miss("Deflection / camber and long-term effects", "IRC 112 cl 12.4", "Advisory");
    // quantities
    var n_cross = Math.trunc(num(inp.cross_girders));
    /* eslint-disable no-unused-vars */
    var vol_deck = (L + 0.6) * B * ts;
    var vol_girders = n * (L + 0.6) * bw * (D - ts);
    var vol_cross = n_cross * (n - 1) * (s - bw) * num(inp.cross_web) / 1000 * (0.8 * D - ts);
    var steel_girder = n * (nb * (L + 1.0) * bar_area(32) * 7850e-6 * 1.05 + Math.ceil(L * 1000 / sv) * legs *
      2 * (bw + D) * bar_area(12) * 7850e-6);
    /* eslint-enable no-unused-vars */
    // BBS (DS.bbs): main bars 32Ø with 90° anchorage bends at the girder ends, lapped beyond 12 m stock; closed links;
    // deck bars transverse top & bottom; longitudinal distribution 12Ø @ 200 in stock pieces
    var BB = DS.bbs, Lg = (L + 0.6) * 1000 - 2 * cover;
    var g1 = BB.stock(BB.ubar(32, Lg, Math.min(BB.leg(32), D * 1000 - 2 * cover)), 32, fck, fy);
    var g2 = BB.stirrup(12, bw * 1000, D * 1000, cover);
    var s1 = BB.straight(deck.dia, B * 1000 - 2 * cover), s2 = BB.split(12, (L + 0.5) * 1000 - 2 * cover, fck, fy);
    var bbs = [BB.row("Girder", "G1", 32, "U (90° anchorage bends)", n * nb, g1, "main bottom" + (g1.laps ? ", laps staggered (≤ 50 % at a section)" : "")),
      BB.row("Girder", "G2", 12, "closed links, 135° hooks", n * (Math.ceil(L * 1000 / sv) + 1), g2, S(legs) + "L @ " + F(sv, "g") + " (ends)"),
      BB.row("Deck slab", "S1", deck.dia, "straight", 2 * BB.count((L + 0.6) * 1000, deck.spacing, cover), s1, "transverse top & bottom"),
      BB.row("Deck slab", "S2", 12, "straight", 2 * BB.count(B * 1000, 200, cover), s2, "longitudinal distribution 12Ø @ 200")];
    var qty = [Q("RCC M" + F(fck, "g") + " in T-beam superstructure", "cum",
      [row("Deck slab", 1, L + 0.6, B, ts), row("Girder webs", n, L + 0.6, bw, D - ts),
        row("Cross girders", n_cross * (n - 1), s - bw, num(inp.cross_web) / 1000, 0.8 * D - ts)], null,
      CM.rcc_rate(fck)),
    Q("Centering, shuttering & staging for T-beam deck", "sqm",
      [row("Deck soffit", 1, L + 0.6, B), row("Girder sides", 2 * n, L + 0.6, null, D - ts)], null, 1100.0),
    Q("Reinforcement TMT Fe" + F(fy, "g") + " for superstructure", "kg", kgRows(bbs), null, RATE.rebar),
    Q("Elastomeric bearings – supply & installation", "cc",
      [row("Bearings", 2 * n, 400, 250, 56)], null, RATE.bearing_elast),
    Q("RCC crash barrier (New Jersey)", "rm", [row("Both sides", 2, L + 0.6)], null, RATE.crash_barrier),
    Q("Wearing coat", "sqm", [row("Carriageway", 1, L + 0.6, cw)], null, RATE.wearing_coat),
    Q("Strip seal expansion joint", "rm", [row("Two ends", 2, B)], null, RATE.expansion_joint)];
    var cs = new D_.View("Cross section at mid-span");
    var Bm = B * 1000;
    cs.rect(0, D * 1000 - ts * 1000, Bm, ts * 1000, "OUTLINE", "concrete");
    var x0 = (Bm - (n - 1) * s * 1000) / 2;
    for (var i = 0; i < n; i++) {
      var xc = x0 + i * s * 1000;
      cs.rect(xc - bw * 500, 0, bw * 1000, D * 1000 - ts * 1000, "OUTLINE", "concrete");
      for (var lyr = 0, left = nb; left > 0; lyr++) {
        var inl = Math.min(per_layer, left); left -= inl;
        for (var k = 0; k < inl; k++)
          cs.bar_dot(xc - bw * 500 + cover + 28 + k * (bw * 1000 - 2 * cover - 56) / Math.max(inl - 1, 1),
            cover + 28 + lyr * BAR_PITCH, 32);
      }
    }
    cs.dim(0, D * 1000, Bm, D * 1000, -10, F(Bm, ",.0f"));
    cs.dim(Bm + 300, 0, Bm + 300, D * 1000, -6);
    cs.text(Bm / 2, -500, S(n) + " GIRDERS @ " + F(s * 1000, ",.0f") + " c/c, WEB " + F(bw * 1000, ".0f") + ", " + S(nb) + "-32Ø EACH; DECK " + F(ts * 1000, ".0f") + " " +
      "WITH " + F(deck.dia, "g") + "Ø @ " + F(deck.spacing, "g"), 2.2, { anchor: "middle" });
    var el = new D_.View("Girder elevation");
    el.rect(0, 0, L * 1000, D * 1000, "OUTLINE", "concrete");
    el.line(cover, cover + 16, L * 1000 - cover, cover + 16, "REBAR");
    for (var kc = 0; kc < n_cross; kc++) {
      var x = L * 1000 * kc / Math.max(n_cross - 1, 1);
      el.rect(x - 150, 0.2 * D * 1000, 300, 0.8 * D * 1000 - ts * 1000, "HIDDEN");
    }
    el.dim(0, 0, L * 1000, 0, 12, "EFFECTIVE SPAN " + F(L * 1000, ",.0f"));
    var sheet = new D_.Sheet("T-beam girder bridge – superstructure", "BR-21", [cs, el],
      ["Concrete M" + F(fck, "g") + ", steel Fe" + F(fy, "g") + ", cover " + F(cover, "g") + " mm.",
        "Live load: IRC Class A (" + S(lanes) + " lane(s)) / 70R; Courbon distribution (G" + S(a.i + 1) + " governs).",
        S(n_cross) + " cross girders, web " + F(num(inp.cross_web), "g") + " mm.",
        "Main bars " + S(nb) + "-32Ø in " + S(dr[6]) + " layer(s) of " + S(Math.min(per_layer, nb)) + "; curtail as per bending moment envelope with Ld beyond."]);
    var summary = { "Girders": S(n) + " × " + F(s, "g") + " m, D = " + F(D * 1000, ".0f") + ", bw = " + F(bw * 1000, ".0f") + " mm",
      "Governing girder MEd": "G" + S(a.i + 1) + (a.outer ? " (outer) " : " ") + F(a.Med, ",.0f") + " kN·m", "Main steel": S(nb) + "-32Ø",
      "Links": S(legs) + "L-12Ø @ " + F(sv, "g"), "Deck slab": F(ts * 1000, ".0f") + " mm, " + F(deck.dia, "g") + "Ø @ " + F(deck.spacing, "g"),
      "Max utilisation": F(c.max_utilisation, ".2f") };
    return C.DesignResult({ module: "tbeam_bridge", title: "T-beam girder bridge", inputs: inp, calc: c, summary: summary,
      drawings: [sheet], quantities: qty, bbs: bbs, tables: { "Courbon distribution factors": tbl }, references: BR_REFS });
  }
  M.run_tbeam = run_tbeam;

  var TB_PARAMS = [
    P("span", "Effective span", 16.0, "m", { min: 10, max: 25, step: 0.5, group: "Geometry" }),
    P("girders", "Number of girders", 3, { kind: "int", min: 3, max: 5, group: "Geometry" }),
    P("spacing", "Girder spacing", 2.5, "m", { min: 1.8, max: 3.2, step: 0.1, group: "Geometry" }),
    P("carriageway", "Carriageway width", 7.5, "m", { min: 5.5, max: 11, step: 0.25, group: "Geometry" }),
    P("barrier_w", "Crash barrier width", 0.5, "m", { min: 0.45, max: 1.5, step: 0.05, group: "Geometry" }),
    P("deck_t", "Deck slab thickness", 220.0, "mm", { min: 180, max: 300, step: 10, group: "Geometry" }),
    P("web", "Girder web width", 350.0, "mm", { min: 250, max: 500, step: 25, group: "Geometry" }),
    P("cross_girders", "Number of cross girders", 3, { kind: "int", min: 2, max: 5, group: "Geometry" }),
    P("cross_web", "Cross girder web width", 250.0, "mm", { min: 200, max: 400, step: 25, group: "Geometry" }),
    P("barrier_load", "Crash barrier self-weight", 10.0, "kN/m", { min: 5, max: 15, group: "Loads" }),
    P("fck", "Concrete grade", 35.0, "N/mm²", { kind: "select", options: [35.0, 40.0, 45.0], group: "Materials" }),
    P("fy", "Steel fy", 500.0, "N/mm²", { kind: "select", options: [415.0, 500.0], group: "Materials" }),
    P("cover", "Clear cover", 40.0, "mm", { min: 30, max: 75, step: 5, group: "Materials" }),
    P("D", "Girder depth (check)", 1500.0, "mm", { min: 800, max: 2500, step: 50, group: "My design", modes: ["check"] }),
    P("n32", "Number of 32Ø main bars (check)", 12, { kind: "int", min: 4, max: 30, group: "My design", modes: ["check"] })
  ];
  M.TB_PARAMS = TB_PARAMS;
  C.register({ id: "tbeam_bridge", phase: 4, category: "Bridges & frames", name: "T-beam girder bridge (Courbon)", icon: "🌉",
    description: "RCC T-beam superstructure: Courbon distribution for Class A / 70R, outer-girder flexure, IRC 112 " +
      "shear links and crack width, simplified deck slab, quantities.", params: TB_PARAMS, run: run_tbeam, references: BR_REFS,
    modes: ["design", "check"] });

  /* =========================================================================== MULTI-STOREY FRAME */
  function run_frame(inp, mode) {     // eslint-disable-line no-unused-vars
    var LD = DS.loads, RC = DS.rcc, CM = DS.common, D_ = DS.drawing, MT = DS.materials, FR = DS.frame2d;
    var row = CM.row, Q = CM.Q, B_ = CM.B, RATE = CM.RATE, bar_area = MT.bar_area;
    var c = new C.Calc("Multi-storey RCC frame");
    var fck = num(inp.fck), fy = 500.0;
    var nb_ = Math.trunc(num(inp.bays)), ns = Math.trunc(num(inp.storeys));
    var bay = num(inp.bay);
    var h1 = num(inp.h_ground), h = num(inp.h_typical);
    var bb = num(inp.beam_b), bD = num(inp.beam_D);
    var cb = num(inp.col_b), cD = num(inp.col_D);
    var trib = num(inp.frame_spacing);
    var Ec = 5000 * Math.sqrt(fck) * 1000;
    var f = new FR.Frame();
    var levels = [0.0], k, i;
    for (k = 0; k < ns; k++) levels.push(levels[levels.length - 1] + (k === 0 ? h1 : h));
    var nodes = levels.map(function (y) { return C.range(nb_ + 1).map(function (i) { return f.node(i * bay, y); }); });
    var cols = [], beams = [];
    for (k = 0; k < ns; k++) {
      for (i = 0; i < nb_ + 1; i++)
        cols.push([k, i, f.member(nodes[k][i], nodes[k + 1][i], Ec, cb * cD / 1e6, 0.70 * cb * Math.pow(cD, 3) / 12 / 1e12,
          { name: "C" + (k + 1) + "-" + (i + 1), group: "column" })]);
      for (i = 0; i < nb_; i++)
        beams.push([k + 1, i, f.member(nodes[k + 1][i], nodes[k + 1][i + 1], Ec, bb * bD / 1e6,
          0.35 * bb * Math.pow(bD, 3) / 12 / 1e12,
          { name: "B" + (k + 1) + "-" + (i + 1), group: "beam" })]);
    }
    for (i = 0; i < nb_ + 1; i++) f.support(nodes[0][i], true, true, true);
    c.section("Model");
    c.let("Frame", "", S(nb_) + " bays × " + F(bay, "g") + " m, " + S(ns) + " storeys (ground " + F(h1, "g") + " m, typical " + F(h, "g") + " m)", "");
    c.info("Stiffness", "Cracked section: beams 0.35 Ig, columns 0.70 Ig", "IS 1893-1 cl 6.4.3.1");
    var floor_dl = num(inp.floor_dl), floor_ll = num(inp.floor_ll);
    var roof_dl = num(inp.roof_dl), roof_ll = num(inp.roof_ll);
    var wall = num(inp.wall);
    c.section("Gravity loads (on beams, per m)");
    var wDL = c.calc("Floor DL on beam (slab + finishes) + wall + beam self", "wD", "gd*s + wall + 25*b*(D - 130)/1e6",
      "kN/m", "IS 875-1", { gd: floor_dl, s: trib, wall: wall, b: bb, D: bD });
    var wLL = c.calc("Floor imposed load on beam", "wL", "q*s", "kN/m", "IS 875-2", { q: floor_ll, s: trib });
    var wDLr = roof_dl * trib + 25 * bb * (bD - 130) / 1e6 + 0.3 * wall;
    var wLLr = roof_ll * trib;
    var DL = new FR.LoadCase("DL"), LL = new FR.LoadCase("LL");
    beams.forEach(function (t) {
      var roof = t[0] === ns;
      DL.add_member(t[2], ["udl", 0, -(roof ? wDLr : wDL)]);
      LL.add_member(t[2], ["udl", 0, -(roof ? wLLr : wLL)]);
    });
    cols.forEach(function (t) { DL.add_member(t[2], ["gudl", 0, -25 * cb * cD / 1e6, "length"]); });
    // seismic weight per floor
    c.section("Seismic load (IS 1893-1:2016, equivalent static)");
    var Wf = [];
    for (var lev = 1; lev <= ns; lev++) {
      var roof = lev === ns;
      var wd = (roof ? wDLr : wDL) * bay * nb_;
      var wl = (roof ? wLLr : wLL) * bay * nb_;
      var frac = roof ? 0 : (floor_ll <= 3 ? 0.25 : 0.5);
      var hc = lev > 1 ? (lev < ns ? h : h / 2) : (ns > 1 ? h1 / 2 + h / 2 : h1 / 2);
      var wcol = (nb_ + 1) * 25 * cb * cD / 1e6 * hc;
      Wf.push(wd + frac * wl + wcol);
    }
    var W = C.sum(Wf);
    var Ht = levels[levels.length - 1];
    c.calc("Seismic weight of frame", "W", "w", "kN", "IS 1893-1 cl 7.4",
      "DL + 25 % LL (≤ 3 kN/m²) / 50 % (> 3 kN/m²); roof LL excluded", { w: R(W, 1) });
    var infill = inp.infill === "With masonry infill";
    var T;
    if (infill)
      T = c.calc("Natural period (with infill)", "Ta", "0.09*H/sqrt(d)", "s", "IS 1893-1 cl 7.6.2(c)", { H: Ht,
        d: nb_ * bay });
    else
      T = c.calc("Natural period (bare RC MRF)", "Ta", "0.075*H**0.75", "s", "IS 1893-1 cl 7.6.2(a)", { H: Ht });
    var Z = LD.ZONE_Z[inp.zone];
    var I_ = LD.IMPORTANCE[inp.importance];
    var Rf = LD.R_FACTOR[inp.system];
    var Sa = LD.sa_by_g(T, inp.soil, true);
    c.let("Spectral acceleration (equivalent static)", "Sa/g", R(Sa, 3), "", "IS 1893-1:2016 cl 6.4.2(a)",
      "soil " + inp.soil + ", T = " + F(T, ".3f") + " s; T < 0.1 s → 2.5 for the equivalent static method");
    var Ah = c.calc("Design horizontal acceleration coefficient", "Ah", "Z/2*I/R*Sa", "", "IS 1893-1 cl 6.4.2",
      { Z: Z, I: I_, R: Rf, Sa: R(Sa, 3) });
    var Vb = c.calc("Design base shear", "VB", "Ah*W", "kN", "IS 1893-1 cl 7.5.3", { Ah: R(Ah, 4), W: R(W, 1) });
    var hs = levels.slice(1);
    var den = C.sum(Wf.map(function (w, j) { return w * Math.pow(hs[j], 2); }));
    var EL = new FR.LoadCase("EL");
    var Qs = [];
    Wf.forEach(function (w, j) {
      var lv = j + 1, hh = hs[j];
      var Qv = Vb * w * Math.pow(hh, 2) / den;
      Qs.push(Qv);
      EL.add_nodal(nodes[lv][0], Qv, 0, 0);
    });
    c.info("Lateral forces Qi = VB wi hi² / Σ wj hj²", Qs.map(function (q, j) { return "F" + (j + 1) + ": " + F(q, ".1f"); }).join(", ") + " kN",
      "IS 1893-1 cl 7.6.3");
    var cc = FR.combine_cases;
    var combos = { "1.5(DL+LL)": cc([DL, LL], [1.5, 1.5], ""),
      "1.2(DL+LL+EL)": cc([DL, LL, EL], [1.2, 1.2, 1.2], ""),
      "1.2(DL+LL−EL)": cc([DL, LL, EL], [1.2, 1.2, -1.2], ""),
      "1.5(DL+EL)": cc([DL, EL], [1.5, 1.5], ""), "1.5(DL−EL)": cc([DL, EL], [1.5, -1.5], ""),
      "0.9DL+1.5EL": cc([DL, EL], [0.9, 1.5], ""), "0.9DL−1.5EL": cc([DL, EL], [0.9, -1.5], "") };
    var ckeys = Object.keys(combos);
    var res = {};
    ckeys.forEach(function (key) { res[key] = f.solve(combos[key]); });
    var resList = ckeys.map(function (key) { return res[key]; });
    var rEL = f.solve(EL);
    c.info("Load combinations", ckeys.join("; "), "IS 456 Table 18 / IS 1893-1 cl 6.3");
    c.section("Storey drift (IS 1893-1 cl 7.11.1)");
    var worst = 0.0;
    for (k = 0; k < ns; k++) {
      var d1 = rEL.disp(nodes[k + 1][0])[0];
      var d0 = rEL.disp(nodes[k][0])[0];
      var hk0 = levels[k + 1] - levels[k];
      var ratio = Math.abs(d1 - d0) / hk0;
      worst = Math.max(worst, ratio);
    }
    c.check("Max. storey drift ratio ≤ 0.004", worst, 0.004, { unit: "", clause: "IS 1893-1 cl 7.11.1" });
    // beam design (envelope per floor)
    c.section("Beam design (envelope per floor)");
    var schedule = [];
    var bbs = [];
    var cover_b = 25.0, cover_c = 40.0;
    var smrf = inp.system.indexOf("RC SMRF") === 0;
    var DTf = DS.detailing;
    function env(ids, fn) { return maxOf(resList.map(function (r) { return maxOf(ids.map(function (m) { return fn(r.extremes(m)); })); })); }
    var Lc = bay - cD / 1000;                       // clear span of the beams between column faces
    function centroid(bars) {                       // bar-group centroid from the stirrup (layers, clear gap max(Ø, 25))
      var pl = bars.per_layer || bars.n, gap = Math.max(bars.dia, 25), left = bars.n, k = 0, sm = 0;
      while (left > 0) { var m = Math.min(pl, left); sm += m * (bars.dia / 2 + k * (bars.dia + gap)); left -= m; k++; }
      return sm / bars.n;
    }
    var rho_min13920 = 0.24 * Math.sqrt(fck) / fy;
    for (lev = 1; lev <= ns; lev++) {
      var ids = beams.filter(function (t) { return t[0] === lev; }).map(function (t) { return t[2]; });
      var Mpos = env(ids, function (e) { return e.M_max; });
      var Mneg = -minOf(resList.map(function (r) { return minOf(ids.map(function (m) { return r.extremes(m).M_min; })); }));
      var Vmax = env(ids, function (e) { return e.V_abs; });
      var sc = (lev === 1 || lev === ns) ? c : new C.Calc("s");
      var roofB = lev === ns;
      /* bars ↔ effective depth (quietly), then recorded with the final d */
      var d = bD - cover_b - 8 - 6, bot, top, fb, ft, k_;
      var pick = function (dd, cc) {
        var fb_ = RC.flexure(cc, Math.max(Mpos, 1), bb, dd, fck, fy, "beam", { tag: "(floor " + lev + " sagging)" });
        var ft_ = RC.flexure(cc, Math.max(Mneg, 1), bb, dd, fck, fy, "beam", { tag: "(floor " + lev + " hogging)" });
        var amin = smrf ? rho_min13920 * bb * dd : 0;
        var top_ = RC.beam_bars(Math.max(ft_.Ast, fb_.Asc, amin), bb, cover_b, DTf ? { rule: { role: "main" } } : {});
        // IS 13920:2016 cl 6.2.3: bottom steel at the joint face ≥ ½ top steel; any section ≥ ¼ of the larger joint-face steel
        var bot_ = RC.beam_bars(Math.max(fb_.Ast, ft_.Asc, amin, smrf ? 0.5 * top_.Ast_prov : 0), bb, cover_b,
          DTf ? { rule: { role: "main", prefer: [top_.dia] } } : {});
        if (smrf && top_.Ast_prov < 0.25 * bot_.Ast_prov)
          top_ = RC.beam_bars(0.25 * bot_.Ast_prov, bb, cover_b, DTf ? { rule: { role: "main", prefer: [bot_.dia] } } : {});
        return [fb_, ft_, bot_, top_];
      };
      for (k_ = 0; k_ < 8; k_++) {
        var pk = pick(d, new C.Calc("s"));
        var dn = Math.min(d, bD - cover_b - 8 - Math.max(centroid(pk[2]), centroid(pk[3])));
        if (dn >= d - 0.01) break;
        d = dn;
      }
      d = bD - cover_b - 8 - Math.max(centroid(pk[2]), centroid(pk[3]));
      if (sc === c) c.calc("Effective depth (floor " + lev + ")", "d", "D - c - ds - ybar", "mm", "IS 456 cl 26.3.2(b)",
        "ybar = centroid of the larger bar group (layers, clear gap max(Ø, 25))", { D: bD, c: cover_b, ds: 8, ybar: R(Math.max(centroid(pk[2]), centroid(pk[3])), 1) });
      var pk2 = pick(d, sc);
      fb = pk2[0]; ft = pk2[1]; bot = pk2[2]; top = pk2[3];
      if (DTf && sc === c) { DTf.record(c, "floor " + lev + " bottom bars", bot); DTf.record(c, "floor " + lev + " top bars", top); }
      if (smrf) {
        sc.calc("SMRF minimum tension steel (floor " + lev + ")", "As,min", "0.24*sqrt(fck)/fy*b*d", "mm²", "IS 13920:2016 cl 6.2.1(b)",
          { fck: fck, fy: fy, b: bb, d: R(d, 1) });
        var Abm = sc.calc("SMRF bottom steel at joint face ≥ ½ top (floor " + lev + ")", "As,bot", "0.5*Atop", "mm²", "IS 13920:2016 cl 6.2.3",
          { Atop: R(top.Ast_prov, 1) });
        sc.check("Bottom steel ≥ ½ top steel at joint face (floor " + lev + ")", bot.Ast_prov, Math.min(Abm, 0.5 * top.Ast_prov), { unit: "mm²", clause: "IS 13920:2016 cl 6.2.3", mode: ">=" });
        sc.check("Top & bottom steel ≥ ¼ max. joint-face steel (floor " + lev + ")", Math.min(bot.Ast_prov, top.Ast_prov),
          0.25 * Math.max(bot.Ast_prov, top.Ast_prov), { unit: "mm²", clause: "IS 13920:2016 cl 6.2.3", mode: ">=" });
        sc.check("Max. steel ≤ 2.5 % (floor " + lev + ")", 100 * Math.max(bot.Ast_prov, top.Ast_prov) / (bb * d), 2.5,
          { unit: "%", clause: "IS 13920:2016 cl 6.2.2" });
      }
      var Vd = Vmax;
      if (smrf) {
        // IS 13920:2016 cl 6.3.3: shear from plastic hinges (1.4 × moment capacities with the bars provided) + 1.2 (DL + LL)
        var Mlim_b = MT.mu_lim_coeff(fy) * fck * bb * d * d / 1e6;
        var Msag = sc.calc("Sagging capacity with bottom bars provided (floor " + lev + ")", "Mu,s", "min(0.87*fy*As*d*(1 - As*fy/(b*d*fck))/1e6, Mlim)",
          "kN·m", "IS 456 Annex G-1.1(b)", { fy: fy, As: R(bot.Ast_prov, 1), d: R(d, 1), b: bb, fck: fck, Mlim: R(Mlim_b, 2) });
        var Mhog = sc.calc("Hogging capacity with top bars provided (floor " + lev + ")", "Mu,h", "min(0.87*fy*As*d*(1 - As*fy/(b*d*fck))/1e6, Mlim)",
          "kN·m", "IS 456 Annex G-1.1(b)", { fy: fy, As: R(top.Ast_prov, 1), d: R(d, 1), b: bb, fck: fck, Mlim: R(Mlim_b, 2) });
        var Vcd = sc.calc("Capacity-design shear (floor " + lev + ")", "Vu,cd", "1.2*w*Lc/2 + 1.4*(Ms + Mh)/Lc", "kN", "IS 13920:2016 cl 6.3.3",
          "w = DL + LL on the beam, Lc = clear span; sway to either side", { w: R(roofB ? wDLr + wLLr : wDL + wLL, 3), Lc: R(Lc, 3),
            Ms: R(Msag, 2), Mh: R(Mhog, 2) });
        Vd = sc.calc("Design shear (floor " + lev + ")", "Vu", "max(Va, Vcd)", "kN", "IS 13920:2016 cl 6.3.3", { Va: R(Vmax, 2), Vcd: R(Vcd, 2) });
      }
      var shv = RC.shear(sc, Vd, bb, d, 100 * bot.Ast_prov / (bb * d), fck, fy, "beam", { tag: "(floor " + lev + ")", strict: "design" });
      if (!(lev === 1 || lev === ns)) sc.failures.forEach(function (st) { c.steps.push(st); });
      var sv = shv.stirrups ? shv.stirrups[2] : 150, s_legs = shv.stirrups ? shv.stirrups[0] : 2, s_dia = shv.stirrups ? shv.stirrups[1] : 8;
      // spacing: shear; SMRF (IS 13920:2016 cl 6.3.5) ≤ d/2 elsewhere and ≤ max(min(d/4, 6φ), 100) within 2d of column faces
      var s_mid = Math.floor(Math.min(sv, smrf ? d / 2 : sv) / 25) * 25, s_end = s_mid, z_end = 0;
      if (smrf) {
        var phi_min = Math.min(bot.dia, top.dia);
        s_end = Math.min(s_mid, Math.floor(Math.max(Math.min(d / 4, 6 * phi_min), 100) / 25) * 25);
        z_end = 2 * d;
      }
      var st_txt = S(s_legs) + "L-" + F(s_dia, "g") + "Ø @ " + F(s_mid, "g") + (z_end && s_end < s_mid ? " (" + F(s_end, "g") + " over 2d at ends)" : "");
      schedule.push(["Floor " + lev, F(bb, "g") + "×" + F(bD, "g"), S(bot.n) + "-" + F(bot.dia, "g") + "Ø", S(top.n) + "-" + F(top.dia, "g") + "Ø",
        st_txt, R(Mpos, 1), R(Mneg, 1), R(Vd, 1)]);
      var nbm = nb_;
      // BBS (DS.bbs): beam bars per bay = bay (c/c) + Ld (half each side into the joints / laps); stirrups 135° hooks with the
      // schedule spacing (closer within 2d of the column faces for SMRF)
      var BBf = DS.bbs;
      var n_st = z_end && s_end < s_mid && DTf ? DTf.count_zoned(Lc * 1000, s_mid, s_end, z_end, 2) : BBf.count(Lc * 1000, s_mid, 50);
      var bB1 = BBf.straight(bot.dia, bay * 1000 + BBf.Ld(bot.dia, fck, fy)); bB1.f = "bay " + Math.round(bay * 1000) + " + Ld " + BBf.Ld(bot.dia, fck, fy) + " = " + Math.round(bB1.cut * 1000) + " mm";
      var bB2 = BBf.straight(top.dia, bay * 1000 + BBf.Ld(top.dia, fck, fy)); bB2.f = "bay " + Math.round(bay * 1000) + " + Ld " + BBf.Ld(top.dia, fck, fy) + " = " + Math.round(bB2.cut * 1000) + " mm";
      bbs = bbs.concat([BBf.row("Beams floor " + lev, "B" + lev + "1", bot.dia, "straight, anchored / lapped at joints", bot.n * nbm, bB1, "bottom"),
        BBf.row("Beams floor " + lev, "B" + lev + "2", top.dia, "straight, anchored / lapped at joints", top.n * nbm, bB2, "top"),
        BBf.row("Beams floor " + lev, "B" + lev + "3", s_dia, "closed stirrup, 135° hooks", nbm * n_st * Math.max(1, s_legs / 2), BBf.stirrup(s_dia, bb, bD, cover_b), st_txt)]);
    }
    if (smrf)
      c.info("Ductile detailing", "Beam stirrups ≥ 8Ø (span > 5 m) at ≤ d/2; within 2d of column faces ≤ max(min(d/4, 6φ), 100) mm " +
        "(φ = smallest longitudinal bar); first hoop 50 mm from the face",
        "IS 13920:2016 cl 6.3.2 / 6.3.5");
    // column design
    c.section("Column design (governing column per storey)");
    // IS 456 Annex E (Fig. 27, sway frames): k from the joint stiffness ratios β = ΣKc / (ΣKc + ΣKb), K = I / l (gross);
    // closed form of Wood's sway chart (as IS 800 Annex D-1.2). Fixed base β = 0. Out of plane: one orthogonal beam of the
    // same section spanning the frame spacing is assumed at each floor (edge frame, conservative).
    function k_sway(b1, b2) {
      b1 = Math.min(b1, 0.99); b2 = Math.min(b2, 0.99);
      return Math.sqrt((1 - 0.2 * (b1 + b2) - 0.12 * b1 * b2) / (1 - 0.8 * (b1 + b2) + 0.6 * b1 * b2));
    }
    var IcX = cb * Math.pow(cD, 3) / 12, IcY = cD * Math.pow(cb, 3) / 12, Ib = bb * Math.pow(bD, 3) / 12;
    function beta(lv, i, Icol, inplane) {      // joint at level lv (0 = foundation, fixed)
      if (lv === 0) return 0;
      var Kc = Icol / (levels[lv] - levels[lv - 1]) + (lv < ns ? Icol / (levels[lv + 1] - levels[lv]) : 0);
      var Kb = inplane ? ((i > 0 ? 1 : 0) + (i < nb_ ? 1 : 0)) * Ib / bay : Ib / trib;
      return Kc / (Kc + Kb);
    }
    for (k = 0; k < ns; k++) {
      var scc = (k === 0 || k === ns - 1) ? c : new C.Calc("s");
      var cids = cols.filter(function (t) { return t[0] === k; }).map(function (t) { return t[2]; });
      var Pc = env(cids, function (e) { return -e.N_min; });
      var Mc = env(cids, function (e) { return e.M_abs; });
      var hk = levels[k + 1] - levels[k];
      var l0 = hk - bD / 1000;                  // unsupported length: floor (or foundation) to beam soffit
      var bx1 = 0, bx2 = 0, kx = 0;
      for (i = 0; i <= nb_; i++) {
        var kk_ = k_sway(beta(k, i, IcX, true), beta(k + 1, i, IcX, true));
        if (kk_ > kx) { kx = kk_; bx1 = beta(k, i, IcX, true); bx2 = beta(k + 1, i, IcX, true); }
      }
      var by1 = beta(k, 0, IcY, false), by2 = beta(k + 1, 0, IcY, false);
      var tagc = " (storey " + (k + 1) + ")";
      kx = scc.calc("Effective length factor, in plane – sway" + tagc, "kx", "sqrt((1 - 0.2*(b1 + b2) - 0.12*b1*b2)/(1 - 0.8*(b1 + b2) + 0.6*b1*b2))", "",
        "IS 456 Annex E (Fig. 27)", "β = ΣKc/(ΣKc + ΣKb) at bottom / top joint, governing column line", { b1: R(Math.min(bx1, 0.99), 3), b2: R(Math.min(bx2, 0.99), 3) });
      var ky = scc.calc("Effective length factor, out of plane – sway" + tagc, "ky", "sqrt((1 - 0.2*(b1 + b2) - 0.12*b1*b2)/(1 - 0.8*(b1 + b2) + 0.6*b1*b2))", "",
        "IS 456 Annex E (Fig. 27)", "one orthogonal beam " + F(bb, "g") + "×" + F(bD, "g") + " over the frame spacing assumed", { b1: R(Math.min(by1, 0.99), 3), b2: R(Math.min(by2, 0.99), 3) });
      var sx = scc.calc("Slenderness lex/D" + tagc, "lex/D", "kx*l0*1000/D", "", "IS 456 cl 25.1.2", "l0 = storey height − beam depth",
        { kx: R(kx, 3), l0: R(l0, 3), D: cD });
      var sy = scc.calc("Slenderness ley/b" + tagc, "ley/b", "ky*l0*1000/b", "", "IS 456 cl 25.1.2", { ky: R(ky, 3), l0: R(l0, 3), b: cb });
      scc.check("Slenderness ≤ 60" + tagc, Math.max(sx, sy), 60, { unit: "", clause: "IS 456 cl 25.3.1" });
      var emin = Math.max(l0 * 1000 / 500 + cD / 30, 20);
      var Ma_x = sx > 12 ? scc.calc("Additional moment (in plane)" + tagc, "Max", "Pu*D/2000*(s)**2/1000", "kN·m", "IS 456 cl 39.7.1",
        "k = 1 (cl 39.7.1.1 reduction not applied, as in the column module)", { Pu: R(Pc, 1), D: cD, s: R(sx, 3) }) : 0;
      var Ma_y = sy > 12 ? scc.calc("Additional moment (out of plane)" + tagc, "May", "Pu*b/2000*(s)**2/1000", "kN·m", "IS 456 cl 39.7.1",
        { Pu: R(Pc, 1), b: cb, s: R(sy, 3) }) : 0;
      var Mu = Math.max(Mc, Pc * emin / 1000) + Ma_x;
      var Mminor = Pc * Math.max(l0 * 1000 / 500 + cb / 30, 20) / 1000 + Ma_y;
      if (scc === c) c.let("Column design moments" + tagc, "Mux / Muy", F(Mu, ".1f") + " / " + F(Mminor, ".1f"), "kN·m", "IS 456 cl 25.4 / 39.7",
        "max(analysis, Pu·emin) + additional moment");
      var best = null;
      var dias = DS.detailing ? DS.detailing.allowed("column", "main", [12, 16, 20, 25]).dias : [12, 16, 20, 25];
      for (var di = 0; di < dias.length; di++) {
        var dia = dias[di];
        for (var n = 4; n < 21; n += 2) {
          var pct = 100 * n * bar_area(dia) / (cb * cD);
          if (!(0.8 <= pct && pct <= 4.0)) continue;
          var rb = RC.rect_bars(cb, cD, cover_c, 8, dia, n), mj = rb[0], mn = rb[1];
          var Mx1 = RC.column_capacity(Pc, cb, cD, mj, fck, fy);
          var My1 = RC.column_capacity(Pc, cD, cb, mn, fck, fy);
          var Pz = RC.puz(cb, cD, n * bar_area(dia), fck, fy);
          var an = C.interp(Pc / Pz, [0.2, 0.8], [1, 2]);
          var ir = Mx1 > 0 && My1 > 0 ? Math.pow(Mu / Mx1, an) + Math.pow(Mminor / My1, an) : 9;
          if (ir <= 1 && Pc <= 0.95 * Pz) {
            best = [n, dia, ir];
            break;
          }
        }
        if (best) break;
      }
      if (best === null) {
        c.check("Column storey " + (k + 1) + ": section adequate", 2.0, 1.0, { unit: "", clause: "IS 456 cl 39.6",
          note: "no arrangement ≤ 4 % – enlarge column" });
        best = [12, 25, 2.0];
      } else {
        scc.check("Column storey " + (k + 1) + ": biaxial interaction (Pu " + F(Pc, ".0f") + " kN, Mu " + F(Mu, ".1f") + " / " + F(Mminor, ".1f") + " kN·m)", best[2], 1.0,
          { unit: "", clause: "IS 456 cl 39.6" });
      }
      if (scc !== c) scc.failures.forEach(function (st) { c.steps.push(st); });
      var nB = best[0], diaB = best[1];
      var tie_s = Math.min(cb, 16 * diaB, 300), tie_d = 8, tconf = null;
      if (DS.detailing) {
        var tbr = DS.detailing.tie_bars(diaB, cb, cD, null, { length: hk });
        tie_s = Math.min(tie_s, tbr.s); tie_d = Math.max(tie_d, tbr.dia);
        if (tbr.s_conf) tconf = tbr;
        if (scc === c) DS.detailing.record(c, "storey " + (k + 1) + " column ties", tbr);
      }
      schedule.push(["Column storey " + (k + 1), F(cb, "g") + "×" + F(cD, "g"), S(nB) + "-" + F(diaB, "g") + "Ø", "",
        F(tie_d, "g") + "Ø @ " + F(Math.floor(tie_s / 25) * 25, "g") + (tconf ? " (" + F(tconf.s_conf, "g") + " over " + F(tconf.lo, "g") + " at ends)" : ""),
        R(Mu, 1), R(Pc, 1), ""]);
      var BBc = DS.bbs, ts25 = Math.floor(tie_s / 25) * 25, lapc = BBc.lap(diaB, fck, fy);
      var cC1 = BBc.stock({ cut: Math.round(hk * 1000 + lapc) / 1000, f: "storey " + Math.round(hk * 1000) + " + lap " + lapc + " = " + Math.round(hk * 1000 + lapc) + " mm" }, diaB, fck, fy);
      bbs = bbs.concat([BBc.row("Columns storey " + (k + 1), "C" + (k + 1) + "1", diaB, "straight + lap", nB * (nb_ + 1), cC1, "main"),
      BBc.row("Columns storey " + (k + 1), "C" + (k + 1) + "2", tie_d, "closed tie, 135° hooks", (nb_ + 1) * (tconf ? DS.detailing.count_zoned(hk * 1000,
        ts25, tconf.s_conf, tconf.lo, 2) : Math.floor(hk * 1000 / ts25) + 1), BBc.stirrup(tie_d, cb, cD, cover_c), "@ " + ts25 + (tconf ? ", " + tconf.s_conf + " at ends" : ""))]);
    }
    var sched = C.table(schedule, ["Member", "Size (mm)", "Bottom / main", "Top", "Stirrups / ties",
      "M (kN·m)", "M− / P (kN)", "V (kN)"]);
    c.thumb("Beam depth", bay * 1000 / 12, bD, "mm", "span/12", "Practice");
    c.thumb("Column depth (axial thumb, min 300)", Math.max(300, Math.max(C.sum(Wf) / (nb_ + 1) * 1.5 * 1000 / (0.4 * fck + 0.67 * fy * 0.01) / 1e6, 0) * 1e6 / cb * 1.25), cD,
      "mm", "Pu / (0.4 fck + 0.0067 fy) at 1 % steel, +25 % for moment; ≥ 300 mm (IS 13920 cl 7.1.2)", "Practice / IS 13920");
    c.miss("3D analysis with torsion / accidental eccentricity (5 %) and response-spectrum method for irregular or tall " +
      "buildings", "IS 1893-1 cl 7.7–7.9", "Important");
    c.miss("Wind load analysis (IS 875-3) – may govern for tall / light buildings", "IS 875-3", "Important");
    c.miss("Beam–column joint shear and strong-column–weak-beam check (SMRF)", "IS 13920 cl 8–9", "Important");
    c.miss("Foundation design for the column reactions shown", "IS 456 cl 34", "Critical");
    var Wx = nb_ * bay;
    var qty = [Q("RCC M" + F(fck, "g") + " in beams & columns of the frame (excl. steel & shuttering)", "cum",
      [row("Beams (below slab)", ns * nb_, bay, bb / 1000, (bD - 130) / 1000),
        row("Columns", ns * (nb_ + 1), cb / 1000, cD / 1000, (h1 + (ns - 1) * h) / ns)], null, CM.rcc_rate(fck)),
    Q("Centering & shuttering – beams & columns", "sqm",
      [row("Beam sides + soffit", ns * nb_, bay, (bb + 2 * (bD - 130)) / 1000),
        row("Column sides", ns * (nb_ + 1), 2 * (cb + cD) / 1000, null, (h1 + (ns - 1) * h) / ns)], null,
      RATE.shutter_wall),
    Q("Reinforcement TMT Fe500 – frame", "kg", kgRows(bbs), null, RATE.rebar)];
    var gov = null, govV = -Infinity;
    ckeys.forEach(function (key) {
      var v = maxOf(beams.map(function (t) { return res[key].extremes(t[2]).M_abs; }));
      if (gov === null || v > govV) { gov = key; govV = v; }
    });
    var bmd = CM.frame_bmd_view(f, res[gov], "Bending moment – " + gov + " (kN·m)", { labels: false });
    var el = new D_.View("Frame elevation & member sizes");
    cols.forEach(function (t) {
      var mem = f.members[t[2]], p1 = f.nodes[mem.i], p2 = f.nodes[mem.j];
      el.rect(p1[0] * 1000 - cD / 2, p1[1] * 1000, cD, (p2[1] - p1[1]) * 1000, "OUTLINE", "concrete");
    });
    beams.forEach(function (t) {
      var mem = f.members[t[2]], p1 = f.nodes[mem.i], p2 = f.nodes[mem.j];
      el.rect(p1[0] * 1000 + cD / 2, p1[1] * 1000 - bD, (p2[0] - p1[0]) * 1000 - cD, bD, "OUTLINE", "concrete");
    });
    for (k = 0; k < ns; k++)
      el.text(-1200, (levels[k] + levels[k + 1]) * 500, "Storey " + (k + 1), 2.2, { anchor: "end" });
    el.dim(0, 0, Wx * 1000, 0, 12);
    el.dim(Wx * 1000 + 600, 0, Wx * 1000 + 600, Ht * 1000, -8);
    var tv = D_.table_view("Beam & column schedule", ["Member", "Size", "Bottom/main", "Top", "Stirrups/ties"],
      schedule.map(function (r) { return r.slice(0, 5); }), [34, 22, 26, 22, 34]);
    var sh = new D_.Sheet("Multi-storey RCC frame", "FR-01", [el, bmd], ["M" + F(fck, "g") + ", Fe500. Zone " + inp.zone + ", " +
      inp.system + ", soil " + inp.soil + ".",
    "Base shear VB = " + F(Vb, ".1f") + " kN (Ah = " + F(Ah, ".4f") + ")."]);
    var sh2 = new D_.Sheet("Frame – member schedule", "FR-02", [tv], ["Lap splices in middle half of columns / away from " +
      "beam supports; see IS 13920 for confining zones."]);
    var summary = { "Frame": S(nb_) + " bays × " + S(ns) + " storeys", "Base shear": F(Vb, ".1f") + " kN (Ah " + F(Ah, ".4f") + ", T " + F(T, ".2f") + " s)",
      "Max drift": F(worst, ".5f") + " (limit 0.004)", "Beams": F(bb, "g") + "×" + F(bD, "g"), "Columns": F(cb, "g") + "×" + F(cD, "g"),
      "Max utilisation": F(c.max_utilisation, ".2f") };
    return C.DesignResult({ module: "building_frame", title: "Multi-storey RCC frame", inputs: inp, calc: c, summary: summary,
      drawings: [sh, sh2], quantities: qty, bbs: bbs,
      tables: { "Member schedule": sched, "Lateral forces": C.table({ "Floor": C.range(1, ns + 1),
        "Height (m)": hs, "W (kN)": Wf, "Q (kN)": Qs }) }, references: FR_REFS });
  }
  M.run_frame = run_frame;

  var FR_PARAMS = [
    P("bays", "Number of bays", 3, { kind: "int", min: 1, max: 8, group: "Geometry" }),
    P("bay", "Bay width", 4.5, "m", { min: 2.5, max: 9, step: 0.25, group: "Geometry" }),
    P("storeys", "Number of storeys", 4, { kind: "int", min: 1, max: 15, group: "Geometry" }),
    P("h_ground", "Ground storey height (from foundation)", 4.2, "m", { min: 2.8, max: 6, step: 0.1, group: "Geometry" }),
    P("h_typical", "Typical storey height", 3.2, "m", { min: 2.8, max: 5, step: 0.1, group: "Geometry" }),
    P("frame_spacing", "Frame spacing (tributary width)", 4.0, "m", { min: 2.5, max: 9, step: 0.25, group: "Geometry" }),
    P("beam_b", "Beam width", 300.0, "mm", { min: 200, max: 600, step: 25, group: "Sections" }),
    P("beam_D", "Beam depth", 450.0, "mm", { min: 300, max: 900, step: 25, group: "Sections" }),
    P("col_b", "Column width", 300.0, "mm", { min: 230, max: 900, step: 25, group: "Sections" }),
    P("col_D", "Column depth (in plane)", 450.0, "mm", { min: 230, max: 1200, step: 25, group: "Sections" }),
    P("floor_dl", "Floor dead load (slab + finishes)", 4.5, "kN/m²", { min: 1, max: 12, step: 0.25, group: "Loads" }),
    P("floor_ll", "Floor imposed load", 2.0, "kN/m²", { min: 1, max: 10, step: 0.5, group: "Loads" }),
    P("roof_dl", "Roof dead load (slab + waterproofing)", 5.5, "kN/m²", { min: 1, max: 12, step: 0.25, group: "Loads" }),
    P("roof_ll", "Roof imposed load", 1.5, "kN/m²", { min: 0.75, max: 5, step: 0.25, group: "Loads" }),
    P("wall", "Wall load on floor beams", 12.0, "kN/m", { min: 0, max: 30, group: "Loads" }),
    P("zone", "Seismic zone", "III", { kind: "select", options: Object.keys(DS.loads.ZONE_Z), group: "Seismic" }),
    P("soil", "Soil type", "II (medium)", { kind: "select", options: DS.loads.SOILS, group: "Seismic" }),
    P("importance", "Importance", "Ordinary buildings", { kind: "select", options: Object.keys(DS.loads.IMPORTANCE), group: "Seismic" }),
    P("system", "Lateral system", "RC SMRF (special MRF, IS 13920 detailing)", { kind: "select",
      options: Object.keys(DS.loads.R_FACTOR).filter(function (k) { return k.indexOf("RC") === 0; }), group: "Seismic" }),
    P("infill", "Masonry infill", "With masonry infill", { kind: "select",
      options: ["With masonry infill", "Bare frame"], group: "Seismic" }),
    P("fck", "Concrete grade", 25.0, "N/mm²", { kind: "select", options: [20.0, 25.0, 30.0, 35.0], group: "Materials" })
  ];
  M.FR_PARAMS = FR_PARAMS;
  C.register({ id: "building_frame", phase: 4, category: "Bridges & frames", name: "Multi-storey RCC frame (gravity + seismic)", icon: "🏢",
    description: "Plane frame by stiffness method: IS 875 gravity loads, IS 1893 equivalent static seismic, 7 " +
      "combinations, drift, beam & column design per floor, schedules, BBS and quantities.",
    params: FR_PARAMS, run: run_frame, references: FR_REFS, modes: ["check"] });
})();
