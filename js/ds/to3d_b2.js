/* Estimate Pro — Design Studio → 3D builders, batch 2: RCC members, building frame, bridges.
   rcc_beam, rcc_slab, rcc_column, rcc_footing, combined_footing, lintel_chajja, rcc_staircase, building_frame, slab_bridge, tbeam_bridge.
   Sizes come from the module's RESULT when it has been run (summary text, quantity rows, bar-bending rows) and from the inputs otherwise.
   Concrete that carries drawn reinforcement is drawn see-through ("concrete_ghost") so the bars show; bars are thin members (look "rebar_steel").
   Each model is capped at ~1150 parts (stirrups / bars are thinned out beyond that). z = 0 is the model base (footings: bottom of the PCC). */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {}, T = DS.to3d = DS.to3d || { builders: {} };
  if (window.EP && EP.bim && EP.bim.LOOKS && !EP.bim.LOOKS.concrete_ghost) EP.bim.LOOKS.concrete_ghost = { n: "Concrete (see-through)", c: "#b9b7b0", p: EP.bim.PT ? EP.bim.PT.concrete : 4, g: 0.06, a: 0.3 };
  var GH = "concrete_ghost", SOL = "concrete", RB = "rebar_steel", OE = "Øø";

  /* ---------- small helpers ---------- */
  function num(x, d) { x = +x; return isFinite(x) && x > 0 ? x : d; }
  function nums(s) { var m = String(s == null ? "" : s).replace(/,/g, "").match(/\d+(?:\.\d+)?/g); return m ? m.map(Number) : []; }
  function sm(res, key) { var s = res && res.summary; if (!s) return ""; if (s[key] != null) return String(s[key]); var k = Object.keys(s).filter(function (q) { return q.toLowerCase().indexOf(key.toLowerCase()) === 0; })[0]; return k ? String(s[k]) : ""; }
  function qrow(res, re) { var out = null; ((res && res.quantities) || []).forEach(function (q) { (q.rows || []).forEach(function (r) { if (!out && re.test(String(r.description || ""))) out = r; }); }); return out; }
  function brow(res, re) { var out = null; ((res && res.bbs) || []).forEach(function (b) { if (!out && re.test(String(b.member || "") + " " + String(b.mark || "") + " " + String(b.note || ""))) out = b; }); return out; }
  var RE_DS = new RegExp("(\\d+(?:\\.\\d+)?)\\s*[" + OE + "]\\s*@\\s*(\\d+(?:\\.\\d+)?)"), RE_ND = new RegExp("(\\d+)\\s*-\\s*(\\d+(?:\\.\\d+)?)\\s*[" + OE + "]");
  function dS(str) { var m = RE_DS.exec(str || ""); return m ? { dia: +m[1], s: +m[2] } : null; }
  function nD(str) { var m = RE_ND.exec(str || ""); return m ? { n: +m[1], dia: +m[2] } : null; }
  function Acc(max) { this.p = []; this.max = max || 1150; }
  Acc.prototype.add = function (x) { if (x && this.p.length < this.max) this.p.push(x); };
  Acc.prototype.all = function (arr) { for (var i = 0; i < arr.length; i++) this.add(arr[i]); };
  function fin(name, A) { return { name: name, parts: A.p.filter(valid) }; }
  function fn(x) { return typeof x === "number" && isFinite(x); }
  function p3(p) { return p && fn(p[0]) && fn(p[1]) && fn(p[2]); }
  function valid(q) {
    var t = q[0], i;
    if (t === "b") { for (i = 1; i <= 6; i++) if (!fn(q[i])) return false; return q[3] > 0 && q[4] > 0 && q[6] > q[5]; }
    if (t === "c") { for (i = 1; i <= 5; i++) if (!fn(q[i])) return false; return q[3] > 0 && q[5] > q[4] && (q[7] == null || (fn(q[7]) && q[7] >= 0)); }
    if (t === "t") { for (i = 1; i <= 6; i++) if (!fn(q[i])) return false; return q[3] > q[4] && q[4] >= 0 && q[6] > q[5]; }
    if (t === "p") { if (!q[1] || q[1].length < 3 || !fn(q[2]) || !fn(q[3]) || q[3] <= q[2]) return false; return q[1].every(function (p) { return fn(p[0]) && fn(p[1]); }); }
    if (t === "m") { return p3(q[1]) && p3(q[2]) && fn(q[3]) && fn(q[4]) && q[3] > 0 && q[4] > 0 && Math.hypot(q[1][0] - q[2][0], q[1][1] - q[2][1], q[1][2] - q[2][2]) > 1; }
    if (t === "i") { return p3(q[1]) && p3(q[2]) && q[3] > 0 && q[4] > 0 && q[5] > 0 && q[6] > 0 && Math.hypot(q[1][0] - q[2][0], q[1][1] - q[2][1], q[1][2] - q[2][2]) > 1; }
    if (t === "q") { return p3(q[1]) && p3(q[2]) && p3(q[3]) && p3(q[4]); }
    return false;
  }
  /* evenly spread positions from a to b with at most maxN positions and a spacing no larger than s */
  function steps(a, b, s, maxN) { var L = b - a; if (!(L > 0)) return [(a + b) / 2]; var n = Math.max(1, Math.ceil(L / Math.max(1, s) - 1e-9)); if (n + 1 > (maxN || 40)) n = (maxN || 40) - 1; var o = []; for (var i = 0; i <= n; i++) o.push(a + L * i / n); return o; }
  function spread(a, b, n) { n = Math.max(1, Math.round(n)); if (n === 1) return [(a + b) / 2]; var o = []; for (var i = 0; i < n; i++) o.push(a + (b - a) * i / (n - 1)); return o; }
  /* a bar along a straight line, round-ish section dia × dia */
  function bar(A, H, a, b, dia) { A.add(H.member(a, b, dia, dia, RB)); }
  /* rectangular link / stirrup ring in the y–z plane at x (centre-line rectangle y0..y1, z0..z1) */
  function ringYZ(A, H, x, y0, y1, z0, z1, d) {
    A.add(H.bx(x - d / 2, y0 - d / 2, x + d / 2, y0 + d / 2, z0 - d / 2, z1 + d / 2, RB)); A.add(H.bx(x - d / 2, y1 - d / 2, x + d / 2, y1 + d / 2, z0 - d / 2, z1 + d / 2, RB));
    A.add(H.bx(x - d / 2, y0 - d / 2, x + d / 2, y1 + d / 2, z0 - d / 2, z0 + d / 2, RB)); A.add(H.bx(x - d / 2, y0 - d / 2, x + d / 2, y1 + d / 2, z1 - d / 2, z1 + d / 2, RB));
  }
  /* rectangular tie in the x–y plane at height z */
  function ringXY(A, H, z, x0, x1, y0, y1, d) {
    A.add(H.bx(x0 - d / 2, y0 - d / 2, x1 + d / 2, y0 + d / 2, z - d / 2, z + d / 2, RB)); A.add(H.bx(x0 - d / 2, y1 - d / 2, x1 + d / 2, y1 + d / 2, z - d / 2, z + d / 2, RB));
    A.add(H.bx(x0 - d / 2, y0 - d / 2, x0 + d / 2, y1 + d / 2, z - d / 2, z + d / 2, RB)); A.add(H.bx(x1 - d / 2, y0 - d / 2, x1 + d / 2, y1 + d / 2, z - d / 2, z + d / 2, RB));
  }
  /* n bars on the perimeter of the rectangle x0..x1 × y0..y1 : the four corners first, the rest shared between the sides */
  function perim(x0, x1, y0, y1, n) {
    n = Math.max(4, Math.round(n)); var w = x1 - x0, h = y1 - y0, pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], rem = n - 4, nx = 0, ny = 0;
    while (rem >= 2) { var cx = w / (nx + 1), cy = h / (ny + 1); if (cx >= cy) { nx += 1; rem -= 2; } else if (rem >= 2) { ny += 1; rem -= 2; } }
    for (var i = 1; i <= nx; i++) { pts.push([x0 + w * i / (nx + 1), y0]); pts.push([x0 + w * i / (nx + 1), y1]); }
    for (var j = 1; j <= ny; j++) { pts.push([x0, y0 + h * j / (ny + 1)]); pts.push([x1, y0 + h * j / (ny + 1)]); }
    return pts;
  }
  function reg(id, f) { T.reg(id, function (v, res, H) { try { return f(v || {}, res || {}, H); } catch (e) { if (window.console && console.error) console.error("3D builder " + id + ":", e); return null; } }); }

  /* ============================== RCC BEAM ============================== */
  reg("rcc_beam", function (v, res, H) {
    var A = new Acc(), sec = nums(sm(res, "Section")), L = num(v.span, 5) * 1000, b = num(sec[0], num(v.b, 230)), D = num(sec[1], num(v.D, Math.max(300, Math.round(L / 12 / 25) * 25)));
    var cov = num(v.cover, 25), bot = nD(sm(res, "Bottom")) || { n: num(v.bot_n, 3), dia: num(v.bot_dia, 16) }, top = nD(sm(res, "Top")) || { n: num(v.top_n, 2), dia: num(v.top_dia, 12) };
    var st = dS(sm(res, "Stirrups")) || { dia: num(v.stirrup_dia, 8), s: num(v.stirrup_s, 150) }, sup = String(v.support || ""), cant = /cantilever/i.test(sup), interior = /interior/i.test(sup), contin = /continuous/i.test(sup);
    var cs = Math.max(300, Math.round(b + 70)), zs = 1200, x0 = -L / 2, x1 = L / 2, hc = zs + D + 300, bw2 = Math.max(cs, b);
    /* concrete: the beam between column faces, columns / wall at the supports */
    if (cant) {
      A.add(H.bx(x0 - 400, -bw2 / 2 - 300, x0, bw2 / 2 + 300, 0, zs + D + 500, SOL)); A.add(H.bx(x0, -b / 2, x1, b / 2, zs, zs + D, GH));
    } else {
      A.add(H.bx(x0 - cs / 2, -bw2 / 2, x0 + cs / 2, bw2 / 2, 0, hc, SOL)); A.add(H.bx(x1 - cs / 2, -bw2 / 2, x1 + cs / 2, bw2 / 2, 0, hc, SOL));
      A.add(H.bx(x0 + cs / 2, -b / 2, x1 - cs / 2, b / 2, zs, zs + D, GH));
      if (contin) { A.add(H.bx(x1 + cs / 2, -b / 2, x1 + cs / 2 + 800, b / 2, zs, zs + D, GH)); if (interior) A.add(H.bx(x0 - cs / 2 - 800, -b / 2, x0 - cs / 2, b / 2, zs, zs + D, GH)); }
    }
    /* reinforcement */
    var xa = x0 + cov, xb = x1 - cov, ext = contin && !cant ? 800 : 0;
    if (bot.n > 0) { var yb = b / 2 - cov - st.dia - bot.dia / 2, zb = zs + cov + st.dia + bot.dia / 2; spread(-yb, yb, bot.n).forEach(function (y) { bar(A, H, [xa, y, zb], [xb, y, zb], bot.dia); }); }
    if (top.n > 0) { var yt = b / 2 - cov - st.dia - top.dia / 2, zt = zs + D - cov - st.dia - top.dia / 2; spread(-yt, yt, top.n).forEach(function (y) { bar(A, H, [xa - (interior && contin ? ext : 0), y, zt], [xb + ext, y, zt], top.dia); }); }
    var sy = b / 2 - cov - st.dia / 2, z0 = zs + cov + st.dia / 2, z1 = zs + D - cov - st.dia / 2;
    steps(x0 + cs / 2 + 60, x1 - cs / 2 - 60, st.s, 40).forEach(function (x) { ringYZ(A, H, x, -sy, sy, z0, z1, st.dia); });
    return fin("RCC beam " + Math.round(b) + " × " + Math.round(D) + " mm, span " + (L / 1000).toFixed(2) + " m", A);
  });

  /* ============================== RCC SLAB ============================== */
  reg("rcc_slab", function (v, res, H) {
    var A = new Acc(), lx = num(v.lx, 3.6) * 1000, ly = num(v.ly, 4.8) * 1000, D = num(nums(sm(res, "Thickness"))[0], num(v.D, Math.max(100, Math.round(Math.min(lx, ly) / 30 / 5) * 5)));
    var cov = num(v.cover, 20), zs = 2800, bd = 230, hb = 300, cc = 300;
    A.add(H.bx(-lx / 2, -ly / 2, lx / 2, ly / 2, zs, zs + D, GH));
    /* edge beams and corner columns */
    A.add(H.bx(-lx / 2 - bd / 2, -ly / 2 - bd / 2, lx / 2 + bd / 2, -ly / 2 + bd / 2, zs - hb, zs, SOL)); A.add(H.bx(-lx / 2 - bd / 2, ly / 2 - bd / 2, lx / 2 + bd / 2, ly / 2 + bd / 2, zs - hb, zs, SOL));
    A.add(H.bx(-lx / 2 - bd / 2, -ly / 2 + bd / 2, -lx / 2 + bd / 2, ly / 2 - bd / 2, zs - hb, zs, SOL)); A.add(H.bx(lx / 2 - bd / 2, -ly / 2 + bd / 2, lx / 2 + bd / 2, ly / 2 - bd / 2, zs - hb, zs, SOL));
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) { A.add(H.box(q[0] * lx / 2, q[1] * ly / 2, cc, cc, 0, zs - hb, SOL)); });
    /* bars from the summary rows ("Bars Mx+" …): Mx = bars along x (short span), My = along y; + bottom, − top over the supports */
    var s = res && res.summary ? res.summary : {}, one = /one-way/i.test(String(v.type || "")), bars = [];
    Object.keys(s).forEach(function (k) {
      if (k.indexOf("Bars") !== 0) return; var sp = dS(s[k]); if (!sp) return; var nm = k.slice(5), dir = /x/i.test(nm) ? "x" : /y/i.test(nm) ? "y" : /dist/i.test(nm) ? "y" : "x", neg = /[−-]\s*$/.test(nm) || /top|support|neg/i.test(nm);
      bars.push({ dir: dir, neg: neg, dia: sp.dia, s: sp.s });
    });
    if (!bars.length) { var d0 = num(v.main_dia, 10), s0 = num(v.main_s, 150); bars = [{ dir: "x", neg: false, dia: d0, s: s0 }, { dir: "y", neg: false, dia: d0, s: s0 * 1.2 }]; if (!one) { bars.push({ dir: "x", neg: true, dia: d0, s: s0 * 1.5 }); bars.push({ dir: "y", neg: true, dia: d0, s: s0 * 1.5 }); } }
    var lay = { x: 0, y: 0 }, ext = 0.3 * Math.min(lx, ly);
    bars.filter(function (q) { return !q.neg; }).forEach(function (q) {
      var z = zs + cov + (q.dir === "x" ? q.dia / 2 : (bars.filter(function (o) { return !o.neg && o.dir === "x"; })[0] || { dia: 0 }).dia + q.dia / 2);
      if (q.dir === "x") steps(-ly / 2 + cov, ly / 2 - cov, q.s, 45).forEach(function (y) { bar(A, H, [-lx / 2 + cov, y, z], [lx / 2 - cov, y, z], q.dia); });
      else steps(-lx / 2 + cov, lx / 2 - cov, q.s, 45).forEach(function (x) { bar(A, H, [x, -ly / 2 + cov, z], [x, ly / 2 - cov, z], q.dia); });
    });
    bars.filter(function (q) { return q.neg; }).forEach(function (q) {
      var z = zs + D - cov - q.dia / 2 - (q.dir === "y" ? q.dia : 0);
      if (q.dir === "x") steps(-ly / 2 + cov, ly / 2 - cov, q.s, 30).forEach(function (y) { bar(A, H, [-lx / 2 + cov, y, z], [-lx / 2 + ext, y, z], q.dia); bar(A, H, [lx / 2 - ext, y, z], [lx / 2 - cov, y, z], q.dia); });
      else steps(-lx / 2 + cov, lx / 2 - cov, q.s, 30).forEach(function (x) { bar(A, H, [x, -ly / 2 + cov, z], [x, -ly / 2 + ext, z], q.dia); bar(A, H, [x, ly / 2 - ext, z], [x, ly / 2 - cov, z], q.dia); });
    });
    return fin("RCC slab " + (lx / 1000).toFixed(2) + " × " + (ly / 1000).toFixed(2) + " m, " + Math.round(D) + " mm thick", A);
  });

  /* ============================== RCC COLUMN ============================== */
  reg("rcc_column", function (v, res, H) {
    var A = new Acc(), sec = nums(sm(res, "Section")), b = num(sec[0], num(v.b, 300)), D = num(sec[1], num(v.D, 450)), nf = Math.min(10, Math.max(1, Math.round(num(v.floors, 1)))), h = num(v.length, 3) * 1000 * nf;
    var cov = num(v.cover, 40), bars = nD(sm(res, "Bars")) || { n: num(v.n_bars, 8), dia: num(v.bar_dia, 16) }, tie = dS(sm(res, "Ties")) || { dia: 8, s: 150 };
    /* x = D (major axis), y = b */
    A.add(H.bx(-D / 2, -b / 2, D / 2, b / 2, 0, h, GH));
    if (nf > 1) for (var f = 1; f < nf; f++) A.add(H.bx(-D / 2 - 300, -b / 2 - 150, D / 2 + 300, b / 2 + 150, f * h / nf - 100, f * h / nf + 100, SOL));
    var ix = D / 2 - cov - tie.dia - bars.dia / 2, iy = b / 2 - cov - tie.dia - bars.dia / 2;
    if (ix > 0 && iy > 0) perim(-ix, ix, -iy, iy, bars.n).forEach(function (p) { A.add(H.cyl(p[0], p[1], bars.dia / 2, 20, h - 20, RB)); });
    var tx = D / 2 - cov - tie.dia / 2, ty = b / 2 - cov - tie.dia / 2;
    if (tx > 0 && ty > 0) steps(60, h - 60, tie.s, 40).forEach(function (z) { ringXY(A, H, z, -tx, tx, -ty, ty, tie.dia); });
    return fin("RCC column " + Math.round(b) + " × " + Math.round(D) + " mm, " + (h / 1000).toFixed(1) + " m", A);
  });

  /* ============================== ISOLATED FOOTING ============================== */
  reg("rcc_footing", function (v, res, H) {
    var A = new Acc(), sz = nums(sm(res, "Size")), L = num(sz[0] * 1000, num(v.L, 2.4) * 1000), B = num(sz[1] * 1000, num(v.B, 2.4) * 1000), D = num(sz[2] * 1000, num(v.Df_mm, 550));
    var cb = num(v.col_b, 300), cd = num(v.col_D, 450), df = num(v.df, 1.5) * 1000, cov = num(v.cover, 50);
    var pr = qrow(res, /levelling|PCC/i), pcc = pr && pr.depth > 0 ? Math.round(pr.depth * 1000) : 100, po = pr && pr.length > 0 ? Math.max(0, (pr.length * 1000 - L) / 2) : 100;
    var bl = dS(sm(res, "Bars along L")) || { dia: num(v.bar_dia, 12), s: num(v.bar_s, 150) }, bb = dS(sm(res, "Bars along B")) || bl;
    var gl = pcc + Math.max(df, D), top = gl + 500;
    A.add(H.bx(-L / 2 - po, -B / 2 - po, L / 2 + po, B / 2 + po, 0, pcc, SOL));               /* PCC levelling course */
    A.add(H.bx(-L / 2, -B / 2, L / 2, B / 2, pcc, pcc + D, GH));                             /* pad */
    A.add(H.bx(-cd / 2, -cb / 2, cd / 2, cb / 2, pcc + D, top, SOL));                         /* pedestal / column stub (to GL + 500) */
    var z1 = pcc + cov + bl.dia / 2, z2 = pcc + cov + bl.dia + bb.dia / 2;
    steps(-B / 2 + cov + bl.dia / 2, B / 2 - cov - bl.dia / 2, bl.s, 45).forEach(function (y) { bar(A, H, [-L / 2 + cov, y, z1], [L / 2 - cov, y, z1], bl.dia); });
    steps(-L / 2 + cov + bb.dia / 2, L / 2 - cov - bb.dia / 2, bb.s, 45).forEach(function (x) { bar(A, H, [x, -B / 2 + cov, z2], [x, B / 2 - cov, z2], bb.dia); });
    var dw = 16, ix = cd / 2 - 50, iy = cb / 2 - 50; if (ix > 0 && iy > 0) perim(-ix, ix, -iy, iy, 8).forEach(function (p) { A.add(H.cyl(p[0], p[1], dw / 2, z1, gl + 400, RB)); });
    return fin("Isolated footing " + (L / 1000).toFixed(2) + " × " + (B / 1000).toFixed(2) + " × " + (D / 1000).toFixed(2) + " m (ground level at z = " + Math.round(gl) + ")", A);
  });

  /* ============================== COMBINED FOOTING ============================== */
  reg("combined_footing", function (v, res, H) {
    var A = new Acc(), sf = sm(res, "Footing"), m3 = /(\d+(?:\.\d+)?)\s*×\s*(\d+(?:\.\d+)?)\s*×\s*(\d+(?:\.\d+)?)\s*mm/.exec(sf), ma = /(\d+(?:\.\d+)?)\s*m from the left/.exec(sf);
    var L = num(m3 && +m3[1] * 1000, num(v.L_chk, 5.82) * 1000), B = num(m3 && +m3[2] * 1000, num(v.B_chk, 2.1) * 1000), D = num(m3 && +m3[3], num(v.D_chk, 750)), a = num(ma && +ma[1] * 1000, num(v.a_chk, 0.75) * 1000);
    var s = num(v.s, 3.6) * 1000, df = num(v.df, 1.5) * 1000, cov = num(v.cover, 50), pr = qrow(res, /levelling/i), pcc = pr && pr.depth > 0 ? Math.round(pr.depth * 1000) : 100, po = pr && pr.length > 0 ? Math.max(0, (pr.length * 1000 - L) / 2) : 100;
    var x1 = -L / 2 + a, x2 = x1 + s, gl = pcc + Math.max(df, D), top = gl + 500, c1b = num(v.c1_b, 400), c1d = num(v.c1_D, 400), c2b = num(v.c2_b, 450), c2d = num(v.c2_D, 450);
    A.add(H.bx(-L / 2 - po, -B / 2 - po, L / 2 + po, B / 2 + po, 0, pcc, SOL)); A.add(H.bx(-L / 2, -B / 2, L / 2, B / 2, pcc, pcc + D, GH));
    A.add(H.bx(x1 - c1d / 2, -c1b / 2, x1 + c1d / 2, c1b / 2, pcc + D, top, SOL)); A.add(H.bx(x2 - c2d / 2, -c2b / 2, x2 + c2d / 2, c2b / 2, pcc + D, top, SOL));
    var bot = dS(sm(res, "Bottom bars")) || { dia: num(v.bot_dia, 12), s: num(v.bot_s, 125) }, tp = dS(sm(res, "Top bars")) || { dia: num(v.top_dia, 20), s: num(v.top_s, 150) };
    var tr = String(sm(res, "Transverse")).split("/"), t1 = dS(tr[0]) || { dia: num(v.tr_dia, 16), s: num(v.tr_s, 150) }, t2 = dS(tr[1]) || t1;
    var zb = pcc + cov + bot.dia / 2, zt = pcc + D - cov - tp.dia / 2, ztr = pcc + cov + bot.dia + t1.dia / 2;
    steps(-B / 2 + cov + bot.dia / 2, B / 2 - cov - bot.dia / 2, bot.s, 40).forEach(function (y) { bar(A, H, [-L / 2 + cov, y, zb], [L / 2 - cov, y, zb], bot.dia); });
    steps(-B / 2 + cov + tp.dia / 2, B / 2 - cov - tp.dia / 2, tp.s, 30).forEach(function (y) { bar(A, H, [-L / 2 + cov, y, zt], [L / 2 - cov, y, zt], tp.dia); });
    [[x1, t1, "column 1", c1d], [x2, t2, "column 2", c2d]].forEach(function (q) {
      var r = brow(res, new RegExp("transverse strip under " + q[2], "i")), w = r && r.nos > 0 ? r.nos * q[1].s : q[3] + D, n = Math.min(r && r.nos > 0 ? r.nos : 40, 30);
      spread(q[0] - w / 2, q[0] + w / 2, n).forEach(function (x) { if (x > -L / 2 + cov && x < L / 2 - cov) bar(A, H, [x, -B / 2 + cov, ztr], [x, B / 2 - cov, ztr], q[1].dia); });
    });
    return fin("Combined footing " + (L / 1000).toFixed(2) + " × " + (B / 1000).toFixed(2) + " × " + (D / 1000).toFixed(2) + " m", A);
  });

  /* ============================== LINTEL / CHAJJA / PLINTH BEAM ============================== */
  reg("lintel_chajja", function (v, res, H) {
    var A = new Acc(), mem = String(v.member || ""), plinth = /plinth/i.test(mem), chj = /chajja/i.test(mem), wt = num(v.wall_t, 230), cov = num(v.cover, 30), sd = num(v.st_dia, 6);
    var sl = sm(res, "Lintel"), sec = nums(sl), bars = sm(res, "Bars"), mb = /(\d+)\s*-\s*(\d+(?:\.\d+)?)\s*[Øø]\s*bottom/.exec(bars), mt = /(\d+)\s*-\s*(\d+(?:\.\d+)?)\s*[Øø]\s*top/.exec(bars), ms = dS(bars);
    var bot = mb ? { n: +mb[1], dia: +mb[2] } : { n: num(v.bot_n, 2), dia: num(v.bot_dia, 12) }, top = mt ? { n: +mt[1], dia: +mt[2] } : { n: num(v.top_n, 2), dia: num(v.top_dia, 12) }, st = ms || { dia: sd, s: num(v.st_s, 150) };
    if (!plinth) {
      var Dl = num(sec[1], num(v.D_chk, 200)), bw = num(sec[0], wt), Lc = num(v.opening, 1.2) * 1000, br = num(v.bearing, 0.2) * 1000, zl = 2100, Ll = Lc + 2 * br, xa = -Ll / 2, xb = Ll / 2, hab = num(v.h_above, 2) * 1000, ex = 600;
      /* masonry: two jamb piers + wall above the lintel */
      A.add(H.bx(xa - ex, -wt / 2, xa + br, wt / 2, 0, zl, "brick")); A.add(H.bx(xb - br, -wt / 2, xb + ex, wt / 2, 0, zl, "brick"));
      A.add(H.bx(xa - ex, -wt / 2, xb + ex, wt / 2, zl + Dl, zl + Dl + hab, "brick"));
      A.add(H.bx(xa, -bw / 2, xb, bw / 2, zl, zl + Dl, GH));
      var yb = bw / 2 - cov - st.dia - bot.dia / 2, zb = zl + cov + st.dia + bot.dia / 2, zt = zl + Dl - cov - st.dia - top.dia / 2;
      if (bot.n > 0) spread(-yb, yb, bot.n).forEach(function (y) { bar(A, H, [xa + cov, y, zb], [xb - cov, y, zb], bot.dia); });
      if (top.n > 0) spread(-(bw / 2 - cov - st.dia - top.dia / 2), bw / 2 - cov - st.dia - top.dia / 2, top.n).forEach(function (y) { bar(A, H, [xa + cov, y, zt], [xb - cov, y, zt], top.dia); });
      var sy = bw / 2 - cov - st.dia / 2;
      steps(xa + cov + 30, xb - cov - 30, st.s, 40).forEach(function (x) { ringYZ(A, H, x, -sy, sy, zl + cov + st.dia / 2, zl + Dl - cov - st.dia / 2, st.dia); });
      if (chj) {
        var pj = num(v.proj, 0.6) * 1000, tr = num(v.t_root, 100), tt = num(v.t_tip, 75), ztop = zl + Dl, y0 = wt / 2, n = 8, cm = /(\d+(?:\.\d+)?)\s*[Øø]\s*@\s*(\d+(?:\.\d+)?)\s*top/.exec(sm(res, "Chajja")), cd = /(\d+(?:\.\d+)?)\s*[Øø]\s*@\s*(\d+(?:\.\d+)?)\s*dist/.exec(sm(res, "Chajja"));
        for (var i = 0; i < n; i++) { var ya = y0 + pj * i / n, yb2 = y0 + pj * (i + 1) / n, tm = tr + (tt - tr) * (i + 0.5) / n; A.add(H.bx(xa, ya, xb, yb2, ztop - tm, ztop, GH)); }
        var mm = cm ? { dia: +cm[1], s: +cm[2] } : { dia: num(v.ch_dia, 8), s: num(v.ch_s, 150) }, dd = cd ? { dia: +cd[1], s: +cd[2] } : { dia: 8, s: mm.s * 1.5 }, zc = ztop - 20 - mm.dia / 2;
        steps(xa + cov, xb - cov, mm.s, 40).forEach(function (x) { bar(A, H, [x, -bw / 2 + cov, zc], [x, y0 + pj - 20, zc], mm.dia); });
        steps(y0 + 30, y0 + pj - 20, dd.s, 20).forEach(function (y) { bar(A, H, [xa + cov, y, zc - mm.dia / 2 - dd.dia / 2], [xb - cov, y, zc - mm.dia / 2 - dd.dia / 2], dd.dia); });
      }
      return fin((chj ? "Lintel with chajja " : "Lintel ") + Math.round(bw) + " × " + Math.round(Dl) + " mm, opening " + (Lc / 1000).toFixed(2) + " m", A);
    }
    /* plinth beam on a wall footing, between two columns, with the masonry wall above */
    var span = num(v.span, 4) * 1000, cw = num(v.col_w, 0.3) * 1000, pd = num(nums(sm(res, "Plinth"))[1], num(v.pbD_chk, 300)), wh = num(v.wall_h, 3) * 1000, fb = wt + 600, fd = 300, ph = 450, zbm = fd + ph, x0 = -span / 2, x1 = span / 2;
    A.add(H.bx(x0 - cw / 2, -fb / 2, x1 + cw / 2, fb / 2, 0, fd, SOL)); A.add(H.bx(x0 + cw / 2, -wt / 2, x1 - cw / 2, wt / 2, fd, zbm, "brick"));
    A.add(H.bx(x0 - cw / 2, -wt / 2, x0 + cw / 2, wt / 2, fd, zbm + pd + wh, SOL)); A.add(H.bx(x1 - cw / 2, -wt / 2, x1 + cw / 2, wt / 2, fd, zbm + pd + wh, SOL));
    A.add(H.bx(x0 + cw / 2, -wt / 2, x1 - cw / 2, wt / 2, zbm, zbm + pd, GH)); A.add(H.bx(x0 + cw / 2, -wt / 2, x1 - cw / 2, wt / 2, zbm + pd, zbm + pd + wh, "brick"));
    var yb3 = wt / 2 - cov - st.dia - bot.dia / 2, zb3 = zbm + cov + st.dia + bot.dia / 2, zt3 = zbm + pd - cov - st.dia - top.dia / 2;
    if (bot.n > 0) spread(-yb3, yb3, bot.n).forEach(function (y) { bar(A, H, [x0, y, zb3], [x1, y, zb3], bot.dia); });
    if (top.n > 0) spread(-(wt / 2 - cov - st.dia - top.dia / 2), wt / 2 - cov - st.dia - top.dia / 2, top.n).forEach(function (y) { bar(A, H, [x0, y, zt3], [x1, y, zt3], top.dia); });
    steps(x0 + cw / 2 + 50, x1 - cw / 2 - 50, st.s * 2, 40).forEach(function (x) { ringYZ(A, H, x, -(wt / 2 - cov - st.dia / 2), wt / 2 - cov - st.dia / 2, zbm + cov + st.dia / 2, zbm + pd - cov - st.dia / 2, st.dia); });
    return fin("Plinth beam " + Math.round(wt) + " × " + Math.round(pd) + " mm on wall footing, span " + (span / 1000).toFixed(2) + " m", A);
  });

  /* ============================== DOG-LEGGED STAIRCASE ============================== */
  reg("rcc_staircase", function (v, res, H) {
    var A = new Acc(), fl = nums(sm(res, "Flight")), Hf = num(v.floor_h, 3.2) * 1000, R = num(fl[1], num(v.riser, 160)), Tt = num(fl[2], num(v.tread, 280)), nr = Math.round(num(fl[0], Math.max(2, Math.round(Hf / 2 / R))));
    nr = Math.min(60, Math.max(2, nr)); var D = num(nums(sm(res, "Waist"))[0], num(v.waist, 200)), w = num(v.width, 1.2) * 1000, Lw = num(v.landing, 1.2) * 1000, gap = 100, cov = num(v.cover, 20), FL = 300;
    var mn = dS(sm(res, "Main bars")) || { dia: num(v.bar_dia, 12), s: num(v.bar_s, 150) }, ds = dS(sm(res, "Distribution")) || { dia: 8, s: mn.s };
    var Lf = (nr - 1) * Tt, len = Math.hypot(Tt, R), sn = R / len, cs = Tt / len, rise = nr * R, W2 = 2 * w + gap, yc = [-(w / 2 + gap / 2), w / 2 + gap / 2];
    /* floor stubs above and below + landing slab + two columns under the landing */
    A.add(H.bx(-1000, -W2 / 2, 0, W2 / 2, 0, FL, SOL)); A.add(H.bx(-1000, -W2 / 2, 0, W2 / 2, FL + 2 * rise - 250, FL + 2 * rise, SOL));
    A.add(H.bx(Lf, -W2 / 2, Lf + Lw, W2 / 2, FL + rise - D, FL + rise, GH));
    [-1, 1].forEach(function (s) { A.add(H.box(Lf + Lw - 115, s * (W2 / 2 - 115), 230, 230, 0, FL + rise - D, SOL)); });
    function flight(i, x0, zb, sg) {
      var y = yc[i];
      for (var k = 1; k <= nr - 1; k++) { var xa = x0 + sg * (k - 1) * Tt, xb = x0 + sg * k * Tt; A.add(H.bx(Math.min(xa, xb), y - w / 2, Math.max(xa, xb), y + w / 2, zb + (k - 1) * R, zb + k * R, SOL)); }
      /* waist slab: top line z = zb + u·R/T, thickness D measured square to the slope */
      var U = Lf + Tt;
      function P(u, off) { return [x0 + sg * (u - off * (-sn)), zb + u * R / Tt - off * cs]; }   /* point on the line, off = distance below the top face (square to the slope) */
      function Q(u, off) { var p = P(u, off); return [p[0], y, p[1]]; }
      A.add(H.member(Q(0, D / 2), Q(U, D / 2), w, D, GH));
      var o1 = D - cov - mn.dia / 2, o2 = o1 - mn.dia / 2 - ds.dia / 2;
      steps(y - w / 2 + cov, y + w / 2 - cov, mn.s, 14).forEach(function (yy) { var a = Q(0, o1), b = Q(U, o1); bar(A, H, [a[0], yy, a[2]], [b[0], yy, b[2]], mn.dia); });
      steps(0.1 * U, 0.95 * U, ds.s, 20).forEach(function (u) { var a = P(u, o2); bar(A, H, [a[0], y - w / 2 + cov, a[1]], [a[0], y + w / 2 - cov, a[1]], ds.dia); });
    }
    flight(0, 0, FL, 1); flight(1, Lf, FL + rise, -1);
    return fin("Dog-legged RCC staircase, " + nr + " risers × " + Math.round(R) + " mm per flight, tread " + Math.round(Tt) + " mm", A);
  });

  /* ============================== MULTI-STOREY RCC FRAME ============================== */
  reg("building_frame", function (v, res, H) {
    var A = new Acc(), nb = Math.min(12, Math.max(1, Math.round(num(v.bays, 3)))), bw = num(v.bay, 4.5) * 1000, st = Math.min(25, Math.max(1, Math.round(num(v.storeys, 4)))), hg = num(v.h_ground, 4.2) * 1000, ht = num(v.h_typical, 3.2) * 1000, fs = num(v.frame_spacing, 4) * 1000;
    var bb = num(v.beam_b, 300), bd = num(v.beam_D, 450), cb = num(v.col_b, 300), cd = num(v.col_D, 450), br = qrow(res, /beams/i), ts = br && br.depth > 0 ? Math.round(bd - br.depth * 1000) : 130; ts = ts >= 80 && ts <= 250 ? ts : 130;
    var X = nb * bw, zf = []; for (var i = 0; i < st; i++) zf.push(hg + i * ht); var ztop = zf[st - 1], fine = nb * st * 2 + (nb + 1) * st + (nb + 1) * 2 + st < 950, ys = [-fs / 2, fs / 2];
    ys.forEach(function (y) {
      for (var c = 0; c <= nb; c++) { var x = -X / 2 + c * bw; A.add(H.bx(x - cd / 2, y - cb / 2, x + cd / 2, y + cb / 2, 0, ztop, SOL)); }
      zf.forEach(function (z) {
        if (fine) for (var k = 0; k < nb; k++) { var xa = -X / 2 + k * bw + cd / 2, xb = -X / 2 + (k + 1) * bw - cd / 2; A.add(H.bx(xa, y - bb / 2, xb, y + bb / 2, z - bd, z - ts, SOL)); }
        else A.add(H.bx(-X / 2, y - bb / 2, X / 2, y + bb / 2, z - bd, z - ts, SOL));
      });
    });
    zf.forEach(function (z) {
      for (var c = 0; c <= nb; c++) { var x = -X / 2 + c * bw; A.add(H.bx(x - bb / 2, -fs / 2 + cb / 2, x + bb / 2, fs / 2 - cb / 2, z - bd, z - ts, SOL)); }
      A.add(H.bx(-X / 2 - cd / 2, -fs / 2 - cb / 2, X / 2 + cd / 2, fs / 2 + cb / 2, z - ts, z, SOL));
    });
    return fin("RCC frame, " + nb + " bays × " + st + " storeys (two frames " + (fs / 1000).toFixed(1) + " m apart; slab " + ts + " mm)", A);
  });

  /* ---------- abutment (shared by both bridges; the modules do not size it, so it is indicative) ---------- */
  function abutments(A, H, clear, W, Hab) {
    [-1, 1].forEach(function (s) {
      var xi = s * clear / 2, xo = s * (clear / 2 + 1000), xf0 = s * (clear / 2 - 300), xf1 = s * (clear / 2 + 2300);
      A.add(H.bx(Math.min(xf0, xf1), -W / 2 - 300, Math.max(xf0, xf1), W / 2 + 300, 0, 600, SOL));
      A.add(H.bx(Math.min(xi, xo), -W / 2, Math.max(xi, xo), W / 2, 600, Hab, SOL));
      [-1, 1].forEach(function (q) {
        var xa = s * (clear / 2 + 1000), xb = s * (clear / 2 + 4000), pts = [[xa, 600], [xb, 600], [xb, 1200], [xa, Hab]], y = q * (W / 2 - 200);
        pts.sort(function (p, r) { return 0; });
        A.all(H.wedge(pts, y - 200, y + 200, SOL, 220));
      });
    });
  }
  /* New-Jersey-type crash barrier as three stacked steps along x */
  function barrier(A, H, x0, x1, yc, w, z) {
    A.add(H.bx(x0, yc - w / 2, x1, yc + w / 2, z, z + 250, SOL)); A.add(H.bx(x0, yc - w * 0.38, x1, yc + w * 0.38, z + 250, z + 550, SOL)); A.add(H.bx(x0, yc - w * 0.26, x1, yc + w * 0.26, z + 550, z + 900, SOL));
  }

  /* ============================== RCC SOLID SLAB BRIDGE ============================== */
  reg("slab_bridge", function (v, res, H) {
    var A = new Acc(), clear = num(v.clear_span, 7) * 1000, cw = num(v.carriageway, 7.5) * 1000, bwd = num(v.barrier_w, 0.5) * 1000, wc = num(v.wc, 65);
    var dr = qrow(res, /deck slab/i), L = num(dr && dr.length * 1000, clear + 900), W = num(dr && dr.breadth * 1000, cw + 2 * bwd), D = num(nums(sm(res, "Slab"))[0], num(dr && dr.depth * 1000, num(v.D, 600))), Hab = 3500;
    abutments(A, H, clear, W, Hab);
    A.add(H.bx(-L / 2, -W / 2, L / 2, W / 2, Hab, Hab + D, SOL));
    A.add(H.bx(-L / 2, -cw / 2, L / 2, cw / 2, Hab + D, Hab + D + wc, "asphalt"));
    barrier(A, H, -L / 2, L / 2, -(cw / 2 + bwd / 2), bwd, Hab + D); barrier(A, H, -L / 2, L / 2, cw / 2 + bwd / 2, bwd, Hab + D);
    return fin("RCC solid-slab bridge " + (clear / 1000).toFixed(1) + " m clear span, deck " + Math.round(D) + " mm (abutments indicative)", A);
  });

  /* ============================== T-BEAM GIRDER BRIDGE ============================== */
  reg("tbeam_bridge", function (v, res, H) {
    var A = new Acc(), span = num(v.span, 16) * 1000, ng = Math.min(12, Math.max(2, Math.round(num(v.girders, 3)))), gs = num(v.spacing, 2.5) * 1000, cw = num(v.carriageway, 7.5) * 1000, bwd = num(v.barrier_w, 0.5) * 1000, dt = num(v.deck_t, 220), web = num(v.web, 350), cwb = num(v.cross_web, 250), ncg = Math.min(9, Math.max(0, Math.round(num(v.cross_girders, 3))));
    var dr = qrow(res, /deck slab/i), Lc = num(dr && dr.length * 1000, span + 600), W = num(dr && dr.breadth * 1000, cw + 2 * bwd), gm = /D\s*=\s*(\d+)/.exec(sm(res, "Girders")), Dg = num(gm && +gm[1], num(v.D, 1500)), Hab = 4000, brg = 56, zs = Hab + brg, zdt = zs + Dg, cov = num(v.cover, 40);
    var clear = Math.max(1000, span - 600);
    abutments(A, H, clear, W, Hab);
    A.add(H.bx(-Lc / 2, -W / 2, Lc / 2, W / 2, zdt - dt, zdt, GH));                                  /* deck slab */
    var ys = []; for (var g = 0; g < ng; g++) ys.push((g - (ng - 1) / 2) * gs);
    var mb = nD(sm(res, "Main steel")) || { n: num(v.n32, 12), dia: 32 };
    ys.forEach(function (y) {
      A.add(H.bx(-Lc / 2, y - web / 2, Lc / 2, y + web / 2, zs, zdt - dt, GH));                       /* girder web */
      [-1, 1].forEach(function (s) { A.add(H.bx(s * (span / 2) - 125, y - 200, s * (span / 2) + 125, y + 200, Hab, zs, "steel_member")); });   /* elastomeric bearings */
      /* main bars: layers of up to 3 across the web, 25 mm between layers */
      var perL = Math.max(1, Math.min(4, Math.floor((web - 2 * (cov + 12) + 40) / (mb.dia + 40)))), rows = Math.ceil(mb.n / perL), left = mb.n;
      for (var r = 0; r < rows; r++) { var k = Math.min(perL, left), yw = (web - 2 * (cov + 12) - mb.dia) / 2, zr = zs + cov + 12 + mb.dia / 2 + r * (mb.dia + 25); left -= k; spread(-yw, yw, k).forEach(function (yy) { bar(A, H, [-Lc / 2 + cov, y + (k === 1 ? 0 : yy), zr], [Lc / 2 - cov, y + (k === 1 ? 0 : yy), zr], mb.dia); }); }
    });
    /* cross girders between the girders (depth below the deck as in the quantity row) */
    var cr = qrow(res, /cross girder/i), cd = num(cr && cr.depth * 1000, Dg - dt - 300);
    for (var c = 0; c < ncg; c++) { var x = ncg === 1 ? 0 : -span / 2 + c * span / (ncg - 1); for (var q = 0; q + 1 < ng; q++) A.add(H.bx(x - cwb / 2, ys[q] + web / 2, x + cwb / 2, ys[q + 1] - web / 2, zdt - dt - cd, zdt - dt, GH)); }
    A.add(H.bx(-Lc / 2, -cw / 2, Lc / 2, cw / 2, zdt, zdt + 65, "asphalt"));
    barrier(A, H, -Lc / 2, Lc / 2, -(cw / 2 + bwd / 2), bwd, zdt); barrier(A, H, -Lc / 2, Lc / 2, cw / 2 + bwd / 2, bwd, zdt);
    return fin("RCC T-beam girder bridge, " + (span / 1000).toFixed(1) + " m span, " + ng + " girders D = " + Math.round(Dg) + " mm (abutments indicative)", A);
  });
})();
