/* Estimate Pro — Building Planner → CAD Studio.
   One chosen plan becomes a real CAD / BIM drawing: plot line and setback line, levels (floors + terrace), walls (230 mm outer, 230 / 115 mm inner),
   doors and openings (each room opens on its hall / passage / corridor / its own bed room), windows on outer walls (≥ 1/10 of the floor for living rooms,
   more for class rooms and halls, ventilators for toilets), named rooms with floor finishes, dog-leg stairs that go up through every floor with the slab cut
   above them, a stair cabin (mumty) and parapet on the terrace, RCC frame (columns at wall junctions and along long walls, beams on the walls,
   footings under the columns), furniture and sanitary fittings. 3D, schedules, quantities, the estimate and MEP then work on it like any drawing. */
(function () {
  "use strict";
  var EP = window.EP = window.EP || {}, PL = EP.plan = EP.plan || {};
  function r1(x) { return Math.round(x); }
  var LAYC = { "A-WALL": 7, "A-DOOR": 4, "A-WIN": 140, "S-COL": 1, "S-BEAM": 5, "S-SLAB": 8, "S-FOOT": 9, "A-ROOF": 30, "A-STAIR": 6, "A-ROOM": 3, "A-RAIL": 8, "A-FURN": 42, "P-PLUMB": 150, "C-PROP": 1, "C-PROP-TXT": 7, "C-SETBACK": 3, "A-SITE": 33, "A-CEIL": 9, "L-LAND": 82, "A-FINISH": 34 };

  PL.toDoc = function (plan, cfg) {
    var CAD = EP.cad, B = EP.bim, G = EP.geom, T = plan.T, nF = plan.floors.length, H = T.h, house = T.id === "house", frame = cfg.frame !== "lb";
    var d = CAD.newDoc(cfg.name || (T.n + " — " + plan.label), "mm"), bs = B.ensure(d), ents = d.ents;
    var des = Object.assign({}, PL.desDefault ? PL.desDefault(T.id) : {}, cfg.des || {}), TH = des.mat === "block" ? [200, 200, 100] : des.mat === "stone" ? [300, 230, 115] : [230, 230, 115], wMat = des.mat === "block" ? "block" : "brick", sloped = /^(gable|hip|tile_hip|tile_gable)$/.test(des.roof);
    if (cfg.furn === false) des.furn = "none";
    Object.keys(LAYC).forEach(function (k) { if (!d.layers[k]) d.layers[k] = { color: LAYC[k], lw: k === "A-WALL" ? 0.5 : 0.25, lt: k === "C-SETBACK" ? "DASHED" : "CONTINUOUS", on: true, lock: false, frz: false }; });
    var nm = ["Ground floor", "First floor", "Second floor", "Third floor", "Fourth floor", "Fifth floor", "Sixth floor", "Seventh floor", "Eighth floor"];
    bs.levels = []; for (var i = 0; i < nF; i++) bs.levels.push({ id: "L" + i, name: nm[i] || ("Floor " + i), elev: i * H, h: H }); bs.levels.push({ id: "LT", name: "Terrace", elev: nF * H, h: 3000 });
    bs.cur = "L0"; bs.wallTh = 230; bs.north = { N: 180, E: 270, S: 0, W: 90 }[cfg.facing || "S"] || 0; bs.sun = Object.assign({}, B.SUN0 || {}, bs.sun || {}, { north: bs.north }); bs.planner = { type: T.id, opt: plan.label, at: Date.now() };
    var ox = (cfg.rules.l || 0) * 1000, oy = (cfg.rules.f || 0) * 1000, X = function (x) { return r1(ox + x * 1000); }, Y = function (y) { return r1(oy + y * 1000); }, P = function (x, y) { return [X(x), Y(y)]; };
    function add(o) { o.id = CAD.uid(); ents.push(o); return o; }

    /* ---------- site: plot line, setback line, road ---------- */
    var pw = cfg.plot.w * 1000, pd = cfg.plot.d * 1000;
    /* the plot line: a rectangle, or the real four sides of an odd-shaped plot */
    var ring = cfg.plotPoly ? cfg.plotPoly.map(function (q) { return [Math.round(q[0] * 1000), Math.round(q[1] * 1000)]; }) : [[0, 0], [pw, 0], [pw, pd], [0, pd]];
    var inRing = function (p) { return !cfg.plotPoly || (PL.inPoly ? PL.inPoly(p, ring) : true); };
    add({ t: "pline", pts: ring.map(function (q) { return [q[0], q[1], 0]; }), closed: true, layer: "C-PROP" });
    if (cfg.setbackPoly) add({ t: "pline", pts: cfg.setbackPoly.map(function (q) { return [Math.round(q[0] * 1000), Math.round(q[1] * 1000), 0]; }), closed: true, layer: "C-SETBACK" });
    else add({ t: "pline", pts: [[ox, oy, 0], [pw - cfg.rules.rt * 1000, oy, 0], [pw - cfg.rules.rt * 1000, pd - cfg.rules.r * 1000, 0], [ox, pd - cfg.rules.r * 1000, 0]], closed: true, layer: "C-SETBACK" });
    add({ t: "text", p: [pw / 2, -2500], s: "ROAD", h: 600, rot: 0, al: "c", layer: "C-PROP-TXT" });
    if (cfg.corner === "left" || cfg.corner === "right") add({ t: "text", p: [cfg.corner === "left" ? -2500 : pw + 2500, pd / 2], s: "ROAD", h: 600, rot: 90, al: "c", layer: "C-PROP-TXT" });
    add({ t: "text", p: [pw / 2, pd + 1200], s: (cfg.plotPoly ? "PLOT (four sides " + ring.map(function (q, i) { var r2 = ring[(i + 1) % ring.length]; return (Math.hypot(r2[0] - q[0], r2[1] - q[1]) / 1000).toFixed(2); }).join(" / ") + " m) = " + (+cfg.plotArea).toFixed(2) + " m²   ·   building area" : "PLOT " + cfg.plot.w + " m × " + cfg.plot.d + " m = " + (cfg.plot.w * cfg.plot.d).toFixed(2) + " m²   ·   setbacks") + " F " + cfg.rules.f + " / R " + cfg.rules.r + " / L " + cfg.rules.l + " / R " + cfg.rules.rt + " m", h: 350, rot: 0, al: "c", layer: "C-PROP-TXT" });

    var parts = PL.parts, W = plan.W, D = plan.D, stairs = [], perFloor = [];
    plan.floors.forEach(function (rooms, fi) { perFloor.push(buildFloor(rooms, "L" + fi, fi)); });

    /* ---------- one floor ---------- */
    function sp(r) { return r && r.inst && r.inst.sp; }
    function isOpen(r) { return !!(sp(r) && sp(r).open); }
    function buildFloor(rooms, lvl, fi) {
      /* elementary pieces of every grid line, with the room on each side */
      var H_ = {}, V_ = {}, key = function (v) { return Math.round(v * 1000); };
      rooms.forEach(function (r) { parts(r).forEach(function (q) {
        (H_[key(q.y)] = H_[key(q.y)] || []).push({ a: q.x, b: q.x + q.w, up: r }); (H_[key(q.y + q.d)] = H_[key(q.y + q.d)] || []).push({ a: q.x, b: q.x + q.w, dn: r });
        (V_[key(q.x)] = V_[key(q.x)] || []).push({ a: q.y, b: q.y + q.d, rt: r }); (V_[key(q.x + q.w)] = V_[key(q.x + q.w)] || []).push({ a: q.y, b: q.y + q.d, lf: r }); }); });
      var pieces = [];
      function cut(map, hz) { Object.keys(map).forEach(function (k) { var L = map[k], c = +k / 1000, br = []; L.forEach(function (s) { br.push(s.a, s.b); }); br = br.map(function (v) { return Math.round(v * 1000) / 1000; }).sort(function (a, b) { return a - b; }).filter(function (v, i, A) { return !i || v - A[i - 1] > 1e-3; });
        for (var i = 0; i + 1 < br.length; i++) { var a = br[i], b = br[i + 1], m = (a + b) / 2, s1 = null, s2 = null; L.forEach(function (s) { if (s.a <= m && s.b >= m) { if (hz) { if (s.dn) s1 = s.dn; if (s.up) s2 = s.up; } else { if (s.lf) s1 = s.lf; if (s.rt) s2 = s.rt; } } });
          if (s1 && s2 && s1.uid === s2.uid) continue; if (!s1 && !s2) continue; pieces.push({ hz: hz, c: c, a: a, b: b, s1: s1, s2: s2 }); } }); }
      cut(H_, true); cut(V_, false);
      /* what stands on each piece */
      pieces.forEach(function (p) {
        var A = p.s1, Bq = p.s2, out = !A || !Bq, rm = A || Bq;
        if (out) { p.kind = isOpen(rm) ? (sp(rm).open === "balc" ? "rail" : "none") : "wall"; p.ext = true; p.th = TH[0]; }
        else if (isOpen(A) && isOpen(Bq)) p.kind = "none";
        else { p.kind = "wall"; p.ext = isOpen(A) || isOpen(Bq); var thin = [A, Bq].some(function (r) { var s = sp(r); return r.parent || (s && (s.wet && !s.block && (s.minW || 2) < 2) || (s && /^(store|pooja|wc|toilet|toilet_att|bath_h|cstore|dstore|hk|server)$/.test(r.key))); }); p.th = p.ext ? TH[0] : thin ? TH[2] : TH[1]; }
      });
      /* merge pieces into walls */
      var walls = [], groups = {};
      pieces.filter(function (p) { return p.kind === "wall"; }).forEach(function (p) { var k = (p.hz ? "h" : "v") + Math.round(p.c * 1000) + "_" + p.th + (p.ext ? "e" : ""); (groups[k] = groups[k] || []).push(p); });
      Object.keys(groups).forEach(function (k) { var L = groups[k].sort(function (a, b) { return a.a - b.a; }), cur = null;
        L.forEach(function (p) { if (cur && Math.abs(cur.b - p.a) < 1e-3) { cur.b = p.b; cur.ps.push(p); } else { cur = { hz: p.hz, c: p.c, a: p.a, b: p.b, th: p.th, ext: p.ext, ps: [p] }; walls.push(cur); } }); });
      walls.forEach(function (w) { var a = w.hz ? P(w.a, w.c) : P(w.c, w.a), b = w.hz ? P(w.b, w.c) : P(w.c, w.b);
        w.e = add({ t: "wall", a: a, b: b, th: w.th, h: null, mat: w.ext && des.mat === "stone" ? "stone" : wMat, just: "c", lvl: lvl, ext: !!w.ext, layer: "A-WALL" }); w.open = []; w.ps.forEach(function (p) { p.w = w; }); });
      /* curved / three-sided bay window in the living room (ground floor), curved balconies */
      var bays = [];
      if (/bay|both|facet/.test(des.curve)) {
        /* on a side wall of the living room (the road-side wall keeps the main door), else on the master bed room */
        ["living", "master", "dining"].some(function (key) { var liv = rooms.filter(function (r) { return r.key === key || (key === "living" && r.inst && r.inst.main && !r.corr && !isOpen(r)); })[0]; if (!liv || fi !== 0 && key === "living") return false;
          var bp = pieces.filter(function (p) { return p.kind === "wall" && (p.s1 === liv || p.s2 === liv) && !(p.s1 && p.s2) && p.b - p.a >= 2.4 && !(liv.inst && liv.inst.main && p.hz && Math.abs(p.c) < 1e-3); }).sort(function (a, b) { return (b.b - b.a) - (a.b - a.a); })[0];
          if (bp) { bays.push({ p: bp, room: liv, facet: des.curve === "facet" }); return true; } return false; });
      }
      bays.forEach(function (bq) { var p = bq.p, w = p.w, outS = (p.s1 ? 1 : -1), L = p.b - p.a, sg = Math.min(bq.facet ? 0.75 : 0.9, L * 0.3), pts = [];
        /* split the straight wall around the bay */
        var mk = function (a0, b0) { if (b0 - a0 < 0.05) return null; var nw = { hz: w.hz, c: w.c, a: a0, b: b0, th: w.th, ext: w.ext, ps: [], open: [] }; nw.e = add({ t: "wall", a: w.hz ? P(a0, w.c) : P(w.c, a0), b: w.hz ? P(b0, w.c) : P(w.c, b0), th: w.th, h: null, mat: w.e.mat, just: "c", lvl: lvl, ext: true, layer: "A-WALL" }); walls.push(nw); return nw; };
        var w1 = mk(w.a, p.a), w2 = mk(p.b, w.b); w.e._del = 1; walls.splice(walls.indexOf(w), 1);
        w.ps.forEach(function (q) { if (q === p) return; q.w = q.a < p.a ? w1 : w2; (q.w ? q.w.ps : []).push(q); });
        p.kind = "bay";
        var at = function (t, off) { var a = p.a + L * t, o = outS * off; return w.hz ? [a, w.c + o] : [w.c + o, a]; };
        if (bq.facet) pts = [at(0, 0), at(0.25, sg), at(0.75, sg), at(1, 0)];
        else { var n = Math.max(3, Math.round(L / 1.3)), R = (L * L / 4 + sg * sg) / (2 * sg); for (var i = 0; i <= n; i++) { var t = i / n, x = (t - 0.5) * L, y = Math.sqrt(Math.max(0, R * R - x * x)) - (R - sg); pts.push(at(t, y)); } }
        var cc = null; if (!bq.facet) { var Rr = (L * L / 4 + sg * sg) / (2 * sg), mid = at(0.5, sg - Rr); cc = [r1(P(mid[0], mid[1])[0]), r1(P(mid[0], mid[1])[1])]; }
        for (var k = 0; k + 1 < pts.length; k++) { var e = add(Object.assign({ t: "wall", a: P(pts[k][0], pts[k][1]), b: P(pts[k + 1][0], pts[k + 1][1]), th: w.th, h: null, mat: w.e.mat, just: "c", lvl: lvl, ext: true, layer: "A-WALL", curve: bq.facet ? undefined : 1 }, cc ? { cc: cc, cr: Math.round((L * L / 4 + sg * sg) / (2 * sg) * 1000) } : {}));
          var Ls = G.dist(e.a, e.b), wnd = Ls >= 1500 ? preset("w", Ls >= 1900 ? "W2" : "W3") : Ls >= 1150 ? preset("w", "W3") : null;
          if (wnd) { var cen2 = centroid(bq.room), pc = P(cen2[0], cen2[1]), Lw = B.wallLine(e); add(Object.assign({ t: "window", host: e.id, at: Ls / 2, flip: G.dot(G.sub(pc, Lw.a), Lw.n) < 0, swing: "l", layer: "A-WIN" }, wnd, des.grill !== "none" ? { grill: des.grill } : {})); } }
        var poly = pts.map(function (q) { return P(q[0], q[1]); });
        add({ t: "slab", pts: poly, th: house ? 125 : 150, lvl: lvl, off: H, kind: "ceiling", layer: "S-SLAB", bay: 1 });
        add({ t: "slab", pts: poly.map(function (q) { return q.slice(); }), th: 100, lvl: lvl, off: 0, kind: "floor", layer: "S-SLAB", bay: 1 });
      });
      /* columns (RCC frame): at wall ends and junctions, and along long walls */
      var nodes = [];
      if (frame) {
        var addN = function (x, y) { if (!nodes.some(function (n) { return Math.abs(n[0] - x) < 0.3 && Math.abs(n[1] - y) < 0.3; })) nodes.push([x, y]); };
        walls.forEach(function (w) { if (w.th < 200) return; addN(w.hz ? w.a : w.c, w.hz ? w.c : w.a); addN(w.hz ? w.b : w.c, w.hz ? w.c : w.b); });
        var span = house ? 4.5 : 6.0;
        walls.forEach(function (w) { if (w.th < 200) return; var L = w.b - w.a, onW = nodes.filter(function (n) { return w.hz ? Math.abs(n[1] - w.c) < 0.05 && n[0] > w.a - 0.05 && n[0] < w.b + 0.05 : Math.abs(n[0] - w.c) < 0.05 && n[1] > w.a - 0.05 && n[1] < w.b + 0.05; }).map(function (n) { return w.hz ? n[0] : n[1]; }).sort(function (a, b) { return a - b; });
          for (var i = 0; i + 1 < onW.length; i++) { var g = onW[i + 1] - onW[i]; if (g > span) { var k = Math.ceil(g / span); for (var j = 1; j < k; j++) { var t = onW[i] + g * j / k; addN(w.hz ? t : w.c, w.hz ? w.c : t); } } } });
        var cw = house ? 230 : 300, cd = house ? 300 : 450;
        nodes.forEach(function (n) { var onH = walls.some(function (w) { return w.hz && Math.abs(n[1] - w.c) < 0.05 && n[0] > w.a - 0.05 && n[0] < w.b + 0.05 && w.th >= 200; }), onV = walls.some(function (w) { return !w.hz && Math.abs(n[0] - w.c) < 0.05 && n[1] > w.a - 0.05 && n[1] < w.b + 0.05 && w.th >= 200; });
          add({ t: "column", p: P(n[0], n[1]), w: cw, d: cd, rot: onV && !onH ? 90 : 0, shape: "rect", lvl: lvl, layer: "S-COL" });
          walls.forEach(function (w) { var s = w.hz ? (Math.abs(n[1] - w.c) < 0.05 ? n[0] : null) : (Math.abs(n[0] - w.c) < 0.05 ? n[1] : null); if (s != null && s > w.a - 0.05 && s < w.b + 0.05) w.open.push([s - 0.2, s + 0.2]); }); });
        /* the free corners of porches / parking / balconies stand on columns too */
        rooms.forEach(function (r) { if (!isOpen(r)) return; [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.d], [r.x, r.y + r.d]].forEach(function (q) { if (nodes.some(function (n) { return Math.abs(n[0] - q[0]) < 0.3 && Math.abs(n[1] - q[1]) < 0.3; })) return; nodes.push(q); add({ t: "column", p: P(q[0], q[1]), w: des.cols === "rect" ? cw : 300, d: des.cols === "rect" ? cd : 300, rot: 0, shape: des.cols || "rect", lvl: lvl, layer: "S-COL" }); }); });
        walls.forEach(function (w) { if (w.th < 200) return; add({ t: "beam", a: w.e.a.slice(), b: w.e.b.slice(), w: w.th, d: house ? 380 : 450, lvl: lvl, layer: "S-BEAM" }); });
      }
      /* openings: helpers */
      function freeAt(w, s0, s1) { return !w.open.some(function (o) { return s0 < o[1] + 0.05 && s1 > o[0] - 0.05; }) && s0 > w.a + 0.12 && s1 < w.b - 0.12; }
      function placeOn(p, wid, prefer) { /* centre (m along the grid line) of an opening of width wid on piece p, near its start ("a"), end ("b") or middle — the nearest free spot clear of other openings and columns */
        var w = p.w; if (!w) return null; var room = 0.12 + (house ? 0.1 : 0.15), c0 = p.a + room + wid / 2, c1 = p.b - room - wid / 2, mid = (p.a + p.b) / 2;
        if (c1 < c0 - 1e-6) { if (p.b - p.a >= wid + 0.1 && freeAt(w, mid - wid / 2, mid + wid / 2)) return mid; return null; }
        var start = prefer === "m" ? mid : prefer === "b" ? c1 : c0, best = null;
        for (var k = 0; k <= 400; k++) { var off = Math.ceil(k / 2) * 0.05 * (k % 2 ? 1 : -1), c = start + off; if (Math.abs(off) > (c1 - c0) + 0.05) break; if (c < c0 - 1e-6 || c > c1 + 1e-6) continue; if (freeAt(w, c - wid / 2, c + wid / 2)) { best = c; break; } }
        return best; }
      function hostAdd(t, p, c, o, into) { var w = p.w, ee = w.e, at = (c - w.a) * 1000, L = B.wallLine(ee), cen = into ? centroid(into) : null, flip = false, pt;
        if (cen) { pt = P(cen[0], cen[1]); flip = G.dot(G.sub(pt, L.a), L.n) < 0; }
        w.open.push([c - o.w / 2000, c + o.w / 2000]);
        return add(Object.assign({ t: t, host: ee.id, at: at, flip: flip, swing: (c - p.a) < (p.b - c) ? "l" : "r", layer: t === "window" ? "A-WIN" : "A-DOOR" }, o)); }
      function centroid(r) { return [r.x + r.w / 2, r.y + r.d / 2]; }
      function preset(lib, id) { var x = (lib === "d" ? B.DOORS : B.WINDOWS).filter(function (q) { return q.id === id; })[0]; return x ? { w: x.w, h: x.h, sill: x.sill || 0, preset: x.id, mat: x.mat, kind: x.kind, style: x.style, mark: x.id } : null; }
      var piecesOf = function (r) { return pieces.filter(function (p) { return p.kind === "wall" && (p.s1 === r || p.s2 === r); }); };
      var other = function (p, r) { return p.s1 === r ? p.s2 : p.s1; };
      var accessOf = {}, mainDoor = null;
      /* main entrance(s) */
      if (fi === 0) {
        var mains = rooms.filter(function (r) { return r.inst && r.inst.main; }).concat(rooms.filter(function (r) { return r.corr; }), rooms.filter(function (r) { return sp(r) && sp(r).circ && !isOpen(r); }), rooms.filter(function (r) { return sp(r) && !isOpen(r) && !sp(r).wet && !sp(r).stair; }));
        mains.some(function (r) { if (mainDoor) return true;
          var cand = piecesOf(r).filter(function (p) { var o = other(p, r); return p.hz && Math.abs(p.c) < 1e-3 && (!o || isOpen(o)); }).sort(function (a, b) { return (b.b - b.a) - (a.b - a.a); });
          if (!cand.length) cand = piecesOf(r).filter(function (p) { var o = other(p, r); return !o || isOpen(o); });
          var pr = preset("d", des.mainDoor) || (house ? preset("d", "D1") : preset("d", "D6")), p = cand[0], c = p && placeOn(p, pr.w / 1000, "m"); if (des.arch) pr.head = des.arch; if (c != null) { hostAdd("door", p, c, Object.assign(pr, { main: 1 }), r); accessOf[r.uid] = "out"; mainDoor = { p: p, c: c, w: pr.w / 1000, room: r }; }
          return !!mainDoor; });
      }
      /* every room opens on the most public neighbour it touches */
      function rank(r, q) { if (!q) return 99; if (r.parent && q.uid === r.parent) return 0; if (q.corr) return 1; if (q.pass) return 2; var s = sp(q); if (!s) return 50; if (s.circ) return 3 + (s.z || 0) * 0.1; if (s.stair) return 30; if (s.open) return 40; return 10 + (s.z || 0) - (s.wet ? -5 : 0); }
      rooms.forEach(function (r) {
        if (r.corr || r.pass || accessOf[r.uid] || r.fill) return; var s = sp(r); if (!s || s.open === "park") return;
        var cand = piecesOf(r).filter(function (p) { var q = other(p, r); return q && (p.b - p.a) >= 0.85; });
        if (r.parent) cand = cand.filter(function (p) { return other(p, r).uid === r.parent; });
        cand.sort(function (a, b) { return rank(r, other(a, r)) - rank(r, other(b, r)) || (b.b - b.a) - (a.b - a.a); });
        if (s.open === "balc") { var pb = cand[0]; if (pb) { var fr = preset("d", "FR1"), cb = placeOn(pb, fr.w / 1000, "m"); if (cb != null) hostAdd("door", pb, cb, fr, other(pb, r)); } return; }
        var pid = s.stair || s.lift ? null : r.parent ? (s.door || "D3") : s.door || (s.win === "hall" && PL.areaOf(r) > 30 ? "D4" : s.circ && PL.areaOf(r) > 25 ? "D4" : "D2");
        if (pid === "D2" && !s.wet) pid = des.roomDoor || "D2"; else if ((pid === "D3" || pid === "D11") && des.wcDoor) pid = des.wcDoor;
        for (var i = 0; i < cand.length; i++) {
          var p = cand[i], q = other(p, r), o = pid ? preset("d", pid) : { w: s.stair ? Math.round((r.inst.stair ? r.inst.stair.ws : 1) * 1000) : 1000, h: 2100, sill: 0, preset: "OP", kind: "opening" };
          if (rank(r, q) >= 40 && i < cand.length - 1) continue;
          var c = placeOn(p, o.w / 1000, s.stair ? "m" : "a"); if (c == null) continue;
          hostAdd(pid ? "door" : "opening", p, c, o, s.stair || s.lift ? q : r); accessOf[r.uid] = { p: p, c: c, q: q }; break;
        }
        /* a second way out of big halls, and kitchen ↔ dining / serving */
        if (PL.areaOf(r) > 60 && !house) { var ex = piecesOf(r).filter(function (p) { var q = other(p, r); return !q && p !== (accessOf[r.uid] || {}).p; }).sort(function (a, b) { return (b.b - b.a) - (a.b - a.a); })[0], pr2 = preset("d", "D4"), c2 = ex && placeOn(ex, pr2.w / 1000, "b"); if (c2 != null) hostAdd("door", ex, c2, pr2, r); }
        if (/kitchen$|^ckitchen|^hkitchen|^hall_kit/.test(r.key)) { var pk = piecesOf(r).filter(function (p) { var q = other(p, r); return q && /^(dining|serve|din_hall|restaurant|mess)$/.test(q.key) && p !== (accessOf[r.uid] || {}).p; })[0]; if (pk) { var ok = { w: house ? 1000 : 1500, h: 2100, sill: 0, preset: "OP", kind: "opening" }, c3 = placeOn(pk, ok.w / 1000, "m"); if (c3 != null) hostAdd("opening", pk, c3, ok, r); } }
        if (r.key === "utility" || r.key === "dish") { var pu = piecesOf(r).filter(function (p) { return !other(p, r); })[0], du = preset("d", "D2"), c4 = pu && placeOn(pu, du.w / 1000, "b"); if (c4 != null) hostAdd("door", pu, c4, du, r); }
      });
      /* the room the main door opens into also opens on to the rest of the house (living → dining / lobby / passage), else it is a dead end */
      rooms.forEach(function (r) { if (accessOf[r.uid] === "out" && r.inst && r.inst.main) { var pin = piecesOf(r).filter(function (p) { var q = other(p, r); return q && (p.b - p.a) >= 1.3 && !/^(toilet|bath|wc|store|stair|lift|duct|utility)/.test(q.key || "") && !(sp(q) && (sp(q).wet || sp(q).stair || sp(q).open)); })
          .sort(function (a, b) { var ra = /dining|lobby|lounge|foyer|corr|pass/.test(other(a, r).key || "") || other(a, r).pass ? 0 : 1, rb = /dining|lobby|lounge|foyer|corr|pass/.test(other(b, r).key || "") || other(b, r).pass ? 0 : 1; return ra - rb || (b.b - b.a) - (a.b - a.a); })[0];
          if (pin) { var oi = { w: 1200, h: 2100, sill: 0, preset: "OP", kind: "opening" }; if (des.arch) oi.head = des.arch; var ci = placeOn(pin, 1.2, "m"); if (ci != null) hostAdd("opening", pin, ci, oi, r); } } });

      /* passages, lobbies and corridors open into the hall / lobby / stair they join */
      rooms.filter(function (q) { return (q.pass || q.corr) && !q.fill; }).forEach(function (q) {
        var cand = piecesOf(q).filter(function (p) { var o = other(p, q); if (!o || p.b - p.a < 1.1) return false; var s2 = sp(o); return (s2 && (s2.circ || s2.stair) && !s2.open) || (o.corr && !q.corr) || (o.pass && q.corr); })
          .sort(function (a, b) { var ra = sp(other(a, q)) && sp(other(a, q)).main ? 0 : 1, rb = sp(other(b, q)) && sp(other(b, q)).main ? 0 : 1; return ra - rb || (b.b - b.a) - (a.b - a.a); });
        if (!cand.length) return; var p = cand[0]; if (p.w.open.some(function (o) { return o[0] < p.b && o[1] > p.a; })) return;
        var wO = Math.min(q.corr ? 1.8 : 1.2, p.b - p.a - 0.4), c = placeOn(p, wO, "m"); if (c != null) hostAdd("opening", p, c, { w: Math.round(wO * 1000), h: 2100, sill: 0, preset: "OP", kind: "opening" }, q);
      });
      /* shops: rolling shutter on the road side */
      rooms.forEach(function (r) { var s2 = sp(r); if (!s2 || !s2.shop) return; var pf = piecesOf(r).filter(function (p) { return !other(p, r); }).sort(function (a, b) { return (a.hz ? 0 : 1) - (b.hz ? 0 : 1) || a.c - b.c; })[0]; if (!pf) return; var L = pf.b - pf.a, wS = Math.min(3000, Math.max(1500, Math.floor((L - 0.6) * 10) * 100)), c = placeOn(pf, wS / 1000, "m"); if (c != null) hostAdd("door", pf, c, { w: wS, h: 2700, sill: 0, preset: "RS", mat: "steel", kind: "shutter", mark: "RS" }, r); });
      /* windows on the outer walls */
      rooms.forEach(function (r) {
        var s = sp(r), kind = r.corr ? "corr" : s && s.win; if (!kind || kind === "none" || s && s.open) return;
        var ext = piecesOf(r).filter(function (p) { return !other(p, r) || isOpen(other(p, r)); }).sort(function (a, b) { return (b.b - b.a) - (a.b - a.a); }); if (!ext.length) return;
        var A = PL.areaOf(r), id, n = 1;
        if (kind === "hab") { id = des.win || "W1"; var pw0 = preset("w", id), ga = pw0 ? pw0.w * pw0.h / 1e6 : 1.8; n = Math.max(1, Math.ceil(A / 10 / ga)); if (pw0 && ext[0].b - ext[0].a < pw0.w / 1000 + 0.6) id = ext[0].b - ext[0].a >= 1.7 ? "W2" : "W3"; }
        else if (kind === "hall") { id = "W10"; n = Math.max(2, Math.ceil(A * 0.12 / 2.52)); }
        else if (kind === "kit") { id = house ? "KW" : "W2"; n = house ? 1 : Math.max(1, Math.ceil(A / 15)); }
        else if (kind === "wet") { id = (ext[0].b - ext[0].a) >= 1.0 ? "BW" : "V2"; n = s.block ? Math.max(1, Math.round((ext[0].b - ext[0].a) / 2.5)) : 1; }
        else if (kind === "store") { id = "V2"; }
        else if (kind === "corr") { id = "W2"; n = 1; ext = ext.filter(function (p) { return !p.hz; }); if (!ext.length) return; n = ext.length; }
        var pr = preset("w", id); if (!pr) return; var made = 0;
        if ((kind === "hab" || kind === "hall") && des.grill && des.grill !== "none") pr.grill = des.grill;
        for (var pass = 0; pass < 2 && made < n; pass++) ext.forEach(function (p) {
          if (made >= n) return; var L = p.b - p.a, wm = pr.w / 1000;
          if (kind === "hall" || kind === "hab") { var per = Math.max(1, Math.floor(L / (wm + 0.9))), cnt = Math.min(per, n - made); for (var j = 0; j < cnt; j++) { var cc = p.a + L * (j + 0.5) / cnt; if (freeAt(p.w, cc - wm / 2, cc + wm / 2)) { hostAdd("window", p, cc, Object.assign({}, pr), r); made++; } else { var c2 = placeOn(p, wm, j % 2 ? "b" : "a"); if (c2 != null) { hostAdd("window", p, c2, Object.assign({}, pr), r); made++; } } } return; }
          var c = placeOn(p, wm, pass ? "a" : "m"); if (c != null) { hostAdd("window", p, c, Object.assign({}, pr), r); made++; }
        });
      });
      /* arches over the road-side windows */
      if (des.arch) pieces.forEach(function (p) { if (!p.w || !p.hz || Math.abs(p.c) > 1e-3) return; ents.forEach(function (e) { if (e.t === "window" && e.host === p.w.e.id && e.h >= 1100) e.head = des.arch; }); });
      /* balconies: railing on the open sides */
      var curvedB = {}; if (/balc|both/.test(des.curve)) rooms.forEach(function (r) { if (!sp(r) || sp(r).open !== "balc") return; var lp = pieces.filter(function (p) { return p.kind === "rail" && (p.s1 === r || p.s2 === r); }).sort(function (a, b) { return (b.b - b.a) - (a.b - a.a); })[0]; if (lp && lp.b - lp.a >= 1.8) curvedB[pieces.indexOf(lp)] = 1; });
      pieces.filter(function (p) { return p.kind === "rail"; }).forEach(function (p) {
        if (curvedB[pieces.indexOf(p)]) { var L = p.b - p.a, sg = Math.min(0.9, L * 0.3), outS = p.s1 ? 1 : -1, n = 8, R = (L * L / 4 + sg * sg) / (2 * sg), pts = []; for (var i = 0; i <= n; i++) { var t = i / n, x = (t - 0.5) * L, y = Math.sqrt(Math.max(0, R * R - x * x)) - (R - sg), a = p.a + L * t, o = outS * y; pts.push(p.hz ? P(a, p.c + o) : P(p.c + o, a)); }
          add({ t: "railing", pts: pts, h: 1000, lvl: lvl, style: des.rail || undefined, layer: "A-RAIL" }); add({ t: "slab", pts: pts.map(function (q) { return q.slice(); }), th: 125, lvl: lvl, off: 0, kind: "floor", layer: "S-SLAB", bay: 1 }); return; }
        add({ t: "railing", pts: p.hz ? [P(p.a, p.c), P(p.b, p.c)] : [P(p.c, p.a), P(p.c, p.b)], h: 1000, lvl: lvl, style: des.rail || undefined, layer: "A-RAIL" }); });
      /* wall finishes: toilet tiles, kitchen dado, front cladding */
      var addFin = function (p, room, k, z0, z1, outside) { var w = p.w; if (!w || !w.e || !B.FIN || !B.FIN[k]) return; var L = B.wallLine(w.e), cen = centroid(room), side = G.dot(G.sub(P(cen[0], cen[1]), L.a), L.n) >= 0 ? 0 : 1, F = B.FIN[k], o = w.e.fin = w.e.fin || {}, id = "f" + (Object.keys(o).length + 1);
        o[id] = { k: k, fc: outside ? 1 - side : side, th: F.th, z0: z0 || 0, z1: z1 == null ? undefined : z1, s0: Math.round((p.a - w.a) * 1000), s1: Math.round((p.b - w.a) * 1000), look: F.look, ded: true }; };
      rooms.forEach(function (r) { var s2 = sp(r); if (!s2) return; var ps = pieces.filter(function (p) { return p.kind === "wall" && (p.s1 === r || p.s2 === r); });
        if (s2.wet && /toilet|bath|wc/.test(r.key) && des.dado !== "none") ps.forEach(function (p) { addFin(p, r, des.dado === "full" ? "tile" : "dado", 0, des.dado === "full" ? 2100 : 1200); });
        if (/kitchen|pantry/.test(r.key) && des.kitDado === "yes") ps.forEach(function (p) { addFin(p, r, "dado", 850, 1450); });
        if (des.facade && des.facade !== "none" && (r.key === "living" || (r.inst && r.inst.main)) ) ps.forEach(function (p) { if (p.hz && Math.abs(p.c) < 1e-3 && !(p.s1 && p.s2)) addFin(p, r, des.facade, 0, null, true); });
      });
      /* rooms */
      function thAt(hz, c, m) { var w = walls.filter(function (w) { return w.hz === hz && Math.abs(w.c - c) < 1e-3 && m > w.a - 1e-3 && m < w.b + 1e-3; })[0]; return w ? w.th / 1000 : 0; }
      rooms.forEach(function (r) {
        var pts = outline(r), n = pts.length, ins = [];
        for (var i = 0; i < n; i++) { var a = pts[i], b = pts[(i + 1) % n], hz = Math.abs(a[1] - b[1]) < 1e-6; ins.push(thAt(hz, hz ? a[1] : a[0], hz ? (a[0] + b[0]) / 2 : (a[1] + b[1]) / 2) / 2 * 1000); }
        var mm = pts.map(function (q) { return P(q[0], q[1]); }), Q = B.insetPoly ? B.insetPoly(mm, ins) : mm, s = sp(r); if (s && s.isVoid) return;
        var fl = r.corr || r.pass ? (house ? des.floorMain : "kota") : !s ? des.floorMain : s.stair ? des.floorStair : s.open ? (s.fin || "kota") : (s.wet || s.fin === "ceramic") ? des.floorWet : s.fin === "granite" ? "granite" : s.fin === "ips" ? "ips" : des.floorMain;
        add({ t: "room", pts: Q, name: r.name, lvl: lvl, floor: fl, skirt: 100, ceil: false, layer: "A-ROOM", plk: r.key });
        if (des.ceil && des.ceil !== "none" && s && !s.wet && !s.open && !s.stair && (/^(living|dining|master|lounge|reception|hlobby|flobby|conf|cabin_head|principal|restaurant|banquet|meeting|chall|din_hall|seminar)$/.test(r.key) || (s.win === "hall" && PL.areaOf(r) > 40 && T.id !== "factory")))
          add({ t: "czone", pts: Q.map(function (q) { return q.slice(); }), lvl: lvl, kind: des.ceil, z: null, dir: 0, start: 0, slope: 0, layer: "A-CEIL" });
      });
      /* stair: dog-leg starting at the end where the room is entered */
      rooms.forEach(function (r) { var s = sp(r); if (!s || !s.stair || !r.inst.stair) return; var sd = r.inst.stair, t = 0.115, x0 = r.x + t, x1 = r.x + r.w - t, y0 = r.y + t, y1 = r.y + r.d - t, along = (x1 - x0) >= (y1 - y0), acc = accessOf[r.uid];
        var corrMode = T.mode === "corr", inL = along ? x1 - x0 : y1 - y0, inW = along ? y1 - y0 : x1 - x0, ws = Math.min(sd.ws, Math.max(0.75, (inW - 0.1) / 2)), slen = (sd.n / 2 - 1) * sd.T + ws, off = corrMode ? 0 : Math.max(0, Math.min(ws + 0.05, inL - slen - 0.01)), u, p0;
        var startHigh = false; if (acc && acc.p) { if (along) startHigh = acc.p.hz ? acc.c > (x0 + x1) / 2 : acc.p.c > (x0 + x1) / 2; else startHigh = acc.p.hz ? acc.p.c > (y0 + y1) / 2 : acc.c > (y0 + y1) / 2; }
        if (along) { u = startHigh ? [-1, 0] : [1, 0]; p0 = startHigh ? [x1 - off, y1] : [x0 + off, y0]; } else { u = startHigh ? [0, -1] : [0, 1]; p0 = startHigh ? [x0, y1 - off] : [x1, y0 + off]; }
        var e = add({ t: "stair", p: P(p0[0], p0[1]), dir: Math.atan2(u[1], u[0]) * 180 / Math.PI, w: Math.round(ws * 1000), n: sd.n, R: Math.round(sd.R * 10000) / 10, T: Math.round(sd.T * 1000), wt: 150, kind: "dogleg", winder: des.stairType === "winder" ? "3" : undefined, lvl: lvl, land: Math.round(ws * 1000), side: 1, rail: "in", layer: "A-STAIR" });
        stairs.push({ e: e, r: r, fi: fi, hole: corrMode ? [x0, y0, x1, y1] : along ? (startHigh ? [x0, y0, x1 - off, y1] : [x0 + off, y0, x1, y1]) : (startHigh ? [x0, y0, x1, y1 - off] : [x0, y0 + off, x1, y1]) }); });
      /* furniture */
      if (cfg.furn !== false) rooms.forEach(function (r) { try { furnish(r, lvl, accessOf[r.uid]); } catch (er) { if (window.console) console.warn("furniture", r.name, er); } });
      return { walls: walls, nodes: nodes, rooms: rooms, mainDoor: mainDoor };
    }
    function outline(r) { if (!r.cut) return [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.d], [r.x, r.y + r.d]];
      var C = r.cut, x0 = r.x, x1 = r.x + r.w, y0 = r.y, y1 = r.y + r.d, L = Math.abs(C.x - x0) < 1e-6, Bm = Math.abs(C.y - y0) < 1e-6;
      if (L && Bm) return [[C.x + C.w, y0], [x1, y0], [x1, y1], [x0, y1], [x0, C.y + C.d], [C.x + C.w, C.y + C.d]];
      if (!L && Bm) return [[x0, y0], [C.x, y0], [C.x, C.y + C.d], [x1, C.y + C.d], [x1, y1], [x0, y1]];
      if (L && !Bm) return [[x0, y0], [x1, y0], [x1, y1], [C.x + C.w, y1], [C.x + C.w, C.y], [x0, C.y]];
      return [[x0, y0], [x1, y0], [x1, C.y], [C.x, C.y], [C.x, y1], [x0, y1]]; }

    /* ---------- furniture: simple, sensible arrangements per room type ---------- */
    function furnish(r, lvl, acc) {
      var s = sp(r); if (!s || !s.furn || r.pass || r.corr) return; var A = B.ASSET_LIB || {}, t = 0.115, box = { x0: r.x + t, y0: r.y + t, x1: r.x + r.w - t, y1: r.y + r.d - t }, part = null;
      if (r.cut) { var pp = parts(r).sort(function (a, b) { return b.w * b.d - a.w * a.d; })[0]; box = { x0: pp.x + t, y0: pp.y + t, x1: pp.x + pp.w - t, y1: pp.y + pp.d - t }; part = pp; }
      var bw = box.x1 - box.x0, bd = box.y1 - box.y0; if (bw < 0.8 || bd < 0.8) return;
      /* the side the room is entered from (so beds and sofas face it but are not in the door) */
      var dside = "S"; if (acc && acc.p) { var p = acc.p; dside = p.hz ? (Math.abs(p.c - r.y) < 1e-3 ? "S" : "N") : (Math.abs(p.c - r.x) < 1e-3 ? "W" : "E"); }
      var opp = { S: "N", N: "S", E: "W", W: "E" }[dside];
      function put(k, x, y, rot) { if (des.furn === "premium" && PL.PREMIUM && PL.PREMIUM[k] && A[PL.PREMIUM[k]]) k = PL.PREMIUM[k]; if (des.furn === "none" && !/^(ewc|iwc|basin|urinal|sink|shower|kitchen_counter|stove|hob|chimney|wall_cabinet|base_cabinet|hospital_bed|blackboard)/.test(k)) return; if (!A[k]) return; add({ t: "asset", kind: k, p: P(x, y), rot: rot || 0, lvl: lvl, layer: /^(ewc|iwc|basin|urinal|sink|shower|vanity|sink_)/.test(k) ? "P-PLUMB" : "A-FURN" }); }
      function sz(k) { var a = A[k] || {}; return [(a.w || 1000) / 1000, (a.d || 1000) / 1000]; }
      function wallPut(k, side, along) { /* against wall side, "along" 0..1 position along that wall */ var z = sz(k), rot = { N: 0, W: 90, S: 180, E: 270 }[side], x, y, f = along == null ? 0.5 : along;
        if (side === "N" || side === "S") { x = box.x0 + z[0] / 2 + (bw - z[0]) * f; y = side === "N" ? box.y1 - z[1] / 2 : box.y0 + z[1] / 2; } else { y = box.y0 + z[0] / 2 + (bd - z[0]) * f; x = side === "E" ? box.x1 - z[1] / 2 : box.x0 + z[1] / 2; }
        put(k, x, y, rot); }
      function grid(k, gx, gy, margin, face) { /* rows of k facing "face" wall (desks / benches), gx gy = pitch, margin from the face wall */ var z = sz(k), rot = { N: 180, S: 0, E: 90, W: 270 }[face] || 0, ws = face === "N" || face === "S", L = ws ? bw : bd, Dd = ws ? bd : bw, nx = Math.max(1, Math.floor((L - 0.6) / gx)), ny = Math.max(1, Math.floor((Dd - margin - 0.5) / gy)), sx = (L - (nx - 1) * gx) / 2;
        for (var i = 0; i < nx; i++) for (var j = 0; j < ny; j++) { var a = sx + i * gx, b = margin + z[1] / 2 + j * gy, x = ws ? box.x0 + a : (face === "E" ? box.x1 - b : box.x0 + b), y = ws ? (face === "N" ? box.y1 - b : box.y0 + b) : box.y0 + a; put(k, x, y, rot); } }
      var f = s.furn, cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2, big = Math.max(bw, bd), longSide = bw >= bd ? "N" : "E";
      if (f === "bed2" || f === "bed1" || f === "hotel" || f === "suite") { var bk = f === "bed1" ? "bed_single" : (Math.min(bw, bd) >= 3.3 ? "bed_queen_storage" : "bed_double"); wallPut(bk, opp, 0.5); if (des.furn === "premium" && f !== "bed1") wallPut("wp_upholstered_headboard", opp, 0.5); var sideW = dside === "S" || dside === "N" ? "E" : "N"; if (bw * bd > 9) wallPut("wardrobe_3door", sideW, 0.8); if (f === "hotel" || f === "suite") wallPut("study_table", { N: "W", S: "E", E: "S", W: "N" }[sideW], 0.6); return; }
      if (f === "hostel") { var nb = r.inst.beds || 2; wallPut("bed_single", "W", 0.2); if (nb > 1) wallPut("bed_single", "E", 0.2); if (nb > 2) wallPut("bunk_bed", "W", 0.8); wallPut("study_table", opp, 0.5); return; }
      if (f === "living" || f === "lounge" || f === "lounge_big") { wallPut(big > 4.2 ? "sofa_L" : "sofa_3", opp, 0.5); if (des.furn === "premium") { wallPut("tv_unit_floating", dside === "S" || dside === "N" ? "E" : "N", 0.5); wallPut("wp_tv_back_panel", dside === "S" || dside === "N" ? "E" : "N", 0.5); } var off = { N: [0, -1.4], S: [0, 1.4], E: [-1.4, 0], W: [1.4, 0] }[opp]; put("center_table", cx + off[0] * 0.4, cy + off[1] * 0.4, { N: 0, S: 180, E: 270, W: 90 }[opp]); return; }
      if (f === "dining") { put(bw * bd >= 11 ? "dining_table" : "dining_table_4", cx, cy, bw >= bd ? 0 : 90); return; }
      if (f === "kitchen" && des.kitchen === "modular") { wallPut(Math.min(bw, bd) >= 2.4 ? "kitchen_counter_L" : "kitchen_counter", opp, 0); wallPut("wall_cabinet_900", opp, 0.15); wallPut("wall_cabinet_900", opp, 0.85); wallPut("chimney", opp, 0.5); wallPut("fridge_double_door", dside === "S" || dside === "N" ? "E" : "N", 0.85); return; }
      if (f === "kitchen" || f === "pantry") { wallPut(f === "pantry" ? "kitchen_counter" : (Math.min(bw, bd) >= 2.4 ? "kitchen_counter_L" : "kitchen_counter"), opp, 0); return; }
      if (f === "ckitchen" || f === "prep") { wallPut("kitchen_counter", opp, 0.2); wallPut("kitchen_counter", opp, 0.8); wallPut("sink_cabinet_double", dside === "S" || dside === "N" ? "E" : "N", 0.5); if (big > 5) put("kitchen_island", cx, cy, bw >= bd ? 0 : 90); return; }
      if (f === "dish") { wallPut("sink_cabinet_double", opp, 0.5); return; }
      if (f === "utility") { wallPut("sink", opp, 0.5); return; }
      if (f === "wc" || f === "wc1" || f === "bath") { var seat = des.wc === "iwc" || (des.wc === "mix" && r.key === "toilet") ? "iwc" : "ewc"; wallPut(seat, opp, 0.15); if (des.shower === "yes" && r.parent && bw * bd > 3.0) put("shower_cubicle_glass", box.x1 - 0.45, box.y1 - 0.45, 0); if (des.furn === "premium" && r.parent) { wallPut("mirror_cabinet", opp, 0.85); wallPut("towel_rail_600", dside === "S" || dside === "N" ? "E" : "N", 0.5); } if (f !== "wc1" && Math.max(bw, bd) > 1.5) wallPut("basin", opp, 0.85); if (f === "bath" || (f === "wc" && bw * bd > 3.2)) put("shower_overhead", box.x1 - 0.4, box.y1 - 0.4, 0); return; }
      if (f === "tblock_m" || f === "tblock_f") { var fx = r.inst.fix || { wc: 2, ur: 1, wb: 1 }, wall = bw >= bd ? "N" : "E", Lw = bw >= bd ? bw : bd, nwc = Math.min(fx.wc + (fx.bath || 0), Math.max(1, Math.floor(Lw / 1.0)));
        for (var i = 0; i < nwc; i++) wallPut(i < fx.wc ? "ewc" : "shower_tray_900", wall, nwc === 1 ? 0.2 : i / Math.max(1, nwc - 1) * 0.9);
        var w2 = wall === "N" ? "S" : "W", nu = fx.ur || 0, nwb = fx.wb || 1; for (var j = 0; j < nu; j++) wallPut("urinal", w2, 0.65 + 0.3 * j / Math.max(1, nu)); for (var k = 0; k < Math.min(nwb, 4); k++) wallPut("basin", w2, 0.1 + 0.4 * k / Math.max(1, Math.min(nwb, 4))); return; }
      if (f === "handwash") { var nwb2 = Math.max(2, Math.floor(big / 0.9)); for (var h = 0; h < Math.min(nwb2, 8); h++) wallPut("basin", bw >= bd ? "N" : "E", h / Math.max(1, Math.min(nwb2, 8) - 1)); return; }
      if (f === "class" || f === "lecture" || f === "tutorial") { var face = bw >= bd ? "W" : "S"; wallPut("blackboard", face, 0.5); wallPut("teacher_table", face === "W" ? "W" : "S", 0.5); grid("school_bench_desk", 1.5, 1.05, 2.0, face); return; }
      if (f === "work" || f === "comp" || f === "drawing" || f === "lab") { grid(f === "lab" ? "kitchen_counter" : "office_desk", f === "lab" ? 3.0 : 1.8, f === "lab" ? 1.8 : 1.6, 0.9, bw >= bd ? "S" : "W"); return; }
      if (f === "cabin" || f === "cabin_big" || f === "office" || f === "opd") { put(f === "office" ? "office_desk_L" : "office_desk", cx, cy, { N: 0, S: 180, E: 270, W: 90 }[opp]); var v = { N: [0, 0.55], S: [0, -0.55], E: [0.55, 0], W: [-0.55, 0] }[opp]; put("executive_chair", cx + v[0], cy + v[1], { N: 180, S: 0, E: 90, W: 270 }[opp]); if (f === "opd") wallPut("hospital_bed", dside === "S" || dside === "N" ? "E" : "N", 0.5); else wallPut("filing_cabinet_4", opp, 0.1); return; }
      if (f === "conf" || f === "staff" || f === "seminar") { if (f === "seminar") { grid("chair", 0.6, 0.9, 2.5, bw >= bd ? "W" : "S"); return; } put("conference_table_8", cx, cy, bw >= bd ? 0 : 90); return; }
      if (f === "reception" || f === "lobby" || f === "waiting") { if (f !== "waiting") wallPut("reception_counter", opp, 0.5); var sw = dside === "S" || dside === "N" ? "E" : "N"; wallPut("sofa_3", sw, 0.5); if (f === "waiting" || f === "lobby") grid("sofa_3", 2.6, 1.8, 2.2, dside === "S" || dside === "N" ? "W" : "S"); return; }
      if (f === "canteen") { grid("dining_table_4", 2.4, 2.4, 1.0, "S"); return; }
      if (f === "library") { for (var b2 = 0; b2 < Math.floor(bw / 2.2); b2++) wallPut("bookshelf", "N", b2 / Math.max(1, Math.floor(bw / 2.2) - 1)); grid("dining_table", 2.8, 2.4, 1.6, "S"); return; }
      if (f === "ward" || f === "ward1") { var nbd = f === "ward1" ? 1 : Math.max(1, Math.floor((bw >= bd ? bw : bd) / 2.2)); for (var q = 0; q < nbd; q++) wallPut("hospital_bed", bw >= bd ? "N" : "E", nbd === 1 ? 0.5 : q / (nbd - 1)); if (f === "ward" && Math.min(bw, bd) > 5) for (q = 0; q < nbd; q++) wallPut("hospital_bed", bw >= bd ? "S" : "W", nbd === 1 ? 0.5 : q / (nbd - 1)); return; }
      if (f === "study") { wallPut("study_table", opp, 0.5); wallPut("bookshelf", dside === "S" || dside === "N" ? "E" : "N", 0.5); return; }
      if (f === "store" || f === "records" || f === "locker" || f === "cold") { wallPut(f === "cold" ? "fridge_double_door" : "steel_almirah", opp, 0.25); if (big > 2.4) wallPut(f === "cold" ? "fridge_double_door" : "steel_almirah", opp, 0.75); return; }
      if (f === "serve") { wallPut("kitchen_counter", bw >= bd ? "S" : "W", 0.5); return; }
      if (f === "sick") { wallPut("hospital_bed", opp, 0.5); return; }
    }

    /* an L / U building gets one sloped roof per wing: the outline is cut into rectangles (along x or along y, whichever keeps the
       biggest piece whole), the main block keeps its own roof and every wing runs on into it up to the main ridge, so the roofs meet
       in valleys instead of leaving a flat gap. [x0, y0, x1, y1, isWing] in metres. */
    function roofWings(ol) {
      var cut = function (alongX) { var cs = ol.map(function (q) { return alongX ? q[0] : q[1]; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; }), out = [];
        for (var i = 0; i + 1 < cs.length; i++) { var m = (cs[i] + cs[i + 1]) / 2, hits = [];
          ol.forEach(function (q, j) { var r2 = ol[(j + 1) % ol.length], a0 = alongX ? q[0] : q[1], a1 = alongX ? r2[0] : r2[1], b0 = alongX ? q[1] : q[0]; if ((a0 - m) * (a1 - m) < 0) hits.push(b0); });
          hits.sort(function (a, b) { return a - b; }); for (var k = 0; k + 1 < hits.length; k += 2) { var lo = hits[k], hi = hits[k + 1], last = out.filter(function (o) { return Math.abs(o.hi - hi) < 1e-6 && Math.abs(o.lo - lo) < 1e-6 && Math.abs(o.b - cs[i]) < 1e-6; })[0];
            if (last) last.b = cs[i + 1]; else out.push({ a: cs[i], b: cs[i + 1], lo: lo, hi: hi }); } }
        return out.map(function (o) { return alongX ? [o.a, o.lo, o.b, o.hi] : [o.lo, o.a, o.hi, o.b]; }); };
      var area = function (r) { return (r[2] - r[0]) * (r[3] - r[1]); }, A = cut(true), Bc = cut(false), big = function (L) { return Math.max.apply(null, L.map(area)); };
      var L = big(A) >= big(Bc) ? A : Bc; if (L.length < 2) return L;
      var main = L.slice().sort(function (a, b) { return area(b) - area(a); })[0];
      return L.map(function (r) { if (r === main) return r.slice(); var o = r.slice(); o[4] = 1;
        if (Math.abs(r[1] - main[3]) < 1e-6) o[1] = main[3] - (main[3] - main[1]) / 2; else if (Math.abs(r[3] - main[1]) < 1e-6) o[3] = main[1] + (main[3] - main[1]) / 2;
        else if (Math.abs(r[0] - main[2]) < 1e-6) o[0] = main[2] - (main[2] - main[0]) / 2; else if (Math.abs(r[2] - main[0]) < 1e-6) o[2] = main[0] + (main[2] - main[0]) / 2;
        return o; });
    }
    /* ---------- slabs (stair wells cut), stair cabin and parapet on the terrace ---------- */
    var olM = plan.outline ? plan.outline.map(function (q) { return P(q[0], q[1]); }) : [P(0, 0), P(W, 0), P(W, D), P(0, D)];
    var outer = B.insetPoly ? B.insetPoly(olM, olM.map(function () { return -115; })) : [P(-0.115, -0.115), P(W + 0.115, -0.115), P(W + 0.115, D + 0.115), P(-0.115, D + 0.115)];
    for (var f2 = 0; f2 < nF; f2++) {
      var holes = stairs.filter(function (s) { return s.fi === f2 && !(f2 === nF - 1 && (sloped || T.roof === "gi" || des.roof === "gi")); }).map(function (s) { var h = s.hole; return [P(h[0], h[1]), P(h[2], h[1]), P(h[2], h[3]), P(h[0], h[3])]; });
      plan.floors[f2].forEach(function (r) { if (sp(r) && sp(r).open === "court") { var t = 0.115; holes.push([P(r.x + t, r.y + t), P(r.x + r.w - t, r.y + t), P(r.x + r.w - t, r.y + r.d - t), P(r.x + t, r.y + r.d - t)]); } });
      if (sloped && f2 === nF - 1 && T.roof !== "gi") { var tile = /^tile/.test(des.roof), gab = /gable/.test(des.roof), rbase = { t: "roof", kind: gab ? "gable" : "hip", slope: des.roof === "tile_gable" ? 32 : tile ? 25 : 22, th: tile ? 100 : 125, lvl: "L" + f2, off: H, mat: tile ? "tile" : "rcc", over: 600, layer: "A-ROOF" };
        /* a courtyard (aangan) house: four roofs round the open court — the front and back ones run the full width, the side ones run
           into them up to their ridges — so the court stays open to the sky */
        var crt = plan.floors[f2].filter(function (r) { return sp(r) && sp(r).open === "court"; })[0];
        if (!plan.outline && crt) { var c0 = [crt.x, crt.y, crt.x + crt.w, crt.y + crt.d], rs = [];
          if (c0[1] > 0.5) rs.push([0, 0, W, c0[1]]); if (D - c0[3] > 0.5) rs.push([0, c0[3], W, D]);
          var fy = c0[1] > 0.5 ? c0[1] / 2 : c0[1], by = D - c0[3] > 0.5 ? c0[3] + (D - c0[3]) / 2 : c0[3];
          if (c0[0] > 0.5) rs.push([0, fy, c0[0], by, 1]); if (W - c0[2] > 0.5) rs.push([c0[2], fy, W, by, 1]);
          rs.forEach(function (rc) { var e = 0.115, q = [rc[0] - e, rc[1] - e, rc[2] + e, rc[3] + e]; add(Object.assign({ pts: [P(q[0], q[1]), P(q[2], q[1]), P(q[2], q[3]), P(q[0], q[3])], dir: q[2] - q[0] >= q[3] - q[1] ? 0 : 90 }, rbase, { kind: rc[4] ? "hip" : rbase.kind })); }); }
        else if (!plan.outline) add(Object.assign({ pts: outer.map(function (q) { return q.slice(); }), dir: W >= D ? 0 : 90 }, rbase));
        else roofWings(plan.outline).forEach(function (rc) { var e = 0.115, q = [rc[0] - e, rc[1] - e, rc[2] + e, rc[3] + e]; add(Object.assign({ pts: [P(q[0], q[1]), P(q[2], q[1]), P(q[2], q[3]), P(q[0], q[3])], dir: q[2] - q[0] >= q[3] - q[1] ? 0 : 90 }, rbase, { kind: gab && rc[4] ? "hip" : rbase.kind })); });
        if (!tile) continue; var hs = holes; if (hs.length) add({ t: "slab", pts: outer.map(function (q) { return q.slice(); }), holes: hs, th: house ? 125 : 150, lvl: "L" + f2, off: H, kind: "ceiling", layer: "S-SLAB" }); else add({ t: "slab", pts: outer.map(function (q) { return q.slice(); }), th: house ? 125 : 150, lvl: "L" + f2, off: H, kind: "ceiling", layer: "S-SLAB" }); continue; }
      if (des.roof === "gi" && f2 === nF - 1 && T.roof !== "gi") T = Object.assign({}, T, { roof: "gi" });
      if (T.roof === "gi" && f2 === nF - 1) { add({ t: "roof", pts: outer.map(function (q) { return q.slice(); }), kind: "gable", slope: 12, th: 50, lvl: "L" + f2, off: H, mat: "gi", over: 600, dir: W >= D ? 0 : 90, layer: "A-ROOF" }); continue; }
      add({ t: "slab", pts: outer.map(function (q) { return q.slice(); }), holes: holes, th: house ? 125 : 150, lvl: "L" + f2, off: H, kind: f2 === nF - 1 ? "roof" : "ceiling", layer: "S-SLAB" });
    }
    var topStairs = sloped || T.roof === "gi" ? [] : stairs.filter(function (s) { return s.fi === nF - 1; });
    if (sloped || T.roof === "gi") stairs.filter(function (s) { return s.fi === nF - 1 && nF > 1; }).forEach(function (s) { s.e._del = 1; });
    topStairs.forEach(function (s) { var r = s.r, c = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.d], [r.x, r.y + r.d]], ws = [];
      for (var i = 0; i < 4; i++) ws.push(add({ t: "wall", a: P(c[i][0], c[i][1]), b: P(c[(i + 1) % 4][0], c[(i + 1) % 4][1]), th: 230, h: null, mat: "brick", just: "c", lvl: "LT", ext: true, layer: "A-WALL" }));
      /* door to the terrace on the side that is not on the building edge, else any */
      var onEdge = function (a, b) { var ol = plan.outline || [[0, 0], [W, 0], [W, D], [0, D]]; return ol.some(function (q, j) { var r2 = ol[(j + 1) % ol.length]; if (Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(q[1] - r2[1]) < 1e-6 && Math.abs(q[1] - a[1]) < 1e-3) return Math.min(Math.max(a[0], b[0]), Math.max(q[0], r2[0])) - Math.max(Math.min(a[0], b[0]), Math.min(q[0], r2[0])) > 0.3; if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(q[0] - r2[0]) < 1e-6 && Math.abs(q[0] - a[0]) < 1e-3) return Math.min(Math.max(a[1], b[1]), Math.max(q[1], r2[1])) - Math.max(Math.min(a[1], b[1]), Math.min(q[1], r2[1])) > 0.3; return false; }); };
      var inner = [0, 1, 2, 3].filter(function (i) { return !onEdge(c[i], c[(i + 1) % 4]); }), k = inner.length ? inner[0] : 0, wl = ws[k], L = G.dist(wl.a, wl.b);
      add({ t: "door", host: wl.id, at: Math.min(L - 600, Math.max(600, L / 2)), flip: false, swing: "l", w: 900, h: 2100, sill: 0, preset: "D2", mat: "flush", kind: "single", mark: "D2", layer: "A-DOOR" });
      add({ t: "slab", pts: [P(r.x - 0.115, r.y - 0.115), P(r.x + r.w + 0.115, r.y - 0.115), P(r.x + r.w + 0.115, r.y + r.d + 0.115), P(r.x - 0.115, r.y + r.d + 0.115)], th: 120, lvl: "LT", off: 2700, kind: "roof", layer: "S-SLAB" });
      if (frame) c.forEach(function (q) { add({ t: "column", p: P(q[0], q[1]), w: house ? 230 : 300, d: house ? 230 : 300, rot: 0, shape: "rect", lvl: "LT", h: 2700, layer: "S-COL" }); });
    });
    if (T.roof !== "gi" && !sloped) add({ t: "railing", pts: olM.concat([olM[0]]).map(function (q) { return q.slice(); }), h: 1000, lvl: "LT", style: des.parapet || "par_solid", layer: "A-RAIL" });
    /* courtyard: parapet round the opening on the terrace */
    if (!sloped) plan.floors[nF - 1].forEach(function (r) { if (!(sp(r) && sp(r).open === "court")) return; var c = [P(r.x, r.y), P(r.x + r.w, r.y), P(r.x + r.w, r.y + r.d), P(r.x, r.y + r.d)]; add({ t: "railing", pts: c.concat([c[0].slice()]), h: 1000, lvl: "LT", style: des.parapet || "par_solid", layer: "A-RAIL" }); });
    /* terrace: solar panels and a pergola sit-out on a flat roof */
    if (!sloped && T.roof !== "gi" && /solar|pergola|both/.test(des.terrace || "") && B.ASSET_LIB) {
      var busy = []; plan.floors[nF - 1].forEach(function (r) { if (sp(r) && (sp(r).stair || sp(r).open === "court" || sp(r).lift)) busy.push([r.x - 0.6, r.y - 0.6, r.x + r.w + 0.6, r.y + r.d + 0.6]); });
      var free = function (x0, y0, x1, y1) { return x0 >= 0.4 && y0 >= 0.4 && x1 <= W - 0.4 && y1 <= D - 0.4 && !busy.some(function (b) { return x0 < b[2] && x1 > b[0] && y0 < b[3] && y1 > b[1]; }) && (!plan.outline || [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].every(function (q) { return G.inPoly(q, plan.outline); })); };
      if (/pergola|both/.test(des.terrace)) { var done1 = false; [[W - 3.6, D - 3.6], [0.6, D - 3.6], [W - 3.6, 0.6], [0.6, 0.6]].forEach(function (q) { if (done1 || !free(q[0], q[1], q[0] + 3, q[1] + 3)) return; add({ t: "asset", kind: "pergola", p: P(q[0] + 1.5, q[1] + 1.5), rot: 0, lvl: "LT", layer: "L-LAND" }); busy.push([q[0] - 0.3, q[1] - 0.3, q[0] + 3.3, q[1] + 3.3]); done1 = true; }); }
      if (/solar|both/.test(des.terrace)) { var nA = 0, maxA = house ? 2 : 8; for (var yy = 0.6; yy + 2.0 <= D - 0.4 && nA < maxA; yy += 2.6) for (var xx = 0.6; xx + 3.4 <= W - 0.4 && nA < maxA; xx += 3.8) if (free(xx, yy, xx + 3.4, yy + 2.0)) { add({ t: "asset", kind: "solar_array_4", p: P(xx + 1.7, yy + 1.0), rot: 0, lvl: "LT", layer: "E-ELEC" }); busy.push([xx, yy, xx + 3.4, yy + 2.0]); nA++; } }
    }
    /* solar water heater on a flat terrace: about 25 L per person (IS 12933 practice), one unit per 200 L */
    var pers = Math.max(1, +cfg.persons || 5), swhN = 0;
    if (des.swh === "auto" && !sloped && T.roof !== "gi" && B.ASSET_LIB && B.ASSET_LIB.solar_water_heater && (house || /hostel|hotel|hospital|canteen/.test(T.id))) {
      var bz = []; plan.floors[nF - 1].forEach(function (r) { if (sp(r) && (sp(r).stair || sp(r).open === "court" || sp(r).lift)) bz.push([r.x - 0.6, r.y - 0.6, r.x + r.w + 0.6, r.y + r.d + 0.6]); });
      ents.forEach(function (e) { if (e.t === "asset" && e.lvl === "LT") { var A2 = B.ASSET_LIB[e.kind] || { w: 1000, d: 1000 }, cx = (e.p[0] - ox) / 1000, cy = (e.p[1] - oy) / 1000; bz.push([cx - A2.w / 2000 - 0.3, cy - A2.d / 2000 - 0.3, cx + A2.w / 2000 + 0.3, cy + A2.d / 2000 + 0.3]); } });
      var need = Math.min(house ? 2 : 6, Math.max(1, Math.ceil(pers * 25 / 200)));
      for (var yy2 = D - 2.0; yy2 >= 0.5 && swhN < need; yy2 -= 2.0) for (var xx2 = 0.5; xx2 + 1.9 <= W - 0.4 && swhN < need; xx2 += 2.3) {
        var q4 = [xx2, yy2, xx2 + 1.9, yy2 + 1.5]; if (q4[3] > D - 0.4) continue;
        if (bz.some(function (b) { return q4[0] < b[2] && q4[2] > b[0] && q4[1] < b[3] && q4[3] > b[1]; })) continue;
        if (plan.outline && ![[q4[0], q4[1]], [q4[2], q4[1]], [q4[2], q4[3]], [q4[0], q4[3]]].every(function (q) { return G.inPoly(q, plan.outline); })) continue;
        add({ t: "asset", kind: "solar_water_heater", p: P(xx2 + 0.95, yy2 + 0.75), rot: 180, lvl: "LT", layer: "P-FIX", name: "Solar water heater 200 L" }); bz.push([q4[0] - 0.3, q4[1] - 0.3, q4[2] + 0.3, q4[3] + 0.3]); swhN++;
      }
    }
    /* outside stair (G+1): a straight flight along the side wall in the side setback, from the front part of the house up to a
       landing at the first floor, with a door into the first floor there */
    if (cfg.outStair && nF >= 2) { var sgn = cfg.outStair === "right" ? 1 : -1, wsO = 1.0, nO = Math.ceil(H / 175), RO = H / nO, TO = 250, lenO = (nO - 1) * TO / 1000, y0 = 0.6, yL = y0 + lenO;
      if (yL + 1.2 <= D) { var xf = sgn > 0 ? W + 0.115 + 0.05 : -0.115 - 0.05;
        add({ t: "stair", p: P(xf, y0), dir: 90, w: Math.round(wsO * 1000), n: nO, R: Math.round(RO * 10) / 10, T: TO, wt: 150, kind: "straight", lvl: "L0", side: sgn > 0 ? -1 : 1, rail: "out", layer: "A-STAIR", outside: 1 });
        var xo = xf + sgn * wsO, land = [P(xf, yL), P(xo, yL), P(xo, yL + 1.2), P(xf, yL + 1.2)]; add({ t: "slab", pts: land, th: 150, lvl: "L1", off: 0, kind: "floor", layer: "S-SLAB", outside: 1 });
        add({ t: "railing", pts: [P(xo, yL), P(xo, yL + 1.2), P(xf, yL + 1.2)], h: 1000, lvl: "L1", style: des.rail || "ms_bars", layer: "A-RAIL" });
        if (frame) [[xo - sgn * 0.15, yL + 1.05]].forEach(function (q) { add({ t: "column", p: P(q[0], q[1]), w: 230, d: 230, rot: 0, shape: "rect", lvl: "L0", layer: "S-COL", outside: 1 }); });
        /* the first-floor door at the landing */
        var xw = P(sgn > 0 ? W : 0, 0)[0], yc = P(0, yL + 0.6)[1], hostW = ents.filter(function (e) { return e.t === "wall" && e.lvl === "L1" && !e.site && Math.abs(e.a[0] - xw) < 5 && Math.abs(e.b[0] - xw) < 5 && Math.min(e.a[1], e.b[1]) < yc - 500 && Math.max(e.a[1], e.b[1]) > yc + 500; })[0];
        if (hostW) { var dv = B.DOORS.filter(function (q) { return q.id === (des.mainDoor || "D1"); })[0] || B.DOORS[0]; add({ t: "door", host: hostW.id, at: Math.abs(yc - hostW.a[1]), w: Math.min(dv.w, 1000), h: dv.h, sill: 0, preset: dv.id, mat: dv.mat, kind: dv.kind, style: dv.style, mark: dv.id, flip: sgn < 0, swing: "l", layer: "A-DOOR" }); }
        PL._outNote = "Outside stair along the " + cfg.outStair + " wall: " + nO + " risers of " + Math.round(RO) + " mm, treads 250 mm, 1.0 m wide, landing 1.0 × 1.2 m and a door into the first floor"; }
      else PL._outNote = "The house is too short for an outside straight stair — put the stair inside"; }
    /* porch / portico in front of the main door (into the front setback) */
    var md = perFloor[0] && perFloor[0].mainDoor, fset = cfg.rules.f || 0;
    if (md && des.porch && des.porch !== "none" && md.p.hz && Math.abs(md.p.c) < 1e-3 && fset >= 2.0) {
      var ver = des.porch === "verandah", dp = Math.min(ver ? 2.1 : 2.4, fset - 0.6), wp = ver ? W : Math.max(3.0, md.w + 2.4), x0 = ver ? 0 : Math.max(0, md.c - wp / 2), x1 = Math.min(W, x0 + wp); if (!ver) x0 = Math.max(0, x1 - wp);
      var cshape = des.porch === "round" || des.porch === "curved" || des.porch === "dome" ? "circle" : des.cols === "rect" ? "rect" : des.cols, pcol = function (x, y) { add({ t: "column", p: P(x, y), w: 300, d: 300, rot: 0, shape: cshape, lvl: "L0", layer: "S-COL", porch: 1 }); if (frame) add({ t: "footing", p: P(x, y), L: 1000, B: 1000, D: 300, df: 1200, rot: 0, lvl: "L0", ped: { w: 300, d: 300 }, pcc: { off: 150, th: 100 }, layer: "S-FOOT" }); };
      var poly;
      if (des.porch === "curved") { poly = []; var n = 10, cx = (x0 + x1) / 2, rx = (x1 - x0) / 2; for (var i = 0; i <= n; i++) { var a = Math.PI * i / n; poly.push(P(cx + rx * Math.cos(a), -dp * Math.sin(a))); } poly = poly.reverse(); [Math.PI * 0.2, Math.PI * 0.5, Math.PI * 0.8].forEach(function (a) { pcol(cx + (rx - 0.25) * Math.cos(a), -(dp - 0.25) * Math.sin(a)); }); }
      else { poly = [P(x0, -dp), P(x1, -dp), P(x1, 0), P(x0, 0)]; var nc = ver ? Math.max(1, Math.ceil((x1 - x0 - 0.4) / 3.5)) : 1; for (var ci = 0; ci <= nc; ci++) pcol(x0 + 0.2 + (x1 - x0 - 0.4) * ci / nc, -dp + 0.2);
        if (ver) { var rl = []; for (var cj = 0; cj < nc; cj++) { var xa = x0 + 0.2 + (x1 - x0 - 0.4) * cj / nc + 0.2, xb = x0 + 0.2 + (x1 - x0 - 0.4) * (cj + 1) / nc - 0.2; if (Math.abs(xa + 0.2 - (md.c)) < 0.01) continue; if (md.c > xa - 0.2 && md.c < xb + 0.2 && cj === Math.floor((md.c - x0) / ((x1 - x0) / nc))) continue; add({ t: "railing", pts: [P(xa, -dp + 0.2), P(xb, -dp + 0.2)], h: 900, lvl: "L0", style: des.rail || "ms_bars", layer: "A-RAIL" }); } } }
      if (des.porch === "gable") add({ t: "roof", pts: [P(x0 - 0.15, -dp - 0.15), P(x1 + 0.15, -dp - 0.15), P(x1 + 0.15, 0), P(x0 - 0.15, 0)], kind: "gable", slope: 28, th: 100, lvl: "L0", off: Math.min(H, 3000), mat: /tile/.test(des.roof) ? "tile" : "rcc", over: 300, dir: 90, layer: "A-ROOF", porch: 1 });
      else add({ t: "slab", pts: poly, th: 125, lvl: "L0", off: H, kind: "roof", layer: "S-SLAB", porch: 1 });
      if (des.porch === "dome") add({ t: "dome", c: P((x0 + x1) / 2, -dp / 2), r: Math.round(Math.min(x1 - x0, dp) * 450), h: Math.round(Math.min(x1 - x0, dp) * 400), th: 100, lvl: "L0", off: H + 125, layer: "A-ROOF" });
      add({ t: "slab", pts: poly.map(function (q) { return q.slice(); }), th: 100, lvl: "L0", off: 0, kind: "floor", layer: "S-SLAB", porch: 1 });
      md.edge = -dp; md.ew = x1 - x0;
    }
    /* entrance steps (plinth to ground) and a 1:12 ramp for public buildings */
    if (md && des.entry && des.entry !== "none" && md.p.hz && Math.abs(md.p.c) < 1e-3) {
      var rise = -(bs.ngl || -450), ye = md.edge != null ? md.edge : 0, sw = Math.max(1.2, Math.min(md.ew ? md.ew - 0.6 : md.w + 0.6, 3.0)), I = B.stepsInfo ? B.stepsInfo({ rise: rise, tread: 300, w: sw * 1000 }) : { len: 900 }, run = I.len / 1000;
      if (md.edge == null) { add({ t: "slab", pts: [P(md.c - sw / 2 - 0.15, -0.9), P(md.c + sw / 2 + 0.15, -0.9), P(md.c + sw / 2 + 0.15, 0), P(md.c - sw / 2 - 0.15, 0)], th: 100, lvl: "L0", off: 0, kind: "floor", layer: "S-SLAB", porch: 1 }); ye = -0.9; }
      if (fset >= Math.abs(ye) + run + 0.2) add({ t: "steps", a: P(md.c, ye - run), dir: 90, w: Math.round(sw * 1000), rise: rise, tread: 300, lvl: "L0", z: -rise, mat: "brick", layer: "A-STAIR" });
      if (des.entry === "steps_ramp") { var rr = rise * 12 / 1000, lx = md.c + sw / 2 + 0.3, dirR = 1; if (ox / 1000 + lx + 1.5 + rr > cfg.plot.w - 0.3) { lx = md.c - sw / 2 - 0.3; dirR = -1; }
        var land = [P(lx, ye - 1.5), P(lx + dirR * 1.5, ye - 1.5), P(lx + dirR * 1.5, ye), P(lx, ye)]; add({ t: "slab", pts: dirR > 0 ? land : land.reverse(), th: 100, lvl: "L0", off: 0, kind: "floor", layer: "S-SLAB", porch: 1 });
        if (fset >= Math.abs(ye) + 1.5) add({ t: "ramp", a: P(lx + dirR * (1.5 + rr), ye - 0.75), b: P(lx + dirR * 1.5, ye - 0.75), w: 1200, rise: rise, th: 150, z: -rise, lvl: "L0", layer: "A-STAIR" }); }
    }
    /* chajjas (sunshades) over the outer windows: 600 mm deep, 150 mm wider each side, at lintel top */
    if (cfg.chajja !== false) ents.filter(function (e) { return e.t === "window"; }).forEach(function (wn) {
      var wl = ents.filter(function (x) { return x.id === wn.host; })[0]; if (!wl || !wl.ext) return; var L = B.wallLine(wl), mid = G.add(L.a, G.mul(L.u, wn.at)), cen = G.mul(G.add(olM[0], olM[2] || olM[1]), 0.5), out = G.dot(G.sub(mid, ents.length ? polyCen(olM) : cen), L.n) >= 0 ? L.n : G.mul(L.n, -1);
      var face = G.add(mid, G.mul(out, wl.th / 2)), half = wn.w / 2 + 150, a = G.add(face, G.mul(L.u, -half)), b = G.add(face, G.mul(L.u, half)), dep = 600;
      add({ t: "slab", pts: [a, b, G.add(b, G.mul(out, dep)), G.add(a, G.mul(out, dep))].map(function (q) { return [r1(q[0]), r1(q[1])]; }), th: 75, lvl: wl.lvl, off: (wn.sill || 0) + wn.h + 150, kind: "chajja", layer: "S-SLAB" }); });
    function polyCen(pp) { var x = 0, y = 0; pp.forEach(function (q) { x += q[0]; y += q[1]; }); return [x / pp.length, y / pp.length]; }
    /* site: compound wall on the plot line with a vehicle gate and a wicket gate on the road side */
    if (cfg.site !== false) {
      var ngl = bs.ngl || -450, cwH = (+des.cwH || 1800) - ngl, gx = Math.min((cfg.plotPoly ? ring[1][0] : pw) - 2000, Math.max(2000, ox + (function () { var pk = plan.floors[0].filter(function (r) { return sp(r) && sp(r).open === "park"; })[0] || plan.floors[0].filter(function (r) { return r.inst && r.inst.main; })[0]; return pk ? (pk.x + pk.w / 2) * 1000 : W * 500; })()));
      var cwall = function (a, b) { return add({ t: "wall", a: a, b: b, th: 230, h: cwH, base: ngl, mat: "brick", just: "r", lvl: "L0", ext: true, layer: "A-SITE", site: 1 }); };
      if (+des.cwH === 0) { /* no compound wall */ } else {
      var front = null; ring.forEach(function (q, i) { var w2 = cwall(q.slice(), ring[(i + 1) % ring.length].slice()); if (!i) front = w2; });
      if (des.gate === "sliding") { gx = Math.min((cfg.plotPoly ? ring[1][0] : pw) - 2600, Math.max(2600, gx)); add({ t: "opening", host: front.id, at: gx, flip: true, swing: "l", w: 4500, h: 1800, sill: 0, preset: "OP", kind: "opening", layer: "A-SITE", gate: 1 }); if (B.ASSET_LIB && B.ASSET_LIB.gate_sliding_4500) add({ t: "asset", kind: "gate_sliding_4500", p: [gx, 300], rot: 0, lvl: "L0", layer: "A-SITE" }); }
      else if (des.gate === "none") add({ t: "opening", host: front.id, at: gx, flip: true, swing: "l", w: 3000, h: 1800, sill: 0, preset: "OP", kind: "opening", layer: "A-SITE", gate: 1 });
      else add({ t: "door", host: front.id, at: gx, flip: true, swing: "l", w: 3000, h: 1800, sill: 0, preset: "G1", mat: "steel", kind: "double", style: "grill", mark: "G1", layer: "A-SITE", gate: 1 });
      var wx = gx + 3200 < pw - 800 ? gx + 3200 : gx - 3200; if (wx > 800) add({ t: "door", host: front.id, at: wx, flip: true, swing: "l", w: 1000, h: 1800, sill: 0, preset: "G2", mat: "steel", kind: "single", style: "grill", mark: "G2", layer: "A-SITE", gate: 1 });
      if (des.garden === "yes" && B.ASSET_LIB) { var lib = B.ASSET_LIB, ga = function (k, x, y) { if (lib[k] && inRing([x, y]) && inRing([x - 500, y - 500]) && inRing([x + 500, y + 500])) add({ t: "asset", kind: k, p: [r1(x), r1(y)], rot: 0, lvl: "L0", layer: "L-LAND" }); };
        if (oy >= 1800) { ga("palm", 900, Math.min(oy - 900, 1500)); ga("palm", pw - 900, Math.min(oy - 900, 1500)); for (var sx = 2000; sx < pw - 1500; sx += 1500) if (Math.abs(sx - gx) > 2600 && Math.abs(sx - wx) > 1000) ga("shrub", sx, 500); ga("lamp_post", Math.max(400, gx - 2500), 350); }
        if (pd - oy - D * 1000 >= 2500) { ga("tree", 1500, pd - 1500); ga("tree", pw - 1500, pd - 1500); } }
      }
    }
    /* water and services in the open yards: rain-water recharge pits (MBBL 2016: plots of 100 m² or more; about 6 m³ of pit for
       every 100 m² of roof), septic tank + soak pit or a sewer manhole, underground sump and bore well kept as far as possible from the septic tank */
    var svcNote = [];
    if (cfg.site !== false && B.ASSET_LIB) {
      var plotA = cfg.plot.w * cfg.plot.d, roofA = W * D, bb = [ox - 450, oy - 450, ox + W * 1000 + 450, oy + D * 1000 + 450], sbusy = [], soft = [];
      sbusy.push([gx - 1900, 0, gx + 1900, 2600]); if (typeof wx === "number") sbusy.push([wx - 600, 0, wx + 600, 1200]);
      ents.forEach(function (e) { if (e.t === "asset" && e.lvl === "L0" && /L-LAND|A-SITE/.test(e.layer || "")) { if (/shrub|lamp_post/.test(e.kind)) soft.push(e); else sbusy.push([e.p[0] - 600, e.p[1] - 600, e.p[0] + 600, e.p[1] + 600]); } });
      ents.forEach(function (e) { var out = function (q) { return q[1] < oy - 100 || q[0] < ox - 100 || q[0] > ox + W * 1000 + 100 || q[1] > oy + D * 1000 + 100; };
        if (e.t === "steps" || e.t === "ramp" || (e.t === "column" && e.lvl === "L0" && e.site !== 1 && out(e.p))) { var a1 = e.a || e.p, b1 = e.b || a1; if (!a1) return; sbusy.push([Math.min(a1[0], b1[0]) - 900, Math.min(a1[1], b1[1]) - 900, Math.max(a1[0], b1[0]) + 900, Math.max(a1[1], b1[1]) + 900]); }
        if (e.t === "slab" && e.lvl === "L0" && e.pts && e.pts.some(out)) { var xs = e.pts.map(function (q) { return q[0]; }), ys = e.pts.map(function (q) { return q[1]; }); sbusy.push([Math.min.apply(null, xs) - 300, Math.min.apply(null, ys) - 300, Math.max.apply(null, xs) + 300, Math.max.apply(null, ys) + 300]); } });
      var ok = function (cx, cy, hx, hy) { var r = [cx - hx, cy - hy, cx + hx, cy + hy]; if (r[0] < 300 || r[1] < 300 || r[2] > pw - 300 || r[3] > pd - 300) return false; if (cfg.plotPoly && ![[r[0] - 300, r[1] - 300], [r[2] + 300, r[1] - 300], [r[2] + 300, r[3] + 300], [r[0] - 300, r[3] + 300]].every(inRing)) return false; var hit = function (b) { return r[0] < b[2] && r[2] > b[0] && r[1] < b[3] && r[3] > b[1]; }; return !hit(bb) && !sbusy.some(hit); };
      var spots = function (hx, hy) { var L2 = []; for (var yy3 = 300 + hy; yy3 <= pd - 300 - hy; yy3 += 250) for (var xx3 = 300 + hx; xx3 <= pw - 300 - hx; xx3 += 250) if (ok(xx3, yy3, hx, hy)) L2.push([xx3, yy3]); return L2; };
      var take = function (q, hx, hy) { var r = [q[0] - hx, q[1] - hy, q[0] + hx, q[1] + hy]; sbusy.push([r[0] - 400, r[1] - 400, r[2] + 400, r[3] + 400]); soft.forEach(function (e) { if (e.p[0] > r[0] - 500 && e.p[0] < r[2] + 500 && e.p[1] > r[1] - 500 && e.p[1] < r[3] + 500) e._del = 1; }); };
      var dist = function (a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }, front = function (q) { return q[1] < oy ? 0 : 1; }, rear = function (q) { return q[1] > oy + D * 1000 ? 0 : 1; };
      var put = function (kind, q, o) { add(Object.assign({ t: "asset", kind: kind, p: [r1(q[0]), r1(q[1])], rot: 0, lvl: "L0", layer: "P-FIX" }, o || {})); };
      /* sewage first (it decides where the water sources may go): septic tank + soak pit (IS 2470) or an outfall manhole to the town sewer */
      var SEP = [[5, 1.5, 0.75, 1.0], [10, 2.0, 0.9, 1.0], [15, 2.0, 0.9, 1.3], [20, 2.3, 1.1, 1.3], [50, 5.0, 1.6, 1.3], [100, 7.5, 2.0, 1.4], [150, 10.0, 2.4, 1.4], [200, 12.0, 2.75, 1.4], [300, 15.0, 3.5, 1.4]];
      var septicAt = null;
      if (des.sewer === "sewer") { var c6 = spots(450, 450).sort(function (a, b) { return a[1] - b[1]; })[0]; if (c6) { put("manhole", c6, { name: "Outfall manhole to the town sewer" }); take(c6, 450, 450); septicAt = c6; svcNote.push("Sewage: outfall manhole at the road, connected to the town sewer"); } }
      else if (des.sewer === "septic" && B.ASSET_LIB.septic_tank) {
        var st = SEP.filter(function (r) { return r[0] >= pers; })[0] || SEP[SEP.length - 1], sl = Math.max(2400, st[1] * 1000 + 700), sb = Math.max(1200, st[2] * 1000 + 700);
        var tryS = function (rot) { var hx = (rot ? sb : sl) / 2 + 100, hy = (rot ? sl : sb) / 2 + 100; return spots(hx, hy).sort(function (a, b) { return front(a) - front(b) || a[1] - b[1] || Math.abs(a[0] - pw / 2) - Math.abs(b[0] - pw / 2); }).map(function (q) { return { q: q, rot: rot, hx: hx, hy: hy }; })[0]; };
        var cs = tryS(0) || tryS(1);
        if (cs) { put("septic_tank", cs.q, { rot: cs.rot ? 90 : 0, sep: [st[1], st[2], st[3]], pauto: 1, name: "Septic tank " + st[0] + " users" }); take(cs.q, cs.hx, cs.hy); septicAt = cs.q;
          var kq = spots(800, 800).sort(function (a, b) { return dist(a, cs.q) - dist(b, cs.q); })[0];
          if (kq) { put("soak_pit", kq, { pauto: 1, name: "Soak pit" }); take(kq, 800, 800); }
          svcNote.push("Septic tank (IS 2470) for " + st[0] + " users: " + st[1].toFixed(2) + " × " + st[2].toFixed(2) + " m, liquid depth " + st[3].toFixed(2) + " m" + (kq ? ", with a soak pit" : " — no room left for the soak pit, place it by hand")); }
        else svcNote.push("Septic tank: no free space in the yards — MEPAUTO will put it in front; check it on the site plan");
      }
      var far = function (a, b) { return septicAt ? dist(b, septicAt) - dist(a, septicAt) : 0; };
      if (des.rwh === "yes" || (des.rwh === "auto" && plotA >= 100)) {
        var nP = Math.max(1, Math.min(3, Math.ceil(roofA * 0.06 / 5.6))), got = 0;
        for (var k3 = 0; k3 < nP; k3++) { var c3 = spots(750, 750).sort(function (a, b) { return rear(a) - rear(b) || far(a, b); })[0]; if (!c3) break; put("rwh_pit", c3, { name: "RWH recharge pit" }); take(c3, 750, 750); got++; }
        svcNote.push(got ? "Rain-water harvesting: " + got + " recharge pit" + (got > 1 ? "s" : "") + " 1.5 × 1.5 × 2.5 m with filter for " + Math.round(roofA) + " m² of roof (MBBL 2016: plots of 100 m² or more)" : "Rain-water harvesting: no free space in the yards — place the recharge pit by hand");
      }
      var smH = pers > 10 ? 1000 : 700;
      if (des.sump === "yes") { var c4 = spots(smH, smH).sort(function (a, b) { return front(a) - front(b) || far(a, b); })[0];
        if (c4) { put("sump_underground", c4, { name: "Underground sump", sc: smH / 1000 }); take(c4, smH, smH); svcNote.push("Underground sump " + (smH / 500).toFixed(1) + " × " + (smH / 500).toFixed(1) + " m, " + (Math.ceil(pers * 135 / 500) * 500) + " L for " + pers + " persons at 135 L/day (NBC 2016)" + (septicAt && dist(c4, septicAt) < 3000 ? " — closer than 3 m to the septic tank, check" : "")); } else svcNote.push("Underground sump: no free space in the yards"); }
      if (des.bore === "yes") { var c5 = spots(250, 250).sort(far)[0];
        if (c5) { put("borewell", c5, { name: "Bore well" }); take(c5, 250, 250); var dd = septicAt ? dist(c5, septicAt) / 1000 : 0; svcNote.push("Bore well" + (septicAt ? " " + dd.toFixed(1) + " m from the septic tank" + (dd < 15 && des.sewer === "septic" ? " (15 m is advised — keep it as far as the plot allows)" : "") : "")); } }
      /* meter board on the inside face of the front compound wall beside the gate (read from the road), two earth pits
         (IS 3043: electrodes about twice their length apart — 5 m for 2.5 m pipes) in the yard near it */
      if (des.meter === "gate" && +des.cwH !== 0 && B.ASSET_LIB.meter_board) {
        var mbx = [gx + 2100, gx - 2100, (typeof wx === "number" ? wx + 900 : gx + 3000)].filter(function (x) { return x > 600 && x < pw - 600 && (typeof wx !== "number" || Math.abs(x - wx) > 700); })[0];
        if (mbx) { var mbp = [r1(mbx), 330]; add({ t: "asset", kind: "meter_board", p: mbp, rot: 180, sc: 1, lvl: "L0", layer: "E-POINT", eauto: 1, name: "MB" }); sbusy.push([mbx - 500, 0, mbx + 500, 900]);
          var e1 = spots(225, 225).sort(function (a, b) { return dist(a, mbp) - dist(b, mbp); })[0], e2 = null;
          if (e1) { take(e1, 225, 225); var c7 = spots(225, 225); e2 = c7.filter(function (q) { return dist(q, e1) >= 5000; }).sort(function (a, b) { return dist(a, mbp) - dist(b, mbp); })[0] || c7.sort(function (a, b) { return dist(b, e1) - dist(a, e1); })[0]; }
          [e1, e2].forEach(function (q) { if (q) { add({ t: "asset", kind: "earth_pit", p: [r1(q[0]), r1(q[1])], rot: 0, sc: 1, lvl: "L0", layer: "E-POINT", eauto: 1 }); take(q, 225, 225); } });
          svcNote.push("Meter board on the front compound wall beside the gate; " + ((e1 ? 1 : 0) + (e2 ? 1 : 0)) + " earth pits" + (e1 && e2 ? " " + (dist(e1, e2) / 1000).toFixed(1) + " m apart" + (dist(e1, e2) < 5000 ? " (5 m advised — check)" : "") : "")); }
      }
      if (swhN) svcNote.push("Solar water heater: " + swhN + " × 200 L on the terrace (about 25 L per person)");
    }
    /* parking: marked bays 2.5 × 5.0 m (NBC / MBBL car space) in every parking area, a 6 m aisle when two rows fit, two-wheeler bays
       in the strip that is left; cars drawn in as many bays as the owner has cars */
    if (des.park !== "none" && B.ASSET_LIB && B.ASSET_LIB.parking_bay_car) {
      var nCar = 0, nBike = 0, carsWant = des.park === "cars" ? (cfg.cars != null ? +cfg.cars : 99) : 0, carsPut = 0;
      plan.floors[0].forEach(function (r) { var s1 = sp(r); if (!s1 || s1.open !== "park") return; var pr = r.cut ? parts(r).sort(function (a, b) { return b.w * b.d - a.w * a.d; })[0] : r, x0 = pr.x + 0.15, y0 = pr.y + 0.15, w0 = pr.w - 0.3, d0 = pr.d - 0.3;
        var bay = function (cx, cy, rot) { add({ t: "asset", kind: "parking_bay_car", p: P(cx, cy), rot: rot, lvl: "L0", layer: "A-PARK" }); nCar++; if (carsPut < carsWant && B.ASSET_LIB.car_sedan) { add({ t: "asset", kind: carsPut % 2 ? "car_suv" : "car_sedan", p: P(cx, cy), rot: rot + 90, lvl: "L0", layer: "A-PARK" }); carsPut++; } };
        var bike = function (cx, cy, rot) { add({ t: "asset", kind: "parking_bay_bike", p: P(cx, cy), rot: rot, lvl: "L0", layer: "A-PARK" }); nBike++; };
        if (d0 >= 5.0 && w0 >= 2.5) { var rows = d0 >= 16 ? 2 : 1, nx = Math.floor(w0 / 2.5), mx0 = x0 + (w0 - nx * 2.5) / 2;
          for (var ix = 0; ix < nx; ix++) { bay(mx0 + 1.25 + ix * 2.5, y0 + 2.5, 0); if (rows === 2) bay(mx0 + 1.25 + ix * 2.5, y0 + d0 - 2.5, 0); }
          var left = rows === 2 ? d0 - 16 : d0 - 5.0, by0 = rows === 2 ? y0 + 5 + 6 : y0 + 5.0; if (rows === 1 && left >= 2.2 && d0 < 11) for (var ib = 0; ib < Math.floor(w0 / 1.0); ib++) bike(x0 + 0.5 + ib * 1.0, by0 + 1.1, 0); }
        else if (w0 >= 5.0 && d0 >= 2.5) { var ny = Math.floor(d0 / 2.5); for (var iy = 0; iy < ny; iy++) bay(x0 + 2.5, y0 + 1.25 + iy * 2.5, 90); }
        else if (d0 >= 2.2 && w0 >= 1.0) for (var ib2 = 0; ib2 < Math.floor(w0 / 1.0); ib2++) bike(x0 + 0.5 + ib2 * 1.0, y0 + 1.1, 0);
      });
      if (nCar || nBike) { svcNote.push("Parking: " + nCar + " car bay" + (nCar === 1 ? "" : "s") + " 2.5 × 5.0 m" + (nBike ? " + " + nBike + " two-wheeler bays 1.0 × 2.2 m" : "")); if (!d.layers["A-PARK"]) d.layers["A-PARK"] = { color: 8, lw: 0.18, lt: "CONTINUOUS", on: true, lock: false, frz: false }; }
    }
    /* roof drainage on a flat terrace: rain-water pipes at the outer corners (about one 110 mm pipe for 40 m² of roof) and slope arrows 1:100 to them */
    if (!sloped && T.roof !== "gi" && des.roofDrain !== "no") {
      var ol = olM, ar = 0, cxm = 0, cym = 0; ol.forEach(function (q, j) { var r2 = ol[(j + 1) % ol.length], c = q[0] * r2[1] - r2[0] * q[1]; ar += c / 2; cxm += q[0] / ol.length; cym += q[1] / ol.length; });
      var sg = ar > 0 ? 1 : -1, cnr = [];
      ol.forEach(function (q, j) { var a2 = ol[(j - 1 + ol.length) % ol.length], b2 = ol[(j + 1) % ol.length], cr = (q[0] - a2[0]) * (b2[1] - q[1]) - (q[1] - a2[1]) * (b2[0] - q[0]); if (cr * sg > 0) { var u1 = [q[0] - a2[0], q[1] - a2[1]], u2 = [q[0] - b2[0], q[1] - b2[1]], l1 = Math.hypot(u1[0], u1[1]), l2 = Math.hypot(u2[0], u2[1]); cnr.push({ q: q, o: [u1[0] / l1 + u2[0] / l2, u1[1] / l1 + u2[1] / l2] }); } });
      var nR = Math.max(2, Math.ceil(Math.abs(ar) / 1e6 / 40)), pick = cnr.slice().sort(function (a, b) { return (b.q[1] - a.q[1]) || 0; });
      /* back corners first (water away from the entrance), then the front ones */
      pick = pick.slice(0, Math.min(pick.length, nR));
      pick.forEach(function (c) { var lo = Math.hypot(c.o[0], c.o[1]) || 1, o = [c.o[0] / lo, c.o[1] / lo], rp = [r1(c.q[0] + o[0] * 210), r1(c.q[1] + o[1] * 210)], inr = [c.q[0] - o[0] * 700, c.q[1] - o[1] * 700], tail = [inr[0] + (cxm - inr[0]) * 0.35, inr[1] + (cym - inr[1]) * 0.35];
        add({ t: "asset", kind: "rwp_110", p: rp, rot: 0, lvl: "L0", layer: "P-FIX", rwp: true, pauto: 1, name: "RWP" });
        add({ t: "leader", pts: [[r1(inr[0]), r1(inr[1])], [r1(tail[0]), r1(tail[1])]], s: "SLOPE 1:100", lvl: "LT", layer: "A-ANNO" }); });
      if (!d.layers["A-ANNO"]) d.layers["A-ANNO"] = { color: 7, lw: 0.18, lt: "CONTINUOUS", on: true, lock: false, frz: false };
      if (pick.length) svcNote.push("Terrace drainage: " + pick.length + " rain-water pipes 110 mm" + (pick.length < nR ? " (" + nR + " needed for " + Math.round(Math.abs(ar) / 1e6) + " m² — add more on the long sides)" : "") + ", roof sloped 1:100 to them");
    }
    /* rain-water pipes led to the recharge pits (else to the road drain): along a ring 450 mm outside the building, underground uPVC 110 mm */
    var pits = ents.filter(function (e) { return e.t === "asset" && e.kind === "rwh_pit"; }), rwps = ents.filter(function (e) { return e.t === "asset" && e.kind === "rwp_110" && e.lvl === "L0"; });
    if (rwps.length && cfg.site !== false && B.mepKindFor && des.roofDrain !== "no") {
      var Rg = [ox - 450, oy - 450, ox + W * 1000 + 450, oy + D * 1000 + 450], per = 2 * (Rg[2] - Rg[0] + Rg[3] - Rg[1]);
      var toS = function (q) { var x = Math.min(Rg[2], Math.max(Rg[0], q[0])), y = Math.min(Rg[3], Math.max(Rg[1], q[1])), dl = [Math.abs(y - Rg[1]), Math.abs(x - Rg[2]), Math.abs(y - Rg[3]), Math.abs(x - Rg[0])], k = dl.indexOf(Math.min.apply(null, dl)), Wd = Rg[2] - Rg[0], Hd = Rg[3] - Rg[1];
        return k === 0 ? x - Rg[0] : k === 1 ? Wd + (y - Rg[1]) : k === 2 ? Wd + Hd + (Rg[2] - x) : 2 * Wd + Hd + (Rg[3] - y); };
      var atS = function (t) { t = ((t % per) + per) % per; var Wd = Rg[2] - Rg[0], Hd = Rg[3] - Rg[1]; return t <= Wd ? [Rg[0] + t, Rg[1]] : t <= Wd + Hd ? [Rg[2], Rg[1] + t - Wd] : t <= 2 * Wd + Hd ? [Rg[2] - (t - Wd - Hd), Rg[3]] : [Rg[0], Rg[3] - (t - 2 * Wd - Hd)]; };
      var cornersT = [0, Rg[2] - Rg[0], Rg[2] - Rg[0] + Rg[3] - Rg[1], 2 * (Rg[2] - Rg[0]) + Rg[3] - Rg[1]], rwLen = 0;
      rwps.forEach(function (rp) { var tgt = pits.length ? pits.slice().sort(function (a, b) { return Math.hypot(a.p[0] - rp.p[0], a.p[1] - rp.p[1]) - Math.hypot(b.p[0] - rp.p[0], b.p[1] - rp.p[1]); })[0].p : [Math.min(pw - 400, Math.max(400, rp.p[0])), 0];
        var t0 = toS(rp.p), t1 = toS(tgt), fw = ((t1 - t0) % per + per) % per;
        var path = function (dir) { var len = dir > 0 ? fw : per - fw, pts = [rp.p.slice(), atS(t0)], cs2 = [];
          for (var k5 = -1; k5 <= 2; k5++) cornersT.forEach(function (c) { var cc = c + k5 * per, rel = dir > 0 ? cc - t0 : t0 - cc; if (rel > 1 && rel < len - 1) cs2.push([rel, cc]); });
          cs2.sort(function (a, b) { return a[0] - b[0]; }).forEach(function (c) { pts.push(atS(c[1])); }); var e1 = atS(t1); pts.push(e1); var vs = Math.abs(e1[0] - Rg[0]) < 1 || Math.abs(e1[0] - Rg[2]) < 1; pts.push(vs ? [e1[0], tgt[1]] : [tgt[0], e1[1]]); pts.push(tgt.slice());
          var okP = true; for (var m = dir > 0 ? 0 : 0; m <= len; m += 400) { var q = atS(t0 + dir * m); if (q[0] < 150 || q[1] < 150 || q[0] > pw - 150 || q[1] > pd - 150) { okP = false; break; } }
          return { pts: pts, len: len, ok: okP }; };
        var cands = [path(1), path(-1)].filter(function (c) { return c.ok; }).sort(function (a, b) { return a.len - b.len; }); if (!cands.length) return; var pts = cands[0].pts;
        var clean = []; pts.forEach(function (q) { q = [Math.round(q[0]), Math.round(q[1])]; var l = clean[clean.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 50) clean.push(q); });
        for (var k6 = 1; k6 < clean.length; k6++) rwLen += Math.hypot(clean[k6][0] - clean[k6 - 1][0], clean[k6][1] - clean[k6 - 1][1]);
        if (clean.length >= 2) add({ t: "run", kind: B.mepKindFor("rw", 110), pts: clean, side: 1, z: -450, lvl: "L0", svc: "rw", dia: 110, slope: 100, layer: "P-RW", pauto: 1 }); });
      svcNote.push("Rain-water lines: " + rwps.length + " × 110 mm uPVC underground, " + (rwLen / 1000).toFixed(0) + " m in all, to " + (pits.length ? "the recharge pits" : "the road drain"));
    }
    /* yard finishes: 750 mm PCC plinth protection round the building, paver-block driveway from the gate, a 1.2 m path from the wicket gate, lawn in the rest of the front yard */
    if (cfg.site !== false && des.paving && des.paving !== "none") {
      var land = function (kind, x0, y0, x1, y1, nm) { if (cfg.plotPoly && PL.polySpan) { var sa = PL.polySpan(ring, y0 + 1), sb = PL.polySpan(ring, y1 - 1); if (!sa || !sb) return; x0 = Math.max(x0, sa[0] + 115, sb[0] + 115); x1 = Math.min(x1, sa[1] - 115, sb[1] - 115); } if (x1 - x0 > 200 && y1 - y0 > 200) add({ t: "land", kind: kind, z: bs.ngl || -450, pts: [[r1(x0), r1(y0)], [r1(x1), r1(y0)], [r1(x1), r1(y1)], [r1(x0), r1(y1)]], lvl: "L0", layer: "L-LAND", name: nm }); };
      var apr = des.apron === "no" ? 0 : 750, area0 = 0;
      if (apr) { var ol2 = olM, ar2 = 0; ol2.forEach(function (q, j) { var r2 = ol2[(j + 1) % ol2.length]; ar2 += q[0] * r2[1] - r2[0] * q[1]; }); var sg2 = ar2 > 0 ? 1 : -1;
        ol2.forEach(function (q, j) { var r2 = ol2[(j + 1) % ol2.length], dx = r2[0] - q[0], dy = r2[1] - q[1], L3 = Math.hypot(dx, dy); if (L3 < 300) return; var nx = sg2 * dy / L3 * apr, ny = -sg2 * dx / L3 * apr;
          var pts2 = [q, r2, [r2[0] + nx, r2[1] + ny], [q[0] + nx, q[1] + ny]].map(function (z) { return [r1(Math.min(pw - 115, Math.max(115, z[0]))), r1(Math.min(pd - 115, Math.max(115, z[1])))]; });
          add({ t: "land", kind: "pcc", z: bs.ngl || -450, pts: pts2, lvl: "L0", layer: "L-LAND", name: "Plinth protection" }); area0 += L3 * apr / 1e6; }); }
      var porchY = oy; ents.forEach(function (e) { if (e.t === "slab" && e.lvl === "L0" && e.pts && e.pts.some(function (q) { return q[1] < oy - 100; })) porchY = Math.min(porchY, Math.min.apply(null, e.pts.map(function (q) { return q[1]; }))); });
      var yEnd = oy - apr, gw = 0; ents.forEach(function (e) { if (e.gate && e.w && Math.abs(e.at - gx) < 50) gw = Math.max(gw, e.w); }); gw = gw || 3000;
      var dr = [Math.max(115, gx - gw / 2), Math.min(pw - 115, gx + gw / 2)], walk = typeof wx === "number" ? [wx - 600, wx + 600] : null, segs = [dr].concat(walk ? [walk] : []).sort(function (a, b) { return a[0] - b[0]; });
      /* car ramp from the ground up to the porch / parking floor (plinth level): 1:10 where the yard allows, never steeper than 1:6 */
      var rise2 = -(bs.ngl || -450), rTop = null, rampNote = "";
      if (porchY < oy - 100) rTop = porchY; else if (plan.floors[0].some(function (r) { return sp(r) && sp(r).open === "park" && Math.abs(r.y) < 1e-3 && ox + r.x * 1000 < dr[1] - 500 && ox + (r.x + r.w) * 1000 > dr[0] + 500; })) rTop = oy;
      var drEnd = Math.min(yEnd, porchY < oy ? porchY : yEnd);
      if (rTop != null && des.driveRamp !== "no" && rise2 > 0) { var avail = rTop - 115 - 600, rl = Math.min(rise2 * 10, avail); if (rl >= rise2 * 6) { var rw2 = Math.min(dr[1] - dr[0], 3500), rx = (dr[0] + dr[1]) / 2;
        add({ t: "ramp", a: [r1(rx), r1(rTop - rl)], b: [r1(rx), r1(rTop)], w: Math.round(rw2), rise: rise2, th: 150, z: -rise2, lvl: "L0", layer: "A-STAIR", name: "Car ramp" }); drEnd = rTop - rl;
        rampNote = ", car ramp " + (rl / 1000).toFixed(1) + " m long (1:" + (rl / rise2).toFixed(0) + ") up to the " + (porchY < oy - 100 ? "porch" : "parking floor"); } else rampNote = "; the front yard is too short for a car ramp up to the plinth (needs about " + (rise2 * 6 / 1000 + 0.6).toFixed(1) + " m in front of the " + (porchY < oy - 100 ? "porch" : "parking") + ") — lower the plinth there or slope the porch floor"; }
      if (yEnd > 600) {
        land("paver", dr[0], 115, dr[1], drEnd, "Driveway"); if (walk) land("paver", walk[0], 115, walk[1], yEnd, "Walkway");
        if (des.paving === "drive") { var xs2 = [115]; segs.forEach(function (sgm) { xs2.push(sgm[0], sgm[1]); }); xs2.push(pw - 115); for (var k7 = 0; k7 < xs2.length; k7 += 2) land("lawn", xs2[k7], 115, xs2[k7 + 1], yEnd, "Lawn"); }
      }
      svcNote.push("Yard: paver driveway " + ((dr[1] - dr[0]) / 1000).toFixed(1) + " m wide from the gate" + (walk ? ", 1.2 m paver path from the wicket gate" : "") + (des.paving === "drive" ? ", lawn in the front yard" : "") + (apr ? ", 750 mm PCC plinth protection round the building" : "") + rampNote);
    }
    /* outdoor lights and the nameplate */
    if (des.lights && des.lights !== "none" && B.ASSET_LIB && B.ASSET_LIB.bulkhead_light) {
      var nL = 0, lt = function (k, p, rot, o) { add(Object.assign({ t: "asset", kind: k, p: [r1(p[0]), r1(p[1])], rot: rot, lvl: "L0", layer: "E-POINT" }, o || {})); nL++; };
      var rotOut = function (w) { return Math.abs(w[0]) > Math.abs(w[1]) ? (w[0] < 0 ? 90 : 270) : (w[1] < 0 ? 180 : 0); }, ol3 = olM, ar3 = 0; ol3.forEach(function (q, j) { var r2 = ol3[(j + 1) % ol3.length]; ar3 += q[0] * r2[1] - r2[0] * q[1]; }); var sg3 = ar3 > 0 ? 1 : -1, off = TH[0] / 2 + 70;
      var mdP = null; if (md && md.p.hz) { var yW = Math.abs(md.p.c) < 1e-3 ? 0 : md.p.c, sgn = Math.abs(md.p.c) < 1e-3 ? -1 : 1; mdP = { x: ox + md.c * 1000, y: oy + yW * 1000, s: sgn };
        [-1, 1].forEach(function (k) { lt("bulkhead_light", [mdP.x + k * (md.w * 500 + 350), mdP.y + sgn * off], sgn < 0 ? 0 : 180, { name: "Door light" }); }); }
      ol3.forEach(function (q, j) { var r2 = ol3[(j + 1) % ol3.length], dx = r2[0] - q[0], dy = r2[1] - q[1], L3 = Math.hypot(dx, dy); if (L3 < 3000) return; var n = [sg3 * dy / L3, -sg3 * dx / L3], mid = [(q[0] + r2[0]) / 2, (q[1] + r2[1]) / 2];
        if (mdP && Math.abs(n[1] * mdP.s - 1) < 1e-6 && Math.abs(mid[1] - mdP.y) < 50) return;
        lt("bulkhead_light", [mid[0] + n[0] * off, mid[1] + n[1] * off], rotOut([-n[0], -n[1]]) , { name: "Wall light" }); });
      if (cfg.site !== false && +des.cwH !== 0) { var gw2 = 0; ents.forEach(function (e) { if (e.gate && e.w && Math.abs(e.at - gx) < 50) gw2 = Math.max(gw2, e.w); }); gw2 = gw2 || 3000;
        [-1, 1].forEach(function (k) { var x = gx + k * (gw2 / 2 + 450); if (x > 400 && x < pw - 400) lt("bulkhead_light", [x, 230 + 70], 180, { z: (+des.cwH || 1800) - 300, name: "Gate light" }); }); }
      if (des.lights === "full" && B.ASSET_LIB.garden_spike_light) { ents.filter(function (e) { return e.t === "land" && (e.name === "Walkway" || e.name === "Lawn"); }).forEach(function (e) { var xs = e.pts.map(function (q) { return q[0]; }), ys = e.pts.map(function (q) { return q[1]; }), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
        if (e.name === "Walkway") { for (var yy = y0 + 800; yy < y1 - 300; yy += 2000) lt("garden_spike_light", [x0 - 150, yy], 0, { z: bs.ngl || -450, name: "Path light" }); }
        else if (x1 - x0 > 1500 && y1 - y0 > 1200) lt("garden_spike_light", [(x0 + x1) / 2, (y0 + y1) / 2], 0, { z: bs.ngl || -450, name: "Garden uplight" }); }); }
      svcNote.push("Outdoor lights: " + nL + " (door, wall" + (+des.cwH !== 0 ? ", gate" : "") + (des.lights === "full" ? ", path and garden" : "") + ")");
    }
    if (des.plate && des.plate !== "none" && B.ASSET_LIB && B.ASSET_LIB.name_plate) { var ptxt = (cfg.sanction && (cfg.sanction.plate || cfg.sanction.owner)) || "NAME / HOUSE No.";
      if (des.plate === "gate" && cfg.site !== false && +des.cwH !== 0) { var gw3 = 0; ents.forEach(function (e) { if (e.gate && e.w && Math.abs(e.at - gx) < 50) gw3 = Math.max(gw3, e.w); }); gw3 = gw3 || 3000; var px = gx - gw3 / 2 - 900; if (px < 500) px = gx + gw3 / 2 + 900;
        add({ t: "asset", kind: "name_plate", p: [r1(px), -20], rot: 0, z: (+des.cwH || 1800) - 700, lvl: "L0", layer: "A-SITE", name: ptxt }); add({ t: "text", p: [r1(px - 300), -700], s: ptxt, h: 200, lvl: "L0", layer: "A-ANNO" }); }
      else if (mdP) { add({ t: "asset", kind: "name_plate", p: [r1(mdP.x + (md.w * 500 + 900)), r1(mdP.y + mdP.s * (TH[0] / 2 + 15))], rot: mdP.s < 0 ? 0 : 180, z: 1500, lvl: "L0", layer: "A-SITE", name: ptxt }); add({ t: "text", p: [r1(mdP.x + md.w * 500 + 600), r1(mdP.y + mdP.s * 800)], s: ptxt, h: 150, lvl: "L0", layer: "A-ANNO" }); }
      svcNote.push("Nameplate: “" + ptxt + "” (granite, 600 × 300) " + (des.plate === "gate" ? "on the compound wall beside the gate" : "beside the main door"));
    }
    if (cfg.phase > 0 && cfg.phase < nF) { svcNote.unshift("Phase 1 now: " + (cfg.phase === 1 ? "ground floor" : "G+" + (cfg.phase - 1)) + " with foundation, columns and stair designed for " + (nF === 1 ? "G" : "G+" + (nF - 1)) + "; column bars left 750 mm above the roof for the next floors; temporary roof waterproofing");
      bs.levels.forEach(function (L, li) { if (li >= cfg.phase && L.id !== "LT") L.name = L.name + " (phase 2)"; }); }
    if (PL._outNote) { svcNote.unshift(PL._outNote); PL._outNote = null; }
    d.planner_svc = svcNote;
    /* frame sizing by load (rule of thumb, IS 456 / IS 875): load on each column from the floor area it carries (half way to the next columns),
       w kN/m² per floor (slab + finishes + walls + live load), M20 / Fe500 column with 0.8 % steel, footing on the safe bearing capacity */
    if (frame) {
      var wFl = house ? 11 : T.id === "factory" ? 8 : 13, sbc = +cfg.sbc || 150, cols0 = ents.filter(function (e) { return e.t === "column" && e.lvl === "L0"; }), sched = [];
      var near = function (c, ax, sg) { var best = null; cols0.forEach(function (o) { if (o === c) return; var dx = o.p[0] - c.p[0], dy = o.p[1] - c.p[1], along = ax ? dy : dx, across = ax ? dx : dy; if (along * sg <= 50 || Math.abs(across) > 400) return; if (!best || Math.abs(along) < best) best = Math.abs(along); }); return best == null ? 0 : best; };
      cols0.forEach(function (c) {
        var tx = (near(c, 0, 1) + near(c, 0, -1)) / 2000, ty = (near(c, 1, 1) + near(c, 1, -1)) / 2000, A = Math.max(2, (tx || 1.5) * (ty || 1.5)), P = A * wFl * (nF + 0.5), Pu = 1.5 * P, Ag = Pu * 1000 / (0.4 * 20 + 0.67 * 500 * 0.008);
        var cw2 = c.w, cd2 = Math.max(c.d, Math.ceil(Ag / cw2 / 50) * 50); if (cd2 > 2 * cw2) { cw2 = Math.ceil(Math.sqrt(Ag) / 50) * 50; cd2 = Math.max(cw2, Math.ceil(Ag / cw2 / 50) * 50); }
        var Af = 1.1 * P / sbc, side = Math.max(house ? 1.0 : 1.2, Math.ceil(Math.sqrt(Af) * 10) / 10), Df = Math.max(300, Math.ceil(side * 1000 / 4 / 50) * 50), df = Math.max(house ? 1200 : 1500, Df + 900);
        ents.forEach(function (e) { if (e.t === "column" && Math.abs(e.p[0] - c.p[0]) < 5 && Math.abs(e.p[1] - c.p[1]) < 5 && e.lvl !== "LT") { e.w = cw2; e.d = cd2; } });
        add({ t: "footing", p: c.p.slice(), L: Math.round(side * 1000), B: Math.round(side * 1000), D: Df, df: df, rot: c.rot || 0, lvl: "L0", ped: { w: cw2, d: cd2 }, pcc: { off: 150, th: 100 }, layer: "S-FOOT", load: Math.round(P) });
        sched.push(Math.round(P));
      });
      ents.forEach(function (e) { if (e.t !== "beam") return; var L = G.dist(e.a, e.b); e.d = Math.max(e.d, Math.ceil(L / 12 / 25) * 25); });
      d.planner_frame = { w: wFl, sbc: sbc, maxLoad: Math.max.apply(null, sched.concat([0])), n: sched.length };
    }
    /* sanction details and site-plan dimensions (setbacks) */
    var sd = cfg.sanction || {}, lines = ["PROPOSED " + (T.n || "").toUpperCase(), "Owner: " + (sd.owner || "…………………………"), "Address / Khasra no.: " + (sd.addr || "…………………………"), "Ward / village: " + (sd.ward || "…………"), "Plot " + cfg.plot.w + " × " + cfg.plot.d + " m = " + (cfg.plot.w * cfg.plot.d).toFixed(2) + " m²", "Architect / engineer: " + (sd.arch || "…………………………") + (sd.reg ? " (Reg. " + sd.reg + ")" : ""), "Signature of owner ……………      Signature of architect / engineer ……………"];
    lines = lines.slice(0, -2).concat(svcNote, lines.slice(-2)); add({ t: "text", p: [pw + 3000, -1500], s: lines.join("\n"), h: 300, rot: 0, al: "l", layer: "C-PROP-TXT" });
    var dimL = "DIM"; if (!d.layers[dimL]) d.layers[dimL] = { color: 2, lw: 0.18, lt: "CONTINUOUS", on: true, lock: false, frz: false };
    var bx0 = ox, by0 = oy, bx1 = ox + W * 1000, by1 = oy + D * 1000, mx = (bx0 + bx1) / 2, my = (by0 + by1) / 2;
    [[[mx, 0], [mx, by0], [mx + 600, by0 / 2]], [[mx, pd], [mx, by1], [mx + 600, (pd + by1) / 2]], [[0, my], [bx0, my], [bx0 / 2, my + 600]], [[pw, my], [bx1, my], [(pw + bx1) / 2, my + 600]]].forEach(function (q) { if (Math.abs(q[0][0] - q[1][0]) + Math.abs(q[0][1] - q[1][1]) > 100) add({ t: "dim", kind: "ali", a: q[0], b: q[1], p: q[2], layer: dimL }); });
    /* colours: outside walls, an accent on the road-side walls of the entrance room and the stair cabin, inside walls */
    var pe = (PL.PAINT && PL.PAINT[des.paintExt]) || null, pi = des.paintInt ? (PL.PAINT[des.paintInt] || PL.PAINT[des.paintInt + "_i"]) : null, LKS = B.LOOKS || {};
    var accLv = des.paintFloors === "ground" ? "L0" : des.paintFloors === "top" ? "L" + (nF - 1) : null;
    ents.forEach(function (e) { if (e.t !== "wall" || e._del) return; if (pi && LKS[pi] && !e.site) e.lookI = pi; if (e.ext && pe && LKS[pe[0]]) e.lookO = (accLv && e.lvl === accLv && nF > 1 && LKS[pe[1]]) ? pe[1] : (des.paintFloors === "alt" && nF > 1 && LKS[pe[1]] && /^L\d+$/.test(e.lvl || "") && (+e.lvl.slice(1)) % 2 === 1) ? pe[1] : pe[0]; });
    if (pe && LKS[pe[1]]) { ents.forEach(function (e) { if (e.t === "wall" && !e._del && e.ext && (e.lvl === "LT" || e.site)) e.lookO = pe[1]; });
      (perFloor[0] && perFloor[0].mainDoor ? [perFloor[0].mainDoor.p.w] : []).forEach(function (w) { if (w && w.e && !w.e._del) w.e.lookO = pe[1]; }); }
    /* front screen: louvres / fins / stone strips on the road side of the stair (else the widest road-side wall of the top floor) */
    if (des.screen && des.screen !== "none") { var RK = { louvre: "wpc_louvre", fins: "alu_fins", charcoal: "charcoal_louvre", stone: "stone_strips" }[des.screen];
      var tgt = []; perFloor.forEach(function (pf, k) { pf.walls.forEach(function (w) { if (!w.hz || Math.abs(w.c) > 1e-3 || !w.e || w.e._del) return; var st = pf.rooms.filter(function (r) { return sp(r) && sp(r).stair && Math.abs(r.y) < 1e-3 && r.x < w.b - 0.1 && r.x + r.w > w.a + 0.1; })[0]; if (st) tgt.push({ a: Math.max(w.a, st.x), b: Math.min(w.b, st.x + st.w), k: k }); }); });
      if (!tgt.length && perFloor.length) { var pf2 = perFloor[perFloor.length - 1], best = null; pf2.walls.forEach(function (w) { if (w.hz && Math.abs(w.c) < 1e-3 && w.e && !w.e._del && (!best || w.b - w.a > best.b - best.a)) best = w; }); if (best) { var L2 = best.b - best.a; tgt.push({ a: best.a + L2 * 0.3, b: best.b - L2 * 0.3, k: perFloor.length - 1 }); } }
      tgt.forEach(function (q) { var y = -(TH[0] / 2000) - 0.005; add({ t: "run", kind: RK, pts: [P(q.a, y), P(q.b, y)], side: -1, z: 0, h: H, lvl: "L" + q.k, layer: "A-FINISH" }); });
    }
    /* compound wall: MS grill on top and gate pillars */
    if (cfg.site !== false && +des.cwH !== 0) { var cwTopZ = (+des.cwH || 1800);
      if (/grill|both/.test(des.cwTop)) ring.map(function (q, i) { return [q, ring[(i + 1) % ring.length]]; }).forEach(function (sg, i2) { var Lg = Math.hypot(sg[1][0] - sg[0][0], sg[1][1] - sg[0][1]) || 1, inw = [-(sg[1][1] - sg[0][1]) / Lg * 115, (sg[1][0] - sg[0][0]) / Lg * 115]; add({ t: "railing", pts: sg.map(function (q) { return [q[0] + inw[0], q[1] + inw[1]]; }), h: 600, base: cwTopZ, lvl: "L0", style: "ms_bars", layer: "A-SITE" }); });
      if (/pillars|both/.test(des.cwTop)) ents.filter(function (e) { return e.gate && (e.t === "door" || e.t === "opening"); }).forEach(function (g) { [-1, 1].forEach(function (sg) { var x = g.at + sg * (g.w / 2 + 250); if (x > 300 && x < pw - 300) add({ t: "column", p: [r1(x), 115], w: 450, d: 450, rot: 0, shape: "rect", lvl: "L0", h: cwTopZ + 450, base: bs.ngl || -450, layer: "A-SITE", site: 1 }); }); });
    }
    for (var di = ents.length - 1; di >= 0; di--) if (ents[di]._del) ents.splice(di, 1);
    d.planner_des = des;
    d.sheet.title = cfg.name || T.n; if (sd.owner) d.sheet.title += " — " + sd.owner; d.planner = { type: T.id, label: plan.label, floors: nF, W: W, D: D };
    return d;
  };

  /* run a CAD command with ready answers (keywords / numbers / points in order; anything not given takes the default) */
  PL.autoRun = async function (ed, name, answers) {
    var CAD = EP.cad, c = CAD.commands[name]; if (!c) return null; var q = (answers || []).slice(), keep = {};
    ["getKw", "getNum", "getText", "getDist", "getPoint", "getAngle"].forEach(function (k) { keep[k] = ed[k]; });
    var next = function (def) { if (q.length) { var v = q.shift(); return v === undefined ? def : v; } return def; };
    ed.getKw = async function (m, list, def) { return next(def); }; ed.getNum = async function (m, o) { return next(o && o.def); }; ed.getText = async function (m, o) { return next(o && o.def); };
    ed.getDist = async function (m, o) { return next(o && o.def); }; ed.getAngle = async function (m, o) { return next(o && o.def); }; ed.getPoint = async function () { return next(null); };
    try { return await c.fn(ed); } finally { Object.keys(keep).forEach(function (k) { ed[k] = keep[k]; }); }
  };
})();
