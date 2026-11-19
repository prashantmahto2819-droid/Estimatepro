/* Estimate Pro — Excel export: Measurement, Analysis, Abstract (per part), General Abstract, BOQ */
(function () {
  "use strict";
  var EP = window.EP, X = null, T;
  function H(len, width) { var per = Math.max(10, Math.floor(width * 1.15)); return Math.max(14, Math.ceil((len || 1) / per) * 12.5 + 2); }
  function q(name) { return "'" + name.replace(/'/g, "''") + "'"; }

  function header(ws, r, n, doc, title, part) {
    var h = doc.header || {};
    [[h.org, X.S.title, 18], [h.office, X.S.subtitle, 15], [h.project, X.S.subtitle, 15]].forEach(function (x) {
      if (!x[0]) return; ws.set(r, 0, x[0], x[1]); ws.merge(r, 0, r, n - 1); ws.height(r, x[2]); r++;
    });
    if (h.work) { var t = "Name of work: " + h.work; ws.set(r, 0, t, X.S.bold); ws.merge(r, 0, r, n - 1); ws.height(r, H(t.length, n * 11)); r++; }
    ws.set(r, 0, title, X.S.title); ws.merge(r, 0, r, n - 1); ws.height(r, 17); r++;
    if (part) { ws.set(r, 0, part, X.S.subtitle); ws.merge(r, 0, r, n - 1); r++; }
    return r;
  }
  function footer(ws, r, n, doc) {
    r += 2; var s = (doc.signs || []).filter(function (x) { return x.title || x.place; }); if (!s.length) return r;
    var pos = s.length === 1 ? [n - 2] : s.length === 2 ? [1, n - 2] : [1, Math.floor((n - 1) / 2), n - 2];
    s.slice(0, 3).forEach(function (x, i) { var c = pos[i]; ws.set(r, c, x.title, X.S.signb); if (x.place) ws.set(r + 1, c, x.place, X.S.sign); });
    return r + 2;
  }
  function heads(ws, r, labels) { labels.forEach(function (l, c) { ws.set(r, c, l, X.S.head); }); ws.height(r, 28); return r + 1; }
  function box(ws, r, n, skip) { for (var c = 0; c < n; c++) if (!skip || skip.indexOf(c) < 0) { var row = ws.rows[r]; if (!row || !row[c]) ws.set(r, c, "", X.S.text); } }
  function partTitle(doc, p) { return doc.parts.length > 1 ? p.name : ""; }
  function itemsOf(doc, p) { return EP.partItems(doc, p.id); }
  function anKey(it) { return it.b === "x" ? "x|" + it.id : it.b + "|" + it.c + "|" + (EP.ev(it.anr) == null ? "" : EP.ev(it.anr)) + (EP.hasEstEdits(it) ? "|" + JSON.stringify(it.ab) : ""); }

  /* ---------- Measurement ---------- */
  function measurement(wb, doc, ctx) {
    var n = 10, ws = wb.sheet("Measurement", { cols: [6, 44, 7, 7, 8, 8, 8, 9, 12, 20] }), r = 0;
    doc.parts.forEach(function (p, pi) {
      if (pi) ws.pageBreak(r);
      r = header(ws, r, n, doc, "MEASUREMENT", partTitle(doc, p));
      r = heads(ws, r, ["Sl. No.", "Item / Details", "Unit", "No.", "L (m)", "B (m)", "D / H (m)", "Factor", "Qty", "Remarks"]);
      itemsOf(doc, p).forEach(function (it, ii) {
        var inf = EP.itemInfo(it);
        ws.set(r, 0, ii + 1, X.S.center); ws.set(r, 1, inf.desc, X.S.btext); ws.set(r, 2, inf.unit, X.S.center); ws.set(r, 9, inf.src, X.S.text);
        box(ws, r, n); ws.height(r, H(inf.desc.length, 44)); r++;
        var bP = [], bM = [], plus = [], minus = [], rows = it.meas || [], segP = [], segM = [], netP = [], netM = [], qk = EP.itemQk(it), mu = qk !== 1 ? it.qu : inf.unit;
        rows.forEach(function (m) {
          if (m.k === "h" && !EP.hasDims(m)) { ws.set(r, 1, m.d || "", X.S.itext); box(ws, r, n); r++; return; }
          if (m.k === "st" || m.k === "nt") {
            var ri = rows.indexOf(m), sv = EP.subTotal(doc, it, ri), PP = m.k === "nt" ? netP : segP, MM = m.k === "nt" ? netM : segM;
            var fs = PP.length ? PP.map(function (c) { return "+" + c; }).concat(MM.map(function (c) { return "-" + c; })).join("").replace(/^\+/, "") : (m.k === "nt" ? MM.map(function (c) { return "-" + c; }).join("") : MM.join("+"));
            ws.set(r, 1, m.d || (m.k === "nt" ? "Net total" : "Sub-total"), X.S.btext); ws.set(r, 2, mu, X.S.center); ws.set(r, 8, sv, X.S.bqty, fs || null); box(ws, r, n); r++;
            segP = []; segM = []; if (m.k === "nt") { netP = []; netM = []; } return;
          }
          var val = EP.rowQty(doc, m, 0, it) || 0, cell, kf = EP.rowIsKg(m) ? EP.rowKgFactor(it) : 1, kfS = kf !== 1 ? "*" + kf : "";
          if (m.k === "bbs") {
            var bb = EP.bbs(doc, m), shp = { st: "straight", hk: "with hooks", ln: "L-bent", cr: "cranked", sr: "stirrups/ties", cl: "rings" }[m.sh || "st"];
            var spT = EP.ev(m.sp) && EP.ev(m.nb) == null ? " @ " + EP.ev(m.sp) + " mm c/c" : "";
            ws.set(r, 1, (m.d ? m.d + " — " : "") + bb.dia + " mm Ø " + shp + spT + " (" + bb.n + " × " + bb.nb + " bars; cutting length " + bb.cl.toFixed(3) + " m = " + bb.how + "; cover " + bb.cover + " mm; " + (m.lvl === "below" ? "up to plinth" : "above plinth") + ")", X.S.text);
            ws.set(r, 2, mu, X.S.center); ws.set(r, 3, bb.bars, X.S.dim); ws.set(r, 4, bb.cl, X.S.dim); ws.set(r, 7, EP.r3(bb.w * (m.uf || 1) * 1000) / 1000, X.S.dim);
            ws.height(r, H(ws.rows[r][1].v.length, 44));
            cell = ws.set(r, 8, val, X.S.qty, "D" + (r + 1) + "*E" + (r + 1) + "*H" + (r + 1));
          } else if (m.k === "pc") {
            var pcv = EP.ev(m.f) || 0;
            ws.set(r, 1, (m.d ? m.d + " — " : "") + "add " + pcv + " % on the above", X.S.text); ws.set(r, 2, mu, X.S.center); ws.set(r, 7, pcv, X.S.dim);
            cell = ws.set(r, 8, val, X.S.qty, bP.length ? "(" + bP.join("+") + (bM.length ? "-" + bM.join("-") : "") + ")*H" + (r + 1) + "/100" : null);
          } else if (EP.isRef(m)) {
            var t = doc.items.filter(function (i) { return i.id === m.ref; })[0], tq = t && ctx.qtyRow[t.id];
            var mult = EP.ev(m.n);
            ws.set(r, 1, (m.k === "refm" ? "Deduct: " : "") + (m.d ? m.d + " — " : "") + (t ? "Same as item " + EP.slOf(doc, t) + (doc.parts.length > 1 ? " of " + (doc.parts.filter(function (x) { return x.id === t.part; })[0] || {}).name : "") : "Same as another item"), X.S.text);
            var md = m.m === "pct" ? " × " + (mult || 0) + "% × 7850 kg/cum" : m.m === "kgcum" ? " @ " + (mult || 0) + " kg/cum" : (mult != null ? " × " + mult : "");
            ws.rows[r][1].v += " (" + EP.r3(t ? EP.itemQty(doc, t) : 0) + " " + (t ? EP.itemInfo(t).unit : "") + ")" + md;
            var cnt = EP.ev(m.no);
            if (cnt != null) { ws.set(r, 3, cnt, X.S.dim); ws.rows[r][1].v += " × " + cnt + " no."; }
            if (mult != null) ws.set(r, 7, mult, X.S.dim);
            ws.set(r, 2, mu, X.S.center);
            cell = ws.set(r, 8, val, X.S.qty, tq != null ? "I" + (tq + 1) + (cnt != null ? "*D" + (r + 1) : "") + (mult != null ? "*H" + (r + 1) + (m.m === "pct" ? "/100*7850" : "") : "") + kfS : null);
          } else {
            var st = m.sec ? EP.steel(m.sec) : null;
            var secTxt = !m.sec ? "" : m.sec === "__pct" ? "steel @ " + (EP.ev(m.f) || 0) + "% of concrete volume × 7850 kg/cum" : m.sec === "__manual" ? "@ " + (EP.ev(m.f) || 0) + " kg/m" : m.sec + " @ " + EP.ev(m.f) + (/plate/i.test(m.sec) ? " kg/sqm" : " kg/m") + (st ? " (" + st[2] + ")" : "");
            ws.set(r, 1, (m.k === "-" ? "Deduct: " : "") + (m.d || "") + (secTxt ? (m.d ? " — " : "") + secTxt : ""), EP.isDed(m) ? X.S.itext : m.k === "h" ? X.S.btext : X.S.text);
            ws.set(r, 2, mu, X.S.center);
            var f = [];
            [["n", 3], ["l", 4], ["b", 5], ["h", 6], ["f", 7]].forEach(function (k) { var v = EP.ev(m[k[0]]); if (v != null) { ws.set(r, k[1], v, X.S.dim); f.push(X.col(k[1]) + (r + 1)); } });
            var manual = EP.ev(m.q);
            var fx = null;
            if (manual == null && f.length) { if (m.sec === "__pct") { var dimsF = f.filter(function (c) { return c.charAt(0) !== "H"; }); fx = dimsF.length ? dimsF.join("*") + "*" + (EP.ev(m.f) || 0) + "/100*7850" : null; } else fx = f.join("*"); }
            if (fx && kfS) fx += kfS;
            cell = ws.set(r, 8, val, X.S.qty, fx);
          }
          var dd = EP.isDed(m); box(ws, r, n); if (m.k !== "pc") (dd ? bM : bP).push("I" + (r + 1)); (dd ? minus : plus).push("I" + (r + 1)); (dd ? segM : segP).push("I" + (r + 1)); (dd ? netM : netP).push("I" + (r + 1)); r++;
        });
        var conv = qk !== 1 && (plus.length || minus.length), qty = conv ? EP.r3(EP.measSum(doc, it).net) : EP.itemQty(doc, it);
        if (!plus.length && !minus.length) { ws.set(r, 1, "Quantity", X.S.btext); ws.set(r, 2, mu, X.S.center); ws.set(r, 8, qty, X.S.bqty); box(ws, r, n); ctx.qtyRow[it.id] = r; r++; }
        else if (minus.length) {
          var g = r; ws.set(r, 1, "Gross total", X.S.btext); ws.set(r, 2, mu, X.S.center); ws.set(r, 8, EP.measSum(doc, it).plus, X.S.bqty, plus.length ? plus.join("+") : null); box(ws, r, n); r++;
          var d = r; ws.set(r, 1, "Less: deductions", X.S.btext); ws.set(r, 2, mu, X.S.center); ws.set(r, 8, EP.measSum(doc, it).minus, X.S.bqty, minus.join("+")); box(ws, r, n); r++;
          ws.set(r, 1, "Net total", X.S.btext); ws.set(r, 2, mu, X.S.center); ws.set(r, 8, qty, X.S.bqty, conv ? "I" + (g + 1) + "-I" + (d + 1) : "ROUND(I" + (g + 1) + "-I" + (d + 1) + ",3)"); box(ws, r, n); ctx.qtyRow[it.id] = r; r++;
        } else { ws.set(r, 1, "Total", X.S.btext); ws.set(r, 2, mu, X.S.center); var tf = plus.length > 1 ? plus.join("+") : plus[0]; ws.set(r, 8, qty, X.S.bqty, conv ? tf : "ROUND(" + tf + ",3)"); box(ws, r, n); ctx.qtyRow[it.id] = r; r++; }
        if (conv && ctx.qtyRow[it.id] != null) { var pr = ctx.qtyRow[it.id]; ws.set(r, 1, "Quantity in " + inf.unit + " (" + mu + (it.qsz ? " ÷ " + it.qsz + (it.qceil ? ", rounded up" : "") : " × " + qk) + ")", X.S.btext); ws.set(r, 2, inf.unit, X.S.center); ws.set(r, 7, qk, X.S.dim); ws.set(r, 8, EP.itemQty(doc, it), X.S.bqty, it.qceil ? "ROUNDUP(ROUND(I" + (pr + 1) + "*H" + (r + 1) + ",3),0)" : "ROUND(I" + (pr + 1) + "*H" + (r + 1) + ",3)"); box(ws, r, n); ctx.qtyRow[it.id] = r; r++; }
        var sm = EP.bbsSummary ? EP.bbsSummary(doc, it) : null;
        if (sm) {
          var dz = Object.keys(sm.dia).map(Number).sort(function (a, b) { return a - b; });
          ws.set(r, 1, "Abstract of steel (kg): " + dz.map(function (x) { return x + " mm Ø = " + EP.r2(sm.dia[x]); }).join("; ") + " · total " + EP.r2(sm.kg) + " kg (up to plinth " + EP.r2(sm.lvl.below) + ", above plinth " + EP.r2(sm.lvl.above) + "). Weights as per IS 1786; laps included as required; no wastage.", X.S.note); ws.merge(r, 1, r, n - 1); ws.height(r, 30); r++;
        }
      });
      r++;
    });
    footer(ws, r, n, doc);
  }

  /* NS item: full analysis + market-rate justification (quotations) */
  function nsAnalysis(ws, r, n, it, inf, lr, ctx, key) {
    var c = EP.nsCalc(it.x), SECN = { M: "MATERIAL", L: "LABOUR", C: "CARRIAGE", P: "MACHINERY" };
    ws.set(r, 1, "Details of cost for " + c.basis + " " + inf.unit + " (non-schedule item — rate analysis)", X.S.itext); r++;
    r = heads(ws, r, ["Code", "Description", "Rate (₹)", "Per", "Unit", "Qty", "Amount (₹)"]);
    var first = r, sec = null, quotes = [];
    c.lines.forEach(function (cl) {
      var l = cl.l;
      if (l.sec !== sec) { sec = l.sec; ws.set(r, 1, SECN[sec] || "OTHER", X.S.btext); box(ws, r, n); r++; }
      var bk = EP.BOOKS[l.b], ref = l.t === "m" || (l.t === "mc" && !l.c) ? (l.t === "mc" ? "Hire" : "Market") : ({ cpwd: "CPWD ", mp: "MPPWD ", hort: "Hort. " }[l.b] || "") + l.c;
      ws.set(r, 0, ref, X.S.center); ws.set(r, 1, cl.desc + (l.t === "i" ? " (" + (l.use === "sor" ? "SOR" : "updated") + " rate)" : "") + (l.t === "mc" && cl.mc ? (cl.mc.own ? " — owning & operating cost per hour (A + B, below)" : " — " + cl.mc.how) + (cl.mc.hHow ? "; hours = " + cl.mc.hHow : "") : ""), X.S.text);
      if (cl.r != null) ws.set(r, 2, EP.r2(cl.r), X.S.num);
      ws.set(r, 3, 1, X.S.center); ws.set(r, 4, cl.unit || "", X.S.center);
      if (cl.q != null) ws.set(r, 5, cl.q, X.S.qty);
      ws.set(r, 6, EP.r2(cl.amt), X.S.num, cl.r != null && cl.q != null ? "C" + (r + 1) + "*F" + (r + 1) : null);
      box(ws, r, n); ws.height(r, H((cl.desc || "").length, 50)); r++;
      if (l.t === "mc" && cl.mc && cl.mc.own) { cl.mc.own.rows.forEach(function (rw) { ws.set(r, 0, rw[0], X.S.center); ws.set(r, 1, "   " + rw[1], /^(8|11|16|17)$/.test(rw[0]) ? X.S.btext : X.S.itext); if (typeof rw[2] === "number") ws.set(r, 2, rw[2], X.S.num); else ws.set(r, 2, rw[2], X.S.center); box(ws, r, n); r++; }); }
      if ((l.t === "m" || (l.t === "mc" && !l.c)) && (l.qs || []).some(function (z) { return EP.ev(z.r) != null; })) quotes.push(cl);
    });
    var tot = r; ws.set(r, 1, "TOTAL", X.S.btext); ws.set(r, 6, EP.r2(c.sub), X.S.bnum, "SUM(G" + (first + 1) + ":G" + r + ")"); box(ws, r, n); r++;
    c.adds.forEach(function (a, j) {
      ws.set(r, 1, "Add " + a.pct + "% " + a.label, X.S.text); ws.set(r, 6, EP.r2(a.amt), X.S.num, "G" + (tot + 1) + "*" + a.pct + "/100"); box(ws, r, n); var add = r; r++;
      ws.set(r, 1, j === c.adds.length - 1 ? "Cost for " + c.basis + " " + inf.unit : "TOTAL", X.S.btext); ws.set(r, 6, EP.r2(a.run), X.S.bnum, "G" + (tot + 1) + "+G" + (add + 1)); box(ws, r, n); tot = r; r++;
    });
    if (!c.adds.length) { ws.set(r, 1, "Cost for " + c.basis + " " + inf.unit, X.S.btext); ws.set(r, 6, EP.r2(c.total), X.S.bnum, "G" + (tot + 1)); box(ws, r, n); tot = r; r++; }
    if (c.basis !== 1) { ws.set(r, 1, "Cost for 1 " + inf.unit, X.S.btext); ws.set(r, 6, EP.r2(c.raw), X.S.bnum, "G" + (tot + 1) + "/" + c.basis); box(ws, r, n); r++; }
    var typed = EP.ev(it.x.an) != null || EP.ev(it.anr) != null;
    ws.set(r, 1, typed ? "Updated rate adopted (entered): " + lr.how : "Say (updated rate)", X.S.btext); ws.set(r, 6, lr.a, X.S.bnum); box(ws, r, n); ctx.anRow[key] = r; r++;
    if (quotes.length) {
      r++; ws.set(r, 1, "MARKET RATE JUSTIFICATION (quotations, rates without GST)", X.S.btext); ws.merge(r, 1, r, n - 1); r++;
      r = heads(ws, r, ["Sl", "Material / firm", "Date", "", "Unit", "", "Rate (₹)"]);
      quotes.forEach(function (cl) {
        var l = cl.l, qs = (l.qs || []).filter(function (z) { return EP.ev(z.r) != null; });
        ws.set(r, 1, cl.desc, X.S.btext); ws.merge(r, 1, r, n - 1); box(ws, r, n); r++;
        qs.forEach(function (z, i) { ws.set(r, 0, i + 1, X.S.center); ws.set(r, 1, z.v || "(firm not named)", X.S.text); ws.set(r, 2, z.dt ? z.dt.split("-").reverse().join(".") : "", X.S.center); ws.set(r, 4, cl.unit || "", X.S.center); ws.set(r, 6, EP.ev(z.r), X.S.num); box(ws, r, n); r++; });
        ws.set(r, 1, "Rate adopted (" + (l.pick === "avg" ? "average" : "lowest") + " of " + qs.length + " quotation" + (qs.length > 1 ? "s" : "") + ")", X.S.btext); ws.set(r, 6, EP.r2(cl.r), X.S.bnum); box(ws, r, n); r++;
      });
    }
    return r;
  }
  /* ---------- Analysis ---------- */
  function analysis(wb, doc, ctx) {
    var n = 7, ws = wb.sheet("Analysis", { cols: [10, 50, 11, 6, 8, 10, 13] }), r = 0, done = {}, k = 0;
    r = header(ws, r, n, doc, "ANALYSIS OF RATES (UPDATED)", "");
    var multi = doc.parts.length > 1;
    // sub-analyses (an analysis used as a line inside another analysis): printed once each at the end, numbered S-1, S-2 …
    var subQ = [], subId = {}, mainPlain = {};
    doc.parts.forEach(function (p) { itemsOf(doc, p).forEach(function (it) { if (it.b !== "x" && !EP.hasEstEdits(it)) mainPlain[it.b + "|" + it.c] = 1; }); });
    function subRef(book, code, self) {
      if (!book || !code || code === self || !EP.anOf(book, code)) return "";
      var kk = book + "|" + code;
      if (!subId[kk]) { subId[kk] = "S-" + (subQ.length + 1); subQ.push([book, code]); }
      return subId[kk];
    }
    var SECL = { M: "MATERIAL", L: "LABOUR", C: "CARRIAGE", P: "MACHINERY", T: "HIRE / T&P", R: "OTHER ITEMS (ADDED AFTER OVERHEADS)", I: "OTHER SOR ITEMS" };
    function lineRows(bu, book, self) {
      var first = r, sec = null, extraHdr = false;
      bu.lines.forEach(function (l) {
        if (l.removed) return;
        if (l.extra != null && !extraHdr) { extraHdr = true; ws.set(r, 1, "LINES ADDED FOR THIS ESTIMATE", X.S.btext); box(ws, r, n); r++; sec = "x"; }
        else if (l.extra == null && l.sec && l.sec !== sec) { sec = l.sec; ws.set(r, 1, SECL[sec] || sec, X.S.btext); box(ws, r, n); r++; }
        var sref = l.extra != null ? (l.src === "i" && l.book === book ? subRef(book, l.code, self) : "") : subRef(book, l.code, self);
        var dsc = (l.desc || "") + (sref ? "  [detailed analysis: " + sref + " below]" : "");
        ws.set(r, 0, l.code || "", X.S.center); ws.set(r, 1, dsc, X.S.text);
        if (l.r != null) ws.set(r, 2, EP.r2(l.r), X.S.num);
        if (l.per && l.per !== 1) ws.set(r, 3, l.per, X.S.center);
        ws.set(r, 4, l.unit || "", X.S.center);
        if (l.q != null) ws.set(r, 5, l.q, X.S.qty);
        ws.set(r, 6, EP.r2(l.amt), X.S.num, l.r != null && l.q != null ? "C" + (r + 1) + "*F" + (r + 1) + (l.per && l.per !== 1 ? "/D" + (r + 1) : "") : null);
        box(ws, r, n); ws.height(r, H(dsc.length, 50)); r++;
      });
      return first;
    }
    doc.parts.forEach(function (p) {
      itemsOf(doc, p).forEach(function (it, ii) {
        var key = anKey(it); if (done[key]) return; done[key] = 1; k++;
        var inf = EP.itemInfo(it), lr = EP.lineRates(doc, it), start = r;
        // the analysis carries the SAME item number as the measurement / abstract (Sl. No. of the part) and the SOR item code
        var uses = doc.parts.map(function (pp) { var sl = itemsOf(doc, pp).map(function (x, i) { return anKey(x) === key ? i + 1 : 0; }).filter(Boolean); return sl.length ? (multi ? pp.name + " item " : "Item ") + sl.join(", ") : ""; }).filter(Boolean);
        r++;
        ws.set(r, 0, (multi ? (p.name || "").replace(/^Part\s*/i, "") + "-" : "") + (ii + 1), X.S.bold); ws.set(r, 1, inf.desc, X.S.bold); ws.merge(r, 1, r, n - 1); ws.height(r, H(inf.desc.length, 90)); r++;
        var bkx = EP.BOOKS[it.b], anx = it.b !== "x" ? EP.anOf(it.b, it.c) : null, refl = bkx && bkx.refLabel && anx ? bkx.refLabel(anx) : "";
        ws.set(r, 1, uses.join("; ") + " — " + (it.b === "x" ? inf.src : (bkx ? bkx.short : it.b) + " item No. " + it.c + " (" + inf.unit + ")") + (refl ? " · " + refl : ""), X.S.note); ws.merge(r, 1, r, n - 1); r++;
        var o = it.b !== "x" ? EP.itemOvr(it.b, it.c) : null;
        var custom = EP.customAn(it);
        var useBuild = (EP.hasAn(it.b, it.c) || custom) && lr.how !== "SOR rate" && !(o && o.mode === "manual") && EP.ev(it.anr) == null;
        if (EP.hasEstEdits(it) && useBuild) o = Object.assign({ mode: "build" }, EP.itemOv(it));
        var bu = EP.hasAn(it.b, it.c) || custom ? (custom ? EP.itemBuild(it) : EP.build(it.c, o && o.mode === "build" ? o : null, 0, it.b)) : null;
        if (bu) {   // null when the analysis cannot be built (no anchor rate): shown as "Basis of rate" below
          ws.set(r, 1, "Analysis of " + (bkx ? bkx.short : "") + " item No. " + it.c + " — details of cost for " + EP.r3(bu.basis) + " " + inf.unit + (bkx && bkx.basicNote && !(anx && anx.admin) && !custom ? "   (" + bkx.basicNote + ")" : ""), X.S.itext); r++;
          r = heads(ws, r, ["Code", "Description", "Rate (₹)", "Per", "Unit", "Qty", "Amount (₹)"]);
          var first = lineRows(bu, it.b, it.c);
          var tot = r; ws.set(r, 1, "TOTAL", X.S.btext); ws.set(r, 6, EP.r2(bu.sub), X.S.bnum, "SUM(G" + (first + 1) + ":G" + r + ")"); box(ws, r, n); r++;
          bu.adds.forEach(function (a, j) {
            ws.set(r, 1, "Add " + a.pct + "% " + (a.label || "").replace(/^\s*\d+(\.\d+)?\s*%\s*/, "") + (a.except || a.part ? " (on part of cost)" : ""), X.S.text);
            ws.set(r, 6, EP.r2(a.amt), X.S.num, a.except || a.part ? null : "G" + (tot + 1) + "*" + a.pct + "/100"); box(ws, r, n); var add = r; r++;
            ws.set(r, 1, j === bu.adds.length - 1 ? "Cost for " + bu.basis + " " + inf.unit : "TOTAL", X.S.btext); ws.set(r, 6, EP.r2(a.run), X.S.bnum, "G" + (tot + 1) + "+G" + (add + 1)); box(ws, r, n); tot = r; r++;
          });
          if (!bu.adj && bu.basis && bu.basis !== 1) { ws.set(r, 1, "Cost for 1 " + inf.unit, X.S.btext); ws.set(r, 6, EP.r2(bu.total / bu.basis), X.S.bnum, "G" + (tot + 1) + "/" + bu.basis); box(ws, r, n); r++; }
          if (bu.adj) {
            ws.set(r, 1, "Adjustment to agree with " + (bkx ? bkx.short : "") + " item No. " + it.c + " (" + bu.adjNote + ", " + (bu.adjPct >= 0 ? "+" : "") + bu.adjPct.toFixed(2) + "%)", X.S.text); ws.set(r, 6, EP.r2(bu.adj), X.S.num); box(ws, r, n); var adr = r; r++;
            ws.set(r, 1, "Cost for " + EP.r3(bu.basis) + " " + inf.unit + " as per item No. " + it.c, X.S.btext); ws.set(r, 6, EP.r2(bu.total + bu.adj), X.S.bnum, "G" + (tot + 1) + "+G" + (adr + 1)); box(ws, r, n); tot = r; r++;
            if (bu.basis && bu.basis !== 1) { ws.set(r, 1, "Cost for 1 " + inf.unit, X.S.btext); ws.set(r, 6, EP.r2(bu.rate), X.S.bnum, "G" + (tot + 1) + "/" + bu.basis); box(ws, r, n); r++; }
          }
          if (!useBuild) {
            ws.set(r, 1, "Updated rate adopted: " + lr.how + (o && o.why ? " — " + o.why : ""), X.S.btext); ws.set(r, 6, lr.a, X.S.bnum); box(ws, r, n); ctx.anRow[key] = r; r++;
          } else { ws.set(r, 1, "Say (updated rate)", X.S.btext); ws.set(r, 6, lr.a, X.S.bnum); box(ws, r, n); ctx.anRow[key] = r; r++; }
        } else if (it.b === "x" && EP.nsCalc(it.x)) {
          r = nsAnalysis(ws, r, n, it, inf, lr, ctx, key);
        } else {
          r = heads(ws, r, ["", "Basis of rate", "", "", "Unit", "", "Rate (₹)"]);
          var bk = EP.BOOKS[it.b];
          ws.set(r, 1, it.b === "x" ? "Estimate rate — " + inf.src : "Rate as per " + (bk ? bk.long : "") + ", item " + it.c, X.S.text); ws.set(r, 4, inf.unit, X.S.center); ws.set(r, 6, lr.s, X.S.num); box(ws, r, n); r++;
          var why = it.b === "x" ? (it.x && it.x.why) : (o && o.why) || (EP.item(it.b, it.c) || {}).anNote;
          ws.set(r, 1, "Updated rate — " + lr.how + (why ? ": " + why : ""), X.S.btext); ws.set(r, 4, inf.unit, X.S.center); ws.set(r, 6, lr.a, X.S.bnum); box(ws, r, n); ctx.anRow[key] = r; r++;
        }
        if (start === 0) {}
      });
    });
    // sub-analyses, each once (queue grows while printing: a sub-analysis may use another one)
    if (subQ.length) {
      r++; ws.set(r, 0, "SUB-ANALYSES — analyses used as a line inside the item analyses above (each printed once)", X.S.bold); ws.merge(r, 0, r, n - 1); r++;
      for (var si = 0; si < subQ.length && si < 400; si++) {
        var sb = subQ[si][0], sc = subQ[si][1], sid = subId[sb + "|" + sc], san = EP.anOf(sb, sc), sit = EP.item(sb, sc), sB = EP.BOOKS[sb] || {};
        var so = EP.itemOvr(sb, sc), sbu = EP.build(sc, so && so.mode === "build" ? so : null, 0, sb); if (!sbu) continue;
        var sunit = (sit && sit.unit) || san.unit || "unit", sdesc = (sit && sit.desc) || san.title || san.note || sc;
        r++; ws.set(r, 0, sid, X.S.bold); ws.set(r, 1, sdesc, X.S.bold); ws.merge(r, 1, r, n - 1); ws.height(r, H(sdesc.length, 90)); r++;
        ws.set(r, 1, (mainPlain[sb + "|" + sc] ? "Also an item of this estimate. " : "") + "Analysis of " + (sB.short || sb) + " " + (sit ? "item No. " : "") + sc + " — details of cost for " + EP.r3(sbu.basis) + " " + sunit + (sB.basicNote ? "   (" + sB.basicNote + ")" : ""), X.S.itext); ws.merge(r, 1, r, n - 1); r++;
        r = heads(ws, r, ["Code", "Description", "Rate (₹)", "Per", "Unit", "Qty", "Amount (₹)"]);
        var sfirst = lineRows(sbu, sb, sc);
        var stot = r; ws.set(r, 1, "TOTAL", X.S.btext); ws.set(r, 6, EP.r2(sbu.sub), X.S.bnum, "SUM(G" + (sfirst + 1) + ":G" + r + ")"); box(ws, r, n); r++;
        sbu.adds.forEach(function (a, j) {
          ws.set(r, 1, "Add " + a.pct + "% " + (a.label || "").replace(/^\s*\d+(\.\d+)?\s*%\s*/, "") + (a.except || a.part ? " (on part of cost)" : ""), X.S.text);
          ws.set(r, 6, EP.r2(a.amt), X.S.num, a.except || a.part ? null : "G" + (stot + 1) + "*" + a.pct + "/100"); box(ws, r, n); var sadd = r; r++;
          ws.set(r, 1, j === sbu.adds.length - 1 ? "Cost for " + EP.r3(sbu.basis) + " " + sunit : "TOTAL", X.S.btext); ws.set(r, 6, EP.r2(a.run), X.S.bnum, "G" + (stot + 1) + "+G" + (sadd + 1)); box(ws, r, n); stot = r; r++;
        });
        if (sbu.adj) { ws.set(r, 1, "Adjustment to agree with " + (sB.short || "") + " " + sc + " (" + (sbu.adjPct >= 0 ? "+" : "") + sbu.adjPct.toFixed(2) + "%)", X.S.text); ws.set(r, 6, EP.r2(sbu.adj), X.S.num); box(ws, r, n); var sadr = r; r++;
          ws.set(r, 1, "Cost for " + EP.r3(sbu.basis) + " " + sunit, X.S.btext); ws.set(r, 6, EP.r2(sbu.total + sbu.adj), X.S.bnum, "G" + (stot + 1) + "+G" + (sadr + 1)); box(ws, r, n); stot = r; r++; }
        ws.set(r, 1, "Rate for 1 " + sunit + " (used in the analyses above)", X.S.btext); ws.set(r, 6, EP.r2(sbu.rate), X.S.bnum, sbu.basis && sbu.basis !== 1 ? "G" + (stot + 1) + "/" + sbu.basis : "G" + (stot + 1)); box(ws, r, n); r++;
      }
    }
    footer(ws, r + 1, n, doc);
  }

  /* ---------- Abstract (one block per part) ---------- */
  function abstract(wb, doc, ctx, linked) {
    var n = 9, ws = wb.sheet("Abstract", { cols: [6, 46, 7, 11, 11, 14, 11, 14, 20] }), r = 0, g = (+doc.gst || 0);
    doc.parts.forEach(function (p, pi) {
      if (pi) ws.pageBreak(r);
      r = header(ws, r, n, doc, "ABSTRACT OF COST", partTitle(doc, p));
      ["Sl. No.", "Description", "Unit", "Qty", "Estimate (SOR)", "", "Updated cost", "", "Remarks"].forEach(function (l, c) { ws.set(r, c, l, X.S.head); ws.set(r + 1, c, "", X.S.head); });
      ws.set(r + 1, 4, "Rate (₹)", X.S.head); ws.set(r + 1, 5, "Amount (₹)", X.S.head); ws.set(r + 1, 6, "Rate (₹)", X.S.head); ws.set(r + 1, 7, "Amount (₹)", X.S.head);
      [0, 1, 2, 3, 8].forEach(function (c) { ws.merge(r, c, r + 1, c); }); ws.merge(r, 4, r, 5); ws.merge(r, 6, r, 7); r += 2;
      var first = r;
      itemsOf(doc, p).forEach(function (it, ii) {
        var inf = EP.itemInfo(it), lr = EP.lineRates(doc, it), R = r + 1;
        ws.set(r, 0, ii + 1, X.S.center); ws.set(r, 1, inf.desc, X.S.text); ws.set(r, 2, inf.unit, X.S.center);
        ws.set(r, 3, lr.q, X.S.qty, linked && ctx.qtyRow[it.id] != null ? "Measurement!I" + (ctx.qtyRow[it.id] + 1) : null);
        ws.set(r, 4, lr.s, X.S.num); ws.set(r, 5, lr.sa, X.S.num, "ROUND(D" + R + "*E" + R + ",2)");
        ws.set(r, 6, lr.a, X.S.num, linked && ctx.anRow[anKey(it)] != null ? "Analysis!G" + (ctx.anRow[anKey(it)] + 1) : null);
        ws.set(r, 7, lr.aa, X.S.num, "ROUND(D" + R + "*G" + R + ",2)");
        ws.set(r, 8, inf.src + (it.rem ? " — " + it.rem : ""), X.S.text);
        ws.height(r, H(inf.desc.length, 46)); r++;
      });
      var t = EP.totals(doc).parts[pi], last = r;
      ws.set(r, 1, "TOTAL", X.S.btext); ws.set(r, 4, "Rs.", X.S.btext); ws.set(r, 5, t.s, X.S.bnum, last > first ? "SUM(F" + (first + 1) + ":F" + last + ")" : null); ws.set(r, 6, "Rs.", X.S.btext); ws.set(r, 7, t.a, X.S.bnum, last > first ? "SUM(H" + (first + 1) + ":H" + last + ")" : null); box(ws, r, n);
      ctx.partTot[p.id] = r; var tr = r + 1; r++;
      ws.set(r, 1, "Add GST @ " + g + "%", X.S.text); ws.set(r, 5, EP.r2(t.s * g / 100), X.S.num, "F" + tr + "*" + g + "/100"); ws.set(r, 7, EP.r2(t.a * g / 100), X.S.num, "H" + tr + "*" + g + "/100"); box(ws, r, n); r++;
      ws.set(r, 1, "Grand total", X.S.btext); ws.set(r, 5, EP.r2(t.s * (1 + g / 100)), X.S.bnum, "F" + tr + "+F" + (tr + 1)); ws.set(r, 7, EP.r2(t.a * (1 + g / 100)), X.S.bnum, "H" + tr + "+H" + (tr + 1)); box(ws, r, n); r++;
      r = footer(ws, r, n, doc) + 1;
    });
  }

  /* ---------- General abstract ---------- */
  function general(wb, doc, ctx, linked) {
    var n = 5, ws = wb.sheet("General Abstract", { cols: [7, 42, 18, 18, 22] }), r = 0, T = EP.totals(doc), g = (+doc.gst || 0);
    r = header(ws, r, n, doc, "GENERAL ABSTRACT OF COST", "");
    r = heads(ws, r, ["Sl. No.", "Description", "Estimate cost (SOR) ₹", "Updated cost ₹", "Remarks"]);
    var first = r;
    T.parts.forEach(function (p, i) {
      var tr = ctx.partTot[p.id];
      ws.set(r, 0, i + 1, X.S.center); ws.set(r, 1, p.name, X.S.text);
      ws.set(r, 2, p.s, X.S.num, linked && tr != null ? "Abstract!F" + (tr + 1) : null); ws.set(r, 3, p.a, X.S.num, linked && tr != null ? "Abstract!H" + (tr + 1) : null); ws.set(r, 4, "", X.S.text); r++;
    });
    var tr2 = r + 1;
    ws.set(r, 1, "TOTAL", X.S.btext); ws.set(r, 2, T.s, X.S.bnum, "SUM(C" + (first + 1) + ":C" + r + ")"); ws.set(r, 3, T.a, X.S.bnum, "SUM(D" + (first + 1) + ":D" + r + ")"); box(ws, r, n); r++;
    ws.set(r, 1, "Add GST @ " + g + "%", X.S.text); ws.set(r, 2, T.sg, X.S.num, "C" + tr2 + "*" + g + "/100"); ws.set(r, 3, T.ag, X.S.num, "D" + tr2 + "*" + g + "/100"); box(ws, r, n); r++;
    ws.set(r, 1, "Grand total", X.S.btext); ws.set(r, 2, T.sT, X.S.bnum, "C" + tr2 + "+C" + (tr2 + 1)); ws.set(r, 3, T.aT, X.S.bnum, "D" + tr2 + "+D" + (tr2 + 1)); box(ws, r, n); r++;
    ws.set(r, 1, "Say (₹ in lakh)", X.S.text); ws.set(r, 2, EP.r2(T.sT / 1e5), X.S.num, "ROUND(C" + (tr2 + 2) + "/100000,2)"); ws.set(r, 3, EP.r2(T.aT / 1e5), X.S.num, "ROUND(D" + (tr2 + 2) + "/100000,2)"); box(ws, r, n); r++;
    footer(ws, r, n, doc);
  }

  /* ---------- SOR / Non-SOR summary, without and with GST ---------- */
  function summary(wb, doc) {
    var n = 10, ws = wb.sheet("SOR & NS Summary", { cols: [6, 22, 18, 7, 16, 14, 16, 16, 14, 16] }), r = 0, g = (+doc.gst || 0);
    r = header(ws, r, n, doc, "SUMMARY OF SOR AND NON-SOR ITEMS (WITHOUT AND WITH GST)", "");
    r = heads(ws, r, ["Sl.", "Part", "Items", "No.", "Estimate cost (SOR) ₹", "GST " + g + "% ₹", "With GST ₹", "Updated cost ₹", "GST " + g + "% ₹", "With GST ₹"]);
    var rowsS = [], rowsN = [], sl = 0;
    function line(part, label, items, bold) {
      var sa = 0, aa = 0; items.forEach(function (it) { var lr = EP.lineRates(doc, it); sa += lr.sa; aa += lr.aa; });
      var R = r + 1, st = bold ? X.S.bnum : X.S.num;
      ws.set(r, 0, bold ? "" : ++sl, X.S.center); ws.set(r, 1, part, bold ? X.S.btext : X.S.text); ws.set(r, 2, label, bold ? X.S.btext : X.S.text); ws.set(r, 3, items.length, X.S.center);
      ws.set(r, 4, EP.r2(sa), st); ws.set(r, 5, EP.r2(sa * g / 100), st, "E" + R + "*" + g + "/100"); ws.set(r, 6, EP.r2(sa * (1 + g / 100)), st, "E" + R + "+F" + R);
      ws.set(r, 7, EP.r2(aa), st); ws.set(r, 8, EP.r2(aa * g / 100), st, "H" + R + "*" + g + "/100"); ws.set(r, 9, EP.r2(aa * (1 + g / 100)), st, "H" + R + "+I" + R);
      box(ws, r, n); r++; return R;
    }
    function sumRow(part, label, refs, cnt) {
      var R = r + 1; ws.set(r, 1, part, X.S.btext); ws.set(r, 2, label, X.S.btext); ws.set(r, 3, cnt, X.S.center);
      ["E", "F", "G", "H", "I", "J"].forEach(function (c, k) {
        var v = refs.reduce(function (a, rr) { return a + (ws.rows[rr - 1] && ws.rows[rr - 1][4 + k] ? +ws.rows[rr - 1][4 + k].v || 0 : 0); }, 0);
        ws.set(r, 4 + k, EP.r2(v), X.S.bnum, refs.map(function (rr) { return c + rr; }).join("+"));
      });
      box(ws, r, n); r++; return R;
    }
    var partTotals = [];
    doc.parts.forEach(function (p) {
      var its = itemsOf(doc, p), sor = its.filter(function (i) { return i.b !== "x"; }), ns = its.filter(function (i) { return i.b === "x"; });
      var a = line(p.name, "SOR items", sor), b = line(p.name, "Non-SOR (NS) items", ns);
      rowsS.push(a); rowsN.push(b);
      partTotals.push(sumRow(p.name, "Total of part", [a, b], its.length));
    });
    r++;
    var cS = doc.items.filter(function (i) { return i.b !== "x"; }).length, cN = doc.items.filter(function (i) { return i.b === "x"; }).length;
    sumRow("All parts", "SOR items", rowsS, cS);
    sumRow("All parts", "Non-SOR (NS) items", rowsN, cN);
    sumRow("All parts", "GRAND TOTAL", partTotals, cS + cN);
    ws.set(r, 1, "SOR items = items of CPWD DSR / MPPWD SOR / Horticulture / uploaded SORs. Non-SOR = NS items with market rate or rate analysis.", X.S.note); ws.merge(r, 1, r, n - 1); r++;
    footer(ws, r + 1, n, doc);
  }

  /* ---------- BOQ (for tender; rates left blank for bidders) ---------- */
  function boq(wb, doc, ctx, linked) {
    var n = 7, ws = wb.sheet("BOQ", { cols: [6, 50, 8, 11, 12, 24, 15] }), r = 0;
    doc.parts.forEach(function (p, pi) {
      if (pi) ws.pageBreak(r);
      r = header(ws, r, n, doc, "BILL OF QUANTITIES", partTitle(doc, p));
      r = heads(ws, r, ["Sl. No.", "Description of item", "Unit", "Quantity", "Rate (₹) in figures", "Rate in words", "Amount (₹)"]);
      var first = r;
      itemsOf(doc, p).forEach(function (it, ii) {
        var inf = EP.itemInfo(it), R = r + 1;
        ws.set(r, 0, ii + 1, X.S.center); ws.set(r, 1, inf.desc, X.S.text); ws.set(r, 2, inf.unit, X.S.center);
        ws.set(r, 3, EP.itemQty(doc, it), X.S.qty, linked && ctx.qtyRow[it.id] != null ? "Measurement!I" + (ctx.qtyRow[it.id] + 1) : null);
        ws.set(r, 4, "", X.S.num); ws.set(r, 5, "", X.S.text); ws.set(r, 6, 0, X.S.num, "IF(E" + R + "=\"\",0,D" + R + "*E" + R + ")");
        ws.height(r, H(inf.desc.length, 50)); r++;
      });
      ws.set(r, 1, "Total", X.S.btext); ws.set(r, 6, 0, X.S.bnum, r > first ? "SUM(G" + (first + 1) + ":G" + r + ")" : null); box(ws, r, n); r++;
      r = footer(ws, r, n, doc) + 1;
    });
  }

  /* which: all | meas | an | abs | gen | boq */
  EP.buildWorkbook = function (doc, which) {
    X = window.XW; var wb = X.book(), ctx = { qtyRow: {}, anRow: {}, partTot: {} }, all = which === "all";
    // Build hidden-order: Measurement and Analysis first so the abstract can link to them.
    if (all) { measurement(wb, doc, ctx); analysis(wb, doc, ctx); abstract(wb, doc, ctx, true); general(wb, doc, ctx, true); summary(wb, doc); boq(wb, doc, ctx, true); }
    else if (which === "sum") summary(wb, doc);
    else if (which === "meas") measurement(wb, doc, ctx);
    else if (which === "an") analysis(wb, doc, ctx);
    else if (which === "abs") abstract(wb, doc, ctx, false);
    else if (which === "gen") general(wb, doc, ctx, false);
    else if (which === "boq") boq(wb, doc, ctx, false);
    return wb.blob();
  };
  EP.download = function (blob, filename) {
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  };
})();
