/* Estimate Pro — unit engine (one registry for drawing, modelling, quantities, estimate and export).
   Every quantity has a dimension: L (length), A (area), V (volume), M (mass), ANG (angle), N (count).
   Base units: mm for length (all CAD / model geometry is stored in mm), mm² / mm³ derived, kg, radian.
   * EP.units.conv(value, from, to)      — converts between units of the same dimension (throws on mismatch)
   * EP.units.rateConv(rate, from, to)   — converts a rate per unit (inverse of the quantity conversion)
   * EP.units.fmtLen(mm, unit, prec)      — formats a model length for display (ft-in as 12'-6 1/2")
   * EP.units.parseLen(text, unit)        — reads a typed length (12'6", 3.5m, 1200, 4' 3-1/4") → mm
   * EP.units.fromSor(unit)               — maps an SOR unit text (cum, sqm, rmt, kg, tonne, each…) to a registry unit
   Mass and volume are never converted into each other without a density (EP.units.massFromVol). */
(function () {
  "use strict";
  var EP = window.EP = window.EP || {};
  var R = {};                      // unit id → { dim, f (factor to base), label, sym, aliases }
  function add(id, dim, f, label, sym, aliases) { R[id] = { id: id, dim: dim, f: f, label: label, sym: sym || id }; (aliases || []).forEach(function (a) { ALIAS[a.toLowerCase()] = id; }); ALIAS[id.toLowerCase()] = id; }
  var ALIAS = {};
  var IN = 25.4, FT = 304.8, YD = 914.4, MI = 1609344;
  // length (base mm)
  add("mm", "L", 1, "millimetre", "mm", ["millimetre", "millimeter"]);
  add("cm", "L", 10, "centimetre", "cm", ["centimetre", "centimeter"]);
  add("m", "L", 1000, "metre", "m", ["metre", "meter", "mtr", "rm", "rmt", "r.m.", "rmtr", "running metre", "running meter", "lm"]);
  add("km", "L", 1e6, "kilometre", "km", ["kilometre", "kilometer"]);
  add("in", "L", IN, "inch", "in", ["inch", "inches", "\""]);
  add("ft", "L", FT, "foot", "ft", ["foot", "feet", "'", "rft", "r.ft", "running feet"]);
  add("yd", "L", YD, "yard", "yd", ["yard", "yards"]);
  add("mi", "L", MI, "mile", "mi", ["mile", "miles"]);
  add("ftin", "L", FT, "feet-inches", "ft-in", ["ft-in", "feet-inch", "feet-inches"]);
  add("100m", "L", 1e5, "100 metres", "100 m", ["100 m", "100 metre", "100 rm"]);
  // area (base mm²)
  add("mm2", "A", 1, "square millimetre", "mm²", ["sqmm", "mm²", "sq mm"]);
  add("cm2", "A", 100, "square centimetre", "cm²", ["sqcm", "cm²", "sq cm"]);
  add("m2", "A", 1e6, "square metre", "m²", ["sqm", "sq.m", "sq.m.", "sq m", "m²", "sqmt", "sq. m", "sq.mtr", "sqmtr", "square metre", "square meter"]);
  add("10m2", "A", 1e7, "10 square metres", "10 m²", ["10 sqm", "10 sq.m", "10sqm"]);
  add("100m2", "A", 1e8, "100 square metres", "100 m²", ["100 sqm", "100 sq.m", "100sqm"]);
  add("ft2", "A", FT * FT, "square foot", "ft²", ["sqft", "sq.ft", "sq ft", "sft", "ft²", "square feet"]);
  add("in2", "A", IN * IN, "square inch", "in²", ["sqin", "sq in", "in²"]);
  add("yd2", "A", YD * YD, "square yard", "yd²", ["sqyd", "sq yd", "yd²", "sq.yd", "gaj", "sq gaj"]);
  add("100ft2", "A", 100 * FT * FT, "100 square feet", "100 ft²", ["100 sqft", "100 sq.ft", "100sqft"]);
  add("decimal", "A", 40.468564224e6, "decimal (1/100 acre)", "decimal", ["decimal", "dismil", "cent"]);
  add("guntha", "A", 101.17141056e6, "guntha (1/40 acre)", "guntha", ["guntha", "gunta"]);
  add("acre", "A", 4046.8564224e6, "acre", "acre", ["acres"]);
  add("ha", "A", 1e10, "hectare", "ha", ["hectare", "hectares"]);
  add("km2", "A", 1e12, "square kilometre", "km²", ["sqkm", "km²"]);
  // volume (base mm³)
  add("cm3", "V", 1e3, "cubic centimetre", "cm³", ["cc", "cm³", "cucm"]);
  add("l", "V", 1e6, "litre", "L", ["litre", "liter", "ltr", "lit", "litres"]);
  add("kl", "V", 1e9, "kilolitre", "kL", ["kilolitre", "kiloliter"]);
  add("m3", "V", 1e9, "cubic metre", "m³", ["cum", "cu.m", "cu.m.", "cu m", "m³", "cubic metre", "cubic meter", "cumt"]);
  add("10m3", "V", 1e10, "10 cubic metres", "10 m³", ["10 cum", "10cum"]);
  add("ft3", "V", FT * FT * FT, "cubic foot", "ft³", ["cft", "cu.ft", "cu ft", "ft³", "cubic feet"]);
  add("100ft3", "V", 100 * FT * FT * FT, "100 cubic feet", "100 ft³", ["100 cft", "100cft"]);
  add("brass", "V", 100 * FT * FT * FT, "brass (100 cubic feet)", "brass", ["brass"]);
  add("yd3", "V", YD * YD * YD, "cubic yard", "yd³", ["cuyd", "cu yd", "yd³"]);
  // mass (base kg)
  add("mg", "M", 1e-6, "milligram", "mg", ["milligram"]);
  add("g", "M", 1e-3, "gram", "g", ["gram", "gm", "grams"]);
  add("kg", "M", 1, "kilogram", "kg", ["kilogram", "kgs", "kilo"]);
  add("q", "M", 100, "quintal", "quintal", ["quintal", "qtl"]);
  add("t", "M", 1000, "metric tonne", "t", ["tonne", "tonnes", "ton", "mt", "metric ton", "m.t."]);
  add("lb", "M", 0.45359237, "pound", "lb", ["pound", "pounds", "lbs"]);
  // angle (base radian)
  add("rad", "ANG", 1, "radian", "rad", ["radian", "radians"]);
  add("deg", "ANG", Math.PI / 180, "degree", "°", ["degree", "degrees", "°"]);
  // count
  add("nos", "N", 1, "number", "nos", ["no", "no.", "nos.", "number", "each", "pcs", "piece", "pieces", "set", "job", "point", "unit", "bag", "bags"]);
  add("dozen", "N", 12, "dozen", "dozen", ["dozen", "doz"]);
  add("100nos", "N", 100, "100 numbers", "100 nos", ["100 nos", "100 no"]);
  add("1000nos", "N", 1000, "1000 numbers", "1000 nos", ["1000 nos", "1000 no"]);

  function get(u) { if (!u) return null; if (R[u]) return R[u]; var k = String(u).toLowerCase().replace(/\s+/g, " ").trim().replace(/\.$/, ""); return R[ALIAS[k]] || R[ALIAS[k.replace(/\s/g, "")]] || null; }
  function conv(v, from, to) {
    var a = get(from), b = get(to);
    if (!a || !b) throw new Error("Unknown unit: " + (!a ? from : to));
    if (a.dim !== b.dim) throw new Error("Cannot convert " + a.label + " to " + b.label + " (different kinds of quantity)");
    return v * a.f / b.f;
  }
  function rateConv(rate, from, to) { return rate / conv(1, from, to); }
  function canConv(from, to) { var a = get(from), b = get(to); return !!(a && b && a.dim === b.dim); }
  /* length ↔ area / volume of the same system: unit of length → its square / cube */
  var POW = { mm: ["mm2", null], cm: ["cm2", "cm3"], m: ["m2", "m3"], km: ["km2", null], in: ["in2", null], ft: ["ft2", "ft3"], ftin: ["ft2", "ft3"], yd: ["yd2", "yd3"] };
  function areaUnit(len) { return (POW[len] || POW.m)[0]; }
  function volUnit(len) { return (POW[len] || POW.m)[1] || "m3"; }
  function massFromVol(vol, volUnitId, density) {         // density in kg/m³ — must be given
    if (!(density > 0)) throw new Error("A density (kg/m³) is needed to turn a volume into a weight");
    return conv(vol, volUnitId, "m3") * density;
  }

  /* ----- display & typed input of lengths ----- */
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  function fmtFtIn(mm, den) {
    den = den || 16; var neg = mm < 0, tin = Math.abs(mm) / IN, totalDen = Math.round(tin * den);
    var ft = Math.floor(totalDen / (12 * den)), rem = totalDen - ft * 12 * den, inch = Math.floor(rem / den), fr = rem - inch * den, s = "";
    if (fr) { var g = gcd(fr, den); s = " " + fr / g + "/" + den / g; }
    return (neg ? "-" : "") + ft + "'-" + inch + s + "\"";
  }
  function trimNum(v, prec) { var s = (+v).toFixed(prec); if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, ""); return s === "-0" ? "0" : s; }
  function fmtLen(mm, unit, prec, sym) {
    unit = unit || "mm"; if (unit === "ftin") return fmtFtIn(mm);
    var u = get(unit); if (!u) return String(mm);
    if (prec == null) prec = { mm: 0, cm: 1, m: 3, km: 4, in: 2, ft: 3, yd: 3, mi: 5 }[unit] != null ? { mm: 0, cm: 1, m: 3, km: 4, in: 2, ft: 3, yd: 3, mi: 5 }[unit] : 3;
    var t = trimNum(mm / u.f, prec); return sym === false ? t : t + " " + u.sym;
  }
  function fmtQty(v, unit, prec) { var u = get(unit); return trimNum(v, prec == null ? 3 : prec) + " " + (u ? u.sym : unit); }
  function fmtArea(mm2, unit, prec) { return fmtQty(conv(mm2, "mm2", unit), unit, prec == null ? 3 : prec); }
  function fmtVol(mm3, unit, prec) { return fmtQty(conv(mm3, "mm3x", unit), unit, prec); }
  /* typed length: plain number = current unit; 12' 6" / 12'6-1/2" / 12ft 6in / 3.5m / 450mm / 1/2" ; expressions with + - * / allowed for plain numbers */
  function parseLen(text, unit) {
    var s = String(text == null ? "" : text).trim().toLowerCase(); if (!s) return null;
    // commas: digit grouping (1,200 · 1,20,000 · 1,200.5) is removed; any other comma is a decimal comma (1,5 → 1.5)
    if (s.indexOf(".") >= 0) s = s.replace(/(\d),(?=\d)/g, "$1");
    else s = s.replace(/(?<!\d)\d{1,3}(?:,\d{2,3})*,\d{3}(?!\d)/g, function (g) { return g.replace(/,/g, ""); }).replace(/,/g, ".");
    unit = unit || "mm";
    var ftin = s.match(/^(-?)\s*(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)\s*-?\s*(?:(\d+(?:\.\d+)?)?(?:\s*[- ]\s*(\d+)\/(\d+))?\s*(?:"|in|inch|inches)?)?$/);
    if (ftin && /'|ft|feet|foot/.test(s)) { var sg = ftin[1] ? -1 : 1, v = +ftin[2] * FT + (ftin[3] ? +ftin[3] * IN : 0) + (ftin[4] ? +ftin[4] / +ftin[5] * IN : 0); return sg * v; }
    var inch = s.match(/^(-?)\s*(?:(\d+(?:\.\d+)?)\s*(?:[- ]\s*(\d+)\/(\d+))?|(\d+)\/(\d+))\s*(?:"|in|inch|inches)$/);
    if (inch) { var sg2 = inch[1] ? -1 : 1; return sg2 * ((inch[2] ? +inch[2] : 0) + (inch[3] ? +inch[3] / +inch[4] : 0) + (inch[5] ? +inch[5] / +inch[6] : 0)) * IN; }
    var m = s.match(/^(.+?)\s*([a-z"'²³µ.]+)$/);
    if (m && get(m[2]) && get(m[2]).dim === "L") { var n = evalNum(m[1]); return n == null ? null : n * get(m[2]).f; }
    var n2 = evalNum(s); if (n2 == null) return null;
    var cu = get(unit === "ftin" ? "ft" : unit); return n2 * (cu ? cu.f : 1);
  }
  function evalNum(s) {
    s = String(s).trim(); if (!/^[0-9+\-*/().\s]+$/.test(s)) return null;
    try { var v = Function('"use strict";return (' + s + ")")(); return typeof v === "number" && isFinite(v) ? v : null; } catch (e) { return null; }
  }
  function parseAng(text) {   // degrees, or 30d15'20", or 0.5r → degrees
    var s = String(text || "").trim().toLowerCase(); if (!s) return null;
    var r = s.match(/^(-?\d+(?:\.\d+)?)\s*r(?:ad)?$/); if (r) return +r[1] * 180 / Math.PI;
    var d = s.match(/^(-?\d+(?:\.\d+)?)\s*(?:d|°)\s*(?:(\d+(?:\.\d+)?)\s*')?\s*(?:(\d+(?:\.\d+)?)\s*")?$/); if (d) { var sg = d[1][0] === "-" ? -1 : 1; return sg * (Math.abs(+d[1]) + (d[2] ? +d[2] / 60 : 0) + (d[3] ? +d[3] / 3600 : 0)); }
    return evalNum(s);
  }
  /* SOR unit text → registry unit id (null when it is not a measurable unit, e.g. "job") */
  function fromSor(u) { var x = get(u); return x ? x.id : null; }
  /* quantity measured in a model (mm, mm², mm³, count) → value in an SOR unit */
  function toSor(value, dim, sorUnit) {
    var u = get(sorUnit); if (!u) throw new Error("Unknown SOR unit: " + sorUnit);
    var base = { L: "mm", A: "mm2", V: "mm3x", N: "nos", M: "kg" }[dim];
    if (u.dim !== dim) throw new Error("The item is measured in " + u.label + " but the drawing gives a " + { L: "length", A: "area", V: "volume", N: "count", M: "weight" }[dim]);
    return conv(value, base, u.id);
  }
  add("mm3x", "V", 1, "cubic millimetre", "mm³", ["mm3", "mm³", "cumm"]);
  var LEN_UNITS = ["mm", "cm", "m", "km", "in", "ft", "ftin", "yd", "mi"];

  EP.units = { R: R, get: get, conv: conv, rateConv: rateConv, canConv: canConv, areaUnit: areaUnit, volUnit: volUnit, massFromVol: massFromVol,
    fmtLen: fmtLen, fmtFtIn: fmtFtIn, fmtQty: fmtQty, fmtArea: fmtArea, fmtVol: fmtVol, parseLen: parseLen, parseAng: parseAng, evalNum: evalNum,
    fromSor: fromSor, toSor: toSor, LEN_UNITS: LEN_UNITS, trimNum: trimNum };
})();
