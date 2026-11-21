/* Estimate Pro BIM — commands: WALL, DOOR, WINDOW, OPENING, SLAB, COLUMN, BEAM, FOOTING, ROOF, STAIR, ROOM, RAILING, LEVEL (current level). */
(function () {
  "use strict";
  var EP = window.EP, G = EP.geom, CAD = EP.cad, B = EP.bim, UN = EP.units;
  var cmds = CAD.commands, A = CAD.aliases;
  function cmd(name, al, fn, o) { cmds[name] = Object.assign({ fn: fn }, o || {}); (al || []).forEach(function (a) { A[a] = name; }); }
  function bs(ed) { return B.ensure(ed.doc.d); }
  function cur(ed) { return bs(ed).cur; }
  function lay(ed, n) { if (!ed.doc.d.layers[n]) { var L = CAD.clone(ed.doc.d.layers); L[n] = { color: { "A-WALL": 7, "A-DOOR": 4, "A-WIN": 140, "S-COL": 1, "S-BEAM": 5, "S-SLAB": 8, "S-FOOT": 9, "A-ROOF": 30, "A-STAIR": 6, "A-ROOM": 3, "A-RAIL": 8 }[n] || 7, lw: 0.35, lt: "CONTINUOUS", on: true, frz: false, lock: false }; ed.doc.set("layers", L); } return n; }
  function ensureBim(ed) { if (!ed.doc.d.bim) ed.doc.set("bim", B.ensure(CAD.clone(ed.doc.d))); return bs(ed); }

  /* ---------- WALL: chain of walls like a polyline ---------- */
  cmd("WALL", ["WA", "W"], async function (ed) {
    var b = ensureBim(ed), th = ed.wTh || b.wallTh, mat = ed.wMat || b.wallMat, H = ed.wH || null, just = ed.wJust || "c", ext = false;
    var first = await ed.getPoint("Specify wall start point (" + Math.round(th) + " mm " + mat + ", centre line)", { kw: ["Thickness", "Height", "Material", "Justify"] });
    while (typeof first === "string") {
      if (first === "Thickness") th = ed.wTh = await ed.getDist("Wall thickness", { def: th });
      if (first === "Height") { var hh = await ed.getDist("Wall height (Enter = level height − slab)", { def: H || 0 }); H = ed.wH = hh > 0 ? hh : null; }
      if (first === "Material") mat = ed.wMat = (await ed.getKw("Material", ["brick", "block", "rcc", "stone"], mat)).toLowerCase();
      if (first === "Justify") just = ed.wJust = { Centre: "c", Left: "l", Right: "r" }[await ed.getKw("The picked line is the wall's", ["Centre", "Left", "Right"], "Centre")];
      first = await ed.getPoint("Specify wall start point (" + Math.round(th) + " mm " + mat + ")", { kw: ["Thickness", "Height", "Material", "Justify"] });
    }
    var prev = first, made = [], layer = lay(ed, "A-WALL");
    while (true) {
      ed.preview = function (w) { return [{ t: "wall", a: prev, b: w, th: th, h: H, mat: mat, just: just, lvl: cur(ed), layer: layer }]; };
      var p = await ed.getPoint("Specify next point", { opt: true, base: prev, kw: made.length >= 2 ? ["Close", "Undo"] : ["Undo"] });
      if (p == null) break;
      if (p === "Undo") { var u = made.pop(); if (u) { ed.doc.del(u.id); prev = u.a; } continue; }
      var end = p === "Close" ? first : p; if (G.dist(prev, end) < 1) continue;
      made.push(ed.doc.add({ t: "wall", a: prev, b: end, th: th, h: H, mat: mat, just: just, lvl: cur(ed), layer: layer, ext: false })); prev = end;
      if (p === "Close") break;
    }
    ed.preview = null;
    if (made.length >= 3 && G.dist(made[0].a, made[made.length - 1].b) < 1) made.forEach(function (w) { ed.doc.mod(w.id, Object.assign(CAD.clone(w), { ext: true })); });
  });
  /* ---------- CURVEDWALL: a round wall as a chain of short straight walls (so doors, finishes and quantities all work) ---------- */
  cmd("CURVEDWALL", ["CW", "ARCWALL", "ROUNDWALL"], async function (ed) {
    var b = ensureBim(ed), th = ed.wTh || b.wallTh, mat = ed.wMat || b.wallMat, H = ed.wH || null, layer = lay(ed, "A-WALL");
    var a = await ed.getPoint("Curved wall: start point (" + Math.round(th) + " mm " + mat + ")"), c = await ed.getPoint("End point of the curve", { base: a }); if (G.dist(a, c) < 50) return;
    var chain = function (m) { var k = G.circle3(a, m, c); if (!k || k.r > G.dist(a, c) * 50) return [a, c]; var t1 = Math.atan2(a[1] - k.c[1], a[0] - k.c[0]), t2 = Math.atan2(m[1] - k.c[1], m[0] - k.c[0]), t3 = Math.atan2(c[1] - k.c[1], c[0] - k.c[0]), nz = function (x) { x %= Math.PI * 2; return x < 0 ? x + Math.PI * 2 : x; }, ccw = nz(t2 - t1) < nz(t3 - t1), sw = ccw ? nz(t3 - t1) : -nz(t1 - t3), n = Math.max(4, Math.min(48, Math.ceil(Math.abs(sw) * k.r / 400))), P = [];
      for (var i = 0; i <= n; i++) { var t = t1 + sw * i / n; P.push([k.c[0] + k.r * Math.cos(t), k.c[1] + k.r * Math.sin(t)]); } P[0] = a; P[n] = c; return P; };
    ed.preview = function (w) { var P = chain(w), o = []; for (var i = 0; i + 1 < P.length; i++) o.push({ t: "wall", a: P[i], b: P[i + 1], th: th, h: H, mat: mat, just: "c", lvl: cur(ed), layer: layer }); return o; };
    var m = await ed.getPoint("A point on the curve (how far it bulges)"); ed.preview = null; var P = chain(m);
    for (var i = 0; i + 1 < P.length; i++) ed.doc.add({ t: "wall", a: P[i], b: P[i + 1], th: th, h: H, mat: mat, just: "c", lvl: cur(ed), layer: layer, ext: false, curve: 1 });
    ed.say("Curved wall made of " + (P.length - 1) + " short walls. Doors and windows go on any piece; for an outer wall set Exterior in Properties.");
  });
  /* ---------- hosted: DOOR / WINDOW / OPENING ---------- */
  async function hostedCmd(ed, t) {
    ensureBim(ed); var lib = t === "door" ? B.DOORS : B.WINDOWS, pre = (ed.preset && ed.preset[t]) || lib[t === "door" ? 1 : 0];
    if (t === "opening") pre = { id: "OP", w: 1000, h: 2100, sill: 0 };
    var o = { t: t, w: pre.w, h: pre.h, sill: pre.sill, preset: pre.id, mat: pre.mat, kind: pre.kind, style: pre.style, swing: "l", flip: false, mark: pre.id };
    while (true) {
      var pk = await ed.getEnt("Click on a wall to place " + (t === "door" ? "door " : t === "window" ? "window " : "opening ") + pre.id + " " + Math.round(o.w) + "×" + Math.round(o.h) + " (Enter to finish)", { allowNone: true, kw: t === "opening" ? ["Size"] : ["Type", "Size"], filter: function (e) { return e.t === "wall"; } });
      if (!pk) return;
      if (pk === "Type") { var ids = lib.map(function (x) { return x.id; }), k = await ed.getKw("Type (or pick one in the Library panel): " + ids.join(" "), ids, pre.id); pre = lib.filter(function (x) { return x.id === k; })[0] || pre; ed.preset = ed.preset || {}; ed.preset[t] = pre; Object.assign(o, { w: pre.w, h: pre.h, sill: pre.sill, preset: pre.id, mat: pre.mat, kind: pre.kind, style: pre.style, mark: pre.id }); continue; }
      if (pk === "Size") { o.w = await ed.getDist("Width", { def: o.w }); o.h = await ed.getDist("Height", { def: o.h }); if (t !== "door") o.sill = await ed.getDist("Sill height above floor", { def: o.sill || 0 }); o.preset = (t === "door" ? "D" : t === "window" ? "W" : "OP") + "-" + Math.round(o.w / 10) + Math.round(o.h / 100); continue; }
      var w = pk.e, c = B.wallLine(w);
      var place = function (pt) { var s = Math.max(o.w / 2, Math.min(c.L - o.w / 2, G.dot(G.sub(pt, c.a), c.u))), side = G.dot(G.sub(pt, c.a), c.n); return Object.assign({}, o, { host: w.id, at: s, flip: side < 0, swing: G.dot(G.sub(pt, c.a), c.u) > s ? "r" : "l" }); };
      var tmp = place(pk.p);
      ed.preview = function (pt) { var x = place(pt); x.id = "__prev"; return [x]; };
      var p2 = await ed.getPoint("Position along the wall (side = swing side)", { base: G.add(c.a, G.mul(c.u, tmp.at)), kw: ["Centre"] });
      ed.preview = null; var fin = p2 === "Centre" ? Object.assign(tmp, { at: c.L / 2 }) : place(p2);
      if (o.w > c.L) { ed.say("The opening is wider than the wall."); continue; }
      var clash = B.openings(ed.doc, w).some(function (x) { return fin.at - fin.w / 2 < x.s1 - 1 && fin.at + fin.w / 2 > x.s0 + 1; }); if (clash) { ed.say("It overlaps another opening in this wall."); continue; }
      fin.layer = lay(ed, t === "door" ? "A-DOOR" : "A-WIN"); ed.doc.add(fin);
    }
  }
  /* preview needs the hosted object drawn without an id in the document: give drawBim a temporary host lookup */
  cmd("DOOR", ["DO", "DR1"], function (ed) { return hostedCmd(ed, "door"); });
  cmd("WINDOW", ["WIN", "WI"], function (ed) { return hostedCmd(ed, "window"); });
  cmd("OPENING", ["OPEN"], function (ed) { return hostedCmd(ed, "opening"); });

  /* ---------- outline helpers: pick points, a closed polyline, or click inside an area ---------- */
  async function outline(ed, what, first) {
    var p = first != null ? first : await ed.getPoint("First corner of the " + what + " outline", { kw: ["Walls", "Inside", "Select"] });
    if (p === "Walls") { var wo = B.wallOutlines(ed.doc, cur(ed)); if (!wo.length) throw new Error("The walls of this level do not make a closed outline — draw the corners instead"); if (wo.length > 1) ed.say((wo.length) + " separate buildings found — the largest is used."); return wo[0].pts; }
    if (p === "Select") { var pk = await ed.getEnt("Select a closed polyline / rectangle", { filter: function (e) { return !!CAD.loopOf(e); } }); return G.loopPts(CAD.loopOf(pk.e)); }
    if (p === "Inside") { var q = await ed.getPoint("Click inside the area"); var bd = CAD.boundaryAt(ed.doc, q, ed.isolated, B.roomOpts(ed.doc)); if (!bd) throw new Error("No closed boundary found there"); return G.loopPts(bd.outer); }
    var pts = [p];
    while (true) { ed.preview = function (w) { return [{ t: "pline", pts: pts.concat([w]).map(function (x) { return [x[0], x[1], 0]; }), closed: true, _pc: "#2ec27e" }]; }; var n = await ed.getPoint("Next corner (Enter to close)", { opt: true, base: pts[pts.length - 1] }); if (n == null) break; pts.push(n); }
    ed.preview = null; if (pts.length < 3) throw new Error("At least 3 corners are needed"); return pts;
  }
  function ccw(P) { var a = 0; for (var i = 0; i < P.length; i++) { var p = P[i], q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1]; } return a >= 0 ? P : P.slice().reverse(); }
  cmd("SLAB", ["SLB"], async function (ed) {
    var b = ensureBim(ed), kind = ed.slK || "Ceiling", th = ed.slTh || b.slabTh, p;
    while (true) {
      p = await ed.getPoint("First corner of the " + kind.toLowerCase() + " slab (" + Math.round(th) + " mm) — or Walls (whole building) / Inside / Select", { kw: ["Walls", "Type", "Thickness", "Inside", "Select"] });
      if (p === "Type") { var k2 = await ed.getKw("Slab type", ["Ceiling", "Floor", "Chajja", "Landing"], kind); if (k2 === "Chajja" && kind !== "Chajja") th = 75; else if (kind === "Chajja" && k2 !== "Chajja") th = b.slabTh; kind = ed.slK = k2; continue; }
      if (p === "Thickness") { th = ed.slTh = await ed.getDist("Slab thickness", { def: th }); continue; }
      break;
    }
    var pts = ccw(await outline(ed, "slab", p)), here = B.level(ed.doc.d, cur(ed)), off = 0;
    if (kind === "Ceiling") off = here.h;   // ceiling / roof slab of this floor: stays on this level, top at the level above
    if (kind === "Chajja") off = await ed.getDist("Top of the chajja above this floor (lintel level)", { def: ed.slCh || 2400 }), ed.slCh = off;
    ed.doc.add({ t: "slab", pts: pts, th: th, lvl: here.id, off: off, kind: kind.toLowerCase(), layer: lay(ed, "S-SLAB") });
    ed.say(kind + " slab " + (B.area(pts) / 1e6).toFixed(2) + " m² × " + Math.round(th) + " mm" + (kind === "Ceiling" ? " (top at +" + (here.h / 1000).toFixed(2) + " m above this floor)" : ""));
  });
  cmd("COLUMN", ["COL"], async function (ed) {
    ensureBim(ed); var w = ed.cW || 300, d = ed.cD || 300, rot = 0, shape = ed.cShape || "rect", tw = ed.cTw || 230, rnd = function () { return shape === "circle" || shape === "octagon" || shape === "hexagon"; }, legs = function () { return shape === "L" || shape === "T" || shape === "plus"; };
    var colOf = function (p, r) { var o = { t: "column", p: p, w: w, d: rnd() ? w : d, rot: shape === "circle" ? 0 : r, shape: shape, lvl: cur(ed) }; if (legs()) o.tw = tw; return o; };
    while (true) {
      ed.preview = function (p) { return [colOf(p, rot)]; };
      var p = await ed.getPoint("Column " + (shape === "rect" ? "" : shape + " ") + (rnd() ? (shape === "circle" ? "Ø" : "") + w : w + "×" + d) + (legs() ? ", legs " + tw : "") + " — click to place, or Corners for every wall corner and junction (Enter to finish)", { opt: true, kw: ["Corners", "Shape", "Size", "Round", "Rotate"] });
      if (p == null) return;
      if (p === "Shape") {
        var SH = { Rectangular: "rect", Circular: "circle", Octagonal: "octagon", Hexagonal: "hexagon", "L shape": "L", "T shape": "T", "Plus shape": "plus" }, curS = Object.keys(SH).filter(function (k) { return SH[k] === shape; })[0];
        shape = ed.cShape = SH[await ed.getKw("Column shape", Object.keys(SH), curS)] || "rect";
        if (legs()) { if (w < 400) w = ed.cW = 450; if (d < 400) d = ed.cD = 450; tw = ed.cTw = await ed.getDist("Leg thickness", { def: tw }); }
        continue;
      }
      if (p === "Corners") {   // one column at every corner / junction of this level's walls that has none yet
        var lv = cur(ed), nodes = [], have = ed.doc.d.ents.filter(function (x) { return x.t === "column" && x.lvl === lv; });
        ed.doc.d.ents.forEach(function (x) { if (x.t !== "wall" || x.lvl !== lv) return; var c = B.wallLine(x), ang = Math.atan2(c.u[1], c.u[0]) * 180 / Math.PI; [c.a, c.b].forEach(function (q) { var n = nodes.filter(function (m) { return G.dist(m.p, q) <= Math.max(5, x.th * 0.6); })[0]; if (n) n.n++; else nodes.push({ p: q, n: 1, rot: ((ang % 90) + 90) % 90 }); }); });
        var made = 0; nodes.forEach(function (n) { if (have.some(function (h) { return G.dist(h.p, n.p) < Math.max(h.w, h.d || h.w) / 2 + 50; })) return; ed.doc.add(Object.assign(colOf([n.p[0], n.p[1]], n.rot), { lvl: lv, layer: lay(ed, "S-COL") })); made++; });
        ed.say(made ? made + " column(s) placed at the wall corners and junctions of this level." : nodes.length ? "Every wall corner of this level already has a column." : "No walls on this level yet."); continue;
      }
      if (p === "Size") { w = ed.cW = await ed.getDist(rnd() ? "Size (diameter / across flats)" : "Width (overall)", { def: w }); if (!rnd()) d = ed.cD = await ed.getDist("Depth (overall)", { def: d }); if (legs()) tw = ed.cTw = await ed.getDist("Leg thickness", { def: tw }); continue; }
      if (p === "Round") { w = ed.cW = await ed.getDist("Diameter", { def: w }); shape = ed.cShape = "circle"; continue; }
      if (p === "Rotate") { rot = await ed.getAngle("Rotation", { def: rot }); continue; }
      ed.doc.add(Object.assign(colOf(p, rot), { layer: lay(ed, "S-COL") }));
    }
  });
  cmd("BEAM", ["BM"], async function (ed) {
    ensureBim(ed); var w = ed.bW || 230, d = ed.bD || 450;
    var a = await ed.getPoint("Beam " + w + "×" + d + " — start point", { kw: ["Size"] }); while (a === "Size") { w = ed.bW = await ed.getDist("Beam width", { def: w }); d = ed.bD = await ed.getDist("Beam depth (overall, incl. slab)", { def: d }); a = await ed.getPoint("Beam start point"); }
    while (true) { var prev = a; ed.preview = function (q) { return [{ t: "beam", a: prev, b: q, w: w, d: d, lvl: cur(ed) }]; }; var b = await ed.getPoint("Beam end point (Enter to finish)", { opt: true, base: a }); if (b == null) return; ed.doc.add({ t: "beam", a: a, b: b, w: w, d: d, lvl: cur(ed), layer: lay(ed, "S-BEAM") }); a = b; }
  });
  cmd("FOOTING", ["FT", "FOOT"], async function (ed) {
    var b = ensureBim(ed), L = ed.fL || 1500, Bw = ed.fB || 1500, D = ed.fD || 450, df = ed.fDf || 1500;
    var p = await ed.getPoint("Footing " + L + "×" + Bw + "×" + D + " at " + df + " mm below floor — click (Enter to finish)", { opt: true, kw: ["Size", "Columns"] });
    while (p === "Size") { L = ed.fL = await ed.getDist("Length", { def: L }); Bw = ed.fB = await ed.getDist("Breadth", { def: Bw }); D = ed.fD = await ed.getDist("Depth (thickness)", { def: D }); df = ed.fDf = await ed.getDist("Bottom of footing below this floor level", { def: df }); p = await ed.getPoint("Click to place (Enter to finish)", { opt: true, kw: ["Columns"] }); }
    function mk(pt, col) { return { t: "footing", p: pt, L: L, B: Bw, D: D, df: df, rot: col ? col.rot || 0 : 0, lvl: cur(ed), ped: col ? { w: col.w + 0, d: col.d + 0 } : null, pcc: { off: 150, th: 100 }, layer: lay(ed, "S-FOOT") }; }
    if (p === "Columns") { var cols = ed.doc.d.ents.filter(function (e) { return e.t === "column" && e.lvl === cur(ed); }); cols.forEach(function (c) { if (!ed.doc.d.ents.some(function (f) { return f.t === "footing" && G.dist(f.p, c.p) < 10; })) ed.doc.add(mk(c.p, c)); }); ed.say(cols.length + " footing(s) placed under the columns of this level."); return; }
    while (p != null) { ed.doc.add(mk(p, null)); ed.preview = function (q) { return [mk(q)]; }; p = await ed.getPoint("Next footing (Enter to finish)", { opt: true }); }
  });
  cmd("ROOF", ["RF"], async function (ed) {
    ensureBim(ed); var kind = ed.rfK || "Gable", mat = ed.rfM || "gi", slope = ed.rfS || 18, over = ed.rfO || 0, p;
    while (true) {
      p = await ed.getPoint("Roof — " + kind + ", " + (kind === "Flat" ? "RCC" : mat + ", " + slope + "°") + ", overhang " + over + " mm. Choose Walls to cover the whole building in one step, or click the first corner", { kw: ["Walls", "Type", "Covering", "Slope", "Overhang", "Inside", "Select"] });
      if (p === "Type") { kind = ed.rfK = await ed.getKw("Roof type", ["Flat", "Shed", "Gable", "Hip"], kind); if (kind === "Flat") mat = "rcc"; else if (mat === "rcc") mat = "gi"; continue; }
      if (p === "Covering") { mat = ed.rfM = (await ed.getKw("Covering", ["gi", "tile", "puf", "rcc"], mat)).toLowerCase(); continue; }
      if (p === "Slope") { slope = ed.rfS = await ed.getAngle("Slope (degrees)", { def: slope }); continue; }
      if (p === "Overhang") { over = ed.rfO = await ed.getDist("Overhang beyond the outline (0 = none)", { def: over }); continue; }
      break;
    }
    if (kind === "Flat") { mat = "rcc"; slope = 0; }
    var pts = ccw(await outline(ed, "roof", p)); if (over > 0) { var o = G.offset({ t: "pline", pts: pts.map(function (q) { return [q[0], q[1], 0]; }), closed: true }, over, [1e12, 1e12]); if (o) pts = ccw(o.pts.map(function (q) { return [q[0], q[1]]; })); }
    var here = B.level(ed.doc.d, cur(ed)), dir = 0;
    if (kind === "Shed") { var a = await ed.getPoint("Slope direction — a point on the low side"), b2 = await ed.getPoint("…then towards the high side", { base: a }); dir = G.ang(a, b2) * 180 / Math.PI; }
    ed.doc.add({ t: "roof", pts: pts, kind: kind.toLowerCase(), slope: slope, mat: mat, th: mat === "rcc" ? 125 : 50, lvl: here.id, off: here.h, over: over, dir: kind === "Shed" ? dir : null, layer: lay(ed, "A-ROOF") });
    ed.say(kind + " roof " + (B.area(pts) / 1e6).toFixed(2) + " m² (plan) on top of this floor");
  });
  cmd("STAIR", ["ST", "STAIRS"], async function (ed) {
    var b = ensureBim(ed), L = B.level(ed.doc.d, cur(ed)), kind = ed.stK || "Dogleg", w = ed.stW || 1000, T = ed.stT || 250, p;
    var n = Math.max(2, Math.round(L.h / 150)), R = L.h / n;
    while (true) {
      p = await ed.getPoint("Start of the first step (bottom corner) — " + kind + ", width " + Math.round(w) + ", tread " + Math.round(T) + ", " + n + " risers of " + R.toFixed(0) + " mm", { kw: ["Type", "Width", "Tread"] });
      if (p === "Type") { kind = ed.stK = await ed.getKw("Stair type", ["Straight", "Dogleg"], kind); continue; }
      if (p === "Width") { w = ed.stW = await ed.getDist("Flight width", { def: w }); continue; }
      if (p === "Tread") { T = ed.stT = await ed.getDist("Tread (going)", { def: T }); continue; }
      break;
    }
    ed.preview = function (q) { return [{ t: "stair", p: p, dir: G.ang(p, q) * 180 / Math.PI, w: w, n: n, R: R, T: T, kind: kind.toLowerCase(), lvl: cur(ed), land: w }]; };
    var q = await ed.getPoint("Direction of going up (click a point)", { base: p }); ed.preview = null;
    ed.doc.add({ t: "stair", p: p, dir: G.ang(p, q) * 180 / Math.PI, w: w, n: n, R: R, T: T, wt: 150, kind: kind.toLowerCase(), lvl: cur(ed), land: w, layer: lay(ed, "A-STAIR") });
    ed.say(kind + " stair: " + n + " risers × " + R.toFixed(1) + " mm" + (R > 190 ? " — riser is high; check the requirement" : ""));
  });
  cmd("ROOM", ["RM", "SPACE"], async function (ed) {
    ensureBim(ed);
    while (true) {
      var p = await ed.getPoint("Click inside a room (Enter to finish)", { opt: true }); if (p == null) return;
      var bd = CAD.boundaryAt(ed.doc, p, ed.isolated, B.roomOpts(ed.doc)); if (!bd) { ed.say("No closed room boundary there — close the walls first."); continue; }
      var name = (await ed.getText("Room name", { def: "Room " + (ed.doc.d.ents.filter(function (e) { return e.t === "room"; }).length + 1) })).trim();
      var fl = (await ed.getKw("Floor finish", ["vitrified", "ceramic", "kota", "granite", "ips", "none"], ed.rmF || "vitrified")); ed.rmF = fl;
      ed.doc.add({ t: "room", pts: ccw(G.loopPts(bd.outer)), name: name, lvl: cur(ed), floor: fl === "none" ? null : fl, skirt: 100, ceil: false, layer: lay(ed, "A-ROOM") });
      ed.say(name + ": " + (bd.area / 1e6).toFixed(2) + " m²");
    }
  });
  /* where a railing sits: top of the roof / slab of this level, or a typed height above the level floor */
  function roofTop(ed) {
    var d = ed.doc.d, lv = B.level(d, cur(ed)), best = null;
    d.ents.forEach(function (e) { if ((e.t === "roof" || (e.t === "slab" && e.kind !== "floor")) && e.lvl === lv.id && e.off != null && e.off > 0 && (best == null || e.off > best)) best = e.off; });
    return best != null ? best : lv.h;
  }
  async function railingCmd(ed, par) {
    ensureBim(ed); var isPar = function (id) { return B.railStyle({ style: id }).par; }, style = par ? (ed.ppStyle || "par_solid") : (ed.rlStyle || ""), th = ed.ppTh || 115, word = par ? "Parapet" : "Railing";
    function extra() { var o = {}; if (style) o.style = style; if (isPar(style) && th !== 115) o.th = th; return o; }
    var base = ed.rlBase || 0, mode = ed.rlMode || "Floor", h = ed.rlH || 1000, lv = B.level(ed.doc.d, cur(ed)), first;
    function setMode(m, custom) { mode = ed.rlMode = m; base = ed.rlBase = m === "Floor" ? 0 : m === "Roof top" ? roofTop(ed) : custom; ed.wpZ = lv.elev + base; ed.dirty = true; }
    setMode(mode, base);
    function lbl() { return word + " (" + B.railStyle({ style: style }).n.replace(/^(Railing|Parapet) — /, "") + ") start — on " + (mode === "Floor" ? "the floor of this level" : mode === "Roof top" ? "the roof / slab top (+" + Math.round(base) + " mm)" : "+" + Math.round(base) + " mm above the floor") + ", " + Math.round(h) + " mm high"; }
    while (true) {
      first = await ed.getPoint(lbl() + " — or Around a slab / terrace in one step", { kw: ["Around", "Design", "Floor", "Roof top", "Elevation", "Height"].concat(par ? ["Thickness"] : [], ["Iso"]) });
      if (first === "Design") { var SN = {}; B.RAIL_STYLES.forEach(function (r) { if (isPar(r[0]) === !!par) SN[r[1].replace(/^(Railing|Parapet) — /, "")] = r[0]; }); var curN = Object.keys(SN).filter(function (k) { return SN[k] === style; })[0]; style = SN[await ed.getKw(word + " design", Object.keys(SN), curN)]; if (style == null) style = par ? "par_solid" : ""; if (par) ed.ppStyle = style; else ed.rlStyle = style; continue; }
      if (first === "Thickness") { th = ed.ppTh = await ed.getDist("Parapet wall thickness", { def: th }); continue; }
      if (first === "Around") {   // a closed railing all round a slab, flat roof or closed outline, just inside its edge
        var pk = await ed.getEnt("Select the slab, flat roof or closed outline to rail", { filter: function (x) { return ((x.t === "slab" || x.t === "roof" || x.t === "land") && x.pts && x.pts.length > 2) || !!CAD.loopOf(x); } });
        var src = pk.e, loop = src.pts && src.t !== "pline" ? src.pts.map(function (q) { return [q[0], q[1]]; }) : G.loopPts(CAD.loopOf(src)), ins = G.offset({ t: "pline", pts: ccw(loop).map(function (q) { return [q[0], q[1], 0]; }), closed: true }, -(isPar(style) ? th / 2 : 75), [1e12, 1e12]);
        var rp = (ins && ins.pts && ins.pts.length > 2 ? ins.pts : ccw(loop)).map(function (q) { return [q[0], q[1]]; }); rp.push([rp[0][0], rp[0][1]]);
        var onTop = src.t === "slab" || src.t === "roof", rb = onTop ? (src.off || 0) : base;
        ed.wpZ = null; ed.doc.add(Object.assign({ t: "railing", pts: rp, h: h, base: rb || undefined, lvl: onTop && src.lvl ? src.lvl : cur(ed), layer: lay(ed, "A-RAIL") }, extra()));
        ed.say(word + " placed all round" + (onTop ? " on top of the " + src.t : "") + ", " + Math.round(h) + " mm high."); ed.dirty = true; return;
      }
      if (first === "Floor") setMode("Floor"); else if (first === "Roof top") { setMode("Roof top"); ed.say("Railing will sit on the roof top (" + Math.round(base) + " mm above this level). Use Iso to pick the roof corners in the isometric view."); }
      else if (first === "Elevation") setMode("Elevation", await ed.getDist("Height of the railing base above this level's floor", { def: base }));
      else if (first === "Height") h = ed.rlH = await ed.getDist("Railing height", { def: h });
      else if (first === "Iso") { if (CAD.ACTIONS.iso && ed._ctx) CAD.ACTIONS.iso(ed, ed._ctx); else { ed.iso = !ed.iso; ed.dirty = true; ed.zoomExtents(); } }
      else break;
    }
    var pts = [first];
    try {
      while (true) { ed.preview = function (w) { return [Object.assign({ t: "railing", pts: pts.concat([w]), lvl: cur(ed), h: h, base: base }, extra())]; }; var p = await ed.getPoint("Next point (Enter to finish)", { opt: true, base: pts[pts.length - 1] }); if (p == null) break; if (typeof p === "string") continue; pts.push(p); }
    } finally { ed.preview = null; ed.wpZ = null; ed.dirty = true; }
    if (pts.length > 1) ed.doc.add(Object.assign({ t: "railing", pts: pts, h: h, base: base || undefined, lvl: cur(ed), layer: lay(ed, "A-RAIL") }, extra()));
  }
  /* WALLFINISH: tiles / dado / panelling / cladding put on wall faces by clicking — one face at a time, or every wall of a room.
     The finish is the same wall.fin record the Properties panel edits (kind, face, from / to height, material). */
  cmd("WALLFINISH", ["WF", "DADO"], async function (ed) {
    ensureBim(ed); var kind = ed.wfKind || "dado", z0 = ed.wfZ0 || 0, z1 = ed.wfZ1 === undefined ? (B.FIN[kind] || {}).z1 : ed.wfZ1, look = ed.wfLook || null, n = 0;
    function name() { return (B.FIN[kind] || B.FIN.tile).n.replace(/ \(.*\)$/, ""); }
    function mat() { var P = B.FIN[kind] || B.FIN.tile, id = look && B.LOOKS[look] ? look : P.look; return (B.LOOKS[id] || {}).n || id; }
    function lbl() { return name() + " — " + mat() + ", from " + Math.round(z0) + " to " + (z1 == null ? "the top of the wall" : Math.round(z1) + " mm"); }
    function put(w, fc, s0, s1) {
      var o = CAD.clone(w); o.fin = Object.assign({}, o.fin || {}); var nf = B.finNew(o, kind, fc); nf.f.z0 = z0; if (z1 == null) delete nf.f.z1; else nf.f.z1 = z1; if (look && B.LOOKS[look]) nf.f.look = look;
      if (s0 != null) { nf.f.s0 = Math.round(s0); nf.f.s1 = Math.round(s1); }
      o.fin[nf.id] = nf.f; ed.doc.mod(w.id, o); n++;
    }
    function side(w, p) { var c = B.wallLine(w); return G.cross2 ? (G.cross2(c.u, G.sub(p, c.a)) > 0 ? 0 : 1) : ((c.u[0] * (p[1] - c.a[1]) - c.u[1] * (p[0] - c.a[0])) > 0 ? 0 : 1); }
    while (true) {
      var p = await ed.getPoint(lbl() + " — click a wall on the side to finish, or Room for all walls of a room (Enter to finish)", { opt: true, kw: ["Room", "Kind", "Height", "From", "Material"] });
      if (p == null) break;
      if (p === "Kind") { var KN = {}; Object.keys(B.FIN).forEach(function (k) { KN[B.FIN[k].n] = k; }); var ck = Object.keys(KN).filter(function (k) { return KN[k] === kind; })[0]; kind = ed.wfKind = KN[await ed.getKw("Finish", Object.keys(KN), ck)] || kind; z1 = ed.wfZ1 = (B.FIN[kind] || {}).z1; look = ed.wfLook = null; continue; }
      if (p === "Height") { var hv = await ed.getDist("Finish up to this height above the floor (0 = full wall height)", { def: z1 == null ? 0 : z1 }); z1 = ed.wfZ1 = hv > 0 ? hv : null; continue; }
      if (p === "From") { z0 = ed.wfZ0 = Math.max(0, await ed.getDist("Finish starts at this height above the floor", { def: z0 })); continue; }
      if (p === "Material") { var P0 = B.FIN[kind] || B.FIN.tile, MN = {}; (P0.looks || [P0.look]).forEach(function (id) { if (B.LOOKS[id]) MN[B.LOOKS[id].n] = id; }); look = ed.wfLook = MN[await ed.getKw("Material (more in Properties after placing)", Object.keys(MN), mat())] || look; continue; }
      if (p === "Room") {
        var q = await ed.getPoint("Click inside the room"); if (!q || typeof q === "string") continue;
        var room = B.roomAt ? B.roomAt(ed.doc, q, cur(ed)) : null, loop = room && room.pts ? room.pts : null;
        if (!loop) { ed.say("No room found there. Make the room with Room first (Building → Rooms and floors), or click the walls one by one."); continue; }
        var before = n, walls = ed.doc.d.ents.filter(function (w) { return w.t === "wall" && (w.lvl || cur(ed)) === (room.lvl || cur(ed)); });
        for (var i = 0; i < loop.length; i++) {
          var a = loop[i], b = loop[(i + 1) % loop.length], el = G.dist(a, b); if (el < 50) continue; var eu = G.norm(G.sub(b, a)), mid = G.lerp(a, b, 0.5);
          walls.forEach(function (w) {
            var c = B.wallLine(w), wl = G.dist(c.a, c.b); if (Math.abs(eu[0] * c.u[1] - eu[1] * c.u[0]) > 0.03) return;
            var off = Math.abs(c.u[0] * (mid[1] - c.a[1]) - c.u[1] * (mid[0] - c.a[0])); if (off > (w.th || 230) / 2 + 90) return;
            var sa = G.dot(G.sub(a, c.a), c.u), sb = G.dot(G.sub(b, c.a), c.u), lo = Math.max(0, Math.min(sa, sb)), hi = Math.min(wl, Math.max(sa, sb)); if (hi - lo < 100) return;
            var cen = [0, 0]; loop.forEach(function (v) { cen[0] += v[0] / loop.length; cen[1] += v[1] / loop.length; });
            var whole = lo < 60 && hi > wl - 60; put(ed.doc.get(w.id), side(w, G.lerp(mid, cen, 0.02)), whole ? null : lo, whole ? null : hi);
          });
        }
        ed.say(n > before ? name() + " put on " + (n - before) + " wall face(s) of " + (room.name || "the room") + "." : "No walls found along that room."); ed.dirty = true; continue;
      }
      if (typeof p === "string") continue;
      var best = null, bd = 1e9; ed.doc.d.ents.forEach(function (w) { if (w.t !== "wall" || (w.lvl && w.lvl !== cur(ed))) return; var c = B.wallLine(w), s = G.dot(G.sub(p, c.a), c.u), wl = G.dist(c.a, c.b); if (s < -50 || s > wl + 50) return; var off = Math.abs(c.u[0] * (p[1] - c.a[1]) - c.u[1] * (p[0] - c.a[0])); if (off < bd) { bd = off; best = w; } });
      if (!best || bd > (best.th || 230) / 2 + 600) { ed.say("Click on or just beside a wall."); continue; }
      put(best, side(best, p)); ed.say(name() + " put on that face. Click the next wall, or Enter to finish."); ed.dirty = true;
    }
    if (n) ed.say(n + " wall face(s) finished. Select a wall to change the material, colour or heights in Properties.");
  });
  cmd("RAILING", ["RL"], function (ed) { return railingCmd(ed, false); });
  cmd("PARAPET", ["PRP"], function (ed) { return railingCmd(ed, true); });
  cmd("LEVEL", ["LV"], async function (ed) { if (ed.onPanel) ed.onPanel("bim"); });
  /* ---------- dimension the building in one step ---------- */
  cmd("DIMWALLS", ["AUTODIM", "DW"], async function (ed) {
    ensureBim(ed); var lv = cur(ed), outs = B.wallOutlines(ed.doc, lv), layer = ed.doc.d.layers.DIM ? "DIM" : undefined, n = 0;
    var ws = ed.doc.d.ents.filter(function (x) { return x.t === "wall" && x.lvl === lv && ed.doc.visible(x); }); if (!ws.length) { ed.say("No walls on this level to dimension."); return; }
    var kind = await ed.getKw("Dimension what?", ["All", "Overall", "Openings", "Rooms"], "All"), g1 = Math.max(600, Math.round(8 * ((ed.doc.d.dim && ed.doc.d.dim.sc) || 100))), g2 = g1 * 1.9;
    var add = function (a, b, off, nrm) { if (G.dist(a, b) < 20) return; var m = G.mid(a, b); ed.doc.add({ t: "dim", kind: "ali", a: a, b: b, p: [m[0] + nrm[0] * off, m[1] + nrm[1] * off], layer: layer }); n++; };
    /* outside faces: overall length of every side of the building */
    if (kind === "All" || kind === "Overall") outs.forEach(function (o) { var P = o.pts; P.forEach(function (p, i) { var q = P[(i + 1) % P.length], u = G.norm(G.sub(q, p)); add(p, q, g2, [u[1], -u[0]]); }); });
    /* openings: wall end – jamb – jamb – … – wall end, on the outside of exterior walls (inside faces of partitions are left alone) */
    if (kind === "All" || kind === "Openings") {
      var cx = 0, cy = 0; ws.forEach(function (w) { cx += w.a[0] + w.b[0]; cy += w.a[1] + w.b[1]; }); cx /= 2 * ws.length; cy /= 2 * ws.length;
      ws.forEach(function (w) {
        var ops = ed.doc.d.ents.filter(function (x) { return x.host === w.id && (x.t === "door" || x.t === "window" || x.t === "opening"); }); if (!ops.length) return;
        var c = B.wallLine(w), mid = G.mid(c.a, c.b), out = G.dot([mid[0] - cx, mid[1] - cy], c.n) >= 0 ? 1 : -1, nrm = [c.n[0] * out, c.n[1] * out], face = function (s) { return G.add(G.add(c.a, G.mul(c.u, s)), G.mul(nrm, w.th / 2)); };
        var cuts = [0]; ops.sort(function (p, q) { return p.at - q.at; }).forEach(function (o) { cuts.push(Math.max(0, o.at - o.w / 2), Math.min(c.L, o.at + o.w / 2)); }); cuts.push(c.L);
        for (var i = 0; i < cuts.length - 1; i++) add(face(cuts[i]), face(cuts[i + 1]), g1, nrm);
      });
    }
    /* rooms: clear width and depth, written inside each room */
    if (kind === "All" || kind === "Rooms") ed.doc.d.ents.forEach(function (r) {
      if (r.t !== "room" || r.lvl !== lv || !r.pts || r.pts.length < 3) return; var bb = B.polyBox(r.pts), cxr = (bb[0] + bb[2]) / 2, cyr = (bb[1] + bb[3]) / 2;
      var hit = function (o, dvec) { var best = null; r.pts.forEach(function (p, i) { var q = r.pts[(i + 1) % r.pts.length], x = G.intersect({ k: "L", a: o, b: G.add(o, G.mul(dvec, 1e7)) }, { k: "L", a: p, b: q })[0]; if (x && (!best || G.dist(o, x) < G.dist(o, best))) best = x; }); return best; };
      var c0 = [cxr, cyr]; if (!G.inPoly(c0, r.pts)) return; var L1 = hit(c0, [-1, 0]), R1 = hit(c0, [1, 0]), D1 = hit(c0, [0, -1]), U1 = hit(c0, [0, 1]);
      if (L1 && R1) add(L1, R1, (bb[3] - bb[1]) * 0.22, [0, -1]); if (D1 && U1) add(D1, U1, (bb[2] - bb[0]) * 0.22, [-1, 0]);
    });
    ed.say(n ? n + " dimension(s) added. Undo removes them all together." : "Nothing to dimension — close the walls or add rooms / openings first.");
  });
  /* ---------- copy the whole floor to another level (typical floors) ---------- */
  cmd("FLOORCOPY", ["COPYFLOOR", "CF"], async function (ed) {
    var b = ensureBim(ed), from = B.level(ed.doc.d, cur(ed)), KEEP = { wall: 1, door: 1, window: 1, opening: 1, column: 1, beam: 1, slab: 1, room: 1, railing: 1, stair: 1, asset: 1 };
    var src = ed.doc.d.ents.filter(function (e) { if (!KEEP[e.t] || !ed.doc.editable(e)) return false; var lv = e.lvl || (B.hostOf(ed.doc, e) || {}).lvl; return lv === from.id; });
    if (!src.length) { ed.say("Nothing on " + from.name + " to copy."); return; }
    var others = b.levels.filter(function (l) { return l.id !== from.id; }).sort(function (x, y) { return x.elev - y.elev; }), NEW = "New level above", names = others.map(function (l) { return l.name; }).concat([NEW]), above = B.levelAbove(ed.doc.d, from.id);
    var pick = await ed.getKw("Copy " + src.length + " element(s) of " + from.name + " to which level? (roofs and footings are not copied)", names, above ? above.name : NEW), to = others.filter(function (l) { return l.name === pick; })[0];
    if (!to) {   // a new level on top of everything, same storey height as this one
      var nb = CAD.clone(b), topL = nb.levels.slice().sort(function (x, y) { return y.elev - x.elev; })[0]; to = { id: "L" + Date.now().toString(36), name: "Level " + nb.levels.length, elev: topL.elev + topL.h, h: from.h }; nb.levels.push(to); ed.doc.set("bim", nb);
    }
    var busy = ed.doc.d.ents.filter(function (e) { return KEEP[e.t] && e.lvl === to.id; }).length;
    if (busy && (await ed.getKw(to.name + " already has " + busy + " element(s). Add the copy to them?", ["Yes", "No"], "No")) !== "Yes") { ed.say("Nothing copied."); return; }
    var idMap = {}, n = 0;
    src.filter(function (e) { return !e.host; }).forEach(function (e) { var o = CAD.clone(e); delete o.id; o.lvl = to.id; var ne = ed.doc.add(o); idMap[e.id] = ne.id; n++; });
    src.filter(function (e) { return e.host; }).forEach(function (e) { if (!idMap[e.host]) return; var o = CAD.clone(e); delete o.id; o.host = idMap[e.host]; if (o.lvl) o.lvl = to.id; ed.doc.add(o); n++; });   // doors and windows go to the copied walls
    ed.say(n + " element(s) copied from " + from.name + " to " + to.name + ". Choose " + to.name + " in the Level list to work on it."); if (ed.onRebar) ed.onRebar();
  });
  /* ---------- ROAD: centre line like a polyline (or an existing polyline / line), then ground and road levels ---------- */
  cmd("ROAD", ["RD", "ALIGN"], async function (ed) {
    ensureBim(ed); var pts = [], first = await ed.getPoint("Road centre line — start point", { kw: ["Object"] });
    if (first === "Object") { var ids = await ed.getSel("Select a polyline or line for the centre line", { single: true, fresh: true }), src = ed.doc.get(ids[0]); if (!src) throw new Error("cancel"); if (src.t === "pline") pts = src.pts.map(function (p) { return [p[0], p[1], p[2] || 0]; }); else if (src.t === "line") pts = [[src.a[0], src.a[1], 0], [src.b[0], src.b[1], 0]]; else throw new Error("Pick a polyline or a line"); }
    else {
      pts.push([first[0], first[1], 0]);
      while (true) { ed.preview = function (w) { return [{ t: "pline", pts: pts.concat([[w[0], w[1], 0]]), closed: false }]; }; var p = await ed.getPoint("Next point of the centre line (Enter to finish)", { opt: true, base: pts[pts.length - 1], kw: pts.length > 1 ? ["Undo"] : [] }); ed.preview = null; if (p == null) break; if (p === "Undo") { if (pts.length > 1) pts.pop(); continue; } pts.push([p[0], p[1], 0]); }
    }
    if (pts.length < 2) throw new Error("A road needs at least two points");
    var ch0 = await ed.getNum("Chainage at the start (m)", { def: 0 }), g = await ed.getNum("Ground level at the centre line (RL, m)", { def: 100 }), h = await ed.getNum("Road level above ground (m; negative = cutting)", { def: 0.6 });
    var L = B.roadAlign({ t: "road", pts: pts }).L, c0 = Math.round(ch0 * 1000), G0 = Math.round(g * 1000), H0 = Math.round(h * 1000);
    var e = ed.doc.add({ t: "road", pts: pts, name: "Road " + (ed.doc.d.ents.filter(function (x) { return x.t === "road"; }).length + 1), ch0: c0, iv: 20000, xf: 0, ngl: [[c0, G0], [c0 + Math.round(L), G0]], prof: [[c0, G0 + H0], [c0 + Math.round(L), G0 + H0]], tpl: B.ROAD_TPL(), layer: lay(ed, "R-ROAD") });
    ed.say("Road created: " + (L / 1000).toFixed(1) + " m. Enter the surveyed ground levels and the design profile in Properties → Levels & layers, then open Earthwork.");
    return e;
  });
  /* ---------- CULVERT: pick a point on a road ---------- */
  cmd("CULVERT", ["CV"], async function (ed) {
    var roads = ed.doc.d.ents.filter(function (x) { return x.t === "road"; }); if (!roads.length) throw new Error("Draw a road first (ROAD)");
    var p = await ed.getPoint("Culvert location on the road"), best = null; roads.forEach(function (r) { var b = B.roadChAt(r, p); if (b && (!best || b.d < best.d)) { best = b; best.r = r; } });
    var kind = (await ed.getKw("Culvert type", ["Pipe", "Box"], "Pipe")).toLowerCase(), o = { t: "culvert", road: best.r.id, ch: Math.round(best.ch), kind: kind, layer: lay(ed, "R-CULV") };
    if (kind === "pipe") { o.dia = +(await ed.getKw("Pipe diameter (mm)", B.PIPES.map(String), "1000")); o.rows = Math.max(1, Math.round(await ed.getNum("Rows of pipes", { def: 1 }))); }
    else { o.span = Math.round(await ed.getDist("Clear span", { def: 2000 })); o.ht = Math.round(await ed.getDist("Clear height", { def: 1500 })); o.th = 250; o.rows = Math.max(1, Math.round(await ed.getNum("Number of cells", { def: 1 }))); }
    ed.doc.add(o); var g = B.culvertGeom(ed.doc, o); ed.say("Culvert at " + B.chTxt(o.ch) + ", length " + (g.len / 1000).toFixed(2) + " m, cushion " + (g.cush / 1000).toFixed(2) + " m" + (g.cush < 600 ? " — LESS than 600 mm: raise the road or lower the invert" : ""));
  });
  cmd("EARTHWORK", ["EW", "LSEC", "XSEC"], async function (ed) { if (ed.onRoad) ed.onRoad(); });
  /* ---------- ASSET: place library items (trees, lights, WCs…) — several clicks, Enter to finish ---------- */
  /* one library item dropped at p (drag & drop from the Library panel) */
  B.placeAsset = function (ed, kind, p) {
    var def = B.ASSET_LIB[kind]; if (!def) return null; ensureBim(ed);
    var catLay = Object.assign({ Landscape: "L-LAND", Electrical: "E-ELEC", Plumbing: "P-PLUMB", Furniture: "A-FURN", Kitchen: "A-KITCHEN", Finishes: "A-FINISH" }, B.CAT_LAY || {}), rot = ed.astRot || 0;
    var sn = ed.set.astSnap === false || !B.assetWallSnap ? null : B.assetWallSnap(ed.doc, { kind: kind, rot: rot, lvl: cur(ed) }, p);
    ed.doc.begin("Place " + def.n); var o = { t: "asset", kind: kind, p: sn ? sn.p : p, rot: sn ? sn.rot : rot, lvl: cur(ed), layer: lay(ed, catLay[def.cat] || "A-ASSET") }; if (ed.astRef) { o.ref = ed.astRef; o.dz = ed.astDz || 0; } if (kind === "tank") o.cap = 1000;
    var e = ed.doc.add(o); ed.doc.commit(); ed.lastAsset = kind; return e;
  };
  B.assetGhost = function (ed, kind, p) { var rot = ed.astRot || 0, sn = ed.set.astSnap === false || !B.assetWallSnap ? null : B.assetWallSnap(ed.doc, { kind: kind, rot: rot, lvl: cur(ed) }, p); return { t: "asset", kind: kind, p: sn ? sn.p : p, rot: sn ? sn.rot : rot, lvl: cur(ed) }; };
  cmd("ASSET", ["AST", "LIBRARY"], async function (ed) {
    ensureBim(ed); var kinds = Object.keys(B.ASSET_LIB), kind = ed.assetKind && B.ASSET_LIB[ed.assetKind] ? ed.assetKind : null;
    if (!kind) kind = await ed.getKw("Item", kinds, ed.lastAsset || "tree"); ed.assetKind = null; ed.lastAsset = kind;
    var def = B.ASSET_LIB[kind], rot = ed.astRot || 0, sc = 1, cap = 1000, n = 0, catLay = Object.assign({ Landscape: "L-LAND", Electrical: "E-ELEC", Plumbing: "P-PLUMB", Furniture: "A-FURN", Kitchen: "A-KITCHEN", Finishes: "A-FINISH" }, B.CAT_LAY || {}), layer = lay(ed, catLay[def.cat] || "A-ASSET");
    if (kind === "tank") cap = Math.max(200, Math.round(await ed.getNum("Tank capacity (litres)", { def: 1000 })));
    var snapOf = function (w) { return ed.set.astSnap === false || !B.assetWallSnap ? null : B.assetWallSnap(ed.doc, { kind: kind, rot: rot, sc: sc, lvl: cur(ed) }, w); };
    while (true) {
      ed.preview = function (w) { var sn = snapOf(w); return [{ t: "asset", kind: kind, p: sn ? sn.p : w, rot: sn ? sn.rot : rot, sc: sc, cap: cap, lvl: cur(ed), ref: ed.astRef || undefined, dz: ed.astDz || 0 }]; };
      var refLbl = ed.astRef ? ", " + ({ floor: Math.round(ed.astDz || 0) + " mm above the floor", fceil: "under the false ceiling" + (ed.astDz ? " −" + Math.round(ed.astDz) : ""), ceiling: "under the slab" + (ed.astDz ? " −" + Math.round(ed.astDz) : ""), top: "on the slab top" + (ed.astDz ? " +" + Math.round(ed.astDz) : "") })[ed.astRef] : "";
      var p = await ed.getPoint("Place " + def.n + refLbl + (def.cat === "Landscape" || def.mount === "ceiling" ? "" : " — it jumps flush to a wall when close") + " (Enter to finish; Height = floor / false ceiling / slab)", { opt: true, kw: ["Height", "Turn", "Rotate", "Scale", "Wallsnap"] }); ed.preview = null;
      if (p == null) break;
      if (p === "Height") {   // what the height is measured from — no adding up of levels and thicknesses
        var NM = { Automatic: "", Floor: "floor", "False ceiling": "fceil", "Slab underside": "ceiling", "Slab top": "top" }, curN = Object.keys(NM).filter(function (k) { return NM[k] === (ed.astRef || ""); })[0];
        var pickR = await ed.getKw("Measure the height from", Object.keys(NM), curN || "Automatic"); ed.astRef = NM[pickR] || null;
        if (ed.astRef) ed.astDz = await ed.getDist({ floor: "Bottom of the item above the floor", fceil: "Gap below the false ceiling (0 = touching)", ceiling: "Gap below the slab (0 = touching)", top: "Above the top of the slab" }[ed.astRef], { def: ed.astRef === "floor" ? (ed.astDz != null ? ed.astDz : def.mz || 0) : ed.astDz || 0 }); else ed.astDz = null;
        continue;
      }
      if (p === "Turn") { rot = ed.astRot = (rot + 90) % 360; continue; }   // quarter turn
      if (p === "Rotate") { rot = ed.astRot = await ed.getNum("Rotation (degrees)", { def: rot }); continue; }
      if (p === "Scale") { sc = await ed.getNum("Scale (1 = standard size)", { def: sc }); continue; }
      if (p === "Wallsnap") { ed.set.astSnap = ed.set.astSnap === false; ed.say(ed.set.astSnap ? "Items jump to walls." : "Items stay exactly where you click."); continue; }
      var sn = snapOf(p), o = { t: "asset", kind: kind, p: sn ? sn.p : p, rot: sn ? sn.rot : rot, lvl: cur(ed), layer: layer }; if (ed.astRef) { o.ref = ed.astRef; o.dz = ed.astDz || 0; } if (sc !== 1) o.sc = sc; if (kind === "tank") o.cap = cap; ed.doc.add(o); n++;
    }
    ed.say(n + " × " + def.n + " placed.");
  });
  /* ---------- LANDSCAPE area: corners, or click inside a closed boundary ---------- */
  cmd("LANDAREA", ["LAND", "LAWN", "PAVING"], async function (ed) {
    ensureBim(ed); var kind = ed.landPick || (await ed.getKw("Area type", ["Lawn", "Paver", "Gravel", "Bed", "PCC"], ed.landK || "Lawn")); ed.landPick = null; ed.landK = kind; kind = kind.toLowerCase();
    var first = await ed.getPoint("First corner, or Inside to pick a closed boundary", { kw: ["Inside"] }), pts = [];
    if (first === "Inside") { var q = await ed.getPoint("Click inside a closed boundary"), bd = CAD.boundaryAt(ed.doc, q, ed.isolated); if (!bd) throw new Error("No closed boundary there"); pts = ccw(G.loopPts(bd.outer)); }
    else {
      pts.push(first);
      while (true) { ed.preview = function (w) { return [{ t: "land", kind: kind, pts: pts.concat([w]), lvl: cur(ed) }]; }; var p = await ed.getPoint("Next corner (Enter to close)", { opt: true, base: pts[pts.length - 1], kw: ["Undo"] }); ed.preview = null; if (p == null) break; if (p === "Undo") { if (pts.length > 1) pts.pop(); continue; } pts.push(p); }
      if (pts.length < 3) throw new Error("At least three corners");
      pts = ccw(pts);
    }
    ed.doc.add({ t: "land", kind: kind, pts: pts, lvl: cur(ed), layer: lay(ed, "L-LAND") }); ed.say(B.LAND[kind][0] + ": " + (B.area(pts) / 1e6).toFixed(2) + " m²");
  });
  /* ---------- REBAR: add default reinforcement (bars, BBS) to columns, beams, footings and slabs ---------- */
  cmd("REBAR", ["RB", "BARS"], async function (ed) {   // RF is the roof
    var ids = ed.sel.size ? Array.from(ed.sel) : null;
    if (!ids) { var k = await ed.getKw("Add reinforcement to", ["All", "Select"], "All"); if (k === "Select") ids = await ed.getSel("Select columns, beams, footings or slabs"); }
    var list = ed.doc.d.ents.filter(function (e) { return B.RF_TYPES[e.t] && (!ids || ids.indexOf(e.id) >= 0); }), add = 0, had = 0;
    list.forEach(function (e) { if (e.rf) { had++; return; } ed.doc.mod(e.id, Object.assign(CAD.clone(e), { rf: B.rfDefault(ed.doc, e) })); add++; });
    ed.say(add ? "Reinforcement added to " + add + " element(s)" + (had ? " (" + had + " already had bars)" : "") + ". These are starting values — check them against the structural design in Properties." : list.length ? "All selected elements already have reinforcement." : "No columns, beams, footings or slabs found.");
    if (ed.onRebar) ed.onRebar();
  });
  cmd("BBS", ["BARSCHEDULE"], async function (ed) { if (ed.onBbs) ed.onBbs(); });
  cmd("BIM3D", ["3D", "V3"], async function (ed) { if (ed.on3d) ed.on3d(); });
  cmd("QUANTITIES", ["QT", "BOQ"], async function (ed) { if (ed.onQto) ed.onQto(); });
})();
