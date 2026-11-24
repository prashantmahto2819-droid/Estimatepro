/* Estimate Pro — devices per licence.
   Every licence works on `profiles.device_limit` devices (1 unless the super admin allows more). The server side is
   server/devices.sql; until it has been run the rpc is missing and this file does nothing.
   This device is known by a random id kept in localStorage (ep_dev). */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc;
  var D = S.dev = { off: false, limits: null, loading: false, last: 0, busy: false };
  function db() { return U.db && U.db(); }
  function devId() { var k = "ep_dev", v = null; try { v = localStorage.getItem(k); } catch (e) {} if (!v || v.length < 12) { v = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8); try { localStorage.setItem(k, v); } catch (e) {} } return v; }
  function label() {
    var ua = navigator.userAgent || "", os = /Windows/i.test(ua) ? "Windows PC" : /Android/i.test(ua) ? (/Mobile/i.test(ua) ? "Android phone" : "Android tablet") : /iPhone/i.test(ua) ? "iPhone" : /iPad/i.test(ua) ? "iPad" : /Mac OS X/i.test(ua) ? "Mac" : /CrOS/i.test(ua) ? "Chromebook" : /Linux/i.test(ua) ? "Linux PC" : "Device";
    var br = /EstimateProDesktop/i.test(ua) ? "Windows app" : /EstimateProAndroid/i.test(ua) ? "Android app" : /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "browser";
    var app = false; try { app = window.matchMedia("(display-mode: standalone)").matches; } catch (e) {}
    return os + " · " + br + (app && br !== "Windows app" ? " (installed app)" : "");
  }
  function ago(t) { var m = Math.max(0, Math.round((Date.now() - Date.parse(t)) / 60000)); return m < 2 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " day(s) ago"; }
  function missing(err) { var m = (err && (err.message || err.code)) || ""; return /PGRST202|42883|Could not find the function|does not exist|schema cache/i.test(String(m) + " " + (err && err.code || "")); }

  async function check(take) {
    if (D.off || D.busy || !db() || !S.me || !S.me.id) return null; if (navigator.onLine === false) return null;
    D.busy = true;
    try {
      var r = await db().rpc("device_check", { p_dev: devId(), p_label: label(), p_take: !!take }); D.last = Date.now();
      if (r.error) { if (missing(r.error)) D.off = true; return null; }
      var x = r.data || {}; D.info = x;
      if (x.ok) hide(); else if (x.reason === "limit" || x.reason === "too_many") show(x);
      return x;
    } catch (e) { return null; } finally { D.busy = false; }
  }
  U.deviceCheck = check;

  function hide() { var o = document.getElementById("dev-wall"); if (o) o.remove(); }
  function show(x) {
    var o = document.getElementById("dev-wall"); if (!o) { o = document.createElement("div"); o.id = "dev-wall"; o.setAttribute("role", "dialog"); o.setAttribute("aria-modal", "true"); o.style.cssText = "position:fixed;inset:0;z-index:99999;background:rgba(15,30,45,.82);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto"; document.body.appendChild(o); }
    var lim = x.limit || 1, list = (x.devices || []).map(function (d) { return "<li><strong>" + esc(d.label || "Device") + "</strong> — last used " + esc(ago(d.last_seen)) + "</li>"; }).join("");
    var many = x.reason === "too_many";
    o.innerHTML = "<div class='panel' style='max-width:460px;width:100%;padding:18px;display:flex;flex-direction:column;gap:10px'><h2 style='margin:0;font-size:19px'>This licence is in use on another device</h2>" +
      "<p style='margin:0'>Your licence allows <strong>" + lim + " device" + (lim > 1 ? "s" : "") + "</strong> at a time. It is now signed in on:</p><ul style='margin:0;padding-left:20px'>" + list + "</ul>" +
      (many ? "<p style='margin:0' class='muted'>The device has been changed three times in the last 24 hours, so it cannot be changed again today. Use the device above, or ask for a multi-device licence.</p>"
            : "<p style='margin:0' class='muted'>You can move the licence to this device — " + (lim > 1 ? "the device used longest ago" : "the other device") + " will be signed out. This can be done three times in 24 hours.</p>") +
      "<div class='row' style='gap:8px;flex-wrap:wrap'>" + (many ? "" : "<button type='button' class='btn' id='dev-take'>Use on this device</button>") + "<button type='button' class='btn sec' id='dev-more'>Ask for more devices</button><button type='button' class='btn ghost' id='dev-out'>Sign out</button></div>" +
      "<p class='muted' style='margin:0;font-size:12px'>Need the app on your phone and your computer together? Ask for a multi-device licence.</p></div>";
  }

  document.addEventListener("click", async function (e) {
    var t = e.target.closest ? e.target.closest("button,[data-udevs],[data-udevrm]") : null; if (!t) return; var ds = t.dataset || {};
    if (t.id === "dev-take") { t.disabled = true; t.textContent = "Moving…"; var x = await check(true); if (x && x.ok) { U.toast("This device now holds the licence."); if (U.logAct) U.logAct("device", "Moved the licence to " + label()); } else if (!x) { t.disabled = false; t.textContent = "Use on this device"; U.toast("Could not reach the server — try again."); } }
    else if (t.id === "dev-out") { try { await db().auth.signOut(); } catch (er) {} location.reload(); }
    else if (t.id === "dev-more") { if (U.logAct) U.logAct("device_request", "Asked for a multi-device licence from " + label()); t.disabled = true; t.textContent = "Request noted"; U.toast("Your request has been noted for the administrator. Please also call or message them."); }
    else if (ds.udevs) { openDevs(ds.udevs); }
    else if (ds.udevrm) { var p = ds.udevrm.split("|"); if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again"; return; } var r = await db().rpc("admin_device_remove", { p_uid: p[0], p_dev: p[1] }); if (U.fail && U.fail(r, "Couldn't remove the device.")) return; D.limits = null; openDevs(p[0]); }
    else if (t.id === "udev-close") { var m = document.getElementById("udev-dlg"); if (m) m.remove(); U.render(); }
  });
  document.addEventListener("change", async function (e) {
    var t = e.target, ds = t.dataset || {}; if (!ds.udevlim) return;
    var r = await db().rpc("admin_set_device_limit", { p_uid: ds.udevlim, p_n: +t.value }); if (U.fail && U.fail(r, "Couldn't change the number of devices.")) return;
    if (D.limits && D.limits[ds.udevlim]) D.limits[ds.udevlim].limit = +t.value; else D.limits = null; U.toast(+t.value === 1 ? "Single device" : "Allowed on " + t.value + " devices"); U.render();
  });

  /* ---------- super admin: Users tab ---------- */
  async function loadLimits() { if (D.loading || D.off || !db()) return; D.loading = true; try { var r = await db().rpc("admin_device_limits"); if (r.error) { if (missing(r.error)) D.off = true; D.limits = {}; } else D.limits = r.data || {}; } catch (e) { D.limits = {}; } D.loading = false; U.render(); }
  var cell0 = U.phoneCell;
  U.phoneCell = function (u) {
    var h = cell0 ? cell0(u) : ""; if (D.off || !S.me || !S.me.isOwner) return h;
    if (!D.limits) { loadLimits(); return h; }
    var x = D.limits[u.id] || { limit: 1, n: 0 }, opts = [1, 2, 3, 4, 5, 10, 20]; if (opts.indexOf(x.limit) < 0) opts.push(x.limit);
    return h + "<br><span style='display:inline-flex;gap:4px;align-items:center;margin-top:3px'><select class='in small' data-udevlim='" + esc(u.id) + "' title='On how many devices this user may be signed in at a time' aria-label='Devices allowed for " + esc(u.full_name || "this user") + "'>" + opts.sort(function (a, b) { return a - b; }).map(function (n) { return "<option value='" + n + "'" + (n === x.limit ? " selected" : "") + ">" + (n === 1 ? "1 device" : n + " devices") + "</option>"; }).join("") + "</select><button type='button' class='btn ghost sm' data-udevs='" + esc(u.id) + "' title='See and remove the devices in use'>" + x.n + " in use</button></span>";
  };
  async function openDevs(uid) {
    var r = await db().rpc("admin_devices", { p_uid: uid }); if (U.fail && U.fail(r, "Couldn't load the devices.")) return;
    var x = r.data || {}, u = ((S.est && S.est.usersInfo) || []).filter(function (q) { return q.id === uid; })[0] || {}, m = document.getElementById("udev-dlg"); if (!m) { m = document.createElement("div"); m.id = "udev-dlg"; m.style.cssText = "position:fixed;inset:0;z-index:9990;background:rgba(15,30,45,.55);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto"; document.body.appendChild(m); }
    var KN = { add: "New device", takeover: "Licence moved to", remove: "Removed by the user", admin_remove: "Removed by admin", limit: "Devices allowed set to" };
    m.innerHTML = "<div class='panel' style='max-width:520px;width:100%;padding:16px;display:flex;flex-direction:column;gap:10px;max-height:90vh;overflow:auto'><div class='row' style='align-items:center'><h3 class='grow' style='margin:0'>Devices — " + esc(u.full_name || "user") + "</h3><button type='button' class='btn ghost sm' id='udev-close'>Close</button></div>" +
      ((x.devices || []).length ? "<div class='tw'><table class='t'><thead><tr><th>Device</th><th>First used</th><th>Last used</th><th></th></tr></thead><tbody>" + x.devices.map(function (d) { return "<tr><td>" + esc(d.label || "Device") + "</td><td>" + esc(new Date(d.first_seen).toLocaleDateString("en-IN")) + "</td><td>" + esc(ago(d.last_seen)) + "</td><td><button type='button' class='btn ghost sm' data-udevrm='" + esc(uid + "|" + d.id) + "'>Remove</button></td></tr>"; }).join("") + "</tbody></table></div>" : "<p class='muted' style='margin:0'>No device has signed in since device limits were switched on.</p>") +
      ((x.log || []).length ? "<details><summary>History (last 30)</summary><ul style='margin:6px 0 0;padding-left:20px;font-size:13px'>" + x.log.map(function (l) { return "<li>" + esc(new Date(l.at).toLocaleString("en-IN")) + " — " + esc(KN[l.kind] || l.kind) + (l.label ? " " + esc(l.label) : "") + "</li>"; }).join("") + "</ul></details>" : "") + "</div>";
  }

  /* ---------- when to check ---------- */
  var n0 = U.loadNotice; U.loadNotice = async function () { var r = n0 ? await n0.apply(this, arguments) : undefined; check(false); return r; };
  setInterval(function () { if (document.visibilityState !== "hidden" && Date.now() - D.last > 4 * 60000) check(false); }, 60000);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && Date.now() - D.last > 60000) check(false); });
  window.addEventListener("online", function () { check(false); });
  setTimeout(function () { check(false); }, 6000);
})();
