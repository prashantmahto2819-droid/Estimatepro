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
    ensureBim(ed); var w = ed.cW || 300, d = ed.cD || 300, rot = 0, shape = "rect";
    while (true) {
      ed.preview = function (p) { return [{ t: "column", p: p, w: w, d: d, rot: rot, shape: shape, lvl: cur(ed) }]; };
      var p = await ed.getPoint("Column " + (shape === "circle" ? "Ø" + w : w + "×" + d) + " — click to place, or Corners for every wall corner and junction (Enter to finish)", { opt: true, kw: ["Corners", "Size", "Round", "Rotate"] });
      if (p == null) return;
      if (p === "Corners") {   // one column at every corner / junction of this level's walls that has none yet
        var lv = cur(ed), nodes = [], have = ed.doc.d.ents.filter(function (x) { return x.t === "column" && x.lvl === lv; });
        ed.doc.d.ents.forEach(function (x) { if (x.t !== "wall" || x.lvl !== lv) return; var c = B.wallLine(x), ang = Math.atan2(c.u[1], c.u[0]) * 180 / Math.PI; [c.a, c.b].forEach(function (q) { var n = nodes.filter(function (m) { return G.dist(m.p, q) <= Math.max(5, x.th * 0.6); })[0]; if (n) n.n++; else nodes.push({ p: q, n: 1, rot: ((ang % 90) + 90) % 90 }); }); });
        var made = 0; nodes.forEach(function (n) { if (have.some(function (h) { return G.dist(h.p, n.p) < Math.max(h.w, h.d || h.w) / 2 + 50; })) return; ed.doc.add({ t: "column", p: [n.p[0], n.p[1]], w: w, d: shape === "circle" ? w : d, rot: shape === "circle" ? 0 : n.rot, shape: shape, lvl: lv, layer: lay(ed, "S-COL") }); made++; });
        ed.say(made ? made + " column(s) placed at the wall corners and junctions of this level." : nodes.length ? "Every wall corner of this level already has a column." : "No walls on this level yet."); continue;
      }
      if (p === "Size") { w = ed.cW = await ed.getDist("Width", { def: w }); d = ed.cD = await ed.getDist("Depth", { def: d }); shape = "rect"; continue; }
      if (p === "Round") { w = ed.cW = await ed.getDist("Diameter", { def: w }); shape = "circle"; continue; }
      if (p === "Rotate") { rot = await ed.getAngle("Rotation", { def: rot }); continue; }
      ed.doc.add({ t: "column", p: p, w: w, d: shape === "circle" ? w : d, rot: rot, shape: shape, lvl: cur(ed), layer: lay(ed, "S-COL") });
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
  cmd("RAILING", ["RL"], async function (ed) {
    ensureBim(ed); var base = ed.rlBase || 0, mode = ed.rlMode || "Floor", h = ed.rlH || 1000, lv = B.level(ed.doc.d, cur(ed)), first;
    function setMode(m, custom) { mode = ed.rlMode = m; base = ed.rlBase = m === "Floor" ? 0 : m === "Roof top" ? roofTop(ed) : custom; ed.wpZ = lv.elev + base; ed.dirty = true; }
    setMode(mode, base);
    function lbl() { return "Railing start — on " + (mode === "Floor" ? "the floor of this level" : mode === "Roof top" ? "the roof / slab top (+" + Math.round(base) + " mm)" : "+" + Math.round(base) + " mm above the floor") + ", " + Math.round(h) + " mm high"; }
    while (true) {
      first = await ed.getPoint(lbl() + " — or Around a slab / terrace in one step", { kw: ["Around", "Floor", "Roof top", "Elevation", "Height", "Iso"] });
      if (first === "Around") {   // a closed railing all round a slab, flat roof or closed outline, just inside its edge
        var pk = await ed.getEnt("Select the slab, flat roof or closed outline to rail", { filter: function (x) { return ((x.t === "slab" || x.t === "roof" || x.t === "land") && x.pts && x.pts.length > 2) || !!CAD.loopOf(x); } });
        var src = pk.e, loop = src.pts && src.t !== "pline" ? src.pts.map(function (q) { return [q[0], q[1]]; }) : G.loopPts(CAD.loopOf(src)), ins = G.offset({ t: "pline", pts: ccw(loop).map(function (q) { return [q[0], q[1], 0]; }), closed: true }, -75, [1e12, 1e12]);
        var rp = (ins && ins.pts && ins.pts.length > 2 ? ins.pts : ccw(loop)).map(function (q) { return [q[0], q[1]]; }); rp.push([rp[0][0], rp[0][1]]);
        var onTop = src.t === "slab" || src.t === "roof", rb = onTop ? (src.off || 0) : base;
        ed.wpZ = null; ed.doc.add({ t: "railing", pts: rp, h: h, base: rb || undefined, lvl: onTop && src.lvl ? src.lvl : cur(ed), layer: lay(ed, "A-RAIL") });
        ed.say("Railing placed all round" + (onTop ? " on top of the " + src.t : "") + ", " + Math.round(h) + " mm high."); ed.dirty = true; return;
      }
      if (first === "Floor") setMode("Floor"); else if (first === "Roof top") { setMode("Roof top"); ed.say("Railing will sit on the roof top (" + Math.round(base) + " mm above this level). Use Iso to pick the roof corners in the isometric view."); }
      else if (first === "Elevation") setMode("Elevation", await ed.getDist("Height of the railing base above this level's floor", { def: base }));
      else if (first === "Height") h = ed.rlH = await ed.getDist("Railing height", { def: h });
      else if (first === "Iso") { if (CAD.ACTIONS.iso && ed._ctx) CAD.ACTIONS.iso(ed, ed._ctx); else { ed.iso = !ed.iso; ed.dirty = true; ed.zoomExtents(); } }
      else break;
    }
    var pts = [first];
    try {
      while (true) { ed.preview = function (w) { return [{ t: "railing", pts: pts.concat([w]), lvl: cur(ed), h: h, base: base }]; }; var p = await ed.getPoint("Next point (Enter to finish)", { opt: true, base: pts[pts.length - 1] }); if (p == null) break; if (typeof p === "string") continue; pts.push(p); }
    } finally { ed.preview = null; ed.wpZ = null; ed.dirty = true; }
    if (pts.length > 1) ed.doc.add({ t: "railing", pts: pts, h: h, base: base || undefined, lvl: cur(ed), layer: lay(ed, "A-RAIL") });
  });
  cmd("LEVEL", ["LV"], async function (ed) { if (ed.onPanel) ed.onPanel("bim"); });
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
    ed.doc.begin("Place " + def.n); var o = { t: "asset", kind: kind, p: sn ? sn.p : p, rot: sn ? sn.rot : rot, lvl: cur(ed), layer: lay(ed, catLay[def.cat] || "A-ASSET") }; if (kind === "tank") o.cap = 1000;
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
      ed.preview = function (w) { var sn = snapOf(w); return [{ t: "asset", kind: kind, p: sn ? sn.p : w, rot: sn ? sn.rot : rot, sc: sc, cap: cap, lvl: cur(ed) }]; };
      var p = await ed.getPoint("Place " + def.n + (def.cat === "Landscape" || def.mount === "ceiling" ? "" : " — it jumps flush to a wall when close") + " (Enter to finish)", { opt: true, kw: ["Turn", "Rotate", "Scale", "Wallsnap"] }); ed.preview = null;
      if (p == null) break;
      if (p === "Turn") { rot = ed.astRot = (rot + 90) % 360; continue; }   // quarter turn
      if (p === "Rotate") { rot = ed.astRot = await ed.getNum("Rotation (degrees)", { def: rot }); continue; }
      if (p === "Scale") { sc = await ed.getNum("Scale (1 = standard size)", { def: sc }); continue; }
      if (p === "Wallsnap") { ed.set.astSnap = ed.set.astSnap === false; ed.say(ed.set.astSnap ? "Items jump to walls." : "Items stay exactly where you click."); continue; }
      var sn = snapOf(p), o = { t: "asset", kind: kind, p: sn ? sn.p : p, rot: sn ? sn.rot : rot, lvl: cur(ed), layer: layer }; if (sc !== 1) o.sc = sc; if (kind === "tank") o.cap = cap; ed.doc.add(o); n++;
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
