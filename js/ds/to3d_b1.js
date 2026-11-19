/* Estimate Pro — Design Studio → 3D builders, batch 1: drains, culverts, retaining / gravity walls, pavements (see js/ds/to3d.js, js/bim/dsmodel.js).
   Sized values (wall / slab thickness, B, toe, heel …) are read from the module result summary when present (they follow the mode: design / check / thumb / free),
   otherwise from the inputs. Units: Design Studio inputs are mostly metres → converted to mm here. Ground = z 0, structures sit on / above it, x = along the main length. */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {}, T = DS.to3d = DS.to3d || { builders: {} }; if (!T.reg) return;
  var LKS = (typeof EP !== "undefined" && EP.bim && EP.bim.LOOKS) || null;
  if (LKS && !LKS.earth_ghost) LKS.earth_ghost = { n: "Earth (see-through)", c: "#8c7356", p: (EP.bim.PT || {}).soil || 15, g: 0.02, a: 0.3 };
  var GHOST = LKS ? "earth_ghost" : "earth";

  /* ---------- small helpers ---------- */
  function N(x, d) { x = +x; return isFinite(x) ? x : d; }
  function mmOf(v, k, d) { return N(v[k], d / 1000) * 1000; }                       // input in m → mm
  function pos(x, d, lo) { x = N(x, d); return x > (lo || 0) ? x : d; }
  function sg(res, k) { return res && res.summary && res.summary[k] != null ? String(res.summary[k]) : ""; }
  function rx(s, re) { return re.exec(s || ""); }
  function reg(id, fn) { T.reg(id, function (v, res, H) { try { return fn(v || {}, res || {}, H); } catch (e) { if (typeof console !== "undefined") console.error("to3d " + id, e); return null; } }); }
  function bx(x0, y0, x1, y1, z0, z1, look) { if (!(Math.abs(x1 - x0) > 0 && Math.abs(y1 - y0) > 0 && z1 > z0)) return null; return ["b", (x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), z0, z1, look || "concrete", 0]; }
  /* sweep a y–z profile along x: fn(z) → list of [ya, yb] intervals at height z; stacked as thin slices (dz) so sloped / tapered faces look right */
  function sweepX(fn, z0, z1, dz, x0, x1, look) {
    var out = []; if (!(z1 > z0) || !(x1 > x0)) return out;
    var n = Math.min(120, Math.max(1, Math.ceil((z1 - z0) / dz)));
    for (var k = 0; k < n; k++) { var za = z0 + (z1 - z0) * k / n, zb = z0 + (z1 - z0) * (k + 1) / n, ints = fn((za + zb) / 2) || []; ints.forEach(function (iv) { var p = bx(x0, iv[0], x1, iv[1], za, zb, look); if (p) out.push(p); }); }
    return out;
  }
  /* horizontal pipe along x (staves) */
  function hpipe(x0, x1, yc, zc, rO, rI, look, nS) {
    nS = nS || 20; var rm = (rO + rI) / 2, t = rO - rI, w = 2 * rm * Math.tan(Math.PI / nS) * 1.03, out = [];
    for (var i = 0; i < nS; i++) { var th = 2 * Math.PI * i / nS, y = yc + rm * Math.cos(th), z = zc + rm * Math.sin(th); out.push(["m", [x0, y, z], [x1, y, z], w, t, look || "concrete", 90 - th * 180 / Math.PI]); }
    return out;
  }
  function add(list, p) { if (p) list.push(p); return list; }
  function addAll(list, arr) { arr.forEach(function (p) { if (p) list.push(p); }); return list; }
  /* rectangle in a rotated wall frame: origin (ox,oy), direction ang (deg); s along, t across (t sign = normal side) */
  function framePoly(ox, oy, ang, s0, s1, t0, t1, nsg) {
    var a = ang * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a), nx = -dy * nsg, ny = dx * nsg;
    return [[s0, t0], [s1, t0], [s1, t1], [s0, t1]].map(function (q) { return [ox + q[0] * dx + q[1] * nx, oy + q[0] * dy + q[1] * ny]; });
  }
  function prismP(poly, z0, z1, look) { return z1 > z0 ? ["p", poly, z0, z1, look || "concrete", null] : null; }

  /* ============ RCC open drain (U-section) ============ */
  reg("rcc_drain", function (v, res) {
    var W = mmOf(v, "width", 1000), D = mmOf(v, "depth", 1200), tw = mmOf(v, "t_wall", 200), tb = mmOf(v, "t_base", 225);
    var m = rx(sg(res, "Section"), /(\d+(?:\.\d+)?)\s*×\s*(\d+(?:\.\d+)?)\s*clear,\s*walls\s*(\d+),?\s*base\s*(\d+)/); if (m) { W = +m[1]; D = +m[2]; tw = +m[3]; tb = +m[4]; }
    W = pos(W, 1000, 50); D = pos(D, 1200, 50); tw = pos(tw, 200, 20); tb = pos(tb, 225, 20);
    var Lfull = mmOf(v, "length", 100000), L = Math.max(1000, Math.min(Lfull, 20000)), hy = W / 2 + tw, P = [];
    add(P, bx(0, -hy - 100, L, hy + 100, 0, 100, "ips"));
    add(P, bx(0, -hy, L, hy, 100, 100 + tb, "concrete"));
    add(P, bx(0, -hy, L, -W / 2, 100 + tb, 100 + tb + D, "concrete")); add(P, bx(0, W / 2, L, hy, 100 + tb, 100 + tb + D, "concrete"));
    var covered = v.covered === true || v.covered === "true"; if (covered) add(P, bx(0, -hy, L, hy, 100 + tb + D, 100 + tb + D + 150, "concrete"));
    return { name: "RCC drain " + (W / 1000).toFixed(2) + " × " + (D / 1000).toFixed(2) + " m" + (Lfull > L ? " (" + (L / 1000) + " m of " + (Lfull / 1000) + " m shown)" : ""), parts: P };
  });

  /* ============ RCC box culvert (single cell) ============ */
  reg("box_culvert", function (v, res) {
    var S = mmOf(v, "span", 3000), Hc = mmOf(v, "height", 2500), tt = 300, tbm = 325, tw = 275, fill = mmOf(v, "fill", 600), L = mmOf(v, "road_width", 12000);
    var m = rx(sg(res, "Box"), /(\d+(?:\.\d+)?)\s*×\s*(\d+(?:\.\d+)?)\s*m clear,\s*top\s*(\d+),\s*bottom\s*(\d+),\s*walls\s*(\d+)/);
    if (m) { S = +m[1] * 1000; Hc = +m[2] * 1000; tt = +m[3]; tbm = +m[4]; tw = +m[5]; } else { tt = mmOf(v, "t_top", 350); tbm = mmOf(v, "t_bot", 375); tw = mmOf(v, "t_wall", 300); }
    S = pos(S, 3000, 100); Hc = pos(Hc, 2500, 100); tt = pos(tt, 300, 20); tbm = pos(tbm, 325, 20); tw = pos(tw, 275, 20); L = pos(L, 12000, 500); fill = Math.max(0, fill);
    var hw = S / 2 + tw, zb = 100 + tbm, zt = zb + Hc, zs = zt + tt, ztop = zs + fill, yo = hw + 2500, P = [];
    add(P, bx(0, -hw - 150, L, hw + 150, 0, 100, "ips"));
    add(P, bx(0, -hw, L, hw, 100, zb, "concrete"));
    add(P, bx(0, -hw, L, -S / 2, zb, zt, "concrete")); add(P, bx(0, S / 2, L, hw, zb, zt, "concrete"));
    add(P, bx(0, -hw, L, hw, zt, zs, "concrete"));
    if (fill > 0) add(P, bx(0, -hw, L, hw, zs, ztop, GHOST));
    addAll(P, sweepX(function (z) { var o = yo + 1.5 * (ztop - z); return [[-o, -hw], [hw, o]]; }, 100, ztop, 100, 0, L, GHOST));
    add(P, bx(0, -yo, L, yo, ztop, ztop + 80, "asphalt"));
    return { name: "RCC box culvert " + (S / 1000).toFixed(2) + " × " + (Hc / 1000).toFixed(2) + " m, " + (L / 1000).toFixed(1) + " m long (earth shown see-through)", parts: P };
  });

  /* ============ Hume (RCC) pipe culvert ============ */
  function pipeSet(n, Dn, tPipe, x0, x1, zBed, bedLook) {
    var Do = Dn + 2 * tPipe, pitch = Do + Math.max(500, Do / 2), P = [], span = (n - 1) * pitch + Do;
    add(P, bx(x0, -span / 2 - 150, x1, span / 2 + 150, 0, zBed, bedLook || "gravel"));
    for (var i = 0; i < n; i++) addAll(P, hpipe(x0, x1, (i - (n - 1) / 2) * pitch, zBed + Do / 2, Do / 2, Dn / 2, "concrete", 20));
    return { parts: P, Do: Do, span: span, zc: zBed + Do / 2, pitch: pitch };
  }
  reg("pipe_culvert", function (v, res) {
    var n = Math.max(1, Math.round(N(v.rows, 1))), Dn = N(v.dia, 1000), m = rx(sg(res, "Pipes"), /(\d+)\s*×\s*(\d+)\s*mm/); if (m) { n = +m[1]; Dn = +m[2]; }
    n = Math.max(1, Math.min(n, 6)); Dn = pos(Dn, 1000, 100);
    var tP = Math.round(Dn / 12), Do = Dn + 2 * tP, cush = mmOf(v, "cushion", 900), Wr = mmOf(v, "road_width", 12000), zBed = 150;
    var L = Wr + 2 * 1.5 * (cush + Do), mb = rx(sg(res, "Barrel length"), /([\d.]+)\s*m/); if (mb && +mb[1] > 1) L = +mb[1] * 1000;
    L = pos(L, Wr, 500); var bed = String(v.bedding || ""), set = pipeSet(n, Dn, tP, 0, L, zBed, /cradle/i.test(bed) ? "concrete" : "gravel"), P = set.parts.slice();
    var ztop = zBed + Do + cush, E = set.span / 2 + 2500, topW = Math.max(1000, Math.min(Wr, L - 200));
    addAll(P, H0().wedge([[0, zBed], [L, zBed], [(L + topW) / 2, ztop], [(L - topW) / 2, ztop]], -E, E, GHOST, 100));
    add(P, bx((L - topW) / 2, -E, (L + topW) / 2, E, ztop, ztop + 80, "asphalt"));
    return { name: n + " × " + Dn + " mm pipe culvert, " + (L / 1000).toFixed(1) + " m barrel (earth shown see-through)", parts: P };
  });
  function H0() { return T.H; }

  /* ============ culvert headwall and wing / return walls ============ */
  reg("culvert_headwall", function (v, res) {
    var isPipe = /pipe/i.test(String(v.culvert)), n = Math.max(1, Math.round(N(v.cells, 1))), S = mmOf(v, "span", 2000), oh = mmOf(v, "open_h", 2000), tb = mmOf(v, "t_box", 300), fill = mmOf(v, "fill", 1000), roadW = mmOf(v, "road_w", 10000);
    var slope = pos(v.slope, 2, 0), hEnd = mmOf(v, "h_end", 600), zbed = mmOf(v, "df", 1200), splay = N(v.splay, 45), layout = String(v.layout || ""), cons = String(v.construction || "");
    n = Math.min(n, 6); S = pos(S, 2000, 100); oh = pos(oh, 2000, 100); tb = pos(tb, 300, 20); zbed = pos(zbed, 1200, 100);
    var gravity = /gravity|masonry|PCC/i.test(cons), mode = /^Return/i.test(layout) ? "return" : /^Straight/i.test(layout) ? "straight" : "splay", ang = mode === "return" ? 0 : mode === "straight" ? 90 : Math.max(10, Math.min(80, splay));
    var P = [], L = Math.max(3000, roadW + 2 * slope * Math.max(0, fill)), Wb, zroad, zTopBox;
    /* barrel */
    if (isPipe) {
      var Dn = S, tP = Math.round(Dn / 12), Do = Dn + 2 * tP, zBedP = Math.max(150, zbed - Math.round(Do / 2) + Math.round(Dn / 2) - 0);
      zBedP = Math.max(150, zbed - tP); var set = pipeSet(n, Dn, tP, 0, L, zBedP, "gravel"); addAll(P, set.parts); Wb = set.span; zTopBox = zBedP + Do; zroad = zTopBox + fill;
      add(P, bx(0, -Wb / 2 - 800, L, Wb / 2 + 800, 0, 150, "soil"));
    } else {
      Wb = n * S + (n + 1) * tb; var z0 = zbed - tb, zs = zbed + oh, zt = zs + tb; zTopBox = zt; zroad = zt + fill;
      if (z0 > 0) add(P, bx(0, -Wb / 2, L, Wb / 2, 0, z0, "soil"));
      add(P, bx(0, -Wb / 2, L, Wb / 2, z0, zbed, "concrete"));
      for (var i = 0; i <= n; i++) { var yc = -Wb / 2 + i * (S + tb); add(P, bx(0, yc, L, yc + tb, zbed, zs, "concrete")); }
      add(P, bx(0, -Wb / 2, L, Wb / 2, zs, zt, "concrete"));
    }
    if (fill > 0) add(P, bx(0, -Wb / 2, L, Wb / 2, zTopBox, zroad, GHOST)); add(P, bx(0, -Wb / 2, L, Wb / 2, zroad, zroad + 80, "asphalt"));
    /* wing / return / end walls: sections from the designed table, else from the summary */
    var segs = [], tab = res.tables && res.tables["Wall sections (designed per segment)"], rows = tab && tab.rows ? tab.rows : null, wl = rx(sg(res, "Walls"), /length\s*([\d.]+)\s*m|end walls\s*([\d.]+)\s*m/), wingLen = wl ? +(wl[1] || wl[2]) * 1000 : 0;
    if (rows && rows.length) rows.forEach(function (r) { var s0 = N(r[1], 0) * 1000, s1 = N(r[2], 0) * 1000, Hh = N(r[3], 0) * 1000, B = N(r[4], 0) * 1000, st = N(r[5], 0) * 1000; if (s1 > s0 && Hh > 0 && B > 0) segs.push({ s0: s0, s1: s1, H: Hh, B: B, st: st > 0 ? st : 300 }); });
    if (!segs.length) { var Hm = zroad, Bm = Math.max(1200, 0.65 * Hm); if (!(wingLen > 0)) wingLen = Math.max(1000, (zroad - hEnd) * slope * 0.9); segs.push({ s0: 0, s1: wingLen, H: Hm, B: Bm, st: 300 }); }
    var mx = rx(sg(res, "Max. section"), /top\s*([\d.]+)/), topW = mx ? +mx[1] * 1000 : mmOf(v, "top_w", 500), tbase = 400;
    var mb2 = rx(sg(res, "Max. section"), /base\s*([\d.]+),\s*stem\s*([\d.]+)/); if (mb2) tbase = +mb2[1] * 1000;
    var stTop = rx(sg(res, "Max. section"), /stem\s*([\d.]+)\s*[–-]\s*([\d.]+)/); var stemTop = stTop ? +stTop[1] * 1000 : 200;
    [[0, -1], [L, 1]].forEach(function (end) {
      [-1, 1].forEach(function (side) {
        var ox = end[0], oy = side * Wb / 2, a = Math.atan2(side * Math.sin(ang * Math.PI / 180), end[1] * Math.cos(ang * Math.PI / 180)) * 180 / Math.PI;
        var nsg = side * end[1] > 0 ? 1 : -1; /* normal pointing away from the channel */
        var dir = [end[1] * Math.cos(ang * Math.PI / 180), side * Math.sin(ang * Math.PI / 180)], nrm = [-dir[1], dir[0]], outward = Math.sign(nrm[1] * side) || 1;
        segs.forEach(function (sgm) {
          var H = sgm.H, B = sgm.B;
          if (!gravity) {
            var toe = Math.min(B / 3, 1000), stb = Math.max(sgm.st, 150), stt = Math.min(stemTop, stb);
            add(P, prismP(framePoly(ox, oy, a, sgm.s0, sgm.s1, -toe * outward, (B - toe) * outward, 1), 0, Math.min(tbase, H / 2), "concrete"));
            for (var k = 0; k < 4; k++) { var za = tbase + (H - tbase) * k / 4, zb2 = tbase + (H - tbase) * (k + 1) / 4, tk = stb + (stt - stb) * (k + 0.5) / 4; add(P, prismP(framePoly(ox, oy, a, sgm.s0, sgm.s1, 0, tk * outward, 1), za, zb2, "concrete")); }
          } else {
            var look = /PCC/i.test(cons) ? "concrete" : "stone", tp = Math.min(topW, B);
            for (var k2 = 0; k2 < 6; k2++) { var za2 = H * k2 / 6, zb3 = H * (k2 + 1) / 6, tk2 = B - (B - tp) * (k2 + 0.5) / 6; add(P, prismP(framePoly(ox, oy, a, sgm.s0, sgm.s1, 0, tk2 * outward, 1), za2, zb3, look)); }
          }
        });
      });
    });
    /* boulder apron / floor protection */
    var ma = rx(sg(res, "Floor protection"), /boulder apron\s*([\d.]+)\s*\/\s*([\d.]+)\s*m/), a1 = ma ? +ma[1] * 1000 : 3000, a2 = ma ? +ma[2] * 1000 : 5000;
    if (!isPipe) { var wA = Wb + 2000; add(P, bx(-a1, -wA / 2, 0, wA / 2, Math.max(0, zbed - 300), zbed, "stone")); add(P, bx(L, -wA / 2, L + a2, wA / 2, Math.max(0, zbed - 300), zbed, "stone")); if (zbed - 300 > 0) { add(P, bx(-a1, -wA / 2, 0, wA / 2, 0, zbed - 300, "soil")); add(P, bx(L, -wA / 2, L + a2, wA / 2, 0, zbed - 300, "soil")); } }
    return { name: (isPipe ? n + " pipe(s) " + Dn0(S) : n + " cell box ") + "culvert with " + (mode === "splay" ? "splayed wing walls " + ang + "°" : mode === "return" ? "return walls" : "straight headwall + end walls") + ", " + (gravity ? "gravity" : "RCC cantilever"), parts: P };
  });
  function Dn0(S) { return Math.round(S) + " mm "; }

  /* ============ drain / cable-trench cover slab ============ */
  reg("drain_cover", function (v, res) {
    var span = mmOf(v, "span", 900), bear = mmOf(v, "bearing", 150), unitW = mmOf(v, "unit_w", 600), dd = mmOf(v, "drain_depth", 600), L = mmOf(v, "length", 50000), D = 150, precast = /^Precast/i.test(String(v.construction || "Precast"));
    var m = rx(sg(res, "Cover slab"), /(\d+)\s*mm thick(?:,\s*precast units\s*([\d.]+)\s*×\s*([\d.]+)\s*m)?/); if (m) { D = +m[1]; if (m[2]) { unitW = +m[3] * 1000; span = +m[2] * 1000 - 2 * bear; } precast = !!m[2]; }
    span = pos(span, 900, 50); bear = pos(bear, 150, 20); unitW = pos(unitW, 600, 100); dd = pos(dd, 600, 50); D = pos(D, 150, 20);
    var across = span + 2 * bear, tw = bear, hy = span / 2 + tw, nU = Math.max(1, Math.min(Math.floor(L / unitW), 12)), Ls = nU * unitW, ztop = 100 + 100 + dd, P = [];
    add(P, bx(0, -hy, Ls, hy, 0, 100, "ips")); add(P, bx(0, -hy, Ls, hy, 100, 200, "concrete"));
    add(P, bx(0, -hy, Ls, -span / 2, 200, ztop, "concrete")); add(P, bx(0, span / 2, Ls, hy, 200, ztop, "concrete"));
    if (precast) { for (var i = 0; i < nU; i++) add(P, bx(i * unitW + 4, -across / 2, (i + 1) * unitW - 4, across / 2, ztop, ztop + D, "concrete")); } else add(P, bx(0, -across / 2, Ls, across / 2, ztop, ztop + D, "concrete"));
    return { name: "Drain cover slabs " + D + " mm on " + (span / 1000).toFixed(2) + " m drain" + (precast ? " (" + nU + " units shown)" : " (cast in situ)"), parts: P };
  });

  /* ============ flexible pavement (layers) ============ */
  var LAYER_LOOK = { BC: "asphalt", SDBC: "asphalt", DBM: "steel_black", BM: "steel_black", WMM: "gravel", WBM: "gravel", GSB: "stone", CTB: "ips", CTSB: "ips" };
  reg("pavement", function (v, res) {
    var Wd = mmOf(v, "width", 7000), Lfull = mmOf(v, "length", 1000000), L = Math.max(2000, Math.min(Lfull, 15000)), layers = [];
    String(sg(res, "Composition") || "").replace(/mm\s*$/, "").split("/").forEach(function (t) { var m = /^\s*([A-Za-z]+)\s+(\d+(?:\.\d+)?)/.exec(t); if (m && +m[2] > 0) layers.push({ n: m[1].toUpperCase(), t: +m[2] }); });
    if (!layers.length) [["BC", "h_bc", 40], ["DBM", "h_dbm", 90], ["WMM", "h_wmm", 250], ["GSB", "h_gsb", 200]].forEach(function (k) { var t = N(v[k[1]], k[2]); if (t > 0) layers.push({ n: k[0], t: t }); });
    Wd = pos(Wd, 7000, 500); var P = [], sub = 300, z = sub, total = layers.length, i;
    add(P, bx(0, -Wd / 2 - 1000, L, Wd / 2 + 1000, 0, sub, "soil"));
    for (i = total - 1; i >= 0; i--) { var ly = layers[i], extra = 200 * i; add(P, bx(0, -Wd / 2 - extra, L, Wd / 2 + extra, z, z + ly.t, LAYER_LOOK[ly.n] || "concrete")); z += ly.t; }
    for (var x = 1000; x + 3000 < L; x += 6000) add(P, bx(x, -75, x + 3000, 75, z, z + 6, "paint_white"));
    return { name: "Flexible pavement " + layers.map(function (l) { return l.n + " " + Math.round(l.t); }).join(" / ") + " mm, " + (Wd / 1000) + " m wide" + (Lfull > L ? " (" + L / 1000 + " m shown)" : ""), parts: P };
  });

  /* ============ rigid (concrete) pavement ============ */
  reg("rigid_pavement", function (v, res) {
    var h = mmOf(v, "h_chk", 340), dlc = mmOf(v, "h_dlc", 150), gsb = mmOf(v, "h_gsb", 150), laneW = mmOf(v, "lane_w", 3500), shW = mmOf(v, "sh_w", 1500), J = mmOf(v, "joint_L", 4500), nL = Math.max(1, Math.round(mmOf(v, "width", 7000) / Math.max(laneW, 1)));
    var m = rx(sg(res, "PQC slab"), /(\d+)\s*mm\s*M\d+.*?on\s*(\d+)\s*mm\s*DLC\s*\+\s*(\d+)\s*mm\s*GSB/); if (m) { h = +m[1]; dlc = +m[2]; gsb = +m[3]; }
    var mj = rx(sg(res, "Joints"), /(\d+)\s*paving lane\(s\) of\s*([\d.]+)\s*m(?:\s*\+\s*(tied|untied)?\s*shoulders\s*([\d.]+)\s*m)?/i); if (mj) { nL = +mj[1]; laneW = +mj[2] * 1000; if (mj[4]) shW = +mj[4] * 1000; }
    var tied = !/^Untied/i.test(String(v.shoulder || "Tied")); nL = Math.max(1, Math.min(nL, 4)); h = pos(h, 340, 50); dlc = pos(dlc, 150, 20); gsb = pos(gsb, 150, 20); laneW = pos(laneW, 3500, 500); J = pos(J, 4500, 500); shW = Math.max(0, shW);
    var nP = Math.max(1, Math.min(Math.floor(mmOf(v, "length", 500000) / J), 5)), Ls = nP * J, W = nL * laneW + 2 * shW, P = [], sub = 300, z1 = sub + gsb, z2 = z1 + dlc, z3 = z2 + h;
    add(P, bx(0, -W / 2 - 800, Ls, W / 2 + 800, 0, sub, "soil")); add(P, bx(0, -W / 2 - 300, Ls, W / 2 + 300, sub, z1, "stone")); add(P, bx(0, -W / 2 - 300, Ls, W / 2 + 300, z1, z2, "ips"));
    for (var k = 0; k < nP; k++) {
      for (var l = 0; l < nL; l++) { var y0 = -nL * laneW / 2 + l * laneW; add(P, bx(k * J + 6, y0 + 6, (k + 1) * J - 6, y0 + laneW - 6, z2, z3, "concrete")); }
      if (shW > 0) { var yl = -nL * laneW / 2; if (tied) { add(P, bx(k * J + 6, yl - shW, (k + 1) * J - 6, yl - 6, z2, z3, "concrete")); add(P, bx(k * J + 6, -yl + 6, (k + 1) * J - 6, -yl + shW, z2, z3, "concrete")); } }
    }
    if (shW > 0 && !tied) { add(P, bx(0, -nL * laneW / 2 - shW, Ls, -nL * laneW / 2, z2, z2 + 200, "gravel")); add(P, bx(0, nL * laneW / 2, Ls, nL * laneW / 2 + shW, z2, z2 + 200, "gravel")); }
    return { name: "Concrete pavement PQC " + Math.round(h) + " mm on DLC " + Math.round(dlc) + " + GSB " + Math.round(gsb) + " mm, " + nL + " lane(s) × " + (laneW / 1000) + " m, joints @ " + (J / 1000) + " m", parts: P };
  });

  /* ============ cantilever retaining wall ============ */
  reg("retaining_wall", function (v, res) {
    var height = mmOf(v, "height", 4000), df = mmOf(v, "df", 1000), L = Math.max(2000, Math.min(mmOf(v, "length", 30000), 40000)), B = mmOf(v, "B", 2600), toe = mmOf(v, "toe", 800), tb = mmOf(v, "t_base", 400), stB = mmOf(v, "t_stem", 375), stT = mmOf(v, "t_top", 200), key = mmOf(v, "key", 0);
    var m = rx(sg(res, "Base"), /B\s*=\s*([\d.]+)\s*m\s*\(toe\s*([\d.]+),\s*heel\s*([\d.]+)\),\s*tb\s*=\s*(\d+)/); if (m) { B = +m[1] * 1000; toe = +m[2] * 1000; tb = +m[4]; }
    var ms = rx(sg(res, "Stem"), /(\d+)\s*→\s*(\d+)\s*mm/); if (ms) { stT = +ms[1]; stB = +ms[2]; }
    var mk = rx(sg(res, "Shear key"), /([\d.]+)\s*m/); key = mk ? +mk[1] * 1000 : (sg(res, "Shear key") ? 0 : key); if (!m && v.rw_key && /No shear/i.test(String(v.rw_key))) key = 0;
    B = pos(B, 2600, 300); toe = Math.max(0, Math.min(toe, B - stB - 100)); tb = pos(tb, 400, 50); stB = pos(stB, 375, 50); stT = Math.min(pos(stT, 200, 50), stB); key = Math.max(0, key); height = pos(height, 4000, 500); df = pos(df, 1000, 100);
    var kd = key, zb = kd + tb, ztop = zb + height, heelEnd = B - toe, P = [], tStem = function (z) { return stB - (stB - stT) * Math.max(0, Math.min(1, (z - zb) / (ztop - zb))); };
    if (kd > 0) add(P, bx(0, -toe * 0 + 0, L, stB, 0, kd, "concrete"));
    add(P, bx(0, -toe, L, heelEnd, kd, zb, "concrete"));
    addAll(P, sweepX(function (z) { return [[0, tStem(z)]]; }, zb, ztop, 100, 0, L, "concrete"));
    var weep = /^Weep/i.test(String(v.drainage || "Weep")), ft = weep ? N(v.filter_t, 300) : 0;
    if (weep && ft > 0) addAll(P, sweepX(function (z) { return [[tStem(z), tStem(z) + ft]]; }, zb, ztop, 100, 0, L, "gravel"));
    var yb = heelEnd + 1500;
    addAll(P, sweepX(function (z) { return [[tStem(z) + ft, yb]]; }, zb, ztop, 200, 0, L, GHOST));
    add(P, bx(0, -toe - 1500, L, 0, zb, Math.min(ztop, kd + df), GHOST));
    return { name: "Cantilever retaining wall H " + (height / 1000).toFixed(1) + " m, base B " + (B / 1000).toFixed(2) + " m (backfill shown see-through)", parts: P };
  });

  /* ============ gravity / breast / toe / gabion wall ============ */
  reg("gravity_wall", function (v, res) {
    var type = String(v.type || ""), H = mmOf(v, "height", 3000), df = mmOf(v, "df", 600), L = Math.max(2000, Math.min(mmOf(v, "length", 30000), 40000)), top = mmOf(v, "top_w", 600), fb = N(v.front_batter, 0.1), P = [];
    H = pos(H, 3000, 300); df = Math.max(0, df);
    if (/^Gabion/i.test(type)) {
      var ml = rx(sg(res, "Section"), /layers\s*([\d.\s\/]+)\s*m\s*\((steps\s*(front|back)|[^)]*)\)/), widths = [], stepsFront = true;
      if (ml) { widths = ml[1].split("/").map(function (s) { return +s.trim() * 1000; }).filter(function (x) { return x > 0; }); stepsFront = !/back/i.test(ml[2]); }
      if (!widths.length) widths = [2500, 2000, 1500]; var nl = widths.length, hb = H / nl, Wmax = Math.max.apply(null, widths), cellL = 2000, nC = Math.max(1, Math.min(Math.ceil(L / cellL), 20));
      for (var i = 0; i < nl; i++) { var w = widths[i], y0 = stepsFront ? Wmax - w : 0; for (var c = 0; c < nC; c++) add(P, bx(c * cellL + 10, y0 + 10, Math.min(L, (c + 1) * cellL) - 10, y0 + w - 10, i * hb, (i + 1) * hb - 10 + 10, "stone")); }
      addAll(P, sweepX(function (z) { var k = Math.min(nl - 1, Math.floor(z / hb)), w = widths[k], y0 = stepsFront ? Wmax - w : 0; return [[y0 + w, Wmax + 2500]]; }, 0, H, 250, 0, L, GHOST));
      return { name: "Gabion wall H " + (H / 1000).toFixed(1) + " m, " + nl + " layers", parts: P };
    }
    var mB = rx(sg(res, "Section"), /B\s*([\d.]+)\s*m,\s*top\s*([\d.]+)\s*m,\s*batters\s*([\d.]+)\s*\/\s*([\d.]+)/), B = mmOf(v, "B_chk", 1600), bb = 0.2;
    if (mB) { B = +mB[1] * 1000; top = +mB[2] * 1000; fb = +mB[3]; bb = +mB[4]; } else { fb = Math.max(0, fb); bb = Math.max(0, (B - top - fb * H) / H); }
    B = pos(B, 1600, 200); top = Math.min(pos(top, 600, 100), B); var look = /PCC/i.test(type) ? "concrete" : "stone";
    var yf = function (z) { return Math.min(fb * z, B - 50); }, ybk = function (z) { return Math.max(yf(z) + top * 0.3, B - bb * z); };
    addAll(P, sweepX(function (z) { return [[yf(z), ybk(z)]]; }, 0, H, 100, 0, L, look));
    addAll(P, sweepX(function (z) { return [[ybk(z), B + 2500]]; }, 0, H, 250, 0, L, GHOST));
    if (df > 0) add(P, bx(0, -1500, L, 0, 0, Math.min(df, H), GHOST));
    var nm = /^Breast/i.test(type) ? "Breast wall" : /^Toe/i.test(type) ? "Toe wall" : /PCC/i.test(type) ? "PCC gravity wall" : "Masonry gravity wall";
    return { name: nm + " H " + (H / 1000).toFixed(1) + " m, base " + (B / 1000).toFixed(2) + " m, top " + (top / 1000).toFixed(2) + " m", parts: P };
  });

  /* ============ drain-cum-retaining wall ============ */
  reg("drain_retaining", function (v, res) {
    var W = mmOf(v, "width", 900), D = mmOf(v, "depth", 1000), hRet = mmOf(v, "h_ret", 2500), up = mmOf(v, "upstand", 0), hOut = mmOf(v, "h_out", 800), L = Math.max(2000, Math.min(mmOf(v, "length", 100000), 20000));
    var th = 250, tl = 200, tb = 300, heel = 1000, key = 750, m = rx(sg(res, "Section"), /drain\s*(\d+)\s*×\s*(\d+)\s*clear;\s*high wall\s*(\d+)\s*×\s*([\d.]+)\s*m,\s*low wall\s*(\d+);\s*base\s*([\d.]+)\s*×\s*(\d+)\s*\(toe\s*([\d.]+),\s*heel\s*([\d.]+)\),\s*key\s*([\d.]+)/);
    if (m) { W = +m[1]; D = +m[2]; th = +m[3]; hRet = +m[4] * 1000; tl = +m[5]; tb = +m[7]; heel = +m[9] * 1000; key = +m[10] * 1000; } else { th = mmOf(v, "th_chk", 250); tl = mmOf(v, "tl_chk", 200); tb = mmOf(v, "tb_chk", 300); heel = mmOf(v, "heel_chk", 1000); key = mmOf(v, "key_chk", 750); }
    W = pos(W, 900, 100); D = pos(D, 1000, 100); th = pos(th, 250, 50); tl = pos(tl, 200, 50); tb = pos(tb, 300, 50); heel = Math.max(0, heel); key = Math.max(0, key); hRet = pos(hRet, 2500, 300);
    var kd = key, zb = kd + tb, zLow = zb + D, zHigh = zb + hRet + up, yL1 = tl, yH0 = tl + W, yH1 = tl + W + th, yEnd = yH1 + heel, P = [];
    if (kd > 0) add(P, bx(0, yH0, L, yH1, 0, kd, "concrete"));
    add(P, bx(0, 0, L, yEnd, kd, zb, "concrete"));
    add(P, bx(0, 0, L, yL1, zb, zLow, "concrete")); add(P, bx(0, yH0, L, yH1, zb, zHigh, "concrete"));
    if (/^Covered/i.test(String(v.covered || ""))) { var tcs = mmOf(v, "t_cs", 100); add(P, bx(0, 0, L, yH0, zLow, zLow + tcs, "concrete")); }
    var weep = !/^(No weep|No )/i.test(String(v.drainage || "Weep")), ft = weep ? N(v.filter_t, 300) : 0;
    if (ft > 0) add(P, bx(0, yH1, L, yH1 + ft, zb, Math.min(zHigh, zb + hRet), "gravel"));
    add(P, bx(0, yH1 + ft, L, yEnd + 1500, zb, zb + hRet, GHOST));
    if (hOut > 0) add(P, bx(0, -1500, L, 0, zb, zb + hOut, GHOST));
    return { name: "Drain-cum-retaining wall " + (W / 1000).toFixed(2) + " m drain, high wall " + (hRet / 1000).toFixed(1) + " m" + (/^Covered/i.test(String(v.covered || "")) ? ", covered" : ""), parts: P };
  });

  /* ============ masonry / stone-pitched / earthen drain ============ */
  reg("masonry_drain", function (v, res) {
    var dtype = String(v.dtype || ""), trap = /^Trapezoidal/i.test(dtype), lined = /pitched/i.test(dtype), L = Math.max(1000, Math.min(mmOf(v, "length", 100000), 20000)), b = mmOf(v, "b_chk", 600), d = mmOf(v, "d_chk", 750), s = N(v.side_slope, 1.5), tw = mmOf(v, "tw_chk", 345), P = [];
    var m = rx(sg(res, "Section"), /(rectangular|trapezoidal)\s*([\d.]+)\s*m bed\s*×\s*([\d.]+)\s*m deep(?:,\s*([\d.]+):1 sides)?/i); if (m) { b = +m[2] * 1000; d = +m[3] * 1000; if (m[4]) s = +m[4]; }
    var mw = rx(sg(res, "Walls"), /(\d+)\s*mm/); if (mw) tw = +mw[1];
    b = pos(b, 600, 50); d = pos(d, 750, 50); s = pos(s, 1.5, 0); tw = pos(tw, 345, 50);
    if (!trap) {
      var hy = b / 2 + tw, look = /stone/i.test(dtype) ? "stone" : "brick";
      add(P, bx(0, -hy - 100, L, hy + 100, 0, 150, "ips")); add(P, bx(0, -hy, L, -b / 2, 150, 150 + d, look)); add(P, bx(0, b / 2, L, hy, 150, 150 + d, look));
      return { name: "Masonry drain " + (b / 1000).toFixed(2) + " × " + (d / 1000).toFixed(2) + " m (" + tw + " mm " + (look === "stone" ? "stone" : "brick") + " walls)", parts: P };
    }
    var tl = lined ? 200 : 0, tlh = tl * Math.sqrt(1 + s * s), zi = Math.max(tl, 100), ztop = zi + d, hb = function (z) { return b / 2 + s * Math.max(0, z - zi); }, Yw = hb(ztop) + tlh + 1200;
    addAll(P, sweepX(function (z) { if (z < zi - tl) return [[-Yw, Yw]]; if (z < zi) return [[-Yw, -(b / 2 + tlh)], [b / 2 + tlh, Yw]]; return [[-Yw, -(hb(z) + tlh)], [hb(z) + tlh, Yw]]; }, 0, ztop, 50, 0, L, "earth"));
    if (tl > 0) {
      addAll(P, sweepX(function () { return [[-(b / 2 + tlh), b / 2 + tlh]]; }, zi - tl, zi, tl, 0, L, "stone"));
      addAll(P, sweepX(function (z) { return [[-(hb(z) + tlh), -hb(z)], [hb(z), hb(z) + tlh]]; }, zi, ztop, 50, 0, L, "stone"));
    }
    return { name: (lined ? "Stone-pitched" : "Earthen") + " trapezoidal drain, bed " + (b / 1000).toFixed(2) + " m, depth " + (d / 1000).toFixed(2) + " m, " + s + ":1 sides", parts: P };
  });
})();
