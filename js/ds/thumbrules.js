/* Design Studio — thumbrules (port of civilest/design/thumbrules.py).
   Curated thumb rules used by Indian site / estimation engineers (indicative – always verify by design). */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var T = DS.thumbrules = {};

  // (category, item, rule of thumb, typical value, source)
  T.THUMB_RULES = [
    ["RCC sizing", "Slab thickness (two-way)", "short span / 35 (+ cover)", "100–150 mm", "IS 456 cl 24.1 practice"],
    ["RCC sizing", "Slab thickness (one-way)", "span / 28 simply supported, / 32 continuous", "", "IS 456 cl 23.2"],
    ["RCC sizing", "Beam depth", "span / 12 (SS), / 15 (continuous), / 6 (cantilever)", "450 mm for 5 m", "Practice"],
    ["RCC sizing", "Beam width", "D / 2 to D / 1.5, ≥ wall thickness", "230–300 mm", "Practice"],
    ["RCC sizing", "Column size", "Ag ≈ Pu / (0.4 fck + 0.0067 fy) at 1 % steel", "230×450 for G+2", "IS 456 cl 39.3"],
    ["RCC sizing", "Footing area", "1.1 × P / SBC", "", "IS 456 cl 34"],
    ["RCC sizing", "Footing depth", "projection / 2.5, ≥ 300 mm", "", "Practice"],
    ["RCC sizing", "Staircase waist", "effective span / 20 + cover", "150–200 mm", "Practice"],
    ["Steel ratio", "Slab", "0.7–1.0 % of concrete volume", "80–100 kg/m³", "Estimator practice"],
    ["Steel ratio", "Beam", "1–2 %", "120–160 kg/m³", "Estimator practice"],
    ["Steel ratio", "Column", "1–2.5 %", "160–220 kg/m³", "Estimator practice"],
    ["Steel ratio", "Footing", "0.5–0.8 %", "60–80 kg/m³", "Estimator practice"],
    ["Steel ratio", "Lintel / chajja", "", "60–80 kg/m³", "Estimator practice"],
    ["Steel ratio", "Building (overall)", "", "3.5–4.5 kg/ft² of built-up area", "Estimator practice"],
    ["Materials", "Cement in M20 (nominal 1:1.5:3)", "dry volume = 1.54 × wet", "≈ 8 bags / m³", "IS 456 / practice"],
    ["Materials", "Cement in M15 (1:2:4)", "", "≈ 6.4 bags / m³", "Practice"],
    ["Materials", "Cement in PCC 1:4:8", "", "≈ 3.4 bags / m³", "Practice"],
    ["Materials", "Bricks (modular 190×90×90)", "with 10 mm joints", "≈ 500 nos / m³", "IS 1077"],
    ["Materials", "Bricks (FPS 230×110×75)", "", "≈ 480–500 nos / m³", "Practice"],
    ["Materials", "Cement mortar 1:6 in brickwork", "", "≈ 0.25–0.30 m³ / m³ of brickwork", "Practice"],
    ["Materials", "12 mm plaster 1:6", "", "≈ 0.15 bag cement / m²", "Practice"],
    ["Materials", "Shuttering in RCC building", "", "≈ 7–9 m² per m³ of concrete", "Practice"],
    ["Materials", "Paint coverage (emulsion)", "per coat", "≈ 10–12 m² / litre", "Manufacturers"],
    ["Steel structures", "Portal rafter depth", "span / 40 (prismatic hot-rolled)", "", "INSDAG"],
    ["Steel structures", "Purlin depth", "purlin span / 45", "ISMC 100–150", "Duggal"],
    ["Steel structures", "Truss rise", "span / 4 to span / 5", "", "IS 875-3 practice"],
    ["Steel structures", "Truss self-weight", "(L/3 + 5) × 10 N/m² of plan", "", "Duggal"],
    ["Steel structures", "Steel consumption – PEB", "", "20–30 kg/m² plan", "Industry"],
    ["Steel structures", "Steel consumption – conventional truss shed", "", "30–40 kg/m² plan", "Industry"],
    ["Roads & drains", "Bituminous pavement total (CBR 8, 20–50 msa)", "", "≈ 550–650 mm", "IRC 37 catalogue trend"],
    ["Roads & drains", "Drain wall thickness", "H / 10 + 50 mm, ≥ 150", "", "Practice"],
    ["Roads & drains", "Box culvert top slab", "span / 12 + 50 mm", "", "IRC SP-13 practice"],
    ["Roads & drains", "Retaining wall base width", "0.5–0.6 × height", "", "Punmia"],
    ["Roads & drains", "Pipe culvert", "minimum 900 mm dia, cushion ≥ 600 mm", "", "IRC SP-13"],
    ["Bridges", "Solid slab deck depth", "span / 12 to span / 15", "", "MoRTH standard plans"],
    ["Bridges", "T-beam girder depth", "span / 10 to span / 12", "", "Victor"],
    ["Bridges", "T-beam girder spacing", "", "2.0–3.0 m", "Practice"],
    ["Cost", "RCC framed building (civil, without finishes)", "", "region-specific – use your own data", "—"]
  ];

  /* table() → {columns, rows} (pandas.DataFrame replacement) */
  T.table = function () {
    return DS.core.table(T.THUMB_RULES, ["Category", "Item", "Rule of thumb", "Typical value", "Source"]);
  };
})();
