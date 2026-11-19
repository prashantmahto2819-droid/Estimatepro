/* Estimate Pro — Backup & restore.
   Everyone: "Download my backup" (estimates, personal rates, NS library, own SORs, letterhead defaults and this
   computer's app settings) as one .json file, and "Restore from a backup file" into the signed-in account.
   Super admin: also a full backup of ALL users (server function admin_export) and a full restore
   (admin_import, people matched by email). A restore never deletes anything; items already present are skipped. */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc;
  var LAST = "ep_last_backup", REMIND_DAYS = 7;
  S.bk = { busy: "", file: null, data: null, err: "", report: null, opt: { est: true, rates: true, ns: true, sors: true, local: true } };

  function db() { return U.db(); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lastBackup() { var v = +lsGet(LAST); return v > 0 ? v : 0; }
  function daysSince(t) { return t ? Math.floor((Date.now() - t) / 86400000) : null; }
  U.backupDue = function () { if (!S.me.id || !(S.est.mine || []).length) return false; var d = daysSince(lastBackup()); return d == null || d >= REMIND_DAYS; };
  function stamp() { var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "_" + p(d.getHours()) + p(d.getMinutes()); }
  function save(obj, name) {
    var b = new Blob([JSON.stringify(obj)], { type: "application/json" });
    if (EP.download) EP.download(b, name); else { var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); }
  }
  async function all(q) { // page through > 1000 rows
    var out = [], from = 0;
    while (true) { var r = await q().range(from, from + 999); if (r.error) throw r.error; out = out.concat(r.data || []); if ((r.data || []).length < 1000) break; from += 1000; }
    return out;
  }
  function localSettings() {
    var o = {}; try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^ep_/.test(k) && k !== "ep_claim" && k !== LAST) o[k] = localStorage.getItem(k); } } catch (e) {}
    return o;
  }

  /* ---------- export ---------- */
  async function exportMine() {
    var me = S.me.id;
    var est = await all(function () { return db().from("estimates").select("name,gst,lines,data,created_at,updated_at").eq("owner", me).order("created_at"); });
    var rates = await all(function () { return db().from("user_rates").select("id,data").eq("owner", me); }).catch(function () { return []; });
    var ns = await all(function () { return db().from("user_ns").select("name,unit,data").eq("owner", me); }).catch(function () { return []; });
    var ans = await all(function () { return db().from("user_analyses").select("book,code,name,data").eq("owner", me); }).catch(function () { return []; });
    var sors = await all(function () { return db().from("user_sors").select("id,name,short,created_at").eq("owner", me).order("created_at"); });
    for (var i = 0; i < sors.length; i++) {
      var sid = sors[i].id;
      sors[i].items = await all(function () { return db().from("user_sor_items").select("code,descr,unit,rate,chapter,an_rate,an_note").eq("sor_id", sid); });
      delete sors[i].id;
    }
    var prof = await db().from("profiles").select("defaults").eq("id", me).maybeSingle();
    return { app: "estimate-pro", kind: "personal", version: 1, exported_at: new Date().toISOString(), email: S.me.email, full_name: S.me.name,
      defaults: prof.data ? prof.data.defaults : null, estimates: est, user_rates: rates, user_ns: ns, user_analyses: ans, user_sors: sors, local: localSettings() };
  }
  async function doExport(full) {
    var B = S.bk; if (B.busy) return; B.busy = full ? "Making the full backup…" : "Making your backup…"; B.err = ""; U.render();
    try {
      var obj;
      if (full) { var r = await db().rpc("admin_export"); if (r.error) throw r.error; obj = r.data; obj.local = localSettings(); }
      else obj = await exportMine();
      var who = full ? "ALL-USERS" : String(S.me.email || "me").split("@")[0].replace(/[^\w.-]/g, "");
      save(obj, "EstimatePro_backup_" + who + "_" + stamp() + ".json");
      lsSet(LAST, String(Date.now()));
      U.toast((full ? "Full backup" : "Backup") + " downloaded: " + (obj.estimates || []).length + " estimates");
    } catch (e) { console.error(e); B.err = "Backup failed: " + (e.message || e); }
    B.busy = ""; U.render();
  }

  /* ---------- read a backup file ---------- */
  function readFile(f) {
    var B = S.bk; B.err = ""; B.report = null; B.data = null; B.file = f ? f.name : null; if (!f) { U.render(); return; }
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var o = JSON.parse(rd.result);
        if (!o || o.app !== "estimate-pro") throw new Error("This is not an Estimate Pro backup file.");
        if (o.kind === "full" && !S.me.isOwner) throw new Error("This is a full backup of all users. Only the super admin can restore it. Ask for your personal backup instead.");
        B.data = o;
      } catch (e) { B.err = e.message || String(e); }
      U.render();
    };
    rd.onerror = function () { B.err = "Couldn't read the file."; U.render(); };
    rd.readAsText(f);
  }
  function summary(o) {
    var n = function (a) { return (a || []).length; };
    var items = (o.user_sors || []).reduce(function (m, s) { return m + n(s.items); }, 0);
    var rows = [["Estimates", n(o.estimates)], ["Personal rate changes", n(o.user_rates)], ["NS items (my library)", n(o.user_ns)], ["My saved analyses", n(o.user_analyses)], ["My SORs", n(o.user_sors) + (items ? " (" + items + " items)" : "")]];
    if (o.kind === "full") rows.unshift(["Users (role + licence)", n(o.users)]), rows.push(["Shared rate changes", n(o.rate_overrides)]), rows.push(["App settings", n(o.app_settings)]);
    if (o.local && Object.keys(o.local).length) rows.push(["App settings on this computer (Design Studio, edited suggestions…)", Object.keys(o.local).length]);
    return rows;
  }

  /* ---------- restore ---------- */
  async function restoreMine(o, opt) {
    var me = S.me.id, rep = { estimates: 0, estimates_skipped: 0, user_rates: 0, user_ns: 0, user_analyses: 0, user_sors: 0, user_sors_skipped: 0, sor_items: 0, local: 0 }, err;
    if (opt.est && (o.estimates || []).length) {
      var have = await all(function () { return db().from("estimates").select("name,data").eq("owner", me); });
      var sig = {}; have.forEach(function (x) { sig[x.name + "\u0001" + JSON.stringify(x.data)] = 1; });
      for (var i = 0; i < o.estimates.length; i++) {
        var e = o.estimates[i];
        if (sig[e.name + "\u0001" + JSON.stringify(e.data)]) { rep.estimates_skipped++; continue; }
        S.bk.busy = "Restoring estimates " + (i + 1) + " / " + o.estimates.length + "…"; U.render();
        var r = await db().from("estimates").insert({ owner: me, name: String(e.name || "Restored estimate").slice(0, 200), gst: e.gst == null ? 18 : +e.gst, lines: e.lines || [], data: e.data });
        if (r.error) { err = r.error; break; } rep.estimates++;
      }
    }
    if (!err && opt.rates && (o.user_rates || []).length) {
      var rr = o.user_rates.map(function (x) { return { owner: me, id: x.id, data: x.data || {} }; });
      for (var j = 0; j < rr.length; j += 500) { var w = await db().from("user_rates").upsert(rr.slice(j, j + 500)); if (w.error) { err = w.error; break; } rep.user_rates += Math.min(500, rr.length - j); }
    }
    if (!err && opt.ns && (o.user_ns || []).length) {
      var cur = await all(function () { return db().from("user_ns").select("id,name,unit").eq("owner", me); }), idx = {};
      cur.forEach(function (x) { idx[x.name + "\u0001" + x.unit] = x.id; });
      for (var k = 0; k < o.user_ns.length; k++) {
        var x = o.user_ns[k], id = idx[x.name + "\u0001" + (x.unit || "")];
        var q = id ? await db().from("user_ns").update({ data: x.data || {} }).eq("id", id) : await db().from("user_ns").insert({ owner: me, name: x.name, unit: x.unit || "", data: x.data || {} });
        if (q.error) { err = q.error; break; } rep.user_ns++;
      }
    }
    if (!err && opt.ns && (o.user_analyses || []).length) {
      var ca = await all(function () { return db().from("user_analyses").select("id,book,code,name").eq("owner", me); }), ia = {};
      ca.forEach(function (x) { ia[x.book + "\u0001" + x.code + "\u0001" + x.name] = x.id; });
      for (var a = 0; a < o.user_analyses.length; a++) {
        var y = o.user_analyses[a], aid = ia[y.book + "\u0001" + y.code + "\u0001" + (y.name || "")];
        var qa = aid ? await db().from("user_analyses").update({ data: y.data || {} }).eq("id", aid) : await db().from("user_analyses").insert({ owner: me, book: y.book, code: y.code, name: y.name || "", data: y.data || {} });
        if (qa.error) { err = qa.error; break; } rep.user_analyses++;
      }
    }
    if (!err && opt.sors && (o.user_sors || []).length) {
      var mine = await all(function () { return db().from("user_sors").select("name").eq("owner", me); }), names = {};
      mine.forEach(function (s) { names[s.name] = 1; });
      for (var m = 0; m < o.user_sors.length && !err; m++) {
        var s = o.user_sors[m]; if (names[s.name]) { rep.user_sors_skipped++; continue; }
        S.bk.busy = "Restoring SOR “" + s.name + "”…"; U.render();
        var ins = await db().from("user_sors").insert({ name: String(s.name).slice(0, 120), short: s.short, item_count: (s.items || []).length }).select("id").single();
        if (ins.error) { err = ins.error; break; }
        var its = (s.items || []).map(function (i) { return { sor_id: ins.data.id, code: i.code, descr: i.descr || "", unit: i.unit || "", rate: i.rate, chapter: i.chapter || "", an_rate: i.an_rate, an_note: i.an_note || "" }; });
        for (var c = 0; c < its.length; c += 500) { var wi = await db().from("user_sor_items").insert(its.slice(c, c + 500)); if (wi.error) { err = wi.error; break; } rep.sor_items += Math.min(500, its.length - c); }
        rep.user_sors++;
      }
    }
    if (!err && o.defaults) await db().from("profiles").update({ defaults: o.defaults }).eq("id", me).then(function () {}, function () {});
    if (err) throw err;
    return rep;
  }
  function restoreLocal(o) { var n = 0; Object.keys(o.local || {}).forEach(function (k) { if (/^ep_/.test(k) && k !== "ep_claim") { lsSet(k, o.local[k]); n++; } }); return n; }
  async function doRestore() {
    var B = S.bk, o = B.data; if (!o || B.busy) return;
    if (U.locked && U.locked()) { B.err = "Your trial has ended, so nothing can be saved. Contact sales to activate, then restore."; U.render(); return; }
    B.busy = "Restoring…"; B.err = ""; B.report = null; U.render();
    try {
      var rep;
      if (S.me.isOwner) {
        // super admin: everything goes through the server so other people's data lands in their accounts
        var full = o;
        if (o.kind !== "full") {
          var em = o.email || S.me.email, tag = function (a) { return (a || []).map(function (x) { return Object.assign({ owner_email: em }, x); }); };
          full = { app: "estimate-pro", kind: "full", version: 1, users: [], estimates: B.opt.est ? tag(o.estimates) : [], user_rates: B.opt.rates ? tag(o.user_rates) : [],
            user_ns: B.opt.ns ? tag(o.user_ns) : [], user_analyses: B.opt.ns ? tag(o.user_analyses) : [], user_sors: B.opt.sors ? tag(o.user_sors) : [], rate_overrides: [], app_settings: [] };
        } else full = Object.assign({}, o, { estimates: B.opt.est ? o.estimates : [], user_rates: B.opt.rates ? o.user_rates : [], user_ns: B.opt.ns ? o.user_ns : [], user_analyses: B.opt.ns ? o.user_analyses || [] : [], user_sors: B.opt.sors ? o.user_sors : [] });
        delete full.local;
        var r = await db().rpc("admin_import", { b: full }); if (r.error) throw r.error; rep = r.data;
      } else rep = await restoreMine(o, B.opt);
      rep.local = B.opt.local ? restoreLocal(o) : 0;
      B.report = rep;
      U.watchEst(S.me.id, true); if (U.loadSors) U.loadSors(); if (U.loadNs) U.loadNs();
      U.toast("Restore finished");
    } catch (e) { console.error(e); B.err = "Restore stopped: " + (e.message || e) + ". Whatever was restored before this point is kept; you can run the restore again safely (items already present are skipped)."; }
    B.busy = ""; U.render();
  }

  /* ---------- view ---------- */
  U.views.backup = function () {
    var B = S.bk, lb = lastBackup(), d = daysSince(lb);
    var h = '<div style="display:flex;flex-direction:column;gap:14px;max-width:900px"><h1>Backup &amp; restore</h1>';
    h += '<p class="muted" style="margin:0">Rate books, SORs, analyses, suggested items and the Design Studio are part of the app and never get lost. What you <strong>make</strong> is kept on the server: your estimates, personal rate changes, NS library and uploaded SORs. Download a backup file regularly and keep it in Google Drive / email / pen drive. If anything ever goes wrong you can put everything back from that file.</p>';
    h += '<div class="badge ' + (d == null || d >= REMIND_DAYS ? "warn" : "ok") + '" style="white-space:normal;align-self:flex-start">' + (lb ? "Last backup from this computer: " + new Date(lb).toLocaleString("en-IN") + " (" + (d === 0 ? "today" : d + (d === 1 ? " day" : " days") + " ago") + ")" : "No backup downloaded from this computer yet") + (d == null || d >= REMIND_DAYS ? " · we suggest one backup every week" : "") + "</div>";
    if (B.busy) h += '<div class="badge info" role="status" style="align-self:flex-start">' + esc(B.busy) + "</div>";
    if (B.err) h += '<div class="badge dan" role="alert" style="white-space:normal">' + esc(B.err) + "</div>";

    h += '<div class="panel form"><h3>1. Download a backup</h3><p class="muted" style="margin:0">One .json file with all your estimates, personal rates, NS items, your SORs, letterhead details and this computer\'s app settings.</p><div class="row">';
    h += '<button type="button" class="btn pri" id="bk-mine"' + (B.busy ? " disabled" : "") + ">Download my backup</button>";
    if (S.me.isOwner) h += '<button type="button" class="btn sec" id="bk-full"' + (B.busy ? " disabled" : "") + ">Download full backup (all users)</button>";
    h += "</div>";
    if (S.me.isOwner) h += '<p class="muted" style="margin:0;font-size:12px">Super admin: the full backup has every user\'s estimates, personal rates, NS library and SORs, the shared rate changes, user roles and licences, and app settings. Keep it private: it contains everyone\'s work.</p>';
    h += "</div>";

    h += '<div class="panel form"><h3>2. Restore from a backup file</h3><p class="muted" style="margin:0">Nothing is deleted. Estimates with the same name and contents, and SORs with the same name, are skipped, so running a restore twice is safe.' + (S.me.isOwner ? " A full backup puts each person's work back into their own account (matched by email). People who haven't signed up again yet are listed; restore again after they sign up." : "") + "</p>";
    h += '<label class="fld"><span class="lbl">Backup file (.json)</span><input type="file" id="bk-file" accept=".json,application/json"></label>';
    if (B.data) {
      var o = B.data;
      h += '<div class="muted">File: <strong>' + esc(B.file) + "</strong> · " + (o.kind === "full" ? "full backup (all users)" : "personal backup of " + esc(o.email || "") ) + (o.exported_at ? " · made " + esc(new Date(o.exported_at).toLocaleString("en-IN")) : "") + "</div>";
      if (o.kind !== "full" && o.email && S.me.email && o.email.toLowerCase() !== S.me.email.toLowerCase()) h += '<div class="badge warn" style="white-space:normal;align-self:flex-start">' + (S.me.isOwner ? "This backup belongs to " + esc(o.email) + ". It will be restored into THEIR account (they must have signed up)." : "This backup was made by " + esc(o.email) + ". It will be restored into YOUR account.") + "</div>";
      h += '<div class="tw"><table class="t"><tbody>' + summary(o).map(function (r) { return "<tr><td>" + esc(r[0]) + "</td><td class='num'>" + esc(r[1]) + "</td></tr>"; }).join("") + "</tbody></table></div>";
      var ch = function (k, t) { return '<label class="row" style="gap:6px"><input type="checkbox" data-bkopt="' + k + '"' + (B.opt[k] ? " checked" : "") + "> " + t + "</label>"; };
      h += '<div class="row" style="flex-wrap:wrap;gap:14px">' + ch("est", "Estimates") + ch("rates", "Personal rates") + ch("ns", "NS library") + ch("sors", "My SORs") + ch("local", "Settings on this computer") + "</div>";
      h += '<div class="row"><button type="button" class="btn pri" id="bk-restore"' + (B.busy ? " disabled" : "") + ">Restore now</button></div>";
    }
    if (B.report) {
      var R = B.report, L = [["Estimates restored", R.estimates], ["Estimates already there (skipped)", R.estimates_skipped], ["Personal rates", R.user_rates], ["NS items", R.user_ns], ["Saved analyses", R.user_analyses], ["SORs restored", R.user_sors], ["SORs already there (skipped)", R.user_sors_skipped], ["SOR items", R.sor_items]];
      if (R.users != null) L.unshift(["Users updated (role + licence)", R.users]), L.push(["Shared rate changes", R.rate_overrides]), L.push(["App settings", R.app_settings]);
      if (R.local) L.push(["Settings on this computer (reload the page to use them)", R.local]);
      h += '<div class="badge ok" style="align-self:flex-start">Restore finished</div><div class="tw"><table class="t"><tbody>' + L.filter(function (x) { return x[1] != null; }).map(function (x) { return "<tr><td>" + esc(x[0]) + "</td><td class='num'>" + esc(x[1]) + "</td></tr>"; }).join("") + "</tbody></table></div>";
      if ((R.missing_users || []).length) h += '<div class="badge warn" style="white-space:normal;align-self:flex-start">Not signed up yet, so their work was not restored: ' + esc(R.missing_users.join(", ")) + ". Ask them to sign up with the same email, then restore this file again.</div>";
    }
    h += "</div>";
    h += '<p class="muted" style="margin:0;font-size:12px">Tip: also keep the Excel / PDF of important estimates (Estimates → Export). The backup file can only be opened by Estimate Pro.</p>';
    return h + "</div>";
  };

  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("button"); if (!t) return;
    if (t.id === "bk-mine") doExport(false);
    else if (t.id === "bk-full") doExport(true);
    else if (t.id === "bk-restore") doRestore();
  });
  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.id === "bk-file") readFile(t.files && t.files[0]);
    else if (t.dataset && t.dataset.bkopt) { S.bk.opt[t.dataset.bkopt] = t.checked; }
  });
})();
