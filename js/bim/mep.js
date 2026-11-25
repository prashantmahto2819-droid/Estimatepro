/* Estimate Pro BIM — MEP drawings, part 1: the electrical layout.
   - Settings of the drawing (ELECSET): d.mep = { on, grp "A"|"B"|"C", cond "pvc"|"steel", sw "mod"|"piano", ckt "1.5"|"2.5"|"4",
     sym (IS symbols on plan), rccb }. CPWD DSR (E&M) 2022 point wiring is priced per point by building group:
     A = Type I–III quarters, B = Type IV quarters and above, C = non-residential buildings.
   - ewire { t:"ewire", a, b (ids of library items), k "pt" (switch board → point) | "ckt" (DB → switch board, circuit / sub-main)
     | "pwr" (DB or board → 16 A power socket), c (circuit name), bend ±1, lvl } — drawn as an arc that follows the two items.
   - Commands: ELECSET, WIRE (by hand), WIREAUTO (whole floor), and SCHEDULE → Electrical (legend + DB schedule).
   - Quantities, once electrical layout is on: every light / fan / exhaust / bell / 6 A socket counts as a point wiring of the chosen
     group, conduit and switch type; 6 A and 16 A socket boxes, power plug wiring and circuit wiring in metres (with the drops from
     the ceiling run to each board), MCB DB by ways, MCBs, incomer, RCCB and earth pits. Without the setting nothing changes. */
