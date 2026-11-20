/* Estimate Pro — BIM inside CAD Studio: building ribbon, levels panel, element properties, 3D view (split / full),
   quantity schedule with SOR mapping and "send / update estimate". */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc, CAD = EP.cad, B = EP.bim, G = EP.geom, UN = EP.units;
  CAD.RIBBON.splice(1, 0, ["Building (BIM)", [["WALL", "Wall"], ["DOOR", "Door"], ["WINDOW", "Window"], ["OPENING", "Opening"], ["COLUMN", "Column"], ["BEAM", "Beam"], ["SLAB", "Slab"], ["FOOTING", "Footing"], ["ROOF", "Roof"], ["STAIR", "Stair"], ["ROOM", "Room"], ["RAILING", "Railing"], ["FLOORCOPY", "Copy floor"], ["REBAR", "Rebar"], ["BBS", "BBS"]]]);
  CAD.SIDE_TABS.splice(1, 0, ["bim", "Building"]);
  CAD.HOOKS.top.push(function () { return "<span class='bim-top'></span><button type='button' class='btn sec sm' data-cad='iso' title='Toggle isometric 2D view'>◇ Iso</button><button type='button' class='btn sec sm' data-cad='v3' title='3D view: off → split → full'>🧊 3D</button><button type='button' class='btn sec sm' data-cad='qto' title='Quantities from the building model → estimate'>Σ Quantities</button>"; });

  function bim(ed) { return B.ensure(ed.doc.d); }
  function setBim(ed, fn, label) { var b = CAD.clone(bim(ed)); fn(b); ed.doc.begin(label || "Building settings"); ed.doc.set("bim", b); ed.doc.commit(); }
  function L(ed, mm) { return ed.fmt(mm); }

  /* ----- top bar: current level ----- */
  function topBar(ed, C) {
    var el = C.root && C.root.querySelector(".bim-top"); if (!el) return; var b = bim(ed);
    el.innerHTML = "<label class='bim-lv'>Level <select class='in small' data-bimlv='1' aria-label='Current level'>" + b.levels.slice().sort(function (x, y) { return y.elev - x.elev; }).map(function (l) { return "<option value='" + esc(l.id) + "'" + (l.id === b.cur ? " selected" : "") + ">" + esc(l.name) + " (" + UN.trimNum(l.elev / 1000, 3) + " m)</option>"; }).join("") + "</select></label>";
  }
  /* ----- side panel "Building" ----- */
  CAD.PANELS.bim = function (ed) {
    var b = bim(ed), R = b.rules, st = b.steel;
    var h = "<div class='cad-ph'>Levels</div><table class='t bimlv'><thead><tr><th></th><th>Name</th><th>Level (m)</th><th>Height (m)</th><th></th></tr></thead><tbody>" + b.levels.slice().sort(function (x, y) { return y.elev - x.elev; }).map(function (l) {
      return "<tr" + (l.id === b.cur ? " class='cur'" : "") + "><td><button type='button' class='cad-lb' data-bimcur='" + esc(l.id) + "' title='Work on this level'>" + (l.id === b.cur ? "✔" : "○") + "</button></td><td><input class='in small' data-bimlvf='" + esc(l.id) + "|name' value='" + esc(l.name) + "'></td><td><input class='in small' data-bimlvf='" + esc(l.id) + "|elev' value='" + UN.trimNum(l.elev / 1000, 3) + "'></td><td><input class='in small' data-bimlvf='" + esc(l.id) + "|h' value='" + UN.trimNum(l.h / 1000, 3) + "'></td><td>" + (b.levels.length > 1 ? "<button type='button' class='cad-lb' data-bimlvdel='" + esc(l.id) + "' title='Delete level (elements on it are kept on the lowest level)'>✕</button>" : "") + "</td></tr>";
    }).join("") + "</tbody></table><div class='row' style='gap:6px;margin:4px 0'><button type='button' class='btn sec sm' data-bimadd='1'>+ Level above</button><label class='small'><input type='checkbox' data-bimall='1'" + (b.showAll ? " checked" : "") + "> Show all levels in plan</label></div>";
    h += "<div class='cad-ph'>Site & defaults</div>" + numF("Ground level (NGL) below floor 0 (m)", "ngl", UN.trimNum(b.ngl / 1000, 3)) + numF("Wall thickness (mm)", "wallTh", b.wallTh) + numF("Slab thickness (mm)", "slabTh", b.slabTh) +
      "<label class='cad-f'><span>Wall material</span><select class='in small' data-bimset='wallMat'>" + Object.keys(B.MATS).map(function (k) { return "<option value='" + k + "'" + (b.wallMat === k ? " selected" : "") + ">" + B.MATS[k] + "</option>"; }).join("") + "</select></label>";
    var dd = ed.doc.d, sun = B.sunCfg(dd);
    h += "<div class='cad-ph'>3D materials</div><p class='muted small'>How surfaces look in 3D and in renders. Click the swatch to open the material library. Quantities and SOR items do not change.</p>" + B.LOOK_CATS.map(function (c) { var cl = B.catLook(dd, c[0]), L = B.LOOKS[cl.l]; return "<div class='lookrow'><span>" + esc(c[1]) + "</span><div class='look-pick' data-bimlookopen='" + c[0] + "' title='Click to change material'><span class='look-sw' style='background:" + (cl.c || L.c) + "'></span><span class='look-nm'>" + esc(L.n) + "</span></div><input type='color' data-bimlookc='" + c[0] + "' value='" + esc(cl.c || L.c) + "' aria-label='Colour of " + esc(c[1]) + "' title='Colour'></div>"; }).join("") + "<div class='row' style='gap:6px;margin:4px 0'><button type='button' class='btn ghost sm' data-bimlookreset='1'>Reset all to defaults</button></div>";
    h += "<div class='cad-ph'>Site location (sun and shadows)</div>" + numF("Latitude °", "sun.lat", sun.lat) + numF("Longitude °", "sun.lng", sun.lng) + numF("True north — ° clockwise from drawing up", "sun.north", sun.north) + "<div class='row' style='gap:6px;margin:4px 0'><button type='button' class='btn sec sm' data-bimgeo='1'>Use my location</button></div><p class='muted small'>Default: Bilaspur (SECL HQ). Time is Indian Standard Time.</p>";
    h += "<div class='cad-ph'>Measurement rules</div>" + numF("Masonry: deduct openings above (m²)", "rules.brickDed", R.brickDed) + numF("Plaster: ignore openings up to (m²)", "rules.plasterSmall", R.plasterSmall) + numF("Plaster: both faces + jambs above (m²)", "rules.plasterLarge", R.plasterLarge) +
      "<label class='cad-f'><span>RCC lintels over openings</span><input type='checkbox' data-bimchk='rules.lintel'" + (R.lintel ? " checked" : "") + "></label>" + numF("Lintel depth (mm)", "rules.lintelD", R.lintelD) + numF("Lintel bearing each side (mm)", "rules.lintelBear", R.lintelBear) + numF("Excavation working space (mm)", "rules.ws", R.ws);
    var rs = B.rfSettings(ed.doc.d), nRf = ed.doc.d.ents.filter(B.hasRf).length;
    h += "<div class='cad-ph'>Reinforcement (bars)</div><p class='muted small'>" + (nRf ? nRf + " element(s) have modelled bars — their steel comes from the bar bending schedule." : "No modelled bars yet. Use <b>Rebar</b> in the ribbon to add bars to columns, beams, footings and slabs.") + "</p>" +
      "<label class='cad-f'><span>Steel grade</span><select class='in small' data-bimrfs='grade'>" + ["Fe415", "Fe415D", "Fe500", "Fe500D", "Fe550", "Fe550D"].map(function (g) { return "<option" + (g === rs.grade ? " selected" : "") + ">" + g + "</option>"; }).join("") + "</select></label><label class='cad-f'><span>Concrete</span><select class='in small' data-bimrfs='conc'>" + ["M20", "M25", "M30", "M35", "M40"].map(function (g) { return "<option" + (g === rs.conc ? " selected" : "") + ">" + g + "</option>"; }).join("") + "</select></label>" + ro("Lap length (tension)", B.lapD(ed.doc.d) + " × bar diameter") +
      "<div class='row' style='gap:6px;margin:4px 0'><button type='button' class='btn sec sm' data-bimrfall='1'>Add bars to all</button><button type='button' class='btn sec sm' data-bimbbs='1'>Bar bending schedule</button></div>";
    h += "<div class='cad-ph'>Reinforcement thumb rules (kg/m³)</div><p class='muted small'>Used only for elements without modelled bars — replace with the designed steel.</p>" + ["footing", "column", "beam", "slab", "stair", "lintel"].map(function (k) { return numF(k[0].toUpperCase() + k.slice(1), "steel." + k, st[k]); }).join("");
    var cnt = {}; ed.doc.d.ents.forEach(function (e) { if (B.is(e)) cnt[e.t] = (cnt[e.t] || 0) + 1; });
    h += "<div class='cad-ph'>Model</div><p class='small'>" + (Object.keys(cnt).map(function (k) { return cnt[k] + " " + k + (cnt[k] > 1 ? "s" : ""); }).join(", ") || "No building elements yet — start with Wall.") + "</p>";
    return h;
  };
  function lookOpts(cur, def) { return (def ? "<option value=''>" + esc(def) + "</option>" : "") + B.lookOptions().map(function (o) { return "<option value='" + o[0] + "'" + (o[0] === cur ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join(""); }
  /* --- visual material library popup --- */
  var MAT_CATS = [
    ["paint", "Paints & Wall coverings", /^paint_|^plaster$|^wallpaper_|^gypsum|^concrete_micro$/],
    ["masonry", "Masonry", /^brick$|^block$|^stone$|^concrete$/],
    ["stone", "Granite, Marble & Tops", /^granite|^marble|^onyx|^quartz|^corian|^terrazzo$|^kota$/],
    ["tile", "Tiles & Flooring", /^tile_|^ips$|^wood_floor/],
    ["wood", "Wood", /^wood/],
    ["metal", "Metal & Sheet", /^sheet_|^aluminium$|^steel|^chrome$|^brass|^copper$/],
    ["roof", "Roofing", /^rooftile$/],
    ["glass", "Glass", /^glass/],
    ["panel", "Panels & Cladding", /^acp_|^hpl_|^wpc_|^stone_cladding|^panel_|^veneer_/],
    ["paving", "Paving & Ground", /^paver|^asphalt$|^grass$|^soil$/],
    ["plastic", "Plastic", /^upvc$/],
    ["fabric", "Furniture & Fabric", /^fabric_|^laminate_|^porcelain$|^leather_|^acrylic_/],
    ["light", "Lights", /^led_|^lamp$/]
  ];
  function matCatOf(id) { for (var i = 0; i < MAT_CATS.length; i++) if (MAT_CATS[i][2].test(id)) return MAT_CATS[i]; return null; }
  function matLibHtml(selectedId, forCat) {
    var h = "<div class='mat-lib'>";
    var grouped = {};
    Object.keys(B.LOOKS).forEach(function (k) {
      var cat = matCatOf(k); var cname = cat ? cat[1] : "Other";
      if (!grouped[cname]) grouped[cname] = [];
      grouped[cname].push(k);
    });
    var order = MAT_CATS.map(function (c) { return c[1]; }).concat(["Other"]);
    order.forEach(function (cname) {
      var items = grouped[cname]; if (!items || !items.length) return;
      h += "<div class='mat-cat'><div class='mat-cat-label'>" + esc(cname) + "</div><div class='mat-grid'>";
      items.forEach(function (k) {
        var L = B.LOOKS[k], sel = k === selectedId, pat = ["","▦","▥","◈","▤","▓","▩","≡","⫼","⌂","♣","◆","◇","◇","⬡","▪","▢"][L.p] || "";
        h += "<div class='mat-swatch" + (sel ? " mat-sel" : "") + "' data-matpick='" + k + "' title='" + esc(L.n) + "'>" +
          "<div class='mat-sw-color' style='background:" + L.c + ";opacity:" + (L.a != null ? L.a : 1) + "'>" +
          (L.g > 0.4 ? "<span class='mat-gloss'></span>" : "") + "</div>" +
          "<div class='mat-sw-name'>" + esc(L.n.replace(/^.*—\s*/, "").replace(/\(.*\)/, "").trim() || L.n) + "</div></div>";
      });
      h += "</div></div>";
    });
    h += "</div>";
    return h;
  }
  function numF(label, key, val) { return "<label class='cad-f'><span>" + label + "</span><input class='in small' data-bimset='" + key + "' value='" + esc(val) + "'></label>"; }
  /* material library popup */
  var _matLibCat = null; /* which category is the popup open for */
  function showMatLib(ed, C, cat, anchor) {
    /* close if already open for same cat */
    var existing = C.root.querySelector(".mat-lib-popup");
    if (existing) { existing.remove(); if (_matLibCat === cat) { _matLibCat = null; return; } }
    _matLibCat = cat;
    var cl = B.catLook(ed.doc.d, cat);
    var popup = document.createElement("div");
    popup.className = "mat-lib-popup";
    popup.innerHTML = "<div class='mat-lib-hdr'><b>Material Library</b> — " + esc((B.LOOK_CATS.filter(function (c) { return c[0] === cat; })[0] || [])[1] || cat) + "<button type='button' class='mat-lib-close' title='Close'>✕</button></div>" + matLibHtml(cl.l, cat);
    popup.dataset.matCat = cat;
    /* position near the anchor */
    var side = C.root.querySelector(".cad-side");
    if (side) { side.appendChild(popup); popup.style.cssText = "position:absolute;top:0;left:0;right:0;z-index:100;max-height:70vh;overflow-y:auto;"; }
    else { anchor.parentElement.appendChild(popup); }
    popup.querySelector(".mat-lib-close").addEventListener("click", function () { popup.remove(); _matLibCat = null; });
    /* close on outside click */
    setTimeout(function () {
      function closeLib(ev) { if (!popup.contains(ev.target) && !anchor.contains(ev.target)) { popup.remove(); _matLibCat = null; document.removeEventListener("pointerdown", closeLib, true); } }
      document.addEventListener("pointerdown", closeLib, true);
    }, 100);
  }
  function applyMatPick(ed, C, matId) {
    if (!_matLibCat) return;
    var cat = _matLibCat;
    setBim(ed, function (x) { x.looks = x.looks || {}; x.looks[cat] = { l: matId }; }, "3D material");
    /* close popup */
    var popup = C.root.querySelector(".mat-lib-popup"); if (popup) popup.remove();
    _matLibCat = null;
    CAD.ui.renderPanels();
  }

  /* wall finishes: tiles, dado, ACP, wall panels, stone cladding */
  function finLookOpts(kind, cur) { var P = B.FIN[kind] || B.FIN.tile, ids = P.looks.slice(); if (cur && ids.indexOf(cur) < 0 && B.LOOKS[cur]) ids.push(cur); return ids.filter(function (k) { return B.LOOKS[k]; }).map(function (k) { return "<option value='" + k + "'" + (k === cur ? " selected" : "") + ">" + esc(B.LOOKS[k].n) + "</option>"; }).join(""); }
  function finHtml(e, doc, ed) {
    var Lm = function (v) { return v == null ? "" : ed.fmt(v); }, xs = e.ext ? B.extSide(doc, e) : -1, H = B.wallH(doc, e), fc = function (i) { return "Face " + (i ? "B" : "A") + (xs === i ? " (outer)" : e.ext ? " (inner)" : ""); };
    var h = "<div class='cad-ph'>Wall finishes — tiles, ACP, panels, cladding</div><p class='muted small' style='margin:0 0 4px'>Face A is the left side of the wall as drawn, face B the right side. Select several walls to add the same finish to all of them. Openings are cut out and paint is not counted under the finish.</p>";
    B.finList(e).forEach(function (x) {
      var P = B.FIN[x.k] || B.FIN.tile, pre = "fin." + x.id + ".", L = B.look(x.look && B.LOOKS[x.look] ? x.look : P.look, x.col);
      h += "<div class='fin-card'><div class='row' style='justify-content:space-between;align-items:center'><b>" + esc(P.n) + "</b><button type='button' class='btn ghost sm' data-findel='" + x.id + "' aria-label='Remove finish'>Remove</button></div>" +
        sel("Kind", pre + "k", x.k, Object.keys(B.FIN).map(function (k) { return [k, B.FIN[k].n]; })) +
        sel("Face", pre + "fc", x.fc, [[0, fc(0)], [1, fc(1)], ["both", "Both faces"]]) +
        f("From height", pre + "z0", Lm(x.z0 || 0)) + f("To height (blank = top)", pre + "z1", x.z1 == null ? "" : Lm(x.z1), "len", { ph: Lm(H) }) +
        f("From along wall (blank = start)", pre + "s0", x.s0 == null ? "" : Lm(x.s0), "len") + f("To along wall (blank = end)", pre + "s1", x.s1 == null ? "" : Lm(x.s1), "len") +
        f("Layer thickness", pre + "th", Lm(x.th == null ? P.th : x.th)) +
        "<label class='cad-f'><span>Material</span><select class='in small' data-pp='b." + pre + "look'>" + finLookOpts(x.k, x.look || P.look) + "</select></label>" +
        colF("Colour", pre + "col", x.col, B.toHex(L)) +
        sel("Openings", pre + "ded", String(x.ded !== false), [["true", "Cut out (door / window)"], ["false", "Cover"]]) + "</div>";
    });
    h += "<div class='fin-add'><label class='cad-f'><span>Add finish</span><select class='in small' data-finkind='1'>" + Object.keys(B.FIN).map(function (k) { return "<option value='" + k + "'>" + esc(B.FIN[k].n) + "</option>"; }).join("") + "</select></label>" +
      "<label class='cad-f'><span>On face</span><select class='in small' data-finface='1'><option value='" + (xs >= 0 ? xs : 0) + "'>" + (xs >= 0 ? fc(xs) : "Face A") + "</option><option value='" + (xs >= 0 ? 1 - xs : 1) + "'>" + (xs >= 0 ? fc(1 - xs) : "Face B") + "</option><option value='both'>Both faces</option></select></label>" +
      "<button type='button' class='btn sec sm' data-finadd='1'>+ Add to selected wall(s)</button></div>";
    return h;
  }
  /* ----- element properties ----- */
  function f(label, key, val, pt, o) { o = o || {}; return "<label class='cad-f'><span>" + label + "</span><input class='in small' data-pf='b." + key + "' data-pt='" + (pt || "len") + "' value='" + esc(val == null ? "" : val) + "'" + (o.ph ? " placeholder='" + esc(o.ph) + "'" : "") + "></label>"; }
  function sel(label, key, val, opts) { return "<label class='cad-f'><span>" + label + "</span><select class='in small' data-pp='b." + key + "'>" + opts.map(function (o) { return "<option value='" + esc(o[0]) + "'" + (String(o[0]) === String(val) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></label>"; }
  function ro(label, val) { return "<label class='cad-f'><span>" + label + "</span><input class='in small' value='" + esc(val) + "' readonly></label>"; }
  CAD.HOOKS.fields = function (e, ed) {
    var doc = ed.doc, b = bim(ed), lv = b.levels.map(function (l) { return [l.id, l.name]; }), h = "<div class='cad-ph'>Building element — " + e.t + "</div>", Lm = function (v) { return v == null ? "" : ed.fmt(v); };
    if (e.lvl) h += sel("Level", "lvl", e.lvl, lv);
    switch (e.t) {
      case "wall": var H = B.wallH(doc, e), wp = B.wallPoly(doc, e); h += f("Thickness", "th", Lm(e.th)) + f("Height (blank = level − slab)", "h", e.h == null ? "" : Lm(e.h), "len", { ph: Lm(H) }) + f("Base offset", "base", Lm(e.base || 0)) + sel("Material", "mat", e.mat || "brick", Object.keys(B.MATS).map(function (k) { return [k, B.MATS[k]]; })) + sel("Exterior wall", "ext", String(!!e.ext), [["true", "Yes (external finish on outer face)"], ["false", "No (internal)"]]) + sel("Drawn line is", "just", e.just || "c", [["c", "Centre line"], ["l", "Left face"], ["r", "Right face"]]) + ro("Length (centre line)", ed.fmt(G.dist(e.a, e.b))) + ro("Joins", wp.joins.map(function (j) { return (j.end ? "end" : "start") + " " + j.kind; }).join(", ") || "free ends") + ro("Openings", B.openings(doc, e).length) + finHtml(e, doc, ed); break;
      case "door": case "window": case "opening": var pl = B.place(doc, e); h += (e.t === "door" ? sel("Type", "preset", e.preset, B.DOORS.map(function (x) { return [x.id, x.name]; }).concat([[e.preset, e.preset]])) : e.t === "window" ? sel("Type", "preset", e.preset, B.WINDOWS.map(function (x) { return [x.id, x.name]; }).concat([[e.preset, e.preset]])) : "") + f("Width", "w", Lm(e.w)) + f("Height", "h", Lm(e.h)) + (e.t !== "door" ? f("Sill height", "sill", Lm(e.sill || 0)) : "") + f("Position along wall (centre)", "at", Lm(e.at)) + (e.t === "door" ? sel("Opens", "flip", String(!!e.flip), [["false", "to the left side of the wall"], ["true", "to the right side"]]) + sel("Hinge", "swing", e.swing || "l", [["l", "At wall start side"], ["r", "At wall end side"]]) + sel("Leaves", "kind", e.kind || "single", [["single", "Single"], ["double", "Double"], ["sliding", "Sliding"], ["shutter", "Rolling shutter"]]) + sel("Style", "style", e.style || "", [["", "Plain flush"], ["panel", "Raised panels"], ["glass", "Glazed (glass panes)"], ["grill", "Steel grill"]]) + sel("Shutter", "mat", e.mat || "flush", [["flush", "Flush"], ["wood", "Wood panel"], ["pvc", "PVC / WPC"], ["steel", "Steel"], ["al", "Aluminium + glass"]]) : e.t === "window" ? sel("Kind", "kind", e.kind || "sliding", [["sliding", "Sliding"], ["casement", "Casement (1 leaf)"], ["casement2", "Casement (2 leaves)"], ["grill", "Steel grill + glass"], ["fixed", "Fixed"], ["louvre", "Louvered / ventilator"]]) + sel("Frame", "mat", e.mat || "al", [["al", "Aluminium"], ["upvc", "uPVC"], ["steel", "Steel"], ["wood", "Wood"]]) : "") + f("Mark (tag in plan)", "mark", e.mark || "", "text") + ro("Host wall", pl ? ed.fmt(pl.c.L) + " long, " + pl.w.th + " mm" : "missing"); break;
      case "slab": h += f("Thickness", "th", Lm(e.th)) + f("Top offset from level", "off", Lm(e.off || 0)) + sel("Kind", "kind", e.kind || "ceiling", [["ceiling", "Ceiling / roof slab"], ["floor", "Floor slab"], ["chajja", "Chajja / sunshade"], ["landing", "Landing"]]) + ro("Area", ed.fmtA(B.area(e.pts))); break;
      case "column": var rnd = B.colRound(e); h += sel("Shape", "shape", e.shape || "rect", B.COL_SHAPES) + f(e.shape === "circle" ? "Diameter" : rnd ? "Size across flats" : "Width (overall)", "w", Lm(e.w)) + (rnd ? "" : f("Depth (overall)", "d", Lm(e.d))) + (B.colLegs(e) ? f("Leg thickness", "tw", Lm(e.tw || 230)) : "") + f("Height (blank = level height)", "h", e.h == null ? "" : Lm(e.h)) + f("Rotation °", "rot", e.rot || 0, "num") + ro("Section area", (B.colSection(e).A / 1e6).toFixed(4) + " m²") + (B.colLegs(e) ? "<p class='muted small'>Bars for L / T / + sections are not laid out automatically — steel is taken by the thumb rule.</p>" : ""); break;
      case "beam": h += f("Width", "w", Lm(e.w)) + f("Depth (overall)", "d", Lm(e.d)) + f("Top offset from level above", "top", Lm(e.top || 0)) + ro("Span", ed.fmt(G.dist(e.a, e.b))); break;
      case "footing": h += f("Length", "L", Lm(e.L)) + f("Breadth", "B", Lm(e.B)) + f("Depth", "D", Lm(e.D)) + f("Bottom below level", "df", Lm(e.df)) + f("Rotation °", "rot", e.rot || 0, "num") + f("PCC projection", "pcc.off", Lm((e.pcc || {}).off || 150)) + f("PCC thickness", "pcc.th", Lm((e.pcc || {}).th || 100)) + f("Working space (blank = rule)", "ws", e.ws == null ? "" : Lm(e.ws)); break;
      case "roof": h += sel("Type", "kind", e.kind, [["flat", "Flat"], ["shed", "Shed (mono-pitch)"], ["gable", "Gable"], ["hip", "Hip"]]) + sel("Covering", "mat", e.mat, [["rcc", "RCC slab"], ["gi", "GI / colour-coated sheet"], ["tile", "Tiles"], ["puf", "PUF panel"]]) + f("Slope °", "slope", e.slope || 0, "num") + f("Thickness", "th", Lm(e.th)) + f("Base offset from level", "off", Lm(e.off || 0)) + (e.kind === "shed" || e.kind === "gable" ? f("Direction ° (ridge / slope)", "dir", e.dir == null ? "" : e.dir, "num") : "") + ro("Plan area", ed.fmtA(B.area(e.pts))); break;
      case "stair": h += sel("Type", "kind", e.kind, [["straight", "Straight"], ["dogleg", "Dog-legged"]]) + f("Flight width", "w", Lm(e.w)) + f("Risers", "n", e.n, "num") + f("Riser", "R", Lm(e.R)) + f("Tread", "T", Lm(e.T)) + f("Waist slab", "wt", Lm(e.wt || 150)) + f("Direction °", "dir", e.dir || 0, "num") + ro("Total rise", ed.fmt(e.n * e.R)) + ro("Check 2R + T", Math.round(2 * e.R + e.T) + " mm" + (2 * e.R + e.T < 550 || 2 * e.R + e.T > 700 ? " — outside the usual 550–700 comfort range" : " — within 550–700")); break;
      case "room": h += f("Name", "name", e.name || "", "text") + sel("Floor finish", "floor", e.floor || "", [["vitrified", "Vitrified tiles"], ["ceramic", "Ceramic tiles"], ["kota", "Kota stone"], ["granite", "Granite"], ["ips", "IPS / CC flooring"], ["", "None"]]) + f("Skirting height (mm)", "skirt", e.skirt || "", "num") + sel("False ceiling", "ceil", String(!!e.ceil), [["false", "No"], ["true", "Yes"]]) + (e.ceil ? f("False ceiling height above floor (blank = 300 below slab)", "fch", e.fch == null ? "" : Lm(e.fch), "len", { ph: Lm(B.fceilH ? B.fceilH(ed.doc, Object.assign({}, e, { fch: null })) : 0) }) : "") + ro("Area", ed.fmtA(B.area(e.pts))) + ro("Perimeter", ed.fmt(G.segsLength(G.polySegs(e.pts, true)))); break;
      case "railing": h += f("Height", "h", Lm(e.h || 1000)) + f("Base above level floor (roof top = level height)", "base", Lm(e.base || 0)); break;
    }
    h += rfFields(e, ed);
    h += lookFields(e, doc.d);
    var q = B.qty(doc, e); if (q.length) h += "<div class='cad-ph'>Quantities</div><div class='bimq'>" + q.map(function (r) { return "<div><span>" + esc(r.label) + "</span><b>" + fmtQ(r) + "</b></div>"; }).join("") + "</div>";
    return h;
  };
  var DIAS = [6, 8, 10, 12, 16, 20, 25, 28, 32];
  function diaSel(label, key, val) { return "<label class='cad-f'><span>" + label + "</span><select class='in small' data-pp='b." + key + "'>" + DIAS.map(function (d) { return "<option value='" + d + "'" + (+val === d ? " selected" : "") + ">" + d + " mm</option>"; }).join("") + "</select></label>"; }
  function nf(label, key, val) { return f(label, key, val, "num"); }
  function rfFields(e, ed) {
    if (!B.RF_TYPES[e.t]) return ""; var doc = ed.doc;
    if (!e.rf) return "<div class='cad-ph'>Reinforcement</div><p class='muted small'>Steel is a thumb rule (" + (B.ensure(doc.d).steel[e.t]) + " kg/m³) until bars are added.</p><button type='button' class='btn sec sm' data-bimrfadd='1'>Add reinforcement</button>";
    var r = e.rf, h = "<div class='cad-ph'>Reinforcement</div>" + nf("Clear cover (mm)", "rf.c", r.c);
    if (e.t === "column") h += nf("Main bars (nos)", "rf.main.n", r.main.n) + diaSel("Main bar φ", "rf.main.d", r.main.d) + diaSel("Tie φ", "rf.tie.d", r.tie.d) + nf("Tie spacing (mm)", "rf.tie.s", r.tie.s);
    if (e.t === "beam") h += nf("Bottom bars (nos)", "rf.bot.n", r.bot.n) + diaSel("Bottom bar φ", "rf.bot.d", r.bot.d) + nf("Top bars (nos)", "rf.top.n", r.top.n) + diaSel("Top bar φ", "rf.top.d", r.top.d) + diaSel("Stirrup φ", "rf.st.d", r.st.d) + nf("Stirrup spacing (mm)", "rf.st.s", r.st.s);
    if (e.t === "footing") h += diaSel("Bars along length φ", "rf.x.d", r.x.d) + nf("… spacing (mm)", "rf.x.s", r.x.s) + diaSel("Bars along breadth φ", "rf.y.d", r.y.d) + nf("… spacing (mm)", "rf.y.s", r.y.s);
    if (e.t === "slab") h += diaSel("Bars along X φ (bottom)", "rf.x.d", r.x.d) + nf("… spacing (mm)", "rf.x.s", r.x.s) + diaSel("Bars along Y φ", "rf.y.d", r.y.d) + nf("… spacing (mm)", "rf.y.s", r.y.s);
    var br = B.bars(doc, e, B.rfMarks(doc)[e.id]); if (!br) return h;
    var conc = B.qty(doc, e).filter(function (q) { return /^rcc_/.test(q.k); }).reduce(function (s, q) { return s + q.v; }, 0) / 1e9, pct = conc ? br.kg / 7850 / conc * 100 : null, chk = EP.rfCheck && pct != null ? EP.rfCheck({ rf: Object.assign(EP.rfDefaults ? EP.rfDefaults() : {}, B.rfSettings(doc.d)) }, e.t, pct) : null;
    h += "<div class='bimq'>" + br.sets.map(function (s) { return "<div><span>" + esc(s.mark + " " + s.what + ": " + s.nb + " × " + s.dia + "φ × " + (s.cut / 1000).toFixed(3) + " m") + "</span><b>" + s.kg.toFixed(1) + " kg</b></div>"; }).join("") + "<div><span><b>Total</b>" + (conc ? " · " + (br.kg / conc).toFixed(0) + " kg/m³ · " + pct.toFixed(2) + "% of concrete" : "") + "</span><b>" + br.kg.toFixed(1) + " kg</b></div></div>" + (chk ? "<p class='small' style='margin:2px 0;color:" + (chk.ok ? (chk.warn ? "var(--warn)" : "var(--ok,#2e7d32)") : "var(--danger)") + "'>" + esc(chk.msg) + " <span class='muted'>(" + esc(chk.ref) + ")</span></p>" : "") + "<p class='muted small' style='margin:2px 0'>Starting values — check against the structural design." + (e.t === "slab" ? " Slab: bottom mesh only — add top / extra bars in the estimate's BBS." : "") + "</p><button type='button' class='btn ghost sm' data-bimrfdel='1'>Remove reinforcement</button>";
    return h;
  }
  var CAT = { slab: "slab", column: "frame", beam: "frame", footing: "found", stair: "stair", railing: "rail" };
  function lookSel(label, key, val, defLook) { return "<label class='cad-f'><span>" + label + "</span><select class='in small' data-pp='b." + key + "'>" + lookOpts(val, "Default — " + B.LOOKS[defLook].n) + "</select></label>"; }
  function colF(label, key, val, shown) { return "<label class='cad-f'><span>" + label + "</span><span class='row' style='gap:4px;align-items:center'><input type='color' data-pp='b." + key + "' value='" + esc(val || shown) + "' aria-label='" + esc(label) + "'>" + (val ? "<button type='button' class='btn ghost sm' data-bimclr='" + key + "'>Default</button>" : "<span class='muted small'>default</span>") + "</span></label>"; }
  function pair(e, d, label, kL, kC, cat, defId) { var def = defId || B.catLook(d, cat).l, cur = B.lookFor(d, cat, e[kL], e[kC]); if (defId && !e[kL]) cur = B.look(defId, e[kC]); return lookSel(label, kL, e[kL] || "", def) + colF(label.replace(/ look$/, "") + " colour", kC, e[kC], B.toHex(cur)); }
  function lookFields(e, d) {
    var h = "", roofCat = e.t === "roof" ? (e.mat === "rcc" || e.kind === "flat" ? "roof_rcc" : e.mat === "tile" ? "roof_tile" : "roof_sheet") : null;
    if (e.t === "wall") { if (e.ext) h += pair(e, d, "Outer face look", "lookO", "colO", "wall_ext"); h += pair(e, d, e.ext ? "Inner face look" : "Face look", "lookI", "colI", "wall_int"); }
    else if (e.t === "door") h += pair(e, d, "Shutter look", "look", "col", "door", (B.ensure(d).looks || {}).door ? null : B.MAT_LOOK[e.mat || "flush"]) + pair(e, d, "Frame look", "lookF", "colF", "door_frame");
    else if (e.t === "window") h += pair(e, d, "Frame look", "look", "col", "win_frame", (B.ensure(d).looks || {}).win_frame ? null : B.MAT_LOOK[e.mat || "al"]);
    else if (e.t === "room") h += pair(e, d, "Floor look", "look", "col", "slab", B.FLOOR_LOOK[e.floor || ""] || "ips");
    else if (roofCat) h += pair(e, d, "Roof look", "look", "col", roofCat, roofCat !== "roof_rcc" && !(B.ensure(d).looks || {})[roofCat] ? B.MAT_LOOK[e.mat || "gi"] : null);
    else if (CAT[e.t]) h += pair(e, d, "3D look", "look", "col", CAT[e.t]);
    return h ? "<div class='cad-ph'>3D look</div>" + h : "";
  }
  function fmtQ(r) { return r.dim === "V" ? (r.v / 1e9).toFixed(3) + " m³" : r.dim === "A" ? (r.v / 1e6).toFixed(3) + " m²" : r.dim === "L" ? (r.v / 1000).toFixed(3) + " m" : r.dim === "M" ? r.v.toFixed(1) + " kg" : r.v + " nos"; }

  /* ----- 3D ----- */
  function v3host(C) { var body = C.root.querySelector(".cad-body"), h = body.querySelector(".cad-3d"); if (!h) { h = document.createElement("div"); h.className = "cad-3d"; h.innerHTML = "<div class='v3-host'><canvas class='v3-cv'></canvas></div><div class='v3-bar'>" + [["iso", "Iso"], ["top", "Top"], ["front", "Front"], ["right", "Right"], ["back", "Back"], ["left", "Left"]].map(function (v) { return "<button type='button' data-v3view='" + v[0] + "'>" + v[1] + "</button>"; }).join("") + "<button type='button' data-v3t='shadows'>Shadows</button><button type='button' data-v3t='edges'>Edges</button><button type='button' data-v3t='ortho'>Parallel</button><label>Cut <input type='range' min='0' max='100' value='100' data-v3cut='1' aria-label='Section height'></label><select data-v3style='1' aria-label='Visual style'><option value='0'>Realistic</option><option value='1'>Colours</option><option value='2'>White model</option></select><button type='button' data-v3pop='paint' title='Pick a material, then click walls, floors, roofs… to paint them'>🪣 Paint</button><button type='button' data-v3pop='sun' title='Sun position by date and time, sky'>☀ Sun</button><button type='button' data-v3pop='scenes' title='Saved views'>🎬 Scenes</button><button type='button' data-v3render='1' title='High-quality image'>📷 Render</button><button type='button' data-v3rebar='1' aria-pressed='false' title='Show reinforcement bars (concrete see-through)'>⛓ Rebar</button><select data-v3lv='1' aria-label='Levels'><option value='all'>All levels</option><option value='upto'>Up to current level</option></select><button type='button' data-v3png='1'>PNG</button></div><div class='v3-pop' hidden></div>"; body.insertBefore(h, body.querySelector(".cad-side")); } return h; }
  function build3d(ed, C) {
    if (!C.v3 || !C.v3.ok) { console.warn("build3d: v3 not ready", C.v3 ? "ok=" + C.v3.ok : "null"); return; }
    var b = bim(ed), opts = { rebar: !!C.v3rebar }; if (C.v3lv === "upto") opts.upTo = B.level(ed.doc.d, b.cur).elev;
    try {
      var sc = B.meshes(ed.doc, opts);
      console.log("build3d: groups=" + sc.groups.length + " bbox=" + JSON.stringify(sc.bbox));
      /* merge edge lines from groups into sc.lines */
      var allE = []; sc.groups.forEach(function (g) { if (g.e && g.e.length) allE.push.apply(allE, g.e); });
      if (allE.length) sc.lines = allE;
      C.v3.setScene(sc, true); C.v3cutMax = sc.bbox[5]; applyCut(C); syncSel(ed, C); applySun(ed, C);
      console.log("build3d: done, canvas=" + C.v3.cv.width + "x" + C.v3.cv.height);
    } catch (er) { console.error("build3d error:", er); }
  }
  function applySun(ed, C) { if (!C.v3 || !C.v3.ok) return; var s = B.sunNow(ed.doc.d, C.sunLive); C.v3.sunAz = s.az; C.v3.sunEl = s.el; C.v3.dirty = true; return s; }
  function hhmm(t) { var h = Math.floor(t), m = Math.round((t - h) * 60); if (m === 60) { h++; m = 0; } return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m; }
  function sunText(ed, C) { var s = B.sunNow(ed.doc.d, C.sunLive); return s.el < 0 ? "Sun below the horizon (night)" : "Sun: " + Math.round(s.trueAz != null ? s.trueAz : s.az) + "° from north, " + Math.round(s.el) + "° high"; }
  function popHtml(ed, C) {
    var d = ed.doc.d, b = bim(ed), v = C.v3;
    if (C.v3pop === "paint") {
      var pl = C.v3paint && B.LOOKS[C.v3paint];
      return "<h4>🪣 Paint materials</h4><p class='muted small' style='margin:0'>" + (pl ? "<b>" + esc(pl.n) + "</b> — now click walls, floors, slabs, roofs, columns… in the 3D view. A wall is painted on the side you are looking at." : "1. Pick a material below. 2. Click the elements in the 3D view.") + "</p>" +
        "<label class='small' style='display:flex;flex-direction:row;gap:6px;align-items:center'><input type='checkbox' style='width:auto;flex:none;margin:0' data-v3paintall='1'" + (C.v3paintAll ? " checked" : "") + "> Paint all elements of the same kind (e.g. all outer walls)</label>" +
        "<div style='max-height:46vh;min-height:90px;overflow:auto;margin:0 -6px;flex:1 1 auto'>" + matLibHtml(C.v3paint || null) + "</div>" +
        "<div class='row' style='gap:6px;justify-content:flex-end'><button type='button' class='btn ghost sm' data-v3paintclr='1' title='Click elements to give them back the building default material'>Eraser (back to default)</button><button type='button' class='btn sec sm' data-v3pop='paint'>Done</button></div><p class='muted small' style='margin:0'>Looks only — quantities and SOR items do not change. Ctrl+Z undoes a paint.</p>";
    }
    if (C.v3pop === "sun") {
      var s = Object.assign({}, B.sunCfg(d), C.sunLive || {}), today = new Date().toISOString().slice(0, 10), tb = function (k, l) { return "<button type='button' class='btn ghost sm' data-v3t='" + k + "' aria-pressed='" + String(!!v[k]) + "'>" + l + "</button>"; };
      return "<h4>Sun and sky</h4><label>Sun from<select class='in small' data-v3sm='1'><option value='time'" + (s.mode !== "manual" ? " selected" : "") + ">Date and time (real sun)</option><option value='manual'" + (s.mode === "manual" ? " selected" : "") + ">Set by hand</option></select></label>" +
        (s.mode !== "manual" ? "<label>Date<input type='date' class='in small' data-v3date='1' value='" + esc(s.date || today) + "'></label><div class='row'><button type='button' class='btn ghost sm' data-v3dq='" + today.slice(0, 4) + "-06-21'>21 June</button><button type='button' class='btn ghost sm' data-v3dq='" + today.slice(0, 4) + "-03-21'>21 March</button><button type='button' class='btn ghost sm' data-v3dq='" + today.slice(0, 4) + "-12-21'>21 December</button><button type='button' class='btn ghost sm' data-v3dq='" + today + "'>Today</button></div><label>Time <b class='v3-tt'>" + hhmm(s.t) + "</b><input type='range' min='5' max='19.5' step='0.25' value='" + s.t + "' data-v3time='1' aria-label='Time of day'></label>"
          : "<label>Direction °<input type='range' min='0' max='360' value='" + s.az + "' data-v3az='1' aria-label='Sun direction'></label><label>Height °<input type='range' min='2' max='90' value='" + s.el + "' data-v3el='1' aria-label='Sun height'></label>") +
        "<div class='muted small v3-st'>" + esc(sunText(ed, C)) + "</div><div class='row'>" + tb("sky", "Sky") + tb("fog", "Haze") + tb("shadows", "Shadows") + "</div><p class='muted small' style='margin:0'>Place and north are in the Building tab.</p>";
    }
    if (C.v3pop === "scenes") {
      var L = b.scenes || [];
      return "<h4>Scenes (saved views)</h4>" + (L.length ? L.map(function (x, i) { return "<div class='v3-sc'><button type='button' class='btn ghost sm lnk' data-v3scene='" + i + "'>" + esc(x.name) + "</button><button type='button' class='btn ghost sm' data-v3scdel='" + i + "' aria-label='Delete scene " + esc(x.name) + "'>✕</button></div>"; }).join("") : "<p class='muted small' style='margin:0'>No scenes yet. Turn the model to a good view and save it — the camera, style, cut, levels and sun are kept with the drawing.</p>") +
        "<div class='row'><input class='in small' id='v3-scname' placeholder='Name, e.g. Front entrance' style='flex:1;min-width:120px'><button type='button' class='btn pri sm' data-v3scsave='1'>Save view</button></div>";
    }
    return "";
  }
  /* paint bucket: which look fields a click on this element sets. A wall is painted on the face towards the camera (outer / inner). */
  function paintKeys(ed, C, e) {
    if (e.t === "wall") {
      if (!e.ext) return [["lookI", "colI"]];
      var c = B.wallLine(e), mid = [(c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2], all = ed.doc.d.ents.filter(function (x) { return x.t === "wall" && x.lvl === e.lvl; }), cx = 0, cy = 0;
      all.forEach(function (o) { cx += o.a[0] + o.b[0]; cy += o.a[1] + o.b[1]; }); cx /= 2 * all.length; cy /= 2 * all.length;
      var eye = C.v3.eye(), inSide = (cx - mid[0]) * c.n[0] + (cy - mid[1]) * c.n[1], camSide = (eye[0] * 1000 - mid[0]) * c.n[0] + (eye[1] * 1000 - mid[1]) * c.n[1];
      return [inSide * camSide > 0 ? ["lookI", "colI"] : ["lookO", "colO"]];
    }
    if (e.t === "door") return [["lookF", "colF"]];
    if (/^(slab|roof|column|beam|footing|stair|room|window|railing|land)$/.test(e.t)) return [["look", "col"]];
    return null;
  }
  function paintPick(ed, C, id) {
    var e = id && ed.doc.get(id); if (!e) return; var keys = paintKeys(ed, C, e); C.v3.sel = -1;
    if (!keys) { U.toast("This element takes its look from its own settings — it cannot be painted here."); return; }
    var k = keys[0], list = [e];
    if (C.v3paintAll) list = ed.doc.d.ents.filter(function (x) { if (x.t !== e.t || !ed.doc.editable(x)) return false; if (e.t === "wall") { var kx = x.id === e.id ? keys : (x.ext === e.ext ? [[k[0], k[1]]] : null); return !!kx; } if (e.t === "slab" || e.t === "roof") return x.kind === e.kind; return true; });
    ed.doc.begin(C.v3paintClr ? "Clear material" : "Paint material");
    list.forEach(function (x) { var o = CAD.clone(x); if (C.v3paintClr) delete o[k[0]]; else o[k[0]] = C.v3paint; delete o[k[1]]; ed.doc.mod(x.id, o); });
    ed.doc.commit(); if (ed.sel.size) { ed.sel.clear(); ed.emitSel(); } build3d(ed, C);
    if (list.length > 1) U.toast((C.v3paintClr ? "Default material on " : "Painted ") + list.length + " elements");
  }
  function showPop(ed, C) { var h = C.root.querySelector(".v3-pop"); if (!h) return; if (!C.v3pop) { h.hidden = true; h.innerHTML = ""; return; } h.innerHTML = popHtml(ed, C); h.hidden = false; var bar = C.root.querySelector('.v3-bar'); if (bar) { h.style.top = (bar.offsetHeight + 12) + 'px'; h.style.maxHeight = 'calc(100% - ' + (bar.offsetHeight + 20) + 'px)'; h.style.overflowY = 'auto'; } }
  function paintCursor(C) { var cv = C.v3 && C.v3.cv; if (cv) cv.style.cursor = C.v3pop === "paint" && (C.v3paint || C.v3paintClr) ? "crosshair" : ""; }
  function commitSun(ed, C, patch) { var lv = Object.assign({}, C.sunLive || {}, patch || {}); C.sunLive = null; setBim(ed, function (x) { x.sun = Object.assign({}, B.SUN0, x.sun || {}, lv); }, "Sun"); applySun(ed, C); }
  function renderDlg(ed, C) {
    var v = C.v3, sizes = [["1280x720", "1280 × 720 (HD)"], ["1920x1080", "1920 × 1080 (Full HD)"], ["2560x1440", "2560 × 1440"], ["3840x2160", "3840 × 2160 (4K)"], ["2480x1754", "A4 landscape 300 dpi (2480 × 1754)"], ["view", "Same as the 3D view"]], st = C.rnd || { size: "1920x1080", soft: true, edges: false }, img = null;
    function body() { return "<h3>Render image</h3><p class='muted small'>A high-quality still of the current 3D view: bigger shadow map, soft shadows, smoothed edges (supersampling), sky and materials. It is a real-time render — not photo-realistic ray tracing (planned for a later phase).</p><div class='row' style='gap:10px;flex-wrap:wrap;align-items:center'><label class='cad-f' style='grid-template-columns:auto 1fr'><span>Size</span><select class='in small' id='rnd-size'>" + sizes.map(function (x) { return "<option value='" + x[0] + "'" + (x[0] === st.size ? " selected" : "") + ">" + x[1] + "</option>"; }).join("") + "</select></label><label class='small'><input type='checkbox' id='rnd-soft'" + (st.soft ? " checked" : "") + "> Soft shadows</label><label class='small'><input type='checkbox' id='rnd-edges'" + (st.edges ? " checked" : "") + "> Edge lines</label><button type='button' class='btn pri sm' data-rnd='go'>Render</button></div>" + (img ? "<img class='rnd-prev' alt='Rendered image' src='" + img.url + "'><div class='row' style='gap:8px;justify-content:center'><span class='muted small'>" + img.w + " × " + img.h + " px" + (img.ss > 1 ? ", " + img.ss + "× supersampled" : "") + "</span><button type='button' class='btn sec sm' data-rnd='dl'>Download PNG</button></div>" : "") + "<div class='row' style='justify-content:flex-end;margin-top:6px'><button type='button' class='btn ghost sm' data-dlg='close'>Close</button></div>"; }
    var dlg = CAD.ui.dialog(body(), function (b) {
      if (b.dataset.rnd === "go") { st = { size: dlg.querySelector("#rnd-size").value, soft: dlg.querySelector("#rnd-soft").checked, edges: dlg.querySelector("#rnd-edges").checked }; C.rnd = st; var wh = st.size === "view" ? [Math.round(v.W * 2), Math.round(v.H * 2)] : st.size.split("x").map(Number); try { img = v.renderImage(wh[0], wh[1], { soft: st.soft, edges: st.edges }); } catch (er) { console.error(er); U.toast("Couldn't render: " + er.message); } dlg.querySelector(".cad-dlgbox").innerHTML = body(); return; }
      if (b.dataset.rnd === "dl" && img) { img.canvas.toBlob(function (bl) { CAD.ui.dl(bl, CAD.ui.fname(ed.doc.d.name) + "_render_" + img.w + "x" + img.h + ".png"); }, "image/png"); }
    });
    dlg.querySelector(".cad-dlgbox").classList.add("wide");
  }
  function applyCut(C) { if (!C.v3 || !C.v3.ok) return; var bb = C.v3.bbox || [0, 0, 0, 0, 0, 10], v = C.v3cutPct == null ? 100 : C.v3cutPct; C.v3.cut = v >= 100 ? 1e9 : bb[2] + (bb[5] - bb[2]) * v / 100; C.v3.dirty = true; }
  function syncSel(ed, C) { if (!C.v3 || !C.v3.ok || !C.v3.byIdx) return; var id = ed.sel.size === 1 ? Array.from(ed.sel)[0] : null; C.v3.sel = id ? C.v3.byIdx.indexOf(id) + 1 : -1; C.v3.dirty = true; }
  /* ----- isometric 2D ----- */
  CAD.ACTIONS.iso = function (ed, C) {
    ed.iso = !ed.iso; ed._isoZ = 0;
    var btn = C.root.querySelector("[data-cad=iso]");
    if (btn) { btn.textContent = ed.iso ? "◇ Iso: on" : "◇ Iso"; btn.classList.toggle("pri", ed.iso); btn.classList.toggle("sec", !ed.iso); }
    /* show all levels in iso mode for full building view */
    ed.dirty = true; ed.zoomExtents();
  };
  CAD.ACTIONS.v3 = function (ed, C) {
    C.v3mode = C.v3mode === "split" ? "full" : C.v3mode === "full" ? "off" : "split";
    var body = C.root.querySelector(".cad-body"); body.classList.toggle("v3split", C.v3mode === "split"); body.classList.toggle("v3full", C.v3mode === "full");
    if (C.v3mode !== "off") {
      var h = v3host(C), fresh = false; if (!C.v3 || C.v3.dead) { fresh = true; C.v3 = new B.View3D(h.querySelector(".v3-host canvas")); if (!C.v3.ok) { console.warn("View3D init failed"); U.toast("The 3D view needs WebGL 2 — it is not available in this browser / device."); return; } C.v3.onPick = function (id) { if (C.v3pop === "paint" && (C.v3paint || C.v3paintClr)) { paintPick(ed, C, id); return; } if (!id) { ed.sel.clear(); ed.emitSel(); return; } var e = ed.doc.get(id); if (!e) return; var lv = e.lvl || (B.hostOf(ed.doc, e) || {}).lvl, bb = bim(ed); if (lv && lv !== bb.cur && !bb.showAll) { setBim(ed, function (x) { x.cur = lv; }, "Level"); } ed.sel = new Set([id]); ed.emitSel(); C.panel = "props"; CAD.ui.renderPanels(); }; }
      setTimeout(function () { try { C.v3.resize(); build3d(ed, C); ed.resize(); if (fresh) C.v3.frame(); } catch (er) { console.error("3D init:", er); } }, 60);
    } else setTimeout(function () { ed.resize(); }, 30);
    var btn = C.root.querySelector("[data-cad=v3]"); if (btn) btn.textContent = { off: "🧊 3D", split: "🧊 3D: split", full: "🧊 3D: full" }[C.v3mode];
  };
  var t3 = 0;
  CAD.HOOKS.change.push(function (ed, C) { topBar(ed, C); if (C.v3 && C.v3.ok && C.v3mode && C.v3mode !== "off") { clearTimeout(t3); t3 = setTimeout(function () { build3d(ed, C); }, 350); } });
  CAD.HOOKS.wire.push(function (ed, C) {
    if (C.v3 && C.v3.destroy) { try { C.v3.lose = true; C.v3.destroy(); } catch (er) { /* the old view is gone either way */ } }
    C.v3 = null; C.v3mode = "off"; topBar(ed, C); ed._ctx = C;
    ed.on3d = function () { CAD.ACTIONS.v3(ed, C); }; ed.onQto = function () { CAD.ACTIONS.qto(ed, C); }; ed.onBbs = function () { bbsDlg(ed, C); }; ed.onRebar = function () { setTimeout(function () { CAD.ui.renderPanels(); }, 0); };
    var sel0 = ed.onSel; ed.onSel = function (s) { if (sel0) sel0(s); syncSel(ed, C); };
    var r = C.root;
    r.addEventListener("change", function (ev) {
      var t = ev.target, ds = t.dataset || {};
      if (ds.bimlv) { setBim(ed, function (x) { x.cur = t.value; }, "Level"); ed.sel.clear(); ed.emitSel(); ed.dirty = true; if (C.v3lv === "upto") build3d(ed, C); return; }
      if (ds.bimlvf) { var p = ds.bimlvf.split("|"), v = t.value.trim(); setBim(ed, function (x) { var l = x.levels.filter(function (q) { return q.id === p[0]; })[0]; if (!l) return; if (p[1] === "name") l.name = v || l.name; else { var mm = UN.parseLen(v, "m"); if (mm != null) l[p[1]] = mm; } }, "Level"); CAD.ui.renderPanels(); return; }
      if (ds.bimall) { setBim(ed, function (x) { x.showAll = t.checked; }); return; }
      if (ds.v3paintall) { C.v3paintAll = t.checked; return; }
      if (ds.bimset) { var k = ds.bimset, val = t.value; setBim(ed, function (x) { var path = k.split("."), o = x; for (var i = 0; i < path.length - 1; i++) o = o[path[i]]; var last = path[path.length - 1]; o[last] = k === "wallMat" ? val : k === "ngl" ? (UN.parseLen(val, "m") != null ? UN.parseLen(val, "m") : o[last]) : (UN.evalNum(val) != null ? UN.evalNum(val) : o[last]); }); return; }
      if (ds.bimchk) { setBim(ed, function (x) { var path = ds.bimchk.split("."); x[path[0]][path[1]] = t.checked; }); return; }
      if (ds.v3cut) { C.v3cutPct = +t.value; applyCut(C); return; }
      if (ds.v3style && C.v3) { C.v3.style = +t.value; C.v3.dirty = true; return; }
      if (ds.v3sm) { commitSun(ed, C, { mode: t.value }); showPop(ed, C); return; }
      if (ds.v3date) { commitSun(ed, C, { date: t.value }); showPop(ed, C); return; }
      if (ds.v3time) { commitSun(ed, C, { t: +t.value }); return; }
      if (ds.v3az) { commitSun(ed, C, { az: +t.value }); return; }
      if (ds.v3el) { commitSun(ed, C, { el: +t.value }); return; }
      if (ds.bimrfs) { setBim(ed, function (x) { x.rfs = Object.assign({}, x.rfs || {}); x.rfs[ds.bimrfs] = t.value; }, "Reinforcement settings"); CAD.ui.renderPanels(); return; }
      if (ds.bimlook) { setBim(ed, function (x) { x.looks = x.looks || {}; x.looks[ds.bimlook] = { l: t.value }; }, "3D material"); CAD.ui.renderPanels(); return; }
      if (ds.bimlookc) { setBim(ed, function (x) { x.looks = x.looks || {}; var cur = B.catLook(ed.doc.d, ds.bimlookc); x.looks[ds.bimlookc] = { l: cur.l, c: t.value }; }, "3D colour"); return; }
      if (ds.v3lv) { C.v3lv = t.value; build3d(ed, C); return; }
    });
    r.addEventListener("input", function (ev) {
      var t = ev.target, ds = t.dataset || {}; if (ds.v3cut) { C.v3cutPct = +t.value; applyCut(C); return; }
      if (ds.v3time || ds.v3az || ds.v3el) { C.sunLive = Object.assign({}, C.sunLive || {}, ds.v3time ? { t: +t.value } : ds.v3az ? { az: +t.value } : { el: +t.value }); applySun(ed, C); var p = C.root.querySelector(".v3-pop"); if (p) { var tt = p.querySelector(".v3-tt"), s2 = p.querySelector(".v3-st"); if (tt && ds.v3time) tt.textContent = hhmm(+t.value); if (s2) s2.textContent = sunText(ed, C); } }
    });
    r.addEventListener("click", function (ev) {
      var t = ev.target.closest("button, [data-matpick], [data-bimlookopen]"); if (!t) return; var ds = t.dataset;   // material rows and swatches are not buttons
      if (ds.bimcur) { setBim(ed, function (x) { x.cur = ds.bimcur; }, "Level"); CAD.ui.renderPanels(); return; }
      if (ds.bimadd) { setBim(ed, function (x) { var top = x.levels.slice().sort(function (a, c) { return c.elev - a.elev; })[0], id = "L" + Date.now().toString(36); x.levels.push({ id: id, name: "Level " + (x.levels.length), elev: top.elev + top.h, h: 3200 }); }, "Add level"); CAD.ui.renderPanels(); return; }
      if (ds.bimlvdel) { var keep = bim(ed).levels.filter(function (l) { return l.id !== ds.bimlvdel; }).sort(function (a, c) { return a.elev - c.elev; })[0]; ed.doc.begin("Delete level"); ed.doc.d.ents.filter(function (e) { return e.lvl === ds.bimlvdel; }).forEach(function (e) { ed.doc.mod(e.id, Object.assign(CAD.clone(e), { lvl: keep.id })); }); var bb = CAD.clone(bim(ed)); bb.levels = bb.levels.filter(function (l) { return l.id !== ds.bimlvdel; }); if (bb.cur === ds.bimlvdel) bb.cur = keep.id; ed.doc.set("bim", bb); ed.doc.commit(); CAD.ui.renderPanels(); return; }
      if (ds.v3view && C.v3) { C.v3.frame(ds.v3view); return; }
      if (ds.v3t && C.v3) { if (ds.v3t === "ortho") C.v3.cam.ortho = !C.v3.cam.ortho; else C.v3[ds.v3t] = !C.v3[ds.v3t]; t.setAttribute("aria-pressed", String(ds.v3t === "ortho" ? C.v3.cam.ortho : C.v3[ds.v3t])); C.v3.dirty = true; return; }
      if (ds.v3pop && C.v3) { C.v3pop = C.v3pop === ds.v3pop ? null : ds.v3pop; if (C.v3pop !== "paint") C.v3paintClr = false; showPop(ed, C); paintCursor(C); return; }
      if (ds.v3dq) { commitSun(ed, C, { date: ds.v3dq }); showPop(ed, C); return; }
      if (ds.v3render && C.v3) { renderDlg(ed, C); return; }
      if (ds.v3scsave && C.v3) { var nmI = C.root.querySelector("#v3-scname"), nm = (nmI && nmI.value.trim()) || "View " + ((bim(ed).scenes || []).length + 1); var scn = { id: "S" + Date.now().toString(36), name: nm.slice(0, 60), view: C.v3.getView(), cut: C.v3cutPct == null ? 100 : C.v3cutPct, lv: C.v3lv || "all", sun: Object.assign({}, B.sunCfg(ed.doc.d)) }; setBim(ed, function (x) { x.scenes = (x.scenes || []).concat([scn]); }, "Save scene"); U.toast("Scene saved: " + scn.name); showPop(ed, C); return; }
      if (ds.v3scene != null && C.v3) { var sc0 = (bim(ed).scenes || [])[+ds.v3scene]; if (!sc0) return; C.v3.setView(sc0.view); C.v3cutPct = sc0.cut; var cr = C.root.querySelector("[data-v3cut]"); if (cr) cr.value = sc0.cut; var ls = C.root.querySelector("[data-v3lv]"); if (ls) ls.value = sc0.lv || "all"; var sty = C.root.querySelector("[data-v3style]"); if (sty) sty.value = String(C.v3.style); if ((sc0.lv || "all") !== (C.v3lv || "all")) { C.v3lv = sc0.lv; build3d(ed, C); } applyCut(C); if (sc0.sun) { var sn = sc0.sun; setBim(ed, function (x) { x.sun = Object.assign({}, x.sun || {}, { mode: sn.mode, date: sn.date, t: sn.t, az: sn.az, el: sn.el }); }, "Scene"); } applySun(ed, C); C.root.querySelectorAll("[data-v3t]").forEach(function (bt) { var k = bt.dataset.v3t; bt.setAttribute("aria-pressed", String(k === "ortho" ? C.v3.cam.ortho : !!C.v3[k])); }); return; }
      if (ds.v3scdel != null) { var i0 = +ds.v3scdel; setBim(ed, function (x) { x.scenes = (x.scenes || []).filter(function (_, j) { return j !== i0; }); }, "Delete scene"); showPop(ed, C); return; }
      if (ds.v3rebar && C.v3) { C.v3rebar = !C.v3rebar; C.v3.showGround = !C.v3rebar; t.setAttribute("aria-pressed", String(C.v3rebar)); if (C.v3rebar && !ed.doc.d.ents.some(B.hasRf)) U.toast("No bars in the model yet — use Rebar in the ribbon (Building group)"); build3d(ed, C); return; }
      if (ds.bimrfadd || ds.bimrfdel || ds.bimrfall) { var ids = ds.bimrfall ? ed.doc.d.ents.filter(function (x) { return B.RF_TYPES[x.t] && !x.rf; }).map(function (x) { return x.id; }) : Array.from(ed.sel); ed.doc.begin(ds.bimrfdel ? "Remove reinforcement" : "Add reinforcement"); ids.forEach(function (id) { var e = ed.doc.get(id); if (!e || !B.RF_TYPES[e.t]) return; var o = CAD.clone(e); if (ds.bimrfdel) delete o.rf; else o.rf = B.rfDefault(ed.doc, e); ed.doc.mod(id, o); }); ed.doc.commit(); if (ds.bimrfall) U.toast(ids.length ? "Bars added to " + ids.length + " element(s) — check them in Properties" : "Nothing to add — every column, beam, footing and slab already has bars"); CAD.ui.renderPanels(); return; }
      if (ds.bimbbs) { bbsDlg(ed, C); return; }
      if (ds.bimlookreset) { setBim(ed, function (x) { x.looks = {}; }, "3D materials"); CAD.ui.renderPanels(); return; }
      if (ds.bimlookopen) { showMatLib(ed, C, ds.bimlookopen, t); return; }
      if (ds.matpick && C.v3pop === "paint" && t.closest && t.closest(".v3-pop")) { C.v3paint = ds.matpick; C.v3paintClr = false; showPop(ed, C); paintCursor(C); return; }
      if (ds.v3paintclr) { C.v3paintClr = !C.v3paintClr; if (C.v3paintClr) C.v3paint = null; showPop(ed, C); paintCursor(C); U.toast(C.v3paintClr ? "Eraser: click elements to give them the default material" : "Eraser off"); return; }
      if (ds.matpick) { applyMatPick(ed, C, ds.matpick); return; }
      if (ds.finadd || ds.findel) {
        var kEl = C.root.querySelector("[data-finkind]"), fEl = C.root.querySelector("[data-finface]"), kd = kEl ? kEl.value : "tile", fv = fEl ? fEl.value : "0";
        ed.doc.begin(ds.findel ? "Remove wall finish" : "Add wall finish");
        Array.from(ed.sel).forEach(function (id) { var w = ed.doc.get(id); if (!w || w.t !== "wall") return; var o = CAD.clone(w); o.fin = Object.assign({}, o.fin || {}); if (ds.findel) delete o.fin[ds.findel]; else { var nf = B.finNew(o, kd, fv === "both" ? "both" : +fv); o.fin[nf.id] = nf.f; } ed.doc.mod(id, o); });
        ed.doc.commit(); CAD.ui.renderPanels(); return;
      }
      if (ds.bimclr) { CAD.ui.applyProp("b." + ds.bimclr, ""); return; }
      if (ds.bimgeo) { if (!navigator.geolocation) { U.toast("Location is not available in this browser"); return; } navigator.geolocation.getCurrentPosition(function (p) { setBim(ed, function (x) { x.sun = Object.assign({}, B.SUN0, x.sun || {}, { lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5) }); }, "Site location"); CAD.ui.renderPanels(); applySun(ed, C); U.toast("Site location set"); }, function () { U.toast("Couldn't get the location — type latitude and longitude"); }, { enableHighAccuracy: false, timeout: 15000 }); return; }
      if (ds.v3png && C.v3) { fetch(C.v3.png()).then(function (r) { return r.blob(); }).then(function (bl) { CAD.ui.dl(bl, CAD.ui.fname(ed.doc.d.name) + "_3D.png"); }); return; }
    });
  });

  /* ----- bar bending schedule of the model ----- */
  function bbsDlg(ed, C) {
    var rows = B.bbsSchedule(ed.doc), byD = {}, tot = 0, zone = { below: 0, above: 0 }, rs = B.rfSettings(ed.doc.d);
    rows.forEach(function (r) { byD[r.dia] = (byD[r.dia] || 0) + r.kg; tot += r.kg; zone[r.zone] += r.kg; });
    var h = "<h3>Bar bending schedule — " + esc(ed.doc.d.name) + "</h3><p class='muted small'>From the bars modelled in columns, beams, footings and slabs (" + esc(rs.grade) + ", " + esc(rs.conc) + ", lap " + B.lapD(ed.doc.d) + "d). Cut lengths follow IS 2502 / SP 34 (90° bend 2d, stirrup hooks max(10d, 75 mm)). The same bars are drawn in 3D (⛓ Rebar) and go to the estimate as BBS rows with <i>Σ Quantities → Send / update estimate</i>.</p>";
    if (!rows.length) h += "<div class='empty'>No bars yet. Use <b>Rebar</b> in the Building ribbon (all elements, or select some first).</div>";
    else {
      h += "<div class='tw' style='max-height:48vh;overflow:auto'><table class='t bbs-t'><thead><tr><th>Member</th><th>Mark</th><th>Bars</th><th class='num'>φ mm</th><th>Shape</th><th class='num'>Nos</th><th class='num'>Cut length m</th><th class='num'>Total m</th><th class='num'>kg</th><th>How the cut length is found</th></tr></thead><tbody>" + rows.map(function (r) { return "<tr><td>" + esc(r.member) + "</td><td>" + esc(r.mark) + "</td><td>" + esc(r.what) + "</td><td class='num'>" + r.dia + "</td><td>" + (r.sh === "sr" ? "Stirrup / tie" : "Bar") + "</td><td class='num'>" + r.nb + "</td><td class='num'>" + (r.cut / 1000).toFixed(3) + "</td><td class='num'>" + r.total.toFixed(2) + "</td><td class='num'>" + r.kg.toFixed(1) + "</td><td class='small muted' style='min-width:240px'>" + esc(r.f) + "</td></tr>"; }).join("") + "</tbody></table></div>";
      h += "<div class='row' style='gap:14px;flex-wrap:wrap;margin:6px 0'>" + Object.keys(byD).sort(function (a, b) { return a - b; }).map(function (d) { return "<span><span class='lk-sw' style='background:" + B.toHex(B.RF_COL[d] || [0.5, 0.5, 0.5]) + "'></span>" + d + " mm: <b>" + byD[d].toFixed(1) + " kg</b></span>"; }).join("") + "<span>Up to plinth: <b>" + zone.below.toFixed(1) + " kg</b></span><span>Above plinth: <b>" + zone.above.toFixed(1) + " kg</b></span><span class='bbs-tot'>Total: <b>" + tot.toFixed(1) + " kg</b> (" + (tot / 1000).toFixed(3) + " t)</span></div>";
    }
    h += "<div class='row' style='gap:8px;justify-content:flex-end'>" + (rows.length ? "<button type='button' class='btn sec sm' data-bbscsv='1'>Download CSV</button>" : "") + "<button type='button' class='btn ghost sm' data-dlg='close'>Close</button></div>";
    var dlg = CAD.ui.dialog(h, function (b) {
      if (b.dataset.bbscsv) {
        var out = [["Member", "Mark", "Bars", "Dia mm", "Shape", "Nos", "Cut length m", "Total m", "Weight kg", "Zone", "How"]];
        rows.forEach(function (r) { out.push([r.member, r.mark, r.what, r.dia, r.sh === "sr" ? "Stirrup / tie" : "Bar", r.nb, (r.cut / 1000).toFixed(3), r.total.toFixed(3), r.kg.toFixed(2), r.zone === "below" ? "Up to plinth" : "Above plinth", r.f]); });
        out.push(["Total", "", "", "", "", "", "", "", tot.toFixed(2), "", ""]);
        var csv = out.map(function (r) { return r.map(function (c) { c = String(c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(","); }).join("\n");
        CAD.ui.dl(new Blob([csv], { type: "text/csv" }), CAD.ui.fname(ed.doc.d.name) + "_BBS.csv");
      }
    });
    dlg.querySelector(".cad-dlgbox").classList.add("wide");
  }
  /* ----- quantities & estimate ----- */
  CAD.ACTIONS.qto = function (ed, C) {
    var mine = (S.est.mine || []).filter(function (e) { return e && e.doc; }), estId = C.qEst && mine.some(function (e) { return e.id === C.qEst; }) ? C.qEst : (S.est.cur && S.est.owner === S.me.id ? S.est.cur.id : (mine[0] && mine[0].id)), sched = B.schedule(ed.doc), search = {};
    function est() { return mine.filter(function (e) { return e.id === estId; })[0]; }
    function body() {
      var E = est(), cmp = E ? B.compare(sched, E, C.cur.id) : [], tot = 0;
      var h = "<h3>Quantities from the building model</h3><p class='muted small'>Measured from walls, openings, slabs, columns, beams, footings, roofs, stairs and rooms with the rules in the Building panel (IS 1200 style deductions). Reinforcement uses thumb-rule kg/m³ until a BBS is attached. Check the suggested SOR items — change any of them — then send to an estimate.</p><div id='q-pv' hidden style='position:relative;height:240px;border:1px solid var(--line);border-radius:6px;overflow:hidden;margin-bottom:6px'></div>";
      if (!sched.length) return h + "<div class='empty'>No building elements yet. Draw walls, openings, slabs… with the Building (BIM) tools.</div><div class='row' style='justify-content:flex-end'><button type='button' class='btn ghost sm' data-dlg='close'>Close</button></div>";
      h += "<div class='tw' style='max-height:52vh;overflow:auto'><table class='t qto'><thead><tr><th></th><th>Work</th><th>Zone</th><th class='num'>Model qty</th><th>SOR item</th><th class='num'>Qty</th><th class='num'>Rate ₹</th><th class='num'>Amount ₹</th>" + (E ? "<th class='num'>In estimate</th>" : "") + "</tr></thead><tbody>";
      sched.forEach(function (x, i) {
        var rate = x.item ? (EP.anRate(x.sor.b, x.sor.c) || x.item.sor) : null, amt = rate != null && x.qty != null ? rate * x.qty : null; if (amt && x.include !== false) tot += amt;
        var c = cmp[i] || {}, diff = c.est != null && x.qty != null && Math.abs(c.est - x.qty) > 1e-3 * Math.max(1, Math.abs(x.qty));
        h += "<tr" + (x.include === false ? " class='off'" : "") + "><td><input type='checkbox' data-qinc='" + i + "'" + (x.include === false ? "" : " checked") + " aria-label='Include'></td><td>" + esc(x.label) + "<div class='muted small'>" + x.rows.length + " element row" + (x.rows.length > 1 ? "s" : "") + " <button type='button' class='btn ghost sm' data-qprev='" + i + "' title='Show these elements in 3D'>👁 3D</button></div></td><td>" + (x.zone === "plinth" ? "Up to plinth" : x.zone === "road" ? "Road / culvert" : "Above plinth") + "</td><td class='num'>" + UN.trimNum(x.base, 3) + " " + x.baseU + "</td>" +
          "<td style='min-width:260px'>" + (x.item ? "<b>" + esc((EP.BOOKS[x.sor.b] || {}).short || x.sor.b) + " " + esc(x.sor.c) + "</b>" + (x.sor.guess ? " <span class='badge warn'>found by text — check</span>" : x.sor.user ? " <span class='badge ok'>your choice</span>" : "") + "<div class='small muted' title='" + esc(x.item.desc) + "'>" + esc(x.item.desc.slice(0, 110)) + "…</div>" : "<span class='muted'>No item suggested</span>") + (x.err ? "<div class='small' style='color:var(--danger)'>" + esc(x.err) + "</div>" : "") +
          "<div class='row' style='gap:4px;margin-top:3px'><input class='in small' data-qsrch='" + i + "' placeholder='Change: code or words…' value='" + esc(search[i] || "") + "' style='min-width:150px'></div>" + (search[i] ? "<div class='qpick'>" + findItems(search[i], x.dim).map(function (it) { return "<button type='button' data-qpick='" + i + "|" + it.b + "|" + esc(it.code) + "'>" + esc(((EP.BOOKS[it.b] || {}).short || it.b) + " " + it.code + " [" + it.unit + "] " + it.desc.slice(0, 80)) + "</button>"; }).join("") + "</div>" : "") + "</td>" +
          "<td class='num'>" + (x.qty != null ? UN.trimNum(x.qty, 3) + " " + esc(x.unit) : "—") + "</td><td class='num'>" + (rate != null ? U.inr(rate) : "—") + "</td><td class='num'>" + (amt != null ? U.inr(amt) : "—") + "</td>" + (E ? "<td class='num'" + (diff ? " style='color:var(--warn);font-weight:600' title='The model changed after it was sent'" : "") + ">" + (c.est != null ? UN.trimNum(c.est, 3) + (diff ? " ⚠" : " ✓") : "—") + "</td>" : "") + "</tr>";
      });
      h += "</tbody><tfoot><tr><td></td><td colspan='6'>Total of the rows with an item</td><td class='num'>₹" + U.inr(tot) + "</td>" + (E ? "<td></td>" : "") + "</tr></tfoot></table></div>";
      h += "<div class='row' style='gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:6px'>" + (mine.length ? "<label class='cad-f' style='grid-template-columns:auto 1fr'><span>Estimate</span><select class='in small' id='q-est'>" + mine.map(function (e) { return "<option value='" + esc(e.id) + "'" + (e.id === estId ? " selected" : "") + ">" + esc(e.name) + "</option>"; }).join("") + "</select></label><label class='cad-f' style='grid-template-columns:auto 1fr'><span>Part</span><select class='in small' id='q-part'>" + (est() ? est().doc.parts.map(function (p) { return "<option value='" + esc(p.id) + "'>" + esc(p.name) + "</option>"; }).join("") : "") + "</select></label><button type='button' class='btn pri sm' data-qsend='1'>Send / update estimate</button>" : "<span class='muted'>Make an estimate first to send these quantities.</span>") +
        "<button type='button' class='btn sec sm' data-qcsv='1'>Download CSV</button><span class='grow'></span><button type='button' class='btn ghost sm' data-dlg='close'>Close</button></div>";
      return h;
    }
    function findItems(q, dim) {
      q = q.trim().toLowerCase(); if (q.length < 2) return []; var out = [], words = q.split(/\s+/);
      ["cpwd23", "cpwd", "mp25", "mp", "hort", "em22"].forEach(function (b) { var Bk = EP.BOOKS[b]; if (!Bk) return; Bk.list.forEach(function (it) { if (out.length >= 10) return; var u = UN.fromSor(it.unit), okDim = u && (UN.get(u).dim === dim || (dim === "M" && UN.get(u).dim === "M")); if (!okDim) return; var txt = (it.code + " " + it.desc).toLowerCase(); if (it.code.toLowerCase() === q || words.every(function (w) { return txt.indexOf(w) >= 0; })) out.push(Object.assign({ b: b }, it)); }); });
      return out;
    }
    var dlg = CAD.ui.dialog(body(), async function (b) {
      var ds = b.dataset;
      if (ds.qprev != null) { var xp = sched[+ds.qprev], host = dlg.querySelector("#q-pv"); if (!xp || !host) return; host.hidden = false; host.innerHTML = ""; var pv = new B.View3D(host, { lose: true }); if (pv.dead) return; pv.setScene(B.meshes(ed.doc, { only: new Set(xp.rows.map(function (r) { return r.id; })), allLevels: true })); pv.frame("iso"); var cap = document.createElement("div"); cap.className = "small"; cap.style.cssText = "position:absolute;left:8px;bottom:6px;background:rgba(255,255,255,.85);padding:2px 6px;border-radius:4px;color:#123"; cap.textContent = xp.label + " — " + xp.rows.length + " element(s)"; host.appendChild(cap); host.scrollIntoView({ block: "nearest" }); return; }
      if (ds.qpick) { var p = ds.qpick.split("|"), x = sched[+p[0]]; setBim(ed, function (bb) { bb.map[x.key + "|" + x.zone] = { b: p[1], c: p[2] }; }, "SOR item"); delete search[+p[0]]; sched = B.schedule(ed.doc); dlg.querySelector(".cad-dlgbox").innerHTML = body(); return; }
      if (ds.qcsv) { var rows = [["Work", "Zone", "Model qty", "Model unit", "Book", "Code", "SOR description", "Qty", "Unit", "Rate", "Amount"]]; sched.forEach(function (x) { var rate = x.item ? (EP.anRate(x.sor.b, x.sor.c) || x.item.sor) : ""; rows.push([x.label, x.zone, x.base.toFixed(3), x.baseU, x.sor ? x.sor.b : "", x.sor ? x.sor.c : "", x.item ? x.item.desc : "", x.qty != null ? x.qty.toFixed(3) : "", x.unit || "", rate, rate && x.qty != null ? (rate * x.qty).toFixed(2) : ""]); }); CAD.ui.dl(new Blob([rows.map(function (r) { return r.map(function (c) { c = String(c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(","); }).join("\n")], { type: "text/csv" }), CAD.ui.fname(ed.doc.d.name) + "_quantities.csv"); return; }
      if (ds.qsend) {
        var E = est(); if (!E) return; var part = dlg.querySelector("#q-part").value, r = B.sendToEstimate(ed.doc, sched, E, part, { drawingId: C.cur.id });
        var up = await U.db().from("estimates").update({ data: E.doc }).eq("id", E.id); if (up.error) { if (U.off && U.off.isNet(up.error)) await U.off.queue(E); else { U.fail(up, "Couldn't update the estimate."); return; } }
        C.qEst = E.id; U.toast(r.rows + " measurement rows in " + E.name + (r.items ? " (" + r.items + " new items)" : "") + " — earlier rows from this model were replaced"); if (U.logAct) U.logAct("bim_qto", E.name + " · " + r.rows + " rows");
        if (S.est.cur && S.est.cur.id === E.id) U.render(); dlg.querySelector(".cad-dlgbox").innerHTML = body(); return;
      }
    });
    dlg.addEventListener("change", function (ev) { var t = ev.target; if (t.id === "q-est") { estId = t.value; dlg.querySelector(".cad-dlgbox").innerHTML = body(); } if (t.dataset.qinc != null) { sched[+t.dataset.qinc].include = t.checked; dlg.querySelector(".cad-dlgbox").innerHTML = body(); } });
    var st = 0; dlg.addEventListener("input", function (ev) { var t = ev.target; if (t.dataset.qsrch != null) { search[+t.dataset.qsrch] = t.value; clearTimeout(st); st = setTimeout(function () { var pos = t.selectionStart, i = t.dataset.qsrch; dlg.querySelector(".cad-dlgbox").innerHTML = body(); var n = dlg.querySelector("[data-qsrch='" + i + "']"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 250); } });
    dlg.querySelector(".cad-dlgbox").classList.add("wide");
  };
})();
