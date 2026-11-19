/* Design Studio — modules_extra5 (new modules, not Python ports). Loads after modules_extra.js … modules_extra4.js.
   Brick-masonry, water and mine-site structures that SECL site engineers need drawings + estimates for:
     brick_tank          Brick masonry water tank / sump (rectangular; underground, partly buried or on ground) with RCC base,
                         RCC horizontal bands and RCC roof slab — IS 1905 masonry flexure between bands, bands as horizontal
                         beams (bending + direct tension, IS 3370-2 steel stress), earth / groundwater / water-test cases,
                         flotation, bearing, roof slab; BBS, quantities, drawing.
     wind_barrier        Wind / dust barrier for coal stock yards, CHP, railway sidings: cantilever steel posts with girts and
                         profiled sheet or wind-net cladding — IS 875-3 wind on a free-standing porous / solid screen, post and
                         girt design (IS 800), deflection, base plate & anchor bolts, isolated footing (overturning, bearing).
     inspection_chamber  Brick masonry inspection chamber / manhole on a sewer or storm-water line (IS 4111-1 / CPHEEO / CPWD):
                         size by depth, wall check, benching, cover by traffic, foot rests, number of chambers on the run.
     recharge_pit        Rain-water harvesting: recharge pit / trench / pit with recharge bore (CGWB manual): runoff, storage,
                         infiltration, filter media, silt chamber, annual recharge.
     masonry_drain       Brick / stone masonry lined drain (rectangular) or trapezoidal garland drain (pitched / earthen):
                         Manning hydraulics, velocity limits, masonry wall as a gravity wall (no tension), quantities per length.
     oil_trap            Oil & grease trap with silt chamber for HEMM / vehicle wash bays and workshops: Stokes rise velocity,
                         surface area, three chambers with baffles, brick walls, RCC base & covers.
     fencing             Chain-link / barbed-wire fencing with MS angle or RCC posts in concrete blocks: wind on the fence,
                         post bending, block stability, straining posts & struts, quantities (CPWD 16.x).
   Conventions: lengths in m (drawings in mm), forces kN, pressures kN/m²; every number goes through a Calc step with
   formula & clause. Steps marked [APPROX] / "verify" are engineering approximations or paraphrased clauses. */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var C = DS.core, F = C.pyfmt, R = C.pyround, ceil_to = C.ceil_to;
  var M = DS.modules_extra5 = {};
  function CM() { return DS.common; }
  function RC() { return DS.rcc; }
  function LD() { return DS.loads; }
  function DR() { return DS.drawing; }
  function BB() { return DS.bbs; }
  function DT() { return DS.detailing; }
  function X() { return DS.modules_extra; }
  function ST() { return DS.steel; }
  function SEC() { return DS.sections; }
  function row() { return CM().row.apply(null, arguments); }
  function Q() { return CM().Q.apply(null, arguments); }
  function num(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function G(x) { return F(x, "g"); }
  function area(d) { return Math.PI * d * d / 4; }
  function ctx() { return C.ctx || { site: "general", detail: "practice" }; }
  function isMine() { return ctx().site === "mine"; }
  function CPWD() { return CM().CPWD; }
  var CHECK = ["check"], GM = 20.0, CAT = "Masonry, water & site works";

  function P(key, label, def, unit, o) {
    if (unit && typeof unit === "object") { o = unit; unit = ""; }
    return C.Param(Object.assign({ key: key, label: label, default: def, unit: unit || "" }, o || {}));
  }
  function matParams(cover, exposure, fckDef) {
    return [P("fck", "Concrete grade fck", fckDef || 25.0, "N/mm²", { kind: "select", options: [20.0, 25.0, 30.0, 35.0], group: "Materials" }),
      P("fy", "Steel fy", 500.0, "N/mm²", { kind: "select", options: [415.0, 500.0], group: "Materials" }),
      P("exposure", "Exposure", exposure || "Moderate", { kind: "select", options: Object.keys(DS.materials.EXPOSURE), group: "Materials",
        help: "IS 456 Table 3. Mining area (site = mine) is taken as Severe in design mode." }),
      P("cover", "Clear cover", cover, "mm", { min: 20, max: 75, step: 5, group: "Materials" })];
  }
  function coverAdopt(c, inp, mode, member) {
    var cover = num(inp.cover), req = RC().required_cover(inp.exposure, member || "beam");
    if (mode !== "check" && cover < req) { c.info("Cover adopted", G(cover) + " mm raised to " + G(req) + " mm for " + inp.exposure + " exposure", "IS 456 Table 16"); cover = req; }
    RC().cover_check(c, inp.exposure, cover, num(inp.fck), member || "beam");
    return cover;
  }
  /* IS 1905:1987 cl 5.4.2 permissible flexural tension (N/mm²): [normal to bed joints, parallel to bed joints] */
  function masonryTension(mortar) { return /1:3|1:4/.test(String(mortar)) ? [0.07, 0.14, "H2 (CM 1:4)"] : [0.05, 0.10, "M2 (CM 1:6)"]; }
  M.masonryTension = masonryTension;
  var MORTAR = ["CM 1:4 (1 cement : 4 coarse sand)", "CM 1:6 (1 cement : 6 coarse sand)"];
  function brickItem(mortar, above) { var r4 = /1:4/.test(String(mortar)); return [CPWD(), above ? (r4 ? "6.4.1" : "6.4.2") : (r4 ? "6.1.1" : "6.1.2")]; }
  function brickDesc(mortar, where, above) {
    return "Brick work with common burnt clay FPS bricks class 7.5 " + (above ? "in superstructure above plinth" : "in foundation & plinth") + " in cement mortar " + (/1:4/.test(String(mortar)) ? "1:4" : "1:6") + " – " + where;
  }
  /* standard masonry wall thickness for a liquid / earth retaining height (practice: CPWD / state PWD type designs) */
  function stepWalls(H) {
    if (H <= 1.5 + 1e-9) return [{ t: 230, h: H }];
    if (H <= 2.5 + 1e-9) return [{ t: 345, h: Math.min(1.2, H - 0.3) }, { t: 230, h: H - Math.min(1.2, H - 0.3) }];
    if (H <= 3.5 + 1e-9) return [{ t: 460, h: 1.0 }, { t: 345, h: Math.min(1.2, H - 1.3) }, { t: 230, h: H - 1.0 - Math.min(1.2, H - 1.3) }];
    return [{ t: 575, h: 1.0 }, { t: 460, h: 1.0 }, { t: 345, h: Math.min(1.2, H - 2.3) }, { t: 230, h: Math.max(H - 2.0 - Math.min(1.2, H - 2.3), 0.3) }];
  }
  M.stepWalls = stepWalls;
  function wallAt(steps, z) { var acc = 0; for (var i = 0; i < steps.length; i++) { acc += steps[i].h; if (z <= acc + 1e-9) return steps[i].t; } return steps[steps.length - 1].t; }

  /* ======================================================================= 1. BRICK MASONRY WATER TANK / SUMP */
  var BT_POS = ["Underground sump (roof near GL)", "Partly below ground", "On ground (floor above GL)"];
  var BT_ROOF = ["RCC roof slab with manholes", "Open tank (no roof)"];
  function btPos(inp) { var v = String(inp.position); return /^Under/.test(v) ? "ug" : /^Partly/.test(v) ? "part" : "og"; }

  function btCapacity(c, inp, mode) {
    c.section("Capacity & size");
    var V = num(inp.cap_kl), D = num(inp.depth), n2 = String(inp.compart).indexOf("2") === 0;
    c.let("Required storage", "V", V, "kL (m³)", "", "domestic / fire / process demand – CPHEEO: ≥ ½ to 1 day's demand for sumps");
    var L, B;
    if (mode === "check") { L = num(inp.L_chk); B = num(inp.B_chk); D = num(inp.D_chk); }
    else {
      var A = V / D, r = num(inp.ratio);
      B = Math.max(1.0, ceil_to(Math.sqrt(A / r), 0.05)); L = Math.max(B, ceil_to(A / B, 0.05));
      c.calc("Plan area for the water depth", "A", "V/D", "m²", "", { V: V, D: D });
    }
    c.let("Inside length × width × water depth", "L × B × D", F(L, ".2f") + " × " + F(B, ".2f") + " × " + F(D, ".2f"), "m");
    var Vp = c.calc("Storage provided", "Vp", "L*B*D", "m³", "", { L: L, B: B, D: D });
    c.check("Storage provided ≥ required", Vp, V, { unit: "m³", clause: "", mode: ">=" });
    c.ok("Water depth 1.0–3.0 m for a masonry tank", D >= 1.0 - 1e-9 && D <= 3.0 + 1e-9, { detail: F(D, ".2f") + " m", clause: "practice – deeper / bigger tanks in RCC (IS 3370)", warn_only: true });
    c.ok("Capacity ≤ 100 kL for a masonry tank", Vp <= 100 + 1e-9, { detail: F(Vp, ".1f") + " m³", clause: "practice – larger tanks in RCC", warn_only: true });
    if (n2) c.info("Two compartments", "Partition wall across the length: each half can be emptied for cleaning while the other stays in use", "CPHEEO practice");
    return { V: V, Vp: Vp, L: L, B: B, D: D, two: n2 };
  }

  function btLevels(c, inp, cap, ts, tb, roof) {
    c.section("Levels (GL = ±0.00, + up)");
    var pos = btPos(inp), fb = num(inp.freeboard), lv = { pos: pos };
    if (pos === "ug") { lv.top = num(inp.top_above); lv.soffit = lv.top - (roof ? ts : 0); lv.twl = lv.soffit - fb; lv.floor = lv.twl - cap.D; }
    else if (pos === "part") { lv.floor = -num(inp.floor_depth); lv.twl = lv.floor + cap.D; lv.soffit = lv.twl + fb; lv.top = lv.soffit + (roof ? ts : 0); }
    else { lv.floor = num(inp.plinth); lv.twl = lv.floor + cap.D; lv.soffit = lv.twl + fb; lv.top = lv.soffit + (roof ? ts : 0); }
    lv.Hw = lv.soffit - lv.floor; lv.He = Math.max(0, -lv.floor) + tb; lv.base = lv.floor - tb;
    c.let("Top of roof / wall", "", F(lv.top, "+.2f"), "m"); c.let("Top water level (overflow)", "TWL", F(lv.twl, "+.2f"), "m", "", "overflow pipe at TWL, free board " + G(fb * 1000) + " mm");
    c.let("Floor level", "FL", F(lv.floor, "+.2f"), "m"); c.let("Clear wall height (floor → roof soffit / wall top)", "Hw", R(lv.Hw, 3), "m");
    c.let("Earth retained (GL → underside of base)", "He", R(lv.He, 3), "m", "", pos === "og" ? "tank on ground – no earth on the walls" : "");
    return lv;
  }

  /* masonry panels between RCC bands + the bands; returns {steps, bands, ok} */
  function btWalls(c, inp, mode, cap, lv, roof, cover) {
    var fck = num(inp.fck), fy = num(inp.fy), gam = num(inp.gamma), phi = num(inp.phi), q = num(inp.surcharge), gw = num(inp.gwt);
    var ft = masonryTension(inp.mortar), K0 = 1 - Math.sin(phi * Math.PI / 180), H = lv.Hw;
    var steps = mode === "check" ? [{ t: num(inp.t_base_chk), h: Math.min(num(inp.h_base_chk), H) }, { t: num(inp.t_top_chk), h: Math.max(H - Math.min(num(inp.h_base_chk), H), 0) }].filter(function (s) { return s.h > 1e-6; }) : stepWalls(H);
    c.section("Brick masonry walls (IS 1905)");
    c.let("Wall thickness (bottom → top)", "", steps.map(function (s) { return G(s.t) + " mm × " + F(s.h, ".2f") + " m"; }).join(" + "), "", "practice: ≤ 1.5 m: 230; ≤ 2.5 m: 345 + 230; ≤ 3.5 m: 460 + 345 + 230",
      String(inp.mortar) + "; inside 20 mm CM 1:4 plaster with water-proofing compound + neat cement");
    c.let("Permissible flexural tension (" + ft[2] + ")", "ft", ft[0] + " ⊥ / " + ft[1] + " ∥ bed joints", "N/mm²", "IS 1905 cl 5.4.2 (verify)");
    // pressure at the floor (outward, tank full) and inward (empty, earth + groundwater)
    var pw = c.calc("Water pressure at floor (tank full / water test before backfill)", "pw", "10*D", "kN/m²", "IS 3370-1", { D: cap.D });
    var hw = Math.max(0, lv.He - gw), pe = 0;
    if (lv.pos !== "og") {
      c.calc("At-rest earth pressure coefficient", "K0", "1 - sin(radians(phi))", "", "Jaky – walls restrained by base, bands & roof", { phi: phi });
      pe = c.calc("Earth + surcharge + groundwater pressure at floor (tank empty)", "pe", "K0*(q + g*Hf) - K0*10*hw + 10*hw", "kN/m²", "",
        { K0: R(K0, 4), q: q, g: gam, Hf: R(Math.max(-lv.floor, 0), 3), hw: R(Math.max(0, Math.max(-lv.floor, 0) - gw), 3) });
    }
    var pmax = Math.max(pw, pe);
    // band spacing from masonry flexure: panel spans vertically between bands (continuous): M = p·s²/12, f = 6M/t² − σc ≤ ft
    var tmin = steps[steps.length - 1].t / 1000, tb0 = steps[0].t / 1000;
    var sbReq = c.calc("Band spacing so that masonry between bands stays within the permissible tension", "s,req", "sqrt(12*ft*1000*t**2/(6*p))", "m",
      "panel spanning vertically between RCC bands, M = p s²/12 [APPROX]", "self-weight compression ignored (conservative)", { ft: ft[0], t: R(tb0, 3), p: R(pmax, 3) });
    var sb = mode === "check" ? num(inp.band_s_chk) : Math.max(0.45, Math.min(inp._sbMax || 1.2, C.floor_to(sbReq, 0.15)));
    var nb = Math.max(1, Math.ceil(H / sb - 1e-9) - 1);         // intermediate bands (the roof slab / top band closes the top)
    if (!roof) nb = Math.max(1, Math.ceil(H / sb - 1e-9));      // open tank: the top band is the coping band
    c.let("RCC bands adopted", "n × s", nb + " × " + F(sb, ".2f"), "m", "practice: bands every 0.9–1.2 m in brick tanks; plinth (floor) band = base slab",
      roof ? "the roof slab props the wall top" : "open tank – top band acts as a ring beam");
    var bandsZ = []; for (var i = 1; i <= nb; i++) bandsZ.push(Math.min(i * sb, H - 0.05));
    var okAll = true;
    // check masonry in the worst (bottom) panel
    var tbot = steps[0].t / 1000, sPanel = Math.min(sb, H);
    var Mm = c.calc("Bottom panel – vertical bending between floor and first band", "Mm", "p*s**2/12", "kN·m/m", "", { p: R(pmax, 3), s: R(sPanel, 3) });
    var sig = (GM * tbot * Math.max(H - sPanel / 2, 0) + (roof ? 25 * 0.15 * cap.B / 2 : 0)) / tbot / 1000;
    var fm = c.calc("Flexural tension in masonry (net of compression from the wall above)", "fm", "6*Mm/(t**2)/1000 - sc", "N/mm²", "IS 1905 cl 5.4.2", { Mm: Mm, t: R(tbot, 3), sc: R(sig, 4) });
    okAll = c.check("Masonry flexural tension ⊥ bed joints ≤ permissible", fm, ft[0], { unit: "N/mm²", clause: "IS 1905 cl 5.4.2 (verify)" }) && okAll;
    var Vb = 0.6 * pmax * sPanel, tv = Vb / tbot / 1000;
    okAll = c.check("Shear at the panel base ≤ 0.1 + σd/6 (≤ 0.5)", tv, Math.min(0.1 + sig / 6, 0.5), { unit: "N/mm²", clause: "IS 1905 cl 5.4.3 (verify)" }) && okAll;
    // design the most loaded band: tributary height = sb (bottom band also carries half of the floor panel)
    c.section("RCC horizontal bands (horizontal beams, IS 3370-2)");
    var zb = bandsZ[0], depthBelowTWL = Math.max((lv.twl - lv.floor) - zb, 0), pB = Math.max(10 * depthBelowTWL, lv.pos !== "og" ? pe * Math.max(H - zb, 0) / Math.max(H, 1e-6) : 0);
    var hb = mode === "check" ? num(inp.band_h_chk) : (inp._hb || 150), tbw = wallAt(steps, zb) / 1000;
    var w = c.calc("Load on the lowest band (pressure at band level × tributary height)", "w", "p*s", "kN/m", "", { p: R(Math.max(pB, 0.5 * pmax), 3), s: R(sb, 3) });
    var Ms = c.calc("Bending in the band – long wall, fixed at the corners (service)", "Ms", "w*L**2/12", "kN·m", "continuous ring – corner moment", { w: R(w, 3), L: R(cap.L + tbw, 3) });
    var Ts = c.calc("Direct tension in the band from the cross walls (service)", "Ts", "w*B/2", "kN", "", { w: R(w, 3), B: R(cap.B + tbw, 3) });
    var dB = tbw * 1000 - cover - 6 - 6;
    var sst = 130;
    var Asb = c.calc("Steel for bending + direct tension, σst ≤ 130 N/mm² (each face)", "As", "(Ms*1e6/(0.87*d) + Ts*1000/2)/sst", "mm²", "IS 3370-2:2009 cl 4.3 / Table 2 (σst for liquid-face members – verify)",
      { Ms: R(Ms, 4), d: R(dB, 1), Ts: R(Ts, 3), sst: sst });
    var OPTS = [[2, 10], [2, 12], [3, 10], [3, 12], [2, 16], [3, 16], [4, 16], [4, 20]], pickB = OPTS.filter(function (o) { return o[0] * area(o[1]) >= Asb - 1e-6; })[0] || OPTS[OPTS.length - 1];
    var nbar = pickB[0], dia = pickB[1];
    if (mode === "check") { dia = num(inp.band_dia_chk); nbar = 2; }
    var okB = c.check("Band steel provided (each face) ≥ required", nbar * area(dia), Asb, { unit: "mm²", clause: "", mode: ">=" });
    okAll = okB && okAll;
    c.let("Band", "", G(tbw * 1000) + " × " + G(hb) + " mm, " + (2 * nbar) + "-" + G(dia) + "Ø (" + nbar + " each face) + 6Ø links @ 150", "", "M" + G(fck) + "; laps staggered, bars bent round corners with Ld");
    c.ok("Band depth ≥ 150 mm (two brick courses ≈ 150)", hb >= 150 - 1e-9, { detail: G(hb) + " mm", clause: "practice", warn_only: true });
    return { steps: steps, sb: sb, nb: nb, bandsZ: bandsZ, band: { b: tbw * 1000, h: hb, dia: dia, n: 2 * nbar }, pw: pw, pe: pe, ok: okAll, K0: K0, hw: hw };
  }

  function btSlabs(c, inp, mode, cap, lv, walls, roof, cover, t) {
    var fck = num(inp.fck), fy = num(inp.fy), dt = DT(), out = {};
    var tw = walls.steps[0].t / 1000, ttop = walls.steps[walls.steps.length - 1].t / 1000;
    var two = cap.two, L = cap.L, B = cap.B;
    // base slab
    c.section("Base slab (RCC)");
    var Lo = L + 2 * tw + (two ? 0.23 : 0), Bo = B + 2 * tw, pr = t.proj, Lb = Lo + 2 * pr, Bb = Bo + 2 * pr, tb = t.tb / 1000, ts = t.ts / 1000;
    c.let("Base slab", "Lb × Bb × tb", F(Lb, ".2f") + " × " + F(Bb, ".2f") + " × " + G(t.tb), "m, mm", "", "projection " + F(pr, ".2f") + " m beyond the walls");
    var Vbrick = walls.steps.reduce(function (a, s) { return a + 2 * (L + B + 2 * s.t / 1000) * s.t / 1000 * s.h; }, 0) + (two ? B * 0.23 * lv.Hw : 0);
    var Ww = GM * Vbrick, Wb = 25 * Lb * Bb * tb, Wr = roof ? 25 * Lo * Bo * ts : 0, Wsoil = lv.pos !== "og" ? num(inp.gamma) * (Lb * Bb - Lo * Bo) * Math.max(-lv.floor, 0) : 0;
    var W = c.calc("Self-weight: walls + base + roof + earth on the projections", "W", "Ww + Wb + Wr + Ws", "kN", "", { Ww: R(Ww, 2), Wb: R(Wb, 2), Wr: R(Wr, 2), Ws: R(Wsoil, 2) });
    var Wwat = 10 * cap.Vp;
    var pb = c.calc("Bearing pressure, tank full", "pb", "(W + Wwater)/(Lb*Bb)", "kN/m²", "", { W: R(W, 2), Wwater: R(Wwat, 2), Lb: R(Lb, 3), Bb: R(Bb, 3) });
    var okP = c.check("Bearing pressure ≤ SBC", pb, num(inp.sbc), { unit: "kN/m²", clause: "IS 1904" });
    var hw = Math.max(0, -lv.base - num(inp.gwt)), U = 0, okF = true;
    if (hw > 0) {
      U = c.calc("Uplift on the empty tank", "U", "10*hw*Lb*Bb", "kN", "", { hw: R(hw, 3), Lb: R(Lb, 3), Bb: R(Bb, 3) });
      okF = c.check("Flotation: 1.2 × uplift ≤ self-weight (empty)", 1.2 * U, W, { unit: "kN", clause: "IS 3370-1 practice (FoS 1.2)", note: "increase the base projection / thickness" });
      c.warn("Groundwater above the base", "Masonry tanks below the water table seep – external bitumen coat + RCC recommended", "practice");
    } else c.info("Uplift", "Groundwater below the base – no flotation (confirm the monsoon / mine-water level)", "");
    var wr = (Ww + Wr) / (Lb * Bb), wu = hw > 0 ? Math.max(10 * hw - 25 * tb, 0) : 0, Bc = B + tw;
    var Mt = c.calc("Base moment (wall & roof load spread on the base + uplift, span B)", "Mt", "(wr + wu)*Bc**2/8", "kN·m/m", "", { wr: R(wr, 3), wu: R(wu, 3), Bc: R(Bc, 3) });
    var gb = mode === "check" ? [num(inp.base_dia), num(inp.base_s)] : null;
    out.bt = X().designStrip(c, 1.5 * Mt, t.tb, cover, fck, fy, "base, top face", { Ms: Mt, climit: 0.2, given: gb, rule: dt ? { member: "water", role: "main" } : null,
      Amin: { As: dt ? dt.water_min_steel(t.tb).As : 0.0012 * 1000 * t.tb / 2, label: "Minimum steel per face", clause: "IS 3370-2 cl 8.1" }, Vu: 1.5 * (wr + wu) * Bc / 2, dias: [8, 10, 12, 16] });
    out.bb = X().designStrip(c, 0, t.tb, cover + 25, fck, fy, "base, bottom face", { Ms: 0, given: gb, rule: dt ? { member: "water", role: "main" } : null,
      Amin: { As: dt ? dt.water_min_steel(t.tb).As : 0.0012 * 1000 * t.tb / 2, label: "Minimum steel per face", clause: "IS 3370-2 cl 8.1" }, dias: [8, 10, 12, 16] });
    out.ok = okP && okF;
    // roof slab
    if (roof) {
      c.section("Roof slab (one-way over the width)");
      var le = c.calc("Effective span", "le", "B + t", "m", "IS 456 cl 22.2", { B: B, t: R(ttop, 3) });
      var wl = c.calc("Load on roof slab", "w", "25*ts + 1.0 + ql", "kN/m²", "IS 875-1/2", "self + 1.0 finishes / earth cover + live " + G(num(inp.roof_ll)) + " kN/m²", { ts: ts, ql: num(inp.roof_ll) });
      var gr = mode === "check" ? [num(inp.roof_dia), num(inp.roof_s)] : null;
      out.rs = X().designStrip(c, 1.5 * wl * le * le / 8, t.ts, Math.max(cover - 10, 25), fck, fy, "roof slab, bottom", { Ms: wl * le * le / 8, climit: 0.2, given: gr,
        rule: dt ? { member: "water", role: "main" } : null, Vu: 1.5 * wl * le / 2, dias: [8, 10, 12, 16] });
      RC().deflection(c, le * 1000, out.rs.d, "simply supported", fy, out.rs.req, out.rs.Ast_prov, 1000);
      out.rsd = X().stripBars(c, 0.0012 * 1000 * t.ts, "slab", "dist", out.rs.d - out.rs.dia, t.ts, null, "roof slab distribution", { dias: [8, 10], rule: { main_dia: out.rs.dia } });
      c.info("Openings", (two ? 2 : 1) + " manhole(s) 600 × 600 with CI / precast covers + 1 vent cowl; trimmers 2-12Ø each side of each opening (Ld past corners)", "SP 34 / IS 456 cl 26.5.2");
    }
    Object.assign(out, { Lo: Lo, Bo: Bo, Lb: Lb, Bb: Bb, W: W, U: U, pb: pb });
    return out;
  }

  function run_brick_tank(inp, mode) {
    inp = Object.assign({}, inp); delete inp._sbMax; delete inp._hb;
    var c = new C.Calc("Brick masonry water tank / sump");
    var roof = String(inp.roof).indexOf("RCC") === 0, fck = num(inp.fck), fy = num(inp.fy);
    var cover = coverAdopt(c, inp, mode, "slab");
    if (DT()) DT().site_checks(c, "water", fck, cover);
    var cap = btCapacity(c, inp, mode);
    var t = mode === "check" ? { tb: num(inp.tb_chk), ts: num(inp.ts_chk), proj: num(inp.proj_chk) } : { tb: 150, ts: 120, proj: 0.15 };
    if (mode !== "check") t.ts = Math.max(120, ceil_to((cap.B + 0.23) * 1000 / 28, 10));
    var lv, walls, sl;
    for (var it = 0; it < 40; it++) {
      var sc = new C.Calc("s");
      lv = btLevels(sc, inp, cap, t.ts / 1000, t.tb / 1000, roof);
      walls = btWalls(sc, inp, mode, cap, lv, roof, cover);
      sl = btSlabs(sc, inp, mode, cap, lv, walls, roof, cover, t);
      if (mode === "check") break;
      var f = sc.failures.map(function (s) { return s.section + " | " + s.label; }), ch = false;
      if (f.some(function (x) { return /^Base slab[^|]*\| (?!Flotation|Bearing)/.test(x); })) { t.tb += 25; ch = true; }
      if (f.some(function (x) { return /^RCC horizontal bands|^Brick masonry walls/.test(x); })) {
        if ((inp._sbMax || 1.2) > 0.6) inp._sbMax = R((inp._sbMax || 1.2) - 0.15, 2); else if ((inp._hb || 150) < 300) inp._hb = (inp._hb || 150) + 50; else break;
        ch = true; }
      if (f.some(function (x) { return /Flotation|Bearing/.test(x); })) { if (t.proj < 0.75) t.proj = R(t.proj + 0.05, 2); else t.tb += 25; ch = true; }
      if (f.some(function (x) { return /^Roof slab/.test(x); })) { t.ts += 10; ch = true; }
      if (!ch) break;
    }
    lv = btLevels(c, inp, cap, t.ts / 1000, t.tb / 1000, roof);
    walls = btWalls(c, inp, mode, cap, lv, roof, cover);
    sl = btSlabs(c, inp, mode, cap, lv, walls, roof, cover, t);
    c.section("Fittings");
    var nMH = cap.two ? 2 : 1, nFR = Math.max(0, Math.floor((lv.Hw - 0.3) / 0.3));
    c.let("Manholes / foot rests", "", nMH + " × 600 × 600, " + nFR + " MS foot rests @ 300 per manhole", "", "IS 3370 practice / CPWD 19.15");
    c.let("Pipes", "", "inlet with float valve, outlet 75 mm above floor, scour at floor with sump pocket, overflow at TWL with mosquito-proof mesh", "", "CPHEEO");
    if (lv.Hw > 3.5) c.warn("Deep tank", "Clear height " + F(lv.Hw, ".2f") + " m > 3.5 m – use RCC walls (underground sump module, IS 3370)", "practice");
    c.thumb("Bottom wall thickness", lv.Hw <= 1.5 ? 230 : lv.Hw <= 2.5 ? 345 : 460, walls.steps[0].t, "mm", "≤1.5 m: 230; ≤2.5 m: 345; ≤3.5 m: 460", "CPWD / PWD type designs");
    c.thumb("Band spacing", 1000, walls.sb * 1000, "mm", "bands every ≈ 1 m of height", "Practice");
    c.miss("Water-tightness test (fill, 7 days, drop ≤ 40 mm or as per IS 3370-1) before plastering outside / backfilling", "IS 3370-1 cl 10", "Important");
    c.miss("Distance ≥ 15 m from septic tanks / soak pits; tank top ≥ 150 mm above flood / drain level", "CPHEEO", "Important");
    if (isMine()) c.miss("Mine water / acidic seepage: SRC cement for base & bands, external bitumen coat", "IS 456 Table 4", "Important");
    // ---------------------------------------------------------------- BBS
    var bbs = [], B_ = BB(), cv = cover, nos = Math.max(1, Math.trunc(num(inp.nos))), tw = walls.steps[0].t / 1000;
    var Lb = sl.Lb, Bb = sl.Bb, Lo = sl.Lo, Bo = sl.Bo;
    bbs.push(B_.row("Base slab", "B1", sl.bb.dia, "straight", B_.count(Bb * 1000, sl.bb.spacing, cv) * nos, B_.split(sl.bb.dia, Lb * 1000 - 2 * cv, fck, fy), "bottom, along length @ " + G(sl.bb.spacing)));
    bbs.push(B_.row("Base slab", "B2", sl.bb.dia, "straight", B_.count(Lb * 1000, sl.bb.spacing, cv) * nos, B_.straight(sl.bb.dia, Bb * 1000 - 2 * cv), "bottom, across @ " + G(sl.bb.spacing)));
    bbs.push(B_.row("Base slab", "B3", sl.bt.dia, "straight", B_.count(Bb * 1000, sl.bt.spacing, cv) * nos, B_.split(sl.bt.dia, Lb * 1000 - 2 * cv, fck, fy), "top, along length @ " + G(sl.bt.spacing)));
    bbs.push(B_.row("Base slab", "B4", sl.bt.dia, "straight", B_.count(Lb * 1000, sl.bt.spacing, cv) * nos, B_.straight(sl.bt.dia, Bb * 1000 - 2 * cv), "top, across @ " + G(sl.bt.spacing)));
    walls.bandsZ.forEach(function (z, i) {
      var tz = wallAt(walls.steps, z) / 1000, per = 2 * (cap.L + cap.B + 2 * tz) * 1000, lap = B_.lap(walls.band.dia, fck, fy);
      bbs.push(B_.row("RCC bands", "R" + (i + 1), walls.band.dia, "ring, lapped / bent round corners", walls.band.n * nos, B_.split(walls.band.dia, per + lap, fck, fy), "band at +" + F(z, ".2f") + " m above floor, " + walls.band.n + " bars"));
      bbs.push(B_.row("RCC bands", "L" + (i + 1), 6, "closed link", B_.count(per, 150, 50) * nos, B_.stirrup(6, tz * 1000, walls.band.h, Math.max(cv - 10, 20)), "links @ 150"));
    });
    if (roof) {
      var csc = Math.max(cover - 10, 25);
      bbs.push(B_.row("Roof slab", "S1", sl.rs.dia, "straight", B_.count(Lo * 1000, sl.rs.spacing, csc) * nos, B_.straight(sl.rs.dia, Bo * 1000 - 2 * csc), "main, across width @ " + G(sl.rs.spacing)));
      bbs.push(B_.row("Roof slab", "S2", sl.rsd.dia, "straight", B_.count(Bo * 1000, sl.rsd.spacing, csc) * nos, B_.split(sl.rsd.dia, Lo * 1000 - 2 * csc, fck, fy), "distribution @ " + G(sl.rsd.spacing)));
      bbs.push(B_.row("Roof slab", "S3", 12, "straight trimmer", 8 * nMH * nos, B_.straight(12, Math.min(600 + 2 * B_.Ld(12, fck, fy), Bo * 1000 - 2 * csc)), "2 bars each side of each opening"));
    }
    // ---------------------------------------------------------------- quantities
    var qty = [], work = 0.3, zexc = Math.max(-lv.base + 0.1, 0);
    if (zexc > 0) qty.push(Q("Earth work in excavation for tank, all kinds of soil", "cum", [row("Tank pit (base + working space)", nos, Lb + 2 * work, Bb + 2 * work, zexc)], [CPWD(), "2.8.1"]));
    qty.push(Q("PCC 1:4:8 levelling course below base slab", "cum", [row("Below base", nos, Lb + 0.2, Bb + 0.2, 0.1)], [CPWD(), "4.1.8"]));
    qty.push(Q("RCC M" + G(fck) + " in base slab of tank (excl. steel & shuttering)", "cum", [row("Base slab", nos, Lb, Bb, t.tb / 1000)], null, CM().rcc_rate(fck)));
    var bandRows = walls.bandsZ.map(function (z, i) { var tz = wallAt(walls.steps, z) / 1000; return row("Band " + (i + 1) + " (centre-line perimeter × width × depth)", nos, 2 * (cap.L + cap.B + 2 * tz) + (cap.two ? cap.B : 0), tz, walls.band.h / 1000); });
    qty.push(Q("RCC M" + G(fck) + " in horizontal bands of tank walls (excl. steel & shuttering)", "cum", bandRows, null, CM().rcc_rate(fck)));
    if (roof) qty.push(Q("RCC M" + G(fck) + " in roof slab of tank (excl. steel & shuttering)", "cum", [row("Roof slab", nos, Lo, Bo, t.ts / 1000), row("Deduct manholes 600 × 600", nMH * nos, 0.6, 0.6, t.ts / 1000, true)], null, CM().rcc_rate(fck)));
    // masonry, split below / above GL
    var bRowsB = [], bRowsA = [], z0 = lv.floor, bandH = walls.band.h / 1000;
    walls.steps.forEach(function (s) {
      var tt = s.t / 1000, per = 2 * (cap.L + cap.B + 2 * tt), zTop = z0 + s.h, nBandsIn = walls.bandsZ.filter(function (z) { return lv.floor + z > z0 && lv.floor + z <= zTop; }).length;
      var hNet = s.h - nBandsIn * bandH, below = Math.max(0, Math.min(zTop, 0) - z0) * (hNet / s.h), above = Math.max(hNet - below, 0);
      if (below > 1e-6) bRowsB.push(row("Walls " + G(s.t) + " (centre-line perimeter × t × h, bands deducted)", nos, per, tt, below));
      if (above > 1e-6) bRowsA.push(row("Walls " + G(s.t) + " above GL (perimeter × t × h, bands deducted)", nos, per, tt, above));
      z0 = zTop;
    });
    if (cap.two) bRowsB.push(row("Partition wall 230", nos, cap.B, 0.23, Math.max(lv.Hw - walls.nb * bandH, 0)));
    if (bRowsB.length) qty.push(Q(brickDesc(inp.mortar, "tank walls"), "cum", bRowsB, brickItem(inp.mortar, false)));
    if (bRowsA.length) qty.push(Q(brickDesc(inp.mortar, "tank walls above GL", true), "cum", bRowsA, brickItem(inp.mortar, true)));
    var inArea = 2 * (cap.L + cap.B) * lv.Hw + cap.L * cap.B + (cap.two ? 2 * cap.B * lv.Hw : 0);
    qty.push(Q("20 mm cement plaster 1:4 with integral water-proofing compound – inside walls & floor", "sqm", [row("Inside walls", nos, 2 * (cap.L + cap.B), null, lv.Hw), row("Floor", nos, cap.L, cap.B)].concat(cap.two ? [row("Partition (2 faces)", 2 * nos, cap.B, null, lv.Hw)] : []), [CPWD(), "13.6.1"]));
    qty.push(Q("Neat cement punning on inside plaster", "sqm", [row("Inside surfaces", nos, inArea)], [CPWD(), "13.18"]));
    qty.push(Q("Integral water-proofing compound in plaster (≈ 0.15 kg / m²)", "kg", [row("Inside plaster", nos, inArea, 0.15)], null, 60, "Non-SOR – IS 2645"));
    var hOut = Math.max(lv.top, 0) + 0.15;
    if (hOut > 0.2) qty.push(Q("12 mm cement plaster 1:4 on exposed outer face", "sqm", [row("Outer face above GL", nos, 2 * (Lo + Bo), null, hOut)], [CPWD(), "13.4.1"]));
    qty.push(Q("Centering & shuttering – base slab edges, bands (both faces), roof soffit & edges", "sqm",
      [row("Base edges", nos, 2 * (Lb + Bb), null, t.tb / 1000), row("Bands (2 faces)", 2 * nos * walls.bandsZ.length, 2 * (cap.L + cap.B + 2 * tw), null, bandH)].concat(roof ? [row("Roof soffit", nos, cap.L + (cap.two ? 0.23 : 0), cap.B), row("Roof edges", nos, 2 * (Lo + Bo), null, t.ts / 1000)] : []), null, CM().RATE.shutter_slab));
    qty.push(X().steelQty(bbs, "Tank"));
    if (roof) qty.push(Q("Supplying & fixing CI manhole cover with frame, medium duty (500 mm dia / 600 × 600 equivalent)", "each", [row("Tank", nMH * nos)], [CPWD(), "19.18.2"]));
    if (nFR) qty.push(Q("M.S. foot rests fixed in concrete blocks 1:3:6", "each", [row("Per manhole", nMH * nos, nFR)], [CPWD(), "19.15.1"]));
    qty.push(Q("GI / PVC inlet, outlet, scour & overflow pipes with valves, mosquito-proof mesh & vent cowl (lump sum)", "each", [row("Set per tank", nos)], null, 18000, "Non-SOR"));
    if (zexc > 0) {
      var exV = (Lb + 2 * work) * (Bb + 2 * work) * zexc, stV = (Lb + 0.2) * (Bb + 0.2) * 0.1 + Lb * Bb * t.tb / 1000 + Lo * Bo * Math.max(-lv.floor, 0);
      qty.push(Q("Filling available excavated earth around the tank in layers", "cum", [row("Around tank", nos, Math.max(exV - stV, 0))], [CPWD(), "2.25"]));
    }
    var sheet = btDrawing(inp, cap, lv, walls, sl, roof, t, nMH, nFR);
    var summary = { "Tank (inside)": F(cap.L, ".2f") + " × " + F(cap.B, ".2f") + " m, water " + F(cap.D, ".2f") + " m → " + F(cap.Vp, ".1f") + " kL" + (cap.two ? " (2 compartments)" : ""),
      "Walls": walls.steps.map(function (s) { return G(s.t); }).join(" / ") + " mm brick, " + String(inp.mortar).split(" (")[0],
      "RCC bands": walls.nb + " nos @ " + F(walls.sb, ".2f") + " m, " + walls.band.n + "-" + G(walls.band.dia) + "Ø",
      "Base / roof": G(t.tb) + " mm (" + G(sl.bt.dia) + "Ø @ " + G(sl.bt.spacing) + ")" + (roof ? " / " + G(t.ts) + " mm (" + G(sl.rs.dia) + "Ø @ " + G(sl.rs.spacing) + ")" : " / open"),
      "Levels": "FL " + F(lv.floor, "+.2f") + ", TWL " + F(lv.twl, "+.2f") + ", top " + F(lv.top, "+.2f") + " m (GL ±0.00)",
      "Max utilisation": F(c.max_utilisation, ".2f") };
    var refs = ["IS 1905:1987 – Structural use of unreinforced masonry", "IS 3370 (Part 1 & 2):2009 – Liquid-retaining structures",
      "CPHEEO Manual on Water Supply (1999)", "IS 456:2000", "SP 34", "CPWD DSR 2021 specifications"];
    return C.DesignResult({ module: "brick_tank", title: "Brick masonry water tank / sump", inputs: inp, calc: c, summary: summary, drawings: [sheet], quantities: qty, bbs: bbs, tables: {}, references: refs });
  }
  M.run_brick_tank = run_brick_tank;

  function btDrawing(inp, cap, lv, walls, sl, roof, t, nMH, nFR) {
    var D_ = DR(), L = cap.L * 1000, B = cap.B * 1000, steps = walls.steps, t0 = steps[0].t, tt = steps[steps.length - 1].t, ptn = cap.two ? 230 : 0;
    // plan (at the top course)
    var p = new D_.View("Plan (at top)");
    var Lo = L + 2 * tt + ptn, Bo = B + 2 * tt;
    p.rect(0, 0, Lo, Bo, "OUTLINE", "brick"); p.rect(tt, tt, cap.two ? (L - ptn) / 2 + ptn / 2 : L, B, "OUTLINE", "water");
    if (cap.two) { p.rect(tt + L / 2 + ptn / 2, tt, L / 2 - ptn / 2, B, "OUTLINE", "water"); p.rect(tt + L / 2 - ptn / 2, tt, ptn, B, "OUTLINE", "brick"); }
    if (roof) { p.rect(tt + 200, tt + (B - 600) / 2, 600, 600, "HIDDEN"); if (cap.two) p.rect(Lo - tt - 800, tt + (B - 600) / 2, 600, 600, "HIDDEN"); p.text(tt + 500, tt + B / 2, "MH 600×600", 1.8, { anchor: "middle" }); }
    p.line(-700, Bo - tt - 300, tt + 150, Bo - tt - 300, "STEEL"); p.text(-700, Bo - tt - 200, "INLET", 1.8);
    p.line(Lo - tt - 150, tt + 300, Lo + 700, tt + 300, "STEEL"); p.text(Lo + 100, tt + 400, "OUTLET / OVERFLOW", 1.8);
    p.dim(0, 0, Lo, 0, 10); p.dim(Lo, 0, Lo, Bo, -16); p.dim(tt, Bo, tt + L, Bo, -6, "INSIDE " + F(L, ",.0f")); p.dim(Lo - tt, tt, Lo - tt, tt + B, -6, "INSIDE " + F(B, ",.0f"));
    // cross section across the width
    var s = new D_.View("Section across width");
    var yF = lv.floor * 1000, yb = yF - t.tb, yS = lv.soffit * 1000, yT = lv.top * 1000, yW = lv.twl * 1000;
    var xL = -sl.Bb * 500 + 0, Bb = sl.Bb * 1000;
    s.rect(-Bb / 2, yb, Bb, t.tb, "OUTLINE", "concrete"); s.rect(-Bb / 2 - 100, yb - 100, Bb + 200, 100, "CONCRETE");
    [-1, 1].forEach(function (side) {
      var y = yF;
      steps.forEach(function (st) {
        var x = side < 0 ? -B / 2 - st.t : B / 2;
        s.rect(x, y, st.t, st.h * 1000, "OUTLINE", "brick"); y += st.h * 1000;
      });
      walls.bandsZ.forEach(function (z) { var tz = wallAt(steps, z), x = side < 0 ? -B / 2 - tz : B / 2; s.rect(x, yF + z * 1000 - walls.band.h, tz, walls.band.h, "OUTLINE", "concrete"); });
    });
    if (roof) s.rect(-B / 2 - tt, yS, B + 2 * tt, t.ts, "OUTLINE", "concrete");
    s.line(-B / 2, yW, B / 2, yW, "WATER"); s.text(0, yW + 60, "TWL " + F(lv.twl, "+.2f"), 1.8, { anchor: "middle" });
    s.line(-Bb / 2 - 1500, 0, Bb / 2 + 1500, 0, "SOIL"); s.text(Bb / 2 + 1500, 60, "GL ±0.00", 1.8, { anchor: "end" });
    s.text(0, yb - 600, "Base " + G(t.tb) + ": " + G(sl.bt.dia) + "Ø@" + G(sl.bt.spacing) + " top, " + G(sl.bb.dia) + "Ø@" + G(sl.bb.spacing) + " bottom, both ways", 1.8, { anchor: "middle" });
    if (roof) s.text(0, yT + 200, "Roof slab " + G(t.ts) + ": " + G(sl.rs.dia) + "Ø@" + G(sl.rs.spacing) + " main, " + G(sl.rsd.dia) + "Ø@" + G(sl.rsd.spacing) + " dist.", 1.8, { anchor: "middle" });
    s.text(B / 2 + t0 + 150, yF + walls.bandsZ[0] * 1000, "RCC band " + G(walls.band.h) + " deep, " + walls.band.n + "-" + G(walls.band.dia) + "Ø + 6Ø@150", 1.8);
    s.dim(-B / 2, yF, B / 2, yF, 6, "INSIDE " + F(B, ",.0f")); s.dim(-B / 2 - t0 - 900, yF, -B / 2 - t0 - 900, yW, 8, "WATER " + F(cap.D * 1000, ",.0f"));
    s.dim(B / 2 + t0 + 1600, yF, B / 2 + t0 + 1600, yS, -8);
    for (var k = 0; k < Math.min(nFR, 10); k++) s.line(-B / 2, yF + 450 + k * 300, -B / 2 + 120, yF + 450 + k * 300, "STEEL");
    // band detail
    var d = new D_.View("Band detail"), bw = walls.band.b, bh = walls.band.h;
    d.rect(0, 0, bw, bh, "OUTLINE", "concrete"); d.rect(0, -300, bw, 300, "OUTLINE", "brick"); d.rect(0, bh, bw, 300, "OUTLINE", "brick");
    var cv = 30; d.rect(cv, cv, bw - 2 * cv, bh - 2 * cv, "REBAR");
    var nn = walls.band.n / 2; for (var j = 0; j < nn; j++) { var xx = cv + 10 + j * (bw - 2 * cv - 20) / Math.max(nn - 1, 1); d.bar_dot(xx, cv + 10, walls.band.dia); d.bar_dot(xx, bh - cv - 10, walls.band.dia); }
    d.dim(0, -300, bw, -300, 6); d.dim(bw, 0, bw, bh, -6);
    var notes = ["Brick masonry FPS class 7.5 in " + String(inp.mortar) + "; inside 20 mm CM 1:4 plaster with water-proofing compound + neat cement punning; inside corners rounded 50 mm.",
      "RCC M" + G(num(inp.fck)) + " base, bands" + (roof ? " and roof slab" : "") + "; Fe" + G(num(inp.fy)) + "; band bars bent round corners and lapped (staggered).",
      "Levels in m, GL ±0.00: FL " + F(lv.floor, "+.2f") + ", TWL " + F(lv.twl, "+.2f") + ", top " + F(lv.top, "+.2f") + ".",
      "Water-tightness test before backfilling / outside plaster (IS 3370-1). Scour with sump pocket; overflow & vent with mosquito-proof mesh."];
    return new D_.Sheet("Brick masonry water tank / sump", "BT-01", [p, s, d], notes);
  }

  var BT_PARAMS = [
    P("cap_kl", "Storage capacity", 20.0, "kL", { min: 2, max: 150, step: 1, group: "Capacity & levels" }),
    P("depth", "Water depth", 1.8, "m", { min: 1.0, max: 3.0, step: 0.05, group: "Capacity & levels" }),
    P("ratio", "Length : width", 1.5, { min: 1, max: 3, step: 0.25, group: "Capacity & levels" }),
    P("freeboard", "Free board (TWL → roof soffit)", 0.3, "m", { min: 0.15, max: 0.6, step: 0.05, group: "Capacity & levels" }),
    P("compart", "Compartments", "1 (single)", { kind: "select", options: ["1 (single)", "2 (partition – clean one half at a time)"], group: "Capacity & levels" }),
    P("position", "Position", BT_POS[0], { kind: "select", options: BT_POS.slice(), group: "Capacity & levels" }),
    P("top_above", "Top of roof above GL (underground)", 0.3, "m", { min: 0, max: 1.0, step: 0.05, group: "Capacity & levels", when: function (v) { return /^Under/.test(String(v.position)); } }),
    P("floor_depth", "Floor below GL (partly buried)", 1.0, "m", { min: 0.2, max: 3.0, step: 0.05, group: "Capacity & levels", when: function (v) { return /^Partly/.test(String(v.position)); } }),
    P("plinth", "Floor above GL (on ground)", 0.3, "m", { min: 0.15, max: 1.5, step: 0.05, group: "Capacity & levels", when: function (v) { return /^On ground/.test(String(v.position)); } }),
    P("roof", "Roof", BT_ROOF[0], { kind: "select", options: BT_ROOF.slice(), group: "Structure" }),
    P("roof_ll", "Live load on roof", 1.5, "kN/m²", { min: 0.75, max: 10, group: "Structure", when: function (v) { return String(v.roof).indexOf("RCC") === 0; } }),
    P("mortar", "Masonry mortar", MORTAR[0], { kind: "select", options: MORTAR.slice(), group: "Structure" }),
    P("gamma", "Soil unit weight", 18.0, "kN/m³", { min: 15, max: 22, group: "Soil" }),
    P("phi", "Soil angle of friction", 30.0, "°", { min: 20, max: 40, group: "Soil" }),
    P("surcharge", "Surcharge beside the tank", 5.0, "kN/m²", { min: 0, max: 30, group: "Soil" }),
    P("gwt", "Highest groundwater below GL", 5.0, "m", { min: 0, max: 20, step: 0.1, group: "Soil" }),
    P("sbc", "Safe bearing capacity", 100.0, "kN/m²", { min: 50, max: 400, group: "Soil" }),
    P("nos", "Number of identical tanks", 1, { kind: "int", min: 1, max: 50, group: "Quantity" })
  ].concat(matParams(30.0, "Moderate", 25.0), [
    P("L_chk", "Inside length (check)", 4.0, "m", { min: 1, max: 12, step: 0.05, group: "My design", modes: CHECK }),
    P("B_chk", "Inside width (check)", 3.0, "m", { min: 1, max: 8, step: 0.05, group: "My design", modes: CHECK }),
    P("D_chk", "Water depth (check)", 1.8, "m", { min: 1, max: 3, step: 0.05, group: "My design", modes: CHECK }),
    P("t_base_chk", "Bottom wall thickness (check)", 345.0, "mm", { kind: "select", options: [230.0, 345.0, 460.0, 575.0], group: "My design", modes: CHECK }),
    P("h_base_chk", "Height of the bottom thickness (check)", 1.2, "m", { min: 0.3, max: 3.5, step: 0.05, group: "My design", modes: CHECK }),
    P("t_top_chk", "Top wall thickness (check)", 230.0, "mm", { kind: "select", options: [230.0, 345.0], group: "My design", modes: CHECK }),
    P("band_s_chk", "RCC band spacing (check)", 1.0, "m", { min: 0.45, max: 2.0, step: 0.05, group: "My design", modes: CHECK }),
    P("band_h_chk", "Band depth (check)", 150.0, "mm", { min: 100, max: 300, step: 25, group: "My design", modes: CHECK }),
    P("band_dia_chk", "Band bar dia, 2 each face (check)", 10.0, "mm", { kind: "select", options: [8.0, 10.0, 12.0, 16.0], group: "My design", modes: CHECK }),
    P("tb_chk", "Base slab thickness (check)", 150.0, "mm", { min: 100, max: 400, step: 25, group: "My design", modes: CHECK }),
    P("proj_chk", "Base projection (check)", 0.15, "m", { min: 0, max: 1, step: 0.05, group: "My design", modes: CHECK }),
    P("base_dia", "Base bar dia (check)", 10.0, "mm", { kind: "select", options: [8.0, 10.0, 12.0, 16.0], group: "My design", modes: CHECK }),
    P("base_s", "Base bar spacing (check)", 150.0, "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK }),
    P("ts_chk", "Roof slab thickness (check)", 120.0, "mm", { min: 100, max: 250, step: 5, group: "My design", modes: CHECK }),
    P("roof_dia", "Roof main bar dia (check)", 10.0, "mm", { kind: "select", options: [8.0, 10.0, 12.0], group: "My design", modes: CHECK }),
    P("roof_s", "Roof main spacing (check)", 150.0, "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK })
  ]);
  M.BT_PARAMS = BT_PARAMS;
  C.register({ id: "brick_tank", phase: 3, category: CAT, name: "Brick masonry water tank / sump", icon: "🧱",
    description: "Rectangular brick tank or underground sump with RCC base, RCC horizontal bands and roof slab: capacity & levels, masonry flexure between bands (IS 1905), " +
      "bands as horizontal beams (bending + direct tension, IS 3370-2), earth / groundwater / water-test cases, flotation, bearing; BBS, CPWD quantities & drawing.",
    params: BT_PARAMS, run: run_brick_tank, references: ["IS 1905:1987", "IS 3370 (Part 1 & 2):2009", "CPHEEO Manual", "IS 456:2000"] });

  /* ======================================================================= 2. WIND / DUST BARRIER (steel posts + sheeting / net) */
  var WB_CLAD = ["Profiled GI / pre-coated sheet 0.50 mm (solid)", "Perforated sheet / wind-net, 30 % open", "HDPE wind & dust net, 50 % open"];
  var WB_POST = ["Auto (lightest ISMB / ISHB that passes)", "ISMB only", "ISHB only"];
  function wbPorosity(inp) { var v = String(inp.cladding); return /50 %/.test(v) ? 0.5 : /30 %/.test(v) ? 0.3 : 0.0; }
  /* net force coefficient on the gross area of a free-standing screen on the ground [APPROX]:
     solid: 1.2 (long walls, L/H ≥ 10) … 1.3 (short), porous: plane-lattice cf0(φ)·φ with φ = solidity (EN 1991-1-4 Fig 7.33 trend) */
  function wbCf(eps, LH) {
    var solid = C.interp(Math.min(Math.max(LH, 1), 20), [1, 5, 10, 20], [1.3, 1.25, 1.2, 1.2]);
    if (eps <= 0) return { cf: solid, phi: 1, how: "solid screen, L/H = " + F(LH, ".1f") };
    var phi = 1 - eps, cf0 = C.interp(phi, [0.1, 0.2, 0.3, 0.5, 0.7, 0.9], [2.0, 1.8, 1.7, 1.6, 1.6, 1.7]);
    return { cf: Math.min(solid, cf0 * phi), phi: phi, cf0: cf0, how: "porous screen, solidity φ = " + F(phi, ".2f") + ", cf0 = " + F(cf0, ".2f") };
  }
  M.wbCf = wbCf;

  function wbPost(c, inp, mode, Mu, Vu, Ms, w, H, tag) {
    var fy = num(inp.fy_st), E = 2e5, fam = String(inp.post_fam), names = [];
    if (!/ISHB only/.test(fam)) names = names.concat(SEC().by_weight(SEC().ISMB));
    if (!/ISMB only/.test(fam)) names = names.concat(SEC().by_weight(SEC().ISHB));
    names.sort(function (a, b) { return SEC().section(a).w - SEC().section(b).w; });
    if (/^Auto/.test(fam)) names = names.concat(SEC().builtup_series());
    if (mode === "check") names = [String(inp.post_chk)];
    var fly = /^Fly/.test(String(inp.fly)), gsp = num(inp._girt_s) || 1.2, LLT = fly ? 2 * gsp : num(inp.llt_f) * H, lim = H * 1000 / num(inp.defl_lim), pick = null;
    for (var i = 0; i < names.length; i++) {
      var s = SEC().section(names[i]), sc = new C.Calc("s");
      var b = ST().bending(sc, Mu, s, fy, LLT, false, "", "z"), sh = ST().shear_strength(sc, Vu, s, fy, "");
      var dl = w * Math.pow(H * 1000, 4) / (8 * E * s.Iz);
      if (b.ok && sh.ok && dl <= lim) { pick = s; break; }
    }
    if (!pick) pick = SEC().section(names[names.length - 1]);
    c.section("Post " + tag + " (cantilever from the base, IS 800)");
    c.let("Section", "", pick.name + " (" + G(pick.w) + " kg/m)", "", "", mode === "check" ? "your section" : "lightest section in the chosen family that passes bending, shear and deflection");
    c.let("Factored moment / shear at the base", "Mu / Vu", F(Mu, ".1f") + " / " + F(Vu, ".1f"), "kN·m / kN", "IS 800 Table 4 (1.5 × wind)");
    var bnd = ST().bending(c, Mu, pick, fy, LLT, false, tag, "z");
    c.info("LTB length", fly ? "LLT = 2 × girt spacing = " + F(LLT, ".2f") + " m (fly braces from the girts to the free inner flange at every 2nd girt)" : "LLT = " + F(num(inp.llt_f), ".2f") + " × H = " + F(LLT, ".2f") + " m (inner flange free – IS 800 Table 16, verify)", "IS 800 cl 8.3.3");
    ST().shear_strength(c, Vu, pick, fy, tag);
    var dl2 = c.calc("Tip deflection under service wind (UDL on a cantilever)", "δ", "w*H**4/(8*E*I)", "mm", "", { w: R(w, 4), H: R(H * 1000, 1), E: E, I: R(pick.Iz, 0) });
    c.check("Deflection ≤ H/" + G(num(inp.defl_lim)), dl2, lim, { unit: "mm", clause: "IS 800 Table 6 (cantilever wind posts – verify)" });
    return { sec: pick, Md: bnd.Md, defl: dl2, Ms: Ms };
  }

  function wbFooting(c, inp, mode, Ms, Vs, Pd, post, tag, cover) {
    var fck = num(inp.fck), fy = num(inp.fy), sbc = num(inp.sbc), Df = num(inp.found_depth), gam = num(inp.gamma), dt = DT();
    var hp = post.sec.h, bp = post.sec.b, a = Math.max(450, ceil_to(Math.max(hp, bp) + 250, 50)), ped = num(inp.ped_above);
    c.section("Base plate, anchor bolts & pedestal " + tag);
    var lever = (hp + 150) / 1000, Mu = 1.5 * Ms;
    var T = c.calc("Bolt tension (2 bolts on the tension side, lever ≈ h + 150)", "T", "Mu/lever/2", "kN per bolt", "", { Mu: R(Mu, 3), lever: R(lever, 3) });
    var BOLTS = [20, 24, 27, 30, 36], db = 36, nb = 2, fub = 400, T2 = T * 2, found = false;
    if (mode !== "check") {
      [[2, 400], [3, 400], [4, 400], [2, 800], [3, 800], [4, 800]].some(function (o) {
        var dd = BOLTS.filter(function (d) { return 0.9 * o[1] * 0.78 * area(d) / 1.25 / 1000 >= T2 / o[0]; })[0];
        if (dd) { nb = o[0]; fub = o[1]; db = dd; found = true; return true; } return false; });
      if (!found) { nb = 4; fub = 800; db = 36; }
      T = T2 / nb;
      if (nb > 2 || fub > 400) c.info("Bolts", nb + " bolts on each side (" + 2 * nb + " per post), property class " + (fub > 400 ? "8.8" : "4.6"), "IS 800");
    } else db = num(inp.bolt_chk);
    var Tdb = c.calc("Tension capacity of one bolt (threads in the plate)", "Tdb", "0.9*fub*0.78*pi*d**2/4/1.25/1000", "kN", "IS 800 cl 10.3.5", "property class " + (fub > 400 ? "8.8" : "4.6"), { fub: fub, d: db });
    c.check("Bolt tension ≤ capacity", T, Tdb, { unit: "kN", clause: "IS 800 cl 10.3.5" });
    var Lanc = c.calc("Anchor length (bond 1.2 N/mm² on 25 % of the plain bolt, hook)", "La", "max(T*1000/(pi*d*1.2), 20*d)", "mm", "IS 456 cl 26.2.1 (plain bars) / practice", { T: R(T, 3), d: db });
    var tp = c.calc("Base plate thickness (cantilever c = 75 mm, bearing 0.45 fck)", "tp", "max(sqrt(2.5*0.45*fck*75**2*1.1/250), 16)", "mm", "IS 800 cl 7.4.3.1", { fck: fck });
    tp = ceil_to(tp, 2);
    c.let("Base plate / bolts / pedestal", "", G(hp + 150) + " × " + G(bp + 150) + " × " + G(tp) + " mm plate, " + 2 * nb + "-M" + G(db) + " × " + G(ceil_to(Lanc + 150, 50)) + " long, pedestal " + G(a) + " × " + G(a), "", "grout 25–40 mm non-shrink");
    // footing
    c.section("Isolated footing " + tag + " (overturning & bearing, IS 1904)");
    var Hm = Ms + Vs * (ped + Df);           // service moment at the footing base
    var tf = mode === "check" ? num(inp.ft_chk) / 1000 : (inp._tf || 0.4), Bf = mode === "check" ? num(inp.fb_chk) : 1.2, res = null;
    function trial(Bf) {
      var Wf = 25 * Bf * Bf * tf + 25 * (a / 1000) * (a / 1000) * (Df - tf + ped) + gam * (Bf * Bf - Math.pow(a / 1000, 2)) * (Df - tf);
      var P = Wf + Pd, e = Hm / P, pmax = e <= Bf / 6 ? P / (Bf * Bf) * (1 + 6 * e / Bf) : 2 * P / (3 * Bf * (Bf / 2 - e));
      var fos = P * Bf / 2 / Hm;
      return { Bf: Bf, Wf: Wf, P: P, e: e, pmax: pmax, fos: fos, ok: fos >= 1.5 && e < Bf / 2 && pmax <= 1.25 * sbc };
    }
    if (mode === "check") res = trial(Bf);
    else for (var B2 = 1.0; B2 <= 6.0 + 1e-9; B2 = R(B2 + 0.1, 2)) { res = trial(B2); if (res.ok) break; }
    Bf = res.Bf;
    c.let("Footing", "B × B × t", F(Bf, ".2f") + " × " + F(Bf, ".2f") + " × " + G(tf * 1000), "m, mm", "", "founded " + F(Df, ".2f") + " m below GL, pedestal " + F(ped, ".2f") + " m above GL");
    c.calc("Moment at the footing base (service wind)", "Mb", "Ms + Vs*(hp + Df)", "kN·m", "", { Ms: R(Ms, 3), Vs: R(Vs, 3), hp: ped, Df: Df });
    c.calc("Vertical load: footing + pedestal + soil + post & cladding", "P", "Wf + Pd", "kN", "", { Wf: R(res.Wf, 2), Pd: R(Pd, 2) });
    c.check("Overturning FoS ≥ 1.5", 1.5, res.fos, { unit: "", clause: "IS 1904 / practice (wind)", mode: "<=", note: "FoS = " + F(res.fos, ".2f") });
    c.calc("Eccentricity", "e", "Mb/P", "m", "", { Mb: R(Hm, 3), P: R(res.P, 3) });
    c.check("Max. soil pressure ≤ 1.25 SBC (wind)", res.pmax, 1.25 * sbc, { unit: "kN/m²", clause: "IS 1904 cl 5.3 (25 % increase for wind)" });
    var cant = (Bf - a / 1000) / 2, Mf = res.pmax * cant * cant / 2;
    var bars = X().designStrip(c, 1.5 * Mf, tf * 1000, Math.max(cover, 50), fck, fy, "footing, bottom (each way)", { Ms: Mf, given: mode === "check" ? [num(inp.fdia_chk), num(inp.fs_chk)] : null,
      rule: dt ? { member: "footing", role: "main" } : null, Amin: { As: 0.0012 * 1000 * tf * 1000, label: "Minimum steel", clause: "IS 456 cl 34.5" }, Vu: 1.5 * res.pmax * Math.max(cant - (tf - 0.06), 0), dias: [10, 12, 16, 20] });
    return { Bf: Bf, tf: tf, a: a, db: db, nb: nb, tp: tp, La: Lanc, bars: bars, res: res, ped: ped, Df: Df };
  }

  function run_wind_barrier(inp, mode) {
    var c = new C.Calc("Wind / dust barrier");
    var H = num(inp.height), Lt = num(inp.length), s = num(inp.post_s), eps = wbPorosity(inp), cover = coverAdopt(c, inp, mode, "footing");
    c.section("Wind (IS 875-3:2015)");
    c.let("Barrier height × length, post spacing", "H × L, s", F(H, ".1f") + " × " + F(Lt, ".0f") + ", " + F(s, ".2f"), "m", "", String(inp.cladding));
    var pd = LD().design_wind_pressure(c, num(inp.vb), H, Math.trunc(num(inp.terrain)), num(inp.k1), num(inp.k3), 1.0, s * H, 0.9, 0.9);
    var cf = wbCf(eps, Lt / H);
    var Cf = c.calc("Net force coefficient on the gross screen area", "Cf", "cfv", "", "IS 875-3 cl 7.4.2 free-standing walls / EN 1991-1-4 cl 7.4 & 7.11 [APPROX – verify]", cf.how, { cfv: R(cf.cf, 3) });
    var Ce = c.calc("End zones (2H from free ends / openings) – multiplier", "ke", "ke", "", "free-standing wall end zones (EN 1991-1-4 Table 7.9 trend) [APPROX]", { ke: num(inp.end_k) });
    var pw = c.calc("Net wind pressure on the screen (intermediate bays)", "pw", "Cf*pd", "kN/m²", "", { Cf: Cf, pd: pd });
    var pwe = c.calc("Net wind pressure in the end zones", "pwe", "ke*pw", "kN/m²", "", { ke: Ce, pw: pw });
    // girts
    c.section("Girts (horizontal rails carrying the cladding)");
    var gmax = eps > 0 ? 1.2 : 1.5, g = mode === "check" ? num(inp.girt_s_chk) : gmax;
    var ng = Math.ceil(H / g - 1e-9) + 1; g = H / (ng - 1);
    c.let("Girt spacing", "g", R(g, 3), "m", eps > 0 ? "net: ≤ 1.2 m with tension wires" : "0.5 mm profiled sheet: span ≤ 1.5 m (manufacturer tables – verify)", ng + " rows incl. top & bottom");
    var wg = pwe * g, Mg = c.calc("Girt moment (simply supported between posts, end zone)", "Mg", "1.5*w*s**2/8", "kN·m", "", { w: R(wg, 4), s: s });
    var GN = mode === "check" ? [String(inp.girt_chk)] : SEC().by_weight(SEC().ISMC).concat(["ISA 65x65x6"]).filter(function (n) { return n.indexOf("ISMC") === 0; }), gpick = null;
    for (var i = 0; i < GN.length; i++) {
      var gs = SEC().section(GN[i]), sc = new C.Calc("s"), bb = ST().bending(sc, Mg, gs, 250, s, false, "", "z");
      var dg = 5 * wg * Math.pow(s * 1000, 4) / (384 * 2e5 * gs.Iz);
      if (bb.ok && dg <= s * 1000 / 150) { gpick = gs; break; }
    }
    if (!gpick) gpick = SEC().section(GN[GN.length - 1]);
    c.let("Girt section", "", gpick.name + " (" + G(gpick.w) + " kg/m), toes facing down, sag rod at mid-span for spans > 4.5 m", "", "");
    ST().bending(c, Mg, gpick, 250, s, false, "(girt)", "z");
    var dgf = c.calc("Girt deflection (service)", "δg", "5*w*s**4/(384*E*I)", "mm", "", { w: R(wg, 4), s: s * 1000, E: 2e5, I: R(gpick.Iz, 0) });
    c.check("Girt deflection ≤ span/150", dgf, s * 1000 / 150, { unit: "mm", clause: "IS 800 Table 6 (cladding rails)" });
    // posts
    inp = Object.assign({}, inp, { _girt_s: g });
    var wI = pw * s, wE = pwe * s;
    var MsI = wI * H * H / 2, MsE = wE * H * H / 2;
    var postI = wbPost(c, inp, mode, 1.5 * MsI, 1.5 * wI * H, MsI, wI, H, "(intermediate)");
    var postE = wbPost(c, inp, mode, 1.5 * MsE, 1.5 * wE * H, MsE, wE, H, "(end zone)");
    if (H > 12) c.warn("Tall barrier", "H > 12 m: consider raking back-stays / lattice columns and a dynamic (gust factor) check – IS 875-3 cl 10", "IS 875-3");
    // dead load for the footings
    var cladW = eps > 0 ? 0.03 : 0.06, PdI = (postI.sec.w * H * 9.81 + ng * gpick.w * s * 9.81) / 1000 + cladW * s * H;
    var PdE = (postE.sec.w * H * 9.81 + ng * gpick.w * s * 9.81) / 1000 + cladW * s * H;
    function fit(Ms_, V_, Pd_, post_, tag) {
      if (mode === "check") return wbFooting(c, inp, mode, Ms_, V_, Pd_, post_, tag, cover);
      var tf = 0.4;
      for (var k = 0; k < 12; k++) { var sc = new C.Calc("s"); wbFooting(sc, Object.assign({}, inp, { _tf: tf }), mode, Ms_, V_, Pd_, post_, tag, cover); if (!sc.failures.some(function (x) { return /footing, bottom|Mu,lim|shear/i.test(x.label); })) break; tf = R(tf + 0.1, 2); }
      return wbFooting(c, Object.assign({}, inp, { _tf: tf }), mode, Ms_, V_, Pd_, post_, tag, cover);
    }
    var fI = fit(MsI, wI * H, PdI, postI, "(intermediate)");
    var fE = fit(MsE, wE * H, PdE, postE, "(end zone)");
    // counts
    var nPosts = Math.round(Lt / s) + 1, endBays = Math.min(nPosts, 2 * Math.ceil(2 * H / s) + 2), nE = Math.min(nPosts, endBays), nI = Math.max(nPosts - nE, 0);
    c.section("Layout");
    c.let("Posts", "", nPosts + " nos (" + nE + " in the end zones within 2H of each end, " + nI + " intermediate)", "", "");
    c.thumb("Post depth (intermediate)", H * 1000 / 20, postI.sec.h, "mm", "≈ H/20 for wind posts", "Practice");
    c.miss("Openings for conveyors / roads break the barrier: treat each opening side as a free end (end-zone posts)", "IS 875-3", "Important");
    c.miss("Wind-net: UV-stabilised HDPE, tensioned with GI wires 3.15 mm at 300 mm; replace every 5–7 years", "Manufacturer", "Advisory");
    if (isMine()) c.miss("Coal yard: anti-corrosive paint (zinc-rich primer + epoxy / PU), earthing of steel, fire-water access gaps", "DGMS / practice", "Important");
    // BBS (footings + pedestals)
    var bbs = [], B_ = BB(), fck = num(inp.fck), fy = num(inp.fy);
    [[fI, nI, "F1"], [fE, nE, "F2"]].forEach(function (z) {
      var f = z[0], n = z[1]; if (!n) return;
      var run = f.Bf * 1000 - 2 * Math.max(cover, 50), leg = Math.max(B_.leg(f.bars.dia, 150), 150);
      bbs.push(B_.row("Footing " + z[2], z[2] + "a", f.bars.dia, "U (legs up)", 2 * B_.count(f.Bf * 1000, f.bars.spacing, 75) * n, B_.ubar(f.bars.dia, run, leg), "bottom mesh both ways @ " + G(f.bars.spacing)));
      var hP = (f.Df - f.tf + f.ped) * 1000 + f.tf * 1000 - 100;
      bbs.push(B_.row("Pedestal " + z[2], z[2] + "b", 12, "L (foot into footing)", 8 * n, B_.lbar(12, hP, 300), "8-12Ø vertical"));
      bbs.push(B_.row("Pedestal " + z[2], z[2] + "c", 8, "tie", B_.count(hP, 150, 50) * n, B_.stirrup(8, f.a, f.a, 40), "8Ø ties @ 150"));
    });
    // quantities
    var qty = [], kgPosts = (nI * postI.sec.w + nE * postE.sec.w) * (H + 0.1), kgGirts = (nPosts - 1) * ng * s * gpick.w;
    var kgPlates = nI * (postI.sec.h + 150) * (postI.sec.b + 150) * fI.tp * 7.85e-6 + nE * (postE.sec.h + 150) * (postE.sec.b + 150) * fE.tp * 7.85e-6;
    var kgCleat = nPosts * ng * 2 * 0.15 * 4.5;
    qty.push(Q("Structural steel work in single sections (posts & girts) fixed with cleats / bolts incl. priming coat", "kg",
      [row("Posts – intermediate " + postI.sec.name, nI, H + 0.1, postI.sec.w), row("Posts – end zone " + postE.sec.name, nE, H + 0.1, postE.sec.w), row("Girts " + gpick.name, (nPosts - 1) * ng, s, gpick.w)], [CPWD(), "10.1"]));
    qty.push(Q("Structural steel work in built-up / plates (base plates, cleats, gussets) incl. priming", "kg", [row("Base plates", 1, kgPlates), row("Cleats ISA 50 (2 per girt per post)", 1, kgCleat)], [CPWD(), "10.2"]));
    qty.push(Q("MS holding-down bolts with nuts & washers", "kg", [row(2 * fI.nb + " bolts per intermediate post (kg = π/4·d²·L·7.85e-6)", nI * 2 * fI.nb, area(fI.db) * (fI.La + 150) * 7.85e-6), row(2 * fE.nb + " bolts per end-zone post", nE * 2 * fE.nb, area(fE.db) * (fE.La + 150) * 7.85e-6)], [CPWD(), "10.19"]));
    qty.push(Q("Painting steel work with synthetic enamel paint over primer (≈ 0.025 m² per kg)", "sqm", [row("Posts, girts, plates", 1, (kgPosts + kgGirts + kgPlates + kgCleat) * 0.025)], [CPWD(), "13.61.1"]));
    if (eps > 0) qty.push(Q("Providing & fixing UV-stabilised HDPE wind / dust net (" + Math.round(eps * 100) + " % open) with GI tension wires & clips", "sqm", [row("Screen area", 1, Lt, H)], null, 350, "Non-SOR – market rate"));
    else qty.push(Q("Providing & fixing pre-coated galvanised profile sheet 0.50 mm on girts with self-drilling screws", "sqm", [row("Screen area (+ 5 % laps)", 1, Lt * 1.05, H)], [CPWD(), "12.50"]));
    var fRows = function (f, n, nm) { return n ? [row(nm + " footings", n, f.Bf, f.Bf, f.tf), row(nm + " pedestals", n, f.a / 1000, f.a / 1000, f.Df - f.tf + f.ped)] : []; };
    var exRows = []; [[fI, nI, "Intermediate"], [fE, nE, "End-zone"]].forEach(function (z) { if (z[1]) exRows.push(row(z[2] + " footing pits", z[1], z[0].Bf + 0.6, z[0].Bf + 0.6, z[0].Df + 0.1)); });
    qty.push(Q("Earth work in excavation for footings, all kinds of soil", "cum", exRows, [CPWD(), "2.8.1"]));
    qty.push(Q("PCC 1:4:8 below footings", "cum", [fI, fE].map(function (f, k) { var n = k ? nE : nI; return row((k ? "End-zone" : "Intermediate") + " footings", n, f.Bf + 0.2, f.Bf + 0.2, 0.1); }).filter(function (r) { return r.nos; }), [CPWD(), "4.1.8"]));
    qty.push(Q("RCC M" + G(fck) + " in footings & pedestals (excl. steel & shuttering)", "cum", fRows(fI, nI, "Intermediate").concat(fRows(fE, nE, "End-zone")), null, CM().rcc_rate(fck)));
    qty.push(Q("Centering & shuttering – footing edges & pedestals", "sqm", [fI, fE].map(function (f, k) { var n = k ? nE : nI; return row((k ? "End-zone" : "Intermediate"), n, 4 * f.Bf * f.tf + 4 * f.a / 1000 * (f.Df - f.tf + f.ped)); }).filter(function (r) { return r.nos; }), [CPWD(), "5.9.1"]));
    qty.push(X().steelQty(bbs, "Wind barrier footings"));
    qty.push(Q("Non-shrink grout below base plates (40 mm)", "cum", [row("Below plates", nPosts, (postE.sec.h + 250) / 1000, (postE.sec.b + 250) / 1000, 0.04)], null, CM().RATE.grout, "Non-SOR"));
    qty.push(Q("Filling available excavated earth around footings", "cum", [row("Back-fill (≈ 70 % of excavation)", 1, 0.7 * ([fI, fE].reduce(function (a, f, k) { var n = k ? nE : nI; return a + n * Math.pow(f.Bf + 0.6, 2) * (f.Df + 0.1); }, 0)))], [CPWD(), "2.25"]));
    var sheet = wbDrawing(inp, H, s, g, ng, postI, postE, gpick, fI, eps, Math.min(nPosts, 5));
    var summary = { "Barrier": F(H, ".1f") + " m high × " + F(Lt, ".0f") + " m, posts @ " + F(s, ".2f") + " m (" + nPosts + " nos)",
      "Wind": "pd = " + F(pd, ".3f") + " kN/m², Cf = " + F(Cf, ".2f") + " → " + F(pw, ".3f") + " kN/m² (end zones " + F(pwe, ".3f") + ")",
      "Posts": postI.sec.name + " (intermediate), " + postE.sec.name + " (end zones)",
      "Girts": ng + " rows " + gpick.name + " @ " + F(g, ".2f") + " m", "Cladding": String(inp.cladding),
      "Footings": F(fI.Bf, ".2f") + " m sq × " + G(fI.tf * 1000) + " (intermediate), " + F(fE.Bf, ".2f") + " m sq (end), 4-M" + G(fE.db) + " bolts",
      "Max utilisation": F(c.max_utilisation, ".2f") };
    var refs = ["IS 875 (Part 3):2015 – Wind loads", "IS 800:2007 – General construction in steel", "IS 1904:1986 – Foundations", "IS 456:2000",
      "EN 1991-1-4 cl 7.4 / 7.11 (free-standing walls, porous screens) – for the force coefficient trend"];
    return C.DesignResult({ module: "wind_barrier", title: "Wind / dust barrier", inputs: inp, calc: c, summary: summary, drawings: [sheet], quantities: qty, bbs: bbs, tables: {}, references: refs });
  }
  M.run_wind_barrier = run_wind_barrier;

  function wbDrawing(inp, H, s, g, ng, postI, postE, gp, fI, eps, nShow) {
    var D_ = DR(), Hm = H * 1000, sm = s * 1000;
    var e = new D_.View("Elevation (end bays)");
    for (var i = 0; i < nShow; i++) { var x = i * sm, sec = i < 2 ? postE.sec : postI.sec; e.rect(x - sec.b / 2, 0, sec.b, Hm, "STEEL", "steel"); }
    for (var k = 0; k < ng; k++) e.line(0, k * g * 1000, (nShow - 1) * sm, k * g * 1000, "STEEL");
    if (eps > 0) for (var xx = 300; xx < (nShow - 1) * sm; xx += 600) e.line(xx, 0, xx, Hm, "THIN");
    else for (var x2 = 150; x2 < (nShow - 1) * sm; x2 += 300) e.line(x2, 0, x2, Hm, "HIDDEN");
    e.line(-1000, 0, (nShow - 1) * sm + 1000, 0, "SOIL"); e.text((nShow - 1) * sm + 1000, 80, "GL", 2.0, { anchor: "end" });
    e.dim(0, Hm, sm, Hm, -8); e.dim((nShow - 1) * sm, 0, (nShow - 1) * sm, Hm, -10, "H " + F(Hm, ",.0f"));
    e.text(sm / 2, Hm + 600, String(inp.cladding), 2.0, { anchor: "middle" });
    e.text(0, -500, "End-zone posts " + postE.sec.name, 1.8); e.text(2 * sm, -500, "Intermediate posts " + postI.sec.name + ", girts " + gp.name + " @ " + F(g * 1000, ",.0f"), 1.8);
    var x = new D_.View("Section through post & footing"), B = fI.Bf * 1000, tf = fI.tf * 1000, Df = fI.Df * 1000, a = fI.a, ped = fI.ped * 1000;
    x.rect(-B / 2, -Df, B, tf, "OUTLINE", "concrete"); x.rect(-B / 2 - 100, -Df - 100, B + 200, 100, "CONCRETE");
    x.rect(-a / 2, -Df + tf, a, Df - tf + ped, "OUTLINE", "concrete");
    x.rect(-postI.sec.h / 2, ped + fI.tp, postI.sec.h, Math.min(Hm, 3000), "STEEL", "steel"); x.rect(-postI.sec.h / 2 - 75, ped, postI.sec.h + 150, fI.tp, "STEEL", "steel");
    x.line(-postI.sec.h / 2 - 40, ped - fI.La, -postI.sec.h / 2 - 40, ped + 60, "REBAR"); x.line(postI.sec.h / 2 + 40, ped - fI.La, postI.sec.h / 2 + 40, ped + 60, "REBAR");
    x.line(-B / 2 - 800, 0, B / 2 + 800, 0, "SOIL"); x.text(B / 2 + 800, 60, "GL", 2.0, { anchor: "end" });
    for (var w = 0; w < 4; w++) x.line(-B / 2 - 900, ped + 600 + w * 500, -B / 2 - 300, ped + 600 + w * 500, "LOAD");
    x.text(-B / 2 - 900, ped + 2700, "WIND", 2.0);
    x.dim(-B / 2, -Df - 100, B / 2, -Df - 100, 8); x.dim(B / 2, -Df, B / 2, 0, -8, "Df " + F(Df, ",.0f"));
    x.text(0, -Df - 500, "Footing " + F(B, ",.0f") + " sq × " + G(tf) + ", " + G(fI.bars.dia) + "Ø @ " + G(fI.bars.spacing) + " both ways; pedestal " + G(a) + " sq, 8-12Ø + 8Ø @ 150", 1.8, { anchor: "middle" });
    x.text(postI.sec.h / 2 + 150, ped + 200, "Base plate " + G(fI.tp) + " thk, " + 2 * fI.nb + "-M" + G(fI.db) + " HD bolts, 40 grout", 1.8);
    var notes = ["Wind to IS 875-3:2015, Vb = " + G(num(inp.vb)) + " m/s, terrain " + G(num(inp.terrain)) + "; posts designed as cantilevers (IS 800); end-zone posts within 2H of each free end / opening.",
      "Steel Fe 250 (IS 2062); girts with toes down; sag rods for spans > 4.5 m; all steel primed + 2 coats enamel (epoxy / PU in coal yards).",
      eps > 0 ? "HDPE / perforated screen fixed to girts with GI wire 3.15 mm @ 300 and clips; tension uniformly." : "Profiled sheet 0.50 mm TCT, side laps 1.5 corrugations, self-drilling screws with EPDM washers @ every second crest.",
      "Footings RCC M" + G(num(inp.fck)) + " on PCC 1:4:8; HD bolts set with templates; non-shrink grout 40 mm."];
    return new D_.Sheet("Wind / dust barrier", "WB-01", [e, x], notes);
  }

  var WB_PARAMS = [
    P("height", "Barrier height above GL", 8.0, "m", { min: 2, max: 20, step: 0.5, group: "Barrier" }),
    P("length", "Barrier length", 120.0, "m", { min: 6, max: 3000, step: 1, group: "Barrier" }),
    P("post_s", "Post spacing", 4.0, "m", { min: 2, max: 8, step: 0.25, group: "Barrier" }),
    P("cladding", "Cladding", WB_CLAD[1], { kind: "select", options: WB_CLAD.slice(), group: "Barrier" }),
    P("vb", "Basic wind speed Vb", 39.0, "m/s", { kind: "select", options: [33.0, 39.0, 44.0, 47.0, 50.0, 55.0], group: "Wind", help: "IS 875-3 Annex A – Korba / Bilaspur / Raigarh: 39 m/s (verify)" }),
    P("terrain", "Terrain category", 2, { kind: "select", options: [1, 2, 3, 4], group: "Wind", help: "open mine / stock yard: 1–2" }),
    P("k1", "Risk coefficient k1", 1.0, { min: 0.7, max: 1.1, step: 0.01, group: "Wind" }),
    P("k3", "Topography factor k3", 1.0, { min: 1.0, max: 1.36, step: 0.01, group: "Wind" }),
    P("end_k", "End-zone multiplier on Cf", 1.5, { min: 1.0, max: 2.0, step: 0.05, group: "Wind" }),
    P("post_fam", "Post section family", WB_POST[0], { kind: "select", options: WB_POST.slice(), group: "Steel" }),
    P("fy_st", "Steel fy (IS 2062)", 250.0, "N/mm²", { kind: "select", options: [250.0, 350.0], group: "Steel" }),
    P("fly", "Inner-flange restraint of posts", "Fly braces at every 2nd girt (LLT = 2 × girt spacing)", { kind: "select", options: ["Fly braces at every 2nd girt (LLT = 2 × girt spacing)", "None – inner flange free (LLT = factor × H)"], group: "Steel" }),
    P("llt_f", "LTB length of post / H (no fly braces)", 1.0, { min: 0.7, max: 2.0, step: 0.1, group: "Steel", when: function (v) { return /^None/.test(String(v.fly)); } }),
    P("defl_lim", "Post deflection limit H /", 150, { kind: "select", options: [100, 150, 200], group: "Steel" }),
    P("found_depth", "Footing founding depth below GL", 1.5, "m", { min: 1.0, max: 3.0, step: 0.1, group: "Foundation" }),
    P("ped_above", "Pedestal top above GL", 0.3, "m", { min: 0.15, max: 1.0, step: 0.05, group: "Foundation" }),
    P("sbc", "Safe bearing capacity", 150.0, "kN/m²", { min: 50, max: 400, group: "Foundation" }),
    P("gamma", "Soil unit weight", 18.0, "kN/m³", { min: 15, max: 22, group: "Foundation" })
  ].concat(matParams(50.0, "Moderate", 25.0), [
    P("post_chk", "Post section (check)", "ISMB 300", { kind: "select", options: Object.keys(DS.sections.ISMB).concat(Object.keys(DS.sections.ISHB)), group: "My design", modes: CHECK }),
    P("girt_chk", "Girt section (check)", "ISMC 100", { kind: "select", options: Object.keys(DS.sections.ISMC), group: "My design", modes: CHECK }),
    P("girt_s_chk", "Girt spacing (check)", 1.2, "m", { min: 0.6, max: 2.0, step: 0.05, group: "My design", modes: CHECK }),
    P("bolt_chk", "Anchor bolt dia (check)", 24.0, "mm", { kind: "select", options: [20.0, 24.0, 27.0, 30.0, 36.0], group: "My design", modes: CHECK }),
    P("fb_chk", "Footing size B (check)", 2.0, "m", { min: 0.8, max: 6, step: 0.05, group: "My design", modes: CHECK }),
    P("ft_chk", "Footing thickness (check)", 400.0, "mm", { min: 250, max: 1000, step: 25, group: "My design", modes: CHECK }),
    P("fdia_chk", "Footing bar dia (check)", 12.0, "mm", { kind: "select", options: [10.0, 12.0, 16.0, 20.0], group: "My design", modes: CHECK }),
    P("fs_chk", "Footing bar spacing (check)", 150.0, "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK })
  ]);
  M.WB_PARAMS = WB_PARAMS;
  C.register({ id: "wind_barrier", phase: 2, category: "Steel structures", name: "Wind / dust barrier (coal yard, CHP, siding)", icon: "🌬️",
    description: "Free-standing wind & dust screen of cantilever steel posts, girts and profiled sheet or HDPE wind-net: IS 875-3 wind on a solid / porous screen with end zones, " +
      "post & girt design (IS 800 bending, shear, deflection), base plate & anchor bolts, isolated footings (overturning, bearing); BBS, quantities & drawing.",
    params: WB_PARAMS, run: run_wind_barrier, references: ["IS 875 (Part 3):2015", "IS 800:2007", "IS 1904:1986", "IS 456:2000"] });

  /* ======================================================================= 3. INSPECTION CHAMBER / MANHOLE (brick) */
  var IC_TRAFFIC = ["Footpath / lawn (light duty)", "Colony road / car parking (medium duty)", "Main road / mine haul road (heavy duty)"];
  var IC_LINE = ["Sewer (SW / PVC / RCC pipe)", "Storm water / mine drain pipe"];
  function icSize(depth) {
    if (depth <= 0.45 + 1e-9) return { shape: "rect", L: 0.61, B: 0.455, t: 0.115, name: "455 × 610 chamber", item: "19.30.1.1" };
    if (depth <= 0.9 + 1e-9) return { shape: "rect", L: 0.9, B: 0.8, t: 0.23, name: "900 × 800 inspection chamber" };
    if (depth <= 1.65 + 1e-9) return { shape: "rect", L: 1.2, B: 0.9, t: 0.23, name: "1200 × 900 manhole" };
    if (depth <= 2.5 + 1e-9) return { shape: "circ", D: 1.22, t: 0.23, name: "1.22 m dia circular manhole" };
    return { shape: "circ", D: 1.52, t: depth > 4.0 ? 0.345 : 0.23, name: "1.52 m dia circular manhole" };
  }
  M.icSize = icSize;
  function icSpacing(dia) { return dia <= 300 ? 30 : dia <= 600 ? 45 : dia <= 900 ? 75 : 90; }

  function run_inspection_chamber(inp, mode) {
    var c = new C.Calc("Inspection chamber / manhole");
    var dep = num(inp.depth), dia = num(inp.pipe_dia), run = num(inp.run_len), extra = Math.trunc(num(inp.extra_ch)), gam = num(inp.gamma), traffic = String(inp.traffic);
    c.section("Size & number (IS 4111-1 / CPHEEO / CPWD)");
    var sz = icSize(dep);
    if (mode === "check" || mode === "free") { sz = Object.assign({}, sz, num(inp.L_chk) > 0 && sz.shape === "rect" ? { L: num(inp.L_chk), B: num(inp.B_chk) } : {}, { t: num(inp.t_chk) / 1000 }); }
    c.let("Depth from cover level to invert", "h", dep, "m");
    c.let("Chamber adopted", "", sz.shape === "rect" ? F(sz.L * 1000, ".0f") + " × " + F(sz.B * 1000, ".0f") + " mm inside, walls " + G(sz.t * 1000) : F(sz.D * 1000, ".0f") + " mm dia inside at bottom, corbelled to 560 mm, walls " + G(sz.t * 1000), "",
      "IS 4111-1 / CPHEEO: ≤ 0.9 m: 900 × 800; 0.9–1.65 m: 1200 × 900; 1.65–2.5 m: 1.22 m dia; > 2.5 m: 1.52 m dia (verify)", sz.name);
    var sp = icSpacing(dia), nRun = Math.max(1, Math.ceil(run / sp - 1e-9) + 1), n = nRun + Math.max(extra, 0);
    c.calc("Maximum spacing of chambers for this pipe", "smax", "s", "m", "CPHEEO Manual on Sewerage Table 3.x (verify)", "pipe " + G(dia) + " mm", { s: sp });
    c.let("Number of chambers", "n", n, "nos", "", nRun + " on the " + F(run, ".0f") + " m run + " + extra + " at junctions / bends / changes of grade");
    c.ok("Inside width ≥ pipe dia + 2 × 150 mm benching clearance", (sz.shape === "rect" ? sz.B : sz.D) * 1000 >= dia + 300 - 1e-6, { detail: G(dia) + " mm pipe", clause: "practice", warn_only: true });
    // structure: wall under earth (empty chamber), horizontal span between corners / ring compression
    c.section("Walls (IS 1905)");
    var K0 = 1 - Math.sin(num(inp.phi) * Math.PI / 180), qv = /heavy/.test(traffic) ? 20 : /medium/.test(traffic) ? 10 : 5;
    var p = c.calc("Earth + traffic surcharge pressure at the invert (at rest)", "p", "K0*(g*h + q)", "kN/m²", "", { K0: R(K0, 4), g: gam, h: dep, q: qv });
    var ft = masonryTension(inp.mortar);
    if (sz.shape === "rect") {
      var Ls = sz.L + sz.t;
      if (mode !== "check" && mode !== "free") { var f0 = 6 * p * Ls * Ls / 24 / (sz.t * sz.t) / 1000; if (f0 > ft[1] && sz.t < 0.345) { sz.t = 0.345; c.info("Wall thickened", "230 → 345 mm for the earth / traffic pressure", "IS 1905"); } }
      var Mh = c.calc("Horizontal bending of the long wall (panel with returns at both ends and the base: yield-line coefficient 1/24)", "Mh", "p*Ls**2/24", "kN·m/m", "two-way plate action [APPROX – verify]", { p: R(p, 3), Ls: R(Ls, 3) });
      var fh = c.calc("Flexural tension parallel to bed joints", "fh", "6*Mh/t**2/1000", "N/mm²", "IS 1905 cl 5.4.2", { Mh: Mh, t: sz.t });
      c.check("Flexural tension ∥ bed joints ≤ permissible", fh, ft[1], { unit: "N/mm²", clause: "IS 1905 cl 5.4.2 (verify)", note: "use 345 walls / RCC" });
    } else {
      var sc = c.calc("Ring compression in the circular wall", "σ", "p*(D/2 + t)/t/1000", "N/mm²", "thin ring", { p: R(p, 3), D: sz.D, t: sz.t });
      c.check("Ring compression ≤ 0.6 N/mm² (brick 7.5, CM 1:4)", sc, 0.6, { unit: "N/mm²", clause: "IS 1905 Table 8 (basic compressive stress – verify)" });
    }
    var cover = /heavy/.test(traffic) ? "560 mm dia CI cover & frame, heavy duty (HD-20 / ≥ 108 kg)" : /medium/.test(traffic) ? "500 mm dia CI cover & frame, medium duty (MD-10 / ≥ 58 kg)" : "455 × 610 CI cover & frame, light duty (≥ 23 kg)";
    c.let("Cover", "", cover, "", "IS 1726 / CPWD 19.18");
    var nFR = dep > 0.8 ? Math.floor((dep - 0.3) / 0.3) : 0;
    if (nFR) c.let("Foot rests", "", nFR + " MS foot rests @ 300 mm, staggered", "", "CPWD 19.15 / IS 5455");
    c.info("Benching & channel", "Half-round channel of the pipe dia in CC 1:2:4, benching sloping 1 in 6 to the channel, neat cement finish", "IS 4111-1");
    c.miss("Drop connection where the incoming invert is > 600 mm above the outgoing invert", "CPHEEO", "Important");
    if (/^Storm|mine/i.test(String(inp.line))) c.miss("Storm / mine drain: silt pocket 300 mm below the outlet invert in every chamber", "practice", "Advisory");
    // quantities (per chamber × n)
    var qty = [], tW = sz.t, bed = 0.15, ext = sz.shape === "rect" ? [sz.L + 2 * tW, sz.B + 2 * tW] : [sz.D + 2 * tW, sz.D + 2 * tW];
    var hW = dep + 0.15;
    qty.push(Q("Earth work in excavation for chambers, all kinds of soil", "cum", [row("Chamber pits (outside + 0.3 m each side)", n, ext[0] + 0.6, ext[1] + 0.6, dep + bed + 0.15)], [CPWD(), "2.8.1"]));
    qty.push(Q("PCC 1:4:8 in foundation bed of chambers", "cum", [row("Bed", n, ext[0] + 0.2, ext[1] + 0.2, bed)], [CPWD(), "4.1.8"]));
    var bwRows = sz.shape === "rect" ? [row("Walls (centre-line perimeter × t × h)", n, 2 * (sz.L + sz.B + 2 * tW), tW, hW)] :
      [row("Circular wall π(D + t) × t × h (corbelled top ≈ 0.9 of a cylinder)", n, Math.PI * (sz.D + tW) * 0.92, tW, hW)];
    qty.push(Q(brickDesc(inp.mortar, "chamber walls"), "cum", bwRows, brickItem(inp.mortar, false)));
    var inArea = sz.shape === "rect" ? 2 * (sz.L + sz.B) * dep : Math.PI * sz.D * dep * 0.92;
    qty.push(Q("12 mm cement plaster 1:3 with water-proofing compound inside chambers + neat cement finish", "sqm", [row("Inside walls", n, inArea)], [CPWD(), "13.4.1"]));
    qty.push(Q("Cement concrete 1:2:4 in benching & channels", "cum", [row("Benching (≈ ⅓ of floor area × 0.2)", n, sz.shape === "rect" ? sz.L * sz.B / 3 : Math.PI * sz.D * sz.D / 12, null, 0.2)], [CPWD(), "4.1.3"]));
    if (sz.shape === "rect") qty.push(Q("RCC M25 cover slab of chamber with opening (excl. steel & shuttering)", "cum", [row("Cover slab", n, sz.L + 2 * tW, sz.B + 2 * tW, 0.15), row("Deduct opening", n, 0.6, 0.5, 0.15, true)], null, CM().rcc_rate(25)));
    qty.push(Q(/heavy/.test(traffic) ? "C.I. cover without frame 560 mm dia heavy duty" : /medium/.test(traffic) ? "C.I. cover without frame 500 mm dia medium duty" : "C.I. cover without frame 455 × 610 light duty", "each", [row("Chambers", n)],
      [CPWD(), /heavy/.test(traffic) ? "19.18.3" : /medium/.test(traffic) ? "19.18.2" : "19.18.1"]));
    if (nFR) qty.push(Q("M.S. foot rests in concrete blocks 1:3:6", "each", [row("Per chamber", n, nFR)], [CPWD(), "19.15.1"]));
    if (sz.shape === "rect") qty.push(Q("Reinforcement for chamber cover slabs (≈ 70 kg / cum)", "kg", [row("Cover slabs", n, (sz.L + 2 * tW) * (sz.B + 2 * tW) * 0.15 * 70)], [CPWD(), "5.22.6"]));
    qty.push(Q("Filling available excavated earth around chambers", "cum", [row("Around walls", n, Math.max((ext[0] + 0.6) * (ext[1] + 0.6) - ext[0] * ext[1], 0), null, dep)], [CPWD(), "2.25"]));
    var sheet = icDrawing(inp, sz, dep, dia, nFR);
    var summary = { "Chamber": sz.shape === "rect" ? F(sz.L * 1000, ".0f") + " × " + F(sz.B * 1000, ".0f") + " mm" : F(sz.D * 1000, ".0f") + " mm dia (corbelled)", "Depth": F(dep, ".2f") + " m",
      "Walls": G(sz.t * 1000) + " mm brick in " + String(inp.mortar).split(" (")[0], "Number": n + " nos (spacing ≤ " + sp + " m)", "Cover": cover, "Max utilisation": F(c.max_utilisation, ".2f") };
    return C.DesignResult({ module: "inspection_chamber", title: "Inspection chamber / manhole", inputs: inp, calc: c, summary: summary, drawings: [sheet], quantities: qty, bbs: [], tables: {},
      references: ["IS 4111 (Part 1):1986 – Manholes", "CPHEEO Manual on Sewerage (2013)", "IS 1726:1991 – CI manhole covers", "IS 1905:1987", "CPWD DSR 2021 ch. 19"] });
  }
  M.run_inspection_chamber = run_inspection_chamber;
  function icDrawing(inp, sz, dep, dia, nFR) {
    var D_ = DR(), t = sz.t * 1000, W = (sz.shape === "rect" ? sz.L : sz.D) * 1000, Bw = (sz.shape === "rect" ? sz.B : sz.D) * 1000, h = dep * 1000;
    var p = new D_.View("Plan");
    if (sz.shape === "rect") { p.rect(0, 0, W + 2 * t, Bw + 2 * t, "OUTLINE", "brick"); p.rect(t, t, W, Bw, "OUTLINE"); }
    else { p.circle(0, 0, W / 2 + t, "OUTLINE", "brick"); p.circle(0, 0, W / 2, "OUTLINE"); p.circle(0, 0, 280, "HIDDEN"); }
    var cx = sz.shape === "rect" ? t + W / 2 : 0, cy = sz.shape === "rect" ? t + Bw / 2 : 0;
    p.line(cx - W / 2 - t - 800, cy, cx + W / 2 + t + 800, cy, "STEEL"); p.text(cx + W / 2 + t + 200, cy + 80, G(dia) + "Ø pipe", 1.8);
    if (sz.shape === "rect") { p.dim(0, 0, W + 2 * t, 0, 8); p.dim(t, Bw + 2 * t, t + W, Bw + 2 * t, -6, "INSIDE " + F(W, ",.0f")); }
    else p.dim(-W / 2, -W / 2 - t - 200, W / 2, -W / 2 - t - 200, 6, "Ø " + F(W, ",.0f"));
    var s = new D_.View("Section");
    s.rect(-W / 2 - t - 100, -h - 150, W + 2 * t + 200, 150, "OUTLINE", "concrete");
    s.rect(-W / 2 - t, -h, t, h, "OUTLINE", "brick"); s.rect(W / 2, -h, t, h, "OUTLINE", "brick");
    s.poly([[-W / 2, -h + dia / 2 + 150], [-dia / 2, -h + dia / 2], [dia / 2, -h + dia / 2], [W / 2, -h + dia / 2 + 150], [W / 2, -h], [-W / 2, -h]], true, "OUTLINE", "concrete");
    s.circle(0, -h + dia / 2, dia / 2, "STEEL");
    s.rect(-W / 2 - t, 0, W + 2 * t, 150, "OUTLINE", "concrete"); s.rect(-300, 0, 600, 150, "STEEL", "steel");
    for (var k = 0; k < nFR; k++) s.line(-W / 2, -450 - k * 300, -W / 2 + 120, -450 - k * 300, "STEEL");
    s.line(-W - 1200, 0, W + 1200, 0, "SOIL"); s.text(W + 1200, 60, "GL / cover level", 1.8, { anchor: "end" });
    s.dim(W / 2 + t + 400, -h, W / 2 + t + 400, 0, -8, "DEPTH " + F(h, ",.0f")); s.dim(-W / 2, -h - 150, W / 2, -h - 150, 8);
    s.text(0, -h - 500, "PCC 1:4:8 bed 150; benching 1 in 6 in CC 1:2:4 with half-round channel", 1.8, { anchor: "middle" });
    var notes = ["Brick masonry FPS class 7.5 in " + String(inp.mortar) + "; inside 12 mm CM 1:3 plaster with water-proofing compound, neat cement finish.",
      "Benching & channel in CC 1:2:4; foot rests @ 300 staggered for depths > 0.8 m.", "Cover & frame as per traffic (IS 1726): " + String(inp.traffic) + ".",
      "Composite CPWD items 19.9 / 19.11 / 19.13 (circular manholes) may be used instead of the detailed items."];
    return new D_.Sheet("Inspection chamber / manhole", "IC-01", [p, s], notes);
  }
  var IC_PARAMS = [
    P("depth", "Depth: cover level to invert", 1.2, "m", { min: 0.3, max: 6.0, step: 0.05, group: "Chamber" }),
    P("pipe_dia", "Pipe dia", 150.0, "mm", { kind: "select", options: [100.0, 150.0, 200.0, 250.0, 300.0, 450.0, 600.0, 900.0], group: "Chamber" }),
    P("line", "Line", IC_LINE[0], { kind: "select", options: IC_LINE.slice(), group: "Chamber" }),
    P("traffic", "Location / traffic", IC_TRAFFIC[0], { kind: "select", options: IC_TRAFFIC.slice(), group: "Chamber" }),
    P("run_len", "Length of the pipe run", 60.0, "m", { min: 0, max: 5000, step: 1, group: "Number" }),
    P("extra_ch", "Extra chambers at junctions / bends", 0, { kind: "int", min: 0, max: 200, group: "Number" }),
    P("mortar", "Masonry mortar", MORTAR[0], { kind: "select", options: MORTAR.slice(), group: "Material & soil" }),
    P("gamma", "Soil unit weight", 18.0, "kN/m³", { min: 15, max: 22, group: "Material & soil" }),
    P("phi", "Soil angle of friction", 30.0, "°", { min: 20, max: 40, group: "Material & soil" }),
    P("L_chk", "Inside length (rectangular, check)", 1.2, "m", { min: 0.45, max: 3, step: 0.05, group: "My design", modes: CHECK }),
    P("B_chk", "Inside width (rectangular, check)", 0.9, "m", { min: 0.45, max: 3, step: 0.05, group: "My design", modes: CHECK }),
    P("t_chk", "Wall thickness (check)", 230.0, "mm", { kind: "select", options: [115.0, 230.0, 345.0], group: "My design", modes: CHECK })
  ];
  C.register({ id: "inspection_chamber", phase: 3, category: CAT, name: "Inspection chamber / manhole (brick)", icon: "🕳️",
    description: "Brick masonry inspection chamber or manhole on a sewer / storm-water line: size by depth (IS 4111 / CPHEEO), wall check, benching & channel, CI cover by traffic, foot rests, number of chambers on the run; CPWD quantities & drawing.",
    params: IC_PARAMS, run: run_inspection_chamber, references: ["IS 4111 (Part 1)", "CPHEEO Manual on Sewerage", "IS 1726", "IS 1905"] });

  /* ======================================================================= 4. RAIN-WATER HARVESTING RECHARGE PIT / TRENCH */
  var RW_CATCH = ["Roof (RCC / sheet) C = 0.85", "Paved area C = 0.70", "Mixed campus C = 0.50", "Unpaved / lawn C = 0.25"];
  var RW_TYPE = ["Recharge pit (square, filter media)", "Recharge trench (filter media)", "Recharge pit with recharge bore (deep aquifer)"];
  function rwC(inp) { var m = String(inp.catch_type).match(/C = ([0-9.]+)/); return m ? +m[1] : 0.7; }
  function run_recharge_pit(inp, mode) {
    var c = new C.Calc("Rain-water harvesting recharge structure");
    var A = num(inp.area), Cr = rwC(inp), i = num(inp.intensity), tmin = num(inp.storm_min), k = num(inp.perm), annual = num(inp.annual), kind = String(inp.rtype);
    c.section("Runoff (CGWB Manual on Artificial Recharge 2007 / CPWD RWH guidelines)");
    c.let("Catchment area × runoff coefficient", "A × C", F(A, ".0f") + " × " + G(Cr), "m²", "", String(inp.catch_type));
    var Qp = c.calc("Peak runoff Q = C·i·A", "Q", "C*i/1000*A/3600*1000", "l/s", "rational method", { C: Cr, i: i, A: A });
    var Vr = c.calc("Runoff volume in the design storm", "Vr", "C*A*i/1000*t/60", "m³", "CGWB: pit sized for a 15–20 min peak storm (verify)", { C: Cr, A: A, i: i, t: tmin });
    var Ann = c.calc("Annual recharge potential (80 % of runoff)", "Va", "0.8*C*A*R/1000", "m³/yr", "CGWB", "annual rainfall " + G(annual) + " mm", { C: Cr, A: A, R: annual });
    c.section("Recharge structure");
    var n = 1, L, B, D, bore = /bore/.test(kind), trench = /trench/.test(kind);
    var por = 0.35, fb = 0.3;
    D = mode === "check" || mode === "free" ? num(inp.D_chk) : (trench ? 1.5 : 2.5);
    var Wt = trench ? 1.0 : 0;
    var infil = function (Lx, Bx, Dx) { return k / 1000 / 3600 * (tmin * 60) * (Lx * Bx + 2 * (Lx + Bx) * Dx * 0.5); };   // bottom + half the side area
    if (mode === "check" || mode === "free") { L = num(inp.L_chk); B = trench ? num(inp.B_chk) : num(inp.L_chk); n = Math.max(1, Math.trunc(num(inp.n_chk))); }
    else {
      var maxPit = trench ? 30 : 2.0, best = null;
      for (n = 1; n <= 200 && !best; n++) {
        for (var s = trench ? 2 : 1.0; s <= maxPit + 1e-9; s = R(s + (trench ? 0.5 : 0.25), 2)) {
          L = s; B = trench ? Wt : s;
          var cap = n * (L * B * (D - fb) * por + L * B * fb + infil(L, B, D));
          if (cap >= Vr) { best = { n: n, L: L, B: B }; break; }
        }
      }
      if (!best) best = { n: 20, L: maxPit, B: trench ? Wt : maxPit };
      n = best.n; L = best.L; B = best.B;
    }
    c.let("Adopted", "n × L × B × D", n + " × " + F(L, ".2f") + " × " + F(B, ".2f") + " × " + F(D, ".2f"), "m", trench ? "trench 0.5–1.0 m wide, 1.0–1.5 m deep (CGWB)" : "pit 1–2 m wide, 2–3 m deep (CGWB)");
    var Vs = c.calc("Storage in the filter media (porosity 0.35) + free board", "Vs", "n*(L*B*(D - fb)*por + L*B*fb)", "m³", "", { n: n, L: L, B: B, D: D, fb: fb, por: por });
    var Vi = c.calc("Infiltration during the storm (bottom + ½ sides)", "Vi", "n*k/1000/3600*t*60*(L*B + (L + B)*D)", "m³", "", "soil permeability k = " + G(k) + " mm/h (site test)", { n: n, k: k, t: tmin, L: L, B: B, D: D });
    c.check("Storage + infiltration ≥ storm runoff", Vr, Vs + Vi, { unit: "m³", clause: "CGWB", note: "add pits / trench length" });
    c.ok("Permeability ≥ 10 mm/h for surface recharge", k >= 10 - 1e-9, { detail: G(k) + " mm/h", clause: "CGWB – else recharge bore / shaft into the aquifer", warn_only: !bore });
    var gw = num(inp.gwt);
    c.ok("Pit bottom ≥ 2 m above the water table (vadose zone for filtering)", gw - D >= 2 - 1e-9, { detail: "GWT " + F(gw, ".1f") + " m", clause: "CGWB practice", warn_only: true });
    var boreD = bore ? num(inp.bore_depth) : 0;
    if (bore) c.let("Recharge bore", "", "150 mm dia × " + F(boreD, ".0f") + " m with slotted PVC casing in the aquifer zone, bottom of the pit", "", "CGWB recharge well");
    c.let("Filter media (bottom → top)", "", "boulders 5–20 cm: ½ D; gravel 5–10 mm: ¼ D; coarse sand 1.5–2 mm: ¼ D (less free board)", "", "CPWD 23.5–23.7 / CGWB");
    c.let("Silt chamber", "", "0.6 × 0.6 × 0.6 m brick chamber with mesh before the pit; first-flush diverter on roof down-takes", "", "CGWB");
    c.miss("Roof water only (no sewage / workshop runoff); oil-trap first for paved yards with vehicles", "CGWB / CPCB", "Important");
    c.miss("Keep ≥ 15 m from septic tanks / soak pits; ≥ 3 m from building foundations", "CGWB", "Important");
    // quantities
    var qty = [], dl = (D - fb);
    qty.push(Q("Earth work in excavation for recharge " + (trench ? "trenches" : "pits"), "cum", [row(trench ? "Trenches" : "Pits", n, L + 0.46, B + 0.46, D), row("Silt chambers", n, 1.06, 1.06, 0.75)], [CPWD(), "2.8.1"]));
    qty.push(Q("Brick work honeycomb lining in CM 1:6 (open vertical joints) to recharge " + (trench ? "trenches" : "pits"), "cum", [row("Lining (perimeter × 0.23 × D)", n, 2 * (L + B + 0.46), 0.23, D)], brickItem("1:6", false)));
    qty.push(Q(brickDesc(MORTAR[0], "silt chamber"), "cum", [row("Silt chamber walls", n, 4 * 0.83, 0.23, 0.6)], brickItem(MORTAR[0], false)));
    qty.push(Q("Stone boulders 5–20 cm filling in recharge pit", "cum", [row("Bottom ½", n, L, B, dl / 2)], [CPWD(), "23.5"]));
    qty.push(Q("Gravel 5–10 mm filling over boulders in recharge pit", "cum", [row("Middle ¼", n, L, B, dl / 4)], [CPWD(), "23.6"]));
    qty.push(Q("Coarse sand 1.5–2 mm filling over gravel in recharge pit", "cum", [row("Top ¼", n, L, B, dl / 4)], [CPWD(), "23.7"]));
    qty.push(Q("Precast RCC perforated covers 1000 × 450 × 50 over pit", "each", [row("Covers (2.2 per m²)", n, L * B * 2.2)], [CPWD(), "23.9"]));
    qty.push(Q("PVC pipe 110 mm from down-takes to silt chamber & pit incl. fittings", "metre", [row("Connection", n, 10)], null, 650, "Non-SOR"));
    if (bore) {
      qty.push(Q("Boring recharge well 150 mm dia in soil / soft rock", "metre", [row("Bores", n, boreD)], [CPWD(), "23.1.1.1"]));
      qty.push(Q("uPVC medium well casing pipe (plain) in recharge bore", "metre", [row("Plain casing", n, Math.max(boreD - 6, 0))], [CPWD(), "23.3.1"]));
      qty.push(Q("uPVC medium well screen (slotted) in recharge bore", "metre", [row("Slotted screen", n, Math.min(6, boreD))], [CPWD(), "23.4.1"]));
      qty.push(Q("Gravel packing round the recharge bore", "cum", [row("Annulus", n, boreD, 0.03)], [CPWD(), "23.8"]));
    }
    var sheet = rwDrawing(inp, L, B, D, fb, trench, bore, boreD, n);
    var summary = { "Runoff": F(Vr, ".1f") + " m³ in " + G(tmin) + " min (Q " + F(Qp, ".1f") + " l/s)", "Structure": n + " × " + (trench ? "trench " : "pit ") + F(L, ".2f") + " × " + F(B, ".2f") + " × " + F(D, ".2f") + " m" + (bore ? " + recharge bore " + F(boreD, ".0f") + " m" : ""),
      "Annual recharge": F(Ann, ",.0f") + " m³ / year", "Max utilisation": F(c.max_utilisation, ".2f") };
    return C.DesignResult({ module: "recharge_pit", title: "Rain-water harvesting recharge pit / trench", inputs: inp, calc: c, summary: summary, drawings: [sheet], quantities: qty, bbs: [], tables: {},
      references: ["CGWB Manual on Artificial Recharge of Ground Water (2007)", "CPWD Guidelines – Rain Water Harvesting", "IS 15797:2008 – Roof-top rain-water harvesting", "CPWD DSR 2021 ch. 23"] });
  }
  M.run_recharge_pit = run_recharge_pit;
  function rwDrawing(inp, L, B, D, fb, trench, bore, boreD, n) {
    var D_ = DR(), Lm = L * 1000, Dm = D * 1000, f = fb * 1000, dl = Dm - f, t = 230;
    var s = new D_.View((trench ? "Trench" : "Pit") + " – section");
    s.rect(-Lm / 2 - t, -Dm, t, Dm, "OUTLINE", "brick"); s.rect(Lm / 2, -Dm, t, Dm, "OUTLINE", "brick");
    s.rect(-Lm / 2, -Dm, Lm, dl / 2, "THIN", "soil"); s.text(0, -Dm + dl / 4, "boulders 5–20 cm", 1.8, { anchor: "middle" });
    s.rect(-Lm / 2, -Dm + dl / 2, Lm, dl / 4, "THIN", "concrete"); s.text(0, -Dm + dl * 0.62, "gravel 5–10 mm", 1.8, { anchor: "middle" });
    s.rect(-Lm / 2, -Dm + dl * 0.75, Lm, dl / 4, "THIN", "water"); s.text(0, -Dm + dl * 0.87, "coarse sand 1.5–2 mm", 1.8, { anchor: "middle" });
    s.rect(-Lm / 2 - t, 0, Lm + 2 * t, 50, "OUTLINE", "concrete"); s.text(0, 120, "precast perforated RCC covers", 1.8, { anchor: "middle" });
    s.rect(-Lm / 2 - t - 1200, -750, 600, 600, "OUTLINE"); s.text(-Lm / 2 - t - 900, -50, "silt chamber", 1.8, { anchor: "middle" });
    s.line(-Lm / 2 - t - 600, -300, -Lm / 2, -300, "STEEL");
    if (bore) { s.rect(-75, -Dm - Math.min(boreD * 1000, 6000), 150, Math.min(boreD * 1000, 6000), "STEEL"); s.text(150, -Dm - 1500, "recharge bore 150Ø × " + F(boreD, ".0f") + " m (slotted in aquifer)", 1.8); }
    s.line(-Lm - 2000, 0, Lm + 1500, 0, "SOIL"); s.text(Lm + 1500, 60, "GL", 1.8, { anchor: "end" });
    s.dim(-Lm / 2, -Dm, Lm / 2, -Dm, 8); s.dim(Lm / 2 + t + 300, -Dm, Lm / 2 + t + 300, 0, -8, "D " + F(Dm, ",.0f"));
    var notes = ["Filter media in layers as shown; top 0.3 m free board; perforated covers / MS grating.", "Honeycomb brick lining 230 in CM 1:6 with open vertical joints.",
      "Silt chamber with removable mesh and first-flush arrangement on roof down-takes; clean before every monsoon.", n + " " + (trench ? "trench(es)" : "pit(s)") + " of " + F(L, ".2f") + " × " + F(B, ".2f") + " × " + F(D, ".2f") + " m."];
    return new D_.Sheet("Rain-water harvesting recharge " + (trench ? "trench" : "pit"), "RW-01", [s], notes);
  }
  var RW_PARAMS = [
    P("area", "Catchment area", 500.0, "m²", { min: 20, max: 50000, step: 10, group: "Catchment" }),
    P("catch_type", "Catchment type", RW_CATCH[0], { kind: "select", options: RW_CATCH.slice(), group: "Catchment" }),
    P("intensity", "Design rainfall intensity (peak)", 75.0, "mm/h", { min: 20, max: 200, step: 5, group: "Catchment", help: "Chhattisgarh plains: 60–90 mm/h for 15 min (IMD – verify)" }),
    P("storm_min", "Design storm duration", 15.0, "min", { min: 10, max: 60, step: 5, group: "Catchment" }),
    P("annual", "Annual rainfall", 1300.0, "mm", { min: 400, max: 3000, step: 10, group: "Catchment" }),
    P("rtype", "Recharge structure", RW_TYPE[0], { kind: "select", options: RW_TYPE.slice(), group: "Structure" }),
    P("perm", "Soil permeability (site test)", 25.0, "mm/h", { min: 2, max: 500, step: 1, group: "Structure" }),
    P("gwt", "Pre-monsoon groundwater level below GL", 8.0, "m", { min: 1, max: 60, step: 0.5, group: "Structure" }),
    P("bore_depth", "Recharge bore depth", 20.0, "m", { min: 6, max: 100, step: 1, group: "Structure", when: function (v) { return /bore/.test(String(v.rtype)); } }),
    P("L_chk", "Pit size / trench length (check)", 1.5, "m", { min: 0.6, max: 30, step: 0.05, group: "My design", modes: CHECK }),
    P("B_chk", "Trench width (check)", 1.0, "m", { min: 0.5, max: 2, step: 0.05, group: "My design", modes: CHECK }),
    P("D_chk", "Depth (check)", 2.5, "m", { min: 1, max: 4, step: 0.1, group: "My design", modes: CHECK }),
    P("n_chk", "Number (check)", 1, { kind: "int", min: 1, max: 50, group: "My design", modes: CHECK })
  ];
  C.register({ id: "recharge_pit", phase: 3, category: CAT, name: "Rain-water harvesting recharge pit / trench", icon: "💧",
    description: "Roof / paved-area runoff, design storm storage + infiltration, recharge pit / trench / pit with recharge bore (CGWB), filter media, silt chamber, annual recharge; CPWD ch. 23 quantities & drawing.",
    params: RW_PARAMS, run: run_recharge_pit, references: ["CGWB Manual on Artificial Recharge (2007)", "IS 15797:2008"] });

  /* ======================================================================= 5. MASONRY LINED / GARLAND DRAIN */
  var MD_TYPE = ["Rectangular – brick masonry, plastered", "Rectangular – stone masonry (RR)", "Trapezoidal – stone pitched (garland drain)", "Trapezoidal – unlined earthen"];
  var MD_N = { brick: 0.015, stone: 0.020, pitch: 0.025, earth: 0.027 };
  function mdKind(inp) { var v = String(inp.dtype); return /brick/.test(v) ? "brick" : /stone masonry/.test(v) ? "stone" : /pitched/.test(v) ? "pitch" : "earth"; }
  function manQ(b, y, z, n, S) { var A = (b + z * y) * y, Pw = b + 2 * y * Math.sqrt(1 + z * z), Rh = A / Pw; return { A: A, P: Pw, R: Rh, V: Math.pow(Rh, 2 / 3) * Math.sqrt(S) / n, Q: A * Math.pow(Rh, 2 / 3) * Math.sqrt(S) / n }; }
  M.manQ = manQ;
  function run_masonry_drain(inp, mode) {
    var c = new C.Calc("Masonry lined / garland drain");
    var kind = mdKind(inp), rect = kind === "brick" || kind === "stone", z = rect ? 0 : num(inp.side_slope), S = 1 / num(inp.slope_n), n = MD_N[kind];
    c.section("Design discharge");
    var Qd;
    if (/^Rational/.test(String(inp.qmode))) Qd = c.calc("Rational method Q = C·i·A/360", "Q", "C*i*A/360", "m³/s", "IRC SP 42 / CPHEEO", { C: num(inp.runoff_c), i: num(inp.intensity), A: num(inp.catch_ha) });
    else Qd = c.let("Design discharge", "Q", num(inp.q), "m³/s");
    c.section("Section (Manning)");
    c.let("Manning n / bed slope", "n, S", G(n) + ", 1 in " + G(num(inp.slope_n)), "", "IRC SP 42 Table 6.x (verify)", String(inp.dtype));
    var b, y, fbm = num(inp.freeboard);
    if (mode === "check" || mode === "free") { b = num(inp.b_chk); y = num(inp.d_chk) - fbm; }
    else {
      b = Math.max(num(inp.bmin), 0.3);
      for (var it = 0; it < 600; it++) {
        var ymax = rect ? Math.min(1.2 * b, 2.5) : Math.min(1.5 * b, 2.5);
        if (manQ(b, ymax, z, n, S).Q >= Qd) { var lo = 0.05, hi = ymax; for (var j = 0; j < 40; j++) { var md = (lo + hi) / 2; if (manQ(b, md, z, n, S).Q >= Qd) hi = md; else lo = md; } y = ceil_to(hi, 0.025); break; }
        b = R(b + (b < 2 ? 0.05 : 0.1), 2); y = ymax;
      }
    }
    var hh = manQ(b, y, z, n, S);
    c.let("Bed width × flow depth" + (rect ? "" : ", side slope " + G(z) + "H:1V"), "b × y", F(b, ".2f") + " × " + F(y, ".2f"), "m");
    c.calc("Area / wetted perimeter / hydraulic radius", "A, P, R", "R", "m", "", F(hh.A, ".3f") + " m², " + F(hh.P, ".3f") + " m", { R: R(hh.R, 4) });
    var Qc = c.calc("Capacity at flow depth", "Qc", "A*R**(2/3)*S**0.5/n", "m³/s", "Manning", { A: R(hh.A, 4), R: R(hh.R, 4), S: R(S, 6), n: n });
    c.check("Capacity ≥ design discharge", Qd, Qc, { unit: "m³/s", clause: "Manning" });
    var V = c.calc("Velocity", "V", "Qc/A", "m/s", "", { Qc: Qc, A: R(hh.A, 4) });
    c.ok("Self-cleansing velocity ≥ 0.6 m/s", V >= 0.6 - 1e-9, { detail: F(V, ".2f") + " m/s", clause: "IRC SP 42 / CPHEEO", warn_only: true });
    var vmax = kind === "earth" ? 1.0 : kind === "pitch" ? 2.5 : 3.0;
    c.check("Velocity ≤ non-scouring limit", V, vmax, { unit: "m/s", clause: "IRC SP 42 (earthen ≈ 1.0, pitched 2.5, masonry 3.0 m/s – verify)", note: "flatter slope / drop structures" });
    var Dd = y + fbm;
    c.let("Overall depth (flow + free board)", "D", R(Dd, 3), "m", "", "free board " + G(fbm * 1000) + " mm");
    // walls as gravity walls (rectangular)
    var tw = 0, tb = 0.3, bed = kind === "earth" ? 0 : 0.15;
    if (rect) {
      c.section("Side walls (masonry gravity walls, IS 1905)");
      var phi = num(inp.phi), Ka = (1 - Math.sin(phi * Math.PI / 180)) / (1 + Math.sin(phi * Math.PI / 180)), gs = num(inp.gamma), q = num(inp.surcharge), gm = kind === "stone" ? 22 : 20;
      tw = mode === "check" || mode === "free" ? num(inp.tw_chk) / 1000 : 0.23;
      var M0 = c.calc("Earth + surcharge moment at the wall base (drain empty)", "M", "Ka*g*H**3/6 + Ka*q*H**2/2", "kN·m/m", "Rankine active", { Ka: R(Ka, 4), g: gs, H: R(Dd, 3), q: q });
      var ftm = masonryTension(inp.mortar)[0];
      var fOf = function (t) { var W = gm * t * Dd; return 6 * M0 / (t * t) / 1000 - W / t / 1000; };
      if (mode !== "check" && mode !== "free") { tw = Math.max(kind === "stone" ? 0.38 : 0.23, 0.23); while (fOf(tw) > ftm && tw < 2.0) tw = R(tw + 0.115, 3); }
      var W0 = gm * tw * Dd;
      c.let("Wall thickness (uniform)", "t", R(tw * 1000, 0), "mm", "", "masonry unit weight " + gm + " kN/m³; the bed concrete props the toe – wall checked as a cantilever (conservative)");
      var fmt = c.calc("Flexural tension at the wall base (net of self-weight)", "ft", "6*M/t**2/1000 - W/t/1000", "N/mm²", "IS 1905 cl 5.4.2", { M: R(M0, 4), t: R(tw, 3), W: R(W0, 3) });
      c.check("Flexural tension ⊥ bed joints ≤ permissible", fmt, ftm, { unit: "N/mm²", clause: "IS 1905 cl 5.4.2 (verify)", note: "thicker wall / batter / RCC" });
      c.calc("Max. compression", "fmax", "6*M/t**2/1000 + W/t/1000", "N/mm²", "", { M: R(M0, 4), t: R(tw, 3), W: R(W0, 3) });
    }
    c.miss("Drops / chutes where the ground slope is steeper than the bed slope (velocity limit)", "IRC SP 42", "Important");
    if (isMine()) c.miss("Garland drain: settling pit before discharge to natural drainage (TSS norms)", "CPCB / MoEF EC conditions", "Important");
    // quantities per drain length
    var Lr = num(inp.length), qty = [], topW = b + 2 * z * Dd;
    if (rect) {
      var W2 = b + 2 * tw;
      qty.push(Q("Earth work in excavation for drain, all kinds of soil", "cum", [row("Drain", 1, Lr, W2 + 0.3, Dd + bed)], [CPWD(), "2.8.1"]));
      qty.push(Q("PCC 1:4:8 in bed of drain", "cum", [row("Bed", 1, Lr, W2 + 0.1, bed)], [CPWD(), "4.1.8"]));
      if (kind === "brick") {
        qty.push(Q(brickDesc(inp.mortar, "drain side walls"), "cum", [row("2 walls", 2, Lr, tw, Dd)], brickItem(inp.mortar, false)));
        qty.push(Q("12 mm cement plaster 1:4 inside drain walls & bed + neat cement", "sqm", [row("Walls (2 faces)", 2, Lr, null, Dd), row("Bed", 1, Lr, b)], [CPWD(), "13.4.1"]));
      } else qty.push(Q("Random rubble masonry in CM 1:6 – drain side walls", "cum", [row("2 walls", 2, Lr, tw, Dd)], [CPWD(), "7.1.1"]));
      qty.push(Q("CC 1:2:4 coping 75 mm on drain walls", "cum", [row("Coping", 2, Lr, tw + 0.05, 0.075)], [CPWD(), "4.1.3"]));
      qty.push(Q("Filling excavated earth behind drain walls", "cum", [row("Behind walls", 2, Lr, 0.15, Dd)], [CPWD(), "2.25"]));
    } else {
      var Aex = (b + z * Dd) * Dd + (kind === "pitch" ? (b + 2 * Dd * Math.sqrt(1 + z * z)) * 0.3 : 0);
      qty.push(Q("Earth work in excavation for garland drain, all kinds of soil", "cum", [row("Drain section area × length", 1, Lr, Aex)], [CPWD(), "2.8.1"]));
      if (kind === "pitch") {
        var per = b + 2 * Dd * Math.sqrt(1 + z * z);
        qty.push(Q("Dry stone pitching 22.5 cm thick in bed & sides of drain", "sqm", [row("Pitched perimeter × length", 1, Lr, per)], [CPWD(), "16.73"]));
        qty.push(Q("75 mm back-filling (moorum) under pitching", "sqm", [row("Under pitching", 1, Lr, per)], [CPWD(), "16.74.1"]));
      }
    }
    var sheet = mdDrawing(inp, rect, b, y, Dd, z, tw, bed, kind);
    var summary = { "Section": (rect ? "rectangular " : "trapezoidal ") + F(b, ".2f") + " m bed × " + F(Dd, ".2f") + " m deep" + (rect ? "" : ", " + G(z) + ":1 sides, top " + F(topW, ".2f") + " m"),
      "Hydraulics": "Q " + F(Qd, ".3f") + " m³/s, V " + F(V, ".2f") + " m/s, S 1 in " + G(num(inp.slope_n)), "Walls": rect ? G(tw * 1000) + " mm " + (kind === "brick" ? "brick" : "RR stone") : String(inp.dtype),
      "Length": F(Lr, ".0f") + " m", "Max utilisation": F(c.max_utilisation, ".2f") };
    return C.DesignResult({ module: "masonry_drain", title: "Masonry lined / garland drain", inputs: inp, calc: c, summary: summary, drawings: [sheet], quantities: qty, bbs: [], tables: {},
      references: ["IRC SP 42:2014 – Road drainage", "IRC SP 50 – Urban drainage", "IS 1905:1987", "CPWD DSR 2021"] });
  }
  M.run_masonry_drain = run_masonry_drain;
  function mdDrawing(inp, rect, b, y, Dd, z, tw, bed, kind) {
    var D_ = DR(), B = b * 1000, D = Dd * 1000, Y = y * 1000, T = tw * 1000, Bd = bed * 1000;
    var s = new D_.View("Cross section");
    if (rect) {
      s.rect(-B / 2 - T - 50, -Bd, B + 2 * T + 100, Bd, "OUTLINE", "concrete");
      s.rect(-B / 2 - T, 0, T, D, "OUTLINE", kind === "brick" ? "brick" : "soil"); s.rect(B / 2, 0, T, D, "OUTLINE", kind === "brick" ? "brick" : "soil");
      s.rect(-B / 2 - T, D, T + 25, 75, "OUTLINE", "concrete"); s.rect(B / 2 - 25, D, T + 25, 75, "OUTLINE", "concrete");
      s.line(-B / 2, Y, B / 2, Y, "WATER"); s.dim(-B / 2, 0, B / 2, 0, 6); s.dim(B / 2 + T + 300, 0, B / 2 + T + 300, D, -8);
      s.line(-B - 1500, D, B + 1500, D, "SOIL");
    } else {
      var tW = B + 2 * z * D;
      s.poly([[-tW / 2, D], [-B / 2, 0], [B / 2, 0], [tW / 2, D]], false, "OUTLINE");
      if (kind === "pitch") s.poly([[-tW / 2 - 250, D], [-B / 2 - 100, -225], [B / 2 + 100, -225], [tW / 2 + 250, D], [tW / 2, D], [B / 2, 0], [-B / 2, 0], [-tW / 2, D]], true, "OUTLINE", "soil");
      s.line(-B / 2 - z * Y, Y, B / 2 + z * Y, Y, "WATER"); s.dim(-B / 2, 0, B / 2, 0, 6); s.dim(-tW / 2, D, tW / 2, D, -8); s.dim(tW / 2 + 300, 0, tW / 2 + 300, D, -8);
      s.line(-tW - 1000, D, tW + 1000, D, "SOIL");
    }
    s.text(0, Y + 80, "FSL (flow " + F(Y, ",.0f") + ")", 1.8, { anchor: "middle" });
    var notes = [String(inp.dtype) + "; bed slope 1 in " + G(num(inp.slope_n)) + ".", rect ? "Walls in " + String(inp.mortar) + " on PCC 1:4:8 bed 150; CC 1:2:4 coping; weep holes 75 mm @ 1.5 m where groundwater is high." : "Side slopes " + G(z) + "H:1V; pitching 22.5 cm on 75 mm moorum backing.",
      "Check outfall levels; provide drops where the ground is steeper than the bed."];
    return new D_.Sheet("Masonry lined / garland drain", "MD-01", [s], notes);
  }
  var MD_PARAMS = [
    P("dtype", "Drain type", MD_TYPE[0], { kind: "select", options: MD_TYPE.slice(), group: "Drain" }),
    P("qmode", "Discharge", "Rational method Q = C·i·A/360", { kind: "select", options: ["Rational method Q = C·i·A/360", "Design discharge Q given"], group: "Drain" }),
    P("q", "Design discharge Q", 0.3, "m³/s", { min: 0.01, max: 20, step: 0.01, group: "Drain", when: function (v) { return /given/.test(String(v.qmode)); } }),
    P("runoff_c", "Runoff coefficient C", 0.6, { min: 0.1, max: 0.95, step: 0.05, group: "Drain", when: function (v) { return /^Rational/.test(String(v.qmode)); } }),
    P("intensity", "Rainfall intensity", 75.0, "mm/h", { min: 20, max: 250, step: 5, group: "Drain", when: function (v) { return /^Rational/.test(String(v.qmode)); } }),
    P("catch_ha", "Catchment area", 5.0, "ha", { min: 0.1, max: 1000, step: 0.1, group: "Drain", when: function (v) { return /^Rational/.test(String(v.qmode)); } }),
    P("slope_n", "Bed slope 1 in", 500.0, { min: 50, max: 5000, step: 10, group: "Drain" }),
    P("bmin", "Minimum bed width", 0.45, "m", { min: 0.3, max: 5, step: 0.05, group: "Drain" }),
    P("side_slope", "Side slope (trapezoidal) H : 1V", 1.5, { min: 0.5, max: 3, step: 0.25, group: "Drain", when: function (v) { return /^Trap/.test(String(v.dtype)); } }),
    P("freeboard", "Free board", 0.15, "m", { min: 0.1, max: 0.6, step: 0.05, group: "Drain" }),
    P("length", "Drain length (quantities)", 100.0, "m", { min: 1, max: 20000, step: 1, group: "Drain" }),
    P("mortar", "Masonry mortar", MORTAR[0], { kind: "select", options: MORTAR.slice(), group: "Walls & soil" }),
    P("gamma", "Soil unit weight", 18.0, "kN/m³", { min: 15, max: 22, group: "Walls & soil" }),
    P("phi", "Soil angle of friction", 30.0, "°", { min: 20, max: 40, group: "Walls & soil" }),
    P("surcharge", "Surcharge beside the drain", 5.0, "kN/m²", { min: 0, max: 30, group: "Walls & soil" }),
    P("b_chk", "Bed width (check)", 0.6, "m", { min: 0.3, max: 6, step: 0.05, group: "My design", modes: CHECK }),
    P("d_chk", "Overall depth (check)", 0.75, "m", { min: 0.3, max: 3, step: 0.05, group: "My design", modes: CHECK }),
    P("tw_chk", "Wall thickness (check)", 345.0, "mm", { kind: "select", options: [230.0, 345.0, 380.0, 460.0, 575.0], group: "My design", modes: CHECK })
  ];
  C.register({ id: "masonry_drain", phase: 3, category: CAT, name: "Masonry lined / garland drain", icon: "〰️",
    description: "Brick or stone masonry rectangular drain, or trapezoidal stone-pitched / earthen garland drain for mines: rational discharge, Manning section, self-cleansing & scour velocities, masonry walls as gravity walls (no tension); quantities per length & drawing.",
    params: MD_PARAMS, run: run_masonry_drain, references: ["IRC SP 42:2014", "IS 1905:1987"] });

  /* ======================================================================= 6. OIL & GREASE TRAP (wash bay / workshop) */
  function run_oil_trap(inp, mode) {
    var c = new C.Calc("Oil & grease trap with silt chamber");
    c.section("Flow");
    var Qh = /^Wash/.test(String(inp.source)) ? c.calc("Peak flow from wash bays", "Q", "nb*nv*lv/1000", "m³/h", "", "vehicles per hour per bay × water per vehicle", { nb: num(inp.bays), nv: num(inp.veh_h), lv: num(inp.l_veh) }) : c.let("Peak flow (workshop floor wash / given)", "Q", num(inp.q_h), "m³/h");
    var Qs = Qh / 3600;
    c.section("Oil separation (API / CPCB practice)");
    var dmm = num(inp.droplet), rho = num(inp.oil_sg) * 1000, mu = 1.0e-3;
    var Vt = c.calc("Rise velocity of the design oil droplet (Stokes)", "Vt", "9.81*(1000 - rho)*(d/1e6)**2/(18*mu)", "m/s", "Stokes' law (API 421 approach)", "d = " + G(dmm) + " µm", { rho: rho, d: dmm, mu: mu });
    var Ah = c.calc("Surface area of the separation chamber (short-circuit factor 1.5)", "Ah", "1.5*Q/Vt", "m²", "API 421 [APPROX]", { Q: R(Qs, 6), Vt: R(Vt, 7) });
    var td = num(inp.detention), Dw = num(inp.depth);
    var Vd = c.calc("Volume for the detention time (all chambers)", "Vd", "Q*t/60", "m³", "CPCB guideline for vehicle washing: ≥ 30 min (verify)", { Q: R(Qh, 4), t: td });
    var B, L1, L2, L3;
    if (mode === "check" || mode === "free") { B = num(inp.B_chk); L1 = num(inp.L1_chk); L2 = num(inp.L2_chk); L3 = num(inp.L3_chk); }
    else {
      var Atot = Math.max(Vd / Dw, Ah / 0.4);
      B = Math.max(0.6, ceil_to(Math.sqrt(Atot / 3), 0.05)); var Lt = ceil_to(Atot / B, 0.05);
      L1 = ceil_to(0.4 * Lt, 0.05); L2 = ceil_to(Math.max(0.4 * Lt, Ah / B), 0.05); L3 = Math.max(0.6, ceil_to(0.2 * Lt, 0.05));
    }
    c.let("Chambers: silt / oil separation / clear water", "L1 + L2 + L3 (× B)", F(L1, ".2f") + " + " + F(L2, ".2f") + " + " + F(L3, ".2f") + " (× " + F(B, ".2f") + ")", "m", "", "liquid depth " + F(Dw, ".2f") + " m");
    c.check("Separation surface ≥ required", Ah, L2 * B, { unit: "m²", clause: "API 421 [APPROX]" });
    c.check("Detention volume ≥ required", Vd, (L1 + L2 + L3) * B * Dw, { unit: "m³", clause: "CPCB (verify)" });
    var Vh = c.calc("Horizontal velocity in the separation chamber", "Vh", "Q/(B*D)", "m/s", "", { Q: R(Qs, 6), B: B, D: Dw });
    c.check("Vh ≤ 15 Vt and ≤ 0.015 m/s", Vh, Math.min(15 * Vt, 0.015), { unit: "m/s", clause: "API 421" });
    c.let("Baffles", "", "inlet & outlet through dip tees / under-flow baffles 150 mm above floor; oil skimming pipe (slotted 100 mm) at TWL into an oil drum chamber", "", "practice");
    c.miss("Collected oil to authorised recyclers (Hazardous Waste Rules 2016); log book", "HW (M&TM) Rules 2016", "Important");
    c.miss("Silt removal after every monsoon / monthly; ramp & sump grating to stop gravel", "practice", "Advisory");
    // structure: brick walls 230/345 (depth ≤ 1.5) with RCC base & covers – light check
    c.section("Structure");
    var Hw = Dw + 0.3, tw = Hw <= 1.5 ? 0.23 : 0.345, nP = 2;
    c.let("Walls / partitions", "", G(tw * 1000) + " mm brick in CM 1:4, inside 20 mm CM 1:4 + water-proofing, 2 baffle / partition walls 230", "", "IS 2470 / tank practice (depth " + F(Hw, ".2f") + " m)");
    c.let("Base / covers", "", "RCC M25 base 150 mm (8Ø @ 150 both ways, both faces); precast RCC covers / MS grating over each chamber", "", "practice");
    var Lin = L1 + L2 + L3 + nP * 0.23, Lo = Lin + 2 * tw, Bo = B + 2 * tw, qty = [], nos = Math.max(1, Math.trunc(num(inp.nos)));
    qty.push(Q("Earth work in excavation for oil trap", "cum", [row("Pit", nos, Lo + 0.6, Bo + 0.6, Hw + 0.25)], [CPWD(), "2.8.1"]));
    qty.push(Q("PCC 1:4:8 below base", "cum", [row("Below base", nos, Lo + 0.2, Bo + 0.2, 0.1)], [CPWD(), "4.1.8"]));
    qty.push(Q("RCC M25 base slab (excl. steel & shuttering)", "cum", [row("Base", nos, Lo + 0.3, Bo + 0.3, 0.15)], null, CM().rcc_rate(25)));
    qty.push(Q(brickDesc(MORTAR[0], "oil trap walls & baffles"), "cum", [row("Outer walls", nos, 2 * (Lin + B + 2 * tw), tw, Hw), row("Partitions / baffles", nos * nP, B, 0.23, Hw)], brickItem(MORTAR[0], false)));
    qty.push(Q("20 mm cement plaster 1:4 with water-proofing inside + neat cement", "sqm", [row("Inside walls", nos, 2 * (Lin + B), null, Hw), row("Partitions (2 faces)", nos * nP * 2, B, null, Hw), row("Floor", nos, Lin, B)], [CPWD(), "13.6.1"]));
    qty.push(Q("Precast RCC covers / MS grating over chambers (area)", "sqm", [row("Top", nos, Lin, B)], null, 2200, "Non-SOR"));
    qty.push(Q("Reinforcement for base slab (8Ø @ 150 both ways, both faces ≈ 10.6 kg/m²)", "kg", [row("Base", nos, (Lo + 0.3) * (Bo + 0.3), 10.6)], [CPWD(), "5.22.6"]));
    qty.push(Q("Dip tees, skimming pipe, oil drum chamber, outlet pipes (lump sum)", "each", [row("Set", nos)], null, 15000, "Non-SOR"));
    var sheet = otDrawing(B, L1, L2, L3, Dw, tw);
    var summary = { "Flow": F(Qh, ".2f") + " m³/h", "Chambers": "silt " + F(L1, ".2f") + " + oil " + F(L2, ".2f") + " + clear " + F(L3, ".2f") + " m × " + F(B, ".2f") + " m, liquid " + F(Dw, ".2f") + " m",
      "Detention": F((L1 + L2 + L3) * B * Dw / Qh * 60, ".0f") + " min", "Max utilisation": F(c.max_utilisation, ".2f") };
    return C.DesignResult({ module: "oil_trap", title: "Oil & grease trap with silt chamber", inputs: inp, calc: c, summary: summary, drawings: [sheet], quantities: qty, bbs: [], tables: {},
      references: ["API Publication 421 – Oil-water separators", "CPCB guidelines – vehicle service stations / washing", "Hazardous & Other Wastes Rules 2016"] });
  }
  M.run_oil_trap = run_oil_trap;
  function otDrawing(B, L1, L2, L3, Dw, tw) {
    var D_ = DR(), b = B * 1000, l1 = L1 * 1000, l2 = L2 * 1000, l3 = L3 * 1000, t = tw * 1000, p = 230, H = (Dw + 0.3) * 1000;
    var v = new D_.View("Plan"), x = t;
    v.rect(0, 0, l1 + l2 + l3 + 2 * p + 2 * t, b + 2 * t, "OUTLINE", "brick");
    [[l1, "SILT"], [l2, "OIL SEPARATION"], [l3, "CLEAR"]].forEach(function (z, i) { v.rect(x, t, z[0], b, "OUTLINE", "water"); v.text(x + z[0] / 2, t + b / 2, z[1], 1.8, { anchor: "middle" }); x += z[0] + (i < 2 ? p : 0); });
    v.line(-800, t + b / 2, t, t + b / 2, "STEEL"); v.text(-800, t + b / 2 + 80, "IN", 1.8); v.line(x, t + b / 2, x + t + 800, t + b / 2, "STEEL"); v.text(x + t + 200, t + b / 2 + 80, "OUT", 1.8);
    v.dim(0, 0, x + t, 0, 8); v.dim(x + t, 0, x + t, b + 2 * t, -8);
    var s = new D_.View("Longitudinal section"); x = 0;
    s.rect(-t, -150, l1 + l2 + l3 + 2 * p + 2 * t, 150, "OUTLINE", "concrete");
    s.rect(-t, 0, t, H, "OUTLINE", "brick"); s.rect(l1, 150, p, H - 150, "OUTLINE", "brick"); s.rect(l1 + p + l2, 0, p, H - 400, "OUTLINE", "brick"); s.rect(l1 + l2 + l3 + 2 * p, 0, t, H, "OUTLINE", "brick");
    s.line(0, Dw * 1000, l1 + l2 + l3 + 2 * p, Dw * 1000, "WATER"); s.text(l1 + p + l2 / 2, Dw * 1000 + 80, "oil layer → skimmer", 1.8, { anchor: "middle" });
    s.line(-1500, H, l1 + l2 + l3 + 2 * p + 1500, H, "SOIL"); s.dim(l1 + l2 + l3 + 2 * p + t + 300, 0, l1 + l2 + l3 + 2 * p + t + 300, Dw * 1000, -8, "LIQUID " + F(Dw * 1000, ",.0f"));
    var notes = ["Under-flow baffle (opening 150 mm above floor) between silt and oil chambers; over-flow wall to the clear chamber; outlet through a dip tee.",
      "Slotted skimming pipe at TWL to an oil drum chamber; covers / grating removable.", "Brick in CM 1:4 with 20 mm CM 1:4 water-proof plaster; RCC M25 base."];
    return new D_.Sheet("Oil & grease trap", "OT-01", [v, s], notes);
  }
  var OT_PARAMS = [
    P("source", "Source", "Wash bays (HEMM / vehicles)", { kind: "select", options: ["Wash bays (HEMM / vehicles)", "Workshop floor wash / given flow"], group: "Flow" }),
    P("bays", "Number of wash bays", 2, { kind: "int", min: 1, max: 20, group: "Flow", when: function (v) { return /^Wash/.test(String(v.source)); } }),
    P("veh_h", "Vehicles per hour per bay", 2.0, { min: 0.5, max: 10, step: 0.5, group: "Flow", when: function (v) { return /^Wash/.test(String(v.source)); } }),
    P("l_veh", "Water per vehicle", 1500.0, "l", { min: 100, max: 20000, step: 100, group: "Flow", help: "car 150–250 l, truck 600–1000 l, HEMM dumper 2000–5000 l", when: function (v) { return /^Wash/.test(String(v.source)); } }),
    P("q_h", "Peak flow", 3.0, "m³/h", { min: 0.2, max: 100, step: 0.1, group: "Flow", when: function (v) { return !/^Wash/.test(String(v.source)); } }),
    P("detention", "Detention time", 30.0, "min", { min: 15, max: 120, step: 5, group: "Separation" }),
    P("droplet", "Design oil droplet", 150.0, "µm", { min: 60, max: 300, step: 10, group: "Separation" }),
    P("oil_sg", "Oil specific gravity", 0.90, { min: 0.80, max: 0.95, step: 0.01, group: "Separation" }),
    P("depth", "Liquid depth", 1.0, "m", { min: 0.6, max: 1.8, step: 0.05, group: "Separation" }),
    P("nos", "Number of traps", 1, { kind: "int", min: 1, max: 20, group: "Quantity" }),
    P("B_chk", "Width (check)", 1.0, "m", { min: 0.6, max: 4, step: 0.05, group: "My design", modes: CHECK }),
    P("L1_chk", "Silt chamber length (check)", 1.2, "m", { min: 0.5, max: 6, step: 0.05, group: "My design", modes: CHECK }),
    P("L2_chk", "Oil chamber length (check)", 1.5, "m", { min: 0.5, max: 8, step: 0.05, group: "My design", modes: CHECK }),
    P("L3_chk", "Clear chamber length (check)", 0.8, "m", { min: 0.5, max: 4, step: 0.05, group: "My design", modes: CHECK })
  ];
  C.register({ id: "oil_trap", phase: 3, category: CAT, name: "Oil & grease trap (wash bay / workshop)", icon: "🛢️",
    description: "Oil & grease trap with silt chamber for HEMM / vehicle washing and workshops: peak flow, Stokes rise velocity, separation area, detention, horizontal velocity (API 421 / CPCB), brick chambers with baffles; quantities & drawing.",
    params: OT_PARAMS, run: run_oil_trap, references: ["API 421", "CPCB guidelines"] });

  /* ======================================================================= 7. FENCING (chain link / barbed wire) */
  var FN_TYPE = ["Chain link 50 × 50 mm (3.15 mm GI) + 3 barbed strands on top", "Barbed wire only (strands as below)", "Chain link + concertina coil on top"];
  var FN_POST = ["MS angle ISA 65×65×6", "MS angle ISA 50×50×6", "RCC precast post 150 × 150 (4-10Ø)"];
  function run_fencing(inp, mode) {
    if (mode !== "check" && mode !== "free" && !inp._fit) {
      var v = Object.assign({}, inp, { _fit: 1 });
      for (var k = 0; k < 20; k++) {
        var tr = run_fencing(v, "check"), fl = tr.calc.failures.map(function (x) { return x.section + "|" + x.label; });
        if (!fl.length) break;
        if (fl.some(function (x) { return /^Post/.test(x); })) { if (/50×50/.test(String(v.post))) v.post = FN_POST[0]; else if (v.post_s > 1.75) v.post_s = R(v.post_s - 0.25, 2); else break; }
        if (fl.some(function (x) { return /^Concrete block/.test(x); })) { if (v.blk_d < 1.2) v.blk_d = R(v.blk_d + 0.15, 2); else v.blk_b = R(v.blk_b + 0.1, 2); }
      }
      var res = run_fencing(v, mode);
      if (v.post_s !== inp.post_s || v.post !== inp.post || v.blk_d !== inp.blk_d) res.calc.steps.unshift(new C.Step("Fit", "Adjusted for strength", "", "", {}, "post " + v.post + " @ " + F(v.post_s, ".2f") + " m, block " + F(v.blk_b, ".2f") + " × " + F(v.blk_d, ".2f") + " m", "", "", "INFO"));
      return res;
    }
    var c = new C.Calc("Chain-link / barbed-wire fencing");
    var H = num(inp.height), Lt = num(inp.length), s = num(inp.post_s), type = String(inp.ftype), chain = /^Chain/.test(type), nstr = Math.trunc(num(inp.strands));
    c.section("Wind on the fence (IS 875-3)");
    var pd = LD().design_wind_pressure(c, num(inp.vb), Math.max(H, 2), Math.trunc(num(inp.terrain)), 1.0, 1.0, 1.0, s * H, 0.9, 0.9);
    var phi = chain ? 2 * 3.15 / 50 : 0.02, cf0 = 2.0;
    var Cf = c.calc("Force coefficient × solidity (open mesh)", "Cf·φ", "cf0*phi", "", "IS 875-3 cl 7.4.3 (lattice) [APPROX]", chain ? "chain link φ ≈ 2d/s = 0.126" : "barbed wire ≈ 0.02", { cf0: cf0, phi: R(phi, 4) });
    var cl = num(inp.clog);
    var Cfe = c.calc("Including clogging by dust / creepers", "Cfe", "max(Cf*(1 + cl), Cf)", "", "practice", { Cf: R(Cf, 4), cl: cl });
    var pw = c.calc("Net pressure on the fence", "pw", "Cfe*pd", "kN/m²", "", { Cfe: R(Cfe, 4), pd: pd });
    c.section("Post (cantilever from the block)");
    var post = String(inp.post), rcc = /^RCC/.test(post), Ms = c.calc("Moment at GL (service)", "Ms", "pw*s*H**2/2 + Tw*0", "kN·m", "", { pw: R(pw, 4), s: s, H: H, Tw: 0 });
    var Mu = 1.5 * Ms, okP;
    if (rcc) {
      var b = 150, d = 150 - 25 - 5, As = 2 * area(10);
      var Mr = c.calc("Moment of resistance (2-10Ø each face, Fe 500, M25)", "Mr", "0.87*500*As*(d - 0.42*0.48*d)/1e6", "kN·m", "IS 456 Annex G", { As: R(As, 1), d: d });
      okP = c.check("Factored moment ≤ Mr", Mu, Mr, { unit: "kN·m", clause: "IS 456" });
    } else {
      var an = /50×50/.test(post) ? "ISA 50x50x6" : "ISA 65x65x6", sec = SEC().section(an);
      var Md = c.calc("Bending capacity of the angle about the axis parallel to the fence (elastic)", "Md", "fy*Z/1.1/1e6", "kN·m", "IS 800 cl 8.2.1.2", "Z = Ixx/(leg − Cz)", { fy: 250, Z: R(sec.Zxx, 0) });
      okP = c.check("Factored moment ≤ Md", Mu, Md, { unit: "kN·m", clause: "IS 800" });
    }
    // foundation block (CC 1:3:6) – rigid block with passive resistance [APPROX]
    c.section("Concrete block (CPWD 16.17 / 16.18 spec)");
    var bb = num(inp.blk_b), db = num(inp.blk_d), gam = num(inp.gamma), Kp = (1 + Math.sin(num(inp.phi) * Math.PI / 180)) / (1 - Math.sin(num(inp.phi) * Math.PI / 180));
    var Hs = pw * s * H;
    var Hu = c.calc("Ultimate lateral capacity of the block (Broms short rigid pile in sand, 3Kp)", "Hu", "0.5*g*bb*db**3*3*Kp/(e + db)", "kN", "Broms (1964) [APPROX]", "load centroid e = H/2 above GL", { g: gam, bb: bb, db: db, Kp: R(Kp, 3), e: R(H / 2, 3) });
    c.check("Lateral load × 2.5 ≤ Hu", 2.5 * Hs, Hu, { unit: "kN", clause: "FoS 2.5 on Broms capacity (practice)", note: "deeper / wider block" });
    var nPosts = Math.round(Lt / s) + 1, nStrain = Math.ceil(nPosts / 15) + Math.trunc(num(inp.corners)) + 1;
    c.let("Posts", "", nPosts + " nos (incl. " + nStrain + " straining / corner posts with 2 struts each)", "", "CPWD: every 15th post, last-but-one, end & corner posts are straining posts");
    c.ok("Post spacing ≤ 3.0 m", s <= 3.0 + 1e-9, { detail: F(s, ".2f") + " m", clause: "CPWD 16.17 / IS 2721 practice", warn_only: true });
    c.miss("Gate: separate gate pillars & footings (gate wind + self-weight)", "practice", "Important");
    // quantities
    var qty = [], hp = H + db + (/^Chain/.test(type) && /barbed|concertina/.test(type) ? 0.45 : 0.15);
    if (rcc) qty.push(Q("Precast RCC fence posts 150 × 150 (M25, 4-10Ø) incl. struts", "cum", [row("Posts", nPosts, 0.15, 0.15, hp), row("Struts", 2 * nStrain, 0.125, 0.125, H * 1.2)], null, 14500, "Non-SOR"));
    else {
      var kgm = /50×50/.test(post) ? 4.5 : 5.8;
      qty.push(Q("Structural steel – MS angle fence posts & struts incl. Y-arms, priming", "kg", [row("Posts (" + post + ")", nPosts, hp, kgm), row("Struts", 2 * nStrain, H * 1.2, kgm)], [CPWD(), "10.1"]));
      qty.push(Q("Painting posts with synthetic enamel over primer", "sqm", [row("Posts (≈ 0.26 m² per m)", nPosts + 2 * nStrain, hp * 0.26)], [CPWD(), "13.61.1"]));
    }
    qty.push(Q("Earth work in excavation for post blocks", "cum", [row("Blocks", nPosts + 2 * nStrain, bb, bb, db)], [CPWD(), "2.8.1"]));
    qty.push(Q("Cement concrete 1:3:6 in post blocks", "cum", [row("Blocks", nPosts + 2 * nStrain, bb, bb, db)], [CPWD(), "4.1.6"]));
    if (chain) qty.push(Q("G.I. chain link fabric fencing 50 × 50 mm mesh fixed to posts", "sqm", [row("Fence", 1, Lt, H)], [CPWD(), "16.70.1"]));
    var strands = chain ? (/barbed/.test(type) ? 3 : 0) : nstr;
    if (strands) qty.push(Q("Barbed wire strands with angle / RCC posts (CPWD fencing item, per metre of strand – verify unit)", "metre", [row("Strands", strands, Lt)], [CPWD(), rcc ? "16.17.1" : "16.18.1"]));
    if (/concertina/.test(type)) qty.push(Q("Concertina coil fencing 600 mm dia on top", "metre", [row("Coil", 1, Lt)], [CPWD(), "16.53"]));
    qty.push(Q("Turn buckles & straining bolts", "each", [row("Per straining post", nStrain, Math.max(strands, 2))], [CPWD(), "16.16"]));
    var sheet = fnDrawing(inp, H, s, db, bb, chain, post);
    var summary = { "Fence": F(H, ".2f") + " m high × " + F(Lt, ".0f") + " m, " + type, "Posts": nPosts + " × " + post + " @ " + F(s, ".2f") + " m (" + nStrain + " straining)",
      "Blocks": F(bb, ".2f") + " × " + F(bb, ".2f") + " × " + F(db, ".2f") + " m CC 1:3:6", "Max utilisation": F(c.max_utilisation, ".2f") };
    return C.DesignResult({ module: "fencing", title: "Chain-link / barbed-wire fencing", inputs: inp, calc: c, summary: summary, drawings: [sheet], quantities: qty, bbs: [], tables: {},
      references: ["IS 2721:2003 – GI chain link fence fabric", "IS 278:2009 – Barbed wire", "IS 875 (Part 3):2015", "CPWD DSR 2021 ch. 16"] });
  }
  M.run_fencing = run_fencing;
  function fnDrawing(inp, H, s, db, bb, chain, post) {
    var D_ = DR(), Hm = H * 1000, sm = s * 1000, Db = db * 1000, Bb = bb * 1000;
    var e = new D_.View("Elevation (3 bays)");
    for (var i = 0; i < 4; i++) { e.rect(i * sm - 30, 0, 60, Hm + 300, "STEEL", "steel"); e.rect(i * sm - Bb / 2, -Db, Bb, Db, "OUTLINE", "concrete"); }
    e.line(0, Hm + 300, 0 + 0, Hm + 300, "STEEL");
    e.line(0, 0, 0 - 0, 0, "THIN");
    e.poly([[0, Hm * 0.66], [-1100, 0], [-1100, -300]], false, "STEEL"); e.rect(-1100 - Bb / 2, -Db, Bb, Db, "OUTLINE", "concrete"); e.text(-1500, Hm * 0.4, "strut (straining post)", 1.8);
    if (chain) for (var x = 0; x < 3 * sm; x += 250) { e.line(x, 100, x + 250, Hm, "THIN"); e.line(x + 250, 100, x, Hm, "THIN"); }
    for (var k = 0; k < 3; k++) e.line(0, Hm + 100 + k * 100, 3 * sm, Hm + 100 + k * 100, "HIDDEN");
    e.line(-1500, 0, 3 * sm + 800, 0, "SOIL"); e.dim(0, Hm, sm, Hm, -8); e.dim(3 * sm + 300, 0, 3 * sm + 300, Hm, -8); e.dim(-Bb / 2, -Db, Bb / 2, -Db, 8);
    e.text(sm * 1.5, Hm + 600, post + " posts @ " + F(sm, ",.0f") + "; blocks " + F(Bb, ",.0f") + " sq × " + F(Db, ",.0f") + " CC 1:3:6", 1.8, { anchor: "middle" });
    var notes = [String(inp.ftype) + ", height " + F(H, ".2f") + " m.", "Every 15th post, last-but-one, end & corner posts are straining posts with 2 struts (CPWD 16.17 / 16.18).",
      "Fabric / wires tightened with turn buckles; posts primed + 2 coats enamel (steel) or precast M25 (RCC)."];
    return new D_.Sheet("Chain-link / barbed-wire fencing", "FN-01", [e], notes);
  }
  var FN_PARAMS = [
    P("ftype", "Fence type", FN_TYPE[0], { kind: "select", options: FN_TYPE.slice(), group: "Fence" }),
    P("height", "Height above GL", 1.8, "m", { min: 1.0, max: 3.6, step: 0.1, group: "Fence" }),
    P("length", "Fence length", 500.0, "m", { min: 5, max: 50000, step: 1, group: "Fence" }),
    P("strands", "Barbed strands (barbed only)", 8, { kind: "int", min: 3, max: 15, group: "Fence", when: function (v) { return /^Barbed/.test(String(v.ftype)); } }),
    P("post", "Posts", FN_POST[0], { kind: "select", options: FN_POST.slice(), group: "Posts" }),
    P("post_s", "Post spacing", 2.5, "m", { min: 1.5, max: 4, step: 0.25, group: "Posts" }),
    P("corners", "Corners / changes of direction", 4, { kind: "int", min: 0, max: 200, group: "Posts" }),
    P("blk_b", "Concrete block size (square)", 0.45, "m", { min: 0.3, max: 1.0, step: 0.05, group: "Posts" }),
    P("blk_d", "Block depth", 0.6, "m", { min: 0.45, max: 1.5, step: 0.05, group: "Posts" }),
    P("vb", "Basic wind speed Vb", 39.0, "m/s", { kind: "select", options: [33.0, 39.0, 44.0, 47.0, 50.0], group: "Wind & soil" }),
    P("terrain", "Terrain category", 2, { kind: "select", options: [1, 2, 3, 4], group: "Wind & soil" }),
    P("clog", "Extra solidity from dust / creepers (fraction)", 0.0, { min: 0, max: 3, step: 0.1, group: "Wind & soil" }),
    P("gamma", "Soil unit weight", 18.0, "kN/m³", { min: 15, max: 22, group: "Wind & soil" }),
    P("phi", "Soil angle of friction", 30.0, "°", { min: 20, max: 40, group: "Wind & soil" })
  ];
  C.register({ id: "fencing", phase: 3, category: CAT, name: "Chain-link / barbed-wire fencing", icon: "🚧",
    description: "Mine / colony boundary fencing with MS angle or RCC posts in concrete blocks: wind on the mesh, post bending, block stability, straining posts & struts; CPWD ch. 16 quantities & drawing.",
    params: FN_PARAMS, run: run_fencing, references: ["IS 2721", "IS 278", "IS 875-3"] });
})();
