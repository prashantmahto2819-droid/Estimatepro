/* Planner — interior of one room: furniture laid out by simple rules (bed head against the wall opposite the door, wardrobe on a side
   wall away from the door, study at the window; sofa on the quiet long wall facing the TV …), floor, false ceiling, wall finish and
   lights; a modular kitchen (straight / L / parallel / U run of base and wall units, sink at the window, hob with chimney, fridge by
   the door) or a toilet (WC, basin or vanity, shower area, geyser, tiles); with an item-wise cost at basic / standard / premium level and a CAD build (walls, door, window, finishes, furniture). */
(function () {
  "use strict";
  var EP = window.EP, U = EP.ui, esc = U.esc, PL = EP.plan, KEY = "ep_plan_interior_v1";
  var S = { name: "Master bed room", type: "master", W: 4.2, D: 3.9, H: 3.0, door: "S", dpos: 0.2, win: "E", level: "standard", floor: "vitrified", ceil: "gypsum", wall: "paint", feature: "headboard", off: {} };
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
  var save = function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  var TYPES = { master: ["Master bed room", "मास्टर बेडरूम"], bed: ["Bed room", "बेडरूम"], kids: ["Kids' room", "बच्चों का कमरा"], living: ["Living room", "लिविंग / ड्रॉइंग"], dining: ["Dining", "डाइनिंग"], study: ["Study / home office", "स्टडी / ऑफ़िस"], kitchen: ["Kitchen (modular)", "किचन / रसोई"], toilet: ["Toilet / bathroom", "टॉयलेट / बाथरूम"] };
  /* item → [name, standard price ₹] */
  var ITEM = { bed_queen_storage: ["Queen bed with storage", 45000], bed_double: ["Double bed", 32000], bed_single: ["Single bed", 18000], bedside_table: ["Bedside table", 6000], wardrobe_sliding: ["Sliding wardrobe 2.4 m, full height", 85000], wardrobe_3door: ["Wardrobe 3-door 1.5 m", 55000],
    study_table: ["Study table with drawers", 15000], dressing_table: ["Dressing table with mirror", 18000], tv_unit_floating: ["Floating TV unit 2.1 m", 38000], tv_unit: ["TV unit 1.5 m", 22000], sofa_3: ["Sofa 3-seater", 55000], sofa_sectional_L: ["L-shaped sectional sofa", 120000],
    armchair: ["Armchair", 18000], coffee_table_round: ["Coffee table", 12000], dining_table: ["Dining table 6-seater", 45000], dining_table_4: ["Dining table 4-seater", 28000], chair: ["Chair", 4000], crockery_unit: ["Crockery unit 1.5 m", 40000],
    shoe_cabinet_seat: ["Shoe cabinet with seat", 15000], bookshelf: ["Bookshelf", 12000], desk: ["Office desk", 15000], office_chair: ["Office chair", 9000], bunk_bed: ["Bunk bed", 38000],
    base_cabinet_600: ["Base unit 600 with granite top", 14000], base_cabinet_900: ["Base unit 900, drawers, granite top", 22000], sink_cabinet_double: ["Sink unit 1200, double-bowl SS sink + mixer", 30000], hob_built_in: ["Built-in 4-burner hob", 18000], chimney: ["Chimney 60 cm, auto-clean", 16000],
    wall_cabinet_600: ["Wall unit 600", 9000], wall_cabinet_900: ["Wall unit 900", 12500], tall_pantry: ["Tall pantry unit 600", 28000], fridge_double_door: ["Refrigerator, double door", 45000], refrigerator: ["Refrigerator, single door", 22000], dishwasher: ["Dishwasher 600", 42000],
    wc_close_coupled: ["WC, floor-mounted with cistern", 14000], wc_wall_hung: ["WC, wall-hung + concealed cistern", 32000], wc_squat_foot: ["Indian WC (squat pan)", 3500], basin_pedestal: ["Wash basin with pedestal", 5500], vanity_single: ["Vanity unit 900 with basin", 22000],
    shower_cubicle_glass: ["Glass shower enclosure 900 × 900", 28000], shower_wall_mixer: ["Wall mixer with hand shower", 6500], shower_overhead: ["Overhead shower", 3500], geyser: ["Geyser 15 L", 12000], mirror: ["Mirror", 3500], towel_rack: ["Towel rod", 1500], exhaust_fan: ["Exhaust fan", 2500], floor_trap: ["Floor trap with SS grating", 800] };
  var FLOOR = { vitrified: ["Vitrified tiles 600 × 1200", 1450], granite: ["Granite", 2400], kota: ["Kota stone", 1300], ceramic: ["Ceramic tiles", 1100], antiskid: ["Anti-skid ceramic tiles 300 × 300", 950], wood: ["Wooden laminate", 1600] };
  var CEIL = { none: ["No false ceiling", 0], gypsum: ["Gypsum false ceiling with cove", 1250], grid: ["Grid ceiling 600 × 600", 900], pvc: ["PVC panel ceiling", 650], wpc: ["WPC plank ceiling", 2800], wood: ["Wooden plank ceiling", 3400] };
  var FEAT = { none: ["No feature wall", 0], headboard: ["Upholstered headboard panel", 4200], tvwall: ["Fluted / WPC TV-wall panel", 2600], texture: ["Texture paint feature wall", 450], wallpaper: ["Wallpaper feature wall", 900] };
  var LVL = { basic: 0.7, standard: 1, premium: 1.7 };
  function plan() {
    var W = +S.W, D = +S.D, items = [], take = [], opp = { S: "N", N: "S", E: "W", W: "E" }, side = function (w) { return w === "N" || w === "S" ? ["W", "E"] : ["S", "N"]; }, A = (EP.bim && EP.bim.ASSET_LIB) || {};
    var sz = function (k) { var a = A[k] || {}; return [(a.w || 1000) / 1000, (a.d || 600) / 1000]; };
    var len = function (w) { return w === "N" || w === "S" ? W : D; };
    /* the door swing (1 m × 1 m inside the door) and 0.6 m in front of the window are kept clear of tall pieces */
    /* (a toilet door is 750 wide: its swing needs 0.8 m) */
    var ds = S.type === "toilet" ? 0.8 : 1.05, dm = S.type === "toilet" ? 0.1 : 0.15, dx = S.door === "N" || S.door === "S" ? dm + Math.max(0, W - ds - 2 * dm) * S.dpos : 0, dy = S.door === "E" || S.door === "W" ? dm + Math.max(0, D - ds - 2 * dm) * S.dpos : 0;
    var doorBox = S.door === "S" ? [dx, 0, dx + ds, ds] : S.door === "N" ? [dx, D - ds, dx + ds, D] : S.door === "W" ? [0, dy, ds, dy + ds] : [W - ds, dy, W, dy + ds];
    take.push(doorBox);
    var hit = function (b) { return take.some(function (t) { return b[0] < t[2] - 0.01 && b[2] > t[0] + 0.01 && b[1] < t[3] - 0.01 && b[3] > t[1] + 0.01; }) || b[0] < -0.01 || b[1] < -0.01 || b[2] > W + 0.01 || b[3] > D + 0.01; };
    /* along wall w at fraction f; perp = the piece's length goes into the room (bed head to the wall) */
    var put = function (k, w, f, perp, gap) { if (S.off[k]) return null; var z = sz(k), a = perp ? z[1] : z[0], b = perp ? z[0] : z[1], L = len(w), g = gap || 0;
      for (var t = 0; t <= 1; t += 0.05) { var ff = Math.max(0, Math.min(1, f + (t ? (Math.floor(t * 20) % 2 ? 1 : -1) * Math.ceil(t * 10) / 10 : 0))), c = a / 2 + (L - a) * ff, box, x, y;
        if (w === "N") { x = c; y = D - g - b / 2; box = [x - a / 2, D - g - b, x + a / 2, D - g]; } else if (w === "S") { x = c; y = g + b / 2; box = [x - a / 2, g, x + a / 2, g + b]; }
        else if (w === "W") { y = c; x = g + b / 2; box = [g, y - a / 2, g + b, y + a / 2]; } else { y = c; x = W - g - b / 2; box = [W - g - b, y - a / 2, W - g, y + a / 2]; }
        if (L < a || hit(box)) continue; take.push(box); var rot = { N: 0, W: 90, S: 180, E: 270 }[w] + (perp ? 90 : 0); var it = { k: k, x: x, y: y, rot: rot % 360, box: box }; items.push(it); return it; } return null; };
    /* fixed pieces along a wall: at along-wall centre c (mounted ones — wall units, chimney, hob, geyser — sit over others) */
    var at = function (k, w, c, mount) { if (S.off[k] || !A[k] && !ITEM[k]) return null; var z = sz(k), a = z[0], b = z[1], x, y, box;
      if (w === "N") { x = c; y = D - b / 2; box = [c - a / 2, D - b, c + a / 2, D]; } else if (w === "S") { x = c; y = b / 2; box = [c - a / 2, 0, c + a / 2, b]; } else if (w === "W") { x = b / 2; y = c; box = [0, c - a / 2, b, c + a / 2]; } else { x = W - b / 2; y = c; box = [W - b, c - a / 2, W, c + a / 2]; }
      if (!mount) { if (c - a / 2 < -0.01 || c + a / 2 > len(w) + 0.01 || hit(box)) return null; take.push(box); } var it = { k: k, x: x, y: y, rot: { N: 0, W: 90, S: 180, E: 270 }[w], box: box, w: w, c: c, a: a, mount: !!mount }; items.push(it); return it; };
    /* base units from s0 to s1 (cursor from the corner end), skipping what is already there */
    var fill = function (w, s0, s1, fromHigh) { var cur = fromHigh ? s1 : s0, n = 0; while (fromHigh ? cur - 0.6 >= s0 - 1e-6 : cur + 0.6 <= s1 + 1e-6) { var ok = null; [0.9, 0.6].some(function (L) { if (fromHigh ? cur - L < s0 - 1e-6 : cur + L > s1 + 1e-6) return false; ok = at(L > 0.7 ? "base_cabinet_900" : "base_cabinet_600", w, fromHigh ? cur - L / 2 : cur + L / 2); if (ok) cur += fromHigh ? -L : L; return !!ok; }); if (ok) n++; else cur += fromHigh ? -0.05 : 0.05; } return n; };
    var t = S.type, head = opp[S.door], sides = side(S.door).filter(function (w) { return w !== S.win; }).concat(side(S.door).filter(function (w) { return w === S.win; }));
    if (t === "kitchen") {
      /* the main counter under the window (or opposite the door); the fridge at its end nearest the door; the corner at the far end */
      var Pw = S.win !== S.door ? S.win : opp[S.door], ns = Pw === "N" || Pw === "S", Lp = len(Pw), nearHi = S.door === opp[Pw] ? S.dpos >= 0.5 : (ns ? S.door === "E" : S.door === "N"), Qw = nearHi ? (ns ? "W" : "S") : (ns ? "E" : "N"), Q2 = opp[Qw];
      var sh = S.kshape || "auto", other = ns ? D : W; if (sh === "auto") sh = Qw !== S.door && other >= 2.3 && Lp >= 2.4 ? (S.level === "premium" && Q2 !== S.door && other >= 2.7 && Lp >= 2.7 ? "U" : "L") : (opp[Pw] !== S.door && other >= 2.3 ? "parallel" : "straight");
      var fr = at(S.level === "basic" || Lp < 2.4 ? "refrigerator" : "fridge_double_door", Pw, nearHi ? Lp - sz(S.level === "basic" || Lp < 2.4 ? "refrigerator" : "fridge_double_door")[0] / 2 : sz(S.level === "basic" || Lp < 2.4 ? "refrigerator" : "fridge_double_door")[0] / 2);
      var sinkC = S.win === Pw ? Lp / 2 : Lp * (nearHi ? 0.4 : 0.6), sink = at("sink_cabinet_double", Pw, sinkC) || at("sink_cabinet_double", Pw, sinkC + (nearHi ? -0.3 : 0.3)) || at("sink_cabinet_double", Pw, sinkC + (nearHi ? -0.6 : 0.6)); if (sink) sinkC = sink.c;
      var hobOn = null, hobAt = function (w, c) { var hb = at("base_cabinet_600", w, c); if (!hb) return false; hb.hob = 1; at("hob_built_in", w, c, 1); at("chimney", w, c, 1); hobOn = w; return true; };
      var sw2 = sh === "L" || sh === "U" ? Qw : sh === "parallel" ? opp[Pw] : null, Lq = sw2 ? len(sw2) : 0, hiCorner = Pw === "N" || Pw === "E";
      if (sw2 && sh !== "parallel") { var q0 = hiCorner ? 0 : 0.6, q1 = hiCorner ? Lq - 0.6 : Lq; if (q1 - q0 >= 1.2) hobAt(sw2, hiCorner ? q1 - 0.9 : q0 + 0.9); }
      if (sw2 && sh === "parallel") hobAt(sw2, Lq / 2);
      if (!hobOn) { var far = nearHi ? -1 : 1; [1.5, 1.8, -1.5, -1.8].some(function (dd) { return hobAt(Pw, sinkC + far * dd); }); }
      fill(Pw, 0, Lp, !nearHi);
      if (sw2) { if (sh === "parallel") fill(sw2, 0, Lq, false); else fill(sw2, hiCorner ? 0 : 0.6, hiCorner ? Lq - 0.6 : Lq, hiCorner); }
      if (sh === "U" && Q2 !== S.door) fill(Q2, hiCorner ? 0 : 0.6, hiCorner ? len(Q2) - 0.6 : len(Q2), hiCorner);
      if (S.level === "premium") { var bc = items.filter(function (it) { return it.k === "base_cabinet_600" && !it.hob; })[0]; if (bc && !S.off.dishwasher) { bc.k = "dishwasher"; } }
      /* wall units over the base units, not over the hob (chimney) or across the window */
      items.filter(function (it) { return /^base_cabinet|^sink_cabinet|^dishwasher/.test(it.k) && !it.hob; }).forEach(function (it) { if (it.w === S.win) { var wl = len(it.w) / 2; if (it.c + it.a / 2 > wl - 0.8 && it.c - it.a / 2 < wl + 0.8) return; } var wk = it.a > 0.7 ? "wall_cabinet_900" : "wall_cabinet_600"; if (it.k === "sink_cabinet_double") { at("wall_cabinet_600", it.w, it.c - 0.3, 1); at("wall_cabinet_600", it.w, it.c + 0.3, 1); } else at(wk, it.w, it.c, 1); });
      return { items: items, door: doorBox, shape: sh, run: items.filter(function (it) { return /^base_cabinet|^sink_cabinet|^dishwasher/.test(it.k); }).reduce(function (a2, it) { return a2 + it.a; }, 0), walls: items.filter(function (it) { return !it.mount && /^base|^sink|^dish/.test(it.k); }).map(function (it) { return it.w; }).filter(function (w, i, a3) { return a3.indexOf(w) === i; }) };
    }
    if (t === "toilet") {
      /* far wall: the wet (shower) zone — a glass corner enclosure in a wide room, else a 0.9 m strip across the room; then the WC on a
         side wall just clear of it (centre line at least 0.4 m from a wall), the basin by the door; geyser over the shower, tiles to 2.1 m */
      var far2 = opp[S.door], sd2 = side(S.door), farLen = len(far2), farHi = far2 === "N" || far2 === "E", Ls = len(sd2[0]);
      var wcK = S.wc && S.wc !== "auto" ? S.wc : S.level === "premium" ? "wc_wall_hung" : "wc_close_coupled", bsK = S.level === "basic" ? "basin_pedestal" : "vanity_single";
      var scan = function (k, w, from, to) { var st = from < to ? 0.05 : -0.05; for (var c = from; st > 0 ? c <= to + 1e-6 : c >= to - 1e-6; c += st) { var it = at(k, w, Math.round(c * 1000) / 1000); if (it) return it; } return null; };
      var narrow = farLen < 1.8 || S.level === "basic", shC, shDepth = 0.9;
      if (!narrow) { var e0 = at("shower_cubicle_glass", far2, 0.45) || at("shower_cubicle_glass", far2, farLen - 0.45); if (e0) shC = e0.c; else narrow = true; }
      if (narrow) { shC = farLen / 2; at("shower_wall_mixer", far2, shC, 1); at("shower_overhead", far2, shC, 1); take.push(far2 === "N" ? [0, D - shDepth, W, D] : far2 === "S" ? [0, 0, W, shDepth] : far2 === "E" ? [W - shDepth, 0, W, D] : [0, 0, shDepth, D]); }
      var shX = far2 === "N" || far2 === "S" ? shC : (far2 === "E" ? W - 0.45 : 0.45), shY = far2 === "E" || far2 === "W" ? shC : (far2 === "N" ? D - 0.45 : 0.45);
      at("geyser", far2, Math.max(0.25, Math.min(farLen - 0.25, shC + (shC < farLen / 2 ? 0.25 : -0.25))), 1); items.push({ k: "floor_trap", x: shX, y: shY, rot: 0, box: [shX - 0.075, shY - 0.075, shX + 0.075, shY + 0.075], mount: true });
      /* along a side wall, "far" end = next to the wet zone; the side wall away from the door first */
      var dmid = (S.door === "N" || S.door === "S" ? (doorBox[0] + doorBox[2]) / 2 / W : (doorBox[1] + doorBox[3]) / 2 / D), awayW = dmid > 0.5 ? sd2[0] : sd2[1], nearW = awayW === sd2[0] ? sd2[1] : sd2[0];
      var farEnd = function (w, gap) { return farHi ? Ls - gap : gap; }, nearEnd = function (gap) { return farHi ? gap : Ls - gap; };
      var wcZ = 0.4, wc = scan(wcK, awayW, farEnd(awayW, shDepth * (narrow ? 1 : 0) + wcZ), nearEnd(wcZ)) || scan(wcK, nearW, farEnd(nearW, shDepth * (narrow ? 1 : 0) + wcZ), nearEnd(wcZ));
      var bs2 = null; [bsK, "basin_pedestal", "basin_wall_hung"].some(function (k) { bs2 = scan(k, wc && wc.w === awayW ? nearW : awayW, nearEnd(0.35), farEnd(null, 0.35)) || scan(k, wc ? wc.w : nearW, nearEnd(0.35), farEnd(null, 0.35)); return !!bs2; });
      if (bs2) at("mirror", bs2.w, bs2.c, 1);
      at("towel_rack", wc && wc.w === awayW ? nearW : awayW, farEnd(null, shDepth + 0.35), 1); at("exhaust_fan", S.win !== S.door ? S.win : far2, len(S.win !== S.door ? S.win : far2) / 2, 1);
      return { items: items, door: doorBox, wet: [shX, shY], narrow: narrow };
    }
    if (t === "master" || t === "bed" || t === "kids") {
      var bk = t === "kids" ? (S.off.bunk_bed ? "bed_single" : "bunk_bed") : Math.min(W, D) >= 3.3 && t === "master" ? "bed_queen_storage" : "bed_double", bed = put(bk, head, 0.5, t !== "kids");
      if (bed && t !== "kids") { var bz = sz(bk); [-1, 1].forEach(function (sd) { var k = "bedside_table", z = sz(k); if (S.off[k]) return; var cx = head === "N" || head === "S" ? bed.x + sd * (bz[1] / 2 + z[0] / 2 + 0.02) : bed.x, cy = head === "E" || head === "W" ? bed.y + sd * (bz[1] / 2 + z[0] / 2 + 0.02) : bed.y;
        if (head === "N") cy = D - z[1] / 2; if (head === "S") cy = z[1] / 2; if (head === "W") cx = z[1] / 2; if (head === "E") cx = W - z[1] / 2; var b = [cx - z[0] / 2, cy - z[1] / 2, cx + z[0] / 2, cy + z[1] / 2]; if (!hit(b)) { take.push(b); items.push({ k: k, x: cx, y: cy, rot: { N: 0, W: 90, S: 180, E: 270 }[head], box: b }); } }); }
      put(len(sides[0]) >= 2.5 && t === "master" ? "wardrobe_sliding" : "wardrobe_3door", sides[0], 0.85) || put("wardrobe_3door", sides[1], 0.85);
      put("study_table", S.win !== head ? S.win : sides[1], 0.5); if (t === "master") put("dressing_table", sides[1], 0.2); if (t !== "kids") put("tv_unit_floating", S.door, 0.6, false, 0); else put("bookshelf", sides[1], 0.6);
    } else if (t === "living") {
      var walls = ["N", "S", "E", "W"].filter(function (w) { return w !== S.door; }).sort(function (a, b) { return (b === S.win ? -1 : 0) - (a === S.win ? -1 : 0) || len(b) - len(a); }), sw = walls[0];
      var sofa = put(W * D > 20 && !S.off.sofa_sectional_L ? "sofa_sectional_L" : "sofa_3", sw, 0.5) || put("sofa_3", walls[1], 0.5); var tvw = sofa ? opp[items[items.length - 1] === sofa ? sw : walls[1]] : walls[1];
      put("tv_unit_floating", tvw, 0.5); var cx = W / 2, cy = D / 2, z = sz("coffee_table_round"); if (!S.off.coffee_table_round) { var b = [cx - z[0] / 2, cy - z[1] / 2, cx + z[0] / 2, cy + z[1] / 2]; if (!hit(b)) { take.push(b); items.push({ k: "coffee_table_round", x: cx, y: cy, rot: 0, box: b }); } }
      put("armchair", side(sw)[0], 0.5, false, 0.3); put("armchair", side(sw)[1], 0.5, false, 0.3); put("shoe_cabinet_seat", S.door, 0.1);
    } else if (t === "dining") {
      var dk = W * D >= 12 ? "dining_table" : "dining_table_4", z2 = sz(dk), cx2 = W / 2, cy2 = D / 2, b2 = [cx2 - z2[0] / 2, cy2 - z2[1] / 2, cx2 + z2[0] / 2, cy2 + z2[1] / 2]; if (!S.off[dk] && !hit(b2)) { take.push(b2); items.push({ k: dk, x: cx2, y: cy2, rot: 0, box: b2 }); }
      put("crockery_unit", sides[0], 0.5);
    } else if (t === "study") { put("desk", S.win, 0.5, false, 0); put("office_chair", S.win, 0.5, false, 0.75); put("bookshelf", sides[0], 0.5); put("bookshelf", sides[1], 0.5); }
    return { items: items, door: doorBox };
  }
  function boq(p) {
    var W = +S.W, D = +S.D, H = +S.H, A = W * D, f = LVL[S.level] || 1, rows = [], row = function (n, q, u, r) { if (q > 0 && r > 0) rows.push({ n: n, q: q, u: u, r: Math.round(r), a: q * r }); };
    var cnt = {}; p.items.forEach(function (it) { cnt[it.k] = (cnt[it.k] || 0) + 1; }); Object.keys(cnt).forEach(function (k) { var I = ITEM[k]; if (I) row(I[0], cnt[k], "no.", I[1] * f); });
    if (cnt.dining_table) row("Dining chairs", 6, "no.", ITEM.chair[1] * f); if (cnt.dining_table_4) row("Dining chairs", 4, "no.", ITEM.chair[1] * f);
    row(FLOOR[S.floor][0] + " incl. skirting", A, "m²", FLOOR[S.floor][1] * (0.85 + 0.15 * f)); row(CEIL[S.ceil][0], A, "m²", CEIL[S.ceil][1] * (0.85 + 0.15 * f));
    var wallA = 2 * (W + D) * H - 1.0 * 2.1 - 1.5 * 1.35, wet = S.type === "toilet", kit = S.type === "kitchen";
    if (wet) { var tileA = 2 * (W + D) * 2.1 - 0.75 * 2.1; row("Wall tiles to 2.1 m (glazed ceramic) with spacers", tileA, "m²", 1150 * (0.85 + 0.15 * f)); row("Waterproofing — floor + 300 mm up the walls (2 coats + fibre mesh)", A + 2 * (W + D) * 0.3, "m²", 320); row("Plumbing — concealed CPVC / PVC lines, traps, angle cocks, health faucet", 1, "job", 18000 * f); wallA = Math.max(0, wallA - tileA); }
    if (kit) { row("Dado tiles 600 mm over the counter", p.run * 0.6, "m²", 1300 * (0.85 + 0.15 * f)); row("Plumbing — sink inlet / outlet, RO point", 1, "job", 6500 * f); row("Electrical points — chimney, hob, fridge, RO, microwave, 6 counter sockets", 1, "job", 12000 * f); }
    row("Putty + primer + two coats of emulsion (walls and ceiling)", wallA + A, "m²", 140 * (0.8 + 0.2 * f));
    var fw = S.feature !== "none" ? (S.feature === "headboard" ? Math.min(W, 2.4) * 1.2 : (S.type === "master" || S.type === "bed" || S.type === "kids" ? W : Math.max(W, D)) * H * 0.8) : 0; row(FEAT[S.feature][0], fw, "m²", FEAT[S.feature][1] * f);
    var dl = Math.max(2, Math.round(A / 2.2)); if (S.ceil !== "none") { row("LED downlights", dl, "no.", 1200 * f); row("LED cove / profile light", 2 * (W + D) - 1, "m", 650 * f); } else row("LED ceiling lights", Math.max(1, Math.round(A / 9)), "no.", 2200 * f);
    if (!wet) row("Curtains with track (window)", 1, "no.", (kit ? 5000 : 9000) * f); if (!kit) row("Electrical changes (points, switches)", 1, "job", (wet ? 5000 : 8000) * f);
    return { rows: rows, tot: rows.reduce(function (a, r) { return a + r.a; }, 0) };
  }
  function svg(p) {
    var W = +S.W, D = +S.D, sc = Math.min(460 / W, 400 / D), o = [], X = function (v) { return (v * sc + 12).toFixed(1); }, Y = function (v) { return ((D - v) * sc + 12).toFixed(1); };
    o.push("<rect x='12' y='12' width='" + (W * sc).toFixed(1) + "' height='" + (D * sc).toFixed(1) + "' fill='#fff' stroke='#222' stroke-width='5'/>");
    var b = p.door; o.push("<path d='M" + X(b[0]) + " " + Y(b[1]) + " L" + X(b[2]) + " " + Y(b[1]) + " L" + X(b[2]) + " " + Y(b[3]) + " L" + X(b[0]) + " " + Y(b[3]) + "Z' fill='#fff3e0' stroke='#ef6c00' stroke-dasharray='3 2'/>");
    var wn = { N: [W / 2 - 0.75, D, W / 2 + 0.75, D], S: [W / 2 - 0.75, 0, W / 2 + 0.75, 0], W: [0, D / 2 - 0.75, 0, D / 2 + 0.75], E: [W, D / 2 - 0.75, W, D / 2 + 0.75] }[S.win];
    o.push("<line x1='" + X(wn[0]) + "' y1='" + Y(wn[1]) + "' x2='" + X(wn[2]) + "' y2='" + Y(wn[3]) + "' stroke='#29b6f6' stroke-width='6'/>");
    p.items.slice().sort(function (a, b) { return (a.mount ? 1 : 0) - (b.mount ? 1 : 0); }).forEach(function (it) { var bx = it.box; if (it.mount) { o.push("<rect x='" + X(bx[0]) + "' y='" + Y(bx[3]) + "' width='" + ((bx[2] - bx[0]) * sc).toFixed(1) + "' height='" + ((bx[3] - bx[1]) * sc).toFixed(1) + "' fill='none' stroke='#8e24aa' stroke-dasharray='3 2'/>"); return; } o.push("<rect x='" + X(bx[0]) + "' y='" + Y(bx[3]) + "' width='" + ((bx[2] - bx[0]) * sc).toFixed(1) + "' height='" + ((bx[3] - bx[1]) * sc).toFixed(1) + "' fill='" + (it.hob ? "#ffccbc" : "#e8eaf6") + "' stroke='#3949ab' rx='3'/><text x='" + X((bx[0] + bx[2]) / 2) + "' y='" + Y((bx[1] + bx[3]) / 2 - 0.05) + "' font-size='9' text-anchor='middle'>" + esc(it.hob ? "Hob" : (ITEM[it.k] || [it.k])[0].split(" ").slice(0, 2).join(" ").replace(/,$/, "")) + "</text>"); });
    o.push("<text x='" + X(W / 2) + "' y='" + (D * sc + 30).toFixed(1) + "' font-size='11' text-anchor='middle'>" + W + " × " + D + " m · door " + S.door + " · window " + S.win + "</text>");
    return "<svg viewBox='0 0 " + (W * sc + 24).toFixed(0) + " " + (D * sc + 40).toFixed(0) + "' style='width:100%;max-width:490px;height:auto'>" + o.join("") + "</svg>";
  }
  var sel = function (k, lab, v, opts) { return '<label style="display:flex;flex-direction:column;gap:2px"><span class="muted small">' + lab + '</span><select class="in small" data-pif="' + k + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(v) === String(o[0]) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></label>"; };
  var num = function (k, lab, v, st) { return '<label style="display:flex;flex-direction:column;gap:2px"><span class="muted small">' + lab + '</span><input class="in small" style="width:90px" type="number" step="' + (st || 0.1) + '" data-pif="' + k + '" value="' + v + '"></label>'; };
  var dirs = [["N", "North / top"], ["S", "South / bottom"], ["E", "East / right"], ["W", "West / left"]];
  PL.MODES.interior = { n: "Interior", hi: "इंटीरियर", icon: "🛋", render: function () {
    var p = plan(), q = boq(p), inr = function (v) { return "₹ " + Math.round(v).toLocaleString("en-IN"); };
    var h = '<div class="plm" data-plmode-root="interior" style="display:flex;flex-direction:column;gap:14px;max-width:1200px">';
    h += '<div><h1 style="margin:0">Interior planner <span class="muted" style="font-size:.55em;font-weight:500">कमरे का इंटीरियर — फ़र्नीचर, सीलिंग, फ़र्श, लाइट, लागत</span></h1><p class="muted" style="margin:4px 0 0">One room at a time: give the size, the door and the window — the furniture is laid out, with the floor, false ceiling, feature wall, lights and an item-wise cost; build it in CAD for the 2D / 3D views.</p></div>';
    h += '<section class="panel" style="padding:12px 14px"><h3 style="margin:0 0 8px">1. Room</h3><div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">' + sel("type", "Room", S.type, Object.keys(TYPES).map(function (k) { return [k, TYPES[k][0] + " — " + TYPES[k][1]]; })) + num("W", "Width m", S.W) + num("D", "Length m", S.D) + num("H", "Height m", S.H) +
      sel("door", "Door on the wall", S.door, dirs) + '<label style="display:flex;flex-direction:column;gap:2px"><span class="muted small">Door position</span><input type="range" min="0" max="1" step="0.05" data-pif="dpos" value="' + S.dpos + '"></label>' + sel("win", "Window on the wall", S.win, dirs) + "</div></section>";
    h += '<section class="panel" style="padding:12px 14px"><h3 style="margin:0 0 8px">2. Finishes and level</h3><div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">' + sel("level", "Level / बजट स्तर", S.level, [["basic", "Basic"], ["standard", "Standard"], ["premium", "Premium"]]) + sel("floor", "Floor", S.floor, Object.keys(FLOOR).map(function (k) { return [k, FLOOR[k][0]]; })) + sel("ceil", "False ceiling", S.ceil, Object.keys(CEIL).map(function (k) { return [k, CEIL[k][0]]; })) + (S.type === "kitchen" || S.type === "toilet" ? "" : sel("feature", "Feature wall", S.feature, Object.keys(FEAT).map(function (k) { return [k, FEAT[k][0]]; }))) +
      (S.type === "kitchen" ? sel("kshape", "Kitchen shape", S.kshape || "auto", [["auto", "Auto (fits the room)"], ["straight", "Straight (one wall)"], ["L", "L-shape"], ["parallel", "Parallel (two walls)"], ["U", "U-shape"]]) : "") +
      (S.type === "toilet" ? sel("wc", "WC", S.wc || "auto", [["auto", "Auto (by level)"], ["wc_close_coupled", "Floor-mounted (EWC)"], ["wc_wall_hung", "Wall-hung"], ["wc_squat_foot", "Indian (squat)"]]) : "") + "</div>" +
      '<div class="small" style="margin-top:8px">Furniture: ' + p.items.map(function (it) { return it.k; }).concat(Object.keys(S.off)).filter(function (k, i, a) { return a.indexOf(k) === i && ITEM[k]; }).map(function (k) { return '<label style="margin-right:10px;white-space:nowrap"><input type="checkbox" data-pioff="' + k + '"' + (S.off[k] ? "" : " checked") + "> " + esc(ITEM[k][0]) + "</label>"; }).join("") + "</div></section>";
    h += '<section class="panel" style="padding:12px 14px"><h3 style="margin:0 0 8px">3. Layout and cost</h3><div class="row" style="gap:14px;align-items:flex-start;flex-wrap:wrap"><div style="flex:1;min-width:240px">' + svg(p) + '<div class="small muted">Orange dashes = door swing kept clear · blue = window · purple dashes = wall-mounted (wall units, chimney, geyser, mirror)' + (p.shape ? " · kitchen: " + p.shape + " shape, counter " + p.run.toFixed(2) + " m" : "") + '</div></div><div style="flex:1.2;min-width:260px;overflow-x:auto"><table class="tbl" style="width:100%;font-size:13px;border-collapse:collapse"><tr><th style="text-align:left">Item</th><th>Qty</th><th>Unit</th><th>Rate ₹</th><th>Amount ₹</th></tr>' +
      q.rows.map(function (r) { return "<tr><td>" + esc(r.n) + '</td><td style="text-align:right">' + (r.u === "no." || r.u === "job" ? r.q : r.q.toFixed(1)) + "</td><td>" + r.u + '</td><td style="text-align:right">' + r.r.toLocaleString("en-IN") + '</td><td style="text-align:right">' + Math.round(r.a).toLocaleString("en-IN") + "</td></tr>"; }).join("") +
      '<tr><td colspan="4"><b>Total (' + S.level + ")</b></td><td style=\"text-align:right\"><b>" + inr(q.tot) + "</b></td></tr></table><p class=\"small muted\">Indicative market rates for India; your vendor's quotation decides. About " + inr(q.tot / (+S.W * +S.D * 10.764)) + " per sq ft of floor.</p></div></div>" +
      '<div class="row" style="gap:8px;margin-top:10px"><button type="button" class="btn pri" data-pibuild>Build in CAD — 2D and 3D</button></div></section>';
    return h + "</div>";
  } };
  document.addEventListener("change", function (e) { var el = e.target; if (!el.closest || !el.closest(".plm[data-plmode-root=interior]")) return;
    if (el.dataset.pioff) { if (el.checked) delete S.off[el.dataset.pioff]; else S.off[el.dataset.pioff] = 1; save(); U.render(); return; }
    var k = el.dataset.pif; if (!k) return; S[k] = el.type === "number" || el.type === "range" ? +el.value : el.value; if (k === "type") { S.name = TYPES[S.type][0]; S.off = {}; S.feature = /bed|master|kids/.test(S.type) ? "headboard" : S.type === "living" ? "tvwall" : "none";
      if (S.type === "kitchen") { S.W = 3.0; S.D = 2.7; S.door = "S"; S.dpos = 0.1; S.win = "N"; S.floor = "vitrified"; S.ceil = "gypsum"; } else if (S.type === "toilet") { S.W = 1.5; S.D = 2.4; S.door = "S"; S.dpos = 1; S.win = "N"; S.floor = "antiskid"; S.ceil = "pvc"; } } save(); U.render(); });
  document.addEventListener("click", async function (e) { var b = e.target.closest && e.target.closest("[data-pibuild]"); if (!b || !b.closest(".plm")) return;
    var CAD = EP.cad, B = EP.bim, d = CAD.newDoc(S.name || "Room", "mm"), bs = B.ensure(d); bs.levels = [{ id: "L0", name: "Room", elev: 0, h: Math.round(+S.H * 1000) }]; bs.cur = "L0";
    var ents = d.ents, add = function (o) { o.id = CAD.uid(); ents.push(o); return o; }, M = function (v) { return Math.round(v * 1000); }, W = +S.W, D = +S.D, p = plan();
    var c = [[-0.115, -0.115], [W + 0.115, -0.115], [W + 0.115, D + 0.115], [-0.115, D + 0.115]], wall = {};
    ["S", "E", "N", "W"].forEach(function (k, i) { var a = c[i], bq = c[(i + 1) % 4]; wall[k] = add({ t: "wall", a: [M(a[0]), M(a[1])], b: [M(bq[0]), M(bq[1])], th: 230, h: null, mat: "brick", just: "c", lvl: "L0", layer: "A-WALL" }); });
    var Lw = function (k) { return k === "N" || k === "S" ? W + 0.23 : D + 0.23; }, along = function (k, v) { /* wall a→b runs S: +x, E: +y, N: −x, W: −y */ return k === "S" || k === "E" ? v + 0.115 : Lw(k) - v - 0.115; };
    var dc = S.door === "N" || S.door === "S" ? (p.door[0] + p.door[2]) / 2 : (p.door[1] + p.door[3]) / 2; add({ t: "door", host: wall[S.door].id, at: M(along(S.door, dc)), w: S.type === "toilet" ? 750 : 900, h: 2100, sill: 0, preset: "D2", kind: "single", flip: false, swing: "l", layer: "A-DOOR" });
    var wv = S.type === "toilet" ? { w: 600, h: 450, sill: 1800, preset: "V1" } : S.type === "kitchen" ? { w: 1200, h: 1200, sill: 1050, preset: "W2" } : { w: 1500, h: 1350, sill: 900, preset: "W1" }; add({ t: "window", host: wall[S.win].id, at: M(along(S.win, (S.win === "N" || S.win === "S" ? W : D) / 2)), w: wv.w, h: wv.h, sill: wv.sill, preset: wv.preset, layer: "A-WIN" });
    /* tiles: full walls to 2.1 m in a toilet; a 600 mm band over the counter in a kitchen */
    var G = EP.geom, tileW = function (wk, kind, z0, z1) { var w = wall[wk]; if (!w || !B.FIN || !B.FIN[kind]) return; var L = B.wallLine(w), cen = [M(W / 2), M(D / 2)], sd = G.dot(G.sub(cen, L.a), L.n) >= 0 ? 0 : 1, F = B.FIN[kind]; w.fin = w.fin || {}; w.fin["f" + (Object.keys(w.fin).length + 1)] = { k: kind, fc: sd, th: F.th, z0: z0, z1: z1, s0: 115, s1: Math.round(Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1])) - 115, look: F.look, ded: true }; };
    if (S.type === "toilet") ["S", "E", "N", "W"].forEach(function (k) { tileW(k, "tile", 0, 2100); }); if (S.type === "kitchen" && p.walls) p.walls.forEach(function (k) { tileW(k, "dado", 850, 1450); });
    add({ t: "room", pts: [[0, 0], [M(W), 0], [M(W), M(D)], [0, M(D)]], name: S.name, lvl: "L0", floor: S.floor === "wood" ? "vitrified" : S.floor, skirt: true, layer: "A-ROOM" });
    if (S.ceil !== "none") add({ t: "czone", pts: [[0, 0], [M(W), 0], [M(W), M(D)], [0, M(D)]], lvl: "L0", kind: S.ceil, z: null, dir: 0, start: 0, slope: 0, layer: "A-CEIL" });
    p.items.forEach(function (it) { if (B.ASSET_LIB && !B.ASSET_LIB[it.k]) return; add({ t: "asset", kind: it.k, p: [M(it.x), M(it.y)], rot: it.rot, lvl: "L0", layer: /^(wc_|basin|vanity|shower|geyser|floor_trap|sink)/.test(it.k) ? "P-FIXT" : "A-FURN" }); });
    U.toast("Making the room drawing…"); await CAD.newDrawing(d.name, "mm", d); window.scrollTo(0, 0); U.toast("Room built — 3D button for the view, Σ Quantities for the estimate");
  });
})();
