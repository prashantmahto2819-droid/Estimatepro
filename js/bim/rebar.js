/* Estimate Pro BIM — reinforcement bars in the model (columns, beams, footings, slabs).
   One source for three things: the 3D bars, the bar bending schedule and the steel quantity sent to the estimate.
   Element field e.rf (all sizes in mm):
     column  { c, main: { n, d }, tie: { d, s } }
     beam    { c, bot: { n, d }, top: { n, d }, st: { d, s } }
     footing { c, x: { d, s }, y: { d, s } }               x = bars parallel to the footing length L
     slab    { c, x: { d, s }, y: { d, s } }               x = bars along drawing X (bottom layer), y = along Y (on top of x)
   Conventions (IS 2502 / SP 34 / IS 456 cl 26.2): bend deduction 90° = 2d; stirrup / tie = 2(A+B) + 2 hooks max(10d, 75)
   − 3×2d − 2×3d with A, B = size − 2 cover − d (same formula as the estimate's BBS rows); lap = max(Ld, 30d),
   Ld = 0.87 fy / (4 × 1.6 τbd) diameters; bars longer than the 12 m stock get laps. Weight: IS 1786 nominal mass. */
(function () {
  "use strict";
  var EP = window.EP, B = EP.bim, G = EP.geom;
  var STOCK = 12000, TBD = { 15: 1.0, 20: 1.2, 25: 1.4, 30: 1.5, 35: 1.7, 40: 1.9 };
  B.RF_TYPES = { column: 1, beam: 1, footing: 1, slab: 1 };
  B.RF_COL = { 6: [0.85, 0.85, 0.85], 8: [0.93, 0.76, 0.18], 10: [0.3, 0.7, 0.3], 12: [0.15, 0.5, 0.9], 16: [0.88, 0.22, 0.2], 20: [0.6, 0.25, 0.7], 25: [1, 0.5, 0.05], 28: [0.45, 0.3, 0.2], 32: [0.4, 0.3, 0.25] };
  function wt(d) { return EP.barWt ? EP.barWt(d) : Math.round(d * d / 162.2 * 1000) / 1000; }
  B.rfSettings = function (d) { var bs = B.ensure(d); bs.rfs = Object.assign({ grade: "Fe500D", conc: "M25" }, bs.rfs || {}); return bs.rfs; };
  /* lap in bar diameters */
  B.lapD = function (d) { var s = B.rfSettings(d), fy = +String(s.grade).replace(/\D/g, "") || 500, fck = +String(s.conc).replace(/\D/g, "") || 25, t = 1.0; Object.keys(TBD).forEach(function (k) { if (fck >= +k) t = TBD[k]; }); var ld = Math.ceil(0.87 * fy / (4 * t * (fy > 250 ? 1.6 : 1)) - 0.05); return Math.max(ld, 30); };

  /* ---------- defaults (a reasonable start — the engineer must check them against the design) ---------- */
  B.rfDefault = function (doc, e) {
    if (e.t === "column") { if (B.colLegs(e)) return null;   /* L / T / + sections: no automatic bar layout — steel by the thumb rule */ var big = Math.max(e.w, e.d || e.w), A = B.colSection(e).A; return { c: 40, main: { n: B.colRound(e) ? 6 : big <= 300 ? 4 : big <= 450 ? 6 : 8, d: A <= 90000 ? 12 : 16 }, tie: { d: 8, s: 150 } }; }
    if (e.t === "beam") { var span = G.dist(e.a, e.b); return { c: 25, bot: { n: e.w >= 300 ? 3 : 2, d: span > 4500 ? 16 : 12 }, top: { n: 2, d: 12 }, st: { d: 8, s: 150 } }; }
    if (e.t === "footing") { var dd = Math.max(e.L, e.B) > 2000 ? 12 : 10; return { c: 50, x: { d: dd, s: 150 }, y: { d: dd, s: 150 } }; }
    if (e.t === "slab") { var bb = B.polyBox(e.pts), sx = bb[2] - bb[0], sy = bb[3] - bb[1]; return sx <= sy ? { c: 20, x: { d: 10, s: 150 }, y: { d: 8, s: 200 } } : { c: 20, x: { d: 8, s: 200 }, y: { d: 10, s: 150 } }; }
    return null;
  };
  B.hasRf = function (e) { return !!(e && e.rf && B.RF_TYPES[e.t] && !(e.t === "column" && B.colLegs && B.colLegs(e))); };   // L / T / + columns: no bar layout, their steel is by the thumb rule

  /* ---------- helpers ---------- */
  function P3(p, z) { return [p[0], p[1], z]; }
  function stirrupCut(d, b, D, c) { var A = b - 2 * c - d, Bh = D - 2 * c - d, hk = Math.max(10 * d, 75); return { cut: 2 * (A + Bh) + 2 * hk - 6 * d - 6 * d, A: A, B: Bh, hk: hk }; }
  function laps(run, d, lapD) { var n = run > STOCK ? Math.ceil((run - lapD * d) / (STOCK - lapD * d) - 1e-9) - 1 : 0; return Math.max(0, n); }
  function mm(x) { return String(Math.round(x)); }
  function zoneOf(doc, e) { return e.t === "footing" ? "below" : (B.below(doc.d, e.lvl) === "plinth" ? "below" : "above"); }
  /* a closed loop (tie / stirrup) as a polyline */
  function loop(pts) { return pts.concat([pts[0]]); }

  /* ---------- bars of one element ----------
     → { mark, sets: [{ mark, what, dia, sh ("st" | "sr"), nb, cut (mm), f (formula), a, b (stirrup outer size), c, lines: [[ [x,y,z]… ]…] }], kg, zone } */
  B.bars = function (doc, e, mark) {
    if (!B.hasRf(e)) return null; var d = doc.d, rf = e.rf, L = B.level(d, e.lvl), lapD = B.lapD(d), sets = [], z0 = (L ? L.elev : 0) + (e.base || 0);
    function set(o) { o.cut = Math.round(o.cut); o.kg = o.nb * o.cut / 1000 * wt(o.dia); sets.push(o); }
    if (e.t === "column") {
      var c = rf.c, md = rf.main.d, td = rf.tie.d, hc = e.h != null ? e.h : L.h, ci = c + td + md / 2, ang = (e.rot || 0) * Math.PI / 180, u = [Math.cos(ang), Math.sin(ang)], v = [-u[1], u[0]], at = function (x, y) { return [e.p[0] + u[0] * x + v[0] * y, e.p[1] + u[1] * x + v[1] * y]; };
      var pos = [], n = Math.max(4, Math.round(rf.main.n || 4));
      if (B.colRound(e)) { var R = e.w / 2 - ci; for (var i = 0; i < n; i++) pos.push(at(R * Math.cos(i / n * 2 * Math.PI), R * Math.sin(i / n * 2 * Math.PI))); }
      else {
        var hx = e.w / 2 - ci, hy = (e.d || e.w) / 2 - ci; pos.push(at(-hx, -hy), at(hx, -hy), at(hx, hy), at(-hx, hy));
        var k = n - 4, kw = 2 * Math.round((k / 2) * e.w / (e.w + (e.d || e.w))), kd = k - kw, mw = kw / 2, md2 = Math.ceil(kd / 2), md1 = kd - md2;
        for (var a = 1; a <= mw; a++) { var x = -hx + 2 * hx * a / (mw + 1); pos.push(at(x, -hy), at(x, hy)); }
        for (var b2 = 1; b2 <= md2; b2++) { var y = -hy + 2 * hy * b2 / (md2 + 1); pos.push(at(hx, y)); if (b2 <= md1) pos.push(at(-hx, y)); }
      }
      // bottom: into the footing under the column (with an L-leg), else from the floor (lapped with the bars below)
      var ft = d.ents.filter(function (f) { return f.t === "footing" && f.lvl === e.lvl && G.dist(f.p, e.p) < 1; })[0], zb = z0, legB = 0, fz;
      if (ft) { var Lf = B.level(d, ft.lvl), fr = ft.rf || { c: 50, x: { d: 12 }, y: { d: 12 } }; fz = Lf.elev - ft.df; zb = fz + fr.c + fr.x.d + fr.y.d + md / 2; legB = Math.max(12 * md, 250); }
      var above = B.levelAbove(d, e.lvl), up = above && d.ents.some(function (o) { return o.t === "column" && o.lvl === above.id && G.dist(o.p, e.p) < 1; }), zt, legT = 0;
      if (up) zt = z0 + hc + lapD * md; else { zt = z0 + hc - 25 - md / 2; legT = Math.max(12 * md, 150); }
      var run = zt - zb, cut = run + legB + legT - (legB ? 2 * md : 0) - (legT ? 2 * md : 0);
      var lines = pos.map(function (p) { var out = []; var dir = G.norm(G.sub(p, e.p)); if (!isFinite(dir[0])) dir = u; if (legB) out.push(P3(G.add(p, G.mul(dir, legB)), zb)); out.push(P3(p, zb), P3(p, zt)); if (legT) out.push(P3(G.sub(p, G.mul(dir, legT)), zt)); return out; });
      set({ what: "Main bars", dia: md, sh: "st", nb: pos.length, cut: cut, f: "height " + mm(run) + (ft ? " (from footing bottom + cover)" : "") + (up ? " incl. lap " + lapD + "d into the column above" : "") + (legB ? " + leg " + mm(legB) : "") + (legT ? " + top leg " + mm(legT) : "") + ((legB ? 1 : 0) + (legT ? 1 : 0) ? " − " + ((legB ? 1 : 0) + (legT ? 1 : 0)) + "×2d" : "") + " = " + mm(cut) + " mm", lines: lines });
      var nt = Math.floor((hc - 100) / rf.tie.s + 1e-9) + 1, tl = [], zt0 = z0 + 50;
      if (B.colRound(e)) { var Rt = e.w / 2 - c - td / 2, ring = Math.PI * (e.w - 2 * c - td) + lapD * td; for (var j = 0; j < nt; j++) { var zz = zt0 + j * rf.tie.s, pr = []; for (var q = 0; q <= 16; q++) pr.push(P3(at(Rt * Math.cos(q / 16 * 2 * Math.PI), Rt * Math.sin(q / 16 * 2 * Math.PI)), zz)); tl.push(pr); } set({ what: "Circular ties", dia: td, sh: "st", nb: nt, cut: ring, f: "π × (" + mm(e.w) + " − 2×" + c + " − " + td + ") + lap " + lapD + "d = " + mm(ring) + " mm; (" + mm(hc) + " − 100) ÷ " + rf.tie.s + " + 1 = " + nt + " nos", lines: tl }); }
      else {
        var sc = stirrupCut(td, e.w, e.d || e.w, c), ax = e.w / 2 - c - td / 2, ay = (e.d || e.w) / 2 - c - td / 2;
        for (var j2 = 0; j2 < nt; j2++) { var z2 = zt0 + j2 * rf.tie.s; tl.push(loop([P3(at(-ax, -ay), z2), P3(at(ax, -ay), z2), P3(at(ax, ay), z2), P3(at(-ax, ay), z2)])); }
        set({ what: "Ties", dia: td, sh: "sr", a: e.w, b: e.d || e.w, c: c, nb: nt, cut: sc.cut, f: "2×(" + mm(sc.A) + " + " + mm(sc.B) + ") + 2×" + mm(sc.hk) + " hooks − 12d = " + mm(sc.cut) + " mm; (" + mm(hc) + " − 100) ÷ " + rf.tie.s + " + 1 = " + nt + " nos", lines: tl });
      }
    } else if (e.t === "beam") {
      var cB = rf.c, sd = rf.st.d, Lb = G.dist(e.a, e.b), ub = G.norm(G.sub(e.b, e.a)), nb = G.perp(ub), top = L.elev + L.h + (e.top || 0), dep = e.d, w = e.w;
      function longBars(spec, isTop, what) {
        var dd = spec.d, n2 = Math.max(2, Math.round(spec.n || 2)), z = isTop ? top - cB - sd - dd / 2 : top - dep + cB + sd + dd / 2, half = w / 2 - cB - sd - dd / 2, leg = Math.max(12 * dd, 150), nl = laps(Lb, dd, lapD), cut2 = Lb + 2 * leg - 4 * dd + nl * lapD * dd, ln = [];
        for (var i2 = 0; i2 < n2; i2++) { var off = -half + 2 * half * i2 / (n2 - 1), pa = G.add(e.a, G.mul(nb, off)), pb = G.add(e.b, G.mul(nb, off)), zl = isTop ? z - leg : z + leg; ln.push([P3(pa, zl), P3(pa, z), P3(pb, z), P3(pb, zl)]); }
        set({ what: what, dia: dd, sh: "st", nb: n2, cut: cut2, f: "span " + mm(Lb) + " + 2 × leg " + mm(leg) + " − 2×2d" + (nl ? " + " + nl + " lap × " + lapD + "d" : "") + " = " + mm(cut2) + " mm", lines: ln });
      }
      longBars(rf.bot, false, "Bottom bars"); longBars(rf.top, true, "Top bars");
      var ns = Math.floor((Lb - 100) / rf.st.s + 1e-9) + 1, sc2 = stirrupCut(sd, w, dep, cB), sx2 = w / 2 - cB - sd / 2, zt2 = top - cB - sd / 2, zb2 = top - dep + cB + sd / 2, sl = [];
      for (var k2 = 0; k2 < ns; k2++) { var pc = G.add(e.a, G.mul(ub, 50 + k2 * rf.st.s)), l1 = G.add(pc, G.mul(nb, sx2)), l2 = G.sub(pc, G.mul(nb, sx2)); sl.push(loop([P3(l1, zb2), P3(l2, zb2), P3(l2, zt2), P3(l1, zt2)])); }
      set({ what: "Stirrups", dia: sd, sh: "sr", a: w, b: dep, c: cB, nb: ns, cut: sc2.cut, f: "2×(" + mm(sc2.A) + " + " + mm(sc2.B) + ") + 2×" + mm(sc2.hk) + " hooks − 12d = " + mm(sc2.cut) + " mm; (" + mm(Lb) + " − 100) ÷ " + rf.st.s + " + 1 = " + ns + " nos", lines: sl });
    } else if (e.t === "footing") {
      var cF = rf.c, angF = (e.rot || 0) * Math.PI / 180, uF = [Math.cos(angF), Math.sin(angF)], vF = [-uF[1], uF[0]], atF = function (x, y) { return [e.p[0] + uF[0] * x + vF[0] * y, e.p[1] + uF[1] * x + vF[1] * y]; }, bot = L.elev - e.df;
      [["x", e.L, e.B, false], ["y", e.B, e.L, true]].forEach(function (g, gi) {
        var sp = rf[g[0]], dd = sp.d, run = g[1] - 2 * cF, leg = Math.max(12 * dd, 150), legH = Math.min(leg, e.D - 2 * cF), cnt = Math.floor((g[2] - 2 * cF) / sp.s + 1e-9) + 1, cut3 = run + 2 * legH - 4 * dd, z = bot + cF + (gi ? rf.x.d : 0) + dd / 2, lf = [];
        for (var i3 = 0; i3 < cnt; i3++) { var t = -(g[2] / 2 - cF) + (cnt > 1 ? (g[2] - 2 * cF) * i3 / (cnt - 1) : g[2] / 2 - cF), pa = g[3] ? atF(t, -run / 2) : atF(-run / 2, t), pb = g[3] ? atF(t, run / 2) : atF(run / 2, t); lf.push([P3(pa, z + legH), P3(pa, z), P3(pb, z), P3(pb, z + legH)]); }
        set({ what: "Bottom mesh — bars along " + (g[3] ? "breadth" : "length"), dia: dd, sh: "st", nb: cnt, cut: cut3, f: mm(g[1]) + " − 2×" + cF + " cover + 2 × leg " + mm(legH) + " − 2×2d = " + mm(cut3) + " mm; (" + mm(g[2]) + " − 2×" + cF + ") ÷ " + sp.s + " + 1 = " + cnt + " nos", lines: lf });
      });
    } else if (e.t === "slab") {
      var cS = rf.c, zt3 = L.elev + (e.off || 0), zb3 = zt3 - e.th, P = e.pts;
      [["x", 0], ["y", 1]].forEach(function (g) {
        var sp = rf[g[0]], dd = sp.d, ax2 = g[1], z = zb3 + cS + (ax2 ? rf.x.d : 0) + dd / 2, bb = B.polyBox(P), lo = bb[1 - ax2] + cS, hi = bb[3 - ax2] - cS, groups = {}, lines = [], cnt = 0;
        for (var t = lo; t <= hi + 1e-6; t += sp.s) {
          var xs = [];
          for (var i4 = 0; i4 < P.length; i4++) { var p = P[i4], q = P[(i4 + 1) % P.length], pa = p[1 - ax2], qa = q[1 - ax2]; if ((pa <= t && qa > t) || (qa <= t && pa > t)) xs.push(p[ax2] + (t - pa) / (qa - pa) * (q[ax2] - p[ax2])); }
          xs.sort(function (m1, m2) { return m1 - m2; });
          for (var j3 = 0; j3 + 1 < xs.length; j3 += 2) {
            var s0 = xs[j3] + cS, s1 = xs[j3 + 1] - cS; if (s1 - s0 < 200) continue; var run3 = s1 - s0, nl3 = laps(run3, dd, lapD), cut4 = run3 + nl3 * lapD * dd, key = Math.round(cut4 / 10) * 10;
            groups[key] = (groups[key] || 0) + 1; cnt++; var A0 = ax2 ? [t, s0] : [s0, t], A1 = ax2 ? [t, s1] : [s1, t]; lines.push([P3(A0, z), P3(A1, z)]);
          }
        }
        var keys = Object.keys(groups).map(Number).sort(function (m1, m2) { return m2 - m1; });
        keys.forEach(function (kk, ii) { var nl4 = laps(kk, dd, lapD); set({ what: "Bottom bars along " + (ax2 ? "Y" : "X") + (keys.length > 1 ? " (" + (ii + 1) + ")" : ""), dia: dd, sh: "st", nb: groups[kk], cut: kk, f: "clear run between edges − 2×" + cS + " cover" + (nl4 ? " + " + nl4 + " lap × " + lapD + "d" : "") + " = " + kk + " mm; " + groups[kk] + " bars at " + sp.s + " mm", lines: ii === 0 ? lines : [] }); });
      });
    }
    var kg = 0; sets.forEach(function (s, i) { s.mark = (mark || "") + String.fromCharCode(97 + i); kg += s.kg; });
    return { mark: mark || "", sets: sets, kg: kg, zone: zoneOf(doc, e) };
  };
  /* marks C1, B1, F1, S1… in drawing order */
  B.rfMarks = function (doc) { var n = {}, out = {}; doc.d.ents.forEach(function (e) { if (!B.hasRf(e)) return; var p = { column: "C", beam: "B", footing: "F", slab: "S" }[e.t]; n[p] = (n[p] || 0) + 1; out[e.id] = e.mark || p + n[p]; }); return out; };
  /* the whole model's schedule: rows for every bar set */
  B.bbsSchedule = function (doc) {
    var marks = B.rfMarks(doc), rows = [];
    doc.d.ents.forEach(function (e) { if (!B.hasRf(e)) return; var r = B.bars(doc, e, marks[e.id]); if (!r) return; var L = B.level(doc.d, e.lvl); r.sets.forEach(function (s) { rows.push({ id: e.id, t: e.t, member: marks[e.id] + " (" + e.t + ", " + (L ? L.name : "") + ")", mark: s.mark, what: s.what, dia: s.dia, sh: s.sh, nb: s.nb, cut: s.cut, total: s.nb * s.cut / 1000, kg: s.kg, f: s.f, zone: r.zone, set: s }); }); });
    return rows;
  };
  /* estimate measurement rows (kind "bbs") that reproduce exactly the same weight */
  B.bbsRows = function (doc, e, mark) {
    var r = B.bars(doc, e, mark); if (!r) return [];
    return r.sets.map(function (s) {
      var o = { k: "bbs", d: (mark ? mark + " " : "") + e.t + " — " + s.what + " (" + s.mark + "): " + s.f, mem: e.t === "footing" ? "footing" : e.t, lvl: r.zone, n: "1", dia: String(s.dia), nb: String(s.nb) };
      if (s.sh === "sr") { o.sh = "sr"; o.a = String(Math.round(s.a)); o.bb = String(Math.round(s.b)); o.c = String(s.c); }
      else { o.sh = "st"; o.l = String(+(s.cut / 1000).toFixed(3)); o.c = "0"; o.nolap = true; }
      return o;
    });
  };
  /* 3D tubes for the bars (positions in metres; colours by diameter) */
  B.rebarMesh = function (doc, Mesh, opts) {
    opts = opts || {}; var marks = B.rfMarks(doc), out = [], K = 0.001, maxBars = opts.max || 30000, used = 0;
    doc.d.ents.forEach(function (e) {
      if (!B.hasRf(e) || (opts.filter && !opts.filter(e))) return; var r = B.bars(doc, e, marks[e.id]); if (!r) return;
      var M = Mesh(e.id); r.sets.forEach(function (s) {
        var col = (B.RF_COL[s.dia] || [0.5, 0.5, 0.5]).slice(); col.p = 0; col.s = 1; col.g = 0.6; col.a = 1; var rad = Math.max(3, s.dia / 2) * K;
        s.lines.forEach(function (pl) { if (used++ > maxBars) return; for (var i = 0; i + 1 < pl.length; i++) tube(M, pl[i], pl[i + 1], rad, col); });
      });
      out.push(M);
    });
    return out;
    function tube(M, a, b, r, col) {
      var A = [a[0] * K, a[1] * K, a[2] * K], Bp = [b[0] * K, b[1] * K, b[2] * K], ax = [Bp[0] - A[0], Bp[1] - A[1], Bp[2] - A[2]], l = Math.hypot(ax[0], ax[1], ax[2]); if (l < 1e-6) return; ax = [ax[0] / l, ax[1] / l, ax[2] / l];
      var ref = Math.abs(ax[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], u = cr(ax, ref), ul = Math.hypot(u[0], u[1], u[2]); u = [u[0] / ul, u[1] / ul, u[2] / ul]; var v = cr(ax, u), N = 6, ring = function (P, k) { var t = k / N * 2 * Math.PI, c = Math.cos(t) * r, s = Math.sin(t) * r; return [P[0] + u[0] * c + v[0] * s, P[1] + u[1] * c + v[1] * s, P[2] + u[2] * c + v[2] * s]; };
      for (var k = 0; k < N; k++) M.quad(ring(A, k), ring(A, k + 1), ring(Bp, k + 1), ring(Bp, k), col);
    }
    function cr(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  };
})();
