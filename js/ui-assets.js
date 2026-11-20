/* Estimate Pro — CAD Studio: item library (Phase G), GLB / glTF import, 3D previews and GLB / OBJ / IFC export (Phase H). */
(function () {
  "use strict";
  var EP = window.EP, U = EP.ui, esc = U.esc, CAD = EP.cad, B = EP.bim, G = EP.geom;
  var at = CAD.RIBBON.findIndex(function (g) { return /Roads/.test(g[0]); });
  CAD.RIBBON.splice(at + 1, 0, ["Site & services", [["ASSET", "Library item"], ["LANDAREA", "Landscape area"]]]);
  CAD.SIDE_TABS.splice(2, 0, ["lib", "Library"]);
  CAD.MENU_EXTRA = (CAD.MENU_EXTRA || []).concat([["-"], ["impglb", "Import 3D model (GLB / glTF)…"], ["expglb", "Export 3D model — GLB"], ["expobj", "Export 3D model — OBJ + MTL (zip)"], ["expifc", "Export BIM model — IFC4"]]);

  /* ---------- plan symbol → small SVG icon ---------- */
  function icon(kind, size) {
    var def = B.ASSET_LIB[kind], X = function (q) { return [q[0], q[1]]; }; X.s = 1; X.r = 0; var segs = def.sym(X, { cap: 1000 }), bb = G.bboxSegs(segs), w = Math.max(bb[2] - bb[0], bb[3] - bb[1], 1), pad = w * 0.08, vb = [bb[0] - pad, -bb[3] - pad, (bb[2] - bb[0]) + 2 * pad, (bb[3] - bb[1]) + 2 * pad], sw = w / 40;
    var d = segs.map(function (s) { if (s.k === "L") return "M" + s.a[0].toFixed(0) + " " + (-s.a[1]).toFixed(0) + "L" + s.b[0].toFixed(0) + " " + (-s.b[1]).toFixed(0); if (s.full) return "M" + (s.c[0] + s.r).toFixed(0) + " " + (-s.c[1]).toFixed(0) + "a" + s.r.toFixed(0) + " " + s.r.toFixed(0) + " 0 1 0 " + (-2 * s.r).toFixed(0) + " 0a" + s.r.toFixed(0) + " " + s.r.toFixed(0) + " 0 1 0 " + (2 * s.r).toFixed(0) + " 0"; return ""; }).join("");
    return "<svg viewBox='" + vb.map(function (v) { return v.toFixed(0); }).join(" ") + "' width='" + (size || 44) + "' height='" + (size || 44) + "' aria-hidden='true'><path d='" + d + "' fill='none' stroke='currentColor' stroke-width='" + sw.toFixed(1) + "' stroke-linecap='round'/></svg>";
  }
  B.assetIcon = icon;
  function sorOf(d, key) { var s = B.resolve(d, key, "super"), it = s && EP.item && EP.item(s.b, s.c); return it ? ((EP.BOOKS[s.b] || {}).short || s.b) + " " + s.c : "choose in Σ Quantities"; }

  /* ---------- side tab: library ---------- */
  /* door / window presets shown as library cards */
  var DW_ICON = { single: "<path d='M2 20h8M10 20a8 8 0 0 0-8-8' />", double: "<path d='M0 20h6M6 20a6 6 0 0 0-6-6M24 20h-6M18 20a6 6 0 0 1 6-6' />", sliding: "<path d='M2 14h20M2 18h12M10 22h12' />", shutter: "<path d='M2 8h20M2 12h20M2 16h20M2 20h20' />", win: "<path d='M2 6h20v14H2zM12 6v14M2 13h20' />", fixed: "<path d='M2 6h20v14H2z M5 9h14v8H5z' />", louvre: "<path d='M3 6h18v14H3zM3 9h18M3 12h18M3 15h18' />", grill: "<path d='M3 6h18v14H3zM7 6v14M11 6v14M15 6v14M19 6v14' />" };
  function dwIcon(e, win) { var k = win ? (e.kind === "fixed" ? "fixed" : e.kind === "louvre" ? "louvre" : e.kind === "grill" ? "grill" : "win") : (DW_ICON[e.kind] ? e.kind : "single"); if (!win && e.style === "glass") k = "win"; if (!win && e.style === "grill") k = "grill"; return "<svg viewBox='0 0 24 24' width='44' height='44' fill='none' stroke='currentColor' stroke-width='1.2' stroke-linecap='round' aria-hidden='true'>" + DW_ICON[k] + "</svg>"; }
  CAD.PANELS.lib = function (ed) {
    var d = ed.doc.d, cats = {}, q = (ed._libQ || "").trim().toLowerCase(), hit = function (txt) { return !q || q.split(/\s+/).every(function (w) { return txt.indexOf(w) >= 0; }); };
    var h = "<div class='cad-ph'>Library — click Place, then click in the drawing</div><input class='in small' type='search' placeholder='Search items (e.g. basin, mirror, double door, sofa…)' data-libq='1' value='" + esc(ed._libQ || "") + "' style='width:100%;margin:4px 0' aria-label='Search the library'><p class='muted small'>App-made symbols and 3D shapes (not manufacturer models). Each placed item is counted in Σ Quantities with the SOR item shown (change it there).</p>";
    function dw(lib, win) { var t = win ? "win" : "door", cards = lib.filter(function (x) { return hit((x.id + " " + x.name + " " + (x.kind || "") + " " + (x.mat || "") + " " + (win ? "window" : "door")).toLowerCase()); }); if (!cards.length) return ""; return "<details class='libcat'" + (q || !win ? " open" : "") + "><summary class='cad-ph'>" + (win ? "Windows" : "Doors") + " (" + cards.length + ")</summary><div class='libgrid'>" + cards.map(function (x) { return "<div class='libcard'><div class='libic'>" + dwIcon(x, win) + "</div><div class='libtx'><b>" + esc(x.id + " — " + x.name) + "</b><span class='muted small'>" + esc((x.kind || "") + (x.style ? ", " + x.style : "") + " · " + x.w + "×" + x.h + (win ? ", sill " + x.sill : "")) + "</span></div><div class='libbt'><button type='button' class='btn sec sm' data-libdw='" + t + ":" + x.id + "'>Place</button></div></div>"; }).join("") + "</div></details>"; }
    h += dw(B.DOORS, false) + dw(B.WINDOWS, true);
    Object.keys(B.ASSET_LIB).forEach(function (k) { var a = B.ASSET_LIB[k]; if (hit((a.n + " " + a.cat + " " + k).toLowerCase())) (cats[a.cat] = cats[a.cat] || []).push(k); });
    Object.keys(cats).forEach(function (c) {
      h += "<details class='libcat'" + (q ? " open" : "") + "><summary class='cad-ph'>" + esc(c) + " (" + cats[c].length + ")</summary><div class='libgrid'>" + cats[c].map(function (k) { var a = B.ASSET_LIB[k]; return "<div class='libcard' draggable='true' data-libdrag='" + k + "' title='Drag onto the drawing, or press Place'><div class='libic'>" + icon(k) + "</div><div class='libtx'><b>" + esc(a.n) + "</b><span class='muted small'>" + esc(sorOf(d, a.key)) + "</span></div><div class='libbt'><button type='button' class='btn sec sm' data-libplace='" + k + "'>Place</button><button type='button' class='btn ghost sm' data-libprev='" + k + "' title='3D preview'>3D</button></div></div>"; }).join("") + "</div></details>";
    });
    if (q && !Object.keys(cats).length && h.indexOf("libcat") < 0) h += "<p class='muted small'>Nothing matches “" + esc(q) + "”.</p>";
    h += "<div class='cad-ph'>Landscape areas</div><div class='row' style='gap:6px;flex-wrap:wrap'>" + Object.keys(B.LAND).map(function (k) { return "<button type='button' class='btn sec sm' data-libland='" + k + "'><span class='lk-sw' style='background:" + B.LAND[k][2].replace(/[\d.]+\)$/, "1)") + "'></span>" + esc(B.LAND[k][0]) + "</button>"; }).join("") + "</div>";
    h += "<div class='cad-ph'>Your own 3D models</div><p class='muted small'>Import a GLB / glTF 2.0 file (furniture, equipment, vehicles…). Textures are shown as plain colours; compressed (Draco) files are not supported.</p><button type='button' class='btn sec sm' data-cad='impglb'>Import 3D model (GLB / glTF)…</button>";
    var models = Object.keys(d.assets || {}).filter(function (id) { return d.assets[id].kind === "glb"; }); if (models.length) h += "<div class='small' style='margin-top:6px'>" + models.map(function (id) { var a = d.assets[id], g = B.GLB[id]; return "<div class='row' style='gap:6px;align-items:center;margin:2px 0'><span class='grow'>" + esc(a.name) + " <span class='muted'>(" + (g ? Math.round(g.n / 3).toLocaleString("en-IN") + " triangles" : "loading…") + ")</span></span><button type='button' class='btn ghost sm' data-libglb='" + esc(id) + "'>Place again</button></div>"; }).join("") + "</div>";
    return h;
  };

  /* ---------- properties ---------- */
  function f(label, key, val, pt, o) { o = o || {}; return "<label class='cad-f'><span>" + label + "</span><input class='in small' data-pf='b." + key + "' data-pt='" + (pt || "len") + "' value='" + esc(val == null ? "" : val) + "'" + (o.ph ? " placeholder='" + esc(o.ph) + "'" : "") + "></label>"; }
  function sel(label, key, val, opts) { return "<label class='cad-f'><span>" + label + "</span><select class='in small' data-pp='b." + key + "'>" + opts.map(function (o) { return "<option value='" + esc(o[0]) + "'" + (String(o[0]) === String(val) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></label>"; }
  function ro(label, val) { return "<label class='cad-f'><span>" + label + "</span><input class='in small' value='" + esc(val) + "' readonly></label>"; }
  var prevFields = CAD.HOOKS.fields;
  CAD.HOOKS.fields = function (e, ed) {
    if (e.t !== "asset" && e.t !== "land" && e.t !== "model3d") return prevFields ? prevFields(e, ed) : "";
    var b = B.ensure(ed.doc.d), lv = b.levels.map(function (l) { return [l.id, l.name]; }), Lm = function (v) { return v == null ? "" : ed.fmt(v); }, h = "";
    if (e.t === "asset") {
      var def = B.ASSET_LIB[e.kind] || {}, L = B.level(ed.doc.d, e.lvl), zNow = B.assetZ(ed.doc, Object.assign({}, e, { z: null }), def) - L.elev;
      h += "<div class='cad-ph'>" + esc(def.cat || "Item") + " — " + esc(def.n || e.kind) + "</div><div class='libic' style='margin:4px 0'>" + icon(e.kind, 56) + "</div>" + sel("Item", "kind", e.kind, Object.keys(B.ASSET_LIB).map(function (k) { return [k, B.ASSET_LIB[k].cat + " — " + B.ASSET_LIB[k].n]; })) + sel("Level", "lvl", e.lvl, lv) +
        f("Rotation °", "rot", e.rot || 0, "num") + f("Scale (1 = standard)", "sc", e.sc || 1, "num") + (function () {
          var hh = (def.h || 60) * (e.sc || 1), zb = B.assetZ(ed.doc, e, def) - L.elev, auto = def.mount === "top" ? "on top of the slab above" : def.mount === "ceiling" ? "under the slab" : def.mount === "wall" ? "on the wall at " + Lm(def.mz || 1200) : "on the floor";
          var lab = { floor: "Bottom of the item above the floor", fceil: "Gap below the false ceiling (0 = touching)", ceiling: "Gap below the slab (0 = touching)", top: "Above the top of the slab" };
          var rm = e.ref === "fceil" ? B.roomAt(ed.doc, e.p, e.lvl, true) : null;
          return (def.deco ? "<p class='muted small'>🌳 Decoration — for the 3D view and drawings. Not counted in the estimate unless you choose Yes below.</p>" + sel("Count in the estimate (Σ Quantities)", "noq", e.noq === false ? "false" : "", [["", "No — show only"], ["false", "Yes — count it (1 no., choose the item in Σ Quantities)"]]) : sel("Count in the estimate (Σ Quantities)", "noq", e.noq === true ? "true" : "", [["", "Yes"], ["true", "No — show only"]])) +
            sel("Height is measured from", "ref", e.ref || "", [["", "Automatic — " + auto]].concat(B.MOUNT_REFS)) +
            (e.ref ? f(lab[e.ref] || "Distance", "dz", Lm(e.dz || 0), "len") + (e.ref === "fceil" ? ro("False ceiling here", Lm(B.fceilH(ed.doc, rm, e.lvl)) + " above floor" + (rm ? " (" + (rm.name || "room") + ")" : " — no room with a false ceiling here, standard height used")) : "")
              : f("Height above the level (blank = automatic)", "z", e.z == null ? "" : Lm(e.z), "len", { ph: Lm(zNow) })) +
            ro("Result: bottom / top above floor", Lm(Math.round(zb)) + " / " + Lm(Math.round(zb + hh)));
        })() + (e.kind === "tank" ? f("Capacity (litres)", "cap", e.cap || 1000, "num") + ro("Diameter × height", Lm(B.tankD(e)) + " × " + Lm(Math.round(B.tankD(e) * 1.15))) : "") +
        "<p class='muted small'>SOR item: " + esc(sorOf(ed.doc.d, def.key)) + "</p>";
    } else if (e.t === "land") {
      h += "<div class='cad-ph'>Landscape area</div>" + sel("Type", "kind", e.kind || "lawn", Object.keys(B.LAND).map(function (k) { return [k, B.LAND[k][0]]; })) + sel("Level", "lvl", e.lvl, lv) + ro("Area", (B.area(e.pts) / 1e6).toFixed(2) + " m²") + "<p class='muted small'>SOR item: " + esc(sorOf(ed.doc.d, "land_" + (e.kind || "lawn"))) + "</p>";
    } else {
      var a = (ed.doc.d.assets || {})[e.asset] || {}, g = B.GLB[e.asset];
      h += "<div class='cad-ph'>Imported 3D model</div>" + f("Name", "name", e.name || a.name || "", "text") + sel("Level", "lvl", e.lvl, lv) + f("Rotation °", "rot", e.rot || 0, "num") + f("Scale (model units → m)", "sc", e.sc || 1, "num") + f("Base height above the level", "z", Lm(e.z || 0)) + sel("Count in quantities", "count", String(e.count !== false), [["true", "Yes (1 no.)"], ["false", "No"]]) +
        (g ? ro("Size (m)", ((g.bbox[3] - g.bbox[0]) * (e.sc || 1)).toFixed(2) + " × " + ((g.bbox[4] - g.bbox[1]) * (e.sc || 1)).toFixed(2) + " × " + ((g.bbox[5] - g.bbox[2]) * (e.sc || 1)).toFixed(2)) + ro("Triangles", Math.round(g.n / 3).toLocaleString("en-IN") + (g.truncated ? " (cut at the limit)" : "")) : "<p class='muted small'>Model data is loading…</p>");
    }
    var q = B.qty(ed.doc, e); if (q.length) h += "<div class='cad-ph'>Quantities</div><div class='bimq'>" + q.map(function (r) { return "<div><span>" + esc(r.label) + "</span><b>" + (r.dim === "A" ? (r.v / 1e6).toFixed(2) + " m²" : r.dim === "V" ? (r.v / 1e6).toFixed(0) + " litre" : r.v + " no.") + "</b></div>"; }).join("") + "</div>";
    return h;
  };

  /* ---------- 3D preview in a dialog ---------- */
  function preview(title, doc, only, note) {
    var dlg = CAD.ui.dialog("<h3>" + esc(title) + "</h3>" + (note ? "<p class='muted small'>" + note + "</p>" : "") + "<div class='pv3' style='position:relative;height:min(52vh,420px);border:1px solid var(--line);border-radius:6px;overflow:hidden'></div><div class='row' style='justify-content:flex-end;margin-top:6px'><button type='button' class='btn ghost sm' data-dlg='close'>Close</button></div>", function () {});
    var host = dlg.querySelector(".pv3"), v = new B.View3D(host, { lose: true }); if (v.dead) return;
    var sc = B.meshes(doc, { only: only, allLevels: true }); v.setScene(sc); v.frame("iso"); v.sunAz = 135; v.sunEl = 45; v.dirty = true;
  }
  function assetPreview(kind) {
    var d = CAD.newDoc ? CAD.newDoc("preview", "mm") : null; if (!d) return; B.ensure(d); var D = new CAD.Doc(d), e = D.add({ t: "asset", kind: kind, p: [0, 0], lvl: d.bim.levels[0].id, cap: 1000 }); D.flush(); B.ctx.doc = D;
    preview(B.ASSET_LIB[kind].n, D, new Set([e.id]), "App-made symbol (not a manufacturer model). Plan symbol and 3D size can be scaled in Properties.");
  }
  B.previewIds = function (ed, ids, title, note) { preview(title, ed.doc, new Set(ids), note); };

  /* ---------- GLB / glTF import ---------- */
  async function loadGlb(ed, id) { if (B.GLB[id]) return B.GLB[id]; var blob = await CAD.ui.assetBlob(id); if (!blob) return null; try { B.GLB[id] = B.parseGLTF(await blob.arrayBuffer(), (ed.doc.d.assets[id] || {}).name); } catch (er) { console.warn(er); return null; } ed.doc.flush(); ed.dirty = true; return B.GLB[id]; }
  function importGlb(ed, C) {
    var inp = document.createElement("input"); inp.type = "file"; inp.accept = ".glb,.gltf,model/gltf-binary,model/gltf+json";
    inp.onchange = async function () {
      var file = inp.files[0]; if (!file) return; var buf, g;
      try { buf = await file.arrayBuffer(); g = B.parseGLTF(buf, file.name); } catch (er) { U.toast("Couldn't read the model: " + er.message); return; }
      var id = CAD.uid(), A = Object.assign({}, ed.doc.d.assets || {}), size = Math.max(g.bbox[3] - g.bbox[0], g.bbox[4] - g.bbox[1], g.bbox[5] - g.bbox[2]), sc = size > 500 ? 0.001 : size > 60 ? 0.01 : 1;
      A[id] = { name: file.name, mime: "model/gltf-binary", kind: "glb", size: file.size };
      if (U.off) await U.off.put("cadasset:" + id, new Blob([buf], { type: "model/gltf-binary" }));
      B.GLB[id] = g; var w = ed.s2w(ed.W / 2, ed.H / 2), b = B.ensure(ed.doc.d);
      ed.doc.begin("Import 3D model"); ed.doc.set("assets", A); var e = ed.doc.add({ t: "model3d", asset: id, p: w, rot: 0, sc: sc, z: 0, lvl: b.cur, name: file.name.replace(/\.(glb|gltf)$/i, ""), layer: "0" }); ed.doc.commit();
      ed.sel = new Set([e.id]); ed.emitSel(); C.panel = "props"; CAD.ui.renderPanels(); ed.dirty = true;
      U.toast(file.name + ": " + Math.round(g.n / 3).toLocaleString("en-IN") + " triangles" + (sc !== 1 ? " — scaled × " + sc + " (the file looks like " + (sc === 0.001 ? "millimetres" : "centimetres") + ")" : "") + (g.truncated ? " — very large model, cut at the limit" : "") + ". Move it with MOVE; it is saved with the drawing.");
    };
    inp.click();
  }

  /* ---------- exports ---------- */
  function fname(ed) { return CAD.ui.fname(ed.doc.d.name || "model"); }
  function hasModel(ed) { var ok = ed.doc.d.ents.some(B.is); if (!ok) U.toast("No building / road / library elements to export — export DXF for 2D drawings"); return ok; }
  CAD.ACTIONS.impglb = function (ed, C) { importGlb(ed, C); };
  CAD.ACTIONS.expglb = function (ed) { if (!hasModel(ed)) return; B.ctx.doc = ed.doc; var buf = B.exportGLB(ed.doc); CAD.ui.dl(new Blob([buf], { type: "model/gltf-binary" }), fname(ed) + ".glb"); U.toast("GLB exported (" + (buf.byteLength / 1048576).toFixed(2) + " MB) — opens in Windows 3D Viewer, Blender, SketchUp (with importer), online glTF viewers"); };
  CAD.ACTIONS.expobj = async function (ed) { if (!hasModel(ed)) return; B.ctx.doc = ed.doc; var n = fname(ed), o = B.exportOBJ(ed.doc, { name: n }), z = await U.camZip([{ name: n + ".obj", blob: new Blob([o.obj], { type: "text/plain" }) }, { name: n + ".mtl", blob: new Blob([o.mtl], { type: "text/plain" }) }]); CAD.ui.dl(z, n + "_obj.zip"); U.toast("OBJ + MTL exported in a zip"); };
  CAD.ACTIONS.expifc = function (ed) { if (!hasModel(ed)) return; B.ctx.doc = ed.doc; var r = B.exportIFC(ed.doc, { name: fname(ed), author: (EP.S.me && (EP.S.me.name || EP.S.me.email)) || "" }); CAD.ui.dl(new Blob([r.text], { type: "application/x-step" }), fname(ed) + ".ifc"); U.toast("IFC4 exported: " + Object.keys(r.counts).map(function (k) { return r.counts[k] + " " + k; }).join(", ")); };

  CAD.HOOKS.wire.push(function (ed, C) {
    var A = ed.doc.d.assets || {}; Object.keys(A).forEach(function (id) { if (A[id].kind === "glb" && !B.GLB[id]) loadGlb(ed, id).then(function (g) { if (g) { CAD.HOOKS.change.forEach(function (fn) { try { fn(ed, C); } catch (er) {} }); if (C.panel === "lib" || C.panel === "props") CAD.ui.renderPanels(); } }); });
    C.root.addEventListener("input", function (ev) { var t = ev.target; if (!t.dataset || !t.dataset.libq) return; ed._libQ = t.value; var pos = t.selectionStart; CAD.ui.renderPanels(); var n = C.root.querySelector("[data-libq]"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (er) {} } });
    /* drag a library card onto the drawing: a ghost follows the pointer (flush to walls), drop places it */
    var dragKind = null, dropPt = function (ev) { var r = ed.cv.getBoundingClientRect(); return ed.resolve(ev.clientX - r.left, ev.clientY - r.top).p; }, endDrag = function () { if (dragKind) { dragKind = null; ed.preview = null; ed.dirty = true; } };
    C.root.addEventListener("dragstart", function (ev) { var c = ev.target.closest && ev.target.closest("[data-libdrag]"); if (!c || ed.cmd) return; dragKind = c.dataset.libdrag; try { ev.dataTransfer.setData("text/plain", dragKind); ev.dataTransfer.effectAllowed = "copy"; } catch (er) { /* some browsers restrict this */ } });
    C.root.addEventListener("dragover", function (ev) { if (!dragKind || !ev.target.closest || !ev.target.closest(".cad-cv")) return; ev.preventDefault(); var w = dropPt(ev); ed.preview = function () { return [B.assetGhost(ed, dragKind, w)]; }; ed.dirty = true; });
    C.root.addEventListener("drop", function (ev) { if (!dragKind) return; var k = dragKind, on = ev.target.closest && ev.target.closest(".cad-cv"); ev.preventDefault(); var w = on ? dropPt(ev) : null; endDrag(); if (!w) return; var e = B.placeAsset(ed, k, w); if (e) { ed.sel = new Set([e.id]); ed.emitSel(); ed.dirty = true; } });
    C.root.addEventListener("dragend", endDrag);
    C.root.addEventListener("click", function (ev) {
      var t = ev.target.closest("button"); if (!t) return; var ds = t.dataset;
      if (ds.libplace) { ed.assetKind = ds.libplace; ed.exec("ASSET"); var cv = C.root.querySelector(".cad-cv"); if (cv) cv.focus(); return; }
      if (ds.libprev) { assetPreview(ds.libprev); return; }
      if (ds.libdw) { var pp = ds.libdw.split(":"), lib0 = pp[0] === "win" ? B.WINDOWS : B.DOORS, pr0 = lib0.filter(function (x) { return x.id === pp[1]; })[0]; if (pr0) { ed.preset = ed.preset || {}; ed.preset[pp[0] === "win" ? "window" : "door"] = pr0; ed.exec(pp[0] === "win" ? "WINDOW" : "DOOR"); var cv3 = C.root.querySelector(".cad-cv"); if (cv3) cv3.focus(); } return; }
      if (ds.libland) { ed.landPick = ds.libland === "pcc" ? "PCC" : ds.libland[0].toUpperCase() + ds.libland.slice(1); ed.exec("LANDAREA"); var cv2 = C.root.querySelector(".cad-cv"); if (cv2) cv2.focus(); return; }
      if (ds.libglb) { var g = B.GLB[ds.libglb]; if (!g) return; var w = ed.s2w(ed.W / 2, ed.H / 2), a = ed.doc.d.assets[ds.libglb]; ed.doc.begin("Place 3D model"); var e = ed.doc.add({ t: "model3d", asset: ds.libglb, p: w, rot: 0, sc: 1, z: 0, lvl: B.ensure(ed.doc.d).cur, name: (a.name || "").replace(/\.(glb|gltf)$/i, "") }); ed.doc.commit(); ed.sel = new Set([e.id]); ed.emitSel(); ed.dirty = true; return; }
    });
  });
})();
