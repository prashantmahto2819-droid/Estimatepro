/* Estimate Pro — offline use at site (mines with no network).
   * Install: the app can be installed on the phone / computer (manifest + service worker sw.js).
   * Estimates: the last loaded list is kept on the device (IndexedDB). Without network every save goes to an
     outbox on the device; when the network comes back the outbox is sent to the server (sync).
     If the same estimate was changed on the server meanwhile, the server copy is first kept as a version.
   * Rates (library / group / personal) and the profile are also kept on the device, so amounts stay right offline. */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc;
  S.off = { online: navigator.onLine !== false, pending: 0, syncing: false, installEvt: null, installed: false, update: null, last: null };
  function db() { return U.db(); }

  /* ---------- tiny IndexedDB key-value store ---------- */
  var dbp = null;
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      try { var r = indexedDB.open("ep-offline", 1); r.onupgradeneeded = function () { r.result.createObjectStore("kv"); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }
      catch (e) { rej(e); }
    });
    return dbp;
  }
  function kv(mode, fn) { return idb().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction("kv", mode), st = t.objectStore("kv"), out = fn(st); t.oncomplete = function () { res(out && typeof out === "object" && "result" in out ? out.result : null); }; t.onerror = function () { rej(t.error); }; }); }); }
  function get(k) { return kv("readonly", function (s) { return s.get(k); }).catch(function () { return null; }); }
  function put(k, v) { return kv("readwrite", function (s) { s.put(v, k); }).catch(function (e) { console.warn("offline store", e); return null; }); }
  function del(k) { return kv("readwrite", function (s) { s["delete"](k); }).catch(function () { return null; }); }

  function isNet(err) { var m = String((err && (err.message || err.details || err)) || ""); return !navigator.onLine || /Failed to fetch|NetworkError|Load failed|network|fetch failed|ERR_INTERNET|timeout/i.test(m); }
  function uid() { return S.me && S.me.id; }
  function obKey() { return "outbox:" + uid(); }
  async function outbox() { return (await get(obKey())) || {}; }
  async function setOutbox(o) { await put(obKey(), o); S.off.pending = Object.keys(o).length; U.render(); }

  U.off = {
    isNet: isNet, get: get, put: put,
    /* like put, but a failed write rejects instead of being ignored */
    putStrict: function (k, v) { return kv("readwrite", function (s) { s.put(v, k); }); },
    /* estimates list of one owner, with this device's unsynced changes on top */
    getList: async function (owner) {
      var rows = (await get("est:" + owner)) || null; if (!rows) return null;
      var ob = await outbox();
      Object.keys(ob).forEach(function (id) { var x = ob[id]; if (x.owner !== owner) return; var r = rows.filter(function (y) { return y.id === id; })[0]; if (r) { r.name = x.name; r.gst = x.gst; r.data = x.data; r.updated_at = new Date(x.at).toISOString(); } else if (x.op === "insert") rows.unshift({ id: id, owner: owner, name: x.name, gst: x.gst, data: x.data, created_at: new Date(x.at).toISOString(), updated_at: new Date(x.at).toISOString() }); });
      return rows;
    },
    putList: function (owner, rows) { return put("est:" + owner, rows); },
    /* keep the device copy of one estimate up to date after a save */
    touch: async function (e) { var rows = await get("est:" + e.owner); if (!rows) return; var r = rows.filter(function (y) { return y.id === e.id; })[0]; var d = JSON.parse(JSON.stringify(e.doc)); if (r) { r.name = e.name; r.gst = +d.gst || 0; r.data = d; r.updated_at = new Date().toISOString(); } else rows.unshift({ id: e.id, owner: e.owner, name: e.name, gst: +d.gst || 0, data: d, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }); put("est:" + e.owner, rows); },
    /* a save that could not reach the server */
    queue: async function (e, op) {
      var ob = await outbox(), prev = ob[e.id];
      ob[e.id] = { op: prev && prev.op === "insert" ? "insert" : (op || "update"), owner: e.owner || uid(), name: e.name || "Untitled estimate", gst: +e.doc.gst || 0, data: JSON.parse(JSON.stringify(e.doc)), at: Date.now(), base: prev ? prev.base : (e.srvAt || null) };
      await setOutbox(ob); U.off.touch(e);
      S.off.online = false; schedule(15000);
    },
    pending: function () { return S.off.pending; },
    sync: sync
  };

  /* ---------- sync ---------- */
  var syncT = 0;
  function schedule(ms) { clearTimeout(syncT); syncT = setTimeout(sync, ms); }
  async function sync() {
    if (!uid() || S.off.syncing) return;
    var ob = await outbox(), ids = Object.keys(ob); S.off.pending = ids.length;
    if (!ids.length) return;
    if (!navigator.onLine) { schedule(30000); return; }
    S.off.syncing = true; U.render();
    var done = 0, kept = 0;
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i], x = ob[id], r;
      try {
        if (x.op === "insert") {
          r = await db().from("estimates").insert({ id: id, owner: x.owner, name: x.name, gst: x.gst, data: x.data });
          if (r.error && /duplicate|already exists|23505/i.test(r.error.message || r.error.code || "")) r = await db().from("estimates").update({ name: x.name, gst: x.gst, data: x.data }).eq("id", id);
        } else {
          var cur = await db().from("estimates").select("updated_at,data,name").eq("id", id).maybeSingle();
          if (cur.error) { r = cur; }
          else {
            var srvAt = cur.data ? Date.parse(cur.data.updated_at) : 0;
            if (cur.data && x.base && srvAt > x.base + 60000) {   // changed on the server while this phone was offline: keep that copy as a version
              try { var calc = U.calcOf ? U.calcOf(EP.migrate({ data: cur.data.data, gst: x.gst })) : null; var v = await db().rpc("save_version", { est: id, note: "Server copy before offline changes from " + deviceName() + " were synced", calc: calc, kind: "manual" }); if (!v.error) kept++; } catch (e2) { /* versions not set up */ }
            }
            r = await db().from("estimates").update({ name: x.name, gst: x.gst, data: x.data }).eq("id", id);
          }
        }
      } catch (e) { r = { error: e }; }
      if (r && r.error) { if (isNet(r.error)) { S.off.online = false; break; } console.error("sync", r.error); continue; }
      var now = await outbox(); if (now[id] && now[id].at === x.at) { delete now[id]; await setOutbox(now); }
      var e = (S.est.list || []).filter(function (y) { return y.id === id; })[0]; if (e) e.srvAt = Date.now();
      done++;
    }
    S.off.syncing = false; S.off.pending = Object.keys(await outbox()).length;
    if (done) { S.off.online = true; S.off.last = Date.now(); U.toast("Synced " + done + " estimate" + (done === 1 ? "" : "s") + " from this device" + (kept ? " (" + kept + " server cop" + (kept === 1 ? "y" : "ies") + " kept as versions)" : "")); if (U.logAct) U.logAct("sync", done + " estimate(s)"); }
    if (S.off.pending) schedule(30000);
    U.render();
  }
  function deviceName() { var m = navigator.userAgent.match(/(Android|iPhone|iPad|Windows|Mac|Linux)/); return m ? m[1] : "another device"; }
  window.addEventListener("online", function () { S.off.online = true; U.render(); sync(); if (U.watchEst && uid()) setTimeout(function () { U.watchEst(S.est.owner || uid(), true); }, 1500); });
  window.addEventListener("offline", function () { S.off.online = false; U.render(); });
  setInterval(function () { if (uid() && S.off.pending && navigator.onLine) sync(); }, 60000);
  U.offlineLogin = async function () { S.off.pending = Object.keys(await outbox()).length; if (S.off.pending && navigator.onLine) setTimeout(sync, 2500); };

  /* ---------- rates & profile kept on the device ---------- */
  U.off.saveRates = function () { if (!uid()) return; put("ovr:" + uid(), { shared: S.ovrShared, mine: S.ovrMine, team: S.ovrTeam, at: Date.now() }); };
  U.off.loadRates = async function () { var x = await get("ovr:" + uid()); if (!x) return false; S.ovrShared = x.shared || {}; S.ovrMine = x.mine || {}; S.ovrTeam = x.team || {}; if (U.mergeOvr) U.mergeOvr(); U.render(); return true; };

  /* ---------- status bar ---------- */
  U.statusBar = function () {
    var O = S.off, h = "";
    if (O.update) h += "<div class='offbar upd' role='status'>A new version of Estimate Pro is ready. <button type='button' class='btn pri sm' id='sw-reload'>Reload now</button></div>";
    if (!uid()) return h;
    if (!O.online || !navigator.onLine) h += "<div class='offbar off' role='status'><b>No network — working on this device.</b> Measurements and changes are saved here" + (O.pending ? " (" + O.pending + " estimate" + (O.pending === 1 ? "" : "s") + " waiting)" : "") + " and will sync when the network is back. Login, reviews, sending and admin work need the network.</div>";
    else if (O.pending) h += "<div class='offbar' role='status'>" + (O.syncing ? "Syncing " : "") + O.pending + " estimate" + (O.pending === 1 ? "" : "s") + " saved on this device " + (O.syncing ? "…" : "waiting to sync.") + (O.syncing ? "" : " <button type='button' class='btn sec sm' id='off-sync'>Sync now</button>") + "</div>";
    if (S.lateBooks) h += "<div class='offbar thin' role='status'>Loading MPPWD SOR 2025 and DSR (E&amp;M) 2022 in the background…</div>";
    return h;
  };
  U.installButton = function () {
    if (S.off.installed) return "";
    if (S.off.installEvt) return "<button type='button' class='btn sec sm' id='pwa-install' title='Install Estimate Pro on this phone / computer; it then opens like an app and works without network'>Install app</button>";
    return "";
  };

  /* ---------- install + service worker ---------- */
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); S.off.installEvt = e; U.render(); });
  window.addEventListener("appinstalled", function () { S.off.installed = true; S.off.installEvt = null; U.toast("Estimate Pro installed"); U.render(); });
  try { if (window.matchMedia("(display-mode: standalone)").matches || navigator.standalone) S.off.installed = true; } catch (e) {}
  if ("serviceWorker" in navigator && /^https:|^http:\/\/localhost/.test(location.href) && !window.EP_NO_SW) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").then(function (reg) {
        function watch(w) { if (!w) return; w.addEventListener("statechange", function () { if (w.state === "installed" && navigator.serviceWorker.controller) { S.off.update = w; U.render(); } }); }
        if (reg.waiting && navigator.serviceWorker.controller) { S.off.update = reg.waiting; U.render(); }
        watch(reg.installing); reg.addEventListener("updatefound", function () { watch(reg.installing); });
        setInterval(function () { reg.update().catch(function () {}); }, 3600000);
      }).catch(function (e) { console.warn("service worker", e); });
      var reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", function () { if (reloading || !S.off.update) return; reloading = true; location.reload(); });
    });
  }
  document.addEventListener("click", async function (ev) {
    var t = ev.target.closest && ev.target.closest("button"); if (!t) return;
    if (t.id === "pwa-install" && S.off.installEvt) { var e = S.off.installEvt; S.off.installEvt = null; e.prompt(); try { await e.userChoice; } catch (x) {} U.render(); }
    else if (t.id === "sw-reload" && S.off.update) { S.off.update.postMessage("skipWaiting"); setTimeout(function () { location.reload(); }, 1500); }
    else if (t.id === "off-sync") sync();
  });
})();
