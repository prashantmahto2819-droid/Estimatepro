/* Estimate Pro — catalogue 7: picture cut-outs. A cut-out is a flat picture that stands upright and always turns to face
   the camera (the usual way people and trees are shown in presentation views). View only — never in the estimate.
   * Built-in figures and trees are drawn here as vector pictures (app-made, no photographs).
   * "Your own pictures": PNG files with a transparent background, kept inside the drawing (bim.pics) — B.addPic().
   Use only pictures you have the right to use. */
(function () {
  "use strict";
  var EP = window.EP, B = EP.bim, A = B && B.ASSET_LIB, mk = B && B.AH && B.AH.mk, G = EP.geom; if (!A || !mk) return;
  var CU = "Cut-outs — pictures (view only)", K = 0.001;
  Object.assign(B.CAT_FILL, (function () { var o = {}; o[CU] = "rgba(200,120,160,.12)"; return o; })());
  B.CAT_LAY = Object.assign(B.CAT_LAY || {}, (function () { var o = {}; o[CU] = "A-DECO"; return o; })());
  function uri(svg) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); }
  function rnd(seed) { var s = seed * 9301 + 49297; return function () { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }

  /* a standing or walking figure, 200 × 500 units = 0.68 × 1.70 m. o: top, bottom, skin, hair, walk, long (long hair), skirt, kurta, bag */
  function figure(o) {
    var sk = o.skin || "#c58f6c", sk2 = "#a87452", top = o.top, bot = o.bottom, hair = o.hair || "#241c18", w = o.walk ? 1 : 0;
    var legL = w ? "M92 262 C84 330 66 400 52 468 L78 474 C92 410 108 340 112 266 Z" : "M84 262 C80 330 80 400 80 470 L104 470 C104 400 106 330 104 264 Z";
    var legR = w ? "M100 262 C112 330 130 398 150 462 L126 472 C110 410 96 340 90 268 Z" : "M100 262 C100 330 100 400 100 470 L124 470 C124 400 122 330 118 262 Z";
    var shoeL = w ? "M44 466 L80 474 L78 488 L38 486 Z" : "M74 468 L106 468 L108 488 L66 488 Z", shoeR = w ? "M124 470 L152 460 L166 478 L130 488 Z" : "M98 468 L126 468 L134 488 L98 488 Z";
    var armL = w ? "M70 122 C52 150 50 200 60 248 L74 244 C70 204 74 164 86 136 Z" : "M68 122 C54 150 52 210 56 262 L70 262 C70 214 74 166 84 136 Z";
    var armR = w ? "M132 122 C150 148 158 196 150 244 L136 242 C140 202 132 164 118 136 Z" : "M134 122 C148 150 150 210 146 262 L132 262 C132 214 128 166 118 136 Z";
    var torso = o.kurta ? "M70 118 C84 108 118 108 132 118 C140 170 138 250 134 330 L68 330 C64 250 62 170 70 118 Z" : "M70 118 C84 108 118 108 132 118 C138 160 132 230 124 270 L80 270 C70 230 64 160 70 118 Z";
    var skirt = o.skirt ? "<path d='M78 262 C70 330 58 400 50 462 L152 462 C144 400 132 330 124 262 Z' fill='" + bot + "'/><path d='M100 262 C104 330 110 400 118 462 L152 462 C144 400 132 330 124 262 Z' fill='#000' opacity='.12'/>" : "";
    var s = "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='1000' viewBox='0 0 200 500'><defs><linearGradient id='sh' x1='0' x2='1'><stop offset='0' stop-color='#000' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='.28'/></linearGradient></defs>";
    if (!o.skirt) s += "<path d='" + legL + "' fill='" + bot + "'/><path d='" + legR + "' fill='" + bot + "'/><path d='" + legR + "' fill='#000' opacity='.14'/>";
    s += skirt + "<path d='" + shoeL + "' fill='#1d1d1f'/><path d='" + shoeR + "' fill='#1d1d1f'/>";
    s += "<path d='" + armL + "' fill='" + top + "'/><path d='" + armR + "' fill='" + top + "'/><path d='" + armR + "' fill='#000' opacity='.16'/>";
    s += "<ellipse cx='" + (w ? 62 : 63) + "' cy='" + (w ? 256 : 270) + "' rx='9' ry='11' fill='" + sk + "'/><ellipse cx='" + (w ? 146 : 139) + "' cy='" + (w ? 252 : 270) + "' rx='9' ry='11' fill='" + sk2 + "'/>";
    s += "<path d='" + torso + "' fill='" + top + "'/><path d='" + torso + "' fill='url(#sh)'/>";
    if (o.bag) s += "<path d='M132 124 L76 250' stroke='#3a2a1c' stroke-width='5' fill='none'/><rect x='56' y='240' width='40' height='34' rx='6' fill='#5a3d28'/>";
    s += "<path d='M90 96 L110 96 L112 116 L88 116 Z' fill='" + sk2 + "'/><ellipse cx='100' cy='72' rx='25' ry='31' fill='" + sk + "'/><path d='M100 41 A25 31 0 0 1 125 72 A25 31 0 0 1 100 103 Z' fill='#000' opacity='.10'/>";
    s += o.long ? "<path d='M73 74 C68 34 132 34 127 74 C132 110 134 140 126 160 L114 150 C122 120 122 90 118 66 C104 60 92 60 82 68 C78 92 78 120 86 150 L74 160 C66 140 68 110 73 74 Z' fill='" + hair + "'/>" : "<path d='M74 70 C68 32 132 32 126 70 C120 56 104 50 92 54 C82 56 76 62 74 70 Z' fill='" + hair + "'/>";
    return uri(s + "</svg>");
  }
  /* a tree picture, 600 × 800 units. kind: round | tall | flower | palm */
  function treePic(kind, seed, cols, flower) {
    var r = rnd(seed), s = "<svg xmlns='http://www.w3.org/2000/svg' width='900' height='1200' viewBox='0 0 600 800'>", i;
    if (kind === "palm") {
      s += "<path d='M286 800 C292 600 300 420 318 250 L340 252 C326 420 322 600 322 800 Z' fill='#7a5a3c'/><path d='M306 800 C310 600 316 420 332 251 L340 252 C326 420 322 600 322 800 Z' fill='#000' opacity='.18'/>";
      for (i = 0; i < 11; i++) { var a = -Math.PI + i / 10 * Math.PI, L = 230 + r() * 60, ex = 328 + Math.cos(a) * L, ey = 250 + Math.sin(a) * L * 0.55 + 150 * Math.pow(Math.abs(Math.cos(a)), 2), mx = 328 + Math.cos(a) * L * 0.5, my = 250 + Math.sin(a) * L * 0.75 - 40;
        s += "<path d='M328 250 Q" + mx.toFixed(0) + " " + my.toFixed(0) + " " + ex.toFixed(0) + " " + ey.toFixed(0) + " Q" + (mx + 10).toFixed(0) + " " + (my + 46).toFixed(0) + " 328 262 Z' fill='" + cols[i % cols.length] + "'/>"; }
      return uri(s + "<ellipse cx='328' cy='256' rx='26' ry='20' fill='#5d452e'/></svg>");
    }
    var tall = kind === "tall", cx = 300, cy = tall ? 330 : 300, rx = tall ? 120 : 250, ry = tall ? 300 : 230;
    s += "<path d='M282 800 C286 700 288 620 284 520 L320 520 C316 620 318 700 324 800 Z' fill='#6d4c33'/><path d='M304 800 C306 700 306 620 304 520 L320 520 C316 620 318 700 324 800 Z' fill='#000' opacity='.2'/>";
    if (!tall) s += "<path d='M300 560 C260 500 220 470 180 440 M302 560 C340 500 380 470 420 430' stroke='#6d4c33' stroke-width='16' fill='none' stroke-linecap='round'/>";
    for (i = 0; i < (tall ? 70 : 90); i++) { var an = r() * Math.PI * 2, rr = Math.sqrt(r()), x = cx + Math.cos(an) * rx * rr, y = cy + Math.sin(an) * ry * rr, sz = 34 + r() * 40, shade = (y - (cy - ry)) / (2 * ry);
      s += "<circle cx='" + x.toFixed(0) + "' cy='" + y.toFixed(0) + "' r='" + sz.toFixed(0) + "' fill='" + cols[Math.min(cols.length - 1, Math.floor(shade * cols.length + r() * 0.8))] + "'/>"; }
    for (i = 0; i < 36; i++) { var a2 = r() * Math.PI * 2, r2 = Math.sqrt(r()) * 0.85, x2 = cx - rx * 0.12 + Math.cos(a2) * rx * r2, y2 = cy - ry * 0.25 + Math.sin(a2) * ry * r2 * 0.75;
      s += "<circle cx='" + x2.toFixed(0) + "' cy='" + y2.toFixed(0) + "' r='" + (14 + r() * 16).toFixed(0) + "' fill='" + (flower ? flower[i % flower.length] : "#b7d67a") + "' opacity='" + (flower ? 0.95 : 0.5) + "'/>"; }
    return uri(s + "</svg>");
  }

  function cut(id, name, hmm, src, wmm) {
    mk(id, name, CU, wmm || Math.round(hmm * 0.4), 200, hmm, "deco", { nb: 1 }, [["c", 0, 0, 180], ["l", -260, 0, 260, 0], ["l", 0, -120, 0, 120]], []);
    A[id].deco = true; A[id].cut = { src: src, h: hmm, w: wmm };
    A[id].mesh = function (M, X, z0, LK, H, e) { var c = X([0, 0]), s = X.s, cu = A[id].cut; if (H.cutouts) H.cutouts.push({ p: [c[0] * K, c[1] * K, z0 * K], h: cu.h * s * K, w: cu.w ? cu.w * s * K : 0, src: cu.src, flip: !!(e && e.flip), walk: ((e && +e.walk) || 0) * s * K, dir: [Math.cos((X.r || 0) * Math.PI / 180), Math.sin((X.r || 0) * Math.PI / 180)], seed: (c[0] * 0.0013 + c[1] * 0.0007) % 7 }); };
  }
  var G1 = ["#2f6a2c", "#3f8433", "#56a03c", "#74b84a"], G2 = ["#25552a", "#2f6a2c", "#3f8433", "#56a03c"];
  cut("cut_man_walk", "Cut-out — man walking, blue shirt", 1750, figure({ top: "#2f5f9e", bottom: "#33373d", walk: 1 }));
  cut("cut_man_stand", "Cut-out — man standing, white shirt", 1740, figure({ top: "#f2f1ec", bottom: "#2c3f5e" }));
  cut("cut_man_kurta", "Cut-out — man in kurta", 1720, figure({ top: "#e8d9b4", bottom: "#f2f1ec", kurta: 1 }));
  cut("cut_man_bag", "Cut-out — man walking with bag", 1760, figure({ top: "#4d7d5a", bottom: "#3b3f45", walk: 1, bag: 1 }));
  cut("cut_woman_saree", "Cut-out — woman in saree", 1620, figure({ top: "#b33a54", bottom: "#c9486a", skirt: 1, long: 1 }));
  cut("cut_woman_suit", "Cut-out — woman in salwar suit", 1600, figure({ top: "#d9a13a", bottom: "#2f6f73", kurta: 1, long: 1 }));
  cut("cut_woman_walk", "Cut-out — woman walking, office wear", 1650, figure({ top: "#7a8fb5", bottom: "#2b2d33", walk: 1, long: 1, bag: 1 }));
  cut("cut_worker", "Cut-out — worker, yellow vest", 1700, figure({ top: "#e3b720", bottom: "#474b52", walk: 1, hair: "#e0a81a" }));
  cut("cut_boy", "Cut-out — boy", 1250, figure({ top: "#d2452f", bottom: "#28446e", walk: 1 }));
  cut("cut_girl", "Cut-out — girl", 1200, figure({ top: "#e88bb0", bottom: "#f0d35a", skirt: 1, long: 1 }));
  cut("cut_tree_round", "Cut-out — tree, round canopy, 8 m", 8000, treePic("round", 3, G1), 6000);
  cut("cut_tree_dense", "Cut-out — tree, dense dark canopy, 10 m", 10000, treePic("round", 8, G2), 7500);
  cut("cut_tree_tall", "Cut-out — tree, tall narrow, 9 m", 9000, treePic("tall", 5, G2), 6750);
  cut("cut_tree_gulmohar", "Cut-out — flowering tree, red, 7 m", 7000, treePic("flower", 11, G1, ["#d8362b", "#e9542c", "#f0b01c"]), 5250);
  cut("cut_tree_pink", "Cut-out — flowering tree, pink, 6 m", 6000, treePic("flower", 14, G1, ["#ee9cc0", "#f6c1d8", "#e06aa0"]), 4500);
  cut("cut_tree_palm", "Cut-out — palm, 9 m", 9000, treePic("palm", 4, ["#2f6a2c", "#3f8433", "#56a03c"]), 6750);

  /* ----- the user's own pictures (kept in the drawing) ----- */
  B.regPics = function (d) {
    var pics = d && d.bim && d.bim.pics; if (!pics) return;
    Object.keys(pics).forEach(function (id) { var k = "pic_" + id; if (A[k] && A[k].cut.src === pics[id].src) return; var p = pics[id], h = p.h || 1700; cut(k, "My picture — " + (p.name || id), h, p.src, Math.round(h * (p.asp || 0.4))); A[k].userPic = id; });
  };
  /* add a picture: src = data URL (PNG with transparency), asp = width / height, h = real height in mm */
  B.addPic = function (ed, name, src, asp, h) {
    var nb = EP.cad.clone(ed.doc.d.bim || B.ensure(ed.doc.d)), id = "p" + Date.now().toString(36); nb.pics = Object.assign({}, nb.pics || {}); nb.pics[id] = { name: name, src: src, asp: asp, h: h || 1700 };
    ed.doc.set("bim", nb); B.regPics(ed.doc.d); return "pic_" + id;
  };
  /* ----- the user's own material pictures (a photo of a tile, marble, wallpaper, wood…) kept in the drawing (bim.texs).
     Up to 5 per drawing can be shown at once: each takes a picture slot of the 3D view (pattern 20 + slot). ----- */
  B.TEXSLOTS = [];
  B.regTex = function (d) {
    var T = (d && d.bim && d.bim.texs) || {}, ids = Object.keys(T).slice(0, 5); B.TEXSLOTS = ids.map(function (id) { return T[id].src; });
    Object.keys(B.LOOKS).forEach(function (k) { if (/^tex_/.test(k) && ids.indexOf(k.slice(4)) < 0) delete B.LOOKS[k]; });
    ids.forEach(function (id, i) { var t = T[id]; B.LOOKS["tex_" + id] = { n: "My picture — " + t.name, c: t.avg || "#bdbdbd", p: 20 + i, s: Math.max(0.05, (t.w || 600) / 1000), g: t.g == null ? 0.25 : t.g }; });
  };
  /* w = real width in mm that one copy of the picture covers */
  B.addTex = function (ed, name, src, w, avg) {
    var nb = EP.cad.clone(ed.doc.d.bim || B.ensure(ed.doc.d)); nb.texs = Object.assign({}, nb.texs || {}); if (Object.keys(nb.texs).length >= 5) return null;
    var id = "t" + Date.now().toString(36); nb.texs[id] = { name: name, src: src, w: w || 600, avg: avg }; ed.doc.set("bim", nb); B.regTex(ed.doc.d); return "tex_" + id;
  };
  var meshes0 = B.meshes; if (meshes0) B.meshes = function (doc) { if (doc && doc.d) B.regTex(doc.d); return meshes0.apply(this, arguments); };
  var ext = B.EXT.asset; ["mesh", "qty", "plan", "segs", "bbox"].forEach(function (fn) { var f0 = ext[fn]; if (typeof f0 !== "function") return; ext[fn] = function (a, b) { var doc = fn === "mesh" ? b : a; if (doc && doc.d) B.regPics(doc.d); return f0.apply(this, arguments); }; });
})();
