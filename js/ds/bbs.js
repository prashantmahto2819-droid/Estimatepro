/* Design Studio — bar bending schedule rules (DS.bbs), one place for every module.
   Conventions (IS 2502:1963, SP 34:1987, IS 456:2000 cl 26.2, IS 13920:2016):
   * Segment lengths are measured OUT-TO-OUT; the cut length deducts the bend allowance:
       45° → 1d, 90° → 2d, 135° → 3d, 180° → 4d.
   * Standard 180° hook (tension anchorage, IS 2502): + 9d each; 90° bend with an L-leg: leg given explicitly.
   * Closed stirrup / tie with 135° hooks (IS 13920 cl 6.3.2 / SP 34): A = b − 2c, B = D − 2c (out-to-out),
       hook extension = max(10d, 75 mm) each, cut = 2(A + B) + 2·hook − 3 × 2d (three 90° corners) − 2 × 3d (two 135°).
   * Crank (bent-up bar at 45°): + 0.42 h per crank, − 2 × 1d for its two 45° bends; h = D − 2c − d (centre to centre of bars).
   * Development length Ld = 0.87 fy φ / (4 τbd), τbd from IS 456 cl 26.2.1.1 × 1.6 for deformed bars (+25 % in compression).
       Lap: tension max(Ld, 30φ), compression max(Ld,c, 24φ) (IS 456 cl 26.2.5.1).
   * Bars longer than the 12 m stock length get laps: n = ceil((L − 12)/(12 − lap)) laps added.
   * Number of bars over a width W at spacing s with end clearance e: n = floor((W − 2e)/s) + 1.
   * Weight: d²/162 kg/m (IS 1786 nominal mass = 0.00617 d²).
   Every helper returns {cut (m), f (formula text with the numbers)} so the schedule shows how each cut length was found. */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var STOCK = 12.0;
  var TBD = { 15: 1.0, 20: 1.2, 25: 1.4, 30: 1.5, 35: 1.7, 40: 1.9 };  // IS 456 cl 26.2.1.1 (plain bars, tension)
  function r3(x) { return Math.round(x * 1000) / 1000; }
  function mm(x) { return String(Math.round(x)); }
  function tbd(fck) { var k = Object.keys(TBD).map(Number).sort(function (a, b) { return a - b; }), v = TBD[k[0]]; k.forEach(function (g) { if (fck >= g) v = TBD[g]; }); return v; }

  /* editable rules (Design Studio → BBS → "BBS rules"); DEFAULTS restore the IS / SP 34 values */
  var DEFAULTS = { bend45: 1, bend90: 2, bend135: 3, hook180: 9, tie_hook_d: 10, tie_hook_min: 75, stock: 12, lap_min_d: 30,
    beam_sw: 300, slab_sw: 230, leg_d: 12, ftg_leg_min: 150, wall_leg_min: 300 };
  var B = DS.bbs = {
    DEFAULTS: DEFAULTS,
    cfg: Object.assign({}, DEFAULTS),
    CFG_FIELDS: [["bend45", "Bend deduction 45°", "× d"], ["bend90", "Bend deduction 90°", "× d"], ["bend135", "Bend deduction 135°", "× d"],
      ["hook180", "Standard 180° hook", "× d"], ["tie_hook_d", "Stirrup / tie 135° hook", "× d"], ["tie_hook_min", "Stirrup hook minimum", "mm"],
      ["stock", "Stock bar length", "m"], ["lap_min_d", "Minimum tension lap", "× d"], ["beam_sw", "Beam support width (assumed)", "mm"],
      ["slab_sw", "Slab support width (assumed)", "mm"], ["leg_d", "90° bend leg (beams, stairs, footings)", "× d"],
      ["ftg_leg_min", "Footing bar leg minimum", "mm"], ["wall_leg_min", "Wall / drain / tank bar leg minimum", "mm"]],
    setCfg: function (o) { B.cfg = Object.assign({}, DEFAULTS); Object.keys(o || {}).forEach(function (k) { var v = +o[k]; if (k in DEFAULTS && isFinite(v) && v >= 0) B.cfg[k] = v; }); B.bend = { 45: B.cfg.bend45, 90: B.cfg.bend90, 135: B.cfg.bend135, 180: 2 * B.cfg.bend90 }; STOCK = B.cfg.stock; B.STOCK = STOCK; },
    changed: function () { return Object.keys(DEFAULTS).filter(function (k) { return B.cfg[k] !== DEFAULTS[k]; }); },
    STOCK: STOCK,
    RULES: "IS 2502 / SP 34 / IS 456 cl 26.2: bends 45°=1d, 90°=2d, 135°=3d deducted; 180° hook +9d; stirrup hooks max(10d, 75 mm); crank +0.42h; laps max(Ld, 30d) beyond 12 m stock",
    bend: { 45: 1, 90: 2, 135: 3, 180: 4 },
    hook: function (d) { return B.cfg.hook180 * d; },
    tie_hook: function (d) { return Math.max(B.cfg.tie_hook_d * d, B.cfg.tie_hook_min); },
    leg: function (d, min) { return Math.max(B.cfg.leg_d * d, min || 0); },
    /* development length (mm) for deformed bars */
    Ld: function (d, fck, fy, comp) { var t = tbd(fck || 25) * 1.6 * (comp ? 1.25 : 1); return Math.ceil(0.87 * (fy || 500) * d / (4 * t) / 10) * 10; },
    lap: function (d, fck, fy, comp) { return Math.max(B.Ld(d, fck, fy, comp), (comp ? 24 : B.cfg.lap_min_d) * d); },
    /* n bars over width W (mm) at spacing s (mm), first / last bar e (mm) from the edges */
    count: function (W, s, e) { return Math.floor((W - 2 * (e == null ? 50 : e)) / s + 1e-9) + 1; },
    /* generic: segments out-to-out (mm) with bends list [deg,...], hooks count (180°) */
    shape: function (d, segs, bends, hooks, label) {
      var sum = segs.reduce(function (a, b) { return a + b; }, 0), ded = 0, hk = (hooks || 0) * B.cfg.hook180 * d;
      (bends || []).forEach(function (a) { ded += (B.bend[a] || 0) * d; });
      var cut = (sum + hk - ded) / 1000;
      var f = (label ? label + ": " : "") + segs.map(mm).join(" + ") + (hooks ? " + " + hooks + "×" + B.cfg.hook180 + "d" : "") + ((bends || []).length ? " − " + (bends || []).map(function (a) { return (B.bend[a] || 0) + "d"; }).join(" − ") : "") + " (d = " + d + ")";
      return { cut: r3(cut), f: f + " = " + mm(cut * 1000) + " mm" };
    },
    straight: function (d, L) { return { cut: r3(L / 1000), f: "straight " + mm(L) + " mm" }; },
    /* L-bar: run + one leg, one 90° bend */
    lbar: function (d, run, leg) { return B.shape(d, [run, leg], [90], 0, "L-bar"); },
    /* U-bar / bar with 90° legs at both ends */
    ubar: function (d, run, leg1, leg2) { return B.shape(d, [leg1, run, leg2 == null ? leg1 : leg2], [90, 90], 0, "U-bar"); },
    /* closed rectangular stirrup / tie: overall member size b × D (mm), clear cover c to the stirrup */
    stirrup: function (d, b, D, c) {
      var A = b - 2 * c, Bh = D - 2 * c, h = B.tie_hook(d);
      var b90 = B.cfg.bend90, b135 = B.cfg.bend135;
      var cut = (2 * (A + Bh) + 2 * h - 3 * b90 * d - 2 * b135 * d) / 1000;
      return { cut: r3(cut), f: "stirrup: 2×(" + mm(A) + " + " + mm(Bh) + ") + 2×" + mm(h) + " hook − 3×" + b90 + "d − 2×" + b135 + "d (d = " + d + ") = " + mm(cut * 1000) + " mm" };
    },
    /* circular hoop / ring of centre-line diameter Dc (mm) with a lap */
    ring: function (d, Dc, lap) { var cut = (Math.PI * Dc + lap) / 1000; return { cut: r3(cut), f: "ring: π×" + mm(Dc) + " + lap " + mm(lap) + " = " + mm(cut * 1000) + " mm" }; },
    /* bar with n cranks of height h (mm) */
    cranked: function (d, run, h, n, legs) {
      var add = n * (0.42 * h - 2 * B.cfg.bend45 * d), lg = legs || 0;
      var cut = (run + add + lg) / 1000;
      return { cut: r3(cut), f: "cranked: " + mm(run) + " + " + n + "×(0.42×" + mm(h) + " − 2d)" + (lg ? " + legs " + mm(lg) : "") + " (d = " + d + ") = " + mm(cut * 1000) + " mm" };
    },
    /* a bar longer than the 12 m stock length is made of `pieces` bars with laps between them:
       pieces = ceil((L − lap)/(12 − lap)); each piece = (L + (pieces − 1)·lap)/pieces. row() multiplies the count by pieces. */
    stock: function (o, d, fck, fy) {
      if (o.cut <= STOCK + 1e-9) return o;
      var lp = B.lap(d, fck, fy) / 1000, n = Math.ceil((o.cut - lp) / (STOCK - lp) - 1e-9), tot = o.cut + (n - 1) * lp;
      return { cut: r3(tot / n), pieces: n, laps: n - 1, f: o.f + " → " + n + " pieces with " + (n - 1) + " lap(s) × " + mm(lp * 1000) + ": (" + mm(o.cut * 1000) + " + " + (n - 1) + "×" + mm(lp * 1000) + ")/" + n + " = " + mm(tot / n * 1000) + " mm each" };
    },
    /* a long straight run (e.g. along a drain / barrel) cut into stock-length pieces with laps:
       pieces = ceil((L − lap)/(12 − lap)), cut = (L + (pieces − 1)·lap)/pieces */
    split: function (d, L, fck, fy) {
      if (L <= STOCK * 1000 + 1e-6) return { cut: r3(L / 1000), f: "straight " + mm(L) + " mm", pieces: 1 };
      var lp = B.lap(d, fck, fy), n = Math.ceil((L - lp) / (STOCK * 1000 - lp) - 1e-9), cut = (L + (n - 1) * lp) / n / 1000;
      return { cut: r3(cut), pieces: n, f: "run " + mm(L) + " in " + n + " pieces: (" + mm(L) + " + " + (n - 1) + "×lap " + mm(lp) + ")/" + n + " = " + mm(cut * 1000) + " mm" };
    },
    /* make a BBS row with the formula in the note */
    row: function (member, mark, d, shape, nos, o, note) {
      var pcs = o.pieces || 1;
      var r = DS.core.BBSRow({ member: member, mark: mark, dia: d, shape: shape + (pcs > 1 && !/lapped/.test(shape) ? ", lapped" : ""), nos: nos * pcs, cut_length: o.cut, note: (note || "") + (pcs > 1 ? (note ? ", " : "") + pcs + " pieces per bar line" : "") });
      r.formula = o.f; return r;
    },
    /* verification helpers used by the tests and the report */
    weight: function (r) { return r.nos * r.cut_length * r.dia * r.dia / 162; }
  };
})();
