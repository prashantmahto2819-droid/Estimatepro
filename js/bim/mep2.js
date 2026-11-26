/* Estimate Pro BIM — MEP drawings, part 4: everything together.
   - PLUMBAUTO: the plumbing of a floor laid out from the sanitary fittings already placed: a soil-and-vent stack and a water
     riser in each toilet / bath / kitchen, a floor trap where a wet room has none, soil pipes from the WCs, waste pipes from basins,
     sinks, showers and baths (through the floor trap), cold water from the riser as a branched line, hot water from the geyser, and
     on the ground floor the house connection from every stack to an outside S.W. drain round the building with manholes at the
     ends, bends and junctions, ending at the septic tank or the outfall manhole if one is placed.
   - Vertical stacks and risers are measured floor to floor (the top one up to the roof + 600 mm vent / up to the tank).
   - MEPAUTO: the whole building in one go — for every floor with rooms: electrical points by room, a DB, auto wiring, plumbing;
     a meter board and two earth pits outside on the ground floor; then the separate electrical and plumbing sheets.
   - MEPSHEETS: an electrical layout sheet and a plumbing layout sheet for every floor, side by side beside the drawing, each a copy
     of the plan showing only its service with its legend (and the single line diagram on the electrical sheet). They are brought up
     to date with Update views and before every plot, and are listed in File ▾ → Plot PDF sheet.
   - SCHEDULE → Plumbing gets the water supply and sanitation design: persons, daily demand (135 L/person/day, NBC 2016 Part 9),
     overhead tank and sump, septic tank (IS 2470 Part 1), drainage fixture units and pipe sizes. */
