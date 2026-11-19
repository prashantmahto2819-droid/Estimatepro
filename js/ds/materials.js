/* Design Studio — materials (port of civilest/design/materials.py).
   Material properties and code tables (IS 456:2000, IS 800:2007, IS 1786, IS 3370).
   Values are the commonly tabulated ones; each table names its clause so it can be verified. */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var C = DS.core;
  var M = DS.materials = {};

  /* Shared helper for ported modules: resolve Python-style positional + keyword args.
     names: parameter names in Python order; defs: {name: default}; nreq: number of required params.
     A trailing plain object beyond the required params is taken as the keyword-options object. */
  function isPlain(v) { return v != null && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype; }
  M._kw = function (args, names, defs, nreq) {
    var a = Array.prototype.slice.call(args), o = {};
    if (a.length > nreq && isPlain(a[a.length - 1])) o = a.pop();
    var r = {};
    for (var i = 0; i < names.length; i++) {
      var n = names[i], v = i < a.length ? a[i] : undefined;
      if (v === undefined && Object.prototype.hasOwnProperty.call(o, n)) v = o[n];
      if (v === undefined) v = defs ? defs[n] : undefined;
      r[n] = v;
    }
    return r;
  };
  function kw(args, names, defs, nreq) { return M._kw(args, names, defs, nreq); }

  /* ------------------------------------------------------------------ concrete (IS 456:2000) */
  M.CONCRETE_GRADES = ["M15", "M20", "M25", "M30", "M35", "M40", "M45", "M50"];

  /* fck(grade) → N/mm² */
  M.fck = function (grade) { return Number(String(grade).toUpperCase().replace(/^M+/, "")); };

  /* Ec(fck_) — short-term modulus, IS 456 cl 6.2.3.1: 5000√fck (N/mm²) */
  M.Ec = function (fck_) { return 5000 * Math.sqrt(fck_); };

  // Design bond stress τbd for plain bars in tension, IS 456 cl 26.2.1.1 (N/mm²)
  M.TAU_BD_PLAIN = { 15: 1.0, 20: 1.2, 25: 1.4, 30: 1.5, 35: 1.7, 40: 1.9, 45: 1.9, 50: 1.9 };

  function gradeKey(table, fck_) {
    var keys = Object.keys(table).map(Number).sort(function (x, y) { return x - y; });
    var le = keys.filter(function (g) { return g <= fck_; });
    if (!le.length) le = [keys[0]];
    return Math.max.apply(null, le);
  }

  /* tau_bd(fck_, deformed = true, compression = false) — +60 % deformed, +25 % compression (cl 26.2.1.1) */
  M.tau_bd = function (fck_, deformed, compression) {
    var p = kw(arguments, ["fck_", "deformed", "compression"], { deformed: true, compression: false }, 1);
    var t = M.TAU_BD_PLAIN[gradeKey(M.TAU_BD_PLAIN, p.fck_)];
    if (p.deformed) t *= 1.6;
    if (p.compression) t *= 1.25;
    return t;
  };

  // Maximum shear stress τc,max, IS 456 Table 20 (N/mm²)
  M.TAU_C_MAX = { 15: 2.5, 20: 2.8, 25: 3.1, 30: 3.5, 35: 3.7, 40: 4.0, 45: 4.0, 50: 4.0 };

  /* tau_c_max(fck_) */
  M.tau_c_max = function (fck_) { return M.TAU_C_MAX[gradeKey(M.TAU_C_MAX, fck_)]; };

  /* tau_c(pt, fck_) — IS 456 Table 19 closed form (SP 16); pt in % limited 0.15…3.0, fck capped at 40 */
  M.tau_c = function (pt, fck_) {
    var f = Math.min(fck_, 40.0);
    var p = Math.min(Math.max(pt, 0.15), 3.0);
    var beta = Math.max(0.8 * f / (6.89 * p), 1.0);
    return 0.85 * Math.sqrt(0.8 * f) * (Math.sqrt(1 + 5 * beta) - 1) / (6 * beta);
  };

  /* k_slab(D_mm) — shear enhancement factor k for solid slabs, IS 456 cl 40.2.1.1 */
  M.k_slab = function (D_mm) {
    return D_mm > 150 ? C.interp(D_mm, [150, 175, 200, 225, 250, 275, 300], [1.30, 1.25, 1.20, 1.15, 1.10, 1.05, 1.00]) : 1.30;
  };

  // Exposure → nominal cover (Table 16) and minimum grade (Table 5, RCC)
  M.EXPOSURE = {
    "Mild": { cover: 20, min_grade: 20, max_wc: 0.55 },
    "Moderate": { cover: 30, min_grade: 25, max_wc: 0.50 },
    "Severe": { cover: 45, min_grade: 30, max_wc: 0.45 },
    "Very severe": { cover: 50, min_grade: 35, max_wc: 0.45 },
    "Extreme": { cover: 75, min_grade: 40, max_wc: 0.40 }
  };

  /* ------------------------------------------------------------------ reinforcement (IS 1786) */
  M.REBAR_GRADES = { "Fe415": 415.0, "Fe500": 500.0, "Fe550": 550.0, "Fe250 (mild steel)": 250.0 };
  M.BAR_DIAS = [8, 10, 12, 16, 20, 25, 32];
  M.ES = 200000.0;

  /* fy(grade) */
  M.fy = function (grade) { if (!(grade in M.REBAR_GRADES)) throw new Error("KeyError: " + grade); return M.REBAR_GRADES[grade]; };

  /* bar_area(d) → mm² */
  M.bar_area = function (d) { return Math.PI * d * d / 4; };

  /* xu_max_ratio(fy_) — IS 456 cl 38.1 note: 0.0035/(0.0055 + 0.87fy/Es) */
  M.xu_max_ratio = function (fy_) { return 0.0035 / (0.0055 + 0.87 * fy_ / M.ES); };

  /* mu_lim_coeff(fy_) — Mu,lim/(fck b d²) = 0.36 k (1 − 0.416 k) */
  M.mu_lim_coeff = function (fy_) { var k = M.xu_max_ratio(fy_); return 0.36 * k * (1 - 0.416 * k); };

  /* steel_stress(strain, fy_) — IS 456 Fig. 23 design stress–strain curve */
  M.steel_stress = function (strain, fy_) {
    var ES = M.ES, e = Math.abs(strain), fyd = 0.87 * fy_, sgn = strain >= 0 ? 1 : -1;
    if (fy_ <= 250) return sgn * Math.min(e * ES, fyd);
    var pts_s = [0.0, 0.80 * fyd, 0.85 * fyd, 0.90 * fyd, 0.95 * fyd, 0.975 * fyd, 1.0 * fyd];
    var pts_e = [0.0, 0.80 * fyd / ES, 0.85 * fyd / ES + 0.0001, 0.90 * fyd / ES + 0.0003,
      0.95 * fyd / ES + 0.0007, 0.975 * fyd / ES + 0.0010, fyd / ES + 0.0020];
    if (e >= pts_e[pts_e.length - 1]) return sgn * fyd;
    return sgn * C.interp(e, pts_e, pts_s);
  };

  /* fsc_compression(strain, fy_) */
  M.fsc_compression = function (strain, fy_) { return M.steel_stress(strain, fy_); };

  /* ------------------------------------------------------------------ structural steel (IS 800:2007) */
  M.STEEL_GRADES = { "E250 (IS 2062)": [250.0, 410.0], "E300 (IS 2062)": [300.0, 440.0],
    "E350 (IS 2062)": [350.0, 490.0], "E410 (IS 2062)": [410.0, 540.0] };
  M.E_STEEL = 200000.0;
  M.G_STEEL = 76900.0;
  M.GAMMA_M0 = 1.10;
  M.GAMMA_M1 = 1.25;
  M.GAMMA_MB = 1.25;
  M.GAMMA_MW_SHOP = 1.25;
  M.GAMMA_MW_FIELD = 1.50;

  M.BOLT_GRADES = { "4.6": [400.0, 240.0], "5.6": [500.0, 300.0], "8.8": [800.0, 640.0], "10.9": [1000.0, 900.0] };

  /* ------------------------------------------------------------------ unit weights (IS 875 Part 1) kN/m³ */
  M.UNIT_WT = { "RCC": 25.0, "PCC": 24.0, "Brick masonry": 20.0, "Stone masonry": 24.0, "Steel": 78.5,
    "Earth (fill)": 18.0, "Water": 10.0, "Bituminous wearing coat": 22.0, "Cement plaster": 20.4 };
})();
