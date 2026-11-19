/* Design Studio — sections (port of civilest/design/sections.py).
   Hot-rolled steel section tables (IS 808 / SP 6(1) values as commonly tabulated).
   Tabulated: mass, area, depth, flange width/thickness, web thickness, I, r, Ze.
   Derived from dimensions (root fillets ignored → slightly conservative): plastic modulus Zp,
   torsion constant It, warping constant Iw.
   ⚠ Verify against the current IS 808 / manufacturer tables for critical work. */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var C = DS.core;
  var S = DS.sections = {};
  function kw(args, names, defs, nreq) { return DS.materials._kw(args, names, defs, nreq); }

  // name: (kg/m, A cm², h mm, b mm, tf mm, tw mm, Iz cm⁴, Iy cm⁴, rz cm, ry cm, Zez cm³, Zey cm³)
  S.ISMB = {
    "ISMB 100": [11.5, 14.6, 100, 75, 7.2, 4.0, 257.5, 40.8, 4.20, 1.67, 51.5, 10.9],
    "ISMB 125": [13.0, 16.6, 125, 75, 7.6, 4.4, 449.0, 43.7, 5.20, 1.62, 71.8, 11.7],
    "ISMB 150": [14.9, 19.0, 150, 80, 7.6, 4.8, 726.4, 52.6, 6.18, 1.66, 96.9, 13.2],
    "ISMB 175": [19.3, 24.6, 175, 90, 8.6, 5.5, 1272.0, 85.0, 7.19, 1.86, 145.4, 18.9],
    "ISMB 200": [25.4, 32.3, 200, 100, 10.8, 5.7, 2235.4, 150.0, 8.32, 2.15, 223.5, 30.0],
    "ISMB 225": [31.2, 39.7, 225, 110, 11.8, 6.5, 3441.8, 218.3, 9.31, 2.34, 305.9, 39.7],
    "ISMB 250": [37.3, 47.5, 250, 125, 12.5, 6.9, 5131.6, 334.5, 10.40, 2.65, 410.5, 53.5],
    "ISMB 300": [44.2, 56.3, 300, 140, 12.4, 7.5, 8603.6, 453.9, 12.37, 2.84, 573.6, 64.8],
    "ISMB 350": [52.4, 66.7, 350, 140, 14.2, 8.1, 13630.3, 537.7, 14.29, 2.84, 778.9, 76.8],
    "ISMB 400": [61.6, 78.5, 400, 140, 16.0, 8.9, 20458.4, 622.1, 16.15, 2.82, 1022.9, 88.9],
    "ISMB 450": [72.4, 92.3, 450, 150, 17.4, 9.4, 30390.8, 834.0, 18.15, 3.01, 1350.7, 111.2],
    "ISMB 500": [86.9, 110.7, 500, 180, 17.2, 10.2, 45218.3, 1369.8, 20.21, 3.52, 1808.7, 152.2],
    "ISMB 550": [103.7, 132.1, 550, 190, 19.3, 11.2, 64893.6, 1833.8, 22.16, 3.73, 2359.8, 193.0],
    "ISMB 600": [122.6, 156.2, 600, 210, 20.8, 12.0, 91813.0, 2651.0, 24.24, 4.12, 3060.4, 252.5]
  };

  S.ISHB = {
    "ISHB 150": [27.1, 34.5, 150, 150, 9.0, 5.4, 1455.6, 431.7, 6.50, 3.54, 194.1, 57.6],
    "ISHB 200": [37.3, 47.5, 200, 200, 9.0, 6.1, 3608.4, 967.1, 8.72, 4.51, 360.8, 96.7],
    "ISHB 225": [43.1, 54.9, 225, 225, 9.1, 6.5, 5279.5, 1353.8, 9.81, 4.97, 469.3, 120.3],
    "ISHB 250": [51.0, 65.0, 250, 250, 9.7, 6.9, 7736.5, 1961.0, 10.91, 5.49, 618.9, 156.9],
    "ISHB 300": [58.8, 74.9, 300, 250, 10.6, 7.6, 12545.2, 2193.6, 12.94, 5.41, 836.3, 175.5],
    "ISHB 350": [67.4, 85.9, 350, 250, 11.6, 8.3, 19159.7, 2451.4, 14.93, 5.34, 1094.8, 196.1],
    "ISHB 400": [77.4, 98.7, 400, 250, 12.7, 9.1, 28083.5, 2727.6, 16.87, 5.26, 1404.2, 218.2],
    "ISHB 450": [87.2, 111.1, 450, 250, 13.7, 9.8, 39210.8, 2985.2, 18.80, 5.18, 1742.7, 238.8]
  };

  // channels: + Cy (cm) = distance of centroid from back of web
  S.ISMC = {
    "ISMC 75": [6.8, 8.7, 75, 40, 7.3, 4.4, 76.0, 12.6, 2.96, 1.21, 20.3, 4.7, 1.31],
    "ISMC 100": [9.2, 11.7, 100, 50, 7.5, 4.7, 186.7, 25.9, 4.00, 1.49, 37.3, 7.5, 1.53],
    "ISMC 125": [12.7, 16.2, 125, 65, 8.1, 5.0, 416.4, 59.9, 5.07, 1.92, 66.6, 13.1, 1.94],
    "ISMC 150": [16.4, 20.9, 150, 75, 9.0, 5.4, 779.4, 102.3, 6.11, 2.21, 103.9, 19.4, 2.20],
    "ISMC 175": [19.1, 24.4, 175, 75, 10.2, 5.7, 1223.3, 121.0, 7.08, 2.23, 139.8, 22.8, 2.20],
    "ISMC 200": [22.1, 28.2, 200, 75, 11.4, 6.1, 1819.3, 140.4, 8.03, 2.23, 181.9, 26.3, 2.17],
    "ISMC 225": [25.9, 33.0, 225, 80, 12.4, 6.4, 2694.6, 187.2, 9.03, 2.38, 239.5, 32.8, 2.30],
    "ISMC 250": [30.4, 38.7, 250, 80, 14.1, 7.1, 3816.8, 219.1, 9.94, 2.38, 305.3, 38.4, 2.30],
    "ISMC 300": [35.8, 45.6, 300, 90, 13.6, 7.6, 6362.6, 310.8, 11.81, 2.61, 424.2, 46.8, 2.36],
    "ISMC 350": [42.1, 53.7, 350, 100, 13.5, 8.1, 10008.0, 430.6, 13.66, 2.83, 571.9, 57.0, 2.44],
    "ISMC 400": [49.4, 62.9, 400, 100, 15.3, 8.6, 15082.8, 504.8, 15.48, 2.83, 754.1, 67.0, 2.42]
  };

  // equal angles: (kg/m, A cm², Cz cm, Ixx cm⁴, rxx cm, rvv(min) cm)  key "ISA 75x75x8"
  S.ISA = {
    "ISA 40x40x5": [3.0, 3.78, 1.16, 5.4, 1.20, 0.77],
    "ISA 45x45x5": [3.4, 4.28, 1.28, 7.9, 1.36, 0.87],
    "ISA 50x50x5": [3.8, 4.79, 1.40, 11.0, 1.51, 0.97],
    "ISA 50x50x6": [4.5, 5.68, 1.45, 12.9, 1.51, 0.96],
    "ISA 60x60x6": [5.4, 6.84, 1.69, 22.9, 1.82, 1.17],
    "ISA 65x65x6": [5.8, 7.44, 1.81, 29.1, 1.98, 1.27],
    "ISA 65x65x8": [7.7, 9.76, 1.89, 37.4, 1.96, 1.26],
    "ISA 75x75x6": [6.8, 8.66, 2.06, 45.7, 2.30, 1.48],
    "ISA 75x75x8": [8.9, 11.38, 2.14, 59.0, 2.28, 1.47],
    "ISA 80x80x8": [9.6, 12.21, 2.27, 72.5, 2.44, 1.57],
    "ISA 90x90x8": [10.8, 13.79, 2.51, 104.2, 2.75, 1.77],
    "ISA 100x100x8": [12.1, 15.39, 2.76, 145.1, 3.07, 1.96],
    "ISA 100x100x10": [14.9, 19.03, 2.84, 177.0, 3.05, 1.95],
    "ISA 110x110x10": [16.5, 21.06, 3.09, 238.4, 3.36, 2.15],
    "ISA 130x130x10": [19.7, 25.06, 3.59, 400.7, 4.00, 2.57],
    "ISA 150x150x12": [27.2, 34.59, 4.16, 736.9, 4.62, 2.96]
  };

  S._ibeam = function (name, row, family) {
    var w = row[0], A = row[1], h = row[2], b = row[3], tf = row[4], tw = row[5], Iz = row[6], Iy = row[7],
      rz = row[8], ry = row[9], Zez = row[10], Zey = row[11];
    var hw = h - 2 * tf;
    var Zpz = b * tf * (h - tf) + tw * Math.pow(hw, 2) / 4;                 // mm³ (fillets ignored)
    var Zpy = 2 * tf * Math.pow(b, 2) / 4 + hw * Math.pow(tw, 2) / 4;
    var It = (2 * b * Math.pow(tf, 3) + (h - tf) * Math.pow(tw, 3)) / 3;    // IS 800 Annex E
    var hy = h - tf;
    var Iw = (Iy * 1e4) * Math.pow(hy, 2) / 4;                              // doubly symmetric
    return { name: name, family: family, w: w, A: A * 100, h: h, b: b, tf: tf, tw: tw,
      Iz: Iz * 1e4, Iy: Iy * 1e4, rz: rz * 10, ry: ry * 10, Zez: Zez * 1e3,
      Zey: Zey * 1e3, Zpz: Zpz, Zpy: Zpy, It: It, Iw: Iw };
  };

  S._channel = function (name, row) {
    var w = row[0], A = row[1], h = row[2], b = row[3], tf = row[4], tw = row[5], Iz = row[6], Iy = row[7],
      rz = row[8], ry = row[9], Zez = row[10], Zey = row[11], Cy = row[12];
    var hw = h - 2 * tf;
    var Zpz = b * tf * (h - tf) + tw * Math.pow(hw, 2) / 4;
    // plastic NA about minor axis for a channel: approximate with 1.5 × Zey (rectangle-ish, conservative cap)
    var Zpy = Math.min(1.5 * Zey * 1e3, 2 * tf * Math.pow(b, 2) / 2);
    var It = (2 * b * Math.pow(tf, 3) + (h - tf) * Math.pow(tw, 3)) / 3;
    var hy = h - tf;
    var Iw = (Iy * 1e4) * Math.pow(hy, 2) / 4 * 0.75;                       // approx. for channels
    return { name: name, family: "ISMC", w: w, A: A * 100, h: h, b: b, tf: tf, tw: tw,
      Iz: Iz * 1e4, Iy: Iy * 1e4, rz: rz * 10, ry: ry * 10, Zez: Zez * 1e3,
      Zey: Zey * 1e3, Zpz: Zpz, Zpy: Zpy, It: It, Iw: Iw, Cy: Cy * 10 };
  };

  S._angle = function (name, row) {
    var w = row[0], A = row[1], Cz = row[2], Ixx = row[3], rxx = row[4], rvv = row[5];
    var parts = name.split(/\s+/)[1].split("x").map(Number), leg = parts[0], t = parts[2];
    return { name: name, family: "ISA", w: w, A: A * 100, leg: leg, t: t, Cz: Cz * 10,
      Ixx: Ixx * 1e4, rxx: rxx * 10, rvv: rvv * 10, Zxx: Ixx * 1e4 / (leg - Cz * 10) };
  };

  /* builtup_i(h, b, tf, tw) — welded (plate) I-section, exact rectangle properties (no fillets) */
  S.builtup_i = function (h, b, tf, tw) {
    var hw = h - 2 * tf;
    var A = 2 * b * tf + hw * tw;
    var Iz = (b * Math.pow(h, 3) - (b - tw) * Math.pow(hw, 3)) / 12;
    var Iy = (2 * tf * Math.pow(b, 3) + hw * Math.pow(tw, 3)) / 12;
    var Zpz = b * tf * (h - tf) + tw * Math.pow(hw, 2) / 4;
    var Zpy = 2 * tf * Math.pow(b, 2) / 4 + hw * Math.pow(tw, 2) / 4;
    var It = (2 * b * Math.pow(tf, 3) + (h - tf) * Math.pow(tw, 3)) / 3;
    var Iw = Iy * Math.pow(h - tf, 2) / 4;
    var name = "BU " + C.pyfmt(h, "g") + "x" + C.pyfmt(b, "g") + "x" + C.pyfmt(tf, "g") + "x" + C.pyfmt(tw, "g");
    return { name: name, family: "BUILT", w: A * 7850e-6, A: A, h: h, b: b, tf: tf, tw: tw,
      Iz: Iz, Iy: Iy, rz: Math.sqrt(Iz / A), ry: Math.sqrt(Iy / A), Zez: Iz / (h / 2),
      Zey: Iy / (b / 2), Zpz: Zpz, Zpy: Zpy, It: It, Iw: Iw };
  };

  /* builtup_series() → list of BU names (practical welded I range for portal frames, sorted by weight) */
  S.builtup_series = function () {
    var out = [];
    [500, 600, 700, 800, 900, 1000, 1100, 1200].forEach(function (h) {
      var tw = h <= 700 ? 8 : h <= 1000 ? 10 : 12;
      [[200, 12], [250, 12], [250, 16], [300, 16], [300, 20], [350, 20], [400, 25]].forEach(function (bt) {
        var b = bt[0], tf = bt[1];
        if (b > 0.45 * h + 50) return;
        out.push(S.builtup_i(h, b, tf, tw));
      });
    });
    out.sort(function (x, y) { return x.w - y.w; });   // stable, as Python's sort
    return out.map(function (d) { return d.name; });
  };

  /* section(name) → property dict (cached: the same object is returned for a name, as lru_cache) */
  var _cache = {};
  S.section = function (name) {
    if (Object.prototype.hasOwnProperty.call(_cache, name)) return _cache[name];
    var r;
    if (name.indexOf("BU ") === 0) {
      var v = name.slice(3).split("x").map(function (x) { var n = Number(x.trim()); if (x.trim() === "" || isNaN(n)) throw new Error("ValueError: " + name); return n; });
      if (v.length !== 4) throw new Error("ValueError: " + name);
      r = S.builtup_i(v[0], v[1], v[2], v[3]);
    } else if (Object.prototype.hasOwnProperty.call(S.ISMB, name)) r = S._ibeam(name, S.ISMB[name], "ISMB");
    else if (Object.prototype.hasOwnProperty.call(S.ISHB, name)) r = S._ibeam(name, S.ISHB[name], "ISHB");
    else if (Object.prototype.hasOwnProperty.call(S.ISMC, name)) r = S._channel(name, S.ISMC[name]);
    else if (Object.prototype.hasOwnProperty.call(S.ISA, name)) r = S._angle(name, S.ISA[name]);
    else throw new Error("KeyError: " + name);
    _cache[name] = r;
    return r;
  };

  /* double_angle(name, gap_mm = 8[, {gap_mm}]) — two equal angles back to back on a gusset */
  S.double_angle = function (name, gap_mm) {
    var p = kw(arguments, ["name", "gap_mm"], { gap_mm: 8.0 }, 1);
    name = p.name; gap_mm = p.gap_mm;
    var s = S.section(name);
    var A = 2 * s.A;
    var Ixx = 2 * s.Ixx;
    var Iyy = 2 * (s.Ixx + s.A * Math.pow(s.Cz + gap_mm / 2, 2));
    var rxx = Math.sqrt(Ixx / A), ryy = Math.sqrt(Iyy / A);
    return { name: "2-" + name + " (b/b, " + C.pyfmt(gap_mm, "g") + " mm gusset)", family: "2ISA", single: name,
      w: 2 * s.w, A: A, leg: s.leg, t: s.t, rxx: rxx, ryy: ryy,
      rmin: Math.min(rxx, ryy), Cz: s.Cz, Ixx: Ixx, Iyy: Iyy };
  };

  /* by_weight(table) → names sorted by kg/m (stable) */
  S.by_weight = function (table) {
    return Object.keys(table).sort(function (a, b) { return table[a][0] - table[b][0]; });
  };

  S.ALL_I = Object.assign({}, S.ISMB, S.ISHB);
})();
