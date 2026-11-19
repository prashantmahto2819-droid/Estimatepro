/* Estimate Pro — roads, earthwork and culverts (Phase F).
   road    { t:"road", pts: [[x,y,bulge]…] centre line (mm), name, ch0 (chainage at start, mm), iv (section interval, mm),
             ngl: [[ch, RL]…] ground levels at the centre line (mm), xf: ground cross slope % (+ = ground rises to the left),
             prof: [[ch, RL]…] design road level at the crown (mm; linear grades between the points),
             tpl: { cw, sh, camber %, shs %, cut (H per 1 V), fill (H per 1 V), layers: [{ n, k, th, w }] } }
   culvert { t:"culvert", road: id, ch (mm), kind: "pipe" | "box", dia, rows, span, ht, th (box walls), cush (min. cushion), inv (invert RL, optional) }
   Cross-section: the pavement box (crown, camber, shoulders) sits on the formation (= surface − total pavement thickness);
   side slopes start at the formation edge — fill slopes go down to the ground, cut slopes go up to the ground (catch points).
   Areas are exact for the straight-line ground of each section; volumes by the average end area method between sections.
   Chainages and levels are in mm inside the drawing (shown in m). Straight segments; arcs in a polyline are split into 2 m chords. */
(function () {
  "use strict";
  var EP = window.EP, B = EP.bim, G = EP.geom;
  B.EXT = B.EXT || {};
  B.TYPES.road = 1; B.TYPES.culvert = 1;
  B.ROAD_LAYERS = { bc: "Bituminous concrete (BC)", dbm: "Dense bituminous macadam (DBM)", wmm: "Wet mix macadam (WMM)", gsb: "Granular sub-base (GSB)", pqc: "Cement concrete pavement (PQC)", dlc: "Dry lean concrete (DLC)", earth: "Earth / murrum layer" };
  B.ROAD_TPL = function () { return { cw: 7000, sh: 1500, camber: 2.5, shs: 4, cut: 1, fill: 2, layers: [{ n: "BC", k: "bc", th: 40, w: 7000 }, { n: "DBM", k: "dbm", th: 50, w: 7000 }, { n: "WMM", k: "wmm", th: 250, w: 7600 }, { n: "GSB", k: "gsb", th: 200, w: 10000 }] }; };
  B.PIPES = [600, 1000, 1200, 1500];
  function tpl(e) { var t = Object.assign(B.ROAD_TPL(), e.tpl || {}); if (!t.layers) t.layers = B.ROAD_TPL().layers; return t; }
  B.roadTpl = tpl;
  B.roadT = function (e) { return tpl(e).layers.reduce(function (s, l) { return s + (+l.th || 0); }, 0); };

  /* ---------- alignment ---------- */
  var acache = new WeakMap();
  B.roadAlign = function (e) {
    var c = acache.get(e); if (c) return c;
    var P = [], src = e.pts || [];
    for (var i = 0; i < src.length; i++) {
      var a = src[i]; P.push([a[0], a[1]]);
      if (a[2] && i + 1 < src.length) { var A = G.bulgeArc(a, src[i + 1], a[2]), sweep = 4 * Math.atan(Math.abs(a[2])), len = Math.abs(sweep) * A.r, n = Math.max(2, Math.ceil(len / 2000)); var s0 = Math.atan2(a[1] - A.c[1], a[0] - A.c[0]), dir = a[2] > 0 ? 1 : -1; for (var k = 1; k < n; k++) P.push(G.polar(A.c, A.r, s0 + dir * sweep * k / n)); }
    }
    var S = [0]; for (var j = 1; j < P.length; j++) S.push(S[j - 1] + G.dist(P[j - 1], P[j]));
    c = { P: P, S: S, L: S[S.length - 1] || 0 }; acache.set(e, c); return c;
  };
  /* point, tangent and left normal at distance s along the centre line (bisector normal at bends, scaled to keep offsets parallel) */
  B.roadAt = function (e, s) {
    var A = B.roadAlign(e), P = A.P, S = A.S; if (P.length < 2) return { p: P[0] || [0, 0], u: [1, 0], n: [0, 1], k: 1 };
    s = Math.max(0, Math.min(A.L, s)); var i = 0; while (i < S.length - 2 && S[i + 1] < s) i++;
    var u = G.norm(G.sub(P[i + 1], P[i])), t = (s - S[i]) / ((S[i + 1] - S[i]) || 1), p = G.lerp(P[i], P[i + 1], t), n = G.perp(u), k = 1;
    var at = function (j) { var u1 = G.norm(G.sub(P[j], P[j - 1])), u2 = G.norm(G.sub(P[j + 1], P[j])), nn = G.norm(G.add(G.perp(u1), G.perp(u2))), cs = G.dot(nn, G.perp(u2)); return { n: nn, k: cs > 0.2 ? 1 / cs : 5 }; };
    if (Math.abs(s - S[i]) < 1e-6 && i > 0) { var r = at(i); n = r.n; k = r.k; } else if (Math.abs(s - S[i + 1]) < 1e-6 && i + 1 < P.length - 1) { var r2 = at(i + 1); n = r2.n; k = r2.k; }
    return { p: p, u: u, n: n, k: k };
  };
  function interp(T, x, def) { if (!T || !T.length) return def; if (x <= T[0][0]) return T[0][1]; for (var i = 1; i < T.length; i++) if (x <= T[i][0]) { var a = T[i - 1], b = T[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / ((b[0] - a[0]) || 1); } return T[T.length - 1][1]; }
  function sorted(T) { return (T || []).filter(function (r) { return r && isFinite(r[0]) && isFinite(r[1]); }).slice().sort(function (a, b) { return a[0] - b[0]; }); }
  B.roadNGL = function (e, ch) { return interp(sorted(e.ngl), ch, 100000); };
  B.roadFRL = function (e, ch) { var p = sorted(e.prof); return p.length ? interp(p, ch, 0) : B.roadNGL(e, ch) + 600; };

  /* ---------- one cross-section ---------- */
  B.roadSection = function (e, ch) {
    var t = tpl(e), T = B.roadT(e), W = t.cw + 2 * t.sh, zc = B.roadFRL(e, ch), ng = B.roadNGL(e, ch), xf = (+e.xf || 0) / 100;
    var zcw = zc - t.camber / 100 * t.cw / 2, zsh = zcw - t.shs / 100 * t.sh, g = function (x) { return ng + xf * x; };   // x > 0 = left of the direction of travel
    var side = function (s) {   // s = +1 left, −1 right
      var xe = s * W / 2, ze = zsh - T, ge = g(xe), fill = ze >= ge, tt, den;
      if (fill) { den = 1 / t.fill + xf * s; tt = den > 1e-6 ? (ze - ge) / den : 50000; } else { den = 1 / t.cut - xf * s; tt = den > 1e-6 ? (ge - ze) / den : 50000; }
      tt = Math.min(Math.max(tt, 0), 50000); var xc = s * (W / 2 + tt); return { fill: fill, xe: xe, ze: ze, xc: xc, zc: fill ? ze - tt / t.fill : ze + tt / t.cut, w: tt };
    };
    var L = side(1), R = side(-1);
    // earthwork boundary (formation + side slopes), x ascending (right → left)
    var D = [[R.xc, R.zc], [R.xe, R.ze], [-t.cw / 2, zcw - T], [0, zc - T], [t.cw / 2, zcw - T], [L.xe, L.ze], [L.xc, L.zc]], cut = 0, fill = 0;
    for (var i = 0; i + 1 < D.length; i++) {
      var x0 = D[i][0], x1 = D[i + 1][0], d0 = D[i][1] - g(x0), d1 = D[i + 1][1] - g(x1), w = x1 - x0; if (w <= 0) continue;
      if (d0 >= 0 && d1 >= 0) fill += (d0 + d1) / 2 * w; else if (d0 <= 0 && d1 <= 0) cut -= (d0 + d1) / 2 * w;
      else { var xz = w * d0 / (d0 - d1), a1 = d0 / 2 * xz, a2 = d1 / 2 * (w - xz); if (d0 > 0) { fill += a1; cut -= a2; } else { cut -= a1; fill += a2; } }
    }
    var surf = [[-W / 2, zsh], [-t.cw / 2, zcw], [0, zc], [t.cw / 2, zcw], [W / 2, zsh]];
    return { ch: ch, ngl: ng, frl: zc, T: T, W: W, cw: t.cw, L: L, R: R, D: D, surf: surf, g: g, cutA: cut, fillA: fill, xf: xf };
  };
  /* stations: start, every interval, every level point, end */
  B.roadStations = function (e, step) {
    var A = B.roadAlign(e), ch0 = e.ch0 || 0, ch1 = ch0 + A.L, iv = step || e.iv || 20000, out = [ch0];
    for (var c = Math.ceil((ch0 + 1) / iv) * iv; c < ch1 - 1; c += iv) out.push(c);
    sorted(e.ngl).concat(sorted(e.prof)).forEach(function (r) { if (r[0] > ch0 + 1 && r[0] < ch1 - 1) out.push(r[0]); });
    if (!step) A.S.forEach(function (s) { var c2 = ch0 + s; if (c2 > ch0 + 1 && c2 < ch1 - 1) out.push(c2); });
    out.push(ch1); out.sort(function (a, b) { return a - b; });
    return out.filter(function (c, i) { return i === 0 || c - out[i - 1] > 1; });
  };
  /* earthwork table (average end areas) */
  B.roadTable = function (e) {
    var st = B.roadStations(e), rows = [], cum = 0, cv = 0, fv = 0, prev = null;
    st.forEach(function (ch) {
      var S = B.roadSection(e, ch), r = { ch: ch, ngl: S.ngl, frl: S.frl, form: S.frl - S.T, cutA: S.cutA, fillA: S.fillA, cutV: 0, fillV: 0, wL: S.L.xc, wR: -S.R.xc, sec: S };
      if (prev) { var dl = ch - prev.ch; r.cutV = (prev.cutA + S.cutA) / 2 * dl; r.fillV = (prev.fillA + S.fillA) / 2 * dl; r.dl = dl; }
      cv += r.cutV; fv += r.fillV; cum += r.cutV - r.fillV; r.mass = cum; rows.push(r); prev = r;
    });
    return { rows: rows, cut: cv, fill: fv, L: B.roadAlign(e).L };
  };
  function chTxt(ch) { var m = ch / 1000, km = Math.floor(m / 1000 + 1e-9), r = m - km * 1000; return km + "+" + (r < 100 ? (r < 10 ? "00" : "0") : "") + r.toFixed(Math.abs(r - Math.round(r)) > 1e-6 ? 2 : 0); }
  B.chTxt = chTxt;
  function pt(e, ch, x) { var a = B.roadAt(e, ch - (e.ch0 || 0)); return G.add(a.p, G.mul(a.n, x * a.k)); }
  B.roadPt = pt;

  /* ---------- road: plan, labels, quantities, 3D ---------- */
  B.EXT.road = {
    plan: function (doc, e) {
      var out = { segs: [], fill: [], dashed: [] }, A = B.roadAlign(e); if (A.P.length < 2) return out;
      var t = tpl(e), W = t.cw + 2 * t.sh, ch0 = e.ch0 || 0, chs = B.roadStations(e), line = function (xFn, arr) { for (var i = 0; i + 1 < chs.length; i++) arr.push({ k: "L", a: pt(e, chs[i], xFn(chs[i], 0)), b: pt(e, chs[i + 1], xFn(chs[i + 1], 1)) }); };
      for (var i = 0; i + 1 < A.P.length; i++) out.dashed.push({ k: "L", a: A.P[i], b: A.P[i + 1] });
      [t.cw / 2, -t.cw / 2, W / 2, -W / 2].forEach(function (x) { line(function () { return x; }, out.segs); });
      var secs = {}; chs.forEach(function (c) { secs[c] = B.roadSection(e, c); });
      line(function (c) { return secs[c].L.xc; }, out.dashed); line(function (c) { return secs[c].R.xc; }, out.dashed);
      var iv = e.iv || 20000; chs.forEach(function (c) { if (Math.abs(c / iv - Math.round(c / iv)) < 1e-6 || c === chs[0] || c === chs[chs.length - 1]) out.segs.push({ k: "L", a: pt(e, c, W / 2 + 1000), b: pt(e, c, -W / 2 - 1000) }); });
      var poly = chs.map(function (c) { return pt(e, c, t.cw / 2); }).concat(chs.slice().reverse().map(function (c) { return pt(e, c, -t.cw / 2); }));
      out.fill.push({ pts: poly, col: "rgba(70,70,78,.35)" });
      return out;
    },
    labels: function (doc, e, h) {
      var t = tpl(e), W = t.cw + 2 * t.sh, iv = e.iv || 20000, chs = B.roadStations(e), out = [];
      chs.forEach(function (c, i) { if (!(Math.abs(c / iv - Math.round(c / iv)) < 1e-6 || i === 0 || i === chs.length - 1)) return; var a = B.roadAt(e, c - (e.ch0 || 0)), p = G.add(a.p, G.mul(a.n, (W / 2 + 1500 + h) * a.k)), ang = Math.atan2(a.n[1], a.n[0]) * 180 / Math.PI; out.push({ p: p, s: chTxt(c), h: h, rot: ang, al: "ml" }); });
      if (e.name) { var m = B.roadAt(e, B.roadAlign(e).L / 2); out.push({ p: G.add(m.p, G.mul(m.n, -(W / 2 + 2 * h))), s: e.name, h: h * 1.3, rot: Math.atan2(m.u[1], m.u[0]) * 180 / Math.PI, al: "tc" }); }
      return out;
    },
    xform: function (e, M) { var o = JSON.parse(JSON.stringify(e)); o.pts = e.pts.map(function (p) { var q = G.mApply(M, p); return [q[0], q[1], p[2] || 0]; }); return o; },
    qty: function (doc, e) {
      var rows = [], push = function (k, dim, v, label, f) { if (v > 1e-9) rows.push({ k: k, dim: dim, v: v, label: label, f: f || "", z: "road" }); };
      var tb = B.roadTable(e), t = tpl(e), L = tb.L, nm = e.name ? " — " + e.name : "", W = t.cw + 2 * t.sh, m = function (v) { return (v / 1000).toFixed(3); };
      var clr = 0; tb.rows.forEach(function (r, i) { if (i) { var p = tb.rows[i - 1]; clr += ((p.wL + p.wR) + (r.wL + r.wR)) / 2 * r.dl; } });
      push("road_clear", "A", clr, "Clearing and grubbing road land" + nm, "width between catch points × length (" + m(L) + " m)");
      push("road_cut", "V", tb.cut, "Excavation for roadway (cutting)" + nm, "average end areas, " + tb.rows.length + " sections");
      push("road_fill", "V", tb.fill, "Embankment (filling)" + nm, "average end areas, " + tb.rows.length + " sections");
      var gsb = t.layers.filter(function (l) { return l.k === "gsb"; })[0], T = B.roadT(e), shTh = T - (gsb && (+gsb.w || 0) >= W - 1 ? +gsb.th : 0);
      push("road_shoulder", "V", 2 * t.sh * shTh * L, "Earthen shoulders" + nm, "2 × " + m(t.sh) + " × " + m(shTh) + " × " + m(L));
      var bit = t.layers.filter(function (l) { return l.k === "bc" || l.k === "dbm"; });
      t.layers.forEach(function (l) { push("road_" + l.k, "V", (+l.w || t.cw) * (+l.th || 0) * L, (B.ROAD_LAYERS[l.k] || l.n) + " " + Math.round(l.th) + " mm" + nm, m(+l.w || t.cw) + " × " + m(l.th) + " × " + m(L)); });
      var wmm = t.layers.filter(function (l) { return l.k === "wmm"; })[0]; if (wmm && bit.length) { var lowest = bit[bit.length - 1]; push("road_prime", "A", (+lowest.w || t.cw) * L, "Prime coat on WMM" + nm, m(+lowest.w || t.cw) + " × " + m(L)); }
      if (bit.length > 1) push("road_tack", "A", (+bit[0].w || t.cw) * L, "Tack coat between bituminous layers" + nm, m(+bit[0].w || t.cw) + " × " + m(L));
      return rows;
    },
    mesh: function (M, doc, e, H) {
      var t = tpl(e), A = B.roadAlign(e); if (A.P.length < 2) return;
      var ch0 = e.ch0 || 0, st = B.roadStations(e, 5000), K = 0.001, d = doc.d;
      var lk = { road: H.look("road_surface", e.look, e.col), sh: H.look("road_shoulder"), fill: H.look("road_fill"), cut: H.look("road_cut"), gr: H.look("ground"), mark: B.look("paint_white") };
      var secs = st.map(function (c) {
        var S = B.roadSection(e, c), farL = S.L.xc + 15000, farR = S.R.xc - 15000;
        var X = [[farR, S.g(farR)], [S.R.xc, S.R.zc], [S.R.xe, S.R.ze], [S.surf[0][0], S.surf[0][1]], S.surf[1], S.surf[2], S.surf[3], [S.surf[4][0], S.surf[4][1]], [S.L.xe, S.L.ze], [S.L.xc, S.L.zc], [farL, S.g(farL)]];
        return { c: c, S: S, P: X.map(function (q) { var p = pt(e, c, q[0]); return [p[0] * K, p[1] * K, q[1] * K]; }) };
      });
      for (var i = 0; i + 1 < secs.length; i++) {
        var a = secs[i], b = secs[i + 1];
        for (var j = 0; j + 1 < a.P.length; j++) {
          var col = j === 0 || j === 9 ? lk.gr : j === 1 ? (a.S.R.fill ? lk.fill : lk.cut) : j === 8 ? (a.S.L.fill ? lk.fill : lk.cut) : j === 2 || j === 7 ? lk.cut : j === 3 || j === 6 ? lk.sh : lk.road;
          M.quad(a.P[j], b.P[j], b.P[j + 1], a.P[j + 1], col);
        }
        [4, 6, 1, 9].forEach(function (j) { M.edge(a.P[j], b.P[j]); });
      }
      // centre line dashes (3 m paint, 3 m gap)
      for (var s = 1500; s + 3000 < A.L; s += 6000) { var p0 = B.roadAt(e, s), p1 = B.roadAt(e, s + 3000), z0 = B.roadFRL(e, ch0 + s) + 6, z1 = B.roadFRL(e, ch0 + s + 3000) + 6, w = 75; M.quad([(p0.p[0] - p0.n[0] * w) * K, (p0.p[1] - p0.n[1] * w) * K, z0 * K], [(p1.p[0] - p1.n[0] * w) * K, (p1.p[1] - p1.n[1] * w) * K, z1 * K], [(p1.p[0] + p1.n[0] * w) * K, (p1.p[1] + p1.n[1] * w) * K, z1 * K], [(p0.p[0] + p0.n[0] * w) * K, (p0.p[1] + p0.n[1] * w) * K, z0 * K], lk.mark); }
      H.noGround = true;
    }
  };

  /* ---------- culvert ---------- */
  function cGeom(doc, e) {
    var rd = doc.get(e.road); if (!rd || rd.t !== "road") return null;
    var S = B.roadSection(rd, e.ch), pipe = e.kind !== "box", rows = Math.max(1, Math.round(e.rows || 1)), D = +e.dia || 1000, tw = pipe ? Math.max(75, Math.round(D / 12)) : (+e.th || 250);
    var outW = pipe ? D + 2 * tw : (+e.span || 2000) + 2 * tw, outH = pipe ? D + 2 * tw : (+e.ht || 1500) + 2 * tw, gap = pipe ? Math.max(300, D / 2) : 0, width = rows * outW + (rows - 1) * gap;
    var formC = S.frl - S.T, inv = e.inv != null ? +e.inv : S.ngl, top = inv - tw + outH, cush = formC - top, len = S.L.xc - S.R.xc + 1000;
    var a = B.roadAt(rd, e.ch - (rd.ch0 || 0)), sk = (e.skew || 0) * Math.PI / 180, n = [a.n[0] * Math.cos(sk) - a.n[1] * Math.sin(sk), a.n[0] * Math.sin(sk) + a.n[1] * Math.cos(sk)], u = G.perp(n);
    var mid = (S.L.xc + S.R.xc) / 2, c = G.add(a.p, G.mul(a.n, mid * a.k));
    return { rd: rd, S: S, pipe: pipe, rows: rows, D: D, tw: tw, outW: outW, outH: outH, gap: gap, width: width, inv: inv, bot: inv - tw, top: top, cush: cush, len: len, n: n, u: u, c: c };
  }
  B.culvertGeom = cGeom;
  B.EXT.culvert = {
    plan: function (doc, e) {
      var out = { segs: [], fill: [], dashed: [] }, g = cGeom(doc, e); if (!g) return out; var L2 = g.len / 2;
      for (var r = 0; r < g.rows; r++) {
        var off = -g.width / 2 + g.outW / 2 + r * (g.outW + g.gap), cc = G.add(g.c, G.mul(g.u, off)), hw = (g.pipe ? g.D : g.outW - 2 * g.tw) / 2, ho = g.outW / 2;
        [hw, -hw].forEach(function (s) { out.dashed.push({ k: "L", a: G.add(G.add(cc, G.mul(g.u, s)), G.mul(g.n, -L2)), b: G.add(G.add(cc, G.mul(g.u, s)), G.mul(g.n, L2)) }); });
        [ho, -ho].forEach(function (s) { out.segs.push({ k: "L", a: G.add(G.add(cc, G.mul(g.u, s)), G.mul(g.n, -L2)), b: G.add(G.add(cc, G.mul(g.u, s)), G.mul(g.n, L2)) }); });
      }
      var hwW = g.width / 2 + 450;[-1, 1].forEach(function (s) { var p = G.add(g.c, G.mul(g.n, s * L2)), q = G.add(g.c, G.mul(g.n, s * (L2 + 450))); out.segs.push({ k: "L", a: G.add(p, G.mul(g.u, -hwW)), b: G.add(p, G.mul(g.u, hwW)) }, { k: "L", a: G.add(q, G.mul(g.u, -hwW)), b: G.add(q, G.mul(g.u, hwW)) }, { k: "L", a: G.add(p, G.mul(g.u, -hwW)), b: G.add(q, G.mul(g.u, -hwW)) }, { k: "L", a: G.add(p, G.mul(g.u, hwW)), b: G.add(q, G.mul(g.u, hwW)) }); });
      return out;
    },
    labels: function (doc, e, h) { var g = cGeom(doc, e); if (!g) return []; return [{ p: G.add(g.c, G.mul(g.n, g.len / 2 + 450 + h * 1.5)), s: (g.pipe ? g.rows + " × " + g.D + " NP4 pipe" : g.rows + " × box " + (e.span || 2000) + "×" + (e.ht || 1500)) + " @ " + chTxt(e.ch), h: h, rot: Math.atan2(g.u[1], g.u[0]) * 180 / Math.PI, al: "bc" }]; },
    xform: function (e, M) { var o = JSON.parse(JSON.stringify(e)), doc = B.ctx.doc, g = doc && cGeom(doc, e); if (!g) return o; var np = G.mApply(M, g.c), best = B.roadChAt(g.rd, np); if (best) o.ch = best.ch; return o; },
    qty: function (doc, e) {
      var rows = [], g = cGeom(doc, e), push = function (k, dim, v, label, f) { if (v > 1e-9) rows.push({ k: k, dim: dim, v: v, label: label, f: f || "", z: "road" }); }; if (!g) return rows;
      var m = function (v) { return (v / 1000).toFixed(3); }, at = " at " + chTxt(e.ch), dep = Math.max(0, g.S.ngl - (g.bot - 150)), tw = g.width + 2 * 300;
      push("culv_exc", "V", tw * dep * g.len, "Excavation for culvert" + at, m(tw) + " × " + m(dep) + " × " + m(g.len));
      if (g.pipe) {
        var key = "pipe" + (g.rows === 2 ? 2 : 1) + "_" + g.D, lenP = g.rows === 2 ? g.len : g.len * g.rows;
        push(key, "L", lenP, "NP4 RCC pipe " + g.D + " mm, " + (g.rows === 2 ? "double row" : g.rows + " row(s)") + at, (g.rows === 2 ? "" : g.rows + " × ") + m(g.len) + " m");
        var hwW = g.width + 900, hwH = g.outH + 300, hwV = 2 * (hwW * hwH * 450 + (hwW + 300) * 750 * 300);
        push("culv_pcc", "V", hwV, "PCC M15 head walls + foundations" + at, "2 × (" + m(hwW) + " × " + m(hwH) + " × 0.45 + " + m(hwW + 300) + " × 0.75 × 0.30)");
      } else {
        var sec = g.outW * g.outH - (g.outW - 2 * g.tw) * (g.outH - 2 * g.tw), V = sec * g.len * g.rows;
        push("culv_rcc", "V", V, "RCC box culvert M25" + at, g.rows + " × (" + m(g.outW) + " × " + m(g.outH) + " − " + m(g.outW - 2 * g.tw) + " × " + m(g.outH - 2 * g.tw) + ") × " + m(g.len));
        push("culv_pcc", "V", (g.width + 300) * 150 * g.len, "PCC M15 bed under box" + at, m(g.width + 300) + " × 0.150 × " + m(g.len));
        push("culv_steel", "M", V / 1e9 * (+e.steel || 110), "Reinforcement — box culvert (thumb rule " + (+e.steel || 110) + " kg/m³)" + at, "");
      }
      return rows;
    },
    mesh: function (M, doc, e, H) {
      var g = cGeom(doc, e); if (!g) return; var K = 0.001, conc = H.look("found"), L2 = g.len / 2, V3 = function (p, z) { return [p[0] * K, p[1] * K, z * K]; };
      for (var r = 0; r < g.rows; r++) {
        var off = -g.width / 2 + g.outW / 2 + r * (g.outW + g.gap), cc = G.add(g.c, G.mul(g.u, off)), a = G.add(cc, G.mul(g.n, -L2)), b = G.add(cc, G.mul(g.n, L2));
        if (g.pipe) { var R = g.outW / 2, Ri = g.D / 2, zc = g.bot + R, N = 20; for (var k = 0; k < N; k++) { var t0 = k / N * 2 * Math.PI, t1 = (k + 1) / N * 2 * Math.PI, ring = function (rad, t, p) { return V3(G.add(p, G.mul(g.u, Math.cos(t) * rad)), zc + Math.sin(t) * rad); }; M.quad(ring(R, t0, a), ring(R, t1, a), ring(R, t1, b), ring(R, t0, b), conc); M.quad(ring(Ri, t1, a), ring(Ri, t0, a), ring(Ri, t0, b), ring(Ri, t1, b), conc); M.quad(ring(Ri, t0, a), ring(Ri, t1, a), ring(R, t1, a), ring(R, t0, a), conc); M.quad(ring(R, t0, b), ring(R, t1, b), ring(Ri, t1, b), ring(Ri, t0, b), conc); } }
        else { var hw = g.outW / 2, iw = hw - g.tw, z0 = g.bot, z1 = g.bot + g.outH; [[-hw, -iw, z0, z1], [iw, hw, z0, z1], [-iw, iw, z0, z0 + g.tw], [-iw, iw, z1 - g.tw, z1]].forEach(function (q) { H.prism(M, [G.add(a, G.mul(g.u, q[0])), G.add(a, G.mul(g.u, q[1])), G.add(b, G.mul(g.u, q[1])), G.add(b, G.mul(g.u, q[0]))], q[2], q[3], conc); }); }
      }
      if (g.pipe) [-1, 1].forEach(function (s) { var p = G.add(g.c, G.mul(g.n, s * (L2 + 225))); H.box(M, p, g.width + 900, 450, Math.atan2(g.u[1], g.u[0]) * 180 / Math.PI, g.bot - 300, g.bot + g.outH + 300, conc); });
    }
  };
  /* nearest chainage on a road to a plan point */
  B.roadChAt = function (rd, p) {
    var A = B.roadAlign(rd), best = null;
    for (var i = 0; i + 1 < A.P.length; i++) { var a = A.P[i], b = A.P[i + 1], ab = G.sub(b, a), l2 = G.dot(ab, ab) || 1, t = Math.max(0, Math.min(1, G.dot(G.sub(p, a), ab) / l2)), q = G.add(a, G.mul(ab, t)), dd = G.dist(p, q); if (!best || dd < best.d) best = { d: dd, ch: (rd.ch0 || 0) + A.S[i] + t * Math.sqrt(l2), off: G.cross(ab, G.sub(p, a)) / Math.sqrt(l2) }; }
    return best;
  };

  /* ---------- drawings: longitudinal section and cross-sections as CAD entities ---------- */
  /* L-section: horizontal 1:1, vertical × vx; datum below the lowest level; table rows below the graph */
  B.roadLsec = function (doc, e, org, o) {
    o = o || {}; var vx = o.vx || 10, h = o.h || 2500, tb = B.roadTable(e), rows = tb.rows, out = [], lay = o.layer || "R-LSEC";
    var zmin = Math.min.apply(null, rows.map(function (r) { return Math.min(r.ngl, r.form); })), datum = Math.floor((zmin - 1000) / 1000) * 1000, ch0 = rows[0].ch, zmx = Math.max.apply(null, rows.map(function (r) { return Math.max(r.ngl, r.frl); }));
    if (o.topY != null) org = [org[0], o.topY - (zmx - datum) * vx - 4 * h];
    var X = function (ch) { return org[0] + (ch - ch0); }, Y = function (z) { return org[1] + (z - datum) * vx; };
    var add = function (x) { x.layer = lay; out.push(x); };
    add({ t: "pline", pts: rows.map(function (r) { return [X(r.ch), Y(r.ngl), 0]; }), closed: false, color: 3 });
    add({ t: "pline", pts: rows.map(function (r) { return [X(r.ch), Y(r.frl), 0]; }), closed: false, color: 1 });
    add({ t: "pline", pts: rows.map(function (r) { return [X(r.ch), Y(r.form), 0]; }), closed: false, color: 5 });
    var x0 = X(ch0), x1 = X(rows[rows.length - 1].ch), yTop = Math.max.apply(null, rows.map(function (r) { return Y(Math.max(r.frl, r.ngl)); })) + 2 * h;
    add({ t: "line", a: [x0, org[1]], b: [x1, org[1]] }); add({ t: "text", p: [x0 - h, org[1]], s: "Datum RL " + (datum / 1000).toFixed(3) + " m", h: h, al: "mr" });
    add({ t: "text", p: [x0, yTop + h], s: "LONGITUDINAL SECTION — " + (e.name || "Road") + "   (H 1:1 drawing units, V × " + vx + ")", h: h * 1.4, al: "bl" });
    add({ t: "text", p: [x1, yTop], s: "— Ground (NGL)   — Road level (FRL)   — Formation", h: h * 0.8, al: "br" });
    var lab = [["Chainage", function (r) { return chTxt(r.ch); }], ["Ground level", function (r) { return (r.ngl / 1000).toFixed(3); }], ["Road level", function (r) { return (r.frl / 1000).toFixed(3); }], ["Formation", function (r) { return (r.form / 1000).toFixed(3); }], ["Cut / fill (m)", function (r) { var d = (r.form - r.ngl) / 1000; return (d >= 0 ? "F " : "C ") + Math.abs(d).toFixed(2); }]], rh = h * 2.4;
    lab.forEach(function (L, i) { var y = org[1] - (i + 1) * rh; add({ t: "line", a: [x0, y], b: [x1, y] }); add({ t: "text", p: [x0 - h, y + rh / 2], s: L[0], h: h, al: "mr" }); rows.forEach(function (r) { add({ t: "text", p: [X(r.ch), y + rh / 2], s: L[1](r), h: h * 0.75, rot: 90, al: "mc" }); }); });
    rows.forEach(function (r) { add({ t: "line", a: [X(r.ch), org[1] - lab.length * rh], b: [X(r.ch), Y(Math.max(r.ngl, r.frl))], lt: "DASHED" }); });
    return out;
  };
  /* cross-sections in a grid (scale 1:1, no exaggeration) */
  B.roadXsecs = function (doc, e, org, o) {
    o = o || {}; var h = o.h || 250, tb = B.roadTable(e), out = [], lay = o.layer || "R-XSEC", cols = o.cols || 4, add = function (x) { x.layer = lay; out.push(x); };
    var wMax = Math.max.apply(null, tb.rows.map(function (r) { return r.wL + r.wR; })) + 8000, hMax = Math.max.apply(null, tb.rows.map(function (r) { var S = r.sec; return Math.max(S.frl, S.L.zc, S.R.zc, S.ngl) - Math.min(S.frl - S.T, S.L.zc, S.R.zc, S.ngl - 1000); })) + 10 * h;
    if (o.topY != null) org = [org[0], o.topY - hMax];
    tb.rows.forEach(function (r, i) {
      var S = r.sec, cx = org[0] + (i % cols) * wMax + wMax / 2, base = org[1] - Math.floor(i / cols) * hMax, zLo = Math.min(S.frl - S.T, S.L.zc, S.R.zc, S.ngl) - 500, P = function (x, z) { return [cx - x, base + (z - zLo)]; };   // left of travel drawn on the left
      var gx0 = S.R.xc - 3000, gx1 = S.L.xc + 3000;
      add({ t: "line", a: P(gx0, S.g(gx0)), b: P(gx1, S.g(gx1)), color: 3 });
      add({ t: "pline", pts: S.D.map(function (q) { return P(q[0], q[1]).concat([0]); }), closed: false, color: 5 });
      add({ t: "pline", pts: [[S.R.xe, S.R.ze]].concat(S.surf).concat([[S.L.xe, S.L.ze]]).map(function (q) { return P(q[0], q[1]).concat([0]); }), closed: false, color: 1 });
      add({ t: "line", a: P(0, zLo), b: P(0, S.frl + 1500), lt: "CENTER" });
      add({ t: "text", p: P(0, S.frl + 1500 + h), s: "Ch " + chTxt(r.ch) + "   FRL " + (S.frl / 1000).toFixed(3) + "   NGL " + (S.ngl / 1000).toFixed(3), h: h, al: "bc" });
      add({ t: "text", p: P(0, zLo - h * 1.5), s: "Cut " + (S.cutA / 1e6).toFixed(3) + " m²   Fill " + (S.fillA / 1e6).toFixed(3) + " m²", h: h * 0.9, al: "tc" });
    });
    return out;
  };
})();
