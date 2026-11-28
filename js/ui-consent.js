/* Consent before an account is made (Digital Personal Data Protection Act, 2023).
   Loaded right after supabase-js and before the rest of the app. It wraps supabase.createClient so that every
   way of making or entering an account — sign up with email, OTP on WhatsApp / email, Google, an OTP server
   function — first asks the person to agree to the Privacy Policy and Terms. Without that agreement the call
   is not sent at all, so no account is made. WhatsApp notifications (updates, reminders) are a separate, optional
   choice that is off unless ticked. The agreement is kept in the user's account (user_metadata) and, once
   server/consent.sql is run, also in a consent log table. Someone already signed in who has not agreed to this
   version (an older account, or one the admin made) is asked once; saying no signs them out. */
(function () {
  "use strict";
  var VER = "2026-11-27", KEY = "ep_consent";
  window.EP_CONSENT_VER = VER;

  function local() { try { var c = JSON.parse(localStorage.getItem(KEY) || "null"); return c && c.v === VER ? c : null; } catch (e) { return null; } }
  function keep(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
  function meta(c) { return { consent_ver: c.v, consent_at: c.at, wa_optin: !!c.wa }; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]; }); }

  var open = null;   // one dialog at a time; a second call waits on the same answer
  /* shows the dialog; resolves {v, at, wa} when agreed, null when cancelled */
  function ask(opts) {
    if (open) return open;
    opts = opts || {};
    open = new Promise(function (resolve) {
      var prev = local() || {};
      var box = document.createElement("div");
      box.id = "ep-consent";
      box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-labelledby", "epc-h");
      box.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:14px;overflow:auto";
      var lab = "display:flex;gap:10px;align-items:flex-start;margin:0 0 10px;cursor:pointer", cb = "margin-top:2px;width:18px;height:18px;flex:0 0 auto";
      box.innerHTML =
        "<div style='background:#fff;color:#0f172a;max-width:380px;width:100%;border-radius:12px;padding:18px 18px 14px;box-shadow:0 12px 40px rgba(0,0,0,.25);font-size:14px;line-height:1.45'>" +
        "<h2 id='epc-h' style='margin:0 0 12px;font-size:17px'>" + esc(opts.title || "Consent / सहमति") + "</h2>" +
        "<label style='" + lab + "'><input type='checkbox' id='epc-1' style='" + cb + "'><span>I agree to the <a href='privacy.html' target='_blank' rel='noopener'>Privacy Policy</a> &amp; <a href='terms.html' target='_blank' rel='noopener'>Terms</a></span></label>" +
        "<label style='" + lab + ";margin-bottom:14px'><input type='checkbox' id='epc-3' style='" + cb + "'" + (prev.wa ? " checked" : "") + "><span>Send me updates on WhatsApp <span style='color:#64748b'>(optional)</span></span></label>" +
        "<div style='display:flex;gap:8px;justify-content:flex-end'><button type='button' class='btn sec sm' id='epc-no'>" + esc(opts.no || "Cancel") + "</button><button type='button' class='btn pri sm' id='epc-ok' disabled>Agree</button></div></div>";
      document.body.appendChild(box);
      var b1 = box.querySelector("#epc-1"), b3 = box.querySelector("#epc-3"), ok = box.querySelector("#epc-ok");
      b1.onchange = function () { ok.disabled = !b1.checked; };
      function done(v) { box.remove(); document.removeEventListener("keydown", onKey, true); open = null; resolve(v); }
      function onKey(e) { if (e.key === "Escape") { e.preventDefault(); done(null); } }
      document.addEventListener("keydown", onKey, true);
      box.querySelector("#epc-no").onclick = function () { done(null); };
      box.querySelector("#epc-ok").onclick = function () {
        if (!b1.checked) { b1.focus(); return; }
        var c = { v: VER, at: new Date().toISOString(), wa: !!b3.checked }; keep(c); done(c);
      };
      setTimeout(function () { b1.focus(); }, 30);
    });
    return open;
  }
  window.EP_askConsent = ask;

  function refused() {
    var e = { name: "ConsentRequired", status: 400, message: "Please agree to the Privacy Policy & Terms to continue." };
    return { data: { user: null, session: null }, error: e };
  }
  /* consent for this version on this device, or ask now */
  async function need() { return local() || (await ask()); }

  function withData(creds, c) {
    creds = Object.assign({}, creds || {}); creds.options = Object.assign({}, creds.options || {});
    creds.options.data = Object.assign({}, creds.options.data || {}, meta(c));
    return creds;
  }

  /* after sign-in: save the agreement to the account, or ask once if the account has none for this version */
  var checking = false;
  async function afterSignIn(client, session) {
    if (checking || !session || !session.user) return;
    var um = session.user.user_metadata || {};
    if (um.consent_ver === VER) return;
    checking = true;
    try {
      var c = local();
      if (!c) c = await ask({ no: "Sign out" });
      if (!c) { try { await client.auth.signOut(); } catch (e) {} try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); return; }
      try { await client.auth.updateUser({ data: meta(c) }); } catch (e) {}
      try { await client.rpc("record_consent", { ver_: c.v, wa_: !!c.wa, ua_: String(navigator.userAgent || "").slice(0, 300) }); } catch (e) {}
      try { await client.rpc("set_wa_optout", { off_: !c.wa }); } catch (e) {}
    } finally { checking = false; }
  }

  function wrap(client) {
    if (!client || !client.auth || client.__epConsent) return client;
    client.__epConsent = true;
    var a = client.auth;
    ["signUp", "signInWithOtp"].forEach(function (fn) {
      if (typeof a[fn] !== "function") return;
      var orig = a[fn].bind(a);
      a[fn] = async function (creds) { var c = await need(); if (!c) return refused(); return orig(withData(creds, c)); };
    });
    if (typeof a.signInWithOAuth === "function") {
      var oa = a.signInWithOAuth.bind(a);
      a.signInWithOAuth = async function (creds) { var c = await need(); if (!c) return refused(); return oa(creds); };
    }
    if (client.functions && typeof client.functions.invoke === "function") {
      var fi = client.functions.invoke.bind(client.functions);
      client.functions.invoke = async function (name, o) {
        if (/otp|sign.?up|register|login|create.?account/i.test(String(name))) {
          var c = await need(); if (!c) return { data: null, error: refused().error };
          o = Object.assign({}, o || {});
          if (o.body && typeof o.body === "object" && !(o.body instanceof FormData) && !(o.body instanceof Blob)) o.body = Object.assign({}, o.body, { consent: meta(c) });
        }
        return fi(name, o);
      };
    }
    try {
      a.onAuthStateChange(function (ev, session) { if (session && /SIGNED_IN|INITIAL_SESSION|USER_UPDATED/.test(ev)) setTimeout(function () { afterSignIn(client, session); }, 400); });
    } catch (e) {}
    return client;
  }

  /* direct calls to an OTP / sign-up server function by fetch (not through the client) are gated the same way */
  var F = window.fetch && window.fetch.bind(window);
  if (F) window.fetch = async function (input, init) {
    try {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      if (/\/functions\/v1\/[^?]*(otp|sign.?up|register|create.?account)/i.test(url) && !(init && init.__epc)) {
        var c = await need(); if (!c) return new Response(JSON.stringify({ ok: false, code: "consent_required", error: refused().error.message }), { status: 400, headers: { "Content-Type": "application/json" } });
        if (init && typeof init.body === "string") { try { var b = JSON.parse(init.body); if (b && typeof b === "object") init = Object.assign({}, init, { body: JSON.stringify(Object.assign(b, { consent: meta(c) })) }); } catch (e) {} }
      }
    } catch (e) {}
    return F(input, init);
  };

  var sb = window.supabase;
  if (sb && typeof sb.createClient === "function") {
    var cc = sb.createClient;
    var patched = function () { return wrap(cc.apply(sb, arguments)); };
    try { sb.createClient = patched; } catch (e) {}
    if (sb.createClient !== patched) { try { Object.defineProperty(sb, "createClient", { value: patched, configurable: true, writable: true }); } catch (e) {} }
  }
})();