(function () {
  "use strict";
  var EP = window.EP, CAD = EP.cad, G = EP.geom, B = EP.bim; if (!B || !CAD || !B.ASSET_LIB || !B.EXT || !B.EXT.asset) return;
  var A = B.ASSET_LIB, TAU = Math.PI * 2, X0 = B.EXT.asset;
  var cmd = function (n, a, f) { CAD.commands[n] = { fn: f }; (a || []).forEach(function (x) { CAD.aliases[x] = n; }); };

  /* ---------- settings ---------- */
  var DEF = { on: true, grp: "A", cond: "pvc", sw: "mod", ckt: "1.5", sym: true, rccb: true };
  function mep(d) { return d && d.mep && d.mep.on ? Object.assign({}, DEF, d.mep) : null; }
  B.mepOf = mep;
  function scaleOf(d) { return (d.layouts && d.layouts[0] && d.layouts[0].scale) || (d.sheet && d.sheet.scale) || 100; }

  /* ---------- new library items ---------- */
  function circ(c, r) { return { k: "A", c: c, r: r, s: 0, e: TAU, full: true }; }
  function L(a, b) { return { k: "L", a: a, b: b }; }
  if (!A.earth_pit) A.earth_pit = { n: "Earth pit (pipe / plate earthing)", cat: "Electrical", w: 450, d: 450, h: 80, key: "earth_pit",
    sym: function (X) { return [circ(X([0, 0]), 225 * X.s), L(X([0, 150]), X([0, 0])), L(X([-120, 0]), X([120, 0])), L(X([-80, -45]), X([80, -45])), L(X([-40, -90]), X([40, -90]))]; },
    mesh: function (M, X, z0, LK, H) { H.box(M, X([0, 0]), 450 * X.s, 450 * X.s, X.r, z0 - 20, z0 + 60, LK("cast_iron")); } };
  if (!A.meter_board) A.meter_board = { n: "Meter board (energy meter + main switch)", cat: "Electrical", w: 450, d: 100, h: 450, mount: "wall", mz: 1800, key: "meter_board",
    sym: function (X) { return G.polySegs(B.rectAt(X([0, 0]), 450 * X.s, 100 * X.s, X.r), true).concat([circ(X([0, 0]), 40 * X.s)]); },
    mesh: function (M, X, z0, LK, H) { H.box(M, X([0, 0]), 450 * X.s, 100 * X.s, X.r, z0, z0 + 450, LK("plastic_white")); } };
  B.MAP.earth_pit = B.MAP.earth_pit || { c: [["em22", "5.2"]], q: /earthing with G\.I\. earth pipe/i, books: ["em22"] };
  B.MAP.meter_board = B.MAP.meter_board || { q: /meter board|energy meter/i, books: ["em22"] };

  /* ---------- what each library item is for wiring ---------- */
  /* L light, F fan, X exhaust fan, BL call bell, S 6 A socket, P 16 A power socket, TV tv / data, SB switch board, R fan regulator,
     DB distribution board, MB meter board, E earth pit, AC air-conditioner */
  var LOAD = { L: 60, F: 60, X: 60, BL: 10, S: 100, P: 1000, TV: 50 };
  function cls(e) {
    if (!e || e.t !== "asset") return null; var k = e.kind, def = A[k]; if (!def) return null; var key = def.key;
    if (k === "fan_regulator") return "R"; if (k === "call_bell") return "BL"; if (k === "tv_point") return "TV"; if (k === "earth_pit") return "E"; if (k === "meter_board") return "MB";
    if (k === "socket_15a") return +e.amp === 6 ? "S" : "P"; if (k === "ac_split") return "AC";
    if (key === "light_point" || k === "exit_sign") return "L"; if (key === "fan") return "F"; if (key === "exhaust_fan") return "X";
    if (key === "switchboard") return "SB"; if (key === "socket") return +e.amp === 16 ? "P" : "S"; if (key === "db" || k === "mdb_panel") return "DB";
    return null;
  }
  B.eclass = cls;
  var POINT = { L: 1, F: 1, X: 1, BL: 1, S: 1 };
  var NAME = { L: "Light point", F: "Ceiling / wall fan point", X: "Exhaust fan point", BL: "Call bell point", S: "6 A socket outlet (light plug)", P: "16 A power socket", TV: "TV / data outlet",
    SB: "Switch board", R: "Fan regulator", DB: "Distribution board (MCB DB)", MB: "Meter board", E: "Earth pit", AC: "Air-conditioner point" };
  function zOf(doc, e) { var def = A[e.kind] || {}; if (e.z != null) return +e.z; if (def.mount === "ceiling") { var Lv = B.level(doc.d, e.lvl); return Lv ? Lv.h : 3000; } return def.mz != null ? def.mz : 0; }

  /* ---------- IS-style symbols (paper size, so they read the same at any scale) ---------- */
  function sym(c, e, N) {
    var R = 2 * N, a = (e.rot || 0) * Math.PI / 180, cs = Math.cos(a), sn = Math.sin(a), p = e.p, T = function (q) { return [p[0] + q[0] * cs - q[1] * sn, p[1] + q[0] * sn + q[1] * cs]; };
    var segs = [], fill = [], lab = null, arc = function (cx, cy, r, s, en) { segs.push({ k: "A", c: T([cx, cy]), r: r, s: s + a, e: en + a }); }, ln = function (x0, y0, x1, y1) { segs.push(L(T([x0, y0]), T([x1, y1]))); },
      box = function (w, h, dy) { var q = [[-w / 2, -h / 2 + (dy || 0)], [w / 2, -h / 2 + (dy || 0)], [w / 2, h / 2 + (dy || 0)], [-w / 2, h / 2 + (dy || 0)]].map(T); segs = segs.concat(G.polySegs(q, true)); return q; };
    if (c === "L" && e.kind === "tube") { ln(-3 * R, 0, 3 * R, 0); ln(-3 * R, -0.6 * R, -3 * R, 0.6 * R); ln(3 * R, -0.6 * R, 3 * R, 0.6 * R); }
    else if (c === "L") { segs.push(circ(p, R)); var k = R * 0.707; ln(-k, -k, k, k); ln(-k, k, k, -k); }
    else if (c === "F") { segs.push(circ(p, R)); for (var i = 0; i < 3; i++) { var t = a + i * TAU / 3 + Math.PI / 2; segs.push(L(p, [p[0] + Math.cos(t) * R * 0.9, p[1] + Math.sin(t) * R * 0.9])); segs.push({ k: "A", c: [p[0] + Math.cos(t) * R * 0.55, p[1] + Math.sin(t) * R * 0.55], r: R * 0.3, s: t, e: t + Math.PI }); } }
    else if (c === "X") { box(2.4 * R, 2.4 * R); segs.push(circ(p, R)); for (var j = 0; j < 3; j++) { var u = a + j * TAU / 3 + Math.PI / 2; segs.push(L(p, [p[0] + Math.cos(u) * R * 0.9, p[1] + Math.sin(u) * R * 0.9])); } }
    else if (c === "BL") { arc(0, 0, R, 0, Math.PI); ln(-R, 0, R, 0); segs.push(circ(T([0, -0.35 * R]), 0.25 * R)); }
    else if (c === "S" || c === "P") { arc(0, 0, R, 0, Math.PI); ln(-R, 0, R, 0); ln(0, R, 0, 1.6 * R); if (c === "P") { ln(-0.4 * R, R * 0.92, -0.4 * R, 1.6 * R); ln(0.4 * R, R * 0.92, 0.4 * R, 1.6 * R); var fp = []; for (var m = 0; m <= 12; m++) { var ang = m / 12 * Math.PI; fp.push(T([Math.cos(ang) * R, Math.sin(ang) * R])); } fill.push({ pts: fp, col: "rgba(20,20,20,.75)" }); } }
    else if (c === "SB") { var q = box(3 * R, 1.4 * R); fill.push({ pts: [q[0], q[1], q[2]], col: "rgba(20,20,20,.7)" }); }
    else if (c === "R") { box(1.6 * R, 1.6 * R); lab = "R"; }
    else if (c === "DB") { var qd = box(4 * R, 2 * R); fill.push({ pts: qd, col: "rgba(20,20,20,.8)" }); lab = "DB"; }
    else if (c === "MB") { box(4 * R, 2 * R); lab = "MB"; }
    else if (c === "TV") { box(2.4 * R, 1.4 * R); lab = "TV"; }
    else if (c === "AC") { box(3 * R, 1.6 * R); lab = "AC"; }
    else if (c === "E") { ln(0, 1.2 * R, 0, 0); ln(-R, 0, R, 0); ln(-0.65 * R, -0.4 * R, 0.65 * R, -0.4 * R); ln(-0.3 * R, -0.8 * R, 0.3 * R, -0.8 * R); }
    return { segs: segs, fill: fill, dashed: [], lab: lab, R: R };
  }
  B.esym = sym;

  /* plan and labels of library items: IS symbols while the electrical layout shows them */
  var plan0 = X0.plan, labels0 = X0.labels, qty0 = X0.qty;
  var EMPTY = function () { return { segs: [], fill: [], dashed: [] }; };
  function view(d) { return B._mepViewOv || (d && d.mep && d.mep.view) || "all"; }   /* all | E (electrical layout) | P (plumbing layout) | B (building only) */
  B.mepView = view;
  function hideE(d) { var v = view(d); return v === "P" || v === "B"; }
  function hideP(d) { var v = view(d); return v === "E" || v === "B"; }
  X0.plan = function (doc, e) { if (hideE(doc.d) && cls(e) && cls(e) !== "AC") return EMPTY(); var m = mep(doc.d), c = m && m.sym ? cls(e) : null; if (!c) return plan0.apply(this, arguments); var s = sym(c, e, scaleOf(doc.d)); return { segs: s.segs, fill: s.fill, dashed: [] }; };
  X0.labels = function (doc, e, h) { if (hideE(doc.d) && cls(e) && cls(e) !== "AC") return []; var out = labels0.apply(this, arguments) || [], m = mep(doc.d), c = m && m.sym ? cls(e) : null; if (!c) return out; var N = scaleOf(doc.d), s = sym(c, e, N);
    if (s.lab) out = out.concat([{ p: e.p, s: s.lab, h: 1.6 * N, al: "cm" }]); if (e.ckt && (c === "SB" || c === "P")) out = out.concat([{ p: [e.p[0], e.p[1] - 3.4 * N], s: e.ckt, h: 1.6 * N, al: "cm" }]); return out; };

  /* ---------- CPWD DSR (E&M) 2022 codes ---------- */
  function code(m, what, extra) {
    var mod = m.sw !== "piano", st = m.cond === "steel", g = { A: 1, B: 2, C: 3 }[m.grp] || 1;
    if (what === "pt") return (st ? (mod ? "1.3." : "1.1.") : (mod ? "1.10." : "1.8.")) + g;
    if (what === "twin") return st ? (mod ? "1.4" : "1.2") : (mod ? "1.11" : "1.9");
    if (what === "s6") return mod ? "1.31" : "1.29"; if (what === "s16") return mod ? "1.32" : "1.30";
    if (what === "pwr") return st ? "1.5" : "1.12";
    if (what === "ckt") return (st ? "1.7." : "1.14.") + ({ "1.5": 1, "2.5": 2, "4": 3, "6": 4 }[extra || m.ckt] || 1);
    if (what === "tv") return mod ? "1.24.7" : "1.23.7"; if (what === "reg") return "1.25"; if (what === "bell") return "1.38";
    if (what === "db") return "2.3." + ({ 6: 1, 8: 2, 12: 3, 16: 4 }[extra] || 1); if (what === "mcb") return "2.10.1"; if (what === "inc") return "2.10.3"; if (what === "rccb") return "2.14.2";
    return null;
  }
  function key(c) { var k = "em_" + c.replace(/\./g, "_"); if (!B.MAP[k]) B.MAP[k] = { c: [["em22", c]], books: ["em22"] }; return k; }
  var GRP = { A: "Group A (Type I–III quarters)", B: "Group B (Type IV and above)", C: "Group C (non-residential)" };
  function desc(m) { return (m.cond === "steel" ? "steel" : "PVC") + " conduit, " + (m.sw === "piano" ? "piano" : "modular") + " switch, " + GRP[m.grp]; }

  /* ---------- the wires ---------- */
  function arcOf(pa, pb, bend) {
    var d = G.dist(pa, pb); if (d < 1) return null; var u = [(pb[0] - pa[0]) / d, (pb[1] - pa[1]) / d], n = [-u[1], u[0]], s = 0.16 * d * (bend || 1), h = d / 2, r = (h * h + s * s) / (2 * Math.abs(s)),
      m = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2], apex = [m[0] + n[0] * s, m[1] + n[1] * s], c = [apex[0] - n[0] * r * Math.sign(s), apex[1] - n[1] * r * Math.sign(s)],
      a1 = Math.atan2(pa[1] - c[1], pa[0] - c[0]), a2 = Math.atan2(pb[1] - c[1], pb[0] - c[0]), am = Math.atan2(apex[1] - c[1], apex[0] - c[0]), norm = function (x) { x %= TAU; return x < 0 ? x + TAU : x; };
    var ccw = norm(am - a1) < norm(a2 - a1), sa = ccw ? a1 : a2, ea = ccw ? a2 : a1, span = norm(ea - sa);
    return { seg: { k: "A", c: c, r: r, s: sa, e: ea }, apex: apex, len: r * span };
  }
  B.TYPES.ewire = 1;
  function ends(doc, e) { var a = doc.get ? doc.get(e.a) : null, b = doc.get ? doc.get(e.b) : null; return a && b && a.p && b.p ? [a, b] : null; }
  function wireLen(doc, e) { var ab = ends(doc, e); if (!ab) return null; var ar = arcOf(ab[0].p, ab[1].p, e.bend), Lv = B.level(doc.d, ab[0].lvl), Hc = (Lv ? Lv.h : 3000) - 150;
    var dr = Math.max(0, Hc - zOf(doc, ab[0])) + Math.max(0, Hc - zOf(doc, ab[1])); return { run: ar ? ar.len : 0, drop: dr, tot: (ar ? ar.len : 0) + dr }; }
  B.EXT.ewire = {
    plan: function (doc, e) { var out = { segs: [], fill: [], dashed: [] }, ab = ends(doc, e); if (hideE(doc.d)) return out; if (!ab) return out; var ar = arcOf(ab[0].p, ab[1].p, e.bend); if (!ar) return out;
      (e.k === "pwr" ? out.dashed : out.segs).push(ar.seg);
      if (e.k === "ckt") { var N = scaleOf(doc.d), t = 0.8 * N, mid = ar.apex, dir = G.norm(G.sub(ab[1].p, ab[0].p)), nn = [-dir[1], dir[0]]; for (var i = -1; i <= 1; i++) { var q = G.add(mid, G.mul(dir, i * 0.7 * N)); out.segs.push(L(G.add(q, G.mul(G.add(nn, dir), t)), G.sub(q, G.mul(G.add(nn, dir), t)))); } }
      return out; },
    labels: function (doc, e, h) { if (!e.c || e.k === "pt" || hideE(doc.d)) return []; var ab = ends(doc, e); if (!ab) return []; var ar = arcOf(ab[0].p, ab[1].p, e.bend); if (!ar) return []; var N = scaleOf(doc.d), dir = G.norm(G.sub(ab[1].p, ab[0].p));
      return [{ p: G.add(ar.apex, G.mul([-dir[1], dir[0]], 2.2 * N * (e.bend || 1))), s: e.c, h: 1.6 * N, al: "cm" }]; },
    xform: function (e) { return JSON.parse(JSON.stringify(e)); },
    qty: function (doc, e) { var m = mep(doc.d); if (!m || e.k === "pt") return []; var w = wireLen(doc, e); if (!w) return []; var ab = ends(doc, e), z = ab[0].lvl ? B.below(doc.d, ab[0].lvl) : "super", f = (w.run / 1000).toFixed(2) + " m run + " + (w.drop / 1000).toFixed(2) + " m drops";
      if (e.k === "pwr") return [{ k: key(code(m, "pwr")), dim: "L", v: w.tot, label: "Power plug wiring 2 × 4 + 1 × 4 sq mm" + (e.c ? " (" + e.c + ")" : "") + " — " + (m.cond === "steel" ? "steel" : "PVC") + " conduit", f: f, z: z }];
      return [{ k: key(code(m, "ckt", e.sz)), dim: "L", v: w.tot, label: "Circuit wiring 2 × " + (e.sz || m.ckt) + " + 1 × " + (e.sz || m.ckt) + " sq mm earth" + (e.c ? " (" + e.c + ")" : "") + " — " + (m.cond === "steel" ? "steel" : "PVC") + " conduit", f: f, z: z }]; }
  };

  /* ---------- quantities of the items once the electrical layout is on ---------- */
  function dbCircuits(doc, db) { var cs = {}; doc.d.ents.forEach(function (w) { if (w.t === "ewire" && w.a === db.id && (w.k === "ckt" || w.k === "pwr")) cs[w.c || w.id] = 1; }); return Object.keys(cs).length; }
  X0.qty = function (doc, e) {
    var rows = qty0.apply(this, arguments), m = mep(doc.d), c = m ? cls(e) : null; if (!c || e.noq === true) return rows;
    var z = e.lvl ? B.below(doc.d, e.lvl) : "super", drop = { light_point: 1, fan_point: 1, switchboard: 1, socket: 1, db: 1 }, keep = rows.filter(function (r) { return !drop[r.k]; });
    var push = function (cd, lab, f, n) { keep.push({ k: key(cd), dim: "N", v: n || 1, label: lab, f: f || "1 no.", z: z }); };
    if (POINT[c]) push(code(m, e.twin ? "twin" : "pt"), (e.twin ? "Twin-control light point" : NAME[c]) + " — point wiring, " + desc(m), "1 point");
    if (c === "S") push(code(m, "s6"), "6 A socket outlet with switch in box (" + (m.sw === "piano" ? "piano" : "modular") + ")");
    if (c === "P") push(code(m, "s16"), "16 A socket outlet with switch in box (" + (m.sw === "piano" ? "piano" : "modular") + ")");
    if (c === "BL") push(code(m, "bell"), "Call bell / buzzer");
    if (c === "TV") push(code(m, "tv"), "TV / data socket outlet");
    if (c === "R" && m.sw !== "piano") push(code(m, "reg"), "Electronic fan regulator (modular)");
    if (c === "DB") { var n = dbCircuits(doc, e); if (!n) n = Math.max(2, e.ways ? +e.ways - 2 : 4); var ways = [6, 8, 12, 16].filter(function (x) { return x >= n + 2; })[0] || 16;
      push(code(m, "db", ways), ways + " way SPN MCB distribution board (double door)", n + " circuits + spare → " + ways + " ways");
      push(code(m, "mcb"), "MCB single pole, outgoing circuits", n + " nos", n); push(code(m, "inc"), "MCB double pole, incomer");
      if (m.rccb) push(code(m, "rccb"), "RCCB double pole 40 A, 30 mA"); }
    return keep;
  };

  /* ---------- layers ---------- */
  var LAY = { "E-WIRE": { color: 1, lw: 0.25, lt: "CONTINUOUS" }, "E-POINT": { color: 5, lw: 0.25, lt: "CONTINUOUS" }, "E-SCHED": { color: 7, lw: 0.18, lt: "CONTINUOUS" } };
  function ensureLayers(ed) { var Ls = ed.doc.d.layers, miss = Object.keys(LAY).filter(function (k) { return !Ls[k]; }); if (!miss.length) return; var Lc = CAD.clone(Ls); miss.forEach(function (k) { Lc[k] = Object.assign({ on: true, lock: false, frz: false }, LAY[k]); }); ed.doc.set("layers", Lc); }
  function turnOn(ed) { if (mep(ed.doc.d)) return; ed.doc.set("mep", Object.assign({}, DEF, ed.doc.d.mep || {}, { on: true })); }
  function curLvl(ed) { var b = B.ensure(ed.doc.d); return b.cur; }

  /* ---------- ELECSET ---------- */
  cmd("ELECSET", ["ELECTRICAL", "EWIRESET", "MEPSET"], async function (ed) {
    var m = Object.assign({}, DEF, ed.doc.d.mep || {}, { on: true }), say = function () { return "Electrical layout — " + GRP[m.grp] + " · " + (m.cond === "steel" ? "steel" : "PVC") + " conduit · " + (m.sw === "piano" ? "piano" : "modular") + " switches · circuit cable 2 × " + m.ckt + " sq mm · symbols " + (m.sym ? "IS" : "drawn") + " · RCCB " + (m.rccb ? "yes" : "no") + ". Change:"; };
    for (;;) {
      var k = await ed.getKw(say(), ["Group", "Conduit", "Switch", "Cable", "Symbols", "RCCB", "Off", "Done"], "Done");
      if (!k || k === "Done") break;
      if (k === "Group") m.grp = await ed.getKw("Building group: A = Type I–III quarters, B = Type IV quarters and above, C = non-residential", ["A", "B", "C"], m.grp);
      if (k === "Conduit") m.cond = (await ed.getKw("Conduit", ["PVC", "Steel"], m.cond === "steel" ? "Steel" : "PVC")) === "Steel" ? "steel" : "pvc";
      if (k === "Switch") m.sw = (await ed.getKw("Switches", ["Modular", "Piano"], m.sw === "piano" ? "Piano" : "Modular")) === "Piano" ? "piano" : "mod";
      if (k === "Cable") m.ckt = await ed.getKw("Circuit wiring (DB to switch boards), sq mm", ["1.5", "2.5", "4"], m.ckt);
      if (k === "Symbols") m.sym = (await ed.getKw("Electrical items on the plan", ["IS", "Drawn"], m.sym ? "IS" : "Drawn")) === "IS";
      if (k === "RCCB") m.rccb = (await ed.getKw("RCCB (30 mA) in each DB", ["Yes", "No"], m.rccb ? "Yes" : "No")) === "Yes";
      if (k === "Off") { ed.doc.set("mep", Object.assign({}, m, { on: false })); ed.say("Electrical layout is off: items are drawn and counted as before. ELECSET turns it on again."); return; }
    }
    ensureLayers(ed); ed.doc.set("mep", m); ed.say(say().replace(/ Change:$/, "") + " — quantities follow these settings.");
  });

  /* ---------- WIRE (by hand) ---------- */
  function pickable(e) { return !!cls(e); }
  function nextCkt(doc, pre) { var n = 0; doc.d.ents.forEach(function (w) { if (w.t === "ewire" && w.c && w.c.indexOf(pre) === 0) n = Math.max(n, +w.c.slice(pre.length) || 0); }); return pre + (n + 1); }
  cmd("WIRE", ["EWIRE", "WIRING", "CIRCUIT"], async function (ed) {
    ensureLayers(ed); turnOn(ed);
    var pk = await ed.getEnt("Click the start: a distribution board (DB) or a switch board", { filter: function (e) { var c = cls(e); return c === "DB" || c === "SB"; } }); if (!pk || !pk.e) return;
    var src = pk.e, ckt = null, made = 0, bend = 1;
    for (;;) {
      var sc = cls(src), q = await ed.getEnt((sc === "DB" ? "DB: click a switch board (circuit) or a 16 A socket (power circuit)" : "Switch board: click each light, fan, socket or bell it controls") + " — Enter to finish", { allowNone: true, kw: ["From", "Flip", "Circuit"], filter: pickable });
      if (q === "From") { var f = await ed.getEnt("Click the new start (DB or switch board)", { filter: function (e) { var c = cls(e); return c === "DB" || c === "SB"; } }); if (f && f.e) src = f.e; continue; }
      if (q === "Flip") { bend = -bend; ed.say("New wires bend the other way."); continue; }
      if (q === "Circuit") { ckt = await ed.getText("Circuit name for the next wires (for example C3)", { def: ckt || nextCkt(ed.doc, "C") }); continue; }
      if (!q || !q.e) break; var t = q.e, tc = cls(t);
      if (t.id === src.id) continue;
      var k = sc === "DB" ? (tc === "P" ? "pwr" : "ckt") : (tc === "SB" ? "ckt" : tc === "P" ? "pwr" : "pt"), c = null;
      if (k === "pwr") c = sc === "DB" ? nextCkt(ed.doc, "P") : (src.ckt || nextCkt(ed.doc, "P")); else if (k === "ckt") { c = ckt || (sc === "SB" && src.ckt) || nextCkt(ed.doc, "C"); ckt = c; }
      ed.doc.begin("Wire"); try {
        ed.doc.add({ t: "ewire", a: src.id, b: t.id, k: k, c: c || undefined, bend: bend, lvl: src.lvl, layer: "E-WIRE" });
        if (c && (tc === "SB" || tc === "P")) { var o = CAD.clone(t); o.ckt = c; ed.doc.mod(t.id, o); }
      } finally { ed.doc.commit(); }
      made++;
    }
    if (made) ed.say(made + " wire" + (made > 1 ? "s" : "") + " drawn. Point wiring is counted per point; circuit and power wiring in metres (with drops to each board).");
  });

  /* ---------- WIREAUTO (a whole floor) ---------- */
  cmd("WIREAUTO", ["AUTOWIRE", "WIRINGAUTO"], async function (ed, o) {
    o = o || {}; var doc = ed.doc, d = doc.d, lv = o.lvl !== undefined ? o.lvl : curLvl(ed), items = d.ents.filter(function (e) { return cls(e) && (e.lvl || null) === (lv || null); });
    if (!items.some(function (e) { return cls(e) === "DB"; })) { if (o.auto) return null; ed.say("Place a distribution board first: Site & services → Place → Distribution board. Then run WIREAUTO again."); return; }
    var old = d.ents.filter(function (w) { return w.t === "ewire" && (w.lvl || null) === (lv || null); });
    if (old.length && !o.auto) { var ok = await ed.getKw("Replace the " + old.length + " wires already on this floor?", ["Yes", "No"], "Yes"); if (ok !== "Yes") return; }
    ensureLayers(ed);
    var DBs = items.filter(function (e) { return cls(e) === "DB"; }), SBs = items.filter(function (e) { return cls(e) === "SB"; }), pts = items.filter(function (e) { return POINT[cls(e)]; }), pw = items.filter(function (e) { return cls(e) === "P"; });
    var room = function (e) { var r = B.roomAt ? B.roomAt(doc, e.p, e.lvl) : null; return r ? r.id : null; }, near = function (p, list) { var best = null, bd = Infinity; list.forEach(function (x) { var dd = G.dist(p, x.p); if (dd < bd) { bd = dd; best = x; } }); return best ? { e: best, d: bd } : null; };
    var links = [], noSb = 0, load = {}, cnt = {};
    pts.forEach(function (p) { var rid = room(p), same = SBs.filter(function (s) { return rid && room(s) === rid; }), n = near(p.p, same.length ? same : SBs); if (!n || (!same.length && n.d > 6000)) { noSb++; return; }
      links.push({ a: n.e.id, b: p.id, k: "pt" }); load[n.e.id] = (load[n.e.id] || 0) + (+p.w || LOAD[cls(p)] || 60); cnt[n.e.id] = (cnt[n.e.id] || 0) + 1; });
    /* circuits: CPWD / IS 732 — not more than 10 points or 800 W in a lighting circuit; boards chained from the nearest one outwards */
    var ck = 0, setCkt = {}, used = SBs.filter(function (s) { return cnt[s.id]; });
    DBs.forEach(function (db) {
      var mine = used.filter(function (s) { return near(s.p, DBs).e.id === db.id; }).sort(function (x, y) { return G.dist(x.p, db.p) - G.dist(y.p, db.p); });
      while (mine.length) { ck++; var name = "C" + ck, prev = db, np = 0, wl = 0;
        while (mine.length) { var nx = near(prev.p, mine).e, n2 = cnt[nx.id] || 0, w2 = load[nx.id] || 0; if (np && (np + n2 > 10 || wl + w2 > 800)) break;
          links.push({ a: prev.id, b: nx.id, k: "ckt", c: name }); setCkt[nx.id] = name; np += n2; wl += w2; prev = nx; mine.splice(mine.indexOf(nx), 1); } }
    });
    var pc = 0; pw.forEach(function (s) { var n = near(s.p, DBs); pc++; links.push({ a: n.e.id, b: s.id, k: "pwr", c: "P" + pc }); setCkt[s.id] = "P" + pc; });
    doc.begin("Auto wiring"); try {
      if (!mep(d)) doc.set("mep", Object.assign({}, DEF, d.mep || {}, { on: true }));
      old.forEach(function (w) { doc.del(w.id); });
      links.forEach(function (l, i) { doc.add({ t: "ewire", a: l.a, b: l.b, k: l.k, c: l.c, bend: i % 2 ? -1 : 1, lvl: lv, layer: "E-WIRE" }); });
      Object.keys(setCkt).forEach(function (id) { var o = CAD.clone(doc.get(id)); o.ckt = setCkt[id]; doc.mod(id, o); });
    } finally { doc.commit(); }
    if (o.auto) return { pts: pts.length, sbs: used.length, ckt: ck, pwr: pc, noSb: noSb };
    ed.say(pts.length + " points wired to " + used.length + " switch boards in " + ck + " lighting circuit" + (ck === 1 ? "" : "s") + (pc ? " and " + pc + " power circuit" + (pc === 1 ? "" : "s") : "") + "." + (noSb ? " " + noSb + " point" + (noSb === 1 ? " has" : "s have") + " no switch board in the room — place one and run WIREAUTO again." : "") + " Check with SCHEDULE → Electrical.");
  });

  /* ---------- SCHEDULE → Electrical: legend with symbols + DB schedule ---------- */
  function segEnts(sg, Lr) { if (sg.k === "L") return [{ t: "line", a: sg.a, b: sg.b, layer: Lr }]; if (sg.k === "A" && sg.full) return [{ t: "circle", c: sg.c, r: sg.r, layer: Lr }]; if (sg.k === "A") return [{ t: "arc", c: sg.c, r: sg.r, a1: sg.s * 180 / Math.PI, a2: sg.e * 180 / Math.PI, layer: Lr }]; return []; }
  B.SCH_EXTRA = B.SCH_EXTRA || {};
  B.SCH_EXTRA.Electrical = function (ed, N, table) {
    var doc = ed.doc, d = doc.d, m = mep(d) || DEF, count = {}, ord = ["L", "F", "X", "BL", "S", "P", "TV", "SB", "R", "DB", "MB", "E", "AC"], tube = 0;
    d.ents.forEach(function (e) { var c = cls(e); if (c) { count[c] = (count[c] || 0) + 1; if (e.kind === "tube") tube++; } });
    var rows = ord.filter(function (c) { return count[c]; }).map(function (c) { return ["", NAME[c] + (c === "L" && tube ? " (incl. " + tube + " tube / batten)" : ""), String(count[c]), POINT[c] ? (LOAD[c] + " W") : c === "P" ? "1000 W" : ""]; });
    if (!rows.length) rows = [["", "No electrical items yet — place them with Site & services → Place", "", ""]];
    var T = table("ELECTRICAL LEGEND", ["Symbol", "Description", "Nos", "Load each"], rows, [22, 86, 14, 20], N), rh = 6 * N;
    ord.filter(function (c) { return count[c]; }).forEach(function (c, i) { var y = -(i + 1.5) * rh - 0.6 * N, s = sym(c, { p: [11 * N, y], rot: 0, kind: c === "L" ? "light" : "" }, N * 0.7); s.segs.forEach(function (sg) { T.ents = T.ents.concat(segEnts(sg, "A-SCHED")); });
      s.fill.forEach(function (f) { T.ents.push({ t: "hatch", pat: "SOLID", sc: 1, ang: 0, loops: [f.pts.map(function (p) { return [p[0], p[1], 0]; })], layer: "A-SCHED" }); }); if (s.lab) T.ents.push({ t: "text", p: [11 * N - 1.1 * N, y - 0.6 * N], s: s.lab, h: 1.2 * N, rot: 0, al: "l", layer: "A-SCHED" }); });
    /* DB schedule */
    var drows = [];
    d.ents.filter(function (e) { return cls(e) === "DB"; }).forEach(function (db, di) {
      var ck = {}; d.ents.forEach(function (w) { if (w.t === "ewire" && (w.k === "ckt" || w.k === "pwr") && w.c) { (ck[w.c] = ck[w.c] || { k: w.k, sbs: [], ps: [] }); if (w.k === "pwr") ck[w.c].ps.push(w.b); else ck[w.c].sbs.push(w.b); if (w.a === db.id) ck[w.c].db = 1; } });
      Object.keys(ck).filter(function (c) { return ck[c].db; }).sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); }).forEach(function (c) {
        var o = ck[c], pts = 0, w = 0, tx = {}; if (o.k === "pwr") { pts = 1; w = 1000; tx.P = 1; }
        else o.sbs.forEach(function (sb) { d.ents.forEach(function (x) { if (x.t === "ewire" && x.k === "pt" && x.a === sb) { var t = doc.get(x.b), tcl = cls(t); if (!tcl) return; pts++; w += +t.w || LOAD[tcl] || 60; tx[tcl] = (tx[tcl] || 0) + 1; } }); });
        var mcb = o.k === "pwr" ? "20 A" : (w > 1100 ? "16 A" : w > 700 ? "10 A" : "6 A");
        drows.push([db.name || ("DB" + (di + 1)), c, Object.keys(tx).map(function (k) { return tx[k] + " " + k; }).join(", "), String(pts), w + " W", "MCB SP " + mcb, o.k === "pwr" ? "2 × 4 + 1 × 4" : "2 × " + m.ckt + " + 1 × " + m.ckt]); });
    });
    if (drows.length) { var T2 = table("DB SCHEDULE (L light, F fan, X exhaust, S 6 A socket, P 16 A, BL bell)", ["DB", "Circuit", "Points", "Nos", "Load", "Protection", "Cable sq mm"], drows, [16, 16, 44, 12, 18, 26, 30], N), dy = T.bb[1] - 14 * N;
      T2.ents.forEach(function (en) { var o = JSON.parse(JSON.stringify(en)); ["a", "b", "p", "c"].forEach(function (f) { if (o[f]) o[f] = [o[f][0], o[f][1] + dy]; }); T.ents.push(o); }); T.bb = [T.bb[0], T2.bb[1] + dy, Math.max(T.bb[2], T2.bb[2]), T.bb[3]]; }
    var tl = T.bb[1] - 6 * N; T.ents.push({ t: "text", p: [0, tl], s: "Wiring: " + desc(m) + ". Circuits: not more than 10 points / 800 W each. Earth continuity in every circuit.", h: 2 * N, rot: 0, al: "l", layer: "A-SCHED" });
    return T;
  };

  /* =====================================================================================================================
     Part 2: the plumbing layout. Pipes are the existing pipe runs (t:"run", grp "s") with a service: e.svc
     "cw" cold water · "hw" hot water · "soil" · "waste" · "vent" · "rw" rain water · "drain" (outside, to manholes).
     PLUMB draws them (service → colour, layer, height, material, size); with the plumbing layout on (d.mep.plb) they are drawn
     as service lines with size labels and flow arrows. uPVC bends and tees are counted (CPVC and GI rates include fittings).
     ===================================================================================================================== */
  var RUNS = B.RUNS || {};
  var SVC = {
    cw: { n: "Cold water supply", ab: "CW", col: 5, z: 900, mat: "CPVC", dias: [15, 20, 25, 32], def: 20 },
    hw: { n: "Hot water supply", ab: "HW", col: 1, z: 1050, mat: "CPVC", dias: [15, 20, 25, 32], def: 15 },
    soil: { n: "Soil pipe (from WC)", ab: "SP", col: 30, z: -250, mat: "uPVC", dias: [110], def: 110, flow: 1, slope: 40 },
    waste: { n: "Waste pipe (basin, sink, floor trap)", ab: "WP", col: 3, z: -200, mat: "uPVC", dias: [75, 110], def: 75, flow: 1, slope: 40, dash: 1 },
    vent: { n: "Vent pipe", ab: "VP", col: 6, z: 2700, mat: "uPVC", dias: [75, 110], def: 75, dash: 1 },
    rw: { n: "Rain water pipe", ab: "RWP", col: 4, z: 0, mat: "uPVC", dias: [75, 110], def: 110, flow: 1, dash: 1 },
    drain: { n: "Drain (outside, to manholes)", ab: "D", col: 32, z: -600, mat: "SW", dias: [100, 150, 200], def: 100, flow: 1, slope: 60 }
  };
  B.PSVC = SVC;
  var SVKW = { Cold: "cw", Hot: "hw", Soil: "soil", Waste: "waste", Vent: "vent", Rain: "rw", Drain: "drain" };
  function kindFor(svc, dia) { if (svc === "cw" || svc === "hw") return "pipe_cpvc_" + ([15, 20, 25, 32].filter(function (x) { return x >= dia; })[0] || 32); if (svc === "drain") return "drain_sw_" + ([100, 150, 200].filter(function (x) { return x >= dia; })[0] || 200); return "pipe_rain_" + (dia >= 100 ? 110 : 75); }
  function diaOf(e) { var m = /_(\d+)$/.exec(e.kind || ""); return m ? +m[1] : (+e.dia || 0); }
  function plb(d) { return !!(d && d.mep && d.mep.plb); }
  B.plbOn = plb; B.mepKindFor = kindFor; B.mepEnsureLayers = ensureLayers; B.mepEnsurePLayers = ensurePLayers; B.mepDEF = DEF;
  var PLAY = { "P-CW": 5, "P-HW": 1, "P-SOIL": 30, "P-WASTE": 3, "P-VENT": 6, "P-RW": 4, "P-DRAIN": 32, "P-FIX": 7 };
  function ensurePLayers(ed) { var Ls = ed.doc.d.layers, miss = Object.keys(PLAY).filter(function (k) { return !Ls[k]; }); if (!miss.length) return; var Lc = CAD.clone(Ls); miss.forEach(function (k) { Lc[k] = { on: true, lock: false, frz: false, color: PLAY[k], lw: k === "P-SOIL" || k === "P-DRAIN" ? 0.5 : 0.35, lt: "CONTINUOUS" }; }); ed.doc.set("layers", Lc); }

  /* new library items: traps */
  if (!A.floor_trap) A.floor_trap = { n: "Floor trap / nahani trap 100 mm (with grating)", cat: "Plumbing", w: 150, d: 150, h: 20, key: "floor_trap",
    sym: function (X) { return G.polySegs(B.rectAt(X([0, 0]), 150 * X.s, 150 * X.s, X.r), true).concat([circ(X([0, 0]), 55 * X.s), L(X([-55, 0]), X([55, 0])), L(X([0, -55]), X([0, 55]))]); },
    mesh: function (M, X, z0, LK, H) { H.box(M, X([0, 0]), 150 * X.s, 150 * X.s, X.r, z0 - 5, z0 + 3, LK("steel_ss")); } };
  if (!A.gully_trap) A.gully_trap = { n: "Gully trap with chamber (S.W., 100 mm, outside)", cat: "Plumbing", w: 600, d: 600, h: 100, key: "gully_trap",
    sym: function (X) { return G.polySegs(B.rectAt(X([0, 0]), 600 * X.s, 600 * X.s, X.r), true).concat(G.polySegs(B.rectAt(X([0, 0]), 300 * X.s, 300 * X.s, X.r), true)).concat([L(X([-150, -150]), X([150, 150])), L(X([-150, 150]), X([150, -150]))]); },
    mesh: function (M, X, z0, LK, H) { H.box(M, X([0, 0]), 600 * X.s, 600 * X.s, X.r, z0 - 30, z0 + 60, LK("cast_iron")); } };
  B.MAP.floor_trap = B.MAP.floor_trap || { q: /floor trap|nahani trap/i };
  B.MAP.gully_trap = B.MAP.gully_trap || { c: [["cpwd23", "19.4.1.1"]], q: /gully trap/i };
  ["12.42.5.1", "12.42.5.2", "12.42.4.1", "12.42.4.2"].forEach(function (c) { var k = "cp_" + c.replace(/\./g, "_"); if (!B.MAP[k]) B.MAP[k] = { c: [["cpwd23", c]], books: ["cpwd23"] }; });

  /* geometry of a pipe: bends and tees */
  function bends(e) { var p = e.pts, n = 0; for (var i = 1; i < p.length - 1; i++) { var u = G.norm(G.sub(p[i], p[i - 1])), v = G.norm(G.sub(p[i + 1], p[i])), a = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]))) * 180 / Math.PI; if (a > 30) n++; } if (e.closed && p.length > 2) n++; return n; }
  /* is p on the pipe o, away from its two ends? (joining at an end is a straight joint or a bend, not a tee) */
  function onPipe(p, o, tol) { var P = o.pts, n = P.length; if (G.dist(p, P[0]) <= tol || G.dist(p, P[n - 1]) <= tol) return false;
    for (var i = 0; i < n - 1; i++) { var a = P[i], ab = G.sub(P[i + 1], a), t = ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / Math.max(1e-9, ab[0] * ab[0] + ab[1] * ab[1]); t = Math.max(0, Math.min(1, t)); if (G.dist(p, [a[0] + ab[0] * t, a[1] + ab[1] * t]) <= tol) return true; } return false; }
  var DRN = { soil: 1, waste: 1, vent: 1, rw: 1 };
  function tees(doc, e) { var n = 0, ends2 = [e.pts[0], e.pts[e.pts.length - 1]];
    doc.d.ents.forEach(function (o) { if (o === e || o.t !== "run" || !o.svc || (o.lvl || null) !== (e.lvl || null) || (DRN[o.svc] ? 0 : 1) !== (DRN[e.svc] ? 0 : 1)) return;
      ends2.forEach(function (q) { if (onPipe(q, o, 60)) n++; }); });
    return n; }
  B.pipeFittings = function (doc, e) { return { bends: bends(e), tees: tees(doc, e) }; };

  /* plan, labels and quantities of pipe runs with a service */
  var R0 = B.EXT.run;
  if (R0) {
    var rplan0 = R0.plan, rlab0 = R0.labels, rqty0 = R0.qty;
    R0.plan = function (doc, e) { if (e.svc && hideP(doc.d)) return EMPTY(); if (!e.svc || !SVC[e.svc] || !plb(doc.d)) return rplan0.apply(this, arguments);
      var S = SVC[e.svc], N = scaleOf(doc.d), p = e.pts.map(function (q) { return [q[0], q[1]]; }), segs = G.polySegs(p, !!e.closed), out = { segs: [], fill: [], dashed: [] };
      (S.dash ? out.dashed : out.segs).push.apply(S.dash ? out.dashed : out.segs, segs);
      if (S.flow) for (var i = 0; i < p.length - 1; i++) { var a = p[i], b = p[i + 1], ln = G.dist(a, b); if (ln < 4 * N) continue; var u = G.norm(G.sub(b, a)), nn = [-u[1], u[0]], tip = G.add(a, G.mul(u, ln * 0.62)), back = G.sub(tip, G.mul(u, 1.6 * N));
        out.fill.push({ pts: [tip, G.add(back, G.mul(nn, 0.7 * N)), G.sub(back, G.mul(nn, 0.7 * N))], col: "rgba(20,20,20,.85)" }); out.segs.push(L(G.add(back, G.mul(nn, 0.7 * N)), tip), L(G.sub(back, G.mul(nn, 0.7 * N)), tip)); }
      if (e.svc === "rw" || e.svc === "vent") { var q0 = p[0]; out.segs.push(circ(q0, 1.2 * N)); }   /* down pipe / vent stack seen from above */
      if (+e.mh > 0 && /^drain_/.test(e.kind || "") && B.manholes) B.manholes(doc, e).forEach(function (h) { var hl = (h.dep > 900 ? 1200 : 900) / 2 + 115, hw = (h.dep > 900 ? 900 : 800) / 2 + 115, nn = [-h.u[1], h.u[0]], c = function (x, y) { return [h.p[0] + h.u[0] * x + nn[0] * y, h.p[1] + h.u[1] * x + nn[1] * y]; }, q = [c(-hl, -hw), c(hl, -hw), c(hl, hw), c(-hl, hw)]; for (var k = 0; k < 4; k++) out.segs.push(L(q[k], q[(k + 1) % 4])); out.segs.push(circ(h.p, 250)); });   /* manholes */
      return out; };
    R0.labels = function (doc, e, h) { if (e.svc && hideP(doc.d)) return []; if (!e.svc || !SVC[e.svc] || !plb(doc.d)) return rlab0.apply(this, arguments);
      var S = SVC[e.svc], N = scaleOf(doc.d), p = e.pts, best = 0, bi = 0; for (var i = 0; i < p.length - 1; i++) { var ln = G.dist(p[i], p[i + 1]); if (ln > best) { best = ln; bi = i; } } if (p.length < 2) return [];
      var a = p[bi], b = p[bi + 1], u = G.norm(G.sub(b, a)), nn = [-u[1], u[0]], mid = G.add(G.mul(G.add(a, b), 0.5), G.mul(nn, 2 * N)), ang = Math.atan2(u[1], u[0]) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      return [{ p: mid, s: "Ø" + diaOf(e) + " " + S.ab + (S.slope ? " 1:" + (e.slope || S.slope) : ""), h: 1.8 * N, al: "cm", rot: ang }]; };
    R0.qty = function (doc, e) { var rows = rqty0.apply(this, arguments) || []; if (!e.svc || !DRN[e.svc] || /^drain_/.test(e.kind || "")) return rows;
      var f = B.pipeFittings(doc, e), big = diaOf(e) >= 100, z = e.lvl ? B.below(doc.d, e.lvl) : "super";
      if (f.bends) rows.push({ k: "cp_12_42_5_" + (big ? 2 : 1), dim: "N", v: f.bends, label: "uPVC bend 87.5° " + (big ? 110 : 75) + " mm (" + SVC[e.svc].n.toLowerCase() + ")", f: f.bends + " bend" + (f.bends > 1 ? "s" : ""), z: z });
      if (f.tees) rows.push({ k: "cp_12_42_4_" + (big ? 2 : 1), dim: "N", v: f.tees, label: "uPVC single tee " + (big ? "110 × 110 × 110" : "75 × 75 × 75") + " mm (" + SVC[e.svc].n.toLowerCase() + ")", f: f.tees + " junction" + (f.tees > 1 ? "s" : ""), z: z });
      return rows; };
  }

  /* ---------- PLUMB ---------- */
  cmd("PLUMB", ["PIPENET", "WATERLINE", "SOILPIPE", "WASTEPIPE", "PLUMBING2"], async function (ed) {
    ensurePLayers(ed); var d = ed.doc.d; if (!plb(d)) ed.doc.set("mep", Object.assign({}, d.mep || { on: false }, { plb: true }));
    var names = Object.keys(SVKW), sv = SVKW[await ed.getKw("Which pipe? Cold / Hot water (CPVC), Soil / Waste / Vent / Rain (uPVC), Drain (S.W., outside)", names, names.filter(function (n) { return SVKW[n] === (ed.plSvc || "cw"); })[0])] || "cw"; ed.plSvc = sv;
    var S = SVC[sv], dia = +(await ed.getKw("Size, mm", S.dias.map(String), String((ed.plDia && ed.plDia[sv]) || S.def))) || S.def; ed.plDia = Object.assign({}, ed.plDia || {}, (function () { var o = {}; o[sv] = dia; return o; })());
    var lvl = B.ensure(d).cur, pts = [], kind = kindFor(sv, dia), lay = { cw: "P-CW", hw: "P-HW", soil: "P-SOIL", waste: "P-WASTE", vent: "P-VENT", rw: "P-RW", drain: "P-DRAIN" }[sv];
    var mk = function (P) { return { t: "run", kind: kind, pts: P, side: 1, z: S.z, lvl: lvl, svc: sv, dia: dia, slope: S.slope, layer: lay }; };
    for (;;) {
      var p = await ed.getPoint(pts.length ? "Next point" + (S.flow ? " (draw in the direction of flow)" : "") + " — Enter to finish" : S.n + " Ø" + dia + " — start point" + (S.flow ? " (upstream end)" : ""), { opt: pts.length > 0, base: pts.length ? pts[pts.length - 1] : null, kw: pts.length ? ["Undo"] : [] });
      if (p === "Undo") { pts.pop(); continue; } if (!p || !p.length) break; pts.push([p[0], p[1]]);
      ed.preview = (function (P) { return function (w) { return [mk(P.concat([[w[0], w[1]]]))]; }; })(pts.slice());
    }
    ed.preview = null; if (pts.length < 2) return;
    ed.doc.add(mk(pts)); var ln = B.runLen ? B.runLen({ pts: pts }) : 0;
    ed.say(S.n + " Ø" + dia + " (" + S.mat + ") added, " + (ln / 1000).toFixed(2) + " m." + (S.flow ? " Arrows show the flow; slope 1:" + S.slope + "." : "") + " Height, size and slope are in Properties.");
  });

  /* ---------- SCHEDULE → Plumbing ---------- */
  B.SCH_EXTRA.Plumbing = function (ed, N, table) {
    var doc = ed.doc, d = doc.d, by = {}, fix = {}, fb = 0, ft = 0;
    d.ents.forEach(function (e) {
      if (e.t === "run" && e.svc && SVC[e.svc]) { var k = e.svc + "|" + diaOf(e); by[k] = by[k] || { s: e.svc, d: diaOf(e), L: 0, n: 0, b: 0, t: 0 }; by[k].L += B.runLen ? B.runLen(e) : 0; by[k].n++; var f = B.pipeFittings(doc, e); by[k].b += f.bends; by[k].t += f.tees; fb += f.bends; ft += f.tees; }
      if (e.t === "asset" && A[e.kind]) { var c = A[e.kind].cat; if (c === "Plumbing" || c === "Sanitary ware" || c === "Taps & fittings" || c === "Water supply") fix[A[e.kind].n] = (fix[A[e.kind].n] || 0) + 1; }
    });
    var ord = Object.keys(SVC), keys = Object.keys(by).sort(function (a, b) { var x = by[a], y = by[b]; return ord.indexOf(x.s) - ord.indexOf(y.s) || x.d - y.d; });
    var rows = keys.map(function (k) { var o = by[k], S = SVC[o.s]; return ["", S.n, "Ø" + o.d + " " + S.mat, (o.L / 1000).toFixed(2), DRN[o.s] ? o.b + " / " + o.t : "incl.", S.slope ? "1:" + S.slope : "-"]; });
    if (!rows.length) rows = [["", "No pipes yet — draw them with PLUMB", "", "", "", ""]];
    var T = table("PLUMBING LEGEND AND PIPE SCHEDULE", ["Line", "Service", "Pipe", "Length (m)", "Bends / tees", "Slope"], rows, [22, 62, 26, 22, 24, 16], N), rh = 6 * N;
    keys.forEach(function (k, i) { var S = SVC[by[k].s], y = -(i + 1.5) * rh, x0 = 3 * N, x1 = 19 * N, col = { 5: "#2f6fd6", 1: "#d33", 30: "#b8641e", 3: "#2a9d4b", 6: "#b03bb0", 4: "#1aa3b8", 32: "#8a5a2b" }[S.col];
      if (S.dash) for (var x = x0; x < x1; x += 2.4 * N) T.ents.push({ t: "line", a: [x, y], b: [Math.min(x + 1.4 * N, x1), y], layer: "A-SCHED", color: S.col }); else T.ents.push({ t: "line", a: [x0, y], b: [x1, y], layer: "A-SCHED", color: S.col, lw: 0.5 });
      if (S.flow) T.ents.push({ t: "line", a: [x1 - 1.6 * N, y + 0.7 * N], b: [x1, y], layer: "A-SCHED", color: S.col }, { t: "line", a: [x1 - 1.6 * N, y - 0.7 * N], b: [x1, y], layer: "A-SCHED", color: S.col }); void col; });
    var fr = Object.keys(fix).sort().map(function (n) { return [n, String(fix[n])]; });
    if (fr.length) { var T2 = table("SANITARY FITTINGS AND TRAPS", ["Item", "Nos"], fr, [120, 16], N), dy = T.bb[1] - 14 * N;
      T2.ents.forEach(function (en) { var o = JSON.parse(JSON.stringify(en)); ["a", "b", "p", "c"].forEach(function (f) { if (o[f]) o[f] = [o[f][0], o[f][1] + dy]; }); T.ents.push(o); }); T.bb = [T.bb[0], T2.bb[1] + dy, Math.max(T.bb[2], T2.bb[2]), T.bb[3]]; }
    T.ents.push({ t: "text", p: [0, T.bb[1] - 6 * N], s: "Water supply: CPVC (rates include fittings). Soil, waste, vent and rain water: uPVC, bends and tees counted separately. Drains: S.W. pipes to manholes. Arrows show the flow.", h: 2 * N, rot: 0, al: "l", layer: "A-SCHED" });
    return T;
  };

  /* =====================================================================================================================
     Part 3: more electrical and plumbing — points placed by room (POINTSAUTO), single line diagram with the load calculation,
     plumbing isometric, and conduits in 3D.
     ===================================================================================================================== */

  /* ---------- POINTSAUTO: lights, fans, sockets, exhaust, 16 A points and the switch board, by room name and area ---------- */
  function rtype(r) { var n = String(r.name || "").toLowerCase(); return /toilet|bath|wc|wash|lav/.test(n) ? "wet" : /kitchen|pantry|cook/.test(n) ? "kit" : /store|utility|lobby|passage|corridor|stair|verandah|balcony|porch/.test(n) ? "pass" : "room"; }
  function inward(pts, i) { var a = pts[i], b = pts[(i + 1) % pts.length], u = G.norm(G.sub(b, a)), n = [-u[1], u[0]], m = G.mul(G.add(a, b), 0.5), c = B.polyBox(pts), cc = [(c[0] + c[2]) / 2, (c[1] + c[3]) / 2]; if ((cc[0] - m[0]) * n[0] + (cc[1] - m[1]) * n[1] < 0) n = [-n[0], -n[1]]; return { a: a, b: b, u: u, n: n, m: m, L: G.dist(a, b) }; }
  function rotFor(n) { return Math.round((Math.atan2(n[1], n[0]) * 180 / Math.PI - 90) * 10) / 10; }
  B.mepRoomPlan = function (doc, r) {
    var pts = r.pts, A = B.area(pts) / 1e6, t = rtype(r), bb = B.polyBox(pts), W = bb[2] - bb[0], Hh = bb[3] - bb[1], out = [], cen = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
    var add = function (kind, p, rot, o) { if (G.inPoly(p, pts)) out.push(Object.assign({ kind: kind, p: p, rot: rot || 0 }, o || {})); };
    /* lights on a grid */
    var nL = t === "wet" ? 1 : Math.max(1, Math.round(A / 10)), cols = Math.max(1, Math.round(Math.sqrt(nL * W / Math.max(Hh, 1)))), rows = Math.max(1, Math.ceil(nL / cols)), k = 0;
    for (var iy = 0; iy < rows; iy++) for (var ix = 0; ix < cols && k < nL; ix++, k++) add("light", [bb[0] + W * (ix + 0.5) / cols, bb[1] + Hh * (iy + 0.5) / rows]);
    /* fans */
    if (t === "room" && A >= 6) { if (A > 20) { var lx = W >= Hh; add("fan", lx ? [bb[0] + W / 4, cen[1]] : [cen[0], bb[1] + Hh / 4]); add("fan", lx ? [bb[0] + 3 * W / 4, cen[1]] : [cen[0], bb[1] + 3 * Hh / 4]); } else add("fan", cen); }
    /* edges, the door edge, and wall items */
    var E = pts.map(function (q, i) { return inward(pts, i); }).filter(function (e) { return e.L > 600; }), doorAt = null;
    doc.d.ents.forEach(function (o) { if (doorAt || o.t !== "door" || (o.lvl || null) !== (r.lvl || null) && B.hostOf(doc, o) && (B.hostOf(doc, o).lvl || null) !== (r.lvl || null)) return; var pl = B.place(doc, o); if (!pl) return;
      E.forEach(function (e) { if (doorAt) return; var t2 = ((pl.p[0] - e.a[0]) * e.u[0] + (pl.p[1] - e.a[1]) * e.u[1]), d2 = Math.abs((pl.p[0] - e.a[0]) * e.n[0] + (pl.p[1] - e.a[1]) * e.n[1]); if (t2 > 0 && t2 < e.L && d2 < 400) doorAt = { e: e, t: t2, w: o.w || 900 }; }); });
    var de = doorAt ? doorAt.e : E[0]; if (!de) return out;
    var sbT = doorAt ? (doorAt.t + doorAt.w / 2 + 250 < de.L - 150 ? doorAt.t + doorAt.w / 2 + 250 : doorAt.t - doorAt.w / 2 - 250) : 300;
    add("switchboard", G.add(G.add(de.a, G.mul(de.u, sbT)), G.mul(de.n, 60)), rotFor(de.n) + 0);
    var others = E.filter(function (e) { return e !== de; }).sort(function (a, b) { return b.L - a.L; }), at = function (e, f) { return G.add(G.add(e.a, G.mul(e.u, e.L * f)), G.mul(e.n, 60)); };
    var nS = t === "wet" ? 0 : t === "kit" ? 2 : t === "pass" ? 1 : Math.max(2, Math.round(A / 8));
    for (var s = 0; s < nS; s++) { var e = others[s % Math.max(others.length, 1)] || de; add("socket", at(e, others.length ? (s < others.length ? 0.5 : 0.25) : 0.8), rotFor(e.n)); }
    var n16 = t === "wet" || t === "kit" ? 1 : (t === "room" && A > 12 ? 1 : 0); if (n16 && others[0]) add("socket_15a", at(others[0], 0.8), rotFor(others[0].n));
    if ((t === "wet" || t === "kit") && others.length) { var ex = others[others.length > 1 ? 1 : 0]; add("exhaust_fan", at(ex, 0.5), rotFor(ex.n)); }
    return out;
  };
  cmd("POINTSAUTO", ["EPOINTS", "AUTOPOINTS", "ELECPOINTS"], async function (ed, o) {
    o = o || {}; var doc = ed.doc, d = doc.d, lv = o.lvl !== undefined ? o.lvl : B.ensure(d).cur, rooms = d.ents.filter(function (r) { return r.t === "room" && r.pts && (r.lvl || null) === (lv || null); });
    if (!rooms.length) { if (o.auto) return { n: 0, rooms: 0 }; ed.say("No rooms on this floor — make them with Building → Room (or Fit rooms to walls) and run POINTSAUTO again."); return; }
    var has = function (r) { return d.ents.some(function (e) { return cls(e) && (e.lvl || null) === (lv || null) && G.inPoly(e.p, r.pts); }); }, todo = rooms.filter(function (r) { return !has(r); });
    if (!todo.length) { if (o.auto) return { n: 0, rooms: 0, had: rooms.length }; ed.say("Every room on this floor already has electrical points. Delete them first to place them again."); return; }
    var ok = o.auto ? "Yes" : await ed.getKw("Place lights, fans, sockets, exhaust fans, 16 A points and a switch board in " + todo.length + " room" + (todo.length > 1 ? "s" : "") + " that have none? (by room name: toilet / bath, kitchen, store, others)", ["Yes", "No"], "Yes"); if (ok !== "Yes") return;
    ensureLayers(ed); var n = 0, needDB = !d.ents.some(function (e) { return cls(e) === "DB" && (e.lvl || null) === (lv || null); }), big = todo.slice().sort(function (a, b) { return B.area(b.pts) - B.area(a.pts); })[0], dbP = null;
    doc.begin("Electrical points"); try {
      if (!mep(d)) doc.set("mep", Object.assign({}, DEF, d.mep || {}, { on: true }));
      todo.forEach(function (r) { B.mepRoomPlan(doc, r).forEach(function (it) { doc.add({ t: "asset", kind: it.kind, p: it.p, rot: it.rot, sc: 1, lvl: lv, layer: "E-POINT" }); n++; if (needDB && r === big && it.kind === "switchboard") dbP = it; }); });
      if (needDB && dbP) { var a = dbP.rot * Math.PI / 180, u = [Math.cos(a), Math.sin(a)]; doc.add({ t: "asset", kind: "db", p: G.add(dbP.p, G.mul(u, -700)), rot: dbP.rot, sc: 1, lvl: lv, layer: "E-POINT", name: "DB1" }); n++; }
    } finally { doc.commit(); }
    if (o.auto) return { n: n, rooms: todo.length, db: !!(needDB && dbP) };
    ed.say(n + " electrical items placed in " + todo.length + " room" + (todo.length > 1 ? "s" : "") + (needDB && dbP ? ", with a DB next to the switch board of " + (big.name || "the largest room") : "") + ". Move any of them as you like, then run Auto wiring (WIREAUTO).");
  });

  /* ---------- SCHEDULE → Single line: DB, incomer, outgoing circuits, cables and the load calculation ---------- */
  function circuitsOf(doc, db) {
    var d = doc.d, ck = {}; d.ents.forEach(function (w) { if (w.t === "ewire" && (w.k === "ckt" || w.k === "pwr") && w.c) { (ck[w.c] = ck[w.c] || { k: w.k, sbs: [], ps: [], db: false }); if (w.k === "pwr") ck[w.c].ps.push(w.b); else ck[w.c].sbs.push(w.b); if (w.a === db.id) ck[w.c].db = true; } });
    return Object.keys(ck).filter(function (c) { return ck[c].db; }).sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); }).map(function (c) {
      var o = ck[c], pts = 0, w = 0, tx = {}; if (o.k === "pwr") { pts = 1; w = 1000; tx.P = 1; o.ps.forEach(function (id) { var t = doc.get(id); if (t && +t.w) w = +t.w; }); }
      else o.sbs.forEach(function (sb) { d.ents.forEach(function (x) { if (x.t === "ewire" && x.k === "pt" && x.a === sb) { var t = doc.get(x.b), tc = cls(t); if (!tc) return; pts++; w += +t.w || LOAD[tc] || 60; tx[tc] = (tx[tc] || 0) + 1; } }); });
      return { c: c, k: o.k, pts: pts, w: w, tx: tx, mcb: o.k === "pwr" ? 20 : (w > 1100 ? 16 : w > 700 ? 10 : 6) }; });
  }
  B.mepCircuits = circuitsOf;
  B.SCH_EXTRA["Single line"] = function (ed, N, table) {
    var doc = ed.doc, d = doc.d, m = mep(d) || DEF, ents = [], L = "A-SCHED", T = function (p, s, h, al) { ents.push({ t: "text", p: p, s: s, h: (h || 2) * N, rot: 0, al: al || "l", layer: L }); }, ln = function (a, b, o) { ents.push(Object.assign({ t: "line", a: a, b: b, layer: L }, o || {})); }, rect = function (x, y, w, h) { ln([x, y], [x + w, y]); ln([x + w, y], [x + w, y + h]); ln([x + w, y + h], [x, y + h]); ln([x, y + h], [x, y]); };
    var DBs = d.ents.filter(function (e) { return cls(e) === "DB"; }); if (!DBs.length) return { ents: [{ t: "text", p: [0, 0], s: "No distribution board yet — place one and run WIREAUTO.", h: 2.5 * N, rot: 0, al: "l", layer: L }], bb: [0, -5 * N, 120 * N, 5 * N] };
    var y = 0, x0 = 0, tot = 0, s = N, maxX = 0;
    T([x0, y + 4 * s], "SINGLE LINE DIAGRAM — " + (d.name || "building"), 3.5);
    DBs.forEach(function (db, di) {
      var cs = circuitsOf(doc, db), load = cs.reduce(function (a, c) { return a + c.w; }, 0), md = Math.round(load * 0.75), I = md / (230 * 0.9), inc = [32, 40, 63, 80].filter(function (a) { return a >= 1.25 * I; })[0] || 100, cab = inc <= 32 ? "2 × 6" : inc <= 40 ? "2 × 10" : inc <= 63 ? "2 × 16" : "2 × 25"; tot += load;
      var top = y - 8 * s, cx = x0 + 10 * s;
      T([cx + 2 * s, top + 1 * s], "From the supply / meter board: 230 V, 1 phase, 50 Hz — " + cab + " sq mm Cu + earth", 1.8);
      ln([cx, top], [cx, top - 6 * s]); rect(cx - 2 * s, top - 6 * s, 4 * s, 3 * s); T([cx + 3 * s, top - 5 * s], "Incomer: DP MCB " + inc + " A", 1.8);
      ln([cx, top - 6 * s], [cx, top - 9 * s]); rect(cx - 2 * s, top - 12 * s, 4 * s, 3 * s); ln([cx - 2 * s, top - 12 * s], [cx + 2 * s, top - 9 * s]); if (m.rccb) T([cx + 3 * s, top - 11 * s], "RCCB DP " + inc + " A, 30 mA", 1.8);
      ln([cx, top - 12 * s], [cx, top - 15 * s]);
      var n = Math.max(cs.length, 1), bw = Math.max(40, n * 22) * s, bx = cx - 6 * s; ln([bx, top - 15 * s], [bx + bw, top - 15 * s], { lw: 0.7 }); T([bx + bw + 2 * s, top - 15.5 * s], (db.name || "DB" + (di + 1)) + " — SPN MCB DB, " + ([6, 8, 12, 16].filter(function (w2) { return w2 >= cs.length + 2; })[0] || 16) + " way", 2.2);
      cs.forEach(function (c, i) { var x = bx + 8 * s + i * 22 * s, yb = top - 15 * s; ln([x, yb], [x, yb - 4 * s]); rect(x - 1.5 * s, yb - 7 * s, 3 * s, 3 * s); ln([x - 1.5 * s, yb - 7 * s], [x + 1.5 * s, yb - 4 * s]); ln([x, yb - 7 * s], [x, yb - 12 * s]);
        T([x - 2 * s, yb - 14 * s], c.c, 2.2); T([x - 2 * s, yb - 17 * s], "MCB SP " + c.mcb + " A", 1.6); T([x - 2 * s, yb - 19.5 * s], c.k === "pwr" ? "2×4+4 sq mm" : "2×" + m.ckt + "+" + m.ckt + " sq mm", 1.6);
        T([x - 2 * s, yb - 22 * s], c.w + " W", 1.6); T([x - 2 * s, yb - 24.5 * s], Object.keys(c.tx).map(function (k) { return c.tx[k] + k; }).join(" "), 1.6); });
      if (!cs.length) T([bx + 2 * s, top - 20 * s], "No circuits yet — run WIREAUTO.", 1.8);
      var ly = top - 42 * s; T([x0, ly], "Connected load " + (load / 1000).toFixed(2) + " kW · demand factor 0.75 → maximum demand " + (md / 1000).toFixed(2) + " kW · current " + I.toFixed(1) + " A at pf 0.9 → incomer " + inc + " A, cable " + cab + " sq mm Cu", 2);
      if (md > 7000) T([x0, ly - 4 * s], "Maximum demand over 7 kW: ask the supply company for a three-phase connection and spread the circuits over R, Y and B.", 2);
      maxX = Math.max(maxX, bx + bw + 60 * s); y = ly - 12 * s;
    });
    T([x0, y], "Loads: light / fan / exhaust 60 W, 6 A socket 100 W, 16 A socket 1000 W unless set on the item. MCB: lighting circuits 6–16 A by load, power circuits 20 A. Earth continuity conductor with every circuit.", 1.8);
    return { ents: ents, bb: [0, y - 4 * s, maxX, 8 * s] };
  };

  /* ---------- SCHEDULE → Isometric: pipes at their heights, drops to the fittings, stacks ---------- */
  var ISO = { c: Math.cos(Math.PI / 6), s: Math.sin(Math.PI / 6) };
  B.SCH_EXTRA.Isometric = function (ed, N, table) {
    var doc = ed.doc, d = doc.d, ents = [], Ly = "A-SCHED", pipes = d.ents.filter(function (e) { return e.t === "run" && e.svc && SVC[e.svc] && e.pts && e.pts.length > 1; });
    if (!pipes.length) return { ents: [{ t: "text", p: [0, 0], s: "No plumbing pipes yet — draw them with PLUMB.", h: 2.5 * N, rot: 0, al: "l", layer: Ly }], bb: [0, -5 * N, 120 * N, 5 * N] };
    var P = function (x, y, z) { return [(x - y) * ISO.c, (x + y) * ISO.s + z]; }, all = [], lines = [];
    var fixtures = d.ents.filter(function (e) { return e.t === "asset" && A[e.kind] && /Plumbing|Sanitary|Taps|Water supply/.test(A[e.kind].cat || ""); });
    pipes.forEach(function (e) { var S = SVC[e.svc], Lv = B.level(d, e.lvl), z0 = (Lv ? Lv.elev : 0) + (e.z != null ? +e.z : S.z), sl = S.flow && S.slope ? 1 / (+e.slope || S.slope) : 0, acc = 0, q = [];
      e.pts.forEach(function (p, i) { if (i) acc += G.dist(e.pts[i - 1], p); q.push([p[0], p[1], z0 - acc * sl]); });
      for (var i = 0; i < q.length - 1; i++) lines.push({ a: q[i], b: q[i + 1], col: S.col, lw: e.svc === "soil" || e.svc === "drain" ? 0.5 : 0.35 });
      var top = (Lv ? Lv.elev + Lv.h : 3000);
      if (e.svc === "vent") lines.push({ a: q[0], b: [q[0][0], q[0][1], top + 600], col: S.col, lw: 0.35, lab: "Vent Ø" + diaOf(e) + " to 600 above roof" });
      if (e.svc === "rw") lines.push({ a: [q[0][0], q[0][1], top], b: [q[0][0], q[0][1], Lv ? Lv.elev : 0], col: S.col, lw: 0.35, lab: "RWP Ø" + diaOf(e) });
      [q[0], q[q.length - 1]].forEach(function (end) { fixtures.forEach(function (f) { if (G.dist(f.p, end) > 450) return; var fz = (Lv ? Lv.elev : 0) + (DRN[e.svc] || e.svc === "drain" ? 0 : 900); if (Math.abs(fz - end[2]) < 20) return;
        lines.push({ a: end, b: [end[0], end[1], fz], col: S.col, lw: 0.35, lab: (A[f.kind].n || "").split(" — ")[0].split(" (")[0] }); }); });
      var best = 0, bi = 0; for (var j = 0; j < q.length - 1; j++) { var ln2 = G.dist(q[j], q[j + 1]); if (ln2 > best) { best = ln2; bi = j; } }
      lines.push({ txt: "Ø" + diaOf(e) + " " + S.ab, at: [(q[bi][0] + q[bi + 1][0]) / 2, (q[bi][1] + q[bi + 1][1]) / 2, (q[bi][2] + q[bi + 1][2]) / 2], col: S.col }); });
    lines.forEach(function (l) { if (l.a) { all.push(P(l.a[0], l.a[1], l.a[2]), P(l.b[0], l.b[1], l.b[2])); } });
    var bx = [Infinity, Infinity, -Infinity, -Infinity]; all.forEach(function (p) { G.ext(bx, p); });
    var off = [-bx[0], -bx[3] - 10 * N], tr = function (p) { return [p[0] + off[0], p[1] + off[1]]; };
    lines.forEach(function (l) { if (l.a) { var a = tr(P(l.a[0], l.a[1], l.a[2])), b = tr(P(l.b[0], l.b[1], l.b[2])); ents.push({ t: "line", a: a, b: b, layer: Ly, color: l.col, lw: l.lw }); if (l.lab) ents.push({ t: "text", p: [b[0] + 1 * N, b[1] - 2.5 * N], s: l.lab, h: 1.6 * N, rot: 0, al: "l", layer: Ly, color: l.col }); }
      else if (l.txt) { var tp = tr(P(l.at[0], l.at[1], l.at[2])); ents.push({ t: "text", p: [tp[0] + 1 * N, tp[1] + 1 * N], s: l.txt, h: 1.8 * N, rot: 0, al: "l", layer: Ly, color: l.col }); } });
    ents.push({ t: "text", p: [0, 4 * N], s: "PLUMBING ISOMETRIC — true heights; drains fall at their slope", h: 3 * N, rot: 0, al: "l", layer: Ly });
    var W2 = bx[2] - bx[0], yb = -(bx[3] - bx[1]) - 18 * N;
    ents.push({ t: "text", p: [0, yb], s: "Blue cold water · red hot water · brown soil · green waste · magenta vent · cyan rain water · dark brown drain. Vertical lines: drops to the fittings, vent stacks and rain-water pipes.", h: 1.8 * N, rot: 0, al: "l", layer: Ly });
    return { ents: ents, bb: [0, yb - 4 * N, W2, 8 * N] };
  };
  if (B.SCH_KINDS) ["Single line", "Isometric"].forEach(function (k) { if (B.SCH_KINDS.indexOf(k) < 0) B.SCH_KINDS.push(k); });

  /* ---------- conduits in 3D: up from the board to the ceiling, along the run, down to the point ---------- */
  B.EXT.ewire.mesh = function (M, doc, e, H) {
    if (!mep(doc.d) || hideE(doc.d)) return; var ab = ends(doc, e); if (!ab) return; var ar = arcOf(ab[0].p, ab[1].p, e.bend); if (!ar) return;
    var Lv = B.level(doc.d, ab[0].lvl), el = Lv ? Lv.elev : 0, zc = el + (Lv ? Lv.h : 3000) - 60, w = e.k === "pt" ? 20 : 25, lk = B.LOOKS.pipe_conduit ? B.look("pipe_conduit") : B.look("plastic_white");
    var za = el + zOf(doc, ab[0]), zb = el + zOf(doc, ab[1]), seg = ar.seg, n = 6, pts = [];
    for (var i = 0; i <= n; i++) { var aa = seg.s + (((seg.e - seg.s) % TAU + TAU) % TAU) * i / n, p = [seg.c[0] + seg.r * Math.cos(aa), seg.c[1] + seg.r * Math.sin(aa)]; pts.push(p); }
    if (G.dist(pts[0], ab[0].p) > G.dist(pts[0], ab[1].p)) pts.reverse();
    if (zc - za > 30) H.box(M, ab[0].p, w, w, 0, za, zc, lk); if (zc - zb > 30) H.box(M, ab[1].p, w, w, 0, zb, zc, lk);
    for (var j = 0; j < pts.length - 1; j++) H.boxAlong(M, pts[j], pts[j + 1], w, zc - w, zc, lk);
  };

  /* ---------- Properties panel (ui-assets.js adds these below an item's or pipe's own fields) ---------- */
  B.mepFields = function (e, ed, f, sel) {
    var d = ed.doc.d, h = "";
    if (e.t === "asset") { var c = cls(e); if (!c || c === "AC" || c === "E" || c === "MB") return "";
      h += "<div class='cad-ph'>Electrical layout</div>";
      if (c === "L") h += sel("Switching", "twin", e.twin === true ? "true" : "", [["", "One switch"], ["true", "Twin control (2-way switches)"]]);
      if (e.kind === "socket" || e.kind === "socket_15a" || e.kind === "socket_floor") h += sel("Socket", "amp", c === "P" ? "16" : "6", [["6", "6 A (light plug, wired as a point)"], ["16", "16 A (power, own circuit)"]]);
      if (POINT[c] || c === "P") h += f("Load (W) for the DB schedule", "w", e.w || LOAD[c], "num");
      if (c === "SB" || c === "P") h += f("Circuit", "ckt", e.ckt || "", "text");
      if (c === "DB") h += f("Name of the DB", "name", e.name || "", "text");
      h += "<p class='muted small'>" + (mep(d) ? "Counted as: " + (POINT[c] ? "point wiring, " + desc(mep(d)) : NAME[c]) + ". Settings: ELECSET." : "Electrical layout is off — ELECSET turns it on (IS symbols, point wiring by CPWD groups, DB schedule).") + "</p>";
      return h; }
    if (e.t === "run" && e.svc && SVC[e.svc]) { var S = SVC[e.svc];
      h += "<div class='cad-ph'>Plumbing layout</div>" + sel("Service", "svc", e.svc, Object.keys(SVC).map(function (k) { return [k, SVC[k].n]; }));
      if (S.slope && !/^drain_/.test(e.kind)) h += f("Fall: 1 in …", "slope", e.slope || S.slope, "num");
      var fit = B.pipeFittings(ed.doc, e); h += "<p class='muted small'>" + (DRN[e.svc] ? fit.bends + " bend(s), " + fit.tees + " tee(s) counted. " : "Fittings are included in the CPVC / GI rates. ") + "Size: change the Type above. Draw new pipes with PLUMB.</p>";
      return h; }
    return "";
  };

  /* ---------- MEPVIEW: one drawing, separate electrical and plumbing layouts (plan, sheets, PDF and DXF follow it) ---------- */
  cmd("MEPVIEW", ["MEP", "ELECVIEW", "PLUMBVIEW"], async function (ed) {
    var d = ed.doc.d, cur = { all: "All", E: "Electrical", P: "Plumbing", B: "Building" }[view(d)], k = await ed.getKw("Show on the plan: All services, Electrical layout, Plumbing layout, or the Building only", ["All", "Electrical", "Plumbing", "Building"], cur);
    var v = { All: "all", Electrical: "E", Plumbing: "P", Building: "B" }[k] || "all"; ed.doc.set("mep", Object.assign({}, d.mep || { on: false }, { view: v })); ed.dirty = true;
    ed.say({ all: "All services are shown.", E: "Electrical layout: plumbing pipes are hidden. Sheets, PDF and DXF show the same.", P: "Plumbing layout: electrical points and wires are hidden. Sheets, PDF and DXF show the same.", B: "Building only: electrical points, wires and plumbing pipes are hidden." }[v] + " Quantities always count everything.");
  });

  /* ---------- ribbon ---------- */
  if (CAD.RSEC && CAD.RSEC["Site & services"]) CAD.RSEC["Site & services"].push(["Electrical", ["ELECSET", "WIREAUTO", "WIRE"]]);
  if (CAD.RLABEL) Object.assign(CAD.RLABEL, { POINTSAUTO: "Points by room", MEPVIEW: "Show layout", PLUMB: "Plumbing pipe", ELECSET: "Electrical settings", WIREAUTO: "Auto wiring", WIRE: "Wire / circuit" });
  if (CAD.ICONS) Object.assign(CAD.ICONS, { WIRE: "M5 18a4 4 0 0 1 0-8M5 10c4-6 10-6 14 0M19 10a4 4 0 0 1 0 8M4 18h2M18 18h2", WIREAUTO: "M4 18c3-8 13-8 16 0M8 6l2 3 2-3 2 3 2-3M6 18h1M17 18h1", ELECSET: "M13 3 6 13h5l-1 8 7-10h-5z", PLUMB: "M4 8h7v8h9M4 6v4M20 14v4M8 8V5M14 16v3", MEPVIEW: "M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z", POINTSAUTO: "M4 4h16v16H4zM9 9a3 3 0 1 0 6 0 3 3 0 0 0-6 0M7 17h3M14 17h3" });
})();
