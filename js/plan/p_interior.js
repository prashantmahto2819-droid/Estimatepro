/* Planner — interior of one room: furniture laid out by simple rules (bed head against the wall opposite the door, wardrobe on a side
   wall away from the door, study at the window; sofa on the quiet long wall facing the TV …), floor, false ceiling, wall finish and
   lights, with an item-wise cost at basic / standard / premium level and a CAD build (walls, door, window, finishes, furniture). */
(function () {
  "use strict";
  var EP = window.EP, U = EP.ui, esc = U.esc, PL = EP.plan, KEY = "ep_plan_interior_v1";
  var S = { name: "Master bed room", type: "master", W: 4.2, D: 3.9, H: 3.0, door: "S", dpos: 0.2, win: "E", level: "standard", floor: "vitrified", ceil: "gypsum", wall: "paint", feature: "headboard", off: {} };
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
  var save = function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  var TYPES = { master: ["Master bed room", "मास्टर बेडरूम"], bed: ["Bed room", "बेडरूम"], kids: ["Kids' room", "बच्चों का कमरा"], living: ["Living room", "लिविंग / ड्रॉइंग"], dining: ["Dining", "डाइनिंग"], study: ["Study / home office", "स्टडी / ऑफ़िस"] };
  /* item → [name, standard price ₹] */
  var ITEM = { bed_queen_storage: ["Queen bed with storage", 45000], bed_double: ["Double bed", 32000], bed_single: ["Single bed", 18000], bedside_table: ["Bedside table", 6000], wardrobe_sliding: ["Sliding wardrobe 2.4 m, full height", 85000], wardrobe_3door: ["Wardrobe 3-door 1.5 m", 55000],
    study_table: ["Study table with drawers", 15000], dressing_table: ["Dressing table with mirror", 18000], tv_unit_floating: ["Floating TV unit 2.1 m", 38000], tv_unit: ["TV unit 1.5 m", 22000], sofa_3: ["Sofa 3-seater", 55000], sofa_sectional_L: ["L-shaped sectional sofa", 120000],
    armchair: ["Armchair", 18000], coffee_table_round: ["Coffee table", 12000], dining_table: ["Dining table 6-seater", 45000], dining_table_4: ["Dining table 4-seater", 28000], chair: ["Chair", 4000], crockery_unit: ["Crockery unit 1.5 m", 40000],
    shoe_cabinet_seat: ["Shoe cabinet with seat", 15000], bookshelf: ["Bookshelf", 12000], desk: ["Office desk", 15000], office_chair: ["Office chair", 9000], bunk_bed: ["Bunk bed", 38000] };
  var FLOOR = { vitrified: ["Vitrified tiles 600 × 1200", 1450], granite: ["Granite", 2400], kota: ["Kota stone", 1300], ceramic: ["Ceramic tiles", 1100], wood: ["Wooden laminate", 1600] };
  var CEIL = { none: ["No false ceiling", 0], gypsum: ["Gypsum false ceiling with cove", 1250], grid: ["Grid ceiling 600 × 600", 900], wpc: ["WPC plank ceiling", 2800], wood: ["Wooden plank ceiling", 3400] };
  var FEAT = { none: ["No feature wall", 0], headboard: ["Upholstered headboard panel", 4200], tvwall: ["Fluted / WPC TV-wall panel", 2600], texture: ["Texture paint feature wall", 450], wallpaper: ["Wallpaper feature wall", 900] };
  var LVL = { basic: 0.7, standard: 1, premium: 1.7 };
  function plan() {
    var W = +S.W, D = +S.D, items = [], take = [], opp = { S: "N", N: "S", E: "W", W: "E" }, side = function (w) { return w === "N" || w === "S" ? ["W", "E"] : ["S", "N"]; }, A = (EP.bim && EP.bim.ASSET_LIB) || {};
    var sz = function (k) { var a = A[k] || {}; return [(a.w || 1000) / 1000, (a.d || 600) / 1000]; };
    var len = function (w) { return w === "N" || w === "S" ? W : D; };
    /* the door swing (1 m × 1 m inside the door) and 0.6 m in front of the window are kept clear of tall pieces */
    var dx = S.door === "N" || S.door === "S" ? 0.15 + (W - 1.2) * S.dpos : 0, dy = S.door === "E" || S.door === "W" ? 0.15 + (D - 1.2) * S.dpos : 0;
    var doorBox = S.door === "S" ? [dx, 0, dx + 1.05, 1.05] : S.door === "N" ? [dx, D - 1.05, dx + 1.05, D] : S.door === "W" ? [0, dy, 1.05, dy + 1.05] : [W - 1.05, dy, W, dy + 1.05];
    take.push(doorBox);
    var hit = function (b) { return take.some(function (t) { return b[0] < t[2] - 0.01 && b[2] > t[0] + 0.01 && b[1] < t[3] - 0.01 && b[3] > t[1] + 0.01; }) || b[0] < -0.01 || b[1] < -0.01 || b[2] > W + 0.01 || b[3] > D + 0.01; };
    /* along wall w at fraction f; perp = the piece's length goes into the room (bed head to the wall) */
    var put = function (k, w, f, perp, gap) { if (S.off[k]) return null; var z = sz(k), a = perp ? z[1] : z[0], b = perp ? z[0] : z[1], L = len(w), g = gap || 0;
      for (var t = 0; t <= 1; t += 0.05) { var ff = Math.max(0, Math.min(1, f + (t ? (Math.floor(t * 20) % 2 ? 1 : -1) * Math.ceil(t * 10) / 10 : 0))), c = a / 2 + (L - a) * ff, box, x, y;
        if (w === "N") { x = c; y = D - g - b / 2; box = [x - a / 2, D - g - b, x + a / 2, D - g]; } else if (w === "S") { x = c; y = g + b / 2; box = [x - a / 2, g, x + a / 2, g + b]; }
        else if (w === "W") { y = c; x = g + b / 2; box = [g, y - a / 2, g + b, y + a / 2]; } else { y = c; x = W - g - b / 2; box = [W - g - b, y - a / 2, W - g, y + a / 2]; }
        if (L < a || hit(box)) continue; take.push(box); var rot = { N: 0, W: 90, S: 180, E: 270 }[w] + (perp ? 90 : 0); var it = { k: k, x: x, y: y, rot: rot % 360, box: box }; items.push(it); return it; } return null; };
    var t = S.type, head = opp[S.door], sides = side(S.door).filter(function (w) { return w !== S.win; }).concat(side(S.door).filter(function (w) { return w === S.win; }));
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
    var wallA = 2 * (W + D) * H - 1.0 * 2.1 - 1.5 * 1.35; row("Putty + primer + two coats of emulsion (walls and ceiling)", wallA + A, "m²", 140 * (0.8 + 0.2 * f));
    var fw = S.feature !== "none" ? (S.feature === "headboard" ? Math.min(W, 2.4) * 1.2 : (S.type === "master" || S.type === "bed" || S.type === "kids" ? W : Math.max(W, D)) * H * 0.8) : 0; row(FEAT[S.feature][0], fw, "m²", FEAT[S.feature][1] * f);
    var dl = Math.max(2, Math.round(A / 2.2)); if (S.ceil !== "none") { row("LED downlights", dl, "no.", 1200 * f); row("LED cove / profile light", 2 * (W + D) - 1, "m", 650 * f); } else row("LED ceiling lights", Math.max(1, Math.round(A / 9)), "no.", 2200 * f);
    row("Curtains with track (window)", 1, "no.", 9000 * f); row("Electrical changes (points, switches)", 1, "job", 8000 * f);
    return { rows: rows, tot: rows.reduce(function (a, r) { return a + r.a; }, 0) };
  }
  function svg(p) {
    var W = +S.W, D = +S.D, sc = Math.min(460 / W, 400 / D), o = [], X = function (v) { return (v * sc + 12).toFixed(1); }, Y = function (v) { return ((D - v) * sc + 12).toFixed(1); };
    o.push("<rect x='12' y='12' width='" + (W * sc).toFixed(1) + "' height='" + (D * sc).toFixed(1) + "' fill='#fff' stroke='#222' stroke-width='5'/>");
    var b = p.door; o.push("<path d='M" + X(b[0]) + " " + Y(b[1]) + " L" + X(b[2]) + " " + Y(b[1]) + " L" + X(b[2]) + " " + Y(b[3]) + " L" + X(b[0]) + " " + Y(b[3]) + "Z' fill='#fff3e0' stroke='#ef6c00' stroke-dasharray='3 2'/>");
    var wn = { N: [W / 2 - 0.75, D, W / 2 + 0.75, D], S: [W / 2 - 0.75, 0, W / 2 + 0.75, 0], W: [0, D / 2 - 0.75, 0, D / 2 + 0.75], E: [W, D / 2 - 0.75, W, D / 2 + 0.75] }[S.win];
    o.push("<line x1='" + X(wn[0]) + "' y1='" + Y(wn[1]) + "' x2='" + X(wn[2]) + "' y2='" + Y(wn[3]) + "' stroke='#29b6f6' stroke-width='6'/>");
    p.items.forEach(function (it) { var bx = it.box; o.push("<rect x='" + X(bx[0]) + "' y='" + Y(bx[3]) + "' width='" + ((bx[2] - bx[0]) * sc).toFixed(1) + "' height='" + ((bx[3] - bx[1]) * sc).toFixed(1) + "' fill='#e8eaf6' stroke='#3949ab' rx='3'/><text x='" + X((bx[0] + bx[2]) / 2) + "' y='" + Y((bx[1] + bx[3]) / 2 - 0.05) + "' font-size='9' text-anchor='middle'>" + esc((ITEM[it.k] || [it.k])[0].split(" ").slice(0, 2).join(" ")) + "</text>"); });
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
    h += '<section class="panel" style="padding:12px 14px"><h3 style="margin:0 0 8px">2. Finishes and level</h3><div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">' + sel("level", "Level / बजट स्तर", S.level, [["basic", "Basic"], ["standard", "Standard"], ["premium", "Premium"]]) + sel("floor", "Floor", S.floor, Object.keys(FLOOR).map(function (k) { return [k, FLOOR[k][0]]; })) + sel("ceil", "False ceiling", S.ceil, Object.keys(CEIL).map(function (k) { return [k, CEIL[k][0]]; })) + sel("feature", "Feature wall", S.feature, Object.keys(FEAT).map(function (k) { return [k, FEAT[k][0]]; })) + "</div>" +
      '<div class="small" style="margin-top:8px">Furniture: ' + p.items.map(function (it) { return it.k; }).concat(Object.keys(S.off)).filter(function (k, i, a) { return a.indexOf(k) === i && ITEM[k]; }).map(function (k) { return '<label style="margin-right:10px;white-space:nowrap"><input type="checkbox" data-pioff="' + k + '"' + (S.off[k] ? "" : " checked") + "> " + esc(ITEM[k][0]) + "</label>"; }).join("") + "</div></section>";
    h += '<section class="panel" style="padding:12px 14px"><h3 style="margin:0 0 8px">3. Layout and cost</h3><div class="row" style="gap:14px;align-items:flex-start;flex-wrap:wrap"><div style="flex:1;min-width:240px">' + svg(p) + '<div class="small muted">Orange dashes = door swing kept clear · blue = window</div></div><div style="flex:1.2;min-width:260px;overflow-x:auto"><table class="tbl" style="width:100%;font-size:13px;border-collapse:collapse"><tr><th style="text-align:left">Item</th><th>Qty</th><th>Unit</th><th>Rate ₹</th><th>Amount ₹</th></tr>' +
      q.rows.map(function (r) { return "<tr><td>" + esc(r.n) + '</td><td style="text-align:right">' + (r.u === "no." || r.u === "job" ? r.q : r.q.toFixed(1)) + "</td><td>" + r.u + '</td><td style="text-align:right">' + r.r.toLocaleString("en-IN") + '</td><td style="text-align:right">' + Math.round(r.a).toLocaleString("en-IN") + "</td></tr>"; }).join("") +
      '<tr><td colspan="4"><b>Total (' + S.level + ")</b></td><td style=\"text-align:right\"><b>" + inr(q.tot) + "</b></td></tr></table><p class=\"small muted\">Indicative market rates for India; your vendor's quotation decides. About " + inr(q.tot / (+S.W * +S.D * 10.764)) + " per sq ft of floor.</p></div></div>" +
      '<div class="row" style="gap:8px;margin-top:10px"><button type="button" class="btn pri" data-pibuild>Build in CAD — 2D and 3D</button></div></section>';
    return h + "</div>";
  } };
  document.addEventListener("change", function (e) { var el = e.target; if (!el.closest || !el.closest(".plm[data-plmode-root=interior]")) return;
    if (el.dataset.pioff) { if (el.checked) delete S.off[el.dataset.pioff]; else S.off[el.dataset.pioff] = 1; save(); U.render(); return; }
    var k = el.dataset.pif; if (!k) return; S[k] = el.type === "number" || el.type === "range" ? +el.value : el.value; if (k === "type") { S.name = TYPES[S.type][0]; S.off = {}; S.feature = /bed|master|kids/.test(S.type) ? "headboard" : S.type === "living" ? "tvwall" : "none"; } save(); U.render(); });
  document.addEventListener("click", async function (e) { var b = e.target.closest && e.target.closest("[data-pibuild]"); if (!b || !b.closest(".plm")) return;
    var CAD = EP.cad, B = EP.bim, d = CAD.newDoc(S.name || "Room", "mm"), bs = B.ensure(d); bs.levels = [{ id: "L0", name: "Room", elev: 0, h: Math.round(+S.H * 1000) }]; bs.cur = "L0";
    var ents = d.ents, add = function (o) { o.id = CAD.uid(); ents.push(o); return o; }, M = function (v) { return Math.round(v * 1000); }, W = +S.W, D = +S.D, p = plan();
    var c = [[-0.115, -0.115], [W + 0.115, -0.115], [W + 0.115, D + 0.115], [-0.115, D + 0.115]], wall = {};
    ["S", "E", "N", "W"].forEach(function (k, i) { var a = c[i], bq = c[(i + 1) % 4]; wall[k] = add({ t: "wall", a: [M(a[0]), M(a[1])], b: [M(bq[0]), M(bq[1])], th: 230, h: null, mat: "brick", just: "c", lvl: "L0", layer: "A-WALL" }); });
    var Lw = function (k) { return k === "N" || k === "S" ? W + 0.23 : D + 0.23; }, along = function (k, v) { /* wall a→b runs S: +x, E: +y, N: −x, W: −y */ return k === "S" || k === "E" ? v + 0.115 : Lw(k) - v - 0.115; };
    var dc = S.door === "N" || S.door === "S" ? p.door[0] + 0.5 : p.door[1] + 0.5; add({ t: "door", host: wall[S.door].id, at: M(along(S.door, dc)), w: 900, h: 2100, sill: 0, preset: "D2", kind: "single", flip: false, swing: "l", layer: "A-DOOR" });
    add({ t: "window", host: wall[S.win].id, at: M(along(S.win, (S.win === "N" || S.win === "S" ? W : D) / 2)), w: 1500, h: 1350, sill: 900, preset: "W1", layer: "A-WIN" });
    add({ t: "room", pts: [[0, 0], [M(W), 0], [M(W), M(D)], [0, M(D)]], name: S.name, lvl: "L0", floor: S.floor === "wood" ? "vitrified" : S.floor, skirt: true, layer: "A-ROOM" });
    if (S.ceil !== "none") add({ t: "czone", pts: [[0, 0], [M(W), 0], [M(W), M(D)], [0, M(D)]], lvl: "L0", kind: S.ceil, z: null, dir: 0, start: 0, slope: 0, layer: "A-CEIL" });
    p.items.forEach(function (it) { add({ t: "asset", kind: it.k, p: [M(it.x), M(it.y)], rot: it.rot, lvl: "L0", layer: "A-FURN" }); });
    U.toast("Making the room drawing…"); await CAD.newDrawing(d.name, "mm", d); window.scrollTo(0, 0); U.toast("Room built — 3D button for the view, Σ Quantities for the estimate");
  });
})();
