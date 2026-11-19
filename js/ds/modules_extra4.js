/* Design Studio — modules_extra4 (new module, not a Python port). Loads after modules_extra.js / modules_extra2.js.
   Site-engineer module for SECL (Korba / Gevra) works – design + CPWD / MPPWD-style estimate quantities.
     drain_retaining   RCC drain-cum-retaining wall: U-drain at the toe of a cut / embankment or along a raised platform where the
                       outer (high) wall also retains earth higher than the drain.
                       Hydraulics: Q given or rational CiA/360, Manning capacity at (depth − freeboard), normal depth, self-cleansing
                       (≥ 0.6 m/s) and scour (≤ 3 m/s) velocities.
                       Loads: Rankine active (sloping backfill) or at-rest earth on the high side, surcharge by location (road IRC 1.2 m
                       earth / mine dumper equivalent surcharge / footpath), ground water behind the wall with weep holes (drained) or
                       without (hydrostatic + uplift), low-side earth (resisting only when flagged), water in the drain (full / empty).
                       Stability of the whole U as a retaining structure: overturning FoS ≥ 2.0 (IRC 78) + IS 456 cl 20.1 factored form,
                       sliding FoS ≥ 1.5 (optional shear key below the high wall), edge pressures p_toe / p_heel with the correct sign
                       of the eccentricity and no-tension redistribution, flotation of the empty drain (FoS ≥ 1.2).
                       Structure: high wall & low wall as cantilevers (earth face / water face, crack width 0.2 mm, IS 3370-2 minimum
                       steel), base slab as a continuous member from the free-body of the whole section for four load cases
                       (soil pressure + uplift + wall moments + water + friction), heel / toe cantilevers, curtailment of high-wall
                       bars, distribution steel; BBS (DS.bbs), quantities (CPWD DSR / MPPWD SOR descriptions), drawings.
   Conventions as modules_extra.js: lengths m (sections mm), forces kN per m run, x measured from the toe (low-side outer edge of the
   base), y from the underside of the base; every number recorded in a Calc with formula and clause.
   Steps marked [APPROX] / "verify" are engineering approximations or paraphrased clauses – check against licensed codes. */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var C = DS.core, F = C.pyfmt, R = C.pyround, ceil_to = C.ceil_to;
  var M = DS.modules_extra4 = {};
  function CM() { return DS.common; }
  function RC() { return DS.rcc; }
  function LD() { return DS.loads; }
  function DR() { return DS.drawing; }
  function BB() { return DS.bbs; }
  function DT() { return DS.detailing; }
  function X() { return DS.modules_extra; }
  function row() { return CM().row.apply(null, arguments); }
  function Q() { return CM().Q.apply(null, arguments); }
  function num(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function G(x) { return F(x, "g"); }
  function area(d) { return Math.PI * d * d / 4; }
  function ctx() { return C.ctx || { site: "general", detail: "practice" }; }
  function isMine() { return ctx().site === "mine"; }
  function clamp(x, lo, hi) { return Math.min(Math.max(x, lo), hi); }
  function fin(x, d) { return isFinite(x) ? x : d; }
  function rad(d) { return d * Math.PI / 180; }
  var CPWD = "CPWD_DSR_2021", MPPWD = "MPPWD_SOR_2017", CHECK = ["check"], GW = 9.81;

  function P(key, label, def, unit, o) {
    if (unit && typeof unit === "object") { o = unit; unit = ""; }
    return C.Param(Object.assign({ key: key, label: label, default: def, unit: unit || "" }, o || {}));
  }
  /* Simpson integral of f on [a, b] */
  function integ(f, a, b, n) { n = n || 40; if (b <= a) return 0; var h = (b - a) / n, s = f(a) + f(b); for (var i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h); return s * h / 3; }

  /* ======================================================================= options */
  var DR_LOC = ["Road – IRC loading (1.2 m earth surcharge)", "Mine dumper – haul road (dumper surcharge)", "Footpath / platform / open ground (uniform surcharge)"];
  var DR_PRESS = ["Active (Rankine) – wall free to yield", "At rest (K0) – restrained / heavily compacted backfill"];
  var DR_DRAIN = ["Weep holes through the high wall into the drain + filter media (drained)", "No weep holes (water pressure behind wall + uplift)"];
  var DR_LOW = ["Ignore low-side earth in stability (conservative)", "Passive resistance of low-side earth in sliding (Kp/2 – only if never excavated)"];
  var DR_KEY = ["Shear key below the high wall if sliding governs", "No shear key (widen the base)"];
  var DR_Q = ["Design discharge Q given", "Rational method Q = C·i·A/360"];
  var DR_COV = ["Open drain", "Covered – precast RCC cover slabs (designed in the drain-cover module)"];
  var DR_SIT = ["Toe of a cut – high side is natural ground (excavate, then backfill behind the wall)", "Raised platform / embankment – high side is new fill"];
  var DUMP_NAMES = ["Tipper 35 t (6×4, tandem rear axles)", "BEML BH35-2 (60 t)", "BEML BH60M (98 t)", "BEML BH100 (165 t)", "CAT 777G (164 t)",
    "BEML BH150E (240 t)", "Custom"];
  M.OPTIONS = { loc: DR_LOC, press: DR_PRESS, drain: DR_DRAIN, low: DR_LOW, key: DR_KEY, q: DR_Q, cov: DR_COV, sit: DR_SIT };

  /* ======================================================================= surcharge on the retained (high) side */
  function locKind(inp) { var v = String(inp.loading); return /^Mine dumper/.test(v) ? "dumper" : /^Road/.test(v) ? "road" : "foot"; }
  function surcharge(c, inp, gam) {
    var k = locKind(inp), q0 = num(inp.surcharge), qL = 0;
    c.section("Surcharge on the retained (high) side");
    c.let("Loading on the retained side", "", String(inp.loading), "", k === "dumper" ? "Mine haul road – CMR 2017 / DGMS bund practice" : k === "road" ? "IRC 6:2017" : "IS 875-2");
    if (k === "road") qL = c.calc("Live-load surcharge – road (1.2 m of earth)", "qLL", "1.2*g", "kN/m²", "IRC 6:2017 cl 214.1.1.3", { g: gam });
    else if (k === "dumper") {
      var Dm = X().dcDumper(inp), OL = num(inp.overload) || 1.10, Wt = Dm.gvw * 9.81 * OL, nr = Math.max(1, Dm.rear || 1), Pr = Wt * (1 - Dm.f) / nr;
      var bt = Dm.b, T = (Dm.Tr || 2.4) + (Dm.s || 0.5), l = Pr / 4 / (Dm.p * bt), st = Dm.st || 0, zz = Math.max(0.5, num(inp.setback));
      c.let("Dumper", "", Dm.name + ", rear axle " + F(Pr, ".0f") + " kN × " + nr, "kN", Dm.approx ? "geometry approximate – verify with the OEM data sheet" : "");
      c.let("Wheel set-back from the wall top (safety bund)", "a", num(inp.setback), "m", "CMR 2017 / DGMS bund practice", "load dispersed at 45° to depth z = max(0.5, a) before it reaches the wall");
      qL = c.calc("Equivalent surcharge – dumper rear axle(s) dispersed to depth z", "qLL", "nr*Pr*(1 + I)/((T + bt + 2*z)*((nr - 1)*st + l + 2*z))", "kN/m²",
        "DS.loadguide equivalent-surcharge method [GP]", { nr: nr, Pr: R(Pr, 3), I: R(LD().impact_dumper(zz), 4), T: R(T, 3), bt: bt, z: zz, st: st, l: R(l, 4) });
    } else c.info("Footpath / platform", "No vehicle on the retained side – the uniform surcharge input governs (≥ 5 kN/m² footpath / stacking, IS 875-2)", "IS 875-2");
    var q = c.calc("Design surcharge on the retained side", "q", "max(qLL, q0)", "kN/m²", "", "q0 = minimum / other surcharge input", { qLL: R(qL, 4), q0: q0 });
    return { kind: k, q: q, qLL: qL };
  }
  M.surcharge = surcharge;

  /* ======================================================================= hydraulics */
  function manQ(B, y, S, n) { if (y <= 0) return 0; var A = B * y, Pw = B + 2 * y; return A * Math.pow(A / Pw, 2 / 3) * Math.sqrt(S) / n; }
  M.manQ = manQ;
  function normalDepth(B, Qd, S, n) { var lo = 0, hi = 0.05; while (manQ(B, hi, S, n) < Qd && hi < 50) hi *= 2; for (var i = 0; i < 80; i++) { var m = (lo + hi) / 2; if (manQ(B, m, S, n) >= Qd) hi = m; else lo = m; } return hi; }
  M.normalDepth = normalDepth;
  function hydraulics(c, inp, Bc, Dd) {
    c.section("Hydraulics – capacity, velocity & freeboard (Manning)");
    var Qd;
    if (/^Rational/.test(String(inp.q_mode))) Qd = c.calc("Peak runoff (rational method)", "Q", "C*i*A/360", "m³/s", "IRC SP-42 / IRC SP-13 cl 4 (rational)",
      "C runoff coefficient, i mm/hr for the time of concentration, A hectares", { C: num(inp.runoff_c), i: num(inp.intensity), A: num(inp.area_ha) });
    else Qd = c.let("Design discharge (given)", "Q", num(inp.discharge), "m³/s", "IRC SP-42 / CPHEEO – from the catchment study");
    Qd = Math.max(Qd, 1e-4);
    var N = Math.max(num(inp.slope_n), 1), S = c.calc("Longitudinal bed slope (1 in N)", "S", "1/N", "", "IRC SP-42 (≥ 1 in 1000 for lined drains – verify)", { N: N });
    var n = Math.max(num(inp.manning), 0.009), fb = num(inp.freeboard);
    c.let("Manning's n (concrete lining)", "n", n, "", "IRC SP-42 Table / IS 10430 (0.013–0.015 finished concrete; 0.017–0.020 rough)");
    var yc = c.calc("Flow depth available (drain depth − freeboard)", "yc", "max(D - fb, 0.01)", "m", "IRC SP-42 (freeboard 0.15–0.3 m)", { D: Dd, fb: fb });
    var Qc = c.calc("Drain capacity at yc (Manning, rectangular)", "Qcap", "B*yc*(B*yc/(B + 2*yc))**(2/3)*sqrt(S)/n", "m³/s", "Manning; IRC SP-42 cl 6", { B: Bc, yc: R(yc, 4), S: R(S, 8), n: n });
    c.check("Design discharge ≤ capacity with freeboard", Qd, Qc, { unit: "m³/s", clause: "IRC SP-42 / CPHEEO", note: Qd > Qc ? "widen / deepen the drain or steepen the bed" : "" });
    var yn = normalDepth(Bc, Qd, S, n);
    c.let("Normal depth for Q (Manning, solved by bisection)", "yn", R(yn, 4), "m", "Manning – B·y·(B·y/(B + 2y))^(2/3)·√S/n = Q", yn > Dd ? "exceeds the drain depth – overflows" : "");
    c.calc("Manning discharge at yn (= Q, check)", "Qn", "B*y*(B*y/(B + 2*y))**(2/3)*sqrt(S)/n", "m³/s", "Manning", { B: Bc, y: R(yn, 4), S: R(S, 8), n: n });
    var v = c.calc("Mean velocity at design flow", "v", "Q/(B*y)", "m/s", "continuity", { Q: R(Qd, 5), B: Bc, y: R(yn, 4) });
    var vmin = isMine() ? 0.75 : 0.6;
    c.ok("Self-cleansing velocity ≥ " + G(vmin) + " m/s", v >= vmin - 1e-9, { detail: F(v, ".2f") + " m/s" + (isMine() ? " (coal fines / OB silt – 0.75 m/s used for the mining area)" : ""),
      clause: "IRC SP-42 / CPHEEO (0.6 m/s; silt pits / steeper bed if lower)", warn_only: true });
    c.ok("Velocity ≤ 3.0 m/s (no scour of the concrete lining)", v <= 3.0 + 1e-9, { detail: F(v, ".2f") + " m/s", clause: "IRC SP-42 / IS 10430 (≈ 3 m/s for concrete – drop structures if higher)", warn_only: true });
    var fba = c.calc("Freeboard at design flow", "fb,act", "D - y", "m", "", { D: Dd, y: R(yn, 4) });
    c.check("Freeboard ≥ " + G(fb) + " m", fb, R(fba, 4), { unit: "m", clause: "IRC SP-42 practice (0.15–0.3 m)", mode: "<=" });
    return { Q: Qd, S: S, n: n, yc: yc, Qcap: Qc, yn: yn, v: v, fb: fb, fba: fba };
  }
  M.hydraulics = hydraulics;

  /* ======================================================================= geometry & load cases */
  /* g: {Bc, D, Hr, Hh, ho, tl, th, tb, toe, heel, hk, B, x1, x2, x3, beta, wc} – x from the toe (low-side outer edge), y from underside of base */
  function mkGeo(b, t) {
    var g = Object.assign({}, b, t);
    g.x1 = g.toe + g.tl; g.x2 = g.x1 + g.Bc; g.x3 = g.x2 + g.th; g.B = g.x3 + g.heel;
    g.Hv = g.tb + g.Hr + g.heel * Math.tan(rad(g.beta));
    return g;
  }
  /* items for a load case. o: {earth, lowEarth, surHeel, full, water}. Vertical items (+ down): {lab, w, a, b} (uniform) or {lab, P, x};
     horizontal items (+ towards the heel): {lab, H, y, x}; uplift trapezoid u0 (toe) → u1 (heel) */
  function caseItems(g, s, o) {
    var V = [], H = [], tb = g.tb, cb = Math.cos(rad(g.beta)), sb = Math.sin(rad(g.beta)), tn = Math.tan(rad(g.beta));
    V.push({ lab: "base slab", w: 25 * tb, a: 0, b: g.B });
    V.push({ lab: "low wall", P: 25 * g.tl * g.D, x: g.toe + g.tl / 2 });
    V.push({ lab: "high wall", P: 25 * g.th * g.Hh, x: g.x2 + g.th / 2 });
    if (g.hk > 0) V.push({ lab: "shear key", P: 25 * g.th * g.hk, x: g.x2 + g.th / 2 });
    if (g.wc > 0) { V.push({ lab: "cover slabs on low wall", P: g.wc / 2, x: g.toe + g.tl / 2 }); V.push({ lab: "cover slabs on high wall", P: g.wc / 2, x: g.x2 + g.th / 2 }); }
    if (o.earth && g.toe > 0 && g.ho > 0) V.push({ lab: "soil on toe", w: s.gam * g.ho, a: 0, b: g.toe });
    if (o.earth && g.heel > 0) {
      V.push({ lab: "soil on heel", w: s.gam * g.Hr, a: g.x3, b: g.B });
      if (g.beta > 0) V.push({ lab: "soil wedge on heel (sloping backfill)", P: s.gam * g.heel * g.heel * tn / 2, x: g.x3 + 2 * g.heel / 3 });
    }
    if (o.surHeel && g.heel > 0 && s.q > 0) V.push({ lab: "surcharge on heel", w: s.q, a: g.x3, b: g.B });
    var u0 = 0, u1 = 0, hwt = 0;
    if (o.earth) {
      var Pa = 0.5 * s.K * s.gam * g.Hv * g.Hv, Pq = s.K * s.q * g.Hv;
      H.push({ lab: "earth thrust", H: -Pa * cb, y: g.Hv / 3, x: g.B });
      if (s.q > 0) H.push({ lab: "surcharge thrust", H: -Pq * cb, y: g.Hv / 2, x: g.B });
      if (g.beta > 0) V.push({ lab: "vertical component of thrust", P: (Pa + Pq) * sb, x: g.B });
      if (o.water) {
        hwt = clamp(s.hw + tb, 0, g.Hv);
        if (hwt > 0) { H.push({ lab: "water behind wall", H: -0.5 * GW * hwt * hwt, y: hwt / 3, x: g.B }); H.push({ lab: "submerged soil (earth thrust reduction)", H: 0.5 * s.K * GW * hwt * hwt * cb, y: hwt / 3, x: g.B }); }
      }
    }
    if (o.water) { u1 = GW * Math.max(s.hw + tb, 0); u0 = GW * Math.max(Math.min(s.hw, g.ho) + tb, 0); }
    if (o.lowEarth && g.ho + tb > 0) {
      var hl = g.ho + tb;
      H.push({ lab: "low-side earth", H: 0.5 * s.KaLo * s.gam * hl * hl, y: hl / 3, x: 0 });
      if (s.qlo > 0) H.push({ lab: "low-side surcharge", H: s.KaLo * s.qlo * hl, y: hl / 2, x: 0 });
    }
    if (o.full) {
      V.push({ lab: "water in drain", w: GW * g.D, a: g.x1, b: g.x2 });
      H.push({ lab: "water on low wall (inside)", H: -0.5 * GW * g.D * g.D, y: tb + g.D / 3, x: g.x1 - g.tl / 2 });
      H.push({ lab: "water on high wall (inside)", H: 0.5 * GW * g.D * g.D, y: tb + g.D / 3, x: g.x2 + g.th / 2 });
    }
    return { V: V, H: H, u0: u0, u1: u1, hwt: hwt };
  }
  function vP(it) { return it.P != null ? it.P : it.w * (it.b - it.a); }
  function vX(it) { return it.P != null ? it.x : (it.a + it.b) / 2; }
  /* rigid-base analysis of one case: resultant, eccentricity (+ towards the toe), linear / no-tension pressure */
  function analyse(g, L) {
    var B = g.B, Pd = 0, Md = 0, Hs = 0, MH = 0;
    L.V.forEach(function (it) { var p = vP(it); Pd += p; Md += p * vX(it); });
    L.H.forEach(function (it) { Hs += it.H; MH += it.H * it.y; });
    var U = (L.u0 + L.u1) / 2 * B, MU = B * B * (L.u0 / 6 + L.u1 / 3);
    var V = Pd - U, Vp = Math.max(V, 1e-6), xr = (Md - MU + MH) / Vp, e = B / 2 - xr;
    var pt, ph, pmax, pmin, nt = false, c0 = 0, c1 = B, pAt;
    pt = Vp / B * (1 + 6 * e / B); ph = Vp / B * (1 - 6 * e / B);
    if (Math.abs(e) <= B / 6 + 1e-12) { pmax = Math.max(pt, ph); pmin = Math.min(pt, ph); pAt = function (x) { return pt + (ph - pt) * x / B; }; }
    else {
      nt = true; var a3 = Math.max(3 * (B / 2 - Math.abs(e)), 0.01 * B), pk = 2 * Vp / a3; pmax = pk; pmin = 0;
      if (e > 0) { c1 = Math.min(a3, B); pAt = function (x) { return x <= c1 ? pk * (1 - x / a3) : 0; }; }
      else { c0 = Math.max(B - a3, 0); pAt = function (x) { return x >= c0 ? pk * (1 - (B - x) / a3) : 0; }; }
    }
    if (V <= 1e-6) { pAt = function () { return 0; }; pmax = 0; pmin = 0; pt = 0; ph = 0; }
    return { V: V, Pd: Pd, Md: Md, U: U, MU: MU, Hs: Hs, MH: MH, xr: xr, e: e, p_toe: pt, p_heel: ph, pmax: pmax, pmin: pmin, nt: nt, c0: c0, c1: c1, pAt: pAt, L: L };
  }
  M.analyse = analyse;
  /* integrals of the soil contact pressure on [0, x]: force and moment about x */
  function pInt(an, x) {
    var brk = [0, x]; [an.c0, an.c1].forEach(function (b) { if (b > 0 && b < x) brk.push(b); }); brk.sort(function (a, b) { return a - b; });
    var Fp = 0, Mp = 0;
    for (var i = 0; i < brk.length - 1; i++) { var a = brk[i], b = brk[i + 1]; Fp += integ(an.pAt, a, b, 20); Mp += integ(function (s) { return an.pAt(s) * (x - s); }, a, b, 20); }
    return { F: Fp, M: Mp };
  }
  /* left free body of the whole section cut at x (moments about the base mid-depth): sagging + (tension at the bottom of the base);
     friction (= −ΣH) distributed in proportion to the contact pressure, acting at the underside */
  function leftM(g, an, x) {
    var L = an.L, B = g.B, k = (L.u1 - L.u0) / B, Mv = 0, Vv = 0;
    var pi = pInt(an, x), Fu = L.u0 * x + k * x * x / 2, Mu = L.u0 * x * x / 2 + k * x * x * x / 6;
    L.V.forEach(function (it) {
      if (it.P != null) { if (it.x < x - 1e-9) { Mv += it.P * (x - it.x); Vv += it.P; } }
      else { var b = Math.min(it.b, x); if (b > it.a) { var p = it.w * (b - it.a); Mv += p * (x - (it.a + b) / 2); Vv += p; } }
    });
    var Mh = 0; L.H.forEach(function (it) { if (it.x < x - 1e-9) Mh += it.H * (it.y - g.tb / 2); });
    var Mf = an.V > 1e-6 ? an.Hs * pi.F / an.V * g.tb / 2 : 0;
    return { M: pi.M + Mu - Mv + Mh + Mf, V: pi.F + Fu - Vv };
  }
  /* heel as a cantilever from the back face of the high wall (vertical loads only, right free body): + = tension at the top */
  function heelM(g, an) {
    var x3 = g.x3, B = g.B, L = an.L, Md = 0, Vd = 0;
    if (g.heel <= 1e-9) return { M: 0, V: 0 };
    L.V.forEach(function (it) {
      if (it.P != null) { if (it.x > x3 + 1e-9) { Md += it.P * (it.x - x3); Vd += it.P; } }
      else { var a = Math.max(it.a, x3); if (it.b > a) { var p = it.w * (it.b - a); Md += p * ((a + it.b) / 2 - x3); Vd += p; } }
    });
    var Fp = integ(an.pAt, x3, B, 40), Mp = integ(function (s) { return an.pAt(s) * (s - x3); }, x3, B, 40);
    var u = function (s) { return L.u0 + (L.u1 - L.u0) * s / B; };
    var Fu = integ(u, x3, B, 4), Mu = integ(function (s) { return u(s) * (s - x3); }, x3, B, 4);
    return { M: Md - Mp - Mu, V: Vd - Fp - Fu };
  }
  M.mkGeo = mkGeo; M.caseItems = caseItems; M.leftM = leftM; M.heelM = heelM;
  var CASES = {
    E: { earth: true, water: true, lab: "Empty drain, earth + surcharge thrust (surcharge on heel ignored)" },
    Eq: { earth: true, water: true, surHeel: true, lab: "Empty drain, earth + surcharge (also on heel)" },
    Fq: { earth: true, water: true, surHeel: true, full: true, lab: "Drain full, earth + surcharge (also on heel)" },
    S1: { earth: true, water: true, surHeel: true, lowEarth: true, lab: "Empty, earth both sides + surcharge on heel" },
    S2: { earth: true, water: true, lowEarth: true, lab: "Empty, earth both sides, no surcharge on heel" },
    S3: { earth: true, water: true, surHeel: true, full: true, lowEarth: true, lab: "Full, earth both sides + surcharge on heel" },
    T: { full: true, lab: "Water test – drain full, before backfilling" } };
  M.CASES = CASES;

  /* quick stability verdict for the design search (no calc output) */
  function quick(g, s) {
    var E = analyse(g, caseItems(g, s, CASES.E)), st = stabParts(g, s, E);
    if (st.fot < 2.0 - 1e-9 || st.flo < 1.2 - 1e-9 || E.V <= 0) return { okx: false, E: E, st: st, score: Math.max(2.0 / Math.max(st.fot, 1e-6), 1.2 / Math.max(st.flo, 1e-6), E.V > 0 ? Math.abs(E.e) / (g.B / 6) : 99) + 1, fsl: function (hk) { return slideFoS(g, s, E, hk, 25 * g.th * (hk - g.hk)); } };
    var Eq = analyse(g, caseItems(g, s, CASES.Eq)), Fq = analyse(g, caseItems(g, s, CASES.Fq));
    var okB = [E, Eq, Fq].every(function (a) { return a.V > 0 && a.pmax <= s.sbc * (1 + 1e-9) && Math.abs(a.e) <= g.B / 6 + 1e-9; });
    var okx = st.fot >= 2.0 - 1e-9 && st.is456 && okB && st.flo >= 1.2 - 1e-9;
    var score = Math.max(2.0 / Math.max(st.fot, 1e-6), 1.2 / Math.max(st.flo, 1e-6), Math.max.apply(null, [E, Eq, Fq].map(function (a) { return a.V > 0 ? Math.max(a.pmax / s.sbc, Math.abs(a.e) / (g.B / 6)) : 99; })));
    return { okx: okx, E: E, st: st, score: score, fsl: function (hk) { return slideFoS(g, s, E, hk, 25 * g.th * (hk - g.hk)); } };
  }
  /* components of the stability of case E */
  function stabParts(g, s, E) {
    var Mr = 0, Mod = 0, Moq = 0, Wr = 0;
    E.L.V.forEach(function (it) { Mr += vP(it) * vX(it); if (!/thrust/.test(it.lab)) Wr += vP(it); });
    E.L.H.forEach(function (it) { if (/surcharge/.test(it.lab)) Moq -= it.H * it.y; else Mod -= it.H * it.y; });
    Mod += E.MU;
    var Mo = Mod + Moq, fot = Mr / Math.max(Mo, 1e-6);
    return { Mr: Mr, Mod: Mod, Moq: Moq, Mo: Mo, fot: fot, is456: 0.9 * Mr >= 1.2 * Mod + 1.4 * Moq - 1e-9, Wr: Wr, flo: E.U > 1e-9 ? Wr / E.U : 99 };
  }
  function passive(g, s, hk) {
    var Kp = s.Kp, d = g.ho + g.tb, Pk = hk > 0 ? 0.5 * 0.5 * Kp * s.gam * (Math.pow(d + hk, 2) - d * d) : 0, Pl = s.lowPassive ? 0.5 * 0.5 * Kp * s.gam * d * d : 0;
    return { Pk: Pk, Pl: Pl, d: d };
  }
  /* sliding FoS of case E with a key of depth hk (dV = extra key weight when E was analysed without that key) */
  function slideFoS(g, s, E, hk, dV) { var pp = passive(g, s, hk), Hd = Math.max(-E.Hs, 1e-6); return (s.mu * Math.max(E.V + (dV || 0), 0) + pp.Pk + pp.Pl) / Hd; }

  /* ======================================================================= stability write-up (case E + bearing cases) */
  function stability(c, g, s) {
    var E = analyse(g, caseItems(g, s, CASES.E)), st = stabParts(g, s, E), cb = Math.cos(rad(g.beta)), sb = Math.sin(rad(g.beta));
    c.section("Earth & water pressure on the high side (per metre run)");
    var K = s.K;
    c.calc("Height of the virtual back (underside of base → retained surface at the heel end)", "Hv", "tb + Hr + heel*tan(radians(b))", "m", "Rankine virtual back through the heel end",
      { tb: g.tb, Hr: g.Hr, heel: g.heel, b: g.beta });
    var Ph = c.calc("Earth thrust on the virtual back (horizontal)", "Ph", "0.5*K*g*Hv**2*cos(radians(b))", "kN/m", "Rankine – thrust parallel to the backfill surface, at Hv/3",
      { K: R(K, 5), g: s.gam, Hv: R(g.Hv, 4), b: g.beta });
    var Pqh = s.q > 0 ? c.calc("Surcharge thrust (horizontal, at Hv/2)", "Pqh", "K*q*Hv*cos(radians(b))", "kN/m", "Rankine – uniform surcharge", { K: R(K, 5), q: R(s.q, 4), Hv: R(g.Hv, 4), b: g.beta }) : 0;
    var Pv = g.beta > 0 ? c.calc("Vertical component of the thrust (at the heel end)", "Pv", "(0.5*K*g*Hv**2 + K*q*Hv)*sin(radians(b))", "kN/m", "Rankine sloping backfill",
      { K: R(K, 5), g: s.gam, Hv: R(g.Hv, 4), q: R(s.q, 4), b: g.beta }) : 0;
    var hwt = E.L.hwt, Pw = 0, dPa = 0, U = 0, xU = 0;
    c.let("Water level behind the high wall above invert (effective)", "hw", R(s.hw, 3), "m", s.drained ? "weep holes hold it at the lowest weep row" : "no drainage – ground-water level input (≤ retained height)");
    if (hwt > 0) {
      Pw = c.calc("Water thrust behind the wall (head above underside of base)", "Pw", "0.5*gw*hwt**2", "kN/m", "hydrostatic, at hwt/3", { gw: GW, hwt: R(hwt, 4) });
      dPa = c.calc("Reduction of earth thrust below water (submerged soil γ − γw)", "ΔPa", "0.5*K*gw*hwt**2*cos(radians(b))", "kN/m", "effective stress", { K: R(K, 5), gw: GW, hwt: R(hwt, 4), b: g.beta });
    }
    if (E.U > 0) {
      U = c.calc("Uplift under the base (trapezoid, heel head → toe head)", "U", "(u0 + u1)/2*B", "kN/m", "IS 3370-1 / practice", "u1 = γw(hw + tb) at the heel, u0 = γw(min(hw, ho) + tb) at the toe",
        { u0: R(E.L.u0, 4), u1: R(E.L.u1, 4), B: g.B });
      xU = c.calc("Lever of the uplift from the toe", "xU", "B*(u0 + 2*u1)/(3*(u0 + u1))", "m", "trapezoid centroid", { B: g.B, u0: R(E.L.u0, 4), u1: R(E.L.u1, 4) });
    }
    c.section("Stability of the whole section – drain empty (IRC 78 cl 706.3.4 / IS 456 cl 20)");
    var wv = {}, mv = {}, wn = [], mn = [], k = 0;
    E.L.V.forEach(function (it) { if (/thrust/.test(it.lab)) return; k++; wv["W" + k] = R(vP(it), 4); mv["W" + k] = wv["W" + k]; mv["x" + k] = R(vX(it), 4); wn.push("W" + k); mn.push("W" + k + "*x" + k); });
    var labs = E.L.V.filter(function (it) { return !/thrust/.test(it.lab); }).map(function (it, i) { return "W" + (i + 1) + " " + it.lab + " @ " + F(vX(it), ".3f") + " m"; }).join("; ");
    var W = c.calc("Weights (walls, base, key, soil on toe / heel, cover slabs)", "ΣW", wn.join(" + "), "kN/m", "", labs, wv);
    var Mw = c.calc("Moment of weights about the toe", "Mw", mn.join(" + "), "kN·m/m", "", mv);
    var Mr = c.calc("Restoring moment about the toe", "Mr", "Mw + Pv*B", "kN·m/m", "", { Mw: Mw, Pv: R(Pv, 4), B: g.B });
    var Mo = c.calc("Overturning moment about the toe", "Mo", "Ph*Hv/3 + Pqh*Hv/2 + (Pw - dPa)*hwt/3 + U*xU", "kN·m/m", "",
      { Ph: Ph, Hv: R(g.Hv, 4), Pqh: Pqh, Pw: Pw, dPa: dPa, hwt: R(hwt, 4), U: U, xU: xU });
    var fot = c.calc("Factor of safety against overturning", "FoS_OT", "Mr/Mo", "", "IRC 78 cl 706.3.4", { Mr: Mr, Mo: Math.max(Mo, 1e-6) });
    c.check("Overturning FoS ≥ 2.0", fot, 2.0, { mode: ">=", clause: "IRC 78 cl 706.3.4 / IS 1904 practice", note: fot < 2 ? "lengthen the heel / widen the base" : "" });
    var Moq = c.calc("Overturning moment of the surcharge (imposed)", "Mo,q", "Pqh*Hv/2", "kN·m/m", "", { Pqh: Pqh, Hv: R(g.Hv, 4) });
    c.check("IS 456 cl 20.1: 1.2 Mo(dead) + 1.4 Mo(imposed) ≤ 0.9 Mr", 1.2 * (Mo - Moq) + 1.4 * Moq, 0.9 * Mr, { unit: "kN·m/m", clause: "IS 456 cl 20.1" });
    var V = c.calc("Net vertical force (drain empty, surcharge on heel ignored)", "ΣV", "W + Pv - U", "kN/m", "", { W: W, Pv: R(Pv, 4), U: U });
    var Hs = c.calc("Horizontal force towards the low side", "ΣH", "Ph + Pqh + Pw - dPa", "kN/m", "", { Ph: Ph, Pqh: Pqh, Pw: Pw, dPa: dPa });
    var pp = passive(g, s, g.hk), Pp = 0;
    if (g.hk > 0) {
      c.let("Shear key below the high wall", "hk", g.hk, "m", "IRC 78 / practice", "keyed into undisturbed ground; high-wall bars continued into the key");
      Pp += c.calc("Passive resistance in front of the shear key (50 % mobilised)", "Pp,k", "0.5*0.5*Kp*g*((d + hk)**2 - d**2)", "kN/m", "Rankine Kp; d = low-side ground to underside of base",
        { Kp: R(s.Kp, 4), g: s.gam, d: R(pp.d, 4), hk: g.hk });
    }
    if (s.lowPassive) {
      Pp += c.calc("Passive resistance of the low-side earth (Kp/2, 50 % mobilised)", "Pp,l", "0.5*0.5*Kp*g*d**2", "kN/m", "Rankine Kp – flagged: valid only if the low side is never excavated (services / road works)",
        { Kp: R(s.Kp, 4), g: s.gam, d: R(pp.d, 4) });
      c.warn("Low-side passive resistance used", "Sliding relies on the earth in front of the drain – record it on the drawing; no trench / cable / road widening on that side without re-checking", "IRC 78 / practice");
    }
    var fsl = c.calc("Factor of safety against sliding" + (Pp > 0 ? " (with passive resistance)" : ""), "FoS_SL", "(mu*V + Pp)/Hs", "", "IRC 78 cl 706.3.4", { mu: s.mu, V: Math.max(V, 0), Pp: R(Pp, 4), Hs: Math.max(Hs, 1e-6) });
    c.check("Sliding FoS ≥ 1.5", fsl, 1.5, { mode: ">=", clause: "IRC 78 cl 706.3.4 (≥ 1.4 of IS 456 cl 20.2 also met)", note: fsl < 1.5 ? "shear key / wider base / better base friction" : "" });
    if (E.U > 0) {
      var flo = c.calc("Flotation: FoS = weight of empty drain + soil on projections / uplift", "FoS_fl", "W/U", "", "IS 3370-1 / practice (≥ 1.2)", { W: W, U: Math.max(U, 1e-6) });
      c.check("Flotation FoS ≥ 1.2 (drain empty, high ground water)", flo, 1.2, { mode: ">=", clause: "IS 3370-1 / IS 456 cl 20 practice", note: flo < 1.2 ? "thicker base / wider projections with soil on them / pressure-relief" : "" });
    } else c.info("Flotation", "Ground water below the underside of the base – no uplift (confirm the monsoon / mine-water level)", "");
    // bearing cases
    c.section("Base pressure – edge pressures p_toe / p_heel (IS 1904 / IS 6403)");
    var out = { E: E, st: st, fot: fot, fsl: fsl, Pp: Pp, V: V, Hs: Hs, Mr: Mr, Mo: Mo, cases: {} }, okAll = true;
    ["E", "Eq", "Fq"].forEach(function (key) {
      var an = key === "E" ? E : analyse(g, caseItems(g, s, CASES[key])), cl = CASES[key].lab, tag = " – " + cl.split(",")[0].toLowerCase() + (key === "E" ? ", no surcharge on heel" : key === "Eq" ? ", surcharge on heel" : "");
      var dV = an.V - E.V, dM = (an.Md - an.MU + an.MH) - (E.Md - E.MU + E.MH);
      var Vt = key === "E" ? V : c.calc("Net vertical force" + tag, "V", "V0 + dV", "kN/m", "", key === "Fq" ? "+ water in the drain and surcharge on the heel" : "+ surcharge on the heel", { V0: V, dV: R(dV, 4) });
      var xb = c.calc("Resultant from the toe" + tag, "x̄", "(Mr - Mo + dM)/V", "m", "", { Mr: Mr, Mo: Mo, dM: R(dM, 4), V: Math.max(Vt, 1e-6) });
      var e = c.calc("Eccentricity (+ towards the toe / low side, − towards the heel)" + tag, "e", "B/2 - xb", "m", "", { B: g.B, xb: xb });
      var pt = c.calc("Base pressure at the toe (low side)" + tag, "p_toe", "V/B*(1 + 6*e/B)", "kN/m²", "IS 1904 (linear)", { V: Math.max(Vt, 1e-6), B: g.B, e: e });
      var ph = c.calc("Base pressure at the heel (high side)" + tag, "p_heel", "V/B*(1 - 6*e/B)", "kN/m²", "IS 1904 (linear)", { V: Math.max(Vt, 1e-6), B: g.B, e: e });
      var pm = Math.max(pt, ph);
      if (Math.abs(e) > g.B / 6) pm = c.calc("Peak pressure – resultant outside the middle third (no tension, contact 3a)" + tag, "pmax", "2*V/(3*max(B/2 - abs(e), 0.01))", "kN/m²", "IS 1904",
        { V: Math.max(Vt, 1e-6), B: g.B, e: e });
      var side = e >= 0 ? "toe" : "heel";
      var a = c.check("Max. base pressure (" + side + ") ≤ SBC" + tag, pm, s.sbc, { unit: "kN/m²", clause: "IS 1904 / IS 6403", note: pm > s.sbc ? "widen the base" + (e < 0 ? " / add a toe (resultant towards the heel)" : " / lengthen the toe") : "" });
      var b = c.ok("No tension under the base: |e| ≤ B/6" + tag, Math.abs(e) <= g.B / 6 + 1e-9, { detail: "e = " + F(e, ".3f") + " m (" + (e >= 0 ? "towards the toe" : "towards the heel") + ") vs B/6 = " + F(g.B / 6, ".3f") + " m; p_toe = " + F(pt, ".1f") + ", p_heel = " + F(ph, ".1f") + " kN/m²", clause: "IS 1904 / IRC 78 practice" });
      okAll = okAll && a && b;
      out.cases[key] = { an: an, V: Vt, e: e, pt: pt, ph: ph, pmax: pm };
    });
    out.ok = okAll && fot >= 2 - 1e-9 && fsl >= 1.5 - 1e-9;
    return out;
  }
  M.stability = stability;

  /* ======================================================================= structural design */
  function structural(c, g, s, mat, given, mode, tag) {
    var dt = DT(), cover = mat.cover, fck = mat.fck, fy = mat.fy, out = {}, ok = true;
    var Kh = s.K * Math.cos(rad(g.beta)), Hr = g.Hr, hww = clamp(s.hw, 0, Hr), D = g.D, ho = g.ho;
    function amin(tmm) { var w = dt ? dt.water_min_steel(tmm) : { As: RC().min_steel_water(tmm) / 100 * 1000 * tmm / 2, text: "", clause: "IS 3370-2 cl 8.1" }; return { As: w.As, label: "Minimum steel per face (IS 3370-2)", clause: w.clause, text: w.text }; }
    var rule = dt ? { member: "water", role: "main" } : null, dias = [10, 12, 16, 20, 25];
    // ---------------- high wall
    c.section("High (retaining) wall – cantilever from the base" + (tag || ""));
    c.let("High wall: height above invert / thickness", "Hh / th", F(g.Hh, ".2f") + " / " + F(g.th, ".3f"), "m", "", "earth retained to " + F(Hr, ".2f") + " m above invert");
    var Mhe = c.calc("Service moment at the base of the high wall – earth face (drain empty)", "Ms,e", "Kh*g*h**3/6 + Kh*q*h**2/2 + (1 - Kh)*gw*hw**3/6", "kN·m/m",
      "Rankine (horizontal component) + surcharge" + (hww > 0 ? " + water (no drainage)" : ""), { Kh: R(Kh, 5), g: s.gam, h: Hr, q: R(s.q, 4), gw: GW, hw: R(hww, 4) });
    var Vhe = Kh * s.gam * Hr * Hr / 2 + Kh * s.q * Hr + (1 - Kh) * GW * hww * hww / 2;
    var Mhw = c.calc("Service moment at the base of the high wall – water face (drain full, before backfilling)", "Ms,w", "gw*d**3/6", "kN·m/m", "IS 3370-1 water test", { gw: GW, d: D });
    var Vhw = GW * D * D / 2, Ah = amin(g.th * 1000);
    out.he = X().designStrip(c, 1.5 * Mhe, g.th * 1000, cover, fck, fy, "high wall, earth face", { Ms: Mhe, climit: 0.2, given: given ? given.he : null, rule: rule, Amin: Ah, Vu: 1.5 * Vhe, dias: dias });
    out.hw = X().designStrip(c, 1.5 * Mhw, g.th * 1000, cover, fck, fy, "high wall, water face", { Ms: Mhw, climit: 0.2, given: given ? given.hw : null, rule: rule ? Object.assign({ prefer: [out.he.dia] }, rule) : null, Amin: Ah, Vu: 1.5 * Vhw, dias: dias });
    var gH = Vhe >= Vhw ? out.he : out.hw;
    RC().shear(c, 1.5 * Math.max(Vhe, Vhw), 1000, gH.d, 100 * gH.Ast_prov / (1000 * gH.d), fck, fy, "slab", { D: g.th * 1000, tag: "(high wall)" });
    // curtailment of the earth-face bars (half the bars stop where the half bars suffice, + Ld beyond)
    out.hc = 0;
    if (Hr >= 2.0 - 1e-9) {
      var Mfun = function (y) { var yw = Math.max(0, y - (Hr - hww)); return 1.5 * (Kh * s.gam * y * y * y / 6 + Kh * s.q * y * y / 2 + (1 - Kh) * GW * yw * yw * yw / 6); };
      var Mb = Mfun(Hr), Ahf = out.he.Ast_prov / 2, dd = out.he.d;
      var Mrh = 0.87 * fy * Ahf * dd * (1 - Ahf * fy / (1000 * dd * fck)) / 1e6;
      var bis = function (f) { var lo = 0, hi = Hr; if (f(hi) >= 0) return Hr; for (var i = 0; i < 60; i++) { var md = (lo + hi) / 2; if (f(md) >= 0) lo = md; else hi = md; } return lo; };
      var y1 = bis(function (y) { return Mb / 2 - Mfun(y); }), y2 = bis(function (y) { return Mrh - Mfun(y); }), yc = Math.min(y1, y2);
      c.calc("Curtailment: Mu at depth y1 below the retained surface where Mu(y1) = Mu,base/2", "Mu(y1)", "1.5*(Kh*g*y**3/6 + Kh*q*y**2/2 + (1 - Kh)*gw*max(y - (h - hw), 0)**3/6)", "kN·m/m",
        "IS 456 cl 26.2.3.1", "Mu,base/2 = " + F(Mb / 2, ".2f") + " kN·m/m; y1 = " + F(y1, ".3f") + " m (bisection)", { Kh: R(Kh, 5), g: s.gam, y: R(y1, 4), q: R(s.q, 4), gw: GW, h: Hr, hw: R(hww, 4) });
      c.calc("Moment capacity of half the earth-face bars", "Mu,½", "0.87*fy*As*d*(1 - As*fy/(1000*d*fck))/1e6", "kN·m/m", "IS 456 Annex G-1.1(b)", { fy: fy, As: R(Ahf, 1), d: R(dd, 1), fck: fck });
      var hc = c.calc("Half the earth-face bars stopped at height above invert", "hc", "h - y", "m", "IS 456 cl 26.2.3.1 (+ Ld beyond the theoretical cut-off)", "y = min(y1, y2) – y2 where the half bars just suffice",
        { h: Hr, y: R(yc, 4) });
      var Lext = Math.max(BB().Ld(out.he.dia, fck, fy), 12 * out.he.dia, out.he.d) / 1000;
      if (hc + Lext < g.Hh - 0.3) out.hc = hc;
      else c.info("Curtailment", "Not worthwhile – cut-off + Ld reaches within 0.3 m of the wall top; all earth-face bars run full height", "SP 34");
    } else c.info("Curtailment", "Retained height < 2 m – earth-face bars run full height", "SP 34 practice");
    // ---------------- low wall
    c.section("Low wall – cantilever from the base" + (tag || ""));
    var KaL = s.KaLo;
    var Mli = ho > 0 ? c.calc("Service moment at the base of the low wall – inner face (drain empty, low-side earth + surcharge)", "Ms,i", "Ka*g*h**3/6 + Ka*q*h**2/2", "kN·m/m", "Rankine active",
      { Ka: R(KaL, 5), g: s.gam, h: ho, q: s.qlo }) : 0;
    if (ho <= 0) c.info("Low wall – inner face", "No earth on the low side – inner face takes the minimum steel", "");
    var Vli = KaL * s.gam * ho * ho / 2 + KaL * s.qlo * ho;
    var Mlo = c.calc("Service moment at the base of the low wall – outer face (drain full, low-side earth absent)", "Ms,o", "gw*d**3/6", "kN·m/m", "IS 3370-1 water test / excavated low side", { gw: GW, d: D });
    var Vlo = GW * D * D / 2, Al = amin(g.tl * 1000);
    out.lo = X().designStrip(c, 1.5 * Mlo, g.tl * 1000, cover, fck, fy, "low wall, outer face", { Ms: Mlo, climit: 0.2, given: given ? given.lo : null, rule: rule, Amin: Al, Vu: 1.5 * Vlo, dias: dias });
    out.li = X().designStrip(c, Math.max(1.5 * Mli, 0.01), g.tl * 1000, cover, fck, fy, "low wall, inner face", { Ms: Mli, climit: 0.2, given: given ? given.li : null, rule: rule ? Object.assign({ prefer: [out.lo.dia] }, rule) : null, Amin: Al, Vu: 1.5 * Vli, dias: dias });
    var gL = Vlo >= Vli ? out.lo : out.li;
    RC().shear(c, 1.5 * Math.max(Vlo, Vli), 1000, gL.d, 100 * gL.Ast_prov / (1000 * gL.d), fck, fy, "slab", { D: g.tl * 1000, tag: "(low wall)" });
    // ---------------- base slab (free body of the whole section, 4 cases)
    c.section("Base slab – continuous member under both walls" + (tag || ""));
    c.info("Base analysis", "Rigid base: soil pressure + uplift from the equilibrium of the whole section; moments by the free body left of each section (walls with their lateral loads, water, " +
      "low-side earth, friction ∝ contact pressure at the underside); heel as a cantilever from the high wall (vertical loads). Cases: " + ["S1", "S2", "S3", "T"].map(function (k) { return CASES[k].lab; }).join("; "), "Statics [APPROX – rigid base]");
    var env = { bot: 0, top: 0, V: 0, rows: [] }, xs = [];
    if (g.toe > 0.05) xs.push(g.toe);
    for (var i = 0; i <= 20; i++) xs.push(g.x1 + g.Bc * i / 20);
    var bv = {}, tv = {};
    ["S1", "S2", "S3", "T"].forEach(function (k, j) {
      var an = analyse(g, caseItems(g, s, CASES[k])), mb = 0, mt = 0, xb = 0, xt = 0;
      xs.forEach(function (x) { var r = leftM(g, an, x); if (r.M > mb) { mb = r.M; xb = x; } if (-r.M > mt) { mt = -r.M; xt = x; } });
      var hm = heelM(g, an); if (hm.M > mt) { mt = hm.M; xt = g.x3; }
      var v1 = Math.abs(leftM(g, an, g.x1).V), v2 = Math.abs(leftM(g, an, g.x2).V), vt = g.toe > 0.05 ? Math.abs(leftM(g, an, g.toe).V) : 0;
      env.V = Math.max(env.V, v1, v2, vt, Math.abs(hm.V));
      bv["M" + (j + 1)] = R(mb, 3); tv["M" + (j + 1)] = R(mt, 3);
      env.rows.push([k, CASES[k].lab, R(an.V, 2), R(an.e, 3), R(an.p_toe, 1), R(an.p_heel, 1), R(mb, 2), R(xb, 2), R(mt, 2), R(xt, 2)]);
      c.let("Case " + k + " – " + CASES[k].lab, "", "V " + F(an.V, ".1f") + " kN/m, e " + F(an.e, ".3f") + " m, p_toe " + F(an.p_toe, ".1f") + " / p_heel " + F(an.p_heel, ".1f") +
        " kN/m²; sagging " + F(mb, ".2f") + " @ x " + F(xb, ".2f") + ", hogging " + F(mt, ".2f") + " @ x " + F(xt, ".2f") + " m", "kN·m/m", "x from the toe");
    });
    var Mbb = c.calc("Design service moment – base, bottom face (sagging envelope)", "Ms,b", "max(M1, M2, M3, M4)", "kN·m/m", "", bv);
    var Mbt = c.calc("Design service moment – base, top face (hogging envelope incl. heel)", "Ms,t", "max(M1, M2, M3, M4)", "kN·m/m", "", tv);
    var Vb = c.let("Max. shear in the base at the wall / heel / toe faces (service)", "Vb", R(env.V, 3), "kN/m", "free body", "taken at the face (conservative)");
    var Ab = amin(g.tb * 1000);
    out.bb = X().designStrip(c, Math.max(1.5 * Mbb, 0.01), g.tb * 1000, cover, fck, fy, "base, bottom face", { Ms: Mbb, climit: 0.2, given: given ? given.bb : null, rule: rule ? Object.assign({ prefer: [out.he.dia] }, rule) : null, Amin: Ab, Vu: 1.5 * Vb, dias: dias });
    out.bt = X().designStrip(c, Math.max(1.5 * Mbt, 0.01), g.tb * 1000, cover, fck, fy, "base, top face", { Ms: Mbt, climit: 0.2, given: given ? given.bt : null, rule: rule ? Object.assign({ prefer: [out.bb.dia, out.he.dia] }, rule) : null, Amin: Ab, Vu: 1.5 * Vb, dias: dias });
    var gB = out.bb.Ast_prov <= out.bt.Ast_prov ? out.bb : out.bt;
    RC().shear(c, 1.5 * Vb, 1000, gB.d, 100 * gB.Ast_prov / (1000 * gB.d), fck, fy, "slab", { D: g.tb * 1000, tag: "(base slab at wall faces)" });
    // ---------------- shear key steel
    if (g.hk > 0) {
      var d0 = g.ho + g.tb, Mk = c.calc("Shear key moment at its root (factored, full passive)", "Mu,k", "1.5*0.5*Kp*g*hk**2*(d + hk/3)", "kN·m/m", "IS 456 cl 18.2", { Kp: R(s.Kp, 4), g: s.gam, hk: g.hk, d: R(d0, 4) });
      var dk = g.th * 1000 - cover - out.he.dia / 2, Ak = 1000 * area(out.he.dia) / out.he.spacing, Akr = Mk * 1e6 / (0.87 * fy * 0.9 * dk);
      c.check("Shear key steel (high-wall earth-face bars continued) ≥ required", Ak, Akr, { unit: "mm²/m", mode: ">=", clause: "IS 456 Annex G (lever arm 0.9 d)", note: Ak < Akr ? "thicken the high wall / closer bars" : "" });
    }
    // ---------------- distribution (horizontal / longitudinal) steel
    c.section("Distribution / horizontal steel (IS 3370-2 minimum, each face)" + (tag || ""));
    var gd = given ? given.dist : null, mH = Math.max(out.he.dia, out.hw.dia, 12), mL = Math.max(out.lo.dia, out.li.dia, 12), mB = Math.max(out.bb.dia, out.bt.dia, 12);
    var dmem = dt ? "water" : "drain";
    out.dh = X().stripBars(c, amin(g.th * 1000).As, dmem, "dist", g.th * 1000 - cover - 16, g.th * 1000, gd, "high wall horizontal, each face", { dias: [10, 12, 16, 20], rule: { main_dia: mH }, clause: "IS 3370-2 cl 8.1" });
    out.dl = X().stripBars(c, amin(g.tl * 1000).As, dmem, "dist", g.tl * 1000 - cover - 16, g.tl * 1000, gd, "low wall horizontal, each face", { dias: [10, 12, 16, 20], rule: { main_dia: mL }, clause: "IS 3370-2 cl 8.1" });
    out.db = X().stripBars(c, amin(g.tb * 1000).As, dmem, "dist", g.tb * 1000 - cover - 16, g.tb * 1000, gd, "base longitudinal, each face", { dias: [10, 12, 16, 20], rule: { main_dia: mB }, clause: "IS 3370-2 cl 8.1" });
    out.env = env; out.Mhe = Mhe; out.Mhw = Mhw; out.Mli = Mli; out.Mlo = Mlo; out.Mbb = Mbb; out.Mbt = Mbt;
    return out;
  }
  M.structural = structural;

  /* ======================================================================= run */
  function run_drain_retaining(inp, mode) {
    var c = new C.Calc("Drain-cum-retaining wall");
    var fck = num(inp.fck), fy = num(inp.fy), gam = num(inp.gamma), phi = clamp(num(inp.phi), 15, 45), mu = num(inp.mu), sbc = Math.max(num(inp.sbc), 1);
    var Bc = Math.max(num(inp.width), 0.2), Dd = Math.max(num(inp.depth), 0.2), Hr = Math.max(num(inp.h_ret), 0.2), Lrun = Math.max(num(inp.length), 1);
    var beta = clamp(num(inp.beta), 0, Math.max(phi - 1, 0)), ho = num(inp.h_out), up = Math.max(num(inp.upstand), 0);
    var covered = /^Covered/.test(String(inp.covered)), tcs = covered ? clamp(num(inp.t_cs), 0.05, 0.3) : 0;
    var drained = /^Weep/.test(String(inp.drainage)), atRest = /^At rest/.test(String(inp.pressure)), useKey = /^Shear key/.test(String(inp.shear_key));
    var cut = /^Toe of a cut/.test(String(inp.situation));
    // ---------------------------------------------------------------- materials & cover
    var cover = num(inp.cover), req = Math.max(RC().required_cover(inp.exposure, "beam"), 45), mineCov = isMine() && DS.site && DS.site.COVER ? DS.site.COVER.rcc_drain + ((DS.site.cfg || {}).cover_extra || 0) : 0;
    c.section("Materials & cover");
    if (mode !== "check" && cover < Math.max(req, mineCov)) { c.info("Cover adopted", G(cover) + " mm raised to " + G(Math.max(req, mineCov)) + " mm (" + inp.exposure + " exposure, liquid-retaining faces" + (mineCov > req ? ", mining area" : "") + ")", "IS 456 Table 16 / IS 3370-2 cl 4.2"); cover = Math.max(req, mineCov); }
    RC().cover_check(c, inp.exposure, cover, fck, "beam");
    c.ok("Cover ≥ 45 mm on liquid-retaining faces", cover >= 45 - 1e-9, { detail: G(cover) + " mm", clause: "IS 3370-2:2009 cl 4.2 (verify)", warn_only: true });
    c.ok("Concrete ≥ M30 for liquid-retaining RCC", fck >= 30 - 1e-9, { detail: "M" + G(fck), clause: "IS 3370-2:2009 cl 4.1 / IS 456 Table 5", warn_only: true });
    if (DT()) DT().site_checks(c, "drain", fck, cover);
    var mat = { fck: fck, fy: fy, cover: cover };
    // ---------------------------------------------------------------- geometry
    c.section("Geometry (x from the toe = low-side outer edge; levels from the drain invert)");
    c.let("Drain clear width × depth (invert to top of the low wall)", "B × D", F(Bc, ".2f") + " × " + F(Dd, ".2f"), "m");
    c.let("Retained earth on the high side above invert", "Hr", Hr, "m", "", Hr > Dd ? "high wall extends " + F(Hr - Dd, ".2f") + " m above the low wall" : "");
    if (ho > Dd + 1e-9) { c.warn("Low-side ground above the low wall", "Ground on the low side " + F(ho, ".2f") + " m is above the low wall (" + F(Dd, ".2f") + " m) – taken at the wall top; raise the low wall or grade the side away", "Practice"); ho = Dd; }
    ho = Math.max(ho, 0);
    if (Hr < ho) c.warn("Retained side lower than the low side", "Hr < low-side ground – the 'high' wall does not retain more than the low wall; check the arrangement", "");
    var Hh = c.calc("High wall height above invert", "Hh", "max(Hr + up, D)", "m", "", "up = kerb / parapet above the retained earth", { Hr: Hr, up: up, D: Dd });
    c.let("Low-side ground above invert", "ho", R(ho, 3), "m", "", "low-wall outer face buried to this level");
    if (beta > 0) c.let("Backfill slope above the high wall", "β", beta, "°", "Rankine (β < φ)");
    // ---------------------------------------------------------------- hydraulics
    var hyd = hydraulics(c, inp, Bc, Dd);
    // ---------------------------------------------------------------- loads & soil
    var sur = surcharge(c, inp, gam);
    c.section("Soil, water & stability criteria");
    var K = atRest ? c.calc("Earth pressure coefficient on the high side – at rest", "K0", "(1 - sin(radians(ph)))*(1 + sin(radians(b)))", "", "Jaky; sloping backfill (1 + sin β) [APPROX]", { ph: phi, b: beta })
      : c.calc("Earth pressure coefficient on the high side – Rankine active", "Ka", "cos(radians(b))*(cos(radians(b)) - sqrt(cos(radians(b))**2 - cos(radians(ph))**2))/(cos(radians(b)) + sqrt(cos(radians(b))**2 - cos(radians(ph))**2))",
        "", "Rankine (thrust parallel to the backfill surface)", { b: beta, ph: phi });
    var KaLo = c.calc("Active coefficient on the low side (level ground)", "Ka,lo", "(1 - sin(radians(ph)))/(1 + sin(radians(ph)))", "", "Rankine", { ph: phi });
    var Kp = c.calc("Passive coefficient (key / low side)", "Kp", "(1 + sin(radians(ph)))/(1 - sin(radians(ph)))", "", "Rankine", { ph: phi });
    var gwl = num(inp.gwl), y0w = Math.min(Math.max(0.15, ceil_to(hyd.yn, 0.05)), Math.max(Hr - 0.3, 0.15)), hw = drained ? Math.min(gwl, y0w) : Math.min(gwl, Hr);
    c.let("Ground-water level behind the wall above invert (input)", "GWL", gwl, "m", "highest monsoon / mine-water level", drained ? "weep holes relieve it to the lowest weep row (+" + F(y0w, ".2f") + " m, at / above the design flow level)" : "no weep holes – full hydrostatic pressure + uplift");
    c.let("Backfill / ground", "γ / φ / μ / SBC", G(gam) + " kN/m³ / " + G(phi) + "° / " + G(mu) + " / " + G(sbc) + " kN/m²", "", "IRC 78 App. 6 / IS 6403", isMine() ? "mining profile applied (site)" : "");
    c.let("Criteria", "", "Overturning FoS ≥ 2.0, sliding FoS ≥ 1.5, pmax ≤ SBC, no tension (|e| ≤ B/6), flotation FoS ≥ 1.2", "", "IRC 78 cl 706.3.4 / IS 456 cl 20 / IS 3370-1");
    if (!drained) c.warn("No weep holes", "Water behind the high wall + uplift – weep holes into the drain with a filter normally save 20–40 % concrete & steel", "IRC 78 / IS 456 cl 20");
    var s = { gam: gam, phi: phi, K: K, KaLo: KaLo, Kp: Kp, q: sur.q, qlo: Math.max(num(inp.surcharge_lo), 0), mu: mu, sbc: sbc, hw: hw, drained: drained, lowPassive: /^Passive/.test(String(inp.low_side)) };
    var wc = covered ? 25 * tcs * (Bc + 0.2) : 0;
    var base = { Bc: Bc, D: Dd, Hr: Hr, Hh: Hh, ho: ho, beta: beta, wc: wc };
    // ---------------------------------------------------------------- sizing
    var t, gv = null, searchNote = "";
    var Wmax = function (tb) { return Math.max(3.0, ceil_to(1.5 * (Hr + tb), 0.1)); };
    var cache = {};
    function search(th, tl, tb) { var k = th + "|" + tl + "|" + tb; if (!cache[k]) cache[k] = search0(th, tl, tb); return cache[k]; }
    function search0(th, tl, tb) {
      var Wm = Wmax(tb), best = null, bs = Infinity;
      for (var W = 0; W <= Wm + 1e-9; W = R(W + 0.1, 2)) {
        for (var heel = W; heel >= -1e-9; heel = R(heel - 0.1, 2)) {
          var g0 = mkGeo(base, { th: th, tl: tl, tb: tb, toe: R(W - heel, 2), heel: Math.max(heel, 0), hk: 0 }), qk = quick(g0, s);
          if (!qk.okx) { if (qk.score < bs) { bs = qk.score; best = { toe: g0.toe, heel: g0.heel, hk: useKey ? 1.5 : 0, ok: false }; } continue; }
          if (qk.fsl(0) >= 1.5 - 1e-9) return { toe: g0.toe, heel: g0.heel, hk: 0, ok: true };
          if (useKey) for (var h = 0.3; h <= 1.5 + 1e-9; h = R(h + 0.05, 2)) {      // sliding with the key weight; then re-verify bearing with the key
            if (qk.fsl(h) < 1.5 - 1e-9) continue;
            var qk2 = quick(mkGeo(base, { th: th, tl: tl, tb: tb, toe: g0.toe, heel: g0.heel, hk: h }), s);
            if (qk2.okx && qk2.fsl(h) >= 1.5 - 1e-9) return { toe: g0.toe, heel: g0.heel, hk: h, ok: true };
            break;
          }
          var sl = Math.max(qk.score, 1.5 / Math.max(qk.fsl(useKey ? 1.5 : 0), 1e-6));
          if (sl < bs) { bs = sl; best = { toe: g0.toe, heel: g0.heel, hk: useKey ? 1.5 : 0, ok: false }; }
        }
      }
      return best || { toe: R(Wm / 3, 1), heel: R(Wm - R(Wm / 3, 1), 2), hk: useKey ? 1.5 : 0, ok: false };
    }
    var H0 = Math.max(Hr, Dd);
    if (mode === "check") {
      t = { th: Math.max(num(inp.th_chk), 0.1), tl: Math.max(num(inp.tl_chk), 0.1), tb: Math.max(num(inp.tb_chk), 0.1), toe: Math.max(num(inp.toe_chk), 0), heel: Math.max(num(inp.heel_chk), 0), hk: Math.max(num(inp.key_chk), 0) };
      gv = { he: [num(inp.he_dia), num(inp.he_s)], hw: [num(inp.hw_dia), num(inp.hw_s)], lo: [num(inp.lo_dia), num(inp.lo_s)], li: [num(inp.li_dia), num(inp.li_s)],
        bb: [num(inp.bb_dia), num(inp.bb_s)], bt: [num(inp.bt_dia), num(inp.bt_s)], dist: [num(inp.dist_dia), num(inp.dist_s)] };
    } else {
      var th = Math.max(0.2, ceil_to(H0 / 12, 0.025)), tl = Math.max(0.15, ceil_to(Dd / 10 + 0.05, 0.025)), tb = Math.max(0.2, ceil_to(Math.max(th, tl), 0.025));
      if (mode === "thumb") {
        var hl0 = Math.max(0, ceil_to(Math.max(0.6 * (Hr + tb) - (tl + Bc + th), 0.45 * (Hr + tb) - th), 0.1));
        t = { th: th, tl: tl, tb: tb, toe: 0, heel: hl0, hk: 0 };
        if (useKey) { var gq = mkGeo(base, t), qq = quick(gq, s); if (qq.fsl(0) < 1.5) for (var h2 = 0.3; h2 <= 1.5 + 1e-9; h2 = R(h2 + 0.05, 2)) { if (qq.fsl(h2) >= 1.5) { t.hk = h2; break; } } }
        c.info("Thumb-rule proportions", "High wall ≈ H/12 (≥ 200), low wall ≈ D/10 + 50 (≥ 150), base ≈ wall, overall base ≈ 0.6 (Hr + tb) and heel ≈ 0.45 (Hr + tb) − th (the drain itself carries no soil); then every code check", "Practice / Punmia");
      } else {
        var sr;
        for (var it = 0; it < 40; it++) {
          sr = search(th, tl, tb);
          var sc = new C.Calc("s"), g1 = mkGeo(base, { th: th, tl: tl, tb: tb, toe: sr.toe, heel: sr.heel, hk: sr.hk });
          structural(sc, g1, s, mat, null, mode, "");
          var fl = sc.failures, ch = false;
          fl = fl.filter(function (x) { return !/^Distribution/.test(x.section); });     // min-steel shortfalls follow from the thickness
          var who = function (x) { return /Shear key|high wall/.test(x.label) || /^High \(retaining\) wall/.test(x.section) ? "hi" : /low wall/.test(x.label) || /^Low wall/.test(x.section) ? "lo" : "base"; };
          if (fl.some(function (x) { return who(x) === "hi"; }) && th < Math.max(0.6, H0 / 4)) { th = R(th + 0.025, 3); ch = true; }
          if (fl.some(function (x) { return who(x) === "lo"; }) && tl < Math.max(0.5, Dd / 3)) { tl = R(tl + 0.025, 3); ch = true; }
          if (fl.some(function (x) { return who(x) === "base"; }) && tb < Math.max(0.8, H0 / 4)) { tb = R(tb + 0.025, 3); ch = true; }
          if (!sr.ok && !ch && tb < Math.max(0.8, H0 / 4)) { var qf = quick(mkGeo(base, { th: th, tl: tl, tb: tb, toe: sr.toe, heel: sr.heel, hk: sr.hk }), s); if (qf.st.flo < 1.2) { tb = R(tb + 0.05, 3); ch = true; } }
          if (tb < Math.max(th, tl) - 1e-9) { tb = ceil_to(Math.max(th, tl), 0.025); ch = true; }
          if (!ch) break;
        }
        sr = search(th, tl, tb);
        t = { th: th, tl: tl, tb: tb, toe: sr.toe, heel: sr.heel, hk: sr.hk };
        if (!sr.ok) searchNote = "No toe / heel up to " + F(Wmax(tb), ".1f") + " m in total satisfies stability, bearing, no-tension and flotation – the SBC is too low or the surcharge / water too high for this height: improve the ground, set traffic back, provide weep holes or use a counterfort / piled wall";
      }
    }
    var g = mkGeo(base, t);
    c.section("Section adopted");
    c.let("Walls: high / low thickness", "th / tl", F(g.th, ".3f") + " / " + F(g.tl, ".3f"), "m", mode === "check" ? "given" : mode === "thumb" ? "thumb rule" : "designed (strength, crack width, min. steel)");
    c.let("Base: thickness / toe / heel / overall width", "tb / toe / heel / B", F(g.tb, ".3f") + " / " + F(g.toe, ".2f") + " / " + F(g.heel, ".2f") + " / " + F(g.B, ".2f"), "m",
      mode === "check" ? "given" : mode === "thumb" ? "B ≈ 0.6 (Hr + tb), heel ≈ 0.45 (Hr + tb) − th" : "designed (smallest base passing stability, bearing, no tension & flotation)");
    if (searchNote) c.warn("Base width limit reached", searchNote, "IRC 78 / IS 1904");
    // ---------------------------------------------------------------- stability & structure
    var stab = stability(c, g, s);
    var st = structural(c, g, s, mat, gv, mode, "");
    // ---------------------------------------------------------------- drainage – weep holes
    c.section("Weep holes & filter (high wall → drain)");
    var w = null;
    if (drained) {
      var wd = num(inp.weep_dia), wsh = Math.max(num(inp.weep_sh), 0.25), wsv = Math.max(num(inp.weep_sv), 0.25), wf = num(inp.filter_t);
      var y0 = y0w, rows = Hr - 0.3 >= y0 ? Math.floor((Hr - 0.3 - y0) / wsv + 1e-9) + 1 : 1, per = Math.floor(Lrun / wsh + 1e-9) + 1;
      c.let("Weep holes", "", G(wd) + " mm PVC through the high wall @ " + F(wsh, ".2f") + " m c/c, " + rows + " row(s) @ " + F(wsv, ".2f") + " m, lowest row +" + F(y0, ".2f") +
        " m above invert (≥ 150 mm and at / above the design flow level), sloping 1 in 20 into the drain, staggered", "", "IRC 78 / IRC SP-42 / MORT&H 2706 practice");
      var nw = c.calc("Number of weep holes", "nw", "rows*per", "nos", "", { rows: rows, per: per });
      c.ok("Weep hole diameter ≥ 75 mm", wd >= 75, { detail: G(wd) + " mm", clause: "practice (75–100 mm; 150 mm for coarse backfill)" });
      c.ok("Weep holes ≤ 1.5 m c/c horizontally", wsh <= 1.5 + 1e-9, { detail: F(wsh, ".2f") + " m", clause: "IRC 78 / practice", warn_only: wsh <= 2.0 });
      c.ok("Weep-hole rows ≤ 1.5 m apart vertically", wsv <= 1.5 + 1e-9, { detail: F(wsv, ".2f") + " m", clause: "practice", warn_only: true });
      c.ok("Filter media behind weep holes ≥ 300 mm", wf >= 300 - 1e-9, { detail: G(wf) + " mm graded filter / geotextile wrap", clause: "IRC 78 App. 6 / MORT&H 2504", warn_only: wf >= 200 });
      c.ok("Lowest weep row at / above the design flow level", y0 >= hyd.yn - 1e-9, { detail: "row +" + F(y0, ".2f") + " m vs flow " + F(hyd.yn, ".2f") + " m – weeps below the flow level back-flood the backfill in a storm (flap valves / non-return)", clause: "practice", warn_only: true });
      w = { dia: wd, sh: wsh, sv: wsv, ft: wf, rows: rows, per: per, n: nw, y0: y0 };
    } else c.info("Weep holes", "Not provided – the high wall, base and flotation are designed for the ground-water level " + F(hw, ".2f") + " m above invert", "");
    // ---------------------------------------------------------------- joints
    c.section("Expansion / contraction joints");
    var Lj = clamp(num(inp.joint_sp), 3, 30), nP = Math.max(1, Math.ceil(Lrun / Lj - 1e-9)), Lp = Lrun / nP, nJ = nP - 1;
    c.let("Panel length between joints", "Lp", R(Lp, 3), "m", "IS 3370-1 cl 7 / practice (≤ 10–15 m)", nP + " panel(s), " + nJ + " joint(s) with PVC water-stop (IS 12200) 225 mm + 20 mm filler board + sealant");
    c.ok("Joint spacing ≤ 15 m", Lj <= 15 + 1e-9, { detail: F(Lj, ".1f") + " m", clause: "IS 3370-1 cl 7 (shrinkage / temperature – verify)", warn_only: true });
    var girth = Hh + Dd + (g.x2 - g.toe) + g.tb;
    // ---------------------------------------------------------------- thumbs & missing
    c.thumb("Overall base width", 0.6 * (Hr + g.tb), g.B, "m", "≈ 0.5–0.6 × (retained height + base)", "Punmia / practice");
    c.thumb("High wall thickness", Math.max(200, H0 / 12 * 1000), g.th * 1000, "mm", "H / 12 (≥ 200)", "Punmia / practice");
    c.thumb("Low wall thickness", Math.max(150, Dd * 100 + 50), g.tl * 1000, "mm", "D/10 + 50 (≥ 150)", "Practice");
    c.miss("Geotechnical investigation: SBC, φ, γ, base friction and the highest ground-water level at the drain line (IS 1892 / IS 6403); the values used are assumptions", "IS 1892 / IS 6403", "Important");
    c.miss("Joint details: PVC water-stop (IS 12200) continuous round the U, filler board, sealant groove, dowels / shear keys across contraction joints", "IS 3370-1 cl 7 / IRC SP-42", "Important");
    c.miss("Outfall: invert levels, longitudinal section with falls to a safe outfall (nallah / sump), drop structures where velocity > 3 m/s, silt pits at intervals", "IRC SP-42 / CPHEEO", "Important");
    if (covered) c.miss("Cover slabs: design in the drain-cover module for the actual wheel load (IRC Class A / 70R / dumper) – only their weight is included here", "IRC 6 / IS 456", "Critical");
    c.miss("Global (slip-circle) stability of the cut / embankment slope above the high wall", "IS 14458 / IRC 75", "Advisory");
    c.miss("Seismic earth pressure (IS 1893-3) – Korba is zone II, usually not critical; check for zone III+", "IS 1893-3", "Advisory");
    if (sur.kind === "dumper") c.miss("Keep dumper wheels ≥ " + F(Math.max(1.5, num(inp.setback)), ".1f") + " m from the wall top with a safety bund ≥ ½ wheel height; guard stones / crash barrier where the drain is crossed", "CMR 2017 / DGMS", "Critical");
    if (isMine()) c.miss("Mine water / coal fines: silt pits every 30–50 m, sulphate / pH test of mine water (SRC / slag cement + bitumen on earth faces if aggressive)", "IS 456 Table 4 / practice", "Important");
    // ---------------------------------------------------------------- BBS
    var B_ = BB(), bbs = [], cv = cover, nPan = nP, Lpm = Lp * 1000, tbm = g.tb * 1000;
    var cnt = function (s) { return B_.count(Lpm, s, 50) * nPan; };
    function wallLeg(d, lim) { return Math.min(Math.max(B_.Ld(d, fck, fy) - (tbm - 2 * cv), B_.leg(d, B_.cfg.wall_leg_min)), lim); }
    var he = st.he, nHe = cnt(he.spacing), runHi = (Hh * 1000 + tbm) - 2 * cv, legHe = wallLeg(he.dia, g.B * 1000 - 2 * cv);
    if (st.hc > 0) {
      var n1 = Math.ceil(nHe / 2), n2 = nHe - n1, Lext = Math.max(B_.Ld(he.dia, fck, fy), 12 * he.dia, Math.round(he.d));
      bbs.push(B_.row("High wall", "H1", he.dia, "L-bar into base", n1, B_.stock(B_.lbar(he.dia, runHi, legHe), he.dia, fck, fy), "earth face, full height – alternate bars of the " + G(he.spacing) + " c/c set"));
      var o2 = B_.lbar(he.dia, Math.min(tbm - cv + st.hc * 1000 + Lext, runHi), legHe);
      o2.f = o2.f.replace("L-bar:", "L-bar (base " + Math.round(tbm - cv) + " + hc " + Math.round(st.hc * 1000) + " + Ld " + Math.round(Lext) + "):");
      if (n2 > 0) bbs.push(B_.row("High wall", "H2", he.dia, "L-bar into base (curtailed)", n2, B_.stock(o2, he.dia, fck, fy), "earth face, curtailed at +" + F(st.hc, ".2f") + " m + Ld – alternate bars"));
    } else bbs.push(B_.row("High wall", "H1", he.dia, "L-bar into base", nHe, B_.stock(B_.lbar(he.dia, runHi, legHe), he.dia, fck, fy), "earth face @ " + G(he.spacing) + " c/c"));
    bbs.push(B_.row("High wall", "H3", st.hw.dia, "L-bar into base", cnt(st.hw.spacing), B_.stock(B_.lbar(st.hw.dia, runHi, wallLeg(st.hw.dia, g.Bc * 1000)), st.hw.dia, fck, fy), "water (drain) face @ " + G(st.hw.spacing) + " c/c"));
    var runLo = (Dd * 1000 + tbm) - 2 * cv;
    bbs.push(B_.row("Low wall", "L1", st.lo.dia, "L-bar into base", cnt(st.lo.spacing), B_.stock(B_.lbar(st.lo.dia, runLo, wallLeg(st.lo.dia, (g.B - g.toe) * 1000 - 2 * cv)), st.lo.dia, fck, fy), "outer face @ " + G(st.lo.spacing) + " c/c"));
    bbs.push(B_.row("Low wall", "L2", st.li.dia, "L-bar into base", cnt(st.li.spacing), B_.stock(B_.lbar(st.li.dia, runLo, wallLeg(st.li.dia, g.Bc * 1000)), st.li.dia, fck, fy), "inner (drain) face @ " + G(st.li.spacing) + " c/c"));
    var legB = Math.max(tbm - 2 * cv, 50);
    bbs.push(B_.row("Base slab", "B1", st.bb.dia, "U (legs up at both ends)", cnt(st.bb.spacing), B_.stock(B_.ubar(st.bb.dia, g.B * 1000 - 2 * cv, legB), st.bb.dia, fck, fy), "bottom, across the drain @ " + G(st.bb.spacing) + " c/c"));
    bbs.push(B_.row("Base slab", "B2", st.bt.dia, "U (legs down at both ends)", cnt(st.bt.spacing), B_.stock(B_.ubar(st.bt.dia, g.B * 1000 - 2 * cv, legB), st.bt.dia, fck, fy), "top, across the drain @ " + G(st.bt.spacing) + " c/c"));
    if (g.hk > 0) {
      var kLd = B_.Ld(he.dia, fck, fy), kb = B_.ubar(he.dia, g.th * 1000 - 2 * cv, g.hk * 1000 - cv + kLd);
      kb.f = kb.f.replace("U-bar:", "U-bar (legs = key " + Math.round(g.hk * 1000 - cv) + " + Ld " + kLd + " into base):");
      bbs.push(B_.row("Shear key", "K1", he.dia, "U (around key, legs into base)", cnt(he.spacing), kb, "both faces of the key @ " + G(he.spacing) + " c/c"));
    }
    var dsp = function (o, mark, mem, nAcross, note) { bbs.push(B_.row(mem, mark, o.dia, "straight", nAcross * nPan, B_.split(o.dia, Lpm - 2 * cv, fck, fy), note)); };
    dsp(st.dh, "D1", "High wall", 2 * B_.count(Hh * 1000, st.dh.spacing, 50), "horizontal, both faces @ " + G(st.dh.spacing) + " c/c (per panel, stops at joints)");
    dsp(st.dl, "D2", "Low wall", 2 * B_.count(Dd * 1000, st.dl.spacing, 50), "horizontal, both faces @ " + G(st.dl.spacing) + " c/c (per panel)");
    dsp(st.db, "D3", "Base slab", 2 * B_.count(g.B * 1000, st.db.spacing, cv), "longitudinal, top & bottom @ " + G(st.db.spacing) + " c/c (per panel)");
    // ---------------------------------------------------------------- quantities
    var qty = [], excD = ho + g.tb + 0.1;
    var exc = [row("Drain bed – base width + 0.3 m working space each side, to underside of PCC", 1, Lrun, g.B + 0.6, excD)];
    if (g.hk > 0) exc.push(row("Shear-key trench", 1, Lrun, g.th + 0.3, g.hk));
    if (cut && Hr > ho) exc.push(row("Cut behind the high wall (heel + filter + 0.3 m working space, above low-side ground)", 1, Lrun, g.heel + (drained ? num(inp.filter_t) / 1000 : 0) + 0.3, Hr - ho));
    qty.push(Q("Earth work in excavation for drain-cum-retaining wall foundation & working space, all kinds of soil", "cum", exc, [CPWD, "2.8.1"]));
    qty.push(Q("PCC 1:4:8 levelling course below base slab, 100 mm", "cum", [row("Levelling course", 1, Lrun, g.B + 0.2, 0.1)], [CPWD, "4.1.8"]));
    var rccRows = [row("Base slab", 1, Lrun, g.B, g.tb), row("High wall (above base)", 1, Lrun, g.th, Hh), row("Low wall (above base)", 1, Lrun, g.tl, Dd)];
    if (g.hk > 0) rccRows.push(row("Shear key", 1, Lrun, g.th, g.hk));
    qty.push(Q("RCC M" + G(fck) + " in drain-cum-retaining wall – walls, base slab" + (g.hk > 0 ? " & shear key" : "") + " (excl. steel & shuttering)", "cum", rccRows, null, CM().rcc_rate(fck)));
    qty.push(Q("Centering & shuttering for walls – drain / retaining wall faces", "sqm", [row("High wall, earth face", 1, Lrun, null, Hh), row("High wall, drain face", 1, Lrun, null, Hh),
      row("Low wall, outer face", 1, Lrun, null, Dd), row("Low wall, drain face", 1, Lrun, null, Dd), row("Stop-ends at joints / ends (wall sections)", 2 * nP, g.th * Hh + g.tl * Dd)], null, CM().RATE.shutter_wall));
    qty.push(Q("Centering & shuttering for foundations – base slab edges", "sqm", [row("Long edges", 2, Lrun, null, g.tb), row("Stop-ends at joints / ends", 2 * nP, g.B, null, g.tb)], null, CM().RATE.shutter_found));
    qty.push(X().steelQty(bbs, "Drain-cum-retaining wall", "Reinforcement TMT Fe" + G(fy) + " – cutting, bending, placing"));
    if (nJ > 0) {
      qty.push(Q("PVC water-stop 225 mm serrated with central bulb (IS 12200) at expansion / contraction joints, continuous round the U", "metre", [row("Joints × girth (high wall + base + low wall)", nJ, girth)], [CPWD, "22.4.1"]));
      qty.push(Q("Joint filler 20 mm bitumen-impregnated fibre board (IS 1838) + polysulphide sealant at joints", "sqm", [row("Joint area (wall & base sections)", nJ, g.th * Hh + g.tl * Dd + g.B * g.tb)], null, 950, "Non-SOR – IS 1838 board + sealant, indicative rate"));
    }
    if (drained) {
      qty.push(Q("Weep holes with " + G(w.dia) + " mm PVC pipe through the high wall into the drain, sloping 1V:20H", "metre", [row(w.n + " weep holes × wall thickness", w.n, g.th + 0.05)], [MPPWD, "13.9"]));
      qty.push(Q("Filter media (graded) behind the high wall, " + G(w.ft) + " mm, wrapped in geotextile at weep holes", "cum", [row("Filter zone", 1, Lrun, w.ft / 1000, Math.max(Hr - 0.15, 0.1))], [MPPWD, "13.11"]));
    }
    var backW = Math.max(g.heel + 0.3 - (drained ? w.ft / 1000 : 0), 0.3);
    qty.push(Q("Backfilling with granular material behind the high wall, compacted in 200 mm layers (IRC 78 App. 6)", "cum", [row("Over heel + working space", 1, Lrun, backW, Hr)], [MPPWD, "13.10.A"]));
    if (ho > 0) qty.push(Q("Filling available excavated earth on the low (road) side of the drain, compacted", "cum", [row("Low side (toe + working space)", 1, Lrun, g.toe + 0.3, ho + g.tb)], [CPWD, "2.25"]));
    if (covered) qty.push(Q("Precast RCC cover slabs M30 " + G(tcs * 1000) + " mm (designed in the drain-cover module), with lifting hooks, laid on the drain walls", "metre", [row("Drain length", 1, Lrun)], null,
      R(CM().rcc_rate(30) * tcs * (Bc + 0.2) * 1.6 + 300, 0), "Non-SOR – precast incl. steel, indicative rate per metre of drain"));
    // ---------------------------------------------------------------- drawings
    var sheets = drDrawing(inp, { g: g, st: st, stab: stab, hyd: hyd, w: w, cover: cover, sur: sur, s: s, Lp: Lp, nP: nP, Lrun: Lrun, covered: covered, tcs: tcs, drained: drained, hw: hw, fck: fck, fy: fy });
    var steelKg = C.sum(bbs.map(function (b) { return b.weight; }));
    var Eq = stab.cases.Eq, Fq = stab.cases.Fq;
    var summary = {
      "Section": "drain " + F(Bc * 1000, ".0f") + " × " + F(Dd * 1000, ".0f") + " clear; high wall " + F(g.th * 1000, ".0f") + " × " + F(Hh, ".2f") + " m, low wall " + F(g.tl * 1000, ".0f") + "; base " +
        F(g.B, ".2f") + " × " + F(g.tb * 1000, ".0f") + " (toe " + F(g.toe, ".2f") + ", heel " + F(g.heel, ".2f") + ")" + (g.hk > 0 ? ", key " + F(g.hk, ".2f") + " m" : ""),
      "High wall bars": "earth face " + G(st.he.dia) + "Ø@" + G(st.he.spacing) + (st.hc > 0 ? " (alt. curtailed at +" + F(st.hc, ".2f") + " m)" : "") + ", drain face " + G(st.hw.dia) + "Ø@" + G(st.hw.spacing),
      "Low wall bars": "outer " + G(st.lo.dia) + "Ø@" + G(st.lo.spacing) + ", inner " + G(st.li.dia) + "Ø@" + G(st.li.spacing),
      "Base bars": "bottom " + G(st.bb.dia) + "Ø@" + G(st.bb.spacing) + ", top " + G(st.bt.dia) + "Ø@" + G(st.bt.spacing) + "; distribution " + G(st.db.dia) + "Ø@" + G(st.db.spacing),
      "Stability": "FoS OT " + F(stab.fot, ".2f") + ", SL " + F(stab.fsl, ".2f") + (stab.E.U > 0 ? ", flotation " + F(stab.st.flo, ".2f") : ""),
      "Base pressure": "p_toe / p_heel " + F(Eq.pt, ".0f") + " / " + F(Eq.ph, ".0f") + " kN/m² (empty), " + F(Fq.pt, ".0f") + " / " + F(Fq.ph, ".0f") + " (full); max " + F(Math.max(Eq.pmax, Fq.pmax, stab.cases.E.pmax), ".0f") + " ≤ SBC " + G(sbc),
      "Hydraulics": "Q " + F(hyd.Q, ".3f") + " m³/s, capacity " + F(hyd.Qcap, ".3f") + ", flow depth " + F(hyd.yn, ".2f") + " m, v " + F(hyd.v, ".2f") + " m/s",
      "Surcharge": F(sur.q, ".1f") + " kN/m² (" + (sur.kind === "dumper" ? "mine haul road" : sur.kind === "road" ? "road IRC" : "footpath / platform") + ")",
      "Joints": nP + " panel(s) × " + F(Lp, ".2f") + " m, PVC water-stop",
      "Steel": F(steelKg, ".0f") + " kg (" + F(steelKg / Lrun, ".1f") + " kg/m)",
      "Concrete": F(g.B * g.tb + g.th * Hh + g.tl * Dd + g.th * g.hk, ".3f") + " cum/m",
      "Max utilisation": F(c.max_utilisation, ".2f") };
    if (w) summary["Weep holes"] = w.n + " nos " + G(w.dia) + " mm (" + w.rows + " row(s) @ " + F(w.sh, ".2f") + " m)";
    var refs = ["IS 456:2000 – Plain & reinforced concrete (cl 20 stability, Annex F crack width)", "IS 3370 (Part 1 & 2):2009 – Liquid-retaining structures (crack width 0.2 mm, minimum steel, joints)",
      "IRC 78:2014 – Foundations & substructure (cl 706.3.4: FoS 2.0 / 1.5)", "IRC SP-42:2014 – Guidelines on road drainage (Manning, velocities, freeboard)",
      "IS 1904 / IS 6403 – Foundations, bearing capacity", "SP 16 & SP 34 – Design aids & detailing",
      "CPWD DSR 2021 / MPPWD SOR 2017 – item descriptions"];
    var tables = { "Base slab load cases (rigid base, per metre)": C.table(stab ? st.env.rows : [], ["Case", "Description", "V kN/m", "e m", "p_toe kN/m²", "p_heel kN/m²", "M sag kN·m/m", "at x m", "M hog kN·m/m", "at x m"]),
      "Bearing cases": C.table(["E", "Eq", "Fq"].map(function (k) { var x = stab.cases[k]; return [CASES[k].lab, R(x.V, 2), R(x.e, 3), R(x.pt, 1), R(x.ph, 1), R(x.pmax, 1)]; }), ["Case", "V kN/m", "e m (+ toe)", "p_toe kN/m²", "p_heel kN/m²", "pmax kN/m²"]),
      "Design moments (service, kN·m/m)": C.table([["High wall – earth face", R(st.Mhe, 2)], ["High wall – drain face", R(st.Mhw, 2)], ["Low wall – outer face", R(st.Mlo, 2)], ["Low wall – inner face", R(st.Mli, 2)],
        ["Base – bottom face", R(st.Mbb, 2)], ["Base – top face", R(st.Mbt, 2)]], ["Member / face", "Ms"]) };
    return C.DesignResult({ module: "drain_retaining", title: "Drain-cum-retaining wall", inputs: inp, calc: c, summary: summary, drawings: sheets, quantities: qty, bbs: bbs,
      tables: tables, references: refs });
  }
  M.run_drain_retaining = run_drain_retaining;

  /* ======================================================================= drawings */
  /* drawing text is kept to the PDF base font: no ▽, −, ² (levels "+1.000 / -0.225", pressures in kPa) */
  function drDrawing(inp, o) {
    var D_ = DR(), g = o.g, st = o.st, cv = o.cover;
    var mm = function (x) { return x * 1000; }, lv = function (x) { return (x < 0 ? "-" : "+") + F(Math.abs(x), ".3f"); };
    var B = mm(g.B), tb = mm(g.tb), toe = mm(g.toe), x1 = mm(g.x1), x2 = mm(g.x2), x3 = mm(g.x3), Hh = mm(g.Hh), Dd = mm(g.D), Hr = mm(g.Hr), ho = mm(g.ho), hk = mm(g.hk);
    // ---------------- cross-section
    var v = new D_.View("Cross-section (typical)");
    var pts = [[0, 0], [B, 0]];
    if (g.heel > 0) pts.push([B, tb]);
    pts.push([x3, tb], [x3, tb + Hh], [x2, tb + Hh], [x2, tb], [x1, tb], [x1, tb + Dd], [toe, tb + Dd]);
    if (g.toe > 0) pts.push([toe, tb], [0, tb]);
    v.poly(pts, true, "OUTLINE", "concrete");
    if (hk > 0) v.rect(x2, -hk, x3 - x2, hk, "OUTLINE", "concrete");
    v.rect(-100, -100, B + 200, 100, "CONCRETE");
    v.text((x1 + x2) / 2, -280, "PCC 1:4:8, 100", 1.6, { anchor: "middle" });
    // ground, water & levels
    var tn = Math.tan(rad(g.beta)), ext = Math.max(1500, mm(g.heel) + 800), yEnd = tb + Hr + ext * tn;
    v.line(x3, tb + Hr, x3 + ext, yEnd, "SOIL");
    v.text(x3 + ext, yEnd + 90, "Retained earth " + lv(g.Hr) + (g.beta > 0 ? " (" + G(g.beta) + " deg)" : ""), 1.8, { anchor: "end" });
    v.text(x3 + ext * 0.4, tb + Hr + ext * 0.4 * tn - 220, "q " + F(o.s.q, ".0f") + " kPa", 1.8, { anchor: "middle" });
    if (g.ho > 0) { v.line(-1500, tb + ho, toe, tb + ho, "SOIL"); v.text(-1500, tb + ho + 60, "GL " + lv(g.ho), 1.8); }
    v.text(toe - 60, tb + 30, "Invert +/-0.000", 1.6, { anchor: "end" });
    v.text(toe - 60, tb + Dd + 30, lv(g.D), 1.8, { anchor: "end" });
    v.text(x2 - 60, tb + Hh + 30, lv(g.Hh), 1.8, { anchor: "end" });
    v.text(-700, -40, "u/s base " + lv(-g.tb), 1.8, { anchor: "end" });
    var yn = Math.min(mm(o.hyd.yn), Dd);
    v.line(x1, tb + yn, x2, tb + yn, "WATER"); v.text(x1 + 60, tb + yn + 40, "WL " + lv(Math.min(o.hyd.yn, g.D)), 1.6);
    if (o.covered) v.rect(x1 - 20, tb + Dd, x2 - x1 + 40, mm(o.tcs), "THIN", "concrete");
    if (!o.drained && o.hw > -g.tb) { v.line(x3 + 100, tb + mm(o.hw), x3 + 900, tb + mm(o.hw), "WATER"); v.text(x3 + 950, tb + mm(o.hw), "GWL " + lv(o.hw), 1.6); }
    // reinforcement (lines) with bar marks
    var legH = Math.min(600, B - 2 * cv);
    v.poly([[x3 - cv, tb + Hh - cv], [x3 - cv, cv], [Math.max(x3 - cv - legH, cv), cv]], false, "REBAR");
    v.poly([[x2 + cv, tb + Hh - cv], [x2 + cv, tb - cv], [Math.min(x2 + cv + 400, B - cv), tb - cv]], false, "REBAR");
    v.poly([[toe + cv, tb + Dd - cv], [toe + cv, cv], [Math.min(toe + cv + 400, B - cv), cv]], false, "REBAR");
    v.poly([[x1 - cv, tb + Dd - cv], [x1 - cv, tb - cv], [Math.max(x1 - cv - 300, cv), tb - cv]], false, "REBAR");
    v.poly([[cv, tb - cv], [cv, cv], [B - cv, cv], [B - cv, tb - cv]], false, "REBAR");
    v.line(cv, tb - cv, B - cv, tb - cv, "REBAR");
    v.text(x3 + 80, tb + Hh * 0.62, st.hc > 0 ? "H1/H2" : "H1", 1.8);
    v.text(x2 - 60, tb + Dd * 0.8, "H3", 1.8, { anchor: "end" });
    v.text(toe - 60, tb + Dd * 0.45, "L1", 1.8, { anchor: "end" });
    v.text(x1 + 120, tb + Dd * 0.75, "L2", 1.8);
    v.text((x1 + x2) / 2, tb * 0.3, "B1", 1.6, { anchor: "middle" });
    v.text((x1 + x2) / 2 + 250, tb + 50, "B2", 1.6, { anchor: "middle" });
    if (st.hc > 0) { v.line(x3 - cv - 60, tb + mm(st.hc), x3 - cv + 60, tb + mm(st.hc), "REBAR"); v.text(x3 + 80, tb + mm(st.hc), "H2 stop " + lv(st.hc) + " + Ld", 1.6); }
    if (hk > 0) v.text(x2 - 60, -hk / 2, "K1", 1.6, { anchor: "end" });
    // weep holes & filter
    if (o.w) {
      for (var r = 0; r < Math.min(o.w.rows, 8); r++) { var yy = tb + mm(o.w.y0 + r * o.w.sv); if (yy < tb + Hh - 100) v.line(x3, yy + (x3 - x2) / 20, x2, yy, "STEEL"); }
      v.rect(x3, tb, o.w.ft, Math.max(Hr - 150, 100), "THIN");
      v.text(x3 + o.w.ft + 60, tb + Hr * 0.88, "filter " + G(o.w.ft), 1.6);
    }
    // dimensions
    v.dim(x1, tb + Dd, x2, tb + Dd, -5);
    v.dim(toe, tb + Dd, x1, tb + Dd, -11);
    v.dim(x2, tb + Hh, x3, tb + Hh, -5);
    v.dim(x2, tb, x2, tb + Dd, -5);
    v.dim(B, 0, B, tb + Hh, 8);
    v.dim(0, 0, 0, tb, -6);
    v.dim(0, hk > 0 ? -hk : -100, B, hk > 0 ? -hk : -100, 8);
    if (g.toe > 0) v.dim(0, tb, toe, tb, -4);
    if (g.heel > 0) v.dim(x3, tb, B, tb, -4);
    if (hk > 0) v.dim(x3, -hk, x3, 0, 5);
    // bar & level schedule (table view keeps the long call-outs off the section)
    var rows = [[st.hc > 0 ? "H1/H2" : "H1", "High wall - earth face", G(st.he.dia) + "Ø @ " + G(st.he.spacing), st.hc > 0 ? "alt. bars stop " + lv(st.hc) + " + Ld" : "full height, L into base"],
      ["H3", "High wall - drain face", G(st.hw.dia) + "Ø @ " + G(st.hw.spacing), "full height, L into base"],
      ["L1", "Low wall - outer face", G(st.lo.dia) + "Ø @ " + G(st.lo.spacing), "L into base"],
      ["L2", "Low wall - drain face", G(st.li.dia) + "Ø @ " + G(st.li.spacing), "L into base"],
      ["B1", "Base - bottom", G(st.bb.dia) + "Ø @ " + G(st.bb.spacing), "U, legs up at the ends"],
      ["B2", "Base - top", G(st.bt.dia) + "Ø @ " + G(st.bt.spacing), "U, legs down at the ends"],
      ["D1", "High wall horizontal", G(st.dh.dia) + "Ø @ " + G(st.dh.spacing), "each face, stop at joints"],
      ["D2", "Low wall horizontal", G(st.dl.dia) + "Ø @ " + G(st.dl.spacing), "each face, stop at joints"],
      ["D3", "Base longitudinal", G(st.db.dia) + "Ø @ " + G(st.db.spacing), "top & bottom, stop at joints"]];
    if (hk > 0) rows.push(["K1", "Shear key " + F(g.hk, ".2f") + " m deep", G(st.he.dia) + "Ø @ " + G(st.he.spacing), "U round key, Ld into base"]);
    if (o.w) rows.push(["WH", "Weep holes " + G(o.w.dia) + " PVC", "@ " + F(o.w.sh, ".2f") + " m", o.w.rows + " row(s) from " + lv(o.w.y0) + ", 1:20"]);
    [["Invert", "+/-0.000"], ["Top of low wall", lv(g.D)], ["Top of high wall", lv(g.Hh)], ["Retained earth", lv(g.Hr)], ["Low-side ground", lv(g.ho)], ["Underside of base", lv(-g.tb)]]
      .forEach(function (l, i) { rows.push([i ? "" : "Levels", l[0], l[1], i ? "" : "m, from the drain invert"]); });
    var tv = D_.table_view("Bars & levels", ["Mark", "Location", "Bars", "Detail"], rows, [12, 34, 20, 34], { text_h: 1.8, row_h: 5.0, char_w: 0.6 });
    var notes = ["Concrete M" + G(o.fck) + ", steel Fe" + G(o.fy) + ", clear cover " + G(cv) + " mm; PCC 1:4:8 100 mm below the base; crack width <= 0.2 mm (IS 3370-2).",
      "Retained earth " + lv(g.Hr) + " m, surcharge " + F(o.s.q, ".0f") + " kPa (" + String(inp.loading) + "); backfill granular (IRC 78 App. 6) in 200 mm layers.",
      o.w ? "Weep holes " + G(o.w.dia) + " mm PVC @ " + F(o.w.sh, ".2f") + " m x " + o.w.rows + " row(s), sloping 1:20 into the drain, with " + G(o.w.ft) + " mm filter media behind." : "No weep holes - designed for ground water at " + lv(o.hw) + " m and uplift.",
      "Levels relative to the drain invert (+/-0.000); bed fall 1 in " + G(num(inp.slope_n)) + " to the outfall - fill RLs from the survey."];
    if (o.sur.kind === "dumper") notes.push("Haul road: dumper wheels kept >= " + F(Math.max(1.5, num(inp.setback)), ".1f") + " m from the wall top by a safety bund (DGMS).");
    var sh1 = new D_.Sheet("Drain-cum-retaining wall - cross-section", "DRW-01", [v, tv], notes);
    // ---------------- sheet 2: plan with joints, joint detail, base pressure
    var pl = new D_.View("Plan - joints every " + F(o.Lp, ".2f") + " m (typical stretch)");
    var Ls = mm(Math.min(o.Lrun, 2 * o.Lp));
    pl.rect(0, 0, Ls, B, "OUTLINE");
    [toe, x1, x2, x3].forEach(function (y) { if (y > 0 && y < B) pl.line(0, y, Ls, y, "HIDDEN"); });
    for (var xj = mm(o.Lp); xj < Ls - 1; xj += mm(o.Lp)) { pl.line(xj, -300, xj, B + 300, "CENTER"); pl.text(xj, B + 380, "JOINT - PVC WATER-STOP + 20 FILLER", 1.8, { anchor: "middle" }); }
    if (o.w) { var nn = 0; for (var xw = 300; xw < Ls && nn < 60; xw += mm(o.w.sh), nn++) pl.circle(xw, (x2 + x3) / 2, 40, "STEEL"); }
    pl.text(Ls / 2, (x1 + x2) / 2, "DRAIN, fall 1 in " + G(num(inp.slope_n)) + (o.covered ? ", precast covers" : ""), 1.8, { anchor: "middle" });
    pl.dim(0, 0, Math.min(mm(o.Lp), Ls), 0, 8);
    pl.dim(Ls, 0, Ls, B, 8);
    var jd = new D_.View("Typical joint - plan through the high wall");
    var tw = mm(g.th);
    jd.rect(0, 0, 600, tw, "OUTLINE", "concrete"); jd.rect(620, 0, 600, tw, "OUTLINE", "concrete");
    jd.line(610 - 112, tw / 2, 610 + 112, tw / 2, "STEEL"); jd.circle(610, tw / 2, 12, "STEEL");
    jd.rect(600, 0, 20, tw, "THIN");
    jd.text(610, tw + 100, "20 mm filler board + sealant", 1.8, { anchor: "middle" });
    jd.text(610, -140, "PVC water-stop 225 (IS 12200)", 1.8, { anchor: "middle" });
    jd.dim(0, 0, 0, tw, -6);
    var pv = new D_.View("Base pressure - drain empty, surcharge on heel");
    var an = o.stab.cases.Eq.an, pm = Math.max(an.pmax, 1), kk = 900 / pm, ppts = [[0, 0]];
    for (var i = 0; i <= 20; i++) { var xx = g.B * i / 20; ppts.push([mm(xx), -an.pAt(xx) * kk]); }
    ppts.push([B, 0]);
    pv.line(0, 0, B, 0, "OUTLINE");
    pv.poly(ppts, true, "DIAGRAM", "diagram+");
    pv.text(0, -an.pAt(0) * kk - 120, "p_toe " + F(o.stab.cases.Eq.pt, ".0f") + " kPa", 1.8);
    pv.text(B, -an.pAt(g.B) * kk - 120, "p_heel " + F(o.stab.cases.Eq.ph, ".0f") + " kPa", 1.8, { anchor: "end" });
    pv.dim(0, 0, B, 0, -5);
    var sh2 = new D_.Sheet("Drain-cum-retaining wall - plan, joints & base pressure", "DRW-02", [pl, jd, pv],
      ["Expansion / contraction joints every " + F(o.Lp, ".2f") + " m (" + o.nP + " panel(s)): PVC water-stop 225 mm serrated with centre bulb (IS 12200) continuous round the U, 20 mm filler board (IS 1838), polysulphide sealant.",
        "Horizontal / longitudinal bars stop 50 mm short of each joint face; no bars across expansion joints.",
        "Base pressure for the drain empty with surcharge on the heel; SBC " + G(o.s.sbc) + " kPa."]);
    return [sh1, sh2];
  }

  /* ======================================================================= params */
  var notDump = function (v) { return /^Mine dumper/.test(String(v.loading)); };
  var wc = function (v) { return notDump(v) && v.dumper === "Custom"; };
  var rat = function (v) { return /^Rational/.test(String(v.q_mode)); };
  var DRW_PARAMS = [
    P("width", "Drain clear width", 0.9, "m", { min: 0.3, max: 3.0, step: 0.05, group: "Geometry" }),
    P("depth", "Drain depth (invert to top of the low wall)", 1.0, "m", { min: 0.3, max: 3.0, step: 0.05, group: "Geometry" }),
    P("h_ret", "Retained earth on the high side above invert", 2.5, "m", { min: 0.5, max: 6.5, step: 0.1, group: "Geometry",
      help: "Earth level behind the outer (high) wall measured from the drain invert; may exceed the drain depth – the high wall then extends above the low wall." }),
    P("upstand", "High wall above the retained earth (kerb / parapet)", 0.0, "m", { min: 0, max: 1.2, step: 0.05, group: "Geometry" }),
    P("h_out", "Ground on the low (road) side above invert", 0.8, "m", { min: 0, max: 3.0, step: 0.05, group: "Geometry", help: "Earth against the low wall's outer face (0 = drain base on the surface)." }),
    P("length", "Length of drain (quantity)", 100.0, "m", { min: 1, max: 5000, group: "Geometry" }),
    P("joint_sp", "Expansion / contraction joint spacing", 10.0, "m", { min: 3, max: 30, step: 0.5, group: "Geometry" }),
    P("covered", "Open / covered", DR_COV[0], { kind: "select", options: DR_COV.slice(), group: "Geometry" }),
    P("t_cs", "Cover slab thickness", 0.10, "m", { min: 0.05, max: 0.3, step: 0.025, group: "Geometry", when: function (v) { return /^Covered/.test(String(v.covered)); } }),
    P("situation", "Situation", DR_SIT[0], { kind: "select", options: DR_SIT.slice(), group: "Geometry", help: "Affects the excavation quantity only." }),
    P("q_mode", "Design discharge", DR_Q[0], { kind: "select", options: DR_Q.slice(), group: "Hydraulics" }),
    P("discharge", "Design discharge Q", 0.5, "m³/s", { min: 0.01, max: 20, group: "Hydraulics", when: function (v) { return !rat(v); } }),
    P("runoff_c", "Runoff coefficient C", 0.7, { min: 0.1, max: 1.0, step: 0.05, group: "Hydraulics", when: rat }),
    P("intensity", "Rainfall intensity i (for Tc)", 75.0, "mm/hr", { min: 10, max: 300, group: "Hydraulics", when: rat }),
    P("area_ha", "Catchment area A", 2.0, "ha", { min: 0.05, max: 200, group: "Hydraulics", when: rat }),
    P("slope_n", "Bed slope 1 in N", 500.0, { min: 50, max: 5000, step: 50, group: "Hydraulics" }),
    P("manning", "Manning's n", 0.015, { min: 0.011, max: 0.03, step: 0.001, group: "Hydraulics", help: "0.013–0.015 finished concrete; 0.017–0.020 rough / silted" }),
    P("freeboard", "Freeboard", 0.15, "m", { min: 0.05, max: 0.5, step: 0.05, group: "Hydraulics" }),
    P("loading", "Loading on the retained side", DR_LOC[0], { kind: "select", options: DR_LOC.slice(), group: "Loads",
      help: "Road: 1.2 m earth surcharge (IRC 6). Mine haul road: dumper equivalent surcharge at the bund set-back. Footpath: the uniform surcharge input." }),
    P("surcharge", "Minimum / other surcharge on the retained side", 10.0, "kN/m²", { min: 0, max: 100, group: "Loads" }),
    P("setback", "Dumper wheels set back from the wall top (bund)", 1.5, "m", { min: 0, max: 5, step: 0.25, group: "Mine dumper", when: notDump }),
    P("dumper", "Dumper / tipper (loaded)", "BEML BH35-2 (60 t)", { kind: "select", options: DUMP_NAMES.slice(), group: "Mine dumper", when: notDump,
      help: "Presets as the drain-cover module (DS.loads.DUMPERS; geometry approximate – verify with the OEM data sheet)." }),
    P("overload", "Overload factor on GVW", 1.10, { min: 1.0, max: 1.3, step: 0.05, group: "Mine dumper", when: notDump }),
    P("dumper_gvw", "Custom: GVW (loaded)", 35.0, "t", { min: 10, max: 400, group: "Mine dumper", when: wc }),
    P("dumper_front", "Custom: front-axle share of GVW", 0.33, { min: 0.15, max: 0.5, step: 0.01, group: "Mine dumper", when: wc }),
    P("dumper_rear", "Custom: number of rear axles", 1, { kind: "int", min: 1, max: 3, group: "Mine dumper", when: wc }),
    P("dumper_dual", "Custom: dual tyre c/c", 0.6, "m", { min: 0.2, max: 1.5, step: 0.05, group: "Mine dumper", when: wc }),
    P("dumper_tyre_b", "Custom: tyre width", 0.5, "m", { min: 0.2, max: 1.2, step: 0.01, group: "Mine dumper", when: wc }),
    P("dumper_tyre_p", "Custom: tyre pressure", 650.0, "kPa", { min: 300, max: 1000, step: 10, group: "Mine dumper", when: wc }),
    P("surcharge_lo", "Surcharge on the low side (road / footpath)", 10.0, "kN/m²", { min: 0, max: 30, group: "Loads", help: "Pushes the low wall inwards when the drain is empty (structural design only)." }),
    P("pressure", "Earth pressure on the high wall", DR_PRESS[0], { kind: "select", options: DR_PRESS.slice(), group: "Loads" }),
    P("beta", "Backfill slope above the high wall β", 0.0, "°", { min: 0, max: 30, group: "Soil" }),
    P("gamma", "Soil / backfill unit weight", 18.0, "kN/m³", { min: 15, max: 22, group: "Soil" }),
    P("phi", "Angle of friction φ", 30.0, "°", { min: 20, max: 40, group: "Soil" }),
    P("mu", "Base friction coefficient μ", 0.5, { min: 0.3, max: 0.7, step: 0.05, group: "Soil" }),
    P("sbc", "Safe bearing capacity", 150.0, "kN/m²", { min: 50, max: 600, step: 10, group: "Soil" }),
    P("low_side", "Low-side earth in stability", DR_LOW[0], { kind: "select", options: DR_LOW.slice(), group: "Soil" }),
    P("shear_key", "Shear key", DR_KEY[0], { kind: "select", options: DR_KEY.slice(), group: "Soil" }),
    P("drainage", "Drainage behind the high wall", DR_DRAIN[0], { kind: "select", options: DR_DRAIN.slice(), group: "Drainage / weep holes" }),
    P("gwl", "Ground-water level behind the wall above invert", 0.0, "m", { min: -3, max: 6.5, step: 0.1, group: "Drainage / weep holes", help: "Highest monsoon / mine-water level (negative = below invert)." }),
    P("weep_dia", "Weep hole dia", 100.0, "mm", { kind: "select", options: [75.0, 100.0, 150.0], group: "Drainage / weep holes" }),
    P("weep_sh", "Weep holes – horizontal spacing", 1.5, "m", { min: 0.5, max: 3, step: 0.25, group: "Drainage / weep holes" }),
    P("weep_sv", "Weep holes – vertical spacing", 1.0, "m", { min: 0.5, max: 3, step: 0.25, group: "Drainage / weep holes" }),
    P("filter_t", "Filter media thickness", 300.0, "mm", { min: 0, max: 600, step: 50, group: "Drainage / weep holes" }),
    P("fck", "Concrete grade fck", 30.0, "N/mm²", { kind: "select", options: [25.0, 30.0, 35.0], group: "Materials" }),
    P("fy", "Steel fy", 500.0, "N/mm²", { kind: "select", options: [415.0, 500.0], group: "Materials" }),
    P("exposure", "Exposure", "Moderate", { kind: "select", options: Object.keys(DS.materials.EXPOSURE), group: "Materials", help: "IS 456 Table 3. Mining area (site = mine) is taken as Severe in design mode." }),
    P("cover", "Clear cover", 45.0, "mm", { min: 25, max: 75, step: 5, group: "Materials", help: "≥ 45 mm on liquid-retaining faces (IS 3370-2); 50 mm in the mining area (raised in design mode)." }),
    P("th_chk", "High wall thickness (check)", 0.25, "m", { min: 0.15, max: 1.0, step: 0.025, group: "My design", modes: CHECK }),
    P("tl_chk", "Low wall thickness (check)", 0.20, "m", { min: 0.12, max: 0.6, step: 0.025, group: "My design", modes: CHECK }),
    P("tb_chk", "Base thickness (check)", 0.30, "m", { min: 0.15, max: 1.0, step: 0.025, group: "My design", modes: CHECK }),
    P("toe_chk", "Toe projection beyond the low wall (check)", 0.0, "m", { min: 0, max: 3, step: 0.05, group: "My design", modes: CHECK }),
    P("heel_chk", "Heel projection under the retained earth (check)", 1.0, "m", { min: 0, max: 5, step: 0.05, group: "My design", modes: CHECK }),
    P("key_chk", "Shear key depth below the high wall (check, 0 = none)", 0.75, "m", { min: 0, max: 1.5, step: 0.05, group: "My design", modes: CHECK })
  ];
  [["he", "High wall earth face", 16.0, 150.0], ["hw", "High wall drain face", 12.0, 200.0], ["lo", "Low wall outer face", 12.0, 200.0], ["li", "Low wall inner face", 12.0, 200.0],
    ["bb", "Base bottom", 12.0, 150.0], ["bt", "Base top", 12.0, 150.0], ["dist", "Distribution / horizontal (all members)", 12.0, 200.0]].forEach(function (b) {
    DRW_PARAMS.push(P(b[0] + "_dia", b[1] + " – bar dia (check)", b[2], "mm", { kind: "select", options: [8.0, 10.0, 12.0, 16.0, 20.0, 25.0], group: "My design", modes: CHECK }));
    DRW_PARAMS.push(P(b[0] + "_s", b[1] + " – spacing (check)", b[3], "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK }));
  });
  M.DRW_PARAMS = DRW_PARAMS;
  C.register({ id: "drain_retaining", phase: 3, category: "Drains, culverts & roads", name: "Drain-cum-retaining wall", icon: "🌊",
    description: "RCC U-drain whose outer wall also retains earth (road / haul-road side drain at the toe of a cut or embankment, drain along a raised platform): " +
      "Manning capacity & velocities, Rankine / at-rest earth with road / dumper surcharge, weep holes or water pressure + uplift, stability of the whole U " +
      "(overturning 2.0, sliding 1.5 with shear key, edge pressures, flotation), walls & base for crack width 0.2 mm (IS 3370), curtailment, joints, BBS & quantities.",
    params: DRW_PARAMS, run: run_drain_retaining, references: ["IS 456:2000", "IS 3370:2009", "IRC 78:2014", "IRC SP-42:2014"] });
})();
