/* Design Studio — steel (port of civilest/design/steel.py).
   IS 800:2007 (limit state) member and connection checks. Every check records its working
   in a `Calc`. Units: forces kN, moments kN·m, lengths of members m, section properties mm. */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var C = DS.core;
  var MT = DS.materials;
  var S = DS.steel = {};
  function kw(args, names, defs, nreq) { return MT._kw(args, names, defs, nreq); }
  function rstrip(s) { return s.replace(/\s+$/, ""); }
  function tg(tag) { return rstrip(" " + tag); }          // f" {tag}".rstrip()
  var R = C.pyround, F = C.pyfmt;

  // re-exported names (Python module attributes from its imports)
  S.Calc = C.Calc;
  S.E_STEEL = MT.E_STEEL; S.G_STEEL = MT.G_STEEL; S.GAMMA_M0 = MT.GAMMA_M0; S.GAMMA_M1 = MT.GAMMA_M1;
  S.GAMMA_MB = MT.GAMMA_MB; S.BOLT_GRADES = MT.BOLT_GRADES;

  S.ALPHA = { a: 0.21, b: 0.34, c: 0.49, d: 0.76 };           // IS 800 Table 7

  /* eps(fy) */
  S.eps = function (fy) { return Math.sqrt(250.0 / fy); };

  /* buckling_class(sec, axis) — IS 800 Table 10 for rolled sections */
  S.buckling_class = function (sec, axis) {
    var fam = sec.family;
    if (fam === "BUILT") return axis === "z" ? "b" : "c";                // welded I-section
    if (fam === "ISMB" || fam === "ISHB") {
      if (sec.h / sec.b > 1.2 && sec.tf <= 40) return axis === "z" ? "a" : "b";
      return axis === "z" ? "b" : "c";
    }
    return "c";                                                          // channels, angles, built-up
  };

  /* fcd(fy, KL_mm, r_mm, cls) → [fcd (N/mm²), λ] — IS 800 cl 7.1.2.1 */
  S.fcd = function (fy, KL_mm, r_mm, cls) {
    var lam = Math.sqrt(fy * Math.pow(KL_mm / r_mm, 2) / (Math.pow(Math.PI, 2) * MT.E_STEEL));
    var phi = 0.5 * (1 + S.ALPHA[cls] * (lam - 0.2) + Math.pow(lam, 2));
    var f = (fy / MT.GAMMA_M0) / (phi + Math.sqrt(Math.max(Math.pow(phi, 2) - Math.pow(lam, 2), 0.0)));
    return [Math.min(f, fy / MT.GAMMA_M0), lam];
  };

  /* classify_i(sec, fy) → "Plastic" | "Compact" | "Semi-compact" | "Slender" (IS 800 Table 2) */
  S.classify_i = function (sec, fy, axial) {
    var e = S.eps(fy);
    var fam = sec.family;
    var b_out = (fam === "ISMB" || fam === "ISHB" || fam === "BUILT") ? sec.b / 2 : sec.b;
    var fl = b_out / sec.tf;
    var web = (sec.h - 2 * sec.tf) / sec.tw;
    var lim = fam === "BUILT" ? [8.4, 9.4, 13.6] : [9.4, 10.5, 15.7];   // welded vs rolled outstand
    if (axial) {                       // member in axial compression: web d/tw ≤ 42ε (Table 2, "generally"), no plastic/compact web class
      if (fl <= lim[2] * e && web <= 42 * e) return fl <= lim[0] * e ? "Plastic" : fl <= lim[1] * e ? "Compact" : "Semi-compact";
      return "Slender";
    }
    if (fl <= lim[0] * e && web <= 84 * e) return "Plastic";
    if (fl <= lim[1] * e && web <= 105 * e) return "Compact";
    if (fl <= lim[2] * e && web <= 126 * e) return "Semi-compact";
    return "Slender";
  };

  /* mcr_i(sec, L_mm) → elastic LTB moment (N·mm), IS 800 Annex E-1.1 */
  S.mcr_i = function (sec, L_mm) {
    var E = MT.E_STEEL, a = Math.pow(Math.PI, 2) * E * sec.Iy / Math.pow(L_mm, 2);
    return Math.sqrt(a * (MT.G_STEEL * sec.It + Math.pow(Math.PI, 2) * E * sec.Iw / Math.pow(L_mm, 2)));
  };

  /* =========================================================================== member strength */
  /* compression(c, P, sec, fy, Lz, Ly, Kz = 1, Ky = 1, tag = "", rz_key = "rz", ry_key = "ry", limit = 180[, opts])
     → {Pd, Pdz, Pdy, lamz, lamy, ok, slender} */
  S.compression = function () {
    var p = kw(arguments, ["c", "P", "sec", "fy", "Lz", "Ly", "Kz", "Ky", "tag", "rz_key", "ry_key", "limit"],
      { Kz: 1.0, Ky: 1.0, tag: "", rz_key: "rz", ry_key: "ry", limit: 180.0 }, 6);
    var c = p.c, sec = p.sec, fy = p.fy, t = tg(p.tag);
    var fam = sec.family, A = sec.A;
    if ((fam === "ISMB" || fam === "ISHB" || fam === "BUILT" || fam === "ISMC") && sec.tw > 0 && sec.h > 2 * sec.tf) {
      var e = S.eps(fy), dw = sec.h - 2 * sec.tf;
      if (dw / sec.tw > 42 * e) {
        c.warn("Slender web in axial compression" + t, "d/tw = " + F(dw / sec.tw, ".1f") + " > 42ε = " + F(42 * e, ".1f") +
          " – web width beyond 42ε·tw neglected (effective area)", "IS 800 Table 2 / cl 7.3.2.1");
        A = c.calc("Effective area (slender web)" + t, "Ae", "A - (d - 42*eps*tw)*tw", "mm²", "IS 800 cl 7.3.2.1",
          "d = h − 2tf (clear web depth)", { A: R(sec.A, 1), d: R(dw, 1), eps: R(e, 4), tw: sec.tw });
      }
    }
    var lz = c.calc("Slenderness about z" + t, "KL/rz", "K*L*1000/r", "", "IS 800 cl 7.2", { K: p.Kz, L: p.Lz, r: sec[p.rz_key] });
    var ly = c.calc("Slenderness about y" + t, "KL/ry", "K*L*1000/r", "", "IS 800 cl 7.2", { K: p.Ky, L: p.Ly, r: sec[p.ry_key] });
    c.check("Max. slenderness" + t, Math.max(lz, ly), p.limit, { unit: "", clause: "IS 800 Table 3" });
    var rz_ = S.fcd(fy, p.Kz * p.Lz * 1000, sec[p.rz_key], S.buckling_class(sec, "z")), fz = rz_[0], lamz = rz_[1];
    var ry_ = S.fcd(fy, p.Ky * p.Ly * 1000, sec[p.ry_key], S.buckling_class(sec, "y")), fy_ = ry_[0], lamy = ry_[1];
    var f = Math.min(fz, fy_);
    c.calc("Design compressive stress" + t, "fcd", "fv", "N/mm²", "IS 800 cl 7.1.2.1",
      "curves z:'" + S.buckling_class(sec, "z") + "', y:'" + S.buckling_class(sec, "y") + "'; " +
      "λz = " + F(lamz, ".3f") + ", λy = " + F(lamy, ".3f"), { fv: R(f, 2) });
    var Pd = c.calc("Design compressive strength" + t, "Pd", "A*fcd/1000", "kN", "IS 800 cl 7.1.2", { A: R(A, 1), fcd: R(f, 2) });
    var ok = c.check("Axial compression" + t, Math.abs(p.P), Pd, { unit: "kN", clause: "IS 800 cl 7.1.2" });
    return { Pd: Pd, Pdz: A * fz / 1000, Pdy: A * fy_ / 1000, lamz: lamz, lamy: lamy,
      ok: ok, slender: Math.max(lz, ly) };
  };

  /* tension(c, T, A, fy, fu, hole_area = 0, tag = "", slender = null, limit = 400, n_bolts = null[, opts]) → {Td, ok}
     n_bolts (angle connected through one leg): net-section rupture with the shear-lag factor α of IS 800 cl 6.3.3
     (α = 0.6 for ≤ 2 bolts, 0.7 for 3, 0.8 for ≥ 4 bolts in the end connection). */
  S.shear_lag_alpha = function (nb) { return nb <= 2 ? 0.6 : nb === 3 ? 0.7 : 0.8; };
  S.tension = function () {
    var p = kw(arguments, ["c", "T", "A", "fy", "fu", "hole_area", "tag", "slender", "limit", "n_bolts"],
      { hole_area: 0.0, tag: "", slender: null, limit: 400.0, n_bolts: null }, 5);
    var c = p.c, t = tg(p.tag);
    var Tdg = c.calc("Yielding of gross section" + t, "Tdg", "A*fy/(gm0*1000)", "kN", "IS 800 cl 6.2",
      { A: p.A, fy: p.fy, gm0: MT.GAMMA_M0 });
    var An = p.A - p.hole_area, Tdn;
    if (p.n_bolts != null) {
      var nb = Math.max(1, Math.round(p.n_bolts));
      Tdn = c.calc("Rupture of net section – angle connected by one leg (shear lag)" + t, "Tdn", "alpha*An*fu/(gm1*1000)", "kN",
        "IS 800 cl 6.3.3", "α = 0.6 (≤ 2 bolts), 0.7 (3 bolts), 0.8 (≥ 4 bolts); " + C.pystr(nb) + " bolt(s) in the end connection",
        { alpha: S.shear_lag_alpha(nb), An: R(An, 1), fu: p.fu, gm1: MT.GAMMA_M1 });
    } else {
      Tdn = c.calc("Rupture of net section" + t, "Tdn", "0.9*An*fu/(gm1*1000)", "kN", "IS 800 cl 6.3.1",
        { An: An, fu: p.fu, gm1: MT.GAMMA_M1 });
    }
    var Td = Math.min(Tdg, Tdn);
    var ok = c.check("Axial tension" + t, Math.abs(p.T), Td, { unit: "kN", clause: "IS 800 cl 6.1" });
    if (p.slender != null) c.check("Slenderness (tension / reversal)" + t, p.slender, p.limit, { unit: "", clause: "IS 800 Table 3" });
    return { Td: Td, ok: ok };
  };

  /* bending(c, M, sec, fy, LLT, restrained = false, tag = "", axis = "z"[, opts]) → {Md, ok, class, lamLT, beta}
     Design bending strength incl. lateral-torsional buckling (IS 800 cl 8.2.1 / 8.2.2). */
  S.bending = function () {
    var p = kw(arguments, ["c", "M", "sec", "fy", "LLT", "restrained", "tag", "axis"],
      { restrained: false, tag: "", axis: "z" }, 5);
    var c = p.c, sec = p.sec, fy = p.fy, LLT = p.LLT, t = tg(p.tag);
    var cls = S.classify_i(sec, fy);
    c.info("Section class" + t, cls, "IS 800 Table 2");
    var Zp, Ze;
    if (p.axis === "y") { Zp = sec.Zpy; Ze = sec.Zey; } else { Zp = sec.Zpz; Ze = sec.Zez; }
    var beta = (cls === "Plastic" || cls === "Compact") ? 1.0 : Ze / Zp;
    if (cls === "Slender")
      c.warn("Slender section" + t, "Slender sections need effective-section design – choose a heavier section", "IS 800 cl 3.7.2");
    var Md_sec = c.calc("Section moment capacity" + t, "Md", "min(beta*Zp*fy/gm0, 1.2*Ze*fy/gm0)/1e6", "kN·m",
      "IS 800 cl 8.2.1.2", { beta: R(beta, 3), Zp: R(Zp), Ze: R(Ze), fy: fy, gm0: MT.GAMMA_M0 });
    var Md = Md_sec, lamLT;
    if (!p.restrained && p.axis === "z") {
      var Mcr = S.mcr_i(sec, LLT * 1000);
      var lam = c.calc("LTB slenderness" + t, "λLT", "sqrt(beta*Zp*fy/Mcr)", "", "IS 800 cl 8.2.2",
        "LLT = " + F(LLT, ".2f") + " m", { beta: R(beta, 3), Zp: R(Zp), fy: fy, Mcr: R(Mcr) });
      if (lam > 0.4) {
        var aLT = sec.family === "BUILT" ? 0.49 : 0.21;
        var phi = 0.5 * (1 + aLT * (lam - 0.2) + Math.pow(lam, 2));
        var chi = Math.min(1 / (phi + Math.sqrt(Math.max(Math.pow(phi, 2) - Math.pow(lam, 2), 0))), 1.0);
        Md = c.calc("LTB moment capacity" + t, "Md,LT", "beta*Zp*chi*fy/gm0/1e6", "kN·m", "IS 800 cl 8.2.2",
          "αLT = " + C.pystr(aLT) + " (" + (aLT > 0.3 ? "welded" : "rolled") + ")",
          { beta: R(beta, 3), Zp: R(Zp), chi: R(chi, 4), fy: fy, gm0: MT.GAMMA_M0 });
        Md = Math.min(Md, Md_sec);
      } else {
        c.info("LTB" + t, "λLT ≤ 0.4 – lateral-torsional buckling need not be considered", "IS 800 cl 8.2.2");
      }
      lamLT = lam;
    } else {
      lamLT = 0.0;
    }
    var ok = c.check("Bending" + t, Math.abs(p.M), Md, { unit: "kN·m", clause: "IS 800 cl 8.2" });
    return { Md: Md, ok: ok, "class": cls, lamLT: lamLT, beta: beta };
  };

  /* shear_strength(c, V, sec, fy, tag = ""[, opts]) → {Vd, ok} */
  S.shear_strength = function () {
    var p = kw(arguments, ["c", "V", "sec", "fy", "tag"], { tag: "" }, 4);
    var c = p.c, sec = p.sec, t = tg(p.tag);
    var Av = sec.h * sec.tw;
    var Vd = c.calc("Design shear strength" + t, "Vd", "Av*fy/(sqrt(3)*gm0*1000)", "kN", "IS 800 cl 8.4.1",
      { Av: R(Av), fy: p.fy, gm0: MT.GAMMA_M0 });
    var ok = c.check("Shear" + t, Math.abs(p.V), Vd, { unit: "kN", clause: "IS 800 cl 8.4" });
    if (Math.abs(p.V) > 0.6 * Vd)
      c.warn("High shear" + t, "V > 0.6 Vd – reduce moment capacity per cl 9.2.2", "IS 800 cl 9.2.2");
    return { Vd: Vd, ok: ok };
  };

  /* combined(c, P, Mz, comp, bend, sec, fy, tag = "", Cmz = 0.9, CmLT = 0.9[, opts]) → bool
     Member buckling under axial compression + major-axis moment, IS 800 cl 9.3.2.2. */
  S.combined = function () {
    var p = kw(arguments, ["c", "P", "Mz", "comp", "bend", "sec", "fy", "tag", "Cmz", "CmLT"],
      { tag: "", Cmz: 0.9, CmLT: 0.9 }, 7);
    var c = p.c, comp = p.comp, bend = p.bend, t = tg(p.tag);
    var P = Math.abs(p.P), Mz = Math.abs(p.Mz);
    var Pdz = comp.Pdz, Pdy = comp.Pdy;
    var nz = P / Pdz, ny = P / Pdy;
    var Kz = Math.min(1 + (comp.lamz - 0.2) * nz, 1 + 0.8 * nz);
    var KLT = Math.max(1 - 0.1 * bend.lamLT * ny / (p.CmLT - 0.25), 1 - 0.1 * ny / (p.CmLT - 0.25));
    var r1 = c.calc("Interaction (a) – minor-axis buckling + LTB" + t, "IR1", "P/Pdy + KLT*Mz/Mdz", "",
      "IS 800 cl 9.3.2.2 eq (a)", { P: P, Pdy: R(Pdy, 1), KLT: R(KLT, 3), Mz: Mz, Mdz: R(bend.Md, 1) });
    var r2 = c.calc("Interaction (b) – major-axis buckling" + t, "IR2", "P/Pdz + Kz*Cmz*Mz/Mdz", "",
      "IS 800 cl 9.3.2.2 eq (b)", { P: P, Pdz: R(Pdz, 1), Kz: R(Kz, 3), Cmz: p.Cmz, Mz: Mz, Mdz: R(bend.Md, 1) });
    return c.check("Combined axial + bending" + t, Math.max(r1, r2), 1.0, { unit: "", clause: "IS 800 cl 9.3.2.2" });
  };

  /* web_crippling(c, R, sec, fy, b1 = 100, tag = ""[, opts]) → bool — cl 8.7.4, root radius ignored */
  S.web_crippling = function () {
    var p = kw(arguments, ["c", "R", "sec", "fy", "b1", "tag"], { b1: 100.0, tag: "" }, 4);
    var c = p.c, sec = p.sec, sfx = p.tag ? " " + p.tag : p.tag;
    var n2 = 2.5 * sec.tf;
    var Fw = c.calc("Web bearing capacity" + sfx, "Fw", "(b1 + n2)*tw*fy/(gm0*1000)", "kN",
      "IS 800 cl 8.7.4", { b1: p.b1, n2: n2, tw: sec.tw, fy: p.fy, gm0: MT.GAMMA_M0 });
    return c.check("Web bearing" + sfx, Math.abs(p.R), Fw, { unit: "kN", clause: "IS 800 cl 8.7.4" });
  };

  /* =========================================================================== connections */
  /* bolt_values(c, d, grade, t_min, fu_plate, n_shear_planes = 1, threads_in_shear = true, tag = ""[, opts])
     → {Vdb, Tdb, Vdsb, Vdpb} */
  S.bolt_values = function () {
    var p = kw(arguments, ["c", "d", "grade", "t_min", "fu_plate", "n_shear_planes", "threads_in_shear", "tag"],
      { n_shear_planes: 1, threads_in_shear: true, tag: "" }, 5);
    var c = p.c, d = p.d, grade = p.grade;
    if (!(grade in MT.BOLT_GRADES)) throw new Error("KeyError: " + grade);
    var fub = MT.BOLT_GRADES[grade][0], fyb = MT.BOLT_GRADES[grade][1];
    var Asb = Math.PI * d * d / 4;
    var Anb = 0.78 * Asb;
    var t = tg(p.tag);
    var Vdsb = c.calc("Bolt shear capacity M" + F(d, "g") + " gr " + grade + t, "Vdsb", "fub*n*A/(sqrt(3)*gmb*1000)", "kN",
      "IS 800 cl 10.3.3", { fub: fub, n: p.n_shear_planes, A: R(p.threads_in_shear ? Anb : Asb, 1), gmb: MT.GAMMA_MB });
    var kb = 0.5;
    var Vdpb = c.calc("Bolt bearing capacity" + t, "Vdpb", "2.5*kb*d*t*fu/(gmb*1000)", "kN", "IS 800 cl 10.3.4",
      "kb = 0.5 (conservative)", { kb: kb, d: d, t: p.t_min, fu: p.fu_plate, gmb: MT.GAMMA_MB });
    var Tdb = c.calc("Bolt tension capacity" + t, "Tdb", "min(0.9*fub*An, fyb*Asb*gmb/gm0)/(gmb*1000)", "kN",
      "IS 800 cl 10.3.5", { fub: fub, An: R(Anb, 1), fyb: fyb, Asb: R(Asb, 1), gmb: MT.GAMMA_MB, gm0: MT.GAMMA_M0 });
    return { Vdb: Math.min(Vdsb, Vdpb), Tdb: Tdb, Vdsb: Vdsb, Vdpb: Vdpb };
  };

  /* fillet_weld(c, F, size, fu, gmw = 1.25, tag = ""[, opts]) → required weld length (mm), IS 800 cl 10.5.7 */
  S.fillet_weld = function () {
    var p = kw(arguments, ["c", "F", "size", "fu", "gmw", "tag"], { gmw: 1.25, tag: "" }, 4);
    var fwd = p.fu / (Math.sqrt(3) * p.gmw);
    return p.c.calc("Weld length required (" + F(p.size, "g") + " mm fillet)" + (p.tag ? " " + p.tag : p.tag), "Lw",
      "F*1000/(0.7*s*fwd) + 2*s", "mm", "IS 800 cl 10.5.7.1", { F: Math.abs(p.F), s: p.size, fwd: R(fwd, 1) });
  };

  /* base_plate(c, P, H, uplift, col, fck, fy_plate, fu_plate, bolt_d = 24, bolt_grade = "4.6", n_bolts = 4[, opts])
     → {Lp, Bp, tp, bolt_d, n_bolts, Lemb} — slab base for an I-column (pinned). */
  S.base_plate = function () {
    var p = kw(arguments, ["c", "P", "H", "uplift", "col", "fck", "fy_plate", "fu_plate", "bolt_d", "bolt_grade", "n_bolts"],
      { bolt_d: 24.0, bolt_grade: "4.6", n_bolts: 4 }, 8);
    var c = p.c, P = p.P, H = p.H, uplift = p.uplift, col = p.col, fck = p.fck, n_bolts = p.n_bolts, bolt_d = p.bolt_d;
    c.section("Base plate & anchor bolts");
    var bearing = c.calc("Bearing strength of concrete", "fbc", "0.45*fck", "N/mm²", "IS 800 cl 7.4.1", { fck: fck });
    var Areq = c.calc("Base plate area required", "Areq", "P*1000/fbc", "mm²", "IS 800 cl 7.4.1", { P: Math.abs(P), fbc: bearing });
    var Lp = Math.max(Math.ceil((col.h + 2 * 75) / 10) * 10, Math.ceil(Math.sqrt(Math.max(Areq, 1)) / 10) * 10);
    var Bp = Math.max(Math.ceil((col.b + 2 * 50) / 10) * 10, Math.ceil(Areq / Lp / 10) * 10);
    c.let("Base plate size adopted", "Lp × Bp", F(Lp, "g") + " × " + F(Bp, "g"), "mm");
    var w = c.calc("Bearing pressure under plate", "w", "P*1000/(Lp*Bp)", "N/mm²", "", { P: Math.abs(P), Lp: Lp, Bp: Bp });
    c.check("Bearing pressure ≤ 0.45 fck", w, bearing, { unit: "N/mm²", clause: "IS 800 cl 7.4.1" });
    var pa = (Lp - col.h) / 2, pb = (Bp - col.b) / 2;
    var a = Math.max(pa, pb), b = Math.min(pa, pb);      // a = larger, b = smaller projection beyond the column
    var ts = c.calc("Base plate thickness required", "ts", "sqrt(max(2.5*w*(a**2 - 0.3*b**2)*gm0/fy, 0))", "mm",
      "IS 800 cl 7.4.3.1", "a, b = larger / smaller projection of the plate beyond the column",
      { w: R(w, 3), a: a, b: b, gm0: MT.GAMMA_M0, fy: p.fy_plate });
    ts = Math.max(ts, col.tf, 0.0);
    var t_adopt = [10, 12, 16, 20, 25, 28, 32, 36, 40, 45, 50, 60].find(function (x) { return x >= ts; });
    if (t_adopt === undefined) {
      // thicker than 60 mm needed: report it instead of stopping the whole design
      t_adopt = Math.ceil(ts / 5) * 5;
      c.ok("Base plate thickness ≤ 60 mm (practical)", false, { detail: F(ts, ".1f") + " mm needed – use a stiffened (gusseted) base, a bigger pedestal grade or reduce the load", clause: "IS 800 cl 7.4.3" });
    }
    c.let("Base plate thickness adopted (≥ flange thickness)", "tp", t_adopt, "mm", "IS 800 cl 7.4.3.1");
    var bv = S.bolt_values(c, bolt_d, p.bolt_grade, t_adopt, p.fu_plate, { tag: "(anchor)" });
    if (uplift > 0)
      c.check("Anchor bolts – tension (uplift)", uplift / n_bolts, bv.Tdb, { unit: "kN / bolt", clause: "IS 800 cl 10.3.5" });
    c.check("Anchor bolts – shear (horizontal reaction)", Math.abs(H) / n_bolts, bv.Vdsb, { unit: "kN / bolt",
      clause: "IS 800 cl 10.3.3", note: "or provide shear key" });
    var tie = Math.pow(Math.abs(H) / n_bolts / bv.Vdsb, 2) + Math.pow(Math.max(uplift, 0) / n_bolts / bv.Tdb, 2);
    c.check("Combined shear + tension in bolt", tie, 1.0, { unit: "", clause: "IS 800 cl 10.3.6" });
    var Ld = c.calc("Anchor bolt embedment (bond)", "Lemb", "Tb*1000/(pi*d*tbd)", "mm", "IS 456 cl 26.2.1",
      "plain bar bond stress; adopt ≥ 450 mm with nut / plate washer at the end",
      { Tb: Math.max(bv.Tdb, 1.0), d: bolt_d, tbd: fck < 25 ? 1.2 : 1.4 });
    return { Lp: Lp, Bp: Bp, tp: t_adopt, bolt_d: bolt_d, n_bolts: n_bolts, Lemb: Math.max(Ld, 450.0) };
  };
})();
