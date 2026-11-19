/* Design Studio — modules_extra3 (new modules, not a Python port). Loads after modules_extra.js (uses its helpers).
   Site-engineer modules for SECL (Korba / Gevra) works – design + CPWD-style estimate quantities.
     underground_sump  Rectangular underground RCC sump / pump-house sump / UG water tank – IS 3370-1/2/4 + IS 456:
                       capacity → size, levels, wall plate moments (IS 3370-4-type coefficients, top free / hinged,
                       bottom & sides fixed) or cantilever + horizontal frame (L/H > 2) with direct tension, crack width
                       (IS 3370-2 / IS 456 Annex F), minimum steel (IS 3370-2 cl 8.1), base slab with uplift / flotation
                       (FoS ≥ 1.2) and projection, two-way roof slab with manholes, BBS, quantities, drawings
     lintel_chajja     Lintel over an opening (arching 60° / 45° triangle or full masonry), lintel + chajja (sunshade)
                       cantilever with torsion of the lintel (IS 456 cl 41) and overturning check, plinth beam on wall
                       footing (IS 456 Table 12 / 13 coefficients) – BBS, quantities, drawings
   Conventions as modules_extra.js: lengths m (sections mm), loads kN, every number recorded in a Calc with its formula
   and clause; BBS only through DS.bbs; quantities with CPWD-style descriptions (mapped to DSR items by the UI).
   Clause references marked "verify" are paraphrased – check against a licensed copy of the code. */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var C = DS.core, F = C.pyfmt, R = C.pyround, ceil_to = C.ceil_to;
  var M = DS.modules_extra3 = {};
  function CM() { return DS.common; }
  function RC() { return DS.rcc; }
  function MT() { return DS.materials; }
  function DR() { return DS.drawing; }
  function BB() { return DS.bbs; }
  function DT() { return DS.detailing; }
  function XT() { return DS.modules_extra; }
  function row() { return CM().row.apply(null, arguments); }
  function Q() { return CM().Q.apply(null, arguments); }
  function num(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function G(x) { return F(x, "g"); }
  function area(d) { return Math.PI * d * d / 4; }
  function clamp(x, a, b) { return Math.min(Math.max(x, a), b); }
  function ctx() { return C.ctx || { site: "general", detail: "practice" }; }
  function isMine() { return ctx().site === "mine"; }
  function CPWD() { return CM().CPWD; }
  function P(key, label, def, unit, o) {
    if (unit && typeof unit === "object") { o = unit; unit = ""; }
    return C.Param(Object.assign({ key: key, label: label, default: def, unit: unit || "" }, o || {}));
  }
  var CHECK = ["check"];
  var RCC_REFS = ["IS 456:2000 – Plain & reinforced concrete", "SP 16 & SP 34 – Design aids & detailing",
    "IS 2502:1963 – Bending & fixing of bars", "CPWD DSR 2021 / DSOR 2023 – Specifications & item descriptions"];
  function matParams(cover, exposure, fckDef, grades) {
    return [P("fck", "Concrete grade fck", fckDef, "N/mm²", { kind: "select", options: grades, group: "Materials" }),
      P("fy", "Steel fy", 500.0, "N/mm²", { kind: "select", options: [415.0, 500.0], group: "Materials" }),
      P("exposure", "Exposure", exposure, { kind: "select", options: Object.keys(DS.materials.EXPOSURE), group: "Materials",
        help: "IS 456 Table 3. Mining area (site = mine) is taken as Severe in design mode." }),
      P("cover", "Clear cover", cover, "mm", { min: 15, max: 75, step: 5, group: "Materials" })];
  }

  /* =========================================================================== IS 3370-4-type plate coefficients
     Wall panel of height a and width b: bottom edge fixed, both vertical edges fixed, top edge FREE (open tank / roof not
     tied) or HINGED (roof slab), loaded by a TRIANGULAR pressure (0 at top → p at the base) or a UNIFORM pressure p.
     M = coef × p × a² (kN·m/m); V (base reaction at mid-width) = coef × p × a. Poisson's ratio 0.2 (as IS 3370-4).
       Mx_base  vertical moment at the base, mid-width   (tension on the loaded face)
       Mx_span  max. vertical moment on the centre line (tension on the far face)
       My_corner max. horizontal moment at the vertical edges (tension on the loaded face), xc = its depth / a
       My_span  max. horizontal moment in the panel (tension on the far face)
     Values at b/a = 0.5 … 3.0 computed by finite-difference plate analysis (32 divisions per height, 13-point biharmonic
     stencil, free-edge Mx = Vx = 0) – the same plate theory as the IS 3370-4 (PCA) tables; the solver reproduces the
     classical values (clamped square 0.0513 / 0.0231 qa², simply supported 0.0479 qa², propped cantilever pa²/15).
     Interpolated linearly in b/a; b/a < 0.5 uses the 0.5 values (conservative). Compare with the licensed IS 3370-4 tables. */
  var PL_R = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
  var PL = {
    free: {
      tri: { Mx_base: [0.0112, 0.0224, 0.0348, 0.0475, 0.0603, 0.0732, 0.0858, 0.1087, 0.1267],
        Mx_span: [0.0032, 0.0067, 0.0104, 0.0135, 0.0154, 0.0163, 0.0161, 0.0140, 0.0108],
        My_corner: [0.0123, 0.0215, 0.0297, 0.0372, 0.0445, 0.0553, 0.0671, 0.0846, 0.0950],
        My_span: [0.0059, 0.0099, 0.0132, 0.0165, 0.0211, 0.0252, 0.0276, 0.0278, 0.0242],
        xc: [0.69, 0.59, 0.53, 0.44, 0.34, 0.09, 0.06, 0.06, 0.03],
        V: [0.1728, 0.2476, 0.3059, 0.3514, 0.3879, 0.4176, 0.4414, 0.4735, 0.4893] },
      uni: { Mx_base: [0.0140, 0.0317, 0.0562, 0.0871, 0.1235, 0.1638, 0.2058, 0.2856, 0.3510],
        Mx_span: [0.0037, 0.0084, 0.0142, 0.0201, 0.0246, 0.0272, 0.0277, 0.0243, 0.0180],
        My_corner: [0.0215, 0.0494, 0.0889, 0.1369, 0.1893, 0.2406, 0.2866, 0.3561, 0.3970],
        My_span: [0.0109, 0.0247, 0.0432, 0.0631, 0.0809, 0.0942, 0.1018, 0.1019, 0.0889],
        xc: [0.03, 0.06, 0.06, 0.06, 0.03, 0.03, 0.03, 0.03, 0.03],
        V: [0.2037, 0.3193, 0.4331, 0.5433, 0.6473, 0.7415, 0.8222, 0.9373, 0.9972] }
    },
    hinged: {
      tri: { Mx_base: [0.0112, 0.0225, 0.0345, 0.0451, 0.0532, 0.0586, 0.0620, 0.0653, 0.0663],
        Mx_span: [0.0032, 0.0068, 0.0114, 0.0164, 0.0208, 0.0240, 0.0263, 0.0286, 0.0295],
        My_corner: [0.0123, 0.0215, 0.0288, 0.0333, 0.0354, 0.0362, 0.0365, 0.0366, 0.0366],
        My_span: [0.0059, 0.0098, 0.0122, 0.0128, 0.0121, 0.0109, 0.0100, 0.0095, 0.0095],
        xc: [0.69, 0.59, 0.56, 0.53, 0.50, 0.50, 0.50, 0.50, 0.50],
        V: [0.1728, 0.2479, 0.3057, 0.3451, 0.3685, 0.3806, 0.3860, 0.3880, 0.3868] },
      uni: { Mx_base: [0.0140, 0.0319, 0.0548, 0.0769, 0.0944, 0.1065, 0.1143, 0.1218, 0.1242],
        Mx_span: [0.0044, 0.0108, 0.0225, 0.0357, 0.0470, 0.0553, 0.0611, 0.0671, 0.0694],
        My_corner: [0.0208, 0.0425, 0.0610, 0.0723, 0.0778, 0.0800, 0.0808, 0.0810, 0.0810],
        My_span: [0.0104, 0.0201, 0.0267, 0.0286, 0.0274, 0.0248, 0.0228, 0.0216, 0.0215],
        xc: [0.47, 0.44, 0.44, 0.44, 0.44, 0.41, 0.41, 0.41, 0.41],
        V: [0.2038, 0.3218, 0.4323, 0.5167, 0.5696, 0.5981, 0.6112, 0.6169, 0.6145] }
    }
  };
  M.PL_R = PL_R; M.PL = PL;
  M.plate_coef = function (top, load, key, ratio) { return C.interp(clamp(ratio, PL_R[0], PL_R[PL_R.length - 1]), PL_R, PL[top][load][key]); };
  /* clamped rectangular plate, uniform load: moment at the middle of the long edge / (q lx²) vs ly/lx (Timoshenko, ν = 0.3) */
  var CL_R = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0], CL_M = [0.0513, 0.0581, 0.0639, 0.0687, 0.0726, 0.0757, 0.0780, 0.0799, 0.0812, 0.0822, 0.0829];
  M.clamped_edge = function (r) { return r > 2 ? 1 / 12 : C.interp(r, CL_R, CL_M); };

  /* =========================================================================== 1. UNDERGROUND SUMP */
  var US_SIZE = ["From capacity (kL) and water depth", "Given inside L × B × water depth"];
  var US_ROOF = ["Covered – RCC roof slab with manhole(s)", "Open top (no roof slab)"];

  function usGeom(c, inp) {
    var h = num(inp.depth), cap = num(inp.capacity), L, B, byCap = String(inp.size_mode).indexOf("From capacity") === 0;
    c.section("Capacity & geometry");
    if (byCap) {
      c.let("Storage required", "V", cap, "m³ (kL)", "", "pump-house / UG sump: ≥ 1 day demand (CPHEEO) – as given");
      var A = c.calc("Plan area required at the water depth", "A", "V/h", "m²", "", { V: cap, h: h });
      var ratio = clamp(num(inp.ratio), 1.0, 3.0);
      B = Math.max(1.5, ceil_to(Math.sqrt(A / ratio), 0.05));
      L = Math.max(B, ceil_to(A / B, 0.05));
      c.let("Inside plan L × B (L ≈ " + G(ratio) + " B, rounded to 50 mm)", "L × B", F(L, ".2f") + " × " + F(B, ".2f"), "m");
    } else {
      L = Math.max(num(inp.L), num(inp.B)); B = Math.min(num(inp.L), num(inp.B));
      c.let("Inside plan L × B (given)", "L × B", F(L, ".2f") + " × " + F(B, ".2f"), "m");
    }
    c.let("Water depth (floor → top water level)", "h", h, "m");
    var Vp = c.calc("Storage provided (to TWL)", "Vp", "L*B*h", "m³", "", { L: L, B: B, h: h });
    if (byCap) c.check("Storage provided ≥ required", Vp, cap, { unit: "m³", clause: "", mode: ">=" });
    return { L: L, B: B, h: h, Vp: Vp, cap: byCap ? cap : Vp };
  }
  M.usGeom = usGeom;

  /* one face of a 1 m wall / slab strip: bending (+ direct tension) – steel, bars, crack width (via modules_extra.designStrip) */
  function stripFace(c, face, Ms, Ts, D, cover, fck, fy, climit, given, am, Vs, dias) {
    var Mu = 1.5 * Ms, o = { Ms: Ms, climit: climit, given: given, rule: DT() ? { member: "water", role: "main" } : null, Amin: am, dias: dias || [10, 12, 16, 20, 25] };
    if (Vs > 0) o.Vu = 1.5 * Vs;
    if (Ts > 0) {
      var Tu = 1.5 * Ts, d = D - cover - (given ? given[0] : 12) / 2;
      c.let("Direct tension acting with this moment (service)", "T", R(Ts, 3), "kN/m", "", face + ": reaction of the adjacent walls");
      var Mu1 = c.calc("Moment about the tension steel less tension × lever (" + face + ")", "Mu1", "max(Mu - Tu*(d - D/2)/1000, 0)", "kN·m/m",
        "SP 16 / IS 3370-2 (bending + direct tension, large eccentricity)", { Mu: R(Mu, 4), Tu: R(Tu, 3), d: R(d, 1), D: D });
      var Ast = c.calc("Steel for bending + direct tension (" + face + ")", "As,MT",
        "0.5*fck/fy*(1 - sqrt(max(1 - 4.6*Mu1*1e6/(fck*1000*d**2), 0)))*1000*d + Tu*1000/(0.87*fy)", "mm²/m", "IS 456 Annex G-1.1 + T/(0.87 fy)",
        { fck: fck, fy: fy, Mu1: R(Mu1, 4), d: R(d, 1), Tu: R(Tu, 3) });
      if (Ast > am.As) am = { As: Ast, label: "Steel for bending + direct tension, adopted", clause: "IS 3370-2 / IS 456", text: "" };
      o.Amin = am;
      o.Ms = c.calc("Equivalent service moment for crack width (bending + tension)", "Ms,eq", "Ms + Ts*(D/2 - 0.1*d)/1000", "kN·m/m",
        "IS 3370-2 Annex B / IS 456 Annex F", "steel stress of M + T taken with lever x/3 ≈ 0.1 d (approx.)", { Ms: R(Ms, 4), Ts: R(Ts, 3), D: D, d: R(d, 1) });
    }
    return XT().designStrip(c, Mu, D, cover, fck, fy, face, o);
  }

  /* lateral pressure (kN/m²) at depth z below GL on the outside: earth at rest + surcharge + groundwater */
  function pExt(z, g) {
    if (z <= 0) return g.K0 * g.q;
    var zw = g.zw, above = Math.min(z, zw), below = Math.max(z - zw, 0);
    return g.K0 * g.q + g.K0 * g.gam * above + (g.K0 * (g.gam - 10) + 10) * below;
  }

  function usAnalyse(c, inp, mode, gm, lv, t, cover, given) {
    var fck = num(inp.fck), fy = num(inp.fy), dt = DT(), climit = num(inp.crack) || 0.2;
    var covered = String(inp.roof).indexOf("Covered") === 0, top = covered ? "hinged" : "free";
    var L = gm.L, B = gm.B, h = gm.h, tw = t.tw / 1000, tb = t.tb / 1000, tr = covered ? t.tr / 1000 : 0, pr = t.proj;
    var H = lv.H, gam = num(inp.gamma), phi = num(inp.phi), q = num(inp.surcharge), ll = num(inp.ll);
    var out = { covered: covered, top: top, t: t, climit: climit };
    var Lc = L + tw, Bc = B + tw;
    // ------------------------------------------------------------------ levels & groundwater
    c.section("Levels & groundwater");
    var Hs = lv.Hs;
    c.let("Clear wall height (floor → " + (covered ? "roof soffit" : "wall top") + ")", "H", R(H, 3), "m", "", "water depth " + F(h, ".2f") + " + free board " + F(num(inp.freeboard), ".2f"));
    c.let("Underside of base below GL", "Hs", R(Hs, 3), "m", "", "top of " + (covered ? "roof" : "wall") + " at +" + F(num(inp.top_gl), ".2f") + " m");
    var zw = lv.zw;
    var hw = c.calc("Groundwater head above underside of base", "hw", "max(Hs - zw, 0)", "m", "IS 3370-1 (uplift on empty tank)", { Hs: R(Hs, 3), zw: zw });
    out.hw = hw;
    var K0 = c.calc("Earth pressure coefficient at rest (walls restrained)", "K0", "1 - sin(radians(phi))", "", "Jaky; IS 3370 / IS 456 practice", { phi: phi });
    var g = { K0: K0, q: q, gam: gam, zw: zw };
    // ------------------------------------------------------------------ wall loads
    c.section("Walls – loads & moments (service)");
    var z1 = Math.max(-lv.soffit, 0), z2 = Math.max(-lv.floor, 0);
    var pw = c.calc("Case (a) tank full, no backfill: water pressure at the base", "pa", "10*h", "kN/m²", "IS 3370-1 – water test before backfilling",
      "taken as a triangle over the full wall height (water to the top) – conservative", { h: h });
    var pTop = c.calc("Case (b) tank empty, backfilled: pressure at wall top", "pt", "pv", "kN/m²", "earth at rest + surcharge + groundwater",
      "depth " + F(z1, ".2f") + " m below GL (surcharge from a vehicle / stack beside the sump)", { pv: R(pExt(z1, g), 3) });
    var pBot = c.calc("Case (b): pressure at wall base", "pb", "pv", "kN/m²", "K0·q + K0·γ·z + (K0·γ' + γw)·(z − zw)",
      "depth " + F(z2, ".2f") + " m; groundwater " + F(zw, ".2f") + " m below GL; linearised between top & base (chord – conservative)", { pv: R(pExt(z2, g), 3) });
    var pu = pTop, ptri = Math.max(pBot - pTop, 0);
    out.pa = pw; out.pTop = pTop; out.pBot = pBot;
    var ratioMax = Math.max(L, B) / H, approx = ratioMax > 2;
    var walls = [{ n: "long wall", b: L, o: B }, { n: "short wall", b: B, o: L }];
    if (!approx) {
      c.info("Method", "Plate analysis – IS 3370-4-type moment coefficients for a wall panel with the base and both vertical edges fixed, top " +
        (covered ? "hinged (roof slab)" : "free") + "; coefficients interpolated in b/a (table on the drawing). L/H = " + F(ratioMax, ".2f") + " ≤ 2.",
        "IS 3370-4:2021 (Tables for rectangular tanks – verify against your copy)");
      walls.forEach(function (w) {
        var r = w.b / H, pc = function (load, key) { return M.plate_coef(top, load, key, r); };
        var tag = " – " + w.n + " (b/a = " + F(r, ".2f") + ")";
        w.r = r;
        w.a = {
          Mxb: c.calc("Case (a) vertical moment at base" + tag, "Mx", "k*pa*H**2", "kN·m/m", "IS 3370-4 coefficient", { k: R(pc("tri", "Mx_base"), 4), pa: pw, H: R(H, 3) }),
          Mxs: c.calc("Case (a) vertical span moment" + tag, "Mx+", "k*pa*H**2", "kN·m/m", "IS 3370-4 coefficient", { k: R(pc("tri", "Mx_span"), 4), pa: pw, H: R(H, 3) }),
          Myc: c.calc("Case (a) horizontal moment at corner" + tag, "My", "k*pa*H**2", "kN·m/m", "IS 3370-4 coefficient", { k: R(pc("tri", "My_corner"), 4), pa: pw, H: R(H, 3) }),
          Mys: c.calc("Case (a) horizontal span moment" + tag, "My+", "k*pa*H**2", "kN·m/m", "IS 3370-4 coefficient", { k: R(pc("tri", "My_span"), 4), pa: pw, H: R(H, 3) }),
          V: pc("tri", "V") * pw * H, xc: pc("tri", "xc") };
        var e2 = function (key) { return { ku: R(pc("uni", key), 4), kt: R(pc("tri", key), 4), pu: pu, pt: R(ptri, 3), H: R(H, 3) }; };
        w.b_ = {
          Mxb: c.calc("Case (b) vertical moment at base" + tag, "Mx", "(ku*pu + kt*pt)*H**2", "kN·m/m", "IS 3370-4 (uniform + triangular parts)", e2("Mx_base")),
          Mxs: c.calc("Case (b) vertical span moment" + tag, "Mx+", "(ku*pu + kt*pt)*H**2", "kN·m/m", "IS 3370-4", e2("Mx_span")),
          Myc: c.calc("Case (b) horizontal moment at corner" + tag, "My", "(ku*pu + kt*pt)*H**2", "kN·m/m", "IS 3370-4", e2("My_corner")),
          Mys: c.calc("Case (b) horizontal span moment" + tag, "My+", "(ku*pu + kt*pt)*H**2", "kN·m/m", "IS 3370-4", e2("My_span")),
          V: (pc("uni", "V") * pu + pc("tri", "V") * ptri) * H };
      });
      // corner moment balance between the long & short walls (stiffness ∝ 1/length); a reduced corner moment is added to the span
      c.section("Walls – corner moment balance & direct tension");
      ["a", "b_"].forEach(function (k) {
        var Ml = walls[0][k].Myc, Ms_ = walls[1][k].Myc;
        var Mc = c.calc("Balanced corner moment, case (" + (k === "a" ? "a" : "b") + ")", "Mc", "(ML/L + MB/B)/(1/L + 1/B)", "kN·m/m",
          "moment distribution at the corner (PCA / IS 3370-4 practice)", { ML: R(Ml, 4), MB: R(Ms_, 4), L: R(Lc, 3), B: R(Bc, 3) });
        walls.forEach(function (w) {
          var red = Math.max(w[k].Myc - Mc, 0);
          w[k].MysB = w[k].Mys + red; w[k].MycB = Math.max(Mc, 0);
        });
      });
      walls.forEach(function (w) {
        var xl = Math.max(w.a.xc, 0.5);
        w.T = c.calc("Direct tension in the " + w.n + " (case a)", "T", "10*h*x*o/2", "kN/m", "IS 3370-4 practice",
          "half the water load on the adjacent wall at depth " + F(xl, ".2f") + " H (level of the max. corner moment, ≥ mid-height)", { h: h, x: xl, o: R(w.o + tw, 3) });
      });
    } else {
      /* L/H > 2: a wall with b/a > 2 acts as a vertical (propped) cantilever away from the corners – vertical moments of a 1 m strip; its corner
         zone keeps the plate corner moment (coefficient at min(b/a, 3) – the corner region is governed by ≈ 2a of wall). A wall with b/a ≤ 2 keeps
         all four plate coefficients. Direct tension: the adjacent wall delivers load horizontally only within ≈ H of each corner. */
      var h1 = Math.min(Math.max(H / 4, 1.0), H);
      c.info("Method", "L/H = " + F(ratioMax, ".2f") + " > 2: walls with b/a > 2 designed as vertical " + (covered ? "propped cantilevers (roof props the top)" : "cantilevers") +
        " with the IS 3370-4 corner moment (b/a ≤ 3) at the corners; walls with b/a ≤ 2 keep the plate coefficients; direct tension from the corner zones of the adjacent walls",
        "IS 3370 (approximate method) / IS 3370-4 / Reynolds' handbook");
      var kxb = covered ? 1 / 15 : 1 / 6, kxs = covered ? 0.0298 : 0, kub = covered ? 1 / 8 : 1 / 2, kus = covered ? 9 / 128 : 0, kvt = covered ? 0.4 : 0.5, kvu = covered ? 0.625 : 1.0;
      var fa = c.calc("Case (a) pressure for direct tension (depth H − h1, h1 = max(H/4, 1 m))", "pfa", "pa*(H - h1)/H", "kN/m²", "", { pa: pw, H: R(H, 3), h1: R(h1, 3) });
      walls.forEach(function (w) {
        var r = w.b / H, tag = " – " + w.n + " (b/a = " + F(r, ".2f") + ")", rc = Math.min(r, 3);
        var pc = function (load, key) { return M.plate_coef(top, load, key, r); };
        var e3 = function (key) { return { ku: R(pc("uni", key), 4), kt: R(pc("tri", key), 4), pu: pu, pt: R(ptri, 3), H: R(H, 3) }; };
        w.r = r;
        if (r <= 2) {
          w.a = { Mxb: c.calc("Case (a) vertical moment at base" + tag, "Mx", "k*pa*H**2", "kN·m/m", "IS 3370-4 coefficient", { k: R(pc("tri", "Mx_base"), 4), pa: pw, H: R(H, 3) }),
            Mxs: c.calc("Case (a) vertical span moment" + tag, "Mx+", "k*pa*H**2", "kN·m/m", "IS 3370-4 coefficient", { k: R(pc("tri", "Mx_span"), 4), pa: pw, H: R(H, 3) }),
            MycB: c.calc("Case (a) horizontal moment at corner" + tag, "My", "k*pa*H**2", "kN·m/m", "IS 3370-4 coefficient", { k: R(pc("tri", "My_corner"), 4), pa: pw, H: R(H, 3) }),
            MysB: c.calc("Case (a) horizontal span moment" + tag, "My+", "k*pa*H**2", "kN·m/m", "IS 3370-4 coefficient", { k: R(pc("tri", "My_span"), 4), pa: pw, H: R(H, 3) }),
            V: pc("tri", "V") * pw * H };
          w.b_ = { Mxb: c.calc("Case (b) vertical moment at base" + tag, "Mx", "(ku*pu + kt*pt)*H**2", "kN·m/m", "IS 3370-4", e3("Mx_base")),
            Mxs: c.calc("Case (b) vertical span moment" + tag, "Mx+", "(ku*pu + kt*pt)*H**2", "kN·m/m", "IS 3370-4", e3("Mx_span")),
            MycB: c.calc("Case (b) horizontal moment at corner" + tag, "My", "(ku*pu + kt*pt)*H**2", "kN·m/m", "IS 3370-4", e3("My_corner")),
            MysB: c.calc("Case (b) horizontal span moment" + tag, "My+", "(ku*pu + kt*pt)*H**2", "kN·m/m", "IS 3370-4", e3("My_span")),
            V: (pc("uni", "V") * pu + pc("tri", "V") * ptri) * H };
        } else {
          var kc = function (load) { return R(M.plate_coef(top, load, "My_corner", rc), 4); };
          w.a = { Mxb: c.calc("Case (a) vertical moment at base" + tag, "Mx", "k*pa*H**2", "kN·m/m", covered ? "propped cantilever, triangular load: pH²/15" : "cantilever, triangular load: pH²/6", { k: R(kxb, 4), pa: pw, H: R(H, 3) }),
            Mxs: kxs * pw * H * H,
            MycB: c.calc("Case (a) horizontal moment at corner" + tag, "My", "k*pa*H**2", "kN·m/m", "IS 3370-4 corner coefficient at b/a = " + F(rc, ".2f"), { k: kc("tri"), pa: pw, H: R(H, 3) }),
            MysB: 0, V: kvt * pw * H };
          w.b_ = { Mxb: c.calc("Case (b) vertical moment at base" + tag, "Mx", "(ku*pu + kt*pt)*H**2", "kN·m/m", covered ? "propped cantilever" : "cantilever", { ku: R(kub, 4), kt: R(kxb, 4), pu: pu, pt: R(ptri, 3), H: R(H, 3) }),
            Mxs: (kus * pu + kxs * ptri) * H * H,
            MycB: c.calc("Case (b) horizontal moment at corner" + tag, "My", "(ku*pu + kt*pt)*H**2", "kN·m/m", "IS 3370-4 corner coefficients at b/a = " + F(rc, ".2f"), { ku: kc("uni"), kt: kc("tri"), pu: pu, pt: R(ptri, 3), H: R(H, 3) }),
            MysB: 0, V: (kvu * pu + kvt * ptri) * H };
          c.info("Horizontal span moment" + tag, "cantilever action away from the corners – horizontal span steel = minimum steel (+ direct tension)", "IS 3370 practice");
        }
      });
      ["a", "b_"].forEach(function (k) { var Mc = Math.max(walls[0][k].MycB, walls[1][k].MycB); walls.forEach(function (w) { w[k].MycB = Mc; }); });
      c.info("Corner moment", "larger of the two walls' corner moments used at the common corner (conservative)", "");
      walls.forEach(function (w) {
        w.T = c.calc("Direct tension in the " + w.n + " (case a)", "T", "pf*min(o, 2*H)/2", "kN/m", "IS 3370 practice",
          "adjacent wall carries load horizontally only within ≈ H of each corner", { pf: fa, o: R(w.o + tw, 3), H: R(H, 3) });
      });
    }
    out.walls = walls; out.approx = approx;
    // ------------------------------------------------------------------ wall design
    c.section("Walls – reinforcement & crack width (IS 3370-2)");
    c.let("Wall thickness", "tw", t.tw, "mm", "", "same for all four walls");
    var wm = dt ? dt.water_min_steel(t.tw) : { As: RC().min_steel_water(t.tw) / 100 * 1000 * t.tw / 2, text: "", clause: "IS 3370-2 cl 8.1" };
    var am = function () { return { As: wm.As, label: "Minimum steel per face (IS 3370-2)", clause: wm.clause, text: wm.text }; };
    var mx = function (f) { return Math.max.apply(null, walls.map(f)); };
    var Min = mx(function (w) { return Math.max(w.a.Mxb, w.b_.Mxs); }), Mout = mx(function (w) { return Math.max(w.a.Mxs, w.b_.Mxb); });
    var Va = mx(function (w) { return w.a.V; }), Vb = mx(function (w) { return w.b_.V; });
    var gv = given ? given.wv : null, gh = given ? given.wh : null;
    out.wvi = stripFace(c, "wall vertical, inner face", Min, 0, t.tw, cover, fck, fy, climit, gv, am(), Va, [10, 12, 16, 20, 25]);
    out.wvo = stripFace(c, "wall vertical, outer face", Mout, 0, t.tw, cover, fck, fy, climit, gv, am(), Vb, [10, 12, 16, 20, 25]);
    var wgov = Va >= Vb ? out.wvi : out.wvo;
    RC().shear(c, 1.5 * Math.max(Va, Vb), 1000, wgov.d, 100 * wgov.Ast_prov / (1000 * wgov.d), fck, fy, "slab", { D: t.tw, tag: "(wall base, " + (Va >= Vb ? "tank full" : "tank empty") + ")" });
    // horizontal: inner face – case (a) corner + tension / case (b) span ; outer face – case (a) span + tension / case (b) corner
    var hiA = walls.map(function (w) { return { M: w.a.MycB, T: w.T }; }).sort(function (x, y) { return y.M - x.M; })[0];
    var hoA = walls.map(function (w) { return { M: w.a.MysB, T: w.T }; }).sort(function (x, y) { return y.M - x.M; })[0];
    var hiB = mx(function (w) { return w.b_.MysB; }), hoB = mx(function (w) { return w.b_.MycB; });
    c.let("Horizontal moments used (inner: corner (a) / span (b); outer: span (a) / corner (b))", "My", F(hiA.M, ".2f") + " / " + F(hiB, ".2f") + "; " + F(hoA.M, ".2f") + " / " + F(hoB, ".2f"), "kN·m/m");
    var hiUseA = 1.5 * hiA.M + 1.5 * hiA.T * 0.1 >= 1.5 * hiB, hoUseA = 1.5 * hoA.M + 1.5 * hoA.T * 0.1 >= 1.5 * hoB;
    out.whi = stripFace(c, "wall horizontal, inner face", hiUseA ? hiA.M : hiB, hiUseA ? hiA.T : 0, t.tw, cover + 12, fck, fy, climit, gh, am(), 0, [10, 12, 16, 20]);
    out.who = stripFace(c, "wall horizontal, outer face", hoUseA ? hoA.M : hoB, hoUseA ? hoA.T : 0, t.tw, cover + 12, fck, fy, climit, gh, am(), 0, [10, 12, 16, 20]);
    var Tmax = mx(function (w) { return w.T; });
    var Aring = (Math.min(out.whi.Ast_prov, out.who.Ast_prov) * 2);
    c.check("Direct tension alone: steel stress (both faces) ≤ 130 N/mm² (service)", Tmax * 1000 / Math.max(Aring, 1), 130, { unit: "N/mm²", clause: "IS 3370-2:2009 Table 2 (WSM direct tension – verify)" });
    c.ok("Wall thickness ≥ 200 mm (two layers of steel, water-stop, compaction)", t.tw >= 200, { detail: G(t.tw) + " mm", clause: "IS 3370 / CPWD practice", warn_only: true });
    // ------------------------------------------------------------------ base slab
    c.section("Base slab – loads, flotation & bearing");
    var Lo = L + 2 * tw, Bo = B + 2 * tw, Lb = Lo + 2 * pr, Bb = Bo + 2 * pr, Ab = Lb * Bb;
    c.let("Base slab (incl. projection " + F(pr, ".2f") + " m beyond the walls)", "Lb × Bb × tb", F(Lb, ".2f") + " × " + F(Bb, ".2f") + " × " + F(tb, ".3f"), "m");
    var Ww = c.calc("Weight of walls", "Ww", "25*2*(L + B + 2*tw)*tw*Hw", "kN", "", { L: L, B: B, tw: tw, Hw: R(H, 3) });
    var Wb = c.calc("Weight of base slab", "Wb", "25*Lb*Bb*tb", "kN", "", { Lb: R(Lb, 3), Bb: R(Bb, 3), tb: tb });
    var Wr = c.calc("Weight of roof slab (manholes ignored)", "Wr", "25*Lo*Bo*tr", "kN", "", { Lo: R(Lo, 3), Bo: R(Bo, 3), tr: tr });
    var dsoil = Math.max(Hs - tb, 0);
    var Wsl = c.calc("Soil on the base projections", "Ws", "g*(Lb*Bb - Lo*Bo)*ds", "kN", "vertical prism only (no wedge)", { g: gam, Lb: R(Lb, 3), Bb: R(Bb, 3), Lo: R(Lo, 3), Bo: R(Bo, 3), ds: R(dsoil, 3) });
    var W = c.calc("Self-weight resisting uplift (tank empty)", "W", "Ww + Wb + Wr + Ws", "kN", "", { Ww: R(Ww, 2), Wb: R(Wb, 2), Wr: R(Wr, 2), Ws: R(Wsl, 2) });
    out.W = W; out.Lb = Lb; out.Bb = Bb; out.Lo = Lo; out.Bo = Bo;
    if (hw > 0) {
      var U = c.calc("Uplift on the empty tank", "U", "10*hw*Lb*Bb", "kN", "IS 3370-1 / practice", { hw: R(hw, 3), Lb: R(Lb, 3), Bb: R(Bb, 3) });
      out.U = U;
      out.FoS = c.calc("Factor of safety against flotation", "FoS", "W/U", "", "IS 3370-1 (≥ 1.2, live loads & water ignored)", { W: R(W, 2), U: R(U, 2) });
      c.check("Flotation: 1.2 × uplift ≤ self-weight (tank empty)", 1.2 * U, W, { unit: "kN", clause: "IS 3370-1 practice – FoS ≥ 1.2", note: "widen the base projection / thicken the base" });
    } else { out.U = 0; out.FoS = null; c.info("Uplift", "Groundwater below the base – no flotation check (confirm the monsoon / pit-flooding level)", "IS 3370-1"); }
    var LLr = covered ? ll * Lo * Bo : 0, Wwat = 10 * L * B * h;
    var qb = c.calc("Base pressure, tank full (service, gross)", "q", "(W + Wwat + LLr)/(Lb*Bb)", "kN/m²", "", { W: R(W, 2), Wwat: R(Wwat, 2), LLr: R(LLr, 2), Lb: R(Lb, 3), Bb: R(Bb, 3) });
    var qnet = c.calc("Net base pressure (overburden removed by the excavation)", "qnet", "q - g*Hs", "kN/m²", "IS 1904 / IS 6403 (net SBC)", { q: qb, g: gam, Hs: R(Hs, 3) });
    c.check("Base pressure: net pressure ≤ SBC (net safe bearing capacity)", qnet, num(inp.sbc), { unit: "kN/m²", clause: "IS 1904 / soil report – SBC taken as net" });
    out.qb = qb;
    c.section("Base slab – reinforcement");
    var qn = c.calc("Net upward pressure on the base slab panel (tank empty)", "qn", "max((W + LLr)/(Lb*Bb) - 25*tb, 10*hw - 25*tb, 0)", "kN/m²",
      "rigid base: reaction of walls + roof spread uniformly, or groundwater uplift, less slab weight", { W: R(W, 2), LLr: R(LLr, 2), Lb: R(Lb, 3), Bb: R(Bb, 3), tb: tb, hw: R(hw, 3) });
    var r = Lc / Bc, two = r <= 2;
    var ax = two ? Math.pow(r, 4) / (8 * (1 + Math.pow(r, 4))) : 0.125, bx = M.clamped_edge(r);
    var Ms1 = c.calc("Base span moment (short span, simply supported two-way – Rankine-Grashoff)", "Mt", "ax*qn*lx**2", "kN·m/m", two ? "IS 456 Annex D-2" : "one-way (ly/lx > 2)", { ax: R(ax, 4), qn: qn, lx: R(Bc, 3) });
    var Ms2 = c.calc("Base edge moment at the walls (fixed edges)", "Mb", "bx*qn*lx**2", "kN·m/m", "clamped plate, Timoshenko (ν = 0.3)", { bx: R(bx, 4), qn: qn, lx: R(Bc, 3) });
    var Mwa = mx(function (w) { return w.a.Mxb; }), Mwb = mx(function (w) { return w.b_.Mxb; });
    var qp = (W + LLr) / Ab - 25 * tb - gam * dsoil, Mpr = Math.abs(qp) * pr * pr / 2;
    if (pr > 0) c.calc("Projection: cantilever moment (net " + (qp >= 0 ? "upward" : "downward") + ")", "Mp", "abs(qp)*p**2/2", "kN·m/m", "", { qp: R(qp, 3), p: pr });
    var Mtop = Math.max(Ms1, Mwa, qp >= 0 ? Mpr : 0), Mbot = Math.max(Ms2, Mwb, qp < 0 ? Mpr : 0);
    c.let("Base design moments (service): top face / bottom face", "M", F(Mtop, ".2f") + " / " + F(Mbot, ".2f"), "kN·m/m", "",
      "top: panel span & tank-full wall moment; bottom: edge fixity & tank-empty wall moment");
    var bm = dt ? dt.water_min_steel(t.tb) : { As: RC().min_steel_water(t.tb) / 100 * 1000 * t.tb / 2, clause: "IS 3370-2 cl 8.1", text: "" };
    var gb = given ? given.base : null;
    out.bt = stripFace(c, "base, top face", Mtop, 0, t.tb, cover, fck, fy, climit, gb, { As: bm.As, label: "Minimum steel per face (IS 3370-2)", clause: bm.clause, text: bm.text }, qn * Math.max(Bc / 2 - tw / 2 - (t.tb - cover - 6) / 1000, 0), [10, 12, 16, 20, 25]);
    out.bb = stripFace(c, "base, bottom face", Mbot, 0, t.tb, cover + 5, fck, fy, climit, gb, { As: bm.As, label: "Minimum steel per face (IS 3370-2)", clause: bm.clause, text: bm.text }, 0, [10, 12, 16, 20, 25]);
    var Vbs = 1.5 * qn * Math.max(Bc / 2 - tw / 2 - out.bt.d / 1000, 0);
    RC().shear(c, Vbs, 1000, out.bt.d, 100 * out.bt.Ast_prov / (1000 * out.bt.d), fck, fy, "slab", { D: t.tb, tag: "(base slab at d from wall face)" });
    c.ok("Base thickness ≥ wall thickness", t.tb >= t.tw, { detail: G(t.tb) + " ≥ " + G(t.tw) + " mm", clause: "Practice (wall bars anchored in the base)", warn_only: true });
    // ------------------------------------------------------------------ roof slab
    out.rx = null; out.ry = null;
    if (covered) {
      c.section("Roof slab (two-way, simply supported on walls)");
      var lx = Bc, ly = Lc;
      if (lx > 6.0) {   // wide sump: roof on an internal beam / column grid (panels ≤ 5 m) – panels designed here, beams & columns separately
        var nx = Math.ceil(Bc / 5 - 1e-9), ny = Math.ceil(Lc / 5 - 1e-9), px = Bc / nx, py = Lc / ny;
        lx = Math.min(px, py); ly = Math.max(px, py);
        c.warn("Roof on beams & columns", "Short span " + F(Bc, ".2f") + " m > 6 m: roof slab taken in panels " + F(lx, ".2f") + " × " + F(ly, ".2f") + " m on a " + nx + " × " + ny +
          " grid of RCC beams & columns inside the sump (design them with the beam / column modules; columns need water-stops at the base)", "Practice");
        out.grid = [nx, ny];
      }
      var rr = ly / lx, twoR = rr <= 2;
      var wr = c.calc("Load on roof slab", "w", "25*tr + 1.0 + ll", "kN/m²", "IS 875-1/2", "self + 1.0 finishes / screed + live " + G(ll) + " kN/m² (wheel loads → drain-cover module)", { tr: tr, ll: ll });
      var axr = twoR ? Math.pow(rr, 4) / (8 * (1 + Math.pow(rr, 4))) : 0.125, ayr = twoR ? rr * rr / (8 * (1 + Math.pow(rr, 4))) : 0;
      var Mxr = c.calc("Short-span moment", "Mx", "ax*w*lx**2", "kN·m/m", twoR ? "IS 456 Annex D-2 (corners not held down)" : "one-way", { ax: R(axr, 4), w: wr, lx: R(lx, 3) });
      var Myr = c.calc("Long-span moment", "My", "ay*w*lx**2", "kN·m/m", twoR ? "IS 456 Annex D-2" : "distribution steel", { ay: R(ayr, 4), w: wr, lx: R(lx, 3) });
      var gr = given ? given.roof : null, crc = Math.max(cover - 5, 30);
      var amr = { As: 0.0012 * 1000 * t.tr, label: "Minimum steel (0.12 %)", clause: "IS 456 cl 26.5.2.1", text: "" };
      var climR = Math.max(climit, 0.2);
      c.let("Crack-width limit, roof soffit (not in contact with the liquid)", "wlim", climR, "mm", "IS 3370-2 cl 4.1 (0.2 mm)");
      out.rx = XT().designStrip(c, 1.5 * Mxr, t.tr, crc, fck, fy, "roof, short span bottom", { Ms: Mxr, climit: climR, given: gr, rule: dt ? { member: "slab", role: "main" } : null,
        Amin: amr, Vu: 1.5 * wr * lx / 2, dias: [8, 10, 12, 16] });
      var dy = out.rx.d - out.rx.dia;
      var fyr = RC().flexure(c, 1.5 * Myr, 1000, dy, fck, fy, "slab", t.tr, { tag: "(roof, long span)" });
      out.ry = XT().stripBars(c, Math.max(fyr.Ast, amr.As), "slab", twoR ? "main" : "dist", dy, t.tr, gr, "roof, long span bottom", { dias: [8, 10, 12], rule: { main_dia: out.rx.dia } });
      RC().shear(c, 1.5 * wr * Math.max(lx / 2 - out.rx.d / 1000, 0), 1000, out.rx.d, 100 * out.rx.Ast_prov / (1000 * out.rx.d), fck, fy, "slab", { D: t.tr, tag: "(roof slab)" });
      RC().deflection(c, lx * 1000, out.rx.d, "simply supported", fy, out.rx.req, out.rx.Ast_prov, 1000, { tag: "(roof slab)" });
      c.info("Manhole openings", Math.max(1, Math.trunc(num(inp.manholes))) + " no. 600 × 600 mm clear, trimmed with 2-12Ø bars on each side extending Ld beyond the corners; raised kerb 150 mm against surface water", "IS 456 cl 26.5.2 / SP 34");
      out.wr = wr;
    }
    return out;
  }
  M.usAnalyse = usAnalyse;

  function usLevels(inp, gm, t, covered) {
    var lv = { H: gm.h + num(inp.freeboard) }, topL = num(inp.top_gl);
    lv.top = topL; lv.soffit = topL - (covered ? t.tr / 1000 : 0); lv.floor = lv.soffit - lv.H; lv.twl = lv.floor + gm.h; lv.under = lv.floor - t.tb / 1000;
    lv.Hs = -lv.under;
    lv.zw = isMine() ? 0 : num(inp.gwt);
    return lv;
  }

  function run_sump(inp, mode) {
    var c = new C.Calc("Underground RCC sump / water tank (IS 3370)");
    var fy = num(inp.fy), fck = num(inp.fck), dt = DT();
    var covered = String(inp.roof).indexOf("Covered") === 0;
    c.section("Materials & durability");
    if (mode !== "check" && fck < 30) { c.info("Concrete grade adopted", "M" + G(fck) + " raised to M30 – minimum for liquid-retaining RCC", "IS 3370-1:2009 cl 6 / Table (verify)"); fck = 30; inp = Object.assign({}, inp, { fck: 30 }); }
    c.check("Concrete grade ≥ M30 (liquid-retaining RCC)", fck, 30, { unit: "N/mm²", clause: "IS 3370-1:2009 (min. M30 for RCC – verify clause)", mode: ">=" });
    var cover = num(inp.cover), creq = Math.max(45, RC().required_cover(inp.exposure, "beam"));
    if (mode !== "check" && cover < creq) { c.info("Cover adopted", G(cover) + " mm raised to " + G(creq) + " mm (IS 3370-2 min. 45 mm; " + inp.exposure + " exposure)", "IS 3370-2 / IS 456 Table 16"); cover = creq; }
    c.check("Nominal cover ≥ 45 mm (liquid face & earth face)", cover, 45, { unit: "mm", clause: "IS 3370-2:2009 cl 7.1 (verify)", mode: ">=" });
    RC().cover_check(c, inp.exposure, cover, fck, "beam");
    if (dt) dt.site_checks(c, "water", fck, cover);
    var climit = num(inp.crack) || 0.2;
    c.let("Crack-width limit", "wlim", climit, "mm", "IS 3370-2:2009 cl 4.1 / Table 1 (0.2 mm; 0.1 mm for aggressive environment – verify)");
    if (isMine()) c.info("Groundwater – mining area", "Monsoon / pit-flooding: groundwater taken at ground level (GL) for wall pressure and flotation, whatever the input " + F(num(inp.gwt), ".2f") + " m", "Mine practice / IS 3370-1");
    var gm = usGeom(c, inp);
    var H0 = gm.h + num(inp.freeboard);
    var thumbT = { tw: Math.max(200, ceil_to(H0 * 1000 / 12 + 50, 25)), tb: 0, tr: Math.max(150, ceil_to((gm.B + 0.3) * 1000 / 30, 10)), proj: 0.3 };
    thumbT.tb = Math.max(250, thumbT.tw + 50);
    var t, given = null;
    if (mode === "check") {
      t = { tw: num(inp.tw_chk), tb: num(inp.tb_chk), tr: num(inp.tr_chk), proj: num(inp.proj_chk) };
      given = { wv: [num(inp.wv_dia), num(inp.wv_s)], wh: [num(inp.wh_dia), num(inp.wh_s)], base: [num(inp.base_dia), num(inp.base_s)], roof: [num(inp.roof_dia), num(inp.roof_s)] };
    } else if (mode === "thumb") {
      t = Object.assign({}, thumbT);
      c.info("Thumb-rule sizes", "wall ≈ H/12 + 50 (≥ 200), base = wall + 50 (≥ 250), roof ≈ span/30 (≥ 150) mm, base projection 300 mm; then code check", "IS 3370 practice");
    } else {
      t = { tw: 200, tb: 250, tr: 150, proj: 0.15 };
      for (var it = 0; it < 120; it++) {
        var sc = new C.Calc("s"), lv0 = usLevels(inp, gm, t, covered);
        var o0 = usAnalyse(sc, inp, mode, gm, lv0, t, cover, null);
        var f = sc.failures.map(function (s) { return s.section + " | " + s.label; }), ch = false;
        var pct = function (b) { return 100 * b.Ast_prov / (1000 * b.d); };
        if (!f.length) {   // economy: thicken a member whose steel exceeds 0.8 % of b·d on a face
          if (Math.max(pct(o0.wvi), pct(o0.wvo), pct(o0.whi), pct(o0.who)) > 0.8 && t.tw < 600) { t.tw += 25; ch = true; }
          if (Math.max(pct(o0.bt), pct(o0.bb)) > 0.8 && t.tb < 1200) { t.tb += 25; ch = true; }
          if (ch) { if (t.tb < t.tw) t.tb = t.tw; continue; }
        }
        if (f.some(function (x) { return /^Walls/.test(x); }) && t.tw < 800) { t.tw += 25; ch = true; }
        if (f.some(function (x) { return /^Base slab – reinforcement/.test(x); }) && t.tb < 1500) { t.tb += 25; ch = true; }
        if (f.some(function (x) { return /Flotation/.test(x); })) { if (t.proj < 1.5 - 1e-9) t.proj = R(t.proj + 0.1, 2); else t.tb += 50; ch = true; }
        if (f.some(function (x) { return /Base pressure/.test(x); }) && t.proj < 1.5 - 1e-9) { t.proj = R(t.proj + 0.1, 2); ch = true; }
        if (f.some(function (x) { return /^Roof slab/.test(x); }) && t.tr < 400) { t.tr += 10; ch = true; }
        if (t.tb < t.tw) { t.tb = t.tw; ch = true; }
        if (!ch) break;
      }
    }
    var lv = usLevels(inp, gm, t, covered);
    if (lv.floor > -0.3) c.warn("Shallow sump", "Floor only " + F(-lv.floor, ".2f") + " m below GL – check the levels (top above GL " + F(num(inp.top_gl), ".2f") + " m)", "");
    var o = usAnalyse(c, inp, mode, gm, lv, t, cover, given);
    // thumbs & missing
    c.thumb("Wall thickness", thumbT.tw, t.tw, "mm", "H/12 + 50 (≥ 200)", "IS 3370 practice");
    c.thumb("Base slab thickness", thumbT.tb, t.tb, "mm", "wall + 50 (≥ 250)", "Practice");
    if (covered) c.thumb("Roof slab thickness", thumbT.tr, t.tr, "mm", "short span / 30 (≥ 150)", "Practice");
    c.thumb("Steel in sump", 110, 0, "kg/m³", "≈ 100–140 kg/m³ of RCC", "Estimator practice");
    c.miss("Water-tightness test before backfilling: fill in stages, 7 days absorption, then drop ≤ 40 mm in 7 days (IS 3370-1 cl 10 – verify); repair & retest", "IS 3370-1 / IS 6494", "Important");
    c.miss("Pump suction / delivery pipes, puddle flanges cast in, overflow, wash-out & vent pipes with mosquito-proof cowls – detail with the pump-house layout", "IS 3370-1 / CPHEEO", "Important");
    c.miss("Construction joints only at kicker level (150 mm above base) with PVC water-stop; no vertical joint without a water-stop; joints ≤ 15 m apart", "IS 3370-1 cl 7 / IS 12200", "Important");
    c.miss("Deep excavation: shoring / benching & dewatering (well-point or sump pumping) – keep the water table below the formation until the tank weight resists uplift", "IS 3764 / practice", "Important");
    if (o.grid) c.miss("Roof beams (" + o.grid[0] + " × " + o.grid[1] + " grid) and internal columns on the base slab: design separately; add their concrete, steel & shuttering to the estimate", "IS 456 / IS 3370", "Critical");
    if (t.tb > 1000) c.miss("Base slab > 1.0 m only to resist uplift: compare with tension piles / ground anchors or a relief system (pressure-relief valves are not accepted for potable water)", "IS 3370-1 / practice", "Important");
    if (o.approx) c.miss("L/H > 2: approximate cantilever + horizontal-frame method used – for important tanks verify with a plate / FE analysis", "IS 3370-4", "Advisory");
    if (isMine()) c.miss("Mine water: test for sulphate / pH – use SRC / PSC cement, crystalline admixture and external bitumen coat; check blasting vibration on water-retaining joints", "IS 456 Table 4 / IS 3370-1", "Important");
    // ---------------------------------------------------------------- BBS
    var B_ = BB(), nos = Math.max(1, Math.trunc(num(inp.nos))), cv = cover, bbs = [], L = gm.L, B = gm.B, H = lv.H;
    var tw = t.tw / 1000, tb = t.tb / 1000, tr = covered ? t.tr / 1000 : 0;
    var Pin = 2 * (L + B) * 1000, Pout = 2 * (o.Lo + o.Bo) * 1000;
    var Hv = (tb + H + tr) * 1000 - 2 * cv;
    var vb = function (d) { return covered ? B_.shape(d, [B_.leg(d, B_.cfg.wall_leg_min), Hv, B_.leg(d, B_.cfg.wall_leg_min)], [90, 90], 0, "vertical bar, legs into base & roof") : B_.lbar(d, Hv, B_.leg(d, B_.cfg.wall_leg_min)); };
    var vshape = covered ? "U-type (90° legs into base & roof)" : "L (90° leg into base)";
    bbs.push(B_.row("Walls", "W1", o.wvi.dia, vshape, B_.count(Pin, o.wvi.spacing, 50) * nos, B_.stock(vb(o.wvi.dia), o.wvi.dia, fck, fy), "vertical, inner face @ " + G(o.wvi.spacing)));
    bbs.push(B_.row("Walls", "W2", o.wvo.dia, vshape, B_.count(Pout, o.wvo.spacing, 50) * nos, B_.stock(vb(o.wvo.dia), o.wvo.dia, fck, fy), "vertical, outer face @ " + G(o.wvo.spacing)));
    var nhi = B_.count(H * 1000, o.whi.spacing, 50), nho = B_.count(H * 1000, o.who.spacing, 50);
    var ringI = 2 * (L + B) * 1000 + 8 * (cv + o.wvi.dia) + B_.lap(o.whi.dia, fck, fy), ringO = 2 * (o.Lo + o.Bo) * 1000 - 8 * (cv + o.wvo.dia) + B_.lap(o.who.dia, fck, fy);
    bbs.push(B_.row("Walls", "W3", o.whi.dia, "horizontal ring, lapped", nhi * nos, B_.split(o.whi.dia, ringI, fck, fy), "horizontal, inner face @ " + G(o.whi.spacing)));
    bbs.push(B_.row("Walls", "W4", o.who.dia, "horizontal ring, lapped", nho * nos, B_.split(o.who.dia, ringO, fck, fy), "horizontal, outer face @ " + G(o.who.spacing)));
    var LdC = B_.Ld(o.whi.dia, fck, fy);
    bbs.push(B_.row("Walls", "W5", o.whi.dia, "L corner bar (inner face)", 4 * nhi * nos, B_.lbar(o.whi.dia, LdC + t.tw - cv, LdC + t.tw - cv), "at the 4 inside corners, legs Ld beyond the wall face"));
    var Lb = o.Lb * 1000, Bbm = o.Bb * 1000, legB = Math.min(B_.leg(o.bb.dia, B_.cfg.ftg_leg_min), t.tb - 2 * cv);
    bbs.push(B_.row("Base slab", "B1", o.bb.dia, "U (90° legs up)", B_.count(Bbm, o.bb.spacing, cv) * nos, B_.stock(B_.ubar(o.bb.dia, Lb - 2 * cv, legB), o.bb.dia, fck, fy), "bottom, along L @ " + G(o.bb.spacing)));
    bbs.push(B_.row("Base slab", "B2", o.bb.dia, "U (90° legs up)", B_.count(Lb, o.bb.spacing, cv) * nos, B_.stock(B_.ubar(o.bb.dia, Bbm - 2 * cv, legB), o.bb.dia, fck, fy), "bottom, along B @ " + G(o.bb.spacing)));
    bbs.push(B_.row("Base slab", "B3", o.bt.dia, "straight", B_.count(Bbm, o.bt.spacing, cv) * nos, B_.split(o.bt.dia, Lb - 2 * cv, fck, fy), "top, along L @ " + G(o.bt.spacing)));
    bbs.push(B_.row("Base slab", "B4", o.bt.dia, "straight", B_.count(Lb, o.bt.spacing, cv) * nos, B_.split(o.bt.dia, Bbm - 2 * cv, fck, fy), "top, along B @ " + G(o.bt.spacing)));
    var nMH = covered ? Math.max(1, Math.trunc(num(inp.manholes))) : 0;
    if (covered) {
      var Lo = o.Lo * 1000, Bo = o.Bo * 1000, crc = Math.max(cover - 5, 30);
      bbs.push(B_.row("Roof slab", "R1", o.rx.dia, "straight", B_.count(Lo, o.rx.spacing, crc) * nos, B_.split(o.rx.dia, Bo - 2 * crc, fck, fy), "bottom, short span (across B) @ " + G(o.rx.spacing)));
      bbs.push(B_.row("Roof slab", "R2", o.ry.dia, "straight", B_.count(Bo, o.ry.spacing, crc) * nos, B_.split(o.ry.dia, Lo - 2 * crc, fck, fy), "bottom, long span (along L) @ " + G(o.ry.spacing)));
      var nEdge = B_.count(2 * (Lo + Bo), 200, 50), le = 0.2 * gm.B * 1000 + t.tw - crc;
      bbs.push(B_.row("Roof slab", "R3", o.ry.dia, "L (90° leg down into wall)", nEdge * nos, B_.lbar(o.ry.dia, le, Math.min(B_.leg(o.ry.dia, B_.cfg.wall_leg_min), t.tw)), "top edge bars over the walls @ 200 (0.2 lx into the slab)"));
      bbs.push(B_.row("Roof slab", "R4", 12, "straight trimmer", 8 * nMH * nos, B_.straight(12, Math.min(600 + 2 * B_.Ld(12, fck, fy), Math.min(Lo, Bo) - 2 * crc)), "2-12Ø each side of each 600 × 600 manhole"));
    }
    // ---------------------------------------------------------------- quantities
    var work = 0.6, Hs = lv.Hs, qty = [], LbM = o.Lb, BbM = o.Bb, LoM = o.Lo, BoM = o.Bo;
    var dexc = Hs + 0.1;
    qty.push(Q("Earth work in excavation for foundations of underground sump, all kinds of soil (incl. 0.6 m working space; lift beyond 1.5 m extra)", "cum",
      [row("Sump pit", nos, LbM + 2 * work, BbM + 2 * work, dexc)], [CPWD(), "2.8.1"]));
    var zwIn = isMine() ? 0 : num(inp.gwt);
    if (zwIn < dexc) qty.push(Q("Dewatering during excavation, concreting & water test – pump-days (diesel / electric pump 5 HP)", "each",
      [row("Pump-days (assumed 30 per sump – adjust to site)", nos, 30)], null, 1800, "Non-SOR – GWT " + F(zwIn, ".2f") + " m above formation " + F(dexc, ".2f") + " m; rate by analysis"));
    qty.push(Q("PCC 1:4:8 levelling course below base slab", "cum", [row("Below base", nos, LbM + 0.2, BbM + 0.2, 0.1)], [CPWD(), "4.1.8"]));
    var rccRows = [row("Base slab", nos, LbM, BbM, tb), row("Walls (centre-line perimeter × t × H)", nos, 2 * (L + tw + B + tw), tw, H)];
    qty.push(Q("RCC M" + G(fck) + " in underground sump / water tank – base slab & walls (excl. steel & shuttering)", "cum", rccRows, null, CM().rcc_rate(fck)));
    if (covered) qty.push(Q("RCC M" + G(fck) + " in roof slab of underground sump / water tank (excl. steel & shuttering)", "cum",
      [row("Roof slab", nos, LoM, BoM, tr), row("Deduct manholes 600 × 600", nMH * nos, 0.6, 0.6, tr, true)], null, CM().rcc_rate(fck)));
    qty.push(Q("Centering & shuttering for foundations – base slab edges", "sqm", [row("Base edges", nos, 2 * (LbM + BbM), null, tb)], null, CM().RATE.shutter_found));
    qty.push(Q("Centering & shuttering for walls – underground sump (both faces)", "sqm", [row("Outer faces", nos, 2 * (LoM + BoM), null, H), row("Inner faces", nos, 2 * (L + B), null, H)], null, CM().RATE.shutter_wall));
    if (covered) qty.push(Q("Centering & shuttering for suspended slab – roof slab of sump (soffit & edges)", "sqm",
      [row("Soffit", nos, L, B), row("Edges", nos, 2 * (LoM + BoM), null, tr), row("Deduct manholes", nMH * nos, 0.6, 0.6, null, true)], null, CM().RATE.shutter_slab));
    qty.push(XT().steelQty(bbs, "UG sump", "Reinforcement TMT Fe" + G(fy) + " in underground sump / water tank – cutting, bending, placing"));
    var Vwet = (LbM * BbM * tb + 2 * (L + tw + B + tw) * tw * H);
    qty.push(Q("Integral crystalline admixture @ 0.8 % of cement (≈ 3.2 kg per m³ of M" + G(fck) + " RCC) in base & walls", "kg", [row("Base & walls (m³ × kg/m³)", nos, Vwet, 3.2)], [CPWD(), "22.22"]));
    qty.push(Q("Integral crystalline slurry, 2 coats – inside faces of walls & floor of sump", "sqm", [row("Inside walls", nos, 2 * (L + B), null, H), row("Floor", nos, L, B)], [CPWD(), "22.23.1"]));
    var nvj = Math.max(0, Math.ceil(L / 15 - 1e-9) - 1) * 2 + Math.max(0, Math.ceil(B / 15 - 1e-9) - 1) * 2;
    var wsRows = [row("Base–wall kicker joint (centre-line perimeter)", nos, 2 * (L + tw + B + tw))];
    if (nvj) wsRows.push(row("Vertical joints (walls > 15 m)", nvj * nos, H + tb));
    qty.push(Q("PVC water-stop 230 mm serrated with central bulb (IS 12200) at construction joints", "metre", wsRows, [CPWD(), "22.4.1"]));
    if (covered) {
      var hd = num(inp.ll) >= 5;
      qty.push(Q("Providing & fixing precast RCC manhole cover with frame – " + (hd ? "heavy duty HD-20 (vehicles near sump)" : "light duty LD-2.5 600 × 450"), "each", [row("Manholes", nMH * nos)], [CPWD(), hd ? "19.19.3.1" : "19.19.1.1"]));
      qty.push(Q("Polypropylene-coated / CI foot rests @ 300 mm c/c below each manhole, embedded 100 mm", "each", [row("Foot rests", nMH * nos, Math.ceil((H + tr) / 0.3))], null, 450, "Non-SOR – IS 5455 type"));
    } else qty.push(Q("MS ladder 450 mm wide with 20 mm Ø rungs @ 300 c/c, painted, fixed to wall with anchor bolts", "metre", [row("Ladder", nos, H + 1.0)], null, 2200, "Non-SOR"));
    if (isMine()) qty.push(Q("Two coats hot bitumen 85/25 with primer on outer faces of walls below GL (sulphate / acidic mine water)", "sqm", [row("Outer faces", nos, 2 * (LoM + BoM), null, Math.max(Hs - tb, 0))], null, 180, "Non-SOR"));
    var exV = (LbM + 2 * work) * (BbM + 2 * work) * dexc, stV = (LbM + 0.2) * (BbM + 0.2) * 0.1 + LbM * BbM * tb + LoM * BoM * Math.max(Hs - tb, 0);
    qty.push(Q("Filling available excavated earth in trenches / pits – around sump, in 200 mm layers", "cum", [row("Backfill", nos, Math.max(exV - stV, 0))], [CPWD(), "2.25"]));
    // ---------------------------------------------------------------- drawings
    var sheets = usDrawing(inp, gm, lv, t, o, cover, fck, fy);
    var steelKg = C.sum(bbs.map(function (b) { return b.weight; })), volC = (Vwet + (covered ? LoM * BoM * tr : 0)) * nos;
    var summary = { "Sump (inside)": F(L, ".2f") + " × " + F(B, ".2f") + " m, water " + F(gm.h, ".2f") + " m + free board → " + F(gm.Vp, ".1f") + " m³" + (String(inp.size_mode).indexOf("From") === 0 ? " (need " + F(gm.cap, ".0f") + " kL)" : ""),
      "Walls": G(t.tw) + " mm; vertical " + G(o.wvi.dia) + "Ø@" + G(o.wvi.spacing) + " in / " + G(o.wvo.dia) + "Ø@" + G(o.wvo.spacing) + " out; horizontal " + G(o.whi.dia) + "Ø@" + G(o.whi.spacing) + " in / " + G(o.who.dia) + "Ø@" + G(o.who.spacing) + " out",
      "Wall method": o.approx ? "L/H > 2 – walls with b/a > 2 as (propped) cantilevers + IS 3370-4 corner moments, others plate coefficients" : "IS 3370-4 plate coefficients (top " + (covered ? "hinged" : "free") + ")",
      "Base slab": G(t.tb) + " mm, projection " + F(t.proj, ".2f") + " m; top " + G(o.bt.dia) + "Ø@" + G(o.bt.spacing) + ", bottom " + G(o.bb.dia) + "Ø@" + G(o.bb.spacing) + " both ways",
      "Uplift": o.U > 0 ? "FoS " + F(o.FoS, ".2f") + " (≥ 1.2), head " + F(o.hw, ".2f") + " m" : "GWT below base",
      "Levels": "top +" + F(lv.top, ".2f") + ", TWL " + F(lv.twl, ".2f") + ", floor " + F(lv.floor, ".2f") + " m (GL = 0)",
      "Steel": F(steelKg, ".0f") + " kg (" + F(steelKg / Math.max(volC, 1e-9), ".0f") + " kg/m³)", "Max utilisation": F(c.max_utilisation, ".2f") };
    if (covered) summary["Roof slab"] = G(t.tr) + " mm, " + G(o.rx.dia) + "Ø@" + G(o.rx.spacing) + " short / " + G(o.ry.dia) + "Ø@" + G(o.ry.spacing) + " long, " + nMH + " manhole(s)";
    var refs = ["IS 3370 (Part 1):2009/2021 – Liquid-retaining structures: general", "IS 3370 (Part 2):2009/2021 – Reinforced concrete (crack width, min. steel)",
      "IS 3370 (Part 4):2021 – Design tables (rectangular tank walls)", "IS 12200:1987 – PVC water-stops", "CPHEEO Manual on Water Supply (2024)"].concat(RCC_REFS);
    return C.DesignResult({ module: "underground_sump", title: "Underground RCC sump / water tank", inputs: inp, calc: c, summary: summary, drawings: sheets,
      quantities: qty, bbs: bbs, tables: { "Wall moments (service, kN·m/m)": C.table(o.walls.map(function (w) { return { "Wall": w.n, "b/a": R(w.r, 2), "Mx base (a)": R(w.a.Mxb, 2), "Mx span (a)": R(w.a.Mxs, 2),
        "My corner (a)": R(w.a.MycB, 2), "My span (a)": R(w.a.MysB, 2), "Mx base (b)": R(w.b_.Mxb, 2), "Mx span (b)": R(w.b_.Mxs, 2), "My corner (b)": R(w.b_.MycB, 2), "My span (b)": R(w.b_.MysB, 2), "T (a) kN/m": R(w.T, 2) }; })) },
      references: refs });
  }
  M.run_sump = run_sump;

  function usDrawing(inp, gm, lv, t, o, cover, fck, fy) {
    var D_ = DR(), L = gm.L * 1000, B = gm.B * 1000, tw = t.tw, tb = t.tb, tr = o.covered ? t.tr : 0, pr = t.proj * 1000, cv = cover;
    var Lo = L + 2 * tw, Bo = B + 2 * tw;
    // plan
    var p = new D_.View("Plan" + (o.covered ? " (roof slab not shown)" : ""));
    p.rect(-tw - pr, -tw - pr, Lo + 2 * pr, Bo + 2 * pr, "HIDDEN");
    p.rect(-tw, -tw, Lo, Bo, "OUTLINE", "concrete"); p.rect(0, 0, L, B, "OUTLINE", "water");
    var nMH = o.covered ? Math.max(1, Math.trunc(num(inp.manholes))) : 0;
    for (var k = 0; k < nMH; k++) { var xm = (k + 1) * L / (nMH + 1) - 300; p.rect(xm, B - 750, 600, 600, "STEEL"); p.text(xm + 300, B - 900, "MH 600×600", 1.8, { anchor: "middle" }); }
    for (var j = 0; j < 4; j++) p.line(150, 150 + j * 300, 450, 150 + j * 300, "THIN");
    p.text(500, 300, "foot rests @ 300", 1.8);
    p.dim(-tw, Bo - tw, Lo - tw, Bo - tw, -8); p.dim(0, 0, L, 0, 8, "INSIDE " + F(L, ",.0f"));
    p.dim(Lo - tw + pr, -tw - pr, Lo - tw + pr, Bo - tw + pr, -10); p.dim(0, 0, 0, B, 8, "INSIDE " + F(B, ",.0f"));
    p.text(L / 2, -tw - pr - 500, "Base projection " + F(pr, ",.0f") + " beyond walls (dashed); walls " + G(tw) + " thk", 2.0, { anchor: "middle" });
    // section A–A along L (y = level in mm, GL = 0)
    var s = new D_.View("Section A–A (along length)");
    var yU = lv.under * 1000, yF = lv.floor * 1000, yS = lv.soffit * 1000, yT = lv.top * 1000, yW = lv.twl * 1000;
    s.rect(-tw - pr - 100, yU - 100, Lo + 2 * pr + 200, 100, "CONCRETE");
    s.rect(-tw - pr, yU, Lo + 2 * pr, tb, "OUTLINE", "concrete");
    s.rect(-tw, yF, tw, yS - yF, "OUTLINE", "concrete"); s.rect(L, yF, tw, yS - yF, "OUTLINE", "concrete");
    if (o.covered) { s.rect(-tw, yS, Lo, tr, "OUTLINE", "concrete"); s.rect(L / 2 - 300, yS, 600, tr, "STEEL"); }
    s.line(0, yW, L, yW, "WATER"); s.text(L / 2, yW + 80, "TWL " + F(lv.twl, ".2f"), 2.0, { anchor: "middle" });
    s.line(-tw - pr - 1500, 0, -tw, 0, "SOIL"); s.line(L + tw, 0, L + tw + pr + 1500, 0, "SOIL"); s.text(L + tw + pr + 1500, 80, "GL ±0.00", 2.0, { anchor: "end" });
    var yGW = -lv.zw * 1000;
    if (yGW > yU) { s.line(-tw - pr - 1500, yGW, -tw - 50, yGW, "WATER"); s.text(-tw - pr - 1500, yGW + 80, (isMine() ? "GWT at GL (mine, monsoon)" : "HGWT -" + F(lv.zw, ".2f")), 1.8); }
    // bars
    s.poly([[cv, yS + tr - cv - 200], [cv, yS + tr - cv], [cv, yU + cv + 40], [300, yU + cv + 40]], false, "REBAR");
    s.poly([[-tw + cv + 200, yS + tr - cv], [-tw + cv, yS + tr - cv], [-tw + cv, yU + cv], [-tw + cv + 300, yU + cv]], false, "REBAR");
    s.line(-tw - pr + cv, yU + cv, L + tw + pr - cv, yU + cv, "REBAR"); s.line(-tw - pr + cv, yF - cv, L + tw + pr - cv, yF - cv, "REBAR");
    if (o.covered) s.line(-tw + cv, yS + cv, L + tw - cv, yS + cv, "REBAR");
    for (var q = 0; q < 6; q++) { var yy = yF + 150 + q * (yS - yF - 300) / 5; s.bar_dot(cv + o.wvi.dia + o.whi.dia / 2, yy, o.whi.dia); s.bar_dot(-cv - o.wvo.dia - o.who.dia / 2, yy, o.who.dia); }
    s.rect(-tw / 2 - 5, yF, 10, 150, "STEEL"); s.text(L / 2, yU - 2200, "PVC water-stop 230 at the 150 mm kicker (base–wall joint), all round", 1.8, { anchor: "middle" });
    s.text(L / 2, yU - 1200, "W1 " + G(o.wvi.dia) + "Ø@" + G(o.wvi.spacing) + " inner / W2 " + G(o.wvo.dia) + "Ø@" + G(o.wvo.spacing) + " outer (vertical)", 2.0, { anchor: "middle" });
    s.text(L / 2, yU - 1700, "W3 " + G(o.whi.dia) + "Ø@" + G(o.whi.spacing) + " inner / W4 " + G(o.who.dia) + "Ø@" + G(o.who.spacing) + " outer (horizontal)", 2.0, { anchor: "middle" });
    s.text(L / 2, yU - 700, "Base " + G(tb) + " thk: top " + G(o.bt.dia) + "Ø@" + G(o.bt.spacing) + ", bottom " + G(o.bb.dia) + "Ø@" + G(o.bb.spacing) + " both ways; PCC 1:4:8 100 thk", 2.0, { anchor: "middle" });
    if (o.covered) s.text(L / 2, yT + 250, "Roof " + G(tr) + " thk: " + G(o.rx.dia) + "Ø@" + G(o.rx.spacing) + " short span, " + G(o.ry.dia) + "Ø@" + G(o.ry.spacing) + " long span (bottom)", 2.0, { anchor: "middle" });
    s.dim(-tw - pr - 600, yF, -tw - pr - 600, yW, 10, "WATER " + F(gm.h * 1000, ",.0f"));
    s.dim(L + tw + pr + 600, yF, L + tw + pr + 600, yS, -10, "H " + F(lv.H * 1000, ",.0f"));
    s.dim(L + tw + pr + 1200, yU, L + tw + pr + 1200, 0, -12, F(lv.Hs * 1000, ",.0f") + " below GL");
    s.dim(0, yF + 600, L, yF + 600, -6, "INSIDE " + F(L, ",.0f"));
    s.dim(-tw - pr, yU, -tw, yU, 8);
    // wall corner detail (plan)
    var d = new D_.View("Corner detail – horizontal bars (plan)"), Lw = 1500;
    d.rect(0, 0, Lw, tw, "OUTLINE", "concrete"); d.rect(0, 0, tw, Lw, "OUTLINE", "concrete");
    d.poly([[Lw, cv], [cv, cv], [cv, Lw]], false, "REBAR");
    d.poly([[Lw, tw - cv], [tw - cv, tw - cv], [tw - cv, Lw]], false, "HIDDEN");
    var LdC = BB().Ld(o.whi.dia, fck, fy);
    d.poly([[Math.min(tw - cv + LdC, Lw), cv + 40], [cv + 40, cv + 40], [cv + 40, Math.min(tw - cv + LdC, Lw)]], false, "REBAR");
    d.text(tw + 100, tw + 200, "W5 corner L-bar " + G(o.whi.dia) + "Ø, legs Ld = " + G(LdC), 1.8);
    d.text(tw + 100, -200, "outer ring W4 continuous round the corner", 1.8);
    d.dim(0, 0, tw, 0, 6); d.dim(0, 0, 0, tw, -6);
    var notes = ["Concrete M" + G(fck) + " (IS 3370-1), Fe" + G(fy) + ", clear cover " + G(cover) + " mm both faces; crack width ≤ " + G(o.climit) + " mm (IS 3370-2).",
      "Pour base, then walls from a 150 mm kicker with PVC water-stop; no cold joints in walls; crystalline admixture in base & walls.",
      "Water-tightness test (IS 3370-1) before backfilling; backfill in 200 mm layers on all sides together; keep dewatering on until the roof is cast.",
      "Levels in m with GL = ±0.00: top +" + F(lv.top, ".2f") + ", TWL " + F(lv.twl, ".2f") + ", floor " + F(lv.floor, ".2f") + ", underside of base " + F(lv.under, ".2f") + "."];
    var sh1 = new D_.Sheet("Underground RCC sump / water tank", "US-01", [p, s, d], notes);
    var rows = o.walls.map(function (w) { return [w.n, F(w.r, ".2f"), F(w.a.Mxb, ".2f"), F(w.a.Mxs, ".2f"), F(w.a.MycB, ".2f"), F(w.a.MysB, ".2f"), F(w.b_.Mxb, ".2f"), F(w.b_.Mxs, ".2f"), F(w.b_.MycB, ".2f"), F(w.b_.MysB, ".2f"), F(w.T, ".1f")]; });
    var tv = D_.table_view("Wall moments (service, kN·m/m) – " + (o.approx ? "L/H > 2: walls with b/a > 2 cantilever + corner coefficients" : "IS 3370-4-type plate coefficients, top " + (o.covered ? "hinged" : "free")),
      ["Wall", "b/a", "Mx base a", "Mx span a", "My corner a", "My span a", "Mx base b", "Mx span b", "My corner b", "My span b", "T a"], rows, [26, 12, 20, 20, 22, 20, 20, 20, 22, 20, 14], { text_h: 2.0, row_h: 7.0 });
    var sh2 = new D_.Sheet("Underground sump – wall moments", "US-02", [tv],
      ["Case (a): tank full, no backfill (water test). Case (b): tank empty with earth at rest, surcharge " + G(num(inp.surcharge)) + " kN/m² and groundwater.",
        "Plate coefficients: base & vertical edges fixed, top " + (o.covered ? "hinged" : "free") + ", ν = 0.2 (finite-difference values of the IS 3370-4 / PCA type – verify with IS 3370-4 tables).",
        "Corner moments balanced between long & short walls (stiffness ∝ 1/length); reductions added to span moments."]);
    return [sh1, sh2];
  }

  var US_PARAMS = [
    P("size_mode", "Sizing", US_SIZE[0], { kind: "select", options: US_SIZE.slice(), group: "Capacity & size" }),
    P("capacity", "Storage required", 100.0, "kL", { min: 5, max: 5000, group: "Capacity & size", when: function (v) { return String(v.size_mode).indexOf("From capacity") === 0; } }),
    P("ratio", "Length : width", 1.5, { min: 1, max: 3, step: 0.1, group: "Capacity & size", when: function (v) { return String(v.size_mode).indexOf("From capacity") === 0; } }),
    P("L", "Inside length L", 8.0, "m", { min: 1.5, max: 40, step: 0.05, group: "Capacity & size", when: function (v) { return String(v.size_mode).indexOf("Given") === 0; } }),
    P("B", "Inside width B", 5.0, "m", { min: 1.5, max: 25, step: 0.05, group: "Capacity & size", when: function (v) { return String(v.size_mode).indexOf("Given") === 0; } }),
    P("depth", "Water depth (floor → TWL)", 2.5, "m", { min: 1.0, max: 6.0, step: 0.05, group: "Capacity & size" }),
    P("freeboard", "Free board above TWL", 0.3, "m", { min: 0.15, max: 1.0, step: 0.05, group: "Capacity & size" }),
    P("top_gl", "Top of roof / wall above GL", 0.3, "m", { min: 0, max: 1.5, step: 0.05, group: "Capacity & size", help: "≥ 300 mm keeps surface water out of the manholes" }),
    P("roof", "Roof", US_ROOF[0], { kind: "select", options: US_ROOF.slice(), group: "Roof" }),
    P("ll", "Live load on roof slab", 1.5, "kN/m²", { min: 0.75, max: 20, group: "Roof", help: "1.5 maintenance access; ≥ 5 if light vehicles can reach it (wheel loads: drain-cover module)",
      when: function (v) { return String(v.roof).indexOf("Covered") === 0; } }),
    P("manholes", "Number of manholes (600 × 600)", 1, { kind: "int", min: 1, max: 4, group: "Roof", when: function (v) { return String(v.roof).indexOf("Covered") === 0; } }),
    P("gwt", "Highest groundwater level below GL", 2.0, "m", { min: 0, max: 20, step: 0.1, group: "Soil & groundwater",
      help: "monsoon / pit-flooding level; mining site: taken at GL automatically" }),
    P("gamma", "Soil unit weight (saturated)", 18.0, "kN/m³", { min: 15, max: 22, group: "Soil & groundwater" }),
    P("phi", "Soil angle of friction", 30.0, "°", { min: 20, max: 40, group: "Soil & groundwater" }),
    P("surcharge", "Surcharge beside sump (vehicles / stacking)", 10.0, "kN/m²", { min: 0, max: 50, group: "Soil & groundwater" }),
    P("sbc", "Safe bearing capacity", 150.0, "kN/m²", { min: 50, max: 600, group: "Soil & groundwater" }),
    P("crack", "Crack-width limit", 0.2, "mm", { kind: "select", options: [0.2, 0.1], group: "Materials", help: "IS 3370-2: 0.2 mm; 0.1 mm for aggressive water / appearance" }),
    P("nos", "Number of identical sumps (quantity)", 1, { kind: "int", min: 1, max: 20, group: "Quantity" })
  ].concat(matParams(45.0, "Severe", 30.0, [25.0, 30.0, 35.0, 40.0]), [
    P("tw_chk", "Wall thickness (check)", 300.0, "mm", { min: 150, max: 800, step: 25, group: "My design", modes: CHECK }),
    P("tb_chk", "Base slab thickness (check)", 350.0, "mm", { min: 150, max: 1500, step: 25, group: "My design", modes: CHECK }),
    P("tr_chk", "Roof slab thickness (check)", 250.0, "mm", { min: 100, max: 400, step: 10, group: "My design", modes: CHECK }),
    P("proj_chk", "Base projection beyond walls (check)", 0.6, "m", { min: 0, max: 2.0, step: 0.05, group: "My design", modes: CHECK }),
    P("wv_dia", "Wall vertical bars dia, each face (check)", 16.0, "mm", { kind: "select", options: [10.0, 12.0, 16.0, 20.0, 25.0], group: "My design", modes: CHECK }),
    P("wv_s", "Wall vertical bars spacing (check)", 150.0, "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK }),
    P("wh_dia", "Wall horizontal bars dia, each face (check)", 12.0, "mm", { kind: "select", options: [10.0, 12.0, 16.0, 20.0], group: "My design", modes: CHECK }),
    P("wh_s", "Wall horizontal bars spacing (check)", 150.0, "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK }),
    P("base_dia", "Base bars dia, each face & way (check)", 16.0, "mm", { kind: "select", options: [10.0, 12.0, 16.0, 20.0, 25.0], group: "My design", modes: CHECK }),
    P("base_s", "Base bars spacing (check)", 125.0, "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK }),
    P("roof_dia", "Roof bars dia, both ways (check)", 12.0, "mm", { kind: "select", options: [8.0, 10.0, 12.0, 16.0], group: "My design", modes: CHECK }),
    P("roof_s", "Roof bars spacing (check)", 150.0, "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK })
  ]);
  M.US_PARAMS = US_PARAMS;
  C.register({ id: "underground_sump", phase: 3, category: "Drains, culverts & roads", name: "Underground sump / UG water tank (IS 3370)", icon: "🛢️",
    description: "Rectangular underground RCC sump / pump-house sump: capacity → size & levels, IS 3370-4 plate moments (or cantilever + frame for L/H > 2) " +
      "for tank-full and tank-empty-with-earth-&-groundwater cases, direct tension, crack width & minimum steel (IS 3370-2), base slab with flotation (FoS ≥ 1.2) " +
      "and bearing, two-way roof slab with manholes, BBS, quantities (dewatering, water-stops, crystalline admixture).",
    params: US_PARAMS, run: run_sump, references: ["IS 3370 (Parts 1, 2 & 4)", "IS 12200:1987"].concat(RCC_REFS) });

  /* =========================================================================== 2. LINTEL, CHAJJA & PLINTH BEAM */
  var LC_MEMBER = ["Lintel over opening", "Lintel with chajja (sunshade)", "Plinth beam (on wall footing)"];
  var LC_RULE = ["Auto – arching (60° triangle) if enough masonry above", "60° triangle (equilateral, arching)", "45° triangle (arching)", "Full rectangular (no arching)"];
  var PB_TYPE = ["End span (continuous)", "Interior span (continuous)", "Single span (simply supported)"];
  function lcKind(inp) { var m = String(inp.member); return /^Plinth/.test(m) ? "plinth" : /chajja/i.test(m) ? "chajja" : "lintel"; }

  /* lintel loads (service, per lintel): returns {M (kN·m), V (kN), wavg (kN/m acting on the lintel, for stability), rule} */
  function lcLoads(c, inp, leff, b, D, ch) {
    var gm = num(inp.gamma_m), t = num(inp.wall_t) / 1000, hm = num(inp.h_above), rule = String(inp.load_rule), endd = num(inp.end_dist);
    c.section("Loads on lintel (service)");
    var sw = c.calc("Self-weight of lintel", "gs", "25*b*D/1e6", "kN/m", "IS 875-1", { b: b, D: D });
    var ang = /45°/.test(rule) ? 45 : 60;
    var ht = c.calc("Height of the load triangle (" + ang + "° to the horizontal)", "ht", "leff/2*tan(radians(ang))", "m", "SP 20 / IS 1905 arching practice", { leff: R(leff, 3), ang: ang });
    var full = /^Full/.test(rule), arch = !full;
    if (arch && hm < 1.25 * ht) { arch = false; c.warn("No arching", "Masonry above (" + F(hm, ".2f") + " m) < 1.25 × triangle height (" + F(1.25 * ht, ".2f") + " m) – full masonry height taken", "IS 1905 / SP 20 practice"); }
    if (arch && endd < leff / 2) { arch = false; c.warn("No arching", "Opening only " + F(endd, ".2f") + " m from the wall end / corner (< leff/2) – the arch has no abutment; full masonry height taken", "SP 20 practice"); }
    var Mm, Vm, Wm;
    if (arch) {
      Wm = c.calc("Masonry load – triangle", "Wt", "gm*t*leff*ht/2", "kN", "", "arching: only the masonry inside the " + ang + "° triangle loads the lintel", { gm: gm, t: t, leff: R(leff, 3), ht: R(ht, 3) });
      Mm = c.calc("Moment from the triangular load", "Mt", "Wt*leff/6", "kN·m", "triangle with apex at mid-span", { Wt: Wm, leff: R(leff, 3) });
      Vm = Wm / 2;
    } else {
      var wm = c.calc("Masonry load – full height (rectangular)", "wm", "gm*t*hm", "kN/m", "", { gm: gm, t: t, hm: hm });
      Mm = c.calc("Moment from the masonry", "Mm", "wm*leff**2/8", "kN·m", "", { wm: wm, leff: R(leff, 3) });
      Vm = wm * leff / 2; Wm = wm * leff;
    }
    var ws = num(inp.slab_w), hs = num(inp.slab_h), wsl = 0;
    if (ws > 0) {
      if (!arch || hs < ht) { wsl = c.let("Slab / beam load on the wall within the load zone (taken as UDL over the span – conservative)", "ws", ws, "kN/m", "SP 20 practice", "slab bears " + F(hs, ".2f") + " m above the lintel" + (arch ? " (inside the triangle)" : "")); }
      else c.info("Slab load", "Slab bears " + F(hs, ".2f") + " m above the lintel – above the apex of the load triangle (" + F(ht, ".2f") + " m): carried by arching, ignored", "SP 20 practice");
    }
    var wch = ch ? ch.w : 0;
    if (ch) c.let("Chajja load on the lintel (self + finishes + live)", "wch", R(wch, 3), "kN/m");
    var Ms = c.calc("Service moment at mid-span", "Ms", "Mm + (gs + ws + wch)*leff**2/8", "kN·m", "", { Mm: R(Mm, 4), gs: sw, ws: wsl, wch: R(wch, 4), leff: R(leff, 3) });
    var Vs = c.calc("Service shear at support", "Vs", "Vm + (gs + ws + wch)*leff/2", "kN", "", { Vm: R(Vm, 4), gs: sw, ws: wsl, wch: R(wch, 4), leff: R(leff, 3) });
    return { M: Ms, V: Vs, arch: arch, ang: ang, ht: ht, Wm: Wm, wmasonry_avg: Wm / leff + sw, sw: sw };
  }
  M.lcLoads = lcLoads;

  /* chajja cantilever (per m length): returns {Md, Ml (service kN·m/m), w (kN/m on lintel), bars, dist, troot, ttip} */
  function lcChajja(c, inp, mode, troot, ttip, cover, given) {
    var fck = num(inp.fck), fy = num(inp.fy), pc = num(inp.proj), ll = num(inp.ll), fin = num(inp.finish), dt = DT();
    c.section("Chajja (sunshade) – cantilever per metre");
    c.let("Projection × thickness at root / tip", "lc × t", F(pc, ".2f") + " m × " + G(troot) + " / " + G(ttip) + " mm", "", "", "tapered on top for drainage, drip groove at the soffit edge");
    var Md = c.calc("Dead-load moment at root (taper + finishes)", "Md", "25*tt/1000*lc**2/2 + 25*(tr - tt)/1000*lc**2/6 + fin*lc**2/2", "kN·m/m", "", { tt: ttip, tr: troot, lc: pc, fin: fin });
    var Ml = c.calc("Live-load moment at root", "Ml", "max(q*lc**2/2, 0.75*lc)", "kN·m/m", "IS 875-2 (sunshade 0.75 kN/m² or 0.75 kN/m at the edge – verify)", { q: ll, lc: pc });
    var Mu = c.calc("Design moment at root", "Mu", "1.5*(Md + Ml)", "kN·m/m", "IS 456 Table 18", { Md: Md, Ml: Ml });
    var wv = 25 * (troot + ttip) / 2000 * pc + fin * pc + ll * pc;
    var bars = XT().designStrip(c, Mu, troot, cover, fck, fy, "chajja, top", { given: given ? given.main : null, rule: dt ? { member: "slab", role: "main" } : null, Vu: 1.5 * wv, dias: [8, 10, 12, 16] });
    RC().shear(c, 1.5 * wv, 1000, bars.d, 100 * bars.Ast_prov / (1000 * bars.d), fck, fy, "slab", { D: troot, tag: "(chajja root)" });
    RC().deflection(c, pc * 1000, bars.d, "cantilever", fy, bars.req, bars.Ast_prov, 1000, { tag: "(chajja)" });
    var dist = XT().stripBars(c, 0.0012 * 1000 * (troot + ttip) / 2, "slab", "dist", bars.d - bars.dia, troot, given ? given.dist : null, "chajja distribution", { dias: [8, 10], rule: { main_dia: bars.dia } });
    c.ok("Chajja projection within 0.45 – 0.90 m (beyond: design as a cantilever slab / with brackets)", pc >= 0.45 - 1e-9 && pc <= 0.9 + 1e-9, { detail: F(pc, ".2f") + " m", clause: "Practice", warn_only: true });
    c.ok("Root thickness ≥ 100 mm, tip ≥ 75 mm", troot >= 100 && ttip >= 75, { detail: G(troot) + " / " + G(ttip) + " mm", clause: "Practice (cover + bars + drip)", warn_only: true });
    return { Md: Md, Ml: Ml, Mu: Mu, w: wv, bars: bars, dist: dist, troot: troot, ttip: ttip, pc: pc };
  }
  M.lcChajja = lcChajja;

  /* IS 456 cl 41 – torsion + shear + bending at a section; returns {sv (mm) or null, Me1, Me2, ok} */
  function lcTorsion(c, Tu, Vu, Mu, b, D, d, cover, sd, dm, fck, fy, tc, tag) {
    var MTl = MT(), t = " " + tag;
    var Ve = c.calc("Equivalent shear" + t, "Ve", "Vu + 1.6*Tu/(b/1000)", "kN", "IS 456 cl 41.3.1", { Vu: R(Vu, 3), Tu: R(Tu, 4), b: b });
    var tve = c.calc("Equivalent nominal shear stress" + t, "τve", "Ve*1000/(b*d)", "N/mm²", "IS 456 cl 41.3.1", { Ve: Ve, b: b, d: R(d, 1) });
    var ok = c.check("τve ≤ τc,max" + t, tve, MTl.tau_c_max(fck), { unit: "N/mm²", clause: "IS 456 cl 41.3.2 / Table 20", note: "increase the section" });
    var Mt = c.calc("Equivalent moment from torsion" + t, "Mt", "Tu*(1 + D/b)/1.7", "kN·m", "IS 456 cl 41.4.2", { Tu: R(Tu, 4), D: D, b: b });
    var Me1 = c.calc("Equivalent moment Me1 = Mu + Mt" + t, "Me1", "Mu + Mt", "kN·m", "IS 456 cl 41.4.2", { Mu: R(Mu, 4), Mt: Mt });
    var Me2 = Mt > Mu ? c.calc("Equivalent moment on the compression face Me2 = Mt − Mu" + t, "Me2", "Mt - Mu", "kN·m", "IS 456 cl 41.4.2.1", { Mt: Mt, Mu: R(Mu, 4) }) : 0;
    var sv = null;
    if (tve > tc) {
      var b1 = Math.max(b - 2 * cover - 2 * sd - dm, 20), d1 = Math.max(D - 2 * cover - 2 * sd - dm, 20), Asv = 2 * area(sd);
      sv = c.calc("Stirrup spacing for torsion + shear" + t, "sv", "min(Asv/(Tu*1e6/(b1*d1*0.87*fy) + Vu*1e3/(2.5*d1*0.87*fy)), Asv*0.87*fy/((tve - tc)*b))", "mm",
        "IS 456 cl 41.4.3", { Asv: R(Asv, 2), Tu: R(Tu, 4), b1: R(b1, 1), d1: R(d1, 1), fy: fy, Vu: R(Vu, 3), tve: R(tve, 4), tc: R(tc, 4), b: b });
      var x1 = b - 2 * cover, y1 = D - 2 * cover, slim = Math.min(x1, (x1 + y1) / 4, 300);
      sv = Math.min(sv, slim);
      c.let("Stirrup spacing limit for torsion" + t, "", "≤ min(x1, (x1 + y1)/4, 300) = " + F(slim, ".0f") + " mm (x1 × y1 = " + G(x1) + " × " + G(y1) + " stirrup)", "", "IS 456 cl 26.5.1.7");
      c.check("Torsion stirrup spacing ≥ 75 mm (practical minimum)" + t, sv, 75, { unit: "mm", clause: "IS 456 cl 26.5.1.7 / practice", mode: ">=", note: "deepen the lintel" });
    } else c.info("Torsion steel" + t, "τve ≤ τc – minimum shear reinforcement only (closed stirrups as for torsion)", "IS 456 cl 41.3.3");
    return { sv: sv, Me1: Me1, Me2: Me2, ok: ok, tve: tve };
  }

  /* bars for a beam face from an area */
  function beamBars(c, As, b, cover, sd, role, mainDia, label, givenNd, lintel) {
    var dt = DT(), bars;
    if (lintel) {   // lintels: members of minor importance – CPWD type-design bar sizes (main ≥ 10, hangers ≥ 8; mining site 12 / 10)
      var mn = role === "main" ? (isMine() ? 12 : 10) : (isMine() ? 10 : 8);
      if (givenNd) {
        bars = { n: givenNd[0], dia: givenNd[1], Ast_prov: givenNd[0] * area(givenNd[1]) };
        c.check(label + ": steel provided ≥ required", bars.Ast_prov, As, { unit: "mm²", clause: "IS 456 cl 26.5.1", mode: ">=" });
        c.ok(label + ": bar Ø ≥ " + G(mn) + " mm" + (isMine() ? " (mining site)" : " (CPWD practice for lintels)"), givenNd[1] >= mn, { detail: G(givenNd[1]) + " mm", clause: "CPWD type designs / SP 34", warn_only: true });
        return bars;
      }
      bars = RC().beam_bars(Math.max(As, 2 * area(mn)), b, cover, sd, { dias: [8, 10, 12, 16, 20, 25].filter(function (x) { return x >= mn; }) });
      c.let(label, "", bars.n + "-" + G(bars.dia) + "Ø", "", "CPWD practice for lintels: " + (role === "main" ? "main" : "hanger") + " bars ≥ " + G(mn) + " mm", "As = " + F(bars.Ast_prov, ".0f") + " ≥ " + F(As, ".0f") + " mm²");
      return bars;
    }
    if (givenNd) {
      bars = { n: givenNd[0], dia: givenNd[1], Ast_prov: givenNd[0] * area(givenNd[1]) };
      c.check(label + ": steel provided ≥ required", bars.Ast_prov, As, { unit: "mm²", clause: "IS 456 cl 26.5.1", mode: ">=" });
      if (dt) dt.check_bars(c, "beam", role, givenNd[1], null, { label: label, main_dia: mainDia });
      return bars;
    }
    var tmin = dt ? dt.min_dia("beam", role, null, { main_dia: mainDia }).dia : 10;
    bars = RC().beam_bars(Math.max(As, 2 * area(tmin)), b, cover, sd, { dias: [8, 10, 12, 16, 20, 25], rule: dt ? { role: role, main_dia: mainDia } : null });
    if (dt && bars.text) dt.record(c, label, bars);
    c.let(label, "", bars.n + "-" + G(bars.dia) + "Ø", "", "", "As = " + F(bars.Ast_prov, ".0f") + " ≥ " + F(As, ".0f") + " mm²");
    return bars;
  }

  function lcAnalyse(c, inp, mode, kind, D, cover, sdia, given, chT) {
    var fck = num(inp.fck), fy = num(inp.fy), b = num(inp.wall_t), out = { D: D, b: b, kind: kind }, dt = DT();
    var d0 = D - cover - sdia - 6;
    var leff, Ms, Vs, sup = "simply supported", Mh = 0;
    if (kind === "plinth") {
      var span = num(inp.span), typ = String(inp.pb_type), sw0 = num(inp.col_w);
      c.section("Plinth beam – loads & moments (IS 456 cl 22.5)");
      leff = c.let("Effective span (c/c of columns)", "L", span, "m", "IS 456 cl 22.2(b)");
      var sw = c.calc("Self-weight", "gs", "25*b*D/1e6", "kN/m", "", { b: b, D: D });
      var wwall = c.calc("Wall on plinth beam", "ww", "gm*t*hw", "kN/m", "IS 875-1", { gm: num(inp.gamma_m), t: b / 1000, hw: num(inp.wall_h) });
      var w = c.calc("Total load (dead)", "w", "gs + ww + we", "kN/m", "", "we = other load on the wall (roof / slab) " + G(num(inp.extra)) + " kN/m", { gs: sw, ww: wwall, we: num(inp.extra) });
      var ks = /^End/.test(typ) ? [1 / 12, 1 / 10, 0.6] : /^Interior/.test(typ) ? [1 / 16, 1 / 12, 0.55] : [1 / 8, 0, 0.5];
      Ms = c.calc("Span moment (service)", "M+", "k*w*L**2", "kN·m", /^Single/.test(typ) ? "simply supported wL²/8" : "IS 456 Table 12 (dead load)", { k: R(ks[0], 4), w: w, L: span });
      Mh = ks[1] > 0 ? c.calc("Support moment (service)", "M−", "k*w*L**2", "kN·m", "IS 456 Table 12 (support next to the end / interior)", { k: R(ks[1], 4), w: w, L: span }) : 0;
      Vs = c.calc("Shear (service)", "V", "k*w*L", "kN", "IS 456 Table 13", { k: ks[2], w: w, L: span });
      sup = /^Single/.test(typ) ? "simply supported" : "continuous";
      c.info("Soil support", "Support from the soil / wall footing below ignored (beam spans between columns) – conservative; plinth beam also ties the columns", "Practice");
      out.w = w; out.leff = span; out.clear = Math.max(span - sw0, 0.3);
    } else {
      var lo = num(inp.opening), brg = num(inp.bearing);
      c.section("Lintel – span");
      leff = c.calc("Effective span", "leff", "min(lo + bw, lo + d/1000)", "m", "IS 456 cl 22.2(a)", { lo: lo, bw: brg, d: R(d0, 1) });
      c.ok("Bearing on masonry 150 – 230 mm", brg >= 0.15 - 1e-9 && brg <= 0.23 + 1e-9, { detail: G(brg * 1000) + " mm", clause: "Practice (≥ 150 mm, ≥ D) / IS 1905 bearing", warn_only: true });
      var L1 = lcLoads(c, inp, leff, b, D, chT);
      Ms = L1.M; Vs = L1.V; out.load = L1; out.leff = leff; out.clear = lo;
    }
    var Mu = 1.5 * Ms, Vu = 1.5 * Vs, Muh = 1.5 * Mh;
    out.Mu = Mu; out.Vu = Vu; out.Muh = Muh;
    c.section(kind === "plinth" ? "Plinth beam – flexure, shear & torsion" : "Lintel – flexure, shear & torsion");
    c.let("Section b × D", "b × D", G(b) + " × " + G(D), "mm", "", kind === "plinth" ? "width = wall thickness" : "width = wall thickness, D ≥ 150 mm");
    c.ok("Overall depth ≥ 150 mm", D >= 150, { detail: G(D) + " mm", clause: "Practice (CPWD) – also ≥ 2 brick courses" });
    // torsion from the chajja (supports, ends restrained by the masonry bearings)
    var tor = null, Tu = 0;
    if (chT) {
      Tu = c.calc("Torsion at the support from the chajja", "Tu", "1.5*(Md + Ml)*leff/2", "kN·m", "IS 456 cl 41 – lintel ends restrained by the bearings", { Md: R(chT.Md, 4), Ml: R(chT.Ml, 4), leff: R(leff, 3) });
    }
    var fl = RC().flexure(c, Mu, b, d0, fck, fy, "beam", { tag: "(mid-span)" });
    var AsB = fl.Ast, AsT = 0;
    if (Muh > 0) { var fh = RC().flexure(c, Muh, b, d0, fck, fy, "beam", { tag: "(support, top)" }); AsT = fh.Ast; }
    var tc0 = MT().tau_c(Math.max(100 * AsB / (b * d0), 0.15), fck);
    if (chT) {
      tor = lcTorsion(c, Tu, Vu, 0, b, D, d0, cover, sdia, 10, fck, fy, tc0, "(support section)");
      var ft1 = RC().flexure(c, tor.Me1, b, d0, fck, fy, "beam", { tag: "(support, Me1 bottom)" });
      var ft2 = RC().flexure(c, tor.Me2, b, d0, fck, fy, "beam", { tag: "(support, Me2 top)" });
      AsB = Math.max(AsB, ft1.Ast); AsT = Math.max(AsT, ft2.Ast);
    }
    var gb = given ? [given.bot_n, given.bot_dia] : null, gt = given ? [given.top_n, given.top_dia] : null;
    var lin = kind !== "plinth";
    var bot = beamBars(c, AsB, b, cover, sdia, "main", null, "Bottom bars", gb, lin);
    var topRole = AsT > 0 ? "main" : "hanger";
    var top = beamBars(c, Math.max(AsT, fl.Asc || 0), b, cover, sdia, topRole, bot.dia, "Top bars" + (AsT > 0 ? "" : " (hangers)"), gt, lin);
    c.check("Max. steel ≤ 4 % of bD", 100 * Math.max(bot.Ast_prov, top.Ast_prov) / (b * D), 4.0, { unit: "%", clause: "IS 456 cl 26.5.1.1(b)" });
    var d = D - cover - sdia - bot.dia / 2;
    var pt = 100 * bot.Ast_prov / (b * d);
    var sh = RC().shear(c, Vu, b, d, pt, fck, fy, "beam", { stirrup_dia: sdia, legs: 2, strict: mode === "check" ? "check" : "design", tag: "(support)" });
    var sv = sh.stirrups ? sh.stirrups[2] : 150;
    var nominal = lin && sh.tv <= 0.5 * sh.tc && (!tor || !tor.sv);
    if (nominal) {
      sv = 150;
      c.info("Stirrups – lintel", "τv = " + F(sh.tv, ".3f") + " ≤ 0.5 τc = " + F(0.5 * sh.tc, ".3f") + " N/mm²: minimum shear reinforcement not required for lintels; nominal 2-legged links @ 150 hold the bars (practice)", "IS 456 cl 26.5.1.6 (exception for lintels)");
    } else {
      if (tor && tor.sv) sv = Math.min(sv, Math.max(C.floor_to(tor.sv, 25), 75));
      if (dt && mode !== "check" && !lin) { var sr = dt.stirrup_rules(d, leff, sv, sdia, { min_main: Math.min(bot.dia, top.dia) }); dt.record(c, "stirrups", sr); sv = Math.min(sv, sr.s_mid); }
    }
    sv = Math.max(C.floor_to(sv, 25), 75);
    if (mode === "check") {
      c.check("Stirrup spacing provided ≤ required", given.st_s, sv, { unit: "mm", clause: tor && tor.sv ? "IS 456 cl 41.4.3 / 40.4" : "IS 456 cl 40.4 / 26.5.1.5" });
      sv = given.st_s;
    }
    c.let("Stirrups", "", "2L-" + G(sdia) + "Ø @ " + G(sv) + " c/c" + (chT ? " (closed, 135° hooks – torsion)" : ""), "", "IS 456 cl 26.5.1.5 / 26.5.1.7");
    RC().deflection(c, leff * 1000, d, sup, fy, Math.max(fl.Ast, 1), bot.Ast_prov, b);
    // anchorage at simple supports (IS 456 cl 26.2.3.3(c))
    if (kind !== "plinth") {
      var M1 = RC().moment_capacity(bot.Ast_prov, b, d, fck, fy), brg2 = num(inp.bearing) * 1000;
      var Ld = RC().development_length(c, bot.dia, fy, fck, { tag: "(bottom bars)" });
      var L0 = c.calc("Anchorage beyond the support centre + 90° bend", "L0", "bw/2 - c + 8*dia", "mm", "IS 456 cl 26.2.2.1 (90° bend = 8φ)", { bw: brg2, c: cover, dia: bot.dia });
      c.check("Ld ≤ 1.3 M1/V + L0 at the support", Ld, 1.3 * M1 * 1e3 / Math.max(Vu, 1e-6) + L0, { unit: "mm", clause: "IS 456 cl 26.2.3.3(c)", note: "M1 = " + F(M1, ".1f") + " kN·m (bottom bars), V = " + F(Vu, ".1f") + " kN" });
    } else {
      RC().development_length(c, bot.dia, fy, fck, { tag: "(laps / anchorage in columns)" });
    }
    if (chT) {
      var anc = c.calc("Anchorage of chajja top bars in the lintel (across, down & along the bottom)", "La", "(b - c) + (D - 2*c) + (b - 2*c)", "mm", "IS 456 cl 26.2.1 / SP 34",
        "bars run across the lintel, bend down the inner face and return along the bottom", { b: b, c: cover, D: D });
      c.check("Chajja top bars: anchorage in the lintel ≥ Ld", anc, BB().Ld(chT.bars.dia, fck, fy), { unit: "mm", clause: "IS 456 cl 26.2.1", mode: ">=", note: "deepen the lintel or use smaller bars" });
    }
    Object.assign(out, { bot: bot, top: top, sv: sv, sdia: sdia, d: d, Tu: Tu, tor: tor, Ms: Ms, Mh: Mh, Vs: Vs });
    return out;
  }
  M.lcAnalyse = lcAnalyse;

  function run_lintel(inp, mode) {
    var kind = lcKind(inp), dt = DT();
    var c = new C.Calc(kind === "plinth" ? "Plinth beam" : kind === "chajja" ? "Lintel with chajja" : "RCC lintel");
    var fck = num(inp.fck), fy = num(inp.fy);
    var cover = num(inp.cover), req = RC().required_cover(inp.exposure, "beam");
    c.section("Materials & cover");
    if (mode !== "check" && cover < req) { c.info("Cover adopted", G(cover) + " mm raised to " + G(req) + " mm for " + inp.exposure + " exposure", "IS 456 Table 16"); cover = req; }
    var gmin = MT().EXPOSURE[inp.exposure].min_grade;
    if (mode !== "check" && fck < gmin) { c.info("Concrete grade adopted", "M" + G(fck) + " raised to M" + G(gmin) + " for " + inp.exposure + " exposure", "IS 456 Table 5"); fck = gmin; inp = Object.assign({}, inp, { fck: gmin }); }
    RC().cover_check(c, inp.exposure, cover, fck, "beam");
    if (dt) dt.site_checks(c, "beam", fck, cover);
    var b = num(inp.wall_t);
    if (b < 200) c.warn("Narrow section", "b = " + G(b) + " mm (half-brick wall): only 2 bars per layer, cover " + G(cover) + " mm – consider a 230 mm band or precast lintel", "Practice");
    var sdia = dt && kind === "plinth" ? Math.max(dt.min_dia("beam", "stirrup").dia, num(inp.st_dia)) : num(inp.st_dia);
    if (mode === "check") sdia = num(inp.st_dia);
    // depth
    var span = kind === "plinth" ? num(inp.span) : num(inp.opening) + num(inp.bearing);
    var thumbD = kind === "plinth" ? Math.max(300, ceil_to(span * 1000 / 12, 25)) : Math.max(150, ceil_to(span * 1000 / 12, 25));
    var D, given = null, troot = num(inp.t_root), ttip = num(inp.t_tip);
    if (mode === "check") {
      D = kind === "plinth" ? num(inp.pbD_chk) : num(inp.D_chk);
      given = { bot_n: Math.max(2, Math.trunc(num(inp.bot_n))), bot_dia: num(inp.bot_dia), top_n: Math.max(2, Math.trunc(num(inp.top_n))), top_dia: num(inp.top_dia), st_s: num(inp.st_s),
        main: [num(inp.ch_dia), num(inp.ch_s)], dist: [8, 200] };
    } else if (mode === "thumb") {
      D = thumbD;
      if (kind === "chajja") { troot = Math.max(100, ceil_to(num(inp.proj) * 1000 / 7, 10)); ttip = 75; }
      c.info("Thumb rules", kind === "plinth" ? "Plinth beam ≈ wall thickness × max(300, span/12) mm, 2-12Ø top & bottom, 8Ø @ 150–200" :
        "Lintel D ≈ span/12 (≥ 150 mm), bearing ≥ 150 mm; chajja root ≈ projection/7 (≥ 100) tapering to 75 mm", "CPWD / practice");
    } else {
      D = kind === "plinth" ? 300 : 150;
      for (var it = 0; it < 60; it++) {
        var sc = new C.Calc("s"), chs = null;
        if (kind === "chajja") {
          for (var j = 0; j < 30; j++) { var sc2 = new C.Calc("s"); chs = lcChajja(sc2, inp, mode, troot, ttip, cover, null); if (!sc2.failures.length || troot >= 250) break; troot += 10; }
        }
        lcAnalyse(sc, inp, mode, kind, D, cover, sdia, null, chs);
        if (!sc.failures.length || D >= 900) break;
        D += 25;
      }
    }
    var ch = kind === "chajja" ? lcChajja(c, inp, mode, troot, ttip, cover, given) : null;
    var o = lcAnalyse(c, inp, mode, kind, D, cover, sdia, given, ch);
    // stability of lintel + chajja (gravity) – the torsion path above is the designed path
    if (ch) {
      c.section("Stability of lintel + chajja");
      var wR = o.load.wmasonry_avg;
      var Mr = c.calc("Restoring moment about the outer edge (masonry on lintel + lintel)", "MR", "wR*b/1000/2", "kN·m/m", "", { wR: R(wR, 3), b: o.b });
      c.ok("Overturning: 1.2 Md + 1.4 Ml ≤ 0.9 MR (gravity alone)", 1.2 * ch.Md + 1.4 * ch.Ml <= 0.9 * Mr + 1e-9, { detail: F(1.2 * ch.Md + 1.4 * ch.Ml, ".2f") + " ≤ " + F(0.9 * Mr, ".2f") + " kN·m/m" + (1.2 * ch.Md + 1.4 * ch.Ml > 0.9 * Mr ? " – relies on lintel torsion into the bearings (designed above): keep props until the masonry above is ≥ 1 m and 14 days old" : ""),
        clause: "IS 456 cl 20.1", warn_only: true });
    }
    // thumbs & missing
    c.thumb(kind === "plinth" ? "Plinth beam depth" : "Lintel depth", thumbD, o.D, "mm", kind === "plinth" ? "max(300, span/12)" : "span/12 (≥ 150)", "Practice");
    if (ch) c.thumb("Chajja root thickness", Math.max(100, ceil_to(ch.pc * 1000 / 7, 10)), ch.troot, "mm", "projection/7 (≥ 100), tip 75", "Practice");
    c.thumb("Steel", kind === "plinth" ? 90 : 80, 0, "kg/m³", "lintels ≈ 70–100, plinth beams ≈ 80–110 kg/m³", "Estimator practice");
    if (kind === "plinth") {
      c.miss("DPC 40 mm CC 1:2:4 with water-proofing compound (or 2 coats bitumen) over the plinth beam before the wall starts", "IS 2645 / CPWD spec 4.10", "Important");
      c.miss("Plinth beam bars anchored / lapped in the columns (Ld), laps away from supports; ties as for columns at joints (IS 13920 in zone III+)", "IS 456 cl 26.2 / IS 13920", "Important");
      c.miss("Wall footing / soil below the beam: no support assumed; backfill & plinth filling in layers", "IS 1904", "Advisory");
    } else {
      c.miss("Bearing on masonry: check local crushing under the lintel ends (IS 1905 cl 5.4.1.4) for heavy loads; bed blocks for spans > 2.5 m", "IS 1905", "Advisory");
      c.miss("Keep props under lintels" + (ch ? " and chajjas" : "") + " for 14 days and until the masonry above is ≥ 1 m high", "CPWD specifications", "Important");
      if (ch) c.miss("Drip groove 10 × 10 mm at the chajja soffit edge; top sloped 1 : 40 away from the wall; water-proof the top", "CPWD practice", "Advisory");
      c.miss("Openings near a corner / grouped openings: lintel load from the actual masonry (no arching) – check end distance", "SP 20", "Advisory");
    }
    // ---------------------------------------------------------------- BBS
    var B_ = BB(), nos = Math.max(1, Math.trunc(num(inp.nos))), cv = cover, bbs = [], bm = o.b;
    var Lm = kind === "plinth" ? o.leff : num(inp.opening) + 2 * num(inp.bearing);
    var tag = kind === "plinth" ? "Plinth beam" : "Lintel";
    if (kind === "plinth") {
      var runP = o.leff * 1000 + B_.lap(o.bot.dia, fck, fy), runT = o.leff * 1000 + B_.lap(o.top.dia, fck, fy);
      bbs.push(B_.row(tag, "P1", o.bot.dia, "straight (continuous, one lap per span)", o.bot.n * nos, B_.stock(B_.straight(o.bot.dia, runP), o.bot.dia, fck, fy), "bottom, per span"));
      bbs.push(B_.row(tag, "P2", o.top.dia, "straight (continuous, one lap per span)", o.top.n * nos, B_.stock(B_.straight(o.top.dia, runT), o.top.dia, fck, fy), "top, per span"));
      bbs.push(B_.row(tag, "P3", o.sdia, "closed stirrup, 135° hooks", (Math.floor(o.clear * 1000 / o.sv) + 1) * nos, B_.stirrup(o.sdia, bm, o.D, cv), "@ " + G(o.sv) + " c/c over the clear span"));
    } else {
      var run = Lm * 1000 - 2 * cv;
      bbs.push(B_.row(tag, "L1", o.bot.dia, "U (90° bends up at ends)", o.bot.n * nos, B_.stock(B_.ubar(o.bot.dia, run, Math.min(B_.leg(o.bot.dia), o.D - 2 * cv)), o.bot.dia, fck, fy), "bottom main"));
      bbs.push(B_.row(tag, "L2", o.top.dia, "U (90° bends down at ends)", o.top.n * nos, B_.stock(B_.ubar(o.top.dia, run, Math.min(B_.leg(o.top.dia), o.D - 2 * cv)), o.top.dia, fck, fy), o.Muh > 0 || o.tor ? "top (torsion / hogging)" : "top hangers"));
      bbs.push(B_.row(tag, "L3", o.sdia, "closed stirrup, 135° hooks", (Math.floor(Lm * 1000 / o.sv) + 1) * nos, B_.stirrup(o.sdia, bm, o.D, cv), "@ " + G(o.sv) + " c/c"));
      if (ch) {
        var tipLeg = Math.max(ch.ttip - 2 * cv, 40), downLeg = Math.max(o.D - 2 * cv, 50), botLeg = Math.max(bm - 2 * cv, 50);
        bbs.push(B_.row("Chajja", "CH1", ch.bars.dia, "tip leg + top run + down leg + bottom return in lintel", B_.count(Lm * 1000, ch.bars.spacing, cv) * nos,
          B_.shape(ch.bars.dia, [tipLeg, ch.pc * 1000 + bm - 2 * cv, downLeg, botLeg], [90, 90, 90], 0, "chajja main"), "top, @ " + G(ch.bars.spacing) + " c/c, anchored round the lintel"));
        bbs.push(B_.row("Chajja", "CH2", ch.dist.dia, "straight", Math.max(2, B_.count(ch.pc * 1000, ch.dist.spacing, cv)) * nos, B_.split(ch.dist.dia, Lm * 1000 - 2 * cv, fck, fy), "distribution @ " + G(ch.dist.spacing)));
      }
    }
    // ---------------------------------------------------------------- quantities
    var qty = [], Dm = o.D / 1000, bw = bm / 1000, gr = G(fck);
    if (kind === "plinth") {
      qty.push(Q("RCC M" + gr + " in plinth beams up to plinth level (foundation) (excl. steel & shuttering)", "cum", [row("Plinth beam (clear span)", nos, o.clear, bw, Dm)], [CPWD(), "5.1.2"], CM().rcc_rate(fck)));
      qty.push(Q("Centering & shuttering for plinth beams – both sides", "sqm", [row("Sides", 2 * nos, o.clear, null, Dm)], null, CM().RATE.shutter_wall));
      qty.push(XT().steelQty(bbs, "Plinth beam", "Reinforcement TMT Fe" + G(fy) + " in plinth beams up to plinth (foundation) – cutting, bending, placing"));
      qty.push(Q("Damp-proof course 40 mm CC 1:2:4 with water-proofing compound on plinth beam", "sqm", [row("DPC", nos, o.clear, bw)], [CPWD(), "4.10"]));
    } else {
      var rr = [row("Lintel (opening + 2 bearings)", nos, Lm, bw, Dm)];
      if (ch) rr.push(row("Chajja (mean thickness)", nos, Lm, ch.pc, (ch.troot + ch.ttip) / 2000));
      qty.push(Q("RCC M" + gr + " in lintels" + (ch ? " & chajjas" : "") + " above plinth (excl. steel & shuttering)", "cum", rr, [CPWD(), "5.3"], CM().rcc_rate(fck)));
      var shr = [row("Lintel soffit over the opening", nos, num(inp.opening), bw), row("Lintel sides", 2 * nos, Lm, null, Dm)];
      if (ch) shr.push(row("Chajja soffit", nos, Lm, ch.pc), row("Chajja edge", nos, Lm, null, ch.ttip / 1000), row("Chajja ends", 2 * nos, ch.pc, null, (ch.troot + ch.ttip) / 2000));
      qty.push(Q("Centering & shuttering for lintels" + (ch ? " & chajjas (cantilevers)" : "") + " – soffit, sides & edges", "sqm", shr, null, CM().RATE.shutter_slab));
      qty.push(XT().steelQty(bbs, tag, "Reinforcement TMT Fe" + G(fy) + " – cutting, bending, placing – lintels" + (ch ? " & chajjas" : "") + " (above plinth)"));
      var pl = [row("Lintel soffit", nos, num(inp.opening), bw)];
      if (ch) pl.push(row("Chajja top & soffit", 2 * nos, Lm, ch.pc), row("Chajja edge", nos, Lm, null, ch.ttip / 1000));
      qty.push(Q("12 mm cement plaster 1:4 on exposed RCC of lintels" + (ch ? " & chajjas (with drip mould)" : ""), "sqm", pl, [CPWD(), "13.4.1"]));
    }
    // ---------------------------------------------------------------- drawings
    var sheet = lcDrawing(inp, kind, o, ch, cover);
    var steelKg = C.sum(bbs.map(function (x) { return x.weight; }));
    var vol = C.sum(qty.filter(function (q) { return q.unit === "cum"; }).map(function (q) { return q.quantity; }));
    var summary = {};
    summary[kind === "plinth" ? "Plinth beam" : "Lintel"] = G(bm) + " × " + G(o.D) + " mm" + (kind === "plinth" ? ", span " + F(o.leff, ".2f") + " m (" + String(inp.pb_type) + ")" : ", opening " + F(num(inp.opening), ".2f") + " m, leff " + F(o.leff, ".2f") + " m");
    summary["Bars"] = o.bot.n + "-" + G(o.bot.dia) + "Ø bottom, " + o.top.n + "-" + G(o.top.dia) + "Ø top, 2L-" + G(o.sdia) + "Ø @ " + G(o.sv);
    if (kind !== "plinth") summary["Load"] = o.load.arch ? o.load.ang + "° triangle (arching), W = " + F(o.load.Wm, ".1f") + " kN" : "full masonry " + F(num(inp.h_above), ".2f") + " m";
    if (ch) { summary["Chajja"] = F(ch.pc, ".2f") + " m, " + G(ch.troot) + " → " + G(ch.ttip) + " mm, " + G(ch.bars.dia) + "Ø @ " + G(ch.bars.spacing) + " top, " + G(ch.dist.dia) + "Ø @ " + G(ch.dist.spacing) + " dist."; summary["Torsion"] = "Tu = " + F(o.Tu, ".2f") + " kN·m at supports"; }
    summary["Moments"] = "Mu = " + F(o.Mu, ".1f") + (o.Muh > 0 ? " / −" + F(o.Muh, ".1f") : "") + " kN·m, Vu = " + F(o.Vu, ".1f") + " kN";
    summary["Steel"] = F(steelKg, ".1f") + " kg for " + nos + " no. (" + F(steelKg / Math.max(vol, 1e-9), ".0f") + " kg/m³)";
    summary["Max utilisation"] = F(c.max_utilisation, ".2f");
    var refs = ["IS 1905:1987 – Masonry (bearing, arching)", "SP 20:1991 – Handbook on masonry design (lintel load triangle)", "IS 875 (Part 1 & 2) – Dead & imposed loads"].concat(RCC_REFS);
    return C.DesignResult({ module: "lintel_chajja", title: kind === "plinth" ? "Plinth beam" : kind === "chajja" ? "Lintel with chajja (sunshade)" : "RCC lintel", inputs: inp, calc: c, summary: summary,
      drawings: [sheet], quantities: qty, bbs: bbs, tables: {}, references: refs });
  }
  M.run_lintel = run_lintel;

  function lcDrawing(inp, kind, o, ch, cover) {
    var D_ = DR(), D = o.D, b = o.b, views = [];
    if (kind === "plinth") {
      var L = o.leff * 1000, cw = num(inp.col_w) * 1000, hw = Math.min(num(inp.wall_h) * 1000, 1500);
      var e = new D_.View("Plinth beam – elevation (one span)");
      e.rect(-cw / 2, -600, cw, 600 + D + hw, "OUTLINE", "concrete"); e.rect(L - cw / 2, -600, cw, 600 + D + hw, "OUTLINE", "concrete");
      e.rect(cw / 2, 0, L - cw, D, "OUTLINE", "concrete"); e.rect(cw / 2, D, L - cw, 40, "THIN");
      e.rect(cw / 2, D + 40, L - cw, hw - 40, "THIN"); e.text(L / 2, D + hw / 2, "brick wall " + G(b) + " (DPC 40 below)", 2.0, { anchor: "middle" });
      e.line(cw / 2 - 300, cover + o.sdia + o.bot.dia / 2, L - cw / 2 + 300, cover + o.sdia + o.bot.dia / 2, "REBAR");
      e.line(cw / 2 - 300, D - cover - o.sdia - o.top.dia / 2, L - cw / 2 + 300, D - cover - o.sdia - o.top.dia / 2, "REBAR");
      for (var x = cw / 2 + 50; x < L - cw / 2; x += Math.max(o.sv, (L - cw) / 30)) e.line(x, cover, x, D - cover, "REBAR");
      e.line(-cw, -200, L + cw, -200, "SOIL"); e.text(L + cw, -150, "GL", 1.8, { anchor: "end" });
      e.dim(0, -600, L, -600, 8, "SPAN c/c " + F(L, ",.0f")); e.dim(L - cw / 2, 0, L - cw / 2, D, -8);
      e.text(L / 2, -350, "P1 " + o.bot.n + "-" + G(o.bot.dia) + "Ø bottom, P2 " + o.top.n + "-" + G(o.top.dia) + "Ø top, P3 " + G(o.sdia) + "Ø @ " + G(o.sv), 2.0, { anchor: "middle" });
      views.push(e);
    } else {
      var lo = num(inp.opening) * 1000, bw = num(inp.bearing) * 1000, Lm = lo + 2 * bw, ht = o.load.ht * 1000, hm = Math.min(num(inp.h_above) * 1000, Math.max(ht * 1.3, 600));
      var ev = new D_.View("Lintel – elevation & load");
      ev.rect(-bw - 600, -1200, 600, 1200 + D + hm, "THIN"); ev.rect(lo + bw, -1200, 600, 1200 + D + hm, "THIN");
      ev.rect(0, -1200, lo, 1200, "HIDDEN"); ev.text(lo / 2, -600, "OPENING " + F(lo, ",.0f"), 2.0, { anchor: "middle" });
      ev.rect(-bw, 0, Lm, D, "OUTLINE", "concrete");
      if (o.load.arch) ev.poly([[lo / 2 - o.leff * 500, D], [lo / 2, D + ht], [lo / 2 + o.leff * 500, D]], true, "LOAD");
      else ev.rect(-bw, D, Lm, Math.min(num(inp.h_above) * 1000, hm), "LOAD");
      ev.text(lo / 2, D + Math.min(ht, hm) + 120, o.load.arch ? o.load.ang + "° load triangle (arching)" : "full masonry load", 2.0, { anchor: "middle" });
      ev.poly([[-bw + cover, cover + 60], [-bw + cover, cover], [lo + bw - cover, cover], [lo + bw - cover, cover + 60]], false, "REBAR");
      ev.line(-bw + cover, D - cover, lo + bw - cover, D - cover, "REBAR");
      for (var xs = -bw + 50; xs < lo + bw - 50; xs += Math.max(o.sv, Lm / 25)) ev.line(xs, cover, xs, D - cover, "REBAR");
      ev.dim(-bw, -1200, 0, -1200, 6, "BRG " + F(bw, ",.0f")); ev.dim(0, -1200, lo, -1200, 6);
      ev.dim(lo + bw, 0, lo + bw, D, -8);
      ev.text(lo / 2, -1750, "L1 " + o.bot.n + "-" + G(o.bot.dia) + "Ø bottom, L2 " + o.top.n + "-" + G(o.top.dia) + "Ø top, L3 2L-" + G(o.sdia) + "Ø @ " + G(o.sv), 2.0, { anchor: "middle" });
      views.push(ev);
    }
    views.push(CM().stirrup_section_view(b, D, cover, [o.top.n, o.top.dia], [o.bot.n, o.bot.dia], [2, o.sdia, o.sv], "Section " + G(b) + " × " + G(D)));
    if (ch) {
      var s = new D_.View("Lintel + chajja – cross section"), pc = ch.pc * 1000, tr = ch.troot, tt = ch.ttip;
      s.rect(0, 0, b, D, "OUTLINE", "concrete");
      s.poly([[b, D], [b + pc, D - tr + tt], [b + pc, D - tr], [b, D - tr]], true, "OUTLINE", "concrete");
      s.rect(0, D, b, 600, "THIN"); s.rect(0, -600, b, 600, "HIDDEN");
      var cv = cover;
      s.poly([[b + pc - cv, D - tr + cv], [b + pc - cv, D - tr + tt - cv], [cv, D - cv], [cv, cv + 20], [b - cv, cv + 20]], false, "REBAR");
      for (var k = 0; k < 4; k++) s.bar_dot(b + 60 + (pc - 120) * k / 3, D - cv - ch.bars.dia - ch.dist.dia / 2 - (tr - tt) * (60 + (pc - 120) * k / 3) / pc, ch.dist.dia);
      s.rect(cv, cv, b - 2 * cv, D - 2 * cv, "REBAR");
      s.line(b + pc - 20, D - tr, b + pc - 20, D - tr + 10, "THIN");
      s.text(b + pc / 2, D + 250, "CH1 " + G(ch.bars.dia) + "Ø @ " + G(ch.bars.spacing) + " top, bent down into lintel; CH2 " + G(ch.dist.dia) + "Ø @ " + G(ch.dist.spacing), 1.8, { anchor: "middle" });
      s.text(b + pc / 2, D - tr - 200, "drip groove 10×10", 1.6, { anchor: "middle" });
      s.dim(b, D - tr, b + pc, D - tr, 8, "PROJ " + F(pc, ",.0f")); s.dim(0, 0, 0, D, 8);
      s.dim(b + pc, D - tr, b + pc, D - tr + tt, -6);
      views.push(s);
    }
    var notes = ["Concrete M" + G(num(inp.fck)) + ", steel Fe" + G(num(inp.fy)) + ", clear cover " + G(cover) + " mm; stirrups closed with 135° hooks.",
      kind === "plinth" ? "Plinth beam bars continuous through columns, laps at mid-span (bottom) / near supports (top) staggered; DPC 40 mm on top." :
        "Bearing " + G(num(inp.bearing) * 1000) + " mm each end on full bricks in CM 1:4; props left for 14 days.",
      ch ? "Chajja top bars anchored through the lintel and bent down; chajja and lintel cast together (no joint)." : "Number of members: " + Math.max(1, Math.trunc(num(inp.nos))) + "."];
    return new D_.Sheet(kind === "plinth" ? "Plinth beam" : ch ? "Lintel with chajja" : "RCC lintel", kind === "plinth" ? "PB-01" : "LT-01", views, notes);
  }

  var LC_PARAMS = [
    P("member", "Member", LC_MEMBER[1], { kind: "select", options: LC_MEMBER.slice(), group: "Member" }),
    P("wall_t", "Wall thickness (= member width)", 230.0, "mm", { kind: "select", options: [115.0, 230.0, 345.0], group: "Member" }),
    P("opening", "Clear span of opening", 1.2, "m", { min: 0.5, max: 4.0, step: 0.05, group: "Lintel", when: function (v) { return !/^Plinth/.test(String(v.member)); } }),
    P("bearing", "Bearing on each wall", 0.2, "m", { min: 0.1, max: 0.4, step: 0.01, group: "Lintel", when: function (v) { return !/^Plinth/.test(String(v.member)); } }),
    P("h_above", "Height of masonry above lintel", 2.0, "m", { min: 0.2, max: 6, step: 0.05, group: "Lintel", when: function (v) { return !/^Plinth/.test(String(v.member)); } }),
    P("load_rule", "Masonry load on lintel", LC_RULE[0], { kind: "select", options: LC_RULE.slice(), group: "Lintel", when: function (v) { return !/^Plinth/.test(String(v.member)); },
      help: "Arching needs masonry above ≥ 1.25 × triangle height and the opening ≥ leff/2 from a wall end; otherwise the full masonry height is taken" }),
    P("end_dist", "Distance of opening from wall end / corner", 1.0, "m", { min: 0, max: 10, step: 0.05, group: "Lintel", when: function (v) { return !/^Plinth/.test(String(v.member)); } }),
    P("slab_w", "Slab / beam load on the wall above (0 = none)", 0.0, "kN/m", { min: 0, max: 100, group: "Lintel", when: function (v) { return !/^Plinth/.test(String(v.member)); } }),
    P("slab_h", "Height of that slab bearing above the lintel", 1.0, "m", { min: 0, max: 6, step: 0.05, group: "Lintel", when: function (v) { return !/^Plinth/.test(String(v.member)); } }),
    P("proj", "Chajja projection", 0.6, "m", { min: 0.3, max: 1.2, step: 0.05, group: "Chajja", when: function (v) { return /chajja/i.test(String(v.member)); } }),
    P("t_root", "Chajja thickness at root", 100.0, "mm", { min: 75, max: 250, step: 5, group: "Chajja", when: function (v) { return /chajja/i.test(String(v.member)); } }),
    P("t_tip", "Chajja thickness at tip", 75.0, "mm", { min: 60, max: 200, step: 5, group: "Chajja", when: function (v) { return /chajja/i.test(String(v.member)); } }),
    P("ll", "Chajja live load", 0.75, "kN/m²", { min: 0.5, max: 5, step: 0.05, group: "Chajja", when: function (v) { return /chajja/i.test(String(v.member)); } }),
    P("finish", "Chajja finishes / water-proofing", 0.5, "kN/m²", { min: 0, max: 3, step: 0.05, group: "Chajja", when: function (v) { return /chajja/i.test(String(v.member)); } }),
    P("span", "Span between columns (c/c)", 4.0, "m", { min: 1.5, max: 8, step: 0.05, group: "Plinth beam", when: function (v) { return /^Plinth/.test(String(v.member)); } }),
    P("col_w", "Column size along the beam", 0.3, "m", { min: 0.2, max: 0.8, step: 0.025, group: "Plinth beam", when: function (v) { return /^Plinth/.test(String(v.member)); } }),
    P("pb_type", "Span type", PB_TYPE[0], { kind: "select", options: PB_TYPE.slice(), group: "Plinth beam", when: function (v) { return /^Plinth/.test(String(v.member)); } }),
    P("wall_h", "Height of wall on the plinth beam", 3.0, "m", { min: 0.5, max: 6, step: 0.05, group: "Plinth beam", when: function (v) { return /^Plinth/.test(String(v.member)); } }),
    P("extra", "Other load on the wall (roof / slab)", 0.0, "kN/m", { min: 0, max: 100, group: "Plinth beam", when: function (v) { return /^Plinth/.test(String(v.member)); } }),
    P("gamma_m", "Masonry unit weight (incl. plaster)", 20.0, "kN/m³", { min: 10, max: 24, group: "Loads" }),
    P("st_dia", "Stirrup diameter", 6.0, "mm", { kind: "select", options: [6.0, 8.0, 10.0], group: "Detailing" }),
    P("nos", "Number of identical members (quantity)", 10, { kind: "int", min: 1, max: 1000, group: "Quantity" })
  ].concat(matParams(30.0, "Moderate", 25.0, [20.0, 25.0, 30.0, 35.0]), [
    P("D_chk", "Lintel depth D (check)", 200.0, "mm", { min: 100, max: 900, step: 25, group: "My design", modes: CHECK, when: function (v) { return !/^Plinth/.test(String(v.member)); } }),
    P("pbD_chk", "Plinth beam depth D (check)", 300.0, "mm", { min: 150, max: 900, step: 25, group: "My design", modes: CHECK, when: function (v) { return /^Plinth/.test(String(v.member)); } }),
    P("bot_n", "Bottom bars – number (check)", 2, { kind: "int", min: 2, max: 8, group: "My design", modes: CHECK }),
    P("bot_dia", "Bottom bars – dia (check)", 12.0, "mm", { kind: "select", options: [8.0, 10.0, 12.0, 16.0, 20.0], group: "My design", modes: CHECK }),
    P("top_n", "Top bars – number (check)", 2, { kind: "int", min: 2, max: 8, group: "My design", modes: CHECK }),
    P("top_dia", "Top bars – dia (check)", 12.0, "mm", { kind: "select", options: [8.0, 10.0, 12.0, 16.0, 20.0], group: "My design", modes: CHECK }),
    P("st_s", "Stirrup spacing (check)", 75.0, "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK }),
    P("ch_dia", "Chajja main bar dia (check)", 8.0, "mm", { kind: "select", options: [8.0, 10.0, 12.0], group: "My design", modes: CHECK, when: function (v) { return /chajja/i.test(String(v.member)); } }),
    P("ch_s", "Chajja main bar spacing (check)", 150.0, "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK, when: function (v) { return /chajja/i.test(String(v.member)); } })
  ]);
  M.LC_PARAMS = LC_PARAMS;
  C.register({ id: "lintel_chajja", phase: 1, category: "RCC building", name: "Lintel, chajja & plinth beam", icon: "🪟",
    description: "RCC lintel over an opening (60° / 45° arching triangle or full masonry, slab load, bearing & anchorage), lintel with chajja / sunshade " +
      "(tapered cantilever, top bars anchored in the lintel, IS 456 cl 41 torsion, overturning) and plinth beam on wall footing (IS 456 Table 12/13), BBS & quantities × number of members.",
    params: LC_PARAMS, run: run_lintel, references: RCC_REFS });
})();
