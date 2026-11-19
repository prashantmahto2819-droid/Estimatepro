/* Estimate Pro — rate library (all SORs), basic rates, and user-uploaded SORs */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc, inr = U.inr;
  function db() { return U.db(); }
  function isUser(b) { return b.indexOf("u:") === 0; }
  function canEditBook(b) { return true; } // everyone: personal rates; editors may switch to the shared library

  /* ---------- library ---------- */
  U.views.library = function () {
    var L = S.lib; if (!EP.BOOKS[L.book]) L.book = "cpwd";
    var B = EP.BOOKS[L.book], list = B.list;
    var q = L.q.trim().toLowerCase(), words = q ? q.split(/\s+/) : [];
    var f = list.filter(function (it) {
      if (L.ch && it.ch !== L.ch) return false;
      if (L.edited && !(EP.itemOvr(L.book, it.code) || it.an != null)) return false;
      if (!words.length) return true;
      var c = it.code.toLowerCase(); if (c.indexOf(q) === 0) return true;
      var d = it.desc.toLowerCase(); return words.every(function (w) { return d.indexOf(w) >= 0 || c.indexOf(w) >= 0; });
    });
    var chs = Object.keys(B.ch).sort(function (a, b) { return (parseFloat(a) || 999) - (parseFloat(b) || 999); }).map(function (k) { return [k, (k === "C" ? "" : k + " · ") + B.ch[k]]; });
    var h = '<div class="split"><section style="min-width:0;display:flex;flex-direction:column;gap:12px">';
    h += '<div class="row"><h1 class="grow">Rate library</h1></div>' + (U.scopeBar ? U.scopeBar() : "") + '<div style="display:none"></div><div class="seg wrap" role="group" aria-label="Schedule of rates">' + Object.keys(EP.BOOKS).map(function (k) { return '<button type="button" data-book="' + esc(k) + '" aria-pressed="' + (L.book === k) + '">' + esc(EP.BOOKS[k].name) + (isUser(k) ? " (mine)" : "") + "</button>"; }).join("") + '<button type="button" class="ghost" data-goto="sors">+ Upload SOR</button></div>';
    h += '<p class="muted" style="margin:0">' + esc(B.long) + ". " + (L.book === "em22" ? "SOR rates are the printed CPWD DSR (E&M) 2022 rates with Correction Slip No. 1. Items carry their DAR (E&M) 2022 rate analysis (materials + 1% cartage, labour, 12% GST with multiplying factor 0.1405, 15% overheads & profit). The updated rate is that analysis re-priced with your current basic rates." : L.book === "cpwd23" ? "SOR rates are the printed DSOR 2023 rates (Vol. 1 & 2). About 3,060 items carry their DAR 2023 rate analysis, including 18% GST on works contract (multiplying factor 0.2127), 15% CPOH, 1% water and 1% cess. The updated rate is that analysis re-priced with your current basic rates." : L.book === "cpwd" ? "SOR rates are the printed DSR 2021 rates (Vol. 1 & 2, Dec 2021). The updated rate is the rate analysis re-priced with your current basic rates." : (L.book === "mp25" ? "SOR rates are the printed MPPWD Road & Bridge SOR 2025 rates (in force from 11.04.2025). About 960 items carry the MoRTH Standard Data Book 2019 analysis matched to the SOR description (small-project quantities; overheads 12% + profit 10% roads, 20% + 10% bridges, 30% + 10% rehabilitation; plant to site 10 km). Where the printed rate differs from the standard analysis the difference is shown as an adjustment line, so the analysis always ends at the SOR rate; change a basic rate and the item is re-priced. Electrical, laboratory, survey and supply items carry the SOR rate only. " : L.book === "mp" ? "SOR rates are the printed MPPWD Road & Bridge SOR 2017 rates. 309 items carry a rate analysis — mostly the MoRTH Standard Data Book analysis matched by description (a few from the MPPWD 2014 analysis) — priced with labour, material and machinery rates of 01.04.2026 (overheads 10% + profit 10% for roads, 25% + 10% for bridges). For those the updated rate comes from the analysis. Other items start at the SOR rate." : "The updated rate starts equal to the SOR rate.")) + (canEditBook(L.book) ? " You can change updated rates." : " Editors can change updated rates.") + "</p>";
    h += '<div class="row"><input id="lib-q" class="in grow" placeholder="Search code or words" aria-label="Search items" value="' + esc(L.q) + '"><select id="lib-ch" class="in" aria-label="Chapter" style="max-width:280px"><option value="">All chapters</option>' + chs.map(function (c) { return '<option value="' + esc(c[0]) + '"' + (c[0] === L.ch ? " selected" : "") + ">" + esc(c[1]) + "</option>"; }).join("") + '</select><label class="row" style="gap:6px"><input type="checkbox" id="lib-ed"' + (L.edited ? " checked" : "") + "> Changed only</label></div>";
    h += '<div class="muted" style="font-size:12px">' + f.length + " items" + (f.length > 200 ? " · showing the first 200, refine the search" : "") + "</div>";
    h += '<div class="tw"><table class="t"><thead><tr><th>Item</th><th>Description</th><th>Unit</th><th class="num">SOR rate ₹</th><th class="num">Updated rate ₹</th><th></th></tr></thead><tbody>';
    h += f.slice(0, 200).map(function (it) {
      var s = it.sor, a = EP.anRate(L.book, it.code), o = EP.itemOvr(L.book, it.code), badge = "";
      if (o || it.an != null) badge = '<span class="badge ' + (U.isMine(L.book + ":i:" + EP.enc(it.code)) ? "info" : "ed") + '">' + esc(EP.modeLabel(L.book, it.code)) + (U.isMine(L.book + ":i:" + EP.enc(it.code)) ? " · mine" : "") + "</span>";
      else if (it.src === "esta") badge = '<span class="badge warn" title="Not found in the printed DSR PDFs; rate from the ESTA file">ESTA rate</span>';
      else if (it.src === "build") badge = '<span class="badge warn">No DSR rate</span>';
      return '<tr class="click' + (L.sel === it.code ? " sel" : "") + '" data-item="' + esc(it.code) + '" tabindex="0"><td style="white-space:nowrap"><strong>' + esc(it.code) + '</strong></td><td><div class="desc">' + esc(it.desc) + "</div></td><td>" + esc(it.unit) + '</td><td class="num">' + inr(s) + '</td><td class="num">' + inr(a) + "</td><td>" + badge + "</td></tr>";
    }).join("") || '<tr><td colspan="6" class="empty">Nothing matches. Clear the search or pick another chapter.</td></tr>';
    h += "</tbody></table></div></section>";
    return h + '<aside class="panel side" id="detail">' + viewDetail() + "</aside></div>";
  };
  function viewDetail() {
    var L = S.lib, c = L.sel; if (!c) return '<div class="empty">Pick an item to see its SOR rate, its updated rate and the analysis behind it.</div>';
    var it = EP.item(L.book, c); if (!it) return '<div class="empty">Item not found.</div>';
    var saved = EP.itemOvr(L.book, c), user = isUser(L.book), hasB = EP.hasAn(L.book, c);
    var d = L.draft || (saved ? JSON.parse(JSON.stringify(saved)) : { mode: user && it.an != null ? "manual" : (hasB ? "an" : "sor"), manual: it.an, why: it.anNote || "" });
    if (d.mode === "build") d.mode = "an";
    L.draft = d;
    var R = !canEditBook(L.book), s = it.sor, B = EP.BOOKS[L.book];
    var h = '<div style="display:flex;flex-direction:column;gap:14px"><div><div class="lbl">' + esc(B.name) + " · item " + esc(c) + " · per " + esc(it.unit) + '</div><h3 style="margin-top:4px">' + esc(it.desc) + "</h3></div>";
    h += '<div class="rates"><div class="rbox"><div class="lbl">SOR rate (locked)</div><div class="v">₹' + inr(s) + "</div>" + (it.src === "esta" ? '<div class="muted" style="font-size:12px">Not in the printed DSR; rate from the ESTA file</div>' : it.src === "dsr" && it.esta != null && Math.abs(it.esta - s) > 0.01 ? '<div class="muted" style="font-size:12px">ESTA file had ₹' + inr(it.esta) + "</div>" : "") + '</div><div class="rbox an"><div class="lbl" style="color:var(--accent-text)">Updated rate</div><div class="v" id="an-rate">₹' + inr(EP.anRate(L.book, c)) + '</div><div style="font-size:12px" id="an-diff"></div></div></div>';
    h += '<fieldset style="border:0;margin:0;padding:0;display:flex;gap:14px;flex-wrap:wrap"><legend class="lbl" style="margin-bottom:6px">Updated rate comes from</legend>' +
      (hasB ? radio("an", "Rate analysis" + (saved && saved.mode === "build" ? " (edited)" : ""), d, R) : "") + radio("sor", "SOR rate", d, R) + radio("manual", "Enter rate", d, R) + "</fieldset>";
    if (d.mode === "manual") h += '<label class="row"><span class="lbl">Updated rate ₹</span><input id="man-rate" class="in n" value="' + (d.manual != null ? d.manual : s) + '"' + (R ? " disabled" : "") + "></label>";
    if (hasB) {
      var an = EP.anOf(L.book, c), b = EP.build(c, d.lines || d.adds ? d : null, 0, L.book), Bk = EP.BOOKS[L.book];
      var refl = Bk.refLabel ? Bk.refLabel(an) : "";
      if (an && an.admin) h += "<div class='ds-msg admmsg' role='note'><b>" + esc(EP.adminNote) + "</b> This analysis was made by a user and approved by the admin (the book has no analysis for this item).</div>";
      if (EP.farNote && EP.farNote(L.book, c)) h += "<div class='ds-msg farmsg' role='note'><b>MoRTH analysis differs a lot from the SOR rate.</b> " + esc(EP.farNote(L.book, c)) + "</div>";
      h += '<div><div class="row"><div class="lbl grow">Rate analysis of ' + esc(Bk.short) + " item No. " + esc(c) + " · details of cost for " + esc(EP.r3(an.b || 1)) + " " + esc(it.unit) + (Bk.basicNote ? " · " + esc(Bk.basicNote) : "") + (refl ? " · " + esc(refl) : "") + "</div></div>";
      h += '<div class="tw" style="margin-top:6px"><table class="t"><thead><tr><th>Code</th><th>Description</th><th class="num">Qty</th><th class="num">Rate ₹</th><th class="num">Amount ₹</th></tr></thead><tbody>';
      var sec = null;
      an.L.forEach(function (l, i) {
        if (l[7] && l[7] !== sec) { sec = l[7]; h += "<tr><td></td><td colspan='4'><strong>" + ({ M: "Material", L: "Labour", C: "Carriage", P: "Machinery" }[sec] || sec) + "</strong></td></tr>"; }
        var lo = d.lines && d.lines[i], qe = lo && lo.q != null, re = lo && lo.r != null, bo = l[0] && Bk.basic && Bk.basic[l[0]] && EP.basicOvr(l[0], L.book);
        h += "<tr><td style='white-space:nowrap'>" + esc(l[0]) + "</td><td><div class='desc' title='" + esc(l[1]) + "'>" + esc(l[1]) + "</div><span class='muted' style='font-size:11px'>" + esc(l[4]) + (l[3] && l[3] !== 1 ? " per " + l[3] : "") + (bo ? " · basic rate changed" : "") + "</span></td>" +
          "<td class='num'>" + (l[5] != null ? "<input class='in small n" + (qe ? " edited" : "") + "' id='lq-" + i + "' data-lq='" + i + "' value='" + (qe ? lo.q : l[5]) + "'" + (R ? " disabled" : "") + " aria-label='Quantity'>" : "") + "</td>" +
          "<td class='num'>" + (l[2] != null ? "<input class='in small n" + (re ? " edited" : "") + "' id='lr-" + i + "' data-lr='" + i + "' value='" + (re ? lo.r : EP.r2(b.lines[i].r)) + "'" + (R ? " disabled" : "") + " aria-label='Rate'>" : "") + "</td>" +
          "<td class='num' id='la-" + i + "'>" + inr(b.lines[i].amt) + "</td></tr>";
      });
      h += "<tr><td></td><td><strong>Total</strong></td><td></td><td></td><td class='num' id='sub'>" + inr(b.sub) + "</td></tr>";
      an.A.forEach(function (a, j) { var pe = d.adds && d.adds[j] != null; h += "<tr><td></td><td>Add " + esc(a[1]) + (a[2] ? " (on part only)" : "") + "</td><td class='num'>" + (a[2] ? a[0] + "%" : "<input class='in small n" + (pe ? " edited" : "") + "' id='ad-" + j + "' data-ad='" + j + "' value='" + (pe ? d.adds[j] : a[0]) + "'" + (R ? " disabled" : "") + " aria-label='Percent'>%") + "</td><td></td><td class='num' id='aa-" + j + "'>" + inr(b.adds[j].amt) + "</td></tr>"; });
      h += "<tr><td></td><td><strong>Cost for " + esc(an.b || 1) + " " + esc(it.unit) + "</strong></td><td></td><td></td><td class='num' id='tot'>" + inr(b.total) + "</td></tr>" + (b.adj ? "<tr class='adjrow" + (b.far != null ? " far" : "") + "'><td></td><td>" + (b.far != null ? "<span class='badge warn'>Large difference — check</span> " : "") + "Adjustment to agree with " + esc(Bk.short) + " item No. " + esc(c) + " (" + esc(b.adjNote) + ", " + (b.adjPct >= 0 ? "+" : "") + b.adjPct.toFixed(2) + "%)</td><td></td><td></td><td class='num'>" + inr(b.adj) + "</td></tr>" : "") + ((b.basis !== 1 || b.adj) ? "<tr class='finrow'><td></td><td><strong>Rate for 1 " + esc(it.unit) + "</strong></td><td></td><td></td><td class='num'><strong>" + inr(b.rate) + "</strong></td></tr>" : "") + "</tbody></table></div><p class='muted' style='font-size:12px;margin:6px 0 0'>Line rates already include your basic-rate changes. Editing a quantity, rate or % here changes only this item.</p></div>";
    }
    h += '<label style="display:flex;flex-direction:column;gap:4px"><span class="lbl">Reason (printed in the analysis sheet)</span><input id="why" class="in" value="' + esc(d.why || "") + '" placeholder="e.g. Market rate survey Sep 2026"' + (R ? " disabled" : "") + "></label>";
    if (saved && saved.by) h += '<div class="muted" style="font-size:12px">Last changed by ' + esc(U.nameOf(saved.by)) + " · " + U.when(saved.at) + "</div>";
    if (R) h += '<div class="badge info" style="align-self:flex-start">Only editors can change library rates. You can still enter a rate for one estimate.</div>';
    else h += '<div class="row"><button class="btn pri" id="save-item" type="button">Save updated rate</button><button class="btn ghost" id="reset-item" type="button">Reset</button></div>';
    if (S.est.mine.length) h += '<div class="row" style="border-top:1px solid var(--line);padding-top:12px;flex-wrap:wrap"><select id="to-est" class="in grow" aria-label="Estimate">' + S.est.mine.map(function (e) { return '<option value="' + esc(e.id) + '">' + esc(e.name) + "</option>"; }).join("") + '</select><button class="btn sec" id="to-add" type="button">Add to estimate</button></div>';
    return h + "</div>";
  }
  function radio(v, label, d, R) { return '<label class="row" style="gap:6px"><input type="radio" name="mode" value="' + v + '"' + (d.mode === v ? " checked" : "") + (R ? " disabled" : "") + "> " + label + "</label>"; }
  function draftRate() {
    var L = S.lib, d = L.draft || {}, s = EP.sorRate(L.book, L.sel);
    if (d.mode === "manual") return d.manual != null ? d.manual : s;
    if (d.mode === "sor") return s;
    if (EP.hasAn(L.book, L.sel)) return EP.roundRate(L.book, EP.build(L.sel, d.lines || d.adds ? d : null, 0, L.book).rate);
    return s;
  }
  U.after = function () {
    var L = S.lib; if (S.tab !== "library" || !L.sel || !document.getElementById("an-rate")) return;
    var d = L.draft || {}, s = EP.sorRate(L.book, L.sel), a = draftRate();
    if (EP.hasAn(L.book, L.sel)) {
      var b = EP.build(L.sel, d.lines || d.adds ? d : null, 0, L.book);
      b.lines.forEach(function (x, i) { var n = document.getElementById("la-" + i); if (n) n.textContent = inr(x.amt); });
      b.adds.forEach(function (x, j) { var n = document.getElementById("aa-" + j); if (n) n.textContent = inr(x.amt); });
      var su = document.getElementById("sub"), to = document.getElementById("tot"); if (su) su.textContent = inr(b.sub); if (to) to.textContent = inr(b.total);
    }
    document.getElementById("an-rate").textContent = "₹" + inr(a);
    var df = a - s; document.getElementById("an-diff").textContent = !s || Math.abs(df) < 0.005 ? "Same as SOR" : (df > 0 ? "+" : "−") + "₹" + inr(Math.abs(df)) + " (" + (df > 0 ? "+" : "−") + Math.abs(df / s * 100).toFixed(1) + "%) vs SOR";
  };
  async function saveItem() {
    var L = S.lib, d = L.draft, c = L.sel;
    if (isUser(L.book)) {
      var sorId = L.book.slice(2), an = d.mode === "manual" ? (d.manual != null ? d.manual : null) : null;
      var r = await db().from("user_sor_items").update({ an_rate: an, an_note: d.why || "" }).eq("sor_id", sorId).eq("code", c);
      if (U.fail(r, "Couldn't save.")) return; var it = EP.item(L.book, c); it.an = an; it.anNote = d.why || ""; EP.bump(); L.draft = null; U.toast("Saved"); U.render(); return;
    }
    var id = L.book + ":i:" + EP.enc(c), edited = d.lines || d.adds;
    if (d.mode === "an" && !edited && !d.why) { if (EP.itemOvr(L.book, c)) await U.ovrDel(id); L.draft = null; U.toast("Updated rate follows the rate analysis"); U.render(); return; }
    var body = { mode: d.mode === "an" ? (edited ? "build" : "an") : d.mode, why: d.why || "" };
    if (d.mode === "manual") body.manual = d.manual != null ? d.manual : EP.sorRate(L.book, c);
    if (body.mode === "build") { body.lines = d.lines || {}; body.adds = d.adds || {}; }
    if (body.mode === "an") body.mode = "an";
    if (await U.ovrSet(id, body)) { U.toast("Saved updated rate for " + c); L.draft = null; U.render(); }
  }

  /* ---------- one master SOR for labour / materials / machinery ---------- */
  function linkBar(B) {
    var kd = B.kind, kn = EP.KINDN[kd] || "rates", src = EP.linkSrc(kd), books = Object.keys(EP.BOOKS).filter(function (k) { return EP.BOOKS[k].basic; });
    var h = '<div class="panel" style="padding:10px 12px;display:flex;flex-direction:column;gap:6px"><div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><strong>Same ' + kn + ' rates in every SOR</strong>';
    if (src === B.book) h += '<span class="badge ok">This SOR is the master for ' + kn + '</span><button type="button" class="btn ghost sm" data-blink="off">Stop</button>';
    else h += '<button type="button" class="btn sec sm" data-blink="on">Use these ' + kn + ' rates in all SORs</button>' + (src ? '<span class="badge info">Now following ' + esc(EP.BOOKS[src].name) + '</span>' : "");
    h += "</div>";
    if (src) h += '<div class="muted" style="font-size:12px">' + books.filter(function (b) { return b !== src; }).map(function (b) { var st = EP.linkStats(src, b, kd); return st && st.all ? esc(EP.BOOKS[b].name) + ": " + st.hit + " of " + st.all + " matched" : ""; }).filter(Boolean).join(" · ") +
      ". Matched items take the master's current rate (change it once in the master). Items with no match, and any rate you type in a SOR, stay as they are.</div>";
    else h += '<div class="muted" style="font-size:12px">Make this SOR the master: its ' + kn + ' rates are then used in every other SOR (CPWD 2021 ↔ 2023 by code; MPPWD / E&M labour by trade and class, e.g. Mazdoor = Beldar, Mason Ist class = Mason 1st class). Saved for ' + (U.scopeBar ? "the scope chosen above" : "you") + ".</div>";
    return h + "</div>";
  }
  /* ---------- HPC wages (CIL order for contractors' workers in mines): pick which labour of this SOR gets which HPC category ---------- */
  function hpcGuess(name) {
    var n = String(name || "").toLowerCase();
    if (/^hpc/.test(n)) return "";
    if (/2nd class|ii\s*nd|second class|assistant|helper|semi|grade 2|mate|supervis/.test(n)) return "ss";
    if (/highly skilled|special|technician|engineer/.test(n)) return "hs";
    if (/unskilled|beldar|coolie|mazdoor|bhisti|chowkidar|khallasi|mali|sweeper|watchman|sewer|rock (excavator|breaker|hole)|bandhani|security guard without/.test(n) && !/skilled beldar/.test(n)) return "u";
    return "sk";
  }
  function hpcBar(B) {
    var H = S.basic.hpc, basic = EP.BOOKS[B.book].basic || {};
    var h = '<div class="panel" style="padding:10px 12px;display:flex;flex-direction:column;gap:6px"><div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><strong>HPC wages (CIL, w.e.f. 01.10.2026)</strong><span class="muted" style="font-size:12px">' + EP.HPC.map(function (x) { return esc(x[2]) + " ₹" + inr(EP.hpcRate(x[0]) || 0); }).join(" · ") + ' — basic rates H101–H104 of CPWD DSOR 2023</span><button type="button" class="btn sec sm" data-hpc="toggle">' + (H ? "Close" : "Apply HPC wages to labour of this SOR…") + "</button></div>";
    if (!H) return h + "</div>";
    var codes = Object.keys(basic).filter(function (c) { return basic[c][4] === "L" && !/^H\d{3}$/.test(c) && /day/i.test(basic[c][1] || ""); });
    h += '<p class="muted" style="margin:0;font-size:12px">Tick the labour that should be paid HPC wages and pick its category. Saved as your rate changes (scope above) — every analysis of this SOR using that labour is re-priced. Untick to leave a rate as it is.</p>';
    h += '<div class="tw" style="max-height:340px;overflow:auto"><table class="t"><thead><tr><th><input type="checkbox" data-hpcall="1" aria-label="Tick all"></th><th>Code</th><th>Labour</th><th class="num">Now ₹/day</th><th>HPC category</th><th class="num">HPC ₹/day</th></tr></thead><tbody>' + codes.map(function (c) {
      var st = H.sel[c] || (H.sel[c] = { cat: hpcGuess(basic[c][0]), on: false }), r = st.cat ? EP.hpcRate(st.cat) : null;
      return "<tr><td><input type='checkbox' data-hpcon='" + esc(c) + "'" + (st.on ? " checked" : "") + "></td><td>" + esc(c) + "</td><td>" + esc(basic[c][0]) + "</td><td class='num'>" + inr(EP.basicAn(c, B.book)) + "</td><td><select class='in small' data-hpccat='" + esc(c) + "'><option value=''>— not HPC —</option>" + EP.HPC.map(function (x) { return "<option value='" + x[0] + "'" + (st.cat === x[0] ? " selected" : "") + ">" + esc(x[2]) + "</option>"; }).join("") + "</select></td><td class='num'>" + (r != null ? inr(r) : "—") + "</td></tr>";
    }).join("") + "</tbody></table></div>";
    var n = codes.filter(function (c) { return H.sel[c] && H.sel[c].on && H.sel[c].cat; }).length;
    h += '<div class="row" style="gap:8px"><button type="button" class="btn pri sm" data-hpc="apply"' + (n && !H.busy ? "" : " disabled") + ">" + (H.busy ? "Saving… " + (H.done || 0) + " / " + n : "Apply HPC wages to " + n + " labour rate" + (n === 1 ? "" : "s")) + "</button></div>";
    return h + "</div>";
  }
  async function hpcApply() {
    var H = S.basic.hpc, bb = S.basic.book || "cpwd"; if (!H || H.busy) return;
    var list = Object.keys(H.sel).filter(function (c) { return H.sel[c].on && H.sel[c].cat && EP.hpcRate(H.sel[c].cat) != null; });
    H.busy = true; H.done = 0; U.render();
    for (var i = 0; i < list.length; i++) { var c = list[i]; var ok = await U.ovrSet(bb + ":b:" + EP.enc(c), { r: EP.hpcRate(H.sel[c].cat), hpc: H.sel[c].cat }); if (!ok) break; H.done++; }
    H.busy = false; EP.bump(); U.toast("HPC wages applied to " + H.done + " labour rate" + (H.done === 1 ? "" : "s") + " of " + EP.BOOKS[bb].name); S.basic.hpc = null; U.render();
  }
  /* ---------- basic rates ---------- */
  U.views.basic = function () {
    var B = S.basic; B.book = B.book && EP.BOOKS[B.book] && EP.BOOKS[B.book].basic ? B.book : "cpwd";
    var BK = EP.BOOKS[B.book], basic = BK.basic || {}, q = B.q.trim().toLowerCase(), usage = (EP.usage && EP.usage[B.book]) || {};
    if (B.kind === "H" && B.book !== "cpwd23") B.kind = "L";
    var rows = Object.keys(basic).filter(function (k) { var b = basic[k], hm = /^H\d{3}$/.test(k); if (B.kind === "H" ? !hm : (hm || b[4] !== B.kind)) return false; if (!q) return true; return k.toLowerCase().indexOf(q) === 0 || String(b[0]).toLowerCase().indexOf(q) >= 0; });
    var R = false, pre = B.book + ":b:", ne = Object.keys(S.ovr).filter(function (k) { return k.indexOf(pre) === 0 && k.indexOf(":b:@link:") < 0; }).length;
    var h = '<div style="display:flex;flex-direction:column;gap:12px"><div class="row"><h1 class="grow">Basic rates</h1><span class="badge ed">' + ne + " changed</span></div>" + (U.scopeBar ? U.scopeBar() : "");
    h += '<div class="seg" role="group" aria-label="Schedule of rates">' + Object.keys(EP.BOOKS).filter(function (k) { return EP.BOOKS[k].basic; }).map(function (k) { return '<button type="button" data-bbook="' + esc(k) + '" aria-pressed="' + (B.book === k) + '">' + esc(EP.BOOKS[k].name) + "</button>"; }).join("") + "</div>";
    h += '<p class="muted" style="margin:0;max-width:860px">' + (B.book === "em22" ? "Basic rates of labour and materials (ICD codes) used by the CPWD DAR (E&M) 2022 analyses, without GST. Enter your current rate and every E&M 2022 item using it is re-priced; cartage, GST (×0.1405) and 15% overheads & profit are added as in the DAR." : B.book === "mp25" ? "Labour, machinery and material rates used by the MPPWD SOR 2025 analyses (MoRTH SDB 2019). They are at the SOR 2025 price level: machinery = SDB 2019 usage rates × 0.45 and labour back-calculated from the SOR rates; materials from SOR 2025 note 5.3 and chapter 1. Enter today's rate and every MPPWD 2025 item using it is re-priced." : B.book === "mp" ? "Labour, machinery and material rates used by the MPPWD rate analyses (as on 01.04.2026, with the SOR 2014 rate for reference). Change a rate and every MPPWD item whose analysis uses it is re-priced." : (B.book === "cpwd23" ? "Basic rates of DAR 2023 (as on 01.04.2023, without GST). Material and machinery rates follow your 2021 analysis file (see the choice below); labour is as per DAR / your own changes. Sundries (9999 / 9977 / 9988) is 2.00. Carriage of materials (codes 22xx) is 0 until you enter your rate — lines for it are already in the analyses. Enter your current rate and every DSOR 2023 item whose analysis uses it is re-priced; GST, CPOH, water and cess are added on top as in the DAR." : "The rate the CPWD analyses use is locked. Enter your current rate and every CPWD item's updated rate is re-priced through its rate analysis. DSR 2021 printed rates are shown for reference.")) + "</p>";
    if (B.book === "cpwd23") h += '<div class="row"><span class="lbl">Material &amp; machinery rates from</span><div class="seg" role="group" aria-label="Rate source">' + [["an", "2021 analysed (market)"], ["dsr", "2021 DSR"], ["book", "DAR 2023 printed"]].map(function (x) { return '<button type="button" data-rsrc="' + x[0] + '" aria-pressed="' + (EP.rateSrc() === x[0]) + '">' + x[1] + "</button>"; }).join("") + '</div><span class="muted" style="font-size:12px">Labour rates are not touched. A rate you type below always wins. This choice is saved on this device.</span></div>';
    h += '<div class="row"><div class="seg" role="group" aria-label="Kind"><button type="button" data-kind="L" aria-pressed="' + (B.kind === "L") + '">Labour</button><button type="button" data-kind="T" aria-pressed="' + (B.kind === "T") + '">Materials</button><button type="button" data-kind="M" aria-pressed="' + (B.kind === "M") + '">Machinery</button>' + (B.book === "cpwd23" ? '<button type="button" data-kind="H" aria-pressed="' + (B.kind === "H") + '">HEMM (HPC wages, diesel)</button>' : "") + '</div><input id="bq" class="in grow" placeholder="Search code or name" value="' + esc(B.q) + '" aria-label="Search basic rates"></div>';
    h += linkBar(B);
    if (B.kind === "H") h += '<div class="panel" style="padding:10px 12px"><strong>HEMM rates — used only in HEMM owning &amp; operating cost analyses</strong><p class="muted" style="margin:4px 0 0;font-size:12px">HPC wages (CIL order for contractors\' workers in mines, incl. VDA, w.e.f. 01.10.2026) and the diesel rate for HEMM. They are kept apart from the SOR labour and materials: they are not used by any SOR analysis, not offered in item search and never follow a master SOR. Change them here when the VDA or diesel price changes — every HEMM analysis picks them up.</p></div>';
    h += '<div class="tw"><table class="t"><thead><tr><th>Code</th><th>Name</th><th>Unit</th><th class="num">' + (B.book === "mp" ? "SOR 2014 rate ₹" : B.book === "mp25" ? "SOR 2025 level ₹" : B.book === "cpwd23" ? "DAR 2023 rate ₹" : B.book === "em22" ? "DAR (E&M) 2022 rate ₹" : "DSR printed ₹") + '</th><th class="num">' + (B.book === "cpwd23" && B.kind !== "L" ? (EP.rateSrc() === "book" ? "Library rate ₹" : EP.rateSrc() === "dsr" ? "2021 DSR rate ₹" : "2021 analysed rate ₹") : "Analysis rate ₹") + '</th><th class="num">Your current rate ₹</th><th class="num">Used in</th><th></th></tr></thead><tbody>';
    h += rows.slice(0, 300).map(function (k) {
      var b = basic[k], o = EP.basicOvr(k, B.book), bk = EP.basicBase(k, B.book), an = EP.basicAn(k, B.book), rf = EP.basicRef(k, B.book), lk = EP.linkOf(k, B.book);
      return "<tr><td style='white-space:nowrap'>" + esc(k) + "</td><td>" + esc(b[0]) + (rf && b[4] !== "L" ? "<br><span class='muted' style='font-size:11px'>2021 file: analysed ₹" + inr(rf.an) + " · DSR ₹" + inr(rf.dsr) + "</span>" : "") + (lk ? "<br><span class='badge info' style='font-size:11px;white-space:normal'>From " + esc(EP.BOOKS[lk.b].short || EP.BOOKS[lk.b].name) + " " + esc(lk.c) + " · " + esc(lk.name.slice(0, 60)) + (lk.k !== 1 ? " × " + EP.r3(lk.k) : "") + "</span>" : "") + "</td><td>" + esc(b[1]) + "</td><td class='num muted'>" + inr(b[2]) + "</td><td class='num'>" + inr(bk) + "</td><td class='num'><input class='in small n" + (o ? " edited" : "") + "' id='b-" + esc(B.book + "-" + k) + "' data-b='" + esc(k) + "' value='" + (an != null ? an : "") + "'" + (R ? " disabled" : "") + " aria-label='Current rate for " + esc(b[0]) + "'></td><td class='num'>" + (usage[k] || 0) + "</td><td>" + (o ? (U.isMine(B.book + ":b:" + EP.enc(k)) ? "<span class='badge info'>Mine</span> " : o.team && !(S.ovrShared || {})[B.book + ":b:" + EP.enc(k)] ? "<span class='badge ok'>Group</span> " : "<span class='badge ed'>Library</span> ") + ((U.isMine(B.book + ":b:" + EP.enc(k)) || S.rateScope === "all" || (o.team && S.rateScope === "team")) ? "<button class='btn ghost sm' data-breset='" + esc(k) + "'>Reset</button>" : "") : "") + "</td></tr>";
    }).join("") || "<tr><td colspan='8' class='empty'>Nothing matches.</td></tr>";
    return h + "</tbody></table></div>" + (rows.length > 300 ? "<div class='muted'>Showing 300 of " + rows.length + ". Search to narrow.</div>" : "") + "</div>";
  };

  /* ---------- my SORs (upload, private) ---------- */
  U.loadSors = async function () {
    var r = await db().from("user_sors").select("*").order("created_at");
    if (r.error) return;
    var sors = r.data, items = [];
    for (var i = 0; i < sors.length; i++) {
      var from = 0;
      while (true) { var q = await db().from("user_sor_items").select("sor_id,code,descr,unit,rate,chapter,an_rate,an_note").eq("sor_id", sors[i].id).range(from, from + 999); if (q.error) break; items = items.concat(q.data); if (q.data.length < 1000) break; from += 1000; }
    }
    EP.loadUserSors(sors, items); EP.bump(); U.render();
  };
  var FIELDS = [["code", "Item code", true], ["desc", "Description", true], ["unit", "Unit", true], ["rate", "Rate ₹", true], ["ch", "Chapter / sub-head", false]];
  U.views.sors = function () {
    var P = S.sor, h = '<div style="display:flex;flex-direction:column;gap:14px;max-width:1100px"><h1>My SORs</h1><p class="muted" style="margin:0">Upload any schedule of rates from a PDF, Excel or CSV file (a state PWD SOR, a department SOR, a market-rate list). The app makes a rate book from it with code, description, unit, rate and chapter. Your SORs are private to you and appear in the rate library and in item search.</p>';
    h += '<div class="tw"><table class="t"><thead><tr><th>Name</th><th>Short name (printed in remarks)</th><th class="num">Items</th><th>Uploaded</th><th></th></tr></thead><tbody>' + (S.userSors.length ? S.userSors.map(function (s) { return "<tr><td>" + esc(s.name) + "</td><td>" + esc(s.short || "") + "</td><td class='num'>" + ((EP.BOOKS["u:" + s.id] || { list: [] }).list.length) + "</td><td>" + U.when(s.created_at) + "</td><td><button class='btn ghost sm' data-openbook='u:" + esc(s.id) + "'>Open in library</button><button class='btn ghost sm' data-delsor='" + esc(s.id) + "'>Delete</button></td></tr>"; }).join("") : "<tr><td colspan='5' class='empty'>No SORs uploaded yet.</td></tr>") + "</tbody></table></div>";
    h += '<div class="panel form"><h3>Upload a new SOR</h3>';
    if (!P.rows) h += (P.busy ? "" : "") + '<label class="fld"><span class="lbl">PDF, Excel (.xlsx, .xls) or CSV file</span><input type="file" id="sor-file" accept=".pdf,.xlsx,.xls,.csv"></label><p class="muted" style="margin:0;font-size:12px"><strong>PDF:</strong> the app reads the text of a printed SOR (item code at the start of a line, unit and rate at the end), joins sub-items to their parent description and skips Hindi pages. Scanned PDFs (photos of pages) have no text and can\'t be read. <strong>Excel/CSV:</strong> one row per item with a column each for code, description, unit and rate.</p>' + (P.busy ? '<div class="badge info">' + esc(P.prog || "Reading…") + "</div>" : "") + (P.err ? '<div class="badge dan">' + esc(P.err) + "</div>" : "");
    else {
      var n = P.rows[0] ? P.rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0) : 0, cols = []; for (var i = 0; i < n; i++) cols.push(i);
      var hdr = P.rows[P.head] || [];
      if (P.fromPdf) h += '<div class="badge info" style="white-space:normal;align-self:flex-start">Read from PDF: ' + esc(P.pdfInfo || "") + ' Check a few rates in the preview against the book before saving.</div>';
      h += '<div class="grid2">' + (P.sheets.length > 1 ? '<label class="fld"><span class="lbl">Sheet</span><select class="in" id="sor-sheet">' + P.sheets.map(function (s) { return "<option" + (s === P.sheet ? " selected" : "") + ">" + esc(s) + "</option>"; }).join("") + "</select></label>" : "") + '<label class="fld"><span class="lbl">Heading row</span><input class="in n" id="sor-head" value="' + (P.head + 1) + '"></label></div>';
      h += '<div class="grid3">' + FIELDS.map(function (f) { return '<label class="fld"><span class="lbl">' + f[1] + (f[2] ? "" : " (optional)") + '</span><select class="in" data-map="' + f[0] + '"><option value="">—</option>' + cols.map(function (c) { return '<option value="' + c + '"' + (P.map[f[0]] === c ? " selected" : "") + ">" + String.fromCharCode(65 + (c % 26)) + (c >= 26 ? c : "") + " · " + esc(String(hdr[c] == null ? "" : hdr[c]).slice(0, 30)) + "</option>"; }).join("") + "</select></label>"; }).join("") + "</div>";
      var parsed = parseSor(P);
      h += '<div class="grid2"><label class="fld"><span class="lbl">Name of this SOR</span><input class="in" id="sor-name" value="' + esc(P.name) + '" placeholder="e.g. MPPWD Building SOR 2019"></label><label class="fld"><span class="lbl">Short name for remarks</span><input class="in" id="sor-short" value="' + esc(P.short) + '" placeholder="e.g. MPPWD Bldg 2019"></label></div>';
      h += '<div class="muted">' + parsed.items.length + " items found" + (parsed.skipped ? " · " + parsed.skipped + " rows skipped (no code or no rate)" : "") + (parsed.dups ? " · " + parsed.dups + " repeated codes kept once" : "") + "</div>";
      h += '<div class="tw"><table class="t"><thead><tr><th>Code</th><th>Description</th><th>Unit</th><th class="num">Rate ₹</th><th>Chapter</th></tr></thead><tbody>' + parsed.items.slice(0, 12).map(function (i) { return "<tr><td>" + esc(i.code) + "</td><td><div class='desc'>" + esc(i.descr) + "</div></td><td>" + esc(i.unit) + "</td><td class='num'>" + inr(i.rate) + "</td><td>" + esc(i.chapter) + "</td></tr>"; }).join("") + "</tbody></table></div>";
      h += '<div class="row"><button class="btn pri" id="sor-save"' + (P.busy || !parsed.items.length ? " disabled" : "") + ">" + (P.busy ? "Saving… " + (P.prog || "") : "Save " + parsed.items.length + " items as my SOR") + '</button><button class="btn ghost" id="sor-cancel">Cancel</button></div>' + (P.err ? '<div class="badge dan">' + esc(P.err) + "</div>" : "");
    }
    return h + "</div>" + (U.nsLibSection ? U.nsLibSection() : "") + "</div>";
  };
  function guessMap(P) {
    var hdr = (P.rows[P.head] || []).map(function (x) { return String(x || "").toLowerCase(); }), m = {};
    hdr.forEach(function (t, i) {
      if (m.code == null && /(code|item\s*no|s\.?\s*no|sl\.?\s*no)/.test(t)) m.code = i;
      else if (m.desc == null && /(desc|particular|item)/.test(t)) m.desc = i;
      else if (m.unit == null && /unit/.test(t)) m.unit = i;
      else if (m.rate == null && /(rate|amount|rs)/.test(t)) m.rate = i;
      else if (m.ch == null && /(chapter|head|section)/.test(t)) m.ch = i;
    });
    return m;
  }
  function findHead(rows) { for (var i = 0; i < Math.min(rows.length, 30); i++) { var t = rows[i].join(" ").toLowerCase(); if (/desc|particular/.test(t) && /rate|unit/.test(t)) return i; } return 0; }
  function parseSor(P) {
    var m = P.map, out = [], seen = {}, skipped = 0, dups = 0, ch = "";
    if (m.code == null || m.desc == null || m.rate == null) return { items: [], skipped: 0, dups: 0 };
    P.rows.slice(P.head + 1).forEach(function (r) {
      var code = String(r[m.code] == null ? "" : r[m.code]).trim(), desc = String(r[m.desc] == null ? "" : r[m.desc]).replace(/\s+/g, " ").trim(), rate = U.num(r[m.rate]);
      if (m.ch != null && r[m.ch] != null && String(r[m.ch]).trim()) ch = String(r[m.ch]).trim();
      if (!code || rate == null) { skipped += desc || code ? 1 : 0; return; }
      if (seen[code]) { dups++; return; } seen[code] = 1;
      out.push({ code: code.slice(0, 60), descr: desc.slice(0, 4000), unit: m.unit != null ? String(r[m.unit] == null ? "" : r[m.unit]).trim().slice(0, 40) : "", rate: rate, chapter: (m.ch != null ? ch : code.split(/[.\-]/)[0]).slice(0, 120) });
    });
    return { items: out, skipped: skipped, dups: dups };
  }
  /* ---------- PDF SOR reader (pdf.js, loaded only when needed) ---------- */
  var PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/";
  async function pdfLib() {
    if (window.__pdfjs) return window.__pdfjs;
    var m = await import(PDFJS + "pdf.min.mjs");
    m.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.mjs";
    window.__pdfjs = m; return m;
  }
  /* Rebuild text lines from positioned text items; wide gaps become double spaces (column breaks). */
  function pageLines(items) {
    var rows = [];
    items.forEach(function (t) {
      if (!t.str || !t.str.trim()) return;
      var y = t.transform[5], x = t.transform[4], row = null;
      for (var i = 0; i < rows.length; i++) if (Math.abs(rows[i].y - y) < 2.5) { row = rows[i]; break; }
      if (!row) { row = { y: y, parts: [] }; rows.push(row); }
      row.parts.push({ x: x, w: t.width || 0, s: t.str, h: Math.abs(t.transform[3]) || 8 });
    });
    rows.sort(function (a, b) { return b.y - a.y; });
    return rows.map(function (r) {
      r.parts.sort(function (a, b) { return a.x - b.x; });
      var out = "", end = null;
      r.parts.forEach(function (p) {
        if (end != null) { var gap = p.x - end; out += gap > p.h * 1.2 ? "   " : gap > p.h * 0.15 ? " " : ""; }
        out += p.s; end = p.x + p.w;
      });
      return { text: out, x: r.parts[0].x };
    });
  }
  var PUNITS = "(?:per\\s+)?(?:cum|cu\\.?\\s?m\\.?|sqm\\.?|sq\\.?\\s?m\\.?|10\\s?sqm|100\\s?sqm|metre|meter|rmt|rm|r\\.m\\.?|m|km|100\\s?m|kg|quintal|qtl\\.?|tonne|MT|litre|ltr|each|no\\.?|nos\\.?|1000\\s?nos\\.?|set|pair|job|point|day|month|hour|l\\.?s\\.?|lump\\s?sum|tray|box|trip|tree|length)";
  var P_RATE = new RegExp("^(.*?\\S)\\s+(" + PUNITS + ")\\s+(\\d[\\d,]*\\.\\d{1,2})\\s*$", "i");
  var P_RATE2 = new RegExp("^(.*?\\S)\\s{2,}([A-Za-z][A-Za-z./]{0,14})\\s+(\\d[\\d,]*\\.\\d{1,2})\\s*$");
  var P_CODE = /^\s*((?:\d{1,3}|[A-Z]{1,3})[.\-]?\d{0,3}(?:\.\d{1,3}[A-Za-z]?)+|\d{1,3}\.\d{1,3}[A-Za-z]?)\s+(\S.*)$/;
  var P_HINDI_CODE = /^\s*\d{1,2}-\d{1,3}/;
  function parsePdfLines(lines) {
    var out = [], seen = {}, parents = {}, cur = null, chap = "", chapName = {};
    function done() {
      var t = cur.desc.replace(/\s+/g, " ").trim(), r = P_RATE.exec(cur.raw) || P_RATE.exec(t) || P_RATE2.exec(cur.raw);
      if (!r) return false;
      var desc = r[1].replace(/\s+/g, " ").trim(), code = cur.code, segs = code.split(".");
      var pre = []; for (var k = 2; k < segs.length; k++) { var pc = segs.slice(0, k).join("."); if (parents[pc]) pre.push(parents[pc]); }
      if (!seen[code]) { seen[code] = 1; out.push([code, pre.concat([desc]).join(" — "), r[2].trim(), parseFloat(r[3].replace(/,/g, "")), chapName[chap] ? chap + " · " + chapName[chap] : (chap || segs[0])]); }
      return true;
    }
    lines.forEach(function (L) {
      var s = L.text.replace(/\s+$/, ""); if (!s.trim()) return;
      var m = /(?:SUB[\s-]*HEAD|CHAPTER)\s*[:\-.]?\s*(\d{1,2})(?:\.0)?\b\s*[:\-.]?\s*([A-Za-z][A-Za-z &,\/()-]{2,60})?/i.exec(s);
      if (m && !P_CODE.test(s)) { chap = m[1]; if (m[2] && /[a-z]/i.test(m[2])) chapName[chap] = m[2].trim().replace(/\s+\d+$/, ""); if (cur && cur.code.split(".").length === 2) parents[cur.code] = cur.desc.replace(/\s+/g, " ").trim(); cur = null; return; }
      if (P_HINDI_CODE.test(s)) { cur = null; return; }
      var c = P_CODE.exec(s);
      if (c && !/^\d+\.\d{2}$/.test(c[1]) || (c && /^\d+\.\d{2}$/.test(c[1]) && L.x < 120 && !/^\s*\d+\.\d{2}\s+(cm|mm|m)\b/i.test(s))) {
        if (cur && !seen[cur.code]) parents[cur.code] = cur.desc.replace(/\s+/g, " ").trim();
        cur = { code: c[1], desc: c[2], raw: c[2] };
      } else if (cur) { cur.desc += " " + s.trim(); cur.raw = cur.desc; }
      else return;
      if (done()) cur = null;
    });
    return out;
  }
  async function readPdf(file) {
    var P = S.sor; P.busy = true; P.prog = "Loading the PDF reader…"; U.render();
    try {
      var lib = await pdfLib();
      var doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise, lines = [], textChars = 0;
      for (var p = 1; p <= doc.numPages; p++) {
        if (p % 10 === 1) { P.prog = "Reading page " + p + " of " + doc.numPages + "…"; U.render(); }
        var pg = await doc.getPage(p), tc = await pg.getTextContent();
        tc.items.forEach(function (t) { textChars += (t.str || "").length; });
        lines = lines.concat(pageLines(tc.items));
      }
      var items = parsePdfLines(lines);
      P.busy = false; P.prog = "";
      if (!textChars) { P.err = "This PDF has no text layer (it is a scanned image), so it can't be read. Use a text PDF or an Excel/CSV version."; U.render(); return; }
      if (!items.length) { P.err = "No items with a code, unit and rate were found in this PDF. Try an Excel/CSV version of the SOR."; U.render(); return; }
      P.fromPdf = true; P.pdfInfo = doc.numPages + " pages, " + items.length + " items found.";
      P.sheets = []; P.sheet = null; P.name = file.name.replace(/\.[^.]+$/, ""); P.short = P.name.slice(0, 30);
      P.rows = [["Code", "Description", "Unit", "Rate", "Chapter"]].concat(items); P.head = 0; P.map = { code: 0, desc: 1, unit: 2, rate: 3, ch: 4 };
      U.render();
    } catch (e) { console.error(e); P.busy = false; P.prog = ""; P.err = "That PDF couldn't be read" + (e && e.name === "PasswordException" ? " (it is password protected)." : ". Check your connection and try again."); U.render(); }
  }
  EP.parsePdfLines = parsePdfLines; EP.pageLines = pageLines;
  function readFile(file) {
    var P = S.sor; P.err = "";
    if (/\.pdf$/i.test(file.name) || file.type === "application/pdf") { readPdf(file); return; }
    if (!window.XLSX) { P.err = "The spreadsheet reader didn't load. Check your connection and reload."; U.render(); return; }
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var wb = XLSX.read(new Uint8Array(fr.result), { type: "array" });
        P.wb = wb; P.sheets = wb.SheetNames; P.name = file.name.replace(/\.[^.]+$/, ""); P.short = P.name.slice(0, 30);
        loadSheet(wb.SheetNames[0]);
      } catch (e) { P.err = "That file couldn't be read. Save it as .xlsx or .csv and try again."; U.render(); }
    };
    fr.readAsArrayBuffer(file);
  }
  function loadSheet(name) { var P = S.sor; P.sheet = name; P.rows = XLSX.utils.sheet_to_json(P.wb.Sheets[name], { header: 1, raw: true, defval: null }).filter(function (r) { return r && r.some(function (x) { return x != null && String(x).trim() !== ""; }); }); P.head = findHead(P.rows); P.map = guessMap(P); U.render(); }
  async function saveSor() {
    var P = S.sor, parsed = parseSor(P), name = (P.name || "").trim();
    if (!name) { P.err = "Give the SOR a name."; U.render(); return; }
    P.busy = true; P.err = ""; U.render();
    var r = await db().from("user_sors").insert({ name: name.slice(0, 120), short: (P.short || name).trim().slice(0, 40), item_count: parsed.items.length }).select("*").single();
    if (r.error) { P.busy = false; P.err = r.error.message; U.render(); return; }
    var id = r.data.id;
    for (var i = 0; i < parsed.items.length; i += 500) {
      P.prog = Math.min(100, Math.round(i / parsed.items.length * 100)) + "%"; U.render();
      var chunk = parsed.items.slice(i, i + 500).map(function (x) { return Object.assign({ sor_id: id }, x); });
      var w = await db().from("user_sor_items").insert(chunk);
      if (w.error) { P.busy = false; P.err = "Saving stopped: " + w.error.message; await db().from("user_sors").delete().eq("id", id); U.render(); return; }
    }
    S.sor = { step: 0 }; await U.loadSors(); S.lib.book = "u:" + id; S.lib.sel = null; U.toast("Saved " + parsed.items.length + " items"); U.setTab("library");
  }

  /* ---------- events ---------- */
  document.addEventListener("input", function (e) {
    var t = e.target, d = S.lib.draft;
    if (t.id === "lib-q") { S.lib.q = t.value; U.render(); return; }
    if (t.id === "bq") { S.basic.q = t.value; U.render(); return; }
    if (t.id === "sor-name") { S.sor.name = t.value; return; }
    if (t.id === "sor-short") { S.sor.short = t.value; return; }
    if (d && (t.dataset.lq != null || t.dataset.lr != null || t.dataset.ad != null)) {
      d.mode = "an"; d.lines = d.lines || {}; d.adds = d.adds || {}; var v = U.num(t.value);
      if (t.dataset.lq != null) { var i = +t.dataset.lq; d.lines[i] = d.lines[i] || {}; d.lines[i].q = v; }
      if (t.dataset.lr != null) { var k = +t.dataset.lr; d.lines[k] = d.lines[k] || {}; d.lines[k].r = v; }
      if (t.dataset.ad != null) d.adds[+t.dataset.ad] = v;
      t.classList.add("edited"); var rb = document.querySelector('input[name="mode"][value="an"]'); if (rb) rb.checked = true; U.after(); return;
    }
    if (t.id === "man-rate" && d) { d.manual = U.num(t.value); U.after(); return; }
    if (t.id === "why" && d) { d.why = t.value; return; }
  });
  document.addEventListener("change", function (e) {
    var hp = e.target, H0 = S.basic && S.basic.hpc;
    if (H0 && hp.dataset) {
      if (hp.dataset.hpcon) { (H0.sel[hp.dataset.hpcon] = H0.sel[hp.dataset.hpcon] || {}).on = hp.checked; U.render(); return; }
      if (hp.dataset.hpccat) { var s0 = H0.sel[hp.dataset.hpccat] = H0.sel[hp.dataset.hpccat] || {}; s0.cat = hp.value; s0.on = !!hp.value; U.render(); return; }
      if (hp.dataset.hpcall) { Object.keys(H0.sel).forEach(function (c) { if (H0.sel[c].cat) H0.sel[c].on = hp.checked; }); U.render(); return; }
    }
    var t = e.target;
    if (t.id === "lib-ch") { S.lib.ch = t.value; U.render(); }
    else if (t.id === "lib-ed") { S.lib.edited = t.checked; U.render(); }
    else if (t.name === "mode" && S.lib.draft) { S.lib.draft.mode = t.value; U.render(); }
    else if (t.id === "sor-file" && t.files[0]) readFile(t.files[0]);
    else if (t.id === "sor-sheet") loadSheet(t.value);
    else if (t.id === "sor-head") { S.sor.head = Math.max(0, (U.num(t.value) || 1) - 1); S.sor.map = guessMap(S.sor); U.render(); }
    else if (t.dataset.map) { S.sor.map[t.dataset.map] = t.value === "" ? null : +t.value; U.render(); }
    else if (t.dataset.b != null) {
      var k = t.dataset.b, v = U.num(t.value); if (v == null) return;
      var bb = S.basic.book || "cpwd", bid = bb + ":b:" + EP.enc(k), sharedHas = S.ovrShared && S.ovrShared[bid] && S.rateScope !== "all";
      if (Math.abs(v - EP.basicBase(k, bb)) < 0.0001 && !sharedHas) U.ovrDel(bid);
      else U.ovrSet(bb + ":b:" + EP.enc(k), { r: v }).then(function (ok) { if (ok) U.toast("Saved " + k + " at ₹" + inr(v)); });
    }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.closest && e.target.closest("tr.click")) e.target.closest("tr.click").click(); });
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button,tr.click"); if (!t || t.closest("nav.tabs")) return;
    var ds = t.dataset;
    if (ds.book) { S.lib.book = ds.book; S.lib.ch = ""; S.lib.sel = null; S.lib.draft = null; U.render(); }
    else if (ds.goto) U.setTab(ds.goto);
    else if (ds.kind) { S.basic.kind = ds.kind; U.render(); }
    else if (ds.hpc) { if (ds.hpc === "toggle") { S.basic.hpc = S.basic.hpc ? null : { sel: {} }; U.render(); } else if (ds.hpc === "apply") hpcApply(); }
    else if (ds.blink) { var bk0 = S.basic.book || "cpwd", kd = S.basic.kind, lid = EP.linkId(kd); (ds.blink === "on" ? U.ovrSet(lid, { src: bk0 }) : U.ovrDel(lid)).then(function (ok) { if (ok) { EP.bump(); U.toast(ds.blink === "on" ? "Every SOR now takes " + EP.KINDN[kd] + " rates from " + EP.BOOKS[bk0].name + " where the item matches" : "Each SOR keeps its own " + EP.KINDN[kd] + " rates again"); U.render(); } }); }
    else if (ds.rsrc) { EP.rateSrc(ds.rsrc); EP.bump(); U.toast("Material and machinery rates now follow: " + t.textContent); U.render(); }
    else if (ds.item) { S.lib.sel = ds.item; S.lib.draft = null; U.render(); if (window.innerWidth < 1000) setTimeout(function () { var d = document.getElementById("detail"); if (d) d.scrollIntoView({ behavior: "smooth" }); }, 50); }
    else if (t.id === "save-item") saveItem();
    else if (t.id === "reset-item") {
      if (isUser(S.lib.book)) { S.lib.draft = { mode: "sor" }; saveItem(); }
      else { var id = S.lib.book + ":i:" + EP.enc(S.lib.sel); (EP.itemOvr(S.lib.book, S.lib.sel) ? U.ovrDel(id) : Promise.resolve(true)).then(function () { S.lib.draft = null; U.toast("Reset"); U.render(); }); }
    }
    else if (ds.bbook) { S.basic.book = ds.bbook; S.basic.q = ""; U.render(); }
    else if (ds.breset) U.ovrDel((S.basic.book || "cpwd") + ":b:" + EP.enc(ds.breset)).then(function (ok) { if (ok) U.toast("Reset to the analysis rate"); });
    else if (t.id === "to-add") {
      var eid = document.getElementById("to-est").value, est = S.est.mine.filter(function (x) { return x.id === eid; })[0]; if (!est) return;
      if (U.est && U.est.dupe(est.doc, est.doc.parts[0].id, S.lib.book, S.lib.sel)) { U.toast(S.lib.sel + " is already in " + est.name + " (" + est.doc.parts[0].name + ")."); return; }
      est.doc.items.push({ id: EP.uid(), part: est.doc.parts[0].id, b: S.lib.book, c: S.lib.sel, q: "", rem: "", meas: [] });
      db().from("estimates").update({ data: est.doc }).eq("id", eid).then(function (r) { if (U.fail(r, "Couldn't add the item.")) return; U.toast("Added " + S.lib.sel + " to " + est.name + " (" + est.doc.parts[0].name + ")"); });
    }
    else if (ds.openbook) { S.lib.book = ds.openbook; S.lib.sel = null; U.setTab("library"); }
    else if (ds.delsor) {
      if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again to delete"; return; }
      db().from("user_sors").delete().eq("id", ds.delsor).then(function (r) { if (U.fail(r, "Couldn't delete.")) return; if (S.lib.book === "u:" + ds.delsor) S.lib.book = "cpwd"; U.loadSors(); U.toast("SOR deleted"); });
    }
    else if (t.id === "sor-save") saveSor();
    else if (t.id === "sor-cancel") { S.sor = { step: 0 }; U.render(); }
  });
})();