(function () {
  "use strict";
  var EP = window.EP, CAD = EP.cad, G = EP.geom, B = EP.bim; if (!B || !CAD || !B.ASSET_LIB || !B.EXT || !B.EXT.asset || !B.PSVC || !CAD.commands.WIREAUTO) return;
  var A = B.ASSET_LIB, TAU = Math.PI * 2, X0 = B.EXT.asset, SVC = B.PSVC;
  var cmd = function (n, a, f) { CAD.commands[n] = { fn: f }; (a || []).forEach(function (x) { CAD.aliases[x] = n; }); };
  function circ(c, r) { return { k: "A", c: c, r: r, s: 0, e: TAU, full: true }; }
  function L(a, b) { return { k: "L", a: a, b: b }; }
  function scaleOf(d) { return (d.layouts && d.layouts[0] && d.layouts[0].scale) || (d.sheet && d.sheet.scale) || 100; }
  function lvls(d) { return B.ensure(d).levels.slice().sort(function (a, b) { return a.elev - b.elev; }); }
  function groundId(d) { var ls = lvls(d), g = ls.filter(function (l) { return l.elev > -1; })[0] || ls[0]; return g ? g.id : null; }
  function roofTop(d) { var ls = lvls(d), top = ls[ls.length - 1]; return top ? top.elev : 3200; }
  function same(a, b) { return (a || null) === (b || null); }

  /* ---------- new item: the water riser ---------- */
  if (!A.cw_riser) A.cw_riser = { n: "Water supply riser (CPVC, from the overhead tank)", cat: "Plumbing", w: 100, d: 100, h: 3000, key: "cw_riser",
    sym: function (X) { return [circ(X([0, 0]), 60 * X.s), circ(X([0, 0]), 25 * X.s), L(X([-60, 0]), X([60, 0]))]; },
    mesh: function (M, X, z0, LK, H) { H.box(M, X([0, 0]), 40 * X.s, 40 * X.s, X.r, z0, z0 + 3000, LK("plastic_white")); } };
  B.MAP.cw_riser = B.MAP.cw_riser || { q: /^$/ };

  /* ---------- what a library item is to the plumbing ---------- */
  function pcls(e) {
    if (!e || e.t !== "asset") return null; var k = e.kind || "";
    if (k === "cw_riser") return "RISER"; if (/^vent_pipe/.test(k)) return "STACK";
    if (/^(ewc|iwc)$|^wc_(close|wall|squat)/.test(k)) return "WC";
    if (/^(floor_trap|floor_drain)/.test(k)) return "FT"; if (/^geyser/.test(k)) return "GY";
    if (/^shower_(overhead|wall_mixer)$/.test(k)) return "SH";
    if (/^(basin|vanity|sink|urinal$|urinal_(stall|flat)|shower$|shower_(tray|cubicle)|bath|wash_area|wash_machine|bidet)/.test(k)) return "W";
    return null;
  }
  B.pclass = pcls;
  var DFU = { WC: 4, FT: 1, SH: 2 }; function dfu(e) { var c = pcls(e), k = e.kind || ""; if (c === "W") return /^sink/.test(k) ? 2 : /^bath/.test(k) ? 3 : /^(urinal|wash_machine|wash_area)/.test(k) ? 2 : /^shower/.test(k) ? 2 : 1; return DFU[c] || 0; }
  function hotUser(e) { var c = pcls(e), k = e.kind || ""; return c === "SH" || (c === "W" && /^(basin|vanity|sink|shower|bath)/.test(k)); }
  function cwUser(e) { var c = pcls(e); return c === "WC" || c === "W" || c === "SH" || c === "GY"; }

  /* ---------- stacks and risers measured floor to floor ---------- */
  function vertLen(doc, e, test) {
    var d = doc.d, Lv = B.level(d, e.lvl), ls = lvls(d), up = ls.filter(function (l) { return l.elev > Lv.elev + 1; });
    var above = up.filter(function (l) { return d.ents.some(function (o) { return o !== e && same(o.lvl, l.id) && test(o) && G.dist(o.p, e.p) < 600; }); })[0];
    return above ? { v: above.elev - Lv.elev, top: false } : { v: Math.max(1000, roofTop(d) - Lv.elev) + 600, top: true };
  }
  var aq0 = X0.qty;
  X0.qty = function (doc, e) {
    var c = pcls(e); if (!(c === "RISER" || (c === "STACK" && e.stack))) return aq0.apply(this, arguments);
    var z = e.lvl ? B.below(doc.d, e.lvl) : "super", Lv = B.level(doc.d, e.lvl), nm = Lv ? Lv.name : "";
    if (c === "STACK") { var isS = function (o) { return pcls(o) === "STACK" && o.stack; }, s = vertLen(doc, e, isS), Lg = B.level(doc.d, groundId(doc.d)), below = lvls(doc.d).some(function (l) { return l.elev < Lv.elev - 1 && doc.d.ents.some(function (o) { return same(o.lvl, l.id) && isS(o) && G.dist(o.p, e.p) < 600; }); });
      if (!below && Lg && Lv.elev > Lg.elev + 1) s.v += Lv.elev - Lg.elev; return [{ k: "pipe_rain_110", dim: "L", v: s.v, label: "uPVC soil & vent stack 110 mm (vertical, " + nm + (s.top ? " up to the roof + 600 vent" : " to the floor above") + ")", f: (s.v / 1000).toFixed(2) + " m vertical", z: z }]; }
    var r = vertLen(doc, e, function (o) { return pcls(o) === "RISER"; }); return [{ k: "pipe_cpvc_" + (+e.dia || 25), dim: "L", v: r.v, label: "CPVC water riser " + (+e.dia || 25) + " mm from the overhead tank (vertical, " + nm + ")", f: (r.v / 1000).toFixed(2) + " m vertical", z: z }];
  };

  /* ---------- routes ---------- */
  function lpath(a, b, poly) {
    if (Math.abs(a[0] - b[0]) < 5 || Math.abs(a[1] - b[1]) < 5) return [a, b];
    var c1 = [b[0], a[1]], c2 = [a[0], b[1]]; return (poly && !G.inPoly(c1, poly) && G.inPoly(c2, poly)) ? [a, c2, b] : [a, c1, b];
  }
  function bbox(pts) { var b = [Infinity, Infinity, -Infinity, -Infinity]; pts.forEach(function (p) { G.ext(b, p); }); return b; }
  function bldBox(d, lv) {
    var pts = []; d.ents.forEach(function (e) { if (!same(e.lvl, lv)) return; if (e.t === "wall") { if (e.site || e.layer === "A-SITE" || e.layer === "R-DRAIN") return; pts.push(e.a, e.b); } else if (e.t === "room" && e.pts) pts = pts.concat(e.pts); });
    if (!pts.length) d.ents.forEach(function (e) { if (e.t === "wall") pts.push(e.a, e.b); });
    return pts.length ? bbox(pts) : null;
  }
  /* point on the outline of rectangle R nearest p, and its distance along the outline (anticlockwise from the lower-left corner) */
  function rectParam(R, p) {
    var c = [[R[0], R[1]], [R[2], R[1]], [R[2], R[3]], [R[0], R[3]]], best = null, s0 = 0;
    for (var i = 0; i < 4; i++) { var a = c[i], b = c[(i + 1) % 4], ab = G.sub(b, a), l = G.len(ab), t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (l * l))), q = [a[0] + ab[0] * t, a[1] + ab[1] * t], dd = G.dist(p, q);
      if (!best || dd < best.d) best = { d: dd, q: q, s: s0 + t * l }; s0 += l; }
    best.P = s0; best.c = c; return best;
  }
  function rectPath(R, s1, s2) {   /* outline from s1 to s2 going anticlockwise */
    var c = [[R[0], R[1]], [R[2], R[1]], [R[2], R[3]], [R[0], R[3]]], ls = [R[2] - R[0], R[3] - R[1], R[2] - R[0], R[3] - R[1]], P = 2 * (ls[0] + ls[1]);
    var at = function (s) { s = ((s % P) + P) % P; var acc = 0; for (var i = 0; i < 4; i++) { if (s <= acc + ls[i] + 1e-6) { var t = (s - acc) / ls[i]; return [c[i][0] + (c[(i + 1) % 4][0] - c[i][0]) * t, c[i][1] + (c[(i + 1) % 4][1] - c[i][1]) * t]; } acc += ls[i]; } return c[0]; };
    var len = ((s2 - s1) % P + P) % P, out = [at(s1)], acc = 0, corners = [];
    for (var k = 0; k < 8; k++) { var cs = acc; corners.push(cs); acc += ls[k % 4]; }
    var base = Math.floor(s1 / P) * P; [0, 1, 2, 3, 4, 5, 6, 7].forEach(function (k) { var cs = base + corners[k]; if (cs > s1 + 1 && cs < s1 + len - 1) out.push(at(cs)); });
    out.push(at(s1 + len)); return out;
  }

  /* ---------- PLUMBAUTO core for one floor ---------- */
  function wetRooms(doc, lv) {
    var d = doc.d; return d.ents.filter(function (r) { return r.t === "room" && r.pts && same(r.lvl, lv); }).map(function (r) {
      var fx = d.ents.filter(function (e) { var c = pcls(e); return c && same(e.lvl, lv) && G.inPoly(e.p, r.pts); }); return { r: r, fx: fx };
    }).filter(function (o) { return o.fx.some(function (e) { var c = pcls(e); return c === "WC" || c === "W" || c === "SH" || c === "FT"; }); });
  }
  function plumbFloor(doc, lv, add) {
    var d = doc.d, rooms = wetRooms(doc, lv), Bb = bldBox(d, lv), st = { rooms: rooms.length, runs: 0, stacks: [], items: 0, wc: 0, fu: 0 };
    if (!rooms.length || !Bb) return st;
    var run = function (svc, dia, pts, extra) { if (pts.length < 2) return; for (var i = pts.length - 1; i > 0; i--) if (G.dist(pts[i], pts[i - 1]) < 5) pts.splice(i, 1); if (pts.length < 2) return; var S = SVC[svc];
      add(Object.assign({ t: "run", kind: B.mepKindFor(svc, dia), pts: pts.map(function (p) { return [Math.round(p[0]), Math.round(p[1])]; }), side: 1, z: S.z, lvl: lv, svc: svc, dia: dia, slope: S.slope, layer: { cw: "P-CW", hw: "P-HW", soil: "P-SOIL", waste: "P-WASTE", vent: "P-VENT", rw: "P-RW", drain: "P-DRAIN" }[svc], mauto: 1 }, extra || {})); st.runs++; };
    var asset = function (kind, p, o) { var e = add(Object.assign({ t: "asset", kind: kind, p: [Math.round(p[0]), Math.round(p[1])], rot: 0, sc: 1, lvl: lv, layer: "P-FIX", mauto: 1 }, o || {})); st.items++; return e; };
    rooms.forEach(function (o) {
      var r = o.r, bb = B.polyBox(r.pts), cen = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2], kit = /kitchen|pantry|cook/i.test(r.name || ""), fx = o.fx;
      var wcs = fx.filter(function (e) { return pcls(e) === "WC"; }); st.wc += wcs.length; fx.forEach(function (e) { st.fu += dfu(e); });
      /* stack: one already there, or one in line with a stack on another floor, or at the corner nearest the outside */
      var S = fx.filter(function (e) { return pcls(e) === "STACK"; })[0], Sp;
      if (S) Sp = S.p; else {
        var other = d.ents.filter(function (e) { return pcls(e) === "STACK" && e.stack && !same(e.lvl, lv) && G.inPoly(e.p, r.pts); })[0];
        if (other) Sp = other.p.slice(); else {
          var cs = [[bb[0], bb[1]], [bb[2], bb[1]], [bb[2], bb[3]], [bb[0], bb[3]]], ext = function (c) { return Math.min(Math.abs(c[0] - Bb[0]), Math.abs(c[0] - Bb[2])) + Math.min(Math.abs(c[1] - Bb[1]), Math.abs(c[1] - Bb[3])); }, nearWc = function (c) { return wcs.reduce(function (a, w) { return a + G.dist(w.p, c); }, 0) / 10; };
          var c0 = cs.slice().sort(function (a, b) { return (ext(a) + nearWc(a)) - (ext(b) + nearWc(b)); })[0]; Sp = [c0[0] + (c0[0] < cen[0] ? 150 : -150), c0[1] + (c0[1] < cen[1] ? 150 : -150)];
        }
        asset("vent_pipe_110", Sp, { stack: true, name: "SVP" });
      }
      st.stacks.push(Sp);
      /* riser next to the stack */
      var R = fx.filter(function (e) { return pcls(e) === "RISER"; })[0], Rp = R ? R.p : [Sp[0] + (Sp[0] < cen[0] ? 300 : -300), Sp[1]];
      if (!R) asset("cw_riser", Rp, { dia: 25 });
      /* floor trap for a toilet / bath without one */
      var FT = fx.filter(function (e) { return pcls(e) === "FT"; })[0], wastes = fx.filter(function (e) { var c = pcls(e); return c === "W"; });
      if (!FT && !kit && (wastes.length || fx.some(function (e) { return pcls(e) === "SH"; }))) { var fp = G.add(Sp, G.mul(G.sub(cen, Sp), 0.4)); FT = asset("floor_trap", fp); st.fu += 1; }
      /* soil and waste */
      wcs.forEach(function (w) { run("soil", 110, lpath(w.p, Sp, r.pts)); });
      wastes.forEach(function (w) { var to = (FT && !/^sink/.test(w.kind || "")) ? FT.p : Sp; run("waste", 75, lpath(w.p, to, r.pts)); });
      fx.filter(function (e) { return pcls(e) === "FT" && e !== FT; }).forEach(function (f) { run("waste", 75, lpath(f.p, Sp, r.pts)); });
      if (FT) run("waste", 75, lpath(FT.p, Sp, r.pts));
      /* cold water: a branched line from the riser, each fitting joined to the nearest point of what is already laid */
      var tree = function (from, users, svc, d0) { var nodes = [from], first = true;
        users.slice().sort(function (a, b) { return G.dist(a.p, from) - G.dist(b.p, from); }).forEach(function (u) {
          var nb = nodes.slice().sort(function (a, b) { return G.dist(a, u.p) - G.dist(b, u.p); })[0], P = lpath(nb, u.p, r.pts); run(svc, first ? d0 : 15, P); first = false; nodes = nodes.concat(P.slice(1)); }); };
      tree(Rp, fx.filter(cwUser), "cw", 20);
      var gy = fx.filter(function (e) { return pcls(e) === "GY"; })[0]; if (gy) tree(gy.p, fx.filter(hotUser), "hw", 15);
    });
    return st;
  }
  /* the ground floor: house connections and the outside drain */
  function drainOutside(doc, add, stacks, nwc) {
    var d = doc.d, g = groundId(d), Bb = bldBox(d, g); if (!Bb || !stacks.length) return { runs: 0 };
    var R = [Bb[0] - 1000, Bb[1] - 1000, Bb[2] + 1000, Bb[3] + 1000], uniq = [];
    stacks.forEach(function (p) { if (!uniq.some(function (q) { return G.dist(p, q) < 600; })) uniq.push(p); });
    var dia = nwc > 20 ? 150 : 100, runs = 0, mk = function (svc, dia2, pts, o) { add(Object.assign({ t: "run", kind: B.mepKindFor(svc, dia2), pts: pts.map(function (p) { return [Math.round(p[0]), Math.round(p[1])]; }), side: 1, z: SVC[svc].z, lvl: g, svc: svc, dia: dia2, slope: SVC[svc].slope, layer: svc === "drain" ? "P-DRAIN" : "P-SOIL", mauto: 1 }, o || {})); runs++; };
    var outs = uniq.map(function (p) { var q = rectParam(R, p); mk("soil", 110, [p, q.q]); return q; });
    var tank = d.ents.filter(function (e) { return e.t === "asset" && same(e.lvl, g) && /^(septic|manhole)/.test(e.kind || "") && !(e.kind === "manhole" && d.ents.some(function (x) { return x.kind === "septic_tank" && same(x.lvl, g); })) && !G.inPoly(e.p, [[Bb[0], Bb[1]], [Bb[2], Bb[1]], [Bb[2], Bb[3]], [Bb[0], Bb[3]]]); })[0];
    var tq = tank ? (tank.kind === "septic_tank" ? [tank.p[0] - 1300 * Math.cos((tank.rot || 0) * Math.PI / 180), tank.p[1] - 1300 * Math.sin((tank.rot || 0) * Math.PI / 180)] : tank.p) : null;
    var T = tank ? rectParam(R, tq) : outs.slice().sort(function (a, b) { return a.q[1] - b.q[1]; })[0], P = T.P;
    var ccw = [], cw = []; outs.forEach(function (o) { if (o === T) return; var a = ((o.s - T.s) % P + P) % P; if (a < 1) return; (a <= P / 2 ? ccw : cw).push({ o: o, a: a }); });
    if (ccw.length) { var far = ccw.sort(function (x, y) { return y.a - x.a; })[0]; var pth = rectPath(R, T.s, T.s + far.a).reverse(); mk("drain", dia, pth, { mh: 30 }); }
    if (cw.length) { var far2 = cw.sort(function (x, y) { return y.a - x.a; })[0]; mk("drain", dia, rectPath(R, T.s - (P - far2.a), T.s), { mh: 30 }); }
    if (tank && G.dist(T.q, tq) > 300) mk("drain", dia, lpath(T.q, tq), { mh: 30 });
    if (!ccw.length && !cw.length && !tank) mk("drain", dia, [T.q, G.add(T.q, [0, -2000])], { mh: 30 });
    return { runs: runs, tank: !!tank };
  }

  function clearAuto(doc, lvSet) { doc.d.ents.filter(function (e) { return e.mauto && (!lvSet || lvSet[e.lvl || ""]); }).forEach(function (e) { doc.del(e.id); }); }
  function prep(ed) { B.mepEnsurePLayers(ed); var d = ed.doc.d; if (!B.plbOn(d)) ed.doc.set("mep", Object.assign({}, d.mep || { on: false }, { plb: true })); }
  async function plumbAll(ed, onlyLv) {
    var doc = ed.doc, d = doc.d, ls = lvls(d).map(function (l) { return l.id; }).filter(function (id) { return onlyLv === undefined || id === onlyLv; }), set = {}, tot = { rooms: 0, runs: 0, items: 0, wc: 0, fu: 0, stacks: [] };
    ls.forEach(function (id) { set[id || ""] = 1; }); prep(ed);
    doc.begin("Plumbing layout"); try {
      clearAuto(doc, onlyLv === undefined ? null : set); var add = function (o) { return doc.add(o); };
      lvls(d).forEach(function (l) { var st = plumbFloor(doc, l.id, add); ["rooms", "runs", "items", "wc", "fu"].forEach(function (k) { tot[k] += st[k]; }); tot.stacks = tot.stacks.concat(st.stacks); });
      if (tot.rooms) { var risers = d.ents.filter(function (e) { return pcls(e) === "RISER"; }).map(function (e) { return e.p; }); tot.svc = B.mepServices(doc, add, risers); }
      var dr = drainOutside(doc, add, tot.stacks, tot.wc); tot.runs += dr.runs; tot.tank = dr.tank;
    } finally { doc.commit(); }
    return tot;
  }
  cmd("PLUMBAUTO", ["AUTOPLUMB", "PLUMBINGAUTO", "PIPESAUTO"], async function (ed) {
    var d = ed.doc.d, any = lvls(d).some(function (l) { return wetRooms(ed.doc, l.id).length; });
    if (!any) { ed.say("No toilet, bath or kitchen with fittings yet. Place the WC, wash basin, sink, shower or floor trap (Interior → Library → Plumbing) inside the rooms, then run PLUMBAUTO again."); return; }
    var old = d.ents.filter(function (e) { return e.mauto; }).length;
    if (old) { var ok = await ed.getKw("Lay the plumbing again? The " + old + " pipes and items laid automatically before are replaced (your own pipes stay).", ["Yes", "No"], "Yes"); if (ok !== "Yes") return; }
    var t = await plumbAll(ed);
    ed.say("Plumbing laid for " + t.rooms + " wet room" + (t.rooms === 1 ? "" : "s") + " on all floors: " + t.runs + " pipe runs, " + t.items + " stacks / risers / floor traps, the house drain with manholes" + (t.tank ? " to the septic tank / manhole" : "") + (t.svc ? (t.svc.tank ? ", overhead tank on the roof" : "") + (t.svc.sep ? ", septic tank and soak pit" : "") + (t.svc.rwp ? ", " + t.svc.rwp + " rain-water pipes" : "") : "") + ". " + t.wc + " WC, " + t.fu + " fixture units. Check with SCHEDULE → Plumbing and Isometric; move or edit any pipe as you like.");
  });

  /* ---------- meter board and earth pits outside, near the DB ---------- */
  function elecOutside(doc, add) {
    var d = doc.d, g = groundId(d), Bb = bldBox(d, g), db = d.ents.filter(function (e) { return B.eclass(e) === "DB" && same(e.lvl, g); })[0], n = 0; if (!Bb || !db) return 0;
    var sides = [[Math.abs(db.p[0] - Bb[0]), [Bb[0] - 150, db.p[1]], [-1, 0]], [Math.abs(db.p[0] - Bb[2]), [Bb[2] + 150, db.p[1]], [1, 0]], [Math.abs(db.p[1] - Bb[1]), [db.p[0], Bb[1] - 150], [0, -1]], [Math.abs(db.p[1] - Bb[3]), [db.p[0], Bb[3] + 150], [0, 1]]].sort(function (a, b) { return a[0] - b[0]; })[0];
    var has = function (k) { return d.ents.some(function (e) { return B.eclass(e) === k; }); }, rotOf = function (u) { return Math.round(Math.atan2(u[1], u[0]) * 180 / Math.PI - 90); };
    if (!has("MB")) { add({ t: "asset", kind: "meter_board", p: sides[1], rot: rotOf(sides[2]), sc: 1, lvl: g, layer: "E-POINT", eauto: 1, name: "MB" }); n++; }
    if (!has("E")) { var u = sides[2], t = [-u[1], u[0]], b0 = G.add(sides[1], G.mul(u, 1350)); [-1500, 1500].forEach(function (s) { add({ t: "asset", kind: "earth_pit", p: G.add(b0, G.mul(t, s)), rot: 0, sc: 1, lvl: g, layer: "E-POINT", eauto: 1 }); n++; }); }
    return n;
  }

  /* ---------- MEPSHEETS: separate electrical and plumbing layout sheets ---------- */
  function hasE(d, lv) { return d.ents.some(function (e) { return same(e.lvl, lv) && (B.eclass(e) || e.t === "ewire"); }); }
  function hasP(d, lv) { return d.ents.some(function (e) { return same(e.lvl, lv) && ((e.t === "run" && e.svc) || pcls(e)); }); }
  function lvlBox(doc, lv) { var b = [Infinity, Infinity, -Infinity, -Infinity], d = doc.d;
    d.ents.forEach(function (e) { if (!B.TYPES[e.t] || e.t === "land" || e.t === "model3d") return; var el = e.lvl || (e.host && doc.map[e.host] ? doc.map[e.host].lvl : null); if (!same(el, lv)) return; var x; try { x = doc.bbox(e); } catch (er) { return; } if (x && isFinite(x[0])) { G.ext(b, [x[0], x[1]]); G.ext(b, [x[2], x[3]]); } });
    return isFinite(b[0]) ? [b[0] - 1500, b[1] - 1500, b[2] + 1500, b[3] + 1500] : null; }
  function snap(ed, lv, v) {
    var doc = ed.doc, d = doc.d, bs = B.ensure(d), cur = bs.cur, sa = bs.showAll, out = [], th = 2.5 * ((d.dim && d.dim.sc) || scaleOf(d));
    var seg = function (sg, lay, lt) { var o = sg.k === "L" ? { t: "line", a: [sg.a[0], sg.a[1]], b: [sg.b[0], sg.b[1]] } : sg.full ? { t: "circle", c: [sg.c[0], sg.c[1]], r: sg.r } : { t: "arc", c: [sg.c[0], sg.c[1]], r: sg.r, a1: sg.s * 180 / Math.PI, a2: sg.e * 180 / Math.PI }; o.layer = lay; if (lt) o.lt = lt; out.push(o); };
    bs.cur = lv; bs.showAll = false; B._mepViewOv = v;
    try {
      d.ents.forEach(function (e) {
        if (!B.TYPES[e.t] || e.t === "land" || e.t === "model3d" || !doc.visible(e)) return; var pl; try { pl = B.plan(doc, e); } catch (er) { return; } if (!pl) return;
        var lay = e.layer || "0"; (pl.segs || []).forEach(function (sg) { seg(sg, lay); }); (pl.dashed || []).forEach(function (sg) { seg(sg, lay, "DASHED"); });
        if (B.EXT[e.t] && e.t !== "room") { (pl.fill || []).forEach(function (f) { if (f.pts && f.pts.length > 2 && B.area(f.pts) < 4e5) out.push({ t: "hatch", pat: "SOLID", sc: 1, ang: 0, loops: [f.pts.map(function (p) { return [p[0], p[1], 0]; })], layer: lay }); });
          if (B.EXT[e.t].labels) { var ls; try { ls = B.EXT[e.t].labels(doc, e, th) || []; } catch (er) { ls = []; } ls.forEach(function (l) { if (l && l.s) out.push({ t: "text", p: [l.p[0], l.p[1]], s: String(l.s), h: l.h || th, rot: l.rot || 0, al: l.al || "l", layer: lay }); }); } }
        if (e.t === "room" && e.name && e.pts) { var c = B.polyBox(e.pts); out.push({ t: "text", p: [(c[0] + c[2]) / 2, (c[1] + c[3]) / 2], s: String(e.name).toUpperCase(), h: th, rot: 0, al: "c", layer: "A-ELEV-TXT" }); }
      });
    } finally { bs.cur = cur; bs.showAll = sa; B._mepViewOv = null; }
    return out;
  }
  function putBlock(ed, name, base, ents) { var Bl = Object.assign({}, ed.doc.d.blocks); Bl[name] = { base: base, ents: ents }; ed.doc.set("blocks", Bl); }
  B.refreshMepSheets = function (ed) { var n = 0, d = ed.doc.d;
    d.ents.forEach(function (e) { if (e.t !== "insert" || !e.mepv) return; var box = lvlBox(ed.doc, e.meplvl) || e.det; if (!box) return; putBlock(ed, e.block, [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2], snap(ed, e.meplvl, e.mepv)); n++; });
    return n; };
  var rd0 = B.refreshDetails; B.refreshDetails = function (ed) { var n = rd0 ? rd0.apply(this, arguments) : 0; return n + B.refreshMepSheets(ed); };
  var PAPERS = ["A3", "A2", "A1", "A0"];
  function makeSheets(ed) {
    var doc = ed.doc, d = doc.d, N = scaleOf(d), made = [];
    B.mepEnsureLayers(ed); B.mepEnsurePLayers(ed);
    var Ls = d.layers; if (!Ls["A-ELEV-TXT"] || !Ls["A-SCHED"] || !Ls["A-SHEET"]) { var Lc = CAD.clone(Ls); if (!Lc["A-ELEV-TXT"]) Lc["A-ELEV-TXT"] = { color: 7, lw: 0.25, lt: "CONTINUOUS", on: true, lock: false, frz: false }; if (!Lc["A-SCHED"]) Lc["A-SCHED"] = { color: 7, lw: 0.18, lt: "CONTINUOUS", on: true, lock: false, frz: false }; if (!Lc["A-SHEET"]) Lc["A-SHEET"] = { color: 8, lw: 0.25, lt: "CONTINUOUS", on: true, lock: false, frz: false }; doc.set("layers", Lc); }
    var oldPos = {}; d.ents.filter(function (e) { return e.mepsh; }).forEach(function (e) { if (e.t === "insert" && e.mepv) oldPos[e.block] = 1; doc.del(e.id); });
    var keepLay = (d.layouts || []).filter(function (l) { return !l.mep; }); doc.set("layouts", keepLay);
    var sch = {}, mk = function (k) { if (sch[k] === undefined) { try { sch[k] = B.makeSchedule(ed, k, N) || null; } catch (er) { sch[k] = null; } } return sch[k]; };
    var all = B.planBox(ed) || [0, 0, 0, 0], x = all[2] + 30 * N, yTop = all[3], used = keepLay.map(function (l) { return l.id; }), kn = 2, en = 0, pn = 0;
    lvls(d).forEach(function (lvObj) {
      var lv = lvObj.id;
      [["E", hasE(d, lv), "ELECTRICAL LAYOUT", ["Electrical", "Single line"]], ["P", hasP(d, lv), "PLUMBING LAYOUT", ["Plumbing", "Isometric"]]].forEach(function (S) {
        if (!S[1]) return; var box = lvlBox(doc, lv); if (!box) return;
        var W = box[2] - box[0], H = box[3] - box[1], legK = S[3].filter(function (k) { return mk(k); }), legs = legK.map(mk), lw = legs.reduce(function (a, T) { return a + (T.bb[2] - T.bb[0]) + 10 * N; }, 0), lh = legs.reduce(function (a, T) { return Math.max(a, T.bb[3] - T.bb[1]); }, 0);
        var needW = Math.max(W, lw) + 16 * N, needH = H + lh + 40 * N, paper = PAPERS.filter(function (p) { var pp = CAD.PAPER[p]; return (pp[0] - 20) * N >= needW && (pp[1] - 48) * N >= needH; })[0] || "A0", pp = CAD.PAPER[paper], fw = (pp[0] - 20) * N, fh = (pp[1] - 48) * N;
        /* a small building is drawn larger (1:50 instead of 1:100) where the sheet has room */
        var k = Math.max(1, Math.min(2, Math.floor(Math.min((fw - 16 * N) / W, (fh - lh - 40 * N) / H) * 2) / 2)); W *= k; H *= k;
        var rect = [x, yTop - fh, x + fw, yTop], cx = x + fw / 2, cy = yTop - 8 * N - H / 2, name = "MEP-" + S[0] + "-" + (lv || "L");
        putBlock(ed, name, [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2], snap(ed, lv, S[0]));
        doc.add({ t: "insert", block: name, p: [cx, cy], sx: k, sy: k, rot: 0, layer: "A-ELEV", det: box, mepv: S[0], meplvl: lv, mepsh: 1 });
        var title = S[2] + " — " + String(lvObj.name || lv).toUpperCase();
        doc.add({ t: "text", p: [cx, cy - H / 2 - 6 * N], s: title, h: 4 * N, rot: 0, al: "c", layer: "A-ELEV-TXT", st: "b", mepsh: 1 });
        doc.add({ t: "text", p: [cx, cy - H / 2 - 11 * N], s: "Scale 1 : " + Math.round(N / k), h: 2.5 * N, rot: 0, al: "c", layer: "A-ELEV-TXT", mepsh: 1 });
        var lx = x + 8 * N, ly = cy - H / 2 - 20 * N; legs.forEach(function (T, i) { doc.add({ t: "insert", block: "SCH-" + legK[i], p: [lx - T.bb[0], ly - T.bb[3]], sx: 1, sy: 1, rot: 0, layer: "A-SCHED", mepsh: 1 }); lx += (T.bb[2] - T.bb[0]) + 10 * N; });
        while (used.indexOf("S" + kn) >= 0) kn++; var id = "S" + kn; used.push(id); var num = S[0] === "E" ? "E-" + String(++en).padStart(2, "0") : "P-" + String(++pn).padStart(2, "0");
        doc.add({ t: "pline", pts: [[rect[0], rect[1], 0], [rect[2], rect[1], 0], [rect[2], rect[3], 0], [rect[0], rect[3], 0]], closed: true, layer: "A-SHEET", sheet: id, mepsh: 1 });
        doc.add({ t: "text", sheet: id, p: [rect[0], rect[1] - 6 * N], s: "Sheet " + num + " - " + title + " · " + paper + " landscape · 1 : " + N, h: 3 * N, rot: 0, al: "l", layer: "A-SHEET", mepsh: 1 });
        doc.set("layouts", (doc.d.layouts || []).concat([{ id: id, paper: paper, scale: N, land: true, rect: rect, title: title.replace(" — ", " - "), number: num, mep: 1 }]));
        made.push(num + " " + title.toLowerCase() + " (" + paper + ")"); x += fw + 15 * N;
      });
    });
    void oldPos; return made;
  }
  B.mepSheets = makeSheets;
  cmd("MEPSHEETS", ["MEPSHEET", "ELECSHEET", "PLUMBSHEET"], async function (ed) {
    var d = ed.doc.d; if (!lvls(d).some(function (l) { return hasE(d, l.id) || hasP(d, l.id); })) { ed.say("No electrical points or plumbing yet. Run MEPAUTO (or POINTSAUTO, WIREAUTO and PLUMBAUTO) first."); return; }
    var m; ed.doc.begin("MEP sheets"); try { m = makeSheets(ed); } finally { ed.doc.commit(); }
    if (ed.zoomExtents) ed.zoomExtents();
    ed.say(m.length + " sheet" + (m.length === 1 ? "" : "s") + " made beside the drawing: " + m.join("; ") + ". Each shows only its service, with its legend. They follow every change (Update views, and before printing). Print: File ▾ → Plot PDF sheet → pick the sheet.");
  });

  /* ---------- MEPAUTO: the whole building ---------- */
  cmd("MEPAUTO", ["AUTOMEP", "SERVICESAUTO", "MEPALL"], async function (ed) {
    var doc = ed.doc, d = doc.d, ls = lvls(d).filter(function (l) { return d.ents.some(function (r) { return r.t === "room" && r.pts && same(r.lvl, l.id); }); });
    if (!ls.length) { ed.say("No rooms yet. Make the rooms (Building → Room, or Fit rooms to walls) and name them — toilet, bath, kitchen, bed room … — then run MEPAUTO again."); return; }
    var m0 = d.mep || {}, grp = await ed.getKw("Building group for CPWD point wiring: A (Type I–III quarters / small house), B (Type IV and above), C (non-residential)", ["A", "B", "C"], m0.grp || "A");
    var pers = +(await ed.getNum("Persons who will live / work here (for the water tank and septic tank)", { def: +m0.pers || 5 })); if (!(pers > 0)) pers = 5;
    var what = await ed.getKw("Do: All (electrical + plumbing + sheets), Electrical only, Plumbing only", ["All", "Electrical", "Plumbing"], "All");
    doc.set("mep", Object.assign({}, B.mepDEF, m0, { on: true, grp: grp, pers: Math.round(pers) })); B.mepEnsureLayers(ed);
    var rep = [], np = 0, nw = 0, nck = 0, nsb = 0;
    if (what !== "Plumbing") {
      for (var i = 0; i < ls.length; i++) { var r1 = await CAD.commands.POINTSAUTO.fn(ed, { auto: true, lvl: ls[i].id }); np += (r1 && r1.n) || 0; var r2 = await CAD.commands.WIREAUTO.fn(ed, { auto: true, lvl: ls[i].id }); if (r2) { nw += r2.pts; nck += r2.ckt + r2.pwr; nsb += r2.noSb; } }
      var no; doc.begin("Meter board and earthing"); try { no = elecOutside(doc, function (o) { return doc.add(o); }); } finally { doc.commit(); }
      rep.push("Electrical: " + (np ? np + " points / boards placed, " : "") + nw + " points wired in " + nck + " circuits" + (no ? ", meter board and earth pits outside" : "") + (nsb ? " (" + nsb + " points without a switch board — check)" : ""));
    }
    if (what !== "Electrical") { var t = await plumbAll(ed); rep.push(t.rooms ? "Plumbing: " + t.rooms + " wet rooms, " + t.runs + " pipe runs, stacks, risers and the house drain with manholes" : "Plumbing: no WC / basin / sink placed yet — place them in the toilets and kitchen and run PLUMBAUTO"); }
    if (what === "All") { var m; doc.begin("MEP sheets"); try { m = makeSheets(ed); } finally { doc.commit(); } rep.push(m.length + " sheets: " + m.join("; ")); }
    if (ed.zoomExtents) ed.zoomExtents(); ed.dirty = true;
    ed.say(rep.join(". ") + ". All quantities are in the estimate (Quantities). Water and septic tank sizes for " + Math.round(pers) + " persons: SCHEDULE → Plumbing.");
  });

  /* ---------- SCHEDULE → Plumbing: + water supply and sanitation design ---------- */
  var SEPTIC = [[5, 1.5, 0.75, 1.0], [10, 2.0, 0.9, 1.0], [15, 2.0, 0.9, 1.3], [20, 2.3, 1.1, 1.3], [50, 5.0, 1.6, 1.3], [100, 7.5, 2.0, 1.4], [150, 10.0, 2.4, 1.4], [200, 12.0, 2.75, 1.4], [300, 15.0, 3.5, 1.4]];
  B.plumbDesign = function (d) {
    var m = d.mep || {}, P = Math.max(1, +m.pers || 5), wc = 0, fu = 0, fx = 0; d.ents.forEach(function (e) { var c = pcls(e); if (!c || c === "STACK" || c === "RISER") return; fx++; fu += dfu(e); if (c === "WC") wc++; });
    var lpcd = +m.lpcd || 135, dem = P * lpcd, oht = Math.ceil(dem / 500) * 500, sump = Math.ceil(dem * 1.0 / 500) * 500, st = SEPTIC.filter(function (r) { return r[0] >= P; })[0] || SEPTIC[SEPTIC.length - 1];
    var drn = fu <= 20 ? 100 : fu <= 180 ? 100 : 150;
    return { P: P, lpcd: lpcd, dem: dem, oht: oht, sump: sump, sep: st, fu: fu, wc: wc, fx: fx, drain: drn };
  };
  var ps0 = B.SCH_EXTRA.Plumbing;
  B.SCH_EXTRA.Plumbing = function (ed, N, table) {
    var T = ps0.apply(this, arguments); if (!T) return T; var D = B.plumbDesign(ed.doc.d);
    var rows = [["Persons", D.P + " (change in MEPAUTO)"], ["Water demand", D.P + " × " + D.lpcd + " L/day = " + D.dem + " L/day (NBC 2016 Part 9)"], ["Overhead tank", D.oht + " L (one day's demand)"], ["Underground sump", D.sump + " L (one day, if the supply is intermittent)"],
      ["Septic tank (IS 2470)", "for up to " + D.sep[0] + " users: " + D.sep[1].toFixed(2) + " × " + D.sep[2].toFixed(2) + " m, liquid depth " + D.sep[3].toFixed(2) + " m + 0.30 free board, cleaned yearly"],
      ["Fixtures", D.fx + " fittings, " + D.wc + " WC, " + D.fu + " drainage fixture units"], ["Pipe sizes", "soil stack 110, waste 75, house drain S.W. " + D.drain + " mm at 1:60, riser CPVC 25, branches 15–20"]];
    var T2 = table("WATER SUPPLY AND SANITATION DESIGN", ["Item", "Value"], rows, [40, 110], N), dy = T.bb[1] - 16 * N;
    T2.ents.forEach(function (en) { var o = JSON.parse(JSON.stringify(en)); ["a", "b", "p", "c"].forEach(function (f) { if (o[f]) o[f] = [o[f][0], o[f][1] + dy]; }); T.ents.push(o); });
    T.bb = [T.bb[0], T2.bb[1] + dy, Math.max(T.bb[2], T2.bb[2]), T.bb[3]]; return T;
  };

  /* =====================================================================================================================
     Part 5: what comes with the building services — overhead tank on the roof with its feed to the risers, septic tank and soak
     pit sized for the persons (measured as excavation, PCC, brick work, plaster, RCC cover), rain-water pipes from the roof,
     main and sub-main cables between the meter board and the DBs, and the earth connections.
     ===================================================================================================================== */
  function cpk(c) { var k = "cp_" + c.replace(/\./g, "_"); if (!B.MAP[k]) B.MAP[k] = { c: [["cpwd23", c]], books: ["cpwd23"] }; return k; }
  function emk(c) { var k = "em_" + c.replace(/\./g, "_"); if (!B.MAP[k]) B.MAP[k] = { c: [["em22", c]], books: ["em22"] }; return k; }
  function f2(v) { return (v / 1000).toFixed(2); }
  var aq1 = X0.qty;
  X0.qty = function (doc, e) {
    var d = doc.d, k = e.kind || "", z = e.lvl ? B.below(d, e.lvl) : "super", R = function (code, dim, v, label, f) { return { k: cpk(code), dim: dim, v: v, label: label, f: f, z: z }; };
    if (k === "septic_tank" && (e.sep || e.mauto)) {
      var D0 = B.plumbDesign(d), sp = e.sep || [D0.sep[1], D0.sep[2], D0.sep[3]], Li = sp[0] * 1000, Bi = sp[1] * 1000, Dl = sp[2] * 1000, H = Dl + 300, t = 230, Lo = Li + 2 * t, Bo = Bi + 2 * t, ex = 300;
      var exc = (Lo + 2 * ex) * (Bo + 2 * ex) * (H + 150 + 100), outer = Lo * Bo * (H + 150 + 100);
      return [R("2.8.1", "V", exc, "Septic tank — excavation", f2(Lo + 2 * ex) + " × " + f2(Bo + 2 * ex) + " × " + f2(H + 250)),
        R("4.1.8", "V", (Lo + 300) * (Bo + 300) * 150, "Septic tank — PCC 1:4:8 bed 150 mm", f2(Lo + 300) + " × " + f2(Bo + 300) + " × 0.15"),
        R("6.1.1", "V", (2 * (Li + Bi + 2 * t)) * t * H + Bi * t * Dl * 0.9, "Septic tank — brick work in CM 1:4 (walls + baffle wall)", "2 × (" + f2(Li) + " + " + f2(Bi) + " + 0.46) × 0.23 × " + f2(H) + " + baffle"),
        R("13.4.1", "A", 2 * (Li + Bi) * H + Li * Bi + 2 * Bi * Dl, "Septic tank — 12 mm plaster 1:4 inside (with water-proofing compound)", "walls, floor, both faces of the baffle"),
        R("5.1.2", "V", Lo * Bo * 100, "Septic tank — RCC cover slab 100 mm with manhole covers", f2(Lo) + " × " + f2(Bo) + " × 0.10"),
        R("5.9.3", "A", Li * Bi, "Septic tank — shuttering under the cover slab", f2(Li) + " × " + f2(Bi)),
        R("5.22A.6", "N", Math.round(Lo * Bo * 100 / 1e9 * 80), "Septic tank — steel in the cover slab (≈ 80 kg/cum)", "≈ 80 kg/cum"),
        R("2.25", "V", Math.max(0, exc - outer), "Septic tank — filling the excavated earth round it", "excavation − tank")];
    }
    if (k === "soak_pit" && (e.mauto || e.pauto)) { var big = (B.plumbDesign(d).P > 10); return [R(big ? "19.32.1" : "19.33", "N", 1, big ? "Soak pit 2.5 m dia × 3.0 m deep with honeycomb shaft" : "Soak pit 1.2 × 1.2 × 1.2 m filled with brick bats", "1 no.")]; }
    if (k === "rwp_110" && e.rwp) { var g = B.level(d, groundId(d)), Lr = roofTop(d) - (g ? g.elev : 0) + 450;
      return [{ k: "pipe_rain_110", dim: "L", v: Lr, label: "uPVC rain-water pipe 110 mm from the roof to the ground (vertical)", f: f2(Lr) + " m", z: z },
        R("12.42.6.2", "N", 1, "uPVC shoe 110 mm at the foot of the rain-water pipe", "1 no."), R("12.46", "N", 1, "Grating at the roof inlet of the rain-water pipe", "1 no."),
        R("12.43.2", "N", Math.ceil(Lr / 1800), "uPVC pipe clips 110 mm (one per 1.8 m)", Math.ceil(Lr / 1800) + " nos")]; }
    var rows = aq1.apply(this, arguments), c = B.eclass(e);
    if (c === "MB" || c === "DB" || c === "E") rows = rows.concat(cables(doc, e, c, z));
    return rows;
  };
  function mainDB(d) { var g = groundId(d), dbs = d.ents.filter(function (e) { return B.eclass(e) === "DB"; }); return dbs.filter(function (e) { return same(e.lvl, g); })[0] || dbs[0] || null; }
  function dbLoad(doc, db) { try { return (B.mepCircuits(doc, db) || []).reduce(function (a, c) { return a + c.w; }, 0); } catch (er) { return 0; } }
  function cableFor(w) { var I = w * 0.75 / (230 * 0.9); return I <= 32 ? ["1.14.4", "2 × 6 + 1 × 6"] : I <= 40 ? ["1.14.5", "2 × 10 + 1 × 6"] : ["1.14.6", "2 × 16 + 1 × 6"]; }
  function vgap(d, a, b) { var la = B.level(d, a.lvl), lb = B.level(d, b.lvl); return Math.abs((la ? la.elev : 0) - (lb ? lb.elev : 0)); }
  function cables(doc, e, c, z) {
    var d = doc.d, M = mainDB(d); if (!B.mepOf(d) || !M) return [];
    var run = function (a, b) { return Math.abs(a.p[0] - b.p[0]) + Math.abs(a.p[1] - b.p[1]) + vgap(d, a, b) + 3000; };
    if (c === "MB") { var all = d.ents.filter(function (x) { return B.eclass(x) === "DB"; }).reduce(function (a, x) { return a + dbLoad(doc, x); }, 0), cb = cableFor(all), L1 = run(e, M);
      return [{ k: emk(cb[0]), dim: "L", v: L1, label: "Main cable " + cb[1] + " sq mm, meter board → main DB", f: f2(L1) + " m (incl. 3 m drops)", z: z }]; }
    if (c === "DB" && e !== M) { var cb2 = cableFor(dbLoad(doc, e)), L2 = run(M, e);
      return [{ k: emk(cb2[0]), dim: "L", v: L2, label: "Sub-main " + cb2[1] + " sq mm, main DB → " + (e.name || "DB") + " (" + (B.level(d, e.lvl) || {}).name + ")", f: f2(L2) + " m (incl. rise and drops)", z: z }]; }
    if (c === "E") { var to = d.ents.filter(function (x) { return B.eclass(x) === "MB"; })[0] || M, L3 = Math.abs(e.p[0] - to.p[0]) + Math.abs(e.p[1] - to.p[1]) + 2000;
      return [{ k: emk("5.12"), dim: "L", v: L3, label: "Earth connection, 6 SWG G.I. wire in 15 mm G.I. pipe, earth pit → " + (to === M ? "main DB" : "meter board"), f: f2(L3) + " m", z: z }]; }
    return [];
  }
  /* placed by PLUMBAUTO after the floors: tank on the roof, septic tank + soak pit, rain-water pipes */
  function services(doc, add, risers) {
    var d = doc.d, ls = lvls(d), top = ls[ls.length - 1], g = groundId(d), Bb = bldBox(d, g), D = B.plumbDesign(d), out = { tank: 0, sep: 0, rwp: 0 }; if (!Bb) return out;
    var mk = function (o) { return add(Object.assign({ t: "asset", rot: 0, sc: 1, layer: "P-FIX", mauto: 1 }, o)); };
    /* overhead tank and its feed */
    if (top && risers.length && !d.ents.some(function (e) { return e.kind === "tank" || /^tank_/.test(e.kind || ""); })) {
      var cx = risers.reduce(function (a, p) { return a + p[0]; }, 0) / risers.length, cy = risers.reduce(function (a, p) { return a + p[1]; }, 0) / risers.length, tp = [Math.round(cx), Math.round(Math.min(Bb[3] - 900, Math.max(Bb[1] + 900, cy)))];
      mk({ kind: "tank", p: tp, lvl: top.id, cap: D.oht, name: "OHT " + D.oht + " L" }); out.tank = 1;
      var uq = []; risers.forEach(function (p) { if (!uq.some(function (q) { return G.dist(p, q) < 600; })) uq.push(p); });
      uq.forEach(function (p) { var pts = lpath(tp, p); add({ t: "run", kind: B.mepKindFor("cw", 32), pts: pts.map(function (q) { return [Math.round(q[0]), Math.round(q[1])]; }), side: 1, z: SVC.cw.z, lvl: top.id, svc: "cw", dia: 32, layer: "P-CW", mauto: 1 }); });
    }
    /* septic tank and soak pit in front of the building */
    if (!d.ents.some(function (e) { return /^(septic|manhole)/.test(e.kind || "") && same(e.lvl, g); })) {
      var sx = (Bb[0] + Bb[2]) / 2, syy = Bb[1] - 1000 - 2500;
      mk({ kind: "septic_tank", p: [Math.round(sx), Math.round(syy)], lvl: g, sep: [D.sep[1], D.sep[2], D.sep[3]], name: "Septic tank " + D.sep[0] + " users" });
      var sk = mk({ kind: "soak_pit", p: [Math.round(sx + 4500), Math.round(syy)], lvl: g, name: "Soak pit" }); out.sep = 1;
      add({ t: "run", kind: B.mepKindFor("drain", 100), pts: [[Math.round(sx + 1300), Math.round(syy)], [Math.round(sx + 3700), Math.round(syy)]], side: 1, z: SVC.drain.z, lvl: g, svc: "drain", dia: 100, slope: 60, layer: "P-DRAIN", mauto: 1 }); void sk;
    }
    /* rain-water pipes: one 110 mm pipe for about 40 m² of roof, at the corners first */
    if (!d.ents.some(function (e) { return e.kind === "rwp_110"; })) {
      var area = (Bb[2] - Bb[0] + 900) * (Bb[3] - Bb[1] + 900) / 1e6, n = Math.max(2, Math.ceil(area / 40)), o = 150;
      var cs = [[Bb[0] - o, Bb[1] - o], [Bb[2] + o, Bb[3] + o], [Bb[2] + o, Bb[1] - o], [Bb[0] - o, Bb[3] + o]], pts = cs.slice(0, Math.min(4, n));
      var long = (Bb[2] - Bb[0]) >= (Bb[3] - Bb[1]), extra = n - pts.length;
      for (var i = 0; i < extra; i++) { var f = (Math.floor(i / 2) + 1) / (Math.ceil(extra / 2) + 1), side = i % 2; pts.push(long ? [Bb[0] + (Bb[2] - Bb[0]) * f, side ? Bb[3] + o : Bb[1] - o] : [side ? Bb[2] + o : Bb[0] - o, Bb[1] + (Bb[3] - Bb[1]) * f]); }
      pts.forEach(function (p) { mk({ kind: "rwp_110", p: [Math.round(p[0]), Math.round(p[1])], lvl: g, rwp: true, name: "RWP" }); }); out.rwp = pts.length;
    }
    return out;
  }
  B.mepServices = services;

  /* ---------- ribbon ---------- */
  if (CAD.RSEC && CAD.RSEC["Site & services"]) { var sec = CAD.RSEC["Site & services"];
    var addTo = function (name, list) { var g = sec.filter(function (s) { return s[0] === name; })[0]; if (g) list.forEach(function (c) { if (g[1].indexOf(c) < 0) g[1].unshift(c); }); else sec.push([name, list]); };
    addTo("Plumbing", ["PLUMBAUTO"]); addTo("MEP drawings", ["MEPSHEETS", "MEPAUTO"]); }
  if (CAD.RLABEL) Object.assign(CAD.RLABEL, { PLUMBAUTO: "Auto plumbing", MEPAUTO: "Auto MEP (all)", MEPSHEETS: "E / P sheets" });
  if (CAD.ICONS) Object.assign(CAD.ICONS, { PLUMBAUTO: "M5 4v6h6v10M11 10h8M19 10v4M5 4h3M8 20h6", MEPAUTO: "M13 3 6 13h5l-1 8 7-10h-5zM3 19h4M17 5h4", MEPSHEETS: "M4 4h7v16H4zM13 4h7v16h-7zM6 8h3M15 8h3" });
})();
