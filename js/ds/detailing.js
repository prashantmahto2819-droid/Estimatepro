/* Design Studio — detailing rules (bar diameter / spacing selection with reasons).
   Load after rcc.js (needs core + materials only at call time).

   Every bar choice made in design mode goes through these helpers so that
     • the diameter is ≥ the governing minimum (code, practice or site),
     • slab-type members keep Ø ≤ D/8, distribution Ø ≤ main Ø,
     • spacings are ≤ the governing maximum, ≥ a practical minimum and rounded (10 mm code / 25 mm practice),
     • the reason + clause can be recorded in the Calc so the user SEES why a size was chosen.
   In check mode `check_bars` flags user bars: FAIL when a code minimum is violated, WARN for a practice / site minimum.

   Run context (DS.core.ctx, set by run_module):
     detail: "practice" (default) – IS 13920 / SP 34 / CPWD / MoRTH practice minimums on top of the code;
             "code"               – bare code minimums (IS 456 / IRC 112 / IS 3370), i.e. the old behaviour as far as possible.
     site:   "general" | "mine"   – mining area: ground / water-contact members ≥ 12Ø, severe exposure (cover, M30).
   Clause notes marked "verify" are paraphrased from secondary sources — check against a licensed copy of the code. */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var DT = DS.detailing = {};
  function C() { return DS.core; }
  function area(d) { return Math.PI * d * d / 4; }
  function g(x) { return C().pyfmt(x, "g"); }

  DT.BARS = [6, 8, 10, 12, 16, 20, 25, 32];
  /* next_bar(x) → smallest standard bar ≥ x */
  DT.next_bar = function (x) { for (var i = 0; i < DT.BARS.length; i++) if (DT.BARS[i] >= x - 1e-9) return DT.BARS[i]; return 32; };
  DT.ctx = function (ctx) {
    var base = (C() && C().ctx) || {};
    return Object.assign({ site: "general", detail: "practice" }, base, ctx || {});
  };
  DT.practice = function (ctx) { return DT.ctx(ctx).detail !== "code"; };
  DT.mine = function (ctx) { return DT.ctx(ctx).site === "mine"; };

  /* Members whose bars are designed per metre width (slab-type: Ø ≤ D/8 applies) */
  var SLABLIKE = { slab: 1, stair: 1, footing: 1, drain: 1, retaining: 1, water: 1, bridge_slab: 1, culvert: 1 };
  /* Members in contact with ground / water (mining site: ≥ 12Ø main, severe exposure) */
  var GROUND = { footing: 1, drain: 1, retaining: 1, water: 1, culvert: 1, bridge_slab: 0 };
  DT.GROUND = GROUND;

  /* --------------------------------------------------------------------- rule table
     RULES[member][role] = { code: [min Ø, clause], practice: [min Ø, clause], mine: [min Ø, clause],
                             smax_code: fn(d, D) | number, smax_practice: ..., sc: clause for spacing } */
  var R = {
    beam: {
      main: { code: [10, "IS 456 (no explicit min; 10 mm HYSD)"], practice: [12, "SP 34 / CPWD practice: beam main bars ≥ 12Ø"],
        mine: [12, "Mining site: ≥ 12Ø"] },
      hanger: { code: [10, "IS 456 (hanger / anchor bars, no explicit min)"],
        practice: [12, "SP 34 / CPWD practice: hanger bars ≥ 12Ø and ≥ ½ main Ø (IS 13920:2016 cl 6.2.1: ≥ 2 bars top & bottom throughout)"],
        mine: [12, "Mining site: ≥ 12Ø"] },
      stirrup: { code: [6, "IS 456 cl 26.5.1.6 (no explicit min; 6 mm)"],
        practice: [8, "IS 13920:2016 cl 6.3.2 (≥ 8 mm for clear span > 5 m) / CPWD practice 8Ø min"], mine: [8, ""] }
    },
    slab: {
      main: { code: [8, "IS 456 (HYSD 8 mm usual minimum, SP 34)"], practice: [8, "SP 34: slab main bars ≥ 8Ø HYSD"], mine: [8, ""],
        smax_code: function (d) { return Math.min(3 * d, 300); }, smax_practice: function (d) { return Math.min(3 * d, 300); },
        sc: "IS 456 cl 26.3.3(b)(1): ≤ 3d, 300 mm" },
      dist: { code: [8, "IS 456 cl 26.5.2.1 (0.12 % HYSD)"], practice: [8, "SP 34: distribution ≥ 8Ø and ≤ main Ø"], mine: [8, ""],
        smax_code: function (d) { return Math.min(5 * d, 450); }, smax_practice: function (d) { return Math.min(5 * d, 300); },
        sc: "IS 456 cl 26.3.3(b)(2): ≤ 5d, 450 mm; practice ≤ 300 mm" }
    },
    stair: {
      main: { code: [8, "IS 456 (HYSD 8 mm)"], practice: [10, "SP 34 / CPWD practice: stair waist main bars ≥ 10Ø"], mine: [10, ""],
        smax_code: function (d) { return Math.min(3 * d, 300); }, smax_practice: function (d) { return Math.min(3 * d, 200); },
        sc: "IS 456 cl 26.3.3(b)(1): ≤ 3d, 300; practice ≤ 200 mm for stair waist" },
      dist: { code: [8, "IS 456 cl 26.5.2.1"], practice: [8, "Practice: stair distribution 8Ø @ 150–200"], mine: [8, ""],
        smax_code: function (d) { return Math.min(5 * d, 450); }, smax_practice: function () { return 200; },
        sc: "IS 456 cl 26.3.3(b)(2): ≤ 5d, 450; practice ≤ 200 mm" }
    },
    column: {
      main: { code: [12, "IS 456 cl 26.5.3.1(c): longitudinal bars ≥ 12 mm"], practice: [12, "IS 456 cl 26.5.3.1(c)"],
        mine: [16, "Mining site practice: column bars ≥ 16Ø (impact / blasting vibration)"] },
      tie: { code: [6, "IS 456 cl 26.5.3.2(c): tie Ø ≥ max(φ/4, 6 mm)"],
        practice: [8, "IS 13920:2016 cl 7.4/8 & SP 34: ties ≥ 8 mm (10 mm for bars > 32 mm) – verify"], mine: [8, ""] }
    },
    footing: {
      main: { code: [10, "IS 456 cl 34 (no explicit min; 10 mm)"], practice: [12, "CPWD / SP 34 practice: footing bars ≥ 12Ø (≥ 10Ø only for very small pads)"],
        mine: [12, "Mining site: ground-contact members ≥ 12Ø"],
        smax_code: function (d) { return Math.min(3 * d, 300); }, smax_practice: function () { return 200; },
        sc: "IS 456 cl 34.5 → cl 26.3.3(b): ≤ 3d, 300; practice ≤ 200 mm" }
    },
    drain: {
      main: { code: [8, "IS 456 cl 26.5.2 (wall / slab strip)"], practice: [10, "CPWD practice: drain walls & base ≥ 10Ø"],
        mine: [12, "Mining site: ground / water-contact members ≥ 12Ø"],
        smax_code: function (d) { return Math.min(3 * d, 300); }, smax_practice: function () { return 200; },
        sc: "IS 456 cl 26.3.3(b); practice ≤ 200 mm (crack control)" },
      dist: { code: [8, "IS 456 cl 26.5.2.1 / cl 32.5"], practice: [8, "Practice: distribution ≥ 8Ø, ≤ main Ø"], mine: [10, "Mining site: ≥ 10Ø distribution"],
        smax_code: function (d) { return Math.min(5 * d, 450); }, smax_practice: function () { return 250; },
        sc: "IS 456 cl 26.3.3(b)(2) / cl 32.5: ≤ 3t, 450; practice ≤ 250 mm" }
    },
    retaining: {
      main: { code: [10, "IS 456 (no explicit min; 10 mm)"],
        practice: [12, "CPWD / SP 34 practice: retaining-wall stem, heel & toe bars ≥ 12Ø; base bars ≥ ½ stem Ø"],
        mine: [12, "Mining site: ground-contact members ≥ 12Ø"],
        smax_code: function (d) { return Math.min(3 * d, 300); }, smax_practice: function () { return 200; },
        sc: "IS 456 cl 26.3.3(b); practice ≤ 200 mm" },
      dist: { code: [8, "IS 456 cl 26.5.2.1"], practice: [10, "CPWD practice: retaining-wall distribution / temperature bars ≥ 10Ø"],
        mine: [12, "Mining site: ground-contact members ≥ 12Ø"],
        smax_code: function (d) { return Math.min(5 * d, 450); }, smax_practice: function () { return 200; },
        sc: "IS 456 cl 32.5(c): ≤ 3t, 450; practice ≤ 200 mm (earth face, shrinkage)" }
    },
    water: {
      main: { code: [8, "IS 3370-2 (no explicit min)"], practice: [10, "IS 3370 practice: water-retaining members ≥ 10Ø"],
        mine: [12, "Mining site: water-contact members ≥ 12Ø"],
        smax_code: function () { return 300; }, smax_practice: function () { return 200; },
        sc: "IS 3370-2 cl 8: spacing ≤ 300 mm (verify); practice ≤ 200 mm" },
      dist: { code: [8, "IS 3370-2 cl 8.1"], practice: [10, "IS 3370 practice: ≥ 10Ø"], mine: [12, "Mining site: ≥ 12Ø"],
        smax_code: function () { return 300; }, smax_practice: function () { return 200; },
        sc: "IS 3370-2 cl 8: ≤ 300 mm (verify); practice ≤ 200 mm" }
    },
    bridge_slab: {
      main: { code: [10, "IRC 112:2020 cl 16.6 (verify): slab bars ≥ 10 mm"], practice: [12, "MoRTH / IRC SP-13 practice: deck bars ≥ 12Ø"],
        mine: [12, ""],
        smax_code: function () { return 200; }, smax_practice: function () { return 200; },
        sc: "IRC 112 cl 16.6.1 (verify): main bars ≤ 200 mm" },
      dist: { code: [10, "IRC 112:2020 cl 16.6 (verify)"], practice: [12, "MoRTH / IRC SP-13 practice: top & distribution bars ≥ 12Ø"],
        mine: [12, ""],
        smax_code: function () { return 250; }, smax_practice: function () { return 200; },
        sc: "IRC 112 cl 16.6.1 (verify): secondary ≤ 250 mm; practice ≤ 200 mm" }
    },
    culvert: {
      main: { code: [10, "IRC 112"], practice: [12, "IRC SP-13 practice ≥ 12Ø"], mine: [12, ""],
        smax_code: function () { return 200; }, smax_practice: function () { return 200; }, sc: "IRC 112 cl 16.6.1 (verify)" },
      dist: { code: [10, "IRC 112"], practice: [10, "IRC SP-13 practice ≥ 10Ø"], mine: [12, ""],
        smax_code: function () { return 250; }, smax_practice: function () { return 200; }, sc: "IRC 112 cl 16.6.1 (verify)" }
    }
  };
  DT.RULES = R;
  function rule(member, role) {
    var m = R[member] || R.slab;
    return m[role] || m.main || m[Object.keys(m)[0]];
  }

  /* min_dia(member, role, ctx, o) → {dia, reason, clause, level}
     o.main_dia: main bar Ø (hanger rule ½ main); o.code_only: ignore practice/site */
  DT.min_dia = function (member, role, ctx, o) {
    o = o || {}; ctx = DT.ctx(ctx);
    var r = rule(member, role);
    var out = { dia: r.code[0], reason: "code minimum " + g(r.code[0]) + " mm", clause: r.code[1], level: "code" };
    if (role === "tie" && o.main_dia) {
      var t = DT.next_bar(Math.max(6, o.main_dia / 4));
      if (t > out.dia) out = { dia: t, reason: "tie Ø ≥ φ/4 = " + C().pyfmt(o.main_dia / 4, ".1f") + " mm", clause: r.code[1], level: "code" };
    }
    if (o.code_only || ctx.detail === "code") return out;
    if (r.practice[0] > out.dia) out = { dia: r.practice[0], reason: "practice minimum " + g(r.practice[0]) + " mm", clause: r.practice[1], level: "practice" };
    if (role === "hanger" && o.main_dia) {
      var h = DT.next_bar(o.main_dia / 2);
      if (h > out.dia) out = { dia: h, reason: "hanger Ø ≥ ½ main Ø (" + g(o.main_dia) + "Ø → " + g(h) + "Ø)", clause: "SP 34 practice", level: "practice" };
    }
    if (role === "tie" && o.main_dia && o.main_dia > 32 && out.dia < 10)
      out = { dia: 10, reason: "ties ≥ 10 mm for bars > 32 mm", clause: r.practice[1], level: "practice" };
    if ((member === "retaining") && role === "main" && o.stem_dia) {
      var bmin = DT.next_bar(o.stem_dia / 2);
      if (bmin > out.dia) out = { dia: bmin, reason: "base bars ≥ ½ stem Ø (" + g(o.stem_dia) + "Ø → " + g(bmin) + "Ø)", clause: "SP 34 practice", level: "practice" };
    }
    if (ctx.site === "mine" && r.mine && r.mine[0] > out.dia)
      out = { dia: r.mine[0], reason: "mining-site minimum " + g(r.mine[0]) + " mm", clause: r.mine[1] || "Mining site practice", level: "mine" };
    return out;
  };

  /* max_dia(member, role, D) → {dia, clause} — IS 456 cl 26.5.2.2: slab bars ≤ D/8; distribution ≤ main Ø (practice) */
  DT.max_dia = function (member, role, D, o) {
    o = o || {};
    var out = { dia: 32, clause: "" };
    if (SLABLIKE[member] && D) out = { dia: D / 8, clause: "IS 456 cl 26.5.2.2: Ø ≤ D/8 = " + C().pyfmt(D / 8, ".1f") + " mm" };
    if (role === "dist" && o.main_dia && DT.practice(o.ctx) && o.main_dia < out.dia)
      out = { dia: o.main_dia, clause: "Practice: distribution Ø ≤ main Ø (" + g(o.main_dia) + ")" };
    return out;
  };

  /* max_spacing(member, role, d, D, ctx) → {s, reason, clause} */
  DT.max_spacing = function (member, role, d, D, ctx) {
    var r = rule(member, role);
    var prac = DT.practice(ctx);
    var f = prac ? (r.smax_practice || r.smax_code) : r.smax_code;
    var s = f ? f(d || 1e9, D) : 300;
    return { s: s, reason: "s ≤ " + g(C().floor_to(s, 1)) + " mm", clause: r.sc || "", level: prac ? "practice" : "code" };
  };
  DT.min_spacing = function (ctx) { return DT.practice(ctx) ? 100 : 75; };
  DT.step = function (ctx) { return DT.practice(ctx) ? 25 : 10; };

  /* allowed(member, role, dias, o) → {dias, why[]} — filter a candidate list by min / max Ø; extends if empty. */
  DT.allowed = function (member, role, dias, o) {
    o = o || {};
    var mn = DT.min_dia(member, role, o.ctx, o);
    var mx = DT.max_dia(member, role, o.D, o);
    var lo = mn.dia, hi = Math.max(mx.dia, lo);          // never let max < min (min governs; flagged by caller)
    var list = (dias || DT.BARS).filter(function (x) { return x >= lo - 1e-9 && x <= hi + 1e-9; });
    if (!list.length) list = DT.BARS.filter(function (x) { return x >= lo - 1e-9 && x <= hi + 1e-9 && x >= 8; });
    if (!list.length) list = [lo];
    var why = ["Ø ≥ " + g(lo) + " (" + mn.reason + "; " + mn.clause + ")"];
    if (mx.clause) why.push(mx.clause);
    return { dias: list, why: why, min: mn, max: mx };
  };

  /* pick_bars(Ast_req, member, role, opts) → {dia, spacing, Ast_prov, smax, short, text, clause}
     per-metre bars for slab-type members.
     opts: {d, D, dias, smax (caller cap), min_spacing, main_dia, prefer [Ø…], stem_dia, ctx} */
  DT.pick_bars = function (Ast, member, role, o) {
    o = o || {};
    var ctx = DT.ctx(o.ctx), prac = ctx.detail !== "code";
    var al = DT.allowed(member, role, o.dias, Object.assign({}, o, { ctx: ctx }));
    var ms = DT.max_spacing(member, role, o.d, o.D, ctx);
    var smax = ms.s;
    if (o.smax) smax = Math.min(smax, o.smax);
    var step = DT.step(ctx);
    var smin = prac ? Math.max(DT.min_spacing(ctx), o.min_spacing || 0) : (o.min_spacing || 75);
    smax = Math.max(C().floor_to(smax, step), smin);
    var req = Math.max(Ast, 1e-6), best = null, cands = [];
    al.dias.forEach(function (dia) {
      var a = area(dia);
      var s = C().floor_to(Math.min(1000 * a / req, smax), step);
      if (s < smin) return;
      var c = { dia: dia, spacing: s, Ast_prov: 1000 * a / s };
      c.score = c.Ast_prov * (prac && s <= 100 ? 1.08 : 1);   // practice: avoid 100 mm spacing if a bigger bar costs ≤ 8 % more
      cands.push(c);
      if (best === null || c.score < best.score - 1e-9) best = c;
    });
    var short = false;
    if (best === null) {
      var dmax = al.dias[al.dias.length - 1];
      best = { dia: dmax, spacing: smin, Ast_prov: 1000 * area(dmax) / smin };
      short = best.Ast_prov < Ast - 1e-6;
    } else if (prac && o.prefer && o.prefer.length) {
      // fewer bar sizes per member: take a preferred Ø if it costs ≤ 20 % more steel
      cands.forEach(function (c) {
        if (o.prefer.indexOf(c.dia) >= 0 && c.Ast_prov <= 1.2 * best.Ast_prov && o.prefer.indexOf(best.dia) < 0) best = c;
      });
    }
    var why = al.why.slice();
    why.push(ms.reason + " (" + ms.clause + ")" + (o.smax && o.smax < ms.s ? ", design cap " + g(o.smax) + " mm" : ""));
    why.push("spacing rounded down to " + g(step) + " mm, ≥ " + g(smin) + " mm");
    if (o.prefer && o.prefer.indexOf(best.dia) >= 0 && prac) why.push("same Ø as other bars of the member (fewer bar sizes)");
    var text = g(best.dia) + "Ø @ " + g(best.spacing) + " c/c (As " + C().pyfmt(best.Ast_prov, ".0f") + " ≥ " + C().pyfmt(Ast, ".0f") +
      " mm²/m): " + why.join("; ");
    return { dia: best.dia, spacing: best.spacing, Ast_prov: best.Ast_prov, smax: smax, short: short, text: text,
      clause: al.min.clause, level: al.min.level };
  };

  /* beam_dias(role, o) → allowed Ø list for beam bars (o.main_dia for hanger rule). */
  DT.beam_dias = function (role, dias, o) { return DT.allowed("beam", role, dias, o || {}); };

  /* tie_bars(main_dia, b, D, ctx, o) → {dia, s, s_conf, lo, text, clause}
     o.length: unsupported length (m) for lo; o.min_main: smallest longitudinal Ø */
  DT.tie_bars = function (main_dia, b, D, ctx, o) {
    o = o || {}; ctx = DT.ctx(ctx);
    var prac = ctx.detail !== "code";
    var mn = DT.min_dia("column", "tie", ctx, { main_dia: main_dia });
    var dia = DT.next_bar(mn.dia);
    var least = Math.min(b, D), phi = o.min_main || main_dia;
    var s_code = Math.min(least, 16 * phi, 300);
    var s = s_code, why = ["tie Ø " + g(dia) + " (" + mn.reason + "; " + mn.clause + ")",
      "pitch ≤ min(least dim " + g(least) + ", 16φ = " + g(16 * phi) + ", 300) (IS 456 cl 26.5.3.2(c))"];
    var out = { dia: dia, s: 0, s_conf: null, lo: null };
    if (prac) {
      if (least / 2 < s) { s = least / 2; why.push("≤ ½ least dimension = " + g(least / 2) + " (IS 13920:2016 cl 7.4 – verify)"); }
      var sc = Math.max(C().floor_to(Math.min(least / 4, 6 * phi, 100), 5), 75);
      var lo = Math.max(Math.max(b, D), (o.length || 0) * 1000 / 6, 450);
      out.s_conf = sc; out.lo = C().ceil_to(lo, 25);
      why.push("special confining ties @ " + g(sc) + " over lo = " + g(out.lo) + " mm at each end: s ≤ min(B/4, 6φ, 100), ≥ 75; " +
        "lo ≥ max(D, l/6, 450) (IS 13920:2016 cl 8.1 – verify)");
    }
    out.s = C().floor_to(s, 25);
    out.text = g(dia) + "Ø @ " + g(out.s) + (out.s_conf ? " (" + g(out.s_conf) + " in end zones)" : "") + ": " + why.join("; ");
    out.clause = prac ? "IS 456 cl 26.5.3.2 / IS 13920:2016" : "IS 456 cl 26.5.3.2";
    return out;
  };

  /* stirrup_rules(d, span_m, sv_req, dia, o) → {dia, s_mid, s_end, end_len, text, clause}
     sv_req: spacing from shear design (IS 456 cl 40.4 / 26.5.1.5 already applied); o.min_main: smallest long. Ø */
  DT.stirrup_rules = function (d, span_m, sv_req, dia, o) {
    o = o || {}; var ctx = DT.ctx(o.ctx), prac = ctx.detail !== "code";
    var mn = DT.min_dia("beam", "stirrup", ctx);
    var why = [], st_dia = dia;
    if (st_dia < mn.dia) { why.push("stirrup Ø raised " + g(dia) + " → " + g(mn.dia) + " (" + mn.clause + ")"); st_dia = mn.dia; }
    else why.push("stirrup Ø " + g(st_dia) + " ≥ " + g(mn.dia) + " (" + mn.clause + ")");
    var s_mid = sv_req, s_end = sv_req, end_len = 0;
    why.push("shear / IS 456 cl 26.5.1.5 (≤ 0.75d, 300): " + g(sv_req));
    if (prac) {
      if (d / 2 < s_mid) { s_mid = C().floor_to(d / 2, 25); why.push("≤ d/2 = " + C().pyfmt(d / 2, ".0f") + " (IS 13920:2016 cl 6.3.5)"); }
      var phi = o.min_main || 12;
      var se = Math.max(Math.min(d / 4, 6 * phi), 100);
      s_end = Math.min(s_mid, C().floor_to(se, 25));
      end_len = 2 * d;
      why.push("within 2d = " + C().pyfmt(2 * d, ".0f") + " of supports: ≤ max(min(d/4, 6φ), 100) → " + g(s_end) +
        ", first stirrup at 50 mm (IS 13920:2016 cl 6.3.5)");
    }
    return { dia: st_dia, s_mid: s_mid, s_end: s_end, end_len: end_len,
      text: why.join("; "), clause: prac ? "IS 456 cl 26.5.1.5 / IS 13920:2016 cl 6.3" : "IS 456 cl 26.5.1.5" };
  };

  /* count_zoned(L_mm, s_mid, s_end, end_len, ends=2) → number of stirrups / ties over L with closer end zones */
  DT.count_zoned = function (L, s_mid, s_end, end_len, ends) {
    ends = ends == null ? 2 : ends;
    if (!end_len || s_end >= s_mid) return Math.floor(L / s_mid) + 1;
    var ez = Math.min(end_len, L / ends);
    var n_end = Math.ceil(ez / s_end);
    var mid = Math.max(L - ends * ez, 0);
    return ends * n_end + Math.ceil(mid / s_mid - 1e-9) + 1;
  };

  /* record(c, label, res) — writes the reasoning step into the Calc */
  DT.record = function (c, label, res) { if (c && res && res.text) c.info("Bar choice – " + label, res.text, res.clause || ""); };

  /* check_bars(c, member, role, dia, spacing, o) — check-mode flags.
     o: {d, D, main_dia, stem_dia, label, ctx}. Code violations → FAIL, practice / site → WARN. */
  DT.check_bars = function (c, member, role, dia, spacing, o) {
    o = o || {}; var ctx = DT.ctx(o.ctx);
    var lab = o.label || (member + " " + role);
    var ok = true;
    var mc = DT.min_dia(member, role, ctx, Object.assign({}, o, { code_only: true }));
    ok = c.ok("Bar Ø ≥ code minimum (" + lab + ")", dia >= mc.dia - 1e-9,
      { detail: g(dia) + " ≥ " + g(mc.dia) + " mm", clause: mc.clause }) && ok;
    if (SLABLIKE[member] && o.D) {
      ok = c.ok("Bar Ø ≤ D/8 (" + lab + ")", dia <= o.D / 8 + 1e-9, { detail: g(dia) + " ≤ " + C().pyfmt(o.D / 8, ".1f") + " mm",
        clause: "IS 456 cl 26.5.2.2" }) && ok;
    }
    if (spacing != null && (R[member] || {})[role] && rule(member, role).smax_code) {
      var sc = DT.max_spacing(member, role, o.d, o.D, Object.assign({}, ctx, { detail: "code" }));
      ok = c.ok("Bar spacing ≤ code maximum (" + lab + ")", spacing <= sc.s + 1e-9, { detail: g(spacing) + " ≤ " + C().pyfmt(sc.s, ".0f") + " mm",
        clause: sc.clause }) && ok;
    }
    if (ctx.detail !== "code") {
      var mp = DT.min_dia(member, role, ctx, o);
      if (mp.dia > mc.dia)
        c.ok("Bar Ø ≥ " + (mp.level === "mine" ? "mining-site" : "practice") + " minimum (" + lab + ")", dia >= mp.dia - 1e-9,
          { detail: g(dia) + " ≥ " + g(mp.dia) + " mm (" + mp.reason + ")", clause: mp.clause, warn_only: true });
      if (role === "dist" && o.main_dia)
        c.ok("Distribution Ø ≤ main Ø (" + lab + ")", dia <= o.main_dia + 1e-9, { detail: g(dia) + " ≤ " + g(o.main_dia),
          clause: "Practice (SP 34)", warn_only: true });
      if (spacing != null && (R[member] || {})[role] && rule(member, role).smax_practice) {
        var sp = DT.max_spacing(member, role, o.d, o.D, ctx);
        c.ok("Bar spacing ≤ practice maximum (" + lab + ")", spacing <= sp.s + 1e-9, { detail: g(spacing) + " ≤ " + C().pyfmt(sp.s, ".0f") + " mm",
          clause: sp.clause, warn_only: true });
        c.ok("Bar spacing ≥ practical minimum (" + lab + ")", spacing >= DT.min_spacing(ctx) - 1e-9,
          { detail: g(spacing) + " ≥ " + g(DT.min_spacing(ctx)) + " mm (concreting / vibrator access)", clause: "IS 456 cl 26.3.2 / practice", warn_only: true });
      }
    }
    return ok;
  };

  /* water_min_steel(t_mm, ctx) → {As (mm²/m per face), text, clause}
     code:     IS 3370-2 legacy rule 0.24 % (t ≤ 100) → 0.16 % (t ≥ 450) of gross section, split over two faces (rcc.min_steel_water);
     practice: also ≥ 0.35 % of the surface zone per face (surface zone = t/2 ≤ 250 mm; HYSD) – IS 3370-2 surface-zone
               approach (as BS 8007 ρcrit for high-yield steel) – verify the % against your licensed IS 3370-2:2021. */
  DT.water_min_steel = function (t, ctx) {
    var pct = DS.rcc && DS.rcc.min_steel_water ? DS.rcc.min_steel_water(t) : 0.24;
    var code = pct / 100 * 1000 * t / 2;
    if (!DT.practice(ctx)) return { As: code, text: C().pyfmt(pct, ".3f") + " % of gross section → " + C().pyfmt(code, ".0f") + " mm²/m per face",
      clause: "IS 3370-2 cl 8.1" };
    var sz = Math.min(t / 2, 250), prac = 0.0035 * sz * 1000;
    var As = Math.max(code, prac);
    return { As: As, text: "max(" + C().pyfmt(pct, ".3f") + " % of gross / 2 = " + C().pyfmt(code, ".0f") + ", 0.35 % of surface zone " +
      C().pyfmt(sz, ".0f") + " mm = " + C().pyfmt(prac, ".0f") + ") = " + C().pyfmt(As, ".0f") + " mm²/m per face" +
      (t > 200 ? "; t > 200 mm → two layers, one near each face" : ""),
      clause: "IS 3370-2 cl 8.1 (surface-zone min steel – verify %)" };
  };

  /* site_checks(c, member, fck, cover, ctx) — mining site: severe exposure for ground / water-contact members */
  DT.site_checks = function (c, member, fck, cover, ctx) {
    ctx = DT.ctx(ctx);
    if (ctx.site !== "mine" || !c) return;
    var need = member === "footing" ? 50 : 45;
    c.ok("Mining site: cover ≥ " + need + " mm (severe exposure)", cover >= need, { detail: g(cover) + " mm",
      clause: "IS 456 Table 16 (Severe) / cl 26.4.2.2", warn_only: true });
    c.ok("Mining site: concrete ≥ M30 (severe exposure)", fck >= 30, { detail: "M" + g(fck), clause: "IS 456 Table 5 (Severe)", warn_only: true });
  };

  /* rules_table() → {columns, rows} for the UI / report */
  DT.rules_table = function () {
    var rows = [];
    Object.keys(R).forEach(function (m) {
      Object.keys(R[m]).forEach(function (ro) {
        var r = R[m][ro];
        rows.push([m, ro, r.code[0] + " (" + r.code[1] + ")", r.practice[0] + " (" + r.practice[1] + ")", r.mine ? String(r.mine[0]) : "",
          r.sc || ""]);
      });
    });
    return { columns: ["Member", "Role", "Min Ø code", "Min Ø practice", "Min Ø mine", "Max spacing"], rows: rows };
  };
})();
