/* Estimate Pro — railing and parapet designs. One "railing" element, many designs (e.style):
   railings in MS / SS / glass / cast iron / wood / cable / laser-cut, and parapet walls — solid, with cuts, jali, balusters,
   battlement, stepped piers, low wall + railing. Shapes are schematic: they show the design, height and material; they are not
   fabrication drawings. Parapet masonry quantity uses an approximate solid share for designs with openings (stated in Σ). */
(function () {
  "use strict";
  var EP = window.EP, B = EP.bim, G = EP.geom; if (!B) return;
  var PT = B.PT;
  Object.assign(B.LOOKS, {
    cast_iron: { n: "Cast iron — black", c: "#26262a", p: PT.plain, g: 0.18 },
    cast_iron_bronze: { n: "Cast iron — antique bronze", c: "#5b4630", p: PT.plain, g: 0.3 },
    ms_powder_grey: { n: "MS — powder coated grey", c: "#5d6166", p: PT.plain, g: 0.3 },
    ms_powder_white: { n: "MS — powder coated white", c: "#e9e9e6", p: PT.plain, g: 0.3 },
    steel_rose_gold: { n: "SS — rose gold PVD", c: "#c98f7a", p: PT.plain, g: 0.9 },
    steel_gold_pvd: { n: "SS — gold PVD", c: "#cfa94a", p: PT.plain, g: 0.9 },
    steel_black_pvd: { n: "SS — black PVD", c: "#2a2a2c", p: PT.plain, g: 0.8 },
    glass_bronze: { n: "Glass — bronze tinted", c: "#a58a6b", p: PT.glass, g: 0.9 },
    glass_frosted: { n: "Glass — frosted", c: "#e3ecee", p: PT.glass, g: 0.3 },
    /* designer tiles, stone and paints in use today */
    tile_moroccan: { n: "Moroccan pattern tiles 200×200", c: "#5f8fa8", p: PT.tile, s: 0.2, g: 0.35 },
    tile_hexagon: { n: "Hexagon tiles — white", c: "#eeeeea", p: PT.tile, s: 0.18, g: 0.4 },
    tile_checker: { n: "Chequered tiles — black / white 300×300", c: "#8b8b8b", p: PT.tile, s: 0.3, g: 0.45 },
    tile_terrazzo_look: { n: "Terrazzo-look tiles 600×600", c: "#d9d2c6", p: PT.tile, s: 0.6, g: 0.4 },
    tile_marble_look: { n: "Marble-look GVT 1200×600 (statuario)", c: "#f1eee8", p: PT.tile, s: 1.2, g: 0.75 },
    tile_onyx_look: { n: "Onyx-look high gloss slab tiles", c: "#e6d2ad", p: PT.tile, s: 1.2, g: 0.85 },
    tile_concrete_look: { n: "Concrete-look matt tiles 800×800", c: "#9c9c98", p: PT.tile, s: 0.8, g: 0.12 },
    tile_stone_look_out: { n: "Outdoor stone-look tiles 20 mm (anti-skid)", c: "#a89c8a", p: PT.tile, s: 0.6, g: 0.08 },
    tile_parking: { n: "Parking tiles 300×300 (heavy duty)", c: "#8d6f5c", p: PT.tile, s: 0.3, g: 0.1 },
    tile_elevation_stone: { n: "Elevation tiles — stacked stone look", c: "#b39a7e", p: PT.stone, s: 0.3, g: 0.08 },
    tile_elevation_brick: { n: "Elevation tiles — brick look", c: "#a5553c", p: PT.brick, g: 0.08 },
    tile_kitchen_dado: { n: "Kitchen dado tiles 300×600 — glossy", c: "#ece7dd", p: PT.tile, s: 0.45, g: 0.7 },
    tile_cool_roof: { n: "Cool roof tiles — white reflective", c: "#fbfbf8", p: PT.tile, s: 0.3, g: 0.5 },
    stone_kota_blue: { n: "Kota stone — blue-green", c: "#6f8279", p: PT.granite, s: 0.6, g: 0.25 },
    stone_jaisalmer: { n: "Jaisalmer yellow stone", c: "#d9b354", p: PT.marble, s: 0.6, g: 0.35 },
    stone_tandur: { n: "Tandur / Shahabad stone", c: "#7c8275", p: PT.granite, s: 0.6, g: 0.15 },
    paint_off_white: { n: "Paint — off white / ivory", c: "#f3eee0", p: PT.paint, g: 0.08 },
    paint_greige: { n: "Paint — greige (warm grey)", c: "#b9b0a2", p: PT.paint, g: 0.08 },
    paint_olive: { n: "Paint — olive green", c: "#7c7f55", p: PT.paint, g: 0.08 },
    paint_teal: { n: "Paint — teal", c: "#2f7f82", p: PT.paint, g: 0.08 },
    paint_mustard: { n: "Paint — mustard", c: "#d2a534", p: PT.paint, g: 0.08 },
    paint_blush: { n: "Paint — blush pink", c: "#e8c3b8", p: PT.paint, g: 0.08 },
    paint_navy: { n: "Paint — navy blue", c: "#27364f", p: PT.paint, g: 0.08 },
    paint_brick_red: { n: "Exterior paint — brick red", c: "#9a4634", p: PT.paint, g: 0.06 },
    paint_ext_grey: { n: "Exterior paint — slate grey", c: "#6e747a", p: PT.paint, g: 0.06 },
    paint_ext_beige: { n: "Exterior paint — sandstone beige", c: "#d9c7a6", p: PT.paint, g: 0.06 },
    paint_texture_rustic: { n: "Exterior texture — rustic / roller", c: "#c9b79a", p: PT.concrete, g: 0.04 },
    paint_texture_grey: { n: "Texture paint — grey (stucco)", c: "#a7a7a3", p: PT.concrete, g: 0.04 },
    paint_metallic_gold: { n: "Metallic / royale paint — gold", c: "#c8a85a", p: PT.paint, g: 0.55 },
    paint_micro_concrete: { n: "Micro-concrete / lime plaster finish", c: "#b5b1a8", p: PT.concrete, g: 0.1 }
  });

  /* id, name, default material, kind (r = railing, p = parapet), solid share of the parapet wall for quantities */
  var S = B.RAIL_STYLES = [
    ["", "Railing — simple posts and handrail", "", "r"],
    ["ms_bars", "Railing — MS vertical bars", "wrought_iron", "r"],
    ["ms_flat", "Railing — MS horizontal flats", "steel_matt_black", "r"],
    ["ss_pipe", "Railing — SS 304 pipe, 3 rails", "steel_ss", "r"],
    ["ss_baluster", "Railing — SS balusters with wooden handrail", "steel_ss", "r"],
    ["ss_glass", "Railing — SS posts + toughened glass", "steel_ss", "r"],
    ["glass_frameless", "Railing — frameless glass in base channel", "steel_ss", "r"],
    ["cable", "Railing — SS posts + wire rope", "steel_ss", "r"],
    ["cast_iron", "Railing — cast iron ornamental balusters", "cast_iron", "r"],
    ["wood", "Railing — wooden balusters and handrail", "wood_teak", "r"],
    ["laser", "Railing — laser-cut panel infill", "steel_matt_black", "r"],
    ["par_solid", "Parapet — solid wall with coping", "paint_white", "p", 1],
    ["par_rail", "Parapet — low wall + SS railing on top", "paint_white", "p", 1],
    ["par_glass", "Parapet — low wall + glass on top", "paint_white", "p", 1],
    ["par_cut", "Parapet — vertical cuts (slots)", "paint_white", "p", 0.75],
    ["par_hslot", "Parapet — horizontal bands with cuts", "paint_white", "p", 0.65],
    ["par_jali", "Parapet — jali panels between piers", "paint_white", "p", 0.5],
    ["par_baluster", "Parapet — balusters between piers", "paint_temple_white", "p", 0.45],
    ["par_battlement", "Parapet — battlement (kangura)", "paint_white", "p", 0.88],
    ["par_step", "Parapet — piers with lower wall between", "paint_white", "p", 0.85],
    ["par_planter", "Parapet — wall with planter box", "paint_white", "p", 1]
  ];
  B.railStyle = function (e) { var id = (e && e.style) || ""; for (var i = 0; i < S.length; i++) if (S[i][0] === id) return { id: id, n: S[i][1], look: S[i][2], par: S[i][3] === "p", solid: S[i][4] == null ? 1 : S[i][4] }; return { id: "", n: S[0][1], look: "", par: false, solid: 1 }; };
  B.railTh = function (e) { return e.th || 115; };
  B.railLow = function (e) { var H = e.h || 1000; return Math.min(H - 150, e.ph || (e.style === "par_glass" ? 450 : 600)); };

  /* plan: a railing is its line; a parapet shows both faces */
  B.railPlan = function (e) {
    var st = B.railStyle(e), segs = G.polySegs(e.pts, false); if (!st.par) return segs;
    var t = B.railTh(e) / 2, out = [];
    for (var k = 0; k + 1 < e.pts.length; k++) { var a = e.pts[k], b = e.pts[k + 1]; if (G.dist(a, b) < 1) continue; var n = G.mul(G.perp(G.norm(G.sub(b, a))), t); out.push({ k: "L", a: G.add(a, n), b: G.add(b, n) }, { k: "L", a: G.sub(a, n), b: G.sub(b, n) }); if (k === 0) out.push({ k: "L", a: G.add(a, n), b: G.sub(a, n) }); if (k + 2 === e.pts.length) out.push({ k: "L", a: G.add(b, n), b: G.sub(b, n) }); }
    return out.length ? out : segs;
  };

  /* quantities */
  B.railQty = function (e, push) {
    var st = B.railStyle(e), L = G.segsLength(G.polySegs(e.pts, false)), H = e.h || 1000, m = function (v) { return (v / 1000).toFixed(2); };
    if (!st.par) { push("railing", "L", L, st.n + " " + Math.round(H) + " mm high", m(L) + " m run"); return; }
    var th = B.railTh(e), wallH = st.id === "par_rail" || st.id === "par_glass" ? B.railLow(e) : H, sh = st.solid;
    push("brick", "V", L * th * wallH * sh, st.n + " — masonry " + Math.round(th) + " mm", m(L) + " × " + m(th) + " × " + m(wallH) + (sh < 1 ? " × " + sh + " (approx. solid share of this design)" : ""));
    var fa = L * wallH * 2 * Math.max(sh, 0.6) + L * (th + 60);
    push("plaster_ext", "A", fa, "Parapet plaster — both faces and top", m(L) + " × " + m(wallH) + " × 2" + (sh < 1 ? " × " + Math.max(sh, 0.6) : "") + " + top");
    push("paint_ext", "A", fa, "Parapet painting", "same as plaster");
    if (st.id === "par_rail" || st.id === "par_glass") push("railing", "L", L, (st.id === "par_glass" ? "Glass railing" : "SS railing") + " on parapet, " + Math.round(H - wallH) + " mm high", m(L) + " m run");
  };

  /* 3D */
  B.railMesh = function (M, e, z0, K) {
    var st = B.railStyle(e), H = e.h || 1000, d = K.d, box = K.box, along = K.boxAlong;
    var main = B.lookFor(d, "rail", e.look || st.look, e.col), L2 = function (id) { return B.lookFor(d, "rail", id); };
    var glass = B.lookFor(d, "glass", e.style && /glass/.test(e.look2 || "") ? e.look2 : null), ga = glass.a == null ? 0.35 : glass.a;
    var ss = L2("steel_ss"), th = B.railTh(e), top = z0 + H;
    for (var k = 0; k + 1 < e.pts.length; k++) {
      var a = e.pts[k], b = e.pts[k + 1], len = G.dist(a, b); if (len < 1) continue;
      var u = G.norm(G.sub(b, a)), ang = Math.atan2(u[1], u[0]);
      var at = function (s) { return [a[0] + u[0] * s, a[1] + u[1] * s]; };
      var seg = function (s0, s1, w, zA, zB, lk, al) { along(M, at(s0), at(s1), w, zA, zB, lk, al); };
      var post = function (s, w, zA, zB, lk, dd) { box(M, at(s), w, dd || w, ang, zA, zB, lk); };
      var every = function (sp, fn, skipEnds) { var n = Math.max(1, Math.round(len / sp)); for (var j = skipEnds ? 1 : 0; j <= (skipEnds ? n - 1 : n); j++) fn(len * j / n, j, n); return n; };
      var fill = function (sp, fn) { var n = Math.max(1, Math.round(len / sp)); for (var j = 0; j < n; j++) fn(len * (j + 0.5) / n, len / n); };
      var e0 = -th / 2, e1 = len + th / 2;   // parapet runs overlap at corners
      var coping = function (z, lk) { seg(e0 - 30, e1 + 30, th + 60, z, z + 75, lk || main); };
      switch (st.id) {
        case "ms_bars": every(1500, function (s) { post(s, 40, z0, top, main); }); seg(0, len, 50, top - 40, top, main); seg(0, len, 30, z0 + 100, z0 + 125, main); fill(110, function (s) { post(s, 12, z0 + 125, top - 40, main); }); break;
        case "ms_flat": every(1200, function (s) { post(s, 40, z0, top, main); }); seg(0, len, 60, top - 30, top, main); for (var i1 = 0; i1 < 6; i1++) seg(0, len, 8, z0 + 120 + i1 * (H - 260) / 5, z0 + 150 + i1 * (H - 260) / 5, main); break;
        case "ss_pipe": every(1200, function (s) { post(s, 48, z0, top - 40, main); }); seg(0, len, 50, top - 50, top, main); for (var i2 = 1; i2 <= 3; i2++) seg(0, len, 18, z0 + i2 * (H - 100) / 4, z0 + i2 * (H - 100) / 4 + 18, main); break;
        case "ss_baluster": every(1500, function (s) { post(s, 48, z0, top - 50, main); }); seg(0, len, 70, top - 50, top, L2("wood_teak")); seg(0, len, 20, z0 + 110, z0 + 130, main); fill(120, function (s) { post(s, 16, z0 + 130, top - 50, main); }); break;
        case "ss_glass": every(1200, function (s) { post(s, 48, z0, top - 40, main); }); seg(0, len, 50, top - 50, top, main); seg(20, len - 20, 12, z0 + 120, top - 90, glass, ga); break;
        case "glass_frameless": seg(0, len, 60, z0, z0 + 110, main); seg(0, len, 15, z0 + 110, top - 25, glass, ga); seg(0, len, 36, top - 25, top, main); break;
        case "cable": every(1500, function (s) { post(s, 50, z0, top - 40, main); }); seg(0, len, 50, top - 50, top, main); for (var i3 = 1; i3 <= 7; i3++) seg(0, len, 6, z0 + i3 * (H - 80) / 8, z0 + i3 * (H - 80) / 8 + 6, main); break;
        case "cast_iron": every(1500, function (s) { post(s, 60, z0, top + 60, main); post(s, 90, top + 60, top + 110, main); }); seg(0, len, 70, top - 45, top, main); seg(0, len, 40, z0 + 100, z0 + 130, main);
          fill(160, function (s) { var zm = z0 + 130 + (H - 175) / 2; post(s, 16, z0 + 130, top - 45, main); post(s, 46, zm - 70, zm + 70, main, 30); post(s, 30, z0 + 200, z0 + 240, main); post(s, 30, top - 150, top - 110, main); post(s, 110, zm - 8, zm + 8, main, 10); }); break;
        case "wood": every(1500, function (s) { post(s, 90, z0, top + 30, main); }); seg(0, len, 100, top - 60, top, main); seg(0, len, 60, z0 + 90, z0 + 130, main); fill(130, function (s) { post(s, 36, z0 + 130, top - 60, main); }); break;
        case "laser": every(1200, function (s) { post(s, 40, z0, top, main); }); seg(0, len, 60, top - 40, top, main); seg(0, len, 30, z0 + 90, z0 + 120, main);
          fill(150, function (s, w) { for (var j2 = 0; j2 < 5; j2++) if ((Math.round(s / w) + j2) % 2 === 0) seg(s - w * 0.42, s + w * 0.42, 4, z0 + 140 + j2 * (H - 200) / 5, z0 + 140 + (j2 + 0.84) * (H - 200) / 5, main); else post(s, 6, z0 + 140 + j2 * (H - 200) / 5, z0 + 140 + (j2 + 1) * (H - 200) / 5, main, 4); }); break;
        case "par_solid": seg(e0, e1, th, z0, top - 75, main); coping(top - 75); break;
        case "par_rail": var lw = B.railLow(e); seg(e0, e1, th, z0, z0 + lw - 75, main); coping(z0 + lw - 75); every(1200, function (s) { post(s, 48, z0 + lw, top - 40, ss); }); seg(0, len, 50, top - 50, top, ss); if (H - lw > 450) seg(0, len, 18, z0 + lw + (H - lw) / 2 - 9, z0 + lw + (H - lw) / 2 + 9, ss); break;
        case "par_glass": var lg = B.railLow(e); seg(e0, e1, th, z0, z0 + lg - 75, main); coping(z0 + lg - 75); seg(20, len - 20, 12, z0 + lg, top - 25, glass, ga); seg(0, len, 36, top - 25, top, ss); every(1500, function (s) { post(s, 40, z0 + lg, z0 + lg + 120, ss); }); break;
        case "par_cut": seg(e0, e1, th, z0, z0 + 200, main); seg(e0, e1, th, top - 225, top - 75, main); coping(top - 75); fill(450, function (s, w) { seg(s - w / 3, s + w / 3, th, z0 + 200, top - 225, main); }); break;
        case "par_hslot": every(1800, function (s) { post(s, 230, z0, top - 75, main, th); }); seg(e0, e1, th, z0, z0 + 150, main); coping(top - 75); var nb = Math.max(1, Math.floor((H - 225) / 220)); for (var i4 = 0; i4 < nb; i4++) { var zb = z0 + 150 + (i4 + 0.45) * (H - 225) / nb; seg(0, len, th * 0.8, zb, zb + (H - 225) / nb * 0.55, main); } break;
        case "par_jali": every(1800, function (s) { post(s, 230, z0, top - 75, main, th); }); seg(e0, e1, th, z0, z0 + 200, main); seg(e0, e1, th, top - 200, top - 75, main); coping(top - 75); var jl = L2(e.look2 && B.LOOKS[e.look2] ? e.look2 : "tile_terracotta");
          fill(140, function (s) { post(s, 40, z0 + 200, top - 200, jl, 60); }); for (var z5 = z0 + 200 + 120; z5 < top - 240; z5 += 140) seg(0, len, 60, z5, z5 + 40, jl); break;
        case "par_baluster": every(1800, function (s) { post(s, 300, z0, top, main, Math.max(th, 230)); post(s, 360, top, top + 60, main, Math.max(th, 230) + 60); }); seg(e0, e1, th + 40, z0, z0 + 150, main); seg(e0, e1, th + 60, top - 110, top, main);
          fill(200, function (s) { var hb = H - 260, zc = z0 + 150; post(s, 60, zc, zc + hb, main); post(s, 120, zc + hb * 0.18, zc + hb * 0.5, main); post(s, 90, zc + hb * 0.5, zc + hb * 0.62, main); post(s, 100, zc, zc + 40, main); post(s, 100, zc + hb - 40, zc + hb, main); }); break;
        case "par_battlement": seg(e0, e1, th, z0, top - 250, main); fill(800, function (s, w) { seg(s - w / 4, s + w / 4, th, top - 250, top - 40, main); seg(s - w / 4 - 25, s + w / 4 + 25, th + 50, top - 40, top, main); }); break;
        case "par_step": seg(e0, e1, th, z0, top - 375, main); coping(top - 375); every(2400, function (s) { post(s, 300, z0, top, main, Math.max(th, 230)); post(s, 380, top, top + 75, main, Math.max(th, 230) + 80); }); break;
        case "par_planter": seg(e0, e1, th, z0, top - 75, main); coping(top - 75); var n2 = G.mul(G.perp(u), -(th / 2 + 190)), pa = G.add(at(150), n2), pb = G.add(at(len - 150), n2); if (len > 600) { along(M, pa, pb, 380, z0, z0 + 420, main); along(M, G.add(at(190), n2), G.add(at(len - 190), n2), 300, z0 + 420, z0 + 430, L2("soil")); fill(400, function (s) { if (s > 250 && s < len - 250) box(M, G.add(at(s), n2), 220, 220, ang + 0.6, z0 + 430, z0 + 700, L2("foliage")); }); } break;
        default: var nP = Math.max(1, Math.round(len / 1200)); seg(0, len, 50, top - 50, top, main); for (var j = 0; j <= nP; j++) post(len * j / nP, 40, z0, top, main);
      }
    }
  };
})();
