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
  var LAYC = { "A-WALL": 7, "A-DOOR": 4, "A-WIN": 140, "S-COL": 1, "S-BEAM": 5, "S-SLAB": 8, "S-FOOT": 9, "A-ROOF": 30, "A-STAIR": 6, "A-ROOM": 3, "A-RAIL": 8, "A-FURN": 42, "P-PLUMB": 150, "C-PROP": 1, "C-PROP-TXT": 7, "C-SETBACK": 3, "A-SITE": 33 };

  PL.toDoc = function (plan, cfg) {
    var CAD = EP.cad, B = EP.bim, G = EP.geom, T = plan.T, nF = plan.floors.length, H = T.h, house = T.id === "house", frame = cfg.frame !== "lb";
    var d = CAD.newDoc(cfg.name || (T.n + " — " + plan.label), "mm"), bs = B.ensure(d), ents = d.ents;
    Object.keys(LAYC).forEach(function (k) { if (!d.layers[k]) d.layers[k] = { color: LAYC[k], lw: k === "A-WALL" ? 0.5 : 0.25, lt: k === "C-SETBACK" ? "DASHED" : "CONTINUOUS", on: true, lock: false, frz: false }; });
    var nm = ["Ground floor", "First floor", "Second floor", "Third floor", "Fourth floor", "Fifth floor", "Sixth floor", "Seventh floor", "Eighth floor"];
    bs.levels = []; for (var i = 0; i < nF; i++) bs.levels.push({ id: "L" + i, name: nm[i] || ("Floor " + i), elev: i * H, h: H }); bs.levels.push({ id: "LT", name: "Terrace", elev: nF * H, h: 3000 });
    bs.cur = "L0"; bs.wallTh = 230; bs.north = { N: 180, E: 270, S: 0, W: 90 }[cfg.facing || "S"] || 0; bs.sun = Object.assign({}, B.SUN0 || {}, bs.sun || {}, { north: bs.north }); bs.planner = { type: T.id, opt: plan.label, at: Date.now() };
    var ox = (cfg.rules.l || 0) * 1000, oy = (cfg.rules.f || 0) * 1000, X = function (x) { return r1(ox + x * 1000); }, Y = function (y) { return r1(oy + y * 1000); }, P = function (x, y) { return [X(x), Y(y)]; };
    function add(o) { o.id = CAD.uid(); ents.push(o); return o; }

    /* ---------- site: plot line, setback line, road ---------- */
    var pw = cfg.plot.w * 1000, pd = cfg.plot.d * 1000;
    add({ t: "pline", pts: [[0, 0, 0], [pw, 0, 0], [pw, pd, 0], [0, pd, 0]], closed: true, layer: "C-PROP" });
    add({ t: "pline", pts: [[ox, oy, 0], [pw - cfg.rules.rt * 1000, oy, 0], [pw - cfg.rules.rt * 1000, pd - cfg.rules.r * 1000, 0], [ox, pd - cfg.rules.r * 1000, 0]], closed: true, layer: "C-SETBACK" });
    add({ t: "text", p: [pw / 2, -2500], s: "ROAD", h: 600, rot: 0, al: "c", layer: "C-PROP-TXT" });
    add({ t: "text", p: [pw / 2, pd + 1200], s: "PLOT " + cfg.plot.w + " m × " + cfg.plot.d + " m = " + (cfg.plot.w * cfg.plot.d).toFixed(2) + " m²   ·   setbacks F " + cfg.rules.f + " / R " + cfg.rules.r + " / L " + cfg.rules.l + " / R " + cfg.rules.rt + " m", h: 350, rot: 0, al: "c", layer: "C-PROP-TXT" });

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
        if (out) { p.kind = isOpen(rm) ? (sp(rm).open === "balc" ? "rail" : "none") : "wall"; p.ext = true; p.th = 230; }
        else if (isOpen(A) && isOpen(Bq)) p.kind = "none";
        else { p.kind = "wall"; p.ext = isOpen(A) || isOpen(Bq); var thin = [A, Bq].some(function (r) { var s = sp(r); return r.parent || (s && (s.wet && !s.block && (s.minW || 2) < 2) || (s && /^(store|pooja|wc|toilet|toilet_att|bath_h|cstore|dstore|hk|server)$/.test(r.key))); }); p.th = p.ext ? 230 : thin ? 115 : 230; }
      });
      /* merge pieces into walls */
      var walls = [], groups = {};
      pieces.filter(function (p) { return p.kind === "wall"; }).forEach(function (p) { var k = (p.hz ? "h" : "v") + Math.round(p.c * 1000) + "_" + p.th + (p.ext ? "e" : ""); (groups[k] = groups[k] || []).push(p); });
      Object.keys(groups).forEach(function (k) { var L = groups[k].sort(function (a, b) { return a.a - b.a; }), cur = null;
        L.forEach(function (p) { if (cur && Math.abs(cur.b - p.a) < 1e-3) { cur.b = p.b; cur.ps.push(p); } else { cur = { hz: p.hz, c: p.c, a: p.a, b: p.b, th: p.th, ext: p.ext, ps: [p] }; walls.push(cur); } }); });
      walls.forEach(function (w) { var a = w.hz ? P(w.a, w.c) : P(w.c, w.a), b = w.hz ? P(w.b, w.c) : P(w.c, w.b);
        w.e = add({ t: "wall", a: a, b: b, th: w.th, h: null, mat: "brick", just: "c", lvl: lvl, ext: !!w.ext, layer: "A-WALL" }); w.open = []; w.ps.forEach(function (p) { p.w = w; }); });
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
        walls.forEach(function (w) { if (w.th < 200) return; add({ t: "beam", a: w.e.a.slice(), b: w.e.b.slice(), w: w.th, d: house ? 380 : 450, lvl: lvl, layer: "S-BEAM" }); });
      }
      /* openings: helpers */
      function freeAt(w, s0, s1) { return !w.open.some(function (o) { return s0 < o[1] + 0.05 && s1 > o[0] - 0.05; }) && s0 > w.a + 0.12 && s1 < w.b - 0.12; }
      function placeOn(p, wid, prefer) { /* centre (m along the grid line) of an opening of width wid on piece p, near its start ("a"), end ("b") or middle */
        var w = p.w; if (!w) return null; var room = 0.12 + (house ? 0.1 : 0.15), c0 = p.a + room + wid / 2, c1 = p.b - room - wid / 2, mid = (p.a + p.b) / 2, cands = prefer === "m" ? [mid, c0, c1] : prefer === "b" ? [c1, c0, mid] : [c0, c1, mid];
        if (c1 < c0 - 1e-6) { if (p.b - p.a >= wid + 0.1) cands = [mid]; else return null; }
        for (var i = 0; i < cands.length; i++) { var c = cands[i]; if (freeAt(w, c - wid / 2, c + wid / 2)) return c; }
        return null; }
      function hostAdd(t, p, c, o, into) { var w = p.w, ee = w.e, at = (c - w.a) * 1000, L = B.wallLine(ee), cen = into ? centroid(into) : null, flip = false, pt;
        if (cen) { pt = P(cen[0], cen[1]); flip = G.dot(G.sub(pt, L.a), L.n) < 0; }
        w.open.push([c - o.w / 2000, c + o.w / 2000]);
        return add(Object.assign({ t: t, host: ee.id, at: at, flip: flip, swing: (c - p.a) < (p.b - c) ? "l" : "r", layer: t === "window" ? "A-WIN" : "A-DOOR" }, o)); }
      function centroid(r) { return [r.x + r.w / 2, r.y + r.d / 2]; }
      function preset(lib, id) { var x = (lib === "d" ? B.DOORS : B.WINDOWS).filter(function (q) { return q.id === id; })[0]; return x ? { w: x.w, h: x.h, sill: x.sill || 0, preset: x.id, mat: x.mat, kind: x.kind, style: x.style, mark: x.id } : null; }
      var piecesOf = function (r) { return pieces.filter(function (p) { return p.kind === "wall" && (p.s1 === r || p.s2 === r); }); };
      var other = function (p, r) { return p.s1 === r ? p.s2 : p.s1; };
      var accessOf = {};
      /* main entrance(s) */
      if (fi === 0) {
        var mains = rooms.filter(function (r) { return r.inst && r.inst.main; }); if (!mains.length) mains = rooms.filter(function (r) { return r.corr; });
        mains.slice(0, 1).forEach(function (r) {
          var cand = piecesOf(r).filter(function (p) { var o = other(p, r); return p.hz && Math.abs(p.c) < 1e-3 && (!o || isOpen(o)); }).sort(function (a, b) { return (b.b - b.a) - (a.b - a.a); });
          if (!cand.length) cand = piecesOf(r).filter(function (p) { var o = other(p, r); return !o || isOpen(o); });
          var pr = house ? preset("d", "D1") : preset("d", "D6"), p = cand[0], c = p && placeOn(p, pr.w / 1000, "m"); if (c != null) { hostAdd("door", p, c, Object.assign(pr, { main: 1 }), r); accessOf[r.uid] = "out"; }
        });
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
      /* windows on the outer walls */
      rooms.forEach(function (r) {
        var s = sp(r), kind = r.corr ? "corr" : s && s.win; if (!kind || kind === "none" || s && s.open) return;
        var ext = piecesOf(r).filter(function (p) { return !other(p, r) || isOpen(other(p, r)); }).sort(function (a, b) { return (b.b - b.a) - (a.b - a.a); }); if (!ext.length) return;
        var A = PL.areaOf(r), id, n = 1;
        if (kind === "hab") { id = "W1"; n = Math.max(1, Math.ceil(A / 10 / 1.8)); if (ext[0].b - ext[0].a < 2.1) id = ext[0].b - ext[0].a >= 1.7 ? "W2" : "W3"; }
        else if (kind === "hall") { id = "W10"; n = Math.max(2, Math.ceil(A * 0.12 / 2.52)); }
        else if (kind === "kit") { id = house ? "KW" : "W2"; n = house ? 1 : Math.max(1, Math.ceil(A / 15)); }
        else if (kind === "wet") { id = (ext[0].b - ext[0].a) >= 1.0 ? "BW" : "V2"; n = s.block ? Math.max(1, Math.round((ext[0].b - ext[0].a) / 2.5)) : 1; }
        else if (kind === "store") { id = "V2"; }
        else if (kind === "corr") { id = "W2"; n = 1; ext = ext.filter(function (p) { return !p.hz; }); if (!ext.length) return; n = ext.length; }
        var pr = preset("w", id); if (!pr) return; var made = 0;
        for (var pass = 0; pass < 2 && made < n; pass++) ext.forEach(function (p) {
          if (made >= n) return; var L = p.b - p.a, wm = pr.w / 1000;
          if (kind === "hall" || kind === "hab") { var per = Math.max(1, Math.floor(L / (wm + 0.9))), cnt = Math.min(per, n - made); for (var j = 0; j < cnt; j++) { var cc = p.a + L * (j + 0.5) / cnt; if (freeAt(p.w, cc - wm / 2, cc + wm / 2)) { hostAdd("window", p, cc, Object.assign({}, pr), r); made++; } else { var c2 = placeOn(p, wm, j % 2 ? "b" : "a"); if (c2 != null) { hostAdd("window", p, c2, Object.assign({}, pr), r); made++; } } } return; }
          var c = placeOn(p, wm, pass ? "a" : "m"); if (c != null) { hostAdd("window", p, c, Object.assign({}, pr), r); made++; }
        });
      });
      /* balconies: railing on the open sides */
      pieces.filter(function (p) { return p.kind === "rail"; }).forEach(function (p) { add({ t: "railing", pts: p.hz ? [P(p.a, p.c), P(p.b, p.c)] : [P(p.c, p.a), P(p.c, p.b)], h: 1000, lvl: lvl, layer: "A-RAIL" }); });
      /* rooms */
      function thAt(hz, c, m) { var w = walls.filter(function (w) { return w.hz === hz && Math.abs(w.c - c) < 1e-3 && m > w.a - 1e-3 && m < w.b + 1e-3; })[0]; return w ? w.th / 1000 : 0; }
      rooms.forEach(function (r) {
        var pts = outline(r), n = pts.length, ins = [];
        for (var i = 0; i < n; i++) { var a = pts[i], b = pts[(i + 1) % n], hz = Math.abs(a[1] - b[1]) < 1e-6; ins.push(thAt(hz, hz ? a[1] : a[0], hz ? (a[0] + b[0]) / 2 : (a[1] + b[1]) / 2) / 2 * 1000); }
        var mm = pts.map(function (q) { return P(q[0], q[1]); }), Q = B.insetPoly ? B.insetPoly(mm, ins) : mm, s = sp(r);
        add({ t: "room", pts: Q, name: r.name, lvl: lvl, floor: r.corr || r.pass ? "kota" : s && s.fin ? s.fin : "vitrified", skirt: 100, ceil: false, layer: "A-ROOM", plk: r.key });
      });
      /* stair: dog-leg starting at the end where the room is entered */
      rooms.forEach(function (r) { var s = sp(r); if (!s || !s.stair || !r.inst.stair) return; var sd = r.inst.stair, t = 0.115, x0 = r.x + t, x1 = r.x + r.w - t, y0 = r.y + t, y1 = r.y + r.d - t, along = (x1 - x0) >= (y1 - y0), acc = accessOf[r.uid];
        var corrMode = T.mode === "corr", inL = along ? x1 - x0 : y1 - y0, inW = along ? y1 - y0 : x1 - x0, ws = Math.min(sd.ws, Math.max(0.75, (inW - 0.1) / 2)), slen = (sd.n / 2 - 1) * sd.T + ws, off = corrMode ? 0 : Math.max(0, Math.min(ws + 0.05, inL - slen - 0.01)), u, p0;
        var startHigh = false; if (acc && acc.p) { if (along) startHigh = acc.p.hz ? acc.c > (x0 + x1) / 2 : acc.p.c > (x0 + x1) / 2; else startHigh = acc.p.hz ? acc.p.c > (y0 + y1) / 2 : acc.c > (y0 + y1) / 2; }
        if (along) { u = startHigh ? [-1, 0] : [1, 0]; p0 = startHigh ? [x1 - off, y1] : [x0 + off, y0]; } else { u = startHigh ? [0, -1] : [0, 1]; p0 = startHigh ? [x0, y1 - off] : [x1, y0 + off]; }
        var e = add({ t: "stair", p: P(p0[0], p0[1]), dir: Math.atan2(u[1], u[0]) * 180 / Math.PI, w: Math.round(ws * 1000), n: sd.n, R: Math.round(sd.R * 10000) / 10, T: Math.round(sd.T * 1000), wt: 150, kind: "dogleg", lvl: lvl, land: Math.round(ws * 1000), side: 1, rail: "in", layer: "A-STAIR" });
        stairs.push({ e: e, r: r, fi: fi, hole: corrMode ? [x0, y0, x1, y1] : along ? (startHigh ? [x0, y0, x1 - off, y1] : [x0 + off, y0, x1, y1]) : (startHigh ? [x0, y0, x1, y1 - off] : [x0, y0 + off, x1, y1]) }); });
      /* furniture */
      if (cfg.furn !== false) rooms.forEach(function (r) { try { furnish(r, lvl, accessOf[r.uid]); } catch (er) { if (window.console) console.warn("furniture", r.name, er); } });
      return { walls: walls, nodes: nodes, rooms: rooms };
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
      function put(k, x, y, rot) { if (!A[k]) return; add({ t: "asset", kind: k, p: P(x, y), rot: rot || 0, lvl: lvl, layer: /^(ewc|iwc|basin|urinal|sink|shower|vanity|sink_)/.test(k) ? "P-PLUMB" : "A-FURN" }); }
      function sz(k) { var a = A[k] || {}; return [(a.w || 1000) / 1000, (a.d || 1000) / 1000]; }
      function wallPut(k, side, along) { /* against wall side, "along" 0..1 position along that wall */ var z = sz(k), rot = { N: 0, W: 90, S: 180, E: 270 }[side], x, y, f = along == null ? 0.5 : along;
        if (side === "N" || side === "S") { x = box.x0 + z[0] / 2 + (bw - z[0]) * f; y = side === "N" ? box.y1 - z[1] / 2 : box.y0 + z[1] / 2; } else { y = box.y0 + z[0] / 2 + (bd - z[0]) * f; x = side === "E" ? box.x1 - z[1] / 2 : box.x0 + z[1] / 2; }
        put(k, x, y, rot); }
      function grid(k, gx, gy, margin, face) { /* rows of k facing "face" wall (desks / benches), gx gy = pitch, margin from the face wall */ var z = sz(k), rot = { N: 180, S: 0, E: 90, W: 270 }[face] || 0, ws = face === "N" || face === "S", L = ws ? bw : bd, Dd = ws ? bd : bw, nx = Math.max(1, Math.floor((L - 0.6) / gx)), ny = Math.max(1, Math.floor((Dd - margin - 0.5) / gy)), sx = (L - (nx - 1) * gx) / 2;
        for (var i = 0; i < nx; i++) for (var j = 0; j < ny; j++) { var a = sx + i * gx, b = margin + z[1] / 2 + j * gy, x = ws ? box.x0 + a : (face === "E" ? box.x1 - b : box.x0 + b), y = ws ? (face === "N" ? box.y1 - b : box.y0 + b) : box.y0 + a; put(k, x, y, rot); } }
      var f = s.furn, cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2, big = Math.max(bw, bd), longSide = bw >= bd ? "N" : "E";
      if (f === "bed2" || f === "bed1" || f === "hotel" || f === "suite") { var bk = f === "bed1" ? "bed_single" : (Math.min(bw, bd) >= 3.3 ? "bed_queen_storage" : "bed_double"); wallPut(bk, opp, 0.5); var sideW = dside === "S" || dside === "N" ? "E" : "N"; if (bw * bd > 9) wallPut("wardrobe_3door", sideW, 0.8); if (f === "hotel" || f === "suite") wallPut("study_table", { N: "W", S: "E", E: "S", W: "N" }[sideW], 0.6); return; }
      if (f === "hostel") { var nb = r.inst.beds || 2; wallPut("bed_single", "W", 0.2); if (nb > 1) wallPut("bed_single", "E", 0.2); if (nb > 2) wallPut("bunk_bed", "W", 0.8); wallPut("study_table", opp, 0.5); return; }
      if (f === "living" || f === "lounge" || f === "lounge_big") { wallPut(big > 4.2 ? "sofa_L" : "sofa_3", opp, 0.5); var off = { N: [0, -1.4], S: [0, 1.4], E: [-1.4, 0], W: [1.4, 0] }[opp]; put("center_table", cx + off[0] * 0.4, cy + off[1] * 0.4, { N: 0, S: 180, E: 270, W: 90 }[opp]); return; }
      if (f === "dining") { put(bw * bd >= 11 ? "dining_table" : "dining_table_4", cx, cy, bw >= bd ? 0 : 90); return; }
      if (f === "kitchen" || f === "pantry") { wallPut(f === "pantry" ? "kitchen_counter" : (Math.min(bw, bd) >= 2.4 ? "kitchen_counter_L" : "kitchen_counter"), opp, 0); return; }
      if (f === "ckitchen" || f === "prep") { wallPut("kitchen_counter", opp, 0.2); wallPut("kitchen_counter", opp, 0.8); wallPut("sink_cabinet_double", dside === "S" || dside === "N" ? "E" : "N", 0.5); if (big > 5) put("kitchen_island", cx, cy, bw >= bd ? 0 : 90); return; }
      if (f === "dish") { wallPut("sink_cabinet_double", opp, 0.5); return; }
      if (f === "utility") { wallPut("sink", opp, 0.5); return; }
      if (f === "wc" || f === "wc1" || f === "bath") { wallPut("ewc", opp, 0.15); if (f !== "wc1" && Math.max(bw, bd) > 1.5) wallPut("basin", opp, 0.85); if (f === "bath" || (f === "wc" && bw * bd > 3.2)) put("shower_overhead", box.x1 - 0.4, box.y1 - 0.4, 0); return; }
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

    /* ---------- slabs (stair wells cut), stair cabin and parapet on the terrace ---------- */
    var olM = plan.outline ? plan.outline.map(function (q) { return P(q[0], q[1]); }) : [P(0, 0), P(W, 0), P(W, D), P(0, D)];
    var outer = B.insetPoly ? B.insetPoly(olM, olM.map(function () { return -115; })) : [P(-0.115, -0.115), P(W + 0.115, -0.115), P(W + 0.115, D + 0.115), P(-0.115, D + 0.115)];
    for (var f2 = 0; f2 < nF; f2++) {
      var holes = stairs.filter(function (s) { return s.fi === f2; }).map(function (s) { var h = s.hole; return [P(h[0], h[1]), P(h[2], h[1]), P(h[2], h[3]), P(h[0], h[3])]; });
      add({ t: "slab", pts: outer.map(function (q) { return q.slice(); }), holes: holes, th: house ? 125 : 150, lvl: "L" + f2, off: H, kind: f2 === nF - 1 ? "roof" : "ceiling", layer: "S-SLAB" });
    }
    var topStairs = stairs.filter(function (s) { return s.fi === nF - 1; });
    topStairs.forEach(function (s) { var r = s.r, c = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.d], [r.x, r.y + r.d]], ws = [];
      for (var i = 0; i < 4; i++) ws.push(add({ t: "wall", a: P(c[i][0], c[i][1]), b: P(c[(i + 1) % 4][0], c[(i + 1) % 4][1]), th: 230, h: null, mat: "brick", just: "c", lvl: "LT", ext: true, layer: "A-WALL" }));
      /* door to the terrace on the side that is not on the building edge, else any */
      var onEdge = function (a, b) { var ol = plan.outline || [[0, 0], [W, 0], [W, D], [0, D]]; return ol.some(function (q, j) { var r2 = ol[(j + 1) % ol.length]; if (Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(q[1] - r2[1]) < 1e-6 && Math.abs(q[1] - a[1]) < 1e-3) return Math.min(Math.max(a[0], b[0]), Math.max(q[0], r2[0])) - Math.max(Math.min(a[0], b[0]), Math.min(q[0], r2[0])) > 0.3; if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(q[0] - r2[0]) < 1e-6 && Math.abs(q[0] - a[0]) < 1e-3) return Math.min(Math.max(a[1], b[1]), Math.max(q[1], r2[1])) - Math.max(Math.min(a[1], b[1]), Math.min(q[1], r2[1])) > 0.3; return false; }); };
      var inner = [0, 1, 2, 3].filter(function (i) { return !onEdge(c[i], c[(i + 1) % 4]); }), k = inner.length ? inner[0] : 0, wl = ws[k], L = G.dist(wl.a, wl.b);
      add({ t: "door", host: wl.id, at: Math.min(L - 600, Math.max(600, L / 2)), flip: false, swing: "l", w: 900, h: 2100, sill: 0, preset: "D2", mat: "flush", kind: "single", mark: "D2", layer: "A-DOOR" });
      add({ t: "slab", pts: [P(r.x - 0.115, r.y - 0.115), P(r.x + r.w + 0.115, r.y - 0.115), P(r.x + r.w + 0.115, r.y + r.d + 0.115), P(r.x - 0.115, r.y + r.d + 0.115)], th: 120, lvl: "LT", off: 2700, kind: "roof", layer: "S-SLAB" });
      if (frame) c.forEach(function (q) { add({ t: "column", p: P(q[0], q[1]), w: house ? 230 : 300, d: house ? 230 : 300, rot: 0, shape: "rect", lvl: "LT", h: 2700, layer: "S-COL" }); });
    });
    add({ t: "railing", pts: olM.concat([olM[0]]).map(function (q) { return q.slice(); }), h: 1000, lvl: "LT", style: "par_solid", layer: "A-RAIL" });
    /* chajjas (sunshades) over the outer windows: 600 mm deep, 150 mm wider each side, at lintel top */
    if (cfg.chajja !== false) ents.filter(function (e) { return e.t === "window"; }).forEach(function (wn) {
      var wl = ents.filter(function (x) { return x.id === wn.host; })[0]; if (!wl || !wl.ext) return; var L = B.wallLine(wl), mid = G.add(L.a, G.mul(L.u, wn.at)), cen = G.mul(G.add(olM[0], olM[2] || olM[1]), 0.5), out = G.dot(G.sub(mid, ents.length ? polyCen(olM) : cen), L.n) >= 0 ? L.n : G.mul(L.n, -1);
      var face = G.add(mid, G.mul(out, wl.th / 2)), half = wn.w / 2 + 150, a = G.add(face, G.mul(L.u, -half)), b = G.add(face, G.mul(L.u, half)), dep = 600;
      add({ t: "slab", pts: [a, b, G.add(b, G.mul(out, dep)), G.add(a, G.mul(out, dep))].map(function (q) { return [r1(q[0]), r1(q[1])]; }), th: 75, lvl: wl.lvl, off: (wn.sill || 0) + wn.h + 150, kind: "chajja", layer: "S-SLAB" }); });
    function polyCen(pp) { var x = 0, y = 0; pp.forEach(function (q) { x += q[0]; y += q[1]; }); return [x / pp.length, y / pp.length]; }
    /* site: compound wall on the plot line with a vehicle gate and a wicket gate on the road side */
    if (cfg.site !== false) {
      var ngl = bs.ngl || -450, cwH = 1800 - ngl, gx = Math.min(pw - 2000, Math.max(2000, ox + (function () { var pk = plan.floors[0].filter(function (r) { return sp(r) && sp(r).open === "park"; })[0] || plan.floors[0].filter(function (r) { return r.inst && r.inst.main; })[0]; return pk ? (pk.x + pk.w / 2) * 1000 : W * 500; })()));
      var cwall = function (a, b) { return add({ t: "wall", a: a, b: b, th: 230, h: cwH, base: ngl, mat: "brick", just: "r", lvl: "L0", ext: true, layer: "A-SITE", site: 1 }); };
      var front = cwall([0, 0], [pw, 0]); cwall([pw, 0], [pw, pd]); cwall([pw, pd], [0, pd]); cwall([0, pd], [0, 0]);
      add({ t: "door", host: front.id, at: gx, flip: true, swing: "l", w: 3000, h: 1800, sill: 0, preset: "G1", mat: "steel", kind: "double", style: "grill", mark: "G1", layer: "A-SITE", gate: 1 });
      var wx = gx + 2600 < pw - 800 ? gx + 2600 : gx - 2600; if (wx > 800) add({ t: "door", host: front.id, at: wx, flip: true, swing: "l", w: 1000, h: 1800, sill: 0, preset: "G2", mat: "steel", kind: "single", style: "grill", mark: "G2", layer: "A-SITE", gate: 1 });
    }
    /* footings under the ground-floor columns */
    if (frame) {
      var fs = house ? [1200, 1200, 300, 1500] : nF > 2 ? [2200, 2200, 500, 2000] : [1800, 1800, 450, 1800];
      ents.filter(function (e) { return e.t === "column" && e.lvl === "L0"; }).forEach(function (cI) { add({ t: "footing", p: cI.p.slice(), L: fs[0], B: fs[1], D: fs[2], df: fs[3], rot: cI.rot || 0, lvl: "L0", ped: { w: cI.w, d: cI.d }, pcc: { off: 150, th: 100 }, layer: "S-FOOT" }); });
    }
    d.sheet.title = cfg.name || T.n; d.planner = { type: T.id, label: plan.label, floors: nF, W: W, D: D };
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
