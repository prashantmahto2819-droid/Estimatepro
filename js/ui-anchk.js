/* Estimate Pro — check and edit the rate analysis of every estimate item before export.
   * U.anTable(d, it): the item's analysis (same numbers the Excel "Analysis" sheet prints), numbered with the
     measurement / abstract Sl. No. and the SOR item code; quantities, rates and % can be changed for THIS estimate
     only (stored on the item as it.ab = {lines: {i: {q, r}}, adds: {j: pct}}).
   * "Analysis check" sub-tab: every item of every part with its SOR rate, analysis rate, adopted rate and a status. */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc, inr = U.inr;
  var SEC = { M: "Material", L: "Labour", C: "Carriage", P: "Machinery", T: "Hire / T&P", R: "Other items (added after overheads)", I: "Other SOR items" };
  S.anchk = { open: {}, only: "all", q: {}, saving: {} };
  S.savedAn = S.savedAn || [];
  function E() { return U.est; }
  function fx(v) { var x = +v; return isFinite(x) ? x : null; }

  /* status of one estimate line */
  U.anStatus = function (d, it) {
    var lr = EP.lineRates(d, it), inf = EP.itemInfo(it), out = { lr: lr, inf: inf, level: "ok", msg: "" };
    if (it.b === "x") { var nc = EP.nsCalc(it.x || {}); out.level = nc ? "ok" : "warn"; out.msg = nc ? "NS item with its own analysis" : "NS item without analysis — rate typed by hand"; return out; }
    if (inf.missing) { out.level = "err"; out.msg = "Item not found in the SOR"; return out; }
    var bu = EP.itemBuild(it); out.bu = bu;
    if (!EP.hasAn(it.b, it.c) && !bu) { out.level = "info"; out.noan = true; out.msg = "This book has no analysis for this item — SOR rate is used. You can make one."; return out; }
    if (bu && bu.custom) { out.level = bu.total > 0 ? "info" : "warn"; out.msg = bu.total > 0 ? "Rate analysis made for this estimate" : "Analysis started — add its lines"; return out; }
    if (!bu) { out.level = "warn"; out.msg = "Analysis could not be built"; return out; }
    var parts = [];
    if (bu.admin) { parts.push(EP.adminNote); out.level = "warn"; out.admin = true; }
    if (bu.far != null) { parts.push("MoRTH analysis with the same description differs " + (bu.far >= 0 ? "+" : "") + bu.far + "% from the SOR rate — check the analysis before you proceed"); out.level = "warn"; out.far = true; }
    else if (bu.adj) { parts.push("analysis differs from the SOR item by " + (bu.adjPct >= 0 ? "+" : "") + bu.adjPct.toFixed(1) + "% (shown as an adjustment line)"); out.level = Math.abs(bu.adjPct) > 10 ? "warn" : "info"; }
    if (EP.hasEstEdits(it)) { parts.push("analysis edited for this estimate"); if (out.level === "ok") out.level = "info"; }
    if (EP.ev(it.anr) != null) { parts.push("rate typed for this estimate: ₹" + inr(EP.ev(it.anr))); out.level = "warn"; }
    if (d.basis === "sor") parts.push("estimate set to SOR rates — analysis shown for checking only");
    var uw = bu.lines.filter(function (l) { return unitWarn(EP.BOOKS[it.b], l); }).length;
    if (uw) { parts.push(uw + " line(s) with a unit mismatch (rate per tonne, quantity in kg …)"); out.level = "warn"; }
    var miss = bu.lines.filter(function (l) { return l.r == null || !isFinite(l.amt); }).length;
    if (miss) { parts.push(miss + " line(s) without rate"); out.level = "warn"; }
    out.msg = parts.join(" · ") || "Analysis agrees with the adopted rate";
    return out;
  };

  /* a line whose rate is per a different unit of the same family than its quantity (e.g. rate per tonne, quantity in kg) */
  function unitWarn(B, l) {
    if (!B || !B.basic || !l.code || !B.basic[l.code] || l.r == null) return null;
    var b = B.basic[l.code], bu = b[1], k = EP.unitConv(bu, l.unit);
    if (!k || Math.abs(k - 1) < 1e-9) return null;
    var base = EP.basicAn(l.code, B.id), expect = base / k;
    if (!base || Math.abs(l.r - expect) / expect < 0.05) return null;          // already converted
    if (Math.abs(l.r - base) / base < 0.05) return { msg: "Unit check: the rate ₹" + inr(l.r) + " is the basic rate per " + bu + ", but the quantity is in " + l.unit + ". Per " + l.unit + " it should be ₹" + inr(expect) + ".", r: EP.r2(expect) };
    return null;
  }
  U.anTable = function (d, it, R) {
    var st = U.anStatus(d, it), inf = st.inf, lr = st.lr, B = EP.BOOKS[it.b];
    var sl = EP.slOf ? EP.slOf(d, it) : "", pn = (d.parts.filter(function (p) { return p.id === it.part; })[0] || {}).name || "";
    var h = "<div class='anbox'><div class='row' style='gap:8px;flex-wrap:wrap;align-items:baseline'><strong>" + esc(pn) + " item " + esc(sl) + "</strong><span>" + esc(it.b === "x" ? "Non-SOR item" : (B ? B.short : it.b) + " item No. " + it.c) + " · per " + esc(inf.unit) + "</span>" +
      "<span class='badge " + ({ ok: "ok", info: "info", warn: "warn", err: "dan" }[st.level]) + "' style='white-space:normal'>" + esc(st.msg) + "</span></div>";
    if (it.b === "x" || !st.bu) {
      h += "<div class='muted' style='font-size:13px;margin-top:6px'>SOR rate ₹" + inr(lr.s) + " · rate used ₹" + inr(lr.a) + " (" + esc(lr.how) + ")" + (it.b === "x" ? " — open the item in Items & measurement to edit its NS analysis." : "") + "</div>";
      if (st.noan && !R) h += "<div class='row' style='gap:8px;margin-top:6px;flex-wrap:wrap'><button type='button' class='btn pri sm' data-abnew='" + it.id + "'>Make a rate analysis for this item</button><span class='muted' style='font-size:12px'>Add labour, material and machinery lines (from basic rates, other SOR items or MoRTH / market); overheads and profit are added as in " + esc(B ? B.short : "the book") + ". Saved analyses can be reused later.</span></div>";
      return h + U.savedAnBox(it, R, true) + "</div>";
    }
    var bu = st.bu, an = EP.anOf(it.b, it.c), ab = it.ab || {}, ref = B && B.refLabel ? B.refLabel(an) : "";
    h += "<div class='muted' style='font-size:12px;margin:4px 0'>Details of cost for " + (R ? esc(EP.r3(bu.basis)) : "<input class='in small n" + (ab.basis ? " edited" : "") + "' style='width:80px' data-abbasis='" + it.id + "' value='" + esc(EP.r3(bu.basis)) + "' title='Quantity this analysis is worked out for. The rate = cost ÷ this quantity (no adjustment line).' aria-label='Analysis is for this quantity'>") + " " + esc(inf.unit) + (B && B.basicNote ? " · " + esc(B.basicNote) : "") + (ref ? " · " + esc(ref) : "") + "</div>";
    if (bu.admin) h += "<div class='ds-msg admmsg' role='note' style='margin:4px 0'><b>" + esc(EP.adminNote) + "</b></div>";
    h += "<div class='tw'><table class='t antab'><thead><tr><th>Code</th><th>Description</th><th>Unit</th><th class='num'>Qty</th><th class='num'>Rate ₹</th><th class='num'>Amount ₹</th><th></th></tr></thead><tbody>";
    var sec = null;
    var addedHdr = false;
    bu.lines.forEach(function (l, i) {
      if (l.extra != null) {
        if (!addedHdr) { addedHdr = true; h += "<tr><td></td><td colspan='6'><strong>Lines added by you</strong> <span class='muted' style='font-size:12px'>(overheads / GST / profit are added on these too)</span></td></tr>"; }
        h += extraRow(it, l, R); return;
      }
      if (l.sec && l.sec !== sec) { sec = l.sec; h += "<tr><td></td><td colspan='6'><strong>" + (SEC[sec] || sec) + "</strong></td></tr>"; }
      var e = ab.lines && ab.lines[i] || {}, fam = EP.unitFamily(l.unit0 || l.unit), warn = unitWarn(B, l);
      var ucell = fam.length > 1 && !R ? "<select class='in small' data-abu='" + it.id + "|" + i + "' aria-label='Unit' title='Show this line in another unit — quantity and rate convert, amount stays the same'>" + fam.map(function (u) { return "<option" + (u === (EP.unitInfo(l.unit) || [])[2] ? " selected" : "") + ">" + esc(u) + "</option>"; }).join("") + "</select>" : esc(l.unit || "");
      var hasSub = l.code && l.code !== it.c && EP.anOf(it.b, l.code), skey = it.id + "|" + l.code, sopen = hasSub && S.anchk.sub && S.anchk.sub[skey];
      h += "<tr" + (l.removed ? " class='rmrow'" : warn ? " class='adjrow'" : "") + "><td style='white-space:nowrap'>" + esc(l.code || "") + "</td><td>" + (S.anchk.edd && S.anchk.edd[it.id + "|" + i] && !R ? "<input class='in small' style='width:100%' data-abd='" + it.id + "|" + i + "' value='" + esc(l.desc) + "' aria-label='Description'><select class='in small' data-absec='" + it.id + "|" + i + "' aria-label='Kind of cost' style='margin-top:3px'>" + SECOPT.map(function (o) { return "<option value='" + o[0] + "'" + ((l.sec || "M") === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>" : "<div class='desc" + (l.edDesc ? " edtxt" : "") + "' title='" + esc(l.desc) + "'>" + esc(l.desc) + "</div>") + (R ? "" : "<button type='button' class='btn ghost sm' data-abed='" + it.id + "|" + i + "' title='Edit the description / kind of this line'>" + (S.anchk.edd && S.anchk.edd[it.id + "|" + i] ? "Done" : "✎ Edit text") + "</button>") + (hasSub ? "<button type='button' class='btn ghost sm' data-absub='" + esc(skey) + "'>" + (sopen ? "Hide" : "Show") + " analysis of " + esc(l.code) + "</button>" + (sopen ? subTable(it.b, l.code) : "") : "") + (warn ? "<div class='badge warn' style='white-space:normal;margin-top:3px'>" + esc(warn.msg) + (R ? "" : " <button type='button' class='btn ghost sm' data-abfix='" + it.id + "|" + i + "|" + warn.r + "'>Use ₹" + inr(warn.r) + " per " + esc(l.unit) + "</button>") + "</div>" : "") + "</td><td>" + ucell + (l.per && l.per !== 1 ? " per " + l.per : "") + "</td>" +
        "<td class='num'>" + (l.q != null ? "<input class='in small n" + (e.q != null ? " edited" : "") + "' id='abq-" + it.id + "-" + i + "' data-abq='" + it.id + "|" + i + "' value='" + esc(e.q != null ? e.q : l.q) + "' title='Number or formula, e.g. =360/4.5*0.08' aria-label='Quantity'" + (R ? " disabled" : "") + ">" : "") + "</td>" +
        "<td class='num'>" + (l.r != null ? "<input class='in small n" + (e.r != null ? " edited" : "") + "' id='abr-" + it.id + "-" + i + "' data-abr='" + it.id + "|" + i + "' value='" + esc(e.r != null ? e.r : EP.r2(l.r)) + "' title='Number or formula, e.g. =650*1.1' aria-label='Rate'" + (R ? " disabled" : "") + ">" : "") + "</td>" +
        "<td class='num'>" + inr(l.amt) + "</td><td>" + (R ? "" : "<button type='button' class='btn ghost sm' data-abx='" + it.id + "|" + i + "' title='" + (l.removed ? "Put this line back" : "Remove this line from the analysis of this item") + "' aria-label='" + (l.removed ? "Restore line" : "Remove line") + "'>" + (l.removed ? "Restore" : "✕") + "</button>") + "</td></tr>";
    });
    h += "<tr><td></td><td><strong>Total</strong></td><td></td><td></td><td></td><td class='num'><strong>" + inr(bu.sub) + "</strong></td><td></td></tr>";
    bu.adds.forEach(function (a, j) {
      var pe = ab.adds && ab.adds[j] != null;
      h += "<tr><td></td><td>Add " + esc(String(a.label || "").replace(/^\s*\d+(\.\d+)?\s*%\s*/, "")) + (a.except || a.part ? " (on part of cost)" : "") + "</td><td></td><td class='num'>" + (a.except ? esc(a.pct) + "%" : "<input class='in small n" + (pe ? " edited" : "") + "' id='aba-" + it.id + "-" + j + "' data-aba='" + it.id + "|" + j + "' value='" + esc(pe ? ab.adds[j] : a.pct) + "' aria-label='Percent'" + (R ? " disabled" : "") + ">%") + "</td><td></td><td class='num'>" + inr(a.amt) + "</td><td></td></tr>";
    });
    h += "<tr><td></td><td><strong>Cost for " + esc(EP.r3(bu.basis)) + " " + esc(inf.unit) + " as per analysis</strong></td><td></td><td></td><td></td><td class='num'><strong>" + inr(bu.total) + "</strong></td><td></td></tr>";
    if (bu.adj) h += "<tr class='adjrow" + (bu.far != null ? " far" : "") + "'><td></td><td>" + (bu.far != null ? "<span class='badge warn'>Large difference — check</span> " : "") + "Adjustment to agree with " + esc(B.short) + " item No. " + esc(it.c) + " (" + esc(bu.adjNote) + ", " + (bu.adjPct >= 0 ? "+" : "") + bu.adjPct.toFixed(2) + "%)" + (R ? "" : "<br><label class='row' style='gap:6px;font-weight:400;font-size:12px'><input type='checkbox' data-abnoadj='" + it.id + "'> Use the analysis rate without this adjustment (after checking the analysis)</label>") + "</td><td></td><td></td><td></td><td class='num'>" + inr(bu.adj) + "</td><td></td></tr>";
    if (bu.noAdj) h += "<tr class='adjrow'><td></td><td>Adjustment of ₹" + inr(bu.adjDropped) + " to the SOR rate dropped — the rate is the analysis rate" + (R ? "" : "<br><label class='row' style='gap:6px;font-weight:400;font-size:12px'><input type='checkbox' checked data-abnoadj='" + it.id + "'> Use the analysis rate without the adjustment</label>") + "</td><td></td><td></td><td></td><td class='num'>0.00</td><td></td></tr>";
    if (bu.basis !== 1 || bu.adj) h += "<tr><td></td><td><strong>Rate for 1 " + esc(inf.unit) + "</strong></td><td></td><td></td><td></td><td class='num'><strong>" + inr(bu.rate) + "</strong></td><td></td></tr>";
    h += "<tr class='finrow'><td></td><td><strong>Rate used in the abstract (" + esc(lr.how) + ")</strong>" + (Math.abs((lr.a || 0) - bu.rate) > 0.005 && EP.ev(it.anr) == null && d.basis !== "sor" ? "<div class='muted' style='font-size:12px;font-weight:400'>₹" + inr(bu.rate) + " rounded " + ((EP.BOOKS[it.b] || {}).round === 1 ? "to the whole rupee" : "to 5 paise") + " as in the " + esc(B.short) + " book</div>" : "") + "</td><td></td><td></td><td></td><td class='num'><strong>₹" + inr(lr.a) + "</strong></td><td></td></tr>";
    h += "</tbody></table></div>";
    if (!R) h += addPanel(it);
    if (U.reqBox) h += U.reqBox(it, bu, R);
    h += "<div class='row' style='gap:8px;flex-wrap:wrap;margin-top:6px'><span class='muted' style='font-size:12px'>SOR rate ₹" + inr(lr.s) + ". Changing, adding or removing a line here changes this estimate only; the Excel analysis prints the same figures.</span>" + (!R && EP.hasEstEdits(it) ? "<button type='button' class='btn ghost sm' data-abreset='" + it.id + "'>Undo my analysis edits</button>" : "") + "</div>";
    h += U.savedAnBox(it, R, true);
    if (S.anchk.back === it.id && S.est.sub !== "check") h += "<div class='row' style='margin-top:8px'><button type='button' class='btn pri sm' data-anback='1'>← Back to Analysis check</button></div>";
    return h + "</div>";
  };

  /* ---------- lines added by the user (it.ab.extra) ---------- */
  var SECOPT = [["M", "Material"], ["L", "Labour"], ["P", "Machinery"], ["C", "Carriage"], ["R", "After overheads"]];
  function extraRow(it, l, R) {
    var j = l.extra, x = (it.ab && it.ab.extra || [])[j] || {}, live = x.t === "b" || x.t === "i", dis = R ? " disabled" : "";
    var srcTxt = x.t === "b" ? "basic rate · " + ((EP.BOOKS[x.b] || {}).short || x.b) : x.t === "i" ? "SOR item · " + ((EP.BOOKS[x.b] || {}).short || x.b) : "own line";
    var h = "<tr class='exrow'><td style='white-space:nowrap'>" + esc(x.c || "") + "<div class='muted' style='font-size:10px'>" + esc(srcTxt) + "</div></td>";
    h += "<td>" + (x.t === "m" && !R ? "<input class='in small' style='width:100%' id='abxe-" + it.id + "-" + j + "-d' data-abxe='" + it.id + "|" + j + "|d' value='" + esc(x.d || "") + "' placeholder='Description (e.g. as per MoRTH 5.03)' aria-label='Description'>" : "<div class='desc'>" + esc(x.d || "") + "</div>") +
      (R ? "" : "<select class='in small' data-abxe='" + it.id + "|" + j + "|sec' aria-label='Kind of cost' style='margin-top:3px'>" + SECOPT.map(function (o) { return "<option value='" + o[0] + "'" + ((x.sec || "M") === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select>") + "</td>";
    h += "<td>" + (x.t === "m" && !R ? "<input class='in small' style='width:70px' data-abxe='" + it.id + "|" + j + "|u' value='" + esc(x.u || "") + "' placeholder='unit' aria-label='Unit'>" : esc(x.u || "")) + "</td>";
    h += "<td class='num'><input class='in small n edited' id='abxe-" + it.id + "-" + j + "-q' data-abxe='" + it.id + "|" + j + "|q' value='" + esc(x.q != null ? x.q : "") + "' aria-label='Quantity'" + dis + "></td>";
    h += "<td class='num'><input class='in small n" + (x.r != null && x.r !== "" ? " edited" : "") + "' data-abxe='" + it.id + "|" + j + "|r' value='" + esc(x.r != null && x.r !== "" ? x.r : "") + "' placeholder='" + (live && l.r != null ? EP.r2(l.r) : "rate") + "' title='" + (live ? "Leave empty to use the current rate (₹" + inr(l.r) + ")" : "Rate") + "' aria-label='Rate'" + dis + "></td>";
    h += "<td class='num'>" + inr(l.amt) + "</td><td>" + (R ? "" : "<button type='button' class='btn ghost sm' data-abxdel='" + it.id + "|" + j + "' aria-label='Delete added line' title='Delete this added line'>✕</button>") + "</td></tr>";
    return h;
  }
  function addPanel(it) {
    var q = S.anchk.q[it.id] || "";
    return "<div class='abadd'><div class='row' style='gap:6px;flex-wrap:wrap;align-items:center'><strong style='font-size:13px'>Add a line</strong>" +
      "<input class='in grow' style='min-width:220px' id='abs-" + it.id + "' data-abs='" + it.id + "' value='" + esc(q) + "' placeholder='Search a basic rate (mason, cement, JCB, bitumen…) or an SOR item code / words' aria-label='Search a basic rate or SOR item to add'>" +
      "<button type='button' class='btn sec sm' data-abown='" + it.id + "' title='A line you type yourself, e.g. taken from the MoRTH Data Book or a market quote'>+ Own line (MoRTH / market)</button></div>" +
      "<div class='abres' id='absr-" + it.id + "'>" + searchHtml(it, q) + "</div></div>";
  }
  function searchHtml(it, q) {
    q = String(q || "").trim().toLowerCase(); if (q.length < 2) return "";
    var words = q.split(/\s+/), out = [], B = EP.BOOKS[it.b];
    function hit(code, txt) { var c = String(code).toLowerCase(), t = String(txt).toLowerCase(); return c.indexOf(q) === 0 || words.every(function (w) { return t.indexOf(w) >= 0 || c.indexOf(w) >= 0; }); }
    var books = [it.b].concat(Object.keys(EP.BOOKS).filter(function (k) { return k !== it.b && EP.BOOKS[k].basic; }));
    books.forEach(function (bk) { var bb = EP.BOOKS[bk] && EP.BOOKS[bk].basic; if (!bb || out.length >= 12) return;
      Object.keys(bb).forEach(function (k) { if (out.length < 12 && !/^H\d{3}$/.test(k) && hit(k, bb[k][0])) out.push(["b", bk, k, bb[k][0], bb[k][1], EP.basicAn(k, bk), bb[k][4]]); }); });
    if (out.length < 12 && B) B.list.forEach(function (x) { if (out.length < 16 && x.code !== it.c && hit(x.code, x.desc)) out.push(["i", it.b, x.code, x.desc, x.unit, EP.anRate(it.b, x.code), "I"]); });
    if (!out.length) return "<div class='muted' style='font-size:12px;padding:4px'>Nothing found. Use “+ Own line” to type it.</div>";
    return out.map(function (r) { return "<button type='button' class='abpick' data-abpick='" + esc([it.id, r[0], r[1], r[2]].join("|")) + "'><span class='muted' style='font-size:11px'>" + (r[0] === "b" ? "Basic rate · " : "SOR item · ") + esc((EP.BOOKS[r[1]] || {}).short || r[1]) + "</span> <strong>" + esc(r[2]) + "</strong> " + esc(String(r[3]).slice(0, 110)) + " <span class='num'>₹" + inr(r[5]) + "/" + esc(r[4]) + "</span></button>"; }).join("");
  }
  function subTable(b, c, depth) {
    var bu = EP.build(c, null, 0, b), an = EP.anOf(b, c), si = EP.item(b, c); if (!bu) return "";
    var h = "<div class='subtab'><div class='muted' style='font-size:11px'>Analysis of " + esc(c) + " — " + esc((si && si.desc) || an.title || "") + " · cost for " + esc(EP.r3(bu.basis)) + " " + esc((si && si.unit) || an.unit || "") + "</div><table class='t'><tbody>";
    bu.lines.forEach(function (l) { h += "<tr><td>" + esc(l.code || "") + "</td><td>" + esc(l.desc || "") + "</td><td>" + esc(l.unit || "") + "</td><td class='num'>" + (l.q != null ? EP.r3(l.q) : "") + "</td><td class='num'>" + (l.r != null ? inr(l.r) : "") + "</td><td class='num'>" + inr(l.amt) + "</td></tr>"; });
    bu.adds.forEach(function (a) { h += "<tr><td></td><td>Add " + esc(a.pct) + "% " + esc(String(a.label || "").replace(/^\s*\d+(\.\d+)?\s*%\s*/, "")) + "</td><td></td><td></td><td></td><td class='num'>" + inr(a.amt) + "</td></tr>"; });
    h += "<tr><td></td><td><strong>Rate for 1 " + esc((si && si.unit) || an.unit || "unit") + "</strong></td><td></td><td></td><td></td><td class='num'><strong>" + inr(bu.rate) + "</strong></td></tr></tbody></table></div>";
    return h;
  }
  function kindSec(k) { return k === "L" ? "L" : k === "M" ? "P" : k === "I" ? "R" : "M"; }
  function cleanAb(it) { if (it.ab && !EP.hasEstEdits(it)) delete it.ab; EP.bump(); }

  /* ---------- my saved analyses (Supabase: user_analyses) ---------- */
  function savedFor(b, c) { return (S.savedAn || []).filter(function (x) { return x.book === b && x.code === c; }); }
  U.savedFor = savedFor;
  U.loadSavedAn = async function () {
    try { var r = await U.db().from("user_analyses").select("id,owner,team_id,book,code,name,data,updated_at").order("updated_at", { ascending: false }); if (r.error) r = await U.db().from("user_analyses").select("id,book,code,name,data,updated_at").order("updated_at", { ascending: false }); if (!r.error) { S.savedAn = r.data || []; U.render(); } } catch (e) { /* table not there yet */ }
  };
  U.savedAnBox = function (it, R, inTable) {
    if (!it || it.b === "x") return "";
    var list = savedFor(it.b, it.c), h = "";
    if (!list.length && (R || !EP.hasEstEdits(it))) return "";
    h += "<div class='savedan'><div class='row' style='gap:8px;flex-wrap:wrap;align-items:center'><strong style='font-size:13px'>My saved analyses for " + esc(((EP.BOOKS[it.b] || {}).short || it.b) + " item " + it.c) + "</strong>";
    if (!R && EP.hasEstEdits(it)) {
      if (S.anchk.saving[it.id]) h += "<input class='in small' style='width:220px' id='absn-" + it.id + "' value='" + esc(it.abName || "My analysis") + "' aria-label='Name of the saved analysis'>" + ((S.grp && S.grp.myTeams || []).length ? "<select class='in small' id='absg-" + it.id + "' aria-label='Who can use it'><option value=''>Only me</option>" + S.grp.myTeams.map(function (t) { return "<option value='" + esc(t.team_id) + "'>Me + group " + esc(t.team) + "</option>"; }).join("") + "</select>" : "") + "<button type='button' class='btn pri sm' data-absavego='" + it.id + "'>Save</button><button type='button' class='btn ghost sm' data-absave='" + it.id + "'>Cancel</button>";
      else h += "<button type='button' class='btn sec sm' data-absave='" + it.id + "' title='Keep these changes (added / removed / changed lines) to use again on this item in any estimate'>Save this analysis for future use</button>";
    }
    h += "</div>";
    if (list.length) h += "<div class='row' style='gap:6px;flex-wrap:wrap;margin-top:6px'>" + list.map(function (x) {
      var cur = it.abSaved === x.id;
      var own = !x.owner || x.owner === S.me.id, tn = x.team_id && S.grp ? ((S.grp.myTeams || []).filter(function (t) { return t.team_id === x.team_id; })[0] || {}).team : "";
      return "<span class='badge " + (cur ? "ok" : "info") + "' style='white-space:normal;display:inline-flex;gap:6px;align-items:center'>" + esc(x.name || "My analysis") + " · " + esc(U.when ? U.when(x.updated_at) : "") + (own ? "" : " · by " + esc(U.nameOf(x.owner))) + (tn ? " · group " + esc(tn) : "") + (cur ? " · in use" : "") +
        (R ? "" : " <button type='button' class='btn " + (cur ? "ghost" : "pri") + " sm' data-abapply='" + it.id + "|" + x.id + "'>" + (cur ? "Apply again" : "Use") + "</button>" + (own ? "<button type='button' class='btn ghost sm' data-abdelsaved='" + x.id + "' title='Delete this saved analysis'>Delete</button>" : "")) + "</span>";
    }).join("") + "</div>";
    return h + "</div>";
  };
  async function saveAn(it, name) {
    var data = JSON.parse(JSON.stringify(it.ab || {})), ex = savedFor(it.b, it.c).filter(function (x) { return x.name === name && (!x.owner || x.owner === S.me.id); })[0], r;
    var tsel = document.getElementById("absg-" + it.id), team = tsel && tsel.value ? tsel.value : null, body = { data: data };
    if (tsel) body.team_id = team;
    if (ex) r = await U.db().from("user_analyses").update(body).eq("id", ex.id).select("*").single();
    else r = await U.db().from("user_analyses").insert(Object.assign({ owner: S.me.id, book: it.b, code: it.c, name: name }, body)).select("*").single();
    if (U.fail(r, "Couldn't save the analysis.")) return;
    S.savedAn = [r.data].concat((S.savedAn || []).filter(function (x) { return x.id !== r.data.id; }));
    E().change(function () { var t = E().findItem(it.id); if (t) { t.abSaved = r.data.id; t.abName = name; } });
    S.anchk.saving[it.id] = false; U.render(); U.toast("Saved — it will be offered whenever you use " + it.c + " again");
  }

  /* ---------- Analysis check sub-tab ---------- */
  U.anCheckView = function (d) {
    var R = E().ro(), rows = [], cnt = { ok: 0, info: 0, warn: 0, err: 0 };
    d.parts.forEach(function (p) { EP.partItems(d, p.id).forEach(function (it, i) { var st = U.anStatus(d, it); cnt[st.level]++; rows.push({ p: p, it: it, sl: i + 1, st: st }); }); });
    var only = S.anchk.only;
    var h = "<div class='panel' style='padding:12px;display:flex;flex-direction:column;gap:10px'><div class='row' style='gap:8px;flex-wrap:wrap;align-items:center'><h3 class='grow' style='margin:0'>Check the rate analysis of every item before export</h3>" +
      "<div class='seg' role='group' aria-label='Show'>" + [["all", "All (" + rows.length + ")"], ["attn", "Needs a look (" + (cnt.warn + cnt.err) + ")"], ["edited", "Edited"]].map(function (x) { return "<button type='button' data-ancf='" + x[0] + "' aria-pressed='" + (only === x[0]) + "'>" + x[1] + "</button>"; }).join("") + "</div>" +
      "<button type='button' class='btn ghost sm' data-anall='1'>Open all</button><button type='button' class='btn ghost sm' data-anall='0'>Close all</button>" + (R ? "" : "<button type='button' class='btn sec sm' data-abnoall='1' title='For every item whose analysis differs from the book rate by up to 5%: rate = analysis cost ÷ quantity, no adjustment line. Items with a large difference are left for you to check one by one.'>Use analysis ÷ quantity for all (remove adjustments up to 5%)</button><button type='button' class='btn ghost sm' data-abnoall='0'>Restore adjustments</button>") + "</div>" +
      (U.upgradeView ? U.upgradeView(d) : "") + "<p class='muted' style='margin:0;font-size:13px'>Item numbers are the same as in the measurement and abstract. Open an item to see its analysis line by line and change quantities, rates or % for this estimate. The Excel “Analysis” sheet prints exactly these figures.</p>";
    h += "<div class='tw'><table class='t'><thead><tr><th>Item</th><th>SOR item</th><th>Description</th><th>Unit</th><th class='num'>SOR rate ₹</th><th class='num'>Rate used ₹</th><th>Check</th><th></th></tr></thead><tbody>";
    rows.forEach(function (x) {
      var it = x.it, st = x.st, B = EP.BOOKS[it.b];
      if (only === "attn" && !(st.level === "warn" || st.level === "err")) return;
      if (only === "edited" && !(EP.hasEstEdits(it) || EP.ev(it.anr) != null)) return;
      var op = !!S.anchk.open[it.id];
      h += "<tr><td class='num' style='white-space:nowrap'>" + esc(d.parts.length > 1 ? x.p.name + " · " : "") + x.sl + "</td><td style='white-space:nowrap'>" + esc(it.b === "x" ? "NS" : (B ? B.short : it.b)) + "<br><strong>" + esc(st.inf.code || "") + "</strong></td><td><div class='desc'>" + esc(st.inf.desc) + "</div></td><td>" + esc(st.inf.unit) + "</td><td class='num'>" + inr(st.lr.s) + "</td><td class='num'>" + inr(st.lr.a) + "</td>" +
        "<td><span class='badge " + ({ ok: "ok", info: "info", warn: "warn", err: "dan" }[st.level]) + "' style='white-space:normal'>" + esc(st.level === "ok" ? "OK" : st.msg) + "</span></td><td style='white-space:nowrap'><button type='button' class='btn " + (op ? "pri" : "sec") + " sm' data-anop='" + it.id + "'>" + (op ? "Close" : "Analysis") + "</button>" + (!R && it.b !== "x" ? " <button type='button' class='btn " + (st.noan ? "pri" : "ghost") + " sm' data-anmake='" + it.id + "' title='Open this item in Items & measurement to " + (st.noan ? "make" : "edit") + " its analysis'>" + (st.noan ? "Make analysis →" : "Edit in measurement →") + "</button>" : "") + "</td></tr>";
      if (op) h += "<tr><td colspan='8' style='background:var(--raised)'>" + U.anTable(d, it, R) + "</td></tr>";
    });
    if (!rows.length) h += "<tr><td colspan='8' class='empty'>No items yet.</td></tr>";
    h += "</tbody></table></div></div>";
    return h;
  };

  /* ---------- events ---------- */
  function setAb(id, kind, idx, val) {
    E().change(function () {
      var it = E().findItem(id); if (!it) return;
      var ab = it.ab = it.ab || { lines: {}, adds: {} }; ab.lines = ab.lines || {}; ab.adds = ab.adds || {};
      var v = String(val).trim().replace(/^=/, ""), n = v === "" ? null : EP.ev(v);
      if (v !== "" && n == null) { U.toast("Couldn't read “" + val + "”. Type a number or a formula such as =360/4.5*0.08"); return; }
      if (kind === "a") { if (v === "" || n == null) delete ab.adds[idx]; else ab.adds[idx] = n; }
      else { var o = ab.lines[idx] || {}; if (v === "" || n == null) delete o[kind]; else o[kind] = n; if (Object.keys(o).length) ab.lines[idx] = o; else delete ab.lines[idx]; }
      delete it.abSaved; cleanAb(it);
    });
  }
  function setUnit(id, i, u) {
    E().change(function () {
      var it = E().findItem(id); if (!it) return;
      var bu = EP.itemBuild(it), l = bu && bu.lines[+i]; if (!l) return;
      var ab = it.ab = it.ab || { lines: {}, adds: {} }; ab.lines = ab.lines || {}; ab.adds = ab.adds || {};
      var o = ab.lines[i] || {}, k = EP.unitConv(l.unit, u);
      if (k && o.q != null) o.q = +(o.q * k).toPrecision(10);
      if (k && o.r != null) o.r = +(o.r / k).toPrecision(10);
      if (EP.unitConv(l.unit0, u) === 1 || u === l.unit0) delete o.u; else o.u = u;
      if (Object.keys(o).length) ab.lines[i] = o; else delete ab.lines[i];
      delete it.abSaved; cleanAb(it);
    });
  }
  function modAb(id, fn) {
    E().change(function () {
      var it = E().findItem(id); if (!it) return;
      var ab = it.ab = it.ab || { lines: {}, adds: {} }; ab.lines = ab.lines || {}; ab.adds = ab.adds || {}; ab.extra = ab.extra || [];
      fn(it, ab); if (!ab.extra.length) delete ab.extra; delete it.abSaved; cleanAb(it);
    });
  }
  document.addEventListener("input", function (e) {
    var t = e.target, ds = t.dataset || {};
    if (ds.abs) { S.anchk.q[ds.abs] = t.value; var box = document.getElementById("absr-" + ds.abs), it = E().findItem(ds.abs); if (box && it) box.innerHTML = searchHtml(it, t.value); }
  });
  document.addEventListener("change", function (e) {
    var t = e.target, ds = t.dataset || {};
    if (ds.abxe) { var x = ds.abxe.split("|"), f = x[2], v = t.value; modAb(x[0], function (it, ab) { var l = ab.extra[+x[1]]; if (!l) return;
      if (f === "q" || f === "r") { var n = String(v).trim() === "" ? null : EP.ev(String(v).trim().replace(/^=/, "")); if (n == null && String(v).trim() !== "") { U.toast("Enter a number"); return; } l[f] = n; } else l[f] = v; }); return; }
    if (ds.abd) { var pd = ds.abd.split("|"), dv = t.value.trim(); modAb(pd[0], function (it, ab) { var bu0 = EP.build(it.c, null, 0, it.b), orig = bu0 && bu0.lines[+pd[1]] ? bu0.lines[+pd[1]].desc : ""; var o = ab.lines[pd[1]] || {}; if (!dv || dv === orig) delete o.d; else o.d = dv; if (Object.keys(o).length) ab.lines[pd[1]] = o; else delete ab.lines[pd[1]]; }); return; }
    if (ds.absec) { var ps = ds.absec.split("|"), sv2 = t.value; modAb(ps[0], function (it, ab) { var o = ab.lines[ps[1]] || {}; o.sec = sv2; ab.lines[ps[1]] = o; }); return; }
    if (ds.abbasis) { var bv = EP.ev(String(t.value).trim().replace(/^=/, "")); modAb(ds.abbasis, function (it, ab) { var b0 = (EP.anOf(it.b, it.c) || {}).b || 1; if (bv == null || bv <= 0 || Math.abs(bv - b0) < 1e-9) delete ab.basis; else ab.basis = bv; }); return; }
    if (ds.abnoadj) { var on = t.checked; modAb(ds.abnoadj, function (it, ab) { if (on) ab.noAdj = 1; else delete ab.noAdj; }); return; }
  });
  document.addEventListener("change", function (e) {
    var t = e.target, ds = t.dataset || {};
    if (ds.abu) { var pu = ds.abu.split("|"); setUnit(pu[0], pu[1], t.value); return; }
    if (ds.abq) { var p = ds.abq.split("|"); setAb(p[0], "q", p[1], t.value); }
    else if (ds.abr) { var q = ds.abr.split("|"); setAb(q[0], "r", q[1], t.value); }
    else if (ds.aba) { var a = ds.aba.split("|"); setAb(a[0], "a", a[1], t.value); }
  });
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("button"); if (!t) return;
    var ds = t.dataset;
    if (ds.anop) { S.anchk.open[ds.anop] = !S.anchk.open[ds.anop]; U.render(); }
    else if (ds.ancf) { S.anchk.only = ds.ancf; U.render(); }
    else if (ds.anall != null) { var d = E().doc(); S.anchk.open = {}; if (ds.anall === "1" && d) d.items.forEach(function (it) { S.anchk.open[it.id] = true; }); U.render(); }
    else if (ds.abfix) { var f = ds.abfix.split("|"); setAb(f[0], "r", f[1], f[2]); U.toast("Rate converted to the quantity's unit"); }
    else if (ds.abnew) { var nid = ds.abnew; E().change(function () { var it = E().findItem(nid); if (!it) return; var adds = EP.NS_ADDS[it.b] || (it.b === "hort" ? EP.NS_ADDS.cpwd23 : []); it.ab = { lines: {}, adds: {}, extra: [], custom: 1, basis: 1, cA: adds.map(function (a) { return [EP.ev(a.p) || 0, a.l]; }) }; delete it.abSaved; EP.bump(); }); S.anchk.open[nid] = true; U.render(); setTimeout(function () { var n = document.getElementById("abs-" + nid); if (n) n.focus(); }, 80); U.toast("Analysis started — search a basic rate or add your own line"); }
    else if (ds.anmake) { var mk = E().findItem(ds.anmake); if (!mk) return; S.est.sub = "items"; S.est.part = mk.part; S.est.open = {}; S.est.open[mk.id] = true; S.anchk.open[mk.id] = true; S.anchk.back = mk.id; U.render(); setTimeout(function () { var n = document.querySelector("[data-anop='" + mk.id + "']") || document.getElementById("abs-" + mk.id); if (n) n.scrollIntoView({ block: "center" }); }, 80); }
    else if (ds.anback) { var bid = S.anchk.back; S.anchk.back = null; S.est.sub = "check"; S.anchk.open = {}; if (bid) S.anchk.open[bid] = true; U.render(); setTimeout(function () { var n = document.querySelector("button[data-anop='" + bid + "']"); if (n) n.scrollIntoView({ block: "center" }); }, 80); }
    else if (ds.abed) { S.anchk.edd = S.anchk.edd || {}; S.anchk.edd[ds.abed] = !S.anchk.edd[ds.abed]; U.render(); }
    else if (ds.abnoall) { var dd = E().doc(), on2 = ds.abnoall === "1", cnt2 = 0; E().change(function () { dd.items.forEach(function (it) { if (it.b === "x" || !EP.hasAn(it.b, it.c)) return; if (on2) { var bu2 = EP.itemBuild(it); if (bu2 && (bu2.adj || bu2.noAdj) && bu2.far == null && Math.abs(bu2.adjPct) <= 5) { it.ab = it.ab || { lines: {}, adds: {} }; it.ab.noAdj = 1; cnt2++; } } else if (it.ab && it.ab.noAdj) { delete it.ab.noAdj; cleanAb(it); cnt2++; } }); EP.bump(); }); U.toast(on2 ? cnt2 + " item(s): rate = analysis ÷ quantity, adjustment lines removed" : cnt2 + " item(s): adjustment lines restored"); }
    else if (ds.absub) { S.anchk.sub = S.anchk.sub || {}; S.anchk.sub[ds.absub] = !S.anchk.sub[ds.absub]; U.render(); }
    else if (ds.abx) { var rx = ds.abx.split("|"); modAb(rx[0], function (it, ab) { var o = ab.lines[rx[1]] || {}; if (o.x) delete o.x; else o.x = 1; if (Object.keys(o).length) ab.lines[rx[1]] = o; else delete ab.lines[rx[1]]; }); }
    else if (ds.abxdel) { var xd = ds.abxdel.split("|"); modAb(xd[0], function (it, ab) { ab.extra.splice(+xd[1], 1); }); }
    else if (ds.abown) { var oid = ds.abown; modAb(oid, function (it, ab) { ab.extra.push({ t: "m", c: "", d: "", u: "", q: 1, r: null, sec: "M" }); }); setTimeout(function () { var it = E().findItem(oid), j = it && it.ab && it.ab.extra ? it.ab.extra.length - 1 : 0, n = document.getElementById("abxe-" + oid + "-" + j + "-d"); if (n) n.focus(); }, 60); }
    else if (ds.abpick) { var pk = ds.abpick.split("|"), pid = pk[0], tp = pk[1], bk = pk[2], code = pk.slice(3).join("|"), row;
      if (tp === "b") { var bb = EP.BOOKS[bk].basic[code]; row = { t: "b", b: bk, c: code, d: bb[0], u: bb[1], q: null, r: null, sec: kindSec(bb[4]) }; }
      else { var si = EP.item(bk, code); row = { t: "i", b: bk, c: code, d: (EP.BOOKS[bk].short || bk) + " item " + code + ": " + (si ? si.desc : ""), u: si ? si.unit : "", q: null, r: null, sec: "M" }; }
      S.anchk.q[pid] = ""; modAb(pid, function (it, ab) { ab.extra.push(row); });
      setTimeout(function () { var it = E().findItem(pid), j = it && it.ab && it.ab.extra ? it.ab.extra.length - 1 : 0, n = document.getElementById("abxe-" + pid + "-" + j + "-q"); if (n) n.focus(); }, 60); U.toast("Line added — enter its quantity"); }
    else if (ds.absave) { S.anchk.saving[ds.absave] = !S.anchk.saving[ds.absave]; U.render(); setTimeout(function () { var n = document.getElementById("absn-" + ds.absave); if (n) { n.focus(); n.select(); } }, 60); }
    else if (ds.absavego) { var sit = E().findItem(ds.absavego), nm = ((document.getElementById("absn-" + ds.absavego) || {}).value || "").trim() || "My analysis"; if (sit) saveAn(sit, nm.slice(0, 80)); }
    else if (ds.abapply) { var ap = ds.abapply.split("|"), sv = (S.savedAn || []).filter(function (x) { return x.id === ap[1]; })[0]; if (!sv) return;
      E().change(function () { var it = E().findItem(ap[0]); if (!it) return; it.ab = JSON.parse(JSON.stringify(sv.data || {})); it.abSaved = sv.id; it.abName = sv.name; cleanAb(it); }); S.anchk.open[ap[0]] = true; U.render(); U.toast("Saved analysis “" + (sv.name || "") + "” applied to this item"); }
    else if (ds.abdelsaved) { if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again to delete"; return; }
      U.db().from("user_analyses").delete().eq("id", ds.abdelsaved).then(function (r) { if (U.fail(r, "Couldn't delete.")) return; S.savedAn = S.savedAn.filter(function (x) { return x.id !== ds.abdelsaved; }); U.render(); U.toast("Saved analysis deleted"); }); }
    else if (ds.abreset) { E().change(function () { var it = E().findItem(ds.abreset); if (it) { delete it.ab; delete it.abSaved; } EP.bump(); }); U.toast("Analysis edits for this item removed"); }
  });
})();
