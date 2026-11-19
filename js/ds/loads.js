/* Design Studio — loads (port of civilest/design/loads.py).
   IS 875 Part 2 (imposed), Part 3:2015 (wind), IS 1893 (Part 1):2016 (seismic), IRC 6:2017 vehicle loads & impact. */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var C = DS.core;
  var L = DS.loads = {};
  function kw(args, names, defs, nreq) { return DS.materials._kw(args, names, defs, nreq); }
  L.interp = C.interp;
  L.Calc = C.Calc;

  /* ------------------------------------------------------------------ IS 875 Part 2 – imposed loads (kN/m²) */
  L.LIVE_LOADS = {
    "Residential – rooms, kitchens, toilets": 2.0,
    "Residential – stairs, corridors, balconies": 3.0,
    "Office – rooms with separate storage": 2.5,
    "Office – rooms without separate storage": 4.0,
    "Office – corridors, stairs": 4.0,
    "Educational – classrooms": 3.0,
    "Educational – corridors, stairs": 4.0,
    "Hospital – wards, rooms": 2.0,
    "Hospital – OT, X-ray": 3.0,
    "Assembly – with fixed seats": 4.0,
    "Assembly – without fixed seats": 5.0,
    "Shops / retail": 4.0,
    "Industrial – light": 5.0,
    "Industrial – medium": 7.0,
    "Industrial – heavy": 10.0,
    "Storage – general (per m height 2.4)": 7.2,
    "Flat roof – access provided": 1.5,
    "Flat roof – access not provided": 0.75
  };

  /* roof_live_load(slope_deg, access = false) — IS 875-2 Table 2 */
  L.roof_live_load = function (slope_deg, access) {
    var p = kw(arguments, ["slope_deg", "access"], { access: false }, 1);
    slope_deg = p.slope_deg;
    if (p.access && slope_deg <= 10) return 1.5;
    if (slope_deg <= 10) return 0.75;
    return Math.max(0.75 - 0.02 * (slope_deg - 10), 0.40);
  };

  /* ------------------------------------------------------------------ IS 875 Part 3:2015 – wind */
  L.BASIC_WIND_SPEED = {  // Vb, m/s (IS 875-3 Annex A) – verify for your site
    "Agra": 47, "Ahmedabad": 39, "Ajmer": 47, "Allahabad (Prayagraj)": 47, "Amritsar": 47,
    "Asansol": 47, "Aurangabad": 39, "Bareilly": 47, "Bengaluru": 33, "Bhopal": 39,
    "Bhubaneswar": 50, "Bhuj": 50, "Bikaner": 47, "Chandigarh": 47, "Chennai": 50,
    "Coimbatore": 39, "Cuttack": 50, "Darbhanga": 55, "Dehradun": 47, "Delhi": 47,
    "Dhanbad": 47, "Gorakhpur": 47, "Guwahati": 50, "Gwalior": 47, "Hyderabad": 44,
    "Imphal": 47, "Indore": 39, "Jabalpur": 47, "Jaipur": 47, "Jamshedpur": 47, "Jhansi": 47,
    "Jodhpur": 47, "Kanpur": 47, "Kochi": 39, "Kolkata": 50, "Kozhikode": 39, "Lucknow": 47,
    "Ludhiana": 47, "Madurai": 39, "Mangaluru": 39, "Moradabad": 47, "Mumbai": 44,
    "Mysuru": 33, "Nagpur": 44, "Nainital": 47, "Nashik": 39, "Nellore": 50, "Panaji": 39,
    "Patna": 47, "Puducherry": 50, "Pune": 39, "Raipur": 39, "Rajkot": 39, "Ranchi": 39,
    "Roorkee": 39, "Rourkela": 39, "Shimla": 39, "Srinagar": 39, "Surat": 44,
    "Thiruvananthapuram": 39, "Tiruchirappalli": 47, "Udaipur": 39, "Vadodara": 44,
    "Varanasi": 47, "Vijayawada": 50, "Visakhapatnam": 50,
    // ADDITIVE (modules_shed): Bhilai is in IS 875-3 Annex A (39 m/s). Korba / Gevra / Bilaspur are NOT listed in Annex A;
    // 39 m/s read from the IS 875-3:2015 Fig. 1 basic wind speed map (central Chhattisgarh, same zone as Raipur) – verify.
    "Bhilai": 39, "Korba": 39, "Gevra (Korba)": 39, "Bilaspur (CG)": 39
  };

  // k2 – IS 875-3:2015 Table 2 (terrain category, height)
  L._K2_H = [10, 15, 20, 30, 50, 100, 150, 200];
  L._K2 = {
    1: [1.05, 1.09, 1.12, 1.15, 1.20, 1.26, 1.30, 1.32],
    2: [1.00, 1.05, 1.07, 1.12, 1.17, 1.24, 1.28, 1.30],
    3: [0.91, 0.97, 1.01, 1.06, 1.12, 1.20, 1.24, 1.27],
    4: [0.80, 0.80, 0.80, 0.97, 1.10, 1.20, 1.24, 1.27]
  };

  /* k2_factor(height_m, terrain) */
  L.k2_factor = function (height_m, terrain) {
    if (!(terrain in L._K2)) throw new Error("KeyError: " + terrain);
    return C.interp(Math.max(height_m, 10.0), L._K2_H, L._K2[terrain]);
  };

  /* ka_factor(area_m2) — IS 875-3:2015 Table 4 */
  L.ka_factor = function (area_m2) { return C.interp(area_m2, [10, 25, 100], [1.0, 0.9, 0.8]); };

  // Pitched roof Cpe, IS 875-3 Table 6 (duo-pitch): {h/w band: {α: (EF, GH, EG, FH)}}
  L._ROOF_CPE = {
    low: { 0: [-0.8, -0.4, -0.8, -0.4], 5: [-0.9, -0.4, -0.8, -0.4], 10: [-1.2, -0.4, -0.8, -0.6],
      20: [-0.4, -0.4, -0.7, -0.6], 30: [0.0, -0.4, -0.7, -0.6], 45: [0.3, -0.5, -0.7, -0.6],
      60: [0.7, -0.6, -0.7, -0.6] },
    mid: { 0: [-0.8, -0.6, -1.0, -0.6], 5: [-0.9, -0.6, -0.9, -0.6], 10: [-1.1, -0.6, -0.8, -0.6],
      20: [-0.7, -0.5, -0.8, -0.6], 30: [-0.2, -0.5, -0.8, -0.8], 45: [0.2, -0.5, -0.8, -0.8],
      60: [0.6, -0.5, -0.8, -0.8] }
  };

  /* roof_cpe(slope_deg, h_over_w) → {windward_0, leeward_0, roof_90_EG, roof_90_FH, band} */
  L.roof_cpe = function (slope_deg, h_over_w) {
    var band = h_over_w <= 0.5 ? "low" : "mid";
    var t = L._ROOF_CPE[band];
    var angles = Object.keys(t).map(Number).sort(function (a, b) { return a - b; });
    var vals = [0, 1, 2, 3].map(function (i) { return C.interp(Math.min(slope_deg, 60), angles, angles.map(function (a) { return t[a][i]; })); });
    return { windward_0: vals[0], leeward_0: vals[1], roof_90_EG: vals[2], roof_90_FH: vals[3],
      band: band === "low" ? "h/w ≤ 1/2" : "1/2 < h/w ≤ 3/2" };
  };

  /* wall_cpe(h_over_w, l_over_w) → {A, B, C} — IS 875-3 Table 5 */
  L.wall_cpe = function (h_over_w, l_over_w) {
    if (h_over_w <= 0.5) return { A: 0.7, B: l_over_w <= 1.5 ? -0.2 : -0.25, C: l_over_w <= 1.5 ? -0.5 : -0.6 };
    return { A: 0.7, B: l_over_w <= 1.5 ? -0.25 : -0.3, C: l_over_w <= 1.5 ? -0.6 : -0.7 };
  };

  L.CPI = { "Low permeability (openings < 5 %)": 0.2, "Medium (5–20 %)": 0.5, "Large openings (> 20 %)": 0.7 };

  /* design_wind_pressure(c, Vb, height, terrain, k1 = 1, k3 = 1, k4 = 1, area = 100, Kd = 0.9, Kc = 0.9[, opts])
     Records the IS 875-3:2015 chain and returns pd in kN/m². */
  L.design_wind_pressure = function (c, Vb, height, terrain, k1, k3, k4, area, Kd, Kc) {
    var p = kw(arguments, ["c", "Vb", "height", "terrain", "k1", "k3", "k4", "area", "Kd", "Kc"],
      { k1: 1.0, k3: 1.0, k4: 1.0, area: 100.0, Kd: 0.9, Kc: 0.9 }, 4);
    c = p.c; Vb = p.Vb; height = p.height; terrain = p.terrain;
    c.let("Basic wind speed", "Vb", Vb, "m/s", "IS 875-3 Annex A");
    var k2 = c.calc("Terrain & height factor", "k2", "k2v", "", "IS 875-3 Table 2",
      "terrain category " + C.pystr(terrain) + ", h = " + C.pyfmt(height, ".2f") + " m", { k2v: L.k2_factor(height, terrain) });
    var Vz = c.calc("Design wind speed", "Vz", "Vb*k1*k2*k3*k4", "m/s", "IS 875-3 cl 6.3",
      { Vb: Vb, k1: p.k1, k2: k2, k3: p.k3, k4: p.k4 });
    var pz = c.calc("Wind pressure", "pz", "0.6*Vz**2/1000", "kN/m²", "IS 875-3 cl 7.2", { Vz: Vz });
    var Ka = c.calc("Area averaging factor", "Ka", "kav", "", "IS 875-3 Table 4",
      "tributary area " + C.pyfmt(p.area, ".1f") + " m²", { kav: L.ka_factor(p.area) });
    var pd = c.calc("Design wind pressure", "pd", "max(Kd*Ka*Kc*pz, 0.7*pz)", "kN/m²", "IS 875-3 cl 7.2",
      "pd not less than 0.7 pz", { Kd: p.Kd, Ka: Ka, Kc: p.Kc, pz: pz });
    return pd;
  };

  /* ------------------------------------------------------------------ IS 1893 (Part 1):2016 – seismic */
  L.ZONE_Z = { "II": 0.10, "III": 0.16, "IV": 0.24, "V": 0.36 };

  /* sa_by_g(T, soil, static_method = false) — IS 1893-1:2016 cl 6.4.2(a).
     The 1 + 15T branch (T < 0.1 s) applies to the response spectrum method only; for the equivalent static method
     (static_method = true) Sa/g = 2.5 for T < 0.1 s on all soil types (cl 6.4.2(a), Fig. 2(a)). */
  L.sa_by_g = function (T, soil, static_method) {
    if (static_method && T < 0.10) return 2.5;
    if (soil === "I (rock / hard)") {
      if (T < 0.10) return 1 + 15 * T;
      if (T <= 0.40) return 2.5;
      if (T <= 4.0) return 1.0 / T;
      return 0.25;
    }
    if (soil === "II (medium)") {
      if (T < 0.10) return 1 + 15 * T;
      if (T <= 0.55) return 2.5;
      if (T <= 4.0) return 1.36 / T;
      return 0.34;
    }
    if (T < 0.10) return 1 + 15 * T;
    if (T <= 0.67) return 2.5;
    if (T <= 4.0) return 1.67 / T;
    return 0.42;
  };

  L.SOILS = ["I (rock / hard)", "II (medium)", "III (soft)"];
  L.R_FACTOR = { "RC OMRF (ordinary moment resisting frame)": 3.0, "RC SMRF (special MRF, IS 13920 detailing)": 5.0,
    "Steel OMRF": 3.0, "Steel SMRF": 5.0 };
  L.IMPORTANCE = { "Ordinary buildings": 1.0, "Residential/commercial > 200 occupants": 1.2,
    "Important (hospital, school, emergency, lifeline)": 1.5 };

  /* ------------------------------------------------------------------ IRC 6:2017 vehicle loads */
  // axle loads (kN) from front, spacing (m) between consecutive axles
  // NOTE: `contact` has integer keys; JS iterates them ascending (27, 68, 114) — look up by key only.
  L.CLASS_A = { axles: [27, 27, 114, 114, 68, 68, 68, 68], spacing: [1.1, 3.2, 1.2, 4.3, 3.0, 3.0, 3.0],
    wheel_gauge: 1.8, width: 2.3,
    contact: { 27: [0.25, 0.15], 114: [0.50, 0.25], 68: [0.38, 0.20] } };  // (b across, l along) m
  L.CLASS_70R_WHEELED = { axles: [80, 120, 120, 170, 170, 170, 170],
    spacing: [3.96, 1.52, 2.13, 1.37, 3.05, 1.37], width: 2.79 };
  L.CLASS_70R_TRACKED = { load: 700.0, length: 4.57, track_width: 0.84, track_cc: 2.06, width: 2.90 };

  /* impact_class_a(span, material = "RCC") — IRC 6 cl 208.2 */
  L.impact_class_a = function (span, material) {
    var p = kw(arguments, ["span", "material"], { material: "RCC" }, 1);
    return p.material === "RCC" ? 4.5 / (6 + p.span) : 9.0 / (13.5 + p.span);
  };

  /* impact_70r_tracked(span) — IRC 6 cl 208.3 */
  L.impact_70r_tracked = function (span) {
    if (span <= 5) return 0.25;
    if (span < 9) return 0.25 - (span - 5) * 0.15 / 4;
    return 0.10;
  };

  /* impact_70r_wheeled(span, material = "RCC") — IRC 6 cl 208.3 */
  L.impact_70r_wheeled = function (span, material) {
    var p = kw(arguments, ["span", "material"], { material: "RCC" }, 1);
    if (p.span < 12) return 0.25;
    return L.impact_class_a(p.span, p.material);
  };

  /* max_moment_moving(axles, spacing, span, step = 0.05) → [best_m (kN·m), best_v (kN)] */
  L.max_moment_moving = function (axles, spacing, span, step) {
    var p = kw(arguments, ["axles", "spacing", "span", "step"], { step: 0.05 }, 3);
    axles = p.axles; spacing = p.spacing; span = p.span; step = p.step;
    var pos0 = [0.0];
    spacing.forEach(function (s) { pos0.push(pos0[pos0.length - 1] + s); });
    var best_m = 0.0, best_v = 0.0, total_len = pos0[pos0.length - 1];
    [1, -1].forEach(function (direction) {
      var p0 = pos0.map(function (q) { return direction === 1 ? q : total_len - q; });
      var x = -total_len;
      var n = Math.min(p0.length, axles.length);
      while (x <= span + total_len) {
        var loads = [];
        for (var i = 0; i < n; i++) { var a = x + p0[i]; if (0 <= a && a <= span) loads.push([a, axles[i]]); }
        if (loads.length) {
          var Ra = 0;
          loads.forEach(function (l) { Ra += l[1] * (span - l[0]); });
          Ra = Ra / span;
          best_v = Math.max(best_v, Ra);
          loads.forEach(function (lc) {                    // max moment occurs under a load
            var a_cut = lc[0], s = 0;
            loads.forEach(function (l) { if (l[0] < a_cut) s += l[1] * (a_cut - l[0]); });
            var m = Ra * a_cut - s;
            best_m = Math.max(best_m, m);
          });
        }
        x += step;
      }
    });
    return [best_m, best_v];
  };

  /* ================================================================== culvert loading data (additive) */
  /* IRC 6:2017 cl 204.1 / Fig. 1 — tracked vehicles and the 70R bogie (contact in m: b across, l along travel). */
  L.CLASS_AA_TRACKED = { load: 700.0, length: 3.60, track_width: 0.85, track_cc: 2.05, width: 2.85 };
  L.CLASS_70R_BOGIE = { axles: [200, 200], spacing: [1.22], wheel_cc: 1.93, contact: [0.86, 0.36] };   // 2 × 20 t; contact approximate
  L.CLASS_70R_WHEELED_TRACK = { wheel_cc: 1.93, contact: [0.86, 0.36] };                              // approximate – verify IRC 6 Fig. 1

  /* IRS Bridge Rules (RDSO) — railway loading for culverts.
     axle_kN: max axle; pipe_tpm: cl 2.3.? intensity for pipes with cushion ≥ 600 mm (t/m along track);
     train: idealised axle train [loads kN], [spacings m] — APPROXIMATE (loco Co-Co bogies ≈ 1.85 m, wagon bogies 2.0 m,
     wagon length 10.72 m consistent with trailing load) — verify with Bridge Rules Appendix (EUDL tables). */
  L.IRS = {
    "25t-2008": { name: "IRS 25 t loading-2008 (BG)", axle_kN: 245.25, pipe_tpm: 13.70, trail_kNpm: 91.53, line_a: 1.85,
      loads: [245.25, 245.25, 245.25, 245.25, 245.25, 245.25, 245.25, 245.25, 245.25, 245.25, 245.25, 245.25, 245.25, 245.25],
      spacing: [1.85, 1.85, 6.0, 1.85, 1.85, 4.0, 2.0, 4.72, 2.0, 2.0, 2.0, 4.72, 2.0] },
    "DFC-32.5t": { name: "IRS DFC loading – 32.5 t axle (BG)", axle_kN: 318.825, pipe_tpm: 16.25, trail_kNpm: 118.99, line_a: 2.0,
      loads: [245.25, 245.25, 245.25, 245.25, 245.25, 245.25, 318.825, 318.825, 318.825, 318.825, 318.825, 318.825, 318.825, 318.825],
      spacing: [1.85, 1.85, 6.0, 1.85, 1.85, 4.0, 2.0, 4.72, 2.0, 2.0, 2.0, 4.72, 2.0] },
    sleeper: { length: 2.745, width: 0.254, spacing: 0.60, track_cc: 5.3 }
  };

  /* cda_irs(L, d) — IRS Bridge Rules cl 2.4.1.1 / 2.4.2: CDA0 = 0.15 + 8/(6+L) ≤ 1.0;
     d = depth of fill from underside of sleeper (incl. ballast) to top of slab:
     d < 0.9: CDA0·(2 − d/0.9)/2 ; d ≥ 0.9: min(CDA0/2, 0.5) reduced uniformly to 0 at d = 3.9 m. */
  L.cda_irs = function (Lspan, d) {
    var c0 = Math.min(0.15 + 8 / (6 + Lspan), 1.0);
    if (d < 0.9) return c0 * (2 - d / 0.9) / 2;
    return Math.max(Math.min(c0 / 2, 0.5) * (1 - (d - 0.9) / 3.0), 0.0);
  };

  /* impact_dumper(z) — haul-road dynamic allowance [engineering judgement]: 0.30 for z ≤ 0.3 m, linear to 0.10 at 2.4 m, 0.10 min. */
  L.impact_dumper = function (z) {
    if (z <= 0.3) return 0.30;
    if (z < 2.4) return 0.30 - 0.20 * (z - 0.3) / 2.1;
    return 0.10;
  };

  /* Mine dump trucks (loaded). gvw t, f = loaded front-axle fraction, wb wheelbase m, Tf front track, Tr rear dual-pair centre
     track, s dual c/c, b tyre width, p tyre pressure kPa. approx = geometry not verified from a data sheet. */
  L.DUMPERS = {
    "BEML BH35-2 (60 t)": { gvw: 59.56, f: 0.33, wb: 4.0, Tf: 2.7, Tr: 2.6, s: 0.60, b: 0.50, p: 650, approx: true },
    "BEML BH60M (98 t)": { gvw: 98.0, f: 0.34, wb: 4.3, Tf: 3.3, Tr: 3.2, s: 0.75, b: 0.65, p: 650, approx: true },
    "BEML BH100 (165 t)": { gvw: 165.0, f: 0.33, wb: 4.95, Tf: 4.0, Tr: 3.8, s: 0.85, b: 0.69, p: 650, approx: true },
    "Komatsu HD785-7 (164 t)": { gvw: 163.8, f: 0.314, wb: 4.95, Tf: 4.0, Tr: 3.8, s: 0.85, b: 0.69, p: 650, approx: true },
    "CAT 777G (164 t)": { gvw: 164.0, f: 0.333, wb: 4.56, Tf: 4.0, Tr: 3.8, s: 0.85, b: 0.69, p: 650, approx: true },
    "BEML BH150E (240 t)": { gvw: 240.0, f: 0.33, wb: 5.18, Tf: 4.4, Tr: 4.285, s: 1.05, b: 0.85, p: 650, approx: true },
    "CAT 785 (250 t)": { gvw: 249.5, f: 0.326, wb: 5.18, Tf: 4.87, Tr: 4.285, s: 1.05, b: 0.85, p: 650, approx: false },
    "CAT 793F (386 t)": { gvw: 386.0, f: 0.33, wb: 5.9, Tf: 5.4, Tr: 5.2, s: 1.25, b: 1.02, p: 650, approx: true }
  };

  /* dumper_min_cushion(gvw_t) / dumper_min_slab(gvw_t, span) — haul-road culvert practice minima [GP] (m) */
  L.dumper_min_cushion = function (gvw) { return gvw <= 30 ? 0.6 : gvw <= 60 ? 1.0 : gvw <= 120 ? 1.2 : gvw <= 240 ? 1.5 : 2.0; };
  L.dumper_min_slab = function (gvw, span) {
    var t = gvw <= 30 ? [0.20, 0.25] : gvw <= 60 ? [0.30, 0.35] : gvw <= 120 ? [0.35, 0.45] : gvw <= 240 ? [0.40, 0.50] : [0.45, 0.60];
    return span <= 3.0 ? t[0] : t[1];
  };
})();
