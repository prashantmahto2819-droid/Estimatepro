/* Estimate Pro BIM — quantity schedule from the model, SOR item mapping and two-way link to estimates.
   Every row sent to an estimate carries src = { bim: drawing id, el: element id, key, v (model value) } so that
   "Update estimate" replaces exactly those rows and the schedule can show what changed since. */
(function () {
  "use strict";
  var EP = window.EP, B = EP.bim, UN = EP.units;
  /* suggested SOR items: [book, code] in order of preference (first one present in the loaded books wins), else a text search */
  var P = "plinth", SU = "super";
  B.MAP = Object.assign({
    excavation: { c: [["cpwd23", "2.8.1"], ["cpwd", "2.8.1"]], q: /excavation.*foundation trenches/i },
    pcc: { c: [["cpwd23", "4.1.8"], ["cpwd", "4.1.8"]], q: /cement concrete.*1:4:8/i },
    pcc_floor: { c: [["cpwd23", "4.1.8"], ["cpwd", "4.1.8"]], q: /cement concrete.*1:4:8/i },
    backfill: { c: [["cpwd23", "2.25"], ["cpwd", "2.25"]], q: /filling available excavated earth/i },
    rcc_found: { c: [["cpwd23", "5.33.1.1"], ["cpwd", "5.33.1.1"]], q: /design mix.*M.?25.*plinth/i },
    rcc: { plinth: [["cpwd23", "5.33.1.1"], ["cpwd", "5.33.1.1"]], super: [["cpwd23", "5.33.2.1"], ["cpwd", "5.33.2.1"]], q: /design mix.*M.?25/i },
    shut_found: { c: [["cpwd23", "5.9.1"], ["cpwd", "5.9.1"]], q: /centering and shuttering.*foundations/i },
    shut_col: { c: [["cpwd23", "5.9.6"], ["cpwd", "5.9.6"]], q: /centering and shuttering.*columns/i },
    shut_beam: { c: [["cpwd23", "5.9.5"], ["cpwd", "5.9.5"]], q: /centering and shuttering.*beams/i },
    shut_lintel: { c: [["cpwd23", "5.9.5"], ["cpwd", "5.9.5"]], q: /centering and shuttering.*lintels/i },
    shut_slab: { c: [["cpwd23", "5.9.3"], ["cpwd", "5.9.3"]], q: /centering and shuttering.*suspended floors/i },
    shut_stair: { c: [["cpwd23", "5.9.7"], ["cpwd", "5.9.7"]], q: /centering and shuttering.*stairs/i },
    shut_wall: { c: [["cpwd23", "5.9.2"], ["cpwd", "5.9.2"]], q: /centering and shuttering.*walls/i },
    steel: { plinth: [["cpwd23", "5.22.6"], ["cpwd", "5.22.6"]], super: [["cpwd23", "5.22A.6"], ["cpwd", "5.22A.6"]], q: /steel reinforcement.*thermo.?mechanically/i },
    brick: { plinth: [["cpwd23", "6.1.2"], ["cpwd", "6.1.2"]], super: [["cpwd23", "6.4.2"], ["cpwd", "6.4.2"]], q: /brick work.*cement mortar 1:6/i },
    block: { q: /(autoclaved aerated|AAC|solid concrete block).*masonry|block masonry/i },
    stone: { q: /random rubble masonry/i },
    plaster_int: { c: [["cpwd23", "13.4.2"], ["cpwd", "13.4.2"]], q: /12 mm cement plaster.*1:6/i },
    plaster_ext: { c: [["cpwd23", "13.6.2"], ["cpwd", "13.6.2"]], q: /20 mm cement plaster.*1:6/i },
    ceiling_plaster: { q: /6 mm cement plaster.*1:3/i },
    paint_int: { c: [["cpwd23", "13.82.2"]], q: /acrylic emulsion paint/i },
    paint_ext: { c: [["cpwd23", "13.48A.1"]], q: /exterior.*(acrylic|paint)|premium acrylic/i },
    floor_vitrified: { c: [["cpwd23", "11.41.2"], ["cpwd", "11.41.2"]], q: /vitrified tiles/i },
    floor_ceramic: { q: /ceramic glazed floor tiles/i }, floor_kota: { q: /kota stone slab/i }, floor_granite: { q: /granite stone.*flooring|granite.*floor/i }, floor_ips: { q: /cement concrete flooring.*1:2:4/i },
    skirting: { q: /skirting/i },
    false_ceiling: { c: [["cpwd23", "12.45.1"]], q: /false ceiling/i },
    door_flush: { c: [["cpwd23", "9.20.2"], ["cpwd", "9.20.2"]], q: /flush door shutter/i },
    door_pvc: { c: [["cpwd23", "9.118.1"]], q: /PVC door shutter|uPVC.*door shutter/i },
    door_steel: { q: /steel.*door.*shutter|M\.S\. door/i }, door_al: { q: /aluminium.*door/i },
    door_frame: { c: [["cpwd23", "10.14.1.1"], ["cpwd", "10.14.1.1"]], q: /pressed steel door frames/i },
    stone_door_frame: { q: /(granite|stone).{0,40}(door frame|jamb|chaukhat)|door frame.{0,40}(granite|stone)/i },
    win_al: { q: /aluminium.*(glazed|sliding).*window/i }, win_upvc: { c: [["cpwd23", "9.147.A1.2"]], q: /uPVC.*window/i },
    roof_gi: { q: /colour coated|pre-?painted.*sheet|G\.?I\.? sheet roofing/i }, roof_tile: { q: /roof tiles|mangalore/i }, roof_puf: { q: /PUF|insulated sandwich/i },
    waterproof: { q: /water ?proofing/i }, stair_finish: { q: /kota stone.*steps|granite.*steps|treads/i }, railing: { q: /railing|hand ?rail/i },
    block_count: null, count_door: null, count_window: null,
    /* roads & culverts (MPPWD SOR 2025 for Road & Bridge Works first) */
    road_clear: { c: [["mp25", "2.2 A"]], q: /clearing and grubbing/i, books: ["mp25"] },
    road_cut: { c: [["mp25", "3.3"]], q: /excavation for road(way|work) in soil/i, books: ["mp25"] },
    road_fill: { c: [["mp25", "3.13"]], q: /embankment.*borrow/i, books: ["mp25"] },
    road_shoulder: { c: [["mp25", "3.14"]], q: /embankment.*roadway cutting/i, books: ["mp25"] },
    road_gsb: { c: [["mp25", "4.1 A"]], q: /granular sub-?base/i, books: ["mp25"] },
    road_wmm: { c: [["mp25", "4.3 A"]], q: /wet mix macadam/i, books: ["mp25"] },
    road_dbm: { c: [["mp25", "5.6 a (i)"]], q: /dense graded bituminous macadam/i, books: ["mp25"] },
    road_bc: { c: [["mp25", "5.7 a (i)"]], q: /bituminous concrete/i, books: ["mp25"] },
    road_pqc: { c: [["mp25", "6.3"]], q: /cement concrete pavement/i, books: ["mp25"] },
    road_dlc: { c: [["mp25", "6.1"]], q: /dry lean cement concrete/i, books: ["mp25"] },
    road_earth: { c: [["mp25", "3.13"]], q: /embankment/i, books: ["mp25"] },
    road_prime: { c: [["mp25", "5.1"]], q: /prime coat/i, books: ["mp25"] },
    road_tack: { c: [["mp25", "5.3 (i)"]], q: /tack coat/i, books: ["mp25"] },
    culv_exc: { c: [["mp25", "12.1 I (i)"]], q: /excavation for structures/i, books: ["mp25"] },
    culv_pcc: { c: [["mp25", "9.8"]], q: /P\.?C\.?C\.? M-?15.*hume pipe/i, books: ["mp25"] },
    culv_rcc: { c: [["mp25", "13.1 F [Drum] 1"]], q: /sub-structure.*RCC Grade M25/i, books: ["mp25"] },
    culv_steel: { c: [["mp25", "12.33 [FE 500D/FE 550/FE 550D]"]], q: /HYSD bar reinforcement/i, books: ["mp25"] },
    pipe1_600: { c: [["mp25", "9.2 A"]] }, pipe1_1000: { c: [["mp25", "9.2 B"]] }, pipe1_1200: { c: [["mp25", "9.2 C"]] }, pipe1_1500: { c: [["mp25", "9.2 D"]] },
    pipe2_600: { c: [["mp25", "9.3 A"]] }, pipe2_1000: { c: [["mp25", "9.3 B"]] }, pipe2_1200: { c: [["mp25", "9.3 C"]] }, pipe2_1500: { c: [["mp25", "9.3 D"]] }
  }, B.MAP || {});
  B.MAP.kitchen_counter = { c: [["cpwd23", "8.2.2.2"]], q: /kitchen platforms.*Granite stone slab of colour black.*over 0.50/i };
  B.MAP.sink_opening = { c: [["cpwd23", "8.5"]], q: /opening of required size.*kitchen sink/i };
  function family(k) { if (B.MAP[k]) return k; if (/^rcc_/.test(k)) return "rcc"; if (/^steel_/.test(k)) return "steel"; return k; }
  B.family = family;
  B.resolve = function (d, key, zone) {
    var bs = B.ensure(d), ov = bs.map[key + "|" + zone] || bs.map[key]; if (ov && EP.item && EP.item(ov.b, ov.c)) return { b: ov.b, c: ov.c, user: true };
    var m = B.MAP[family(key)] || B.MAP[key]; if (!m) return null;
    var list = m[zone] || m.c || [];
    for (var i = 0; i < list.length; i++) if (EP.item && EP.item(list[i][0], list[i][1])) return { b: list[i][0], c: list[i][1] };
    if (m.q && EP.BOOKS) { var books = m.books || ["cpwd23", "cpwd", "mp25", "mp", "hort"]; for (var j = 0; j < books.length; j++) { var Bk = EP.BOOKS[books[j]]; if (!Bk) continue; var hit = Bk.list.filter(function (it) { return m.q.test(it.desc) && (zone !== "plinth" || !/above plinth/i.test(it.desc)) && (zone !== "super" || !/up ?to plinth/i.test(it.desc)); })[0]; if (hit) return { b: books[j], c: hit.code, guess: true }; } }
    return null;
  };
  /* Non-SOR items with a ready rate analysis (templates.json) for model work that no SOR book covers:
     key → pattern on the template's description. Used only when no SOR item resolves. */
  B.NSMAP = Object.assign({ led_strip: /^Aluminium LED profile/i, wardrobe: /modular kitchen \/ wardrobe/i, bookshelf: /modular kitchen \/ wardrobe/i, shoe_rack: /modular kitchen \/ wardrobe/i, kitchen_unit: /^Modular kitchen base unit/i, kitchen_wall_unit: /^Modular kitchen wall unit/i, tv_unit: /^TV unit with fluted panel/i, study_table: /^Study \/ office table/i, tap_fitting: /^Single-lever basin mixer/i, run_cornice: /^POP \/ gypsum cornice moulding/i, run_cornice_ext: /^GRC \/ cement cornice moulding/i, run_band: /^Cement plaster band/i, plaster_decor: /^Ready-made cement \/ GRC decorative piece/i, ceil_step: /^Stepped \/ tray false ceiling/i, chimney: /^Kitchen chimney/i, bed_single: /^Single bed 900/i, bed_double: /^Double bed 1500/i, bed: /^Double bed 1500/i, bedside: /^Bedside table/i, dressing_table: /^Dressing table with mirror/i, dining_table: /^Dining table for six/i, chair: /^Chair — dining/i, sofa: /^Sofa, measured per seat/i, center_table: /^Centre table 1050/i, table: /^Table — office/i, desk: /^Office desk 1500/i, console: /^Console \/ side table/i, console_table: /^Console \/ side table/i, ottoman: /^Ottoman/i, bench_indoor: /^Indoor bench/i, mandir: /^Puja mandir/i, puja_mandir: /^Puja mandir/i, cabinet: /^Steel storage cabinet/i, counter: /^Reception counter/i, blackboard: /^Green ceramic steel writing board/i, wall_mirror: /^Wall mirror 600/i, refrigerator: /^Refrigerator, frost free/i, stove: /^Cooking hob/i, microwave: /^Microwave oven/i, washing_machine: /^Washing machine, fully/i, dishwasher: /^Dishwasher 12/i, ro_purifier: /^RO \+ UV water purifier/i, water_cooler: /^Water cooler, storage/i, solar_heater: /^Solar water heater 200/i, ac_outdoor: /^Split air conditioner 1.5/i, cctv: /^CCTV IP camera/i, exit_sign: /^LED exit sign/i, bench: /^Garden bench 1500/i, dustbin: /^Litter bin, twin/i, flower_pot: /^Planter \/ flower pot/i, swing: /^Children's play equipment/i, play_equip: /^Children's play equipment/i, glass_partition: /^Frameless partition in 12 mm/i, gypsum_partition: /^Gypsum board partition 100/i, wood_partition: /^Wooden partition/i, jali_partition: /^CNC-cut jali partition/i, office_partition: /^Office partition system/i, folding_partition: /^Sliding-folding acoustic/i, partition_wc: /^Toilet cubicle partition/i, urinal_part: /^Urinal partition plate/i, laser_grill: /^Laser-cut jali panel/i, al_grill: /^Aluminium designer grill/i, ss_grill: /^Stainless steel \(grade 304\) grill/i, glass_railing: /^Railing in 12 mm toughened glass/i, curtain: /^Curtain in furnishing fabric/i, tree_guard: /^Tree guard 600/i, bollard: /^Bollard 900/i, flag_pole: /^Flag pole 6 m/i, pergola: /^Pergola about/i, gazebo: /^Gazebo 3/i, guard_cabin: /^Prefabricated guard cabin/i, speed_breaker: /^Rubber speed breaker/i, parking_bay: /^Marking a parking bay/i, hand_pump: /^Hand pump India/i, speaker: /^Ceiling speaker 6 W/i, ac_grille: /^Linear AC grille/i, ups: /^UPS \/ inverter 1 kVA/i, dg_set: /^Diesel generating set 125/i, transformer: /^Distribution transformer 250/i, mdb: /^Main LT distribution panel/i, fountain: /^Garden fountain, precast/i }, B.NSMAP || {});
  B._ns = null; B._nsP = null;
  B.loadTpl = function () {
    if (B._ns) return Promise.resolve(B._ns); if (B._nsP) return B._nsP;
    B._nsP = fetch("templates.json").then(function (r) { if (!r.ok) throw new Error("templates"); return r.json(); }).then(function (j) { var out = []; (function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === "object") { if (typeof o.ns === "string") out.push(o); else Object.keys(o).forEach(function (k) { walk(o[k]); }); } })(j); B._ns = out; return out; }).catch(function () { B._nsP = null; return []; });
    return B._nsP;
  };
  /* library pieces that are measured, not counted: partitions by area, curtains by width; vehicles and cylinders are for the view only */
  (function () { var AL = B.ASSET_LIB || {}, AREA = { glass_partition: 1, gypsum_partition: 1, wood_partition: 1, jali_partition: 1, office_partition: 1, folding_partition: 1, partition_wc: 1 }, VIEW = { car: 1, bike: 1, gas_cylinder: 1 };
    Object.keys(AL).forEach(function (k) { var a = AL[k]; if (!a || a.q) { return; } if (AREA[a.key]) a.q = { dim: "A" }; else if (a.key === "curtain") { if (/pelmet/i.test(a.n)) a.key = "curtain_pelmet"; else a.q = { dim: "L" }; } else if (VIEW[a.key]) a.deco = true; }); })();
  B.nsFor = function (key) { var re = B.NSMAP[key]; if (!re || !B._ns) return null; return B._ns.filter(function (t) { return re.test(t.ns); })[0] || null; };
  B.nsRate = function (t) { if (!t) return null; var c = t.an && EP.nsCalc ? EP.nsCalc({ ns: t.an }) : null; return c && c.rate ? c.rate : (t.r != null ? +t.r : null); };
  function nsQty(total, dim, u) { u = String(u || "").toLowerCase(); if (dim === "A" && /^(sqm|sq\.?m|m2|m²)$/.test(u)) return total / 1e6; if (dim === "L" && /^(rm|rmt|m|metre|meter|mtr)$/.test(u)) return total / 1000; if (dim === "N" && /^(nos?|each|no\.?|set)$/.test(u)) return total; if (dim === "M" && /^(kg|kgs)$/.test(u)) return total; if (dim === "V" && /^(cum|cu\.?m|m3|m³)$/.test(u)) return total / 1e9; return null; }
  /* schedule: rows grouped by key + zone → { key, zone, dim, total (model units), label, items: [element rows], sor, unit, qty (in SOR unit) } */
  B.schedule = function (doc) {
    var rows = B.allQty(doc), g = {}, order = [];
    rows.forEach(function (r) { var k = r.k + "|" + r.z; if (!g[k]) { g[k] = { key: r.k, zone: r.z, dim: r.dim, total: 0, label: r.label.replace(/ — face [AB]$/, "").replace(/ \d+ mm$/, ""), rows: [] }; order.push(k); } g[k].total += r.v; g[k].rows.push(r); });
    return order.map(function (k) {
      var x = g[k], s = B.resolve(doc.d, x.key, x.zone), it = s && EP.item(s.b, s.c), unit = it ? it.unit : null, uid = unit && UN.fromSor(unit), q = null, err = null;
      if (it && uid) { try { q = x.dim === "M" ? UN.conv(x.total, "kg", uid) : UN.toSor(x.total, x.dim, uid); } catch (e) { err = e.message; } }
      else if (it) err = "unit " + unit + " cannot be measured from the model";
      var nsT = !it ? B.nsFor(x.key) : null; if (nsT) { unit = nsT.u; q = nsQty(x.total, x.dim, nsT.u); if (q == null) nsT = null; }
      return Object.assign(x, { sor: s, item: it, ns: nsT || null, unit: unit, qty: q, err: err, base: x.dim === "V" ? UN.conv(x.total, "mm3x", "m3") : x.dim === "A" ? UN.conv(x.total, "mm2", "m2") : x.dim === "L" ? x.total / 1000 : x.total, baseU: { V: "m³", A: "m²", L: "m", N: "nos", M: "kg" }[x.dim] });
    });
  };
  /* write the schedule into an estimate part (adds items that are missing; replaces this model's earlier rows) */
  B.sendToEstimate = function (doc, sched, est, partId, opts) {
    opts = opts || {}; var d = est.doc, drawingId = opts.drawingId, n = 0, items = 0, marks = null, lvlName = function (id) { var L = id && B.level(doc.d, id); return L ? L.name : ""; };
    // remove rows of this model from every item first (they are re-created below)
    d.items.forEach(function (it) { if (it.meas) it.meas = it.meas.filter(function (m) { return !(m.src && m.src.bim === drawingId && (!opts.keys || opts.keys.indexOf(m.src.key + "|" + m.src.zone) >= 0)); }); });
    sched.forEach(function (x) {
      if ((!x.sor && !x.ns) || x.qty == null || x.include === false) return;
      if (opts.keys && opts.keys.indexOf(x.key + "|" + x.zone) < 0) return;
      if (!x.item && x.ns) {   /* Non-SOR item with its ready analysis */
        var nt = x.ns, xi = d.items.filter(function (i) { return i.part === partId && i.b === "x" && i.x && i.x.desc === nt.ns; })[0];
        if (!xi) { var xx = { desc: nt.ns, unit: nt.u, sor: nt.r != null ? String(nt.r) : "", an: "", src: nt.an ? "NS item — rate analysis attached" : "Indicative market rate 2026 — replace with quotation" }; if (nt.an) xx.ns = JSON.parse(JSON.stringify(nt.an)); xi = { id: EP.uid(), part: partId, b: "x", x: xx, q: "", rem: "", meas: [] }; d.items.push(xi); items++; }
        xi.meas = xi.meas || []; x.rows.forEach(function (r) { var qq = nsQty(r.v, r.dim, nt.u); if (qq == null) return; xi.meas.push({ k: "+", d: r.label + (lvlName(r.lvl) ? " · " + lvlName(r.lvl) : "") + (r.f ? " (" + r.f + ")" : ""), n: "", q: String(+qq.toFixed(4)), src: { bim: drawingId, el: r.id, key: x.key, zone: x.zone, v: r.v, at: Date.now(), name: doc.d.name } }); n++; });
        return; }
      var it = d.items.filter(function (i) { return i.part === partId && i.b === x.sor.b && i.c === x.sor.c; })[0];
      if (!it) { it = { id: EP.uid(), part: partId, b: x.sor.b, c: x.sor.c, q: "", meas: [] }; d.items.push(it); items++; }
      it.meas = it.meas || []; var uid = UN.fromSor(x.unit), uf = EP.unitFactor ? EP.unitFactor(x.unit) : 1;
      x.rows.forEach(function (r) {
        if (r.rf && B.bbsRows) {   // modelled bars → BBS rows in the estimate (same cut lengths and weight as the 3D bars)
          var el = doc.get(r.id); if (el) { marks = marks || B.rfMarks(doc); B.bbsRows(doc, el, marks[r.id]).forEach(function (br) { br.d += lvlName(r.lvl) ? " · " + lvlName(r.lvl) : ""; if (uf !== 1) br.uf = uf; br.src = { bim: drawingId, el: r.id, key: x.key, zone: x.zone, v: r.v, at: Date.now(), name: doc.d.name }; it.meas.push(br); n++; }); return; }
        }
        var q = r.dim === "M" ? UN.conv(r.v, "kg", uid) : UN.toSor(r.v, r.dim, uid);
        it.meas.push({ k: "+", d: r.label + (lvlName(r.lvl) ? " · " + lvlName(r.lvl) : "") + (r.f ? " (" + r.f + ")" : ""), n: "", q: String(+q.toFixed(4)), src: { bim: drawingId, el: r.id, key: x.key, zone: x.zone, v: r.v, at: Date.now(), name: doc.d.name } });
        n++;
      });
    });
    return { rows: n, items: items };
  };
  /* compare the model with an estimate: per key → { est: qty in estimate rows of this model, now: qty from the model } */
  B.compare = function (sched, est, drawingId) {
    var have = {}; (est.doc.items || []).forEach(function (it) { (it.meas || []).forEach(function (m) { if (m.src && m.src.bim === drawingId) { var k = m.src.key + "|" + m.src.zone; have[k] = (have[k] || 0) + (m.k === "bbs" ? (EP.bbs ? EP.bbs(est.doc, m).qty : 0) : (+m.q || 0)); } }); });
    return sched.map(function (x) { var k = x.key + "|" + x.zone; return { k: k, est: have[k] == null ? null : have[k], now: x.qty }; });
  };
})();
