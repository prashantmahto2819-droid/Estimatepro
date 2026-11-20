/* Estimate Pro — catalogue 5: decoration for presentation views (people, vehicles, trees and plants, garden and road pieces).
   These are VIEW ONLY: def.deco = true → they never enter Σ Quantities or an estimate (see B.EXT.asset.qty).
   Any other library item can also be switched out of the quantities with "Count in the estimate: No" (e.noq). Schematic shapes. */
(function () {
  "use strict";
  var EP = window.EP, B = EP.bim, A = B && B.ASSET_LIB, mk = B && B.AH && B.AH.mk; if (!A || !mk) return;
  var PT = B.PT, DE = "Decoration (view only)";
  Object.assign(B.LOOKS, {
    deco_skin: { n: "Figure — skin", c: "#c99a78", p: PT.plain, g: 0.1 }, deco_hair: { n: "Figure — hair", c: "#2b2320", p: PT.plain, g: 0.2 },
    deco_cloth_blue: { n: "Cloth — blue", c: "#35619c", p: PT.plain, g: 0.05 }, deco_cloth_red: { n: "Cloth — red", c: "#b5413a", p: PT.plain, g: 0.05 }, deco_cloth_white: { n: "Cloth — white", c: "#eeeeea", p: PT.plain, g: 0.05 },
    deco_cloth_yellow: { n: "Cloth — yellow", c: "#e0b23c", p: PT.plain, g: 0.05 }, deco_cloth_grey: { n: "Cloth — dark grey", c: "#3f4347", p: PT.plain, g: 0.05 }, deco_cloth_green: { n: "Cloth — green", c: "#3f7d55", p: PT.plain, g: 0.05 },
    deco_car_white: { n: "Car paint — white", c: "#f1f2f2", p: PT.plain, g: 0.85 }, deco_car_red: { n: "Car paint — red", c: "#b32222", p: PT.plain, g: 0.85 }, deco_car_silver: { n: "Car paint — silver", c: "#b9bdc2", p: PT.plain, g: 0.9 },
    deco_car_black: { n: "Car paint — black", c: "#17181a", p: PT.plain, g: 0.9 }, deco_car_blue: { n: "Car paint — blue", c: "#1f4f8f", p: PT.plain, g: 0.85 }, deco_car_yellow: { n: "Paint — yellow (auto / bus)", c: "#e3b21a", p: PT.plain, g: 0.6 },
    deco_tyre: { n: "Tyre rubber", c: "#151515", p: PT.plain, g: 0.05 }, deco_carglass: { n: "Car glass", c: "#27343d", p: PT.plain, g: 0.9 },
    deco_leaf: { n: "Leaves — green", c: "#3f7a34", p: PT.grass, g: 0.05 }, deco_leaf_dark: { n: "Leaves — dark green", c: "#2a5a2c", p: PT.grass, g: 0.05 }, deco_leaf_light: { n: "Leaves — light green", c: "#7fae45", p: PT.grass, g: 0.05 },
    deco_trunk: { n: "Tree trunk", c: "#6b4a2f", p: PT.wood, s: 0.3, g: 0.05 }, deco_flower_red: { n: "Flowers — red", c: "#d2382f", p: PT.plain, g: 0.1 }, deco_flower_yellow: { n: "Flowers — yellow", c: "#f0c419", p: PT.plain, g: 0.1 },
    deco_flower_pink: { n: "Flowers — pink", c: "#e58aa8", p: PT.plain, g: 0.1 }, deco_flower_white: { n: "Flowers — white", c: "#f6f4ee", p: PT.plain, g: 0.1 }, deco_flower_purple: { n: "Flowers — purple (bougainvillea)", c: "#a23b8f", p: PT.plain, g: 0.1 },
    deco_asphalt: { n: "Road — asphalt", c: "#3b3d40", p: PT.concrete, g: 0.05 }, deco_roadpaint: { n: "Road marking — white", c: "#f4f4f0", p: PT.plain, g: 0.15 }, deco_roadpaint_y: { n: "Road marking — yellow", c: "#e9c21c", p: PT.plain, g: 0.15 },
    deco_footpath: { n: "Footpath pavers", c: "#b9aea0", p: PT.paver, s: 0.2, g: 0.05 }, deco_kerb: { n: "Kerb stone", c: "#c9c9c4", p: PT.concrete, g: 0.05 }, deco_water: { n: "Pond water", c: "#4f93b8", p: PT.plain, g: 0.9 },
    deco_rock: { n: "Garden rock", c: "#8a8780", p: PT.stone, s: 0.4, g: 0.05 }, deco_lawn: { n: "Lawn", c: "#5c9a45", p: PT.grass, g: 0.03 }, deco_soil: { n: "Planting soil", c: "#5b4433", p: PT.soil, g: 0.02 },
    deco_canvas: { n: "Umbrella canvas", c: "#e8dfc8", p: PT.plain, g: 0.05 }
  });
  Object.assign(B.CAT_FILL, (function () { var o = {}; o[DE] = "rgba(110,170,90,.12)"; return o; })());
  B.CAT_LAY = Object.assign(B.CAT_LAY || {}, (function () { var o = {}; o[DE] = "A-DECO"; return o; })());

  /* ----- builders (mm) ----- */
  function person(top, bottom, h, sit) {   // h = height; sit = seated figure
    var k = h / 1700, o = [];
    if (sit) { o.push(["b", 0, 120 * k, 340 * k, 420 * k, 430 * k, 560 * k, bottom], ["b", -90 * k, 300 * k, 110 * k, 110 * k, 0, 480 * k, bottom], ["b", 90 * k, 300 * k, 110 * k, 110 * k, 0, 480 * k, bottom], ["e", 0, -40 * k, 190 * k, 120 * k, 560 * k, 1080 * k, top], ["s", 0, -40 * k, 105 * k, 1210 * k, "deco_skin", 1.15], ["s", 0, -50 * k, 108 * k, 1245 * k, "deco_hair", 0.75]); return o; }
    o.push(["e", -85 * k, 0, 70 * k, 80 * k, 0, 820 * k, bottom], ["e", 85 * k, 0, 70 * k, 80 * k, 0, 820 * k, bottom], ["e", 0, 0, 200 * k, 125 * k, 820 * k, 1420 * k, top],
      ["e", -250 * k, 0, 48 * k, 55 * k, 800 * k, 1380 * k, top], ["e", 250 * k, 0, 48 * k, 55 * k, 800 * k, 1380 * k, top], ["c", 0, 0, 45 * k, 1420 * k, 1480 * k, "deco_skin"], ["s", 0, 0, 108 * k, 1580 * k, "deco_skin", 1.15], ["s", 0, -12 * k, 112 * k, 1615 * k, "deco_hair", 0.75]);
    return o;
  }
  function wheels(L, W, r, xs) { var o = []; xs.forEach(function (x) { [-1, 1].forEach(function (sd) { o.push(["b", x, sd * (W / 2 - 90), r * 1.9, 190, 0, r * 2, "deco_tyre"]); }); }); return o; }
  function car(L, W, H, paint, kind) {
    var o = wheels(L, W, 320, [L * 0.31, -L * 0.31]), hood = kind === "suv" ? 0.46 : 0.4, zb = 230, zm = kind === "suv" ? H * 0.56 : H * 0.55;
    o.push(["b", 0, 0, L, W, zb, zm, paint]);
    if (kind === "pickup") o.push(["b", L * 0.12, 0, L * 0.3, W * 0.92, zm, H, paint], ["b", L * 0.12, 0, L * 0.26, W * 0.94, zm + 60, H - 90, "deco_carglass"], ["b", -L * 0.27, W / 2 - 40, L * 0.42, 60, zm, zm + 330, paint], ["b", -L * 0.27, -W / 2 + 40, L * 0.42, 60, zm, zm + 330, paint], ["b", -L / 2 + 40, 0, 60, W, zm, zm + 330, paint]);
    else { var cl = kind === "hatch" ? L * 0.62 : kind === "suv" ? L * 0.66 : L * 0.5, cx = kind === "hatch" ? -L * 0.12 : kind === "suv" ? -L * 0.1 : -L * 0.05; o.push(["b", cx, 0, cl, W * 0.9, zm, H, paint], ["b", cx, 0, cl * 0.94, W * 0.92, zm + 50, H - 80, "deco_carglass"], ["b", cx, 0, cl * 1.0, W * 0.6, H - 80, H, paint]); }
    o.push(["b", L / 2 - 25, W * 0.32, 50, 260, zm - 190, zm - 80, "led_warm"], ["b", L / 2 - 25, -W * 0.32, 50, 260, zm - 190, zm - 80, "led_warm"], ["b", -L / 2 + 25, W * 0.32, 50, 260, zm - 190, zm - 80, "deco_flower_red"], ["b", -L / 2 + 25, -W * 0.32, 50, 260, zm - 190, zm - 80, "deco_flower_red"]);
    return o;
  }
  function crown(x, y, r, z, look, n) { var o = [["s", x, y, r, z, look, 0.85]]; n = n || 5; for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2 + 0.4; o.push(["s", x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.62, z - r * 0.15 + (i % 2) * r * 0.3, look, 0.85]); } return o; }
  function flowers(w, d, z, looks, n) { var o = []; for (var i = 0; i < n; i++) { var u = ((i * 37) % 100) / 100 - 0.5, v = ((i * 61 + 13) % 100) / 100 - 0.5; o.push(["s", u * w * 0.9, v * d * 0.9, 90, z, looks[i % looks.length], 0.7]); } return o; }
  var D = { deco: true }, DN = { nb: 1, deco: true };
  function dk(id, n, w, d, h, o, sy, pt) { mk(id, n, DE, w, d, h, "deco", o, sy, pt); A[id].deco = true; }

  /* ----- people ----- */
  dk("deco_man", "Person — man standing", 550, 300, 1750, DN, [["c", 0, 0, 220], ["l", 0, 0, 0, -260]], person("deco_cloth_blue", "deco_cloth_grey", 1750));
  dk("deco_woman", "Person — woman standing", 520, 300, 1620, DN, [["c", 0, 0, 210], ["l", 0, 0, 0, -250]], person("deco_cloth_red", "deco_cloth_red", 1620));
  dk("deco_man_2", "Person — man in white shirt", 550, 300, 1700, DN, [["c", 0, 0, 220], ["l", 0, 0, 0, -260]], person("deco_cloth_white", "deco_cloth_blue", 1700));
  dk("deco_worker", "Person — site worker (yellow vest)", 550, 300, 1700, DN, [["c", 0, 0, 220], ["l", 0, 0, 0, -260]], person("deco_cloth_yellow", "deco_cloth_grey", 1700).concat([["s", 0, -5, 125, 1650, "deco_cloth_yellow", 0.6]]));
  dk("deco_child", "Person — child", 400, 250, 1150, DN, [["c", 0, 0, 160]], person("deco_cloth_green", "deco_cloth_blue", 1150));
  dk("deco_person_sitting", "Person — sitting (place on a chair or bench)", 450, 600, 1300, DN, [["c", 0, 0, 200]], person("deco_cloth_white", "deco_cloth_grey", 1700, true));
  dk("deco_couple", "People — two standing together", 1300, 400, 1750, DN, [["c", -330, 0, 220], ["c", 330, 0, 210]], person("deco_cloth_blue", "deco_cloth_grey", 1750).map(function (q) { var c = q.slice(); c[1] -= 330; return c; }).concat(person("deco_cloth_yellow", "deco_cloth_red", 1620).map(function (q) { var c = q.slice(); c[1] += 330; return c; })));

  /* ----- vehicles ----- */
  var carSym = function (L, W) { return [["r", 0, 0, L, W], ["r", -L * 0.05, 0, L * 0.5, W * 0.85], ["l", L / 2, -W * 0.3, L / 2, W * 0.3]]; };
  dk("deco_car_hatch", "Car — hatchback, red", 3800, 1700, 1500, DN, carSym(3800, 1700), car(3800, 1700, 1500, "deco_car_red", "hatch"));
  dk("deco_car_sedan", "Car — sedan, white", 4500, 1780, 1450, DN, carSym(4500, 1780), car(4500, 1780, 1450, "deco_car_white", "sedan"));
  dk("deco_car_sedan_black", "Car — sedan, black", 4600, 1800, 1450, DN, carSym(4600, 1800), car(4600, 1800, 1450, "deco_car_black", "sedan"));
  dk("deco_car_suv", "Car — SUV, silver", 4700, 1900, 1750, DN, carSym(4700, 1900), car(4700, 1900, 1750, "deco_car_silver", "suv"));
  dk("deco_car_suv_blue", "Car — SUV, blue", 4500, 1850, 1700, DN, carSym(4500, 1850), car(4500, 1850, 1700, "deco_car_blue", "suv"));
  dk("deco_pickup", "Pickup truck, white", 5200, 1850, 1800, DN, carSym(5200, 1850), car(5200, 1850, 1800, "deco_car_white", "pickup"));
  dk("deco_scooter", "Scooter / motorcycle", 1900, 700, 1150, DN, [["r", 0, 0, 1800, 350], ["l", 700, -330, 700, 330]], [["b", 650, 0, 480, 110, 0, 480, "deco_tyre"], ["b", -650, 0, 480, 110, 0, 480, "deco_tyre"], ["b", 0, 0, 1100, 320, 300, 560, "deco_car_red"], ["b", -250, 0, 700, 300, 560, 780, "deco_cloth_grey"], ["b", 600, 0, 120, 120, 480, 1050, "deco_car_red"], ["b", 620, 0, 80, 660, 1020, 1080, "deco_tyre"], ["s", 700, 0, 90, 900, "led_warm", 0.8]]);
  dk("deco_bicycle", "Bicycle", 1750, 600, 1050, DN, [["l", -850, 0, 850, 0], ["l", 550, -280, 550, 280]], [["c", 560, 0, 330, 320, 345, "deco_tyre"], ["b", 560, 0, 660, 40, 0, 660, "deco_tyre"], ["b", -560, 0, 660, 40, 0, 660, "deco_tyre"], ["b", 0, 0, 1000, 40, 520, 570, "deco_car_blue"], ["b", -200, 0, 40, 40, 330, 900, "deco_car_blue"], ["b", -210, 0, 260, 130, 900, 950, "deco_tyre"], ["b", 480, 0, 40, 40, 330, 1000, "deco_car_blue"], ["b", 480, 0, 60, 560, 980, 1020, "deco_tyre"]].filter(function (q) { return q[0] !== "c"; }));
  dk("deco_auto", "Auto-rickshaw", 2700, 1350, 1750, DN, [["r", 0, 0, 2650, 1300], ["l", 1325, -300, 1325, 300]], [["b", 1000, 0, 420, 130, 0, 420, "deco_tyre"], ["b", -850, 520, 420, 130, 0, 420, "deco_tyre"], ["b", -850, -520, 420, 130, 0, 420, "deco_tyre"], ["b", -150, 0, 2100, 1300, 250, 900, "deco_car_yellow"], ["b", 1050, 0, 500, 700, 250, 900, "deco_car_yellow"], ["b", -150, 0, 2100, 1300, 1500, 1750, "deco_cloth_grey"], ["b", -1150, 0, 80, 1300, 900, 1500, "deco_cloth_grey"], ["b", 850, 0, 60, 1200, 900, 1500, "deco_carglass"], ["b", -300, 620, 60, 60, 900, 1500, "deco_tyre"], ["b", -300, -620, 60, 60, 900, 1500, "deco_tyre"]]);
  dk("deco_bus", "Bus (12 m)", 12000, 2550, 3200, DN, [["r", 0, 0, 12000, 2550], ["l", 6000, -900, 6000, 900]], wheels(12000, 2550, 480, [3900, -3400]).concat([["b", 0, 0, 12000, 2550, 350, 1500, "deco_car_white"], ["b", 0, 0, 11900, 2560, 1500, 2500, "deco_carglass"], ["b", 0, 0, 12000, 2550, 2500, 3200, "deco_car_white"], ["b", 0, 0, 12010, 2560, 1150, 1350, "deco_car_blue"]]));

  /* ----- trees and plants ----- */
  var treeSym = function (r) { return [["c", 0, 0, r], ["c", 0, 0, r * 0.12]]; };
  dk("deco_tree_round", "Tree — round canopy (neem / mango), 6 m", 6000, 6000, 8000, DN, treeSym(3000), [["c", 0, 0, 260, 0, 3600, "deco_trunk", 170]].concat(crown(0, 0, 2600, 5300, "deco_leaf")));
  dk("deco_tree_small", "Tree — small ornamental, 3 m", 3000, 3000, 4200, DN, treeSym(1500), [["c", 0, 0, 110, 0, 2000, "deco_trunk", 80]].concat(crown(0, 0, 1300, 2900, "deco_leaf_light", 4)));
  dk("deco_tree_gulmohar", "Tree — flowering (gulmohar), 7 m", 7000, 7000, 7500, DN, treeSym(3500), [["c", 0, 0, 280, 0, 3300, "deco_trunk", 180], ["s", 0, 0, 3300, 4700, "deco_leaf", 0.45]].concat(flowers(6000, 6000, 5450, ["deco_flower_red", "deco_flower_red", "deco_flower_yellow"], 26).map(function (q) { q[3] = 420; return q; })));
  dk("deco_tree_palm", "Palm tree, 8 m", 4500, 4500, 8500, DN, treeSym(2250), (function () { var o = [["c", 0, 0, 200, 0, 7200, "deco_trunk", 130], ["s", 0, 0, 380, 7300, "deco_leaf_dark"]]; for (var i = 0; i < 10; i++) { var a = i / 10 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); o.push(["p", [[c * 200 - s * 220, s * 200 + c * 220], [c * 2200, s * 2200], [c * 200 + s * 220, s * 200 - c * 220]], 7250 + (i % 2) * 180, 7330 + (i % 2) * 180, "deco_leaf_dark"]); } return o; })());
  dk("deco_tree_ashoka", "Tree — tall narrow (Ashoka), 8 m", 1800, 1800, 8000, DN, treeSym(900), [["c", 0, 0, 100, 0, 1200, "deco_trunk"], ["c", 0, 0, 850, 1000, 8000, "deco_leaf_dark", 60]]);
  dk("deco_tree_pine", "Tree — pine / Christmas tree, 6 m", 3000, 3000, 6200, DN, treeSym(1500), [["c", 0, 0, 130, 0, 1300, "deco_trunk"], ["c", 0, 0, 1500, 1100, 3000, "deco_leaf_dark", 500], ["c", 0, 0, 1150, 2600, 4500, "deco_leaf_dark", 350], ["c", 0, 0, 800, 4100, 6200, "deco_leaf_dark", 20]]);
  dk("deco_bamboo", "Bamboo cluster", 1500, 1500, 5000, DN, treeSym(750), (function () { var o = []; for (var i = 0; i < 9; i++) { var a = i * 2.4, r = 150 + (i % 3) * 180; o.push(["c", Math.cos(a) * r, Math.sin(a) * r, 35, 0, 4000 + (i % 4) * 300, "deco_leaf_light"], ["s", Math.cos(a) * r, Math.sin(a) * r, 320, 4000 + (i % 4) * 300, "deco_leaf", 1.4]); } return o; })());
  dk("deco_bush_round", "Shrub — round bush", 1200, 1200, 1000, DN, [["c", 0, 0, 600]], crown(0, 0, 480, 520, "deco_leaf", 4));
  dk("deco_bush_flower", "Shrub — flowering (bougainvillea)", 1500, 1500, 1300, DN, [["c", 0, 0, 750]], crown(0, 0, 600, 650, "deco_leaf_dark", 4).concat(flowers(1300, 1300, 1050, ["deco_flower_purple", "deco_flower_pink"], 14)));
  dk("deco_hedge_3m", "Hedge strip 3 m × 0.6 m", 3000, 600, 900, D, [], [["b", 0, 0, 3000, 600, 0, 850, "deco_leaf_dark"], ["b", 0, 0, 2900, 500, 850, 900, "deco_leaf"]]);
  dk("deco_flower_bed", "Flower bed 3 × 1 m (mixed colours)", 3000, 1000, 350, D, [], [["b", 0, 0, 3000, 1000, 0, 120, "deco_soil"]].concat(flowers(3000, 1000, 240, ["deco_flower_red", "deco_flower_yellow", "deco_flower_pink", "deco_flower_white", "deco_leaf_light"], 46)));
  dk("deco_flower_bed_round", "Flower bed — round Ø2.4 m with centre plant", 2400, 2400, 1200, DN, [["c", 0, 0, 1200], ["c", 0, 0, 400]], [["c", 0, 0, 1200, 0, 150, "deco_kerb"], ["c", 0, 0, 1100, 150, 200, "deco_soil"]].concat(flowers(1900, 1900, 300, ["deco_flower_yellow", "deco_flower_red", "deco_flower_white"], 34), crown(0, 0, 380, 800, "deco_leaf_dark", 4)));
  dk("deco_planter_pot", "Potted plant — large floor pot", 600, 600, 1500, DN, [["c", 0, 0, 300]], [["c", 0, 0, 200, 0, 550, "tile_terracotta", 290], ["c", 0, 0, 30, 550, 1000, "deco_trunk"]].concat(crown(0, 0, 330, 1150, "deco_leaf", 4)));
  dk("deco_planter_box", "Planter box 1.2 m with plants", 1200, 400, 900, D, [], [["b", 0, 0, 1200, 400, 0, 450, "concrete"], ["b", 0, 0, 1120, 320, 450, 470, "deco_soil"], ["s", -380, 0, 230, 650, "deco_leaf", 0.9], ["s", 0, 0, 260, 700, "deco_leaf_light", 0.9], ["s", 380, 0, 230, 650, "deco_leaf", 0.9]]);
  dk("deco_creeper_wall", "Green wall / creeper panel 2.4 × 2.4 m", 2400, 150, 2400, { deco: true, m: "wall", z: 300 }, [["l", -1200, 0, 1200, 0]], (function () { var o = [["b", 0, 30, 2400, 60, 0, 2400, "deco_leaf_dark"]]; for (var i = 0; i < 30; i++) o.push(["s", -1100 + (i % 6) * 440, -20, 200, 200 + Math.floor(i / 6) * 500, i % 3 ? "deco_leaf" : "deco_leaf_light", 0.8]); return o; })());

  /* ----- garden ----- */
  dk("deco_lawn_10", "Lawn patch 10 × 10 m (view only)", 10000, 10000, 40, D, [], [["b", 0, 0, 10000, 10000, 0, 40, "deco_lawn"]]);
  dk("deco_pond", "Garden pond 4 × 2.5 m with rock edge", 4000, 2500, 300, DN, [["e", 0, 0, 2000, 1250]], (function () { var o = [["e", 0, 0, 2000, 1250, 0, 60, "deco_rock"], ["e", 0, 0, 1750, 1000, 60, 75, "deco_water"]]; for (var i = 0; i < 12; i++) { var a = i / 12 * Math.PI * 2; o.push(["s", Math.cos(a) * 1900, Math.sin(a) * 1150, 200 + (i % 3) * 60, 90, "deco_rock", 0.6]); } return o; })());
  dk("deco_rocks", "Garden rocks — group of three", 1800, 1400, 700, DN, [["c", -300, 0, 500], ["c", 450, 200, 320]], [["s", -300, 0, 520, 230, "deco_rock", 0.65], ["s", 450, 200, 330, 150, "deco_rock", 0.6], ["s", 250, -420, 240, 110, "deco_rock", 0.6]]);
  dk("deco_stepping", "Stepping stones — 5 in a line", 3400, 600, 50, DN, [["r", -1400, 0, 500, 500], ["r", -700, 0, 500, 500], ["r", 0, 0, 500, 500], ["r", 700, 0, 500, 500], ["r", 1400, 0, 500, 500]], [-1400, -700, 0, 700, 1400].map(function (x, i) { return ["b", x, (i % 2 ? 60 : -60), 500, 500, 0, 50, "stone"]; }));
  dk("deco_umbrella_set", "Garden umbrella with table and 4 chairs", 3000, 3000, 2500, DN, [["c", 0, 0, 1500], ["c", 0, 0, 450]], (function () { var o = [["c", 0, 0, 30, 0, 2300, "steel"], ["c", 0, 0, 1500, 2050, 2450, "deco_canvas", 40], ["c", 0, 0, 450, 700, 740, "wood_teak"], ["c", 0, 0, 200, 0, 30, "steel"]]; [[900, 0], [-900, 0], [0, 900], [0, -900]].forEach(function (c) { o.push(["b", c[0], c[1], 450, 450, 400, 450, "wood_teak"], ["b", c[0] * 1.24, c[1] * 1.24, c[0] ? 50 : 450, c[0] ? 450 : 50, 450, 900, "wood_teak"], ["b", c[0], c[1], 380, 380, 0, 400, "steel"]); }); return o; })());
  dk("deco_swing_garden", "Garden swing (jhoola) 2-seater", 2200, 1400, 2100, DN, [["r", 0, 0, 2200, 1400]], [["c", -1000, -600, 35, 0, 2100, "steel_matt_black"], ["c", -1000, 600, 35, 0, 2100, "steel_matt_black"], ["c", 1000, -600, 35, 0, 2100, "steel_matt_black"], ["c", 1000, 600, 35, 0, 2100, "steel_matt_black"], ["b", 0, 0, 2200, 60, 2040, 2100, "steel_matt_black"], ["b", 0, 0, 1500, 550, 450, 520, "wood_teak"], ["b", 0, 250, 1500, 50, 520, 1000, "wood_teak"], ["b", -720, 0, 20, 20, 520, 2040, "steel"], ["b", 720, 0, 20, 20, 520, 2040, "steel"], ["b", 0, 0, 2400, 1500, 2100, 2150, "deco_canvas"]]);
  dk("deco_garden_light", "Garden light post 3 m (view only)", 300, 300, 3200, DN, [["c", 0, 0, 150]], [["c", 0, 0, 110, 0, 200, "steel_matt_black", 60], ["c", 0, 0, 45, 200, 2900, "steel_matt_black"], ["s", 0, 0, 170, 3050, "led_warm"]]);

  /* ----- road pieces (view only — a measured road is the ROAD command) ----- */
  dk("deco_road_20", "Road piece 20 × 7 m with centre line", 20000, 7000, 30, D, [["l", -10000, 0, 10000, 0]], (function () { var o = [["b", 0, 0, 20000, 7000, 0, 30, "deco_asphalt"], ["b", 0, 3350, 20000, 120, 30, 34, "deco_roadpaint"], ["b", 0, -3350, 20000, 120, 30, 34, "deco_roadpaint"]]; for (var x = -9000; x <= 9000; x += 3000) o.push(["b", x, 0, 1800, 120, 30, 34, "deco_roadpaint"]); return o; })());
  dk("deco_road_junction", "Road junction 7 × 7 m (square, no markings)", 7000, 7000, 30, D, [], [["b", 0, 0, 7000, 7000, 0, 30, "deco_asphalt"]]);
  dk("deco_zebra", "Zebra crossing 7 × 3 m", 3000, 7000, 36, D, [], (function () { var o = []; for (var y = -3200; y <= 3200; y += 800) o.push(["b", 0, y, 3000, 400, 30, 36, "deco_roadpaint"]); return o; })());
  dk("deco_road_arrow", "Road arrow marking", 3000, 900, 36, DN, [["l", -1500, 0, 1500, 0]], [["b", -400, 0, 2200, 200, 30, 36, "deco_roadpaint"], ["p", [[700, -450], [1500, 0], [700, 450]], 30, 36, "deco_roadpaint"]]);
  dk("deco_footpath_10", "Footpath strip 10 × 1.8 m with kerb", 10000, 1800, 180, D, [], [["b", 0, 0, 10000, 1800, 0, 150, "deco_footpath"], ["b", 0, -850, 10000, 150, 0, 180, "deco_kerb"]]);
  dk("deco_driveway", "Driveway 6 × 3.5 m (pavers)", 6000, 3500, 40, D, [], [["b", 0, 0, 6000, 3500, 0, 40, "deco_footpath"]]);
  dk("deco_parking_lines", "Parking bay markings — 3 bays (7.5 × 5 m)", 7500, 5000, 36, D, [], [-3750, -1250, 1250, 3750].map(function (x) { return ["b", x, 0, 100, 5000, 30, 36, "deco_roadpaint"]; }).concat([["b", 0, 2450, 7600, 100, 30, 36, "deco_roadpaint"]]));
  dk("deco_divider", "Road divider with plants, 10 m", 10000, 1200, 900, D, [], [["b", 0, 0, 10000, 1200, 0, 250, "deco_kerb"], ["b", 0, 0, 9800, 1000, 250, 280, "deco_soil"]].concat((function () { var o = []; for (var x = -4400; x <= 4400; x += 1100) o.push(["s", x, 0, 380, 560, "deco_leaf_dark", 0.85]); return o; })()));
})();
