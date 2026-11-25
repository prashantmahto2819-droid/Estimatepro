/* Estimate Pro BIM — ceiling zones and furniture against slanting walls.
   CEILZONE: a part of a ceiling drawn by points (or a whole room) at its own height — gypsum / POP false ceiling, 600 × 600 grid, WPC or wooden
   planks, ACP panels, metal baffles or louvres — so one room can have several heights (a lowered border, a raised centre, a bulkhead over the
   kitchen). Planks / panels are laid from a chosen corner in a chosen direction; the zone may slope (planks step up across the slope), which also
   gives cladding on sloping ceilings and under stairs or roofs. A lowered zone gets a fascia (side) where it steps. Measured as ceiling area
   (+ fascia) under the rate of its kind.
     { t:"czone", pts, lvl, kind, z (underside, mm above the floor; empty = the room's false-ceiling height), dir (°), pw (plank / panel width),
       gap, start (corner index), slope (°), fascia (bool), look, layer }
   ALIGNWALL: turns the selected furniture to the nearest wall (any angle) and sets it back against that wall face. */
(function () {
  "use strict";
  var EP = window.EP, CAD = EP.cad, G = EP.geom, B = EP.bim; if (!B || !CAD || !B.EXT) return;
  B.TYPES.czone = 1;
  var cmd = function (n, a, f) { CAD.commands[n] = { fn: f }; (a || []).forEach(function (x) { CAD.aliases[x] = n; }); };
  var KINDS = {
    gypsum: { n: "Gypsum / POP false ceiling (flat)", look: "paint_pure_white", th: 12, key: "false_ceiling", lines: 0 },
    grid: { n: "Grid ceiling 600 × 600 (mineral fibre tiles)", look: "paint_pure_white", th: 20, key: "grid_ceiling", lines: 600, cross: true },
    wpc: { n: "WPC planks", look: "wood_teak", th: 12, key: "wpc_ceiling", lines: 150, gap: 10 },
    wood: { n: "Wooden planks / tongue-and-groove", look: "wood_teak", th: 12, key: "wood_ceiling", lines: 100, gap: 3 },
    acp: { n: "ACP panels", look: "metal_grey", th: 4, key: "acp_panel", lines: 1220, cross: 2440, gap: 10 },
    baffle: { n: "Metal baffles (fins 50 × 150)", look: "metal_grey", th: 150, key: "baffle_ceiling", lines: 200, fin: 50 },
    louvre: { n: "Wooden louvres (40 × 100)", look: "wood_teak", th: 100, key: "louvre_ceiling", lines: 150, fin: 40 }
  };
  B.CZ_KINDS = KINDS;
  B.MAP.grid_ceiling = B.MAP.grid_ceiling || { c: [["cpwd23", "12.45.3"]], q: /grid|mineral fibre|tile.*ceiling/i };
  B.MAP.wpc_ceiling = B.MAP.wpc_ceiling || { q: /WPC.*(ceiling|panel)|wood plastic composite/i };
  B.MAP.wood_ceiling = B.MAP.wood_ceiling || { q: /(wooden|timber|tongue).*ceiling|ceiling.*(wooden|planks)/i };
  B.MAP.baffle_ceiling = B.MAP.baffle_ceiling || { q: /baffle/i };
  B.MAP.louvre_ceiling = B.MAP.louvre_ceiling || { q: /louv(re|er)/i };
  function K(e) { return KINDS[e.kind] || KINDS.gypsum; }
  function roomOf(doc, e) { var c = cen(e.pts); return doc.d.ents.filter(function (r) { return r.t === "room" && r.pts && (r.lvl || null) === (e.lvl || null) && G.inPoly(c, r.pts); })[0] || null; }
  function zOf(doc, e) { if (e.z != null && e.z !== "" && +e.z > 0) return +e.z; return B.fceilH ? B.fceilH(doc, roomOf(doc, e), e.lvl) : 2700; }
  function soffit(doc, e) { var L = B.level(doc.d, e.lvl); return (L ? L.h : 3000) - (B.ensure(doc.d).slabTh || 125); }
  function cen(p) { var x = 0, y = 0; p.forEach(function (q) { x += q[0]; y += q[1]; }); return [x / p.length, y / p.length]; }
  function area(p) { var a = 0; for (var i = 0; i < p.length; i++) { var q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return Math.abs(a) / 2; }
  /* the strips of the layout: lines across the zone every `w` from the start corner along `dir`; each returns its spans inside the polygon */
  function strips(e, w, dirDeg, off) {
    var p = e.pts, a = (dirDeg || 0) * Math.PI / 180, u = [Math.cos(a), Math.sin(a)], n = [-u[1], u[0]], st = p[Math.max(0, Math.min(p.length - 1, +e.start || 0))];
    var ds = p.map(function (q) { return (q[0] - st[0]) * n[0] + (q[1] - st[1]) * n[1]; }), lo = Math.min.apply(null, ds), hi = Math.max.apply(null, ds), out = [];
    var k0 = Math.floor((lo - (off || 0)) / w);
    for (var k = k0; k * w + (off || 0) < hi + 1e-6 && out.length < 2000; k++) {
      var c = k * w + (off || 0); if (c < lo - 1e-6) continue; var xs = [];
      for (var i = 0; i < p.length; i++) { var A = p[i], Bq = p[(i + 1) % p.length], da = ds[i], db = ds[(i + 1) % p.length]; if ((da <= c && db > c) || (db <= c && da > c)) { var t = (c - da) / (db - da), X = [A[0] + (Bq[0] - A[0]) * t, A[1] + (Bq[1] - A[1]) * t]; xs.push((X[0] - st[0]) * u[0] + (X[1] - st[1]) * u[1]); } }
      xs.sort(function (x, y) { return x - y; });
      for (var j = 0; j + 1 < xs.length; j += 2) out.push({ c: c, s0: xs[j], s1: xs[j + 1], P: function (s, cc) { return [st[0] + u[0] * s + n[0] * cc, st[1] + u[1] * s + n[1] * cc]; }, u: u, n: n, a: a });
    }
    return out;
  }
  B.EXT.czone = {
    plan: function (doc, e) {
      var k = K(e), dashed = G.polySegs(e.pts, true), w = +e.pw || k.lines;
      if (w > 0) { strips(e, w, +e.dir || 0, 0).forEach(function (s) { dashed.push({ k: "L", a: s.P(s.s0, s.c), b: s.P(s.s1, s.c) }); });
        if (k.cross) { var w2 = k.cross === true ? w : k.cross; strips(e, w2, (+e.dir || 0) + 90, 0).forEach(function (s) { dashed.push({ k: "L", a: s.P(s.s0, s.c), b: s.P(s.s1, s.c) }); }); } }
      if (dashed.length > 1500) dashed = dashed.slice(0, 1500);
      return { segs: [], fill: [], dashed: dashed };
    },
    labels: function (doc, e, h) { var c = cen(e.pts); return [{ p: c, s: K(e).n.split(" (")[0] + " @ " + (zOf(doc, e) / 1000).toFixed(2) + (+e.slope ? " ↗ " + e.slope + "°" : ""), h: h * 0.8, al: "c" }]; },
    xform: function (e, M) { var o = JSON.parse(JSON.stringify(e)); o.pts = e.pts.map(function (p) { return G.mApply(M, p); }); var ang = Math.atan2(M[1], M[0]) * 180 / Math.PI; o.dir = ((+e.dir || 0) + ang) % 360; return o; },
    mesh: function (M, doc, e, H) {
      var k = K(e), L = B.level(doc.d, e.lvl), base = L ? L.elev : 0, z = zOf(doc, e), look = B.look(e.look && B.LOOKS[e.look] ? e.look : k.look), th = k.th, sl = Math.tan((+e.slope || 0) * Math.PI / 180);
      var w = +e.pw || k.lines || 0, gap = e.gap != null && e.gap !== "" ? +e.gap : (k.gap || 0), fin = k.fin;
      if (!w) w = 600;   /* flat board: laid in 600 strips so that a slope still steps smoothly */
      var dir = +e.dir || 0;
      strips(e, w, dir, w / 2).forEach(function (s) {
        var len = s.s1 - s.s0; if (len < 5) return; var mid = s.P((s.s0 + s.s1) / 2, s.c), zz = base + z + s.c * sl;
        var width = fin ? fin : Math.max(5, w - gap);
        H.box(M, mid, len, width, s.a * 180 / Math.PI, zz, zz + (fin ? th : th), look);
      });
      /* fascia where the zone is lower than the slab above */
      if (!(e.fascia === false || e.fascia === "false") && !sl) { var top = soffit(doc, e), hf = top - z - th; if (hf > 30) for (var i = 0; i < e.pts.length; i++) { var a = e.pts[i], b = e.pts[(i + 1) % e.pts.length], l = G.dist(a, b); if (l < 10) continue; H.box(M, G.mid(a, b), l, 12, Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI, base + z + th, base + top, look); } }
    },
    qty: function (doc, e) {
      var k = K(e), A = area(e.pts), z = e.lvl ? B.below(doc.d, e.lvl) : "super", sl = Math.cos((+e.slope || 0) * Math.PI / 180) || 1, rows = [{ k: k.key, dim: "A", v: A / sl, label: k.n + " — ceiling zone" + (+e.slope ? " (sloping " + e.slope + "°)" : ""), f: (A / 1e6).toFixed(2) + " m²" + (+e.slope ? " ÷ cos " + e.slope + "°" : ""), z: z }];
      if (!(e.fascia === false || e.fascia === "false") && !(+e.slope)) { var hf = soffit(doc, e) - zOf(doc, e) - k.th, per = 0; for (var i = 0; i < e.pts.length; i++) per += G.dist(e.pts[i], e.pts[(i + 1) % e.pts.length]); if (hf > 30) rows.push({ k: k.key === "acp_panel" ? "acp_panel" : "false_ceiling", dim: "A", v: per * hf, label: "Fascia (side) of the ceiling zone", f: (per / 1000).toFixed(2) + " × " + (hf / 1000).toFixed(2), z: z }); }
      return rows;
    }
  };

  var KL = Object.keys(KINDS);
  cmd("CEILZONE", ["CZONE", "CEILINGZONE", "CEILCLAD", "FALSECEILZONE"], async function (ed) {
    var doc = ed.doc, d = doc.d, lv = B.ensure(d).cur, kw = await ed.getKw("Ceiling: " + KL.map(function (k, i) { return (i + 1) + " " + KINDS[k].n.split(" (")[0]; }).join(", "), KL.map(function (k) { return k[0].toUpperCase() + k.slice(1); }), "Gypsum");
    if (!kw) return; var kind = String(kw).toLowerCase(); if (!KINDS[kind]) kind = "gypsum";
    var pts = [], p, first = await ed.getPoint("First corner of the ceiling zone (or R = the whole room under the cursor)", { kw: ["Room"] });
    if (first === "Room") { var rp = await ed.getPoint("Click inside the room"); if (!rp || !rp.length) return; var rm = d.ents.filter(function (r) { return r.t === "room" && r.pts && (r.lvl || null) === (lv || null) && G.inPoly(rp, r.pts); })[0]; if (!rm) { ed.say("No room there."); return; } pts = rm.pts.map(function (q) { return [q[0], q[1]]; }); }
    else { if (!first || !first.length) return; pts.push(first); while ((p = await ed.getPoint("Next corner (Enter to close)", { base: pts[pts.length - 1], opt: true })) && p.length) pts.push(p); }
    if (pts.length < 3) { ed.say("A ceiling zone needs three corners or more."); return; }
    var zz = await ed.getNum("Height of its underside above the floor, mm (0 = the room's false-ceiling height)", { def: 0 });
    var dir = 0; if (KINDS[kind].lines) { var dp = await ed.getPoint("Direction of the planks / panels: pick a point from the first corner (Enter = along the first side)", { base: pts[0], opt: true }); dir = dp && dp.length ? Math.atan2(dp[1] - pts[0][1], dp[0] - pts[0][0]) * 180 / Math.PI : Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0]) * 180 / Math.PI; }
    var slope = await ed.getNum("Slope across the planks, degrees (0 = level)", { def: 0 });
    doc.begin("Ceiling zone"); try { doc.add({ t: "czone", pts: pts, lvl: lv, kind: kind, z: +zz > 0 ? Math.round(+zz) : null, dir: Math.round(dir * 10) / 10, start: 0, slope: +slope || 0, layer: "A-CEIL" }); } finally { doc.commit(); }
    ed.say(KINDS[kind].n + " zone drawn (" + (area(pts) / 1e6).toFixed(2) + " m²). Change its height, plank width, direction, start corner, slope or look in Properties.");
  });

  /* ---------- furniture against a slanting wall ---------- */
  cmd("ALIGNWALL", ["ALIGNTOWALL", "WALLALIGN", "TOWALL"], async function (ed) {
    var doc = ed.doc, d = doc.d, sel = Array.from(ed.sel || []).map(function (id) { return doc.map[id]; }).filter(function (e) { return e && e.t === "asset"; });
    if (!sel.length) { var pk = await ed.getEnt("Pick the furniture to set against a wall"); if (pk && pk.t === "asset") sel = [pk]; }
    if (!sel.length) { ed.say("Select furniture (library items) first."); return; }
    var n = 0; doc.begin("Align to wall"); try {
      sel.forEach(function (e) {
        var best = null; d.ents.forEach(function (w) { if (w.t !== "wall" || (w.lvl || null) !== (e.lvl || null)) return; var ab = G.sub(w.b, w.a), l = G.len(ab); if (l < 10) return; var u = [ab[0] / l, ab[1] / l], t = Math.max(0, Math.min(l, (e.p[0] - w.a[0]) * u[0] + (e.p[1] - w.a[1]) * u[1])), q = [w.a[0] + u[0] * t, w.a[1] + u[1] * t], dd = G.dist(e.p, q); if (!best || dd < best.d) best = { d: dd, w: w, u: u, q: q }; });
        if (!best || best.d > 3000) return;
        var w = best.w, nrm = [-best.u[1], best.u[0]], side = ((e.p[0] - best.q[0]) * nrm[0] + (e.p[1] - best.q[1]) * nrm[1]) >= 0 ? 1 : -1, nn = [nrm[0] * side, nrm[1] * side];
        var A = B.ASSET_LIB[e.kind] || {}, dep = (e.D || A.d || 500) * (+e.sc || 1), th = w.th || 230, face = th / 2;
        if (w.just === "l" || w.just === "r") face = side === (w.just === "l" ? 1 : -1) ? th : 0;   /* a wall drawn by one face: its body lies to one side */
        var back = A.mount === "wall" ? 0 : dep / 2, P = [best.q[0] + nn[0] * (face + back + 5), best.q[1] + nn[1] * (face + back + 5)];
        var rot = Math.round((Math.atan2(nn[1], nn[0]) * 180 / Math.PI - 90) * 10) / 10;   /* the item's front (local +y) looks away from the wall */
        var o = CAD.clone(e); o.p = [Math.round(P[0]), Math.round(P[1])]; o.rot = rot; doc.mod(e.id, o); n++;
      });
    } finally { doc.commit(); }
    ed.say(n ? n + " item" + (n > 1 ? "s" : "") + " set against the nearest wall, square to it." : "No wall within 3 m.");
  });
})();
