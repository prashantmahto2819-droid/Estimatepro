/* Design Studio — modules_extra2 (new modules, not a Python port). Loads after modules_extra.js.
   Site-engineer modules for SECL (Korba / Gevra) works – design + CPWD / MPPWD-style estimate quantities.
     rigid_pavement    PQC rigid pavement – IRC 58:2015 (plant roads, CHP / coal yards, haul roads): k from CBR + GSB / DLC,
                       Westergaard edge / corner stresses, Bradbury curling, BUC + TDC cumulative fatigue damage, dowel (IRC 58
                       table + Friberg) & tie bars, joint layout; mine dumpers: Westergaard edge with the actual wheel + impact governs
     culvert_headwall  Headwall + splayed wing / return walls for box & pipe culverts – IRC SP-13, IRC 78, IS 456: surcharge by
                       location (road IRC / mine haul road dumper / railway IRS – railway never mixed with the mine profile),
                       stability at the max. and intermediate (tapering) sections, RCC cantilever or PCC / RR gravity, apron,
                       curtain walls & flexible apron (Lacey scour), weep holes
     gravity_wall      RR masonry (CM 1:6) / PCC M15 gravity, breast & toe walls and stepped gabion walls – Coulomb (+ Mononobe–Okabe,
                       IS 1893-3), overturning / sliding / bearing / no tension, joint stresses (IS 1905), gabion internal stability
   Conventions as modules_extra.js: lengths m (sections mm), forces kN per m run, every number recorded in a Calc with formula
   and clause; BBS only through DS.bbs; quantities with descriptions the UI maps to CPWD DSR / MPPWD SOR items.
   Steps marked [APPROX] / "verify" are engineering approximations or paraphrased clauses – check against licensed codes. */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var C = DS.core, F = C.pyfmt, R = C.pyround, ceil_to = C.ceil_to, floor_to = C.floor_to;
  var M = DS.modules_extra2 = {};
  function CM() { return DS.common; }
  function RC() { return DS.rcc; }
  function LD() { return DS.loads; }
  function DR() { return DS.drawing; }
  function BB() { return DS.bbs; }
  function DT() { return DS.detailing; }
  function X() { return DS.modules_extra; }
  function row() { return CM().row.apply(null, arguments); }
  function Q() { return CM().Q.apply(null, arguments); }
  function num(v) { return Number(v); }
  function G(x) { return F(x, "g"); }
  function area(d) { return Math.PI * d * d / 4; }
  function ctx() { return C.ctx || { site: "general", detail: "practice" }; }
  function isMine() { return ctx().site === "mine"; }
  var CPWD = "CPWD_DSR_2021", MPPWD = "MPPWD_SOR_2017", CHECK = ["check"], GW = 9.81;

  function P(key, label, def, unit, o) {
    if (unit && typeof unit === "object") { o = unit; unit = ""; }
    return C.Param(Object.assign({ key: key, label: label, default: def, unit: unit || "" }, o || {}));
  }
  function clamp(x, lo, hi) { return Math.min(Math.max(x, lo), hi); }
  function fin(x, d) { return isFinite(x) ? x : d; }
  /* Simpson integral of f on [a, b] */
  function integ(f, a, b, n) { n = n || 40; if (b <= a) return 0; var h = (b - a) / n, s = f(a) + f(b); for (var i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h); return s * h / 3; }
  /* area & centroid of a simple polygon */
  function polyAC(pts) {
    var A = 0, cx = 0, cy = 0;
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i], q = pts[(i + 1) % pts.length], cr = p[0] * q[1] - q[0] * p[1];
      A += cr; cx += (p[0] + q[0]) * cr; cy += (p[1] + q[1]) * cr;
    }
    A /= 2; if (Math.abs(A) < 1e-12) return { A: 0, x: pts[0][0], y: pts[0][1] };
    return { A: Math.abs(A), x: cx / (6 * A), y: cy / (6 * A) };
  }
  function matParams(cover, fckDef, opts) {
    return [P("fck", "Concrete grade fck", fckDef || 30.0, "N/mm²", { kind: "select", options: opts || [25.0, 30.0, 35.0], group: "Materials" }),
      P("fy", "Steel fy", 500.0, "N/mm²", { kind: "select", options: [415.0, 500.0], group: "Materials" }),
      P("exposure", "Exposure", "Moderate", { kind: "select", options: Object.keys(DS.materials.EXPOSURE), group: "Materials",
        help: "IS 456 Table 3. Mining area (site = mine) is taken as Severe in design mode." }),
      P("cover", "Clear cover", cover, "mm", { min: 25, max: 75, step: 5, group: "Materials" })];
  }
  function coverAdopt(c, inp, mode) {
    var cover = num(inp.cover), req = RC().required_cover(inp.exposure, "footing");
    if (mode !== "check" && cover < req) { c.info("Cover adopted", G(cover) + " mm raised to " + G(req) + " mm for " + inp.exposure + " exposure", "IS 456 Table 16"); cover = req; }
    RC().cover_check(c, inp.exposure, cover, num(inp.fck), "footing");
    return cover;
  }
  function steelQty(bbs, title, desc, link) { return X().steelQty(bbs, title, desc, link); }
  var DUMP_NAMES = ["Tipper 35 t (6×4, tandem rear axles)", "BEML BH35-2 (60 t)", "BEML BH60M (98 t)", "BEML BH100 (165 t)", "CAT 777G (164 t)",
    "BEML BH150E (240 t)", "Custom"];
  function dumperParams(when, def) {
    var wc = function (v) { return when(v) && v.dumper === "Custom"; };
    return [P("dumper", "Dumper / tipper (loaded)", def || "Tipper 35 t (6×4, tandem rear axles)", { kind: "select", options: DUMP_NAMES.slice(), group: "Mine dumper", when: when,
      help: "Presets as the drain-cover module (DS.loads.DUMPERS; geometry approximate – verify with the OEM data sheet)." }),
      P("overload", "Overload factor on GVW", 1.10, { min: 1.0, max: 1.3, step: 0.05, group: "Mine dumper", when: when }),
      P("dumper_gvw", "Custom: GVW (loaded)", 35.0, "t", { min: 10, max: 400, group: "Mine dumper", when: wc }),
      P("dumper_front", "Custom: front-axle share of GVW", 0.33, { min: 0.15, max: 0.5, step: 0.01, group: "Mine dumper", when: wc }),
      P("dumper_rear", "Custom: number of rear axles", 1, { kind: "int", min: 1, max: 3, group: "Mine dumper", when: wc }),
      P("dumper_dual", "Custom: dual tyre c/c", 0.6, "m", { min: 0.2, max: 1.5, step: 0.05, group: "Mine dumper", when: wc }),
      P("dumper_tyre_b", "Custom: tyre width", 0.5, "m", { min: 0.2, max: 1.2, step: 0.01, group: "Mine dumper", when: wc }),
      P("dumper_tyre_p", "Custom: tyre pressure", 650.0, "kPa", { min: 300, max: 1000, step: 10, group: "Mine dumper", when: wc })];
  }

  /* ======================================================================= SHARED: earth pressure & gravity stability */
  /* Coulomb (Bowles form): al = back face angle with the horizontal on the soil side (90 = vertical, > 90 when the back face slopes
     under the backfill), dl = wall friction δ, be = backfill slope β. Mononobe–Okabe (IS 1893-3) with seismic angle ps = ψ. */
  var KA_F = "sin(radians(al + ph))**2/(sin(radians(al))**2*sin(radians(al - dl))*(1 + sqrt(sin(radians(ph + dl))*sin(radians(ph - be))/(sin(radians(al - dl))*sin(radians(al + be)))))**2)";
  var KAE_F = "sin(radians(al + ph - ps))**2/(cos(radians(ps))*sin(radians(al))**2*sin(radians(al - dl - ps))*(1 + sqrt(sin(radians(ph + dl))*max(sin(radians(ph - be - ps)), 0)/(sin(radians(al - dl - ps))*sin(radians(al + be)))))**2)";
  M.KA_F = KA_F; M.KAE_F = KAE_F;
  M.kCoulomb = function (ph, dl, al, be, ps) { return C.safe_eval(KAE_F, { al: al, ph: ph, dl: dl, be: be, ps: ps || 0 }); };

  /* gSection(c, g, s, o) – stability of a wall section per metre run (gravity, gabion or cantilever with a virtual back).
     g: {H, B, pcs: [[label, A m², x from toe, γ, y]], xb0, xb1 (back / virtual plane x at base & top), qheel, xqh (surcharge on heel)}
     s: {gam, phi, dl, be, q, mu, sbc, hw (water head above base, 0 = drained), seis {kh, kv} | null, fot, fsl, cl}
     o: {tag, full (false → scratch only), sec, sbcLabel} */
  function gSection(c, g, s, o) {
    o = o || {};
    var cc = o.full === false ? new C.Calc("s") : c, tg = o.tag ? " (" + o.tag + ")" : "";
    var H = g.H, B = g.B, q = s.q, gam = s.gam;
    var bb = (g.xb0 - g.xb1) / H, al = R(90 + Math.atan(bb) * 180 / Math.PI, 3);
    var be = Math.max(0, Math.min(s.be, s.phi - 1)), dl = R(Math.max(0, Math.min(s.dl, s.phi, al - 20)), 3);
    cc.section((o.sec || "Earth pressure & stability") + tg);
    if (be < s.be - 1e-9 && o.full !== false) cc.warn("Backfill slope limited", "β = " + G(s.be) + "° ≥ φ – Coulomb not valid; β = " + G(be) + "° used. Check the slope itself (IS 14458 / slope stability)", "Coulomb");
    var Ka = cc.calc("Active pressure coefficient (Coulomb)", "Ka", KA_F, "", s.kaClause || "Coulomb (Bowles form) / IS 1893-3 cl 7 static part",
      "α = " + F(al, ".1f") + "° (back face with horizontal, soil side), δ = " + G(dl) + "°, β = " + G(be) + "°", { al: al, ph: s.phi, dl: dl, be: be });
    var om = R(dl + al - 90, 4);
    var Pa = cc.calc("Active thrust", "Pa", "0.5*Ka*g*H**2", "kN/m", "acts at H/3, inclined ω = δ + α − 90° below horizontal", { Ka: Ka, g: gam, H: H });
    var Ph = cc.calc("Horizontal component", "Ph", "Pa*cos(radians(om))", "kN/m", "", { Pa: Pa, om: om });
    var Pv = cc.calc("Vertical component (on the back face)", "Pv", "Pa*sin(radians(om))", "kN/m", "", { Pa: Pa, om: om });
    var Pq = q > 0 ? cc.calc("Surcharge thrust (acts at H/2)", "Pq", "Ka*q*H*sin(radians(al))/sin(radians(al + be))", "kN/m", "Coulomb – uniform surcharge on the backfill",
      { Ka: Ka, q: q, H: H, al: al, be: be }) : 0;
    var xv = g.xb0 + (g.xb1 - g.xb0) / 3, xq = g.xb0 + (g.xb1 - g.xb0) / 2;
    var hw = Math.max(0, Math.min(s.hw || 0, H)), Pw = 0, U = 0;
    if (hw > 0) {
      Pw = cc.calc("Water pressure behind wall (no drainage)", "Pw", "0.5*gw*hw**2", "kN/m", "", { gw: GW, hw: hw });
      U = cc.calc("Uplift under base (triangular)", "U", "0.5*gw*hw*B", "kN/m", "", { gw: GW, hw: hw, B: B });
    }
    var wv = {}, mv = {}, wn = [], mn = [], yv = 0;
    g.pcs.forEach(function (p, i) { var k = i + 1; wv["W" + k] = R(p[1] * p[3], 4); mv["W" + k] = wv["W" + k]; mv["x" + k] = R(p[2], 4); wn.push("W" + k); mn.push("W" + k + "*x" + k); yv += p[1] * p[3] * (p[4] || 0); });
    var W = cc.calc("Weight of wall" + (g.pcs.some(function (p) { return /soil/.test(p[0]); }) ? " + soil on it" : ""), "W", wn.join(" + "), "kN/m", "",
      g.pcs.map(function (p, i) { return "W" + (i + 1) + " " + p[0]; }).join("; "), wv);
    var Mw = cc.calc("Moment of weights about toe", "Mw", mn.join(" + "), "kN·m/m", "", mv);
    var yc = W > 0 ? yv / W : H / 3;
    var V = cc.calc("Total vertical force (surcharge on heel ignored)", "ΣV", "W + Pv + Pq*sin(radians(om)) - U", "kN/m", "", { W: W, Pv: Pv, Pq: Pq, om: om, U: U });
    var Hs = cc.calc("Total horizontal force", "ΣH", "Ph + Pq*cos(radians(om)) + Pw", "kN/m", "", { Ph: Ph, Pq: Pq, om: om, Pw: Pw });
    var Mr = cc.calc("Restoring moment about toe", "Mr", "Mw + Pv*xv + Pq*sin(radians(om))*xq", "kN·m/m", "", { Mw: Mw, Pv: Pv, xv: R(xv, 4), Pq: Pq, om: om, xq: R(xq, 4) });
    var Mo = cc.calc("Overturning moment about toe", "Mo", "Ph*H/3 + Pq*cos(radians(om))*H/2 + Pw*hw/3 + U*2*B/3", "kN·m/m", "", { Ph: Ph, H: H, Pq: Pq, om: om, Pw: Pw, hw: hw, U: U, B: B });
    var fot = cc.calc("Factor of safety against overturning", "FoS_OT", "Mr/Mo", "", s.cl || "IRC 78 cl 706.3.4 / IS 1904", { Mr: Mr, Mo: Math.max(Mo, 1e-6) });
    cc.check("Overturning FoS ≥ " + F(s.fot, ".1f") + tg, fot, s.fot, { mode: ">=", clause: s.cl || "IRC 78 cl 706.3.4 / IS 1904 practice", note: fot < s.fot ? "widen the base" : "" });
    var Pp = 0;
    if (s.key && s.key.hk > 0) {
      var sp_ = Math.sin(s.phi * Math.PI / 180);
      Pp = cc.calc("Passive resistance in front of the shear key (50 % mobilised)", "Pp", "0.5*0.5*Kp*g*((d + hk)**2 - d**2)", "kN/m",
        "Rankine Kp; front soil protected by the floor / curtain wall [GP]", { Kp: R((1 + sp_) / (1 - sp_), 4), g: gam, d: s.key.df, hk: s.key.hk });
    }
    var fsl = Pp > 0 ? cc.calc("Factor of safety against sliding (with shear key)", "FoS_SL", "(mu*V + Pp)/Hs", "", s.cl || "IRC 78 cl 706.3.4 / IS 1904", { mu: s.mu, V: Math.max(V, 0), Pp: Pp, Hs: Math.max(Hs, 1e-6) })
      : cc.calc("Factor of safety against sliding", "FoS_SL", "mu*V/Hs", "", s.cl || "IRC 78 cl 706.3.4 / IS 1904", { mu: s.mu, V: Math.max(V, 0), Hs: Math.max(Hs, 1e-6) });
    cc.check("Sliding FoS ≥ " + F(s.fsl, ".1f") + tg, fsl, s.fsl, { mode: ">=", clause: s.cl || "IRC 78 cl 706.3.4 / IS 1904 practice", note: fsl < s.fsl ? "widen the base / shear key / better base friction" : "" });
    // bearing: with the surcharge on the heel (max. pressure) and without it (eccentricity)
    var Wq = q * (g.qheel || 0), Mq = Wq * (g.xqh || 0);
    var Vt = Math.max(V + Wq, 1e-6);
    var xb = cc.calc("Resultant from toe (bearing case, surcharge on heel included)", "x̄", "(Mr + Mq - Mo)/(V + Wq)", "m", "", { Mr: Mr, Mq: R(Mq, 4), Mo: Mo, V: V, Wq: R(Wq, 4) });
    var e = cc.calc("Eccentricity (+ towards toe)", "e", "B/2 - xb", "m", "", { B: B, xb: xb });
    var e0 = V > 0 ? B / 2 - (Mr - Mo) / V : B, emax = Math.max(Math.abs(e), Math.abs(e0));
    function press(Vv, ee) {
      if (Math.abs(ee) <= B / 6 + 1e-12) return { max: Vv / B * (1 + 6 * Math.abs(ee) / B), min: Vv / B * (1 - 6 * Math.abs(ee) / B), nt: false };
      return { max: 2 * Vv / (3 * Math.max(B / 2 - Math.abs(ee), 0.01)), min: 0, nt: true };
    }
    var pb = press(Vt, e), p0 = press(Math.max(V, 1e-6), e0), pmax, pmin;
    if (!pb.nt) {
      pmax = cc.calc("Max. base pressure", "pmax", "Vt/B*(1 + 6*abs(e)/B)", "kN/m²", "IS 1904 (linear)", { Vt: R(Vt, 4), B: B, e: e });
      pmin = cc.calc("Min. base pressure", "pmin", "Vt/B*(1 - 6*abs(e)/B)", "kN/m²", "IS 1904 (linear)", { Vt: R(Vt, 4), B: B, e: e });
    } else {
      pmax = cc.calc("Max. base pressure – resultant outside middle third (no tension, contact 3a)", "pmax", "2*Vt/(3*max(B/2 - abs(e), 0.01))", "kN/m²", "IS 1904", { Vt: R(Vt, 4), B: B, e: e });
      pmin = 0;
    }
    var pmx = Math.max(pmax, p0.max);
    cc.check("Max. base pressure ≤ " + (o.sbcLabel || "SBC") + tg, pmx, s.sbc, { unit: "kN/m²", clause: "IS 1904 / IS 6403", note: pmx > s.sbc ? "widen the base / improve the ground" : "" });
    cc.ok("No tension under base: |e| ≤ B/6" + tg, emax <= B / 6 + 1e-9, { detail: "|e| = " + F(emax, ".3f") + " m (with / without surcharge on heel) vs B/6 = " + F(B / 6, ".3f") + " m",
      clause: "IS 1904 / IRC 78 cl 706.3.4 practice" });
    var pAt;
    if (!pb.nt) { var pt0 = Vt / B * (1 + 6 * e / B), ph0 = Vt / B * (1 - 6 * e / B); pAt = function (x) { return pt0 + (ph0 - pt0) * x / B; }; }
    else { var a3 = 3 * Math.max(B / 2 - Math.abs(e), 0.01), pk = 2 * Vt / a3; pAt = e > 0 ? function (x) { return Math.max(0, pk * (1 - x / a3)); } : function (x) { return Math.max(0, pk * (1 - (B - x) / a3)); }; }
    var res = { Ka: Ka, al: al, dl: dl, be: be, om: om, Pa: Pa, Ph: Ph, Pv: Pv, Pq: Pq, Pw: Pw, U: U, W: W, Mw: Mw, V: V, Hs: Hs, Mr: Mr, Mo: Mo, fot: fot, fsl: fsl,
      e: e, emax: emax, pmax: pmx, pmin: Math.min(pmin, p0.min), pAt: pAt, yc: yc, hw: hw, Pp: Pp };
    var okx = fot >= s.fot - 1e-9 && pmx <= s.sbc * (1 + 1e-9) && emax <= B / 6 + 1e-9, ok = okx && fsl >= s.fsl - 1e-9;
    // seismic (pseudo-static, Mononobe–Okabe)
    if (s.seis && s.seis.kh > 0) {
      var kh = s.seis.kh, kv = s.seis.kv;
      cc.section("Seismic case – IS 1893-3 pseudo-static" + tg);
      var ps1 = Math.atan(kh / (1 + kv)) * 180 / Math.PI, ps2 = Math.atan(kh / Math.max(1 - kv, 0.05)) * 180 / Math.PI;
      var k1 = M.kCoulomb(s.phi, dl, al, be, ps1) * (1 + kv), k2 = M.kCoulomb(s.phi, dl, al, be, ps2) * (1 - kv);
      var sv = k1 >= k2 ? 1 : -1, ps = R(sv > 0 ? ps1 : ps2, 4);
      cc.let("Seismic coefficients", "kh / kv", F(kh, ".3f") + " / " + F(kv, ".3f"), "", "IS 1893-3:2014 cl 7 (kh = Z/2 · I · Sa/g / R – verify)", "the worse of (1 + kv) and (1 − kv) is used");
      var Kae = cc.calc("Seismic active coefficient (Mononobe–Okabe)", "Kae", KAE_F, "", "IS 1893-3:2014 cl 7.2 (verify)", "ψ = atan(kh/(1 " + (sv > 0 ? "+" : "−") + " kv))",
        { al: al, ph: s.phi, dl: dl, be: be, ps: ps });
      var Pae = cc.calc("Total seismic active thrust", "Pae", "0.5*g*H**2*(1 + sv*kv)*Kae", "kN/m", "IS 1893-3 cl 7.2", { g: gam, H: H, sv: sv, kv: kv, Kae: Kae });
      var dP = cc.calc("Dynamic increment (acts at 0.5 H)", "ΔPae", "max(Pae - Pa, 0)", "kN/m", "IS 1893-3 (dynamic increment at mid-height – verify)", { Pae: Pae, Pa: Pa });
      var dPq = q > 0 ? cc.calc("Seismic increment on surcharge", "ΔPq", "max((1 + sv*kv)*Kae - Ka, 0)*q*H*sin(radians(al))/sin(radians(al + be))", "kN/m", "IS 1893-3 cl 7.2",
        { sv: sv, kv: kv, Kae: Kae, Ka: Ka, q: q, H: H, al: al, be: be }) : 0;
      var Fi = cc.calc("Inertia force of wall (+ soil on it)", "Fi", "kh*W", "kN/m", "IS 1893-3 cl 7.1", { kh: kh, W: W });
      var Ve = cc.calc("ΣV (seismic, weight × (1 − kv))", "ΣVe", "V - kv*W + (dP + dPq)*sin(radians(om))", "kN/m", "", { V: V, kv: kv, W: W, dP: dP, dPq: dPq, om: om });
      var He = cc.calc("ΣH (seismic)", "ΣHe", "Hs + (dP + dPq)*cos(radians(om)) + Fi", "kN/m", "", { Hs: Hs, dP: dP, dPq: dPq, om: om, Fi: Fi });
      var Moe = cc.calc("Overturning moment (seismic)", "Moe", "Mo + (dP + dPq)*cos(radians(om))*H/2 + Fi*yc", "kN·m/m", "", { Mo: Mo, dP: dP, dPq: dPq, om: om, H: H, Fi: Fi, yc: R(yc, 4) });
      var Mre = cc.calc("Restoring moment (seismic)", "Mre", "Mr - kv*Mw + (dP + dPq)*sin(radians(om))*xq", "kN·m/m", "", { Mr: Mr, kv: kv, Mw: Mw, dP: dP, dPq: dPq, om: om, xq: R(xq, 4) });
      var fote = cc.calc("FoS overturning (seismic)", "FoS_OTe", "Mre/Moe", "", "IS 1893-3 / practice", { Mre: Mre, Moe: Math.max(Moe, 1e-6) });
      cc.check("Seismic overturning FoS ≥ 1.5" + tg, fote, 1.5, { mode: ">=", clause: "IS 1893-3 / IRC 78 practice (seismic case)" });
      var fsle = cc.calc("FoS sliding (seismic)", "FoS_SLe", "(mu*Ve + Pp)/He", "", "IS 1893-3 / practice", { mu: s.mu, Ve: Math.max(Ve, 0), Pp: Pp, He: Math.max(He, 1e-6) });
      cc.check("Seismic sliding FoS ≥ 1.2" + tg, fsle, 1.2, { mode: ">=", clause: "IS 1893-3 / IRC 78 practice (seismic case)" });
      var ee = B / 2 - (Mre - Moe) / Math.max(Ve, 1e-6), pe = press(Math.max(Ve + Wq, 1e-6), ee);
      cc.check("Seismic max. base pressure ≤ 1.25 SBC" + tg, pe.max, 1.25 * s.sbc, { unit: "kN/m²", clause: "IS 1893-1 cl 6.3.5.2 (25 % increase – verify soil type)" });
      var oke = fote >= 1.5 - 1e-9 && pe.max <= 1.25 * s.sbc * (1 + 1e-9);
      ok = ok && oke && fsle >= 1.2 - 1e-9; okx = okx && oke;
      Object.assign(res, { Kae: Kae, fote: fote, fsle: fsle, pmax_e: pe.max });
    }
    res.ok = ok; res.okx = okx;
    return res;
  }
  M.gSection = gSection;

  /* trapezoidal gravity wall: toe at x = 0, front face x = nf·y, back face x = B − b·y; b (back batter) from B, top width bt, front batter nf */
  var BB_MAX = 0.5;   // back batter ≤ 1H : 2V – flatter backs leave Coulomb's range; extra base width then widens the top
  function gravGeo(H, B, bt, nf, gm) {
    var b = (B - bt - nf * H) / H, bt0 = bt;
    if (b > BB_MAX) { b = BB_MAX; bt = B - nf * H - b * H; }
    var pts = [[0, 0], [B, 0], [B - b * H, H], [nf * H, H]], ac = polyAC(pts);
    return { H: H, B: B, bt: bt, bt0: bt0, nf: nf, b: b, gm: gm, pts: pts, pcs: [["wall body", ac.A, ac.x, gm, ac.y]], xb0: B, xb1: B - b * H, qheel: 0, xqh: 0 };
  }
  M.gravGeo = gravGeo;
  /* RCC cantilever: stem front face battered (tst at top), back face vertical; virtual back through the heel end (Rankine with δ = 0) */
  function cantGeo(H, B, toe, tb, tsb, tst, gam, hk) {
    var Hs = H - tb, heel = Math.max(B - toe - tsb, 0);
    return { H: H, B: B, toe: toe, tb: tb, tsb: tsb, tst: tst, heel: heel, Hs: Hs, hk: hk || 0,
      pcs: (hk > 0 ? [["shear key", tsb * hk, toe + tsb / 2, 25, -hk / 2]] : []).concat([["stem (rect.)", tst * Hs, toe + tsb - tst / 2, 25, tb + Hs / 2], ["stem (taper)", 0.5 * (tsb - tst) * Hs, toe + 2 * (tsb - tst) / 3, 25, tb + Hs / 3],
        ["base", B * tb, B / 2, 25, tb / 2], ["soil on heel", heel * Hs, toe + tsb + heel / 2, gam, tb + Hs / 2]]),
      xb0: B, xb1: B, qheel: heel, xqh: toe + tsb + heel / 2 };
  }
  M.cantGeo = cantGeo;

  /* joint stresses at intermediate levels of a masonry / PCC trapezoid (IS 1905 permissible) */
  function gJoints(c, gg, s, perm, o) {
    o = o || {};
    var cc = o.full === false ? new C.Calc("s") : c, tg = o.tag ? " (" + o.tag + ")" : "", H = gg.H, B = gg.B, b = gg.b, nf = gg.nf, ok = true, out = [];
    cc.section("Joint stresses in " + perm.name + tg);
    var al = R(90 + Math.atan(b) * 180 / Math.PI, 3), dl = R(Math.max(0, Math.min(s.dl, s.phi, al - 20)), 3), be = Math.max(0, Math.min(s.be, s.phi - 1));
    var Ka = M.kCoulomb(s.phi, dl, al, be, 0), om = dl + al - 90;
    [0.25, 0.5, 0.75, 1.0].forEach(function (f) {
      var d = R(f * H, 4), y = H - d, xf = nf * y, xbk = B - b * y, w = xbk - xf;
      var ac = polyAC([[xf, y], [xbk, y], [B - b * H, H], [nf * H, H]]);
      var Pa = 0.5 * Ka * s.gam * d * d, Pq = Ka * s.q * d * Math.sin(al * Math.PI / 180) / Math.sin((al + be) * Math.PI / 180), cs = Math.cos(om * Math.PI / 180), sn = Math.sin(om * Math.PI / 180);
      var hwj = Math.max(0, (s.hw || 0) - y), Pw = 0.5 * GW * hwj * hwj;
      var N = gg.gm * ac.A + (Pa + Pq) * sn;
      var Mr = gg.gm * ac.A * (ac.x - xf) + Pa * sn * (B - b * (y + d / 3) - xf) + Pq * sn * (B - b * (y + d / 2) - xf);
      var Mo = Pa * cs * d / 3 + Pq * cs * d / 2 + Pw * hwj / 3;
      var xr = N > 0 ? (Mr - Mo) / N : -1, e = w / 2 - xr;
      var smax = xr <= 0.005 * w ? 99 : Math.abs(e) <= w / 6 ? N / w * (1 + 6 * Math.abs(e) / w) / 1000 : 2 * N / (3 * (w / 2 - Math.abs(e))) / 1000;
      var smin = N / w * (1 - 6 * Math.abs(e) / w) / 1000;
      var lab = f < 1 ? "joint " + F(d, ".2f") + " m below top" : "base joint (" + F(d, ".2f") + " m)";
      var cap = f < 1 ? "" : "";
      var c1 = cc.check("Compressive stress at " + lab + tg, R(smax, 4), perm.fc, { unit: "N/mm²", clause: perm.cl_c, note: "N = " + F(N, ".1f") + " kN/m, e = " + F(e, ".3f") + " m, width " + F(w, ".3f") + " m" + cap });
      var c2;
      if (perm.ft > 0) c2 = cc.check("Tensile stress at " + lab + tg, R(Math.max(0, -smin), 4), perm.ft, { unit: "N/mm²", clause: perm.cl_t });
      else c2 = cc.ok("No tension at " + lab + " (resultant in middle third)" + tg, Math.abs(e) <= w / 6 + 1e-9 && xr > 0, { detail: "e = " + F(e, ".3f") + " m vs w/6 = " + F(w / 6, ".3f") + " m", clause: perm.cl_t });
      ok = ok && c1 && c2;
      out.push({ d: d, w: w, N: N, e: e, smax: smax, smin: smin });
    });
    return { ok: ok, joints: out };
  }
  M.gJoints = gJoints;
  /* permissible stresses for gravity-wall materials */
  function permOf(kind, mortar, gm) {
    if (kind === "pcc") return { name: "PCC M15", fc: 4.0, ft: 0, gm: 24, cl_c: "IS 456 Table 21 (direct compression M15 = 4.0 N/mm²)", cl_t: "Practice – no tension in plain-concrete gravity walls" };
    var m = String(mortar || "CM 1:6"), fc = /1:3/.test(m) ? 0.7 : /1:4/.test(m) ? 0.6 : 0.5, ft = /1:3|1:4/.test(m) ? 0.07 : 0;
    return { name: "RR masonry " + m, fc: fc, ft: ft, gm: gm, cl_c: "IS 1905 cl 5.4 / SP 20 practice for random rubble (" + G(fc) + " N/mm² – verify with stone & mortar tests)",
      cl_t: ft > 0 ? "IS 1905 cl 5.4.2 (0.07 N/mm² for H1/H2 mortar – verify)" : "IS 1905 cl 5.4.2 – no tension for CM 1:6 (M2 mortar)" };
  }
  M.permOf = permOf;

  /* RCC cantilever structural design (stem, heel, toe) from the base-pressure diagram of gSection */
  function cantStruct(c, g, sec, s, mat, given, tag) {
    var tg = tag ? " – " + tag : "", out = {}, dt = DT(), cover = mat.cover, fck = mat.fck, fy = mat.fy;
    var Hs = g.Hs, tb = g.tb, toe = g.toe, B = g.B, heel = g.heel, q = s.q, gam = s.gam;
    var Ka = c.calc("Rankine Ka for stem (level backfill)", "Ka", "(1 - sin(radians(ph)))/(1 + sin(radians(ph)))", "", "Rankine", { ph: s.phi });
    var hw = Math.max(0, Math.min((s.hw || 0) - tb, Hs));
    c.section("Stem" + tg);
    var Mst = c.calc("Stem moment at base (factored 1.5)", "Mu", "1.5*(Ka*g*h**3/6 + Ka*q*h**2/2 + (1 - Ka)*gw*hw**3/6)", "kN·m/m", "IS 456 cl 18.2 / Table 18",
      { Ka: Ka, g: gam, h: R(Hs, 4), q: q, gw: GW, hw: R(hw, 4) });
    var Vst = 1.5 * (Ka * gam * Hs * Hs / 2 + Ka * q * Hs + (1 - Ka) * GW * hw * hw / 2);
    out.stem = X().designStrip(c, Mst, g.tsb * 1000, cover, fck, fy, "stem, earth face" + (tag ? ", " + tag : ""), { given: given ? given.stem : null,
      rule: dt ? { member: "retaining", role: "main" } : null, Vu: Vst, dias: [10, 12, 16, 20, 25] });
    RC().shear(c, Vst, 1000, out.stem.d, 100 * out.stem.Ast_prov / (1000 * out.stem.d), fck, fy, "slab", { D: g.tsb * 1000, tag: "(stem" + (tag ? ", " + tag : "") + ")" });
    c.section("Heel & toe" + tg);
    var xs = toe + g.tsb, f = sec.pAt;
    var Rh = integ(f, xs, B), xr = Rh > 1e-9 ? integ(function (x) { return f(x) * (x - xs); }, xs, B) / Rh : 0;
    var wd = gam * Hs + 25 * tb + q;
    var Mh = c.calc("Heel moment at stem face (factored)", "Mu", "1.5*max(wd*hl**2/2 - Rh*xr, 0)", "kN·m/m", "IS 456 cl 18.2", "Rh = soil reaction under the heel from the base-pressure diagram",
      { wd: R(wd, 3), hl: R(heel, 4), Rh: R(Rh, 4), xr: R(xr, 4) });
    var dh = (tb * 1000 - cover - 8) / 1000, Rhd = integ(f, xs + dh, B);
    var Vh = 1.5 * Math.max(wd * Math.max(heel - dh, 0) - Rhd, 0);
    var prefer = [out.stem.dia];
    out.heel = X().designStrip(c, Math.max(Mh, 0.01), tb * 1000, cover, fck, fy, "heel, top face" + (tag ? ", " + tag : ""), { given: given ? given.base : null,
      rule: dt ? { member: "retaining", role: "main", stem_dia: out.stem.dia, prefer: prefer } : null, Vu: Vh, dias: [10, 12, 16, 20, 25] });
    RC().shear(c, Vh, 1000, out.heel.d, 100 * out.heel.Ast_prov / (1000 * out.heel.d), fck, fy, "slab", { D: tb * 1000, tag: "(heel" + (tag ? ", " + tag : "") + ")" });
    var Rt = integ(f, 0, toe), xt = Rt > 1e-9 ? integ(function (x) { return f(x) * (toe - x); }, 0, toe) / Rt : 0;
    var Mt = c.calc("Toe moment at stem face (factored)", "Mu", "1.5*max(Rt*xt - 25*tb*t**2/2, 0)", "kN·m/m", "IS 456 cl 18.2", { Rt: R(Rt, 4), xt: R(xt, 4), tb: tb, t: toe });
    var Rtd = integ(f, 0, Math.max(toe - dh, 0)), Vt = 1.5 * Math.max(Rtd - 25 * tb * Math.max(toe - dh, 0), 0);
    out.toe = X().designStrip(c, Math.max(Mt, 0.01), tb * 1000, cover, fck, fy, "toe, bottom face" + (tag ? ", " + tag : ""), { given: given ? given.base : null,
      rule: dt ? { member: "retaining", role: "main", stem_dia: out.stem.dia, prefer: prefer } : null, Vu: Vt, dias: [10, 12, 16, 20, 25] });
    RC().shear(c, Vt, 1000, out.toe.d, 100 * out.toe.Ast_prov / (1000 * out.toe.d), fck, fy, "slab", { D: tb * 1000, tag: "(toe" + (tag ? ", " + tag : "") + ")" });
    var Ad = c.calc("Distribution / temperature steel, each face", "As,d", "0.0012*1000*t/2", "mm²/m", "IS 456 cl 26.5.2.1 / 32.5", { t: R(g.tsb * 1000, 1) });
    out.dist = X().stripBars(c, Ad, "retaining", "dist", g.tsb * 1000 - cover - 12, g.tsb * 1000, given ? given.dist : null, "distribution" + (tag ? ", " + tag : ""),
      { dias: [8, 10, 12], rule: { main_dia: out.stem.dia } });
    out.Mst = Mst; out.Mh = Mh; out.Mt = Mt;
    return out;
  }
  M.cantStruct = cantStruct;

  /* weep holes in the exposed height He (m) over a wall length Lw (m) */
  function weeps(c, inp, He, Lw, tw, tag) {
    var wd = num(inp.weep_dia), sh = Math.max(num(inp.weep_sh), 0.1), sv = Math.max(num(inp.weep_sv), 0.1), ft = num(inp.filter_t);
    var rows = Math.max(1, Math.floor(Math.max(He - 0.15 - 0.3, 0) / sv + 1e-9) + 1), per = Math.max(1, Math.floor(Lw / sh + 1e-9) + 1);
    c.let("Weep holes" + (tag ? " – " + tag : ""), "", G(wd) + " mm PVC @ " + F(sh, ".2f") + " m c/c horizontally, " + rows + " row(s) @ " + F(sv, ".2f") +
      " m vertically, staggered, lowest row 150 mm above lower ground / bed, slope 1 in 20 outward", "", "IRC 78 / IRC SP-13 / MORT&H 2706 practice");
    var n = c.calc("Number of weep holes" + (tag ? " – " + tag : ""), "nw", "rows*per", "nos", "", { rows: rows, per: per });
    return { dia: wd, sh: sh, sv: sv, ft: ft, rows: rows, per: per, n: n, len: n * tw };
  }
  function weepChecks(c, w) {
    c.ok("Weep hole diameter ≥ 75 mm", w.dia >= 75, { detail: G(w.dia) + " mm", clause: "practice (75–100 mm; 150 mm for coarse backfill)" });
    c.ok("Weep holes ≤ 1.5 m c/c horizontally", w.sh <= 1.5 + 1e-9, { detail: F(w.sh, ".2f") + " m", clause: "IRC 78 / practice", warn_only: w.sh <= 2.0 });
    c.ok("Weep-hole rows ≤ 1.5 m apart vertically", w.sv <= 1.5 + 1e-9, { detail: F(w.sv, ".2f") + " m", clause: "practice", warn_only: true });
    c.ok("Filter media behind weep holes ≥ 300 mm", w.ft >= 300 - 1e-9, { detail: G(w.ft) + " mm graded filter / geotextile wrap", clause: "IRC 78 App. 6 / MORT&H 2504", warn_only: w.ft >= 200 });
  }
  var DRAIN_OPTS = ["Weep holes + filter media (drained backfill)", "No weep holes (water pressure behind wall)"];

  /* ======================================================================= 1. RIGID PAVEMENT (IRC 58:2015) */
  var RP_ROADS = ["Plant road (CHP / colony / service road)", "Coal yard / CHP hard-standing", "Mine haul road (dumpers)"];
  var RP_VEH = ["Trucks / tippers – CVPD with axle-load spectrum", "Mine dumper preset (passes per day)"];
  var RP_CW = { "Two-lane two-way": 0.25, "Single-lane road": 0.5, "Four-lane divided (per direction)": 0.125 };
  /* IRC 58:2015 Table (recommended temperature differentials, °C) at slab thickness 150 / 200 / 250 / 300 mm – verify */
  var RP_ZONES = {
    "Zone iii – Chhattisgarh, Maharashtra, Karnataka, South MP, AP, W. Odisha, N. TN": [17.3, 19.0, 20.3, 21.0],
    "Zone i – Punjab, Haryana, UP, Rajasthan, Gujarat, North MP": [12.5, 13.1, 14.3, 15.8],
    "Zone ii – Bihar, Jharkhand, WB, Assam, E. Odisha": [15.6, 16.4, 16.6, 16.8],
    "Zone iv – Kerala, South TN": [15.0, 16.4, 17.6, 18.1],
    "Zone v – Coastal areas bounded by hills": [14.6, 15.8, 16.2, 17.0],
    "Zone vi – Coastal areas unbounded by hills": [15.5, 17.0, 19.0, 19.2] };
  var RP_ZN = Object.keys(RP_ZONES);
  /* indicative axle-load spectra (percent of axles in each class; loads kN) – replace with an axle-load survey */
  var RP_SPEC = {
    "Normal – IRC 58:2015 example trend": { front: 60,
      single: [[185, 0.6], [175, 1.1], [165, 2.0], [155, 3.5], [145, 5.0], [135, 8.0], [125, 10.0], [115, 12.0], [105, 14.0], [95, 15.0], [85, 28.8]],
      tandem: [[390, 0.5], [370, 1.0], [350, 2.0], [330, 3.0], [310, 5.0], [290, 8.0], [270, 10.0], [250, 13.0], [230, 15.0], [210, 17.0], [190, 25.5]] },
    "Heavy – coal transport (overloaded tippers)": { front: 70,
      single: [[205, 3], [195, 5], [185, 8], [175, 10], [165, 12], [155, 12], [145, 12], [135, 10], [125, 10], [115, 8], [105, 10]],
      tandem: [[430, 3], [410, 5], [390, 8], [370, 10], [350, 12], [330, 12], [310, 12], [290, 10], [270, 10], [250, 8], [230, 10]] } };
  var RP_SN = Object.keys(RP_SPEC);
  /* IRC 58:2015 Table 2 – CBR (%) → k (MPa/m) */
  var CBR_X = [2, 3, 4, 5, 7, 10, 15, 20, 50, 100], CBR_K = [21, 28, 35, 42, 48, 55, 62, 69, 140, 220];
  M.k_from_cbr = function (cbr) { return C.interp(cbr, CBR_X, CBR_K); };
  /* PCA (1984) Tables 1 & 2 as ratios k_top / k_below (MPa/m), granular 100/150/225/300 mm and cement-treated 100/150/200/250 mm */
  var GR_K = [13.6, 27.2, 54.3, 81.5], GR_T = [0, 100, 150, 225, 300],
    GR_R = [[1, 1.294, 1.5, 1.699, 2.199], [1, 1.298, 1.397, 1.596, 1.897], [1, 1.099, 1.149, 1.35, 1.6], [1, 1.066, 1.099, 1.233, 1.432]];
  var CT_K = [13.6, 27.2, 54.3], CT_T = [0, 100, 150, 200, 250],
    CT_R = [[1, 3.40, 4.59, 6.19, 7.79], [1, 2.79, 3.99, 5.19, 6.39], [1, 2.35, 3.20, 4.15, 5.08]];
  function ratio2(KS, TS, RR, k, t) { var r = RR.map(function (rw) { return C.interp(t, TS, rw); }); return C.interp(k, KS, r); }
  M.k_gsb = function (k, t) { return k * ratio2(GR_K, GR_T, GR_R, k, t); };
  M.k_dlc = function (k, t) { return k * ratio2(CT_K, CT_T, CT_R, k, t); };
  /* Bradbury curling coefficient C vs L/l */
  var BR_X = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14], BR_C = [0, 0, 0.04, 0.175, 0.44, 0.72, 0.92, 1.03, 1.077, 1.08, 1.075, 1.05, 1.0, 1.0];
  M.bradbury = function (r) { return C.interp(r, BR_X, BR_C); };
  /* Westergaard edge stress with the Teller–Sutherland modification as written in IRC 58:2002 (P kN, h mm, l m, q MPa) */
  var EDGE_F = "0.529*P*101.97*(1 + 0.54*mu)/(h/10)**2*(4*log10(lc/bb) + log10(bb) - 0.4048)*0.0981*sf";
  M.edge_b = function (P, h, q) { var a = Math.sqrt(P * 1000 / (Math.PI * q)) / 10, hc = h / 10; return { a: a, b: a < 1.724 * hc ? Math.sqrt(1.6 * a * a + hc * hc) - 0.675 * hc : a }; };
  M.edge = function (P, h, l, q, sf) { var b = M.edge_b(P, h, q).b; return Math.max(0, C.safe_eval(EDGE_F, { P: P, mu: 0.15, h: h, lc: l * 100, bb: b, sf: sf })); };
  M.corner = function (P, h, l, q) { var a = Math.sqrt(P * 1000 / (Math.PI * q)) / 1000; return 3 * P * 1000 / (h * h) * (1 - Math.pow(a * Math.SQRT2 / l, 1.2)); };
  var FAT_F = "1e30 if SR < 0.45 else ((4.2577/(SR - 0.4325))**3.268 if SR <= 0.55 else 10**((0.9718 - SR)/0.0828))";
  M.fatN = function (SR) { return C.safe_eval(FAT_F, { SR: SR }); };
  M.hog = function (L, l) { var u = L / (2 * Math.SQRT2 * l); return Math.max(0, -Math.exp(-u) * (Math.cos(u) - Math.sin(u))); };
  /* IRC 58:2015 dowel bars (slab h mm → dia, length, spacing mm) – verify table */
  var RP_DOWEL = [[200, 25, 360, 300], [230, 30, 400, 300], [250, 32, 450, 300], [280, 36, 450, 300], [300, 38, 500, 300], [350, 38, 500, 300]];
  function dowelTab(h) { for (var i = 0; i < RP_DOWEL.length; i++) if (h <= RP_DOWEL[i][0] + 1e-9) return RP_DOWEL[i]; return RP_DOWEL[RP_DOWEL.length - 1]; }
  M.dowelTab = dowelTab;
  /* Friberg dowel bearing: Pt kN on the joint, d mm, s mm, l m → {nEff, P1 kN, sb, fb N/mm²} */
  M.friberg = function (Pt, d, s, l, fck, z) {
    var nE = 1; for (var i = 1; i * s / 1000 < l; i++) nE += 2 * (1 - i * s / 1000 / l);
    var I = Math.PI * Math.pow(d, 4) / 64, Es = 200000, Kd = 415, be = Math.pow(Kd * d / (4 * Es * I), 0.25);
    var P1 = Pt / nE, sb = Kd * P1 * 1000 * (2 + be * z) / (4 * Math.pow(be, 3) * Es * I), fb = (10.16 - d / 10) * fck / 9.525;
    return { nE: nE, P1: P1, sb: sb, fb: fb, be: be, I: I };
  };

  function rpAnalyse(c, inp, h, mode, given) {
    var dump = String(inp.vehicles).indexOf("Mine dumper") === 0, mine = isMine();
    var E = 30000, mu = 0.15, MR = num(inp.mr), fck = num(inp.fck);
    var Lj = num(inp.joint_L), lw = num(inp.lane_w), tied = /^Tied/.test(String(inp.shoulder)), sf = tied ? 0.85 : 1.0;
    var r = num(inp.growth) / 100, n = num(inp.life), rows = [], o = { h: h, dump: dump, tied: tied, sf: sf };
    var fn = num(inp.night6), ft = num(inp.tdc_share), q, LSF = dump ? 1.0 : num(inp.lsf);
    c.section("Design traffic");
    if (!dump) {
      var A = num(inp.cvpd), cw = String(inp.carriageway), fe0 = RP_CW[cw] != null ? RP_CW[cw] : 0.25;
      var Ct = c.calc("Cumulative commercial vehicles over the design life (both directions)", "Ctot", "365*A*n if r == 0 else 365*A*((1 + r)**n - 1)/r", "CV",
        "IRC 58:2015 cl 3.6", { A: A, r: r, n: n });
      var fe = c.calc("Share of commercial vehicles at the slab edge", "fe", "fv", "", "IRC 58:2015 cl 3.6 (two-lane two-way: 25 % of two-way CV – verify)", cw, { fv: fe0 });
      var NB = c.calc("Repetitions for bottom-up cracking (BUC)", "N_BUC", "Ctot*fe", "CV", "all hours (load-stress fatigue, see note)", { Ctot: Ct, fe: fe });
      var NT = c.calc("Repetitions for top-down cracking (TDC)", "N_TDC", "Ctot*fe*fn*ft", "CV", "IRC 58:2015 cl 3.6 / 3.8: 6 night hours × share with axle spacing ≈ joint spacing",
        { Ctot: Ct, fe: fe, fn: fn, ft: ft });
      var spn = RP_SPEC[String(inp.spectrum)] ? String(inp.spectrum) : RP_SN[0], sp = RP_SPEC[spn], ovl = mine ? 1.10 : 1.0, ts = clamp(num(inp.tandem), 0, 1);
      c.let("Axle-load spectrum", "", spn + (mine ? " × 1.10 (mining area – overloading allowance)" : ""), "", "IRC 58:2015 cl 3.4 – replace with an axle-load survey",
        "tandem share " + F(ts * 100, ".0f") + " % of CVs; front (steering) axles only in TDC");
      LSF = c.let("Load safety factor", "LSF", LSF, "", "IRC 58:2015 cl 3.? (1.2 heavy traffic / 1.1 others – verify)");
      q = c.let("Tyre pressure (trucks)", "q", 0.8, "MPa", "IRC 58:2015 (0.8 MPa)");
      var Pf = sp.front * ovl * LSF / 2;
      sp.single.forEach(function (x) { rows.push({ name: "single " + G(R(x[0] * ovl, 1)) + " kN", Pg: x[0] * ovl, Pw: x[0] * ovl * LSF / 2, nB: NB * (1 - ts) * x[1] / 100, nT: NT * (1 - ts) * x[1] / 100, Pf: Pf }); });
      sp.tandem.forEach(function (x) { rows.push({ name: "tandem " + G(R(x[0] * ovl, 1)) + " kN", Pg: x[0] * ovl, Pw: x[0] * ovl * LSF / 4, nB: NB * ts * x[1] / 100, nT: NT * ts * x[1] / 100, Pf: Pf }); });
      c.info("Tandem axles", "Stress of a tandem group taken as that of a single axle with half the group load", "IRC 58:2015 cl 3.? (verify) [APPROX]");
      o.Ct = Ct; o.NB = NB; o.NT = NT;
    } else {
      var Dm = X().dcDumper(inp), OL = num(inp.overload) || 1.10, Wt = Dm.gvw * 9.81 * OL, nr = Math.max(1, Dm.rear || 1);
      c.let("Dumper", "", Dm.name + ": GVW " + G(Dm.gvw) + " t × overload " + G(OL) + ", front " + F(Dm.f * 100, ".0f") + " %, " + nr + " rear axle(s), tyre " + G(Dm.b * 1000) + " mm @ " + G(Dm.p) + " kPa",
        "", Dm.approx ? "geometry approximate – verify with the OEM data sheet" : "OEM data");
      var Pfa = c.calc("Front axle load (loaded)", "Pf", "Wt*f", "kN", "", { Wt: R(Wt, 3), f: Dm.f });
      var Pra = c.calc("Rear axle load, each (loaded)", "Pr", "Wt*(1 - f)/nr", "kN", "", { Wt: R(Wt, 3), f: Dm.f, nr: nr });
      var I = c.calc("Dynamic (impact) allowance at the slab surface", "I", "imp", "", "DS.loads.impact_dumper(z = 0) – haul-road practice [GP]", { imp: LD().impact_dumper(0) });
      var np = num(inp.passes), ef = clamp(num(inp.empty_frac), 0.2, 1.0), es = clamp(num(inp.edge_share), 0.05, 1);
      var Cp = c.calc("Cumulative loaded passes over the design life", "Npass", "365*np*n if r == 0 else 365*np*((1 + r)**n - 1)/r", "passes", "", { np: np, r: r, n: n });
      var NBd = c.calc("Passes with wheels at a slab edge / joint (BUC)", "N_BUC", "Npass*es", "passes", "wide dumpers on 3.5–4.5 m paving lanes – wheels often at a joint [GP]", { Npass: Cp, es: es });
      var NTd = c.calc("Passes for top-down cracking (TDC)", "N_TDC", "Npass*es*fn*ft", "passes", "IRC 58:2015 approach (6 night hours × share)", { Npass: Cp, es: es, fn: fn, ft: ft });
      q = c.calc("Tyre contact pressure", "q", "p/1000", "MPa", "", { p: Dm.p });
      c.info("Load safety factor", "Not applied for dumpers – the actual (overloaded) wheel load × (1 + impact) is used", "Mine practice");
      var fw = Pfa / 2 * (1 + I), rw = Pra / 2 * (1 + I);
      rows.push({ name: "rear dual pair (loaded)", Pg: Pra, Pw: rw, nB: NBd * nr, nT: NTd, Pf: fw });
      rows.push({ name: "front tyre (loaded)", Pg: Pfa, Pw: fw, nB: NBd, nT: 0, Pf: 0 });
      rows.push({ name: "rear dual pair (empty)", Pg: Pra * ef, Pw: rw * ef, nB: NBd * nr, nT: NTd, Pf: fw * ef });
      rows.push({ name: "front tyre (empty)", Pg: Pfa * ef, Pw: fw * ef, nB: NBd, nT: 0, Pf: 0 });
      c.warn("IRC 58 calibration", "IRC 58 stress charts are calibrated for road axles; dumper wheel loads (" + F(rw, ".0f") + " kN per rear dual pair incl. impact) are far outside them – " +
        "Westergaard edge stress with the actual wheel load + impact is the governing check; consider PCA / heavy-haul methods, RCC (roller compacted) or flexible haul-road design", "IRC 58:2015 scope");
      o.Dm = Dm; o.I = I; o.Ct = Cp; o.NB = NBd; o.NT = NTd;
    }
    o.rows = rows; o.LSF = LSF; o.q = q;
    // ---------------------------------------------------------------- foundation
    c.section("Sub-grade & sub-base (effective k)");
    var cbr = num(inp.cbr), hg = num(inp.h_gsb), hd = num(inp.h_dlc);
    var ksg = num(inp.k_sub) > 0 ? c.let("Modulus of sub-grade reaction (plate-load test)", "k_sg", num(inp.k_sub), "MPa/m", "IS 9214")
      : c.calc("Modulus of sub-grade reaction from CBR", "k_sg", "kv", "MPa/m", "IRC 58:2015 Table 2 (interpolated)", "CBR = " + G(cbr) + " %", { kv: R(M.k_from_cbr(cbr), 2) });
    var kg = c.calc("k on top of granular sub-base", "k_gsb", "k*rt", "MPa/m", "PCA (1984) Table 1 trend as used with IRC 58 [APPROX – verify IRC 58:2015 Table]", "GSB " + G(hg) + " mm",
      { k: ksg, rt: R(ratio2(GR_K, GR_T, GR_R, ksg, hg), 4) });
    var ke0 = hd > 0 ? kg * ratio2(CT_K, CT_T, CT_R, kg, hd) : kg;
    var k = c.calc("Effective k on top of DLC (cement-treated)", "k", "min(kv, 300)", "MPa/m", "PCA (1984) Table 2 trend [APPROX]; capped at 300 MPa/m", "DLC " + G(hd) + " mm", { kv: R(ke0, 2) });
    o.k = k; o.ksg = ksg;
    // ---------------------------------------------------------------- slab
    c.section("Slab, temperature & curling");
    c.let("PQC thickness", "h", h, "mm");
    c.let("Flexural strength (28 d)", "MR", MR, "N/mm²", "IRC 58:2015 cl 3.10 (M40 → 4.5 N/mm²; 0.7√fck = " + F(0.7 * Math.sqrt(fck), ".2f") + ")");
    var l = c.calc("Radius of relative stiffness", "l", "(E*(h/1000)**3/(12*(1 - mu**2)*k))**0.25", "m", "Westergaard / IRC 58:2015 cl 3.? (E = 30000 MPa, μ = 0.15)", { E: E, h: h, mu: mu, k: k });
    var zn = RP_ZONES[String(inp.temp_zone)] ? String(inp.temp_zone) : RP_ZN[0];
    var dT = c.calc("Temperature differential (day, positive)", "ΔT", "dt", "°C", "IRC 58:2015 Table 1 – " + zn.split(" – ")[0] + " (verify)", zn, { dt: R(C.interp(h, [150, 200, 250, 300], RP_ZONES[zn]), 3) });
    var dTn = c.calc("Night (negative) temperature differential", "ΔTn", "dT/2 + 5", "°C", "IRC 58:2015 (half the day value + 5 °C – verify)", { dT: dT });
    var Cb = c.calc("Bradbury coefficient for the edge (L/l)", "Cb", "cv", "", "Bradbury chart (IRC 58:2002 Fig.)", "L/l = " + F(Lj / l, ".2f"), { cv: R(M.bradbury(Lj / l), 4) });
    var st = c.calc("Curling stress at the edge (day)", "σt", "E*alpha*dT*Cb/2", "N/mm²", "Bradbury / IRC 58", { E: E, alpha: 1e-5, dT: dT, Cb: Cb });
    var stn = c.calc("Curling stress at the edge (night, top tension)", "σtn", "E*alpha*dTn*Cb/2", "N/mm²", "Bradbury / IRC 58", { E: E, alpha: 1e-5, dTn: dTn, Cb: Cb });
    o.l = l; o.st = st; o.stn = stn;
    // ---------------------------------------------------------------- load stresses
    c.section("Edge load stress – Westergaard (Teller–Sutherland)");
    var gov = rows.reduce(function (a, b2) { return b2.Pw > a.Pw ? b2 : a; }, rows[0]);
    c.let("Governing wheel load" + (dump ? " (incl. impact)" : " (heaviest, × LSF)"), "P", R(gov.Pw, 3), "kN", "", gov.name);
    var eb = M.edge_b(gov.Pw, h, q);
    var a = c.calc("Radius of tyre contact area", "a", "sqrt(P*1000/(pi*q))/10", "cm", "equal-area circle (dual tyres as one area)", { P: R(gov.Pw, 3), q: q });
    var bb = c.calc("Radius of equivalent distribution", "b", "sqrt(1.6*a**2 + (h/10)**2) - 0.675*h/10 if a < 1.724*h/10 else a", "cm", "Westergaard", { a: a, h: h });
    var sg = c.calc("Edge stress under the governing wheel", "σe", EDGE_F, "N/mm²", "IRC 58:2002 eq. (Westergaard edge, cross-check model) [APPROX for IRC 58:2015 charts]",
      tied ? "tied concrete shoulder: × 0.85 for load transfer [APPROX]" : "untied shoulder: free edge", { P: R(gov.Pw, 3), mu: mu, h: h, lc: R(l * 100, 4), bb: bb, sf: sf });
    o.sg = sg; o.gov = gov; o.a = eb.a;
    // ---------------------------------------------------------------- fatigue
    c.section("Fatigue – bottom-up (BUC) and top-down (TDC) cracking");
    c.info("Fatigue model", "SR = σ/MR; SR < 0.45: unlimited; 0.45 ≤ SR ≤ 0.55: N = (4.2577/(SR − 0.4325))^3.268; SR > 0.55: log10 N = (0.9718 − SR)/0.0828. " +
      "BUC on the Westergaard edge load stress (IRC 58:2002 / PCA approach – curling taken in the strength check); TDC on the hogging stress from loads at both ends of a panel + night curling",
      "IRC 58:2015 cl 3.8 eq. 3–5 [APPROX stress model]");
    var u = Lj / (2 * Math.SQRT2 * l);
    var gh = c.calc("Hogging factor – loads at both transverse joints of a panel", "g", "max(0, -exp(-u)*(cos(u) - sin(u)))", "", "beam on elastic foundation (Hetényi), u = L/(2√2 l) [APPROX for IRC 58:2015 TDC charts]", { u: R(u, 5) });
    var dB = 0, dTd = 0, tb = [], tt = [];
    rows.forEach(function (x) {
      var s1 = M.edge(x.Pw, h, l, q, sf), SR = s1 / MR, Nall = M.fatN(SR), dmg = x.nB / Nall;
      dB += dmg; x.sB = s1; x.SRB = SR;
      tb.push([x.name, R(x.Pg, 1), R(x.Pw, 2), R(s1, 3), R(SR, 3), R(x.nB, 0), Nall >= 1e29 ? "unlimited" : F(Nall, ".3e"), F(dmg, ".4f")]);
      if (x.nT > 0) {
        var s2 = gh * (s1 + (x.Pf > 0 ? M.edge(x.Pf, h, l, q, sf) : 0)) + stn, SR2 = s2 / MR, N2 = M.fatN(SR2), d2 = x.nT / N2;
        dTd += d2; tt.push([x.name, R(s2, 3), R(SR2, 3), R(x.nT, 0), N2 >= 1e29 ? "unlimited" : F(N2, ".3e"), F(d2, ".4f")]);
      }
    });
    var SRg = c.calc("Stress ratio – governing wheel (BUC)", "SR", "s/MR", "", "", { s: sg, MR: MR });
    c.calc("Allowable repetitions – governing wheel", "N", FAT_F, "", "IRC 58:2015 eq. 3–5", { SR: SRg });
    var CB = c.calc("Cumulative fatigue damage – BUC", "CFD_BUC", "D", "", "IRC 58:2015 cl 3.8 (Σ n/N, table)", { D: R(dB, 6) });
    var CT = c.calc("Cumulative fatigue damage – TDC", "CFD_TDC", "D", "", "IRC 58:2015 cl 3.8 (Σ n/N, table)", { D: R(dTd, 6) });
    c.check("Total fatigue damage CFD_BUC + CFD_TDC ≤ 1", R(CB + CT, 6), 1.0, { clause: "IRC 58:2015 cl 3.8", note: CB + CT > 1 ? "increase the slab thickness" : "" });
    o.CB = CB; o.CT = CT; o.tb = tb; o.tt = tt;
    // ---------------------------------------------------------------- strength
    c.section("Strength (cross-check)");
    var se = c.calc("Edge stress: governing wheel + day curling", "σ", "se + st", "N/mm²", dump ? "Westergaard edge with actual wheel + impact – governing check for dumpers" : "IRC 58:2002 practice (load + curling ≤ MR)", { se: sg, st: st });
    c.check("Edge stress ≤ flexural strength", se, MR, { unit: "N/mm²", clause: "IRC 58 / Westergaard", note: se > MR ? "increase thickness" : "" });
    var Pc = gov.Pw;
    var scr = c.calc("Corner stress (Westergaard, no load transfer)", "σc", "3*P*1000/h**2*(1 - (a*sqrt(2)/l)**1.2)", "N/mm²", "IRC 58:2002 eq. (corner) – cross-check",
      { P: R(Pc, 3), h: h, a: R(eb.a / 100, 5), l: l });
    c.check("Corner stress ≤ flexural strength", scr, MR, { unit: "N/mm²", clause: "Westergaard corner (dowelled & tied corners carry 20–30 % less)" });
    c.check("PQC thickness ≥ 150 mm", h, 150, { mode: ">=", unit: "mm", clause: "IRC 58:2015 (minimum)" });
    o.se = se; o.scr = scr;
    // ---------------------------------------------------------------- joints
    c.section("Joints, dowel & tie bars");
    c.ok("Contraction joint spacing ≤ 4.5 m", Lj <= 4.5 + 1e-9, { detail: F(Lj, ".2f") + " m", clause: "IRC 58:2015 / IRC 15 (unreinforced PQC)" });
    c.ok("Panel aspect L / W ≤ 1.25", Lj / lw <= 1.25 + 1e-9, { detail: "L/W = " + F(Lj / lw, ".2f"), clause: "IRC 15 practice", warn_only: true });
    c.ok("Longitudinal joint spacing (paving lane) ≤ 4.5 m", lw <= 4.5 + 1e-9, { detail: F(lw, ".2f") + " m", clause: "IRC 58 / IRC 15", warn_only: true });
    var tab = dowelTab(h), dd, ds = tab[3], dlen = tab[2];
    if (given) { dd = given.dia; ds = given.s; dlen = given.len; }
    else dd = tab[1];
    c.let("Dowel bars – IRC 58 table for h = " + G(h) + " mm", "", G(tab[1]) + " mm Ø × " + G(tab[2]) + " mm @ " + G(tab[3]) + " mm c/c", "", "IRC 58:2015 Table 7 (verify)", "plain mild steel, ½ length debonded + 50 mm end cap");
    var LT = dump ? 0.4 : 0.3, Pdw = dump ? gov.Pw : rows.reduce(function (m, x) { return Math.max(m, x.Pw / Math.max(LSF, 1e-9)); }, 0);
    var fr, ii;
    if (!given && dump) {
      var DD = [25, 30, 32, 36, 38, 40, 45, 50].filter(function (x) { return x >= dd; }), SS = [300, 250, 200];
      outer: for (ii = 0; ii < DD.length; ii++) for (var jj = 0; jj < SS.length; jj++) {
        fr = M.friberg(LT * Pdw, DD[ii], SS[jj], l, fck, 5);
        if (fr.sb <= fr.fb) { dd = DD[ii]; ds = SS[jj]; break outer; }
        dd = DD[ii]; ds = SS[jj];
      }
      if (dd > tab[1]) dlen = Math.max(dlen, 600);
    }
    fr = M.friberg(LT * Pdw, dd, ds, l, fck, 5);
    c.let("Dowel bars adopted", "", G(dd) + " mm Ø × " + G(dlen) + " mm @ " + G(ds) + " mm c/c, first bar 150 mm from the edge", "", given ? "given" : dump ? "IRC 58 table, increased for the Friberg check (dumper)" : "IRC 58:2015 Table 7");
    var nEff = c.calc("Dowels sharing the wheel load (within l, linear)", "n", "nv", "", "Friberg / IRC 58:2002 eq.", { nv: R(fr.nE, 4) });
    var P1 = c.calc("Load on the critical dowel", "P1", "LT*P/n", "kN", "load transfer " + F(LT * 100, ".0f") + " % across the joint [GP]", { LT: LT, P: R(Pdw, 3), n: nEff });
    var bta = c.calc("Relative stiffness of dowel", "β", "(Kd*d/(4*Es*I))**0.25", "1/mm", "Kd = 415 N/mm³ (IRC 58)", { Kd: 415, d: dd, Es: 200000, I: R(fr.I, 2) });
    var sbr = c.calc("Bearing stress on concrete (Friberg)", "σb", "Kd*P1*1000*(2 + beta*z)/(4*beta**3*Es*I)", "N/mm²", "IRC 58:2002 eq. (z = 5 mm sawn contraction joint; 20 mm at expansion joints)",
      { Kd: 415, P1: P1, beta: bta, z: 5, Es: 200000, I: R(fr.I, 2) });
    var fb = c.calc("Permissible bearing stress", "Fb", "(10.16 - d/10)*fck/9.525", "N/mm²", "IRC 58:2002 eq.", { d: dd, fck: fck });
    if (dump) c.check("Dowel bearing stress ≤ permissible (dumper wheel)", sbr, fb, { unit: "N/mm²", clause: "Friberg / IRC 58" });
    else c.ok("Dowel bearing stress ≤ permissible (cross-check; IRC 58 table governs)", sbr <= fb, { detail: F(sbr, ".1f") + " ≤ " + F(fb, ".1f") + " N/mm²", clause: "Friberg / IRC 58", warn_only: true });
    if (given) c.ok("Dowel size ≥ IRC 58 table", dd >= tab[1] - 1e-9 && ds <= tab[3] + 1e-9 && dlen >= tab[2] - 1e-9, { detail: G(dd) + "Ø × " + G(dlen) + " @ " + G(ds) + " vs table " + G(tab[1]) + "Ø × " + G(tab[2]) + " @ " + G(tab[3]),
      clause: "IRC 58:2015 Table 7", warn_only: true });
    // tie bars
    var tdia = given ? given.tdia : h >= 350 ? 16 : 12, bfree = lw;
    var Asr = c.calc("Tie-bar steel per metre of longitudinal joint", "As", "1000*b*f*W/S", "mm²/m", "IRC 58:2015 cl 5.? eq. (f = 1.5, S = 200 N/mm² deformed bars)",
      "b = distance to the nearest free edge", { b: bfree, f: 1.5, W: R(24 * h / 1000, 4), S: 200 });
    var tsp = given ? given.ts : Math.max(200, Math.min(750, floor_to(1000 * area(tdia) / Math.max(Asr, 1e-6), 10)));
    var tl = c.calc("Tie-bar length", "Lt", "max(ceil((S*d/(2*Bd) + 100)/10)*10, Lmin)", "mm", "IRC 58:2015 (bond 2.46 N/mm² deformed; ≥ 640 mm for 12Ø, 800 mm for 16Ø)",
      { S: 200, d: tdia, Bd: 2.46, Lmin: tdia >= 16 ? 800 : 640 });
    c.let("Tie bars adopted", "", G(tdia) + " mm Ø TMT × " + G(tl) + " mm @ " + G(tsp) + " mm c/c", "", given ? "given" : "IRC 58:2015 (spacing ≤ 750 mm)", "As,prov = " + F(1000 * area(tdia) / tsp, ".0f") + " mm²/m");
    c.check("Tie-bar steel provided ≥ required", 1000 * area(tdia) / tsp, Asr, { unit: "mm²/m", mode: ">=", clause: "IRC 58:2015" });
    c.info("Joint grooves", "Contraction joints sawn 3–5 mm wide to h/4 – h/3 (" + F(h / 4, ".0f") + "–" + F(h / 3, ".0f") + " mm) within 4–12 h, widened to 10 mm × 20–25 mm for sealant; longitudinal joints sawn to h/3", "IRC 15 / IRC 58");
    o.dowel = { dia: dd, s: ds, len: dlen, sb: sbr, fb: fb }; o.tie = { dia: tdia, s: tsp, len: tl, As: Asr };
    return o;
  }
  M.rpAnalyse = rpAnalyse;

  function run_rigid_pavement(inp, mode) {
    var c = new C.Calc("Rigid pavement (PQC) – IRC 58:2015");
    var dump = String(inp.vehicles).indexOf("Mine dumper") === 0, road = String(inp.road_type), mine = isMine();
    var gvw = dump ? X().dcDumper(inp).gvw : 0, A = num(inp.cvpd);
    var thumbH = dump ? Math.min(1000, ceil_to(250 + 2 * gvw, 10)) : A < 150 ? 200 : A < 450 ? 250 : A < 1500 ? 280 : A < 4500 ? 300 : 320;
    var h, given = null;
    if (/haul/.test(road) && !dump) c.warn("Haul road with truck traffic", "Road type is a mine haul road but the traffic is road trucks – choose the dumper preset if dumpers use it", "Mine practice");
    if (mode === "check") {
      h = num(inp.h_chk);
      given = { dia: num(inp.dowel_dia), s: num(inp.dowel_s), len: num(inp.dowel_len), tdia: num(inp.tie_dia), ts: num(inp.tie_s) };
    } else if (mode === "thumb") {
      h = thumbH;
      c.info("Thumb-rule thickness", dump ? "h ≈ 250 + 2 × GVW(t) mm for haul roads (indicative)" : "h ≈ 200 / 250 / 280 / 300 / 320 mm for < 150 / 450 / 1500 / 4500 / more CVPD (IRC SP-62 / IRC 58 trend)", "Practice");
    } else {
      h = dump ? 250 : 150;
      for (var it = 0; it < 120; it++) {
        var sc = new C.Calc("s");
        rpAnalyse(sc, inp, h, mode, null);
        if (!sc.failures.some(function (x) { return /fatigue|Edge stress|Corner stress|thickness ≥/.test(x.label); }) || h >= 1200) break;
        h += 10;
      }
    }
    var o = rpAnalyse(c, inp, h, mode, given);
    c.thumb("PQC thickness", thumbH, h, "mm", dump ? "250 + 2 × GVW (t)" : "IRC SP-62 / IRC 58 trend by CVPD", "Practice");
    c.thumb("Dowel bar diameter", Math.round(h / 8), o.dowel.dia, "mm", "≈ h / 8", "PCA practice");
    c.thumb("Joint spacing", Math.min(4.5, 21 * h / 1000), num(inp.joint_L), "m", "≈ 21 × h (m) ≤ 4.5 m", "PCA / ACPA");
    c.miss("Axle-load survey (or dumper fleet data) to replace the indicative spectrum; traffic count with growth", "IRC 58:2015 cl 3.4", dump ? "Critical" : "Important");
    c.miss("Sub-grade CBR (soaked, 4 days) and plate-load test on the prepared DLC; sub-surface drainage (GSB drainage layer daylighted / longitudinal drains)", "IRC 58:2015 / IRC SP-42", "Important");
    c.miss("Concrete mix design for flexural strength (beam tests IS 516) and trial length; joint sealant specification", "IRC 15 / MORT&H 602", "Advisory");
    if (mine) c.miss("Coal spillage / dust: kerbs, regular cleaning; acid mine water in drains – sulphate-resisting cement where tested", "Mine practice", "Important");
    if (dump) c.miss("Haul-road geometry (width ≥ 3 × dumper width, cross-fall 2–3 %, safety bunds ≥ ½ wheel height) per DGMS / CMR 2017", "CMR 2017 Reg. 98 / DGMS", "Important");
    // ---------------------------------------------------------------- joint layout, BBS
    var Lr = num(inp.length), W = num(inp.width), lw = num(inp.lane_w), tied = o.tied, shw = tied ? num(inp.sh_w) : 0;
    var lanes = Math.max(1, Math.round(W / lw)), pw = W / lanes, Wp = W + 2 * shw, Lj = num(inp.joint_L);
    var nT = Math.max(1, Math.floor(Lr / Lj + 1e-9)), nL = lanes - 1 + (tied ? 2 : 0);
    var B_ = BB(), dw = o.dowel, ti = o.tie;
    var perJ = lanes * B_.count(pw * 1000, dw.s, 150) + (tied ? 2 * B_.count(shw * 1000, dw.s, 150) : 0);
    var bbs = [B_.row("Transverse joints", "D1", dw.dia, "straight plain MS dowel (½ debonded + cap)", nT * perJ, B_.straight(dw.dia, dw.len), "@ " + G(dw.s) + " c/c, " + perJ + " per joint × " + nT + " joints")];
    if (nL > 0) bbs.push(B_.row("Longitudinal joints", "T1", ti.dia, "straight deformed tie bar", nL * B_.count(Lr * 1000, ti.s, 250), B_.straight(ti.dia, ti.len), "@ " + G(ti.s) + " c/c, " + nL + " joint line(s)"));
    var tables = { "BUC fatigue (edge load stress)": C.table(o.tb, ["Axle / wheel group", "Group load kN", "Wheel kN (design)", "σ N/mm²", "SR", "Repetitions n", "Allowable N", "n/N"]) };
    if (o.tt.length) tables["TDC fatigue (hogging + night curling)"] = C.table(o.tt, ["Axle / wheel group", "σ top N/mm²", "SR", "Repetitions n", "Allowable N", "n/N"]);
    // ---------------------------------------------------------------- quantities
    var hm = o.h / 1000, hg = num(inp.h_gsb) / 1000, hd = num(inp.h_dlc) / 1000, fck = num(inp.fck), comp = /^MPPWD/.test(String(inp.rate_basis)), qty = [];
    var Ljt = nT * Wp + nL * Lr;
    qty.push(Q("Excavation for roadwork (pavement box) in soil with hydraulic excavator, disposal ≤ 1000 m", "cum", [row("Pavement box", 1, Lr, Wp + 1.0, hm + hd + hg)], [MPPWD, "3.3"]));
    qty.push(Q("Construction of sub-grade 500 mm with approved material CBR ≥ " + G(num(inp.cbr)) + " %, compacted to 97 % MDD", "cum", [row("Sub-grade", 1, Lr, Wp + 1.0, 0.5)], [MPPWD, "3.10"]));
    if (hg > 0) qty.push(Q("Granular sub-base (drainage layer) Grading as per MORT&H 401", "cum", [row("GSB", 1, Lr, Wp + 1.0, hg)], [MPPWD, "4.1"]));
    if (hd > 0) qty.push(Q("Dry lean cement concrete (DLC) sub-base, 7-day strength ≥ 10 MPa, paver laid", "cum", [row("DLC (0.5 m wider than PQC)", 1, Lr, Wp + 0.5, hd)], [MPPWD, "6.1"]));
    var pqcLink = comp ? (fck === 40 ? [MPPWD, "6.3"] : fck === 30 ? [MPPWD, "6.4"] : null) : null;
    if (comp) qty.push(Q("Cement concrete pavement (PQC) M" + G(fck) + ", dowel-jointed, incl. joints, filler, sealant, separation membrane & curing compound (excl. dowel & tie steel)", "cum",
      [row("PQC" + (tied ? " incl. tied concrete shoulders" : ""), 1, Lr, Wp, hm)], pqcLink, pqcLink ? 0 : (fck >= 45 ? 7400 : 6900), pqcLink ? "" : "Non-SOR – M" + G(fck) + " PQC not in MPPWD SOR 2017; rate by analysis (MPPWD 6.3 is M40)"));
    else qty.push(Q("Cement concrete pavement (PQC) M" + G(fck) + " – concrete only, paver laid (joints, sealant, membrane & curing measured separately)", "cum",
      [row("PQC" + (tied ? " incl. tied concrete shoulders" : ""), 1, Lr, Wp, hm)], null, fck >= 45 ? 7000 : fck >= 40 ? 6500 : 6100, "Non-SOR – rate by analysis"));
    var dRows = bbs.filter(function (b) { return b.mark === "D1"; }), tRows = bbs.filter(function (b) { return b.mark === "T1"; });
    qty.push(steelQty(dRows, "PQC", "Mild steel plain round dowel bars Fe250 with debonding coat & end caps – cutting, placing on cradles", [CPWD, "5.22.1"]));
    if (tRows.length) qty.push(steelQty(tRows, "PQC", "Reinforcement TMT Fe500 deformed tie bars at longitudinal joints – cutting, placing"));
    var inc = [["Joint sealant (polysulphide / hot-poured) incl. groove cutting & backer rod", "metre", R(Ljt, 2)], ["Polythene separation membrane 125 µm over DLC", "sqm", R(Lr * Wp, 2)],
      ["Curing compound + wet hessian curing 14 days", "sqm", R(Lr * Wp, 2)]];
    if (comp) tables["Included in the PQC item (MPPWD 6.3 / 6.4) – material reconciliation"] = C.table(inc, ["Item", "Unit", "Quantity"]);
    else {
      qty.push(Q("Joint sealant (polysulphide / hot-poured) in contraction & longitudinal joints incl. sawing groove, backer rod & primer", "metre",
        [row("Transverse joints " + nT + " × " + F(Wp, ".2f") + " m", nT, Wp), row("Longitudinal joints " + nL + " × " + F(Lr, ".0f") + " m", nL, Lr)], null, 180, "Non-SOR – rate by analysis"));
      qty.push(Q("Polythene separation membrane 125 micron between DLC and PQC", "sqm", [row("Membrane", 1, Lr, Wp)], null, 25, "Non-SOR – market rate"));
      qty.push(Q("Curing compound (non-pigmented) on PQC surface + wet hessian curing", "sqm", [row("Curing", 1, Lr, Wp)], [CPWD, "5.41.1"]));
    }
    var sheet = rpDrawing(inp, o, lanes, pw, shw, nT);
    var steelKg = C.sum(bbs.map(function (b) { return b.weight; }));
    var summary = { "PQC slab": G(o.h) + " mm M" + G(fck) + " (MR " + G(num(inp.mr)) + " N/mm²) on " + (hd > 0 ? G(hd * 1000) + " mm DLC + " : "") + (hg > 0 ? G(hg * 1000) + " mm GSB" : "sub-grade"),
      "Effective k": F(o.k, ".0f") + " MPa/m (sub-grade " + F(o.ksg, ".0f") + ")",
      "Fatigue": "CFD BUC " + F(o.CB, ".3f") + " + TDC " + F(o.CT, ".3f") + " = " + F(o.CB + o.CT, ".3f"),
      "Edge / corner stress": F(o.se, ".2f") + " / " + F(o.scr, ".2f") + " N/mm² (MR " + G(num(inp.mr)) + ")",
      "Joints": "contraction @ " + F(Lj, ".2f") + " m, " + lanes + " paving lane(s) of " + F(pw, ".2f") + " m" + (tied ? " + tied shoulders " + F(shw, ".2f") + " m" : ""),
      "Dowels": G(o.dowel.dia) + "Ø × " + G(o.dowel.len) + " @ " + G(o.dowel.s) + " (plain MS)", "Tie bars": G(o.tie.dia) + "Ø × " + G(o.tie.len) + " @ " + G(o.tie.s) + " (TMT)",
      "Steel": F(steelKg, ".0f") + " kg for " + F(Lr, ".0f") + " m", "Max utilisation": F(c.max_utilisation, ".2f") };
    if (dump) summary["Dumper"] = o.Dm.name + " – Westergaard edge with impact governs";
    var refs = ["IRC 58:2015 – Guidelines for the design of plain jointed rigid pavements", "IRC 15:2017 – Code of practice for construction of concrete roads",
      "MORT&H Specifications Section 600 (DLC 601, PQC 602)", "PCA (1984) – Thickness design for concrete highway and street pavements", "IRC SP-62 – Rural roads (concrete)"];
    return C.DesignResult({ module: "rigid_pavement", title: "Rigid pavement (PQC) – IRC 58", inputs: inp, calc: c, summary: summary, drawings: [sheet], quantities: qty, bbs: bbs,
      tables: tables, references: refs });
  }
  M.run_rigid_pavement = run_rigid_pavement;

  function rpDrawing(inp, o, lanes, pw, shw, nT) {
    var D_ = DR(), h = o.h, hd = num(inp.h_dlc), hg = num(inp.h_gsb), W = num(inp.width) * 1000, sh = shw * 1000, Wp = W + 2 * sh, ex = 4;
    var Lj = num(inp.joint_L) * 1000, dw = o.dowel, ti = o.tie;
    // cross-section (thickness exaggerated)
    var s = new D_.View("Cross-section (thicknesses × " + ex + ")");
    var y = 0;
    s.rect(-500, -500 * ex / 2, Wp + 1000, 500 * ex / 2, "SOIL");
    if (hg > 0) { s.rect(-500, y, Wp + 1000, hg * ex, "OUTLINE", "soil"); s.text(Wp + 700, y + hg * ex / 2, "GSB " + G(hg), 2.2); y += hg * ex; }
    if (hd > 0) { s.rect(-250, y, Wp + 500, hd * ex, "OUTLINE", "concrete"); s.text(Wp + 700, y + hd * ex / 2, "DLC " + G(hd), 2.2); y += hd * ex; }
    s.rect(0, y, Wp, h * ex, "OUTLINE", "concrete");
    s.text(Wp + 700, y + h * ex / 2, "PQC M" + G(num(inp.fck)) + " " + G(h), 2.2);
    s.text(Wp + 700, -500 * ex / 4, "Sub-grade 500 (k " + F(o.k, ".0f") + " MPa/m on DLC)", 2.2);
    var xs = []; for (var i = 1; i < lanes; i++) xs.push(sh + i * pw * 1000);
    if (sh > 0) { xs.push(sh); xs.push(sh + W); }
    xs.forEach(function (x) { s.line(x, y, x, y + h * ex, "CENTER"); s.line(x - ti.len / 2, y + h * ex / 2, x + ti.len / 2, y + h * ex / 2, "REBAR"); });
    s.text(Wp / 2, y + h * ex + 400, "Tie bars " + G(ti.dia) + "Ø × " + G(ti.len) + " @ " + G(ti.s) + " at longitudinal joints", 2.2, { anchor: "middle" });
    s.dim(0, y + h * ex, Wp, y + h * ex, -10, "PQC " + F(Wp, ",.0f"));
    if (sh > 0) s.dim(0, -500 * ex / 2, sh, -500 * ex / 2, 8, "SHOULDER " + F(sh, ",.0f"));
    // joint layout plan (3 panels)
    var p = new D_.View("Joint layout – plan (3 panels)"), Ls = 3 * Lj;
    p.rect(0, 0, Ls, Wp, "OUTLINE");
    for (var k = 1; k < 3; k++) { p.line(k * Lj, 0, k * Lj, Wp, "CENTER"); }
    xs.forEach(function (x) { p.line(0, x, Ls, x, "CENTER"); });
    for (var k2 = 1; k2 < 3; k2++) for (var yy = 150; yy <= Wp - 150 + 1e-6; yy += dw.s) p.line(k2 * Lj - dw.len / 2, yy, k2 * Lj + dw.len / 2, yy, "STEEL");
    xs.forEach(function (x) { for (var xx = 250; xx <= Ls - 250 + 1e-6; xx += ti.s) p.line(xx, x - ti.len / 2, xx, x + ti.len / 2, "REBAR"); });
    p.text(Lj, -500, "Contraction joints @ " + F(Lj, ",.0f") + " c/c with dowels " + G(dw.dia) + "Ø × " + G(dw.len) + " @ " + G(dw.s), 2.2, { anchor: "middle" });
    p.dim(0, Wp, Lj, Wp, -8); p.dim(Ls, 0, Ls, Wp, -8);
    if (lanes > 1) p.dim(0, sh, 0, sh + pw * 1000, 8, "LANE " + F(pw * 1000, ",.0f"));
    // contraction joint detail
    var j = new D_.View("Detail – contraction joint (dowelled)"), w = 1200;
    j.rect(-w / 2, 0, w, h, "OUTLINE", "concrete");
    if (hd > 0) j.rect(-w / 2, -hd, w, hd, "CONCRETE");
    j.line(0, h, 0, h - h / 4, "THIN"); j.line(0, h - h / 4, 0, 0, "HIDDEN");
    j.rect(-5, h - 25, 10, 25, "TEXT");
    j.rect(-dw.len / 2, h / 2 - dw.dia / 2, dw.len, dw.dia, "STEEL", "steel");
    j.line(0, h / 2 + dw.dia, dw.len / 2, h / 2 + dw.dia, "THIN");
    j.text(dw.len / 2 + 60, h / 2, "Dowel " + G(dw.dia) + "Ø × " + G(dw.len) + ", ½ debonded + cap", 2.0);
    j.text(60, h + 60, "Saw cut h/4 = " + F(h / 4, ".0f") + ", sealant 10 × 20", 2.0);
    j.dim(w / 2, 0, w / 2, h, -8); j.dim(-dw.len / 2, h / 2, dw.len / 2, h / 2, 10);
    // longitudinal joint detail
    var t = new D_.View("Detail – longitudinal joint (tied)");
    t.rect(-w / 2, 0, w, h, "OUTLINE", "concrete");
    t.line(0, h, 0, h - h / 3, "THIN"); t.line(0, h - h / 3, 0, 0, "HIDDEN");
    t.line(-ti.len / 2, h / 2, ti.len / 2, h / 2, "REBAR");
    t.text(ti.len / 2 + 60, h / 2, "Tie " + G(ti.dia) + "Ø TMT × " + G(ti.len) + " @ " + G(ti.s), 2.0);
    t.text(60, h + 60, "Saw cut h/3 = " + F(h / 3, ".0f") + ", sealed", 2.0);
    t.dim(w / 2, 0, w / 2, h, -8); t.dim(-ti.len / 2, h / 2, ti.len / 2, h / 2, 10);
    var notes = ["PQC M" + G(num(inp.fck)) + " (flexural strength " + G(num(inp.mr)) + " N/mm²), thickness " + G(h) + " mm; DLC " + G(hd) + " mm, GSB " + G(hg) + " mm (IRC 58:2015 / MORT&H 601–602).",
      "Contraction joints every " + F(Lj / 1000, ".2f") + " m (" + nT + " nos), dowels plain MS " + G(dw.dia) + " mm × " + G(dw.len) + " @ " + G(dw.s) + " c/c, 150 mm from edges.",
      "Longitudinal joints tied with " + G(ti.dia) + " mm TMT × " + G(ti.len) + " @ " + G(ti.s) + " c/c; expansion joints only at structures.",
      "125 µm polythene separation membrane on DLC; curing compound + wet hessian 14 days; open to traffic after 28 days."];
    return new D_.Sheet("Rigid pavement – cross-section & joint layout", "RP-01", [s, p, j, t], notes);
  }

  var RP_PARAMS = [
    P("road_type", "Road type", RP_ROADS[0], { kind: "select", options: RP_ROADS.slice(), group: "Traffic" }),
    P("vehicles", "Traffic", RP_VEH[0], { kind: "select", options: RP_VEH.slice(), group: "Traffic",
      help: "Trucks: CVPD + IRC 58 axle-load spectrum. Dumpers: preset wheel loads – IRC 58 is not calibrated for them; Westergaard edge with impact governs." }),
    P("cvpd", "Commercial vehicles per day (both directions, present)", 1500.0, "CVPD", { min: 10, max: 20000, group: "Traffic", when: function (v) { return String(v.vehicles).indexOf("Mine") < 0; } }),
    P("growth", "Traffic growth rate", 5.0, "%", { min: 0, max: 12, step: 0.5, group: "Traffic" }),
    P("life", "Design life", 30.0, "years", { min: 5, max: 40, group: "Traffic", help: "IRC 58:2015: 30 years for concrete pavements" }),
    P("carriageway", "Carriageway (edge traffic share)", "Two-lane two-way", { kind: "select", options: Object.keys(RP_CW), group: "Traffic", when: function (v) { return String(v.vehicles).indexOf("Mine") < 0; } }),
    P("spectrum", "Axle-load spectrum", RP_SN[1], { kind: "select", options: RP_SN.slice(), group: "Traffic", when: function (v) { return String(v.vehicles).indexOf("Mine") < 0; } }),
    P("tandem", "Share of CVs with tandem rear axles", 0.45, { min: 0, max: 1, step: 0.05, group: "Traffic", when: function (v) { return String(v.vehicles).indexOf("Mine") < 0; } }),
    P("lsf", "Load safety factor", 1.2, { kind: "select", options: [1.0, 1.1, 1.2], group: "Traffic", when: function (v) { return String(v.vehicles).indexOf("Mine") < 0; } }),
    P("night6", "Share of daily traffic in the 6 night hours (TDC)", 0.25, { min: 0.05, max: 0.6, step: 0.05, group: "Traffic", help: "Coal transport runs round the clock: 0.25" }),
    P("tdc_share", "Share of vehicles with axle spacing ≈ joint spacing (TDC)", 0.45, { min: 0.1, max: 1, step: 0.05, group: "Traffic" })
  ].concat(dumperParams(function (v) { return String(v.vehicles).indexOf("Mine") === 0; }), [
    P("passes", "Dumper: loaded passes per day (per lane)", 200.0, { min: 1, max: 5000, group: "Mine dumper", when: function (v) { return String(v.vehicles).indexOf("Mine") === 0; } }),
    P("empty_frac", "Dumper: empty weight / loaded weight", 0.42, { min: 0.2, max: 1.0, step: 0.01, group: "Mine dumper", when: function (v) { return String(v.vehicles).indexOf("Mine") === 0; } }),
    P("edge_share", "Dumper: share of passes with wheels at an edge / joint", 0.5, { min: 0.05, max: 1, step: 0.05, group: "Mine dumper", when: function (v) { return String(v.vehicles).indexOf("Mine") === 0; } }),
    P("cbr", "Sub-grade CBR (soaked)", 6.0, "%", { min: 2, max: 50, step: 0.5, group: "Foundation" }),
    P("k_sub", "k from plate-load test (0 = from CBR)", 0.0, "MPa/m", { min: 0, max: 300, group: "Foundation" }),
    P("h_gsb", "GSB (drainage layer) thickness", 150.0, "mm", { min: 0, max: 450, step: 25, group: "Foundation" }),
    P("h_dlc", "DLC sub-base thickness", 150.0, "mm", { min: 0, max: 300, step: 25, group: "Foundation" }),
    P("fck", "PQC concrete grade", 40.0, "N/mm²", { kind: "select", options: [30.0, 35.0, 40.0, 45.0], group: "Concrete" }),
    P("mr", "Flexural strength MR (28 d)", 4.5, "N/mm²", { min: 3.5, max: 6.0, step: 0.1, group: "Concrete", help: "IRC 58:2015: 4.5 N/mm² for M40 (0.7√fck)" }),
    P("temp_zone", "Temperature zone (IRC 58 Table)", RP_ZN[0], { kind: "select", options: RP_ZN.slice(), group: "Concrete" }),
    P("joint_L", "Contraction joint spacing", 4.5, "m", { min: 3.0, max: 6.0, step: 0.25, group: "Joints" }),
    P("lane_w", "Paving lane width (longitudinal joint spacing)", 3.5, "m", { min: 2.5, max: 5.0, step: 0.25, group: "Joints" }),
    P("shoulder", "Shoulder", "Tied concrete shoulder", { kind: "select", options: ["Tied concrete shoulder", "Untied shoulder (granular / bituminous)"], group: "Joints" }),
    P("sh_w", "Concrete shoulder width (each side)", 1.5, "m", { min: 0.5, max: 2.5, step: 0.25, group: "Joints", when: function (v) { return /^Tied/.test(String(v.shoulder)); } }),
    P("width", "Carriageway width", 7.0, "m", { min: 3.0, max: 30, step: 0.5, group: "Quantity" }),
    P("length", "Length of road / yard strip (quantity)", 500.0, "m", { min: 10, max: 20000, group: "Quantity" }),
    P("rate_basis", "Estimate basis for PQC", "MPPWD 6.3 / 6.4 composite (joints, sealant, membrane, curing included)", { kind: "select",
      options: ["MPPWD 6.3 / 6.4 composite (joints, sealant, membrane, curing included)", "Separate items (concrete only + sealant + membrane + curing)"], group: "Quantity" }),
    P("h_chk", "PQC thickness (check)", 340.0, "mm", { min: 150, max: 1200, step: 10, group: "My design", modes: CHECK }),
    P("dowel_dia", "Dowel dia (check)", 38.0, "mm", { kind: "select", options: [25.0, 30.0, 32.0, 36.0, 38.0, 40.0, 45.0, 50.0], group: "My design", modes: CHECK }),
    P("dowel_s", "Dowel spacing (check)", 300.0, "mm", { min: 150, max: 400, step: 25, group: "My design", modes: CHECK }),
    P("dowel_len", "Dowel length (check)", 500.0, "mm", { min: 300, max: 700, step: 10, group: "My design", modes: CHECK }),
    P("tie_dia", "Tie bar dia (check)", 12.0, "mm", { kind: "select", options: [10.0, 12.0, 16.0, 20.0], group: "My design", modes: CHECK }),
    P("tie_s", "Tie bar spacing (check)", 500.0, "mm", { min: 200, max: 900, step: 10, group: "My design", modes: CHECK })
  ]);
  M.RP_PARAMS = RP_PARAMS;
  C.register({ id: "rigid_pavement", phase: 3, category: "Drains, culverts & roads", name: "Rigid pavement – PQC (IRC 58:2015)", icon: "🛣️",
    description: "Plain jointed concrete pavement for plant roads, CHP / coal yards and haul roads: k from CBR + GSB / DLC, Westergaard edge & corner stresses, " +
      "Bradbury curling, BUC + TDC fatigue (IRC 58 fatigue equations), dowel (IRC 58 table + Friberg) & tie bars, joint layout, dumper presets, BBS & MPPWD quantities.",
    params: RP_PARAMS, run: run_rigid_pavement, references: ["IRC 58:2015", "IRC 15:2017", "MORT&H Section 600"] });

  /* ======================================================================= 2. CULVERT HEADWALL + WING / RETURN WALLS */
  var CH_VEH = ["Road – IRC loading (1.2 m earth surcharge)", "Mine dumper – haul road (dumper surcharge)", "Railway – IRS / RDSO loading (track surcharge)"];
  var CH_LAY = ["Splayed wing walls", "Return walls (at 90° to headwall, along the culvert axis)", "Straight headwall only (slope pitched round the ends)"];
  var CH_CON = ["RCC cantilever (IS 456)", "PCC M15 gravity", "Random rubble masonry in CM 1:6 (gravity)"];
  function chLoc(inp) { var v = String(inp.vehicle); return /^Railway/.test(v) ? "rail" : /^Mine dumper/.test(v) ? "dumper" : "road"; }
  M.chLoc = chLoc;
  function chSurcharge(c, inp, gam) {
    var k = chLoc(inp), q0 = num(inp.surcharge), qL;
    c.section("Live-load surcharge by location");
    c.let("Culvert location", "", String(inp.vehicle), "", k === "rail" ? "IRS Bridge Rules / IRS Substructure Code – railway rules only (mining profile not applied)" : k === "dumper" ? "Mine haul road" : "IRC 6:2017");
    if (k === "road") qL = c.calc("Live-load surcharge – road (1.2 m of earth)", "qLL", "1.2*g", "kN/m²", "IRC 6:2017 cl 214.1.1.3", { g: gam });
    else if (k === "rail") {
      var RL = LD().IRS[/DFC/.test(String(inp.rail_load)) ? "DFC-32.5t" : "25t-2008"], SL = LD().IRS.sleeper, z = num(inp.ballast);
      qL = c.calc("Track surcharge – railway (train intensity over sleeper length + ballast, + track dead load)", "qLL", "w*9.81/(Ls + z) + 19*(z + 0.2) + 2", "kN/m²",
        "IRS Substructure & Foundation Code cl 5.8 / Bridge Rules (verify)", RL.name, { w: RL.pipe_tpm, Ls: SL.length, z: z });
    } else {
      var Dm = X().dcDumper(inp), OL = num(inp.overload) || 1.10, Wt = Dm.gvw * 9.81 * OL, nr = Math.max(1, Dm.rear || 1), Pr = Wt * (1 - Dm.f) / nr;
      var bt = Dm.b, T = (Dm.Tr || 2.4) + (Dm.s || 0.5), l = Pr / 4 / (Dm.p * bt), st = Dm.st || 0, zz = Math.max(0.5, num(inp.setback));
      c.let("Dumper", "", Dm.name + ", rear axle " + F(Pr, ".0f") + " kN × " + nr, "kN", Dm.approx ? "geometry approximate – verify with the OEM data sheet" : "");
      c.let("Wheel set-back from the wall top (safety bund)", "a", num(inp.setback), "m", "CMR 2017 / DGMS bund practice", "load dispersed at 45° to depth z = max(0.5, a) before it reaches the wall");
      qL = c.calc("Equivalent surcharge – dumper rear axle(s) dispersed to depth z", "qLL", "nr*Pr*(1 + I)/((T + bt + 2*z)*((nr - 1)*st + l + 2*z))", "kN/m²",
        "DS.loadguide equivalent-surcharge method [GP]", { nr: nr, Pr: R(Pr, 3), I: R(LD().impact_dumper(zz), 4), T: R(T, 3), bt: bt, z: zz, st: st, l: R(l, 4) });
    }
    var q = c.calc("Design surcharge", "q", "max(qLL, q0)", "kN/m²", "", "q0 = minimum / other surcharge input", { qLL: qL, q0: q0 });
    return { kind: k, q: q, qLL: qL };
  }
  M.chSurcharge = chSurcharge;

  /* design / check one wall section of total height H (base to top). cons: "rcc" | "pcc" | "rr" */
  function chSection(c, inp, mode, H, s, cons, mat, given, tag, full) {
    var perm = permOf(cons === "pcc" ? "pcc" : "rr", "CM 1:6", num(inp.gamma_m)), cc = full ? c : new C.Calc("s"), out = { H: H, cons: cons };
    if (cons === "rcc") {
      var tst = 0.2, tb, tsb, B, toe, st, sec, g, hk = 0, useKey = /^Shear key/.test(String(inp.shear_key));
      var sR = Object.assign({}, s, { dl: 0 }), kS = function (h) { return Object.assign({}, sR, { key: h > 0 ? { hk: h, df: s.df } : null }); };
      var trialKey = function (gB, gt) {        // smallest key (0.3–1.5 m) that makes the sliding FoS – null if none
        for (var h = 0.3; h <= 1.5 + 1e-9; h = R(h + 0.05, 2)) { var r = gSection(null, cantGeo(H, gB, gt, tb, tsb, tst, s.gam, h), kS(h), { full: false }); if (r.ok) return { hk: h, sec: r }; }
        return null; };
      if (given) { B = given.B; toe = given.toe; tb = given.tb; tsb = given.tsb; hk = given.hk || 0; }
      else if (mode === "thumb") { tb = Math.max(0.3, ceil_to(H / 12, 0.05)); tsb = Math.max(0.25, ceil_to(H / 12, 0.025)); B = ceil_to(0.55 * H, 0.1); toe = ceil_to(B / 3, 0.05); }
      else {
        tb = Math.max(0.3, ceil_to(H / 12, 0.05)); tsb = Math.max(0.25, ceil_to(H / 12, 0.025)); B = Math.max(ceil_to(0.4 * H, 0.1), 1.0);
        for (var it = 0; it < 30; it++) {
          for (var k = 0; k < 400; k++) {
            toe = ceil_to(B / 3, 0.05);
            if (B - toe - tsb < 0.2) { B = R(B + 0.1, 2); continue; }
            hk = 0;
            sec = gSection(null, cantGeo(H, B, toe, tb, tsb, tst, s.gam), sR, { full: false });
            if (sec.ok || B >= 2 * H) break;
            if (useKey && sec.okx) { var tk = trialKey(B, toe); if (tk) { hk = tk.hk; sec = tk.sec; break; } }
            B = R(B + 0.1, 2);
          }
          if (!sec) sec = gSection(null, cantGeo(H, B, toe, tb, tsb, tst, s.gam, hk), kS(hk), { full: false });
          var sc = new C.Calc("s");
          cantStruct(sc, cantGeo(H, B, toe, tb, tsb, tst, s.gam, hk), sec, sR, mat, null, "");
          var fl = sc.failures.map(function (x) { return x.label; });
          if (!fl.length) break;
          var a1 = fl.some(function (f) { return /stem/.test(f); }), a2 = fl.some(function (f) { return /heel|toe/.test(f); });
          if (a1 || !a2) tsb = R(tsb + 0.025, 3);
          if (a2 || !a1) tb = R(tb + 0.05, 3);
          if (tb > H / 3) break;
        }
      }
      toe = Math.min(toe, Math.max(B - tsb - 0.1, 0));
      if (!given && mode !== "thumb" && B >= 2 * H - 1e-9) cc.warn("Base width limit reached", "No base up to 2 H = " + F(2 * H, ".2f") + " m satisfies stability / bearing – heel bearing ≈ γH + q exceeds the SBC or the surcharge is too high: improve the ground, set the traffic back, or use a counterfort / piled wall", "IRC 78 / IS 1904");
      if (mode === "thumb" && useKey) { var s0_ = gSection(null, cantGeo(H, B, toe, tb, tsb, tst, s.gam), sR, { full: false }); if (!s0_.ok && s0_.okx) { var tk2 = trialKey(B, toe); if (tk2) hk = tk2.hk; } }
      g = cantGeo(H, B, toe, tb, tsb, tst, s.gam, hk);
      cc.section("Section" + (tag ? " " + tag : ""));
      cc.let("Proportions (B / toe / heel / base / stem top–bottom)", "", F(B, ".2f") + " / " + F(toe, ".2f") + " / " + F(g.heel, ".2f") + " / " + F(tb, ".2f") + " / " + F(tst, ".2f") + "–" + F(tsb, ".3f"), "m",
        given ? "given / scaled" : mode === "thumb" ? "thumb rule B ≈ 0.55 H, toe B/3, H/12" : "designed (smallest base passing stability, then strength)");
      if (hk > 0) cc.let("Shear key below the stem", "hk", hk, "m", "IRC 78 / practice", "keyed into the foundation; stem bars continued into the key");
      sec = gSection(cc, g, kS(hk), { tag: tag, sec: "Stability" });
      st = cantStruct(cc, g, sec, sR, mat, given ? given.bars : null, tag);
      if (hk > 0) {
        var Kpk = (1 + Math.sin(s.phi * Math.PI / 180)) / (1 - Math.sin(s.phi * Math.PI / 180)), Mk = cc.calc("Shear key moment at root (factored, full passive)", "Mu,k",
          "1.5*0.5*Kp*g*hk**2*(d + hk/3)", "kN·m/m", "IS 456 cl 18.2", { Kp: R(Kpk, 4), g: s.gam, hk: hk, d: s.df });
        var dk = tsb * 1000 - mat.cover - st.stem.dia / 2, Ak = 1000 * area(st.stem.dia) / st.stem.spacing, Akr = Mk * 1e6 / (0.87 * mat.fy * 0.9 * dk);
        cc.check("Shear key steel (stem bars continued) ≥ required", Ak, Akr, { unit: "mm²/m", mode: ">=", clause: "IS 456 Annex G (lever arm 0.9 d)" });
      }
      Object.assign(out, { B: B, toe: toe, tb: tb, tsb: tsb, tst: tst, heel: g.heel, sec: sec, st: st, g: g, hk: hk });
    } else {
      var bt = num(inp.top_w), nf = num(inp.front_batter), Bg, sg;
      var minB = bt + nf * H;
      if (given) Bg = Math.max(given.B, bt + nf * H - 0.3 * H);
      else if (mode === "thumb") Bg = Math.max(ceil_to(0.5 * H, 0.05), minB);
      else {
        Bg = Math.max(minB, ceil_to(0.3 * H, 0.05));
        for (var i2 = 0; i2 < 400; i2++) {
          var gg = gravGeo(H, Bg, bt, nf, perm.gm), s1 = gSection(null, gg, s, { full: false }), j1 = gJoints(null, gg, s, perm, { full: false });
          if ((s1.ok && j1.ok) || Bg >= 2 * H) break;
          Bg = R(Bg + 0.05, 3);
        }
      }
      var gg2 = gravGeo(H, Bg, bt, nf, perm.gm);
      cc.section("Section" + (tag ? " " + tag : ""));
      if (gg2.bt > bt + 1e-9) { cc.info("Top width widened", "Back batter limited to " + F(BB_MAX, ".2f") + " (1H:2V); top width increased " + F(bt, ".2f") + " → " + F(gg2.bt, ".2f") + " m", "Coulomb validity / practice"); bt = gg2.bt; }
      cc.let("Proportions (base / top width, front / back batter)", "", F(Bg, ".2f") + " / " + F(bt, ".2f") + " m, " + F(nf, ".3f") + " / " + F(gg2.b, ".3f") + " (H:V)", "",
        given ? "given / scaled" : mode === "thumb" ? "thumb rule B ≈ 0.5 H" : "designed (smallest base passing stability & joint stresses)");
      sg = gSection(cc, gg2, s, { tag: tag, sec: "Stability" });
      var jj = gJoints(cc, gg2, s, perm, { tag: tag });
      Object.assign(out, { B: Bg, bt: bt, nf: nf, b: gg2.b, sec: sg, joints: jj, g: gg2, perm: perm });
    }
    return out;
  }

  function run_culvert_headwall(inp, mode) {
    // a railway culvert follows railway rules only: the mining-area detailing context is switched off while it is designed
    var ctx0 = C.ctx;
    if (chLoc(inp) === "rail" && ctx0 && ctx0.site === "mine") C.ctx = Object.assign({}, ctx0, { site: "general" });
    try { return chRun(inp, mode); } finally { C.ctx = ctx0; }
  }
  function chRun(inp, mode) {
    var c = new C.Calc("Culvert headwall & wing / return walls");
    var cons = /^RCC/.test(String(inp.construction)) ? "rcc" : /^PCC/.test(String(inp.construction)) ? "pcc" : "rr";
    var pipe = /^Hume/.test(String(inp.culvert)), lay = String(inp.layout), splay = /^Splayed/.test(lay), ret = /^Return/.test(lay), straight = !splay && !ret;
    var gam = num(inp.gamma), phi = num(inp.phi), mu = num(inp.mu), sbc = num(inp.sbc), df = num(inp.df), sl = num(inp.slope);
    var fck = num(inp.fck), fy = num(inp.fy), cover = cons === "rcc" ? coverAdopt(c, inp, mode) : num(inp.cover), mat = { fck: fck, fy: fy, cover: cover };
    if (cons === "rcc" && DT()) DT().site_checks(c, "retaining", fck, cover);
    // ---------------------------------------------------------------- geometry
    c.section("Culvert & embankment geometry");
    var nc = Math.max(1, Math.trunc(num(inp.cells))), S = num(inp.span), Hc = pipe ? S : num(inp.open_h), t = num(inp.t_box), fill = num(inp.fill);
    var Wo = pipe ? c.calc("Overall width of pipes (outside)", "Wo", "n*(D + 2*t) + (n - 1)*max(D/2, 0.45)", "m", "IRC SP-13 (clear gap ≥ D/2, 450 mm – verify)", { n: nc, D: S, t: t })
      : c.calc("Overall width of box", "Wo", "n*S + (n + 1)*t", "m", "", { n: nc, S: S, t: t });
    var Hm = c.calc("Embankment height at the culvert face (bed to formation)", "Hm", "Hc + t + f", "m", "", pipe ? "pipe dia + wall + cushion" : "clear height + top slab + cushion", { Hc: Hc, t: t, f: fill });
    var th = splay ? clamp(num(inp.splay), 15, 75) : 0, he = clamp(num(inp.h_end), 0.3, Math.max(Hm - 0.3, 0.3));
    var Lw = straight ? c.calc("Headwall extension beyond the culvert, each side (full height)", "Le", "max(0.6, 0.3*Hm)", "m", "practice – slope pitched round the ends", { Hm: Hm })
      : c.calc((ret ? "Return" : "Wing") + " wall length (top follows the 1:" + G(sl) + " slope down to h_end)", "Lw", "(Hm - he)*s/cos(radians(th))", "m",
        "IRC SP-13 practice – wing end height ≈ 0.6 m above bed", "θ = " + G(th) + "° to the culvert axis", { Hm: Hm, he: he, s: sl, th: th });
    c.let("Foundation depth below bed", "df", df, "m", "IRC SP-13 / IRC 78 cl 705 (≥ 1.0–1.5 m or below scour)");
    var nseg = straight ? 1 : Lw <= 2 ? 1 : Lw <= 4.5 ? 2 : Lw <= 8 ? 3 : 4;
    var segs = [];
    for (var k = 0; k < nseg; k++) {
      var x0 = Lw * k / nseg, x1 = Lw * (k + 1) / nseg, h0 = straight ? Hm : Hm - x0 * Math.cos(th * Math.PI / 180) / sl, h1 = straight ? Hm : Hm - x1 * Math.cos(th * Math.PI / 180) / sl;
      segs.push({ k: k, x0: x0, x1: x1, L: x1 - x0, hhi: h0, hlo: h1, H: R(h0 + df, 3) });
    }
    // ---------------------------------------------------------------- loads & soil
    var sur = chSurcharge(c, inp, gam), rail = sur.kind === "rail", mineEnv = isMine() && !rail;
    var drained = String(inp.drainage).indexOf("Weep") === 0, hfl = num(inp.hfl);
    var s = { gam: gam, phi: phi, dl: num(inp.delta), be: 0, q: sur.q, mu: mu, sbc: sbc, hw: drained ? 0 : df + hfl, seis: null, fot: 2.0, fsl: 1.5, df: df,
      cl: rail ? "IRS Substructure & Foundation Code cl 5.10 (FoS 2.0 / 1.5 – verify)" : "IRC 78 cl 706.3.4 (FoS 2.0 / 1.5)" };
    c.section("Soil & stability criteria");
    c.let("Backfill", "γ / φ / μ", G(gam) + " kN/m³ / " + G(phi) + "° / " + G(mu), "", "IRC 78 App. 6 – granular backfill behind wing walls", mineEnv ? "mining profile applied (site)" : "");
    c.let("Criteria", "", "Overturning FoS ≥ 2.0, sliding FoS ≥ 1.5, pmax ≤ SBC " + G(sbc) + " kN/m², no tension (e ≤ B/6)", "", s.cl);
    if (!drained) c.warn("No drainage", "Water up to HFL + df behind the wall with uplift – weep holes + filter normally save 20–40 % material", "IRC 78");
    // ---------------------------------------------------------------- wall sections
    var gv = null;
    if (mode === "check") gv = cons === "rcc" ? { B: num(inp.B_chk), toe: num(inp.toe_chk), tb: num(inp.tb_chk), tsb: num(inp.ts_chk), hk: num(inp.key_chk),
      bars: { stem: [num(inp.stem_dia), num(inp.stem_s)], base: [num(inp.base_dia), num(inp.base_s)], dist: [Math.min(num(inp.base_dia), 12), 200] } } : { B: num(inp.gB_chk) };
    var Hmax = segs[0].H;
    var secs = segs.map(function (sg, i) {
      var tag = (straight ? "headwall ends" : (ret ? "return" : "wing") + " seg " + (i + 1)) + ", H = " + F(sg.H, ".2f") + " m";
      var gi = null;
      if (gv) {
        var f = (1 + sg.H / Hmax) / 2;   // surcharge thrust is ∝ H, earth ∝ H² – base scaled by (1 + H/Hmax)/2
        gi = cons === "rcc" ? { B: R(Math.max(gv.B * f, 0.8), 3), toe: R(Math.max(gv.toe * f, 0.15), 3), tb: gv.tb, tsb: gv.tsb, hk: gv.hk, bars: gv.bars } : { B: R(gv.B * f, 3) };
      }
      if (i === 0) { c.section("Max. height section (" + tag + ")"); return Object.assign(chSection(c, inp, mode, sg.H, s, cons, mat, gi, "", true), { seg: sg, tag: tag }); }
      var sc = new C.Calc("s"), r = chSection(sc, inp, mode, sg.H, s, cons, mat, gi, "", true);
      c.section("Intermediate section (" + tag + ")");
      var pr = cons === "rcc" ? "B " + F(r.B, ".2f") + ", toe " + F(r.toe, ".2f") + ", base " + F(r.tb, ".2f") + ", stem " + F(r.tsb, ".3f") + " m" + (r.hk ? ", key " + F(r.hk, ".2f") + " m" : "") + "; stem " + G(r.st.stem.dia) + "Ø@" + G(r.st.stem.spacing) +
        ", heel " + G(r.st.heel.dia) + "Ø@" + G(r.st.heel.spacing) + ", toe " + G(r.st.toe.dia) + "Ø@" + G(r.st.toe.spacing) : "B " + F(r.B, ".2f") + " m, top " + F(r.bt, ".2f") + " m";
      c.let("Section adopted", "", pr, "", gi ? "scaled from the max. section: B × (1 + H/Hmax)/2 (check mode)" : "designed for the higher end of the segment (stepped foundation)");
      c.let("Key results", "", "FoS OT " + F(r.sec.fot, ".2f") + ", FoS SL " + F(r.sec.fsl, ".2f") + ", pmax " + F(r.sec.pmax, ".0f") + " kN/m², |e| " + F(r.sec.emax, ".3f") + " m", "");
      sc.steps.filter(function (x) { return x.status === "FAIL" || x.status === "WARN" || /FoS ≥|base pressure ≤|No tension under/.test(x.label); }).forEach(function (x) {
        x.section = "Intermediate section (" + tag + ")"; if (x.label.indexOf("seg") < 0) x.label += " – " + tag; c.steps.push(x); });
      return Object.assign(r, { seg: sg, tag: tag });
    });
    // headwall
    c.section("Headwall");
    var hw0 = null, Lh;
    if (pipe) {
      Lh = c.calc("Headwall length (pipe culvert, full height)", "Lh", "Wo + 2*0.45", "m", "", { Wo: Wo });
      c.info("Pipe headwall", "Full-height wall of the same section as the max. wing section (H = " + F(Hmax, ".2f") + " m); pipe openings deducted in quantities", "IRC SP-13");
    } else {
      Lh = c.calc("Headwall length over the box", "Lh", "Wo", "m", "", { Wo: Wo });
      var hp = c.calc("Headwall (parapet) height above the top slab", "hp", "max(f, 0.3)", "m", "retains the cushion; top at formation level (min. 300 mm kerb)", { f: fill });
      var Ka0 = (1 - Math.sin(phi * Math.PI / 180)) / (1 + Math.sin(phi * Math.PI / 180)), gmh = permOf(cons, "CM 1:6", num(inp.gamma_m)).gm, tp0 = Math.max(num(inp.top_w), ceil_to(0.5 * hp, 0.05));
      if (cons !== "rcc") for (var ti = 0; ti < 200; ti++) {
        var Wt0 = gmh * tp0 * hp, P0 = Ka0 * gam * hp * hp / 2 + Ka0 * sur.q * hp, M0 = Ka0 * gam * Math.pow(hp, 3) / 6 + Ka0 * sur.q * hp * hp / 2;
        if ((Wt0 * tp0 / 2 >= 2 * M0 && 0.6 * Wt0 >= 1.5 * P0) || tp0 >= 3 * hp + 1) break;
        tp0 = R(tp0 + 0.05, 3);
      }
      var tp = c.let("Headwall thickness", "tp", cons === "rcc" ? Math.max(0.2, ceil_to(hp / 10, 0.025)) : tp0, "m", "", cons === "rcc" ? "≥ 200 mm" : "smallest width with FoS 2.0 / 1.5 on the top slab");
      var Kar = c.calc("Rankine Ka (headwall)", "Ka", "(1 - sin(radians(ph)))/(1 + sin(radians(ph)))", "", "Rankine", { ph: phi });
      if (cons === "rcc") {
        var Mh = c.calc("Headwall moment at the top-slab junction (factored)", "Mu", "1.5*(Ka*g*h**3/6 + Ka*q*h**2/2)", "kN·m/m", "IS 456 cl 18.2", { Ka: Kar, g: gam, h: hp, q: sur.q });
        var hwb = X().designStrip(c, Math.max(Mh, 0.01), tp * 1000, cover, fck, fy, "headwall, earth face", { given: gv ? gv.bars.stem : null, rule: DT() ? { member: "retaining", role: "main" } : null,
          Vu: 1.5 * (Kar * gam * hp * hp / 2 + Kar * sur.q * hp), dias: [10, 12, 16, 20] });
        hw0 = { hp: hp, tp: tp, bars: hwb };
      } else {
        var Pk = Kar * gam * hp * hp / 2 + Kar * sur.q * hp, Mk = Kar * gam * Math.pow(hp, 3) / 6 + Kar * sur.q * hp * hp / 2, Wk = permOf(cons, "CM 1:6", num(inp.gamma_m)).gm * tp * hp;
        var fo = c.calc("Headwall on top slab – FoS overturning", "FoS", "W*t/2/max(M, 1e-6)", "", "IRC 78 cl 706.3.4", { W: R(Wk, 3), t: tp, M: R(Mk, 4) });
        c.check("Headwall overturning FoS ≥ 2.0", fo, 2.0, { mode: ">=", clause: "IRC 78 cl 706.3.4" });
        var fs2 = c.calc("Headwall on top slab – FoS sliding (μ = 0.6 masonry on concrete)", "FoS", "0.6*W/max(P, 1e-6)", "", "IRC 78 cl 706.3.4", { W: R(Wk, 3), P: R(Pk, 4) });
        c.check("Headwall sliding FoS ≥ 1.5", fs2, 1.5, { mode: ">=", clause: "IRC 78 cl 706.3.4", note: "dowel the headwall into the top slab (12Ø @ 300) if short" });
        hw0 = { hp: hp, tp: tp };
      }
      c.miss("Box culvert barrel (top / bottom slab, walls) – design in the box-culvert module; headwall bars to lap with the top-slab bars", "IRC SP-13 / IRC 112", "Important");
    }
    // ---------------------------------------------------------------- drainage
    c.section("Drainage – weep holes & filter");
    var w = null;
    if (drained) {
      var Lwet = (straight ? 2 * Lw : 2 * Lw) * 2 + (pipe ? 2 * Lh : 0);
      w = weeps(c, inp, straight ? Hm : (Hm + he) / 2, Lwet / 2, 0.5, "all walls, per culvert end (2 ends)");
      w.n *= 2; weepChecks(c, w);
    }
    // ---------------------------------------------------------------- apron, curtain walls, flexible apron (IRC SP-13)
    c.section("Floor protection – apron & curtain walls (IRC SP-13)");
    var Qd = num(inp.discharge), ksf = num(inp.ksf), Wc = nc * S;
    var Db = c.calc("Discharge per metre of waterway", "Db", "Q/Wc", "m³/s/m", "", { Q: Qd, Wc: Wc });
    var dsm = c.calc("Normal scour depth (Lacey)", "dsm", "1.34*(Db**2/ksf)**(1/3)", "m", "IRC 78 cl 703.2 / IRC SP-13", { Db: Db, ksf: ksf });
    var du = c.calc("Upstream curtain wall depth below floor", "du", "max(1.0, ceil((1.27*dsm - y)*10)/10)", "m", "IRC SP-13 cl 14 (1.27 dsm below HFL; ≥ 1.0 m – verify)", { dsm: dsm, y: hfl });
    var dd = c.calc("Downstream curtain wall depth below floor", "dd", "max(1.5, ceil((1.5*dsm - y)*10)/10)", "m", "IRC SP-13 cl 14 (1.5 dsm below HFL; ≥ 1.5 m – verify)", { dsm: dsm, y: hfl });
    var lu = c.calc("Flexible apron length upstream", "Lu", "max(3.0, 1.5*du)", "m", "IRC SP-13 / IRC 89 practice (verify)", { du: du });
    var ld = c.calc("Flexible apron length downstream", "Ld", "max(5.0, 2*dd)", "m", "IRC SP-13 / IRC 89 practice (verify)", { dd: dd });
    var fl = num(inp.floor_t);
    c.ok("Rigid floor ≥ 300 mm (PCC M15 over 150 mm rubble packing)", fl >= 0.3 - 1e-9, { detail: G(fl * 1000) + " mm", clause: "IRC SP-13 practice", warn_only: true });
    c.ok("Foundation below curtain-wall level or scour", df >= Math.min(du, dd) - 1e-9, { detail: "df " + F(df, ".2f") + " m vs curtain " + F(Math.min(du, dd), ".2f") + " m", clause: "IRC 78 cl 705.2 practice", warn_only: true });
    // ---------------------------------------------------------------- thumbs & missing
    var s0 = secs[0];
    c.thumb("Base width at max. section", (cons === "rcc" ? 0.55 : 0.5) * s0.H, s0.B, "m", cons === "rcc" ? "0.5–0.6 H (cantilever)" : "0.4–0.5 H (gravity)", "IRC SP-13 / Punmia");
    if (cons === "rcc") c.thumb("Stem thickness at base", s0.H / 12 * 1000, s0.tsb * 1000, "mm", "H / 12", "Punmia");
    else c.thumb("Top width of gravity wing", 450, num(inp.top_w) * 1000, "mm", "≥ 450–600 mm", "IRC SP-13 / MORT&H type designs");
    c.miss("Hydraulic design: HFL, design discharge & afflux (IRC SP-13 cl 4–7); bed level and LWL from survey", "IRC SP-13", "Important");
    c.miss("Seismic earth pressure on wing walls (IS 1893-3) for zone III and above; Korba zone II – usually not critical", "IS 1893-3", "Advisory");
    if (sur.kind === "dumper") c.miss("Keep dumper wheels ≥ 1.5 m from the wall top with a safety bund ≥ ½ wheel height; crash barrier / guard stones on the culvert", "CMR 2017 / DGMS", "Critical");
    if (rail) c.miss("Railway culvert wings / headwalls: drawings approved by the zonal railway / RDSO; RDSO standard drawings preferred; IRS CBC for RCC", "IRS Bridge Rules / IRS CBC", "Critical");
    if (mineEnv) c.miss("Mine water: test for sulphates / pH; SRC / slag cement and bitumen coating on earth faces where aggressive", "IS 456 Table 4", "Important");
    // ---------------------------------------------------------------- BBS (RCC), quantities
    var nW = 4, B_ = BB(), bbs = [], qty = [];
    var segRows = secs.map(function (r) { return { r: r, L: r.seg.L, hm: (r.seg.hhi + r.seg.hlo) / 2 + df }; });
    if (cons === "rcc") {
      segRows.forEach(function (sr, i) {
        var r = sr.r, st = r.st, Ls = sr.L * 1000, mem = (straight ? "End wall" : ret ? "Return wall" : "Wing") + " seg " + (i + 1) + " (×" + nW + ")", cv = cover;
        var sd = st.stem.dia, legS = Math.max(B_.Ld(sd, fck, fy) - (r.tb * 1000 - 2 * cv), B_.leg(sd));
        var nS = B_.count(Ls, st.stem.spacing, 50) * nW;
        bbs.push(B_.row(mem, "S" + (i + 1), sd, "L-bar into base", nS, B_.stock(B_.lbar(sd, r.H * 1000 - 2 * cv, legS), sd, fck, fy), "stem earth face @ " + G(st.stem.spacing)));
        bbs.push(B_.row(mem, "F" + (i + 1), st.dist.dia, "L-bar into toe", B_.count(Ls, st.dist.spacing, 50) * nW, B_.stock(B_.lbar(st.dist.dia, r.H * 1000 - 2 * cv, B_.leg(st.dist.dia, B_.cfg.wall_leg_min)), st.dist.dia, fck, fy), "front face verticals (nominal)"));
        bbs.push(B_.row(mem, "H" + (i + 1), st.heel.dia, "straight", B_.count(Ls, st.heel.spacing, 50) * nW, B_.stock(B_.straight(st.heel.dia, r.B * 1000 - 2 * cv), st.heel.dia, fck, fy), "base top (heel)"));
        bbs.push(B_.row(mem, "T" + (i + 1), st.toe.dia, "straight", B_.count(Ls, st.toe.spacing, 50) * nW, B_.stock(B_.straight(st.toe.dia, r.B * 1000 - 2 * cv), st.toe.dia, fck, fy), "base bottom (toe)"));
        if (r.hk > 0) {
          var kLd = B_.Ld(sd, fck, fy), kb = B_.ubar(sd, r.tsb * 1000 - 2 * cv, r.hk * 1000 - cv + kLd);
          bbs.push(B_.row(mem, "K" + (i + 1), sd, "U (around key, legs into base)", B_.count(Ls, st.stem.spacing, 50) * nW, kb, "shear key, both faces @ " + G(st.stem.spacing)));
        }
        bbs.push(B_.row(mem, "D" + (i + 1), st.dist.dia, "straight", (2 * B_.count((r.H - r.tb) * 1000, st.dist.spacing, 50) + 2 * B_.count(r.B * 1000, st.dist.spacing, 50)) * nW,
          B_.split(st.dist.dia, Ls - 2 * cv + 2 * B_.lap(st.dist.dia, fck, fy) / 2, fck, fy), "distribution, stem both faces + base top & bottom (lapped into next segment)"));
      });
      if (hw0 && hw0.bars) {
        var hb = hw0.bars, hl = Lh * 1000, Ldh = B_.Ld(hb.dia, fck, fy);
        bbs.push(B_.row("Headwall (×2)", "HW1", hb.dia, "L-bar into top slab", 2 * B_.count(hl, hb.spacing, 50) * 2, B_.lbar(hb.dia, hw0.hp * 1000 - cover + Ldh, B_.leg(hb.dia)), "both faces, legs anchored Ld into the top slab"));
        bbs.push(B_.row("Headwall (×2)", "HW2", 10, "straight", 2 * 2 * B_.count(hw0.hp * 1000, 200, 50), B_.split(10, hl - 2 * cover, fck, fy), "horizontal both faces 10Ø @ 200"));
      }
    }
    var exc = [], pcc = [], body = [], bodyBelow = [], sh = [], shf = [], fil = [], back = [];
    segRows.forEach(function (sr, i) {
      var r = sr.r, Lsg = sr.L, lab = (straight ? "End walls" : ret ? "Return walls" : "Wings") + " seg " + (i + 1);
      exc.push(row(lab, nW, Lsg, r.B + 0.6, df + 0.1));
      pcc.push(row(lab, nW, Lsg, r.B + 0.2, 0.1));
      if (cons === "rcc") {
        body.push(row(lab + " – base", nW, Lsg, r.B, r.tb)); body.push(row(lab + " – stem (avg.)", nW, Lsg, (r.tst + r.tsb) / 2, sr.hm - r.tb));
        if (r.hk > 0) { body.push(row(lab + " – shear key", nW, Lsg, r.tsb, r.hk)); exc.push(row(lab + " – shear key trench", nW, Lsg, r.tsb + 0.3, r.hk)); }
        sh.push(row(lab + " – stem faces", 2 * nW, Lsg, null, sr.hm - r.tb)); shf.push(row(lab + " – base edges", 2 * nW, Lsg, null, r.tb));
        back.push(row(lab + " – over heel", nW, Lsg, r.heel + 0.3, sr.hm - r.tb));
      } else {
        var Aav = (r.B + r.bt) / 2;
        bodyBelow.push(row(lab + " – below bed (avg. width)", nW, Lsg, (r.B + (r.B - (r.nf + r.b) * df)) / 2, df));
        body.push(row(lab + " – above bed (avg. width)", nW, Lsg, (r.B - (r.nf + r.b) * df + r.bt) / 2, Math.max(sr.hm - df, 0)));
        if (cons === "pcc") sh.push(row(lab + " – faces", 2 * nW, Lsg, null, sr.hm));
        back.push(row(lab + " – wedge + working space", nW, Lsg, Math.max(r.b, 0) * sr.hm / 2 + 0.3, sr.hm));
        void Aav;
      }
      if (drained) fil.push(row(lab, nW, Lsg, num(inp.filter_t) / 1000, sr.hm - df));
    });
    if (pipe) {
      var r0 = secs[0], ar = nc * Math.PI * Math.pow(S + 2 * t, 2) / 4;
      exc.push(row("Headwalls", 2, Lh, r0.B + 0.6, df + 0.1)); pcc.push(row("Headwalls", 2, Lh, r0.B + 0.2, 0.1));
      if (cons === "rcc") { body.push(row("Headwalls – base", 2, Lh, r0.B, r0.tb)); body.push(row("Headwalls – stem", 2, Lh, (r0.tst + r0.tsb) / 2, Hmax - r0.tb)); body.push(row("Pipe openings", -2, ar / Math.max(Hmax - r0.tb, 0.1), (r0.tst + r0.tsb) / 2, Hmax - r0.tb));
        sh.push(row("Headwalls – faces", 4, Lh, null, Hmax - r0.tb)); sh.push(row("Pipe openings", -4, ar / Math.max(Hmax - r0.tb, 0.1), null, Hmax - r0.tb)); }
      else { body.push(row("Headwalls (avg. width)", 2, Lh, (r0.B + r0.bt) / 2, Hmax)); body.push(row("Pipe openings", -2, ar / Math.max(Hmax, 0.1), (r0.B + r0.bt) / 2, Hmax)); }
      if (cons === "rcc") {
        var st0 = r0.st, Lhm = Lh * 1000, legH = Math.max(B_.Ld(st0.stem.dia, fck, fy) - (r0.tb * 1000 - 2 * cover), B_.leg(st0.stem.dia));
        bbs.push(B_.row("Headwall (×2)", "HS", st0.stem.dia, "L-bar into base", 2 * B_.count(Lhm, st0.stem.spacing, 50), B_.stock(B_.lbar(st0.stem.dia, Hmax * 1000 - 2 * cover, legH), st0.stem.dia, fck, fy), "earth face; bars at pipe openings cut & trimmed with 2 extra bars each side"));
        bbs.push(B_.row("Headwall (×2)", "HB", st0.heel.dia, "straight", 2 * B_.count(Lhm, st0.heel.spacing, 50), B_.stock(B_.straight(st0.heel.dia, r0.B * 1000 - 2 * cover), st0.heel.dia, fck, fy), "base top"));
        bbs.push(B_.row("Headwall (×2)", "HT", st0.toe.dia, "straight", 2 * B_.count(Lhm, st0.toe.spacing, 50), B_.stock(B_.straight(st0.toe.dia, r0.B * 1000 - 2 * cover), st0.toe.dia, fck, fy), "base bottom"));
        bbs.push(B_.row("Headwall (×2)", "HD", st0.dist.dia, "straight", 2 * (2 * B_.count(Hmax * 1000, st0.dist.spacing, 50) + 2 * B_.count(r0.B * 1000, st0.dist.spacing, 50)), B_.split(st0.dist.dia, Lhm - 2 * cover, fck, fy), "distribution both faces + base"));
      }
    } else if (hw0) {
      body.push(row("Headwalls on top slab", 2, Lh, hw0.tp, hw0.hp));
      if (cons !== "rr") sh.push(row("Headwalls – faces", 4, Lh, null, hw0.hp));
    }
    var floorL = (straight ? 1.0 : Lw * Math.cos(th * Math.PI / 180)), floorW = straight ? Wo : Wo + Lw * Math.sin(th * Math.PI / 180);
    qty.push(Q("Earth work in excavation for foundations of headwalls / wing walls & curtain walls, all kinds of soil", "cum", exc.concat([row("Curtain walls u/s + d/s", 1, floorW + 1.0, 0.9, (du + dd))]), [CPWD, "2.8.1"]));
    qty.push(Q("PCC 1:4:8 levelling course below foundations", "cum", pcc, [CPWD, "4.1.8"]));
    if (cons === "rcc") {
      qty.push(Q("RCC M" + G(fck) + " in culvert headwall & wing walls (retaining type) incl. bases (excl. steel & shuttering)", "cum", body, null, CM().rcc_rate(fck)));
      qty.push(Q("Centering & shuttering for walls – headwall / wing-wall stems", "sqm", sh, null, CM().RATE.shutter_wall));
      qty.push(Q("Centering & shuttering for foundations – wing-wall bases", "sqm", shf, null, CM().RATE.shutter_found));
      qty.push(steelQty(bbs, "Culvert walls"));
    } else if (cons === "pcc") {
      qty.push(Q("PCC M15 in culvert headwall & wing walls (gravity)", "cum", bodyBelow.concat(body), [MPPWD, "12.3"]));
      qty.push(Q("Centering & shuttering for walls – PCC wing-wall faces", "sqm", sh, null, CM().RATE.shutter_wall));
    } else {
      qty.push(Q("Random rubble masonry with hard stone in foundation (wing walls below bed) in CM 1:6", "cum", bodyBelow.length ? bodyBelow : [row("—", 0)], [CPWD, "7.1.1"]));
      qty.push(Q("Random rubble masonry with hard stone in wing walls / headwalls above bed in CM 1:6", "cum", body, [CPWD, "7.2.1"]));
    }
    if (drained) {
      qty.push(Q("Filter media (graded) behind wing walls / headwalls, " + G(num(inp.filter_t)) + " mm", "cum", fil, [MPPWD, "13.11"]));
      qty.push(Q("Weep holes with " + G(w.dia) + " mm PVC pipe through the wall, sloping 1V:20H", "metre", [row(w.n + " weep holes × avg. wall thickness", w.n, cons === "rcc" ? secs[0].tsb : (secs[0].B + secs[0].bt) / 2)], [MPPWD, "13.9"]));
    }
    qty.push(Q("Backfilling with granular material behind headwall / wing walls, compacted (IRC 78 App. 6)", "cum", back, [MPPWD, "13.10.A"]));
    qty.push(Q("PCC M15 in rigid floor (apron) between curtain walls, " + G(fl * 1000) + " mm", "cum", [row("Floor u/s + d/s of barrel", 2, floorL, (Wo + floorW) / 2, fl)], [MPPWD, "12.3"]));
    qty.push(Q("PCC M15 in curtain (cut-off) walls 0.4 m thick", "cum", [row("Upstream curtain wall", 1, floorW + 0.8, 0.4, du), row("Downstream curtain wall", 1, floorW + 0.8, 0.4, dd)], [MPPWD, "12.3"]));
    qty.push(Q("Boulder apron (flexible) laid dry beyond curtain walls, stones ≥ 40 kg, 600 mm thick", "cum", [row("Upstream", 1, lu, floorW + 2.0, 0.6), row("Downstream", 1, ld, floorW + 2.0, 0.6)], [MPPWD, "15.1.A"]));
    // ---------------------------------------------------------------- drawing
    var sheet = chDrawing(inp, { secs: secs, Wo: Wo, Hm: Hm, Lw: Lw, th: th, straight: straight, ret: ret, pipe: pipe, df: df, he: he, sl: sl, cons: cons, du: du, dd: dd, lu: lu, ld: ld,
      fl: fl, floorL: floorL, w: w, hw0: hw0, cover: cover, sur: sur, Lh: Lh });
    var steelKg = C.sum(bbs.map(function (b) { return b.weight; }));
    var s0b = secs[0];
    var summary = { "Walls": (straight ? "Straight headwall" : ret ? "Return walls" : "Splayed wings " + G(th) + "°") + ", " + (cons === "rcc" ? "RCC cantilever" : cons === "pcc" ? "PCC M15 gravity" : "RR masonry CM 1:6 gravity") +
        (straight ? ", end walls " : ", length ") + F(Lw, ".2f") + " m × 4",
      "Max. section": "H " + F(s0b.H, ".2f") + " m (incl. " + F(df, ".2f") + " m below bed): B " + F(s0b.B, ".2f") + " m" + (cons === "rcc" ? ", toe " + F(s0b.toe, ".2f") + ", base " + F(s0b.tb, ".2f") + ", stem " + F(s0b.tst, ".2f") + "–" + F(s0b.tsb, ".3f") : ", top " + F(s0b.bt, ".2f")),
      "Stability (max. section)": "FoS OT " + F(s0b.sec.fot, ".2f") + ", SL " + F(s0b.sec.fsl, ".2f") + ", pmax " + F(s0b.sec.pmax, ".0f") + " kN/m²",
      "Surcharge": F(sur.q, ".1f") + " kN/m² (" + (sur.kind === "rail" ? "railway" : sur.kind === "dumper" ? "mine haul road" : "road IRC") + ")",
      "Sections": secs.map(function (r) { return "H " + F(r.H, ".2f") + " → B " + F(r.B, ".2f"); }).join("; "),
      "Floor protection": "curtain walls " + F(du, ".1f") + " / " + F(dd, ".1f") + " m, boulder apron " + F(lu, ".1f") + " / " + F(ld, ".1f") + " m",
      "Max utilisation": F(c.max_utilisation, ".2f") };
    if (cons === "rcc") { summary["Stem bars (max. section)"] = G(s0b.st.stem.dia) + "Ø @ " + G(s0b.st.stem.spacing) + " c/c"; summary["Steel"] = F(steelKg, ".0f") + " kg"; }
    if (w) summary["Weep holes"] = w.n + " nos " + G(w.dia) + " mm";
    var refs = ["IRC SP-13:2022 – Guidelines for the design of small bridges and culverts", "IRC 78:2014 – Foundations & substructure (cl 706 stability)",
      "IRC 6:2017 – Loads (cl 214 earth pressure, live-load surcharge)", "IS 456:2000 – Plain & reinforced concrete", "IS 1905:1987 – Structural use of masonry",
      "IRS Bridge Rules / IRS Substructure & Foundation Code (railway location)"];
    return C.DesignResult({ module: "culvert_headwall", title: "Culvert headwall & wing / return walls", inputs: inp, calc: c, summary: summary, drawings: [sheet],
      quantities: qty, bbs: bbs, tables: { "Wall sections (designed per segment)": C.table(secs.map(function (r) {
        return [r.tag, R(r.seg.x0, 2), R(r.seg.x1, 2), R(r.H, 3), R(r.B, 3), cons === "rcc" ? R(r.tsb, 3) : R(r.bt, 3), R(r.sec.fot, 2), R(r.sec.fsl, 2), R(r.sec.pmax, 1)]; }),
        ["Section", "from m", "to m", "H m", "B m", cons === "rcc" ? "stem m" : "top m", "FoS OT", "FoS SL", "pmax kN/m²"]) }, references: refs });
  }
  M.run_culvert_headwall = run_culvert_headwall;

  /* section of a wall (RCC cantilever or gravity trapezoid) drawn into view v with toe at (x0, y0) */
  function drawWallSection(v, r, cons, cover, x0, y0) {
    var Bm = r.B * 1000, Hm = r.H * 1000;
    if (cons === "rcc") {
      var tb = r.tb * 1000, toe = r.toe * 1000, tsb = r.tsb * 1000, tst = r.tst * 1000, Hs = Hm - tb;
      v.poly([[x0, y0], [x0 + Bm, y0], [x0 + Bm, y0 + tb], [x0 + toe + tsb, y0 + tb], [x0 + toe + tsb, y0 + Hm], [x0 + toe + tsb - tst, y0 + Hm], [x0 + toe, y0 + tb], [x0, y0 + tb]], true, "OUTLINE", "concrete");
      v.poly([[x0 + toe + tsb - cover, y0 + Hm - cover], [x0 + toe + tsb - cover, y0 + cover + 20], [x0 + Bm - cover, y0 + cover + 20]], false, "REBAR");
      v.line(x0 + cover, y0 + cover, x0 + Bm - cover, y0 + cover, "REBAR");
      v.line(x0 + toe + tsb, y0 + tb - cover, x0 + Bm - cover, y0 + tb - cover, "REBAR");
      if (r.hk > 0) { v.rect(x0 + toe, y0 - r.hk * 1000, tsb, r.hk * 1000, "OUTLINE", "concrete"); v.text(x0 + toe - 80, y0 - r.hk * 500, "Shear key " + F(r.hk * 1000, ",.0f"), 2.0, { anchor: "end" }); }
      v.dim(x0, y0, x0 + Bm, y0, 10 + (r.hk > 0 ? r.hk * 1000 / 25 : 0)); v.dim(x0 + Bm, y0, x0 + Bm, y0 + Hm, -10); v.dim(x0, y0 + tb, x0 + toe, y0 + tb, -6);
      v.text(x0 + Bm + 250, y0 + Hm * 0.55, "Stem " + G(r.st.stem.dia) + "Ø@" + G(r.st.stem.spacing) + " (earth face)", 2.2);
      v.text(x0 + Bm + 250, y0 + Hm * 0.45, "Heel " + G(r.st.heel.dia) + "Ø@" + G(r.st.heel.spacing) + " top, toe " + G(r.st.toe.dia) + "Ø@" + G(r.st.toe.spacing) + " bottom", 2.2);
      v.text(x0 + Bm + 250, y0 + Hm * 0.35, "Dist. " + G(r.st.dist.dia) + "Ø@" + G(r.st.dist.spacing) + " each face", 2.2);
      void Hs;
    } else {
      var g = r.g;
      v.poly(g.pts.map(function (p) { return [x0 + p[0] * 1000, y0 + p[1] * 1000]; }), true, "OUTLINE", "concrete");
      v.dim(x0, y0, x0 + Bm, y0, 10); v.dim(x0 + Math.max(Bm, g.xb1 * 1000), y0, x0 + Math.max(Bm, g.xb1 * 1000), y0 + Hm, -10);
      v.dim(x0 + g.nf * Hm, y0 + Hm, x0 + g.xb1 * 1000, y0 + Hm, -6, "TOP " + F(r.bt * 1000, ",.0f"));
      v.text(x0 + Bm + 250, y0 + Hm * 0.5, "Front batter " + F(g.nf, ".3f") + ", back batter " + F(g.b, ".3f") + " (H:V)", 2.2);
    }
    v.rect(x0 - 100, y0 - 100, Bm + 200, 100, "CONCRETE");
  }

  function chDrawing(inp, o) {
    var D_ = DR(), s0 = o.secs[0], Wo = o.Wo * 1000, Lw = o.Lw * 1000, th = o.th * Math.PI / 180, B0 = s0.B * 1000;
    // plan of one end
    var p = new D_.View("Plan – one end (inlet; outlet similar)");
    var bl = 3000;
    p.line(0, 0, bl, 0, "HIDDEN"); p.line(0, Wo, bl, Wo, "HIDDEN");
    p.text(bl / 2, Wo / 2, o.pipe ? "pipe barrel" : "box barrel", 2.2, { anchor: "middle" });
    var tW = o.cons === "rcc" ? s0.tsb * 1000 : s0.bt * 1000;
    if (o.straight) {
      p.rect(-tW, -Lw, tW, Wo + 2 * Lw, "OUTLINE", "concrete");
      p.dim(-tW, -Lw, -tW, Wo + Lw, 10, "HEADWALL " + F(Wo + 2 * Lw, ",.0f"));
    } else {
      p.rect(-tW, 0, tW, Wo, "OUTLINE", "concrete");
      var ex = -Lw * Math.cos(th), ey = Lw * Math.sin(th);
      p.poly([[0, 0], [ex, -ey], [ex - tW, -ey], [-tW, 0]], true, "OUTLINE", "concrete");
      p.poly([[0, Wo], [ex, Wo + ey], [ex - tW, Wo + ey], [-tW, Wo]], true, "OUTLINE", "concrete");
      p.poly([[0, -100], [ex, -ey - 100], [ex - B0 * 0.5, -ey - 100]], false, "HIDDEN");
      p.dim(0, 0, ex, -ey, 10, (o.ret ? "RETURN " : "WING ") + F(Lw, ",.0f"));
      p.line(ex - 1500, -ey, ex - 1500, Wo + ey, "CONCRETE");
      p.text(ex - 1600, Wo / 2, "d/s curtain wall " + F(o.dd, ".1f") + " m deep; boulder apron " + F(o.ld, ".1f") + " m beyond", 2.0, { anchor: "end" });
    }
    p.text(-tW - 200, -400, "Floor PCC M15 " + G(o.fl * 1000) + " mm between curtain walls", 2.0, { anchor: "end" });
    // developed elevation of a wing
    var e = new D_.View(o.straight ? "Elevation – headwall end (developed)" : "Developed elevation of a " + (o.ret ? "return wall" : "wing wall"));
    var df = o.df * 1000, Hm = o.Hm * 1000, he = o.he * 1000;
    if (o.straight) e.rect(0, -df, Lw, Hm + df, "OUTLINE", "concrete");
    else e.poly([[0, -df], [Lw, -df], [Lw, he], [0, Hm]], true, "OUTLINE", "concrete");
    o.secs.forEach(function (r) { var x = r.seg.x0 * 1000; if (x > 0) e.line(x, -df, x, -df + 300, "CONCRETE"); e.text(x + r.seg.L * 500, -df - 250, "B " + F(r.B, ".2f"), 2.0, { anchor: "middle" }); });
    e.line(-500, 0, Lw + 500, 0, "SOIL"); e.text(Lw + 550, 0, "bed", 2.0);
    if (o.w) for (var rr = 0; rr < Math.min(o.w.rows, 6); rr++) for (var x2 = 300; x2 < Lw; x2 += Math.max(o.w.sh, 0.1) * 1000) {
      var yy = 150 + rr * o.w.sv * 1000, top = o.straight ? Hm : Hm - (Hm - he) * x2 / Lw;
      if (yy < top - 300) e.circle(x2 + (rr % 2) * o.w.sh * 500, yy, 50, "STEEL");
    }
    e.dim(0, -df, Lw, -df, 12); e.dim(0, -df, 0, Hm, 10); if (!o.straight) e.dim(Lw, -df, Lw, he, -8);
    if (o.w) e.text(Lw / 2, Hm + 300, "Weep holes " + G(o.w.dia) + " mm PVC @ " + F(o.w.sh, ".1f") + " m × " + F(o.w.sv, ".1f") + " m staggered", 2.0, { anchor: "middle" });
    // section at max height
    var sv = new D_.View("Section at max. height (H = " + F(s0.H, ".2f") + " m)");
    drawWallSection(sv, s0, o.cons, o.cover, 0, 0);
    sv.line(-800, df, 0, df, "SOIL"); sv.text(-820, df + 60, "bed", 2.0, { anchor: "end" });
    var bx = o.cons === "rcc" ? B0 : Math.max(B0, s0.g.xb1 * 1000);
    sv.line(bx, s0.H * 1000, bx + 2000, s0.H * 1000, "SOIL");
    sv.text(bx + 100, s0.H * 1000 + 150, "q = " + F(o.sur.q, ".0f") + " kN/m²", 2.0);
    if (o.w) { var xf = o.cons === "rcc" ? (s0.toe + s0.tsb) * 1000 : bx; sv.rect(xf, df, o.w.ft, s0.H * 1000 - df - 200, "THIN"); sv.text(xf + o.w.ft + 60, df + 400, "Filter " + G(o.w.ft), 2.0); }
    // section along the culvert axis – floor protection
    var a = new D_.View("Floor protection – section along culvert axis (one end)");
    var fl = o.fl * 1000, flL = o.floorL * 1000, lu = o.ld * 1000;
    a.rect(0, -fl, flL, fl, "OUTLINE", "concrete");
    a.rect(flL, -o.dd * 1000, 400, o.dd * 1000, "OUTLINE", "concrete");
    a.rect(flL + 400, -600, lu, 600, "THIN");
    a.line(-1000, 0, flL + lu + 1000, 0, "SOIL");
    a.text(flL + 400 + lu / 2, -900, "Boulder apron 600 thk, stones ≥ 40 kg", 2.0, { anchor: "middle" });
    a.dim(flL, -o.dd * 1000, flL + 400, -o.dd * 1000, 8); a.dim(flL + 400, 0, flL + 400, -o.dd * 1000, -8);
    a.dim(flL + 400, 0, flL + 400 + lu, 0, -8); a.dim(0, 0, flL, 0, -8);
    var notes = ["Walls: " + (o.cons === "rcc" ? "RCC M" + G(num(inp.fck)) + ", Fe" + G(num(inp.fy)) + ", cover " + G(o.cover) + " mm" : o.cons === "pcc" ? "PCC M15" : "random rubble masonry in CM 1:6") +
      "; foundations " + F(o.df, ".2f") + " m below bed on PCC 1:4:8 levelling course.",
      "Surcharge " + F(o.sur.q, ".0f") + " kN/m² (" + String(inp.vehicle) + "); backfill granular (IRC 78 App. 6) in 200 mm layers.",
      o.w ? "Weep holes " + G(o.w.dia) + " mm PVC @ " + F(o.w.sh, ".1f") + " × " + F(o.w.sv, ".1f") + " m staggered with " + G(o.w.ft) + " mm filter media behind." : "No weep holes – walls designed for water pressure and uplift.",
      "Curtain walls " + F(o.du, ".1f") + " m (u/s) / " + F(o.dd, ".1f") + " m (d/s) below floor; flexible boulder apron " + F(o.lu, ".1f") + " / " + F(o.ld, ".1f") + " m (IRC SP-13)."];
    if (o.sur.kind === "rail") notes.push("Railway culvert: railway (IRS / RDSO) rules apply; zonal-railway approval required before construction.");
    return new D_.Sheet("Culvert headwall & " + (o.straight ? "end walls" : o.ret ? "return walls" : "wing walls"), "CH-01", [p, e, sv, a], notes);
  }

  var notDump = function (v) { return /^Mine dumper/.test(String(v.vehicle)); };
  var CH_PARAMS = [
    P("culvert", "Culvert type", "RCC box culvert", { kind: "select", options: ["RCC box culvert", "Hume pipe culvert"], group: "Culvert" }),
    P("span", "Clear span of a cell / pipe internal dia", 2.0, "m", { min: 0.6, max: 6.0, step: 0.1, group: "Culvert" }),
    P("open_h", "Clear height of box", 2.0, "m", { min: 0.6, max: 5.0, step: 0.1, group: "Culvert", when: function (v) { return !/^Hume/.test(String(v.culvert)); } }),
    P("cells", "Number of cells / pipes", 1, { kind: "int", min: 1, max: 4, group: "Culvert" }),
    P("t_box", "Box slab & wall thickness / pipe wall thickness", 0.30, "m", { min: 0.05, max: 0.6, step: 0.025, group: "Culvert" }),
    P("fill", "Fill (cushion) over the culvert", 1.0, "m", { min: 0, max: 6, step: 0.1, group: "Culvert" }),
    P("road_w", "Road formation width", 10.0, "m", { min: 4, max: 40, step: 0.5, group: "Culvert" }),
    P("slope", "Embankment side slope (H : 1 V)", 2.0, { min: 1.0, max: 3.0, step: 0.25, group: "Culvert" }),
    P("layout", "Wall layout", CH_LAY[0], { kind: "select", options: CH_LAY.slice(), group: "Walls" }),
    P("splay", "Splay angle of wings to the culvert axis", 45.0, "°", { min: 15, max: 75, step: 5, group: "Walls", when: function (v) { return /^Splayed/.test(String(v.layout)); } }),
    P("h_end", "Height of wing at its end (above bed)", 0.6, "m", { min: 0.3, max: 2.0, step: 0.1, group: "Walls" }),
    P("construction", "Construction", CH_CON[0], { kind: "select", options: CH_CON.slice(), group: "Walls" }),
    P("shear_key", "Shear key (RCC) when sliding governs", "Shear key below stem (passive resistance, floor protected)", { kind: "select",
      options: ["Shear key below stem (passive resistance, floor protected)", "No shear key (widen the base)"], group: "Walls", when: function (v) { return /^RCC/.test(String(v.construction)); } }),
    P("top_w", "Top width (gravity wall / masonry headwall)", 0.5, "m", { min: 0.3, max: 1.2, step: 0.05, group: "Walls" }),
    P("front_batter", "Front batter of gravity wall (H : V)", 0.0, { min: 0, max: 0.3, step: 0.01, group: "Walls" }),
    P("gamma_m", "Unit weight of RR masonry", 23.0, "kN/m³", { min: 20, max: 26, group: "Walls" }),
    P("vehicle", "Culvert location (loading)", CH_VEH[0], { kind: "select", options: CH_VEH.slice(), group: "Location & surcharge",
      help: "Road: 1.2 m earth surcharge (IRC 6). Mine haul road: dumper equivalent surcharge. Railway: IRS track surcharge – railway rules only, the mining-area profile is never applied." }),
    P("rail_load", "Railway loading", "IRS 25 t loading-2008", { kind: "select", options: ["IRS 25 t loading-2008", "IRS DFC 32.5 t axle"], group: "Location & surcharge", when: function (v) { return /^Railway/.test(String(v.vehicle)); } }),
    P("ballast", "Ballast depth below sleeper", 0.35, "m", { min: 0.25, max: 0.6, step: 0.05, group: "Location & surcharge", when: function (v) { return /^Railway/.test(String(v.vehicle)); } }),
    P("surcharge", "Minimum / other surcharge", 10.0, "kN/m²", { min: 0, max: 200, group: "Location & surcharge" }),
    P("setback", "Dumper wheels set back from the wall top (bund)", 1.5, "m", { min: 0, max: 5, step: 0.25, group: "Mine dumper", when: notDump,
      help: "DGMS / CMR: safety bund keeps wheels ≥ 1.5 m from the edge; 0 = wheels at the wall" })
  ].concat(dumperParams(notDump, "BEML BH35-2 (60 t)"), [
    P("gamma", "Backfill unit weight", 18.0, "kN/m³", { min: 15, max: 22, group: "Soil" }),
    P("phi", "Backfill angle of friction", 30.0, "°", { min: 20, max: 40, group: "Soil" }),
    P("delta", "Wall friction δ (gravity walls)", 20.0, "°", { min: 0, max: 30, group: "Soil" }),
    P("mu", "Base friction coefficient μ", 0.5, { min: 0.3, max: 0.7, step: 0.05, group: "Soil" }),
    P("sbc", "Safe bearing capacity", 200.0, "kN/m²", { min: 50, max: 600, step: 10, group: "Soil" }),
    P("df", "Foundation depth below bed", 1.2, "m", { min: 0.5, max: 3.0, step: 0.1, group: "Soil" }),
    P("drainage", "Drainage behind walls", DRAIN_OPTS[0], { kind: "select", options: DRAIN_OPTS.slice(), group: "Drainage / weep holes" }),
    P("weep_dia", "Weep hole dia", 100.0, "mm", { kind: "select", options: [75.0, 100.0, 150.0], group: "Drainage / weep holes" }),
    P("weep_sh", "Weep holes – horizontal spacing", 1.0, "m", { min: 0.5, max: 3, step: 0.25, group: "Drainage / weep holes" }),
    P("weep_sv", "Weep holes – vertical spacing", 1.0, "m", { min: 0.5, max: 3, step: 0.25, group: "Drainage / weep holes" }),
    P("filter_t", "Filter media thickness", 300.0, "mm", { min: 0, max: 600, step: 50, group: "Drainage / weep holes" }),
    P("discharge", "Design discharge", 4.0, "m³/s", { min: 0.5, max: 200, group: "Hydraulics" }),
    P("hfl", "HFL depth above bed", 1.5, "m", { min: 0.3, max: 6, step: 0.1, group: "Hydraulics" }),
    P("ksf", "Lacey silt factor", 1.0, { min: 0.5, max: 2.5, step: 0.1, group: "Hydraulics" }),
    P("floor_t", "Rigid floor thickness (PCC M15)", 0.3, "m", { min: 0.15, max: 0.6, step: 0.05, group: "Hydraulics" })
  ], matParams(50.0, 30.0), [
    P("B_chk", "RCC: base width at max. section (check)", 3.0, "m", { min: 0.8, max: 12, step: 0.05, group: "My design", modes: CHECK }),
    P("toe_chk", "RCC: toe projection (check)", 1.0, "m", { min: 0.1, max: 4, step: 0.05, group: "My design", modes: CHECK }),
    P("tb_chk", "RCC: base thickness (check)", 0.40, "m", { min: 0.2, max: 1.5, step: 0.05, group: "My design", modes: CHECK }),
    P("ts_chk", "RCC: stem thickness at base (check)", 0.375, "m", { min: 0.2, max: 1.5, step: 0.025, group: "My design", modes: CHECK }),
    P("key_chk", "RCC: shear key depth (check, 0 = none)", 1.0, "m", { min: 0, max: 1.5, step: 0.05, group: "My design", modes: CHECK }),
    P("stem_dia", "RCC: stem bar dia (check)", 20.0, "mm", { kind: "select", options: [10.0, 12.0, 16.0, 20.0, 25.0], group: "My design", modes: CHECK }),
    P("stem_s", "RCC: stem bar spacing (check)", 200.0, "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK }),
    P("base_dia", "RCC: base bar dia (check)", 16.0, "mm", { kind: "select", options: [10.0, 12.0, 16.0, 20.0, 25.0], group: "My design", modes: CHECK }),
    P("base_s", "RCC: base bar spacing (check)", 150.0, "mm", { min: 75, max: 300, step: 5, group: "My design", modes: CHECK }),
    P("gB_chk", "Gravity: base width at max. section (check)", 3.5, "m", { min: 0.5, max: 10, step: 0.05, group: "My design", modes: CHECK })
  ]);
  M.CH_PARAMS = CH_PARAMS;
  C.register({ id: "culvert_headwall", phase: 3, category: "Drains, culverts & roads", name: "Culvert headwall & wing / return walls", icon: "🌉",
    description: "Headwall with splayed wing walls, return walls or a straight headwall for box & pipe culverts (IRC SP-13, IRC 78, IS 456): surcharge by location " +
      "(road IRC / mine haul-road dumper / railway IRS), stability at the max. and intermediate sections, RCC cantilever or PCC / RR gravity, weep holes, " +
      "apron, curtain walls & boulder apron (Lacey scour), BBS & quantities.",
    params: CH_PARAMS, run: run_culvert_headwall, references: ["IRC SP-13:2022", "IRC 78:2014", "IS 456:2000"] });

  /* ======================================================================= 3. GRAVITY / BREAST / TOE / GABION WALL */
  var GW_TYPES = ["Random rubble masonry in CM 1:6 (gravity)", "PCC M15 gravity wall", "Breast wall (RR masonry, on cut slope)", "Toe wall (RR masonry, at toe of slope)",
    "Gabion wall (stepped boxes, IS 16014 / IRC SP-116)"];
  function gwKind(v) { var t = String(v.type); return /^Gabion/.test(t) ? "gabion" : /^PCC/.test(t) ? "pcc" : /^Breast/.test(t) ? "breast" : /^Toe/.test(t) ? "toe" : "rr"; }
  M.gwKind = gwKind;
  /* gabion geometry: layer widths (bottom → top), box height hb; front = steps on the face (back flush) */
  function gabGeo(ws, hb, front, gg, gs) {
    var n = ws.length, H = n * hb, B = ws[0], pcs = [], xl = [];
    ws.forEach(function (w, j) { var x0 = front ? B - w : 0; xl.push(x0); pcs.push(["gabion layer " + (j + 1), w * hb, x0 + w / 2, gg, (j + 0.5) * hb]); });
    var xb1 = front ? B : ws[n - 1];
    if (!front) ws.forEach(function (w, j) { if (j === 0) return; var ym = (j + 0.5) * hb, xp = B + (xb1 - B) * ym / H; if (xp > w + 1e-9) pcs.push(["soil on step " + j, (xp - w) * hb, w + (xp - w) / 2, gs, ym]); });
    return { H: H, B: B, ws: ws, hb: hb, front: front, pcs: pcs, xl: xl, xb0: B, xb1: xb1, qheel: 0, xqh: 0 };
  }
  M.gabGeo = gabGeo;
  function gabWidths(n, B1, step, top) { var ws = []; for (var j = 0; j < n; j++) ws.push(R(Math.max(top, B1 - j * step), 3)); return ws; }
  /* gabion internal stability (Maccaferri / IRC SP-116 practice): allowable shear τ = σn·tan φ* + cg, φ* = 25 γg − 10 (γg t/m³), cg = 0.3 pu − 0.5 kPa
     (pu = mesh weight kg/m³), allowable compression σ = 50 γg − 30 t/m² */
  function gabInternal(c, gg, s, gab, full) {
    var ws = gg.ws, n = ws.length, ok = true, out = [], cc = full ? c : new C.Calc("s");
    var gt = gab.gg / 9.81, phs = 25 * gt - 10, cg = Math.max(0.3 * gab.pu - 0.5, 0), sad = (50 * gt - 30) * 9.81;
    cc.section("Gabion internal stability (each layer interface)");
    cc.calc("Equivalent friction angle of gabion fill", "φ*", "25*gt - 10", "°", "Maccaferri / IRC SP-116 practice (γg in t/m³) – verify", { gt: R(gt, 4) });
    cc.calc("Equivalent cohesion of gabion", "cg", "max(0.3*pu - 0.5, 0)", "kPa", "Maccaferri practice (pu = mesh mass per m³ of gabion)", { pu: gab.pu });
    cc.calc("Allowable compressive stress in gabion", "σadm", "(50*gt - 30)*9.81", "kN/m²", "Maccaferri practice", { gt: R(gt, 4) });
    for (var j = 1; j < n; j++) {
      var up = gabGeo(ws.slice(j), gg.hb, gg.front, gab.gg, s.gam), r = gSection(null, up, Object.assign({}, s, { hw: Math.max(0, (s.hw || 0) - j * gg.hb), seis: null }), { full: false });
      var w = ws[j], N = Math.max(r.V, 1e-6), tau = r.Hs / w, tadm = N / w * Math.tan(phs * Math.PI / 180) + cg;
      var smax = r.pmax, lab = "interface " + j + " (top of layer " + j + ", " + F(up.H, ".1f") + " m of wall above)";
      var c1 = cc.check("Shear at " + lab, R(tau, 3), R(tadm, 3), { unit: "kN/m²", clause: "τ ≤ σn tan φ* + cg (Maccaferri / IRC SP-116 – verify)" });
      var c2 = cc.check("Compression at " + lab, R(smax, 2), R(sad, 2), { unit: "kN/m²", clause: "σmax ≤ 50 γg − 30 t/m² (Maccaferri)" });
      var c3 = cc.check("Overturning at " + lab + " FoS ≥ 1.5", R(r.fot, 3), 1.5, { mode: ">=", clause: "practice (internal)" });
      ok = ok && c1 && c2 && c3; out.push({ j: j, tau: tau, tadm: tadm, smax: smax, fot: r.fot });
    }
    return { ok: ok, rows: out };
  }

  function gwAnalyse(c, inp, mode, geo, kind, s, perm, gab, full) {
    var cc = full ? c : new C.Calc("s"), res = {};
    res.sec = gSection(cc, geo, s, { sec: "External stability" });
    res.ok = res.sec.ok;
    if (kind === "gabion") { res.int = gabInternal(cc, geo, s, gab, true); res.ok = res.ok && res.int.ok; }
    else { res.joints = gJoints(cc, geo, s, perm, {}); res.ok = res.ok && res.joints.ok; }
    return res;
  }

  function run_gravity_wall(inp, mode) {
    var c = new C.Calc("Gravity / breast / toe / gabion wall");
    var kind = gwKind(inp), H = num(inp.height), df = Math.min(num(inp.df), H * 0.6), bt = num(inp.top_w), nf = num(inp.front_batter);
    var gam = num(inp.gamma), phi = num(inp.phi), dl = Math.min(num(inp.delta), phi), be = num(inp.beta), q = num(inp.surcharge), mu = num(inp.mu), sbc = num(inp.sbc);
    var drained = kind === "gabion" || String(inp.drainage).indexOf("Weep") === 0, seis = String(inp.seismic).indexOf("IS 1893") === 0;
    var s = { gam: gam, phi: phi, dl: dl, be: be, q: q, mu: mu, sbc: sbc, hw: drained ? 0 : Math.min(num(inp.hw), H), seis: seis ? { kh: num(inp.kh), kv: num(inp.kh) / 2 } : null, fot: 2.0, fsl: 1.5,
      cl: "IS 1904 / IRC 78 cl 706.3.4 (FoS 2.0 / 1.5)", kaClause: "Coulomb (Bowles form) – IS 14458 / IS 1893-3 static part" };
    var perm = permOf(kind === "pcc" ? "pcc" : "rr", String(inp.mortar), num(inp.gamma_m));
    var gab = { gg: num(inp.gamma_stone) * (1 - num(inp.porosity)), pu: num(inp.mesh_kg), hb: num(inp.box_h) };
    c.section("Wall & soil data");
    c.let("Wall type", "", String(inp.type), "", kind === "gabion" ? "IS 16014:2012 / IRC SP-116" : kind === "pcc" ? "IS 456 (plain concrete)" : "IS 1905 / IS 1597 (stone masonry)");
    c.let("Height (foundation base to top)", "H", H, "m", "", "embedment " + F(df, ".2f") + " m below lower ground (passive resistance ignored)");
    c.let("Backfill", "γ / φ / δ / β", G(gam) + " kN/m³ / " + G(phi) + "° / " + G(dl) + "° / " + G(be) + "°", "", "IS 14458 / soil report");
    c.let("Surcharge on backfill", "q", q, "kN/m²", "", isMine() ? "≥ 24 kN/m² next to mine roads (site profile)" : "");
    if (kind === "breast" && be < 10) c.warn("Breast wall", "A breast wall protects a cut slope – enter the slope above the wall as β (e.g. 26–34° for 1:1.5–1:2 cuts, limited to φ − 1°)", "IS 14458-2");
    if (kind === "toe" && H > 2.0) c.warn("Toe wall height", "Toe walls are normally ≤ 1.5–2.0 m; use a gravity / RCC retaining wall above that", "IRC SP-48 / practice");
    if (seis) c.info("Seismic", "kh = " + F(num(inp.kh), ".3f") + ", kv = kh/2; Korba / Gevra: zone II–III (Z = 0.10–0.16) – verify the site zone", "IS 1893-1 / IS 1893-3");
    if (!drained) c.warn("No drainage", "Water pressure up to " + F(s.hw, ".2f") + " m above the base and uplift included – provide weep holes + filter", "IS 14458");
    var geo, B, ws = null, gv = mode === "check" ? num(inp.B_chk) : null, Hg = H, n = 0, step = num(inp.gab_step), front = /^Front/.test(String(inp.gab_steps)), top = num(inp.gab_top);
    if (kind === "gabion") {
      n = Math.max(1, Math.ceil(H / gab.hb - 1e-9)); Hg = n * gab.hb;
      if (Math.abs(Hg - H) > 1e-6) c.info("Gabion height", "H rounded up to " + n + " × " + G(gab.hb) + " m = " + F(Hg, ".2f") + " m (box module)", "IS 16014");
      s.gab = true;
      var mk = function (B1) { return gabGeo(gabWidths(n, B1, step, top), gab.hb, front, gab.gg, gam); };
      if (mode === "check") ws = gabWidths(n, num(inp.gB1_chk), num(inp.gstep_chk), num(inp.gtop_chk));
      else if (mode === "thumb") ws = gabWidths(n, Math.max(top, ceil_to(0.6 * Hg, 0.5)), step, top);
      else {
        var B1 = Math.max(top, ceil_to(0.4 * Hg, 0.5));
        for (var i = 0; i < 60; i++) { var r0 = gwAnalyse(null, inp, mode, mk(B1), kind, s, perm, gab, false); if (r0.ok || B1 >= 3 * Hg) break; B1 += 0.5; }
        ws = gabWidths(n, B1, step, top);
      }
      geo = gabGeo(ws, gab.hb, front, gab.gg, gam);
      B = geo.B;
      c.let("Gabion layers (bottom → top widths)", "", ws.map(function (x) { return F(x, ".1f"); }).join(" / ") + " m × " + G(gab.hb) + " m high, steps at the " + (front ? "front (back face flush)" : "back (front face flush)"), "",
        mode === "check" ? "given" : mode === "thumb" ? "thumb rule bottom width ≈ 0.6 H" : "designed (bottom width in 0.5 m steps)");
      c.calc("Unit weight of gabion fill", "γg", "gs*(1 - n)", "kN/m³", "IS 16014 / IRC SP-116 (stone γ × (1 − porosity))", { gs: num(inp.gamma_stone), n: num(inp.porosity) });
    } else {
      if (mode === "check") B = Math.max(gv, bt + nf * H - 0.5 * H);
      else if (mode === "thumb") B = Math.max(ceil_to((kind === "breast" ? 0.4 : 0.5) * H, 0.05), bt + nf * H - (kind === "breast" ? 0.25 * H : 0));
      else {
        B = Math.max(kind === "breast" ? bt + nf * H - 0.25 * H : bt + nf * H, ceil_to(0.25 * H, 0.05), 0.3);
        for (var i2 = 0; i2 < 400; i2++) { var r1 = gwAnalyse(null, inp, mode, gravGeo(H, B, bt, nf, perm.gm), kind, s, perm, gab, false); if (r1.ok || B >= 2 * H) break; B = R(B + 0.05, 3); }
      }
      geo = gravGeo(H, B, bt, nf, perm.gm);
      if (geo.bt > bt + 1e-9) { c.info("Top width widened", "Back batter limited to " + F(BB_MAX, ".2f") + " (1H:2V); top width increased " + F(bt, ".2f") + " → " + F(geo.bt, ".2f") + " m", "Coulomb validity / practice"); bt = geo.bt; }
      c.let("Section", "B / top / front batter / back batter", F(B, ".2f") + " m / " + F(bt, ".2f") + " m / " + F(nf, ".3f") + " / " + F(geo.b, ".3f") + " (H:V)", "",
        mode === "check" ? "given" : mode === "thumb" ? "thumb rule B ≈ 0.5 H (breast 0.4 H)" : "designed: smallest base width (back batter) passing stability & joint stresses",
        geo.b < 0 ? "negative back batter – wall leans into the slope (breast wall)" : "");
      c.let("Masonry / concrete", "γm / fc / ft", G(perm.gm) + " kN/m³ / " + G(perm.fc) + " / " + G(perm.ft) + " N/mm²", "", perm.cl_c);
    }
    var res = gwAnalyse(c, inp, mode, geo, kind, s, perm, gab, true);
    // drainage
    c.section("Drainage");
    var w = null, Lw = num(inp.length), He = Math.max(Hg - df, 0.5);
    if (kind === "gabion") c.info("Drainage", "Gabions are free draining – non-woven geotextile (≥ 200 gsm) between backfill and gabions; no weep holes", "IRC SP-116 / MORT&H 2500");
    else if (drained) { w = weeps(c, inp, He, Lw, 0, ""); weepChecks(c, w); }
    else c.miss("No weep holes: confirm the water level behind the wall and long-term clogging; weep holes + filter reduce the section", "IS 14458", "Important");
    // thumb rules & missing
    c.thumb("Base width", (kind === "gabion" ? 0.6 : kind === "breast" ? 0.4 : 0.55) * Hg, B, "m", kind === "gabion" ? "≈ 0.5–0.7 H" : kind === "breast" ? "≈ 0.35–0.45 H (breast wall)" : "0.5–0.6 H", "IS 14458 / IRC SP-48 practice");
    c.thumb("Top width", kind === "gabion" ? 1.0 : 0.6, kind === "gabion" ? ws[ws.length - 1] : bt, "m", kind === "gabion" ? "≥ 1.0 m (one box)" : "≥ 0.5–0.6 m", "practice");
    c.miss("Global (slip-circle) stability of the slope with the wall, especially breast / toe walls on cut slopes and OB dumps", "IS 14458-2 / IS 7894", "Important");
    c.miss("Foundation on firm strata: remove loose fill / OB; step the foundation on sloping ground (steps ≤ 1 m high, ≥ 1.5 × step wide)", "IS 14458 / practice", "Important");
    if (kind === "gabion") c.miss("Gabion boxes: double-twisted hexagonal mesh 10 × 12 cm, 2.7 mm Zn-Al + PVC wire (3.4 mm selvedge), lacing wire 2.2 mm; stones 150–250 mm, hand packed; tilt 6° into backfill", "IS 16014:2012 / IRC SP-116", "Advisory");
    else c.miss("Expansion / contraction joints every 10–12 m (20 mm filler) and RCC / PCC coping 100 mm on masonry walls", "IS 1905 / practice", "Advisory");
    if (!seis) c.miss("Seismic earth pressure (IS 1893-3) not checked – select it for walls > 3 m or important walls (Korba zone II–III)", "IS 1893-3", "Advisory");
    if (isMine()) c.miss("Mine: keep dumper wheels ≥ 1.5 m from the wall top with a bund; blasting vibration on dry masonry – prefer CM / PCC or gabions", "Mine practice / DGMS", "Important");
    // quantities
    var qty = [], Lq = Lw, top0 = geo.xb1 - (kind === "gabion" ? (front ? geo.B - ws[ws.length - 1] : 0) : geo.nf * Hg);
    void top0;
    qty.push(Q("Earth work in excavation for foundation of wall, all kinds of soil", "cum", [row("Wall foundation", 1, Lq, B + 0.6, df + (kind === "gabion" ? 0.15 : 0.1))], [CPWD, "2.8.1"]));
    if (kind === "gabion") {
      var vol = C.sum(ws.map(function (x) { return x * gab.hb; }));
      qty.push(Q("Backfilling with granular material – 150 mm levelling pad below gabions, compacted", "cum", [row("Levelling pad", 1, Lq, B + 0.3, 0.15)], [MPPWD, "13.10.A"]));
      qty.push(Q("Gabion structure for retaining earth: wire-mesh boxes (IS 16014 double-twisted, Zn-Al + PVC) filled with hand-packed stone", "cum",
        ws.map(function (x, j) { return row("Layer " + (j + 1) + " (" + F(x, ".1f") + " m wide)", 1, Lq, x, gab.hb); }), [MPPWD, "15.12"], 0,
        "MPPWD 15.12 is GI 4 mm crates – adjust the rate for IS 16014 PVC-coated mesh"));
      qty.push(Q("Non-woven geotextile (≥ 200 gsm) filter between backfill and gabions / below base", "sqm", [row("Back face (developed)", 1, Lq, Math.sqrt(Math.pow(Hg, 2) + Math.pow(front ? 0 : B - ws[ws.length - 1], 2))), row("Under base", 1, Lq, B)], null, 120, "Non-SOR – market rate"));
      qty.push(Q("Backfilling behind wall in layers, compacted (excavated earth)", "cum", [row("Backfill wedge", 1, Lq, 0.6 + (front ? 0 : (B - ws[ws.length - 1]) / 2), Hg)], [CPWD, "2.25"]));
      var nb = 0, mesh = 0, tb = [];
      ws.forEach(function (x, j) { var nx = Math.ceil(Lq / 2 - 1e-9), ny = Math.ceil(x / 1.0 - 1e-9); nb += nx * ny; mesh += nx * ny * (2 * (2 * 1 + 2 * gab.hb + 1 * gab.hb) + 1 * gab.hb); tb.push(["Layer " + (j + 1), F(x, ".1f") + " m", nx * ny + " boxes 2 × 1 × " + G(gab.hb) + " m"]); });
      tb.push(["Total", F(vol * Lq, ".1f") + " m³", nb + " boxes; mesh ≈ " + F(mesh, ".0f") + " m² (incl. diaphragms)"]);
      res.boxes = tb; res.nb = nb; res.mesh = mesh;
    } else {
      qty.push(Q("PCC 1:4:8 levelling course below wall foundation, 100 mm", "cum", [row("Levelling course", 1, Lq, B + 0.3, 0.1)], [CPWD, "4.1.8"]));
      var Ab = polyAC([[0, 0], [B, 0], [B - geo.b * df, df], [geo.nf * df, df]]).A, At = polyAC(geo.pts).A - Ab;
      if (kind === "pcc") {
        qty.push(Q("PCC M15 in gravity wall (foundation + wall)", "cum", [row("Below ground", 1, Lq, Ab), row("Above ground", 1, Lq, At)], [MPPWD, "12.3"]));
        qty.push(Q("Centering & shuttering for walls – PCC gravity wall faces", "sqm", [row("Front face", 1, Lq, Math.sqrt(1 + geo.nf * geo.nf) * Hg), row("Back face", 1, Lq, Math.sqrt(1 + geo.b * geo.b) * Hg)], null, CM().RATE.shutter_wall));
      } else {
        qty.push(Q("Random rubble masonry with hard stone in foundation (below ground) in " + perm.name.replace("RR masonry ", ""), "cum", [row("Below ground", 1, Lq, Ab)], [CPWD, "7.1.1"],
          0, /1:6/.test(perm.name) ? "" : "CPWD 7.1.1 is CM 1:6 – adjust mortar"));
        qty.push(Q("Random rubble masonry with hard stone in wall above ground in " + perm.name.replace("RR masonry ", ""), "cum", [row("Above ground", 1, Lq, At)], [CPWD, "7.2.1"],
          0, /1:6/.test(perm.name) ? "" : "CPWD 7.2.1 is CM 1:6 – adjust mortar"));
      }
      if (w) {
        qty.push(Q("Filter media (graded) behind wall, " + G(w.ft) + " mm", "cum", [row("Filter", 1, Lq, w.ft / 1000, He)], [MPPWD, "13.11"]));
        var avgT = (B + bt) / 2;
        qty.push(Q("Weep holes with " + G(w.dia) + " mm PVC pipe through the wall, sloping 1V:20H", "metre", [row(w.n + " weep holes × avg. wall thickness", w.n, avgT)], [MPPWD, "13.9"]));
      }
      qty.push(Q("Backfilling behind wall in layers, compacted (excavated earth)", "cum", [row("Backfill (working space + wedge on back batter)", 1, Lq, 0.6 + Math.max(geo.b, 0) * Hg / 2, Hg)], [CPWD, "2.25"]));
    }
    // drawing
    var sheet = gwDrawing(inp, kind, geo, res, w, df, perm, gab);
    var sm = res.sec;
    var summary = { "Wall": String(inp.type).split(" (")[0] + ", H " + F(Hg, ".2f") + " m",
      "Section": kind === "gabion" ? "layers " + ws.map(function (x) { return F(x, ".1f"); }).join(" / ") + " m (steps " + (front ? "front" : "back") + ")" : "B " + F(B, ".2f") + " m, top " + F(bt, ".2f") + " m, batters " + F(nf, ".3f") + " / " + F(geo.b, ".3f"),
      "Stability": "FoS OT " + F(sm.fot, ".2f") + ", SL " + F(sm.fsl, ".2f") + ", pmax " + F(sm.pmax, ".0f") + " kN/m² (SBC " + G(sbc) + ")",
      "Earth pressure": "Ka " + F(sm.Ka, ".3f") + " (Coulomb), Pa " + F(sm.Pa, ".1f") + " kN/m",
      "Max utilisation": F(c.max_utilisation, ".2f") };
    if (sm.fote != null) summary["Seismic"] = "FoS OT " + F(sm.fote, ".2f") + ", SL " + F(sm.fsle, ".2f");
    if (res.joints) summary["Joint stresses"] = "max " + F(Math.max.apply(null, res.joints.joints.map(function (j) { return j.smax; })), ".3f") + " N/mm² (permissible " + G(perm.fc) + ")";
    if (res.boxes) summary["Gabion boxes"] = res.nb + " nos 2 × 1 × " + G(gab.hb) + " m";
    if (w) summary["Weep holes"] = w.n + " nos " + G(w.dia) + " mm";
    var tables = {};
    if (res.joints) tables["Joint stresses"] = C.table(res.joints.joints.map(function (j) { return [R(j.d, 2), R(j.w, 3), R(j.N, 1), R(j.e, 3), R(j.smax, 4), R(j.smin, 4)]; }),
      ["Depth below top m", "Width m", "N kN/m", "e m", "σmax N/mm²", "σmin N/mm²"]);
    if (res.int) tables["Gabion internal stability"] = C.table(res.int.rows.map(function (x) { return [x.j, R(x.tau, 2), R(x.tadm, 2), R(x.smax, 1), R(x.fot, 2)]; }), ["Interface", "τ kN/m²", "τ allowable", "σmax kN/m²", "FoS OT"]);
    if (res.boxes) tables["Gabion boxes"] = C.table(res.boxes, ["Layer", "Width / volume", "Boxes"]);
    var refs = ["IS 14458 (Parts 1–3) – Retaining walls for hill areas (gravity / breast walls)", "IS 1905:1987 – Structural use of unreinforced masonry",
      "IS 1893 (Part 3):2014 – Seismic design of bridges & retaining walls", "IS 16014:2012 – Mechanically woven double-twisted hexagonal mesh gabions",
      "IRC SP-116:2018 – Design & construction of gabion structures", "IRC 78:2014 cl 706 – stability criteria"];
    return C.DesignResult({ module: "gravity_wall", title: "Gravity / breast / toe / gabion wall", inputs: inp, calc: c, summary: summary, drawings: [sheet], quantities: qty, bbs: [],
      tables: tables, references: refs });
  }
  M.run_gravity_wall = run_gravity_wall;

  function gwDrawing(inp, kind, geo, res, w, df, perm, gab) {
    var D_ = DR(), v = new D_.View("Section of wall"), H = geo.H * 1000, B = geo.B * 1000, dfm = df * 1000, be = num(inp.beta) * Math.PI / 180;
    if (kind === "gabion") {
      geo.ws.forEach(function (x, j) {
        var x0 = geo.xl[j] * 1000, y0 = j * geo.hb * 1000, wm = x * 1000, hb = geo.hb * 1000;
        for (var k = 0; k < Math.round(x); k++) v.rect(x0 + k * 1000, y0, Math.min(1000, wm - k * 1000), hb, "OUTLINE", "soil");
        if (wm - Math.round(x) * 1000 > 1) v.rect(x0 + Math.round(x) * 1000, y0, wm - Math.round(x) * 1000, hb, "OUTLINE", "soil");
        v.text(x0 + wm + 80, y0 + hb / 2, F(x, ".1f") + " m", 2.0);
      });
      v.rect(-150, -150, B + 300, 150, "THIN");
      v.text(B / 2, -400, "150 granular levelling pad; geotextile on back face & under base", 2.0, { anchor: "middle" });
    } else {
      v.poly(geo.pts.map(function (p) { return [p[0] * 1000, p[1] * 1000]; }), true, "OUTLINE", kind === "pcc" ? "concrete" : "soil");
      v.rect(-150, -100, B + 300, 100, "CONCRETE");
      v.text(B / 2, -350, "PCC 1:4:8 levelling course 100", 2.0, { anchor: "middle" });
      v.dim(geo.nf * H, H, geo.xb1 * 1000, H, -6, "TOP " + F(geo.bt * 1000, ",.0f"));
      if (w) {
        for (var r = 0; r < Math.min(w.rows, 6); r++) {
          var yy = dfm + 150 + r * w.sv * 1000; if (yy > H - 200) break;
          var xf = geo.nf * yy, xb = B - geo.b * yy;
          v.line(xf, yy - (xb - xf) / 20, xb, yy, "STEEL");
        }
        var xb0 = B - geo.b * dfm, xb1 = geo.xb1 * 1000;
        v.poly([[xb0, dfm], [xb1, H - 200], [xb1 + w.ft, H - 200], [xb0 + w.ft, dfm]], true, "THIN");
        v.text(Math.max(xb0, xb1) + w.ft + 80, (dfm + H) / 2, "Filter " + G(w.ft) + " + weep holes " + G(w.dia) + " @ " + F(w.sh, ".1f") + " m", 2.0);
      }
    }
    var xt = Math.max(geo.xb1 * 1000, B);
    v.poly([[geo.xb1 * 1000, H], [xt + 3000, H + 3000 * Math.tan(be)]], false, "SOIL");
    v.text(xt + 1500, H + 1500 * Math.tan(be) + 200, "q = " + G(num(inp.surcharge)) + " kN/m², β = " + G(num(inp.beta)) + "°", 2.0, { anchor: "middle" });
    v.line(-1500, dfm, 0, dfm, "SOIL"); v.text(-1550, dfm + 60, "GL (front)", 2.0, { anchor: "end" });
    v.dim(0, 0, B, 0, 10); v.dim(Math.max(B, xt) + 300, 0, Math.max(B, xt) + 300, H, -10); v.dim(-300, 0, -300, dfm, 8);
    var e = new D_.View("Elevation (typical 6 m)");
    e.rect(0, 0, 6000, H, "OUTLINE", kind === "pcc" ? "concrete" : "soil");
    e.line(-300, dfm, 6300, dfm, "SOIL");
    if (w) for (var r2 = 0; r2 < Math.min(w.rows, 6); r2++) for (var x = 300; x < 6000; x += Math.max(w.sh, 0.1) * 1000) { var y2 = dfm + 150 + r2 * w.sv * 1000; if (y2 < H - 200) e.circle(x + (r2 % 2) * w.sh * 500, y2, w.dia / 2, "STEEL"); }
    if (kind === "gabion") for (var j2 = 1; j2 < geo.ws.length; j2++) e.line(0, j2 * geo.hb * 1000, 6000, j2 * geo.hb * 1000, "THIN");
    if (kind === "gabion") for (var x3 = 2000; x3 < 6000; x3 += 2000) e.line(x3, 0, x3, H, "THIN");
    e.dim(0, 0, 6000, 0, 8); e.dim(6000, 0, 6000, H, -8);
    var notes = [kind === "gabion" ? "Gabion boxes 2 × 1 × " + G(gab.hb) + " m, IS 16014 double-twisted mesh, stone fill γ " + F(gab.gg, ".1f") + " kN/m³, joints staggered." :
      perm.name + " (γ " + G(perm.gm) + " kN/m³); permissible compression " + G(perm.fc) + " N/mm², tension " + G(perm.ft) + " N/mm².",
      "Backfill γ " + G(num(inp.gamma)) + " kN/m³, φ " + G(num(inp.phi)) + "°, δ " + G(Math.min(num(inp.delta), num(inp.phi))) + "°, surcharge " + G(num(inp.surcharge)) + " kN/m², SBC " + G(num(inp.sbc)) + " kN/m².",
      w ? "Weep holes " + G(w.dia) + " mm PVC @ " + F(w.sh, ".1f") + " m c/c, " + w.rows + " row(s) @ " + F(w.sv, ".1f") + " m, sloping 1:20 outward, with " + G(w.ft) + " mm graded filter." :
        kind === "gabion" ? "Free draining – non-woven geotextile behind and below the gabions." : "No weep holes – designed for water pressure and uplift.",
      "Foundation " + F(df, ".2f") + " m below the lower ground on firm strata; backfill in 200 mm compacted layers."];
    return new D_.Sheet(String(inp.type).split(" (")[0], "GW-01", [v, e], notes);
  }

  var notGab = function (v) { return gwKind(v) !== "gabion"; }, isGab = function (v) { return gwKind(v) === "gabion"; };
  var GW_PARAMS = [
    P("type", "Wall type", GW_TYPES[0], { kind: "select", options: GW_TYPES.slice(), group: "Wall" }),
    P("height", "Height (foundation base to top)", 3.0, "m", { min: 0.6, max: 8.0, step: 0.1, group: "Wall" }),
    P("df", "Embedment below lower ground", 0.6, "m", { min: 0.3, max: 2.0, step: 0.1, group: "Wall" }),
    P("top_w", "Top width", 0.6, "m", { min: 0.3, max: 1.5, step: 0.05, group: "Wall", when: notGab }),
    P("front_batter", "Front batter (H : V)", 0.1, { min: 0, max: 0.5, step: 0.01, group: "Wall", when: notGab, help: "Breast walls on cut slopes: 0.25–0.33 (1:4–1:3)" }),
    P("mortar", "Mortar (RR masonry)", "CM 1:6", { kind: "select", options: ["CM 1:6", "CM 1:4", "CM 1:3"], group: "Wall", when: function (v) { return notGab(v) && gwKind(v) !== "pcc"; } }),
    P("gamma_m", "Unit weight of RR masonry", 23.0, "kN/m³", { min: 20, max: 26, group: "Wall", when: function (v) { return notGab(v) && gwKind(v) !== "pcc"; } }),
    P("box_h", "Gabion box height", 1.0, "m", { kind: "select", options: [0.5, 1.0], group: "Gabion", when: isGab }),
    P("gab_steps", "Gabion steps", "Front (face stepped, back flush)", { kind: "select", options: ["Front (face stepped, back flush)", "Back (front flush, steps under the backfill)"], group: "Gabion", when: isGab }),
    P("gab_step", "Step per layer", 0.5, "m", { kind: "select", options: [0.0, 0.5, 1.0], group: "Gabion", when: isGab }),
    P("gab_top", "Top layer width", 1.0, "m", { kind: "select", options: [1.0, 1.5, 2.0], group: "Gabion", when: isGab }),
    P("gamma_stone", "Unit weight of stone (solid)", 25.0, "kN/m³", { min: 22, max: 28, group: "Gabion", when: isGab }),
    P("porosity", "Porosity of stone fill", 0.35, { min: 0.25, max: 0.45, step: 0.01, group: "Gabion", when: isGab }),
    P("mesh_kg", "Mesh mass per m³ of gabion", 8.6, "kg/m³", { min: 5, max: 15, step: 0.1, group: "Gabion", when: isGab }),
    P("gamma", "Backfill unit weight", 18.0, "kN/m³", { min: 15, max: 22, group: "Soil" }),
    P("phi", "Backfill angle of friction", 30.0, "°", { min: 20, max: 40, group: "Soil" }),
    P("delta", "Wall friction δ", 20.0, "°", { min: 0, max: 30, group: "Soil", help: "≈ 2/3 φ for masonry / gabions" }),
    P("beta", "Backfill slope β", 0.0, "°", { min: 0, max: 35, group: "Soil", help: "Limited to φ − 1° (Coulomb)" }),
    P("surcharge", "Surcharge on backfill", 10.0, "kN/m²", { min: 0, max: 60, group: "Soil" }),
    P("mu", "Base friction coefficient μ", 0.5, { min: 0.3, max: 0.7, step: 0.05, group: "Soil" }),
    P("sbc", "Safe bearing capacity", 150.0, "kN/m²", { min: 50, max: 600, step: 10, group: "Soil" }),
    P("drainage", "Drainage behind wall", DRAIN_OPTS[0], { kind: "select", options: DRAIN_OPTS.slice(), group: "Drainage / weep holes", when: notGab }),
    P("hw", "Water level above base (no drainage)", 1.5, "m", { min: 0, max: 8, step: 0.1, group: "Drainage / weep holes", when: function (v) { return notGab(v) && String(v.drainage).indexOf("No") === 0; } }),
    P("weep_dia", "Weep hole dia", 100.0, "mm", { kind: "select", options: [75.0, 100.0, 150.0], group: "Drainage / weep holes", when: notGab }),
    P("weep_sh", "Weep holes – horizontal spacing", 1.5, "m", { min: 0.5, max: 3, step: 0.25, group: "Drainage / weep holes", when: notGab }),
    P("weep_sv", "Weep holes – vertical spacing", 1.0, "m", { min: 0.5, max: 3, step: 0.25, group: "Drainage / weep holes", when: notGab }),
    P("filter_t", "Filter media thickness", 300.0, "mm", { min: 0, max: 600, step: 50, group: "Drainage / weep holes", when: notGab }),
    P("seismic", "Seismic check", "None", { kind: "select", options: ["None", "IS 1893-3 pseudo-static (Mononobe–Okabe)"], group: "Seismic" }),
    P("kh", "Horizontal seismic coefficient kh", 0.05, { min: 0, max: 0.3, step: 0.01, group: "Seismic", when: function (v) { return String(v.seismic).indexOf("IS") === 0; },
      help: "≈ Z/2 for zone II (Korba): 0.05; zone III: 0.08" }),
    P("length", "Length of wall (quantity)", 30.0, "m", { min: 1, max: 2000, group: "Quantity" }),
    P("B_chk", "Base width (check)", 1.6, "m", { min: 0.3, max: 8, step: 0.05, group: "My design", modes: CHECK, when: notGab }),
    P("gB1_chk", "Gabion bottom layer width (check)", 2.5, "m", { kind: "select", options: [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0], group: "My design", modes: CHECK, when: isGab }),
    P("gstep_chk", "Gabion step per layer (check)", 0.5, "m", { kind: "select", options: [0.0, 0.5, 1.0], group: "My design", modes: CHECK, when: isGab }),
    P("gtop_chk", "Gabion top width (check)", 1.0, "m", { kind: "select", options: [1.0, 1.5, 2.0], group: "My design", modes: CHECK, when: isGab })
  ];
  M.GW_PARAMS = GW_PARAMS;
  C.register({ id: "gravity_wall", phase: 3, category: "Drains, culverts & roads", name: "Gravity / breast / toe / gabion wall", icon: "🪨",
    description: "Random rubble (CM 1:6) or PCC M15 gravity, breast and toe walls and stepped gabion walls: Coulomb earth pressure (+ Mononobe–Okabe, IS 1893-3), " +
      "overturning / sliding / bearing / no tension, joint stresses (IS 1905), gabion internal stability, weep holes & filter, CPWD / MPPWD quantities.",
    params: GW_PARAMS, run: run_gravity_wall, references: ["IS 14458", "IS 1905:1987", "IRC SP-116:2018"] });
})();
