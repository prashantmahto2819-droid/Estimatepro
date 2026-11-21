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
      return [{ k: "rcc_slab", dim: "V", v: sl * w * th, label: nm, f: m(sl) + " (on slope) × " + m(w) + " × " + m(th), z: z }, { k: "shut_slab", dim: "A", v: sl * w + 2 * sl * th, label: "Shuttering — ramp / sloping slab", f: m(sl) + " × " + m(w) + " + sides", z: z }, { k: "steel_slab", dim: "M", v: sl * w * th / 1e9 * st, label: "Reinforcement — ramp (thumb rule " + st + " kg/m³)", f: "", z: z }]; },
    mesh: function (M, doc, e, H) { var Lv = B.level(doc.d, e.lvl), z0 = (Lv ? Lv.elev : 0) + (e.z || 0), th = e.th || 150, r = ccwQ(corners(e), [z0, z0 + (e.rise || 0), z0 + (e.rise || 0), z0]), P = r[0], Z = r[1], col = H.look("slab", e.look, e.col);
      var T = P.map(function (p, i) { return [p[0] * K, p[1] * K, Z[i] * K]; }), Bt = P.map(function (p, i) { return [p[0] * K, p[1] * K, (Z[i] - th) * K]; });
      M.tri(T[0], T[1], T[2], col); M.tri(T[0], T[2], T[3], col); M.tri(Bt[0], Bt[2], Bt[1], col); M.tri(Bt[0], Bt[3], Bt[2], col);
      for (var i = 0; i < 4; i++) { var j = (i + 1) % 4; M.quad(Bt[i], Bt[j], T[j], T[i], col); M.edge(T[i], T[j]); M.edge(Bt[i], Bt[j]); M.edge(T[i], Bt[i]); } }
  };
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
  cmd("PLOTBOUNDARY", ["BOUNDARY", "PLOT", "SITEPLOT", "TRAVERSE"], async function (ed) {
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
  cmd("SPOTLEVEL", ["SPOT", "LEVELMARK", "RL"], async function (ed) {
    siteLayers(ed); var N = scaleOf(ed.doc.d), v = ed.spotLvl == null ? 0 : ed.spotLvl, cnt = 0;
    while (true) { var p = await ed.getPoint("Click the point (Enter to finish)", { opt: true }); if (p == null) break;
      var s = await ed.getText("Level at this point in metres (like 0.45 or -0.30)", { def: String(v) }); var x = parseFloat(s == null || s === "" ? v : s); if (!isFinite(x)) { ed.say("Type the level as a number."); continue; } v = ed.spotLvl = x;
      var r = 1.2 * N; ed.doc.begin("Spot level"); ed.doc.add({ t: "line", a: [p[0] - r, p[1] - r], b: [p[0] + r, p[1] + r], layer: "C-TOPO" }); ed.doc.add({ t: "line", a: [p[0] - r, p[1] + r], b: [p[0] + r, p[1] - r], layer: "C-TOPO" });
      ed.doc.add({ t: "text", p: [p[0] + 1.8 * N, p[1] - 1.2 * N], s: (x >= 0 ? "+" : "-") + Math.abs(x).toFixed(3), h: 2.5 * N, rot: 0, al: "l", layer: "C-TOPO" }); ed.doc.commit(); cnt++; }
    if (cnt) ed.say(cnt + " spot level(s) marked.");
  });
})();
