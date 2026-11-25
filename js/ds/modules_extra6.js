/* Design Studio — modules_extra6: TWO-WHEELER / CYCLE PARKING SHED in tubular steel (new module).
   Light open canopy of cold-formed hollow sections (IS 4923 SHS / RHS, ERW tubes), profiled sheet roof, posts on RCC footings.
     Schemes: two rows of posts with a mono-slope roof (rafter on two posts, posts fixed at the base),
              one row of posts – T (roof both sides, rigid joint at the post top),
              one row of posts – cantilever (Γ, roof on one side).
   Wind: IS 875-3:2015 design pressure with net pressure coefficients for free-standing canopy roofs [APPROX – values close to
   IS 875-3 Tables 17 / 18 for slopes up to 10°, verify for the site]. Live load IS 875-2 Table 2. Members to IS 800:2007
   (no lateral-torsional buckling for closed sections, cl 8.2.2; axial + bending interaction cl 9.3.1 simplified).
   Hollow-section properties are computed from the outer size and thickness with square corners [APPROX: 2–5 % above the
   IS 4923 tables — check the chosen size in the table]. */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var C = DS.core, F = C.pyfmt, R = C.pyround, ceil_to = C.ceil_to;
  var M = DS.modules_extra6 = {};
  function CM() { return DS.common; } function RC() { return DS.rcc; } function LD() { return DS.loads; } function DR() { return DS.drawing; }
  function BB() { return DS.bbs; } function DT() { return DS.detailing; } function X() { return DS.modules_extra; }
  function row() { return CM().row.apply(null, arguments); } function Q() { return CM().Q.apply(null, arguments); }
  function num(v) { var x = Number(v); return isFinite(x) ? x : 0; } function G(x) { return F(x, "g"); }
  function area(d) { return Math.PI * d * d / 4; } function CPWD() { return CM().CPWD; }
  function ctx() { return C.ctx || { site: "general", detail: "practice" }; } function isMine() { return ctx().site === "mine"; }
  function P(key, label, def, unit, o) { if (unit && typeof unit === "object") { o = unit; unit = ""; } return C.Param(Object.assign({ key: key, label: label, default: def, unit: unit || "" }, o || {})); }

  /* ---------- hollow sections (IS 4923) ---------- */
  var SIZES = [["SHS", 40, 40, [2.6, 3.2]], ["SHS", 50, 50, [2.9, 3.6]], ["SHS", 60, 60, [3.2, 4.0]], ["SHS", 72, 72, [3.2, 4.0, 4.8]], ["SHS", 80, 80, [3.2, 4.0, 4.8]],
    ["SHS", 91.5, 91.5, [3.6, 4.5, 5.4]], ["SHS", 100, 100, [4.0, 5.0, 6.0]], ["SHS", 113.5, 113.5, [4.5, 5.4]], ["SHS", 132, 132, [4.8, 5.4, 6.0]], ["SHS", 150, 150, [5.0, 6.0]], ["SHS", 180, 180, [6.0, 8.0]], ["SHS", 200, 200, [6.0, 8.0, 10.0]], ["SHS", 250, 250, [8.0, 10.0]],
    ["RHS", 50, 25, [2.6, 2.9]], ["RHS", 60, 40, [2.9, 3.2]], ["RHS", 66, 33, [2.9]], ["RHS", 80, 40, [3.2, 4.0]], ["RHS", 96, 48, [3.2, 4.8]], ["RHS", 100, 50, [3.2, 4.0, 5.0]],
    ["RHS", 122, 61, [3.6, 4.5, 5.4]], ["RHS", 120, 80, [4.0, 5.0]], ["RHS", 145, 82, [4.8, 5.4]], ["RHS", 150, 100, [5.0, 6.0]], ["RHS", 172, 92, [4.8, 5.4]], ["RHS", 200, 100, [5.0, 6.0]], ["RHS", 250, 150, [6.0, 8.0]], ["RHS", 300, 200, [8.0, 10.0]]];
  function hs(fam, D, B, t) {
    var bi = B - 2 * t, di = D - 2 * t, A = B * D - bi * di, Iz = (B * Math.pow(D, 3) - bi * Math.pow(di, 3)) / 12, Iy = (D * Math.pow(B, 3) - di * Math.pow(bi, 3)) / 12;
    return { name: fam + " " + G(D) + "×" + G(B) + "×" + G(t), family: fam, h: D, b: B, t: t, A: A, w: A * 7.85e-3, Iz: Iz, Iy: Iy, Zez: Iz / (D / 2), Zey: Iy / (B / 2),
      Zpz: B * D * D / 4 - bi * di * di / 4, Zpy: D * B * B / 4 - di * bi * bi / 4, rz: Math.sqrt(Iz / A), ry: Math.sqrt(Iy / A), Av: A * D / (B + D), per: 2 * (B + D) };
  }
  var HS = []; SIZES.forEach(function (s) { s[3].forEach(function (t) { HS.push(hs(s[0], s[1], s[2], t)); }); });
  HS.sort(function (a, b) { return a.w - b.w; });
  M.HS = HS; M.hs = hs;
  function byName(n) { return HS.filter(function (s) { return s.name === n; })[0]; }

  /* member resistance (IS 800): class from b/t of the flange, Md, Vd, Nd (buckling curve b – cold-formed / ERW hollow, Table 10) */
  function resist(s, fy, KL) {
    var eps = Math.sqrt(250 / fy), bt = (s.b - 3 * s.t) / s.t, dt = (s.h - 3 * s.t) / s.t, cls = Math.max(bt, dt) <= 33.5 * eps ? "Compact" : Math.max(bt, dt) <= 42 * eps ? "Semi-compact" : "Slender";
    var Md = (cls === "Compact" ? Math.min(s.Zpz, 1.2 * s.Zez) : s.Zez) * fy / 1.1 / 1e6, Vd = s.Av * fy / (Math.sqrt(3) * 1.1) / 1000;
    var r = Math.min(s.rz, s.ry), lam = Math.sqrt(fy * Math.pow(KL / r, 2) / (Math.PI * Math.PI * 2e5)), phi = 0.5 * (1 + 0.34 * (lam - 0.2) + lam * lam), fcd = Math.min(fy / 1.1, (fy / 1.1) / (phi + Math.sqrt(Math.max(phi * phi - lam * lam, 0))));
    return { cls: cls, bt: Math.max(bt, dt), eps: eps, Md: Md, Vd: Vd, Nd: fcd * s.A / 1000, fcd: fcd, lam: lam, KLr: KL / r };
  }
  function pick(list, ok) { for (var i = 0; i < list.length; i++) if (ok(list[i])) return list[i]; return list[list.length - 1]; }
  function design(c, tag, s, fy, N, Mu, Vu, KL, defl, dlim, why) {
    var r = resist(s, fy, KL);
    c.section(tag);
    c.let("Section", "", s.name + " (" + F(s.w, ".2f") + " kg/m)", "", "IS 4923", why || "");
    c.info("Section class", "b/t = " + F(r.bt, ".1f") + " (limit 33.5ε = " + F(33.5 * r.eps, ".1f") + " compact, 42ε semi-compact) → " + r.cls, "IS 800 Table 2");
    c.let("Design forces", "Nu / Mu / Vu", F(N, ".1f") + " / " + F(Mu, ".2f") + " / " + F(Vu, ".1f"), "kN / kN·m / kN", "IS 800 Table 4 combinations");
    var Md = c.calc("Design bending strength (closed section – no lateral-torsional buckling)", "Md", (r.cls === "Compact" ? "min(Zp, 1.2*Ze)" : "Ze") + "*fy/1.1/1e6", "kN·m", "IS 800 cl 8.2.1.2 / 8.2.2", { Zp: R(s.Zpz, 0), Ze: R(s.Zez, 0), fy: fy });
    c.check("Bending", Mu, Md, { unit: "kN·m", clause: "IS 800 cl 8.2" });
    c.check("Shear", Vu, r.Vd, { unit: "kN", clause: "IS 800 cl 8.4 (Av = A·D/(B+D))" });
    if (N > 0.01) {
      c.calc("Slenderness", "KL/r", "KL/r", "", "IS 800 cl 7.2", { KL: R(KL, 0), r: R(Math.min(s.rz, s.ry), 1) }); c.check("KL/r ≤ 180", r.KLr, 180, { unit: "", clause: "IS 800 Table 3" });
      var Nd = c.calc("Design compressive strength (buckling curve b)", "Nd", "fcd*A/1000", "kN", "IS 800 cl 7.1.2 / Table 10", { fcd: R(r.fcd, 1), A: R(s.A, 0) });
      c.check("Axial + bending: N/Nd + M/Md ≤ 1", N / Nd + Mu / Md, 1, { unit: "", clause: "IS 800 cl 9.3.1 (simplified, Ky = KLT = 1)" });
    }
    if (defl != null) c.check("Deflection (service)", defl, dlim, { unit: "mm", clause: "IS 800 Table 6" });
    return r;
  }

  /* ---------- rolled sections (IS 808): lightest that passes, checked with the IS 800 routines of DS.steel ---------- */
  var MEMB = ["Tubular – SHS / RHS (IS 4923, ERW tubes)", "Rolled – ISMB / ISMC (IS 808)"];
  function rolled(inp) { return /^Rolled/.test(String(inp.members)); }
  function SEC() { return DS.sections; } function ST() { return DS.steel; }
  function rsec(n) { var s = Object.assign({}, SEC().section(n)); s.t = s.tf; s.per = 2 * s.h + 4 * s.b - 2 * s.tw; return s; }
  function passes(fn) { var sc = new C.Calc("s"); fn(sc); return !sc.failures.length; }
  /* beam: gravity with the compression flange held by purlins / sheet (LLT = Lg), uplift with the other flange free (LLT = Lu) */
  function beamPick(names, fy, Mg, Mu, V, Lg, Lu, deflOk) {
    for (var i = 0; i < names.length; i++) { var s = rsec(names[i]);
      if (passes(function (sc) { ST().bending(sc, Mg, s, fy, Lg, Lg <= 0, "", "z"); if (Mu > 0) ST().bending(sc, Mu, s, fy, Lu, false, "", "z"); ST().shear_strength(sc, V, s, fy, ""); }) && deflOk(s)) return s; }
    return rsec(names[names.length - 1]);
  }
  function beamCalc(c, tag, s, fy, Mg, Mu, V, Lg, Lu, defl, dlim, why) {
    c.section(tag); c.let("Section", "", s.name + " (" + F(s.w, ".2f") + " kg/m)", "", "IS 808", why || "");
    ST().bending(c, Mg, s, fy, Math.max(Lg, 0.01), Lg <= 0, " (gravity – compression flange held " + (Lg <= 0 ? "by the sheeting" : "at " + F(Lg, ".2f") + " m") + ")", "z");
    if (Mu > 0) ST().bending(c, Mu, s, fy, Lu, false, " (wind uplift – other flange free over " + F(Lu, ".2f") + " m)", "z");
    ST().shear_strength(c, V, s, fy, ""); if (defl != null) c.check("Deflection (service)", defl, dlim, { unit: "mm", clause: "IS 800 Table 6" });
  }
  function postPick(names, fy, N, Mz, V, Hp) {
    for (var i = 0; i < names.length; i++) { var s = rsec(names[i]);
      if (passes(function (sc) { var cp = ST().compression(sc, N, s, fy, Hp, Hp, 2.0, 1.0, ""), bd = ST().bending(sc, Mz, s, fy, 2 * Hp, false, "", "z"); ST().shear_strength(sc, V, s, fy, ""); ST().combined(sc, N, Mz, cp, bd, s, fy, ""); })) return s; }
    return rsec(names[names.length - 1]);
  }

  var SCHEME = ["Two rows of posts – mono-slope roof", "One row of posts – T (roof on both sides)", "One row of posts – cantilever (Γ, roof on one side)", "Two rows of posts – duo-pitch (gable) roof", "One row of posts – Y / butterfly (valley gutter over the posts)"];
  function kind(inp) { var v = String(inp.scheme); return /duo-pitch/.test(v) ? "gable" : /butterfly/.test(v) ? "Y" : /^Two/.test(v) ? "two" : /T \(/.test(v) ? "T" : "cant"; }

  function run_cycle_shed(inp, mode) {
    var c = new C.Calc("Two-wheeler / cycle parking shed"), K = kind(inp), TWO = K === "two" || K === "gable", BOTH = K === "T" || K === "Y", fy = num(inp.fy_st);
    var W = num(inp.width), Lt = num(inp.length), bay0 = num(inp.bay), H = num(inp.height), th = num(inp.slope), ov = num(inp.overhang);
    var nb = Math.max(1, Math.round(Lt / bay0)), bay = Lt / nb, nf = nb + 1, t = Math.tan(th * Math.PI / 180), cs = Math.cos(th * Math.PI / 180);
    c.section("Layout");
    c.let("Scheme", "", String(inp.scheme), "", "");
    c.let("Covered width × length", "W × L", F(W, ".2f") + " × " + F(Lt, ".2f"), "m", "", Math.floor(Lt / 0.9) + " two-wheelers in one row at 0.9 m (≈ " + Math.floor(Lt / 0.9) * (W >= 4 ? 2 : 1) + " with two rows facing, W ≥ 4 m)");
    c.let("Frames", "n × s", nf + " frames, " + nb + " bays @ " + F(bay, ".2f"), "m", "", "bay spacing rounded to fit the length");
    var span = TWO ? W - 2 * ov : 0, arm = BOTH ? W / 2 : K === "cant" ? W - ov : 0;
    if (TWO) c.let("Posts c/c across (rafter span)", "Ls", F(span, ".2f"), "m", "", "overhang " + F(ov, ".2f") + " m each side");
    else c.let("Rafter cantilever from the post", "a", F(arm, ".2f"), "m", "", BOTH ? "roof on both sides of one row of posts" : "post at the back, " + F(ov, ".2f") + " m roof behind it");
    if (K === "cant" && arm > 4) c.warn("Long cantilever", "a cantilever over 4 m makes heavy posts and footings — two rows of posts are usually cheaper", "Practice");
    var Hhi = K === "gable" ? H + span / 2 * t : TWO ? H + span * t : K === "cant" ? H + arm * t : H + arm * t;   /* T: the post top; Y: the outer edges */
    c.let(K === "gable" ? "Height at the eaves / at the ridge" : K === "Y" ? "Height at the valley (posts) / at the outer edges" : K === "T" ? "Height at the edges / at the post" : "Clear height (low side) / height at the high post", "h / h2", F(H, ".2f") + " / " + F(Hhi, ".2f"), "m", "", "slope " + G(th) + "°" + (K === "Y" ? "; rain runs to a valley gutter over the posts and down pipes along the posts" : ""));

    /* loads */
    c.section("Loads (IS 875 Parts 1–3)");
    var gs = c.let("Roof sheeting + fixings", "gs", num(inp.sheet_dl), "kN/m²", "IS 875-1");
    if (inp.solar) { c.let("Solar panels + mounting rails on the roof", "gsol", 0.15, "kN/m²", "practice", "≈ 12 kg/m² panels + 3 kg/m² rails; panel wind is taken by the roof"); gs = gs + 0.15; }
    var qk = c.calc("Live load on the roof (no access)", "qk", th <= 10 ? "0.75" : "max(0.4, 0.75 - 0.02*(th - 10))", "kN/m²", "IS 875-2 Table 2", { th: th });
    var pd = LD().design_wind_pressure(c, num(inp.vb), Math.max(Hhi, 3), Math.trunc(num(inp.terrain)), num(inp.k1), num(inp.k3), 1.0, W * bay, 0.9, 0.9);
    var duo = BOTH || K === "gable", cpd = 0.5, cpu = duo ? 1.2 : 1.3, cpl = 1.8;
    c.info("Net pressure coefficients, free-standing canopy", "frames: +" + cpd + " down / −" + cpu + " up (" + (duo ? (K === "Y" ? "troughed (butterfly), one side down while the other lifts" : "duo-pitch, one side down while the other lifts") : "mono-pitch, empty or partly blocked") + "); purlins and sheeting (edge zones): −" + cpl, "IS 875-3 cl 7.3.3.7, Tables 17 / 18 [APPROX – verify]");
    var wdn = c.calc("Wind down on the canopy", "wd", "cpd*pd", "kN/m²", "", { cpd: cpd, pd: R(pd, 3) }), wup = c.calc("Wind uplift on the canopy", "wu", "cpu*pd", "kN/m²", "", { cpu: cpu, pd: R(pd, 3) });

    /* purlins */
    c.section("Roof sheet & purlins");
    var wsE = 1.5 * cpl * pd - 0.9 * gs, sMaxSh = R(Math.min(1.5, 1.5 * Math.sqrt(1.5 / Math.max(wsE, 1.5))), 2);
    c.calc("Largest purlin spacing the 0.50 mm sheet takes under the edge uplift", "s,sheet", "min(1.5, 1.5*sqrt(1.5/max(ws, 1.5)))", "m", "manufacturer load–span tables [APPROX – verify]", { ws: R(wsE, 3) });
    var smax = Math.min(num(inp.purlin_s), sMaxSh), np = Math.max(2, Math.ceil((W / cs) / smax - 1e-9) + 1), sp = (W / cs) / (np - 1);
    c.let("Purlins across the roof / spacing on the slope", "n / sp", np + " / " + F(sp, ".2f"), "nos / m", "0.50 mm profiled sheet: span ≤ 1.5 m (manufacturer tables – verify)");
    var wpu_d = (1.5 * (gs + qk)) * sp, wpu_u = (1.5 * cpl * pd - 0.9 * gs) * sp, Mp = Math.max(wpu_d, wpu_u) * bay * bay / 8;
    c.calc("Purlin moment, simply supported over the bay (worst of 1.5(DL+LL) and 1.5 WL uplift − 0.9 DL)", "Mp", "max(wd, wu)*s**2/8", "kN·m", "", { wd: R(wpu_d, 3), wu: R(wpu_u, 3), s: R(bay, 3) });
    var RL = rolled(inp), fyr0 = RL ? 250 : fy, Mpg = wpu_d * bay * bay / 8, Mpu = Math.max(0, wpu_u) * bay * bay / 8, dfl = function (s) { return 5 * (gs + qk) * sp * Math.pow(bay * 1000, 4) / (384 * 2e5 * s.Iz); }, purl, dP;
    if (RL) { purl = beamPick(SEC().by_weight(SEC().ISMC), 250, Mpg, Mpu, Math.max(wpu_d, wpu_u) * bay / 2, 0, bay, function (s) { return dfl(s) <= bay * 1000 / 150; }); dP = dfl(purl);
      beamCalc(c, "Purlin (" + purl.name + ")", purl, 250, Mpg, Mpu, Math.max(wpu_d, wpu_u) * bay / 2, 0, bay, dP, bay * 1000 / 150, "lightest ISMC that passes; toes up the slope, on cleats; sag rod at mid-span if the bay is over 4 m"); }
    else { purl = pick(HS, function (s) { var r = resist(s, fy, 1e3); return r.cls !== "Slender" && r.Md >= Mp && dfl(s) <= bay * 1000 / 150 && s.h >= 50; }); dP = dfl(purl);
      design(c, "Purlin (" + purl.name + ")", purl, fy, 0, Mp, Math.max(wpu_d, wpu_u) * bay / 2, 1e3, dP, bay * 1000 / 150, "lightest hollow section that passes; long side vertical, screwed to cleats on the rafter"); }
    var gk = gs + purl.w * 9.81e-3 / sp;   /* sheeting + purlins per m² of roof */

    /* frames */
    var Hw = pd * bay * W * (cpu * Math.sin(th * Math.PI / 180) + 0.05), raf, post, Nr, Mr, Vr, Np, Mpost, Vpost, Rup, Rdown;
    var wG = (gk) * bay, wQ = qk * bay, wD = wdn * bay, wU = wup * bay;
    c.section("Frame forces (per frame, bay " + F(bay, ".2f") + " m)");
    c.calc("Horizontal wind on the canopy (inclined pressure + friction 0.05)", "Hw", "pd*s*W*(cpu*sin(th) + 0.05)", "kN", "IS 875-3 cl 7.4.3 [APPROX]", { pd: R(pd, 3), s: R(bay, 3), W: W, cpu: cpu, th: th * Math.PI / 180 });
    if (TWO) {
      var w1 = 1.5 * (wG + wQ), w2 = 1.2 * (wG + wQ + wD), w3 = 1.5 * wU - 0.9 * wG, wmax = Math.max(w1, w2, w3);
      Mr = c.calc("Rafter moment, simply supported on two posts (worst of 1.5(DL+LL), 1.2(DL+LL+WL), 1.5 WL − 0.9 DL)", "Mr", "w*Ls**2/8", "kN·m", "", { w: R(wmax, 3), Ls: R(span, 3) });
      Mr = Math.max(Mr, wmax * ov * ov / 2); Vr = wmax * (span / 2 + ov); Nr = 0;
      Rdown = Math.max(w1, w2) * W / 2; Rup = Math.max(0, w3) * W / 2;
      Np = c.calc("Post: axial (gravity), each", "Np", "max(w1, w2)*W/2", "kN", "", { w1: R(w1, 3), w2: R(w2, 3), W: W });
      Mpost = c.calc("Post: moment at the base — posts fixed at the base share the horizontal wind (taller post)", "Mpost", "1.5*Hw/2*h2", "kN·m", "", { Hw: R(Hw, 3), h2: R(Hhi, 3) });
      Vpost = 1.5 * Hw / 2;
    } else {
      var a = arm, s1 = 1.5 * (wG + wQ), sL = 1.5 * wG, sD = 0.9 * wG + 1.5 * wD, sU = 1.5 * wU - 0.9 * wG;
      Mr = c.calc("Rafter moment at the post (cantilever, worst of 1.5(DL+LL) and 1.5 WL − 0.9 DL)", "Mr", "max(w1, wu)*a**2/2", "kN·m", "", { w1: R(s1, 3), wu: R(Math.max(sU, 0), 3), a: R(a, 3) });
      Vr = Math.max(s1, sU) * a; Nr = 0;
      if (BOTH) {
        var Mun = c.calc("Unbalanced: one side DL+LL, other side DL only", "M1", "(w1 - wl)*a**2/2", "kN·m", "", { w1: R(s1, 3), wl: R(sL, 3), a: R(a, 3) });
        var Mwd = c.calc("Wind: one side down, the other side lifting", "M2", "(wd + wu)*a**2/2", "kN·m", "", { wd: R(sD, 3), wu: R(Math.max(sU, 0), 3), a: R(a, 3) });
        Mpost = c.calc("Post moment at the base", "Mpost", "max(M1, M2) + 1.5*Hw*h", "kN·m", "", { M1: R(Mun, 3), M2: R(Mwd, 3), Hw: R(Hw, 3), h: R(K === "T" ? Hhi : H, 3) });
        Np = c.calc("Post axial (gravity, both sides loaded)", "Np", "w1*W", "kN", "", { w1: R(s1, 3), W: W });
        Rdown = Np; Rup = Math.max(0, sU) * W;
      } else {
        Mpost = c.calc("Post moment at the base", "Mpost", "Mr + 1.5*Hw*h2", "kN·m", "", { Mr: R(Mr, 3), Hw: R(Hw, 3), h2: R(Hhi, 3) });
        Np = c.calc("Post axial (gravity)", "Np", "w1*a", "kN", "", { w1: R(s1, 3), a: R(a, 3) }); Rdown = Np; Rup = Math.max(0, sU) * a;
      }
      Vpost = 1.5 * Hw;
    }
    /* rafter and post sizes */
    /* smallest fillet weld at the base (with stiffeners if needed) — the post wall must take it */
    var wNeed = function (Mu, Nu, s0) { var b2 = s0.b + 300, d2 = s0.h + 300, f0 = Mu * 1e6 / (s0.b * s0.h + s0.h * s0.h / 3) + Math.abs(Nu) * 1e3 / (2 * (s0.b + s0.h)), f2 = Mu * 1e6 / (b2 * d2 + d2 * d2 / 3) + Math.abs(Nu) * 1e3 / (2 * (b2 + d2)), fw = 410 / (Math.sqrt(3) * 1.25);
      var mn = Math.min(5, Math.floor(s0.t)), a = Math.max(mn, Math.ceil(f0 / (0.7 * fw))); return a <= s0.t ? a : Math.max(mn, Math.ceil(f2 / (0.7 * fw))); };
    var Ls = TWO ? span : arm, defR = function (s) { return TWO ? 5 * (wG + wQ) * Math.pow(Ls * 1000, 4) / (384 * 2e5 * s.Iz) : (wG + wQ) * Math.pow(Ls * 1000, 4) / (8 * 2e5 * s.Iz); }, limR = TWO ? Ls * 1000 / 180 : Ls * 1000 / 90;
    var Hp = K === "gable" ? H : TWO ? Hhi : K === "cant" ? Hhi : K === "T" ? Hhi : H, KL = 2.0 * Hp * 1000;
    if (RL) {
      /* rafter: gravity – top flange held by the purlins (two posts) / bottom flange in compression at the post, free over the cantilever; uplift – the other flange free */
      var Mrg = Mr, Mru = TWO ? Math.max(0, 1.5 * wU - 0.9 * wG) * span * span / 8 : Math.max(0, 1.5 * wU - 0.9 * wG) * arm * arm / 2, Lg = TWO ? sp : arm, Lu = TWO ? span : sp;
      raf = beamPick(SEC().by_weight(SEC().ISMB).concat(SEC().by_weight(SEC().ISMC)).sort(function (a, b) { return SEC().section(a).w - SEC().section(b).w; }), 250, Mrg, Mru, Vr, Lg, Lu, function (s) { return defR(s) <= limR && s.h >= 100; });
      beamCalc(c, "Rafter (" + raf.name + ")", raf, 250, Mrg, Mru, Vr, Lg, Lu, defR(raf), limR, "lightest ISMB / ISMC that passes bending (with LTB), shear and deflection");
      post = postPick(SEC().by_weight(SEC().ISMB).concat(SEC().by_weight(SEC().ISHB)).sort(function (a, b) { return SEC().section(a).w - SEC().section(b).w; }).filter(function (n) { return SEC().section(n).h >= 125; }), 250, Np, Mpost, Vpost, Hp);
      c.section("Post (" + post.name + ")"); c.let("Section", "", post.name + " (" + F(post.w, ".2f") + " kg/m)", "", "IS 808", "web across the shed; fixed at the base, free at the top across the shed (Kz = 2.0), held along the shed by the eave tie and end-bay bracing (Ky = 1.0)");
      var cpP = ST().compression(c, Np, post, 250, Hp, Hp, 2.0, 1.0, ""), bdP = ST().bending(c, Mpost, post, 250, 2 * Hp, false, "", "z"); ST().shear_strength(c, Vpost, post, 250, ""); ST().combined(c, Np, Mpost, cpP, bdP, post, 250, "");
    } else {
    raf = pick(HS, function (s) { var r = resist(s, fy, 1e3); return r.cls !== "Slender" && r.Md >= Mr && r.Vd >= Vr && defR(s) <= limR && s.h >= 72; });
    design(c, "Rafter (" + raf.name + ")", raf, fy, Nr, Mr, Vr, 1e3, defR(raf), limR, "lightest that passes bending, shear and deflection (L/" + (TWO ? 180 : "90 for a cantilever tip") + ")");
    post = pick(HS.filter(function (s) { return s.family === "SHS"; }), function (s) { var r = resist(s, fy, KL); return r.cls !== "Slender" && r.KLr <= 180 && Np / r.Nd + Mpost / r.Md <= 1 && r.Vd >= Vpost && s.h >= Math.max(raf.b, 72) && wNeed(Mpost, Np, s) <= s.t; });
    design(c, "Post (" + post.name + ")", post, fy, Np, Mpost, Vpost, KL, null, null, "square hollow section, fixed at the base, free at the top across the shed (K = 2.0)");
    }
    var fwd = 410 / (Math.sqrt(3) * 1.25), J = { gus: false, gusB: false };
    /* fillet weld all round a hollow section (b × d mm, bending about the axis parallel to b); stiffeners 150 high on the four faces when the wall is too thin */
    var weldRing = function (tag, Mu, Nu, b, d, tw) {
      var f = Mu * 1e6 / (b * d + d * d / 3) + Math.abs(Nu) * 1e3 / (2 * (b + d));
      var s1 = c.calc(tag + ": weld size needed (fillet all round, fwd = fu/(√3·γmw), fu 410)", "s", "f/(0.7*fwd)", "mm", "IS 800 cl 10.5.7.1.1", { f: R(f, 2), fwd: R(fwd, 1) }), sP = Math.max(Math.min(5, Math.floor(tw)), Math.ceil(s1));   /* IS 800 cl 10.5.2.3: 5 mm for the thick plate, but not more than the tube wall */
      if (sP <= tw) { c.check(tag + ": weld size ≤ wall " + G(tw) + " mm", sP, tw, { unit: "mm", clause: "IS 800 cl 10.5.2" }); return { s: Math.min(sP, Math.floor(tw)), gus: false }; }
      var b2 = b + 300, d2 = d + 300, f2 = Mu * 1e6 / (b2 * d2 + d2 * d2 / 3) + Math.abs(Nu) * 1e3 / (2 * (b2 + d2));
      var s2 = c.calc(tag + ": with 4 stiffener plates 8 mm × 150 (one on each face) — weld size", "s", "f2/(0.7*fwd)", "mm", "IS 800 cl 10.5.7 [APPROX: stiffeners widen the weld group]", { f2: R(f2, 2), fwd: R(fwd, 1) });
      c.check(tag + ": weld size with stiffeners ≤ wall " + G(tw) + " mm", Math.max(Math.min(5, Math.floor(tw)), Math.ceil(s2)), tw, { unit: "mm", clause: "IS 800 cl 10.5.2" }); return { s: Math.max(Math.min(5, Math.floor(tw)), Math.min(Math.ceil(s2), Math.floor(tw))), gus: true };
    };
    /* fillet welds of an I-section to a plate: flanges take the moment, web the shear */
    var weldI = function (tag, Mu, Nu, s0) { var Ff = Mu * 1e6 / (s0.h - s0.tf) + Math.abs(Nu) * 1e3 / 2, Lw = 2 * s0.b - s0.tw;
      var s1 = c.calc(tag + ": flange weld size (flange force / weld length)", "s", "Ff/(Lw*0.7*fwd)", "mm", "IS 800 cl 10.5.7", { Ff: R(Ff, 0), Lw: R(Lw, 0), fwd: R(fwd, 1) }), sP = Math.max(5, Math.ceil(s1));
      c.check(tag + ": weld size ≤ flange " + G(s0.tf) + " mm", sP, s0.tf, { unit: "mm", clause: "IS 800 cl 10.5.2" }); return { s: sP, gus: false }; };
    var b16 = 0.9 * 400 * 0.78 * area(16) / 1.25 / 1000, v16 = 400 * 0.78 * area(16) / (Math.sqrt(3) * 1.25) / 1000;
    c.section("Rafter to post joint");
    if (TWO) {
      var upJ = Rup / 2 > 0 ? Rup / 2 : 0; c.let("Joint type", "", RL ? "rafter on a cap plate " + G(post.b + 40) + " × " + G(post.h + 40) + " × 10, 2-M16 bolts through the rafter flange" : "rafter seated on a cap plate " + G(post.b + 40) + " sq × 10 welded to the post; rafter welded all round to the cap", "", "", "simply supported on the posts; the posts are fixed at the base");
      if (RL) { c.check("Bolt tension from wind uplift (2-M16)", upJ, 2 * b16, { unit: "kN", clause: "IS 800 cl 10.3.5" }); c.check("Bolt shear from the wind across (2-M16)", Vpost, 2 * v16, { unit: "kN", clause: "IS 800 cl 10.3.3" }); J.top = "cap plate " + G(post.b + 40) + "×" + G(post.h + 40) + "×10, 2-M16 bolts"; }
      else { var sw5 = Math.min(5, Math.floor(raf.t)), capW = 0.7 * sw5 * fwd * 2 * (raf.b + raf.h) / 1000; c.check("Weld of the rafter to the cap (" + sw5 + " mm all round) against uplift + shear", upJ + Vpost, capW, { unit: "kN", clause: "IS 800 cl 10.5.7" }); J.top = "cap plate " + G(post.b + 40) + " sq × 10, " + sw5 + " mm fillet all round"; }
      J.Mj = 0;
    } else {
      var Mj = K === "cant" ? Mr : Math.max(Mun, Mwd); J.Mj = Mj;
      c.let("Joint type", "", "rigid (moment) joint — the rafter runs over the post top" + (K === "cant" ? " with a knee brace" : ""), "", "", "joint moment " + F(Mj, ".2f") + " kN·m");
      if (RL) { var lev = (post.h + 80) / 1000, Tj = c.calc("Bolt tension, rafter flange to post cap plate (2 bolts each side)", "T", "Mj/lever/2", "kN per bolt", "", { Mj: R(Mj, 3), lever: R(lev, 3) });
        var fuj = 400, dj = [16, 20, 24, 27].filter(function (d) { return 0.9 * 400 * 0.78 * area(d) / 1.25 / 1000 >= Tj; })[0]; if (!dj) { fuj = 800; dj = [16, 20, 24, 27, 30].filter(function (d) { return 0.9 * 800 * 0.78 * area(d) / 1.25 / 1000 >= Tj; })[0] || 30; }
        var Tdj = 0.9 * fuj * 0.78 * area(dj) / 1.25 / 1000; c.check("Bolt tension (4-M" + dj + ", grade " + (fuj === 800 ? "8.8" : "4.6") + ")", Tj, Tdj, { unit: "kN", clause: "IS 800 cl 10.3.5" });
        var tcap = Math.max(12, ceil_to(c.calc("Cap plate thickness (bolt 40 mm from the flange, 120 mm width)", "tc", "sqrt(4*T*1000*40*1.1/(120*250))", "mm", "IS 800 cl 10.4 [APPROX]", { T: R(Tj, 3) }), 2));
        var wj = weldI("Post to cap plate", Mj, Np, post); J.top = "cap plate " + G(post.b + 80) + "×" + G(post.h + 160) + "×" + G(tcap) + ", 4-M" + dj + " bolts, " + wj.s + " mm fillet to the post; web stiffeners in the rafter over the post flanges"; }
      else { var wt = weldRing("Post top to the rafter (through a 12 mm cap plate)", Mj, Np, post.b, post.h, post.t); J.gus = wt.gus; J.top = "12 mm cap plate, " + wt.s + " mm fillet all round" + (wt.gus ? " + 4 stiffener plates 8 × 150" : "") + "; rafter welded all round to the cap"; }
    }
    if (K === "cant") c.info("Knee brace", "SHS 60 × 60 from the post at 0.9 m below the rafter to the rafter at 1.2 m from the post — takes the rafter moment off the joint [practice]", "Practice");

    /* bracing along the shed and the eave tie */
    c.section("Bracing & eave tie (along the shed)");
    var rws = TWO ? 2 : 1, Hl = c.calc("Wind along the shed: friction on the roof (0.05) + the end frame (Cf 2.0)", "HL", "pd*(0.05*W/cs*L + 2.0*(rh*W + rows*pb*Hp))", "kN", "IS 875-3 cl 7.4.2 / 7.4.3 [APPROX]", { pd: R(pd, 3), W: W, cs: R(cs, 4), L: Lt, rh: R(raf.h / 1000, 3), rows: rws, pb: R(post.b / 1000, 3), Hp: R(Hp, 2) });
    var dg = Math.sqrt(bay * bay + Hp * Hp), Tr = c.calc("Tension in one bracing rod (1.5 HL shared by the two end bays and the " + rws + " post line" + (rws > 1 ? "s" : "") + ")", "Tr", "1.5*HL/(2*rows)*diag/s", "kN", "", { HL: R(Hl, 3), rows: rws, diag: R(dg, 3), s: R(bay, 3) });
    var dR = [12, 16, 20, 24].filter(function (d) { return 0.9 * 410 * 0.78 * area(d) / 1.25 / 1000 >= Tr; })[0] || 25, Tdr = c.calc("Tension capacity of a threaded rod Ø" + dR + " (fu 410, root area 0.78 A)", "Tdn", "0.9*410*0.78*pi*d**2/4/1.25/1000", "kN", "IS 800 cl 6.3.1", { d: dR });
    c.check("Bracing rod " + dR + "Ø with turnbuckle", Tr, Tdr, { unit: "kN", clause: "IS 800 cl 6.3" });
    var Nt = 1.5 * Hl / rws, tie = pick(HS.filter(function (x) { return x.family === "SHS"; }), function (x) { var r = resist(x, fy, bay * 1000); return r.cls !== "Slender" && r.KLr <= 180 && Nt / r.Nd <= 1; });
    design(c, "Eave tie (" + tie.name + ")", tie, fy, Nt, 0.001, 0, bay * 1000, null, null, "strut along the post tops between the frames, carries the wind along the shed to the braced bays");
    J.rod = dR; J.tie = tie;

    /* fixing the roof sheet */
    c.section("Roof sheet fixing (wind uplift at the edges)");
    var Fs = c.calc("Pull on one screw (screws at every second crest, 0.40 m, on each purlin)", "Fs", "ws*sp*0.40", "kN", "", { ws: R(wsE, 3), sp: R(sp, 3) });
    var capS = Math.min(0.9, RL ? 2.5 : (purl.t >= 2.9 ? 2.0 : 1.4));
    c.info("Screw capacity", "5.5 mm self-drilling screw with 16 mm EPDM-bonded washer: pull-over through 0.50 mm sheet ≈ 0.9 kN, pull-out from the purlin ≈ " + (RL ? "2.5" : purl.t >= 2.9 ? "2.0" : "1.4") + " kN (design values — verify with the maker)", "manufacturer data [APPROX]");
    if (Fs <= capS) { c.check("Screw pull ≤ capacity", Fs, capS, { unit: "kN", clause: "practice" }); J.screws = "every second crest (0.40 m)"; }
    else { var Fs2 = c.calc("At the edges: screws at every crest (0.20 m) within 1.0 m of the eaves and the ends", "Fs", "ws*sp*0.20", "kN", "", { ws: R(wsE, 3), sp: R(sp, 3) }); c.check("Screw pull at every crest ≤ capacity", Fs2, capS, { unit: "kN", clause: "practice" }); J.screws = "every second crest; every crest within 1 m of the edges"; }

    /* base plate, anchor bolts */
    c.section("Base plate & anchor bolts (fixed base)");
    var Ms = Mpost / 1.4, lever = (post.h + 100) / 1000, Tall = Mpost / lever;
    /* the lightest arrangement that takes the pull: 4 bolts grade 4.6, then 4 / 6 / 8 bolts grade 8.8 */
    var tryB = [[4, 4.6], [4, 8.8], [6, 8.8], [8, 8.8]].map(function (g) { var fu = g[1] === 8.8 ? 800 : 400, T1 = Tall / (g[0] / 2), d = [16, 20, 24, 27, 30].filter(function (dd) { return 0.9 * fu * 0.78 * area(dd) / 1.25 / 1000 >= T1; })[0]; return { n: g[0], gr: g[1], fu: fu, T: T1, d: d }; }).filter(function (o) { return o.d; })[0] || { n: 8, gr: 8.8, fu: 800, T: Tall / 4, d: 30 };
    var nBolt = tryB.n, db = tryB.d, gBolt = tryB.gr;
    var Tb = c.calc("Tension in the " + nBolt / 2 + " bolts on one side", "T", "Mu/lever/" + nBolt / 2, "kN per bolt", "", { Mu: R(Mpost, 3), lever: R(lever, 3) });
    var Tdb = c.calc("Tension capacity of one bolt (grade " + gBolt + ")", "Tdb", "0.9*fu*0.78*pi*d**2/4/1.25/1000", "kN", "IS 800 cl 10.3.5", { fu: tryB.fu, d: db }); c.check("Bolt tension", Tb, Tdb, { unit: "kN", clause: "IS 800 cl 10.3.5" }); J.bolts = nBolt + "-M" + G(db) + (gBolt === 8.8 ? " (8.8)" : "");
    var La = c.calc("Anchor length (bond 1.2 N/mm², ≥ 20d)", "La", "max(T*1000/(pi*d*1.2), 20*d)", "mm", "IS 456 cl 26.2.1", { T: R(Tb, 3), d: db });
    var Bp = ceil_to(Math.max(post.h, post.b) + 150, 10);
    while (Np * 1000 / (Bp * Bp) + 6 * Mpost * 1e6 / Math.pow(Bp, 3) > 0.45 * num(inp.fck) && Bp < 900) Bp += 20;   /* a larger plate where the bearing needs it */
    var pa = (Bp - Math.min(post.h, post.b)) / 2;
    var wb = c.calc("Bearing pressure under the plate (axial + moment, plate " + G(Bp) + " sq)", "w", "Np*1000/B**2 + 6*Mu*1e6/B**3", "N/mm²", "", { Np: R(Np, 3), Mu: R(Mpost, 3), B: Bp });
    c.check("Bearing ≤ 0.45 fck", wb, 0.45 * num(inp.fck), { unit: "N/mm²", clause: "IS 800 cl 7.4.1" });
    var tp = c.calc("Base plate thickness (projection a = b)", "tp", "max(sqrt(2.5*w*(a**2 - 0.3*a**2)*1.1/250), tpost, 12)", "mm", "IS 800 cl 7.4.3.1", "stiffeners 6 mm on the four sides", { w: R(wb, 3), a: pa, tpost: post.t });
    tp = ceil_to(tp, 2);
    c.let("Base plate", "", G(Bp) + " × " + G(Bp) + " × " + G(tp) + " mm, " + nBolt + "-M" + G(db) + (gBolt === 8.8 ? " (8.8)" : "") + " × " + G(ceil_to(La + 100, 50)) + " long, stiffeners 6 mm on four sides", "", "IS 800 cl 7.4");
    var wb2 = RL ? weldI("Post to base plate", Mpost, Np, post) : weldRing("Post to base plate", Mpost, Np, post.b, post.h, post.t); J.base = wb2.s + " mm fillet all round" + (wb2.gus ? " + 4 stiffeners 8 × 150" : " + 4 stiffeners 6 mm"); J.gusB = wb2.gus;

    /* footing */
    c.section("Isolated footing (bearing, overturning, uplift)");
    var fck = num(inp.fck), fyr = num(inp.fy), sbc = num(inp.sbc), Df = num(inp.found_depth), gam = num(inp.gamma), ped = num(inp.ped_above), cover = num(inp.cover), a0 = Math.max(400, ceil_to(Bp + 150, 50)) / 1000;
    var Pg = (Rdown / 1.5), Pu = Rup / 1.5, Mb = Ms + (Vpost / 1.5) * (Df + ped), tf = 0.3, res = null;
    function trial(B2) { var Wf = 25 * B2 * B2 * tf + 25 * a0 * a0 * (Df - tf + ped) + gam * (B2 * B2 - a0 * a0) * (Df - tf), Pmin = Wf - Pu, Pmax = Wf + Pg, e = Mb / Math.max(Pmin, 1e-6);
      var pmax = Mb / Math.max(Pmax, 1e-6) <= B2 / 6 ? Pmax / (B2 * B2) * (1 + 6 * (Mb / Pmax) / B2) : 2 * Pmax / (3 * B2 * (B2 / 2 - Mb / Pmax));
      return { B: B2, Wf: Wf, Pmin: Pmin, Pmax: Pmax, e: e, pmax: pmax, fos: Pmin * B2 / 2 / Math.max(Mb, 1e-6), up: Wf / Math.max(Pu, 1e-6), ok: Pmin > 0 && Pmin * B2 / 2 / Math.max(Mb, 1e-6) >= 1.5 && Wf >= 1.5 * Pu && pmax <= 1.25 * sbc && Mb / Pmax < B2 / 2 }; }
    for (var B2 = 0.8; B2 <= 4.0 + 1e-9; B2 = R(B2 + 0.1, 2)) { res = trial(B2); if (res.ok) break; }
    c.let("Footing", "B × B × t", F(res.B, ".2f") + " × " + F(res.B, ".2f") + " × " + G(tf * 1000), "m, mm", "", "founded " + F(Df, ".2f") + " m below GL, pedestal " + G(a0 * 1000) + " sq, " + F(ped, ".2f") + " m above GL");
    c.calc("Service moment at the footing base", "Mb", "Ms + V*(Df + hp)", "kN·m", "", { Ms: R(Ms, 3), V: R(Vpost / 1.5, 3), Df: Df, hp: ped });
    c.check("Uplift: weight of footing + soil ≥ 1.5 × wind uplift", 1.5 * Pu, res.Wf, { unit: "kN", clause: "IS 800 Table 4 / practice" });
    c.check("Overturning FoS ≥ 1.5 (least vertical load)", 1.5, res.fos, { unit: "", clause: "IS 1904 / practice", mode: "<=", note: "FoS = " + F(res.fos, ".2f") });
    c.check("Max. soil pressure ≤ 1.25 SBC (wind)", res.pmax, 1.25 * sbc, { unit: "kN/m²", clause: "IS 1904 cl 5.3" });
    var cant = (res.B - a0) / 2, Mf = res.pmax * cant * cant / 2;
    var bars = X().designStrip(c, 1.5 * Mf, tf * 1000, Math.max(cover, 50), fck, fyr, "footing, bottom (each way)", { Ms: Mf, Amin: { As: 0.0012 * 1000 * tf * 1000, label: "Minimum steel", clause: "IS 456 cl 34.5" }, Vu: 1.5 * res.pmax * Math.max(cant - (tf - 0.06), 0), dias: [10, 12], rule: DT() ? { member: "footing", role: "main" } : null });
    var dF = bars.d || (tf * 1000 - Math.max(cover, 50) - bars.dia / 2), ptF = (bars.Ast_prov || 1000 * area(bars.dia) / bars.spacing) / (10 * dF), tcF = DS.materials.tau_c(ptF, fck), x1F = cant - dF / 1000;
    if (x1F > 0) { var tvF = c.calc("One-way shear at d from the pedestal (per m width)", "τv", "1.5*p*x*1000/(1000*d)", "N/mm²", "IS 456 cl 34.2.4.1(a)", { p: R(res.pmax, 2), x: R(x1F, 3), d: R(dF, 0) }); c.check("One-way shear ≤ τc (pt " + F(ptF, ".2f") + " %)", tvF, tcF, { unit: "N/mm²", clause: "IS 456 Table 19" }); }
    else c.info("One-way shear", "the critical section (d from the pedestal) falls outside the footing — no check needed", "IS 456 cl 34.2.4.1(a)");
    var crF = a0 + dF / 1000, tpF = c.calc("Punching shear at d/2 round the pedestal", "τp", "1.5*P*(1 - c**2/B**2)*1000/(4*c*1000*d)", "N/mm²", "IS 456 cl 31.6.2", { P: R(Pg, 2), c: R(crF, 3), B: res.B, d: R(dF, 0) });
    c.check("Punching ≤ 0.25 √fck", tpF, 0.25 * Math.sqrt(fck), { unit: "N/mm²", clause: "IS 456 cl 31.6.3.1" });
    c.section("Pedestal");
    var AsP = c.calc("Longitudinal steel (pedestal far larger than the load needs: 0.5 % of the gross area)", "Asc", "0.005*a**2", "mm²", "IS 456 cl 26.5.3.1(h) / practice", { a: a0 * 1000 }), pB = [[4, 12], [4, 16], [8, 12], [4, 20], [8, 16], [8, 20]].filter(function (o) { return o[0] * area(o[1]) >= AsP; })[0] || [8, 20];
    c.let("Pedestal bars", "", pB[0] + "-" + pB[1] + "Ø + 8Ø ties @ 150 (3 ties at 75 just below the base plate)", "", "IS 456 cl 26.5.3.2", "the anchor bolts sit inside the cage"); J.ped = pB;

    /* checks & notes */
    var kgm2 = (nf * (TWO ? 2 : 1) * post.w * (Hp + 0.1) + nf * raf.w * (W / cs) + np * purl.w * Lt) / (W * Lt);
    c.thumb("Steel per m² of roof", RL ? 22 : 16, kgm2, "kg/m²", RL ? "light canopies in rolled sections 18–30 kg/m²" : "light tubular canopies 12–22 kg/m²", "Practice");
    c.miss(RL ? "Zinc-rich / red-oxide primer + 2 coats enamel; purlin cleats ISA 50 × 50 × 6 with 2-M12 bolts" : "Hot-dip galvanising or zinc-rich primer + 2 coats enamel; seal tube ends with welded caps; drain holes at the post bottom", RL ? "Practice" : "IS 4923 / practice", "Important");
    c.miss("Floor: PCC / paver block with 1:60 fall to a drain along the open side; wheel stoppers / cycle stands as required", "Practice", "Advisory");
    if (isMine()) c.miss("Mine / coal area: add coal-dust load on the roof (0.5 kN/m² typical) and use epoxy / PU paint", "Practice", "Important");

    /* BBS */
    var bbs = [], B_ = BB(), run = res.B * 1000 - 2 * Math.max(cover, 50), leg = Math.max(B_.leg(bars.dia, 150), 150), nP = nf * (TWO ? 2 : 1);
    bbs.push(B_.row("Footing", "F1a", bars.dia, "U (legs up)", 2 * B_.count(res.B * 1000, bars.spacing, 75) * nP, B_.ubar(bars.dia, run, leg), "bottom mesh both ways @ " + G(bars.spacing)));
    var hP = (Df + ped) * 1000 - 100;
    bbs.push(B_.row("Pedestal", "F1b", J.ped[1], "L (foot into footing)", J.ped[0] * nP, B_.lbar(J.ped[1], hP, 300), J.ped[0] + "-" + J.ped[1] + "Ø vertical"));
    bbs.push(B_.row("Pedestal", "F1c", 8, "tie", B_.count(hP, 150, 50) * nP, B_.stirrup(8, a0 * 1000, a0 * 1000, 40), "8Ø ties @ 150"));

    /* quantities */
    var qty = [], postL = TWO ? (H + Hhi) / 2 + 0.1 : Hp + 0.1, rafL = W / cs + 0.1;
    var kgPost = nP * post.w * postL, kgRaf = nf * raf.w * rafL, kgPur = np * purl.w * (Lt + 0.2), kgPlate = nP * (Bp * Bp * tp + 4 * 0.5 * 100 * 100 * 6) * 7.85e-6 + nf * 3 * 0.12 * 0.12 * 0.008 * 7850 + np * nf * 0.4;
    var kgRod = area(J.rod) * 7.85e-3, kgBr = (rws * 2 + 2) * 2 * Math.sqrt(bay * bay + Math.pow(Hp, 2)) * kgRod + rws * Lt * J.tie.w;
    qty.push(Q(RL ? "Structural steel work in single sections (ISMB / ISMC) – posts, rafters, purlins, cut, hoisted, fixed with cleats / bolts / welds, with primer" : "Steel work in tubular sections (ERW hollow sections, IS 4923) – posts, rafters, purlins, cut, welded, hoisted, fixed, with primer", "kg",
      [row("Posts " + post.name, nP, postL, post.w), row("Rafters " + raf.name, nf, rafL, raf.w), row("Purlins " + purl.name + " (" + np + " lines)", np, Lt + 0.2, purl.w)], [CPWD(), RL ? "10.1" : "10.16.3"]));
    qty.push(Q("Structural steel in plates (base plates, stiffeners, cap / end plates, purlin cleats) incl. priming", "kg", [row("Plates and cleats", 1, kgPlate)], [CPWD(), "10.2"]));
    qty.push(Q("MS rod bracing " + J.rod + " mm with turnbuckles (end bays: post lines and roof) and eave tie " + J.tie.name, "kg", [row("Bracing rods " + J.rod + "Ø", 1, (rws * 2 + 2) * 2 * Math.sqrt(bay * bay + Hp * Hp) * kgRod), row("Eave tie " + J.tie.name, rws, Lt, J.tie.w)], [CPWD(), "10.1"]));
    qty.push(Q("MS holding-down bolts with nuts & washers", "kg", [row(nBolt + " bolts per post (kg = π/4·d²·L·7.85e-6)", nP * nBolt, area(db) * (La + 200) * 7.85e-6)], [CPWD(), "10.19"]));
    qty.push(Q("Pre-coated galvanised profile sheet 0.50 mm for the roof, with self-drilling screws", "sqm", [row("Roof (on the slope) incl. end overhangs", 1, Lt + 0.3, W / cs)], [CPWD(), "12.50"]));
    qty.push(Q("Painting steel work, two coats synthetic enamel over primer" + (RL ? "" : " (outside of tubes)"), "sqm", [row("Posts", nP, postL, post.per / 1000), row("Rafters", nf, rafL, raf.per / 1000), row("Purlins", np, Lt + 0.2, purl.per / 1000)], [CPWD(), "13.61.1"]));
    qty.push(Q("Earth work in excavation for footings, all kinds of soil", "cum", [row("Footing pits", nP, res.B + 0.6, res.B + 0.6, Df + 0.1)], [CPWD(), "2.8.1"]));
    qty.push(Q("PCC 1:4:8 below footings", "cum", [row("Levelling course 100", nP, res.B + 0.2, res.B + 0.2, 0.1)], [CPWD(), "4.1.8"]));
    qty.push(Q("RCC M" + G(fck) + " in footings & pedestals (excl. steel & shuttering)", "cum", [row("Footings", nP, res.B, res.B, tf), row("Pedestals", nP, a0, a0, Df - tf + ped)], null, CM().rcc_rate(fck)));
    qty.push(Q("Centering & shuttering – footing edges & pedestals", "sqm", [row("Footing edges", nP, 4 * res.B * tf), row("Pedestals", nP, 4 * a0 * (Df - tf + ped))], [CPWD(), "5.9.1"]));
    qty.push(X().steelQty(bbs, "Cycle shed footings"));
    qty.push(Q("Non-shrink grout below base plates (30 mm)", "cum", [row("Below plates", nP, (Bp + 100) / 1000, (Bp + 100) / 1000, 0.03)], null, CM().RATE.grout, "Non-SOR"));
    qty.push(Q("Filling available excavated earth around footings", "cum", [row("Back-fill (≈ 70 % of excavation)", 1, 0.7 * nP * Math.pow(res.B + 0.6, 2) * (Df + 0.1))], [CPWD(), "2.25"]));
    if (inp.gutter !== false) { var ng = (K === "T" || K === "gable") ? 2 : 1, ndp = ng * (Math.ceil(Lt / 12) + 1), dpL = (K === "Y" ? H : Hhi > H && K !== "T" ? H : H) + 0.2;
      qty.push(Q("Gutter in 0.50 mm pre-coated GI sheet (girth ≈ 450 mm) with brackets at 1 m and end caps", "m", [row(ng === 2 ? "Both eaves" : K === "Y" ? "Valley over the posts" : "Low eave", ng, Lt + 0.3)], null, 650, "Non-SOR — indicative market rate, confirm"));
      qty.push(Q("uPVC rain-water down pipe 110 mm with clips" + (K === "Y" ? " (along the posts)" : ""), "m", [row("Down pipes, one per ≈ 12 m of gutter", ndp, dpL)], [CPWD(), "12.41.2"]));
      qty.push(Q("uPVC shoe 110 mm at the foot of the down pipe", "each", [row("Shoes", ndp)], [CPWD(), "12.42.6.2"])); J.gut = ng + " gutter line" + (ng > 1 ? "s" : "") + ", " + ndp + " down pipes"; }
    var totSteel = kgPost + kgRaf + kgPur + kgPlate + kgBr;

    var sheet = drawing(inp, K, W, Lt, bay, nb, H, Hhi, th, ov, span, arm, post, raf, purl, np, sp, res, tf, a0, Df, ped, tp, Bp, db, La, bars, J);
    var summary = { "Shed": F(W, ".2f") + " × " + F(Lt, ".2f") + " m, " + String(inp.scheme) + (RL ? " — rolled sections" : " — tubular"), "Frames": nf + " frames @ " + F(bay, ".2f") + " m; clear height " + F(H, ".2f") + " m, slope " + G(th) + "°",
      "Posts": nP + " nos " + post.name, "Rafters": nf + " nos " + raf.name, "Purlins": np + " lines " + purl.name + " @ " + F(sp, ".2f") + " m", "Roof": "0.50 mm pre-coated profile sheet",
      "Base": G(Bp) + " sq × " + G(tp) + " plate, " + nBolt + "-M" + G(db) + (gBolt === 8.8 ? " (8.8)" : ""), "Footings": nP + " nos " + F(res.B, ".2f") + " m sq × " + G(tf * 1000) + ", " + G(bars.dia) + "Ø @ " + G(bars.spacing),
      "Total steel": F(totSteel / 1000, ".2f") + " t (" + F(totSteel / (W * Lt), ".1f") + " kg/m²)", "Joints": "top: " + J.top + "; base: " + J.base, "Bracing": J.rod + "Ø rods in the end bays, eave tie " + J.tie.name, "Sheet fixing": J.screws, "Gutters": J.gut || "none", "Wind": "pd = " + F(pd, ".3f") + " kN/m²" + (inp.solar ? "; solar panels on the roof" : ""), "Max utilisation": F(c.max_utilisation, ".2f") };
    var refs = ["IS 800:2007 – General construction in steel", "IS 4923:2017 – Hollow steel sections", "IS 875 (Parts 1–3):2015 – Loads", "IS 1904:1986 – Foundations", "IS 456:2000"];
    return C.DesignResult({ module: "cycle_shed", title: "Two-wheeler / cycle parking shed", inputs: inp, calc: c, summary: summary, drawings: [sheet], quantities: qty, bbs: bbs, tables: {}, references: refs });
  }
  M.run_cycle_shed = run_cycle_shed;

  function drawing(inp, K, W, Lt, bay, nb, H, Hhi, th, ov, span, arm, post, raf, purl, np, sp, f, tf, a0, Df, ped, tp, Bp, db, La, bars, J) {
    var D_ = DR(), Wm = W * 1000, Hm = H * 1000, t = Math.tan(th * Math.PI / 180), bm = bay * 1000, ovm = ov * 1000;
    /* cross section: the roof line for each pattern, posts, footings, purlins and gutters */
    var x = new D_.View("Cross section"), RP;
    if (K === "T") RP = [[0, Hm], [Wm / 2, Hm + Wm / 2 * t], [Wm, Hm]];
    else if (K === "Y") RP = [[0, Hm + Wm / 2 * t], [Wm / 2, Hm], [Wm, Hm + Wm / 2 * t]];
    else if (K === "gable") RP = [[0, Hm - ovm * t], [Wm / 2, Hm + (Wm / 2 - ovm) * t], [Wm, Hm - ovm * t]];
    else RP = [[0, Hm - ovm * t], [Wm, Hm - ovm * t + Wm * t]];
    var roofAt = function (xx) { for (var k = 1; k < RP.length; k++) if (xx <= RP[k][0] + 1e-6) { var a = RP[k - 1], b = RP[k]; return a[1] + (b[1] - a[1]) * (xx - a[0]) / (b[0] - a[0]); } return RP[RP.length - 1][1]; };
    for (var k = 1; k < RP.length; k++) x.line(RP[k - 1][0], RP[k - 1][1], RP[k][0], RP[k][1], "STEEL");
    var xs = (K === "two" || K === "gable") ? [ovm, Wm - ovm] : (K === "T" || K === "Y") ? [Wm / 2] : [ovm];
    xs.forEach(function (px) { var top = roofAt(px) - raf.h; x.rect(px - post.h / 2, ped * 1000, post.h, top - ped * 1000, "STEEL", "steel"); x.rect(px - f.B * 500, -Df * 1000, f.B * 1000, tf * 1000, "OUTLINE", "concrete"); x.rect(px - a0 * 500, -Df * 1000 + tf * 1000, a0 * 1000, (Df - tf + ped) * 1000, "OUTLINE", "concrete"); });
    for (var q = 0; q < np; q++) { var xp = 60 + (Wm - 120) * q / Math.max(1, np - 1); x.rect(xp - purl.b / 2, roofAt(xp), purl.b, purl.h, "STEEL"); }
    if (inp.gutter !== false) { var gx = K === "Y" ? [Wm / 2] : (K === "T" || K === "gable") ? [0, Wm] : [0]; gx.forEach(function (g0) { x.rect(g0 - 90, roofAt(g0) - 140, 180, 120, "STEEL"); }); x.text(gx[0] + 150, roofAt(gx[0]) - 260, "gutter + 110 down pipe", 1.6); }
    if (K === "cant") x.line(ovm, Hhi * 1000 - 900, ovm + 1200, roofAt(ovm + 1200) - raf.h, "STEEL");
    x.line(-800, 0, Wm + 800, 0, "SOIL"); x.text(Wm + 800, 80, "GL", 2.0, { anchor: "end" });
    x.dim(0, -Df * 1000 - 300, Wm, -Df * 1000 - 300, 8, "W " + F(Wm, ",.0f")); x.dim(xs[0], 0, xs[0], roofAt(xs[0]) - raf.h, -10, "h " + F(roofAt(xs[0]) - raf.h, ",.0f"));
    if (K === "two" || K === "gable") x.dim(xs[0], Hm + 400, xs[1], Hm + 400, -6, "Ls " + F(span * 1000, ",.0f"));
    var ytop = Math.max.apply(null, RP.map(function (p) { return p[1]; }));
    x.text(Wm / 2, ytop + 1700, "Rafter " + raf.name + ", purlins " + purl.name + " @ " + F(sp * 1000, ",.0f") + ", 0.50 mm sheet, slope " + G(th) + "°" + (inp.solar ? ", solar panels on top" : ""), 1.8, { anchor: "middle" });
    x.text(xs[0] + post.h, Hm / 2, "Post " + post.name, 1.8);
    /* elevation: every bay (up to 10), X-bracing in both end bays, eave tie */
    var nShow = nb <= 10 ? nb : 6, e = new D_.View(nb <= 10 ? "Side elevation" : "Side elevation (first " + nShow + " bays)");
    for (var i = 0; i <= nShow; i++) e.rect(i * bm - post.h / 2, 0, post.h, Hm, "STEEL", "steel");
    e.rect(0, Hm, nShow * bm, J.tie.h, "STEEL");
    [0, nb <= 10 ? nShow - 1 : -1].forEach(function (bi) { if (bi < 0) return; e.line(bi * bm, 0, (bi + 1) * bm, Hm, "THIN"); e.line((bi + 1) * bm, 0, bi * bm, Hm, "THIN"); });
    e.line(-600, 0, nShow * bm + 600, 0, "SOIL"); e.dim(0, Hm + J.tie.h + 300, bm, Hm + J.tie.h + 300, -6, "bay " + F(bm, ",.0f"));
    e.text(nShow * bm / 2, -700, nb + " bays @ " + F(bm, ",.0f") + " = " + F(Lt * 1000, ",.0f") + "; " + J.rod + "Ø rod X-bracing with turnbuckles in both end bays (post lines and roof); eave tie " + J.tie.name, 1.8, { anchor: "middle" });
    /* base detail */
    var b = new D_.View("Base plate, footing & rafter–post joint"), B = f.B * 1000;
    b.rect(-B / 2, -Df * 1000, B, tf * 1000, "OUTLINE", "concrete"); b.rect(-B / 2 - 100, -Df * 1000 - 100, B + 200, 100, "CONCRETE"); b.rect(-a0 * 500, -Df * 1000 + tf * 1000, a0 * 1000, (Df - tf + ped) * 1000, "OUTLINE", "concrete");
    b.rect(-Bp / 2, ped * 1000, Bp, tp, "STEEL", "steel"); b.rect(-post.h / 2, ped * 1000 + tp, post.h, 900, "STEEL", "steel");
    b.line(-post.h / 2 - 40, ped * 1000 - La, -post.h / 2 - 40, ped * 1000 + 50, "REBAR"); b.line(post.h / 2 + 40, ped * 1000 - La, post.h / 2 + 40, ped * 1000 + 50, "REBAR");
    b.line(-B / 2 - 500, 0, B / 2 + 500, 0, "SOIL"); b.dim(-B / 2, -Df * 1000 - 150, B / 2, -Df * 1000 - 150, 8); b.dim(B / 2, -Df * 1000, B / 2, 0, -8, "Df " + F(Df * 1000, ",.0f"));
    b.text(0, -Df * 1000 - 600, "Footing " + F(B, ",.0f") + " sq × " + G(tf * 1000) + ", " + G(bars.dia) + "Ø @ " + G(bars.spacing) + " both ways; pedestal " + G(a0 * 1000) + " sq, " + J.ped[0] + "-" + J.ped[1] + "Ø + 8Ø @ 150", 1.8, { anchor: "middle" });
    b.text(post.h / 2 + 120, ped * 1000 + 150, "Base plate " + G(Bp) + " sq × " + G(tp) + ", " + J.bolts + " × " + G(ceil_to(La + 100, 50)) + ", 30 grout; post weld " + J.base, 1.8);
    /* the joint at the post top, drawn beside the base detail */
    var ox = B / 2 + 2600, ph = post.h, rh = raf.h, jy = ped * 1000 + 1500;
    b.rect(ox - ph / 2, jy, ph, 700, "STEEL", "steel"); b.rect(ox - ph / 2 - 40, jy + 700, ph + 80, 12, "STEEL", "steel"); b.rect(ox - 700, jy + 712, 1400, rh, "STEEL");
    if (J.gus || (J.Mj > 0 && rolled(inp))) { b.line(ox - ph / 2, jy + 550, ox - ph / 2 - 150, jy + 700, "STEEL"); b.line(ox + ph / 2, jy + 550, ox + ph / 2 + 150, jy + 700, "STEEL"); }
    if (K === "cant") b.line(ox + ph / 2, jy + 100, ox + 600, jy + 712, "STEEL");
    b.text(ox, jy - 250, "RAFTER – POST JOINT", 2.0, { anchor: "middle" }); b.text(ox, jy - 450, J.top, 1.5, { anchor: "middle" }); b.text(ox, jy - 620, J.Mj > 0 ? "rigid joint — design moment " + F(J.Mj, ".1f") + " kN·m" : "simple seat on the post", 1.5, { anchor: "middle" });
    var notes = [rolled(inp) ? "Rolled sections to IS 808 / IS 2062 E250; rafter to post by end plate and 4 bolts or full welding; purlins on ISA 50 cleats with 2-M12 bolts." : "Hollow sections to IS 4923 (YSt 310 / fy " + G(num(inp.fy_st)) + "), all joints fully welded (fillet sizes as in note 5), tube ends sealed with welded caps.",
      "Wind to IS 875-3:2015, Vb = " + G(num(inp.vb)) + " m/s, terrain " + G(num(inp.terrain)) + "; canopy net pressure coefficients – verify with IS 875-3 Tables 17 / 18.",
      "Roof 0.50 mm pre-coated profile sheet, self-drilling screws with EPDM washers at every second crest on each purlin; side lap 1.5 corrugations.",
      "Footings RCC M" + G(num(inp.fck)) + " on PCC 1:4:8; anchor bolts set with a template; non-shrink grout 30 mm. Steel: zinc-rich primer + 2 coats enamel (or hot-dip galvanised)."];
    notes.push("Joints: top — " + J.top + "; base — " + J.base + ". Bracing " + J.rod + "Ø rods with turnbuckles in both end bays; eave tie " + J.tie.name + ". Sheet screws: " + J.screws + ".");
    if (inp.gutter !== false) notes.push("Gutters 0.50 mm pre-coated sheet with 110 mm uPVC down pipes about every 12 m" + (K === "Y" ? ", run down along the posts" : "") + "; fall 1:200 towards the down pipes.");
    return new D_.Sheet("Two-wheeler / cycle parking shed", "CS-01", [x, e, b], notes);
  }

  var PARAMS = [
    P("scheme", "Framing scheme", SCHEME[0], { kind: "select", options: SCHEME.slice(), group: "Shed" }),
    P("members", "Member type", MEMB[0], { kind: "select", options: MEMB.slice(), group: "Shed", help: "Tubular is lighter and neater; rolled ISMB / ISMC are easy to get everywhere and bolt up on site" }),
    P("width", "Covered width (across)", 4.5, "m", { min: 2, max: 9, step: 0.1, group: "Shed" }),
    P("length", "Length of the shed", 30.0, "m", { min: 3, max: 300, step: 0.5, group: "Shed" }),
    P("bay", "Post spacing along the length (about)", 3.0, "m", { min: 2, max: 6, step: 0.25, group: "Shed" }),
    P("height", "Clear height at the low side", 2.4, "m", { min: 2.1, max: 4.5, step: 0.1, group: "Shed" }),
    P("slope", "Roof slope", 5.0, "°", { min: 2, max: 15, step: 0.5, group: "Shed" }),
    P("overhang", "Roof beyond the posts (two rows: each side; cantilever: behind the post)", 0.3, "m", { min: 0, max: 1.0, step: 0.05, group: "Shed" }),
    P("gutter", "Gutters and down pipes", true, { kind: "bool", group: "Roof" }),
    P("solar", "Solar panels on the roof (+0.15 kN/m²)", false, { kind: "bool", group: "Roof" }),
    P("purlin_s", "Max. purlin spacing (on the slope)", 1.2, "m", { min: 0.6, max: 1.5, step: 0.05, group: "Roof" }),
    P("sheet_dl", "Roof sheeting + fixings", 0.15, "kN/m²", { min: 0.05, max: 0.5, step: 0.01, group: "Roof" }),
    P("vb", "Basic wind speed Vb", 39.0, "m/s", { kind: "select", options: [33.0, 39.0, 44.0, 47.0, 50.0, 55.0], group: "Wind", help: "IS 875-3 Annex A – Korba / Bilaspur / Raigarh: 39 m/s (verify)" }),
    P("terrain", "Terrain category", 2, { kind: "select", options: [1, 2, 3, 4], group: "Wind", help: "open campus / mine: 2; built-up town: 3" }),
    P("k1", "Risk coefficient k1", 1.0, { min: 0.7, max: 1.1, step: 0.01, group: "Wind" }),
    P("k3", "Topography factor k3", 1.0, { min: 1.0, max: 1.36, step: 0.01, group: "Wind" }),
    P("fy_st", "Hollow section fy (IS 4923)", 310.0, "N/mm²", { kind: "select", options: [210.0, 240.0, 310.0, 355.0], group: "Steel", help: "YSt 210 / 240 / 310 / 355 — 310 is the common grade. Rolled sections: E250 (fy 250)." }),
    P("found_depth", "Footing founding depth below GL", 1.2, "m", { min: 0.8, max: 2.5, step: 0.1, group: "Foundation" }),
    P("ped_above", "Pedestal top above GL", 0.3, "m", { min: 0.15, max: 0.6, step: 0.05, group: "Foundation" }),
    P("sbc", "Safe bearing capacity", 150.0, "kN/m²", { min: 50, max: 400, group: "Foundation" }),
    P("gamma", "Soil unit weight", 18.0, "kN/m³", { min: 15, max: 22, group: "Foundation" }),
    P("fck", "Concrete grade fck", 25.0, "N/mm²", { kind: "select", options: [20.0, 25.0, 30.0], group: "Materials" }),
    P("fy", "Rebar fy", 500.0, "N/mm²", { kind: "select", options: [415.0, 500.0], group: "Materials" }),
    P("cover", "Clear cover (footing)", 50.0, "mm", { min: 40, max: 75, step: 5, group: "Materials" })
  ];
  M.PARAMS = PARAMS;
  C.register({ id: "cycle_shed", phase: 2, category: "Steel structures", name: "Two-wheeler / cycle parking shed (tubular or rolled)", icon: "🛵",
    description: "Light open parking canopy in hollow steel sections (SHS / RHS, IS 4923) or rolled ISMB / ISMC: two rows of posts with a mono-slope or gable roof, one row with a T or Y (butterfly) roof, or a cantilever. " +
      "IS 875 wind on a free-standing canopy (down and uplift), purlins, rafters and posts to IS 800, rafter–post joint and welds, bracing and eave tie, sheet fixing, base plate & anchor bolts, isolated footings (bearing, overturning, uplift, one-way and punching shear), pedestal; gutters, solar option; BBS, quantities & drawing.",
    params: PARAMS, run: run_cycle_shed, references: ["IS 800:2007", "IS 4923:2017", "IS 875 (Parts 1–3):2015", "IS 1904:1986", "IS 456:2000"], modes: ["design"] });
})();
