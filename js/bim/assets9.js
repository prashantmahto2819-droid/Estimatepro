/* Estimate Pro — catalogue 9: furniture that is built to the size you type.
   Unlike the stretch of an ordinary library item (Own size), these rebuild themselves: a longer sofa gets more seats,
   a wider bed more pillows, a longer dining table more chairs. def.param = true; def.vars = designs to choose from.
   Size comes from the placed item: e.W, e.D, e.HH (mm), else the catalogue size. */
(function () {
  "use strict";
  var EP = window.EP, B = EP.bim; if (!B || !B.AH) return;
  var G = EP.geom, A = B.ASSET_LIB, AH = B.AH, cyl = AH.cyl, sphere = AH.sphere, rect = AH.rect;
  function pm(id, n, cat, w, d, h, key, vars, build, o) {
    var def = { n: n, cat: cat, w: w, d: d, h: h, key: key, param: true, vars: vars || null }; o = o || {}; if (o.m) def.mount = o.m; if (o.z != null) def.mz = o.z;
    var size = function (e) { e = e || {}; return [+e.W > 0 ? +e.W : w, +e.D > 0 ? +e.D : d, +e.HH > 0 ? +e.HH : h]; };
    def.sym = function (X, e) { var z = size(e), s = X.s, out = G.polySegs(rect(X([0, 0]), z[0] * s, z[1] * s, X.r), true), b = build(z[0], z[1], z[2], e || {});
      (b.sym || []).forEach(function (q) { out = out.concat(G.polySegs(rect(X([q[0], q[1]]), q[2] * s, q[3] * s, X.r + (q[4] || 0)), true)); }); return out; };
    def.mesh = function (M, X, z0, LK, H, e) { var z = size(e), s = X.s;
      build(z[0], z[1], z[2], e || {}).parts.forEach(function (q) { var t = q[0];
        if (t === "br") { if (q[3] > 0.5 && q[4] > 0.5 && q[6] - q[5] > 0.5) H.box(M, X([q[1], q[2]]), q[3] * s, q[4] * s, X.r + (q[8] || 0), z0 + q[5] * s, z0 + q[6] * s, LK(q[7])); }   /* a box turned by its own angle (°) */
        else if (t === "b") { if (q[3] > 0.5 && q[4] > 0.5 && q[6] - q[5] > 0.5) H.box(M, X([q[1], q[2]]), q[3] * s, q[4] * s, X.r, z0 + q[5] * s, z0 + q[6] * s, LK(q[7])); }
        else if (t === "c") cyl(M, X([q[1], q[2]]), q[3] * s, z0 + q[4] * s, z0 + q[5] * s, LK(q[6]), 16, q[7] != null ? q[7] * s : undefined);
        else if (t === "s") sphere(M, X([q[1], q[2]]), q[3] * s, z0 + q[4] * s, LK(q[5])); }); };
    A[id] = def;
  }
  var TAU2 = Math.PI * 2, FU = "Furniture", WD = "wood_teak", DK = "wood_dark", WH = "paint_pure_white", FB = "fabric_beige", BK = "steel_matt_black";
  function legs4(w, d, inset, sz, z0, z1, look) { var x = w / 2 - inset, y = d / 2 - inset; return [["b", -x, -y, sz, sz, z0, z1, look], ["b", x, -y, sz, sz, z0, z1, look], ["b", -x, y, sz, sz, z0, z1, look], ["b", x, y, sz, sz, z0, z1, look]]; }
  function chair(x, y, face, look, seatLook) {   /* face: 0 = looks towards +y, 1 = −y, 2 = +x, 3 = −x */
    var bx = face === 2 ? -200 : face === 3 ? 200 : 0, by = face === 0 ? -200 : face === 1 ? 200 : 0, bw = face > 1 ? 40 : 420, bd = face > 1 ? 420 : 40;
    return [["b", x, y, 440, 440, 420, 470, seatLook], ["b", x + bx, y + by, bw, bd, 470, 900, look]].concat(legs4(400, 400, 0, 35, 0, 420, look).map(function (q) { q = q.slice(); q[1] += x; q[2] += y; return q; }));
  }

  /* a chair of a chosen design at (x, y), looking along angle a (radians; 0 = looks towards +y); every part turned with it */
  var CHAIRS = [["", "Plain wooden chairs"], ["uph", "Upholstered high-back chairs"], ["arm", "Arm chairs"], ["cane", "Cane-back chairs"], ["stool", "Stools (no back)"], ["metal", "Metal café chairs"]];
  function chairR(x, y, a, st) {
    var c = Math.cos(a), sn = Math.sin(a), deg = a * 180 / Math.PI, P = [], at = function (px, py) { return [x + px * c - py * sn, y + px * sn + py * c]; };
    var put = function (px, py, w, d, z0, z1, lk) { var q = at(px, py); P.push(["br", q[0], q[1], w, d, z0, z1, lk, deg]); };
    var fr = st === "metal" ? BK : DK, seat = st === "uph" ? FB : st === "metal" ? BK : FB, sw = st === "stool" ? 380 : 440;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (k) { put(k[0] * (sw / 2 - 25), k[1] * (sw / 2 - 25), st === "metal" ? 22 : 35, st === "metal" ? 22 : 35, 0, st === "stool" ? 620 : 420, fr); });
    if (st === "stool") { put(0, 0, sw, sw, 620, 670, seat); put(0, -sw / 2 + 60, sw - 60, 20, 250, 270, fr); return P; }
    put(0, 0, sw, sw, 420, st === "uph" ? 490 : 470, seat);
    if (st === "uph") put(0, -sw / 2 + 35, sw, 70, 470, 1050, FB);
    else if (st === "cane") { put(-sw / 2 + 25, -sw / 2 + 20, 35, 40, 470, 920, fr); put(sw / 2 - 25, -sw / 2 + 20, 35, 40, 470, 920, fr); put(0, -sw / 2 + 20, sw, 40, 880, 920, fr); put(0, -sw / 2 + 20, sw - 70, 12, 520, 880, "fabric_beige"); }
    else if (st === "metal") { put(0, -sw / 2 + 15, sw, 18, 640, 860, BK); put(-sw / 2 + 12, -sw / 2 + 15, 22, 22, 470, 860, BK); put(sw / 2 - 12, -sw / 2 + 15, 22, 22, 470, 860, BK); }
    else put(0, -sw / 2 + 20, sw - 20, 40, 470, 900, fr);
    if (st === "arm") { put(-sw / 2 + 20, 0, 40, sw - 40, 640, 680, fr); put(sw / 2 - 20, 0, 40, sw - 40, 640, 680, fr); put(-sw / 2 + 20, sw / 2 - 40, 35, 35, 470, 640, fr); put(sw / 2 - 20, sw / 2 - 40, 35, 35, 470, 640, fr); }
    return P;
  }
  B.chairParts = chairR; B.CHAIRS = CHAIRS;

  /* ---------- beds ---------- */
  pm("bed_p", "Bed — any size (pillows and panels follow the width)", FU, 1500, 2000, 1100, "bed", [["", "Wooden with plain headboard"], ["uph", "Upholstered headboard (panels)"], ["storage", "Box / storage bed"], ["poster", "Four-poster"], ["low", "Low platform bed"]], function (w, d, h, e) {
    var v = e.var || "", P = [], base = v === "low" ? 160 : 320, mt = base + (v === "low" ? 180 : 220), hy = -d / 2 + 30, fr = v === "uph" ? FB : WD;
    if (v === "storage" || v === "low") P.push(["b", 0, 0, w + (v === "low" ? 200 : 0), d + (v === "low" ? 100 : 0), v === "low" ? 60 : 0, base, fr]); else { P = P.concat(legs4(w, d, 40, 70, 0, base - 120, DK)); P.push(["b", 0, 0, w, d, base - 120, base, fr]); }
    P.push(["b", 0, 20, w - 40, d - 80, base, mt, WH]);
    P.push(["b", 0, hy, w + 40, 60, 0, h, fr]);
    if (v === "uph") { var np = Math.max(2, Math.round(w / 320)), pw = w / np; for (var i = 0; i < np; i++) P.push(["b", -w / 2 + pw * (i + 0.5), hy + 40, pw - 14, 30, mt + 20, h - 30, FB]); }
    if (v === "poster") { legs4(w, d, 30, 60, 0, 2100, DK).forEach(function (q) { P.push(q); }); P.push(["b", 0, -d / 2 + 30, w, 50, 2050, 2100, DK], ["b", 0, d / 2 - 30, w, 50, 2050, 2100, DK], ["b", -w / 2 + 30, 0, 50, d, 2050, 2100, DK], ["b", w / 2 - 30, 0, 50, d, 2050, 2100, DK]); }
    var npl = w >= 1900 ? 3 : w >= 1250 ? 2 : 1, pl = Math.min(650, (w - 80) / npl - 40); for (var k = 0; k < npl; k++) P.push(["b", -w / 2 + (w / npl) * (k + 0.5), -d / 2 + 320, pl, 380, mt, mt + 110, WH]);
    P.push(["b", 0, d * 0.2, w - 20, d * 0.55, mt, mt + 25, "paint_denim"], ["b", 0, -d * 0.08, w - 20, 120, mt + 25, mt + 45, WH]);
    return { parts: P, sym: [[0, hy, w, 60], [0, -d / 2 + 320, w - 100, 380]] };
  });
  pm("bed_bunk_p", "Bunk bed — any size", FU, 1000, 2000, 1750, "bed", null, function (w, d, h) {
    var P = legs4(w, d, 30, 60, 0, h, WD); [300, 1250].forEach(function (z) { P.push(["b", 0, 0, w, d, z - 60, z, WD], ["b", 0, 0, w - 80, d - 80, z, z + 150, WH], ["b", 0, -d / 2 + 250, w - 200, 320, z + 150, z + 240, WH]); });
    P.push(["b", 0, -d / 2 + 30, w, 40, 1250, 1600, WD], ["b", -w / 2 + 30, 0, 40, d, 1450, 1500, WD], ["b", w / 2 - 20, d / 2 - 250, 40, 40, 0, 1500, WD], ["b", w / 2 - 20, d / 2 - 550, 40, 40, 0, 1500, WD]);
    for (var i = 0; i < 4; i++) P.push(["b", w / 2 - 20, d / 2 - 400, 30, 300, 280 + i * 300, 310 + i * 300, WD]); return { parts: P, sym: [[0, -d / 2 + 250, w - 200, 320]] };
  });

  /* ---------- sofas ---------- */
  function sofaParts(w, d, h, v, x0, y0, noLeftArm, noRightArm) {
    var P = [], arm = v === "armless" ? 0 : 170, seatH = 420, backT = 180, armH = v === "chester" ? h : 620, la = noLeftArm ? 0 : arm, ra = noRightArm ? 0 : arm, inner = w - la - ra, n = Math.max(1, Math.round(inner / 680)), cw = inner / n, cx = x0 + (la - ra) / 2;
    P.push(["b", x0, y0, w, d, 100, 260, FB]); legs4(w, d, 60, 50, 0, 100, DK).forEach(function (q) { q = q.slice(); q[1] += x0; q[2] += y0; P.push(q); });
    P.push(["b", x0, y0 - d / 2 + backT / 2, w, backT, 260, h, FB]);
    if (la) P.push(["b", x0 - w / 2 + la / 2, y0, la, d, 260, armH, FB]); if (ra) P.push(["b", x0 + w / 2 - ra / 2, y0, ra, d, 260, armH, FB]);
    for (var i = 0; i < n; i++) { var x = cx - inner / 2 + cw * (i + 0.5); P.push(["b", x, y0 + backT / 2, cw - 12, d - backT - 10, 260, seatH, "fabric_beige"]); if (v !== "chester") P.push(["b", x, y0 - d / 2 + backT + 70, cw - 30, 130, seatH, h - 60, "fabric_beige"]); }
    return P;
  }
  pm("sofa_p", "Sofa — any length (seats follow the length)", FU, 2100, 900, 850, "sofa", [["", "With arms"], ["armless", "Armless"], ["chester", "Chesterfield (arms as high as the back)"]], function (w, d, h, e) { return { parts: sofaParts(w, d, h, e.var || "", 0, 0), sym: [[0, -d / 2 + 90, w, 180]] }; });
  pm("sofa_L_p", "L-shaped sofa — any size (width × length of the long side)", FU, 2700, 1700, 850, "sofa", [["", "Chaise on the right"], ["left", "Chaise on the left"]], function (w, d, h, e) {
    var sd = 900, left = e.var === "left", cwid = 900, P = sofaParts(w, sd, h, "", 0, -d / 2 + sd / 2, false, false), cx = (left ? -1 : 1) * (w / 2 - cwid / 2);
    P.push(["b", cx, sd / 2, cwid, d - sd, 100, 260, FB], ["b", cx, sd / 2, cwid - 12, d - sd - 6, 260, 420, FB], ["b", cx + (left ? -1 : 1) * (cwid / 2 - 85), sd / 2, 170, d - sd, 260, 620, FB]);
    return { parts: P, sym: [[0, -d / 2 + 90, w, 180], [cx, sd / 2, cwid, d - sd]] };
  });

  /* ---------- tables ---------- */
  var TOPS = [["", "Wooden top"], ["marble", "Marble top"], ["glass", "Glass top"], ["granite", "Granite top"], ["white", "White laminate top"]];
  function topLook(v) { return v === "marble" ? "marble_statuario" : v === "glass" ? "glass_clear" : v === "granite" ? "granite_black" : v === "white" ? WH : WD; }
  pm("dining_p", "Dining table with chairs — any size (chairs follow the length)", FU, 1800, 900, 750, "dining_table", TOPS, function (w, d, h, e) {
    var v = e.var || "", P = [["b", 0, 0, w, d, h - 35, h, topLook(v)]], n = Math.max(1, Math.floor((w - 150) / 600)), sw = w / n, lk = v === "glass" ? "steel_ss" : DK;
    if (v === "marble" || v === "granite") P.push(["b", 0, 0, Math.min(w * 0.5, 900), d * 0.35, 0, 60, DK], ["b", 0, 0, Math.min(w * 0.3, 500), d * 0.2, 60, h - 35, DK]); else P = P.concat(legs4(w, d, 70, 60, 0, h - 35, lk));
    var cs = e.chair || "", ends = e.ends == null || e.ends === "" ? w >= 1500 : e.ends === "1";
    for (var i = 0; i < n; i++) { var x = -w / 2 + sw * (i + 0.5); P = P.concat(chairR(x, -d / 2 - 180, 0, cs), chairR(x, d / 2 + 180, Math.PI, cs)); }
    if (ends) P = P.concat(chairR(-w / 2 - 180, 0, -Math.PI / 2, cs), chairR(w / 2 + 180, 0, Math.PI / 2, cs));
    return { parts: P, sym: [[0, 0, w * 0.9, d * 0.8]] };
  });
  pm("dining_round_p", "Round dining table with chairs — any diameter (chairs go round it)", FU, 1200, 1200, 750, "dining_table", TOPS, function (w, d, h, e) {
    var v = e.var || "", D = Math.min(w, d), r = D / 2, P = [["c", 0, 0, r, h - 35, h, topLook(v)], ["c", 0, 0, 70, 0, h - 35, v === "glass" ? "steel_ss" : DK], ["c", 0, 0, Math.min(r * 0.55, 330), 0, 40, DK]];
    var n = +e.seats > 0 ? Math.round(+e.seats) : Math.max(3, Math.min(10, Math.floor(Math.PI * (D + 360) / 650))), rc = r + 180;
    for (var i = 0; i < n; i++) { var a = TAU2 * i / n, cx = rc * Math.sin(a), cy = -rc * Math.cos(a); P = P.concat(chairR(cx, cy, a, e.chair || "")); }
    return { parts: P, sym: [] };
  });
  pm("sofa_bed_p", "Sofa-cum-bed — any width (shown as a sofa or opened as a bed)", FU, 1900, 950, 850, "sofa", [["", "Shown as a sofa"], ["open", "Opened as a bed"]], function (w, d, h, e) {
    var open = e.var === "open", P = [["b", 0, 0, w, d, 80, 300, "fabric_grey"]].concat(legs4(w, d, 60, 50, 0, 80, DK));
    P.push(["b", -w / 2 + 70, 0, 140, d, 300, 600, "fabric_grey"], ["b", w / 2 - 70, 0, 140, d, 300, 600, "fabric_grey"]);
    if (open) { P.push(["b", 0, 400, w - 280, d + 900, 300, 480, FB], ["b", 0, -d / 2 + 90, w - 280, 180, 480, 560, WH]); for (var k = 0; k < 4; k++) P.push(["b", (k < 2 ? -1 : 1) * (w / 2 - 300), (k % 2 ? 1 : 0) * 900 + 60, 40, 40, 0, 300, BK]); }
    else { var ns = Math.max(2, Math.round((w - 280) / 600)), sw2 = (w - 280) / ns; for (var j = 0; j < ns; j++) P.push(["b", -w / 2 + 140 + sw2 * (j + 0.5), 60, sw2 - 12, d - 220, 300, 460, FB], ["b", -w / 2 + 140 + sw2 * (j + 0.5), -d / 2 + 90, sw2 - 12, 180, 300, h, FB]); }
    return { parts: P, sym: open ? [[0, 400, w - 280, d + 900]] : [[0, -d / 2 + 90, w - 280, 180]] };
  });
  pm("recliner_p", "Recliner sofa — 1 to 4 seats (footrests up or down)", FU, 950, 1000, 1050, "sofa", [["", "Footrests down"], ["open", "Footrests up (reclined)"]], function (w, d, h, e) {
    var n = Math.max(1, Math.min(4, Math.round((w - 160) / 780))), sw = (w - 160) / n, up = e.var === "open", P = [];
    P.push(["b", -w / 2 + 40, 0, 80, d, 0, 650, "fabric_brown"], ["b", w / 2 - 40, 0, 80, d, 0, 650, "fabric_brown"]);
    for (var i = 0; i < n; i++) { var x = -w / 2 + 80 + sw * (i + 0.5); P.push(["b", x, 50, sw - 20, d - 250, 120, 470, "fabric_brown"], ["b", x, -d / 2 + 110, sw - 20, 220, 120, up ? 900 : h, "fabric_brown"]);
      if (up) P.push(["b", x, d / 2 + 180, sw - 60, 420, 300, 400, "fabric_brown"]); if (i > 0) P.push(["b", x - sw / 2, 0, 60, d - 200, 120, 620, "fabric_brown"]); }
    return { parts: P, sym: up ? [[0, d / 2 + 180, w - 160, 420]] : [] };
  });
  pm("table_p", "Table — any size (centre, side, office, conference)", FU, 1200, 600, 450, "table", TOPS, function (w, d, h, e) {
    var v = e.var || "", lk = v === "glass" ? "steel_ss" : DK, P = [["b", 0, 0, w, d, h - 30, h, topLook(v)]].concat(legs4(w, d, 50, 50, 0, h - 30, lk)); if (h < 600) P.push(["b", 0, 0, w - 140, d - 140, h * 0.3, h * 0.3 + 18, topLook(v === "glass" ? "" : v)]); return { parts: P };
  });
  pm("desk_p", "Office desk with drawers and modesty panel — any length", FU, 1500, 700, 750, "table", TOPS, function (w, d, h, e) {
    var v = e.var || "", P = [["b", 0, 0, w, d, h - 30, h, topLook(v)], ["b", -w / 2 + 15, 0, 30, d - 40, 0, h - 30, WD], ["b", 0, -d / 2 + 60, w - 60, 18, 250, h - 30, WD], ["b", w / 2 - 215, 0, 430, d - 40, 0, h - 30, WD]];
    for (var i = 0; i < 3; i++) P.push(["b", w / 2 - 215, d / 2 - 12, 420, 16, 20 + i * 230, 235 + i * 230, WD], ["b", w / 2 - 215, d / 2 + 4, 140, 14, 120 + i * 230, 134 + i * 230, "steel_ss"]); return { parts: P };
  });
  pm("reception_p", "Reception counter with LED — any length", FU, 2400, 750, 1100, "table", [["", "Wood and white"], ["marble", "Marble front"], ["dark", "Dark with gold line"]], function (w, d, h, e) {
    var v = e.var || "", fr = v === "marble" ? "marble_statuario" : v === "dark" ? "laminate_charcoal" : WD, P = [["b", 0, d / 2 - 30, w, 60, 0, h, fr], ["b", 0, d / 2 - 150, w, 300, h, h + 30, v === "dark" ? "granite_black" : WH], ["b", 0, -60, w - 40, d - 180, 720, 750, WH], ["b", -w / 2 + 20, -40, 40, d - 80, 0, 750, WH], ["b", w / 2 - 20, -40, 40, d - 80, 0, 750, WH],
      ["b", 0, d / 2 + 3, w - 100, 8, 80, 100, "led_warm"], ["b", 0, d / 2 + 3, w - 100, 8, h - 90, h - 78, v === "dark" ? "steel_gold_pvd" : "led_warm"]]; return { parts: P };
  });
  pm("bench_p", "Bench / seat — any length", FU, 1500, 450, 450, "bench", [["", "Plain bench"], ["back", "With back rest"], ["cushion", "With cushion"]], function (w, d, h, e) {
    var v = e.var || "", P = [["b", 0, 0, w, d, h - 50, h, WD]].concat(legs4(w, d, 50, 55, 0, h - 50, DK)); if (w > 1800) P.push(["b", 0, 0, 55, d - 100, 0, h - 50, DK]); if (v === "back") P.push(["b", 0, -d / 2 + 25, w, 40, h, h + 420, WD]); if (v === "cushion") P.push(["b", 0, 0, w - 30, d - 30, h, h + 70, FB]); return { parts: P };
  });

  /* ---------- wall pieces ---------- */
  pm("shelf_wall_p", "Floating wall shelves — any length", FU, 1200, 250, 40, "bookshelf", [["", "One shelf"], ["2", "Two shelves"], ["3", "Three shelves"], ["led", "One shelf with LED under"]], function (w, d, h, e) {
    var v = e.var || "", n = v === "2" ? 2 : v === "3" ? 3 : 1, P = []; for (var i = 0; i < n; i++) P.push(["b", 0, d / 2, w, d, i * 350, i * 350 + 40, WD]); if (v === "led") P.push(["b", 0, d - 30, w - 60, 14, -8, 0, "led_warm"]); return { parts: P };
  }, { m: "wall", z: 1400 });
  pm("mirror_p", "Wall mirror — any size", FU, 600, 30, 900, "mirror", [["", "Wooden frame"], ["gold", "Gold frame"], ["black", "Black frame"], ["led", "Frameless with LED back-light"], ["round", "Round with LED"]], function (w, d, h, e) {
    var v = e.var || "", fr = v === "gold" ? "steel_gold_pvd" : v === "black" ? BK : WD, P = [];
    if (v === "led") P.push(["b", 0, 10, w - 60, 12, 30, h - 30, "led_warm"], ["b", 0, 20, w, 8, 0, h, "mirror"]);
    else if (v === "round") P.push(["b", 0, 8, w * 0.72, 10, h * 0.14, h * 0.86, "led_warm"], ["b", 0, 18, w * 0.66, 8, h * 0.17, h * 0.83, "mirror"], ["b", 0, 18, w * 0.9, 8, h * 0.32, h * 0.68, "mirror"], ["b", 0, 18, w * 0.42, 8, h * 0.06, h * 0.94, "mirror"]);
    else P.push(["b", 0, 12, w, 24, 0, h, fr], ["b", 0, 26, w - 80, 6, 40, h - 40, "mirror"]);
    return { parts: P };
  }, { m: "wall", z: 900 });
  pm("curtain_p", "Curtain with rod — any width and drop", FU, 1800, 120, 2400, "curtain", [["", "Two panels, drawn to the sides"], ["closed", "Closed"], ["sheer", "Sheer (white) with side panels"], ["blind", "Roller blind"]], function (w, d, h, e) {
    var v = e.var || "", P = [["c", -w / 2 - 60, 60, 14, h - 30, h - 2, "steel_ss"], ["c", w / 2 + 60, 60, 14, h - 30, h - 2, "steel_ss"], ["b", 0, 60, w + 120, 22, h - 28, h - 6, "steel_ss"]];
    function folds(x0, x1, look) { var n = Math.max(2, Math.round((x1 - x0) / 90)), fw = (x1 - x0) / n; for (var i = 0; i < n; i++) P.push(["b", x0 + fw * (i + 0.5), 60 + (i % 2 ? 14 : -14), fw + 4, 30, 20, h - 30, look]); }
    if (v === "blind") { P = [["b", 0, 40, w, 70, h - 70, h, WH], ["b", 0, 40, w - 20, 6, h * 0.35, h - 70, FB], ["b", 0, 40, w - 20, 24, h * 0.35 - 24, h * 0.35, "steel_ss"]]; }
    else if (v === "closed") folds(-w / 2, w / 2, FB);
    else { if (v === "sheer") P.push(["b", 0, 40, w, 6, 20, h - 30, "glass_frosted"]); folds(-w / 2, -w / 2 + w * 0.22, FB); folds(w / 2 - w * 0.22, w / 2, FB); }
    return { parts: P };
  }, { m: "wall", z: 0 });
  pm("rug_p", "Rug / carpet — any size", FU, 2000, 1400, 14, "rug", [["", "Plain with border"], ["stripe", "Striped"]], function (w, d, h, e) {
    var P = [["b", 0, 0, w, d, 0, 8, "paint_wine"], ["b", 0, 0, w - 200, d - 200, 8, 12, FB]]; if (e.var === "stripe") { P = [["b", 0, 0, w, d, 0, 8, FB]]; var n = Math.max(3, Math.round(w / 250)); for (var i = 0; i < n; i += 2) P.push(["b", -w / 2 + (w / n) * (i + 0.5), 0, w / n, d, 8, 12, "paint_denim"]); } return { parts: P };
  });
})();
