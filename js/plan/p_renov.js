/* Planner — renovation / extension of an existing house: add a floor on top, extend on the ground into the open yard, and
   repair / refresh work. Checks the plot's coverage and FAR after the work, lists what has to be broken first, and gives a rough
   cost; the new floor is laid out by the Building Planner on the footprint of the house and can be built in CAD over the old one.
   The house can be typed in (sizes) or read from one of the user's CAD drawings: its floors, footprint, plot, toilets and structure
   are taken from the drawing, and the build keeps the whole old drawing (as existing) with the new floor on top. */
(function () {
  "use strict";
  var EP = window.EP, U = EP.ui, esc = U.esc, PL = EP.plan, KEY = "ep_plan_renov_v1";
  var S = { pw: 12, pd: 18, bw: 9, bd: 12, floors: 1, struct: "lb", age: 15, toilets: 2, addF: 1, beds: 2, extA: 0, rate: 22000, rep: { paintIn: 1, paintOut: 1, roofWp: 1, floor: 0, toilet: 0, kitchen: 0, wiring: 0, plumbing: 0, doors: 0, plaster: 1 } };
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
  var save = function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  var REP = { paintIn: ["Inside repainting (putty patching + 2 coats)", function (A) { return [3.2 * A * S.floors, "m²", 140]; }], paintOut: ["Outside repainting (weather coat)", function () { return [2 * (+S.bw + +S.bd) * 3.2 * S.floors, "m²", 120]; }],
    roofWp: ["Roof waterproofing (remove old, APP membrane / coba repair)", function () { return [+S.bw * +S.bd, "m²", 650]; }], floor: ["Re-flooring with vitrified tiles (incl. removing the old)", function (A) { return [A * S.floors, "m²", 1570]; }],
    toilet: ["Toilet renovation (tiles, fittings, pipes)", function () { return [+S.toilets, "no.", 120000]; }], kitchen: ["Kitchen renovation (platform, tiles, modular units)", function () { return [1, "no.", 180000]; }],
    wiring: ["Electrical rewiring (concealed, new DB)", function (A) { return [A * S.floors, "m²", 450]; }], plumbing: ["Plumbing replacement (CPVC / uPVC lines)", function () { return [+S.toilets + 1, "point set", 30000]; }],
    doors: ["Doors and windows replacement", function (A) { return [Math.max(4, Math.round(A * S.floors / 10)), "no.", 14000]; }], plaster: ["Plaster repair (about 20 % of the walls)", function (A) { return [0.2 * 3.2 * A * S.floors, "m²", 380]; }] };
  /* read a drawing: the floors that have walls, the top floor's outline, the compound wall (plot), toilets, columns (RCC) */
  var MEM = { list: null, busy: false, msg: "" };
  function readHouse(d) {
    var B = EP.bim, bs = B.ensure(d), lv = (bs.levels || []).slice().sort(function (a, b) { return a.elev - b.elev; }), walls = d.ents.filter(function (e) { return e.t === "wall" && !e.site && !/SITE|DRAIN|ROAD/.test(e.layer || ""); });
    var fl = lv.filter(function (L) { var ws = walls.filter(function (e) { return e.lvl === L.id && !/PARAPET/i.test(e.layer || "") && !(e.h && e.h < 1500); }); return ws.length >= 4 && d.ents.some(function (e) { return e.lvl === L.id && (e.t === "room" || e.t === "door"); }); });
    if (!fl.length) return null; var top = fl[fl.length - 1], tw = walls.filter(function (e) { return e.lvl === top.id; }), xs = [], ys = []; tw.forEach(function (e) { xs.push(e.a[0], e.b[0]); ys.push(e.a[1], e.b[1]); });
    var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys), x1 = Math.max.apply(null, xs), y1 = Math.max.apply(null, ys), site = d.ents.filter(function (e) { return e.t === "wall" && (e.site || /A-SITE/.test(e.layer || "")); }), sx = [], sy = []; site.forEach(function (e) { sx.push(e.a[0], e.b[0]); sy.push(e.a[1], e.b[1]); });
    var r2 = function (v) { return Math.round(v / 10) / 100; };
    return { floors: fl.length, top: top.id, topElev: top.elev + (top.h || 3200), levels: fl.map(function (L) { return L.id; }), x0: x0, y0: y0, bw: r2(x1 - x0), bd: r2(y1 - y0), pw: sx.length ? r2(Math.max.apply(null, sx) - Math.min.apply(null, sx)) : null, pd: sy.length ? r2(Math.max.apply(null, sy) - Math.min.apply(null, sy)) : null,
      toilets: d.ents.filter(function (e) { return e.t === "room" && /toilet|bath|wc|w\.c/i.test(e.name || ""); }).length, rcc: d.ents.some(function (e) { return e.t === "column"; }), fh: Math.round((top.h || 3200)) };
  }
  async function pickDrawing(id) { if (!id) { S.src = null; save(); U.render(); return; } MEM.busy = true; MEM.msg = "Reading the drawing…"; U.render();
    try { var L = await EP.cad.loadDoc(id), h = L && readHouse(L.data); if (!h) { MEM.msg = "No floor with walls and rooms found in that drawing."; S.src = null; }
      else { S.src = { id: id, name: L.meta.name, x0: h.x0, y0: h.y0, top: h.top, topElev: h.topElev, levels: h.levels }; S.bw = h.bw; S.bd = h.bd; S.floors = h.floors; if (h.pw) { S.pw = h.pw; S.pd = h.pd; } if (h.toilets) S.toilets = h.toilets; S.struct = h.rcc ? "rcc" : "lb"; MEM.msg = "Read: " + h.floors + " floor" + (h.floors > 1 ? "s" : "") + ", house " + h.bw + " × " + h.bd + " m" + (h.pw ? ", plot " + h.pw + " × " + h.pd + " m" : "") + ", " + (h.rcc ? "RCC frame" : "load-bearing walls") + (h.toilets ? ", " + h.toilets + " toilet" + (h.toilets > 1 ? "s" : "") : ""); } }
    catch (e) { MEM.msg = "Couldn't open that drawing."; } MEM.busy = false; save(); U.render(); }
  function calc() {
    var A = +S.bw * +S.bd, plotA = +S.pw * +S.pd, R = PL.rulesFor ? PL.rulesFor("mbbl", "res", plotA) : { cov: 60, far: 1.5, h: 12 }, rows = [], warn = [], demo = [], row = function (n, q, u, r) { if (q > 0) rows.push({ n: n, q: q, u: u, r: r, a: q * r }); };
    var newF = S.floors + (S.addF ? +S.addF : 0), footNew = A + (+S.extA || 0), built = A * S.floors + (+S.extA || 0) * S.floors + (S.addF ? A * S.addF : 0), cov = footNew / plotA * 100, far = built / plotA, hgt = newF * 3.2;
    if (cov > R.cov + 0.5) warn.push("Ground coverage after the work " + cov.toFixed(1) + " % — more than the " + R.cov + " % allowed; extend less."); if (far > R.far + 0.01) warn.push("FAR after the work " + far.toFixed(2) + " — more than the " + R.far + " allowed."); if (R.h && hgt > R.h) warn.push("Height " + hgt.toFixed(1) + " m — more than the " + R.h + " m allowed.");
    if (S.addF) {
      if (S.struct === "lb" && S.floors + S.addF > 2) warn.push("A load-bearing house is usually not taken beyond G+1 — a structural engineer must check the walls and the foundation first.");
      if (S.struct === "lb") warn.push("Load-bearing walls: check the wall thickness (230 mm or more), the foundation width and depth, and cracks; add an RCC band (lintel / roof band) on the new floor.");
      else warn.push("RCC frame: see whether the columns were designed for more floors (drawings / starter bars); if not, a structural check is needed and columns may need jacketing.");
      if (S.age > 25) warn.push("The house is " + S.age + " years old — get the concrete tested (rebound hammer / core) before loading it more.");
      demo.push(["Break the parapet wall", 2 * (+S.bw + +S.bd) * 0.9 * 0.115, "m³"], ["Remove the terrace tiles / waterproofing", A, "m²"], ["Remove the stair cabin (mumty) roof, if any", 1, "job"], ["Chip the roof surface where new walls / columns stand", 2 * (+S.bw + +S.bd), "m"]);
      row("Demolition (parapet, terrace finish, mumty) and debris removal", 1, "job", Math.round(A * 220 + 15000));
      row("New floor " + Math.round(A * S.addF) + " m² (" + S.beds + " bed rooms)", A * S.addF, "m²", Math.round(S.rate * 1.08)); row("Strengthening allowance (" + (S.struct === "lb" ? "RCC bands, plinth / foundation check" : "column jacketing if needed") + ")", A * S.addF, "m²", S.struct === "lb" ? 1500 : 1100);
    }
    if (+S.extA > 0) { row("Ground extension " + (+S.extA) + " m² (incl. foundation)", +S.extA * S.floors, "m²", Math.round(S.rate * 1.12)); demo.push(["Open the outer wall where the extension joins (lintel / beam first)", 1, "job"]); }
    Object.keys(REP).forEach(function (k) { if (S.rep[k]) { var q = REP[k][1](A); row(REP[k][0], q[0], q[1], q[2]); } });
    return { A: A, plotA: plotA, R: R, rows: rows, warn: warn, demo: demo, tot: rows.reduce(function (a, r) { return a + r.a; }, 0), cov: cov, far: far, newF: newF };
  }
  /* the new floor: the Building Planner on the footprint of the house (no setbacks) */
  function newFloor() { if (!S.addF || !PL.generate) return null; var T = PL.TYPES.house, v = { beds: +S.beds, attached: Math.max(1, +S.beds - 1), persons: +S.beds + 2, cars: 0, kitchenOpen: 0 };
    try { var its = T.program(v, 1).filter(function (x) { return !x.off && x.key !== "car_park"; }); var r = PL.generate({ type: "house", items: its, plot: { w: +S.bw, d: +S.bd }, rules: { f: 0, r: 0, l: 0, rt: 0, cov: 100, far: 9, h: 30 }, floors: 1, facing: "E", vastu: false, rate: S.rate }); return r && r.opts && r.opts[0] || null; } catch (e) { return null; } }
  var num = function (k, lab, v, st, w) { return '<label style="display:flex;flex-direction:column;gap:2px"><span class="muted small">' + lab + '</span><input class="in small" style="width:' + (w || 90) + 'px" type="number" step="' + (st || 0.1) + '" data-pnf="' + k + '" value="' + v + '"></label>'; };
  PL.MODES.renov = { n: "Renovation", hi: "मरम्मत / बढ़ाव", icon: "🔨", render: function () {
    var c = calc(), nf = newFloor(), inr = function (v) { return "₹ " + Math.round(v).toLocaleString("en-IN"); };
    var h = '<div class="plm" data-plmode-root="renov" style="display:flex;flex-direction:column;gap:14px;max-width:1200px">';
    h += '<div><h1 style="margin:0">Renovation / extension planner <span class="muted" style="font-size:.55em;font-weight:500">पुराने घर में मंज़िल, कमरा जोड़ना, मरम्मत</span></h1><p class="muted" style="margin:4px 0 0">Tell what the house is now and what you want — see whether the rules allow it, what has to be broken first, a rough cost, and the new floor laid out on top.</p></div>';
    h += '<section class="panel" style="padding:12px 14px"><h3 style="margin:0 0 8px">0. Start from <span class="muted small" style="font-weight:400">पुरानी ड्रॉइंग से</span></h3><div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">' +
      (MEM.list ? '<label style="display:flex;flex-direction:column;gap:2px"><span class="muted small">My drawing of the house</span><select class="in small" data-pnsrc><option value="">— type the sizes below —</option>' + MEM.list.map(function (x) { return '<option value="' + esc(x.id) + '"' + (S.src && S.src.id === x.id ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("") + "</select></label>" : '<button type="button" class="btn sec" data-pnlist>' + (S.src ? "Change drawing" : "Use my CAD drawing of the house") + "</button>") +
      '<span class="small' + (S.src ? "" : " muted") + '">' + esc(MEM.busy ? "Reading…" : MEM.msg || (S.src ? "From: " + S.src.name : "Or type the sizes below.")) + "</span></div></section>";
    h += '<section class="panel" style="padding:12px 14px"><h3 style="margin:0 0 8px">1. The house now</h3><div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">' + num("pw", "Plot width m", S.pw) + num("pd", "Plot depth m", S.pd) + num("bw", "House width m", S.bw) + num("bd", "House depth m", S.bd) + num("floors", "Floors now (1 = ground)", S.floors, 1) +
      '<label style="display:flex;flex-direction:column;gap:2px"><span class="muted small">Structure</span><select class="in small" data-pnf="struct"><option value="lb"' + (S.struct === "lb" ? " selected" : "") + '>Load-bearing walls</option><option value="rcc"' + (S.struct === "rcc" ? " selected" : "") + ">RCC frame</option></select></label>" + num("age", "Age (years)", S.age, 1) + num("toilets", "Toilets", S.toilets, 1) + "</div></section>";
    h += '<section class="panel" style="padding:12px 14px"><h3 style="margin:0 0 8px">2. What to do</h3><div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">' + num("addF", "Floors to add on top (0 = none)", S.addF, 1, 110) + num("beds", "Bed rooms on the new floor", S.beds, 1, 110) + num("extA", "Ground extension m² (0 = none)", S.extA, 1, 110) + num("rate", "Rate ₹/m² (new work)", S.rate, 500, 110) + "</div>" +
      '<div class="small" style="margin-top:8px">' + Object.keys(REP).map(function (k) { return '<label style="margin-right:12px;white-space:nowrap"><input type="checkbox" data-pnrep="' + k + '"' + (S.rep[k] ? " checked" : "") + "> " + esc(REP[k][0]) + "</label>"; }).join("") + "</div></section>";
    h += '<section class="panel" style="padding:12px 14px"><h3 style="margin:0 0 8px">3. Rules, work and cost</h3><div class="small">Plot ' + c.plotA.toFixed(0) + " m² · after the work: coverage <b>" + c.cov.toFixed(1) + " %</b> (allowed " + c.R.cov + " %) · FAR <b>" + c.far.toFixed(2) + "</b> (allowed " + c.R.far + ") · " + (c.newF === 1 ? "ground floor" : "G+" + (c.newF - 1)) + "</div>" +
      (c.warn.length ? '<ul class="small" style="margin:6px 0;color:var(--bad,#b42318)">' + c.warn.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") + "</ul>" : "") +
      (c.demo.length ? '<h3 style="margin:10px 0 4px;font-size:1em">To break / remove first</h3><ul class="small" style="margin:0">' + c.demo.map(function (d) { return "<li>" + esc(d[0]) + (d[2] !== "job" ? " — about " + d[1].toFixed(1) + " " + d[2] : "") + "</li>"; }).join("") + "</ul>" : "") +
      '<div style="overflow-x:auto;margin-top:8px"><table class="tbl" style="width:100%;font-size:13px;border-collapse:collapse"><tr><th style="text-align:left">Work</th><th>Qty</th><th>Unit</th><th>Rate ₹</th><th>Amount ₹</th></tr>' + c.rows.map(function (r) { return "<tr><td>" + esc(r.n) + '</td><td style="text-align:right">' + (r.u === "m²" ? r.q.toFixed(1) : r.q) + "</td><td>" + r.u + '</td><td style="text-align:right">' + Math.round(r.r).toLocaleString("en-IN") + '</td><td style="text-align:right">' + Math.round(r.a).toLocaleString("en-IN") + "</td></tr>"; }).join("") +
      '<tr><td colspan="4"><b>Total (rough)</b></td><td style="text-align:right"><b>' + inr(c.tot) + '</b></td></tr></table></div><p class="small muted">Indicative rates. Adding floors needs the town\'s approval and a structural engineer\'s certificate.</p>' +
      (nf ? '<h3 style="margin:10px 0 4px;font-size:1em">The new floor (layout on the house\'s footprint)</h3><div style="max-width:420px">' + PL.svg(nf, 0, { facing: "E", scale: Math.max(10, Math.min(28, 400 / (nf.W + 2.4))) }) + '</div><div class="small">Score ' + nf.sc.score + "/100 · stair: keep the old one going up, or an outside stair in the open yard</div>" : "") +
      '<div class="row" style="gap:8px;margin-top:10px">' + (nf ? '<button type="button" class="btn pri" data-pnbuild>Build in CAD — old house + new floor</button>' : "") + "</div></section>";
    return h + "</div>";
  } };
  document.addEventListener("change", function (e) { var el = e.target; if (!el.closest || !el.closest(".plm[data-plmode-root=renov]")) return;
    if (el.hasAttribute("data-pnsrc")) { pickDrawing(el.value); return; }
    if (el.dataset.pnrep) { S.rep[el.dataset.pnrep] = el.checked ? 1 : 0; save(); U.render(); return; } var k = el.dataset.pnf; if (!k) return; S[k] = el.type === "number" ? +el.value : el.value; save(); U.render(); });
  document.addEventListener("click", async function (e) { var bl = e.target.closest && e.target.closest("[data-pnlist]"); if (!bl || !bl.closest(".plm")) return; MEM.msg = "Loading your drawings…"; U.render();
    try { MEM.list = EP.cad.drawingList ? await EP.cad.drawingList() : []; MEM.msg = MEM.list.length ? "Pick the drawing of the house." : "No drawings found — make one in CAD Studio or the Building Planner first."; } catch (er) { MEM.list = []; MEM.msg = "Couldn't load the drawings."; } U.render(); });
  document.addEventListener("click", async function (e) { var b = e.target.closest && e.target.closest("[data-pnbuild]"); if (!b || !b.closest(".plm")) return;
    var nf = newFloor(); if (!nf) return; var CAD = EP.cad, B = EP.bim, H0 = 3200 * S.floors;
    var d = PL.toDoc(nf, { name: "Renovation — new floor", plot: { w: +S.bw, d: +S.bd }, rules: { f: 0, r: 0, l: 0, rt: 0, cov: 100, far: 9, h: 30 }, facing: "E", site: false, des: {}, furn: true });
    d.ents = d.ents.filter(function (e) { return !/^(footing|steps|ramp)$/.test(e.t) && !(e.t === "asset" && /rwh|septic|soak|sump|bore|earth|meter|car_|parking/.test(e.kind || "")) && e.t !== "land"; });
    if (S.src) { var src = null; try { src = await EP.cad.loadDoc(S.src.id); } catch (er) {} if (!src) { U.toast("Couldn't open the drawing " + S.src.name); return; }
      /* the old drawing as it is (its floors marked existing; the terrace — parapet, mumty — goes, as it is broken for the new floor),
         the new floor moved onto the old footprint and lifted above its top floor */
      var od = JSON.parse(JSON.stringify(src.data)), obs = B.ensure(od), keep = {}; S.src.levels.forEach(function (id) { keep[id] = 1; });
      var gone = obs.levels.filter(function (L) { return !keep[L.id] && L.elev >= S.src.topElev - 10; }).map(function (L) { return L.id; });
      od.ents = od.ents.filter(function (e) { return gone.indexOf(e.lvl) < 0; }); obs.levels = obs.levels.filter(function (L) { return gone.indexOf(L.id) < 0; }); obs.levels.forEach(function (L) { if (keep[L.id] && !/existing/.test(L.name)) L.name += " (existing)"; });
      var nbs = B.ensure(d), M = EP.geom.mTrans(S.src.x0, S.src.y0), ren = {}; nbs.levels.forEach(function (L) { ren[L.id] = "N" + L.id; od.bim.levels.push(Object.assign({}, L, { id: "N" + L.id, elev: L.elev + S.src.topElev, name: (L.id === "LT" ? "Terrace" : "New floor") + " (new)" })); });
      d.ents.forEach(function (e) { var x = EP.geom.xform(e, M); if (x.lvl && ren[x.lvl]) x.lvl = ren[x.lvl]; od.ents.push(x); });
      Object.keys(d.layers).forEach(function (k) { if (!od.layers[k]) od.layers[k] = d.layers[k]; }); od.name = (S.src.name || "House") + " — renovation";
      if (od.bim.cur && gone.indexOf(od.bim.cur) >= 0) od.bim.cur = S.src.top;
      U.toast("Making the drawing…"); await CAD.newDrawing(od.name, "mm", od); window.scrollTo(0, 0); U.toast("Built — your old drawing with the new floor on top (levels marked new)"); return; }
    var bs = B.ensure(d); /* the new floor sits on top of the old house: lift every planned level, and draw the old floors as outer walls */
    bs.levels.forEach(function (L) { L.elev += H0; L.name = (L.id === "LT" ? "Terrace" : "New floor") + " (new)"; });
    var olds = []; for (var i = 0; i < S.floors; i++) olds.push({ id: "E" + i, name: (i === 0 ? "Ground floor" : "Floor " + i) + " (existing)", elev: i * 3200, h: 3200 }); bs.levels = olds.concat(bs.levels);
    if (!d.layers["A-EXIST"]) d.layers["A-EXIST"] = { color: 8, lw: 0.35, lt: "CONTINUOUS", on: true, lock: false, frz: false };
    var W = +S.bw * 1000, D = +S.bd * 1000, c = [[0, 0], [W, 0], [W, D], [0, D]]; olds.forEach(function (L) { for (var k = 0; k < 4; k++) d.ents.push({ id: CAD.uid(), t: "wall", a: c[k].slice(), b: c[(k + 1) % 4].slice(), th: S.struct === "lb" ? 230 : 230, h: null, mat: "brick", just: "c", lvl: L.id, layer: "A-EXIST", name: "Existing wall" }); d.ents.push({ id: CAD.uid(), t: "slab", pts: c.map(function (q) { return q.slice(); }), th: 125, lvl: L.id, off: 3200, kind: "ceiling", layer: "A-EXIST" }); });
    U.toast("Making the drawing…"); await CAD.newDrawing(d.name, "mm", d); window.scrollTo(0, 0); U.toast("Built — the old floors are on layer A-EXIST (grey), the new floor above them");
  });
})();
