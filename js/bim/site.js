/* Estimate Pro BIM — ramps / sloping slabs, plot boundary from side lengths and bearings, spot levels.
   Ramp: { t:"ramp", a:[x,y] (low end), b:[x,y] (high end), w, rise, th, z (low end above the floor), lvl, look }. */
(function () {
  "use strict";
  var EP = window.EP, CAD = EP.cad, B = EP.bim, G = EP.geom, cmd = function (n, a, f) { CAD.commands[n] = { fn: f }; (a || []).forEach(function (x) { CAD.aliases[x] = n; }); };
  B.TYPES.ramp = 1; B.EXT = B.EXT || {};
  var K = 0.001, m = function (v) { return (v / 1000).toFixed(2); };
  function corners(e) { var u = G.norm(G.sub(e.b, e.a)), n = G.mul(G.perp(u), (e.w || 1500) / 2); return [G.sub(e.a, n), G.sub(e.b, n), G.add(e.b, n), G.add(e.a, n)]; }
  function ccwQ(P, Z) { var s = 0; for (var i = 0; i < 4; i++) { var p = P[i], q = P[(i + 1) % 4]; s += p[0] * q[1] - q[0] * p[1]; } if (s >= 0) return [P, Z]; return [P.slice().reverse(), Z.slice().reverse()]; }
  function slopeLen(e) { return Math.hypot(G.dist(e.a, e.b), e.rise || 0); }
  B.rampInfo = function (e) { var L = G.dist(e.a, e.b), r = Math.abs(e.rise || 0); return { run: L, slope: slopeLen(e), ratio: r > 0 ? L / r : 0 }; };
  B.EXT.ramp = {
    plan: function (doc, e) { var P = corners(e), segs = [], u = G.norm(G.sub(e.b, e.a)), n = G.perp(u), L = G.dist(e.a, e.b), hd = Math.min(400, L / 4), s = G.add(e.a, G.mul(u, L * 0.15)), t = G.add(e.a, G.mul(u, L * 0.85));
      for (var i = 0; i < 4; i++) segs.push({ k: "L", a: P[i], b: P[(i + 1) % 4] });
      segs.push({ k: "L", a: s, b: t }); segs.push({ k: "L", a: t, b: G.add(G.sub(t, G.mul(u, hd)), G.mul(n, hd / 2.5)) }); segs.push({ k: "L", a: t, b: G.sub(G.sub(t, G.mul(u, hd)), G.mul(n, hd / 2.5)) });
      return { segs: segs, fill: [], dashed: [] }; },
    labels: function () { return []; },
    xform: function (e, M) { var o = JSON.parse(JSON.stringify(e)), k = Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])) || 1; o.a = G.mApply(M, e.a); o.b = G.mApply(M, e.b); o.w = (e.w || 1500) * k; return o; },
    qty: function (doc, e) { var bs = B.ensure(doc.d), z = e.lvl ? B.below(doc.d, e.lvl) : "super", sl = slopeLen(e), w = e.w || 1500, th = e.th || 150, I = B.rampInfo(e), st = (bs.steel && bs.steel.slab) || 90;
      var nm = (I.ratio ? "RCC ramp 1 in " + (Math.round(I.ratio * 10) / 10) : "RCC slab") + ", " + Math.round(th) + " mm";
      return [{ k: "rcc_slab", dim: "V", v: sl * w * th, label: nm, f: m(sl) + " (on slope) × " + m(w) + " × " + m(th), z: z }, { k: "shut_slab", dim: "A", v: sl * w + 2 * sl * th, label: "Shuttering — ramp / sloping slab", f: m(sl) + " × " + m(w) + " + sides", z: z }, { k: "steel_slab", dim: "M", v: sl * w * th / 1e9 * st, label: "Reinforcement — ramp (thumb rule " + st + " kg/m³)", f: "", z: z }].concat(+e.kerb > 0 ? [{ k: "rcc_slab", dim: "V", v: 2 * sl * 150 * (+e.kerb), label: "RCC kerbs on both edges of the ramp, 150 × " + Math.round(+e.kerb) + " mm", f: "2 × " + m(sl) + " × 0.15 × " + m(+e.kerb), z: z }, { k: "shut_slab", dim: "A", v: 2 * sl * 2 * (+e.kerb), label: "Shuttering — ramp kerbs", f: "2 kerbs × 2 faces × " + m(sl) + " × " + m(+e.kerb), z: z }] : []).concat(+e.rail > 0 ? [{ k: "railing", dim: "L", v: 2 * sl, label: "Railing on both edges of the ramp, " + Math.round(+e.rail) + " mm high", f: "2 × " + m(sl) + " m run", z: z }] : []); },
    mesh: function (M, doc, e, H) { var Lv = B.level(doc.d, e.lvl), z0 = (Lv ? Lv.elev : 0) + (e.z || 0), th = e.th || 150, cf = +e.cross || 0, r = ccwQ(corners(e), [z0, z0 + (e.rise || 0), z0 + (e.rise || 0) + cf, z0 + cf]), P = r[0], Z = r[1], col = H.look("slab", e.look, e.col);
      var T = P.map(function (p, i) { return [p[0] * K, p[1] * K, Z[i] * K]; }), Bt = P.map(function (p, i) { return [p[0] * K, p[1] * K, (Z[i] - th) * K]; });
      M.tri(T[0], T[1], T[2], col); M.tri(T[0], T[2], T[3], col); M.tri(Bt[0], Bt[2], Bt[1], col); M.tri(Bt[0], Bt[3], Bt[2], col);
      for (var i = 0; i < 4; i++) { var j = (i + 1) % 4; M.quad(Bt[i], Bt[j], T[j], T[i], col); M.edge(T[i], T[j]); M.edge(Bt[i], Bt[j]); M.edge(T[i], Bt[i]); }
      var kh = +e.kerb || 0; if (kh > 0) { var u = G.norm(G.sub(e.b, e.a)), n = G.perp(u), w2 = (e.w || 1500) / 2, kw = 150, za = z0, zb = z0 + (e.rise || 0);
        [1, -1].forEach(function (sd) { var o0 = G.add(e.a, G.mul(n, sd * w2)), o1 = G.add(e.b, G.mul(n, sd * w2)), i0 = G.add(e.a, G.mul(n, sd * (w2 - kw))), i1 = G.add(e.b, G.mul(n, sd * (w2 - kw))), rr = ccwQ([o0, o1, i1, i0], [za, zb, zb, za]), Pk = rr[0], Zk = rr[1];
          var Tk = Pk.map(function (q, k) { return [q[0] * K, q[1] * K, (Zk[k] + kh) * K]; }), Bk = Pk.map(function (q, k) { return [q[0] * K, q[1] * K, Zk[k] * K]; });
          M.tri(Tk[0], Tk[1], Tk[2], col); M.tri(Tk[0], Tk[2], Tk[3], col); for (var k = 0; k < 4; k++) { var k2 = (k + 1) % 4; M.quad(Bk[k], Bk[k2], Tk[k2], Tk[k], col); M.edge(Tk[k], Tk[k2]); } }); }
      var rh = +e.rail || 0; if (rh > 0) { var uR = G.norm(G.sub(e.b, e.a)), nR = G.perp(uR), wR = (e.w || 1500) / 2 - 75, LR = G.dist(e.a, e.b), rs = e.rise || 0, base = (+e.kerb || 0), rc = B.look(B.LOOKS[e.lookR] ? e.lookR : "steel_ss"), np = Math.max(2, Math.round(LR / 1200) + 1), ang = Math.atan2(uR[1], uR[0]) * 180 / Math.PI;
        var bar = function (p0, za, p1, zb, sz) { var hx = G.mul(nR, sz / 2), c = [[G.sub(p0, hx), za], [G.add(p0, hx), za], [G.add(p1, hx), zb], [G.sub(p1, hx), zb]], lo = c.map(function (q) { return [q[0][0] * K, q[0][1] * K, (q[1] - sz / 2) * K]; }), hi = c.map(function (q) { return [q[0][0] * K, q[0][1] * K, (q[1] + sz / 2) * K]; }), rr2 = ccwQ(c.map(function (q) { return q[0]; }), [0, 1, 2, 3]), ord = rr2[1];
          var Lo = ord.map(function (i) { return lo[i]; }), Hi = ord.map(function (i) { return hi[i]; }); M.tri(Hi[0], Hi[1], Hi[2], rc); M.tri(Hi[0], Hi[2], Hi[3], rc); M.tri(Lo[0], Lo[2], Lo[1], rc); M.tri(Lo[0], Lo[3], Lo[2], rc); for (var i = 0; i < 4; i++) { var j = (i + 1) % 4; M.quad(Lo[i], Lo[j], Hi[j], Hi[i], rc); } };
        [1, -1].forEach(function (sd) { var s0 = G.add(e.a, G.mul(nR, sd * wR)), s1 = G.add(e.b, G.mul(nR, sd * wR));
          for (var i = 0; i < np; i++) { var f = i / (np - 1), pp = G.add(s0, G.mul(G.sub(s1, s0), f)), zz = z0 + rs * f + base; H.box(M, pp, 40, 40, ang, zz, zz + rh, rc); }
          bar(s0, z0 + base + rh, s1, z0 + rs + base + rh, 50); bar(s0, z0 + base + rh * 0.5, s1, z0 + rs + base + rh * 0.5, 30); }); } }
  };
  /* ---------- steps: a solid flight from the lower floor up to a platform, verandah or raised room ----------
     { t:"steps", a:[x,y] (middle of the first riser), dir (degrees, the way you walk up), w, rise, tread, lvl, z, look } */
  B.TYPES.steps = 1;
  B.stepsInfo = function (e) { var rise = Math.max(50, e.rise || 450), n = Math.max(1, Math.round(rise / 150)), r = rise / n, t = e.tread || 300; return { n: n, r: r, t: t, len: n * t, w: e.w || 1200, vol: (e.w || 1200) * t * r * n * (n + 1) / 2 }; };
  function stepsFrame(e) { var a = (e.dir || 0) * Math.PI / 180, u = [Math.cos(a), Math.sin(a)]; return { u: u, n: [-u[1], u[0]] }; }
  B.EXT.steps = {
    plan: function (doc, e) { var I = B.stepsInfo(e), F = stepsFrame(e), hw = I.w / 2, segs = [], pt = function (s, y) { return [e.a[0] + F.u[0] * s + F.n[0] * y, e.a[1] + F.u[1] * s + F.n[1] * y]; };
      for (var i = 0; i <= I.n; i++) segs.push({ k: "L", a: pt(i * I.t, -hw), b: pt(i * I.t, hw) }); segs.push({ k: "L", a: pt(0, -hw), b: pt(I.len, -hw) }); segs.push({ k: "L", a: pt(0, hw), b: pt(I.len, hw) });
      var t0 = pt(I.t * 0.3, 0), t1 = pt(I.len - I.t * 0.3, 0), hd = Math.min(200, I.t * 0.6); segs.push({ k: "L", a: t0, b: t1 }); segs.push({ k: "L", a: t1, b: pt(I.len - I.t * 0.3 - hd, hd / 2.5) }); segs.push({ k: "L", a: t1, b: pt(I.len - I.t * 0.3 - hd, -hd / 2.5) });
      return { segs: segs, fill: [], dashed: [] }; },
    labels: function () { return []; },
    xform: function (e, M) { var o = JSON.parse(JSON.stringify(e)), k = Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2])) || 1, F = stepsFrame(e), q = G.mApply(M, [e.a[0] + F.u[0] * 1000, e.a[1] + F.u[1] * 1000]); o.a = G.mApply(M, e.a); o.dir = Math.atan2(q[1] - o.a[1], q[0] - o.a[0]) * 180 / Math.PI; o.w = (e.w || 1200) * k; return o; },
    qty: function (doc, e) { var I = B.stepsInfo(e), z = e.lvl ? B.below(doc.d, e.lvl) : "super", mat = e.mat === "rcc" ? "rcc_slab" : e.mat === "pcc" ? "pcc_floor" : "brick";
      return [{ k: mat, dim: "V", v: I.vol, label: (e.mat === "rcc" ? "RCC" : e.mat === "pcc" ? "Cement concrete" : "Brick") + " steps — " + I.n + " risers of " + Math.round(I.r) + " mm, " + m(I.w) + " m wide", f: m(I.w) + " × " + m(I.t) + " × " + m(I.r) + " × " + (I.n * (I.n + 1) / 2) + " (steps stacked 1 + 2 + … + " + I.n + ")", z: z }]; },
    mesh: function (M, doc, e, H) { var I = B.stepsInfo(e), F = stepsFrame(e), Lv = B.level(doc.d, e.lvl), z0 = (Lv ? Lv.elev : 0) + (e.z || 0), col = H.look("slab", e.look, e.col), ang = (e.dir || 0);
      for (var i = 0; i < I.n; i++) { var s0 = i * I.t, s1 = I.len, c = [e.a[0] + F.u[0] * (s0 + s1) / 2, e.a[1] + F.u[1] * (s0 + s1) / 2]; H.box(M, c, s1 - s0, I.w, ang, z0 + i * I.r, z0 + (i + 1) * I.r, col); } }
  };
  cmd("STEPS", ["ENTRYSTEPS", "FLIGHT"], async function (ed) {
    var bs = B.ensure(ed.doc.d), w = ed.stW || 1200, rise = ed.stRise || 450, mat = ed.stMat || "Brick", a;
    while (true) { a = await ed.getPoint("Steps — middle of the first (lowest) riser. " + mat + ", " + Math.round(w) + " mm wide, climbing " + Math.round(rise) + " mm", { kw: ["Width", "Rise", "Material"] });
      if (a === "Width") { w = ed.stW = await ed.getDist("Width of the steps", { def: w }); continue; } if (a === "Rise") { rise = ed.stRise = await ed.getDist("Height to climb (a riser of about 150 mm is used)", { def: rise }); continue; }
      if (a === "Material") { mat = ed.stMat = await ed.getKw("Steps made of", ["Brick", "PCC", "RCC"], mat); continue; } break; }
    var mk = function (q) { return { t: "steps", a: [a[0], a[1]], dir: Math.atan2(q[1] - a[1], q[0] - a[0]) * 180 / Math.PI, w: w, rise: rise, tread: 300, mat: mat.toLowerCase(), z: 0, lvl: bs.cur }; };
    ed.preview = function (q) { return G.dist(a, q) > 20 ? [mk(q)] : []; }; var b = await ed.getPoint("Which way do they climb? Click a point on the upper side", { base: a }); ed.preview = null; if (!b || G.dist(a, b) < 20) return;
    var e = mk(b), I = B.stepsInfo(e); ed.doc.add(e); ed.say("Steps added: " + I.n + " risers of " + Math.round(I.r) + " mm with 300 mm treads, " + m(I.len) + " m long. For a raised room use the same rise as its floor. Width, rise, tread and material are in Properties.");
  });
  cmd("RAMP", ["SLOPESLAB", "SLOPINGSLAB"], async function (ed) {
    var bs = B.ensure(ed.doc.d), w = ed.rampW || 1500, rise = ed.rampRise || 600, a;
    while (true) { a = await ed.getPoint("Ramp — low end, centre of the width", { kw: ["Width", "Rise"] });
      if (a === "Width") { w = ed.rampW = await ed.getDist("Width of the ramp", { def: w }); continue; }
      if (a === "Rise") { rise = ed.rampRise = await ed.getDist("Height it climbs (low end to high end)", { def: rise }); continue; } break; }
    ed.preview = function (q) { return G.dist(a, q) > 50 ? [{ t: "ramp", a: [a[0], a[1]], b: [q[0], q[1]], w: w, rise: rise, th: 150, lvl: bs.cur }] : []; };
    var b = await ed.getPoint("High end (centre of the width)", { base: a }); ed.preview = null; if (!b || G.dist(a, b) < 50) return;
    var e = { t: "ramp", a: [a[0], a[1]], b: [b[0], b[1]], w: w, rise: rise, th: 150, z: 0, lvl: bs.cur, layer: ed.doc.d.layers["S-SLAB"] ? "S-SLAB" : undefined }, I = B.rampInfo(e); if (!e.layer) delete e.layer; ed.doc.add(e);
    ed.say("Ramp added: " + m(I.run) + " m long, climbs " + m(rise) + " m — slope 1 in " + (Math.round(I.ratio * 10) / 10) + (I.ratio < 12 ? ". For wheelchairs keep it 1 in 12 or flatter." : ".") + " Width, rise and thickness are in Properties.");
  });

  /* ---------- plot boundary from side lengths and bearings ---------- */
  function northDeg(d) { var bs = B.ensure(d); return (bs.sun && +bs.sun.north) || +bs.north || 0; }
  /* "N45E", "S 30°15' W", "N", "E" or a whole-circle bearing in degrees (clockwise from north) → degrees clockwise from north */
  B.parseBearing = function (s) {
    s = String(s == null ? "" : s).trim().toUpperCase(); if (!s) return null;
    var dms = function (t) { var x = (t.match(/[\d.]+/g) || []).map(Number); if (!x.length) return null; return x[0] + (x[1] || 0) / 60 + (x[2] || 0) / 3600; };
    var q = s.match(/^([NS])\s*([\d.°'"\s:\-]*?)\s*([EW])$/);
    if (q) { var a = dms(q[2]); if (a == null) a = 45; if (a > 90) return null; return q[1] === "N" ? (q[3] === "E" ? a : (360 - a) % 360) : (q[3] === "E" ? 180 - a : 180 + a); }
    if (/^[NESW]$/.test(s)) return { N: 0, E: 90, S: 180, W: 270 }[s];
    if (/^[\d.°'"\s:\-]+$/.test(s)) { var v = dms(s); return v == null ? null : ((v % 360) + 360) % 360; }
    return null;
  };
  B.fmtBearing = function (deg) { deg = ((deg % 360) + 360) % 360; var cz = Math.round(deg * 60) / 60; if (cz % 90 === 0) return ["N", "E", "S", "W"][(cz / 90) % 4]; var q = deg <= 90 ? ["N", deg, "E"] : deg <= 180 ? ["S", 180 - deg, "E"] : deg <= 270 ? ["S", deg - 180, "W"] : ["N", 360 - deg, "W"], d = Math.floor(q[1] + 1e-9), mi = Math.round((q[1] - d) * 60); if (mi === 60) { d++; mi = 0; } return q[0] + " " + d + "°" + (mi ? (mi < 10 ? "0" : "") + mi + "'" : "") + " " + q[2]; };
  function siteLayers(ed) { var L = ed.doc.d.layers, want = { "C-PROP": { color: 1, lw: 0.5, lt: "DASHDOT" }, "C-PROP-TXT": { color: 7, lw: 0.18, lt: "CONTINUOUS" }, "C-TOPO": { color: 8, lw: 0.18, lt: "CONTINUOUS" } }, miss = Object.keys(want).filter(function (k) { return !L[k]; }); if (!miss.length) return; var Lc = CAD.clone(L); miss.forEach(function (k) { Lc[k] = Object.assign({ on: true, lock: false, frz: false }, want[k]); }); ed.doc.set("layers", Lc); }
  function scaleOf(d) { return (d.layouts && d.layouts[0] && d.layouts[0].scale) || (d.sheet && d.sheet.scale) || 100; }
  function polyArea(P) { var a = 0; for (var i = 0; i < P.length; i++) { var p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
  B.plotBoundary = function (ed, pts, opts) {
    opts = opts || {}; siteLayers(ed); var d = ed.doc.d, N = scaleOf(d), nd = northDeg(d), h = 2.5 * N, n = pts.length, A = polyArea(pts), sgn = A >= 0 ? 1 : -1, peri = 0;
    ed.doc.add({ t: "pline", pts: pts.map(function (p) { return [p[0], p[1], 0]; }), closed: true, layer: "C-PROP" });
    for (var i = 0; i < n; i++) { var a = pts[i], b = pts[(i + 1) % n], L = G.dist(a, b); if (L < 1) continue; peri += L;
      var u = G.norm(G.sub(b, a)), out = G.mul([u[1] * sgn, -u[0] * sgn], 1), mid = G.mul(G.add(a, b), 0.5), rot = Math.atan2(u[1], u[0]) * 180 / Math.PI, brg = (90 - rot - nd + 720) % 360; if (rot > 90 || rot <= -90) rot += 180;
      var up = [-Math.sin(rot * Math.PI / 180), Math.cos(rot * Math.PI / 180)], side = G.dot(up, out) >= 0 ? 1 : -1;
      ed.doc.add({ t: "text", p: G.add(mid, G.mul(up, side > 0 ? h * 0.6 : -h * 1.6)), s: m(L) + " m" + (opts.bearings === false ? "" : "  " + B.fmtBearing(brg)), h: h, rot: rot, al: "c", layer: "C-PROP-TXT" });
      ed.doc.add({ t: "circle", c: [a[0], a[1]], r: 0.8 * N, layer: "C-PROP" }); }
    var c = pts.reduce(function (s, p) { return [s[0] + p[0] / n, s[1] + p[1] / n]; }, [0, 0]), sqm = Math.abs(A) / 1e6;
    ed.doc.add({ t: "text", p: c, s: "PLOT AREA " + sqm.toFixed(2) + " sqm (" + (sqm * 10.7639).toFixed(0) + " sqft)\nPerimeter " + m(peri) + " m", h: 3.5 * N, rot: 0, al: "c", layer: "C-PROP-TXT" });
    return { area: sqm, peri: peri / 1000 };
  };
  cmd("PLOTBOUNDARY", ["SITEPLOT", "TRAVERSE", "PLOTLINE"], async function (ed) {
    var mode = await ed.getKw("Plot boundary — how do you want to give it?", ["Bearings", "Points"], ed.pbMode || "Bearings"); ed.pbMode = mode;
    var p0 = await ed.getPoint(mode === "Points" ? "First corner of the plot" : "Starting corner of the plot"), pts = [[p0[0], p0[1]]], nd = northDeg(ed.doc.d), un = (ed.doc.d.units === "m" ? 1000 : 1), last = 0;
    var prev = function () { ed.preview = function (w) { var out = [{ t: "pline", pts: pts.concat(mode === "Points" ? [[w[0], w[1]]] : []).map(function (p) { return [p[0], p[1], 0]; }), closed: false }]; return out; }; };
    if (mode === "Points") { while (true) { prev(); var p = await ed.getPoint("Next corner (Enter to close the plot)", { opt: true, base: pts[pts.length - 1], kw: pts.length > 1 ? ["Undo"] : undefined }); if (p === "Undo") { pts.pop(); continue; } if (p == null) break; pts.push([p[0], p[1]]); } }
    else { ed.say("For each side type its length in metres, then its bearing — like N45E, S30°15'W, or degrees clockwise from north (90 = east). Enter on an empty length closes the plot.");
      while (true) { prev(); var Ls = await ed.getText("Side " + pts.length + " — length in metres (empty = close the plot" + (pts.length > 1 ? ", U = undo" : "") + ")"); Ls = String(Ls == null ? "" : Ls).trim();
        if (!Ls) break; if (/^u/i.test(Ls)) { if (pts.length > 1) pts.pop(); continue; }
        var L = parseFloat(Ls); if (!(L > 0)) { ed.say("Type the length as a number, like 12.5"); continue; }
        var bs = await ed.getText("Side " + pts.length + " — bearing (N45E, S30W, or degrees from north)", { def: B.fmtBearing(last).replace(/\s/g, "") }), brg = B.parseBearing(bs == null || bs === "" ? B.fmtBearing(last) : bs);
        if (brg == null) { ed.say("Could not read that bearing. Examples: N45E, S 30°15' W, 135"); continue; }
        last = brg; var ang = (90 - brg - nd) * Math.PI / 180, q = pts[pts.length - 1]; pts.push([q[0] + L * 1000 * Math.cos(ang), q[1] + L * 1000 * Math.sin(ang)]); if (ed.zoomExtents && pts.length === 2) { /* keep the view */ } } }
    ed.preview = null; if (pts.length < 3) throw new Error("A plot needs at least three corners.");
    var gap = G.dist(pts[0], pts[pts.length - 1]), msg = "";
    if (mode === "Bearings") { if (gap < 20) pts.pop(); else { var gu = G.sub(pts[0], pts[pts.length - 1]), gb = (90 - Math.atan2(gu[1], gu[0]) * 180 / Math.PI - nd + 720) % 360; msg = " The last side was added to close the plot: " + m(gap) + " m, " + B.fmtBearing(gb) + " — if the sides were meant to close by themselves, check the figures."; } }
    ed.doc.begin("Plot boundary"); var r = B.plotBoundary(ed, pts); ed.doc.commit();
    ed.say("Plot boundary drawn: " + r.area.toFixed(2) + " sqm (" + (r.area * 10.7639).toFixed(0) + " sqft), perimeter " + r.peri.toFixed(2) + " m." + msg); if (ed.zoomExtents) ed.zoomExtents();
  });
  /* ---------- setbacks and the area statement ---------- */
  function plotOf(ed) { var P = ed.doc.d.ents.filter(function (e) { return e.t === "pline" && e.layer === "C-PROP" && e.closed && e.pts.length > 2; }); if (!P.length) return null; P.sort(function (a, b) { return Math.abs(polyArea(b.pts)) - Math.abs(polyArea(a.pts)); }); return P[0].pts.map(function (p) { return [p[0], p[1]]; }); }
  /* polygon moved inward by a distance per edge (dist[i] for the edge i → i+1) */
  B.insetPoly = function (P, dist) { var n = P.length, sg = polyArea(P) >= 0 ? 1 : -1, L = []; for (var i = 0; i < n; i++) { var a = P[i], b = P[(i + 1) % n], u = G.norm(G.sub(b, a)), nn = [-u[1] * sg, u[0] * sg], o = G.mul(nn, dist[i] || 0); L.push({ p: G.add(a, o), u: u }); }
    var out = []; for (var j = 0; j < n; j++) { var A = L[(j + n - 1) % n], C2 = L[j], den = A.u[0] * C2.u[1] - A.u[1] * C2.u[0]; if (Math.abs(den) < 1e-9) { out.push(C2.p); continue; } var w = G.sub(C2.p, A.p), t = (w[0] * C2.u[1] - w[1] * C2.u[0]) / den; out.push([A.p[0] + A.u[0] * t, A.p[1] + A.u[1] * t]); } return out; };
  cmd("SETBACK", ["SETBACKS", "BUILDLINE", "MARGINS"], async function (ed) {
    var P = plotOf(ed); if (!P) throw new Error("Draw the plot first — Site & services → Plot boundary.");
    siteLayers(ed); var Ls = ed.doc.d.layers; if (!Ls["C-SETBACK"]) { var Lc = CAD.clone(Ls); Lc["C-SETBACK"] = { color: 3, lw: 0.25, lt: "DASHED", on: true, lock: false, frz: false }; ed.doc.set("layers", Lc); }
    var mode = await ed.getKw("Setbacks (open space to leave inside the plot line)", ["Same", "Each"], ed.sbMode || "Same"), n = P.length, dist = [], nd = northDeg(ed.doc.d); ed.sbMode = mode;
    if (mode === "Same") { var v = await ed.getNum("Setback on all sides, in metres", { def: ed.sbAll == null ? 1.5 : ed.sbAll }); ed.sbAll = v; for (var i = 0; i < n; i++) dist.push(Math.max(0, v) * 1000); }
    else { for (var k = 0; k < n; k++) { var a = P[k], b = P[(k + 1) % n], rot = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; ed.preview = (function (a2, b2) { return function () { return [{ t: "line", a: a2, b: b2 }, { t: "circle", c: [(a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2], r: G.dist(a2, b2) / 12 }]; }; })(a, b);
        var x = await ed.getNum("Setback from side " + (k + 1) + " (" + m(G.dist(a, b)) + " m, " + B.fmtBearing((90 - rot - nd + 720) % 360) + " — marked on the drawing), in metres", { def: ed.sbLast == null ? 1.5 : ed.sbLast }); ed.sbLast = x; dist.push(Math.max(0, x) * 1000); } ed.preview = null; }
    var Q = B.insetPoly(P, dist), Ap = Math.abs(polyArea(P)) / 1e6, Aq = Math.abs(polyArea(Q)) / 1e6; if (!(Aq > 0.5) || Aq >= Ap || (polyArea(Q) >= 0) !== (polyArea(P) >= 0)) throw new Error("With these setbacks nothing is left to build on — check the figures.");
    var N = scaleOf(ed.doc.d), c = Q.reduce(function (t, q) { return [t[0] + q[0] / Q.length, t[1] + q[1] / Q.length]; }, [0, 0]);
    ed.doc.begin("Setbacks"); ed.doc.d.ents.filter(function (e) { return e.layer === "C-SETBACK"; }).forEach(function (e) { ed.doc.del(e.id); });
    ed.doc.add({ t: "pline", pts: Q.map(function (q) { return [q[0], q[1], 0]; }), closed: true, layer: "C-SETBACK" });
    ed.doc.add({ t: "text", p: [c[0], c[1] - 9 * N], s: "BUILDABLE AREA " + Aq.toFixed(2) + " sqm (" + (Aq / Ap * 100).toFixed(1) + " % of the plot)", h: 2.5 * N, rot: 0, al: "c", layer: "C-SETBACK" });
    for (var j = 0; j < n; j++) { if (!(dist[j] > 0)) continue; var a3 = P[j], b3 = P[(j + 1) % n], mid = G.mul(G.add(a3, b3), 0.5), q3 = G.mul(G.add(Q[j], Q[(j + 1) % n]), 0.5); ed.doc.add({ t: "text", p: G.mul(G.add(mid, q3), 0.5), s: m(dist[j]), h: 2 * N, rot: 0, al: "c", layer: "C-SETBACK" }); }
    ed.doc.commit(); ed.say("Setback line drawn: buildable area " + Aq.toFixed(2) + " sqm out of " + Ap.toFixed(2) + " sqm. Check the distances against your local building rules — they differ by town and plot size.");
  });
  /* covered area of every level from its slabs (or its rooms where no slab is drawn) */
  B.areaStatement = function (ed) { var d = ed.doc.d, bs = B.ensure(d), P = plotOf(ed), plot = P ? Math.abs(polyArea(P)) / 1e6 : 0, rows = [];
    bs.levels.forEach(function (L) { var fl = 0, sl = 0, rm = 0; d.ents.forEach(function (e) { if (e.lvl !== L.id) return; if (e.t === "slab" && e.kind !== "chajja" && e.pts) { var ar = Math.abs(B.area(e.pts)); if (e.kind === "floor" || !(+e.off > 300)) fl += ar; else sl += ar; } else if (e.t === "room" && e.pts) rm += Math.abs(B.area(e.pts)); }); var a = (fl || sl || rm) / 1e6; if (a > 0) rows.push({ name: L.name, area: a, from: fl ? "floor" : sl ? "slab" : "rooms" }); });
    var built = rows.reduce(function (t, r) { return t + r.area; }, 0), ground = rows.length ? rows[0].area : 0; return { plot: plot, rows: rows, built: built, ground: ground, cov: plot ? ground / plot * 100 : null, far: plot ? built / plot : null }; };
  cmd("AREASTATEMENT", ["COVERAGE", "FAR", "FSI", "AREASTMT"], async function (ed) {
    var S = B.areaStatement(ed); if (!S.rows.length) throw new Error("Nothing to add up yet — draw the slabs or mark the rooms first.");
    siteLayers(ed); var N = scaleOf(ed.doc.d), lines = ["AREA STATEMENT"]; if (S.plot) lines.push("Plot area: " + S.plot.toFixed(2) + " sqm (" + (S.plot * 10.7639).toFixed(0) + " sqft)");
    S.rows.forEach(function (r) { lines.push(r.name + ": " + r.area.toFixed(2) + " sqm" + (r.from === "rooms" ? " (carpet area of rooms)" : r.from === "slab" ? " (from the slab over it)" : "")); });
    lines.push("Total built-up area: " + S.built.toFixed(2) + " sqm (" + (S.built * 10.7639).toFixed(0) + " sqft)"); if (S.plot) { lines.push("Ground coverage: " + S.cov.toFixed(1) + " %"); lines.push("FAR / FSI: " + S.far.toFixed(2)); }
    if (S.plot) { var pc = String((await ed.getText("Permitted ground coverage in % (Enter to skip the check)", { def: ed.permCov || "" })) || "").trim(), pf = String((await ed.getText("Permitted FAR / FSI (Enter to skip)", { def: ed.permFar || "" })) || "").trim(), c1 = parseFloat(pc), f1 = parseFloat(pf); ed.permCov = pc; ed.permFar = pf;
      if (c1 > 0) lines.push("Permitted coverage " + c1 + " % - " + (S.cov <= c1 + 1e-6 ? "OK (" + (c1 - S.cov).toFixed(1) + " % to spare)" : "EXCEEDS by " + (S.cov - c1).toFixed(1) + " % (" + ((S.cov - c1) / 100 * S.plot).toFixed(2) + " sqm)"));
      var bsH = B.ensure(ed.doc.d), topL = bsH.levels.filter(function (L) { return S.rows.some(function (r) { return r.name === L.name; }); }).reduce(function (t, L) { return Math.max(t, (L.elev + L.h) / 1000); }, 0), ph = String((await ed.getText("Permitted building height in metres (Enter to skip)", { def: ed.permH || "" })) || "").trim(), h1 = parseFloat(ph); ed.permH = ph;
      if (topL > 0) lines.push("Building height (top of the highest floor drawn): " + topL.toFixed(2) + " m" + (h1 > 0 ? " - permitted " + h1 + " m - " + (topL <= h1 + 1e-6 ? "OK" : "EXCEEDS by " + (topL - h1).toFixed(2) + " m") : ""));
      if (f1 > 0) lines.push("Permitted FAR " + f1 + " - " + (S.far <= f1 + 1e-6 ? "OK (" + ((f1 - S.far) * S.plot).toFixed(2) + " sqm more can be built)" : "EXCEEDS by " + ((S.far - f1) * S.plot).toFixed(2) + " sqm")); }
    ed.say(lines.slice(1).join("  ·  ")); var p = await ed.getPoint("Click where to write the area statement (Enter to skip)", { opt: true }); if (!p) return;
    ed.doc.add({ t: "text", p: [p[0], p[1]], s: lines.join("\n"), h: 2.5 * N, rot: 0, al: "l", layer: "C-PROP-TXT" });
    ed.say("Area statement written." + (S.plot ? "" : " Draw the plot boundary to get ground coverage and FAR.") + " Each level is taken from its floor slab (or, where none is drawn, from the slab over it, or from its rooms) — check balconies, projections and exempt areas against your building rules.");
  });
  /* ---------- contours from spot levels ---------- */
  function delaunay(P) { var n = P.length, mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity; P.forEach(function (p) { mnx = Math.min(mnx, p[0]); mny = Math.min(mny, p[1]); mxx = Math.max(mxx, p[0]); mxy = Math.max(mxy, p[1]); });
    var dm = Math.max(mxx - mnx, mxy - mny, 1) * 20, cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2, V = P.concat([[cx - dm, cy - dm], [cx + dm, cy - dm], [cx, cy + dm]]), T = [[n, n + 1, n + 2]];
    var circ = function (t) { var a = V[t[0]], b = V[t[1]], c = V[t[2]], d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])); if (Math.abs(d) < 1e-12) return null; var ux = ((a[0] * a[0] + a[1] * a[1]) * (b[1] - c[1]) + (b[0] * b[0] + b[1] * b[1]) * (c[1] - a[1]) + (c[0] * c[0] + c[1] * c[1]) * (a[1] - b[1])) / d, uy = ((a[0] * a[0] + a[1] * a[1]) * (c[0] - b[0]) + (b[0] * b[0] + b[1] * b[1]) * (a[0] - c[0]) + (c[0] * c[0] + c[1] * c[1]) * (b[0] - a[0])) / d; return [ux, uy, (a[0] - ux) * (a[0] - ux) + (a[1] - uy) * (a[1] - uy)]; };
    for (var i = 0; i < n; i++) { var p = V[i], bad = [], keep = []; T.forEach(function (t) { var c = circ(t); if (c && (p[0] - c[0]) * (p[0] - c[0]) + (p[1] - c[1]) * (p[1] - c[1]) < c[2] * (1 + 1e-12)) bad.push(t); else keep.push(t); });
      var E = {}; bad.forEach(function (t) { [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]].forEach(function (e) { var k = Math.min(e[0], e[1]) + "_" + Math.max(e[0], e[1]); E[k] = E[k] ? null : e; }); });
      Object.keys(E).forEach(function (k) { if (E[k]) keep.push([E[k][0], E[k][1], i]); }); T = keep; }
    return T.filter(function (t) { return t[0] < n && t[1] < n && t[2] < n; }); }
  B.spotPoints = function (ed) { var N = scaleOf(ed.doc.d), out = []; ed.doc.d.ents.forEach(function (e) { if (e.layer !== "C-TOPO" || e.t !== "text" || /[a-z]/i.test(String(e.s))) return; var v = e.spot != null ? +e.spot : parseFloat(String(e.s).replace(/\s/g, "")); if (!isFinite(v)) return; var p = e.sp || [e.p[0] - 1.8 * N, e.p[1] + 1.2 * N]; out.push([p[0], p[1], v]); }); return out; };
  cmd("CONTOURS", ["CONTOUR", "LEVELLINES"], async function (ed) {
    var P = B.spotPoints(ed); if (P.length < 3) throw new Error("Mark at least three spot levels first (Site & services → Spot level) — more points give truer contours.");
    var lo = Math.min.apply(null, P.map(function (p) { return p[2]; })), hi = Math.max.apply(null, P.map(function (p) { return p[2]; })); if (hi - lo < 1e-6) throw new Error("All the spot levels are the same — the ground is flat, there are no contours to draw.");
    var sug = (hi - lo) > 5 ? 1 : (hi - lo) > 2 ? 0.5 : (hi - lo) > 0.8 ? 0.25 : 0.1, iv = await ed.getNum("Contour interval in metres (levels run from " + lo.toFixed(2) + " to " + hi.toFixed(2) + ")", { def: ed.contIv || sug }); if (!(iv > 0)) return; ed.contIv = iv; if ((hi - lo) / iv > 400) throw new Error("That interval gives too many contours — use a larger one.");
    siteLayers(ed); var Ls = ed.doc.d.layers; if (!Ls["C-TOPO-CONT"]) { var Lc = CAD.clone(Ls); Lc["C-TOPO-CONT"] = { color: 30, lw: 0.18, lt: "CONTINUOUS", on: true, lock: false, frz: false }; ed.doc.set("layers", Lc); }
    var T = delaunay(P), N = scaleOf(ed.doc.d), cnt = 0, lab = {}, segsOf = {}; ed.doc.begin("Contours"); ed.doc.d.ents.filter(function (e) { return e.layer === "C-TOPO-CONT"; }).forEach(function (e) { ed.doc.del(e.id); });
    for (var z = Math.ceil((lo + 1e-9) / iv) * iv; z < hi - 1e-9; z += iv) { z = Math.round(z * 1e6) / 1e6; T.forEach(function (t) { var q = []; [[0, 1], [1, 2], [2, 0]].forEach(function (e) { var a = P[t[e[0]]], b = P[t[e[1]]]; if ((a[2] - z) * (b[2] - z) < 0 || (a[2] === z && b[2] !== z)) { var f = (z - a[2]) / (b[2] - a[2]); q.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); } });
        if (q.length >= 2 && G.dist(q[0], q[1]) > 1) { cnt++; var key = z.toFixed(3); (segsOf[key] = segsOf[key] || []).push([q[0], q[1]]); if (!lab[key] || G.dist(q[0], q[1]) > lab[key].d) lab[key] = { d: G.dist(q[0], q[1]), p: G.mul(G.add(q[0], q[1]), 0.5), r: Math.atan2(q[1][1] - q[0][1], q[1][0] - q[0][0]) * 180 / Math.PI }; } }); }
    /* join the pieces of each level end to end and round the corners (two passes of corner cutting) */
    Object.keys(segsOf).forEach(function (k) { var S = segsOf[k].slice(), same = function (a, b) { return Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) < 0.5; };
      while (S.length) { var ch = S.pop().slice(), grew = true; while (grew) { grew = false; for (var i = 0; i < S.length; i++) { var sg = S[i], hd = ch[0], tl = ch[ch.length - 1]; if (same(sg[0], tl)) ch.push(sg[1]); else if (same(sg[1], tl)) ch.push(sg[0]); else if (same(sg[1], hd)) ch.unshift(sg[0]); else if (same(sg[0], hd)) ch.unshift(sg[1]); else continue; S.splice(i, 1); grew = true; break; } }
        var closed = ch.length > 3 && same(ch[0], ch[ch.length - 1]); if (closed) ch.pop();
        for (var pass = 0; pass < 2 && ch.length > 2; pass++) { var nx = [], n2 = ch.length; if (!closed) nx.push(ch[0]); for (var j = 0; j < (closed ? n2 : n2 - 1); j++) { var a2 = ch[j], b2 = ch[(j + 1) % n2]; nx.push([a2[0] * 0.75 + b2[0] * 0.25, a2[1] * 0.75 + b2[1] * 0.25]); nx.push([a2[0] * 0.25 + b2[0] * 0.75, a2[1] * 0.25 + b2[1] * 0.75]); } if (!closed) nx.push(ch[n2 - 1]); ch = nx; }
        ed.doc.add({ t: "pline", pts: ch.map(function (q2) { return [q2[0], q2[1], 0]; }), closed: closed, layer: "C-TOPO-CONT" }); } });
    Object.keys(lab).forEach(function (k) { var L = lab[k], r = L.r; if (r > 90 || r <= -90) r += 180; ed.doc.add({ t: "text", p: L.p, s: (+k).toFixed(2), h: 2 * N, rot: r, al: "c", layer: "C-TOPO-CONT" }); });
    ed.doc.commit(); ed.say(Object.keys(lab).length + " contour level(s) drawn at " + iv + " m from " + P.length + " spot levels. They are worked out on straight slopes between the points and then rounded — add spot levels where the ground changes to make them truer. Run Contours again after adding points.");
  });
  /* ---------- cut and fill to a formation level, from the spot levels ---------- */
  B.cutFill = function (P, T, form) { var cut = 0, fill = 0, area = 0;
    var tri = function (a, b, c, dep) { var A = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2, d1 = a[2] - form, d2 = b[2] - form, d3 = c[2] - form;
      if ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0) || dep >= 5) { var v = A * (d1 + d2 + d3) / 3; if (v > 0) cut += v; else fill -= v; return; }
      var ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2, (b[2] + c[2]) / 2], ca = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2, (c[2] + a[2]) / 2]; tri(a, ab, ca, dep + 1); tri(ab, b, bc, dep + 1); tri(ca, bc, c, dep + 1); tri(ab, bc, ca, dep + 1); };
    T.forEach(function (t) { var a = P[t[0]], b = P[t[1]], c = P[t[2]]; area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2; tri(a, b, c, 0); });
    return { cut: cut / 1e6, fill: fill / 1e6, area: area / 1e6 }; };   /* x, y in mm and levels in m → m³ and m² */
  cmd("CUTFILL", ["CUTANDFILL", "SITELEVELLING", "LEVELLING"], async function (ed) {
    var P = B.spotPoints(ed); if (P.length < 3) throw new Error("Mark at least three spot levels first (Site & services → Spot level).");
    var mean = P.reduce(function (t, p) { return t + p[2]; }, 0) / P.length, f = await ed.getNum("Formation level in metres — the level the ground is to be finished at (the average of your spot levels is " + mean.toFixed(2) + ")", { def: ed.formLvl == null ? +mean.toFixed(2) : ed.formLvl }); if (!isFinite(f)) return; ed.formLvl = f;
    var R = B.cutFill(P, delaunay(P), f), N = scaleOf(ed.doc.d), txt = "SITE LEVELLING to " + (f >= 0 ? "+" : "") + f.toFixed(3) + " m\nArea covered by the spot levels: " + R.area.toFixed(2) + " sqm\nCutting: " + R.cut.toFixed(2) + " cum\nFilling: " + R.fill.toFixed(2) + " cum\nBalance: " + (R.cut >= R.fill ? (R.cut - R.fill).toFixed(2) + " cum surplus earth" : (R.fill - R.cut).toFixed(2) + " cum earth to bring");
    ed.say(txt.split("\n").slice(1).join("  ·  ")); var p = await ed.getPoint("Click where to write the result (Enter to skip)", { opt: true }); if (!p) return; siteLayers(ed);
    ed.doc.add({ t: "text", p: [p[0], p[1]], s: txt, h: 2.5 * N, rot: 0, al: "l", layer: "C-TOPO" }); ed.say("Written. The volumes are in bank measure for the area inside the outermost spot levels, with straight slopes between the points — add points for a truer figure, and take the quantities to the estimate under your earthwork items.");
  });
  /* camera path: a polyline on layer A-CAMPATH; 3D → Tour walks along it at eye height */
  cmd("CAMPATH", ["CAMERAPATH", "WALKPATH", "TOURPATH"], async function (ed) {
    var L = ed.doc.d.layers; if (!L["A-CAMPATH"]) { var Lc = CAD.clone(L); Lc["A-CAMPATH"] = { color: 6, lw: 0.25, lt: "DASHED", on: true, lock: false, frz: false, plot: false }; ed.doc.set("layers", Lc); }
    var pts = [];
    while (true) { ed.preview = pts.length ? (function (P) { return function (w) { return [{ t: "pline", pts: P.concat([[w[0], w[1], 0]]), closed: false }]; }; })(pts.slice()) : null;
      var bsC = B.ensure(ed.doc.d), setC = function (k, v) { var b = CAD.clone(B.ensure(ed.doc.d)); b[k] = v; ed.doc.begin("Camera path"); ed.doc.set("bim", b); ed.doc.commit(); };
      var p = await ed.getPoint(pts.length ? "Next point of the walk (Enter to finish)" : "Camera path — where the walk starts (speed " + (bsC.camSpeed || 1.4) + " m/s, eye height " + (bsC.camEye || 1.6) + " m)", { opt: pts.length > 0, base: pts.length ? pts[pts.length - 1] : null, kw: pts.length ? ["Undo"] : ["Speed", "Height"] });
      if (p === "Speed") { var sv = await ed.getNum("Walking speed in metres per second (1.4 = normal walk, 0.8 = slow, 3 = fast)", { def: bsC.camSpeed || 1.4 }); if (sv >= 0.2 && sv <= 20) setC("camSpeed", +sv); continue; }
      if (p === "Height") { var hv = await ed.getNum("Eye height above the floor in metres (1.6 = standing, 1.1 = seated, 3 or more = drone view)", { def: bsC.camEye || 1.6 }); if (hv >= 0.3 && hv <= 60) setC("camEye", +hv); continue; }
      if (p === "Undo") { pts.pop(); continue; } if (p == null) break; pts.push([p[0], p[1], 0]); }
    ed.preview = null; if (pts.length < 2) return;
    ed.doc.begin("Camera path"); ed.doc.d.ents.filter(function (e) { return e.layer === "A-CAMPATH"; }).forEach(function (e) { ed.doc.del(e.id); }); ed.doc.add({ t: "pline", pts: pts, closed: false, layer: "A-CAMPATH" }); ed.doc.commit();
    var len = 0; for (var i = 1; i < pts.length; i++) len += G.dist(pts[i - 1], pts[i]);
    ed.say("Camera path saved (" + m(len) + " m, about " + Math.round(len / 1000 / (B.ensure(ed.doc.d).camSpeed || 1.4)) + " s). Open 3D and press Tour — the camera walks along it at eye height on the current level. Drag its corners to change the route; ● Record makes a video of it.");
  });
  /* a path for one vehicle: a polyline on layer A-DRIVEPATH tied to it; ▶ Play in 3D drives it along the path */
  cmd("DRIVEPATH", ["VEHICLEPATH", "DRIVEROUTE"], async function (ed) {
    var isVeh = function (e) { var df = e && e.t === "asset" && B.ASSET_LIB[e.kind]; return !!(df && !df.cut && df.deco); }, id = ed.sel.size === 1 ? Array.from(ed.sel)[0] : null, v = id != null && ed.doc.get(id);
    if (!isVeh(v)) { var pk = await ed.getEnt("Click the car, bike or other moving object that should drive along a path", { filter: isVeh }); v = pk && pk.e; } if (!v) return;
    var L = ed.doc.d.layers; if (!L["A-DRIVEPATH"]) { var Lc = CAD.clone(L); Lc["A-DRIVEPATH"] = { color: 3, lw: 0.25, lt: "DASHED", on: true, lock: false, frz: false, plot: false }; ed.doc.begin("Drive path"); ed.doc.set("layers", Lc); ed.doc.commit(); }
    var old = ed.doc.d.ents.filter(function (e) { return e.layer === "A-DRIVEPATH" && e.drv === v.id; })[0], spd = (old && +old.spd) || 20, pts = [[v.p[0], v.p[1], 0]], closed = false;
    while (true) { ed.preview = (function (P) { return function (w) { return [{ t: "pline", pts: P.concat([[w[0], w[1], 0]]), closed: false }]; }; })(pts.slice());
      var p = await ed.getPoint(pts.length > 1 ? "Next point of the route (Enter to finish)" : "Drive path — the route starts at the vehicle; click the next point (speed " + spd + " km/h)", { opt: true, base: pts[pts.length - 1], kw: pts.length > 2 ? ["Undo", "Close", "Speed", "Remove"] : pts.length > 1 ? ["Undo", "Speed", "Remove"] : ["Speed", "Remove"] });
      if (p === "Speed") { var sv = await ed.getNum("Speed in km/h (5 = walking pace, 20 = inside a campus, 40 = road)", { def: spd }); if (sv >= 1 && sv <= 150) spd = +sv; continue; }
      if (p === "Remove") { ed.preview = null; if (old) { ed.doc.begin("Drive path"); ed.doc.del(old.id); ed.doc.commit(); ed.say("The path of this vehicle is removed."); } else ed.say("This vehicle has no path."); return; }
      if (p === "Undo") { pts.pop(); continue; } if (p === "Close") { closed = true; break; } if (p == null) break; pts.push([p[0], p[1], 0]); }
    ed.preview = null; if (pts.length < 2) return;
    ed.doc.begin("Drive path"); if (old) ed.doc.del(old.id); ed.doc.add({ t: "pline", pts: pts, closed: closed, layer: "A-DRIVEPATH", drv: v.id, spd: spd }); ed.doc.commit();
    var len = 0; for (var i = 1; i < pts.length; i++) len += G.dist(pts[i - 1], pts[i]); if (closed) len += G.dist(pts[pts.length - 1], pts[0]);
    ed.say("Drive path saved (" + m(len) + " m at " + spd + " km/h). Open 3D and press ▶ Play — the vehicle follows the route, turning at the corners, and " + (closed ? "goes round and round." : "comes back the same way.") + " Drag the corners of the dashed line to change the route; run DRIVEPATH on the vehicle again to redraw or remove it.");
  });
  cmd("SPOTLEVEL", ["SPOT", "LEVELMARK"], async function (ed) {
    siteLayers(ed); var N = scaleOf(ed.doc.d), v = ed.spotLvl == null ? 0 : ed.spotLvl, cnt = 0;
    while (true) { var p = await ed.getPoint("Click the point (Enter to finish)", { opt: true }); if (p == null) break;
      var s = await ed.getText("Level at this point in metres (like 0.45 or -0.30)", { def: String(v) }); var x = parseFloat(s == null || s === "" ? v : s); if (!isFinite(x)) { ed.say("Type the level as a number."); continue; } v = ed.spotLvl = x;
      var r = 1.2 * N; ed.doc.begin("Spot level"); ed.doc.add({ t: "line", a: [p[0] - r, p[1] - r], b: [p[0] + r, p[1] + r], layer: "C-TOPO" }); ed.doc.add({ t: "line", a: [p[0] - r, p[1] + r], b: [p[0] + r, p[1] - r], layer: "C-TOPO" });
      ed.doc.add({ t: "text", p: [p[0] + 1.8 * N, p[1] - 1.2 * N], s: (x >= 0 ? "+" : "-") + Math.abs(x).toFixed(3), h: 2.5 * N, rot: 0, al: "l", layer: "C-TOPO", spot: x, sp: [p[0], p[1]] }); ed.doc.commit(); cnt++; }
    if (cnt) ed.say(cnt + " spot level(s) marked.");
  });
})();
