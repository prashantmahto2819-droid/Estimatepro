/* Estimate Pro — reinforcement UI: BBS rows, thumb-rule rows, IS 456 check, plinth split, settings */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc;
  var E = function () { return U.est; };
  function q3(v) { return U.qfmt(v); }
  function opt(list, sel) { return list.map(function (o) { return "<option value='" + esc(o[0]) + "'" + (String(sel) === String(o[0]) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join(""); }
  function memOpts(sel) { return opt(Object.keys(EP.RF_MEM).map(function (m) { return [m, EP.RF_MEM[m]]; }), sel || "other"); }

  /* ---------- BBS row cells (replaces Details … Factor columns) ---------- */
  U.bbsCells = function (d, it, r, k, idp, R, kg) {
    var dis = R ? " disabled" : "", b = EP.bbs(d, r), sh = r.sh || "st";
    function inp(f, ph, w, lab) { return "<label class='bf'><span>" + lab + "</span><input class='in small n' style='width:" + (w || 64) + "px' id='" + idp + f + "' data-mf='" + k + "|" + f + "' value='" + esc(r[f] == null ? "" : r[f]) + "' placeholder='" + esc(ph || "") + "'" + dis + "></label>"; }
    function sel(f, html, lab) { return "<label class='bf'><span>" + lab + "</span><select class='in small' data-bsel='" + k + "|" + f + "'" + dis + ">" + html + "</select></label>"; }
    var h = "<td colspan='" + (kg ? 7 : 6) + "'><div class='bbs'>";
    h += "<div class='bbs-r'><input class='in small' style='flex:1;min-width:200px' id='" + idp + "d' data-mf='" + k + "|d' value='" + esc(r.d || "") + "' placeholder='e.g. Slab S1 — bottom main bars' aria-label='Description'" + dis + ">";
    h += sel("mem", memOpts(r.mem), "Member") + sel("lvl", opt([["above", "Above plinth"], ["below", "Up to plinth"]], r.lvl || "above"), "Level") + "</div>";
    h += "<div class='bbs-r'>" + inp("n", "1", 52, "No. of members") + sel("dia", opt(EP.RF_DIAS.map(function (x) { return [x, x + " mm"]; }), r.dia || 10), "Bar Ø") + sel("sh", opt(Object.keys(EP.RF_SHAPES).map(function (s) { return [s, EP.RF_SHAPES[s]]; }), sh), "Shape");
    if (sh === "sr") h += inp("a", "230", 60, "Width mm") + inp("bb", "450", 60, "Depth mm");
    else if (sh === "cl") h += inp("D", "450", 64, "Outer Ø mm");
    else { h += inp("l", "m", 70, "Length L (m)"); if (sh === "ln") h += inp("e", "m", 60, "Each leg (m)"); if (sh === "cr") h += inp("ch", "mm", 60, "Crank ht mm"); }
    h += "</div><div class='bbs-r'>" + inp("nb", b.nbHow ? String(b.nb) : "", 56, "Bars / member") + "<span class='muted' style='align-self:flex-end;padding-bottom:6px'>or</span>" + inp("sp", "mm", 56, "Spacing mm") + inp("dl", "m", 60, "over length m") + inp("c", String(EP.rfCover(d, r.mem)), 52, "Cover mm") + inp("x", "0", 52, "Extra m") + "</div>";
    h += "<div class='bbs-out'><span>Cutting length <strong>" + b.cl.toFixed(3) + " m</strong></span><span>Bars <strong>" + b.n + " × " + b.nb + " = " + b.bars + "</strong>" + (b.nbHow ? " <span class='muted'>(" + esc(b.nbHow) + ")</span>" : "") + "</span><span>" + b.w + " kg/m</span><span>= <strong>" + q3(b.kg) + " kg</strong></span></div>";
    h += "<div class='muted' style='font-size:11px'>" + esc(b.how) + " · cover " + b.cover + " mm" + (b.laps ? "" : "") + "</div>";
    return h + "</div></td>";
  };
  /* Thumb-rule member preset inside a "quantity of another item" row */
  U.thumbCell = function (d, r, k, R) {
    if (r.m !== "pct" && r.m !== "kgcum") return "";
    var pct = r.m === "pct" ? EP.ev(r.n) : (EP.ev(r.n) != null ? EP.ev(r.n) / 78.5 : null), chk = r.mem ? EP.rfCheck(d, r.mem, pct) : null;
    var h = "<div class='row' style='gap:6px;align-items:center;margin-top:4px;flex-wrap:wrap'><select class='in small' data-bsel='" + k + "|mem'" + (R ? " disabled" : "") + " aria-label='Member type (thumb rule)'><option value=''>Member (thumb rule)…</option>" + Object.keys(EP.RF_MEM).map(function (m) { return "<option value='" + m + "'" + (r.mem === m ? " selected" : "") + ">" + EP.RF_MEM[m] + (EP.RF_THUMB[m] ? " — " + EP.RF_THUMB[m] + "%" : "") + "</option>"; }).join("") + "</select>";
    if (chk) h += "<span class='badge " + (chk.ok ? (chk.warn ? "warn" : "ed") : "dan") + "' title='" + esc(chk.ref) + "'>" + esc((pct != null ? (Math.round(pct * 100) / 100) + "% · " : "") + chk.msg) + "</span>";
    return h + "<span class='muted' style='font-size:11px'>Thumb rule: estimate only. For a detailed estimate use steel bar (BBS) rows.</span></div>";
  };

  /* ---------- tools under the measurement table of a steel item ---------- */
  U.rfTools = function (d, it, R) {
    var inf = EP.itemInfo(it), sum = EP.bbsSummary(d, it), h = "<div class='rf-box'>";
    if (!R) h += "<div class='row' style='gap:6px;flex-wrap:wrap'><button class='btn pri sm' data-rfadd='" + it.id + "|bbs'>+ Steel bar (BBS row)</button><button class='btn sec sm' data-rfadd='" + it.id + "|thumb'>+ Steel by thumb rule (% of a concrete item)</button><span class='muted' style='font-size:12px;align-self:center'>BBS rows follow CPWD / IS 1200 measurement: standard weight (IS 1786), laps as required, no wastage.</span></div>";
    if (sum) {
      var dias = Object.keys(sum.dia).map(Number).sort(function (a, b) { return a - b; });
      h += "<div class='tw'><table class='t rf-sum'><thead><tr><th>Bar Ø</th>" + dias.map(function (x) { return "<th class='num'>" + x + " mm</th>"; }).join("") + "<th class='num'>Total kg</th><th class='num'>Up to plinth</th><th class='num'>Above plinth</th></tr></thead><tbody><tr><td>kg</td>" + dias.map(function (x) { return "<td class='num'>" + q3(sum.dia[x]) + "</td>"; }).join("") + "<td class='num'><strong>" + q3(sum.kg) + "</strong></td><td class='num'>" + q3(sum.lvl.below) + "</td><td class='num'>" + q3(sum.lvl.above) + "</td></tr></tbody></table></div>";
      var pair = EP.plinthPair(it.b, it.c);
      if (pair && !R) {
        var wrong = (it.c === pair.above ? sum.lvl.below : sum.lvl.above);
        if (wrong > 0) h += "<div class='row' style='gap:8px;align-items:center;flex-wrap:wrap'><span class='badge warn' style='white-space:normal'>" + q3(wrong) + " kg is " + (it.c === pair.above ? "up to plinth" : "above plinth") + " but this item is " + (it.c === pair.above ? "above plinth (" + pair.above + ")" : "up to plinth (" + pair.below + ")") + ".</span><button class='btn sec sm' data-rfsplit='" + it.id + "'>Move those rows to DSR " + (it.c === pair.above ? pair.below : pair.above) + "</button></div>";
      } else if (!pair && sum.lvl.below > 0 && sum.lvl.above > 0) h += "<p class='muted' style='margin:0;font-size:12px'>Rows are marked both up to and above plinth. If your SOR has separate items, add both and move the rows.</p>";
    }
    // IS 456 check against a concrete item
    var chk = it.rchk || {}, others = d.items.filter(function (x) { return x.id !== it.id && /cum|cu\.?m|m3/i.test(EP.itemInfo(x).unit); });
    h += "<div class='row' style='gap:8px;align-items:flex-end;flex-wrap:wrap'><label class='fld'><span class='lbl'>IS 456 check: concrete item</span><select class='in small' data-rfchk='" + it.id + "|ref'" + (R ? " disabled" : "") + "><option value=''>—</option>" + others.map(function (o) { var oi = EP.itemInfo(o); return "<option value='" + o.id + "'" + (chk.ref === o.id ? " selected" : "") + ">#" + EP.slOf(d, o) + " · " + esc((oi.code || "") + " " + oi.desc.slice(0, 50)) + " (" + q3(EP.itemQty(d, o)) + " cum)</option>"; }).join("") + "</select></label><label class='fld'><span class='lbl'>Member</span><select class='in small' data-rfchk='" + it.id + "|mem'" + (R ? " disabled" : "") + ">" + memOpts(chk.mem) + "</select></label>";
    var t = chk.ref && d.items.filter(function (x) { return x.id === chk.ref; })[0];
    if (t) {
      var vol = EP.itemQty(d, t), kgs = EP.itemQty(d, it) / EP.unitFactor(inf.unit), pct = vol ? kgs / (vol * 7850) * 100 : null, c = EP.rfCheck(d, chk.mem, pct);
      h += "<span style='padding-bottom:6px'>" + q3(kgs) + " kg ÷ (" + q3(vol) + " cum × 7850) = <strong>" + (pct != null ? (Math.round(pct * 100) / 100) + "%" : "—") + "</strong>" + (vol ? " (" + Math.round(kgs / vol) + " kg/cum)" : "") + "</span>";
      if (c) h += "<span class='badge " + (c.ok ? (c.warn ? "warn" : "ed") : "dan") + "' style='margin-bottom:6px' title='" + esc(c.ref) + "'>" + esc(c.msg) + "</span>";
    }
    return h + "</div></div>";
  };

  /* ---------- settings (Header, parts & GST tab) ---------- */
  U.rfSettings = function (d, R) {
    var s = EP.rf(d), dis = R ? " disabled" : "";
    var h = "<h3>Reinforcement (for steel BBS rows)</h3><div class='grid3'>";
    h += "<label class='fld'><span class='lbl'>Steel grade</span><select class='in' data-rfs='grade'" + dis + ">" + opt(EP.RF_GRADES.map(function (g) { return [g, g]; }), s.grade) + "</select></label>";
    h += "<label class='fld'><span class='lbl'>Concrete grade</span><select class='in' data-rfs='conc'" + dis + ">" + opt(EP.RF_CONC.map(function (g) { return [g, g]; }), s.conc) + "</select></label>";
    h += "<label class='fld'><span class='lbl'>Exposure (IS 456 Table 16)</span><select class='in' data-rfs='exp'" + dis + ">" + opt(Object.keys(EP.RF_EXP).map(function (e) { return [e, EP.RF_EXP[e][0] + " — " + EP.RF_EXP[e][1] + " mm"]; }), s.exp) + "</select></label>";
    h += "<label class='fld'><span class='lbl'>Lap length (× bar Ø)</span><input class='in n' id='rfs-lap' data-rfs='lap' value='" + esc(s.lap || "") + "' placeholder='Auto: " + EP.rfLap(d) + "d'" + dis + "></label>";
    h += "<label class='fld'><span class='lbl'>Hook, 180° (× bar Ø)</span><input class='in n' id='rfs-hook' data-rfs='hook' value='" + esc(s.hook || "") + "' placeholder='9'" + dis + "></label>";
    h += "<label class='fld'><span class='lbl'>Stock bar length (m)</span><input class='in n' id='rfs-stock' data-rfs='stock' value='" + esc(s.stock || "") + "' placeholder='12'" + dis + "></label></div>";
    h += "<p class='muted' style='margin:0;font-size:12px'>Development length Ld = 0.87 fy ÷ (4 τbd) = <strong>" + EP.rfLd(d) + "d</strong> for " + esc(s.grade) + " in " + esc(s.conc) + " (IS 456 cl. 26.2.1; deformed bars +60% bond). Tension lap = larger of Ld and 30d.</p>";
    h += "<div class='grid3'>" + Object.keys(EP.RF_MEM).map(function (m) { return "<label class='fld'><span class='lbl'>Cover — " + EP.RF_MEM[m] + " (mm)</span><input class='in n' id='rfc-" + m + "' data-rfcov='" + m + "' value='" + esc(s.cov[m] == null ? "" : s.cov[m]) + "' placeholder='Auto: " + EP.rfCoverAuto(d, m) + "'" + dis + "></label>"; }).join("") + "</div>";
    return h;
  };

  /* ---------- events ---------- */
  function upd(fn, rr) { E().change(fn, rr); }
  document.addEventListener("input", function (e) {
    var t = e.target, ds = t.dataset; if (!U.est || E().ro()) return;
    if (ds.rfs && t.tagName === "INPUT") { upd(function (d) { EP.rf(d)[ds.rfs] = t.value; }); return; }
    if (ds.rfcov) { upd(function (d) { EP.rf(d).cov[ds.rfcov] = t.value; }); return; }
  });
  document.addEventListener("change", function (e) {
    var t = e.target, ds = t.dataset; if (!U.est || E().ro()) return;
    if (ds.rfs && t.tagName === "SELECT") { upd(function (d) { EP.rf(d)[ds.rfs] = t.value; }); return; }
    if (ds.bsel) {
      var p = ds.bsel.split("|"); upd(function () {
        var it = E().findItem(p[0]), r = it.meas[+p[1]]; r[p[2]] = t.value;
        if (p[2] === "mem" && r.k === "bbs" && t.value === "footing") r.lvl = "below";
        if (p[2] === "mem" && (r.k === "ref" || r.k === "refm") && EP.RF_THUMB[t.value] != null) r.n = String(r.m === "kgcum" ? Math.round(EP.RF_THUMB[t.value] * 78.5) : EP.RF_THUMB[t.value]);
      }); return;
    }
    if (ds.rfchk) { var c = ds.rfchk.split("|"); upd(function () { var it = E().findItem(c[0]); it.rchk = it.rchk || {}; it.rchk[c[1]] = t.value; }); return; }
  });
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t || !U.est || E().ro()) return;
    var ds = t.dataset, p;
    if (ds.rfadd) {
      p = ds.rfadd.split("|"); var it = E().findItem(p[0]), uf = EP.unitFactor(EP.itemInfo(it).unit);
      upd(function () { it.meas = it.meas || []; it.meas.push(p[1] === "bbs" ? { k: "bbs", d: "", mem: "slab", lvl: "above", n: "1", dia: "10", sh: "st", uf: uf } : { k: "ref", m: "pct", mem: "slab", n: String(EP.RF_THUMB.slab), d: "Steel by thumb rule", ref: (it.rchk && it.rchk.ref) || "" }); });
      setTimeout(function () { var ri = it.meas.length - 1, n = document.getElementById("m-" + it.id + "-" + ri + "-d"); if (n) n.focus(); }, 60); return;
    }
    if (ds.rfsplit) {
      var src = E().findItem(ds.rfsplit), pair = EP.plinthPair(src.b, src.c); if (!pair) return;
      var toCode = src.c === pair.above ? pair.below : pair.above, wantLvl = src.c === pair.above ? "below" : "above";
      upd(function (d) {
        var dst = d.items.filter(function (x) { return x.part === src.part && x.b === src.b && x.c === toCode; })[0];
        if (!dst) { dst = { id: EP.uid(), part: src.part, b: src.b, c: toCode, q: "", rem: "", meas: [] }; d.items.splice(d.items.indexOf(src) + 1, 0, dst); }
        var move = src.meas.filter(function (r) { return r.k === "bbs" && (r.lvl === "below" ? "below" : "above") === wantLvl; });
        src.meas = src.meas.filter(function (r) { return move.indexOf(r) < 0; }); dst.meas = (dst.meas || []).concat(move);
      });
      U.toast("Rows moved to DSR " + toCode); return;
    }
  });
})();
