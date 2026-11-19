/* Design Studio — modules_steel (port of civilest/design/modules_steel.py).
   Phase 2 – Steel structures (IS 800:2007, IS 875 Parts 1–3:2015).

   Modules
       steel_portal  Industrial shed – hot-rolled portal frame (PEB style) with purlins, base plates, footings
       steel_truss   Industrial shed – roof truss (Pratt / Howe) with purlins, member design in angles
       steel_purlin  Purlin design (ISMC / ISA) for gravity and wind uplift
       steel_beam    Rolled steel beam (simply supported / cantilever) with LTB, shear, deflection
       steel_column  Rolled steel column under axial load + moment with base plate */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var C = DS.core, LD = DS.loads, S = DS.steel, MT = DS.materials, SC = DS.sections, CM = DS.common;
  var M = DS.modules_steel = {};
  var F = C.pyfmt, R = C.pyround, Calc = C.Calc;
  var Q = CM.Q, kg_row = CM.kg_row, row = CM.row, RATE = CM.RATE;
  var section = SC.section, by_weight = SC.by_weight, builtup_series = SC.builtup_series, double_angle = SC.double_angle;
  var ISA = SC.ISA, ISMB = SC.ISMB, ISHB = SC.ISHB, ISMC = SC.ISMC;
  var E_STEEL = MT.E_STEEL, STEEL_GRADES = MT.STEEL_GRADES;
  function radians(d) { return d * Math.PI / 180; }
  function degrees(r) { return r * 180 / Math.PI; }
  function last(a) { return a[a.length - 1]; }
  function maxOf(a) { return Math.max.apply(null, a); }
  function num(v) { return Number(v); }
  function truthy(v) { return !!v && !(Array.isArray(v) && !v.length); }

  /* Param(key, label, default, unit = "", {kind, options, min, max, step, help, group, modes}) */
  function P(key, label, def, unit, o) {
    if (unit && typeof unit === "object") { o = unit; unit = ""; }
    return C.Param(Object.assign({ key: key, label: label, "default": def, unit: unit || "" }, o || {}));
  }

  var E_KN = M.E_KN = E_STEEL * 1e3;          // kN/m²
  var STEEL_REFS = M.STEEL_REFS = ["IS 800:2007 – General construction in steel (LSM)", "IS 875 Part 1, 2 & 3:2015 – Loads (dead, imposed, wind)",
    "IS 808 / SP 6(1) – Rolled steel sections", "IS 2062 – Structural steel", "IS 456:2000 – Foundations",
    "N. Subramanian – Design of Steel Structures (Oxford)", "S.K. Duggal – Limit State Design of Steel Structures",
    "INSDAG – Teaching resource for structural steel design"];
  var CITIES = M.CITIES = Object.keys(LD.BASIC_WIND_SPEED).sort();

  M._wind_params = function () {
    return [
      P("city", "City (basic wind speed)", "Indore", { kind: "select", options: CITIES.concat(["Custom"]), group: "Wind" }),
      P("Vb_custom", "Custom basic wind speed Vb", 44.0, "m/s", { min: 33, max: 55, group: "Wind",
        help: "Used when City = Custom (IS 875-3 Annex A)" }),
      P("terrain", "Terrain category", 2, { kind: "select", options: [1, 2, 3, 4], group: "Wind" }),
      P("k1", "Risk coefficient k1", 1.0, { min: 0.7, max: 1.08, step: 0.01, group: "Wind",
        help: "IS 875-3 Table 1 – 1.0 for general buildings (50-yr life)" }),
      P("k3", "Topography factor k3", 1.0, { min: 1.0, max: 1.36, step: 0.01, group: "Wind" }),
      P("perm", "Wall openings (internal pressure)", "Medium (5–20 %)", { kind: "select",
        options: Object.keys(LD.CPI), group: "Wind" })
    ];
  };

  M._Vb = function (inp) { return inp.city === "Custom" ? num(inp.Vb_custom) : num(LD.BASIC_WIND_SPEED[inp.city]); };
  M._fy = function (inp) { return STEEL_GRADES[inp.steel]; };

  /* =========================================================================== purlin helper */
  /* design_purlin(c, bay, spacing, slope, dl_sheet, ll, wind_up, fy, fu, sag_rods, continuous, given = null, family = "ISMC")
     Purlin as a beam spanning between frames (bay). Pressures in kN/m²; wind_up = net uplift pressure on the purlin
     (|Cpe − Cpi| × pd for cladding / purlins, +ve outward). Uses the same generic flexural check as steel_shed
     (M.flex_check): gravity 1.5(DL+LL) biaxial bending, uplift 1.5 WL − 0.9 DL with lateral-torsional
     buckling of the unrestrained (bottom) flange between sag rods, shear and deflection ≤ span/150. */
  /* flex_check(c, name, o) – generic purlin / girt check, same method as steel_shed (modules_shed flex_check), for ISMC / ISA.
     o: {tag, L, cont, nsag, fy, lim, loads(c, ws) → {gN, gT, uN, sv}} (factored normal / along-slope / net uplift, service) */
  M.flex_check = function (c, name, o) {
    var GM0 = S.GAMMA_M0, s0 = section(name), t = " (" + o.tag + ")";
    var sec = name.indexOf("ISA") === 0 ? Object.assign({}, s0, { Zez: s0.Zxx, Zey: s0.Zxx, Zpz: 1.12 * s0.Zxx, Zpy: 1.12 * s0.Zxx,
      Iz: s0.Ixx, Iy: s0.Ixx, h: s0.leg, b: s0.leg, tf: s0.t, tw: s0.t, It: 0, Iw: 0 }) : s0;
    var fy = o.fy, ws = sec.w * 9.81e-3, ld = o.loads(c, ws), coef = o.cont ? 0.1 : 0.125;
    var Mz = c.calc("Major-axis moment (gravity / inward)" + t, "Mz", "coef*wn*L**2", "kN·m", "IS 800 cl 8.2", "coef 1/10 continuous (≥ 3 spans), 1/8 simple", { coef: coef, wn: ld.gN, L: o.L });
    var Mu = c.calc("Major-axis moment (uplift / suction, reversed)" + t, "Mz,u", "coef*max(wu, 0)*L**2", "kN·m", "IS 800 cl 8.2", { coef: coef, wu: ld.uN, L: o.L });
    var a = o.nsag + 1;
    var My = c.calc("Minor-axis moment (between sag rods)" + t, "My", "wt*(L/a)**2/8", "kN·m", "IS 800 cl 8.2", (o.nsag ? C.pystr(o.nsag) + " sag-rod line(s) per span" : "no sag rods"), { wt: ld.gT, L: o.L, a: a });
    var Mdz = c.calc("Design moment capacity (major, flange restrained by sheeting)" + t, "Mdz", "min(Zp, 1.2*Ze)*fy/gm0/1e6", "kN·m", "IS 800 cl 8.2.1.2", { Zp: R(sec.Zpz), Ze: R(sec.Zez), fy: fy, gm0: GM0 });
    var Mdy = c.calc("Design moment capacity (minor)" + t, "Mdy", "1.2*Ze*fy/gm0/1e6", "kN·m", "IS 800 cl 8.2.1.2", { Ze: R(sec.Zey), fy: fy, gm0: GM0 });
    var MdLT = Mdz;
    if (Mu > 0 && sec.family !== "ISA") {
      var LLT = o.L / a, Mcr = S.mcr_i(sec, LLT * 1000);
      var lam = c.calc("LTB slenderness, free flange in compression" + t, "λLT", "sqrt(Ze*fy/Mcr)", "", "IS 800 cl 8.2.2", "LLT = " + F(LLT, ".2f") + " m (sag rods / anti-sag ties restrain the free flange)",
        { Ze: R(sec.Zez), fy: fy, Mcr: R(Mcr) });
      var phi = 0.5 * (1 + 0.21 * (lam - 0.2) + lam * lam);
      var chi = lam <= 0.4 ? 1.0 : Math.min(1 / (phi + Math.sqrt(Math.max(phi * phi - lam * lam, 0))), 1.0);
      MdLT = c.calc("LTB moment capacity under uplift" + t, "Md,LT", "chi*Ze*fy/gm0/1e6", "kN·m", "IS 800 cl 8.2.2", "αLT = 0.21 (rolled)", { chi: R(chi, 4), Ze: R(sec.Zez), fy: fy, gm0: GM0 });
    } else if (Mu > 0) {
      c.info("Uplift on angle purlin" + t, "elastic capacity about the rectangular axis used; bottom flange to be braced by sag rods / sheeting screws", "IS 800 cl 8.2.2");
    }
    var ir1 = c.calc("Biaxial interaction (gravity)" + t, "IR", "Mz/Mdz + My/Mdy", "", "IS 800 cl 9.3.1.1", { Mz: Mz, Mdz: Mdz, My: My, Mdy: Mdy });
    var ok = c.check("Biaxial bending (gravity / inward)" + t, ir1, 1.0, { clause: "IS 800 cl 9.3.1.1" });
    var ir2 = c.calc("Interaction under uplift / suction" + t, "IR,u", "Mu/MdLT", "", "IS 800 cl 8.2.2", { Mu: Mu, MdLT: MdLT });
    ok = c.check("Bending under uplift / suction (LTB)" + t, ir2, 1.0, { clause: "IS 800 cl 8.2.2" }) && ok;
    var V = c.calc("Max. shear" + t, "V", "k*max(wn, wu)*L", "kN", "", { k: o.cont ? 0.6 : 0.5, wn: ld.gN, wu: ld.uN, L: o.L });
    var Vd = c.calc("Shear capacity" + t, "Vd", "h*tw*fy/(sqrt(3)*gm0*1000)", "kN", "IS 800 cl 8.4.1", { h: sec.h, tw: sec.tw, fy: fy, gm0: GM0 });
    ok = c.check("Shear" + t, V, Vd, { unit: "kN", clause: "IS 800 cl 8.4" }) && ok;
    var dk = o.cont ? 0.0069 : 5 / 384;
    var d = c.calc("Deflection (service LL or WL)" + t, "δ", "k*w*(L*1000)**4/(E*I)", "mm", "IS 800 Table 6", { k: R(dk, 5), w: R(ld.sv, 4), L: o.L, E: E_STEEL, I: R(sec.Iz) });
    ok = c.check("Deflection ≤ span/" + C.pystr(o.lim) + " (elastic cladding)" + t, d, o.L * 1000 / o.lim, { unit: "mm", clause: "IS 800 Table 6" }) && ok;
    return { ok: ok, name: name, sec: sec, w: sec.w, IR: Math.max(ir1, ir2) };
  };

  M.design_purlin = function (c, bay, spacing, slope, dl_sheet, ll, wind_up, fy, fu, sag_rods, continuous, given, family) {
    if (given && typeof given === "object") { family = given.family; given = given.given; }
    if (family === undefined) family = "ISMC";
    if (given === undefined) given = null;
    var SH = M;
    c.section("Purlin");
    var table = family === "ISMC" ? ISMC : ISA;
    var candidates = given ? [given] : by_weight(table);
    var nsag = sag_rods ? 1 : 0;
    var o = { tag: "purlin", L: bay, cont: !!continuous, nsag: nsag, fy: fy, lim: 150, loads: function (cc, ws) {
      var wg = cc.calc("Dead load on purlin (sheeting + services + self)", "wg", "dl*sp + ws", "kN/m", "IS 875-1",
        { dl: dl_sheet, sp: spacing, ws: R(ws, 4) });
      var wq = cc.calc("Imposed load on purlin (on plan)", "wq", "ll*sp*cos(radians(th))", "kN/m", "IS 875-2", { ll: ll, sp: spacing, th: slope });
      var gN = cc.calc("Factored normal load 1.5(DL + LL)", "wn", "1.5*(wg + wq)*cos(radians(th))", "kN/m", "IS 800 Table 4", { wg: wg, wq: wq, th: slope });
      var gT = cc.calc("Factored load along slope", "wt", "1.5*(wg + wq)*sin(radians(th))", "kN/m", "IS 800 Table 4", { wg: wg, wq: wq, th: slope });
      var uN = cc.calc("Factored net uplift 1.5 WL − 0.9 DL", "wu", "1.5*wp*sp - 0.9*wg*cos(radians(th))", "kN/m", "IS 800 Table 4",
        "wp = net uplift pressure on the purlin (cladding pressure)", { wp: R(wind_up, 4), sp: spacing, wg: wg, th: slope });
      var sv = cc.calc("Service load for deflection max(LL, WL − DL)", "wsv", "max(ll*sp*cos(radians(th))**2, wp*sp - wg*cos(radians(th)))", "kN/m",
        "IS 800 Table 6", { ll: ll, sp: spacing, th: slope, wp: R(wind_up, 4), wg: wg });
      return { gN: gN, gT: gT, uN: uN, sv: sv };
    } };
    var name = null;
    for (var i = 0; i < candidates.length && !name; i++) {
      if (given || SH.flex_check(new Calc("s"), candidates[i], o).ok) name = candidates[i];
    }
    if (!name) name = last(candidates);
    c.let("Purlin section", "", name, "", "IS 808");
    c.let("Purlin span (frame spacing)", "Lp", bay, "m");
    c.let("Purlin spacing (on slope)", "sp", spacing, "m");
    c.let("Support condition", "", continuous ? "continuous (≥ 3 spans, lapped / sleeved)" : "simply supported", "", "IS 800 cl 8.9",
      sag_rods ? "sag rods at mid-span: minor-axis span and LTB length of the free flange = L/2" : "no sag rods: free flange unrestrained over the full span");
    var r = SH.flex_check(c, name, o);
    var sec = section(name);
    return { name: name, sec: sec, w: sec.w, chk: r };
  };

  /* wind pressure on purlins / sheeting: Ka for the purlin tributary area, Kc = 1.0 (IS 875-3 cl 7.2, Table 4) */
  M.purlin_wind = function (c, inp, height, area) {
    var Vb = M._Vb(inp), terrain = Math.trunc(num(inp.terrain)), k1 = num(inp.k1), k3 = num(inp.k3);
    var k2 = LD.k2_factor(height, terrain);
    var pz = 0.6 * Math.pow(Vb * k1 * k2 * k3, 2) / 1000;
    return c.calc("Design wind pressure for purlins & sheeting", "pd,p", "max(Kd*Ka*Kc*pz, 0.7*pz)", "kN/m²", "IS 875-3 cl 7.2 / Table 4",
      "Ka for purlin tributary area " + F(area, ".1f") + " m²; Kc = 1.0 (area-combination factor is for frames only); pz = 0.6 (Vb k1 k2 k3)²",
      { Kd: 0.9, Ka: R(LD.ka_factor(area), 3), Kc: 1.0, pz: R(pz, 4) });
  };

  /* =========================================================================== wind on a duo-pitch shed */
  M.shed_wind = function (c, inp, span, length, eave, ridge, slope, bay) {
    c.section("Wind load (IS 875-3:2015)");
    var pd = LD.design_wind_pressure(c, M._Vb(inp), ridge, Math.trunc(num(inp.terrain)), num(inp.k1), num(inp.k3), 1.0,
      { area: bay * (2 * eave + span) });
    var hw = eave / span;
    var lw = length / span;
    var walls = LD.wall_cpe(hw, lw);
    var roof = LD.roof_cpe(slope, hw);
    var cpi = LD.CPI[inp.perm];
    c.info("External pressure coefficients",
      "walls A " + F(walls.A, "+.2f") + ", B " + F(walls.B, "+.2f") + ", C " + F(walls.C, "+.2f") + "; roof (θ=0°) windward " +
      F(roof.windward_0, "+.2f") + ", leeward " + F(roof.leeward_0, "+.2f") + "; (θ=90°) " + F(roof.roof_90_EG, "+.2f") + " / " +
      F(roof.roof_90_FH, "+.2f") + "  [" + roof.band + "]", "IS 875-3 Tables 5 & 6");
    c.let("Internal pressure coefficient", "Cpi", "±" + C.pystr(cpi), "", "IS 875-3 cl 7.3.2");
    var cases = {};
    [["WL 0°", [walls.A, walls.B, roof.windward_0, roof.leeward_0]],
      ["WL 90°", [walls.C, walls.C, roof.roof_90_EG, roof.roof_90_EG]]].forEach(function (e) {
      var name = e[0], lw_ = e[1][0], rw_ = e[1][1], lr = e[1][2], rr = e[1][3];
      [[1, "+Cpi"], [-1, "−Cpi"]].forEach(function (st) {
        var ci = st[0] * cpi;
        cases[name + " " + st[1]] = { lcol: lw_ - ci, rcol: rw_ - ci, lroof: lr - ci, rroof: rr - ci };
      });
    });
    var rows = Object.keys(cases).map(function (k) { var v = cases[k]; return [k, v.lcol, v.lroof, v.rroof, v.rcol]; });
    var tbl = M.pd_df(rows, ["Case", "Left column (Cpe−Cpi)", "Left roof", "Right roof", "Right column"]);
    var max_up = maxOf(Object.keys(cases).map(function (k) { return -Math.min(cases[k].lroof, cases[k].rroof); }));
    return { pd: pd, cases: cases, table: tbl, max_uplift_coef: max_up };
  };

  M.pd_df = function (rows, cols) { return C.table(rows, cols); };

  /* =========================================================================== PORTAL FRAME SHED */
  M._portal_model = function (span, eave, ridge, col_sec, raf_sec, base_fixed) {
    var f = new DS.frame2d.Frame();
    var n0 = f.node(0, 0);
    var n1 = f.node(0, eave);
    var n2 = f.node(span / 2, ridge);
    var n3 = f.node(span, eave);
    var n4 = f.node(span, 0);
    var E = E_KN;
    var m0 = f.member(n0, n1, E, col_sec.A * 1e-6, col_sec.Iz * 1e-12, { name: "Left column", group: "column" });
    var m1 = f.member(n1, n2, E, raf_sec.A * 1e-6, raf_sec.Iz * 1e-12, { name: "Left rafter", group: "rafter" });
    var m2 = f.member(n2, n3, E, raf_sec.A * 1e-6, raf_sec.Iz * 1e-12, { name: "Right rafter", group: "rafter" });
    var m3 = f.member(n3, n4, E, col_sec.A * 1e-6, col_sec.Iz * 1e-12, { name: "Right column", group: "column" });
    [n0, n4].forEach(function (n) { f.support(n, true, true, !!base_fixed); });
    return [f, [n0, n1, n2, n3, n4], [m0, m1, m2, m3]];
  };

  M._portal_cases = function (inp, f, members, col_sec, raf_sec, span, bay, slope, wind, purlin_w_per_m2) {
    var FR = DS.frame2d, LoadCase = FR.LoadCase, combine_cases = FR.combine_cases;
    var m0 = members[0], m1 = members[1], m2 = members[2], m3 = members[3];
    var dl_roof = (num(inp.sheet_dl) + num(inp.services) + purlin_w_per_m2) * bay;
    var dl_wall = inp.clad_walls ? num(inp.wall_dl) * bay : 0.0;
    var ll = LD.roof_live_load(slope) * bay;
    var DL = new LoadCase("DL");
    [m1, m2].forEach(function (m) { DL.add_member(m, ["gudl", 0.0, -(dl_roof + raf_sec.w * 9.81e-3), "length"]); });
    [m0, m3].forEach(function (m) { DL.add_member(m, ["gudl", 0.0, -(col_sec.w * 9.81e-3 + dl_wall), "length"]); });
    var LL = new LoadCase("LL");
    [m1, m2].forEach(function (m) { LL.add_member(m, ["gudl", 0.0, -ll, "projection"]); });
    var WLs = {}, WLk = [];
    var p = wind.pd * bay;
    Object.keys(wind.cases).forEach(function (name) {
      var k = wind.cases[name];
      var lc = new LoadCase(name);
      lc.add_member(m0, ["udl", 0.0, -k.lcol * p]);
      lc.add_member(m3, ["udl", 0.0, -k.rcol * p]);
      lc.add_member(m1, ["udl", 0.0, -k.lroof * p]);
      lc.add_member(m2, ["udl", 0.0, -k.rroof * p]);
      WLs[name] = lc; WLk.push(name);
    });
    var combos = { "1.5(DL+LL)": combine_cases([DL, LL], [1.5, 1.5], "1.5(DL+LL)") };
    WLk.forEach(function (wn) {
      var wl = WLs[wn];
      combos["1.2(DL+LL+" + wn + ")"] = combine_cases([DL, LL, wl], [1.2, 1.2, 1.2], "");
      combos["1.5(DL+" + wn + ")"] = combine_cases([DL, wl], [1.5, 1.5], "");
      combos["0.9DL+1.5" + wn] = combine_cases([DL, wl], [0.9, 1.5], "");
    });
    var service = { "DL+LL": combine_cases([DL, LL], [1, 1], "DL+LL"), "LL": LL };
    WLk.forEach(function (wn) {
      var wl = WLs[wn];
      service["DL+" + wn] = combine_cases([DL, wl], [1, 1], "");
      service[wn] = wl;
    });
    return [combos, service, { dl_roof: dl_roof, ll: ll }];
  };

  /* Envelope over combos for the given member ids: max |M|, max compression, max tension, max |V|. */
  M._member_forces = function (f, results, ids) {
    var env = { M: 0.0, Pc: 0.0, Pt: 0.0, V: 0.0, M_combo: "", P_at_M: 0.0 };
    Object.keys(results).forEach(function (cname) {
      var r = results[cname];
      ids.forEach(function (m) {
        var e = r.extremes(m);
        if (e.M_abs > env.M) { env.M = e.M_abs; env.M_combo = cname; env.P_at_M = -e.N_min; }
        env.Pc = Math.max(env.Pc, -e.N_min);
        env.Pt = Math.max(env.Pt, e.N_max);
        env.V = Math.max(env.V, e.V_abs);
      });
    });
    return env;
  };

  M._check_column = function (c, sec, env, fy, eave, Ly, Kz, tag) {
    if (tag === undefined) tag = "Column";
    c.section(tag + " – " + sec.name);
    var t = "(" + tag.toLowerCase() + ")";
    var comp = S.compression(c, env.Pc, sec, fy, eave, Ly, Kz, 1.0, { tag: t });
    var bend = S.bending(c, env.M, sec, fy, Ly, false, { tag: t });
    var sh = S.shear_strength(c, env.V, sec, fy, { tag: t });
    var comb = S.combined(c, env.Pc, env.M, comp, bend, sec, fy, { tag: t });
    return comp.ok && bend.ok && sh.ok && comb;
  };

  M._check_rafter = function (c, sec, env, fy, raf_len, LLT, tag) {
    if (tag === undefined) tag = "Rafter";
    c.section(tag + " – " + sec.name);
    var t = "(" + tag.toLowerCase() + ")";
    var comp = S.compression(c, env.Pc, sec, fy, raf_len, LLT, 1.0, 1.0, { tag: t });
    var bend = S.bending(c, env.M, sec, fy, LLT, false, { tag: t });
    var sh = S.shear_strength(c, env.V, sec, fy, { tag: t });
    var comb = S.combined(c, env.Pc, env.M, comp, bend, sec, fy, { tag: t });
    return comp.ok && bend.ok && sh.ok && comb;
  };

  M.run_portal = function (inp, mode) {
    var RC = DS.rcc;
    var c = new Calc("Portal frame industrial shed");
    var fyu = M._fy(inp), fy = fyu[0], fu = fyu[1];
    var span = num(inp.span), length = num(inp.length), bay = num(inp.bay), eave = num(inp.eave);
    var slope = num(inp.slope);
    var rise = span / 2 * Math.tan(radians(slope));
    var ridge = eave + rise;
    var raf_len = Math.hypot(span / 2, rise);
    var n_bays = Math.max(1, R(length / bay));
    bay = length / n_bays;
    var n_frames = n_bays + 1;

    c.section("Geometry");
    c.let("Span", "L", span, "m");
    c.let("Length of shed", "Lb", length, "m");
    c.let("Frame spacing (bays × spacing)", "s", C.pystr(n_bays) + " × " + F(bay, ".3f"), "m");
    c.let("Eave height", "h", eave, "m");
    c.calc("Ridge height", "hr", "h + L/2*tan(radians(th))", "m", "", { h: eave, L: span, th: slope });
    c.calc("Rafter length (each side)", "Lr", "sqrt((L/2)**2 + (hr - h)**2)", "m", "", { L: span, hr: ridge, h: eave });
    if (slope < 5) {
      c.miss("Roof slope < 5° – check ponding and sheet manufacturer's minimum slope", "IS 875-3 Table 6",
        "Important");
    }

    c.section("Dead & imposed loads (IS 875 Parts 1 & 2)");
    c.let("Roof sheeting", "gs", num(inp.sheet_dl), "kN/m²", "IS 875-1");
    c.let("Services / collateral", "gc", num(inp.services), "kN/m²", "IS 875-1");
    c.info("Crane loads", "not handled by this module – for an EOT / hand-operated crane use the 'Complete steel shed' module (steel_shed), " +
      "which designs the gantry girder, bracket, crane load combinations and stepped-column action", "IS 875-2 cl 6.3 / IS 800 Table 4");
    var llr = c.calc("Roof imposed load (no access)", "qr", "max(0.75 - 0.02*max(th - 10, 0), 0.40)", "kN/m²",
      "IS 875-2 Table 2", { th: slope });
    var wind = M.shed_wind(c, inp, span, length, eave, ridge, slope, bay);

    var pd_p = M.purlin_wind(c, inp, ridge, bay * num(inp.purlin_spacing));
    var wup_p = c.calc("Net uplift pressure on purlins", "wp", "Cp*pd", "kN/m²", "IS 875-3 Table 6",
      "worst roof suction (Cpe − Cpi) of the wind cases", { Cp: R(wind.max_uplift_coef, 3), pd: R(pd_p, 4) });
    var pur = M.design_purlin(c, bay, num(inp.purlin_spacing), slope, num(inp.sheet_dl) + num(inp.services),
      llr, wup_p, fy, fu, !!inp.sag_rods, n_bays >= 3,
      mode === "check" ? inp.purlin_sec : null);
    var purlin_w = pur.w * 9.81e-3 / num(inp.purlin_spacing);           // kN/m² on slope

    var Kz = num(inp.col_K);
    var Ly_col = num(inp.col_restraint);
    var LLT_raf = num(inp.fly_brace);
    var base_fixed = inp.base === "Fixed";

    var ismb = by_weight(ISMB).filter(function (n) { return section(n).h >= 150; });
    if (inp.allow_builtup === undefined ? true : inp.allow_builtup) {
      var lim_w = section(last(ismb)).w * 0.8;
      var heavier = builtup_series().filter(function (n) { return section(n).w > lim_w; });
      ismb = ismb.concat(heavier).map(function (n, i) { return [n, i]; })
        .sort(function (x, y) { return section(x[0]).w - section(y[0]).w || x[1] - y[1]; }).map(function (x) { return x[0]; });
    }

    function analyse(col_name, raf_name) {
      var col = section(col_name), raf = section(raf_name);
      var mdl = M._portal_model(span, eave, ridge, col, raf, base_fixed), f = mdl[0], nodes = mdl[1], members = mdl[2];
      var cs = M._portal_cases(inp, f, members, col, raf, span, bay, slope, wind, purlin_w);
      var res = {}, sres = {};
      Object.keys(cs[0]).forEach(function (k) { res[k] = f.solve(cs[0][k]); });
      Object.keys(cs[1]).forEach(function (k) { sres[k] = f.solve(cs[1][k]); });
      return [f, nodes, members, res, sres, cs[2]];
    }

    function deflections(f, nodes, sres) {
      var ridge_n = nodes[2], eave_l = nodes[1], eave_r = nodes[3];
      var v = Math.abs(sres.LL.disp(ridge_n)[1]) * 1000;
      var sway = maxOf(Object.keys(sres).filter(function (k) { return k.indexOf("WL") >= 0; }).map(function (k) {
        return Math.max(Math.abs(sres[k].disp(eave_l)[0]), Math.abs(sres[k].disp(eave_r)[0]));
      })) * 1000;
      return [v, sway];
    }
    function firstOk(list, pred) { for (var i = 0; i < list.length; i++) if (pred(list[i])) return list[i]; return last(list); }

    var col_name, raf_name, A, f, nodes, members, res, sres, ld, env_c, env_r, v, sway, it;
    if (mode === "check") {
      col_name = inp.col_sec; raf_name = inp.raf_sec;
    } else if (mode === "thumb") {
      raf_name = firstOk(ismb, function (n) { return section(n).h >= span * 1000 / 40; });
      col_name = raf_name;
      c.info("Thumb-rule sizing", "rafter depth ≈ span/40 → " + raf_name + "; column = rafter section",
        "Subramanian / INSDAG practice");
    } else {
      col_name = raf_name = "ISMB 300";
      for (it = 0; it < 12; it++) {
        A = analyse(col_name, raf_name); f = A[0]; nodes = A[1]; members = A[2]; res = A[3]; sres = A[4]; ld = A[5];
        env_c = M._member_forces(f, res, [members[0], members[3]]);
        env_r = M._member_forces(f, res, [members[1], members[2]]);
        var scratch = new Calc("scratch");
        var new_col = firstOk(ismb, function (n) { return M._check_column(scratch, section(n), env_c, fy, eave, Ly_col, Kz); });
        var new_raf = firstOk(ismb, function (n) { return M._check_rafter(scratch, section(n), env_r, fy, raf_len, LLT_raf); });
        var A2 = analyse(new_col, new_raf);
        var vs = deflections(A2[0], A2[1], A2[4]); v = vs[0]; sway = vs[1];
        var bump = 0;
        while ((v > span * 1000 / 180 || sway > eave * 1000 / 150) && bump < 10) {
          if (v > span * 1000 / 180 && ismb.indexOf(new_raf) < ismb.length - 1) new_raf = ismb[ismb.indexOf(new_raf) + 1];
          if (sway > eave * 1000 / 150 && ismb.indexOf(new_col) < ismb.length - 1) new_col = ismb[ismb.indexOf(new_col) + 1];
          A2 = analyse(new_col, new_raf);
          vs = deflections(A2[0], A2[1], A2[4]); v = vs[0]; sway = vs[1];
          bump += 1;
        }
        if (new_col === col_name && new_raf === raf_name) break;
        col_name = new_col; raf_name = new_raf;
      }
      // final verification: forces change when stiffness changes – bump any member that still fails
      for (it = 0; it < 20; it++) {
        A = analyse(col_name, raf_name); f = A[0]; nodes = A[1]; members = A[2]; res = A[3]; sres = A[4];
        env_c = M._member_forces(f, res, [members[0], members[3]]);
        env_r = M._member_forces(f, res, [members[1], members[2]]);
        var dv = deflections(f, nodes, sres); v = dv[0]; sway = dv[1];
        var sc = new Calc("scratch");
        var okc = M._check_column(sc, section(col_name), env_c, fy, eave, Ly_col, Kz) && sway <= eave * 1000 / 150;
        var okr = M._check_rafter(sc, section(raf_name), env_r, fy, raf_len, LLT_raf) && v <= span * 1000 / 180;
        if (okc && okr) break;
        if (!okc && ismb.indexOf(col_name) < ismb.length - 1) col_name = ismb[ismb.indexOf(col_name) + 1];
        if (!okr && ismb.indexOf(raf_name) < ismb.length - 1) raf_name = ismb[ismb.indexOf(raf_name) + 1];
      }
    }

    var col = section(col_name), raf = section(raf_name);
    A = analyse(col_name, raf_name); f = A[0]; nodes = A[1]; members = A[2]; res = A[3]; sres = A[4]; ld = A[5];
    c.section("Analysis (direct stiffness, 2D)");
    c.info("Load combinations", Object.keys(res).join("; "), "IS 800 Table 4 / IS 875-5");
    c.let("Roof dead load on frame", "wd", R(ld.dl_roof, 3), "kN/m", "incl. purlins, sheeting, services");
    c.let("Roof imposed load on frame (plan)", "wl", R(ld.ll, 3), "kN/m");
    env_c = M._member_forces(f, res, [members[0], members[3]]);
    env_r = M._member_forces(f, res, [members[1], members[2]]);
    c.let("Column design forces", "", "M = " + F(env_c.M, ".1f") + " kN·m (" + env_c.M_combo + "), P = " + F(env_c.Pc, ".1f") + " kN, " +
      "V = " + F(env_c.V, ".1f") + " kN", "");
    c.let("Rafter design forces", "", "M = " + F(env_r.M, ".1f") + " kN·m (" + env_r.M_combo + "), P = " + F(env_r.Pc, ".1f") + " kN, " +
      "V = " + F(env_r.V, ".1f") + " kN", "");
    M._check_column(c, col, env_c, fy, eave, Ly_col, Kz);
    M._check_rafter(c, raf, env_r, fy, raf_len, LLT_raf);

    c.section("Serviceability (IS 800 Table 6)");
    var dvs = deflections(f, nodes, sres); v = dvs[0]; sway = dvs[1];
    c.check("Rafter vertical deflection (LL) ≤ span/180", v, span * 1000 / 180, { unit: "mm", clause: "IS 800 Table 6" });
    c.check("Eave lateral sway (WL) ≤ h/150", sway, eave * 1000 / 150, { unit: "mm", clause: "IS 800 Table 6" });

    // reactions envelope
    var Vmax = 0.0, Umax = 0.0, Hmax = 0.0, Mbmax = 0.0, bcombos = [];
    Object.keys(res).forEach(function (k) {
      var r = res[k];
      [nodes[0], nodes[4]].forEach(function (n, j) {
        var rx = r.reactions[n][0], ry = r.reactions[n][1], rm = base_fixed ? r.reactions[n][2] : 0;
        Vmax = Math.max(Vmax, ry);
        Umax = Math.max(Umax, -ry);
        Hmax = Math.max(Hmax, Math.abs(rx));
        Mbmax = Math.max(Mbmax, Math.abs(rm));
        bcombos.push({ name: k + (j ? " (right)" : " (left)"), P: ry, H: rx, M: rm });
      });
    });
    var Vserv = Math.max(sres["DL+LL"].reactions[nodes[0]][1], sres["DL+LL"].reactions[nodes[4]][1]);
    c.section("Support reactions");
    c.let("Max. factored vertical reaction", "Vu", R(Vmax, 1), "kN");
    c.let("Max. factored uplift", "Uu", R(Umax, 1), "kN");
    c.let("Max. factored horizontal reaction", "Hu", R(Hmax, 1), "kN");
    if (base_fixed) c.let("Max. factored base moment (fixed base)", "Mu,b", R(Mbmax, 1), "kN·m");
    var bp = null, bpx = null;
    if (!base_fixed) {
      bp = S.base_plate(c, Vmax, Hmax, Umax, col, num(inp.fck), fy, fu, num(inp.bolt_d), "4.6", Math.trunc(num(inp.n_bolts)));
    } else {
      // moment-resisting (gusseted) base: same design as the steel_shed module (bolts outside the flanges)
      if (!DS.modules_shed) {
        c.miss("Fixed base: design moment-resisting (gusseted) base plate & anchor bolts for the column base moment",
          "IS 800 cl 7.4", "Critical");
      }
    }
    if (base_fixed && DS.modules_shed) {
      bpx = DS.modules_shed.base_plate(c, "column (fixed base)", col, bcombos, true, num(inp.fck), fy, fu, null, null);
      bp = { Lp: bpx.Lp, Bp: bpx.Bp, tp: bpx.tp, bolt_d: bpx.d, n_bolts: bpx.n, Lemb: bpx.Le, Ltot: bpx.Ltot, eb: bpx.eb, gus: bpx.gus,
        key: bpx.key, fixed: true };
      c.info("Fixed base", "anchor bolts " + C.pystr(bp.n_bolts) + "-M" + F(bp.bolt_d, "g") + " outside the flanges, input bolt Ø / number used only for pinned bases", "IS 800 cl 7.4");
    }

    c.section("Foundation (isolated pad)");
    var df = num(inp.df), gsoil = num(inp.soil_gamma) || 18.0, mu = num(inp.mu_soil) || 0.5, sbc = num(inp.sbc);
    var ped = [Math.max(col.h / 1000 + 0.3, bp ? bp.Lp / 1000 + 0.2 : 0, 0.45), Math.max(col.b / 1000 + 0.3, bp ? bp.Bp / 1000 + 0.2 : 0, 0.45)];
    ped = [C.ceil_to(ped[0], 0.05), C.ceil_to(ped[1], 0.05)];
    var hlev = df + 0.3;
    c.let("Pedestal (top at +0.30 m)", "a × b", F(ped[0], ".2f") + " × " + F(ped[1], ".2f"), "m", "Practice", "≥ column + 300 mm and ≥ base plate + 200 mm");
    c.let("Lever arm of base shear to underside of footing", "hb", R(hlev, 3), "m", "", "Df + 0.30 m pedestal above GL");
    // base reactions → actions at the underside of the footing: N = Ry, Mf = −Mz + Rx·hb (signed)
    function act(r, n) { var x = r.reactions[n]; return { P: x[1], H: x[0], M: -(base_fixed ? x[2] : 0) + x[0] * hlev }; }
    function W0(Lf, Dm) { return Lf * Lf * Dm * 25 + ped[0] * ped[1] * (df - Dm + 0.3) * 25 + (Lf * Lf - ped[0] * ped[1]) * Math.max(df - Dm, 0) * gsoil; }
    var winds = Object.keys(sres).filter(function (k) { return k.indexOf("WL") === 0; });
    var svc = [{ name: "DL+LL", wind: false }].concat(winds.map(function (k) { return { name: "DL+" + k, wind: true }; }));
    function press(Lf, Dm, cs, n, cc) {
      var a0 = act(sres[cs.name], n), N = a0.P + W0(Lf, Dm), e = N > 0 ? Math.abs(a0.M) / N : 1e9, q0 = df * gsoil;
      var pm = (e <= Lf / 6 ? N / (Lf * Lf) * (1 + 6 * e / Lf) : e < Lf / 2 ? 2 * N / (3 * Lf * (Lf / 2 - e)) : 1e9) - q0;
      var lim = cs.wind ? 1.25 * sbc : sbc, elim = Lf / (cs.wind ? 4 : 6);
      var ok = N > 0 && e <= elim + 1e-9 && pm <= lim;
      if (cc) {
        cc.calc("Net soil pressure, " + cs.name, "pmax", e <= Lf / 6 ? "N/L**2*(1 + 6*e/L) - q0" : "2*N/(3*L*(L/2 - e)) - q0", "kN/m²",
          "IS 456 cl 34.1 / IS 1904", "N = P + footing + pedestal + soil; e = |M + H·hb| / N; q0 = overburden removed",
          { N: R(N, 3), L: Lf, e: R(Math.min(e, Lf / 2 - 0.01), 4), q0: R(q0, 3) });
        cc.check("Soil pressure ≤ " + (cs.wind ? "1.25 × " : "") + "SBC (" + cs.name + ")", pm, lim, { unit: "kN/m²",
          clause: cs.wind ? "IS 1904 (25 % increase for wind)" : "IS 1904" });
        cc.check("Eccentricity e ≤ L/" + (cs.wind ? "4 (≥ 75 % contact)" : "6 (full contact)") + " (" + cs.name + ")", e, elim,
          { unit: "m", clause: "IS 456 cl 34.1 / practice" });
      }
      return { ok: ok, u: Math.max(pm / lim, e / elim) };
    }
    function stab(Lf, Dm, wn, n, cc) {
      var t = sres["DL+" + wn], w = sres[wn], aT = act(t, n), aW = act(w, n);
      var aD = { P: aT.P - aW.P, H: aT.H - aW.H, M: aT.M - aW.M };
      var Wf = W0(Lf, Dm), Uw = Math.max(-aW.P, 0), same = aD.M * aW.M >= 0;
      var MOd = same ? Math.abs(aD.M) : 0, MO = (same ? Math.abs(aW.M) : Math.abs(aD.M + aW.M)) + Uw * Lf / 2;
      var MR = (Wf + Math.max(aD.P, 0)) * Lf / 2;
      var Nn = 0.9 * (Wf + Math.max(aD.P, 0)) - Uw, Hs = Math.abs(aT.H);
      var okO = 1.2 * MOd + 1.4 * MO <= 0.9 * MR, okS = mu * Math.max(Nn, 0) >= 1.4 * Hs;
      if (cc) {
        cc.calc("Overturning (" + wn + "): 0.9 MR − (1.2 MO,DL + 1.4 MO,WL)", "ΔM", "0.9*MR - (1.2*MOd + 1.4*MO)", "kN·m", "IS 456 cl 20.1",
          "MR = (footing + soil + DL reaction)·L/2; MO,WL incl. wind uplift × L/2", { MR: R(MR, 3), MOd: R(MOd, 3), MO: R(MO, 3) });
        cc.check("Overturning (" + wn + ")", 1.2 * MOd + 1.4 * MO, 0.9 * MR, { unit: "kN·m", clause: "IS 456 cl 20.1" });
        cc.calc("Sliding resistance (" + wn + ")", "FoS", "mu*(0.9*(W + PD) - Uw)/H", "", "IS 456 cl 20.2",
          "0.9 × restoring weight less wind uplift; passive earth ignored", { mu: mu, W: R(Wf, 3), PD: R(Math.max(aD.P, 0), 3), Uw: R(Uw, 3), H: R(Math.max(Hs, 1e-6), 3) });
        cc.check("Sliding FoS ≥ 1.4 (" + wn + ")", mu * Math.max(Nn, 0) / Math.max(Hs, 1e-6), 1.4, { clause: "IS 456 cl 20.2", mode: ">=" });
      }
      return { ok: okO && okS, u: Math.max((1.2 * MOd + 1.4 * MO) / Math.max(0.9 * MR, 1e-9), 1.4 * Hs / Math.max(mu * Math.max(Nn, 0), 1e-9)) };
    }
    function worse(fn) { var a0 = fn(nodes[0]), a4 = fn(nodes[4]); return a4.u > a0.u ? [nodes[4], a4] : [nodes[0], a0]; }
    // gravity case for the IS 456 footing design and the factored base actions
    var ng = sres["DL+LL"].reactions[nodes[4]][1] > sres["DL+LL"].reactions[nodes[0]][1] ? nodes[4] : nodes[0];
    var Mserv = Math.abs(act(sres["DL+LL"], ng).M);
    var Mfu = 0.0;
    Object.keys(res).forEach(function (k) { [nodes[0], nodes[4]].forEach(function (n) { Mfu = Math.max(Mfu, Math.abs(act(res[k], n).M)); }); });
    c.let("Service gravity load on footing (DL+LL)", "P", R(Vserv, 2), "kN");
    c.calc("Moment at underside of footing (DL+LL)", "Ms", "abs(-Mb + H*hb)", "kN·m", "statics",
      { Mb: R(base_fixed ? sres["DL+LL"].reactions[ng][2] : 0, 3), H: R(sres["DL+LL"].reactions[ng][0], 3), hb: R(hlev, 3) });
    c.let("Max. factored moment at underside of footing (all combinations)", "Mu", R(Mfu, 2), "kN·m", "IS 800 Table 4", "|−Mb + H·hb|, envelope");
    function allOK(Lf, Dm) {        // → "" when all pass, else the governing criterion
      if (!svc.every(function (cs) { return press(Lf, Dm, cs, nodes[0], null).ok && press(Lf, Dm, cs, nodes[4], null).ok; })) return "soil pressure / eccentricity";
      if (!winds.every(function (wn) { return stab(Lf, Dm, wn, nodes[0], null).ok && stab(Lf, Dm, wn, nodes[4], null).ok; })) return "overturning / sliding under wind";
      return 0.9 * W0(Lf, Dm) >= Umax ? "" : "uplift";
    }
    // IS 456 footing design load: column DL+LL + pedestal + soil on the footing (the footing self-weight is the 10 % inside)
    function Wtop(Lf, Dm) { return ped[0] * ped[1] * (df - Dm + 0.3) * 25 + (Lf * Lf - ped[0] * ped[1]) * Math.max(df - Dm, 0) * gsoil; }
    var Lu = Math.max(C.ceil_to(Math.sqrt(1.1 * Vserv / sbc), 0.1), C.ceil_to(Math.max(ped[0], ped[1]) + 0.6, 0.1), 1.2), Lgrav = Lu, Dd = 0.3;
    var why = "", gov = "";
    for (it = 0; it < 150; it++) {
      var sc_ = new Calc("s");
      var trial = RC.isolated_footing(sc_, Vserv + Wtop(Lu, Dd), Mserv, Vmax, Mfu, ped[1] * 1000, ped[0] * 1000, sbc, num(inp.fck), 500.0, { fixed_size: [Lu, Lu] });
      Dd = trial.D / 1000;
      why = sc_.failures.length ? sc_.failures[0].label : allOK(Lu, Dd);
      if (!why) break;
      gov = why;
      Lu = R(Lu + 0.1, 2);
    }
    var size = [Lu, Lu];
    if (Lu > Lgrav + 1e-9) {
      c.info("Footing size governed by moment / stability", "plan size increased to " + F(size[0], ".2f") + " m – governed by " + gov + " (checks: soil pressure with eccentricity, " +
        "overturning, sliding, uplift 0.9 × (footing + soil) ≥ factored uplift)", "IS 456 cl 20 / 34");
    }
    c.let("Load on footing for IS 456 design (DL+LL + pedestal + soil on footing)", "P", R(Vserv + Wtop(Lu, Dd), 2), "kN");
    var ftg = RC.isolated_footing(c, Vserv + Wtop(Lu, Dd), Mserv, Vmax, Mfu, ped[1] * 1000, ped[0] * 1000, sbc,
      num(inp.fck), 500.0, { fixed_size: size, title: "Footing" });
    c.section("Footing – soil pressure (service cases) & stability (IS 456 cl 20)");
    svc.forEach(function (cs) { var wv = worse(function (n) { return press(ftg.L, ftg.D / 1000, cs, n, null); }); press(ftg.L, ftg.D / 1000, cs, wv[0], c); });
    winds.forEach(function (wn) { var wv = worse(function (n) { return stab(ftg.L, ftg.D / 1000, wn, n, null); }); stab(ftg.L, ftg.D / 1000, wn, wv[0], c); });
    var w_res = W0(ftg.L, ftg.D / 1000);
    c.calc("Weight of footing + pedestal + soil over footing", "Wf", "L**2*D*25 + a*b*(Df - D + 0.3)*25 + (L**2 - a*b)*(Df - D)*gs", "kN", "IS 875-1",
      { L: ftg.L, D: ftg.D / 1000, a: ped[0], b: ped[1], Df: df, gs: gsoil });
    c.check("Uplift resistance: 0.9 × (footing + soil) ≥ factored uplift (0.9DL + 1.5WL)", 0.9 * w_res, Umax, { unit: "kN", clause: "IS 456 cl 20.1",
      mode: ">=" });

    // ---------------------------------------------------------------- quantities
    var n_cols = 2 * n_frames;
    var n_purl_side = Math.ceil(raf_len / num(inp.purlin_spacing)) + 1;
    var girt_rows = inp.clad_walls ? Math.ceil(eave / 1.8) : 0;
    var girt = section("ISMC 100");
    var eave_strut = section("ISMC 125");
    var brace_w = ISA["ISA 50x50x6"][0];
    var diag = Math.hypot(bay, raf_len);
    var q = [];
    q.push(Q("Structural steel in portal frames – rolled sections, fabrication & erection incl. " +
      "primer + 2 coats enamel", "kg",
      [kg_row("Columns " + col_name, n_cols, eave, col.w),
        kg_row("Rafters " + raf_name, 2 * n_frames, raf_len, raf.w),
        kg_row("Connections, haunches, stiffeners (allowance 8 %)", 1,
          0.08 * (n_cols * eave * col.w + 2 * n_frames * raf_len * raf.w), 1.0)],
      null, RATE.steel_struct));
    q.push(Q("Secondary steel – purlins, girts, eave struts, bracing", "kg",
      [kg_row("Purlins " + pur.name, 2 * n_purl_side, length, pur.w),
        girt_rows ? kg_row("Side girts ISMC 100", 2 * girt_rows, length, girt.w) :
          kg_row("Side girts – none", 0, 0, 0),
        kg_row("Eave struts ISMC 125", 2, length, eave_strut.w),
        kg_row("Roof X-bracing ISA 50x50x6 (end bays, both slopes)", 8, diag, brace_w),
        kg_row("Wall X-bracing ISA 50x50x6 (end bays, both long walls)", 8, Math.hypot(bay, eave), brace_w)],
      null, RATE.steel_light));
    q.push(Q("Colour-coated profiled roofing sheet 0.50 mm TCT with fixings", "sqm",
      [row("Roof (both slopes)", 2, raf_len + 0.3, length + 0.6)], null, RATE.roof_sheet));
    if (inp.clad_walls) {
      q.push(Q("Colour-coated wall cladding sheet 0.45 mm TCT", "sqm",
        [row("Long walls", 2, length, null, eave), row("Gable walls (rectangle)", 2, span, null, eave),
          row("Gable walls (triangle)", 2, span, null, rise / 2)], null, RATE.wall_sheet));
    }
    if (bp) {
      var bprows = [row("Base plates", n_cols, bp.Lp / 1000, bp.Bp / 1000, bp.tp / 1000 * 7850),
        kg_row("Anchor bolts M" + F(bp.bolt_d, "g"), n_cols * bp.n_bolts, bp.fixed ? bp.Ltot / 1000 : bp.Lemb / 1000 + 0.15,
          Math.pow(bp.bolt_d, 2) / 162)];
      if (bp.gus) bprows.push(row("Base gussets (4 per base)", 4 * n_cols, bp.gus.L / 1000, bp.gus.h / 1000, bp.gus.t / 1000 * 7850));
      if (bp.key) bprows.push(row("Shear keys", n_cols, bp.key.b / 1000, bp.key.d / 1000, bp.key.t / 1000 * 7850));
      q.push(Q("Base plates & anchor bolts (MS / IS 2062)", "kg", bprows, null, RATE.anchor_bolt));
    }
    var bbs = CM.footing_bbs("Pad footing", n_cols, ftg.L, ftg.B, ftg.D, ftg);
    q = q.concat(CM.footing_qty("Shed footings", n_cols, ftg.L, ftg.B, ftg.D, num(inp.fck), num(inp.df),
      { pedestal: [ped[0], ped[1], num(inp.df) - ftg.D / 1000 + 0.3], bbs: bbs }));
    var plan_area = span * length;
    var steel_main = 0;
    q.slice(0, 2).forEach(function (qq) { qq.rows.forEach(function (r) { steel_main += r.nos * r.length * r.breadth; }); });

    // ---------------------------------------------------------------- thumb rules & missing
    c.thumb("Rafter depth", span * 1000 / 40, raf.h, "mm", "span / 40 (hot-rolled portal, no haunch)",
      "INSDAG / Subramanian");
    c.thumb("Purlin depth", bay * 1000 / 45, pur.sec.h, "mm", "purlin span / 45", "Duggal");
    c.thumb("Steel consumption (frames + secondary)", 40.0, steel_main / plan_area, "kg/m²",
      "35–45 kg/m² for prismatic hot-rolled portals (tapered PEB: 20–30 kg/m²)", "Industry practice");
    c.miss("Eave (knee) and apex moment connections – design end plates, bolts and haunch for " +
      "M ≈ " + F(env_r.M, ".0f") + " kN·m", "IS 800 cl 10", "Critical");
    c.miss("Gable end framing / wind columns and longitudinal bracing system – sized nominally (ISA 50x50x6); " +
      "design for gable wind force", "IS 800 cl 4.4", "Important");
    c.miss("Local wind pressure coefficients at roof edges / ridge for sheeting & fasteners (Cpe up to −2.0)",
      "IS 875-3 Table 6 (local)", "Important");
    if (inp.crane) {      // legacy saved input (the option was removed from this module)
      c.miss("Crane loads not included – add crane girder, bracket and crane load combinations", "IS 875-2 / IS 807",
        "Critical");
    }
    c.miss("Seismic check – light sheds are usually wind-governed; verify for zone IV/V", "IS 1893-1:2016",
      "Advisory");
    c.miss("Corrosion protection / painting specification and fire protection", "IS 800 cl 15–16", "Advisory");

    // ---------------------------------------------------------------- drawings
    var gov = null, govv = -Infinity;
    Object.keys(res).forEach(function (k) {
      var mv = maxOf(members.map(function (m) { return res[k].extremes(m).M_abs; }));
      if (gov === null || mv > govv) { gov = k; govv = mv; }
    });
    var sheets = M._portal_drawings(inp, span, length, bay, n_bays, eave, ridge, slope, col, raf, pur, bp, ftg, ped,
      f, res[gov], gov, n_purl_side);

    var summary = { "Columns": col_name, "Rafters": raf_name, "Purlins": pur.name + " @ " + F(num(inp.purlin_spacing), "g") + " m",
      "Frames": C.pystr(n_frames) + " nos @ " + F(bay, ".2f") + " m", "Max utilisation": F(c.max_utilisation, ".2f"),
      "Steel (main + secondary)": F(steel_main / 1000, ",.2f") + " t (" + F(steel_main / plan_area, ".1f") + " kg/m²)",
      "Footing": F(ftg.L, ".2f") + " × " + F(ftg.B, ".2f") + " × " + F(ftg.D / 1000, ".2f") + " m",
      "Base plate": bp ? F(bp.Lp, "g") + "×" + F(bp.Bp, "g") + "×" + F(bp.tp, "g") + " mm, " + C.pystr(bp.n_bolts) + "-M" + F(bp.bolt_d, "g") : "—" };
    var tables = { "Wind cases (Cpe − Cpi)": wind.table,
      "Member forces envelope": C.table([
        ["Columns", col_name, env_c.M, env_c.Pc, env_c.Pt, env_c.V, env_c.M_combo],
        ["Rafters", raf_name, env_r.M, env_r.Pc, env_r.Pt, env_r.V, env_r.M_combo]],
      ["Member", "Section", "M (kN·m)", "P comp (kN)", "P tens (kN)", "V (kN)", "Governing combo"]) };
    return C.DesignResult({ module: "steel_portal", title: "Portal frame industrial shed", inputs: inp, calc: c, summary: summary,
      drawings: sheets, quantities: q, bbs: bbs, tables: tables, references: STEEL_REFS });
  };

  M._portal_drawings = function (inp, span, length, bay, n_bays, eave, ridge, slope, col, raf, pur, bp, ftg, ped, frame, rgov,
    gov_name, n_purl_side) {
    var D = DS.drawing, View = D.View, Sheet = D.Sheet;
    var S_ = span * 1000, L_ = length * 1000, H_ = eave * 1000, R_ = ridge * 1000;
    var hc = col.h, hr = raf.h, k, x, y;
    // cross-section
    var v = new View("Typical portal frame – cross section");
    v.line(-0.08 * S_, 0, 1.08 * S_, 0, "SOIL");
    v.rect(-hc, 0, hc, H_, "STEEL", "steel");
    v.rect(S_, 0, hc, H_, "STEEL", "steel");
    var ang = radians(slope);
    [[1, 0], [-1, S_]].forEach(function (e) {
      var x0 = e[1];
      var top = [[x0, H_ + hr / Math.cos(ang)], [S_ / 2, R_ + hr / Math.cos(ang)]];
      var bot = [[x0, H_], [S_ / 2, R_]];
      v.poly([bot[0], bot[1], top[1], top[0]], true, "STEEL", "steel");
    });
    for (k = 0; k < n_purl_side; k++) {
      var t = k / Math.max(n_purl_side - 1, 1);
      [0, S_].forEach(function (x0) {
        var xx = x0 + (S_ / 2 - x0) * t;
        var yy = H_ + (R_ - H_) * t + hr / Math.cos(ang) + 60;
        v.rect(xx - 40, yy, 80, 60, "STEEL");
      });
    }
    v.dim(0, 0, S_, 0, 12, "SPAN " + F(S_, ",.0f"));
    v.dim(-hc, 0, -hc, H_, 10, "EAVE " + F(H_, ",.0f"));
    v.dim(S_ + hc, 0, S_ + hc, R_, -10, "RIDGE " + F(R_, ",.0f"));
    v.text(S_ / 4, H_ + (R_ - H_) / 2 + hr * 3, "RAFTER " + raf.name, 2.4, { anchor: "middle", rot: slope });
    v.text(-hc - 0.03 * S_, H_ / 2, "COLUMN " + col.name, 2.4, { anchor: "middle", rot: 90 });
    v.text(S_ / 2, R_ + hr * 6, "ROOF SLOPE " + F(slope, "g") + "° ; PURLINS " + pur.name + " @ " + F(num(inp.purlin_spacing), "g") + " m",
      2.2, { anchor: "middle" });
    // plan
    var p = new View("Roof framing plan");
    p.rect(0, 0, L_, S_, "OUTLINE");
    for (k = 0; k < n_bays + 1; k++) {
      x = k * bay * 1000;
      p.line(x, -0.06 * S_, x, 1.06 * S_, "GRID");
      p.text(x, -0.12 * S_, String(k + 1), 2.6, { anchor: "middle" });
    }
    p.line(0, S_ / 2, L_, S_ / 2, "CENTER");
    for (k = 1; k < n_purl_side - 1; k++) {
      y = S_ / 2 * k / (n_purl_side - 1);
      p.line(0, y, L_, y, "HIDDEN");
      p.line(0, S_ - y, L_, S_ - y, "HIDDEN");
    }
    [0, (n_bays - 1) * bay * 1000].forEach(function (bx) {
      [0, S_ / 2].forEach(function (y0) {
        p.line(bx, y0, bx + bay * 1000, y0 + S_ / 2, "STEEL");
        p.line(bx, y0 + S_ / 2, bx + bay * 1000, y0, "STEEL");
      });
    });
    p.dim(0, S_, L_, S_, -8, "LENGTH " + F(L_, ",.0f") + " (" + C.pystr(n_bays) + " BAYS @ " + F(bay * 1000, ",.0f") + ")");
    p.dim(L_, 0, L_, S_, -8);
    p.text(L_ / 2, -0.22 * S_, "Dashed = purlins, X = roof bracing in end bays", 2.2, { anchor: "middle" });
    var bmd = CM.frame_bmd_view(frame, rgov, "Bending moment diagram – " + gov_name + " (kN·m)");
    var views = [v, p, bmd];
    if (bp) {
      var b = new View("Base plate detail – plan");
      b.rect(0, 0, bp.Lp, bp.Bp, "STEEL");
      var cx = bp.Lp / 2, cy = bp.Bp / 2;
      b.rect(cx - col.h / 2, cy - col.b / 2, col.h, col.b, "HIDDEN");
      if (bp.fixed) {                                                   // moment base: bolts outside flanges, gussets at flange tips
        var nn = Math.max(2, Math.round(bp.n_bolts / 2));
        [bp.eb, bp.Lp - bp.eb].forEach(function (xx) {
          for (var kb = 0; kb < nn; kb++) b.circle(xx, bp.eb + (bp.Bp - 2 * bp.eb) * kb / (nn - 1), bp.bolt_d / 2 + 3, "STEEL");
        });
        [cy - col.b / 2, cy + col.b / 2].forEach(function (yy) {
          b.line(0, yy, cx - col.h / 2, yy, "STEEL");
          b.line(cx + col.h / 2, yy, bp.Lp, yy, "STEEL");
        });
      } else {
        [cx - col.h / 4, cx + col.h / 4].forEach(function (xx) {          // pinned base: bolts inside flanges
          [cy - Math.max(col.b / 4, col.tw / 2 + 45), cy + Math.max(col.b / 4, col.tw / 2 + 45)].forEach(function (yy) {
            b.circle(xx, yy, bp.bolt_d / 2 + 3, "STEEL");
          });
        });
      }
      b.dim(0, bp.Bp, bp.Lp, bp.Bp, -8);
      b.dim(bp.Lp, 0, bp.Lp, bp.Bp, -8);
      b.text(bp.Lp / 2, -40, "PLATE " + F(bp.tp, "g") + " THK, " + C.pystr(bp.n_bolts) + "-M" + F(bp.bolt_d, "g") + " ANCHOR BOLTS, " +
        "EMBED " + F(bp.Lemb, ".0f") + (bp.fixed ? ", 4 GUSSETS " + F(bp.gus ? bp.gus.t : 12, "g") + " THK" : ""), 2.2, { anchor: "middle" });
      views.push(b);
    }
    var sh1 = new Sheet("Portal frame shed – general arrangement", "ST-01", views,
      ["Steel grade " + inp.steel + "; bolts property class 4.6 / 8.8 as noted.",
        "Purlins " + pur.name + " with " + (inp.sag_rods ? "sag rods at mid-span" : "no sag rods") + ".",
        "All welds 6 mm continuous fillet unless noted. Shop primer + 2 coats synthetic enamel.",
        "Design wind: " + inp.city + " (Vb " + F(M._Vb(inp), "g") + " m/s), terrain category " + C.pystr(inp.terrain) + ".",
        "Knee and apex connections to be designed / detailed by fabricator for the moments shown.",
        "Verify all dimensions at site before fabrication."]);
    var sh2 = new Sheet("Portal frame shed – foundation & sections", "ST-02",
      CM.footing_views(ftg.L, ftg.B, ftg.D, ped[1] * 1000, ped[0] * 1000, ftg, 50, num(inp.df),
        0.10, 0.3, "Column footing").concat(
        [CM.i_section_view(col, "Column section"), CM.i_section_view(raf, "Rafter section")]),
      ["Concrete M" + F(num(inp.fck), "g") + ", reinforcement Fe500, clear cover 50 mm.",
        "Safe bearing capacity assumed " + F(num(inp.sbc), "g") + " kN/m² – confirm by soil investigation.",
        "Pedestal " + F(ped[0] * 1000, ".0f") + " × " + F(ped[1] * 1000, ".0f") + " mm with 4 × 16Ø + 8Ø ties @ 150 (nominal).",
        "Grout 25–40 mm non-shrink under base plates after alignment."]);
    return [sh1, sh2];
  };

  var ISMB_BU = by_weight(ISMB).concat(builtup_series());
  M.PORTAL_PARAMS = [
    P("span", "Span (c/c of columns)", 20.0, "m", { min: 6, max: 45, step: 0.5, group: "Geometry" }),
    P("length", "Length of shed", 48.0, "m", { min: 6, max: 300, step: 1, group: "Geometry" }),
    P("bay", "Frame spacing (approx.)", 6.0, "m", { min: 3, max: 9, step: 0.5, group: "Geometry",
      help: "Adjusted to give equal bays" }),
    P("eave", "Eave height", 7.0, "m", { min: 3, max: 15, step: 0.25, group: "Geometry" }),
    P("slope", "Roof slope", 10.0, "°", { min: 3, max: 30, step: 0.5, group: "Geometry" }),
    P("base", "Column base", "Pinned", { kind: "select", options: ["Pinned", "Fixed"], group: "Geometry" }),
    P("steel", "Steel grade", "E250 (IS 2062)", { kind: "select", options: Object.keys(STEEL_GRADES), group: "Materials" }),
    P("fck", "Concrete grade fck (foundation)", 25.0, "N/mm²", { kind: "select", options: [20.0, 25.0, 30.0],
      group: "Materials" }),
    P("sheet_dl", "Roof sheeting load", 0.10, "kN/m²", { min: 0, max: 1, step: 0.01, group: "Loads" }),
    P("services", "Services / collateral load", 0.10, "kN/m²", { min: 0, max: 1, step: 0.05, group: "Loads" }),
    P("wall_dl", "Wall cladding load", 0.10, "kN/m²", { min: 0, max: 1, step: 0.05, group: "Loads" }),
    P("clad_walls", "Walls clad with sheeting", true, { kind: "bool", group: "Loads" })
  ].concat(M._wind_params(), [
    P("purlin_spacing", "Purlin spacing (on slope)", 1.4, "m", { min: 0.8, max: 2.0, step: 0.1, group: "Purlins" }),
    P("sag_rods", "Sag rods at purlin mid-span", true, { kind: "bool", group: "Purlins" }),
    P("col_K", "Column effective length factor (in-plane)", 2.0, { min: 1.0, max: 3.0, step: 0.1, group: "Restraints",
      help: "Sway portal with pinned base ≈ 2.0–2.4" }),
    P("col_restraint", "Column out-of-plane restraint spacing (girts/bracing)", 3.5, "m", { min: 1, max: 15, step: 0.5,
      group: "Restraints" }),
    P("fly_brace", "Rafter LTB length (fly-brace spacing)", 2.8, "m", { min: 1, max: 10, step: 0.1, group: "Restraints" }),
    P("bolt_d", "Anchor bolt diameter", 24.0, "mm", { kind: "select", options: [20.0, 24.0, 27.0, 30.0, 36.0],
      group: "Base plate & foundation" }),
    P("n_bolts", "Anchor bolts per base", 4, { kind: "int", min: 4, max: 8, step: 2, group: "Base plate & foundation" }),
    P("sbc", "Safe bearing capacity of soil", 150.0, "kN/m²", { min: 50, max: 600, step: 10,
      group: "Base plate & foundation" }),
    P("df", "Depth of foundation below GL", 1.5, "m", { min: 0.8, max: 4, step: 0.1, group: "Base plate & foundation" }),
    P("soil_gamma", "Unit weight of soil (backfill)", 18.0, "kN/m³", { min: 14, max: 22, step: 0.5, group: "Base plate & foundation" }),
    P("mu_soil", "Base friction coefficient (concrete on soil)", 0.5, { min: 0.3, max: 0.7, step: 0.05, group: "Base plate & foundation",
      help: "IS 456 cl 20.2 sliding check; 0.45–0.55 typical" }),
    P("allow_builtup", "Allow welded built-up sections (BU h×b×tf×tw)", true, { kind: "bool", group: "Restraints" }),
    P("col_sec", "Column section (check mode)", "ISMB 500", { kind: "select", options: ISMB_BU.slice(),
      group: "My sections", modes: ["check"] }),
    P("raf_sec", "Rafter section (check mode)", "ISMB 500", { kind: "select", options: ISMB_BU.slice(),
      group: "My sections", modes: ["check"] }),
    P("purlin_sec", "Purlin section (check mode)", "ISMC 125", { kind: "select", options: by_weight(ISMC),
      group: "My sections", modes: ["check"] })
  ]);

  C.register({ id: "steel_portal", phase: 2, category: "Steel structures", name: "Industrial shed – portal frame (PEB type)", icon: "🏭",
    description: "Hot-rolled portal frame shed: IS 875-3 wind, purlins, frame analysis, rafter & column design " +
      "with LTB, serviceability, base plate, anchor bolts and pad footings.", params: M.PORTAL_PARAMS,
    run: M.run_portal, references: STEEL_REFS });

  /* =========================================================================== ROOF TRUSS SHED */
  /* Nodes: bottom 0..n, top 0..n (top 0 and n coincide with bottom supports). Returns frame, member groups. */
  M._truss_geometry = function (span, rise, n, kind) {
    var f = new DS.frame2d.Frame();
    var a = span / n, i;
    var bot = [];
    for (i = 0; i < n + 1; i++) bot.push(f.node(i * a, 0.0));
    var top = [];
    for (i = 0; i < n + 1; i++) {
      var x = i * a;
      var y = rise * (1 - Math.abs(x - span / 2) / (span / 2));
      top.push(0 < i && i < n ? f.node(x, y) : bot[i]);
    }
    var groups = { "Top chord": [], "Bottom chord": [], "Verticals": [], "Diagonals": [] };
    return [f, bot, top, groups, a];
  };

  /* A: member area (m²) – a number for all members, or {group: area} */
  M._truss_members = function (f, bot, top, groups, n, kind, E, A) {
    function add(i, j, g) {
      groups[g].push(f.member(i, j, E, typeof A === "object" ? A[g] : A, 0.0, "truss", { name: g, group: g }));
    }
    var i;
    for (i = 0; i < n; i++) {
      add(bot[i], bot[i + 1], "Bottom chord");
      add(top[i], top[i + 1], "Top chord");
    }
    for (i = 1; i < n; i++) add(bot[i], top[i], "Verticals");
    var half = Math.floor(n / 2);
    for (i = 0; i < n; i++) {
      var left = i < half;
      if (kind === "Pratt") {
        // diagonals slope down towards mid-span (tension under gravity)
        if (left && i >= 1) add(top[i], bot[i + 1], "Diagonals");
        else if (!left && i + 1 <= n - 1) add(top[i + 1], bot[i], "Diagonals");
      } else {   // Howe: diagonals slope up towards mid-span (compression under gravity)
        if (left && i + 1 < half + 1 && i + 1 <= n - 1) add(bot[i], top[i + 1], "Diagonals");
        else if (!left && i >= 1) add(top[i], bot[i + 1], "Diagonals");
      }
    }
  };

  M.run_truss = function (inp, mode) {
    var FR = DS.frame2d, LoadCase = FR.LoadCase, combine_cases = FR.combine_cases;
    var c = new Calc("Roof truss shed");
    var fyu = M._fy(inp), fy = fyu[0], fu = fyu[1];
    var span = num(inp.span), length = num(inp.length), bay = num(inp.bay), eave = num(inp.eave);
    var n = Math.trunc(num(inp.panels));
    n = n + (((n % 2) + 2) % 2);
    var rise = span / num(inp.rise_ratio);
    var slope = degrees(Math.atan(rise / (span / 2)));
    var n_bays = Math.max(1, R(length / bay));
    bay = length / n_bays;
    c.section("Geometry");
    c.let("Span", "L", span, "m");
    c.let("Rise (L / ratio)", "r", R(rise, 3), "m");
    c.calc("Roof slope", "θ", "degrees(atan(r/(L/2)))", "°", "", { r: rise, L: span });
    c.let("Panels", "n", n, { unit: "", note: inp.type + " truss, purlins at panel points" });
    c.let("Truss spacing", "s", R(bay, 3), "m");

    c.section("Loads");
    var llr = c.calc("Roof imposed load", "qr", "max(0.75 - 0.02*max(th - 10, 0), 0.40)", "kN/m²", "IS 875-2 Table 2",
      { th: slope });
    var tw = c.calc("Truss self-weight (empirical)", "wt", "(L/3 + 5)*10/1000", "kN/m²", "Duggal / Ramamrutham", { L: span });
    var wind = M.shed_wind(c, inp, span, length, eave, eave + rise, slope, bay);
    var a = span / n;
    var pl = a / Math.cos(radians(slope));
    var pd_p = M.purlin_wind(c, inp, eave + rise, bay * pl);
    var wup_p = c.calc("Net uplift pressure on purlins", "wp", "Cp*pd", "kN/m²", "IS 875-3 Table 6",
      "worst roof suction (Cpe − Cpi) of the wind cases", { Cp: R(wind.max_uplift_coef, 3), pd: R(pd_p, 4) });
    var pur = M.design_purlin(c, bay, pl, slope, num(inp.sheet_dl) + num(inp.services), llr,
      wup_p, fy, fu, !!inp.sag_rods, n_bays >= 3,
      mode === "check" ? inp.purlin_sec : null);
    var dl_node = c.calc("Dead load per panel point", "Wd",
      "((gs + gc)*pl + wp/1000*9.81 + wt*a)*s", "kN", "",
      { gs: num(inp.sheet_dl), gc: num(inp.services), pl: R(pl, 3), wp: pur.w, wt: tw, a: R(a, 3), s: R(bay, 3) });
    var ll_node = c.calc("Imposed load per panel point", "Wl", "qr*a*s", "kN", "", { qr: llr, a: R(a, 3), s: R(bay, 3) });
    var up_coef = wind.max_uplift_coef;
    var wl_node = c.calc("Wind (normal to slope) per panel point", "Ww", "Cp*pd*pl*s", "kN", "IS 875-3",
      "worst net suction (Cpe − Cpi) applied on both slopes",
      { Cp: R(up_coef, 3), pd: R(wind.pd, 3), pl: R(pl, 3), s: R(bay, 3) });

    var E = E_KN;
    var tg = M._truss_geometry(span, rise, n, inp.type), f = tg[0], bot = tg[1], top = tg[2], groups = tg[3];
    a = tg[4];
    M._truss_members(f, bot, top, groups, n, inp.type, E, 1e-3);
    f.support(bot[0], true, true, false);
    f.support(bot[n], false, true, false);
    var DL = new LoadCase("DL"), LL = new LoadCase("LL"), WL = new LoadCase("WL");
    var th = radians(slope), i;
    for (i = 0; i < n + 1; i++) {
      var k = (i === 0 || i === n) ? 0.5 : 1.0;
      var node = top[i];
      DL.add_nodal(node, 0, -dl_node * k);
      LL.add_nodal(node, 0, -ll_node * k);
      var sx = i < n / 2 ? -1 : (i > n / 2 ? 1 : 0);
      // suction acts outward, normal to the slope: left slope normal (−sinθ, cosθ), right (sinθ, cosθ)
      if (i === Math.floor(n / 2)) WL.add_nodal(node, 0, wl_node * Math.cos(th));
      else WL.add_nodal(node, sx * wl_node * k * Math.sin(th), wl_node * k * Math.cos(th));
    }
    var combos = { "1.5(DL+LL)": combine_cases([DL, LL], [1.5, 1.5], ""),
      "1.2(DL+LL+WL)": combine_cases([DL, LL, WL], [1.2, 1.2, 1.2], ""),
      "0.9DL+1.5WL": combine_cases([DL, WL], [0.9, 1.5], "") };
    var res = {};
    Object.keys(combos).forEach(function (kk) { res[kk] = f.solve(combos[kk]); });
    var rk = Object.keys(res);
    var forces = {};
    Object.keys(groups).forEach(function (g) {
      var ids = groups[g], T = 0.0, Cc = 0.0;
      rk.forEach(function (kk) { ids.forEach(function (m) { T = Math.max(T, res[kk].axial(m)); }); });
      rk.forEach(function (kk) { ids.forEach(function (m) { Cc = Math.max(Cc, -res[kk].axial(m)); }); });
      var Lmax = ids.length ? maxOf(ids.map(function (m) { return f.geom(f.members[m])[0]; })) : 0.0;
      forces[g] = { T: T, C: Cc, L: Lmax, ids: ids };
    });

    c.section("Member design (angles)");
    var ntie = Math.max(1, Math.min(Math.trunc(num(inp.bc_ties)) || 2, n));
    var tie_nodes = C.range(1, n).filter(function (i) { return i % ntie === 0; });
    var Lbc_y = c.calc("Bottom chord out-of-plane length (between longitudinal ties)", "Ly,bc", "k*a", "m", "IS 800 cl 7.2 / Table 11",
      "ties at every " + C.pystr(ntie) + " bottom-chord node(s) – the bottom chord goes into compression under wind reversal (0.9DL + 1.5WL)",
      { k: ntie, a: R(a, 4) });
    var designs = {};
    var angles = by_weight(ISA);
    // in-plane / out-of-plane lengths: top chord – panel on slope (purlins at nodes); bottom chord – panel / tie spacing; webs – member
    function lengths(g, fr) { return g === "Top chord" ? [pl, pl] : g === "Bottom chord" ? [a, Lbc_y] : [fr.L, fr.L]; }
    function nbolts(sec, dbl, fr) {
      var bv = S.bolt_values(new Calc("s"), 16, "4.6", !dbl ? sec.t : 8.0, 410, dbl ? 2 : 1);
      return Math.max(2, Math.ceil(Math.max(fr.T, fr.C) / bv.Vdb));
    }
    Object.keys(forces).forEach(function (g) {
      var fr = forces[g];
      if (!fr.ids.length) return;
      var dbl = g === "Top chord" || g === "Bottom chord";
      var LL_ = lengths(g, fr), Lz = LL_[0], Ly = LL_[1];
      var Ky = dbl ? 1.0 : 0.85;
      var given = mode === "check" ? inp[{ "Top chord": "top_sec", "Bottom chord": "bot_sec" }[g] || "web_sec"] : null;
      var chosen = null, name, sec, rz, ry;
      var list = given ? [given] : angles;
      var climit = fr.C > 0.1 * Math.max(fr.T, 1e-6) ? 180 : 350;
      for (var j = 0; j < list.length; j++) {
        name = list[j];
        sec = dbl ? double_angle(name) : section(name);
        rz = dbl ? sec.rxx : sec.rvv; ry = dbl ? sec.ryy : sec.rvv;
        var lam = Math.max(0.85 * Lz * 1000 / rz, Ky * Ly * 1000 / ry);
        var ok = true;
        if (fr.C > 0) {
          var fc = Math.min(S.fcd(fy, 0.85 * Lz * 1000, rz, "c")[0], S.fcd(fy, Ky * Ly * 1000, ry, "c")[0]);
          ok = ok && (sec.A * fc / 1000 >= fr.C && lam <= climit);
        }
        if (fr.T > 0) {
          var hole = (dbl ? 2 : 1) * 18 * sec.t;
          var nb0 = nbolts(sec, dbl, fr);
          ok = ok && (Math.min(sec.A * fy / S.GAMMA_M0, S.shear_lag_alpha(nb0) * (sec.A - hole) * fu / S.GAMMA_M1) / 1000 >= fr.T);
          ok = ok && (Math.max(Lz * 1000 / rz, Ly * 1000 / ry) <= 350);
        }
        if (ok || given) { chosen = [name, sec]; break; }
      }
      if (chosen === null) {
        name = last(angles);
        chosen = [name, dbl ? double_angle(name) : section(name)];
      }
      name = chosen[0]; sec = chosen[1];
      rz = dbl ? sec.rxx : sec.rvv; ry = dbl ? sec.ryy : sec.rvv;
      var label = dbl ? "2-" + name + " b/b" : name;
      var tag = "(" + g.toLowerCase() + ")";
      c.section(g + " – " + label);
      c.let("Design forces", "", "T = " + F(fr.T, ".1f") + " kN, C = " + F(fr.C, ".1f") + " kN, L = " + F(fr.L, ".2f") + " m", "");
      c.let("Effective lengths " + tag, "Lz / Ly", F(Lz, ".2f") + " / " + F(Ly, ".2f"), "m", "IS 800 cl 7.5.2",
        dbl ? "double angle: in-plane rxx, out-of-plane ryy (Ky = 1.0)" : "single angle: rvv, K = 0.85 (≥ 2 bolts)");
      if (fr.C > 0) {
        S.compression(c, fr.C, { A: sec.A, rz: rz, ry: ry, family: "ISA", h: 1, b: 1, tf: 1 },
          fy, Lz, Ly, 0.85, Ky, { tag: tag, limit: climit });
      }
      var bolts = S.bolt_values(c, 16, "4.6", !dbl ? sec.t : 8.0, 410, dbl ? 2 : 1, { tag: tag });
      var nb = Math.max(2, Math.ceil(Math.max(fr.T, fr.C) / bolts.Vdb));
      if (fr.T > 0) {
        S.tension(c, fr.T, sec.A, fy, fu, (dbl ? 2 : 1) * 18 * sec.t, { tag: tag,
          slender: Math.max(Lz * 1000 / rz, Ly * 1000 / ry), limit: 350, n_bolts: nb });
      }
      c.let("Bolts at end connection (" + g.toLowerCase() + ")", "", nb + " – M16 gr 4.6", "", "IS 800 cl 10.3");
      designs[g] = { name: label, w: sec.w, ids: fr.ids, bolts: nb, A: sec.A };
    });
    var dk = Object.keys(designs);

    // longitudinal bottom-chord ties (restrain the bottom chord out of plane at the tie nodes)
    c.section("Bottom-chord longitudinal ties");
    var Cb = forces["Bottom chord"].C;
    var Ft = c.calc("Restraint force (2.5 % of max. bottom-chord compression)", "Ft", "0.025*C", "kN", "Practice (restraint force 2.5 %)", { C: R(Cb, 3) });
    var tie_name = angles.filter(function (nm) { return bay * 1000 / section(nm).rvv <= 350 && section(nm).A * fy / S.GAMMA_M0 / 1000 >= 1.5 * Ft; })[0] || last(angles);
    c.check("Tie slenderness L/rvv ≤ 350 (tie subject to reversal; compression taken to end-bay bracing)", bay * 1000 / section(tie_name).rvv, 350,
      { clause: "IS 800 Table 3" });
    c.let("Bottom-chord ties", "", C.pystr(tie_nodes.length) + " line(s) of " + tie_name + " (every " + C.pystr(ntie) + " bottom-chord node(s), full length, tied to end bracing)", "");

    c.section("Serviceability");
    // re-analyse with the adopted member areas (the force analysis used 1000 mm² for every member – statically determinate truss)
    var tg2 = M._truss_geometry(span, rise, n, inp.type), f2 = tg2[0], bot2 = tg2[1], top2 = tg2[2], groups2 = tg2[3];
    var Agr = {};
    Object.keys(groups2).forEach(function (g) { Agr[g] = (designs[g] ? designs[g].A : 1000) * 1e-6; });
    M._truss_members(f2, bot2, top2, groups2, n, inp.type, E, Agr);
    f2.support(bot2[0], true, true, false);
    f2.support(bot2[n], false, true, false);
    var LL2 = new LoadCase("LL");
    for (i = 0; i < n + 1; i++) LL2.add_nodal(top2[i], 0, -ll_node * ((i === 0 || i === n) ? 0.5 : 1.0));
    var sv = f2.solve(LL2);
    var dmax = maxOf(bot2.map(function (nd) { return Math.abs(sv.disp(nd)[1]); })) * 1000;
    c.info("Deflection analysis", "re-analysed with the adopted areas: " + dk.map(function (g) { return g + " " + F(designs[g].A, ".0f") + " mm²"; }).join(", "), "IS 800 cl 5.6.1");
    c.check("Truss deflection under LL ≤ span/250", dmax, span * 1000 / 250, { unit: "mm", clause: "IS 800 Table 6" });
    var Rv = maxOf(rk.map(function (kk) { return res[kk].reactions[bot[0]][1]; }));
    var Ru = maxOf(rk.map(function (kk) { return -res[kk].reactions[bot[0]][1]; }));
    c.section("Reactions to columns");
    c.let("Max. vertical reaction per truss (factored)", "R", R(Rv, 1), "kN");
    c.let("Max. uplift per truss (factored)", "U", R(Math.max(Ru, 0), 1), "kN");
    c.miss("Columns, knee braces and column foundations – design with Steel Column module " +
      "(R = " + F(Rv, ".0f") + " kN, uplift " + F(Math.max(Ru, 0), ".0f") + " kN, plus wind on walls)", "IS 800 cl 7", "Critical");
    c.miss("Gusset plates and weld / bolt group detailing at each joint", "IS 800 cl 10", "Important");
    c.miss("Longitudinal bracing (rafter / end-bay bracing) – nominal sizes only; bottom-chord ties to be anchored to the end-bay bracing", "IS 800 cl 4.4", "Important");

    var tot_len = {};
    dk.forEach(function (g) { tot_len[g] = C.sum(designs[g].ids.map(function (m) { return f.geom(f.members[m])[0]; })); });
    var w_truss = C.sum(dk.map(function (g) { return tot_len[g] * designs[g].w; }));
    var n_tr = n_bays + 1;
    c.thumb("Truss self-weight", (span / 3 + 5) * 10 * span * bay / 9.81, w_truss * 1.1, "kg/truss",
      "(L/3 + 5) × 10 N/m² of plan", "Duggal");
    c.thumb("Rise of truss", span / 4.5, rise, "m", "span / 4 to span / 5", "IS 875-3 practice");
    var q = [Q("Structural steel in roof trusses – angles, gussets, bolts; fabrication & erection", "kg",
      dk.map(function (g) { return kg_row(g + " " + designs[g].name, n_tr, tot_len[g], designs[g].w); }).concat(
        [kg_row("Gusset plates, bolts (allowance 10 %)", 1, 0.10 * w_truss * n_tr, 1.0)]), null,
      RATE.steel_struct),
    Q("Secondary steel – purlins & bracing", "kg",
      [kg_row("Purlins " + pur.name, n + 1, length, pur.w),
        kg_row("Bracing ISA 50x50x6 (end bays)", 8, Math.hypot(bay, span / 2), ISA["ISA 50x50x6"][0]),
        kg_row("Bottom-chord longitudinal ties " + tie_name, tie_nodes.length, length, section(tie_name).w)],
      null, RATE.steel_light),
    Q("Colour-coated profiled roofing sheet 0.50 mm TCT with fixings", "sqm",
      [row("Roof", 2, Math.hypot(span / 2, rise) + 0.3, length + 0.6)], null, RATE.roof_sheet)];

    // drawing
    var D = DS.drawing, View = D.View, Sheet = D.Sheet;
    var v = new View(inp.type + " truss – elevation");
    dk.forEach(function (g) {
      designs[g].ids.forEach(function (m) {
        var mem = f.members[m], p1 = f.nodes[mem.i], p2 = f.nodes[mem.j];
        v.line(p1[0] * 1000, p1[1] * 1000, p2[0] * 1000, p2[1] * 1000, "STEEL");
      });
    });
    dk.forEach(function (g) {
      var d = designs[g];
      var m = d.ids[Math.floor(d.ids.length / 2)];
      var mem = f.members[m], p1 = f.nodes[mem.i], p2 = f.nodes[mem.j];
      v.text((p1[0] + p2[0]) * 500, (p1[1] + p2[1]) * 500 + 120, d.name, 2.0, { anchor: "middle" });
    });
    v.dim(0, 0, span * 1000, 0, 10, "SPAN " + F(span * 1000, ",.0f"));
    v.dim(span * 1000 + 300, 0, span * 1000 + 300, rise * 1000, -6, "RISE " + F(rise * 1000, ",.0f"));
    var pv = new View("Roof plan");
    pv.rect(0, 0, length * 1000, span * 1000);
    for (i = 0; i < n_tr; i++) pv.line(i * bay * 1000, 0, i * bay * 1000, span * 1000, "STEEL");
    for (i = 1; i < n; i++) pv.line(0, i * a * 1000, length * 1000, i * a * 1000, "HIDDEN");
    pv.dim(0, span * 1000, length * 1000, span * 1000, -8, C.pystr(n_bays) + " BAYS @ " + F(bay * 1000, ",.0f"));
    var tbl = C.table(dk.map(function (g) { var d = designs[g]; return [g, d.name, forces[g].T, forces[g].C, forces[g].L, d.bolts]; }),
      ["Group", "Section", "Max tension (kN)", "Max compression (kN)", "Max length (m)", "Bolts M16"]);
    var sheet = new Sheet(inp.type + " roof truss – details", "ST-11", [v, pv],
      ["Steel " + inp.steel + "; bolts M16 gr 4.6 in 18 mm holes, min. 2 per joint.",
        "Gusset plates 8 mm thick unless noted; members meet at centroid lines.",
        "Purlins " + pur.name + " at panel points, cleat-connected to top chord.",
        "Bottom chord ties " + tie_name + " at every " + C.pystr(ntie) + " bottom-chord node(s), continuous over the shed length, to restrain the bottom chord under wind reversal."]);
    function dname(g) { return designs[g] ? designs[g].name : "—"; }
    var summary = { "Truss": inp.type + ", span " + F(span, "g") + " m, rise " + F(rise, ".2f") + " m, " + C.pystr(n) + " panels",
      "Top chord": dname("Top chord"),
      "Bottom chord": dname("Bottom chord"),
      "Webs": ["Verticals", "Diagonals"].filter(function (g) { return g in designs; }).map(function (g) { return designs[g].name; }).join(" / "),
      "Purlins": pur.name, "Trusses": C.pystr(n_tr) + " nos @ " + F(bay, ".2f") + " m",
      "Steel per truss": F(w_truss * 1.1, ",.0f") + " kg", "Max utilisation": F(c.max_utilisation, ".2f") };
    return C.DesignResult({ module: "steel_truss", title: "Roof truss shed", inputs: inp, calc: c, summary: summary,
      drawings: [sheet], quantities: q, bbs: [], tables: { "Member forces": tbl }, references: STEEL_REFS });
  };

  M.TRUSS_PARAMS = [
    P("type", "Truss type", "Pratt", { kind: "select", options: ["Pratt", "Howe"], group: "Geometry" }),
    P("span", "Span", 15.0, "m", { min: 6, max: 30, step: 0.5, group: "Geometry" }),
    P("rise_ratio", "Span / rise ratio", 5.0, { min: 3, max: 8, step: 0.5, group: "Geometry" }),
    P("panels", "Number of panels", 8, { kind: "int", min: 4, max: 16, step: 2, group: "Geometry" }),
    P("length", "Length of shed", 30.0, "m", { min: 6, max: 200, step: 1, group: "Geometry" }),
    P("bay", "Truss spacing (approx.)", 5.0, "m", { min: 3, max: 8, step: 0.5, group: "Geometry" }),
    P("eave", "Eave height", 6.0, "m", { min: 3, max: 12, step: 0.5, group: "Geometry" }),
    P("steel", "Steel grade", "E250 (IS 2062)", { kind: "select", options: Object.keys(STEEL_GRADES), group: "Materials" }),
    P("sheet_dl", "Roof sheeting load", 0.10, "kN/m²", { min: 0, max: 1, step: 0.01, group: "Loads" }),
    P("services", "Services load", 0.05, "kN/m²", { min: 0, max: 1, step: 0.05, group: "Loads" })
  ].concat(M._wind_params(), [
    P("sag_rods", "Sag rods at purlin mid-span", true, { kind: "bool", group: "Purlins" }),
    P("bc_ties", "Bottom-chord longitudinal ties at every … node", 2, { kind: "int", min: 1, max: 8, step: 1, group: "Restraints",
      help: "Out-of-plane restraint of the bottom chord under wind reversal (1 = every node, 2 = alternate nodes)" }),
    P("top_sec", "Top chord angle (check mode, used as double)", "ISA 65x65x6", { kind: "select",
      options: by_weight(ISA), group: "My sections", modes: ["check"] }),
    P("bot_sec", "Bottom chord angle (check mode, double)", "ISA 50x50x6", { kind: "select", options: by_weight(ISA),
      group: "My sections", modes: ["check"] }),
    P("web_sec", "Web member angle (check mode, single)", "ISA 75x75x6", { kind: "select", options: by_weight(ISA),
      group: "My sections", modes: ["check"] }),
    P("purlin_sec", "Purlin section (check mode)", "ISMC 100", { kind: "select", options: by_weight(ISMC),
      group: "My sections", modes: ["check"] })
  ]);
  C.register({ id: "steel_truss", phase: 2, category: "Steel structures", name: "Industrial shed – roof truss (Pratt / Howe)", icon: "🔺",
    description: "Pin-jointed roof truss with panel-point purlins: IS 875 loads, member forces, double-angle " +
      "chords, single-angle webs, bolts, purlins, reactions.", params: M.TRUSS_PARAMS, run: M.run_truss, references: STEEL_REFS,
    modes: ["design", "check"] });

  /* =========================================================================== PURLIN (standalone) */
  M.run_purlin = function (inp, mode) {
    var D = DS.drawing, View = D.View, Sheet = D.Sheet;
    var c = new Calc("Purlin design");
    var fyu = M._fy(inp), fy = fyu[0], fu = fyu[1];
    c.section("Wind");
    var pd = LD.design_wind_pressure(c, M._Vb(inp), num(inp.height), Math.trunc(num(inp.terrain)), num(inp.k1), num(inp.k3),
      1.0, { area: num(inp.bay) * num(inp.spacing), Kc: 1.0 });
    c.info("Wind pressure on purlin", "Ka for the purlin tributary area (span × spacing); Kc = 1.0 – the area-combination factor applies to frames only", "IS 875-3 cl 7.2 / Table 4");
    var up = c.calc("Net uplift coefficient", "Cp,net", "cpe - cpi", "", "IS 875-3 Table 6 / cl 7.3.2",
      "Cpi = +" + C.pystr(LD.CPI[inp.perm]) + " (internal pressure acts outward on the roof and adds to the external suction)",
      { cpe: num(inp.cpe), cpi: LD.CPI[inp.perm] });
    var wup = c.calc("Net uplift pressure on purlin", "wp", "max(-Cp, 0)*pd", "kN/m²", "IS 875-3 cl 7.3", { Cp: R(up, 3), pd: R(pd, 4) });
    var p = M.design_purlin(c, num(inp.bay), num(inp.spacing), num(inp.slope), num(inp.dl),
      LD.roof_live_load(num(inp.slope)), wup, fy, fu, !!inp.sag_rods,
      !!inp.continuous, mode === "check" ? inp.sec : null, inp.family);
    var sec = p.chk.sec;
    var v = new View("Purlin on rafter – section");
    var hh = sec.h, bb = sec.b;
    v.rect(0, 0, 600, 20, "STEEL", "steel");
    v.poly([[250, 20], [250, 20 + hh], [250 + bb, 20 + hh]], false, "STEEL");
    v.poly([[250, 20], [250 + bb, 20]], false, "STEEL");
    v.text(300, -60, p.name + " PURLIN WITH CLEAT ANGLE, 2-M12 BOLTS", 2.2, { anchor: "middle" });
    c.thumb("Purlin depth", num(inp.bay) * 1000 / 45, sec.h, "mm", "span / 45", "Duggal");
    var q = [Q("Purlins – rolled sections incl. cleats, fabrication & erection", "kg",
      [kg_row("Purlin " + p.name, Math.trunc(num(inp.lines)), num(inp.run_length), p.w)], null,
      RATE.steel_light)];
    return C.DesignResult({ module: "steel_purlin", title: "Purlin design", inputs: inp, calc: c,
      summary: { "Purlin": p.name, "Weight": F(p.w, ".1f") + " kg/m", "Max utilisation": F(c.max_utilisation, ".2f") },
      drawings: [new Sheet("Purlin detail", "ST-21", inp.family === "ISMC" ? [v, CM.i_section_view(sec, "Purlin section")] : [v])],
      quantities: q, bbs: [], tables: {}, references: STEEL_REFS });
  };

  M.PURLIN_PARAMS = [
    P("family", "Section type", "ISMC", { kind: "select", options: ["ISMC", "ISA"], group: "Purlin" }),
    P("bay", "Purlin span (frame / truss spacing)", 6.0, "m", { min: 2, max: 9, step: 0.5, group: "Purlin" }),
    P("spacing", "Purlin spacing on slope", 1.4, "m", { min: 0.6, max: 2.5, step: 0.1, group: "Purlin" }),
    P("slope", "Roof slope", 10.0, "°", { min: 0, max: 45, step: 0.5, group: "Purlin" }),
    P("dl", "Sheeting + services load", 0.20, "kN/m²", { min: 0, max: 1.5, step: 0.05, group: "Purlin" }),
    P("continuous", "Continuous over ≥ 3 spans", true, { kind: "bool", group: "Purlin" }),
    P("sag_rods", "Sag rods at mid-span", true, { kind: "bool", group: "Purlin" }),
    P("height", "Height of roof above ground", 8.0, "m", { min: 3, max: 40, step: 0.5, group: "Wind" }),
    P("cpe", "Roof Cpe (worst suction)", -1.2, { min: -2.0, max: 0, step: 0.1, group: "Wind" })
  ].concat(M._wind_params(), [
    P("steel", "Steel grade", "E250 (IS 2062)", { kind: "select", options: Object.keys(STEEL_GRADES), group: "Materials" }),
    P("lines", "Number of purlin lines (for quantity)", 16, { kind: "int", min: 1, max: 200, group: "Quantity" }),
    P("run_length", "Length of each line", 48.0, "m", { min: 1, max: 400, group: "Quantity" }),
    P("sec", "Purlin section (check mode)", "ISMC 125", { kind: "select", options: by_weight(ISMC).concat(by_weight(ISA)),
      group: "My sections", modes: ["check"] })
  ]);
  C.register({ id: "steel_purlin", phase: 2, category: "Steel structures", name: "Purlin (ISMC / ISA)", icon: "📏",
    description: "Biaxial bending purlin for gravity and wind uplift with sag rods, deflection check.",
    params: M.PURLIN_PARAMS, run: M.run_purlin, references: STEEL_REFS, modes: ["design", "check"] });

  /* =========================================================================== STEEL BEAM */
  var LOAD_POS = M.LOAD_POS = ["Top flange (destabilising)", "At / below shear centre (normal)"];
  var CANT_SUP = M.CANT_SUP = ["Built-in (restrained laterally, torsionally and on plan)", "Continuous, lateral + torsional restraint",
    "Continuous, partial torsional restraint", "Continuous, lateral restraint to top flange only"];
  var CANT_K = [[0.8, 1.4], [1.0, 2.5], [2.0, 5.0], [3.0, 7.5]];     // IS 800 Table 16, free tip: [normal, destabilising]
  M.run_beam = function (inp, mode) {
    var D = DS.drawing, View = D.View, Sheet = D.Sheet;
    var c = new Calc("Steel beam");
    var fyu = M._fy(inp), fy = fyu[0];
    var L = num(inp.span);
    var sup = inp.support;
    var gk = num(inp.dl), qk = num(inp.ll), P_ = num(inp.point);
    var restrained = inp.restraint === "Full (slab / decking on top flange)";
    var LLT_in = num(inp.llt);
    var destab = inp.load_pos !== LOAD_POS[1];
    var ci = Math.max(CANT_SUP.indexOf(inp.cant_support), 0);
    var kLT = sup === "Simply supported" ? (destab ? 1.2 : 1.0) : (destab ? CANT_K[ci][1] : CANT_K[ci][0]);
    var table = { "ISMB": ISMB, "ISHB": ISHB, "ISMC": ISMC }[inp.family];
    var cands = mode === "check" ? [inp.sec] : by_weight(table);
    var lim = num(inp.defl_lim);

    function forces(sec) {
      var w = 1.5 * (gk + sec.w * 9.81e-3) + 1.5 * qk, Mx, V, d, LLT;
      if (sup === "Simply supported") {
        Mx = w * Math.pow(L, 2) / 8 + 1.5 * P_ * L / 4;
        V = w * L / 2 + 1.5 * P_ / 2;
        d = 5 * qk * Math.pow(L * 1000, 4) / (384 * E_STEEL * sec.Iz) +
          num(inp.point_live) * P_ * 1000 * Math.pow(L * 1000, 3) / (48 * E_STEEL * sec.Iz);
        LLT = kLT * (LLT_in <= 0 ? L : LLT_in);
      } else {
        Mx = w * Math.pow(L, 2) / 2 + 1.5 * P_ * L;
        V = w * L + 1.5 * P_;
        d = qk * Math.pow(L * 1000, 4) / (8 * E_STEEL * sec.Iz) +
          P_ * 1000 * Math.pow(L * 1000, 3) / (3 * E_STEEL * sec.Iz) * num(inp.point_live);
        LLT = kLT * (LLT_in <= 0 ? L : LLT_in);      // free tip, support restraint per IS 800 Table 16
      }
      return [w, Mx, V, d, LLT];
    }

    var chosen = null, sec, fr;
    for (var i = 0; i < cands.length; i++) {
      var name = cands[i];
      sec = section(name);
      fr = forces(sec);
      var sc = new Calc("s");
      var ok = S.bending(sc, fr[1], sec, fy, fr[4], restrained).ok && S.shear_strength(sc, fr[2], sec, fy).ok;
      var span_lim = sup === "Simply supported" ? L * 1000 / lim : L * 1000 / (lim / 2);
      if ((ok && fr[3] <= span_lim) || mode === "check") { chosen = name; break; }
    }
    chosen = chosen || last(cands);
    sec = section(chosen);
    fr = forces(sec);
    var Mu = fr[1], V = fr[2], d = fr[3], LLT = fr[4];
    c.section("Loads & forces");
    c.let("Span", "L", L, "m");
    c.let("Support condition", "", sup);
    var wu = c.calc("Factored UDL (incl. self-weight)", "wu", "1.5*(gk + sw) + 1.5*qk", "kN/m", "IS 800 Table 4",
      { gk: gk, sw: R(sec.w * 9.81e-3, 3), qk: qk });
    if (sup === "Simply supported") {
      Mu = c.calc("Design moment", "Mu", "wu*L**2/8 + 1.5*P*L/4", "kN·m", "", { wu: wu, L: L, P: P_ });
      V = c.calc("Design shear", "Vu", "wu*L/2 + 1.5*P/2", "kN", "", { wu: wu, L: L, P: P_ });
    } else {
      Mu = c.calc("Design moment", "Mu", "wu*L**2/2 + 1.5*P*L", "kN·m", "", { wu: wu, L: L, P: P_ });
      V = c.calc("Design shear", "Vu", "wu*L + 1.5*P", "kN", "", { wu: wu, L: L, P: P_ });
    }
    c.section("Section " + chosen);
    if (!restrained) {
      c.calc("Effective length for lateral-torsional buckling", "LLT", "k*L0", "m", sup === "Simply supported" ? "IS 800 Table 15" : "IS 800 Table 16",
        sup === "Simply supported" ? "ends restrained against torsion, flanges free to rotate on plan; k = 1.2 for load on the top flange " +
          "(destabilising), 1.0 for load at / below the shear centre" : "cantilever, free tip; support: " + CANT_SUP[ci] + "; k = " +
          F(CANT_K[ci][0], "g") + " (normal) / " + F(CANT_K[ci][1], "g") + " (destabilising load)",
        { k: kLT, L0: LLT_in <= 0 ? L : LLT_in });
    }
    S.bending(c, Mu, sec, fy, LLT, restrained, "");
    S.shear_strength(c, V, sec, fy);
    S.web_crippling(c, V, sec, fy, num(inp.bearing), { tag: "at support" });
    c.section("Deflection");
    var allow = sup === "Simply supported" ? L * 1000 / lim : L * 1000 / (lim / 2);
    c.calc("Deflection under imposed load", "δ", "dv", "mm", "IS 800 Table 6", { dv: R(d, 2) });
    c.check("Deflection ≤ span/" + F(lim, "g") + (sup !== "Simply supported" ? " (cantilever: 2×)" : ""), d, allow,
      { unit: "mm", clause: "IS 800 Table 6" });
    if (!restrained) c.info("Lateral restraint", "LLT = " + F(LLT, ".2f") + " m (compression flange unrestrained; " + (destab ? "destabilising load on top flange" : "normal load") + ")", "IS 800 cl 8.3");
    c.thumb("Beam depth", L * 1000 / (sup === "Simply supported" ? 20 : 8), sec.h, "mm",
      "span/20 (simply supported) or span/8 (cantilever)", "Rule of thumb");
    c.miss("End connections (cleat / fin plate) for the support reaction", "IS 800 cl 10", "Important");
    if (num(inp.ll) > 5) c.miss("Vibration / floor-response check for heavy imposed load floors", "IS 800 cl 5.6.4", "Advisory");
    var xs = C.range(41).map(function (k) { return L * k / 40; });
    var Ms;
    if (sup === "Simply supported") Ms = xs.map(function (x) { return wu * x * (L - x) / 2 + 1.5 * P_ * (x <= L / 2 ? x : L - x) / 2; });
    else Ms = xs.map(function (x) { return -(wu * Math.pow(L - x, 2) / 2 + 1.5 * P_ * (L - x)); });
    var ev = new View("Beam elevation");
    ev.rect(0, 0, L * 1000, sec.h, "STEEL", "steel");
    if (sup === "Simply supported") {
      [0, L * 1000].forEach(function (x) { ev.poly([[x, 0], [x - 150, -250], [x + 150, -250]], true, "OUTLINE"); });
    } else {
      ev.rect(-300, -400, 300, sec.h + 800, "CONCRETE", "concrete");
    }
    ev.dim(0, 0, L * 1000, 0, 14, "SPAN " + F(L * 1000, ",.0f"));
    ev.text(L * 500, sec.h + 250, chosen + " – UDL " + F(gk, "g") + "+" + F(qk, "g") + " kN/m" + (P_ ? ", P = " + F(P_, "g") + " kN" : ""), 2.4,
      { anchor: "middle" });
    var bm = D.diagram_view("Bending moment (kN·m)", xs, Ms, L * 1000, 0.15 * L * 1000, "kN·m");
    var sheet = new Sheet("Steel beam", "ST-31", [ev, bm, CM.i_section_view(sec, "Beam section")],
      ["Steel " + inp.steel + ".", "Provide end cleats / fin plates as per connection design.",
        "Bearing stiffeners where web bearing check governs."]);
    var q = [Q("Structural steel beams – rolled sections, fabrication & erection", "kg",
      [kg_row("Beam " + chosen, Math.trunc(num(inp.nos)), L + 0.2, sec.w)], null, RATE.steel_struct)];
    return C.DesignResult({ module: "steel_beam", title: "Steel beam", inputs: inp, calc: c,
      summary: { "Section": chosen, "Mu": F(Mu, ".1f") + " kN·m", "Vu": F(V, ".1f") + " kN", "Deflection": F(d, ".1f") + " mm",
        "Max utilisation": F(c.max_utilisation, ".2f") }, drawings: [sheet], quantities: q, bbs: [], tables: {}, references: STEEL_REFS });
  };

  M.BEAM_PARAMS = [
    P("span", "Span", 6.0, "m", { min: 1, max: 20, step: 0.1, group: "Beam" }),
    P("support", "Support", "Simply supported", { kind: "select", options: ["Simply supported", "Cantilever"],
      group: "Beam" }),
    P("family", "Section family", "ISMB", { kind: "select", options: ["ISMB", "ISHB", "ISMC"], group: "Beam" }),
    P("dl", "Dead load (UDL, excl. self-weight)", 12.0, "kN/m", { min: 0, max: 200, group: "Loads" }),
    P("ll", "Imposed load (UDL)", 8.0, "kN/m", { min: 0, max: 200, group: "Loads" }),
    P("point", "Point load at mid-span / free end", 0.0, "kN", { min: 0, max: 1000, group: "Loads" }),
    P("point_live", "Point load is imposed (for deflection)", true, { kind: "bool", group: "Loads" }),
    P("restraint", "Lateral restraint of compression flange", "Full (slab / decking on top flange)",
      { kind: "select", options: ["Full (slab / decking on top flange)", "Only at supports / intervals"],
        group: "Restraint" }),
    P("llt", "Unrestrained length between restraints (0 = full span)", 0.0, "m", { min: 0, max: 20, step: 0.1, group: "Restraint",
      help: "Effective LTB length = k × this length, k per IS 800 Table 15 (simply supported) / Table 16 (cantilever)" }),
    P("load_pos", "Load position", LOAD_POS[0], { kind: "select", options: LOAD_POS, group: "Restraint",
      help: "Gravity load on the top (compression) flange is destabilising – IS 800 Table 15 / 16" }),
    P("cant_support", "Cantilever support restraint", CANT_SUP[0], { kind: "select", options: CANT_SUP, group: "Restraint",
      help: "IS 800 Table 16 (used for cantilevers only)" }),
    P("defl_lim", "Deflection limit span /", 300.0, { min: 150, max: 500, step: 10, group: "Serviceability",
      help: "IS 800 Table 6: floors span/300; purlins span/150–180" }),
    P("bearing", "Stiff bearing length at support", 100.0, "mm", { min: 50, max: 300, group: "Serviceability" }),
    P("steel", "Steel grade", "E250 (IS 2062)", { kind: "select", options: Object.keys(STEEL_GRADES), group: "Materials" }),
    P("nos", "Number of beams (quantity)", 1, { kind: "int", min: 1, max: 500, group: "Quantity" }),
    P("sec", "Beam section (check mode)", "ISMB 300", { kind: "select",
      options: by_weight(ISMB).concat(by_weight(ISHB), by_weight(ISMC)), group: "My sections", modes: ["check"] })
  ];
  C.register({ id: "steel_beam", phase: 2, category: "Steel structures", name: "Steel beam (rolled)", icon: "➖",
    description: "Lightest ISMB / ISHB / ISMC for bending with LTB, shear, web bearing and deflection.",
    params: M.BEAM_PARAMS, run: M.run_beam, references: STEEL_REFS, modes: ["design", "check"] });

  /* =========================================================================== STEEL COLUMN + BASE */
  M.run_column = function (inp, mode) {
    var D = DS.drawing, View = D.View, Sheet = D.Sheet;
    var c = new Calc("Steel column");
    var fyu = M._fy(inp), fy = fyu[0], fu = fyu[1];
    var H = num(inp.height);
    var P_ = num(inp.P), Mm = num(inp.M), V = num(inp.V);
    var Kz = num(inp.Kz), Ky = num(inp.Ky);
    var Ly = num(inp.Ly) || H;
    var table = { "ISHB": ISHB, "ISMB": ISMB }[inp.family];
    var cands = mode === "check" ? [inp.sec] : by_weight(table);
    var chosen = null, sec, comp, bend;
    for (var i = 0; i < cands.length; i++) {
      var name = cands[i];
      sec = section(name);
      var sc = new Calc("s");
      comp = S.compression(sc, P_, sec, fy, H, Ly, Kz, Ky);
      bend = S.bending(sc, Mm, sec, fy, Ly, false);
      var ok = comp.ok && bend.ok && S.combined(sc, P_, Mm, comp, bend, sec, fy) &&
        S.shear_strength(sc, V, sec, fy).ok;
      if (ok || mode === "check") { chosen = name; break; }
    }
    chosen = chosen || last(cands);
    sec = section(chosen);
    c.section("Column " + chosen);
    c.let("Factored axial load", "Pu", P_, "kN");
    c.let("Factored moment (major axis)", "Mu", Mm, "kN·m");
    comp = S.compression(c, P_, sec, fy, H, Ly, Kz, Ky);
    bend = S.bending(c, Mm, sec, fy, Ly, false);
    S.shear_strength(c, V, sec, fy);
    S.combined(c, P_, Mm, comp, bend, sec, fy);
    var bp = S.base_plate(c, P_, V, num(inp.uplift), sec, num(inp.fck), fy, fu, num(inp.bolt_d), "4.6", 4);
    if (Mm > 0.05 * P_ * sec.h / 1000 && inp.base === "Fixed") {
      c.miss("Moment at base – design gusseted base / moment base plate with anchor bolt tension",
        "IS 800 cl 7.4", "Critical");
    }
    c.thumb("Column size (≈ height/20 depth)", H * 1000 / 20, sec.h, "mm", "height / 20", "Rule of thumb");
    var ev = new View("Column elevation");
    ev.rect(0, 0, sec.h, H * 1000, "STEEL", "steel");
    ev.rect(-(bp.Lp - sec.h) / 2, -bp.tp, bp.Lp, bp.tp, "STEEL", "steel");
    ev.dim(sec.h + 200, 0, sec.h + 200, H * 1000, -6, "H " + F(H * 1000, ",.0f"));
    ev.text(sec.h / 2, H * 1000 + 300, chosen, 2.4, { anchor: "middle" });
    var bpv = new View("Base plate plan");
    bpv.rect(0, 0, bp.Lp, bp.Bp, "STEEL");
    bpv.rect((bp.Lp - sec.h) / 2, (bp.Bp - sec.b) / 2, sec.h, sec.b, "HIDDEN");
    [40, bp.Lp - 40].forEach(function (x) {
      [40, bp.Bp - 40].forEach(function (y) { bpv.circle(x, y, bp.bolt_d / 2 + 3, "STEEL"); });
    });
    bpv.dim(0, bp.Bp, bp.Lp, bp.Bp, -8);
    bpv.dim(bp.Lp, 0, bp.Lp, bp.Bp, -8);
    var sheet = new Sheet("Steel column & base plate", "ST-41", [ev, CM.i_section_view(sec, "Column section"), bpv],
      ["Base plate " + F(bp.Lp, "g") + "×" + F(bp.Bp, "g") + "×" + F(bp.tp, "g") + ", 4-M" + F(bp.bolt_d, "g") + " anchor bolts, " +
        "embedment ≥ " + F(bp.Lemb, ".0f") + " mm.", "Grout 25–40 mm non-shrink."]);
    var nos = Math.trunc(num(inp.nos));
    var q = [Q("Structural steel columns – rolled sections, fabrication & erection", "kg",
      [kg_row("Column " + chosen, nos, H, sec.w)], null, RATE.steel_struct),
    Q("Base plates & anchor bolts", "kg",
      [row("Base plate", nos, bp.Lp / 1000, bp.Bp / 1000, bp.tp / 1000 * 7850),
        kg_row("Anchor bolts M" + F(bp.bolt_d, "g"), 4 * nos, bp.Lemb / 1000 + 0.15,
          Math.pow(bp.bolt_d, 2) / 162)], null, RATE.anchor_bolt)];
    return C.DesignResult({ module: "steel_column", title: "Steel column", inputs: inp, calc: c,
      summary: { "Section": chosen, "Pd": F(comp.Pd, ".0f") + " kN", "Md": F(bend.Md, ".1f") + " kN·m",
        "Base plate": F(bp.Lp, "g") + "×" + F(bp.Bp, "g") + "×" + F(bp.tp, "g"),
        "Max utilisation": F(c.max_utilisation, ".2f") }, drawings: [sheet], quantities: q, bbs: [], tables: {}, references: STEEL_REFS });
  };

  M.COLUMN_PARAMS = [
    P("height", "Column height", 6.0, "m", { min: 1, max: 20, step: 0.1, group: "Column" }),
    P("family", "Section family", "ISHB", { kind: "select", options: ["ISHB", "ISMB"], group: "Column" }),
    P("P", "Factored axial load Pu", 600.0, "kN", { min: 0, max: 10000, group: "Forces" }),
    P("M", "Factored moment Mu (major axis)", 40.0, "kN·m", { min: 0, max: 2000, group: "Forces" }),
    P("V", "Factored shear / base horizontal force", 30.0, "kN", { min: 0, max: 2000, group: "Forces" }),
    P("uplift", "Factored uplift at base", 0.0, "kN", { min: 0, max: 2000, group: "Forces" }),
    P("Kz", "Effective length factor (major)", 1.2, { min: 0.65, max: 2.5, step: 0.05, group: "Restraints",
      help: "IS 800 Table 11" }),
    P("Ky", "Effective length factor (minor)", 1.0, { min: 0.65, max: 2.5, step: 0.05, group: "Restraints" }),
    P("Ly", "Minor-axis unbraced length (0 = full height)", 0.0, "m", { min: 0, max: 20, step: 0.1, group: "Restraints" }),
    P("base", "Base type", "Pinned", { kind: "select", options: ["Pinned", "Fixed"], group: "Base" }),
    P("fck", "Pedestal concrete fck", 25.0, "N/mm²", { kind: "select", options: [20.0, 25.0, 30.0], group: "Base" }),
    P("bolt_d", "Anchor bolt diameter", 24.0, "mm", { kind: "select", options: [20.0, 24.0, 27.0, 30.0], group: "Base" }),
    P("steel", "Steel grade", "E250 (IS 2062)", { kind: "select", options: Object.keys(STEEL_GRADES), group: "Materials" }),
    P("nos", "Number of columns (quantity)", 1, { kind: "int", min: 1, max: 500, group: "Quantity" }),
    P("sec", "Column section (check mode)", "ISHB 350", { kind: "select", options: by_weight(ISHB).concat(by_weight(ISMB)),
      group: "My sections", modes: ["check"] })
  ];
  C.register({ id: "steel_column", phase: 2, category: "Steel structures", name: "Steel column + base plate", icon: "🏛️",
    description: "Rolled column under axial + bending (IS 800 cl 7, 8, 9.3) with slab base plate and anchor bolts.",
    params: M.COLUMN_PARAMS, run: M.run_column, references: STEEL_REFS, modes: ["design", "check"] });
})();
