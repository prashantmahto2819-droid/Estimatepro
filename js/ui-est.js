/* Estimate Pro — estimates: projects, parts, items, measurement sheets, header, abstract preview, export */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc, inr = U.inr;
  function db() { return U.db(); }
  function doc() { return S.est.cur ? S.est.cur.doc : null; }
  function ro() { return !S.est.cur || (S.est.owner !== S.me.id && !S.me.isOwner); }
  function findItem(id) { var d = doc(); return d ? d.items.filter(function (i) { return i.id === id; })[0] : null; }
  function curPart() { var d = doc(); if (!d) return null; if (!d.parts.some(function (p) { return p.id === S.est.part; })) S.est.part = d.parts[0].id; return S.est.part; }

  /* ---------- loading & saving ---------- */
  function rowToEst(x) { return { id: x.id, owner: x.owner, name: x.name, created: Date.parse(x.created_at), updated: Date.parse(x.updated_at), srvAt: Date.parse(x.updated_at), doc: EP.migrate(x) }; }
  var estReq = 0;
  U.watchEst = async function (owner, keepSel) {
    var changed = owner !== S.est.lastOwner;
    S.est.owner = owner; if (changed && !keepSel) S.est.selId = null; S.est.lastOwner = owner;
    var my = ++estReq;
    var r = await db().from("estimates").select("*").eq("owner", owner).order("created_at", { ascending: false });
    if (my !== estReq) return;
    if (r.error && U.off && U.off.isNet(r.error)) { var cached = await U.off.getList(owner); if (my !== estReq) return; if (cached) { r = { data: cached, error: null }; S.off.online = false; } }
    else if (!r.error && U.off) { if (U.off.pending()) { await U.off.sync(); var r2 = await db().from("estimates").select("*").eq("owner", owner).order("created_at", { ascending: false }); if (!r2.error) r = r2; if (my !== estReq) return; } U.off.putList(owner, r.data); }
    if (U.fail(r, "Couldn't load estimates. Reload to try again.")) return;
    S.est.list = r.data.map(rowToEst);
    if (owner === S.me.id) S.est.mine = S.est.list;
    if (!S.est.list.some(function (x) { return x.id === S.est.selId; })) S.est.selId = S.est.list.length ? S.est.list[0].id : null;
    pick(); U.render();
    if (owner === S.me.id && S.me.isOwner) U.loadUsers();
  };
  function pick() { var f = S.est.list.filter(function (x) { return x.id === S.est.selId; })[0]; S.est.cur = f || null; S.est.part = f ? f.doc.parts[0].id : null; S.est.open = {}; }
  var saveT = 0;
  function save(now) {
    var e = S.est.cur; if (!e || ro()) return; clearTimeout(saveT);
    saveT = setTimeout(async function () {
      saveT = 0; var d = e.doc;
      var r = await db().from("estimates").update({ name: e.name || "Untitled estimate", gst: +d.gst || 0, data: d }).eq("id", e.id);
      if (r.error && U.off && U.off.isNet(r.error)) { await U.off.queue(e); var so = document.getElementById("save-state"); if (so) so.textContent = "Saved on this device (no network)"; return; }
      if (U.fail(r, "Couldn't save. Check your connection.")) return;
      if (U.off) U.off.touch(e);
      e.updated = Date.now(); e.srvAt = Date.now(); if (U.auditTick) U.auditTick(e); var st = document.getElementById("save-state"); if (st) st.textContent = "Saved";
    }, now ? 0 : 600);
    var st = document.getElementById("save-state"); if (st) st.textContent = "Saving…";
  }
  function change(fn, rerender) { if (ro()) return; fn(doc()); save(); if (rerender !== false) U.render(); }
  /* One SOR item (or one NS-library item) only once per part; the same item may repeat in other parts. */
  function dupe(d, part, b, c, libId, exceptId) {
    return (d.items || []).filter(function (i) { return i.part === part && i.id !== exceptId && (b === "x" ? (libId && i.b === "x" && i.x && i.x.libId === libId) : (i.b === b && i.c === c)); })[0] || null;
  }
  function dupeMsg(d, it) { return (it.b === "x" ? "This NS item" : "Item " + it.c) + " is already in " + partName(d, it.part) + " (Sl " + EP.slOf(d, it) + "). Opened it — add more measurement rows there instead."; }
  U.saveNow = async function () { var e = S.est.cur; if (!e || ro()) return; clearTimeout(saveT); saveT = 0; var r = await db().from("estimates").update({ name: e.name || "Untitled estimate", gst: +e.doc.gst || 0, data: e.doc }).eq("id", e.id); if (r.error && U.off && U.off.isNet(r.error)) { await U.off.queue(e); return; } if (!r.error) { if (U.off) U.off.touch(e); e.srvAt = Date.now(); if (U.auditTick) U.auditTick(e); var st = document.getElementById("save-state"); if (st) st.textContent = "Saved"; } };
  U.est = { doc: doc, change: change, findItem: findItem, ro: ro, curPart: curPart, dupe: dupe, dupeMsg: dupeMsg };
  async function newEstimate(name, d) {
    var r = await db().from("estimates").insert({ name: name, gst: d.gst, data: d, owner: S.me.id }).select("id").single();
    if (r.error && U.off && U.off.isNet(r.error)) {   // no network: make it on this device, it is sent to the server on sync
      var nid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, function () { return (Math.random() * 16 | 0).toString(16); });
      var ne = { id: nid, owner: S.me.id, name: name, created: Date.now(), updated: Date.now(), srvAt: null, doc: d };
      await U.off.queue(ne, "insert"); S.est.list.unshift(ne); if (S.est.owner === S.me.id) S.est.mine = S.est.list;
      S.est.selId = nid; S.est.pickOpen = false; S.est.sub = "items"; pick(); U.render(); U.toast("Created " + name + " on this device — it will sync when the network is back"); return nid;
    }
    if (U.fail(r, "Couldn't create the estimate.")) return;
    if (U.logAct) U.logAct("est_new", name);
    S.est.selId = r.data.id; S.est.pickOpen = false; S.est.lastOwner = S.me.id; S.est.sub = "items"; await U.watchEst(S.me.id, true); U.toast("Created " + name);
    return r.data.id;
  }
  /* used by the Design Studio "add quantities" destinations */
  U.est.create = newEstimate;
  U.est.newDoc = function (firmId) { return EP.newDoc(defaults(firmId)); };
  U.est.select = async function (id) {
    if (S.est.owner !== S.me.id) { S.est.selId = id; await U.watchEst(S.me.id, true); }
    else { S.est.selId = id; pick(); }
    return S.est.cur && S.est.cur.id === id;
  };
  /* ---------- copy an estimate (reuse items, measurements, header) ---------- */
  function copyPanel(e) {
    if (!S.est.copyOpen) return "";
    var mine = S.est.owner === S.me.id;
    return '<form class="panel copy-box" id="copy-form" novalidate><h3 style="margin:0">Copy this estimate</h3>' +
      '<p class="muted" style="margin:0;font-size:13px">A new estimate is created in ' + (mine ? "your projects" : "<strong>your</strong> projects (the original stays with its owner)") + ' with the same parts, items, rates entered for this estimate, NS item analyses, header, signatures and GST. Change what is different and keep the rest.</p>' +
      '<label class="fld"><span class="lbl">Name of the new estimate</span><input class="in" id="copy-name" value="' + esc("Copy of " + (e.name || "estimate")) + '" required></label>' +
      '<label class="row" style="gap:8px;align-items:center"><input type="checkbox" id="copy-q" checked> Keep quantities and measurement sheets</label>' +
      '<label class="row" style="gap:8px;align-items:center"><input type="checkbox" id="copy-work"> Keep "Name of work" in the header</label>' +
      '<div class="row" style="gap:8px"><button class="btn pri" type="submit">Create copy</button><button class="btn ghost" type="button" id="copy-cancel">Cancel</button></div></form>';
  }
  U.cloneDoc = function (src, keepQ, keepWork) {
    var d = JSON.parse(JSON.stringify(src)), map = {};
    d.items.forEach(function (it) { var n = EP.uid(); map[it.id] = n; it.id = n; });
    d.items.forEach(function (it) {
      if (!keepQ) { it.q = ""; it.meas = []; delete it.rchk; return; }
      (it.meas || []).forEach(function (r) { if (r.ref) r.ref = map[r.ref] || ""; });
      if (it.rchk && it.rchk.ref) it.rchk.ref = map[it.rchk.ref] || "";
    });
    d.items.forEach(function (it) { if (it.x && it.x.libId) delete it.x.libId; });
    if (!keepWork && d.header) d.header.work = "";
    return d;
  };
  async function copyEstimate() {
    var e = S.est.cur; if (!e) return;
    var nm = (document.getElementById("copy-name") || {}).value || "", keepQ = (document.getElementById("copy-q") || {}).checked, keepW = (document.getElementById("copy-work") || {}).checked;
    nm = nm.trim() || "Copy of " + (e.name || "estimate");
    var d = U.cloneDoc(e.doc, keepQ, keepW);
    S.est.copyOpen = false;
    await newEstimate(nm, d);
    var st = document.getElementById("save-state"); if (st) st.textContent = "Saved";
  }
  function defaults(firmId) {
    var d = S.me.defaults || {}, f = firmId ? firms().filter(function (x) { return x.id === firmId; })[0] : null;
    if (f) return { header: Object.assign({}, f.header, { work: "" }), signs: f.signs, gst: f.gst };
    return { header: d.header, signs: d.signs, gst: d.gst };
  }
  /* ---------- saved firms / letter-heads (stored in the user's profile) ---------- */
  function firms() { return ((S.me.defaults || {}).firms || []).slice(); }
  function firmBox(d, R) {
    var F = firms(), h = '<div class="firm-box"><div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end"><div class="grow" style="min-width:220px"><h3 style="margin:0 0 4px">Saved firms / letter-heads</h3><p class="muted" style="margin:0;font-size:13px">Save this header (organisation, office, project, signatures and GST) under a firm name and apply it to any estimate in one click.</p></div>';
    if (F.length) h += '<label class="fld" style="min-width:220px"><span class="lbl">Firm</span><select class="in" id="firm-sel">' + F.map(function (f) { return '<option value="' + esc(f.id) + '">' + esc(f.name) + "</option>"; }).join("") + "</select></label>" + (R ? "" : '<button type="button" class="btn sec sm" id="firm-apply">Apply to this estimate</button><button type="button" class="btn ghost sm" id="firm-del">Delete firm</button>');
    if (!R) h += '<form id="firm-form" class="row" style="gap:6px"><input class="in" id="firm-name" placeholder="Firm name, e.g. ' + esc((d.header.org || "SECL Gevra").slice(0, 30)) + '" aria-label="Firm name" required><button class="btn pri sm" type="submit">Save current header as firm</button></form>';
    return h + "</div></div>";
  }
  async function saveFirms(list, msg) {
    var def = Object.assign({}, S.me.defaults || {}, { firms: list });
    var r = await db().from("profiles").update({ defaults: def }).eq("id", S.me.id);
    if (U.fail(r, "Couldn't save the firm.")) return; S.me.defaults = def; U.toast(msg); U.render();
  }

  /* ---------- project bar: owner (super admin) + searchable project picker ---------- */
  function projBar() {
    var P = S.est, cur = P.cur, h = '<div class="panel proj-bar">';
    if ((S.me.isOwner || S.me.groupAdmin) && P.users.length > 1) {
      var info = {}; (P.usersInfo || []).forEach(function (u) { info[u.id] = u; });
      h += '<label class="fld pb-owner"><span class="lbl">Projects of</span><select id="est-owner" class="in">' + P.users.map(function (u) { var n = info[u] ? info[u].estimates : null; return '<option value="' + esc(u) + '"' + (u === P.owner ? " selected" : "") + ">" + esc((u === S.me.id ? "Me (" + (S.me.name || "you") + ")" : U.nameOf(u)) + (n != null ? " · " + n : "")) + "</option>"; }).join("") + "</select></label>";
    }
    h += '<div class="pb-pick"><span class="lbl">Project</span><button type="button" class="in pb-btn" id="proj-btn" aria-haspopup="listbox" aria-expanded="' + !!P.pickOpen + '"><span class="pb-name">' + (cur ? esc(cur.name || "Untitled estimate") : (P.list.length ? "Choose a project…" : "No projects yet")) + '</span><span class="muted pb-meta">' + (P.list.length ? P.list.length + " project" + (P.list.length > 1 ? "s" : "") : "") + ' ▾</span></button>';
    if (P.pickOpen) {
      var q = (P.pq || "").toLowerCase(), list = P.list.filter(function (e) { return !q || (e.name || "").toLowerCase().indexOf(q) >= 0 || ((e.doc.header || {}).work || "").toLowerCase().indexOf(q) >= 0; });
      h += '<div class="proj-pop" role="dialog" aria-label="Projects">';
      if (P.list.length > 5) h += '<input class="in" id="proj-q" placeholder="Search projects…" autocomplete="off" value="' + esc(P.pq || "") + '">';
      h += '<div class="pp-list" role="listbox">' + (list.length ? list.map(function (e) { var T = EP.totals(e.doc); return '<button type="button" role="option" data-est="' + esc(e.id) + '" aria-selected="' + (e.id === P.selId) + '"><strong>' + esc(e.name || "Untitled estimate") + '</strong><span class="muted">' + e.doc.items.length + " items · " + e.doc.parts.length + " part" + (e.doc.parts.length > 1 ? "s" : "") + " · ₹" + inr(T.aT, 0) + (e.updated ? " · " + U.when(new Date(e.updated).toISOString()) : "") + "</span></button>"; }).join("") : '<div class="muted" style="padding:8px">' + (P.list.length ? "No project matches." : "No projects yet.") + "</div>") + "</div>";
      if (P.owner === S.me.id) h += '<form id="new-est" class="row pp-new" style="gap:8px"><input id="new-name" class="in grow" placeholder="New estimate name" aria-label="New estimate name" required>' + (firms().length ? '<select class="in" id="new-firm" aria-label="Header" style="max-width:180px"><option value="">My default header</option>' + firms().map(function (f) { return '<option value="' + esc(f.id) + '">' + esc(f.name) + "</option>"; }).join("") + "</select>" : "") + '<button class="btn pri sm" type="submit">Create</button></form>' + (!P.list.length ? '<button type="button" class="btn sec sm" id="mk-example" style="white-space:normal;height:auto;text-align:left;padding:6px 10px">Create example: weigh-bridge (Part A + Part B)</button>' : "");
      h += "</div>";
    }
    h += "</div>";
    if (P.owner === S.me.id) h += '<button type="button" class="btn pri" id="proj-new">+ New estimate</button>';
    return h + "</div>";
  }
  function openPicker(focusNew) { S.est.pickOpen = true; U.render(); setTimeout(function () { var n = document.getElementById(focusNew ? "new-name" : (document.getElementById("proj-q") ? "proj-q" : "new-name")); if (n) n.focus(); }, 30); }
  document.addEventListener("mousedown", function (e) { if (S.est && S.est.pickOpen && !(e.target.closest && e.target.closest(".pb-pick,#proj-new"))) { S.est.pickOpen = false; var pp = document.querySelector(".proj-pop"); if (pp) pp.remove(); var b = document.getElementById("proj-btn"); if (b) b.setAttribute("aria-expanded", "false"); } });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && S.est && S.est.pickOpen) { S.est.pickOpen = false; U.render(); } });

  /* ---------- views ---------- */
  U.views.estimates = function () {
    var h = '<div class="est-grid">' + projBar() + "<section class='ed'>";
    var e = S.est.cur;
    if (!e) return h + '<div class="panel empty">' + (S.est.list.length ? "Pick a project from the list above." : "No projects yet. Create one with “+ New estimate” above.") + '</div></section></div>';
    var d = e.doc, T = EP.totals(d), sub = S.est.sub;
    h += '<div class="row ed-top"><div class="grow" style="min-width:0"><div class="lbl">' + (S.est.owner === S.me.id ? "My project" : "Project of " + esc(U.nameOf(S.est.owner))) + ' · <span id="save-state">' + (ro() ? "Read-only" : (S.off && (!S.off.online || S.off.pending) ? "Saved on this device" : "Saved")) + '</span></div><input id="est-name" class="in title-in" value="' + esc(e.name) + '" aria-label="Estimate name"' + (ro() ? " disabled" : "") + "></div>" + (U.sendButton ? U.sendButton() : "") + (S.est.copyOpen ? "" : '<button class="btn sec sm" id="copy-est" type="button">Copy estimate</button>') + (ro() ? "" : '<button class="btn ghost sm" id="del-est" type="button">Delete estimate</button>') + "</div>" + copyPanel(e);
    if (U.sendPanel) h += U.sendPanel();
    h += '<div class="stats"><div class="stat"><div class="lbl">Estimate cost (SOR)</div><div class="v">₹' + inr(T.s) + '</div></div><div class="stat"><div class="lbl">Updated cost</div><div class="v">₹' + inr(T.a) + '</div></div><div class="stat"><div class="lbl">GST ' + esc(d.gst) + '%</div><div class="v">₹' + inr(T.ag) + '</div></div><div class="stat"><div class="lbl">Grand total (updated)</div><div class="v">₹' + inr(T.aT) + "</div></div></div>";
    h += '<div class="seg subtabs" role="group" aria-label="Estimate sections">' + [["items", "Items & measurement"], ["sugg", "Suggested items by work type"], ["header", "Header, parts & GST"], ["abstract", "Abstract"], ["check", "Analysis check"], ["versions", "Versions & review"], ["history", "History"], ["export", "Export to Excel"]].map(function (s) { return '<button type="button" data-sub="' + s[0] + '" aria-pressed="' + (sub === s[0]) + '">' + s[1] + "</button>"; }).join("") + "</div>";
    if (sub === "header") h += viewHeader(d); else if (sub === "check" && U.anCheckView) h += U.anCheckView(d); else if (sub === "abstract") h += viewAbstract(d); else if (sub === "export") h += viewExport(d); else if (sub === "sugg" && U.suggView) h += U.suggView(d); else if (sub === "versions" && U.versionsView) h += U.versionsView(d); else if (sub === "history" && U.historyView) h += U.historyView(d); else h += viewItems(d);
    return h + "</section></div>";
  };

  /* ----- items & measurement ----- */
  /* ready rows for common shapes: [menu label, details, No., L, B, D/H, Factor] — the user overwrites the example sizes */
  var SHAPES = [
    ["Triangle — ½ × base × height", "Triangle (base × height × ½)", "1", "3", "2", "", "0.5"],
    ["Circle — area, π d² / 4", "Circular area, dia 1.2 m (L = B = dia)", "1", "1.2", "1.2", "", "pi/4"],
    ["Trapezium — (a + b) / 2 × height", "Trapezium, parallel sides 3 m and 5 m, height 4 m", "1", "(3+5)/2", "4", "", ""],
    ["Cylinder / round column — π d² / 4 × height", "Round column dia 0.45 m, height 3 m (L = B = dia)", "1", "0.45", "0.45", "3", "pi/4"],
    ["Circular ring / well steining — π × mean dia × thickness × height", "Ring, mean dia 2.3 m, wall 0.3 m, height 1.5 m", "1", "pi*2.3", "0.3", "1.5", ""],
    ["Pipe surface / round face — π × dia × length", "Round surface, dia 0.3 m, length 6 m", "1", "pi*0.3", "6", "", ""],
    ["Cone or pyramid — ⅓ × base area × height", "Pyramid, base 2 × 2 m, height 1.5 m", "1", "2", "2", "1.5", "1/3"],
    ["Dome (hemisphere) surface — 2 π r²", "Dome surface, radius 1.5 m (L = B = radius)", "1", "1.5", "1.5", "", "2*pi"],
    ["Sloping roof — plan area × slope factor", "Sloping roof, plan 8 × 5 m, pitch 1 vertical in 3 horizontal", "1", "8", "5", "", "sqrt(1+(1/3)^2)"],
    ["Trench with side slopes — (top + bottom) / 2 × depth", "Trench 30 m long, top 1.8 m, bottom 0.9 m, depth 1.2 m", "1", "30", "(1.8+0.9)/2", "1.2", ""],
    ["Stair waist slab — sloping length", "Waist slab, going 2.5 m, rise 1.5 m, width 1.2 m, thickness 0.15 m", "1", "sqrt(2.5^2+1.5^2)", "1.2", "0.15", ""]
  ];
  var TYPES = [["+", "Add"], ["-", "Deduct"], ["h", "Heading"], ["st", "Sub-total"], ["nt", "Net total (adds − deductions)"], ["ref", "Add qty of another item"], ["refm", "Deduct qty of another item"], ["bbs", "Steel bar (BBS)"], ["pc", "Add % extra on rows above"]];
  function viewItems(d) {
    var pid = curPart(), R = ro();
    var h = '<div class="row" style="gap:8px;flex-wrap:wrap"><div class="seg" role="group" aria-label="Parts">' + d.parts.map(function (p) { var n = EP.partItems(d, p.id).length; return '<button type="button" data-part="' + esc(p.id) + '" aria-pressed="' + (p.id === pid) + '">' + esc(p.name) + ' <span class="cnt">(' + n + ")</span></button>"; }).join("") + "</div>" + (R ? "" : '<button type="button" class="btn ghost sm" id="add-part">+ Add part</button>') + "</div>";
    if (!R) h += '<div class="row add-row"><div class="grow" style="position:relative"><input id="add-q" class="in" style="width:100%" placeholder="Add item to ' + esc(partName(d, pid)) + ': code (6.34.2, 3.3) or words — English or site words (gitti, sariya, khudai, pcc, wbm)" aria-label="Search items to add" autocomplete="off" value="' + esc(S.est.addQ) + '">' + addDropdown() + '</div><select class="in" id="add-book" aria-label="Search in" style="width:auto">' + bookOpts() + '</select><button type="button" class="btn sec" id="add-x">+ Non-SOR (NS) item</button><button type="button" class="btn sec" data-sub="sugg" title="Buildings, roads, drains, culverts, garden, dust suppression, interior, cladding…">Browse by work type</button></div>';
    var items = EP.partItems(d, pid);
    h += '<div class="tw"><table class="t est"><thead><tr><th class="num">Sl</th><th>SOR & item</th><th>Description</th><th>Unit</th><th class="num">Qty</th><th class="num">SOR rate ₹</th><th class="num">SOR amount ₹</th><th class="num">Updated rate ₹</th><th class="num">Updated amount ₹</th><th></th></tr></thead><tbody>';
    var ts = 0, ta = 0;
    items.forEach(function (it, i) {
      var inf = EP.itemInfo(it), r = EP.lineRates(d, it), m = EP.measSum(d, it), open = !!S.est.open[it.id];
      ts += r.sa; ta += r.aa;
      var qcell = m.n ? '<span class="qv">' + U.qfmt(r.q) + "</span>" : "<input class='in small n' id='iq-" + it.id + "' data-iq='" + it.id + "' value='" + esc(it.q || "") + "' inputmode='decimal' aria-label='Quantity'" + (R ? " disabled" : "") + ">";
      h += "<tr class='irow" + (open ? " open" : "") + "' data-pic='" + esc(it.b === "x" ? "|" : it.b + "|" + inf.code) + "' data-pdesc='" + esc(inf.desc) + "' data-punit='" + esc(inf.unit) + "'><td class='num'>" + (i + 1) + "</td><td class='pc' style='white-space:nowrap'><span class='sw " + (it.b.indexOf("u:") === 0 ? "u" : it.b) + "'></span>" + esc(it.b === "x" ? "Non-SOR" : (EP.BOOKS[it.b] || {}).name || "SOR") + "<br><strong>" + esc(inf.code) + "</strong> <button type='button' class='pic-b' data-picb='1' title='Picture of this item' aria-label='Picture of this item'>🖼</button></td><td class='pc'><div class='desc'>" + esc(inf.desc) + "</div>" + (inf.missing ? "<span class='badge warn'>Not in SOR</span>" : "") + "</td><td>" + esc(inf.unit) + "</td><td class='num'>" + qcell + "</td><td class='num'>" + inr(r.s) + "</td><td class='num'>" + inr(r.sa) + "</td><td class='num'>" + inr(r.a) + (Math.abs((r.a || 0) - (r.s || 0)) > 0.004 ? "<br><span class='badge ed'>" + esc(r.how) + "</span>" : "") + "</td><td class='num'>" + inr(r.aa) + "</td>" +
        "<td class='acts'><button class='btn " + (open ? "pri" : "sec") + " sm' data-open='" + it.id + "' aria-expanded='" + open + "'>" + (open ? "Close" : "Measure" + (m.n ? " (" + m.n + ")" : "")) + "</button>" + (R ? "" : "<button class='btn ghost sm' data-mv='" + it.id + "|-1' aria-label='Move up'>↑</button><button class='btn ghost sm' data-mv='" + it.id + "|1' aria-label='Move down'>↓</button><button class='btn ghost sm' data-del='" + it.id + "' aria-label='Remove item'>✕</button>") + "</td></tr>";

    });
    if (!items.length) h += "<tr><td colspan='10' class='empty'>No items in " + esc(partName(d, pid)) + " yet. Search above to add from CPWD DSOR 2023, CPWD DSR 2021, MPPWD SOR 2017, DSR Horticulture 2018 or your own SOR.</td></tr>";
    h += "</tbody><tfoot><tr><td colspan='6'>Total " + esc(partName(d, pid)) + "</td><td class='num'>" + inr(ts) + "</td><td></td><td class='num'>" + inr(ta) + "</td><td></td></tr></tfoot></table></div>";
    var oi = items.filter(function (x) { return S.est.open[x.id]; })[0];
    if (oi) { var inf2 = EP.itemInfo(oi); h += "<div class='panel mpanel' id='mpanel'><div class='row'><h3 class='grow'>Measurement · " + esc(partName(d, pid)) + " item " + EP.slOf(d, oi) + (inf2.code ? " · " + esc(inf2.code) : "") + "</h3><button class='btn ghost sm' data-open='" + oi.id + "'>Close</button></div><p class='muted' style='margin:0'>" + esc(inf2.desc) + "</p>" + measEditor(d, oi) + "</div>"; }
    return h;
  }
  function partName(d, id) { var p = d.parts.filter(function (x) { return x.id === id; })[0]; return p ? p.name : ""; }
  function measEditor(d, it) {
    var R = ro(), inf = EP.itemInfo(it), m = EP.measSum(d, it), kg = EP.isSteelUnit(inf.unit) || (it.meas || []).some(function (r) { return r.sec || r.k === "bbs"; }), uf = EP.unitFactor(inf.unit);
    var h = '<div class="meas">', MU = EP.itemQk(it) !== 1 ? "" : " (m)";   // rows converted from another unit are not in metres
    if (it.b === "x") {
      var x = it.x || {}, nsc = EP.nsCalc(x);
      h += '<div class="grid2"><label class="fld wide"><span class="lbl">Description</span><textarea class="in" rows="2" id="x-desc-' + it.id + '" data-x="' + it.id + '|desc"' + (R ? " disabled" : "") + ">" + esc(x.desc || "") + '</textarea></label><label class="fld"><span class="lbl">Unit</span><input class="in" id="x-unit-' + it.id + '" data-x="' + it.id + '|unit" value="' + esc(x.unit || "") + '"' + (R ? " disabled" : "") + '></label><label class="fld"><span class="lbl">Basis (printed as remark)</span><input class="in" id="x-src-' + it.id + '" data-x="' + it.id + '|src" value="' + esc(x.src || "") + '" placeholder="As per market quote"' + (R ? " disabled" : "") + '></label><label class="fld"><span class="lbl">Estimate rate ₹' + (nsc ? " (blank = analysis)" : "") + '</span><input class="in n" id="x-sor-' + it.id + '" data-x="' + it.id + '|sor" value="' + esc(x.sor || "") + '" placeholder="' + (nsc ? "Analysis: " + inr(nsc.rate) : "") + '"' + (R ? " disabled" : "") + '></label><label class="fld"><span class="lbl">Updated rate ₹ (blank = ' + (nsc ? "analysis" : "same") + ')</span><input class="in n" id="x-an-' + it.id + '" data-x="' + it.id + '|an" value="' + esc(x.an || "") + '" placeholder="' + (nsc ? "Analysis: " + inr(nsc.rate) : "") + '"' + (R ? " disabled" : "") + "></label></div>";
      h += U.nsPanel ? U.nsPanel(it, R) : "";
    }
    h += "<div class='mtw'><table class='t mt'><thead><tr><th>Type</th><th>Details</th>" + (kg ? "<th>Steel section (IS)</th>" : "") + "<th class='num'>No.</th><th class='num'>L" + MU + "</th><th class='num'>B" + MU + "</th><th class='num'>D / H" + MU + "</th><th class='num'>Factor</th><th class='num'>Qty " + esc(EP.itemQk(it) !== 1 ? it.qu : inf.unit) + "</th><th></th></tr></thead><tbody>";
    (it.meas || []).forEach(function (r, ri) {
      var k = it.id + "|" + ri, id = "m-" + it.id + "-" + ri + "-", q = EP.rowQty(d, r, 0, it);
      function inp(f, ph, cls) { return "<input class='in small " + (cls || "n") + "' id='" + id + f + "' data-mf='" + k + "|" + f + "' value='" + esc(r[f] == null ? "" : r[f]) + "' placeholder='" + (ph || "") + "' aria-label='" + f + "'" + (R ? " disabled" : "") + ">"; }
      h += "<tr class='k" + (r.k === "-" ? "m" : r.k === "h" ? "h" : r.k === "st" || r.k === "nt" ? "s" : r.k === "refm" ? "m" : r.k === "ref" ? "r" : "p") + "'><td><select class='in small' data-mk='" + k + "' aria-label='Row type'" + (R ? " disabled" : "") + ">" + TYPES.map(function (t) { return "<option value='" + t[0] + "'" + (r.k === t[0] ? " selected" : "") + ">" + t[1] + "</option>"; }).join("") + "</select></td>";
      if (r.k === "bbs") { r.uf = uf; h += U.bbsCells(d, it, r, k, id, R, kg); }
      else if (r.k === "st" || r.k === "nt") {
        h += "<td>" + inp("d", r.k === "nt" ? "e.g. Total wall of room 1 (after deductions)" : "Sub-total label, e.g. Total deductions", "wide") + "</td>" + (kg ? "<td></td>" : "") + "<td colspan='5' class='muted' style='font-size:12px'>" + (r.k === "nt" ? "Additions minus deductions since the previous net total." : "Rows above, back to the previous sub-total (a block of deductions only shows as a positive total).") + " Doesn't change the item's net quantity.</td>";
      } else if (r.k === "pc") {
        h += "<td>" + inp("d", "e.g. 5% extra (laps & wastage)", "wide") + "</td>" + (kg ? "<td></td>" : "") + "<td colspan='4' class='muted' style='font-size:12px'>% of all rows above (additions − deductions), e.g. 5 for 5 % extra steel.</td><td class='num'>" + inp("f", "% e.g. 5") + "<span class='unit-s'>%</span></td>";
      } else if (EP.isRef(r)) {
        var others = d.items.filter(function (x) { return x.id !== it.id; });
        h += "<td>" + inp("d", "Note (optional)", "wide") + "<select class='in small' style='margin-top:4px;max-width:100%' data-mref='" + k + "' aria-label='Take quantity from item'" + (R ? " disabled" : "") + "><option value=''>Take quantity from item…</option>" + others.map(function (o) { var oi = EP.itemInfo(o); return "<option value='" + o.id + "'" + (r.ref === o.id ? " selected" : "") + ">" + esc(partName(d, o.part) + " #" + EP.slOf(d, o) + " · " + (oi.code || "") + " · " + oi.desc.slice(0, 60) + " (" + U.qfmt(EP.itemQty(d, o)) + " " + oi.unit + ")") + "</option>"; }).join("") + "</select>" + (U.thumbCell ? U.thumbCell(d, r, k, R) : "") + "</td>" + (kg ? "<td></td>" : "") +
          "<td class='num'>" + inp("no", "1") + "</td><td colspan='3'><select class='in small' data-mm='" + k + "' aria-label='How'" + (R ? " disabled" : "") + ">" + Object.keys(EP.REFMODE).map(function (m) { return "<option value='" + m + "'" + ((r.m || "x") === m ? " selected" : "") + ">" + EP.REFMODE[m] + "</option>"; }).join("") + "</select></td><td class='num'>" + inp("n", r.m === "pct" ? "% e.g. 1" : r.m === "kgcum" ? "kg e.g. 50" : "1") + (r.m === "pct" ? "<span class='unit-s'>%</span>" : r.m === "kgcum" ? "<span class='unit-s'>kg/cum</span>" : "") + "</td>";
      } else {
        h += "<td>" + inp("d", r.k === "-" ? "e.g. Door D1" : r.k === "h" ? "Heading, e.g. Main building (sizes optional)" : "e.g. Main building", "wide") + (r.src && r.src.cad ? "<div class='muted' style='font-size:11px;margin-top:2px' title='Measured in CAD Studio on " + esc(new Date(r.src.at).toLocaleString("en-IN")) + "'>📐 From drawing “" + esc(r.src.name || "") + "” (" + ({ L: "length", A: "area", V: "area × depth", VL: "length × width × depth", N: "count", M: "weight" }[r.src.kind] || "") + ")</div>" : "") + "</td>";
        if (kg) h += "<td><select class='in small' data-msec='" + k + "' aria-label='Steel section'" + (R ? " disabled" : "") + "><option value=''>—</option>" + steelOptions(r.sec) + "</select></td>";
        var fph = r.sec === "__pct" ? "% e.g. 1" : r.sec === "__manual" ? "kg/m" : r.sec ? "" : "×";
        h += "<td class='num'>" + inp("n") + "</td><td class='num'>" + inp("l") + "</td><td class='num'>" + inp("b") + "</td><td class='num'>" + inp("h") + "</td><td class='num'>" + inp("f", fph) + (r.sec === "__pct" ? "<span class='unit-s'>%</span>" : r.sec === "__manual" ? "<span class='unit-s'>kg/m</span>" : "") + "</td>";
      }
      h += "<td class='num'>" + (r.k === "st" || r.k === "nt" ? "<span class='qv'><strong>" + U.qfmt(EP.subTotal(d, it, ri)) + "</strong></span>" : r.k === "h" && !EP.hasDims(r) ? "<span class='muted' style='font-size:11px'>heading</span>" : (EP.isRef(r) || r.k === "bbs" || r.k === "pc" ? "<span class='qv'>" + (r.k === "refm" ? "− " : "") + U.qfmt(q) + "</span>" : "<input class='in small n' id='" + id + "q' data-mf='" + k + "|q' value='" + esc(r.q == null ? "" : r.q) + "' placeholder='" + U.qfmt(q) + "' aria-label='Quantity (blank = calculated)'" + (R ? " disabled" : "") + ">")) + "</td><td>" + (R ? "" : "<span style='white-space:nowrap'><button class='btn ghost sm' data-mdup='" + k + "' aria-label='Copy this row below' title='Copy this row below'>⧉</button><button class='btn ghost sm' data-mdel='" + k + "' aria-label='Delete row'>✕</button></span>") + "</td></tr>";
    });
    if (!(it.meas || []).length) h += "<tr><td colspan='" + (kg ? 10 : 9) + "' class='muted'>No measurement rows. The quantity typed in the item row is used. Add rows to calculate No. × L × B × D × factor.</td></tr>";
    h += "</tbody></table></div>";
    if (!R) h += "<div class='row' style='gap:6px;flex-wrap:wrap'><button class='btn sec sm' data-madd='" + it.id + "|+'>+ Row</button><button class='btn sec sm' data-madd='" + it.id + "|-'>+ Deduction</button><button class='btn sec sm' data-madd='" + it.id + "|h'>+ Heading</button><button class='btn sec sm' data-madd='" + it.id + "|st'>+ Sub-total</button><button class='btn sec sm' data-madd='" + it.id + "|nt'>+ Net total</button><button class='btn sec sm' data-madd='" + it.id + "|ref'>+ Add qty of another item</button><button class='btn sec sm' data-madd='" + it.id + "|refm'>− Deduct qty of another item</button>" +
      "<select class='in small' style='width:auto' data-mshape='" + it.id + "' aria-label='Add a shape row'><option value=''>+ Shape row…</option>" + SHAPES.map(function (sh, si) { return "<option value='" + si + "'>" + esc(sh[0]) + "</option>"; }).join("") + "</select></div>" +
      (MU === "" ? "<p class='muted' style='font-size:12px;margin:4px 0 0'>These rows are measured in <b>" + esc(it.qu || "") + "</b> (see Convert below) — type plain numbers in that unit. Sums like <b>(3+5)/2</b> and <b>pi*0.6^2/4</b> work.</p>" : "<p class='muted' style='font-size:12px;margin:4px 0 0'>Sizes are in metres. You can also type <b>10'6\"</b>, <b>450mm</b>, <b>30cm</b>, <b>12ft</b> — they are read as metres — and sums like <b>(3+5)/2</b>, <b>pi*0.6^2/4</b>, <b>sqrt(3^2+4^2)</b>.</p>");
    if (kg && U.rfTools) h += U.rfTools(d, it, R);
    var cvOn = EP.itemQk(it) !== 1, mu0 = cvOn ? it.qu : inf.unit;
    h += "<div class='msum'><span>Additions <strong>" + U.qfmt(m.plus) + "</strong></span><span>− Deductions <strong>" + U.qfmt(m.minus) + "</strong></span>" + (cvOn ? "<span>= <strong>" + U.qfmt(m.net) + " " + esc(mu0) + "</strong> → converted</span>" : "") + "<span>= Net quantity used in abstract <strong>" + U.qfmt(EP.itemQty(d, it)) + " " + esc(inf.unit) + "</strong></span></div>";
    /* convert the measured total into the item's unit (e.g. area in sqm → number of sheets) */
    var qsz = it.qsz != null && it.qsz !== "" ? it.qsz : (cvOn ? String(+(1 / EP.itemQk(it)).toPrecision(6)) : "");
    h += "<details class='qcv' data-qcvd='" + it.id + "'" + ((S.est.cvOpen === it.id || (cvOn && S.est.cvOpen !== "-" + it.id)) ? " open" : "") + "><summary>⇄ Convert the measured quantity to another unit (e.g. sqm → nos)" + (cvOn ? " — on" : "") + "</summary><div class='row' style='gap:8px;flex-wrap:wrap;align-items:center;margin-top:6px'>" +
      (function () { var iu = EP.units.get(inf.unit), CH = { L: ["ft", "in", "mm", "km"], A: ["sqft", "sqyd", "acre", "hectare", "decimal"], V: ["cft", "brass", "litre"], M: ["kg", "quintal", "tonne"], N: ["dozen", "100 nos", "1000 nos"] }[iu ? iu.dim : ""]; if (!CH || R) return "";
        return "<div class='row' style='gap:6px;flex-wrap:wrap;align-items:center;width:100%'><span class='muted' style='font-size:12px'>Quick: my rows are in</span>" + CH.filter(function (u) { var g = EP.units.get(u); return g && g.id !== iu.id; }).map(function (u) { return "<button type='button' class='btn " + (it.qu === u ? "pri" : "ghost") + " sm' data-qcvp='" + it.id + "|" + u + "'>" + u + "</button>"; }).join("") + (cvOn ? "<button type='button' class='btn ghost sm' data-qcvp='" + it.id + "|'>✕ no conversion</button>" : "") + "</div>"; })() +
      "<span>Rows above are measured in</span><input class='in small' style='width:80px' id='qcv-u-" + it.id + "' data-qcv='" + it.id + "|qu' value='" + esc(it.qu || "") + "' placeholder='sqm'" + (R ? " disabled" : "") + ">" +
      "<span>and 1 " + esc(inf.unit) + " =</span><input class='in small n' style='width:110px' id='qcv-s-" + it.id + "' data-qcv='" + it.id + "|qsz' value='" + esc(qsz) + "' placeholder='e.g. 0.418'" + (R ? " disabled" : "") + "><span>" + esc(it.qu || "measured unit") + "</span>" +
      "<label class='row' style='gap:4px;align-items:center'><input type='checkbox' data-qcv='" + it.id + "|qceil'" + (it.qceil ? " checked" : "") + (R ? " disabled" : "") + ">Round up to a whole number</label>" +
      (cvOn ? "<span class='muted' style='font-size:12px'>" + U.qfmt(m.net) + " " + esc(it.qu) + " ÷ " + esc(qsz) + " = " + U.qfmt(EP.r3(m.net * EP.itemQk(it))) + (it.qceil ? " → " + U.qfmt(EP.itemQty(d, it)) : "") + " " + esc(inf.unit) + "</span>" : "<span class='muted' style='font-size:12px'>Also change the item unit to the new unit (e.g. nos). Example: sheet 1.5 × 3 ft = 4.5 sq ft = 0.418 sqm.</span>") + "</div></details>";
    if (U.replaceTools) h += U.replaceTools(d, it, R);
    if (S.anchk && S.anchk.back === it.id) h += "<div class='row' style='gap:8px;align-items:center;margin:6px 0'><button type='button' class='btn pri sm' data-anback='1'>← Back to Analysis check</button><span class='muted' style='font-size:12px'>Opened from Analysis check. Edit the analysis below, then go back.</span></div>";
    if (U.anBanner) h += U.anBanner(it, R);
    var fnote = it.b !== "x" && EP.farNote ? EP.farNote(it.b, it.c) : "";
    if (fnote) h += "<div class='ds-msg farmsg' role='note'><b>MoRTH analysis differs a lot from the SOR rate.</b> " + esc(fnote) + "</div>";
    if (it.b !== "x" && U.savedAnBox && U.savedFor && U.savedFor(it.b, it.c).length && !(S.anchk && S.anchk.open[it.id])) h += U.savedAnBox(it, R);
    if (it.b !== "x" && U.anTable) { var aop = !!(S.anchk && S.anchk.open[it.id]); h += "<div class='row' style='gap:8px;align-items:center;flex-wrap:wrap'><button type='button' class='btn " + (aop ? "pri" : "sec") + " sm' data-anop='" + it.id + "'>" + (aop ? "Hide rate analysis" : "Check / edit rate analysis") + "</button><span class='muted' style='font-size:12px'>" + esc(U.anStatus(d, it).msg) + "</span></div>" + (aop ? U.anTable(d, it, R) : ""); }
    var lib = it.b === "x" ? null : EP.anRate(it.b, it.c);
    if (it.b !== "x" && !R && !inf.missing) h += "<div class='row' style='gap:8px;align-items:center;flex-wrap:wrap'><button type='button' class='btn sec sm' data-tons='" + it.id + "'>Make NS copy (modify this item's analysis)</button><span class='muted' style='font-size:12px'>For a changed specification: copies this item with its " + (EP.hasAn(it.b, it.c) ? "rate analysis" : "rate") + " and measurements as a non-SOR item you can edit.</span></div>";
    h += "<div class='grid2'>" + (it.b !== "x" ? "<label class='fld'><span class='lbl'>Updated rate for this estimate only ₹</span><input class='in n' id='anr-" + it.id + "' data-anr='" + it.id + "' value='" + esc(it.anr || "") + "' placeholder='" + (lib != null ? "Library: " + inr(lib) : "") + "'" + (R ? " disabled" : "") + "></label>" : "") +
      "<label class='fld wide'><span class='lbl'>Remark (printed after the SOR reference)</span><input class='in' id='rem-" + it.id + "' data-rem='" + it.id + "' value='" + esc(it.rem || "") + "' placeholder='" + esc(inf.src) + "'" + (R ? " disabled" : "") + "></label>" +
      (d.parts.length > 1 && !R ? "<label class='fld'><span class='lbl'>Move to part</span><select class='in' data-mvpart='" + it.id + "'>" + d.parts.map(function (p) { return "<option value='" + esc(p.id) + "'" + (p.id === it.part ? " selected" : "") + ">" + esc(p.name) + "</option>"; }).join("") + "</select></label>" : "") + "</div>";
    return h + "</div>";
  }
  function steelOptions(sel) {
    var g = null, h = "<optgroup label='Manual'>" + EP.STEEL_SPECIAL.map(function (s) { return "<option value='" + s[0] + "'" + (s[0] === sel ? " selected" : "") + ">" + esc(s[1]) + "</option>"; }).join("") + "</optgroup>";
    EP.STEEL.forEach(function (s) { if (s[3] !== g) { if (g) h += "</optgroup>"; g = s[3]; h += "<optgroup label='" + esc(g) + "'>"; } h += "<option value='" + esc(s[0]) + "'" + (s[0] === sel ? " selected" : "") + ">" + esc(s[0]) + " — " + s[1] + (/plate/i.test(s[0]) ? " kg/sqm" : " kg/m") + "</option>"; });
    return h + "</optgroup>";
  }
  function searchItems(q, lim) {
    q = q.trim().toLowerCase(); if (!q) return [];
    var words = q.split(/\s+/), out = [];
    Object.keys(EP.BOOKS).forEach(function (b) {
      EP.BOOKS[b].list.forEach(function (it) {
        var c = it.code.toLowerCase(), s = 0;
        if (c === q) s = 3; else if (c.indexOf(q) === 0) s = 2;
        else { var dd = it.desc.toLowerCase(); if (words.every(function (w) { return dd.indexOf(w) >= 0 || c.indexOf(w) >= 0; })) s = 1; }
        if (s) out.push({ b: b, it: it, s: s });
      });
    });
    out.sort(function (a, b) { return b.s - a.s; });
    return out.slice(0, lim || 30);
  }
  function hl(text, q) {
    var t = esc(text), w = String(q || "").toLowerCase().split(/[^a-z0-9\u0900-\u097f.]+/i).filter(function (x) { return x.length > 1 && !/^[\d.]+$/.test(x); });
    if (!w.length) return t;
    w = w.map(function (x) { return x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); });
    return t.replace(new RegExp("(" + w.join("|") + ")", "gi"), "<mark>$1</mark>");
  }
  function bookOpts() {
    var o = [["all", "All rate books"]].concat(Object.keys(EP.BOOKS).map(function (b) { return [b, EP.BOOKS[b].name]; }));
    if ((S.nsLib || []).length) o.push(["ns", "My NS items"]);
    return o.map(function (x) { return '<option value="' + esc(x[0]) + '"' + ((S.est.addBook || "all") === x[0] ? " selected" : "") + ">" + esc(x[1]) + "</option>"; }).join("");
  }
  function rowBtn(b, it, q) { var d0 = doc(), inP = d0 && dupe(d0, curPart(), b, it.code); return '<button type="button" data-add="' + b + "|" + esc(it.code) + '"><span><span class="sw ' + (b.indexOf("u:") === 0 ? "u" : b) + '"></span><strong>' + esc(it.code) + '</strong><br><span class="muted" style="font-size:11px">' + esc(EP.BOOKS[b].name) + '</span>' + (inP ? '<br><span class="badge ed" style="font-size:10px">In this part</span>' : "") + (EP.anOf(b, it.code) && EP.anOf(b, it.code).far != null ? '<br><span class="badge warn" style="font-size:10px" title="The MoRTH analysis with the same description differs a lot from the SOR rate">Check analysis</span>' : "") + '</span><span class="desc">' + hl(it.desc, q) + '</span><span class="num">₹' + inr(it.sor) + "/" + esc(it.unit) + '<span class="ddi" role="button" tabindex="-1" title="Show full description" aria-label="Show full description">i</span></span></button>'; }
  function nsBtn(n, q) { var c = EP.nsCalc(n.data || {}), r = c ? c.rate : EP.ev(n.data && n.data.sor); return '<button type="button" class="nsrow" data-addns="' + esc(n.id) + '"><span><span class="badge ed">My NS</span></span><span class="desc">' + hl(n.name, q) + '</span><span class="num">' + (r != null ? "₹" + inr(r) + "/" : "") + esc(n.unit || "") + "</span></button>"; }
  function addDropdown() {
    var q = S.est.addQ || "", bk = S.est.addBook || "all", h;
    if (!q.trim()) {
      if (!S.est.addFocus) return "";
      var rec = U.recent ? U.recent().filter(function (x) { return EP.BOOKS[x[0]] && EP.item(x[0], x[1]) && (bk === "all" || bk === x[0]); }).slice(0, 10) : [];
      if (!rec.length) return "";
      return '<div class="dd"><div class="dd-h">Recently used</div>' + rec.map(function (x) { return rowBtn(x[0], EP.item(x[0], x[1]), ""); }).join("") + "</div>";
    }
    var ns = bk === "all" || bk === "ns" ? (U.nsLibSearch ? U.nsLibSearch(q) : []) : [];
    var res = bk === "ns" ? [] : (U.searchItems ? U.searchItems(q, 30, { book: bk }) : searchItems(q, 30));
    var mk = '<button type="button" class="dd-mk" data-addxq="1">+ Create a non-SOR (NS) item “' + esc(q) + '” with its own rate analysis</button>';
    if (!res.length && !ns.length) return '<div class="dd"><div class="empty">No item matches “' + esc(q) + '”' + (bk !== "all" ? " in this rate book" : "") + ".</div>" + mk + "</div>";
    h = '<div class="dd">';
    if (res.length && res[0].fz) h += '<div class="dd-h">No exact match. Closest items (spelling may differ):</div>';
    h += ns.map(function (n) { return nsBtn(n, q); }).join("") + res.map(function (r) { return rowBtn(r.b, r.it, q); }).join("");
    return h + mk + "</div>";
  }


  /* ----- header, parts, GST ----- */
  function viewHeader(d) {
    var R = ro() ? " disabled" : "", hd = d.header;
    var h = '<div class="panel form">' + firmBox(d, R) + '<h3>Header printed on every sheet</h3><div class="grid2">';
    [["org", "Organisation / company", "SOUTH EASTERN COALFIELDS LIMITED"], ["office", "Office", "OFFICE OF THE PROJECT ENGINEER (CIVIL)"], ["project", "Project / area", "GEVRA PROJECT"]].forEach(function (f) { h += '<label class="fld"><span class="lbl">' + f[1] + '</span><input class="in" id="hd-' + f[0] + '" data-hd="' + f[0] + '" value="' + esc(hd[f[0]] || "") + '" placeholder="' + esc(f[2]) + '"' + R + "></label>"; });
    h += '<label class="fld wide"><span class="lbl">Name of work</span><textarea class="in" rows="2" id="hd-work" data-hd="work" placeholder="Repair, renovation and beautification of …"' + R + ">" + esc(hd.work || "") + "</textarea></label></div>";
    h += '<h3>Signatures printed at the foot of each sheet</h3><div class="grid3">' + d.signs.map(function (s, i) { return '<div class="fld"><input class="in" id="sg-' + i + '-t" data-sg="' + i + '|title" value="' + esc(s.title) + '" placeholder="Designation" aria-label="Designation ' + (i + 1) + '"' + R + '><input class="in" id="sg-' + i + '-p" data-sg="' + i + '|place" value="' + esc(s.place) + '" placeholder="Place / office" aria-label="Place ' + (i + 1) + '"' + R + "></div>"; }).join("") + "</div>";
    h += '<h3>Rates & tax</h3><div class="grid2"><label class="fld"><span class="lbl">GST %</span><input class="in n" id="doc-gst" data-doc="gst" value="' + esc(d.gst) + '"' + R + '></label><label class="fld"><span class="lbl">Updated rate comes from</span><select class="in" data-doc="basis"' + R + '><option value="an"' + (d.basis !== "sor" ? " selected" : "") + '>Rate analysis with current basic rates (recommended)</option><option value="sor"' + (d.basis === "sor" ? " selected" : "") + ">SOR rate (unless an entered rate exists)</option></select></label></div>";
    if (U.rfSettings) h += U.rfSettings(d, !!R);
    h += '<h3>Parts</h3><p class="muted" style="margin:0">Each part gets its own measurement and abstract; the general abstract adds all parts.</p><div class="parts">' + d.parts.map(function (p) { var n = EP.partItems(d, p.id).length; return '<div class="row"><input class="in grow" id="pn-' + esc(p.id) + '" data-pname="' + esc(p.id) + '" value="' + esc(p.name) + '" aria-label="Part name"' + R + '><span class="muted">' + n + " items</span>" + (!R && d.parts.length > 1 ? '<button class="btn ghost sm" data-pdel="' + esc(p.id) + '">' + (n ? "Delete part & its items" : "Delete") + "</button>" : "") + "</div>"; }).join("") + "</div>" + (R ? "" : '<div class="row"><button type="button" class="btn sec sm" id="add-part">+ Add part</button><span class="grow"></span><button type="button" class="btn ghost" id="save-def">Use this header for my new estimates</button></div>');
    return h + "</div>";
  }

  /* ----- abstract preview ----- */
  function viewAbstract(d) {
    var T = EP.totals(d), g = +d.gst || 0, h = "";
    d.parts.forEach(function (p, pi) {
      var pt = T.parts[pi];
      h += '<div class="panel" style="padding:0;overflow:hidden"><div class="row" style="padding:10px 14px"><h3 class="grow">Abstract of cost — ' + esc(p.name) + '</h3></div><div class="tw" style="border:0;border-radius:0"><table class="t"><thead><tr><th class="num">Sl</th><th>Description</th><th>Unit</th><th class="num">Qty</th><th class="num">Estimate rate ₹</th><th class="num">Amount ₹</th><th class="num">Updated rate ₹</th><th class="num">Amount ₹</th><th>Remarks</th></tr></thead><tbody>';
      h += EP.partItems(d, p.id).map(function (it, i) { var inf = EP.itemInfo(it), r = EP.lineRates(d, it); return "<tr><td class='num'>" + (i + 1) + "</td><td><div class='desc'>" + esc(inf.desc) + "</div></td><td>" + esc(inf.unit) + "</td><td class='num'>" + U.qfmt(r.q) + "</td><td class='num'>" + inr(r.s) + "</td><td class='num'>" + inr(r.sa) + "</td><td class='num'>" + inr(r.a) + "</td><td class='num'>" + inr(r.aa) + "</td><td style='font-size:12px'>" + esc(inf.src + (it.rem ? " — " + it.rem : "")) + "</td></tr>"; }).join("") || "<tr><td colspan='9' class='empty'>No items.</td></tr>";
      h += "</tbody><tfoot><tr><td colspan='5'>Total</td><td class='num'>" + inr(pt.s) + "</td><td></td><td class='num'>" + inr(pt.a) + "</td><td></td></tr><tr><td colspan='5'>Add GST @ " + g + "%</td><td class='num'>" + inr(pt.s * g / 100) + "</td><td></td><td class='num'>" + inr(pt.a * g / 100) + "</td><td></td></tr><tr><td colspan='5'>Grand total</td><td class='num'>" + inr(pt.s * (1 + g / 100)) + "</td><td></td><td class='num'>" + inr(pt.a * (1 + g / 100)) + "</td><td></td></tr></tfoot></table></div></div>";
    });
    h += '<div class="panel" style="padding:0;overflow:hidden"><div style="padding:10px 14px"><h3>General abstract of cost</h3></div><div class="tw" style="border:0;border-radius:0"><table class="t"><thead><tr><th class="num">Sl</th><th>Description</th><th class="num">Estimate cost ₹</th><th class="num">Updated cost ₹</th></tr></thead><tbody>' + T.parts.map(function (p, i) { return "<tr><td class='num'>" + (i + 1) + "</td><td>" + esc(p.name) + "</td><td class='num'>" + inr(p.s) + "</td><td class='num'>" + inr(p.a) + "</td></tr>"; }).join("") + "</tbody><tfoot><tr><td colspan='2'>Total</td><td class='num'>" + inr(T.s) + "</td><td class='num'>" + inr(T.a) + "</td></tr><tr><td colspan='2'>Add GST @ " + g + "%</td><td class='num'>" + inr(T.sg) + "</td><td class='num'>" + inr(T.ag) + "</td></tr><tr><td colspan='2'>Grand total</td><td class='num'>" + inr(T.sT) + "</td><td class='num'>" + inr(T.aT) + "</td></tr><tr><td colspan='2'>Say (₹ lakh)</td><td class='num'>" + inr(T.sT / 1e5) + "</td><td class='num'>" + inr(T.aT / 1e5) + "</td></tr></tfoot></table></div></div>";
    return h;
  }

  /* ----- export ----- */
  var XL = [["all", "Full estimate", "All sheets in one workbook, linked by formulas: Measurement → Analysis → Abstract (every part, one after another) → General Abstract → BOQ."], ["meas", "Measurement", "Every item's No. × L × B × D × factor rows, deductions and totals with units, part by part."], ["an", "Analysis", "Rate analysis of each item with updated basic rates, add-ons and the rate adopted."], ["abs", "Abstract", "Abstract of cost for each part with SOR and updated rates and amounts, GST and grand total."], ["sum", "SOR & Non-SOR summary", "Total of SOR items and of non-SOR (NS) items for every part and overall, without GST and with GST, on SOR rates and updated rates."], ["gen", "General abstract", "All parts added together, GST and grand total, both estimate and updated cost."], ["boq", "BOQ", "Bill of quantities for tender: description, unit and quantity, rate columns left blank."]];
  function viewExport(d) {
    var miss = [];
    if (!d.header.work) miss.push("name of work"); if (!d.header.org) miss.push("organisation");
    return '<div class="panel form">' + (miss.length ? '<div class="badge warn" style="white-space:normal;align-self:flex-start">Header is missing: ' + miss.join(", ") + '. Fill it in under “Header, parts & GST”.</div>' : "") + '<div class="xl-grid">' + XL.map(function (x) { return '<div class="xl"><h3>' + x[1] + '</h3><p class="muted">' + x[2] + '</p><button class="btn ' + (x[0] === "all" ? "pri" : "sec") + '" data-xl="' + x[0] + '">Download ' + x[1].toLowerCase() + " (.xlsx)</button>" + '<button class="btn sec" data-xlwa="' + x[0] + '" style="margin-top:6px;border-color:#25d366;color:#128c4a" title="Sends the same Excel file with a short message to the WhatsApp number in your profile; if that is not possible, opens the share options">🟢 Send on WhatsApp</button></div>'; }).join("") + '</div><p class="muted" style="font-size:12.5px;margin:0">Send on WhatsApp: the Excel file goes to the WhatsApp number in your profile with a message naming the estimate. If it cannot be sent that way, the share options open instead (on a phone pick WhatsApp and the chat; on a computer the file is downloaded and WhatsApp opens with the message — attach the file there).</p></div>';
  }
  /* the message that goes with an estimate sent on WhatsApp */
  function waText(which) { var nm = (S.est.cur && S.est.cur.name) || "estimate", lab = XL.filter(function (x) { return x[0] === which; })[0][1], d = doc(), work = d && d.header && d.header.work ? d.header.work : "";
    return "✅ *EstimatePro*\n\nआपने एस्टीमेट *“" + nm + "”* सफलतापूर्वक तैयार कर लिया है। " + (which === "all" ? "पूरा एस्टीमेट" : lab) + " (Excel) इस संदेश के साथ है।\nYou have successfully generated the estimate *“" + nm + "”*." + (work && work !== nm ? "\nWork: " + work : "") + "\n\nअगले एस्टीमेट के लिए भी EstimatePro का इस्तेमाल करते रहिए 🙏\nKeep using EstimatePro for your next estimates: " + (/^https?:/.test(location.origin) ? location.origin : "https://estimatepro.prashantmahto2819.workers.dev") + "/app"; }
  async function sendWa(which) {
    var d = doc(); if (!d) return; var blob, name = fileName(which), msg = waText(which);
    try { blob = EP.buildWorkbook(d, which); } catch (err) { console.error(err); U.toast("Couldn't create the Excel file."); return; }
    /* first choice: the server sends it through Vivid Relay to the WhatsApp number in the user's profile. If that cannot be done, the share sheet / WhatsApp link below is used (asking for one more tap when the phone needs it). */
    if (!S.est.waShare && navigator.onLine !== false) {
      var why = "";
      try { U.toast("Sending to your WhatsApp…"); var ss = await U.db().auth.getSession(), tok = ss && ss.data && ss.data.session && ss.data.session.access_token;
        if (tok) { var ctl = window.AbortController ? new AbortController() : null, tm = setTimeout(function () { if (ctl) ctl.abort(); }, 45000);
          var res = await fetch("/api/wa-estimate", { method: "POST", headers: { authorization: "Bearer " + tok, "x-which": which, "x-name": encodeURIComponent((S.est.cur && S.est.cur.name) || "estimate"), "x-file": encodeURIComponent(name) }, body: blob, signal: ctl ? ctl.signal : undefined }); clearTimeout(tm);
          var jr = null; try { jr = await res.json(); } catch (e0) { jr = null; }
          if (jr && jr.ok) { U.toast("Sent to your WhatsApp number " + (jr.to || "") + " with the Excel file ✅"); return; }
          why = jr && jr.code === "no_phone" ? "Your profile has no WhatsApp number" : jr && jr.code === "limit_reached" ? "Today's limit is reached" : jr && jr.code === "not_configured" ? "" : (jr && jr.error) || "The server could not send it"; }
      } catch (e1) { why = "The server could not be reached"; }
      S.est.waShare = true; setTimeout(function () { S.est.waShare = false; }, 120000);   /* for the next two minutes the button goes straight to the share sheet */
      if (why) U.toast(why + " — using the share option instead.");
    }
    var file = null; try { file = new File([blob], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }); } catch (er) { file = null; }
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(msg).catch(function () {}); } catch (er2) {}   /* some phones drop the text when a file is shared: it is on the clipboard to paste */
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: msg, title: name }); U.toast("Sent to the app you picked. If the message did not go with the file, paste it — it is copied."); return; }
      catch (err2) { if (err2 && err2.name === "AbortError") return; if (err2 && err2.name === "NotAllowedError") { U.toast("Tap Send on WhatsApp once more to open the share options."); return; } }
    }
    EP.download(blob, name); window.open("https://wa.me/?text=" + encodeURIComponent(msg), "_blank", "noopener");
    U.toast("Excel file downloaded. WhatsApp is opening with the message — attach the downloaded file there.");
  }
  function fileName(which) { var n = (S.est.cur.name || "estimate").replace(/[^\w\- ]+/g, "").trim().slice(0, 60) || "estimate"; var lab = XL.filter(function (x) { return x[0] === which; })[0][1]; return n + (which === "all" ? "" : " - " + lab) + ".xlsx"; }

  /* ---------- events ---------- */
  document.addEventListener("input", function (e) {
    var t = e.target, d = doc();
    if (t.id === "add-q") { S.est.addQ = t.value; U.render(); return; }
    if (t.id === "proj-q") { S.est.pq = t.value; U.render(); return; }
    if (!d || ro()) return;
    var ds = t.dataset;
    if (t.id === "est-name") { S.est.cur.name = t.value; save(); return; }
    if (ds.iq) { change(function () { findItem(ds.iq).q = t.value; }); return; }
    if (ds.mf) { var p = ds.mf.split("|"), it = findItem(p[0]); change(function () { it.meas[+p[1]][p[2]] = t.value; }, p[2] !== "d"); return; }
    if (ds.nsadopt) { change(function () { var it = findItem(ds.nsadopt); it.x = it.x || {}; it.x.an = t.value.trim(); it.x.sor = t.value.trim(); }); return; }
    if (ds.x) { var q = ds.x.split("|"); change(function () { var it = findItem(q[0]); it.x = it.x || {}; it.x[q[1]] = t.value; }, q[1] === "sor" || q[1] === "an" || q[1] === "unit"); return; }
    if (ds.anr) { change(function () { findItem(ds.anr).anr = t.value; }); return; }
    if (ds.rem) { change(function () { findItem(ds.rem).rem = t.value; }, false); return; }
    if (ds.mshape && t.value !== "") { var shp = SHAPES[+t.value], sid = ds.mshape; if (shp) change(function () { var it = findItem(sid); if (!it) return; it.meas = it.meas || []; it.meas.push({ k: "+", d: shp[1], n: shp[2], l: shp[3], b: shp[4], h: shp[5], f: shp[6] }); }); return; }
    if (ds.qcv && t.type !== "checkbox") { var qp = ds.qcv.split("|"); S.est.cvOpen = qp[0]; change(function () { var it = findItem(qp[0]); if (!it) return; it[qp[1]] = t.value.trim(); if (qp[1] === "qu" && it.qu && !it.qsz && EP.units.canConv(EP.itemInfo(it).unit, it.qu)) it.qsz = String(+EP.units.conv(1, EP.itemInfo(it).unit, it.qu).toPrecision(7)); var sz = EP.ev(it.qsz); if (it.qu && sz > 0) it.qk = String(1 / sz); else { delete it.qk; if (!it.qu) delete it.qu; } }); return; }
    if (ds.hd) { change(function () { d.header[ds.hd] = t.value; }, false); return; }
    if (ds.sg) { var s = ds.sg.split("|"); change(function () { d.signs[+s[0]][s[1]] = t.value; }, false); return; }
    if (ds.pname) { change(function () { d.parts.filter(function (p) { return p.id === ds.pname; })[0].name = t.value; }, false); return; }
    if (ds.doc === "gst") { change(function () { d.gst = U.num(t.value) || 0; }); return; }
  });
  /* keep the "convert unit" box open / closed across re-renders */
  document.addEventListener("toggle", function (e) { var t = e.target; if (!t || !t.dataset || !t.dataset.qcvd) return; S.est.cvOpen = t.open ? t.dataset.qcvd : "-" + t.dataset.qcvd; }, true);
  document.addEventListener("change", function (e) {
    var t = e.target, ds = t.dataset, d = doc();
    if (t.id === "est-owner") { U.watchEst(t.value); return; }
    if (t.id === "add-book") { S.est.addBook = t.value; S.est.addFocus = true; U.render(); setTimeout(function () { var n = document.getElementById("add-q"); if (n) n.focus(); }, 30); return; }
    if (!d || ro()) return;
    if (ds.qcv && t.type === "checkbox") { var qc = ds.qcv.split("|"); change(function () { var it = findItem(qc[0]); if (it) { if (t.checked) it.qceil = true; else delete it.qceil; } }); return; }
    if (ds.mk) { var p = ds.mk.split("|"); change(function () { var it = findItem(p[0]), r = it.meas[+p[1]]; r.k = t.value; if (r.k === "bbs") { if (!r.dia) r.dia = "10"; if (!r.sh) r.sh = "st"; if (!r.mem) r.mem = "slab"; if (!r.lvl) r.lvl = "above"; r.uf = EP.unitFactor(EP.itemInfo(it).unit); } }); }
    else if (ds.mref) { var a = ds.mref.split("|"); change(function () { findItem(a[0]).meas[+a[1]].ref = t.value; }); }
    else if (ds.mm) { var b = ds.mm.split("|"); change(function () { var r = findItem(b[0]).meas[+b[1]]; r.m = t.value; if (t.value === "kgcum" && !r.n) r.n = "50"; }); }
    else if (ds.msec) { var c = ds.msec.split("|"); change(function () { var r = findItem(c[0]).meas[+c[1]], st = EP.steel(t.value); var was = r.sec; r.sec = t.value || ""; if (st) r.f = String(st[1]); else if (t.value === "__pct" || was === "__pct") r.f = ""; }); }
    else if (ds.mvpart) { var mi = findItem(ds.mvpart), md = mi && (mi.b === "x" ? dupe(doc(), t.value, "x", null, mi.x && mi.x.libId, mi.id) : dupe(doc(), t.value, mi.b, mi.c, null, mi.id)); if (md) { t.value = mi.part; U.toast("Not moved — " + dupeMsg(doc(), md).replace(" Opened it — add more measurement rows there instead.", "")); return; } change(function () { findItem(ds.mvpart).part = t.value; }); }
    else if (ds.doc === "basis") { change(function () { d.basis = t.value; }); }
  });
  /* full-description popup for search results */
  var tip = null, tipFor = null;
  function tipEl() { if (!tip) { tip = document.createElement("div"); tip.id = "dd-tip"; tip.setAttribute("role", "tooltip"); tip.hidden = true; document.body.appendChild(tip); } return tip; }
  function showTip(btn, tap) {
    var k = btn.dataset.add, i = k.indexOf("|"), b = k.slice(0, i), c = k.slice(i + 1), bk = EP.BOOKS[b], it = bk && EP.item ? EP.item(b, c) : null;
    if (!it && bk) it = (bk.items || []).filter(function (x) { return x.code === c; })[0];
    if (!it) return;
    var t = tipEl(); tipFor = btn;
    t.innerHTML = (U.picBlock ? '<div class="tt-pic">' + U.picBlock(b, c, it.desc, it.unit) + "</div>" : "") + '<div class="tt-h"><strong>' + esc(it.code) + '</strong><span class="muted">' + esc(bk.name) + '</span><span class="num">₹' + inr(it.sor) + " / " + esc(it.unit) + '</span></div><div class="tt-b">' + hl(it.desc, S.est.addQ) + "</div>";
    t.hidden = false; t.style.pointerEvents = tap ? "auto" : "none";
    var r = btn.getBoundingClientRect(), dd = btn.closest(".dd").getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight, tw = Math.min(420, W - 32);
    t.style.width = tw + "px";
    var th = t.offsetHeight, left, top;
    if (dd.right + 12 + tw <= W - 8) { left = dd.right + 12; top = Math.min(Math.max(8, r.top), H - th - 8); }
    else { left = Math.max(16, Math.min(r.right - tw - 40, W - tw - 16)); var below = r.bottom + 6, above = r.top - th - 6; top = (r.top > H / 2 && above >= 8) || below + th > H - 8 ? Math.max(8, above) : below; }
    t.style.left = left + "px"; t.style.top = top + "px";
  }
  function hideTip() { if (tip) tip.hidden = true; tipFor = null; }
  U.hideTip = hideTip;
  document.addEventListener("mouseover", function (e) { var b = e.target.closest && e.target.closest(".dd button[data-add]"); if (b) { if (b !== tipFor) showTip(b); } else if (tipFor && !(e.target.closest && e.target.closest("#dd-tip"))) hideTip(); });
  document.addEventListener("focusin", function (e) { var b = e.target.closest && e.target.closest(".dd button[data-add]"); if (b) showTip(b); else if (tipFor) hideTip(); });
  document.addEventListener("focusin", function (e) { if (e.target.id === "add-q" && !S.est.addFocus) { S.est.addFocus = true; if (!S.est.addQ) U.render(); } });
  document.addEventListener("mousedown", function (e) { if (S.est.addFocus && !(e.target.closest && e.target.closest(".add-row"))) { S.est.addFocus = false; if (!S.est.addQ) { var dd = document.querySelector(".add-row .dd"); if (dd) dd.remove(); } } });
  document.addEventListener("click", function (e) { var i = e.target.closest && e.target.closest(".ddi"); if (!i) return; e.preventDefault(); e.stopPropagation(); showTip(i.closest("button[data-add]"), true); }, true);
  document.addEventListener("click", function (e) { if (tipFor && !(e.target.closest && e.target.closest(".dd,#dd-tip"))) hideTip(); });
  window.addEventListener("scroll", function () { if (tipFor) { if (document.body.contains(tipFor)) showTip(tipFor, tip.style.pointerEvents === "auto"); else hideTip(); } }, true);
  document.addEventListener("keydown", function (e) {
    var b = e.target.closest && e.target.closest(".add-row .dd button"), q = e.target.id === "add-q";
    if ((b || q) && (e.key === "ArrowDown" || e.key === "ArrowUp")) { var all = [].slice.call(document.querySelectorAll(".add-row .dd button")); if (!all.length) return; e.preventDefault(); var n = q ? (e.key === "ArrowDown" ? 0 : all.length - 1) : all.indexOf(b) + (e.key === "ArrowDown" ? 1 : -1); if (n < 0) { document.getElementById("add-q").focus(); hideTip(); return; } all[Math.min(n, all.length - 1)].focus(); }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && S.est.addQ) { hideTip(); S.est.addQ = ""; U.render(); } });
  document.addEventListener("submit", function (e) {
    if (e.target.id === "copy-form") { e.preventDefault(); copyEstimate(); return; }
    if (e.target.id === "firm-form") { e.preventDefault(); var nm = document.getElementById("firm-name").value.trim(), dd = doc(); if (!nm || !dd) return;
      var list = firms().filter(function (f) { return f.name.toLowerCase() !== nm.toLowerCase(); });
      list.push({ id: EP.uid(), name: nm, header: { org: dd.header.org || "", office: dd.header.office || "", project: dd.header.project || "" }, signs: JSON.parse(JSON.stringify(dd.signs)), gst: dd.gst });
      list.sort(function (a, b) { return a.name.localeCompare(b.name); }); saveFirms(list, "Saved firm “" + nm + "”"); return; }
    if (e.target.id !== "new-est") return; e.preventDefault();
    var n = document.getElementById("new-name").value.trim(); if (!n) return;
    var fs = document.getElementById("new-firm");
    newEstimate(n, EP.newDoc(defaults(fs && fs.value)));
  });
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t || t.closest("nav.tabs")) return;
    var ds = t.dataset, d = doc();
    if (t.id === "copy-est") { S.est.copyOpen = true; U.render(); setTimeout(function () { var n = document.getElementById("copy-name"); if (n) { n.focus(); n.select(); } }, 30); return; }
    if (t.id === "copy-cancel") { S.est.copyOpen = false; U.render(); return; }
    if (t.id === "proj-btn") { if (S.est.pickOpen) { S.est.pickOpen = false; U.render(); } else openPicker(false); return; }
    if (t.id === "proj-new") { openPicker(true); return; }
    if (ds.est) { S.est.copyOpen = false; S.est.selId = ds.est; S.est.pickOpen = false; S.est.pq = ""; pick(); U.render(); return; }
    if (ds.sub) { S.est.sub = ds.sub; U.render(); return; }
    if (ds.part) { S.est.part = ds.part; S.est.addQ = ""; U.render(); return; }
    if (t.id === "mk-example") { example(); return; }
    if (ds.xlwa) { sendWa(ds.xlwa); if (U.logAct) U.logAct("export", (S.est.cur ? S.est.cur.name : "") + " · " + ds.xlwa + " · WhatsApp"); return; }
    if (ds.xl) { exportXl(ds.xl); if (U.logAct) U.logAct("export", (S.est.cur ? S.est.cur.name : "") + " · " + ds.xl); return; }
    if (ds.open) { var was = !!S.est.open[ds.open]; S.est.open = {}; if (!was) S.est.open[ds.open] = true; U.render(); if (!was) setTimeout(function () { var p = document.getElementById("mpanel"); if (p) p.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60); return; }
    if (!d || ro()) return;
    if (ds.add) { var p = ds.add.split("|"), b = p[0], c = p.slice(1).join("|"), id = EP.uid(); if (U.pushRecent) U.pushRecent(b, c);
      var dup = dupe(d, curPart(), b, c); if (dup) { S.est.addQ = ""; S.est.addFocus = false; S.est.open = {}; S.est.open[dup.id] = true; U.render(); U.toast(dupeMsg(d, dup)); return; } change(function () { d.items.push({ id: id, part: curPart(), b: b, c: c, q: "", rem: "", meas: [] }); }); S.est.addQ = ""; S.est.addFocus = false; S.est.open = {}; S.est.open[id] = true;
      var sv0 = U.savedFor ? U.savedFor(b, c) : []; if (sv0.length) { if (S.anchk) S.anchk.open[id] = true; U.render(); U.toast("You have " + sv0.length + " saved analysis for " + c + " — click “Use” below to apply it"); return; }
      var an0 = EP.anOf(b, c); if (an0 && an0.far != null) { if (S.anchk) S.anchk.open[id] = true; U.render(); U.toast("Check the analysis: MoRTH analysis differs " + (an0.far >= 0 ? "+" : "") + an0.far + "% from the SOR rate — it is opened below"); return; }
      U.render(); return; }
    if (t.id === "add-x") { var xid = EP.uid(); change(function () { d.items.push({ id: xid, part: curPart(), b: "x", x: { desc: "", unit: "", sor: "", an: "", src: "As per market quote" }, q: "", rem: "", meas: [] }); }); S.est.open = {}; S.est.open[xid] = true; U.render(); setTimeout(function () { var n = document.getElementById("x-desc-" + xid); if (n) n.focus(); }, 60); return; }
    if (t.id === "add-part") { change(function () { var n = d.parts.length, id = EP.uid(); d.parts.push({ id: id, name: "Part " + String.fromCharCode(65 + n) }); S.est.part = id; }); return; }
    if (ds.pdel) { if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again to delete"; return; } change(function () { d.parts = d.parts.filter(function (p) { return p.id !== ds.pdel; }); d.items = d.items.filter(function (i) { return i.part !== ds.pdel; }); }); return; }
    if (ds.qcvp) { var qv = ds.qcvp.split("|"); S.est.cvOpen = qv[0]; change(function () { var it = findItem(qv[0]); if (!it) return; var iu = EP.itemInfo(it).unit; if (qv[1] === "") { delete it.qu; delete it.qk; delete it.qsz; return; } it.qu = qv[1]; var one = EP.units.conv(1, iu, qv[1]); it.qsz = String(+one.toPrecision(7)); it.qk = String(1 / one); }); return; }
    if (ds.mdup) { var mdp = ds.mdup.split("|"); change(function () { var it = findItem(mdp[0]), ri = +mdp[1]; if (it && it.meas && it.meas[ri]) { var cp = JSON.parse(JSON.stringify(it.meas[ri])); delete cp.src; it.meas.splice(ri + 1, 0, cp); } }); return; }
    if (ds.madd) { var m = ds.madd.split("|"); change(function () { var it = findItem(m[0]); it.meas = it.meas || []; it.meas.push({ k: m[1], d: "", n: m[1] === "+" || m[1] === "-" ? "1" : "" }); }); setTimeout(function () { var it = findItem(m[0]), ri = it.meas.length - 1, n = document.getElementById("m-" + it.id + "-" + ri + "-d"); if (n) n.focus(); }, 60); return; }
    if (ds.mdel) { var md = ds.mdel.split("|"); change(function () { findItem(md[0]).meas.splice(+md[1], 1); }); return; }
    if (ds.mv) { var mv = ds.mv.split("|"); change(function () { var it = findItem(mv[0]), list = EP.partItems(d, it.part), i = list.indexOf(it), j = i + (+mv[1]); if (j < 0 || j >= list.length) return; var a = d.items.indexOf(it), b2 = d.items.indexOf(list[j]); d.items[a] = list[j]; d.items[b2] = it; }); return; }
    if (ds.del) { if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Remove?"; return; } change(function () { d.items = d.items.filter(function (i) { return i.id !== ds.del; }); d.items.forEach(function (i) { (i.meas || []).forEach(function (r) { if (r.ref === ds.del) r.ref = ""; }); }); }); return; }
    if (t.id === "save-def") { saveDefaults(); return; }
    if (t.id === "firm-apply") { var fid = document.getElementById("firm-sel").value, f = firms().filter(function (x) { return x.id === fid; })[0]; if (!f) return;
      change(function () { var w = d.header.work; d.header = Object.assign({}, f.header, { work: w }); d.signs = JSON.parse(JSON.stringify(f.signs || d.signs)); if (f.gst != null) d.gst = f.gst; }); U.toast("Applied “" + f.name + "” header"); return; }
    if (t.id === "firm-del") { if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again to delete"; return; } var fid2 = document.getElementById("firm-sel").value; saveFirms(firms().filter(function (x) { return x.id !== fid2; }), "Firm deleted"); return; }
    if (t.id === "del-est") {
      if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again to delete"; t.classList.add("sec"); return; }
      var did = S.est.cur.id;
      db().from("estimates").delete().eq("id", did).then(function (r) { if (U.fail(r, "Couldn't delete the estimate.")) return; if (U.logAct) U.logAct("est_del", (S.est.list.filter(function (x) { return x.id === did; })[0] || {}).name || ""); U.toast("Estimate deleted"); S.est.list = S.est.list.filter(function (x) { return x.id !== did; }); if (S.est.owner === S.me.id) S.est.mine = S.est.list; S.est.selId = S.est.list[0] ? S.est.list[0].id : null; pick(); U.render(); });
    }
  });
  async function saveDefaults() {
    var d = doc(), def = { header: Object.assign({}, d.header, { work: "" }), signs: d.signs, gst: d.gst, firms: firms() };
    var r = await db().from("profiles").update({ defaults: def }).eq("id", S.me.id);
    if (U.fail(r, "Couldn't save your default header.")) return; S.me.defaults = def; U.toast("New estimates will start with this header");
  }
  function exportXl(which) {
    var d = doc(); if (!d) return;
    try { EP.download(EP.buildWorkbook(d, which), fileName(which)); U.toast("Excel file downloaded"); }
    catch (err) { console.error(err); U.toast("Couldn't create the Excel file."); }
  }
  /* Example based on the weigh-bridge estimate (Part A: CPWD, Part B: MPPWD road) */
  function example() {
    var R = function (k, d, n, l, b, h, f) { return { k: k, d: d, n: n, l: l, b: b, h: h, f: f }; };
    var d = EP.newDoc(defaults());
    if (!d.header.org) d.header = { org: "SOUTH EASTERN COALFIELDS LIMITED", office: "OFFICE OF THE PROJECT ENGINEER (CIVIL)", project: "GEVRA PROJECT", work: "Repairing of control rooms of 15 weigh bridges and construction of approach road (example)" };
    else d.header.work = "Repairing of control rooms of weigh bridges and approach road (example)";
    d.parts = [{ id: "A", name: "Part A" }, { id: "B", name: "Part B" }];
    var sid = EP.uid(), cid = EP.uid();
    d.items = [
      { id: EP.uid(), part: "A", b: "cpwd", c: "14.87", meas: [R("+", "Roof type 1", "8", "5", "5"), R("+", "Roof type 2", "7", "5", "9")] },
      { id: EP.uid(), part: "A", b: "cpwd", c: "6.34.2", meas: [R("+", "Lumpsum repairs", "15", "2", "0.23", "1")] },
      { id: sid, part: "A", b: "cpwd", c: "10.1", meas: [{ k: "+", d: "Rafters", n: "96", l: "3.5", sec: "ISMB 100", f: "11.5" }, { k: "+", d: "Purlins", n: "8", l: "44", sec: "ISA 75x75x6", f: String(EP.steel("ISA 75x75x6")[1]) }] },
      { id: EP.uid(), part: "A", b: "cpwd", c: "13.88", meas: [R("+", "Main building walls", "1", "130", "3.1"), R("+", "Block A", "1", "40", "3.1"), R("h", "Deduction"), R("-", "Doors", "10", "0.9", "2.1"), R("-", "Windows", "18", "1.1", "1.1")] },
      { id: cid, part: "B", b: "mp", c: "13.6.B", meas: [R("+", "Road slab", "17", "20", "5", "0.3"), R("+", "Apron", "30", "10", "3", "0.15")] },
      { id: EP.uid(), part: "B", b: "mp", c: "3.3", meas: [R("+", "", "17", "20", "5", "0.7"), R("+", "Drain", "30", "20", "0.8", "0.3")] },
      { id: EP.uid(), part: "B", b: "mp", c: "4.1", meas: [R("+", "", "17", "20", "5", "0.3")] }
    ];
    if (EP.item("hort", "2.35")) d.items.push({ id: EP.uid(), part: "A", b: "hort", c: "2.35", q: "600", meas: [] });
    newEstimate("Weigh-bridge repairs & approach road (example)", d);
  }
  EP.exampleDoc = example;
})();
