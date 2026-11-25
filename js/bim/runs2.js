/* Estimate Pro BIM — more for line runs (mouldings, bands, LED lines):
   - grooves in the plaster of a wall face: V-groove, U-groove (shadow line), a band of three grooves — measured as running metres;
   - RUNWALL: a run along the whole face of a wall, or round all the walls of a room, with one click (on the side clicked / inside the room);
   - RUNPROFILE: your own moulding profile — draw its section as a closed polyline (across = how far it stands out of the wall, up = height),
     pick it, name it, and it joins the list of runs (kept in the drawing, so it is there next time the drawing is opened). */
(function () {
  "use strict";
  var EP = window.EP, CAD = EP.cad, G = EP.geom, B = EP.bim; if (!B || !CAD || !B.RUNS || !B.EXT || !B.EXT.run) return;
  var RUNS = B.RUNS, cmd = function (n, a, f) { CAD.commands[n] = { fn: f }; (a || []).forEach(function (x) { CAD.aliases[x] = n; }); };
  if (!B.LOOKS.groove_dark) B.LOOKS.groove_dark = { n: "Groove (shadow)", c: "#3b3b3b", p: B.PT.plain, g: 0 };
  RUNS.groove_v = { n: "Groove in plaster — V 10 mm", fam: "p", z: 1200, look: "groove_dark", key: "run_groove", pr: [[0, 1.5, 0, 10, "groove_dark"]] };
  RUNS.groove_u = { n: "Groove in plaster — U 20 mm (shadow line)", fam: "p", z: 1200, look: "groove_dark", key: "run_groove", pr: [[0, 1.5, 0, 20, "groove_dark"]] };
  RUNS.groove_band = { n: "Grooves in plaster — band of 3 at 300 mm", fam: "p", z: 900, look: "groove_dark", key: "run_groove", mult: 3, pr: [[0, 1.5, 0, 12, "groove_dark"], [0, 1.5, 300, 312, "groove_dark"], [0, 1.5, 600, 612, "groove_dark"]] };
  B.MAP.run_groove = B.MAP.run_groove || { q: /groove/i };
  if (B.NSMAP) B.NSMAP.run_groove = B.NSMAP.run_groove || /groove/i;

  /* own profiles live in the drawing: bim.runProf = { id: { n, pr, z } } — registered whenever a drawing uses them */
  function ensureProf(d) { var P = d && d.bim && d.bim.runProf; if (!P) return; Object.keys(P).forEach(function (id) { if (!RUNS[id]) RUNS[id] = { n: P[id].n, fam: "p", z: +P[id].z || 2700, look: "plaster_pop_white", key: "run_band", pr: P[id].pr, own: 1 }; }); }
  ["plan", "mesh", "qty", "labels"].forEach(function (f) { var f0 = B.EXT.run[f]; if (!f0) return; B.EXT.run[f] = function () { var doc = f === "mesh" ? arguments[1] : arguments[0]; try { ensureProf(doc && doc.d); } catch (e) {} return f0.apply(this, arguments); }; });
  /* the groove band counts three grooves */
  var q0 = B.EXT.run.qty; B.EXT.run.qty = function (doc, e) { var r = q0.apply(this, arguments) || []; var D = RUNS[e.kind]; if (D && D.mult) r.forEach(function (x) { if (x.k === D.key && x.dim === "L") { x.v *= D.mult; x.f = (x.f || "") + " × " + D.mult + " grooves"; } }); return r; };

  function pickKind(ed, def) { var names = Object.keys(RUNS).filter(function (k) { return RUNS[k].fam === "p" && !RUNS[k].grp; }); return ed.getKw("Which run? (" + names.length + ": type a few letters of the name)", names.map(function (k) { return k; }), def && RUNS[def] ? def : names[0]); }
  cmd("RUNWALL", ["RUNFACE", "RUNROOM", "MOULDWALL"], async function (ed) {
    var doc = ed.doc, d = doc.d, lv = B.ensure(d).cur; ensureProf(d);
    var kind = await pickKind(ed, ed.runKind); if (!kind || !RUNS[kind]) return; ed.runKind = kind;
    var how = await ed.getKw("Along one wall face, or round a whole room?", ["Wall", "Room"], "Room");
    if (how === "Room") {
      var p = await ed.getPoint("Click inside the room"); if (!p || !p.length) return;
      var rm = d.ents.filter(function (r) { return r.t === "room" && r.pts && (r.lvl || null) === (lv || null) && G.inPoly(p, r.pts); })[0]; if (!rm) { ed.say("No room there."); return; }
      var ar = 0; for (var i = 0; i < rm.pts.length; i++) { var a = rm.pts[i], b = rm.pts[(i + 1) % rm.pts.length]; ar += a[0] * b[1] - b[0] * a[1]; }
      /* a run low enough to meet the doors stops at each side of every door on the room's walls */
      var pieces = [rm.pts.map(function (q) { return [q[0], q[1]]; })], closedR = true;
      if ((+RUNS[kind].z || 0) < 2200) { var cuts = []; d.ents.forEach(function (dr) { if (!(dr.t === "door" || dr.t === "opening") || (dr.lvl || null) !== (lv || null) && dr.lvl != null) return; var pd; try { pd = B.place(doc, dr); } catch (er) { pd = null; } if (!pd || !pd.p) return; var hw = (+dr.w || 900) / 2 + 60;
          for (var i2 = 0; i2 < rm.pts.length; i2++) { var A0 = rm.pts[i2], B0 = rm.pts[(i2 + 1) % rm.pts.length], l0 = G.dist(A0, B0); if (l0 < 1) continue; var u0 = [(B0[0] - A0[0]) / l0, (B0[1] - A0[1]) / l0], t0 = (pd.p[0] - A0[0]) * u0[0] + (pd.p[1] - A0[1]) * u0[1], dd = Math.abs((pd.p[0] - A0[0]) * u0[1] - (pd.p[1] - A0[1]) * u0[0]); if (t0 > -hw && t0 < l0 + hw && dd < 400) cuts.push([i2, Math.max(0, t0 - hw), Math.min(l0, t0 + hw)]); } });
        if (cuts.length) { closedR = false; pieces = []; var curP = null, Np = rm.pts.length, startE = cuts[0][0];
          for (var k2 = 0; k2 <= Np; k2++) { var ie = (startE + k2) % Np, A1 = rm.pts[ie], B1 = rm.pts[(ie + 1) % Np], l1 = G.dist(A1, B1), u1 = [(B1[0] - A1[0]) / (l1 || 1), (B1[1] - A1[1]) / (l1 || 1)], at = function (t) { return [A1[0] + u1[0] * t, A1[1] + u1[1] * t]; };
            var cs = cuts.filter(function (c) { return c[0] === ie; }).sort(function (x, y) { return x[1] - y[1]; }), tpos = 0, last = k2 === Np;
            if (last) { var cs0 = cs.filter(function (c) { return true; }); if (!cs0.length) break; if (curP) { curP.push(at(cs0[0][1])); pieces.push(curP); curP = null; } break; }
            if (k2 === 0) { tpos = cs.length ? cs[cs.length - 1][2] : 0; curP = [at(tpos)]; cs = []; }
            cs.forEach(function (c) { if (c[1] > tpos + 1 && curP) { curP.push(at(c[1])); pieces.push(curP); } curP = null; tpos = c[2]; curP = [at(tpos)]; });
            if (curP) curP.push([B1[0], B1[1]]); }
          if (curP && curP.length > 1) pieces.push(curP);
          pieces = pieces.filter(function (pc) { return pc.length > 1 && B.runLen({ pts: pc }) > 100; }); } }
      doc.begin("Run round the room"); try { pieces.forEach(function (pc) { doc.add({ t: "run", kind: kind, pts: pc, closed: closedR, side: ar > 0 ? -1 : 1, lvl: lv }); }); } finally { doc.commit(); }
      ed.say(RUNS[kind].n + " round " + (rm.name || "the room") + " (" + (B.runLen({ pts: rm.pts, closed: true }) / 1000).toFixed(2) + " m round" + (closedR ? "" : ", stopped at " + (pieces.length) + " door gaps") + ")."); return;
    }
    var pw = await ed.getEnt("Pick the wall, on the side where the run goes"), w = pw && pw.e; if (!w || w.t !== "wall") { ed.say("That is not a wall."); return; }
    var at = pw.p || w.a, u = G.norm(G.sub(w.b, w.a)), n = [-u[1], u[0]], sd = ((at[0] - w.a[0]) * n[0] + (at[1] - w.a[1]) * n[1]) >= 0 ? 1 : -1, th = w.th || 230;
    var off = w.just === "l" ? (sd > 0 ? th : 0) : w.just === "r" ? (sd < 0 ? th : 0) : th / 2;
    var A = [w.a[0] + n[0] * sd * off, w.a[1] + n[1] * sd * off], Bq = [w.b[0] + n[0] * sd * off, w.b[1] + n[1] * sd * off];
    doc.begin("Run along the wall"); try { doc.add({ t: "run", kind: kind, pts: [A, Bq], side: sd > 0 ? -1 : 1, lvl: w.lvl || lv }); } finally { doc.commit(); }
    ed.say(RUNS[kind].n + " along the wall face (" + (G.dist(A, Bq) / 1000).toFixed(2) + " m). If it stands out into the wall, press Flip side in Properties.");
  });

  cmd("RUNPROFILE", ["MYPROFILE", "PROFILERUN", "OWNMOULDING"], async function (ed) {
    var doc = ed.doc, d = doc.d;
    ed.say("Draw the section of your moulding as a closed polyline anywhere (sideways = how far it stands out of the wall, upwards = its height; real size in mm), then pick it.");
    var pk = await ed.getEnt("Pick the closed polyline of the section"), pl = pk && pk.e; if (!pl || !(pl.t === "pline" || pl.t === "lwpolyline") || !pl.pts || pl.pts.length < 3) { ed.say("Pick a closed polyline."); return; }
    var P = pl.pts.map(function (q) { return [q[0], q[1]]; }), x0 = Math.min.apply(null, P.map(function (q) { return q[0]; })), y0 = Math.min.apply(null, P.map(function (q) { return q[1]; })), y1 = Math.max.apply(null, P.map(function (q) { return q[1]; })), H = y1 - y0;
    if (!(H > 3)) { ed.say("The section is too flat."); return; }
    var nb = Math.max(6, Math.min(40, Math.round(H / 6))), pr = [];
    for (var i = 0; i < nb; i++) { var za = H * i / nb, zb = H * (i + 1) / nb, ym = y0 + (za + zb) / 2, xs = [];
      for (var k = 0; k < P.length; k++) { var a = P[k], b = P[(k + 1) % P.length]; if ((a[1] <= ym && b[1] > ym) || (b[1] <= ym && a[1] > ym)) xs.push(a[0] + (b[0] - a[0]) * (ym - a[1]) / (b[1] - a[1])); }
      if (xs.length < 2) continue; xs.sort(function (p, q) { return p - q; }); var o0 = Math.max(0, xs[0] - x0), o1 = xs[xs.length - 1] - x0; if (o1 - o0 < 0.5) continue;
      var last = pr[pr.length - 1]; if (last && Math.abs(last[0] - o0) < 0.5 && Math.abs(last[1] - o1) < 0.5 && Math.abs(last[3] - za) < 0.01) last[3] = Math.round(zb * 10) / 10; else pr.push([Math.round(o0 * 10) / 10, Math.round(o1 * 10) / 10, Math.round(za * 10) / 10, Math.round(zb * 10) / 10]); }
    if (!pr.length) { ed.say("Could not read that section."); return; }
    var nm = await ed.getText("Name of this moulding", { def: "My moulding " + (Object.keys((d.bim && d.bim.runProf) || {}).length + 1) }); if (!nm) return;
    var zd = await ed.getNum("Height of its underside above the floor, mm", { def: 2700 });
    var id = "own_" + Date.now().toString(36), nb2 = CAD.clone(B.ensure(d)); nb2.runProf = Object.assign({}, nb2.runProf || {}); nb2.runProf[id] = { n: String(nm).slice(0, 60) + " (own profile " + Math.round(H) + " × " + Math.round(Math.max.apply(null, pr.map(function (r) { return r[1]; }))) + ")", pr: pr, z: +zd || 2700 };
    doc.begin("Own moulding profile"); try { doc.set("bim", nb2); } finally { doc.commit(); } ensureProf(doc.d); ed.runKind = id;
    ed.say("“" + nm + "” is added to the runs (" + pr.length + " steps). Draw it with RUN (Type → it) or RUNWALL; it is kept in this drawing.");
  });

  if (CAD.RLABEL) Object.assign(CAD.RLABEL, { RUNWALL: "Run on wall / room", RUNPROFILE: "Own profile" });
})();
