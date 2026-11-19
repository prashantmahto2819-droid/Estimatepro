/* Estimate Pro — UI core: state, helpers, auth (email + Google, one active session), navigation, users */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S;
  Object.assign(S, {
    tab: "estimates", me: { id: null, name: "", email: "", role: "user", isOwner: false, canEdit: false, defaults: null }, names: {},
    auth: { mode: "in", busy: false, msg: "", err: "", method: "pw", step: 0, code: "" },
    authOpts: { google: false, emailOtp: true, whatsapp: false },
    lib: { book: "cpwd", q: "", ch: "", edited: false, sel: null, draft: null },
    basic: { kind: "L", q: "" },
    est: { owner: null, list: [], mine: [], selId: null, cur: null, users: [], usersInfo: [], sub: "items", part: null, open: {}, addQ: "" },
    sor: { step: 0 }, loaded: false
  });
  var U = EP.ui = {};
  var db = null, rt = null, sessTimer = null;
  U.db = function () { return db; };
  var $ = U.$ = function (s) { return document.querySelector(s); };
  U.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  U.inr = function (n, d) { if (n == null || isNaN(n)) return "—"; d = d == null ? 2 : d; var neg = n < 0; n = Math.abs(n); var p = n.toFixed(d).split("."); var x = p[0], l3 = x.slice(-3), rest = x.slice(0, -3); if (rest) l3 = "," + l3; rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ","); return (neg ? "−" : "") + rest + l3 + (d ? "." + p[1] : ""); };
  U.qfmt = function (n) { if (n == null || isNaN(n)) return "—"; return (+n.toFixed(3)).toLocaleString("en-IN", { maximumFractionDigits: 3 }); };
  U.num = function (v) { var x = parseFloat(String(v).replace(/,/g, "")); return isNaN(x) ? null : x; };
  U.when = function (t) { if (!t) return ""; return new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };
  U.toast = function (m) { var t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(U.toast._t); U.toast._t = setTimeout(function () { t.hidden = true; }, 2800); };
  U.fail = function (r, msg) { if (r && r.error) { console.error(r.error); if (U.off && U.off.isNet(r.error)) { U.toast("No network — this needs an internet connection. Your measurements are kept on this device."); return true; } if (/row-level security|permission|JWT|session/i.test(r.error.message || "")) { checkSession(); if (U.locked()) msg = "Your trial has ended. Contact sales to activate: " + S.sales.email + " · " + S.sales.phone; } U.toast(msg || r.error.message); return true; } return false; };
  /* ---------- licence (7-day trial, super admin activates) ---------- */
  S.sales = { email: "presidentsri@live.com", phone: "7400501000" };
  S.lic = null;
  U.locked = function () { return !!(S.lic && S.lic.status === "expired"); };
  U.daysLeft = function (t) { return Math.max(0, Math.ceil((Date.parse(t) - Date.now()) / 864e5)); };
  function contactHtml() { var e = U.esc(S.sales.email), p = U.esc(S.sales.phone); return '<a href="mailto:' + e + '?subject=' + encodeURIComponent("Activate Estimate Pro") + '">' + e + '</a> · <a href="tel:+91' + p.replace(/\D/g, "") + '">' + p + "</a>"; }
  async function loadLicence() {
    var r = await db.rpc("licence_info");
    if (r.error) { console.error(r.error); try { var c = JSON.parse(localStorage.getItem("ep_lic_" + S.me.id) || "null"); if (c && !S.lic) { S.lic = c; U.render(); } } catch (e) {} return; }
    try { localStorage.setItem("ep_lic_" + S.me.id, JSON.stringify(Array.isArray(r.data) ? r.data[0] : r.data)); } catch (e) {}
    var x = Array.isArray(r.data) ? r.data[0] : r.data; if (!x) return;
    S.lic = x; if (x.sales_email) S.sales.email = x.sales_email; if (x.sales_phone) S.sales.phone = x.sales_phone;
    if (x.status === "expired" && !S.lic._shown) { S.lic._shown = 1; }
    U.render();
  }
  function licBanner() {
    var L = S.lic; if (!L || L.status === "admin" || L.status === "active" && !L.activated_until) return "";
    if (L.status === "trial") { var d = U.daysLeft(L.trial_ends); return '<div class="lic lic-trial" role="status"><strong>Free trial: ' + d + (d === 1 ? " day" : " days") + ' left.</strong> To keep using Estimate Pro after the trial, contact sales to activate: ' + contactHtml() + "</div>"; }
    if (L.status === "active") { var a = U.daysLeft(L.activated_until); return a > 15 ? "" : '<div class="lic lic-trial" role="status"><strong>Your activation ends in ' + a + (a === 1 ? " day" : " days") + ".</strong> To renew, contact sales: " + contactHtml() + "</div>"; }
    return '<div class="lic lic-exp" role="alert"><strong>Your 7-day trial has ended.</strong> You can still open and export your estimates, but you can\'t create or change anything until the super admin activates your account. Contact sales to activate: ' + contactHtml() + '<button type="button" class="btn ghost sm" id="lic-recheck">I\'ve been activated: check again</button></div>';
  }
  U.nameOf = function (id) { return (S.names[id] && S.names[id].name) || (id === S.me.id ? (S.me.name || "you") : "Someone"); };
  U.resolveNames = async function (ids) {
    if (!db || !S.me.id) return; ids = ids.filter(function (i, n) { return i && !S.names[i] && ids.indexOf(i) === n; }); if (!ids.length) return;
    ids.forEach(function (i) { S.names[i] = { name: "" }; });
    var r = await db.rpc("profile_names", { ids: ids }); if (!r.error && r.data) { r.data.forEach(function (p) { S.names[p.id] = { name: p.full_name }; }); U.render(); }
  };

  /* ---------- render ---------- */
  var rq = 0, views = U.views = {};
  U.render = function () { if (rq) return; rq = requestAnimationFrame(function () { rq = 0; doRender(); }); };
  function doRender() {
    document.querySelectorAll("nav.tabs button").forEach(function (b) { if (b.dataset.tab === S.tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    $("#tab-users").hidden = !(S.me.isOwner || S.me.groupAdmin); $("#tab-users").classList.toggle("due", !!(S.me.isOwner && U.pendingApprovals && U.pendingApprovals() > 0)); var trv = $("#tab-reviews"); if (trv) { var nrv = U.reviewsWaiting ? U.reviewsWaiting() : 0; trv.classList.toggle("due", nrv > 0); trv.textContent = "Reviews" + (nrv ? " (" + nrv + ")" : ""); } var tph = $("#tab-photos"); if (tph) tph.classList.toggle("due", !!(U.camExpiring && U.camExpiring() > 0)); var tb = $("#tab-backup"); if (tb) tb.classList.toggle("due", !!(U.backupDue && U.backupDue())); $("nav.tabs").hidden = !S.me.id;
    renderWho();
    var v = $("#view"), ae = document.activeElement, aid = ae && ae.id, sel = null;
    try { sel = ae && ae.selectionStart; } catch (e) {}
    if (!db) { v.innerHTML = viewNoConfig(); return; }
    if (!S.me.id || S.auth.mode === "newpw") { v.innerHTML = viewAuth(); restore(aid, sel); return; }
    if (!S.loaded) { v.innerHTML = '<div class="empty">Loading rate books: CPWD DSR 2021 (Vol. 1 & 2), MPPWD SOR 2017, DSR Horticulture 2018…</div>'; return; }
    document.body.classList.toggle("cadfull", S.tab === "cad" && !!(S.cad && S.cad.cur));
    var fn = views[S.tab] || views.estimates; if (S.tab === "users" && !S.me.isOwner && !S.me.groupAdmin) fn = views.estimates;
    var sy = window.scrollY;
    v.innerHTML = (U.statusBar ? U.statusBar() : "") + (U.noticeBanner ? U.noticeBanner() : "") + (U.waBanner ? U.waBanner() : "") + licBanner() + (U.phonePrompt ? U.phonePrompt() : "") + fn();
    restore(aid, sel); if (window.scrollY !== sy) window.scrollTo(0, sy);
    if (U.after) U.after();
  }
  function restore(aid, sel) { if (!aid) return; var n = document.getElementById(aid); if (!n) return; n.focus({ preventScroll: true }); try { if (sel != null && n.setSelectionRange) n.setSelectionRange(sel, sel); } catch (e) {} }
  function renderWho() {
    var m = S.me, w = $("#who");
    if (!m.id) { w.innerHTML = ""; return; }
    var role = m.isOwner ? '<span class="role sa">Super admin</span>' : (m.canEdit ? '<span class="role">Editor</span>' : '<span class="role">User</span>');
    var nm = m.name || m.email || "You", ini = nm.split(/[\s@.]+/).filter(Boolean).map(function (x) { return x[0]; }).join("").slice(0, 2).toUpperCase();
    var dp = EP.dept ? EP.dept() : null, dsel = dp ? '<select class="in dept-sel" id="dept-sel" aria-label="Department" title="Department">' + EP.DEPTS.map(function (d) { return '<option value="' + d.id + '"' + (d.id === dp.id ? " selected" : "") + ">" + U.esc(d.short) + (d.status !== "active" ? " · " + d.status : "") + "</option>"; }).join("") + "</select>" : "";
    w.innerHTML = (U.camButton ? U.camButton() : "") + (U.installButton ? U.installButton() : "") + dsel + '<span class="av" aria-hidden="true">' + U.esc(ini) + '</span><span class="who-name">' + U.esc(nm) + "</span>" + role + '<button type="button" class="btn ghost sm" id="sign-out">Sign out</button>';
  }
  document.addEventListener("change", function (e) { if (e.target.id === "dept-sel") { EP.setDept(e.target.value); var d = EP.dept(); U.toast("Department: " + d.name + (d.status !== "active" ? " — " + d.status : "")); U.render(); } });
  U.setTab = function (t) { S.tab = t; try { history.replaceState(null, "", "#" + t); } catch (e) {} U.render(); window.scrollTo(0, 0); };

  /* ---------- sign-in ---------- */
  function viewNoConfig() { return '<div class="panel auth"><h1>Connect Supabase</h1><p class="muted">Open <code>config.js</code> and paste your Supabase project URL and anon (public) key, then reload. Both are in Supabase → Project Settings → API.</p></div>'; }
  var G_ICON = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
  /* ---------- sign-in: one window — OTP (WhatsApp / email) first, password second ---------- */
  var CC = [["91", "India +91"], ["977", "Nepal +977"], ["880", "Bangladesh +880"], ["94", "Sri Lanka +94"], ["975", "Bhutan +975"], ["971", "UAE +971"], ["966", "Saudi Arabia +966"], ["974", "Qatar +974"], ["968", "Oman +968"], ["965", "Kuwait +965"], ["973", "Bahrain +973"], ["65", "Singapore +65"], ["60", "Malaysia +60"], ["1", "USA / Canada +1"], ["44", "UK +44"], ["61", "Australia +61"], ["49", "Germany +49"]];
  function ccSel(id, cur) { return '<select class="in" id="' + id + '" aria-label="Country code" style="max-width:150px">' + CC.map(function (c) { return '<option value="' + c[0] + '"' + (c[0] === (cur || "91") ? " selected" : "") + ">" + c[1] + "</option>"; }).join("") + "</select>"; }
  U.ccSel = ccSel;
  /* phone → +E.164; country code from the list (default India) unless the number already starts with + */
  function normPhone(raw, cc) {
    var t = String(raw || "").trim(); if (!t) return "";
    var d = t.replace(/\D/g, ""); cc = String(cc || "91");
    if (/^\+/.test(t) || /^00/.test(t)) { d = d.replace(/^00/, ""); return d.length >= 8 && d.length <= 15 ? "+" + d : ""; }
    d = d.replace(/^0+/, "");
    if (d.indexOf(cc) === 0 && d.length >= cc.length + 8) return d.length <= 15 ? "+" + d : "";
    if (cc === "91" && !/^[6-9]\d{9}$/.test(d)) return "";
    var full = cc + d; return full.length >= 8 && full.length <= 15 ? "+" + full : "";
  }
  U.normPhone = normPhone;
  function isEmail(x) { return /^\S+@\S+\.\S+$/.test(String(x || "").trim()); }
  function viewAuth() {
    var A = S.auth, m = A.mode, O = S.authOpts || {}, otpOn = !!(O.whatsapp || O.emailOtp);
    var lm = m === "in" ? (A.lm === "pw" || !otpOn ? "pw" : "otp") : null, codeStep = A.step === 1 && (lm === "otp" || m === "up");
    var title = { "in": "Sign in", up: "Create your account", reset: "Reset password", newpw: "Set a new password" }[m];
    var h = '<form class="panel auth" id="auth-form" novalidate><img class="auth-logo" src="logo.png" alt=""><h1>' + title + "</h1>";
    if (m === "in") h += '<p class="muted">Estimates on CPWD DSR 2021 / DSOR 2023, MPPWD SOR 2017 / 2025, DSR Horticulture 2018 and your own SORs.</p>';
    if ((m === "in" || m === "up") && O.google && !codeStep) h += '<button type="button" class="btn sec google" id="google">' + G_ICON + "<span>Continue with Google</span></button><div class=\"or\"><span>or</span></div>";
    var idLbl = O.whatsapp && O.emailOtp ? "Mobile (WhatsApp) number or email" : O.whatsapp ? "Mobile (WhatsApp) number" : "Email";
    function idField(lbl, ro) {
      return '<label class="fld"><span class="lbl">' + lbl + '</span><span class="row" style="gap:6px;flex-wrap:nowrap">' + (O.whatsapp ? ccSel("au-cc", A.cc) : "") +
        '<input class="in grow" id="au-id" autocomplete="username" inputmode="' + (O.whatsapp && !O.emailOtp ? "tel" : "text") + '" placeholder="' + (O.whatsapp ? "98765 43210" + (O.emailOtp ? " or name@mail.com" : "") : "name@mail.com") + '" value="' + U.esc(A.ident || "") + '"' + (ro ? " readonly" : "") + " required></span></label>";
    }
    if (m === "in") {
      if (otpOn) h += '<div class="seg" role="group" aria-label="How to sign in"><button type="button" data-lm="otp" aria-pressed="' + (lm === "otp") + '">Login with OTP</button><button type="button" data-lm="pw" aria-pressed="' + (lm === "pw") + '">Email / password</button></div>';
      if (lm === "otp") {
        h += idField(idLbl, codeStep);
        if (codeStep) h += '<label class="fld"><span class="lbl">OTP received ' + (A.via === "wa" ? "on WhatsApp" : "by email") + '</span><input class="in" id="au-code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="6-digit code" required></label><div class="row" style="justify-content:space-between"><button type="button" class="btn ghost sm" id="au-other">Change number / email</button><button type="button" class="btn ghost sm" id="au-again">Send OTP again</button></div>';
      } else {
        h += '<label class="fld"><span class="lbl">' + (O.whatsapp ? "Email or mobile number" : "Email") + '</span><span class="row" style="gap:6px;flex-wrap:nowrap">' + (O.whatsapp ? ccSel("au-cc", A.cc) : "") + '<input class="in grow" id="au-id" autocomplete="username" value="' + U.esc(A.ident || A.email || "") + '" required></span></label>';
        h += '<label class="fld"><span class="lbl">Password</span><input class="in" id="au-pass" type="password" minlength="8" autocomplete="current-password" required></label>';
      }
    } else if (m === "up") {
      var R = A.reg || {};
      h += '<label class="fld"><span class="lbl">Full name</span><input class="in" id="au-name" autocomplete="name" value="' + U.esc(R.name || A.name || "") + '"' + (codeStep ? " readonly" : "") + ' required></label>';
      h += '<label class="fld"><span class="lbl">Email</span><input class="in" id="au-email" type="email" autocomplete="email" value="' + U.esc(R.email || A.email || "") + '"' + (codeStep ? " readonly" : "") + ' required></label>';
      if (O.whatsapp) h += '<label class="fld"><span class="lbl">Mobile (WhatsApp) number</span><span class="row" style="gap:6px;flex-wrap:nowrap">' + ccSel("au-cc", A.cc) + '<input class="in grow" id="au-mob" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="98765 43210" value="' + U.esc(R.mob || "") + '"' + (codeStep ? " readonly" : "") + "></span></label>";
      if (!codeStep) h += '<label class="fld"><span class="lbl">Password</span><input class="in" id="au-pass" type="password" minlength="8" autocomplete="new-password" required></label><span class="muted" style="font-size:12px;margin-top:-6px">At least 8 characters — you can also log in with OTP later.</span>' + (A.waFail ? '<button type="button" class="btn ghost sm" id="au-regemail">No WhatsApp? Confirm by email instead</button>' : "");
      if (codeStep) h += '<label class="fld"><span class="lbl">OTP received on WhatsApp</span><input class="in" id="au-code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="6-digit code" required></label><div class="row" style="justify-content:space-between"><button type="button" class="btn ghost sm" id="au-other">Change details</button><button type="button" class="btn ghost sm" id="au-regemail">No WhatsApp? Confirm by email instead</button></div>';
    } else {
      if (m === "reset") h += '<label class="fld"><span class="lbl">Email</span><input class="in" id="au-email" type="email" autocomplete="email" value="' + U.esc(A.email || "") + '" required></label>';
      if (m === "newpw") h += '<label class="fld"><span class="lbl">New password</span><input class="in" id="au-pass" type="password" minlength="8" autocomplete="new-password" required></label><span class="muted" style="font-size:12px;margin-top:-6px">At least 8 characters.</span>';
    }
    if (A.err) h += '<div class="badge dan" role="alert" style="white-space:normal">' + U.esc(A.err) + "</div>";
    if (A.unconfirmed && m === "in") h += '<button type="button" class="btn ghost sm" id="au-resend">Send the confirmation email again</button>' + (O.emailOtp ? '<button type="button" class="btn ghost sm" data-lm="otp">Or log in with an email OTP instead</button>' : "");
    if (A.msg) h += '<div class="badge info" role="status" style="white-space:normal">' + U.esc(A.msg) + "</div>";
    var lbl = m === "in" ? (lm === "otp" ? (codeStep ? "Verify OTP and sign in" : "Get OTP") : "Sign in") : m === "up" ? (codeStep ? "Verify OTP and create account" : "Create account") : m === "reset" ? "Send reset link" : "Save password";
    h += '<button class="btn pri" type="submit"' + (A.busy ? " disabled" : "") + ">" + (A.busy ? "Please wait…" : lbl) + "</button>";
    if (m === "in") h += '<div class="row" style="justify-content:space-between"><button type="button" class="btn ghost sm" data-auth="reset">Forgot password?</button><button type="button" class="btn ghost sm" data-auth="up">Create an account</button></div>';
    else if (m !== "newpw") h += '<button type="button" class="btn ghost sm" data-auth="in">Back to sign in</button>';
    h += '<p class="muted" style="font-size:12px;margin:0">One device at a time: signing in here signs you out on any other computer.</p>';
    if (m === "up") h += '<p class="muted" style="font-size:12px;margin:0">By creating an account you agree to the <a href="terms.html" target="_blank" rel="noopener">Terms of Service</a> and <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>.</p>';
    if (m === "in" || m === "up") h += '<p class="muted" style="font-size:12px;margin:0">New accounts get a free 7-day trial. To activate, contact sales: ' + contactHtml() + "</p>";
    h += '<p class="muted" style="font-size:12px;margin:0;text-align:center">Estimate Pro by Vividbrandify · Developed by Prashant Mahto (<a href="mailto:prashantmahto2819@gmail.com">prashantmahto2819@gmail.com</a>) · <a href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a> · <a href="terms.html" target="_blank" rel="noopener">Terms of Service</a></p>';
    return h + "</form>";
  }
  function flagClaim() { try { localStorage.setItem("ep_claim", "1"); } catch (e) {} }
  function unflag() { try { if (!S.me.id) localStorage.removeItem("ep_claim"); } catch (e) {} }
  function val(id) { var n = document.getElementById(id); return n ? n.value.trim() : ""; }
  async function submitAuth() {
    var A = S.auth; if (A.busy) return;
    var ccn = document.getElementById("au-cc"); if (ccn) A.cc = ccn.value;
    A.err = ""; A.msg = "";
    try {
      if (A.mode === "in" && A.lm !== "pw" && (S.authOpts.whatsapp || S.authOpts.emailOtp)) return await loginOtp();
      if (A.mode === "up") return await register();
      return await classic();
    } catch (ex) { A.busy = false; unflag(); A.err = otpMsg(ex, A.via === "wa"); U.render(); }
  }
  /* password login (email or mobile), reset link, new password */
  async function classic() {
    var A = S.auth, back = location.origin + location.pathname, r, pn = document.getElementById("au-pass"), pass = pn ? pn.value : "";
    if (A.mode === "in") {
      var id = val("au-id"); A.ident = id;
      var cred = isEmail(id) ? { email: id } : (S.authOpts.whatsapp && normPhone(id, A.cc) ? { phone: normPhone(id, A.cc) } : null);
      if (!cred) { A.err = S.authOpts.whatsapp ? "Enter your email, or your mobile number." : "Enter a valid email address."; U.render(); return; }
      cred.password = pass; A.email = cred.email || "";
      A.busy = true; U.render(); flagClaim(); r = await db.auth.signInWithPassword(cred);
    } else if (A.mode === "reset") {
      var em = val("au-email"); A.email = em; if (!isEmail(em)) { A.err = "Enter a valid email address."; U.render(); return; }
      A.busy = true; U.render(); r = await db.auth.resetPasswordForEmail(em, { redirectTo: back });
    } else {
      if (pass.length < 8) { A.err = "Use at least 8 characters for the password."; U.render(); return; }
      A.busy = true; U.render(); r = await db.auth.updateUser({ password: pass });
    }
    A.busy = false;
    if (r.error) { unflag(); A.err = authMsg(r.error); A.unconfirmed = /not confirmed/i.test(r.error.message || "") && A.email ? A.email : ""; U.render(); return; }
    A.unconfirmed = "";
    if (A.mode === "reset") A.msg = "If that email has an account, a reset link is on its way.";
    else if (A.mode === "newpw") { A.mode = "in"; U.toast("Password updated"); }
    U.render();
  }
  /* OTP login: a mobile number gets the code on WhatsApp, an email address by email */
  async function loginOtp() {
    var A = S.auth, O = S.authOpts, back = location.origin + location.pathname, r;
    if (A.step !== 1) {
      var id = val("au-id"); A.ident = id;
      if (isEmail(id)) { if (!O.emailOtp) { A.err = "Enter your mobile number (OTP by email is switched off)."; U.render(); return; } A.via = "email"; A.email = id; }
      else { var ph = O.whatsapp ? normPhone(id, A.cc) : ""; if (!ph) { A.err = O.whatsapp ? "Enter a valid mobile number (choose the country if it is not India) or your email." : "Enter a valid email address."; U.render(); return; } A.via = "wa"; A.phone = ph; }
      A.busy = true; U.render(); flagClaim();
      r = A.via === "wa" ? await db.auth.signInWithOtp({ phone: A.phone, options: { shouldCreateUser: false } }) : await db.auth.signInWithOtp({ email: A.email, options: { shouldCreateUser: false, emailRedirectTo: back } });
      A.busy = false;
      if (r.error) { unflag(); A.err = otpMsg(r.error, A.via === "wa"); U.render(); return; }
      A.step = 1; A.msg = A.via === "wa" ? "OTP sent on WhatsApp to " + A.phone + ". It is valid for a few minutes." : "OTP sent to " + A.email + " (check Spam too). If the email only has a link, click the link instead.";
      U.render(); setTimeout(function () { var n = document.getElementById("au-code"); if (n) n.focus(); }, 50); return;
    }
    var code = val("au-code").replace(/\s/g, ""); if (!/^\d{4,8}$/.test(code)) { A.err = "Enter the numeric OTP you received."; U.render(); return; }
    A.busy = true; U.render();
    if (A.via === "wa") r = await db.auth.verifyOtp({ phone: A.phone, token: code, type: "sms" });
    else { r = await db.auth.verifyOtp({ email: A.email, token: code, type: "email" }); if (r.error) { var r2 = await db.auth.verifyOtp({ email: A.email, token: code, type: "signup" }); if (!r2.error) r = r2; } }
    A.busy = false;
    if (r.error) { unflag(); A.err = /expired|invalid/i.test(r.error.message || "") ? "That OTP is wrong or has expired. Click “Send OTP again”." : otpMsg(r.error, A.via === "wa"); U.render(); return; }
    A.step = 0; A.msg = ""; A.err = ""; U.render();
  }
  /* registration: name + email + mobile + password. With WhatsApp on, the mobile is confirmed by OTP first,
     then the email and password are added to the same account (Supabase e-mails a link to confirm the email). */
  async function register(viaEmail) {
    var A = S.auth, O = S.authOpts, back = location.origin + location.pathname, r, R = A.reg || {};
    if (A.step !== 1 || viaEmail) {
      if (!viaEmail) {
        R = { name: val("au-name"), email: val("au-email"), mob: val("au-mob") }; var pn = document.getElementById("au-pass"); R.pass = pn ? pn.value : ""; A.reg = R;
        if (!R.name) { A.err = "Enter your full name."; U.render(); return; }
        if (!isEmail(R.email)) { A.err = "Enter a valid email address."; U.render(); return; }
        if (R.pass.length < 8) { A.err = "Use at least 8 characters for the password."; U.render(); return; }
        R.phone = R.mob ? normPhone(R.mob, A.cc) : "";
        if (R.mob && !R.phone) { A.err = "Enter a valid mobile number (choose the country if it is not India)."; U.render(); return; }
        if (O.whatsapp && !R.phone) { A.err = "Enter your mobile (WhatsApp) number — the OTP comes on WhatsApp."; U.render(); return; }
      }
      A.busy = true; U.render(); flagClaim();
      if (O.whatsapp && R.phone && !viewEmailOnly(viaEmail)) {
        r = await db.auth.signInWithOtp({ phone: R.phone, options: { shouldCreateUser: true, data: { full_name: R.name, email_wanted: R.email } } });
        A.busy = false;
        if (r.error) { unflag(); A.err = otpMsg(r.error, true) + " You can also click “No WhatsApp? Confirm by email instead”."; A.waFail = true; U.render(); return; }
        A.waFail = false;
        A.step = 1; A.via = "wa"; A.msg = "OTP sent on WhatsApp to " + R.phone + ". Enter it below to create your account."; U.render(); setTimeout(function () { var n = document.getElementById("au-code"); if (n) n.focus(); }, 50); return;
      }
      r = await db.auth.signUp({ email: R.email, password: R.pass, options: { data: { full_name: R.name, phone_wanted: R.phone || "" }, emailRedirectTo: back } });
      A.busy = false;
      if (r.error) { unflag(); A.err = authMsg(r.error); U.render(); return; }
      if (!(r.data && r.data.session)) { A.mode = "in"; A.lm = O.emailOtp ? "otp" : "pw"; A.ident = R.email; A.step = 0; A.msg = "Account created. Open the email we sent to " + R.email + " and click the link" + (O.emailOtp ? " — or type your email here and click “Get OTP”" : "") + ". Then add your WhatsApp number after you sign in."; }
      U.render(); return;
    }
    var code = val("au-code").replace(/\s/g, ""); if (!/^\d{4,8}$/.test(code)) { A.err = "Enter the numeric OTP you received on WhatsApp."; U.render(); return; }
    A.busy = true; U.render();
    r = await db.auth.verifyOtp({ phone: R.phone, token: code, type: "sms" });
    if (r.error) { A.busy = false; unflag(); A.err = /expired|invalid/i.test(r.error.message || "") ? "That OTP is wrong or has expired. Click “Change details” and try again." : otpMsg(r.error, true); U.render(); return; }
    var u = r.data && r.data.user, fresh = u && !u.email;
    if (fresh) {
      var up = await db.auth.updateUser({ email: R.email, password: R.pass, data: { full_name: R.name } }, { emailRedirectTo: back });
      if (u.id) await db.from("profiles").update({ full_name: R.name }).eq("id", u.id);
      U.toast(up.error ? (/already/i.test(up.error.message || "") ? "This email already belongs to another account — your account was made with the mobile number only." : "Account created. The email could not be added: " + up.error.message) : "Account created. We also sent a link to " + R.email + " to confirm your email.");
    } else U.toast("This mobile number already has an account — you are now signed in to it.");
    A.busy = false; A.step = 0; A.reg = null; A.msg = ""; A.err = ""; U.render();
  }
  function viewEmailOnly(viaEmail) { return !!viaEmail; }
  function otpMsg(e, wa) {
    var m = String(e && e.message || e || "");
    if (/signups? not allowed|user not found|not found/i.test(m)) return wa ? "This mobile number isn't linked to any account yet. Log in with your email and password once — the app will then ask you to add this WhatsApp number — or create a new account." : "No account with this email. Create an account first.";
    if (/provider|phone.*(disabled|not enabled)|unsupported phone|sms/i.test(m) && wa) return "WhatsApp sign-in isn't set up on the server yet. Use your password or an email code, or ask the admin.";
    if (/rate limit|too many|security purposes|after \d+ seconds/i.test(m)) return "Please wait a minute before asking for another code.";
    return authMsg(e);
  }
  function authMsg(e) {
    var m = String(e && e.message || e || "");
    if (m === "Invalid login credentials") return "Wrong email or password.";
    if (/not confirmed/i.test(m)) return "Your email isn't confirmed yet. Open the confirmation email (check Spam / Promotions too) and click the link, then sign in. No email? Click “Send the confirmation email again”.";
    if (/sending (confirmation|recovery|magic)|smtp|mail/i.test(m)) return "The confirmation email couldn't be sent right now. Please try again after some time, or contact sales: " + S.sales.email + " · " + S.sales.phone + " (the admin can also create your account directly).";
    if (/rate limit|too many|security purposes/i.test(m)) return "Too many emails were requested. Wait a few minutes and try again (check Spam for the earlier email).";
    if (/already registered|already exists/i.test(m)) return "An account with this email already exists. Sign in, or use “Forgot password?”.";
    return m;
  }
  async function resendConfirm() {
    var A = S.auth, em = A.unconfirmed; if (!em || A.busy) return;
    A.busy = true; A.err = ""; U.render();
    var r = await db.auth.resend({ type: "signup", email: em, options: { emailRedirectTo: location.origin + location.pathname } });
    A.busy = false;
    if (r.error) A.err = authMsg(r.error); else { A.msg = "Confirmation email sent again to " + em + ". Check Inbox, Spam and Promotions."; A.unconfirmed = ""; }
    U.render();
  }
  async function google() {
    flagClaim();
    var r = await db.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
    if (r.error) { S.auth.err = /provider is not enabled/i.test(r.error.message) ? "Google sign-in isn't switched on yet. The admin enables it in Supabase → Authentication → Providers → Google." : r.error.message; U.render(); }
  }

  /* ---------- one active session per user ---------- */
  async function claimOrCheck() {
    var want = false; try { want = localStorage.getItem("ep_claim") === "1"; } catch (e) {}
    var st = await db.rpc("session_status");
    var status = st.data || "none";
    if (want || status === "none") {
      var c = await db.rpc("claim_session", { device: navigator.userAgent.slice(0, 180) });
      try { localStorage.removeItem("ep_claim"); } catch (e) {}
      if (c.error) { console.error(c.error); return true; }
      db.auth.signOut({ scope: "others" }).catch(function () {});
      return true;
    }
    if (status === "replaced") { await kicked(); return false; }
    if (status === "blocked") { await kicked(true); return false; }
    return true;
  }
  async function checkSession() {
    if (!db || !S.me.id) return;
    var st = await db.rpc("session_status"); if (st.error) return;
    if (st.data === "replaced") kicked(); else if (st.data === "blocked") kicked(true);
  }
  async function kicked(blocked) {
    clearInterval(sessTimer);
    await db.auth.signOut({ scope: "local" });
    S.auth.mode = "in"; S.auth.err = blocked ? "Your account has been blocked by the administrator. Contact " + (S.lic && S.lic.sales_phone ? S.lic.sales_phone : "the administrator") + " to restore access." : ""; S.auth.msg = blocked ? "" : "You were signed out because your account signed in on another computer, or the administrator signed you out. Sign in again to continue here (that will sign out the other computer).";
    U.render();
  }

  var licTimer = 0;
  async function loadMe(session) {
    var u = session && session.user;
    if (!u) { S.me = { id: null, name: "", email: "", role: "user", isOwner: false, canEdit: false }; S.ovr = {}; S.ovrShared = {}; S.ovrMine = {}; S.lic = null; S.nsLib = []; EP.bump(); S.est = { owner: null, list: [], mine: [], selId: null, cur: null, users: [], usersInfo: [], sub: "items", part: null, open: {}, addQ: "" }; if (rt) { db.removeChannel(rt); rt = null; } clearInterval(sessTimer); clearInterval(licTimer); U.render(); return; }
    if (S.me.id === u.id) return;
    var ok = await claimOrCheck(); if (!ok) return;
    var r = await db.from("profiles").select("id,email,full_name,role,defaults").eq("id", u.id).maybeSingle();
    if (r.data) { try { localStorage.setItem("ep_prof_" + u.id, JSON.stringify(r.data)); } catch (e) {} }
    else if (r.error) { try { r = { data: JSON.parse(localStorage.getItem("ep_prof_" + u.id) || "null") }; } catch (e) {} }
    var p = r.data || { full_name: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || "", role: "user", email: u.email };
    S.me = { id: u.id, name: p.full_name || (u.user_metadata && u.user_metadata.full_name) || (u.phone ? "+" + String(u.phone).replace(/^\+/, "") : ""), email: p.email || u.email || "", phone: u.phone || "", role: p.role, isOwner: p.role === "super_admin", canEdit: p.role === "super_admin" || p.role === "editor", defaults: p.defaults || null };
    S.names[u.id] = { name: p.full_name };
    if (S.auth.mode !== "newpw") { S.auth.msg = ""; S.auth.err = ""; }
    db.rpc("touch_last_seen").then(function () {});
    clearInterval(sessTimer); sessTimer = setInterval(checkSession, 30000);
    if (U.logAct) U.logAct("login", (navigator.userAgent.match(/(Windows|Android|iPhone|iPad|Mac|Linux)/) || ["", "Browser"])[1]); if (U.loadNotice) U.loadNotice();
    loadOvr(); U.loadSors(); if (U.loadNs) U.loadNs(); if (U.loadSavedAn) U.loadSavedAn(); if (U.loadGroups) U.loadGroups(); if (U.loadApprovals) U.loadApprovals(); if (U.loadReviews) U.loadReviews(); if (U.offlineLogin) U.offlineLogin(); U.watchEst(S.me.id); loadLicence();
    clearInterval(licTimer); licTimer = setInterval(function () { if (S.me.id) loadLicence(); }, 600000);
    U.render();
  }
  function ovrRow(row) { var o = Object.assign({}, row.data || {}); o.by = row.updated_by; o.at = row.updated_at ? Date.parse(row.updated_at) : null; return o; }
  /* Rate overrides: shared library (rate_overrides, editors) + personal (user_rates, every user, own estimates only).
     S.ovr = shared merged with mine (mine wins). S.rateScope: "me" (default) or "all" (editors). */
  S.ovrShared = {}; S.ovrMine = {}; S.rateScope = "me"; S.mineOk = true;
  S.ovrTeam = {};
  function mergeOvr() { var o = {}; Object.keys(S.ovrShared).forEach(function (k) { o[k] = S.ovrShared[k]; }); Object.keys(S.ovrTeam || {}).forEach(function (k) { o[k] = S.ovrTeam[k]; }); Object.keys(S.ovrMine).forEach(function (k) { o[k] = S.ovrMine[k]; }); S.ovr = o; EP.bump(); }
  U.isMine = function (id) { return !!S.ovrMine[id]; };
  async function loadOvr() {
    var all = [], from = 0;
    var first = await db.from("rate_overrides").select("id").range(0, 0);
    if (first.error && U.off && U.off.isNet(first.error)) { await U.off.loadRates(); return; }
    while (true) { var r = await db.from("rate_overrides").select("id,data,updated_by,updated_at").range(from, from + 999); if (r.error) break; all = all.concat(r.data); if (r.data.length < 1000) break; from += 1000; }
    var o = {}, ids = []; all.forEach(function (row) { o[row.id] = ovrRow(row); if (row.updated_by) ids.push(row.updated_by); });
    S.ovrShared = o;
    var m = {}, mr = await db.from("user_rates").select("id,data,updated_at").eq("owner", S.me.id);
    if (mr.error) { S.mineOk = false; console.warn("personal rates unavailable", mr.error); } else { S.mineOk = true; (mr.data || []).forEach(function (row) { var x = Object.assign({}, row.data || {}); x.by = S.me.id; x.at = Date.parse(row.updated_at); x.mine = true; m[row.id] = x; }); }
    S.ovrMine = m; mergeOvr(); U.resolveNames(ids); U.render(); if (U.off) U.off.saveRates();
    if (!rt) rt = db.channel("rate-overrides").on("postgres_changes", { event: "*", schema: "public", table: "rate_overrides" }, function (p) {
      if (p.eventType === "DELETE") { if (p.old && p.old.id) delete S.ovrShared[p.old.id]; }
      else if (p.new && p.new.id) { S.ovrShared[p.new.id] = ovrRow(p.new); U.resolveNames([p.new.updated_by]); }
      mergeOvr(); U.render();
    }).subscribe();
  }
  U.mergeOvr = mergeOvr;
  function personal() { return S.rateScope === "team" ? false : (S.rateScope !== "all" || !S.me.canEdit); }
  function teamScope() { return S.rateScope === "team" && S.grp && S.grp.adminTeam; }
  U.ovrSet = async function (id, body) {
    var d = Object.assign({}, body); delete d.by; delete d.at; delete d.mine; delete d.team;
    if (teamScope()) {
      var rt2 = await db.from("team_rates").upsert({ team_id: S.grp.adminTeam, id: id, data: d, updated_by: S.me.id });
      if (U.fail(rt2, "Couldn't save the group rate.")) return false;
      S.ovrTeam[id] = Object.assign({}, d, { by: S.me.id, at: Date.now(), team: true }); mergeOvr(); U.render(); return true;
    }
    if (personal()) {
      var r1 = await db.from("user_rates").upsert({ owner: S.me.id, id: id, data: d });
      if (U.fail(r1, S.mineOk ? "Couldn't save your rate." : "Personal rates aren't set up yet on the server (run user_rates.sql).")) return false;
      S.ovrMine[id] = Object.assign({}, d, { by: S.me.id, at: Date.now(), mine: true });
    } else {
      var r = await db.from("rate_overrides").upsert({ id: id, data: d, updated_by: S.me.id });
      if (U.fail(r, "Couldn't save. Only editors can change library rates.")) return false;
      S.ovrShared[id] = Object.assign({}, d, { by: S.me.id, at: Date.now() });
    }
    mergeOvr(); U.render(); return true;
  };
  U.ovrDel = async function (id) {
    if (teamScope() && S.ovrTeam[id] && !S.ovrMine[id]) { var rt3 = await db.from("team_rates").delete().eq("team_id", S.grp.adminTeam).eq("id", id); if (U.fail(rt3, "Couldn't reset the group rate.")) return false; delete S.ovrTeam[id]; mergeOvr(); U.render(); return true; }
    if (personal() || S.ovrMine[id]) {
      if (S.ovrMine[id]) { var r1 = await db.from("user_rates").delete().eq("owner", S.me.id).eq("id", id); if (U.fail(r1, "Couldn't reset your rate.")) return false; delete S.ovrMine[id]; mergeOvr(); U.render(); return true; }
      if (personal()) { mergeOvr(); U.render(); return true; }
    }
    var r = await db.from("rate_overrides").delete().eq("id", id); if (U.fail(r, "Couldn't reset. Only editors can change library rates.")) return false; delete S.ovrShared[id]; mergeOvr(); U.render(); return true;
  };
  U.scopeBar = function () {
    var mine = Object.keys(S.ovrMine).length;
    var h = '<div class="scope-bar"><span class="lbl">Rate changes apply to</span><div class="seg" role="group" aria-label="Who the rate change applies to"><button type="button" data-rscope="me" aria-pressed="' + personal() + '">Only my estimates' + (mine ? " (" + mine + " changed)" : "") + "</button>" + (S.grp && S.grp.adminTeam ? '<button type="button" data-rscope="team" aria-pressed="' + (S.rateScope === "team") + '">My group (' + U.esc(S.grp.adminTeamName || "") + ")</button>" : "") + (S.me.canEdit ? '<button type="button" data-rscope="all" aria-pressed="' + (S.rateScope === "all") + '">Everyone (shared library)</button>' : "") + "</div>";
    h += '<span class="muted" style="font-size:12px">' + (S.rateScope === "team" && S.grp && S.grp.adminTeam ? "You are changing the rates of your group: every member's estimates use them (their own rates still win)." : personal() ? "Your own labour, material, machinery and analysis rates. Other users are not affected; your rates win over the shared library." : "You are editing the shared library used by every user (editors only).") + "</span>";
    if (mine) h += '<button type="button" class="btn ghost sm" id="mine-reset">Reset all my rates</button>';
    return h + "</div>";
  };

  /* ---------- users (super admin) ---------- */
  U.loadUsers = async function () {
    var r = await db.rpc("admin_users2"); if (r.error) r = await db.rpc("admin_users"); if (r.error) return;
    S.est.usersInfo = r.data; S.est.users = r.data.map(function (u) { return u.id; });
    r.data.forEach(function (u) { S.names[u.id] = { name: u.full_name || u.email }; }); U.render();
  };
  views.users = function () {
    if (!S.me.isOwner) return U.groupAdminView ? U.groupAdminView() : "";
    var h = '<div style="display:flex;flex-direction:column;gap:12px;max-width:1080px"><h1>Users & projects</h1><p class="muted" style="margin:0">Anyone with the app link can sign up with Google or email. Everyone starts as a <strong>User</strong> with private projects and private uploaded SORs. <strong>Editors</strong> can also change library analysis rates and basic rates. You are the super admin and can open anyone\'s projects. Each person can be signed in on one computer at a time.</p><p class="muted" style="margin:0">Every new sign-up gets a <strong>7-day free trial</strong>. After that they can only view and export until you activate them here (1 month to 1 year, lifetime, or up to any date you pick with <em>Set expiry date…</em>). You can also create accounts yourself with <strong>Create user</strong> and set anyone\'s password with <strong>Password</strong>. The sign-in page and the trial banner show your sales contact: ' + contactHtml() + '.</p>';
    h += addUserPanel(); h += U.authOptsPanel();
    if (U.approvalsPanel) h += U.approvalsPanel();
    if (U.adminTop) h += U.adminTop();
    if (U.groupsPanel) h += U.groupsPanel();
    var list = U.userFilter ? U.userFilter(S.est.usersInfo) : S.est.usersInfo;
    h += '<div class="tw"><table class="t"><thead><tr><th>Person</th><th>Email / phone</th><th>Role</th><th>Licence</th><th class="num">Estimates</th><th>Joined</th><th>Last active</th><th>Signed in on</th><th></th></tr></thead><tbody>';
    var roles = [["user", "User"], ["editor", "Editor"], ["super_admin", "Super admin"]];
    h += list.length ? list.map(function (u) {
      var me = u.id === S.me.id;
      var rc = me ? "<span class='role sa'>Super admin</span>" : "<select class='in' data-role='" + U.esc(u.id) + "' aria-label='Role for " + U.esc(u.full_name || u.email) + "'>" + roles.map(function (r) { return "<option value='" + r[0] + "'" + (u.role === r[0] ? " selected" : "") + ">" + r[1] + "</option>"; }).join("") + "</select>";
      var dev = u.device ? U.esc(/Windows/.test(u.device) ? "Windows" : /Mac/.test(u.device) ? "Mac" : /Android/.test(u.device) ? "Android" : /iPhone|iPad/.test(u.device) ? "iPhone / iPad" : /Linux/.test(u.device) ? "Linux" : "Browser") + " · " + U.when(u.session_at) : "—";
      return "<tr" + (u.blocked ? " class='blockedrow'" : "") + "><td>" + U.esc((u.full_name || "—") + (me ? " (you)" : "")) + (u.blocked ? "<br><span class='badge dan'>Blocked</span>" : "") + (U.userGroupsCell ? U.userGroupsCell(u) : "") + "</td><td>" + U.esc(u.email || "") + (U.phoneCell ? U.phoneCell(u) : "") + "</td><td>" + rc + "</td><td>" + licCell(u) + "</td><td class='num'>" + u.estimates + "</td><td>" + U.when(u.created_at) + "</td><td>" + U.when(u.last_seen) + "</td><td>" + dev + "</td><td><button class='btn ghost sm' data-openuser='" + U.esc(u.id) + "'>Open projects</button>" + (me ? "" : "<button class='btn ghost sm' data-upw='" + U.esc(u.id) + "'>Password</button>") + (U.userActions ? U.userActions(u, me) : "") + "</td></tr>" + editRow(u) + (U.userExtraRow ? U.userExtraRow(u) : "");
    }).join("") : "<tr><td colspan='9' class='empty'>" + (S.est.usersInfo.length ? "Nobody matches the search / filter." : "Nobody else has signed up yet.") + "</td></tr>";
    return h + "</tbody></table></div></div>";
  };
  function licState(u) {
    var now = Date.now();
    if (u.role === "super_admin") return { k: "admin", t: "Super admin", c: "info" };
    if (u.activated && (!u.activated_until || Date.parse(u.activated_until) > now)) return { k: "active", t: u.activated_until ? "Active until " + new Date(u.activated_until).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Active (lifetime)", c: "ed" };
    if (u.trial_ends && Date.parse(u.trial_ends) > now) { var d = U.daysLeft(u.trial_ends); return { k: "trial", t: "Trial · " + d + (d === 1 ? " day" : " days") + " left", c: "warn" }; }
    return { k: "expired", t: u.activated ? "Activation expired" : "Trial expired", c: "dan" };
  }
  function licCell(u) {
    var s = licState(u), h = "<div style='display:flex;flex-direction:column;gap:4px;align-items:flex-start'><span class='badge " + s.c + "'>" + U.esc(s.t) + "</span>";
    if (u.activated_note) h += "<span class='muted' style='font-size:12px'>" + U.esc(u.activated_note) + "</span>";
    if (s.k !== "admin") {
      h += "<select class='in' data-lic='" + U.esc(u.id) + "' aria-label='Change licence for " + U.esc(u.full_name || u.email) + "'><option value=''>Change licence…</option><option value='m1'>Activate 1 month</option><option value='m3'>Activate 3 months</option><option value='m6'>Activate 6 months</option><option value='y1'>Activate 1 year</option><option value='life'>Activate lifetime</option><option value='date'>Set expiry date…</option><option value='t7'>Extend trial +7 days</option>" + (s.k === "active" ? "<option value='off'>Deactivate</option>" : "") + "</select>";
    }
    return h + "</div>";
  }
  async function setLicence(id, v) {
    var u = S.est.usersInfo.filter(function (x) { return x.id === id; })[0]; if (!u || !v) return;
    var nm = u.full_name || u.email, body, now = new Date(), msg;
    function plus(mo) { var d = new Date(now); if (u.activated && u.activated_until && Date.parse(u.activated_until) > now) d = new Date(u.activated_until); d.setMonth(d.getMonth() + mo); return d.toISOString(); }
    var label = { m1: "1 month", m3: "3 months", m6: "6 months", y1: "1 year" };
    if (label[v]) { var until = plus({ m1: 1, m3: 3, m6: 6, y1: 12 }[v]); body = { activated: true, activated_until: until, activated_note: "Activated " + label[v] + " on " + now.toLocaleDateString("en-IN") }; msg = nm + " activated until " + new Date(until).toLocaleDateString("en-IN"); }
    else if (v === "life") { body = { activated: true, activated_until: null, activated_note: "Lifetime, activated on " + now.toLocaleDateString("en-IN") }; msg = nm + " activated for lifetime"; }
    else if (v === "t7") { var base = u.trial_ends && Date.parse(u.trial_ends) > now ? new Date(u.trial_ends) : now; body = { trial_ends: new Date(base.getTime() + 7 * 864e5).toISOString() }; msg = "Trial extended for " + nm; }
    else if (v === "date") { S.uedit = { id: id, mode: "date" }; U.render(); setTimeout(function () { var n = document.getElementById("ue-date"); if (n) n.focus(); }, 30); return; }
    else if (v === "off") { if (!confirm("Deactivate " + nm + "? They will only be able to view and export until you activate them again.")) { U.render(); return; } body = { activated: false, activated_until: null, activated_note: "Deactivated on " + now.toLocaleDateString("en-IN") }; msg = nm + " deactivated"; }
    else return;
    var r = await db.from("profiles").update(body).eq("id", id);
    if (U.fail(r, "Couldn't change the licence.")) { U.loadUsers(); return; }
    U.toast(msg); U.loadUsers();
  }
  /* ----- create user / password / expiry date (super admin) ----- */
  S.uedit = null; S.newUser = { open: false, lic: "trial", busy: false, err: "", done: "" };
  function isoDay(d) { var z = new Date(d.getTime() - d.getTimezoneOffset() * 6e4); return z.toISOString().slice(0, 10); }
  function endOfDayIST(ymd) { return ymd + "T23:59:59+05:30"; }
  function genPw() { var a = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789", b = new Uint32Array(10), o = ""; crypto.getRandomValues(b); for (var i = 0; i < 10; i++) o += a[b[i] % a.length]; return o; }
  function addUserPanel() {
    var N = S.newUser;
    if (!N.open) return '<div class="row"><button type="button" class="btn pri" id="nu-open">+ Create user</button>' + (N.done ? '<span class="badge ed" role="status" style="white-space:normal">' + U.esc(N.done) + "</span>" : "") + "</div>";
    var in30 = new Date(Date.now() + 365 * 864e5);
    var h = '<form class="panel" id="nu-form" style="padding:14px 16px;display:flex;flex-direction:column;gap:12px" novalidate><h2 style="margin:0;font-size:16px">Create a user</h2>';
    h += '<div class="nu-grid"><label class="fld"><span class="lbl">Full name</span><input class="in" id="nu-name" autocomplete="off" required></label>';
    h += '<label class="fld"><span class="lbl">Email (optional if mobile is given)</span><input class="in" id="nu-email" type="email" autocomplete="off"></label>';
    h += '<label class="fld"><span class="lbl">Mobile / WhatsApp no.</span><span class="row" style="gap:6px;flex-wrap:nowrap">' + ccSel("nu-cc", "91") + '<input class="in" id="nu-phone" type="tel" inputmode="tel" autocomplete="off" placeholder="98765 43210" style="flex:1;min-width:0"></span></label>';
    h += '<label class="fld"><span class="lbl">Password</span><span class="row" style="gap:6px;flex-wrap:nowrap"><input class="in" id="nu-pass" type="text" minlength="8" autocomplete="off" style="flex:1;min-width:0;font-family:var(--mono,monospace)" value="' + genPw() + '"><button type="button" class="btn sec sm" data-gen="nu-pass">New</button></span></label>';
    h += '<label class="fld"><span class="lbl">Role</span><select class="in" id="nu-role"><option value="user">User</option><option value="editor">Editor</option></select></label>';
    h += '<label class="fld"><span class="lbl">Licence</span><select class="in" id="nu-lic"><option value="trial"' + (N.lic === "trial" ? " selected" : "") + '>7-day trial</option><option value="until"' + (N.lic === "until" ? " selected" : "") + '>Active until a date</option><option value="life"' + (N.lic === "life" ? " selected" : "") + ">Lifetime</option></select></label>";
    h += '<label class="fld"' + (N.lic === "until" ? "" : " hidden") + '><span class="lbl">Active until</span><input class="in" id="nu-until" type="date" min="' + isoDay(new Date()) + '" value="' + isoDay(in30) + '"></label></div>';
    h += '<p class="muted" style="margin:0;font-size:12px">The account is ready to use straight away (no confirmation email). They can sign in with email + password, or with the mobile number and an OTP on WhatsApp. Give email, mobile or both.</p>';
    if (N.err) h += '<div class="badge dan" role="alert" style="white-space:normal">' + U.esc(N.err) + "</div>";
    h += '<div class="row"><button class="btn pri" type="submit"' + (N.busy ? " disabled" : "") + ">" + (N.busy ? "Creating…" : "Create user") + '</button><button type="button" class="btn ghost" id="nu-cancel">Cancel</button></div></form>';
    return h;
  }
  function editRow(u) {
    var E = S.uedit; if (!E || E.id !== u.id) return "";
    var nm = U.esc(u.full_name || u.email), h = "<tr class='uedit'><td colspan='9'><div class='row' style='gap:10px;align-items:flex-end;flex-wrap:wrap'>";
    if (E.mode === "date") {
      var cur = u.activated && u.activated_until ? isoDay(new Date(u.activated_until)) : isoDay(new Date(Date.now() + 365 * 864e5));
      h += "<label class='fld'><span class='lbl'>Activation for " + nm + " ends on</span><input class='in' id='ue-date' type='date' min='" + isoDay(new Date()) + "' value='" + cur + "'></label>";
      h += "<button type='button' class='btn pri' data-uesave='" + U.esc(u.id) + "'>Save date</button>";
      h += "<span class='muted' style='font-size:12px'>They can use the app until the end of that day (India time).</span>";
    } else {
      h += "<label class='fld'><span class='lbl'>New password for " + nm + "</span><span class='row' style='gap:6px;flex-wrap:nowrap'><input class='in' id='ue-pass' type='text' minlength='8' autocomplete='off' style='font-family:var(--mono,monospace)' value='" + genPw() + "'><button type='button' class='btn sec sm' data-gen='ue-pass'>New</button></span></label>";
      h += "<button type='button' class='btn pri' data-uepw='" + U.esc(u.id) + "'" + (E.busy ? " disabled" : "") + ">" + (E.busy ? "Saving…" : "Set password") + "</button>";
      h += "<button type='button' class='btn sec' data-uemail='" + U.esc(u.id) + "'>Email them a reset link instead</button>";
      h += "<span class='muted' style='font-size:12px;flex-basis:100%'>Setting a password signs them out on their computer. Copy the new password and send it to them.</span>";
    }
    return h + "<button type='button' class='btn ghost' id='ue-cancel'>Cancel</button></div></td></tr>";
  }
  U.adminCall = function (b) { return adminCall(b); };
  async function adminCall(body) {
    try {
      var r = await db.functions.invoke("admin-users", { body: body });
      if (r.error) { var msg = r.error.message; try { var j = r.error.context && await r.error.context.json(); if (j && j.error) msg = j.error; } catch (e) {} return { error: msg || "Something went wrong." }; }
      return r.data || {};
    } catch (e) { return { error: String(e && e.message || e) }; }
  }
  async function createUser() {
    var N = S.newUser; if (N.busy) return;
    var v = function (id) { var n = document.getElementById(id); return n ? n.value.trim() : ""; };
    var rawPh = v("nu-phone"), ph = rawPh ? normPhone(rawPh, v("nu-cc") || "91") : "";
    var body = { action: "create", full_name: v("nu-name"), email: v("nu-email"), phone: ph, password: v("nu-pass"), role: v("nu-role") || "user", licence: { kind: v("nu-lic") || "trial" } };
    if (!body.full_name) { N.err = "Enter the person's name."; U.render(); return; }
    if (rawPh && !ph) { N.err = "Enter a valid mobile number (10 digits for India)."; U.render(); return; }
    if (!body.email && !ph) { N.err = "Enter an email address or a mobile number."; U.render(); return; }
    if (body.email && !/^\S+@\S+\.\S+$/.test(body.email)) { N.err = "Enter a valid email address."; U.render(); return; }
    if (body.password.length < 8) { N.err = "Use at least 8 characters for the password."; U.render(); return; }
    if (body.licence.kind === "until") { var d = v("nu-until"); if (!d) { N.err = "Pick the date the activation ends."; U.render(); return; } body.licence.until = endOfDayIST(d); }
    N.busy = true; N.err = ""; U.render();
    var r = await adminCall(body); N.busy = false;
    if (r.error) { N.err = r.error; U.render(); return; }
    S.newUser = { open: false, lic: "trial", busy: false, err: "", done: "Created " + [body.email, ph].filter(Boolean).join(" · ") + " · password: " + body.password + (r.warning ? " · " + r.warning : "") };
    U.toast("User created"); U.loadUsers();
  }
  async function saveDate(id) {
    var n = document.getElementById("ue-date"), d = n && n.value; if (!d) { U.toast("Pick a date."); return; }
    var until = endOfDayIST(d); if (Date.parse(until) < Date.now()) { U.toast("Pick today or a later date."); return; }
    var nice = new Date(until).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    var r = await db.from("profiles").update({ activated: true, activated_until: until, activated_note: "Active until " + nice + " (set on " + new Date().toLocaleDateString("en-IN") + ")" }).eq("id", id);
    if (U.fail(r, "Couldn't save the date.")) return;
    S.uedit = null; U.toast("Active until " + nice); U.loadUsers();
  }
  async function setPw(id) {
    var n = document.getElementById("ue-pass"), pw = n ? n.value.trim() : "";
    if (pw.length < 8) { U.toast("Use at least 8 characters."); return; }
    S.uedit.busy = true; U.render();
    var r = await adminCall({ action: "set_password", user_id: id, password: pw });
    if (S.uedit) S.uedit.busy = false;
    if (r.error) { U.toast(r.error); U.render(); return; }
    var u = S.est.usersInfo.filter(function (x) { return x.id === id; })[0];
    S.uedit = null; S.newUser.done = "Password for " + (u ? u.email : "user") + " is now: " + pw; U.toast("Password changed"); U.loadUsers();
  }
  async function mailReset(id) {
    var u = S.est.usersInfo.filter(function (x) { return x.id === id; })[0]; if (!u) return;
    var r = await db.auth.resetPasswordForEmail(u.email, { redirectTo: location.origin + location.pathname });
    if (U.fail(r, "Couldn't send the email.")) return;
    S.uedit = null; U.toast("Reset link sent to " + u.email); U.render();
  }
  async function setRole(id, role) { var r = await db.from("profiles").update({ role: role }).eq("id", id); if (U.fail(r, "Couldn't change the role.")) { U.loadUsers(); return; } U.toast("Role updated"); U.loadUsers(); }

  /* ---------- existing members: add / confirm a WhatsApp number (OTP via the same relay) ---------- */
  S.ph = { step: 0, busy: false, err: "", msg: "", later: false, phone: "", cc: "91" };
  try { S.ph.later = sessionStorage.getItem("ep_ph_later") === "1"; } catch (e) {}
  U.phonePrompt = function () {
    var P = S.ph; if (!S.authOpts.whatsapp || !S.me.id || S.me.phone || P.later) return "";
    var h = '<div class="panel" id="ph-box" style="border:2px solid var(--pri,#0b6);display:flex;flex-direction:column;gap:8px;margin-bottom:12px"><strong>Add your WhatsApp number</strong><span class="muted" style="font-size:13px">Then you can log in with an OTP on WhatsApp, and you will not have to remember the password.</span>';
    h += '<div class="row" style="gap:6px;flex-wrap:wrap;align-items:center">' + ccSel("ph-cc", P.cc) + '<input class="in" id="ph-num" type="tel" inputmode="tel" placeholder="98765 43210" value="' + U.esc(P.raw || "") + '"' + (P.step ? " readonly" : "") + ' style="max-width:200px">';
    if (P.step) h += '<input class="in" id="ph-code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="OTP" style="max-width:120px"><button type="button" class="btn pri sm" id="ph-verify"' + (P.busy ? " disabled" : "") + ">Verify</button><button type=\"button\" class=\"btn ghost sm\" id=\"ph-change\">Change</button>";
    else h += '<button type="button" class="btn pri sm" id="ph-send"' + (P.busy ? " disabled" : "") + ">" + (P.busy ? "Please wait…" : "Send OTP on WhatsApp") + "</button>";
    h += '<button type="button" class="btn ghost sm" id="ph-later">Later</button></div>';
    if (P.err) h += '<div class="badge dan" style="white-space:normal">' + U.esc(P.err) + "</div>";
    if (P.msg) h += '<div class="badge info" style="white-space:normal">' + U.esc(P.msg) + "</div>";
    return h + "</div>";
  };
  async function phSend() {
    var P = S.ph; P.err = ""; P.msg = ""; P.cc = (document.getElementById("ph-cc") || {}).value || "91"; P.raw = val("ph-num");
    var ph = normPhone(P.raw, P.cc); if (!ph) { P.err = "Enter a valid mobile number (choose the country if it is not India)."; U.render(); return; }
    P.phone = ph; P.busy = true; U.render();
    var r; try { r = await db.auth.updateUser({ phone: ph }); } catch (ex) { r = { error: ex }; }
    P.busy = false;
    if (r.error) { P.err = /already|registered|exists/i.test(r.error.message || "") ? "This number is already linked to another account. Ask the admin to merge the two accounts." : otpMsg(r.error, true); U.render(); return; }
    P.step = 1; P.msg = "OTP sent on WhatsApp to " + ph + "."; U.render();
  }
  async function phVerify() {
    var P = S.ph, code = val("ph-code").replace(/\s/g, ""); P.err = ""; if (!/^\d{4,8}$/.test(code)) { P.err = "Enter the OTP you received."; U.render(); return; }
    P.busy = true; U.render();
    var r; try { r = await db.auth.verifyOtp({ phone: P.phone, token: code, type: "phone_change" }); } catch (ex) { r = { error: ex }; }
    P.busy = false;
    if (r.error) { P.err = /expired|invalid/i.test(r.error.message || "") ? "That OTP is wrong or has expired. Click “Change” and send it again." : otpMsg(r.error, true); U.render(); return; }
    S.me.phone = P.phone; db.from("profiles").update({ phone: P.phone }).eq("id", S.me.id).then(function () {});
    P.step = 0; P.msg = ""; U.toast("WhatsApp number added — next time you can log in with an OTP"); U.render();
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("button"); if (!t) return;
    if (t.id === "ph-send") phSend(); else if (t.id === "ph-verify") phVerify();
    else if (t.id === "ph-change") { S.ph.step = 0; S.ph.msg = ""; S.ph.err = ""; U.render(); }
    else if (t.id === "ph-later") { S.ph.later = true; try { sessionStorage.setItem("ep_ph_later", "1"); } catch (er) {} U.render(); }
  });

  /* ---------- sign-in options (super admin switches) ---------- */
  async function loadAuthOpts() {
    if (!db) return;
    var r = await db.rpc("auth_options"); if (r.error || !r.data) return;
    var o = r.data; if (typeof o === "string") { try { o = JSON.parse(o); } catch (e) { return; } }
    S.authOpts = { google: o.google === true, emailOtp: o.emailOtp !== false, whatsapp: o.whatsapp === true }; U.render();
  }
  async function saveAuthOpt(k, on) {
    var next = Object.assign({}, S.authOpts); next[k] = !!on;
    var r = await db.rpc("set_auth_options", { o: next });
    if (r.error) { U.toast(/function .* does not exist|schema cache/i.test(r.error.message || "") ? "Run auth_options.sql in Supabase → SQL Editor once, then try again." : "Couldn't save: " + r.error.message); U.render(); return; }
    S.authOpts = next; U.toast("Saved. Login page updated."); U.render();
  }
  U.authOptsPanel = function () {
    var O = S.authOpts || {}, sw = function (k, label, help) { return '<label class="row" style="gap:8px;align-items:flex-start;flex-wrap:nowrap"><input type="checkbox" data-aopt="' + k + '"' + (O[k] ? " checked" : "") + ' style="margin-top:3px"><span><strong>' + label + '</strong><br><span class="muted" style="font-size:12px">' + help + "</span></span></label>"; };
    return '<div class="panel form"><h3>Sign-in options on the login page</h3>' +
      sw("google", "Google sign-in", "Shows “Continue with Google”. Turn on only after Google is enabled in Supabase → Authentication → Providers.") +
      sw("emailOtp", "Email code (OTP)", "People can sign in — or confirm an unconfirmed email — by typing a 6-digit code. Needs {{ .Token }} in the Supabase email templates.") +
      sw("whatsapp", "WhatsApp code (OTP)", "People sign in with a code sent on WhatsApp through Vivid Relay. Needs: Supabase → Authentication → Providers → Phone switched on, and Authentication → Hooks → Send SMS hook pointing to the send-otp-relay function (Relay URL, number name and API key in its secrets).") + "</div>";
  };

  /* ---------- global events ---------- */
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t) return;
    if (t.closest("nav.tabs")) { U.setTab(t.dataset.tab); return; }
    if (t.dataset.auth) { S.auth.mode = t.dataset.auth; S.auth.err = ""; S.auth.msg = ""; S.auth.step = 0; U.render(); }
    else if (t.dataset.lm) { S.auth.lm = t.dataset.lm; S.auth.step = 0; S.auth.err = ""; S.auth.msg = ""; U.render(); }
    else if (t.id === "au-other") { S.auth.step = 0; S.auth.err = ""; S.auth.msg = ""; U.render(); }
    else if (t.id === "au-again") { S.auth.step = 0; S.auth.err = ""; submitAuth(); }
    else if (t.id === "au-regemail") { S.auth.err = ""; register(true).catch(function (ex) { S.auth.busy = false; S.auth.err = authMsg(ex); U.render(); }); }
    else if (t.id === "google") google();
    else if (t.id === "au-resend") resendConfirm();
    else if (t.id === "sign-out") { db.rpc("release_session").then(function () { db.auth.signOut(); }); }
    else if (t.id === "nu-open") { S.newUser.open = true; S.newUser.err = ""; S.newUser.done = ""; U.render(); setTimeout(function () { var n = document.getElementById("nu-name"); if (n) n.focus(); }, 30); }
    else if (t.id === "nu-cancel") { S.newUser.open = false; U.render(); }
    else if (t.dataset.gen) { var gi = document.getElementById(t.dataset.gen); if (gi) gi.value = genPw(); }
    else if (t.dataset.upw) { S.uedit = S.uedit && S.uedit.id === t.dataset.upw && S.uedit.mode === "pw" ? null : { id: t.dataset.upw, mode: "pw" }; U.render(); }
    else if (t.id === "ue-cancel") { S.uedit = null; U.render(); }
    else if (t.dataset.uesave) saveDate(t.dataset.uesave);
    else if (t.dataset.uepw) setPw(t.dataset.uepw);
    else if (t.dataset.uemail) mailReset(t.dataset.uemail);
    else if (t.dataset.rscope) { S.rateScope = t.dataset.rscope; U.render(); }
    else if (t.id === "mine-reset") { if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again to reset all your rates"; return; } db.from("user_rates").delete().eq("owner", S.me.id).then(function (r) { if (U.fail(r, "Couldn't reset.")) return; S.ovrMine = {}; mergeOvr(); U.toast("Your rates were reset to the library rates"); U.render(); }); }
    else if (t.id === "lic-recheck") { loadLicence().then(function () { U.toast(U.locked() ? "Still not activated. Contact sales: " + S.sales.phone : "Your account is active. Thank you!"); }); }
    else if (t.dataset.openuser) { U.setTab("estimates"); U.watchEst(t.dataset.openuser); }
  });
  document.addEventListener("submit", function (e) { if (e.target.id === "auth-form") { e.preventDefault(); submitAuth(); } else if (e.target.id === "nu-form") { e.preventDefault(); createUser(); } });
  document.addEventListener("change", function (e) { var t = e.target; if (t.dataset.aopt && S.me.isOwner) { saveAuthOpt(t.dataset.aopt, t.checked); return; } if (t.dataset.role && S.me.isOwner) setRole(t.dataset.role, t.value); else if (t.dataset.lic && S.me.isOwner) setLicence(t.dataset.lic, t.value); else if (t.id === "nu-lic") { var keep = {}; ["nu-name", "nu-email", "nu-pass", "nu-role"].forEach(function (k) { var n = document.getElementById(k); if (n) keep[k] = n.value; }); S.newUser.lic = t.value; U.render(); requestAnimationFrame(function () { Object.keys(keep).forEach(function (k) { var n = document.getElementById(k); if (n) n.value = keep[k]; }); }); } });
  window.addEventListener("focus", function () { checkSession(); });

  /* ---------- boot ---------- */
  U.boot = async function () {
    var h = (location.hash || "").slice(1); if (["estimates", "reviews", "photos", "scan", "cad", "design", "library", "basic", "sors", "backup", "users", "help"].indexOf(h) >= 0) S.tab = h;
    var cfg = window.EP_CONFIG || {};
    if (window.supabase && cfg.url && cfg.anonKey && cfg.url.indexOf("YOUR-") < 0) db = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    U.render();
    /* rate books: the four main books first (app usable), MPPWD 2025 and E&M 2022 right after in the background.
       The service worker (sw.js) keeps them on the device, so later visits and offline use load them from the phone. */
    function getJson(f, opt) { return fetch(f).then(function (r) { if (!r.ok) throw new Error(f); return r.json(); }).catch(function (e) { if (opt) return null; throw e; }); }
    Promise.all([getJson("cpwd.json"), getJson("mppwd.json"), getJson("hort.json"), getJson("cpwd23.json", true)])
      .then(function (a) {
        EP.loadBuiltIn(a[0], a[1], a[2], a[3], null, null); S.loaded = true; S.lateBooks = true; U.render();
        return Promise.all([getJson("mppwd25.json", true), getJson("em22.json", true)]).then(function (b) { EP.loadLate(b[0], b[1]); S.lateBooks = false; S.allBooks = true; U.render(); });
      })
      .catch(function () { $("#view").innerHTML = '<div class="panel empty">The rate books didn\'t load. Check your connection and reload the page.</div>'; });
    if (!db) return;
    loadAuthOpts();
    db.rpc("sales_contact").then(function (r) { var x = r && r.data && (Array.isArray(r.data) ? r.data[0] : r.data); if (x) { if (x.sales_email) S.sales.email = x.sales_email; if (x.sales_phone) S.sales.phone = x.sales_phone; U.render(); } }).catch(function () {});
    db.auth.onAuthStateChange(function (ev, session) {
      if (ev === "PASSWORD_RECOVERY") { S.auth.mode = "newpw"; S.auth.err = ""; S.auth.msg = ""; }
      if (ev === "TOKEN_REFRESHED") return;
      setTimeout(function () { loadMe(session); }, 0);
    });
    // opened without network: use the sign-in kept on this device so the saved estimates can be worked on
    setTimeout(function () {
      if (S.me.id || navigator.onLine) return;
      try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^sb-.*-auth-token$/.test(k)) { var s = JSON.parse(localStorage.getItem(k)); var us = s && (s.user || (s.currentSession && s.currentSession.user)); if (us && us.id) { loadMe({ user: us }); return; } } } } catch (e) {}
    }, 3000);
  };
})();
