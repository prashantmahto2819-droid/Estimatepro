/* Design Studio — modules_infra (port of civilest/design/modules_infra.py).
   Phase 3 – Drains, culverts, retaining walls, water tanks and road pavements.
     rcc_drain       Open rectangular RCC drain (U-section) – IS 456 / IS 3370, frame on elastic soil
     box_culvert     Single-cell RCC box culvert – IRC 6:2017 loads, IRC 112 design, frame on elastic soil
     pipe_culvert    Hume pipe culvert – rational runoff, Manning capacity, IRC SP-13 / IS 458 checks
     retaining_wall  Cantilever RCC retaining wall – IS 456 cl 20 stability, stem / heel / toe design
     water_tank      Circular ground water tank (flexible base) – IS 3370-2 working stress
     pavement        Flexible pavement – IRC 37:2018 traffic, moduli, allowable strains, layer check */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var C = DS.core, F = C.pyfmt, R = C.pyround, ceil_to = C.ceil_to;
  var M = DS.modules_infra = {};
  function RC() { return DS.rcc; }
  function LD() { return DS.loads; }
  function CM() { return DS.common; }
  function FR() { return DS.frame2d; }
  function DR() { return DS.drawing; }
  function row() { return CM().row.apply(null, arguments); }
  function Q() { return CM().Q.apply(null, arguments); }
  function B_() { return CM().B.apply(null, arguments); }
  function num(v) { return Number(v); }
  function maxArr(a) { return Math.max.apply(null, a); }
  function G(x) { return F(x, "g"); }

  var RCC_REFS = ["IS 456:2000 – Plain & reinforced concrete", "IS 3370 (Part 1 & 2):2009 – Liquid-retaining structures",
    "SP 16 & SP 34 – Design aids & detailing", "N. Krishna Raju – Advanced RCC Design",
    "P.C. Varghese – Limit State Design of Reinforced Concrete"];
  var IRC_REFS = ["IRC 6:2017 – Loads & load combinations for road bridges", "IRC 112:2020 – Concrete road bridges",
    "IRC SP-13:2022 – Guidelines for design of small bridges & culverts",
    "IRC 78 – Foundations & substructure", "MoRTH Specifications for Road & Bridge Works (5th Rev.)",
    "D.J. Victor – Essentials of Bridge Engineering", "N. Krishna Raju – Design of Bridges"];
  M.RCC_REFS = RCC_REFS; M.IRC_REFS = IRC_REFS;

  /* Param(key, label, default, unit = "", {kind, options, min, max, step, help, group, modes}) */
  function P(key, label, def, unit, o) {
    if (unit && typeof unit === "object") { o = unit; unit = ""; }
    return C.Param(Object.assign({ key: key, label: label, default: def, unit: unit || "" }, o || {}));
  }

  function _Ec(fck) { return 5000 * Math.sqrt(fck) * 1000.0; }           // kN/m²
  M._Ec = _Ec;

  /* Envelope of moments for members `ids`; faces = [face for sagging, face for hogging]. */
  function _frame_faces(res_list, ids, faces) {
    var pos = 0.0, neg = 0.0, V = 0.0;
    res_list.forEach(function (r) {
      ids.forEach(function (m) {
        var e = r.extremes(m);
        pos = Math.max(pos, e.M_max);
        neg = Math.min(neg, e.M_min);
        V = Math.max(V, e.V_abs);
      });
    });
    var o = {}; o[faces[0]] = pos; o[faces[1]] = -neg; o.V = V; return o;
  }
  M._frame_faces = _frame_faces;

  /* main bars spaced along a run (m); shape object o from DS.bbs */
  function _bars_bbs(member, mark, bars, run_length, o, note, shape) {
    var n = DS.bbs.count(run_length * 1000, bars.spacing, 50);
    if (typeof o === "number") o = DS.bbs.straight(bars.dia, o * 1000);
    return DS.bbs.row(member, mark, bars.dia, shape || "straight", n, o, note || "");
  }
  M._bars_bbs = _bars_bbs;
  /* distribution bars running along `run_length` (m), placed over `faces` faces each `width` (m) wide */
  function _dist_bbs(member, mark, dia, spacing, width, run_length, faces, fck, fy) {
    var BB = DS.bbs, n = BB.count(width * 1000, spacing, 50) * (faces || 1), o = BB.split(dia, run_length * 1000 - 2 * 50, fck || 25, fy || 500);
    return BB.row(member, mark, dia, "straight", n, o, "distribution @ " + G(spacing) + " c/c");
  }
  M._dist_bbs = _dist_bbs;

  function _steel_qty(bbs, title) {
    return Q("Reinforcement TMT Fe500 – cutting, bending, placing", "kg",
      bbs.map(function (r) { return CM().kg_row(title + ": " + r.member + " " + r.mark + " " + G(r.dia) + "Ø", r.nos, r.cut_length, r.dia * r.dia / 162); }),
      null, CM().RATE.rebar);
  }
  M._steel_qty = _steel_qty;

  function vals(o) { return Object.keys(o).map(function (k) { return o[k]; }); }

  /* =========================================================================== RCC DRAIN (U) */
  function run_drain(inp, mode) {
    var rcc = RC(), CMN = CMN_(), D = DR();
    var c = new C.Calc("RCC open drain");
    var B = num(inp.width), H = num(inp.depth);
    var fck = num(inp.fck), fy = num(inp.fy);
    var gam = num(inp.gamma), phi = num(inp.phi), q = num(inp.surcharge);
    var Lrun = num(inp.length);
    var cover = num(inp.cover);
    var watertight = !!inp.watertight;
    var climit = watertight ? 0.2 : 0.3;
    c.section("Geometry & materials");
    c.let("Clear width", "B", B, "m");
    c.let("Clear depth (wall height above base)", "H", H, "m");
    if (watertight && cover < 45) {
      if (mode !== "check") { c.info("Cover raised (water-tight drain)", G(cover) + " → 45 mm", "IS 3370-2:2009 practice – 45 mm nominal cover for liquid-retaining faces"); cover = 45; }
      else c.ok("Cover ≥ 45 mm for water-tight drain", false, { detail: G(cover) + " mm", clause: "IS 3370-2:2009 practice (45 mm)", warn_only: true });
    }
    rcc.cover_check(c, inp.exposure, cover, fck, "wall");
    var DT = DS.detailing, dmem = watertight ? "water" : "drain";   // bar-size rules (detailing.js)
    if (DT) DT.site_checks(c, "drain", fck, cover);
    var tw, tb, out;
    if (mode === "check") {
      tw = num(inp.t_wall); tb = num(inp.t_base);
    } else {
      tw = Math.max(0.15, ceil_to(H / 10 + 0.05, 0.025));
      tb = Math.max(0.15, ceil_to(tw + 0.025, 0.025));
      if (mode === "thumb") c.info("Thumb rule", "wall ≈ H/10 + 50 mm (≥ 150), base ≈ wall + 25 mm", "Practice");
    }
    for (var it = 0; it < 12; it++) {
      var sc = new C.Calc("s");
      out = _drain_analysis(sc, inp, B, H, tw, tb, gam, phi, q, fck);
      var Mw = Math.max(out.wall.outer, out.wall.inner);
      var Mb = Math.max(out.base.outer, out.base.inner);
      var dw = tw * 1000 - cover - 6;
      var db = tb * 1000 - cover - 6;
      var lim = 0.133 * fck * 1000;
      var ok = 1.5 * Mw * 1e6 <= lim * dw * dw && 1.5 * Mb * 1e6 <= lim * db * db;
      // shear (one-way, no stirrups)
      ok = ok && (1.5 * out.wall.V * 1000 / (1000 * dw) <= 0.36 && 1.5 * out.base.V * 1000 / (1000 * db) <= 0.36);
      if (ok || mode === "check") break;
      tw += 0.025;
      tb += 0.025;
    }
    c.let("Wall thickness", "tw", R(tw * 1000), "mm");
    c.let("Base slab thickness", "tb", R(tb * 1000), "mm");
    out = _drain_analysis(c, inp, B, H, tw, tb, gam, phi, q, fck);
    // water-tight: IS 3370-2:2009 cl 8.1.1 minimum steel (DS.detailing.water_min_steel – same rule as the tank), as an
    // equivalent % per face for design_strip: As = pct/100·1000·D/2  →  pct = 0.2·As/D
    var wmw = watertight && DT ? DT.water_min_steel(tw * 1000) : null, wmb = watertight && DT ? DT.water_min_steel(tb * 1000) : null;
    var pmin = watertight ? (wmw ? 0.2 * wmw.As / (tw * 1000) : rcc.min_steel_water(tw * 1000)) : 0.12;
    var pminb = watertight ? (wmb ? 0.2 * wmb.As / (tb * 1000) : rcc.min_steel_water(tb * 1000)) : 0.12;
    if (wmw) { c.info("Minimum steel per face – wall (water-tight)", wmw.text, wmw.clause.replace("cl 8.1", "cl 8.1.1")); c.info("Minimum steel per face – base (water-tight)", wmb.text, wmb.clause.replace("cl 8.1", "cl 8.1.1")); }
    var res = {};
    [["wall", tw, ["outer", "inner"], pmin], ["base", tb, ["outer", "inner"], pminb]].forEach(function (tpl) {
      var mem = tpl[0], t = tpl[1], faces = tpl[2], pm = tpl[3];
      c.section("Design – " + mem);
      faces.forEach(function (face) {
        var Mm = out[mem][face];
        var given = mode === "check" ? [num(inp[mem + "_" + face + "_dia"]), num(inp[mem + "_" + face + "_s"])] : null;
        var used = Object.keys(res).map(function (k) { return res[k].dia; });
        res[mem + "|" + face] = rcc.design_strip(c, 1.5 * Mm, t * 1000, cover, fck, fy, mem + " " + face + " face", Mm,
          climit, watertight ? pm : null, given, DT ? { rule: { member: dmem, role: "main", prefer: used } } : {});
      });
      var d = t * 1000 - cover - 6;
      rcc.shear(c, 1.5 * out[mem].V, 1000, d, 100 * maxArr(faces.map(function (f) { return res[mem + "|" + f].Ast_prov; })) / (1000 * d),
        fck, fy, "wall", { D: t * 1000, tag: "(" + mem + ")" });
    });
    var main_min = Math.min.apply(null, Object.keys(res).map(function (k) { return res[k].dia; }));
    var Adist = watertight ? Math.max(pmin / 100 * 1000 * tw * 1000 / 2, pminb / 100 * 1000 * tb * 1000 / 2) : 0.12 / 100 * 1000 * tw * 1000 / 2;
    c.calc("Distribution / horizontal steel per face" + (watertight ? " (IS 3370-2 min, wall & base)" : ""), "As,d", watertight ? "max(Asw, Asb)" : "0.12/100*1000*D/2", "mm²/m",
      watertight ? "IS 3370-2:2009 cl 8.1.1" : "IS 456 cl 26.5.2.1", watertight ? { Asw: R(pmin / 100 * 1000 * tw * 1000 / 2, 1), Asb: R(pminb / 100 * 1000 * tb * 1000 / 2, 1) } : { D: R(tw * 1000) });
    var dist = rcc.slab_bars(Math.max(Adist, 1), tw * 1000 - cover - 20,
      tw * 1000, false, DT ? { dias: [8, 10, 12], rule: { member: dmem, role: "dist", main_dia: main_min } } : { dias: [8, 10, 12] });
    if (DT) DT.record(c, "distribution / horizontal bars", dist);
    c.let("Distribution / horizontal bars (each face)", "", G(dist.dia) + "Ø @ " + G(dist.spacing) + " c/c", "",
      "IS 456 cl 26.5.2.1 / IS 3370-2 cl 8.1");
    c.thumb("Wall thickness", Math.max(150, H * 100 + 50), tw * 1000, "mm", "H/10 + 50 mm, ≥ 150", "Practice");
    c.miss("Expansion / contraction joints with PVC water-stop every 10–15 m along the drain", "IS 3370-1 cl 7",
      "Important");
    c.miss("Hydraulic design (discharge, longitudinal slope, velocity 0.6–3 m/s) – size B × H from runoff",
      "IRC SP-42 / CPHEEO", "Important");
    if (inp.covered) c.miss("Cover slab design for vehicle wheel load (IRC 6 Class A) – not included", "IRC 6 / IRC 112", "Critical");
    c.miss("Uplift check for empty drain if ground-water table is high", "IS 456 cl 20", "Advisory");

    // quantities
    var W = B + 2 * tw;
    var exc_d = H + tb + 0.10;
    // BBS: wall bars = L (vertical full height + leg into base), base bars = U (across base, legs up into the walls)
    var BB = DS.bbs, bbs = [], cvm = cover;
    Object.keys(res).forEach(function (key) {
      var mem = key.split("|")[0], face = key.split("|")[1], b = res[key], leg = BB.leg(b.dia, BB.cfg.wall_leg_min), o;
      if (mem === "wall") o = BB.lbar(b.dia, (H + tb) * 1000 - 2 * cvm, face === "outer" ? Math.min(leg, W * 1000 / 2) : leg);
      else o = BB.ubar(b.dia, W * 1000 - 2 * cvm, Math.min(leg, (H + tb) * 1000 - 2 * cvm));
      var r = _bars_bbs("Drain " + mem, mem[0].toUpperCase() + face[0].toUpperCase(), b, Lrun, o, face + " face @ " + G(b.spacing) + " c/c", mem === "wall" ? "L (vertical + leg into base)" : "U (across base, legs into walls)");
      if (mem === "wall") r.nos *= 2;
      bbs.push(r);
    });
    bbs.push(_dist_bbs("Drain walls", "WD", dist.dia, dist.spacing, H, Lrun, 4, fck, fy));   // 2 walls × 2 faces
    bbs.push(_dist_bbs("Drain base", "BD", dist.dia, dist.spacing, W, Lrun, 2, fck, fy));    // 2 faces
    var qty = [Q("Earth work in excavation for drains, all kinds of soil", "cum",
      [row("Drain trench", 1, Lrun, W + 0.6, exc_d)], [CMN.CPWD, "2.8.1"]),
    Q("PCC 1:4:8 bed below drain", "cum", [row("Levelling course", 1, Lrun, W + 0.2, 0.10)], [CMN.CPWD, "4.1.8"]),
    Q("RCC M" + G(fck) + " in drain walls & base (excl. steel & shuttering)", "cum",
      [row("Walls", 2, Lrun, tw, H), row("Base slab", 1, Lrun, W, tb)], null, CMN.rcc_rate(fck)),
    Q("Centering & shuttering for drain walls", "sqm", [row("Wall faces (both)", 4, Lrun, null, H)], null, CMN.RATE.shutter_wall),
    _steel_qty(bbs, "Drain"),
    Q("Filling available excavated earth behind drain walls", "cum",
      [row("Backfill both sides", 2, Lrun, 0.30, H + tb)], [CMN.CPWD, "2.25"])];
    if (inp.covered) qty.push(Q("Precast RCC drain cover slab 75–100 mm, M25", "rm", [row("Cover slabs", 1, Lrun)], null, 1800.0));

    // drawing
    var v = new D.View("Drain cross section");
    var Bm = B * 1000, Hm = H * 1000, twm = tw * 1000, tbm = tb * 1000;
    v.poly([[-twm, 0], [Bm + twm, 0], [Bm + twm, tbm + Hm], [Bm, tbm + Hm], [Bm, tbm], [0, tbm], [0, tbm + Hm],
      [-twm, tbm + Hm]], true, "OUTLINE", "concrete");
    v.rect(-twm - 100, -100, Bm + 2 * twm + 200, 100, "CONCRETE");
    v.line(-twm - 600, tbm + Hm, -twm, tbm + Hm, "SOIL");
    v.line(Bm + twm, tbm + Hm, Bm + twm + 600, tbm + Hm, "SOIL");
    var ro = res["wall|outer"], ri = res["wall|inner"];
    var bo = res["base|outer"], bi = res["base|inner"];
    var cv = cover;
    [-twm + cv, Bm + twm - cv].forEach(function (x) { v.line(x, cv, x, tbm + Hm - cv, "REBAR"); });
    [-cv, Bm + cv].forEach(function (x) { v.line(x, tbm - cv, x, tbm + Hm - cv, "REBAR"); });
    v.line(-twm + cv, cv, Bm + twm - cv, cv, "REBAR");
    v.line(0, tbm - cv, Bm, tbm - cv, "REBAR");
    v.text(-twm - 700, tbm + Hm / 2, "Outer " + G(ro.dia) + "Ø@" + G(ro.spacing), 2.2, { anchor: "end" });
    v.text(Bm / 2, tbm + Hm / 2, "Inner " + G(ri.dia) + "Ø@" + G(ri.spacing), 2.2, { anchor: "middle" });
    v.text(Bm / 2, -400, "Base: bottom " + G(bo.dia) + "Ø@" + G(bo.spacing) + ", top " + G(bi.dia) + "Ø@" + G(bi.spacing) + "; " +
      "dist. " + G(dist.dia) + "Ø@" + G(dist.spacing), 2.2, { anchor: "middle" });
    v.dim(0, tbm + Hm, Bm, tbm + Hm, -8, F(Bm, ",.0f") + " CLEAR");
    v.dim(Bm + twm, 0, Bm + twm, tbm + Hm, -10);
    v.dim(-twm, tbm + Hm, 0, tbm + Hm, -8);
    v.dim(-twm, 0, -twm, tbm, 8);
    var pv = new D.View("Plan (typical 10 m length)");
    pv.rect(0, 0, 10000, Bm + 2 * twm, "OUTLINE");
    pv.rect(0, twm, 10000, Bm, "HIDDEN");
    pv.line(10000, 0, 10000, Bm + 2 * twm, "CENTER");
    pv.text(10000, Bm + 2 * twm + 300, "EXPANSION JOINT WITH PVC WATER-STOP", 2.5, { anchor: "end" });
    pv.dim(0, 0, 10000, 0, 8);
    var sheet = new D.Sheet("RCC drain – section & plan", "DR-01", [v, pv],
      ["Concrete M" + G(fck) + ", steel Fe" + G(fy) + ", clear cover " + G(cover) + " mm.",
        "Design: earth pressure Ka = " + F(rcc.ka_rankine(phi), ".3f") + ", surcharge " + G(q) + " kN/m²; drain full " +
        "of water before backfilling.", "Crack width limited to " + C.pystr(climit) + " mm.",
        "PCC 1:4:8, 100 thick below base.", watertight ? "Weep holes not provided (water-tight drain)."
          : "Provide weep holes 75 mm @ 1.5 m c/c if ground water drains in."]);
    var summary = { "Section": F(B * 1000, ".0f") + " × " + F(H * 1000, ".0f") + " clear, walls " + F(tw * 1000, ".0f") + ", base " + F(tb * 1000, ".0f") + " mm",
      "Wall bars": "outer " + G(ro.dia) + "Ø@" + G(ro.spacing) + ", inner " + G(ri.dia) + "Ø@" + G(ri.spacing),
      "Base bars": "bottom " + G(bo.dia) + "Ø@" + G(bo.spacing) + ", top " + G(bi.dia) + "Ø@" + G(bi.spacing),
      "Concrete": F(2 * tw * H + W * tb, ".3f") + " cum/m", "Max utilisation": F(c.max_utilisation, ".2f") };
    return C.DesignResult({ module: "rcc_drain", title: "RCC open drain", inputs: inp, calc: c, summary: summary, drawings: [sheet],
      quantities: qty, bbs: bbs,
      tables: { "Design moments (service, kN·m/m)": C.table(["wall", "base"].map(function (k) { return [k, out[k].outer, out[k].inner, out[k].V]; }),
        ["Member", "Outer face", "Inner face", "Shear V"]) }, references: RCC_REFS });
  }
  function CMN_() { return DS.common; }
  M.run_drain = run_drain;

  function _drain_analysis(c, inp, B, H, tw, tb, gam, phi, q, fck) {
    var rcc = RC(), FM = FR();
    var Bc = B + tw;
    var Ht = H + tb / 2;
    var ks = num(inp.ks);
    var E = _Ec(fck);
    var f = new FM.Frame();
    var nseg = 8, k;
    var base_nodes = [];
    for (k = 0; k <= nseg; k++) base_nodes.push(f.node(Bc * k / nseg, 0));
    var top_l = f.node(0, Ht), top_r = f.node(Bc, Ht);
    var base_ids = [];
    for (k = 0; k < nseg; k++) base_ids.push(f.member(base_nodes[k], base_nodes[k + 1], E, tb, Math.pow(tb, 3) / 12));
    var wl = f.member(base_nodes[0], top_l, E, tw, Math.pow(tw, 3) / 12);
    var wr = f.member(base_nodes[base_nodes.length - 1], top_r, E, tw, Math.pow(tw, 3) / 12);
    base_nodes.forEach(function (n, k) {
      var trib = Bc / nseg * ((k === 0 || k === nseg) ? 0.5 : 1.0);
      if (k === 0) trib += tw / 2;
      if (k === nseg) trib += tw / 2;
      f.spring(n, 0, ks * trib, 0);
    });
    f.support(base_nodes[Math.floor(nseg / 2)], true, false, false);
    var Ka = rcc.ka_rankine(phi);
    c.section("Loads (per metre run)");
    c.calc("Active earth pressure coefficient", "Ka", "(1 - sin(radians(ph)))/(1 + sin(radians(ph)))", "",
      "Rankine", { ph: phi });
    var p_top = c.calc("Lateral pressure at top (surcharge)", "p0", "Ka*q", "kN/m²", "", { Ka: R(Ka, 4), q: q });
    var p_bot = c.calc("Lateral pressure at base centre-line", "p1", "Ka*(gam*Ht + q)", "kN/m²", "", { Ka: R(Ka, 4),
      gam: gam, Ht: R(Ht, 3), q: q });
    var pw = c.calc("Water pressure at base (drain full)", "pw", "10*Hw", "kN/m²", "IS 3370", { Hw: H });
    var DL = new FM.LoadCase("DL");
    base_ids.forEach(function (m) { DL.add_member(m, ["gudl", 0, -25 * tb, "length"]); });
    [wl, wr].forEach(function (m) { DL.add_member(m, ["gudl", 0, -25 * tw, "length"]); });
    var EP = new FM.LoadCase("EP");
    EP.add_member(wl, ["trap", -p_bot, -p_top]);           // left wall local +y outward → inward = −y
    EP.add_member(wr, ["trap", p_bot, p_top]);             // right wall local +y inward
    var WP = new FM.LoadCase("Water");
    WP.add_member(wl, ["trap", pw, 0.0]);
    WP.add_member(wr, ["trap", -pw, 0.0]);
    base_ids.forEach(function (m) { WP.add_member(m, ["gudl", 0, -10 * H, "length"]); });
    var cases = { "Empty + earth": FM.combine_cases([DL, EP], [1, 1], ""),
      "Full, no earth (test)": FM.combine_cases([DL, WP], [1, 1], ""),
      "Full + earth": FM.combine_cases([DL, EP, WP], [1, 1, 1], "") };
    var res = {};
    Object.keys(cases).forEach(function (kk) { res[kk] = f.solve(cases[kk]); });
    c.info("Analysis", "U-frame on elastic soil (ks = " + F(ks, ".0f") + " kN/m³), cases: " + Object.keys(cases).join(", "),
      "Winkler foundation");
    // faces: left wall sagging → inner, hogging → outer ; base sagging → outer (bottom), hogging → inner
    var rl = vals(res);
    var wall = _frame_faces(rl, [wl], ["inner", "outer"]);
    var wall_r = _frame_faces(rl, [wr], ["outer", "inner"]);
    wall = { outer: Math.max(wall.outer, wall_r.outer), inner: Math.max(wall.inner, wall_r.inner),
      V: Math.max(wall.V, wall_r.V) };
    var base = _frame_faces(rl, base_ids, ["outer", "inner"]);
    c.let("Service moments – wall", "", "outer " + F(wall.outer, ".2f") + ", inner " + F(wall.inner, ".2f") + " kN·m/m", "");
    c.let("Service moments – base", "", "outer " + F(base.outer, ".2f") + ", inner " + F(base.inner, ".2f") + " kN·m/m", "");
    return { wall: wall, base: base, frame: f, res: res };
  }
  M._drain_analysis = _drain_analysis;

  var EXPOSURE_OPTS = Object.keys(DS.materials.EXPOSURE);
  var DRAIN_PARAMS = [
    P("width", "Clear width", 1.0, "m", { min: 0.3, max: 4, step: 0.05, group: "Geometry" }),
    P("depth", "Clear depth", 1.2, "m", { min: 0.3, max: 4, step: 0.05, group: "Geometry" }),
    P("length", "Length of drain (quantity)", 100.0, "m", { min: 1, max: 10000, group: "Geometry" }),
    P("covered", "Provide precast cover slabs", false, { kind: "bool", group: "Geometry" }),
    P("gamma", "Soil unit weight", 18.0, "kN/m³", { min: 14, max: 22, group: "Soil" }),
    P("phi", "Angle of internal friction", 30.0, "°", { min: 15, max: 40, group: "Soil" }),
    P("surcharge", "Surcharge (traffic / footpath)", 10.0, "kN/m²", { min: 0, max: 30, group: "Soil",
      help: "≈ 10–12 kN/m² for roadside drains (IRC 6 cl 214: 1.2 m fill ≈ 21.6 kN/m² for heavy traffic)" }),
    P("ks", "Modulus of subgrade reaction", 20000.0, "kN/m³", { min: 5000, max: 100000, step: 1000, group: "Soil" }),
    P("fck", "Concrete grade fck", 25.0, "N/mm²", { kind: "select", options: [20.0, 25.0, 30.0, 35.0], group: "Materials" }),
    P("fy", "Steel fy", 500.0, "N/mm²", { kind: "select", options: [415.0, 500.0], group: "Materials" }),
    P("exposure", "Exposure", "Moderate", { kind: "select", options: EXPOSURE_OPTS.slice(), group: "Materials" }),
    P("cover", "Clear cover", 45.0, "mm", { min: 25, max: 75, step: 5, group: "Materials",
      help: "45 mm for water-tight drains (IS 3370-2 practice; raised automatically in design mode); 40 mm otherwise (IS 456 Table 16)." }),
    P("watertight", "Water-tight design (IS 3370, crack ≤ 0.2 mm)", true, { kind: "bool", group: "Materials" }),
    P("t_wall", "Wall thickness (check mode)", 0.20, "m", { min: 0.1, max: 0.6, step: 0.025, group: "My design", modes: ["check"] }),
    P("t_base", "Base thickness (check mode)", 0.225, "m", { min: 0.1, max: 0.6, step: 0.025, group: "My design", modes: ["check"] })
  ];
  ["wall", "base"].forEach(function (m) {
    ["outer", "inner"].forEach(function (fc) {
      ["dia", "s"].forEach(function (k) {
        var isd = k === "dia";
        DRAIN_PARAMS.push(P(m + "_" + fc + "_" + k, m[0].toUpperCase() + m.slice(1) + " " + fc + " face bar " + (isd ? "dia" : "spacing") + " (check)",
          isd ? 12.0 : 150.0, "mm", { min: isd ? 8 : 75, max: isd ? 32 : 300, step: isd ? 1 : 5, group: "My design", modes: ["check"] }));
      });
    });
  });
  M.DRAIN_PARAMS = DRAIN_PARAMS;
  C.register({ id: "rcc_drain", phase: 3, category: "Drains, culverts & roads", name: "RCC open drain (U-section)", icon: "🌊",
    description: "Rectangular RCC drain as a U-frame on elastic soil: earth + surcharge, drain full (test) " +
      "cases; wall & base design with IS 3370 crack-width control, BBS and quantities.",
    params: DRAIN_PARAMS, run: run_drain, references: RCC_REFS });

  /* =========================================================================== BOX CULVERT */
  /* Rewritten (culvert loading review, SECL Korba): road (IRC 6), railway (IRS Bridge Rules / IRS CBC) and mine-dumper
     loading with dispersion through fill, impact / CDA reduced with fill, braking, at-rest earth pressure, live-load
     surcharge, water inside / outside + uplift; closed frame on Winkler springs with moving-load envelopes; IRC 112 ULS
     flexure & shear, SLS crack width & stress limits, practice minimums; bearing, sliding and flotation. */
  var EXPO_ORDER = ["Mild", "Moderate", "Severe", "Very severe", "Extreme"];
  var CV_VEHICLES = ["IRC Class A", "IRC Class AA (tracked)", "IRC 70R tracked", "IRC 70R (wheeled & tracked, governing)",
    "Railway – IRS 25 t loading-2008", "Railway – DFC 32.5 t axle", "Mine dumper (custom GVW/axles)"];
  var DUMPER_OPTS = ["Custom"].concat(Object.keys(DS.loads.DUMPERS || {}));
  var CV_SPACINGS = [200, 175, 150, 140, 125, 120, 110, 100, 90, 80, 75];
  var GAM_W = 10.0;                                                   // kN/m³
  M.CV_VEHICLES = CV_VEHICLES;
  /* Culvert location keeps the three environments apart: a road culvert (IRC), a railway culvert (IRS / RDSO – railway
     rules only, the mining-area profile is not applied) and a mine haul-road culvert (dumpers, mine environment). */
  var CV_LOCS = ["Road (IRC loading)", "Railway (IRS / RDSO loading)", "Mine haul road (dumper loading)"];
  var CV_LOC_KIND = { "Road (IRC loading)": "road", "Railway (IRS / RDSO loading)": "rail", "Mine haul road (dumper loading)": "dumper" };
  var CV_LOC_DEFAULT = { road: "IRC Class A", rail: "Railway – IRS 25 t loading-2008", dumper: "Mine dumper (custom GVW/axles)" };
  M.CV_LOCS = CV_LOCS;
  function _locKind(v) { return CV_LOC_KIND[String(v.location)] || null; }
  /* the live load decides the environment (the UI keeps the two in step: changing the location resets the live load
     to that location's options); the location shown in reports always matches the loading used */
  function _cv_norm(inp) {
    var k = _cv_kind(inp.vehicle), loc = CV_LOCS.filter(function (l) { return CV_LOC_KIND[l] === k; })[0];
    if (String(inp.location) !== loc) { inp = Object.assign({}, inp); inp.location = loc; }
    return inp;
  }
  M._cv_norm = _cv_norm;

  function _cv_kind(veh) { veh = String(veh); return /^Railway/.test(veh) ? "rail" : /^Mine dumper/.test(veh) ? "dumper" : "road"; }
  function _ctx() { return C.ctx || { site: "general", detail: "practice" }; }
  function _bar_area(d) { return DS.materials.bar_area(d); }

  /* dumper geometry from preset or custom inputs */
  function _cv_dumper(inp) {
    var LDs = LD();
    var m = inp.dumper_model && inp.dumper_model !== "Custom" ? LDs.DUMPERS[inp.dumper_model] : null;
    if (m) return Object.assign({ name: inp.dumper_model, axles: 2, sp: m.wb, dual: true }, m);
    return { name: "Custom dumper " + G(num(inp.dumper_gvw)) + " t", gvw: num(inp.dumper_gvw), f: num(inp.dumper_front),
      axles: Math.max(2, Math.trunc(num(inp.dumper_axles))), wb: num(inp.dumper_spacing), sp: num(inp.dumper_spacing),
      Tf: num(inp.dumper_track_f), Tr: num(inp.dumper_track_r), s: num(inp.dumper_dual_cc), b: num(inp.dumper_tyre_b),
      p: num(inp.dumper_tyre_p), dual: inp.dumper_dual !== "No", approx: true };
  }

  /* Live-load model. Each variant: axles [{x, l (contact length along travel), wheels:[{y, b, P}]}], imp (impact / CDA).
     z = depth of dispersion (m), k = spread per unit depth on each side (1.0 = 45°, 0.5 = 1H:2V). */
  function _cv_vehicle(inp, Sc, fill, gam) {
    var LDs = LD(), veh = String(inp.vehicle), kind = _cv_kind(veh), mine = kind === "road" && _ctx().site === "mine";
    var lanes = Math.max(1, Math.trunc(num(inp.lanes) || 1));
    var V = { kind: kind, veh: veh, variants: [], k: 1.0, slab_add: 0, lanes: lanes };
    function cum(sp) { var xs = [0]; sp.forEach(function (s) { xs.push(xs[xs.length - 1] + s); }); return xs; }
    if (kind === "road") {
      V.z = fill + (fill <= 0 ? 0.065 : 0);
      V.k = 1.0;
      V.k_clause = "IRC 6 cl 204.2 / IRC 112 B.3 (45° dispersion through fill)";
      V.slab_add = 0.5 * Sc;                        // IRC 112 Annex B3.2 slab effective width (α·a(1 − a/l) ≈ 0.5 l, conservative)
      var half = fill >= 0.6 ? 0.5 : 1.0;
      V.imp_clause = "IRC 6 cl 208" + (half < 1 ? " (½ impact, fill ≥ 0.6 m – cl 208.6)" : "");
      var tracked = function (T, name) {
        V.variants.push({ name: name, imp: LDs.impact_70r_tracked(Sc) * half, axles: [{ x: 0, l: T.length,
          wheels: [{ y: -T.track_cc / 2, b: T.track_width, P: T.load / 2 }, { y: T.track_cc / 2, b: T.track_width, P: T.load / 2 }] }] });
      };
      if (veh === "IRC Class A") {
        var CA = LDs.CLASS_A, xa = cum(CA.spacing);
        V.variants.push({ name: "IRC Class A × " + lanes + " lane(s)", imp: LDs.impact_class_a(Sc) * half,
          axles: CA.axles.map(function (A, i) {
            var ct = CA.contact[A], wh = [];
            for (var j = 0; j < lanes; j++) { wh.push({ y: j * 3.5, b: ct[0], P: A / 2 }, { y: j * 3.5 + CA.wheel_gauge, b: ct[0], P: A / 2 }); }
            return { x: xa[i], l: ct[1], wheels: wh };
          }) });
      }
      if (veh === "IRC 70R tracked" || veh === "IRC 70R (wheeled & tracked, governing)") tracked(LDs.CLASS_70R_TRACKED, "IRC 70R tracked (700 kN)");
      if (veh === "IRC Class AA (tracked)") tracked(LDs.CLASS_AA_TRACKED, "IRC Class AA tracked (700 kN)");
      if (veh === "IRC 70R (wheeled & tracked, governing)") {
        var W7 = LDs.CLASS_70R_WHEELED, tr = LDs.CLASS_70R_WHEELED_TRACK, x7 = cum(W7.spacing);
        var wl = function (A) { return [{ y: -tr.wheel_cc / 2, b: tr.contact[0], P: A / 2 }, { y: tr.wheel_cc / 2, b: tr.contact[0], P: A / 2 }]; };
        V.variants.push({ name: "IRC 70R wheeled train (1000 kN)", imp: LDs.impact_70r_wheeled(Sc) * half,
          axles: W7.axles.map(function (A, i) { return { x: x7[i], l: tr.contact[1], wheels: wl(A) }; }) });
        var Bg = LDs.CLASS_70R_BOGIE, xb = cum(Bg.spacing);
        V.variants.push({ name: "IRC 70R wheeled bogie (2 × 200 kN)", imp: LDs.impact_70r_wheeled(Sc) * half,
          axles: Bg.axles.map(function (A, i) { return { x: xb[i], l: Bg.contact[1], wheels: wl(A) }; }) });
      }
      V.brake = fill < 1.0 ? 0.20 : 0.0;
      V.brake_clause = "IRC 6 cl 211.2 – 20 % of vehicle load on the box; neglected for fill ≥ 1.0 m [GP]";
      V.ls = function () { return Math.max(gam * 1.2, mine ? 20.0 : 0.0); };
      V.ls_clause = "IRC 6 cl 214.1.1.3 – 1.2 m equivalent earth" + (mine ? "; ≥ 20 kN/m² beside mine roads [GP]" : "");
      V.psi_crack = 0.75;
    } else if (kind === "rail") {
      var key = /DFC/.test(veh) ? "DFC-32.5t" : "25t-2008", RL = LDs.IRS[key], SL = LDs.IRS.sleeper;
      var tracks = Math.max(1, Math.trunc(num(inp.tracks) || 1));
      V.ballast = num(inp.ballast);
      V.z = V.ballast + fill;
      V.k = 0.5;
      V.k_clause = "IRS Bridge Rules cl 2.3.4.2 – sleeper 2.745 m, dispersion ½H : 1V through ballast & fill";
      var xr = cum(RL.spacing);
      var cda = LDs.cda_irs(Sc, V.z);
      V.imp_clause = "IRS Bridge Rules cl 2.4.1.1 / 2.4.2 – CDA reduced with depth d = " + F(V.z, ".2f") + " m below sleeper";
      V.variants.push({ name: RL.name + " × " + tracks + " track(s)", imp: cda,
        axles: RL.loads.map(function (A, i) {
          var wh = []; for (var j = 0; j < tracks; j++) wh.push({ y: j * SL.track_cc, b: SL.length, P: A });
          return { x: xr[i], l: SL.spacing, wheels: wh };
        }) });
      V.uniform = { w: RL.pipe_tpm * 9.81, B: SL.length + V.z, imp: cda, name: "Bridge Rules uniform intensity " + G(RL.pipe_tpm) + " t/m" };
      V.brake = V.z < 0.9 ? 0.25 : 0.0;
      V.brake_clause = "IRS Bridge Rules cl 2.8 – tractive effort / braking ≈ 25 % of axle loads on span, for d < 0.9 m [ASSUMPTION]";
      V.ls = function (zs) { return RL.pipe_tpm * 9.81 * (1 + LDs.cda_irs(Sc, zs)) / (SL.length + zs); };
      V.ls_clause = "IRS Substructure Code cl 5.8 / Bridge Rules: " + G(RL.pipe_tpm) + " t/m spread over (2.745 + z) m, with CDA";
      V.psi_crack = 1.0;
      V.q_track = 19.0 * (V.ballast + 0.20) + 2.0;          // ballast (incl. crib to sleeper top) + rails & sleepers
      V.rail = RL;
    } else {
      var Dm = _cv_dumper(inp), OL = num(inp.dumper_overload) || 1.10;
      V.dumper = Dm; V.gvw = Dm.gvw; V.OL = OL;
      V.z = fill;
      V.k = inp.fill_disp === "Loose dump / OB fill (2V:1H)" ? 0.5 : 1.0;
      V.k_clause = V.k === 1 ? "45° dispersion through compacted fill (IRC practice)" : "2V:1H dispersion – loose / dumped fill [GP]";
      V.slab_add = 0.5 * Sc;                        // IRC 112 Annex B3.2 slab effective width (α·a(1 − a/l) ≈ 0.5 l, conservative)
      var Wt = Dm.gvw * 9.81 * OL, Pf = Wt * Dm.f, nr = Dm.axles - 1, Pr = Wt * (1 - Dm.f) / nr;
      var nrw = Dm.dual ? 4 : 2, wdt = Math.max(Dm.Tf, Dm.Tr + (Dm.dual ? Dm.s : 0)) + Dm.b, off = 1.5 * wdt;
      var lf = Pf / 2 / (Dm.p * Dm.b), lr = Pr / nrw / (Dm.p * Dm.b);
      V.lr = lr; V.Pr = Pr; V.Pf = Pf;
      var axles = [];
      for (var j = 0; j < lanes; j++) {
        var y0 = j * off;
        if (j === 0) {
          axles.push({ x: 0, l: lf, wheels: [] });
          for (var r = 1; r <= nr; r++) axles.push({ x: Dm.axles === 2 ? Dm.wb : r * Dm.sp, l: lr, wheels: [] });
        }
        axles[0].wheels.push({ y: y0 - Dm.Tf / 2, b: Dm.b, P: Pf / 2 }, { y: y0 + Dm.Tf / 2, b: Dm.b, P: Pf / 2 });
        for (var r2 = 1; r2 <= nr; r2++) {
          if (Dm.dual) axles[r2].wheels.push({ y: y0 - Dm.Tr / 2 - Dm.s / 2, b: Dm.b, P: Pr / 4 }, { y: y0 - Dm.Tr / 2 + Dm.s / 2, b: Dm.b, P: Pr / 4 },
            { y: y0 + Dm.Tr / 2 - Dm.s / 2, b: Dm.b, P: Pr / 4 }, { y: y0 + Dm.Tr / 2 + Dm.s / 2, b: Dm.b, P: Pr / 4 });
          else axles[r2].wheels.push({ y: y0 - Dm.Tr / 2, b: Dm.b, P: Pr / 2 }, { y: y0 + Dm.Tr / 2, b: Dm.b, P: Pr / 2 });
        }
      }
      V.variants.push({ name: Dm.name + " loaded × " + G(OL) + " overload, " + lanes + " side by side", imp: LDs.impact_dumper(V.z), axles: axles });
      V.imp_clause = "Haul-road dynamic allowance 0.30 → 0.10 with cover [GP]";
      V.brake = V.z < 1.0 ? 0.30 : 0.0;
      V.brake_clause = "Dumper braking ≈ 0.3 g on ramps, cover < 1.0 m [ASSUMPTION]";
      V.ls = function (zs) { var kz = 2 * V.k * Math.max(zs, 0); return Pr * (1 + LDs.impact_dumper(zs)) / ((Dm.Tr + (Dm.dual ? Dm.s : 0) + Dm.b + kz) * (lr + kz)); };
      V.ls_clause = "Rear-axle prism of the dumper dispersed to depth z (incl. dynamic) [GP]";
      V.psi_crack = 1.0;
    }
    return V;
  }

  /* peak line intensity (kN per m of barrel) of one axle after transverse dispersion */
  function _axle_line(ax, z, k, slab_add) {
    var st = ax.wheels.map(function (w) { var wd = w.b + 2 * k * z + slab_add; return [w.y - wd / 2, w.y + wd / 2, w.P / wd]; });
    var best = 0;
    st.forEach(function (s0) {
      [s0[0] + 1e-6, s0[1] - 1e-6].forEach(function (y) {
        var q = 0; st.forEach(function (s) { if (y >= s[0] && y <= s[1]) q += s[2]; });
        best = Math.max(best, q);
      });
    });
    return best;
  }
  M._axle_line = _axle_line;

  /* patches of a variant: [{x, la, p}] where p = dispersed pressure incl. impact (kN/m²) */
  function _cv_patches(V, vr, z, slab_add) {
    return vr.axles.map(function (ax) {
      var la = ax.l + 2 * V.k * z, q = _axle_line(ax, z, V.k, slab_add);
      return { x: ax.x, la: la, p: q * (1 + vr.imp) / la, q: q, P: ax.wheels.reduce(function (s, w) { return s + w.P; }, 0) };
    });
  }

  function _cv_opts(inp, V, S_) {
    var ctx = _ctx(), practice = (ctx.detail || "practice") !== "code";
    var rail = V.kind === "rail", dump = V.kind === "dumper";
    // railway culverts follow railway rules only; haul-road culverts are always in the mine environment
    var siteMine = ctx.site === "mine", mine = !rail && (siteMine || dump);
    var exp = inp.exposure in DS.materials.EXPOSURE ? inp.exposure : "Moderate";
    if (mine && EXPO_ORDER.indexOf(exp) < EXPO_ORDER.indexOf("Severe")) exp = "Severe";
    var crack = inp.crack_limit && inp.crack_limit !== "Auto" ? num(inp.crack_limit)
      : ((mine || rail || EXPO_ORDER.indexOf(exp) >= 2) ? 0.2 : 0.3);
    var tmin = rail || mine || dump ? 0.30 : 0.25;
    var tslab = tmin;
    if (dump) tslab = Math.max(tmin, LD().dumper_min_slab(V.gvw, S_));
    return { mine: mine, rail: rail, dump: dump, practice: practice, exposure: exp,
      crack: crack, crack_clause: rail ? "IRS CBC cl 10.2.1 / 15.9.8.2 (BS 5400 form = IS 456 Annex F)" :
        "IRC 112 cl 12.3.4, Table 12.1" + (mine ? " – 0.2 mm for mine water / severe exposure" : ""),
      method: rail ? "annexF" : "irc112",
      cover_req: Math.max(DS.materials.EXPOSURE[exp].cover, rail || mine ? 50 : 40),
      fck_min: Math.max(DS.materials.EXPOSURE[exp].min_grade, rail || mine ? 30 : 25),
      min_dia: practice ? (rail || dump ? 16 : 12) : 10,
      dist_dia: practice ? (rail || mine ? 12 : 10) : 8,
      smax: rail || mine ? 150 : 200,
      min_face: practice && (rail || mine) ? 1000 * _bar_area(12) / 150 : 0,
      prac_clause: rail ? "RDSO / IRS CBC detailing practice" : dump ? "Mine haul-road culvert practice [GP]" : mine ? "Road culvert in mining area – severe exposure practice [GP]" : "IRC SP-13 / MoRTH practice",
      tmin: tmin, tslab: tslab,
      sbc_f: dump && !siteMine ? 0.8 : 1.0, fos_slide: 1.5, fos_float: 1.2, mu: num(inp.mu) || 0.5,
      ss_lim: rail ? 0.75 : 0.8, sc_lim: rail ? 0.50 : 0.48 };
  }

  function _cv_factors(V) {
    if (V.kind === "rail") return { code: "IRS Concrete Bridge Code Table 12 (γfL, verify current correction slips)",
      uls: { DC: 1.4, G2f: 1.7, G2s: 2.0, EP: 1.7, LS: 1.75, LL: 1.75, W: 1.0 },
      rare: { DC: 1.0, G2f: 1.0, G2s: 1.2, EP: 1.0, LS: 1.1, LL: 1.1, W: 1.0 },
      crack: { DC: 1.0, G2f: 1.0, G2s: 1.2, EP: 1.0, LS: 1.0, LL: 1.0, W: 1.0 } };
    var ps = V.psi_crack;
    return { code: "IRC 6:2017 Annex B, Tables B.2 (ULS) / B.3 (SLS)",
      uls: { DC: 1.35, G2f: 1.5, G2s: 1.75, EP: 1.5, LS: 1.2, LL: 1.5, W: 1.0 },
      rare: { DC: 1.0, G2f: 1.0, G2s: 1.2, EP: 1.0, LS: 1.0, LL: 1.0, W: 1.0 },
      crack: { DC: 1.0, G2f: 1.0, G2s: 1.0, EP: 1.0, LS: ps, LL: ps, W: 1.0 } };
  }

  /* closed frame on Winkler springs */
  function _box_model(g) {
    var FM = FR(), f = new FM.Frame(), E = _Ec(g.fck);
    var Sc = g.Sc, Hc = g.Hc, nt = 12, nb = 8, nw = 6, k;
    var top = [], bot = [];
    for (k = 0; k <= nb; k++) bot.push(f.node(Sc * k / nb, 0));
    for (k = 0; k <= nt; k++) top.push(f.node(Sc * k / nt, Hc));
    var wlN = [bot[0]], wrN = [bot[nb]];
    for (k = 1; k < nw; k++) { wlN.push(f.node(0, Hc * k / nw)); wrN.push(f.node(Sc, Hc * k / nw)); }
    wlN.push(top[0]); wrN.push(top[nt]);
    function mk(a, b, t) { return f.member(a, b, E, t, Math.pow(t, 3) / 12); }
    var ids = { top: [], bottom: [], wl: [], wr: [] };
    for (k = 0; k < nt; k++) ids.top.push(mk(top[k], top[k + 1], g.tt));
    for (k = 0; k < nb; k++) ids.bottom.push(mk(bot[k], bot[k + 1], g.tb));
    for (k = 0; k < nw; k++) { ids.wl.push(mk(wlN[k], wlN[k + 1], g.tw)); ids.wr.push(mk(wrN[k], wrN[k + 1], g.tw)); }
    function trib(k) { return Sc / nb * ((k === 0 || k === nb) ? 0.5 : 1.0) + ((k === 0 || k === nb) ? g.tw / 2 : 0); }
    bot.forEach(function (nd, k) { f.spring(nd, 0, g.ks * trib(k), 0); });
    f.support(bot[Math.floor(nb / 2)], true, false, false);
    var NP = 5, samples = [];
    [["top", Sc / nt], ["bottom", Sc / nb], ["wl", Hc / nw], ["wr", Hc / nw]].forEach(function (gp) {
      ids[gp[0]].forEach(function (m, i) { for (var j = 0; j < NP; j++) samples.push({ g: gp[0], pos: i * gp[1] + gp[1] * j / (NP - 1) }); });
    });
    function vec(res) {
      var Mv = [], Vv = [], Rv = [];
      ["top", "bottom", "wl", "wr"].forEach(function (gn) {
        ids[gn].forEach(function (m) { res.diagram(m, NP).forEach(function (d) { Mv.push(d[3]); Vv.push(d[2]); }); });
      });
      bot.forEach(function (nd) { Rv.push(res.reactions[nd][1]); });
      return { M: Mv, V: Vv, R: Rv };
    }
    return { f: f, ids: ids, top: top, bot: bot, nt: nt, nb: nb, nw: nw, trib: trib, samples: samples, vec: vec,
      solve: function (lc) { return vec(f.solve(lc)); } };
  }

  function _vadd(a, b, s) { for (var i = 0; i < a.length; i++) a[i] += s * b[i]; }
  function _vzero(n) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = 0; return a; }

  /* full analysis: loads, cases, moving-load envelopes, combinations → face actions, base pressure, stability data */
  function _box_analysis(c, inp, g, V, o) {
    var FM = FR(), rcc = RC(), LDs = LD();
    var Sc = g.Sc, Hc = g.Hc, tt = g.tt, tb = g.tb, tw = g.tw, fill = g.fill, gam = g.gam;
    var mdl = _box_model(g), f = mdl.f, ids = mdl.ids, nS = mdl.samples.length;
    var K0 = rcc.k0(g.phi), Ka = rcc.ka_rankine(g.phi);
    var fac = _cv_factors(V);
    var gwt = Math.min(Math.max(g.gwt, 0), g.Hh);
    var gsub = g.gsat - GAM_W;
    var q_s = V.kind === "rail" ? V.q_track : (fill <= 0 && V.kind === "road" ? 0.065 * 22 : 0.0);
    var Dtot = fill + g.Hh, zw = gwt > 0 ? Dtot - gwt : 1e9;
    var rows = [];
    c.section("Loads per metre of barrel");
    c.info("Live load", V.variants.map(function (v) { return v.name; }).join("; "), V.kind === "rail" ? "IRS Bridge Rules" :
      V.kind === "dumper" ? "Mine fleet data (CMR 2017 reg. 106: haul roads designed for the equipment used)" : "IRC 6:2017 cl 204");
    var K0c = c.calc("Earth pressure coefficient at rest", "K0", "1 - sin(radians(ph))", "", "IRC 6 cl 214 / IRC SP-13 (box culverts)", { ph: g.phi });
    c.calc("Active coefficient (relieving case, box full)", "Ka", "(1 - sin(radians(ph)))/(1 + sin(radians(ph)))", "", "Rankine", { ph: g.phi });
    var q_f = c.calc("Earth fill on top slab", "wf", "gam*hf", "kN/m²", "IRC 6 cl 203", { gam: gam, hf: fill });
    if (q_s > 0) c.calc(V.kind === "rail" ? "Ballast + track on top (19 kN/m³ × (db + 0.2) + 2.0)" : "Wearing coat 65 mm on deck",
      "ws", V.kind === "rail" ? "19*(db + 0.2) + 2.0" : "0.065*22", "kN/m²", V.kind === "rail" ? "IRS Bridge Rules cl 2.2 [ASSUMPTION ballast 19 kN/m³]" : "IRC 6 cl 203",
      V.kind === "rail" ? { db: V.ballast } : {});
    rows.push(["Self weight (RCC 25 kN/m³)", "top " + F(25 * tt, ".1f") + ", bottom " + F(25 * tb, ".1f") + ", walls " + F(25 * tw, ".1f"), "kN/m²", fac.uls.DC + " (1.0 relieving)", fac.rare.DC, fac.crack.DC, "IRC 6 cl 203"]);
    rows.push(["Earth fill on top", F(q_f, ".1f"), "kN/m²", fac.uls.G2f + " (1.0)", fac.rare.G2f, fac.crack.G2f, "IRC 6 B.2 / IRS CBC T12"]);
    if (q_s > 0) rows.push([V.kind === "rail" ? "Ballast + track" : "Wearing coat", F(q_s, ".1f"), "kN/m²", fac.uls.G2s + " (1.0)", fac.rare.G2s, fac.crack.G2s, "SIDL"]);

    // effective vertical stress & lateral pressures at frame ordinate y (0 = bottom slab centre line)
    function zs(y) { return fill + tt / 2 + (Hc - y); }
    function sv(y) { var z = zs(y); return q_s + gam * Math.min(z, zw) + gsub * Math.max(0, z - zw); }
    function uw(y) { return GAM_W * Math.max(0, zs(y) - zw); }
    var p_t = K0 * sv(Hc), p_b = K0 * sv(0);
    c.calc("Earth pressure at top-slab centre line", "pe,t", "K0*sv", "kN/m²", "IRC 6 cl 214", { K0: R(K0, 3), sv: R(sv(Hc), 2) });
    c.calc("Earth pressure at bottom-slab centre line", "pe,b", "K0*sv", "kN/m²", "IRC 6 cl 214", { K0: R(K0, 3), sv: R(sv(0), 2) });
    rows.push(["Earth pressure at rest K0·σv' (walls, both sides)", F(p_t, ".1f") + " → " + F(p_b, ".1f"), "kN/m²", fac.uls.EP + " (1.0 relieving)", fac.rare.EP, fac.crack.EP, "K0 = " + F(K0, ".3f")]);
    rows.push(["Earth pressure active Ka (box-full relieving case)", F(Ka * sv(Hc), ".1f") + " → " + F(Ka * sv(0), ".1f"), "kN/m²", "1.0", "1.0", "1.0", "Ka = " + F(Ka, ".3f")]);
    // live-load surcharge on walls
    var zls = function (y) { return V.kind === "rail" ? V.z + tt / 2 + (Hc - y) : fill + tt / 2 + (Hc - y); };
    var ls_t = K0 * V.ls(zls(Hc)), ls_b = K0 * V.ls(zls(0));
    c.calc("Live-load surcharge pressure on walls (top)", "pLS,t", "K0*qs", "kN/m²", V.ls_clause, { K0: R(K0, 3), qs: R(V.ls(zls(Hc)), 2) });
    c.calc("Live-load surcharge pressure on walls (bottom)", "pLS,b", "K0*qs", "kN/m²", V.ls_clause, { K0: R(K0, 3), qs: R(V.ls(zls(0)), 2) });
    rows.push(["Live-load surcharge K0·q (both sides / one side)", F(ls_t, ".1f") + " → " + F(ls_b, ".1f"), "kN/m²", fac.uls.LS, fac.rare.LS, fac.crack.LS, V.ls_clause]);
    if (gwt > 0) {
      c.calc("Uplift on base (ground water " + F(gwt, ".2f") + " m above underside)", "pu", "gw*hw", "kN/m²", "IRC 6 cl 213 (buoyancy)", { gw: GAM_W, hw: R(gwt, 3) });
      rows.push(["Ground water: lateral + uplift on base", F(GAM_W * gwt, ".1f"), "kN/m²", fac.uls.W, fac.rare.W, fac.crack.W, "box empty"]);
    }
    rows.push(["Water inside (box full to clear height)", F(GAM_W * g.H, ".1f"), "kN/m²", fac.uls.W, fac.rare.W, fac.crack.W, "box full"]);

    // ---- basic load cases (characteristic)
    var segT = Sc / mdl.nt, segW = Hc / mdl.nw;
    function wallTrap(lc, fnL, sgnL) {     // fnL(y) pressure pushing INTO the box (+) ; applied to both walls
      for (var k = 0; k < mdl.nw; k++) {
        var y0 = k * segW, y1 = (k + 1) * segW;
        if (sgnL.left) lc.add_member(ids.wl[k], ["trap", -fnL(y0), -fnL(y1)]);
        if (sgnL.right) lc.add_member(ids.wr[k], ["trap", fnL(y0), fnL(y1)]);
      }
    }
    var DC = new FM.LoadCase("DC");
    ids.top.forEach(function (m) { DC.add_member(m, ["gudl", 0, -25 * tt, "length"]); });
    ids.bottom.forEach(function (m) { DC.add_member(m, ["gudl", 0, -25 * tb, "length"]); });
    ids.wl.concat(ids.wr).forEach(function (m) { DC.add_member(m, ["gudl", 0, -25 * tw, "length"]); });
    var G2f = new FM.LoadCase("G2f"), G2s = new FM.LoadCase("G2s");
    ids.top.forEach(function (m) { G2f.add_member(m, ["gudl", 0, -q_f, "length"]); if (q_s) G2s.add_member(m, ["gudl", 0, -q_s, "length"]); });
    var EP = new FM.LoadCase("EP"); wallTrap(EP, function (y) { return K0 * sv(y); }, { left: true, right: true });
    var EPa = new FM.LoadCase("EPa"); wallTrap(EPa, function (y) { return Ka * sv(y); }, { left: true, right: true });
    var LS = new FM.LoadCase("LS"); wallTrap(LS, function (y) { return K0 * V.ls(zls(y)); }, { left: true, right: true });
    var LS1 = new FM.LoadCase("LS1"); wallTrap(LS1, function (y) { return K0 * V.ls(zls(y)); }, { left: true, right: false });
    var Wout = new FM.LoadCase("Wout");
    if (gwt > 0) { wallTrap(Wout, uw, { left: true, right: true }); ids.bottom.forEach(function (m) { Wout.add_member(m, ["gudl", 0, GAM_W * gwt, "length"]); }); }
    var Win = new FM.LoadCase("Win");
    wallTrap(Win, function (y) { return -GAM_W * Math.max(0, Hc - tt / 2 - y); }, { left: true, right: true });
    ids.bottom.forEach(function (m) { Win.add_member(m, ["gudl", 0, -GAM_W * g.H, "length"]); });
    var cs = { DC: mdl.solve(DC), G2f: mdl.solve(G2f), G2s: mdl.solve(G2s), EP: mdl.solve(EP), EPa: mdl.solve(EPa), LS: mdl.solve(LS),
      LS1: mdl.solve(LS1), Wout: mdl.solve(Wout), Win: mdl.solve(Win) };

    // ---- unit cases for moving loads
    var UV = ids.top.map(function (m) { var lc = new FM.LoadCase("u"); lc.add_member(m, ["gudl", 0, -1.0, "length"]); return mdl.solve(lc); });
    var lcH = new FM.LoadCase("uH"); ids.top.forEach(function (m) { lcH.add_member(m, ["gudl", 1.0, 0, "length"]); });
    var UH = mdl.solve(lcH);
    var LL = { Mx: _vzero(nS), Mn: _vzero(nS), Vx: _vzero(nS), Vn: _vzero(nS), Rx: _vzero(mdl.bot.length), RT: 0, Vtot: 0, Hmax: 0, peak: 0, gov: null };
    var wseg = _vzero(mdl.nt);
    function accum(w, hfac) {
      var Mv = _vzero(nS), Vv = _vzero(nS), Rv = _vzero(mdl.bot.length), k, tot = 0;
      for (k = 0; k < mdl.nt; k++) if (w[k]) { _vadd(Mv, UV[k].M, w[k]); _vadd(Vv, UV[k].V, w[k]); _vadd(Rv, UV[k].R, w[k]); tot += w[k] * segT; }
      LL.Vtot = Math.max(LL.Vtot, tot);
      var hs = hfac ? [1, -1] : [0];
      hs.forEach(function (sg) {
        var H = sg * hfac * tot;
        for (var i = 0; i < nS; i++) {
          var m = Mv[i] + (H ? UH.M[i] * H / Sc : 0), v = Vv[i] + (H ? UH.V[i] * H / Sc : 0);
          if (m > LL.Mx[i]) LL.Mx[i] = m; if (m < LL.Mn[i]) LL.Mn[i] = m;
          if (v > LL.Vx[i]) LL.Vx[i] = v; if (v < LL.Vn[i]) LL.Vn[i] = v;
        }
        var rt = 0;      // total base reaction of THIS load position (for the mean pressure; the nodal envelope Rx is for the peak)
        for (var r = 0; r < Rv.length; r++) { var rv = Rv[r] + (H ? UH.R[r] * H / Sc : 0); if (rv > LL.Rx[r]) LL.Rx[r] = rv; rt += rv; }
        if (rt > LL.RT) LL.RT = rt;
      });
      LL.Hmax = Math.max(LL.Hmax, hfac * tot);
    }
    c.section("Live load – dispersion, impact and moving-load envelope");
    c.let("Depth for dispersion (" + (V.kind === "rail" ? "below sleeper, incl. ballast" : "fill / cover") + ")", "z", R(V.z, 3), "m", V.k_clause);
    V.variants.forEach(function (vr) {
      var pts = _cv_patches(V, vr, V.z, V.slab_add);
      var gi = 0; pts.forEach(function (p, i) { if (p.p > pts[gi].p) gi = i; });
      var ga = pts[gi], ax = vr.axles[gi];
      c.calc("Impact / dynamic factor – " + vr.name, "IF", "imp", "", V.imp_clause, { imp: R(vr.imp, 3) });
      c.calc("Dispersed line load of heaviest axle group – " + vr.name, "q", "qv", "kN/m", "Σ wheels / (b + 2kz" + (V.slab_add ? " + 0.5·Sc slab width, IRC 112 B.3" : "") + "), overlaps added",
        "P = " + F(ga.P, ".1f") + " kN, k = " + G(V.k), { qv: R(ga.q, 2) });
      var pk = c.calc("Peak dispersed pressure on top slab – " + vr.name, "pLL", "q*(1 + IF)/(l + 2*k*z)", "kN/m²", V.k_clause,
        { q: R(ga.q, 2), IF: R(vr.imp, 3), l: R(ax.l, 3), k: V.k, z: R(V.z, 3) });
      if (pk > LL.peak) { LL.peak = pk; LL.gov = vr.name; }
      rows.push(["LL " + vr.name + " (peak, incl. impact " + F(vr.imp, ".3f") + ")", F(pk, ".1f"), "kN/m²", fac.uls.LL, fac.rare.LL, fac.crack.LL, V.imp_clause]);
      var Lt = pts[pts.length - 1].x, lam = Math.max.apply(null, pts.map(function (p) { return p.la; }));
      var step = Math.min(0.1, Sc / 40);
      for (var x0 = -Lt - lam / 2; x0 <= Sc + lam / 2 + 1e-9; x0 += step) {
        for (var k = 0; k < mdl.nt; k++) wseg[k] = 0;
        var any = false;
        pts.forEach(function (p) {
          var xa = x0 + p.x, lo = xa - p.la / 2, hi = xa + p.la / 2;
          if (hi <= 0 || lo >= Sc) return;
          any = true;
          var k0 = Math.max(0, Math.floor(lo / segT)), k1 = Math.min(mdl.nt - 1, Math.floor(hi / segT));
          for (var kk = k0; kk <= k1; kk++) { var ov = Math.min(hi, (kk + 1) * segT) - Math.max(lo, kk * segT); if (ov > 0) wseg[kk] += p.p * ov / segT; }
        });
        if (any) accum(wseg, V.brake);
      }
    });
    if (V.uniform) {
      var pu = c.calc("Uniform intensity check – " + V.uniform.name, "pu", "w*(1 + CDA)/B", "kN/m²", "IRS Bridge Rules (cushion ≥ 600 mm intensity)",
        { w: R(V.uniform.w, 2), CDA: R(V.uniform.imp, 3), B: R(V.uniform.B, 3) });
      for (var k2 = 0; k2 < mdl.nt; k2++) wseg[k2] = pu;
      accum(wseg, V.brake);
      rows.push(["LL " + V.uniform.name + " over full span", F(pu, ".1f"), "kN/m²", fac.uls.LL, fac.rare.LL, fac.crack.LL, "EUDL-type check"]);
    }
    if (V.brake > 0) {
      c.calc("Longitudinal (braking / tractive) force at top slab", "HL", "cb*Vll", "kN/m", V.brake_clause, { cb: V.brake, Vll: R(LL.Vtot, 2) });
      rows.push(["Braking / tractive force (± along span)", F(LL.Hmax, ".1f"), "kN/m", fac.uls.LL, fac.rare.LL, fac.crack.LL, V.brake_clause]);
    } else c.info("Longitudinal force", "not applied – dissipated in the fill (" + V.brake_clause + ")", "");
    c.let("Max. live load on top slab per m of barrel", "ΣLL", R(LL.Vtot, 1), "kN/m", "");

    // ---- combinations
    function sum(terms) {
      var o2 = { M: _vzero(nS), V: _vzero(nS), R: _vzero(mdl.bot.length) };
      Object.keys(terms).forEach(function (kk) { var f2 = terms[kk]; if (!f2) return; _vadd(o2.M, cs[kk].M, f2); _vadd(o2.V, cs[kk].V, f2); _vadd(o2.R, cs[kk].R, f2); });
      return o2;
    }
    function combos(F2, uls) {
      var G = function (kk) { return uls ? F2[kk] : F2[kk]; };
      return [
        { name: "Box empty, K0 + LL surcharge both sides + LL", t: { DC: G("DC"), G2f: G("G2f"), G2s: G("G2s"), EP: G("EP"), LS: G("LS"), Wout: G("W") }, ll: G("LL") },
        { name: "Box full, Ka (relieving) + LL", t: { DC: G("DC"), G2f: G("G2f"), G2s: G("G2s"), EPa: 1.0, Win: G("W") }, ll: G("LL") },
        { name: "Box empty, LL surcharge one side, no LL", t: { DC: G("DC"), G2f: G("G2f"), G2s: G("G2s"), EP: G("EP"), LS1: G("LS"), Wout: G("W") }, ll: 0 },
        { name: "Box empty, permanent loads relieving (1.0) + LL", t: { DC: 1.0, G2f: 1.0, G2s: 1.0, EP: G("EP"), LS: G("LS"), Wout: G("W") }, ll: G("LL") }
      ].slice(0, uls ? 4 : 3);
    }
    function states(list) {
      var out = [];
      list.forEach(function (cb) {
        var P = sum(cb.t);
        if (cb.ll) {
          var a = { M: P.M.slice(), V: P.V.slice() }, b = { M: P.M.slice(), V: P.V.slice() };
          _vadd(a.M, LL.Mx, cb.ll); _vadd(b.M, LL.Mn, cb.ll); _vadd(a.V, LL.Vx, cb.ll); _vadd(b.V, LL.Vn, cb.ll);
          out.push(a, b);
          var R2 = P.R.slice(); _vadd(R2, LL.Rx, cb.ll); out.push({ R: R2, Rt: C.sum(P.R) + cb.ll * LL.RT });
        } else out.push({ M: P.M, V: P.V, R: P.R, Rt: C.sum(P.R) });
      });
      return out;
    }
    var U = states(combos(fac.uls, true)), SR = states(combos(fac.rare, false)), SC = states(combos(fac.crack, false));
    c.info("Load combinations", "ULS (" + fac.code + "): γ DC " + fac.uls.DC + ", fill " + fac.uls.G2f + ", SIDL " + fac.uls.G2s + ", EP " + fac.uls.EP +
      ", LL surcharge " + fac.uls.LS + ", LL " + fac.uls.LL + ", water " + fac.uls.W + "; cases: box empty (K0), box full (Ka relieving), " +
      "one-sided surcharge, relieving dead load. SLS rare: LL " + fac.rare.LL + "; crack-width check under LL × " + fac.crack.LL +
      (V.kind === "road" ? " (frequent – stricter than IRC 112 quasi-permanent)" : ""), fac.code);

    // ---- envelopes at design sections
    var S = mdl.samples;
    function interp(gn, pos, arr) {
      var lo = null, hi = null;
      for (var i = 0; i < nS; i++) {
        if (S[i].g !== gn) continue;
        if (S[i].pos <= pos + 1e-12 && (lo === null || S[i].pos >= S[lo].pos)) lo = i;
        if (S[i].pos >= pos - 1e-12 && (hi === null || S[i].pos <= S[hi].pos)) hi = i;
      }
      if (lo === null) return arr[hi]; if (hi === null || S[hi].pos === S[lo].pos) return arr[lo];
      var t = (pos - S[lo].pos) / (S[hi].pos - S[lo].pos);
      return arr[lo] + t * (arr[hi] - arr[lo]);
    }
    function grpVals(gn, a0, a1, arr) {
      var v = [interp(gn, a0, arr), interp(gn, a1, arr)];
      for (var i = 0; i < nS; i++) if (S[i].g === gn && S[i].pos > a0 && S[i].pos < a1) v.push(arr[i]);
      return v;
    }
    var dEst = function (t) { return t * 1000 - o.cover - 10; };
    var rng = { top: [tw / 2, Sc - tw / 2, tt], bottom: [tw / 2, Sc - tw / 2, tb], wl: [tb / 2, Hc - tt / 2, tw], wr: [tb / 2, Hc - tt / 2, tw] };
    var POS_FACE = { top: ["inner", "outer"], bottom: ["outer", "inner"], wl: ["inner", "outer"], wr: ["outer", "inner"] };
    function env(st) {
      var o2 = { top: { inner: 0, outer: 0, Vd: 0 }, bottom: { inner: 0, outer: 0, Vd: 0 }, wall: { inner: 0, outer: 0, Vd: 0 } };
      st.forEach(function (s) {
        if (!s.M) return;
        ["top", "bottom", "wl", "wr"].forEach(function (gn) {
          var mem = gn === "wl" || gn === "wr" ? "wall" : gn, r = rng[gn], fc = POS_FACE[gn];
          var mv = grpVals(gn, r[0], r[1], s.M);
          o2[mem][fc[0]] = Math.max(o2[mem][fc[0]], Math.max.apply(null, mv));
          o2[mem][fc[1]] = Math.max(o2[mem][fc[1]], -Math.min.apply(null, mv));
          var dd = dEst(r[2]) / 1000;
          var vv = grpVals(gn, r[0] + dd, Math.max(r[1] - dd, r[0] + dd), s.V).map(Math.abs);
          o2[mem].Vd = Math.max(o2[mem].Vd, Math.max.apply(null, vv));
        });
      });
      return o2;
    }
    var out = { uls: env(U), crack: env(SC), rare: env(SR), model: mdl, cases: cs, LL: LL, K0: K0, Ka: Ka, rows: rows, fac: fac,
      q_f: q_f, q_s: q_s, gwt: gwt, ls_t: ls_t, ls_b: ls_b };
    // base pressure from SLS rare
    // peak = nodal envelope (any load position); mean = max over combinations of the TOTAL reaction of one load position / base width
    var pmax = 0, pavg = 0, tribT = 0, Rgov = 0;
    for (var kq = 0; kq < mdl.bot.length; kq++) tribT += mdl.trib(kq);
    SR.forEach(function (s) { if (!s.R) return; s.R.forEach(function (r, k) { pmax = Math.max(pmax, r / mdl.trib(k)); }); Rgov = Math.max(Rgov, s.Rt); });
    pavg = c.calc("Mean base pressure (SLS rare) – max total reaction of one load position / base width", "pm", "Rtot/B", "kN/m²",
      "IRC 78 cl 706 (rigid-base mean); peak from the nodal envelope", { Rtot: R(Rgov, 2), B: R(tribT, 3) });
    out.pmax = pmax; out.pavg = pavg;
    c.let("Design moments ULS (top / bottom / wall)", "", ["top", "bottom", "wall"].map(function (m) {
      return m + ": in " + F(out.uls[m].inner, ".1f") + ", out " + F(out.uls[m].outer, ".1f") + ", VEd " + F(out.uls[m].Vd, ".1f");
    }).join(" | "), "kN·m/m, kN/m", "at face of supports; shear at d from face");
    return out;
  }
  M._box_analysis = _box_analysis;

  function _as_req(Mu, d, fck, fy) {
    var kk = DS.materials.mu_lim_coeff(fy);
    if (Mu > kk * fck * 1000 * d * d / 1e6) return Infinity;
    return 0.5 * fck / fy * (1 - Math.sqrt(Math.max(0, 1 - 4.6 * Mu * 1e6 / (fck * 1000 * d * d)))) * 1000 * d;
  }
  function _amin(D, d, fck, fy, o) {
    var fctm = 0.259 * Math.pow(fck, 2 / 3);
    return Math.max(0.0012 * 1000 * D, Math.max(0.26 * fctm / fy, 0.0013) * 1000 * d, o.min_face);
  }
  /* quiet SLS evaluation: rare stresses + crack width (IRC 112 cl 12.3.4 or IS 456 Annex F) */
  function _sls_eval(Mcr, Mra, D, d, As, cv, dia, s, fck, method) {
    var Es = 200000, b = 1000;
    var Ecm = C.interp(fck, [20, 25, 30, 35, 40, 45, 50], [29000, 30000, 31000, 32000, 33000, 34000, 35000]);
    var ae = Es / Ecm;
    var x = (-ae * As + Math.sqrt(Math.pow(ae * As, 2) + 2 * b * ae * As * d)) / b, z = d - x / 3;
    var o = { ae: ae, x: x, ss_r: Math.abs(Mra) * 1e6 / (As * z), sc_r: 2 * Math.abs(Mra) * 1e6 / (b * x * z) };
    if (method === "annexF") {
      var m = Es / (5000 * Math.sqrt(fck) / 2);
      var x2 = (-m * As + Math.sqrt(Math.pow(m * As, 2) + 2 * b * m * As * d)) / b;
      var fs = Math.abs(Mcr) * 1e6 / (As * (d - x2 / 3));
      var e1 = fs / Es * (D - x2) / Math.max(d - x2, 1);
      var em = e1 - b * (D - x2) * (D - x2) / (3 * Es * As * (d - x2));
      var acr = Math.sqrt(Math.pow(s / 2, 2) + Math.pow(cv + dia / 2, 2)) - dia / 2;
      o.w = 3 * acr * Math.max(em, 0) / (1 + 2 * (acr - cv) / (D - x2));
    } else {
      var ss = Math.abs(Mcr) * 1e6 / (As * z);
      var hc = Math.min(2.5 * (D - d), (D - x) / 3, D / 2), rho = As / (b * hc), fct = 0.259 * Math.pow(fck, 2 / 3);
      var de = Math.max((ss - 0.5 * fct / rho * (1 + ae * rho)) / Es, 0.6 * ss / Es);
      var sr = s <= 5 * (cv + dia / 2) ? 3.4 * cv + 0.425 * 0.8 * 0.5 * dia / rho : 1.3 * (D - x);
      o.ss = ss; o.hc = hc; o.rho = rho; o.de = de; o.sr = sr; o.w = sr * de; o.fct = fct;
    }
    return o;
  }
  M._sls_eval = _sls_eval;

  function _pick_bars(act, D, o, g, dias) {
    var best = null, rank = function (b) { return (b.spacing < 100 ? 1e6 : 0) + b.As; };
    dias.forEach(function (dia) {
      CV_SPACINGS.forEach(function (s) {
        if (s > o.smax) return;
        var As = 1000 * _bar_area(dia) / s, d = D - o.cover - dia / 2;
        var req = Math.max(_as_req(act.Mu, d, g.fck, g.fy), _amin(D, d, g.fck, g.fy, o), act.Av || 0);
        if (As < req - 1e-9) return;
        var sl = _sls_eval(act.Mcr, act.Mra, D, d, As, o.cover, dia, s, g.fck, o.method);
        if (sl.w > o.crack + 1e-9 || sl.ss_r > o.ss_lim * g.fy || sl.sc_r > o.sc_lim * g.fck) return;
        var cand = { dia: dia, spacing: s, As: As };
        if (!best || rank(cand) < rank(best) - 1e-6 || (Math.abs(rank(cand) - rank(best)) < 1e-6 && s > best.spacing)) best = cand;
      });
    });
    return best;
  }

  /* design / check of one face, recorded in cc */
  function _face(cc, mem, face, t, act, o, g, given) {
    var rcc = RC(), tag = mem + " " + face, D = t * 1000, cv = o.cover;
    var dias = [12, 16, 20, 25, 32].filter(function (x) { return x >= o.min_dia; });
    var bars;
    if (given) bars = { dia: given[0], spacing: given[1] };
    else { var pk = _pick_bars(act, D, o, g, dias); bars = pk ? { dia: pk.dia, spacing: pk.spacing } : { dia: 32, spacing: 75 }; }
    bars.Ast_prov = 1000 * _bar_area(bars.dia) / bars.spacing;
    var d = D - cv - bars.dia / 2;
    cc.let("Design actions (" + tag + ")", "", "MEd = " + F(act.Mu, ".1f") + ", Ms,crack = " + F(act.Mcr, ".1f") + ", Ms,rare = " + F(act.Mra, ".1f"), "kN·m/m",
      "ULS / SLS envelopes");
    var fl = rcc.flexure(cc, act.Mu, 1000, d, g.fck, g.fy, "slab", D, { tag: "(" + tag + ")" });
    var fctm = 0.259 * Math.pow(g.fck, 2 / 3);
    var A112 = cc.calc("Minimum steel IRC 112 (" + tag + ")", "As,min", "max(0.26*fctm/fy, 0.0013)*b*d", "mm²/m", "IRC 112 cl 16.5.1.1",
      { fctm: R(fctm, 3), fy: g.fy, b: 1000, d: R(d, 1) });
    if (o.min_face) cc.let("Practice minimum per face (" + tag + ")", "As,pr", R(o.min_face, 0), "mm²/m", o.prac_clause, "12Ø @ 150 both faces, both ways");
    if (act.Av) cc.calc("Tension steel at support for shear VRd,c (" + tag + ")", "As,v", "Asv", "mm²/m", "IRC 112 cl 10.3.2 (ρl to resist VEd without links)", { Asv: R(act.Av, 1) });
    var req = Math.max(fl.Ast, A112, o.min_face, act.Av || 0);
    cc.let("Bars (" + tag + ")", "", G(bars.dia) + "Ø @ " + G(bars.spacing) + " c/c", "", "", "As,prov = " + F(bars.Ast_prov, ".0f") + " mm²/m");
    var sugg = given ? _pick_bars(act, D, o, g, dias) : null;
    var note = sugg ? "suggest " + G(sugg.dia) + "Ø @ " + G(sugg.spacing) + " (As " + F(sugg.As, ".0f") + " mm²/m) at this thickness"
      : (given ? "no bar arrangement works at this thickness – increase the " + mem + " thickness" : "");
    cc.check("Steel provided ≥ required (" + tag + ")", bars.Ast_prov, req, { unit: "mm²/m", clause: "IS 456 Annex G / IRC 112 cl 16.5.1.1", mode: ">=", note: bars.Ast_prov < req ? note : "" });
    cc.ok("Main bar dia ≥ " + G(o.min_dia) + " mm (" + tag + ")", bars.dia >= o.min_dia, { detail: G(bars.dia) + " mm", clause: o.prac_clause, warn_only: !o.practice });
    cc.ok("Bar spacing ≤ " + G(o.smax) + " mm (" + tag + ")", bars.spacing <= o.smax, { detail: G(bars.spacing) + " mm", clause: o.prac_clause + " / IRC 112 cl 16.6", warn_only: !o.practice });
    // SLS
    var sl = _sls_eval(act.Mcr, act.Mra, D, d, bars.Ast_prov, cv, bars.dia, bars.spacing, g.fck, o.method);
    if (o.method === "annexF") {
      rcc.crack_width(cc, act.Mcr, 1000, D, d, bars.Ast_prov, cv, bars.dia, bars.spacing, g.fck, o.crack, { tag: "(" + tag + ")" });
    } else {
      cc.calc("Neutral axis (cracked, αe = Es/Ecm)", "x", "(-ae*As + sqrt((ae*As)**2 + 2*b*ae*As*d))/b", "mm", "IRC 112 cl 12.2",
        { ae: R(sl.ae, 3), As: R(bars.Ast_prov, 1), b: 1000, d: R(d, 1) });
      var ss = cc.calc("Steel stress, crack combination (" + tag + ")", "σs", "Ms*1e6/(As*(d - x/3))", "N/mm²", "IRC 112 cl 12.3.4",
        { Ms: R(act.Mcr, 2), As: R(bars.Ast_prov, 1), d: R(d, 1), x: R(sl.x, 1) });
      var hc = cc.calc("Effective tension depth", "hc,eff", "min(2.5*(h - d), (h - x)/3, h/2)", "mm", "IRC 112 cl 12.3.4", { h: D, d: R(d, 1), x: R(sl.x, 1) });
      var rho = cc.calc("ρp,eff", "ρ", "As/(b*hc)", "", "IRC 112 cl 12.3.4", { As: R(bars.Ast_prov, 1), b: 1000, hc: R(hc, 1) });
      var de = cc.calc("Mean strain difference εsm − εcm", "Δε", "max((ss - 0.5*fct/rho*(1 + ae*rho))/Es, 0.6*ss/Es)", "", "IRC 112 eq 12.6",
        { ss: R(ss, 2), fct: R(sl.fct, 3), rho: R(rho, 6), ae: R(sl.ae, 3), Es: 200000 });
      var sr = bars.spacing <= 5 * (cv + bars.dia / 2)
        ? cc.calc("Max crack spacing", "sr,max", "3.4*c + 0.425*0.8*0.5*dia/rho", "mm", "IRC 112 eq 12.8", { c: cv, dia: bars.dia, rho: R(rho, 6) })
        : cc.calc("Max crack spacing (wide spacing)", "sr,max", "1.3*(h - x)", "mm", "IRC 112 eq 12.9", { h: D, x: R(sl.x, 1) });
      var wk = cc.calc("Crack width (" + tag + ")", "wk", "sr*de", "mm", "IRC 112 eq 12.5", { sr: R(sr, 1), de: R(de, 7) });
      cc.check("Crack width ≤ " + G(o.crack) + " mm (" + tag + ")", wk, o.crack, { unit: "mm", clause: o.crack_clause,
        note: wk > o.crack ? "closer spacing / more bars, or thicker member" : "" });
    }
    cc.check("Steel stress (rare) ≤ " + G(o.ss_lim) + " fy (" + tag + ")", sl.ss_r, o.ss_lim * g.fy, { unit: "N/mm²", clause: o.rail ? "IRS CBC cl 10.3 [verify]" : "IRC 112 cl 12.2.2" });
    cc.check("Concrete stress (rare) ≤ " + G(o.sc_lim) + " fck (" + tag + ")", sl.sc_r, o.sc_lim * g.fck, { unit: "N/mm²", clause: o.rail ? "IRS CBC cl 10.3 [verify]" : "IRC 112 cl 12.2.1" });
    return Object.assign(bars, { d: d, req: req, sugg: sugg, w: sl.w });
  }

  function _box_members(cc, out, g, o, mode, inp) {
    var rcc = RC(), bars = {};
    [["top", g.tt], ["bottom", g.tb], ["wall", g.tw]].forEach(function (p) {
      var mem = p[0], t = p[1];
      cc.section(mem !== "wall" ? "Design – " + mem + " slab" : "Design – side walls");
      ["inner", "outer"].forEach(function (face) {
        var act = { Mu: out.uls[mem][face], Mcr: out.crack[mem][face], Mra: out.rare[mem][face] };
        if (face === "outer") {            // corner (support) tension face – size ρl so that VEd ≤ VRd,c where possible
          var dv = t * 1000 - o.cover - 10, Av = rcc.as_for_shear_irc112(out.uls[mem].Vd, 1000, dv, g.fck);
          if (Av > 0 && Av <= 0.01 * 1000 * dv) act.Av = Av;      // ρl ≤ 1 % for shear; beyond → thicker member [GP]
        }
        var given = mode === "check" ? [num(inp[mem + "_" + face + "_dia"]), num(inp[mem + "_" + face + "_s"])] : null;
        bars[mem + "|" + face] = _face(cc, mem, face, t, act, o, g, given);
      });
      var bi = bars[mem + "|inner"], bo = bars[mem + "|outer"];
      var d = Math.min(bi.d, bo.d);
      cc.let("Shear at d from face of support (" + mem + ")", "VEd", R(out.uls[mem].Vd, 2), "kN/m", "IRC 112 cl 10.3.2.1");
      cc.info("Shear tension steel (" + mem + ")", "corner hogging puts the outer face in tension at the critical shear section – ρl from outer bars", "IRC 112 cl 10.3.2");
      rcc.shear_irc112(cc, out.uls[mem].Vd, 1000, bo.d, bo.Ast_prov, g.fck, { tag: "(" + mem + ")" });
      // distribution
      var D = t * 1000, Ad = Math.max((mem === "wall" ? 0.25 : 0.20) * Math.max(bi.Ast_prov, bo.Ast_prov), 0.0006 * 1000 * D);
      var best = null;
      [10, 12, 16].filter(function (x) { return x >= o.dist_dia; }).forEach(function (dia) {
        CV_SPACINGS.forEach(function (s) { if (s > Math.min(o.smax, 200)) return; var As = 1000 * _bar_area(dia) / s; if (As >= Ad && (!best || As < best.As - 1e-6)) best = { dia: dia, spacing: s, As: As }; });
      });
      if (!best) best = { dia: 16, spacing: 100, As: 2011 };
      cc.calc("Distribution steel per face (" + mem + ")", "As,dist", "max(r*Asmain, 0.0006*1000*D)", "mm²/m",
        mem === "wall" ? "IRC 112 cl 16.6.2 (≥ 25 % of vertical) [verify]" : "IRC 112 cl 16.6.1.1 (≥ 20 % of main)",
        { r: mem === "wall" ? 0.25 : 0.20, Asmain: R(Math.max(bi.Ast_prov, bo.Ast_prov), 1), D: D });
      cc.let("Distribution bars (" + mem + ", each face)", "", G(best.dia) + "Ø @ " + G(best.spacing) + " c/c", "", o.prac_clause);
      bars[mem + "|dist"] = { dia: best.dia, spacing: best.spacing, Ast_prov: best.As };
    });
    return bars;
  }

  /* stability: bearing, sliding, flotation, minimum cushion / thickness */
  function _box_stability(cc, out, g, o, V) {
    var LDs = LD();
    cc.section("Foundation & stability");
    var sbc = cc.calc("Allowable bearing pressure", "qa", "sbcf*sbc", "kN/m²", o.sbc_f < 1 ? "SBC × 0.8 on mine / reclaimed ground [GP]" : (o.mine ? "soil report (mining-area SBC already × 0.8)" : "soil report"),
      { sbcf: o.sbc_f, sbc: g.sbc });
    var nt_ = "needs allowable ≥ " + F(Math.max(out.pavg, out.pmax / 1.25), ".0f") + " kN/m² (SBC ≥ " + F(Math.max(out.pavg, out.pmax / 1.25) / o.sbc_f, ".0f") +
      ") – improve ground (granular replacement / PCC raft), widen the base, or establish a higher SBC by plate-load tests";
    cc.check("Mean base pressure (SLS rare, rigid base) ≤ allowable (bottom)", out.pavg, sbc, { unit: "kN/m²", clause: "IRC 78 cl 706 / IRC SP-13 practice",
      note: out.pavg > sbc ? nt_ : "" });
    cc.check("Peak base pressure (elastic, under walls) ≤ 1.25 × allowable (bottom)", out.pmax, 1.25 * sbc, { unit: "kN/m²", clause: "[GP] local edge peak of Winkler analysis",
      note: out.pmax > 1.25 * sbc ? nt_ : "" });
    var Wout = g.S + 2 * g.tw;
    var Wself = 25 * (g.tt * Wout + g.tb * Wout + 2 * g.tw * g.H);
    var Wfill = (out.q_f + out.q_s) * Wout;
    var Up = GAM_W * out.gwt * Wout;
    var H1 = 0.5 * (out.ls_t + out.ls_b) * g.Hh, H2 = out.LL.Hmax;
    if (H1 + H2 > 0) {
      var Kp = (1 + Math.sin(g.phi * Math.PI / 180)) / (1 - Math.sin(g.phi * Math.PI / 180));
      var sv_m = g.gam * (g.fill + g.Hh / 2) + out.q_s;
      var Pp = cc.calc("Passive resistance of far-side backfill (Kp/2 − K0 mobilised)", "Pp", "max(Kp/2 - K0, 0)*svm*Hh", "kN/m",
        "[GP] buried box – FoS 2 on Rankine passive", { Kp: R(Kp, 3), K0: R(out.K0, 3), svm: R(sv_m, 2), Hh: R(g.Hh, 3) });
      if (g.key > 0) Pp += cc.calc("Shear key below base (full barrel length, depth hk)", "Pk", "Kp/2*(gam*(hf + Hh) + gam*hk/2)*hk", "kN/m",
        "[GP] passive on key face, FoS 2", { Kp: R(Kp, 3), gam: g.gam, hf: g.fill, Hh: R(g.Hh, 3), hk: g.key });
      var fs1 = H1 > 0 ? cc.calc("Sliding FoS – live-load surcharge on one side, no LL on top", "FoS1", "(mu*(Ws + Wf - U) + Pp)/H", "", "IRC 78 cl 706.3.4 [verify]",
        { mu: o.mu, Ws: R(Wself, 2), Wf: R(Wfill, 2), U: R(Up, 2), Pp: R(Pp, 2), H: R(H1, 2) }) : 99;
      var fs2 = H2 > 0 ? cc.calc("Sliding FoS – braking of the vehicle on the box", "FoS2", "(mu*(Ws + Wf + Wl - U) + Pp)/H", "", "IRC 78 cl 706.3.4 [verify]; Wl = weight of the braking vehicle",
        { mu: o.mu, Ws: R(Wself, 2), Wf: R(Wfill, 2), Wl: R(out.LL.Vtot, 2), U: R(Up, 2), Pp: R(Pp, 2), H: R(H2, 2) }) : 99;
      var fs = Math.min(fs1, fs2);
      cc.check("Sliding FoS ≥ " + G(o.fos_slide) + " (bottom)", fs, o.fos_slide, { mode: ">=", clause: "IRC 78 cl 706.3.4", note: fs < o.fos_slide ? "provide cut-off / shear key or curtain walls; check passive resistance" : "" });
    }
    if (out.gwt > 0) {
      var ff = cc.calc("Flotation FoS (box empty, no live load, no side friction)", "FoSu", "(Ws + Wf)/U", "", "IS 3370 / IRC 6 cl 213 practice",
        { Ws: R(Wself, 2), Wf: R(Wfill, 2), U: R(Up, 2) });
      cc.check("Flotation FoS ≥ " + G(o.fos_float) + " (bottom)", ff, o.fos_float, { mode: ">=", clause: "IS 3370 / [GP] 1.2 ignoring friction",
        note: ff < o.fos_float ? "thicken bottom slab / add toe projections with soil weight / pressure-relief" : "" });
    } else if (o.mine) cc.warn("Ground water / mine flooding", "GWT = 0 assumed – check flotation for monsoon & pit-flooding level", "[GP]");
    // practice minima
    var lab = o.dump ? "haul-road practice for " + G(V.gvw) + " t dumper" : o.rail ? "railway practice" : "IRC SP-13 practice";
    [["Top slab", g.tt, o.tslab, "top"], ["Bottom slab", g.tb, o.tslab, "bottom"], ["Wall", g.tw, o.tmin, "wall"]].forEach(function (r) {
      if (o.practice) cc.check(r[0] + " thickness ≥ minimum (" + r[3] + ")", r[1] * 1000, r[2] * 1000, { unit: "mm", mode: ">=", clause: lab });
      else cc.ok(r[0] + " thickness ≥ minimum (" + r[3] + ")", r[1] >= r[2] - 1e-9, { detail: F(r[1] * 1000, ".0f") + " mm", clause: lab, warn_only: true });
    });
    if (o.dump) {
      var mc = LDs.dumper_min_cushion(V.gvw);
      cc.ok("Cushion ≥ " + G(mc) + " m for " + G(V.gvw) + " t dumper", g.fill >= mc - 1e-9, { detail: "fill = " + G(g.fill) + " m – structure is designed for the actual cushion; " +
        "below the minimum, rutting / pot-holes expose the slab to tyre impact", clause: "Haul-road culvert practice [GP]", warn_only: true });
    }
    if (o.rail) cc.ok("Ballast cushion below sleeper ≥ 300 mm", V.ballast >= 0.3 - 1e-9, { detail: G(V.ballast * 1000) + " mm (350 mm on 25 t / DFC routes)", clause: "IRPWM [verify]", warn_only: true });
  }

  function run_box(inp, mode) {
    inp = _cv_norm(inp);
    var rcc = RC(), CMN = CMN_(), D = DR(), LDs = LD();
    var c = new C.Calc("RCC box culvert");
    var S_ = num(inp.span), H_ = num(inp.height), fill = num(inp.fill);
    var fck = num(inp.fck), fy = num(inp.fy), gam = num(inp.gamma), phi = num(inp.phi);
    var road_w = num(inp.road_width), cover = num(inp.cover);
    var V0 = _cv_vehicle(inp, S_ + 0.3, fill, gam);
    var o = _cv_opts(inp, V0, S_);
    c.section("Geometry & basis");
    c.let("Clear span", "S", S_, "m");
    c.let("Clear height", "H", H_, "m");
    c.let("Fill over top slab" + (V0.kind === "rail" ? " (formation to top slab; ballast " + G(V0.ballast) + " m extra)" : ""), "hf", fill, "m");
    c.let("Barrel length", "Lb", road_w, "m");
    c.info("Site / detailing context", "site = " + _ctx().site + ", detail = " + (_ctx().detail || "practice") + "; exposure used: " + o.exposure +
      "; crack limit " + G(o.crack) + " mm; cover ≥ " + G(o.cover_req) + " mm", "");
    if (mode !== "check") {
      if (cover < o.cover_req) { c.info("Cover raised", G(cover) + " → " + G(o.cover_req) + " mm", "IRC 112 Table 14.2 / IS 456 Table 16"); cover = o.cover_req; }
      if (fck < o.fck_min) { c.info("Concrete grade raised", "M" + G(fck) + " → M" + G(o.fck_min), "IS 456 Table 5 / IRC 112 Table 14.1"); fck = o.fck_min; }
    }
    o.cover = cover;
    var tt, tb, tw, key = mode === "check" ? (num(inp.shear_key) || 0) : 0;
    if (mode === "check") { tt = num(inp.t_top); tb = num(inp.t_bot); tw = num(inp.t_wall); }
    else {
      tt = Math.max(o.tslab, ceil_to(S_ / 12 + 0.05, 0.025));
      tb = Math.max(o.tslab, tt + 0.025);
      tw = Math.max(o.tmin, ceil_to(H_ / 12 + 0.05, 0.025));
    }
    function geo() {
      return { S: S_, H: H_, fill: fill, tt: tt, tb: tb, tw: tw, Sc: S_ + tw, Hc: H_ + (tt + tb) / 2, Hh: H_ + tt + tb, fck: fck, fy: fy,
        gam: gam, phi: phi, ks: num(inp.ks), gwt: num(inp.gwt) || 0, gsat: num(inp.gamma_sat) || gam + 2, sbc: num(inp.sbc), key: key };
    }
    var it, gov = "";
    if (mode !== "check") {
      for (it = 0; it < 80; it++) {
        var g0 = geo(), V1 = _cv_vehicle(inp, g0.Sc, fill, gam), sc = new C.Calc("s");
        var o1 = Object.assign({}, o);
        var out0 = _box_analysis(sc, inp, g0, V1, o1);
        _box_members(sc, out0, g0, o1, mode, inp);
        _box_stability(sc, out0, g0, o1, V1);
        var fl = sc.failures;
        if (!fl.length) break;
        var bump = { top: 0, bottom: 0, wall: 0 }, fixable = false;
        if (fl.some(function (s) { return /^Sliding/.test(s.label); }) && key < 1.2) { key = R(key ? key + 0.15 : 0.3, 3); fixable = true; }
        fl.forEach(function (s) {
          var m = /\((top|bottom|wall)/.exec(s.label);
          if (!m || /base pressure|Sliding/.test(s.label)) return;
          var u = s.utilisation != null && isFinite(s.utilisation) ? s.utilisation : 1.1;
          bump[m[1]] = Math.max(bump[m[1]], u > 1.3 ? 0.05 : 0.025); fixable = true;
        });
        if (!fixable || Math.max(tt, tb, tw) > 2.0) break;
        tt = R(tt + bump.top, 3); tb = R(Math.max(tb + bump.bottom, tt), 3); tw = R(tw + bump.wall, 3);
      }
    }
    var g = geo(), V = _cv_vehicle(inp, g.Sc, fill, gam);
    c.let("Top slab thickness", "tt", R(tt * 1000), "mm");
    c.let("Bottom slab thickness", "tb", R(tb * 1000), "mm");
    c.let("Wall thickness", "tw", R(tw * 1000), "mm");
    if (key > 0) c.let("Shear key below bottom slab (full barrel length)", "hk", R(key * 1000), "mm", "sliding resistance", "width = wall thickness, at one end of the base");
    rcc.cover_check(c, o.exposure, cover, fck, "wall");
    c.check("Clear cover ≥ " + G(o.cover_req) + " mm (" + (o.rail ? "IRS CBC cl 15.9.2" : o.mine ? "mine – severe / very severe" : "IRC 112 Table 14.2") + ")",
      cover, o.cover_req, { unit: "mm", mode: ">=", clause: o.rail ? "IRS CBC cl 15.9.2 [verify]" : "IRC 112 cl 14.3 / IS 456 Table 16" });
    c.check("Concrete grade ≥ M" + G(o.fck_min), fck, o.fck_min, { unit: "N/mm²", mode: ">=", clause: "IS 456 Table 5 / IRC 112 Table 14.1" + (o.rail ? " – M30 min for railway culverts (IRS CBC) [GP]" : o.mine ? " – M30 min for mine environment (severe exposure) [GP]" : "") });
    var out = _box_analysis(c, inp, g, V, o);
    var bars = _box_members(c, out, g, o, mode, inp);
    _box_stability(c, out, g, o, V);
    // governing check
    var gstep = null;
    c.steps.forEach(function (s) {
      if (s.utilisation == null || !isFinite(s.utilisation) || /cover|grade|thickness ≥|Main bar dia|Bar spacing|minimum/i.test(s.label)) return;
      if (!gstep || s.utilisation > gstep.utilisation) gstep = s;
    });
    if (gstep) { gov = gstep.label + " – utilisation " + F(gstep.utilisation, ".2f"); c.info("Governing check", gov, gstep.clause); }

    c.thumb("Top slab thickness", S_ * 1000 / 12 + 50, tt * 1000, "mm", "span/12 + 50 mm", "IRC SP-13 practice");
    c.thumb("Wall thickness", H_ * 1000 / 12 + 50, tw * 1000, "mm", "height/12 + 50 mm", "IRC SP-13 practice");
    c.miss("Hydraulic design – vent area for design discharge, HFL, afflux, scour depth; bed protection, aprons & cut-off walls", "IRC SP-13 cl 5–6 / IRC 78", "Critical");
    c.miss("Wing walls / return walls – design separately (sized nominally in quantities)", "IRC SP-13 / IRC 78", "Important");
    if (V.kind !== "rail") c.miss("Approach slabs (fill < 1 m) and road-crust transition over the box", "IRC SP-13 / MoRTH 2700", "Advisory");
    c.miss("Bearing capacity / soil investigation report at founding level (SBC " + G(g.sbc) + " kN/m² assumed)", "IRC 78 / IS 1892", "Important");
    c.miss("Seismic earth pressure (zone III and above)", "IRC 6 cl 219 / IRC SP-114", "Advisory");
    if (V.kind === "rail") {
      c.miss("Railway culvert: design & drawings to be approved by the zonal railway / RDSO; RDSO standard drawing to be preferred", "IRS Bridge Rules / IRS BS&F Code", "Critical");
      c.miss("Fatigue of reinforcement under train loading (stress range) and longitudinal force distribution per Bridge Rules Appendix", "IRS CBC cl 13 / Bridge Rules cl 2.8", "Important");
      c.miss("Axle spacings of the loading train are idealised – confirm with Bridge Rules EUDL tables", "IRS Bridge Rules App. XXII–XXV", "Important");
    }
    if (V.kind === "dumper") {
      c.miss("Dumper data (GVW, axle split, track, tyre) from the mine fleet plan; preset geometry is approximate" + (V.dumper.approx ? " for " + V.dumper.name : ""), "OEM data sheets", "Important");
      c.miss("Also check empty truck + dozer / shovel crossing (tracked, long footprint) and grader blade loads", "[GP]", "Advisory");
    }
    if (o.mine) {
      c.miss("Blast vibration: PPV at the culvert within DGMS Circular 7/1997 limits; vibration monitoring", "DGMS (Tech)(S&T) Circular 7 of 1997", "Important");
      c.miss("Subsidence / underground workings below the culvert (CMPDI plans, angle of draw), OB-dump settlement", "CMR 2017 / DGMS", "Important");
      c.miss("Mine-water chemistry (pH, sulphate) → cement type & cover; haul-road safety bund ≥ ½ wheel height over the culvert", "IS 456 Table 4 / DGMS", "Advisory");
    }

    // ---------------- quantities & BBS
    var W = S_ + 2 * tw, Hh = H_ + tt + tb, Lb = road_w, cv = cover / 1000;
    var hs = R(Math.min(0.3, Math.max(0.15, tw / 2)), 3);
    var wing_h = Hh + fill, wing_l = Math.max(1.5 * (Hh + fill), 2.0), wing_t = 0.30, wing_end = 0.6;
    var wing_avg = (wing_h + wing_end) / 2;      // wing wall drawn as a trapezoid: wing_h at the box → 0.6 m at the end
    // BBS (DS.bbs): slab inner bars straight wall-to-wall; slab outer bars U with legs lapped (max(Ld, 30φ)) into the walls;
    // wall bars full height; distribution along the barrel in stock pieces with laps; haunch bars diagonal + Ld both ends
    var BB = DS.bbs, bbs = [], cvm = cover;
    var spec = { "top|inner": "straight, wall to wall", "top|outer": "U, legs lapped into walls",
      "bottom|inner": "straight, wall to wall", "bottom|outer": "U, legs lapped into walls",
      "wall|inner": "straight, full height", "wall|outer": "straight, lapped with slab legs" };
    Object.keys(spec).forEach(function (key) {
      var mem = key.split("|")[0], face = key.split("|")[1], b = bars[key], o;
      if (mem === "wall") o = BB.straight(b.dia, Hh * 1000 - 2 * cvm);
      else if (face === "inner") o = BB.straight(b.dia, W * 1000 - 2 * cvm);
      else o = BB.ubar(b.dia, W * 1000 - 2 * cvm, Math.min(BB.lap(b.dia, fck, fy), Hh * 1000 - 2 * cvm));
      o = BB.stock(o, b.dia, fck, fy);
      var r = _bars_bbs("Box " + mem, mem[0].toUpperCase() + face[0].toUpperCase(), b, Lb, o, face + " face @ " + G(b.spacing) + " c/c", spec[key]);
      if (mem === "wall") r.nos *= 2;
      bbs.push(r);
    });
    [["top", W, 2], ["bottom", W, 2], ["wall", Hh, 4]].forEach(function (p) {
      var db = bars[p[0] + "|dist"], o = BB.split(db.dia, Lb * 1000 - 2 * cvm, fck, fy);
      var n = BB.count(p[1] * 1000, db.spacing, cvm) * p[2];
      bbs.push(BB.row("Box " + p[0], p[0][0].toUpperCase() + "D", db.dia, "straight (along barrel)", n, o,
        "distribution @ " + G(db.spacing) + " c/c, " + (p[0] === "wall" ? "2 walls × 2 faces" : "both faces")));
    });
    var hd = Math.max(12, bars["wall|dist"].dia), hsp = Math.min(bars["top|inner"].spacing, 200);
    var oh = BB.straight(hd, hs * Math.SQRT2 * 1000 + 2 * BB.Ld(hd, fck, fy));
    oh.f = "haunch: " + Math.round(hs * 1000) + "×√2 + 2×Ld " + BB.Ld(hd, fck, fy) + " = " + Math.round(oh.cut * 1000) + " mm";
    bbs.push(BB.row("Box haunch", "H", hd, "straight, diagonal", 4 * BB.count(Lb * 1000, hsp, cvm), oh,
      "haunch bars " + F(hs * 1000, ".0f") + "×" + F(hs * 1000, ".0f") + " @ " + G(hsp)));
    // wing / return walls (not designed – nominal 12Ø @ 200 both faces both ways, IS 456 cl 32.5 minimum exceeded for t = 300):
    // verticals at the AVERAGE height of the trapezoid (cut each bar to the slope), horizontals over the average height
    var wd_ = 12, wsp = 200, wcv = Math.max(cvm, 50);
    var nWv = BB.count(wing_l * 1000, wsp, wcv), nWh = BB.count(wing_avg * 1000, wsp, wcv);
    var oWv = BB.stock(BB.straight(wd_, wing_avg * 1000 - 2 * wcv), wd_, fck, fy);
    oWv.f = "average height " + Math.round(wing_avg * 1000) + " (trapezoid " + Math.round(wing_h * 1000) + " → " + Math.round(wing_end * 1000) + ") – " + oWv.f;
    bbs.push(BB.row("Wing walls (nominal)", "WW1", wd_, "straight (vertical), cut to slope", 4 * 2 * nWv, oWv,
      "vertical @ " + G(wsp) + " c/c, 4 walls × 2 faces – nominal, wing walls not designed"));
    bbs.push(BB.row("Wing walls (nominal)", "WW2", wd_, "straight (horizontal)", 4 * 2 * nWh, BB.split(wd_, wing_l * 1000 - 2 * wcv, fck, fy),
      "horizontal @ " + G(wsp) + " c/c, 4 walls × 2 faces – nominal"));
    var nweep = 2 * (Math.floor(Lb / 1.0) + 1);       // one row, 1 m c/c, both walls (drawing note)
    var qty = [Q("Earth work in excavation for foundations (box culvert)", "cum",
      [row("Box culvert", 1, Lb + 2 * wing_l, W + 1.5, tb + 0.15 + 0.3)], [CMN.CPWD, "2.8.1"]),
    Q("PCC M15 levelling course below box", "cum", [row("Below box", 1, Lb + 0.6, W + 0.6, 0.15)], [CMN.MPPWD, "12.1.1"]),
    Q("RCC M" + G(fck) + " in box culvert (excl. steel & shuttering)", "cum",
      [row("Top slab", 1, Lb, W, tt), row("Bottom slab", 1, Lb, W, tb), row("Walls", 2, Lb, tw, H_),
        row("Haunches " + F(hs * 1000, ".0f") + "×" + F(hs * 1000, ".0f"), 4, Lb, hs, hs / 2)].concat(key > 0 ? [row("Shear key below base", 1, Lb, tw, key)] : []).concat([
        row("Wing / return walls (nominal, trapezoid – average height)", 4, wing_l, wing_t, wing_avg)]), null, CMN.rcc_rate(fck)),
    Q("Centering & shuttering for box culvert", "sqm",
      [row("Inside faces", 1, Lb, 2 * (S_ + H_)), row("Outside walls", 2, Lb, null, Hh),
        row("Wing walls (both faces, average height)", 8, wing_l, null, wing_avg)], null, CMN.RATE.shutter_wall),
    _steel_qty(bbs, "Box"),
    Q("Filter media behind walls 600 mm wide", "cum", [row("Both walls", 2, Lb, 0.6, Hh)], null, CMN.RATE.filter_media),
    Q("PVC weep holes 100 mm through box walls", "nos", [row("2 walls × 1 row @ 1 m c/c", nweep)], null, CMN.RATE.weep_hole),
    Q("Backfilling with granular material behind walls", "cum", [row("Both sides", 2, Lb, 1.5, Hh)], null, CMN.RATE.backfill)];
    if (fill <= 0.0 && V.kind === "road") qty.push(Q("Bituminous wearing coat 65 mm on deck", "sqm", [row("Deck", 1, Lb, W)], null, CMN.RATE.wearing_coat));

    // ---------------- drawing
    var v = new D.View("Box culvert – cross section");
    var Sm = S_ * 1000, Hm = H_ * 1000, ttm = tt * 1000, tbm = tb * 1000, twm = tw * 1000, hsm = hs * 1000;
    var Wm = Sm + 2 * twm, Hhm = tbm + Hm + ttm, cvm = cover;
    v.rect(0, 0, Wm, Hhm, "OUTLINE", "concrete");
    v.rect(twm, tbm, Sm, Hm, "OUTLINE", "water");
    [[[twm, tbm], [1, 1]], [[twm + Sm, tbm], [-1, 1]], [[twm, tbm + Hm], [1, -1]], [[twm + Sm, tbm + Hm], [-1, -1]]].forEach(function (p) {
      var x = p[0][0], y = p[0][1], sgn = p[1];
      v.poly([[x, y], [x + sgn[0] * hsm, y], [x, y + sgn[1] * hsm]], true, "OUTLINE", "concrete");
      var a = cvm + 10;
      v.line(x + sgn[0] * (hsm + a), y + sgn[1] * a, x + sgn[0] * a, y + sgn[1] * (hsm + a), "REBAR");
    });
    v.rect(-150, -150, Wm + 300, 150, "CONCRETE");
    if (key > 0) { v.rect(Wm - twm, -key * 1000, twm, key * 1000, "OUTLINE", "concrete"); v.dim(Wm + 150, -key * 1000, Wm + 150, 0, -4, "KEY " + F(key * 1000, ".0f")); }
    if (fill > 0) v.rect(-1500, Hhm, Wm + 3000, fill * 1000, "SOIL", "soil");
    var topY = Hhm + fill * 1000;
    if (V.kind === "rail") {
      v.rect(-800, topY, Wm + 1600, V.ballast * 1000, "SOIL");
      v.rect(Wm / 2 - 1372, topY + V.ballast * 1000, 2745, 210, "CONCRETE");
      v.text(Wm / 2, topY + V.ballast * 1000 + 450, "SLEEPER / BALLAST " + F(V.ballast * 1000, ".0f"), 2.0, { anchor: "middle" });
    }
    // reinforcement: outer loop, inner loop
    v.rect(cvm, cvm, Wm - 2 * cvm, Hhm - 2 * cvm, "REBAR");
    v.rect(twm - cvm, tbm - cvm, Sm + 2 * cvm, Hm + 2 * cvm, "REBAR");
    var lab = function (key) { var b = bars[key]; return G(b.dia) + "Ø@" + G(b.spacing); };
    var xl = Wm + 900;
    [["TO", "top|outer", Hhm - cvm, Wm - cvm], ["TI", "top|inner", tbm + Hm + cvm, Wm - twm + cvm], ["WO", "wall|outer", tbm + 0.62 * Hm, Wm - cvm],
      ["WI", "wall|inner", tbm + 0.38 * Hm, Wm - twm + cvm], ["BI", "bottom|inner", tbm - cvm, Wm - twm + cvm], ["BO", "bottom|outer", cvm, Wm - cvm]].forEach(function (q) {
      v.line(q[3], q[2], xl, q[2], "DIM");
      v.text(xl + 60, q[2] + 30, q[0] + " " + lab(q[1]) + " (" + q[1].split("|")[1] + " face)", 2.0);
    });
    v.dim(twm, tbm + Hm / 2, twm + Sm, tbm + Hm / 2, 0, F(Sm, ",.0f") + " CLEAR");
    v.dim(twm + Sm / 4, tbm, twm + Sm / 4, tbm + Hm, 0, F(Hm, ",.0f") + " CLEAR");
    v.dim(-300, Hhm - ttm, -300, Hhm, 3, F(ttm, ".0f"));
    v.dim(-300, 0, -300, tbm, 3, F(tbm, ".0f"));
    v.dim(-300, tbm, -300, tbm + Hm, 3, F(Hm, ",.0f"));
    v.dim(-900, 0, -900, Hhm, 6, F(Hhm, ",.0f"));
    v.dim(0, -150, Wm, -150, 10);
    v.dim(Wm - twm, tbm + Hm * 0.85, Wm, tbm + Hm * 0.85, 4, F(twm, ".0f"));
    v.dim(0, tbm + Hm * 0.85, twm, tbm + Hm * 0.85, 4, F(twm, ".0f"));
    if (fill > 0) v.dim(-1300, Hhm, -1300, topY, 4, "FILL " + F(fill * 1000, ".0f"));
    v.text(Wm / 2, -2300, "Distribution (each face, along barrel): top " + lab("top|dist") + ", bottom " + lab("bottom|dist") + ", walls " + lab("wall|dist"), 2.0, { anchor: "middle" });
    v.text(Wm / 2, -2650, "Haunch " + F(hsm, ".0f") + " × " + F(hsm, ".0f") + ", bar H " + G(hd) + "Ø@" + G(hsp) + "; cover " + G(cvm) + " mm all faces", 2.0, { anchor: "middle" });
    v.text(Wm / 2, topY + (V.kind === "rail" ? V.ballast * 1000 + 900 : 400), "LIVE LOAD: " + String(inp.vehicle) + (V.kind === "dumper" ? " – " + V.dumper.name : ""), 2.0, { anchor: "middle" });
    var lv = new D.View("Longitudinal section along barrel");
    lv.rect(0, 0, Lb * 1000, Hhm, "OUTLINE");
    lv.rect(0, tbm, Lb * 1000, Hm, "HIDDEN");
    var wl_mm = wing_l * 1000, wh_mm = wing_h * 1000, L_mm = Lb * 1000;
    lv.poly([[-wl_mm, 0], [0, 0], [0, wh_mm], [-wl_mm, 600]], true, "OUTLINE", "concrete");
    lv.poly([[L_mm, 0], [L_mm + wl_mm, 0], [L_mm + wl_mm, 600], [L_mm, wh_mm]], true, "OUTLINE", "concrete");
    lv.dim(0, 0, Lb * 1000, 0, 10, "BARREL " + F(Lb * 1000, ",.0f"));
    var sheet = new D.Sheet("RCC box culvert – general arrangement", "BR-01", [v, lv],
      ["Concrete M" + G(fck) + ", steel Fe" + G(fy) + ", clear cover " + G(cover) + " mm all faces; exposure " + o.exposure + ".",
        "Live load: " + V.variants.map(function (x) { return x.name; }).join("; ") + " – " + (V.kind === "rail" ? "CDA per Bridge Rules cl 2.4.2" : "impact per " + V.imp_clause) + ".",
        "Loads factored per " + out.fac.code + "; crack width ≤ " + G(o.crack) + " mm.",
        "Earth pressure at rest K0 = " + F(out.K0, ".2f") + "; fill " + G(fill) + " m; live-load surcharge " + F(out.ls_t, ".1f") + "–" + F(out.ls_b, ".1f") + " kN/m² (lateral).",
        "Haunches " + F(hsm, ".0f") + " × " + F(hsm, ".0f") + " at all corners. Outer slab bars bent into walls and lapped max(Ld, 30φ) (IS 456 cl 26.2.5.1) = " +
          ["top|outer", "bottom|outer"].map(function (k) { return G(BB.lap(bars[k].dia, fck, fy)) + " mm for " + G(bars[k].dia) + "Ø"; }).join(", ") + "; laps staggered.",
        "Provide 600 mm filter media and 100 mm PVC weep holes at 1 m c/c (one row, " + nweep + " nos) above LWL.",
        "Wing walls shown indicative (nominal 12Ø @ 200 both faces both ways) – design separately for the actual height."].concat(V.kind === "rail" ? ["Railway approval (zonal railway / RDSO) required before construction."] : []));
    var bt = bars["top|inner"];
    var summary = { "Box": G(S_) + " × " + G(H_) + " m clear, top " + F(tt * 1000, ".0f") + ", bottom " + F(tb * 1000, ".0f") + ", walls " + F(tw * 1000, ".0f") + " mm",
      "Live load": inp.vehicle + (V.kind === "dumper" ? " – " + V.dumper.name : ""), "Base pressure (mean / peak)": F(out.pavg, ".0f") + " / " + F(out.pmax, ".0f") + " kN/m²",
      "Top slab bars": "inner " + G(bt.dia) + "Ø@" + G(bt.spacing) + ", outer " + lab("top|outer"),
      "Bottom slab bars": "inner " + lab("bottom|inner") + ", outer " + lab("bottom|outer"),
      "Wall bars": "inner " + lab("wall|inner") + ", outer " + lab("wall|outer"),
      "Governing check": gov, "Max utilisation": F(c.max_utilisation, ".2f") };
    var tbl = C.table(["top", "bottom", "wall"].map(function (m) {
      return [m, R(out.uls[m].inner, 1), R(out.uls[m].outer, 1), R(out.uls[m].Vd, 1), R(out.crack[m].inner, 1), R(out.crack[m].outer, 1), R(out.rare[m].inner, 1), R(out.rare[m].outer, 1)];
    }), ["Member", "MEd inner", "MEd outer", "VEd at d", "Ms,crack inner", "Ms,crack outer", "Ms,rare inner", "Ms,rare outer"]);
    var ltab = C.table(out.rows, ["Load", "Characteristic value", "Unit", "γ ULS", "γ SLS rare", "γ SLS crack", "Basis / clause"]);
    var refs = IRC_REFS.concat(RCC_REFS.slice(0, 1));
    if (V.kind === "rail") refs = ["IRS Bridge Rules (2014, with ACS) – loading, CDA, dispersion", "IRS Concrete Bridge Code – load factors, crack width, cover",
      "IRS Bridge Substructure & Foundation Code"].concat(refs);
    return C.DesignResult({ module: "box_culvert", title: "RCC box culvert", inputs: inp, calc: c, summary: summary, drawings: [sheet],
      quantities: qty, bbs: bbs, tables: { "Loads & factors (per m of barrel)": ltab, "Design actions per m (kN·m, kN)": tbl }, references: refs });
  }
  M.run_box = run_box;

  /* shared loading parameters (box & pipe) */
  /* show railway / dumper inputs only when that loading is chosen (road culverts don't carry a track) */
  function _vk(v) { return _cv_kind(v.vehicle); }
  function _isRail(v) { return _vk(v) === "rail"; }
  function _isDump(v) { return _vk(v) === "dumper"; }
  function _isCustomDump(v) { return _isDump(v) && String(v.dumper_model) === "Custom"; }
  function _ll_params(veh_default) {
    return [
      P("location", "Culvert location", "Road (IRC loading)", { kind: "select", options: CV_LOCS.slice(), group: "Loads",
        help: "Road, railway and mine haul road are separate environments with separate codes: IRC 6 / IRC 112, IRS Bridge Rules / IRS CBC (railway approval), or dumper loading with mine practice." }),
      P("vehicle", "Live load", veh_default, { kind: "select", options: CV_VEHICLES.slice(), group: "Loads",
        filter: function (o, v) { var k = _locKind(v); return !k || _cv_kind(o) === k; },
        help: "Mine haul roads: use the dumper option – IRC 70R does not cover 100–400 t dump trucks. Railway: IRS loading + railway approval." }),
      P("lanes", "Vehicles side by side (road lanes / haul-road lanes)", 2, { kind: "int", min: 1, max: 2, group: "Loads", when: function (v) { return !_isRail(v); },
        help: "IRC Class A: number of lanes loaded. Dumpers: 2 = two trucks passing on the culvert (clearance ½ truck width)." }),
      P("ballast", "Ballast cushion below sleeper (railway)", 0.35, "m", { min: 0.25, max: 0.6, step: 0.05, group: "Railway", when: _isRail }),
      P("tracks", "Number of tracks (railway)", 1, { kind: "int", min: 1, max: 2, group: "Railway", when: _isRail }),
      P("dumper_model", "Dumper (preset)", "BEML BH100 (165 t)", { kind: "select", options: DUMPER_OPTS.slice(), group: "Mine dumper", when: _isDump,
        help: "Presets from OEM data (some geometry approximate). Choose Custom to enter your own." }),
      P("dumper_gvw", "Dumper GVW (custom, loaded)", 165.0, "t", { min: 10, max: 650, group: "Mine dumper", when: _isCustomDump }),
      P("dumper_front", "Front-axle share of GVW (custom)", 0.33, { min: 0.2, max: 0.5, step: 0.01, group: "Mine dumper", when: _isCustomDump }),
      P("dumper_axles", "Number of axles (custom)", 2, { kind: "int", min: 2, max: 4, group: "Mine dumper", when: _isCustomDump }),
      P("dumper_spacing", "Axle spacing / wheelbase (custom)", 4.95, "m", { min: 1.2, max: 8, step: 0.05, group: "Mine dumper", when: _isCustomDump }),
      P("dumper_track_f", "Front wheel track c/c (custom)", 4.0, "m", { min: 1.5, max: 7, step: 0.05, group: "Mine dumper", when: _isCustomDump }),
      P("dumper_track_r", "Rear dual-pair centre track (custom)", 3.8, "m", { min: 1.5, max: 7, step: 0.05, group: "Mine dumper", when: _isCustomDump }),
      P("dumper_dual", "Rear dual tyres (custom)", "Yes", { kind: "select", options: ["Yes", "No"], group: "Mine dumper", when: _isCustomDump }),
      P("dumper_dual_cc", "Dual tyre c/c (custom)", 0.85, "m", { min: 0.3, max: 1.6, step: 0.05, group: "Mine dumper", when: _isCustomDump }),
      P("dumper_tyre_b", "Tyre contact width (custom)", 0.69, "m", { min: 0.2, max: 1.5, step: 0.01, group: "Mine dumper", when: _isCustomDump }),
      P("dumper_tyre_p", "Tyre contact pressure (custom)", 650.0, "kPa", { min: 300, max: 1000, step: 10, group: "Mine dumper", when: _isCustomDump }),
      P("dumper_overload", "Overload factor on GVW (payload policy)", 1.10, { min: 1.0, max: 1.3, step: 0.05, group: "Mine dumper", when: _isDump,
        help: "1.10 on GVW ≈ 120 % payload (OEM 10/10/20 payload policy)." }),
      P("fill_disp", "Fill over culvert (dispersion)", "Compacted granular (45°)", { kind: "select",
        options: ["Compacted granular (45°)", "Loose dump / OB fill (2V:1H)"], group: "Loads" })
    ];
  }

  var BOX_PARAMS = [
    P("span", "Clear span", 3.0, "m", { min: 1, max: 8, step: 0.25, group: "Geometry" }),
    P("height", "Clear height", 2.5, "m", { min: 1, max: 6, step: 0.25, group: "Geometry" }),
    P("fill", "Earth fill over top slab", 0.6, "m", { min: 0, max: 8, step: 0.1, group: "Geometry",
      help: "Road: road level to top slab. Railway: formation (bottom of ballast) to top slab. Haul road: road surface to top slab." }),
    P("road_width", "Barrel length (roadway + shoulders)", 12.0, "m", { min: 4, max: 60, step: 0.5, group: "Geometry" })
  ].concat(_ll_params("IRC Class A")).concat([
    P("gamma", "Soil unit weight", 18.0, "kN/m³", { min: 15, max: 22, group: "Soil" }),
    P("gamma_sat", "Saturated unit weight (below GWT)", 20.0, "kN/m³", { min: 16, max: 23, group: "Soil" }),
    P("phi", "Angle of internal friction", 30.0, "°", { min: 20, max: 40, group: "Soil" }),
    P("sbc", "Safe bearing capacity", 150.0, "kN/m²", { min: 50, max: 500, group: "Soil" }),
    P("ks", "Modulus of subgrade reaction", 25000.0, "kN/m³", { min: 5000, max: 100000, step: 1000, group: "Soil" }),
    P("gwt", "Ground water above underside of base (0 = none)", 0.0, "m", { min: 0, max: 8, step: 0.1, group: "Soil",
      help: "Used for uplift / flotation (box empty). Mines: take the monsoon / pit-flooding level." }),
    P("mu", "Base friction coefficient", 0.5, { min: 0.3, max: 0.7, step: 0.05, group: "Soil" }),
    P("shear_key", "Shear key depth below base (check; 0 = none)", 0.0, "m", { min: 0, max: 1.5, step: 0.05, group: "My design", modes: ["check"] }),
    P("fck", "Concrete grade fck", 30.0, "N/mm²", { kind: "select", options: [25.0, 30.0, 35.0, 40.0], group: "Materials" }),
    P("fy", "Steel fy", 500.0, "N/mm²", { kind: "select", options: [415.0, 500.0], group: "Materials" }),
    P("exposure", "Exposure", "Moderate", { kind: "select", options: EXPOSURE_OPTS.slice(), group: "Materials" }),
    P("cover", "Clear cover", 40.0, "mm", { min: 30, max: 75, step: 5, group: "Materials" }),
    P("crack_limit", "Crack-width limit", "Auto", { kind: "select", options: ["Auto", "0.3", "0.2", "0.1"], group: "Materials",
      help: "Auto: 0.3 mm road / moderate; 0.2 mm for railway, mine sites and severe exposure." }),
    P("t_top", "Top slab thickness (check)", 0.35, "m", { min: 0.2, max: 1.5, step: 0.025, group: "My design", modes: ["check"] }),
    P("t_bot", "Bottom slab thickness (check)", 0.375, "m", { min: 0.2, max: 1.5, step: 0.025, group: "My design", modes: ["check"] }),
    P("t_wall", "Wall thickness (check)", 0.30, "m", { min: 0.2, max: 1.5, step: 0.025, group: "My design", modes: ["check"] })
  ]);
  ["top", "bottom", "wall"].forEach(function (m) {
    ["inner", "outer"].forEach(function (fc) {
      ["dia", "s"].forEach(function (k) {
        var isd = k === "dia";
        BOX_PARAMS.push(P(m + "_" + fc + "_" + k, m[0].toUpperCase() + m.slice(1) + " " + fc + " bar " + (isd ? "dia" : "spacing") + " (check)",
          isd ? 16.0 : 150.0, "mm", { min: isd ? 10 : 75, max: isd ? 32 : 300, group: "My design", modes: ["check"] }));
      });
    });
  });
  M.BOX_PARAMS = BOX_PARAMS;
  C.register({ id: "box_culvert", phase: 3, category: "Drains, culverts & roads", name: "RCC box culvert (single cell)", icon: "🌉",
    description: "Closed box frame on elastic soil for IRC Class A / AA / 70R, IRS 25 t-2008 / DFC railway or mine-dumper loading: " +
      "dispersion through fill, impact / CDA, braking, earth at rest, surcharge, water & uplift; IRC 112 flexure, shear, crack width, " +
      "stress limits; bearing, sliding and flotation.", params: BOX_PARAMS, run: run_box,
    references: IRC_REFS });

  /* =========================================================================== PIPE CULVERT */
  // dia mm: [m, NP4 ₹/m indicative]
  var PIPES = [[600, [0.60, 4200.0]], [900, [0.90, 6500.0]], [1000, [1.00, 7600.0]], [1200, [1.20, 9800.0]], [1400, [1.40, 13500.0]],
    [1600, [1.60, 17500.0]], [1800, [1.80, 22000.0]]];
  var PIPE_MAP = {}; PIPES.forEach(function (p) { PIPE_MAP[p[0]] = p[1]; });
  M.PIPES = PIPE_MAP;
  // IS 458:2003 Tables (spun pipes): dia → [wall t mm, NP3 load 0.25 mm crack kN/m, NP3 ultimate, NP4 crack, NP4 ultimate]
  var IS458 = { 600: [85, 28.74, 43.11, 46.30, 69.40], 900: [100, 43.11, 64.67, 66.30, 99.40], 1000: [115, 47.90, 71.85, 72.60, 108.90],
    1200: [120, 57.48, 86.22, 88.30, 132.40], 1400: [135, 67.06, 100.60, 104.20, 156.40], 1600: [140, 76.64, 114.96, 119.60, 179.50],
    1800: [150, 86.22, 129.33, 135.30, 203.00] };
  M.IS458 = IS458;
  var BEDDINGS = [["Ordinary granular (IS 783 Class C)", 1.5], ["First class granular, 1/4 D (IS 783 Class B)", 1.9],
    ["Concrete cradle M15, 1/4 D (Class A)", 2.2], ["Full concrete encasement 200 mm M20", 3.0]];
  var BED_MAP = {}; BEDDINGS.forEach(function (b) { BED_MAP[b[0]] = b[1]; });

  /* max live load (kN per m of pipe) on a strip of width Bc, without impact */
  function _strip_ll(V, vr, z, Bc) {
    var pts = _cv_patches(V, Object.assign({}, vr, { imp: 0 }), z, 0), best = 0;
    var Lt = pts[pts.length - 1].x, lam = Math.max.apply(null, pts.map(function (p) { return p.la; }));
    for (var x0 = -Lt - lam / 2; x0 <= Bc + lam / 2 + 1e-9; x0 += 0.05) {
      var s = 0;
      pts.forEach(function (p) { var xa = x0 + p.x, ov = Math.min(Bc, xa + p.la / 2) - Math.max(0, xa - p.la / 2); if (ov > 0) s += p.p * ov; });
      best = Math.max(best, s);
    }
    return best;
  }

  function run_pipe(inp, mode) {
    inp = _cv_norm(inp);
    var CMN = CMN_(), D_ = DR(), LDs = LD();
    var c = new C.Calc("Hume pipe culvert");
    c.section("Design discharge (rational formula)");
    var Qd;
    if (inp.q_mode === "From catchment") {
      Qd = c.calc("Peak runoff", "Q", "C*i*A/360", "m³/s", "Rational method (IRC SP-13 cl 4)",
        "C runoff coefficient, i mm/hr for time of concentration, A hectares",
        { C: num(inp.C), i: num(inp.intensity), A: num(inp.area_ha) });
    } else {
      Qd = c.let("Design discharge (given)", "Q", num(inp.Q), "m³/s");
    }
    var S = num(inp.slope) / 100;
    var n = 0.013;
    c.section("Hydraulic capacity (Manning, flowing full)");
    var best = null, maxRows = Math.max(1, Math.trunc(num(inp.max_rows)) || 1);
    var dias = mode === "check" ? [Math.trunc(num(inp.dia))] : PIPES.map(function (p) { return p[0]; }).filter(function (d) { return d >= 1200; });
    for (var i = 0; i < dias.length; i++) {
      var dmm0 = dias[i];
      var D0 = PIPE_MAP[dmm0][0];
      var A0 = Math.PI * D0 * D0 / 4;
      var Rh = D0 / 4;
      var qcap0 = A0 * Math.pow(Rh, 2 / 3) * Math.sqrt(S) / n;
      var k0 = mode !== "check" ? Math.max(1, Math.ceil(Qd / (0.8 * qcap0))) : Math.trunc(num(inp.rows));
      if (mode === "check" || k0 <= maxRows) { best = [dmm0, D0, A0, qcap0, k0]; break; }
    }
    if (best === null) {
      var dmx = Math.max.apply(null, PIPES.map(function (p) { return p[0]; }));
      var Dx = PIPE_MAP[dmx][0], Ax = Math.PI * Dx * Dx / 4, qx = Ax * Math.pow(Dx / 4, 2 / 3) * Math.sqrt(S) / n;
      best = [dmx, Dx, Ax, qx, Math.max(1, Math.ceil(Qd / (0.8 * qx)))];
    }
    var dmm = best[0], D = best[1], A = best[2], k = best[4];
    c.let("Pipe diameter (internal)", "D", dmm, "mm", "IS 458");
    var qc = c.calc("Capacity of one pipe flowing full", "Qp", "(pi*D**2/4)*(D/4)**(2/3)*sqrt(S)/n", "m³/s", "Manning", { D: D, S: S, n: n });
    c.let("Number of pipe rows", "N", k, "");
    c.check("Discharge ≤ 80 % of full capacity", Qd, 0.8 * k * qc, { unit: "m³/s", clause: "IRC SP-13 (free flow)" });
    c.check("Rows of pipes ≤ max. rows", k, maxRows, { clause: "project limit (input)",
      note: k > maxRows ? "rows ≤ max_rows – use RCC box culvert (or a steeper bed / larger vent)" : "" });
    // part-full flow: Manning with the actual depth y (bisection on y/D, Q(y/D) rises to a maximum at y/D ≈ 0.938)
    var q1 = Qd / k;
    function Qpart(yD) { var th = 2 * Math.acos(1 - 2 * yD), Ap = D * D / 8 * (th - Math.sin(th)), Pp = D * th / 2; return Ap * Math.pow(Ap / Pp, 2 / 3) * Math.sqrt(S) / n; }
    var yD, full = q1 >= Qpart(0.938);
    if (full) yD = 1.0;
    else { var lo = 1e-4, hi = 0.938; for (var ib = 0; ib < 60; ib++) { var mid = (lo + hi) / 2; if (Qpart(mid) < q1) lo = mid; else hi = mid; } yD = (lo + hi) / 2; }
    c.calc("Discharge per pipe", "q1", "Q/N", "m³/s", "", { Q: R(Qd, 4), N: k });
    var vel;
    if (full) {
      c.let("Depth ratio y/D (Manning, part-full)", "y/D", 1.0, "", "Manning", "q1 > max part-full capacity (y/D = 0.938) → pipe runs full / surcharged");
      vel = c.calc("Velocity, pipe flowing full", "V", "q1/(pi*D**2/4)", "m/s", "continuity", { q1: R(q1, 4), D: D });
    } else {
      c.let("Depth ratio y/D (Manning, part-full, solved by bisection)", "y/D", R(yD, 4), "", "Manning – Q(y) = A·R^(2/3)·√S / n = q1", "y = " + F(yD * D * 1000, ".0f") + " mm");
      var th = c.calc("Central angle of the water surface", "θ", "2*acos(1 - 2*yD)", "rad", "circular segment", { yD: R(yD, 4) });
      var Aw = c.calc("Flow area (part-full)", "Aw", "D**2/8*(th - sin(th))", "m²", "", { D: D, th: R(th, 5) });
      var Pw = c.calc("Wetted perimeter", "Pw", "D*th/2", "m", "", { D: D, th: R(th, 5) });
      c.calc("Manning discharge at y (= q1, check)", "Qy", "Aw*(Aw/Pw)**(2/3)*sqrt(S)/n", "m³/s", "Manning", { Aw: R(Aw, 5), Pw: R(Pw, 5), S: S, n: n });
      vel = c.calc("Actual velocity at design discharge (part-full)", "V", "q1/Aw", "m/s", "continuity", { q1: R(q1, 4), Aw: R(Aw, 5) });
    }
    c.ok("Self-cleansing velocity ≥ 0.6 m/s", vel >= 0.6, { detail: "V = " + F(vel, ".2f") + " m/s at y/D = " + F(yD, ".2f"), clause: "CPHEEO / IRC SP-13", warn_only: true });
    c.ok("Velocity ≤ 3.0 m/s (scour at outlet)", vel <= 3.0, { detail: "V = " + F(vel, ".2f") + " m/s at y/D = " + F(yD, ".2f"), clause: "IRC SP-13", warn_only: true });
    c.ok("Minimum pipe diameter 1200 mm for road culverts", dmm >= 1200, { detail: C.pystr(dmm) + " mm",
      clause: "IRC SP-13:2022 cl 12.5 (900 mm in older editions)", warn_only: true });

    // ---------------- structural
    c.section("Structural – loads on pipe (per m length)");
    var cushion = num(inp.cushion), gam = num(inp.gamma) || 18.0, ctx = _ctx(), mine;
    var row458 = IS458[dmm] || IS458[1200];
    var Bc = c.calc("Outside diameter", "Bc", "D + 2*t/1000", "m", "IS 458 Table (wall thickness)", { D: D, t: row458[0] });
    var V = _cv_vehicle(inp, Bc, cushion, gam);
    var rail = V.kind === "rail", dump = V.kind === "dumper";
    mine = !rail && (ctx.site === "mine" || dump);     // railway culverts follow railway rules only (as the box culvert)
    var Hc = cushion;
    var Kmu = 0.19;
    var Cc = c.calc("Marston load coefficient (positive projecting, complete projection, capped 1.5 × prism)", "Cc",
      "min((exp(2*Km*H/Bc) - 1)/(2*Km), 1.5*H/Bc)", "", "IS 783 / Marston–Spangler", { Km: Kmu, H: Hc, Bc: R(Bc, 3) });
    var We = c.calc("Earth load on pipe", "We", "Cc*gam*Bc**2 + qs*Bc", "kN/m", "IS 783", { Cc: R(Cc, 4), gam: gam, Bc: R(Bc, 3),
      qs: rail ? R(V.q_track, 2) : 0 });
    var WL = 0, govv = "";
    V.variants.forEach(function (vr) {
      var w = _strip_ll(V, vr, V.z, Bc) * (1 + vr.imp);
      if (w > WL) { WL = w; govv = vr.name + " (impact " + F(vr.imp, ".3f") + ")"; }
    });
    if (V.uniform) {
      var wu = V.uniform.w * (1 + V.uniform.imp) / V.uniform.B * Bc;
      if (wu > WL) { WL = wu; govv = V.uniform.name; }
    }
    WL = c.calc("Live load on pipe incl. impact / CDA", "WL", "wl", "kN/m", V.k_clause, govv + ", dispersed to z = " + F(V.z, ".2f") + " m", { wl: R(WL, 2) });
    var Wt = c.calc("Total load on pipe", "W", "We + WL", "kN/m", "", { We: R(We, 2), WL: R(WL, 2) });
    var FSc = rail || mine || dump ? 1.25 : 1.0, FSu = 1.5;
    var min_c = rail ? 1.0 : dump ? LDs.dumper_min_cushion(V.gvw) : 0.6;
    // class & bedding
    var classes = ["NP3", "NP4"], beds = BEDDINGS.map(function (b) { return b[0]; });
    var pclass = inp.pipe_class && inp.pipe_class !== "Auto" ? inp.pipe_class : null;
    var bed = BED_MAP[inp.bedding] ? inp.bedding : beds[1];
    function strength(cl) { return cl === "NP3" ? [row458[1], row458[2]] : [row458[3], row458[4]]; }
    function ok(cl, bd) { var s = strength(cl), lf = BED_MAP[bd]; return Wt * FSc <= s[0] * lf + 1e-9 && Wt * FSu <= s[1] * lf + 1e-9; }
    var enc_needed = cushion < min_c - 1e-9;
    if (mode !== "check") {
      var cl_list = pclass ? [pclass] : (rail || dump ? ["NP4"] : classes);
      var found = null, bi = beds.indexOf(bed);
      if (enc_needed) bi = beds.length - 1;
      for (var bj = bi; bj < beds.length && !found; bj++) for (var ci = 0; ci < cl_list.length && !found; ci++) if (ok(cl_list[ci], beds[bj])) found = [cl_list[ci], beds[bj]];
      if (!found) found = [cl_list[cl_list.length - 1], beds[beds.length - 1]];
      pclass = found[0]; bed = found[1];
    } else if (!pclass) pclass = "NP4";
    var st = strength(pclass), Lf = BED_MAP[bed];
    c.let("Pipe class", "", pclass + " – IS 458 (" + (pclass === "NP4" ? "heavy traffic" : "medium traffic") + ")", "", "IS 458 cl 4.1",
      "3-edge-bearing load: 0.25 mm crack " + F(st[0], ".1f") + " kN/m, ultimate " + F(st[1], ".1f") + " kN/m");
    c.let("Bedding", "", bed, "", "IS 783", "bedding (load) factor Lf = " + G(Lf));
    c.check("Load × FoS " + G(FSc) + " ≤ crack (0.25 mm) test load × Lf", Wt * FSc, st[0] * Lf, { unit: "kN/m", clause: "IS 458 / IS 783 (Marston–Spangler)",
      note: "upgrade class (NP3 → NP4), bedding (granular → concrete cradle → encasement) or use an RCC box" });
    c.check("Load × FoS " + G(FSu) + " ≤ ultimate test load × Lf", Wt * FSu, st[1] * Lf, { unit: "kN/m", clause: "IS 458 / IS 783" });
    if (rail || dump) c.ok("Pipe class NP4 for " + (rail ? "railway" : "dumper") + " loading", pclass === "NP4", { clause: rail ? "IS 458 cl 4.1 / RDSO practice" : "IS 458 cl 4.1 / heavy-duty haul-road practice [GP]", detail: pclass });
    var encased = bed === beds[beds.length - 1];
    if (enc_needed && !encased) c.check("Earth cushion over pipe ≥ " + G(min_c) + " m (else 200 mm M20 encasement)", cushion, min_c, { unit: "m", mode: ">=",
      clause: rail ? "Railway practice [GP]" : dump ? "Haul-road practice [GP]" : "IRC SP-13:2022 cl 13.3.3", note: "provide full-length 200 mm M20 concrete encasement or raise the cushion" });
    else c.ok("Earth cushion over pipe ≥ " + G(min_c) + " m (or encased)", true, { detail: "cushion " + G(cushion) + " m" + (enc_needed ? " – full 200 mm M20 encasement provided" : ""),
      clause: rail ? "Railway practice [GP]" : dump ? "Haul-road practice [GP]" : "IRC SP-13:2022 cl 13.3.3" });
    if (rail) c.warn("Railway", "RCC box preferred under running lines; if pipes are used: NP4 with concrete encasement and zonal-railway / RDSO approval", "IRS Bridge Rules / RDSO practice");
    if (dump && V.gvw > 100) c.warn("Mine dumper", "For > 100 t dumpers an RCC box (or cast-in-situ encasement) is preferred over hume pipes", "Haul-road practice [GP]");
    c.ok("Fill height within bedding limit (granular ≤ 4 m, cradle ≤ 8 m)", cushion <= (BED_MAP[bed] >= 2.2 ? 8 : 4), { clause: "IRC SP-13:2022 cl 13.3.3", detail: "cushion " + G(cushion) + " m", warn_only: true });

    var Lb = num(inp.road_width) + 2 * 1.5 * (cushion + D);
    c.calc("Length of barrel (formation + side slopes 1.5:1)", "Lb", "W + 2*1.5*(hc + D)", "m", "", { W: num(inp.road_width), hc: cushion, D: D });
    var spacing = D + Math.max(0.45, D / 2);
    c.thumb("Pipe dia from Q (V ≈ 1.5 m/s)", Math.sqrt(4 * Qd / (k * 1.5 * Math.PI)) * 1000, dmm, "mm", "A = Q / 1.5 m/s", "Hydraulics rule of thumb");
    c.miss("Afflux, headwater depth and inlet / outlet control check", "IRC SP-13 cl 6", "Important");
    c.miss("Catchment time of concentration & rainfall intensity from IMD / local data", "IRC SP-13 cl 4", "Important");
    c.miss("Scour / bed protection at outlet and HFL vs road level", "IRC SP-13", "Important");
    if (rail) c.miss("Railway approval (zonal railway / RDSO) for any structure under track", "IRS Bridge Rules", "Critical");
    if (mine) c.miss("Blast vibration (DGMS Circular 7/1997) and subsidence / OB-dump settlement at the crossing", "DGMS / CMR 2017", "Important");
    var Wtot = (k - 1) * spacing + D + 2 * 0.3;
    var hw_h = cushion + D + 0.3 + 0.3;
    var t458 = row458[0] / 1000, Do = D + 2 * t458;
    // bedding per selected class: 150 mm below the barrel + embedment h above the invert, width Do + 300; pipe segment deducted
    var bi_ = beds.indexOf(bed), granular = bi_ <= 1;
    var hEmb = encased ? 0 : (bi_ === 0 ? 0.1 * Do : Do / 4);           // Class C ≈ 0.1 Do shaped bed; Class B / A to ¼ Do
    var Ro = Do / 2, segA = hEmb > 0 ? Ro * Ro * Math.acos((Ro - hEmb) / Ro) - (Ro - hEmb) * Math.sqrt(2 * Ro * hEmb - hEmb * hEmb) : 0;
    var bedRows = encased ? [row("Encasement 200 mm M20 (gross square " + F(Do + 0.4, ".2f") + " m)", k, Lb, Do + 0.4, Do + 0.4),
      row("Deduct pipe (outside Ø " + F(Do, ".2f") + " m)", k, Lb, R(Math.PI * Do * Do / 4, 4), null, true)]
      : [row((granular ? "Granular bed" : "PCC cradle") + " 150 mm + embedment " + F(hEmb * 1000, ".0f") + " mm", k, Lb, Do + 0.3, 0.15 + hEmb),
        row("Deduct pipe segment below embedment line", k, Lb, R(segA, 4), null, true)];
    var bedDesc = encased ? "RCC/PCC M20 encasement around pipes" : granular ? "Granular bedding (sand / gravel, IS 783 " + (bi_ === 0 ? "Class C" : "Class B") + ") under pipes"
      : "PCC M15 cradle under pipes (IS 783 Class A)";
    var qty = [Q("Earth work in excavation for pipe culvert", "cum", [row("Trench", 1, Lb, Wtot + 0.6, 0.15 + D / 3 + 0.3)], [CMN.CPWD, "2.8.1"]),
      Q(bedDesc, "cum", bedRows, granular ? null : [CMN.MPPWD, "12.1.1"], granular ? CMN.RATE.filter_media : 0),
      Q("RCC " + pclass + " hume pipe " + C.pystr(dmm) + " mm dia, laid & jointed with collars", "rm", [row("Pipes", k, Lb)], null,
        PIPE_MAP[dmm][1] * (pclass === "NP3" ? 0.85 : 1.0)),
      Q("Head wall & wing wall in stone / brick masonry CM 1:4", "cum",
        [row("Head walls", 2, Wtot + 1.0, 0.45, hw_h), row("Wing walls", 4, 1.5 * hw_h, 0.45, hw_h / 2)], null, 6200.0),
      Q("Boulder apron / stone pitching at inlet & outlet", "cum", [row("Aprons", 2, 1.5 * D + 1.0, Wtot + 1.0, 0.3)], null, 2400.0)];
    var v = new D_.View("Pipe culvert – section across road");
    var Wm = num(inp.road_width) * 1000;
    v.poly([[-Lb * 500, 0], [-Wm / 2, (cushion + D) * 1000 + 300], [Wm / 2, (cushion + D) * 1000 + 300], [Lb * 500, 0]], false, "SOIL");
    v.rect(-Lb * 500, 150, Lb * 1000, D * 1000, "CONCRETE", "concrete");
    v.dim(-Lb * 500, 0, Lb * 500, 0, 10, "BARREL " + F(Lb * 1000, ",.0f"));
    v.dim(Lb * 500 + 300, 150 + D * 1000, Lb * 500 + 300, (cushion + D) * 1000 + 300, -6, "CUSHION " + F(cushion * 1000, ".0f"));
    var e = new D_.View("Head wall elevation");
    for (var j = 0; j < k; j++) {
      var cx = 300 + D * 500 + j * spacing * 1000;
      e.circle(cx, 150 + D * 500, D * 500, "OUTLINE");
      e.circle(cx, 150 + D * 500, D * 500 + row458[0], "CONCRETE");
      if (encased) e.rect(cx - Do * 500 - 200, 150 + D * 500 - Do * 500 - 200, Do * 1000 + 400, Do * 1000 + 400, "CONCRETE");
    }
    e.rect(0, 0, Wtot * 1000, hw_h * 1000 + 150, "OUTLINE");
    e.dim(0, 0, Wtot * 1000, 0, 10);
    e.text(Wtot * 500, hw_h * 1000 + 600, C.pystr(k) + " ROW(S) OF " + C.pystr(dmm) + " Ø " + pclass + " HUME PIPE", 2.4, { anchor: "middle" });
    var sheet = new D_.Sheet("Hume pipe culvert", "PC-01", [v, e],
      ["Pipes " + pclass + " to IS 458 with rubber-ring / collar joints; wall " + G(row458[0]) + " mm.",
        "Bedding: " + bed + " (load factor " + G(Lf) + ").",
        "Live load: " + V.variants.map(function (x) { return x.name; }).join("; ") + ".",
        "Clear spacing between pipes ≥ max(450 mm, D/2) = " + F(Math.max(0.45, D / 2) * 1000, ".0f") + " mm.",
        "Backfill in 150 mm layers compacted on both sides simultaneously."]);
    return C.DesignResult({ module: "pipe_culvert", title: "Hume pipe culvert", inputs: inp, calc: c,
      summary: { "Discharge": F(Qd, ".3f") + " m³/s", "Pipes": C.pystr(k) + " × " + C.pystr(dmm) + " mm " + pclass,
        "Capacity (80 %)": F(0.8 * k * qc, ".3f") + " m³/s", "Velocity": F(vel, ".2f") + " m/s",
        "Load on pipe": F(Wt, ".1f") + " kN/m (" + String(inp.vehicle) + ")", "Bedding": bed,
        "Barrel length": F(Lb, ".2f") + " m", "Max utilisation": F(c.max_utilisation, ".2f") }, drawings: [sheet], quantities: qty, bbs: [],
      tables: { "Loads on pipe (per m)": C.table([["Earth (Marston)", R(We, 2), "kN/m"], ["Live load incl. impact", R(WL, 2), "kN/m"], ["Total W", R(Wt, 2), "kN/m"],
        ["Crack test load × Lf / FoS", R(st[0] * Lf / FSc, 2), "kN/m"], ["Ultimate test load × Lf / FoS", R(st[1] * Lf / FSu, 2), "kN/m"]], ["Item", "Value", "Unit"]) },
      references: IRC_REFS.concat(["IS 458:2003 – Precast concrete pipes", "IS 783 – Laying of concrete pipes"]) });
  }
  M.run_pipe = run_pipe;

  var PIPE_PARAMS = [
    P("q_mode", "Discharge", "From catchment", { kind: "select", options: ["From catchment", "Given"], group: "Hydrology" }),
    P("C", "Runoff coefficient C", 0.5, { min: 0.1, max: 0.95, step: 0.05, group: "Hydrology" }),
    P("intensity", "Rainfall intensity (for Tc)", 75.0, "mm/hr", { min: 10, max: 300, group: "Hydrology" }),
    P("area_ha", "Catchment area", 12.0, "ha", { min: 0.1, max: 5000, group: "Hydrology" }),
    P("Q", "Design discharge (if given)", 1.0, "m³/s", { min: 0.01, max: 100, group: "Hydrology" }),
    P("slope", "Bed slope of pipe", 0.5, "%", { min: 0.1, max: 5, step: 0.05, group: "Hydraulics" }),
    P("max_rows", "Max. rows of pipes", 3, { kind: "int", min: 1, max: 6, group: "Hydraulics" }),
    P("cushion", "Earth cushion over pipe", 0.9, "m", { min: 0, max: 8, step: 0.1, group: "Road" }),
    P("road_width", "Formation width of road", 12.0, "m", { min: 4, max: 60, step: 0.5, group: "Road" }),
    P("gamma", "Soil unit weight", 18.0, "kN/m³", { min: 15, max: 22, group: "Road" })
  ].concat(_ll_params("IRC Class A")).concat([
    P("pipe_class", "Pipe class (IS 458)", "Auto", { kind: "select", options: ["Auto", "NP3", "NP4"], group: "Structural" }),
    P("bedding", "Bedding", BEDDINGS[1][0], { kind: "select", options: BEDDINGS.map(function (b) { return b[0]; }), group: "Structural",
      help: "Design mode upgrades the bedding (cradle → encasement) when needed." }),
    P("dia", "Pipe dia (check)", 1200, { kind: "select", options: PIPES.map(function (p) { return p[0]; }), group: "My design", modes: ["check"] }),
    P("rows", "Rows of pipes (check)", 2, { kind: "int", min: 1, max: 6, group: "My design", modes: ["check"] })
  ]);
  M.PIPE_PARAMS = PIPE_PARAMS;
  C.register({ id: "pipe_culvert", phase: 3, category: "Drains, culverts & roads", name: "Hume pipe culvert", icon: "⭕",
    description: "Rational runoff, Manning capacity, number of pipe rows; NP3 / NP4 strength check (IS 458 three-edge bearing × " +
      "bedding factor) for fill + IRC / railway / mine-dumper live load; cushion, cradle / encasement, headwall & apron quantities.",
    params: PIPE_PARAMS, run: run_pipe, references: IRC_REFS, modes: ["design", "check"] });

  /* =========================================================================== RETAINING WALL */
  function tb_guess(H) { return Math.max(0.3, H / 12); }
  M.tb_guess = tb_guess;

  function run_retaining(inp, mode) {
    var rcc = RC(), CMN = CMN_(), D_ = DR();
    var c = new C.Calc("Cantilever retaining wall");
    var H = num(inp.height);                       // retained height above top of base
    var gam = num(inp.gamma), phi = num(inp.phi), q = num(inp.surcharge);
    var beta = num(inp.backfill_slope);
    var mu = num(inp.mu);
    var sbc = num(inp.sbc);
    var fck = num(inp.fck), fy = num(inp.fy);
    var cover = num(inp.cover);
    var Df = num(inp.df);
    var Ka = rcc.ka_rankine(phi, beta);
    // drainage behind the wall: weep holes + filter (drained) or water pressure (undrained / partly drained)
    var drain = String(inp.drainage || "Weep holes + filter media (drained backfill)");
    var drained = drain.indexOf("Weep") === 0;
    var gw = 9.81, hw = drained ? 0 : Math.min(num(inp.hw == null ? H : inp.hw), H);
    var DT = DS.detailing;                          // bar-size rules (detailing.js)
    var rad = function (d) { return d * (Math.PI / 180); };
    c.section("Earth pressure");
    c.calc("Active pressure coefficient (Rankine)", "Ka",
      "cos(radians(b))*(cos(radians(b)) - sqrt(cos(radians(b))**2 - cos(radians(p))**2))/" +
      "(cos(radians(b)) + sqrt(cos(radians(b))**2 - cos(radians(p))**2))", "", "Rankine / IS 456 practice",
      { b: beta, p: phi });
    if (beta > 0) c.ok("Backfill slope β < φ (Rankine active state exists)", beta < phi, { detail: "β = " + G(beta) + "°, φ = " + G(phi) + "°" +
      (beta < phi ? "" : " – slope steeper than φ is not stable; Ka is undefined. Flatten the backfill slope or provide a slope-stability design"),
      clause: "Rankine / IS 456 practice" });
    var B, toe, tb, ts_bot, ts_top, key_given;
    if (mode === "check") {
      B = num(inp.B); toe = num(inp.toe); tb = num(inp.t_base); ts_bot = num(inp.t_stem); ts_top = num(inp.t_top);
      key_given = num(inp.key);
    } else {
      ts_top = 0.20;
      tb = Math.max(0.30, ceil_to((H + tb_guess(H)) / 12, 0.05));
      ts_bot = Math.max(0.25, ceil_to((H + tb) / 12, 0.025));
      B = ceil_to(0.5 * (H + tb), 0.1);
      toe = ceil_to(B / 3, 0.05);
      if (mode === "thumb") c.info("Thumb-rule proportions", "B ≈ 0.5–0.6 H, toe ≈ B/3, stem & base ≈ H/12", "Krishna Raju / Punmia");
    }

    function stability(B, toe, tb, ts_bot) {
      var Ht = H + tb;
      var heel = B - toe - ts_bot;
      var Pa = 0.5 * Ka * gam * Ht * Ht * Math.cos(rad(beta));
      var Pq = Ka * q * Ht;
      var Mo_e = Pa * Ht / 3;
      var Mo_q = Pq * Ht / 2;
      var W1 = 25 * ts_top * H;
      var W2 = 25 * 0.5 * (ts_bot - ts_top) * H;
      var W3 = 25 * B * tb;
      var W4 = gam * heel * H + gam * heel * heel * Math.tan(rad(beta)) / 2;
      var Wq = q * heel;
      var x1 = toe + ts_bot - ts_top / 2;
      var x2 = toe + (ts_bot - ts_top) * 2 / 3;
      var x3 = B / 2;
      var x4 = toe + ts_bot + heel / 2;
      var Wsum = W1 + W2 + W3 + W4;
      var Mr = W1 * x1 + W2 * x2 + W3 * x3 + W4 * x4;
      var Mrq = Wq * x4;
      var H_ = Pa + Pq;
      var e = B / 2 - (Mr + Mrq - Mo_e - Mo_q) / (Wsum + Wq);
      var V = Wsum + Wq;
      var pmax = V / B * (1 + 6 * e / B);
      var pmin = V / B * (1 - 6 * e / B);
      // water behind the wall (undrained): hydrostatic thrust on height hw + tb, buoyancy of soil below water, uplift under base
      var hwt = hw > 0 ? hw + tb : 0;
      var Pw = 0.5 * gw * hwt * hwt, Mo_w = Pw * hwt / 3;
      var dPa_b = hw > 0 ? -0.5 * Ka * gw * hwt * hwt * Math.cos(rad(beta)) : 0;      // submerged soil (γ − γw) below water
      var U = hw > 0 ? 0.5 * gw * hwt * B : 0, xU = 2 * B / 3;                         // triangular uplift, max at heel
      if (hw > 0) {
        Pa += dPa_b; Mo_e += dPa_b * hwt / 3;
        H_ = Pa + Pq + Pw; Mo_e += Mo_w;
        Wsum -= U; Mr -= U * xU;
        V = Wsum + Wq; e = B / 2 - (Mr + Mrq - Mo_e - Mo_q) / V;
      }
      // e > 0: resultant towards the toe; e < 0: towards the heel.  p = V/B (1 ± 6e/B) with the sign of e
      var p_toe = V / B * (1 + 6 * e / B), p_heel = V / B * (1 - 6 * e / B);
      pmax = Math.max(p_toe, p_heel); pmin = Math.min(p_toe, p_heel);
      var c0 = 0, c1 = B, pAt, nt = false;
      if (Math.abs(e) <= B / 6 + 1e-12) pAt = function (x) { return p_toe + (p_heel - p_toe) * x / B; };
      else {                               // resultant outside the middle third: no tension, triangular over 3a
        nt = true;
        var a3 = 3 * Math.max(B / 2 - Math.abs(e), 1e-3), pk = 2 * V / a3;
        pmax = pk;
        if (e > 0) { c1 = Math.min(a3, B); pAt = function (x) { return Math.max(0, pk * (1 - x / a3)); }; }
        else { c0 = Math.max(B - a3, 0); pAt = function (x) { return Math.max(0, pk * (1 - (B - x) / a3)); }; }
      }
      var ov = 0.9 * Mr >= 1.2 * Mo_e + 1.4 * Mo_q;
      var fos = Mr / Math.max(Mo_e + Mo_q, 1e-9);
      var sl = 0.9 * mu * Wsum >= 1.4 * H_;
      return { Pa: Pa, Pq: Pq, Pw: Pw, U: U, Mo_e: Mo_e, Mo_q: Mo_q, W: [W1, W2, W3, W4, Wq], x: [x1, x2, x3, x4],
        Mr: Mr, Mrq: Mrq, V: V, Wsum: Wsum, H: H_, e: e, pmax: pmax, pmin: pmin, p_toe: p_toe, p_heel: p_heel, nt: nt,
        pAt: pAt, c0: c0, c1: c1, ov: ov, fos: fos, sl: sl, heel: heel, Ht: Ht, B: B, toe: toe };
    }
    var FOS_OT = 2.0;                      // IRC 78 cl 706.3.4 / practice (classical FoS against overturning)
    /* upward soil reaction on [x1, x2] (x from the toe): resultant R and its position xc, from the pressure diagram */
    function soil_seg(s, x1, x2) {
      var a = Math.max(x1, s.c0), b = Math.min(x2, s.c1);
      if (b <= a + 1e-9) return { R: 0, xc: (x1 + x2) / 2, pa: 0, pb: 0, L: 0, a: x1 };
      var pa = s.pAt(a), pb = s.pAt(b), L = b - a, Rr = (pa + pb) / 2 * L;
      return { R: Rr, xc: pa + pb > 0 ? a + L * (pa + 2 * pb) / (3 * (pa + pb)) : (a + b) / 2, pa: pa, pb: pb, L: L, a: a };
    }

    // structural design (factored 1.5) – thicken base / stem until every strength check passes
    function structural(cc, tb, ts_bot, s) {
      var res = {};
      cc.section("Stem");
      var hs = H;
      var Mstem = hw > 0
        ? cc.calc("Stem moment at base (factored, incl. water pressure)", "Mu",
          "1.5*(Ka*gam*h**3/6*cos(radians(b)) - Ka*gw*hw**3/6 + gw*hw**3/6 + Ka*q*h**2/2)", "kN·m/m",
          "no drainage → full hydrostatic pressure", { Ka: R(Ka, 4), gam: gam, h: hs, b: beta, q: q, gw: gw, hw: hw })
        : cc.calc("Stem moment at base (factored)", "Mu", "1.5*(Ka*gam*h**3/6*cos(radians(b)) + Ka*q*h**2/2)",
          "kN·m/m", "", { Ka: R(Ka, 4), gam: gam, h: hs, b: beta, q: q });
      var Vstem = 1.5 * (0.5 * Ka * gam * hs * hs + Ka * q * hs + (hw > 0 ? 0.5 * (1 - Ka) * gw * hw * hw : 0));
      var given = mode === "check" ? [num(inp.stem_dia), num(inp.stem_s)] : null;
      res.stem = rcc.design_strip(cc, Mstem, ts_bot * 1000, cover, fck, fy, "stem, earth face", { given: given,
        dia_pref: [12, 16, 20, 25], rule: DT ? { member: "retaining", role: "main" } : null });
      rcc.shear(cc, Vstem, 1000, res.stem.d, 100 * res.stem.Ast_prov / (1000 * res.stem.d), fck,
        fy, "slab", { D: ts_bot * 1000, tag: "(stem)" });
      rcc.development_length(cc, res.stem.dia, fy, fck, { tag: "(stem bars into base)" });
      // curtailment: Mu(y) at depth y below the top = 1.5·(Ka·γ·y³/6·cosβ + Ka·q·y²/2 [+ (1 − Ka)·γw·yw³/6]) – surcharge included;
      // half the bars stop where Mu(y) = Mu,base/2, but no lower than where the half bars (tapered stem, smaller d) still suffice
      var cb = Math.cos(rad(beta));
      var Mfun = function (y) { var yw = hw > 0 ? Math.max(0, y - (H - hw)) : 0;
        return 1.5 * (Ka * gam * y * y * y / 6 * cb + Ka * q * y * y / 2 + (1 - Ka) * gw * yw * yw * yw / 6); };
      var Mb = Mfun(hs), Ah = res.stem.Ast_prov / 2, sdia = res.stem.dia;
      var dAt = function (y) { return (ts_top + (ts_bot - ts_top) * y / hs) * 1000 - cover - sdia / 2; };
      var Mrh = function (y) { var d_ = dAt(y); return 0.87 * fy * Ah * d_ * (1 - Ah * fy / (1000 * d_ * fck)) / 1e6; };
      var bis = function (f) { var lo = 0, hi = hs; if (f(hi) >= 0) return hs; for (var i = 0; i < 60; i++) { var md = (lo + hi) / 2; if (f(md) >= 0) lo = md; else hi = md; } return lo; };
      var y1 = bis(function (y) { return Mb / 2 - Mfun(y); }), y2 = bis(function (y) { return Mrh(y) - Mfun(y); });
      cc.calc("Curtailment: Mu at depth y1 where Mu(y1) = Mu,base/2 (y1 by bisection, surcharge included)", "Mu(y1)",
        hw > 0 ? "1.5*(Ka*gam*y**3/6*cos(radians(b)) + Ka*q*y**2/2 + (1 - Ka)*gw*max(y - (h - hw), 0)**3/6)" : "1.5*(Ka*gam*y**3/6*cos(radians(b)) + Ka*q*y**2/2)",
        "kN·m/m", "IS 456 cl 26.2.3.1", "Mu,base/2 = " + F(Mb / 2, ".2f") + " kN·m/m; y1 = " + F(y1, ".3f") + " m below top",
        hw > 0 ? { Ka: R(Ka, 4), gam: gam, y: R(y1, 4), b: beta, q: q, gw: gw, h: hs, hw: hw } : { Ka: R(Ka, 4), gam: gam, y: R(y1, 4), b: beta, q: q });
      cc.calc("Moment capacity of half the bars at y1 (tapered stem)", "Mu,½", "0.87*fy*As*d*(1 - As*fy/(1000*d*fck))/1e6", "kN·m/m",
        "IS 456 Annex G-1.1(b)", { fy: fy, As: R(Ah, 1), d: R(dAt(y1), 1), fck: fck });
      var ycut = Math.min(y1, y2);
      if (y2 < y1 - 1e-6) cc.let("Depth where the half bars just suffice (tapered stem governs)", "y2", R(y2, 3), "m", "IS 456 cl 26.2.3.1",
        "Mu,½(y2) = Mu(y2) = " + F(Mfun(y2), ".2f") + " kN·m/m");
      res.hc = cc.calc("Curtailment: half the bars stopped at height", "hc", "h - y", "m",
        "IS 456 cl 26.2.3.1 (+ Ld beyond)", "y = min(y1, y2) below the top", { h: hs, y: R(ycut, 4) });
      cc.section("Heel slab");
      var hl = s.heel, xs = toe + ts_bot;
      var w_down = gam * H + 25 * tb + q;
      var hu = soil_seg(s, xs, B);
      var Rh = cc.calc("Soil reaction under heel (service, p at stem face → heel end)", "Rh", "(pa + pb)/2*L", "kN/m", "IS 456 cl 20 / linear pressure",
        { pa: R(hu.pa, 2), pb: R(hu.pb, 2), L: R(hu.L, 3) });
      var xrh = hu.R > 0 ? cc.calc("Lever of Rh from stem face", "xr", "a0 + L*(pa + 2*pb)/(3*(pa + pb))", "m", "trapezoid centroid",
        { a0: R(hu.a - xs, 3), L: R(hu.L, 3), pa: R(hu.pa, 2), pb: R(hu.pb, 2) }) : 0;
      var Mheel = cc.calc("Heel moment at stem face (factored)", "Mu",
        "1.5*(wd*hl**2/2 - Rh*xr)", "kN·m/m", "",
        { wd: R(w_down, 2), hl: R(hl, 3), Rh: R(Rh, 3), xr: R(xrh, 4) });
      given = mode === "check" ? [num(inp.heel_dia), num(inp.heel_s)] : null;
      var base_rule = DT ? { member: "retaining", role: "main", stem_dia: res.stem.dia, prefer: [res.stem.dia] } : null;
      res.heel = rcc.design_strip(cc, Math.max(Mheel, 0.01), tb * 1000, cover, fck, fy, "heel, top face", { given: given,
        rule: base_rule });
      var dh = res.heel.d / 1000, hd = soil_seg(s, xs + dh, B);
      var Rhd = cc.calc("Soil reaction under heel beyond d from stem face", "Rd", "(pa + pb)/2*L", "kN/m", "",
        { pa: R(hd.pa, 2), pb: R(hd.pb, 2), L: R(hd.L, 3) });
      var Vh = cc.calc("Heel shear at d from stem face (factored)", "Vu",
        "1.5*max(wd*(hl - d) - Rd, 0)", "kN/m", "IS 456 cl 22.6.2.1",
        { wd: R(w_down, 2), hl: R(hl, 3), d: R(dh, 3), Rd: R(Rhd, 3) });
      rcc.shear(cc, Vh, 1000, res.heel.d, 100 * res.heel.Ast_prov / (1000 * res.heel.d), fck, fy,
        "slab", { D: tb * 1000, tag: "(heel)" });
      cc.section("Toe slab");
      var tu = soil_seg(s, 0, toe);
      var Rt = cc.calc("Soil reaction under toe (service, p at toe → stem face)", "Rt", "(pa + pb)/2*L", "kN/m", "IS 456 cl 20 / linear pressure",
        { pa: R(tu.pa, 2), pb: R(tu.pb, 2), L: R(tu.L, 3) });
      var xrt = tu.R > 0 ? cc.calc("Lever of Rt from stem face", "xr", "t - xc", "m", "trapezoid centroid", { t: toe, xc: R(tu.xc, 4) }) : 0;
      var Mtoe = cc.calc("Toe moment at stem face (factored)", "Mu",
        "1.5*(Rt*xr - 25*tb*t**2/2)", "kN·m/m", "", { Rt: R(Rt, 3), xr: R(xrt, 4), t: toe, tb: tb });
      given = mode === "check" ? [num(inp.toe_dia), num(inp.toe_s)] : null;
      res.toe = rcc.design_strip(cc, Math.max(Mtoe, 0.01), tb * 1000, cover, fck, fy, "toe, bottom face", { given: given,
        rule: base_rule ? Object.assign({}, base_rule, { prefer: [res.stem.dia, res.heel.dia] }) : null });
      var dtq = res.toe.d / 1000, Lt_ = Math.max(toe - dtq, 0), td = soil_seg(s, 0, Lt_);
      var Rtd = cc.calc("Soil reaction under toe beyond d from stem face", "Rd", "(pa + pb)/2*L", "kN/m", "",
        { pa: R(td.pa, 2), pb: R(td.pb, 2), L: R(td.L, 3) });
      var Vt = cc.calc("Toe shear at d from stem face (factored)", "Vu", "1.5*max(Rd - 25*tb*(t - d), 0)", "kN/m", "IS 456 cl 22.6.2.1",
        { Rd: R(Rtd, 3), tb: tb, t: toe, d: R(Math.min(dtq, toe), 3) });
      rcc.shear(cc, Vt, 1000, res.toe.d, 100 * res.toe.Ast_prov / (1000 * res.toe.d), fck, fy,
        "slab", { D: tb * 1000, tag: "(toe)" });
      return res;
    }

    var key = mode === "check" ? key_given : 0.0;
    var s, Kp, Pp, rt = 1 / 3;
    var Bmax = function () { return Math.max(2.0, 1.5 * (H + tb)); };   // B ≈ 0.5–0.7 (H + tb) in practice; beyond 1.5× stop growing
    if (mode !== "check") {
      for (var _outer = 0; _outer < 60; _outer++) {
        // smallest B (0.1 m steps) that passes overturning (IS 456 cl 20.1 and FoS ≥ 2), max pressure ≤ SBC and no tension.
        // At each B the toe is B/3; if the resultant lies towards the heel (e < 0) the TOE is lengthened at the same B (stem moves
        // back, heel shortens → less soil behind the stem → resultant moves to the centre) before the base is widened.
        var trial = function (Bt, r) { var tt = ceil_to(Bt * r, 0.05); if (Bt - tt - ts_bot < 0.3 - 1e-9) return null;
          var st = stability(Bt, tt, tb, ts_bot); return { toe: tt, r: r, ok: st.ov && st.fos >= FOS_OT && st.pmax <= sbc && st.pmin >= 0, e: st.e }; };
        for (var _ = 0; _ < 400; _++) {
          var t0 = trial(B, rt) || trial(B, 1 / 3), hit = t0 && t0.ok ? t0 : null;
          if (!hit && t0 && t0.e < 0) for (var rr = Math.max(rt, 1 / 3) + 0.025; rr <= 0.65 + 1e-9 && !hit; rr += 0.025) { var t1 = trial(B, rr); if (t1 && t1.ok) hit = t1; }
          if (hit) { toe = hit.toe; rt = hit.r; break; }
          if (B >= Bmax()) { toe = ceil_to(B * rt, 0.05); break; }      // no practical base – reported as FAIL below
          B = R(B + 0.1, 2);
        }
        if (B - toe - ts_bot < 0.3 - 1e-9) toe = ceil_to(B / 3, 0.05);
        s = stability(B, toe, tb, ts_bot);
        key = 0.0;
        if (!s.sl && /^No shear key/.test(String(inp.rw_key || ""))) {
          if (B < Bmax()) { B = R(B + 0.1, 2); toe = ceil_to(B * rt, 0.05); continue; }
        } else if (!s.sl) {
          // shear key below the stem: passive resistance Kp γ ((Df+hk)² − Df²) / 2
          Kp = 1 / rcc.ka_rankine(phi);
          key = 1.5;
          for (var xk = 4; xk < 31; xk++) {
            var k_ = xk / 20;
            Pp = 0.5 * Kp * gam * (Math.pow(Df + k_, 2) - Df * Df);
            if (0.9 * (mu * s.Wsum + Pp) >= 1.4 * s.H) { key = k_; break; }
          }
          // even a 1.5 m key is not enough: widen the base (more weight on the heel) and repeat
          if (key === 1.5 && 0.9 * (mu * s.Wsum + 0.5 * Kp * gam * (Math.pow(Df + 1.5, 2) - Df * Df)) < 1.4 * s.H && B < Bmax()) {
            B = R(B + 0.1, 2); toe = ceil_to(B * rt, 0.05); continue;
          }
        }
        var sc = new C.Calc("s");
        structural(sc, tb, ts_bot, s);
        var fails = sc.failures.map(function (x) { return x.label; });
        if (!fails.length) break;
        if (fails.some(function (f) { return f.indexOf("stem") >= 0; })) ts_bot = R(ts_bot + 0.025, 3);
        if (fails.some(function (f) { return f.indexOf("heel") >= 0 || f.indexOf("toe") >= 0; })) tb = R(tb + 0.05, 3);
      }
    }
    s = stability(B, toe, tb, ts_bot);
    c.section("Proportions");
    if (mode !== "check" && B >= Bmax() - 1e-9)
      c.warn("Base width limit reached", "No base width up to 1.5 (H + tb) = " + F(Bmax(), ".2f") + " m satisfies the bearing / stability checks – " +
        "the SBC is too low for this height (soil under the heel alone ≈ γH + q = " + F(gam * H + q, ".0f") + " kN/m²): improve the ground, " +
        "use a counterfort / piled wall or reduce the retained height", "IS 456 cl 20 / IS 1904");
    c.let("Retained height above base", "H", H, "m");
    c.let("Base width", "B", B, "m");
    c.let("Toe projection", "toe", toe, "m");
    c.let("Heel projection", "heel", R(s.heel, 3), "m");
    c.let("Base thickness", "tb", tb, "m");
    c.let("Stem thickness top / bottom", "ts", F(ts_top, ".3f") + " / " + F(ts_bot, ".3f"), "m");
    c.section("Forces per metre (service)");
    c.calc("Earth thrust", "Pa", "0.5*Ka*gam*Ht**2*cos(radians(b))", "kN", "", { Ka: R(Ka, 4), gam: gam,
      Ht: s.Ht, b: beta });
    c.calc("Surcharge thrust", "Pq", "Ka*q*Ht", "kN", "", { Ka: R(Ka, 4), q: q, Ht: s.Ht });
    c.section("Drainage behind wall");
    c.let("Drainage arrangement", "", drain, "", "IS 456 cl 20 / IRC 78 practice");
    var wd = num(inp.weep_dia == null ? 100 : inp.weep_dia), wsh = Math.max(num(inp.weep_sh == null ? 1.5 : inp.weep_sh), 0.1),
      wsv = Math.max(num(inp.weep_sv == null ? 1.0 : inp.weep_sv), 0.1), wf = num(inp.filter_t == null ? 300 : inp.filter_t);
    var h0 = Math.max(0.15, Df - tb + 0.15);                                   // lowest row ≥ 150 mm above lower ground
    var rows = drained ? Math.max(1, Math.floor(Math.max(H - h0 - 0.3, 0) / wsv) + 1) : 0;
    var perRow = drained ? Math.floor(num(inp.length) / wsh) + 1 : 0;
    if (drained) {
      c.let("Weep holes", "", G(wd) + " mm PVC @ " + F(wsh, ".2f") + " m c/c horizontally, " + rows + " row(s) @ " + F(wsv, ".2f") +
        " m vertically, lowest row " + F(h0, ".2f") + " m above base top (≥ 150 mm above lower ground), slope 1 in 20 outward", "",
        "IRC 78 / practice");
      c.calc("Number of weep holes", "nw", "rows*per_row", "nos", "", { rows: rows, per_row: perRow });
      c.ok("Weep hole diameter ≥ 75 mm", wd >= 75, { detail: G(wd) + " mm", clause: "practice (75–100 mm; 150 mm for coarse backfill)" });
      c.ok("Weep hole spacing ≤ 1.5 m horizontally", wsh <= 1.5 + 1e-9, { detail: F(wsh, ".2f") + " m", clause: "IRC 78 / practice",
        warn_only: wsh <= 2.0 });
      c.ok("Weep hole rows ≤ 1.5 m apart vertically", wsv <= 1.5 + 1e-9, { detail: F(wsv, ".2f") + " m", clause: "practice", warn_only: true });
      c.ok("Filter media behind weep holes ≥ 300 mm", wf >= 300 - 1e-9, { detail: G(wf) + " mm graded filter / geotextile wrap",
        clause: "IRC 78 / MoRTH 2504", warn_only: wf >= 200 });
      c.info("Design assumption", "Backfill drained – no water pressure on the wall. Keep weep holes clear; provide a drain / channel at the toe.");
    } else {
      c.calc("Water pressure thrust (height incl. base)", "Pw", "0.5*gw*(hw + tb)**2", "kN", "no weep holes / drainage",
        { gw: gw, hw: hw, tb: tb });
      c.calc("Uplift under base", "U", "0.5*gw*(hw + tb)*B", "kN", "triangular, max at heel", { gw: gw, hw: hw, tb: tb, B: B });
      c.warn("No drainage", "Water pressure + uplift included — the wall is heavier. Providing weep holes with filter media normally saves 20–40 % concrete & steel.", "IS 456 cl 20");
    }
    c.let("Weights (stem rect., stem tri., base, soil on heel, surcharge)", "W",
      s.W.map(function (w) { return F(w, ".1f"); }).join(", "), "kN");
    c.section("Stability (IS 456 cl 20)");
    c.check("Overturning: 0.9 Mr ≥ 1.2 Mo(earth" + (hw > 0 ? " + water" : "") + ") + 1.4 Mo(surcharge)", 1.2 * s.Mo_e + 1.4 * s.Mo_q,
      0.9 * s.Mr, { unit: "kN·m", clause: "IS 456 cl 20.1" });
    var fosv = c.calc("Classical FOS against overturning (surcharge on heel ignored in Mr)", "FOSo", "Mr/(Mo1 + Mo2)", "", "IRC 78 cl 706.3.4 / IS 1904 practice",
      { Mr: R(s.Mr, 2), Mo1: R(s.Mo_e, 2), Mo2: R(s.Mo_q, 2) });
    c.check("Overturning FOS ≥ " + F(FOS_OT, ".1f"), fosv, FOS_OT, { mode: ">=", clause: "IRC 78 cl 706.3.4 (service loads) / IS 1904 practice",
      note: fosv < FOS_OT ? "widen the base / lengthen the heel" : "" });
    if (key) {
      Kp = 1 / rcc.ka_rankine(phi);
      Pp = 0.5 * Kp * gam * (Math.pow(Df + key, 2) - Df * Df);
      c.let("Shear key below stem", "hk", key, "m", "", "passive resistance " + F(Pp, ".1f") + " kN");
      c.check("Sliding with shear key: 1.4 H ≤ 0.9 (μW + Pp)", 1.4 * s.H, 0.9 * (mu * s.Wsum + Pp), { unit: "kN",
        clause: "IS 456 cl 20.2" });
    } else {
      c.check("Sliding: 1.4 H ≤ 0.9 μ W", 1.4 * s.H, 0.9 * mu * s.Wsum, { unit: "kN", clause: "IS 456 cl 20.2" });
    }
    c.section("Base pressure");
    c.calc("Total vertical load (incl. surcharge on heel" + (hw > 0 ? ", less uplift" : "") + ")", "V", "Wsum + Wq", "kN/m", "", { Wsum: R(s.Wsum, 3), Wq: R(s.W[4], 3) });
    var ecal = c.calc("Eccentricity of resultant (+ towards toe, − towards heel)", "e", "B/2 - (Mr + Mrq - Mo)/V", "m", "x from toe",
      { B: B, Mr: R(s.Mr, 3), Mrq: R(s.Mrq, 3), Mo: R(s.Mo_e + s.Mo_q, 3), V: R(s.V, 3) });
    c.calc("Base pressure at toe", "p_toe", "V/B*(1 + 6*e/B)", "kN/m²", "IS 456 cl 20 / IS 1904 (linear)", { V: R(s.V, 3), B: B, e: R(ecal, 4) });
    c.calc("Base pressure at heel", "p_heel", "V/B*(1 - 6*e/B)", "kN/m²", "IS 456 cl 20 / IS 1904 (linear)", { V: R(s.V, 3), B: B, e: R(ecal, 4) });
    if (s.nt) c.calc("Resultant outside middle third – peak pressure, no tension (contact 3a)", "pmax", "2*V/(3*(B/2 - abs(e)))", "kN/m²", "IS 1904 (no-tension redistribution)",
      { V: R(s.V, 3), B: B, e: R(ecal, 4) });
    c.check("Max. base pressure (" + (s.e >= 0 ? "toe" : "heel") + ") ≤ SBC", s.pmax, sbc, { unit: "kN/m²", clause: "IS 1904 / IS 6403",
      note: s.pmax > sbc ? "widen the base" + (s.e < 0 ? " / lengthen the toe (resultant is towards the heel)" : "") : "" });
    c.ok("No tension under base (pmin ≥ 0, e ≤ B/6)", s.pmin >= -1e-6, { detail: "p_toe = " + F(s.p_toe, ".1f") + ", p_heel = " + F(s.p_heel, ".1f") + " kN/m²; |e| = " +
      F(Math.abs(s.e), ".3f") + " vs B/6 = " + F(B / 6, ".3f") + " m", clause: "IS 1904 / practice (e ≤ B/6)" });

    var res = structural(c, tb, ts_bot, s);
    var hc = res.hc;
    var dist = rcc.slab_bars(0.0012 * 1000 * ts_bot * 1000 / 2, ts_bot * 1000 - 50, ts_bot * 1000, false,
      DT ? { dias: [8, 10, 12], rule: { member: "retaining", role: "dist", main_dia: res.stem.dia } } : { dias: [8, 10, 12] });
    if (DT) { DT.record(c, "distribution / temperature bars", dist); DT.site_checks(c, "retaining", fck, cover); }
    c.let("Distribution / temperature bars (each face)", "", G(dist.dia) + "Ø @ " + G(dist.spacing) + " c/c", "",
      "IS 456 cl 26.5.2.1");
    // exposed (front) face of the stem: nominal vertical bars – IS 456 cl 32.5(a) min 0.12 % of gross area, two layers for t > 200 mm;
    // the distribution-bar set (sized for 0.12 %/2 per face) is used, spacing ≤ min(3t, 450) (cl 32.5(b))
    c.calc("Front-face vertical steel (nominal, per face)", "As,f", "0.0012*1000*t/2", "mm²/m", "IS 456 cl 32.5(a)", { t: R(ts_bot * 1000) });
    c.let("Front-face vertical bars (nominal)", "", G(dist.dia) + "Ø @ " + G(dist.spacing) + " c/c", "", "IS 456 cl 32.5",
      "As = " + F(1000 * DS.materials.bar_area(dist.dia) / dist.spacing, ".0f") + " mm²/m; L-bars with leg into the toe");
    var keyb = null;
    if (key > 0) {
      // shear key below the stem: cantilever down from the base, loaded by the passive pressure on its front face
      var Kpk = 1 / rcc.ka_rankine(phi), pk1 = Kpk * gam * Df, pk2 = Kpk * gam * (Df + key);
      var Ppk = c.calc("Passive force on shear key", "Pk", "Kp*gam*((Df + hk)**2 - Df**2)/2", "kN/m", "Rankine passive", { Kp: R(Kpk, 3), gam: gam, Df: Df, hk: key });
      var Mk = c.calc("Shear key moment at root (factored)", "Mu,k", "1.5*Pk*hk*(p1 + 2*p2)/(3*(p1 + p2))", "kN·m/m", "IS 456 cl 18.2 (γf 1.5)",
        { Pk: R(Ppk, 3), hk: key, p1: R(pk1, 2), p2: R(pk2, 2) });
      var kd = ts_bot * 1000 - cover - res.stem.dia / 2, kAs = 1000 * DS.materials.bar_area(res.stem.dia) / res.stem.spacing;
      var kreq = Math.max(_as_req(Mk, kd, fck, fy), 0.0012 * 1000 * ts_bot * 1000 / 2);
      c.check("Shear key steel (stem bars " + G(res.stem.dia) + "Ø @ " + G(res.stem.spacing) + " each face) ≥ required", kAs, kreq,
        { unit: "mm²/m", mode: ">=", clause: "IS 456 Annex G-1.1(b) / cl 26.5.2.1", note: kAs < kreq ? "deepen / thicken the key or use closer bars" : "" });
      keyb = { dia: res.stem.dia, spacing: res.stem.spacing };
    }
    c.thumb("Base width", 0.55 * (H + tb), B, "m", "0.5–0.6 × total height", "Punmia");
    c.thumb("Stem thickness at base", (H + tb) / 12 * 1000, ts_bot * 1000, "mm", "H / 12", "Punmia");
    if (!drained) c.miss("No weep holes: check water-table level behind the wall and long-term clogging; consider weep holes + filter to reduce pressure", "IS 456 cl 20", "Important");
    c.miss("Seismic earth pressure (Mononobe-Okabe) for zone III and above", "IS 1893-3", "Advisory");
    c.miss("Global (slip-circle) stability on slopes / soft soil", "IS 14458", "Advisory");

    var Lw = num(inp.length);
    // BBS (DS.bbs). Stem bars alternate: S1 full height, S2 curtailed – each at 2 × the design spacing (together = design steel).
    var BB = DS.bbs, sd = res.stem.dia, nst = BB.count(Lw * 1000, res.stem.spacing, 50), n1 = Math.ceil(nst / 2), n2 = nst - n1;
    var dst = ts_bot * 1000 - cover - sd / 2, legS = Math.max(BB.Ld(sd, fck, fy) - (tb * 1000 - 2 * cover), BB.leg(sd));
    var s1 = BB.lbar(sd, (H + tb) * 1000 - 2 * cover, legS);
    // curtailed bars stop at hc above the base (half moment, calc step "Curtailment") + Ld beyond (IS 456 cl 26.2.3)
    var s2 = BB.lbar(sd, tb * 1000 - cover + hc * 1000 + Math.max(BB.Ld(sd, fck, fy), 12 * sd, dst), legS);
    s2.f = s2.f.replace("L-bar:", "L-bar (base " + Math.round(tb * 1000 - cover) + " + hc " + Math.round(hc * 1000) + " + Ld " + Math.max(BB.Ld(sd, fck, fy), Math.round(12 * sd), Math.round(dst)) + "):");
    var bbs = [BB.row("Stem", "S1", sd, "L-bar into base", n1, s1, "earth face, full height – alternate bars of the " + G(res.stem.spacing) + " c/c set"),
    BB.row("Stem", "S2", sd, "L-bar into base (curtailed)", n2, s2, "earth face, curtailed – alternate bars of the " + G(res.stem.spacing) + " c/c set"),
    BB.row("Heel", "H1", res.heel.dia, "straight", BB.count(Lw * 1000, res.heel.spacing, 50), BB.straight(res.heel.dia, B * 1000 - 2 * cover), "top"),
    BB.row("Toe", "T1", res.toe.dia, "straight", BB.count(Lw * 1000, res.toe.spacing, 50), BB.straight(res.toe.dia, B * 1000 - 2 * cover), "bottom"),
    _dist_bbs("Stem (distribution)", "D1", dist.dia, dist.spacing, H, Lw, 2, fck, fy),
    _dist_bbs("Base (distribution)", "D2", dist.dia, dist.spacing, B, Lw, 2, fck, fy),
    BB.row("Stem", "F1", dist.dia, "L-bar into toe", BB.count(Lw * 1000, dist.spacing, 50),
      BB.lbar(dist.dia, (H + tb) * 1000 - 2 * cover, BB.leg(dist.dia, BB.cfg.wall_leg_min)), "front (exposed) face vertical, nominal @ " + G(dist.spacing) + " c/c – IS 456 cl 32.5")];
    if (keyb) {     // U around the key, both legs anchored Ld into the base above
      var kLd = BB.Ld(keyb.dia, fck, fy), okb = BB.ubar(keyb.dia, ts_bot * 1000 - 2 * cover, key * 1000 - cover + kLd);
      okb.f = okb.f.replace("U-bar:", "U-bar (legs = key " + Math.round(key * 1000 - cover) + " + Ld " + kLd + " into base):");
      bbs.push(BB.row("Shear key", "K1", keyb.dia, "U (around key, legs into base)", BB.count(Lw * 1000, keyb.spacing, 50), okb,
        "both faces of key @ " + G(keyb.spacing) + " c/c"));
    }
    var qty = [Q("Earth work in excavation for foundation", "cum", [row("Retaining wall", 1, Lw, B + 0.6, Df + 0.1)],
      [CMN.CPWD, "2.8.1"]),
    Q("PCC 1:4:8 below base", "cum", [row("Levelling", 1, Lw, B + 0.2, 0.1)], [CMN.CPWD, "4.1.8"]),
    Q("RCC M" + G(fck) + " in retaining wall (excl. steel & shuttering)", "cum",
      [row("Base", 1, Lw, B, tb), row("Stem (average thickness)", 1, Lw, (ts_top + ts_bot) / 2, H)].concat(
        key ? [row("Shear key", 1, Lw, ts_bot, key)] : []), null, CMN.rcc_rate(fck)),
    Q("Centering & shuttering for walls", "sqm", [row("Stem faces", 2, Lw, null, H), row("Base edges", 2, Lw, null, tb)],
      null, CMN.RATE.shutter_wall),
    _steel_qty(bbs, "Retaining wall"),
    ].concat(drained ? [Q("Filter media behind stem " + G(wf) + " mm", "cum", [row("Filter", 1, Lw, wf / 1000, H)], null, CMN.RATE.filter_media),
    Q("PVC weep holes " + G(wd) + " mm", "nos", [row("Weep holes " + rows + " row(s) × " + perRow + " nos", rows * perRow)],
      null, CMN.RATE.weep_hole)] : []).concat([
    Q("Backfilling behind wall in layers, compacted", "cum", [row("Backfill", 1, Lw, s.heel, H)],
      [CMN.CPWD, "2.25"])]);
    // drawing
    var v = new D_.View("Retaining wall – section");
    var Bm = B * 1000, tbm = tb * 1000, toem = toe * 1000, Hm = H * 1000;
    var tsb = ts_bot * 1000, tst = ts_top * 1000;
    v.poly([[0, 0], [Bm, 0], [Bm, tbm], [toem + tsb, tbm], [toem + tsb, tbm + Hm], [toem + tsb - tst, tbm + Hm],
      [toem, tbm], [0, tbm]], true, "OUTLINE", "concrete");
    if (key) v.rect(toem, -key * 1000, tsb, key * 1000, "OUTLINE", "concrete");
    v.poly([[toem + tsb, tbm + Hm], [Bm + 1500, tbm + Hm + 1500 * Math.tan(rad(beta))]], false, "SOIL");
    v.line(-800, Df * 1000 - 0 + 0, 0, Df * 1000, "SOIL");
    if (drained) {                                                     // weep holes (sloping pipes) + filter zone
      for (var wr = 0; wr < Math.min(rows, 6); wr++) {
        var yy = tbm + (h0 + wr * wsv) * 1000;
        var xin = toem + tsb - (tsb - tst) * ((yy - tbm) / Hm);
        v.line(toem - 20 + (tsb - tst) * 0 , yy - 30, xin + 30, yy, "STEEL");
      }
      v.rect(toem + tsb, tbm, wf, Hm * 0.95, "THIN");
      v.text(toem + tsb + wf + 80, tbm + Hm * 0.25, "Filter " + G(wf) + " mm", 2.0);
      v.text(toem - 80, tbm + h0 * 1000, "Weep holes " + G(wd) + "Ø @ " + F(wsh, ".1f") + " m c/c", 2.0, { anchor: "end" });
    } else v.text(toem + tsb + 200, tbm + hw * 1000, "▽ water (no drainage)", 2.0);
    var cv = cover;
    v.poly([[toem + tsb - cv, tbm + Hm - cv], [toem + tsb - cv, cv + 20], [Bm - cv, cv + 20]], false, "REBAR");
    v.line(cv, cv, Bm - cv, cv, "REBAR");
    v.line(toem + tsb, tbm - cv, Bm - cv, tbm - cv, "REBAR");
    v.text(Bm + 300, tbm + Hm / 2, "Stem " + G(res.stem.dia) + "Ø@" + G(res.stem.spacing) + " (alt. curtailed at " +
      F(hc, ".2f") + " m)", 2.2);
    v.text(Bm / 2, -500 - key * 1000, "Toe " + G(res.toe.dia) + "Ø@" + G(res.toe.spacing) + " bottom; heel " +
      G(res.heel.dia) + "Ø@" + G(res.heel.spacing) + " top", 2.2, { anchor: "middle" });
    v.text(Bm / 2, -800 - key * 1000, "Distribution bars " + G(dist.dia) + "Ø @ " + G(dist.spacing) + " c/c each face; front-face verticals " +
      G(dist.dia) + "Ø @ " + G(dist.spacing) + " c/c" + (keyb ? "; key U-bars " + G(keyb.dia) + "Ø @ " + G(keyb.spacing) : ""),
      2.2, { anchor: "middle" });
    v.dim(0, 0, Bm, 0, 10 + (key ? key * 1000 / 20 : 0));
    v.dim(Bm, 0, Bm, tbm + Hm, -10);
    v.dim(0, tbm, toem, tbm, -6);
    var sheet = new D_.Sheet("Cantilever retaining wall", "RW-01", [v],
      ["Concrete M" + G(fck) + ", steel Fe" + G(fy) + ", cover " + G(cover) + " mm.",
        "Backfill γ = " + G(gam) + " kN/m³, φ = " + G(phi) + "°, surcharge " + G(q) + " kN/m², SBC " + G(sbc) + " kN/m².",
        drained ? "Weep holes " + G(wd) + " mm PVC @ " + F(wsh, ".2f") + " m c/c × " + rows + " row(s) @ " + F(wsv, ".2f") + " m, sloping 1:20 outward, with " + G(wf) + " mm filter media / geotextile." : "No weep holes: designed for water pressure up to " + F(hw, ".2f") + " m and uplift.",
        "Expansion joints every 10–12 m with 20 mm filler board."]);
    var summary = { "Base": "B = " + F(B, ".2f") + " m (toe " + F(toe, ".2f") + ", heel " + F(s.heel, ".2f") + "), tb = " + F(tb * 1000, ".0f") + " mm",
      "Stem": F(ts_top * 1000, ".0f") + " → " + F(ts_bot * 1000, ".0f") + " mm, " + G(res.stem.dia) + "Ø@" + G(res.stem.spacing),
      "Base pressure": "toe " + F(s.p_toe, ".0f") + " / heel " + F(s.p_heel, ".0f") + " kN/m² (max " + F(s.pmax, ".0f") + ")",
      "Shear key": key ? F(key, ".2f") + " m" : "not required",
      "Drainage": drained ? rows * perRow + " weep holes " + G(wd) + " mm" : "none – water pressure " + F(hw, ".1f") + " m",
      "Max utilisation": F(c.max_utilisation, ".2f") };
    return C.DesignResult({ module: "retaining_wall", title: "Cantilever retaining wall", inputs: inp, calc: c, summary: summary,
      drawings: [sheet], quantities: qty, bbs: bbs, tables: {}, references: RCC_REFS });
  }
  M.run_retaining = run_retaining;

  var RW_PARAMS = [
    P("height", "Retained height above top of base", 4.0, "m", { min: 1, max: 8, step: 0.1, group: "Geometry" }),
    P("df", "Depth of base below lower ground", 1.0, "m", { min: 0.5, max: 3, step: 0.1, group: "Geometry" }),
    P("length", "Length of wall (quantity)", 30.0, "m", { min: 1, max: 2000, group: "Geometry" }),
    P("gamma", "Backfill unit weight", 18.0, "kN/m³", { min: 15, max: 22, group: "Soil" }),
    P("phi", "Backfill angle of friction", 30.0, "°", { min: 20, max: 40, group: "Soil" }),
    P("backfill_slope", "Backfill slope β", 0.0, "°", { min: 0, max: 25, group: "Soil" }),
    P("surcharge", "Surcharge on backfill", 10.0, "kN/m²", { min: 0, max: 50, group: "Soil" }),
    P("rw_key", "Shear key (design / thumb)", "Auto – shear key below the stem when sliding governs", { kind: "select", options: ["Auto – shear key below the stem when sliding governs", "No shear key – widen the base until sliding passes"], group: "Soil", modes: ["design", "thumb"] }),
    P("mu", "Base friction coefficient μ", 0.5, { min: 0.3, max: 0.7, step: 0.05, group: "Soil" }),
    P("sbc", "Safe bearing capacity", 200.0, "kN/m²", { min: 50, max: 600, group: "Soil" }),
    P("fck", "Concrete grade", 25.0, "N/mm²", { kind: "select", options: [20.0, 25.0, 30.0], group: "Materials" }),
    P("fy", "Steel fy", 500.0, "N/mm²", { kind: "select", options: [415.0, 500.0], group: "Materials" }),
    P("cover", "Clear cover", 50.0, "mm", { min: 40, max: 75, step: 5, group: "Materials" }),
    P("drainage", "Drainage behind wall", "Weep holes + filter media (drained backfill)", "", { kind: "select",
      options: ["Weep holes + filter media (drained backfill)", "No weep holes (water pressure behind wall)"], group: "Drainage / weep holes",
      help: "Weep holes relieve water pressure. Without them the wall is designed for hydrostatic pressure + uplift." }),
    P("weep_dia", "Weep hole dia", 100.0, "mm", { kind: "select", options: [75.0, 100.0, 150.0], group: "Drainage / weep holes" }),
    P("weep_sh", "Weep hole spacing – horizontal", 1.5, "m", { min: 0.5, max: 3, step: 0.25, group: "Drainage / weep holes" }),
    P("weep_sv", "Weep hole rows – vertical spacing", 1.0, "m", { min: 0.5, max: 3, step: 0.25, group: "Drainage / weep holes" }),
    P("filter_t", "Filter media thickness behind stem", 300.0, "mm", { min: 0, max: 600, step: 50, group: "Drainage / weep holes" }),
    P("hw", "Water level behind wall (if no weep holes), above base top", 4.0, "m", { min: 0, max: 8, step: 0.1, group: "Drainage / weep holes" }),
    P("B", "Base width (check)", 2.6, "m", { min: 1, max: 8, step: 0.1, group: "My design", modes: ["check"] }),
    P("toe", "Toe projection (check)", 0.8, "m", { min: 0, max: 4, step: 0.05, group: "My design", modes: ["check"] }),
    P("t_base", "Base thickness (check)", 0.40, "m", { min: 0.2, max: 1.2, step: 0.05, group: "My design", modes: ["check"] }),
    P("t_stem", "Stem thickness at base (check)", 0.375, "m", { min: 0.2, max: 1.2, step: 0.025, group: "My design", modes: ["check"] }),
    P("t_top", "Stem thickness at top (check)", 0.20, "m", { min: 0.15, max: 0.6, step: 0.025, group: "My design", modes: ["check"] }),
    P("key", "Shear key depth below base (check, 0 = none)", 0.6, "m", { min: 0, max: 2, step: 0.05,
      group: "My design", modes: ["check"] })
  ];
  ["stem", "heel", "toe"].forEach(function (m) {
    ["dia", "s"].forEach(function (k) {
      var isd = k === "dia";
      RW_PARAMS.push(P(m + "_" + k, m[0].toUpperCase() + m.slice(1) + " bar " + (isd ? "dia" : "spacing") + " (check)", isd ? 16.0 : 150.0,
        "mm", { group: "My design", modes: ["check"] }));
    });
  });
  M.RW_PARAMS = RW_PARAMS;
  C.register({ id: "retaining_wall", phase: 3, category: "Drains, culverts & roads", name: "Cantilever retaining wall", icon: "🧱",
    description: "Rankine pressure with sloping backfill & surcharge, IS 456 cl 20 overturning / sliding (auto " +
      "shear key), base pressure, stem / heel / toe design, curtailment, BBS.", params: RW_PARAMS,
    run: run_retaining, references: RCC_REFS });

  /* =========================================================================== WATER TANK (circular, ground) */
  var SIGMA_CT = { 20: 1.2, 25: 1.3, 30: 1.5, 35: 1.6, 40: 1.7 };         // IS 3370-2 Table 1, direct tension (N/mm²)
  var SIGMA_CBC = { 20: 7.0, 25: 8.5, 30: 10.0, 35: 11.5, 40: 13.0 };
  M.SIGMA_CT = SIGMA_CT; M.SIGMA_CBC = SIGMA_CBC;

  function run_tank(inp, mode) {
    var rcc = RC(), CMN = CMN_(), D_ = DR();
    var c = new C.Calc("Circular water tank on ground");
    var DT = DS.detailing;                          // bar-size rules (detailing.js)
    var fck = num(inp.fck);
    var sst = num(inp.sigma_st);
    var cap = num(inp.capacity);
    var fb = num(inp.freeboard);
    var cover = inp.cover == null || !isFinite(num(inp.cover)) ? 45 : num(inp.cover);
    var flexible = String(inp.base || "Flexible (sliding)").indexOf("Flexible") === 0;
    var D, Hw;
    c.section("Size");
    if (inp.size_mode === "From capacity") {
      Hw = num(inp.water_depth);
      D = c.calc("Internal diameter for capacity", "D", "sqrt(4*V/(pi*Hw))", "m", "", { V: cap, Hw: Hw });
      D = ceil_to(D, 0.1);
      c.let("Diameter adopted", "D", D, "m");
    } else {
      D = num(inp.D); Hw = num(inp.water_depth);
    }
    c.calc("Capacity", "V", "pi*D**2/4*Hw", "m³", "", { D: D, Hw: Hw });
    var H = Hw + fb;
    c.let("Height of wall", "H", R(H, 2), "m", "", "water depth " + G(Hw) + " + freeboard " + G(fb));
    c.let("Clear cover (liquid-retaining faces)", "c", cover, "mm", "IS 3370-2:2009 practice (45 mm)");
    c.ok("Cover ≥ 45 mm (liquid-retaining member)", cover >= 45 - 1e-9, { detail: G(cover) + " mm", clause: "IS 3370-2:2009 practice", warn_only: true });
    // scope: the membrane (hoop-only) analysis below is valid for a FLEXIBLE (sliding) wall–base joint only
    c.ok("Wall–base joint within module scope (flexible / sliding base)", flexible, { clause: "IS 3370-4 (cylindrical walls – coefficient tables)",
      detail: flexible ? "flexible base – walls free to slide, hoop tension only" :
        "'" + String(inp.base) + "' base: vertical cantilever moments and the reduced hoop tension near the base (IS 3370-4 coefficient tables) " +
        "are NOT computed by this module – design the wall with IS 3370-4 Tables (or select a flexible base)" });
    c.section("Hoop tension (flexible base – wall free to slide)");
    var T = c.calc("Max. hoop tension at base (per m height)", "T", "10*Hw*D/2", "kN/m", "IS 3370-4 / membrane theory",
      { Hw: Hw, D: D });
    // grades between / beyond the table keys use the next lower tabulated grade (M20 … M40)
    var gk = Object.keys(SIGMA_CT).map(Number).filter(function (g_) { return g_ <= fck; });
    var fkey = gk.length ? Math.max.apply(null, gk) : 20;
    var m = c.calc("Modular ratio", "m", "280/(3*scbc)", "", "IS 456 Annex B-1.3", { scbc: SIGMA_CBC[fkey] });
    var sct = SIGMA_CT[fkey];
    var t;
    if (mode === "check") t = num(inp.t);
    else t = ceil_to(Math.max(0.15, (T * 1000 * (1 / sct - (m - 1) / sst) / 1000) / 1000 + 0.0), 0.025);
    var Ash = c.calc("Hoop steel required", "Ash", "T*1000/sst", "mm²/m", "IS 3370-2 Table 4", { T: T, sst: sst });
    Ash = Math.max(Ash, rcc.min_steel_water(t * 1000) / 100 * 1000 * t * 1000);
    var wmin = DT ? DT.water_min_steel(t * 1000) : null;
    if (wmin && 2 * wmin.As > Ash) {
      c.info("Minimum steel (both faces)", wmin.text, wmin.clause);
      Ash = 2 * wmin.As;
    }
    var bars;
    if (mode === "check") {
      bars = { dia: num(inp.dia), spacing: num(inp.spacing) };
      if (DT) DT.check_bars(c, "water", "main", bars.dia, bars.spacing, { D: t * 1000, label: "hoop bars" });
    } else if (DT) {
      bars = rcc.slab_bars(Ash / 2, t * 1000 - cover - 6, t * 1000, true, { dias: [10, 12, 16, 20], smax: 200, rule: { member: "water", role: "main" } });
      DT.record(c, "hoop bars", bars);
    } else bars = rcc.slab_bars(Ash / 2, t * 1000 - cover - 6, t * 1000, true, { dias: [10, 12, 16, 20], smax: 200 });
    var As_prov = 2 * 1000 * DS.materials.bar_area(bars.dia) / bars.spacing;
    c.let("Hoop bars (each face)", "", G(bars.dia) + "Ø @ " + G(bars.spacing) + " c/c", "", "",
      "As = " + F(As_prov, ".0f") + " mm²/m both faces");
    c.check("Hoop steel provided ≥ required", As_prov, Ash, { unit: "mm²/m", clause: "IS 3370-2", mode: ">=" });
    var sc = c.calc("Tensile stress in concrete (uncracked)", "σct", "T*1000/(1000*t + (m - 1)*As)", "N/mm²",
      "IS 3370-2 cl 4.3", { T: T, t: t * 1000, m: R(m, 2), As: R(As_prov) });
    c.check("σct ≤ permissible (M" + G(fck) + ")", sc, sct, { unit: "N/mm²", clause: "IS 3370-2 Table 1" });
    c.let("Wall thickness", "t", R(t * 1000), "mm");
    var vmin = rcc.min_steel_water(t * 1000) / 100 * 1000 * t * 1000 / 2;
    if (wmin) vmin = Math.max(vmin, wmin.As);
    var vb = DT ? rcc.slab_bars(vmin, t * 1000 - cover - 6, t * 1000, false, { dias: [8, 10, 12, 16],
      rule: { member: "water", role: "dist", main_dia: bars.dia } }) : rcc.slab_bars(vmin, t * 1000 - cover - 6, t * 1000, false, { dias: [8, 10, 12] });
    if (DT) DT.record(c, "vertical bars", vb);
    c.let("Vertical bars (each face, minimum)", "", G(vb.dia) + "Ø @ " + G(vb.spacing) + " c/c", "", "IS 3370-2 cl 8.1");
    var tb = 0.15;
    c.let("Base slab on ground", "tb", 150, "mm", "", "minimum steel both ways, on 100 mm PCC + polythene");
    var bmin = rcc.min_steel_water(150) / 100 * 1000 * 150 / 2;
    var wminb = DT ? DT.water_min_steel(150) : null;
    if (wminb) bmin = Math.max(bmin, wminb.As);
    var bb = DT ? rcc.slab_bars(bmin, 150 - cover - 5, 150, false, { dias: [8, 10, 12], rule: { member: "water", role: "main" } }) :
      rcc.slab_bars(rcc.min_steel_water(150) / 100 * 1000 * 150 / 2, 150 - cover - 5, 150, false, { dias: [8, 10] });
    if (DT) { DT.record(c, "base slab bars (each way)", bb); DT.site_checks(c, "water", fck, cover); }
    c.thumb("Wall thickness", Math.max(150, 30 * H + 50), t * 1000, "mm", "30 H + 50 mm (H in m), ≥ 150", "Reynolds / practice");
    c.miss("Fixed or hinged wall base: use IS 3370-4 coefficient tables for moments & hoop forces", "IS 3370-4",
      flexible ? "Important" : "Critical");
    c.miss("Roof slab / dome design (if covered)", "IS 3370-4 / IS 456", "Important");
    c.miss("Water-stops at construction joints and hydro-test (IS 3370-1 cl 10)", "IS 3370-1", "Important");
    c.miss("Seismic hydrodynamic pressure", "IS 1893-2:2014", "Advisory");
    var circ = Math.PI * (D + t);
    // BBS (DS.bbs): hoops = ring on each face (centre-line dia) + lap, cut into stock pieces; verticals L into base;
    // base mesh both ways – each bar's length is the chord at its position (summed exactly, not an average)
    // hoops are in DIRECT tension: lap = max(2·Ld, 30φ) (IS 456 cl 26.2.5.1(c)); adjacent laps staggered ≥ 1.3 × lap apart (cl 26.2.5.1(a))
    var BB = DS.bbs, cvm = cover, LdH = BB.Ld(bars.dia, fck, 500), lapH = Math.max(2 * LdH, 30 * bars.dia);
    c.calc("Lap length of hoop bars (direct tension)", "Lap", "max(2*Ld, 30*phi)", "mm", "IS 456 cl 26.2.5.1(c)",
      "laps of adjacent hoops staggered ≥ 1.3 × lap apart around the ring (cl 26.2.5.1(a))", { Ld: LdH, phi: bars.dia });
    var nh = BB.count(H * 1000, bars.spacing, 50);
    var bbs = [];
    [["outer", D * 1000 + 2 * t * 1000 - 2 * cvm - bars.dia], ["inner", D * 1000 + 2 * cvm + bars.dia]].forEach(function (f, k) {
      var ring = Math.PI * f[1], pcs = Math.max(1, Math.ceil(ring / (BB.STOCK * 1000 - lapH))), cut = (ring + pcs * lapH) / pcs / 1000;
      bbs.push(BB.row("Wall", "W1" + (k ? "b" : "a"), bars.dia, "curved hoop" + (pcs > 1 ? ", " + pcs + " pieces lapped" : " + lap"), nh * pcs,
        { cut: Math.round(cut * 1000) / 1000, f: "hoop " + f[0] + ": π×" + Math.round(f[1]) + " + " + pcs + "×lap " + lapH + (pcs > 1 ? ", ÷ " + pcs + " pieces" : "") + " = " + Math.round(cut * 1000) + " mm" },
        "hoop, " + f[0] + " face @ " + G(bars.spacing) + " c/c, laps staggered"));
    });
    var nv = BB.count(circ * 1000, vb.spacing, 0);
    // flexible (sliding) base: the wall is NOT tied to the base – verticals straight, stopping at the joint;
    // fixed / hinged base (outside scope, FAIL above): L into the base as a dowel
    bbs.push(flexible ? BB.row("Wall", "W2", vb.dia, "straight (stops at sliding joint)", 2 * nv, BB.stock(BB.straight(vb.dia, H * 1000 - 2 * cvm), vb.dia, fck, 500), "vertical, both faces")
      : BB.row("Wall", "W2", vb.dia, "L into base", 2 * nv, BB.lbar(vb.dia, (H + tb) * 1000 - 2 * cvm, BB.leg(vb.dia, BB.cfg.wall_leg_min)), "vertical, both faces"));
    var Dout = (D + 2 * t) * 1000 - 2 * cvm, nb = BB.count(Dout, bb.spacing, 0), sumL = 0;
    for (var ib = 0; ib < nb; ib++) { var y = -Dout / 2 + ib * bb.spacing; if (Math.abs(y) < Dout / 2) sumL += 2 * Math.sqrt(Dout * Dout / 4 - y * y); }
    var avgL = sumL / Math.max(nb, 1);
    bbs.push(BB.row("Base", "B1", bb.dia, "straight (chords of circle)", 2 * 2 * nb, { cut: Math.round(avgL) / 1000, f: "mean chord of Ø" + Math.round(Dout) + " over " + nb + " bars (Σ chords " + Math.round(sumL) + " / " + nb + ") = " + Math.round(avgL) + " mm" },
      "both ways, top & bottom; cut each bar to its chord"));
    var qty = [Q("Earth work in excavation", "cum", [row("Tank base", 1, Math.PI * Math.pow(D / 2 + t + 0.5, 2), null, 0.45)],
      [CMN.CPWD, "2.8.1"]),
    Q("PCC 1:4:8 below base", "cum", [row("Base", 1, Math.PI * Math.pow(D / 2 + t + 0.15, 2), null, 0.10)],
      [CMN.CPWD, "4.1.8"]),
    Q("RCC M" + G(fck) + " in water tank (excl. steel & shuttering)", "cum",
      [row("Wall", 1, circ, t, H), row("Base slab", 1, Math.PI * Math.pow(D / 2 + t + 0.15, 2), null, tb)], null,
      CMN.rcc_rate(fck)),
    Q("Curved shuttering to tank walls", "sqm", [row("Inner + outer", 2, circ, null, H)], null, 850.0),
    _steel_qty(bbs, "Tank"),
    Q("Water tank inside coating – food-grade epoxy", "sqm",
      [row("Wall + floor", 1, Math.PI * D * H + Math.PI * D * D / 4)], null, 650.0)];
    var pv = new D_.View("Tank plan");
    pv.circle(0, 0, D * 500, "OUTLINE");
    pv.circle(0, 0, D * 500 + t * 1000, "OUTLINE");
    pv.dim(-D * 500, 0, D * 500, 0, 0, "Ø " + F(D * 1000, ",.0f") + " INTERNAL");
    var sv = new D_.View("Tank section");
    var Dm = D * 1000, Hm = H * 1000, tm = t * 1000;
    sv.rect(-tm, 0, Dm + 2 * tm, tb * 1000, "OUTLINE", "concrete");
    sv.rect(-tm, tb * 1000, tm, Hm, "OUTLINE", "concrete");
    sv.rect(Dm, tb * 1000, tm, Hm, "OUTLINE", "concrete");
    sv.rect(0, tb * 1000, Dm, Hw * 1000, "WATER", "water");
    sv.dim(Dm + tm, 0, Dm + tm, tb * 1000 + Hm, -8);
    sv.dim(0, tb * 1000 + Hm, Dm, tb * 1000 + Hm, -8);
    sv.text(Dm / 2, -500, "Hoop " + G(bars.dia) + "Ø@" + G(bars.spacing) + " both faces; vertical " + G(vb.dia) + "Ø@" +
      G(vb.spacing) + "; base " + G(bb.dia) + "Ø@" + G(bb.spacing) + " both ways", 2.2, { anchor: "middle" });
    var sheet = new D_.Sheet("Circular water tank", "WT-01", [pv, sv],
      ["Concrete M" + G(fck) + ", HYSD bars Fe500, clear cover " + G(cover) + " mm (IS 3370-2 / IS 456 Table 16); " +
        "σst ≤ " + G(sst) + " N/mm².",
        flexible ? "Flexible base joint with water-stop and sliding layer (bitumen / polythene); wall verticals stop at the joint (not tied to the base)."
          : "Wall–base joint '" + String(inp.base) + "' – NOT covered by this design (IS 3370-4 coefficient tables required).",
        "Hoop bars lapped max(2Ld, 30φ) = " + G(lapH) + " mm (direct tension, IS 456 cl 26.2.5.1(c)); laps of adjacent hoops staggered ≥ 1.3 × lap apart.",
        "Hydro-test before backfilling / finishing."]);
    return C.DesignResult({ module: "water_tank", title: "Circular ground water tank", inputs: inp, calc: c,
      summary: { "Size": "Ø " + F(D, ".2f") + " m × " + F(H, ".2f") + " m (water " + G(Hw) + " m)", "Capacity": F(Math.PI * D * D / 4 * Hw, ",.0f") + " m³",
        "Wall": F(t * 1000, ".0f") + " mm, hoop " + G(bars.dia) + "Ø@" + G(bars.spacing) + " b/f",
        "σct": F(sc, ".2f") + " N/mm²" }, drawings: [sheet], quantities: qty, bbs: bbs, tables: {}, references: RCC_REFS });
  }
  M.run_tank = run_tank;

  var TANK_PARAMS = [
    P("size_mode", "Size by", "From capacity", { kind: "select", options: ["From capacity", "Diameter given"], group: "Size" }),
    P("capacity", "Capacity", 250.0, "m³ (kL)", { min: 5, max: 5000, group: "Size" }),
    P("D", "Internal diameter (if given)", 10.0, "m", { min: 1, max: 40, step: 0.1, group: "Size" }),
    P("water_depth", "Water depth", 3.5, "m", { min: 1, max: 8, step: 0.1, group: "Size" }),
    P("freeboard", "Freeboard", 0.3, "m", { min: 0.15, max: 1, step: 0.05, group: "Size" }),
    P("base", "Wall–base joint", "Flexible (sliding)", { kind: "select", options: ["Flexible (sliding)", "Fixed"], group: "Size",
      help: "This module designs the flexible (sliding) joint only; 'Fixed' is reported as FAIL – use IS 3370-4 coefficient tables." }),
    P("fck", "Concrete grade", 30.0, "N/mm²", { kind: "select", options: [25.0, 30.0, 35.0, 40.0], group: "Materials" }),
    P("cover", "Clear cover", 45.0, "mm", { min: 25, max: 75, step: 5, group: "Materials", help: "IS 3370-2 practice: 45 mm for liquid-retaining faces." }),
    P("sigma_st", "Permissible steel stress (direct tension)", 130.0, "N/mm²", { min: 100, max: 150, step: 5,
      group: "Materials", help: "IS 3370-2:2009 Table 4 (HYSD)" }),
    P("t", "Wall thickness (check)", 0.20, "m", { min: 0.15, max: 0.6, step: 0.025, group: "My design", modes: ["check"] }),
    P("dia", "Hoop bar dia (check)", 12.0, "mm", { group: "My design", modes: ["check"] }),
    P("spacing", "Hoop bar spacing each face (check)", 150.0, "mm", { group: "My design", modes: ["check"] })
  ];
  M.TANK_PARAMS = TANK_PARAMS;
  C.register({ id: "water_tank", phase: 3, category: "Drains, culverts & roads", name: "Circular water tank on ground (IS 3370)", icon: "💧",
    description: "Flexible-base circular tank: size from capacity, hoop tension, steel at σst, uncracked concrete " +
      "tension check, minimum steel, BBS & quantities.", params: TANK_PARAMS, run: run_tank, references: RCC_REFS,
    modes: ["design", "check"] });

  /* =========================================================================== FLEXIBLE PAVEMENT (IRC 37:2018) */
  /* Very rough trend of IRC 37 catalogue totals (indicative only). */
  function _thumb_total(N, cbr) {
    // IRC 37:2018 plates: WMM 250 + GSB 200 (GSB 250 below CBR 5) + bituminous ≈ 30 + 55·log10(msa), more on weak subgrade
    var bit = (30 + 55 * Math.log10(Math.max(N, 2))) * Math.pow(8 / Math.max(cbr, 3), 0.3);
    return 450 + (cbr < 5 ? 50 : 0) + bit;
  }
  M._thumb_total = _thumb_total;

  function run_pavement(inp, mode) {
    var CMN = CMN_(), D_ = DR();
    var c = new C.Calc("Flexible pavement");
    c.section("Design traffic (IRC 37:2018 cl 4)");
    var P_ = num(inp.cvpd), r = num(inp.growth) / 100, n = num(inp.life), x = num(inp.constr);
    var A = c.calc("CVPD (both directions) at end of construction", "A", "P*(1 + r)**x", "CVPD", "IRC 37 cl 4.2 / eq 4.1", { P: P_, r: r, x: x });
    // lane distribution (IRC 37 cl 4.6) applied to the BOTH-direction CVPD: single lane 1.0; two-lane two-way 0.5 (of both directions);
    // divided carriageways: directional split 0.5 × lane factor of the design direction (4-lane 0.75, 6-lane 0.60)
    var RT = { "Single-lane road": [1.0, 1.0], "Two-lane two-way (undivided)": [0.5, 1.0], "Four-lane divided": [0.75, 0.5],
      "Six-lane divided": [0.60, 0.5] };
    var rtp = String(inp.road_type || "Two-lane two-way (undivided)"), lf = RT[rtp];
    var Dl = lf ? lf[0] : num(inp.lane_dist), Ds = lf ? lf[1] : num(inp.dir_split);
    if (!isFinite(Ds) || Ds <= 0) Ds = 1.0;
    c.let("Carriageway", "", rtp, "", "IRC 37 cl 4.6");
    c.let("Lane distribution factor", "Dl", Dl, "", "IRC 37 cl 4.6", lf ? "" : "custom");
    c.let("Directional split (share of both-direction CVPD in the design direction)", "Ds", Ds, "", "IRC 37 cl 4.6",
      Ds < 1 ? "divided carriageway – design direction only" : "undivided – lane factor already applies to the two-way CVPD");
    var D = c.calc("Distribution factor on the two-way CVPD", "D", "Dl*Ds", "", "IRC 37 cl 4.6", { Dl: Dl, Ds: Ds });
    var Fv = num(inp.vdf);
    var N = c.calc("Cumulative standard axles", "N", "365*((1 + r)**n - 1)/r*A*D*F/1e6", "msa", "IRC 37 eq 4.1",
      { r: r, n: n, A: R(A, 1), D: R(D, 4), F: Fv });
    c.section("Material properties");
    var cbr = num(inp.cbr);
    var Msg = c.calc("Subgrade resilient modulus", "MRS", "10*CBR if CBR <= 5 else 17.6*CBR**0.64", "MPa",
      "IRC 37 eq 6.1 / 6.2", { CBR: cbr });
    c.ok("Effective subgrade CBR ≥ 5 % (else improve / replace)", cbr >= 5, { detail: "CBR = " + G(cbr) + " %", clause: "IRC 37 cl 6.4",
      warn_only: true });
    var h_gsb = num(inp.h_gsb), h_wmm = num(inp.h_wmm);
    var h_dbm = num(inp.h_dbm), h_bc = num(inp.h_bc);
    var Mgr = c.calc("Modulus of granular layers (GSB + WMM)", "MRgran", "0.2*h**0.45*MRS", "MPa", "IRC 37 eq 7.1",
      { h: h_gsb + h_wmm, MRS: R(Msg, 1) });
    var Mbt = c.let("Bituminous mix modulus (VG40, 35 °C)", "MRbt", num(inp.E_bit), "MPa", "IRC 37 Table 9.2");
    c.section("Allowable strains (90 % reliability for ≥ 20 msa, else 80 %)");
    var rel90 = N >= 20;
    var Va = num(inp.Va), Vbe = num(inp.Vbe);
    var Mx = 4.84 * (Vbe / (Va + Vbe) - 0.69);
    var Cf = Math.pow(10, Mx);
    var kf = rel90 ? 0.5161 : 1.6064;
    var kr = rel90 ? 1.41e-08 : 4.1656e-08;
    var et = c.calc("Allowable horizontal tensile strain at bottom of bituminous layer", "εt",
      "(N*1e6/(kf*C*1e-4*(1/MR)**0.854))**(-1/3.89)", "", "IRC 37 eq 3.3/3.4",
      { N: R(N, 3), kf: kf, C: R(Cf, 4), MR: Mbt });
    var ev = c.calc("Allowable vertical compressive strain on subgrade", "εv", "(N*1e6/kr)**(-1/4.5337)", "",
      "IRC 37 eq 3.1/3.2", { N: R(N, 3), kr: kr });
    c.section("Layer composition");
    var tot = h_gsb + h_wmm + h_dbm + h_bc;
    c.let("Composition", "", "BC " + G(h_bc) + " + DBM " + G(h_dbm) + " + WMM " + G(h_wmm) + " + GSB " + G(h_gsb) + " = " + G(tot) + " mm", "");
    c.check("GSB ≥ 150 mm (drainage & separation)", h_gsb, 150, { unit: "mm", clause: "IRC 37 cl 7.2", mode: ">=" });
    c.check("Granular base (WMM) ≥ 150 mm", h_wmm, 150, { unit: "mm", clause: "IRC 37 cl 7.3", mode: ">=" });
    c.check("Bituminous surface course ≥ 30 mm", h_bc, 30, { unit: "mm", clause: "IRC 37 cl 9", mode: ">=" });
    if (mode === "check" && num(inp.et_calc) > 0) {
      c.check("Computed εt (IITPAVE) ≤ allowable", num(inp.et_calc) * 1e-6, et, { unit: "", clause: "IRC 37 cl 3.6" });
      c.check("Computed εv (IITPAVE) ≤ allowable", num(inp.ev_calc) * 1e-6, ev, { unit: "", clause: "IRC 37 cl 3.6" });
    } else {
      c.miss("Run IITPAVE with the moduli shown (BC/DBM " + G(Mbt) + ", granular " + F(Mgr, ".0f") + ", subgrade " + F(Msg, ".0f") + " MPa; " +
        "Poisson 0.35, standard axle 80 kN dual wheels, 0.56 MPa, 310 mm c/c) and enter εt, εv in " +
        "'Check my design' mode", "IRC 37 Annex I", "Critical");
    }
    c.thumb("Total pavement thickness", _thumb_total(N, cbr), tot, "mm", "IRC 37:2018 catalogue trend (indicative)",
      "IRC 37 Plates");
    c.miss("Sub-surface drainage & cross fall (2.5 % for bituminous)", "IRC 37 cl 8 / IRC SP-42", "Important");
    c.miss("Rigid (PQC) alternative – IRC 58 not covered in this module", "IRC 58:2015", "Advisory");
    var width = num(inp.width), L = num(inp.length);
    var qty = [Q("Construction of sub-grade (500 mm compacted)", "cum", [row("Sub-grade", 1, L, width + 1.0, 0.5)],
      [CMN.MPPWD, "3.5.1"]),
    Q("Granular sub-base Grading-I", "cum", [row("GSB", 1, L, width + 0.6, h_gsb / 1000)], [CMN.MPPWD, "4.1.1"]),
    Q("Wet mix macadam by paver", "cum", [row("WMM", 1, L, width + 0.3, h_wmm / 1000)], [CMN.MPPWD, "4.6.1"]),
    Q("Prime coat SS-1", "sqm", [row("Prime", 1, L, width)], [CMN.MPPWD, "5.2.1"]),
    Q("Dense bituminous macadam Grading-II", "cum", [row("DBM", 1, L, width, h_dbm / 1000)],
      [CMN.MPPWD, "5.5.2"]),
    Q("Tack coat RS-1", "sqm", [row("Tack", 1, L, width)], [CMN.MPPWD, "5.3.1"]),
    Q("Bituminous concrete Grading-II", "cum", [row("BC", 1, L, width, h_bc / 1000)], [CMN.MPPWD, "5.7.2"])];
    var v = new D_.View("Pavement cross section (typical)");
    var Wm = width * 1000;
    var y = 0;
    [["SUBGRADE 500", 500, "soil"], ["GSB " + G(h_gsb), h_gsb, "soil"],
      ["WMM " + G(h_wmm), h_wmm, "concrete"], ["DBM " + G(h_dbm), h_dbm, "black"],
      ["BC " + G(h_bc), h_bc, "black"]].forEach(function (L_) {
      var name = L_[0], h = L_[1], fill = L_[2];
      v.rect(0, y, Wm, Math.max(h, 1) * 4, "OUTLINE", fill);
      v.text(Wm + 300, y + h * 2, name, 2.2);
      y += h * 4;
    });
    v.text(Wm / 2, -800, "(layer thicknesses drawn 4× exaggerated)", 2.0, { anchor: "middle" });
    v.dim(0, 0, Wm, 0, 10, "CARRIAGEWAY " + F(Wm, ",.0f"));
    var sheet = new D_.Sheet("Flexible pavement composition", "PV-01", [v],
      ["Design traffic " + F(N, ".1f") + " msa; subgrade CBR " + G(cbr) + " % (MRS " + F(Msg, ".0f") + " MPa).",
        "Layer thicknesses to be confirmed by IITPAVE analysis (IRC 37:2018).",
        "Materials and compaction as per MoRTH Sections 300, 400, 500."]);
    return C.DesignResult({ module: "pavement", title: "Flexible pavement (IRC 37)", inputs: inp, calc: c,
      summary: { "Design traffic": F(N, ".2f") + " msa", "Subgrade MR": F(Msg, ".0f") + " MPa",
        "Allowable εt": F(et * 1e6, ".0f") + " µε", "Allowable εv": F(ev * 1e6, ".0f") + " µε",
        "Composition": "BC " + G(h_bc) + " / DBM " + G(h_dbm) + " / WMM " + G(h_wmm) + " / GSB " + G(h_gsb) + " mm" },
      drawings: [sheet], quantities: qty, bbs: [], tables: {}, references: ["IRC 37:2018 – Guidelines for design of flexible pavements",
        "IRC SP-72 – Low-volume rural roads", "MoRTH Specifications (5th Rev.)",
        "Khanna & Justo – Highway Engineering"] });
  }
  M.run_pavement = run_pavement;

  var PAVE_PARAMS = [
    P("cvpd", "Commercial vehicles per day (both directions, present)", 2000.0, "CVPD", { min: 10, max: 50000, group: "Traffic" }),
    P("growth", "Traffic growth rate", 5.0, "%", { min: 1, max: 12, step: 0.5, group: "Traffic" }),
    P("life", "Design life", 20.0, "years", { min: 5, max: 30, group: "Traffic" }),
    P("constr", "Construction period", 2.0, "years", { min: 0, max: 5, group: "Traffic" }),
    P("road_type", "Carriageway (lane distribution)", "Two-lane two-way (undivided)", { kind: "select",
      options: ["Single-lane road", "Two-lane two-way (undivided)", "Four-lane divided", "Six-lane divided", "Custom"], group: "Traffic",
      help: "IRC 37 cl 4.6 on the two-way CVPD: single lane 1.0; two-lane two-way 0.5; divided roads: ½ directional split × 0.75 (4-lane) / 0.60 (6-lane)." }),
    P("lane_dist", "Lane distribution factor (custom)", 0.75, { min: 0.3, max: 1.0, step: 0.05, group: "Traffic",
      when: function (v) { return String(v.road_type) === "Custom"; }, help: "Fraction of the design-direction traffic on the design lane." }),
    P("dir_split", "Directional split (custom)", 0.5, { min: 0.5, max: 1.0, step: 0.05, group: "Traffic",
      when: function (v) { return String(v.road_type) === "Custom"; }, help: "0.5 for a divided road (one direction); 1.0 if the lane factor already applies to the two-way CVPD." }),
    P("vdf", "Vehicle damage factor", 3.5, { min: 0.5, max: 8, step: 0.1, group: "Traffic",
      help: "Axle load survey; IRC 37 Table 4.2 indicative 1.5–5.2" }),
    P("cbr", "Effective subgrade CBR", 8.0, "%", { min: 2, max: 20, step: 0.5, group: "Subgrade" }),
    P("E_bit", "Bituminous modulus (35 °C)", 3000.0, "MPa", { min: 1000, max: 4000, step: 100, group: "Materials" }),
    P("Va", "Air voids Va", 3.5, "%", { min: 3, max: 5, step: 0.1, group: "Materials" }),
    P("Vbe", "Effective binder volume Vbe", 11.5, "%", { min: 9, max: 14, step: 0.1, group: "Materials" }),
    P("h_bc", "BC thickness", 40.0, "mm", { min: 25, max: 60, step: 5, group: "Composition" }),
    P("h_dbm", "DBM thickness", 90.0, "mm", { min: 0, max: 200, step: 5, group: "Composition" }),
    P("h_wmm", "WMM thickness", 250.0, "mm", { min: 150, max: 300, step: 10, group: "Composition" }),
    P("h_gsb", "GSB thickness", 200.0, "mm", { min: 150, max: 300, step: 10, group: "Composition" }),
    P("width", "Carriageway width (quantity)", 7.0, "m", { min: 3, max: 30, group: "Quantity" }),
    P("length", "Road length (quantity)", 1000.0, "m", { min: 10, max: 100000, group: "Quantity" }),
    P("et_calc", "εt from IITPAVE (µε, check)", 0.0, { min: 0, max: 1000, group: "My analysis", modes: ["check"] }),
    P("ev_calc", "εv from IITPAVE (µε, check)", 0.0, { min: 0, max: 2000, group: "My analysis", modes: ["check"] })
  ];
  M.PAVE_PARAMS = PAVE_PARAMS;
  C.register({ id: "pavement", phase: 3, category: "Drains, culverts & roads", name: "Flexible pavement (IRC 37:2018)", icon: "🛣️",
    description: "Design traffic in msa, subgrade / granular moduli, allowable fatigue & rutting strains, layer " +
      "minimums and MP PWD SOR quantities. Strains to be verified with IITPAVE.", params: PAVE_PARAMS,
    run: run_pavement, references: ["IRC 37:2018"], modes: ["design", "check"] });
})();
