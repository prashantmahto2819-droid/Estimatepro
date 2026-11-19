/* Estimate Pro — analyses made by users for SOR items that have none in the book.
   User: "Send to admin for approval" (an_requests). Super admin: Approve → approved_analyses → the item's analysis for everyone,
   marked in the app (never in the Excel export) as "Not from the SOR — drafted copy, analysed by admin. Please check." */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc, inr = U.inr;
  S.anReq = []; S.approved = []; S.apv = { open: {}, note: {}, reqNote: {} };
  function db() { return U.db(); }
  function booksReady() { return new Promise(function (res) { (function w() { if (S.loaded && EP.BOOKS.cpwd) res(); else setTimeout(w, 300); })(); }); }

  U.loadApprovals = async function () {
    try {
      await booksReady();
      var a = await db().from("approved_analyses").select("book,code,data,approved_at,request_id");
      if (!a.error) { S.approved = a.data || []; EP.addApproved(S.approved); }
      var r = await db().from("an_requests").select("*").order("created_at", { ascending: false });
      if (!r.error) S.anReq = r.data || [];
      if (U.resolveNames) U.resolveNames(S.anReq.map(function (x) { return x.owner; }));
      U.render();
    } catch (e) { /* tables not there yet */ }
  };
  U.pendingApprovals = function () { return (S.anReq || []).filter(function (x) { return x.status === "pending"; }).length; };
  function myReq(b, c) { return (S.anReq || []).filter(function (x) { return x.book === b && x.code === c && x.owner === S.me.id; })[0] || null; }

  /* banner in Items & measurement */
  U.anBanner = function (it, R) {
    if (!it || it.b === "x") return "";
    var inf = EP.itemInfo(it); if (inf.missing) return "";
    var an = EP.anOf(it.b, it.c), B = EP.BOOKS[it.b] || {};
    if (an && an.admin) return "<div class='ds-msg admmsg' role='note'><b>" + esc(EP.adminNote) + "</b> This item has no analysis in " + esc(B.short || "the SOR") + "; the analysis below was made by a user and approved by the admin.</div>";
    if (an) return "";
    if (EP.customAn(it)) {
      var q = myReq(it.b, it.c);
      return "<div class='ds-msg' role='note'><b>Analysis made for this estimate.</b> " + (q ? (q.status === "pending" ? "Sent to the admin for approval on " + esc(U.when(q.created_at)) + "." : q.status === "rejected" ? "The admin did not approve it" + (q.admin_note ? ": “" + esc(q.admin_note) + "”" : "") + ". You can change it and send again." : "") : "When it is ready, send it to the admin for approval (button below the analysis) so it becomes this item's analysis for everyone.") + "</div>";
    }
    return "<div class='ds-msg noanmsg' role='note'><b>No rate analysis for this item in " + esc(B.short || "the SOR") + ".</b> The SOR rate is used. " + (R ? "" : "<button type='button' class='btn pri sm' data-abnew='" + it.id + "'>+ Add analysis</button> <span class='muted' style='font-size:12px'>Build it from basic rates / MoRTH / market; the admin can approve it for everyone.</span>") + "</div>";
  };

  /* below a custom analysis in the analysis table */
  U.reqBox = function (it, bu, R) {
    if (!bu || !bu.custom || R) return "";
    var q = myReq(it.b, it.c), pend = q && q.status === "pending";
    var h = "<div class='savedan' style='background:var(--brand-soft)'><div class='row' style='gap:8px;flex-wrap:wrap;align-items:center'><strong style='font-size:13px'>Make it this item's analysis for everyone</strong>";
    if (S.me.isOwner) h += "<button type='button' class='btn pri sm' data-apvself='" + it.id + "'" + (bu.total > 0 ? "" : " disabled") + ">Approve now (super admin)</button>";
    else h += "<input class='in small' style='min-width:220px' id='reqn-" + it.id + "' placeholder='Note for the admin (source: MoRTH 3.6, quotation …)' value='" + esc(S.apv.reqNote[it.id] || "") + "'><button type='button' class='btn pri sm' data-apvreq='" + it.id + "'" + (bu.total > 0 ? "" : " disabled") + ">" + (pend ? "Send again (update)" : "Send to admin for approval") + "</button>";
    if (q) h += "<span class='badge " + (q.status === "pending" ? "warn" : q.status === "approved" ? "ok" : "dan") + "'>" + (q.status === "pending" ? "Waiting for approval" : q.status === "approved" ? "Approved" : "Not approved") + " · " + esc(U.when(q.reviewed_at || q.created_at)) + "</span>";
    return h + "</div></div>";
  };

  /* super admin panel (Users tab) */
  U.approvalsPanel = function () {
    if (!S.me.isOwner) return "";
    var P = (S.anReq || []).filter(function (x) { return x.status === "pending"; }), done = (S.anReq || []).filter(function (x) { return x.status !== "pending"; }).slice(0, 20);
    var h = "<details class='panel' style='padding:12px'" + (P.length ? " open" : "") + "><summary><strong>Analysis approvals</strong> — " + P.length + " waiting" + (S.approved.length ? " · " + S.approved.length + " approved analyses in use" : "") + "</summary><div style='display:flex;flex-direction:column;gap:10px;margin-top:8px'>";
    if (!P.length) h += "<div class='muted'>Nothing waiting. When a user makes an analysis for an SOR item that has none and sends it, it appears here.</div>";
    P.forEach(function (q) {
      var B = EP.BOOKS[q.book] || {}, it = EP.item(q.book, q.code), an = q.data, op = !!S.apv.open[q.id];
      var bu = an ? EP.build(q.code, null, 0, q.book, Object.assign({}, an, { pure: true })) : null;
      h += "<div class='grpbox'><div class='row' style='gap:8px;flex-wrap:wrap;align-items:center'><div class='grow'><b>" + esc((B.short || q.book) + " item " + q.code) + "</b> — " + esc(it ? it.desc.slice(0, 140) : "") + "<br><span class='muted' style='font-size:12px'>by " + esc(U.nameOf(q.owner)) + " · " + esc(U.when(q.created_at)) + (q.est_name ? " · estimate “" + esc(q.est_name) + "”" : "") + " · SOR ₹" + inr(q.sor) + " / analysis ₹" + inr(bu ? bu.rate : q.an_rate) + " per " + esc(it ? it.unit : "") + (q.note ? " · note: “" + esc(q.note) + "”" : "") + "</span></div>" +
        "<button type='button' class='btn sec sm' data-apvopen='" + q.id + "'>" + (op ? "Hide" : "View analysis") + "</button></div>";
      if (op && bu) h += miniTable(bu, it);
      h += "<div class='row' style='gap:6px;margin-top:6px;flex-wrap:wrap'><input class='in small grow' id='apvn-" + q.id + "' placeholder='Note to the user (optional)' value='" + esc(S.apv.note[q.id] || "") + "'><button type='button' class='btn pri sm' data-apvok='" + q.id + "'>Approve — make it the item's analysis</button><button type='button' class='btn ghost sm' data-apvno='" + q.id + "'>Not approve</button></div></div>";
    });
    if (S.approved.length) {
      h += "<div><strong>Approved analyses in use</strong><div class='tw'><table class='t'><thead><tr><th>Item</th><th>Description</th><th class='num'>Analysis rate ₹</th><th>Approved</th><th></th></tr></thead><tbody>" + S.approved.map(function (a) { var B = EP.BOOKS[a.book] || {}, it = EP.item(a.book, a.code); return "<tr><td style='white-space:nowrap'>" + esc((B.short || a.book) + " " + a.code) + "</td><td><div class='desc'>" + esc(it ? it.desc : "") + "</div></td><td class='num'>" + inr(EP.anRate(a.book, a.code)) + "</td><td>" + esc(U.when(a.approved_at)) + "</td><td><button type='button' class='btn ghost sm' data-apvdel='" + esc(a.book + "|" + a.code) + "'>Remove</button></td></tr>"; }).join("") + "</tbody></table></div></div>";
    }
    if (done.length) h += "<div class='muted' style='font-size:12px'>Recently reviewed: " + done.map(function (q) { return esc(q.code) + " (" + (q.status === "approved" ? "approved" : "not approved") + ")"; }).join(", ") + "</div>";
    return h + "</div></details>";
  };
  function miniTable(bu, it) {
    var h = "<div class='subtab'><table class='t'><tbody>";
    bu.lines.forEach(function (l) { h += "<tr><td>" + esc(l.code || "") + "</td><td>" + esc(l.desc || "") + "</td><td>" + esc(l.unit || "") + "</td><td class='num'>" + (l.q != null ? EP.r3(l.q) : "") + "</td><td class='num'>" + (l.r != null ? inr(l.r) : "") + "</td><td class='num'>" + inr(l.amt) + "</td></tr>"; });
    bu.adds.forEach(function (a) { h += "<tr><td></td><td>Add " + esc(a.pct) + "% " + esc(a.label || "") + "</td><td></td><td></td><td></td><td class='num'>" + inr(a.amt) + "</td></tr>"; });
    return h + "<tr><td></td><td><b>Cost for " + esc(EP.r3(bu.basis)) + " " + esc(it ? it.unit : "") + " → rate for 1</b></td><td></td><td></td><td></td><td class='num'><b>" + inr(bu.rate) + "</b></td></tr></tbody></table></div>";
  }

  async function approve(book, code, data, reqId, note) {
    var r = await db().from("approved_analyses").upsert({ book: book, code: code, data: data, request_id: reqId || null, approved_by: S.me.id, approved_at: new Date().toISOString() });
    if (U.fail(r, "Couldn't approve.")) return false;
    if (reqId) await db().from("an_requests").update({ status: "approved", admin_note: note || "", reviewed_by: S.me.id, reviewed_at: new Date().toISOString() }).eq("id", reqId);
    // other pending requests for the same item are closed too
    var others = (S.anReq || []).filter(function (x) { return x.status === "pending" && x.book === book && x.code === code && x.id !== reqId; });
    for (var i = 0; i < others.length; i++) await db().from("an_requests").update({ status: "rejected", admin_note: "Another analysis was approved for this item", reviewed_by: S.me.id, reviewed_at: new Date().toISOString() }).eq("id", others[i].id);
    return true;
  }

  document.addEventListener("click", async function (e) {
    var t = e.target.closest && e.target.closest("button"); if (!t) return;
    var ds = t.dataset;
    if (ds.apvreq) {
      var it = U.est.findItem(ds.apvreq); if (!it) return;
      var data = EP.anFromCustom(it); if (!data || !data.L.length) { U.toast("Add the analysis lines first"); return; }
      var note = ((document.getElementById("reqn-" + it.id) || {}).value || "").trim(), sor = EP.sorRate(it.b, it.c);
      var r = await db().from("an_requests").insert({ owner: S.me.id, status: "pending", book: it.b, code: it.c, data: data, sor: sor, an_rate: data.s, note: note.slice(0, 500), est_name: (S.est.cur && S.est.cur.name || "").slice(0, 200) }).select("*").single();
      if (U.fail(r, "Couldn't send it for approval.")) return;
      S.anReq = [r.data].concat(S.anReq || []); if (U.logAct) U.logAct("an_request", it.b + " " + it.c); U.render(); U.toast("Sent to the admin for approval");
    }
    else if (ds.apvself) {
      var it2 = U.est.findItem(ds.apvself); if (!it2) return; var d2 = EP.anFromCustom(it2); if (!d2 || !d2.L.length) { U.toast("Add the analysis lines first"); return; }
      if (await approve(it2.b, it2.c, d2, null, "")) { await U.loadApprovals(); U.toast("Approved — it is now the analysis of " + it2.c + " for everyone"); }
    }
    else if (ds.apvopen) { S.apv.open[ds.apvopen] = !S.apv.open[ds.apvopen]; U.render(); }
    else if (ds.apvok || ds.apvno) {
      var id = ds.apvok || ds.apvno, q = (S.anReq || []).filter(function (x) { return x.id === id; })[0]; if (!q) return;
      var nt = ((document.getElementById("apvn-" + id) || {}).value || "").trim();
      if (ds.apvok) { if (await approve(q.book, q.code, q.data, q.id, nt)) U.toast("Approved — " + q.code + " now has this analysis for everyone"); }
      else { var r2 = await db().from("an_requests").update({ status: "rejected", admin_note: nt, reviewed_by: S.me.id, reviewed_at: new Date().toISOString() }).eq("id", id); if (U.fail(r2, "Couldn't save.")) return; U.toast("Marked as not approved"); }
      await U.loadApprovals();
    }
    else if (ds.apvdel) {
      if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again to remove"; return; }
      var p = ds.apvdel.split("|"); var r3 = await db().from("approved_analyses").delete().eq("book", p[0]).eq("code", p[1]); if (U.fail(r3, "Couldn't remove.")) return;
      EP.removeApproved(p[0], p[1]); await U.loadApprovals(); U.toast("Removed — the item uses its SOR rate again");
    }
  });
  document.addEventListener("input", function (e) { var t = e.target; if (t.id && t.id.indexOf("reqn-") === 0) S.apv.reqNote[t.id.slice(5)] = t.value; else if (t.id && t.id.indexOf("apvn-") === 0) S.apv.note[t.id.slice(5)] = t.value; });
})();
