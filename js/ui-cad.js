/* Estimate Pro — CAD Studio tab: list of drawings, the editor workspace (ribbon, properties, layers, blocks, settings, status bar),
   saving (this device first, then the cloud table cad_drawings), revisions, recovery, DXF / PDF / image import, DXF / PDF / PNG export,
   quantity take-off into an estimate, and "Open in CAD" for Design Studio drawings. */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc, CAD = EP.cad, G = EP.geom, UN = EP.units;
  S.cad = { list: null, cur: null, ed: null, root: null, panel: "props", cloudOk: true, cloudErr: "", saveState: "", side: true, dlg: null, revs: null };
  var C = S.cad;
  function db() { return U.db(); }
  function me() { return S.me && S.me.id; }
  function uuid() { return crypto.randomUUID ? crypto.randomUUID() : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, function (c) { return (c ^ Math.random() * 16 >> c / 4).toString(16); }); }
  function kv() { return U.off; }
  function when(t) { if (!t) return ""; var d = new Date(t); return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); }
  function dl(blob, name) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
  function fname(s) { return String(s || "drawing").replace(/[^A-Za-z0-9ऀ-ॿ_-]+/g, "_").slice(0, 60); }

  /* ================= storage ================= */
  async function localIdx() { return (kv() && await kv().get("cadidx:" + me())) || []; }
  async function setLocalIdx(L) { if (kv()) await kv().put("cadidx:" + me(), L); }
  async function saveLocal(meta, data) {
    if (!kv()) return; await kv().put("cad:" + meta.id, { meta: meta, data: data, at: Date.now() });
    var L = await localIdx(), i = L.findIndex(function (x) { return x.id === meta.id; }), row = { id: meta.id, name: meta.name, units: data.units.disp, ents: data.ents.length, updated: Date.now(), synced: !!meta.synced };
    if (i >= 0) L[i] = Object.assign(L[i], row); else L.unshift(row); await setLocalIdx(L);
  }
  async function loadList() {
    C.list = C.list || []; var loc = await localIdx(), cloud = [];
    try {
      var r = await db().from("cad_drawings").select("id,name,units,ents,thumb,owner,updated_at,kind").eq("owner", me()).order("updated_at", { ascending: false });
      if (r.error) { if (!(U.off && U.off.isNet(r.error))) { C.cloudOk = false; C.cloudErr = r.error.message; } } else { C.cloudOk = true; cloud = r.data || []; }
    } catch (e) { /* offline */ }
    var map = {}; cloud.forEach(function (x) { map[x.id] = { id: x.id, name: x.name, units: x.units, ents: x.ents, thumb: x.thumb, updated: Date.parse(x.updated_at), cloud: true }; });
    loc.forEach(function (x) { var m = map[x.id]; if (m) { m.local = true; if (x.updated > m.updated + 3000 && !x.synced) m.unsynced = true; } else map[x.id] = Object.assign({ local: true, unsynced: !x.synced }, x); });
    C.list = Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) { return b.updated - a.updated; });
    U.render();
  }
  async function loadDoc(id) {
    var loc = kv() ? await kv().get("cad:" + id) : null, cloud = null;
    try { var r = await db().from("cad_drawings").select("*").eq("id", id).maybeSingle(); if (!r.error && r.data) cloud = r.data; } catch (e) {}
    if (!loc && !cloud) return null;
    var cAt = cloud ? Date.parse(cloud.updated_at) : 0, useLocal = loc && (!cloud || (loc.at > cAt + 3000 && !loc.meta.synced));
    var data = useLocal ? loc.data : cloud.data, meta = useLocal ? loc.meta : { id: cloud.id, name: cloud.name, owner: cloud.owner, synced: true };
    meta.ro = cloud ? cloud.owner !== me() && !S.me.isOwner : false; meta.owner = meta.owner || (cloud && cloud.owner) || me();
    return { meta: meta, data: data, recovered: useLocal && !!cloud, cloudAt: cAt };
  }
  var tLocal = 0, tCloud = 0;
  function changed() {
    if (!C.cur || C.cur.ro) return; C.cur.synced = false; setState("Saving on this device…");
    var cur = C.cur, d = C.ed.doc.d; clearTimeout(tLocal); tLocal = setTimeout(function () { tLocal = 0; saveLocal(cur, d).then(function () { if (C.cur === cur) setState(C.cloudOk && navigator.onLine ? "Saved on this device · uploading…" : "Saved on this device"); }); }, 700);
    clearTimeout(tCloud); tCloud = setTimeout(function () { saveCloud(false); }, 6000);
  }
  async function saveCloud(withThumb) {
    clearTimeout(tCloud); if (!C.cur || C.cur.ro || !C.ed) return;
    var cur = C.cur, ed = C.ed, d = ed.doc.d, row = { id: C.cur.id, owner: C.cur.owner || me(), name: d.name || C.cur.name, kind: "2d", data: d, units: d.units.disp, ents: d.ents.length };
    if (withThumb) { try { row.thumb = CAD.plotPng(ed, null, 320); } catch (e) {} }
    try {
      await uploadAssets(ed, cur);
      var r = await db().from("cad_drawings").upsert(row);
      if (r.error) { if (U.off && U.off.isNet(r.error)) { setState("Saved on this device (no network)"); return; } C.cloudOk = false; C.cloudErr = r.error.message; setState("Saved on this device only — cloud: " + r.error.message); return; }
      cur.synced = true; C.cloudOk = true; await saveLocal(cur, d); if (C.cur === cur) setState("Saved");
    } catch (e) { setState("Saved on this device"); }
  }
  function setState(t) { C.saveState = t; var el = C.root && C.root.querySelector(".cad-save"); if (el) el.textContent = t; }

  /* ----- underlay image assets ----- */
  async function assetBlob(id) {
    var b = kv() ? await kv().get("cadasset:" + id) : null; if (b) return b;
    var a = C.ed && C.ed.doc.d.assets[id]; if (!a || !a.path) return null;
    try { var r = await db().storage.from("cad-assets").download(a.path); if (!r.error && r.data) { if (kv()) await kv().put("cadasset:" + id, r.data); return r.data; } } catch (e) {}
    return null;
  }
  async function loadImages() {
    var ed = C.ed, A = ed.doc.d.assets || {};
    for (var id in A) { if (ed.images[id] || A[id].kind === "glb") continue; var b = await assetBlob(id); if (!b) continue; var im = new Image(); im.onload = function () { ed.dirty = true; }; im.src = URL.createObjectURL(b); ed.images[id] = im; }
  }
  async function uploadAssets(ed, cur) {
    var A = ed.doc.d.assets || {}, changedA = false;
    for (var id in A) {
      var a = A[id]; if (a.path) continue; var b = kv() ? await kv().get("cadasset:" + id) : null; if (!b) continue;
      var path = me() + "/" + cur.id + "/" + id + (a.kind === "glb" ? ".glb" : a.mime === "image/png" ? ".png" : ".jpg"), r = await db().storage.from("cad-assets").upload(path, b, { contentType: a.mime || "image/jpeg", upsert: true });
      if (!r.error) { a.path = path; changedA = true; }
    }
    return changedA;
  }

  /* ================= open / close ================= */
  async function openDrawing(id, fresh) {
    var L = fresh || await loadDoc(id); if (!L) { U.toast("Drawing not found"); return; }
    closeEditor(); C.cur = L.meta; C.recovered = L.recovered; C.side = window.innerWidth > 820;
    var doc = new CAD.Doc(L.data); buildRoot(); C.ed = new CAD.Editor(C.root.querySelector(".cad-edhost"), doc, { settings: loadSettings() });
    wireEditor(); loadImages(); renderPanels(); setState(L.recovered ? "Restored unsaved changes from this device" : "Saved"); C.revs = null;
    if (L.recovered) changed();
    if (U.logAct) U.logAct("cad_open", L.meta.name || "");
    U.render(); setTimeout(function () { C.ed.resize(); C.ed.zoomExtents(); var cv = C.root.querySelector(".cad-cv"); if (cv) cv.focus({ preventScroll: true }); }, 50);
  }
  function closeEditor() {
    if (C.ed) { if (tLocal) { clearTimeout(tLocal); tLocal = 0; saveLocal(C.cur, C.ed.doc.d); } if (C.cur && !C.cur.synced && !C.cur.ro) saveCloud(true); C.ed.destroy(); }
    clearTimeout(tCloud); C.ed = null; C.root = null; C.cur = null;
  }
  async function newDrawing(name, unit, data) {
    var id = uuid(), d = data || CAD.newDoc(name || "Drawing", unit || "mm"); d.name = name || d.name;
    if (unit) d.units.disp = unit;
    var meta = { id: id, name: d.name, owner: me(), synced: false };
    await saveLocal(meta, d); await openDrawing(id, { meta: meta, data: d }); changed(); saveCloud(true);
    return id;
  }
  CAD.newDrawing = newDrawing; CAD.ui = { renderPanels: function () { renderPanels(); }, dialog: function (h, f) { return dialog(h, f); }, closeDialog: function () { closeDialog(); }, dl: dl, fname: fname, unitLabel: function (u) { return unitLabel(u); }, saveCloud: function (t) { return saveCloud(t); }, assetBlob: function (id) { return assetBlob(id); }, applyProp: function (k, v) { applyProp(k, v); } };

  /* ================= settings remembered per user ================= */
  function loadSettings() { try { return JSON.parse(localStorage.getItem("ep_cad_set") || "{}"); } catch (e) { return {}; } }
  function saveSettings() { try { var s = Object.assign({}, C.ed.set); localStorage.setItem("ep_cad_set", JSON.stringify(s)); } catch (e) {} }

  /* ================= the workspace DOM ================= */
  CAD.SIDE_TABS = [["props", "Properties"], ["layers", "Layers"], ["blocks", "Blocks"], ["settings", "Settings"]]; CAD.PANELS = {}; CAD.ACTIONS = {}; CAD.HOOKS = { wire: [], change: [], fields: null, top: [] };
  var RIBBON = CAD.RIBBON = [
    ["Draw", [["LINE", "Line"], ["PLINE", "Polyline"], ["RECTANG", "Rectangle"], ["CIRCLE", "Circle"], ["ARC", "Arc"], ["POLYGON", "Polygon"], ["ELLIPSE", "Ellipse"], ["SPLINE", "Spline"], ["XLINE", "Constr. line"], ["POINT", "Point"], ["HATCH", "Hatch"], ["BOUNDARY", "Boundary"]]],
    ["Modify", [["MOVE", "Move"], ["COPY", "Copy"], ["ROTATE", "Rotate"], ["SCALE", "Scale"], ["MIRROR", "Mirror"], ["OFFSET", "Offset"], ["TRIM", "Trim"], ["EXTEND", "Extend"], ["FILLET", "Fillet"], ["CHAMFER", "Chamfer"], ["ARRAY", "Array"], ["STRETCH", "Stretch"], ["BREAK", "Break"], ["JOIN", "Join"], ["EXPLODE", "Explode"], ["MATCHPROP", "Match prop."], ["ERASE", "Erase"]]],
    ["Annotate", [["TEXT", "Text"], ["MTEXT", "Multiline text"], ["DIMLINEAR", "Linear dim"], ["DIMALIGNED", "Aligned dim"], ["DIMCONTINUE", "Continue dim"], ["DIMBASELINE", "Baseline dim"], ["DIMANGULAR", "Angle dim"], ["DIMRADIUS", "Radius"], ["DIMDIAMETER", "Diameter"], ["DIMORDINATE", "Ordinate"], ["LEADER", "Leader"]]],
    ["Block", [["BLOCK", "Make block"], ["INSERT", "Insert block"], ["GROUP", "Group"], ["UNGROUP", "Ungroup"], ["DRAWORDER", "Draw order"]]],
    ["Measure", [["DIST", "Distance"], ["AREA", "Area"], ["LIST", "List"], ["DIVIDE", "Divide"], ["MEASURE", "Measure"], ["TAKEOFF", "Take-off → estimate"]]],
    ["View", [["ZOOM", "Zoom"], ["PAN", "Pan"], ["ISOLATE", "Isolate"], ["UNISOLATE", "Show all"], ["REGEN", "Regen"]]]
  ];
  /* tabbed icon ribbon: Home (most used) + one tab per command group */
  CAD.HOME = [["LINE", "Line"], ["PLINE", "Polyline"], ["RECTANG", "Rectangle"], ["CIRCLE", "Circle"], ["HATCH", "Hatch"], ["MOVE", "Move"], ["COPY", "Copy"], ["OFFSET", "Offset"], ["TRIM", "Trim"], ["ERASE", "Erase"], ["DIMLINEAR", "Dimension"], ["TEXT", "Text"], ["WALL", "Wall"], ["DOOR", "Door"], ["WINDOW", "Window"], ["SLAB", "Slab"], ["COLUMN", "Column"], ["DIST", "Distance"], ["AREA", "Area"]];
  /* sections inside each tab (label under the group, like an office ribbon). Commands listed here that a tab does not
     have yet are added with the label from RLABEL; buttons of a tab that are in no section fall into "More". */
  CAD.RSEC = {
    "Draw": [["Lines", ["LINE", "PLINE", "XLINE", "RAY"]], ["Shapes", ["RECTANG", "CIRCLE", "ARC", "POLYGON", "ELLIPSE", "SPLINE", "POINT"]], ["Fill", ["HATCH", "BOUNDARY"]]],
    "Modify": [["Move and copy", ["MOVE", "COPY", "ROTATE", "SCALE", "MIRROR", "ARRAY", "STRETCH"]], ["Edit shape", ["OFFSET", "TRIM", "EXTEND", "FILLET", "CHAMFER", "BREAK", "JOIN", "EXPLODE"]], ["Properties", ["MATCHPROP", "GRIPLINK", "ERASE"]], ["Clipboard", ["COPYCLIP", "CUTCLIP", "PASTECLIP"]]],
    "Annotate": [["Text", ["TEXT", "MTEXT", "LEADER"]], ["Dimensions", ["DIMLINEAR", "DIMALIGNED", "DIMCONTINUE", "DIMBASELINE", "DIMANGULAR", "DIMRADIUS", "DIMDIAMETER", "DIMORDINATE"]], ["Building", ["DIMWALLS"]], ["Style", ["DIMSTYLE"]]],
    "Building (BIM)": [["Structure", ["WALL", "COLUMN", "BEAM", "SLAB", "FOOTING"]], ["Openings", ["DOOR", "WINDOW", "OPENING"]], ["Roof, stairs and edges", ["ROOF", "STAIR", "RAILING", "PARAPET"]], ["Rooms and floors", ["ROOM", "LEVEL", "FLOORCOPY"]], ["Wall finishes", ["WALLFINISH"]], ["Steel", ["REBAR", "BBS"]], ["Results", ["DIMWALLS", "BIM3D", "QUANTITIES"]]],
    "Site & services": [["Place", ["ASSET", "LANDAREA"]]],
    "Block": [["Blocks", ["BLOCK", "INSERT"]], ["Groups and order", ["GROUP", "UNGROUP", "DRAWORDER"]]],
    "Measure": [["Enquiry", ["DIST", "AREA", "ID", "LIST"]], ["Mark points", ["DIVIDE", "MEASURE"]], ["To estimate", ["TAKEOFF", "QUANTITIES"]]],
    "View": [["Navigate", ["ZOOM", "PAN", "REGEN"]], ["Show / hide", ["ISOLATE", "UNISOLATE", "LAYOFF", "LAYON"]], ["Setup", ["LAYER", "PROPERTIES", "UNITS"]]]
  };
  CAD.RLABEL = { RAY: "Ray", GRIPLINK: "Linked corners", COPYCLIP: "Copy", CUTCLIP: "Cut", PASTECLIP: "Paste", DIMSTYLE: "Dim style", LEVEL: "Levels", BIM3D: "3D view", QUANTITIES: "Σ Quantities", ID: "Point ID", LAYOFF: "Layer off", LAYON: "All layers on", LAYER: "Layers", PROPERTIES: "Properties", UNITS: "Units", DIMWALLS: "Auto dimension" };
  function ribbonTab(t) {
    var btn = function (b) { return "<button type='button' class='cad-rb' data-cc='" + b[0] + "' title='" + U.esc(b[1]) + " (" + b[0] + ")'>" + (CAD.icon ? CAD.icon(b[0], b[1]) : "") + "<span>" + U.esc(b[1]) + "</span></button>"; };
    var secs = CAD.RSEC[t[0]]; if (!secs) return t[1].map(btn).join("");
    var lab = {}, used = {}; t[1].forEach(function (b) { lab[b[0]] = b[1]; });
    var out = secs.map(function (sc) { var bs = sc[1].filter(function (c) { return (lab[c] || CAD.RLABEL[c]); }).map(function (c) { used[c] = 1; return [c, lab[c] || CAD.RLABEL[c]]; }); return bs.length ? [sc[0], bs] : null; }).filter(Boolean);
    var rest = t[1].filter(function (b) { return !used[b[0]]; }); if (rest.length) out.push(["More", rest]);
    return out.map(function (sc) { return "<div class='cad-sub'><div class='cad-subrow'>" + sc[1].map(btn).join("") + "</div><div class='cad-gt'>" + U.esc(sc[0]) + "</div></div>"; }).join("");
  }
  function ribbonHtml() {
    var ORD = ["Draw", "Modify", "Annotate", "Building (BIM)", "Roads & earthwork", "Site & services", "Block", "Measure", "View"], tabs = [["Home", CAD.HOME]].concat(RIBBON.slice().sort(function (x, y) { var i = ORD.indexOf(x[0]), j = ORD.indexOf(y[0]); return (i < 0 ? 99 : i) - (j < 0 ? 99 : j); })), cur = C.rtab || (function () { try { return localStorage.getItem("ep_cad_rtab"); } catch (e) { return null; } })() || "Home"; if (!tabs.some(function (t) { return t[0] === cur; })) cur = "Home"; C.rtab = cur;
    return "<div class='cad-rtabs' role='tablist' aria-label='Ribbon'>" + tabs.map(function (t) { return "<button type='button' role='tab' data-rtab='" + U.esc(t[0]) + "' aria-selected='" + (t[0] === cur) + "'>" + U.esc(t[0]) + "</button>"; }).join("") + "</div>" +
      "<div class='cad-ribbon' role='toolbar' aria-label='CAD commands'>" + tabs.map(function (t) { return "<div class='cad-grp" + (t[0] === cur ? " on" : "") + "' data-rgrp='" + U.esc(t[0]) + "'>" + ribbonTab(t) + "</div>"; }).join("") + "</div>";
  }
  CAD.ACTIONS.fullscr = function (ed, C2) {
    var on = !document.body.classList.contains("cadmax"); document.body.classList.toggle("cadmax", on);
    try { if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(function () {}); if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {}); } catch (e) {}
    var b = C.root && C.root.querySelector("[data-cad=fullscr]"); if (b) { b.setAttribute("aria-pressed", String(on)); b.innerHTML = on ? "⤡ Exit full screen" : "⛶ Full screen"; }
    fitHost(); setTimeout(function () { if (C.ed) { C.ed.resize(); C.ed.dirty = true; } }, 60);
  };
  document.addEventListener("fullscreenchange", function () { if (!document.fullscreenElement && document.body.classList.contains("cadmax")) CAD.ACTIONS.fullscr(); });
  function buildRoot() {
    var r = document.createElement("div"); r.className = "cadapp"; C.root = r;
    r.innerHTML = "<div class='cad-top'><button type='button' class='btn ghost sm' data-cad='back'>← Drawings</button><input class='in cad-name' aria-label='Drawing name'><span class='cad-save muted'></span><span class='grow'></span>" +
      "<button type='button' class='btn ghost sm' data-cad='undo' title='Undo (Ctrl+Z)'>↶ Undo</button><button type='button' class='btn ghost sm' data-cad='redo' title='Redo (Ctrl+Y)'>↷ Redo</button>" +
      "<div class='cad-menu'><button type='button' class='btn sec sm' data-cad='menu' aria-haspopup='true'>File ▾</button><div class='cad-pop' hidden>" +
      [["save", "Save now (Ctrl+S)"], ["rev", "Save as revision…"], ["revs", "Revisions…"], ["-"], ["impdxf", "Insert DXF into this drawing…"], ["img", "Attach image underlay (JPG / PNG)…"], ["pdf", "Attach PDF (vectors or image)…"], ["-"], ["expdxf", "Export DXF (AutoCAD R12)"], ["exppdf", "Plot PDF sheet…"], ["exppng", "Export PNG image"]].concat(CAD.MENU_EXTRA || [], [["-"], ["takeoff", "Take-off to estimate…"], ["dup", "Save a copy"], ["delete", "Delete this drawing"]]).map(function (m) { return m[0] === "-" ? "<hr>" : "<button type='button' data-cad='" + m[0] + "'>" + m[1] + "</button>"; }).join("") + "</div></div>" +
      CAD.HOOKS.top.map(function (f) { return f(); }).join("") + "<button type='button' class='btn ghost sm cad-sidebtn' data-cad='side' title='Show / hide the side panel'>☰ Panel</button><button type='button' class='btn ghost sm' data-cad='fullscr' aria-pressed='" + document.body.classList.contains("cadmax") + "' title='Use the whole screen for CAD Studio'>" + (document.body.classList.contains("cadmax") ? "⤡ Exit full screen" : "⛶ Full screen") + "</button></div>" +
      ribbonHtml() +
      "<div class='cad-body'><div class='cad-edhost'></div><aside class='cad-side'><div class='seg cad-tabs' role='tablist'>" + CAD.SIDE_TABS.map(function (t) { return "<button type='button' data-cadtab='" + t[0] + "'>" + t[1] + "</button>"; }).join("") + "</div><div class='cad-panel'></div></aside></div>" +
      "<div class='cad-status'>" + [["grid", "GRID"], ["gsnap", "SNAP"], ["ortho", "ORTHO"], ["polar", "POLAR"], ["osnap", "OSNAP"], ["otrack", "OTRACK"], ["lwt", "LWT"]].map(function (t) { return "<button type='button' data-cadt='" + t[0] + "'>" + t[1] + "</button>"; }).join("") +
      "<span class='grow'></span><span class='cad-layer-cur muted'></span><button type='button' class='btn ghost sm' data-cad='esc' title='Cancel (Esc)'>Esc</button><button type='button' class='btn ghost sm' data-cad='enter' title='Enter'>Enter ↵</button><button type='button' class='btn ghost sm' data-cad='zext' title='Zoom to everything'>Zoom all</button></div>" +
      "<div class='cad-dlg' hidden></div>";
    r.querySelector(".cad-name").value = (C.cur && C.cur.name) || "";
    if (C.cur && C.cur.ro) r.classList.add("ro");
    bindRoot(r);
  }
  function wireEditor() {
    var ed = C.ed, rt = C.root, pt = 0;
    ed.onChange = function () { changed(); clearTimeout(pt); pt = setTimeout(renderPanels, 120); CAD.HOOKS.change.forEach(function (f) { f(ed, C); }); };
    ed.onSel = function () { clearTimeout(pt); pt = setTimeout(renderPanels, 60); };
    ed.onSave = function () { saveCloud(true); };
    ed.onPanel = function (p) { C.panel = p; C.side = true; renderPanels(); };
    ed.onSettings = function () { saveSettings(); renderStatus(); };
    ed.onTakeoff = function (res) { openTakeoff(res); };
    CAD.HOOKS.wire.forEach(function (f) { f(ed, C); });
    ed.onEdit = function (e) { if (e.t === "text") { var s = window.prompt("Edit text", e.s); if (s != null) { ed.doc.begin("Edit text"); ed.doc.mod(e.id, Object.assign(CAD.clone(e), { s: s })); ed.doc.commit(); } } else { ed.sel = new Set([e.id]); ed.emitSel(); C.panel = "props"; renderPanels(); } };
    if (C.cur.ro) { ed.doc.begin = function () { return ed.doc; }; ed.doc.rec = function () { U.toast("This drawing is read-only (it belongs to another user)"); }; }
    renderStatus();
  }
  function renderStatus() { if (!C.root || !C.ed) return; C.root.querySelectorAll("[data-cadt]").forEach(function (b) { b.setAttribute("aria-pressed", String(!!C.ed.set[b.dataset.cadt])); }); var lc = C.root.querySelector(".cad-layer-cur"); if (lc) lc.textContent = "Layer: " + C.ed.doc.d.cur.layer + " · " + unitLabel(C.ed.doc.d.units.disp); C.root.classList.toggle("noside", !C.side); }
  function unitLabel(u) { return { mm: "millimetres", cm: "centimetres", m: "metres", in: "inches", ft: "feet (decimal)", ftin: "feet-inches", km: "kilometres", yd: "yards" }[u] || u; }

  /* ================= side panels ================= */
  var COLORS = [[null, "ByLayer"], [1, "Red"], [2, "Yellow"], [3, "Green"], [4, "Cyan"], [5, "Blue"], [6, "Magenta"], [7, "White / black"], [8, "Dark grey"], [9, "Light grey"], [30, "Orange"], [140, "Sky blue"], [40, "Brown"]];
  function colorSel(attr, val, allowBy) { var known = COLORS.some(function (c) { return c[0] === val; }); return "<select class='in small' " + attr + ">" + COLORS.filter(function (c) { return allowBy || c[0] != null; }).map(function (c) { return "<option value='" + (c[0] == null ? "" : c[0]) + "'" + (c[0] === val ? " selected" : "") + ">" + (c[0] != null ? "■ " : "") + c[1] + "</option>"; }).join("") + (!known && val != null ? "<option value='" + esc(val) + "' selected>" + esc(typeof val === "number" ? "ACI " + val : val) + "</option>" : "") + "</select>"; }
  function ltSel(attr, val, allowBy) { return "<select class='in small' " + attr + ">" + (allowBy ? "<option value=''" + (!val ? " selected" : "") + ">ByLayer</option>" : "") + Object.keys(CAD.LTYPES).map(function (k) { return "<option" + (k === val ? " selected" : "") + ">" + k + "</option>"; }).join("") + "</select>"; }
  function lwSel(attr, val, allowBy) { return "<select class='in small' " + attr + ">" + (allowBy ? "<option value=''" + (val == null ? " selected" : "") + ">ByLayer</option>" : "") + CAD.LW.map(function (w) { return "<option value='" + w + "'" + (w === val ? " selected" : "") + ">" + w.toFixed(2) + " mm</option>"; }).join("") + "</select>"; }
  function renderPanels() {
    if (!C.root || !C.ed) return; renderStatus();
    C.root.querySelectorAll("[data-cadtab]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.cadtab === C.panel)); });
    var p = C.root.querySelector(".cad-panel"), ae = document.activeElement, keep = ae && p.contains(ae) && ae.dataset && (ae.dataset.pf || ae.dataset.lname) ? (ae.dataset.pf || ae.dataset.lname) : null;
    if (keep) return;   // do not rebuild under the user's cursor
    p.innerHTML = CAD.PANELS[C.panel] ? CAD.PANELS[C.panel](C.ed) : C.panel === "layers" ? layersPanel() : C.panel === "blocks" ? blocksPanel() : C.panel === "settings" ? settingsPanel() : propsPanel();
  }
  function L(mm) { return C.ed.fmt(mm); }
  function fld(label, key, val, o) { o = o || {}; return "<label class='cad-f'><span>" + label + "</span>" + (o.ta ? "<textarea class='in small' rows='3' data-pf='" + key + "'>" + esc(val) + "</textarea>" : "<input class='in small' data-pf='" + key + "' value='" + esc(val) + "'" + (o.ro ? " readonly" : "") + ">") + "</label>"; }
  function propsPanel() {
    var ed = C.ed, doc = ed.doc, ids = Array.from(ed.sel), ents = ids.map(function (i) { return doc.get(i); }).filter(Boolean);
    if (!ents.length) {
      var d = doc.d; return "<div class='cad-ph'><b>No selection</b></div><p class='muted small'>Click an object, or drag a window (left → right = inside only, right → left = crossing). Shift-click removes from the selection.</p>" +
        "<div class='cad-ph'>Current properties for new objects</div><label class='cad-f'><span>Layer</span><select class='in small' data-cur='layer'>" + Object.keys(d.layers).map(function (k) { return "<option" + (k === d.cur.layer ? " selected" : "") + ">" + esc(k) + "</option>"; }).join("") + "</select></label>" +
        "<label class='cad-f'><span>Colour</span>" + colorSel("data-cur='color'", d.cur.color, true) + "</label><label class='cad-f'><span>Linetype</span>" + ltSel("data-cur='lt'", d.cur.lt, true) + "</label><label class='cad-f'><span>Lineweight</span>" + lwSel("data-cur='lw'", d.cur.lw, true) + "</label>" +
        "<div class='cad-ph'>Drawing</div><p class='small'>" + d.ents.length + " objects · " + Object.keys(d.layers).length + " layers · " + Object.keys(d.blocks).filter(function (b) { return b[0] !== "*"; }).length + " blocks</p>" + quickInfo(doc.d.ents.filter(function (e) { return doc.visible(e); }));
    }
    var types = {}; ents.forEach(function (e) { types[e.t] = (types[e.t] || 0) + 1; });
    var e = ents[0], same = function (k) { return ents.every(function (x) { return JSON.stringify(x[k]) === JSON.stringify(e[k]); }) ? e[k] : undefined; };
    var h = "<div class='cad-ph'><b>" + ents.length + " selected</b> <span class='muted'>" + Object.keys(types).map(function (t) { return types[t] + " " + t; }).join(", ") + "</span></div>";
    h += "<label class='cad-f'><span>Layer</span><select class='in small' data-pp='layer'>" + (same("layer") === undefined ? "<option value='' selected>*varies*</option>" : "") + Object.keys(doc.d.layers).map(function (k) { return "<option" + (k === same("layer") ? " selected" : "") + ">" + esc(k) + "</option>"; }).join("") + "</select></label>";
    h += "<label class='cad-f'><span>Colour</span>" + colorSel("data-pp='color'", same("color") === undefined ? null : same("color"), true) + "</label><label class='cad-f'><span>Linetype</span>" + ltSel("data-pp='lt'", same("lt"), true) + "</label><label class='cad-f'><span>Lineweight</span>" + lwSel("data-pp='lw'", same("lw") == null ? null : same("lw"), true) + "</label>";
    if (ents.length === 1) h += (CAD.HOOKS.fields && EP.bim && EP.bim.TYPES[e.t] ? CAD.HOOKS.fields(e, C.ed) : geomFields(e));
    h += quickInfo(ents);
    h += "<div class='row' style='gap:6px;flex-wrap:wrap;margin-top:8px'><button type='button' class='btn sec sm' data-cc='TAKEOFF'>Take-off → estimate</button><button type='button' class='btn ghost sm' data-cc='ERASE'>Erase</button><button type='button' class='btn ghost sm' data-cad='desel'>Clear selection</button></div>";
    return h;
  }
  function quickInfo(ents) {
    var len = 0, area = 0, n = 0; ents.forEach(function (e) { var l = G.entLength(e, C.ed.doc.d.blocks), a = G.entArea(e); if (l && e.t !== "hatch") len += l; if (a) { area += a; n++; } });
    return "<div class='cad-qi'><div><span>Total length</span><b>" + L(len) + "</b></div><div><span>Total area (" + n + " closed)</span><b>" + C.ed.fmtA(area) + "</b></div></div>";
  }
  function geomFields(e) {
    var h = "<div class='cad-ph'>Geometry</div>", A = function (v) { return UN.trimNum(v, 3); };
    switch (e.t) {
      case "line": h += fld("Start X", "a.0", L(e.a[0])) + fld("Start Y", "a.1", L(e.a[1])) + fld("End X", "b.0", L(e.b[0])) + fld("End Y", "b.1", L(e.b[1])) + fld("Length", "len", L(G.dist(e.a, e.b))) + fld("Angle °", "ang", A((G.ang(e.a, e.b) * 180 / Math.PI + 360) % 360)); break;
      case "circle": h += fld("Centre X", "c.0", L(e.c[0])) + fld("Centre Y", "c.1", L(e.c[1])) + fld("Radius", "r", L(e.r)) + fld("Diameter", "dia", L(2 * e.r)) + fld("Area", "x", C.ed.fmtA(Math.PI * e.r * e.r), { ro: 1 }) + fld("Circumference", "x", L(2 * Math.PI * e.r), { ro: 1 }); break;
      case "arc": h += fld("Centre X", "c.0", L(e.c[0])) + fld("Centre Y", "c.1", L(e.c[1])) + fld("Radius", "r", L(e.r)) + fld("Start angle °", "a1", A(e.a1)) + fld("End angle °", "a2", A(e.a2)) + fld("Arc length", "x", L(G.entLength(e)), { ro: 1 }); break;
      case "pline": h += "<label class='cad-f'><span>Closed</span><input type='checkbox' data-pc='closed'" + (e.closed ? " checked" : "") + "></label>" + fld("Global width", "w", L(e.w || 0)) + fld("Vertices", "x", e.pts.length, { ro: 1 }) + fld("Length", "x", L(G.entLength(e)), { ro: 1 }) + (e.closed ? fld("Area", "x", C.ed.fmtA(G.entArea(e)), { ro: 1 }) : ""); break;
      case "text": h += fld("Text", "s", e.s, { ta: 1 }) + fld("Height", "h", L(e.h)) + fld("Rotation °", "rot", A(e.rot || 0)) + "<label class='cad-f'><span>Justify</span><select class='in small' data-pp='al'>" + ["l", "c", "r", "lm", "cm", "rm", "lt", "ct", "rt"].map(function (a) { return "<option value='" + a + "'" + ((e.al || "l") === a ? " selected" : "") + ">" + { l: "Left", c: "Centre", r: "Right", lm: "Middle left", cm: "Middle centre", rm: "Middle right", lt: "Top left", ct: "Top centre", rt: "Top right" }[a] + "</option>"; }).join("") + "</select></label>"; break;
      case "dim": var g = G.dimGeom(C.ed.dimEnt(e)); h += fld("Measured", "x", g ? C.ed.dimVal(e, g.val) : "", { ro: 1 }) + fld("Text override (<> = value)", "txt", e.txt || ""); break;
      case "insert": h += fld("Block", "x", e.block, { ro: 1 }) + fld("Position X", "p.0", L(e.p[0])) + fld("Position Y", "p.1", L(e.p[1])) + fld("Scale", "sx", A(e.sx == null ? 1 : e.sx)) + fld("Rotation °", "rot", A(e.rot || 0)); break;
      case "hatch": h += "<label class='cad-f'><span>Pattern</span><select class='in small' data-pp='pat'>" + Object.keys(CAD.HATCH).map(function (k) { return "<option value='" + k + "'" + (k === e.pat ? " selected" : "") + " title='" + esc(CAD.HATCH[k].d) + "'>" + k + "</option>"; }).join("") + "</select></label>" + fld("Scale", "sc", A(e.sc || 1)) + fld("Angle °", "hang", A(e.ang || 0)) + fld("Area", "x", C.ed.fmtA(G.entArea(e)), { ro: 1 }); break;
      case "image": h += fld("Opacity (0-1)", "op", A(e.op == null ? 0.6 : e.op)) + fld("Width", "w", L(e.w)) + fld("Height", "h", L(e.h)) + fld("Position X", "p.0", L(e.p[0])) + fld("Position Y", "p.1", L(e.p[1])) + fld("Rotation °", "rot", A(e.rot || 0)) + "<p class='muted small'>Scale it to the true size with SCALE → Reference: pick two points of a known dimension and type its real length.</p>"; break;
      case "ellipse": h += fld("Centre X", "c.0", L(e.c[0])) + fld("Centre Y", "c.1", L(e.c[1])) + fld("Major radius", "rx", L(e.rx)) + fld("Minor radius", "ry", L(e.ry)) + fld("Rotation °", "rot", A(e.rot || 0)); break;
      case "point": h += fld("X", "p.0", L(e.p[0])) + fld("Y", "p.1", L(e.p[1])); break;
    }
    return h;
  }
  function applyField(key, val, ptype) {
    var ed = C.ed, ids = Array.from(ed.sel); if (ids.length !== 1) return; var e = ed.doc.get(ids[0]); if (!e) return; var o = CAD.clone(e), du = ed.du(), Ln = function (v) { var x = UN.parseLen(v, du); if (x == null) throw new Error("bad"); return x; }, N = function (v) { var x = UN.evalNum(v); if (x == null) throw new Error("bad"); return x; };
    try {
      if (/^(a|b|c|p)\.(0|1)$/.test(key)) { var kk = key.split("."); o[kk[0]] = o[kk[0]].slice(); o[kk[0]][+kk[1]] = Ln(val); }
      else if (key === "len") { var d = G.norm(G.sub(e.b, e.a)); o.b = G.add(e.a, G.mul(d, Ln(val))); }
      else if (key === "ang") { var l = G.dist(e.a, e.b); o.b = G.polar(e.a, l, N(val) * Math.PI / 180); }
      else if (key === "r" || key === "h" || key === "w" || key === "rx" || key === "ry") { o[key] = Ln(val); }
      else if (key === "dia") o.r = Ln(val) / 2;
      else if (key === "a1" || key === "a2" || key === "rot" || key === "sc" || key === "op") o[key] = N(val);
      else if (key === "hang") o.ang = N(val);
      else if (key === "sx") { o.sx = N(val); o.sy = N(val); }
      else if (key === "s") o.s = val;
      else if (key === "txt") { if (val.trim()) o.txt = val; else delete o.txt; }
      else if (key.indexOf("b.") === 0) { var bk = key.slice(2), kind = ptype || "len"; var path = bk.split("."); var tgt = o; for (var pi = 0; pi < path.length - 1; pi++) { tgt[path[pi]] = Object.assign({}, tgt[path[pi]] || {}); tgt = tgt[path[pi]]; } var last = path[path.length - 1]; if (val === "" && kind !== "text") delete tgt[last]; else tgt[last] = kind === "len" ? Ln(val) : kind === "num" ? N(val) : val; }
      else return;
    } catch (er) { U.toast("Not a valid value"); renderPanels(); return; }
    if (e.t === "image" && (key === "w" || key === "h") && e.w && e.h) { var k = key === "w" ? o.w / e.w : o.h / e.h; o.w = e.w * k; o.h = e.h * k; }
    ed.doc.begin("Properties"); ed.doc.mod(e.id, o); ed.doc.commit();
  }
  function applyProp(key, val) {
    var ed = C.ed, ents = Array.from(ed.sel).map(function (i) { return ed.doc.get(i); }).filter(Boolean); if (!ents.length) return;
    ed.doc.begin("Properties");
    ents.forEach(function (e) { var o = CAD.clone(e); if (key.indexOf("b.") === 0) { var bk = key.slice(2), bp = bk.split("."), tg = o; for (var bi = 0; bi < bp.length - 1; bi++) { tg[bp[bi]] = Object.assign({}, tg[bp[bi]] || {}); tg = tg[bp[bi]]; } var bl = bp[bp.length - 1]; tg[bl] = val === "true" ? true : val === "false" ? false : (val !== "" && !isNaN(+val) && (/^(n|lvl_num)$/.test(bk) || /^rf\./.test(bk)) ? +val : val); if (val === "") delete tg[bl];  if (bk === "preset" && EP.bim && (o.t === "door" || o.t === "window")) { var plib = o.t === "door" ? EP.bim.DOORS : EP.bim.WINDOWS, pr = plib.filter(function (x) { return x.id === val; })[0]; if (pr) { o.w = pr.w; o.h = pr.h; o.mat = pr.mat; o.kind = pr.kind; o.mark = pr.id; if (pr.style) o.style = pr.style; else delete o.style; if (o.t === "window") o.sill = pr.sill; } } } else if (key === "layer") { if (!val) return; o.layer = val; } else if (key === "color") { if (val === "") delete o.color; else o.color = isNaN(+val) ? val : +val; } else if (key === "lt") { if (!val) delete o.lt; else o.lt = val; } else if (key === "lw") { if (val === "") delete o.lw; else o.lw = +val; } else if (key === "al") o.al = val; else if (key === "pat") o.pat = val; else if (key === "closed") o.closed = !!val; ed.doc.mod(e.id, o); });
    ed.doc.commit();
  }
  function layersPanel() {
    var d = C.ed.doc.d, used = {}; d.ents.forEach(function (e) { used[e.layer] = (used[e.layer] || 0) + 1; });
    var h = "<div class='row' style='gap:6px;margin-bottom:6px'><button type='button' class='btn sec sm' data-cad='newlayer'>+ New layer</button><button type='button' class='btn ghost sm' data-cad='layon'>All on</button><button type='button' class='btn ghost sm' data-cad='laypurge' title='Delete layers that have no objects'>Purge empty</button></div>";
    h += "<div class='cad-layers'>" + Object.keys(d.layers).sort(function (a, b) { return a === "0" ? -1 : b === "0" ? 1 : a.localeCompare(b); }).map(function (k) {
      var Ly = d.layers[k];
      return "<div class='cad-lrow" + (k === d.cur.layer ? " cur" : "") + "'><button type='button' class='cad-lb' data-lcur='" + esc(k) + "' title='Make current'>" + (k === d.cur.layer ? "✔" : "○") + "</button><input class='in small cad-ln' data-lname='" + esc(k) + "' value='" + esc(k) + "'" + (k === "0" ? " readonly" : "") + " aria-label='Layer name'>" +
        "<button type='button' class='cad-lb' data-lt='" + esc(k) + "|on' title='On / off' aria-pressed='" + !!Ly.on + "'>" + (Ly.on ? "👁" : "—") + "</button><button type='button' class='cad-lb' data-lt='" + esc(k) + "|frz' title='Freeze' aria-pressed='" + !!Ly.frz + "'>" + (Ly.frz ? "❄" : "☀") + "</button><button type='button' class='cad-lb' data-lt='" + esc(k) + "|lock' title='Lock' aria-pressed='" + !!Ly.lock + "'>" + (Ly.lock ? "🔒" : "🔓") + "</button>" +
        colorSel("data-lcol='" + esc(k) + "'", Ly.color, false) + ltSel("data-llt='" + esc(k) + "'", Ly.lt || "CONTINUOUS", false) + lwSel("data-llw='" + esc(k) + "'", Ly.lw, false) + "<span class='muted small'>" + (used[k] || 0) + "</span></div>";
    }).join("") + "</div>";
    return h;
  }
  function layerEdit(fn, label) { var ed = C.ed, Lc = CAD.clone(ed.doc.d.layers); fn(Lc); ed.doc.begin(label || "Layer"); ed.doc.set("layers", Lc); ed.doc.commit(); }
  function blocksPanel() {
    var B = C.ed.doc.d.blocks, names = Object.keys(B).filter(function (n) { return n[0] !== "*"; }), cnt = {}; C.ed.doc.d.ents.forEach(function (e) { if (e.t === "insert") cnt[e.block] = (cnt[e.block] || 0) + 1; });
    return "<p class='muted small'>Make a block with <b>Make block</b> (BLOCK). Blocks from imported DXF files are listed here too.</p>" + (names.length ? names.map(function (n) { return "<div class='cad-lrow'><b class='grow'>" + esc(n) + "</b><span class='muted small'>" + B[n].ents.length + " obj · used " + (cnt[n] || 0) + "×</span><button type='button' class='btn sec sm' data-binsert='" + esc(n) + "'>Insert</button></div>"; }).join("") : "<div class='empty'>No blocks yet.</div>");
  }
  function settingsPanel() {
    var d = C.ed.doc.d, st = d.dim || {}, s = C.ed.set;
    var h = "<div class='cad-ph'>Units</div><label class='cad-f'><span>Display / typing unit</span><select class='in small' data-ds='disp'>" + ["mm", "cm", "m", "in", "ft", "ftin"].map(function (u) { return "<option value='" + u + "'" + (d.units.disp === u ? " selected" : "") + ">" + unitLabel(u) + "</option>"; }).join("") + "</select></label>" +
      "<p class='muted small'>Changing this only changes how lengths are shown and typed — the drawing keeps its real size (a 12 ft wall shows as 3.658 m).</p>" +
      "<label class='cad-f'><span>Decimal places</span><input class='in small' data-ds='prec' value='" + (d.units.prec == null ? "" : d.units.prec) + "' placeholder='auto'></label>" +
      "<details class='cad-conv'><summary>Fix the drawing size (convert model units)</summary><p class='muted small'>Use this when a drawing came in at the wrong size (e.g. drawn in metres but read as millimetres). Everything is scaled about 0,0.</p><div class='row' style='gap:6px;flex-wrap:wrap'>The drawing is in <select class='in small' id='cad-cvfrom'>" + ["mm", "cm", "m", "in", "ft"].map(function (u) { return "<option value='" + u + "'>" + u + "</option>"; }).join("") + "</select> but was read as <select class='in small' id='cad-cvto'>" + ["mm", "cm", "m", "in", "ft"].map(function (u) { return "<option value='" + u + "'>" + u + "</option>"; }).join("") + "</select><button type='button' class='btn sec sm' data-cad='convert'>Convert</button></div></details>" +
      "<div class='cad-ph'>Dimensions & text</div><label class='cad-f'><span>Drawing scale 1 :</span><input class='in small' data-dst='sc' value='" + (st.sc || 1) + "'></label><label class='cad-f'><span>Text height on paper (mm)</span><input class='in small' data-dst='th' value='" + (st.th || 2.5) + "'></label><label class='cad-f'><span>Arrow size on paper (mm)</span><input class='in small' data-dst='ar' value='" + (st.ar || 2.5) + "'></label>" +
      "<label class='cad-f'><span>Dimension unit</span><select class='in small' data-dst='unit'><option value=''>Same as display</option>" + ["mm", "cm", "m", "ftin", "ft", "in"].map(function (u) { return "<option value='" + u + "'" + (st.unit === u ? " selected" : "") + ">" + unitLabel(u) + "</option>"; }).join("") + "</select></label><label class='cad-f'><span>Dimension decimals</span><input class='in small' data-dst='prec' value='" + (st.prec == null ? "" : st.prec) + "' placeholder='auto'></label>" +
      "<label class='cad-f'><span>Linetype scale</span><input class='in small' data-dsl='ltscale' value='" + (d.ltscale || 1) + "'></label>" +
      "<div class='cad-ph'>Drafting</div><label class='cad-f'><span>Polar angle step °</span><select class='in small' data-es='polarInc'>" + [5, 10, 15, 22.5, 30, 45, 90].map(function (a) { return "<option" + (s.polarInc === a ? " selected" : "") + ">" + a + "</option>"; }).join("") + "</select></label>" +
      "<div class='cad-snaps'>" + Object.keys(s.modes).map(function (k) { return "<label><input type='checkbox' data-snap='" + k + "'" + (s.modes[k] ? " checked" : "") + "> " + CAD.SNAP_NAME[k] + "</label>"; }).join("") + "</div>" +
      "<label class='cad-f'><span>Background</span><select class='in small' data-es='bg'><option value='dark'" + (s.bg === "dark" ? " selected" : "") + ">Dark (like AutoCAD)</option><option value='light'" + (s.bg === "light" ? " selected" : "") + ">Light</option></select></label>" +
      "<div class='cad-ph'>Keyboard</div><p class='muted small'>Type a command (L, PL, C, REC, M, CO, RO, SC, MI, O, TR, EX, F, AR, H, DLI, T…) and press Enter. Points: <code>x,y</code> · <code>@dx,dy</code> · <code>@dist&lt;angle</code> · or just a distance in the cursor direction. F3 snap, F8 ortho, F10 polar, F11 tracking, Ctrl+Z / Ctrl+Y undo / redo, Space repeats the last command. Type HELP for all commands.</p>";
    return h;
  }

  /* ================= events in the workspace ================= */
  function bindRoot(r) {
    r.addEventListener("click", async function (ev) {
      var t = ev.target.closest("button"); if (!t || !C.ed) return; var ds = t.dataset, ed = C.ed;
      if (ds.cc) { ed.exec(ds.cc); focusCv(); return; }
      if (ds.rtab) { C.rtab = ds.rtab; try { localStorage.setItem("ep_cad_rtab", ds.rtab); } catch (e) {} C.root.querySelectorAll("[data-rtab]").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.rtab === ds.rtab)); }); C.root.querySelectorAll("[data-rgrp]").forEach(function (g) { g.classList.toggle("on", g.dataset.rgrp === ds.rtab); }); setTimeout(function () { ed.resize(); }, 0); return; }
      if (ds.cadt) { ed.toggle(ds.cadt); renderStatus(); focusCv(); return; }
      if (ds.cadtab) { C.panel = ds.cadtab; renderPanels(); return; }
      if (ds.lcur) { var d = ed.doc.d; ed.doc.begin("Current layer"); ed.doc.set("cur", Object.assign({}, d.cur, { layer: ds.lcur })); ed.doc.commit(); renderPanels(); return; }
      if (ds.lt) { var p = ds.lt.split("|"); layerEdit(function (Ly) { Ly[p[0]][p[1]] = !Ly[p[0]][p[1]]; if (p[1] === "frz" && Ly[p[0]].frz && ed.doc.d.cur.layer === p[0]) { Ly[p[0]].frz = false; U.toast("The current layer cannot be frozen"); } }); renderPanels(); return; }
      if (ds.binsert) { ed.insName = ds.binsert; ed.exec("INSERT"); focusCv(); return; }
      if (ds.cad) cadAction(ds.cad, t);
    });
    r.addEventListener("change", function (ev) {
      var t = ev.target, ds = t.dataset || {}, ed = C.ed; if (!ed) return;
      if (t.classList.contains("cad-name")) { var nm = t.value.trim() || "Drawing"; C.cur.name = nm; ed.doc.begin("Rename"); ed.doc.set("name", nm); ed.doc.commit(); return; }
      if (ds.pf) { applyField(ds.pf, t.value, ds.pt); return; }
      if (ds.pp) { applyProp(ds.pp, t.value); return; }
      if (ds.pc) { applyProp(ds.pc, t.checked); return; }
      if (ds.cur) { var cur = Object.assign({}, ed.doc.d.cur); cur[ds.cur] = t.value === "" ? null : (ds.cur === "lw" || (ds.cur === "color" && !isNaN(+t.value)) ? +t.value : t.value); ed.doc.begin("Current properties"); ed.doc.set("cur", cur); ed.doc.commit(); return; }
      if (ds.lname) { var oldN = ds.lname, nn = t.value.trim(); if (!nn || nn === oldN) { t.value = oldN; return; } if (ed.doc.d.layers[nn]) { U.toast("A layer with that name exists"); t.value = oldN; return; }
        ed.doc.begin("Rename layer"); var Ly = CAD.clone(ed.doc.d.layers); Ly[nn] = Ly[oldN]; delete Ly[oldN]; ed.doc.set("layers", Ly); ed.doc.d.ents.forEach(function (e) { if (e.layer === oldN) ed.doc.mod(e.id, Object.assign(CAD.clone(e), { layer: nn })); }); if (ed.doc.d.cur.layer === oldN) ed.doc.set("cur", Object.assign({}, ed.doc.d.cur, { layer: nn })); ed.doc.commit(); t.blur(); renderPanels(); return; }
      if (ds.lcol) { layerEdit(function (Ly) { Ly[ds.lcol].color = isNaN(+t.value) ? t.value : +t.value; }); return; }
      if (ds.llt) { layerEdit(function (Ly) { Ly[ds.llt].lt = t.value; }); return; }
      if (ds.llw) { layerEdit(function (Ly) { Ly[ds.llw].lw = +t.value; }); return; }
      if (ds.ds) { var u = Object.assign({}, ed.doc.d.units); u[ds.ds] = ds.ds === "prec" ? (t.value === "" ? null : +t.value) : t.value; ed.doc.begin("Units"); ed.doc.set("units", u); ed.doc.commit(); renderPanels(); return; }
      if (ds.dst) { var st = Object.assign({}, ed.doc.d.dim); st[ds.dst] = ds.dst === "unit" ? (t.value || null) : ds.dst === "prec" ? (t.value === "" ? null : +t.value) : +t.value || st[ds.dst]; ed.doc.begin("Dimension style"); ed.doc.set("dim", st); ed.doc.commit(); return; }
      if (ds.dsl) { ed.doc.begin("Linetype scale"); ed.doc.set("ltscale", +t.value || 1); ed.doc.commit(); return; }
      if (ds.es) { ed.set[ds.es] = ds.es === "polarInc" ? +t.value : t.value; saveSettings(); ed.dirty = true; return; }
      if (ds.snap) { ed.set.modes[ds.snap] = t.checked ? 1 : 0; saveSettings(); return; }
    });
    r.addEventListener("keydown", function (ev) { var t = ev.target; if (t.dataset && (t.dataset.pf || t.dataset.lname) && ev.key === "Enter" && t.tagName !== "TEXTAREA") { ev.preventDefault(); t.blur(); } });
    r.addEventListener("focusout", function () { setTimeout(function () { if (C.root && !C.root.querySelector(".cad-panel").contains(document.activeElement)) renderPanels(); }, 50); });
  }
  function focusCv() { var cv = C.root && C.root.querySelector(".cad-cv"); if (cv && window.innerWidth > 700) cv.focus({ preventScroll: true }); }
  async function cadAction(a, btn) {
    var ed = C.ed, pop = C.root.querySelector(".cad-pop");
    if (a !== "menu" && pop) pop.hidden = true;
    if (CAD.ACTIONS[a]) return CAD.ACTIONS[a](ed, C, btn);
    switch (a) {
      case "menu": pop.hidden = !pop.hidden; return;
      case "back": closeEditor(); C.list = null; U.render(); return;
      case "undo": ed.undo(); return; case "redo": ed.redo(); return;
      case "esc": ed.stop(); ed.sel.clear(); ed.emitSel(); return;
      case "enter": if (ed.prompt) { ed.say((ed.prompt.msg || "") + ": "); ed.typed(ed.inEl.value || ""); ed.inEl.value = ""; } else ed.exec(ed.inEl.value || ""); return;
      case "zext": ed.zoomExtents(); return;
      case "side": C.side = !C.side; renderStatus(); setTimeout(function () { ed.resize(); }, 30); return;
      case "desel": ed.sel.clear(); ed.emitSel(); return;
      case "save": await saveCloud(true); U.toast(C.cloudOk ? "Saved" : "Saved on this device"); return;
      case "rev": return saveRevision();
      case "revs": return showRevisions();
      case "expdxf": dl(new Blob([CAD.exportDxf(ed.doc)], { type: "application/dxf" }), fname(ed.doc.d.name) + ".dxf"); if (U.logAct) U.logAct("cad_export", "DXF " + ed.doc.d.name); return;
      case "exppng": var url = CAD.plotPng(ed, null, 3000), b = await (await fetch(url)).blob(); dl(b, fname(ed.doc.d.name) + ".png"); return;
      case "exppdf": return plotDialog();
      case "impdxf": return pickFile(".dxf", function (f) { importDxfFile(f, true); });
      case "img": return pickFile("image/*", attachImage);
      case "pdf": return pickFile("application/pdf,.pdf", attachPdf);
      case "takeoff": ed.exec("TAKEOFF"); return;
      case "dup": var d2 = ed.doc.json(); d2.name = (d2.name || "Drawing") + " (copy)"; newDrawing(d2.name, d2.units.disp, d2); return;
      case "delete": if (btn.dataset.confirm !== "1") { btn.dataset.confirm = "1"; btn.textContent = "Click again to delete permanently"; pop.hidden = false; return; } return deleteDrawing(C.cur.id);
      case "newlayer": var nm = "Layer" + (Object.keys(ed.doc.d.layers).length); layerEdit(function (Ly) { while (Ly[nm]) nm += "_"; Ly[nm] = { color: 7, lw: 0.25, lt: "CONTINUOUS", on: true, frz: false, lock: false }; }, "New layer"); renderPanels(); return;
      case "layon": layerEdit(function (Ly) { Object.keys(Ly).forEach(function (k) { Ly[k].on = true; Ly[k].frz = false; }); }); renderPanels(); return;
      case "laypurge": var used = {}; ed.doc.d.ents.forEach(function (e) { used[e.layer] = 1; }); Object.keys(ed.doc.d.blocks).forEach(function (n) { ed.doc.d.blocks[n].ents.forEach(function (e) { used[e.layer] = 1; }); }); layerEdit(function (Ly) { Object.keys(Ly).forEach(function (k) { if (k !== "0" && !used[k] && k !== ed.doc.d.cur.layer) delete Ly[k]; }); }, "Purge layers"); renderPanels(); return;
      case "convert": var f = UN.conv(1, C.root.querySelector("#cad-cvfrom").value, "mm") / UN.conv(1, C.root.querySelector("#cad-cvto").value, "mm"); if (f === 1) return; ed.doc.begin("Convert units"); ed.doc.d.ents.slice().forEach(function (e) { ed.doc.mod(e.id, G.xform(e, G.mScale([0, 0], f))); }); var B = CAD.clone(ed.doc.d.blocks); Object.keys(B).forEach(function (n) { B[n].base = [B[n].base[0] * f, B[n].base[1] * f]; B[n].ents = B[n].ents.map(function (e) { return G.xform(e, G.mScale([0, 0], f)); }); }); ed.doc.set("blocks", B); ed.doc.commit(); ed.zoomExtents(); U.toast("Drawing scaled ×" + UN.trimNum(f, 6)); return;
    }
  }
  function pickFile(accept, fn) { var i = document.createElement("input"); i.type = "file"; i.accept = accept; i.onchange = function () { if (i.files && i.files[0]) fn(i.files[0]); }; i.click(); }

  /* ----- dialogs (inside the workspace) ----- */
  function dialog(html, onClick) {
    var d = C.root ? C.root.querySelector(".cad-dlg") : document.getElementById("cad-gdlg");
    if (!d) { d = document.createElement("div"); d.id = "cad-gdlg"; d.className = "cad-dlg"; document.body.appendChild(d); }
    d.hidden = false; d.innerHTML = "<div class='cad-dlgbox' role='dialog' aria-modal='true'>" + html + "</div>";
    d.onclick = function (ev) { var b = ev.target.closest("button"); if (ev.target === d || (b && b.dataset.dlg === "close")) { d.hidden = true; return; } if (b && onClick) onClick(b, d); };
    var f = d.querySelector("input,select,textarea,button"); if (f) setTimeout(function () { f.focus(); }, 30);
    return d;
  }
  function closeDialog() { var d = C.root ? C.root.querySelector(".cad-dlg") : document.getElementById("cad-gdlg"); if (d) d.hidden = true; }

  /* ----- revisions ----- */
  async function saveRevision() {
    var note = window.prompt("Note for this revision (e.g. after site visit, client changes)", ""); if (note == null) return;
    await saveCloud(true); if (!C.cloudOk) { U.toast("Revisions need the cloud table — run supabase/cad.sql"); return; }
    var r0 = await db().from("cad_revisions").select("no").eq("drawing_id", C.cur.id).order("no", { ascending: false }).limit(1), no = (!r0.error && r0.data && r0.data[0] ? r0.data[0].no : 0) + 1;
    var r = await db().from("cad_revisions").insert({ drawing_id: C.cur.id, owner: me(), no: no, note: note.slice(0, 300), data: C.ed.doc.d });
    if (U.fail(r, "Couldn't save the revision.")) return; U.toast("Saved as revision R" + no);
  }
  async function showRevisions() {
    var r = await db().from("cad_revisions").select("id,no,note,created_at").eq("drawing_id", C.cur.id).order("no", { ascending: false });
    if (r.error) { U.toast("Revisions need the cloud table — run supabase/cad.sql"); return; }
    var L = r.data || [];
    dialog("<h3>Revisions of " + esc(C.ed.doc.d.name) + "</h3>" + (L.length ? "<table class='t'><thead><tr><th>Rev</th><th>Saved</th><th>Note</th><th></th></tr></thead><tbody>" + L.map(function (x) { return "<tr><td><b>R" + x.no + "</b></td><td>" + esc(when(x.created_at)) + "</td><td>" + esc(x.note) + "</td><td><button type='button' class='btn sec sm' data-rvopen='" + esc(x.id) + "'>Open as copy</button><button type='button' class='btn ghost sm' data-rvrest='" + esc(x.id) + "'>Restore</button></td></tr>"; }).join("") + "</tbody></table>" : "<p class='muted'>No revisions yet. Use File → Save as revision.</p>") + "<div class='row' style='justify-content:flex-end'><button type='button' class='btn ghost sm' data-dlg='close'>Close</button></div>",
      async function (b) {
        var id = b.dataset.rvopen || b.dataset.rvrest; if (!id) return; var q = await db().from("cad_revisions").select("data,no").eq("id", id).single(); if (U.fail(q, "Couldn't load the revision.")) return;
        closeDialog();
        if (b.dataset.rvopen) { var d = q.data.data; d.name = (d.name || "Drawing") + " R" + q.data.no; newDrawing(d.name, d.units.disp, d); }
        else { var ed = C.ed, nd = q.data.data; ed.doc.begin("Restore R" + q.data.no); ed.doc.d.ents.slice().forEach(function (e) { ed.doc.del(e.id); }); ["layers", "blocks", "dim", "units", "cur"].forEach(function (k) { if (nd[k]) ed.doc.set(k, nd[k]); }); nd.ents.forEach(function (e) { ed.doc.add(e); }); ed.doc.commit(); ed.zoomExtents(); U.toast("Restored R" + q.data.no + " (Undo brings back the previous state)"); }
      });
  }
  async function deleteDrawing(id) {
    var r = await db().from("cad_drawings").delete().eq("id", id); if (r.error && !(U.off && U.off.isNet(r.error)) && C.cloudOk) { U.fail(r, "Couldn't delete."); return; }
    if (kv()) { await kv().put("cad:" + id, null); var L = (await localIdx()).filter(function (x) { return x.id !== id; }); await setLocalIdx(L); }
    if (C.cur && C.cur.id === id) { C.ed.destroy(); C.ed = null; C.root = null; C.cur = null; }
    C.list = null; U.toast("Drawing deleted"); U.render();
  }

  /* ----- import DXF ----- */
  async function importDxfFile(file, into) {
    var txt = await file.text(), res;
    try { res = CAD.parseDxf(txt); } catch (e) { U.toast("Couldn't read the DXF: " + e.message); return; }
    if (!res.ents.length && !Object.keys(res.blocks).length) { U.toast("No drawing entities found in this file (is it a DXF?)"); return; }
    var guess = res.guessed ? CAD.guessUnit(res) : null;
    var unitsTxt = res.guessed ? "The file does not say its unit. Size " + UN.trimNum(guess.size, 2) + " units — looks like " + (guess.unit === "m" ? "metres" : "millimetres") + "." : "Unit in the file: " + res.unitName + ".";
    var skipped = Object.keys(res.skipped).map(function (k) { return res.skipped[k] + " " + k; }).join(", ");
    dialog("<h3>Import " + esc(file.name) + "</h3><p>" + res.ents.length + " objects, " + Object.keys(res.layers).length + " layers, " + Object.keys(res.blocks).filter(function (b) { return b[0] !== "*"; }).length + " blocks.</p><p class='muted small'>" + esc(unitsTxt) + (skipped ? "<br>Not imported: " + esc(skipped) + "." : "") + "</p>" +
      "<label class='cad-f'><span>Drawing unit of the file</span><select class='in small' id='dxf-u'>" + [["", "As in the file"], ["1", "millimetres"], ["10", "centimetres"], ["1000", "metres"], ["25.4", "inches"], ["304.8", "feet"]].map(function (o) { return "<option value='" + o[0] + "'" + ((res.guessed && ((guess.unit === "m" && o[0] === "1000") || (guess.unit === "mm" && o[0] === "1"))) || (!res.guessed && o[0] === "") ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
      "<label class='cad-f'><span>Show lengths in</span><select class='in small' id='dxf-d'>" + ["mm", "cm", "m", "ft", "ftin", "in"].map(function (u) { return "<option value='" + u + "'" + ((res.k === 1000 || (guess && guess.unit === "m")) && u === "m" ? " selected" : (res.k === 304.8 || res.k === 25.4) && u === "ftin" ? " selected" : (res.k === 1 && !(guess && guess.unit === "m") && u === "mm") ? " selected" : "") + ">" + unitLabel(u) + "</option>"; }).join("") + "</select></label>" +
      "<div class='row' style='gap:8px;justify-content:flex-end'><button type='button' class='btn ghost sm' data-dlg='close'>Cancel</button>" + (C.ed ? "<button type='button' class='btn sec sm' data-imp='into'>Insert into this drawing</button>" : "") + "<button type='button' class='btn pri sm' data-imp='new'>Open as new drawing</button></div>",
      function (b, dlg) {
        if (!b.dataset.imp) return; var uv = dlg.querySelector("#dxf-u").value, disp = dlg.querySelector("#dxf-d").value, r2 = uv ? CAD.parseDxf(txt, { unitMm: +uv }) : res; closeDialog();
        if (b.dataset.imp === "new" || !C.ed) {
          var d = CAD.newDoc(file.name.replace(/\.dxf$/i, ""), disp); Object.keys(r2.layers).forEach(function (k) { d.layers[k] = r2.layers[k]; }); d.blocks = r2.blocks; d.ents = r2.ents.map(function (e) { e.id = CAD.uid(); return e; }); d.meta.imported = { file: file.name, at: Date.now(), unit: uv || res.unitName, skipped: r2.skipped };
          var ex = new CAD.Doc(d).extents(true); if (ex) { var sz = Math.max(ex[2] - ex[0], ex[3] - ex[1]); d.dim.sc = CAD.STD_SCALES.filter(function (s) { return s >= sz / 380; })[0] || 100; }
          newDrawing(d.name, disp, d); if (U.logAct) U.logAct("cad_import", file.name);
        } else {
          var ed = C.ed; ed.doc.begin("Insert DXF"); var Ly = CAD.clone(ed.doc.d.layers); Object.keys(r2.layers).forEach(function (k) { if (!Ly[k]) Ly[k] = r2.layers[k]; }); ed.doc.set("layers", Ly);
          var B = Object.assign({}, ed.doc.d.blocks, r2.blocks); ed.doc.set("blocks", B); var ids = r2.ents.map(function (e) { return ed.doc.add(e).id; }); ed.doc.commit(); ed.sel = new Set(ids); ed.emitSel(); ed.zoomExtents(); U.toast(ids.length + " objects inserted (selected — MOVE them if needed)");
        }
      });
  }
  CAD.importDxfFile = importDxfFile;

  /* ----- image underlay ----- */
  async function addAsset(blob, name, w, h) {
    var id = CAD.uid(), A = Object.assign({}, C.ed.doc.d.assets); A[id] = { name: name, w: w, h: h, mime: blob.type || "image/jpeg" };
    if (kv()) await kv().put("cadasset:" + id, blob); C.ed.doc.set("assets", A);
    var im = new Image(); im.onload = function () { C.ed.dirty = true; }; im.src = URL.createObjectURL(blob); C.ed.images[id] = im; return id;
  }
  async function shrink(file, maxPx) {
    var url = URL.createObjectURL(file), im = await new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = url; });
    var k = Math.min(1, maxPx / Math.max(im.naturalWidth, im.naturalHeight)); if (k === 1 && file.size < 4e6) return { blob: file, w: im.naturalWidth, h: im.naturalHeight };
    var cv = document.createElement("canvas"); cv.width = Math.round(im.naturalWidth * k); cv.height = Math.round(im.naturalHeight * k); cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
    var b = await new Promise(function (res) { cv.toBlob(res, "image/jpeg", 0.85); }); return { blob: b, w: cv.width, h: cv.height };
  }
  async function attachImage(file) {
    var ed = C.ed, sh = await shrink(file, 6000);
    ed.run("IMAGEATTACH", async function (ed) {
      var id = await addAsset(sh.blob, file.name, sh.w, sh.h), wdef = (ed.doc.extents(true) ? Math.max(ed.doc.extents(true)[2] - ed.doc.extents(true)[0], 1000) : 10000);
      ed.preview = function (w) { return [{ t: "image", asset: id, p: w, w: wdef, h: wdef * sh.h / sh.w, op: 0.6 }]; };
      var p = await ed.getPoint("Specify insertion point (lower-left corner)");
      ed.preview = function (w) { var W = Math.max(G.dist(p, w), 1); return [{ t: "image", asset: id, p: p, w: W, h: W * sh.h / sh.w, op: 0.6 }]; };
      var W = await ed.getDist("Specify width (or pick) — calibrate later with SCALE › Reference", { base: p, def: wdef });
      ed.preview = null; var e = ed.doc.add({ t: "image", asset: id, p: p, w: W, h: W * sh.h / sh.w, op: 0.6, layer: ed.doc.d.layers.UNDERLAY ? "UNDERLAY" : undefined }); ed.say("Image attached. To set its true size: SCALE → select it → base point → Reference → pick two points of a known length → type the real length.");
      ed.sel = new Set([e.id]); ed.emitSel();
    });
  }
  /* ----- PDF: vectors (lines you can snap to and measure) or an image to trace over ----- */
  var pdfjs = null;
  async function loadPdfjs() { if (pdfjs) return pdfjs; pdfjs = await import(new URL("vendor/pdfjs/pdf.min.mjs", location.href).href); pdfjs.GlobalWorkerOptions.workerSrc = new URL("vendor/pdfjs/pdf.worker.min.mjs", location.href).href; return pdfjs; }
  CAD.loadPdfjs = loadPdfjs;
  async function attachPdf(file) {
    var lib; try { lib = await loadPdfjs(); } catch (e) { U.toast("Couldn't load the PDF reader"); return; }
    var bytes = new Uint8Array(await file.arrayBuffer()), pdf = await lib.getDocument({ data: bytes }).promise, n = pdf.numPages;
    dialog("<h3>" + esc(file.name) + "</h3><p class='muted small'>" + n + " page" + (n === 1 ? "" : "s") + ". <b>Vectors</b> brings the lines and text of a CAD-made PDF in as real lines (snap, measure, take-off). <b>Image</b> puts the page as a picture to trace over (use for scanned drawings).</p>" +
      "<label class='cad-f'><span>Page</span><input class='in small' id='pdf-pg' value='1'></label><label class='cad-f'><span>Drawing scale of the PDF 1 :</span><input class='in small' id='pdf-sc' value='" + ((C.ed.doc.d.dim && C.ed.doc.d.dim.sc) || 100) + "'></label><p class='muted small'>Not sure of the scale? Import, then SCALE → Reference on a known dimension.</p>" +
      "<div class='row' style='gap:8px;justify-content:flex-end'><button type='button' class='btn ghost sm' data-dlg='close'>Cancel</button><button type='button' class='btn sec sm' data-pdf='img'>As image</button><button type='button' class='btn pri sm' data-pdf='vec'>As vectors</button></div>",
      async function (b, dlg) {
        if (!b.dataset.pdf) return; var pg = Math.max(1, Math.min(n, +dlg.querySelector("#pdf-pg").value || 1)), sc = +dlg.querySelector("#pdf-sc").value || 1; closeDialog();
        var page = await pdf.getPage(pg), vp = page.getViewport({ scale: 1 }), k = 25.4 / 72 * sc;
        if (b.dataset.pdf === "img") {
          var r = Math.min(4, 6000 / Math.max(vp.width, vp.height)), v2 = page.getViewport({ scale: r }), cv = document.createElement("canvas"); cv.width = Math.round(v2.width); cv.height = Math.round(v2.height);
          var g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); await page.render({ canvasContext: g, viewport: v2 }).promise;
          var blob = await new Promise(function (res) { cv.toBlob(res, "image/jpeg", 0.85); }), ed = C.ed; ed.doc.begin("Attach PDF page"); var id = await addAsset(blob, file.name + " p" + pg, cv.width, cv.height);
          var e = ed.doc.add({ t: "image", asset: id, p: [0, 0], w: vp.width * k, h: vp.height * k, op: 0.7, layer: ed.doc.d.layers.UNDERLAY ? "UNDERLAY" : undefined }); ed.doc.commit(); ed.zoomExtents(); ed.sel = new Set([e.id]); ed.emitSel(); return;
        }
        var res = await pdfVectors(lib, page, k); C.ed.doc.begin("Import PDF vectors"); var Ly = CAD.clone(C.ed.doc.d.layers); ["PDF-LINES", "PDF-FILL", "PDF-TEXT"].forEach(function (nm, i) { if (!Ly[nm]) Ly[nm] = { color: [7, 9, 2][i], lw: 0.18, lt: "CONTINUOUS", on: true, frz: false, lock: false }; }); C.ed.doc.set("layers", Ly);
        res.forEach(function (e) { C.ed.doc.add(e); }); C.ed.doc.commit(); C.ed.zoomExtents(); U.toast(res.length + " objects imported from the PDF at 1:" + sc);
      });
  }
  async function pdfVectors(lib, page, k) {
    var ops = await page.getOperatorList(), O = lib.OPS, F = ops.fnArray, A = ops.argsArray, out = [], stack = [], M = [1, 0, 0, 1, 0, 0], col = "#000000";
    var vp = page.getViewport({ scale: 1 }), base = vp.viewBox;
    function tp(x, y) { var X = M[0] * x + M[2] * y + M[4], Y = M[1] * x + M[3] * y + M[5]; return [(X - base[0]) * k, (Y - base[1]) * k]; }
    function mul(a, b) { return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]; }
    for (var i = 0; i < F.length && out.length < 200000; i++) {
      var f = F[i], a = A[i];
      if (f === O.save) stack.push(M.slice());
      else if (f === O.restore) M = stack.pop() || [1, 0, 0, 1, 0, 0];
      else if (f === O.transform) M = mul(M, a);
      else if (f === O.paintFormXObjectBegin) { stack.push(M.slice()); if (a[0]) M = mul(M, a[0]); }
      else if (f === O.paintFormXObjectEnd) M = stack.pop() || M;
      else if (f === O.setStrokeRGBColor || f === O.setStrokeColor) { if (typeof a[0] === "string") col = a[0]; }
      else if (f === O.constructPath) {
        var paint = a[0], data = a[1] && a[1][0]; if (!data) continue;
        var D = Array.from(data), j = 0, subs = [], cur = null, start = null;
        while (j < D.length) {
          var op = D[j++];
          if (op === 0) { cur = [tp(D[j], D[j + 1])]; start = cur[0]; subs.push({ pts: cur, closed: false }); j += 2; }
          else if (op === 1) { if (!cur) { cur = []; subs.push({ pts: cur, closed: false }); } cur.push(tp(D[j], D[j + 1])); j += 2; }
          else if (op === 2) { var p0 = cur && cur.length ? cur[cur.length - 1] : tp(0, 0), c1 = tp(D[j], D[j + 1]), c2 = tp(D[j + 2], D[j + 3]), p3 = tp(D[j + 4], D[j + 5]); for (var s = 1; s <= 8; s++) { var t = s / 8, u = 1 - t; cur.push([u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p3[1]]); } j += 6; }
          else if (op === 3) { var q0 = cur && cur.length ? cur[cur.length - 1] : tp(0, 0), qc = tp(D[j], D[j + 1]), q3 = tp(D[j + 2], D[j + 3]); for (var s2 = 1; s2 <= 6; s2++) { var t2 = s2 / 6, u2 = 1 - t2; cur.push([u2 * u2 * q0[0] + 2 * u2 * t2 * qc[0] + t2 * t2 * q3[0], u2 * u2 * q0[1] + 2 * u2 * t2 * qc[1] + t2 * t2 * q3[1]]); } j += 4; }
          else if (op === 4) { if (subs.length) subs[subs.length - 1].closed = true; if (start) { cur = [start]; subs.push({ pts: cur, closed: false }); } }
          else break;
        }
        var fill = paint === O.fill || paint === O.eoFill || paint === O.rawFillPath, stroke = paint === O.stroke || paint === O.closeStroke || paint === O.fillStroke || paint === O.eoFillStroke || paint === O.closeFillStroke || paint === O.closeEOFillStroke;
        subs.forEach(function (sp) {
          var P = sp.pts.filter(function (p, ix, arr) { return !ix || Math.hypot(p[0] - arr[ix - 1][0], p[1] - arr[ix - 1][1]) > 1e-6; }); if (P.length < 2) return;
          if (paint === O.closeStroke) sp.closed = true;
          var color = CAD.hexToAci(/^#[0-9a-f]{6}$/i.test(col) ? col : "#000000"); if (color === 7 || color === 250 || color === 0) color = null;
          if (stroke || !fill) { if (P.length === 2 && !sp.closed) out.push({ t: "line", a: P[0], b: P[1], layer: "PDF-LINES", color: color || undefined }); else out.push({ t: "pline", pts: P.map(function (p) { return [p[0], p[1], 0]; }), closed: sp.closed, layer: "PDF-LINES", color: color || undefined }); }
          else if (P.length > 2) out.push({ t: "hatch", pat: "SOLID", loops: [P.map(function (p) { return [p[0], p[1], 0]; })], layer: "PDF-FILL" });
        });
      }
    }
    try {
      var tc = await page.getTextContent();
      tc.items.forEach(function (it) { if (!it.str || !it.str.trim()) return; var T = it.transform, X = T[4], Y = T[5], h = Math.hypot(T[2], T[3]) || 8; var Mx = M; M = [1, 0, 0, 1, 0, 0]; var p = tp(X, Y); M = Mx; out.push({ t: "text", p: p, s: it.str, h: h * k, rot: Math.atan2(T[1], T[0]) * 180 / Math.PI, layer: "PDF-TEXT" }); });
    } catch (e) {}
    return out;
  }

  /* ----- plot dialog ----- */
  function plotDialog() {
    var ed = C.ed, d = ed.doc.d, hd = (S.est.cur && S.est.cur.doc && S.est.cur.doc.header) || {}, sel = ed.sel.size;
    dialog("<h3>Plot PDF sheet</h3><div class='grid2'>" +
      "<label class='cad-f'><span>Paper</span><select class='in small' id='pl-p'>" + Object.keys(CAD.PAPER).map(function (k) { return "<option" + (k === (d.sheet.size || "A3") ? " selected" : "") + ">" + k + "</option>"; }).join("") + "</select></label>" +
      "<label class='cad-f'><span>Orientation</span><select class='in small' id='pl-o'><option value='l'>Landscape</option><option value='p'>Portrait</option></select></label>" +
      "<label class='cad-f'><span>Scale 1 :</span><select class='in small' id='pl-s'><option value=''>Fit to paper</option>" + CAD.STD_SCALES.map(function (s) { return "<option value='" + s + "'" + (s === d.sheet.scale ? " selected" : "") + ">1 : " + s + "</option>"; }).join("") + "</select></label>" +
      "<label class='cad-f'><span>What to plot</span><select class='in small' id='pl-a'><option value='ext'>Everything (extents)</option><option value='view'>Current screen view</option>" + (sel ? "<option value='sel'>Selected objects (" + sel + ")</option>" : "") + "</select></label>" +
      "<label class='cad-f'><span>Colours</span><select class='in small' id='pl-m'><option value='1'>Black & white</option><option value=''>Colour</option></select></label>" +
      "<label class='cad-f'><span>Title</span><input class='in small' id='pl-t' value='" + esc(d.sheet.title || d.name) + "'></label><label class='cad-f'><span>Drawing No.</span><input class='in small' id='pl-n' value='" + esc(d.sheet.number || "D-01") + "'></label>" +
      "<label class='cad-f'><span>Organisation</span><input class='in small' id='pl-org' value='" + esc(d.sheet.org || hd.org || "") + "'></label><label class='cad-f'><span>Project / work</span><input class='in small' id='pl-pr' value='" + esc(d.sheet.project || hd.work || "") + "'></label>" +
      "<label class='cad-f'><span>Drawn by</span><input class='in small' id='pl-by' value='" + esc(d.sheet.by || S.me.name || "") + "'></label></div>" +
      "<div class='row' style='gap:8px;justify-content:flex-end'><button type='button' class='btn ghost sm' data-dlg='close'>Cancel</button><button type='button' class='btn pri sm' data-plot='1'>Make PDF</button></div>",
      function (b, dlg) {
        if (!b.dataset.plot) return; var v = function (id) { return dlg.querySelector(id).value; }, ar = v("#pl-a"), area = null;
        if (ar === "view") { var a = ed.s2w(0, ed.H), c = ed.s2w(ed.W, 0); area = [a[0], a[1], c[0], c[1]]; }
        else if (ar === "sel") { area = [Infinity, Infinity, -Infinity, -Infinity]; ed.sel.forEach(function (id) { var e = ed.doc.get(id); if (e) { var x = ed.doc.bbox(e); G.ext(area, [x[0], x[1]]); G.ext(area, [x[2], x[3]]); } }); }
        var sheet = Object.assign({}, d.sheet, { size: v("#pl-p"), scale: +v("#pl-s") || null, title: v("#pl-t"), number: v("#pl-n"), org: v("#pl-org"), project: v("#pl-pr"), by: v("#pl-by") });
        ed.doc.begin("Sheet settings"); ed.doc.set("sheet", sheet); ed.doc.commit();
        var imgs = {}; Object.keys(ed.images).forEach(function (id) { var im = ed.images[id]; if (im.complete && im.naturalWidth) try { imgs[id] = CAD.jpegOf(im); } catch (e) {} });
        var r = CAD.plotPdf(ed.doc, { paper: sheet.size, land: v("#pl-o") === "l", scale: sheet.scale, area: area, mono: !!v("#pl-m"), title: sheet.title, number: sheet.number, org: sheet.org, project: sheet.project, drawnBy: sheet.by, units: unitLabel(d.units.disp), images: imgs, dimText: function (e, val) { return ed.dimText(e, val); } });
        closeDialog(); dl(new Blob([r.bytes], { type: "application/pdf" }), fname(sheet.title) + "_" + sheet.number + ".pdf"); U.toast("PDF at 1:" + r.scale + " on " + sheet.size);
      });
  }

  /* ================= take-off → estimate ================= */
  function openTakeoff(res) {
    C.to = res; var mine = (S.est.mine || []).filter(function (e) { return e && e.doc; });
    if (!mine.length) { U.toast("Make an estimate first (Estimates tab) — then send drawing quantities to it"); return; }
    var estId = C.toEst && mine.some(function (e) { return e.id === C.toEst; }) ? C.toEst : (S.est.cur && S.est.owner === me() ? S.est.cur.id : mine[0].id);
    function body() {
      var est = mine.filter(function (e) { return e.id === estId; })[0], d = est.doc, items = d.items, opts = items.map(function (it) { var inf = EP.itemInfo(it), u = UN.fromSor(inf.unit), dim = u ? UN.get(u).dim : null; return "<option value='" + esc(it.id) + "'" + (it.id === C.toItem ? " selected" : "") + ">" + esc((d.parts.filter(function (p) { return p.id === it.part; })[0] || {}).name + " · " + EP.slOf(d, it) + " · " + (inf.code || "NS") + " — " + inf.desc.slice(0, 70) + " [" + inf.unit + "]") + (dim ? "" : " (unit not measurable)") + "</option>"; }).join("");
      return "<h3>Take-off → estimate</h3><div class='cad-qi'><div><span>Length</span><b>" + C.ed.fmt(res.len) + "</b></div><div><span>Area</span><b>" + C.ed.fmtA(res.area) + "</b></div><div><span>Count</span><b>" + res.count + "</b></div></div>" +
        "<label class='cad-f'><span>Estimate</span><select class='in small' id='to-est'>" + mine.map(function (e) { return "<option value='" + esc(e.id) + "'" + (e.id === estId ? " selected" : "") + ">" + esc(e.name) + "</option>"; }).join("") + "</select></label>" +
        "<label class='cad-f'><span>Item</span><select class='in small' id='to-item'>" + (opts || "<option value=''>No items yet — add items in the estimate first</option>") + "</select></label>" +
        "<label class='cad-f'><span>Quantity from</span><select class='in small' id='to-kind'><option value='L'>Length</option><option value='A'>Area</option><option value='V'>Area × thickness / depth = volume</option><option value='VL'>Length × width × depth = volume</option><option value='N'>Count</option><option value='M'>Length × kg per metre = weight</option></select></label>" +
        "<label class='cad-f'><span>Thickness / depth / width / kg per m</span><input class='in small' id='to-k' placeholder='e.g. 0.15 m, 230 mm, 7.85 (kg/m)'></label><label class='cad-f'><span>Width (for length × width × depth)</span><input class='in small' id='to-w' placeholder='e.g. 0.6 m'></label>" +
        "<label class='cad-f'><span>Description in the measurement row</span><input class='in small' id='to-d' value='" + esc("From drawing " + C.ed.doc.d.name + (Object.keys(res.layers || {}).length ? " · " + Object.keys(res.layers).join(", ") : "")) + "'></label>" +
        "<p class='muted small' id='to-prev'></p><div class='row' style='gap:8px;justify-content:flex-end'><button type='button' class='btn ghost sm' data-dlg='close'>Cancel</button><button type='button' class='btn pri sm' data-to='add'>Add measurement row</button></div>";
    }
    function calc(dlg) {
      var est = mine.filter(function (e) { return e.id === estId; })[0], it = est.doc.items.filter(function (x) { return x.id === dlg.querySelector("#to-item").value; })[0]; if (!it) return { err: "Choose an item" };
      var inf = EP.itemInfo(it), u = UN.fromSor(inf.unit), kind = dlg.querySelector("#to-kind").value, kt = dlg.querySelector("#to-k").value.trim(), wt = dlg.querySelector("#to-w").value.trim(), val, dim;
      try {
        if (kind === "L") { val = res.len; dim = "L"; } else if (kind === "A") { val = res.area; dim = "A"; } else if (kind === "N") { val = res.count; dim = "N"; }
        else if (kind === "V") { var t = UN.parseLen(kt, "m"); if (t == null) return { err: "Type the thickness / depth" }; val = res.area * t; dim = "V"; }
        else if (kind === "VL") { var dd = UN.parseLen(kt, "m"), ww = UN.parseLen(wt, "m"); if (dd == null || ww == null) return { err: "Type the width and the depth" }; val = res.len * ww * dd; dim = "V"; }
        else if (kind === "M") { var kgm = UN.evalNum(kt); if (kgm == null) return { err: "Type kg per metre" }; val = res.len / 1000 * kgm; dim = "M"; }
        if (!u) return { err: "The item's unit (" + inf.unit + ") cannot be measured from a drawing — use a manual row" };
        var q = dim === "M" ? UN.conv(val, "kg", u) : UN.toSor(val, dim, u);
        return { q: q, it: it, inf: inf, est: est, kind: kind };
      } catch (e) { return { err: e.message }; }
    }
    var dlg = dialog(body(), async function (b, dlg) {
      if (b.dataset.to !== "add") return; var r = calc(dlg); if (r.err) { U.toast(r.err); return; }
      var row = { k: "+", d: dlg.querySelector("#to-d").value.slice(0, 200), n: "", q: String(+r.q.toFixed(4)), src: { cad: C.cur.id, name: C.ed.doc.d.name, ents: (res.ids || []).slice(0, 500), kind: r.kind, len: res.len, area: res.area, count: res.count, at: Date.now() } };
      r.it.meas = r.it.meas || []; r.it.meas.push(row); C.toEst = r.est.id; C.toItem = r.it.id;
      var up = await db().from("estimates").update({ data: r.est.doc }).eq("id", r.est.id);
      if (up.error) { if (U.off && U.off.isNet(up.error)) { await U.off.queue(r.est); } else { U.fail(up, "Couldn't update the estimate."); return; } }
      closeDialog(); U.toast("Added " + UN.trimNum(r.q, 3) + " " + r.inf.unit + " to " + r.est.name + " (item " + (r.inf.code || "NS") + ")");
      if (U.logAct) U.logAct("cad_takeoff", r.est.name + " · " + (r.inf.code || "NS") + " · " + UN.trimNum(r.q, 3) + " " + r.inf.unit);
    });
    function upd() { var r = calc(dlg), el = dlg.querySelector("#to-prev"); if (el) el.textContent = r.err ? r.err : "Will add " + UN.trimNum(r.q, 3) + " " + r.inf.unit + " to " + r.est.name + " → " + (r.inf.code || "NS") + "."; }
    dlg.addEventListener("change", function (ev) { if (ev.target.id === "to-est") { estId = ev.target.value; dlg.querySelector(".cad-dlgbox").innerHTML = body(); } upd(); });
    dlg.addEventListener("input", upd);
    var it0 = dlg.querySelector("#to-item"); if (it0 && it0.value) { var est = mine.filter(function (e) { return e.id === estId; })[0], x = est.doc.items.filter(function (y) { return y.id === it0.value; })[0]; if (x) { var u = UN.fromSor(EP.itemInfo(x).unit), dim = u && UN.get(u).dim; var ks = dlg.querySelector("#to-kind"); ks.value = dim === "A" ? "A" : dim === "V" ? "V" : dim === "N" ? "N" : dim === "M" ? "M" : "L"; } }
    upd();
  }

  /* ================= Design Studio → CAD ================= */
  /* Design Studio → one 3D model (dsmodel entity) in a new drawing, opened with the 3D view */
  function open3dFor(model) {
    var below = model.parts.some(function (q) { var t = q[0]; return (t === "b" || t === "t") ? q[5] < 0 : t === "c" ? q[4] < 0 : t === "p" ? q[2] < 0 : (t === "m" || t === "i") ? (q[1][2] < 0 || q[2][2] < 0) : false; });
    setTimeout(function () { try { if (C.ed && C.ed.on3d && C.v3mode === "off") C.ed.on3d(); if (below) setTimeout(function () { if (C.v3) { C.v3.showGround = false; C.v3.dirty = true; } }, 200); } catch (er) { console.error(er); } }, 400);
  }
  CAD.sendModel = async function (model, name, mid) {
    var B = EP.bim, d = CAD.newDoc(name || "Design Studio 3D model", "mm"), bs = B.ensure(d), lv = bs.levels && bs.levels[0];
    d.ents = [{ id: CAD.uid(), t: "dsmodel", p: [0, 0], rot: 0, mod: mid || "", name: model.name || name, parts: model.parts, lvl: lv ? lv.id : undefined, layer: "0" }];
    S.tab = "cad"; try { history.replaceState(null, "", "#cad"); } catch (e) {} await newDrawing(d.name, "mm", d); window.scrollTo(0, 0);
    open3dFor(model);
    U.toast("3D model opened in CAD Studio — orbit with the mouse, use the ViewCube / Top / Front buttons");
  };
  CAD.openSheets = async function (sheets, name, model, mid) {
    var DS = window.DS || (EP.DS); var dxf = (window.DS && window.DS.drawing ? window.DS.drawing : null);
    if (!dxf) { U.toast("Drawing engine not ready"); return; }
    var res = CAD.parseDxf(dxf.to_dxf(sheets), { unitMm: 1 }), d = CAD.newDoc(name || "Design Studio drawing", "mm");
    Object.keys(res.layers).forEach(function (k) { d.layers[k] = res.layers[k]; }); d.blocks = res.blocks; d.ents = res.ents.map(function (e) { e.id = CAD.uid(); return e; });
    if (model && model.parts && model.parts.length) {   /* the 3D model of the same design, placed to the right of the sheets */
      var B = EP.bim, bs = B.ensure(d), lv = bs.levels && bs.levels[0], G = EP.geom, all = [], ent = { id: CAD.uid(), t: "dsmodel", p: [0, 0], rot: 0, mod: mid || "", name: model.name || name, parts: model.parts, lvl: lv ? lv.id : undefined, layer: "0" };
      d.ents.forEach(function (e) { try { all = all.concat(G.segsOf(e, d.blocks)); } catch (er) {} });
      B.ctx.doc = { d: d }; var mb = G.bboxSegs(B.EXT.dsmodel.plan({ d: d }, ent).segs), sb = all.length ? G.bboxSegs(all) : [0, 0, 0, 0];
      ent.p = [sb[2] + 5000 - mb[0], (sb[1] + sb[3]) / 2 - (mb[1] + mb[3]) / 2]; d.ents.push(ent);
    }
    S.tab = "cad"; try { history.replaceState(null, "", "#cad"); } catch (e) {} await newDrawing(d.name, "mm", d); window.scrollTo(0, 0); if (model && model.parts && model.parts.length) open3dFor(model); U.toast("Opened in CAD Studio — edit, dimension, plot or take off quantities");
  };

  /* ================= the tab ================= */
  U.views.cad = function () {
    if (C.cur && C.root) return "<div id='cad-host' class='cad-host'></div>";
    if (C.list === null) { loadList(); return "<div class='empty'>Loading drawings…</div>"; }
    var h = "<div style='display:flex;flex-direction:column;gap:12px;max-width:1200px'><div class='row' style='gap:8px;align-items:center;flex-wrap:wrap'><h1 class='grow' style='margin:0'>CAD Studio <span class='muted' style='font-size:.55em;font-weight:500'>2D drafting · DXF · take-off</span></h1>" +
      "<button type='button' class='btn sec' data-cadh='imp'>Import DXF…</button><button type='button' class='btn sec' data-cadh='imppdf'>Import PDF…</button><button type='button' class='btn pri' data-cadh='new'>+ New drawing</button></div>" +
      "<p class='muted' style='margin:0'>Draw and edit plans, sections and details like AutoCAD: lines, polylines, arcs, hatches, dimensions, blocks, layers, object snaps, ortho / polar tracking, trim / extend / offset / fillet, and typed coordinates in mm, m or feet-inches. Open DXF files (DWG: save as DXF first, e.g. with the free ODA File Converter), trace over PDF / scanned drawings, plot PDF sheets and send lengths, areas and counts straight into an estimate.</p>";
    if (!C.cloudOk) h += "<div class='ds-msg' role='note'>Drawings are saved on this device. To keep them online and on all your devices, the super admin runs <code>supabase/cad.sql</code> once in Supabase → SQL Editor. <span class='muted'>(" + esc(C.cloudErr) + ")</span></div>";
    if (!C.list.length) h += "<div class='panel empty'>No drawings yet. Start with <b>+ New drawing</b> or import a DXF.</div>";
    else h += "<div class='cadlist'>" + C.list.map(function (x) { return "<button type='button' class='cadcard' data-cadopen='" + esc(x.id) + "'>" + (x.thumb ? "<img src='" + esc(x.thumb) + "' alt=''>" : "<div class='cadnothumb'>📐</div>") + "<b>" + esc(x.name) + "</b><span class='muted small'>" + (x.ents || 0) + " objects · " + esc(unitLabel(x.units || "mm")) + "<br>" + esc(when(x.updated)) + (x.unsynced ? " · <span style='color:var(--warn)'>on this device only</span>" : "") + "</span></button>"; }).join("") + "</div>";
    return h + "</div>";
  };
  var after0 = U.after;
  U.after = function () {
    if (after0) after0.apply(this, arguments);
    var host = document.getElementById("cad-host"); if (host && C.root && C.root.parentNode !== host) {
      var ae = C.lastFocus && C.root.contains(C.lastFocus) ? C.lastFocus : null, ss = null; try { ss = ae && ae.selectionStart; } catch (e) {}
      host.appendChild(C.root); fitHost(); if (C.ed) { C.ed.resize(); C.ed.dirty = true; }
      if (ae && (document.activeElement === document.body || !document.activeElement)) { ae.focus({ preventScroll: true }); try { if (ss != null) ae.setSelectionRange(ss, ss); } catch (e) {} }
    }
  };
  function fitHost() { var host = document.getElementById("cad-host"); if (!host) return; if (document.body.classList.contains("cadmax")) { host.style.height = ""; return; } var top = host.getBoundingClientRect().top + window.scrollY, h = Math.max(460, window.innerHeight - Math.min(top, window.innerHeight * 0.45) - 10); host.style.height = h + "px"; }
  window.addEventListener("resize", function () { if (C.root) { fitHost(); if (C.ed) C.ed.resize(); } });
  document.addEventListener("click", function (ev) {
    var t = ev.target.closest && ev.target.closest("button"); if (!t) return; var ds = t.dataset;
    if (ds.cadopen) { openDrawing(ds.cadopen); return; }
    if (ds.cadh === "new") {
      dialog("<h3>New drawing</h3><label class='cad-f'><span>Name</span><input class='in small' id='nd-n' value='Drawing " + ((C.list || []).length + 1) + "'></label><label class='cad-f'><span>Work in</span><select class='in small' id='nd-u'>" + ["mm", "cm", "m", "ftin", "ft", "in"].map(function (u) { return "<option value='" + u + "'>" + unitLabel(u) + "</option>"; }).join("") + "</select></label><label class='cad-f'><span>Drawing scale 1 :</span><select class='in small' id='nd-s'>" + [1, 5, 10, 20, 50, 100, 200, 500, 1000].map(function (s) { return "<option" + (s === 100 ? " selected" : "") + ">" + s + "</option>"; }).join("") + "</select></label><p class='muted small'>The scale sets the size of text, dimensions and linetypes; the geometry is always drawn full size.</p><div class='row' style='gap:8px;justify-content:flex-end'><button type='button' class='btn ghost sm' data-dlg='close'>Cancel</button><button type='button' class='btn pri sm' data-nd='1'>Create</button></div>",
        function (b, dlg) { if (!b.dataset.nd) return; var nm = dlg.querySelector("#nd-n").value.trim() || "Drawing", u = dlg.querySelector("#nd-u").value, sc = +dlg.querySelector("#nd-s").value || 100; closeDialog(); var d = CAD.newDoc(nm, u); d.dim.sc = sc; d.sheet.scale = sc; newDrawing(nm, u, d); });
      return;
    }
    if (ds.cadh === "imp") { pickFile(".dxf", function (f) { importDxfFile(f, false); }); return; }
    if (ds.cadh === "imppdf") { pickFile("application/pdf,.pdf", async function (f) { var nm = f.name.replace(/\.pdf$/i, ""); var d = CAD.newDoc(nm, "m"); await newDrawing(nm, "m", d); attachPdf(f); }); return; }
  });
  document.addEventListener("focusin", function (ev) { if (C.root && C.root.contains(ev.target)) C.lastFocus = ev.target; });
  document.addEventListener("keydown", function (ev) { if (C.ed && S.tab === "cad" && (ev.ctrlKey || ev.metaKey) && (ev.key === "s" || ev.key === "S")) { ev.preventDefault(); saveCloud(true).then(function () { U.toast(C.cloudOk ? "Saved" : "Saved on this device"); }); } });
  window.addEventListener("beforeunload", function () { if (C.cur && !C.cur.synced && C.ed) saveLocal(C.cur, C.ed.doc.d); });
})();
