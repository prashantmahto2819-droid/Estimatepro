/* Design Studio — modules_shed: COMPLETE STEEL SHED – FOOTING TO ROOF (new module; not a Python port).
   Phase 2 – Steel structures. IS 800:2007 (LSM), IS 875 Parts 1/2/3:2015, IS 1893-1:2016 (note), IS 456:2000, IS 1367,
   IS 1364, IS 5624 (foundation bolts), IS 2062, IS 811 (cold-formed purlins), SP 6(1), SP 34.

   Module id "steel_shed" (modes design + check). One run designs and details, every step through Calc:
     roof & wall sheeting (span / fastener check), purlins (ISMC / CF-Z / ISA, biaxial, sag rods, uplift LTB, deflection),
     sag rods, girts, eave strut, main frames (portal rolled / tapered PEB / truss on columns – Pratt, Howe, Fink /
     mono-slope) analysed with DS.frame2d for all IS 800 Table 4 combinations incl. uplift and crane,
     rafter / column / truss member design (classification, LTB, cl 9.3.2.2), deflection (IS 800 Table 6),
     knee & apex end-plate moment connections (bolt tension + shear interaction cl 10.3.6, prying cl 10.4.7,
     end plate, stiffeners, welds cl 10.5), purlin / girt cleats, bracing (roof & wall, rod / angle / K) with
     gussets & bolts, truss joint bolts & gussets, gable columns & end rafters, crane gantry & bracket (simplified),
     base plate (pinned / fixed), anchor bolts (tension, shear, embedment, washer plate), shear key, grout,
     pedestal + isolated footing (bearing, uplift, overturning, sliding – IS 456 cl 20), plinth / tie beam,
     bill of materials (member / plate / bolt / anchor / weld / sheeting schedules), quantities, BBS and A3 drawings.
   Run context: DS.core.ctx.site ("general" | "mine") and .detail ("practice" | "code"). */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var C = DS.core, LD = DS.loads, S = DS.steel, MT = DS.materials, SC = DS.sections;
  var M = DS.modules_shed = {};
  var F = C.pyfmt, R = C.pyround, Calc = C.Calc;
  var GM0 = MT.GAMMA_M0, GM1 = MT.GAMMA_M1, GMB = MT.GAMMA_MB, GMW_S = MT.GAMMA_MW_SHOP, GMW_F = MT.GAMMA_MW_FIELD;
  var E_ST = MT.E_STEEL, E_KN = MT.E_STEEL * 1e3;
  var section = SC.section;

  /* ------------------------------------------------------------------ small helpers */
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function rad(d) { return d * Math.PI / 180; }
  function deg(r) { return r * 180 / Math.PI; }
  function maxOf(a) { return a.length ? Math.max.apply(null, a) : 0; }
  function minOf(a) { return a.length ? Math.min.apply(null, a) : 0; }
  function sumOf(a) { return a.reduce(function (s, x) { return s + x; }, 0); }
  function last(a) { return a[a.length - 1]; }
  function up(x, s) { return C.ceil_to(x, s); }
  function g(x) { return F(x, "g"); }
  function f0(x) { return F(x, ".0f"); }
  function f1(x) { return F(x, ".1f"); }
  function f2(x) { return F(x, ".2f"); }
  function fc0(x) { return F(x, ",.0f"); }
  function firstOk(list, pred) { for (var i = 0; i < list.length; i++) if (pred(list[i], i)) return list[i]; return null; }
  M._h = { num: num, rad: rad, deg: deg };

  var RATE = (DS.common && DS.common.RATE) || {};
  function rate(k, d) { return RATE[k] != null ? RATE[k] : d; }
  var CPWD = "CPWD_DSR_2021";
  /* quantity helpers (same semantics as DS.common.Q / row / kg_row, kept local so this module is independent) */
  function Q(desc, unit, rows, link, rt, note) { return C.QtyItem({ description: desc, unit: unit, rows: rows, link: link || null, rate: rt || 0, note: note || "" }); }
  function row(desc, nos, L, B, D) {
    return { description: desc, nos: nos == null ? null : nos, length: L == null ? null : R(L, 3), breadth: B == null ? null : R(B, 3), depth: D == null ? null : R(D, 3) };
  }
  function kg_row(desc, nos, L, kgm) { return { description: desc + " (Nos × L m × kg/m)", nos: nos, length: R(L, 3), breadth: R(kgm, 3), depth: null }; }
  function rowQty(r) { var v = ["nos", "length", "breadth", "depth"].map(function (k) { return r[k]; }).filter(function (x) { return x !== null && x !== undefined && x !== ""; }); return v.length ? v.reduce(function (a, b) { return a * b; }, 1) : 0; }

  /* standard sizes */
  var PLATE_T = [6, 8, 10, 12, 16, 20, 25, 32, 40, 50];
  var BOLT_D = [12, 16, 20, 24, 30];
  M.PLATE_T = PLATE_T; M.BOLT_D = BOLT_D;
  function plate_t(t) { return firstOk(PLATE_T, function (x) { return x >= t - 1e-9; }) || last(PLATE_T); }
  function hole(d) { return d <= 14 ? d + 1 : d <= 24 ? d + 2 : d + 3; }                  // IS 800 Table 19
  var PITCH = { 12: 1.75, 16: 2.0, 20: 2.5, 24: 3.0, 27: 3.0, 30: 3.5, 36: 4.0 };          // IS 4218 coarse
  var WASHER_T = { 12: 2.5, 16: 3.0, 20: 3.0, 24: 4.0, 27: 4.0, 30: 4.0, 36: 5.0 };        // IS 2016
  function nut_h(d, hsfg) { return hsfg ? d : Math.ceil(0.8 * d); }                       // IS 1363 / IS 6623 (approx.)
  /* bolt length = grip + washer + nut + 2 thread pitches, rounded up to 5 mm (IS 1364 / IS 1367 practice) */
  function bolt_len(grip, d, hsfg) { return up(grip + WASHER_T[d] + nut_h(d, hsfg) + 2 * PITCH[d], 5); }
  M.bolt_len = bolt_len;
  /* bolt mass incl. hex head, one nut, one washer (kg) — for the bolt schedule */
  function bolt_kg(d, L) { return (Math.PI * d * d / 4 * L + 2 * 0.7 * 1.5 * d * 1.5 * d * 0.8 * d + Math.PI / 4 * (4 * d * d - d * d) * WASHER_T[d]) * 7.85e-6; }
  /* minimum fillet weld, IS 800 Table 21 (thicker part) */
  function weld_min(t) { return t <= 10 ? 3 : t <= 20 ? 5 : t <= 32 ? 6 : 8; }
  function weld_round(s) { return firstOk([3, 4, 5, 6, 8, 10, 12, 14, 16], function (x) { return x >= s - 1e-9; }) || 16; }
  /* surface area per metre (m²/m) for painting */
  function perim(sec) {
    if (!sec) return 0;
    if (sec.family === "ISA") return 4 * sec.leg / 1000;
    if (sec.family === "2ISA") return 8 * sec.leg / 1000;
    if (sec.family === "ROD") return Math.PI * sec.d / 1000;
    if (sec.family === "CFZ") return 2 * (sec.h + 2 * sec.b + 2 * sec.c) / 1000;
    if (sec.family === "ISMC") return (2 * sec.h + 4 * sec.b - 2 * sec.tw) / 1000;
    return (2 * sec.h + 4 * sec.b - 2 * sec.tw) / 1000;
  }
  M.perim = perim;

  /* ------------------------------------------------------------------ cold-formed lipped Z purlins (IS 811, E350) */
  /* thin-walled centre-line properties; the Z principal axes are inclined – handled by sag rods + sheeting (flagged) */
  M.CFZ = [[120, 50, 15, 1.6], [120, 50, 15, 2.0], [150, 60, 20, 1.6], [150, 60, 20, 2.0], [150, 60, 20, 2.5], [175, 60, 20, 2.0],
    [175, 60, 20, 2.5], [200, 60, 20, 2.0], [200, 60, 20, 2.5], [200, 75, 20, 3.0], [250, 75, 20, 2.5], [250, 75, 20, 3.0], [300, 75, 20, 3.0]];
  M.zsec = function (h, b, cl, t) {
    var A = t * (h + 2 * b + 2 * cl);
    var Iz = t * h * h * h / 12 + 2 * b * t * Math.pow(h / 2, 2) + 2 * (t * cl * cl * cl / 12 + cl * t * Math.pow(h / 2 - cl / 2, 2));
    var Iy = 2 * t * b * b * b / 3 + 2 * cl * t * b * b;
    var It = A * t * t / 3, Iw = Iy * h * h / 4 * 0.5;
    var name = "Z " + g(h) + "x" + g(b) + "x" + g(cl) + "x" + g(t);
    return { name: name, family: "CFZ", w: A * 7.85e-3, A: A, h: h, b: b, c: cl, tf: t, tw: t, t: t, Iz: Iz, Iy: Iy,
      rz: Math.sqrt(Iz / A), ry: Math.sqrt(Iy / A), Zez: Iz / (h / 2), Zey: Iy / b, Zpz: 1.12 * Iz / (h / 2), Zpy: 1.12 * Iy / b, It: It, Iw: Iw };
  };
  M.ZNAMES = M.CFZ.map(function (z) { return M.zsec(z[0], z[1], z[2], z[3]).name; });
  /* section lookup incl. Z purlins, rods ("RD 16") and double angles ("2-ISA …") */
  function sec_of(name) {
    if (/^Z /.test(name)) { var v = name.slice(2).split("x").map(Number); return M.zsec(v[0], v[1], v[2], v[3]); }
    if (/^RD /.test(name)) { var d = Number(name.slice(3)); return { name: name, family: "ROD", d: d, A: Math.PI * d * d / 4, w: d * d / 162 }; }
    if (/^2-/.test(name)) { var s = SC.double_angle(name.slice(2)); s.name = name; return s; }
    return section(name);
  }
  M.sec_of = sec_of;
  function ang_props(name) {            // single angle as a pseudo-I for bending helpers
    var s = section(name);
    return Object.assign({}, s, { Zez: s.Zxx, Zey: s.Zxx, Zpz: 1.12 * s.Zxx, Zpy: 1.12 * s.Zxx, Iz: s.Ixx, Iy: s.Ixx, h: s.leg, b: s.leg, tf: s.t, tw: s.t, It: 0, Iw: 0, ry: s.rvv, rz: s.rxx });
  }

  /* ------------------------------------------------------------------ style & options */
  var STYLES = M.STYLES = ["Portal frame – rolled I-sections", "Portal frame – tapered/built-up (PEB style)", "Truss on columns – Pratt",
    "Truss on columns – Howe", "Truss on columns – Fink (W)", "Mono-slope (lean-to) portal"];
  function kind_of(style) {
    if (style === STYLES[1]) return "peb";
    if (/^Truss/.test(style)) return "truss";
    if (/^Mono/.test(style)) return "mono";
    return "portal";
  }
  M.kind_of = kind_of;
  var GABLE = ["Main frame at gable (same as interior)", "Gable (wind) columns + end rafter"];
  var BRACING = ["X-rod (tension only, with turnbuckle)", "X-angle (tension only)", "K-bracing (angles, tension + compression)"];
  var OPEN = ["None – fully clad", "One long side open", "Both long sides open"];
  var PURLIN_FAM = ["ISMC (hot-rolled channel)", "Cold-formed Z (IS 811, galvanised)", "ISA (angle)"];
  var DUST = ["Auto (mine site: dust via the site profile in services; else 0)", "0 – none", "0.25", "0.50", "0.75", "1.00"];
  var DUST_AUTO_OLD = "Auto (0.50 kN/m² at mine site, else 0)";     // saved inputs from earlier versions
  var CRANE_CLASS = ["EOT – electrically operated (impact 25 %)", "Hand-operated (impact 10 %)"];
  var ZONES = ["II", "III", "IV", "V"];
  M.OPTIONS = { STYLES: STYLES, GABLE: GABLE, BRACING: BRACING, OPEN: OPEN, PURLIN_FAM: PURLIN_FAM, DUST: DUST };
  /* cities named in IS 875-3 Annex A are used as tabulated; Korba / Bilaspur / Gevra read from the Fig. 1 map */
  var NOT_ANNEX = { "Korba": 1, "Bilaspur (CG)": 1, "Gevra (Korba)": 1 };

  var STEEL_REFS = M.STEEL_REFS = ["IS 800:2007 – General construction in steel (LSM)", "IS 875 Part 1, 2 & 3:2015 – Loads (dead, imposed, wind)",
    "IS 1893 (Part 1):2016 – Seismic (note only)", "IS 808 / SP 6(1) – Rolled steel sections", "IS 811 – Cold-formed light gauge sections",
    "IS 2062 – Structural steel", "IS 1367 / IS 1364 / IS 6639 – Bolts, nuts, washers", "IS 5624 – Foundation (anchor) bolts",
    "IS 456:2000 – Plain & reinforced concrete (foundations)", "SP 34 – Detailing of reinforcement", "IS 9595 / IS 814 – Welding & electrodes",
    "N. Subramanian – Design of Steel Structures (Oxford)", "INSDAG – Teaching resource / Design of steel sheds"];

  /* =========================================================================== geometry */
  M.geometry = function (c, inp, ovr) {
    ovr = ovr || {};
    var style = inp.style, kind = kind_of(style);
    var span = num(inp.span), bay = num(inp.bay), nb = Math.max(1, Math.round(num(inp.n_bays))), eave = num(inp.eave);
    var slope, rise, h2 = eave;
    c.section("Geometry & framing layout");
    c.info("Framing system (style / pattern)", style + "; column base " + inp.base + "; gable: " + inp.gable + "; bracing: " + inp.bracing, "");
    c.let("Span (c/c of columns)", "L", span, "m");
    c.let("Bay spacing × number of bays", "s × n", g(bay) + " × " + C.pystr(nb), "m");
    var length = c.calc("Length of shed", "Lb", "s*n", "m", "", { s: bay, n: nb });
    c.let("Eave height (top of column at knee)", "h", eave, "m");
    if (kind === "truss") {
      rise = c.calc("Truss rise", "r", "L/k", "m", "", "span / rise ratio k (Pratt / Howe / Fink practice L/4 – L/6)", { L: span, k: num(inp.truss_rise) });
      slope = c.calc("Roof slope", "θ", "degrees(atan(2*r/L))", "°", "", { r: rise, L: span });
    } else if (kind === "mono") {
      slope = c.let("Roof slope", "θ", num(inp.slope), "°");
      rise = c.calc("Rise over span (mono-slope)", "r", "L*tan(radians(th))", "m", "", { L: span, th: slope });
      h2 = c.calc("High-side eave height", "h2", "h + r", "m", "", { h: eave, r: rise });
    } else {
      slope = c.let("Roof slope", "θ", num(inp.slope), "°");
      rise = c.calc("Rise to ridge", "r", "L/2*tan(radians(th))", "m", "", { L: span, th: slope });
    }
    var ridge = c.calc("Ridge / highest point", "hr", "h + r", "m", "", { h: eave, r: rise });
    var raf_len = kind === "mono" ? c.calc("Rafter length (on slope)", "Lr", "sqrt(L**2 + r**2)", "m", "", { L: span, r: rise })
      : c.calc("Rafter / top-chord length each side (on slope)", "Lr", "sqrt((L/2)**2 + r**2)", "m", "", { L: span, r: rise });
    if (slope < 5 && kind !== "truss") c.warn("Flat roof slope", "θ < 5° – check ponding and sheet manufacturer's minimum slope (usually ≥ 5–6°)", "IS 875-3 Table 6");
    if (kind === "mono" && span > 15) c.warn("Wide mono-slope", "mono-slope (lean-to) spans > 15 m are uneconomical (one rafter, tall high-side column) – consider a duo-pitch portal", "Practice");
    if (/Fink/.test(style) && span > 24) c.warn("Long Fink truss", "Fink trusses are economical up to ≈ 24 m; top chord carries purlins between nodes – consider Pratt / Howe or PEB", "Practice");
    if (kind === "truss" && slope < 12) c.warn("Shallow truss", "truss slope < 12° gives large chord forces – use span/rise ≤ 6", "Practice");
    var ps_in = ovr.ps || num(inp.purlin_spacing), n_purl, ps, nh = 0, n_pan = 0, off_node = false;
    if (kind === "truss") {
      if (/Fink/.test(style)) {
        nh = raf_len / 2 <= 1.05 * ps_in ? 2 : 4;
        n_purl = Math.ceil(raf_len / ps_in - 1e-9) + 1;
        if ((n_purl - 1) % nh !== 0) n_purl = Math.ceil((n_purl - 1) / nh) * nh + 1;
        off_node = n_purl - 1 > nh;
      } else {
        var np0 = Math.max(2, Math.ceil(raf_len / ps_in - 0.05));
        if (np0 <= 6) { nh = np0; n_purl = nh + 1; }
        else { nh = Math.max(2, Math.ceil(raf_len / (2 * ps_in) - 0.05)); n_purl = 2 * nh + 1; off_node = true; }
      }
      n_pan = 2 * nh;
      c.let("Truss panels (top chord, total)", "np", n_pan, "", "", "purlins at panel points" + (off_node ? " and at mid-panel (top chord in local bending)" : ""));
    } else {
      n_purl = Math.ceil(raf_len / ps_in - 1e-9) + 1;
    }
    n_purl = Math.max(n_purl, 2);
    ps = c.calc("Purlin spacing adopted (on slope)", "sp", "Lr/(n - 1)", "m", "", (kind === "mono" ? "" : "per slope ") + C.pystr(n_purl) + " purlin lines incl. eave & ridge purlins", { Lr: raf_len, n: n_purl });
    var clad = !!inp.clad_walls, openL = !!inp.open_L, openR = !!inp.open_R, openF = !!inp.open_F, openB = !!inp.open_B, open = openL || openR || openF || openB;
    var gs_in = ovr.gs || num(inp.girt_spacing), rowsL = 0, rowsR = 0, gsp = 0;
    if (clad) {
      rowsL = openL ? 0 : Math.max(1, Math.ceil((eave - 0.3) / gs_in - 1e-9));
      rowsR = openR ? 0 : Math.max(1, Math.ceil((h2 - 0.3) / gs_in - 1e-9));
      var sL_ = rowsL ? (eave - 0.3) / rowsL : 0, sR_ = rowsR ? (h2 - 0.3) / rowsR : 0;
      var hg = sL_ >= sR_ ? eave : h2, ng = sL_ >= sR_ ? rowsL : rowsR;
      if (ng > 0) gsp = c.calc("Girt spacing adopted (side walls)", "sg", "(h - 0.3)/n", "m", "", "bottom runner at +0.30 m (plinth / dado); eave strut takes the top edge", { h: hg, n: ng });
      else gsp = c.calc("Girt spacing adopted (gable walls only – long sides open)", "sg", "(h - 0.3)/n", "m", "", "n = rows at ≤ the input girt spacing " + g(gs_in) + " m", { h: eave, n: Math.max(1, Math.ceil((eave - 0.3) / gs_in - 1e-9)) });
    }
    var G = { style: style, kind: kind, span: span, bay: bay, n_bays: nb, n_frames: nb + 1, length: length, eave: eave, h2: h2, slope: slope,
      rise: rise, ridge: ridge, raf_len: raf_len, ps: ps, n_purl: n_purl, nh: nh, n_pan: n_pan, off_node: off_node, clad: clad, open: open,
      rowsL: rowsL, rowsR: rowsR, gsp: gsp || gs_in, fixed: inp.base === "Fixed", gable_cols: inp.gable === GABLE[1], area: span * length };
    G.walls_open_L = !clad || openL;
    G.walls_open_R = !clad || openR;
    /* sheeting only between some posts of a long side: bays numbered 1… from the front gable */
    G.baysL = G.walls_open_L ? [] : C.bayList(inp.clad_bays_L, nb); G.baysR = G.walls_open_R ? [] : C.bayList(inp.clad_bays_R, nb);
    G.fL = G.walls_open_L ? 0 : G.baysL ? G.baysL.length / nb : 1; G.fR = G.walls_open_R ? 0 : G.baysR ? G.baysR.length / nb : 1;
    if (G.baysL && !G.baysL.length && !G.walls_open_L) { G.walls_open_L = true; G.rowsL = 0; }
    if (G.baysR && !G.baysR.length && !G.walls_open_R) { G.walls_open_R = true; G.rowsR = 0; }
    G.partial = (G.fL > 0 && G.fL < 1) || (G.fR > 0 && G.fR < 1);
    if (G.partial) G.open = true;
    c.let("Plan area", "A", R(G.area, 2), "m²");
    if (length > 120) c.warn("Expansion joint", "Length " + f0(length) + " m > 120 m along purlins – provide a temperature (expansion) joint / slotted purlin connection", "IS 800 cl 3 (expansion joints)");
    else c.info("Temperature effects", "Length ≤ 120 m along purlins and span ≤ 150 m – no expansion joint required; temperature range per IS 875-5 not separately analysed", "IS 800 cl 3.5 / IS 875-5");
    return G;
  };

  /* =========================================================================== dead & imposed loads */
  M.loads = function (c, inp, G, ctx) {
    c.section("Dead & imposed loads (IS 875 Parts 1 & 2)");
    var gs = c.let("Roof sheeting incl. laps & fixings", "gs", num(inp.sheet_dl), "kN/m²", "IS 875-1", "0.50 mm colour-coated ≈ 0.05–0.06; with insulation / skylights 0.10–0.15");
    var gc = c.let("Services / collateral (lights, cables, sprinklers)", "gc", num(inp.services), "kN/m²", "IS 875-1 / practice");
    var gw = c.let("Wall cladding incl. girts sag rods", "gw", G.clad ? num(inp.wall_dl) : 0, "kN/m²", "IS 875-1");
    var qr;
    if (inp.roof_access && G.slope <= 10) qr = c.let("Roof imposed load (access provided)", "qr", 1.5, "kN/m²", "IS 875-2 Table 2");
    else qr = c.calc("Roof imposed load (no access)", "qr", "max(0.75 - 0.02*max(th - 10, 0), 0.40)", "kN/m²", "IS 875-2 Table 2",
      "0.75 kN/m² up to 10°, less 0.02 per degree above 10°, min 0.40", { th: R(G.slope, 3) });
    var dsel = inp.dust, dust, auto = dsel === DUST[0] || dsel === DUST_AUTO_OLD || dsel == null;
    // Auto: the mining-area site profile (DS.site) already adds the coal-dust deposit to the services load – not added twice
    if (auto) dust = 0.0;
    else if (dsel === DUST[1]) dust = 0.0; else dust = num(dsel);
    c.let("Coal-dust / fly-ash deposit on roof", "qd", dust, "kN/m²", "Assumption (not in IS 875-2)",
      dust > 0 ? "settled coal dust ≈ 8 kN/m³ × 60 mm ≈ 0.5 kN/m²; CEA / NTPC coal-handling specifications use 0.5–1.0 (more near crushers / bunkers)" :
        auto && ctx.site === "mine" ? "Auto: coal-dust deposit is included in services (gc) by the mining-area site profile – not added again; select a value here for more (near CHP / crushers)" :
          "no dust deposit considered");
    if (dust > 0) c.miss("Dust load " + g(dust) + " kN/m² is an ASSUMPTION for the coal-mine area (IS 875-2 is silent) – confirm with the owner (SECL) specification and enforce periodic roof cleaning", "IS 875-2 cl 3 / owner spec", "Important");
    var q = c.calc("Total imposed on roof (LL + dust)", "q", "qr + qd", "kN/m²", "IS 875-2 / assumption", "dust treated as an imposed load acting with LL (conservative)", { qr: qr, qd: dust });
    return { gs: gs, gc: gc, gw: gw, qr: qr, dust: dust, q: q };
  };

  /* =========================================================================== wind */
  var MONO_A = [5, 10, 15, 20, 25, 30];
  var MONO_0 = [-1.0, -1.0, -0.9, -0.8, -0.7, -0.5];      // wind facing the low eave (whole roof, averaged)
  var MONO_180 = [-0.9, -1.0, -1.0, -0.9, -0.8, -0.8];    // wind facing the high eave
  M.wind = function (c, inp, G, ctx) {
    c.section("Wind load (IS 875-3:2015)");
    var city = inp.city, Vb = city === "Custom" ? num(inp.Vb_custom) : num(LD.BASIC_WIND_SPEED[city]);
    if (NOT_ANNEX[city]) c.info("Basic wind speed source", city + " is not listed in IS 875-3 Annex A; Vb = " + g(Vb) + " m/s read from the basic wind speed map (Fig. 1) – nearest listed: Raipur / Bhilai 39 m/s. Verify.", "IS 875-3 Fig. 1");
    var terrain = Math.trunc(num(inp.terrain)), k1 = num(inp.k1), k3 = num(inp.k3), k4 = num(inp.k4);
    var area = G.bay * (2 * G.eave + G.span);
    var pd = LD.design_wind_pressure(c, Vb, G.ridge, terrain, k1, k3, k4, { area: area });
    var k2 = LD.k2_factor(G.ridge, terrain);
    var pz = 0.6 * Math.pow(Vb * k1 * k2 * k3 * k4, 2) / 1000;
    var pd_c = c.calc("Design wind pressure for cladding, purlins & girts (Ka = 1, small area; Kc = 1.0)", "pd,c", "max(Kd*pz, 0.7*pz)", "kN/m²",
      "IS 875-3 cl 7.2 / Table 4", "area-combination factor Kc applies to frames only, not to cladding elements", { Kd: 0.9, pz: R(pz, 4) });
    var hw = G.eave / G.span, lw = G.length / G.span;
    var walls = LD.wall_cpe(hw, lw);
    var roof = LD.roof_cpe(G.slope, hw);
    var cpi = LD.CPI[inp.perm], openish = G.clad && G.open;
    if (openish) {
      cpi = Math.max(cpi, 0.7);
      c.info("Open sides / unclad walls", "large openings → Cpi = ±0.7 (dominant opening); no wall pressure on open faces (columns only)", "IS 875-3 cl 7.3.2.2");
    }
    var monoA = Math.min(Math.max(G.slope, 5), 30);
    var m0 = C.interp(monoA, MONO_A, MONO_0), m180 = C.interp(monoA, MONO_A, MONO_180);
    if (G.kind === "mono")
      c.info("External pressure coefficients (mono-slope)", "walls A " + F(walls.A, "+.2f") + ", B " + F(walls.B, "+.2f") + ", C " + F(walls.C, "+.2f") +
        "; roof: wind on low eave " + F(m0, "+.2f") + ", on high eave " + F(m180, "+.2f") + ", parallel −1.00 (simplified envelope after Table 7 – verify)", "IS 875-3 Tables 5 & 7");
    else
      c.info("External pressure coefficients", "walls A " + F(walls.A, "+.2f") + ", B " + F(walls.B, "+.2f") + ", C " + F(walls.C, "+.2f") + "; roof (θ=0°) windward " +
        F(roof.windward_0, "+.2f") + ", leeward " + F(roof.leeward_0, "+.2f") + "; (θ=90°) " + F(roof.roof_90_EG, "+.2f") + " / " + F(roof.roof_90_FH, "+.2f") + "  [" + roof.band + "]", "IS 875-3 Tables 5 & 6");
    c.let("Internal pressure coefficient", "Cpi", "±" + C.pystr(cpi), "", "IS 875-3 cl 7.3.2", inp.perm);
    var oL = G.walls_open_L ? 0 : 1, oR = G.walls_open_R ? 0 : 1;
    var base;
    if (G.kind === "mono") base = [["WL 0° (on low eave)", [oL * walls.A, oR * walls.B, m0, m0]], ["WL 180° (on high eave)", [oL * walls.B, oR * walls.A, m180, m180]], ["WL 90° (along ridge)", [oL * walls.C, oR * walls.C, -1.0, -1.0]]];
    else base = [["WL 0°", [oL * walls.A, oR * walls.B, roof.windward_0, roof.leeward_0]], ["WL 90°", [oL * walls.C, oR * walls.C, roof.roof_90_EG, roof.roof_90_EG]]];
    var cases = {}, rows = [];
    base.forEach(function (e) {
      [[1, "+Cpi"], [-1, "−Cpi"]].forEach(function (st) {
        var ci = st[0] * cpi, v = e[1], k = e[0] + " " + st[1];
        cases[k] = { lcol: (oL ? v[0] - ci : 0), rcol: (oR ? v[1] - ci : 0), lroof: v[2] - ci, rroof: v[3] - ci };
        rows.push([k, R(cases[k].lcol, 3), R(cases[k].lroof, 3), R(cases[k].rroof, 3), R(cases[k].rcol, 3)]);
      });
    });
    var roofCpes = G.kind === "mono" ? [m0, m180, -1.0] : [roof.windward_0, roof.leeward_0, roof.roof_90_EG, roof.roof_90_FH];
    var up_coef = c.calc("Net uplift coefficient on roof (general zone)", "Cp,up", "-cpe + cpi", "", "IS 875-3 Tables 6/7",
      "worst roof suction with internal pressure", { cpe: minOf(roofCpes), cpi: cpi });
    var down_coef = Math.max(maxOf(roofCpes) + cpi, 0);
    var wall_coef = c.calc("Net wall coefficient for girts / side sheeting", "Cp,w", "max(A + cpi, -min(B, C) + cpi)", "", "IS 875-3 Table 5",
      { A: walls.A, B: walls.B, C: walls.C, cpi: cpi });
    var loc = C.interp(G.slope, [0, 10, 20, 30, 45], [-2.0, -2.0, -1.5, -1.5, -1.0]);
    var y_edge = c.calc("Width of local (edge / ridge) zone", "y", "min(h, 0.15*w)", "m", "IS 875-3 Table 6 (local)", { h: G.eave, w: G.span });
    var up_loc = c.calc("Net local uplift coefficient (eaves, verges, ridge)", "Cp,loc", "-cpl + cpi", "", "IS 875-3 Table 6 local Cpe",
      { cpl: R(loc, 2), cpi: cpi });
    var gable_net = c.calc("Net coefficient on gable wall (gable columns)", "Cp,g", "0.7 + cpi", "", "IS 875-3 Table 5", { cpi: cpi });
    var long_coef = c.calc("Overall longitudinal force coefficient (windward + leeward gable)", "Cp,long", "0.7 - B", "", "IS 875-3 Table 5", { B: walls.B });
    var drag = 0;
    if (G.length > 4 * G.eave || G.length > 4 * G.span) {
      drag = c.calc("Frictional drag on roof & walls (wind along ridge)", "F'", "Cf*(d - 4*h)*(b + 2*h)*pd", "kN", "IS 875-3 cl 7.3.3.12",
        "Cf' = 0.04 (ribs across wind), d = length, applies when d > 4h", { Cf: 0.04, d: G.length, h: G.eave, b: G.span, pd: R(pd, 4) });
    }
    return { Vb: Vb, pd: pd, pd_c: pd_c, cpi: cpi, walls: walls, roof: roof, cases: cases, up_coef: up_coef, down_coef: down_coef, wall_coef: wall_coef,
      up_loc: up_loc, y_edge: y_edge, gable_net: gable_net, long_coef: long_coef, drag: drag,
      table: C.table(rows, ["Case", "Left column (Cpe−Cpi)", "Left roof", "Right roof", "Right column"]) };
  };

  /* =========================================================================== sheeting */
  var SPAN_W = [0.75, 1.0, 1.5, 2.0, 2.5, 3.0], SPAN_S = [2.3, 2.1, 1.8, 1.55, 1.4, 1.25];
  function kth(t) { return t >= 0.6 ? 1.1 : t >= 0.5 ? 1.0 : 0.9; }
  /* allowable sheet spans (no recording) – used to set purlin / girt spacing in design mode */
  M.sheet_allow = function (inp, L, W) {
    var wr = Math.max(L.q + L.gs, W.up_loc * W.pd_c), ww = Math.max(W.wall_coef, 1.2 + W.cpi) * W.pd_c;
    return { roof: C.floor_to(kth(num(inp.roof_sheet_t)) * C.interp(wr, SPAN_W, SPAN_S), 0.05), wall: C.floor_to(kth(num(inp.wall_sheet_t)) * C.interp(ww, SPAN_W, SPAN_S), 0.05) };
  };
  M.sheeting = function (c, inp, G, L, W) {
    c.section("Roof & wall sheeting (span and fastener check)");
    var tr = num(inp.roof_sheet_t), tw = num(inp.wall_sheet_t);
    var k = kth;
    var wr = c.calc("Design load on roof sheet (max of LL+dust and local suction)", "ws", "max(q + gs, cpl*pd)", "kN/m²", "IS 875-2/3",
      { q: L.q, gs: L.gs, cpl: R(W.up_loc, 3), pd: R(W.pd_c, 4) });
    var span_al = c.calc("Allowable span of " + g(tr) + " mm trapezoidal sheet", "Sa", "k*interp", "m", "Manufacturer load-span table (typical)",
      "typical 35–40 mm deep trapezoidal profile, multi-span; replace by the supplier's table", { k: k(tr), interp: R(C.interp(wr, SPAN_W, SPAN_S), 3) });
    c.check("Purlin spacing ≤ allowable sheet span", G.ps, span_al, { unit: "m", clause: "Manufacturer / IS 875" });
    var Pfd = c.let("Design pull-over / pull-out of self-drilling screw (12-14 × 25 with 16 mm bonded washer)", "Pf", 1.2, "kN", "Supplier data (assumed)", "characteristic ≈ 1.8 kN pull-over on 0.5 mm TCT ÷ 1.5");
    var tf_ = function (cp, p) { return 1.5 * cp * W.pd_c * G.ps * p; };
    var pit_g = firstOk([0.4, 0.2], function (p) { return tf_(W.up_coef, p) <= Pfd; }) || 0.2;
    var pit_e = firstOk([0.2, 0.1], function (p) { return tf_(W.up_loc, p) <= Pfd; }) || 0.1;
    c.let("Screw pitch along purlin: general / edge zone", "", g(pit_g * 1000) + " / " + g(pit_e * 1000), "mm", "Practice", "every 2nd crest = 400, every crest = 200, every crest + stitch = 100");
    var tg_ = c.calc("Screw tension – general zone", "Tf", "1.5*cp*pd*sp*p", "kN", "IS 875-3", { cp: R(W.up_coef, 3), pd: R(W.pd_c, 4), sp: R(G.ps, 3), p: pit_g });
    c.check("Fastener tension – general zone", tg_, Pfd, { unit: "kN", clause: "IS 800 cl 10.3.5 / supplier" });
    var te_ = c.calc("Screw tension – edge / ridge zone", "Tf,e", "1.5*cpl*pd*sp*p", "kN", "IS 875-3 Table 6 local", { cpl: R(W.up_loc, 3), pd: R(W.pd_c, 4), sp: R(G.ps, 3), p: pit_e });
    c.check("Fastener tension – edge zone (width y = " + f2(W.y_edge) + " m)", te_, Pfd, { unit: "kN", clause: "IS 800 cl 10.3.5 / supplier" });
    if (G.clad) {
      var ww = c.calc("Design load on wall sheet (service, local corner zone)", "ww", "cpw*pd", "kN/m²", "IS 875-3 Table 5 local", "local wall Cpe −1.2 at corners + Cpi", { cpw: R(Math.max(W.wall_coef, 1.2 + W.cpi), 3), pd: R(W.pd_c, 4) });
      var span_w = c.calc("Allowable span of " + g(tw) + " mm wall sheet", "Sa,w", "k*interp", "m", "Manufacturer load-span table (typical)", { k: k(tw), interp: R(C.interp(ww, SPAN_W, SPAN_S), 3) });
      c.check("Girt spacing ≤ allowable wall-sheet span", G.gsp, span_w, { unit: "m", clause: "Manufacturer" });
    }
    return { pit_g: pit_g, pit_e: pit_e };
  };

  /* =========================================================================== purlins / girts (generic flexural member on frames) */
  function fam_list(fam) {
    if (fam === PURLIN_FAM[1]) return M.ZNAMES.slice().sort(function (a, b) { return sec_of(a).w - sec_of(b).w; });
    if (fam === PURLIN_FAM[2]) return SC.by_weight(SC.ISA).filter(function (n) { return section(n).leg >= 50; });
    return SC.by_weight(SC.ISMC);
  }
  function flex_sec(name) { return /^ISA/.test(name) ? ang_props(name) : sec_of(name); }
  /* o: {tag, L, cont, nsag, fy, lim, loads(c, ws) → {gN, gT, uN, sv}} — returns the checks for a given section */
  function flex_check(c, name, o) {
    var sec = flex_sec(name), t = " (" + o.tag + ")";
    var fy = sec.family === "CFZ" ? 345 : o.fy;
    var ws = sec.w * 9.81e-3;
    var ld = o.loads(c, ws);
    var coef = o.cont ? 0.1 : 0.125;
    var Mz = c.calc("Major-axis moment (gravity / inward)" + t, "Mz", "coef*wn*L**2", "kN·m", "IS 800 cl 8.2", "coef 1/10 continuous (≥ 3 spans), 1/8 simple", { coef: coef, wn: ld.gN, L: o.L });
    var Mu = c.calc("Major-axis moment (uplift / suction, reversed)" + t, "Mz,u", "coef*max(wu, 0)*L**2", "kN·m", "IS 800 cl 8.2", { coef: coef, wu: ld.uN, L: o.L });
    var a = o.nsag + 1;
    var My = c.calc("Minor-axis moment (between sag rods)" + t, "My", "wt*(L/a)**2/8", "kN·m", "IS 800 cl 8.2", (o.nsag ? C.pystr(o.nsag) + " sag-rod line(s) per span" : "no sag rods"), { wt: ld.gT, L: o.L, a: a });
    var eff = sec.family === "CFZ" ? 0.85 : 1.0;
    var Mdz = c.calc("Design moment capacity (major, flange restrained by sheeting)" + t, "Mdz", "eff*min(Zp, 1.2*Ze)*fy/gm0/1e6", "kN·m", sec.family === "CFZ" ? "IS 801 / IS 800 cl 8.2.1.2" : "IS 800 cl 8.2.1.2",
      sec.family === "CFZ" ? "0.85 = effective-section factor for local buckling (assumed, IS 801 – verify with supplier)" : "", { eff: eff, Zp: R(sec.family === "CFZ" ? sec.Zez : sec.Zpz), Ze: R(sec.Zez), fy: fy, gm0: GM0 });
    var Mdy = c.calc("Design moment capacity (minor)" + t, "Mdy", "eff*1.2*Ze*fy/gm0/1e6", "kN·m", "IS 800 cl 8.2.1.2", { eff: eff, Ze: R(sec.Zey), fy: fy, gm0: GM0 });
    var MdLT = Mdz;
    if (Mu > 0 && sec.family !== "ISA") {
      var LLT = o.L / a;
      var Mcr = S.mcr_i(sec, LLT * 1000);
      var lam = c.calc("LTB slenderness, free flange in compression" + t, "λLT", "sqrt(eff*Ze*fy/Mcr)", "", "IS 800 cl 8.2.2", "LLT = " + f2(LLT) + " m (sag rods / anti-sag ties restrain the free flange)",
        { eff: eff, Ze: R(sec.Zez), fy: fy, Mcr: R(Mcr) });
      var aLT = sec.family === "CFZ" ? 0.49 : 0.21, phi = 0.5 * (1 + aLT * (lam - 0.2) + lam * lam);
      var chi = lam <= 0.4 ? 1.0 : Math.min(1 / (phi + Math.sqrt(Math.max(phi * phi - lam * lam, 0))), 1.0);
      MdLT = c.calc("LTB moment capacity under uplift" + t, "Md,LT", "chi*eff*Ze*fy/gm0/1e6", "kN·m", "IS 800 cl 8.2.2", "αLT = " + C.pystr(aLT), { chi: R(chi, 4), eff: eff, Ze: R(sec.Zez), fy: fy, gm0: GM0 });
    }
    var ir1 = c.calc("Biaxial interaction (gravity)" + t, "IR", "Mz/Mdz + My/Mdy", "", "IS 800 cl 9.3.1.1", { Mz: Mz, Mdz: Mdz, My: My, Mdy: Mdy });
    var ok = c.check("Biaxial bending (gravity / inward)" + t, ir1, 1.0, { clause: "IS 800 cl 9.3.1.1" });
    var ir2 = c.calc("Interaction under uplift / suction" + t, "IR,u", "Mu/MdLT", "", "IS 800 cl 8.2.2", { Mu: Mu, MdLT: MdLT });
    ok = c.check("Bending under uplift / suction (LTB)" + t, ir2, 1.0, { clause: "IS 800 cl 8.2.2" }) && ok;
    var V = c.calc("Max. shear" + t, "V", "k*max(wn, wu)*L", "kN", "", { k: o.cont ? 0.6 : 0.5, wn: ld.gN, wu: ld.uN, L: o.L });
    var Vd = c.calc("Shear capacity" + t, "Vd", "h*tw*fy/(sqrt(3)*gm0*1000)", "kN", "IS 800 cl 8.4.1", { h: sec.h, tw: sec.tw, fy: fy, gm0: GM0 });
    ok = c.check("Shear" + t, V, Vd, { unit: "kN", clause: "IS 800 cl 8.4" }) && ok;
    var dk = o.cont ? 0.0069 : 5 / 384;
    var d = c.calc("Deflection (service LL or WL)" + t, "δ", "k*w*(L*1000)**4/(E*I)", "mm", "IS 800 Table 6", { k: R(dk, 5), w: R(ld.sv, 4), L: o.L, E: E_ST, I: R(sec.Iz) });
    ok = c.check("Deflection ≤ span/" + C.pystr(o.lim) + " (elastic cladding)" + t, d, o.L * 1000 / o.lim, { unit: "mm", clause: "IS 800 Table 6" }) && ok;
    return { ok: ok, name: name, sec: sec, w: sec.w, R_g: (o.cont ? 1.1 : 1.0) * ld.gN * o.L, R_u: (o.cont ? 1.1 : 1.0) * Math.max(ld.uN, 0) * o.L, wt: ld.gT, ws: ws, fy: fy, IR: Math.max(ir1, ir2) };
  }
  M.flex_check = flex_check;
  function flex_design(c, o, given) {
    var cands = given ? [given] : fam_list(o.fam);
    var pick = given || firstOk(cands, function (n) { return flex_check(new Calc("s"), n, o).ok; }) || last(cands);
    return pick;
  }

  M.purlins = function (c, inp, G, L, W, mode) {
    c.section("Purlins");
    var fam = inp.purlin_fam, nsag = inp.sag_rods ? (G.bay > 6 ? 2 : 1) : 0, cont = G.n_bays >= 3;
    var fy = num(MT.STEEL_GRADES[inp.steel][0]);
    function loadsF(cp) {
      return function (cc, ws) {
        var wg = cc.calc("Dead load on purlin (sheeting + services + self)", "wg", "(gs + gc)*sp + ws", "kN/m", "IS 875-1", { gs: L.gs, gc: L.gc, sp: R(G.ps, 3), ws: R(ws, 4) });
        var wq = cc.calc("Imposed load on purlin (LL + dust, on plan)", "wq", "q*sp*cos(radians(th))", "kN/m", "IS 875-2", { q: L.q, sp: R(G.ps, 3), th: R(G.slope, 3) });
        var gN = cc.calc("Factored normal load 1.5(DL + LL)", "wn", "1.5*(wg + wq)*cos(radians(th))", "kN/m", "IS 800 Table 4", { wg: wg, wq: wq, th: R(G.slope, 3) });
        if (W.down_coef > 0) gN = Math.max(gN, cc.calc("Factored normal load 1.2(DL + LL + WL pressure)", "wn2", "1.2*((wg + wq)*cos(radians(th)) + cp*pd*sp)", "kN/m", "IS 800 Table 4", { wg: wg, wq: wq, th: R(G.slope, 3), cp: R(W.down_coef, 3), pd: R(W.pd_c, 4), sp: R(G.ps, 3) }));
        var gT = cc.calc("Factored load along slope", "wt", "1.5*(wg + wq)*sin(radians(th))", "kN/m", "", { wg: wg, wq: wq, th: R(G.slope, 3) });
        var uN = cc.calc("Factored net uplift 1.5 WL − 0.9 DL", "wu", "1.5*cp*pd*sp - 0.9*wg*cos(radians(th))", "kN/m", "IS 800 Table 4", { cp: R(cp, 3), pd: R(W.pd_c, 4), sp: R(G.ps, 3), wg: wg, th: R(G.slope, 3) });
        var sv = cc.calc("Service load for deflection max(LL, WL)", "wsv", "max(q*sp*cos(radians(th))**2, cp*pd*sp - wg*cos(radians(th)))", "kN/m", "IS 800 Table 6", { q: L.q, sp: R(G.ps, 3), th: R(G.slope, 3), cp: R(cp, 3), pd: R(W.pd_c, 4), wg: wg });
        return { gN: gN, gT: gT, uN: uN, sv: sv };
      };
    }
    var o = { tag: "purlin", fam: fam, L: G.bay, cont: cont, nsag: nsag, fy: fy, lim: 150, loads: loadsF(W.up_coef) };
    var given = mode === "check" ? inp.purlin_sec : null;
    var name = flex_design(c, o, given);
    c.let("Purlin section (general zone) P1", "", name, "", fam, (cont ? "continuous over " + C.pystr(G.n_bays) + " spans (lapped / sleeved at supports)" : "simply supported"));
    c.let("Purlin span × spacing", "", g(G.bay) + " × " + f2(G.ps), "m");
    var P1 = flex_check(c, name, o);
    // edge / ridge zone purlins under local suction
    c.section("Purlins – edge / ridge zone (local Cpe)");
    var oe = Object.assign({}, o, { tag: "edge purlin", loads: loadsF(W.up_loc) });
    var cands = fam_list(fam), start = Math.max(cands.indexOf(name), 0);
    var ename = flex_check(new Calc("s"), name, oe).ok || given ? name : (firstOk(cands.slice(start), function (n) { return flex_check(new Calc("s"), n, oe).ok; }) || last(cands));
    if (given && mode === "check") ename = inp.purlin_edge_sec || name;
    c.let("Purlin section in edge / ridge zone P2", "", ename, "", "IS 875-3 Table 6 local", ename === name ? "same as general zone" : "heavier section within y = " + f2(W.y_edge) + " m of eaves, ridge & gables");
    var P2 = flex_check(c, ename, oe);
    // number of purlin lines in the edge zone (full length): those within y of eave and of ridge
    var n_edge = 0;
    if (ename !== name) {
      for (var k = 1; k < G.n_purl - (G.kind === "mono" ? 1 : 0); k++) { var sl = k * G.ps; if (sl <= W.y_edge + 1e-9 || G.raf_len - sl <= W.y_edge + 1e-9) n_edge++; }
      n_edge *= G.kind === "mono" ? 1 : 2;
    }
    // sag rods
    c.section("Sag rods (roof)");
    var sag = null;
    if (nsag) {
      var T = c.calc("Sag-rod tension at the top (sum of slope components)", "Ts", "1.25*wt*(L/a)*(n - 1)", "kN", "IS 800 cl 6 / practice",
        "1.25 = middle-support factor; eave purlin restrained by eave strut; tie across ridge balances both slopes", { wt: R(P1.wt, 4), L: G.bay, a: nsag + 1, n: G.n_purl });
      var dsag = firstOk([12, 16, 20, 24], function (d) { return Math.min(Math.PI * d * d / 4 * 250 / GM0, 0.9 * 0.78 * Math.PI * d * d / 4 * 410 / GM1) / 1000 >= T; }) || 24;
      if (mode === "check") dsag = Math.max(12, num(inp.sag_d) || dsag);
      var Td = c.calc("Tension capacity of M" + g(dsag) + " rod (threaded, An = 0.78 A)", "Td", "min(A*fy/gm0, 0.9*0.78*A*fu/gm1)/1000", "kN", "IS 800 cl 6.2 / 6.3",
        { A: R(Math.PI * dsag * dsag / 4, 1), fy: 250, gm0: GM0, fu: 410, gm1: GM1 });
      c.check("Sag rod tension", T, Td, { unit: "kN", clause: "IS 800 cl 6.1" });
      c.ok("Sag rod ≥ 12 mm (practice minimum)", dsag >= 12, { detail: "Ø" + g(dsag), clause: "Practice / IS 800 cl 6" });
      sag = { d: dsag, nsag: nsag, T: T };
    } else c.warn("No sag rods", "purlin minor-axis bending over the full span; consider sag rods for spans > 4.5 m", "Practice");
    var tl = Math.max((G.kind === "mono" ? G.n_purl - 2 : G.n_purl - 1), 1) * (G.kind === "mono" ? 1 : 2);
    var wavg = (P1.w * (tl - Math.min(n_edge, tl)) + P2.w * Math.min(n_edge, tl)) / tl;
    return { P1: P1, P2: P2, name: name, ename: ename, n_edge: n_edge, nsag: nsag, cont: cont, sag: sag, wavg: wavg };
  };

  M.girts = function (c, inp, G, L, W, mode, span_g, tag, mark) {
    c.section("Girts – " + tag);
    var fam = inp.purlin_fam === PURLIN_FAM[1] ? PURLIN_FAM[1] : PURLIN_FAM[0];
    var fy = num(MT.STEEL_GRADES[inp.steel][0]);
    var nsag = span_g > 4.5 ? 1 : 0;
    var o = { tag: mark + " girt", fam: fam, L: span_g, cont: false, nsag: nsag, fy: fy, lim: 150, loads: function (cc, ws) {
      var gN = cc.calc("Factored wind on girt 1.5 WL", "wn", "1.5*cp*pd*sg", "kN/m", "IS 875-3 Table 5", { cp: R(W.wall_coef, 3), pd: R(W.pd_c, 4), sg: R(G.gsp, 3) });
      var gT = cc.calc("Factored vertical load (cladding + self, weak axis)", "wt", "1.5*(gw*sg + ws)", "kN/m", "IS 875-1", { gw: L.gw, sg: R(G.gsp, 3), ws: R(ws, 4) });
      var sv = cc.calc("Service wind for deflection", "wsv", "cp*pd*sg", "kN/m", "IS 800 Table 6", { cp: R(W.wall_coef, 3), pd: R(W.pd_c, 4), sg: R(G.gsp, 3) });
      return { gN: gN, gT: gT, uN: gN, sv: sv };
    } };
    var given = mode === "check" ? inp.girt_sec : null;
    var name = flex_design(c, o, given);
    c.let("Girt section " + mark, "", name, "", fam, "simply supported, span " + f2(span_g) + " m" + (nsag ? ", 1 sag-rod line" : ""));
    var r = flex_check(c, name, o);
    r.nsag = nsag;
    return r;
  };

  /* =========================================================================== frame model (frame2d) */
  /* secs: {col(y, h) → section, raf(t) → section (t = 0 at left knee … 1 at apex (duo) / right knee (mono)),
            truss: {group → A mm²}, kb: section } */
  function levels(h, extra) {
    var ys = [0, h / 4, h / 2, 3 * h / 4, h];
    (extra || []).forEach(function (y) { if (y > 0.05 && y < h - 0.05) ys.push(y); });
    ys.sort(function (a, b) { return a - b; });
    return ys.filter(function (y, i) { return i === 0 || y - ys[i - 1] > 1e-6; });
  }
  function raf_ts(G) {
    var hl = G.haunch_t || 0, n = G.kind === "mono" ? 10 : 6, ts = [0];
    if (G.kind === "mono") {
      if (hl > 0) ts.push(hl);
      for (var k = 1; k < n - (hl > 0 ? 2 : 0); k++) ts.push(hl + (1 - 2 * hl) * k / (n - (hl > 0 ? 2 : 0)));
      if (hl > 0) ts.push(1 - hl);
    } else {
      if (hl > 0) ts.push(hl);
      var m = hl > 0 ? n - 1 : n;
      for (var j = 1; j < m; j++) ts.push(hl + (1 - hl) * j / m);
    }
    ts.push(1);
    return ts;
  }
  M.raf_ts = raf_ts;

  M.build_frame = function (G, secs, CR) {
    var FR = DS.frame2d, f = new FR.Frame();
    var span = G.span, h1 = G.eave, h2 = G.kind === "mono" ? G.h2 : G.eave;
    var extra = [];
    if (CR) extra.push(CR.rail_h);
    if (G.kind === "truss") extra.push(G.eave - G.kb_h);
    var ysL = levels(h1, extra), ysR = levels(h2, extra);
    var mem = { colL: [], colR: [], rafL: [], rafR: [], truss: {}, kb: [] }, nd = {};
    mem.info = {};
    function add(i, j, sec, name, grp, kind, pos) {
      var id = f.member(i, j, E_KN, sec.A * 1e-6, kind === "truss" ? 0 : sec.Iz * 1e-12, kind || "frame", { name: name, group: grp });
      mem.info[id] = Object.assign({ sec: sec, grp: grp }, pos || {});
      return id;
    }
    // left column bottom → top
    var prev = f.node(0, 0); nd.bl = prev;
    for (var k = 1; k < ysL.length; k++) {
      var n = f.node(0, ysL[k]);
      mem.colL.push(add(prev, n, secs.col((ysL[k - 1] + ysL[k]) / 2, h1), "Left column", "column", "frame", { y: (ysL[k - 1] + ysL[k]) / 2, h: h1 }));
      if (CR && Math.abs(ysL[k] - CR.rail_h) < 1e-6) nd.railL = n;
      if (G.kind === "truss" && Math.abs(ysL[k] - (G.eave - G.kb_h)) < 1e-6) nd.kbL = n;
      prev = n;
    }
    nd.kl = prev;
    // right column nodes (top → bottom later)
    var rnodes = [];
    for (k = ysR.length - 1; k >= 0; k--) rnodes.push(f.node(span, ysR[k]));
    nd.kr = rnodes[0]; nd.br = last(rnodes);
    if (G.kind === "truss") {
      var tr = M.truss_geometry(f, G, nd.kl, nd.kr, secs.truss);
      mem.truss = tr.groups; nd.bot = tr.bot; nd.top = tr.top; nd.ap = tr.apex;
      mem.kb.push(add(nd.kbL, tr.bot[1], secs.kb, "Knee brace", "knee", "truss"));
    } else if (G.kind === "mono") {
      var ts = raf_ts(G); prev = nd.kl;
      for (k = 1; k < ts.length; k++) {
        var x = span * ts[k], y = h1 + (h2 - h1) * ts[k];
        var nn = k === ts.length - 1 ? nd.kr : f.node(x, y);
        mem.rafL.push(add(prev, nn, secs.raf((ts[k - 1] + ts[k]) / 2), "Rafter", "rafter", "frame", { t: (ts[k - 1] + ts[k]) / 2 }));
        prev = nn;
      }
      nd.ap = f.node(span * ts[Math.floor(ts.length / 2)], h1 + (h2 - h1) * ts[Math.floor(ts.length / 2)]);
    } else {
      var t2 = raf_ts(G), ridge = G.ridge;
      prev = nd.kl;
      for (k = 1; k < t2.length; k++) {
        var xn = span / 2 * t2[k], yn = h1 + (ridge - h1) * t2[k], n2 = f.node(xn, yn);
        mem.rafL.push(add(prev, n2, secs.raf((t2[k - 1] + t2[k]) / 2), "Left rafter", "rafter", "frame", { t: (t2[k - 1] + t2[k]) / 2 }));
        prev = n2;
      }
      nd.ap = prev;
      for (k = t2.length - 2; k >= 0; k--) {
        var xr = span - span / 2 * t2[k], yr = h1 + (ridge - h1) * t2[k], n3 = k === 0 ? nd.kr : f.node(xr, yr);
        mem.rafR.push(add(prev, n3, secs.raf((t2[k + 1] + t2[k]) / 2), "Right rafter", "rafter", "frame", { t: (t2[k + 1] + t2[k]) / 2 }));
        prev = n3;
      }
    }
    // right column top → bottom
    for (k = 1; k < rnodes.length; k++) {
      var yy = ysR[ysR.length - 1 - k];
      mem.colR.push(add(rnodes[k - 1], rnodes[k], secs.col((ysR[ysR.length - k] + yy) / 2, h2), "Right column", "column", "frame", { y: (ysR[ysR.length - k] + yy) / 2, h: h2 }));
      if (CR && Math.abs(yy - CR.rail_h) < 1e-6) nd.railR = rnodes[k];
      if (G.kind === "truss" && Math.abs(yy - (G.eave - G.kb_h)) < 1e-6) nd.kbR = rnodes[k];
    }
    if (G.kind === "truss") mem.kb.push(add(nd.kbR, nd.bot[nd.bot.length - 2], secs.kb, "Knee brace", "knee", "truss"));
    [nd.bl, nd.br].forEach(function (n) { f.support(n, true, true, !!G.fixed); });
    return { f: f, nd: nd, mem: mem };
  };

  /* truss inside the frame: Pratt / Howe (panel truss) or Fink (simple W / compound) */
  M.truss_geometry = function (f, G, nL, nR, A) {
    var span = G.span, rise = G.rise, h = G.eave, groups = {}, bot = [], top = [];
    function addm(i, j, grp) {
      if (!groups[grp]) groups[grp] = [];
      groups[grp].push(f.member(i, j, E_KN, (A && A[grp] ? A[grp] : 1000) * 1e-6, 0, "truss", { name: grp, group: grp }));
    }
    function yT(x) { return h + rise * (1 - Math.abs(x - span / 2) / (span / 2)); }
    var i;
    if (!/Fink/.test(G.style)) {
      var n = G.n_pan, a = span / n, half = n / 2;
      for (i = 0; i <= n; i++) bot.push(i === 0 ? nL : i === n ? nR : f.node(i * a, h));
      for (i = 0; i <= n; i++) top.push(i === 0 || i === n ? bot[i] : f.node(i * a, yT(i * a)));
      for (i = 0; i < n; i++) { addm(bot[i], bot[i + 1], "Bottom chord"); addm(top[i], top[i + 1], "Top chord"); }
      for (i = 1; i < n; i++) addm(bot[i], top[i], "Verticals");
      var pratt = /Pratt/.test(G.style);
      for (i = 0; i < n; i++) {
        var left = i < half;
        if (pratt) { if (left && i >= 1) addm(top[i], bot[i + 1], "Diagonals"); else if (!left && i + 1 <= n - 1) addm(top[i + 1], bot[i], "Diagonals"); }
        else { if (left && i + 1 <= half && i + 1 <= n - 1) addm(bot[i], top[i + 1], "Diagonals"); else if (!left && i >= 1) addm(top[i], bot[i + 1], "Diagonals"); }
      }
      return { groups: groups, bot: bot, top: top, apex: top[half] };
    }
    // Fink: nh = 2 (simple W) or 4 (compound)
    var Fl = f.node(span / 3, h), Fr = f.node(2 * span / 3, h), Cn = f.node(span / 2, h + rise);
    var T2l = f.node(span / 4, h + rise / 2), T2r = f.node(3 * span / 4, h + rise / 2);
    if (G.nh === 2) {
      top = [nL, T2l, Cn, T2r, nR]; bot = [nL, Fl, Fr, nR];
      addm(nL, T2l, "Top chord"); addm(T2l, Cn, "Top chord"); addm(Cn, T2r, "Top chord"); addm(T2r, nR, "Top chord");
      addm(nL, Fl, "Bottom chord"); addm(Fl, Fr, "Bottom chord"); addm(Fr, nR, "Bottom chord");
      addm(T2l, Fl, "Web struts"); addm(T2r, Fr, "Web struts"); addm(Cn, Fl, "Web ties"); addm(Cn, Fr, "Web ties");
    } else {
      var T1l = f.node(span / 8, h + rise / 4), T3l = f.node(3 * span / 8, h + 3 * rise / 4), B1l = f.node(span / 6, h), Ml = f.node(5 * span / 12, h + rise / 2);
      var T1r = f.node(span - span / 8, h + rise / 4), T3r = f.node(span - 3 * span / 8, h + 3 * rise / 4), B1r = f.node(span - span / 6, h), Mr = f.node(span - 5 * span / 12, h + rise / 2);
      top = [nL, T1l, T2l, T3l, Cn, T3r, T2r, T1r, nR]; bot = [nL, B1l, Fl, Fr, B1r, nR];
      for (i = 0; i < top.length - 1; i++) addm(top[i], top[i + 1], "Top chord");
      for (i = 0; i < bot.length - 1; i++) addm(bot[i], bot[i + 1], "Bottom chord");
      [[T1l, B1l, T2l, Fl, T3l, Ml], [T1r, B1r, T2r, Fr, T3r, Mr]].forEach(function (s) {
        addm(s[0], s[1], "Web struts"); addm(s[1], s[2], "Web ties"); addm(s[2], s[3], "Web struts");
        addm(s[2], s[5], "Web ties"); addm(s[4], s[5], "Web struts"); addm(s[3], s[5], "Web ties"); addm(s[5], Cn, "Web ties");
      });
    }
    return { groups: groups, bot: bot, top: top, apex: Cn };
  };

  /* load cases on the frame model */
  M.frame_cases = function (G, model, L, W, purlin_kN_m2, secs, CR) {
    var FR = DS.frame2d, LoadCase = FR.LoadCase, f = model.f, mem = model.mem, nd = model.nd, bay = G.bay;
    var DL = new LoadCase("DL"), LL = new LoadCase("LL"), WLs = {};
    var droof = (L.gs + L.gc + purlin_kN_m2) * bay;
    var colmem = mem.colL.concat(mem.colR), rafmem = mem.rafL.concat(mem.rafR);
    colmem.forEach(function (m) { var mm = f.members[m]; DL.add_member(m, ["gudl", 0.0, -(mm.A * 7850 * 9.81e-3 + L.gw * bay * (G.clad ? 1 : 0)), "length"]); });
    if (G.kind !== "truss") {
      rafmem.forEach(function (m) { var mm = f.members[m]; DL.add_member(m, ["gudl", 0.0, -(droof + mm.A * 7850 * 9.81e-3 * 1.06), "length"]); LL.add_member(m, ["gudl", 0.0, -L.q * bay, "projection"]); });
    }
    var p = W.pd * bay;
    Object.keys(W.cases).forEach(function (name) {
      var k = W.cases[name], lc = new LoadCase(name);
      mem.colL.forEach(function (m) { lc.add_member(m, ["udl", 0.0, -k.lcol * p]); });
      mem.colR.forEach(function (m) { lc.add_member(m, ["udl", 0.0, -k.rcol * p]); });
      if (G.kind !== "truss") {
        if (G.kind === "mono") mem.rafL.forEach(function (m, i) { lc.add_member(m, ["udl", 0.0, -(i < mem.rafL.length / 2 ? k.lroof : k.rroof) * p]); });
        else { mem.rafL.forEach(function (m) { lc.add_member(m, ["udl", 0.0, -k.lroof * p]); }); mem.rafR.forEach(function (m) { lc.add_member(m, ["udl", 0.0, -k.rroof * p]); }); }
      }
      WLs[name] = lc;
    });
    if (G.kind === "truss") {
      var top = nd.top, nt = top.length, th = rad(G.slope), Lt = G.raf_len, nh = (nt - 1) / 2;
      var selfw = secs.truss_kN_m2 || 0.15;
      for (var i = 0; i < nt; i++) {
        var kf = i === 0 || i === nt - 1 ? 0.5 : 1.0, trib = Lt / nh * kf;
        var plan = trib * Math.cos(th);
        DL.add_nodal(top[i], 0, -((L.gs + L.gc + purlin_kN_m2) * trib + selfw * plan) * bay);
        LL.add_nodal(top[i], 0, -L.q * plan * bay);
        Object.keys(W.cases).forEach(function (name) {
          var k = W.cases[name], isL = i < nh, isC = i === nh;
          var cp = isC ? (k.lroof + k.rroof) / 2 : isL ? k.lroof : k.rroof;
          var Fn = -cp * W.pd * trib * bay;                         // + outward
          var nx = isC ? 0 : isL ? -Math.sin(th) : Math.sin(th), ny = Math.cos(th);
          WLs[name].add_nodal(top[i], Fn * nx, Fn * ny);
        });
      }
    }
    var CLs = {};
    if (CR) {
      [["CL max-left", CR.Vmax, CR.Vmin, 1], ["CL max-right", CR.Vmin, CR.Vmax, -1]].forEach(function (cl) {
        var lc = new LoadCase(cl[0]);
        lc.add_nodal(nd.railL, cl[3] * CR.Hs, -cl[1], -cl[1] * CR.e);
        lc.add_nodal(nd.railR, cl[3] * CR.Hs, -cl[2], cl[2] * CR.e);
        CLs[cl[0]] = lc;
      });
    }
    var cc = FR.combine_cases, combos = {}, service = { "LL": LL, "DL+LL": cc([DL, LL], [1, 1], "DL+LL"), "DL": DL };
    combos["1.5(DL+LL)"] = cc([DL, LL], [1.5, 1.5], "1.5(DL+LL)");
    Object.keys(WLs).forEach(function (wn) {
      var wl = WLs[wn];
      combos["1.2(DL+LL+" + wn + ")"] = cc([DL, LL, wl], [1.2, 1.2, 1.2], "");
      combos["1.5(DL+" + wn + ")"] = cc([DL, wl], [1.5, 1.5], "");
      combos["0.9DL+1.5" + wn] = cc([DL, wl], [0.9, 1.5], "");
      service[wn] = wl; service["DL+" + wn] = cc([DL, wl], [1, 1], "");
    });
    Object.keys(CLs).forEach(function (cn) {
      var cl = CLs[cn];
      // IS 800 Table 4: imposed loads LL (roof) and CL (crane) – the leading one × 1.5 / 1.2, the accompanying one × 1.05 / 0.53
      combos["1.5DL+1.5LL+1.05" + cn] = cc([DL, LL, cl], [1.5, 1.5, 1.05], "");
      combos["1.5DL+1.05LL+1.5" + cn] = cc([DL, LL, cl], [1.5, 1.05, 1.5], "");
      Object.keys(WLs).forEach(function (wn) {
        var wl = WLs[wn];
        combos["1.2DL+1.2LL+1.05" + cn + "+0.6" + wn] = cc([DL, LL, cl, wl], [1.2, 1.2, 1.05, 0.6], "");
        combos["1.2DL+1.05LL+1.2" + cn + "+0.6" + wn] = cc([DL, LL, cl, wl], [1.2, 1.05, 1.2, 0.6], "");
        combos["1.2DL+1.2LL+0.53" + cn + "+1.2" + wn] = cc([DL, LL, cl, wl], [1.2, 1.2, 0.53, 1.2], "");
        combos["1.2DL+0.53LL+1.2" + cn + "+1.2" + wn] = cc([DL, LL, cl, wl], [1.2, 0.53, 1.2, 1.2], "");
      });
      service[cn] = cl; service["DL+LL+" + cn] = cc([DL, LL, cl], [1, 1, 1], "");
    });
    return { combos: combos, service: service, droof: droof, WLs: WLs };
  };

  M.analyse = function (G, L, W, pw, secs, CR) {
    var model = M.build_frame(G, secs, CR), cs = M.frame_cases(G, model, L, W, pw, secs, CR), res = {}, sres = {};
    Object.keys(cs.combos).forEach(function (k) { res[k] = model.f.solve(cs.combos[k]); });
    Object.keys(cs.service).forEach(function (k) { sres[k] = model.f.solve(cs.service[k]); });
    var env = {};
    model.f.members.forEach(function (mm, m) {
      var e = { M: 0, Pc: 0, Pt: 0, V: 0, M_combo: "" };
      Object.keys(res).forEach(function (k) {
        var x = res[k].extremes(m, 17);
        if (x.M_abs > e.M) { e.M = x.M_abs; e.M_combo = k; }
        e.Pc = Math.max(e.Pc, -x.N_min); e.Pt = Math.max(e.Pt, x.N_max); e.V = Math.max(e.V, x.V_abs);
      });
      env[m] = e;
    });
    // serviceability
    var nd = model.nd, f = model.f;
    var rafnodes = [];
    if (G.kind === "truss") rafnodes = nd.bot.concat(nd.top); else model.mem.rafL.concat(model.mem.rafR).forEach(function (m) { rafnodes.push(f.members[m].i, f.members[m].j); });
    var vl = sres.LL, k0 = (vl.disp(nd.kl)[1] + vl.disp(nd.kr)[1]) / 2;
    var v = maxOf(rafnodes.map(function (n) { return Math.abs(vl.disp(n)[1] - k0); })) * 1000;
    var hr = G.kind === "mono" ? G.eave / G.h2 : 1;     // right knee sway normalised to the low eave height (limit h/150 per side)
    var sway = maxOf(Object.keys(W.cases).map(function (wn) { return Math.max(Math.abs(sres[wn].disp(nd.kl)[0]), Math.abs(sres[wn].disp(nd.kr)[0]) * hr); })) * 1000;
    var csway = 0;
    if (CR) csway = maxOf(["CL max-left", "CL max-right"].map(function (cn) { return Math.max(Math.abs(sres[cn].disp(nd.railL)[0]), Math.abs(sres[cn].disp(nd.railR)[0])); })) * 1000;
    return { model: model, cs: cs, res: res, sres: sres, env: env, v: v, sway: sway, csway: csway };
  };
  function envOf(A, ids) {
    var e = { M: 0, Pc: 0, Pt: 0, V: 0, M_combo: "" };
    ids.forEach(function (m) { var x = A.env[m]; if (x.M > e.M) { e.M = x.M; e.M_combo = x.M_combo; } e.Pc = Math.max(e.Pc, x.Pc); e.Pt = Math.max(e.Pt, x.Pt); e.V = Math.max(e.V, x.V); });
    return e;
  }
  M.envOf = envOf;
  /* moment at a member end (i or j) — envelope over combos, with the governing combo */
  function endM(A, m, atJ) {
    var best = 0, bc = "", P = 0, V = 0;
    Object.keys(A.res).forEach(function (k) {
      var d = A.res[k].diagram(m, 2), r = atJ ? d[1] : d[0];
      if (Math.abs(r[3]) > best) { best = Math.abs(r[3]); bc = k; P = r[1]; V = Math.abs(r[2]); }
    });
    return { M: best, combo: bc, N: P, V: V };
  }
  M.endM = endM;

  /* =========================================================================== main member design */
  var ROLLED = SC.by_weight(SC.ISMB).filter(function (n) { return section(n).h >= 200; }).concat(SC.by_weight(SC.ISHB))
    .map(function (n, i) { return [n, i]; }).sort(function (a, b) { return section(a[0]).w - section(b[0]).w || a[1] - b[1]; }).map(function (x) { return x[0]; });
  var BU_FALLBACK = SC.builtup_series().filter(function (n) { return section(n).w > 0.8 * section("ISMB 600").w; });
  M.ROLLED = ROLLED.concat(BU_FALLBACK);

  function check_col(c, sec, env, fy, fu, P) {          // P: {Lz, Kz, Ly, tag}
    var t = P.tag;
    var comp = S.compression(c, env.Pc, sec, fy, P.Lz, P.Ly, P.Kz, 1.0, { tag: t });
    var bend = S.bending(c, env.M, sec, fy, P.Ly, false, { tag: t });
    var sh = S.shear_strength(c, env.V, sec, fy, { tag: t });
    var comb = S.combined(c, env.Pc, env.M, comp, bend, sec, fy, { tag: t });
    var ok = comp.ok && comp.slender <= 180 * (1 + 1e-9) && bend.ok && sh.ok && comb && bend["class"] !== "Slender";
    if (env.Pt > 1) ok = S.tension(c, env.Pt, sec.A, fy, fu, 0.0, { tag: t }).ok && ok;
    return ok;
  }
  M.check_col = check_col;

  function peb_sec(d, b, tf, tw) { return SC.builtup_i(Math.round(d), b, tf, tw); }
  function peb_cands(fy, kind) {
    var e = Math.sqrt(250 / fy), out = [];
    for (var d = 300; d <= 1200; d += 50) [150, 180, 200, 250, 300].forEach(function (b) {
      [8, 10, 12, 16, 20].forEach(function (tf) {
        [5, 6, 8, 10].forEach(function (tw) {
          if (tf < tw || (d - 2 * tf) / tw > 126 * e || b / 2 / tf > 13.6 * e || b > 0.6 * d) return;
          var d2 = kind === "col_fixed" ? d : Math.max(250, up(0.45 * d, 50));
          out.push({ d: d, d2: Math.min(d2, d), b: b, tf: tf, tw: tw, w: (2 * b * tf + ((d + Math.min(d2, d)) / 2 - 2 * tf) * tw) * 7.85e-3 });
        });
      });
    });
    out.sort(function (a, b) { return a.w - b.w || a.d - b.d; });
    return out;
  }
  M.peb_cands = peb_cands;
  function peb_col_fn(p) { return function (y, h) { return peb_sec(p.d2 + (p.d - p.d2) * y / h, p.b, p.tf, p.tw); }; }
  function peb_raf_fn(p, mono) { return function (t) { var s = mono ? Math.max(0, 1 - t / 0.4, 1 - (1 - t) / 0.4) : Math.max(0, 1 - t / 0.4); return peb_sec(p.d2 + (p.d - p.d2) * s, p.b, p.tf, p.tw); }; }
  function pebName(p) { return "BU " + g(p.d) + (p.d2 !== p.d ? "→" + g(p.d2) : "") + "x" + g(p.b) + "x" + g(p.tf) + "x" + g(p.tw); }
  M.pebName = pebName;

  M.design_frame = function (c, inp, G, L, W, PUR, CR, mode) {
    var fyu = MT.STEEL_GRADES[inp.steel], fy = fyu[0], fu = fyu[1];
    var pw = PUR.wavg * 9.81e-3 / G.ps;
    var Kz = G.fixed ? 1.2 : 2.0;
    var Ly_col = G.clad && G.rowsR > 0 ? Math.min(2 * G.gsp, G.eave) : G.eave / 2;
    var Ly_raf = G.ps, LLT_raf = Math.min(2 * G.ps, G.raf_len);
    var lim_v = G.span * 1000 / (G.kind === "truss" ? 240 : 180), lim_s = G.eave * 1000 / 150;
    var lim_c = CR ? CR.rail_h * 1000 / 400 : 1e9;
    var colP = function (tag) { return { Lz: G.kind === "mono" ? G.h2 : G.eave, Kz: Kz, Ly: Ly_col, tag: tag }; };
    var rafP = function (tag) { return { Lz: G.raf_len, Kz: 1.0, Ly: Ly_raf, tag: tag }; };
    var rafPL = function (tag) { return { Lz: G.raf_len, Kz: 1.0, Ly: LLT_raf, tag: tag }; };
    var out = { fy: fy, fu: fu, Kz: Kz, Ly_col: Ly_col, LLT_raf: LLT_raf, lim_v: lim_v, lim_s: lim_s, lim_c: lim_c, pw: pw };
    G.haunch_t = 0;
    if ((G.kind === "portal" || G.kind === "mono") && inp.haunch) G.haunch_t = G.kind === "mono" ? 0.1 : 0.2;
    if (G.kind === "truss") G.kb_h = Math.min(Math.max(0.15 * G.eave, 0.9), 1.8);
    var A, it, k;
    function haunchSec(raf) { return SC.builtup_i(Math.round(2 * raf.h - raf.tf), raf.b, raf.tf, raf.tw); }
    function isHaunch(t) { return G.haunch_t > 0 && (t < G.haunch_t || (G.kind === "mono" && t > 1 - G.haunch_t)); }
    function rafIds(A0, haunch) { return A0.model.mem.rafL.concat(A0.model.mem.rafR).filter(function (m) { return isHaunch(A0.model.mem.info[m].t) === haunch; }); }
    function colIds(A0) { return A0.model.mem.colL.concat(A0.model.mem.colR); }
    function crit(A0) { return A0.v <= lim_v && A0.sway <= lim_s && A0.csway <= lim_c; }

    if (G.kind === "portal" || G.kind === "mono") {
      var LIST = M.ROLLED;
      var secs = function (cn, rn) { var cs = section(cn), rs = section(rn), hs = haunchSec(rs); return { col: function () { return cs; }, raf: function (t) { return isHaunch(t) ? hs : rs; } }; };
      var okC = function (cc, n, A0) { return check_col(cc, section(n), envOf(A0, colIds(A0)), fy, fu, colP("(column)")); };
      var okR = function (cc, n, A0) {
        var r = check_col(cc, section(n), envOf(A0, rafIds(A0, false)), fy, fu, rafP("(rafter)"));
        r = r && S.bending(cc, envOf(A0, rafIds(A0, false)).M, section(n), fy, LLT_raf, false, { tag: "(rafter, bottom flange LTB)" }).ok;
        if (G.haunch_t > 0) r = r && check_col(cc, haunchSec(section(n)), envOf(A0, rafIds(A0, true)), fy, fu, rafPL("(haunch)"));
        return r;
      };
      var cn, rn;
      if (mode === "check") { cn = inp.col_sec; rn = inp.raf_sec; }
      else {
        cn = rn = "ISMB 300";
        var IzC = 0, IzR = 0;
        for (it = 0; it < 14; it++) {
          A = M.analyse(G, L, W, pw, secs(cn, rn), CR);
          var nc = firstOk(LIST, function (n) { return section(n).Iz >= IzC && okC(new Calc("s"), n, A); }) || last(LIST);
          var nr = firstOk(LIST, function (n) { return section(n).Iz >= IzR && okR(new Calc("s"), n, A); }) || last(LIST);
          var A2 = M.analyse(G, L, W, pw, secs(nc, nr), CR);
          if (A2.v > lim_v) IzR = Math.max(IzR, section(nr).Iz * Math.min(A2.v / lim_v, 1.6) * 1.01);
          if (A2.sway > lim_s || A2.csway > lim_c) { var fs1 = Math.min(Math.max(A2.sway / lim_s, A2.csway / lim_c), 1.6); IzC = Math.max(IzC, section(nc).Iz * Math.pow(fs1, 0.6) * 1.01); IzR = Math.max(IzR, section(nr).Iz * Math.pow(fs1, G.fixed ? 0.2 : 0.4) * 1.01); }
          if (nc === cn && nr === rn && crit(A2)) break;
          cn = nc; rn = nr;
        }
        for (it = 0; it < 25; it++) {
          A = M.analyse(G, L, W, pw, secs(cn, rn), CR);
          var swf = A.sway > lim_s || A.csway > lim_c;
          var a1 = okC(new Calc("s"), cn, A) && !swf, a2 = okR(new Calc("s"), rn, A) && A.v <= lim_v && !(swf && it % 2 === 1);
          if (a1 && a2) break;
          if (!a1) { var izc1 = section(cn).Iz * (A.sway > lim_s || A.csway > lim_c ? 1.05 : 1.0); cn = firstOk(LIST.slice(LIST.indexOf(cn) + 1), function (n) { return section(n).Iz >= izc1; }) || last(LIST); }
          if (!a2) { var izr1 = section(rn).Iz * (A.v > lim_v ? 1.05 : 1.0); rn = firstOk(LIST.slice(LIST.indexOf(rn) + 1), function (n) { return section(n).Iz >= izr1; }) || last(LIST); }
        }
      }
      A = M.analyse(G, L, W, pw, secs(cn, rn), CR);
      out.col = section(cn); out.raf = section(rn); out.colName = cn; out.rafName = rn;
      out.haunch = G.haunch_t > 0 ? haunchSec(out.raf) : null;
      out.Lh = G.haunch_t * G.raf_len;
      out.A = A;
      out.record = function () {
        var eC = envOf(A, colIds(A)), eR = envOf(A, rafIds(A, false));
        c.section("Main frame – analysis (direct stiffness, 2-D)");
        c.info("Load combinations analysed", Object.keys(A.res).join("; "), "IS 800 Table 4");
        c.let("Roof dead load on frame (incl. purlins)", "wd", R(A.cs.droof, 3), "kN/m", "IS 875-1");
        c.let("Roof imposed load on frame (plan)", "wq", R(L.q * G.bay, 3), "kN/m", "IS 875-2");
        c.let("Column design forces", "", "M = " + f1(eC.M) + " kN·m (" + eC.M_combo + "), P = " + f1(eC.Pc) + " kN, T = " + f1(eC.Pt) + " kN, V = " + f1(eC.V) + " kN", "");
        c.let("Rafter design forces", "", "M = " + f1(eR.M) + " kN·m (" + eR.M_combo + "), P = " + f1(eR.Pc) + " kN, V = " + f1(eR.V) + " kN", "");
        c.section("Column – " + cn);
        c.let("Effective lengths", "", "in-plane K = " + g(Kz) + " (" + (G.fixed ? "fixed base" : "pinned base, sway frame") + "), out-of-plane / LTB " + f2(Ly_col) + " m (girts + fly braces)", "", "IS 800 cl 7.2.2 / Annex D");
        check_col(c, out.col, eC, fy, fu, colP("(column)"));
        c.section("Rafter – " + rn);
        c.let("Restraints", "", "top flange by purlins @ " + f2(Ly_raf) + " m; bottom flange by fly braces @ " + f2(LLT_raf) + " m", "", "IS 800 cl 8.3");
        check_col(c, out.raf, eR, fy, fu, rafP("(rafter)"));
        S.bending(c, eR.M, out.raf, fy, LLT_raf, false, { tag: "(rafter, bottom flange LTB)" });
        if (out.haunch) {
          c.section("Haunch at knee – " + out.haunch.name);
          c.let("Haunch length (from column face)", "Lh", R(out.Lh, 2), "m", "Practice ≈ span/10", "haunch cut from the rafter section, total depth ≈ 2 × rafter depth");
          check_col(c, out.haunch, envOf(A, rafIds(A, true)), fy, fu, rafPL("(haunch)"));
        }
      };
    } else if (G.kind === "peb") {
      var CC = peb_cands(fy, G.fixed ? "col_fixed" : "col"), RCc = peb_cands(fy, "raf");
      var cp, rp;
      var secsP = function (a, b) { return { col: peb_col_fn(a), raf: peb_raf_fn(b, false) }; };
      var okPC = function (cc, p, A0) {
        var fnc = peb_col_fn(p);
        return colIds(A0).every(function (m) { var inf = A0.model.mem.info[m]; return check_col(cc, fnc(inf.y, inf.h), A0.env[m], fy, fu, colP("(column)")); });
      };
      var okPR = function (cc, p, A0) {
        var fnr = peb_raf_fn(p, false);
        return rafIds(A0, false).every(function (m) { var inf = A0.model.mem.info[m]; var s = fnr(inf.t); return check_col(cc, s, A0.env[m], fy, fu, rafP("(rafter)")) && S.bending(cc, A0.env[m].M, s, fy, LLT_raf, false, { tag: "(rafter LTB)" }).ok; });
      };
      if (mode === "check") {
        cp = { d: num(inp.peb_col_d), d2: num(inp.peb_col_d2), b: num(inp.peb_b), tf: num(inp.peb_tf), tw: num(inp.peb_tw) };
        rp = { d: num(inp.peb_raf_d), d2: num(inp.peb_raf_d2), b: num(inp.peb_b), tf: num(inp.peb_tf), tw: num(inp.peb_tw) };
      } else {
        cp = CC.filter(function (p) { return p.d === 500 && p.b === 200; })[0] || CC[0]; rp = RCc.filter(function (p) { return p.d === 500 && p.b === 200; })[0] || RCc[0];
        var IzC2 = 0, IzR2 = 0;
        for (it = 0; it < 10; it++) {
          A = M.analyse(G, L, W, pw, secsP(cp, rp), CR);
          var ncp = firstOk(CC, function (p) { return peb_sec(p.d, p.b, p.tf, p.tw).Iz >= IzC2 && okPC(new Calc("s"), p, A); }) || last(CC);
          var nrp = firstOk(RCc, function (p) { return peb_sec(p.d, p.b, p.tf, p.tw).Iz >= IzR2 && okPR(new Calc("s"), p, A); }) || last(RCc);
          var B2 = M.analyse(G, L, W, pw, secsP(ncp, nrp), CR);
          if (B2.v > lim_v) IzR2 = Math.max(IzR2, peb_sec(nrp.d, nrp.b, nrp.tf, nrp.tw).Iz * Math.min(B2.v / lim_v, 1.6) * 1.01);
          if (B2.sway > lim_s || B2.csway > lim_c) { var fs2 = Math.min(Math.max(B2.sway / lim_s, B2.csway / lim_c), 1.6); IzC2 = Math.max(IzC2, peb_sec(ncp.d, ncp.b, ncp.tf, ncp.tw).Iz * Math.pow(fs2, 0.6) * 1.01); IzR2 = Math.max(IzR2, peb_sec(nrp.d, nrp.b, nrp.tf, nrp.tw).Iz * Math.pow(fs2, 0.4) * 1.01); }
          if (ncp === cp && nrp === rp && crit(B2)) break;
          cp = ncp; rp = nrp;
        }
        for (it = 0; it < 30; it++) {
          A = M.analyse(G, L, W, pw, secsP(cp, rp), CR);
          var b1 = okPC(new Calc("s"), cp, A) && A.sway <= lim_s && A.csway <= lim_c, b2 = okPR(new Calc("s"), rp, A) && A.v <= lim_v;
          if (b1 && b2) break;
          var swp = A.sway > lim_s || A.csway > lim_c;
          if (swp && it % 2 === 1) b2 = false;
          if (!b1) { var izc = peb_sec(cp.d, cp.b, cp.tf, cp.tw).Iz * (swp ? 1.05 : 1.0); cp = firstOk(CC.slice(CC.indexOf(cp) + 1), function (p) { return peb_sec(p.d, p.b, p.tf, p.tw).Iz >= izc; }) || last(CC); }
          if (!b2) { var izr = peb_sec(rp.d, rp.b, rp.tf, rp.tw).Iz * (A.v > lim_v ? 1.05 : 1.0); rp = firstOk(RCc.slice(RCc.indexOf(rp) + 1), function (p) { return peb_sec(p.d, p.b, p.tf, p.tw).Iz >= izr; }) || last(RCc); }
        }
      }
      A = M.analyse(G, L, W, pw, secsP(cp, rp), CR);
      out.cp = cp; out.rp = rp; out.A = A;
      out.col = peb_sec(cp.d, cp.b, cp.tf, cp.tw); out.raf = peb_sec(rp.d, rp.b, rp.tf, rp.tw);
      out.colName = pebName(cp); out.rafName = pebName(rp);
      out.col_w = sumOf(colIds(A).map(function (m) { return A.model.mem.info[m].sec.w * A.model.f.geom(A.model.f.members[m])[0]; })) / 2 / (G.kind === "mono" ? (G.eave + G.h2) / 2 : G.eave);
      out.raf_w = sumOf(rafIds(A, false).map(function (m) { return A.model.mem.info[m].sec.w * A.model.f.geom(A.model.f.members[m])[0]; })) / 2 / G.raf_len;
      out.record = function () {
        c.section("Main frame – analysis (direct stiffness, 2-D)");
        c.info("Load combinations analysed", Object.keys(A.res).join("; "), "IS 800 Table 4");
        c.info("Tapered members", "each member modelled as segments with depth varying linearly (column " + g(cp.d2) + "→" + g(cp.d) + " mm; rafter " + g(rp.d) + "→" + g(rp.d2) + " mm over 40 % of the rafter); flanges " + g(cp.b) + "×" + g(cp.tf) + ", web " + g(cp.tw) + " mm", "IS 800 cl 4.4");
        c.let("Roof dead load on frame (incl. purlins)", "wd", R(A.cs.droof, 3), "kN/m", "IS 875-1");
        c.section("Column (tapered) – " + out.colName);
        c.let("Effective lengths", "", "in-plane K = " + g(Kz) + "; out-of-plane / LTB " + f2(Ly_col) + " m", "", "IS 800 cl 7.2.2");
        var fnc = peb_col_fn(cp), fnr = peb_raf_fn(rp, false);
        // record the governing segment at top and bottom of the column
        var ids = colIds(A), top = ids.reduce(function (b, m) { return A.env[m].M > A.env[b].M ? m : b; }, ids[0]);
        var bot = ids.reduce(function (b, m) { return A.model.mem.info[m].y < A.model.mem.info[b].y ? m : b; }, ids[0]);
        [[top, "(column, max moment segment)"], [bot, "(column, base segment)"]].forEach(function (q) {
          var inf = A.model.mem.info[q[0]], s = fnc(inf.y, inf.h);
          c.let("Segment at y = " + f2(inf.y) + " m", "", s.name + " – M " + f1(A.env[q[0]].M) + " kN·m, P " + f1(A.env[q[0]].Pc) + " kN", "");
          check_col(c, s, A.env[q[0]], fy, fu, colP(q[1]));
        });
        c.section("Rafter (tapered) – " + out.rafName);
        var rids = rafIds(A, false);
        var knee = rids.reduce(function (b, m) { return A.model.mem.info[m].t < A.model.mem.info[b].t ? m : b; }, rids[0]);
        var mid = rids.filter(function (m) { return A.model.mem.info[m].t >= 0.4; }).reduce(function (b, m) { return b == null || A.env[m].M > A.env[b].M ? m : b; }, null);
        [[knee, "(rafter at knee)"], [mid == null ? knee : mid, "(rafter, prismatic zone)"]].forEach(function (q) {
          var inf = A.model.mem.info[q[0]], s = fnr(inf.t);
          c.let("Segment at " + f0(inf.t * 100) + " % of rafter", "", s.name + " – M " + f1(A.env[q[0]].M) + " kN·m", "");
          check_col(c, s, A.env[q[0]], fy, fu, rafP(q[1]));
          S.bending(c, A.env[q[0]].M, s, fy, LLT_raf, false, { tag: q[1].replace(")", ", LTB)") });
        });
        c.ok("All column segments satisfy IS 800 checks", okPC(new Calc("s"), cp, A), { detail: C.pystr(ids.length * 2) + " segments", clause: "IS 800 cl 9.3" });
        c.ok("All rafter segments satisfy IS 800 checks", okPR(new Calc("s"), rp, A), { detail: C.pystr(rids.length) + " segments", clause: "IS 800 cl 9.3" });
      };
    } else {                                                        // truss on columns
      out.truss = M.design_truss_frame(c, inp, G, L, W, PUR, CR, mode, { fy: fy, fu: fu, colP: colP, pw: pw, lim_v: lim_v, lim_s: lim_s, lim_c: lim_c });
      A = out.truss.A; out.A = A; out.col = section(out.truss.colName); out.colName = out.truss.colName; out.raf = null; out.rafName = "—";
      out.record = out.truss.record;
    }
    return out;
  };

  /* --------------------------------------------------------------------------- truss on columns */
  var ANG = SC.by_weight(SC.ISA).filter(function (n) { var s = section(n); return s.leg >= 50 && s.t >= 6; });   // min ISA 50x50x6
  M.design_truss_frame = function (c, inp, G, L, W, PUR, CR, mode, X) {
    var fy = X.fy, fu = X.fu, A, it;
    var given = mode === "check" ? { "Top chord": inp.top_sec, "Bottom chord": inp.bot_sec } : {};
    var groupsOrder = /Fink/.test(G.style) ? ["Top chord", "Bottom chord", "Web struts", "Web ties"] : ["Top chord", "Bottom chord", "Verticals", "Diagonals"];
    var Lp = G.raf_len / G.nh, Lbot = G.span / (G.n_pan || 4);
    var trussA = {}, des = {}, colName = mode === "check" ? inp.col_sec : "ISMB 250", kbName = "ISA 65x65x6";
    var selfw = (G.span / 3 + 5) * 10 / 1000;
    function secsT() { return { col: function () { return section(colName); }, raf: null, truss: trussA, kb: SC.double_angle(kbName), truss_kN_m2: selfw }; }
    function forces(A0) {
      var fr = {};
      Object.keys(A0.model.mem.truss).forEach(function (gname) {
        var ids = A0.model.mem.truss[gname], T = 0, Cc = 0, Lm = 0;
        Object.keys(A0.res).forEach(function (k) { ids.forEach(function (m) { var n = A0.res[k].axial(m); T = Math.max(T, n); Cc = Math.max(Cc, -n); }); });
        ids.forEach(function (m) { Lm = Math.max(Lm, A0.model.f.geom(A0.model.f.members[m])[0]); });
        fr[gname] = { T: T, C: Cc, L: Lm, ids: ids, n: ids.length };
      });
      var kT = 0, kC = 0, kL = 0;
      Object.keys(A0.res).forEach(function (k) { A0.model.mem.kb.forEach(function (m) { var n = A0.res[k].axial(m); kT = Math.max(kT, n); kC = Math.max(kC, -n); }); });
      A0.model.mem.kb.forEach(function (m) { kL = A0.model.f.geom(A0.model.f.members[m])[0]; });
      fr["Knee brace"] = { T: kT, C: kC, L: kL, ids: A0.model.mem.kb, n: 2 };
      return fr;
    }
    function memCheck(cc, gname, name0, fr, record) {
      var isI = /^IS[MH]B/.test(name0);
      var dbl = !isI && (gname === "Top chord" || gname === "Bottom chord" || gname === "Knee brace" || /^2-/.test(name0)), name = name0.replace(/^2-/, "");
      var sec = isI ? Object.assign({}, section(name), { t: section(name).tf, leg: section(name).b }) : dbl ? SC.double_angle(name) : section(name);
      var Lz = gname === "Top chord" ? Lp : fr.L, Ly = gname === "Top chord" ? Math.min(G.ps, Lp) : gname === "Bottom chord" ? 2 * Lbot : fr.L;
      var rz = isI ? sec.rz : dbl ? sec.rxx : sec.rvv, ry = isI ? sec.ry : dbl ? sec.ryy : sec.rvv;
      var t = "(" + gname.toLowerCase() + ")", ok = true;
      var lim = fr.C > 0.1 * Math.max(fr.T, 1e-6) && fr.C > 0 ? (fr.C < 0.5 * fr.T || gname === "Bottom chord" ? 250 : 180) : 350;
      if (fr.C > 0.01) {
        var r = S.compression(cc, fr.C, isI ? sec : { A: sec.A, rz: rz, ry: ry, family: "ISA", h: 1, b: 1, tf: 1 }, fy, Lz, Ly, 0.85, dbl || isI ? 1.0 : 0.85, { tag: t, limit: lim });
        ok = ok && r.ok && r.slender <= lim;
      }
      if (fr.T > 0.01) {
        var holes = (dbl ? 2 : 1) * hole(16) * sec.t;
        var lt = lim === 180 ? 180 : 350;
        ok = S.tension(cc, fr.T, sec.A, fy, fu, holes, { tag: t, slender: Lz * 1000 / Math.min(rz, ry), limit: lt,
          n_bolts: isI ? null : M.joint_bolts(sec, dbl, Math.max(fr.T, fr.C), fu).nb }).ok && ok && Lz * 1000 / Math.min(rz, ry) <= lt;
      }
      if (gname === "Top chord" && G.off_node) {
        var k = (G.n_purl - 1) / G.nh;
        var Mloc = cc.calc("Local bending in top chord (purlins between nodes)", "Mt", "P*k*Lp/8", "kN·m", "IS 800 cl 9.3", "equivalent UDL of " + C.pystr(k - 1) + " intermediate purlin(s)", { P: R(PUR.P1.R_g, 3), k: k, Lp: R(Lp, 3) });
        var Zt = isI ? sec.Zez : 2 * section(name).Ixx / (section(name).leg - section(name).Cz);
        var fcd = S.fcd(fy, 0.85 * Lz * 1000, rz, "c")[0];
        var ir = cc.calc("Axial + local bending interaction (top chord)", "IR", "P/(A*fcd/1000) + Mt/(Z*fy/gm0/1e6)", "", "IS 800 cl 9.3.1", { P: R(fr.C, 2), A: R(sec.A), fcd: R(fcd, 2), Mt: Mloc, Z: R(Zt), fy: fy, gm0: GM0 });
        ok = cc.check("Top chord combined (local bending)", ir, 1.0, { clause: "IS 800 cl 9.3.1" }) && ok;
      }
      return { ok: ok, sec: sec, dbl: dbl, isI: isI, Lz: Lz, Ly: Ly };
    }
    var WEBS = ANG.concat(ANG.map(function (n) { return "2-" + n; })).map(function (n, i) { return [n, i]; })
      .sort(function (a, b) { return section(a[0].replace(/^2-/, "")).w * (/^2-/.test(a[0]) ? 2 : 1) - section(b[0].replace(/^2-/, "")).w * (/^2-/.test(b[0]) ? 2 : 1) || a[1] - b[1]; }).map(function (x) { return x[0]; });
    var TOPI = SC.by_weight(SC.ISMB).filter(function (n) { return section(n).h >= 150; }).concat(SC.by_weight(SC.ISHB));
    function listFor(gn) { return gn === "Top chord" ? ANG.concat(TOPI) : gn === "Bottom chord" || gn === "Knee brace" ? ANG : WEBS; }
    var colOK = function (cc, n, A0) { return check_col(cc, section(n), envOf(A0, A0.model.mem.colL.concat(A0.model.mem.colR)), fy, fu, X.colP("(column)")); };
    groupsOrder.forEach(function (gn) { trussA[gn] = 1500; });
    for (it = 0; it < 5; it++) {
      A = M.analyse(G, L, W, X.pw, secsT(), CR);
      var fr = forces(A), chg = false;
      groupsOrder.concat(["Knee brace"]).forEach(function (gn) {
        if (!fr[gn]) return;
        var gv = mode === "check" ? (given[gn] || (gn === "Knee brace" ? (inp.kb_sec || kbName) : inp.web_sec)) : null;
        var LST = listFor(gn);
        var nm = gv || firstOk(LST, function (n) { return memCheck(new Calc("s"), gn, n, fr[gn]).ok; }) || last(LST);
        if (!des[gn] || des[gn].name !== nm) chg = true;
        var sc = memCheck(new Calc("s"), gn, nm, fr[gn]);
        des[gn] = { name: nm, label: sc.dbl ? "2-" + nm.replace(/^2-/, "") + " b/b" : nm, isI: sc.isI, sec: sc.sec, w: sc.sec.w, fr: fr[gn], dbl: sc.dbl };
        if (gn === "Knee brace") kbName = nm; else trussA[gn] = sc.sec.A;
      });
      if (mode !== "check") {
        var nc = firstOk(ROLLED, function (n) { return colOK(new Calc("s"), n, A); }) || last(ROLLED);
        if (nc !== colName) chg = true;
        colName = nc;
      }
      if (!chg && it > 0) break;
    }
    // stiffness bump for sway / deflection
    for (it = 0; it < 20 && mode !== "check"; it++) {
      A = M.analyse(G, L, W, X.pw, secsT(), CR);
      if (A.sway <= X.lim_s && A.csway <= X.lim_c && colOK(new Calc("s"), colName, A)) break;
      if (ROLLED.indexOf(colName) < ROLLED.length - 1) colName = ROLLED[ROLLED.indexOf(colName) + 1]; else break;
    }
    for (it = 0; it < 14; it++) {
      A = M.analyse(G, L, W, X.pw, secsT(), CR);
      var fr2 = forces(A), chg2 = false;
      groupsOrder.concat(["Knee brace"]).forEach(function (gn) {
        if (!fr2[gn] || mode === "check") return;
        var ok0 = memCheck(new Calc("s"), gn, des[gn].name, fr2[gn]).ok;
        if (ok0) return;
        var L2 = listFor(gn), nm2 = firstOk(L2.slice(Math.max(L2.indexOf(des[gn].name), 0)), function (n) { return memCheck(new Calc("s"), gn, n, fr2[gn]).ok; }) || last(L2);
        var sc2 = memCheck(new Calc("s"), gn, nm2, fr2[gn]);
        des[gn] = { name: nm2, label: sc2.dbl ? "2-" + nm2.replace(/^2-/, "") + " b/b" : nm2, sec: sc2.sec, w: sc2.sec.w, fr: fr2[gn], dbl: sc2.dbl };
        if (gn === "Knee brace") kbName = nm2; else trussA[gn] = sc2.sec.A;
        chg2 = true;
      });
      if (mode !== "check" && (!colOK(new Calc("s"), colName, A) || A.sway > X.lim_s || A.csway > X.lim_c)) {
        var Iz0 = section(colName).Iz * Math.min(Math.max(A.sway / X.lim_s, A.csway / X.lim_c, 1), 1.5);
        colName = firstOk(ROLLED.slice(ROLLED.indexOf(colName)), function (n) { return section(n).Iz >= Iz0 && n !== colName && colOK(new Calc("s"), n, A); }) || last(ROLLED); chg2 = true;
      }
      if (!chg2) break;
    }
    A = M.analyse(G, L, W, X.pw, secsT(), CR);
    var frF = forces(A);
    Object.keys(des).forEach(function (gn) { des[gn].fr = frF[gn]; });
    var out = { A: A, des: des, colName: colName, groups: groupsOrder, Lp: Lp, selfw: selfw, forces: frF };
    out.record = function () {
      c.section("Truss frame – analysis (truss members pin-jointed, columns continuous, knee braces)");
      c.info("Load combinations analysed", Object.keys(A.res).join("; "), "IS 800 Table 4");
      c.calc("Truss self-weight (empirical)", "wt", "(L/3 + 5)*10/1000", "kN/m²", "Duggal / Ramamrutham", { L: G.span });
      c.let("Knee brace", "", "from column at " + f2(G.eave - G.kb_h) + " m to first bottom-chord node (provides frame action for pinned bases)", "");
      groupsOrder.concat(["Knee brace"]).forEach(function (gn) {
        var d = des[gn]; if (!d) return;
        c.section(gn + " – " + d.label);
        c.let("Design forces", "", "T = " + f1(frF[gn].T) + " kN, C = " + f1(frF[gn].C) + " kN, L = " + f2(frF[gn].L) + " m", "");
        memCheck(c, gn, d.name, frF[gn], true);
        c.ok("Minimum section ISA 50x50x6 for truss members", d.sec.t >= 6 && (d.sec.leg || d.sec.b || 0) >= 50, { detail: d.label, clause: "IS 800 cl 3.8 / practice" });
      });
      c.section("Column – " + colName);
      c.let("Effective lengths", "", "in-plane K = " + g(X.colP("").Kz) + ", out-of-plane " + f2(X.colP("").Ly) + " m", "", "IS 800 cl 7.2.2");
      colOK(c, colName, A);
    };
    return out;
  };

  /* =========================================================================== EOT crane (simplified) */
  M.crane = function (c, inp, G, fy, fu, mode) {
    c.section("EOT crane – loads, gantry girder & bracket (SIMPLIFIED)");
    var Wt = num(inp.crane_cap), Sc = num(inp.crane_span) > 0 ? num(inp.crane_span) : G.span - 1.0;
    var rail_h = num(inp.rail_h) > 0 ? Math.min(num(inp.rail_h), G.eave - 0.6) : Math.max(G.eave - 1.5, 0.6 * G.eave);
    var eot = inp.crane_class !== CRANE_CLASS[1];
    c.let("Crane capacity / span / rail level", "", g(Wt) + " t / " + f2(Sc) + " m / +" + f2(rail_h) + " m", "", "Crane data (input)");
    var Wl = c.calc("Lifted load", "Wl", "W*9.81", "kN", "", { W: Wt });
    var Wc = c.calc("Crab (trolley) weight – approx.", "Wc", "0.3*Wl", "kN", "IS 3177 / maker's data", "replace with the crane maker's data", { Wl: Wl });
    var Wb = c.calc("Crane bridge weight – approx.", "Wb", "(0.6*W + 0.25*Sc)*9.81", "kN", "maker's data", { W: Wt, Sc: R(Sc, 3) });
    var emin = Wt <= 10 ? 1.0 : 1.2, aw = Wt <= 10 ? 3.0 : Wt <= 25 ? 3.5 : 4.0;
    c.let("Minimum hook approach / wheel base", "", g(emin) + " m / " + g(aw) + " m", "", "maker's data (assumed)");
    var Rmax = c.calc("Max. static reaction on one rail", "Rmax", "Wb/2 + (Wl + Wc)*(Sc - e)/Sc", "kN", "statics", { Wb: Wb, Wl: Wl, Wc: Wc, Sc: R(Sc, 3), e: emin });
    var Rmin = c.calc("Min. static reaction on the other rail", "Rmin", "Wb/2 + (Wl + Wc)*e/Sc", "kN", "statics", { Wb: Wb, Wl: Wl, Wc: Wc, Sc: R(Sc, 3), e: emin });
    var Pw = c.calc("Static wheel load (2 wheels per end carriage)", "Pw", "Rmax/2", "kN", "", { Rmax: Rmax });
    var iv = eot ? 0.25 : 0.10, ih = eot ? 0.10 : 0.05;
    c.let("Impact allowances", "", "vertical " + g(iv * 100) + " %, lateral surge " + g(ih * 100) + " % of (Wl + Wc), longitudinal 5 % of wheel loads", "", "IS 875-2 cl 6.3 / Table 3");
    var Hs_tot = c.calc("Total lateral surge", "Hs", "ih*(Wl + Wc)", "kN", "IS 875-2 cl 6.3", { ih: ih, Wl: Wl, Wc: Wc });
    var Hw = c.calc("Lateral surge per wheel", "Hw", "Hs/4", "kN", "shared equally by 4 wheels", { Hs: Hs_tot });
    var Hlong = c.calc("Longitudinal tractive force per rail", "HL", "0.05*Rmax", "kN", "IS 875-2 cl 6.3", { Rmax: Rmax });
    // gantry girder: ISMB + ISMC cap
    var L = G.bay, iList = SC.by_weight(SC.ISMB).filter(function (n) { return section(n).h >= 300; });
    var cList = SC.by_weight(SC.ISMC).filter(function (n) { return section(n).h >= 200; });
    var mv = LD.max_moment_moving([Pw * (1 + iv), Pw * (1 + iv)], [aw], L, 0.05);
    var cand = [];
    iList.forEach(function (i) { cList.forEach(function (ch) { if (section(ch).h >= section(i).b + 40) cand.push([i, ch, section(i).w + section(ch).w]); }); });
    cand.sort(function (a, b) { return a[2] - b[2]; });
    function props(i, ch) {
      var I = section(i), Cn = section(ch);
      var yc = I.h + Cn.tw - Cn.Cy, A = I.A + Cn.A, yb = (I.A * I.h / 2 + Cn.A * yc) / A;
      var Iz = I.Iz + I.A * Math.pow(yb - I.h / 2, 2) + Cn.Iy + Cn.A * Math.pow(yc - yb, 2);
      var Iyt = I.Iy / 2 + Cn.Iz;
      return { I: I, Cn: Cn, A: A, yb: yb, Iz: Iz, Zt: Iz / (I.h + Cn.tw - yb), Zb: Iz / yb, Zyt: Iyt / (Cn.h / 2), w: I.w + Cn.w };
    }
    function chk(cc, i, ch) {
      var p = props(i, ch), sw = p.w * 9.81e-3 + 0.3;
      var Mz = cc.calc("Factored vertical moment (2 wheels + self + rail)", "Mz", "1.5*(Mw + w*L**2/8)", "kN·m", "IS 800 Table 4", "Mw by moving loads (with impact)", { Mw: R(mv[0], 3), w: R(sw, 3), L: L });
      var My = cc.calc("Factored lateral moment (surge)", "My", "1.5*Mw*Hw/(Pw*(1 + iv))", "kN·m", "IS 875-2 cl 6.3", { Mw: R(mv[0], 3), Hw: R(Hw, 3), Pw: R(Pw, 3), iv: iv });
      var Mcr = S.mcr_i(p.I, L * 1000) * (1 + p.Cn.Iz / (p.I.Iy / 2)) / 2;
      var lam = Math.sqrt(p.Zt * fy / Mcr), phi = 0.5 * (1 + 0.21 * (lam - 0.2) + lam * lam), chi = lam <= 0.4 ? 1 : Math.min(1 / (phi + Math.sqrt(Math.max(phi * phi - lam * lam, 0))), 1);
      var Mdz = cc.calc("Moment capacity (top, LTB, elastic)", "Mdz", "chi*Zt*fy/gm0/1e6", "kN·m", "IS 800 cl 8.2.2 (simplified, compression flange enhanced by channel)", { chi: R(chi, 4), Zt: R(p.Zt), fy: fy, gm0: GM0 });
      var Mdy = cc.calc("Lateral moment capacity of top flange + channel", "Mdy", "Zy*fy/gm0/1e6", "kN·m", "IS 800 cl 9.3.1", { Zy: R(p.Zyt), fy: fy, gm0: GM0 });
      var ir = cc.calc("Biaxial interaction", "IR", "Mz/Mdz + My/Mdy", "", "IS 800 cl 9.3.1.1", { Mz: Mz, Mdz: Mdz, My: My, Mdy: Mdy });
      var ok = cc.check("Gantry girder bending", ir, 1.0, { clause: "IS 800 cl 9.3.1.1" });
      var V = cc.calc("Factored shear", "V", "1.5*(Vw + w*L/2)", "kN", "", { Vw: R(mv[1], 3), w: R(sw, 3), L: L });
      ok = S.shear_strength(cc, V, p.I, fy, { tag: "(gantry)" }).ok && ok;
      ok = S.web_crippling(cc, 1.5 * Pw * (1 + iv), p.I, fy, 150, { tag: "(gantry under wheel)" }) && ok;
      var a1 = Math.max((L - aw) / 2, 0);
      var d = cc.calc("Deflection under static wheel loads", "δ", "P*a*(3*L**2 - 4*a**2)/(24*E*I)*1000", "mm", "IS 800 Table 6", { P: R(Pw, 3), a: R(a1, 3), L: L, E: E_ST * 1e3, I: R(p.Iz * 1e-12, 10) });
      ok = cc.check("Gantry deflection ≤ span/" + (eot ? "750" : "500"), d, L * 1000 / (eot ? 750 : 500), { unit: "mm", clause: "IS 800 Table 6" }) && ok;
      return ok;
    }
    var gi, gch;
    if (mode === "check" && inp.gantry_i) { gi = inp.gantry_i; gch = inp.gantry_c; }
    else { var pk = firstOk(cand, function (x) { return chk(new Calc("s"), x[0], x[1]); }) || last(cand); gi = pk[0]; gch = pk[1]; }
    c.let("Gantry girder", "", gi + " + " + gch + " cap (simply supported over " + g(L) + " m)", "", "IS 800 cl 8");
    chk(c, gi, gch);
    var gp = props(gi, gch);
    var Vcol = c.calc("Max. vertical load on column bracket (no impact, for frame)", "Vc", "Pw*(2 - a/L) + w*L", "kN", "influence line", { Pw: Pw, a: aw, L: L, w: R(gp.w * 9.81e-3 + 0.3, 3) });
    var Vcmin = c.calc("Vertical load on the opposite bracket", "Vc,min", "Rmin/2*(2 - a/L) + w*L", "kN", "", { Rmin: Rmin, a: aw, L: L, w: R(gp.w * 9.81e-3 + 0.3, 3) });
    var Hcol = c.calc("Surge transferred to each column (rail level)", "Hc", "Hw*(2 - a/L)", "kN", "", { Hw: Hw, a: aw, L: L });
    var e = 0.6;
    c.let("Eccentricity of rail from column centre-line", "e", e, "m", "layout (assumed)");
    // bracket: two vertical plates welded to the column flange
    var Vb = c.calc("Factored load on bracket (with impact)", "Vb", "1.5*Vc*(1 + iv)", "kN", "IS 875-2 cl 6.3", { Vc: Vcol, iv: iv });
    var Mb = c.calc("Bracket moment at column face", "Mb", "Vb*(e - 0.25)", "kN·m", "", "column half-depth ≈ 0.25 m", { Vb: Vb, e: e });
    var fwd = fu / (Math.sqrt(3) * GMW_S);
    var br = null;
    [300, 350, 400, 450, 500, 550, 600, 700, 800].some(function (d) {
      return [6, 8, 10, 12].some(function (s) {
        var fv = Vb * 1e3 / (2 * 0.7 * s * d), fb = Mb * 1e6 / (2 * 0.7 * s * d * d / 6);
        if (Math.sqrt(fb * fb + 3 * fv * fv) <= fwd) { br = { d: d, s: s }; return true; } return false;
      });
    });
    if (!br) br = { d: 800, s: 12 };
    c.let("Bracket plates (2 nos) depth × weld", "", g(br.d) + " mm deep, " + g(br.s) + " mm fillet both sides on column flange", "");
    var fe = c.calc("Weld equivalent stress (bracket to column)", "fe", "sqrt((Mb*1e6/(2*0.7*s*d**2/6))**2 + 3*(Vb*1e3/(2*0.7*s*d))**2)", "N/mm²", "IS 800 cl 10.5.10.1", { Mb: Mb, Vb: Vb, s: br.s, d: br.d });
    c.check("Bracket weld", fe, fwd, { unit: "N/mm²", clause: "IS 800 cl 10.5.7 (γmw 1.25 shop)" });
    var tb = plate_t(c.calc("Bracket plate thickness (bending)", "tb", "6*(Mb/2)*1e6*gm0/(d**2*fy)", "mm", "IS 800 cl 8.2.1", { Mb: Mb, d: br.d, gm0: GM0, fy: fy }));
    tb = Math.max(tb, 12);
    c.let("Bracket plate thickness adopted", "tb", tb, "mm");
    c.miss("Crane gantry girder & bracket are SIMPLIFIED: verify with crane maker's wheel loads, fatigue (IS 800 cl 13), rail clips, crane stops, LTB of the compound section (IS 800 Annex E) and stepped-column action", "IS 800 cl 13 / IS 807", "Critical");
    return { rail_h: rail_h, Vmax: Vcol, Vmin: Vcmin, Hs: Hcol, e: e, Pw: Pw, iv: iv, Hlong: Hlong, Rmax: Rmax, gi: gi, gch: gch, gp: gp, br: br, tb: tb, Wt: Wt, Sc: Sc, aw: aw };
  };

  /* =========================================================================== bolted end-plate moment connection */
  /* o: {tag, M, V, N (tension +), D (depth at joint), b, tf, tw, extended, grade, col (or null), fy, fu, given: {d, rows, t}} */
  M.end_plate = function (c, o, record) {
    var fy = o.fy, fu = o.fu, fub = MT.BOLT_GRADES[o.grade][0];
    function layout(d, nr) {
      var d0 = hole(d), e = up(1.5 * d0, 5), p = up(Math.max(2.5 * d, 3 * d), 5), pf = up(Math.max(e, d + 15), 5);
      var hc = o.D - o.tf, ys = [];
      if (o.extended) ys.push(hc + o.tf / 2 + pf);
      for (var k = 0; k < nr; k++) ys.push(hc - o.tf / 2 - pf - k * p);
      var ok = last(ys) >= 0.45 * o.D;
      var gg = Math.max(up(o.tw + 2 * (8 + d0), 10), up(2.5 * d, 10), 90);
      var B = Math.max(up(gg + 2 * e, 10), o.b);
      var Lp = up(o.D + (o.extended ? pf + e : 0) + 20, 10);
      return { d0: d0, e: e, p: p, pf: pf, ys: ys, ok: ok, g: gg, B: B, Lp: Lp, nrows: ys.length + (o.extended ? 1 : 2) };
    }
    function evalBolts(cc, d, nr, tgiven) {
      var Lg = layout(d, nr), t = o.tag;
      if (!Lg.ok) {
        // the bolt rows do not fit in the tension half of the joint: report it (and keep a complete result so BOM / drawings work)
        var tp0 = tgiven || plate_t(Math.max(d, o.tf + 2));
        cc.ok("Bolt rows fit in the tension half of the end plate " + t, false, { detail: C.pystr(nr) + " rows of M" + g(d) + " need more depth than " + g(o.D) + " mm – use fewer / larger bolts, an extended plate or a deeper haunch", clause: "IS 800 cl 10.2" });
        return { ok: false, d: d, nr: nr, t: tp0, L: Lg, nb: 2 * Lg.nrows, Te: 0, Q: 0, bv: S.bolt_values(new Calc("s"), d, o.grade, tp0, fu, 1, true, { tag: t }), ir: 0 };
      }
      var sy2 = sumOf(Lg.ys.map(function (y) { return y * y; }));
      var Trow = cc.calc("Tension in outermost bolt row (2 bolts) " + t, "Tr", "M*1e3*y1/sy2", "kN", "IS 800 cl 10.3 (elastic, rotation about compression flange)", { M: R(o.M, 3), y1: R(Lg.ys[0], 1), sy2: R(sy2, 1) });
      var nb = 2 * Lg.nrows;
      var Te = cc.calc("Tension per bolt incl. axial share " + t, "Te", "Tr/2 + max(N, 0)/nb", "kN", "", { Tr: Trow, N: R(o.N, 3), nb: nb });
      var be = Math.min(Lg.p, Lg.B / 2), lv = Lg.pf - 0.8 * 8;
      var treq = cc.calc("End plate thickness required (plate bending, double curvature) " + t, "treq", "sqrt(2*Te*1e3*lv*gm0/(be*fy))", "mm", "IS 800 cl 10.4.7 / 8.2.1", { Te: Te, lv: R(lv, 1), gm0: GM0, be: R(be, 1), fy: fy });
      var tp = tgiven || plate_t(Math.max(treq, d, o.tf + 2));
      var le = Math.min(Lg.e, 1.1 * tp * Math.sqrt(2 * 0.7 * fub / fy));
      var Qp = cc.calc("Prying force per bolt " + t, "Q", "max(lv/(2*le)*(Te - 2*1.5*fo*be*t**4/(27*le*lv**2)/1000), 0)", "kN", "IS 800 cl 10.4.7",
        "β = 2 (non-pretensioned), η = 1.5, fo = 0.7 fub", { lv: R(lv, 1), le: R(le, 1), Te: Te, fo: R(0.7 * fub, 1), be: R(be, 1), t: tp });
      var bv = S.bolt_values(cc, d, o.grade, Math.min(tp, o.col ? o.col.tf : tp), fu, 1, true, { tag: t });
      var ok = cc.check("Bolt tension incl. prying (Te + Q) " + t, Te + Qp, bv.Tdb, { unit: "kN / bolt", clause: "IS 800 cl 10.3.5 / 10.4.7" });
      var Vsb = cc.calc("Shear per bolt " + t, "Vsb", "V/nb", "kN", "", { V: R(o.V, 3), nb: nb });
      ok = cc.check("Bolt shear " + t, Vsb, bv.Vdb, { unit: "kN / bolt", clause: "IS 800 cl 10.3.3" }) && ok;
      var ir = cc.calc("Combined shear + tension " + t, "IR", "(Vsb/Vdb)**2 + ((Te + Q)/Tdb)**2", "", "IS 800 cl 10.3.6", { Vsb: Vsb, Vdb: R(bv.Vdb, 3), Te: Te, Q: Qp, Tdb: R(bv.Tdb, 3) });
      ok = cc.check("Bolt interaction ≤ 1 " + t, ir, 1.0, { clause: "IS 800 cl 10.3.6" }) && ok;
      ok = cc.check("Plate thickness ≥ required " + t, tp, treq, { unit: "mm", clause: "IS 800 cl 10.4.7", mode: ">=" }) && ok;
      cc.ok("Pitch ≥ 2.5d and edge ≥ 1.5d0 " + t, Lg.p >= 2.5 * d && Lg.e >= 1.5 * Lg.d0, { detail: "p = " + g(Lg.p) + ", e = " + g(Lg.e) + ", d0 = " + g(Lg.d0) + " mm", clause: "IS 800 cl 10.2.2 / 10.2.4" });
      return { ok: ok && tp <= 50, d: d, nr: nr, t: tp, L: Lg, nb: nb, Te: Te, Q: Qp, bv: bv, ir: ir };
    }
    var pick = null;
    if (o.given) pick = { d: o.given.d, nr: o.given.rows, t: o.given.t };
    else {
      var opts = [];
      [16, 20, 24, 30].forEach(function (d) { [1, 2, 3, 4].forEach(function (nr) { opts.push([d, nr, (nr + (o.extended ? 1 : 2)) * d * d]); }); });
      opts.sort(function (a, b) { return a[2] - b[2]; });
      var f = firstOk(opts, function (x) { return evalBolts(new Calc("s"), x[0], x[1]).ok; }) || [30, 4];
      pick = { d: f[0], nr: f[1], t: null };
    }
    if (!record) return evalBolts(new Calc("s"), pick.d, pick.nr, pick.t);
    c.let("Bolts " + o.tag, "", C.pystr(2 * (layout(pick.d, pick.nr).nrows)) + " – M" + g(pick.d) + " gr " + o.grade + " (IS 1367 / IS 3757 HSFG snug-tight)", "", "IS 800 cl 10.3",
      (o.extended ? "extended" : "flush") + " end plate, " + C.pystr(pick.nr + (o.extended ? 1 : 0)) + " tension row(s)");
    var r = evalBolts(c, pick.d, pick.nr, pick.t);
    // welds rafter / haunch to end plate (shop, γmw 1.25)
    var fwd = fu / (Math.sqrt(3) * GMW_S);
    var sf = c.calc("Flange-to-end-plate fillet (full strength, both sides) " + o.tag, "sf", "tf*fy/gm0/(2*0.7*fwd)", "mm", "IS 800 cl 10.5.7", { tf: o.tf, fy: fy, gm0: GM0, fwd: R(fwd, 1) });
    var sfa = Math.max(weld_round(sf), weld_min(Math.max(o.tf, r.t)));
    var sw = c.calc("Web-to-end-plate fillet (shear) " + o.tag, "sw", "V*1e3/(2*0.7*(D - 2*tf)*fwd)", "mm", "IS 800 cl 10.5.7", { V: R(o.V, 3), D: o.D, tf: o.tf, fwd: R(fwd, 1) });
    var swa = Math.max(weld_round(sw), weld_min(Math.max(o.tw, r.t)), 6);
    var butt = sfa > 12;
    c.let("Welds adopted " + o.tag, "", butt ? "flanges: full-penetration butt weld; web " + g(swa) + " mm fillet both sides" : "flanges " + g(sfa) + " mm, web " + g(swa) + " mm fillet both sides (IS 814 E41)", "", "IS 800 cl 10.5 / Table 21");
    r.sf = butt ? 0 : sfa; r.sw = swa; r.butt = butt;
    return r;
  };

  M.knee = function (c, inp, G, FR, fy, fu, mode) {
    var A = FR.A, mem = A.model.mem;
    var top = mem.colL[mem.colL.length - 1], kj = endM(A, top, true);
    var kr = endM(A, mem.colR[0], false);
    var K = kj.M >= kr.M ? kj : kr;
    var raf0 = mem.rafL[0], vr = endM(A, raf0, false);
    var D = FR.haunch ? FR.haunch.h : FR.kind_peb ? FR.rp.d : FR.raf.h;
    var raf = FR.raf;
    c.section("Knee (eave) joint – bolted extended end plate");
    c.let("Design actions at knee", "", "M = " + f1(K.M) + " kN·m (" + K.combo + "), V = " + f1(vr.V) + " kN, N = " + f1(Math.abs(vr.N)) + " kN", "", "analysis");
    c.let("Connection depth", "D", D, "mm", "", FR.haunch ? "haunched rafter" : "");
    var given = mode === "check" ? { d: num(inp.knee_bolt_d), rows: Math.trunc(num(inp.knee_rows)), t: num(inp.ep_t) } : null;
    var o = { tag: "(knee)", M: K.M, V: vr.V, N: Math.max(vr.N, 0), D: D, b: raf.b, tf: raf.tf, tw: raf.tw, extended: true, grade: inp.bolt_grade_main, col: FR.col, fy: fy, fu: fu, given: given };
    var r = M.end_plate(c, o, true);
    // column side: stiffeners & panel shear
    var col = FR.col, hc = (D - raf.tf) / 1000;
    var Fc = c.calc("Flange force (compression / tension) at knee", "Ff", "M/hc", "kN", "", { M: R(K.M, 3), hc: R(hc, 4) });
    var Fw = c.calc("Column web bearing / tension capacity without stiffener", "Fw", "(b1 + 2.5*tfc*2)*tw*fy/(gm0*1000)", "kN", "IS 800 cl 8.7.4", { b1: raf.tf + 2 * r.t, tfc: col.tf, tw: col.tw, fy: fy, gm0: GM0 });
    var ts = Math.max(plate_t(raf.tf), 10), bs = Math.floor(((col.b - col.tw) / 2 - 5) / 5) * 5;
    var Fst = c.calc("Capacity with full-depth stiffener pair", "Fs", "Fw + 2*bs*ts*fy/(gm0*1000)", "kN", "IS 800 cl 8.7.5", { Fw: Fw, bs: bs, ts: ts, fy: fy, gm0: GM0 });
    c.check("Column web at rafter flanges (with stiffeners " + g(bs) + "×" + g(ts) + ")", Fc, Fst, { unit: "kN", clause: "IS 800 cl 8.7.4 / 8.7.5" });
    var Vp = c.calc("Column web panel shear", "Vp", "M/hc", "kN", "", { M: R(K.M, 3), hc: R(hc, 4) });
    var Vdp = c.calc("Panel shear capacity", "Vdp", "hcol*tw*fy/(sqrt(3)*gm0*1000)", "kN", "IS 800 cl 8.4.1", { hcol: col.h, tw: col.tw, fy: fy, gm0: GM0 });
    var diag = null;
    if (Vp > Vdp) {
      var Ad = c.calc("Diagonal stiffener area required", "Ad", "(Vp - Vdp)*1000*sqrt(2)*gm0/fy", "mm²", "IS 800 cl 8.7 / practice", { Vp: Vp, Vdp: Vdp, gm0: GM0, fy: fy });
      var td = Math.max(plate_t(Ad / (2 * bs)), 10);
      diag = { b: bs, t: td, L: Math.round(Math.hypot(col.h - 2 * col.tf, D)) };
      c.let("Diagonal stiffener pair", "", "2 – " + g(bs) + " × " + g(td) + " mm, L ≈ " + g(diag.L), "");
    } else c.ok("Panel shear within capacity – no diagonal stiffener", true, { detail: f1(Vp) + " ≤ " + f1(Vdp) + " kN", clause: "IS 800 cl 8.4" });
    var swst = Math.max(weld_min(Math.max(ts, col.tw)), 6);
    c.let("Stiffeners: 4 plates (2 pairs) at rafter flange levels", "", g(bs) + " × " + g(ts) + " × " + g(col.h - 2 * col.tf) + " mm, " + g(swst) + " mm fillet", "", "IS 800 cl 8.7");
    r.M = K.M; r.D = D; r.st = { b: bs, t: ts, L: col.h - 2 * col.tf, s: swst }; r.diag = diag; r.Fc = Fc;
    return r;
  };

  M.apex = function (c, inp, G, FR, fy, fu, mode) {
    var A = FR.A, mem = A.model.mem;
    var m = G.kind === "mono" ? null : mem.rafL[mem.rafL.length - 1];
    var a = endM(A, m, true);
    var D = FR.kind_peb ? FR.rp.d2 : FR.raf.h, raf = FR.raf;
    c.section("Apex (ridge) splice – bolted flush end plates");
    c.let("Design actions at apex", "", "M = " + f1(a.M) + " kN·m (" + a.combo + "), V = " + f1(a.V) + " kN, N = " + f1(Math.abs(a.N)) + " kN", "");
    var given = mode === "check" ? { d: num(inp.apex_bolt_d) || num(inp.knee_bolt_d), rows: Math.trunc(num(inp.apex_rows)) || 2, t: num(inp.ep_t) } : null;
    var o = { tag: "(apex)", M: a.M, V: a.V, N: Math.max(a.N, 0), D: D, b: raf.b, tf: raf.tf, tw: raf.tw, extended: false, grade: inp.bolt_grade_main, col: null, fy: fy, fu: fu, given: given };
    var r = M.end_plate(c, o, true);
    r.M = a.M; r.D = D;
    c.info("Apex bolt rows", "rows placed symmetrically near both flanges (moment reverses under uplift)", "IS 800 cl 10.3");
    return r;
  };

  /* purlin / girt cleat (angle cleat shop-welded to rafter / column, member bolted through its web) */
  M.cleat = function (c, tag, mem, Rk, Rt, fu, ang) {
    var sec = mem.sec, d = sec.h <= 150 ? 12 : 16, grade = "4.6";
    function ev(cc, ca, Lc) {
      var cs = section(ca), ok = true;
      cc.let(tag + " reaction (factored, max of gravity / uplift)", "Rc", R(Rk, 2), "kN", "IS 800 Table 4", "continuous members: 1.1 wL at interior supports");
      var bv = S.bolt_values(cc, d, grade, Math.min(sec.tw, cs.t), fu, 1, true, { tag: "(" + tag.toLowerCase() + " cleat)" });
      var n = Math.max(2, Math.ceil(Rk / bv.Vdb - 1e-9));
      ok = cc.check("Cleat bolts in shear (" + C.pystr(n) + "-M" + g(d) + " gr " + grade + ")", Rk / n, bv.Vdb, { unit: "kN / bolt", clause: "IS 800 cl 10.3.3" }) && ok;
      var eb = 0.6 * cs.leg;
      var Mi = cc.calc("Cleat outstanding leg – in-plane moment (reaction at bolt line)", "Mi", "Rc*e/1000", "kN·m", "", "e = bolt line above the supporting flange", { Rc: R(Rk, 3), e: R(eb, 1) });
      var Mdi = cc.calc("In-plane capacity of leg (t × Lc)", "Mdi", "t*Lc**2/6*1.2*fy/gm0/1e6", "kN·m", "IS 800 cl 8.2.1.2", { t: cs.t, Lc: Lc, fy: 250, gm0: GM0 });
      var Mo = cc.calc("Out-of-plane moment (component along slope / vertical)", "Mo", "Rt*e/1000", "kN·m", "", { Rt: R(Rt, 3), e: R(eb, 1) });
      var Mdo = cc.calc("Out-of-plane capacity of leg", "Mdo", "Lc*t**2/4*fy/gm0/1e6", "kN·m", "IS 800 cl 8.2.1.2", { Lc: Lc, t: cs.t, fy: 250, gm0: GM0 });
      var irc = cc.calc("Cleat interaction", "IR", "Mi/Mdi + Mo/Mdo", "", "IS 800 cl 9.3.1.1", { Mi: Mi, Mdi: Mdi, Mo: Mo, Mdo: Mdo });
      ok = cc.check("Cleat " + ca + " × " + g(Lc) + " long", irc, 1.0, { clause: "IS 800 cl 8.2 / 9.3.1" }) && ok;
      var fwd = fu / (Math.sqrt(3) * GMW_S);
      var fw = cc.calc("Cleat weld stress (6 mm fillet, 2 sides)", "fw", "Rc*1e3/(0.7*6*2*Lc)", "N/mm²", "IS 800 cl 10.5.7", { Rc: R(Rk, 3), Lc: Lc });
      ok = cc.check("Cleat weld", fw, fwd, { unit: "N/mm²", clause: "IS 800 cl 10.5.7" }) && ok;
      return { ok: ok, d: d, n: n, grade: grade, ang: ca, Lc: Lc, grip: sec.tw + cs.t };
    }
    var L0 = Math.max(up(0.75 * sec.h, 10), 100), opts = [];
    (ang ? [ang] : (sec.h <= 150 ? ["ISA 65x65x6"] : []).concat(["ISA 75x75x6", "ISA 90x90x8", "ISA 100x100x10"])).forEach(function (a) { [0, 30, 60, 100].forEach(function (k) { opts.push([a, L0 + k]); }); });
    var pick = firstOk(opts, function (o) { return ev(new Calc("s"), o[0], o[1]).ok; }) || last(opts);
    c.section(tag + " cleat");
    return ev(c, pick[0], pick[1]);
  };

  /* =========================================================================== base plate & anchor bolts */
  /* combos: [{name, P (compression +), H, M}] (factored); returns plate, anchors, key */
  M.base_plate = function (c, tag, col, combos, fixed, fck, fy, fu, given, ped_dim) {
    c.section("Base plate & anchor bolts – " + tag);
    var Pmax = maxOf(combos.map(function (x) { return x.P; })), Umax = Math.max(0, maxOf(combos.map(function (x) { return -x.P; })));
    var Hmax = maxOf(combos.map(function (x) { return Math.abs(x.H); })), Mmax = maxOf(combos.map(function (x) { return Math.abs(x.M || 0); }));
    c.let("Design reactions (factored envelope)", "", "P = " + f1(Pmax) + " kN, uplift = " + f1(Umax) + " kN, H = " + f1(Hmax) + " kN" + (fixed ? ", M = " + f1(Mmax) + " kN·m" : ""), "", "IS 800 Table 4");
    var fbc = c.calc("Bearing strength of concrete (grout / pedestal)", "fbc", "0.45*fck", "N/mm²", "IS 800 cl 7.4.1", { fck: fck });
    var d, n, Lp, Bp, tp, T_b = 0, xb = 0;
    var grade = "4.6";
    function tryP(dd, nn, L0, B0, rec) {
      var cc = rec ? c : new Calc("s"), out = { ok: true, T: 0 };
      var eb = Math.max(up(1.5 * hole(dd), 5), 50);
      if (!fixed) {
        var w = cc.calc("Bearing pressure under plate", "w", "P*1000/(Lp*Bp)", "N/mm²", "", { P: R(Pmax, 3), Lp: L0, Bp: B0 });
        out.ok = cc.check("Bearing pressure ≤ 0.45 fck", w, fbc, { unit: "N/mm²", clause: "IS 800 cl 7.4.1" }) && out.ok;
        var a = (L0 - col.h) / 2, b = (B0 - col.b) / 2;
        var ts = cc.calc("Plate thickness for bearing", "ts", "sqrt(max(2.5*w*(a**2 - 0.3*b**2)*gm0/fy, 0))", "mm", "IS 800 cl 7.4.3.1", { w: R(w, 4), a: a, b: b, gm0: GM0, fy: fy });
        out.T = Umax / nn;
        var lb = Math.max((col.h / 2 - col.tf) / 2, 60);                       // bolt to web / flange root (pinned: bolts inside flanges)
        var tu = cc.calc("Plate thickness for anchor-bolt uplift", "tu", "sqrt(4*Tb*1e3*lb/2*gm0/(be*fy))", "mm", "IS 800 cl 8.2.1 (plate strip)", "be = 2.5d effective strip per bolt", { Tb: R(out.T, 3), lb: R(lb, 1), gm0: GM0, be: 2.5 * dd + 20, fy: fy });
        out.t = Math.max(ts, tu, col.tf);
      } else {
        var worst = 0, xw = 0, wt = 0, blockFail = false;
        combos.forEach(function (q) {
          var Mx = Math.abs(q.M || 0), P = q.P, Dp = (L0 - eb) / 1000, fbk = 0.45 * fck * 1000 * B0 / 1000;     // kN per m of length
          var Mt = Mx + P * (L0 / 2000 - eb / 1000);
          var disc = Dp * Dp - 2 * Mt / fbk, x = disc > 0 ? Dp - Math.sqrt(disc) : Dp, Cc = fbk * x, T = Math.max(Cc - P, 0);
          if (Mx > 0 && P > 0 && Mx / P <= L0 / 6000) T = 0;
          if (P <= 0) T = (Mx / ((L0 - 2 * eb) / 1000) - P / 2);
          if (disc <= 0) { blockFail = true; T = Math.max(T, Mx / ((L0 - 2 * eb) / 1000) - P / 2, 0); }   // concrete block cannot balance M: lever-arm estimate, plate FAILS
          if (T > worst) { worst = T; xw = x; }
          wt = Math.max(wt, x > 0 ? (Math.min(Cc, 1e9) / (x * B0)) : 0);
        });
        out.T = worst / nn; xb = xw;
        cc.let("Anchor tension on the tension side (" + C.pystr(nn) + " bolts) – rectangular bearing block 0.45 fck", "Tt", R(worst, 2), "kN", "IS 800 cl 7.4 / IS 456 cl 38");
        var a2 = (L0 - col.h) / 2, ae = Math.max(a2 / 2, (B0 - col.b) / 2);
        cc.let("Stiffened (gusseted) base – 2 gussets at each flange tip; effective cantilever", "ae", R(ae, 1), "mm", "IS 800 cl 7.4.3 / practice", "max(projection/2, overhang beyond flange tips)");
        var tsF = cc.calc("Plate thickness – bearing cantilever", "ts", "ae*sqrt(3*0.45*fck*gm0/fy)", "mm", "IS 800 cl 7.4.3.1", { ae: R(ae, 1), fck: fck, gm0: GM0, fy: fy });
        var tuF = cc.calc("Plate thickness – bolt tension (plate between gussets)", "tu", "sqrt(6*Tt*1e3*(a - eb)/2*gm0/(Bp*fy))", "mm", "IS 800 cl 8.2.1", { Tt: R(worst, 3), a: a2, eb: eb, gm0: GM0, Bp: B0, fy: fy });
        out.t = Math.max(tsF, tuF, col.tf);
        out.ok = !blockFail;
        if (blockFail) cc.ok("Concrete bearing block can balance the base moment (plate long enough)", false, { detail: "0.45 fck block over the plate cannot resist M – increase plate length / pedestal or use a pinned base", clause: "IS 800 cl 7.4 / IS 456 cl 38" });
      }
      var bv = S.bolt_values(cc, dd, grade, Math.max(plate_t(out.t), 12), fu, 1, true, { tag: "(anchor M" + g(dd) + ")" });
      out.ok = cc.check("Anchor bolt tension", out.T, bv.Tdb, { unit: "kN / bolt", clause: "IS 800 cl 10.3.5" }) && out.ok;
      out.bv = bv; out.eb = eb;
      return out;
    }
    if (given) { d = given.d; n = given.n; Lp = given.L; Bp = given.B; }
    else {
      var found = null;
      [20, 24, 30, 36].some(function (dd) {
        return (fixed ? [4, 6, 8] : [4]).some(function (nn) {
          var L0 = fixed ? up(col.h + 2 * Math.max(110, 3.5 * dd), 10) : up(col.h + 2 * 75, 10), B0 = up(Math.max(col.b + 2 * 60, fixed && nn > 4 ? 3 * 3 * dd + 2 * 60 : 0), 10);
          var Areq = Pmax * 1000 / fbc;
          if (L0 * B0 < Areq) { B0 = up(Math.max(B0, Areq / L0), 10); }
          for (var k = 0; k < 12; k++) {
            var r = tryP(dd, fixed ? nn / 2 : nn, L0, B0, false);
            if (r.ok && plate_t(r.t) <= 40) { found = { d: dd, n: nn, L: L0, B: B0 }; return true; }
            B0 += 50;
          }
          return false;
        });
      });
      if (!found) found = { d: 36, n: fixed ? 8 : 4, L: up(col.h + 300, 10), B: up(col.b + 200, 10) };
      d = found.d; n = found.n; Lp = found.L; Bp = found.B;
    }
    c.let("Base plate plan size", "Lp × Bp", g(Lp) + " × " + g(Bp), "mm", "", fixed ? "bolts outside flanges (moment base)" : "bolts inside flanges, close to web (pinned base)");
    var r = tryP(d, fixed ? n / 2 : n, Lp, Bp, true);
    tp = given && given.t ? given.t : Math.max(plate_t(r.t), 16);
    c.let("Base plate thickness adopted", "tp", tp, "mm", "IS 800 cl 7.4.3.1", "rounded to standard plate (min 16 mm)");
    c.check("Plate thickness ≥ required", tp, r.t, { unit: "mm", clause: "IS 800 cl 7.4.3.1", mode: ">=" });
    T_b = r.T;
    // shear: friction / key
    var mu = 0.45, key = null;
    var needKey = combos.some(function (q) { return Math.abs(q.H) > mu * Math.max(q.P, 0); });
    var Hcr = maxOf(combos.map(function (q) { return Math.abs(q.H) - mu * Math.max(q.P, 0); }));
    c.calc("Shear not resisted by friction (worst combination)", "ΔH", "max(Hres, 0)", "kN", "IS 800 cl 7.4 / practice", "μ = 0.45 steel–grout friction", { Hres: R(Hcr, 3) });
    if (needKey) {
      var bk = Math.min(Bp - 100, 200), Hk = Hmax;
      var dk = Math.max(up(c.calc("Shear key depth below grout (bearing 0.45 fck)", "dk", "H*1e3/(0.45*fck*bk)", "mm", "IS 456 cl 34.4 / practice", { H: R(Hk, 3), fck: fck, bk: bk }), 25), 100);
      var Mk = c.calc("Shear-key cantilever moment", "Mk", "H*(40 + dk/2)/1000", "kN·m", "", "40 mm grout", { H: R(Hk, 3), dk: dk });
      var tk = Math.max(plate_t(c.calc("Shear-key plate thickness", "tk", "sqrt(6*Mk*1e6*gm0/(bk*fy))", "mm", "IS 800 cl 8.2.1", { Mk: Mk, gm0: GM0, bk: bk, fy: fy })), 16);
      var sk = Math.max(weld_min(Math.max(tk, tp)), c.calc("Shear-key weld size (2 sides)", "sk", "sqrt((Mk*1e6/(2*0.7*bk*tk))**2 + 3*(H*1e3/(2*0.7*bk))**2)/(fu/(sqrt(3)*1.25))", "mm", "IS 800 cl 10.5.10", { Mk: Mk, bk: bk, tk: tk, H: R(Hk, 3), fu: fu }));
      key = { b: bk, d: dk + 40, t: tk, s: weld_round(sk) };
      c.let("Shear key (plate welded under base plate)", "", g(bk) + " × " + g(key.d) + " × " + g(tk) + " mm, " + g(key.s) + " mm fillet both sides; pocket in pedestal grouted", "", "IS 800 cl 7.4");
    } else {
      c.ok("Horizontal reaction resisted by friction (no shear key)", true, { detail: "H ≤ 0.45 P in all combinations", clause: "IS 800 cl 7.4" });
    }
    var Vb = needKey ? 0 : Hmax / n;
    var ir = c.calc("Anchor bolt combined shear + tension", "IR", "(Vb/Vdb)**2 + (Tb/Tdb)**2", "", "IS 800 cl 10.3.6", { Vb: R(Vb, 3), Vdb: R(r.bv.Vdsb, 3), Tb: R(T_b, 3), Tdb: R(r.bv.Tdb, 3) });
    c.check("Anchor bolt interaction", ir, 1.0, { clause: "IS 800 cl 10.3.6" });
    // embedment & washer plate
    var tbd = MT.TAU_BD_PLAIN[fck >= 30 ? 30 : fck >= 25 ? 25 : 20];
    var Lb = c.calc("Anchor embedment by bond (plain bolt)", "Lb", "max(Tdb, Tb)*1000/(pi*d*tbd)", "mm", "IS 456 cl 26.2.1", "designed for the bolt capacity so that the bolt yields before pull-out", { Tdb: R(r.bv.Tdb, 3), Tb: R(T_b, 3), d: d, tbd: tbd });
    var Le = up(Math.max(Lb, 18 * d, d >= 24 ? 500 : 450), 25);
    c.let("Embedment adopted (≥ bond length, ≥ 18d, ≥ 450 mm) with anchor plate & nut at the bottom", "Le", Le, "mm", "IS 5624 / practice");
    var bw = Math.max(up(4 * d, 5), 75);
    var tw_ = c.calc("Anchor (washer) plate thickness", "tw", "sqrt(3*(Tb*1e3/(bw**2 - pi*(d + 3)**2/4))*((bw - d)/2)**2*gm0/fy)", "mm", "IS 800 cl 7.4.3.1 (cantilever)", { Tb: R(Math.max(T_b, r.bv.Tdb * 0.5), 3), bw: bw, d: d, gm0: GM0, fy: fy });
    var twa = Math.max(plate_t(tw_), 10);
    var pb = c.calc("Bearing under anchor plate", "fb", "Tb*1e3/(bw**2 - pi*(d + 3)**2/4)", "N/mm²", "IS 456 cl 34.4", { Tb: R(Math.max(T_b, 0.01), 3), bw: bw, d: d });
    c.check("Bearing under anchor plate ≤ 0.45 fck × 2 (confined)", pb, 0.9 * fck, { unit: "N/mm²", clause: "IS 456 cl 34.4" });
    // concrete cone (group)
    var sx = fixed ? Lp - 2 * r.eb : col.h / 2, sy = fixed ? Bp - 2 * r.eb : Math.max(col.b / 2, 100);
    var AN = Math.min((sx + 2 * Le) * (sy + 2 * Le), ped_dim ? ped_dim[0] * ped_dim[1] * 1e6 : 1e12);
    var Tcone = c.calc("Concrete cone pull-out capacity of the bolt group", "Tc", "0.17*sqrt(fck)*AN/1000", "kN", "IS 456 cl 31.6.3 (analogy) / ACI 318 cl 17.6.2 – simplified", { fck: fck, AN: R(AN) });
    var Tgrp = fixed ? T_b * n / 2 : Umax;
    c.ok("Cone pull-out ≥ group tension (else tension lapped into pedestal bars)", Tcone >= Tgrp, { detail: f1(Tgrp) + " kN vs " + f1(Tcone) + " kN", clause: "IS 456 / ACI 318 cl 17", warn_only: true });
    var grout = 40;
    var La = c.calc("Anchor bolt length (embed + grout + plate + washer + 2 nuts + 3 threads + anchor plate + nut)", "La", "Le + gr + tp + tw1 + 3*nh + 3*p + ta", "mm", "IS 5624",
      { Le: Le, gr: grout, tp: tp, tw1: WASHER_T[d], nh: nut_h(d), p: PITCH[d], ta: twa });
    var Ltot = up(La, 25);
    c.let("Anchor bolts adopted", "", C.pystr(n) + " – M" + g(d) + " gr 4.6 (IS 5624 type, IS 2062), L = " + g(Ltot) + " mm, " + g(bw) + "×" + g(bw) + "×" + g(twa) + " anchor plate", "", "IS 5624");
    // column to base plate weld
    var fwd = fu / (Math.sqrt(3) * GMW_S), Lw = 2 * (2 * col.b - col.tw) + 2 * (col.h - 2 * col.tf);
    var fwr = c.calc("Column-to-base-plate weld stress (6 mm all round)", "fw", "sqrt((max(U, 0)*1e3/(0.7*s*Lw) + Mf)**2 + 3*(H*1e3/(0.7*s*Lw))**2)", "N/mm²", "IS 800 cl 10.5.10",
      { U: R(Umax, 3), s: 6, Lw: R(Lw), Mf: R(fixed ? Mmax * 1e6 / ((col.h - col.tf) * 0.7 * 6 * 2 * col.b) : 0, 2), H: R(Hmax, 3) });
    var bw_ok = fwr <= fwd;
    if (fixed) c.info("Column-to-base-plate welds (moment base)", "flanges: full-penetration butt welds (full strength); web: 6 mm fillet both sides; gussets fillet-welded", "IS 800 cl 10.5.6 / 10.5.7");
    else c.ok("Column-to-base weld (6 mm fillet all round)" + (bw_ok ? "" : " – use 8 mm fillet"), bw_ok || fwr * 6 / 8 <= fwd, { detail: f1(fwr) + " vs " + f1(fwd) + " N/mm²", clause: "IS 800 cl 10.5.7" });
    var gus = null;
    if (fixed) {
      var hgs = Math.max(up(1.5 * (Lp - col.h) / 2, 25), 200), tgs = Math.max(plate_t(col.tf), 12);
      var Fg = c.calc("Force per gusset (tension-side bolt group / 2 gussets)", "Fg", "Tb*n/2/2", "kN", "", { Tb: R(T_b, 3), n: n });
      var sg = Math.max(weld_min(Math.max(tgs, tp)), weld_round(Fg * 1e3 / (2 * 0.7 * hgs * fu / (Math.sqrt(3) * GMW_S))));
      gus = { h: hgs, L: (Lp - col.h) / 2, t: tgs, s: sg };
      c.let("Base gussets (4 per base)", "", g(gus.L) + " × " + g(hgs) + " × " + g(tgs) + " mm, " + g(sg) + " mm fillet to plate & flange", "", "IS 800 cl 7.4.3");
    }
    return { gus: gus, Lp: Lp, Bp: Bp, tp: tp, d: d, n: n, Le: Le, Ltot: Ltot, bw: bw, tw: twa, key: key, grout: grout, Tb: T_b, Umax: Umax, Hmax: Hmax, Pmax: Pmax, Mmax: Mmax, Lw: Lw, weld_s: bw_ok ? 6 : 8, fixed: fixed, eb: r.eb };
  };

  /* =========================================================================== bracing system */
  function rod_Td(d) { return Math.min(Math.PI * d * d / 4 * 250 / GM0, 0.9 * 0.78 * Math.PI * d * d / 4 * 410 / GM1) / 1000; }
  M.brace_member = function (c, tag, D, Ld, style, fy, fu, given) {
    var Du = 1.5 * D, t = "(" + tag + ")";
    c.calc("Factored diagonal force " + t, "Du", "1.5*D", "kN", "IS 800 Table 4 (1.5 WL)", { D: R(D, 3) });
    if (style === BRACING[0] && !(given && given.rod) && rod_Td(36) < Du) {
      c.info("Rod bracing insufficient " + t, "Du = " + f1(Du) + " kN > M36 rod capacity – tension-only angle bracing adopted", "IS 800 cl 6");
      style = BRACING[1];
    }
    if (style === BRACING[0]) {
      var d = given && given.rod ? given.rod : firstOk([16, 20, 24, 30, 36], function (x) { return rod_Td(x) >= Du; }) || 36;
      var Td = c.calc("Rod tension capacity M" + g(d) + " (threaded)" + " " + t, "Td", "min(A*fy/gm0, 0.9*0.78*A*fu/gm1)/1000", "kN", "IS 800 cl 6.2 / 6.3",
        { A: R(Math.PI * d * d / 4, 1), fy: 250, gm0: GM0, fu: 410, gm1: GM1 });
      c.check("Bracing rod tension " + t, Du, Td, { unit: "kN", clause: "IS 800 cl 6.1" });
      c.ok("Rod Ø ≥ 16 mm, pre-tensioned with turnbuckle " + t, d >= 16, { detail: "M" + g(d), clause: "Practice / IS 800 Table 3 note" });
      return { kind: "rod", name: "RD " + g(d), d: d, sec: sec_of("RD " + g(d)), Du: Du, nb: 0, bd: 0 };
    }
    var list = ANG.slice(), comp = style === BRACING[2];
    function brace_bolts(s) {
      var dB = s.leg >= 2 * up(1.5 * hole(20), 5) ? 20 : s.leg >= 2 * up(1.5 * hole(16), 5) ? 16 : 12;
      var bv = S.bolt_values(new Calc("s"), dB, "4.6", Math.min(s.t, 8), fu, 1, true);
      return { d: dB, nb: Math.max(2, Math.ceil(Du / bv.Vdb - 1e-9)) };
    }
    function ok(cc, n, rec) {
      var s = section(n), r = true;
      var lam = (comp ? 0.85 * Ld : Ld / 2) * 1000 / s.rvv;
      r = S.tension(cc, Du, s.A, fy, fu, hole(16) * s.t, { tag: t, slender: lam, limit: comp ? 250 : 350, n_bolts: brace_bolts(s).nb }).ok && r && lam <= (comp ? 250 : 350);
      if (comp) { var cr = S.compression(cc, Du, { A: s.A, rz: s.rvv, ry: s.rvv, family: "ISA", h: 1, b: 1, tf: 1 }, fy, Ld, Ld, 0.85, 0.85, { tag: t, limit: 250 }); r = cr.ok && cr.slender <= 250 && r; }
      return r;
    }
    var nm = given && given.ang ? given.ang : (firstOk(list, function (n) { return ok(new Calc("s"), n); }) || last(list));
    c.let("Bracing angle " + t, "", nm, "", "IS 800 cl 6 / 7", comp ? "K-bracing: tension + compression (λ ≤ 250, wind only)" : "tension-only X (λ ≤ 350 on half length, crossing bolted)");
    ok(c, nm);
    var sec = section(nm), dB = brace_bolts(sec).d;
    var bv = S.bolt_values(c, dB, "4.6", Math.min(sec.t, 8), fu, 1, true, { tag: t });
    var nb = Math.max(2, Math.ceil(Du / bv.Vdb - 1e-9));
    c.check("End bolts " + C.pystr(nb) + "-M" + g(dB) + " gr 4.6 " + t, Du / nb, bv.Vdb, { unit: "kN / bolt", clause: "IS 800 cl 10.3.3" });
    return { kind: "angle", name: nm, sec: sec, Du: Du, nb: nb, bd: dB };
  };
  M.gusset_t = function (c, tag, Du, nb, d, tmin, fy) {
    var p = up(2.5 * d, 5) + 5, e = up(1.5 * hole(d), 5);
    var wW = c.calc("Whitmore effective width of gusset (" + tag + ")", "ww", "2*(n - 1)*p*tan(radians(30)) + 60", "mm", "IS 800 cl 10.2 / practice", { n: nb, p: p });
    var tg_ = c.calc("Gusset thickness for tension (" + tag + ")", "tg", "Du*1e3*gm0/(ww*fy)", "mm", "IS 800 cl 6.2", { Du: R(Du, 3), gm0: GM0, ww: R(wW, 1), fy: fy });
    var t = Math.max(plate_t(tg_), tmin, 8);
    var Lb = 2 * e + (nb - 1) * p;
    return { t: t, L: up(Lb + 150, 10), B: up(Math.max(wW + 60, 150), 10), p: p, e: e };
  };

  M.bracing = function (c, inp, G, W, CR, fy, fu, mode) {
    var style = inp.bracing;
    c.section("Roof bracing – wind on gable (" + style + ")");
    var Ag = G.kind === "mono" ? c.calc("Gable wall area", "Ag", "L*(h + h2)/2", "m²", "", { L: G.span, h: G.eave, h2: G.h2 })
      : c.calc("Gable wall area", "Ag", "L*(h + r/2)", "m²", "", { L: G.span, h: G.eave, r: G.rise });
    var cpg = G.clad ? W.gable_net : 0.3;
    if (!G.clad) c.info("Unclad gable", "gable wind taken on frame members / purlin ends with Cp = 0.3 (assumption)", "IS 875-3 cl 7.4");
    var Fend = c.calc("Gable wind to roof bracing (half the gable + share of roof drag)", "Fg", "0.5*pd*cp*Ag + Fd*b/(b + 2*h)/2", "kN", "IS 875-3 Table 5 / cl 7.3.3.12",
      "gable column tops deliver half the gable load to the roof bracing at each end", { pd: R(W.pd, 4), cp: R(cpg, 3), Ag: R(Ag, 3), Fd: R(W.drag, 3), b: G.span, h: G.eave });
    var nbr = G.n_bays >= 8 ? 3 : 2;
    if (G.n_bays < 2) nbr = 1;
    c.let("Braced bays", "nb", nbr, "", "Practice", "both end bays" + (nbr > 2 ? " + one central bay (crane / erection stability)" : ""));
    var np = Math.max(1, Math.round(G.raf_len / G.bay)), a = G.raf_len / np;
    var V = c.calc("Shear at end panel of roof bracing girder", "Vr", "Fg/2", "kN", "statics", "girder spans eave to eave, depth = bay", { Fg: Fend });
    var K = style === BRACING[2];
    var Ld = K ? Math.hypot(G.bay, a / 2) : Math.hypot(G.bay, a);
    var D = c.calc("Diagonal force (end panel)", "D", K ? "Vr/2*Ld/s" : "Vr*Ld/s", "kN", "method of sections", { Vr: V, Ld: R(Ld, 3), s: G.bay });
    var given = mode === "check" ? { rod: num(inp.brace_rod), ang: inp.brace_sec } : null;
    var RB = M.brace_member(c, "roof bracing", D, Ld, style, fy, fu, given);
    RB.np = np; RB.L = Ld; RB.a = a; RB.nbr = nbr; RB.D = D;
    if (RB.kind === "angle") RB.gus = M.gusset_t(c, "roof bracing", RB.Du, RB.nb, RB.bd, RB.sec.t + 2, fy);
    // eave strut
    c.section("Eave strut (longitudinal compression from bracing)");
    var Pe = c.calc("Factored eave-strut force", "Pe", "1.5*Fg/2" + (CR ? " + 1.5*HL" : ""), "kN", "IS 800 Table 4", CR ? { Fg: Fend, HL: CR.Hlong } : { Fg: Fend });
    var ES_list = SC.by_weight(SC.ISMC).filter(function (n) { return section(n).h >= 100; });
    var esn = mode === "check" && inp.es_sec ? inp.es_sec : firstOk(ES_list, function (n) { var r = S.compression(new Calc("s"), Pe, section(n), fy, G.bay, G.bay / 2, 1.0, 1.0, { tag: "(eave strut)", limit: 250 }); return r.ok && r.slender <= 250; }) || last(ES_list);
    c.let("Eave strut section", "", esn, "", "IS 808", "compression from wind only → λ ≤ 250; minor axis restrained at mid-bay by roof sheeting / sag-rod line");
    S.compression(c, Pe, section(esn), fy, G.bay, G.bay / 2, 1.0, 1.0, { tag: "(eave strut)", limit: 250 });
    // wall bracing
    c.section("Wall (side) bracing in braced bays");
    var ntier = G.eave / G.bay > 1.3 ? 2 : 1;
    var Hw = c.calc("Longitudinal force at eave per side", "Hw", "Fg/2" + (CR ? " + HL" : ""), "kN", "", CR ? { Fg: Fend, HL: CR.Hlong } : { Fg: Fend });
    var Lw = K ? Math.hypot(G.bay / 2, G.eave / ntier) : Math.hypot(G.bay, G.eave / ntier);
    var Dw = c.calc("Wall bracing diagonal force (bottom tier)", "Dw", K ? "Hw/2*Lw/(s/2)/2" : "Hw*Lw/s", "kN", "method of sections", ntier > 1 ? "two tiers with intermediate strut" : "", { Hw: Hw, Lw: R(Lw, 3), s: G.bay });
    var WB = M.brace_member(c, "wall bracing", Dw, Lw, style, fy, fu, given);
    WB.ntier = ntier; WB.L = Lw; WB.D = Dw;
    if (WB.kind === "angle") WB.gus = M.gusset_t(c, "wall bracing", WB.Du, WB.nb, WB.bd, WB.sec.t + 2, fy);
    if (G.clad && G.open) c.info("Open side", "wall bracing in open bays may be replaced by portal (knee) bracing for access – design separately", "IS 800 cl 4.4");
    var fwd = fu / (Math.sqrt(3) * GMW_S);
    c.calc("Gusset-to-frame weld length required (6 mm, field 1.5)", "Lw", "Du*1e3/(0.7*6*fu/(sqrt(3)*1.5)) + 12", "mm", "IS 800 cl 10.5.7", { Du: R(Math.max(RB.Du, WB.Du), 3), fu: fu });
    return { RB: RB, WB: WB, Fend: Fend, Ag: Ag, es: esn, Pe: Pe, nbr: nbr, fwd: fwd };
  };

  /* =========================================================================== gable end */
  M.gable = function (c, inp, G, L, W, PUR, fy, fu, mode) {
    /* wind posts on a main-frame gable only where the gable sheeting spans more than the max. post spacing
       (a small shed, e.g. 3 m span, needs none – the girts span corner column to corner column); none if both gables are open */
    var need = G.gable_cols || (G.clad && G.span > num(inp.gable_col_sp) + 1e-9 && !(inp.open_F && inp.open_B));
    if (!need) { if (G.clad && !G.gable_cols) c.info("Gable wind posts", "not needed – gable girts span " + f2(G.span) + " m between the corner columns (≤ max. post spacing " + f2(num(inp.gable_col_sp)) + " m)", "Practice"); return null; }
    c.section("Gable end – " + (G.gable_cols ? "gable columns + end rafter" : "wind posts at gable (roof on main frame)"));
    var smax = num(inp.gable_col_sp), nint = Math.max(1, Math.ceil(G.span / smax - 1e-9) - 1), sg = G.span / (nint + 1);
    c.let("Gable columns per end × spacing", "", C.pystr(nint) + " × " + f2(sg) + " m", "", "Practice ≤ 6 m");
    var xs = [], hs = [];
    for (var k = 1; k <= nint; k++) { var x = k * sg; xs.push(x); hs.push(G.kind === "mono" ? G.eave + (G.h2 - G.eave) * x / G.span : G.kind === "truss" ? G.eave : G.eave + G.rise * (1 - Math.abs(x - G.span / 2) / (G.span / 2))); }
    var H = maxOf(hs);
    var w = c.calc("Factored wind on tallest gable column", "wg", "1.5*cp*pd*s", "kN/m", "IS 875-3 Table 5", { cp: R(W.gable_net, 3), pd: R(W.pd_c, 4), s: R(sg, 3) });
    var Mg = c.calc("Bending moment (pinned top & bottom)", "Mg", "wg*H**2/8", "kN·m", "", { wg: w, H: R(H, 3) });
    var Pg = c.calc("Axial load from end rafter / gable girts", "Pg", G.gable_cols ? "1.5*(gd + q)*s*b/2 + 1.5*gw*s*H" : "1.5*gw*s*H", "kN", "IS 875-1/2",
      G.gable_cols ? { gd: R(L.gs + L.gc + PUR.wavg * 9.81e-3 / G.ps + 0.15, 3), q: L.q, s: R(sg, 3), b: G.bay, gw: L.gw, H: R(H, 3) } : { gw: L.gw, s: R(sg, 3), H: R(H, 3) });
    var env = { M: Mg, Pc: Pg, Pt: 0, V: w * H / 2 };
    var P = { Lz: H, Kz: 1.0, Ly: Math.min(2 * G.gsp, H), tag: "(gable column)" };
    var nm = mode === "check" && inp.gc_sec ? inp.gc_sec : (firstOk(SC.by_weight(SC.ISMB).filter(function (n) { return section(n).h >= 150; }).concat(SC.by_weight(SC.ISHB)), function (n) { return M.check_col(new Calc("s"), section(n), env, fy, fu, P); }) || "ISHB 450");
    c.let("Gable column section", "", nm, "", "IS 808", "weak-axis restraint by gable girts + fly braces @ " + f2(P.Ly) + " m");
    M.check_col(c, section(nm), env, fy, fu, P);
    var d = c.calc("Gable column deflection (service wind)", "δ", "5*w*(H*1000)**4/(384*E*I)", "mm", "IS 800 Table 6", { w: R(w / 1.5, 4), H: R(H, 3), E: E_ST, I: R(section(nm).Iz) });
    c.check("Deflection ≤ H/150 (elastic cladding)", d, H * 1000 / 150, { unit: "mm", clause: "IS 800 Table 6" });
    var out = { n: nint, s: sg, xs: xs, hs: hs, H: H, sec: section(nm), name: nm, P: Pg, Vb: w * H / 2, w: w };
    if (G.gable_cols) {
      c.section("End rafter (simply supported on gable columns)");
      var we = c.calc("Factored load on end rafter", "we", "1.5*(gd + q)*b/2", "kN/m", "IS 875", { gd: R(L.gs + L.gc + PUR.wavg * 9.81e-3 / G.ps, 3), q: L.q, b: G.bay });
      var Me = c.calc("End rafter moment", "Me", "we*s**2/8", "kN·m", "", { we: we, s: R(sg / Math.cos(rad(G.slope)), 3) });
      var list = SC.by_weight(SC.ISMB).concat(SC.by_weight(SC.ISMC));
      var ern = mode === "check" && inp.er_sec ? inp.er_sec : (firstOk(list, function (n) {
        var cc = new Calc("s"), s = section(n);
        return S.bending(cc, Me, s, fy, G.ps, false).ok && S.shear_strength(cc, we * sg / 2, s, fy).ok && 5 * we / 1.5 * Math.pow(sg * 1000, 4) / (384 * E_ST * s.Iz) <= sg * 1000 / 180;
      }) || "ISMB 300");
      c.let("End rafter section", "", ern, "", "IS 808");
      S.bending(c, Me, section(ern), fy, G.ps, false, { tag: "(end rafter)" });
      S.shear_strength(c, we * sg / 2, section(ern), fy, { tag: "(end rafter)" });
      out.er = section(ern); out.er_name = ern;
      out.U = Math.max(0, (W.up_coef * W.pd - 0.9 * (L.gs + L.gc)) * 1.5 * sg * G.bay / 2);
    }
    // gable girts
    out.girt = M.girts(c, inp, G, L, W, mode, sg, "gable walls", "GG1");
    c.section("Gable column top connection (slotted, vertical movement allowed)");
    var bvg = S.bolt_values(c, 16, "4.6", 10, fu, 1, true, { tag: "(gable column top)" });
    var ntop = Math.max(2, Math.ceil(w * H / 2 / bvg.Vdb - 1e-9));
    c.check("Top connection bolts " + C.pystr(ntop) + "-M16 (wind reaction)", w * H / 2 / ntop, bvg.Vdb, { unit: "kN / bolt", clause: "IS 800 cl 10.3.3" });
    out.ntop = ntop;
    return out;
  };

  /* bolts at a truss-member end (same rule as truss_joints): {d, nb, tgus} – nb also sets the shear-lag factor (IS 800 cl 6.3.3) */
  M.joint_bolts = function (sec, dbl, F, fu) {
    var leg = sec.leg, t = sec.t;
    var fits = function (x) { return leg >= 2 * up(1.5 * hole(x), 5); };
    var dd = F > 120 && fits(20) ? 20 : fits(16) ? 16 : 12;
    var tgus = Math.max(plate_t(t + 2), 8);
    var bv = S.bolt_values(new Calc("s"), dd, "4.6", dbl ? Math.min(tgus, 2 * t) : Math.min(tgus, t), fu, dbl ? 2 : 1, true);
    return { d: dd, tgus: tgus, nb: Math.max(2, Math.ceil(F / bv.Vdb - 1e-9)) };
  };

  /* =========================================================================== truss joints (bolts & gussets) */
  M.truss_joints = function (c, G, TR, fy, fu) {
    c.section("Truss joints – bolts, gussets, block shear (IS 800 cl 10.2 / 6.4)");
    var out = {}, tg = 0;
    Object.keys(TR.des).forEach(function (gn) {
      var d = TR.des[gn], F = Math.max(d.fr.T, d.fr.C), leg = d.sec.leg, t = d.sec.t;
      tg = Math.max(tg, t + 2);
      var jb = M.joint_bolts(d.sec, d.dbl, F, fu), dd = jb.d, tgus = jb.tgus;
      var bv = S.bolt_values(c, dd, "4.6", d.dbl ? Math.min(tgus, 2 * t) : Math.min(tgus, t), fu, d.dbl ? 2 : 1, true, { tag: "(" + gn.toLowerCase() + ")" });
      var nb = Math.max(2, Math.ceil(F / bv.Vdb - 1e-9));
      c.check("Bolts per member end (" + gn.toLowerCase() + ", " + C.pystr(nb) + "-M" + g(dd) + ")", F / nb, bv.Vdb, { unit: "kN / bolt", clause: "IS 800 cl 10.3" });
      var d0 = hole(dd), p = up(2.5 * dd, 5), e = up(1.5 * d0, 5);
      c.ok("Pitch " + g(p) + " ≥ 2.5d, end / edge " + g(e) + " ≥ 1.5d0 (" + gn.toLowerCase() + ")", p >= 2.5 * dd && e >= 1.5 * d0, { detail: "d = " + g(dd) + ", d0 = " + g(d0), clause: "IS 800 cl 10.2.2 / 10.2.4 (Table 15, rolled / machine-cut edge)" });
      c.ok("Bolt gauge fits angle leg (" + gn.toLowerCase() + ")", leg >= 2 * e, { detail: "leg " + g(leg) + " ≥ 2e = " + g(2 * e) + " mm", clause: "SP 6(1) gauge" });
      if (d.fr.T > 1) {
        var gg = Math.min(leg / 2, leg - e), nA = d.dbl ? 2 : 1;
        var Avg = nA * t * (e + (nb - 1) * p), Avn = Avg - nA * (nb - 0.5) * d0 * t, Atg = nA * t * (leg - gg), Atn = Atg - nA * 0.5 * d0 * t;
        var Tdb = c.calc("Block shear capacity (" + gn.toLowerCase() + ")", "Tdb", "min(Avg*fy/(sqrt(3)*gm0) + 0.9*Atn*fu/gm1, 0.9*Avn*fu/(sqrt(3)*gm1) + Atg*fy/gm0)/1000", "kN", "IS 800 cl 6.4.1",
          { Avg: R(Avg), Atn: R(Atn), Avn: R(Avn), Atg: R(Atg), fy: fy, fu: fu, gm0: GM0, gm1: GM1 });
        c.check("Block shear at member end (" + gn.toLowerCase() + ")", d.fr.T, Tdb, { unit: "kN", clause: "IS 800 cl 6.4" });
      }
      out[gn] = { d: dd, nb: nb, p: p, e: e, grip: (d.dbl ? 2 * t + tgus : t + tgus) };
    });
    var tGus = Math.max(plate_t(tg), 8);
    c.let("Gusset plate thickness (all truss joints)", "tg", tGus, "mm", "Practice ≥ member t + 2, ≥ 8 mm");
    out.tg = tGus;
    var Lb = maxOf(Object.keys(out).filter(function (k) { return out[k].nb; }).map(function (k) { return 2 * out[k].e + (out[k].nb - 1) * out[k].p; }));
    out.gus = { L: up(2 * Lb + 120, 10), B: up(Lb + 160, 10) };
    out.heel = { L: up(2 * Lb + 300, 10), B: up(Lb + 300, 10) };
    return out;
  };

  /* =========================================================================== seismic (note-level check) */
  M.seismic = function (c, inp, G, L, FR, W) {
    c.section("Seismic check (IS 1893-1:2016) – indicative");
    var Z = LD.ZONE_Z[inp.zone] || 0.1;
    var Wr = c.calc("Seismic weight per frame (roof DL + 50 % walls; roof LL not included)", "Ws", "(gs + gc + pw)*s*L + wf + 0.5*gw*s*2*h", "kN", "IS 1893-1 cl 7.3.1",
      { gs: L.gs, gc: L.gc, pw: R(FR.pw, 4), s: G.bay, L: G.span, wf: R((FR.raf ? FR.raf.w * 2 * G.raf_len : 0.15 * G.span * G.bay * 100) * 9.81e-3, 3), gw: L.gw, h: G.eave });
    var Ah = c.calc("Design horizontal coefficient", "Ah", "Z/2*I/R*Sa", "", "IS 1893-1 cl 6.4.2", "I = 1.0, R = 3 (steel OMRF), Sa/g = 2.5 (plateau, conservative)", { Z: Z, I: 1.0, R: 3.0, Sa: 2.5 });
    var VB = c.calc("Seismic base shear per frame", "VB", "Ah*Ws", "kN", "IS 1893-1 cl 7.6.1", { Ah: Ah, Ws: Wr });
    var cmax = maxOf(Object.keys(W.cases).map(function (k) { var q = W.cases[k]; return Math.abs(q.lcol - q.rcol); }));
    var HW = c.calc("Wind horizontal force per frame (walls)", "HW", "cp*pd*s*h", "kN", "IS 875-3", { cp: R(cmax, 3), pd: R(W.pd, 4), s: G.bay, h: G.eave });
    if (VB <= HW) c.ok("Wind governs lateral design (seismic base shear < wind)", true, { detail: "VB = " + f1(VB) + " kN ≤ " + f1(HW) + " kN", clause: "IS 1893-1 / IS 800 cl 3.5" });
    else { c.warn("Seismic may govern", "VB = " + f1(VB) + " kN > wind " + f1(HW) + " kN – run EL combinations (1.5DL+1.5EL, 1.2(DL+LL+EL))", "IS 1893-1"); c.miss("Seismic load combinations not analysed (seismic base shear exceeds wind)", "IS 1893-1 / IS 800 Table 4", "Critical"); }
  };

  /* =========================================================================== foundation: pedestal + isolated footing */
  /* RX: {Ps (service DL+LL), PDL (service DL), Pu, Uu (factored uplift), Hu, Mu, winds: [{name, V (up +), H, M}], HDL, MDL} */
  M.foundation = function (c, inp, G, tag, mark, ctx, RX, bp, nf, mode) {
    var RC = DS.rcc, mine = ctx.site === "mine";
    c.section("Foundation " + mark + " – " + tag);
    var sbc = num(inp.sbc), fck = num(inp.fck), fy = 500, gs = num(inp.soil_gamma), mu = num(inp.mu_soil);
    c.let("Safe bearing capacity", "qa", sbc, "kN/m²", "Geotechnical report", mine ? "mine area: the site profile has already reduced the SBC input (blast vibration, disturbed / made-up ground) – not reduced again" : "");
    if (mine && fck < 30) { fck = 30; c.info("Concrete grade raised to M30", "severe exposure (sulphates / acidic mine water, coal dust)", "IS 456 Table 3 & 5"); }
    var cover = 50, covP = mine ? 50 : 40;
    c.let("Clear cover footing / pedestal", "", g(cover) + " / " + g(covP) + " mm", "", "IS 456 cl 26.4.2", mine ? "severe exposure (mine)" : "moderate exposure");
    var df = num(inp.df), plinth = num(inp.plinth_h);
    var pmin_ = Math.max(0.4, up((df - 0.3 + plinth) / 3, 0.05));
    var Lped = Math.max(up(bp.Lp / 1000 + 0.2, 0.05), pmin_), Bped = Math.max(up(bp.Bp / 1000 + 0.2, 0.05), pmin_);
    c.let("Pedestal size (base plate + 100 mm each side)", "Lp × Bp", f2(Lped) + " × " + f2(Bped), "m", "Practice");
    var gc = 25.0;
    function hp(D) { return df - D / 1000 + plinth; }
    function Wres(Lf, D) { return Lf * Lf * D / 1000 * gc + Lped * Bped * hp(D) * gc + (Lf * Lf - Lped * Bped) * Math.max(df - D / 1000, 0) * gs; }
    function stab(Lf, D, cc) {
      var W0 = Wres(Lf, D), h = hp(D) + D / 1000, ok = true;
      RX.winds.forEach(function (w) {
        // w: wind-only reactions (V up +, H, M) and the DL reactions at the same support (signed)
        var Uw = Math.max(w.V, 0), Hd = w.HDL || 0, Hw = w.H || 0, Md = w.MDL || 0, Mw = w.M || 0;
        var Htot = Math.abs(Hd + Hw), sameDir = Hd * Hw >= 0;
        var MOd = sameDir ? Math.abs(Hd) * h + Math.abs(Md) : 0;
        var MO = (sameDir ? Math.abs(Hw) : Math.max(Htot, 0)) * h + Math.abs(Mw) + Uw * Lf / 2;
        var MR = (W0 + Math.max(w.PDL != null ? w.PDL : RX.PDL, 0)) * Lf / 2;
        var Hs = Htot;
        var Nn = 0.9 * (W0 + (w.PDL != null ? w.PDL : RX.PDL)) - Uw;
        if (cc) {
          cc.calc("Overturning check (" + w.name + "): 0.9 MR − (1.2 MO,DL + 1.4 MO,W)", "ΔM", "0.9*MR - (1.2*MOd + 1.4*MO)", "kN·m", "IS 456 cl 20.1", { MR: R(MR, 3), MOd: R(MOd, 3), MO: R(MO, 3) });
          cc.check("Overturning (" + w.name + ")", 1.2 * MOd + 1.4 * MO, 0.9 * MR, { unit: "kN·m", clause: "IS 456 cl 20.1" });
          cc.check("Sliding FoS ≥ 1.4 (" + w.name + ")", (mu * Math.max(Nn, 0)) / Math.max(Hs, 1e-6), 1.4, { clause: "IS 456 cl 20.2", mode: ">=", note: "μ = " + g(mu) + ", 0.9 × restoring weight; passive earth ignored" });
        }
        if (1.2 * MOd + 1.4 * MO > 0.9 * MR || mu * Math.max(Nn, 0) < 1.4 * Hs) ok = false;
      });
      if (RX.Uw > 0) {
        if (cc) cc.check("Uplift FoS = (footing + pedestal + soil) / service uplift ≥ 1.5", W0 / RX.Uw, 1.5, { clause: "IS 456 cl 20.1 / practice", mode: ">=", note: "service uplift (DL + WL) = " + f1(RX.Uw) + " kN; only DL of foundation + soil over footing counted" });
        if (W0 / RX.Uw < 1.5) ok = false;
      }
      return ok;
    }
    /* soil pressure for concurrent service cases: gravity – full contact ≤ SBC; wind – ≤ 1.25 SBC with ≥ 75 % contact (e ≤ L/4) */
    function press(Lf, D, cs, cc) {
      var W0 = Lf * Lf * D / 1000 * gc + Lped * Bped * hp(D) * gc + (Lf * Lf - Lped * Bped) * Math.max(df - D / 1000, 0) * gs;
      var N = cs.P + W0, Mx = Math.abs(cs.H) * (hp(D) + D / 1000) + Math.abs(cs.M || 0), e = N > 0 ? Mx / N : 1e9;
      var q0 = df * gs;
      var pm = (e <= Lf / 6 ? N / (Lf * Lf) * (1 + 6 * e / Lf) : e < Lf / 2 ? 2 * N / (3 * Lf * (Lf / 2 - e)) : 1e9) - q0;
      var lim = cs.wind ? 1.25 * sbc : sbc, ok = N > 0 && (cs.wind ? e <= Lf / 4 : e <= Lf / 6 + 1e-9) && pm <= lim;
      if (cc) {
        cc.calc("Net soil pressure, " + cs.name, "pmax", e <= Lf / 6 ? "N/L**2*(1 + 6*e/L) - q0" : "2*N/(3*L*(L/2 - e)) - q0", "kN/m²", "IS 1904 / IS 456 cl 34.1", "N = P + footing + pedestal + soil above (gross); q0 = overburden removed; e = M/N",
          { N: R(N, 3), L: Lf, e: R(Math.min(e, Lf / 2 - 0.01), 4), q0: R(q0, 3) });
        cc.check("Soil pressure ≤ " + (cs.wind ? "1.25 × " : "") + "SBC (" + cs.name + ")", pm, lim, { unit: "kN/m²", clause: cs.wind ? "IS 1904 cl 5 (25 % increase for wind)" : "IS 1904" });
        cc.check("Eccentricity e ≤ L/" + (cs.wind ? "4 (≥ 75 % contact)" : "6 (full contact)") + " (" + cs.name + ")", e, Lf / (cs.wind ? 4 : 6), { unit: "m", clause: "IS 456 cl 34.1 / practice" });
      }
      return ok;
    }
    var Wtop = function (Lq, D) { return Lped * Bped * hp(D) * gc + (Lq * Lq - Lped * Bped) * Math.max(df - D / 1000, 0) * gs; };
    var gcs = RX.svc.filter(function (cs) { return !cs.wind; }).reduce(function (b, cs) { return b == null || cs.P > b.P ? cs : b; }, null) || RX.svc[0];
    var given_D = mode === "check" && num(inp.ftg_D) > 0 ? num(inp.ftg_D) : null;
    var given_bars = mode === "check" && num(inp.ftg_dia) > 0 ? [num(inp.ftg_dia), num(inp.ftg_s)] : null;
    var fixedL = mode === "check" && num(inp.ftg_L) > 0;
    var Dd = given_D || 450, k, it, Lf = fixedL ? num(inp.ftg_L) : Math.max(up(Math.sqrt(1.1 * RX.Ps / sbc), 0.1), up(Math.max(Lped, Bped) + 0.6, 0.1), 1.2);
    var isoOK = function (Lq, D) {
      return RX.svc.filter(function (cs) { return !cs.wind; }).every(function (cs) {
        var Pe = 1.1 * (cs.P + Wtop(Lq, D)), Me = Math.abs(cs.H) * (hp(D) + D / 1000) + Math.abs(cs.M || 0);
        return Pe / (Lq * Lq) - 6 * Me / (Lq * Lq * Lq) >= 0 && Pe / (Lq * Lq) + 6 * Me / (Lq * Lq * Lq) <= sbc;
      });
    };
    var Mof = function (D) { return [Math.abs(gcs.H) * (hp(D) + D / 1000) + Math.abs(gcs.M || 0), Math.abs(RX.Hu) * (hp(D) + D / 1000) + Math.abs(RX.Mu || 0)]; };
    var gb = given_bars, practice = false;
    for (it = 0; it < 8; it++) {
      if (!fixedL) for (k = 0; k < 80 && !(RX.svc.every(function (cs) { return press(Lf, Dd, cs, null); }) && stab(Lf, Dd, null) && isoOK(Lf, Dd)); k++) Lf = R(Lf + 0.1, 2);
      var mm = Mof(Dd);
      var F0 = RC.isolated_footing(new Calc("s"), gcs.P + Wtop(Lf, Dd), mm[0], RX.Pu, mm[1], Bped * 1000, Lped * 1000, sbc, fck, fy, { cover: cover, fixed_size: [Lf, Lf], given_D: given_D, given_bars: given_bars });
      var Dn = given_D || F0.D, gbn = given_bars;
      if (!given_bars && ctx.detail !== "code") {
        var bl = F0.bars_L, bb = F0.bars_B;
        if (bl.dia < 12 || bb.dia < 12 || bl.spacing > 200 || bb.spacing > 200) {
          for (var j = 0; j < 30; j++) {
            var Fa = RC.isolated_footing(new Calc("s"), gcs.P + Wtop(Lf, Dn), Mof(Dn)[0], RX.Pu, Mof(Dn)[1], Bped * 1000, Lped * 1000, sbc, fck, fy, { cover: cover, fixed_size: [Lf, Lf], given_D: Dn });
            var b1 = Fa.bars_L, b2 = Fa.bars_B, dd = Math.max(12, b1.dia, b2.dia);
            var s1 = Math.min(C.floor_to(1000 * MT.bar_area(dd) / Math.max(b1.Ast_prov, 1) * (b1.Ast_prov / (1000 * MT.bar_area(b1.dia) / b1.spacing)), 10), C.floor_to(1000 * MT.bar_area(dd) / (1000 * MT.bar_area(b2.dia) / b2.spacing), 10), 200);
            gbn = [dd, Math.max(s1, 75)];
            var sc = new Calc("s");
            RC.isolated_footing(sc, gcs.P + Wtop(Lf, Dn), Mof(Dn)[0], RX.Pu, Mof(Dn)[1], Bped * 1000, Lped * 1000, sbc, fck, fy, { cover: cover, fixed_size: [Lf, Lf], given_D: Dn, given_bars: gbn });
            if (!sc.failures.length || given_D) break;
            Dn += 50;
          }
        }
      }
      practice = gbn && !given_bars;
      if (Dn === Dd && JSON.stringify(gbn) === JSON.stringify(gb)) break;
      Dd = Dn; gb = gbn;
    }
    if (!fixedL) c.info("Footing plan size", "L = B = " + f2(Lf) + " m from concurrent service cases (bearing, eccentricity), uplift / overturning / sliding and no-tension under gravity", "IS 456 cl 20 / 34");
    if (practice) c.info("Practice detailing (footing bars)", "minimum 12 mm bars at ≤ 200 mm c/c both ways (SP 34 / CPWD practice) – " + g(gb[0]) + "Ø @ " + g(gb[1]) + "; depth set so that anchorage & shear pass", "SP 34 / practice");
    var Ms = Mof(Dd)[0], Mu = Mof(Dd)[1];
    c.let("Load on footing for IS 456 design (gravity case " + gcs.name + " + pedestal + soil on footing)", "P", R(gcs.P + Wtop(Lf, Dd), 2), "kN");
    var nst0 = c.steps.length;
    var ftg = RC.isolated_footing(c, gcs.P + Wtop(Lf, Dd), Ms, RX.Pu, Mu, Bped * 1000, Lped * 1000, sbc, fck, fy, { cover: cover, fixed_size: [Lf, Lf], given_D: Dd, given_bars: gb, title: "Footing " + mark });
    // punching: when the upward pressure inside the critical perimeter exceeds Pu (light / eccentric load) the shear force is
    // negative – punching does not govern; report 0 instead of a negative force / stress
    var stp = c.steps.slice(nst0), vp = stp.filter(function (s) { return s.label === "Punching shear force"; })[0];
    if (vp && vp.value < 0) {
      vp.note = "computed " + F(vp.value, ".1f") + " kN < 0: upward soil reaction inside the critical perimeter exceeds Pu – punching does not govern (taken as 0)";
      vp.value = 0;
      stp.forEach(function (s) {
        if (s.label === "Punching shear stress") { s.value = 0; s.variables = Object.assign({}, s.variables, { Vp: 0 }); s.note = "Vp = 0"; }
        if (s.label === "Punching shear" && s.status) { s.value = s.value.replace(/^\S+/, "0"); s.utilisation = 0; s.status = "PASS"; }
      });
    }
    c.section("Foundation " + mark + " – soil pressure (concurrent service cases) & stability (IS 456 cl 20)");
    RX.svc.forEach(function (cs) { press(ftg.L, ftg.D, cs, c); });
    stab(ftg.L, ftg.D, c);
    var hped = hp(ftg.D);
    c.let("Pedestal height (top of footing to +" + f2(plinth) + " m plinth)", "hp", R(hped, 3), "m");
    if (hped > 3 * Math.min(Lped, Bped)) c.warn("Tall pedestal", "height > 3 × least lateral dimension – design as a short column (IS 456 cl 25.1.2)", "IS 456 cl 25.1.2");
    // pedestal reinforcement
    c.section("Pedestal " + mark + " – reinforcement");
    var Ag = Lped * Bped * 1e6;
    var Asmin = c.calc("Minimum vertical steel 0.8 % Ag", "Asmin", "0.008*Ag", "mm²", "IS 456 cl 26.5.3.1", { Ag: R(Ag) });
    var Ast_u = c.calc("Steel to carry factored uplift / anchor tension", "Asu", "Uu*1000/(0.87*fy)", "mm²", "IS 456 cl 38", { Uu: R(Math.max(RX.Uu, bp.fixed ? bp.Tb * bp.n / 2 : 0), 3), fy: fy });
    var perim = 2 * (Lped + Bped) * 1000;
    var pick = null;
    [12, 16, 20, 25].some(function (d) {
      if (ctx.detail !== "code" && d < 12) return false;
      var n = Math.max(4, Math.ceil(Math.max(Asmin, Ast_u) / MT.bar_area(d) - 1e-9), Math.ceil(perim / 300));
      n = n + (n % 2);
      if (n <= Math.max(12, perim / 100)) { pick = { d: d, n: n }; return true; }
      return false;
    });
    if (!pick) {
      // even 25Ø at the closest practical pitch (≈ 75 mm round the perimeter) cannot carry it at 100 mm pitch: cap the bars and let the check FAIL
      var nmax = Math.max(4, Math.floor(perim / 100)); nmax -= nmax % 2;
      var nreq = isFinite(Ast_u) ? Math.ceil(Math.max(Asmin, Ast_u) / MT.bar_area(25)) + 1 : nmax + 2;
      pick = { d: 25, n: Math.min(nreq, nmax) };
      if (nreq > nmax) c.warn("Pedestal too small for the anchor / uplift tension", "needs " + (isFinite(nreq) ? C.pystr(nreq) : "∞") + "-25Ø but only " + C.pystr(nmax) + " fit – enlarge the pedestal, use a pinned base or more / larger anchor bolts", "IS 456 cl 26.5.3.1");
    }
    var Asp = pick.n * MT.bar_area(pick.d);
    c.check("Vertical steel provided " + C.pystr(pick.n) + "-" + g(pick.d) + "Ø", Asp, Math.max(Asmin, Ast_u), { unit: "mm²", clause: "IS 456 cl 26.5.3.1", mode: ">=" });
    var tdia = Math.max(8, Math.ceil(pick.d / 4 / 2) * 2), ts = C.floor_to(Math.min(Lped * 1000, Bped * 1000, 16 * pick.d, 300), 25);
    c.let("Lateral ties", "", g(tdia) + "Ø @ " + g(ts) + " c/c + 3 extra ties @ 75 in top 300 mm (anchor zone)", "", "IS 456 cl 26.5.3.2");
    var Pcap = c.calc("Pedestal axial capacity (short column)", "Puz", "(0.4*fck*(Ag - As) + 0.67*fy*As)/1000", "kN", "IS 456 cl 39.3", { fck: fck, Ag: R(Ag), As: R(Asp), fy: fy });
    c.check("Pedestal axial", RX.Pu, Pcap, { unit: "kN", clause: "IS 456 cl 39.3" });
    var Mped = c.calc("Pedestal moment at footing top", "Mp", "Hu*hp + Mb", "kN·m", "", { Hu: R(RX.Hu, 3), hp: R(hped, 3), Mb: R(Math.abs(RX.Mu || 0), 3) });
    var Mcap = c.calc("Pedestal flexural capacity (bars on two faces, conservative)", "Mpd", "0.87*fy*As/2*(D - 2*cv - 2*dt)*1e-6", "kN·m", "IS 456 cl 38.1", { fy: fy, As: R(Asp), D: Lped * 1000, cv: covP, dt: tdia + pick.d / 2 });
    c.check("Pedestal bending", Mped, Mcap, { unit: "kN·m", clause: "IS 456 cl 38" });
    var avail = hped * 1000 - 50 + ftg.D - cover - 50;
    c.check("Anchor bolt embedment fits in pedestal + footing", bp.Le, avail, { unit: "mm", clause: "IS 5624 / practice", note: "anchor plate stays above footing bottom bars" });
    if (bp.Le > hped * 1000 - 100) c.info("Anchor bolts extend into the footing", "pedestal bars lap the anchor zone; place anchor plates above footing top mat", "Practice");
    var lap = c.calc("Pedestal bars: development length into footing", "Ld", "d*0.87*fy/(4*tbd)", "mm", "IS 456 cl 26.2.1", { d: pick.d, fy: fy, tbd: R(MT.tau_bd(fck), 2) });
    // BBS
    // BBS (DS.bbs): footing U-bars counted across the other side; pedestal verticals L-bars with a foot so that the
    // embedment (D − c) + foot ≥ Ld; pedestal ties closed with 135° hooks
    var BB = DS.bbs, bbs = [];
    [["L", ftg.L, ftg.B, ftg.bars_L, 1], ["B", ftg.B, ftg.L, ftg.bars_B, 2]].forEach(function (t) {
      var b = t[3], nb = BB.count(t[2] * 1000, b.spacing, cover), leg = Math.min(BB.leg(b.dia, BB.cfg.ftg_leg_min), ftg.D - 2 * cover);
      bbs.push(BB.row("Footing " + mark, mark + "-" + t[4], b.dia, "U (90° bends both ends)", nb * nf, BB.ubar(b.dia, t[1] * 1000 - 2 * cover, leg), "bars along " + t[0] + " @ " + g(b.spacing) + " c/c"));
    });
    var foot = Math.max(300, lap - (ftg.D - cover - 50));
    var vb = BB.lbar(pick.d, hped * 1000 + ftg.D - cover - 50 - 50, foot);
    bbs.push(BB.row("Pedestal " + mark, "P" + mark.slice(1) + "-1", pick.d, "L (" + Math.round(foot) + " mm foot on footing mat)", pick.n * nf, vb, "vertical bars, " + C.pystr(pick.n) + " per pedestal"));
    var nt = Math.floor(hped * 1000 / ts) + 1 + 3;
    bbs.push(BB.row("Pedestal " + mark, "P" + mark.slice(1) + "-2", tdia, "closed tie, 135° hooks", nt * nf, BB.stirrup(tdia, Lped * 1000, Bped * 1000, covP), "@ " + g(ts) + " c/c + 3 @ 75 at top"));
    return { ftg: ftg, Lped: Lped, Bped: Bped, hped: hped, vbars: pick, tie: { d: tdia, s: ts }, bbs: bbs, cover: cover, covP: covP, fck: fck, sbc: sbc, n: nf, mark: mark, df: df, plinth: plinth, Ld: lap };
  };

  /* plinth / tie beam along the long walls (and gable ends) */
  M.tie_beam = function (c, inp, G, FD, ctx) {
    if (!inp.tie_beam) return null;
    c.section("Plinth / tie beam");
    var b = 0.23, D = 0.30, Lc = G.bay - FD.Lped;
    var Pt = c.calc("Design tie force (≥ 10 % of column axial load, compression or tension)", "Ft", "0.1*Pu", "kN", "IS 1893-1 cl 7.12.1 / IS 4326 practice", { Pu: R(FD.Pu || 0, 3) });
    var As = c.calc("Steel for tie force", "As", "Ft*1000/(0.87*fy)", "mm²", "IS 456 cl 38", { Ft: Pt, fy: 500 });
    var n = 4, d = Math.max(12, firstOk([12, 16], function (x) { return 4 * MT.bar_area(x) >= As; }) || 16);
    c.let("Tie beam " + g(b * 1000) + " × " + g(D * 1000), "", n + "-" + g(d) + "Ø + 8Ø stirrups @ 150", "", "IS 456 cl 26.5.1 / practice", "also supports the brick dado wall (if any)");
    var nbeam = 2 * G.n_bays + (G.clad ? 2 * Math.max(1, Math.round(G.span / G.bay)) : 0);
    var Lspan = Lc, Lg = G.span / Math.max(1, Math.round(G.span / G.bay)) - FD.Lped;
    return { b: b, D: D, n: n, d: d, nlong: 2 * G.n_bays, Llong: Lspan, ngab: G.clad ? 2 * Math.max(1, Math.round(G.span / G.bay)) : 0, Lgab: Lg, count: nbeam };
  };

  /* =========================================================================== bill of materials */
  M.bom = function (D) {
    var G = D.G, FR = D.FR, PUR = D.PUR, mem = [], pl = [], bo = [], an = [], we = [], sh = [];
    var slopes = G.kind === "mono" ? 1 : 2;
    var nfr = G.gable_cols ? G.n_frames - 2 : G.n_frames;          // frames with rafter / truss
    var nC = 2 * G.n_frames;
    function addM(mark, desc, sec, L, nos, kgm, cat, per) { if (nos > 0 && L > 0) mem.push({ mark: mark, desc: desc, sec: sec, L: R(L, 3), nos: nos, kgm: R(kgm, 3), cat: cat, per: per || 0 }); }
    function addP(mark, desc, L, B, t, nos, cat) { if (nos > 0) pl.push({ mark: mark, desc: desc, L: Math.round(L), B: Math.round(B), t: t, nos: nos, cat: cat || "plate" }); }
    function addB(loc, d, L, grade, nos, std, nuts, washers) { if (nos > 0) bo.push({ loc: loc, d: d, L: L, grade: grade, nos: nos, std: std || (grade === "4.6" ? "IS 1363 / IS 6639 (black, hex)" : "IS 1367 / IS 3757 (HS, snug-tight)"), nuts: nuts == null ? 1 : nuts, washers: washers == null ? 1 : washers, kg: bolt_kg(d, L) }); }
    function addW(loc, size, Lmm, nos, type) { if (nos > 0 && Lmm > 0) we.push({ loc: loc, size: size, L: Math.round(Lmm), nos: nos, type: type || "Shop (γmw 1.25)" }); }
    var raf = FR.raf, col = FR.col;
    // ---------------- main frame
    if (G.kind === "portal" || G.kind === "mono") {
      addM("C1", "Main column" + (G.kind === "mono" ? " (low side)" : ""), FR.colName, G.eave, G.kind === "mono" ? G.n_frames : nC, col.w, "main", perim(col));
      if (G.kind === "mono") addM("C2", "Main column (high side)", FR.colName, G.h2, G.n_frames, col.w, "main", perim(col));
      addM("R1", "Rafter", FR.rafName, G.raf_len, slopes * nfr, raf.w, "main", perim(raf));
      if (FR.haunch) addM("H1", "Knee haunch (cut from " + FR.rafName + ", 1 length → 2 haunches)", FR.rafName, FR.Lh, nfr * (G.kind === "mono" ? 2 : 2) / 2, raf.w, "main", perim(raf));
    } else if (G.kind === "peb") {
      addM("C1", "Tapered welded column " + g(FR.cp.d2) + "→" + g(FR.cp.d) + " deep", FR.colName, G.eave, nC, FR.col_w, "main", perim(col));
      addM("R1", "Tapered welded rafter " + g(FR.rp.d) + "→" + g(FR.rp.d2) + " deep", FR.rafName, G.raf_len, 2 * nfr, FR.raf_w, "main", perim(raf));
    } else {
      addM("C1", "Main column", FR.colName, G.eave, nC, col.w, "main", perim(col));
      var TR = FR.truss, f = TR.A.model.f, mk = { "Top chord": "TC", "Bottom chord": "BC", "Verticals": "TV", "Diagonals": "TD", "Web struts": "WS", "Web ties": "WT", "Knee brace": "KB" };
      Object.keys(TR.des).forEach(function (gn) {
        var d = TR.des[gn], Ltot = sumOf(d.fr.ids.map(function (m) { return f.geom(f.members[m])[0]; }));
        if (gn === "Knee brace") addM("KB", "Knee brace (2 per frame)", d.label, d.fr.L, 2 * G.n_frames, d.w, "main", perim(d.sec));
        else addM(mk[gn], gn + " – total length per truss", d.label, Ltot, nfr, d.w, "main", perim(d.sec));
      });
      var bt = D.BT;
      if (bt) addM("BT", "Bottom-chord longitudinal tie (alternate nodes)", bt.name, G.length, bt.lines, section(bt.name).w, "secondary", perim(section(bt.name)));
    }
    if (D.GA) {
      D.GA.hs.forEach(function (h, i) { addM("GC" + (i + 1), "Gable column at x = " + f2(D.GA.xs[i]) + " m (both ends)", D.GA.name, h, 2, D.GA.sec.w, "main", perim(D.GA.sec)); });
      if (D.GA.er) addM("ER", "End rafter (continuous over gable columns)", D.GA.er_name, G.raf_len, 2 * slopes, D.GA.er.w, "main", perim(D.GA.er));
    }
    if (D.CR) {
      var CR = D.CR;
      addM("CG1", "Crane gantry girder", CR.gi, G.bay, 2 * G.n_bays, CR.gp.I.w, "main", perim(CR.gp.I));
      addM("CG2", "Gantry cap channel", CR.gch, G.bay, 2 * G.n_bays, CR.gp.Cn.w, "main", perim(CR.gp.Cn));
      addM("CR", "Crane rail (allowance, CR 60 / 30 kg/m – confirm with crane maker)", "Crane rail", G.length, 2, 30, "main", 0.35);
      addP("BK1", "Crane bracket web plates (2 per bracket)", CR.br.d, (CR.e + 0.05) * 1000, CR.tb, 2 * 2 * G.n_frames, "plate");
      addP("BK2", "Crane bracket cap plate", (CR.e + 0.05) * 1000, 300, 20, 2 * G.n_frames, "plate");
      addW("Crane bracket plates to column flange (both sides)", CR.br.s, 2 * 2 * CR.br.d, 2 * G.n_frames, "Shop (γmw 1.25)");
      addW("Gantry cap channel to I-beam (intermittent 50 %)", 6, 2 * G.bay * 1000 * 0.5, 2 * G.n_bays, "Shop (γmw 1.25)");
      addB("Gantry girder to bracket", 20, bolt_len(CR.tb + CR.gp.I.tf + 20, 20, false), "4.6", 4 * 2 * 2 * G.n_bays / 2 * 2, null, 1, 1);
    }
    // ---------------- secondary
    var lines = (G.kind === "mono" ? G.n_purl - 2 : G.n_purl - 1);
    lines = Math.max(lines, 1);
    var tl = lines * slopes, nedge = Math.min(PUR.n_edge, tl);
    var lapf = PUR.P1.sec.family === "CFZ" ? 1.06 : 1.0;
    addM("P1", "Purlin – general zone" + (lapf > 1 ? " (incl. 6 % laps)" : ""), PUR.name, G.length * lapf, tl - nedge, PUR.P1.w, "secondary", perim(PUR.P1.sec));
    if (nedge) addM("P2", "Purlin – edge / ridge zone", PUR.ename, G.length * lapf, nedge, PUR.P2.w, "secondary", perim(PUR.P2.sec));
    var esS = section(D.BR.es);
    addM("ES", "Eave strut (both eaves)", D.BR.es, G.length, 2, esS.w, "secondary", perim(esS));
    if (PUR.sag) {
      var sg = sec_of("RD " + g(PUR.sag.d));
      addM("SR1", "Sag rod (between purlins, threaded both ends)", "RD " + g(PUR.sag.d), G.ps + 0.1, PUR.sag.nsag * (G.n_purl - 1) * slopes * G.n_bays, sg.w, "secondary", perim(sg));
      if (slopes === 2) addM("SR2", "Ridge tie rod (connects sag-rod lines across ridge)", "RD " + g(PUR.sag.d), 2 * G.ps, PUR.sag.nsag * G.n_bays, sg.w, "secondary", perim(sg));
    }
    var rows = G.rowsL + G.rowsR;
    if (D.GI && rows) {
      if (G.fL === G.fR) addM("G1", "Side girt", D.GI.name, G.length * G.fL, rows, D.GI.w, "secondary", perim(D.GI.sec));
      else {
        if (G.rowsL) addM("G1", "Side girt – left long side" + (G.fL < 1 ? " (clad bays " + G.baysL.map(function (i) { return i + 1; }).join(",") + ")" : ""), D.GI.name, G.length * G.fL, G.rowsL, D.GI.w, "secondary", perim(D.GI.sec));
        if (G.rowsR) addM("G1R", "Side girt – right long side" + (G.fR < 1 ? " (clad bays " + G.baysR.map(function (i) { return i + 1; }).join(",") + ")" : ""), D.GI.name, G.length * G.fR, G.rowsR, D.GI.w, "secondary", perim(D.GI.sec));
      }
      if (D.GI.nsag) addM("SR3", "Girt sag rod", "RD 12", G.gsp + 0.1, Math.round(D.GI.nsag * (G.rowsL * G.fL + G.rowsR * G.fR) * G.n_bays), 12 * 12 / 162, "secondary", perim(sec_of("RD 12")));
    }
    if (D.GA && G.clad) {
      var gr = Math.max(1, Math.ceil((sumOf(D.GA.hs) / D.GA.hs.length) / G.gsp - 1e-9));
      addM("GG1", "Gable girt", D.GA.girt.name, D.GA.s, 2 * gr * (D.GA.n + 1), D.GA.girt.w, "secondary", perim(D.GA.girt.sec));
    }
    var RB = D.BR.RB, WB = D.BR.WB, nbr = D.BR.nbr;
    var nRB = nbr * slopes * RB.np * 2, nWB = nbr * 2 * WB.ntier * 2;
    addM("RB", "Roof bracing diagonal (" + (RB.kind === "rod" ? "rod + turnbuckle" : "angle") + ")", RB.name, RB.L, nRB, RB.sec.w, "secondary", perim(RB.sec));
    addM("WB", "Wall bracing diagonal (" + (WB.kind === "rod" ? "rod + turnbuckle" : "angle") + ")", WB.name, WB.L, nWB, WB.sec.w, "secondary", perim(WB.sec));
    if (WB.ntier > 1) addM("WS", "Wall bracing intermediate strut", D.BR.es, G.bay, nbr * 2, esS.w, "secondary", perim(esS));
    var fb = section("ISA 50x50x6");
    if (G.kind !== "truss") addM("FB", "Fly brace (rafter bottom flange to alternate purlins, both sides)", "ISA 50x50x6", Math.hypot(raf.h / 1000 + 0.15, 0.6), 2 * Math.ceil(G.n_purl / 2) * slopes * nfr, fb.w, "secondary", perim(fb));
    if (rows) addM("FC", "Fly brace (column inner flange to alternate girts)", "ISA 50x50x6", Math.hypot(col.h / 1000 + 0.15, 0.6), 2 * Math.ceil(Math.max(G.rowsL, G.rowsR) / 2) * nC, fb.w, "secondary", perim(fb));
    // cleats
    var PC = D.CLP, cs = section(PC.ang);
    var nPC = tl * G.n_frames;
    addM("PC", "Purlin cleat " + PC.ang + " × " + g(PC.Lc) + " (shop-welded to rafter)", PC.ang, PC.Lc / 1000, nPC, cs.w, "secondary", perim(cs));
    addW("Purlin cleat to rafter top flange", 6, 2 * PC.Lc, nPC, "Shop (γmw 1.25)");
    addB("Purlin to cleat", PC.d, bolt_len(PC.grip, PC.d), "4.6", PC.n * nPC, null, 1, 1);
    if (PUR.P1.sec.family === "CFZ") addB("Z-purlin laps at interior frames", 12, bolt_len(2 * PUR.P1.sec.t + 2, 12), "4.6", 4 * tl * Math.max(G.n_frames - 2, 0), null, 1, 1);
    addM("EC", "Eave strut cleat ISA 75x75x6 × 150", "ISA 75x75x6", 0.15, 2 * G.n_frames, section("ISA 75x75x6").w, "secondary", perim(section("ISA 75x75x6")));
    addB("Eave strut to cleat", 16, bolt_len(esS.tw + 6, 16), "4.6", 2 * 2 * G.n_frames, null, 1, 1);
    if (D.CLG && rows) {
      var GCc = D.CLG, gcs = section(GCc.ang), nGC = rows * G.n_frames;
      addM("GCL", "Girt cleat " + GCc.ang + " × " + g(GCc.Lc), GCc.ang, GCc.Lc / 1000, nGC, gcs.w, "secondary", perim(gcs));
      addW("Girt cleat to column flange", 6, 2 * GCc.Lc, nGC, "Shop (γmw 1.25)");
      addB("Girt to cleat", GCc.d, bolt_len(GCc.grip, GCc.d), "4.6", GCc.n * nGC, null, 1, 1);
    }
    if (D.GA && G.clad) {
      var ggr = Math.max(1, Math.ceil((sumOf(D.GA.hs) / D.GA.hs.length) / G.gsp - 1e-9)) * (D.GA.n + 1) * 2 * 2;
      addM("GGC", "Gable girt cleat ISA 65x65x6 × 100", "ISA 65x65x6", 0.1, ggr, section("ISA 65x65x6").w, "secondary", perim(section("ISA 65x65x6")));
      addB("Gable girt to cleat", 12, bolt_len(D.GA.girt.sec.tw + 6, 12), "4.6", 2 * ggr, null, 1, 1);
      addP("GCT", "Gable column top plate (slotted, vertical movement)", 200, Math.max(D.GA.sec.b, 150), 12, 2 * D.GA.n, "plate");
      addB("Gable column top to rafter / bracing node (slotted)", 16, bolt_len(24, 16), "4.6", D.GA.ntop * 2 * D.GA.n, null, 1, 2);
    }
    // bracing connections
    [[RB, nRB, "Roof bracing"], [WB, nWB, "Wall bracing"]].forEach(function (x) {
      var B = x[0], n = x[1];
      if (B.kind === "rod") {
        addP(x[2].slice(0, 1) + "BC", x[2] + " end clip plate (rod through, bevel washer)", 150, 100, 10, 2 * n, "plate");
        addW(x[2] + " clip plate to frame", 6, 2 * 150, 2 * n, "Shop (γmw 1.25)");
        bo.push({ loc: x[2] + " – rod nuts + bevel washers (2 per end) and 1 turnbuckle per rod", d: B.d, L: 0, grade: "4.6", nos: 0, std: "IS 1363 nuts; forged turnbuckle", nuts: 4 * n, washers: 2 * n, kg: 0, turnbuckles: n });
      } else {
        addP(x[2].slice(0, 1) + "BG", x[2] + " gusset", B.gus.L, B.gus.B, B.gus.t, 2 * n, "plate");
        addW(x[2] + " gusset to frame", 6, 2 * B.gus.L, 2 * n, "Shop (γmw 1.25)");
        addB(x[2] + " end connections", B.bd, bolt_len(B.sec.t + B.gus.t, B.bd), "4.6", B.nb * 2 * n, null, 1, 1);
        addB(x[2] + " crossing (X) / K-node", B.bd, bolt_len(2 * B.sec.t + 8, B.bd), "4.6", Math.ceil(n / 2), null, 1, 2);
      }
    });
    // ---------------- connections & plates (main)
    var KN = D.KN, AP = D.AP;
    if (KN) {
      var nk = (G.kind === "mono" ? 2 : 2) * nfr;
      addP("EP1", "Knee end plate (extended)", KN.L.Lp, KN.L.B, KN.t, nk, "plate");
      addP("ST1", "Column stiffener at knee (2 pairs)", KN.st.L, KN.st.b, KN.st.t, 4 * nk, "plate");
      if (KN.diag) addP("ST2", "Column web diagonal stiffener", KN.diag.L, KN.diag.b, KN.diag.t, 2 * nk, "plate");
      addB("Knee joint (rafter end plate to column flange)", KN.d, bolt_len(KN.t + col.tf, KN.d, true), D.inp.bolt_grade_main, KN.nb * nk, null, 1, 2);
      if (KN.butt) addW("Knee: rafter flanges to end plate – full-penetration butt", "FPBW", 2 * raf.b, nk, "Shop (γmw 1.25)");
      else addW("Knee: rafter flanges to end plate (both sides)", KN.sf, 2 * 2 * (2 * raf.b - raf.tw) / 2, nk, "Shop (γmw 1.25)");
      addW("Knee: rafter web to end plate (both sides)", KN.sw, 2 * (KN.D - 2 * raf.tf), nk, "Shop (γmw 1.25)");
      addW("Knee: column stiffeners (web + flanges)", KN.st.s, 4 * (2 * KN.st.L + 2 * KN.st.b), nk, "Shop (γmw 1.25)");
      if (FR.haunch) addW("Haunch to rafter bottom flange (both sides)", 6, 2 * FR.Lh * 1000, nk, "Shop (γmw 1.25)");
    }
    if (AP) {
      addP("EP2", "Apex end plate (flush, pair)", AP.L.Lp, AP.L.B, AP.t, 2 * nfr, "plate");
      addB("Apex splice (end plate to end plate)", AP.d, bolt_len(2 * AP.t, AP.d, true), D.inp.bolt_grade_main, AP.nb * nfr, null, 1, 2);
      if (AP.butt) addW("Apex: flanges to end plate – full-penetration butt", "FPBW", 2 * raf.b, 2 * nfr, "Shop (γmw 1.25)");
      else addW("Apex: flanges to end plate (both sides)", AP.sf, 2 * (2 * raf.b - raf.tw), 2 * nfr, "Shop (γmw 1.25)");
      addW("Apex: web to end plate (both sides)", AP.sw, 2 * (AP.D - 2 * raf.tf), 2 * nfr, "Shop (γmw 1.25)");
    }
    if (G.kind === "peb") {
      addW("Tapered columns – web-to-flange (both flanges, both sides)", Math.max(weld_min(FR.cp.tf), 5), 4 * G.eave * 1000, nC, "Shop (γmw 1.25, SAW)");
      addW("Tapered rafters – web-to-flange", Math.max(weld_min(FR.rp.tf), 5), 4 * G.raf_len * 1000, 2 * nfr, "Shop (γmw 1.25, SAW)");
    }
    if (D.TJ) {
      var TJ = D.TJ, TRd = FR.truss, f2_ = TRd.A.model.f;
      var nodes = TRd.A.model.nd.top.length + TRd.A.model.nd.bot.length - 4 + (/Fink/.test(G.style) && G.nh === 4 ? 2 : 0);
      addP("GT", "Truss joint gusset", TJ.gus.L, TJ.gus.B, TJ.tg, nodes * nfr, "plate");
      addP("GH", "Truss heel gusset", TJ.heel.L, TJ.heel.B, TJ.tg, 2 * nfr, "plate");
      addP("CP", "Column cap plate under truss heel", col.h + 60, col.b + 60, 16, nC, "plate");
      addW("Column cap plate to column", 6, 2 * (2 * col.b + col.h), nC, "Shop (γmw 1.25)");
      addW("Heel gusset to cap plate", 6, 2 * TJ.heel.L, 2 * nfr, "Shop (γmw 1.25)");
      addB("Truss heel to column cap (4 per heel)", 20, bolt_len(16 + TJ.tg + 10, 20), "4.6", 4 * 2 * nfr, null, 1, 1);
      Object.keys(TRd.des).forEach(function (gn) {
        var j = TJ[gn]; if (!j) return;
        var cnt = gn === "Knee brace" ? 2 * G.n_frames : TRd.des[gn].fr.n * nfr;
        addB("Truss " + gn.toLowerCase() + " end connections", j.d, bolt_len(j.grip, j.d), "4.6", j.nb * 2 * cnt, null, 1, 1);
      });
      void f2_;
    }
    // base plates & anchors
    [[D.BP1, nC, "Main column", "BP1"], [D.BP2, D.GA ? 2 * D.GA.n : 0, "Gable column", "BP2"]].forEach(function (x) {
      var B = x[0], n = x[1]; if (!B || !n) return;
      addP(x[3], x[2] + " base plate", B.Lp, B.Bp, B.tp, n, "plate");
      addP(x[3] + "W", x[2] + " anchor plate (bottom of anchor bolt)", B.bw, B.bw, B.tw, n * B.n, "plate");
      if (B.gus) { addP(x[3] + "G", x[2] + " base gusset (stiffened moment base)", B.gus.L, B.gus.h, B.gus.t, 4 * n, "plate"); addW(x[2] + " base gussets to plate & flange", B.gus.s, 2 * (B.gus.L + B.gus.h), 4 * n, "Shop (γmw 1.25)"); }
      if (B.key) { addP(x[3] + "K", x[2] + " shear key", B.key.b, B.key.d, B.key.t, n, "plate"); addW(x[2] + " shear key to base plate (both sides)", B.key.s, 2 * B.key.b, n, "Shop (γmw 1.25)"); }
      if (B.fixed) { addW(x[2] + " flanges to base plate – full-penetration butt", "FPBW", 2 * col.b, n, "Shop (γmw 1.25)"); addW(x[2] + " web to base plate (both sides)", 6, 2 * (col.h - 2 * col.tf), n, "Shop (γmw 1.25)"); }
      else addW(x[2] + " to base plate (all round)", B.weld_s, B.Lw, n, "Shop (γmw 1.25)");
      an.push({ loc: x[2] + " base (" + C.pystr(n) + " bases × " + C.pystr(B.n) + ")", d: B.d, L: B.Ltot, grade: "4.6 (IS 2062 E250 rod, IS 5624)", nos: n * B.n, nuts: 3, washers: 1, plate: g(B.bw) + "×" + g(B.bw) + "×" + g(B.tw), Le: B.Le });
    });
    // ---------------- sheeting & accessories
    var roofA = G.kind === "mono" ? (G.raf_len + 0.6) * (G.length + 0.6) : 2 * (G.raf_len + 0.3) * (G.length + 0.6);
    sh.push(["Roof sheeting " + g(num(D.inp.roof_sheet_t)) + " mm TCT colour-coated profiled", "sqm", R(roofA, 2)]);
    var wallA = 0;
    if (G.clad) {
      if (!G.walls_open_L) wallA += G.length * G.fL * G.eave;
      if (!G.walls_open_R) wallA += G.length * G.fR * G.h2;
      var nGab = (D.inp.open_F ? 0 : 1) + (D.inp.open_B ? 0 : 1);
      wallA += nGab * (G.kind === "mono" ? G.span * (G.eave + G.h2) / 2 : G.kind === "truss" ? G.span * G.eave + G.span * G.rise / 2 : G.span * G.eave + G.span * G.rise / 2);
      sh.push(["Wall cladding " + g(num(D.inp.wall_sheet_t)) + " mm TCT colour-coated", "sqm", R(wallA, 2)]);
    }
    var ridge = G.kind === "mono" ? 0 : G.length + 0.6;
    var flash = 2 * slopes * (G.raf_len + 0.3) + (G.clad ? 4 * G.eave : 0) + (G.kind === "mono" ? G.length + 0.6 : 0);
    var gut = (G.kind === "mono" ? 1 : 2) * (G.length + 0.6);
    var ndp = (G.kind === "mono" ? 1 : 2) * Math.max(2, Math.ceil(G.raf_len * G.length / 50 - 1e-9));
    var Ldp = G.eave + 0.3;
    var pg = D.SH ? D.SH.pit_g : 0.4, screws = Math.ceil(((G.n_purl * slopes) * G.length / pg + roofA * 1.0 + (G.clad ? ((G.rowsL * G.fL + G.rowsR * G.fR) * G.length + (wallA - (G.walls_open_L ? 0 : G.length * G.fL * G.eave) - (G.walls_open_R ? 0 : G.length * G.fR * G.h2)) / Math.max(G.gsp, 1)) / 0.4 : 0) + 3 * (ridge + flash)) * 1.05);
    sh.push(["Ridge cap (colour-coated, 600 mm girth)", "metre", R(ridge, 2)]);
    sh.push(["Flashings – verge / barge, corner, apron (450 mm girth)", "metre", R(flash, 2)]);
    sh.push(["Eave gutter 0.6 mm colour-coated / GI, 600 mm girth", "metre", R(gut, 2)]);
    sh.push(["Downpipe 110 mm uPVC with clamps (" + C.pystr(ndp) + " nos × " + f2(Ldp) + " m; 1 per ≈ 50 m² roof)", "metre", R(ndp * Ldp, 2)]);
    sh.push(["Self-drilling screws 12-14 × 25/55 with EPDM washers (incl. stitching, 5 % extra)", "each", screws]);
    return { mem: mem, pl: pl, bo: bo, an: an, we: we, sh: sh, roofA: roofA, wallA: wallA, ridge: ridge, flash: flash, gut: gut, ndp: ndp, Ldp: Ldp, screws: screws };
  };

  function memKg(m) { return m.nos * R(m.L, 3) * R(m.kgm, 3); }
  function plKg(p) { return p.nos * R(p.L / 1000, 3) * R(p.B / 1000, 3) * R(p.t * 7.85, 3); }
  function anKg(a) { return a.nos * R(a.L / 1000, 3) * R(a.d * a.d / 162, 3); }
  M.memKg = memKg; M.plKg = plKg; M.anKg = anKg;

  M.quantities = function (D, B) {
    var q = [], G = D.G, rcc = function (fck) { return fck >= 35 ? rate("rcc_m35", 10200) : fck >= 30 ? rate("rcc_m30", 9600) : rate("rcc_m25", 8900); };
    var main = B.mem.filter(function (m) { return m.cat === "main"; }), sec = B.mem.filter(function (m) { return m.cat !== "main"; });
    var what = G.kind === "truss" ? "roof trusses & columns" : "portal frames";
    q.push(Q("Structural steel in " + what + " – rolled / built-up main members (columns, rafters, trusses, gable columns, gantry), fabrication & erection incl. primer", "kg",
      main.map(function (m) { return kg_row(m.mark + " " + m.desc + " " + m.sec, m.nos, m.L, m.kgm); }), null, rate("steel_struct", 110)));
    q.push(Q("Secondary steel – purlins, girts, eave struts, sag rods, bracing, fly braces & cleats, fabrication & erection", "kg",
      sec.map(function (m) { return kg_row(m.mark + " " + m.desc + " " + m.sec, m.nos, m.L, m.kgm); }), null, rate("steel_light", 115)));
    q.push(Q("Base plates, end plates, stiffeners, gussets, anchor & shear-key plates – MS plates IS 2062, fabrication & fixing", "kg",
      B.pl.map(function (p) { return row(p.mark + " " + p.desc + " " + p.L + "×" + p.B + "×" + p.t + " (Nos × L m × B m × 7.85t kg/m²)", p.nos, p.L / 1000, p.B / 1000, p.t * 7.85); }), null, rate("steel_struct", 110)));
    var bolts = B.bo.filter(function (b) { return b.nos > 0; });
    q.push(Q("Bolts with nuts & washers – HS gr 8.8 (IS 1367 / IS 3757) and black gr 4.6 (IS 1363), supply & fixing", "each",
      bolts.map(function (b) { return row(b.loc + " M" + g(b.d) + "×" + g(b.L) + " gr " + b.grade, b.nos); }), null, 45));
    var tbk = B.bo.filter(function (b) { return b.turnbuckles; });
    if (tbk.length) q.push(Q("Turnbuckles & bevel washers for rod bracing", "each", tbk.map(function (b) { return row(b.loc, b.turnbuckles); }), null, 450));
    q.push(Q("Anchor / foundation bolts IS 5624 with nuts, washers (anchor plates in plate item)", "kg",
      B.an.map(function (a) { return kg_row(a.loc + " M" + g(a.d) + "×" + g(a.L), a.nos, a.L / 1000, a.d * a.d / 162); }), null, rate("anchor_bolt", 150)));
    q.push(Q("Colour-coated profiled roofing sheet " + g(num(D.inp.roof_sheet_t)) + " mm TCT with fixings", "sqm", [row("Roof incl. overhangs", 1, B.roofA)], null, rate("roof_sheet", 750)));
    if (B.wallA > 0) q.push(Q("Colour-coated wall cladding sheet " + g(num(D.inp.wall_sheet_t)) + " mm TCT", "sqm", [row("Side & gable walls", 1, B.wallA)], null, rate("wall_sheet", 680)));
    q.push(Q("Ridge cap & flashings – colour-coated 0.50 mm, 450–600 mm girth", "metre", [row("Ridge", 1, B.ridge), row("Verge / corner / apron flashing", 1, B.flash)].filter(function (r) { return r.length > 0; }), null, 450));
    q.push(Q("Eave gutter – colour-coated / GI 0.6 mm, 600 mm girth, with brackets", "metre", [row("Gutters", 1, B.gut)], null, 950));
    q.push(Q("Downpipe 110 mm uPVC with clamps & shoe", "metre", [row("Downpipes", B.ndp, B.Ldp)], null, 450));
    q.push(Q("Self-drilling screws 12-14 with EPDM washers", "each", [row("Roof & wall fasteners", B.screws)], null, 8));
    // floor inside the shed (optional)
    var fpcc = num(D.inp.floor_pcc) || 0;
    if (fpcc > 0) {
      q.push(Q("Earth filling / consolidation under floor (avg 150 mm)", "cum", [row("Shed floor area", 1, G.span, G.length, 0.15)], [CPWD, "2.25"]));
      q.push(Q("PCC 1:2:4 floor " + g(fpcc) + " mm thick", "cum", [row("Shed floor (span × length)", 1, G.span, G.length, fpcc / 1000)], [CPWD, "4.1.3"]));
    }
    // foundations
    [D.FD1, D.FD2].forEach(function (F) {
      if (!F) return;
      var f = F.ftg, n = F.n, L = f.L, Bf = f.B, Dm = f.D / 1000, work = 0.3, exc = F.df + 0.1, t = "Footing " + F.mark;
      q.push(Q("Earth work in excavation for foundations, all kinds of soil", "cum", [row(t + " – pits", n, L + 2 * work, Bf + 2 * work, exc)], [CPWD, "2.8.1"]));
      q.push(Q("PCC 1:4:8 below footings", "cum", [row(t + " – levelling course 100 thk", n, L + 0.2, Bf + 0.2, 0.1)], [CPWD, "4.1.8"]));
      q.push(Q("RCC M" + g(F.fck) + " in footings & pedestals (excl. steel & shuttering)", "cum", [row(t + " – pad", n, L, Bf, Dm), row(t + " – pedestal", n, F.Lped, F.Bped, F.hped)], null, rcc(F.fck)));
      q.push(Q("Centering & shuttering for foundations / pedestals", "sqm", [row(t + " – pad sides", n, 2 * (L + Bf), null, Dm), row(t + " – pedestal sides", n, 2 * (F.Lped + F.Bped), null, F.hped)], null, rate("shutter_found", 450)));
      var back = (L + 2 * work) * (Bf + 2 * work) * exc - (L + 0.2) * (Bf + 0.2) * 0.1 - L * Bf * Dm - F.Lped * F.Bped * Math.max(F.df - Dm, 0);
      q.push(Q("Filling available excavated earth in trenches / pits", "cum", [row(t + " – backfill", n, back)], [CPWD, "2.25"]));
    });
    if (D.TB) {
      var tb = D.TB, fck = D.FD1.fck;
      q.push(Q("RCC M" + g(fck) + " in plinth / tie beams at foundation level (excl. steel & shuttering)", "cum", [row("Tie beams along walls", tb.nlong, tb.Llong, tb.b, tb.D)].concat(tb.ngab ? [row("Tie beams at gables", tb.ngab, tb.Lgab, tb.b, tb.D)] : []), null, rcc(fck)));
      q.push(Q("Centering & shuttering for plinth / tie beams (foundation)", "sqm", [row("Tie beam sides", tb.nlong, tb.Llong, null, 2 * tb.D)].concat(tb.ngab ? [row("Gable tie beam sides", tb.ngab, tb.Lgab, null, 2 * tb.D)] : []), null, rate("shutter_found", 450)));
    }
    q.push(Q("Reinforcement TMT Fe500 in foundations, pedestals & tie beams – cutting, bending, placing", "kg",
      D.bbs.map(function (r) { return kg_row(r.member + " " + r.mark + " " + g(r.dia) + "Ø", r.nos, r.cut_length, r.dia * r.dia / 162); }), null, rate("rebar", 85)));
    q.push(Q("Non-shrink cementitious grout under base plates (40 mm)", "cum", [D.BP1, D.BP2].filter(function (b) { return b; }).map(function (b, i) {
      return row((i ? "Gable" : "Main") + " column bases", i ? 2 * D.GA.n : 2 * G.n_frames, (b.Lp + 100) / 1000, (b.Bp + 100) / 1000, 0.04); }), null, rate("grout", 18000)));
    var paint = B.mem.map(function (m) { return row(m.mark + " " + m.sec + " (Nos × L × m²/m)", m.nos, m.L, m.per); }).filter(function (r) { return r.breadth > 0; })
      .concat(B.pl.length ? [row("Plates (both faces)", 1, sumOf(B.pl.map(function (p) { return 2 * p.nos * p.L * p.B / 1e6; })))] : []);
    q.push(Q("Painting structural steel – blast SA 2.5, zinc-rich epoxy primer 75 µm + epoxy MIO 100 µm + PU finish 50 µm", "sqm", paint, null, 180,
      "corrosive coal-dust / humid atmosphere: IS 9862 / ISO 12944 C4 system"));
    return q;
  };

  /* =========================================================================== drawings */
  M.drawings = function (D, B) {
    var DR = DS.drawing, View = DR.View, Sheet = DR.Sheet, CM = DS.common;
    var G = D.G, FR = D.FR, inp = D.inp, col = FR.col, raf = FR.raf;
    var S_ = G.span * 1000, L_ = G.length * 1000, H_ = G.eave * 1000, H2 = G.h2 * 1000, R_ = G.ridge * 1000, bay = G.bay * 1000;
    var th = rad(G.slope), sheets = [], k, x, y;
    var slopes = G.kind === "mono" ? 1 : 2;
    function bubble(v, cx, cy, r, t) { v.circle(cx, cy, r, "GRID"); v.text(cx, cy - r * 0.35, t, 2.5, { anchor: "middle" }); }
    function roofY(xx) { return G.kind === "mono" ? H_ + (H2 - H_) * xx / S_ : H_ + (R_ - H_) * (1 - Math.abs(xx - S_ / 2) / (S_ / 2)); }
    var braced = [0, G.n_bays - 1]; if (D.BR.nbr > 2) braced.push(Math.floor(G.n_bays / 2)); if (G.n_bays === 1) braced = [0];

    /* ---------------- S-01 GA plan */
    var gp = new View("Column grid, bracing & foundation layout – plan");
    var rb = Math.max(S_, L_) * 0.012;
    for (k = 0; k < G.n_frames; k++) {
      x = k * bay;
      gp.line(x, -0.08 * S_, x, 1.08 * S_, "GRID"); bubble(gp, x, -0.08 * S_ - rb, rb, String(k + 1));
      [0, S_].forEach(function (yy) {
        gp.rect(x - col.b / 2, yy - col.h / 2, col.b, col.h, "STEEL", "steel");
        var F1 = D.FD1.ftg; gp.rect(x - F1.L * 500, yy - F1.B * 500, F1.L * 1000, F1.B * 1000, "HIDDEN");
      });
    }
    [["A", 0], ["B", S_]].forEach(function (a) { gp.line(-0.05 * L_, a[1], 1.05 * L_, a[1], "GRID"); bubble(gp, -0.05 * L_ - rb, a[1], rb, a[0]); });
    if (D.GA) D.GA.xs.forEach(function (gx) {
      [0, L_].forEach(function (xx) {
        var s = D.GA.sec; gp.rect(xx - s.h / 2, gx * 1000 - s.b / 2, s.h, s.b, "STEEL", "steel");
        if (D.FD2) { var F2 = D.FD2.ftg; gp.rect(xx - F2.L * 500, gx * 1000 - F2.B * 500, F2.L * 1000, F2.B * 1000, "HIDDEN"); }
      });
    });
    var off = 0.035 * S_;
    braced.forEach(function (bi) {
      var x0 = bi * bay, x1 = x0 + bay;
      [[-off, -2 * off], [S_ + off, S_ + 2 * off]].forEach(function (p) {
        gp.line(x0, p[0], x1, p[1], "STEEL"); gp.line(x0, p[1], x1, p[0], "STEEL");
      });
      gp.text((x0 + x1) / 2, -2.6 * off, "WB", 2.2, { anchor: "middle" });
    });
    if (D.TB) for (k = 0; k < G.n_bays; k++) [0, S_].forEach(function (yy) { gp.line(k * bay + D.FD1.Lped * 500, yy, (k + 1) * bay - D.FD1.Lped * 500, yy, "HIDDEN"); });
    for (k = 0; k < G.n_bays; k++) gp.dim(k * bay, S_ + 0.1 * S_, (k + 1) * bay, S_ + 0.1 * S_, -4);
    gp.dim(0, S_ + 0.1 * S_, L_, S_ + 0.1 * S_, -12, "LENGTH " + fc0(L_));
    gp.dim(L_ + 0.06 * L_, 0, L_ + 0.06 * L_, S_, -8, "SPAN " + fc0(S_));
    gp.text(L_ / 2, S_ / 2, "C1 " + FR.colName + "  ·  F1 " + f2(D.FD1.ftg.L) + "×" + f2(D.FD1.ftg.B) + " m" + (D.FD2 ? "  ·  GC " + D.GA.name + "  ·  F2 " + f2(D.FD2.ftg.L) + " m sq" : ""), 2.4, { anchor: "middle" });
    sheets.push(new Sheet("Steel shed – general arrangement", "SH-01", [gp],
      [G.style + "; " + C.pystr(G.n_bays) + " bays @ " + fc0(bay) + " = " + fc0(L_) + " mm; span " + fc0(S_) + " mm.",
        "WB = wall bracing (" + inp.bracing + ") in bays " + braced.map(function (b) { return (b + 1) + "–" + (b + 2); }).join(", ") + "; same bays carry roof bracing.",
        "Dashed squares = footings F1" + (D.FD2 ? " / F2" : "") + "; dashed lines between columns = plinth / tie beams" + (D.TB ? "" : " (not provided)") + ".",
        "Column orientation: web in the plane of the frame (major axis resists frame moments)."]));

    /* ---------------- S-02 cross-section */
    var v = new View("Typical frame – cross section");
    v.line(-0.1 * S_, 0, 1.1 * S_, 0, "SOIL"); v.text(1.1 * S_, 60, "GL ±0.000", 2.2, { anchor: "end" });
    var hcT = G.kind === "peb" ? FR.cp.d : col.h, hcB = G.kind === "peb" ? FR.cp.d2 : col.h;
    v.poly([[-hcB, 0], [0, 0], [0, H_], [-hcT, H_]], true, "STEEL", "steel");
    v.poly([[S_, 0], [S_ + hcB, 0], [S_ + hcT, H2], [S_, H2]], true, "STEEL", "steel");
    if (G.kind === "truss") {
      var f = FR.truss.A.model.f;
      f.members.forEach(function (mm, i) { if (mm.kind !== "truss") return; var p1 = f.nodes[mm.i], p2 = f.nodes[mm.j]; v.line(p1[0] * 1000, p1[1] * 1000, p2[0] * 1000, p2[1] * 1000, "STEEL"); });
      Object.keys(FR.truss.des).forEach(function (gn) {
        var d = FR.truss.des[gn], m = d.fr.ids[Math.floor(d.fr.ids.length / 2)], mm = f.members[m], p1 = f.nodes[mm.i], p2 = f.nodes[mm.j];
        v.text((p1[0] + p2[0]) * 500, (p1[1] + p2[1]) * 500 + 0.012 * S_, d.label, 2.0, { anchor: "middle" });
      });
    } else {
      var drw = function (x0, x1, y0, y1, d0, d1) { var c0 = Math.cos(Math.atan2(y1 - y0, x1 - x0)); v.poly([[x0, y0], [x1, y1], [x1, y1 + d1 / c0], [x0, y0 + d0 / c0]], true, "STEEL", "steel"); };
      var dk = G.kind === "peb" ? FR.rp.d : raf.h, da = G.kind === "peb" ? FR.rp.d2 : raf.h;
      if (G.kind === "mono") drw(0, S_, H_ - dk, H2 - dk, dk, dk);
      else {
        var xt = G.kind === "peb" ? 0.4 * S_ / 2 : 0;
        if (G.kind === "peb") { drw(0, xt, H_ - dk, roofY(xt) - dk, dk, da); drw(xt, S_ / 2, roofY(xt) - da, R_ - da, da, da); drw(S_ / 2, S_ - xt, R_ - da, roofY(S_ - xt) - da, da, da); drw(S_ - xt, S_, roofY(S_ - xt) - da, H_ - dk, da, dk); }
        else { drw(0, S_ / 2, H_ - raf.h, R_ - raf.h, raf.h, raf.h); drw(S_ / 2, S_, R_ - raf.h, H_ - raf.h, raf.h, raf.h); }
      }
      if (FR.haunch) {
        var Lhx = FR.Lh * 1000 * Math.cos(th);
        [[0, 1], [S_, -1]].forEach(function (q) { if (G.kind === "mono" && q[0] === S_) { v.poly([[S_, H2 - raf.h], [S_, H2 - 2 * raf.h], [S_ - Lhx, H2 - raf.h - Lhx * Math.tan(th)]], true, "STEEL", "steel"); return; }
          v.poly([[q[0], H_ - raf.h], [q[0], H_ - 2 * raf.h], [q[0] + q[1] * Lhx, roofY(q[0] + q[1] * Lhx) - raf.h]], true, "STEEL", "steel"); });
        v.text(Lhx, H_ - 2.6 * raf.h, "HAUNCH " + fc0(FR.Lh * 1000) + " LONG", 2.0);
      }
    }
    for (k = 0; k < G.n_purl; k++) {
      var t = k / Math.max(G.n_purl - 1, 1);
      (G.kind === "mono" ? [0] : [0, S_]).forEach(function (x0) {
        var xx = G.kind === "mono" ? S_ * t : x0 + (S_ / 2 - x0) * t;
        v.rect(xx - 40, roofY(xx) + 20, 80, (D.PUR.P1.sec.h || 100), "STEEL");
      });
    }
    var gl = [];
    for (k = 0; k < G.rowsL; k++) gl.push([-hcT - 120, 300 + k * G.gsp * 1000]);
    for (k = 0; k < G.rowsR; k++) gl.push([S_ + hcT + 20, 300 + k * G.gsp * 1000]);
    gl.forEach(function (p) { v.rect(p[0], p[1], 100, 60, "STEEL"); });
    if (D.CR) {
      var rh = D.CR.rail_h * 1000, e = D.CR.e * 1000, gi = D.CR.gp.I.h;
      [[0, 1], [S_, -1]].forEach(function (q) {
        v.poly([[q[0], rh - D.CR.br.d], [q[0] + q[1] * (e + 150), rh], [q[0], rh]], true, "STEEL", "steel");
        v.rect(q[0] + q[1] * e - 100, rh, 200, gi, "STEEL", "steel");
      });
      v.text(e, rh + gi + 150, "GANTRY " + D.CR.gi + " + " + D.CR.gch, 2.0);
      v.dim(S_ + 0.06 * S_, 0, S_ + 0.06 * S_, rh, -6, "RAIL +" + fc0(rh));
    }
    var F1 = D.FD1;
    [0, S_].forEach(function (xx) {
      v.rect(xx - F1.Lped * 500, -F1.hped * 1000 + F1.plinth * 1000, F1.Lped * 1000, F1.hped * 1000, "CONCRETE", "concrete");
      v.rect(xx - F1.ftg.L * 500, -F1.df * 1000, F1.ftg.L * 1000, F1.ftg.D, "CONCRETE", "concrete");
    });
    v.dim(0, -F1.df * 1000 - 300, S_, -F1.df * 1000 - 300, 8, "SPAN " + fc0(S_));
    v.dim(-hcT, 0, -hcT, H_, 12, "EAVE +" + fc0(H_));
    v.dim(S_ + hcT, 0, S_ + hcT, G.kind === "mono" ? H2 : R_, -14, (G.kind === "mono" ? "HIGH EAVE +" : "RIDGE +") + fc0(G.kind === "mono" ? H2 : R_));
    v.text(-hcT - 0.05 * S_, H_ / 2, "COLUMN " + FR.colName, 2.4, { anchor: "middle", rot: 90 });
    if (G.kind !== "truss") v.text(S_ / 4, roofY(S_ / 4) + 0.04 * S_, "RAFTER " + FR.rafName, 2.4, { anchor: "middle", rot: G.kind === "mono" ? G.slope : G.slope });
    v.text(S_ / 2, Math.max(R_, H2) + 0.08 * S_, "SLOPE " + f1(G.slope) + "°; PURLINS " + D.PUR.name + " @ " + fc0(G.ps * 1000) + "; GIRTS " + (D.GI ? D.GI.name : "–"), 2.2, { anchor: "middle" });
    var views2 = [v];
    if (G.kind !== "truss") {
      var A = FR.A, gov = null, gv = -1;
      Object.keys(A.res).forEach(function (kk) { var mv = maxOf(A.model.mem.colL.concat(A.model.mem.rafL).map(function (m) { return A.res[kk].extremes(m, 9).M_abs; })); if (mv > gv) { gv = mv; gov = kk; } });
      var bv_ = CM.frame_bmd_view(A.model.f, A.res[gov], "Bending moment – " + gov + " (kN·m)", { labels: false });
      var mm_ = A.model.mem, lab = [[mm_.colL[mm_.colL.length - 1], true], [mm_.rafL[mm_.rafL.length - 1], true], [mm_.colR.length ? mm_.colR[0] : null, false]];
      lab.forEach(function (q) {
        if (q[0] == null) return;
        var d_ = A.res[gov].diagram(q[0], 2), Mv = q[1] ? d_[1][3] : d_[0][3], mm = A.model.f.members[q[0]], p = A.model.f.nodes[q[1] ? mm.j : mm.i];
        bv_.text(p[0] * 1000, p[1] * 1000 + 0.05 * S_, F(Mv, ".1f"), 2.4, { layer: "DIAGRAM", anchor: "middle" });
      });
      views2.push(bv_);
    } else {
      var TRd = FR.truss;
      views2.push(DR.table_view("Truss member design", ["Group", "Section", "T kN", "C kN", "Bolts"], Object.keys(TRd.des).map(function (gn) { var d = TRd.des[gn], j = D.TJ[gn]; return [gn, d.label, f1(d.fr.T), f1(d.fr.C), j ? j.nb + "-M" + g(j.d) : ""]; }), [34, 50, 18, 18, 20]));
    }
    sheets.push(new Sheet("Steel shed – frame elevation & member sizes", "SH-02", views2,
      ["Steel " + inp.steel + "; main bolts gr " + inp.bolt_grade_main + " (IS 1367 / IS 3757), secondary gr 4.6.",
        "Design wind: " + inp.city + " Vb " + g(D.W.Vb) + " m/s, terrain " + C.pystr(inp.terrain) + ", k1 " + g(num(inp.k1)) + ", k3 " + g(num(inp.k3)) + ", k4 " + g(num(inp.k4)) + "; pd = " + F(D.W.pd, ".3f") + " kN/m².",
        "Roof LL " + F(D.L.qr, ".2f") + (D.L.dust > 0 ? " + dust " + F(D.L.dust, ".2f") : "") + " kN/m²; column base " + inp.base + ".",
        "Fly braces ISA 50x50x6 to rafter bottom flange at alternate purlins and to column inner flange at alternate girts."]));

    /* ---------------- S-03 side elevation */
    var se = new View("Side elevation – girts, eave strut & wall bracing (grid A)");
    se.line(-0.03 * L_, 0, 1.03 * L_, 0, "SOIL");
    for (k = 0; k < G.n_frames; k++) { se.rect(k * bay - col.b / 2, 0, col.b, H_, "STEEL", "steel"); se.text(k * bay, -0.03 * H_ - 200, String(k + 1), 2.5, { anchor: "middle" }); }
    se.line(0, H_, L_, H_, "STEEL"); se.text(L_ / 2, H_ + 120, "EAVE STRUT " + D.BR.es, 2.2, { anchor: "middle" });
    for (k = 0; k < (G.rowsL || G.rowsR); k++) { y = 300 + k * G.gsp * 1000; se.line(0, y, L_, y, "HIDDEN"); }
    var nt = D.BR.WB.ntier;
    braced.forEach(function (bi) {
      var x0 = bi * bay, x1 = x0 + bay;
      for (var tt = 0; tt < nt; tt++) {
        var y0 = H_ * tt / nt, y1 = H_ * (tt + 1) / nt;
        if (inp.bracing === BRACING[2]) { se.line(x0, y0, (x0 + x1) / 2, y1, "STEEL"); se.line(x1, y0, (x0 + x1) / 2, y1, "STEEL"); }
        else { se.line(x0, y0, x1, y1, "STEEL"); se.line(x0, y1, x1, y0, "STEEL"); }
        if (tt > 0) se.line(x0, y0, x1, y0, "STEEL");
      }
      se.text((x0 + x1) / 2, H_ / 2 + 200, "WB " + D.BR.WB.name, 2.0, { anchor: "middle" });
    });
    for (k = 0; k < G.n_bays; k++) se.dim(k * bay, 0, (k + 1) * bay, 0, 8);
    se.dim(-0.02 * L_, 0, -0.02 * L_, H_, 10, "EAVE +" + fc0(H_));
    if (G.rowsL || G.rowsR) se.dim(L_ + 0.02 * L_, 300, L_ + 0.02 * L_, 300 + G.gsp * 1000, -8, "GIRTS @ " + fc0(G.gsp * 1000));
    se.text(L_ / 2, -0.12 * H_ - 300, "GIRTS " + (D.GI ? D.GI.name : "none (open side)") + "; " + C.pystr(Math.max(G.rowsL, G.rowsR)) + " rows from +300", 2.2, { anchor: "middle" });
    sheets.push(new Sheet("Steel shed – side elevation", "SH-03", [se],
      ["Wall bracing " + D.BR.WB.name + " (" + inp.bracing + "), " + C.pystr(nt) + " tier(s), in braced bays at both ends" + (D.BR.nbr > 2 ? " and centre" : "") + ".",
        "Girts lapped / bolted to cleats on column outer flange; girt sag rods RD 12 at mid-span where span > 4.5 m.",
        "Bottom girt / sheeting rests on +300 plinth (brick dado optional)."]));

    /* ---------------- S-04 roof plan */
    var rp = new View("Roof plan – purlins, sag rods & roof bracing");
    rp.rect(0, 0, L_, S_, "OUTLINE");
    for (k = 0; k < G.n_frames; k++) rp.line(k * bay, 0, k * bay, S_, "STEEL");
    var pys = [];
    for (k = 0; k < G.n_purl; k++) {
      var tp = k / Math.max(G.n_purl - 1, 1);
      if (G.kind === "mono") pys.push(S_ * tp); else { pys.push(S_ / 2 * tp); pys.push(S_ - S_ / 2 * tp); }
    }
    pys.forEach(function (py) { rp.line(0, py, L_, py, "HIDDEN"); });
    if (G.kind !== "mono") rp.line(0, S_ / 2, L_, S_ / 2, "CENTER");
    if (D.PUR.sag) for (k = 0; k < G.n_bays; k++) for (var s2 = 1; s2 <= D.PUR.nsag; s2++) { x = (k + s2 / (D.PUR.nsag + 1)) * bay; rp.line(x, 0, x, S_, "THIN"); }
    var np = D.BR.RB.np;
    braced.forEach(function (bi) {
      var x0 = bi * bay, x1 = x0 + bay, segs = [];
      if (G.kind === "mono") for (k = 0; k < np; k++) segs.push([S_ * k / np, S_ * (k + 1) / np]);
      else for (k = 0; k < np; k++) { segs.push([S_ / 2 * k / np, S_ / 2 * (k + 1) / np]); segs.push([S_ - S_ / 2 * (k + 1) / np, S_ - S_ / 2 * k / np]); }
      segs.forEach(function (s) {
        if (inp.bracing === BRACING[2]) { var xm = (x0 + x1) / 2; rp.line(x0, s[0], xm, s[1], "STEEL"); rp.line(x1, s[0], xm, s[1], "STEEL"); }
        else { rp.line(x0, s[0], x1, s[1], "STEEL"); rp.line(x0, s[1], x1, s[0], "STEEL"); }
      });
    });
    rp.dim(0, S_, L_, S_, -10, C.pystr(G.n_bays) + " BAYS @ " + fc0(bay));
    rp.dim(L_, 0, L_, S_, -8, "SPAN " + fc0(S_));
    rp.text(L_ / 2, -0.08 * S_, "PURLINS " + D.PUR.name + (D.PUR.ename !== D.PUR.name ? " (edge zone " + D.PUR.ename + ")" : "") + " @ " + fc0(G.ps * 1000) + " ON SLOPE · RB " + D.BR.RB.name + " · SAG RODS " + (D.PUR.sag ? "M" + g(D.PUR.sag.d) : "none"), 2.2, { anchor: "middle" });
    sheets.push(new Sheet("Steel shed – roof framing plan", "SH-04", [rp],
      ["Dashed = purlins; thin lines = sag-rod lines (" + C.pystr(D.PUR.nsag) + " per bay); X / K = roof bracing in braced bays.",
        "Purlins " + (D.PUR.cont ? "continuous (lapped / sleeved over frames)" : "simply supported") + "; edge-zone width " + f2(D.W.y_edge) + " m (IS 875-3 Table 6 local).",
        "Roof sheeting " + g(num(inp.roof_sheet_t)) + " mm TCT fixed with self-drilling screws: every crest in edge zones, alternate crest elsewhere."]));

    /* ---------------- S-05 connection details */
    function plateView(title, P, rows, gauge, dB, note, extra) {
      var pv = new View(title), Bw = P.B, Lp = P.Lp;
      pv.rect(0, 0, Bw, Lp, "STEEL", "steel");
      rows.forEach(function (yy) { [Bw / 2 - gauge / 2, Bw / 2 + gauge / 2].forEach(function (xx) { pv.circle(xx, yy, hole(dB) / 2, "OUTLINE"); }); });
      if (extra) extra(pv);
      pv.dim(0, 0, Bw, 0, 8); pv.dim(Bw, 0, Bw, Lp, -8);
      pv.dim(Bw / 2 - gauge / 2, Lp, Bw / 2 + gauge / 2, Lp, -6, "g " + g(gauge));
      if (rows.length > 1) pv.dim(-20, rows[rows.length - 1], -20, rows[rows.length - 2], 6, "p " + g(Math.abs(rows[rows.length - 1] - rows[rows.length - 2])));
      note.split("; ").forEach(function (ln, i) { pv.text(Bw / 2, -0.16 * Lp - 0.1 * Lp * i, ln, 2.2, { anchor: "middle" }); });
      return pv;
    }
    var cv = [], cv2 = [];
    if (D.KN) {
      var K = D.KN, L0 = K.L, y0 = 20 + (L0.pf + L0.e);
      var rowsK = [];
      var ext = L0.Lp - 20 - K.D;
      rowsK.push(L0.Lp - (L0.Lp - 20 - K.D) + 0);
      var yTop = 20 + K.D - raf.tf / 2;
      var ys = [yTop + L0.pf + raf.tf / 2];
      for (k = 0; k < K.nr; k++) ys.push(yTop - raf.tf / 2 - L0.pf - k * L0.p);
      ys.push(20 + raf.tf + L0.pf); ys.push(20 + raf.tf + L0.pf + L0.p);
      void ext; void y0; void rowsK;
      ys = ys.map(function (y) { return y + (K.D + 900 - L0.Lp) * 0; });
      cv.push(plateView("Knee joint – end plate elevation", L0, ys.slice().sort(function (a, b) { return a - b; }), L0.g, K.d,
        K.nb + "-M" + g(K.d) + " gr " + inp.bolt_grade_main + "; EP " + g(L0.B) + "×" + g(L0.Lp) + "×" + g(K.t), function (pv) {
          pv.rect((L0.B - raf.b) / 2, 20, raf.b, raf.tf, "HIDDEN"); pv.rect((L0.B - raf.b) / 2, 20 + K.D - raf.tf, raf.b, raf.tf, "HIDDEN");
          pv.rect(L0.B / 2 - raf.tw / 2, 20 + raf.tf, raf.tw, K.D - 2 * raf.tf, "HIDDEN");
        }));
      var ks = new View("Knee joint – side view");
      var Hc = K.D + 900, yb = Hc - L0.Lp, x0 = col.h + K.t, yr0 = yb + 20, yr1 = yr0 + K.D, tn = Math.tan(th);
      ks.rect(0, 0, col.h, Hc, "STEEL", "steel");
      ks.line(col.tf, 0, col.tf, Hc, "HIDDEN"); ks.line(col.h - col.tf, 0, col.h - col.tf, Hc, "HIDDEN");
      ks.rect(col.h, yb, K.t, L0.Lp, "STEEL", "steel");
      var Lhd = FR.haunch ? FR.Lh * 1000 * Math.cos(th) : 0, Ld = Math.max(1.4 * Lhd, 1.6 * K.D);
      ks.line(x0, yr1, x0 + Ld, yr1 + Ld * tn, "STEEL");
      if (FR.haunch) { ks.line(x0, yr0, x0 + Lhd, yr1 + Lhd * tn - raf.h, "STEEL"); ks.line(x0 + Lhd, yr1 + Lhd * tn - raf.h, x0 + Ld, yr1 + Ld * tn - raf.h, "STEEL"); ks.line(x0, yr1 - raf.h, x0 + Lhd, yr1 + Lhd * tn - raf.h, "HIDDEN"); }
      else ks.line(x0, yr0, x0 + Ld, yr0 + Ld * tn, "STEEL");
      ks.line(x0 + Ld, yr1 + Ld * tn, x0 + Ld, yr1 + Ld * tn - raf.h, "CENTER");
      ys.forEach(function (yy) { ks.line(col.h - col.tf - 15, yb + yy, x0 + 25, yb + yy, "OUTLINE"); });
      [yr0 + raf.tf / 2, yr1 - raf.tf / 2].forEach(function (yy) { ks.rect(col.tf, yy - K.st.t / 2, col.h - 2 * col.tf, K.st.t, "STEEL", "steel"); });
      if (K.diag) ks.line(col.tf, yr0, col.h - col.tf, yr1, "STEEL");
      ks.dim(x0 + 40, yr0, x0 + 40, yr1, -6, "D " + g(K.D));
      ks.dim(col.h, yb, col.h, yb + L0.Lp, 10, "EP " + g(L0.Lp));
      if (FR.haunch) ks.dim(x0, yr0 - 60, x0 + Lhd, yr0 - 60, 6, "HAUNCH " + fc0(FR.Lh * 1000));
      ks.text(0, -0.1 * Hc, "STIFFENERS 4-" + g(K.st.b) + "×" + g(K.st.t) + (K.diag ? " + DIAGONAL PAIR " + g(K.diag.t) : ""), 2.0, { anchor: "start" });
      ks.text(0, -0.2 * Hc, "WELDS: FLANGES " + (K.butt ? "FPBW" : g(K.sf) + " mm") + ", WEB " + g(K.sw) + " mm (shop)", 2.0, { anchor: "start" });
      cv.push(ks);
    }
    if (D.AP) {
      var AP = D.AP, LA = AP.L, ya = [20 + raf.tf + LA.pf, 20 + raf.tf + LA.pf + LA.p, 20 + AP.D - raf.tf - LA.pf - LA.p, 20 + AP.D - raf.tf - LA.pf];
      cv2.push(plateView("Apex splice – end plate", LA, ya.sort(function (a, b) { return a - b; }), LA.g, AP.d, AP.nb + "-M" + g(AP.d) + " gr " + inp.bolt_grade_main + "; EP " + g(LA.B) + "×" + g(LA.Lp) + "×" + g(AP.t) + " (pair)"));
    }
    if (G.kind === "truss" && D.TJ) {
      var hv = new View("Truss heel joint – on column cap");
      hv.rect(0, 0, col.h, 800, "STEEL", "steel"); hv.rect(-30, 800, col.h + 60, 16, "STEEL", "steel");
      hv.rect(col.h / 2 - D.TJ.heel.L / 2, 816, D.TJ.heel.L, D.TJ.heel.B, "STEEL");
      hv.line(col.h / 2 - D.TJ.heel.L / 2, 816 + 60, col.h / 2 + D.TJ.heel.L / 2 + 800, 816 + 60, "STEEL");
      hv.line(col.h / 2 - D.TJ.heel.L / 2, 816 + 60, col.h / 2 + D.TJ.heel.L / 2 + 800, 816 + 60 + 800 * Math.tan(th) + D.TJ.heel.B * 0.6, "STEEL");
      [-1, 1].forEach(function (s) { hv.circle(col.h / 2 + s * col.h / 4, 808, 11, "OUTLINE"); });
      hv.text(col.h / 2, -120, "HEEL GUSSET " + g(D.TJ.heel.L) + "×" + g(D.TJ.heel.B) + "×" + g(D.TJ.tg) + "; 4-M20 TO CAP PL 16", 2.0, { anchor: "middle" });
      cv.push(hv);
    }
    var pc = new View("Purlin cleat");
    var ps_ = D.PUR.P1.sec, cl = section(D.CLP.ang);
    pc.rect(-ps_.b - 60, 0, ps_.b + cl.leg + 120, raf ? raf.tf : 12, "STEEL", "steel");
    var yb = raf ? raf.tf : 12;
    pc.poly([[0, yb], [cl.leg, yb], [cl.leg, yb + cl.t], [cl.t, yb + cl.t], [cl.t, yb + cl.leg], [0, yb + cl.leg]], true, "STEEL", "steel");
    pc.poly([[-ps_.tw, yb + 5], [-ps_.tw - ps_.b, yb + 5], [-ps_.tw - ps_.b, yb + 5 + ps_.tf], [-ps_.tw, yb + 5 + ps_.tf]], true, "STEEL");
    pc.rect(-ps_.tw, yb + 5, ps_.tw, ps_.h, "STEEL", "steel");
    pc.poly([[-ps_.tw, yb + 5 + ps_.h], [-ps_.tw - ps_.b, yb + 5 + ps_.h], [-ps_.tw - ps_.b, yb + 5 + ps_.h - ps_.tf], [-ps_.tw, yb + 5 + ps_.h - ps_.tf]], true, "STEEL");
    [yb + cl.leg * 0.35, yb + cl.leg * 0.75].forEach(function (yy) { pc.line(-ps_.tw - 30, yy, cl.t + 30, yy, "OUTLINE"); });
    pc.text(0, -60, D.CLP.n + "-M" + g(D.CLP.d) + " gr 4.6, " + D.CLP.ang + " × " + g(D.CLP.Lc) + ", 6 mm fillet", 2.0, { anchor: "middle" });
    cv2.push(pc);
    var RBm = D.BR.RB, gv2 = new View("Bracing end connection");
    if (RBm.kind === "rod") {
      gv2.rect(0, 0, 150, 100, "STEEL", "steel"); gv2.line(75, 50, 900, 50 + 400, "STEEL"); gv2.circle(75, 50, hole(RBm.d) / 2, "OUTLINE");
      gv2.text(75, -60, "RD " + g(RBm.d) + " WITH NUTS + BEVEL WASHER; TURNBUCKLE AT MID-LENGTH", 2.0, { anchor: "start" });
    } else {
      var Gs = RBm.gus;
      gv2.rect(0, 0, Gs.L, Gs.B, "STEEL", "steel");
      for (k = 0; k < RBm.nb; k++) gv2.circle(Gs.e + 40 + k * Gs.p, Gs.B / 2, hole(RBm.bd) / 2, "OUTLINE");
      gv2.rect(20, Gs.B / 2 - RBm.sec.leg / 2, Gs.L + 300, RBm.sec.leg, "HIDDEN");
      gv2.dim(0, 0, Gs.L, 0, 8); gv2.dim(Gs.L, 0, Gs.L, Gs.B, -8);
      gv2.text(Gs.L / 2, -0.4 * Gs.B, RBm.name + "; " + RBm.nb + "-M" + g(RBm.bd) + " gr 4.6; GUSSET " + g(Gs.t) + " THK", 2.0, { anchor: "middle" });
    }
    cv2.push(gv2);
    if (!cv.length) cv = cv2.splice(0, 1);
    sheets.push(new Sheet("Steel shed – " + (G.kind === "truss" ? "truss heel joint" : "knee joint details"), "SH-05", cv, ["Bolt holes d + 2 mm (d ≤ 24) / d + 3 mm (> 24) – IS 800 Table 19; pitch ≥ 2.5d, edge ≥ 1.5 d0 (machine-cut edges).",
        "HS bolts gr " + inp.bolt_grade_main + " snug-tight with hardened washers under nut; black bolts gr 4.6 with one washer.",
        "Shop welds E41 electrodes (IS 814), γmw 1.25; field welding avoided.",
        "Column stiffeners at rafter flange levels; fit tight to flanges, fillet all round."]));
    sheets.push(new Sheet("Steel shed – apex, purlin cleat & bracing details", "SH-06", cv2, ["Bolt holes d + 2 mm (d ≤ 24) / d + 3 mm (> 24) – IS 800 Table 19; pitch ≥ 2.5d, edge ≥ 1.5 d0 (machine-cut edges).",
        "HS bolts gr " + inp.bolt_grade_main + " snug-tight with hardened washers under nut; black bolts gr 4.6 with one washer.",
        "Shop welds E41 electrodes (IS 814), γmw 1.25; field welding avoided.",
        "Column stiffeners at rafter flange levels; fit tight to flanges, fillet all round."]));

    /* ---------------- S-06 base plate & anchors */
    var bp = D.BP1, bpp = new View("Base plate – plan (main column)");
    bpp.rect(0, 0, bp.Lp, bp.Bp, "STEEL", "steel");
    var cx = bp.Lp / 2, cy = bp.Bp / 2;
    bpp.rect(cx - col.h / 2, cy - col.b / 2, col.h, col.b, "HIDDEN");
    var bpts = [];
    if (bp.fixed) { var per2 = bp.n / 2; for (k = 0; k < per2; k++) { var yy2 = bp.eb + (bp.Bp - 2 * bp.eb) * (per2 > 1 ? k / (per2 - 1) : 0.5); bpts.push([bp.eb, yy2]); bpts.push([bp.Lp - bp.eb, yy2]); } }
    else [cx - col.h / 4, cx + col.h / 4].forEach(function (xx) { [cy - Math.max(col.b / 4, col.tw / 2 + 45), cy + Math.max(col.b / 4, col.tw / 2 + 45)].forEach(function (yy) { bpts.push([xx, yy]); }); });
    bpts.forEach(function (p) { bpp.circle(p[0], p[1], (bp.d + 6) / 2, "OUTLINE"); });
    bpp.dim(0, bp.Bp, bp.Lp, bp.Bp, -8); bpp.dim(bp.Lp, 0, bp.Lp, bp.Bp, -8);
    if (bpts.length > 1) bpp.dim(bpts[0][0], 0, bpts[bpts.length - 1][0], 0, 6);
    bpp.text(bp.Lp / 2, -0.45 * bp.Bp, "BP " + g(bp.Lp) + "×" + g(bp.Bp) + "×" + g(bp.tp), 2.2, { anchor: "middle" });
    bpp.text(bp.Lp / 2, -0.7 * bp.Bp, bp.n + "-M" + g(bp.d) + " ANCHORS, HOLES Ø" + g(bp.d + 6), 2.2, { anchor: "middle" });
    var bs = new View("Base plate & anchor bolt – section");
    var pw = Math.max(D.FD1.Lped * 1000, bp.Lp + 200), Le = bp.Le;
    bs.rect(-pw / 2, -Le - 200, pw, Le + 200, "CONCRETE", "concrete");
    bs.rect(-bp.Lp / 2 - 50, 0, bp.Lp + 100, bp.grout, "CONCRETE");
    bs.rect(-bp.Lp / 2, bp.grout, bp.Lp, bp.tp, "STEEL", "steel");
    bs.rect(-col.h / 2, bp.grout + bp.tp, col.h, 500, "STEEL", "steel");
    var bx = bp.fixed ? [-bp.Lp / 2 + bp.eb, bp.Lp / 2 - bp.eb] : [-col.h / 4, col.h / 4];
    bx.forEach(function (xx) {
      bs.rect(xx - bp.d / 2, -Le, bp.d, Le + bp.grout + bp.tp + 2 * nut_h(bp.d) + 40, "STEEL");
      bs.rect(xx - bp.bw / 2, -Le, bp.bw, bp.tw, "STEEL", "steel");
    });
    if (bp.key) bs.rect(-bp.key.t / 2, bp.grout - bp.key.d, bp.key.t, bp.key.d, "STEEL", "steel");
    bs.dim(pw / 2 + 60, -Le, pw / 2 + 60, 0, -8, "EMBED " + fc0(Le));
    bs.dim(-pw / 2 - 60, 0, -pw / 2 - 60, bp.grout, 8, "GROUT " + g(bp.grout));
    bs.text(0, -Le - 0.12 * Le, "M" + g(bp.d) + " × " + g(bp.Ltot) + " gr 4.6 (IS 5624), ANCHOR PL " + g(bp.bw) + "×" + g(bp.bw) + "×" + g(bp.tw), 2.0, { anchor: "middle" });
    if (bp.key) bs.text(0, -Le - 0.24 * Le, "SHEAR KEY " + g(bp.key.b) + "×" + g(bp.key.d) + "×" + g(bp.key.t), 2.0, { anchor: "middle" });
    var v6 = [bpp, bs];
    if (D.BP2) {
      var b2 = D.BP2, g2 = new View("Base plate – gable column");
      g2.rect(0, 0, b2.Lp, b2.Bp, "STEEL", "steel"); g2.rect((b2.Lp - D.GA.sec.h) / 2, (b2.Bp - D.GA.sec.b) / 2, D.GA.sec.h, D.GA.sec.b, "HIDDEN");
      [b2.Lp / 2 - D.GA.sec.h / 4, b2.Lp / 2 + D.GA.sec.h / 4].forEach(function (xx) { [b2.Bp / 2 - 50, b2.Bp / 2 + 50].forEach(function (yy) { g2.circle(xx, yy, (b2.d + 6) / 2, "OUTLINE"); }); });
      g2.dim(0, b2.Bp, b2.Lp, b2.Bp, -8); g2.dim(b2.Lp, 0, b2.Lp, b2.Bp, -8);
      g2.text(b2.Lp / 2, -0.3 * b2.Bp, "BP " + g(b2.Lp) + "×" + g(b2.Bp) + "×" + g(b2.tp) + "; " + b2.n + "-M" + g(b2.d), 2.2, { anchor: "middle" });
      v6.push(g2);
    }
    sheets.push(new Sheet("Steel shed – base plates & anchor bolts", "SH-07", v6,
      ["Anchor bolts set with templates; projection above pedestal top = grout + plate + washer + 2 nuts + 3 threads.",
        "Grout " + g(bp.grout) + " mm non-shrink (≥ M30 equivalent) after alignment; levelling nuts removed or backed off.",
        "Anchor plates welded / nutted at the bottom of each bolt; keep ≥ 50 mm above footing top mat.",
        bp.key ? "Shear key pocket 50 mm larger than key all round, grouted with the base." : "Horizontal reaction by friction (μ = 0.45) – no shear key required."]));

    /* ---------------- S-07 foundation */
    var fv = [];
    [D.FD1, D.FD2].forEach(function (F) {
      if (!F) return;
      CM.footing_views(F.ftg.L, F.ftg.B, F.ftg.D, F.Bped * 1000, F.Lped * 1000, F.ftg, F.cover, F.df, 0.10, F.plinth, "Footing " + F.mark).forEach(function (w) { fv.push(w); });
      var pv2 = new View("Pedestal " + F.mark + " – section");
      var Lq = F.Lped * 1000, Bq = F.Bped * 1000, c2 = F.covP + F.tie.d;
      pv2.rect(0, 0, Lq, Bq, "OUTLINE", "concrete");
      pv2.rect(F.covP, F.covP, Lq - 2 * F.covP, Bq - 2 * F.covP, "REBAR");
      var nb2 = F.vbars.n, per = [], nx = Math.max(2, Math.round(nb2 / 4) + 1), ny = Math.max(2, nb2 / 2 - nx + 2);
      for (k = 0; k < nx; k++) { per.push([c2 + (Lq - 2 * c2) * k / (nx - 1), c2]); per.push([c2 + (Lq - 2 * c2) * k / (nx - 1), Bq - c2]); }
      for (k = 1; k < ny - 1; k++) { per.push([c2, c2 + (Bq - 2 * c2) * k / (ny - 1)]); per.push([Lq - c2, c2 + (Bq - 2 * c2) * k / (ny - 1)]); }
      per.forEach(function (p) { pv2.bar_dot(p[0], p[1], F.vbars.d); });
      pv2.dim(0, 0, Lq, 0, 8); pv2.dim(Lq, 0, Lq, Bq, -8);
      pv2.text(Lq / 2, -0.6 * Bq, C.pystr(F.vbars.n) + "-" + g(F.vbars.d) + "Ø + " + g(F.tie.d) + "Ø TIES @ " + g(F.tie.s), 2.2, { anchor: "middle" });
      fv.push(pv2);
    });
    if (D.TB) fv.push(CM.stirrup_section_view(D.TB.b * 1000, D.TB.D * 1000, 40, [2, D.TB.d], [2, D.TB.d], [2, 8, 150], "Plinth / tie beam section"));
    sheets.push(new Sheet("Steel shed – foundation details", "SH-08", fv,
      ["Concrete M" + g(D.FD1.fck) + ", Fe500 TMT; cover footing " + g(D.FD1.cover) + " / pedestal " + g(D.FD1.covP) + " mm; PCC 1:4:8 100 thk below footings.",
        "Allowable SBC " + f0(D.FD1.sbc) + " kN/m²" + (D.ctx.site === "mine" ? " (mine-area site factor applied)" : "") + " – confirm by geotechnical investigation.",
        "Footing size governed by bearing / uplift / overturning / sliding (IS 456 cl 20) – see calculation.",
        "Pedestal vertical bars with 300 mm L-foot resting on footing mat; 3 extra ties @ 75 in anchor zone."]));

    /* ---------------- BOM sheets */
    function tableSheets(title, num0, header, rows, widths, notes) {
      var out = [];
      for (var i = 0; i < Math.max(rows.length, 1); i += 28) out.push(new Sheet(title, num0 + (i ? "-" + C.pystr(i / 28 + 1) : ""), [DR.table_view(title, header, rows.slice(i, i + 28), widths)], notes || []));
      return out;
    }
    var mr = B.mem.map(function (m) { return [m.mark, m.desc, m.sec, F(m.L, ".3f"), m.nos, F(m.kgm, ".2f"), F(memKg(m), ",.1f")]; });
    mr.push(["", "TOTAL", "", "", "", "", F(sumOf(B.mem.map(memKg)), ",.1f")]);
    tableSheets("Member schedule", "BOM-01", ["Mark", "Description", "Section", "L m", "Nos", "kg/m", "Total kg"], mr, [12, 92, 46, 18, 14, 18, 26],
      ["Lengths are centre-line / cut lengths; add 2–3 % for cutting wastage in procurement."]).forEach(function (s) { sheets.push(s); });
    var pr = B.pl.map(function (p) { return [p.mark, p.desc, g(p.L) + "×" + g(p.B) + "×" + g(p.t), p.nos, F(plKg(p) / p.nos, ".2f"), F(plKg(p), ",.1f")]; });
    pr.push(["", "TOTAL", "", "", "", F(sumOf(B.pl.map(plKg)), ",.1f")]);
    tableSheets("Plate schedule", "BOM-02", ["Mark", "Description", "L × B × t mm", "Nos", "kg each", "Total kg"], pr, [14, 100, 46, 16, 22, 26]).forEach(function (s) { sheets.push(s); });
    var br_ = B.bo.map(function (b) { return [b.loc, b.nos ? "M" + g(b.d) + " × " + g(b.L) : "M" + g(b.d) + " rod", b.grade, b.std, b.nos || "-", (b.nuts) + " nut / " + (b.washers) + " wsh" + (b.turnbuckles ? " / TB " + b.turnbuckles : "")]; });
    br_.push(["TOTAL BOLTS", "", "", "", sumOf(B.bo.map(function (b) { return b.nos; })), ""]);
    tableSheets("Bolt schedule", "BOM-03", ["Location", "Bolt dia × length", "Grade", "Standard", "Nos", "Nuts / washers per bolt"], br_, [80, 28, 12, 52, 14, 32]).forEach(function (s) { sheets.push(s); });
    var ar = B.an.map(function (a) { return [a.loc, "M" + g(a.d) + " × " + g(a.L), a.grade, g(a.Le), a.nos, a.plate, F(anKg(a), ",.1f")]; });
    var wr = B.we.map(function (w) { return [w.loc, typeof w.size === "number" ? g(w.size) + " mm" : w.size, g(w.L), w.nos, F(w.L * w.nos / 1000, ",.1f"), w.type]; });
    wr.push(["TOTAL WELD LENGTH", "", "", "", F(sumOf(B.we.map(function (w) { return w.L * w.nos / 1000; })), ",.1f"), ""]);
    var shr = B.sh.map(function (s) { return [s[0], s[1], F(s[2], ",.2f")]; });
    sheets.push(new Sheet("Anchor bolt & sheeting schedules", "BOM-04", [DR.table_view("Anchor bolt schedule", ["Location", "Bolt", "Grade", "Embed mm", "Nos", "Anchor plate", "kg"], ar, [64, 28, 48, 16, 12, 30, 20]),
      DR.table_view("Sheeting & accessories", ["Item", "Unit", "Quantity"], shr, [170, 20, 30])], ["Anchor bolts: 3 nuts (2 top incl. lock nut + 1 bottom) and 1 plate washer each."]));
    tableSheets("Weld schedule", "BOM-05", ["Location", "Size", "L / joint mm", "Joints", "Total m", "Type"], wr, [104, 18, 22, 16, 22, 44], ["FPBW = full-penetration butt weld. Fillet sizes are leg lengths (IS 800 cl 10.5.3)."]).forEach(function (s) { sheets.push(s); });
    return sheets;
  };

  /* =========================================================================== run */
  function reactions(A, nodes, which) {
    var out = [];
    Object.keys(which).forEach(function (k) { nodes.forEach(function (n, i) { var r = which[k].reactions[n]; out.push({ name: k + (i ? " (right)" : " (left)"), P: r[1], H: r[0], M: r[2] }); }); });
    return out;
  }
  M.run = function (inp, mode) {
    var ctx = Object.assign({}, C.CTX_DEFAULT, C.ctx || {});
    var c = new Calc("Complete steel shed – footing to roof");
    var fyu = MT.STEEL_GRADES[inp.steel], fy = fyu[0], fu = fyu[1];
    c.section("Basis of design");
    c.info("Codes", "IS 800:2007 (LSM), IS 875 Parts 1–3:2015, IS 1893-1:2016 (check), IS 456:2000, IS 1367 / IS 1364 bolts, IS 5624 anchors, IS 2062 steel", "");
    c.let("Partial safety factors", "γm", "γm0 = 1.10, γm1 = 1.25, γmb = 1.25, γmw = 1.25 shop / 1.50 field", "", "IS 800 Table 5");
    c.let("Steel", "fy / fu", g(fy) + " / " + g(fu), "N/mm²", "IS 2062 " + inp.steel);
    c.info("Site context", ctx.site === "mine" ? "MINE AREA (e.g. SECL Korba / Gevra): coal-dust load (via services) and SBC factor from the site profile, M30 & 50 mm cover, heavy-duty painting, blast vibration to be checked"
      : "General site", "Run context");
    var ovr = {};
    if (mode === "design") {
      var s0 = new Calc("s"), G0 = M.geometry(s0, inp), al = M.sheet_allow(inp, M.loads(s0, inp, G0, ctx), M.wind(s0, inp, G0, ctx));
      ovr = { ps: Math.min(num(inp.purlin_spacing), al.roof), gs: Math.min(num(inp.girt_spacing), al.wall) };
    }
    var G = M.geometry(c, inp, ovr);
    if (ovr.ps && ovr.ps < num(inp.purlin_spacing)) c.info("Purlin spacing limited by sheet span", "max. spacing reduced from " + g(num(inp.purlin_spacing)) + " to " + g(ovr.ps) + " m (sheet load-span table)", "Manufacturer");
    var L = M.loads(c, inp, G, ctx);
    var W = M.wind(c, inp, G, ctx);
    var SH = M.sheeting(c, inp, G, L, W);
    var PUR = M.purlins(c, inp, G, L, W, mode);
    var GI = G.rowsL + G.rowsR > 0 ? M.girts(c, inp, G, L, W, mode, G.bay, "side walls", "G1") : null;
    var CR = inp.crane ? M.crane(c, inp, G, fy, fu, mode) : null;
    var FR = M.design_frame(c, inp, G, L, W, PUR, CR, mode);
    FR.kind_peb = G.kind === "peb";
    FR.record();
    var A = FR.A;
    c.section("Serviceability (IS 800 Table 6)");
    c.check(G.kind === "truss" ? "Truss vertical deflection (LL) ≤ span/240" : "Rafter vertical deflection (LL + dust) ≤ span/180", A.v, FR.lim_v, { unit: "mm", clause: "IS 800 Table 6" });
    c.check("Eave lateral sway (service WL) ≤ h/150" + (G.kind === "mono" ? " (high-side sway scaled by h/h2)" : ""), A.sway, FR.lim_s, { unit: "mm", clause: "IS 800 Table 6" });
    if (CR) c.check("Lateral deflection at rail level (crane surge) ≤ h/400", A.csway, FR.lim_c, { unit: "mm", clause: "IS 800 Table 6 (cab-operated crane)" });
    M.seismic(c, inp, G, L, FR, W);
    var KN = null, AP = null, TJ = null, BT = null;
    if (G.kind !== "truss") {
      KN = M.knee(c, inp, G, FR, fy, fu, mode);
      if (G.kind !== "mono") AP = M.apex(c, inp, G, FR, fy, fu, mode);
    } else {
      TJ = M.truss_joints(c, G, FR.truss, fy, fu);
      c.section("Bottom-chord longitudinal ties");
      var Cb = FR.truss.des["Bottom chord"].fr.C;
      var Ft = c.calc("Restraint force (2.5 % of max. bottom-chord compression)", "Ft", "0.025*C", "kN", "Practice (restraint force 2.5 %)", { C: R(Cb, 3) });
      var btn = firstOk(ANG, function (n) { return G.bay * 1000 / section(n).rvv <= 400 && section(n).A * fy / GM0 / 1000 >= 1.5 * Ft; }) || last(ANG);
      c.check("Tie slenderness L/rvv ≤ 400 (tension tie, compression taken by bottom-chord bracing in end bays)", G.bay * 1000 / section(btn).rvv, 400, { clause: "IS 800 Table 3" });
      BT = { name: btn, lines: Math.max(1, Math.ceil(G.span / 6) - 1) };
      c.let("Bottom-chord ties", "", C.pystr(BT.lines) + " lines of " + btn + " (alternate bottom-chord nodes, tied to end bracing)", "");
    }
    var CLP = M.cleat(c, "Purlin", PUR.P1, Math.max(PUR.P1.R_g, PUR.P1.R_u, PUR.P2.R_u), PUR.P1.wt * G.bay / (PUR.nsag + 1) * 1.25, fu);
    var CLG = GI ? M.cleat(c, "Girt", GI, Math.max(GI.R_g, GI.R_u), GI.wt * G.bay / (GI.nsag + 1) * 1.25, fu) : null;
    var BR = M.bracing(c, inp, G, W, CR, fy, fu, mode);
    var GA = M.gable(c, inp, G, L, W, PUR, fy, fu, mode);
    // base plates
    var nodes = [A.model.nd.bl, A.model.nd.br];
    var comb = reactions(A, nodes, A.res);
    var given1 = mode === "check" && num(inp.bp_t) > 0 ? { d: num(inp.anchor_d), n: Math.trunc(num(inp.n_anchor)), L: num(inp.bp_L), B: num(inp.bp_B), t: num(inp.bp_t) } : null;
    var BP1 = M.base_plate(c, "main column (" + (G.fixed ? "fixed" : "pinned") + ")", FR.col, comb, G.fixed, Math.max(num(inp.fck), ctx.site === "mine" ? 30 : 0), fy, fu, given1, null);
    var BP2 = GA ? M.base_plate(c, "gable column (pinned)", GA.sec, [{ name: "gable", P: GA.P, H: GA.Vb, M: 0 }, { name: "gable uplift", P: -(GA.U || 0), H: GA.Vb, M: 0 }], false, Math.max(num(inp.fck), ctx.site === "mine" ? 30 : 0), fy, fu, null, null) : null;
    // foundation reactions
    var srv = A.sres, Ps = 0, PDL = 1e9, Uw = 0, Hs = 0, Ms = 0, winds = [], HDL = 0, MDL = 0;
    nodes.forEach(function (n) {
      Ps = Math.max(Ps, srv["DL+LL"].reactions[n][1]);
      if (CR) Object.keys(srv).forEach(function (k) { if (/^DL\+LL\+CL/.test(k)) Ps = Math.max(Ps, srv[k].reactions[n][1]); });
      PDL = Math.min(PDL, srv.DL.reactions[n][1]);
      HDL = Math.max(HDL, Math.abs(srv.DL.reactions[n][0])); MDL = Math.max(MDL, Math.abs(srv.DL.reactions[n][2]));
      Object.keys(W.cases).forEach(function (wn) {
        var r = srv[wn].reactions[n], rd = srv["DL+" + wn].reactions[n];
        var r0 = srv.DL.reactions[n];
        winds.push({ name: wn + (n === nodes[0] ? " L" : " R"), V: -r[1], H: r[0], M: r[2], HDL: r0[0], MDL: r0[2], PDL: r0[1] });
        Uw = Math.max(Uw, -rd[1]); Hs = Math.max(Hs, Math.abs(rd[0])); Ms = Math.max(Ms, Math.abs(rd[2]));
      });
      Hs = Math.max(Hs, Math.abs(srv["DL+LL"].reactions[n][0])); Ms = Math.max(Ms, Math.abs(srv["DL+LL"].reactions[n][2]));
    });
    var svc = [];
    nodes.forEach(function (n, i) {
      var side = i ? " R" : " L";
      Object.keys(srv).forEach(function (k) {
        if (k === "DL+LL" || /^DL\+LL\+CL/.test(k)) svc.push({ name: k + side, P: srv[k].reactions[n][1], H: srv[k].reactions[n][0], M: srv[k].reactions[n][2], wind: false });
        else if (/^DL\+WL/.test(k)) svc.push({ name: k + side, P: srv[k].reactions[n][1], H: srv[k].reactions[n][0], M: srv[k].reactions[n][2], wind: true });
      });
    });
    var RX1 = { svc: svc, Ps: Ps, PDL: PDL, Pu: BP1.Pmax, Uu: BP1.Umax, Hu: BP1.Hmax, Mu: BP1.Mmax, Hs: Hs, Ms: Ms, winds: winds, HDL: HDL, MDL: MDL, Uw: Uw };
    var FD1 = M.foundation(c, inp, G, "main column footing", "F1", ctx, RX1, BP1, 2 * G.n_frames, mode);
    FD1.Pu = BP1.Pmax;
    var FD2 = null;
    if (GA) {
      var Psg = GA.P / 1.5, Ug = (GA.U || 0) / 1.5;
      FD2 = M.foundation(c, inp, G, "gable column footing", "F2", ctx, { svc: [{ name: "DL+LL", P: Psg, H: 0, M: 0, wind: false }, { name: "DL+WL", P: 0.5 * Psg - Ug, H: GA.Vb / 1.5, M: 0, wind: true }], Ps: Psg, PDL: 0.5 * Psg, Pu: GA.P, Uu: GA.U || 0, Hu: GA.Vb, Mu: 0, Hs: GA.Vb / 1.5, Ms: 0, winds: [{ name: "WL on gable", V: Ug, H: GA.Vb / 1.5, M: 0 }], HDL: 0, MDL: 0, Uw: Math.max(Ug - 0.5 * Psg, 0) }, BP2, 2 * GA.n, "design");
    }
    var TB = M.tie_beam(c, inp, G, FD1, ctx);
    var bbs = FD1.bbs.concat(FD2 ? FD2.bbs : []);
    if (TB) {
      var BBt = DS.bbs, LdT = BBt.Ld(TB.d, num(inp.fck) || 25, 500);
      var tl = BBt.stock({ cut: Math.round(TB.Llong * 1000 + 2 * LdT) / 1000, f: "clear " + Math.round(TB.Llong * 1000) + " + 2×Ld " + LdT + " into pedestals = " + Math.round(TB.Llong * 1000 + 2 * LdT) + " mm" }, TB.d, num(inp.fck) || 25, 500);
      var st = BBt.stirrup(8, TB.b * 1000, TB.D * 1000, 40);
      bbs.push(BBt.row("Tie beam", "TB-1", TB.d, "straight, Ld into pedestals", TB.n * TB.nlong, tl, "main bars"));
      bbs.push(BBt.row("Tie beam", "TB-2", 8, "closed stirrup, 135° hooks", BBt.count(TB.Llong * 1000, 150, 50) * TB.nlong, st, "@ 150 c/c"));
      if (TB.ngab) {
        var tg = BBt.stock({ cut: Math.round(TB.Lgab * 1000 + 2 * LdT) / 1000, f: "clear " + Math.round(TB.Lgab * 1000) + " + 2×Ld " + LdT + " = " + Math.round(TB.Lgab * 1000 + 2 * LdT) + " mm" }, TB.d, num(inp.fck) || 25, 500);
        bbs.push(BBt.row("Tie beam (gable)", "TB-3", TB.d, "straight, Ld into pedestals", TB.n * TB.ngab, tg, "main bars"));
        bbs.push(BBt.row("Tie beam (gable)", "TB-4", 8, "closed stirrup, 135° hooks", BBt.count(TB.Lgab * 1000, 150, 50) * TB.ngab, st, "@ 150 c/c"));
      }
    }
    var Dd = { SH: SH, G: G, L: L, W: W, PUR: PUR, GI: GI, CR: CR, FR: FR, KN: KN, AP: AP, TJ: TJ, BT: BT, CLP: CLP, CLG: CLG, BR: BR, GA: GA, BP1: BP1, BP2: BP2, FD1: FD1, FD2: FD2, TB: TB, bbs: bbs, inp: inp, ctx: ctx };
    var B = M.bom(Dd);
    var q = M.quantities(Dd, B);
    var sheets = M.drawings(Dd, B);
    // ---------------- totals, thumbs, missing
    var kgMain = sumOf(B.mem.filter(function (m) { return m.cat === "main"; }).map(memKg)), kgSec = sumOf(B.mem.filter(function (m) { return m.cat !== "main"; }).map(memKg));
    var kgPl = sumOf(B.pl.map(plKg)), kgAn = sumOf(B.an.map(anKg)), nBolt = sumOf(B.bo.map(function (b) { return b.nos; }));
    var kgBolt = sumOf(B.bo.map(function (b) { return b.nos * b.kg; }));
    var tot = kgMain + kgSec + kgPl, area = G.area;
    c.section("Steel take-off & thumb rules");
    c.calc("Total structural steel (members + plates, excl. bolts & anchors)", "Ws", "main + sec + plates", "kg", "Bill of materials", { main: R(kgMain, 1), sec: R(kgSec, 1), plates: R(kgPl, 1) });
    var kgm2 = c.calc("Steel consumption", "ws", "Ws/A", "kg/m²", "", { Ws: R(tot, 1), A: R(area, 2) });
    var base = C.interp(G.span, [10, 15, 20, 30, 40], [22, 25, 30, 42, 50]);
    var fac = G.kind === "peb" ? 0.75 : G.kind === "truss" ? 0.8 : 1.0;
    var girtT = (inp.clad_walls ? 2 * (G.length + G.span) * G.eave : 0) / area * (PUR.P1.sec.family === "CFZ" ? 4.0 : 7.0);
    c.thumb("Steel consumption (frames + secondary + plates)", base * fac + girtT + (CR ? 10 : 0) + (L.dust > 0 ? 2 : 0), kgm2, "kg/m²",
      "25–45 kg/m² for 15–30 m rolled portals; PEB / trussed ≈ 20–35; + wall girts on clad walls" + (CR ? "; +8–12 with crane" : ""), "INSDAG / industry practice");
    var cfz = PUR.P1.sec.family === "CFZ", wallA = inp.clad_walls ? 2 * (G.length + G.span) * G.eave : 0;
    c.thumb("Secondary steel (purlins, girts, bracing) per m² plan", (cfz ? 5.0 : 9.0) + (cfz ? 4.0 : 7.0) * wallA / area + 1.5, kgSec / area, "kg/m²",
      cfz ? "cold-formed Z: roof 4–6 kg/m² + girts ≈ 4 kg/m² of clad wall + bracing 1.5" : "hot-rolled channels: roof 8–10 kg/m² + girts ≈ 7 kg/m² of clad wall + bracing 1.5", "INSDAG / industry practice");
    c.thumb("Purlin depth", G.bay * 1000 / 45, PUR.P1.sec.h, "mm", "purlin span / 45", "Duggal");
    if (G.kind === "portal" || G.kind === "mono") c.thumb("Rafter depth", G.span * 1000 / (FR.haunch ? 55 : 40), FR.raf.h, "mm", FR.haunch ? "span / 55 with haunch" : "span / 40 (no haunch)", "INSDAG / Subramanian");
    if (G.kind === "peb") c.thumb("Rafter depth at knee (PEB)", G.span * 1000 / 30, FR.rp.d, "mm", "span / 30 at haunch", "PEB practice");
    if (G.kind === "truss") c.thumb("Truss rise", G.span / 4.5, G.rise, "m", "span / 4 to span / 5", "Practice");
    var ftgPrac = G.span <= 15 ? 1.5 : G.span <= 25 ? 2.0 : 2.5;
    c.thumb("Footing plan area F1", Math.max(1.1 * Ps / FD1.sbc, ftgPrac * ftgPrac), FD1.ftg.L * FD1.ftg.B, "m²", "max(1.1 × P / SBC, practice " + ftgPrac + " m square for wind uplift & frame thrust)", "IS 456 cl 34 / practice");
    c.miss("Geotechnical investigation report – SBC, water table, sulphate / pH of soil & water, fill depth", "IS 1892 / IS 1904", "Critical");
    c.miss("Erection stability: temporary bracing & guying until roof / wall bracing and purlins are complete; erection sequence by contractor", "IS 800 cl 3.3 / IS 7205", "Important");
    if (ctx.site === "mine") {
      c.miss("Blast vibration: check peak particle velocity at the shed (DGMS Technical Circular 7 of 1997 – PPV limit ≈ 5–10 mm/s for industrial structures) and distance from active benches / OB dumps", "DGMS (Tech) Circular 7/1997", "Critical");
      c.miss("Subsidence / made-up ground: confirm the site is not over old workings or OB dump; else piled / raft foundation", "DGMS / CMPDI practice", "Critical");
    }
    c.miss("Painting system for corrosive coal-dust / humid atmosphere: SA 2.5 blast, zinc-rich epoxy primer + epoxy MIO + PU (≥ 225 µm DFT, ISO 12944 C4); hot-dip galvanise purlins, sag rods & bolts", "IS 800 cl 15 / IS 9862", ctx.site === "mine" ? "Important" : "Advisory");
    c.miss("Fabrication / shop drawings: verify bolt edge distances, weld access and member fit-up; detailer to prepare piece-mark drawings", "IS 800 cl 17", "Advisory");
    c.miss("Gutter & downpipe hydraulic sizing for local rainfall intensity (Korba ≈ 100 mm/h, 1-in-25 yr)", "IS 1742 / NBC Part 9", "Advisory");
    c.miss("Fire protection, lightning protection (IS/IEC 62305) and earthing of the steel frame", "NBC Part 4 / IS 3043", "Advisory");
    if (G.kind === "mono") c.miss("Mono-slope roof Cpe values are a simplified envelope of IS 875-3 Table 7 – verify zone-wise values", "IS 875-3 Table 7", "Important");
    if (PUR.P1.sec.family === "CFZ") c.miss("Cold-formed Z purlins: effective-section, distortional buckling and lap capacity per IS 801 / supplier's tables", "IS 801 / IS 811", "Important");
    if (G.clad && G.open) c.miss("Open sides: check free-standing roof / canopy coefficients and dominant opening Cpi for the actual opening ratio", "IS 875-3 cl 7.3.2 / Tables 13-14", "Important");
    c.miss("Connections are designed for the envelope forces; HS bolts gr 8.8 snug-tight – if slip-critical is required (crane / vibration) use pre-tensioned HSFG (IS 800 cl 10.4)", "IS 800 cl 10.4", CR ? "Important" : "Advisory");
    // ---------------- summary & tables
    var dash = "—";
    var summary = {
      "Style": G.style + " (" + inp.base + " base)",
      "Frame": "span " + g(G.span) + " m × " + C.pystr(G.n_bays) + " bays @ " + g(G.bay) + " m = " + g(G.length) + " m; eave " + g(G.eave) + " m, slope " + f1(G.slope) + "°",
      "Columns": FR.colName,
      "Rafters / truss": G.kind === "truss" ? Object.keys(FR.truss.des).filter(function (k) { return k !== "Knee brace"; }).map(function (k) { return k + " " + FR.truss.des[k].label; }).join("; ") : FR.rafName + (FR.haunch ? " + haunch " + f2(FR.Lh) + " m" : ""),
      "Purlins": PUR.name + (PUR.ename !== PUR.name ? " (edge " + PUR.ename + ")" : "") + " @ " + f2(G.ps) + " m" + (PUR.sag ? ", sag rods M" + g(PUR.sag.d) : ""),
      "Girts": GI ? GI.name + " @ " + f2(G.gsp) + " m" : dash,
      "Bracing": "roof " + BR.RB.name + ", wall " + BR.WB.name + " (" + C.pystr(BR.nbr) + " braced bays); eave strut " + BR.es,
      "Knee / apex bolts": KN ? KN.nb + "-M" + g(KN.d) + " gr " + inp.bolt_grade_main + " (EP " + g(KN.t) + ")" + (AP ? " / " + AP.nb + "-M" + g(AP.d) : "") : (TJ ? "truss joints M16/M20 gr 4.6, gusset " + g(TJ.tg) : dash),
      "Base plate": g(BP1.Lp) + "×" + g(BP1.Bp) + "×" + g(BP1.tp) + " mm" + (BP1.key ? " + shear key" : ""),
      "Anchor bolts": BP1.n + "-M" + g(BP1.d) + " × " + g(BP1.Ltot) + " (embed " + g(BP1.Le) + ")",
      "Footing F1": f2(FD1.ftg.L) + " × " + f2(FD1.ftg.B) + " × " + f2(FD1.ftg.D / 1000) + " m, " + g(FD1.ftg.bars_L.dia) + "Ø @ " + g(FD1.ftg.bars_L.spacing) + "; pedestal " + f2(FD1.Lped) + "×" + f2(FD1.Bped) + " m, " + FD1.vbars.n + "-" + g(FD1.vbars.d) + "Ø",
      "Total steel": F(tot / 1000, ",.2f") + " t (" + f1(tot / area) + " kg/m²) + anchors " + f0(kgAn) + " kg",
      "Bolts": C.pystr(nBolt) + " nos (≈ " + f0(kgBolt) + " kg)",
      "Max utilisation": F(c.max_utilisation, ".2f")
    };
    if (CR) summary["Crane"] = g(CR.Wt) + " t EOT, gantry " + CR.gi + " + " + CR.gch;
    if (FD2) summary["Footing F2 (gable)"] = f2(FD2.ftg.L) + " × " + f2(FD2.ftg.B) + " × " + f2(FD2.ftg.D / 1000) + " m";
    var envRows = [];
    if (G.kind !== "truss") {
      var eC = envOf(A, A.model.mem.colL.concat(A.model.mem.colR)), eR = envOf(A, A.model.mem.rafL.concat(A.model.mem.rafR));
      envRows = [["Columns", FR.colName, R(eC.M, 2), R(eC.Pc, 2), R(eC.Pt, 2), R(eC.V, 2), eC.M_combo], ["Rafters", FR.rafName, R(eR.M, 2), R(eR.Pc, 2), R(eR.Pt, 2), R(eR.V, 2), eR.M_combo]];
    } else {
      Object.keys(FR.truss.des).forEach(function (k) { var d = FR.truss.des[k]; envRows.push([k, d.label, 0, R(d.fr.C, 2), R(d.fr.T, 2), 0, ""]); });
      var eC2 = envOf(A, A.model.mem.colL.concat(A.model.mem.colR));
      envRows.push(["Columns", FR.colName, R(eC2.M, 2), R(eC2.Pc, 2), R(eC2.Pt, 2), R(eC2.V, 2), eC2.M_combo]);
    }
    var tables = {
      "Wind cases (Cpe − Cpi)": W.table,
      "Member forces envelope": C.table(envRows, ["Member", "Section", "M (kN·m)", "P comp (kN)", "P tens (kN)", "V (kN)", "Governing combo"]),
      "Member schedule": C.table(B.mem.map(function (m) { return [m.mark, m.desc, m.sec, m.L, m.nos, m.kgm, R(memKg(m), 2)]; }).concat([["TOTAL", "", "", "", "", "", R(kgMain + kgSec, 2)]]), ["Mark", "Description", "Section", "Length m", "Nos", "kg/m", "Total kg"]),
      "Plate schedule": C.table(B.pl.map(function (p) { return [p.mark, p.desc, p.L + " × " + p.B + " × " + p.t, p.nos, R(plKg(p), 2)]; }).concat([["TOTAL", "", "", "", R(kgPl, 2)]]), ["Mark", "Description", "Plate L × B × t mm", "Nos", "kg"]),
      "Bolt schedule": C.table(B.bo.map(function (b) { return [b.loc, b.nos ? "M" + g(b.d) + " × " + g(b.L) : "M" + g(b.d) + " (rod)", b.grade, b.std, b.nos, b.nuts + " nut, " + b.washers + " washer" + (b.turnbuckles ? ", " + b.turnbuckles + " turnbuckles" : "")]; }).concat([["TOTAL", "", "", "", nBolt, ""]]), ["Location", "Bolt dia × length", "Grade", "Standard", "Nos", "Nuts / washers"]),
      "Anchor bolt schedule": C.table(B.an.map(function (a) { return [a.loc, "M" + g(a.d) + " × " + g(a.L), a.grade, a.Le, a.nos, a.nuts + " nuts, 1 washer, anchor plate " + a.plate, R(anKg(a), 2)]; }).concat([["TOTAL", "", "", "", sumOf(B.an.map(function (a) { return a.nos; })), "", R(kgAn, 2)]]), ["Location", "Bolt dia × length", "Grade", "Embedment mm", "Nos", "Nuts / washers / plate", "kg"]),
      "Weld schedule": C.table(B.we.map(function (w) { return [w.loc, typeof w.size === "number" ? w.size + " mm fillet" : w.size, w.L, w.nos, R(w.L * w.nos / 1000, 2), w.type]; }), ["Location", "Size", "Length per joint mm", "Joints", "Total m", "Type"]),
      "Sheeting & accessories": C.table(B.sh.map(function (s) { return [s[0], s[1], s[2]]; }), ["Item", "Unit", "Quantity"]),
      "Steel totals": C.table([["Main members", R(kgMain, 1)], ["Secondary members", R(kgSec, 1)], ["Plates", R(kgPl, 1)], ["Total structural steel", R(tot, 1)], ["Anchor bolts", R(kgAn, 1)], ["Bolts (approx.)", R(kgBolt, 1)], ["kg/m² of plan", R(tot / area, 2)]], ["Item", "kg"])
    };
    var res = C.DesignResult({ module: "steel_shed", title: "Complete steel shed – footing to roof", inputs: inp, calc: c, summary: summary, drawings: sheets, quantities: q, bbs: bbs, tables: tables, references: STEEL_REFS });
    res.bom = B;                                              // non-standard extra for tests / UI
    /* designed sizes expressed as check-mode inputs (design → check round trip) */
    var sz = { purlin_spacing: Math.ceil(G.ps * 1000 - 1e-6) / 1000, girt_spacing: G.clad ? Math.ceil(G.gsp * 1000 - 1e-6) / 1000 : num(inp.girt_spacing), purlin_sec: PUR.name, purlin_edge_sec: PUR.ename, girt_sec: GI ? GI.name : inp.girt_sec, sag_d: PUR.sag ? PUR.sag.d : 12, es_sec: BR.es,
      bp_L: BP1.Lp, bp_B: BP1.Bp, bp_t: BP1.tp, anchor_d: BP1.d, n_anchor: BP1.n, ftg_L: FD1.ftg.L, ftg_D: FD1.ftg.D, ftg_dia: FD1.ftg.bars_L.dia, ftg_s: Math.min(FD1.ftg.bars_L.spacing, FD1.ftg.bars_B.spacing) };
    if (BR.RB.kind === "rod") sz.brace_rod = Math.max(BR.RB.d, BR.WB.d || 0); else sz.brace_sec = BR.RB.sec.w >= (BR.WB.sec.w || 0) ? BR.RB.name : BR.WB.name;
    if (GA) { sz.gc_sec = GA.name; if (GA.er_name) sz.er_sec = GA.er_name; }
    if (CR) { sz.gantry_i = CR.gi; sz.gantry_c = CR.gch; }
    if (G.kind === "portal" || G.kind === "mono") { sz.col_sec = FR.colName; sz.raf_sec = FR.rafName; }
    if (G.kind === "peb") Object.assign(sz, { peb_col_d: FR.cp.d, peb_col_d2: FR.cp.d2, peb_raf_d: FR.rp.d, peb_raf_d2: FR.rp.d2, peb_b: FR.cp.b, peb_tf: FR.cp.tf, peb_tw: FR.cp.tw });
    if (G.kind === "truss") { sz.col_sec = FR.colName; sz.top_sec = FR.truss.des["Top chord"].name; sz.bot_sec = FR.truss.des["Bottom chord"].name; sz.kb_sec = FR.truss.des["Knee brace"].name; var wn = Object.keys(FR.truss.des).filter(function (k) { return !/chord|Knee/.test(k); }).map(function (k) { return FR.truss.des[k].name; }); sz.web_sec = wn.sort(function (a, b) { return sec_of(b).w - sec_of(a).w; })[0]; }
    if (KN) Object.assign(sz, { knee_bolt_d: KN.d, knee_rows: KN.nr, ep_t: Math.max(KN.t, AP ? AP.t : 0) });
    if (AP) Object.assign(sz, { apex_bolt_d: AP.d, apex_rows: AP.nr });
    res.sizes = sz;
    return res;
  };

  /* =========================================================================== parameters */
  function P(key, label, def, unit, o) {
    if (unit && typeof unit === "object") { o = unit; unit = ""; }
    return C.Param(Object.assign({ key: key, label: label, "default": def, unit: unit || "" }, o || {}));
  }
  var CITIES = Object.keys(LD.BASIC_WIND_SPEED).sort();
  var DBLC = ["ISMC 150", "ISMC 175", "ISMC 200", "ISMC 225", "ISMC 250", "ISMC 300"];
  /* small sheds (switch rooms, stores, cycle stands) are often framed in channels: single ISMC and two ISMC (box / back to back) */
  var MAINS = M.ROLLED.slice().concat(SC.by_weight(SC.ISMC), DBLC.map(function (n) { return "2-" + n + " box"; }), DBLC.map(function (n) { return "2-" + n + " b/b"; }));
  var PURL_ALL = SC.by_weight(SC.ISMC).concat(M.ZNAMES, SC.by_weight(SC.ISA));
  var ANG_ALL = SC.by_weight(SC.ISA);
  var CHK = ["check"];
  M.PARAMS = [
    P("style", "Framing system (style / pattern)", STYLES[0], { kind: "select", options: STYLES, group: "Style" }),
    P("base", "Column base", "Pinned", { kind: "select", options: ["Pinned", "Fixed"], group: "Style", help: "Pinned = smaller footings; Fixed = stiffer frame, moment base plate & bigger footing" }),
    P("gable", "Gable end framing", GABLE[0], { kind: "select", options: GABLE, group: "Style" }),
    P("bracing", "Bracing pattern (end bays)", BRACING[0], { kind: "select", options: BRACING, group: "Style" }),
    P("haunch", "Haunch at knee (rolled portal / mono)", true, { kind: "bool", group: "Style" }),
    P("truss_rise", "Truss span / rise ratio (truss styles)", 5.0, { min: 3, max: 8, step: 0.5, group: "Style" }),
    P("span", "Span (c/c of columns)", 20.0, "m", { min: 3, max: 40, step: 0.5, group: "Geometry" }),
    P("bay", "Bay spacing (frame c/c)", 6.0, "m", { min: 1.5, max: 10, step: 0.25, group: "Geometry" }),
    P("n_bays", "Number of bays", 8, { kind: "int", min: 1, max: 40, step: 1, group: "Geometry" }),
    P("eave", "Eave height (low eave for mono-slope)", 7.0, "m", { min: 2.4, max: 15, step: 0.25, group: "Geometry" }),
    P("slope", "Roof slope (portal / PEB / mono)", 10.0, "°", { min: 3, max: 30, step: 0.5, group: "Geometry" }),
    P("sheet_dl", "Roof sheeting + fixings", 0.10, "kN/m²", { min: 0.05, max: 0.5, step: 0.01, group: "Loads" }),
    P("services", "Services / collateral", 0.10, "kN/m²", { min: 0, max: 1, step: 0.05, group: "Loads" }),
    P("wall_dl", "Wall cladding", 0.10, "kN/m²", { min: 0, max: 0.5, step: 0.01, group: "Loads" }),
    P("roof_access", "Roof access provided (IS 875-2: 1.5 kN/m² for slope ≤ 10°)", false, { kind: "bool", group: "Loads" }),
    P("dust", "Coal-dust / ash deposit on roof", DUST[0], { kind: "select", options: DUST, group: "Loads", help: "Not in IS 875-2; 0.5 kN/m² typical of coal-handling areas" }),
    P("city", "City (basic wind speed)", "Korba", { kind: "select", options: CITIES.concat(["Custom"]), group: "Wind" }),
    P("Vb_custom", "Custom basic wind speed Vb", 39.0, "m/s", { min: 33, max: 55, group: "Wind", help: "Used when City = Custom (IS 875-3 Fig. 1 / Annex A)" }),
    P("terrain", "Terrain category", 2, { kind: "select", options: [1, 2, 3, 4], group: "Wind", help: "Open mine / plant area: category 2" }),
    P("k1", "Risk coefficient k1", 1.0, { min: 0.7, max: 1.08, step: 0.01, group: "Wind", help: "IS 875-3 Table 1: 1.0 for 50-year life" }),
    P("k3", "Topography factor k3", 1.0, { min: 1.0, max: 1.36, step: 0.01, group: "Wind", help: "> 1 on hill / OB dump crest" }),
    P("k4", "Importance (cyclonic) factor k4", 1.0, { min: 1.0, max: 1.3, step: 0.05, group: "Wind", help: "IS 875-3 cl 6.3.4: 1.0 non-cyclonic; 1.15 industrial in cyclone regions" }),
    P("perm", "Wall openings (internal pressure)", "Medium (5–20 %)", { kind: "select", options: Object.keys(LD.CPI), group: "Wind" }),
    P("clad_walls", "Side & gable walls clad with sheeting", true, { kind: "bool", group: "Cladding" }),
    P("open_L", "Left long side open (no sheeting)", false, { kind: "bool", group: "Cladding" }),
    P("open_R", "Right long side open (no sheeting)", false, { kind: "bool", group: "Cladding" }),
    P("clad_bays_L", "Left long side – sheet only these bays (1 = front; e.g. 1 or 1,3 or 1-2; blank = all)", "", { kind: "text", group: "Cladding" }),
    P("clad_bays_R", "Right long side – sheet only these bays (blank = all)", "", { kind: "text", group: "Cladding" }),
    P("open_F", "Front gable end open (no sheeting)", false, { kind: "bool", group: "Cladding" }),
    P("open_B", "Back gable end open (no sheeting)", false, { kind: "bool", group: "Cladding" }),
    P("roof_sheet_t", "Roof sheet thickness (TCT)", "0.50", "mm", { kind: "select", options: ["0.45", "0.50", "0.60"], group: "Cladding" }),
    P("wall_sheet_t", "Wall sheet thickness (TCT)", "0.45", "mm", { kind: "select", options: ["0.45", "0.50", "0.60"], group: "Cladding" }),
    P("purlin_fam", "Purlin / girt type", PURLIN_FAM[0], { kind: "select", options: PURLIN_FAM, group: "Cladding" }),
    P("purlin_spacing", "Max. purlin spacing (on slope)", 1.5, "m", { min: 0.8, max: 2.0, step: 0.1, group: "Cladding" }),
    P("sag_rods", "Sag rods in purlins", true, { kind: "bool", group: "Cladding" }),
    P("girt_spacing", "Max. girt spacing", 1.8, "m", { min: 1.0, max: 2.5, step: 0.1, group: "Cladding" }),
    P("gable_col_sp", "Max. gable column spacing", 5.0, "m", { min: 3, max: 7.5, step: 0.5, group: "Cladding" }),
    P("crane", "EOT crane in shed", false, { kind: "bool", group: "Crane (optional)" }),
    P("crane_cap", "Crane capacity", 10.0, "t", { min: 1, max: 50, step: 1, group: "Crane (optional)" }),
    P("crane_span", "Crane span (0 = span − 1.0 m)", 0.0, "m", { min: 0, max: 40, group: "Crane (optional)" }),
    P("rail_h", "Rail level (0 = eave − 1.5 m)", 0.0, "m", { min: 0, max: 14, group: "Crane (optional)" }),
    P("crane_class", "Crane operation", CRANE_CLASS[0], { kind: "select", options: CRANE_CLASS, group: "Crane (optional)" }),
    P("steel", "Steel grade", "E250 (IS 2062)", { kind: "select", options: Object.keys(MT.STEEL_GRADES), group: "Connections" }),
    P("bolt_grade_main", "Bolt grade – moment joints (knee / apex)", "8.8", { kind: "select", options: ["8.8", "10.9"], group: "Connections" }),
    P("fck", "Concrete grade fck (foundation)", 25.0, "N/mm²", { kind: "select", options: [20.0, 25.0, 30.0, 35.0], group: "Foundation" }),
    P("sbc", "Safe bearing capacity of soil", 150.0, "kN/m²", { min: 50, max: 600, step: 10, group: "Foundation" }),
    P("df", "Depth of footing base below GL", 1.5, "m", { min: 0.8, max: 4, step: 0.1, group: "Foundation" }),
    P("plinth_h", "Pedestal top above GL (plinth)", 0.3, "m", { min: 0, max: 1.0, step: 0.05, group: "Foundation" }),
    P("soil_gamma", "Unit weight of soil", 18.0, "kN/m³", { min: 14, max: 21, group: "Foundation" }),
    P("mu_soil", "Base friction coefficient (concrete–soil)", 0.5, { min: 0.3, max: 0.6, step: 0.05, group: "Foundation" }),
    P("floor_pcc", "Floor inside: PCC 1:2:4 thickness (0 = no floor)", 0, "mm", { min: 0, max: 200, step: 25, group: "Foundation" }),
    P("tie_beam", "Plinth / tie beams between columns", true, { kind: "bool", group: "Foundation" }),
    P("zone", "Seismic zone (IS 1893)", "II", { kind: "select", options: ZONES, group: "Site", help: "Korba / Gevra: zone II" }),
    // ---------- check mode
    P("col_sec", "Column section", "ISMB 450", { kind: "select", options: MAINS, group: "My sections", modes: CHK }),
    P("raf_sec", "Rafter section (rolled / mono)", "ISMB 400", { kind: "select", options: MAINS, group: "My sections", modes: CHK }),
    P("peb_col_d", "PEB column depth at knee", 600, "mm", { kind: "int", min: 300, max: 1200, group: "My sections", modes: CHK }),
    P("peb_col_d2", "PEB column depth at base", 300, "mm", { kind: "int", min: 250, max: 1200, group: "My sections", modes: CHK }),
    P("peb_raf_d", "PEB rafter depth at knee", 600, "mm", { kind: "int", min: 300, max: 1200, group: "My sections", modes: CHK }),
    P("peb_raf_d2", "PEB rafter depth at apex", 300, "mm", { kind: "int", min: 250, max: 1200, group: "My sections", modes: CHK }),
    P("peb_b", "PEB flange width", 200, "mm", { kind: "int", min: 150, max: 400, group: "My sections", modes: CHK }),
    P("peb_tf", "PEB flange thickness", 12, "mm", { kind: "int", min: 6, max: 32, group: "My sections", modes: CHK }),
    P("peb_tw", "PEB web thickness", 6, "mm", { kind: "int", min: 4, max: 16, group: "My sections", modes: CHK }),
    P("top_sec", "Truss top chord (2 angles, or rolled I)", "ISA 75x75x8", { kind: "select", options: ANG_ALL.concat(SC.by_weight(SC.ISMB), SC.by_weight(SC.ISHB)), group: "My sections", modes: CHK }),
    P("bot_sec", "Truss bottom chord (2 angles)", "ISA 65x65x6", { kind: "select", options: ANG_ALL, group: "My sections", modes: CHK }),
    P("web_sec", "Truss web members (single angle, or 2-… for double)", "ISA 65x65x6", { kind: "select", options: ANG_ALL.concat(ANG_ALL.map(function (n) { return "2-" + n; })), group: "My sections", modes: CHK }),
    P("purlin_sec", "Purlin section", "ISMC 125", { kind: "select", options: PURL_ALL, group: "My sections", modes: CHK }),
    P("purlin_edge_sec", "Purlin section in edge / ridge zone", "ISMC 150", { kind: "select", options: PURL_ALL, group: "My sections", modes: CHK }),
    P("kb_sec", "Truss knee brace (2 angles)", "ISA 75x75x8", { kind: "select", options: ANG_ALL, group: "My sections", modes: CHK }),
    P("girt_sec", "Girt section", "ISMC 100", { kind: "select", options: PURL_ALL, group: "My sections", modes: CHK }),
    P("sag_d", "Sag rod dia", 12, "mm", { kind: "select", options: [12, 16, 20], group: "My sections", modes: CHK }),
    P("brace_rod", "Bracing rod dia (X-rod)", 20, "mm", { kind: "select", options: [16, 20, 24, 30], group: "My sections", modes: CHK }),
    P("brace_sec", "Bracing angle (X-angle / K)", "ISA 65x65x6", { kind: "select", options: ANG_ALL, group: "My sections", modes: CHK }),
    P("es_sec", "Eave strut", "ISMC 150", { kind: "select", options: SC.by_weight(SC.ISMC), group: "My sections", modes: CHK }),
    P("gc_sec", "Gable column", "ISMB 250", { kind: "select", options: MAINS, group: "My sections", modes: CHK }),
    P("er_sec", "End rafter", "ISMB 200", { kind: "select", options: SC.by_weight(SC.ISMB).concat(SC.by_weight(SC.ISMC)), group: "My sections", modes: CHK }),
    P("knee_bolt_d", "Knee bolt dia", 20, "mm", { kind: "select", options: [16, 20, 24, 30], group: "My connections", modes: CHK }),
    P("knee_rows", "Knee tension rows below flange", 2, { kind: "int", min: 1, max: 4, group: "My connections", modes: CHK }),
    P("apex_bolt_d", "Apex bolt dia", 20, "mm", { kind: "select", options: [16, 20, 24, 30], group: "My connections", modes: CHK }),
    P("apex_rows", "Apex tension rows (each flange)", 2, { kind: "int", min: 1, max: 4, group: "My connections", modes: CHK }),
    P("ep_t", "End plate thickness", 20, "mm", { kind: "select", options: PLATE_T, group: "My connections", modes: CHK }),
    P("bp_L", "Base plate length (along web)", 600, "mm", { kind: "int", min: 200, max: 1500, group: "My connections", modes: CHK }),
    P("bp_B", "Base plate width", 300, "mm", { kind: "int", min: 150, max: 1000, group: "My connections", modes: CHK }),
    P("bp_t", "Base plate thickness (0 = design)", 20, "mm", { kind: "select", options: [0].concat(PLATE_T), group: "My connections", modes: CHK }),
    P("anchor_d", "Anchor bolt dia", 24, "mm", { kind: "select", options: [20, 24, 30, 36], group: "My connections", modes: CHK }),
    P("n_anchor", "Anchor bolts per base", 4, { kind: "int", min: 4, max: 8, step: 2, group: "My connections", modes: CHK }),
    P("gantry_i", "Gantry I-section", "ISMB 450", { kind: "select", options: SC.by_weight(SC.ISMB), group: "My connections", modes: CHK }),
    P("gantry_c", "Gantry cap channel", "ISMC 250", { kind: "select", options: SC.by_weight(SC.ISMC), group: "My connections", modes: CHK }),
    P("ftg_L", "Footing size L = B (0 = design)", 2.2, "m", { min: 0, max: 6, step: 0.1, group: "My foundation", modes: CHK }),
    P("ftg_D", "Footing depth", 450, "mm", { kind: "int", min: 0, max: 1500, group: "My foundation", modes: CHK }),
    P("ftg_dia", "Footing bar dia (0 = design)", 12, "mm", { kind: "select", options: [0, 10, 12, 16, 20], group: "My foundation", modes: CHK }),
    P("ftg_s", "Footing bar spacing", 150, "mm", { kind: "int", min: 75, max: 300, group: "My foundation", modes: CHK })
  ];

  C.register({ id: "steel_shed", phase: 2, category: "Steel structures", name: "Complete steel shed – footing to roof", icon: "🏗️",
    description: "Every member, plate, bolt, weld and footing of an industrial / mine shed: portal (rolled or tapered PEB), truss (Pratt / Howe / Fink) " +
      "or mono-slope; IS 875 wind with local zones, dust & crane loads, frame analysis, IS 800 member & connection design (knee, apex, cleats, bracing, " +
      "base plate, anchor bolts, shear key), pedestal + footing with stability checks, complete BOM, quantities, BBS and A3 drawings.",
    params: M.PARAMS, run: M.run, references: STEEL_REFS, modes: ["design", "check"] });
})();
