/* Estimate Pro — Users tab extras (super admin) and group-admin view.
   search & filter · licence reminders (WhatsApp / email) · phone · payments · block / sign out · activity log ·
   notice to all users · users list download · group admin: members, their projects, group rates. */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc, inr = U.inr;
  S.uf = { q: "", f: "all", pay: {}, payForm: {}, actUser: "", showAct: false, showPay: false };
  S.pays = []; S.acts = []; S.notice = { text: "", at: "", draft: null };
  function db() { return U.db(); }
  function now() { return Date.now(); }
  function fmtD(d) { return d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : ""; }
  function lic(u) {
    if (u.role === "super_admin") return "admin";
    if (u.activated && (!u.activated_until || Date.parse(u.activated_until) > now())) return "active";
    if (u.trial_ends && Date.parse(u.trial_ends) > now()) return "trial";
    return "expired";
  }
  function endsAt(u) { var k = lic(u); return k === "active" ? (u.activated_until ? Date.parse(u.activated_until) : null) : k === "trial" ? Date.parse(u.trial_ends) : null; }
  function soon(u) { var e = endsAt(u); return e != null && e - now() < 7 * 864e5; }
  function inGroup(u, tid) { return (S.grp.members || []).some(function (m) { return m.team_id === tid && m.user_id === u.id; }); }

  /* ---------- activity log ---------- */
  U.logAct = function (kind, detail) { try { if (S.me && S.me.id) db().from("activity").insert({ user_id: S.me.id, kind: kind, detail: String(detail || "").slice(0, 300) }).then(function () {}, function () {}); } catch (e) {} };
  async function loadActs() {
    var q = db().from("activity").select("id,user_id,at,kind,detail").order("at", { ascending: false }).limit(300);
    if (S.uf.actUser) q = q.eq("user_id", S.uf.actUser);
    var r = await q; if (!r.error) { S.acts = r.data || []; U.resolveNames && U.resolveNames(S.acts.map(function (a) { return a.user_id; })); U.render(); }
  }
  /* ---------- payments ---------- */
  async function loadPays() { var r = await db().from("payments").select("*").order("paid_on", { ascending: false }); if (!r.error) { S.pays = r.data || []; U.render(); } }
  /* ---------- notice ---------- */
  U.loadNotice = async function () { try { var r = await db().rpc("get_notice"); if (!r.error && r.data && r.data[0]) { S.notice.text = r.data[0].notice || ""; S.notice.at = r.data[0].at || ""; U.render(); } } catch (e) {} };
  U.noticeBanner = function () {
    var n = S.notice; if (!n.text || !S.me.id) return "";
    var gone = ""; try { gone = localStorage.getItem("ep_notice_seen") || ""; } catch (e) {}
    if (gone === n.at) return "";
    return "<div class='noticebar' role='status'><b>Notice:</b> " + esc(n.text).replace(/\n/g, "<br>") + " <button type='button' class='btn ghost sm' id='notice-ok'>OK, hide</button></div>";
  };

  /* ---------- filter ---------- */
  U.userFilter = function (list) {
    var q = S.uf.q.trim().toLowerCase(), f = S.uf.f;
    return (list || []).filter(function (u) {
      if (q && ((u.full_name || "") + " " + (u.email || "") + " " + (u.phone || "")).toLowerCase().indexOf(q) < 0) return false;
      var k = lic(u);
      if (f === "soon") return (k === "trial" || k === "active") && soon(u);
      if (f === "expired") return k === "expired";
      if (f === "trial") return k === "trial";
      if (f === "active") return k === "active" || k === "admin";
      if (f === "blocked") return !!u.blocked;
      if (f === "online") return !!u.device && u.session_at && now() - Date.parse(u.session_at) < 864e5;
      if (f.indexOf("g:") === 0) return inGroup(u, f.slice(2));
      if (f === "nogroup") return !(S.grp.members || []).some(function (m) { return m.user_id === u.id; });
      return true;
    });
  };

  function waLink(u, text) { var p = String(u.phone || "").replace(/\D/g, ""); if (p.length === 10) p = "91" + p; return p ? "https://wa.me/" + p + "?text=" + encodeURIComponent(text) : ""; }
  function remindText(u) {
    var k = lic(u), e = endsAt(u), c = (S.lic && S.lic.sales_phone) || "7400501000";
    var when = e ? (e < now() ? "ended on " + fmtD(e) : "ends on " + fmtD(e)) : "has ended";
    return "Namaste " + (u.full_name || "") + ", your Estimate Pro " + (k === "trial" ? "free trial" : "licence") + " " + when + ". To continue without a break, please renew. Call / WhatsApp " + c + ". — Vividbrandify";
  }

  /* ---------- top panels for the super admin ---------- */
  U.adminTop = function () {
    var L = S.est.usersInfo || [], c = { all: L.length, soon: 0, expired: 0, trial: 0, active: 0, blocked: 0 };
    L.forEach(function (u) { var k = lic(u); if (k === "expired") c.expired++; if (k === "trial") c.trial++; if (k === "active" || k === "admin") c.active++; if ((k === "trial" || k === "active") && soon(u)) c.soon++; if (u.blocked) c.blocked++; });
    var h = "<div class='panel' style='padding:12px;display:flex;flex-direction:column;gap:10px'>";
    // search + filter + download
    var fl = [["all", "All (" + c.all + ")"], ["soon", "Ending in 7 days (" + c.soon + ")"], ["expired", "Expired (" + c.expired + ")"], ["trial", "On trial (" + c.trial + ")"], ["active", "Active (" + c.active + ")"], ["blocked", "Blocked (" + c.blocked + ")"], ["online", "Signed in today"], ["nogroup", "Not in any group"]];
    (S.grp.teams || []).forEach(function (t) { fl.push(["g:" + t.id, "Group: " + t.name]); });
    h += "<div class='row' style='gap:8px;flex-wrap:wrap;align-items:center'><input class='in grow' id='uf-q' style='min-width:220px' placeholder='Search name, email or phone' value='" + esc(S.uf.q) + "' aria-label='Search users'>" +
      "<select class='in' id='uf-f' aria-label='Show'>" + fl.map(function (x) { return "<option value='" + esc(x[0]) + "'" + (S.uf.f === x[0] ? " selected" : "") + ">" + esc(x[1]) + "</option>"; }).join("") + "</select>" +
      "<button type='button' class='btn sec sm' id='u-csv'>Download users (Excel / CSV)</button></div>";
    // reminders
    var due = L.filter(function (u) { var k = lic(u); return !u.blocked && ((k === "trial" || k === "active") && soon(u) || k === "expired" && endsAt(u) !== null || k === "expired"); }).filter(function (u) { return u.role !== "super_admin"; });
    due.sort(function (a, b) { return (endsAt(a) || 0) - (endsAt(b) || 0); });
    if (due.length) {
      h += "<details" + (c.soon ? " open" : "") + "><summary><strong>Licence reminders</strong> — " + c.soon + " ending in 7 days, " + c.expired + " expired</summary><div class='tw' style='margin-top:6px'><table class='t'><thead><tr><th>Person</th><th>Status</th><th>Phone</th><th>Remind</th><th>Renew</th></tr></thead><tbody>" +
        due.slice(0, 60).map(function (u) {
          var k = lic(u), e = endsAt(u), wa = waLink(u, remindText(u));
          return "<tr><td>" + esc(u.full_name || "—") + "<br><span class='muted' style='font-size:12px'>" + esc(u.email || "") + "</span></td><td><span class='badge " + (k === "expired" ? "dan" : "warn") + "'>" + (k === "expired" ? "Expired" : (k === "trial" ? "Trial" : "Licence") + " ends " + fmtD(e)) + "</span></td><td>" + esc(u.phone || "—") + "</td><td style='white-space:nowrap'>" +
            (wa ? "<a class='btn sec sm' target='_blank' rel='noopener' href='" + esc(wa) + "'>WhatsApp</a> " : "<span class='muted' style='font-size:12px'>add phone for WhatsApp</span> ") +
            (u.email ? "<a class='btn ghost sm' href='mailto:" + esc(u.email) + "?subject=" + encodeURIComponent("Estimate Pro licence") + "&body=" + encodeURIComponent(remindText(u)) + "'>Email</a> " : "") +
            "<button type='button' class='btn ghost sm' data-ucopy='" + esc(u.id) + "'>Copy message</button></td><td><select class='in' data-lic='" + esc(u.id) + "' aria-label='Renew'><option value=''>Renew…</option><option value='m1'>1 month</option><option value='m3'>3 months</option><option value='m6'>6 months</option><option value='y1'>1 year</option><option value='life'>Lifetime</option><option value='t7'>Trial +7 days</option></select></td></tr>";
        }).join("") + "</tbody></table></div></details>";
    }
    // payments summary
    var P = S.pays || [], m0 = new Date(), ym = function (d) { return String(d).slice(0, 7); }, thisM = m0.toISOString().slice(0, 7), lastD = new Date(m0.getFullYear(), m0.getMonth() - 1, 15), lastM = lastD.getFullYear() + "-" + String(lastD.getMonth() + 1).padStart(2, "0");
    var fy = m0.getMonth() >= 3 ? m0.getFullYear() : m0.getFullYear() - 1, fyS = fy + "-04-01", fyE = (fy + 1) + "-03-31";
    var sum = function (fn) { return P.filter(fn).reduce(function (a, x) { return a + (+x.amount || 0); }, 0); };
    h += "<details" + (S.uf.showPay ? " open" : "") + " id='pay-det'><summary><strong>Payments</strong> — this month ₹" + inr(sum(function (x) { return ym(x.paid_on) === thisM; })) + " · last month ₹" + inr(sum(function (x) { return ym(x.paid_on) === lastM; })) + " · this financial year ₹" + inr(sum(function (x) { return x.paid_on >= fyS && x.paid_on <= fyE; })) + " · total ₹" + inr(sum(function () { return true; })) + "</summary>";
    h += "<p class='muted' style='font-size:12px;margin:6px 0'>Add a payment from a user's row (<i>Payments</i> button). Recent payments:</p><div class='tw'><table class='t'><thead><tr><th>Date</th><th>Person</th><th class='num'>Amount ₹</th><th>Months</th><th>Receipt / ref.</th><th>Note</th></tr></thead><tbody>" +
      (P.slice(0, 40).map(function (x) { return "<tr><td>" + esc(fmtD(x.paid_on)) + "</td><td>" + esc(uname(x.user_id)) + "</td><td class='num'>" + inr(x.amount) + "</td><td>" + esc(x.months || "") + "</td><td>" + esc(x.ref || "") + "</td><td>" + esc(x.note || "") + "</td></tr>"; }).join("") || "<tr><td colspan='6' class='empty'>No payments recorded yet.</td></tr>") + "</tbody></table></div></details>";
    // notice
    var nd = S.notice.draft != null ? S.notice.draft : S.notice.text;
    h += "<details" + (S.notice.text ? "" : "") + "><summary><strong>Notice to all users</strong> — " + (S.notice.text ? "showing: “" + esc(S.notice.text.slice(0, 60)) + (S.notice.text.length > 60 ? "…" : "") + "”" : "none") + "</summary><div style='display:flex;flex-direction:column;gap:6px;margin-top:6px'><textarea class='in' id='notice-txt' rows='3' placeholder='e.g. CPWD DSR (E&M) 2022 is now in the rate library. / Server maintenance on Sunday 10 pm.' aria-label='Notice text'>" + esc(nd) + "</textarea><div class='row' style='gap:8px'><button type='button' class='btn pri sm' id='notice-post'>Show to everyone</button><button type='button' class='btn ghost sm' id='notice-clear'>Remove notice</button><span class='muted' style='font-size:12px'>Everyone sees it at the top of the app until they click “OK, hide”.</span></div></div></details>";
    if (U.waAdmin) h += U.waAdmin();
    // activity
    h += "<details id='act-det'" + (S.uf.showAct ? " open" : "") + "><summary><strong>Activity log</strong> — sign-ins, new / deleted / sent estimates, Excel exports</summary><div class='row' style='gap:8px;margin:6px 0;flex-wrap:wrap'><select class='in' id='act-user' aria-label='Person'><option value=''>Everyone</option>" + L.map(function (u) { return "<option value='" + esc(u.id) + "'" + (S.uf.actUser === u.id ? " selected" : "") + ">" + esc(u.full_name || u.email) + "</option>"; }).join("") + "</select><button type='button' class='btn sec sm' id='act-load'>Show latest 300</button></div>" + actTable() + "</details>";
    return h + "</div>";
  };
  function actTable() {
    if (!S.acts.length) return "<div class='muted' style='font-size:13px'>Click “Show latest 300”.</div>";
    var K = { login: "Signed in", est_new: "New estimate", est_del: "Deleted estimate", est_send: "Sent estimate", export: "Excel export", est_copy: "Copied estimate" };
    return "<div class='tw' style='max-height:420px;overflow:auto'><table class='t'><thead><tr><th>When</th><th>Person</th><th>What</th><th>Detail</th></tr></thead><tbody>" + S.acts.map(function (a) { return "<tr><td style='white-space:nowrap'>" + esc(a.at ? new Date(a.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "") + "</td><td>" + esc(uname(a.user_id)) + "</td><td>" + esc(K[a.kind] || a.kind) + "</td><td>" + esc(a.detail || "") + "</td></tr>"; }).join("") + "</tbody></table></div>";
  }
  function uname(id) { var u = (S.est.usersInfo || []).filter(function (x) { return x.id === id; })[0]; return u ? (u.full_name || u.email) : (U.nameOf ? U.nameOf(id) : ""); }

  /* ---------- per-user cells / actions / payment panel ---------- */
  U.phoneCell = function (u) { return "<br><input class='in small' style='width:130px;margin-top:3px' data-uphone='" + esc(u.id) + "' value='" + esc(u.phone || "") + "' placeholder='Mobile / WhatsApp' title='Type the number and press Enter or click outside to save' aria-label='Mobile number of " + esc(u.full_name || u.email) + "'>"; };
  U.userGroupsCell = function (u) {
    var g = (S.grp.members || []).filter(function (m) { return m.user_id === u.id; }).map(function (m) { var t = (S.grp.teams || []).filter(function (x) { return x.id === m.team_id; })[0]; return t ? t.name + (m.role === "admin" ? " (admin)" : "") : ""; }).filter(Boolean);
    return g.length ? "<br><span class='muted' style='font-size:11px'>" + esc(g.join(", ")) + "</span>" : "";
  };
  U.userActions = function (u, me) {
    var h = "<button class='btn ghost sm' data-upay='" + esc(u.id) + "'>Payments" + (u.paid ? " (₹" + inr(u.paid) + ")" : "") + "</button>";
    if (me) return h;
    if (u.device) h += "<button class='btn ghost sm' data-usignout='" + esc(u.id) + "' title='Sign this person out of the computer they are on'>Sign out</button>";
    h += u.blocked ? "<button class='btn sec sm' data-uunblock='" + esc(u.id) + "'>Unblock</button>" : "<button class='btn ghost sm' data-ublock='" + esc(u.id) + "' title='Stop this person from using the app'>Block</button>";
    h += "<button class='btn ghost sm' data-uact='" + esc(u.id) + "'>Activity</button>";
    return h;
  };
  U.userExtraRow = function (u) {
    if (!S.uf.pay[u.id]) return "";
    var mine = (S.pays || []).filter(function (x) { return x.user_id === u.id; }), F = S.uf.payForm[u.id] || { amount: "", paid_on: new Date().toISOString().slice(0, 10), months: "", ref: "", note: "", act: true };
    var h = "<tr><td colspan='9' style='background:var(--raised)'><div style='display:flex;flex-direction:column;gap:8px'><strong>Payments of " + esc(u.full_name || u.email) + "</strong>";
    h += "<div class='row' style='gap:6px;flex-wrap:wrap;align-items:flex-end'><label class='fld'><span class='lbl'>Amount ₹</span><input class='in small n' id='pf-a-" + esc(u.id) + "' value='" + esc(F.amount) + "' style='width:100px'></label><label class='fld'><span class='lbl'>Date</span><input type='date' class='in small' id='pf-d-" + esc(u.id) + "' value='" + esc(F.paid_on) + "'></label><label class='fld'><span class='lbl'>Months</span><select class='in small' id='pf-m-" + esc(u.id) + "'><option value=''>—</option><option value='1'>1</option><option value='3'>3</option><option value='6'>6</option><option value='12'>12</option><option value='0'>Lifetime</option></select></label><label class='fld'><span class='lbl'>Receipt / ref. no.</span><input class='in small' id='pf-r-" + esc(u.id) + "' value='" + esc(F.ref) + "' style='width:130px'></label><label class='fld grow'><span class='lbl'>Note (UPI / cash / cheque …)</span><input class='in small' id='pf-n-" + esc(u.id) + "' value='" + esc(F.note) + "'></label><label class='row' style='gap:4px;font-size:12px'><input type='checkbox' id='pf-x-" + esc(u.id) + "' checked> also activate for these months</label><button type='button' class='btn pri sm' data-payadd='" + esc(u.id) + "'>Add payment</button></div>";
    h += "<div class='tw'><table class='t'><thead><tr><th>Date</th><th class='num'>Amount ₹</th><th>Months</th><th>Receipt / ref.</th><th>Note</th><th></th></tr></thead><tbody>" + (mine.map(function (x) { return "<tr><td>" + esc(fmtD(x.paid_on)) + "</td><td class='num'>" + inr(x.amount) + "</td><td>" + esc(x.months === 0 ? "Lifetime" : x.months || "") + "</td><td>" + esc(x.ref || "") + "</td><td>" + esc(x.note || "") + "</td><td><button type='button' class='btn ghost sm' data-paydel='" + esc(x.id) + "'>Delete</button></td></tr>"; }).join("") || "<tr><td colspan='6' class='empty'>No payments yet.</td></tr>") + "</tbody></table></div></div></td></tr>";
    return h;
  };

  function csv() {
    var L = U.userFilter(S.est.usersInfo || []), rows = [["Name", "Email", "Phone", "Role", "Licence", "Ends", "Estimates", "Joined", "Last active", "Groups", "Paid ₹", "Last payment", "Blocked"]];
    L.forEach(function (u) {
      var g = (S.grp.members || []).filter(function (m) { return m.user_id === u.id; }).map(function (m) { var t = (S.grp.teams || []).filter(function (x) { return x.id === m.team_id; })[0]; return t ? t.name : ""; }).join("; ");
      rows.push([u.full_name || "", u.email || "", u.phone || "", u.role, lic(u), endsAt(u) ? fmtD(endsAt(u)) : (lic(u) === "active" ? "Lifetime" : ""), u.estimates, fmtD(u.created_at), fmtD(u.last_seen), g, u.paid || 0, u.last_paid ? fmtD(u.last_paid) : "", u.blocked ? "Yes" : ""]);
    });
    var t = "﻿" + rows.map(function (r) { return r.map(function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(","); }).join("\r\n");
    var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([t], { type: "text/csv;charset=utf-8" })); a.download = "estimate-pro-users-" + new Date().toISOString().slice(0, 10) + ".csv"; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- group admin view (Users tab for group admins who are not the super admin) ---------- */
  U.groupAdminView = function () {
    var G = S.grp, mine = (G.myTeams || []).filter(function (t) { return t.my_role === "admin"; });
    var h = "<div style='display:flex;flex-direction:column;gap:12px;max-width:1080px'><h1>My group</h1><p class='muted' style='margin:0'>You are the admin of " + mine.map(function (t) { return "<b>" + esc(t.team) + "</b>"; }).join(", ") + ". Add or remove members, open their projects (read-only), see their activity, and set group rates in <i>Basic rates</i> / <i>Rate library</i> with “Rate changes apply to: My group”.</p>";
    mine.forEach(function (t) {
      var mem = (G.mates || []).filter(function (m) { return m.team_id === t.team_id; });
      h += "<div class='panel' style='padding:12px;display:flex;flex-direction:column;gap:8px'><div class='row' style='gap:8px;flex-wrap:wrap;align-items:center'><h3 class='grow' style='margin:0'>" + esc(t.team) + "</h3><input class='in' id='ga-mail-" + esc(t.team_id) + "' placeholder='Email of a signed-up user' style='min-width:240px' aria-label='Email to add'><button type='button' class='btn pri sm' data-gaadd='" + esc(t.team_id) + "'>+ Add member</button></div>";
      h += "<div class='tw'><table class='t'><thead><tr><th>Person</th><th>Email</th><th>Role</th><th class='num'>Estimates</th><th></th></tr></thead><tbody>" + (mem.map(function (m) { return "<tr><td>" + esc(m.full_name || "—") + "</td><td>" + esc(m.email || "") + "</td><td>" + (m.role === "admin" ? "Group admin" : "Member") + (U.levelSelect ? " " + U.levelSelect(t.team_id, m.user_id) : "") + "</td><td class='num'>" + (m.estimates != null ? m.estimates : "") + "</td><td><button class='btn ghost sm' data-openuser='" + esc(m.user_id) + "'>Open projects</button><button class='btn ghost sm' data-uact='" + esc(m.user_id) + "'>Activity</button>" + (m.role === "admin" ? "" : "<button class='btn ghost sm' data-garm='" + esc(t.team_id + "|" + m.user_id) + "'>Remove</button>") + "</td></tr>"; }).join("") || "<tr><td colspan='5' class='empty'>No other members yet.</td></tr>") + "</tbody></table></div></div>";
    });
    h += "<div class='panel' style='padding:12px'><strong>Activity of my members</strong> <button type='button' class='btn sec sm' id='act-load'>Show latest 300</button>" + actTable() + "</div>";
    return h + "</div>";
  };

  /* ---------- events ---------- */
  document.addEventListener("input", function (e) { var t = e.target; if (t.id === "uf-q") { S.uf.q = t.value; U.render(); } else if (t.id === "notice-txt") S.notice.draft = t.value; });
  document.addEventListener("toggle", function (e) { var t = e.target; if (t.id === "pay-det") S.uf.showPay = t.open; if (t.id === "act-det") S.uf.showAct = t.open; }, true);
  document.addEventListener("change", async function (e) {
    var t = e.target, ds = t.dataset || {};
    if (t.id === "uf-f") { S.uf.f = t.value; U.render(); }
    else if (t.id === "act-user") { S.uf.actUser = t.value; loadActs(); }
    else if (ds.uphone != null && ds.uphone) {
      // saves the WhatsApp login number too (admin-users function), so this person can sign in with a WhatsApp OTP
      var raw = t.value.trim(), ph = raw ? U.normPhone(raw, "91") : "", u = (S.est.usersInfo || []).filter(function (x) { return x.id === ds.uphone; })[0];
      if (raw && !ph) { U.toast("Enter a valid mobile number (10 digits, or + and the country code)."); return; }
      var a = U.adminCall ? await U.adminCall({ action: "set_phone", user_id: ds.uphone, phone: ph }) : { error: "Unknown action" };
      if (a.error && /Unknown action/i.test(a.error)) { var r = await db().from("profiles").update({ phone: ph || null }).eq("id", ds.uphone); if (U.fail(r, "Couldn't save the phone number.")) return; if (u) u.phone = ph; U.toast("Phone saved in the list. For WhatsApp login, update the admin-users function in Supabase."); U.render(); return; }
      if (a.error) { U.toast(a.error); return; }
      if (u) u.phone = a.phone; U.toast(ph ? "Mobile saved — they can now log in with a WhatsApp OTP" : "Mobile number removed"); U.render(); }
  });
  document.addEventListener("click", async function (e) {
    var t = e.target.closest && e.target.closest("button"); if (!t) return;
    var ds = t.dataset;
    if (t.id === "notice-ok") { try { localStorage.setItem("ep_notice_seen", S.notice.at); } catch (x) {} U.render(); }
    else if (t.id === "u-csv") csv();
    else if (t.id === "notice-post" || t.id === "notice-clear") { var msg = t.id === "notice-clear" ? "" : ((document.getElementById("notice-txt") || {}).value || "").trim(); var r = await db().rpc("set_notice", { msg: msg }); if (U.fail(r, "Couldn't save the notice.")) return; S.notice.draft = null; U.toast(msg ? "Notice shown to everyone" : "Notice removed"); U.loadNotice(); }
    else if (t.id === "act-load") loadActs();
    else if (ds.uact) { S.uf.actUser = ds.uact; S.uf.showAct = true; await loadActs(); var d = document.getElementById("act-det"); if (d) { d.open = true; d.scrollIntoView({ block: "start" }); } }
    else if (ds.upay) { S.uf.pay[ds.upay] = !S.uf.pay[ds.upay]; if (!S.pays.length) loadPays(); U.render(); }
    else if (ds.payadd) {
      var id = ds.payadd, v = function (k) { var n = document.getElementById("pf-" + k + "-" + id); return n ? (n.type === "checkbox" ? n.checked : n.value) : ""; };
      var amt = EP.ev(String(v("a")).replace(/,/g, "")); if (amt == null || amt <= 0) { U.toast("Enter the amount"); return; }
      var mo = v("m"), row = { user_id: id, amount: amt, paid_on: v("d") || new Date().toISOString().slice(0, 10), months: mo === "" ? null : +mo, ref: v("r"), note: v("n") };
      var r2 = await db().from("payments").insert(row); if (U.fail(r2, "Couldn't save the payment.")) return;
      U.toast("Payment of ₹" + inr(amt) + " saved");
      if (v("x") && mo !== "") { var u2 = (S.est.usersInfo || []).filter(function (x) { return x.id === id; })[0], body;
        if (+mo === 0) body = { activated: true, activated_until: null, activated_note: "Lifetime, paid ₹" + inr(amt) + " on " + fmtD(row.paid_on) };
        else { var base = u2 && u2.activated && u2.activated_until && Date.parse(u2.activated_until) > now() ? new Date(u2.activated_until) : new Date(); base.setMonth(base.getMonth() + (+mo)); body = { activated: true, activated_until: base.toISOString(), activated_note: "Paid ₹" + inr(amt) + " on " + fmtD(row.paid_on) + " for " + mo + " month" + (+mo > 1 ? "s" : "") }; }
        var r3 = await db().from("profiles").update(body).eq("id", id); if (!U.fail(r3, "Payment saved, but the licence could not be changed.")) U.toast("Payment saved and licence extended"); }
      await loadPays(); if (U.loadUsers) U.loadUsers();
    }
    else if (ds.paydel) { if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again"; return; } var r4 = await db().from("payments").delete().eq("id", ds.paydel); if (U.fail(r4, "Couldn't delete.")) return; loadPays(); if (U.loadUsers) U.loadUsers(); }
    else if (ds.ucopy) { var u3 = (S.est.usersInfo || []).filter(function (x) { return x.id === ds.ucopy; })[0]; try { await navigator.clipboard.writeText(remindText(u3)); U.toast("Message copied"); } catch (x) { prompt("Copy this message", remindText(u3)); } }
    else if (ds.usignout) { var r5 = await db().rpc("admin_signout", { uid: ds.usignout }); if (U.fail(r5, "Couldn't sign out.")) return; U.toast("Signed out — they must sign in again"); if (U.loadUsers) U.loadUsers(); }
    else if (ds.ublock || ds.uunblock) {
      var bid = ds.ublock || ds.uunblock, blk = !!ds.ublock;
      if (blk && t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again to block"; return; }
      var r6 = await db().from("profiles").update({ blocked: blk, blocked_note: blk ? "Blocked on " + new Date().toLocaleDateString("en-IN") : null }).eq("id", bid); if (U.fail(r6, "Couldn't change.")) return;
      if (blk) await db().rpc("admin_signout", { uid: bid });
      U.toast(blk ? "Blocked — signed out and cannot use the app" : "Unblocked"); if (U.loadUsers) U.loadUsers();
    }
    else if (ds.gaadd) { var mail = ((document.getElementById("ga-mail-" + ds.gaadd) || {}).value || "").trim(); if (!mail) { U.toast("Type the email"); return; } var r7 = await db().rpc("group_add_member", { t: ds.gaadd, mail: mail }); if (U.fail(r7, "Couldn't add.")) return; U.toast("Added " + (r7.data || mail)); if (U.loadGroups) U.loadGroups(); }
    else if (ds.garm) { if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again"; return; } var p = ds.garm.split("|"); var r8 = await db().from("team_members").delete().eq("team_id", p[0]).eq("user_id", p[1]); if (U.fail(r8, "Couldn't remove.")) return; U.toast("Removed from the group"); if (U.loadGroups) U.loadGroups(); }
  });
})();
