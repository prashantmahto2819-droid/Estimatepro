/* Planner — village / colony road with side drains and pipe culverts.
   Pavement by type (typical rural-road sections in the spirit of IRC SP:20 / SP:62 — check with the sanctioned design):
     CC road: PQC M30 180 + granular base 150 · BT road: premix carpet 20 + WBM / WMM 150 + GSB 150 · WBM: WMM 150 + GSB 150 · Gravel: gravel 150
   Quick quantities and an indicative cost here; "Build in CAD" makes the road (alignment, levels, cross-sections, earthwork table),
   the culverts and the drains (two brick walls + PCC bed each side) so that Σ Quantities gives the full estimate. */
(function () {
  "use strict";
  var EP = window.EP, U = EP.ui, esc = U.esc, PL = EP.plan, KEY = "ep_plan_road_v1";
  var S = { name: "Village road", len: 500, type: "cc", cw: 3.75, sh: 1.0, rl0: 100, rl1: 100.5, h: 0.3, drain: "both", dtype: "brick", dw: 0.45, dd: 0.45, cover: 0, culv: "150, 380", cdia: 600, rows: 1, rates: {} };
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
  var save = function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  var TYPES = { cc: { n: "CC road (cement concrete)", hi: "सीसी रोड", layers: [["PQC M30", "pqc", 180], ["GSB / WBM base", "gsb", 150]] },
    bt: { n: "BT road (bitumen, premix carpet)", hi: "डामर रोड", layers: [["Premix carpet", "bc", 20], ["WBM / WMM", "wmm", 150], ["GSB", "gsb", 150]] },
    wbm: { n: "WBM road (water bound macadam)", hi: "डब्ल्यूबीएम / गिट्टी रोड", layers: [["WBM / WMM", "wmm", 150], ["GSB", "gsb", 150]] },
    gravel: { n: "Gravel / murrum road", hi: "मुरुम रोड", layers: [["Gravel / murrum", "earth", 150]] } };
  /* indicative rates ₹ (replace with your SOR in the estimate) */
  var RATE = { earth: 260, gsb: 1900, wmm: 2300, dlc: 4800, pqc: 7800, bc: 14000, exc: 220, pcc: 5600, brick: 6800, plaster: 260, rcc: 9500, pipe600: 4800, pipe1000: 9800, pipe1200: 13500, pipe1500: 19000, head: 6200, udrain: 2600 };
  function boq() {
    var L = +S.len || 0, cw = +S.cw, sh = +S.sh, h = +S.h, B = cw + 2 * sh, T = TYPES[S.type] || TYPES.cc, R = Object.assign({}, RATE, S.rates || {}), rows = [];
    var row = function (n, q, u, k) { if (!(q > 0)) return; rows.push({ n: n, q: q, u: u, r: R[k], a: q * R[k] }); };
    if (h >= 0) row("Earthwork in embankment with compaction (side slopes 2 : 1)", L * (B * h + 2 * h * h), "m³", "earth"); else row("Earthwork in cutting (side slopes 1 : 1)", L * (B * -h + h * h), "m³", "exc");
    var depth = 0; T.layers.forEach(function (l, i) { var w = cw + (i === T.layers.length - 1 ? 2 * Math.min(sh, 0.6) : i ? 0.3 : 0); if (l[1] === "bc") row(l[0] + " " + l[2] + " mm", L * w * l[2] / 1000, "m³", "bc"); else row(l[0] + " " + l[2] + " mm", L * w * l[2] / 1000, "m³", l[1] === "earth" ? "gsb" : l[1]); depth += l[2]; });
    var nd = S.drain === "both" ? 2 : S.drain === "one" ? 1 : 0, dw = +S.dw, dd = +S.dd, t = 0.23;
    if (nd) { var DL = L * nd;
      if (S.dtype === "rcc_u") { row("Precast RCC U-drain " + Math.round(dw * 1000) + " × " + Math.round(dd * 1000) + " incl. laying", DL, "m", "udrain"); row("Excavation for drains", DL * (dw + 0.4) * (dd + 0.15), "m³", "exc"); }
      else if (S.dtype === "kutcha") row("Kutcha (earthen) side drain " + Math.round(dw * 1000) + " × " + Math.round(dd * 1000), DL * (dw + dd) * dd, "m³", "exc");
      else { row("Excavation for drains", DL * (dw + 2 * t + 0.3) * (dd + 0.175), "m³", "exc"); row("PCC 1:4:8 bed 100 mm", DL * (dw + 2 * t + 0.2) * 0.1, "m³", "pcc"); row("Brick masonry 1:6 drain walls 230 mm", DL * 2 * t * dd, "m³", "brick"); row("Plaster 1:4 12 mm inside the drain", DL * (2 * dd + dw), "m²", "plaster"); }
      if (S.cover) row("RCC M20 cover slabs 75 mm", DL * (dw + 2 * t) * 0.075, "m³", "rcc"); }
    var cs = String(S.culv || "").split(/[,\s]+/).map(Number).filter(function (x) { return x > 0 && x < L; });
    cs.forEach(function () {}); if (cs.length) { var pl = (B + 2 * Math.max(0, h) * 2 + 2) * (+S.rows || 1), pk = "pipe" + S.cdia; row("NP4 RCC pipe Ø" + S.cdia + " laid (" + cs.length + " culvert" + (cs.length > 1 ? "s" : "") + ")", pl * cs.length, "m", R[pk] ? pk : "pipe600"); row("CC 1:3:6 head walls and aprons", cs.length * 2 * (1 + S.cdia / 1000) * 1.2, "m³", "head"); }
    var tot = rows.reduce(function (a, r) { return a + r.a; }, 0);
    return { rows: rows, tot: tot, perKm: L > 0 ? tot / L * 1000 : 0, culv: cs, B: B, depth: depth };
  }
  /* cross-section sketch (not to scale vertically) */
  function xsec(q) {
    var cw = +S.cw, sh = +S.sh, h = Math.max(0, +S.h), sc = 40, W = (cw + 2 * sh + 4 * h + 4) * sc, g = 40 + Math.max(14, h * sc), H = g + Math.max(0.3, +S.dd || 0) * sc + 12, cx = W / 2, top = g - Math.max(14, h * sc), o = [];
    var X = function (m) { return (cx + m * sc).toFixed(1); };
    o.push("<line x1='0' y1='" + g + "' x2='" + W + "' y2='" + g + "' stroke='#8d6e63' stroke-dasharray='4 3'/>");
    o.push("<polygon fill='#d7ccc8' stroke='#6d4c41' points='" + X(-(cw / 2 + sh) - 2 * h) + "," + g + " " + X(-(cw / 2 + sh)) + "," + top + " " + X(cw / 2 + sh) + "," + top + " " + X(cw / 2 + sh + 2 * h) + "," + g + "'/>");
    o.push("<rect x='" + X(-cw / 2) + "' y='" + (top - 8) + "' width='" + (cw * sc).toFixed(1) + "' height='8' fill='" + (S.type === "cc" ? "#b0bec5" : S.type === "bt" ? "#37474f" : "#a1887f") + "'/>");
    if (S.drain !== "none") [-1, 1].forEach(function (sd) { if (S.drain === "one" && sd < 0) return; var x0 = sd * (cw / 2 + sh + 2 * h + 0.5); o.push("<rect x='" + X(sd > 0 ? x0 : x0 - +S.dw) + "' y='" + g + "' width='" + (+S.dw * sc).toFixed(1) + "' height='" + (+S.dd * sc).toFixed(1) + "' fill='#e1f5fe' stroke='#0277bd'/>"); });
    o.push("<text x='" + cx + "' y='" + (top - 12) + "' font-size='10' text-anchor='middle'>" + cw + " m carriageway · " + sh + " m shoulders · " + q.depth + " mm pavement</text>");
    return "<svg viewBox='0 0 " + W.toFixed(0) + " " + H + "' style='width:100%;max-width:640px;height:auto;background:#fafafa;border-radius:6px'>" + o.join("") + "</svg>";
  }
  var fld = function (k, lab, v, step, w, type) { return '<label style="display:flex;flex-direction:column;gap:2px"><span class="muted small">' + lab + '</span><input class="in small" style="width:' + (w || 100) + 'px" ' + (type === "text" ? 'type="text"' : 'type="number" step="' + (step || 0.1) + '"') + ' data-prf="' + k + '" value="' + esc(String(v)) + '"></label>'; };
  var sel = function (k, lab, v, opts) { return '<label style="display:flex;flex-direction:column;gap:2px"><span class="muted small">' + lab + '</span><select class="in small" data-prf="' + k + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(v) === String(o[0]) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></label>"; };
  PL.MODES.road = { n: "Road & drain", hi: "सड़क / नाली / पुलिया", icon: "🛣", render: function () {
    var q = boq(), inr = function (v) { return "₹ " + Math.round(v).toLocaleString("en-IN"); };
    var h = '<div class="plm" data-plmode-root="road" style="display:flex;flex-direction:column;gap:14px;max-width:1200px">';
    h += '<div><h1 style="margin:0">Road & drain planner <span class="muted" style="font-size:.55em;font-weight:500">सड़क, नाली और पुलिया — सेक्शन, मात्रा, लागत</span></h1><p class="muted" style="margin:4px 0 0">Give the length, the road type, the levels and the drains — see the cross-section, quantities and a rough cost, then build it in CAD for the L-section, cross-sections, earthwork and the full estimate.</p></div>';
    h += '<section class="panel" style="padding:12px 14px"><h3 style="margin:0 0 8px">1. Road</h3><div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">' + fld("name", "Name", S.name, 0, 180, "text") + fld("len", "Length m", S.len, 1) + sel("type", "Type / प्रकार", S.type, Object.keys(TYPES).map(function (k) { return [k, TYPES[k].n + " — " + TYPES[k].hi]; })) + fld("cw", "Carriageway width m", S.cw, 0.25) + fld("sh", "Shoulder each side m", S.sh, 0.25) + "</div>" +
      '<div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:8px">' + fld("rl0", "Ground RL at start m", S.rl0, 0.01) + fld("rl1", "Ground RL at end m", S.rl1, 0.01) + fld("h", "Road top above ground m (− = cutting)", S.h, 0.05, 150) + "</div></section>";
    h += '<section class="panel" style="padding:12px 14px"><h3 style="margin:0 0 8px">2. Drains and culverts <span class="muted" style="font-weight:500">नाली और पुलिया</span></h3><div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">' +
      sel("drain", "Side drains", S.drain, [["none", "None"], ["one", "One side"], ["both", "Both sides"]]) + sel("dtype", "Drain type", S.dtype, [["brick", "Brick masonry, plastered"], ["rcc_u", "Precast RCC U-drain"], ["kutcha", "Kutcha (earthen)"]]) + fld("dw", "Drain width m", S.dw, 0.05) + fld("dd", "Drain depth m", S.dd, 0.05) +
      '<label class="row" style="gap:6px;align-items:center"><input type="checkbox" data-prf="cover"' + (S.cover ? " checked" : "") + "> RCC cover slabs</label></div>" +
      '<div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:8px">' + fld("culv", "Pipe culverts at chainage m (comma-separated)", S.culv, 0, 220, "text") + sel("cdia", "Pipe Ø mm", S.cdia, [[600, "600"], [1000, "1000"], [1200, "1200"], [1500, "1500"]]) + fld("rows", "Rows of pipes", S.rows, 1, 80) + "</div></section>";
    h += '<section class="panel" style="padding:12px 14px"><h3 style="margin:0 0 8px">3. Cross-section, quantities and cost</h3>' + xsec(q) +
      '<div style="overflow-x:auto;margin-top:8px"><table class="tbl" style="width:100%;font-size:13px;border-collapse:collapse"><thead><tr><th style="text-align:left">Item</th><th>Qty</th><th>Unit</th><th>Rate ₹ (indicative)</th><th>Amount ₹</th></tr></thead><tbody>' +
      q.rows.map(function (r) { return '<tr><td>' + esc(r.n) + '</td><td style="text-align:right">' + r.q.toFixed(2) + "</td><td>" + r.u + '</td><td style="text-align:right">' + r.r.toLocaleString("en-IN") + '</td><td style="text-align:right">' + Math.round(r.a).toLocaleString("en-IN") + "</td></tr>"; }).join("") +
      '<tr><td colspan="4"><b>Total (rough)</b></td><td style="text-align:right"><b>' + inr(q.tot) + "</b></td></tr></tbody></table></div>" +
      '<p class="small" style="margin:6px 0 0">About <b>' + inr(q.perKm) + "</b> per km · " + q.culv.length + " culvert" + (q.culv.length === 1 ? "" : "s") + ' · <span class="muted">Rates are indicative — the estimate from CAD uses your SOR. Pavement layers follow typical rural-road sections; use the sanctioned design (IRC SP:20 / SP:62 / PMGSY) for the final work.</span></p>' +
      '<div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap"><button type="button" class="btn pri" data-prbuild>Build in CAD — L-section, cross-sections, earthwork, estimate</button></div></section>';
    return h + "</div>";
  } };
  document.addEventListener("change", function (e) { var el = e.target; if (!el.closest || !el.closest(".plm[data-plmode-root=road]")) return; var k = el.dataset.prf; if (!k) return;
    S[k] = el.type === "checkbox" ? (el.checked ? 1 : 0) : (el.type === "number" ? +el.value : el.value); save(); U.render(); });
  document.addEventListener("click", async function (e) { var b = e.target.closest && e.target.closest("[data-prbuild]"); if (!b || !b.closest(".plm")) return;
    var CAD = EP.cad, B = EP.bim, d = CAD.newDoc(S.name || "Road", "mm"), bs = B.ensure(d), ents = d.ents, add = function (o) { o.id = CAD.uid(); ents.push(o); return o; };
    ["R-ROAD", "R-CULV", "R-DRAIN"].forEach(function (k, i) { if (!d.layers[k]) d.layers[k] = { color: [8, 4, 150][i], lw: 0.35, lt: "CONTINUOUS", on: true, lock: false, frz: false }; });
    var L = Math.round(+S.len * 1000), T = TYPES[S.type] || TYPES.cc, cw = Math.round(+S.cw * 1000), sh = Math.round(+S.sh * 1000), r0 = Math.round(+S.rl0 * 1000), r1 = Math.round(+S.rl1 * 1000), hh = Math.round(+S.h * 1000);
    var road = add({ t: "road", pts: [[0, 0, 0], [L, 0, 0]], name: S.name || "Road", ch0: 0, iv: 20000, xf: 0, ngl: [[0, r0], [L, r1]], prof: [[0, r0 + hh], [L, r1 + hh]],
      tpl: { cw: cw, sh: sh, camber: S.type === "cc" ? 2 : S.type === "bt" ? 2.5 : 3.5, shs: 4, cut: 1, fill: 2, layers: T.layers.map(function (l, i) { return { n: l[0], k: l[1], th: l[2], w: cw + (i === T.layers.length - 1 ? 2 * Math.min(sh, 600) : i ? 300 : 0) }; }) }, layer: "R-ROAD" });
    boq().culv.forEach(function (c) { add({ t: "culvert", road: road.id, ch: Math.round(c * 1000), kind: "pipe", dia: +S.cdia, rows: +S.rows || 1, layer: "R-CULV" }); });
    if (S.drain !== "none" && S.dtype !== "kutcha") { var dw = Math.round(+S.dw * 1000), dd = Math.round(+S.dd * 1000);
      [-1, 1].forEach(function (sd) { if (S.drain === "one" && sd < 0) return; var yc = sd * (cw / 2 + sh + 2 * Math.max(0, hh) + 500 + dw / 2);
        [-1, 1].forEach(function (k) { var y = yc + k * (dw / 2 + 115); add({ t: "wall", a: [0, y], b: [L, y], th: 230, h: dd, base: -dd, mat: "brick", just: "c", lvl: "L0", layer: "R-DRAIN", name: "Drain wall" }); });
        add({ t: "slab", pts: [[0, yc - dw / 2 - 230], [L, yc - dw / 2 - 230], [L, yc + dw / 2 + 230], [0, yc + dw / 2 + 230]], th: 100, lvl: "L0", off: -dd, kind: "floor", mat: "pcc", layer: "R-DRAIN", name: "Drain bed PCC" });
        if (S.cover) add({ t: "slab", pts: [[0, yc - dw / 2 - 230], [L, yc - dw / 2 - 230], [L, yc + dw / 2 + 230], [0, yc + dw / 2 + 230]], th: 75, lvl: "L0", off: 75, kind: "floor", layer: "R-DRAIN", name: "Drain cover RCC" }); }); }
    add({ t: "text", p: [0, -(cw / 2 + sh + 2 * Math.max(0, hh) + 3000)], s: (S.name || "Road") + " — " + TYPES[S.type].n + ", " + (L / 1000) + " m", h: Math.max(400, L / 200), rot: 0, al: "l", layer: "R-ROAD" });
    U.toast("Making the road drawing…"); await CAD.newDrawing(d.name, "mm", d); window.scrollTo(0, 0);
    U.toast("Road built — select the road: Properties → Levels & layers / Earthwork table; Σ Quantities for the estimate");
  });
})();
