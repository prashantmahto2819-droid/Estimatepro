/* Design Studio — rcc (port of civilest/design/rcc.py).
   IS 456:2000 limit-state design functions (all record their working in a `Calc`).
   Units inside: N, mm (stresses N/mm²); loads/moments passed in kN, kN·m. */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var C = DS.core;
  var MT = DS.materials;
  var RC = DS.rcc = {};
  function kw(args, names, defs, nreq) { return MT._kw(args, names, defs, nreq); }
  function tg(tag) { return (" " + tag).replace(/\s+$/, ""); }   // f" {tag}".rstrip()
  var R = C.pyround, F = C.pyfmt;
  var bar_area = MT.bar_area;

  // re-exported names (Python module attributes from its imports)
  RC.Calc = C.Calc; RC.ceil_to = C.ceil_to; RC.floor_to = C.floor_to;
  RC.BAR_DIAS = MT.BAR_DIAS; RC.EXPOSURE = MT.EXPOSURE; RC.bar_area = MT.bar_area; RC.k_slab = MT.k_slab;
  RC.mu_lim_coeff = MT.mu_lim_coeff; RC.steel_stress = MT.steel_stress; RC.tau_bd = MT.tau_bd; RC.tau_c = MT.tau_c;
  RC.tau_c_max = MT.tau_c_max; RC.xu_max_ratio = MT.xu_max_ratio;

  /* =========================================================================== flexure */
  /* flexure(c, Mu, b, d, fck, fy, member = "beam", D = null, d_dash = 50, tag = ""[, opts])
     → {Asc, ok, Mlim, Ast, Ast_calc, Amin, pt}. member "beam" (doubly reinforced allowed) | "slab". */
  RC.flexure = function () {
    var p = kw(arguments, ["c", "Mu", "b", "d", "fck", "fy", "member", "D", "d_dash", "tag"],
      { member: "beam", D: null, d_dash: 50.0, tag: "" }, 6);
    var c = p.c, b = p.b, d = p.d, fck = p.fck, fy = p.fy, member = p.member, t = tg(p.tag);
    var Mu = Math.abs(p.Mu);
    var k = MT.mu_lim_coeff(fy);
    var Mlim = c.calc("Limiting moment" + t, "Mu,lim", "kcoef*fck*b*d**2/1e6", "kN·m", "IS 456 Annex G-1.1(c)",
      { kcoef: R(k, 4), fck: fck, b: b, d: d });
    var out = { Asc: 0.0, ok: true, Mlim: Mlim };
    var Ast;
    if (Mu <= Mlim) {
      Ast = c.calc("Tension steel required" + t, "Ast,req",
        "0.5*fck/fy*(1 - sqrt(1 - 4.6*Mu*1e6/(fck*b*d**2)))*b*d", "mm²", "IS 456 Annex G-1.1(b)",
        { fck: fck, fy: fy, Mu: Mu, b: b, d: d });
    } else {
      if (member !== "beam") {
        c.check("Mu ≤ Mu,lim" + t + " (singly reinforced)", Mu, Mlim, { unit: "kN·m", clause: "IS 456 Annex G-1.1",
          note: "Increase thickness" });
        Ast = 0.5 * fck / fy * b * d;  // placeholder capped value
        out.ok = false;
      } else {
        c.info("Doubly reinforced" + t, "Mu = " + F(Mu, ".1f") + " > Mu,lim = " + F(Mlim, ".1f") + " kN·m", "IS 456 Annex G-1.2");
        var xu = MT.xu_max_ratio(fy) * d;
        var esc = 0.0035 * (xu - p.d_dash) / xu;
        var fsc = Math.min(Math.abs(MT.steel_stress(esc, fy)), 0.87 * fy);
        var fcc = 0.446 * fck;
        var Asc = c.calc("Compression steel" + t, "Asc", "(Mu - Mlim)*1e6/((fsc - fcc)*(d - dd))", "mm²",
          "IS 456 Annex G-1.2", { Mu: Mu, Mlim: Mlim, fsc: R(fsc, 1), fcc: R(fcc, 2), d: d, dd: p.d_dash });
        var Ast1 = Mlim * 1e6 / (0.87 * fy * d * (1 - 0.416 * MT.xu_max_ratio(fy)));
        Ast = c.calc("Tension steel" + t, "Ast", "Ast1 + Asc*fsc/(0.87*fy)", "mm²", "IS 456 Annex G-1.2",
          { Ast1: R(Ast1, 1), Asc: R(Asc, 1), fsc: R(fsc, 1), fy: fy });
        out.Asc = Asc;
      }
    }
    // minimum / maximum steel
    var Amin;
    if (member === "beam") {
      Amin = c.calc("Minimum tension steel" + t, "Ast,min", "0.85*b*d/fy", "mm²", "IS 456 cl 26.5.1.1(a)",
        { b: b, d: d, fy: fy });
    } else {
      var DD = p.D || d + 30;
      Amin = c.calc("Minimum steel" + t, "Ast,min", "(0.0012 if fy > 250 else 0.0015)*b*D", "mm²",
        "IS 456 cl 26.5.2.1", { b: b, D: DD, fy: fy });
    }
    out.Ast = Math.max(Ast, Amin);
    out.Ast_calc = Ast;
    out.Amin = Amin;
    out.pt = 100 * out.Ast / (b * d);
    return out;
  };

  /* moment_capacity(Ast, b, d, fck, fy) → Mu (kN·m), capped at Mu,lim */
  RC.moment_capacity = function (Ast, b, d, fck, fy) {
    var xu = 0.87 * fy * Ast / (0.36 * fck * b);
    if (xu >= MT.xu_max_ratio(fy) * d) return MT.mu_lim_coeff(fy) * fck * b * d * d / 1e6;
    return 0.87 * fy * Ast * (d - 0.416 * xu) / 1e6;
  };

  /* =========================================================================== bar selection */
  /* slab_bars(Ast, d, D, main = true, dias = [8,10,12,16,20,25], min_spacing = 75, prefer = null, smax = null[, opts])
     → {dia, spacing, Ast_prov, smax} — bars per metre width for slabs / walls. */
  RC.slab_bars = function () {
    var p = kw(arguments, ["Ast", "d", "D", "main", "dias", "min_spacing", "prefer", "smax", "rule"],
      { main: true, dias: [8, 10, 12, 16, 20, 25], min_spacing: 75.0, prefer: null, smax: null, rule: null }, 3);
    var Ast = p.Ast, d = p.d, min_spacing = p.min_spacing;
    // opt-in detailing rules (DS.detailing): rule = {member, role, main_dia, prefer: [Ø…], ...}
    if (p.rule && DS.detailing)
      return DS.detailing.pick_bars(Ast, p.rule.member, p.rule.role || (p.main ? "main" : "dist"),
        Object.assign({ d: d, D: p.D, dias: p.prefer ? [p.prefer] : p.dias, smax: p.smax, min_spacing: min_spacing }, p.rule));
    var cap = p.main ? Math.min(3 * d, 300.0) : Math.min(5 * d, 450.0);
    var smax = p.smax ? Math.min(cap, p.smax) : cap;
    var options = p.prefer ? [p.prefer] : p.dias.slice();
    var best = null;
    options.forEach(function (dia) {
      var a = bar_area(dia);
      var s = C.floor_to(Math.min(1000 * a / Math.max(Ast, 1e-6), smax), 10);
      if (s < min_spacing) return;
      var prov = 1000 * a / s;
      var cand = [prov, dia, s];
      if (best === null || prov < best[0] - 1e-9) best = cand;
    });
    if (best === null) {
      var dia = options[options.length - 1];
      var s = min_spacing;
      best = [1000 * bar_area(dia) / s, dia, s];
    }
    return { dia: best[1], spacing: best[2], Ast_prov: best[0], smax: smax };
  };

  /* beam_bars(Ast, b, cover, stirrup = 8, dias = [12,16,20,25,32], max_layers = 2, agg = 20[, opts])
     → {n, dia, Ast_prov, layers, per_layer} */
  RC.beam_bars = function () {
    var p = kw(arguments, ["Ast", "b", "cover", "stirrup", "dias", "max_layers", "agg", "rule"],
      { stirrup: 8.0, dias: [12, 16, 20, 25, 32], max_layers: 2, agg: 20.0, rule: null }, 3);
    var Ast = p.Ast, b = p.b, cover = p.cover, stirrup = p.stirrup, dias = p.dias;
    var why = null;
    // opt-in detailing rules: rule = {role: "main" | "hanger", main_dia, prefer: [Ø…]} → filter the candidate Ø
    if (p.rule && DS.detailing) {
      var al = DS.detailing.beam_dias(p.rule.role || "main", dias, p.rule);
      dias = al.dias; why = al.why;
    }
    var best = null, cands = [];
    dias.forEach(function (dia) {
      var n = Math.max(2, Math.ceil(Ast / bar_area(dia) - 1e-9));
      var clear_min = Math.max(dia, p.agg + 5);
      var per_layer = Math.max(2, Math.trunc(Math.floor((b - 2 * cover - 2 * stirrup + clear_min) / (dia + clear_min))));
      var layers = Math.ceil(n / per_layer);
      if (layers > p.max_layers) return;
      var prov = n * bar_area(dia);
      var cand = [prov, layers, n, dia, per_layer];
      cands.push(cand);
      var s0 = layers, s1 = prov * (1 + 0.04 * n);          // prefer one layer, then least steel with fewer bars
      if (best === null) { best = cand; return; }
      var b0 = best[1], b1 = best[0] * (1 + 0.04 * best[2]);
      if (s0 < b0 || (s0 === b0 && s1 < b1)) best = cand;
    });
    // detailing rule: fewer bar sizes per member – take a preferred Ø if same layers and ≤ 25 % more steel
    if (best && p.rule && p.rule.prefer && p.rule.prefer.indexOf(best[3]) < 0 && DS.detailing && DS.detailing.practice()) {
      cands.forEach(function (cd) {
        if (p.rule.prefer.indexOf(cd[3]) >= 0 && cd[1] <= best[1] && cd[2] <= best[2] + 1 && cd[0] <= 1.25 * best[0] &&
          p.rule.prefer.indexOf(best[3]) < 0) best = cd;
      });
      if (why && p.rule.prefer.indexOf(best[3]) >= 0) why = why.concat(["same Ø as the other face (fewer bar sizes)"]);
    }
    if (best === null) {
      var dia = dias[dias.length - 1];
      var n = Math.max(2, Math.ceil(Ast / bar_area(dia)));
      best = [n * bar_area(dia), 3, n, dia, n];
    }
    var out = { n: best[2], dia: best[3], Ast_prov: best[0], layers: best[1], per_layer: best[4] };
    if (why) {
      out.text = C.pystr(out.n) + "-" + F(out.dia, "g") + "Ø (As " + F(out.Ast_prov, ".0f") + " ≥ " + F(Ast, ".0f") + " mm², " +
        C.pystr(out.layers) + " layer" + (out.layers > 1 ? "s" : "") + "): " + why.join("; ") +
        "; clear spacing ≥ max(Ø, agg + 5) (IS 456 cl 26.3.2)";
      out.clause = "IS 456 cl 26.3 / SP 34";
    }
    return out;
  };

  /* bars_text(n, dia) → "4-16Ø" */
  RC.bars_text = function (n, dia) { return C.pystr(n) + "-" + F(dia, "g") + "Ø"; };

  /* =========================================================================== shear */
  /* shear(c, Vu, b, d, pt, fck, fy, member = "beam", D = null, stirrup_dia = 8, legs = 2, tag = ""[, opts])
     → {tv, tc, stirrups: null | [legs, dia, spacing], ok} */
  /* opt-in `strict: "design" | "check"` (beams): a required spacing below the 75 mm practical minimum is not rounded up –
     in design the stirrup Ø / legs are raised until s ≥ 75 mm, otherwise (or in check mode) a FAIL is recorded;
     the unrounded required spacing is returned as out.sv_req. Without it the original behaviour is unchanged. */
  RC.shear = function () {
    var p = kw(arguments, ["c", "Vu", "b", "d", "pt", "fck", "fy", "member", "D", "stirrup_dia", "legs", "tag", "strict"],
      { member: "beam", D: null, stirrup_dia: 8.0, legs: 2, tag: "", strict: null }, 7);
    var c = p.c, b = p.b, d = p.d, pt = p.pt, fck = p.fck, fy = p.fy, member = p.member, t = tg(p.tag);
    var Vu = Math.abs(p.Vu);
    var tv = c.calc("Nominal shear stress" + t, "τv", "Vu*1000/(b*d)", "N/mm²", "IS 456 cl 40.1", { Vu: Vu, b: b, d: d });
    var tc = c.calc("Concrete shear strength" + t, "τc", "tcv", "N/mm²", "IS 456 Table 19",
      "pt = " + F(pt, ".3f") + " %, M" + F(fck, "g"), { tcv: R(MT.tau_c(pt, fck), 3) });
    var tmax = MT.tau_c_max(fck);
    var out = { tv: tv, tc: tc, stirrups: null };
    if (member === "slab" || member === "footing" || member === "wall") {
      var k = member === "slab" ? MT.k_slab(p.D || d + 30) : 1.0;
      if (member === "slab")
        tc = c.calc("Enhanced τc for slab" + t, "k·τc", "k*tc", "N/mm²", "IS 456 cl 40.2.1.1", { k: k, tc: tc });
      var ok = c.check("One-way shear" + t + ": τv ≤ " + (member === "slab" ? "k·" : "") + "τc", tv, tc, { unit: "N/mm²",
        clause: member === "slab" ? "IS 456 cl 40.2" : "IS 456 cl 34.2.4.1",
        note: "no shear reinforcement in slab/footing – increase depth if it fails" });
      out.ok = ok;
      return out;
    }
    c.check("τv ≤ τc,max" + t, tv, tmax, { unit: "N/mm²", clause: "IS 456 Table 20", note: "else revise section" });
    var sv_max = Math.min(0.75 * d, 300.0);
    var Asv = p.legs * bar_area(p.stirrup_dia);
    var sv;
    if (tv <= tc) {
      sv = c.calc("Minimum stirrup spacing" + t, "sv", "min(0.87*fy*Asv/(0.4*b), svmax)", "mm",
        "IS 456 cl 26.5.1.6", { fy: fy, Asv: R(Asv, 1), b: b, svmax: sv_max });
    } else {
      var Vus = c.calc("Shear for stirrups" + t, "Vus", "(tv - tc)*b*d/1000", "kN", "IS 456 cl 40.4", { tv: tv, tc: tc, b: b, d: d });
      sv = c.calc("Stirrup spacing" + t, "sv", "min(0.87*fy*Asv*d/(Vus*1000), 0.87*fy*Asv/(0.4*b), svmax)",
        "mm", "IS 456 cl 40.4(a)", { fy: fy, Asv: R(Asv, 1), d: d, Vus: Vus, b: b, svmax: sv_max });
    }
    var legs = p.legs, sdia = p.stirrup_dia;
    if (p.strict) {
      out.sv_req = sv;
      if (sv < 75 && p.strict === "design") {
        // raise the stirrup Ø (≤ 12) and then the legs (4 legs when b ≥ 300) instead of rounding s up to 75 mm
        var Vus_ = tv > tc ? (tv - tc) * b * d / 1000 : 0, opts = [];
        [2, 4].forEach(function (lg) {
          if (lg === 4 && b < 300) return;
          [8, 10, 12].forEach(function (dd) { if (dd >= p.stirrup_dia && (lg > p.legs || dd > p.stirrup_dia)) opts.push([lg, dd]); });
        });
        opts.sort(function (x, y) { return x[0] * bar_area(x[1]) - y[0] * bar_area(y[1]); });
        var sv_of = function (lg, dd) {
          var A = lg * bar_area(dd);
          return Math.min(Vus_ > 0 ? 0.87 * fy * A * d / (Vus_ * 1000) : Infinity, 0.87 * fy * A / (0.4 * b), sv_max);
        };
        var pick = null;
        for (var oi = 0; oi < opts.length && !pick; oi++) if (sv_of(opts[oi][0], opts[oi][1]) >= 75) pick = opts[oi];
        if (pick) {
          c.info("Stirrups raised" + t, F(p.stirrup_dia, "g") + "Ø × " + C.pystr(p.legs) + " legs would need s = " + F(sv, ".0f") +
            " mm < 75 mm → " + C.pystr(pick[0]) + "L-" + F(pick[1], "g") + "Ø", "Practice: stirrup spacing ≥ 75 mm (concreting)");
          legs = pick[0]; sdia = pick[1];
          sv = c.calc("Stirrup spacing (raised stirrups)" + t, "sv", Vus_ > 0 ?
            "min(0.87*fy*Asv*d/(Vus*1000), 0.87*fy*Asv/(0.4*b), svmax)" : "min(0.87*fy*Asv/(0.4*b), svmax)", "mm",
          "IS 456 cl 40.4(a)", Vus_ > 0 ? { fy: fy, Asv: R(legs * bar_area(sdia), 1), d: d, Vus: Vus_, b: b, svmax: sv_max } :
            { fy: fy, Asv: R(legs * bar_area(sdia), 1), b: b, svmax: sv_max });
          out.sv_req = sv;
        }
      }
      if (out.sv_req < 75)
        c.check("Required stirrup spacing ≥ 75 mm (practical minimum)" + t, out.sv_req, 75, { unit: "mm", clause: "IS 456 cl 40.4",
          mode: ">=", note: p.strict === "design" ? "even 4L-12Ø is not enough – increase the section" : "increase stirrup Ø / legs or the section" });
    }
    var sv_adopt = Math.max(C.floor_to(sv, 25), 75.0);
    c.let("Stirrups adopted" + t, "", C.pystr(legs) + "L-" + F(sdia, "g") + "Ø @ " + F(sv_adopt, "g") + " c/c", "",
      "IS 456 cl 26.5.1.5 (≤ 0.75d, 300)");
    out.stirrups = [legs, sdia, sv_adopt];
    out.ok = tv <= tmax;
    return out;
  };

  /* =========================================================================== serviceability & detailing */
  /* development_length(c, dia, fy, fck, compression = false, tag = ""[, opts]) → Ld (mm) */
  RC.development_length = function () {
    var p = kw(arguments, ["c", "dia", "fy", "fck", "compression", "tag"], { compression: false, tag: "" }, 4);
    var tb = MT.tau_bd(p.fck, true, p.compression);
    return p.c.calc("Development length " + F(p.dia, "g") + "Ø" + (p.tag ? " " + p.tag : ""), "Ld", "dia*0.87*fy/(4*tbd)", "mm",
      "IS 456 cl 26.2.1", { dia: p.dia, fy: p.fy, tbd: R(tb, 2) });
  };

  /* kt_factor(pt, fs) — IS 456 Fig. 4 (fitted), limited to 0.4 … 2.0 */
  RC.kt_factor = function (pt, fs) {
    pt = Math.max(pt, 0.05);
    var val = 1.0 / (0.225 + 0.00322 * fs - 0.625 * Math.log10(1.0 / pt));
    return Math.max(Math.min(val, 2.0), 0.4);
  };

  /* deflection(c, span_mm, d, support, fy, Ast_req, Ast_prov, b, tag = ""[, opts]) → bool
     support: "simply supported" | "continuous" | "cantilever" */
  RC.deflection = function () {
    var p = kw(arguments, ["c", "span_mm", "d", "support", "fy", "Ast_req", "Ast_prov", "b", "tag"], { tag: "" }, 8);
    var c = p.c, span_mm = p.span_mm, d = p.d, support = p.support;
    var BASIC = { "simply supported": 20, "continuous": 26, "cantilever": 7 };
    if (!Object.prototype.hasOwnProperty.call(BASIC, support)) throw new Error("KeyError: " + support);
    var basic = BASIC[support];
    var fs = 0.58 * p.fy * p.Ast_req / Math.max(p.Ast_prov, 1e-6);
    var pt = 100 * p.Ast_prov / (p.b * d);
    var kt = c.calc("Modification factor for tension steel", "kt", "ktv", "", "IS 456 Fig. 4",
      "fs = " + F(fs, ".0f") + " N/mm², pt = " + F(pt, ".3f") + " %", { ktv: R(RC.kt_factor(pt, fs), 3) });
    var allowed = basic * kt * (span_mm > 10000 && support !== "cantilever" ? 10 / Math.max(span_mm / 1000, 10) : 1);
    return c.check("Span / effective depth" + (p.tag ? " " + p.tag : ""), span_mm / d, allowed, { unit: "",
      clause: "IS 456 cl 23.2.1", note: "basic " + C.pystr(basic) + " × kt" });
  };

  /* required_cover(exposure, member = "beam") → mm */
  RC.required_cover = function (exposure, member) {
    var p = kw(arguments, ["exposure", "member"], { member: "beam" }, 1);
    var req = MT.EXPOSURE[p.exposure].cover;
    if (p.member === "footing") req = Math.max(req, 50);
    if (p.member === "column") req = Math.max(req, 40);
    return req;
  };

  /* cover_check(c, exposure, cover, fck, member = "beam"[, opts]) → undefined */
  RC.cover_check = function () {
    var p = kw(arguments, ["c", "exposure", "cover", "fck", "member"], { member: "beam" }, 4);
    var c = p.c, exposure = p.exposure;
    var e = MT.EXPOSURE[exposure];
    var req = e.cover;
    if (p.member === "footing") req = Math.max(req, 50);
    if (p.member === "column") req = Math.max(req, 40);
    c.check("Nominal cover ≥ Table 16 (" + exposure + ")", p.cover, req, { unit: "mm", clause: "IS 456 cl 26.4.2", mode: ">=" });
    c.check("Concrete grade ≥ M" + C.pystr(e.min_grade) + " for " + exposure + " exposure", p.fck, e.min_grade, { unit: "N/mm²",
      clause: "IS 456 Table 5", mode: ">=" });
  };

  /* =========================================================================== column section (strain compatibility) */
  /* column_capacity(P_kN, b, D, bars, fck, fy, n_fibres = 60[, opts]) → Mu (kN·m)
     bars: list of [y_from_compression_face_mm, area_mm²]. Bisection on the neutral-axis depth. */
  RC.column_capacity = function () {
    var p = kw(arguments, ["P_kN", "b", "D", "bars", "fck", "fy", "n_fibres"], { n_fibres: 60 }, 6);
    var b = p.b, D = p.D, bars = p.bars, fck = p.fck, fy = p.fy, n_fibres = p.n_fibres;
    var P = p.P_kN * 1000;

    function forces(xu) {
      // concrete: parabolic–rectangular 0.446 fck, εcu 0.0035 (0.002 at 3D/7 when xu > D)
      var Cc = 0.0, Mc = 0.0, ecu_at;
      if (xu <= D) ecu_at = function (y) { return 0.0035 * (xu - y) / xu; };
      else { var e0 = 0.002; ecu_at = function (y) { return e0 * (xu - y) / (xu - 3 * D / 7); }; }
      var dy = D / n_fibres;
      for (var k = 0; k < n_fibres; k++) {
        var y = (k + 0.5) * dy;
        var e = ecu_at(y);
        if (e <= 0) continue;
        var s = 0.446 * fck * (e >= 0.002 ? 1 : (2 * e / 0.002 - Math.pow(e / 0.002, 2)));
        var f = s * b * dy;
        Cc += f;
        Mc += f * (D / 2 - y);
      }
      var Fs = 0.0, Ms = 0.0;
      for (var i = 0; i < bars.length; i++) {
        var yb = bars[i][0], a = bars[i][1];
        var eb = ecu_at(yb);
        var fs = MT.steel_stress(eb, fy);
        if (eb > 0 && yb < xu) fs -= 0.446 * fck * (eb >= 0.002 ? 1 : (2 * eb / 0.002 - Math.pow(eb / 0.002, 2)));  // displaced concrete
        Fs += fs * a;
        Ms += fs * a * (D / 2 - yb);
      }
      return [Cc + Fs, Mc + Ms];
    }

    var lo = 1e-3 * D, hi = 20 * D;
    var Nlo = forces(lo)[0];
    var Nhi = forces(hi)[0];
    if (P >= Nhi) return 0.0;
    if (P <= Nlo) lo = 1e-6;
    for (var it = 0; it < 80; it++) {
      var mid = (lo + hi) / 2;
      var N = forces(mid)[0];
      if (N > P) hi = mid; else lo = mid;
    }
    var M = forces((lo + hi) / 2)[1];
    return Math.abs(M) / 1e6;
  };

  /* puz(b, D, Asc, fck, fy) → kN, IS 456 cl 39.6 */
  RC.puz = function (b, D, Asc, fck, fy) { return (0.45 * fck * (b * D - Asc) + 0.75 * fy * Asc) / 1000; };

  /* rect_bars(b, D, cover, tie, dia, n) → [about_major, about_minor, pts]
     about_major / about_minor: lists of [y, area]; pts: list of [x, y] */
  RC.rect_bars = function (b, D, cover, tie, dia, n, max_gap) {
    n = Math.max(4, n + (((n % 2) + 2) % 2));
    var edge = cover + tie + dia / 2;
    // distribute: corners + remaining split between the two longer faces, then shorter faces
    var rem = n - 4;
    var per_long = D >= b ? Math.floor(rem / 2) : 0;
    var per_short = Math.floor((rem - 2 * per_long) / 2);
    if (max_gap) {   // opt-in (detailing): first give every face enough bars for c/c ≤ max_gap (IS 456 cl 26.5.3.1(g))
      var nY = Math.max(0, Math.ceil((D - 2 * edge) / max_gap - 1e-9) - 1), nX = Math.max(0, Math.ceil((b - 2 * edge) / max_gap - 1e-9) - 1);
      if (rem >= 2 * (nY + nX)) {
        var extra = Math.floor((rem - 2 * (nY + nX)) / 2);
        per_long = nY + (D >= b ? extra : 0);
        per_short = nX + (D >= b ? 0 : extra);
      }
    }
    var pts = [];
    var xs = [edge, b - edge], ys = [edge, D - edge];
    xs.forEach(function (x) { ys.forEach(function (y) { pts.push([x, y]); }); });
    var k, y, x;
    for (k = 0; k < per_long; k++) {        // along long faces (x = edge and x = b-edge), varying y
      y = edge + (D - 2 * edge) * (k + 1) / (per_long + 1);
      pts.push([edge, y], [b - edge, y]);
    }
    for (k = 0; k < per_short; k++) {
      x = edge + (b - 2 * edge) * (k + 1) / (per_short + 1);
      pts.push([x, edge], [x, D - edge]);
    }
    var a = bar_area(dia);
    var about_major = pts.map(function (q) { return [q[1], a]; });   // bending about axis ∥ b, depth D
    var about_minor = pts.map(function (q) { return [q[0], a]; });   // bending about axis ∥ D, depth b
    return [about_major, about_minor, pts];
  };

  /* =========================================================================== isolated footing */
  /* isolated_footing(c, P, M, Pu, Mu, col_b, col_D, sbc, fck, fy, cover = 50, depth_min = 300, ratio_LB = 1,
                      fixed_size = null, given_D = null, given_bars = null, title = "Footing"[, opts])
     → {L, B, D, d, pmax, pmin, bars_L, bars_B}. fixed_size [L, B] m; given_bars [dia, spacing]. */
  RC.isolated_footing = function () {
    var p = kw(arguments, ["c", "P", "M", "Pu", "Mu", "col_b", "col_D", "sbc", "fck", "fy", "cover", "depth_min",
      "ratio_LB", "fixed_size", "given_D", "given_bars", "title", "rules"],
      { cover: 50.0, depth_min: 300.0, ratio_LB: 1.0, fixed_size: null, given_D: null, given_bars: null, title: "Footing", rules: false }, 10);
    var DT = p.rules ? DS.detailing : null;            // opt-in detailing rules (rcc_footing)
    var c = p.c, P = p.P, M = p.M, Pu = p.Pu, Mu = p.Mu, col_b = p.col_b, col_D = p.col_D, sbc = p.sbc, fck = p.fck,
      fy = p.fy, cover = p.cover, ratio_LB = p.ratio_LB, fixed_size = p.fixed_size, given_D = p.given_D,
      given_bars = p.given_bars, title = p.title;
    function truthySeq(v) { return v != null && v.length > 0; }
    c.section(title + " – size");
    var sw = 0.10, L, B, it;
    if (truthySeq(fixed_size)) {
      L = fixed_size[0]; B = fixed_size[1];
      c.let("Footing size (given)", "L × B", F(L, ".2f") + " × " + F(B, ".2f"), "m");
    } else {
      var Areq = c.calc("Area required (incl. 10 % self-weight)", "Areq", "(1 + sw)*P/sbc", "m²",
        "IS 456 cl 34.1", { sw: sw, P: P, sbc: sbc });
      B = Math.max(C.ceil_to(Math.sqrt(Areq / ratio_LB), 0.1), 1.0);
      L = Math.max(C.ceil_to(B * ratio_LB, 0.1), B);
      for (it = 0; it < 200; it++) {
        var pmax_ = (1 + sw) * P / (L * B) + 6 * Math.abs(M) / (B * L * L);
        var pmin_ = (1 + sw) * P / (L * B) - 6 * Math.abs(M) / (B * L * L);
        if (pmax_ <= sbc && pmin_ >= 0) break;
        if (pmin_ < 0) {                      // eccentricity governs → lengthen in the moment direction
          L = R(L + 0.1, 2);
        } else {
          B = R(B + 0.1, 2);
          L = R(Math.max(L, B * ratio_LB), 2);
        }
      }
      c.let("Footing size adopted", "L × B", F(L, ".2f") + " × " + F(B, ".2f"), "m");
    }
    var pmax = c.calc("Max. gross soil pressure (service)", "pmax", "(1 + sw)*P/(L*B) + 6*M/(B*L**2)", "kN/m²",
      "IS 456 cl 34.1", { sw: sw, P: P, L: L, B: B, M: Math.abs(M) });
    var pmin = c.calc("Min. soil pressure (service)", "pmin", "(1 + sw)*P/(L*B) - 6*M/(B*L**2)", "kN/m²", "",
      { sw: sw, P: P, L: L, B: B, M: Math.abs(M) });
    c.check("Max. pressure ≤ SBC", pmax, sbc, { unit: "kN/m²", clause: "IS 1904 / soil report" });
    c.ok("No tension under footing (pmin ≥ 0)", pmin >= -1e-6, { detail: "pmin = " + F(pmin, ".1f") + " kN/m²",
      clause: "IS 456 cl 34.1", warn_only: true });

    c.section(title + " – depth & reinforcement");
    var qu_max = c.calc("Net factored upward pressure (max)", "qu", "Pu/(L*B) + 6*Mu/(B*L**2)", "kN/m²", "",
      { Pu: Pu, L: L, B: B, Mu: Math.abs(Mu) });
    var a1 = (L * 1000 - col_D) / 2;       // projection along L (mm)
    var a2 = (B * 1000 - col_b) / 2;       // projection along B
    // moment at column face (cl 34.2.3.2), using qu_max conservatively over projection
    var Mu_L = c.calc("Moment at column face (bars along L)", "Mu,L", "qu*B*(a1/1000)**2/2", "kN·m", "IS 456 cl 34.2.3.1",
      { qu: qu_max, B: B, a1: a1 });
    var Mu_B = c.calc("Moment at column face (bars along B)", "Mu,B", "qu*L*(a2/1000)**2/2", "kN·m", "IS 456 cl 34.2.3.1",
      { qu: qu_max, L: L, a2: a2 });
    var dia = truthySeq(given_bars) ? given_bars[0] : 12.0;
    var dmin_rule = DT ? DT.min_dia("footing", "main").dia : 10;   // anchorage of the smallest permitted bar
    // find the smallest depth satisfying bending (singly), one-way and punching shear
    var Dtry = given_D || Math.max(p.depth_min, 300.0);
    var d;
    for (it = 0; it < 80; it++) {
      d = Dtry - cover - dia;
      var dB = d - dia;                       // bars along B lie on top of the bars along L (second layer)
      var dmin_M = Math.sqrt(Math.max(Mu_L * 1e6 / (MT.mu_lim_coeff(fy) * fck * B * 1000), 0));
      var dmin_MB = Math.sqrt(Math.max(Mu_B * 1e6 / (MT.mu_lim_coeff(fy) * fck * L * 1000), 0));
      // one-way shear at d from face, with pt ≈ 0.25 %
      var Vu1_ = qu_max * B * Math.max(a1 - d, 0) / 1000;
      var tv1 = Vu1_ * 1000 / (B * 1000 * d);
      var Vu1b = qu_max * L * Math.max(a2 - dB, 0) / 1000;
      var tv1b = Vu1b * 1000 / (L * 1000 * dB);
      // steel actually needed at this depth → pt for τc (Table 19)
      var _pt = function (Mu_, width_m, dd) {
        var Rr = Mu_ * 1e6 / (width_m * 1000 * dd * dd);
        var disc = Math.max(1 - 4.6 * Rr / fck, 0.0);
        var ast = 0.5 * fck / fy * (1 - Math.sqrt(disc)) * width_m * 1000 * dd;
        return 100 * Math.max(ast, 0.0012 * width_m * 1000 * Dtry) / (width_m * 1000 * dd);
      };
      var tc_L = MT.tau_c(_pt(Mu_L, B, d), fck);
      var tc_B = MT.tau_c(_pt(Mu_B, L, dB), fck);
      // punching at d/2
      var b0_ = 2 * ((col_b + d) + (col_D + d));
      var Vp_ = Pu - qu_max * (col_b + d) * (col_D + d) / 1e6;
      var tvp_ = Vp_ * 1000 / (b0_ * d);
      var beta_c_ = Math.min(col_b, col_D) / Math.max(col_b, col_D);
      var ks = Math.min(0.5 + beta_c_, 1.0);
      var tcp_ = ks * 0.25 * Math.sqrt(fck);
      var Ld10 = dmin_rule * 0.87 * fy / (4 * MT.tau_bd(fck));
      var anchor_ok = Math.min(a1, a2) - 75 + Math.max(Dtry - 2 * cover - 20, 0) >= Ld10;
      if (given_D || (d >= dmin_M && dB >= dmin_MB && tv1 <= tc_L && tv1b <= tc_B && tvp_ <= tcp_ && anchor_ok)) break;
      Dtry += 50;
    }
    var D = Dtry;
    d = c.calc("Effective depth", "d", "D - cover - dia", "mm", "", { D: D, cover: cover, dia: dia });
    c.let("Overall depth adopted", "D", D, "mm");
    // punching shear (cl 31.6)
    var b0 = c.calc("Punching perimeter at d/2", "b0", "2*((cb + d) + (cD + d))", "mm", "IS 456 cl 31.6.1",
      { cb: col_b, cD: col_D, d: d });
    var Vp = c.calc("Punching shear force", "Vp", "Pu - qu*(cb + d)*(cD + d)/1e6", "kN", "IS 456 cl 31.6",
      { Pu: Pu, qu: qu_max, cb: col_b, cD: col_D, d: d });
    var tvp = c.calc("Punching shear stress", "τv", "Vp*1000/(b0*d)", "N/mm²", "IS 456 cl 31.6.2", { Vp: Vp, b0: b0, d: d });
    var beta_c = Math.min(col_b, col_D) / Math.max(col_b, col_D);
    var tcp = c.calc("Permissible punching stress", "ks·τc", "min(0.5 + bc, 1)*0.25*sqrt(fck)", "N/mm²",
      "IS 456 cl 31.6.3.1", { bc: R(beta_c, 3), fck: fck });
    c.check("Punching shear", tvp, tcp, { unit: "N/mm²", clause: "IS 456 cl 31.6.3" });
    var res = { L: L, B: B, D: D, d: d, pmax: pmax, pmin: pmin };
    [["L", Mu_L, B, a1, "B"], ["B", Mu_B, L, a2, "L"]].forEach(function (row) {
      var dirn = row[0], Mu_ = row[1], width = row[2], proj = row[3];
      var dd = dirn === "L" ? d : d - dia;
      var f = RC.flexure(c, Mu_, width * 1000, dd, fck, fy, "slab", D, { tag: "(bars along " + dirn + ")" });
      var Ast_per_m = f.Ast / width;
      var bars;
      if (truthySeq(given_bars)) {
        bars = { dia: given_bars[0], spacing: given_bars[1], Ast_prov: 1000 * bar_area(given_bars[0]) / given_bars[1] };
        c.check("Steel provided ≥ required (bars along " + dirn + ")", bars.Ast_prov, Ast_per_m, { unit: "mm²/m",
          clause: "IS 456 cl 34.3", mode: ">=" });
        if (DT) DT.check_bars(c, "footing", "main", given_bars[0], given_bars[1], { d: dd, D: D, label: "bars along " + dirn });
      } else if (DT) {
        var avail1 = proj - 75 + Math.max(D - 2 * cover - 24, 0);
        var dmax_anc = avail1 * 4 * MT.tau_bd(fck) / (0.87 * fy);
        var al = DT.allowed("footing", "main", [10, 12, 16, 20, 25], { D: D });
        var dok = al.dias.filter(function (x) { return x <= dmax_anc; });
        if (!dok.length) dok = [al.dias[0]];
        bars = DT.pick_bars(Ast_per_m, "footing", "main", { d: dd, D: D, dias: dok, smax: 200.0,
          prefer: res.bars_L ? [res.bars_L.dia] : null });
        DT.record(c, "bars along " + dirn, { text: bars.text + (dok.length < al.dias.length ? "; Ø ≤ " +
          F(dmax_anc, ".0f") + " mm for anchorage within the projection (IS 456 cl 34.2.4.3)" : ""), clause: bars.clause });
        if (bars.short) c.check("Steel provided ≥ required (bars along " + dirn + ")", bars.Ast_prov, Ast_per_m,
          { unit: "mm²/m", clause: "IS 456 cl 34.3", mode: ">=" });
      } else {
        var avail0 = proj - 75 + Math.max(D - 2 * cover - 24, 0);
        var dia_max = avail0 * 4 * MT.tau_bd(fck) / (0.87 * fy);
        var dias = [10, 12, 16, 20].filter(function (x) { return x <= dia_max; });
        if (!dias.length) dias = [10];
        bars = RC.slab_bars(Ast_per_m, dd, D, true, { dias: dias, smax: 200.0 });
      }
      c.let("Bars along " + dirn, "", F(bars.dia, "g") + "Ø @ " + F(bars.spacing, "g") + " c/c", "", "IS 456 cl 34.3.1");
      var pt = 100 * bars.Ast_prov / (1000 * dd);
      var Vu1 = c.calc("One-way shear at d from face (span " + dirn + ")", "Vu", "qu*w*(max(a - d, 0))/1000", "kN",
        "IS 456 cl 34.2.4.1(a)", { qu: qu_max, w: width, a: proj, d: dd });
      RC.shear(c, Vu1, width * 1000, dd, pt, fck, fy, "footing", D, { tag: "(span " + dirn + ")" });
      var Ld = RC.development_length(c, bars.dia, fy, fck, { tag: "(bars along " + dirn + ")" });
      var leg_sched;
      if (DT) {
        // same leg as the bar bending schedule (common.footing_bbs): the bend-up leg makes up what the straight
        // projection lacks, at least the BBS minimum leg, at most D − 2c – the check uses what is scheduled
        var BBc = DS.bbs, leg_min = BBc ? BBc.leg(bars.dia, BBc.cfg.ftg_leg_min) : Math.max(12 * bars.dia, 150);
        leg_sched = c.calc("Bend-up leg scheduled (bars along " + dirn + ")", "leg", "min(D - 2*c, ceil(max(legmin, Ld - (a - 75))/5)*5)", "mm",
          "IS 456 cl 26.2.2 / SP 34", "legmin = max(12Ø, " + F(BBc ? BBc.cfg.ftg_leg_min : 150, "g") + ") (BBS rule)",
          { D: D, c: cover, legmin: leg_min, Ld: R(Ld, 1), a: proj });
        var avail_s = c.calc("Anchorage provided (bars along " + dirn + ")", "La", "(a - 75) + leg", "mm", "IS 456 cl 34.2.4.3",
          "straight beyond column face to 75 mm from the edge + scheduled 90° leg", { a: proj, leg: R(leg_sched, 1) });
        c.check("Anchorage provided ≥ Ld (bars along " + dirn + ")", avail_s, Ld, { unit: "mm", clause: "IS 456 cl 34.2.4.3",
          mode: ">=", note: "anchorage of the scheduled bar (straight + bend-up leg ≤ D − 2c)" });
      } else {
        var avail = proj - 75 + Math.max(D - 2 * cover - 2 * bars.dia, 0);
        c.check("Anchorage available ≥ Ld (bars along " + dirn + ")", avail, Ld, { unit: "mm", clause: "IS 456 cl 34.2.4.3",
          mode: ">=", note: "straight projection beyond column face − 75 + 90° bend-up leg (D − 2c)" });
      }
      // anchorage data for the BBS (non-enumerable: keeps the result object identical to the Python reference)
      Object.defineProperty(bars, "anchor", { value: { proj: proj, Ld: Ld, leg: leg_sched }, enumerable: false, configurable: true, writable: true });
      res["bars_" + dirn] = bars;
    });
    if (L / B > 1.05) {
      var frac = 2 / (L / B + 1);
      c.info("Central band (short-direction bars)", F(frac * 100, ".0f") + " % of short-direction steel within a " +
        "central band of width " + F(B, ".2f") + " m", "IS 456 cl 34.3.1(b)");
    }
    return res;
  };

  /* =========================================================================== serviceability – crack width */
  /* crack_width(c, Ms, b, D, d, As, cover, dia, spacing, fck, limit = 0.2, tag = "", Es = 200000[, opts]) → wcr (mm)
     IS 456 Annex F (cracked elastic section, long-term Ec/2); records a check against `limit`. */
  RC.crack_width = function () {
    var p = kw(arguments, ["c", "Ms", "b", "D", "d", "As", "cover", "dia", "spacing", "fck", "limit", "tag", "Es"],
      { limit: 0.2, tag: "", Es: 200000.0 }, 10);
    var c = p.c, b = p.b, D = p.D, d = p.d, As = p.As, cover = p.cover, dia = p.dia, Es = p.Es, t = tg(p.tag);
    var Ms = Math.abs(p.Ms);
    var Ec = 5000 * Math.sqrt(p.fck) / 2;
    var m = Es / Ec;
    var x = c.calc("Neutral axis (cracked, elastic)" + t, "x", "(-m*As + sqrt((m*As)**2 + 2*b*m*As*d))/b", "mm",
      "IS 456 Annex F", { m: R(m, 2), As: R(As, 1), b: b, d: d });
    var fs = c.calc("Steel stress under service moment" + t, "fs", "Ms*1e6/(As*(d - x/3))", "N/mm²", "IS 456 Annex F",
      { Ms: R(Ms, 2), As: R(As, 1), d: d, x: R(x, 1) });
    var e1 = fs / Es * (D - x) / Math.max(d - x, 1);
    var em = c.calc("Average surface strain εm" + t, "εm", "e1 - b*(D - x)*(D - x)/(3*Es*As*(d - x))", "",
      "IS 456 Annex F", { e1: R(e1, 7), b: b, D: D, x: R(x, 1), Es: Es, As: R(As, 1), d: d });
    var acr = Math.sqrt(Math.pow(p.spacing / 2, 2) + Math.pow(cover + dia / 2, 2)) - dia / 2;
    var w = c.calc("Design crack width" + t, "wcr", "3*acr*max(em, 0)/(1 + 2*(acr - cmin)/(D - x))", "mm",
      "IS 456 Annex F", { acr: R(acr, 1), em: R(em, 7), cmin: cover, D: D, x: R(x, 1) });
    c.check("Crack width ≤ " + F(p.limit, "g") + " mm" + t, w, p.limit, { unit: "mm", clause: "IS 3370-2 cl 4.1 / IRC 112 cl 12.3" });
    return w;
  };

  /* shear_irc112(c, VEd, b, d, Asl, fck, tag = ""[, opts]) → bool — IRC 112:2020 cl 10.3.2 */
  RC.shear_irc112 = function () {
    var p = kw(arguments, ["c", "VEd", "b", "d", "Asl", "fck", "tag"], { tag: "" }, 6);
    var c = p.c, b = p.b, d = p.d, t = tg(p.tag);
    var k = Math.min(1 + Math.sqrt(200 / d), 2.0);
    var rho = Math.min(p.Asl / (b * d), 0.02);
    var VRdc = c.calc("Shear resistance VRd,c" + t, "VRd,c",
      "max(0.12*k*(80*rho*fck)**(1/3), 0.031*k**1.5*sqrt(fck))*b*d/1000", "kN", "IRC 112 cl 10.3.2",
      { k: R(k, 3), rho: R(rho, 5), fck: p.fck, b: b, d: d });
    return c.check("Shear VEd ≤ VRd,c" + t, Math.abs(p.VEd), VRdc, { unit: "kN", clause: "IRC 112 cl 10.3.2",
      note: "increase thickness if it fails (no shear links in slabs)" });
  };

  /* min_steel_water(D) → % of gross section (IS 3370-2:2009 cl 8.1) */
  RC.min_steel_water = function (D) {
    if (D <= 100) return 0.24;
    if (D >= 450) return 0.16;
    return 0.24 - (D - 100) * 0.08 / 350;
  };

  /* design_strip(c, Mu, D, cover, fck, fy, face, Ms = 0, crack_limit = null, min_pct = null, given = null,
                  dia_pref = [10,12,16,20,25], smax = 200[, opts]) → {dia, spacing, Ast_prov, [smax,] d, req}
     1 m wide slab / wall strip; given = [dia, spacing] for check mode. */
  RC.design_strip = function () {
    var p = kw(arguments, ["c", "Mu", "D", "cover", "fck", "fy", "face", "Ms", "crack_limit", "min_pct", "given",
      "dia_pref", "smax", "rule"], { Ms: 0.0, crack_limit: null, min_pct: null, given: null, dia_pref: [10, 12, 16, 20, 25], smax: 200.0,
      rule: null }, 7);
    var c = p.c, D = p.D, cover = p.cover, fck = p.fck, fy = p.fy, face = p.face, Ms = p.Ms,
      crack_limit = p.crack_limit, given = p.given, dia_pref = p.dia_pref;
    var DT = p.rule ? DS.detailing : null;            // opt-in detailing rules (member / role / main_dia / prefer)
    var hasGiven = given != null && given.length > 0;
    var dia0 = hasGiven ? given[0] : 12;
    var d = D - cover - dia0 / 2;
    var f = RC.flexure(c, p.Mu, 1000, d, fck, fy, "slab", D, { tag: "(" + face + ")" });
    var req = f.Ast;
    if (p.min_pct) {
      req = Math.max(req, c.calc("Minimum steel per face (" + face + ")", "As,min", "pct/100*1000*D/2", "mm²/m",
        "IS 3370-2 cl 8.1", { pct: R(p.min_pct, 3), D: D }));
    }
    var bars;
    if (hasGiven) {
      bars = { dia: given[0], spacing: given[1], Ast_prov: 1000 * bar_area(given[0]) / given[1] };
      c.check("Steel provided ≥ required (" + face + ")", bars.Ast_prov, req, { unit: "mm²/m", clause: "", mode: ">=" });
      if (DT) DT.check_bars(c, p.rule.member, p.rule.role || "main", given[0], given[1],
        Object.assign({ d: d, D: D, label: face }, p.rule));
    } else {
      bars = RC.slab_bars(req, d, D, true, DT ? { dias: dia_pref, smax: p.smax, rule: p.rule } : { dias: dia_pref, smax: p.smax });
      var why = bars.text, tightened = false;
      var step = DT ? DT.step() : 10, smin = DT ? DT.min_spacing() : 100;
      if (DT && bars.short)
        c.check("Steel provided ≥ required (" + face + ")", bars.Ast_prov, req, { unit: "mm²/m", clause: "",
          mode: ">=", note: "even the largest permitted bar at the minimum spacing is not enough – increase thickness" });
      if (crack_limit && Ms > 0) {
        // tighten spacing / increase bar until crack width satisfied
        for (var it = 0; it < 30; it++) {
          var sc = new C.Calc("s");
          var w = RC.crack_width(sc, Ms, 1000, D, D - cover - bars.dia / 2, bars.Ast_prov, cover, bars.dia,
            bars.spacing, fck, crack_limit);
          if (w <= crack_limit) break;
          tightened = true;
          if (bars.spacing - step >= smin - 1e-9 && (DT || bars.spacing > 100)) {
            bars = Object.assign({}, bars, { spacing: bars.spacing - step });
          } else {
            var cur = bars.dia;
            var nd = dia_pref.filter(function (x) { return x > cur && (!DT || !p.D || x <= Math.max(p.D / 8, cur)); });
            if (!nd.length) break;
            bars = Object.assign({}, bars, { dia: nd[0], spacing: 150 });
          }
          bars.Ast_prov = 1000 * bar_area(bars.dia) / bars.spacing;
        }
      }
      if (DT && why) DT.record(c, face, { text: why + (tightened ? "; then tightened to " + F(bars.dia, "g") + "Ø @ " +
        F(bars.spacing, "g") + " for crack width ≤ " + F(crack_limit, "g") + " mm" : ""), clause: bars.clause });
    }
    c.let("Bars (" + face + ")", "", F(bars.dia, "g") + "Ø @ " + F(bars.spacing, "g") + " c/c", "", "",
      "As,prov = " + F(bars.Ast_prov, ".0f") + " mm²/m");
    var dd = D - cover - bars.dia / 2;
    if (crack_limit && Ms > 0)
      RC.crack_width(c, Ms, 1000, D, dd, bars.Ast_prov, cover, bars.dia, bars.spacing, fck, crack_limit, { tag: "(" + face + ")" });
    return Object.assign({}, bars, { d: dd, req: req });
  };

  /* =========================================================================== earth pressure */
  /* ka_rankine(phi_deg, beta_deg = 0) */
  RC.ka_rankine = function (phi_deg, beta_deg) {
    var q = kw(arguments, ["phi_deg", "beta_deg"], { beta_deg: 0.0 }, 1);
    var p = q.phi_deg * (Math.PI / 180), b = q.beta_deg * (Math.PI / 180);   // math.radians
    if (q.beta_deg <= 0) return (1 - Math.sin(p)) / (1 + Math.sin(p));
    var root = Math.sqrt(Math.max(Math.pow(Math.cos(b), 2) - Math.pow(Math.cos(p), 2), 0));
    return Math.cos(b) * (Math.cos(b) - root) / (Math.cos(b) + root);
  };

  /* k0(phi_deg) */
  RC.k0 = function (phi_deg) { return 1 - Math.sin(phi_deg * (Math.PI / 180)); };

  /* as_for_shear_irc112(VEd, b, d, fck) → mm² (Infinity if > 2 % is needed) */
  RC.as_for_shear_irc112 = function (VEd, b, d, fck) {
    var k = Math.min(1 + Math.sqrt(200 / d), 2.0);
    var v = VEd * 1000 / (b * d);
    if (v <= 0.031 * Math.pow(k, 1.5) * Math.sqrt(fck)) return 0.0;
    var rho = Math.pow(v / (0.12 * k), 3) / (80 * fck);
    return rho <= 0.02 ? rho * b * d : Infinity;
  };
})();
