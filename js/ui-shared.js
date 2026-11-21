/* Estimate Pro — things the server shares with every user (server side: server/shared.sql; until that has been run
   the tables are missing and this file does nothing):
   1) shared library — blocks and hatch patterns published by an administrator;
   2) module switches — tabs the super admin has switched off for ordinary users. */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc, CAD = EP.cad;
  var SH = S.shared = { off: false, blocks: null, pats: null, sw: null, swAt: 0, tabs: {} };
  function db() { return U.db && U.db(); }
  function gone(err) { var m = String((err && (err.message || "")) || "") + " " + String((err && err.code) || ""); return /PGRST205|PGRST202|42P01|42883|does not exist|schema cache|Could not find/i.test(m); }
  function admin() { return !!(S.me && (S.me.isOwner || S.me.role === "admin" || S.me.role === "super_admin")); }

  /* ---------- shared library ---------- */
  async function loadLib(force) { if (SH.off || !db() || !S.me || !S.me.id) return; if (SH.blocks && !force) return;
    try { var r = await db().from("shared_lib").select("kind,name,data").in("kind", ["block", "pat"]); if (r.error) { if (gone(r.error)) SH.off = true; return; }
      SH.blocks = {}; SH.pats = {}; (r.data || []).forEach(function (x) { if (x.kind === "block") SH.blocks[x.name] = x.data; else SH.pats[x.name] = x.data; });
      if (CAD && CAD.HATCH) Object.keys(SH.pats).forEach(function (k) { var p = SH.pats[k]; if (p && Array.isArray(p.f) && (!CAD.HATCH[k] || CAD.HATCH[k].own)) CAD.HATCH[k] = { d: p.d || k, f: p.f, own: true }; }); } catch (e) {} }
  U.sharedLib = function () { return SH; }; U.loadSharedLib = loadLib;
  if (CAD && CAD.commands) {
    var cmd = function (n, a, f) { CAD.commands[n] = { fn: f }; (a || []).forEach(function (x) { if (!CAD.commands[x] && !CAD.aliases[x]) CAD.aliases[x] = n; }); };
    CAD.HOOKS.wire.push(function () { loadLib(false); });
    cmd("BLOCKSHARE", ["SHAREBLOCK", "PUBLISHBLOCK"], async function (ed) {
      if (!admin()) throw new Error("Only an administrator can publish a block for all users."); if (!db() || SH.off) throw new Error("The shared library is not set up on the server yet (server/shared.sql has to be run once).");
      var names = Object.keys(ed.doc.d.blocks || {}).filter(function (n) { return n[0] !== "*" && !/^(EL|SEC|SCH|DET)-/.test(n); }); if (!names.length) throw new Error("No blocks in this drawing yet.");
      var name = String((await ed.getText("Which block to publish for all users? (" + names.slice(0, 12).join(", ") + (names.length > 12 ? "…" : "") + ")", { def: names[0] })) || "").trim(), B = ed.doc.d.blocks[name]; if (!B) throw new Error("Block " + name + " not found");
      var need = {}, walk = function (ents, depth) { ents.forEach(function (e) { if (e.t === "insert" && depth < 6 && ed.doc.d.blocks[e.block] && !need[e.block]) { need[e.block] = ed.doc.d.blocks[e.block]; walk(need[e.block].ents, depth + 1); } }); }; walk(B.ents, 0);
      var r = await db().rpc("shared_put", { p_kind: "block", p_name: name, p_data: { base: B.base, ents: B.ents, sub: need, units: (ed.doc.d.units && ed.doc.d.units.disp) || "mm" } }); if (r.error) { if (gone(r.error)) { SH.off = true; throw new Error("The shared library is not set up on the server yet."); } throw new Error(r.error.message || "Could not publish the block."); }
      await loadLib(true); ed.say("Block " + name + " is now in the shared library — every user finds it under Block library.");
    });
    cmd("HATCHSHARE", ["SHAREHATCH", "PUBLISHHATCH"], async function (ed) {
      if (!admin()) throw new Error("Only an administrator can publish hatch patterns for all users."); if (!db() || SH.off) throw new Error("The shared library is not set up on the server yet (server/shared.sql has to be run once).");
      var own = Object.keys(CAD.HATCH).filter(function (k) { return CAD.HATCH[k].own && !(SH.pats && SH.pats[k]); }); if (!own.length) throw new Error("No patterns of your own to publish — load a .pat file first (Load hatch).");
      var n = 0; for (var i = 0; i < own.length; i++) { var k = own[i], r = await db().rpc("shared_put", { p_kind: "pat", p_name: k, p_data: { d: CAD.HATCH[k].d, f: CAD.HATCH[k].f } }); if (r.error) { if (gone(r.error)) { SH.off = true; throw new Error("The shared library is not set up on the server yet."); } throw new Error(r.error.message || "Could not publish " + k); } n++; }
      await loadLib(true); ed.say(n + " hatch pattern(s) published for all users: " + own.slice(0, 8).join(", ") + (own.length > 8 ? "…" : "") + ".");
    });
    /* Block library: the device's own blocks and the shared ones together */
    var lib0 = CAD.blockLib; CAD.blockLib = function () { var o = Object.assign({}, SH.blocks || {}), d = lib0 ? lib0() : {}; Object.keys(d).forEach(function (k) { o[k] = d[k]; }); return o; };
    var bl0 = CAD.commands.BLOCKLIB && CAD.commands.BLOCKLIB.fn;
    if (bl0) CAD.commands.BLOCKLIB.fn = async function (ed) { await loadLib(false); var shared = SH.blocks || {}, had = null; try { had = localStorage.getItem("ep_blocklib"); } catch (e) {}
      var dev = {}; try { dev = JSON.parse(had || "{}") || {}; } catch (e) {} var add = Object.keys(shared).filter(function (k) { return !dev[k]; });
      if (!add.length) return bl0(ed);
      /* show the shared ones to the device library for this call only, then put the device library back as it was */
      var merged = Object.assign({}, dev); add.forEach(function (k) { merged[k] = shared[k]; }); try { localStorage.setItem("ep_blocklib", JSON.stringify(merged)); } catch (e) { return bl0(ed); }
      try { return await bl0(ed); } finally { try { var now = JSON.parse(localStorage.getItem("ep_blocklib") || "{}") || {}; add.forEach(function (k) { delete now[k]; }); localStorage.setItem("ep_blocklib", JSON.stringify(now)); } catch (e) {} } };
  }

  /* ---------- module switches ---------- */
  async function loadSw(force) { if (SH.off || !db() || !S.me || !S.me.id) return; if (!force && Date.now() - SH.swAt < 5 * 60000 && SH.sw) return;
    try { var r = await db().from("ep_switches").select("key,off,note"); SH.swAt = Date.now(); if (r.error) { if (gone(r.error)) SH.off = true; return; } var o = {}; (r.data || []).forEach(function (x) { if (x.off) o[x.key] = x.note || true; }); var ch = JSON.stringify(o) !== JSON.stringify(SH.sw || {}); SH.sw = o; if (ch) apply(); } catch (e) {} }
  function navEls() { return document.querySelectorAll("[data-tab],[data-nav],[data-go]"); }
  function keyOf(el) { var d = el.dataset || {}; return d.tab || d.nav || d.go || ""; }
  function apply() { var off = SH.sw || {}, own = !!(S.me && S.me.isOwner);
    navEls().forEach(function (el) { var k = keyOf(el); if (!k) return; var lbl = (el.textContent || "").trim().slice(0, 30); if (lbl && !SH.tabs[k]) SH.tabs[k] = lbl; if (el.closest && el.closest("#sw-panel")) return; var hide = !!off[k] && !own; if (hide) { el.hidden = true; el.dataset.swHid = "1"; } else if (el.dataset.swHid) { el.hidden = false; delete el.dataset.swHid; } });
    if (!own && S.tab && off[S.tab]) { var was = S.tab; S.tab = SH.lastOk && !off[SH.lastOk] ? SH.lastOk : (Object.keys(SH.tabs).filter(function (k) { return !off[k]; })[0] || S.tab); if (S.tab !== was) { U.toast("That part of the app is switched off by the administrator" + (typeof off[was] === "string" ? " — " + off[was] : "") + "."); if (U.render) U.render(); } }
    else if (S.tab && !off[S.tab]) SH.lastOk = S.tab; }
  U.applySwitches = apply;
  var mo = null; function watch() { if (mo || !window.MutationObserver) return; var t = 0; mo = new MutationObserver(function () { if (t) return; t = setTimeout(function () { t = 0; if (SH.sw) apply(); }, 120); }); mo.observe(document.body, { childList: true, subtree: true }); }
  var top0 = U.adminTop;
  U.adminTop = function () { var h = top0 ? top0.apply(this, arguments) : ""; if (SH.off || !S.me || !S.me.isOwner) return h; if (!SH.sw) { loadSw(true).then(function () { if (U.render) U.render(); }); return h; }
    try { apply(); } catch (e) {}   /* also collects the names of the tabs on the page */
    var keys = Object.keys(Object.assign({}, SH.tabs, SH.sw)).sort();
    return h + "<details id='sw-panel' class='panel' style='padding:10px 12px;margin:8px 0'><summary><strong>Modules</strong> — " + Object.keys(SH.sw).length + " switched off for users</summary><p class='muted' style='margin:6px 0;font-size:13px'>A module that is switched off disappears from the menu of every user except you. Use it for parts that are not ready or not sold yet.</p><div class='row' style='gap:6px;flex-wrap:wrap'>" +
      keys.map(function (k) { var on = !SH.sw[k]; return "<label class='badge' style='display:inline-flex;gap:6px;align-items:center;padding:6px 10px;cursor:pointer'><input type='checkbox' data-swkey='" + esc(k) + "'" + (on ? " checked" : "") + "> " + esc(SH.tabs[k] || k) + "</label>"; }).join("") +
      "</div><div class='row' style='gap:6px;margin-top:8px;align-items:center'><input class='in small' id='sw-new' placeholder='Module name (for one not listed)' style='max-width:240px'><button type='button' class='btn sec sm' id='sw-add'>Switch off</button></div></details>"; };
  document.addEventListener("change", async function (e) { var t = e.target, k = t.dataset && t.dataset.swkey; if (!k) return; var r = await db().rpc("admin_set_switch", { p_key: k, p_off: !t.checked }); if (U.fail && U.fail(r, "Couldn't change the module.")) { t.checked = !t.checked; return; } await loadSw(true); U.toast((SH.tabs[k] || k) + (t.checked ? " is on for everyone" : " is switched off for users")); if (U.render) U.render(); });
  document.addEventListener("click", async function (e) { var t = e.target; if (t.id !== "sw-add") return; var v = ((document.getElementById("sw-new") || {}).value || "").trim(); if (!v) return; var r = await db().rpc("admin_set_switch", { p_key: v, p_off: true }); if (U.fail && U.fail(r, "Couldn't switch it off.")) return; await loadSw(true); if (U.render) U.render(); });

  var n1 = U.loadNotice; U.loadNotice = async function () { var r = n1 ? await n1.apply(this, arguments) : undefined; loadSw(false); loadLib(false); watch(); return r; };
  setInterval(function () { if (document.visibilityState !== "hidden") loadSw(false); }, 5 * 60000);
  setTimeout(function () { loadSw(false); watch(); }, 7000);
})();
