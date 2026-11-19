/* Design Studio — modules_rcc (port of civilest/design/modules_rcc.py).
   Phase 1 – RCC building elements (IS 456:2000, SP 16, SP 34, IS 875).

   Modules
       rcc_beam       Rectangular beam – simply supported / cantilever / continuous (Table 12 & 13 coefficients)
       rcc_slab       One-way and two-way slabs (Table 26 restrained, Table 27 simply supported)
       rcc_column     Short / slender column, axial + biaxial bending (cl 39.6, 39.7)
       rcc_footing    Isolated pad footing (cl 34)
       rcc_staircase  Dog-legged staircase waist slab (cl 33) */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var C = DS.core, MT = DS.materials, LD = DS.loads, RC = DS.rcc, CM = DS.common, DR = DS.drawing;
  var M = DS.modules_rcc = {};
  var F = C.pyfmt, S = C.pystr, R = C.pyround;
  var Calc = C.Calc, View = DR.View, Sheet = DR.Sheet, diagram_view = DR.diagram_view;
  var ceil_to = C.ceil_to, interp = C.interp, bar_area = MT.bar_area, row = CM.row, RATE = CM.RATE;
  var BAR_DIAS = MT.BAR_DIAS, EXPOSURE = MT.EXPOSURE, REBAR_GRADES = MT.REBAR_GRADES;
  var mu_lim_coeff = MT.mu_lim_coeff;
  function g(x) { return F(x, "g"); }
  function num(x) { return Number(x); }
  function int(x) { return Math.trunc(Number(x)); }
  function maxv(o) { var v = Object.keys(o).map(function (k) { return o[k]; }); return Math.max.apply(null, v); }
  /* Param(key, label, default, unit = "", {kind, options, min, max, step, help, group, modes}) */
  function Param(key, label, def, unit, o) {
    if (unit && typeof unit === "object") { o = unit; unit = ""; }
    return C.Param(Object.assign({ key: key, label: label, default: def, unit: unit || "" }, o || {}));
  }
  var CHECK = ["check"];

  var REFS = ["IS 456:2000 – Plain & reinforced concrete", "SP 16 – Design aids for RC to IS 456",
    "SP 34 – Handbook on concrete reinforcement & detailing", "IS 875 Part 1 & 2 – Dead & imposed loads",
    "IS 13920:2016 – Ductile detailing", "Pillai & Menon – Reinforced Concrete Design",
    "N. Krishna Raju – Design of RC Structures", "B.C. Punmia – Reinforced Concrete Structures"];
  var GRADES = [20.0, 25.0, 30.0, 35.0, 40.0];
  M.REFS = REFS; M.GRADES = GRADES;

  /* _mat_params(cover = 25, member = "beam", exposure = "Mild") */
  function _mat_params(cover, member, exposure) {
    if (exposure && typeof exposure === "object") exposure = exposure.exposure;
    if (member && typeof member === "object") { exposure = member.exposure; member = member.member; }
    if (cover == null) cover = 25.0;
    if (exposure == null) exposure = "Mild";
    return [Param("fck", "Concrete grade fck", 25.0, "N/mm²", { kind: "select", options: GRADES, group: "Materials" }),
      Param("fy", "Steel grade", "Fe500", { kind: "select", options: Object.keys(REBAR_GRADES).filter(function (k) { return k.indexOf("250") < 0; }),
        group: "Materials" }),
      Param("exposure", "Exposure", exposure, { kind: "select", options: Object.keys(EXPOSURE), group: "Materials",
        help: "IS 456 Table 3: Mild = protected interior; Moderate = sheltered exterior / buried; Severe = " +
          "coastal / alternate wetting" }),
      Param("cover", "Clear cover", cover, "mm", { min: 15, max: 75, step: 5, group: "Materials" })];
  }
  M._mat_params = _mat_params;

  function _fy(inp) { return REBAR_GRADES[inp.fy]; }
  M._fy = _fy;

  /* Design / thumb modes adopt at least the IS 456 Table 16 cover; check mode keeps the user's value. */
  function _cover(c, inp, mode, member) {
    var cover = num(inp.cover);
    var req = RC.required_cover(inp.exposure, member);
    if (mode !== "check" && cover < req) {
      c.info("Cover adopted", g(cover) + " mm raised to " + g(req) + " mm for " + inp.exposure + " exposure", "IS 456 Table 16");
      cover = req;
    }
    RC.cover_check(c, inp.exposure, cover, num(inp.fck), member);
    return cover;
  }
  M._cover = _cover;

  function _rcc_qty(title, fck, vol_rows, shutter_rows, bbs) {
    return [CM.Q("RCC M" + g(fck) + " – " + title + " (excl. steel & shuttering)", "cum", vol_rows, null, CM.rcc_rate(fck)),
      CM.Q("Centering & shuttering – " + title, "sqm", shutter_rows, null, RATE.shutter_slab),
      CM.Q("Reinforcement TMT – cutting, bending, binding & placing", "kg",
        bbs.map(function (b) { return CM.kg_row(b.member + " " + b.mark + " " + g(b.dia) + "Ø", b.nos, b.cut_length, Math.pow(b.dia, 2) / 162); }),
        null, RATE.rebar)];
  }
  M._rcc_qty = _rcc_qty;

  /* =========================================================================== BEAM */
  var T12 = {  // IS 456 Table 12 (DL, LL) and Table 13 shear (DL, LL)
    "Continuous – end span": { Msag: [1 / 12, 1 / 10], Mhog: [1 / 10, 1 / 9], V: [0.6, 0.6] },
    "Continuous – interior span": { Msag: [1 / 16, 1 / 12], Mhog: [1 / 12, 1 / 9], V: [0.55, 0.6] }
  };
  M.T12 = T12;

  /* Centroid of a beam bar group measured from the inner face of the stirrup (mm): layers of `per_layer` bars, vertical clear
     gap between layers max(Ø, 25 mm) (IS 456 cl 26.3.2(b) / SP 34 spacer bars). */
  function bar_centroid(bars) {
    var dia = bars.dia, n = bars.n, pl = bars.per_layer || n, gap = Math.max(dia, 25);
    if (!(pl > 0) || n <= pl) return dia / 2;
    var s = 0, left = n, k = 0;
    while (left > 0) { var m = Math.min(pl, left); s += m * (dia / 2 + k * (dia + gap)); left -= m; k++; }
    return s / n;
  }
  /* bars that fit in one layer of a beam of width b (same rule as rcc.beam_bars, clear ≥ max(Ø, agg + 5)) */
  function per_layer(b, cover, stir, dia) {
    var cl = Math.max(dia, 25);
    return Math.max(2, Math.floor((b - 2 * cover - 2 * stir + cl) / (dia + cl)));
  }
  M.bar_centroid = bar_centroid; M.per_layer = per_layer;

  function run_beam(inp, mode) {
    var c = new Calc("RCC beam");
    var fck = num(inp.fck), fy = _fy(inp);
    var L = num(inp.span);
    var sup = inp.support;
    var b = num(inp.b);
    var stir = num(inp.stirrup_dia);
    var gk_extra = num(inp.dl), qk = num(inp.ll);
    var P = num(inp.point);
    var DT = DS.detailing;                      // bar-size rules (practice / code, see detailing.js)
    var cover = _cover(c, inp, mode, "beam");
    var stir_in = stir;
    if (DT && mode !== "check") {
      var smin_d = DT.min_dia("beam", "stirrup").dia;
      if (stir < smin_d) {
        c.info("Stirrup diameter", g(stir) + " mm raised to " + g(smin_d) + " mm", DT.min_dia("beam", "stirrup").clause);
        stir = smin_d; stir_in = stir;
      }
    }
    var basic = ({ "Simply supported": 20, "Cantilever": 7 })[sup] || 26;   // eslint-disable-line no-unused-vars
    var D;
    if (mode === "check") D = num(inp.D);
    else {
      D = ceil_to(Math.max(L * 1000 / (sup === "Simply supported" ? 12 : sup.indexOf("Continuous") >= 0 ? 15 : 6), 300), 25);
      if (mode === "thumb")
        c.info("Thumb-rule depth", "L/12 simply supported, L/15 continuous, L/6 cantilever (≥ 300 mm)", "Practice");
    }

    function forces(D) {
      var sw = 25 * b * D / 1e6;
      var gk = gk_extra + sw, Ms, Mh, V;
      if (sup === "Simply supported") {
        Ms = 1.5 * ((gk + qk) * Math.pow(L, 2) / 8 + P * L / 4);
        Mh = 0.0;
        V = 1.5 * ((gk + qk) * L / 2 + P / 2);
      } else if (sup === "Cantilever") {
        Ms = 0.0;
        Mh = 1.5 * ((gk + qk) * Math.pow(L, 2) / 2 + P * L);
        V = 1.5 * ((gk + qk) * L + P);
      } else {
        var k = T12[sup];
        if (!k) throw new Error("KeyError: " + sup);
        Ms = 1.5 * (k.Msag[0] * gk * Math.pow(L, 2) + k.Msag[1] * qk * Math.pow(L, 2) + P * L / 6);
        Mh = 1.5 * (k.Mhog[0] * gk * Math.pow(L, 2) + k.Mhog[1] * qk * Math.pow(L, 2) + P * L / 6);
        V = 1.5 * (k.V[0] * gk * L + k.V[1] * qk * L + P / 2);
      }
      return [sw, Ms, Mh, V];
    }

    /* top bars for a required area (same rules as before) */
    function top_bars(As_top, need_top, bb_, st_) {
      if (DT) {
        var trole = need_top > 0 ? "main" : "hanger";
        var tmin = DT.min_dia("beam", trole, null, { main_dia: bb_.dia }).dia;
        return RC.beam_bars(Math.max(As_top, 2 * bar_area(tmin)), b, cover, st_, { dias: [10, 12, 16, 20, 25, 32],
          rule: { role: trole, main_dia: bb_.dia, prefer: [bb_.dia] } });
      }
      return As_top > 2 * bar_area(10) + 1 ? RC.beam_bars(As_top, b, cover, st_, { dias: [10, 12, 16, 20, 25] }) :
        { n: 2, dia: 10.0, Ast_prov: 2 * bar_area(10), layers: 1, per_layer: 2 };
    }

    /* Bar arrangement for depth D: effective depths from the actual bars (layers, Ø, final stirrup Ø), iterated until the
       arrangement no longer changes. d is only ever reduced, so the depth used is never larger than the real one. */
    function arrange(D, Ms, Mh, V) {
      var st_ = stir, legs_ = 2, dB = D - cover - st_ - 6, dT = dB, tdia = 10, out = null;
      for (var k = 0; k < 12; k++) {
        var sc = new Calc("s");
        var fb_ = Ms > 0 ? RC.flexure(sc, Ms, b, dB, fck, fy, "beam", { d_dash: cover + st_ + tdia / 2 }) :
          { Ast: 0.85 * b * dB / fy, Asc: 0, pt: 0 };
        var bb_ = RC.beam_bars(Math.max(fb_.Ast, 2 * bar_area(12)), b, cover, st_, DT ? { rule: { role: "main" } } : {});
        var ft_ = null, As_top;
        if (Mh > 0) {
          ft_ = RC.flexure(sc, Mh, b, dT, fck, fy, "beam", { d_dash: cover + st_ + bb_.dia / 2 });
          As_top = Math.max(ft_.Ast, fb_.Asc || 0);
        } else As_top = Math.max(fb_.Asc || 0, 2 * bar_area(10));
        var tb_ = top_bars(As_top, Mh, bb_, st_);
        var dv = sup === "Cantilever" ? dT : sup === "Simply supported" ? dB : Math.min(dB, dT);
        var pt_ = 100 * (sup !== "Cantilever" ? bb_.Ast_prov : tb_.Ast_prov) / (b * dv);
        var st2 = st_, legs2 = legs_, bumped = false;
        if (DT && DT.practice()) {
          // keep the shear spacing practical (≥ 100 mm): use a bigger stirrup bar instead of very close spacing
          for (var bump = 0; bump < 3 && st2 < 12; bump++) {
            var shs = RC.shear(new Calc("s"), V, b, dv, pt_, fck, fy, "beam", { stirrup_dia: st2, legs: legs2 });
            if (!shs.stirrups || shs.stirrups[2] >= 100) break;
            st2 = DT.next_bar(st2 + 1); bumped = true;
          }
        }
        var shz = RC.shear(new Calc("s"), V, b, dv, pt_, fck, fy, "beam", { stirrup_dia: st2, legs: legs2, strict: "design" });
        if (shz.stirrups) { legs2 = shz.stirrups[0]; st2 = shz.stirrups[1]; }
        var nB = Math.min(dB, D - cover - st2 - bar_centroid(bb_)), nT = Math.min(dT, D - cover - st2 - bar_centroid(tb_));
        out = { bb: bb_, tb: tb_, stir: st2, legs: legs2, bumped: bumped || st2 !== stir, d_b: dB, d_t: dT };
        if (nB >= dB - 0.01 && nT >= dT - 0.01 && st2 === st_ && legs2 === legs_) break;
        dB = nB; dT = nT; st_ = st2; legs_ = legs2; tdia = tb_.dia;
      }
      return out;
    }

    var fr, sw, Ms, Mh, V, d, ar = null;
    if (mode !== "check") {
      for (var it = 0; it < 40; it++) {
        fr = forces(D); sw = fr[0]; Ms = fr[1]; Mh = fr[2]; V = fr[3];
        ar = arrange(D, Ms, Mh, V);
        var dmin_ = Math.min(ar.d_b, ar.d_t);
        if (Ms * 1e6 <= mu_lim_coeff(fy) * fck * b * ar.d_b * ar.d_b && Mh * 1e6 <= mu_lim_coeff(fy) * fck * b * ar.d_t * ar.d_t &&
          V * 1000 / (b * dmin_) <= 0.75 * 3.1 * Math.pow(fck / 25, 0.5)) {
          var sc = new Calc("s");
          var f = RC.flexure(sc, Math.max(Ms, 1e-3), b, ar.d_b, fck, fy, "beam");
          // cantilever: deflection with the hogging (top) steel at the support, as in the final check
          var fc_ = sup === "Cantilever" ? RC.flexure(sc, Math.max(Mh, 1e-3), b, ar.d_t, fck, fy, "beam") : null;
          if (sup === "Cantilever" ? RC.deflection(sc, L * 1000, ar.d_t, "cantilever", fy, fc_.Ast, ar.tb.Ast_prov, b) :
            RC.deflection(sc, L * 1000, ar.d_b, ({ "Simply supported": "simply supported" })[sup] || "continuous", fy, f.Ast, ar.bb.Ast_prov, b))
            break;
        }
        D += 25;
        if (D > 3.5 * b) {
          var nb = [230, 300, 350, 400, 450, 500, 600, 750].filter(function (w) { return w > b; });
          b = nb.length ? nb[0] : b + 50;
          D = Math.max(D - 100, 300);
        }
      }
      if (b !== num(inp.b))
        c.info("Width increased", "b raised from " + g(num(inp.b)) + " to " + g(b) + " mm to keep D ≤ 3.5 b", "Practice");
    }
    fr = forces(D); sw = fr[0]; Ms = fr[1]; Mh = fr[2]; V = fr[3];
    if (mode !== "check") ar = arrange(D, Ms, Mh, V);
    c.section("Section & loads");
    c.let("Effective span", "L", L, "m", "IS 456 cl 22.2");
    c.let("Width × overall depth", "b × D", g(b) + " × " + g(D), "mm");
    c.calc("Self-weight", "gs", "25*b*D/1e6", "kN/m", "IS 875-1", { b: b, D: D });
    c.let("Superimposed dead load / imposed load", "gk / qk", g(gk_extra) + " / " + g(qk), "kN/m");
    if (Object.prototype.hasOwnProperty.call(T12, sup))
      c.info("Moment & shear coefficients", sup + ": sagging DL " + F(T12[sup].Msag[0], ".4f") + ", LL " + F(T12[sup].Msag[1], ".4f") + "; " +
        "hogging DL " + F(T12[sup].Mhog[0], ".4f") + ", LL " + F(T12[sup].Mhog[1], ".4f"), "IS 456 Tables 12 & 13");
    c.let("Factored sagging moment", "Mu+", R(Ms, 2), "kN·m");
    c.let("Factored hogging moment", "Mu−", R(Mh, 2), "kN·m");
    c.let("Factored shear", "Vu", R(V, 2), "kN");
    var bb, tb, legs0 = 2;
    if (mode === "check") {
      bb = { n: int(inp.bot_n), dia: num(inp.bot_dia) };
      bb.Ast_prov = bb.n * bar_area(bb.dia); bb.per_layer = per_layer(b, cover, stir, bb.dia); bb.layers = Math.ceil(bb.n / bb.per_layer);
      tb = { n: int(inp.top_n), dia: num(inp.top_dia) };
      tb.Ast_prov = tb.n * bar_area(tb.dia); tb.per_layer = per_layer(b, cover, stir, tb.dia); tb.layers = Math.ceil(tb.n / tb.per_layer);
    } else {
      bb = ar.bb; tb = ar.tb;
      if (ar.stir !== stir || ar.legs !== 2)
        c.info("Stirrup diameter", g(stir) + "Ø raised to " + S(ar.legs) + "L-" + g(ar.stir) + "Ø so that the shear spacing stays practical " +
          "(effective depth recomputed with it)", "Practice: stirrup spacing ≥ 100 mm (≥ 75 mm minimum)");
      stir = ar.stir; legs0 = ar.legs;
    }
    function d_of(bars, face) {
      var yb = bar_centroid(bars), nl = bars.per_layer && bars.n > bars.per_layer ? Math.ceil(bars.n / bars.per_layer) : 1;
      return c.calc("Effective depth – " + face + " bars", "d", "D - c - ds - ybar", "mm", "IS 456 cl 26.3.2(b) / SP 34",
        S(bars.n) + "-" + g(bars.dia) + "Ø in " + S(nl) + " layer" + (nl > 1 ? "s (" + S(Math.min(bars.per_layer, bars.n)) + " per layer, vertical clear gap max(Ø, 25))" : "") +
        "; ybar = centroid from the stirrup", { D: D, c: cover, ds: stir, ybar: R(yb, 1) });
    }
    c.section("Flexure – bottom (sagging)");
    var d_b = d_of(bb, "bottom");
    var fb;
    if (Ms > 0) fb = RC.flexure(c, Ms, b, d_b, fck, fy, "beam", { tag: "(mid-span)", d_dash: cover + stir + tb.dia / 2 });
    else fb = { Ast: 0.85 * b * d_b / fy, Asc: 0, pt: 0 };
    if (mode === "check") {
      if (DT) DT.check_bars(c, "beam", "main", bb.dia, null, { label: "bottom bars" });
    } else if (DT) DT.record(c, "bottom bars", bb);
    c.check("Bottom steel provided ≥ required", bb.Ast_prov, Math.max(fb.Ast, 1), { unit: "mm²", clause: "IS 456 Annex G-1.1", mode: ">=" });
    c.let("Bottom bars", "", S(bb.n) + "-" + g(bb.dia) + "Ø", "", "", "As = " + F(bb.Ast_prov, ".0f") + " mm²");
    c.section("Flexure – top (hogging) / hanger bars");
    var need_top = Math.max(Mh, 0), As_top, d_t = d_b;
    if (need_top > 0) {
      d_t = d_of(tb, "top");
      var ft = RC.flexure(c, need_top, b, d_t, fck, fy, "beam", { tag: "(support)", d_dash: cover + stir + bb.dia / 2 });
      As_top = Math.max(ft.Ast, fb.Asc || 0);
    } else {
      As_top = Math.max(fb.Asc || 0, 2 * bar_area(10));
    }
    if (mode === "check") {
      if (DT) DT.check_bars(c, "beam", need_top > 0 ? "main" : "hanger", tb.dia, null, { label: "top bars", main_dia: bb.dia });
    } else if (DT) DT.record(c, "top bars", tb);
    c.check("Top steel provided ≥ required", tb.Ast_prov, As_top, { unit: "mm²", clause: fb.Asc ? "IS 456 Annex G-1.2" : "", mode: ">=" });
    c.let("Top bars", "", S(tb.n) + "-" + g(tb.dia) + "Ø", "", "", need_top === 0 ? (fb.Asc ? "compression steel / hanger bars" : "hanger bars") : "over supports");
    var max_pt = 100 * Math.max(bb.Ast_prov, tb.Ast_prov) / (b * D);
    c.check("Max. steel ≤ 4 % of bD", max_pt, 4.0, { unit: "%", clause: "IS 456 cl 26.5.1.1(b)" });
    c.section("Shear");
    d = sup === "Cantilever" ? d_t : sup === "Simply supported" ? d_b : Math.min(d_b, d_t);
    var pt = 100 * (sup !== "Cantilever" ? bb.Ast_prov : tb.Ast_prov) / (b * d);
    var sh = RC.shear(c, V, b, d, pt, fck, fy, "beam", { stirrup_dia: stir, legs: legs0, strict: mode === "check" ? "check" : "design" });
    var s_end = null, end_len = 0;
    if (mode === "check") {
      var sv_given = num(inp.stirrup_s);
      c.check("Stirrup spacing provided ≤ required", sv_given, Math.min(sh.stirrups[2], sh.sv_req), { unit: "mm", clause: "IS 456 cl 40.4" });
      sh.stirrups = [2, stir, sv_given];
      if (DT) {
        DT.check_bars(c, "beam", "stirrup", stir, null, { label: "stirrups" });
        if (DT.practice()) c.ok("Stirrup spacing ≤ d/2 (ductile detailing)", sv_given <= d / 2 + 1e-9, { detail: g(sv_given) + " ≤ " +
          F(d / 2, ".0f") + " mm", clause: "IS 13920:2016 cl 6.3.5", warn_only: true });
      }
    } else if (DT) {
      var sv_req0 = sh.stirrups[2];
      var sr = DT.stirrup_rules(d, L, sh.stirrups[2], sh.stirrups[1], { min_main: Math.min(bb.dia, tb.dia) });
      DT.record(c, "stirrups", sr);
      sh.stirrups = [sh.stirrups[0], sr.dia, sr.s_mid];
      if (sr.end_len && sr.s_end < sr.s_mid) { s_end = sr.s_end; end_len = sr.end_len; }
      if (sr.dia !== stir || sr.s_mid !== sv_req0 || s_end)
        c.let("Stirrups adopted (with detailing rules)", "", S(sh.stirrups[0]) + "L-" + g(sr.dia) + "Ø @ " + g(sr.s_mid) + " c/c" +
          (s_end ? ", " + g(s_end) + " c/c within " + F(end_len, ".0f") + " mm of supports" : ""), "", sr.clause);
    }
    c.section("Serviceability & detailing");
    if (sup !== "Cantilever")
      RC.deflection(c, L * 1000, d_b, ({ "Simply supported": "simply supported" })[sup] || "continuous", fy, fb.Ast, bb.Ast_prov, b);
    else
      RC.deflection(c, L * 1000, d_t, "cantilever", fy, As_top, tb.Ast_prov, b);
    var Ld = RC.development_length(c, bb.dia, fy, fck);
    var sf = null;
    if (D > 750) {
      var Asf = c.calc("Side-face reinforcement (each face)", "Asf", "0.0005*b*D", "mm²", "IS 456 cl 26.5.1.3", { b: b, D: D });
      // bars along each side face between top & bottom bars, spacing ≤ min(300, b)
      var hz = D - 2 * (cover + stir) - bb.dia - tb.dia;
      var nsf = c.calc("Side-face bars per face (spacing ≤ min(300, b))", "nsf", "max(ceil(h/min(300, b)) - 1, 1)", "", "IS 456 cl 26.5.1.3",
        "h = clear height between top and bottom bars", { h: R(hz, 0), b: b });
      var sfd = [10, 12, 16, 20].filter(function (x) { return nsf * bar_area(x) >= Asf; })[0] || 20;
      if (DT && mode !== "check") {
        var sfmin = DT.min_dia("beam", "hanger").dia;
        if (sfd < sfmin) sfd = DT.next_bar(sfmin);
      }
      c.check("Side-face steel provided ≥ required (each face)", nsf * bar_area(sfd), Asf, { unit: "mm²", clause: "IS 456 cl 26.5.1.3", mode: ">=" });
      c.let("Side-face bars", "", S(nsf) + "-" + g(sfd) + "Ø each face", "", "IS 456 cl 26.5.1.3", "@ " + F(hz / (nsf + 1), ".0f") + " mm c/c");
      sf = { n: nsf, dia: sfd, s: hz / (nsf + 1) };
    }
    c.thumb("Overall depth", L * 1000 / (sup === "Simply supported" ? 12 : sup.indexOf("Continuous") >= 0 ? 15 : 6), D,
      "mm", "span/12 (SS), /15 (continuous), /6 (cantilever)", "Practice");
    c.thumb("Width", Math.max(D / 2, 230), b, "mm", "D/2 to D/1.5, ≥ wall thickness 230", "Practice");
    if (sup.indexOf("Continuous") >= 0)
      c.miss("Table 12 coefficients assume UDL, spans differing ≤ 15 % – use frame analysis otherwise",
        "IS 456 cl 22.5.1", "Important");
    c.miss("Torsion (spandrel beams) and ductile detailing (IS 13920) for seismic zones III–V", "IS 456 cl 41 / IS 13920",
      "Advisory");
    // BBS
    var nos = int(inp.nos);
    var legs = sh.stirrups[0], sd = sh.stirrups[1], sv = sh.stirrups[2];
    var n_st = s_end ? DT.count_zoned(L * 1000, sv, s_end, end_len, sup === "Cantilever" ? 1 : 2) : Math.floor(L * 1000 / sv) + 1;
    var st_txt = S(legs) + "L-" + g(sd) + "Ø @ " + g(sv) + (s_end ? " (" + g(s_end) + " within 2d of supports)" : "");
    // BBS (DS.bbs: out-to-out segments, bend deductions, stirrup hooks, laps beyond 12 m stock) – support width 300 mm assumed
    var BB = DS.bbs, sw = BB.cfg.beam_sw, run = L * 1000 + sw - 2 * cover;
    var cant = sup === "Cantilever";
    var b1 = BB.stock(cant ? BB.lbar(bb.dia, run, BB.leg(bb.dia)) : BB.ubar(bb.dia, run, BB.leg(bb.dia)), bb.dia, fck, fy);
    // cantilever: top bars run the overhang + Ld back into the support, bent down D − 2c at the free end
    var b2 = BB.stock(cant ? BB.lbar(tb.dia, L * 1000 - cover + BB.Ld(tb.dia, fck, fy), D - 2 * cover) : BB.ubar(tb.dia, run, BB.leg(tb.dia)), tb.dia, fck, fy);
    var b3 = BB.stirrup(sd, b, D, cover);
    var bbs = [BB.row("Beam", "B1", bb.dia, cant ? "L (90° bend at support)" : "U (90° bends into supports)", bb.n * nos, b1, "bottom main"),
    BB.row("Beam", "B2", tb.dia, cant ? "L (anchored Ld into support)" : "U (90° bends into supports)", tb.n * nos, b2, need_top > 0 ? "top main" : "top hanger"),
    BB.row("Beam", "B3", sd, "closed stirrup" + (legs > 2 ? " (" + S(legs / 2) + " per set)" : "") + ", 135° hooks", n_st * nos * (legs > 2 ? legs / 2 : 1), b3, "@ " + g(sv) + " c/c" +
      (s_end ? ", " + g(s_end) + " c/c over " + F(end_len, ".0f") + " at supports" : ""))];
    if (sf) {
      var b4 = BB.stock(BB.straight(sf.dia, run), sf.dia, fck, fy);
      bbs.push(BB.row("Beam", "B4", sf.dia, "straight", 2 * sf.n * nos, b4, "side-face bars, " + S(sf.n) + " each face (IS 456 cl 26.5.1.3)"));
    }
    var qty = _rcc_qty("beams", fck, [row("Beams", nos, L, b / 1000, D / 1000)],
      [row("Beam sides & soffit", nos, L, (b + 2 * D) / 1000)], bbs);
    // drawings
    var xs = C.range(41).map(function (k) { return L * k / 40; });
    var w = 1.5 * (gk_extra + sw + qk), Mx;
    if (sup === "Simply supported")
      Mx = xs.map(function (x) { return w * x * (L - x) / 2 + 1.5 * P * Math.min(x, L - x) / 2; });
    else if (sup === "Cantilever")
      Mx = xs.map(function (x) { return -(w * Math.pow(L - x, 2) / 2 + 1.5 * P * (L - x)); });
    else
      Mx = xs.map(function (x) { return Ms - (Ms + Mh) * Math.pow(2 * x / L - 1, 2); });
    var ev = new View("Beam – longitudinal elevation");
    var Lm = L * 1000;
    ev.rect(0, 0, Lm, D, "OUTLINE", "concrete");
    ev.line(cover, cover + stir + bb.dia / 2, Lm - cover, cover + stir + bb.dia / 2, "REBAR");
    ev.line(cover, D - cover - stir - tb.dia / 2, Lm - cover, D - cover - stir - tb.dia / 2, "REBAR");
    if (sf) for (var ks = 1; ks <= sf.n; ks++) {
      var ysf = cover + stir + bb.dia + ks * sf.s;
      ev.line(cover, ysf, Lm - cover, ysf, "HIDDEN");
    }
    C.range(0, n_st, Math.max(1, Math.floor(n_st / 30))).forEach(function (k) {
      var x = 50 + k * sv;
      if (x < Lm - 50) ev.line(x, cover, x, D - cover, "REBAR");
    });
    (sup !== "Cantilever" ? [0, Lm] : [0]).forEach(function (x) {
      ev.rect(x === 0 ? x - 230 : x, -300, 230, 300 + D, "HIDDEN");
    });
    ev.dim(0, 0, Lm, 0, 12, "SPAN " + F(Lm, ",.0f"));
    ev.dim(Lm, 0, Lm, D, -8);
    ev.text(Lm / 2, D + 250, S(bb.n) + "-" + g(bb.dia) + "Ø BOTTOM, " + S(tb.n) + "-" + g(tb.dia) + "Ø TOP, " + S(legs) + "L-" + g(sd) + "Ø @ " +
      g(sv) + " c/c" + (s_end ? " (" + g(s_end) + " NEAR SUPPORTS)" : "") + (sf ? ", " + S(sf.n) + "-" + g(sf.dia) + "Ø EACH SIDE FACE" : ""), 2.4, { anchor: "middle" });
    var secv = CM.stirrup_section_view(b, D, cover, [tb.n, tb.dia], [bb.n, bb.dia], [legs, sd, sv], "Section");
    if (sf) for (var kf = 1; kf <= sf.n; kf++) {
      var yf = cover + stir + bb.dia + kf * sf.s;
      secv.bar_dot(cover + sd + sf.dia / 2, yf, sf.dia);
      secv.bar_dot(b - cover - sd - sf.dia / 2, yf, sf.dia);
    }
    var bm = diagram_view("Bending moment (factored, kN·m)", xs, Mx, Lm, 0.12 * Lm, "kN·m");
    var notes = ["Concrete M" + g(fck) + ", steel " + inp.fy + ", clear cover " + g(cover) + " mm.",
      "Anchorage: bottom bars extended Ld = " + F(Ld, ".0f") + " mm or hooked into supports.",
      s_end ? "Stirrups " + g(sd) + "Ø @ " + g(s_end) + " c/c within 2d = " + F(end_len, ",.0f") + " mm of supports (first at 50 mm), @ " +
        g(sv) + " c/c elsewhere (IS 13920:2016 cl 6.3.5)." : "Stirrups closer (half spacing) within 2d of supports."];
    if (sf) notes.push("Side-face bars " + S(sf.n) + "-" + g(sf.dia) + "Ø on each face (D > 750 mm, IS 456 cl 26.5.1.3).");
    var sheet = new Sheet("RCC beam – details", "RC-B1", [ev, secv, bm], notes);
    var summary = { "Section": g(b) + " × " + g(D) + " mm", "Bottom": S(bb.n) + "-" + g(bb.dia) + "Ø", "Top": S(tb.n) + "-" + g(tb.dia) + "Ø",
      "Stirrups": s_end ? st_txt : S(legs) + "L-" + g(sd) + "Ø @ " + g(sv), "Mu+ / Mu−": F(Ms, ".1f") + " / " + F(Mh, ".1f") + " kN·m",
      "Max utilisation": F(c.max_utilisation, ".2f") };
    if (sf) summary["Side face"] = S(sf.n) + "-" + g(sf.dia) + "Ø each face";
    return C.DesignResult({ module: "rcc_beam", title: "RCC beam", inputs: inp, calc: c, summary: summary, drawings: [sheet],
      quantities: qty, bbs: bbs, tables: {}, references: REFS });
  }
  M.run_beam = run_beam;

  var BEAM_PARAMS = [
    Param("span", "Effective span", 5.0, "m", { min: 1, max: 15, step: 0.1, group: "Geometry" }),
    Param("support", "Support condition", "Simply supported", { kind: "select",
      options: ["Simply supported", "Cantilever", "Continuous – end span", "Continuous – interior span"],
      group: "Geometry" }),
    Param("b", "Width b", 230.0, "mm", { min: 150, max: 1000, step: 10, group: "Geometry" }),
    Param("dl", "Superimposed dead load (slab + wall + finishes)", 18.0, "kN/m", { min: 0, max: 200, group: "Loads",
      help: "e.g. 230 mm brick wall 3 m high ≈ 0.23 × 3 × 20 = 13.8 kN/m" }),
    Param("ll", "Imposed load", 8.0, "kN/m", { min: 0, max: 200, group: "Loads" }),
    Param("point", "Point load (mid-span / free end)", 0.0, "kN", { min: 0, max: 1000, group: "Loads" }),
    Param("stirrup_dia", "Stirrup diameter", 8.0, "mm", { kind: "select", options: [6.0, 8.0, 10.0, 12.0], group: "Detailing" })
  ].concat(_mat_params(25.0), [
    Param("nos", "Number of such beams (quantity)", 1, { kind: "int", min: 1, max: 500, group: "Quantity" }),
    Param("D", "Overall depth D (check)", 450.0, "mm", { min: 200, max: 1500, step: 25, group: "My design", modes: CHECK }),
    Param("bot_n", "Bottom bars – number (check)", 3, { kind: "int", min: 2, max: 12, group: "My design", modes: CHECK }),
    Param("bot_dia", "Bottom bars – dia (check)", 20.0, "mm", { kind: "select", options: BAR_DIAS.slice(),
      group: "My design", modes: CHECK }),
    Param("top_n", "Top bars – number (check)", 2, { kind: "int", min: 2, max: 12, group: "My design", modes: CHECK }),
    Param("top_dia", "Top bars – dia (check)", 12.0, "mm", { kind: "select", options: BAR_DIAS.slice(),
      group: "My design", modes: CHECK }),
    Param("stirrup_s", "Stirrup spacing (check)", 150.0, "mm", { min: 50, max: 300, step: 10, group: "My design",
      modes: CHECK })
  ]);
  M.BEAM_PARAMS = BEAM_PARAMS;
  C.register({ id: "rcc_beam", phase: 1, category: "RCC building", name: "RCC beam", icon: "➖", description: "Singly / doubly reinforced rectangular beam: " +
    "flexure, shear stirrups, deflection, development length; IS 456 Table 12/13 for continuous beams.",
    params: BEAM_PARAMS, run: run_beam, references: REFS });

  /* =========================================================================== SLAB */
  var T26_R = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.75, 2.0];
  function z8() { return [0, 0, 0, 0, 0, 0, 0, 0]; }
  var T26 = {  // case: (short −, short +, long −, long +)   – IS 456 Table 26 (verify against your copy)
    "1 Interior panel": [[.032, .037, .043, .047, .051, .053, .060, .065], [.024, .028, .032, .036, .039, .041, .045, .049], .032, .024],
    "2 One short edge discontinuous": [[.037, .043, .048, .051, .055, .057, .064, .068], [.028, .032, .036, .039, .041, .044, .048, .052], .037, .028],
    "3 One long edge discontinuous": [[.037, .044, .052, .057, .063, .067, .077, .085], [.028, .033, .039, .044, .047, .051, .059, .065], .037, .028],
    "4 Two adjacent edges discontinuous": [[.047, .053, .060, .065, .071, .075, .084, .091], [.035, .040, .045, .049, .053, .056, .063, .069], .047, .035],
    "5 Two short edges discontinuous": [[.045, .049, .052, .056, .059, .060, .065, .069], [.035, .037, .040, .043, .044, .045, .049, .052], 0.0, .035],
    "6 Two long edges discontinuous": [z8(), [.035, .043, .051, .057, .063, .068, .080, .088], .045, .035],
    "7 Three edges discontinuous (one long edge continuous)": [[.057, .064, .071, .076, .080, .084, .091, .097], [.043, .048, .053, .057, .060, .064, .069, .073], 0.0, .043],
    "8 Three edges discontinuous (one short edge continuous)": [z8(), [.043, .051, .059, .065, .071, .076, .087, .096], .057, .043],
    "9 Four edges discontinuous": [z8(), [.056, .064, .072, .079, .085, .089, .100, .107], 0.0, .056]
  };
  var SLAB_TYPES = ["Two-way, restrained corners (Table 26)", "Two-way, simply supported, corners free (Table 27)",
    "One-way, simply supported", "One-way, continuous", "Cantilever"];
  M.T26_R = T26_R; M.T26 = T26; M.SLAB_TYPES = SLAB_TYPES;

  function run_slab(inp, mode) {
    var c = new Calc("RCC slab");
    var fck = num(inp.fck), fy = _fy(inp);
    var sp = [num(inp.lx), num(inp.ly)].sort(function (a, b) { return a - b; });
    var lx = sp[0], ly = sp[1];
    var typ = inp.type;
    var r = ly / lx;
    if (typ.indexOf("Two-way") === 0 && r > 2) {
      c.warn("Span ratio", "ly/lx = " + F(r, ".2f") + " > 2 – designed as one-way continuous instead", "IS 456 cl 24.4");
      typ = "One-way, continuous";
    }
    var cover = _cover(c, inp, mode, "slab");
    var LL = num(inp.ll);
    var ff = num(inp.finish);
    var D;
    if (mode === "check") D = num(inp.D);
    else {
      var div = ({ "One-way, simply supported": 28, "One-way, continuous": 32, "Cantilever": 10 })[typ] || 35;
      D = Math.max(ceil_to(lx * 1000 / div + cover + 5, 5), typ !== "Cantilever" ? 100 : 125);
      if (mode === "thumb")
        c.info("Thumb-rule thickness", "lx/35 two-way, /28 one-way SS, /32 continuous, /10 cantilever", "IS 456 cl 24.1");
    }

    function moments(D) {
      var w = 1.5 * (25 * D / 1000 + ff + LL), l2 = Math.pow(lx, 2);
      if (typ.indexOf("Two-way, restrained") === 0) {
        var t = T26[inp["case"]];
        if (!t) throw new Error("KeyError: " + inp["case"]);
        var sn = t[0], spp = t[1], ln = t[2], lp = t[3];
        var ax_n = interp(r, T26_R, sn), ax_p = interp(r, T26_R, spp);
        return [w, { "Mx+": ax_p * w * l2, "Mx−": ax_n * w * l2, "My+": lp * w * l2,
          "My−": ln * w * l2 }, [ax_p, ax_n, lp, ln]];
      }
      if (typ.indexOf("Two-way, simply") === 0) {
        var ax = Math.pow(r, 4) / (8 * (1 + Math.pow(r, 4)));
        var ay = Math.pow(r, 2) / (8 * (1 + Math.pow(r, 4)));
        return [w, { "Mx+": ax * w * l2, "Mx−": 0.0, "My+": ay * w * l2, "My−": 0.0 }, [ax, 0, ay, 0]];
      }
      if (typ === "One-way, simply supported")
        return [w, { "Mx+": w * l2 / 8, "Mx−": 0.0, "My+": 0.0, "My−": 0.0 }, [0.125, 0, 0, 0]];
      if (typ === "One-way, continuous") {
        // IS 456 Table 12: dead load 1/12 (span) & 1/10 (support), imposed load 1/10 & 1/9 – factored separately
        var wd = 1.5 * (25 * D / 1000 + ff), wl = 1.5 * LL;
        var Mp = (wd / 12 + wl / 10) * l2, Mn = (wd / 10 + wl / 9) * l2;
        return [w, { "Mx+": Mp, "Mx−": Mn, "My+": 0.0, "My−": 0.0 }, [Mp / (w * l2), Mn / (w * l2), 0, 0], [wd, wl]];
      }
      return [w, { "Mx+": 0.0, "Mx−": w * l2 / 2, "My+": 0.0, "My−": 0.0 }, [0, 0.5, 0, 0]];
    }

    var sup = ({ "One-way, simply supported": "simply supported", "Cantilever": "cantilever" })[typ] ||
      (typ.indexOf("simply") >= 0 ? "simply supported" : "continuous");
    // IS 456 cl 23.2.1: Table 26 panels with two opposite / three / four edges discontinuous (cases 5–9) are checked
    // with the simply supported basic ratio (20); cases 1–4 (continuous on both sides in at least one direction) with 26
    if (typ.indexOf("Two-way, restrained") === 0 && /^[5-9]\b/.test(String(inp["case"] || ""))) sup = "simply supported";
    var mm, w, Mo, d;
    var defl_key = typ === "Cantilever" ? "Mx−" : "Mx+";   // IS 456 cl 23.2.1: steel at mid-span (support for cantilevers)
    var Vcoef = typ === "Cantilever" ? 1.0 : typ === "One-way, continuous" ? 0.6 : 0.5;   // IS 456 Table 13 for continuous
    if (mode !== "check") {
      for (var it = 0; it < 40; it++) {
        mm = moments(D); w = mm[0]; Mo = mm[1];
        d = D - cover - 5;
        var sc = new Calc("s");
        var Mmax = maxv(Mo);
        var f = RC.flexure(sc, Mmax, 1000, d, fck, fy, "slab", { D: D });
        // deflection with the bars that would actually be provided for the mid-span moment
        var fdf = RC.flexure(sc, Mo[defl_key], 1000, d, fck, fy, "slab", { D: D });
        var bdf = RC.slab_bars(fdf.Ast, d, D, true, DS.detailing ? { dias: [8, 10, 12, 16], rule: { member: "slab", role: "main" } } :
          { dias: [8, 10, 12, 16] });
        var ok = f.ok && RC.deflection(sc, lx * 1000, d, sup, fy, fdf.Ast, Math.max(bdf.Ast_prov, fdf.Ast), 1000);
        var Vd = Vcoef * w * lx;
        ok = !!ok & (Vd * 1000 / (1000 * d) <= RC.k_slab(D) * 0.36);
        if (ok) break;
        D += 5;
      }
    }
    mm = moments(D); w = mm[0]; Mo = mm[1];
    var coefs = mm[2];
    c.section("Loads");
    c.let("Short / long span", "lx / ly", g(lx) + " / " + g(ly), "m", "", "ly/lx = " + F(r, ".2f"));
    c.let("Slab type", "", typ + (typ.indexOf("restrained") >= 0 ? " – case " + inp["case"] : ""), "",
      typ.indexOf("Two") === 0 ? "IS 456 Annex D" : "IS 456 cl 22");
    c.let("Thickness", "D", D, "mm");
    w = c.calc("Factored load", "wu", "1.5*(25*D/1000 + ff + ll)", "kN/m²", "IS 875 / IS 456 Table 18", { D: D, ff: ff, ll: LL });
    if (typ.indexOf("Two-way") === 0) {
      c.calc("Short-span coefficient (+)", "αx", "a", "", "IS 456 Table 26/27", { a: R(coefs[0], 4) });
      c.calc("Long-span coefficient (+)", "αy", "a", "", "IS 456 Table 26/27", { a: R(coefs[2], 4) });
    }
    var bars = {};
    var DT = DS.detailing, used = [];
    c.section("Reinforcement");
    var d_x = D - cover - 5;
    [["Mx+", "short span – bottom", d_x], ["Mx−", "short span – top at supports", d_x],
      ["My+", "long span – bottom", d_x - 10], ["My−", "long span – top at supports", d_x - 10]].forEach(function (t) {
      var key = t[0], label = t[1], dd = t[2];
      if (Mo[key] <= 0) return;
      var Mk = typ === "One-way, continuous" ?
        c.calc("Moment " + label, key, key === "Mx+" ? "(wd/12 + wl/10)*lx**2" : "(wd/10 + wl/9)*lx**2", "kN·m/m",
          "IS 456 Table 12", "wd = 1.5 × dead, wl = 1.5 × imposed", { wd: R(mm[3][0], 3), wl: R(mm[3][1], 3), lx: lx }) :
        c.calc("Moment " + label, key, "coef*w*lx**2", "kN·m/m", "", { coef: R(Mo[key] / (w * Math.pow(lx, 2)), 4),
          w: w, lx: lx });
      var f = RC.flexure(c, Mk, 1000, dd, fck, fy, "slab", { D: D, tag: "(" + label + ")" });
      var given = (mode === "check" && key === "Mx+") ? [num(inp.main_dia), num(inp.main_s)] : null;
      var bs;
      if (given) {
        bs = { dia: given[0], spacing: given[1], Ast_prov: 1000 * bar_area(given[0]) / given[1] };
        c.check("Steel provided ≥ required (short span bottom)", bs.Ast_prov, f.Ast, { unit: "mm²/m", clause: "", mode: ">=" });
        if (DT) DT.check_bars(c, "slab", "main", given[0], given[1], { d: dd, D: D, label: "short span bottom" });
      } else if (DT) {
        bs = RC.slab_bars(f.Ast, dd, D, true, { dias: [8, 10, 12, 16], rule: { member: "slab", role: "main", prefer: used.slice() } });
        DT.record(c, label, bs);
        if (bs.short) c.check("Steel provided ≥ required (" + label + ")", bs.Ast_prov, f.Ast, { unit: "mm²/m", clause: "", mode: ">=" });
      } else {
        bs = RC.slab_bars(f.Ast, dd, D, true, { dias: [8, 10, 12, 16] });
      }
      if (used.indexOf(bs.dia) < 0) used.push(bs.dia);
      bs.req = f.Ast;
      c.let("Bars – " + label, "", g(bs.dia) + "Ø @ " + g(bs.spacing) + " c/c", "", "IS 456 cl 26.3.3");
      bars[key] = bs;
    });
    if (!("My+" in bars)) {
      var mainb = bars["Mx+"] || bars["Mx−"];
      var dist = DT ? RC.slab_bars(fy > 250 ? 0.0012 * 1000 * D : 0.0015 * 1000 * D, d_x - 10, D, false,
        { dias: [8, 10, 12], rule: { member: "slab", role: "dist", main_dia: mainb ? mainb.dia : null } }) :
        RC.slab_bars(fy > 250 ? 0.0012 * 1000 * D : 0.0015 * 1000 * D, d_x - 10, D, false, { dias: [8, 10] });
      if (DT) DT.record(c, "distribution", dist);
      c.let("Distribution bars", "", g(dist.dia) + "Ø @ " + g(dist.spacing) + " c/c", "", "IS 456 cl 26.5.2.1");
      bars.dist = dist;
    }
    c.section("Shear & deflection");
    var V = c.calc("Shear at support (approx.)", "Vu", typ === "Cantilever" ? "w*lx" : typ === "One-way, continuous" ? "0.6*w*lx" : "w*lx/2",
      "kN/m", typ === "One-way, continuous" ? "IS 456 Table 13" : "", { w: w, lx: lx });
    var main = bars["Mx+"] || bars["Mx−"];
    var dbars = bars[defl_key] || main;
    RC.shear(c, V, 1000, d_x, 100 * main.Ast_prov / (1000 * d_x), fck, fy, "slab", { D: D });
    // fs = 0.58 fy × Ast,req / Ast,prov of the governing (mid-span) bars – IS 456 Fig. 4
    RC.deflection(c, lx * 1000, d_x, sup, fy, dbars.req != null ? dbars.req : dbars.Ast_prov, dbars.Ast_prov, 1000);
    if (typ.indexOf("Two-way, restrained") === 0)
      c.info("Torsion reinforcement at corners", "top & bottom mesh of 3/4 short-span steel over lx/5 = " +
        F(lx / 5, ".2f") + " m at discontinuous corners", "IS 456 Annex D-1.8");
    c.thumb("Slab thickness", lx * 1000 / (typ.indexOf("Two") === 0 ? 35 : 28) + cover, D, "mm",
      "lx/35 (two-way) or lx/28 (one-way) + cover", "IS 456 cl 24.1 practice");
    c.miss("Openings / concentrated loads (e.g. water tank on slab) need separate check", "IS 456 Annex D", "Advisory");
    var nos = int(inp.nos);
    // BBS – supports (walls / beams) 230 mm wide assumed; bars stop at the cover from the outer face of the supports
    var BB = DS.bbs, sw = BB.cfg.slab_sw, cant = typ === "Cantilever", bbs = [], b_, o;
    var runX = lx * 1000 + sw - 2 * cover, runY = ly * 1000 + sw - 2 * cover;
    if ("Mx+" in bars) {
      b_ = bars["Mx+"];
      o = BB.stock(BB.straight(b_.dia, runX), b_.dia, fck, fy);
      bbs.push(BB.row("Slab", "S1", b_.dia, "straight", nos * BB.count(ly * 1000, b_.spacing, 50), o, "short span bottom"));
    }
    if ("My+" in bars) {
      b_ = bars["My+"];
      o = BB.stock(BB.straight(b_.dia, runY), b_.dia, fck, fy);
      bbs.push(BB.row("Slab", "S2", b_.dia, "straight", nos * BB.count(lx * 1000, b_.spacing, 50), o, "long span bottom"));
    }
    if ("Mx−" in bars) {
      b_ = bars["Mx−"];
      // continuous / restrained edge: top bars 0.3 lx into the span (SP 34 Fig. curtailment / IS 456 Annex D) with an L-leg into the support
      o = cant ? BB.stock(BB.lbar(b_.dia, lx * 1000 - cover + BB.Ld(b_.dia, fck, fy), D - 2 * cover), b_.dia, fck, fy)
        : BB.lbar(b_.dia, 0.3 * lx * 1000 + sw - cover, D - 2 * cover);
      bbs.push(BB.row("Slab", "S3", b_.dia, cant ? "L (main top, Ld into support)" : "L (top over supports, 0.3 lx)", nos * (cant ? 1 : 2) * BB.count(ly * 1000, b_.spacing, 50), o, cant ? "cantilever main top" : "over supports"));
    }
    if ("My−" in bars) {
      b_ = bars["My−"];
      o = BB.lbar(b_.dia, 0.3 * lx * 1000 + sw - cover, D - 2 * cover);
      bbs.push(BB.row("Slab", "S4", b_.dia, "L (top over supports, 0.3 lx)", nos * 2 * BB.count(lx * 1000, b_.spacing, 50), o, "over supports"));
    }
    if ("dist" in bars) {
      b_ = bars.dist;
      o = BB.stock(BB.straight(b_.dia, runY), b_.dia, fck, fy);
      bbs.push(BB.row("Slab", "S5", b_.dia, "straight", nos * BB.count(lx * 1000, b_.spacing, 50), o, "distribution"));
    }
    var qty = _rcc_qty("slabs", fck, [row("Slab", nos, lx, ly, D / 1000)], [row("Slab soffit", nos, lx, ly)], bbs);
    // drawing
    var pv = new View("Slab – reinforcement plan");
    var Lx = lx * 1000, Ly = ly * 1000, k, x, y;
    pv.rect(0, 0, Ly, Lx, "OUTLINE");
    if ("Mx+" in bars) {
      for (k = 0; k < 6; k++) {
        x = Ly * (k + 0.5) / 6;
        pv.line(x, 50, x, Lx - 50, "REBAR");
      }
      pv.text(Ly / 2 + 60, Lx / 2, g(bars["Mx+"].dia) + "Ø @ " + g(bars["Mx+"].spacing) + " (short span, bottom)", 2.2);
    }
    if ("My+" in bars || "dist" in bars) {
      b_ = bars["My+"] || bars.dist;
      for (k = 0; k < 4; k++) {
        y = Lx * (k + 0.5) / 4;
        pv.line(50, y, Ly - 50, y, "HIDDEN");
      }
      pv.text(Ly / 2, Lx * 0.12, g(b_.dia) + "Ø @ " + g(b_.spacing) + " (" + ("My+" in bars ? "long span" : "distribution") + ")",
        2.2, { anchor: "middle" });
    }
    if (DT) {   // top bars over supports were designed but not labelled on the plan
      if ("Mx−" in bars) pv.text(Ly * 0.02, Lx * 0.88, g(bars["Mx−"].dia) + "Ø @ " + g(bars["Mx−"].spacing) + " TOP over supports (short span)", 2.0);
      if ("My−" in bars) pv.text(Ly * 0.02, Lx * 0.78, g(bars["My−"].dia) + "Ø @ " + g(bars["My−"].spacing) + " TOP over supports (long span)", 2.0);
    }
    pv.dim(0, Lx, Ly, Lx, -8, "ly " + F(Ly, ",.0f"));
    pv.dim(Ly, 0, Ly, Lx, -8, "lx " + F(Lx, ",.0f"));
    var sv = new View("Slab – section across short span");
    sv.rect(0, 0, Lx, D, "OUTLINE", "concrete");
    sv.line(cover, cover + 5, Lx - cover, cover + 5, "REBAR");
    if ("Mx−" in bars) {
      [[0, 0.3 * Lx], [0.7 * Lx, Lx]].forEach(function (p) {
        var x0 = p[0], x1 = p[1];
        sv.line(x0 + cover, D - cover - 5, x1 - (x1 < Lx ? 0 : cover), D - cover - 5, "REBAR");
      });
    }
    sv.dim(Lx, 0, Lx, D, -8);
    var sheet = new Sheet("RCC slab – reinforcement", "RC-S1", [pv, sv],
      ["Slab " + g(D) + " thick, M" + g(fck) + ", " + inp.fy + ", cover " + g(cover) + " mm.",
        "Bottom bars: short-span bars below long-span bars.",
        "Mx−" in bars ? "Top bars over continuous supports extend 0.3 lx from face of support." :
          "Alternate bottom bars may be cranked up at 0.1 l from supports.",
        typ.indexOf("Two-way, restrained") === 0 ? "Torsion mesh at discontinuous corners (Annex D-1.8)." :
          "Provide 8Ø @ 200 top bars along simply supported edges (crack control)."]);
    var summary = { "Thickness": g(D) + " mm", "Type": typ };
    Object.keys(bars).forEach(function (kk) { summary["Bars " + kk] = g(bars[kk].dia) + "Ø @ " + g(bars[kk].spacing); });
    summary["Max utilisation"] = F(c.max_utilisation, ".2f");
    return C.DesignResult({ module: "rcc_slab", title: "RCC slab", inputs: inp, calc: c, summary: summary, drawings: [sheet],
      quantities: qty, bbs: bbs, tables: {}, references: REFS });
  }
  M.run_slab = run_slab;

  var LL_OPTS = (function () {
    var s = [];
    Object.keys(LD.LIVE_LOADS).forEach(function (k) { var v = LD.LIVE_LOADS[k]; if (s.indexOf(v) < 0) s.push(v); });
    return s.sort(function (a, b) { return a - b; });
  })();
  var SLAB_PARAMS = [
    Param("lx", "Span 1 (effective)", 3.6, "m", { min: 1, max: 10, step: 0.05, group: "Geometry" }),
    Param("ly", "Span 2 (effective)", 4.8, "m", { min: 1, max: 15, step: 0.05, group: "Geometry" }),
    Param("type", "Slab type", SLAB_TYPES[0], { kind: "select", options: SLAB_TYPES, group: "Geometry" }),
    Param("case", "Edge condition (Table 26)", "4 Two adjacent edges discontinuous", { kind: "select", options: Object.keys(T26),
      group: "Geometry" }),
    Param("ll", "Imposed load", 2.0, "kN/m²", { kind: "select", options: LL_OPTS,
      group: "Loads", help: "IS 875-2: residential 2.0, office 2.5–4.0, assembly 4–5" }),
    Param("finish", "Floor finish + partitions", 1.5, "kN/m²", { min: 0, max: 5, step: 0.25, group: "Loads" })
  ].concat(_mat_params(20.0), [
    Param("nos", "Number of such panels (quantity)", 1, { kind: "int", min: 1, max: 500, group: "Quantity" }),
    Param("D", "Thickness (check)", 150.0, "mm", { min: 75, max: 400, step: 5, group: "My design", modes: CHECK }),
    Param("main_dia", "Short-span bottom bar dia (check)", 10.0, "mm", { kind: "select", options: [8.0, 10.0, 12.0, 16.0],
      group: "My design", modes: CHECK }),
    Param("main_s", "Short-span bottom bar spacing (check)", 150.0, "mm", { min: 75, max: 300, step: 5, group: "My design",
      modes: CHECK })
  ]);
  M.SLAB_PARAMS = SLAB_PARAMS;
  C.register({ id: "rcc_slab", phase: 1, category: "RCC building", name: "RCC slab (one-way / two-way)", icon: "▭",
    description: "Two-way slabs by IS 456 Table 26 (9 edge cases) or Table 27, one-way and cantilever slabs; " +
      "steel both directions, shear, deflection, corner torsion steel.", params: SLAB_PARAMS, run: run_slab, references: REFS });

  /* =========================================================================== COLUMN */
  var END_K = { "Both ends fixed (0.65)": 0.65, "Fixed–hinged (0.80)": 0.80, "Both ends hinged (1.00)": 1.00,
    "Fixed–partially restrained, sway (1.20)": 1.20, "Fixed–free (2.00)": 2.00 };
  M.END_K = END_K;

  function run_column(inp, mode) {
    var c = new Calc("RCC column");
    var fck = num(inp.fck), fy = _fy(inp);
    var b = num(inp.b), D = num(inp.D);
    var l = num(inp.length);
    if (!(inp.ends in END_K)) throw new Error("KeyError: " + inp.ends);
    var K = END_K[inp.ends];
    var Pu = num(inp.Pu), Mux0 = num(inp.Mux), Muy0 = num(inp.Muy);
    var cover = _cover(c, inp, mode, "column");
    var lex = K * l;
    /* design moments for section b × D: min. eccentricity (cl 25.4) + additional moments of slender columns (cl 39.7.1) */
    function moments(b, D) {
      var sx_ = lex * 1000 / D, sy_ = lex * 1000 / b;
      var mx = Math.max(Mux0, Pu * Math.max(l * 1000 / 500 + D / 30, 20) / 1000) + (sx_ > 12 ? Pu * D / 2000 * Math.pow(sx_, 2) / 1000 : 0);
      var my = Math.max(Muy0, Pu * Math.max(l * 1000 / 500 + b / 30, 20) / 1000) + (sy_ > 12 ? Pu * b / 2000 * Math.pow(sy_, 2) / 1000 : 0);
      return [mx, my];
    }
    var mm0 = moments(b, D), Mux = mm0[0], Muy = mm0[1];
    var tie = 8.0;

    function capacity(n, dia) {
      var rb = RC.rect_bars(b, D, cover, tie, dia, n, GAP), mj = rb[0], mn = rb[1], pts = rb[2];
      var Asc = pts.length * bar_area(dia);
      var Pz = RC.puz(b, D, Asc, fck, fy);
      var Mx1 = RC.column_capacity(Pu, b, D, mj, fck, fy);
      var My1 = RC.column_capacity(Pu, D, b, mn, fck, fy);
      var an = interp(Pu / Pz, [0.2, 0.8], [1.0, 2.0]);
      var ir = Mx1 > 0 && My1 > 0 ? Math.pow(Mux / Mx1, an) + Math.pow(Muy / My1, an) : 99;
      return [Asc, Pz, Mx1, My1, an, ir, pts.length];
    }

    var DT = DS.detailing;
    var GAP = DT ? 300 : undefined;
    var COL_DIAS = DT ? DT.allowed("column", "main", [12, 16, 20, 25, 32]).dias : [12, 16, 20, 25, 32];
    /* IS 456 cl 26.5.3.1(g): longitudinal bars ≤ 300 mm c/c along the periphery */
    function periph_gap(n_, dia_) {
      var pts_ = RC.rect_bars(b, D, cover, tie, dia_, n_, GAP)[2], gap = 0;
      var e = cover + tie + dia_ / 2;
      [[0, e], [0, b - e], [1, e], [1, D - e]].forEach(function (f) {
        var on = pts_.filter(function (q) { return Math.abs(q[f[0]] - f[1]) < 1e-6; }).map(function (q) { return q[1 - f[0]]; })
          .sort(function (x, y) { return x - y; });
        for (var k = 1; k < on.length; k++) gap = Math.max(gap, on[k] - on[k - 1]);
      });
      return gap;
    }
    function search() {
      var best = null;
      COL_DIAS.forEach(function (dia_) {
        for (var n_ = 4; n_ < 25; n_ += 2) {
          if (DT && periph_gap(n_, dia_) > 300) continue;
          var pt_ = 100 * n_ * bar_area(dia_) / (b * D);
          if (pt_ < 0.8 || pt_ > 3.0) continue;              // design target ≤ 3 % (laps double the steel)
          var res_ = capacity(n_, dia_);
          if (res_[5] <= 1.0 && Pu <= 0.95 * res_[1]) {
            if (best === null || n_ * bar_area(dia_) < best[0]) best = [n_ * bar_area(dia_), n_, dia_];
            break;
          }
        }
      });
      return best;
    }

    var n, dia;
    var b0 = b, D0 = D;
    if (mode !== "check") {
      // enlarge the section first (silently) – every step below is then recorded with the final b × D
      for (var it = 0; it < 30; it++) {
        if (search()) break;
        if (D < 2 * b) D += 50;
        else b += 50;
        var mm1 = moments(b, D); Mux = mm1[0]; Muy = mm1[1];
      }
    }
    c.section("Slenderness & minimum eccentricity");
    if (b !== b0 || D !== D0)
      c.info("Section enlarged", g(b0) + " × " + g(D0) + " → " + g(b) + " × " + g(D) + " mm so that ≤ 4 % steel works " +
        "(all values below are for the enlarged section)", "IS 456 cl 26.5.3.1");
    lex = c.calc("Effective length (both axes)", "lex", "K*l", "m", "IS 456 Table 28", { K: K, l: l });
    var sx = c.calc("Slenderness about major axis", "lex/D", "lex*1000/D", "", "IS 456 cl 25.1.2", { lex: lex, D: D });
    var sy = c.calc("Slenderness about minor axis", "ley/b", "lex*1000/b", "", "IS 456 cl 25.1.2", { lex: lex, b: b });
    c.check("Slenderness ≤ 60", Math.max(sx, sy), 60, { unit: "", clause: "IS 456 cl 25.3.1" });
    var ex = c.calc("Min. eccentricity (major)", "ex,min", "max(l*1000/500 + D/30, 20)", "mm", "IS 456 cl 25.4", { l: l, D: D });
    var ey = c.calc("Min. eccentricity (minor)", "ey,min", "max(l*1000/500 + b/30, 20)", "mm", "IS 456 cl 25.4", { l: l, b: b });
    Mux = Math.max(Mux0, Pu * ex / 1000);
    Muy = Math.max(Muy0, Pu * ey / 1000);
    if (sx > 12) {
      var Max_ = c.calc("Additional moment (major)", "Max", "Pu*D/2000*(s)**2/1000", "kN·m", "IS 456 cl 39.7.1",
        "k = 1 (conservative, cl 39.7.1.1 reduction not applied)", { Pu: Pu, D: D, s: sx });
      Mux += Max_;
    }
    if (sy > 12) {
      var May_ = c.calc("Additional moment (minor)", "May", "Pu*b/2000*(s)**2/1000", "kN·m", "IS 456 cl 39.7.1",
        { Pu: Pu, b: b, s: sy });
      Muy += May_;
    }
    c.let("Design moments", "Mux / Muy", F(Mux, ".1f") + " / " + F(Muy, ".1f"), "kN·m");
    if (mode === "check") {
      n = int(inp.n_bars); dia = num(inp.bar_dia);
      var n_used = Math.max(4, n + (((n % 2) + 2) % 2));
      if (n_used !== n)
        c.warn("Number of bars", S(n) + " bars cannot be placed symmetrically – capacity computed with " + S(n_used) +
          " bars; provide an even number", "IS 456 cl 26.5.3.1 / SP 34");
    } else {
      var best = null;
      COL_DIAS.forEach(function (dd) {
        for (var nn = 4; nn < 25; nn += 2) {
          if (DT && periph_gap(nn, dd) > 300) continue;
          var As_ = nn * bar_area(dd);
          var pt = 100 * As_ / (b * D);
          if (pt < 0.8 || pt > 4.0) continue;
          var res = capacity(nn, dd);
          if (res[5] <= 1.0 && Pu <= 0.95 * res[1]) {
            if (best === null || As_ < best[0]) best = [As_, nn, dd];
            break;
          }
        }
      });
      if (best === null) {
        c.warn("Section too small", "No arrangement within 4 % steel works – increase b × D", "IS 456 cl 26.5.3.1");
        n = 12; dia = 25.0;
      } else {
        n = best[1]; dia = best[2];
      }
    }
    var cap = capacity(n, dia);
    var Asc = cap[0], Pz = cap[1], Mx1 = cap[2], My1 = cap[3], an = cap[4], ir = cap[5];
    n = cap[6];
    c.section("Biaxial bending check (IS 456 cl 39.6)");
    c.let("Longitudinal bars", "", S(n) + "-" + g(dia) + "Ø", "", "", "Asc = " + F(Asc, ".0f") + " mm², pt = " + F(100 * Asc / (b * D), ".2f") + " %");
    c.check("Steel ≥ 0.8 % of gross area", 100 * Asc / (b * D), 0.8, { unit: "%", clause: "IS 456 cl 26.5.3.1(a)", mode: ">=" });
    c.check("Steel ≤ 4 % (practical limit, 6 % max.)", 100 * Asc / (b * D), 4.0, { unit: "%", clause: "IS 456 cl 26.5.3.1(a)" });
    c.check("Minimum 4 bars of ≥ 12 mm", Math.min(n, dia / 3), 4, { unit: "", clause: "IS 456 cl 26.5.3.1", mode: ">=" });
    if (DT) {
      var gap = periph_gap(n, dia);
      c.check("Bar spacing along periphery ≤ 300 mm", gap, 300, { unit: "mm", clause: "IS 456 cl 26.5.3.1(g)" });
      if (mode === "check") DT.check_bars(c, "column", "main", dia, null, { label: "longitudinal bars" });
      else DT.record(c, "longitudinal bars", { text: S(n) + "-" + g(dia) + "Ø: Ø ∈ {" + COL_DIAS.join(", ") + "} (" +
        DT.min_dia("column", "main").reason + "; " + DT.min_dia("column", "main").clause + "); least steel with interaction ≤ 1, " +
        "0.8 % ≤ p ≤ 4 % and ≤ 300 mm c/c along the periphery", clause: "IS 456 cl 26.5.3.1" });
    }
    Pz = c.calc("Pure axial capacity", "Puz", "(0.45*fck*(b*D - Asc) + 0.75*fy*Asc)/1000", "kN", "IS 456 cl 39.6",
      { fck: fck, b: b, D: D, Asc: R(Asc), fy: fy });
    c.calc("Uniaxial capacity about major axis at Pu", "Mux1", "m", "kN·m", "IS 456 cl 39.1 (strain compatibility)",
      { m: R(Mx1, 2) });
    c.calc("Uniaxial capacity about minor axis at Pu", "Muy1", "m", "kN·m", "IS 456 cl 39.1", { m: R(My1, 2) });
    an = c.calc("Exponent αn", "αn", "min(max(1 + (Pu/Puz - 0.2)/0.6, 1), 2)", "", "IS 456 cl 39.6", { Pu: Pu,
      Puz: R(Pz, 1) });
    var crushed = !(Mx1 > 0 && My1 > 0);
    if (crushed) {
      // Pu exceeds the axial capacity of the section: there is no moment capacity left – interaction not applicable
      c.check("Axial load Pu ≤ Puz", Pu, Pz, { unit: "kN", clause: "IS 456 cl 39.6", note: "no moment capacity left at this Pu" });
      c.ok("Biaxial interaction ≤ 1.0", false, { detail: "FAIL – section crushes: Pu = " + F(Pu, ".0f") + " kN exceeds the axial " +
        "capacity (Puz = " + F(Pz, ".0f") + " kN), no moment capacity left (Mux1 = Muy1 = 0); enlarge b × D, raise fck or add steel",
        clause: "IS 456 cl 39.6" });
      ir = Infinity;
    } else {
      ir = c.calc("Interaction", "IR", "(Mux/Mux1)**an + (Muy/Muy1)**an", "", "IS 456 cl 39.6", { Mux: R(Mux, 2),
        Mux1: R(Mx1, 2), Muy: R(Muy, 2), Muy1: R(My1, 2), an: R(an, 3) });
      c.check("Biaxial interaction ≤ 1.0", ir, 1.0, { unit: "", clause: "IS 456 cl 39.6" });
    }
    c.section("Lateral ties");
    tie = Math.max(6.0, dia / 4);
    tie = [6.0, 8.0, 10.0, 12.0].filter(function (x) { return x >= tie; })[0];
    if (tie === undefined) tie = 12.0;
    var st = c.calc("Tie spacing", "st", "floor(min(b, 16*dia, 300)/25)*25", "mm", "IS 456 cl 26.5.3.2(c)", { b: Math.min(b, D),
      dia: dia });
    var conf = null;
    if (DT) {
      var tb_ = DT.tie_bars(dia, b, D, null, { length: l });
      DT.record(c, "lateral ties", tb_);
      tie = tb_.dia; st = Math.min(st, tb_.s);
      if (tb_.s_conf) {
        conf = { s: tb_.s_conf, lo: tb_.lo };
        c.let("Special confining zone", "lo", tb_.lo, "mm", "IS 13920:2016 cl 8.1", g(tie) + "Ø @ " + g(tb_.s_conf) + " c/c at each end");
      }
    }
    c.let("Ties adopted", "", g(tie) + "Ø @ " + g(st) + " c/c" + (conf ? " (" + g(conf.s) + " c/c over " + g(conf.lo) + " at ends)" : ""), "",
      "IS 456 cl 26.5.3.2");
    c.thumb("Column size (Pu/(0.4 fck + 0.67 fy p))", Pu * 1000 / (0.4 * fck + 0.67 * fy * 0.01) / Math.max(b, 1), D, "mm",
      "area ≈ Pu / (0.4 fck + 0.0067 fy) at 1 % steel", "Practice");
    c.miss("Ductile detailing: confining ties at ends (lo region) for seismic zones III–V", "IS 13920 cl 8", "Important");
    var nos = int(inp.nos), floors = int(inp.floors);
    var bbs = CM.column_bbs("Column", nos * floors, l, n, dia, tie, st, b, D, cover, { conf: conf, fck: fck, fy: fy });
    var qty = _rcc_qty("columns", fck, [row("Columns", nos * floors, b / 1000, D / 1000, l)],
      [row("Column sides", nos * floors, 2 * (b + D) / 1000, null, l)], bbs);
    var sv = new View("Column section");
    sv.rect(0, 0, b, D, "OUTLINE", "concrete");
    sv.rect(cover, cover, b - 2 * cover, D - 2 * cover, "REBAR");
    var pts = RC.rect_bars(b, D, cover, tie, dia, n, GAP)[2];
    pts.forEach(function (p) { sv.bar_dot(p[0], p[1], dia); });
    sv.dim(0, 0, b, 0, 8);
    sv.dim(b, 0, b, D, -8);
    sv.text(b / 2, -0.35 * D, S(n) + "-" + g(dia) + "Ø, ties " + g(tie) + "Ø @ " + g(st) + (conf ? " (" + g(conf.s) + " AT ENDS)" : ""), 2.4,
      { anchor: "middle" });
    var ev = new View("Column elevation");
    ev.rect(0, 0, b, l * 1000, "OUTLINE", "concrete");
    var nt = Math.trunc(l * 1000 / st);
    C.range(0, nt + 1, Math.max(1, Math.floor(nt / 20))).forEach(function (k) {
      ev.line(cover, k * st, b - cover, k * st, "REBAR");
    });
    ev.dim(b, 0, b, l * 1000, -8, F(l * 1000, ",.0f"));
    ev.text(b / 2, l * 1000 + 300, "LAP 50Ø = " + F(50 * dia, ".0f") + " IN MIDDLE HALF", 2.2, { anchor: "middle" });
    var sheet = new Sheet("RCC column", "RC-C1", [sv, ev], ["M" + g(fck) + ", " + inp.fy + ", cover " + g(cover) + " mm.",
      "Laps in middle half of the column, not more than 50 % at a section."]);
    var summary = { "Section": g(b) + " × " + g(D), "Bars": S(n) + "-" + g(dia) + "Ø (" + F(100 * Asc / (b * D), ".2f") + " %)",
      "Ties": g(tie) + "Ø @ " + g(st) + (conf ? " (" + g(conf.s) + " at ends)" : ""), "Interaction": isFinite(ir) ? F(ir, ".2f") : "FAIL (Pu > Puz)", "Max utilisation": F(c.max_utilisation, ".2f") };
    return C.DesignResult({ module: "rcc_column", title: "RCC column", inputs: inp, calc: c, summary: summary, drawings: [sheet],
      quantities: qty, bbs: bbs, tables: {}, references: REFS });
  }
  M.run_column = run_column;

  var COL_PARAMS = [
    Param("b", "Width b", 300.0, "mm", { min: 200, max: 1500, step: 25, group: "Section" }),
    Param("D", "Depth D", 450.0, "mm", { min: 200, max: 1500, step: 25, group: "Section" }),
    Param("length", "Unsupported length", 3.0, "m", { min: 1, max: 12, step: 0.1, group: "Section" }),
    Param("ends", "End condition", "Fixed–hinged (0.80)", { kind: "select", options: Object.keys(END_K), group: "Section" }),
    Param("Pu", "Factored axial load Pu", 1500.0, "kN", { min: 10, max: 20000, group: "Forces" }),
    Param("Mux", "Factored moment about major axis", 60.0, "kN·m", { min: 0, max: 3000, group: "Forces" }),
    Param("Muy", "Factored moment about minor axis", 30.0, "kN·m", { min: 0, max: 3000, group: "Forces" })
  ].concat(_mat_params(40.0), [
    Param("nos", "Number of columns per floor", 1, { kind: "int", min: 1, max: 500, group: "Quantity" }),
    Param("floors", "Number of floors", 1, { kind: "int", min: 1, max: 50, group: "Quantity" }),
    Param("n_bars", "Number of bars (check)", 8, { kind: "int", min: 4, max: 40, step: 2, group: "My design", modes: CHECK }),
    Param("bar_dia", "Bar dia (check)", 16.0, "mm", { kind: "select", options: [12.0, 16.0, 20.0, 25.0, 32.0],
      group: "My design", modes: CHECK })
  ]);
  M.COL_PARAMS = COL_PARAMS;
  C.register({ id: "rcc_column", phase: 1, category: "RCC building", name: "RCC column (axial + biaxial)", icon: "▮",
    description: "Short / slender column: minimum eccentricity, additional moments, strain-compatibility uniaxial " +
      "capacities, cl 39.6 biaxial interaction, ties, BBS.", params: COL_PARAMS, run: run_column, references: REFS,
    modes: ["design", "check"] });

  /* =========================================================================== FOOTING */
  function run_footing(inp, mode) {
    var c = new Calc("Isolated footing");
    var fck = num(inp.fck), fy = _fy(inp);
    var P = num(inp.P), Mm = num(inp.M);
    var cb = num(inp.col_b), cD = num(inp.col_D);
    var cover = _cover(c, inp, mode, "footing");
    var given_size = mode === "check" ? [num(inp.L), num(inp.B)] : null;
    var given_D = mode === "check" ? num(inp.Df_mm) : null;
    var given_bars = mode === "check" ? [num(inp.bar_dia), num(inp.bar_s)] : null;
    var ftg = RC.isolated_footing(c, P, Mm, 1.5 * P, 1.5 * Mm, cb, cD, num(inp.sbc), fck, fy, cover,
      { ratio_LB: num(inp.ratio), fixed_size: given_size, given_D: given_D, given_bars: given_bars, rules: !!DS.detailing });
    if (DS.detailing) DS.detailing.site_checks(c, "footing", fck, cover);
    c.thumb("Footing area", 1.1 * P / num(inp.sbc), ftg.L * ftg.B, "m²", "1.1 P / SBC", "Practice");
    c.thumb("Depth", Math.max(300, (Math.max(ftg.L, ftg.B) * 1000 - Math.min(cb, cD)) / 2 / 2.5), ftg.D, "mm",
      "≈ projection / 2.5 (≥ 300)", "Practice");
    c.miss("Settlement & soil investigation report (SBC at founding depth)", "IS 1904 / IS 8009", "Important");
    c.miss("Column starter bars & dowels: Ld into footing, lap above footing", "IS 456 cl 34.4", "Important");
    var nos = int(inp.nos);
    var bbs = CM.footing_bbs("Footing", nos, ftg.L, ftg.B, ftg.D, ftg, cover);
    var q = CM.footing_qty("Footings", nos, ftg.L, ftg.B, ftg.D, fck, num(inp.df),
      { pedestal: [cb / 1000, cD / 1000, Math.max(num(inp.df) - ftg.D / 1000, 0.1)], bbs: bbs, grade: inp.fy });
    var sheet = new Sheet("Isolated footing", "RC-F1", CM.footing_views(ftg.L, ftg.B, ftg.D, cb, cD, ftg, cover,
      num(inp.df)),
    ["M" + g(fck) + ", " + inp.fy + ", cover " + g(cover) + " mm, SBC " + g(num(inp.sbc)) + " kN/m².",
      "PCC 1:4:8, 100 mm below footing; backfill in 200 mm compacted layers."]);
    var summary = { "Size": F(ftg.L, ".2f") + " × " + F(ftg.B, ".2f") + " × " + F(ftg.D / 1000, ".2f") + " m",
      "Bars along L": g(ftg.bars_L.dia) + "Ø @ " + g(ftg.bars_L.spacing),
      "Bars along B": g(ftg.bars_B.dia) + "Ø @ " + g(ftg.bars_B.spacing),
      "Soil pressure": F(ftg.pmax, ".0f") + " / " + F(ftg.pmin, ".0f") + " kN/m²", "Max utilisation": F(c.max_utilisation, ".2f") };
    return C.DesignResult({ module: "rcc_footing", title: "Isolated footing", inputs: inp, calc: c, summary: summary, drawings: [sheet],
      quantities: q, bbs: bbs, tables: {}, references: REFS });
  }
  M.run_footing = run_footing;

  var FTG_PARAMS = [
    Param("P", "Service axial load (DL + LL)", 900.0, "kN", { min: 10, max: 20000, group: "Loads" }),
    Param("M", "Service moment (about L)", 0.0, "kN·m", { min: 0, max: 3000, group: "Loads" }),
    Param("col_b", "Column width b", 300.0, "mm", { min: 200, max: 1500, step: 25, group: "Column" }),
    Param("col_D", "Column depth D", 450.0, "mm", { min: 200, max: 1500, step: 25, group: "Column" }),
    Param("sbc", "Safe bearing capacity", 200.0, "kN/m²", { min: 50, max: 800, step: 10, group: "Soil" }),
    Param("df", "Founding depth below GL", 1.5, "m", { min: 0.8, max: 5, step: 0.1, group: "Soil" }),
    Param("ratio", "L / B ratio", 1.0, { min: 1, max: 2, step: 0.05, group: "Soil" })
  ].concat(_mat_params(50.0, { exposure: "Moderate" }), [
    Param("nos", "Number of footings (quantity)", 1, { kind: "int", min: 1, max: 500, group: "Quantity" }),
    Param("L", "Length L (check)", 2.4, "m", { min: 0.8, max: 8, step: 0.05, group: "My design", modes: CHECK }),
    Param("B", "Width B (check)", 2.4, "m", { min: 0.8, max: 8, step: 0.05, group: "My design", modes: CHECK }),
    Param("Df_mm", "Depth D (check)", 550.0, "mm", { min: 250, max: 2000, step: 25, group: "My design", modes: CHECK }),
    Param("bar_dia", "Bar dia (check)", 12.0, "mm", { kind: "select", options: [10.0, 12.0, 16.0, 20.0], group: "My design",
      modes: CHECK }),
    Param("bar_s", "Bar spacing (check)", 150.0, "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK })
  ]);
  M.FTG_PARAMS = FTG_PARAMS;
  C.register({ id: "rcc_footing", phase: 1, category: "RCC building", name: "Isolated footing", icon: "⬛",
    description: "Pad footing: plan size from SBC & eccentricity, depth from bending, one-way & punching shear, " +
      "anchorage; bars both ways, BBS and foundation quantities.", params: FTG_PARAMS, run: run_footing, references: REFS,
    modes: ["design", "check"] });

  /* =========================================================================== STAIRCASE */
  function run_stair(inp, mode) {
    var c = new Calc("Dog-legged staircase");
    var fck = num(inp.fck), fy = _fy(inp);
    var H = num(inp.floor_h);
    var Rr = num(inp.riser), T = num(inp.tread);
    var W = num(inp.width);
    var land = num(inp.landing);
    var cover = _cover(c, inp, mode, "slab");
    c.section("Geometry");
    var nr = Math.ceil(H * 1000 / 2 / Rr);
    Rr = H * 1000 / 2 / nr;
    c.let("Risers per flight", "n", nr, "", "", "actual riser " + F(Rr, ".1f") + " mm");
    var going = c.calc("Going of flight", "G", "(n - 1)*T/1000", "m", "", { n: nr, T: T });
    c.ok("Riser 150–190 mm, tread ≥ 250 mm", 150 <= Rr && Rr <= 190 && T >= 250, { detail: "R = " + F(Rr, ".0f") + ", T = " + F(T, ".0f"),
      clause: "NBC 2016 Part 3 / IS 456 cl 33", warn_only: true });
    c.ok("2R + T between 550 and 700 mm (comfort)", 550 <= 2 * Rr + T && 2 * Rr + T <= 700, { detail: "2R + T = " + F(2 * Rr + T, ".0f"),
      clause: "Blondel formula", warn_only: true });
    var L;
    // IS 456 cl 33.1(b): flight spanning on to the edges of landing slabs that span parallel to the risers → going + min(lw/2, 1 m)
    // each end; cl 33.1(c): landings spanning in the same direction act with the flight → c/c of the supports beyond the landings
    if (String(inp.landing_span).indexOf("Landings span across") === 0)
      L = c.calc("Effective span: going + min(landing/2, 1 m) each end", "L", "G + 2*min(lw/2, 1.0)", "m",
        "IS 456 cl 33.1(b)", { G: going, lw: land });
    else
      L = c.calc("Effective span: going + landings (supported at landing edges)", "L", "G + 2*lw", "m",
        "IS 456 cl 33.1(c)", { G: going, lw: land });
    var sup = inp.support;
    var D = mode === "check" ? num(inp.waist) : Math.max(ceil_to(L * 1000 / (sup === "Simply supported" ? 20 : 26) + cover, 10), 125);
    var LL = num(inp.ll);

    function load(D) {
      return 25 * D / 1000 * Math.sqrt(Math.pow(Rr, 2) + Math.pow(T, 2)) / T + 25 * Rr / 2000 + num(inp.finish) + LL;
    }

    var w, Mu, d, f;
    if (mode !== "check") {
      for (var it = 0; it < 40; it++) {
        w = 1.5 * load(D);
        Mu = w * Math.pow(L, 2) / (sup === "Simply supported" ? 8 : 10);
        d = D - cover - 6;
        var sc = new Calc("s");
        f = RC.flexure(sc, Mu, 1000, d, fck, fy, "slab", { D: D });
        if (f.ok && RC.deflection(sc, L * 1000, d, sup === "Simply supported" ? "simply supported" : "continuous",
          fy, f.Ast, f.Ast * 1.15, 1000))
          break;
        D += 10;
      }
    }
    c.section("Loads (per m² of plan)");
    c.let("Waist slab thickness", "t", D, "mm");
    c.calc("Waist slab on slope", "g1", "25*t/1000*sqrt(R**2 + T**2)/T", "kN/m²", "", { t: D, R: R(Rr, 1), T: T });
    c.calc("Steps", "g2", "25*R/2000", "kN/m²", "", { R: R(Rr, 1) });
    w = c.calc("Factored load", "wu", "1.5*(g + ff + ll)", "kN/m²", "IS 875 / IS 456",
      { g: R(25 * D / 1000 * Math.sqrt(Math.pow(Rr, 2) + Math.pow(T, 2)) / T + 25 * Rr / 2000, 3), ff: num(inp.finish), ll: LL });
    Mu = c.calc("Design moment", "Mu", "w*L**2/" + (sup === "Simply supported" ? 8 : 10), "kN·m/m", "IS 456 cl 33",
      { w: w, L: L });
    d = D - cover - 6;
    f = RC.flexure(c, Mu, 1000, d, fck, fy, "slab", { D: D });
    var given = mode === "check" ? [num(inp.bar_dia), num(inp.bar_s)] : null;
    var bs;
    if (given) {
      bs = { dia: given[0], spacing: given[1], Ast_prov: 1000 * bar_area(given[0]) / given[1] };
      c.check("Main steel provided ≥ required", bs.Ast_prov, f.Ast, { unit: "mm²/m", clause: "", mode: ">=" });
      if (DS.detailing) DS.detailing.check_bars(c, "stair", "main", given[0], given[1], { d: d, D: D, label: "main bars" });
    } else if (DS.detailing) {
      bs = RC.slab_bars(f.Ast, d, D, true, { dias: [10, 12, 16], rule: { member: "stair", role: "main" } });
      DS.detailing.record(c, "main bars", bs);
      if (bs.short) c.check("Main steel provided ≥ required", bs.Ast_prov, f.Ast, { unit: "mm²/m", clause: "", mode: ">=" });
    } else {
      bs = RC.slab_bars(f.Ast, d, D, true, { dias: [10, 12, 16] });
    }
    c.let("Main bars (along flight)", "", g(bs.dia) + "Ø @ " + g(bs.spacing) + " c/c");
    var dist = DS.detailing ? RC.slab_bars(0.0012 * 1000 * D, d - 10, D, false, { dias: [8, 10, 12],
      rule: { member: "stair", role: "dist", main_dia: bs.dia } }) : RC.slab_bars(0.0012 * 1000 * D, d - 10, D, false, { dias: [8, 10] });
    if (DS.detailing) DS.detailing.record(c, "distribution", dist);
    c.let("Distribution bars", "", g(dist.dia) + "Ø @ " + g(dist.spacing) + " c/c");
    RC.shear(c, w * L / 2, 1000, d, 100 * bs.Ast_prov / (1000 * d), fck, fy, "slab", { D: D });
    RC.deflection(c, L * 1000, d, sup === "Simply supported" ? "simply supported" : "continuous", fy, f.Ast,
      bs.Ast_prov, 1000);
    c.thumb("Waist thickness", L * 1000 / 20 + cover, D, "mm", "span/20 + cover", "Practice");
    c.miss("Landing beams / walls supporting the stair – design for the reaction w·L/2", "IS 456 cl 33", "Important");
    var flights = 2 * int(inp.storeys);
    var slope_len = Math.hypot(going, H / 2);
    var n_main = Math.floor(W * 1000 / bs.spacing) + 1;
    var BB = DS.bbs, runS = (slope_len + 2 * land) * 1000 - 2 * cover;
    var st1 = BB.stock(BB.shape(bs.dia, [BB.leg(bs.dia), runS, BB.leg(bs.dia)], [90, 90, 45, 45], 0, "landing + waist + landing, " + BB.cfg.leg_d + "d legs, 2 kinks"), bs.dia, fck, fy);
    var st2 = BB.straight(dist.dia, W * 1000 - 2 * cover);
    var bbs = [BB.row("Stair flight", "ST1", bs.dia, "bent at the two kinks, 90° legs at ends", n_main * flights, st1, "main"),
    BB.row("Stair flight", "ST2", dist.dia, "straight", flights * BB.count((slope_len + 2 * land) * 1000, dist.spacing, 50), st2, "distribution")];
    var qty = _rcc_qty("staircase", fck,
      [row("Waist slab", flights, slope_len, W, D / 1000), row("Steps (triangles, n − 1 treads per flight)", flights * (nr - 1), W, T / 1000,
        Rr / 2000),
      row("Landings", flights, land, W, D / 1000)],
      [row("Soffit of waist & landings", flights, slope_len + land, W), row("Riser faces", flights * nr, W, null,
        Rr / 1000)], bbs);
    var v = new View("Flight – longitudinal section");
    var lw = land * 1000;
    var pts = [[0.0, 0.0], [lw, 0.0]];
    var x = lw, y = 0.0;
    for (var k = 0; k < nr; k++) {
      y += Rr;
      pts.push([x, y]);
      if (k < nr - 1) {
        x += T;
        pts.push([x, y]);
      }
    }
    var x_end = x, Htop = y;
    var slope = Rr / T;
    var th = Math.atan(slope);
    var Dv = D / Math.cos(th);
    // waist soffit: parallel to the pitch line, passing D (normal) below the step nosings
    var y_soffit = function (xx) { return slope * (xx - lw) + Rr - Dv; };   // eslint-disable-line no-unused-vars
    var x_top = lw + (Htop - D - Rr + Dv) / slope;
    var x_bot = lw + (-D - Rr + Dv) / slope;
    pts = pts.concat([[x_end + lw, Htop], [x_end + lw, Htop - D], [x_top, Htop - D], [x_bot, -D], [0.0, -D]]);
    v.poly(pts, true, "OUTLINE", "concrete");
    var cv = cover / Math.cos(th);   // eslint-disable-line no-unused-vars
    v.poly([[cover, -D + cover], [x_bot, -D + cover], [x_top, Htop - D + cover], [x_end + lw - cover, Htop - D + cover]],
      false, "REBAR");
    x = x_end;
    v.dim(0, -D, x + land * 1000, -D, 12, "EFFECTIVE SPAN " + F(L * 1000, ",.0f"));
    v.text((x + land * 1000) / 2, Htop + 400, "WAIST " + g(D) + "; MAIN " + g(bs.dia) + "Ø @ " + g(bs.spacing) + "; DIST " +
      g(dist.dia) + "Ø @ " + g(dist.spacing) + "; R " + F(Rr, ".0f") + ", T " + F(T, ".0f"), 2.2, { anchor: "middle" });
    var sheet = new Sheet("Dog-legged staircase", "RC-ST1", [v], ["M" + g(fck) + ", " + inp.fy + ", cover " + g(cover) + " mm.",
      "Main bars cranked at the landing junctions with Ld beyond.",
      "Nosing 25 mm; anti-skid finish on treads."]);
    var summary = { "Flight": S(nr) + " risers × " + F(Rr, ".0f") + " mm, tread " + g(T) + " mm", "Waist": g(D) + " mm",
      "Main bars": g(bs.dia) + "Ø @ " + g(bs.spacing), "Distribution": g(dist.dia) + "Ø @ " + g(dist.spacing),
      "Max utilisation": F(c.max_utilisation, ".2f") };
    return C.DesignResult({ module: "rcc_staircase", title: "Dog-legged staircase", inputs: inp, calc: c, summary: summary,
      drawings: [sheet], quantities: qty, bbs: bbs, tables: {}, references: REFS });
  }
  M.run_stair = run_stair;

  var STAIR_PARAMS = [
    Param("floor_h", "Floor-to-floor height", 3.2, "m", { min: 2.4, max: 6, step: 0.05, group: "Geometry" }),
    Param("riser", "Riser (target)", 160.0, "mm", { min: 140, max: 200, step: 5, group: "Geometry" }),
    Param("tread", "Tread", 280.0, "mm", { min: 230, max: 350, step: 5, group: "Geometry" }),
    Param("width", "Flight width", 1.2, "m", { min: 0.9, max: 3, step: 0.05, group: "Geometry" }),
    Param("landing", "Landing width", 1.2, "m", { min: 0.9, max: 3, step: 0.05, group: "Geometry" }),
    Param("support", "Support", "Simply supported", { kind: "select", options: ["Simply supported", "Continuous"],
      group: "Geometry" }),
    Param("landing_span", "Landing arrangement", "Landings span across (cl 33.1b)", { kind: "select",
      options: ["Landings span across (cl 33.1b)", "Flight + landings span together (cl 33.1c)"], group: "Geometry" }),
    Param("ll", "Imposed load", 3.0, "kN/m²", { kind: "select", options: [3.0, 4.0, 5.0], group: "Loads",
      help: "IS 875-2: residential 3.0, public 4.0–5.0" }),
    Param("finish", "Finishes", 1.0, "kN/m²", { min: 0, max: 3, step: 0.25, group: "Loads" })
  ].concat(_mat_params(20.0), [
    Param("storeys", "Number of storeys (quantity)", 1, { kind: "int", min: 1, max: 40, group: "Quantity" }),
    Param("waist", "Waist thickness (check)", 200.0, "mm", { min: 100, max: 350, step: 5, group: "My design", modes: CHECK }),
    Param("bar_dia", "Main bar dia (check)", 12.0, "mm", { kind: "select", options: [10.0, 12.0, 16.0], group: "My design",
      modes: CHECK }),
    Param("bar_s", "Main bar spacing (check)", 130.0, "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK })
  ]);
  M.STAIR_PARAMS = STAIR_PARAMS;
  C.register({ id: "rcc_staircase", phase: 1, category: "RCC building", name: "Dog-legged staircase", icon: "🪜",
    description: "Waist-slab staircase spanning between landings: riser/tread checks, loads on plan, flexure, " +
      "shear, deflection, BBS.", params: STAIR_PARAMS, run: run_stair, references: REFS });
})();
