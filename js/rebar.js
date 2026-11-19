/* Estimate Pro — reinforcement: bar bending schedule (BBS) rows, IS 456 based settings,
   thumb-rule presets, IS 456 % checks and the up-to / above plinth split. */
(function () {
  "use strict";
  var EP = window.EP;

  /* ---------- standards ---------- */
  // IS 1786 nominal mass (kg/m); others d²/162.2
  var WT = { 6: 0.222, 8: 0.395, 10: 0.617, 12: 0.888, 16: 1.58, 20: 2.47, 25: 3.85, 28: 4.83, 32: 6.31, 36: 7.99, 40: 9.87 };
  EP.RF_DIAS = [6, 8, 10, 12, 16, 20, 25, 28, 32, 36, 40];
  EP.barWt = function (dia) { dia = +dia; return WT[dia] || Math.round(dia * dia / 162.2 * 1000) / 1000; };
  EP.RF_GRADES = ["Fe250", "Fe415", "Fe415D", "Fe500", "Fe500D", "Fe550", "Fe550D", "Fe600"];
  EP.RF_CONC = ["M15", "M20", "M25", "M30", "M35", "M40", "M45", "M50"];
  // IS 456 Table 16: nominal cover (mm) by exposure
  EP.RF_EXP = { mild: ["Mild", 20], moderate: ["Moderate", 30], severe: ["Severe", 45], vsevere: ["Very severe", 50], extreme: ["Extreme", 75] };
  EP.RF_MEM = { slab: "Slab", beam: "Beam", column: "Column", footing: "Footing / raft", wall: "Wall", stair: "Staircase", other: "Other" };
  // Thumb rules: % of concrete volume (sources: civiconcepts / learningtechnologyofficial). Wall & stair left for the user.
  EP.RF_THUMB = { slab: 1.0, beam: 2.0, column: 2.5, footing: 0.8 };
  EP.RF_SHAPES = { st: "Straight", hk: "Straight + 180° hooks both ends", ln: "L-bends both ends (legs)", cr: "Cranked (bent-up) bar", sr: "Stirrup / rectangular tie", cl: "Circular ring / tie" };
  function fy(g) { return +String(g || "Fe500").replace(/\D/g, "") || 500; }
  function tbd(c) { var m = +String(c || "M20").replace(/\D/g, "") || 20; return m <= 15 ? 1.0 : m <= 20 ? 1.2 : m <= 25 ? 1.4 : m <= 30 ? 1.5 : m <= 35 ? 1.7 : 1.9; } // IS 456 26.2.1.1 (plain bars)
  EP.rfDefaults = function () { return { grade: "Fe500D", conc: "M25", exp: "moderate", stock: "12", hook: "9", lap: "", cov: {} }; };
  EP.rf = function (doc) { doc.rf = doc.rf || EP.rfDefaults(); if (!doc.rf.cov) doc.rf.cov = {}; return doc.rf; };
  /* Development length in bar diameters: Ld = 0.87 fy / (4 τbd), deformed bars +60% (IS 456 26.2.1) */
  EP.rfLd = function (doc) { var s = EP.rf(doc), f = fy(s.grade), t = tbd(s.conc) * (f > 250 ? 1.6 : 1); return Math.ceil(0.87 * f / (4 * t) - 0.05); };
  /* Tension lap: max(Ld, 30d) (IS 456 26.2.5.1) unless set */
  EP.rfLap = function (doc) { var s = EP.rf(doc), v = EP.ev(s.lap); return v != null && v > 0 ? v : Math.max(EP.rfLd(doc), 30); };
  EP.rfCoverAuto = function (doc, mem) { var s = EP.rf(doc), c = (EP.RF_EXP[s.exp] || EP.RF_EXP.moderate)[1]; if (mem === "column") c = Math.max(c, 40); if (mem === "footing") c = Math.max(c, 50); return c; };
  EP.rfCover = function (doc, mem) { var s = EP.rf(doc), v = EP.ev(s.cov[mem || "other"]); return v != null ? v : EP.rfCoverAuto(doc, mem); };
  /* IS 456 limits on total steel as % of gross concrete (approximate check of the whole member) */
  EP.rfLimits = function (doc, mem) {
    var f = fy(EP.rf(doc).grade);
    if (mem === "slab" || mem === "footing" || mem === "stair") return { min: f >= 415 ? 0.12 : 0.15, max: null, ref: "IS 456 cl. 26.5.2.1 (min 0.12% HYSD / 0.15% mild steel)" };
    if (mem === "beam") return { min: Math.round(0.85 / f * 10000) / 100, max: 8, ref: "IS 456 cl. 26.5.1.1 (tension steel min 0.85/fy, max 4% each face)" };
    if (mem === "column") return { min: 0.8, max: 6, ref: "IS 456 cl. 26.5.3.1 (0.8% to 6%, 4% advised)" };
    if (mem === "wall") return { min: 0.32, max: 4, ref: "IS 456 cl. 32.5 (vertical 0.12% + horizontal 0.20%)" };
    return null;
  };
  EP.rfCheck = function (doc, mem, pct) {
    var L = EP.rfLimits(doc, mem); if (!L || pct == null || !isFinite(pct)) return null;
    if (L.min != null && pct < L.min) return { ok: false, msg: "Below IS 456 minimum " + L.min + "%", ref: L.ref };
    if (L.max != null && pct > L.max) return { ok: false, msg: "Above IS 456 maximum " + L.max + "%", ref: L.ref };
    if (mem === "column" && pct > 4) return { ok: true, warn: true, msg: "More than 4% — check congestion at laps", ref: L.ref };
    return { ok: true, msg: "Within IS 456 limits", ref: L.ref };
  };
  /* Unit factor: kg → item unit */
  EP.unitFactor = function (unit) { var u = String(unit || "").toLowerCase().replace(/[^a-z]/g, ""); if (/^(tonne|tonnes|ton|tons|mt|t)$/.test(u)) return 0.001; if (/^(quintal|quintals|qtl|qt)$/.test(u)) return 0.01; return 1; };
  EP.isSteelUnit = function (unit) { return /^(kg|kgs|tonne|tonnes|ton|mt|t|quintal|qtl)\b/i.test(String(unit || "").trim()); };

  /* ---------- one BBS row ----------
     r: { k:"bbs", d, mem, lvl:"below"|"above", n (members), dia, sh (shape), l (m), nb (bars) | sp (mm) + dl (m),
          e (leg m, L-bars), ch (crank height mm), a, bb (tie outer size mm), D (ring outer dia mm), c (cover mm), x (extra m), nolap, uf } */
  EP.bbs = function (doc, r) {
    var dia = EP.ev(r.dia) || 0, d = dia / 1000, c = (EP.ev(r.c) != null ? EP.ev(r.c) : EP.rfCover(doc, r.mem)) / 1000;
    var s = EP.rf(doc), hook = EP.ev(s.hook) || 9, stock = EP.ev(s.stock) || 12, lapD = EP.rfLap(doc);
    var L = EP.ev(r.l) || 0, x = EP.ev(r.x) || 0, len = 0, how = "", laps = 0, sh = r.sh || "st";
    if (sh === "sr") {
      var A = (EP.ev(r.a) || 0) / 1000 - 2 * c - d, B = (EP.ev(r.bb) || 0) / 1000 - 2 * c - d, hk = Math.max(10 * d, 0.075);
      len = 2 * (A + B) + 2 * hk - 3 * 2 * d - 2 * 3 * d + x;
      how = "2(A+B) + 2×hook(10d, min 75 mm) − 3×2d (90° bends) − 2×3d (135° bends); A,B = size − 2 cover − d";
    } else if (sh === "cl") {
      var Dm = (EP.ev(r.D) || 0) / 1000 - 2 * c - d; len = Math.PI * Dm + lapD * d + x; how = "π × (D − 2 cover − d) + one lap (" + lapD + "d)";
    } else {
      len = L - 2 * c + x; how = "L − 2 cover";
      if (sh === "hk") { len += 2 * hook * d; how += " + 2 × " + hook + "d hooks"; }
      if (sh === "ln") { len += 2 * (EP.ev(r.e) || 0) - 2 * 2 * d; how += " + 2 legs − 2×2d (90° bends)"; }
      if (sh === "cr") { len += 2 * 0.42 * (EP.ev(r.ch) || 0) / 1000; how += " + 2 × 0.42 × crank height (45°)"; }
      if (!r.nolap && L - 2 * c > stock) { laps = Math.ceil((L - 2 * c) / stock) - 1; len += laps * lapD * d; how += " + " + laps + " lap" + (laps > 1 ? "s" : "") + " × " + lapD + "d (" + stock + " m bars)"; }
      if (x) how += " + extra";
    }
    if (len < 0) len = 0;
    var nb = EP.ev(r.nb), sp = EP.ev(r.sp), dl = EP.ev(r.dl), nbHow = "";
    if (nb == null && sp && dl) { nb = Math.floor(dl * 1000 / sp) + 1; nbHow = "(" + dl + " m ÷ " + sp + " mm) + 1"; }
    if (nb == null) nb = 1;
    var n = EP.ev(r.n); if (n == null) n = 1;
    var w = dia ? EP.barWt(dia) : 0, cl = Math.round(len * 1000) / 1000, kg = n * nb * cl * w;
    return { dia: dia, cover: Math.round(c * 1000), cl: cl, how: how, laps: laps, nb: nb, nbHow: nbHow, n: n, w: w, bars: n * nb, kg: kg, qty: kg * (r.uf || 1) };
  };
  /* Steel of an item by diameter and level (kg) */
  EP.bbsSummary = function (doc, it) {
    var dia = {}, lvl = { below: 0, above: 0 }, tot = 0, any = false;
    (it.meas || []).forEach(function (r) { if (r.k !== "bbs") return; any = true; var b = EP.bbs(doc, r); dia[b.dia] = (dia[b.dia] || 0) + b.kg; lvl[r.lvl === "below" ? "below" : "above"] += b.kg; tot += b.kg; });
    return any ? { dia: dia, lvl: lvl, kg: tot } : null;
  };
  /* Plinth split: CPWD DSR 5.22.x (up to plinth) ↔ 5.22A.x (above plinth); 5.22B.1 ↔ 5.22C.1 */
  EP.plinthPair = function (b, c) {
    if (b !== "cpwd" && b !== "cpwd23") return null; var m;
    if ((m = /^5\.22\.(\d+)$/.exec(c))) return { below: "5.22." + m[1], above: "5.22A." + m[1] };
    if ((m = /^5\.22A\.(\d+)$/.exec(c))) return { below: "5.22." + m[1], above: "5.22A." + m[1] };
    if (c === "5.22B.1" || c === "5.22C.1") return { below: "5.22B.1", above: "5.22C.1" };
    return null;
  };
})();
