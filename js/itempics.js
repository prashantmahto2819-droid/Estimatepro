/* Estimate Pro — a picture for every SOR item.
   EP.itemPic(desc, unit) → { key, label, svg }: a shaded, product-style drawing chosen from the item's words (pipe, bend, trap, valve, brickwork …).
   Real photos uploaded by the super admin (table item_pics, bucket item-pics) are shown instead when they exist: for that item, or for all items of that kind.
   Drawings use light from the top-left, metal / ceramic / wood gradients, surface textures and soft shadows so they read like product photos. */
(function () {
  "use strict";
  var EP = window.EP;
  var N = 0, pf = "";
  function u(n) { return "url(#" + pf + n + ")"; }
  function stops(a) { return a.map(function (c, i) { var arr = Array.isArray(c); return '<stop offset="' + (arr && c[1] != null ? c[1] : i / (a.length - 1)) + '" stop-color="' + (arr ? c[0] : c) + '"/>'; }).join(""); }
  function lg(id, a, horiz) { return '<linearGradient id="' + pf + id + '" x1="0" y1="0" x2="' + (horiz ? 1 : 0) + '" y2="' + (horiz ? 0 : 1) + '">' + stops(a) + "</linearGradient>"; }
  function rg(id, a, cx, cy) { return '<radialGradient id="' + pf + id + '" cx="' + (cx || 0.35) + '" cy="' + (cy || 0.3) + '" r="0.75">' + stops(a) + "</radialGradient>"; }
  /* materials: [dark edge, lit, mid, shade] — light from the top */
  var M = {
    ci: [["#2a2e32"], ["#8a929a", 0.3], ["#4d545b", 0.62], ["#1f2326"]],
    cr: [["#6f7880"], ["#fbfdff", 0.3], ["#b3bcc4", 0.6], ["#56606a"]],
    br: [["#6d5214"], ["#ffe28c", 0.3], ["#c99b35", 0.62], ["#5e4510"]],
    pv: [["#9099a2"], ["#ffffff", 0.32], ["#d3d9de", 0.62], ["#8c959e"]],
    gi: [["#6c7680"], ["#e9eef2", 0.3], ["#a4afb8", 0.62], ["#5a646d"]],
    bk: [["#050505"], ["#5d5f61", 0.3], ["#1d1f20", 0.62], ["#000"]],
    cu: [["#7a3d12"], ["#f8b98a", 0.3], ["#c56f37", 0.62], ["#6b330e"]],
    rs: [["#3a2a20"], ["#9b7d66", 0.3], ["#5f4636", 0.62], ["#2c2018"]],
    ms: [["#2f3640"], ["#a9b3be", 0.3], ["#626c77", 0.62], ["#262c33"]],
    cp: [["#a8967a"], ["#fff6e4", 0.32], ["#e8d9bd", 0.62], ["#9c8a6e"]],
    pp: [["#2e6b3a"], ["#a9e0b3", 0.3], ["#4f9a5c", 0.62], ["#245a30"]],
    wh: [["#a3acb5"], ["#ffffff", 0.32], ["#e9edf0", 0.62], ["#9aa3ac"]]
  };
  function defs() {
    var d = lg("bg", ["#ffffff", "#e7ecf1"]) +
      '<radialGradient id="' + pf + 'sh2"><stop offset="0" stop-color="#000" stop-opacity=".32"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>' +
      '<filter id="' + pf + 'ds" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="1.5" dy="3" stdDeviation="2.6" flood-color="#0b1622" flood-opacity=".3"/></filter>' +
      '<filter id="' + pf + 'tx" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="3" seed="7" result="t"/><feColorMatrix in="t" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .75 -.28" result="n"/><feComposite in="n" in2="SourceGraphic" operator="in" result="m"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="m"/></feMerge></filter>' +
      '<filter id="' + pf + 'mt" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="3" seed="11" result="t"/><feColorMatrix in="t" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .45 -.18" result="n"/><feComposite in="n" in2="SourceGraphic" operator="in" result="m"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="m"/></feMerge></filter>' +
      '<filter id="' + pf + 'wg" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".012 .32" numOctaves="2" seed="5" result="t"/><feColorMatrix in="t" values="0 0 0 0 .25 0 0 0 0 .12 0 0 0 0 .02 0 0 0 1.2 -.45" result="n"/><feComposite in="n" in2="SourceGraphic" operator="in" result="m"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="m"/></feMerge></filter>' +
      '<filter id="' + pf + 'bl"><feGaussianBlur stdDeviation="3"/></filter>';
    Object.keys(M).forEach(function (k) { d += lg(k, M[k]) + lg(k + "H", M[k], true); });
    d += rg("cer", ["#ffffff", "#eef2f5", "#c9d2da"], 0.4, 0.3) + lg("sky", ["#cfe8fb", "#8fbfe3", "#e6f3fc"]) + lg("wood", ["#c88a4c", "#a8682f", "#c07f43"], true) + lg("woodL", ["#e4b77f", "#c9935a"], true);
    d += lg("soil", ["#b48a5a", "#8a643c"]) + lg("conc", ["#d9dcdf", "#b9bec3"]) + lg("concS", ["#a9afb5", "#8d949b"]) + lg("bit", ["#3b3b3b", "#1f1f1f"]) + lg("wall", ["#f3efe8", "#e2dcd2"]) + ('<radialGradient id="' + pf + 'glow"><stop offset="0" stop-color="#fffbe0"/><stop offset=".3" stop-color="#ffe680" stop-opacity=".75"/><stop offset="1" stop-color="#ffe680" stop-opacity="0"/></radialGradient>');
    return "<defs>" + d + "</defs>";
  }
  function s(inner) {
    pf = "ip" + (++N) + "_";
    var body = inner();
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160" role="img">' + defs() + '<rect width="240" height="160" rx="10" fill="' + u("bg") + '"/><g stroke-linejoin="round" stroke-linecap="round">' + body + "</g></svg>";
  }
  function P(d, f, st, w, ex) { return '<path d="' + d + '" fill="' + (f || "none") + '"' + (st ? ' stroke="' + st + '"' : "") + (w ? ' stroke-width="' + w + '"' : "") + (ex || "") + "/>"; }
  function Rc(x, y, w, h, f, rx, st, ex) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"' + (rx ? ' rx="' + rx + '"' : "") + ' fill="' + (f || "none") + '"' + (st ? ' stroke="' + st + '" stroke-width="1"' : "") + (ex || "") + "/>"; }
  function C(x, y, r, f, st, w) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + (f || "none") + '"' + (st ? ' stroke="' + st + '"' : "") + (w ? ' stroke-width="' + w + '"' : "") + "/>"; }
  function E(x, y, rx, ry, f, st, ex) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" fill="' + (f || "none") + '"' + (st ? ' stroke="' + st + '"' : "") + (ex || "") + "/>"; }
  function G(inner, ex) { return "<g" + (ex || "") + ">" + inner + "</g>"; }
  function rep(n, fn) { var o = ""; for (var i = 0; i < n; i++) o += fn(i); return o; }
  function shadow(cx, cy, rx, ry) { return E(cx, cy, rx, ry || 7, u("sh2")); }
  var DS = ' filter="' + "DSF" + '"';
  function ds(x) { return x.replace(/DSF/g, u("ds")); }
  /* a round tube along any path, shaded like metal / PVC: layered strokes + a top highlight */
  function tube(d, w, m) {
    var c = M[m] || M.ci, dk = c[0][0] || c[0], mid = c[2][0], li = c[1][0];
    return P(d, null, dk, w) + P(d, null, mid, w * 0.8) + P(d, null, li, w * 0.42, ' stroke-opacity=".55"') + P(d, null, "#fff", w * 0.12, ' stroke-opacity=".7" transform="translate(0,' + (-w * 0.2).toFixed(1) + ')"');
  }
  /* horizontal / vertical cylinder with an open end showing the bore */
  function cylH(x1, x2, y, r, m, open) { return Rc(x1, y - r, x2 - x1, 2 * r, u(m)) + E(x2, y, r * 0.32, r, u(m + "H")) + E(x1, y, r * 0.32, r, u(m + "H")) + (open ? E(x1, y, r * 0.22, r * 0.72, "#15181a") : ""); }
  function cylV(x, y1, y2, r, m) { return Rc(x - r, y1, 2 * r, y2 - y1, u(m + "H")) + E(x, y1, r, r * 0.3, u(m)) ; }
  function socket(x, y, r, len, m, vert) { return vert ? Rc(x - r, y, 2 * r, len, u(m + "H"), 3) + P("M" + (x - r) + " " + (y + 3) + "h" + 2 * r, null, "#000", 1, ' stroke-opacity=".25"') : Rc(x, y - r, len, 2 * r, u(m), 3) + P("M" + (x + 3) + " " + (y - r) + "v" + 2 * r, null, "#000", 1, ' stroke-opacity=".25"'); }
  /* isometric-ish box: front w×h, depth dx/dy, top/front/side fills */
  function box(x, y, w, h, dx, dy, top, front, side, ex) { return G(P("M" + x + " " + y + "l" + dx + " " + (-dy) + "h" + w + "l" + (-dx) + " " + dy + "z", top) + Rc(x, y, w, h, front) + P("M" + (x + w) + " " + y + "l" + dx + " " + (-dy) + "v" + h + "l" + (-dx) + " " + dy + "z", side), ex); }
  function ground(y) { return Rc(0, y, 240, 160 - y, "#dfe4e8") + P("M0 " + y + "H240", null, "#c9d0d6", 1); }
  function bricks(x, y, w, h, bw, bh, col) { var o = Rc(x, y, w, h, "#cfc3b5"); for (var r = 0; r * bh < h; r++) for (var c = -1; c * bw < w; c++) { var xx = x + c * bw + (r % 2 ? bw / 2 : 0), x0 = Math.max(x, xx + 1), x1 = Math.min(x + w, xx + bw - 1); if (x1 - x0 > 2) o += Rc(x0, y + r * bh + 1, x1 - x0, Math.min(bh - 2, y + h - (y + r * bh + 1)), col || ["#b5532d", "#a84a27", "#c0603a", "#9e4524"][(r * 7 + c * 3 + 9) % 4], 1); } return o; }

  var D = {
    truck: function () { return ground(122) + shadow(120, 124, 96, 6) + ds(G(
      P("M30 58h104l6 46H30z", "#e5a823") + P("M30 58h104l2 12H30z", "#f6c453") + P("M36 50l14-14h76l8 22H30z", "#a57b47") + rep(6, function (i) { return C(52 + i * 13, 44 + (i % 2) * 3, 5, "#8c6a3f"); }) +
      P("M140 66h32l22 22v20h-54z", "#d9534f") + P("M146 72h22l14 16h-36z", u("sky")) + Rc(140, 100, 56, 6, "#6b7178") +
      [62, 170].map(function (x) { return C(x, 110, 13, "#1d1f21") + C(x, 110, 6, u("gi")) + C(x, 110, 2, "#333"); }).join(""), DS)); },
    dig: function () { return Rc(0, 64, 240, 96, u("soil"), 0, null, ' filter="' + u("tx") + '"') + P("M60 64l14 64h72l14-64z", "#6e5132") + P("M74 128h72", null, "#5a4128", 3) + Rc(0, 60, 240, 6, "#7da454") +
      P("M170 64c6-22 44-26 56 0z", "#9b7246", null, null, ' filter="' + u("tx") + '"') + ds(G(P("M118 18l-20 62", null, "#7a5a32", 5) + P("M90 76l18 6-6 16-18-8z", u("ms")), DS)); },
    roller: function () { return ground(126) + shadow(118, 128, 80, 6) + ds(G(Rc(66, 48, 96, 42, "#f2b51b", 6) + Rc(84, 26, 46, 24, u("sky"), 4) + Rc(80, 22, 54, 6, "#333", 2) + C(78, 100, 28, u("gi")) + C(78, 100, 28, null, "#5a646d") + C(78, 100, 11, "#3a4148") + C(78, 100, 5, u("cr")) + C(178, 108, 18, "#1d1f21") + C(178, 108, 7, u("gi")), DS)); },
    concrete: function () { return shadow(120, 132, 90, 8) + ds(G(box(36, 74, 128, 50, 42, 30, u("conc"), u("concS"), "#8f969c"), DS + ' filter="' + u("tx") + '"')) + rep(26, function (i) { var x = 42 + ((i * 53) % 113), y = 80 + ((i * 29) % 40); return E(x, y, 2 + (i * 7) % 4, 1.5 + (i * 3) % 3, ["#7d848a", "#959ca2", "#6c7379"][i % 3]); }) + P("M36 74l42-30h128", null, "#fff", 1.5, ' stroke-opacity=".6"'); },
    steel: function () { return shadow(120, 126, 100, 8) + rep(7, function (i) { var y = 46 + i * 11 + (i % 2) * 2, x = 20 + (i % 3) * 4; return tube("M" + x + " " + y + "L" + (x + 196) + " " + (y - 10), 9, "rs") + rep(22, function (j) { return P("M" + (x + 6 + j * 9) + " " + (y - 4 - j * 0.45) + "l3 8", null, "#2c2018", 1.2, ' stroke-opacity=".6"'); }); }); },
    shutter: function () { return ground(132) + ds(G(box(30, 54, 170, 30, 16, 14, "#d7b07a", "#e4c08b", "#b98e57", ' filter="' + u("wg") + '"') + rep(3, function (i) { return P("M30 " + (62 + i * 8) + "h170", null, "#a07440", 1); }) + [56, 116, 176].map(function (x) { return tube("M" + x + " 86V132", 6, "gi"); }).join("") + P("M50 112h140", null, "#8a939b", 3), DS)); },
    brick: function () { return shadow(120, 136, 96, 7) + ds(G(P("M28 46l26-18h162l-26 18z", "#c9b9a7") + bricks(28, 46, 162, 86, 30, 12) + P("M190 46l26-18v86l-26 18z", "#8f3c1e") + rep(7, function (i) { return P("M190 " + (58 + i * 12) + "l26-18", null, "#cfc3b5", 1.2); }), DS + ' filter="' + u("tx") + '"')); },
    stone: function () { var st = [[30, 30, 46, 30], [80, 26, 54, 34], [138, 30, 72, 28], [30, 64, 62, 34], [96, 64, 40, 30], [140, 62, 70, 36], [30, 102, 50, 30], [84, 98, 64, 34], [152, 102, 58, 30]]; return shadow(120, 138, 96, 7) + ds(G(Rc(28, 24, 184, 112, "#bdb6aa") + st.map(function (r, i) { return Rc(r[0] + 2, r[1] + 2, r[2] - 4, r[3] - 4, ["#a39b8d", "#8f887b", "#b3ab9c", "#9a9283"][i % 4], 7) + P("M" + (r[0] + 6) + " " + (r[1] + 6) + "h" + (r[2] - 16), null, "#fff", 2, ' stroke-opacity=".25"'); }).join(""), DS + ' filter="' + u("tx") + '"')); },
    plaster: function () { return G(Rc(20, 20, 200, 120, "#b7543a") + bricks(20, 20, 200, 120, 30, 12) + P("M20 20h120c-10 30 12 60-4 120H20z", u("wall")), ' filter="' + u("mt") + '"') + ds(G(P("M130 74l58-16 8 18-58 16z", u("cr")) + P("M162 70l22 36", null, "#7a4b22", 7), DS)); },
    paint: function () { return Rc(14, 18, 150, 124, "#f1ece4") + P("M14 18h90c-6 40 8 80 0 124H14z", "#7fc8b8") + P("M98 18c-6 40 8 80 0 124", null, "#6cb7a6", 3) + ds(G(cylH(118, 196, 46, 13, "pv") + Rc(118, 33, 78, 26, "#7fc8b8", 13) + P("M196 46h14v34h-60v18", null, u("ms"), 5) + Rc(144, 98, 12, 40, "#2d3436", 4), DS)); },
    floor: function () { var o = P("M10 150L62 54h116l52 96z", "#efe9df"); for (var i = 0; i <= 5; i++) o += P("M" + (62 + i * 23.2) + " 54L" + (10 + i * 44) + " 150", null, "#bdb3a4", 1.2); for (var j = 1; j < 5; j++) { var y = 54 + j * 24, t = (y - 54) / 96; o += P("M" + (62 - 52 * t) + " " + y + "H" + (178 + 52 * t), null, "#bdb3a4", 1.2); } return Rc(0, 0, 240, 56, "#e8edf1") + G(o, ' filter="' + u("tx") + '"') + P("M70 60L40 140h50l20-80z", "#fff", null, null, ' opacity=".35"'); },
    walltile: function () { var o = Rc(26, 14, 188, 132, "#dfe9ef"); for (var r = 0; r < 6; r++) for (var c = 0; c < 6; c++) o += Rc(28 + c * 31, 16 + r * 21.5, 29.5, 20, (r + c) % 5 ? "#f6fafc" : "#e9f1f6", 1) + P("M" + (30 + c * 31) + " " + (18 + r * 21.5) + "h18", null, "#fff", 2, ' stroke-opacity=".9"'); return ds(G(o, DS)) + P("M40 20L20 140h40l30-120z", "#fff", null, null, ' opacity=".25"'); },
    slab: function () { return shadow(126, 134, 96, 8) + ds(G(box(30, 66, 150, 58, 38, 28, "#e9e6e1", "#d6d2cb", "#bfbab2"), DS)) + G(P("M70 40c30 6 40-6 70 4s40 0 70-6M44 62c40-10 70 8 120-4", null, "#8d877d", 1.2) + P("M40 82c30 10 60-10 90 6s40-4 50 0M60 108c26-6 50 10 90-2", null, "#9b958b", 1), ' opacity=".8"') + P("M30 66l38-28h20l-38 28z", "#fff", null, null, ' opacity=".5"'); },
    door: function () { return ground(140) + shadow(120, 142, 64, 5) + ds(G(Rc(64, 14, 112, 128, "#8b5a2b") + Rc(72, 20, 96, 122, u("wood"), 0, null, ' filter="' + u("wg") + '"') + [[80, 28, 80, 44], [80, 80, 80, 54]].map(function (r) { return Rc(r[0], r[1], r[2], r[3], "none", 2, "#6e4520") + Rc(r[0] + 3, r[1] + 3, r[2] - 6, r[3] - 6, "#c88a4c", 2, null, ' opacity=".35"'); }).join("") + Rc(152, 76, 6, 22, u("brH"), 3) + C(155, 92, 2, "#3a2a10"), DS)); },
    window: function () { return Rc(0, 0, 240, 160, u("wall")) + ds(G(Rc(46, 22, 148, 104, u("gi"), 3) + Rc(54, 30, 64, 88, u("sky")) + Rc(122, 30, 64, 88, u("sky")) + P("M58 40l26 26M126 40l40 40", null, "#fff", 5, ' stroke-opacity=".6"') + Rc(116, 30, 8, 88, u("giH")) + Rc(40, 126, 160, 8, "#d8d3ca"), DS)); },
    rail: function () { return ground(130) + rep(12, function (i) { return tube("M" + (26 + i * 17) + " 52V128", 5, "ms"); }) + tube("M16 50H224", 9, "ms") + tube("M16 118H224", 7, "ms") + tube("M18 40V132", 10, "ms") + tube("M222 40V132", 10, "ms"); },
    sheet: function () { var d = "", o = ""; for (var i = 0; i < 10; i++) { var x = 26 + i * 19; o += P("M" + x + " 120l26-74h19l-26 74z", i % 2 ? "#aeb8c2" : "#e4e9ee"); } return shadow(130, 134, 100, 7) + ds(G(o, DS)) + P("M26 120l26-74h190", null, "#7e8a96", 1.5); },
    wproof: function () { var L = [[96, 34, "url(#c)", "#c3c8cc"], [86, 10, "#2b2b2b"], [78, 8, "#4c6170"], [68, 10, "#1f1f1f"], [54, 14, "#c96f45"]]; return shadow(120, 138, 98, 6) + ds(G(Rc(24, 96, 192, 34, u("conc"), 0, null, ' filter="' + u("tx") + '"') + Rc(24, 86, 192, 10, "#262626") + Rc(24, 78, 192, 8, "#3f5b6b") + Rc(24, 68, 192, 10, "#1b1b1b", 0, null, ' filter="' + u("tx") + '"') + bricks(24, 52, 192, 16, 30, 8, "#c4693f"), DS)) + P("M196 30c-6 10-10 15-10 20a10 10 0 0 0 20 0c0-5-4-10-10-20z", "#3b82c4") + P("M192 44a4 4 0 0 0 4 6", null, "#fff", 2); },
    pipe: function (m) { m = m || "ci"; return shadow(122, 116, 96, 6) + ds(G(cylH(34, 180, 82, 18, m, true) + socket(176, 82, 23, 34, m) + E(210, 82, 7, 23, u(m + "H")) + E(210, 82, 5, 17, "#15181a"), DS)); },
    dwc: function () { return shadow(122, 116, 96, 6) + ds(G(cylH(30, 206, 82, 24, "bk", true) + rep(14, function (i) { return Rc(38 + i * 12, 57, 6, 50, u("bk"), 3); }) + E(206, 82, 8, 24, u("bkH")) + E(206, 82, 6, 18, "#3a3a3a"), DS)); },
    bend: function (m) { m = m || "ci"; return shadow(110, 138, 70, 6) + ds(G(tube("M56 128V86a42 42 0 0 1 42-42h52", 34, m) + socket(146, 44, 22, 26, m) + socket(56, 116, 22, 18, m, true) + E(172, 44, 6, 22, u(m + "H")) + E(172, 44, 4.5, 16, "#15181a"), DS)); },
    tee: function (m) { m = m || "ci"; return shadow(120, 140, 92, 6) + ds(G(tube("M40 70H200", 34, m) + tube("M120 74V120", 34, m) + socket(26, 70, 22, 22, m) + socket(192, 70, 22, 22, m) + socket(120, 112, 22, 22, m, true) + E(214, 70, 6, 22, u(m + "H")) + E(214, 70, 4.5, 16, "#15181a"), DS)); },
    trap: function (m) { m = m || "ci"; return shadow(120, 144, 80, 6) + ds(G(Rc(38, 14, 52, 12, u("gi"), 3) + rep(5, function (i) { return Rc(42 + i * 9, 16, 4, 8, "#3a4148", 1); }) + tube("M64 28V98a28 28 0 0 0 56 0V76h56V140", 30, m), DS)); },
    ftrap: function () { return Rc(0, 0, 240, 160, "#d9dee2") + G(rep(5, function (r) { return rep(7, function (c) { return Rc(c * 36 - 6, r * 34 - 4, 34, 32, "#eef1f3", 1); }); }), ' filter="' + u("tx") + '"') + ds(G(Rc(78, 38, 84, 84, u("cr"), 6) + Rc(86, 46, 68, 68, "#c5ccd2", 4) + rep(7, function (i) { return Rc(92 + i * 9, 52, 4, 56, "#6f7880", 2); }), DS)); },
    gully: function () { return Rc(0, 0, 240, 160, "#b8bdc2", 0, null, ' filter="' + u("tx") + '"') + ds(G(Rc(60, 28, 120, 104, u("conc"), 4, null, ' filter="' + u("tx") + '"') + Rc(78, 44, 84, 72, u("ci"), 3) + rep(8, function (i) { return Rc(84 + i * 9.5, 50, 5, 60, "#14171a", 2); }) + Rc(78, 44, 84, 72, "none", 3, "#5a6168"), DS)) + tube("M180 110H236", 18, "rs"); },
    valve: function () { return shadow(120, 128, 92, 6) + ds(G(cylH(24, 216, 96, 13, "br") + Rc(90, 72, 60, 48, u("br"), 12) + Rc(108, 50, 24, 24, u("brH"), 4) + E(120, 44, 40, 10, "#c0392b") + E(120, 41, 40, 9, "#e74c3c") + C(120, 41, 5, u("cr")) + rep(4, function (i) { return Rc(26 + i * 4 + (i > 1 ? 176 : 0), 82, 3, 28, "#8a6a1f", 1); }), DS)); },
    tap: function () { return Rc(0, 0, 240, 160, "#eef1f3") + Rc(20, 22, 30, 60, "#fbfcfd", 4) + ds(G(tube("M44 52H118a32 32 0 0 1 32 32V104", 16, "cr") + Rc(30, 40, 22, 26, u("cr"), 6) + Rc(96, 28, 44, 10, u("cr"), 5) + Rc(114, 34, 10, 14, u("crH")) + E(150, 106, 10, 4, u("cr")), DS)) + P("M150 112v34", null, "#9ccbf0", 4, ' stroke-opacity=".8"'); },
    shower: function () { return Rc(0, 0, 240, 160, "#eef3f6") + rep(6, function (r) { return P("M0 " + (r * 28) + "H240", null, "#d9e2e8", 1); }) + ds(G(tube("M24 22H70l30 30", 8, "cr") + E(118, 66, 34, 12, u("cr")) + E(118, 70, 30, 8, "#9aa3ab"), DS)) + rep(9, function (i) { return P("M" + (92 + i * 6.5) + " 80l-" + ((8 - i) * 1.2).toFixed(1) + " 62", null, "#6fb3e6", 1.6, ' stroke-opacity=".7"'); }); },
    basin: function () { return Rc(0, 0, 240, 104, "#eef1f3") + Rc(0, 104, 240, 56, "#d7dce0") + shadow(120, 150, 50, 5) + ds(G(P("M34 60h172c0 44-36 62-86 62S34 104 34 60z", u("cer")) + E(120, 62, 78, 12, "#dfe7ed") + E(120, 64, 66, 8, "#c9d3db") + P("M108 120v28h24v-28", u("cer")) + tube("M120 30v18h20", 8, "cr") + Rc(110, 24, 22, 10, u("cr"), 4), DS)); },
    wc: function () { return Rc(0, 0, 240, 112, "#eef1f3") + Rc(0, 112, 240, 48, "#d7dce0") + shadow(118, 146, 60, 6) + ds(G(Rc(116, 14, 72, 54, u("cer"), 8) + Rc(124, 8, 56, 8, u("cer"), 4) + P("M52 70h124c0 38-24 54-62 54S52 108 52 70z", u("cer")) + E(114, 72, 62, 10, "#e4eaef") + E(114, 73, 46, 6, "#b9c4cd") + P("M92 120l-6 22h56l-6-22", u("cer")), DS)); },
    wcin: function () { return Rc(0, 0, 240, 160, "#d7dce0") + G(rep(5, function (r) { return rep(7, function (c) { return Rc(c * 36 - 6, r * 34 - 4, 34, 32, "#e9edf0", 1); }); }), ' filter="' + u("tx") + '"') + ds(G(P("M70 30h100c14 0 20 12 20 50s-30 62-70 62-70-24-70-62 6-50 20-50z", u("cer")) + P("M92 44h56c8 0 12 8 12 34s-18 46-40 46-40-20-40-46 4-34 12-34z", "#dfe7ed") + E(120, 104, 14, 10, "#b9c4cd") + Rc(48, 70, 30, 52, "#f4f7f9", 8, "#c9d2da") + Rc(162, 70, 30, 52, "#f4f7f9", 8, "#c9d2da") + rep(4, function (i) { return P("M54 " + (80 + i * 10) + "h18M168 " + (80 + i * 10) + "h18", null, "#c9d2da", 2); }), DS)); },
    sink: function () { return Rc(0, 0, 240, 92, "#eef1f3") + ds(G(P("M14 92h212v12H14z", "#7a6a5a") + Rc(14, 80, 212, 14, "#d9cbb8") + Rc(46, 72, 148, 24, u("cr"), 4) + Rc(54, 76, 132, 16, "#9aa3ab", 3) + tube("M120 74V34h28v10", 8, "cr") + Rc(110, 66, 20, 10, u("cr"), 4), DS)) + Rc(0, 104, 240, 56, "#c9b8a2"); },
    pillar: function () { return Rc(0, 0, 240, 108, "#eef1f3") + Rc(0, 108, 240, 52, "#e2ddd5") + shadow(120, 112, 40, 4) + ds(G(Rc(108, 50, 24, 58, u("crH"), 6) + tube("M120 58C120 30 150 30 168 34v14", 12, "cr") + Rc(100, 40, 40, 12, u("cr"), 6) + E(120, 106, 22, 5, u("cr")), DS)) + P("M168 52v40", null, "#9ccbf0", 3, ' stroke-opacity=".8"'); },
    stopcock: function () { return shadow(120, 124, 92, 6) + ds(G(cylH(24, 216, 92, 11, "br") + Rc(84, 74, 72, 36, u("br"), 8) + Rc(112, 52, 16, 24, u("brH"), 3) + P("M92 46h56", null, u("cr"), 10) + C(120, 46, 7, u("cr")), DS)); },
    anglev: function () { return Rc(0, 0, 240, 160, u("wall")) + ds(G(Rc(40, 70, 34, 40, "#f6f6f6", 6) + tube("M74 90H120V140", 18, "cr") + C(120, 90, 18, u("cr")) + Rc(108, 46, 24, 30, u("crH"), 6) + E(120, 44, 18, 7, u("cr")), DS)); },
    mixer: function () { return Rc(0, 0, 240, 160, u("wall")) + ds(G(Rc(54, 70, 132, 22, u("cr"), 11) + C(70, 81, 14, u("cr")) + C(170, 81, 14, u("cr")) + Rc(110, 88, 20, 30, u("crH"), 4) + tube("M120 112v18h30", 10, "cr") + Rc(104, 44, 32, 26, u("crH"), 6) + P("M120 44V24", null, u("cr"), 8), DS)); },
    ballv: function () { return shadow(120, 124, 92, 6) + ds(G(cylH(24, 216, 92, 12, "br") + Rc(80, 70, 80, 44, u("br"), 14) + Rc(112, 56, 16, 16, u("brH"), 3) + P("M120 58L200 40", null, "#c0392b", 12) + P("M120 58L200 40", null, "#e74c3c", 7), DS)); },
    nrv: function () { return shadow(120, 128, 96, 6) + ds(G(cylH(18, 222, 92, 13, "ci") + Rc(40, 64, 14, 56, u("ciH"), 3) + Rc(186, 64, 14, 56, u("ciH"), 3) + P("M54 76h132c6 0 10 6 10 16s-4 16-10 16H54z", u("ci")) + Rc(96, 54, 48, 24, u("ci"), 6) + P("M108 98l24-12", null, "#fff", 3, ' stroke-opacity=".6"'), DS)); },
    floatv: function () { return Rc(0, 0, 240, 160, "#dfeaf3") + Rc(0, 96, 240, 64, "#7fb3d9", 0, null, ' opacity=".8"') + ds(G(cylH(10, 96, 40, 9, "br") + Rc(90, 26, 30, 28, u("br"), 6) + tube("M110 50L170 96", 6, "br") + C(186, 98, 24, u("cr")), DS)); },
    tube: function () { return Rc(0, 0, 240, 160, "#eef2f5") + ds(G(Rc(18, 62, 204, 22, "#fafbfc", 6) + Rc(26, 84, 188, 14, "#fffbe8", 7) + Rc(26, 84, 188, 14, "#fff", 7, null, ' opacity=".6"'), DS)) + E(120, 112, 110, 18, u("glow"), null, ' opacity=".7"'); },
    street: function () { return Rc(0, 0, 240, 160, "#1f2a38") + rep(20, function (i) { return C((i * 47) % 240, (i * 23) % 60, 0.8, "#fff"); }) + P("M120 160V40c0-18 16-24 46-24", null, u("gi"), 7) + ds(G(P("M150 10h48l10 14h-66z", u("gi")) + Rc(146, 22, 58, 5, "#fff6c0", 2), DS)) + P("M146 26L100 160h150L206 26z", "#ffe680", null, null, ' opacity=".22"'); },
    flood: function () { return Rc(0, 0, 240, 160, "#2b3540") + P("M120 120V150", null, u("gi"), 6) + ds(G(Rc(64, 34, 112, 82, "#3a4148", 8) + Rc(72, 42, 96, 66, "#fff6c0", 4) + rep(4, function (i) { return P("M" + (78 + i * 26) + " 34v-8", null, "#3a4148", 4); }), DS)) + P("M72 108L20 160h200l-52-52z", "#ffe680", null, null, ' opacity=".2"'); },
    panel: function () { return Rc(0, 0, 240, 160, "#e3e7eb") + ds(G(Rc(44, 30, 152, 100, "#f6f7f8", 4) + Rc(54, 40, 132, 80, "#fffdf2", 2) + Rc(54, 40, 132, 80, u("glow"), 2, null, ' opacity=".5"'), DS)); },
    exfan: function () { return Rc(0, 0, 240, 160, u("wall")) + ds(G(Rc(60, 20, 120, 120, "#f4f6f8", 10) + C(120, 80, 48, "#3a4148") + P("M120 80C130 40 160 50 150 70zM120 80C160 90 150 120 130 110zM120 80C110 120 80 110 90 90zM120 80C80 70 90 40 110 50z", u("gi")) + C(120, 80, 8, u("cr")) + rep(5, function (i) { return P("M74 " + (40 + i * 20) + "h92", null, "#cfd5da", 1.5, ' opacity=".7"'); }), DS)); },
    dboard: function () { return Rc(0, 0, 240, 160, u("wall")) + ds(G(Rc(40, 22, 160, 116, "#e9ecef", 6) + Rc(48, 30, 144, 100, "#d4d9de", 4) + Rc(56, 64, 128, 34, "#c1c7cd", 2) + rep(8, function (i) { return Rc(60 + i * 15.5, 66, 13, 30, "#fafafa", 2) + Rc(63 + i * 15.5, 72, 7, 10, i === 0 ? "#e74c3c" : "#2d3436", 1); }), DS)); },
    rshutter: function () { return ground(140) + ds(G(Rc(34, 20, 172, 16, u("gi"), 4) + Rc(40, 36, 160, 104, "#b8c0c8") + rep(16, function (i) { return Rc(40, 36 + i * 6.5, 160, 4, u("gi")); }) + Rc(110, 128, 20, 6, "#3a4148", 2), DS)); },
    gdoor: function () { return ground(140) + ds(G(Rc(66, 14, 108, 128, u("gi"), 3) + Rc(74, 22, 92, 116, u("sky")) + P("M84 34l30 30M96 30l50 50", null, "#fff", 5, ' stroke-opacity=".6"') + Rc(152, 72, 6, 30, u("crH"), 3), DS)); },
    tileroof: function () { var o = ""; for (var r = 0; r < 5; r++) for (var c = 0; c < 9; c++) o += P("M" + (20 + c * 22 + r * 8) + " " + (40 + r * 20) + "q11 -10 22 0v18q-11 -10 -22 0z", ["#c45a2f", "#b34e27", "#cf6637"][(r + c) % 3]); return Rc(0, 0, 240, 160, "#e8eef3") + ds(G(o, DS + ' filter="' + u("tx") + '"')) + P("M20 36h226", null, "#9c3e1d", 8); },
    polyroof: function () { var o = ""; for (var i = 0; i < 9; i++) o += Rc(26 + i * 20, 40, 18, 80, ["#b9e0f5", "#d9f0fb"][i % 2], 2, null, ' opacity=".85"'); return Rc(0, 0, 240, 160, "#e8eef3") + shadow(120, 134, 100, 6) + ds(G(o + P("M26 40h180", null, u("gi"), 4) + P("M26 120h180", null, u("gi"), 4), DS)); },
    rcccover: function () { return Rc(0, 0, 240, 160, "#c9cdd1", 0, null, ' filter="' + u("tx") + '"') + ds(G(E(120, 82, 92, 50, u("concS")) + E(120, 80, 78, 40, u("conc"), null, ' filter="' + u("tx") + '"') + P("M104 72a16 8 0 0 1 32 0", null, u("gi"), 5) + P("M84 92h72", null, "#9aa1a8", 2), DS)); },
    beam: function () { var dx = 110, dy = -34, I = [[40, 58], [112, 58], [112, 70], [82, 70], [82, 104], [112, 104], [112, 116], [40, 116], [40, 104], [70, 104], [70, 70], [40, 70]]; var pt = function (p, e) { return (p[0] + (e ? dx : 0)) + " " + (p[1] + (e ? dy : 0)); }; var face = function (a, b, c) { return P("M" + pt(I[a]) + "L" + pt(I[b]) + "L" + pt(I[b], 1) + "L" + pt(I[a], 1) + "z", c, "#2f3640", 0.6); };
      return shadow(130, 124, 100, 7) + ds(G(face(0, 1, "#b9c2cb") + face(1, 2, "#5d6670") + face(3, 4, "#6d7680") + face(9, 10, "#c7cfd6") + face(5, 6, "#5d6670") + face(8, 9, "#9aa3ac") + P("M" + I.map(function (p) { return pt(p); }).join("L") + "z", u("ms"), "#2f3640", 0.8), DS)); },
    urinal: function () { return Rc(0, 0, 240, 160, "#eef1f3") + ds(G(P("M78 18h84v74c0 32-20 48-42 48S78 124 78 92z", u("cer")) + P("M94 40h52v48c0 20-12 32-26 32S94 108 94 88z", "#dfe7ed") + tube("M120 10v10", 8, "cr") + C(120, 108, 3, "#9aa3ab"), DS)); },
    tank: function () { return ground(136) + shadow(120, 138, 70, 6) + ds(G(Rc(56, 34, 128, 102, u("bkH"), 18) + rep(5, function (i) { return Rc(56, 52 + i * 17, 128, 4, "#000", 0, null, ' opacity=".35"'); }) + E(120, 34, 64, 10, "#2a2a2a") + Rc(104, 18, 32, 16, u("bkH"), 4) + E(120, 18, 16, 4, "#333"), DS)); },
    manhole: function () { return Rc(0, 0, 240, 160, "#c9cdd1", 0, null, ' filter="' + u("tx") + '"') + ds(G(E(120, 82, 96, 52, "#9aa0a6") + E(120, 80, 82, 42, u("ci")) + rep(7, function (i) { return P("M" + (60 + i * 20) + " " + (52 + Math.abs(3 - i) * 3) + "v" + (56 - Math.abs(3 - i) * 6), null, "#14171a", 3); }) + E(120, 80, 82, 42, null, "#5a6168") + Rc(104, 74, 32, 12, "#2a2e32", 3), DS)); },
    clamp: function () { return Rc(0, 0, 240, 160, u("wall")) + Rc(0, 0, 70, 160, "#ddd6cb") + ds(G(tube("M150 0V160", 46, "ci") + Rc(44, 66, 36, 30, u("conc"), 3) + tube("M80 81H124", 10, "gi") + Rc(122, 72, 56, 18, u("giH"), 4) + Rc(118, 70, 10, 22, u("gi"), 2) + Rc(172, 70, 10, 22, u("gi"), 2) + C(123, 81, 3, "#3a4148") + C(177, 81, 3, "#3a4148"), DS)); },
    wiring: function () { return Rc(0, 0, 240, 160, u("wall")) + ds(G(Rc(26, 40, 66, 82, "#fbfbfb", 8) + Rc(40, 56, 38, 50, "#f0f2f4", 5) + Rc(52, 64, 14, 34, "#2d3436", 3) + tube("M92 80H150c24 0 24-44 48-44h40", 10, "pv"), DS)); },
    board: function () { return Rc(0, 0, 240, 160, u("wall")) + ds(G(Rc(28, 28, 184, 104, "#fafbfc", 10) + Rc(36, 36, 168, 88, "#f1f3f5", 7) + rep(4, function (i) { return Rc(46 + i * 38, 48, 30, 64, "#ffffff", 5, "#d5dbe0") + Rc(52 + i * 38, 56, 18, 26, i === 3 ? "#e74c3c" : "#dfe4e8", 3) + Rc(52 + i * 38, 56, 18, 13, "#fff", 3, null, ' opacity=".8"') + C(61 + i * 38, 100, 3, i === 3 ? "#e74c3c" : "#b5bec6"); }), DS)); },
    light: function () { return Rc(0, 0, 240, 160, "#2b3540") + C(120, 92, 70, u("glow"), null, null) + tube("M120 0v28", 4, "bk") + ds(G(P("M90 28h60l18 34H72z", u("cr")) + E(120, 62, 48, 8, "#d4dbe1"), DS)) + C(120, 80, 18, "#fffbe0") + C(120, 80, 30, "#fff3b0", null, null).replace("/>", ' opacity=".35"/>'); },
    fan: function () { return Rc(0, 0, 240, 160, "#eef2f5") + tube("M120 0v46", 6, "gi") + ds(G(P("M112 70L22 98l4 10 92-26zM128 70l90 28-4 10-92-26zM114 82l-4 64h20l-4-64z", u("woodL")) + C(120, 70, 18, u("gi")) + C(120, 66, 10, u("cr")), DS)); },
    cable: function () { return shadow(110, 134, 70, 7) + ds(G(C(106, 82, 52, null, "#0d0d0d", 16) + C(106, 82, 52, null, "#555", 4).replace("/>", ' stroke-dasharray="2 6" opacity=".5"/>') + C(106, 82, 34, null, "#151515", 14) + C(106, 82, 18, u("gi")) + tube("M150 104c20 8 40 8 60-6", 14, "bk") + rep(3, function (i) { return P("M208 " + (92 + i * 5) + "l14-3", null, ["#c56f37", "#e8a26c", "#b35d27"][i], 4); }), DS)); },
    road: function () { return P("M0 52h240v26H0z", u("bit"), null, null, ' filter="' + u("tx") + '"') + Rc(0, 78, 240, 22, "#8f8473", 0, null, ' filter="' + u("tx") + '"') + Rc(0, 100, 240, 26, "#b8a689", 0, null, ' filter="' + u("tx") + '"') + Rc(0, 126, 240, 34, u("soil"), 0, null, ' filter="' + u("tx") + '"') + rep(4, function (i) { return Rc(14 + i * 64, 62, 34, 5, "#f7f7f2", 1); }) + P("M0 52H240", null, "#111", 2); },
    paver: function () { var o = ""; for (var r = 0; r < 6; r++) for (var c = 0; c < 9; c++) { var x = 8 + c * 27 + (r % 2 ? 13 : 0), y = 14 + r * 23; o += Rc(x, y, 24, 20, ["#b86d4b", "#a55f41", "#c47b57", "#9a5a3c"][(r * 5 + c * 3) % 4], 4) + P("M" + (x + 3) + " " + (y + 3) + "h17", null, "#fff", 1.5, ' stroke-opacity=".3"'); } return Rc(0, 0, 240, 160, "#8b8178") + G(o, ' filter="' + u("tx") + '"'); },
    demo: function () { return ground(132) + ds(G(bricks(24, 40, 120, 92, 30, 12) + P("M100 40h46v92h-10l-18-26 18-20-12-46z", "#f6f8fa") + P("M100 40l12 46-18 20 18 26", null, "#7a3820", 1.5), DS)) + P("M164 120l-12-8 6-12 14 6zM192 128l-16-2 4-14 14 4zM150 130l-8-4 4-8 8 4z", "#a84a27") + ds(G(tube("M156 18l50 42", 8, "ms") + Rc(192, 52, 38, 26, "#e7b416", 5) + Rc(196, 56, 30, 6, "#fff", 2, null, ' opacity=".4"'), DS)); },
    wood: function () { return shadow(120, 134, 96, 7) + ds(G(rep(4, function (i) { return box(30 + i * 5, 50 + i * 18, 160, 14, 14, 8, "#e1b27a", i % 2 ? u("woodL") : u("wood"), "#8f5a28"); }), DS + ' filter="' + u("wg") + '"')); },
    glass: function () { return Rc(0, 0, 240, 160, "#e9eef2") + ds(G(Rc(48, 16, 144, 124, u("sky"), 2, null, ' opacity=".85"') + P("M64 34l52 52M78 26l74 74M150 104l26 26", null, "#fff", 6, ' stroke-opacity=".7"') + Rc(48, 16, 144, 124, "none", 2, "#7aa6c4"), DS)); },
    ceiling: function () { var o = P("M0 18L50 100h140l50-82z", "#f7f7f5"); for (var i = 1; i < 5; i++) o += P("M" + (i * 48) + " 18L" + (50 + i * 28) + " 100", null, "#c3c7cb", 2); o += P("M22 52h196M36 76h168", null, "#c3c7cb", 2) + P("M98 56l6 18h32l6-18z", "#fffbe8") ; return Rc(0, 0, 240, 160, "#dfe4e8") + G(o, ' filter="' + u("tx") + '"') + P("M0 18H240", null, "#9aa3ab", 3) + Rc(0, 100, 240, 60, "#d2d7dc"); },
    termite: function () { return Rc(0, 96, 240, 64, u("soil"), 0, null, ' filter="' + u("tx") + '"') + Rc(0, 0, 240, 96, "#eef2f5") + ds(G(Rc(150, 28, 44, 62, "#2e8b57", 8) + Rc(160, 18, 24, 12, "#333", 3) + tube("M150 50h-38l-8-6", 5, "bk"), DS)) + rep(10, function (i) { return C(100 - i * 7, 52 + i * 5, 2 + (i % 3), "#6fb3e6"); }); },
    dpc: function () { return shadow(120, 140, 96, 6) + ds(G(bricks(24, 20, 192, 64, 30, 12) + Rc(24, 84, 192, 10, "#1e1e1e", 0, null, ' filter="' + u("tx") + '"') + bricks(24, 94, 192, 40, 30, 12), DS)); },
    well: function () { return Rc(0, 110, 240, 50, u("soil"), 0, null, ' filter="' + u("tx") + '"') + ds(G(P("M108 18h24l22 92H86z", u("gi")) + rep(4, function (i) { return P("M" + (104 - i * 4) + " " + (36 + i * 20) + "h" + (32 + i * 8), null, "#5a646d", 2); }), DS)) + tube("M120 110V158", 10, "gi"); },
    plant: function () { var leaf = function (x, y, a, l, c) { return '<path d="M0 0c' + (l * 0.35) + ' ' + (-l * 0.28) + ' ' + (l * 0.8) + ' ' + (-l * 0.22) + ' ' + l + ' 0c' + (-l * 0.2) + ' ' + (l * 0.24) + ' ' + (-l * 0.65) + ' ' + (l * 0.3) + ' ' + (-l) + ' 0z" fill="' + c + '" transform="translate(' + x + ',' + y + ') rotate(' + a + ')"/><path d="M0 0h' + (l * 0.9) + '" stroke="#2f6b2c" stroke-width="1" transform="translate(' + x + ',' + y + ') rotate(' + a + ')"/>'; };
      var L = [[-150, 44], [-125, 50], [-100, 46], [-75, 50], [-55, 44], [-170, 36], [-35, 38], [-140, 34], [-90, 36], [-62, 34]];
      return Rc(0, 120, 240, 40, "#d7dce0") + shadow(120, 142, 46, 5) + ds(G(L.map(function (a, k) { return leaf(120, 96, a[0], a[1], ["#4f9d4a", "#3f8a3b", "#5bb055", "#468f41"][k % 4]); }).join("") + P("M84 100h72l-9 40h-54z", "#c4643a") + Rc(80, 94, 80, 10, "#d77749", 3) + Rc(86, 104, 10, 34, "#fff", 0, null, ' opacity=".12"'), DS)); },
    fence: function () { return ground(132) + rep(4, function (i) { return tube("M" + (34 + i * 58) + " 28V134", 7, "gi"); }) + rep(5, function (i) { return P("M20 " + (42 + i * 18) + "H222", null, "#6c7680", 1.6) + rep(10, function (j) { return P("M" + (30 + j * 20) + " " + (38 + i * 18) + "l5 8M" + (35 + j * 20) + " " + (38 + i * 18) + "l-5 8", null, "#4a5560", 1.4); }); }); },
    sign: function () { return ground(140) + tube("M120 70V142", 7, "gi") + ds(G(P("M120 14l54 54-54 54-54-54z", "#f2b51b") + P("M120 22l46 46-46 46-46-46z", null, "#1d1d1d", 3) + P("M106 52h28M120 52v34", null, "#1d1d1d", 6), DS)); },
    earth: function () { return Rc(0, 64, 240, 96, u("soil"), 0, null, ' filter="' + u("tx") + '"') + Rc(0, 0, 240, 64, "#eef2f5") + tube("M120 30V150", 10, "cu") + ds(G(Rc(100, 22, 40, 14, u("gi"), 3) + tube("M140 28h44v26", 4, "gi"), DS)) + Rc(96, 56, 48, 12, "#9aa1a8", 2); },
    pump: function () { return ground(122) + shadow(120, 124, 90, 6) + ds(G(cylH(40, 132, 92, 24, "pv") + Rc(40, 68, 92, 48, "#2f6fa8", 10, null, ' opacity=".85"') + rep(6, function (i) { return P("M" + (52 + i * 13) + " 70v44", null, "#1f4f7a", 2); }) + C(164, 92, 30, u("gi")) + C(164, 92, 12, "#2a2e32") + tube("M164 62V28h52", 14, "gi") + Rc(32, 116, 170, 8, "#5a646d", 2), DS)); },
    ac: function () { return Rc(0, 0, 240, 160, u("wall")) + ds(G(Rc(26, 38, 188, 64, "#fbfcfd", 14) + Rc(26, 84, 188, 18, "#eef1f4", 0) + rep(6, function (i) { return P("M44 " + (88 + (i % 2) * 6) + "h152", null, "#c7ced5", 1.4); }) + C(196, 52, 3, "#2ecc71"), DS)) + P("M64 112c12 10 24-6 36 4M124 112c12 10 24-6 36 4", null, "#8cc6ee", 2.5); },
    gen: function () { return ground(126) + shadow(120, 128, 96, 6) + ds(G(Rc(28, 52, 184, 72, "#f2b51b", 8) + rep(8, function (i) { return Rc(42 + i * 11, 66, 5, 40, "#2d3436", 2); }) + Rc(138, 64, 60, 32, "#fff", 4) + Rc(144, 70, 48, 8, "#2ecc71", 2) + tube("M60 52V30h20", 8, "bk"), DS)); },
    lift: function () { return Rc(0, 0, 240, 160, u("wall")) + ds(G(Rc(56, 16, 128, 130, "#9aa3ab", 4) + Rc(64, 30, 54, 116, u("giH")) + Rc(122, 30, 54, 116, u("giH")) + Rc(108, 20, 24, 8, "#1d1f21", 2) + P("M114 24l6-3 6 3", null, "#e74c3c", 1.5), DS)); },
    fire: function () { return Rc(0, 0, 240, 160, u("wall")) + shadow(120, 146, 34, 5) + ds(G(Rc(94, 40, 52, 104, "#c0392b", 16) + Rc(96, 44, 14, 96, "#e8594b", 7, null, ' opacity=".7"') + Rc(106, 22, 28, 20, "#2d3436", 4) + tube("M134 30h28l12 16", 6, "bk") + Rc(102, 74, 36, 34, "#fff", 4), DS)); },
    solar: function () { var o = P("M24 112l40-76h156l-40 76z", "#1f3f66"); for (var i = 1; i < 6; i++) o += P("M" + (64 + i * 26) + " 36L" + (24 + i * 26) + " 112", null, "#7fb0e0", 1); o += P("M44 74h156", null, "#7fb0e0", 1); return ground(140) + ds(G(o + P("M64 36h156l-20 38H44z", "#fff", null, null, ' opacity=".12"'), DS)) + tube("M124 112v30", 6, "gi"); },
    culvert: function () { return Rc(0, 54, 240, 106, u("soil"), 0, null, ' filter="' + u("tx") + '"') + Rc(0, 0, 240, 54, "#eef2f5") + ds(G(C(120, 106, 38, u("conc")) + C(120, 106, 28, "#3d4349"), DS)) + Rc(0, 50, 240, 6, "#7da454"); },
    drain: function () { return Rc(0, 0, 240, 160, "#c9cdd1", 0, null, ' filter="' + u("tx") + '"') + ds(G(P("M30 36v94h180V36h-22v72H52V36z", u("conc")) + Rc(52, 96, 136, 12, "#5b8fb8", 0, null, ' opacity=".8"') + rep(8, function (i) { return Rc(32 + i * 22, 28, 18, 6, u("ci"), 1); }), DS + ' filter="' + u("tx") + '"')); },
    hinge: function () { return Rc(0, 0, 240, 160, "#eef1f3") + shadow(120, 140, 70, 6) + ds(G(Rc(56, 24, 58, 108, u("crH"), 4) + Rc(126, 24, 58, 108, u("crH"), 4) + Rc(112, 22, 16, 112, u("cr"), 7) + rep(3, function (i) { return C(84, 46 + i * 32, 6, u("cr")) + C(84, 46 + i * 32, 6, null, "#6f7880") + P("M80 " + (46 + i * 32) + "h8", null, "#4d555c", 1.5) + C(156, 46 + i * 32, 6, u("cr")) + C(156, 46 + i * 32, 6, null, "#6f7880") + P("M152 " + (46 + i * 32) + "h8", null, "#4d555c", 1.5); }) + rep(4, function (i) { return P("M112 " + (48 + i * 22) + "h16", null, "#6f7880", 1.2); }), DS)); },
    pile: function () { return Rc(0, 70, 240, 90, u("soil"), 0, null, ' filter="' + u("tx") + '"') + Rc(0, 0, 240, 70, "#eef2f5") + Rc(0, 66, 240, 6, "#7da454") + ds(G(Rc(30, 46, 180, 26, u("conc"), 3, null, ' filter="' + u("tx") + '"') + [70, 120, 170].map(function (x) { return Rc(x - 11, 72, 22, 82, u("concS"), 2) + Rc(x - 11, 72, 7, 82, "#fff", 0, null, ' opacity=".18"'); }).join(""), DS)) + rep(3, function (i) { return P("M" + (64 + i * 50) + " 46V28h12V46", null, "#7b5a3c", 3); }); },
    pole: function () { return Rc(0, 0, 240, 160, "#e8f1f8") + ground(140) + tube("M120 18V142", 9, "gi") + ds(G(Rc(64, 34, 112, 8, u("ms"), 2) + [74, 120, 166].map(function (x) { return Rc(x - 6, 18, 12, 16, "#f4f1ea", 5) + rep(3, function (k) { return Rc(x - 8, 20 + k * 5, 16, 3, "#ffffff", 1.5, "#cfc8bb"); }); }).join(""), DS)) + P("M0 22C40 30 50 30 74 24S110 30 120 22s40 8 46 2 40 6 74-2", null, "#333", 1.4); },
    geo: function () { var o = ""; for (var i = 0; i < 9; i++) o += P("M" + (30 + i * 20) + " 40l-22 92", null, "#2f6b4f", 4) ; for (var j = 0; j < 5; j++) o += P("M" + (30 - j * 4.6) + " " + (40 + j * 22) + "h170", null, "#2f6b4f", 4); return Rc(0, 100, 240, 60, u("soil"), 0, null, ' filter="' + u("tx") + '"') + Rc(0, 0, 240, 100, "#eef2f5") + ds(G(o + cylH(176, 226, 52, 22, "bk").replace(/#/g, "#"), DS)); },
    flower: function () { var f = function (x, y, c) { return rep(5, function (k) { var a = k * 72 * Math.PI / 180; return C(x + Math.cos(a) * 7, y + Math.sin(a) * 7, 6.5, c); }) + C(x, y, 4.5, "#f5c518"); }; return Rc(0, 120, 240, 40, "#d7dce0") + shadow(120, 140, 44, 5) + ds(G(P("M84 100h72l-9 40h-54z", "#c4643a") + Rc(80, 94, 80, 10, "#d77749", 3) + P("M120 98V60M120 80l-22-24M120 76l24-26M120 90l-34-12M120 88l36-10", null, "#3d7a3a", 2.5) + P("M96 92c-8-12 0-20 10-16M144 92c8-12 0-20-10-16", "#4f9d4a") + f(120, 52, "#e94e77") + f(96, 52, "#f08aa8") + f(146, 46, "#e94e77") + f(84, 76, "#f08aa8") + f(158, 74, "#e94e77"), DS)); },
    test: function () { return Rc(0, 0, 240, 160, "#eef2f5") + Rc(0, 118, 240, 42, "#cfd5da") + shadow(120, 124, 96, 6) + ds(G(box(36, 72, 50, 46, 16, 12, "#d9dcdf", u("conc"), "#9aa1a8", ' filter="' + u("tx") + '"') + Rc(110, 40, 46, 78, "#2f6fa8", 4) + Rc(116, 48, 34, 20, "#cfe8fb", 2) + P("M120 58h8l4-6 4 10 4-6h6", null, "#1d5a8a", 1.5) + C(124, 84, 5, "#e74c3c") + C(142, 84, 5, "#2ecc71") + Rc(170, 30, 40, 88, "#fff", 6) + rep(5, function (i) { return P("M178 " + (44 + i * 14) + "h24", null, "#9aa5b1", 3); }), DS)); },
    tray: function () { return shadow(120, 128, 100, 6) + ds(G(P("M24 70l40-26h156l-40 26z", "#c9d0d6") + Rc(24, 70, 156, 40, u("gi")) + P("M180 70l40-26v40l-40 26z", "#8a949d") + rep(12, function (i) { return E(36 + i * 12, 90, 3.5, 6, "#5a646d"); }) + rep(3, function (i) { return tube("M" + (60 + i * 26) + " 62c40-10 80-10 120-22", 7, ["bk", "bk", "cu"][i]); }), DS)); },
    trafo: function () { return ground(132) + shadow(120, 134, 86, 6) + ds(G(Rc(64, 56, 112, 76, u("msH"), 4) + rep(7, function (i) { return Rc(44, 62 + i * 9, 20, 5, u("ms"), 2) + Rc(176, 62 + i * 9, 20, 5, u("ms"), 2); }) + Rc(84, 36, 72, 20, u("ms"), 4) + [96, 120, 144].map(function (x) { return rep(4, function (k) { return Rc(x - 7, 14 + k * 6, 14, 4, "#8a6a4a", 2); }) + Rc(x - 2, 10, 4, 6, u("cu")); }).join("") + Rc(110, 96, 20, 14, "#f2b51b", 2), DS)); },
    misc: function () { return Rc(0, 0, 240, 160, "#e9eef2") + shadow(120, 146, 50, 5) + ds(G(Rc(70, 22, 100, 120, "#fff", 8) + Rc(96, 14, 48, 18, u("gi"), 4) + rep(4, function (i) { return P("M86 " + (54 + i * 20) + "l6 6 10-12", null, "#19a974", 3) + P("M112 " + (54 + i * 20) + "h42", null, "#9aa5b1", 3); }), DS)); }
  };
  var RULES = [
    [/^.{0,30}(carriage|transportation|by mechanical transport|by manual)/i, "truck", "Carriage", 3],
    [/^.{0,25}(dismantl|demolish|demolition|breaking (of|up|down|open)|taking out|removing|removal of|chipping|scraping|felling|cutting of trees|uprooting)/i, "demo", "Dismantling", 3],
    [/^.{0,40}\b(plaster|pointing|punning|rendering)/i, "plaster", "Plaster", 3],
    [/^.{0,60}\b(paint|painting|distemper|primer|texture finish)\b/i, "paint", "Painting", 3],
    [/^.{0,20}(painting|repainting|distemper|white ?washing|colour ?washing|wall painting|polishing|varnishing|applying priming)/i, "paint", "Painting", 3],
    [/\bpiles?\b|piling|pile cap|sinking (of )?wells?|well foundation|well curb|well steining|well cap/i, "pile", "Piling / well foundation", 2],
    [/drainage composite|geogrid|geotextile|geo.?cell|geo.?membrane|geosynthetic|coir mat|jute mat/i, "geo", "Geosynthetics"],
    [/transformer|sub.?station|\bkva\b.*(oil|dry)/i, "trafo", "Transformer", 2],
    [/miniature circuit|moulded case|\bmcbs?\b|\bmccbs?\b|\brcbos?\b|\brccbs?\b|\belcbs?\b|\bacb\b|air circuit breaker|\bdb\b|distribution board|disconnector|fuse switch|switch fuse/i, "board", "Switch / board", 2],
    [/lightning arrestor|lighting arrestor|(rcc|pcc)\/? ?(pcc )?poles?|insulator|overhead line|tubular pole|swaged|(pcc|rcc|steel|street light|lighting|spun) poles?|\bpoles\b|poles? (for|of)|cross arm|lightning arrestor|lightening arrestor|horn gap|stay wire|\bht\b line|\blt\b line|guarding/i, "pole", "Electric pole / line"],
    [/flower|blooming|in full bloom|rose|lilly|lily|marigold|petunia|salvia|seasonal/i, "flower", "Flowering plant"],
    [/^.{0,40}(load testing|testing of (cubes?|soil|samples?|materials?|piles?)|\btest\b|laboratory equipment|le.?chatelier|cube mould|testing machine|sieve|apparatus|survey|photograph|presentation|walk ?through|soft copies|preparation of|security guard|watch & ward|designing|design of|design and drawing|consultancy|detailed project|weighing balance|investigation)/i, "test", "Testing / survey"],
    [/^.{0,40}(floor joint|roof joint|expansion joint|construction joint|contraction joint|joints? sealant|sealant|filler board)/i, "plaster", "Mortar / joints"],
    [/^.{0,60}(treads?|steps? |riser)/i, "floor", "Flooring"],
    [/hinge|tower bolt|door bolt|\block\b|latch|handle|casement stay|\bstay\b|door closer|fastener|hasp|staple|aldrop|chain (and|&) (rubber )?plug|friction (hinge|stay)|drawer channels?|telescopic|towel|soap|grab bar|toilet paper|coat hook|\blocks?\b|hooks and eyes|door catcher|catcher|door stopper|stopper|cup ?board knob|\bknob/i, "hinge", "Hardware"],
    [/\bdoor|shutters?\b|flush door|chowkhat|panelling|panelled/i, "door", "Door"],
    [/window|ventilator|louver|louvre|fly ?proof|wire gau[gz]e/i, "window", "Window"],
    [/false ceiling|gypsum|ceiling tile|grid ceiling|acoustic|insulating board|ceiling/i, "ceiling", "False ceiling"],
    [/anti.?termite|termite|pest control|chemical emulsion/i, "termite", "Anti-termite", 2],
    [/water ?proof|bitumen felt|bitumastic|membrane|app modified|polymeric membrane|damp ?proof|dpc|tar felt|coal tar|bituminous water/i, "wproof", "Waterproofing"],
    [/squatting|\b(water )?closet|w\.?c\.? pan|european type|orissa pan|indian type.*pan|flushing cistern|cistern/i, "wc", "WC"],
    [/urinal/i, "urinal", "Urinal"],
    [/wash ?basin|kitchen sink|\bsink\b|lavatory basin|basin/i, "basin", "Wash basin"],
    [/shower/i, "shower", "Shower"],
    [/\btraps?\b|gully|nahani|floor trap|waste coupling/i, "trap", "Trap"],
    [/\bbend\b|elbow|\boff ?sets?\b|swan neck|\bshoe\b|\bheel rest/i, "bend", "Bend"],
    [/junction|\btee\b|\by.?branch|invert branch|branch|door piece|terminal guard|specials|press fit|stainless steel fitting|strainer|cross piece|\bsocket\b.*pipe|collar|coupler|reducer|\bunion\b/i, "tee", "Junction / tee"],
    [/holder.?bat|clamp|saddle|bracket|hanger/i, "clamp", "Clamp"],
    [/stop cock|bib cock|pillar cock|angle valve|\bcock\b|\btap\b(?! off)|faucet|mixer|brass ferrule|ferrules? (for|with) .*(water|main)|\bnozzle/i, "tap", "Tap / cock"],
    [/valves?\b|sluice|gate valve|non.?return|butterfly valve|float valve/i, "valve", "Valve", 2],
    [/water storage tank|storage tank|water tank|overhead tank|\btanks?\b(?! pipe)(?! nipple)|\bsump\b/i, "tank", "Tank"],
    [/manhole|inspection chamber|masonry chamber|valve chamber|chamber for|manhole cover|\bcover\b.*frame/i, "manhole", "Manhole / chamber", 2],
    [/culvert|hume pipe|np[234]|rcc pipe|box drain/i, "culvert", "Culvert", 2],
    [/\bdrains?\b|drainage|drain channel|channel drain|u.?channel|sewer|nallah|nala|gutter|catch ?water/i, "drain", "Drain"],
    [/jointing and testing|push.?on.?joints?|disinfecting|cutting c\.?i\.? pipe|double wall corrugated|\bdwc\b|stoneware|s\.?w\.? pipes?|pipe|piping|soil.*vent|\bci\b.*pipe|\bhdpe\b|cpvc|\bppr\b|rain water/i, "pipe", "Pipe"],
    [/tube ?well|bore ?well|open well|dug well|hand ?pump|^.{0,20}boring/i, "well", "Well / boring"],
    [/\bpumps?\b|pumping set|monoblock|submersible pump|electric motor|motor (pump|set)/i, "pump", "Pump"],
    [/air.?condition|split (type )?a\.?c|window type a\.?c|split unit|chiller|\bahu\b|air handling|cooling tower|ducting|\bvrf\b|\bvrv\b/i, "ac", "Air conditioning", 2],
    [/generat|\bdg set\b|diesel generating/i, "gen", "Generator", 2],
    [/passenger lift|goods lift|lift car|lift machine|\blifts? (of|for) .*(passenger|persons)|elevator|escalator/i, "lift", "Lift", 2],
    [/fire(?! ?(retardant|resistant|rated|survival|proof|check|brick|clay))|extinguish|sprinkler|hydrant|smoke detect|heat detect|detector|strobe|hooter|manual call point|fire alarm/i, "fire", "Fire safety", 2],
    [/solar|photo ?voltaic|\bpv\b/i, "solar", "Solar", 2],
    [/earthing|earth electrode|lightning|conductor.*earth/i, "earth", "Earthing"],
    [/ceiling fan|exhaust fan|\bfan\b/i, "fan", "Fan"],
    [/luminaire|light fitting|\bled\b|lamp|tube light|batten|street light|flood light|bulb|lighting/i, "light", "Light"],
    [/switch ?board|distribution board|\bmcb\b|\bmccb\b|\belcb\b|\brccb\b|\brcbos?\b|modular (base|plate|box)|cover plate|metal box|\bacb\b|circuit breaker|fuse|contactor|relay|capacitor|transformer|\bct\b|switch|socket|\bdb\b|(lt|ht|control|electrical|main|pcc|mcc|apfc|metering) panel|panel board|isolator|changeover|contractor 2 pole|meter|enclosures?\b|terminal box/i, "board", "Switch / board"],
    [/straight through joint|cable joint|end termination|cable|\bxlpe\b|armoured|conductor|\blugs?\b|cable gland/i, "cable", "Cable"],
    [/wiring|conduit|\bpoint\b|casing|capping|\bwire\b(?! ?gau[gz]e)(?! mesh)/i, "wiring", "Wiring"],
    [/bituminous|premix|asphalt|tack coat|prime coat|seal coat|\bwmm\b|wet mix macadam|\bgsb\b|granular sub|surface dressing|macadam|stabili[sz]ation|treated soil|treated crushed|sub.?grade|\bdbm\b|\bbc\b|road|pavement/i, "road", "Road layers"],
    [/kerb|paver|interlocking|hydraulically pressed|mechanically vibrated|cement concrete blocks? for|tiles? for footpath/i, "paver", "Paver / kerb"],
    [/perforated|cable tray|ladder type|cable trench cover/i, "tray", "Cable tray"],
    [/kilo ?metre stone|boundary stone|hectometre|road marking|sign ?board|signage|traffic sign|delineator|\bstud/i, "sign", "Sign / marking"],
    [/gabion|fencing|barbed|chain link|wire mesh fence|\bfence/i, "fence", "Fencing"],
    [/displaying|stacking of|foliage|bloom|\bpalm\b|ficus|empty pots|filling of .*(pots|bags)|poly ?bags?|polythene bags|suckers|seedlings?|creeper|climber|seasonal|annuals|cactus|bonsai|topiary|\bbel\b|planting|plantation|tree guard|tree shifting|maintenance of .*(garden|lawn)|shrub|\bgrass|lawn|hedge|sapling|manure|garden|horticult|turf|mulch/i, "plant", "Plants / garden"],
    [/glass(?! ?fib(re|er))(?! ?reinforced)|glazing|mirror/i, "glass", "Glass"],
    [/crash barrier|railing|grill|grille|\bgates?\b|steel work|structural steel|channel iron|truss|\bms\b.*(angle|tube|section)|hand ?rail|ladder|staircase.*steel/i, "rail", "Steel work / railing"],
    [/ridges and hips|roofing|corrugated(?! pipe)(?! ?\(?dwc)|mangalore|ridge tile|clay tile|roof tile|\bsheet\b.*roof|roof.*sheet|\bgc sheet|\bac sheet|profile sheet|polycarbonate/i, "sheet", "Roofing sheet"],
    [/reinforcement|steel bar|\btmt\b|\btor\b|\bhysd\b|rebar|bar bending|mild steel round/i, "steel", "Reinforcement"],
    [/centering|shuttering|formwork|staging/i, "shutter", "Shuttering"],
    [/vitrified|ceramic|floor tile|flooring|\btiles?\b.*floor|terrazzo|ips\b|chequered|kota|marble chips|skirting/i, "floor", "Flooring"],
    [/dado|wall tile|glazed tile|cladding|wall lining|\bacp\b|wall panel|sandwich (wall|panel)/i, "walltile", "Wall tiles / cladding"],
    [/gang saw|machine cut|marble|granite|stone slab|sand stone|sandstone|slate/i, "slab", "Stone slab"],
    [/tile brick|brick|block masonry|\baac\b|fly ash|honey ?comb/i, "brick", "Brickwork"],
    [/stone masonry|rubble|ashlar|random rubble|boulder|pitching|stone(?!ware)(?! dust)(?! chips)(?! aggregate)/i, "stone", "Stone masonry"],
    [/plaster|pointing|rendering|punning|cement mortar.*finish|neeru/i, "plaster", "Plaster"],
    [/mortar|\bband\b|sealant|joint filler|expansion joint/i, "plaster", "Mortar / joints"],
    [/paint|distemper|primer|polish|varnish|white ?wash|colour ?wash|enamel|emulsion|texture|coat of/i, "paint", "Painting"],
    [/timber|wood|plywood|particle board|block board|teak|sal\b|laminat|veneer/i, "wood", "Wood work"],
    [/concrete|\bpcc\b|\brcc\b|cement concrete|\bm-?\d{2}\b|\bmix\b.*\d ?: ?\d|precast|grout|screed/i, "concrete", "Concrete"],
    [/compact(ing|ion|ed)|consolidat|\bfilling\b|ramming|rolling (with|by)|road roller|embankment|sand filling|back ?fill/i, "roller", "Filling / compaction"],
    [/excavat|earth ?work|trench|digging|cutting (in|of) (earth|soil|rock|road|hill)|surface dressing of ground|clearing|jungle|site clear|grubbing|levelling/i, "dig", "Earthwork"]
  ];
  var UNIT = { cum: "concrete", sqm: "floor", metre: "pipe", m: "pipe", rm: "pipe", each: "misc", no: "misc", kg: "steel", quintal: "steel", point: "wiring" };
  /* the exact product inside a kind: Indian / European WC, pillar / bib / stop cock, tube / street / flood light … */
  var VAR = {
    wc: [[/european|pedestal|wash ?down|\bewc\b|wall hung|seat (and|with) lid|seat cover|dual purpose/i, "wc", "European WC"], [/orissa|indian|squatting|foot ?rests?|\bpan\b/i, "wcin", "Indian WC (squatting pan)"]],
    basin: [[/kitchen sink|\bsink\b|stainless steel sink/i, "sink", "Kitchen sink"]],
    tap: [[/pillar/i, "pillar", "Pillar cock"], [/stop cock|stop valve|concealed/i, "stopcock", "Stop cock"], [/angle valve|angle cock/i, "anglev", "Angle valve"], [/mixer|diverter|single lever/i, "mixer", "Mixer"]],
    valve: [[/ball valve|ball cock/i, "ballv", "Ball valve"], [/non.?return|reflux|\bnrv\b|check valve|foot valve/i, "nrv", "Non-return valve"], [/float/i, "floatv", "Float valve"], [/sluice|gate valve|butterfly/i, "valve", "Gate / sluice valve"]],
    trap: [[/gully/i, "gully", "Gully trap"], [/nahani|floor trap|grating|self cleansing/i, "ftrap", "Floor trap"]],
    light: [[/street ?light|post top|pole top/i, "street", "Street light"], [/flood ?light|high mast/i, "flood", "Flood light"], [/tube ?light|batten|fluorescent|t5\b|t8\b/i, "tube", "Tube light / batten"], [/panel|troffer|recessed|down ?light|ceiling light/i, "panel", "LED panel"]],
    fan: [[/exhaust/i, "exfan", "Exhaust fan"]],
    board: [[/distribution board|\bdb\b|\bmcb\b|\bmccb\b|\bacb\b|\brcbo|\brccb|\belcb|circuit breaker|isolator|changeover|panel|feeder pillar/i, "dboard", "Distribution board / MCB"]],
    door: [[/rolling shutter|roller shutter|collapsible/i, "rshutter", "Rolling shutter"], [/aluminium|glazed|glass/i, "gdoor", "Glazed door"]],
    sheet: [[/mangalore|clay tile|roof tile|ridge tile/i, "tileroof", "Roof tiles"], [/polycarbonate|fibre ?glass|frp|translucent/i, "polyroof", "Polycarbonate sheet"]],
    manhole: [[/r\.?c\.?c\.?|sfrc|precast|frp/i, "rcccover", "RCC / SFRC manhole cover"]],
    rail: [[/structural steel|truss|joist|\bismb\b|channel|girder|beam|stanchion|purlin/i, "beam", "Structural steel"]],
    pipe: [[/dwc|double wall corrugated/i, "dwc", "DWC HDPE pipe"]]
  };
  var PIPEISH = { pipe: 1, bend: 1, tee: 1, trap: 1 };
  function material(d) {
    if (/\bcpvc\b|chlorinated/i.test(d)) return ["cp", "CPVC"];
    if (/pp-?r\b|polypropylene random/i.test(d)) return ["pp", "PPR"];
    if (/hdpe|mdpe|polyethylene|pe-al-pe|polyethelene/i.test(d)) return ["bk", "HDPE"];
    if (/u\.?pvc|\bpvc\b|swr|rigid pvc|plastic/i.test(d)) return ["wh", "PVC"];
    if (/stainless|\bss\b/i.test(d)) return ["cr", "Stainless steel"];
    if (/copper/i.test(d)) return ["cu", "Copper"];
    if (/\bg\.?i\.?\b|galvani[sz]ed/i.test(d)) return ["gi", "GI"];
    return ["ci", ""];
  }
  var cache = {};
  function clean(d) { return d.replace(/^\s*((providing|supplying|supply|and|fixing|laying|installing|installation|testing|commissioning|erection|erecting|fitting|making|placing|in position|of|the|following|required|approved|&|,|\/)\s*)+/i, ""); }
  /* pick the kind: verb-first actions (dismantling, painting …) win, then strong products (WC, manhole …), then the product word that comes first */
  function pick(text) {
    var best = null;
    for (var i = 0; i < RULES.length; i++) {
      var r = RULES[i], m = r[0].exec(text); if (!m) continue;
      var at = m[1] != null && /^\^/.test(r[0].source) ? m.index + m[0].length - m[1].length : m.index, pr = r[3] || 1;
      if (!best || pr > best.pr || (pr === best.pr && at < best.at)) best = { r: r, pr: pr, at: at };
    }
    if (best && best.r[1] === "wc" && /urinal/i.test(text)) for (i = 0; i < RULES.length; i++) if (RULES[i][1] === "urinal") return RULES[i];
    if (best && best.r[1] === "manhole" && /gully|\btrap\b/i.test(text)) for (i = 0; i < RULES.length; i++) if (RULES[i][1] === "trap") return RULES[i];
    return best && best.r;
  }
  EP.itemPic = function (desc, unit) {
    var key = cache[desc]; if (!key) {
      var d = String(desc || ""), head = clean(d.split(/ — | - |:/)[0]).slice(0, 170), hit = pick(head) || pick(d);
      if (hit) {
        var k = hit[1], lab = hit[2], v = VAR[k];
        if (v) for (var i = 0; i < v.length; i++) if (v[i][0].test(head)) { k = v[i][1]; lab = v[i][2]; break; }
        if (v && k === hit[1]) for (i = 0; i < v.length; i++) if (v[i][0].test(d.slice(0, 260))) { k = v[i][1]; lab = v[i][2]; break; }
        var mat = PIPEISH[k] ? material(d) : null;
        key = k + "|" + (mat && mat[1] ? mat[1] + " " + lab.toLowerCase() : lab) + "|" + (mat ? mat[0] : "");
      } else key = (UNIT[String(unit || "").toLowerCase().replace(/[^a-z]/g, "")] || "misc") + "|Work item|";
      cache[desc] = key;
    }
    var p = key.split("|"); return { key: p[0], label: p[1], svg: s(function () { return D[p[0]](p[2] || undefined); }) };
  };
  EP.itemPicKinds = function () { return RULES.map(function (r) { return [r[1], r[2]]; }); };
  EP.itemPicSvg = function (k, m) { return D[k] ? s(function () { return D[k](m); }) : ""; };
  EP.itemPicAll = function () { return Object.keys(D); };
})();
