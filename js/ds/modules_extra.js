/* Design Studio — modules_extra (new modules, not a Python port).
   Site-engineer modules for SECL (Korba / Gevra) works – design + CPWD-style estimate quantities.
     drain_cover       RCC cover slab for drains / cable trenches – IRC Class A / 70R / mine dumper / pedestrian,
                       effective width (IS 456 cl 24.3.2 / IRC 112 Annex B3), punching under the wheel, crack width,
                       bearing on the drain wall, precast units with lifting hooks
     septic_tank       Septic tank + soak pit / dispersion trench – IS 2470 Part 1 & 2 (capacity, compartments,
                       baffles, levels, vent) with brick masonry or RCC walls (earth + water pressure for RCC)
     boundary_wall     Brick masonry compound wall with RCC pillars, plinth beam and pillar footings –
                       IS 875-3 wind, IS 1905 panel check, IS 456 pillar / footing design
     combined_footing  Rectangular combined footing for two columns – IS 456 cl 34 (SFD / BMD, transverse strips,
                       one-way & punching shear, development, bearing)
   Conventions as the other module files: lengths m (sections mm), loads kN, every number recorded in a Calc with its
   formula and clause; BBS only through DS.bbs; quantities with CPWD-style descriptions (mapped to DSR items by the UI).
   Clause references marked "verify" are paraphrased – check against a licensed copy of the code. */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var C = DS.core, F = C.pyfmt, R = C.pyround, ceil_to = C.ceil_to;
  var M = DS.modules_extra = {};
  function CM() { return DS.common; }
  function RC() { return DS.rcc; }
  function LD() { return DS.loads; }
  function DR() { return DS.drawing; }
  function BB() { return DS.bbs; }
  function DT() { return DS.detailing; }
  function row() { return CM().row.apply(null, arguments); }
  function Q() { return CM().Q.apply(null, arguments); }
  function num(v) { return Number(v); }
  function G(x) { return F(x, "g"); }
  function area(d) { return Math.PI * d * d / 4; }
  function ctx() { return C.ctx || { site: "general", detail: "practice" }; }
  function isMine() { return ctx().site === "mine"; }
  function CPWD() { return CM().CPWD; }

  /* Param(key, label, default, unit = "", {kind, options, min, max, step, help, group, modes, when}) */
  function P(key, label, def, unit, o) {
    if (unit && typeof unit === "object") { o = unit; unit = ""; }
    return C.Param(Object.assign({ key: key, label: label, default: def, unit: unit || "" }, o || {}));
  }
  var CHECK = ["check"];
  function matParams(cover, exposure, fckDef) {
    return [P("fck", "Concrete grade fck", fckDef || 25.0, "N/mm²", { kind: "select", options: [20.0, 25.0, 30.0, 35.0], group: "Materials" }),
      P("fy", "Steel fy", 500.0, "N/mm²", { kind: "select", options: [415.0, 500.0], group: "Materials" }),
      P("exposure", "Exposure", exposure || "Moderate", { kind: "select", options: Object.keys(DS.materials.EXPOSURE), group: "Materials",
        help: "IS 456 Table 3. Mining area (site = mine) is taken as Severe in design mode." }),
      P("cover", "Clear cover", cover, "mm", { min: 20, max: 75, step: 5, group: "Materials" })];
  }
  /* design / thumb modes adopt at least the IS 456 Table 16 cover; check mode keeps the user's value */
  function coverAdopt(c, inp, mode, member) {
    var cover = num(inp.cover), req = RC().required_cover(inp.exposure, member === "footing" ? "footing" : member === "column" ? "column" : "beam");
    if (mode !== "check" && cover < req) {
      c.info("Cover adopted", G(cover) + " mm raised to " + G(req) + " mm for " + inp.exposure + " exposure", "IS 456 Table 16");
      cover = req;
    }
    RC().cover_check(c, inp.exposure, cover, num(inp.fck), member === "footing" ? "footing" : member === "column" ? "column" : "beam");
    return cover;
  }
  /* steel quantity rows straight from BBS rows (so the estimate kg = BBS kg) */
  function steelQty(bbs, title, desc, link) {
    return Q(desc || "Reinforcement TMT Fe500 – cutting, bending, placing", "kg",
      bbs.map(function (r) { return CM().kg_row(title + ": " + r.member + " " + r.mark + " " + G(r.dia) + "Ø", r.nos, r.cut_length, r.dia * r.dia / 162); }),
      link || null, CM().RATE.rebar);
  }
  M.steelQty = steelQty;
  /* per-metre bars for a slab-type member: design (DS.detailing rules) or check (given [dia, spacing]) */
  function stripBars(c, Ast, member, role, d, D, given, label, o) {
    o = o || {};
    var dt = DT(), bars;
    if (given) {
      bars = { dia: given[0], spacing: given[1], Ast_prov: 1000 * area(given[0]) / given[1] };
      c.check("Steel provided ≥ required (" + label + ")", bars.Ast_prov, Ast, { unit: "mm²/m", clause: o.clause || "", mode: ">=" });
      if (dt) dt.check_bars(c, member, role, given[0], given[1], Object.assign({ d: d, D: D, label: label }, o.rule || {}));
    } else {
      bars = dt ? dt.pick_bars(Ast, member, role, Object.assign({ d: d, D: D, dias: o.dias || [8, 10, 12, 16, 20, 25], smax: o.smax || null }, o.rule || {}))
        : RC().slab_bars(Ast, d, D, role === "main", { dias: o.dias || [8, 10, 12, 16, 20], smax: o.smax || null });
      if (dt) dt.record(c, label, bars);
      if (bars.short) c.check("Steel provided ≥ required (" + label + ")", bars.Ast_prov, Ast, { unit: "mm²/m", clause: o.clause || "", mode: ">=" });
    }
    c.let("Bars (" + label + ")", "", G(bars.dia) + "Ø @ " + G(bars.spacing) + " c/c", "", o.clause || "", "As,prov = " + F(bars.Ast_prov, ".0f") + " mm²/m");
    return bars;
  }
  M.stripBars = stripBars;
  /* tension steel (mm²/m) that makes k·τc(pt) ≥ τv (IS 456 Table 19), or Infinity when even 3 % is not enough */
  function asForShear(tv, d, D, fck, slab) {
    var k = slab ? DS.materials.k_slab(D) : 1, MT = DS.materials;
    if (tv <= k * MT.tau_c(0.15, fck)) return 0;
    if (tv > k * MT.tau_c(3.0, fck)) return Infinity;
    var lo = 0.15, hi = 3.0;
    for (var i = 0; i < 50; i++) { var m = (lo + hi) / 2; if (k * MT.tau_c(m, fck) >= tv) hi = m; else lo = m; }
    return hi / 100 * 1000 * d;
  }
  M.asForShear = asForShear;
  /* 1 m strip: flexure + (design) steel raised for one-way shear + bar choice (DS.detailing) + crack-width tightening.
     o: {Ms, climit, given [dia, s], rule {member, role}, Vu (kN/m) for the shear-steel step, slab (true → k of cl 40.2.1.1), dias} */
  function designStrip(c, Mu, D, cover, fck, fy, face, o) {
    var dt = DT(), given = o.given || null, dia0 = given ? given[0] : 12, d = D - cover - dia0 / 2, MT = DS.materials;
    var f = RC().flexure(c, Mu, 1000, d, fck, fy, "slab", D, { tag: "(" + face + ")" }), req = f.Ast;
    if (o.Amin && o.Amin.As > req) req = c.calc(o.Amin.label + " (" + face + ")", "As,min", "As", "mm²/m", o.Amin.clause || "", o.Amin.text || "", { As: R(o.Amin.As, 1) });
    if (!given && o.Vu) {
      var tv = o.Vu * 1000 / (1000 * d), Av = asForShear(tv, d, D, fck, o.slab !== false);
      if (Av > req && isFinite(Av))
        req = c.calc("Tension steel for one-way shear (" + face + ")", "As,v", "pt/100*1000*d", "mm²/m", "IS 456 Table 19 / cl 40.2.1.1",
          "pt so that k·τc(pt) ≥ τv = " + F(tv, ".3f") + " N/mm² (no shear links in slabs)", { pt: R(Av / (10 * d), 4), d: R(d, 1) });
    }
    var bars;
    if (given) {
      bars = { dia: given[0], spacing: given[1], Ast_prov: 1000 * area(given[0]) / given[1] };
      c.check("Steel provided ≥ required (" + face + ")", bars.Ast_prov, req, { unit: "mm²/m", clause: "", mode: ">=" });
      if (dt && o.rule) dt.check_bars(c, o.rule.member, o.rule.role || "main", given[0], given[1], Object.assign({ d: d, D: D, label: face }, o.rule));
    } else {
      bars = dt && o.rule ? dt.pick_bars(req, o.rule.member, o.rule.role || "main", Object.assign({ d: d, D: D, dias: o.dias || [10, 12, 16, 20, 25], smax: o.smax || null }, o.rule))
        : RC().slab_bars(req, d, D, true, { dias: o.dias || [10, 12, 16, 20, 25], smax: o.smax || null });
      var why = bars.text, tightened = false;
      if (bars.short) c.check("Steel provided ≥ required (" + face + ")", bars.Ast_prov, req, { unit: "mm²/m", clause: "", mode: ">=",
        note: "largest permitted bar at minimum spacing is not enough – increase thickness" });
      if (o.climit && o.Ms > 0) {
        var step = dt ? dt.step() : 10, smin = dt ? dt.min_spacing() : 100, dias = o.dias || [10, 12, 16, 20, 25];
        for (var it = 0; it < 40; it++) {
          var w = RC().crack_width(new C.Calc("s"), o.Ms, 1000, D, D - cover - bars.dia / 2, bars.Ast_prov, cover, bars.dia, bars.spacing, fck, o.climit);
          if (w <= o.climit) break;
          tightened = true;
          if (bars.spacing - step >= smin - 1e-9) bars = Object.assign({}, bars, { spacing: bars.spacing - step });
          else {
            var cur = bars.dia, nd = dias.filter(function (x) { return x > cur && x <= Math.max(D / 8, cur); });
            if (!nd.length) break;
            bars = Object.assign({}, bars, { dia: nd[0], spacing: C.floor_to(Math.min(bars.smax || 200, 200), step) });
          }
          bars.Ast_prov = 1000 * area(bars.dia) / bars.spacing;
        }
      }
      if (dt && why) dt.record(c, face, { text: why + (tightened ? "; then tightened to " + G(bars.dia) + "Ø @ " + G(bars.spacing) + " for crack width ≤ " + G(o.climit) + " mm" : ""), clause: bars.clause });
    }
    c.let("Bars (" + face + ")", "", G(bars.dia) + "Ø @ " + G(bars.spacing) + " c/c", "", "", "As,prov = " + F(bars.Ast_prov, ".0f") + " mm²/m");
    var dd = D - cover - bars.dia / 2;
    if (o.climit && o.Ms > 0) RC().crack_width(c, o.Ms, 1000, D, dd, bars.Ast_prov, cover, bars.dia, bars.spacing, fck, o.climit, { tag: "(" + face + ")" });
    return Object.assign({}, bars, { d: dd, req: req, Mlim: f.Mlim });
  }
  M.designStrip = designStrip;
  var RCC_REFS = ["IS 456:2000 – Plain & reinforced concrete", "SP 16 & SP 34 – Design aids & detailing",
    "IS 2502:1963 – Bending & fixing of bars", "CPWD DSR 2021 / DSOR 2023 – Specifications & item descriptions"];

  /* =========================================================================== 1. DRAIN / CABLE-TRENCH COVER SLAB */
  var DC_LOADS = ["Pedestrian / footpath only (5 kN/m²)", "IRC Class A (114 kN axle, 57 kN wheel)",
    "IRC 70R wheeled (200 kN bogie axle)", "Mine dumper / tipper (preset GVW)"];
  /* presets (loaded). 35 t tipper: typical 6×4 tipper – geometry assumed; the others from DS.loads.DUMPERS (approx. where flagged) */
  var DC_DUMP_NAMES = ["Tipper 35 t (6×4, tandem rear axles)", "BEML BH35-2 (60 t)", "BEML BH60M (98 t)", "BEML BH100 (165 t)",
    "CAT 777G (164 t)", "BEML BH150E (240 t)", "Custom"];
  var DC_TIPPER = { gvw: 35, f: 0.20, rear: 2, st: 1.35, Tf: 2.05, Tr: 1.85, s: 0.33, b: 0.28, p: 800, approx: true };
  function dcDumper(inp) {
    var n = String(inp.dumper || "BEML BH100 (165 t)");
    if (n === "Custom") return { name: "Custom dumper " + G(num(inp.dumper_gvw)) + " t", gvw: num(inp.dumper_gvw), f: num(inp.dumper_front),
      rear: Math.max(1, Math.trunc(num(inp.dumper_rear))), st: 1.4, Tf: 2.5, Tr: 2.4, s: num(inp.dumper_dual), b: num(inp.dumper_tyre_b),
      p: num(inp.dumper_tyre_p), approx: true };
    if (n.indexOf("Tipper 35") === 0) return Object.assign({ name: n }, DC_TIPPER);
    var L = LD().DUMPERS[n] || LD().DUMPERS["BEML BH100 (165 t)"];
    return Object.assign({ name: n, rear: 1, st: 0 }, L);
  }
  M.dcDumper = dcDumper;
  /* wheel groups: P (kN, before impact), tyre-group width tb (across travel) × contact length tl (along travel),
     gauge (other wheel of the axle), tandem (next axle). Oriented to the cover span: a0 along span, b0 across. */
  function dcWheels(inp) {
    var v = String(inp.load), along = String(inp.traffic).indexOf("along") >= 0, W = [];
    if (/^IRC Class A/.test(v)) W.push({ name: "Class A wheel (114 kN axle)", P: 57, tb: 0.50, tl: 0.25, gauge: 1.8, tandem: 1.2, kind: "A",
      src: "IRC 6:2017 cl 204.1, Fig. 1 (Class A 114 kN axle, contact 500 × 250 mm)" });
    else if (/^IRC 70R/.test(v)) W.push({ name: "70R bogie wheel (200 kN axle)", P: 100, tb: 0.86, tl: 0.36, gauge: 1.93, tandem: 1.22, kind: "70R",
      src: "IRC 6:2017 cl 204.1 (70R wheeled bogie 2 × 200 kN @ 1.22 m; contact approx. 860 × 360 mm – verify Fig. 1)" });
    else if (/^Mine/.test(v)) {
      var Dm = dcDumper(inp), OL = num(inp.overload) || 1.0, Wt = Dm.gvw * 9.81 * OL, Pf = Wt * Dm.f, Pr = Wt * (1 - Dm.f) / Dm.rear;
      var src = Dm.name + ": GVW " + G(Dm.gvw) + " t × overload " + G(OL) + ", front " + F(Dm.f * 100, ".0f") + " %, tyre " + G(Dm.b * 1000) +
        " mm @ " + G(Dm.p) + " kPa (contact length = load / (p·b))" + (Dm.approx ? " – geometry approximate, verify with the OEM data sheet" : "");
      W.push({ name: "dumper front wheel (single tyre)", P: Pf / 2, tb: Dm.b, tl: Pf / 2 / (Dm.p * Dm.b), gauge: Dm.Tf, tandem: 0, kind: "D", src: src, dumper: Dm });
      W.push({ name: "dumper rear dual pair", P: Pr / 2, tb: Dm.s + Dm.b, tl: Pr / 4 / (Dm.p * Dm.b), gauge: Dm.Tr, tandem: Dm.rear > 1 ? Dm.st : 0, kind: "D",
        src: src + "; dual pair taken as one patch (c/c " + G(Dm.s * 1000) + " mm + tyre width)", dumper: Dm });
    }
    W.forEach(function (w) { w.a0 = along ? w.tb : w.tl; w.b0 = along ? w.tl : w.tb; w.sp2 = along ? w.gauge : w.tandem; w.sp_x = along ? w.tandem : w.gauge; });
    return W;
  }
  M.dcWheels = dcWheels;
  /* IS 456 cl 24.3.2(a) – effective width coefficient k for simply supported slabs vs (width / leff) (= α of IRC 112 Annex B3.2) */
  var KSS_X = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0], KSS_Y = [0.4, 0.8, 1.16, 1.48, 1.72, 1.96, 2.12, 2.24, 2.36, 2.48];
  M.k_eff = function (ratio) { return C.interp(Math.min(ratio, 1.0), KSS_X, KSS_Y); };
  function dcImpact(w, leff, twc) {
    if (w.kind === "A") return { I: leff < 3 ? 0.5 : 4.5 / (6 + leff), cl: "IRC 6 cl 208.2 (Class A: 0.5 for spans < 3 m, else 4.5/(6 + L))" };
    if (w.kind === "70R") return { I: LD().impact_70r_wheeled(leff), cl: "IRC 6 cl 208.3 (70R wheeled: 25 % for spans < 12 m)" };
    return { I: LD().impact_dumper(twc / 1000), cl: "Haul-road dynamic allowance 0.30 → 0.10 with cover depth [GP] (DS.loads.impact_dumper)" };
  }

  function dcAnalyse(c, inp, mode, D, cover, given) {
    var fck = num(inp.fck), fy = num(inp.fy), Lc = num(inp.span), bw = num(inp.bearing), twc = num(inp.t_wc);
    var precast = String(inp.construction).indexOf("Precast") === 0, bu = num(inp.unit_w);
    var veh = String(inp.load), ped = /^Pedestrian/.test(veh), dump = /^Mine/.test(veh), dt = DT();
    var climit = isMine() ? 0.2 : num(inp.crack);
    var gD = ped ? 1.5 : 1.35, gW = ped ? 1.5 : 1.75, gL = 1.5, psi = ped ? 1.0 : 0.75;
    var out = { D: D, precast: precast, bu: bu, ped: ped, dump: dump, climit: climit, LL: [] };
    c.section("Geometry & loads");
    var d0 = D - cover - (given ? given.main[0] : 12) / 2;
    var leff = c.calc("Effective span", "leff", "min(Lc + bw, Lc + d/1000)", "m", "IS 456 cl 22.2(a)", { Lc: Lc, bw: bw, d: R(d0, 1) });
    var Lt = c.calc("Length of slab across the drain", "Lt", "Lc + 2*bw", "m", "clear span + bearing on both walls", { Lc: Lc, bw: bw });
    out.leff = leff; out.Lt = Lt;
    c.let("Slab thickness", "D", D, "mm");
    if (precast) c.let("Precast unit width (along drain)", "bu", bu, "m");
    c.let("Wearing coat / screed over slab", "t", twc, "mm");
    c.let("Live load", "", veh + (ped ? "" : "; traffic " + String(inp.traffic)), "", ped ? "IRC 6 cl 206.3" : "IRC 6 cl 204");
    c.let("Load factors (ULS)", "γ", ped ? "1.5 DL + 1.5 LL" : "1.35 DL + 1.75 wearing coat + 1.5 LL", "", ped ? "IS 456 Table 18" : "IRC 6:2017 Annex B, Table B.2");
    var mL = 0, vL = 0, gov = null;
    if (ped) {
      c.section("Live load – pedestrian");
      var q = c.let("Footway live load", "q", 5.0, "kN/m²", "IRC 6 cl 206.3 / IS 875-2");
      mL = c.calc("LL moment per m", "mLL", "q*leff**2/8", "kN·m/m", "", { q: q, leff: leff });
      vL = c.calc("LL shear per m at d from support face", "vLL", "q*max(leff/2 - bw/2 - d/1000, 0)", "kN/m", "IS 456 cl 22.6.2", { q: q, leff: leff, bw: bw, d: R(d0, 1) });
      gov = { name: "pedestrian 5 kN/m²", I: 0 };
    } else {
      dcWheels(inp).forEach(function (w) {
        c.section("Live load – " + w.name);
        c.let("Wheel / wheel-group load", "P", R(w.P, 2), "kN", "", w.src);
        c.let("Contact along span × across span", "a0 × b0", F(w.a0, ".3f") + " × " + F(w.b0, ".3f"), "m",
          String(inp.traffic).indexOf("along") >= 0 ? "traffic along the drain: tyre width along the span" : "traffic across the drain: tyre length along the span");
        var im = dcImpact(w, leff, twc);
        var I = c.calc("Impact / dynamic factor", "I", "imp", "", im.cl, { imp: R(im.I, 3) });
        var a1 = c.calc("Contact along span at slab top (45° through wearing coat)", "a1", "a0 + 2*t/1000", "m", "IRC 112 Annex B3.1 / IS 456 cl 24.3.2", { a0: R(w.a0, 3), t: twc });
        var b1 = c.calc("Contact across span at slab top", "b1", "b0 + 2*t/1000", "m", "IRC 112 Annex B3.1", { b0: R(w.b0, 3), t: twc });
        var af = c.calc("Loaded length along span at mid-depth", "af", "a1 + D/1000", "m", "45° dispersion to mid-depth", { a1: a1, D: D });
        var Ps = c.calc("Load on the span", "Ps", "P*min(1, leff/af)", "kN", "", "a patch longer than leff sends the excess straight into the walls", { P: R(w.P, 3), leff: leff, af: af });
        var a2 = Math.min(af, leff);
        var Pu = precast ? c.calc("Load on one precast unit", "Pu", "Ps*min(1, bu/b1)", "kN", "", "a patch wider than the unit is shared with the next unit", { Ps: Ps, bu: bu, b1: b1 }) : Ps;
        var ratio = precast ? bu / leff : 10;
        var k = c.calc("Effective-width coefficient", "k", "kv", "", "IS 456 cl 24.3.2(a) table (α of IRC 112 Annex B3.2)",
          "slab width / leff = " + (precast ? F(ratio, ".2f") : "≥ 1 (continuous slab)"), { kv: R(M.k_eff(ratio), 3) });
        var x = leff / 2;
        var bef = c.calc("Effective width for moment (load at mid-span)", "bef", precast ? "min(k*x*(1 - x/leff) + b1, bu)" : "k*x*(1 - x/leff) + b1", "m",
          "IS 456 cl 24.3.2(a)" + (precast ? " – not more than the unit width" : ""), { k: k, x: R(x, 4), leff: leff, b1: b1, bu: bu });
        if (!precast && w.sp_x > 0 && bef > w.sp_x)
          bef = c.calc("Effective width per wheel (overlapping wheels)", "bef", "(bef1 + s)/2", "m", "IS 456 cl 24.3.2(a)(1)", { bef1: bef, s: w.sp_x });
        var M1 = c.calc("LL moment – patch at mid-span", "M1", "Pu*(leff/4 - a2/8)", "kN·m", "simply supported, patch length a2 = min(af, leff)", { Pu: Pu, leff: leff, a2: R(a2, 4) });
        var Mw = M1;
        if (w.sp2 > 0 && w.sp2 < leff) {
          var M2 = c.calc("LL moment – two loads " + F(w.sp2, ".2f") + " m apart on the span", "M2", "Pu*(leff - s/2)**2/(2*leff)", "kN·m", "max. moment of two equal loads", { Pu: Pu, leff: leff, s: w.sp2 });
          Mw = Math.max(M1, M2);
        }
        var mw = c.calc("LL moment per m width", "mLL", "Mw/bef", "kN·m/m", "", { Mw: R(Mw, 4), bef: bef });
        // shear: wheel at clear distance av from the support face; loads within 2d of the face are reduced by
        // β = av/(2d) (0.5d ≤ av ≤ 2d) – IRC 112 cl 10.3.2(6) / IS 456 cl 40.5.1 (enhanced τc = 2d·τc/av, same thing)
        var dd = d0 / 1000, best = null, avMax = Math.max(Lc - a1, 0);
        for (var j = 0; j <= 60; j++) {
          var av_ = avMax * j / 60, x_ = Math.min(bw / 2 + av_ + a1 / 2, leff / 2), be = Math.min(Math.max(av_, 0.5 * dd) / (2 * dd), 1);
          var bv_ = precast ? Math.min(M.k_eff(ratio) * x_ * (1 - x_ / leff) + b1, bu) : M.k_eff(ratio) * x_ * (1 - x_ / leff) + b1;
          var f_ = (be * (1 - x_ / leff) + (w.sp2 > 0 ? Math.max(1 - (x_ + w.sp2) / leff, 0) : 0)) / bv_;
          if (!best || f_ > best.f + 1e-12) best = { av: av_, x: x_, beta: be, f: f_ };
        }
        c.let("Wheel position for max. shear: clear distance to support face", "av", R(best.av, 3), "m", "", "scanned 0 … " + F(avMax, ".2f") + " m");
        var beta = c.calc("Shear reduction for a load near the support", "β", "min(max(av, 0.5*d)/(2*d), 1)", "", "IRC 112 cl 10.3.2(6) / IS 456 cl 40.5.1",
          { av: R(best.av, 4), d: R(dd, 4) });
        var bv = c.calc("Effective width for shear (load near support)", "bv", precast ? "min(k*x*(1 - x/leff) + b1, bu)" : "k*x*(1 - x/leff) + b1", "m",
          "IS 456 cl 24.3.2(a), load centre x from the support", { k: k, x: R(best.x, 4), leff: leff, b1: b1, bu: bu });
        var two = w.sp2 > 0 && best.x + w.sp2 < leff;
        var vw = c.calc("LL shear per m at the support (β-reduced)", "vLL", two ? "Pu*(beta*(1 - x/leff) + max(1 - (x + s)/leff, 0))/bv" : "Pu*beta*(1 - x/leff)/bv", "kN/m",
          "IS 456 cl 22.6.2 / 40.5", { Pu: Pu, beta: beta, x: R(best.x, 4), leff: leff, s: w.sp2, bv: bv });
        // punching under the wheel (critical perimeter at d/2 from the loaded area at slab top)
        var full = precast && b1 + d0 / 1000 >= bu;
        var u = c.calc("Critical perimeter at d/2 from the loaded area", "u", full ? "2*bu" : "2*(a1 + d/1000) + 2*(b1 + d/1000)", "m",
          "IS 456 cl 31.6.1" + (full ? " – unit narrower than the perimeter: two faces across the unit" : ""), { a1: a1, b1: b1, d: R(d0, 1), bu: bu });
        var Pw = precast ? w.P * Math.min(1, bu / b1) : w.P;
        var Vp = c.calc("Factored wheel load for punching", "Vpu", "gL*(1 + I)*Pw", "kN", "", { gL: gL, I: I, Pw: R(Pw, 3) });
        var tvp = c.calc("Punching shear stress", "τv", "Vp/(u*d)", "N/mm²", "IS 456 cl 31.6.2", { Vp: Vp, u: u, d: R(d0, 1) });
        var tcp = c.calc("Permissible punching shear stress", "ks·τc", "min(0.5 + bc, 1)*0.25*sqrt(fck)", "N/mm²", "IS 456 cl 31.6.3.1",
          { bc: R(Math.min(a1, b1) / Math.max(a1, b1), 3), fck: fck });
        c.check("Punching shear under " + w.name, tvp, tcp, { unit: "N/mm²", clause: "IS 456 cl 31.6.3", note: "increase thickness" });
        out.LL.push({ name: w.name, w: w, I: I, a1: a1, b1: b1, m: mw, v: vw, tvp: tvp, tcp: tcp, Pu: Pu, bef: bef });
        if ((1 + I) * mw > mL) { mL = (1 + I) * mw; gov = { name: w.name, I: I, w: w }; }
        vL = Math.max(vL, (1 + I) * vw);
      });
    }
    out.gov = gov;
    c.section("Design actions per metre width");
    var mD = c.calc("Self-weight moment", "mD", "25*D/1000*leff**2/8", "kN·m/m", "", { D: D, leff: leff });
    var mW = c.calc("Wearing-coat moment", "mW", "24*t/1000*leff**2/8", "kN·m/m", "CC / screed 24 kN/m³", { t: twc, leff: leff });
    var Mu = c.calc("Design moment (ULS)", "Mu", "gD*mD + gW*mW + gL*mL", "kN·m/m", ped ? "IS 456 Table 18" : "IRC 6 Table B.2",
      ped ? "" : "mL incl. impact, governing: " + gov.name, { gD: gD, gW: gW, gL: gL, mD: mD, mW: mW, mL: R(mL, 4) });
    var Ms = c.calc("Service moment for crack width", "Ms", "mD + mW + psi*mL", "kN·m/m", ped ? "IS 456 cl 35.3.2" : "IRC 6 Table B.3 (frequent: ψ = 0.75 LL)", { mD: mD, mW: mW, psi: psi, mL: R(mL, 4) });
    var vDL = (25 * D / 1000 * gD + 24 * twc / 1000 * gW) * Math.max(leff / 2 - bw / 2 - d0 / 1000, 0);
    var Vu = c.calc("Design shear at d from support face (ULS)", "Vu", "vD + gL*vL", "kN/m", "IS 456 cl 22.6.2", { vD: R(vDL, 3), gL: gL, vL: R(vL, 4) });
    out.Mu = Mu; out.Ms = Ms; out.Vu = Vu;
    c.section("Flexure, crack width & shear");
    var bars = designStrip(c, Mu, D, cover, fck, fy, "main, bottom", { Ms: Ms, climit: climit, given: given ? given.main : null,
      dias: [10, 12, 16, 20, 25], smax: 200.0, rule: dt ? { member: "drain", role: "main" } : null, Vu: Vu });
    out.bars = bars;
    var pt = 100 * bars.Ast_prov / (1000 * bars.d);
    RC().shear(c, Vu, 1000, bars.d, pt, fck, fy, "slab", { D: D, tag: "(one-way, near support)" });
    RC().deflection(c, leff * 1000, bars.d, "simply supported", fy, bars.req, bars.Ast_prov, 1000);
    var Adist = c.calc("Distribution steel", "As,d", ped ? "0.0012*1000*D" : "max(0.0012*1000*D, 0.2*As)", "mm²/m",
      ped ? "IS 456 cl 26.5.2.1" : "IS 456 cl 26.5.2.1; ≥ 20 % of main steel under wheel loads (IRC SP-13 practice)", { D: D, As: R(bars.Ast_prov, 1) });
    out.dist = stripBars(c, Adist, "drain", "dist", bars.d - bars.dia, D, given ? given.dist : null, "distribution, across span",
      { dias: [8, 10, 12], rule: { main_dia: bars.dia } });
    out.top = null;
    if (D >= 200) {
      var At = c.calc("Top mesh (nominal, handling & shrinkage) each way", "As,top", "0.0012*1000*D/2", "mm²/m", "IS 456 cl 26.5.2.1 / IRC 112 cl 16.5 practice", { D: D });
      out.top = stripBars(c, At, "drain", "dist", D - cover - 10, D, null, "top mesh", { dias: [8, 10, 12], rule: { main_dia: bars.dia } });
    }
    var Dmin = ped ? 100 : dump ? 200 : 150;
    c.ok("Slab thickness ≥ practical minimum (" + G(Dmin) + " mm)", D >= Dmin, { detail: G(D) + " mm", clause: ped ? "Practice (precast covers ≥ 100 mm)" : dump ?
      "Mine practice for haul-road covers [GP]" : "IRC SP-13 practice for covers under IRC loading", warn_only: true });
    // bearing on the drain wall
    c.section("Bearing on drain wall");
    var wallRCC = String(inp.wall).indexOf("RCC") === 0;
    var Pb = ped ? 5.0 * leff / 2 * (precast ? bu : 1) : (gov.w ? (precast ? gov.w.P * Math.min(1, bu / out.LL.filter(function (x) { return x.w === gov.w; })[0].b1) : gov.w.P) * (1 + gov.I) : 0);
    var Rs = c.calc("Service reaction on one wall (wheel at the support)", "Rs", "Pb + (25*D/1000 + 24*t/1000)*Lt/2*bl", "kN", "",
      { Pb: R(Pb, 3), D: D, t: twc, Lt: Lt, bl: precast ? bu : 1 });
    var lb = precast ? bu : Math.min(1.0, (gov && gov.w ? out.LL.filter(function (x) { return x.w === gov.w; })[0].b1 : 1) + 2 * D / 1000);
    var sb = c.calc("Bearing stress on wall top", "σb", "Rs*1000/(bw*1000*lb*1000)", "N/mm²", "", "bearing length " + F(lb, ".2f") + " m", { Rs: Rs, bw: bw, lb: R(lb, 3) });
    if (wallRCC) c.check("Bearing (ULS) ≤ 0.45 fck of wall concrete", 1.5 * sb, 0.45 * num(inp.fck_wall), { unit: "N/mm²", clause: "IS 456 cl 34.4" });
    else c.check("Bearing (service) ≤ permissible on brick masonry", sb, 1.0, { unit: "N/mm²", clause: "IS 1905 cl 5.3 / 5.4.1.4 (7.5 N/mm² bricks, CM 1:4, +50 % local – verify)",
      note: "use an RCC coping / bed block if it fails" });
    c.ok("Bearing width ≥ " + (ped ? "100" : "150") + " mm", bw * 1000 >= (ped ? 100 : 150) - 1e-6, { detail: G(bw * 1000) + " mm", clause: "Practice (seating + construction tolerance)", warn_only: true });
    // precast handling – lifting hooks
    if (precast) {
      c.section("Precast unit – handling & lifting hooks");
      var Wu = c.calc("Weight of one unit", "Wu", "25*Lt*bu*D/1000", "kN", "", { Lt: Lt, bu: bu, D: D });
      var Fh = c.calc("Force per hook leg (2 hooks × 2 legs, sling 60°, dynamic 1.5)", "Fh", "1.5*Wu/(2*2*sin(radians(60)))", "kN",
        "IS 15916:2010 handling practice (verify)", { Wu: Wu });
      var Ah = c.calc("Hook bar area required (mild steel Fe250, σst = 140 N/mm²)", "Ah", "Fh*1000/140", "mm²", "IS 456 Table 22 (WSM) – never TMT for hooks", { Fh: Fh });
      var hd = [10, 12, 16, 20].filter(function (x) { return area(x) >= Ah; })[0] || 20;
      c.ok("Lifting hook bar area ≥ required", area(hd) >= Ah - 1e-9, { detail: "2 nos " + G(hd) + "Ø MS U-hooks per unit, As = " + F(area(hd), ".0f") + " mm² per leg",
        clause: "Practice (≥ 10Ø mild steel)" });
      c.info("Handling", "Unit ≈ " + F(Wu * 1000 / 9.81, ".0f") + " kg" + (Wu > 1.0 ? " – lift with chain-pulley block / hydra crane (manual ≤ 50 kg per person)" : " – two persons can place it") +
        "; lift only after 7 days curing (≥ 70 % fck); hook legs bent under the bottom bars", "IS 15916 / practice");
      out.Wu = Wu; out.hook = hd;
    }
    return out;
  }
  M.dcAnalyse = dcAnalyse;

  function run_drain_cover(inp, mode) {
    var c = new C.Calc("RCC cover slab for drain / cable trench");
    var fck = num(inp.fck), fy = num(inp.fy);
    var cover = coverAdopt(c, inp, mode, "slab");
    if (DT()) DT().site_checks(c, "drain", fck, cover);
    var veh = String(inp.load), ped = /^Pedestrian/.test(veh), dump = /^Mine/.test(veh);
    var Lc = num(inp.span), bw = num(inp.bearing), leff0 = Lc + bw;
    var precast = String(inp.construction).indexOf("Precast") === 0;
    var thumbD = ped ? Math.max(100, ceil_to(leff0 * 1000 / 25 + 50, 10)) : dump ? Math.max(200, ceil_to(leff0 * 1000 / 6 + 100, 25)) : Math.max(150, ceil_to(leff0 * 1000 / 10 + 75, 10));
    var D, given = null;
    if (mode === "check") {
      D = num(inp.D_chk);
      given = { main: [num(inp.main_dia), num(inp.main_s)], dist: [num(inp.dist_dia), num(inp.dist_s)] };
    } else if (mode === "thumb") {
      D = thumbD;
      c.info("Thumb-rule thickness", "D ≈ L/25 + 50 (pedestrian, ≥ 100), L/10 + 75 (IRC wheels, ≥ 150), L/6 + 100 (dumpers, ≥ 200) mm; then code check", "Practice");
    } else {
      D = ped ? 100 : dump ? 200 : 150;
      for (var it = 0; it < 80; it++) {
        var sc = new C.Calc("s");
        dcAnalyse(sc, inp, mode, D, cover, null);
        var f = sc.failures.filter(function (s) { return !/^Bearing|^Lifting/.test(s.label); });
        if (!f.length || D >= 900) break;
        D += D < 200 ? 10 : 25;
      }
    }
    var o = dcAnalyse(c, inp, mode, D, cover, given);
    c.thumb("Cover slab thickness", thumbD, D, "mm", ped ? "L/25 + 50 (≥ 100)" : dump ? "L/6 + 100 (≥ 200)" : "L/10 + 75 (≥ 150)", "Practice");
    c.thumb("Steel in cover slab", 80, 0, "kg/m³", "≈ 80–110 kg/m³ for wheel-loaded covers", "Estimator practice");
    c.miss("Drain / trench walls: design for the wheel reaction on the wall top + earth & surcharge pressure (RCC drain module)", "IS 456 / IRC 6", "Important");
    c.miss("Edge protection: MS angle nosing 50×50×6 at the slab ends & wall seating where vehicles cross; 10 mm joints filled with CM 1:3", "Practice", "Advisory");
    if (!ped && !precast) c.miss("Cast-in-situ cover: provide removable inspection covers / cable-pulling pits at ≤ 30 m", "Practice", "Advisory");
    if (dump) c.miss("Dumper geometry (tyre size, pressure, axle loads) from the OEM data sheet of the actual fleet; check skewed crossing", "Mine practice", "Critical");
    if (String(inp.wall).indexOf("RCC") !== 0) c.miss("Brick drain wall under wheel loads: provide RCC coping / bed block 150 mm to spread the reaction", "IS 1905", "Important");
    // ---------------------------------------------------------------- BBS
    var B_ = BB(), Lt = o.Lt, Ld = num(inp.length), bu = num(inp.unit_w), bars = o.bars, dist = o.dist, cv = cover, bbs = [];
    var nU = precast ? Math.ceil(Ld / (bu + 0.01) - 1e-9) : 1;
    var legM = Math.max(D - 2 * cv, 4 * bars.dia);
    if (precast) {
      bbs.push(B_.row("Cover unit", "M1", bars.dia, "U (90° legs up at both ends)", B_.count(bu * 1000, bars.spacing, cv) * nU, B_.ubar(bars.dia, Lt * 1000 - 2 * cv, legM), "bottom main, across drain @ " + G(bars.spacing)));
      bbs.push(B_.row("Cover unit", "M2", dist.dia, "straight", B_.count(Lt * 1000, dist.spacing, cv) * nU, B_.straight(dist.dia, bu * 1000 - 2 * cv), "distribution on main bars @ " + G(dist.spacing)));
      if (o.top) {
        bbs.push(B_.row("Cover unit", "T1", o.top.dia, "straight", B_.count(bu * 1000, o.top.spacing, cv) * nU, B_.straight(o.top.dia, Lt * 1000 - 2 * cv), "top mesh across drain"));
        bbs.push(B_.row("Cover unit", "T2", o.top.dia, "straight", B_.count(Lt * 1000, o.top.spacing, cv) * nU, B_.straight(o.top.dia, bu * 1000 - 2 * cv), "top mesh along drain"));
      }
      var hd = o.hook, hv = D - cv + 60, hk = B_.shape(hd, [B_.leg(hd), hv, 100, hv, B_.leg(hd)], [90, 90, 90, 90], 0, "lifting hook (feet under bottom bars, 60 mm loop)");
      bbs.push(B_.row("Cover unit", "H1", hd, "inverted U lifting hook (MS Fe250)", 2 * nU, hk, "2 per unit at 0.2 × length from the ends"));
    } else {
      var nM = B_.count(Ld * 1000, bars.spacing, cv);
      bbs.push(B_.row("Cover slab", "M1", bars.dia, "U (90° legs up at both ends)", nM, B_.ubar(bars.dia, Lt * 1000 - 2 * cv, legM), "bottom main, across drain @ " + G(bars.spacing)));
      bbs.push(B_.row("Cover slab", "M2", dist.dia, "straight", B_.count(Lt * 1000, dist.spacing, cv), B_.split(dist.dia, Ld * 1000 - 2 * cv, fck, fy), "distribution along drain @ " + G(dist.spacing)));
      if (o.top) {
        bbs.push(B_.row("Cover slab", "T1", o.top.dia, "straight", B_.count(Ld * 1000, o.top.spacing, cv), B_.straight(o.top.dia, Lt * 1000 - 2 * cv), "top mesh across drain"));
        bbs.push(B_.row("Cover slab", "T2", o.top.dia, "straight", B_.count(Lt * 1000, o.top.spacing, cv), B_.split(o.top.dia, Ld * 1000 - 2 * cv, fck, fy), "top mesh along drain"));
      }
    }
    var tmt = bbs.filter(function (b) { return b.mark !== "H1"; }), ms = bbs.filter(function (b) { return b.mark === "H1"; });
    // ---------------------------------------------------------------- quantities
    var Dm = D / 1000, qty = [];
    if (precast) {
      qty.push(Q("RCC M" + G(fck) + " in precast cover slabs for drains / cable trenches (excl. steel & shuttering)", "cum",
        [row("Cover units " + F(Lt, ".2f") + " × " + F(bu, ".2f") + " × " + F(Dm, ".3f") + " m", nU, Lt, bu, Dm)], null, CM().rcc_rate(fck)));
      qty.push(Q("Centering & shuttering for slab units (precast moulds): soffit & edges", "sqm",
        [row("Soffit of units", nU, Lt, bu), row("Edges of units", nU, 2 * (Lt + bu), null, Dm)], null, CM().RATE.shutter_slab));
      qty.push(steelQty(tmt, "Drain cover"));
      qty.push(steelQty(ms, "Drain cover", "Mild steel Fe250 bars for lifting hooks – cutting, bending, placing", [CPWD(), "5.22.1"]));
      qty.push(Q("Hoisting, placing & bedding precast cover units on drain walls in CM 1:3, joints filled", "each", [row("Cover units", nU)], null, ped ? 150 : 400,
        "Non-SOR – rate by analysis (hydra / chain pulley for heavy units)"));
    } else {
      qty.push(Q("RCC M" + G(fck) + " in cover slab over drain / cable trench, cast in situ (excl. steel & shuttering)", "cum",
        [row("Cover slab", 1, Ld, Lt, Dm)], null, CM().rcc_rate(fck)));
      qty.push(Q("Centering & shuttering for suspended slab – cover slab soffit (props inside the channel)", "sqm", [row("Soffit", 1, Ld, Lc)], null, CM().RATE.shutter_slab));
      qty.push(steelQty(tmt, "Drain cover"));
    }
    if (num(inp.t_wc) > 0) qty.push(Q("Cement concrete wearing course / screed " + G(num(inp.t_wc)) + " mm over cover slab", "sqm", [row("Wearing course", 1, Ld, Lt)], null, 520,
      "Non-SOR – CC 1:2:4 / M25 screed with broom finish"));
    // ---------------------------------------------------------------- drawings
    var sheet = dcDrawing(inp, o, cover, nU, ped, precast);
    var steelKg = C.sum(bbs.map(function (b) { return b.weight; }));
    var volC = precast ? nU * Lt * bu * Dm : Ld * Lt * Dm;
    var summary = { "Cover slab": G(D) + " mm thick, " + (precast ? "precast units " + F(Lt, ".2f") + " × " + F(bu, ".2f") + " m (" + nU + " nos)" : "cast in situ, " + F(Lt, ".2f") + " m wide"),
      "Main bars": G(bars.dia) + "Ø @ " + G(bars.spacing) + " c/c (bottom, across drain)", "Distribution": G(dist.dia) + "Ø @ " + G(dist.spacing) + " c/c",
      "Governing load": o.gov ? o.gov.name : "", "Steel": F(steelKg, ".0f") + " kg (" + F(steelKg / Math.max(volC, 1e-9), ".0f") + " kg/m³)",
      "Max utilisation": F(c.max_utilisation, ".2f") };
    if (o.top) summary["Top mesh"] = G(o.top.dia) + "Ø @ " + G(o.top.spacing) + " both ways";
    if (precast) summary["Lifting hooks"] = "2 × " + G(o.hook) + "Ø MS per unit (" + F(o.Wu * 1000 / 9.81, ".0f") + " kg unit)";
    var refs = RCC_REFS.concat(["IRC:6-2017 – Loads (Class A / 70R, impact cl 208)", "IRC:112-2020 Annex B3 – Effective width of slabs",
      "IRC SP-13 – Small bridges & culverts (cover slab practice)", "IS 15916:2010 – Precast concrete construction"]);
    return C.DesignResult({ module: "drain_cover", title: "RCC drain / cable-trench cover slab", inputs: inp, calc: c, summary: summary,
      drawings: [sheet], quantities: qty, bbs: bbs, tables: {}, references: refs });
  }
  M.run_drain_cover = run_drain_cover;

  function dcDrawing(inp, o, cover, nU, ped, precast) {
    var D_ = DR(), Lc = num(inp.span) * 1000, bw = num(inp.bearing) * 1000, D = o.D, twc = num(inp.t_wc), Lt = o.Lt * 1000;
    var Hd = Math.max(num(inp.drain_depth) * 1000, 300), tw = Math.max(bw + 75, 200), bu = num(inp.unit_w) * 1000, bars = o.bars, dist = o.dist;
    // section across the drain
    var s = new D_.View("Section A–A across drain");
    s.rect(-tw, -Hd, tw, Hd, "OUTLINE", "concrete"); s.rect(Lc, -Hd, tw, Hd, "OUTLINE", "concrete");
    s.rect(-tw - 100, -Hd - 150, Lc + 2 * tw + 200, 150, "CONCRETE");
    s.rect(-bw, 0, Lt, D, "OUTLINE", "concrete");
    if (twc > 0) s.rect(-bw, D, Lt, twc, "THIN");
    s.line(-tw - 600, D + twc, -tw, D + twc, "SOIL"); s.line(Lc + tw, D + twc, Lc + tw + 600, D + twc, "SOIL");
    var cv = cover;
    s.poly([[-bw + cv, D - cv], [-bw + cv, cv], [Lc + bw - cv, cv], [Lc + bw - cv, D - cv]], false, "REBAR");
    var nd = Math.max(3, Math.min(9, Math.floor(Lt / Math.max(dist.spacing, 1))));
    for (var k = 0; k < nd; k++) s.bar_dot(-bw + cv + 60 + (Lt - 2 * cv - 120) * k / (nd - 1), cv + bars.dia + dist.dia / 2, dist.dia);
    if (o.top) s.line(-bw + cv, D - cv, Lc + bw - cv, D - cv, "REBAR");
    if (!ped && o.gov && o.gov.w) {
      var a0 = o.gov.w.a0 * 1000, top = D + twc;
      s.rect(Lc / 2 - a0 / 2, top, a0, 60, "LOAD");
      s.line(Lc / 2, top + 60, Lc / 2, top + 360, "LOAD");
      s.text(Lc / 2, top + 400, o.gov.name + " P = " + F(o.gov.w.P, ".0f") + " kN (+" + F(o.gov.I * 100, ".0f") + " % impact)", 2.2, { anchor: "middle" });
    } else s.text(Lc / 2, D + twc + 200, "Footway load 5 kN/m²", 2.2, { anchor: "middle" });
    s.text(Lc / 2, -Hd - 380, "M1 " + G(bars.dia) + "Ø @ " + G(bars.spacing) + " c/c (bottom, U-bars)", 2.2, { anchor: "middle" });
    s.text(Lc / 2, -Hd - 560, "M2 " + G(dist.dia) + "Ø @ " + G(dist.spacing) + " c/c distribution" + (o.top ? "; top mesh " + G(o.top.dia) + "Ø @ " + G(o.top.spacing) + " both ways" : ""), 2.2, { anchor: "middle" });
    s.dim(0, -Hd * 0.5, Lc, -Hd * 0.5, 0, "CLEAR SPAN " + F(Lc, ",.0f"));
    s.dim(-bw, D + twc, Lc + bw, D + twc, -8);
    s.dim(Lc + bw, 0, Lc + bw, D, -8);
    s.dim(-bw, 0, 0, 0, 6);
    // plan
    var p = new D_.View(precast ? "Plan – precast cover units" : "Plan – cover slab (3 m strip)"), gap = 10, nShow = precast ? Math.min(nU, 3) : 1;
    var len = precast ? nShow * (bu + gap) - gap : 3000;
    p.line(-200, bw, len + 200, bw, "HIDDEN"); p.line(-200, bw + Lc, len + 200, bw + Lc, "HIDDEN");
    p.text(len + 250, bw + Lc / 2, "drain (" + F(Lc, ",.0f") + " clear)", 2.0);
    if (precast) {
      for (var u = 0; u < nShow; u++) {
        var x0 = u * (bu + gap);
        p.rect(x0, 0, bu, Lt, "OUTLINE", "concrete");
        p.circle(x0 + bu / 2, 0.2 * Lt, 25, "STEEL"); p.circle(x0 + bu / 2, 0.8 * Lt, 25, "STEEL");
      }
      p.text(bu / 2, -180, "Lifting hooks 2 × " + G(o.hook) + "Ø MS per unit", 2.0, { anchor: "middle" });
      p.dim(0, Lt, bu, Lt, -8);
    } else {
      p.rect(0, 0, len, Lt, "OUTLINE", "concrete");
      for (var j = 0; j < 6; j++) p.line(150 + j * (len - 300) / 5, cv, 150 + j * (len - 300) / 5, Lt - cv, "REBAR");
    }
    p.dim(len, 0, len, Lt, -8);
    // unit section along the drain
    var uu = new D_.View(precast ? "Section B–B through a unit (lifting hook)" : "Section B–B along drain");
    var W = precast ? bu : 1500;
    uu.rect(0, 0, W, D, "OUTLINE", "concrete");
    var nb = Math.max(2, Math.min(12, BB().count(W, bars.spacing, cv)));
    for (var b = 0; b < nb; b++) uu.bar_dot(cv + bars.dia / 2 + (W - 2 * cv - bars.dia) * (nb > 1 ? b / (nb - 1) : 0.5), cv + bars.dia / 2, bars.dia);
    uu.line(cv, cv + bars.dia + dist.dia / 2, W - cv, cv + bars.dia + dist.dia / 2, "REBAR");
    if (precast) {
      var xh = W / 2, hv = D - cv + 60;
      uu.poly([[xh - 50 - 12 * o.hook, cv + bars.dia + 10], [xh - 50, cv + bars.dia + 10], [xh - 50, cv + hv], [xh + 50, cv + hv], [xh + 50, cv + bars.dia + 10], [xh + 50 + 12 * o.hook, cv + bars.dia + 10]], false, "STEEL");
      uu.text(xh + 120, D + 80, "H1 " + G(o.hook) + "Ø MS hook", 2.0);
    }
    uu.dim(0, 0, W, 0, 8);
    uu.dim(W, 0, W, D, -8);
    var notes = ["Concrete M" + G(num(inp.fck)) + ", steel Fe" + G(num(inp.fy)) + " (hooks mild steel Fe250), clear cover " + G(cover) + " mm.",
      "Live load: " + String(inp.load) + (ped ? "" : "; " + String(inp.traffic)) + ". Effective width per IS 456 cl 24.3.2 / IRC 112 Annex B3.",
      precast ? "Precast units cast on level platform, cured 7 days, lifted at the hooks only; 10 mm joints filled with CM 1:3." : "Cast in situ on props inside the channel; remove props after 14 days.",
      "Seat units on CM 1:3 bedding; bearing " + G(num(inp.bearing) * 1000) + " mm on each wall."];
    return new D_.Sheet("RCC drain / cable-trench cover slab", "DC-01", [s, p, uu], notes);
  }

  var DC_PARAMS = [
    P("span", "Clear span of drain / trench", 0.9, "m", { min: 0.3, max: 3.0, step: 0.05, group: "Geometry" }),
    P("bearing", "Bearing on each wall", 0.15, "m", { min: 0.075, max: 0.4, step: 0.025, group: "Geometry" }),
    P("construction", "Construction", "Precast units (with lifting hooks)", { kind: "select", options: ["Precast units (with lifting hooks)", "Cast in situ (continuous slab)"], group: "Geometry" }),
    P("unit_w", "Precast unit width (along drain)", 0.6, "m", { min: 0.3, max: 2.0, step: 0.05, group: "Geometry",
      when: function (v) { return String(v.construction).indexOf("Precast") === 0; } }),
    P("t_wc", "Wearing coat / screed on slab", 50.0, "mm", { min: 0, max: 300, step: 5, group: "Geometry" }),
    P("drain_depth", "Drain depth (for drawing)", 0.6, "m", { min: 0.3, max: 3.0, step: 0.05, group: "Geometry" }),
    P("length", "Length of drain covered (quantity)", 50.0, "m", { min: 1, max: 5000, group: "Geometry" }),
    P("load", "Live load", DC_LOADS[1], { kind: "select", options: DC_LOADS.slice(), group: "Loads" }),
    P("traffic", "Traffic direction", "Vehicles move along the drain", { kind: "select", options: ["Vehicles move along the drain", "Vehicles cross over the drain"],
      group: "Loads", when: function (v) { return !/^Pedestrian/.test(String(v.load)); },
      help: "Along: tyre width lies along the span and both wheels of an axle may sit on a wide span. Across: tyre length along the span, tandem axles may both be on it." }),
    P("dumper", "Dumper / tipper (loaded)", "BEML BH100 (165 t)", { kind: "select", options: DC_DUMP_NAMES.slice(), group: "Mine dumper",
      when: function (v) { return /^Mine/.test(String(v.load)); } }),
    P("overload", "Overload factor on GVW", 1.10, { min: 1.0, max: 1.3, step: 0.05, group: "Mine dumper", when: function (v) { return /^Mine/.test(String(v.load)); } }),
    P("dumper_gvw", "Custom: GVW (loaded)", 35.0, "t", { min: 10, max: 400, group: "Mine dumper", when: function (v) { return /^Mine/.test(String(v.load)) && v.dumper === "Custom"; } }),
    P("dumper_front", "Custom: front-axle share of GVW", 0.33, { min: 0.15, max: 0.5, step: 0.01, group: "Mine dumper", when: function (v) { return /^Mine/.test(String(v.load)) && v.dumper === "Custom"; } }),
    P("dumper_rear", "Custom: number of rear axles", 1, { kind: "int", min: 1, max: 3, group: "Mine dumper", when: function (v) { return /^Mine/.test(String(v.load)) && v.dumper === "Custom"; } }),
    P("dumper_dual", "Custom: dual tyre c/c", 0.6, "m", { min: 0.2, max: 1.5, step: 0.05, group: "Mine dumper", when: function (v) { return /^Mine/.test(String(v.load)) && v.dumper === "Custom"; } }),
    P("dumper_tyre_b", "Custom: tyre width", 0.5, "m", { min: 0.2, max: 1.2, step: 0.01, group: "Mine dumper", when: function (v) { return /^Mine/.test(String(v.load)) && v.dumper === "Custom"; } }),
    P("dumper_tyre_p", "Custom: tyre pressure", 650.0, "kPa", { min: 300, max: 1000, step: 10, group: "Mine dumper", when: function (v) { return /^Mine/.test(String(v.load)) && v.dumper === "Custom"; } }),
    P("crack", "Crack-width limit", 0.3, "mm", { kind: "select", options: [0.3, 0.2], group: "Loads", help: "0.2 mm for aggressive / mining sites (used automatically for site = mine)" }),
    P("wall", "Drain wall", "RCC wall", { kind: "select", options: ["RCC wall", "Brick masonry wall"], group: "Supports" }),
    P("fck_wall", "Concrete grade of wall", 25.0, "N/mm²", { kind: "select", options: [20.0, 25.0, 30.0], group: "Supports", when: function (v) { return String(v.wall).indexOf("RCC") === 0; } })
  ].concat(matParams(30.0, "Moderate", 30.0), [
    P("D_chk", "Slab thickness (check)", 175.0, "mm", { min: 75, max: 900, step: 5, group: "My design", modes: CHECK }),
    P("main_dia", "Main bar dia (check)", 16.0, "mm", { kind: "select", options: [8.0, 10.0, 12.0, 16.0, 20.0, 25.0], group: "My design", modes: CHECK }),
    P("main_s", "Main bar spacing (check)", 125.0, "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK }),
    P("dist_dia", "Distribution bar dia (check)", 10.0, "mm", { kind: "select", options: [8.0, 10.0, 12.0, 16.0], group: "My design", modes: CHECK }),
    P("dist_s", "Distribution spacing (check)", 200.0, "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK })
  ]);
  M.DC_PARAMS = DC_PARAMS;
  C.register({ id: "drain_cover", phase: 3, category: "Drains, culverts & roads", name: "Drain / cable-trench cover slab", icon: "🟫",
    description: "RCC cover slab (precast units with lifting hooks or cast in situ) for drains & cable trenches under IRC Class A / 70R, " +
      "mine dumpers (35–240 t presets) or pedestrians: effective width, impact, flexure, one-way & punching shear, crack width, bearing, BBS.",
    params: DC_PARAMS, run: run_drain_cover, references: RCC_REFS });

  /* =========================================================================== 2. SEPTIC TANK + SOAK PIT (IS 2470) */
  var ST_USE = ["Residential colony / quarters", "Office / workshop (8 h shift)", "Canteen / mess (per meal served)", "Hostel / rest house"];
  /* sewage reaching the tank (l / user / day) and sludge + scum accumulation (m³ / user / year) – IS 2470-1 practice
     values (WC + sullage for residences; WC only for offices) – verify against IS 2470-1 Annex / CPHEEO manual */
  var ST_FLOW = [100, 30, 10, 100], ST_SLUDGE = [0.04, 0.02, 0.01, 0.04], ST_THUMB = [0.14, 0.07, 0.025, 0.14];   // thumb: m³ liquid per user
  function stUse(v) { var i = ST_USE.indexOf(String(v)); return i < 0 ? 0 : i; }
  /* IS 2470-2:1985 Table 1 (from US PHS): percolation time (min for 25 mm fall) → max effluent application (l/m²/day) – verify */
  var PERC_T = [1, 2, 3, 4, 5, 10, 15, 30, 45, 60], PERC_R = [204, 143, 118, 102, 90, 65, 53, 37, 33, 24];
  M.perc_rate = function (t) { return C.interp(t, PERC_T, PERC_R); };
  var ST_WALLS = ["Brick masonry 230 mm", "Brick masonry 345 mm", "RCC walls"];

  function stCapacity(c, inp, mode) {
    var N = Math.max(1, Math.trunc(num(inp.users))), u = stUse(inp.use);
    var q = num(inp.flow) > 0 ? num(inp.flow) : ST_FLOW[u], r = num(inp.sludge_rate) > 0 ? num(inp.sludge_rate) : ST_SLUDGE[u];
    var n = num(inp.desludge), td = num(inp.detention);
    c.section("Capacity (IS 2470-1)");
    c.let("Number of users", "N", N, "", "", String(inp.use));
    c.let("Sewage reaching the tank", "q", q, "l/user/day", "IS 2470-1 / IS 1172 practice", num(inp.flow) > 0 ? "given" : "default for " + String(inp.use) + " (verify)");
    var Qd = c.calc("Daily sewage flow", "Q", "N*q/1000", "m³/day", "", { N: N, q: q });
    var V1 = c.calc("Settling volume (detention)", "V1", "Q*td/24", "m³", "IS 2470-1 cl 5 (detention ≈ 24 h)", { Q: Qd, td: td });
    c.let("Sludge + scum accumulation", "r", r, "m³/user/year", "IS 2470-1 practice", num(inp.sludge_rate) > 0 ? "given" : "default (verify)");
    var V2 = c.calc("Sludge storage for the desludging interval", "V2", "r*N*n", "m³", "IS 2470-1", { r: r, N: N, n: n });
    var V = c.calc("Liquid capacity required", "V", "max(V1 + V2, 1.0)", "m³", "IS 2470-1", "≥ 1 m³ minimum (practice)", { V1: V1, V2: V2 });
    var L, B, D;
    if (mode === "check") { L = num(inp.L_chk); B = num(inp.B_chk); D = num(inp.D_chk); }
    else {
      D = Math.max(1.0, num(inp.liq_depth));
      var A = (mode === "thumb" ? Math.max((ST_THUMB[u] + ST_SLUDGE[u] * (n - 1)) * N, 1.0) : V) / D, ratio = Math.min(Math.max(num(inp.ratio), 2), 4);
      B = Math.max(0.75, ceil_to(Math.sqrt(A / ratio), 0.05));
      L = Math.max(ceil_to(A / B, 0.05), ceil_to(2 * B, 0.05));
      if (mode === "thumb") c.info("Thumb-rule sizing", "≈ 140 l liquid per user (colonies / hostels), 70 l (offices), 25 l per meal (canteens) for yearly desludging, + sludge per extra year; L ≈ 3 B, liquid depth 1.2 m", "IS 2470-1 Annex A trend");
    }
    c.let("Internal size (length × width × liquid depth)", "L × B × D", F(L, ".2f") + " × " + F(B, ".2f") + " × " + F(D, ".2f"), "m");
    var Vp = c.calc("Liquid capacity provided", "Vp", "L*B*D", "m³", "", { L: L, B: B, D: D });
    c.check("Capacity provided ≥ required", Vp, V, { unit: "m³", clause: "IS 2470-1", mode: ">=" });
    c.ok("Liquid depth ≥ 1.0 m", D >= 1.0 - 1e-9, { detail: F(D, ".2f") + " m", clause: "IS 2470-1 cl 5.3" });
    c.ok("Liquid depth ≤ 1.8 m (deeper tanks: sludge withdrawal / structure)", D <= 1.8 + 1e-9, { detail: F(D, ".2f") + " m", clause: "IS 2470-1 practice", warn_only: true });
    c.ok("Width ≥ 750 mm", B >= 0.75 - 1e-9, { detail: F(B, ".2f") + " m", clause: "IS 2470-1 cl 5.3" });
    c.ok("Length : width between 2 : 1 and 4 : 1", L / B >= 2 - 1e-9 && L / B <= 4 + 1e-9, { detail: "L/B = " + F(L / B, ".2f"), clause: "IS 2470-1 cl 5.3", warn_only: true });
    var two = V > 2.0 + 1e-9, L1 = two ? ceil_to(2 * L / 3, 0.05) : L, L2 = two ? R(L - L1, 3) : 0;
    if (two) c.let("Two compartments: first 2/3, second 1/3 of length", "L1 / L2", F(L1, ".2f") + " / " + F(L2, ".2f"), "m", "IS 2470-1 cl 5.4 (capacity > 2000 l)");
    else c.info("Compartments", "Single compartment (capacity ≤ 2000 l)", "IS 2470-1 cl 5.4");
    return { N: N, q: q, r: r, Q: Qd, V: V, Vp: Vp, L: L, B: B, D: D, two: two, L1: L1, L2: L2 };
  }
  M.stCapacity = stCapacity;

  function stDisposal(c, inp, cap, outInvert) {
    var kind = String(inp.disposal), out = { kind: kind };
    if (/^None/.test(kind)) { c.info("Effluent disposal", "Effluent led to a drain / sewer – obtain consent (CPCB / SPCB norms for septic tank effluent)", "IS 2470-2"); return out; }
    c.section(/^Soak/.test(kind) ? "Soak pit (IS 2470-2)" : "Dispersion trench (IS 2470-2)");
    var t = num(inp.perc), gw = num(inp.gwt);
    c.let("Percolation rate (time for 25 mm fall)", "t", t, "min", "IS 2470-2 Annex A test");
    var ok = c.ok("Soil suitable for sub-surface disposal (t ≤ 60 min)", t <= 60, { detail: G(t) + " min", clause: "IS 2470-2 Table 1 – else upflow filter / sealed tank / sewer" });
    if (t < 1) c.warn("Very fast percolation", "Risk of polluting groundwater / wells – provide a 0.6 m sand envelope", "IS 2470-2");
    var rap = c.calc("Allowable effluent application rate", "ra", "rv", "l/m²/day", "IS 2470-2 Table 1 (interpolated – verify)", { rv: R(M.perc_rate(Math.min(Math.max(t, 1), 60)), 1) });
    var Areq = c.calc("Absorption area required", "Ar", "Q*1000/ra", "m²", "IS 2470-2", { Q: cap.Q, ra: rap });
    out.Areq = Areq; out.ok = ok;
    var top = outInvert + 0.10;                      // pit / trench inlet invert below GL (100 mm fall in the connecting pipe)
    if (/^Soak/.test(kind)) {
      var best = null, DIAS = [1.0, 1.2, 1.5, 1.8, 2.0, 2.5];
      for (var n = 1; n <= 4 && !best; n++) for (var i = 0; i < DIAS.length && !best; i++) {
        var h = Math.max(1.0, Areq / (n * Math.PI * DIAS[i]));
        if (h <= 3.0 + 1e-9) best = { n: n, Dp: DIAS[i], h: ceil_to(h, 0.05) };
      }
      if (!best) best = { n: 4, Dp: 2.5, h: ceil_to(Areq / (4 * Math.PI * 2.5), 0.05) };
      c.let("Soak pits adopted (internal dia × effective depth below inlet)", "n × Dp × h", best.n + " × " + F(best.Dp, ".2f") + " × " + F(best.h, ".2f"), "m",
        "IS 2470-2 cl 3 (side walls below the inlet count; dia ≥ 1.0 m, depth ≥ 1.0 m)");
      var Ap = c.calc("Absorption area provided (side walls)", "Ap", "n*pi*Dp*h", "m²", "IS 2470-2", { n: best.n, Dp: best.Dp, h: best.h });
      c.check("Absorption area provided ≥ required", Ap, Areq, { unit: "m²", clause: "IS 2470-2", mode: ">=" });
      var bot = c.calc("Depth of soak-pit bottom below GL", "zb", "zi + h", "m", "", { zi: R(top, 3), h: best.h });
      c.ok("Bottom of soak pit ≥ 1.8 m above max. groundwater table", gw - bot >= 1.8 - 1e-9, { detail: "GWT " + F(gw, ".2f") + " m, bottom " + F(bot, ".2f") + " m below GL",
        clause: "IS 2470-2 practice (verify) – else dispersion trench / mound", warn_only: true });
      Object.assign(out, best, { top: top, bot: bot, Ap: Ap });
    } else {
      var w = num(inp.trench_w), dtr = num(inp.trench_d);
      var Lt = c.calc("Trench length required (bottom area counts)", "Lt", "Ar/w", "m", "IS 2470-2 cl 4", { Ar: Areq, w: w });
      var nl = Math.max(1, Math.ceil(Lt / 30 - 1e-9)), Ll = ceil_to(Math.max(Lt / nl, 3), 0.5);
      c.let("Trench lines × length", "n × l", nl + " × " + F(Ll, ".1f"), "m", "IS 2470-2: each line ≤ 30 m; lines ≥ 2 m apart (clear)");
      c.ok("Trench width 0.3–1.0 m, depth 0.5–1.0 m", w >= 0.3 && w <= 1.0 && dtr >= 0.5 && dtr <= 1.0, { detail: F(w, ".2f") + " × " + F(dtr, ".2f") + " m", clause: "IS 2470-2 cl 4", warn_only: true });
      c.ok("Trench bottom ≥ 1.8 m above max. groundwater table", gw - (top + dtr) >= 1.8 - 1e-9, { detail: "GWT " + F(gw, ".2f") + " m", clause: "IS 2470-2 practice (verify)", warn_only: true });
      Object.assign(out, { n: nl, len: Ll, w: w, dtr: dtr, top: top });
    }
    return out;
  }
  M.stDisposal = stDisposal;

  function stStructure(c, inp, mode, cap, lv, cover, t) {
    /* t = {tw (mm), tb (mm), ts (mm), proj (m)}; returns design of walls (RCC), base, cover slab and stability */
    var fck = num(inp.fck), fy = num(inp.fy), gam = num(inp.gamma), phi = num(inp.phi), q = num(inp.surcharge), gw = num(inp.gwt);
    var rcc = String(inp.walls).indexOf("RCC") === 0, dt = DT(), out = { rcc: rcc };
    var tw = t.tw / 1000, tb = t.tb / 1000, ts = t.ts / 1000, L = cap.L, B = cap.B;
    var Hs = lv.zfloor + tb;                                   // retained height: GL to underside of base
    var Hw = lv.soffit - lv.floor;                             // clear wall height (base top → cover soffit)
    var hw = Math.max(0, Hs - gw);                             // groundwater head above the underside of base
    var K0 = 1 - Math.sin(phi * Math.PI / 180), climit = 0.2;
    c.section("Earth & water pressure on walls");
    c.let("Wall height retained (GL to underside of base)", "Hs", R(Hs, 3), "m");
    c.calc("At-rest earth pressure coefficient", "K0", "1 - sin(radians(phi))", "", "Jaky; walls restrained by base & cover slab", { phi: phi });
    c.let("Groundwater head above underside of base", "hw", R(hw, 3), "m", "", "GWT " + F(gw, ".2f") + " m below GL (monsoon / mine water – use the highest)");
    var Mo = c.calc("Empty tank: moment at wall base (service, cantilever)", "Mo", "K0*q*H**2/2 + K0*g*H**3/6 - K0*10*hw**3/6 + 10*hw**3/6", "kN·m/m",
      "earth at rest + surcharge + groundwater (desludging / before filling)", { K0: R(K0, 4), q: q, H: R(Hs, 3), g: gam, hw: R(hw, 3) });
    var Vo = K0 * q * Hs + K0 * gam * Hs * Hs / 2 - K0 * 10 * hw * hw / 2 + 10 * hw * hw / 2;
    var Mi = c.calc("Full tank, no backfill: moment at wall base (service)", "Mi", "10*h**3/6", "kN·m/m", "IS 3370 – water test before backfilling", { h: R(cap.D + 0.05, 3) });
    var Vi = 10 * Math.pow(cap.D + 0.05, 2) / 2;
    out.Mo = Mo; out.Mi = Mi; out.Hs = Hs; out.Hw = Hw; out.hw = hw;
    if (rcc) {
      c.section("RCC walls (IS 3370-2, crack width ≤ 0.2 mm)");
      c.let("Wall thickness", "tw", t.tw, "mm");
      var wm = dt ? dt.water_min_steel(t.tw) : { As: RC().min_steel_water(t.tw) / 100 * 1000 * t.tw / 2, text: "", clause: "IS 3370-2 cl 8.1" };
      var am = { As: wm.As, label: "Minimum steel per face (liquid retaining)", clause: wm.clause, text: wm.text };
      var gv = mode === "check" ? [num(inp.wall_dia), num(inp.wall_s)] : null;
      out.wo = designStrip(c, 1.5 * Mo, t.tw, cover, fck, fy, "wall, outer face", { Ms: Mo, climit: climit, given: gv, rule: dt ? { member: "water", role: "main" } : null, Amin: am, Vu: 1.5 * Vo, dias: [10, 12, 16, 20] });
      out.wi = designStrip(c, 1.5 * Mi, t.tw, cover, fck, fy, "wall, inner face", { Ms: Mi, climit: climit, given: gv, rule: dt ? { member: "water", role: "main" } : null, Amin: am, Vu: 1.5 * Vi, dias: [10, 12, 16, 20] });
      var wg = Vo >= Vi ? out.wo : out.wi;
      RC().shear(c, 1.5 * Math.max(Vo, Vi), 1000, wg.d, 100 * wg.Ast_prov / (1000 * wg.d), fck, fy, "slab", { D: t.tw, tag: "(wall base, " + (Vo >= Vi ? "empty tank" : "water test") + ")" });
      var hz = c.calc("Horizontal bars per face (min. steel)", "As,h", "As", "mm²/m", wm.clause, { As: R(wm.As, 1) });
      out.wh = stripBars(c, hz, "water", "dist", out.wo.d - 12, t.tw, mode === "check" ? [num(inp.wall_dia), num(inp.wall_s)] : null, "wall horizontal, each face", { dias: [10, 12, 16] });
    } else {
      c.section("Brick masonry walls (IS 2470-1 practice / IS 1905)");
      var tm = t.tw;
      c.let("Wall thickness", "t", tm, "mm", "", String(inp.walls) + " in CM 1:4, inside 20 mm CM 1:4 plaster with water-proofing compound + neat cement finish");
      var need = Hs <= 1.5 ? 230 : Hs <= 2.5 ? 345 : 999;
      c.ok("Masonry thickness suits the depth (≤ 1.5 m: 230; ≤ 2.5 m: 345; deeper → RCC)", tm >= need, { detail: "Hs = " + F(Hs, ".2f") + " m, wall " + G(tm) + " mm",
        clause: "IS 2470-1 practice / CPWD type designs", warn_only: true });
      var pb = K0 * gam * Hs + K0 * q - K0 * 10 * hw + 10 * hw;
      var Mm = c.calc("Empty tank: wall strip spanning base → cover slab", "Mm", "pb*H**2/(9*sqrt(3)) + K0*q*H**2/8", "kN·m/m", "simply supported strip, triangular + uniform", { pb: R(pb - K0 * q, 3), H: R(Hs, 3), K0: R(K0, 4), q: q });
      var sa = (20 * tm / 1000 * Hs / 2 + 25 * ts * B / 2) / (tm / 1000) / 1000;
      var ft = c.calc("Flexural tension in masonry", "ft", "6*Mm/(t/1000)**2/1000 - sa", "N/mm²", "IS 1905", "net of axial compression from wall above mid-height + cover slab", { Mm: Mm, t: tm, sa: R(sa, 4) });
      c.info("Masonry flexural tension (informative)", F(ft, ".3f") + " N/mm² vs 0.07 N/mm² permissible (IS 1905 cl 5.4.2) for a simply spanning strip – masonry tanks work by arching between the cross walls and the liquid inside balancing the earth; " +
        (ft > 0.07 ? "keep the tank full except while desludging, backfill in layers after the water test; RCC walls where this matters" : "within the permissible value"), "IS 1905 cl 5.4.2");
      if (hw > 0) c.warn("Groundwater above the base", "Masonry septic tanks below the water table leak in / float – RCC walls recommended", "IS 2470-1");
      out.wo = null;
    }
    // base slab
    c.section("Base slab");
    var Lo = L + 2 * tw + (cap.two ? tw : 0), Bo = B + 2 * tw, pr = t.proj, Lb = Lo + 2 * pr, Bb = Bo + 2 * pr;
    var Ww = 2 * (Lo + Bo - 2 * tw) * tw * Hw * (rcc ? 25 : 20) + (cap.two ? B * tw * Hw * (rcc ? 25 : 20) : 0);
    var Wb = 25 * Lb * Bb * tb, Wc = 25 * Lo * Bo * ts, Wsoil = gam * (Lb * Bb - Lo * Bo) * Math.max(Hs - tb, 0);
    c.let("Base slab", "Lb × Bb × tb", F(Lb, ".2f") + " × " + F(Bb, ".2f") + " × " + F(tb, ".3f"), "m", "", "projection " + F(pr, ".2f") + " m beyond walls");
    var Wt = c.calc("Self-weight: walls + base + cover + soil on projections", "W", "Ww + Wb + Wc + Ws", "kN", "", { Ww: R(Ww, 2), Wb: R(Wb, 2), Wc: R(Wc, 2), Ws: R(Wsoil, 2) });
    out.W = Wt; out.Lb = Lb; out.Bb = Bb; out.Lo = Lo; out.Bo = Bo;
    if (hw > 0) {
      var U = c.calc("Uplift on empty tank", "U", "10*hw*Lb*Bb", "kN", "IS 3370-1 / practice", { hw: R(hw, 3), Lb: R(Lb, 3), Bb: R(Bb, 3) });
      out.U = U;
      c.check("Flotation: 1.2 × uplift ≤ self-weight (empty tank)", 1.2 * U, Wt, { unit: "kN", clause: "IS 3370-1 practice (FoS ≥ 1.2)", note: "increase base projection / thickness" });
    } else c.info("Uplift", "Groundwater below the base – no flotation check needed (confirm the monsoon / mine-water level)", "");
    var Wwater = 10 * L * B * cap.D * (cap.two ? 1 : 1);
    var pbase = c.calc("Base pressure, tank full", "pb", "(W + Ww)/(Lb*Bb)", "kN/m²", "", { W: R(Wt, 2), Ww: R(Wwater, 2), Lb: R(Lb, 3), Bb: R(Bb, 3) });
    c.check("Base pressure ≤ SBC", pbase, num(inp.sbc), { unit: "kN/m²", clause: "IS 1904" });
    var Bc = B + tw, wr = (Ww + Wc) / (Lb * Bb), wu = hw > 0 ? Math.max(10 * hw - 25 * tb, 0) : 0;
    var Mt = c.calc("Base moment, top face (soil reaction from walls & cover, uplift, wall continuity)", "Mt", "max((wr + wu)*Bc**2/8, Mi)", "kN·m/m", "", { wr: R(wr, 3), wu: R(wu, 3), Bc: R(Bc, 3), Mi: rcc ? R(Mi, 3) : 0 });
    var gb = mode === "check" ? [num(inp.base_dia), num(inp.base_s)] : null;
    out.bt = designStrip(c, 1.5 * Mt, t.tb, cover, fck, fy, "base, top face", { Ms: Mt, climit: climit, given: gb, rule: dt ? { member: "water", role: "main" } : null,
      Amin: rcc ? { As: (dt ? dt.water_min_steel(t.tb).As : 0.0012 * 1000 * t.tb / 2), label: "Minimum steel per face", clause: "IS 3370-2 cl 8.1" } : { As: 0.0012 * 1000 * t.tb / 2, label: "Minimum steel per face (0.12 % / 2)", clause: "IS 456 cl 26.5.2.1" },
      Vu: 1.5 * (wr + wu) * Bc / 2, dias: [10, 12, 16, 20] });
    var Mb = rcc ? Mo : 0;
    out.bb = designStrip(c, 1.5 * Mb, t.tb, cover + 25, fck, fy, "base, bottom face", { Ms: Mb, climit: climit, given: gb, rule: dt ? { member: "water", role: "main" } : null,
      Amin: { As: rcc && dt ? dt.water_min_steel(t.tb).As : 0.0012 * 1000 * t.tb / 2, label: "Minimum steel per face", clause: rcc ? "IS 3370-2 cl 8.1" : "IS 456 cl 26.5.2.1" }, dias: [10, 12, 16, 20] });
    // cover slab
    c.section("Cover slab (one-way over the width)");
    var le = c.calc("Effective span of cover slab", "le", "B + tw", "m", "IS 456 cl 22.2", { B: B, tw: tw });
    var wcs = c.calc("Load on cover slab", "w", "25*ts + 0.5 + qc", "kN/m²", "IS 875-1/2", "self + 0.5 finishes + live " + G(num(inp.cover_ll)) + " kN/m² (no vehicles)", { ts: ts, qc: num(inp.cover_ll) });
    var gc = mode === "check" ? [num(inp.cs_dia), num(inp.cs_s)] : null;
    out.cs = designStrip(c, 1.5 * wcs * le * le / 8, t.ts, Math.max(cover - 10, 30), fck, fy, "cover slab, bottom", { Ms: wcs * le * le / 8, climit: 0.3, given: gc,
      rule: dt ? { member: "drain", role: "main" } : null, Vu: 1.5 * wcs * le / 2, dias: [8, 10, 12, 16] });
    RC().deflection(c, le * 1000, out.cs.d, "simply supported", fy, out.cs.req, out.cs.Ast_prov, 1000);
    out.csd = stripBars(c, 0.0012 * 1000 * t.ts, "drain", "dist", out.cs.d - out.cs.dia, t.ts, null, "cover slab distribution", { dias: [8, 10], rule: { main_dia: out.cs.dia } });
    c.info("Openings in cover slab", (cap.two ? 2 : 1) + " manhole(s) 600 × 450 with precast RCC covers; trim each opening with 2 – 12Ø bars on every side, Ld beyond the corners", "IS 456 cl 26.5.2 / SP 34");
    return out;
  }
  M.stStructure = stStructure;

  function run_septic(inp, mode) {
    var c = new C.Calc("Septic tank & soak pit (IS 2470)");
    var fck = num(inp.fck), fy = num(inp.fy), rcc = String(inp.walls).indexOf("RCC") === 0;
    var cover = coverAdopt(c, inp, mode, "slab");
    if (DT()) DT().site_checks(c, "water", fck, cover);
    var cap = stCapacity(c, inp, mode);
    // levels (m, GL = 0, + up)
    c.section("Levels, baffles & vent");
    var hin = num(inp.inlet_depth), fb = num(inp.freeboard), BBk = BB();
    var t = mode === "check" ? { tw: rcc ? num(inp.tw_chk) : (String(inp.walls).indexOf("345") >= 0 ? 345 : 230), tb: num(inp.tb_chk), ts: num(inp.ts_chk), proj: num(inp.proj_chk) }
      : { tw: rcc ? Math.max(150, ceil_to((cap.D + hin + 0.2) * 1000 / 10 + 50, 25)) : (String(inp.walls).indexOf("345") >= 0 ? 345 : 230), tb: rcc ? 0 : 150, ts: 100, proj: 0.15 };
    if (mode !== "check" && rcc) t.tb = Math.max(150, t.tw + 25);
    var lv = {};
    lv.inlet = -hin; lv.twl = -(hin + 0.05); lv.floor = lv.twl - cap.D; lv.zfloor = -lv.floor;
    lv.top = Math.max(0.15, lv.twl + fb + t.ts / 1000); lv.soffit = lv.top - t.ts / 1000;
    c.let("Inlet invert below GL", "", F(hin, ".2f"), "m", "", "outlet invert (= top water level) 50 mm lower");
    c.calc("Top water level (outlet invert)", "TWL", "-(hin + 0.05)", "m", "IS 2470-1 cl 5.6 (outlet 50 mm below inlet)", { hin: hin });
    c.calc("Floor level (top of base slab)", "FL", "TWL - D", "m", "", { TWL: R(lv.twl, 3), D: cap.D });
    var air = c.calc("Free board above TWL", "fb", "soffit - TWL", "m", "IS 2470-1 cl 5.3 (≥ 300 mm)", { soffit: R(lv.soffit, 3), TWL: R(lv.twl, 3) });
    c.ok("Free board ≥ " + G(fb * 1000) + " mm", air >= fb - 1e-9, { detail: F(air * 1000, ".0f") + " mm", clause: "IS 2470-1" });
    if (lv.top > 0.15 + 1e-9) c.warn("Cover above ground", "Inlet is shallow – cover slab top at +" + F(lv.top, ".2f") + " m above GL", "");
    var dIn = 0.30, dOut = cap.D / 3;
    c.let("Inlet tee / baffle: dips below TWL, top above TWL", "", F(dIn * 1000, ".0f") + " mm / 150 mm", "", "IS 2470-1 cl 5.6 practice (verify)");
    c.calc("Outlet tee / baffle dip below TWL (≈ D/3)", "do", "D/3", "m", "IS 2470-1 cl 5.6 practice (verify)", { D: cap.D });
    if (cap.two) c.let("Partition openings", "", "150 × 150 mm slots @ 300 c/c between " + F(0.35 * cap.D, ".2f") + " and " + F(0.55 * cap.D, ".2f") + " m below TWL", "", "IS 2470-1 cl 5.4 (below scum, above sludge)");
    var vent = cap.N <= 50 ? 50 : cap.N <= 150 ? 75 : 100;
    c.let("Vent pipe", "", G(vent) + " mm dia, top ≥ 2.0 m above GL with mosquito-proof cowl", "", "IS 2470-1 cl 5.8");
    lv.vent = vent;
    // structure – design: thicken walls / base / cover / projection until it passes
    var st;
    if (mode === "thumb") {
      t.ts = Math.max(100, ceil_to((cap.B + t.tw / 1000) * 1000 / 25, 10));
      c.info("Thumb-rule structure", "RCC wall ≈ H/10 + 50 mm (≥ 150), base = wall + 25 mm, cover slab ≈ span/25 (≥ 100 mm); then code check", "Practice");
    }
    if (mode === "design") {
      for (var it = 0; it < 60; it++) {
        var sc = new C.Calc("s");
        lv.top = Math.max(0.15, lv.twl + fb + t.ts / 1000); lv.soffit = lv.top - t.ts / 1000;
        var o = stStructure(sc, inp, mode, cap, lv, cover, t);
        var f = sc.failures.map(function (s) { return s.section + " | " + s.label; }), ch = false;
        if (f.some(function (x) { return /RCC walls/.test(x); }) && rcc) { t.tw += 25; ch = true; }
        if (f.some(function (x) { return /^Base slab \| (?!Flotation|Base pressure)/.test(x); })) { t.tb += 25; ch = true; }
        if (f.some(function (x) { return /Flotation/.test(x); })) { if (t.proj < 0.6) t.proj = R(t.proj + 0.05, 2); else t.tb += 25; ch = true; }
        if (f.some(function (x) { return /^Cover slab/.test(x); })) { t.ts += 10; ch = true; }
        if (rcc && t.tb < t.tw + 25) t.tb = t.tw + 25;
        if (!ch) break;
      }
    }
    lv.top = Math.max(0.15, lv.twl + fb + t.ts / 1000); lv.soffit = lv.top - t.ts / 1000;
    st = stStructure(c, inp, mode, cap, lv, cover, t);
    var disp = stDisposal(c, inp, cap, -lv.twl);
    // thumbs & missing
    c.thumb("Liquid capacity", (ST_THUMB[stUse(inp.use)] + ST_SLUDGE[stUse(inp.use)] * (num(inp.desludge) - 1)) * cap.N, cap.Vp, "m³", "≈ 140 l / user (colony), 70 l (office), 25 l / meal (canteen) for yearly desludging + sludge for each extra year", "IS 2470-1 Annex A trend");
    if (rcc) c.thumb("RCC wall thickness", Math.max(150, (st.Hs * 1000) / 10 + 50), t.tw, "mm", "H/10 + 50 (≥ 150)", "Practice");
    c.miss("Distance: tank ≥ 2 m from buildings; soak pit / trench ≥ 15–18 m from any well or water source and downhill of it", "IS 2470-1 / IS 2470-2 / CPHEEO", "Important");
    c.miss("Percolation test at the actual site (IS 2470-2 Annex A) and the highest groundwater level", "IS 2470-2", "Important");
    if (/^Canteen/.test(String(inp.use))) c.miss("Canteen / kitchen waste: grease & oil trap before the septic tank", "IS 2470-1 / CPHEEO", "Important");
    c.miss("Desludging access for the suction vehicle (≤ 30 m hose) and safe-entry rules (no manual entry, gas testing)", "Prohibition of Employment as Manual Scavengers Act 2013", "Important");
    if (isMine()) c.miss("Mine area: check sulphate / acidic mine water for concrete & mortar (SRC cement, bitumen coat outside)", "IS 456 Table 4", "Important");
    // ---------------------------------------------------------------- BBS
    var tw = t.tw / 1000, tb = t.tb / 1000, ts = t.ts / 1000, bbs = [], cv = cover, B_ = BBk, nos = Math.max(1, Math.trunc(num(inp.nos)));
    var Lo = st.Lo, Bo = st.Bo, Lb = st.Lb, Bb = st.Bb, Pc = 2 * (cap.L + tw + cap.B + tw) + (cap.two ? cap.B : 0);
    if (rcc) {
      var Hv = (lv.top - lv.floor + tb) * 1000 - 2 * cv;
      var legV = Math.max(B_.leg(st.wo.dia, B_.cfg.wall_leg_min), 0);
      bbs.push(B_.row("Walls", "W1", st.wo.dia, "L (90° leg into base)", B_.count(Pc * 1000, st.wo.spacing, 50) * nos, B_.lbar(st.wo.dia, Hv, legV), "vertical, outer face @ " + G(st.wo.spacing)));
      bbs.push(B_.row("Walls", "W2", st.wi.dia, "L (90° leg into base)", B_.count(Pc * 1000, st.wi.spacing, 50) * nos, B_.lbar(st.wi.dia, Hv, legV), "vertical, inner face @ " + G(st.wi.spacing)));
      var ring = 2 * (cap.L + cap.B + 2 * tw) * 1000 + B_.lap(st.wh.dia, fck, fy);
      bbs.push(B_.row("Walls", "W3", st.wh.dia, "horizontal ring, lapped", 2 * B_.count(st.Hw * 1000, st.wh.spacing, 50) * nos, B_.split(st.wh.dia, ring, fck, fy), "horizontal, both faces @ " + G(st.wh.spacing)));
      if (cap.two) bbs.push(B_.row("Partition", "W4", st.wh.dia, "U (legs into side walls)", 2 * B_.count(st.Hw * 1000, st.wh.spacing, 50) * nos, B_.ubar(st.wh.dia, (cap.B + 2 * tw) * 1000 - 2 * cv, 300), "horizontal both faces"));
    }
    bbs.push(B_.row("Base slab", "B1", st.bb.dia, "straight", B_.count(Bb * 1000, st.bb.spacing, cv) * nos, B_.split(st.bb.dia, Lb * 1000 - 2 * cv, fck, fy), "bottom, along length @ " + G(st.bb.spacing)));
    bbs.push(B_.row("Base slab", "B2", st.bb.dia, "straight", B_.count(Lb * 1000, st.bb.spacing, cv) * nos, B_.straight(st.bb.dia, Bb * 1000 - 2 * cv), "bottom, across @ " + G(st.bb.spacing)));
    bbs.push(B_.row("Base slab", "B3", st.bt.dia, "straight", B_.count(Bb * 1000, st.bt.spacing, cv) * nos, B_.split(st.bt.dia, Lb * 1000 - 2 * cv, fck, fy), "top, along length @ " + G(st.bt.spacing)));
    bbs.push(B_.row("Base slab", "B4", st.bt.dia, "straight", B_.count(Lb * 1000, st.bt.spacing, cv) * nos, B_.straight(st.bt.dia, Bb * 1000 - 2 * cv), "top, across @ " + G(st.bt.spacing)));
    var csc = Math.max(cover - 10, 30);
    bbs.push(B_.row("Cover slab", "C1", st.cs.dia, "straight", B_.count(Lo * 1000, st.cs.spacing, csc) * nos, B_.straight(st.cs.dia, Bo * 1000 - 2 * csc), "main, across width @ " + G(st.cs.spacing)));
    bbs.push(B_.row("Cover slab", "C2", st.csd.dia, "straight", B_.count(Bo * 1000, st.csd.spacing, csc) * nos, B_.split(st.csd.dia, Lo * 1000 - 2 * csc, fck, fy), "distribution along length @ " + G(st.csd.spacing)));
    var nMH = cap.two ? 2 : 1, trimL = Math.max(600, 450) + 2 * B_.Ld(12, fck, fy);
    bbs.push(B_.row("Cover slab", "C3", 12, "straight trimmer", 8 * nMH * nos, B_.straight(12, Math.min(trimL, Bo * 1000 - 2 * csc)), "2 bars each side of each 600 × 450 opening"));
    if (disp.n && /^Soak/.test(disp.kind)) {
      var Dc = disp.Dp + 2 * 0.23 + 0.1;
      bbs.push(B_.row("Soak pit cover", "P1", 10, "straight (both ways)", 2 * B_.count(Dc * 1000, 150, 30) * disp.n * nos, B_.straight(10, Dc * 1000 - 60), "10Ø @ 150 both ways, 100 mm slab"));
    }
    // ---------------------------------------------------------------- quantities
    var work = 0.3, zexc = lv.zfloor + tb + 0.1, Hwall = lv.top - lv.floor, qty = [];
    var excRows = [row("Septic tank pit", nos, Lb + 2 * work, Bb + 2 * work, zexc)];
    if (disp.n && /^Soak/.test(disp.kind)) excRows.push(row("Soak pits (π/4 × (D + 0.46 + 0.6)²)", disp.n * nos, Math.PI / 4 * Math.pow(disp.Dp + 0.46 + 0.6, 2), null, disp.bot));
    if (disp.n && /^Disp/.test(disp.kind)) excRows.push(row("Dispersion trenches", disp.n * nos, disp.len, disp.w, disp.top + disp.dtr));
    qty.push(Q("Earth work in excavation for septic tank, soak pit & trenches, all kinds of soil", "cum", excRows, [CPWD(), "2.8.1"]));
    qty.push(Q("PCC 1:4:8 below base slab of septic tank", "cum", [row("Levelling course", nos, Lb + 0.2, Bb + 0.2, 0.1)], [CPWD(), "4.1.8"]));
    var rccRows = [row("Base slab", nos, Lb, Bb, tb)];
    if (rcc) { rccRows.push(row("Walls (centre-line perimeter × t × h)", nos, 2 * (cap.L + tw + cap.B + tw), tw, Hwall)); if (cap.two) rccRows.push(row("Partition wall", nos, cap.B, tw, Hwall)); }
    qty.push(Q("RCC M" + G(fck) + " in septic tank & soak pits – base slab" + (rcc ? ", walls & partition" : "") + " (excl. steel & shuttering)", "cum", rccRows, null, CM().rcc_rate(fck)));
    var covRows = [row("Tank cover slab", nos, Lo, Bo, ts), row("Deduct manholes 600 × 450", nMH * nos, 0.6, 0.45, ts, true)];
    if (disp.n && /^Soak/.test(disp.kind)) covRows.push(row("Soak pit covers (π/4 × D²)", disp.n * nos, Math.PI / 4 * Math.pow(disp.Dp + 0.56, 2), null, 0.1));
    qty.push(Q("RCC M" + G(fck) + " in cover slabs of septic tank & soak pits (excl. steel & shuttering)", "cum", covRows, null, CM().rcc_rate(fck)));
    var shRows = [row("Base slab edges", nos, 2 * (Lb + Bb), null, tb)];
    qty.push(Q("Centering & shuttering for foundations – base slab edges", "sqm", shRows, null, CM().RATE.shutter_found));
    if (rcc) qty.push(Q("Centering & shuttering for walls – septic tank (both faces)", "sqm",
      [row("Outer faces", nos, 2 * (Lo + Bo), null, Hwall - ts), row("Inner faces", nos, 2 * (cap.L + cap.B), null, Hwall - ts)].concat(cap.two ? [row("Partition (2 faces)", 2 * nos, cap.B, null, Hwall - ts)] : []), null, CM().RATE.shutter_wall));
    qty.push(Q("Centering & shuttering for suspended slab – cover slabs (soffit & edges)", "sqm", [row("Soffit", nos, cap.L + (cap.two ? tw : 0), cap.B), row("Edges", nos, 2 * (Lo + Bo), null, ts)], null, CM().RATE.shutter_slab));
    if (!rcc) {
      var tm = t.tw / 1000, hm = Hwall - ts;
      qty.push(Q("Brick work with common burnt clay FPS bricks class 7.5 in foundation & plinth in cement mortar 1:4 – septic tank walls & partition", "cum",
        [row("Walls (centre-line perimeter × t × h)", nos, 2 * (cap.L + tm + cap.B + tm), tm, hm)].concat(cap.two ? [row("Partition wall 230", nos, cap.B, 0.23, hm)] : []), [CPWD(), "6.1.1"]));
      var inA = 2 * (cap.L + cap.B) * hm + (cap.two ? 2 * cap.B * hm : 0) + cap.L * cap.B;
      qty.push(Q("20 mm cement plaster 1:4 with integral water-proofing compound – inside of septic tank walls & floor", "sqm",
        [row("Inside walls", nos, 2 * (cap.L + cap.B), null, hm), row("Floor", nos, cap.L, cap.B)].concat(cap.two ? [row("Partition (2 faces)", 2 * nos, cap.B, null, hm)] : []), [CPWD(), "13.6.1"]));
      qty.push(Q("Neat cement punning on inside plaster", "sqm", [row("Inside surfaces", nos, inA)], [CPWD(), "13.18"]));
      qty.push(Q("Integral water-proofing compound in plaster (≈ 2 % of cement)", "kg", [row("0.15 kg per m² of 20 mm plaster", nos, inA, 0.15)], null, 60, "Non-SOR – IS 2645 compound"));
    } else qty.push(Q("Neat cement punning on inside of RCC septic tank", "sqm", [row("Inside walls", nos, 2 * (cap.L + cap.B), null, Hwall - ts), row("Floor", nos, cap.L, cap.B)], [CPWD(), "13.18"]));
    qty.push(steelQty(bbs, "Septic tank"));
    qty.push(Q("Providing & fixing precast RCC manhole cover with frame (600 × 450, light duty)", "each", [row("Septic tank", nMH * nos)].concat(disp.n && /^Soak/.test(disp.kind) ? [row("Soak pits", disp.n * nos)] : []), [CPWD(), "19.19.1.1"]));
    qty.push(Q("Inlet & outlet tees with dip pipes (PVC / SW 100–150 mm), fixed in position", "each", [row("Tees", 2 * nos)].concat(cap.two ? [row("Partition tee / slots", nos)] : []), null, 1200, "Non-SOR"));
    qty.push(Q("Vent pipe " + G(vent) + " mm PVC with mosquito-proof cowl, 2.0 m above GL, with clamps", "metre", [row("Vent pipe", nos, 2.0 + lv.zfloor * 0 + (lv.top + 0.0) + 0.5)], null, 450, "Non-SOR"));
    if (disp.n) {
      if (/^Soak/.test(disp.kind)) {
        var ri = disp.Dp / 2, ro = ri + 0.23;
        qty.push(Q("Brick work with common burnt clay FPS bricks in foundation & plinth in cement mortar 1:6 – soak pit honeycomb lining (open joints)", "cum",
          [row("Lining ring π(ro² − ri²) × depth", disp.n * nos, Math.PI * (ro * ro - ri * ri), null, disp.bot)], [CPWD(), "6.1.2"]));
        qty.push(Q("Supplying, filling & levelling stone boulders / brick bats 75–150 mm in soak pit", "cum", [row("Pit filling (π/4 × D² × h)", disp.n * nos, Math.PI / 4 * disp.Dp * disp.Dp, null, disp.h)], [CPWD(), "23.5"]));
        qty.push(Q("PVC / SW pipe 100 mm from septic tank to soak pit, laid & jointed", "metre", [row("Connecting pipe", disp.n * nos, 3.0)], null, 650, "Non-SOR"));
      } else {
        qty.push(Q("Open-jointed PVC / SW pipe 100 mm in dispersion trench on graded aggregate", "metre", [row("Trench pipes", disp.n * nos, disp.len)], null, 650, "Non-SOR"));
        qty.push(Q("Graded stone aggregate 20–40 mm filling in dispersion trench (0.3 m below + 0.05 m over pipe)", "cum", [row("Aggregate", disp.n * nos, disp.len, disp.w, 0.45)], null, 1700, "Non-SOR"));
      }
    }
    var exV = (Lb + 2 * work) * (Bb + 2 * work) * zexc, stV = (Lb + 0.2) * (Bb + 0.2) * 0.1 + Lb * Bb * tb + Lo * Bo * Math.max(lv.zfloor, 0);
    qty.push(Q("Filling available excavated earth in trenches / pits", "cum", [row("Around septic tank", nos, Math.max(exV - stV, 0))].concat(disp.n && /^Soak/.test(disp.kind) ?
      [row("Around soak pit lining (annulus π/4 × ((D + 1.06)² − (D + 0.46)²))", disp.n * nos, Math.PI / 4 * (Math.pow(disp.Dp + 1.06, 2) - Math.pow(disp.Dp + 0.46, 2)), null, disp.bot)] : []).concat(disp.n && /^Disp/.test(disp.kind) ? [row("Over trench aggregate", disp.n * nos, disp.len, disp.w, Math.max(disp.top + disp.dtr - 0.45, 0))] : []), [CPWD(), "2.25"]));
    // ---------------------------------------------------------------- drawings
    var sheet = stDrawing(inp, cap, st, lv, t, disp, cover);
    var summary = { "Tank (inside)": F(cap.L, ".2f") + " × " + F(cap.B, ".2f") + " m, liquid " + F(cap.D, ".2f") + " m + free board → " + F(cap.Vp, ".1f") + " m³ (need " + F(cap.V, ".1f") + ")",
      "Compartments": cap.two ? F(cap.L1, ".2f") + " + " + F(cap.L2, ".2f") + " m" : "single",
      "Walls": rcc ? "RCC " + G(t.tw) + " mm, " + G(st.wo.dia) + "Ø @ " + G(st.wo.spacing) + " out / " + G(st.wi.dia) + "Ø @ " + G(st.wi.spacing) + " in" : String(inp.walls),
      "Base / cover slab": G(t.tb) + " mm / " + G(t.ts) + " mm (" + G(st.cs.dia) + "Ø @ " + G(st.cs.spacing) + ")",
      "Levels": "inlet " + F(lv.inlet, ".2f") + ", TWL " + F(lv.twl, ".2f") + ", floor " + F(lv.floor, ".2f") + " m (GL = 0)",
      "Disposal": disp.n ? (/^Soak/.test(disp.kind) ? disp.n + " soak pit(s) " + F(disp.Dp, ".1f") + " m dia × " + F(disp.h, ".2f") + " m" : disp.n + " trench(es) " + F(disp.len, ".1f") + " m × " + F(disp.w, ".2f") + " m") : String(inp.disposal),
      "Max utilisation": F(c.max_utilisation, ".2f") };
    var refs = ["IS 2470 (Part 1):1985 – Septic tanks: design & construction", "IS 2470 (Part 2):1985 – Secondary treatment & disposal of effluent",
      "IS 3370 (Part 1 & 2):2009 – Liquid-retaining structures", "IS 1905:1987 – Structural use of unreinforced masonry", "CPHEEO Manual on Sewerage (2013)"].concat(RCC_REFS);
    return C.DesignResult({ module: "septic_tank", title: "Septic tank & soak pit", inputs: inp, calc: c, summary: summary, drawings: [sheet],
      quantities: qty, bbs: bbs, tables: {}, references: refs });
  }
  M.run_septic = run_septic;

  function stDrawing(inp, cap, st, lv, t, disp, cover) {
    var D_ = DR(), L = cap.L * 1000, B = cap.B * 1000, tw = t.tw, tb = t.tb, ts = t.ts, rcc = st.rcc, fill = rcc ? "concrete" : null;
    var L1 = cap.L1 * 1000, ptn = cap.two ? tw : 0;
    // plan
    var p = new D_.View("Plan");
    var Lo = L + 2 * tw + ptn, Bo = B + 2 * tw;
    p.rect(0, 0, Lo, Bo, "OUTLINE", fill); p.rect(tw, tw, L1, B, "OUTLINE", "water");
    if (cap.two) { p.rect(tw + L1 + ptn, tw, cap.L2 * 1000, B, "OUTLINE", "water"); p.rect(tw + L1, tw, ptn, B, "OUTLINE", fill); }
    p.rect(tw + 150, tw + (B - 450) / 2, 600, 450, "HIDDEN");
    if (cap.two) p.rect(tw + L1 + ptn + Math.max(cap.L2 * 1000 - 600, 0) / 2, tw + (B - 450) / 2, Math.min(600, cap.L2 * 1000), 450, "HIDDEN");
    p.line(-800, Bo / 2, tw + 150, Bo / 2, "STEEL"); p.text(-800, Bo / 2 + 80, "INLET", 2.0);
    p.line(Lo - tw - 150, Bo / 2, Lo + 900, Bo / 2, "STEEL"); p.text(Lo + 300, Bo / 2 + 80, "OUTLET", 2.0);
    p.circle(Lo - tw - 120, Bo - tw - 120, 60, "STEEL"); p.text(Lo - tw - 120, Bo + 150, "vent " + G(lv.vent) + "Ø", 1.8, { anchor: "middle" });
    if (disp.n && /^Soak/.test(disp.kind)) {
      var cx = Lo + 900 + disp.Dp * 500 + 230;
      p.circle(cx, Bo / 2, disp.Dp * 500 + 230, "OUTLINE"); p.circle(cx, Bo / 2, disp.Dp * 500, "HIDDEN");
      p.text(cx, Bo / 2 - disp.Dp * 500 - 450, "Soak pit " + F(disp.Dp, ".1f") + " m dia" + (disp.n > 1 ? " (" + disp.n + " nos)" : ""), 2.0, { anchor: "middle" });
    }
    p.dim(0, 0, Lo, 0, 10); p.dim(tw, Bo, tw + L1, Bo, -6);
    if (cap.two) p.dim(tw + L1 + ptn, Bo, Lo - tw, Bo, -6);
    p.dim(Lo, 0, Lo, Bo, -8 - (disp.n ? 0 : 0)); p.dim(0, tw, 0, tw + B, 8);
    // longitudinal section (levels in mm, GL = 0)
    var s = new D_.View("Longitudinal section");
    var yFl = lv.floor * 1000, yTop = lv.top * 1000, yTW = lv.twl * 1000, ySo = lv.soffit * 1000;
    s.rect(-tw, yFl - tb, Lo, tb, "OUTLINE", "concrete");
    s.rect(-tw - 150, yFl - tb - 100, Lo + 300, 100, "CONCRETE");
    s.rect(-tw, yFl, tw, ySo - yFl, "OUTLINE", fill); s.rect(L + ptn, yFl, tw, ySo - yFl, "OUTLINE", fill);
    if (cap.two) s.rect(L1, yFl, ptn, ySo - yFl, "OUTLINE", fill);
    s.rect(-tw, ySo, Lo, ts, "OUTLINE", "concrete");
    s.line(0, yTW, L + ptn, yTW, "WATER"); s.text(L / 2, yTW + 60, "TWL " + F(lv.twl, ".2f"), 2.0, { anchor: "middle" });
    s.line(0, yFl + cap.D * 1000 * 0.35, L1, yFl + cap.D * 1000 * 0.35, "HIDDEN"); s.text(L1 / 2, yFl + 120, "sludge zone", 1.8, { anchor: "middle" });
    s.line(-2000, 0, Lo + 2000, 0, "SOIL"); s.text(Lo + 2000, 60, "GL ±0.00", 2.0, { anchor: "end" });
    var yin = lv.inlet * 1000;
    s.line(-1500, yin + 50, 150, yin + 50, "STEEL"); s.poly([[150, yTW + 150], [150, yTW - 300]], false, "STEEL");
    s.text(-1500, yin + 160, "Inlet invert " + F(lv.inlet, ".2f"), 2.0);
    var xo = L + ptn - 150;
    s.poly([[xo, yTW + 150], [xo, yTW - cap.D * 1000 / 3]], false, "STEEL"); s.line(xo, yTW, Lo + 1500, yTW, "STEEL");
    s.text(Lo + 300, yTW - 180, "Outlet invert " + F(lv.twl, ".2f"), 2.0);
    if (cap.two) s.text(L1 + ptn / 2, yFl + cap.D * 450, "slots", 1.8, { anchor: "middle", rot: 90 });
    s.line(L + ptn - 120, yTop, L + ptn - 120, yTop + 2000, "STEEL"); s.text(L + ptn - 60, yTop + 1800, "Vent " + G(lv.vent) + "Ø, 2 m above GL", 1.8);
    if (rcc && st.wo) {
      s.poly([[-cover, ySo + ts - cover], [-cover, yFl - tb + cover], [L / 2, yFl - tb + cover]], false, "REBAR");
      s.text(-tw - 150, (yFl + ySo) / 2, "Wall " + G(st.wo.dia) + "Ø@" + G(st.wo.spacing) + " out, " + G(st.wi.dia) + "Ø@" + G(st.wi.spacing) + " in", 2.0, { anchor: "end" });
    }
    s.text(L / 2, yFl - tb - 400, "Base " + G(tb) + " thk: top " + G(st.bt.dia) + "Ø@" + G(st.bt.spacing) + ", bottom " + G(st.bb.dia) + "Ø@" + G(st.bb.spacing) + " both ways", 2.0, { anchor: "middle" });
    s.text(L / 2, yTop + 250, "Cover slab " + G(ts) + " thk, " + G(st.cs.dia) + "Ø@" + G(st.cs.spacing) + " main", 2.0, { anchor: "middle" });
    s.dim(-tw - 300, yFl, -tw - 300, yTW, 10, "LIQUID " + F(cap.D * 1000, ",.0f"));
    s.dim(Lo + 1700, yTW, Lo + 1700, ySo, -8);
    s.dim(-tw, yFl - tb - 100, L + ptn + tw, yFl - tb - 100, 12);
    var views = [p, s];
    if (disp.n && /^Soak/.test(disp.kind)) {
      var v = new D_.View("Soak pit – section"), Dp = disp.Dp * 1000, z0 = -disp.top * 1000, zb = -disp.bot * 1000;
      v.rect(-Dp / 2 - 230, zb, 230, -zb, "OUTLINE"); v.rect(Dp / 2, zb, 230, -zb, "OUTLINE");
      for (var k = 0; k < 6; k++) v.line(-Dp / 2 - 230, zb + (k + 0.5) * (-zb) / 6, -Dp / 2, zb + (k + 0.5) * (-zb) / 6, "THIN");
      v.rect(-Dp / 2, zb, Dp, (z0 - 150) - zb, "THIN", "soil");
      v.rect(-Dp / 2 - 280, 0, Dp + 560, 100, "OUTLINE", "concrete");
      v.line(-Dp / 2 - 1200, z0, -Dp / 2, z0, "STEEL"); v.text(-Dp / 2 - 1200, z0 + 80, "from tank", 1.8);
      v.line(-Dp - 1000, 0, Dp + 1000, 0, "SOIL");
      v.text(0, (zb + z0) / 2, "brick bats / stone 75–150", 1.8, { anchor: "middle" });
      v.text(Dp / 2 + 300, zb + 300, "honeycomb brick lining 230", 1.8);
      v.dim(-Dp / 2, zb, Dp / 2, zb, 8); v.dim(Dp / 2 + 230, zb, Dp / 2 + 230, z0, -8, "EFFECTIVE " + F(disp.h * 1000, ",.0f"));
      views.push(v);
    } else if (disp.n) {
      var tv = new D_.View("Dispersion trench – section"), w = disp.w * 1000, dd = disp.dtr * 1000, z1 = -disp.top * 1000;
      tv.rect(-w / 2, z1 - dd, w, dd, "OUTLINE"); tv.rect(-w / 2, z1 - dd, w, 450, "THIN", "soil");
      tv.circle(0, z1 - dd + 350, 50, "STEEL"); tv.line(-w, 0, w, 0, "SOIL");
      tv.text(w / 2 + 100, z1 - dd + 300, "100 open-jointed pipe on 20–40 aggregate", 1.8);
      tv.dim(-w / 2, z1 - dd, w / 2, z1 - dd, 8); tv.dim(w / 2, z1 - dd, w / 2, 0, -8);
      views.push(tv);
    }
    var notes = ["Designed to IS 2470 Part 1 & 2 for " + cap.N + " users (" + String(inp.use) + "), desludging every " + G(num(inp.desludge)) + " year(s).",
      "Levels in m with GL = ±0.00; inlet invert 50 mm above outlet invert; tees / baffles as shown.",
      rcc ? "RCC M" + G(num(inp.fck)) + ", Fe" + G(num(inp.fy)) + ", cover " + G(cover) + " mm; water-tightness test before backfilling (IS 3370-1)." :
        "Brick masonry in CM 1:4; inside 20 mm CM 1:4 plaster with water-proofing compound + neat cement finish; corners rounded.",
      "Vent pipe " + G(lv.vent) + " mm with cowl 2 m above GL; manhole covers sealed; no manual entry for desludging."];
    return new D_.Sheet("Septic tank & soak pit", "ST-01", views, notes);
  }

  var ST_PARAMS = [
    P("users", "Number of users", 50, { kind: "int", min: 5, max: 500, group: "Users & capacity" }),
    P("use", "Building / occupancy", ST_USE[0], { kind: "select", options: ST_USE.slice(), group: "Users & capacity" }),
    P("flow", "Sewage per user (0 = default for occupancy)", 0.0, "l/day", { min: 0, max: 250, group: "Users & capacity" }),
    P("sludge_rate", "Sludge + scum per user (0 = default)", 0.0, "m³/yr", { min: 0, max: 0.1, step: 0.005, group: "Users & capacity" }),
    P("desludge", "Desludging interval", 2, "years", { kind: "select", options: [1, 2, 3], group: "Users & capacity" }),
    P("detention", "Detention time", 24.0, "h", { min: 12, max: 48, group: "Users & capacity" }),
    P("liq_depth", "Liquid depth", 1.2, "m", { min: 1.0, max: 2.0, step: 0.05, group: "Users & capacity" }),
    P("ratio", "Length : width", 3.0, { min: 2, max: 4, step: 0.5, group: "Users & capacity" }),
    P("freeboard", "Free board", 0.3, "m", { min: 0.3, max: 0.6, step: 0.05, group: "Users & capacity" }),
    P("inlet_depth", "Inlet invert below GL", 0.6, "m", { min: 0.3, max: 2.0, step: 0.05, group: "Levels" }),
    P("walls", "Walls", ST_WALLS[1], { kind: "select", options: ST_WALLS.slice(), group: "Structure" }),
    P("cover_ll", "Live load on cover slab (no vehicles)", 2.0, "kN/m²", { min: 1.5, max: 10, group: "Structure" }),
    P("gamma", "Soil unit weight", 18.0, "kN/m³", { min: 15, max: 22, group: "Soil" }),
    P("phi", "Soil angle of friction", 30.0, "°", { min: 20, max: 40, group: "Soil" }),
    P("surcharge", "Surcharge beside tank", 5.0, "kN/m²", { min: 0, max: 30, group: "Soil" }),
    P("gwt", "Highest groundwater level below GL", 5.0, "m", { min: 0, max: 20, step: 0.1, group: "Soil" }),
    P("sbc", "Safe bearing capacity", 100.0, "kN/m²", { min: 50, max: 400, group: "Soil" }),
    P("disposal", "Effluent disposal", "Soak pit", { kind: "select", options: ["Soak pit", "Dispersion trench", "None (effluent to drain / sewer)"], group: "Effluent disposal" }),
    P("perc", "Percolation time for 25 mm fall", 10.0, "min", { min: 0.5, max: 120, step: 0.5, group: "Effluent disposal", when: function (v) { return !/^None/.test(String(v.disposal)); } }),
    P("trench_w", "Trench width", 0.6, "m", { min: 0.3, max: 1.0, step: 0.05, group: "Effluent disposal", when: function (v) { return /^Disp/.test(String(v.disposal)); } }),
    P("trench_d", "Trench depth", 0.9, "m", { min: 0.5, max: 1.0, step: 0.05, group: "Effluent disposal", when: function (v) { return /^Disp/.test(String(v.disposal)); } }),
    P("nos", "Number of identical tanks (quantity)", 1, { kind: "int", min: 1, max: 50, group: "Quantity" })
  ].concat(matParams(45.0, "Severe", 30.0), [
    P("L_chk", "Inside length (check)", 4.8, "m", { min: 1, max: 20, step: 0.05, group: "My design", modes: CHECK }),
    P("B_chk", "Inside width (check)", 1.6, "m", { min: 0.75, max: 5, step: 0.05, group: "My design", modes: CHECK }),
    P("D_chk", "Liquid depth (check)", 1.2, "m", { min: 0.8, max: 2.5, step: 0.05, group: "My design", modes: CHECK }),
    P("tw_chk", "RCC wall thickness (check)", 200.0, "mm", { min: 150, max: 500, step: 25, group: "My design", modes: CHECK, when: function (v) { return String(v.walls).indexOf("RCC") === 0; } }),
    P("tb_chk", "Base slab thickness (check)", 250.0, "mm", { min: 100, max: 600, step: 25, group: "My design", modes: CHECK }),
    P("ts_chk", "Cover slab thickness (check)", 120.0, "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK }),
    P("proj_chk", "Base projection beyond walls (check)", 0.15, "m", { min: 0, max: 1.0, step: 0.05, group: "My design", modes: CHECK }),
    P("wall_dia", "Wall bar dia (check, both faces)", 12.0, "mm", { kind: "select", options: [10.0, 12.0, 16.0, 20.0], group: "My design", modes: CHECK, when: function (v) { return String(v.walls).indexOf("RCC") === 0; } }),
    P("wall_s", "Wall bar spacing (check)", 150.0, "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK, when: function (v) { return String(v.walls).indexOf("RCC") === 0; } }),
    P("base_dia", "Base bar dia (check, each face)", 12.0, "mm", { kind: "select", options: [10.0, 12.0, 16.0, 20.0], group: "My design", modes: CHECK }),
    P("base_s", "Base bar spacing (check)", 125.0, "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK }),
    P("cs_dia", "Cover slab main bar dia (check)", 10.0, "mm", { kind: "select", options: [8.0, 10.0, 12.0, 16.0], group: "My design", modes: CHECK }),
    P("cs_s", "Cover slab main spacing (check)", 150.0, "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK })
  ]);
  M.ST_PARAMS = ST_PARAMS;
  C.register({ id: "septic_tank", phase: 3, category: "Drains, culverts & roads", name: "Septic tank & soak pit (IS 2470)", icon: "🚽",
    description: "IS 2470-1 capacity (users, detention, desludging interval), two compartments, levels, tees & vent; brick or RCC walls " +
      "(earth + groundwater / water-test pressure, flotation); soak pit or dispersion trench from the percolation rate (IS 2470-2); BBS & quantities.",
    params: ST_PARAMS, run: run_septic, references: ["IS 2470 (Part 1 & 2):1985", "IS 3370:2009", "IS 1905:1987"].concat(RCC_REFS) });

  /* =========================================================================== 3. BOUNDARY / COMPOUND WALL */
  var BW_T = ["230 mm (one brick)", "115 mm (half brick)"];
  var BW_BARB = ["None", "Barbed wire on Y-angles (0.6 m, 2 × 4 strands)", "Barbed wire on straight angles (0.45 m, 4 strands)"];
  var BW_COPE = ["CC 1:2:4 coping 75 mm with weather slope", "None"];
  /* IS 1905:1987 cl 5.4.2 permissible flexural tension (N/mm²): [vertical bending (normal to bed joints), horizontal (parallel)];
     mortar CM 1:4 = H2 (≥ M1) → 0.07 / 0.14, CM 1:6 = M2 → 0.05 / 0.10 (verify Table 1 / cl 5.4.2) */
  function bwTension(mortar) { return /1:4/.test(String(mortar)) ? [0.07, 0.14, "H2"] : [0.05, 0.10, "M2"]; }

  function bwPanel(c, inp, H, s, t, pw, pb) {
    var ft = bwTension(inp.mortar), Lc = s - pb / 1000, tm = t / 1000;
    c.section("Wall panel – lateral load (IS 1905)");
    c.let("Panel: clear length between pillars × height × thickness", "Lc × h × t", F(Lc, ".2f") + " × " + F(H, ".2f") + " × " + G(t), "m, mm", "",
      "supported by pillars at the sides and the plinth beam at the bottom, top free");
    var r = c.calc("Share of wind carried horizontally (deflection compatibility)", "kh", "9.6*h**4/(9.6*h**4 + Lc**4)", "",
      "strip method: cantilever δ = wH⁴/8EI vs simply supported δ = 5wL⁴/384EI", { h: R(H, 3), Lc: R(Lc, 3) });
    var Mh = c.calc("Horizontal bending (strip spanning between pillars)", "Mh", "kh*pw*Lc**2/8", "kN·m/m", "", { kh: R(r, 4), pw: R(pw, 4), Lc: R(Lc, 3) });
    var fh = c.calc("Flexural tension parallel to bed joints", "fh", "6*Mh/t**2/1000", "N/mm²", "IS 1905 cl 5.4.2", { Mh: Mh, t: tm });
    var okh = c.check("Horizontal flexural tension ≤ permissible (" + ft[2] + " mortar)", fh, ft[1], { unit: "N/mm²", clause: "IS 1905 cl 5.4.2 (verify)" });
    var Mv = c.calc("Vertical bending at the plinth (cantilever strip)", "Mv", "(1 - kh)*pw*h**2/2", "kN·m/m", "", { kh: R(r, 4), pw: R(pw, 4), h: R(H, 3) });
    var fv = c.calc("Flexural tension normal to bed joints (net of self-weight)", "fv", "6*Mv/t**2/1000 - 20*h/1000", "N/mm²", "IS 1905 cl 5.4.2", { Mv: Mv, t: tm, h: R(H, 3) });
    var okv = c.check("Vertical flexural tension ≤ permissible (" + ft[2] + " mortar)", fv, ft[0], { unit: "N/mm²", clause: "IS 1905 cl 5.4.2 (verify)" });
    var slr = c.calc("Slenderness (free-standing wall): 2h / t", "SR", "2*h*1000/t", "", "IS 1905 cl 4.5 / 4.6 (effective height 2h for a free top)", { h: R(H, 3), t: t });
    c.ok("Slenderness ratio ≤ 27 (cement mortar)", slr <= 27 || (Lc <= 30 * tm), { detail: "SR = " + F(slr, ".1f") + "; panel braced by pillars @ " + F(s, ".2f") + " m (lateral support length ≤ 30 t = " + F(30 * tm, ".2f") + " m)",
      clause: "IS 1905 cl 4.6 / Table 7 (verify)", warn_only: true });
    return { ok: okh && okv, fh: fh, fv: fv, kh: r };
  }

  function bwPillar(c, inp, mode, g, a, given) {
    /* g: {H, s, pw, F (kN service), Fe, he, z (pillar below GL to footing top)} ; a = size across wall (mm) */
    var fck = num(inp.fck), fy = num(inp.fy), b = num(inp.pillar_b), cover = g.cover, dt = DT();
    c.section("RCC pillar – cantilever from footing");
    c.let("Pillar size (across wall × along wall)", "a × b", G(a) + " × " + G(b), "mm");
    var Mgl = c.calc("Service moment at GL", "Mgl", "Fw*H/2 + Fe*he/3", "kN·m", "", { Fw: R(g.F, 3), H: g.H, Fe: R(g.Fe, 3), he: g.he });
    var Mft = c.calc("Service moment at footing top", "Mft", "Fw*(H/2 + z) + Fe*(he/3 + z)", "kN·m", "", { Fw: R(g.F, 3), H: g.H, z: R(g.z, 3), Fe: R(g.Fe, 3), he: g.he });
    var Mu = c.calc("Design moment (1.5 × wind / earth)", "Mu", "1.5*Mft", "kN·m", "IS 456 Table 18", { Mft: Mft });
    var tie0 = 8, dia0 = given ? given[1] : (dt ? Math.max(12, dt.min_dia("column", "main").dia) : 12);
    var d = a - cover - tie0 - dia0 / 2;
    var f = RC().flexure(c, Mu, b, d, fck, fy, "beam", { tag: "(pillar, each face)" });
    var dia, nf;
    if (given) { nf = Math.max(1, Math.trunc(given[0] / 2)); dia = given[1]; c.check("Steel per face provided ≥ required", nf * area(dia), f.Ast, { unit: "mm²", clause: "IS 456 cl 38", mode: ">=" });
      if (dt) { var mn = dt.min_dia("column", "main"); c.ok("Pillar bar Ø ≥ " + (mn.level === "mine" ? "mining-site" : "practice") + " minimum", dia >= mn.dia, { detail: G(dia) + " ≥ " + G(mn.dia), clause: mn.clause, warn_only: true }); } }
    else {
      dia = dia0; nf = Math.max(2, Math.ceil(f.Ast / area(dia) - 1e-9));
      if (nf > 3) { var d2 = [16, 20, 25].filter(function (x) { return x > dia && Math.ceil(f.Ast / area(x) - 1e-9) <= 3; })[0]; if (d2) { dia = d2; nf = Math.max(2, Math.ceil(f.Ast / area(dia) - 1e-9)); } }
      c.let("Bars per face (symmetric – wind reverses)", "", nf + "-" + G(dia) + "Ø each face (" + 2 * nf + " total)", "", dt ? dt.min_dia("column", "main").clause : "IS 456 cl 26.5.3.1");
    }
    var Asc = 2 * nf * area(dia);
    c.check("Longitudinal steel ≥ 0.8 % of section", Asc, 0.008 * a * b, { unit: "mm²", clause: "IS 456 cl 26.5.3.1(a)", mode: ">=" });
    var tie = dt ? dt.tie_bars(dia, Math.min(a, b), Math.max(a, b), null, { length: g.H }) : { dia: 8, s: Math.min(Math.min(a, b), 16 * dia, 300) };
    if (dt) dt.record(c, "pillar ties", tie);
    var Vu = 1.5 * (g.F + g.Fe);
    RC().shear(c, Vu, b, a - cover - tie.dia - dia / 2, 100 * nf * area(dia) / (b * (a - cover - tie.dia - dia / 2)), fck, fy, "beam", { stirrup_dia: tie.dia, tag: "(pillar)" });
    var Ldv = RC().development_length(c, dia, fy, fck, { tag: "(pillar bars into footing)" });
    return { a: a, b: b, nf: nf, dia: dia, tie: tie, Mu: Mu, Mft: Mft, Mgl: Mgl, Ast: f.Ast, d: d, Ld: Ldv, ok: f.ok && nf * area(dia) >= f.Ast - 1e-6 && nf <= 4 };
  }

  function bwFooting(c, inp, mode, g, pl, Lf, tf, given) {
    var fck = num(inp.fck), fy = num(inp.fy), sbc = num(inp.sbc), gam = num(inp.gamma), mu = num(inp.mu), df = num(inp.df), dt = DT(), cv = 50;
    c.section("Pillar footing – stability & bearing");
    c.let("Footing (square) × depth", "Lf × tf", F(Lf, ".2f") + " × " + G(tf), "m, mm", "", "founded " + F(df, ".2f") + " m below GL");
    var a = pl.a / 1000, b = pl.b / 1000, t = tf / 1000;
    var Pw = c.calc("Wall, plinth beam, coping & fencing on one pillar (span s)", "Pw", "wl*s", "kN", "", { wl: R(g.wline, 3), s: g.s });
    var P = c.calc("Total vertical load at footing base (service, DL only)", "P", "Pw + 25*a*b*(H + df - t) + 25*Lf**2*t + g*(Lf**2 - a*b)*(df - t)", "kN", "",
      { Pw: Pw, a: a, b: b, H: g.H, df: df, t: t, Lf: Lf, g: gam });
    var Mo = c.calc("Overturning moment at footing base", "Mo", "Fw*(H/2 + df) + Fe*(he/3 + df)", "kN·m", "", { Fw: R(g.F, 3), H: g.H, df: df, Fe: R(g.Fe, 3), he: g.he });
    var e = c.calc("Eccentricity", "e", "Mo/P", "m", "", { Mo: Mo, P: P });
    var pmax = e <= Lf / 6 ? c.calc("Max. base pressure (full contact, e ≤ L/6)", "pmax", "P/Lf**2*(1 + 6*e/Lf)", "kN/m²", "", { P: P, Lf: Lf, e: e })
      : c.calc("Max. base pressure (partial contact, e > L/6)", "pmax", "2*P/(3*Lf*(Lf/2 - e))", "kN/m²", "triangular, part of the base lifts", { P: P, Lf: Lf, e: R(Math.min(e, Lf / 2 - 1e-3), 4) });
    var okp = c.check("Max. base pressure ≤ 1.25 × SBC (wind)", pmax, 1.25 * sbc, { unit: "kN/m²", clause: "IS 1904 / IS 875-5 (25 % increase for wind)" });
    c.ok("Resultant within the middle half of the base (e ≤ L/4)", e <= Lf / 4 + 1e-9, { detail: "e = " + F(e, ".3f") + " m, L/4 = " + F(Lf / 4, ".3f") + " m", clause: "Practice for footings under wind", warn_only: true });
    var oko = c.check("Overturning: 1.4 Mo ≤ 0.9 × P·L/2", 1.4 * Mo, 0.9 * P * Lf / 2, { unit: "kN·m", clause: "IS 456 cl 20.1" });
    var oks = c.check("Sliding: 1.4 H ≤ 0.9 μ P", 1.4 * (g.F + g.Fe), 0.9 * mu * P, { unit: "kN", clause: "IS 456 cl 20.2 (passive resistance ignored)" });
    c.section("Pillar footing – depth & reinforcement");
    var proj = (Lf - a) / 2;
    var qu = c.calc("Factored soil pressure (max., uniform over the projection)", "qu", "1.5*pmax", "kN/m²", "IS 456 Table 18", { pmax: pmax });
    var Muf = c.calc("Moment at pillar face", "Mu", "qu*Lf*p**2/2", "kN·m", "IS 456 cl 34.2.3.1", { qu: qu, Lf: Lf, p: R(proj, 3) });
    var d = tf - cv - 12;
    var f = RC().flexure(c, Muf, Lf * 1000, d, fck, fy, "slab", tf, { tag: "(footing)" });
    var bars = stripBars(c, f.Ast / Lf, "footing", "main", d, tf, given, "footing bottom, both ways", { dias: [10, 12, 16], smax: 200 });
    var Vu = c.calc("One-way shear at d from pillar face", "Vu", "qu*Lf*max(p - d/1000, 0)", "kN", "IS 456 cl 34.2.4.1(a)", { qu: qu, Lf: Lf, p: R(proj, 3), d: d });
    var oksh = RC().shear(c, Vu, Lf * 1000, d, 100 * bars.Ast_prov / (1000 * d), fck, fy, "footing", tf, { tag: "(footing)" }).ok;
    var avail = proj * 1000 - cv + Math.max(tf - 2 * cv - 2 * bars.dia, 0);
    var okd = c.check("Anchorage of footing bars ≥ Ld", avail, BB().Ld(bars.dia, fck, fy), { unit: "mm", clause: "IS 456 cl 34.2.4.3", mode: ">=", note: "projection − cover + 90° leg" });
    var anc = c.calc("Anchorage of pillar bars in the footing", "La", "tf - c - 2*dm + 8*dp + leg", "mm", "IS 456 cl 26.2.2.1 (90° bend = 8φ) + horizontal leg on the mesh",
      { tf: tf, c: cv, dm: bars.dia, dp: pl.dia, leg: BB().leg(pl.dia, BB().cfg.ftg_leg_min) });
    var oka = c.check("Pillar bars: anchorage in footing ≥ Ld", anc, pl.Ld, { unit: "mm", clause: "IS 456 cl 26.2.1 / 34.2.4.3", mode: ">=", note: "else deepen the footing" });
    return { Lf: Lf, tf: tf, P: P, Mo: Mo, e: e, pmax: pmax, bars: bars, ok: okp && oko && oks && oksh && okd && oka && f.ok };
  }

  function run_boundary(inp, mode) {
    var c = new C.Calc("Boundary / compound wall");
    var fck = num(inp.fck), fy = num(inp.fy), dt = DT();
    var cover = coverAdopt(c, inp, mode, "column");
    if (dt) dt.site_checks(c, "footing", fck, Math.max(cover, 50));
    var H = num(inp.height), s = num(inp.spacing), t = String(inp.wall_t).indexOf("115") === 0 ? 115 : 230, Ltot = num(inp.length);
    var barb = String(inp.barbed), hasBarb = barb !== "None", cope = String(inp.coping).indexOf("CC") === 0;
    var df = num(inp.df), gam = num(inp.gamma), he = Math.min(num(inp.earth_h), H);
    c.section("Wind (IS 875-3:2015)");
    var Vb = num(inp.Vb);
    var pd = LD().design_wind_pressure(c, Vb, H, Math.trunc(num(inp.terrain)), num(inp.k1), num(inp.k3), 1.0, H * s, 1.0, 1.0);
    var Cf = c.let("Net pressure coefficient, free-standing wall", "Cp,net", num(inp.cf), "", "IS 875-3:2015 cl 7.4.2 (free-standing walls) / EN 1991-1-4 Table 7.9 – verify",
      "1.2 for long walls with returns; 1.7–2.1 within 2H of a free end");
    var pw = c.calc("Net wind pressure on wall", "pw", "Cf*pd", "kN/m²", "", { Cf: Cf, pd: pd });
    c.info("Wind directionality / combination factors", "Kd = 1.0, Kc = 1.0 taken for a free-standing wall (conservative)", "IS 875-3 cl 7.2.1");
    var Ka = 1 / 3, kaN = (1 - Math.sin(num(inp.phi) * Math.PI / 180)) / (1 + Math.sin(num(inp.phi) * Math.PI / 180));
    if (he > 0) {
      c.section("Earth / bund against the wall (mine)");
      Ka = c.calc("Active pressure coefficient", "Ka", "(1 - sin(radians(phi)))/(1 + sin(radians(phi)))", "", "Rankine", { phi: num(inp.phi) });
      c.warn("Wall retaining earth", "A boundary wall is not a retaining wall – earth / OB bund " + F(he, ".2f") + " m high is resisted by the pillars only; keep bunds ≥ 1 m clear or design a retaining wall", "Mine practice");
    } else Ka = kaN;
    // geometry search (design): pillar spacing ≤ input, pillar depth across wall, footing size & depth
    var a = mode === "check" ? num(inp.pillar_a) : Math.max(num(inp.pillar_a), t === 115 ? 230 : 230);
    if (mode === "thumb") { s = Math.min(s, t === 115 ? 2.0 : 3.0); c.info("Thumb rules", "Pillars @ ≤ 3.0 m (230 wall) / ≤ 2.0 m (115 wall); pillar 230 × 230 with 4-12Ø (6-12Ø above 2 m); footing ≈ 0.5 H square (≥ 1.0 m) × 450 mm, 1.2 m deep", "CPWD type designs / practice"); }
    var given = mode === "check" ? [num(inp.pillar_n), num(inp.pillar_dia)] : null;
    var Lf = mode === "check" ? num(inp.ftg_L) : mode === "thumb" ? ceil_to(Math.max(1.0, 0.5 * H), 0.05) : 0.75, tf = mode === "check" ? num(inp.ftg_D) : mode === "thumb" ? 450 : 300;
    var gf = mode === "check" ? [num(inp.ftg_dia), num(inp.ftg_s)] : null;
    function geo(sp) {
      var Fw = pw * sp * H + (hasBarb ? pw * 0.05 * sp : 0), Fe = he > 0 ? Ka * gam * he * he / 2 * sp : 0;
      var pbD = num(inp.pb_D) / 1000, pbB = num(inp.pb_b) / 1000;
      var wline = 20 * (t / 1000) * (H - 0.15 - (cope ? 0.075 : 0)) + 2 * 0.012 * 20.4 * H + (cope ? 24 * 0.075 * (t / 1000 + 0.05) : 0) + 25 * pbB * pbD + (hasBarb ? 0.1 : 0);
      return { H: H, s: sp, pw: pw, F: Fw, Fe: Fe, he: he, z: Math.max(df - tf / 1000, 0), cover: cover, wline: wline };
    }
    if (mode === "design") {
      for (var it = 0; it < 80; it++) {
        var sc = new C.Calc("s"), g0 = geo(s);
        var pnl = bwPanel(sc, inp, H, s, t, pw, a);
        if (!pnl.ok && s > 1.2 + 1e-9) { s = R(Math.max(s - 0.25, 1.2), 2); continue; }
        var pl0 = bwPillar(sc, inp, mode, g0, a, null);
        if (!pl0.ok && a < 600) { a += 50; continue; }
        var ft0 = bwFooting(sc, inp, mode, g0, pl0, Lf, tf, null);
        if (ft0.ok || Lf > 4) break;
        var fl = sc.failures.map(function (x) { return x.label; }).join("|");
        if (/pressure|Overturning|Sliding/.test(fl) || !(ft0.e <= Lf / 4)) Lf = R(Lf + 0.05, 2); else tf += 50;
      }
      if (s < num(inp.spacing)) c.info("Pillar spacing reduced", F(num(inp.spacing), ".2f") + " m → " + F(s, ".2f") + " m so that the brick panel passes the IS 1905 lateral-load check", "IS 1905 cl 5.4.2");
    }
    var g = geo(s);
    c.section("Loads on one pillar (service)");
    c.calc("Wind force on one pillar (panel " + F(s, ".2f") + " m × " + F(H, ".2f") + " m)", "Fw", "pw*s*H" + (hasBarb ? " + pw*0.05*s" : ""), "kN", "", hasBarb ? "+ barbed wire, solidity ≈ 0.05" : "", { pw: R(pw, 4), s: s, H: H });
    if (he > 0) c.calc("Earth thrust on one pillar", "Fe", "Ka*g*he**2/2*s", "kN", "Rankine", { Ka: R(Ka, 4), g: gam, he: he, s: s });
    c.calc("Wall + plaster + coping + plinth beam per m", "wl", "wv", "kN/m", "IS 875-1", { wv: R(g.wline, 3) });
    var pnl2 = bwPanel(c, inp, H, s, t, pw, a);
    if (t === 115) c.ok("Half-brick wall height ≤ 1.8 m", H <= 1.8 + 1e-9, { detail: F(H, ".2f") + " m", clause: "Practice – use a 230 mm wall for taller compound walls", warn_only: true });
    var pl = bwPillar(c, inp, mode, g, a, given);
    var ft = bwFooting(c, inp, mode, g, pl, Lf, tf, gf);
    // plinth beam (continuous over the pillars)
    c.section("Plinth beam (continuous over pillar footings)");
    var pbB = num(inp.pb_b), pbD = num(inp.pb_D), wl = g.wline;
    var Mpb = c.calc("Design moment (continuous, wL²/10)", "Mu", "1.5*w*s**2/10", "kN·m", "IS 456 Table 12 (soil support ignored)", { w: R(wl, 3), s: s });
    var Vpb = c.calc("Design shear", "Vu", "1.5*0.6*w*s", "kN", "IS 456 Table 13", { w: R(wl, 3), s: s });
    var dpb = pbD - cover - 8 - 6;
    var fpb = RC().flexure(c, Mpb, pbB, dpb, fck, fy, "beam", { tag: "(plinth beam)" });
    var pbBars = RC().beam_bars(fpb.Ast, pbB, cover, 8, { rule: dt ? { role: "main" } : null });
    if (dt && pbBars.text) dt.record(c, "plinth beam (top & bottom)", pbBars);
    var nPB = Math.max(2, pbBars.n), dPB = pbBars.dia;
    if (mode === "check") { nPB = Math.max(2, Math.trunc(num(inp.pb_n))); dPB = num(inp.pb_dia); c.check("Plinth beam steel provided ≥ required", nPB * area(dPB), fpb.Ast, { unit: "mm²", clause: "IS 456 cl 26.5.1.1", mode: ">=" }); }
    c.let("Plinth beam bars (top = bottom, wind / settlement reversals)", "", nPB + "-" + G(dPB) + "Ø top + " + nPB + "-" + G(dPB) + "Ø bottom", "", "IS 456 cl 26.5.1 / practice");
    var shp = RC().shear(c, Vpb, pbB, dpb, 100 * nPB * area(dPB) / (pbB * dpb), fck, fy, "beam", { stirrup_dia: 8, legs: 2, tag: "(plinth beam)" });
    var stS = Math.min(shp.stirrups ? shp.stirrups[2] : 150, 200);
    // thumbs / missing
    c.thumb("Pillar spacing", t === 115 ? 2.0 : 3.0, s, "m", "≤ 3.0 m (230 wall), ≤ 2.0 m (115 wall)", "CPWD type designs");
    c.thumb("Pillar footing size", Math.max(1.0, 0.5 * H), ft.Lf, "m", "≈ 0.5 × wall height (≥ 1.0 m)", "Practice");
    c.thumb("Pillar steel", 4, 2 * pl.nf, "bars", "4-12Ø for walls up to 2.4 m", "Practice");
    c.miss("Expansion / movement joints in the masonry every 30 m (at a pillar) – 20 mm gap with filler", "IS 1905 / practice", "Important");
    c.miss("Gates: gate pillars carry gate weight + wind on the gate – design separately (larger footings)", "Practice", "Important");
    c.miss("Seismic out-of-plane check for zone III and above (Korba is zone II)", "IS 1893-1 cl 7.13 / IS 4326", "Advisory");
    if (isMine()) c.miss("Mine: keep OB dumps / bunds ≥ 1 m clear of the wall (no earth against it); blasting-vibration cracks – provide RCC band at mid-height for H > 2.4 m", "Mine practice", "Important");
    // ---------------------------------------------------------------- BBS
    var B_ = BB(), nP = Math.ceil(Ltot / s - 1e-9) + 1, nPan = nP - 1, cvF = 50, bbs = [];
    var runP = (H - 0.04 + df - cvF / 1000 - 0.02) * 1000, legP = Math.max(B_.leg(pl.dia, B_.cfg.ftg_leg_min), 0);
    bbs.push(B_.row("Pillar", "P1", pl.dia, "L (90° leg on footing mesh)", 2 * pl.nf * nP, B_.stock(B_.lbar(pl.dia, runP, legP), pl.dia, fck, fy), "main, " + pl.nf + " per face"));
    var nT = Math.floor((H + Math.max(df - tf / 1000, 0)) * 1000 / pl.tie.s) + 1;
    bbs.push(B_.row("Pillar", "P2", pl.tie.dia, "closed tie, 135° hooks", nT * nP, B_.stirrup(pl.tie.dia, pl.b, pl.a, cover - pl.tie.dia), "@ " + G(pl.tie.s) + " c/c"));
    bbs = bbs.concat(CM().footing_bbs("Pillar footing", nP, ft.Lf, ft.Lf, ft.tf, { bars_L: ft.bars, bars_B: ft.bars }, cvF, "F"));
    var pbo = B_.split(dPB, Ltot * 1000 - 2 * cover, fck, fy);
    bbs.push(B_.row("Plinth beam", "PB1", dPB, "straight, lapped", 2 * nPB, pbo, "top & bottom, continuous"));
    var nSt = Math.floor((Ltot - nP * pl.b / 1000) * 1000 / stS) + nPan;
    bbs.push(B_.row("Plinth beam", "PB2", 8, "closed stirrup, 135° hooks", nSt, B_.stirrup(8, pbB, pbD, cover - 8), "2L-8Ø @ " + G(stS) + " c/c"));
    var below = bbs.filter(function (b) { return b.mark !== "P1" && b.mark !== "P2"; }), above = bbs.filter(function (b) { return b.mark === "P1" || b.mark === "P2"; });
    // ---------------------------------------------------------------- quantities
    var work = 0.3, Lfm = ft.Lf, tfm = ft.tf / 1000, am = pl.a / 1000, bm = pl.b / 1000, pbBm = pbB / 1000, pbDm = pbD / 1000;
    var pbBelow = Math.max(pbDm - 0.15, 0), lenPB = Ltot - nP * (Lfm + 2 * work), tm = t / 1000, hMas = H - 0.15 - (cope ? 0.075 : 0), qty = [];
    qty.push(Q("Earth work in excavation for foundations, all kinds of soil", "cum", [row("Pillar footing pits", nP, Lfm + 2 * work, Lfm + 2 * work, df + 0.1),
      row("Plinth beam trench", 1, Math.max(lenPB, 0), pbBm + 0.3, pbBelow + 0.075)], [CPWD(), "2.8.1"]));
    qty.push(Q("PCC 1:4:8 below footings & plinth beam", "cum", [row("Below pillar footings", nP, Lfm + 0.1, Lfm + 0.1, 0.1), row("Below plinth beam", 1, Math.max(lenPB, 0), pbBm + 0.1, 0.075)], [CPWD(), "4.1.8"]));
    qty.push(Q("RCC M" + G(fck) + " in pillar footings & pillars up to plinth (foundation) (excl. steel & shuttering)", "cum",
      [row("Footings", nP, Lfm, Lfm, tfm), row("Pillars below GL", nP, am, bm, Math.max(df - tfm, 0))], null, CM().rcc_rate(fck)));
    qty.push(Q("RCC M" + G(fck) + " in plinth beam up to plinth level (foundation) (excl. steel & shuttering)", "cum", [row("Plinth beam (between pillars)", nPan, s - bm, pbBm, pbDm)], null, CM().rcc_rate(fck)));
    qty.push(Q("RCC M" + G(fck) + " in pillars above plinth level (excl. steel & shuttering)", "cum", [row("Pillars above GL", nP, am, bm, H)], null, CM().rcc_rate(fck)));
    qty.push(Q("Centering & shuttering for foundations / footings", "sqm", [row("Footing sides", nP, 4 * Lfm, null, tfm)], null, CM().RATE.shutter_found));
    qty.push(Q("Centering & shuttering for columns – RCC pillars", "sqm", [row("Below GL (4 faces)", nP, 2 * (am + bm), null, Math.max(df - tfm, 0)),
      row("Above GL (faces not against brickwork)", nP, 2 * am + 2 * bm - 2 * tm, null, H)], null, CM().RATE.shutter_wall));
    qty.push(Q("Centering & shuttering for plinth beams", "sqm", [row("Both sides", 2 * nPan, s - bm, null, pbDm)], null, CM().RATE.shutter_wall));
    qty.push(steelQty(below, "Boundary wall", "Reinforcement TMT Fe500 in footings & plinth beam up to plinth (foundation) – cutting, bending, placing"));
    qty.push(steelQty(above, "Boundary wall", "Reinforcement TMT Fe500 – cutting, bending, placing – RCC pillars"));
    qty.push(Q("Damp-proof course 40 mm CC 1:2:4 on plinth beam", "sqm", [row("DPC", nPan, s - bm, tm)], [CPWD(), "4.10"]));
    if (t === 230) qty.push(Q("Brick work with common burnt clay FPS bricks class 7.5 in superstructure in cement mortar " + (/1:4/.test(String(inp.mortar)) ? "1:4" : "1:6") + " – wall panels", "cum",
      [row("Panels", nPan, s - bm, tm, hMas)], [CPWD(), /1:4/.test(String(inp.mortar)) ? "6.4.1" : "6.4.2"]));
    else qty.push(Q("Half brick masonry with common burnt clay FPS bricks class 7.5 in cement mortar 1:4 – wall panels", "sqm", [row("Panels", nPan, s - bm, null, hMas)], [CPWD(), "6.13.2"]));
    var face = Ltot * H, pilSides = nP * 2 * Math.max(am - tm, 0) / 2 * H;
    qty.push(Q("12 mm cement plaster 1:6 – fair face of wall & pillars", "sqm", [row("Face 1", 1, Ltot, null, H), row("Pillar projections", nP, Math.max(am - tm, 0), null, H)], [CPWD(), "13.4.2"]));
    qty.push(Q("15 mm cement plaster 1:6 on rough side of wall & pillars", "sqm", [row("Face 2", 1, Ltot, null, H), row("Pillar projections", nP, Math.max(am - tm, 0), null, H)], [CPWD(), "13.5.2"]));
    qty.push(Q("Finishing walls with water-proofing cement paint (two coats, new work)", "sqm", [row("Both faces", 2, Ltot, null, H), row("Pillar projections", 2 * nP, Math.max(am - tm, 0), null, H)], [CPWD(), "13.44.1"]));
    if (cope) qty.push(Q("Cement concrete 1:2:4 in coping 75 mm with weather slope & throating", "cum", [row("Coping", 1, Ltot, tm + 0.05, 0.075)], [CPWD(), "4.2.3"]));
    if (hasBarb) {
      var strands = /Y-angles/.test(barb) ? 8 : 4, hb = /Y-angles/.test(barb) ? 0.6 : 0.45;
      qty.push(Q("Fencing with angle iron posts & G.I. barbed wire (" + strands + " strands + 2 diagonals per panel) – wire length", "metre",
        [row("Strands", strands, Ltot), row("Diagonals", 2 * nPan, Math.sqrt(s * s + hb * hb))], [CPWD(), "16.18.1"]));
      qty.push(Q("MS angle 50×50×6 " + (/Y-angles/.test(barb) ? "Y-type" : "straight") + " barbed-wire posts grouted in pillar tops", "kg", [row("Posts (kg/m 4.5)", nP, /Y-angles/.test(barb) ? 2 * 0.65 + 0.45 : 0.45 + 0.45, 4.5)], null, 115, "Non-SOR – structural steel item with painting"));
    }
    var exc = nP * (Lfm + 2 * work) * (Lfm + 2 * work) * (df + 0.1), str = nP * ((Lfm + 0.1) * (Lfm + 0.1) * 0.1 + Lfm * Lfm * tfm + am * bm * Math.max(df - tfm, 0));
    qty.push(Q("Filling available excavated earth in trenches / pits", "cum", [row("Pillar pits", 1, Math.max(exc - str, 0)), row("Plinth beam trench", 1, Math.max(lenPB, 0), 0.3, pbBelow)], [CPWD(), "2.25"]));
    // ---------------------------------------------------------------- drawing
    var sheet = bwDrawing(inp, { H: H, s: s, t: t, df: df, pl: pl, ft: ft, pbB: pbB, pbD: pbD, nPB: nPB, dPB: dPB, stS: stS, hasBarb: hasBarb, barb: barb, cope: cope, cover: cover });
    var summary = { "Wall": G(t) + " mm brick in CM " + (/1:4/.test(String(inp.mortar)) ? "1:4" : "1:6") + ", " + F(H, ".2f") + " m high, pillars @ " + F(s, ".2f") + " m (" + nP + " nos for " + G(Ltot) + " m)",
      "Wind": "pd = " + F(pd, ".3f") + " kN/m², pw = " + F(pw, ".3f") + " kN/m² (Vb " + G(Vb) + " m/s)",
      "Pillar": G(pl.a) + " × " + G(pl.b) + " mm, " + 2 * pl.nf + "-" + G(pl.dia) + "Ø, ties " + G(pl.tie.dia) + "Ø @ " + G(pl.tie.s),
      "Pillar footing": F(ft.Lf, ".2f") + " × " + F(ft.Lf, ".2f") + " × " + G(ft.tf) + " mm at " + F(df, ".2f") + " m, " + G(ft.bars.dia) + "Ø @ " + G(ft.bars.spacing) + " both ways",
      "Plinth beam": G(pbB) + " × " + G(pbD) + ", " + nPB + "-" + G(dPB) + "Ø top & bottom, 8Ø @ " + G(stS),
      "Panel check": "fh = " + F(pnl2.fh, ".3f") + ", fv = " + F(pnl2.fv, ".3f") + " N/mm²", "Max utilisation": F(c.max_utilisation, ".2f") };
    var refs = ["IS 875 (Part 3):2015 – Wind loads", "IS 1905:1987 – Structural use of unreinforced masonry", "IS 1904:1986 – Foundations (25 % SBC increase for wind)",
      "CPWD type designs for compound walls"].concat(RCC_REFS);
    return C.DesignResult({ module: "boundary_wall", title: "Boundary / compound wall", inputs: inp, calc: c, summary: summary, drawings: [sheet],
      quantities: qty, bbs: bbs, tables: {}, references: refs });
  }
  M.run_boundary = run_boundary;

  function bwDrawing(inp, o) {
    var D_ = DR(), H = o.H * 1000, s = o.s * 1000, t = o.t, df = o.df * 1000, a = o.pl.a, b = o.pl.b, Lf = o.ft.Lf * 1000, tf = o.ft.tf, pbD = o.pbD, pbB = o.pbB;
    var hb = o.hasBarb ? (/Y-angles/.test(o.barb) ? 600 : 450) : 0;
    // elevation of two panels
    var e = new D_.View("Elevation (two panels)");
    for (var i = 0; i < 3; i++) {
      var x = i * s;
      e.rect(x - b / 2, -(df - tf), b, H + df - tf, "OUTLINE", "concrete");
      e.rect(x - Lf / 2, -df, Lf, tf, "OUTLINE", "concrete");
      e.rect(x - Lf / 2 - 50, -df - 100, Lf + 100, 100, "CONCRETE");
      if (hb) { e.line(x, H, x, H + hb, "STEEL"); }
    }
    for (var j = 0; j < 2; j++) {
      var x0 = j * s + b / 2, w = s - b;
      e.rect(x0, 150 - pbD, w, pbD, "OUTLINE", "concrete");
      e.rect(x0, 150, w, H - 150 - (o.cope ? 75 : 0), "OUTLINE");
      for (var k = 1; k < 8; k++) e.line(x0, 150 + k * (H - 150) / 8, x0 + w, 150 + k * (H - 150) / 8, "THIN");
      if (o.cope) e.rect(x0, H - 75, w, 75, "OUTLINE", "concrete");
      if (hb) for (var q = 1; q <= 4; q++) e.line(j * s, H + q * hb / 4, (j + 1) * s, H + q * hb / 4, "STEEL");
    }
    e.line(-s * 0.4, 0, 2.4 * s, 0, "SOIL"); e.text(2.4 * s, 60, "GL", 2.2, { anchor: "end" });
    e.dim(0, -df - 100, s, -df - 100, 10, "PILLARS @ " + F(s, ",.0f") + " c/c");
    e.dim(2 * s + Lf / 2 + 100, 0, 2 * s + Lf / 2 + 100, H, -8);
    e.dim(2 * s + Lf / 2 + 100, -df, 2 * s + Lf / 2 + 100, 0, -8);
    if (hb) e.text(s, H + hb + 150, (/Y-angles/.test(o.barb) ? "Y-angle " : "Angle ") + "posts with G.I. barbed wire", 2.2, { anchor: "middle" });
    // section through the pillar
    var sv = new D_.View("Section through pillar & footing");
    sv.rect(-Lf / 2 - 50, -df - 100, Lf + 100, 100, "CONCRETE");
    sv.rect(-Lf / 2, -df, Lf, tf, "OUTLINE", "concrete");
    sv.rect(-a / 2, -df + tf, a, H + df - tf, "OUTLINE", "concrete");
    sv.line(-Lf, 0, Lf, 0, "SOIL");
    var cv = o.cover, yb = -df + 50 + o.ft.bars.dia;
    sv.poly([[-Lf / 2 + 50, -df + tf - 50], [-Lf / 2 + 50, yb], [Lf / 2 - 50, yb], [Lf / 2 - 50, -df + tf - 50]], false, "REBAR");
    [-1, 1].forEach(function (sg) { var xb = sg * (a / 2 - cv - 10); sv.poly([[xb, H - 40], [xb, yb + 20], [xb + sg * 300, yb + 20]], false, "REBAR"); });
    for (var n = 0; n < 8; n++) sv.line(-a / 2 + cv, -df + tf + 100 + n * (H + df - tf - 200) / 7, a / 2 - cv, -df + tf + 100 + n * (H + df - tf - 200) / 7, "REBAR");
    sv.text(a / 2 + 150, H * 0.6, 2 * o.pl.nf + "-" + G(o.pl.dia) + "Ø, ties " + G(o.pl.tie.dia) + "Ø @ " + G(o.pl.tie.s), 2.2);
    sv.text(0, -df - 450, "Footing " + F(Lf, ",.0f") + " sq × " + G(tf) + ": " + G(o.ft.bars.dia) + "Ø @ " + G(o.ft.bars.spacing) + " both ways", 2.2, { anchor: "middle" });
    sv.dim(-Lf / 2, -df - 100, Lf / 2, -df - 100, 10);
    sv.dim(Lf / 2, -df, Lf / 2, -df + tf, -8);
    sv.dim(-a / 2, H, a / 2, H, -6);
    // pillar & plinth beam cross-sections
    var ps = CM().stirrup_section_view(b, a, cv, [o.pl.nf, o.pl.dia], [o.pl.nf, o.pl.dia], [2, o.pl.tie.dia, o.pl.tie.s], "Pillar cross-section (wind face top / bottom)");
    var pv = CM().stirrup_section_view(pbB, pbD, cv, [o.nPB, o.dPB], [o.nPB, o.dPB], [2, 8, o.stS], "Plinth beam " + G(pbB) + " × " + G(pbD));
    var notes = ["Brick masonry class 7.5 in CM " + (/1:4/.test(String(inp.mortar)) ? "1:4" : "1:6") + ", toothed into the pillars; DPC 40 mm CC 1:2:4 on the plinth beam.",
      "RCC M" + G(num(inp.fck)) + ", Fe" + G(num(inp.fy)) + "; pillar cover " + G(o.cover) + " mm, footing cover 50 mm.",
      "Plaster 12 mm / 15 mm CM 1:6, two coats water-proofing cement paint; " + (o.cope ? "CC 1:2:4 coping with drip." : "no coping."),
      "Movement joints at every 30 m at a pillar; gate pillars to be designed separately."];
    return new D_.Sheet("Boundary / compound wall", "BW-01", [e, sv, ps, pv], notes);
  }

  var BW_PARAMS = [
    P("height", "Wall height above GL", 2.1, "m", { min: 1.0, max: 3.6, step: 0.05, group: "Geometry" }),
    P("spacing", "Pillar spacing (c/c)", 3.0, "m", { min: 1.2, max: 4.5, step: 0.05, group: "Geometry" }),
    P("wall_t", "Wall thickness", BW_T[0], { kind: "select", options: BW_T.slice(), group: "Geometry" }),
    P("mortar", "Mortar", "CM 1:6", { kind: "select", options: ["CM 1:6", "CM 1:4"], group: "Geometry" }),
    P("length", "Total length of wall (quantity)", 100.0, "m", { min: 3, max: 10000, group: "Geometry" }),
    P("barbed", "Barbed-wire fencing on top", BW_BARB[1], { kind: "select", options: BW_BARB.slice(), group: "Geometry" }),
    P("coping", "Coping", BW_COPE[0], { kind: "select", options: BW_COPE.slice(), group: "Geometry" }),
    P("pillar_a", "Pillar size across wall (design starts here)", 230.0, "mm", { min: 230, max: 600, step: 10, group: "Pillar & plinth beam" }),
    P("pillar_b", "Pillar size along wall", 230.0, "mm", { min: 230, max: 450, step: 10, group: "Pillar & plinth beam" }),
    P("pb_b", "Plinth beam width", 230.0, "mm", { min: 150, max: 350, step: 5, group: "Pillar & plinth beam" }),
    P("pb_D", "Plinth beam depth", 300.0, "mm", { min: 200, max: 600, step: 25, group: "Pillar & plinth beam" }),
    P("Vb", "Basic wind speed Vb", 39.0, "m/s", { kind: "select", options: [33.0, 39.0, 44.0, 47.0, 50.0], group: "Wind",
      help: "IS 875-3 Fig. 1: Korba / Gevra / Bilaspur 39 m/s (map); use 44 for exposed hill-top / coastal-type sites (verify)" }),
    P("terrain", "Terrain category", 2, { kind: "select", options: [1, 2, 3, 4], group: "Wind", help: "IS 875-3 cl 6.3.2: 2 = open terrain with scattered obstructions (mine / colony edge)" }),
    P("k1", "Risk coefficient k1", 1.0, { min: 0.7, max: 1.1, step: 0.01, group: "Wind", help: "IS 875-3 Table 1 – 1.0 for permanent walls (boundary walls with 5-year life may use the lower row, verify)" }),
    P("k3", "Topography factor k3", 1.0, { min: 1.0, max: 1.36, step: 0.01, group: "Wind" }),
    P("cf", "Net pressure coefficient Cp,net", 1.2, { min: 1.0, max: 2.5, step: 0.1, group: "Wind" }),
    P("df", "Founding depth of pillar footing below GL", 1.2, "m", { min: 0.6, max: 3.0, step: 0.05, group: "Soil" }),
    P("sbc", "Safe bearing capacity", 150.0, "kN/m²", { min: 50, max: 500, step: 10, group: "Soil" }),
    P("gamma", "Soil unit weight", 18.0, "kN/m³", { min: 15, max: 22, group: "Soil" }),
    P("phi", "Soil angle of friction", 30.0, "°", { min: 20, max: 40, group: "Soil" }),
    P("mu", "Base friction coefficient", 0.5, { min: 0.3, max: 0.7, step: 0.05, group: "Soil" }),
    P("earth_h", "Earth / bund retained against the wall (0 = none)", 0.0, "m", { min: 0, max: 1.5, step: 0.05, group: "Soil", help: "Mining sites: OB bund against the wall – not recommended" })
  ].concat(matParams(40.0, "Moderate", 25.0), [
    P("pillar_n", "Pillar bars – total number (check)", 6, { kind: "int", min: 4, max: 12, group: "My design", modes: CHECK }),
    P("pillar_dia", "Pillar bar dia (check)", 12.0, "mm", { kind: "select", options: [10.0, 12.0, 16.0, 20.0], group: "My design", modes: CHECK }),
    P("ftg_L", "Pillar footing size, square (check)", 1.1, "m", { min: 0.6, max: 3, step: 0.05, group: "My design", modes: CHECK }),
    P("ftg_D", "Pillar footing depth (check)", 450.0, "mm", { min: 200, max: 900, step: 25, group: "My design", modes: CHECK }),
    P("ftg_dia", "Footing bar dia (check)", 12.0, "mm", { kind: "select", options: [10.0, 12.0, 16.0], group: "My design", modes: CHECK }),
    P("ftg_s", "Footing bar spacing (check)", 150.0, "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK }),
    P("pb_n", "Plinth beam bars top (= bottom) (check)", 2, { kind: "int", min: 2, max: 4, group: "My design", modes: CHECK }),
    P("pb_dia", "Plinth beam bar dia (check)", 12.0, "mm", { kind: "select", options: [10.0, 12.0, 16.0], group: "My design", modes: CHECK })
  ]);
  M.BW_PARAMS = BW_PARAMS;
  C.register({ id: "boundary_wall", phase: 1, category: "RCC building", name: "Boundary / compound wall", icon: "🧱",
    description: "Brick compound wall with RCC pillars, plinth beam and pillar footings: IS 875-3 wind, IS 1905 panel check (pillar spacing), " +
      "pillar cantilever design, footing overturning / sliding / bearing, barbed wire & coping options, BBS & CPWD quantities.",
    params: BW_PARAMS, run: run_boundary, references: RCC_REFS });

  /* =========================================================================== 4. COMBINED FOOTING (two columns) */
  /* Exact SFD / BMD of the footing as a beam along L: net upward line load w(x) = (Ru/L)(1 + 12 e (x − L/2)/L²)
     (linear pressure, e = resultant − centroid), column loads spread over the column width. V(x), M(x) from x = 0;
     M > 0 = tension at the bottom (under the columns / cantilevers), M < 0 = tension at the top (between columns). */
  function cfBeam(L, Ru, e, cols) {
    function V(x) {
      var v = Ru / L * (x + 6 * e * (x * x - L * x) / (L * L));
      cols.forEach(function (k) { var a = k.x - k.w / 2; v -= k.Pu * Math.min(Math.max((x - a) / k.w, 0), 1); });
      return v;
    }
    function M(x) {
      var m = Ru / L * (x * x / 2 + 6 * e * (x * x * x / 3 - L * x * x / 2) / (L * L));
      cols.forEach(function (k) { var a = k.x - k.w / 2, b = k.x + k.w / 2; m -= k.Pu * (x <= a ? 0 : x <= b ? (x - a) * (x - a) / (2 * k.w) : x - k.x); });
      return m;
    }
    return { V: V, M: M };
  }
  M.cfBeam = cfBeam;

  function cfAnalyse(c, inp, mode, g, D, cover, given) {
    /* g: {L, B, a (col 1 centre from left edge), s} */
    var fck = num(inp.fck), fy = num(inp.fy), sbc = num(inp.sbc), gam = num(inp.gamma), Df = num(inp.df), dt = DT();
    var P1 = num(inp.P1), P2 = num(inp.P2), b1 = num(inp.c1_b), D1 = num(inp.c1_D), b2 = num(inp.c2_b), D2 = num(inp.c2_D);
    var L = g.L, B = g.B, a = g.a, s = g.s, out = { L: L, B: B, a: a, D: D };
    c.section("Size & soil pressure");
    var R_ = c.calc("Total column load (service)", "P", "P1 + P2", "kN", "", { P1: P1, P2: P2 });
    var xr = c.calc("Resultant from column 1", "xr", "P2*s/P", "m", "", { P2: P2, s: s, P: R_ });
    c.let("Footing L × B × D", "", F(L, ".2f") + " × " + F(B, ".2f") + " × " + G(D), "m, mm", "", "column 1 centre " + F(a, ".3f") + " m from the left edge");
    var e = c.calc("Eccentricity of resultant from footing centroid", "e", "a + xr - L/2", "m", "IS 456 cl 34.1 (aim: e ≈ 0, uniform pressure)", { a: R(a, 4), xr: xr, L: L });
    var W = c.calc("Footing + soil above it", "W", "(25*D/1000 + g*(Df - D/1000))*L*B", "kN", "", { D: D, g: gam, Df: Df, L: L, B: B });
    var pmax = c.calc("Max. gross soil pressure (service)", "pmax", "(P + W)/(L*B) + 6*P*abs(e)/(B*L**2)", "kN/m²", "IS 456 cl 34.1", { P: R_, W: W, L: L, B: B, e: R(e, 4) });
    var pmin = c.calc("Min. gross soil pressure (service)", "pmin", "(P + W)/(L*B) - 6*P*abs(e)/(B*L**2)", "kN/m²", "", { P: R_, W: W, L: L, B: B, e: R(e, 4) });
    c.check("Max. soil pressure ≤ SBC", pmax, sbc, { unit: "kN/m²", clause: "IS 1904 / soil report" });
    c.ok("No tension under footing", pmin >= -1e-6, { detail: F(pmin, ".1f") + " kN/m²", clause: "IS 456 cl 34.1", warn_only: true });
    if (num(inp.pl_limit) > 0) c.ok("Property line respected (projection beyond column 1 centre)", a <= num(inp.pl_limit) + 1e-6, { detail: F(a, ".3f") + " ≤ " + F(num(inp.pl_limit), ".3f") + " m", clause: "Site constraint" });
    c.section("Longitudinal analysis (factored, net upward pressure)");
    var Pu1 = 1.5 * P1, Pu2 = 1.5 * P2, Ru = Pu1 + Pu2;
    var wu = c.calc("Net factored upward pressure (mean)", "qu", "1.5*P/(L*B)", "kN/m²", "IS 456 Table 18", { P: R_, L: L, B: B });
    var cols = [{ x: a, w: D1 / 1000, Pu: Pu1, b: b1, D: D1, n: 1 }, { x: a + s, w: D2 / 1000, Pu: Pu2, b: b2, D: D2, n: 2 }];
    var bm = cfBeam(L, Ru, e, cols), xs = [], Vs = [], Ms = [];
    for (var i = 0; i <= 200; i++) { var x = L * i / 200; xs.push(x); Vs.push(bm.V(x)); Ms.push(bm.M(x)); }
    out.xs = xs; out.Vs = Vs; out.Ms = Ms; out.cols = cols;
    var faces = [];
    cols.forEach(function (k) { faces.push(k.x - k.w / 2, k.x + k.w / 2); });
    var outside = function (x) { return !cols.some(function (k) { return x > k.x - k.w / 2 + 1e-9 && x < k.x + k.w / 2 - 1e-9; }); };
    var Mpos = 0, Mneg = 0, xneg = 0;
    xs.concat(faces).forEach(function (x) { if (!outside(x)) return; var m = bm.M(x); if (m > Mpos) Mpos = m; if (m < Mneg) { Mneg = m; xneg = x; } });
    var MfL = bm.M(faces[0]), MfR = bm.M(faces[3]);
    c.calc("Moment at inner face of column 1 (bottom tension under / beyond the column)", "M1f", "Mv", "kN·m", "IS 456 cl 34.2.3.2", { Mv: R(Math.max(bm.M(faces[0]), bm.M(faces[1])), 3) });
    c.calc("Moment at faces of column 2", "M2f", "Mv", "kN·m", "IS 456 cl 34.2.3.2", { Mv: R(Math.max(bm.M(faces[2]), bm.M(faces[3])), 3) });
    var Mup = c.calc("Max. design moment, bottom tension", "Mu+", "Mv", "kN·m", "", "outside the column widths", { Mv: R(Math.max(Mpos, 0), 3) });
    var Mun = c.calc("Max. design moment, top tension (between columns)", "Mu−", "Mv", "kN·m", "", "at x = " + F(xneg, ".2f") + " m", { Mv: R(-Mneg, 3) });
    c.calc("Check: V(L) ≈ 0 and M(L) ≈ 0 (equilibrium)", "V,M(L)", "abs(VL) + abs(ML)", "", "", { VL: R(bm.V(L), 6), ML: R(bm.M(L), 6) });
    out.Mup = Mup; out.Mun = Mun; out.xneg = xneg;
    // depth & longitudinal steel
    c.section("Longitudinal reinforcement");
    var db = D - cover - 8, dtp = D - 50 - 8, dsh0 = Math.min(db, dtp) / 1000;
    // steel for one-way shear at d from the column faces (design mode, up to pt = 0.5 % – beyond that the depth is increased)
    var vreq = { bot: 0, top: 0 };
    if (!given) [faces[0] - dsh0, faces[1] + dsh0, faces[2] - dsh0, faces[3] + dsh0].forEach(function (x) {
      if (x <= 0 || x >= L) return;
      var top = bm.M(x) < 0, dd = top ? dtp : db, tv = Math.abs(bm.V(x)) * 1000 / (B * 1000 * dd), Av = asForShear(tv, dd, D, fck, false);
      if (isFinite(Av) && Av <= 0.005 * 1000 * dd) vreq[top ? "top" : "bot"] = Math.max(vreq[top ? "top" : "bot"], Av);
    });
    var fB = RC().flexure(c, Math.max(Mup, 0.01), B * 1000, db, fck, fy, "slab", D, { tag: "(bottom, along L)" });
    var rB = Math.max(fB.Ast / B, 0.0012 * 1000 * D / 2);
    if (vreq.bot > rB) rB = c.calc("Bottom steel for one-way shear (pt for τc ≥ τv)", "As,v", "As", "mm²/m", "IS 456 Table 19 / cl 34.2.4.1", "no shear links in footings", { As: R(vreq.bot, 1) });
    var bb = stripBars(c, rB, "footing", "main", db, D, given ? given.bot : null, "bottom, along L", { dias: [12, 16, 20, 25], smax: 200, clause: "IS 456 cl 34.3 / 26.5.2.1" });
    var fT = RC().flexure(c, Math.max(Mun, 0.01), B * 1000, dtp, fck, fy, "slab", D, { tag: "(top, along L)" });
    var rT = Math.max(fT.Ast / B, 0.0012 * 1000 * D / 2);
    if (vreq.top > rT) rT = c.calc("Top steel for one-way shear (pt for τc ≥ τv)", "As,v", "As", "mm²/m", "IS 456 Table 19 / cl 34.2.4.1", "no shear links in footings", { As: R(vreq.top, 1) });
    var tb = stripBars(c, rT, "footing", "main", dtp, D, given ? given.top : null, "top, along L", { dias: [12, 16, 20, 25], smax: 200, clause: "IS 456 cl 34.3 / 26.5.2.1" });
    out.bot = bb; out.top = tb; out.okM = fB.ok && fT.ok;
    c.section("One-way shear (IS 456 cl 34.2.4.1(a))");
    var dsh = Math.min(db, dtp) / 1000, vmax = 0;
    [[faces[0] - dsh, "left of column 1"], [faces[1] + dsh, "right of column 1"], [faces[2] - dsh, "left of column 2"], [faces[3] + dsh, "right of column 2"]].forEach(function (p) {
      if (p[0] <= 0 || p[0] >= L) return;
      var Vx = Math.abs(bm.V(p[0])), top = bm.M(p[0]) < 0, st = top ? tb : bb;
      var Vu = c.calc("Shear at d " + p[1], "Vu", "Vv", "kN", "", "x = " + F(p[0], ".3f") + " m; tension " + (top ? "top" : "bottom"), { Vv: R(Vx, 3) });
      RC().shear(c, Vu, B * 1000, top ? dtp : db, 100 * st.Ast_prov / (1000 * (top ? dtp : db)), fck, fy, "footing", D, { tag: "(" + p[1] + ")" });
      vmax = Math.max(vmax, Vx);
    });
    c.section("Punching shear (IS 456 cl 31.6)");
    var d = (db + dtp) / 2;
    cols.forEach(function (k) {
      var x0 = Math.max(k.x - (k.w + d / 1000) / 2, 0), x1 = Math.min(k.x + (k.w + d / 1000) / 2, L), yh = Math.min((k.b + d) / 2000, B / 2);
      var sides = (x0 > 1e-9 ? 2 * yh : 0) + (x1 < L - 1e-9 ? 2 * yh : 0) + ((k.b + d) / 2000 < B / 2 ? 2 * (x1 - x0) : 0);
      var b0 = c.calc("Critical perimeter at d/2 – column " + k.n, "b0", "u", "m", "IS 456 cl 31.6.1", sides < 2 * (x1 - x0 + 2 * yh) - 1e-9 ? "edge side(s) of the footing excluded" : "", { u: R(sides, 4) });
      if (b0 <= 1e-6) { c.info("Punching – column " + k.n, "critical section falls outside the footing – one-way shear governs", "IS 456 cl 31.6"); return; }
      var Vp = c.calc("Punching force – column " + k.n, "Vp", "Pu - qu*Ae", "kN", "", { Pu: R(k.Pu, 2), qu: R(wu, 3), Ae: R((x1 - x0) * 2 * yh, 4) });
      var tvp = c.calc("Punching shear stress – column " + k.n, "τv", "Vp/(b0*d)", "N/mm²", "IS 456 cl 31.6.2", { Vp: Vp, b0: b0, d: R(d, 1) });
      var tcp = c.calc("Permissible punching stress – column " + k.n, "ks·τc", "min(0.5 + bc, 1)*0.25*sqrt(fck)", "N/mm²", "IS 456 cl 31.6.3.1", { bc: R(Math.min(k.b, k.D) / Math.max(k.b, k.D), 3), fck: fck });
      c.check("Punching shear – column " + k.n, tvp, tcp, { unit: "N/mm²", clause: "IS 456 cl 31.6.3" });
    });
    c.section("Transverse beams under the columns");
    var tr = [];
    cols.forEach(function (k) {
      var x0 = Math.max(k.x - k.w / 2 - 0.75 * db / 1000, 0), x1 = Math.min(k.x + k.w / 2 + 0.75 * db / 1000, L), ws = x1 - x0;
      var wsv = c.calc("Width of transverse strip – column " + k.n, "bs", "x1 - x0", "m", "column width + 0.75 d each side (within the footing) – Krishna Raju / Varghese practice", { x1: R(x1, 4), x0: R(x0, 4) });
      var cant = (B - k.b / 1000) / 2;
      var Mt = c.calc("Transverse moment at column face – column " + k.n, "Mut", "Pu/B*p**2/2", "kN·m", "IS 456 cl 34.2.3.1", { Pu: R(k.Pu, 2), B: B, p: R(cant, 4) });
      var ft = RC().flexure(c, Math.max(Mt, 0.01), wsv * 1000, db - 16, fck, fy, "slab", D, { tag: "(transverse, column " + k.n + ")" });
      var tbars = stripBars(c, Math.max(ft.Ast / wsv, 0.0012 * 1000 * D / 2), "footing", "main", db - 16, D, given ? given.tr : null, "transverse under column " + k.n, { dias: [12, 16, 20, 25], smax: 200 });
      var Vt = c.calc("Transverse one-way shear at d from column face – column " + k.n, "Vut", "Pu/B*max(p - d/1000, 0)", "kN", "IS 456 cl 34.2.4.1(a)", { Pu: R(k.Pu, 2), B: B, p: R(cant, 4), d: R(db - 16, 1) });
      RC().shear(c, Vt, wsv * 1000, db - 16, 100 * tbars.Ast_prov / (1000 * (db - 16)), fck, fy, "footing", D, { tag: "(transverse, column " + k.n + ")" });
      var anc = (cant * 1000 - 50) + Math.max(D - 100 - 2 * tbars.dia, 0);
      c.check("Anchorage of transverse bars – column " + k.n, anc, BB().Ld(tbars.dia, fck, fy), { unit: "mm", clause: "IS 456 cl 34.2.4.3", mode: ">=", note: "projection − cover + 90° leg" });
      tr.push({ x0: x0, x1: x1, w: wsv, bars: tbars, Mt: Mt, ok: ft.ok });
    });
    out.tr = tr;
    var dist = stripBars(c, 0.0012 * 1000 * D / 2, "footing", "main", db - 16, D, null, "transverse outside the strips (min. 0.12 %/2)", { dias: [10, 12, 16], smax: 250 });
    var topT = stripBars(c, 0.0012 * 1000 * D / 2, "footing", "main", dtp - 12, D, null, "top transverse (distribution)", { dias: [10, 12], smax: 250 });
    out.dist = dist; out.topT = topT;
    c.section("Development & bearing");
    [[MfL, a - D1 / 2000, "left"], [MfR, L - a - s - D2 / 2000, "right"]].forEach(function (p) {
      if (p[0] <= 0.05 * Math.max(Mup, 1)) return;
      var avail = p[1] * 1000 - 50 + Math.max(D - 100 - 2 * bb.dia, 0);
      c.check("Anchorage of bottom bars beyond the " + p[2] + " column face", avail, BB().Ld(bb.dia, fck, fy), { unit: "mm", clause: "IS 456 cl 34.2.4.3 / 26.2.1", mode: ">=", note: "projection − cover + 90° leg" });
    });
    var Ltop = Math.min(xneg, L - xneg) * 1000 - 50;
    c.check("Top bars: length beyond max. hogging section ≥ Ld", Ltop, BB().Ld(tb.dia, fck, fy), { unit: "mm", clause: "IS 456 cl 26.2.1", mode: ">=" });
    cols.forEach(function (k) {
      var X = Math.min(k.x + k.w / 2 + 2 * D / 1000, L) - Math.max(k.x - k.w / 2 - 2 * D / 1000, 0), Y = Math.min(k.b / 1000 + 4 * D / 1000, B);
      var r = Math.min(Math.sqrt(X * Y / (k.w * k.b / 1000)), 2);
      var fb = c.calc("Permissible bearing at column " + k.n + " base", "fbr", "0.45*fck*r", "N/mm²", "IS 456 cl 34.4", "√(A1/A2) ≤ 2, A1 = frustum at 1:2 within the footing", { fck: fck, r: R(r, 3) });
      c.ok("Bearing at column " + k.n + " base: Pu/A ≤ 0.45 fck √(A1/A2)", k.Pu * 1000 / (k.b * k.D) <= fb + 1e-9, { detail: F(k.Pu * 1000 / (k.b * k.D), ".2f") + " ≤ " + F(fb, ".2f") + " N/mm² (else dowels for the excess)", clause: "IS 456 cl 34.4", warn_only: true });
    });
    if (dt) dt.site_checks(c, "footing", fck, cover);
    return out;
  }
  M.cfAnalyse = cfAnalyse;

  function run_combined(inp, mode) {
    var c = new C.Calc("Combined footing (two columns)");
    var fck = num(inp.fck), fy = num(inp.fy), sbc = num(inp.sbc), gam = num(inp.gamma), Df = num(inp.df);
    var cover = coverAdopt(c, inp, mode, "footing");
    var P1 = num(inp.P1), P2 = num(inp.P2), s = num(inp.s), D1 = num(inp.c1_D), D2 = num(inp.c2_D), b1 = num(inp.c1_b), b2 = num(inp.c2_b), lim = num(inp.pl_limit);
    var Rr = P1 + P2, xr = P2 * s / Rr, a, L, B, D, given = null;
    function sizeB(L, a, D) {
      var e = a + xr - L / 2, Bv = Math.max(ceil_to(Math.max(b1, b2) / 1000 + 0.3, 0.05), 1.0);
      for (var i = 0; i < 400; i++) { var W = (25 * D / 1000 + gam * (Df - D / 1000)) * L * Bv; if ((Rr + W) / (L * Bv) + 6 * Rr * Math.abs(e) / (Bv * L * L) <= sbc) break; Bv = R(Bv + 0.05, 2); }
      return Bv;
    }
    if (mode === "check") {
      L = num(inp.L_chk); B = num(inp.B_chk); D = num(inp.D_chk); a = num(inp.a_chk);
      given = { bot: [num(inp.bot_dia), num(inp.bot_s)], top: [num(inp.top_dia), num(inp.top_s)], tr: [num(inp.tr_dia), num(inp.tr_s)] };
    } else {
      // projection on the lighter column's side = preferred value, the other side follows from e = 0 (resultant at the centroid)
      var aP = ceil_to(Math.max(D1 / 2000 + 0.3, 0.2 * s), 0.05), cP = ceil_to(Math.max(D2 / 2000 + 0.3, 0.2 * s), 0.05);
      if (lim > 0) a = Math.max(lim, D1 / 2000);
      else if (P1 > P2) a = Math.max(R(s + cP - 2 * xr, 3), aP);
      else a = aP;
      L = R(2 * (a + xr), 2);
      var cR = L - a - s;
      if (cR < D2 / 2000 + 0.15) { L = R(a + s + D2 / 2000 + 0.15, 2); c.warn("Resultant not at the centroid", "Column 2 needs a minimum projection – pressure is not uniform (consider a strap / trapezoidal footing)", "IS 456 cl 34.1"); }
      D = mode === "thumb" ? Math.max(300, ceil_to(s * 1000 / 6, 50)) : 300;
      if (mode === "thumb") c.info("Thumb rules", "L = 2(a + x̄) so the resultant is at the centroid; D ≈ c/c spacing / 6 (≥ 300 mm); B from SBC", "Krishna Raju / Varghese");
      B = sizeB(L, a, D);
      if (mode === "design") for (var it = 0; it < 60; it++) {
        var sc = new C.Calc("s");
        cfAnalyse(sc, inp, mode, { L: L, B: B, a: a, s: s }, D, cover, null);
        var f = sc.failures.filter(function (x) { return !/Property line/.test(x.label); });
        if (!f.length) break;
        D += 50; B = sizeB(L, a, D);
      }
    }
    var o = cfAnalyse(c, inp, mode, { L: L, B: B, a: a, s: s }, D, cover, given);
    c.thumb("Footing area", 1.1 * Rr / sbc, L * B, "m²", "1.1 × (P1 + P2) / SBC", "Practice");
    c.thumb("Footing depth", Math.max(300, s * 1000 / 6), D, "mm", "≈ column spacing / 6", "Practice");
    c.thumb("Steel in combined footing", 80, 0, "kg/m³", "≈ 70–100 kg/m³", "Estimator practice");
    c.miss("Column moments (wind / seismic / frame action) not included – they shift the resultant; check with the governing combination", "IS 456 cl 34", "Important");
    c.miss("Column starter bars: Ld into the footing, lap above it (IS 456 cl 34.4.1); dowels if bearing exceeds 0.45 fck √(A1/A2)", "IS 456 cl 34.4", "Important");
    c.miss("Settlement / soil investigation at founding depth", "IS 1904 / IS 8009", "Important");
    // ---------------------------------------------------------------- BBS
    var B_ = BB(), nos = Math.max(1, Math.trunc(num(inp.nos))), cv = cover, bbs = [];
    var legB = Math.min(B_.leg(o.bot.dia, B_.cfg.ftg_leg_min), D - 2 * cv), legT = Math.min(B_.leg(o.top.dia, B_.cfg.ftg_leg_min), D - 2 * cv);
    bbs.push(B_.row("Combined footing", "F1", o.bot.dia, "U (90° legs up)", B_.count(B * 1000, o.bot.spacing, cv) * nos, B_.stock(B_.ubar(o.bot.dia, L * 1000 - 2 * cv, legB), o.bot.dia, fck, fy), "bottom, along L @ " + G(o.bot.spacing)));
    bbs.push(B_.row("Combined footing", "F2", o.top.dia, "U (90° legs down)", B_.count(B * 1000, o.top.spacing, 50) * nos, B_.stock(B_.ubar(o.top.dia, L * 1000 - 2 * cv, legT), o.top.dia, fck, fy), "top, along L @ " + G(o.top.spacing)));
    var covered = 0;
    o.tr.forEach(function (t, i) {
      var n = Math.max(2, B_.count(t.w * 1000, t.bars.spacing, 0));
      covered += t.w;
      bbs.push(B_.row("Combined footing", "F" + (3 + i), t.bars.dia, "U (90° legs up)", n * nos, B_.ubar(t.bars.dia, B * 1000 - 2 * cv, Math.min(B_.leg(t.bars.dia, B_.cfg.ftg_leg_min), D - 2 * cv)), "transverse strip under column " + (i + 1) + " @ " + G(t.bars.spacing)));
    });
    var rest = Math.max(L - covered, 0);
    bbs.push(B_.row("Combined footing", "F5", o.dist.dia, "straight", Math.max(B_.count(rest * 1000, o.dist.spacing, cv) - 1, 0) * nos, B_.straight(o.dist.dia, B * 1000 - 2 * cv), "transverse bottom outside the strips"));
    bbs.push(B_.row("Combined footing", "F6", o.topT.dia, "straight", B_.count(L * 1000, o.topT.spacing, cv) * nos, B_.straight(o.topT.dia, B * 1000 - 2 * cv), "top transverse distribution"));
    bbs = bbs.filter(function (b) { return b.nos > 0; });
    // ---------------------------------------------------------------- quantities
    var Dm = D / 1000, work = 0.3, ped = Math.max(Df - Dm, 0);
    var qty = [Q("Earth work in excavation for foundations, all kinds of soil", "cum", [row("Combined footing pit", nos, L + 2 * work, B + 2 * work, Df + 0.1)], [CPWD(), "2.8.1"]),
      Q("PCC 1:4:8 below footing", "cum", [row("Levelling course", nos, L + 0.2, B + 0.2, 0.1)], [CPWD(), "4.1.8"]),
      Q("RCC M" + G(fck) + " in footings & column stubs up to plinth (foundation) (excl. steel & shuttering)", "cum",
        [row("Combined footing", nos, L, B, Dm), row("Column 1 stub to GL", nos, b1 / 1000, D1 / 1000, ped), row("Column 2 stub to GL", nos, b2 / 1000, D2 / 1000, ped)], null, CM().rcc_rate(fck)),
      Q("Centering & shuttering for foundations / footings", "sqm", [row("Footing sides", nos, 2 * (L + B), null, Dm), row("Column stubs", nos, 2 * (b1 + D1 + b2 + D2) / 1000, null, ped)], null, CM().RATE.shutter_found),
      steelQty(bbs, "Combined footing")];
    var exc = (L + 2 * work) * (B + 2 * work) * (Df + 0.1), str = (L + 0.2) * (B + 0.2) * 0.1 + L * B * Dm + (b1 * D1 + b2 * D2) / 1e6 * ped;
    qty.push(Q("Filling available excavated earth in trenches / pits", "cum", [row("Backfill", nos, Math.max(exc - str, 0))], [CPWD(), "2.25"]));
    var sheet = cfDrawing(inp, o, cover), dg = cfDiagrams(o);
    var summary = { "Footing": F(L, ".2f") + " × " + F(B, ".2f") + " × " + G(D) + " mm (column 1 at " + F(a, ".2f") + " m from the left edge)",
      "Soil pressure": F(c.steps.filter(function (x) { return x.symbol === "pmax"; })[0].value, ".0f") + " kN/m² (SBC " + G(sbc) + ")",
      "Bottom bars (along L)": G(o.bot.dia) + "Ø @ " + G(o.bot.spacing), "Top bars (along L)": G(o.top.dia) + "Ø @ " + G(o.top.spacing),
      "Transverse under columns": o.tr.map(function (t) { return G(t.bars.dia) + "Ø @ " + G(t.bars.spacing); }).join(" / "),
      "Moments": "Mu+ " + F(o.Mup, ".0f") + ", Mu− " + F(o.Mun, ".0f") + " kN·m", "Max utilisation": F(c.max_utilisation, ".2f") };
    return C.DesignResult({ module: "combined_footing", title: "Combined footing (two columns)", inputs: inp, calc: c, summary: summary, drawings: [sheet, dg],
      quantities: qty, bbs: bbs, tables: { "Shear force & bending moment (factored)": C.table({ "x (m)": o.xs.filter(function (x, i) { return i % 10 === 0; }).map(function (x) { return R(x, 3); }),
        "V (kN)": o.Vs.filter(function (x, i) { return i % 10 === 0; }).map(function (x) { return R(x, 1); }), "M (kN·m)": o.Ms.filter(function (x, i) { return i % 10 === 0; }).map(function (x) { return R(x, 1); }) }) },
      references: RCC_REFS.concat(["IS 1904:1986 – Design & construction of foundations", "N. Krishna Raju – Design of RC structures (combined footings)"]) });
  }
  M.run_combined = run_combined;

  function cfDrawing(inp, o, cover) {
    var D_ = DR(), L = o.L * 1000, B = o.B * 1000, D = o.D, Df = num(inp.df) * 1000;
    var p = new D_.View("Plan");
    p.rect(0, 0, L, B, "OUTLINE");
    o.cols.forEach(function (k) {
      p.rect(k.x * 1000 - k.w * 500, B / 2 - k.b / 2, k.w * 1000, k.b, "CONCRETE", "concrete");
      p.text(k.x * 1000, B + 350, "C" + k.n + " " + G(k.b) + "×" + G(k.D) + ", " + G(num(inp["P" + k.n])) + " kN", 2.0, { anchor: "middle" });
    });
    o.tr.forEach(function (t) { p.rect(t.x0 * 1000, 0, t.w * 1000, B, "HIDDEN"); });
    if (num(inp.pl_limit) > 0) { p.line(o.a * 1000 - num(inp.pl_limit) * 1000, -300, o.a * 1000 - num(inp.pl_limit) * 1000, B + 300, "CENTER"); p.text(o.a * 1000 - num(inp.pl_limit) * 1000 - 60, B + 350, "PROPERTY LINE", 1.8, { anchor: "end" }); }
    for (var k = 0; k < 5; k++) p.line(cover, cover + (B - 2 * cover) * k / 4, L - cover, cover + (B - 2 * cover) * k / 4, "REBAR");
    p.text(L / 2, -900, "Bottom " + G(o.bot.dia) + "Ø @ " + G(o.bot.spacing) + " along L; transverse strips " + o.tr.map(function (t) { return G(t.bars.dia) + "Ø @ " + G(t.bars.spacing); }).join(" / ") + "; elsewhere " + G(o.dist.dia) + "Ø @ " + G(o.dist.spacing), 2.0, { anchor: "middle" });
    p.dim(0, B, L, B, -10); p.dim(L, 0, L, B, -8);
    p.dim(0, 0, o.a * 1000, 0, 6); p.dim(o.a * 1000, 0, (o.a + num(inp.s)) * 1000, 0, 6);
    var s = new D_.View("Longitudinal section");
    s.rect(-100, -100, L + 200, 100, "CONCRETE"); s.rect(0, 0, L, D, "OUTLINE", "concrete");
    o.cols.forEach(function (k) { s.rect(k.x * 1000 - k.w * 500, D, k.w * 1000, Df - D + 300, "OUTLINE", "concrete"); });
    s.line(-500, Df, L + 500, Df, "SOIL"); s.text(L + 500, Df + 60, "GL", 2.0, { anchor: "end" });
    var cv = cover;
    s.poly([[cv, D - cv], [cv, cv + 10], [L - cv, cv + 10], [L - cv, D - cv]], false, "REBAR");
    s.poly([[cv, cv + 60], [cv, D - 60], [L - cv, D - 60], [L - cv, cv + 60]], false, "REBAR");
    s.text((o.a + num(inp.s) / 2) * 1000, D + 150, "TOP " + G(o.top.dia) + "Ø @ " + G(o.top.spacing), 2.0, { anchor: "middle" });
    s.text(L / 2, -450, "BOTTOM " + G(o.bot.dia) + "Ø @ " + G(o.bot.spacing), 2.0, { anchor: "middle" });
    s.dim(0, -100, L, -100, 10); s.dim(L, 0, L, D, -8); s.dim(L + 900, 0, L + 900, Df, -12, F(Df, ",.0f") + " below GL");
    var t = new D_.View("Transverse section under column 2");
    var k2 = o.cols[1], tb = o.tr[1].bars;
    t.rect(0, 0, B, D, "OUTLINE", "concrete"); t.rect(B / 2 - k2.b / 2, D, k2.b, 500, "OUTLINE", "concrete");
    t.poly([[cv, D - cv], [cv, cv], [B - cv, cv], [B - cv, D - cv]], false, "REBAR");
    var nb = Math.max(3, Math.min(10, Math.floor(B / o.bot.spacing)));
    for (var j = 0; j < nb; j++) t.bar_dot(cv + 30 + (B - 2 * cv - 60) * j / (nb - 1), cv + tb.dia + o.bot.dia / 2, o.bot.dia);
    t.text(B / 2, -200, "Transverse " + G(tb.dia) + "Ø @ " + G(tb.spacing) + " in a strip " + F(o.tr[1].w * 1000, ",.0f") + " wide", 2.0, { anchor: "middle" });
    t.dim(0, 0, B, 0, 10); t.dim(B, 0, B, D, -8);
    return new D_.Sheet("Combined footing (two columns)", "CF-01", [p, s, t],
      ["M" + G(num(inp.fck)) + ", Fe" + G(num(inp.fy)) + ", cover " + G(cover) + " mm; PCC 1:4:8 100 mm below the footing.",
        "Bottom bars run full length with 90° legs; top bars full length between the column zones with legs down.",
        "Transverse bars concentrated in strips of column width + 0.75 d each side; column starters per column design."]);
  }
  function cfDiagrams(o) {
    var D_ = DR(), L = o.L * 1000;
    var sfd = D_.diagram_view("Shear force diagram (factored, kN)", o.xs, o.Vs, L, L * 0.12, "kN");
    var bmd = D_.diagram_view("Bending moment diagram (factored, kN·m; + = bottom tension)", o.xs, o.Ms, L, L * 0.12, "kN·m");
    return new D_.Sheet("Combined footing – SFD & BMD", "CF-02", [sfd, bmd], ["Net upward soil pressure with column loads spread over the column widths (exact integration).",
      "Design moments taken at the column faces / outside the column widths (IS 456 cl 34.2.3.2)."]);
  }

  var CF_PARAMS = [
    P("P1", "Column 1 load (service, DL + LL)", 800.0, "kN", { min: 50, max: 10000, group: "Columns" }),
    P("P2", "Column 2 load (service, DL + LL)", 1200.0, "kN", { min: 50, max: 10000, group: "Columns" }),
    P("c1_b", "Column 1 width (across footing)", 400.0, "mm", { min: 200, max: 1200, step: 25, group: "Columns" }),
    P("c1_D", "Column 1 depth (along footing)", 400.0, "mm", { min: 200, max: 1200, step: 25, group: "Columns" }),
    P("c2_b", "Column 2 width (across footing)", 450.0, "mm", { min: 200, max: 1200, step: 25, group: "Columns" }),
    P("c2_D", "Column 2 depth (along footing)", 450.0, "mm", { min: 200, max: 1200, step: 25, group: "Columns" }),
    P("s", "Column centre-to-centre distance", 3.6, "m", { min: 1.0, max: 8.0, step: 0.05, group: "Columns" }),
    P("pl_limit", "Property line: max. projection beyond column 1 centre (0 = no limit)", 0.0, "m", { min: 0, max: 3, step: 0.05, group: "Site" }),
    P("sbc", "Safe bearing capacity", 200.0, "kN/m²", { min: 50, max: 800, step: 10, group: "Soil" }),
    P("df", "Founding depth below GL", 1.5, "m", { min: 0.8, max: 5, step: 0.1, group: "Soil" }),
    P("gamma", "Soil unit weight (backfill on footing)", 18.0, "kN/m³", { min: 15, max: 22, group: "Soil" }),
    P("nos", "Number of identical footings (quantity)", 1, { kind: "int", min: 1, max: 200, group: "Quantity" })
  ].concat(matParams(50.0, "Moderate", 25.0), [
    P("L_chk", "Length L (check)", 5.82, "m", { min: 1.5, max: 20, step: 0.05, group: "My design", modes: CHECK }),
    P("B_chk", "Width B (check)", 2.1, "m", { min: 0.8, max: 8, step: 0.05, group: "My design", modes: CHECK }),
    P("D_chk", "Depth D (check)", 750.0, "mm", { min: 300, max: 2000, step: 25, group: "My design", modes: CHECK }),
    P("a_chk", "Column 1 centre from left edge (check)", 0.75, "m", { min: 0.1, max: 5, step: 0.05, group: "My design", modes: CHECK }),
    P("bot_dia", "Bottom bars along L – dia (check)", 12.0, "mm", { kind: "select", options: [12.0, 16.0, 20.0, 25.0], group: "My design", modes: CHECK }),
    P("bot_s", "Bottom bars along L – spacing (check)", 125.0, "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK }),
    P("top_dia", "Top bars along L – dia (check)", 20.0, "mm", { kind: "select", options: [12.0, 16.0, 20.0, 25.0], group: "My design", modes: CHECK }),
    P("top_s", "Top bars along L – spacing (check)", 150.0, "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK }),
    P("tr_dia", "Transverse bars under columns – dia (check)", 16.0, "mm", { kind: "select", options: [12.0, 16.0, 20.0, 25.0], group: "My design", modes: CHECK }),
    P("tr_s", "Transverse bars – spacing (check)", 150.0, "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK })
  ]);
  M.CF_PARAMS = CF_PARAMS;
  C.register({ id: "combined_footing", phase: 1, category: "RCC building", name: "Combined footing (two columns)", icon: "▭",
    description: "Rectangular combined footing: resultant at the centroid (property-line limit), exact SFD / BMD, bottom & top longitudinal steel, " +
      "transverse strips under the columns, one-way & punching shear, development, column bearing, BBS & quantities.",
    params: CF_PARAMS, run: run_combined, references: RCC_REFS, modes: ["design", "check", "thumb"] });
})();
