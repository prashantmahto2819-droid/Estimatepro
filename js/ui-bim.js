/* Estimate Pro — BIM inside CAD Studio: building ribbon, levels panel, element properties, 3D view (split / full),
   quantity schedule with SOR mapping and "send / update estimate". */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc, CAD = EP.cad, B = EP.bim, G = EP.geom, UN = EP.units;
  CAD.RIBBON.splice(1, 0, ["Building (BIM)", [["WALL", "Wall"], ["DOOR", "Door"], ["WINDOW", "Window"], ["OPENING", "Opening"], ["COLUMN", "Column"], ["BEAM", "Beam"], ["SLAB", "Slab"], ["FOOTING", "Footing"], ["ROOF", "Roof"], ["STAIR", "Stair"], ["ROOM", "Room"], ["RAILING", "Railing"], ["PARAPET", "Parapet"], ["WALLFINISH", "Wall finish / dado"], ["FLOORCOPY", "Copy floor"], ["DIMWALLS", "Auto dimension"], ["REBAR", "Rebar"], ["BBS", "BBS"]]]);
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
    ["mypic", "My pictures", /^tex_/],
    ["paint", "Paints, Putty & Wall coverings", /^paint_|^plaster$|^plaster_|^wallpaper_|^gypsum|^concrete_micro$/],
    ["masonry", "Masonry & Sandstone", /^brick$|^block$|^stone$|^concrete$|^sandstone_/],
    ["stone", "Granite, Marble & Tops", /^granite|^marble|^onyx|^quartz|^corian|^terrazzo$|^kota$|^stone_(kota|jaisalmer|tandur)/],
    ["tile", "Tiles & Flooring", /^tile_|^ips$|^wood_floor/],
    ["wood", "Wood & Laminate", /^wood|^laminate_/],
    ["metal", "Metal & Sheet", /^sheet_|^aluminium|^steel|^chrome$|^brass|^copper$|^wrought_iron$|^corten$|^gold_leaf$|^cast_iron|^ms_powder_/],
    ["roof", "Roofing", /^rooftile$/],
    ["glass", "Glass", /^glass/],
    ["panel", "Panels & Cladding", /^acp_|^hpl_|^wpc_|^stone_cladding|^panel_|^veneer_/],
    ["paving", "Paving & Ground", /^paver|^asphalt$|^grass$|^soil$/],
    ["plastic", "Plastic", /^upvc$/],
    ["fabric", "Furniture & Fabric", /^fabric_|^laminate_|^porcelain$|^leather_|^acrylic_/],
    ["light", "Lights", /^led_|^lamp$/]
  ];
  function matCatOf(id) { for (var i = 0; i < MAT_CATS.length; i++) if (MAT_CATS[i][2].test(id)) return MAT_CATS[i]; return null; }
  /* search box over the material grid: hide what does not match (name or id), and the groups left empty */
  var MAT_COLS = [["", "All", "#fff"], ["white", "White", "#ffffff"], ["cream", "Cream", "#f1e6c8"], ["grey", "Grey", "#9a9da0"], ["black", "Black", "#22262a"], ["brown", "Brown", "#7b5233"], ["red", "Red", "#c0392b"], ["orange", "Orange", "#e08a2c"], ["yellow", "Yellow", "#e8c92f"], ["green", "Green", "#4f9a4b"], ["blue", "Blue", "#3f7fc4"], ["purple", "Purple", "#7d57b0"], ["pink", "Pink", "#d877a6"]];
  /* colour family of a #rrggbb look colour */
  function colFam(hex) { var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(String(hex || "")); if (!m) return ""; var r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn, sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), h = 0;
    if (d > 0) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; }
    if (sat < 0.12 || d < 0.05) return l > 0.86 ? "white" : l < 0.22 ? "black" : "grey";
    if (l > 0.8 && sat < 0.7 && h >= 20 && h <= 75) return "cream";
    if (h < 15 || h >= 345) return l < 0.3 && sat < 0.5 ? "brown" : "red"; if (h < 45) return l < 0.5 ? "brown" : "orange"; if (h < 70) return l < 0.38 ? "brown" : "yellow"; if (h < 165) return "green"; if (h < 260) return "blue"; if (h < 300) return "purple"; return "pink"; }
  function matFilter(C) { var q = String(C.matQ || "").trim().toLowerCase().split(/\s+/).filter(Boolean), lib = C.root.querySelector(".v3-pop .mat-lib"), fam = C.matCol || ""; if (!lib) return;
    lib.querySelectorAll("[data-matpick]").forEach(function (b) { var k = b.dataset.matpick, L = B.LOOKS[k], txt = (k + " " + (L ? L.n : "")).toLowerCase(); b.hidden = !q.every(function (w) { return txt.indexOf(w) >= 0; }) || !!(fam && L && colFam(L.c) !== fam); });
    C.root.querySelectorAll(".v3-pop [data-matcol]").forEach(function (b) { b.setAttribute("aria-pressed", String((b.dataset.matcol || "") === fam)); b.style.outline = (b.dataset.matcol || "") === fam ? "2px solid #0f3f62" : "none"; });
    lib.querySelectorAll(".mat-cat").forEach(function (c) { c.hidden = !c.querySelector("[data-matpick]:not([hidden])"); }); }
  function matFavs() { try { var a = JSON.parse(localStorage.getItem("ep_matfav") || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function matFavToggle(k) { var a = matFavs(), i = a.indexOf(k); if (i >= 0) a.splice(i, 1); else a.unshift(k); try { localStorage.setItem("ep_matfav", JSON.stringify(a.slice(0, 40))); } catch (e) {} return i < 0; }
  function matLibHtml(selectedId, forCat) {
    var h = "<div class='mat-lib'>";
    var grouped = {};
    Object.keys(B.LOOKS).forEach(function (k) {
      var cat = matCatOf(k); var cname = cat ? cat[1] : "Other";
      if (!grouped[cname]) grouped[cname] = [];
      grouped[cname].push(k);
    });
    var favs = matFavs().filter(function (k) { return B.LOOKS[k]; }); if (favs.length) grouped["★ Favourites"] = favs;
    var order = ["★ Favourites"].concat(MAT_CATS.map(function (c) { return c[1]; })).concat(["Other"]);
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
      case "door": case "window": case "opening": var pl = B.place(doc, e); h += (e.t === "door" ? sel("Type", "preset", e.preset, B.DOORS.map(function (x) { return [x.id, x.name]; }).concat([[e.preset, e.preset]])) : e.t === "window" ? sel("Type", "preset", e.preset, B.WINDOWS.map(function (x) { return [x.id, x.name]; }).concat([[e.preset, e.preset]])) : "") + f("Width", "w", Lm(e.w)) + f("Height", "h", Lm(e.h)) + sel("Head (top) shape", "head", e.head || "", [["", "Flat (square)"], ["arch", "Round arch (semi-circle)"], ["seg", "Flat arch (segmental)"], ["point", "Pointed arch (rise = 0.87 × width)"], ["horse", "Horseshoe arch (clear width between the piers = 0.87 × width)"]]) + (e.t !== "door" ? f("Sill height", "sill", Lm(e.sill || 0)) : "") + f("Position along wall (centre)", "at", Lm(e.at)) + (e.t === "door" ? sel("Opens", "flip", String(!!e.flip), [["false", "to the left side of the wall"], ["true", "to the right side"]]) + sel("Hinge", "swing", e.swing || "l", [["l", "At wall start side"], ["r", "At wall end side"]]) + sel("Architrave round the frame", "casing", String(e.casing || ""), [["", "None"], ["50", "50 mm"], ["75", "75 mm"], ["100", "100 mm"]]) + sel("Shown in 3D", "open", String(e.open || ""), [["", "Shut"], ["45", "Half open"], ["90", "Open (light passes at night)"]]) + sel("Leaves", "kind", e.kind || "single", [["single", "Single"], ["double", "Double"], ["sliding", "Sliding"], ["shutter", "Rolling shutter"]]) + sel("Style", "style", e.style || "", [["", "Plain flush"], ["groove", "Flush with horizontal grooves"], ["vgroove", "Flush with vertical grooves"], ["panel", "Raised panels (2)"], ["panel6", "Raised panels (6)"], ["carved", "Main door — raised centre and top light"], ["vision", "Flush with glass strip"], ["halfglass", "Half glass"], ["glass", "Glazed (glass panes)"], ["louvre", "Louvred"], ["jali", "Jali / lattice"], ["grill", "Steel grill"]]) + sel("Handle", "handle", e.handle || "", [["", "Lever — steel"], ["black", "Lever — black"], ["gold", "Lever — gold"], ["pull", "Long pull bar"], ["none", "None"]]) + sel("Shutter", "mat", e.mat || "flush", [["flush", "Flush"], ["wood", "Wood panel"], ["pvc", "PVC / WPC"], ["steel", "Steel"], ["al", "Aluminium + glass"]]) : e.t === "window" ? sel("Kind", "kind", e.kind || "sliding", [["sliding", "Sliding"], ["casement", "Casement (1 leaf)"], ["casement2", "Casement (2 leaves)"], ["grill", "Steel grill + glass"], ["fixed", "Fixed"], ["louvre", "Louvered / ventilator"]]) + sel("Safety grill", "grill", e.grill || (e.kind === "grill" ? "v" : ""), [["", "None"], ["v", "Upright bars"], ["h", "Level bars"], ["sq", "Square grid"], ["box", "Oblong grid"], ["dia", "Diamond grid"], ["ring", "Bars with a band of rings"]]) + sel("Frame", "mat", e.mat || "al", [["al", "Aluminium"], ["upvc", "uPVC"], ["steel", "Steel"], ["wood", "Wood"]]) : "") + f("Mark (tag in plan)", "mark", e.mark || "", "text") + ro("Host wall", pl ? ed.fmt(pl.c.L) + " long, " + pl.w.th + " mm" : "missing"); break;
      case "slab": h += f("Thickness", "th", Lm(e.th)) + f("Top offset from level", "off", Lm(e.off || 0)) + sel("Kind", "kind", e.kind || "ceiling", [["ceiling", "Ceiling / roof slab"], ["floor", "Floor slab"], ["chajja", "Chajja / sunshade"], ["landing", "Landing"]]) + ro("Area", ed.fmtA(B.area(e.pts))); break;
      case "column": var rnd = B.colRound(e); h += sel("Shape", "shape", e.shape || "rect", B.COL_SHAPES) + f(e.shape === "circle" ? "Diameter" : rnd ? "Size across flats" : "Width (overall)", "w", Lm(e.w)) + (rnd ? "" : f("Depth (overall)", "d", Lm(e.d))) + (B.colLegs(e) ? f("Leg thickness", "tw", Lm(e.tw || 230)) : "") + f("Height (blank = level height)", "h", e.h == null ? "" : Lm(e.h)) + f("Rotation °", "rot", e.rot || 0, "num") + ro("Section area", (B.colSection(e).A / 1e6).toFixed(4) + " m²") + (B.colLegs(e) ? "<p class='muted small'>Bars for L / T / + sections are not laid out automatically — steel is taken by the thumb rule.</p>" : ""); break;
      case "beam": h += f("Width", "w", Lm(e.w)) + f("Depth (overall)", "d", Lm(e.d)) + f("Top offset from level above", "top", Lm(e.top || 0)) + ro("Span", ed.fmt(G.dist(e.a, e.b))); break;
      case "footing": h += f("Length", "L", Lm(e.L)) + f("Breadth", "B", Lm(e.B)) + f("Depth", "D", Lm(e.D)) + f("Bottom below level", "df", Lm(e.df)) + f("Rotation °", "rot", e.rot || 0, "num") + f("PCC projection", "pcc.off", Lm((e.pcc || {}).off || 150)) + f("PCC thickness", "pcc.th", Lm((e.pcc || {}).th || 100)) + f("Working space (blank = rule)", "ws", e.ws == null ? "" : Lm(e.ws)); break;
      case "roof": h += sel("Type", "kind", e.kind, [["flat", "Flat"], ["shed", "Shed (mono-pitch)"], ["gable", "Gable"], ["hip", "Hip"]]) + sel("Covering", "mat", e.mat, [["rcc", "RCC slab"], ["gi", "GI / colour-coated sheet"], ["tile", "Tiles"], ["puf", "PUF panel"]]) + f("Slope °", "slope", e.slope || 0, "num") + f("Thickness", "th", Lm(e.th)) + f("Base offset from level", "off", Lm(e.off || 0)) + (e.kind === "shed" || e.kind === "gable" ? f("Direction ° (ridge / slope)", "dir", e.dir == null ? "" : e.dir, "num") : "") + ro("Plan area", ed.fmtA(B.area(e.pts))); break;
      case "stair": h += sel("Type", "kind", e.kind, [["straight", "Straight"], ["dogleg", "Dog-legged"], ["lshape", "L-shaped (quarter landing)"], ["ushape", "U-shaped (three flights, two landings)"], ["spiral", "Spiral (round a centre post)"]]) + f("Flight width", "w", Lm(e.w)) + f("Risers", "n", e.n, "num") + f("Riser", "R", Lm(e.R)) + f("Tread", "T", Lm(e.T)) + f("Waist slab", "wt", Lm(e.wt || 150)) + (e.kind === "spiral" ? sel("Made of", "mat", e.mat || "", [["", "RCC (precast / cast treads)"], ["steel", "Steel (plate treads on a pipe post)"]]) + f("Angle of one tread ° (15–45; 30 = twelve to a turn)", "sa", e.sa || 30, "num") + (function () { var sT = B.spiralTurn(e); return sT == null ? "" : ro("Height between turns", Math.round(sT) + " mm" + (sT < 2000 ? " — ⚠ under 2000 mm; make the angle smaller" : " — fine")); })() : "") + (e.kind === "lshape" || e.kind === "dogleg" ? sel("The turn is made on", "winder", String(e.winder || ""), [["", e.kind === "dogleg" ? "A half landing" : "A square landing"], ["3", e.kind === "dogleg" ? "Six winders (shorter stair)" : "Three winders (shorter stair)"]]) : "") + (e.kind === "dogleg" ? f("Landing length", "land", Lm(e.land || e.w)) + f("Gap between the flights", "gap", Lm(e.gap || 100)) : "") + f("Direction °", "dir", e.dir || 0, "num") + sel("Railing", "rail", e.rail || "", [["", "None"], ["in", "On the well (open) side"], ["out", "On the outer side"], ["both", "On both sides"]]) + (e.rail ? f("Railing height", "railH", Lm(e.railH || 900)) : "") + (function () { try { var Hd = B.stairHead(doc, e); return ro("Headroom", Hd.min == null ? "open above (no slab over the treads)" : Math.round(Hd.min) + " mm least" + (Hd.low ? " — ⚠ " + Hd.low + " tread(s) have less than 2100 mm; cut the opening (Stair opening)" : " — fine (2100 mm or more)")); } catch (er) { return ""; } })() + sel("Flights lie", "side", String(+e.side === -1 ? -1 : 1), [["1", "to the left of the going"], ["-1", "to the right of the going"]]) + (function () { try { var Cc = B.stairClear(doc, e), mmS = function (v) { return v == null ? "no wall" : Math.round(v) + " mm"; }; return ro("Covers on plan", Math.round(Cc.out.len) + " × " + Math.round(Cc.out.wd) + " mm") + ro("Clear to walls", "behind " + mmS(Cc.back) + ", far end " + mmS(Cc.front) + ", start side " + mmS(Cc.near) + ", other side " + mmS(Cc.far) + (Cc.hit ? " — ⚠ runs into a wall" : "")); } catch (er) { return ""; } })() + ro("Total rise", ed.fmt(e.n * e.R)) + ro("Check 2R + T", Math.round(2 * e.R + e.T) + " mm" + (2 * e.R + e.T < 550 || 2 * e.R + e.T > 700 ? " — outside the usual 550–700 comfort range" : " — within 550–700")); break;
      case "room": h += f("Name", "name", e.name || "", "text") + sel("Floor finish", "floor", e.floor || "", [["vitrified", "Vitrified tiles"], ["ceramic", "Ceramic tiles"], ["kota", "Kota stone"], ["granite", "Granite"], ["ips", "IPS / CC flooring"], ["", "None"]]) + f("Skirting height (mm)", "skirt", e.skirt || "", "num") + f("Floor raised (+) or sunk (−) from the level — split level, platform, sunken court", "fl", e.fl ? Lm(e.fl) : "", "len", { ph: "0" }) + sel("False ceiling", "ceil", String(!!e.ceil), [["false", "No"], ["true", "Yes"]]) + (e.ceil ? f("False ceiling height above floor (blank = 300 below slab)", "fch", e.fch == null ? "" : Lm(e.fch), "len", { ph: Lm(B.fceilH ? B.fceilH(ed.doc, Object.assign({}, e, { fch: null })) : 0) }) + (B.CEIL_DES ? sel("Ceiling design (POP / gypsum)", "cdes", e.cdes || "", B.CEIL_DES) + (e.cdes ? f("Border width", "cbw", Lm(e.cbw || 600)) + f("Step height (drop)", "cdrop", Lm(e.cdrop || 150)) + sel("LED colour", "cled", e.cled || "", [["", "Warm white"]].concat((B.RUN_LEDLOOKS || []).map(function (k) { return [k, B.LOOKS[k].n]; }))) : "") + sel("Spot lights", "cspot", e.cspot || "", B.CEIL_SPOTS) : "") : "") + ro("Area", ed.fmtA(B.area(e.pts))) + ro("Perimeter", ed.fmt(G.segsLength(G.polySegs(e.pts, true)))); break;
      case "railing": var rst = B.railStyle(e); h += sel("Design", "style", e.style || "", B.RAIL_STYLES) + (rst.par ? f("Wall thickness", "th", Lm(B.railTh(e))) + (e.style === "par_rail" || e.style === "par_glass" ? f("Low wall height (rest is railing / glass)", "ph", Lm(B.railLow(e))) : "") : "") + "<p class='muted small'>Material / colour: use Paint or the look below — e.g. SS, PVD gold, cast iron, powder coat, any paint.</p>" + f("Height", "h", Lm(e.h || 1000)) + f("Base above level floor (roof top = level height)", "base", Lm(e.base || 0)); break;
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
  /* 3D extras: walk-through and point-to-point measuring */
  function v3mode(ed, C, m) {
    var v = C.v3, root = C.root.querySelector(".cad-3d"), msg = root.querySelector(".v3-msg"), pad = root.querySelector(".v3-pad"), ov = root.querySelector(".v3-ov");
    var say = function (t) { msg.hidden = !t; msg.textContent = t || ""; }, btn = function (k, on) { var b = root.querySelector("[data-v3m='" + k + "']"); if (b) b.setAttribute("aria-pressed", String(!!on)); };
    if (m === "walk") {
      var on = !v.walk, L = B.level(ed.doc.d, bim(ed).cur);
      v.setWalk(on, on ? ((L && L.elev) || 0) / 1000 : 0); btn("walk", on); pad.hidden = !on;
      say(on ? "Walk: drag to look round · W A S D / arrow keys or the buttons to move · wheel = forward / back · Q E = down / up. Press Walk again to leave." : (v.measure ? "Measure: click the first point." : ""));
      return;
    }
    if (m === "section") {
      var sp = root.querySelector(".v3-sec"), bb = (C.v3bbox || [-10, -10, 0, 10, 10, 5]);
      if (!sp.hidden) { sp.hidden = true; v.box = null; btn("section", false); v.dirty = true; ed.marks = null; ed.dirty = true; return; }
      var pad2 = 0.5, lo = [bb[0] - pad2, bb[1] - pad2], hi = [bb[3] + pad2, bb[4] + pad2], row = function (k, lab, val) { return "<label>" + lab + "<input type='range' min='0' max='100' value='" + val + "' data-v3box='" + k + "'></label>"; };
      sp.innerHTML = "<b>Section box</b>" + row(0, "West side", 0) + row(1, "East side", 100) + row(2, "South side", 0) + row(3, "North side", 100) + "<span class='muted'>Slide a side in to cut the model there. The Cut slider on top cuts by height.</span>";
      sp.hidden = false; btn("section", true); C.v3boxR = [lo, hi];
      sp.oninput = function () { var q = sp.querySelectorAll("[data-v3box]"), f = function (i) { return +q[i].value / 100; }; v.box = [lo[0] + (hi[0] - lo[0]) * f(0), lo[0] + (hi[0] - lo[0]) * f(1), lo[1] + (hi[1] - lo[1]) * f(2), lo[1] + (hi[1] - lo[1]) * f(3)]; v.dirty = true; ed.dirty = true; };
      ed.marks = function () { var bx = C.v3 && C.v3.box; if (!bx || !C.v3mode || C.v3mode === "off") return null; var x0 = Math.min(bx[0], bx[1]) * 1000, x1 = Math.max(bx[0], bx[1]) * 1000, y0 = Math.min(bx[2], bx[3]) * 1000, y1 = Math.max(bx[2], bx[3]) * 1000, tk = Math.max(150, (x1 - x0 + y1 - y0) / 60), out = [{ t: "pline", pts: [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]], closed: true, lt: "DASHED" }]; [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]].forEach(function (q) { out.push({ t: "line", a: [q[0], q[1]], b: [q[0] + q[2] * tk, q[1]] }); out.push({ t: "line", a: [q[0], q[1]], b: [q[0], q[1] + q[3] * tk] }); }); return out; };   /* the box the 3D view is cut to, shown on the plan (split view) */ ed.dirty = true;
      return;
    }
    if (m === "tour") {
      if (C.v3tour) { C.v3tour = null; btn("tour", false); say(""); if (C.v3tourWalk) { C.v3tourWalk = false; v.setWalk(false); } return; }
      if (v.walk) { v.setWalk(false); btn("walk", false); pad.hidden = true; }
      var cpE = ed.doc.d.ents.filter(function (x) { return x.t === "pline" && x.layer === "A-CAMPATH" && x.pts && x.pts.length > 1; })[0];
      if (cpE) {   /* walk along the camera path drawn on the plan */
        var PP = cpE.pts.map(function (q) { return [q[0] / 1000, q[1] / 1000]; }); if (cpE.closed) PP.push(PP[0]);
        var cum = [0]; for (var ci = 1; ci < PP.length; ci++) cum.push(cum[ci - 1] + Math.hypot(PP[ci][0] - PP[ci - 1][0], PP[ci][1] - PP[ci - 1][1]));
        var tot = cum[cum.length - 1], spd = Math.max(0.3, +(bim(ed).camSpeed) || 1.4), LvC = B.level(ed.doc.d, bim(ed).cur), fz = ((LvC ? LvC.elev : 0) + (+(bim(ed).ngl) < 0 ? 0 : 0)) / 1000;
        if (tot > 0.5) {
          var at = function (d) { d = Math.max(0, Math.min(tot, d)); var k2 = 1; while (k2 < cum.length - 1 && cum[k2] < d) k2++; var f2 = (d - cum[k2 - 1]) / ((cum[k2] - cum[k2 - 1]) || 1); return [PP[k2 - 1][0] + (PP[k2][0] - PP[k2 - 1][0]) * f2, PP[k2 - 1][1] + (PP[k2][1] - PP[k2 - 1][1]) * f2]; };
          /* the walk climbs stairs: wherever the path crosses a tread within a step's reach of the height it is at, it takes that tread's height, and keeps the height it has reached afterwards */
          var treads = []; ed.doc.d.ents.forEach(function (st) { if (st.t !== "stair") return; var Ls = B.level(ed.doc.d, st.lvl), bz = Ls ? Ls.elev : 0, Sg; try { Sg = B.stairGeom(st); } catch (er) { return; } Sg.steps.forEach(function (sp) { var wS = sp.lw || sp.w, P = sp.poly || [sp.a, G.add(sp.a, G.mul(sp.u, sp.T)), G.add(G.add(sp.a, G.mul(sp.u, sp.T)), G.mul(sp.n, wS)), G.add(sp.a, G.mul(sp.n, wS))]; treads.push({ P: P, z: bz + sp.z1 }); }); });
          var zProf = null, climbs = 0; if (treads.length) { var nZ = Math.max(2, Math.ceil(tot / 0.1)), curZ = fz * 1000; zProf = new Float32Array(nZ + 1); for (var zi = 0; zi <= nZ; zi++) { var pz = at(tot * zi / nZ), pm = [pz[0] * 1000, pz[1] * 1000], bestT = null; treads.forEach(function (tr) { if (Math.abs(tr.z - curZ) <= 420 && G.inPoly(pm, tr.P) && (!bestT || Math.abs(tr.z - curZ) < Math.abs(bestT.z - curZ) || (tr.z === bestT.z))) bestT = tr; }); if (bestT && bestT.z !== curZ) { curZ = bestT.z; climbs++; } zProf[zi] = curZ / 1000; } if (!climbs) zProf = null; }
          var zAt = function (d) { if (!zProf) return fz; var x = Math.max(0, Math.min(1, d / tot)) * (zProf.length - 1), i0 = Math.floor(x); return zProf[Math.min(zProf.length - 1, i0)]; }, zCam = fz;
          var eyeW = Math.max(0.3, +(bim(ed).camEye) || 1.6), runW = C.v3tour = {}, Tw = performance.now(), a0 = at(0), a1 = at(1.5); v.spin = false; v.setWalk(true, fz, a0); v.we[2] = fz + eyeW; C.v3tourWalk = true; v.yaw = Math.atan2(-(a1[0] - a0[0]), a1[1] - a0[1]); btn("tour", true);
          say("Walking the camera path — " + tot.toFixed(1) + " m at " + spd + " m/s" + (zProf ? ", climbing the stairs it crosses" : "") + ". Press Tour again to stop. Use ● Record with it to make a video.");
          (function stepW() {
            if (C.v3tour !== runW || !C.v3 || C.v3.dead) return;
            var dW = (performance.now() - Tw) / 1000 * spd, pW = at(dW), qW = at(dW + 1.5), ty = Math.hypot(qW[0] - pW[0], qW[1] - pW[1]) > 0.05 ? Math.atan2(-(qW[0] - pW[0]), qW[1] - pW[1]) : v.yaw, dy2 = ty - v.yaw; while (dy2 > Math.PI) dy2 -= 2 * Math.PI; while (dy2 < -Math.PI) dy2 += 2 * Math.PI;
            var nowW = performance.now(), dtW = Math.min(0.2, (nowW - (runW.t || nowW)) / 1000); runW.t = nowW; zCam += (zAt(dW) - zCam) * (1 - Math.exp(-dtW * 7)); v.we = [pW[0], pW[1], zCam + eyeW]; runW.z = zCam; v.yaw += dy2 * (1 - Math.exp(-dtW * 5)); v.wpitch = 0; v.dirty = true;
            if (dW >= tot) { C.v3tour = null; C.v3tourWalk = false; v.setWalk(false); btn("tour", false); say("Tour finished."); if (C.v3rec && C.v3rec.auto) v3mode(ed, C, "rec"); return; }
            requestAnimationFrame(stepW);
          })();
          return;
        }
      }
      var sc = (bim(ed).scenes || []).map(function (x) { return x.view; }).filter(function (x) { return x && x.t; }), g0 = v.getView(), keys;
      if (sc.length >= 2) keys = [g0].concat(sc); else { keys = []; for (var qi = 0; qi <= 8; qi++) keys.push({ t: g0.t.slice(), yaw: g0.yaw + qi * Math.PI / 4, pitch: Math.max(0.18, Math.min(0.6, g0.pitch)), dist: g0.dist }); }
      var per = 3500, T0 = performance.now(), run = C.v3tour = {}; btn("tour", true); v.spin = false;
      say(sc.length >= 2 ? "Tour through " + sc.length + " saved scenes. Press Tour again to stop." : "Tour: once round the model. Save views in 🎬 Scenes to make your own route.");
      var ease = function (x) { return x * x * (3 - 2 * x); }, lerp = function (a, b2, k) { return a + (b2 - a) * k; }, ang = function (a, b2, k) { var dd = b2 - a; while (dd > Math.PI) dd -= 2 * Math.PI; while (dd < -Math.PI) dd += 2 * Math.PI; return a + dd * k; };
      (function step() {
        if (C.v3tour !== run || !C.v3 || C.v3.dead) return;
        var e = (performance.now() - T0) / per, i = Math.floor(e);
        if (i >= keys.length - 1) { v.setView(keys[keys.length - 1]); C.v3tour = null; btn("tour", false); say("Tour finished."); if (C.v3rec && C.v3rec.auto) v3mode(ed, C, "rec"); return; }
        var k = sc.length >= 2 ? ease(e - i) : e - i, A0 = keys[i], B0 = keys[i + 1];
        v.setView({ t: [lerp(A0.t[0], B0.t[0], k), lerp(A0.t[1], B0.t[1], k), lerp(A0.t[2], B0.t[2], k)], yaw: ang(A0.yaw, B0.yaw, k), pitch: lerp(A0.pitch, B0.pitch, k), dist: lerp(A0.dist, B0.dist, k) });
        requestAnimationFrame(step);
      })();
      return;
    }
    if (m === "rec") {
      if (C.v3rec) { var rc = C.v3rec; C.v3rec = null; btn("rec", false); try { rc.mr.stop(); } catch (e2) {} return; }
      var cv = root.querySelector(".v3-cv"); if (!cv.captureStream || !window.MediaRecorder) { U.toast("This browser cannot record the 3D view. Use Chrome or Edge."); return; }
      var types = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"], mt = types.filter(function (x) { return MediaRecorder.isTypeSupported(x); })[0];
      if (!mt) { U.toast("This browser cannot record video."); return; }
      var chunks = [], mr = new MediaRecorder(cv.captureStream(30), { mimeType: mt, videoBitsPerSecond: 8e6 });
      mr.ondataavailable = function (ev) { if (ev.data && ev.data.size) chunks.push(ev.data); };
      mr.onstop = function () { var blob = new Blob(chunks, { type: mt }), a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = ((ed.doc.d.name || "model").replace(/[^\w\- ]+/g, "") || "model") + "-3d." + (mt.indexOf("mp4") >= 0 ? "mp4" : "webm"); document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000); U.toast("Video saved (" + (blob.size / 1e6).toFixed(1) + " MB)."); };
      mr.start(500); C.v3rec = { mr: mr, auto: true }; btn("rec", true); var keep = setInterval(function () { if (!C.v3rec || !C.v3 || C.v3.dead) { clearInterval(keep); return; } C.v3.dirty = true; }, 33);
      say("Recording… now use Walk, Spin or Tour. Press Record again to stop and save the video.");
      return;
    }
    if (m === "measure") {
      v.measure = !v.measure; btn("measure", v.measure); C.v3pts = []; ov.innerHTML = "";
      if (!v.measure) { v.onMeasure = null; v.onFrame = null; say(v.walk ? "Walk mode." : ""); return; }
      say("Measure: click the first point (it snaps to corners).");
      var draw = function () {
        var P = (C.v3pts || []).map(function (h) { return v.project(h.p); }), h = "";
        if (P[0]) h += "<circle cx='" + P[0][0] + "' cy='" + P[0][1] + "' r='5'/>";
        if (P[0] && P[1]) { var a = C.v3pts[0].p, b2 = C.v3pts[1].p, dist = Math.hypot(a[0] - b2[0], a[1] - b2[1], a[2] - b2[2]), tx = (P[0][0] + P[1][0]) / 2, ty = (P[0][1] + P[1][1]) / 2, txt = ed.fmt(dist * 1000);
          h += "<line x1='" + P[0][0] + "' y1='" + P[0][1] + "' x2='" + P[1][0] + "' y2='" + P[1][1] + "'/><circle cx='" + P[1][0] + "' cy='" + P[1][1] + "' r='5'/><rect x='" + (tx - txt.length * 4 - 6) + "' y='" + (ty - 22) + "' width='" + (txt.length * 8 + 12) + "' height='20' rx='4'/><text x='" + tx + "' y='" + (ty - 8) + "' text-anchor='middle'>" + U.esc(txt) + "</text>"; }
        ov.innerHTML = h;
      };
      v.onFrame = draw;
      v.onMeasure = function (hp) {
        if (!C.v3pts || C.v3pts.length >= 2) C.v3pts = [];
        C.v3pts.push(hp);
        if (C.v3pts.length === 2) { var a = C.v3pts[0].p, b2 = C.v3pts[1].p, dx = Math.hypot(a[0] - b2[0], a[1] - b2[1]), dz = Math.abs(a[2] - b2[2]); say("Distance " + ed.fmt(Math.hypot(dx, dz) * 1000) + "  ·  on plan " + ed.fmt(dx * 1000) + "  ·  height difference " + ed.fmt(dz * 1000) + ". Click again for a new measurement."); }
        else say("Now click the second point.");
        draw(); v.dirty = true;
      };
    }
  }
  function v3host(C) { var body = C.root.querySelector(".cad-body"), h = body.querySelector(".cad-3d"); if (!h) { h = document.createElement("div"); h.className = "cad-3d"; h.innerHTML = "<div class='v3-host'><canvas class='v3-cv'></canvas></div><div class='v3-bar'>" + [["iso", "Iso"], ["top", "Top"], ["front", "Front"], ["right", "Right"], ["back", "Back"], ["left", "Left"]].map(function (v) { return "<button type='button' data-v3view='" + v[0] + "'>" + v[1] + "</button>"; }).join("") + "<button type='button' data-v3t='shadows'>Shadows</button><button type='button' data-v3t='edges'>Edges</button><button type='button' data-v3t='ortho'>Parallel</button><label>Cut <input type='range' min='0' max='100' value='100' data-v3cut='1' aria-label='Section height'></label><input type='color' data-v3secc='1' value='#756b66' title='Colour of the cut faces' aria-label='Colour of the cut faces' style='width:26px;height:22px;padding:0;border:0;background:none'><select data-v3style='1' aria-label='Visual style'><option value='0'>Realistic</option><option value='1'>Colours</option><option value='2'>White model</option></select><button type='button' data-v3pop='paint' title='Pick a material, then click walls, floors, roofs… to paint them'>🪣 Paint</button><button type='button' data-v3pop='sun' title='Sun position by date and time, sky'>☀ Sun</button><button type='button' data-v3pop='scenes' title='Saved views'>🎬 Scenes</button><button type='button' data-v3render='1' title='High-quality image'>📷 Render</button><button type='button' data-v3rebar='1' aria-pressed='false' title='Show reinforcement bars (concrete see-through)'>⛓ Rebar</button><select data-v3lv='1' aria-label='Levels'><option value='all'>All levels</option><option value='upto'>Up to current level</option></select><button type='button' data-v3png='1'>PNG</button><button type='button' data-v3m='walk' aria-pressed='false' title='Walk through the building at eye level: drag to look, W A S D or the arrows to move, wheel to go forward'>🚶 Walk</button><button type='button' data-v3m='measure' aria-pressed='false' title='Click two points on the model to measure between them (snaps to corners)'>📏 Measure</button><button type='button' data-v3t='moveMode' aria-pressed='false' title='Move things in 3D: turn this on, then drag furniture, fittings, lights, columns, cladding and other placed objects along the floor. Doors, windows and openings slide along their wall. A wall moves square to itself and the walls joined to it stretch.'>✥ Move</button><button type='button' data-v3rot='-15' title='Turn the selected object 15° to the left'>⟲</button><button type='button' data-v3rot='15' title='Turn the selected object 15° to the right'>⟳</button><button type='button' data-v3lift='100' title='Raise the selected object by 100 mm'>▲</button><button type='button' data-v3lift='-100' title='Lower the selected object by 100 mm'>▼</button><button type='button' data-v3copy='1' title='Make a copy of the selected object beside it — then drag it with Move'>⧉</button><button type='button' data-v3t='spin' aria-pressed='false' title='Turn the model slowly — for presentations'>⟳ Spin</button><button type='button' data-v3t='night' aria-pressed='false' title='Night view: the light fittings you placed light the rooms, garden and road'>🌙 Night</button><button type='button' data-v3t='lightThru' aria-pressed='false' title='Light from the fittings normally stops at walls, columns and floors. Press this if the 3D view becomes slow at night on your device: light then passes through walls as before.'>💡 Fast lights</button><button type='button' data-v3t='reflAll' aria-pressed='false' title='Glass and polished floors (granite, marble, glossy tiles) mirror the building and furniture, as water always does. Heavier to draw — switch it off if the view becomes slow.'>✨ Reflections</button><button type='button' data-v3t='xray' aria-pressed='false' title='See through walls and slabs'>◫ X-ray</button><button type='button' data-v3m='section' aria-pressed='false' title='Cut the model with a box: slide each side in to look inside'>✂ Section</button><button type='button' data-v3t='play' aria-pressed='false' title='Picture people that have a walking distance (Properties) walk back and forth'>▶ Play</button><button type='button' data-v3m='tour' aria-pressed='false' title='Fly the camera through your saved Scenes one after another (with no scenes: once round the model)'>🎞 Tour</button><button type='button' data-v3m='rec' aria-pressed='false' title='Record the 3D view as a video file (WebM) — start it, then Walk, Spin or Tour'>⏺ Record</button></div><div class='v3-pop' hidden></div><svg class='v3-ov' aria-hidden='true'></svg><div class='v3-msg' hidden></div><div class='v3-sec' hidden></div><div class='v3-pad' hidden>" + [["f", "▲", "Forward"], ["l", "◀", "Left"], ["b", "▼", "Back"], ["r", "▶", "Right"], ["u", "⤒", "Up"], ["d", "⤓", "Down"]].map(function (k) { return "<button type='button' data-v3walk='" + k[0] + "' aria-label='" + k[2] + "' title='" + k[2] + "'>" + k[1] + "</button>"; }).join("") + "</div>"; body.insertBefore(h, body.querySelector(".cad-side")); } if (!h._secc) { h._secc = 1; var hexRgb = function (x) { return [parseInt(x.substr(1, 2), 16) / 255, parseInt(x.substr(3, 2), 16) / 255, parseInt(x.substr(5, 2), 16) / 255]; }, ci = h.querySelector("[data-v3secc]"), sv = null; try { sv = localStorage.getItem("ep_seccol"); } catch (er) {} if (ci && /^#[0-9a-f]{6}$/i.test(sv || "")) ci.value = sv; C.secCol = ci ? hexRgb(ci.value) : null; if (ci) ci.addEventListener("input", function () { C.secCol = hexRgb(ci.value); try { localStorage.setItem("ep_seccol", ci.value); } catch (er) {} if (C.v3) { C.v3.secCol = C.secCol; C.v3.dirty = true; } }); } if (C.v3 && C.secCol) C.v3.secCol = C.secCol; return h; }
  var MOVABLE = { steps: 1, dome: 1, vault: 1, asset: 1, model3d: 1, run: 1, ramp: 1, column: 1, footing: 1, stair: 1, land: 1, railing: 1, beam: 1 };
  function rot3d(ed, C, deg) { var id = ed.sel.size === 1 ? Array.from(ed.sel)[0] : null, e = id && ed.doc.get(id); if (!e) { U.toast("Click an object first."); return; } if (!MOVABLE[e.t]) { U.toast("This one is turned on the plan."); return; }
    var c = e.p ? [e.p[0], e.p[1]] : null; if (!c) { try { var bb = G.bbox(e, ed.doc.d.blocks); c = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2]; } catch (er) { return; } }
    ed.doc.begin("Turn in 3D"); ed.doc.mod(id, G.xform(e, G.mRot(c, -deg * Math.PI / 180))); ed.doc.commit(); build3d(ed, C); }
  /* the entity as it stands after the drag: doors, windows and openings slide along their wall, the rest shift on plan */
  /* write the drag to the drawing; a wall moves square to itself and the walls joined to its ends stretch with it */
  function applyMv(ed, m, back) { if (!m.wn) { ed.doc.mod(m.id, back ? m.orig : mvEnt(m)); return 0; }
    var k = back ? 0 : Math.round((m.d[0] * m.wn[0] + m.d[1] * m.wn[1]) / 25) * 25, sh = [m.wn[0] * k, m.wn[1] * k], o = JSON.parse(JSON.stringify(m.orig)); o.a = [m.orig.a[0] + sh[0], m.orig.a[1] + sh[1]]; o.b = [m.orig.b[0] + sh[0], m.orig.b[1] + sh[1]]; ed.doc.mod(m.id, o);
    var done = {}; m.links.forEach(function (l) { var w = done[l.id] || JSON.parse(JSON.stringify(l.orig)); w[l.end] = [l.orig[l.end][0] + sh[0], l.orig[l.end][1] + sh[1]]; done[l.id] = w; }); Object.keys(done).forEach(function (id) { if (G.dist(done[id].a, done[id].b) > 100) ed.doc.mod(id, done[id]); });
    (m.follow || []).forEach(function (f) { var o2 = JSON.parse(JSON.stringify(f.orig)); f.idx.forEach(function (i) { var q = o2.pts[i]; o2.pts[i] = q.length > 2 ? [q[0] + sh[0], q[1] + sh[1], q[2]] : [q[0] + sh[0], q[1] + sh[1]]; }); ed.doc.mod(f.id, o2); }); m.k = k; return k; }
  function wallFaces(ed, e) { var F = [], P = []; try { ed.doc.d.ents.forEach(function (w) { if (w.t !== "wall" || (e.lvl && w.lvl !== e.lvl)) return; var Q = B.wallPoly(ed.doc, w); if (!Q) return; [[Q.sL, Q.eL], [Q.sR, Q.eR]].forEach(function (f) { var L = G.dist(f[0], f[1]); if (L < 200) return; var u = [(f[1][0] - f[0][0]) / L, (f[1][1] - f[0][1]) / L]; F.push({ a: f[0], u: u, n: [-u[1], u[0]], L: L }); }); });
      var nO = 0; ed.doc.d.ents.forEach(function (o) { if (o.id === e.id || nO > 60 || (o.t !== "asset" && o.t !== "model3d" && o.t !== "column") || (e.lvl && o.lvl !== e.lvl) || (o.t === "asset" && (B.ASSET_LIB[o.kind] || {}).cut)) return; var po = B.plan(ed.doc, o), x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, rot = ((+o.rot || 0) % 90 + 90) % 90; if (rot > 1 && rot < 89) return; (po && po.segs || []).forEach(function (g) { var Q = g.k === "L" ? [g.a, g.b] : g.k === "A" ? [[g.c[0] - g.r, g.c[1] - g.r], [g.c[0] + g.r, g.c[1] + g.r]] : []; Q.forEach(function (q) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }); }); if (!(x1 - x0 > 150 && y1 - y0 > 150) || x1 - x0 > 6000 || y1 - y0 > 6000) return; nO++;
        [[[x0, y0], [x1, y0]], [[x1, y0], [x1, y1]], [[x1, y1], [x0, y1]], [[x0, y1], [x0, y0]]].forEach(function (f) { var L = G.dist(f[0], f[1]), u = [(f[1][0] - f[0][0]) / L, (f[1][1] - f[0][1]) / L]; F.push({ a: f[0], u: u, n: [-u[1], u[0]], L: L, obj: 1 }); }); });   /* the sides of other furniture, fittings and columns standing square: a piece is set against them too */
      var pl = B.plan(ed.doc, e); (pl && pl.segs || []).forEach(function (g) { if (g.k === "L") { P.push(g.a); P.push(g.b); } else if (g.k === "A") for (var k = 0; k < 8; k++) P.push([g.c[0] + g.r * Math.cos(k * Math.PI / 4), g.c[1] + g.r * Math.sin(k * Math.PI / 4)]); }); } catch (er) {} return F.length && P.length > 1 && P.length < 4000 ? { F: F, P: P } : null; }
  /* the object is set against a wall face (at any angle) when its nearest edge is dropped within 90 mm of it; then against a second face that is not parallel to the first */
  function snapMv(m) { var W = m.faces; if (!W) return m.d; var d = m.d.slice(), TOL = 90, first = null; m.snapped = false;
    for (var pass = 0; pass < 2; pass++) { var best = null; W.F.forEach(function (f) { if (first && Math.abs(f.n[0] * first.n[0] + f.n[1] * first.n[1]) > 0.94) return; var lo = Infinity, hi = -Infinity, t0 = Infinity, t1 = -Infinity; W.P.forEach(function (q) { var x = q[0] + d[0] - f.a[0], y = q[1] + d[1] - f.a[1], dn = x * f.n[0] + y * f.n[1], t = x * f.u[0] + y * f.u[1]; if (dn < lo) lo = dn; if (dn > hi) hi = dn; if (t < t0) t0 = t; if (t > t1) t1 = t; }); if (t1 < 50 || t0 > f.L - 50) return; [lo, hi].forEach(function (v) { if (Math.abs(v) <= TOL && (!best || Math.abs(v) < Math.abs(best.v))) best = { v: v, f: f }; }); });
      if (!best) break; d[0] -= best.f.n[0] * best.v; d[1] -= best.f.n[1] * best.v; if (!first) m.snapObj = !!best.f.obj; first = best.f; m.snapped = true; }
    m.ds = d; return d; }
  function mvEnt(m) { if (!m.u) { var ds = snapMv(m); return G.xform(m.orig, G.mTrans(ds[0], ds[1])); } var o = JSON.parse(JSON.stringify(m.orig)), half = (o.w || 900) / 2 + 60; o.at = Math.max(half, Math.min(m.len - half, Math.round((m.orig.at + m.d[0] * m.u[0] + m.d[1] * m.u[1]) / 25) * 25)); return o; }
  /* plan of the solid parts of each storey (walls less their openings and doors left open, columns) for the light fittings:
     up to nine storeys as 3 × 3 tiles of 256 px, white = solid */
  function wallMask(ed, bbox) { var doc = ed.doc, d = doc.d, lv = bim(ed).levels.slice().sort(function (a, b) { return a.elev - b.elev; }).filter(function (L) { return d.ents.some(function (e) { return e.t === "wall" && e.lvl === L.id; }); }).slice(0, 9); if (!lv.length) return null;
    var x0 = bbox[0] * 1000 - 500, y0 = bbox[1] * 1000 - 500, x1 = bbox[3] * 1000 + 500, y1 = bbox[4] * 1000 + 500, T = 256, cv = document.createElement("canvas"); cv.width = cv.height = 3 * T; var c = cv.getContext("2d"); c.fillStyle = "#000"; c.fillRect(0, 0, 3 * T, 3 * T);
    var sx = T / (x1 - x0), sy = T / (y1 - y0);
    lv.forEach(function (L, i) { var ox = (i % 3) * T, oy = Math.floor(i / 3) * T, X = function (p) { return ox + (p[0] - x0) * sx; }, Y = function (p) { return oy + (p[1] - y0) * sy; },   /* the texture is not flipped: row 0 of the canvas is v = 0 */ poly = function (P, col) { c.fillStyle = col; c.strokeStyle = col; c.lineWidth = col === "#fff" ? 1.6 : 0; c.beginPath(); P.forEach(function (p, k) { if (k) c.lineTo(X(p), Y(p)); else c.moveTo(X(p), Y(p)); }); c.closePath(); c.fill(); if (col === "#fff") c.stroke(); };   /* walls are drawn a little fat so that a thin wall on a large site is still at least two pixels */
      c.save(); c.beginPath(); c.rect(ox, oy, T, T); c.clip();
      d.ents.forEach(function (e) { if (e.lvl !== L.id) return; if (e.t === "wall") { var P = B.wallPoly(doc, e); if (P) poly([P.sL, P.eL, P.eR, P.sR], "#fff"); } else if (e.t === "column") { try { poly(e.shape === "circle" ? (function () { var a = []; for (var k = 0; k < 16; k++) a.push([e.p[0] + e.w / 2 * Math.cos(k * Math.PI / 8), e.p[1] + e.w / 2 * Math.sin(k * Math.PI / 8)]); return a; })() : B.colPoly(e), "#fff"); } catch (er) {} } });
      d.ents.forEach(function (o) { if (o.t !== "opening" && o.t !== "window" && !(o.t === "door" && +o.open >= 30 && o.kind !== "sliding" && o.kind !== "shutter")) return; var pl = B.place(doc, o);   /* light passes openings, windows and doors shown open; shut doors stop it */ if (!pl || pl.w.lvl !== L.id) return; var hw = o.w / 2 - 20, ht = pl.w.th / 2 + 60, a = G.add(pl.p, G.mul(pl.u, -hw)), b2 = G.add(pl.p, G.mul(pl.u, hw)), nn = G.mul(pl.n, ht); poly([G.add(a, nn), G.add(b2, nn), G.sub(b2, nn), G.sub(a, nn)], "#000"); });
      c.restore(); });
    return { canvas: cv, box: [x0 / 1000, y0 / 1000, x1 / 1000, y1 / 1000], z: lv.map(function (L) { return L.elev / 1000; }) }; }
  function sel3d(ed) { var id = ed.sel.size === 1 ? Array.from(ed.sel)[0] : null, e = id && ed.doc.get(id); if (!e) { U.toast("Click an object first."); return null; } if (!MOVABLE[e.t]) { U.toast("This one is changed on the plan."); return null; } return e; }
  function lift3d(ed, C, dz) { var e = sel3d(ed); if (!e) return; var o = JSON.parse(JSON.stringify(e)), Lv = B.level(ed.doc.d, e.lvl), now;
    if (e.t === "dome" || e.t === "vault") { o.off = (e.off != null ? e.off : (Lv ? Lv.h : 3000)) + dz; now = o.off; }
    else if (e.t === "asset" && e.ref) { o.dz = (+e.dz || 0) + (e.ref === "ceiling" || e.ref === "fceil" ? -dz : dz); now = o.dz; }
    else if (e.t === "asset" || e.t === "model3d" || e.t === "ramp" || e.t === "steps") { var def = e.t === "asset" ? B.ASSET_LIB[e.kind] : null; if (e.z == null && def && def.o && def.o.m && def.o.m !== "floor") { U.toast("This fitting hangs from the wall or ceiling — set its height in Properties."); return; } o.z = Math.max(-20000, (+e.z || 0) + dz); now = o.z; }
    else if (e.t === "run") { var RD = B.RUNS[e.kind] || {}; o.z = (e.z == null ? (B.runAutoZ ? B.runAutoZ(ed.doc, e, RD) : RD.z) || 0 : e.z) + dz; now = o.z; }
    else { U.toast("Its height comes from the level — change it in Properties."); return; }
    ed.doc.begin("Raise / lower in 3D"); ed.doc.mod(e.id, o); ed.doc.commit(); build3d(ed, C); U.toast((dz > 0 ? "Raised" : "Lowered") + " — now " + ed.fmt(now)); }
  function copy3d(ed, C) { var e = sel3d(ed); if (!e) return; var o = G.xform(e, G.mTrans(600, -600)); delete o.id; ed.doc.begin("Copy in 3D"); var n = ed.doc.add(o); ed.doc.commit(); if (n && n.id) { ed.sel = new Set([n.id]); ed.emitSel(); } build3d(ed, C); if (C.v3 && !C.v3.moveMode) { var mb = C.root.querySelector("[data-v3t='moveMode']"); if (mb) mb.click(); } U.toast("Copy made beside it — drag it to its place."); }
  function build3d(ed, C) {
    if (!C.v3 || !C.v3.ok) { console.warn("build3d: v3 not ready", C.v3 ? "ok=" + C.v3.ok : "null"); return; }
    var b = bim(ed), opts = { rebar: !!C.v3rebar }; if (C.v3lv === "upto") opts.upTo = B.level(ed.doc.d, b.cur).elev;
    try {
      var sc = B.meshes(ed.doc, opts);
      console.log("build3d: groups=" + sc.groups.length + " bbox=" + JSON.stringify(sc.bbox));
      /* merge edge lines from groups into sc.lines */
      var allE = []; sc.groups.forEach(function (g) { if (g.e && g.e.length) allE.push.apply(allE, g.e); });
      if (allE.length) sc.lines = allE;
      try { C.v3.setWallMask((sc.lights && sc.lights.length) ? wallMask(ed, sc.bbox) : null); } catch (erM) { console.warn("wall mask", erM); }
      C.v3.setScene(sc, true); C.v3bbox = sc.bbox; C.v3cutMax = sc.bbox[5]; applyCut(C); syncSel(ed, C); applySun(ed, C);
      console.log("build3d: done, canvas=" + C.v3.cv.width + "x" + C.v3.cv.height);
    } catch (er) { console.error("build3d error:", er); }
  }
  function applySky(ed, C) { if (!C.v3 || !C.v3.ok || !C.v3.setSky) return; C.v3.setSky(Object.assign({}, bim(ed).sky || {}, C.skyLive || {})); }
  function applySun(ed, C) { if (!C.v3 || !C.v3.ok) return; applySky(ed, C); var s = B.sunNow(ed.doc.d, C.sunLive); C.v3.sunAz = s.az; C.v3.sunEl = s.el; C.v3.dirty = true; return s; }
  function hhmm(t) { var h = Math.floor(t), m = Math.round((t - h) * 60); if (m === 60) { h++; m = 0; } return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m; }
  function sunText(ed, C) { var s = B.sunNow(ed.doc.d, C.sunLive); return s.el < 0 ? "Sun below the horizon (night)" : "Sun: " + Math.round(s.trueAz != null ? s.trueAz : s.az) + "° from north, " + Math.round(s.el) + "° high"; }
  function popHtml(ed, C) {
    var d = ed.doc.d, b = bim(ed), v = C.v3;
    if (C.v3pop === "paint") {
      var pl = C.v3paint && B.LOOKS[C.v3paint];
      return "<h4>🪣 Paint materials</h4><p class='muted small' style='margin:0'>" + (pl ? "<b>" + esc(pl.n) + "</b> — now click walls, floors, slabs, roofs, columns… in the 3D view. A wall is painted on the side you are looking at." : "1. Pick a material below. 2. Click the elements in the 3D view.") + "</p>" +
        "<label class='small' style='display:flex;flex-direction:row;gap:6px;align-items:center'><input type='checkbox' style='width:auto;flex:none;margin:0' data-v3paintall='1'" + (C.v3paintAll ? " checked" : "") + "> Paint all elements of the same kind (e.g. all outer walls)</label>" +
        "<input class='in small' type='search' data-matq='1' placeholder='Search materials — e.g. teak, granite, blue, ACP, putty…' aria-label='Search materials' value='" + esc(C.matQ || "") + "'>" +
        "<div class='row' style='gap:4px;flex-wrap:wrap;margin:4px 0' role='group' aria-label='Colour'>" + MAT_COLS.map(function (c) { return "<button type='button' data-matcol='" + c[0] + "' title='" + c[1] + "' aria-label='" + c[1] + "' aria-pressed='" + ((C.matCol || "") === c[0]) + "' style='" + (c[0] ? "width:22px;height:22px;border-radius:50%;border:1px solid #8a8f94;background:" + c[2] + ";padding:0" : "border:1px solid #8a8f94;border-radius:11px;padding:0 8px;height:22px;font-size:12px;background:#fff") + "'>" + (c[0] ? "" : "All") + "</button>"; }).join("") + "</div>" +
        "<div style='max-height:46vh;min-height:90px;overflow:auto;margin:0 -6px;flex:1 1 auto'>" + matLibHtml(C.v3paint || null) + "</div>" +
        "<div class='row' style='gap:6px;justify-content:flex-end'>" + (C.v3paint && B.LOOKS[C.v3paint] ? "<button type='button' class='btn ghost sm' data-matfav='1' title='Keep this material at the top of the list on this device'>" + (matFavs().indexOf(C.v3paint) >= 0 ? "★ Remove from favourites" : "☆ Add to favourites") + "</button>" : "") + "<button type='button' class='btn ghost sm' data-v3paintclr='1' title='Click elements to give them back the building default material'>Eraser (back to default)</button><button type='button' class='btn sec sm' data-v3pop='paint'>Done</button></div><p class='muted small' style='margin:0'>Looks only — quantities and SOR items do not change. Ctrl+Z undoes a paint.</p>";
    }
    if (C.v3pop === "sun") {
      var s = Object.assign({}, B.sunCfg(d), C.sunLive || {}), today = new Date().toISOString().slice(0, 10), tb = function (k, l) { return "<button type='button' class='btn ghost sm' data-v3t='" + k + "' aria-pressed='" + String(!!v[k]) + "'>" + l + "</button>"; };
      return "<h4>Sun and sky</h4><label>Sun from<select class='in small' data-v3sm='1'><option value='time'" + (s.mode !== "manual" ? " selected" : "") + ">Date and time (real sun)</option><option value='manual'" + (s.mode === "manual" ? " selected" : "") + ">Set by hand</option></select></label>" +
        (s.mode !== "manual" ? "<label>Date<input type='date' class='in small' data-v3date='1' value='" + esc(s.date || today) + "'></label><div class='row'><button type='button' class='btn ghost sm' data-v3dq='" + today.slice(0, 4) + "-06-21'>21 June</button><button type='button' class='btn ghost sm' data-v3dq='" + today.slice(0, 4) + "-03-21'>21 March</button><button type='button' class='btn ghost sm' data-v3dq='" + today.slice(0, 4) + "-12-21'>21 December</button><button type='button' class='btn ghost sm' data-v3dq='" + today + "'>Today</button></div><label>Time <b class='v3-tt'>" + hhmm(s.t) + "</b><input type='range' min='5' max='19.5' step='0.25' value='" + s.t + "' data-v3time='1' aria-label='Time of day'></label>"
          : "<label>Direction °<input type='range' min='0' max='360' value='" + s.az + "' data-v3az='1' aria-label='Sun direction'></label><label>Height °<input type='range' min='2' max='90' value='" + s.el + "' data-v3el='1' aria-label='Sun height'></label>") +
        "<div class='muted small v3-st'>" + esc(sunText(ed, C)) + "</div><div class='row'>" + tb("sky", "Sky") + tb("fog", "Haze") + tb("shadows", "Shadows") + "</div>" + (function () { var k = bim(ed).sky || {}, SK = (B.View3D && B.View3D.SKIES) || [["clear", "Clear sky"]];
          return "<label>Sky and background<select class='in small' data-v3sky='1'>" + SK.map(function (x) { return "<option value='" + x[0] + "'" + ((k.kind || "clear") === x[0] ? " selected" : "") + ">" + x[1] + "</option>"; }).join("") + "</select></label>" +
            (k.kind === "pic" ? "<div class='row' style='gap:6px'><button type='button' class='btn sec sm' data-v3skyadd='1'>" + (k.src ? "Change picture" : "Choose picture") + "</button><input type='file' accept='image/*' data-v3skyfile='1' hidden></div>" + (k.src ? "<label>Turn the picture °<input type='range' min='0' max='360' value='" + (+k.rot || 0) + "' data-v3skyrot='1' aria-label='Turn the background'></label><label>Horizon height in the picture<input type='range' min='0' max='80' value='" + Math.round((k.hz == null ? 0.3 : +k.hz) * 100) + "' data-v3skyhz='1' aria-label='Horizon height'></label><p class='muted small' style='margin:0'>A site photo, a street view or a 360° panorama (2:1). An ordinary photo is mirrored round the model.</p>" : "<p class='muted small' style='margin:0'>Choose a photo of the site, the sky or a 360° panorama.</p>") : ""); })() + "<p class='muted small' style='margin:0'>Place and north are in the Building tab.</p>";
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
  function showPop(ed, C) { var h = C.root.querySelector(".v3-pop"); if (!h) return; if (!C.v3pop) { h.hidden = true; h.innerHTML = ""; return; } h.innerHTML = popHtml(ed, C); h.hidden = false; var bar = C.root.querySelector('.v3-bar'); if (bar) { h.style.top = (bar.offsetHeight + 12) + 'px'; h.style.maxHeight = 'calc(100% - ' + (bar.offsetHeight + 20) + 'px)'; h.style.overflowY = 'auto'; } if (C.v3pop === "paint" && C.matQ) matFilter(C); }
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
      var h = v3host(C), fresh = false; if (!C.v3 || C.v3.dead) { fresh = true; C.v3 = new B.View3D(h.querySelector(".v3-host canvas")); if (!C.v3.ok) { console.warn("View3D init failed"); U.toast("The 3D view needs WebGL 2 — it is not available in this browser / device."); return; } C.v3.secCol = C.secCol || null; C.v3.onMoveStart = function (id) { var e = ed.doc.get(id); if (!e) return false;
        if (e.t === "door" || e.t === "window" || e.t === "opening") { var plH = B.place(ed.doc, e), hw = plH && plH.w; if (!plH || !hw) return false; var LkH = ed.doc.d.layers[e.layer || "0"]; if (LkH && LkH.lock) { U.toast("Its layer is locked."); return false; } C.mv = { id: id, orig: JSON.parse(JSON.stringify(e)), d: [0, 0], t: 0, u: plH.u.slice(), len: G.dist(hw.a, hw.b) }; ed.doc.begin("Move in 3D"); ed.sel = new Set([id]); return true; }
        if (e.t === "wall") { var LkW = ed.doc.d.layers[e.layer || "0"]; if (LkW && LkW.lock) { U.toast("Its layer is locked."); return false; } var uW = G.norm(G.sub(e.b, e.a)), links = [];
          ed.doc.d.ents.forEach(function (o) { if (o.t !== "wall" || o.id === e.id || o.lvl !== e.lvl) return; ["a", "b"].forEach(function (k) { var w0 = G.sub(o[k], e.a), tt = w0[0] * uW[0] + w0[1] * uW[1], dn = Math.abs(w0[0] * -uW[1] + w0[1] * uW[0]); if (dn < 30 && tt > -30 && tt < G.dist(e.a, e.b) + 30) links.push({ id: o.id, end: k, orig: JSON.parse(JSON.stringify(o)) }); }); });   /* walls that end at a corner of this wall or anywhere along it */
          var follow = [], LW = G.dist(e.a, e.b), tol = (e.th || 230) / 2 + 90;   /* corners of rooms, slabs and roofs that sit on this wall go with it */
          ed.doc.d.ents.forEach(function (o) { if ((o.t !== "room" && o.t !== "slab" && o.t !== "roof") || !o.pts || o.lvl !== e.lvl) return; var idx = []; o.pts.forEach(function (q, i) { var w0 = G.sub(q, e.a), tt = w0[0] * uW[0] + w0[1] * uW[1], dn = Math.abs(w0[0] * -uW[1] + w0[1] * uW[0]), ov = o.t === "room" ? 0 : (+o.over || 0) + 500; if (dn <= tol + ov && tt > -tol - ov && tt < LW + tol + ov) idx.push(i); }); if (idx.length >= 2) follow.push({ id: o.id, idx: idx, orig: JSON.parse(JSON.stringify(o)) }); });
          C.mv = { id: id, orig: JSON.parse(JSON.stringify(e)), d: [0, 0], t: 0, wn: [-uW[1], uW[0]], links: links, follow: follow }; ed.doc.begin("Move wall in 3D"); ed.sel = new Set([id]); return true; }
        if (!MOVABLE[e.t]) { U.toast("Slabs, roofs and rooms are changed on the plan — in 3D you can drag furniture, fittings, lights, columns, ramps, cladding, walls, and slide doors and windows along their wall."); return false; }
        var L = ed.doc.d.layers[e.layer || "0"]; if (L && L.lock) { U.toast("Its layer is locked."); return false; } C.mv = { id: id, orig: JSON.parse(JSON.stringify(e)), d: [0, 0], t: 0, faces: e.t === "asset" || e.t === "model3d" || e.t === "run" || e.t === "column" ? wallFaces(ed, e) : null }; ed.doc.begin("Move in 3D"); ed.sel = new Set([id]); return true; };
      C.v3.onMoveDrag = function (dx, dy) { var m = C.mv; if (!m) return; m.d = [Math.round(dx * 40) * 25, Math.round(dy * 40) * 25]; if (m.t) return; m.t = setTimeout(function () { m.t = 0; if (C.mv !== m) return; applyMv(ed, m); clearTimeout(t3); build3d(ed, C); }, 70); };
      C.v3.onMoveEnd = function (moved, cancel) { var m = C.mv; C.mv = null; if (!m) return; clearTimeout(m.t); if (moved && !cancel) applyMv(ed, m); else if (moved) applyMv(ed, m, true); ed.doc.commit(); clearTimeout(t3); if (moved) { build3d(ed, C); U.toast("Moved " + ed.fmt(m.wn ? Math.abs(m.k || 0) : m.u ? Math.abs(mvEnt(m).at - m.orig.at) : Math.hypot((m.ds || m.d)[0], (m.ds || m.d)[1])) + (m.wn ? " — the walls joined to it, and the rooms, slabs and roofs that sit on it, were stretched with it. Check the outlines on the plan." : m.u ? " along the wall" : "") + (m.wn ? "" : (m.snapped ? (m.snapObj ? " — set against the piece beside it" : " — set against the wall face") : "") + ". Undo brings it back.")); } ed.emitSel(); };
      C.v3.onPick = function (id) { if (C.v3pop === "paint" && (C.v3paint || C.v3paintClr)) { paintPick(ed, C, id); return; } if (!id) { ed.sel.clear(); ed.emitSel(); return; } var e = ed.doc.get(id); if (!e) return; var lv = e.lvl || (B.hostOf(ed.doc, e) || {}).lvl, bb = bim(ed); if (lv && lv !== bb.cur && !bb.showAll) { setBim(ed, function (x) { x.cur = lv; }, "Level"); } ed.sel = new Set([id]); ed.emitSel(); C.panel = "props"; CAD.ui.renderPanels(); }; }
      setTimeout(function () { try { C.v3.resize(); build3d(ed, C); ed.resize(); if (fresh) C.v3.frame(); } catch (er) { console.error("3D init:", er); } }, 60);
    } else setTimeout(function () { ed.resize(); }, 30);
    var btn = C.root.querySelector("[data-cad=v3]"); if (btn) btn.textContent = { off: "🧊 3D", split: "🧊 3D: split", full: "🧊 3D: full" }[C.v3mode];
  };
  var t3 = 0;
  CAD.HOOKS.change.push(function (ed, C) { topBar(ed, C); if (B.autoViewsHook) B.autoViewsHook(ed); if (C.v3 && C.v3.ok && C.v3mode && C.v3mode !== "off") { clearTimeout(t3); t3 = setTimeout(function () { build3d(ed, C); }, 350); } });
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
      if (ds.v3sky) { setBim(ed, function (x) { x.sky = Object.assign({}, x.sky || {}, { kind: t.value }); }, "Sky"); applySky(ed, C); showPop(ed, C); return; }
      if (ds.v3skyrot || ds.v3skyhz) { var sl = C.skyLive || {}; C.skyLive = null; setBim(ed, function (x) { x.sky = Object.assign({}, x.sky || {}, sl); }, "Sky"); applySky(ed, C); return; }
      if (ds.v3skyfile && t.files && t.files[0]) { var fr = new FileReader(); fr.onload = function () { var im = new Image(); im.onload = function () { var kk = Math.min(1, 2048 / im.naturalWidth), cw = Math.max(2, Math.round(im.naturalWidth * kk)), ch = Math.max(2, Math.round(im.naturalHeight * kk)), cv = document.createElement("canvas"); cv.width = cw; cv.height = ch; cv.getContext("2d").drawImage(im, 0, 0, cw, ch); var src = cv.toDataURL("image/jpeg", 0.8); setBim(ed, function (x) { x.sky = Object.assign({}, x.sky || {}, { kind: "pic", src: src, pano: cw / ch >= 1.9 }); }, "Background picture"); applySky(ed, C); showPop(ed, C); }; im.onerror = function () { U.toast("This picture could not be read"); }; im.src = fr.result; }; fr.readAsDataURL(t.files[0]); return; }
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
      if (ds.matq) { C.matQ = t.value; matFilter(C); return; }
      if (ds.v3skyrot || ds.v3skyhz) { C.skyLive = Object.assign({}, C.skyLive || {}, ds.v3skyrot ? { rot: +t.value } : { hz: +t.value / 100 }); applySky(ed, C); return; }
      if (ds.v3time || ds.v3az || ds.v3el) { C.sunLive = Object.assign({}, C.sunLive || {}, ds.v3time ? { t: +t.value } : ds.v3az ? { az: +t.value } : { el: +t.value }); applySun(ed, C); var p = C.root.querySelector(".v3-pop"); if (p) { var tt = p.querySelector(".v3-tt"), s2 = p.querySelector(".v3-st"); if (tt && ds.v3time) tt.textContent = hhmm(+t.value); if (s2) s2.textContent = sunText(ed, C); } }
    });
    r.addEventListener("click", function (ev) {
      var t = ev.target.closest("button, [data-matpick], [data-bimlookopen]"); if (!t) return; var ds = t.dataset;   // material rows and swatches are not buttons
      if (ds.v3skyadd) { var sf = C.root.querySelector("[data-v3skyfile]"); if (sf) { sf.value = ""; sf.click(); } return; }
      if (ds.bimcur) { setBim(ed, function (x) { x.cur = ds.bimcur; }, "Level"); CAD.ui.renderPanels(); return; }
      if (ds.bimadd) { setBim(ed, function (x) { var top = x.levels.slice().sort(function (a, c) { return c.elev - a.elev; })[0], id = "L" + Date.now().toString(36); x.levels.push({ id: id, name: "Level " + (x.levels.length), elev: top.elev + top.h, h: 3200 }); }, "Add level"); CAD.ui.renderPanels(); return; }
      if (ds.bimlvdel) { var keep = bim(ed).levels.filter(function (l) { return l.id !== ds.bimlvdel; }).sort(function (a, c) { return a.elev - c.elev; })[0]; ed.doc.begin("Delete level"); ed.doc.d.ents.filter(function (e) { return e.lvl === ds.bimlvdel; }).forEach(function (e) { ed.doc.mod(e.id, Object.assign(CAD.clone(e), { lvl: keep.id })); }); var bb = CAD.clone(bim(ed)); bb.levels = bb.levels.filter(function (l) { return l.id !== ds.bimlvdel; }); if (bb.cur === ds.bimlvdel) bb.cur = keep.id; ed.doc.set("bim", bb); ed.doc.commit(); CAD.ui.renderPanels(); return; }
      if (ds.v3walk && C.v3) { var wk = { f: [0.6, 0, 0], b: [-0.6, 0, 0], l: [0, -0.5, 0], r: [0, 0.5, 0], u: [0, 0, 0.3], d: [0, 0, -0.3] }[ds.v3walk]; if (wk) C.v3.walkMove(wk[0], wk[1], wk[2]); return; }
      if (ds.v3m && C.v3) { v3mode(ed, C, ds.v3m); return; }
      if (ds.v3view && C.v3) { if (C.v3.walk) v3mode(ed, C, "walk"); C.v3.frame(ds.v3view); return; }
      if (ds.v3rot && C.v3) { rot3d(ed, C, +ds.v3rot); return; }
      if (ds.v3lift && C.v3) { lift3d(ed, C, +ds.v3lift); return; }
      if (ds.v3copy && C.v3) { copy3d(ed, C); return; }
      if (ds.v3t && C.v3) { if (ds.v3t === "ortho") C.v3.cam.ortho = !C.v3.cam.ortho; else C.v3[ds.v3t] = !C.v3[ds.v3t]; t.setAttribute("aria-pressed", String(ds.v3t === "ortho" ? C.v3.cam.ortho : C.v3[ds.v3t])); C.v3.dirty = true; return; }
      if (ds.v3pop && C.v3) { C.v3pop = C.v3pop === ds.v3pop ? null : ds.v3pop; if (C.v3pop !== "paint") C.v3paintClr = false; showPop(ed, C); paintCursor(C); return; }
      if (ds.v3dq) { commitSun(ed, C, { date: ds.v3dq }); showPop(ed, C); return; }
      if (ds.v3render && C.v3) { renderDlg(ed, C); return; }
      if (ds.v3scsave && C.v3) { var nmI = C.root.querySelector("#v3-scname"), nm = (nmI && nmI.value.trim()) || "View " + ((bim(ed).scenes || []).length + 1); var scn = { id: "S" + Date.now().toString(36), name: nm.slice(0, 60), view: C.v3.getView(), cut: C.v3cutPct == null ? 100 : C.v3cutPct, lv: C.v3lv || "all", sun: Object.assign({}, B.sunCfg(ed.doc.d)), sky: (function (k) { return k ? { kind: k.kind || "clear", rot: k.rot || 0, hz: k.hz } : null; })(bim(ed).sky), night: !!C.v3.night }; setBim(ed, function (x) { x.scenes = (x.scenes || []).concat([scn]); }, "Save scene"); U.toast("Scene saved: " + scn.name); showPop(ed, C); return; }
      if (ds.v3scene != null && C.v3) { var sc0 = (bim(ed).scenes || [])[+ds.v3scene]; if (!sc0) return; C.v3.setView(sc0.view); C.v3cutPct = sc0.cut; var cr = C.root.querySelector("[data-v3cut]"); if (cr) cr.value = sc0.cut; var ls = C.root.querySelector("[data-v3lv]"); if (ls) ls.value = sc0.lv || "all"; var sty = C.root.querySelector("[data-v3style]"); if (sty) sty.value = String(C.v3.style); if ((sc0.lv || "all") !== (C.v3lv || "all")) { C.v3lv = sc0.lv; build3d(ed, C); } applyCut(C); if (sc0.sky) { var sk0 = sc0.sky; setBim(ed, function (x) { var cur = x.sky || {}; if (sk0.kind === "pic" && !cur.src) return; x.sky = Object.assign({}, cur, { kind: sk0.kind, rot: sk0.rot, hz: sk0.hz == null ? cur.hz : sk0.hz }); }, "Scene"); } if (sc0.night != null) { C.v3.night = !!sc0.night; C.v3.dirty = true; } if (sc0.sun) { var sn = sc0.sun; setBim(ed, function (x) { x.sun = Object.assign({}, x.sun || {}, { mode: sn.mode, date: sn.date, t: sn.t, az: sn.az, el: sn.el }); }, "Scene"); } applySun(ed, C); C.root.querySelectorAll("[data-v3t]").forEach(function (bt) { var k = bt.dataset.v3t; bt.setAttribute("aria-pressed", String(k === "ortho" ? C.v3.cam.ortho : !!C.v3[k])); }); return; }
      if (ds.v3scdel != null) { var i0 = +ds.v3scdel; setBim(ed, function (x) { x.scenes = (x.scenes || []).filter(function (_, j) { return j !== i0; }); }, "Delete scene"); showPop(ed, C); return; }
      if (ds.v3rebar && C.v3) { C.v3rebar = !C.v3rebar; C.v3.showGround = !C.v3rebar; t.setAttribute("aria-pressed", String(C.v3rebar)); if (C.v3rebar && !ed.doc.d.ents.some(B.hasRf)) U.toast("No bars in the model yet — use Rebar in the ribbon (Building group)"); build3d(ed, C); return; }
      if (ds.bimrfadd || ds.bimrfdel || ds.bimrfall) { var ids = ds.bimrfall ? ed.doc.d.ents.filter(function (x) { return B.RF_TYPES[x.t] && !x.rf; }).map(function (x) { return x.id; }) : Array.from(ed.sel); ed.doc.begin(ds.bimrfdel ? "Remove reinforcement" : "Add reinforcement"); ids.forEach(function (id) { var e = ed.doc.get(id); if (!e || !B.RF_TYPES[e.t]) return; var o = CAD.clone(e); if (ds.bimrfdel) delete o.rf; else o.rf = B.rfDefault(ed.doc, e); ed.doc.mod(id, o); }); ed.doc.commit(); if (ds.bimrfall) U.toast(ids.length ? "Bars added to " + ids.length + " element(s) — check them in Properties" : "Nothing to add — every column, beam, footing and slab already has bars"); CAD.ui.renderPanels(); return; }
      if (ds.bimbbs) { bbsDlg(ed, C); return; }
      if (ds.bimlookreset) { setBim(ed, function (x) { x.looks = {}; }, "3D materials"); CAD.ui.renderPanels(); return; }
      if (ds.bimlookopen) { showMatLib(ed, C, ds.bimlookopen, t); return; }
      if (ds.matfav && C.v3paint) { var on = matFavToggle(C.v3paint); U.toast(on ? "Added to favourites" : "Removed from favourites"); showPop(ed, C); return; }
      if (ds.matcol != null && t.closest && t.closest(".v3-pop")) { C.matCol = ds.matcol; matFilter(C); return; }
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
    if (B.loadTpl && !B._ns && !C._tplTried) { C._tplTried = true; B.loadTpl().then(function () { CAD.ACTIONS.qto(ed, C); }); return; }   /* Non-SOR templates first, so rows without an SOR item can get one */
    var mine = (S.est.mine || []).filter(function (e) { return e && e.doc; }), estId = C.qEst && mine.some(function (e) { return e.id === C.qEst; }) ? C.qEst : (S.est.cur && S.est.owner === S.me.id ? S.est.cur.id : (mine[0] && mine[0].id)), sched = B.schedule(ed.doc), search = {};
    function est() { return mine.filter(function (e) { return e.id === estId; })[0]; }
    function body() {
      var E = est(), cmp = E ? B.compare(sched, E, C.cur.id) : [], tot = 0;
      var h = "<h3>Quantities from the building model</h3><p class='muted small'>Measured from walls, openings, slabs, columns, beams, footings, roofs, stairs and rooms with the rules in the Building panel (IS 1200 style deductions). Reinforcement uses thumb-rule kg/m³ until a BBS is attached. Check the suggested SOR items — change any of them — then send to an estimate.</p><div id='q-pv' hidden style='position:relative;height:240px;border:1px solid var(--line);border-radius:6px;overflow:hidden;margin-bottom:6px'></div>";
      if (!sched.length) return h + "<div class='empty'>No building elements yet. Draw walls, openings, slabs… with the Building (BIM) tools.</div><div class='row' style='justify-content:flex-end'><button type='button' class='btn ghost sm' data-dlg='close'>Close</button></div>";
      h += "<div class='tw' style='max-height:52vh;overflow:auto'><table class='t qto'><thead><tr><th></th><th>Work</th><th>Zone</th><th class='num'>Model qty</th><th>SOR item</th><th class='num'>Qty</th><th class='num'>Rate ₹</th><th class='num'>Amount ₹</th>" + (E ? "<th class='num'>In estimate</th>" : "") + "</tr></thead><tbody>";
      sched.forEach(function (x, i) {
        var rate = x.item ? (EP.anRate(x.sor.b, x.sor.c) || x.item.sor) : x.ns ? B.nsRate(x.ns) : null, amt = rate != null && x.qty != null ? rate * x.qty : null; if (amt && x.include !== false) tot += amt;
        var c = cmp[i] || {}, diff = c.est != null && x.qty != null && Math.abs(c.est - x.qty) > 1e-3 * Math.max(1, Math.abs(x.qty));
        h += "<tr" + (x.include === false ? " class='off'" : "") + "><td><input type='checkbox' data-qinc='" + i + "'" + (x.include === false ? "" : " checked") + " aria-label='Include'></td><td>" + esc(x.label) + "<div class='muted small'>" + x.rows.length + " element row" + (x.rows.length > 1 ? "s" : "") + " <button type='button' class='btn ghost sm' data-qprev='" + i + "' title='Show these elements in 3D'>👁 3D</button></div></td><td>" + (x.zone === "plinth" ? "Up to plinth" : x.zone === "road" ? "Road / culvert" : "Above plinth") + "</td><td class='num'>" + UN.trimNum(x.base, 3) + " " + x.baseU + "</td>" +
          "<td style='min-width:260px'>" + (x.item ? "<b>" + esc((EP.BOOKS[x.sor.b] || {}).short || x.sor.b) + " " + esc(x.sor.c) + "</b>" + (x.sor.guess ? " <span class='badge warn'>found by text — check</span>" : x.sor.user ? " <span class='badge ok'>your choice</span>" : "") + "<div class='small muted' title='" + esc(x.item.desc) + "'>" + esc(x.item.desc.slice(0, 110)) + "…</div>" : x.ns ? "<b>Non-SOR item</b> <span class='badge ok'>ready rate analysis</span><div class='small muted' title='" + esc(x.ns.ns) + "'>" + esc(x.ns.ns.slice(0, 110)) + "</div>" : "<span class='muted'>No item suggested</span>") + (x.err ? "<div class='small' style='color:var(--danger)'>" + esc(x.err) + "</div>" : "") +
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
