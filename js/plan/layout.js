/* Estimate Pro — Building Planner: layouts.
   A plan is made of rectangles on the wall centre lines (metres, x along the road frontage, y away from the road; the road is at y < 0).
   Two ways of arranging rooms:
     band — the footprint is cut into two or three rows across the plot (front: entry / living / parking, middle: dining, kitchen, stairs, toilets, back: bed rooms);
            small rooms are stacked inside a column; an attached toilet is carved out of a corner of its room; the stair, the rows and an optional passage row stay in
            the same place on every floor, so the stair goes straight up.
     corr — rooms on one or both sides of a corridor, with a core (stairs, lift, toilet blocks) at an end, in the middle or at both ends, the same on every floor.
   Every variant is scored (room proportions, least width, area kept, daylight on an outer wall, access from a hall / corridor, kitchen next to dining,
   wet rooms together and one above the other, the entrance on the road side, Vastu if asked) and the best different ones are offered. */
(function () {
  "use strict";
  var EP = window.EP = window.EP || {}, PL = EP.plan = EP.plan || {}, SP = PL.SPACES;
  var E = 1e-6;
  function r2(x) { return Math.round(x * 100) / 100; }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function sum(a, f) { return a.reduce(function (t, x) { return t + (f ? f(x) : x); }, 0); }
  function spA(sp, size) { var z = (sp && (sp[size || "M"] || sp.M)) || [3, 3]; return z[0] * z[1]; }
  var uidN = 0; function uid() { return "r" + (++uidN); }

  /* ---------------- stair and lift sizes ---------------- */
  PL.stairDims = function (T, corr) {
    var ws = T.stairW, h = T.h / 1000, house = T.id === "house", Rmax = house ? 0.175 : 0.15, n = Math.ceil(h / Rmax - 1e-9); if (n % 2) n++;
    var Tr = house ? 0.25 : 0.3, fl = n / 2, going = (fl - 1) * Tr, len = going + ws + (corr ? 0 : ws) + 0.25, wid = 2 * ws + (house ? 0.35 : 0.45);
    return { w: r2(wid), d: r2(len), n: n, R: h / n, T: Tr, ws: ws };
  };

  /* ---------------- items → room instances ---------------- */
  PL.expand = function (T, items, nF) {
    var out = [], names = {};
    items.forEach(function (itm) {
      if (!itm || itm.on === false || !(itm.n > 0)) return; var sp = SP[itm.key]; if (!sp) return;
      if (itm.auto === "lift" && nF < 4) return; if (itm.auto === "bedlift" && nF < 2) return;
      if (sp.stair && nF < 2 && !itm.force) return; if (itm.fl === "up" && nF < 2 && itm.opt) return; if ((itm.fl || sp.fl) === "up" && sp.open === "balc" && nF < 2) return;
      var size = itm.size || "M", sd = sp.stair ? PL.stairDims(T, T.mode === "corr") : null;
      for (var i = 0; i < itm.n; i++) {
        var bk = itm.occ && itm.areaSet !== true ? PL.blockFor(itm.occ, itm.side, nF) : null;
        var a = bk ? bk.area : itm.area > 0 ? +itm.area : sd ? sd.w * sd.d : sp.lift && itm.auto === "bedlift" ? spA(sp, "L") : spA(sp, size), ch = null;
        if (sp.att && itm.noAtt !== true) { var csp = SP[sp.att]; ch = { key: sp.att, sp: csp, a: itm.child > 0 ? +itm.child : spA(csp, size) }; if (itm.area > 0 && itm.child > 0) a = Math.max(4, a - itm.child); }
        var nm = itm.name || sp.n; names[nm] = (names[nm] || 0) + 1;
        out.push({ uid: uid(), key: itm.key, sp: sp, base: nm, name: nm, a: r2(a), child: ch, fl: itm.fl || sp.fl || "any", z: itm.z != null ? itm.z : sp.z, minW: sp.minW || 1.2, main: itm.main != null ? !!itm.main : !!sp.main,
          fix: bk ? bk.fix : itm.fix, seats: itm.seats, beds: itm.beds, stair: sd, open_to: itm.open_to, wid: sp.lift && itm.auto === "bedlift" ? (sp.L[0]) : null });
      }
    });
    Object.keys(names).forEach(function (nm) { if (names[nm] < 2) return; var k = 0; out.forEach(function (o) { if (o.base === nm) o.name = nm + " " + (++k); }); });
    return out;
  };
  function tot(it) { return it.a + (it.child ? it.child.a : 0); }

  /* ---------------- which floor each room goes on ---------------- */
  PL.assign = function (T, insts, nF, cap, size) {
    size = size || tot;
    var all = insts.filter(function (x) { return x.fl === "all"; }), rest = insts.filter(function (x) { return x.fl !== "all"; }), F = [];
    for (var f = 0; f < nF; f++) F.push([]);
    var G = rest.filter(function (x) { return x.fl === "G"; }), up = rest.filter(function (x) { return x.fl === "up"; }), any = rest.filter(function (x) { return x.fl !== "G" && x.fl !== "up"; });
    var target = sum(rest, size) / nF;
    /* ground-floor rooms that do not fit on the ground floor go up first (entry and public rooms stay down) */
    if (nF > 1 && cap > 0) { G.sort(function (a, b) { return (b.main ? 1 : 0) - (a.main ? 1 : 0) || a.z - b.z; }); var acc = 0, keep = [], over = []; G.forEach(function (x) { if (acc + size(x) <= cap * 1.02 || !keep.length) { keep.push(x); acc += size(x); } else over.push(x); }); G = keep; any = over.concat(any); target = Math.max(target, 0); }
    G.forEach(function (x) { F[0].push(x); }); up.forEach(function (x) { F[nF > 1 ? 1 : 0].push(x); });
    any = any.filter(function (x) { return x.fl === "G"; }).concat(any.filter(function (x) { return x.fl !== "G"; }).sort(function (a, b) { return a.z - b.z; }));
    var fi = 0, A = function (k) { return sum(F[k], size); };
    /* same rooms (e.g. class rooms) stay together; fill floor by floor */
    any.forEach(function (x) { while (fi < nF - 1 && A(fi) + size(x) / 2 > target) fi++; F[fi].push(x); });
    /* every floor gets its own copy of the stair, lift, toilet blocks … (same place on every floor) */
    for (var k = 0; k < nF; k++) all.forEach(function (x) { var c = Object.assign({}, x, { uid: uid(), core: x.uid, name: x.name }); F[k].push(c); });
    return F;
  };

  /* ---------------- geometry helpers ---------------- */
  function parts(r) { if (!r.cut) return [{ x: r.x, y: r.y, w: r.w, d: r.d }]; var C = r.cut, o = [];
    var top = Math.abs(C.y + C.d - (r.y + r.d)) < E, left = Math.abs(C.x - r.x) < E;
    o.push({ x: r.x, y: top ? r.y : C.y + C.d, w: r.w, d: r.d - C.d }); o.push({ x: left ? C.x + C.w : r.x, y: C.y, w: r.w - C.w, d: C.d }); return o; }
  PL.parts = parts;
  function shared(A, B) { var s = 0; parts(A).forEach(function (p) { parts(B).forEach(function (q) {
    if (Math.abs(p.x + p.w - q.x) < 1e-4 || Math.abs(q.x + q.w - p.x) < 1e-4) s += Math.max(0, Math.min(p.y + p.d, q.y + q.d) - Math.max(p.y, q.y));
    if (Math.abs(p.y + p.d - q.y) < 1e-4 || Math.abs(q.y + q.d - p.y) < 1e-4) s += Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x)); }); }); return s; }
  PL.shared = shared;
  function edgeLen(r, W, D) { var o = { f: 0, b: 0, l: 0, r: 0 }; parts(r).forEach(function (p) { if (p.y < 1e-4) o.f += p.w; if (Math.abs(p.y + p.d - D) < 1e-4) o.b += p.w; if (p.x < 1e-4) o.l += p.d; if (Math.abs(p.x + p.w - W) < 1e-4) o.r += p.d; }); o.all = o.f + o.b + o.l + o.r; return o; }
  PL.edgeLen = edgeLen;
  function areaOf(r) { return r.w * r.d - (r.cut ? r.cut.w * r.cut.d : 0); }
  PL.areaOf = areaOf;
  function room(inst, x, y, w, d, extra) { return Object.assign({ uid: inst ? inst.uid : uid(), inst: inst, key: inst ? inst.key : "passage", name: inst ? inst.name : "Passage", x: r2(x), y: r2(y), w: r2(w), d: r2(d), cut: null }, extra || {}); }

  /* attached toilet: a corner of its room on the edge "toward" (top / bottom) at the side "side" (L / R) — or a full-depth slice at that side */
  function carve(R, ch, toward, side) {
    var ac = ch.a, hh = clamp(Math.sqrt(ac * 1.35), Math.max(1.5, ch.sp.minW || 1.2), R.d * 0.6), ww = ac / hh, kid;
    if (ww > R.w - 0.9) { ww = R.w - 0.9; hh = ac / ww; }
    if (ww < Math.max(1.2, ch.sp.minW || 1.2) - 0.05 || hh > R.d * 0.72) {   /* slice along the whole depth */
      ww = Math.max(1.2, ac / R.d); if (ww > R.w - 2.1) return null;
      kid = { x: side === "L" ? R.x : R.x + R.w - ww, y: R.y, w: ww, d: R.d }; if (side === "L") R.x += ww; R.w -= ww;
    } else { kid = { x: side === "L" ? R.x : R.x + R.w - ww, y: toward === "top" ? R.y + R.d - hh : R.y, w: ww, d: hh }; R.cut = { x: kid.x, y: kid.y, w: kid.w, d: kid.d }; }
    ["x", "y", "w", "d"].forEach(function (k) { kid[k] = r2(kid[k]); }); ["x", "w"].forEach(function (k) { R[k] = r2(R[k]); }); if (R.cut) ["x", "y", "w", "d"].forEach(function (k) { R.cut[k] = r2(R.cut[k]); });
    return Object.assign(kid, { uid: uid(), inst: { key: ch.key, sp: ch.sp, name: ch.sp.n, a: ch.a, z: 3, minW: ch.sp.minW }, key: ch.key, name: ch.sp.n, parent: R.uid, cut: null });
  }

  /* one row of rooms between x0 and x1, depth d: columns of one room, or of 2–3 small rooms stacked; fixed-width items keep their width.
     o.corr: rooms beside a corridor are never stacked (each needs its own door on the corridor) — a small room gets at least its least width.
     o.stretch: the most a row may be stretched to fill its length; what is left becomes an empty stretch (rects.empty). */
  function colW(it, d) { return Math.max(it.minW || 1.2, tot(it) / d, Math.min(d / 2.2, 3.0)); }
  function packRow(items, x0, x1, y0, d, flip, o) {
    o = o || {}; var cols = [], i = 0, n = items.length;
    while (i < n) {
      var it = items[i]; if (it.fixW) { cols.push({ it: [it], fix: it.fixW }); i++; continue; }
      if (o.corr) { cols.push({ it: [it], fix: null, min: colW(it, d) }); i++; continue; }
      var w = tot(it) / d; if (w >= (it.minW || 1.2) * 0.98 || i === n - 1) { cols.push({ it: [it] }); i++; continue; }
      var grp = [it], A = tot(it), j = i + 1;
      while (j < n && grp.length < 3 && !items[j].fixW) { var nx = items[j]; if (tot(nx) / d >= (nx.minW || 1.2) * 1.6) break; grp.push(nx); A += tot(nx); j++; if (A / d >= Math.max.apply(null, grp.map(function (g) { return g.minW || 1.2; })) * 0.98) break; }
      grp.sort(function (a, b) { return (b.main ? 1 : 0) - (a.main ? 1 : 0); });
      cols.push({ it: grp }); i = j;
    }
    var span = x1 - x0, fixT = sum(cols, function (c) { return c.fix || 0; }), need = sum(cols, function (c) { return c.fix ? 0 : c.min ? c.min : sum(c.it, tot) / d; }), k = need > 0 ? Math.max(0, span - fixT) / need : 0;
    var maxK = o.stretch || 99, left = 0; if (k > maxK) { left = (span - fixT) - need * maxK; k = maxK; }
    if (flip) cols.reverse();
    var out = [], x = x0;
    cols.forEach(function (c) {
      var cw = c.fix ? c.fix : (c.min ? c.min : sum(c.it, tot) / d) * k, A = sum(c.it, tot), y = y0;
      c.it.forEach(function (it, m) { var h = c.it.length === 1 ? d : d * tot(it) / A; out.push({ it: it, x: x, y: y, w: cw, d: h }); y += h; });
      x += cw;
    });
    out.empty = left > 0.6 ? [{ x: x, y: y0, w: x1 - x, d: d }] : [];
    if (left > 0 && left <= 0.6 && out.length) { var lastC = out.filter(function (q) { return Math.abs(q.x + q.w - x) < 1e-6; }); lastC.forEach(function (q) { q.w += x1 - x; }); }
    return out;
  }
  /* a row with fixed obstacles (the stair / core): the items are split between the free stretches by area */
  function packRowObs(items, x0, x1, y0, d, obs, flip, o) {
    var segs = [], cur = x0; obs.slice().sort(function (a, b) { return a[0] - b[0]; }).forEach(function (ob) { if (ob[0] - cur > 0.05) segs.push([cur, ob[0]]); cur = Math.max(cur, ob[1]); }); if (x1 - cur > 0.05) segs.push([cur, x1]);
    if (!segs.length) return { rects: [], empty: [] };
    var L = sum(segs, function (s) { return s[1] - s[0]; }), A = sum(items, tot), groups = segs.map(function () { return []; }), acc = 0, si = 0, lim = (segs[0][1] - segs[0][0]) / L * A;
    items.forEach(function (it) { if (si < segs.length - 1 && acc + tot(it) / 2 > lim) { si++; lim += (segs[si][1] - segs[si][0]) / L * A; } groups[si].push(it); acc += tot(it); });
    var rects = [], empty = [];
    segs.forEach(function (s, k) { if (groups[k].length) { var pr = packRow(groups[k], s[0], s[1], y0, d, flip, o); rects = rects.concat(pr); empty = empty.concat(pr.empty); } else empty.push({ x: s[0], y: y0, w: s[1] - s[0], d: d }); });
    return { rects: rects, empty: empty };
  }
  /* rectangles → rooms (with the attached toilets carved out) */
  function toRooms(rects, W, D) {
    var rooms = [];
    rects.forEach(function (q) {
      var R = room(q.it, q.x, q.y, q.w, q.d, { z: q.it.z }); rooms.push(R);
      if (q.it.child) {
        var toward = q.y + q.d / 2 < D / 2 ? "top" : "bottom", side = q.x < 0.05 ? "L" : Math.abs(q.x + q.w - W) < 0.05 ? "R" : (q.x + q.w / 2 < W / 2 ? "L" : "R");
        if (q.it.corrSide) toward = q.it.corrSide;
        var kid = carve(R, q.it.child, toward, side); if (kid) rooms.push(kid);
      }
    });
    return rooms;
  }
  function fixStair(it, d) { /* stair column width so the flights fit the row depth (flights along the depth, or across) */
    var s = it.stair; if (!s) return null; if (d >= s.d - 0.02) return s.w; if (d >= s.w - 0.02) return s.d; return s.w; }
  function emptyRooms(list, name) { return list.map(function (e) { return room(null, e.x, e.y, e.w, e.d, { z: 2, pass: 1, name: name || "Lobby", key: "passage" }); }); }

  /* ---------------- band layouts (house, canteen, hall) ---------------- */
  function bandOrder(list) { /* zone order; inside the service zone: stair, kitchen, store, utility, toilets together */
    var rank = { stair: 0, kitchen: 1, ckitchen: 1, hkitchen: 1, hall_kit: 1, prep: 2, dish: 3, store: 4, dstore: 4, cstore: 5, utility: 6, toilet: 7, wc: 8, toilet_m: 9, toilet_f: 10, toilet_pwd: 11 };
    return list.slice().sort(function (a, b) { return a.z - b.z || ((rank[a.key] != null ? rank[a.key] : 20) - (rank[b.key] != null ? rank[b.key] : 20)); });
  }
  function cutsOf(n, k) { var o = []; if (k <= 1) return [[]]; if (k === 2) { for (var i = 0; i <= n; i++) o.push([i]); return o; } for (var a = 0; a <= n; a++) for (var b = a; b <= n; b++) o.push([a, b]); return o; }
  function splitBy(list, cut) { var o = [], s = 0; cut.concat([list.length]).forEach(function (c) { o.push(list.slice(s, c)); s = c; }); return o; }
  /* the rooms of one floor into the rows (contiguous in zone order) so that each row is filled close to its size */
  function fillRows(list, defs, W, stair) {
    var real = []; defs.forEach(function (df, i) { if (!df.pass) real.push(i); });
    var caps = real.map(function (i) { return defs[i].d * W - (stair && stair.row === i ? stair.w * defs[i].d : 0); }), best = null, its = list.filter(function (x) { return !(stair && x.sp.stair); });
    cutsOf(its.length, real.length).forEach(function (cut) {
      var ps = splitBy(its, cut), err = 0;
      ps.forEach(function (p, i) { var a = sum(p, function (x) { return x.sp.stair ? fixStair(x, defs[real[i]].d) * defs[real[i]].d : tot(x); }); err += Math.abs(a - caps[i]) / Math.max(1, caps[i]); if (!p.length && !(stair && stair.row === real[i])) err += 3;
        p.forEach(function (x) { if (x.minW && defs[real[i]].d < x.minW - 0.05) err += 2; if (x.sp.stair && fixStair(x, defs[real[i]].d) * 1 > W * 0.6) err += 2; }); });
      if (!best || err < best.err) best = { err: err, ps: ps };
    });
    var out = defs.map(function (df) { return df.pass ? df : { d: df.d, items: [] }; });
    best.ps.forEach(function (p, i) { out[real[i]].items = p; });
    if (stair) { var st = list.filter(function (x) { return x.sp.stair; })[0]; if (st) out[stair.row].items = out[stair.row].items.concat([st]); }
    return out;
  }
  function bandFloor(T, W, D, rowsDef, v, fixedStair) {
    var rects = [], y = 0, extra = [];
    rowsDef.forEach(function (rw, ri) {
      if (rw.pass) { extra.push(room(null, 0, y, W, rw.d, { z: 2, pass: 1, name: "Passage", key: "passage" })); y += rw.d; return; }
      var its = rw.items.slice();
      if (!its.length) { extra.push(room(null, 0, y, W, rw.d, { z: 2, pass: 1, name: "Lobby", key: "passage" })); y += rw.d; return; }
      if (fixedStair && fixedStair.row === ri) {
        var res = packRowObs(its.filter(function (x) { return !x.sp.stair; }), 0, W, y, rw.d, [[fixedStair.x, fixedStair.x + fixedStair.w]], v.mirror, { stretch: 1.5 });
        rects = rects.concat(res.rects); extra = extra.concat(emptyRooms(res.empty));
        var st = its.filter(function (x) { return x.sp.stair; })[0]; if (st) rects.push({ it: st, x: fixedStair.x, y: y, w: fixedStair.w, d: rw.d });
      } else {
        its.forEach(function (x) { x.fixW = x.sp.stair ? fixStair(x, rw.d) : null; });
        var sI = its.filter(function (x) { return x.sp.stair; })[0]; if (sI) { its = its.filter(function (x) { return x !== sI; }); if (v.stairEnd === "L") its.unshift(sI); else its.push(sI); }
        var pr = packRow(its, 0, W, y, rw.d, v.mirror && !sI, { stretch: 1.5 }); rects = rects.concat(pr); extra = extra.concat(emptyRooms(pr.empty));
      }
      y += rw.d;
    });
    return toRooms(rects, W, D).concat(extra);
  }
  PL.bandPlans = function (T, F, W, D, cfg) {
    var out = [], ord = F.map(bandOrder), nG = ord[0].length, Ks = nG < 3 ? [1] : D < 7.2 ? [2] : D < 10 ? [2, 3] : [3, 2], step = D > 13 ? 0.6 : D > 10 ? 0.45 : 0.3, minR = 2.4;
    var hasStair = ord[0].some(function (x) { return x.sp.stair; });
    Ks.forEach(function (k) {
      [false, true].forEach(function (pass) {
        if (pass && (k < 2 || D < 8.4)) return;
        var Dr = D - (pass ? 1.1 : 0), combos = [];
        if (k === 1) combos.push([Dr]);
        else if (k === 2) for (var a = minR; a <= Dr - minR + 1e-6; a += step) combos.push([r2(a), r2(Dr - a)]);
        else for (var a1 = minR; a1 <= Dr - 2 * minR + 1e-6; a1 += step) for (var a2 = 2.1; a2 <= Dr - a1 - minR + 1e-6; a2 += step) combos.push([r2(a1), r2(a2), r2(Dr - a1 - a2)]);
        combos.forEach(function (ds) {
          var defs = []; ds.forEach(function (d, i) { defs.push({ d: d }); if (pass && i === ds.length - 2) defs.push({ pass: 1, d: 1.1 }); });
          [false, true].forEach(function (mirror) { (hasStair ? ["R", "L"] : ["R"]).forEach(function (sEnd) {
            var p = bandVariant(T, ord, W, D, defs, { pass: pass, mirror: mirror, stairEnd: sEnd, k: k }, cfg); if (p) out.push(p); }); });
        });
      });
    });
    return out;
  };
  function bandVariant(T, ord, W, D, defs, v, cfg) {
    var g = fillRows(ord[0], defs, W, null), floors = [bandFloor(T, W, D, g, v, null)];
    var st = floors[0].filter(function (r) { return r.inst && r.inst.sp && r.inst.sp.stair; })[0], stRow = -1;
    if (st) { var y0 = 0; defs.forEach(function (df, i) { if (Math.abs(st.y - y0) < 1e-3 && !df.pass) stRow = i; y0 += df.d; }); }
    for (var f = 1; f < ord.length; f++) { var fs = st && stRow >= 0 ? { row: stRow, x: st.x, w: st.w } : null; floors.push(bandFloor(T, W, D, fillRows(ord[f], defs, W, fs), v, fs)); }
    return { mode: "band", W: W, D: D, floors: floors, v: v, rows: defs.map(function (d) { return d.pass ? -d.d : d.d; }), sig: "b" + v.k + (v.pass ? "p" : "") + (v.mirror ? "m" : "") + v.stairEnd + g.map(function (d) { return d.pass ? "P" : d.items.length; }).join(".") };
  }

  /* ---------------- corridor layouts (office, school, college, hospital, hotel, hostel) ---------------- */
  function splitBands(list, db, coreW, dbl) {
    var ord = list.slice().sort(function (a, b) { return (b.main ? 1 : 0) - (a.main ? 1 : 0) || a.z - b.z; }), cw = ord.map(function (x) { return colW(x, db); }), all = sum(cw);
    if (!dbl) return { front: [], back: ord, L: all + coreW };
    var best = null, af = 0; for (var c = 0; c <= ord.length; c++) { if (c) af += cw[c - 1]; var ab = all - af, L = Math.max(af, ab + coreW), err = L * 10 + Math.abs(af - ab - coreW); if (!best || err < best.err) best = { err: err, c: c, L: L }; }
    return { front: ord.slice(0, best.c), back: ord.slice(best.c), L: best.L };
  }
  /* a room too long for the plot (a 400 m² library on a 7.2 m band) is split into parts */
  function splitBig(ins, db, maxL) { var out = []; ins.forEach(function (x) { var L = tot(x) / db; if (x.fl === "all" || L <= maxL || x.child) { out.push(x); return; } var k = Math.ceil(L / maxL); for (var i = 0; i < k; i++) out.push(Object.assign({}, x, { uid: x.uid + "_" + i, a: r2(x.a / k), name: x.name + " (part " + (i + 1) + ")" })); }); return out; }
  function coreLen(core, db) { return sum(core, function (x) { return x.sp.stair ? x.stair.w : x.sp.lift ? Math.max(2.0, x.wid || 2.2) : Math.max(x.minW || 1.5, tot(x) / db); }); }
  function coreItems(list) { return list.filter(function (x) { return x.fl === "all"; }); }
  PL.corrPlans = function (T, F, W, D, cfg, dbl) {
    var db = T.band, cw = T.cw, out = [];
    var poss = W > 32 ? ["L", "R", "C", "LR"] : ["L", "R", "C"];
    poss.forEach(function (cp) { [false, true].forEach(function (mirror) { var p = corrVariant(T, F, W, D, db, cw, dbl, { core: cp, mirror: mirror }, cfg); if (p) out.push(p); }); });
    return out;
  };
  function coreLayout(core, db, cp, W, T) {
    /* returns [{it, w}] columns of the core and the x ranges they take; LR splits the core in two with a second stair */
    function cols(list) { var o = []; list.forEach(function (x) { var w; if (x.sp.stair) w = x.stair.w; else if (x.sp.lift) w = Math.max(2.0, x.wid || 2.2); else w = Math.max(x.minW || 1.5, tot(x) / db); o.push({ it: x, w: r2(w) }); }); return o; }
    var ord = function (a) { var rank = { stair: 0, lift: 1, toilet_m: 2, toilet_b: 2, bath_blk: 2, toilet_pwd: 3, toilet_f: 4, toilet_g: 4, water: 5, hk: 6, nurse: 7 }; return a.slice().sort(function (p, q) { return (rank[p.key] != null ? rank[p.key] : 9) - (rank[q.key] != null ? rank[q.key] : 9); }); };
    core = ord(core);
    if (cp === "LR") { var st = core.filter(function (x) { return x.sp.stair; })[0], a = [], b = []; core.forEach(function (x, i) { if (x === st) return; ((x.key === "toilet_f" || x.key === "toilet_g" || x.key === "hk" || x.key === "water") ? b : a).push(x); });
      var st2 = st ? Object.assign({}, st, { uid: st.uid + "b", name: "Staircase 2", core: (st.core || st.uid) + "b" }) : null;
      var A = cols((st ? [st] : []).concat(a)), Bc = cols(b.concat(st2 ? [st2] : [])); return [{ x0: 0, cols: A }, { x0: W - sum(Bc, function (c) { return c.w; }), cols: Bc }]; }
    var C = cols(core), cwid = sum(C, function (c) { return c.w; }), x0 = cp === "L" ? 0 : cp === "R" ? W - cwid : r2((W - cwid) / 2);
    if (cp === "R") C.reverse();
    return [{ x0: x0, cols: C }];
  }
  function corrVariant(T, F, W, D, db, cw, dbl, v, cfg) {
    var floors = [], yC = dbl ? db : 0, yB = dbl ? db + cw : cw, coreRanges = null, cores0 = null;
    for (var f = 0; f < F.length; f++) {
      var list = F[f], core = coreItems(list), rest = list.filter(function (x) { return x.fl !== "all"; }), rooms = [];
      var cores = coreLayout(core, db, v.core, W, T); if (f === 0) cores0 = cores;
      var rng = cores.map(function (c) { var w = sum(c.cols, function (k) { return k.w; }); return [c.x0, c.x0 + w]; }); if (f === 0) coreRanges = rng;
      var cwid = sum(rng, function (r) { return r[1] - r[0]; });
      if (cwid > W - 2) return null;
      /* core columns (lift + a filler when the shaft is shallower than the band) */
      cores.forEach(function (c) { var x = c.x0; c.cols.forEach(function (k) {
        if (k.it.sp.lift) { var ld = Math.min(db, (k.it.sp.M[1] || 2.2) + (k.it.wid ? 0.6 : 0)); var yl = dbl ? yB : yB; rooms.push(room(k.it, x, yl, k.w, ld, { z: 3 })); if (db - ld > 0.9) rooms.push(room(null, x, yl + ld, k.w, db - ld, { z: 3, key: "duct", name: "Duct / store", fill: 1 })); }
        else { var rr = room(k.it, x, yB, k.w, db, { z: 3 }); rooms.push(rr); }
        x += k.w; }); });
      /* the rest: front band (double) gets the entry and public rooms first, then the rest balances the two bands */
      var front = [], back = [];
      if (dbl) {
        var sb = splitBands(rest, db, cwid, true); front = sb.front; back = sb.back;
        var main = front.filter(function (x) { return x.main; })[0]; if (main) { front = front.filter(function (x) { return x !== main; }); front.splice(Math.floor(front.length / 2), 0, main); }
        front.forEach(function (x) { x.corrSide = "top"; }); back.forEach(function (x) { x.corrSide = "bottom"; });
        var rf = packRow(front, 0, W, 0, db, v.mirror, { corr: 1, stretch: 1.25 }), rb = packRowObs(back, 0, W, yB, db, rng, v.mirror, { corr: 1, stretch: 1.25 });
        rooms = rooms.concat(toRooms(rf.concat(rb.rects), W, D)).concat(emptyRooms(rf.empty.concat(rb.empty), "Open area"));
      } else {
        var ordList = splitBands(rest, db, cwid, false).back, mainS = ordList.filter(function (x) { return x.main; })[0], ol = ordList.filter(function (x) { return x !== mainS; }); if (mainS) ol.splice(Math.floor(ol.length / 2), 0, mainS);
        ol.forEach(function (x) { x.corrSide = "bottom"; });
        var rs = packRowObs(ol, 0, W, yB, db, rng, v.mirror, { corr: 1, stretch: 1.25 }); rooms = rooms.concat(toRooms(rs.rects, W, D)).concat(emptyRooms(rs.empty, "Open area"));
      }
      rooms.push(room(null, 0, yC, W, cw, { z: 2, pass: 1, corr: 1, name: "Corridor", key: "corridor" }));
      floors.push(rooms);
    }
    return { mode: "corr", dbl: dbl, W: W, D: D, cw: cw, db: db, floors: floors, v: v, sig: "c" + (dbl ? "2" : "1") + v.core + (v.mirror ? "m" : "") };
  }

  /* ---------------- scoring ---------------- */
  var OCT = ["E", "NE", "N", "NW", "W", "SW", "S", "SE"];
  PL.dirOf = function (dx, dy, facing) { /* local (x, y) offset → compass octant, given the side the road is on */
    var X = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] }[facing || "S"], Y = { N: [0, -1], E: [-1, 0], S: [0, 1], W: [1, 0] }[facing || "S"];
    var e = dx * X[0] + dy * Y[0], n = dx * X[1] + dy * Y[1], a = Math.atan2(n, e) * 180 / Math.PI; a = (a + 360 + 22.5) % 360; return OCT[Math.floor(a / 45)];
  };
  PL.score = function (T, plan, cfg) {
    var pen = 0, notes = { win: [], acc: [], tight: [], small: [], vastu: [] }, vhit = 0, vtot = 0, W = plan.W, D = plan.D, nr = 0, bonus = 0;
    plan.floors.forEach(function (rooms, fi) {
      /* a passage / lobby counts as access only when it opens on a hall, lobby or corridor (or on the stair landing) */
      rooms.forEach(function (q) { if (q.pass && !q.corr) q.live = rooms.some(function (o) { return o !== q && !(o.pass && !o.corr) && o.inst && o.inst.sp && (o.inst.sp.circ || o.inst.sp.stair) && shared(q, o) >= 0.95; }) || rooms.some(function (o) { return o.corr && shared(q, o) >= 0.95; }); });
      rooms.forEach(function (r) {
        var sp = r.inst && r.inst.sp, isPass = r.pass || r.fill; if (isPass || !sp) return; nr++;
        var A = areaOf(r), mn = Math.min(r.w, r.d), mx = Math.max(r.w, r.d), asp = mx / Math.max(0.1, mn), lim = sp.asp || 2.0;
        if (r.cut) { var pp = parts(r); mn = Math.min.apply(null, pp.map(function (p) { return Math.max(Math.min(p.w, p.d), Math.min(p.w, p.d)); })); mn = Math.max(mn, Math.min(r.w, r.d) * 0.6); }
        if (asp > lim && !sp.stair) pen += (asp - lim) * 6;
        var minW = sp.minW || 1.2; if (Math.min(r.w, r.d) < minW - 0.05) { pen += (minW - Math.min(r.w, r.d)) * 30; notes.tight.push(r.name); }
        var tgt = r.parent ? r.inst.a : r.inst.a; if (tgt > 0) { var dev = (A - tgt) / tgt; if (dev < -0.15) { pen += (-dev - 0.15) * 25; notes.small.push(r.name); } else if (dev > 0.35) pen += (dev - 0.35) * 6; }
        if (sp.minA && A < sp.minA * 0.97) { pen += 8; if (notes.small.indexOf(r.name) < 0) notes.small.push(r.name); }
        if (sp.stair && r.inst.stair) { var s = r.inst.stair; var fits = (r.w >= s.w - 0.05 && r.d >= s.d - 0.05) || (r.d >= s.w - 0.05 && r.w >= s.d - 0.05); if (!fits) { pen += 25; notes.tight.push(r.name); } }
        var el = edgeLen(r, W, D);
        if ((sp.win === "hab" || sp.win === "hall") && el.all < 1.0) { pen += 14; notes.win.push(r.name); }
        else if (sp.win === "kit" && el.all < 0.9) { pen += 10; notes.win.push(r.name); }
        else if (sp.win === "wet" && el.all < 0.5) { pen += 2.5; }
        if (sp.open && el.all < 1) pen += 15;
        if (sp.open === "park" && el.f < 2.4) pen += 12;
        if (r.inst.main && fi === 0 && el.f < 1.0) { pen += 14; notes.acc.push(r.name + " (not on the road side)"); }
        /* access: shares a wall with a hall / passage / corridor / lobby (or is the entry, or its parent room) */
        if (!r.inst.main && !sp.open) {
          var ok = rooms.some(function (q) { if (q === r) return false; var circ = (q.pass && (q.live || q.corr)) || q.corr || (q.inst && q.inst.sp && q.inst.sp.circ) || (r.parent && q.uid === r.parent); return circ && shared(r, q) >= (r.parent ? 0.7 : 0.95); });
          if (!ok) { pen += sp.stair ? 25 : sp.wet ? 16 : 30; notes.acc.push(r.name); }
        }
        if ((r.key === "kitchen") && rooms.some(function (q) { return q.key === "dining" && shared(r, q) >= 1.0; })) bonus += 4;
        if (r.key === "dining" && rooms.some(function (q) { return q.key === "living" && shared(r, q) >= 1.0; })) bonus += 2;
        if (sp.wet) { var nb = rooms.filter(function (q) { return q !== r && q.inst && q.inst.sp && q.inst.sp.wet && shared(r, q) >= 0.9; }).length; bonus += Math.min(2, nb) * 1.2;
          if (fi > 0) plan.floors[fi - 1].forEach(function (q) { if (q.inst && q.inst.sp && q.inst.sp.wet && Math.min(r.x + r.w, q.x + q.w) - Math.max(r.x, q.x) > 0.6 && Math.min(r.y + r.d, q.y + q.d) - Math.max(r.y, q.y) > 0.6) bonus += 1.5; }); }
        if (cfg.vastu && sp.vastu) { vtot++; var dir = PL.dirOf(r.x + r.w / 2 - W / 2, r.y + r.d / 2 - D / 2, cfg.facing), cen = Math.abs(r.x + r.w / 2 - W / 2) < W * 0.15 && Math.abs(r.y + r.d / 2 - D / 2) < D * 0.15;
          var hit = sp.vastu.indexOf(cen ? "C" : dir) >= 0 ? 1 : sp.vastu.some(function (p) { var a = OCT.indexOf(p), b = OCT.indexOf(dir); return a >= 0 && b >= 0 && (Math.abs(a - b) === 1 || Math.abs(a - b) === 7); }) ? 0.5 : 0;
          vhit += hit; if (hit < 1) { pen += (1 - hit) * 5; if (!hit) notes.vastu.push(r.name + " (" + dir + "; better " + sp.vastu.join("/") + ")"); } }
      });
    });
    var sc = Math.round(100 * Math.exp(-Math.max(0, pen - bonus) / (7 * Math.max(4, nr))));
    var vs = vtot ? Math.round(vhit / vtot * 100) : null;
    return { score: sc, pen: r2(pen), bonus: r2(bonus), notes: notes, vastu: vs };
  };

  /* ---------------- the whole job ---------------- */
  PL.generate = function (cfg) {
    var T = PL.TYPES[cfg.type]; T.id = cfg.type; var R = cfg.rules, plotA = cfg.plot.w * cfg.plot.d, warn = [];
    var bw = r2(cfg.plot.w - R.l - R.rt), bd = r2(cfg.plot.d - R.f - R.r), maxFoot = Math.min(bw * bd, R.cov / 100 * plotA);
    if (!(bw > 3 && bd > 3)) return { err: "With these setbacks there is no room left to build on the plot (" + bw + " × " + bd + " m)." };
    var gf = T.mode === "corr" ? 1.06 : 1.24, opts = [], nF, F, W, D, info = {};
    function tryFloors(n) {
      if (T.mode === "band") {
        var ins0 = PL.expand(T, cfg.items, n), allA = sum(ins0.filter(function (x) { return x.fl === "all"; }), tot), Fl = PL.assign(T, ins0, n, maxFoot / gf - allA);
        var need = Math.max.apply(null, Fl.map(function (l) { return sum(l, tot); })) * gf, w = bw, d = r2(Math.max(6, need / w));
        d = Math.min(d, bd); if (d * w > maxFoot) d = r2(maxFoot / w);
        return { ins: ins0, F: Fl, W: r2(w), D: r2(d), need: need, fit: need <= w * d * 1.04 };
      }
      var db = T.band, cw = T.cw, dbl = bd >= 2 * db + cw - 0.01, Dd = dbl ? 2 * db + cw : db + cw;
      var ins = splitBig(PL.expand(T, cfg.items, n), db, Math.max(bw * 0.8, 14)), core0 = coreLen(coreItems(ins), db), cap = Math.max(20, ((dbl ? 2 : 1) * Math.min(bw, maxFoot / Dd) - core0) * db * 0.88), Fl2 = PL.assign(T, ins, n, cap, function (x) { return colW(x, db) * db; }), Wn = 0;
      Fl2.forEach(function (l) { var c = coreLen(coreItems(l), db); Wn = Math.max(Wn, splitBands(l.filter(function (x) { return x.fl !== "all"; }), db, c, dbl).L); });
      Wn = r2(Math.ceil(Math.max(Wn, 9) * 10) / 10);
      return { ins: ins, F: Fl2, W: Wn, D: r2(Dd), dbl: dbl, fit: Wn <= bw + 0.01 && Wn * Dd <= maxFoot + 0.01, need: Wn * Dd };
    }
    var maxF = T.single ? 1 : 8, fixed = cfg.floors > 0 ? Math.min(maxF, cfg.floors | 0) : 0, res = null;
    if (fixed) res = tryFloors(fixed); else for (var n = 1; n <= maxF; n++) { res = tryFloors(n); if (res.fit) break; }
    nF = res.F.length; F = res.F; W = res.W; D = res.D;
    if (T.mode === "corr" && W > bw + 0.01) { warn.push("The rooms need a building " + W + " m long, but only " + bw + " m is free across the plot — add floors, a larger plot, or fewer rooms."); W = Math.max(W, 9); }
    if (T.mode === "band" && !res.fit) warn.push("The rooms chosen need about " + Math.round(res.need) + " m² per floor but only " + Math.round(W * D) + " m² can be built (setbacks / coverage) — rooms come out smaller; add a floor or choose smaller sizes.");
    var built = W * D * nF, far = built / plotA, cov = W * D / plotA * 100, height = nF * T.h / 1000;
    if (cov > R.cov + 0.5) warn.push("Ground coverage " + cov.toFixed(1) + " % is more than the " + R.cov + " % allowed.");
    if (far > R.far + 0.005) warn.push("FAR " + far.toFixed(2) + " is more than the " + R.far + " allowed — " + Math.round((far - R.far) * plotA) + " m² too much; take a floor off or fewer rooms.");
    if (R.h > 0 && height > R.h + 0.01) warn.push("Height " + height.toFixed(1) + " m is more than the " + R.h + " m allowed.");
    if (T.mode === "band") {
      /* also narrower and deeper footprints of the same area (a house on a wide plot is often better two rooms deep) */
      var Ws = [W]; [0.88, 0.76, 0.66].forEach(function (k) { var w2 = r2(W * k), d2 = r2(Math.min(bd, W * D / w2)); if (w2 >= 6 && d2 > D + 0.5 && w2 * d2 >= W * D * 0.97) Ws.push(w2); });
      Ws.forEach(function (w2) { var d2 = w2 === W ? D : r2(Math.min(bd, W * D / w2)); opts = opts.concat(PL.bandPlans(T, F, w2, d2, cfg)); });
    } else opts = PL.corrPlans(T, F, W, D, cfg, res.dbl);
    opts.forEach(function (p) { p.sc = PL.score(T, p, cfg); });
    opts.sort(function (a, b) { return b.sc.score - a.sc.score; });
    /* the best four that differ */
    var pick = [], seen = {};
    opts.forEach(function (p) { if (pick.length >= 4) return; var key = T.mode === "band" ? p.sig.replace(/[LR]$/, "").slice(0, 4) + p.floors[0].map(function (r) { return r.key; }).slice(0, 6).join() : p.sig; if (seen[key]) return; seen[key] = 1; pick.push(p); });
    if (pick.length < Math.min(4, opts.length)) opts.forEach(function (p) { if (pick.length < 4 && pick.indexOf(p) < 0) pick.push(p); });
    pick.forEach(function (p, i) { p.id = "opt" + (i + 1); p.label = "Option " + "ABCD"[i]; p.nF = nF; p.T = T; p.off = [R.l, R.f]; p.stats = PL.stats(T, p, cfg); });
    if (pick[0]) { W = pick[0].W; D = pick[0].D; built = W * D * nF; far = built / plotA; cov = W * D / plotA * 100; }
    info = { bw: bw, bd: bd, maxFoot: r2(maxFoot), plotA: r2(plotA), nF: nF, W: W, D: D, built: r2(built), far: r2(far), cov: r2(cov), height: r2(height), occ: Math.round(built / T.occ), dbl: res.dbl };
    return { opts: pick, info: info, warn: warn, T: T };
  };
  /* plan drawing for the option cards: rooms, names, areas, the road side, a north arrow */
  var COL = { 0: "#e8e6df", 1: "#f6e7c8", 2: "#fdf3d8", 3: "#d9ecf5", 4: "#e3f1dc" };
  PL.svg = function (p, fi, o) {
    o = o || {}; var rooms = p.floors[fi] || [], W = p.W, D = p.D, pad = 1.2, sc = o.scale || 22, Wp = (W + 2 * pad) * sc, Hp = (D + 2 * pad + 1.2) * sc, X = function (x) { return (x + pad) * sc; }, Y = function (y) { return (D + pad - y) * sc; };
    var h = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + Wp.toFixed(1) + " " + Hp.toFixed(1) + '" width="100%" style="max-width:' + Math.round(Wp) + 'px;font-family:system-ui,sans-serif" role="img" aria-label="Floor plan">';
    h += '<rect x="0" y="0" width="' + Wp + '" height="' + Hp + '" fill="#fff"/>';
    rooms.forEach(function (r) { var sp = r.inst && r.inst.sp, fill = r.corr || r.pass ? "#f2f2f2" : sp && sp.open ? "#ececec" : sp && sp.stair ? "#e9e3f5" : COL[r.z != null ? r.z : 2] || "#fff";
      parts(r).forEach(function (q) { h += '<rect x="' + X(q.x).toFixed(1) + '" y="' + Y(q.y + q.d).toFixed(1) + '" width="' + (q.w * sc).toFixed(1) + '" height="' + (q.d * sc).toFixed(1) + '" fill="' + fill + '" stroke="none"/>'; });
      if (sp && sp.stair) { var n = 7; for (var i = 1; i < n; i++) { var xx = r.w >= r.d ? r.x + r.w * i / n : null; if (xx != null) h += '<line x1="' + X(xx).toFixed(1) + '" y1="' + Y(r.y).toFixed(1) + '" x2="' + X(xx).toFixed(1) + '" y2="' + Y(r.y + r.d).toFixed(1) + '" stroke="#b9a9d6" stroke-width="1"/>'; else { var yy = r.y + r.d * i / n; h += '<line x1="' + X(r.x).toFixed(1) + '" y1="' + Y(yy).toFixed(1) + '" x2="' + X(r.x + r.w).toFixed(1) + '" y2="' + Y(yy).toFixed(1) + '" stroke="#b9a9d6" stroke-width="1"/>'; } } }
    });
    rooms.forEach(function (r) { parts(r).forEach(function (q) { h += '<rect x="' + X(q.x).toFixed(1) + '" y="' + Y(q.y + q.d).toFixed(1) + '" width="' + (q.w * sc).toFixed(1) + '" height="' + (q.d * sc).toFixed(1) + '" fill="none" stroke="#555" stroke-width="' + (r.pass || r.corr ? 0.6 : 1.4) + '"/>'; }); });
    h += '<rect x="' + X(0) + '" y="' + Y(D) + '" width="' + (W * sc) + '" height="' + (D * sc) + '" fill="none" stroke="#222" stroke-width="3"/>';
    rooms.forEach(function (r) { var big = parts(r).sort(function (a, b) { return Math.min(b.w, b.d) * Math.sqrt(b.w * b.d) - Math.min(a.w, a.d) * Math.sqrt(a.w * a.d); })[0], cx = X(big.x + big.w / 2), cy = Y(big.y + big.d / 2), fs = Math.max(7, Math.min(12, sc * Math.min(big.w, big.d) / 4.2)), nm = r.name || "", esc = function (t) { return t.replace(/&/g, "&amp;").replace(/</g, "&lt;"); };
      if (big.w * sc < 26 || big.d * sc < 16) return; var short = nm.length * fs * 0.55 > big.w * sc - 4 ? nm.replace(/ \(.*\)/, "").replace(/ room| hall| area/i, "") : nm; if (short.length * fs * 0.55 > big.w * sc - 4) short = short.slice(0, Math.max(3, Math.floor((big.w * sc - 4) / (fs * 0.55)))) + "…";
      h += '<text x="' + cx.toFixed(1) + '" y="' + (cy - 1).toFixed(1) + '" font-size="' + fs.toFixed(1) + '" text-anchor="middle" fill="#222">' + esc(short) + '</text>';
      if (!r.corr && big.d * sc > 30) h += '<text x="' + cx.toFixed(1) + '" y="' + (cy + fs + 1).toFixed(1) + '" font-size="' + (fs * 0.85).toFixed(1) + '" text-anchor="middle" fill="#666">' + (r.w - 0.23).toFixed(2) + "×" + (r.d - 0.23).toFixed(2) + "</text>"; });
    h += '<text x="' + X(W / 2).toFixed(1) + '" y="' + (Hp - 0.25 * sc).toFixed(1) + '" font-size="' + Math.max(9, sc * 0.5).toFixed(1) + '" text-anchor="middle" fill="#888">ROAD SIDE ▼ (' + W.toFixed(2) + " m)</text>";
    if (o.facing) { var ang = { N: 180, E: 90, S: 0, W: 270 }[o.facing] || 0, ax = Wp - 0.7 * sc, ay = 0.8 * sc; h += '<g transform="translate(' + ax.toFixed(1) + "," + ay.toFixed(1) + ") rotate(" + ang + ')"><path d="M0,-' + (0.5 * sc).toFixed(1) + " L" + (0.18 * sc).toFixed(1) + "," + (0.3 * sc).toFixed(1) + " L0," + (0.15 * sc).toFixed(1) + " L-" + (0.18 * sc).toFixed(1) + "," + (0.3 * sc).toFixed(1) + ' Z" fill="#c0392b"/></g><text x="' + ax.toFixed(1) + '" y="' + (ay + 0.75 * sc).toFixed(1) + '" font-size="' + (sc * 0.42).toFixed(1) + '" text-anchor="middle" fill="#c0392b">N</text>'; }
    return h + "</svg>";
  };
  PL.stats = function (T, p, cfg) {
    var carpet = 0, rooms = 0; p.floors.forEach(function (fl) { fl.forEach(function (r) { var t = 0.23; carpet += Math.max(0, (r.w - t) * (r.d - t) - (r.cut ? r.cut.w * r.cut.d : 0)); if (!r.pass && !r.fill) rooms++; }); });
    var outer = (p.W + 0.23) * (p.D + 0.23), built = outer * p.floors.length;
    return { carpet: Math.round(carpet), built: Math.round(built), eff: Math.round(carpet / built * 100), rooms: rooms, cost: Math.round(built * (cfg.rate || T.rate)) };
  };
})();
