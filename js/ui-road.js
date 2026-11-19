/* Estimate Pro — roads, earthwork and culverts in CAD Studio: ribbon, properties, levels & layers dialog,
   earthwork table with L-section / mass-haul chart, and L-section / cross-section drawings. */
(function () {
  "use strict";
  var EP = window.EP, U = EP.ui, esc = U.esc, CAD = EP.cad, B = EP.bim, G = EP.geom, UN = EP.units;
  var at = CAD.RIBBON.findIndex(function (g) { return /Building/.test(g[0]); });
  CAD.RIBBON.splice(at + 1, 0, ["Roads & earthwork", [["ROAD", "Road"], ["CULVERT", "Culvert"], ["EARTHWORK", "Earthwork"]]]);
  var m3 = function (v) { return (v / 1e9).toFixed(3); }, m2 = function (v) { return (v / 1e6).toFixed(3); }, rl = function (v) { return (v / 1000).toFixed(3); };

  function f(label, key, val, pt, o) { o = o || {}; return "<label class='cad-f'><span>" + label + "</span><input class='in small' data-pf='b." + key + "' data-pt='" + (pt || "len") + "' value='" + esc(val == null ? "" : val) + "'" + (o.ph ? " placeholder='" + esc(o.ph) + "'" : "") + "></label>"; }
  function sel(label, key, val, opts) { return "<label class='cad-f'><span>" + label + "</span><select class='in small' data-pp='b." + key + "'>" + opts.map(function (o) { return "<option value='" + esc(o[0]) + "'" + (String(o[0]) === String(val) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></label>"; }
  function ro(label, val, warn) { return "<label class='cad-f'><span>" + label + "</span><input class='in small' value='" + esc(val) + "' readonly" + (warn ? " style='color:var(--danger);font-weight:600'" : "") + "></label>"; }
  var prevFields = CAD.HOOKS.fields;
  CAD.HOOKS.fields = function (e, ed) {
    if (e.t !== "road" && e.t !== "culvert") return prevFields ? prevFields(e, ed) : "";
    var Lm = function (v) { return v == null ? "" : ed.fmt(v); }, h = "";
    if (e.t === "road") {
      var t = B.roadTpl(e), tb = B.roadTable(e);
      h += "<div class='cad-ph'>Road</div>" + f("Name", "name", e.name || "", "text") + f("Chainage at start", "ch0", Lm(e.ch0 || 0)) + f("Cross-section every", "iv", Lm(e.iv || 20000)) + f("Ground cross slope % (+ rises to the left)", "xf", e.xf || 0, "num") +
        "<div class='cad-ph'>Typical cross-section</div>" + f("Carriageway width", "tpl.cw", Lm(t.cw)) + f("Shoulder width (each side)", "tpl.sh", Lm(t.sh)) + f("Camber %", "tpl.camber", t.camber, "num") + f("Shoulder slope %", "tpl.shs", t.shs, "num") + f("Fill slope (H : 1 V)", "tpl.fill", t.fill, "num") + f("Cut slope (H : 1 V)", "tpl.cut", t.cut, "num") +
        ro("Pavement", t.layers.map(function (l) { return (l.n || l.k) + " " + l.th; }).join(" + ") + " = " + B.roadT(e) + " mm") +
        "<div class='row' style='gap:6px;margin:4px 0;flex-wrap:wrap'><button type='button' class='btn sec sm' data-roadlv='1'>Levels & layers…</button><button type='button' class='btn sec sm' data-roadew='1'>Earthwork table…</button></div>" +
        "<div class='cad-ph'>Results</div>" + ro("Length", (tb.L / 1000).toFixed(2) + " m (" + B.chTxt(e.ch0 || 0) + " to " + B.chTxt((e.ch0 || 0) + tb.L) + ")") + ro("Cutting", m3(tb.cut) + " m³") + ro("Filling", m3(tb.fill) + " m³") + ro("Sections", tb.rows.length);
    } else {
      var g = B.culvertGeom(ed.doc, e);
      h += "<div class='cad-ph'>Culvert</div>" + sel("Type", "kind", e.kind || "pipe", [["pipe", "NP4 RCC pipe"], ["box", "RCC box"]]) + f("Chainage", "ch", Lm(e.ch)) +
        (e.kind === "box" ? f("Clear span", "span", Lm(e.span || 2000)) + f("Clear height", "ht", Lm(e.ht || 1500)) + f("Wall / slab thickness", "th", Lm(e.th || 250)) + f("Cells", "rows", e.rows || 1, "num") + f("Steel thumb rule kg/m³", "steel", e.steel || 110, "num")
          : sel("Pipe diameter", "dia", e.dia || 1000, B.PIPES.map(function (d) { return [d, d + " mm"]; })) + f("Rows", "rows", e.rows || 1, "num")) +
        f("Skew °", "skew", e.skew || 0, "num") + f("Invert level RL (blank = ground)", "inv", e.inv == null ? "" : Lm(e.inv), "len", { ph: g ? Lm(g.S.ngl) : "" });
      if (g) h += ro("Length (toe to toe + 1 m)", (g.len / 1000).toFixed(2) + " m") + ro("Cushion over the " + (g.pipe ? "pipe" : "box"), (g.cush / 1000).toFixed(2) + " m" + (g.cush < 600 ? " — less than 600 mm" : ""), g.cush < 600);
      else h += "<p class='small' style='color:var(--danger)'>The road of this culvert was deleted.</p>";
    }
    var q = B.qty(ed.doc, e); if (q.length) h += "<div class='cad-ph'>Quantities</div><div class='bimq'>" + q.map(function (r) { return "<div><span>" + esc(r.label) + "</span><b>" + (r.dim === "V" ? m3(r.v) + " m³" : r.dim === "A" ? m2(r.v) + " m²" : r.dim === "L" ? (r.v / 1000).toFixed(2) + " m" : r.dim === "M" ? r.v.toFixed(1) + " kg" : r.v) + "</b></div>"; }).join("") + "</div>";
    return h;
  };

  /* ---------- levels & layers dialog ---------- */
  function parseTable(txt) {
    var out = [], bad = 0; String(txt || "").split(/\r?\n/).forEach(function (line) { line = line.trim(); if (!line || /^[a-z#]/i.test(line)) return; var p = line.split(/[\s,;\t]+/).filter(Boolean); if (p.length < 2) { bad++; return; } var ch = chParse(p[0]), z = +p[1]; if (ch == null || !isFinite(z)) { bad++; return; } out.push([Math.round(ch * 1000), Math.round(z * 1000)]); });
    out.sort(function (a, b) { return a[0] - b[0]; }); return { rows: out, bad: bad };
  }
  function chParse(s) { s = String(s).trim(); var m = /^(\d+)\+(\d+(?:\.\d+)?)$/.exec(s); if (m) return +m[1] * 1000 + +m[2]; return isFinite(+s) ? +s : null; }
  function tableTxt(T) { return (T || []).map(function (r) { return (r[0] / 1000) + "\t" + (r[1] / 1000).toFixed(3); }).join("\n"); }
  function levelsDlg(ed, e) {
    var t = B.roadTpl(e), layers = CAD.clone(t.layers);
    function body() {
      return "<h3>Levels and pavement layers — " + esc(e.name || "Road") + "</h3><p class='muted small'>One line per point: <b>chainage</b> (metres or 1+250 style) and <b>level RL</b> in metres, separated by space, comma or tab — you can paste two columns from Excel. Levels between points are straight-line; the road profile is the finished level at the crown.</p>" +
        "<div class='row' style='gap:12px;flex-wrap:wrap;align-items:flex-start'><label class='cad-f' style='display:flex;flex-direction:column;flex:1;min-width:220px'><span>Ground levels (NGL) at the centre line</span><textarea class='in' id='rl-ngl' rows='10' style='font-family:monospace'>" + esc(tableTxt(e.ngl)) + "</textarea></label><label class='cad-f' style='display:flex;flex-direction:column;flex:1;min-width:220px'><span>Design road level (FRL) — grade points</span><textarea class='in' id='rl-prof' rows='10' style='font-family:monospace'>" + esc(tableTxt(e.prof)) + "</textarea></label></div>" +
        "<h4 style='margin:8px 0 4px'>Pavement layers (top to bottom)</h4><table class='t'><thead><tr><th>Layer</th><th>Kind (for SOR item)</th><th class='num'>Thickness mm</th><th class='num'>Width m</th><th></th></tr></thead><tbody>" + layers.map(function (l, i) { return "<tr><td><input class='in small' data-ly='" + i + "|n' value='" + esc(l.n || "") + "'></td><td><select class='in small' data-ly='" + i + "|k'>" + Object.keys(B.ROAD_LAYERS).map(function (k) { return "<option value='" + k + "'" + (k === l.k ? " selected" : "") + ">" + esc(B.ROAD_LAYERS[k]) + "</option>"; }).join("") + "</select></td><td class='num'><input class='in small' data-ly='" + i + "|th' value='" + (l.th || 0) + "' style='width:80px'></td><td class='num'><input class='in small' data-ly='" + i + "|w' value='" + ((+l.w || t.cw) / 1000) + "' style='width:80px'></td><td><button type='button' class='btn ghost sm' data-lydel='" + i + "' aria-label='Remove layer'>✕</button></td></tr>"; }).join("") + "</tbody></table><div class='row' style='gap:6px;margin:4px 0'><button type='button' class='btn ghost sm' data-lyadd='1'>+ Layer</button><span class='muted small'>Width: carriageway " + (t.cw / 1000) + " m, formation " + ((t.cw + 2 * t.sh) / 1000) + " m.</span></div>" +
        "<div class='rl-err small' style='color:var(--danger)'></div><div class='row' style='gap:8px;justify-content:flex-end;margin-top:6px'><button type='button' class='btn pri sm' data-rlsave='1'>Save</button><button type='button' class='btn ghost sm' data-dlg='close'>Cancel</button></div>";
    }
    function readLayers() { dlg.querySelectorAll("[data-ly]").forEach(function (inp) { var p = inp.dataset.ly.split("|"), l = layers[+p[0]]; if (!l) return; if (p[1] === "th") l.th = Math.max(0, +inp.value || 0); else if (p[1] === "w") l.w = Math.round((+inp.value || 0) * 1000); else l[p[1]] = inp.value; }); }
    var dlg = CAD.ui.dialog(body(), function (b) {
      if (b.dataset.lyadd) { readLayers(); layers.push({ n: "New layer", k: "gsb", th: 150, w: t.cw + 2 * t.sh }); dlg.querySelector(".cad-dlgbox").innerHTML = body(); return; }
      if (b.dataset.lydel != null) { readLayers(); layers.splice(+b.dataset.lydel, 1); dlg.querySelector(".cad-dlgbox").innerHTML = body(); return; }
      if (b.dataset.rlsave) {
        readLayers(); var n = parseTable(dlg.querySelector("#rl-ngl").value), p = parseTable(dlg.querySelector("#rl-prof").value), err = dlg.querySelector(".rl-err");
        if (n.bad || p.bad) { err.textContent = "Some lines could not be read (" + (n.bad + p.bad) + "). Use: chainage level, e.g. 0+020 101.250"; return; }
        if (n.rows.length < 1) { err.textContent = "Enter at least one ground level."; return; }
        var o = CAD.clone(e); o.ngl = n.rows; o.prof = p.rows; o.tpl = Object.assign({}, B.roadTpl(e), { layers: layers.filter(function (l) { return l.th > 0; }) });
        ed.doc.begin("Road levels"); ed.doc.mod(e.id, o); ed.doc.commit(); CAD.ui.closeDialog(); CAD.ui.renderPanels(); U.toast("Levels saved: " + n.rows.length + " ground points, " + p.rows.length + " road points");
      }
    });
    dlg.querySelector(".cad-dlgbox").classList.add("wide");
  }

  /* ---------- earthwork table, chart and drawings ---------- */
  function chart(tb) {
    var R = tb.rows; if (R.length < 2) return ""; var W = 860, H = 220, pad = 46, x0 = R[0].ch, x1 = R[R.length - 1].ch, zs = []; R.forEach(function (r) { zs.push(r.ngl, r.frl, r.form); });
    var zmin = Math.min.apply(null, zs), zmax = Math.max.apply(null, zs); if (zmax - zmin < 1000) { zmax += 500; zmin -= 500; }
    var X = function (c) { return pad + (c - x0) / ((x1 - x0) || 1) * (W - pad - 10); }, Y = function (z) { return 10 + (zmax - z) / (zmax - zmin) * (H - 30); };
    var path = function (k) { return R.map(function (r, i) { return (i ? "L" : "M") + X(r.ch).toFixed(1) + "," + Y(r[k]).toFixed(1); }).join(""); };
    var ms = R.map(function (r) { return r.mass; }), mmax = Math.max.apply(null, ms.map(Math.abs).concat([1])), MY = function (v) { return H + 20 + 60 - v / mmax * 55; };
    var s = "<svg viewBox='0 0 " + W + " " + (H + 150) + "' width='100%' role='img' aria-label='Longitudinal section and mass haul diagram' style='background:var(--card,#fff);border:1px solid var(--line);border-radius:6px'>";
    s += "<text x='" + pad + "' y='12' font-size='11' fill='currentColor'>RL " + rl(zmax) + "</text><text x='" + pad + "' y='" + (H - 12) + "' font-size='11' fill='currentColor'>RL " + rl(zmin) + "</text>";
    s += "<path d='" + path("ngl") + "' fill='none' stroke='#3a8a3a' stroke-width='2'/><path d='" + path("frl") + "' fill='none' stroke='#c0392b' stroke-width='2'/><path d='" + path("form") + "' fill='none' stroke='#2a6fb0' stroke-width='1' stroke-dasharray='4 3'/>";
    s += "<g font-size='11'><text x='" + (W - 300) + "' y='14' fill='#3a8a3a'>— Ground</text><text x='" + (W - 220) + "' y='14' fill='#c0392b'>— Road level</text><text x='" + (W - 120) + "' y='14' fill='#2a6fb0'>- - Formation</text></g>";
    s += "<line x1='" + pad + "' x2='" + (W - 10) + "' y1='" + MY(0) + "' y2='" + MY(0) + "' stroke='currentColor' stroke-opacity='.4'/><path d='" + R.map(function (r, i) { return (i ? "L" : "M") + X(r.ch).toFixed(1) + "," + MY(r.mass).toFixed(1); }).join("") + "' fill='none' stroke='#7b4bb3' stroke-width='2'/><text x='" + pad + "' y='" + (H + 22) + "' font-size='11' fill='#7b4bb3'>Mass haul (cumulative cut − fill), max " + m3(mmax) + " m³ — rising = surplus cut, falling = fill needed</text>";
    R.forEach(function (r, i) { if (R.length > 14 && i % Math.ceil(R.length / 12) && i !== R.length - 1) return; s += "<text x='" + X(r.ch).toFixed(1) + "' y='" + (H + 148) + "' font-size='10' text-anchor='middle' fill='currentColor'>" + B.chTxt(r.ch) + "</text>"; });
    return s + "</svg>";
  }
  function ensureLayer(ed, n, col) { if (ed.doc.d.layers[n]) return; var L = CAD.clone(ed.doc.d.layers); L[n] = { color: col || 7, lw: 0.25, lt: "CONTINUOUS", on: true, frz: false, lock: false }; ed.doc.set("layers", L); }
  function earthDlg(ed, C) {
    var roads = ed.doc.d.ents.filter(function (x) { return x.t === "road"; }); if (!roads.length) { U.toast("No road yet — draw one with Road (or type ROAD)"); return; }
    var sid = Array.from(ed.sel)[0], cur = roads.filter(function (r) { return r.id === sid; })[0] || roads[0];
    function body() {
      var tb = B.roadTable(cur), h = "<h3>Earthwork — " + esc(cur.name || "Road") + "</h3>" + (roads.length > 1 ? "<label class='cad-f' style='grid-template-columns:auto 1fr;max-width:340px'><span>Road</span><select class='in small' id='ew-road'>" + roads.map(function (r) { return "<option value='" + esc(r.id) + "'" + (r.id === cur.id ? " selected" : "") + ">" + esc(r.name || r.id) + "</option>"; }).join("") + "</select></label>" : "") +
        "<p class='muted small'>Cross-section areas between the ground line and the formation with side slopes; volumes by the average end area method. Formation = road level − pavement (" + B.roadT(cur) + " mm).</p>" + chart(tb);
      h += "<div class='tw' style='max-height:38vh;overflow:auto;margin-top:6px'><table class='t ew-t'><thead><tr><th>Chainage</th><th class='num'>NGL</th><th class='num'>Road level</th><th class='num'>Formation</th><th class='num'>Cut m²</th><th class='num'>Fill m²</th><th class='num'>Cut m³</th><th class='num'>Fill m³</th><th class='num'>Mass m³</th><th class='num'>Width m</th></tr></thead><tbody>" + tb.rows.map(function (r) { return "<tr><td>" + B.chTxt(r.ch) + "</td><td class='num'>" + rl(r.ngl) + "</td><td class='num'>" + rl(r.frl) + "</td><td class='num'>" + rl(r.form) + "</td><td class='num'>" + m2(r.cutA) + "</td><td class='num'>" + m2(r.fillA) + "</td><td class='num'>" + m3(r.cutV) + "</td><td class='num'>" + m3(r.fillV) + "</td><td class='num'>" + m3(r.mass) + "</td><td class='num'>" + ((r.wL + r.wR) / 1000).toFixed(2) + "</td></tr>"; }).join("") + "</tbody><tfoot><tr><td colspan='6'>Total</td><td class='num ew-cut'>" + m3(tb.cut) + "</td><td class='num ew-fill'>" + m3(tb.fill) + "</td><td class='num'>" + m3(tb.cut - tb.fill) + "</td><td></td></tr></tfoot></table></div>";
      h += "<div class='row' style='gap:8px;flex-wrap:wrap;margin-top:6px'><button type='button' class='btn sec sm' data-ewlsec='1'>Draw L-section in the drawing</button><button type='button' class='btn sec sm' data-ewxsec='1'>Draw cross-sections in the drawing</button><button type='button' class='btn sec sm' data-ewcsv='1'>Download CSV</button><button type='button' class='btn ghost sm' data-roadlv2='1'>Levels & layers…</button><span class='grow'></span><button type='button' class='btn ghost sm' data-dlg='close'>Close</button></div>";
      return h;
    }
    var dlg = CAD.ui.dialog(body(), function (b) {
      var ds = b.dataset, tb;
      if (ds.ewcsv) { tb = B.roadTable(cur); var rows = [["Chainage", "NGL m", "Road level m", "Formation m", "Cut area m2", "Fill area m2", "Cut vol m3", "Fill vol m3", "Mass ordinate m3"]]; tb.rows.forEach(function (r) { rows.push([B.chTxt(r.ch), rl(r.ngl), rl(r.frl), rl(r.form), m2(r.cutA), m2(r.fillA), m3(r.cutV), m3(r.fillV), m3(r.mass)]); }); rows.push(["Total", "", "", "", "", "", m3(tb.cut), m3(tb.fill), m3(tb.cut - tb.fill)]); CAD.ui.dl(new Blob([rows.map(function (r) { return r.join(","); }).join("\n")], { type: "text/csv" }), CAD.ui.fname(cur.name || "road") + "_earthwork.csv"); return; }
      if (ds.roadlv2) { CAD.ui.closeDialog(); levelsDlg(ed, cur); return; }
      if (ds.ewlsec || ds.ewxsec) {
        var ext = ed.doc.extents(true) || [0, 0, 0, 0], sc = (ed.doc.d.dim && ed.doc.d.dim.sc) || 100, hgt = 2.5 * sc, n0 = ed.doc.d.ents.length, lyr = ds.ewlsec ? "R-LSEC" : "R-XSEC";
        var org = [isFinite(ext[0]) ? ext[0] : 0, 0], topY = (isFinite(ext[1]) ? ext[1] : 0) - 12 * hgt;
        var ents = ds.ewlsec ? B.roadLsec(ed.doc, cur, org, { h: hgt, vx: 10, layer: lyr, topY: topY }) : B.roadXsecs(ed.doc, cur, org, { h: hgt * 0.6, layer: lyr, topY: topY });
        ed.doc.begin(ds.ewlsec ? "L-section" : "Cross-sections"); ensureLayer(ed, lyr, ds.ewlsec ? 6 : 4); ents.forEach(function (x) { ed.doc.add(x); }); ed.doc.commit();
        CAD.ui.closeDialog(); if (ed.zoomExtents) ed.zoomExtents(); else if (ed.zoomAll) ed.zoomAll(); ed.dirty = true;
        U.toast((ds.ewlsec ? "Longitudinal section" : tb2(cur) + " cross-sections") + " drawn on layer " + lyr + " (" + (ed.doc.d.ents.length - n0) + " objects) — plot it with File → Plot");
      }
    });
    dlg.addEventListener("change", function (ev) { if (ev.target.id === "ew-road") { cur = roads.filter(function (r) { return r.id === ev.target.value; })[0] || cur; dlg.querySelector(".cad-dlgbox").innerHTML = body(); } });
    dlg.querySelector(".cad-dlgbox").classList.add("wide");
  }
  function tb2(r) { return B.roadTable(r).rows.length; }

  CAD.HOOKS.wire.push(function (ed, C) {
    ed.onRoad = function () { earthDlg(ed, C); };
    C.root.addEventListener("click", function (ev) {
      var t = ev.target.closest("button"); if (!t) return; var ds = t.dataset, e = ed.sel.size === 1 ? ed.doc.get(Array.from(ed.sel)[0]) : null;
      if (ds.roadlv && e && e.t === "road") { levelsDlg(ed, e); return; }
      if (ds.roadew) { earthDlg(ed, C); return; }
    });
  });
})();
