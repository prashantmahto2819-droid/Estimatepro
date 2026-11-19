/* WhatsApp messages to users (sent by the server through the OTP WhatsApp number):
   – "what's new" after an upload: the super admin gets a banner with the release notes and one Send button
   – reminder with the user's own figures after 15 days without opening the app (daily timer on the server)
   – every user can turn these off in Help. Needs wa_messages.sql + the wa-outbox edge function. */
(function () {
  var EP = window.EP, U = EP.ui, S = EP.S, esc = U.esc;
  var W = S.wa = { rel: null, st: null, busy: false, draft: null, optout: null };
  function db() { return U.db(); }

  /* super admin: new version uploaded and not announced yet → banner */
  async function checkRelease() {
    if (!S.me || !S.me.isOwner || !window.EP_VER || W.rel !== null) return; W.rel = "checking";
    var r = await db().from("app_releases").select("ver").eq("ver", window.EP_VER).maybeSingle();
    W.rel = r.error ? "na" : r.data ? "done" : "new"; if (W.rel === "new") U.render();
  }
  U.waBanner = function () {
    if (!S.me || !S.me.isOwner) return ""; if (W.rel === null) setTimeout(checkRelease, 1500);
    if (W.rel !== "new") return "";
    var notes = W.draft != null ? W.draft : (window.EP_NOTES || "");
    return "<div class='panel' style='border-left:4px solid #25d366;display:flex;flex-direction:column;gap:8px;margin-bottom:12px'><strong>🆕 New version " + esc(window.EP_VER) + " is live — send “What's new” to users on WhatsApp?</strong>" +
      "<textarea class='in' id='wa-notes' rows='5' aria-label='Release notes'>" + esc(notes) + "</textarea>" +
      "<span class='muted' style='font-size:12px'>Goes once to every user who has a mobile number and has not turned updates off, a few messages per minute. Edit the text if you like.</span>" +
      "<div class='row' style='gap:8px;flex-wrap:wrap'><button type='button' class='btn pri sm' id='wa-rel-send'" + (W.busy ? " disabled" : "") + ">" + (W.busy ? "Queuing…" : "Send on WhatsApp") + "</button><button type='button' class='btn ghost sm' id='wa-rel-skip'>Don't send for this version</button></div></div>";
  };

  /* super admin: panel in Users */
  async function loadStatus() { var r = await db().rpc("wa_status"); W.st = r.error ? { err: r.error.message } : r.data; U.render(); }
  U.waAdmin = function () {
    if (!S.me || !S.me.isOwner) return "";
    var s = W.st, h = "<details id='wa-det'" + (W.open ? " open" : "") + "><summary><strong>WhatsApp messages to users</strong> — update news and the 15-day reminder</summary><div style='display:flex;flex-direction:column;gap:8px;margin-top:8px'>";
    if (!s) { if (W.open) setTimeout(loadStatus, 10); return h + "<span class='muted'>Loading…</span></div></details>"; }
    if (s.err) return h + "<div class='badge dan' style='white-space:normal'>Not set up yet: run wa_messages.sql in Supabase and deploy the wa-outbox function. (" + esc(s.err) + ")</div></div></details>";
    h += "<div class='row' style='gap:14px;flex-wrap:wrap'><span>📱 Users with WhatsApp no.: <strong>" + s.with_phone + "</strong></span><span>⏳ Waiting: <strong>" + s.queued + "</strong></span><span>✅ Sent (24 h): <strong>" + s.sent24 + "</strong></span><span>❌ Failed (7 days): <strong>" + s.failed + "</strong></span><span>🔕 Turned off: <strong>" + s.optout + "</strong></span><button type='button' class='btn ghost sm' id='wa-refresh'>Refresh</button></div>";
    h += "<label class='row' style='gap:8px;flex-wrap:wrap;align-items:center'><input type='checkbox' id='wa-in-on'" + (s.inactive_on === "true" ? " checked" : "") + "> Send a reminder with their figures (estimates, scans, photos) when someone has not opened the app for <input class='in small' id='wa-in-days' type='number' min='3' max='90' value='" + esc(s.inactive_days) + "' style='width:64px'> days <button type='button' class='btn sec sm' id='wa-in-save'>Save</button><button type='button' class='btn ghost sm' id='wa-in-run'>Check now</button></label>";
    h += "<span class='muted' style='font-size:12px'>The server checks every day at 10:00 am and sends each person the reminder only once per absence. To announce a new version, the banner appears at the top after you upload the app.</span>";
    h += "<details><summary>Send a custom update now</summary><div style='display:flex;flex-direction:column;gap:6px;margin-top:6px'><input class='in' id='wa-c-ver' placeholder='Title / version, e.g. DSR 2025 added' style='max-width:360px'><textarea class='in' id='wa-c-txt' rows='3' placeholder='Message'></textarea><div><button type='button' class='btn pri sm' id='wa-c-send'>Send to all users on WhatsApp</button></div></div></details>";
    if (s.recent && s.recent.length) h += "<div class='tw' style='max-height:260px;overflow:auto'><table class='t'><thead><tr><th>Queued</th><th>Type</th><th>Status</th><th>Message</th></tr></thead><tbody>" + s.recent.map(function (x) { return "<tr><td>" + U.when(x.created_at) + "</td><td>" + esc(x.kind === "inactive" ? "15-day reminder" : "Update " + x.ref) + "</td><td>" + esc(x.status) + (x.err ? "<br><span class='muted' style='font-size:11px'>" + esc(x.err) + "</span>" : "") + "</td><td style='font-size:12px'>" + esc(x.body) + "…</td></tr>"; }).join("") + "</tbody></table></div>";
    return h + "</div></details>";
  };

  /* every user: on / off (in Help) */
  async function loadOpt() { var r = await db().from("profiles").select("wa_optout").eq("id", S.me.id).maybeSingle(); W.optout = r.error || !r.data ? "na" : !!r.data.wa_optout; U.render(); }
  U.waOptBox = function () {
    if (!S.me || !S.me.id) return ""; if (W.optout === null) { W.optout = "loading"; setTimeout(loadOpt, 10); return ""; }
    if (W.optout === "na" || W.optout === "loading") return "";
    return "<div class='panel row' style='gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px'><strong>WhatsApp updates</strong><span class='muted' style='font-size:13px'>New features, and a reminder with your figures if you have not opened the app for a while.</span><div class='seg' role='group' aria-label='WhatsApp updates'><button type='button' data-waopt='on' aria-pressed='" + !W.optout + "'>On</button><button type='button' data-waopt='off' aria-pressed='" + W.optout + "'>Off</button></div></div>";
  };
  var helpView = U.views.help; if (helpView) U.views.help = function () { return U.waOptBox() + helpView.apply(this, arguments); };

  document.addEventListener("toggle", function (e) { if (e.target.id === "wa-det") { W.open = e.target.open; if (W.open && !W.st) loadStatus(); } }, true);
  document.addEventListener("input", function (e) { if (e.target.id === "wa-notes") W.draft = e.target.value; });
  document.addEventListener("click", async function (e) {
    var t = e.target.closest && e.target.closest("button"); if (!t) return; var id = t.id, r;
    if (t.dataset.waopt) { var off = t.dataset.waopt === "off"; r = await db().rpc("set_wa_optout", { off_: off }); if (U.fail(r, "Couldn't save.")) return; W.optout = off; U.render(); U.toast(off ? "WhatsApp updates turned off" : "WhatsApp updates turned on"); return; }
    if (!S.me || !S.me.isOwner) return;
    if (id === "wa-rel-send") {
      var notes = ((document.getElementById("wa-notes") || {}).value || "").trim(); if (!notes) { U.toast("Write what's new first."); return; }
      W.busy = true; U.render(); r = await db().rpc("queue_release", { p_ver: window.EP_VER, p_notes: notes }); W.busy = false;
      if (U.fail(r, "Couldn't queue the messages.")) { U.render(); return; }
      W.rel = "done"; W.st = null; U.render(); U.toast("Update queued for " + r.data + " users — WhatsApp sends a few per minute");
    } else if (id === "wa-rel-skip") { r = await db().rpc("skip_release", { p_ver: window.EP_VER }); if (U.fail(r, "Couldn't save.")) return; W.rel = "done"; U.render(); }
    else if (id === "wa-refresh") { W.st = null; loadStatus(); }
    else if (id === "wa-in-save") { var on = document.getElementById("wa-in-on").checked, d = +document.getElementById("wa-in-days").value || 15; r = await db().rpc("wa_settings", { on_: on, days: d }); if (U.fail(r, "Couldn't save.")) return; U.toast(on ? "Reminder on — after " + d + " days" : "Reminder off"); loadStatus(); }
    else if (id === "wa-in-run") { r = await db().rpc("queue_inactive_digest"); if (U.fail(r, "Couldn't check.")) return; U.toast(r.data ? r.data + " reminder(s) queued" : "Nobody needs a reminder right now"); loadStatus(); }
    else if (id === "wa-c-send") {
      var v = (document.getElementById("wa-c-ver").value || "").trim(), tx = (document.getElementById("wa-c-txt").value || "").trim(); if (!v || !tx) { U.toast("Write a title and the message."); return; }
      if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Tap again to send to everyone"; return; }
      r = await db().rpc("queue_release", { p_ver: v, p_notes: tx }); if (U.fail(r, "Couldn't queue the messages.")) return; U.toast("Queued for " + r.data + " users"); loadStatus();
    }
  });
})();
