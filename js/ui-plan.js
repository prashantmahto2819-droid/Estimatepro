/* Estimate Pro — Building Planner tab (भवन प्लानर).
   Pick the building type (house, office, school, college, hospital, hotel, hostel, canteen, community hall), give the plot and the rules,
   the programme (family / staff / students / beds / seats …) — the list of rooms is made from NBC 2016, CBSE, AICTE, IPHS and Ministry of Tourism norms
   and can be edited room by room. "Make layouts" gives the best 3–4 different plans with a score; "Build in CAD" turns the chosen plan into a full
   drawing (walls, doors, windows, rooms, stairs, slabs, frame, furniture), runs MEP and elevations, and from there 3D, quantities and the estimate. */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc, PL = EP.plan;
  var KEY = "ep_planner_v1";
  var P = S.pl = { type: "house", inp: {}, plot: { w: 12, d: 18 }, facing: "E", set: "mbbl", rules: null, rulesEdited: false, floors: 2, frame: "rcc", vastu: true, furn: true, mep: true, views: true, rate: {}, sanc: {}, sbc: 150, items: null, res: null, sel: {}, busy: false, open: {} };
  try { var sv = JSON.parse(localStorage.getItem(KEY) || "{}"); ["type", "inp", "plot", "facing", "set", "rules", "rulesEdited", "floors", "frame", "vastu", "furn", "mep", "views", "rate", "sanc", "sbc", "items", "itemsType"].forEach(function (k) { if (sv[k] != null) P[k] = sv[k]; }); } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ type: P.type, inp: P.inp, plot: P.plot, facing: P.facing, set: P.set, rules: P.rules, rulesEdited: P.rulesEdited, floors: P.floors, frame: P.frame, vastu: P.vastu, furn: P.furn, mep: P.mep, views: P.views, rate: P.rate, sanc: P.sanc, sbc: P.sbc, items: P.items, itemsType: P.itemsType })); } catch (e) {} }
  /* ready patterns: one tap sets the plot, the needs and the floors (house) */
  var PRESETS = { house: [
    { id: "1bhk", size: "S", n: "1BHK", hi: "25×40 ft", plot: [7.62, 12.19], v: { beds: 1, attached: 0, persons: 3, cars: 0, kitchenOpen: 0 }, fl: 1 },
    { id: "2bhk", size: "S", n: "2BHK", hi: "30×50 ft", plot: [9.14, 15.24], v: { beds: 2, attached: 1, persons: 4, cars: 1, kitchenOpen: 0 }, fl: 1 },
    { id: "3bhk", n: "3BHK", hi: "40×60 ft", plot: [12.19, 18.29], v: { beds: 3, attached: 2, persons: 5, cars: 1, kitchenOpen: 0 }, fl: 1 },
    { id: "3dup", size: "S", n: "3BHK duplex", hi: "30×50 ft, G+1", plot: [9.14, 15.24], v: { beds: 3, attached: 2, persons: 5, cars: 1, kitchenOpen: 0 }, fl: 2 },
    { id: "4dup", n: "4BHK duplex", hi: "40×60 ft, G+1", plot: [12.19, 18.29], v: { beds: 4, attached: 3, persons: 6, cars: 1, kitchenOpen: 0 }, fl: 2 },
    { id: "row", size: "S", n: "Row house", hi: "20×50 ft, G+1, no side gaps", plot: [6.1, 15.24], v: { beds: 2, attached: 1, persons: 4, cars: 1, kitchenOpen: 0 }, fl: 2, rules: { f: 2.0, r: 1.5, l: 0, rt: 0, cov: 75, far: 1.75, h: 12 } },
    { id: "bung", n: "Bungalow", hi: "50×80 ft, 4BHK, single storey", plot: [15.24, 24.38], v: { beds: 4, attached: 4, persons: 6, cars: 2, kitchenOpen: 0 }, fl: 1 } ],
    office: [{ id: "o20", n: "Small office", hi: "20 staff", plot: [18, 24], v: { staff: 20, female: 40, cabins: 2, ws: 14, meet: 8 }, fl: 0 }, { id: "o100", n: "Office 100 staff", hi: "G+3", plot: [30, 40], v: { staff: 100, female: 40, cabins: 8, ws: 80, meet: 20 }, fl: 0 }],
    school: [{ id: "pri", n: "Primary school", hi: "classes 1–5", plot: [35, 45], v: { classes: 5, sections: 1, students: 40, girls: 50, senior: 0, teachers: 7 }, fl: 0 }, { id: "hs", n: "Higher secondary", hi: "classes 1–12, 2 sections", plot: [60, 80], v: { classes: 12, sections: 2, students: 40, girls: 50, senior: 1, teachers: 40 }, fl: 0 }],
    hospital: [{ id: "phc", n: "PHC (6 beds)", hi: "प्राथमिक स्वास्थ्य केंद्र", plot: [30, 40], v: { beds: 6, opd: 2, ot: 0, labour: 1, priv: 0 }, fl: 0 }, { id: "chc", n: "CHC (30 beds)", hi: "IPHS", plot: [40, 60], v: { beds: 30, opd: 4, ot: 1, labour: 1, priv: 4 }, fl: 0 }],
    apartment: [{ id: "a8", n: "8 flats 2BHK", hi: "stilt + 4 floors", plot: [24, 32], v: { flats: 8, bhk: 2, stilt: 1 }, fl: 0 }, { id: "a24", n: "24 flats 2BHK", hi: "stilt + upper", plot: [30, 40], v: { flats: 24, bhk: 2, stilt: 1 }, fl: 0 }, { id: "a12", n: "12 flats 3BHK", hi: "stilt + upper", plot: [30, 40], v: { flats: 12, bhk: 3, stilt: 1 }, fl: 0 }],
    shops: [{ id: "s6", n: "6 shops + hall", hi: "G+1", plot: [20, 25], v: { shops: 6, halls: 2 }, fl: 2 }, { id: "s12", n: "12 shops", hi: "ground only", plot: [40, 20], v: { shops: 12, halls: 0 }, fl: 1 }],
    factory: [{ id: "f1", n: "Small unit", hi: "400 m² hall", plot: [30, 40], v: { hall: 400, godown: 100, workers: 25 }, fl: 1 }, { id: "f2", n: "Godown", hi: "1000 m² store", plot: [40, 60], v: { hall: 200, godown: 1000, workers: 10 }, fl: 1 }],
    hotel: [{ id: "gh", n: "Guest house 10 rooms", hi: "1-star size", plot: [18, 30], v: { rooms: 10, star: 1, suites: 0, covers: 20, banq: 0 }, fl: 0 }] };
  function T() { var t = PL.TYPES[P.type] || PL.TYPES.house; t.id = P.type in PL.TYPES ? P.type : "house"; return t; }
  function vals() { var t = T(), v = {}, cur = P.inp[t.id] || {}; t.inputs.forEach(function (i) { v[i.k] = cur[i.k] != null ? cur[i.k] : i.def; }); return v; }
  function rulesNow() { if (!P.rules || !P.rulesEdited) P.rules = PL.rulesFor(P.set, T().rules, P.plot.w * P.plot.d); return P.rules; }
  function regen() { var t = T(), it = t.program(vals(), P.floors > 0 ? P.floors : 2); P.items = it.map(function (x) { return Object.assign({}, x, { on: !x.off, size: "M" }); }); P.res = null; P.sel = {}; save(); }
  function items() { if (!P.items || P.itemsType !== P.type) { P.itemsType = P.type; regen(); } return P.items; }
  function sp(k) { return PL.SPACES[k] || {}; }
  function areaOf(x) { var s = sp(x.key); if (x.area > 0) return +x.area; var z = s[x.size || "M"] || s.M || [3, 3]; return Math.round(z[0] * z[1] * 10) / 10; }
  function n1(v, k) { return (Math.round(v * Math.pow(10, k || 0)) / Math.pow(10, k || 0)).toLocaleString("en-IN"); }
  function inr(v) { return "₹ " + Math.round(v).toLocaleString("en-IN"); }

  U.views.planner = function () {
    var t = T(), v = vals(), R = rulesNow(), L = items(), A = P.plot.w * P.plot.d;
    var h = '<div class="pl" style="display:flex;flex-direction:column;gap:14px;max-width:1200px">';
    h += '<div class="row" style="gap:10px;align-items:flex-end;flex-wrap:wrap"><div class="grow"><h1 style="margin:0">Building Planner <span class="muted" style="font-size:.55em;font-weight:500">भवन प्लानर — नक्शा, 2D, 3D, एस्टीमेट</span></h1>' +
      '<p class="muted" style="margin:4px 0 0">Choose the building, give the plot and what you need — get 3–4 scored layouts by NBC 2016 and the standards for that building, then build the chosen one in CAD Studio with walls, doors, windows, stairs, frame, furniture, MEP, 3D and quantities for the estimate.</p></div></div>';
    /* 1. type */
    h += '<section class="panel" style="padding:12px 14px"><h3 style="margin:0 0 8px">1. Building type <span class="muted" style="font-weight:500">भवन का प्रकार</span></h3><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px">' +
      PL.ORDER.map(function (k) { var x = PL.TYPES[k]; return '<button type="button" class="btn ' + (k === P.type ? "pri" : "sec") + '" data-pltype="' + k + '" aria-pressed="' + (k === P.type) + '" style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-align:left;padding:8px 10px;height:auto"><span style="font-size:18px">' + x.icon + '</span><b>' + esc(x.n) + '</b><span style="font-size:12px;opacity:.8">' + esc(x.hi) + "</span></button>"; }).join("") + "</div></section>";
    /* 2. plot and rules */
    var fld = function (k, lab, val, step, w) { return '<label style="display:flex;flex-direction:column;gap:2px;flex:0 0 auto"><span class="muted small">' + lab + '</span><input class="in small" style="width:' + (w || 90) + 'px" type="number" step="' + (step || 0.1) + '" data-plf="' + k + '" value="' + esc(String(val)) + '"></label>'; };
    h += '<section class="panel" style="padding:12px 14px"><h3 style="margin:0 0 8px">2. Plot and rules <span class="muted" style="font-weight:500">प्लॉट और नियम</span></h3><div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">' +
      fld("plot.w", "Plot width along the road (m) / सामने की चौड़ाई", P.plot.w, 0.1, 150) + fld("plot.d", "Plot depth (m) / गहराई", P.plot.d, 0.1, 120) +
      '<label style="display:flex;flex-direction:column;gap:2px"><span class="muted small">Road is on the plot\'s … side / सड़क किस दिशा में</span><select class="in small" data-plf="facing">' + [["N", "North / उत्तर"], ["E", "East / पूर्व"], ["S", "South / दक्षिण"], ["W", "West / पश्चिम"]].map(function (o) { return '<option value="' + o[0] + '"' + (P.facing === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
      '<span class="muted small" style="align-self:center">Plot area <b>' + n1(A, 2) + " m²</b> (" + n1(A * 10.7639) + " sq ft)</span></div>" +
      '<div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:8px"><label style="display:flex;flex-direction:column;gap:2px"><span class="muted small">Rules / नियम</span><select class="in small" data-plf="set">' + Object.keys(PL.RULESETS).map(function (k) { return '<option value="' + k + '"' + (P.set === k ? " selected" : "") + ">" + esc(PL.RULESETS[k].n) + "</option>"; }).join("") + "</select></label>" +
      fld("r.f", "Front setback m", R.f) + fld("r.r", "Rear m", R.r) + fld("r.l", "Left m", R.l) + fld("r.rt", "Right m", R.rt) + fld("r.cov", "Coverage %", R.cov, 1) + fld("r.far", "FAR", R.far, 0.05) + fld("r.h", "Height m", R.h, 0.5) +
      (P.rulesEdited ? '<button type="button" class="btn sec small" data-plact="rules-reset">Reset from rules</button>' : "") + "</div>" +
      '<p class="muted small" style="margin:6px 0 0">Setbacks, coverage, FAR and height are typical values for this plot size — check them with your town\'s building rules (नगर निगम / T&CP) and change them here if they differ.</p>' +
      '<div class="row" style="gap:14px;flex-wrap:wrap;align-items:flex-end;margin-top:8px"><label style="display:flex;flex-direction:column;gap:2px"><span class="muted small">Floors / मंज़िल</span><select class="in small" data-plf="floors">' + [[0, "Auto (as many as needed)"]].concat(t.single ? [[1, "Ground only"]] : [1, 2, 3, 4, 5, 6, 7, 8].map(function (n) { return [n, n === 1 ? "Ground only (G)" : "G+" + (n - 1)]; })).map(function (o) { return '<option value="' + o[0] + '"' + (+P.floors === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
      '<label style="display:flex;flex-direction:column;gap:2px"><span class="muted small">Structure / ढाँचा</span><select class="in small" data-plf="frame"><option value="rcc"' + (P.frame !== "lb" ? " selected" : "") + '>RCC frame (columns, beams, footings)</option><option value="lb"' + (P.frame === "lb" ? " selected" : "") + ">Load-bearing walls</option></select></label>" +
      ["vastu|Vastu / वास्तु", "furn|Furniture / फ़र्नीचर", "mep|Electrical + plumbing", "views|Elevations + section"].map(function (x) { var p = x.split("|"); return '<label class="row" style="gap:6px;align-items:center"><input type="checkbox" data-plf="' + p[0] + '"' + (P[p[0]] ? " checked" : "") + "> " + p[1] + "</label>"; }).join("") +
      fld("rate", "Rough rate ₹/m² (built-up)", P.rate[t.id] || t.rate, 500, 120) + fld("sbc", "Soil bearing kN/m² (SBC)", P.sbc || 150, 10, 110) + "</div>" +
      '<details style="margin-top:8px"' + (P.open.sanc ? " open" : "") + ' data-pldet="sanc"><summary class="small"><b>For the sanction drawing</b> — owner, address / khasra, architect (नक्शा पास कराने के लिए)</summary><div class="row" style="gap:10px;flex-wrap:wrap;margin-top:6px">' +
      [["owner", "Owner's name / मालिक का नाम", 200], ["addr", "Address / khasra no. / खसरा नं.", 240], ["ward", "Ward / village / वार्ड", 140], ["arch", "Architect / engineer", 200], ["reg", "Registration no.", 120]].map(function (f) { return '<label style="display:flex;flex-direction:column;gap:2px"><span class="muted small">' + f[1] + '</span><input class="in small" style="width:' + f[2] + 'px" data-plsan="' + f[0] + '" value="' + esc((P.sanc || {})[f[0]] || "") + '"></label>'; }).join("") + "</div></details></section>";
    /* 3. programme */
    if (PRESETS[t.id]) h += '<section class="panel" style="padding:12px 14px"><h3 style="margin:0 0 8px">Ready patterns <span class="muted" style="font-weight:500">तैयार पैटर्न — एक टैप में प्लॉट और ज़रूरतें</span></h3><div class="row" style="gap:8px;flex-wrap:wrap">' + PRESETS[t.id].map(function (p) { return '<button type="button" class="btn sec small" data-plpre="' + p.id + '" style="height:auto;padding:6px 10px;display:flex;flex-direction:column;align-items:flex-start"><b>' + esc(p.n) + '</b><span class="muted small">' + esc(p.hi) + "</span></button>"; }).join("") + "</div></section>";
    h += '<section class="panel" style="padding:12px 14px"><h3 style="margin:0 0 8px">3. What is needed <span class="muted" style="font-weight:500">ज़रूरतें</span></h3><div class="row" style="gap:12px;flex-wrap:wrap;align-items:flex-end">' +
      t.inputs.map(function (i) { return i.bool ? '<label class="row" style="gap:6px;align-items:center"><input type="checkbox" data-plin="' + i.k + '"' + (v[i.k] ? " checked" : "") + "> " + esc(i.n) + ' <span class="muted small">' + esc(i.hi) + "</span></label>" :
        '<label style="display:flex;flex-direction:column;gap:2px;min-width:120px"><span class="muted small">' + esc(i.n) + " / " + esc(i.hi) + '</span><input class="in small" style="width:110px" type="number" min="' + (i.min || 0) + '" max="' + (i.max || 9999) + '" data-plin="' + i.k + '" value="' + v[i.k] + '"></label>'; }).join("") + "</div></section>";
    /* 4. rooms list */
    var on = L.filter(function (x) { return x.on !== false && x.n > 0; }), carpet = on.reduce(function (s, x) { return s + areaOf(x) * x.n * (x.fl === "all" || sp(x.key).fl === "all" ? Math.max(1, +P.floors || 1) : 1); }, 0);
    h += '<section class="panel" style="padding:12px 14px"><div class="row" style="gap:8px;align-items:center;flex-wrap:wrap"><h3 class="grow" style="margin:0">4. Rooms and spaces <span class="muted" style="font-weight:500">कमरों की सूची — चुनें, संख्या, साइज़</span></h3>' +
      '<select class="in small" data-plact="addroom"><option value="">+ Add a room / space…</option>' + Object.keys(PL.SPACES).filter(function (k) { return !PL.SPACES[k].auto; }).sort(function (a, b) { return PL.SPACES[a].n.localeCompare(PL.SPACES[b].n); }).map(function (k) { return '<option value="' + k + '">' + esc(PL.SPACES[k].n + " — " + PL.SPACES[k].hi) + "</option>"; }).join("") + "</select>" +
      '<button type="button" class="btn sec small" data-plact="regen">Make the list again</button></div>' +
      '<div style="overflow-x:auto;margin-top:8px"><table class="tbl" style="width:100%;font-size:13px;border-collapse:collapse"><thead><tr><th></th><th style="text-align:left">Room / space</th><th>Nos.</th><th>Size</th><th>Area each m²</th><th>Floor</th><th style="text-align:left">Norm</th></tr></thead><tbody>' +
      L.map(function (x, i) { var s = sp(x.key), z = s[x.size || "M"] || s.M || [0, 0], fx = x.fix ? " · " + [x.fix.wc ? x.fix.wc + " WC" : "", x.fix.ur ? x.fix.ur + " urinal" : "", x.fix.wb ? x.fix.wb + " basin" : "", x.fix.bath ? x.fix.bath + " bath" : "", x.fix.pwd ? "CWSN cubicle" : ""].filter(Boolean).join(", ") : "";
        var norm = (s.minA ? "min " + s.minA + " m²" : "") + (s.minW ? (s.minA ? ", " : "") + "width ≥ " + s.minW + " m" : "") + (s.att ? " · with " + PL.SPACES[s.att].n.toLowerCase() : "") + fx;
        return '<tr style="border-top:1px solid var(--line)' + (x.on === false ? ";opacity:.5" : "") + '"><td><input type="checkbox" data-plit="' + i + '" data-k="on"' + (x.on !== false ? " checked" : "") + ' aria-label="Include ' + esc(x.name || s.n) + '"></td>' +
          "<td>" + esc(x.name || s.n) + '<div class="muted small">' + esc(s.hi || "") + "</div></td>" +
          '<td style="text-align:center"><input class="in small" style="width:58px" type="number" min="0" max="500" data-plit="' + i + '" data-k="n" value="' + x.n + '"></td>' +
          '<td style="text-align:center"><select class="in small" data-plit="' + i + '" data-k="size">' + ["S", "M", "L"].map(function (k) { var zz = s[k] || [0, 0]; return '<option value="' + k + '"' + ((x.size || "M") === k ? " selected" : "") + ">" + { S: "Small", M: "Normal", L: "Large" }[k] + " " + zz[0] + "×" + zz[1] + "</option>"; }).join("") + "</select></td>" +
          '<td style="text-align:center"><input class="in small" style="width:72px" type="number" step="0.5" min="0" data-plit="' + i + '" data-k="area" value="' + (x.area > 0 ? x.area : "") + '" placeholder="' + n1(z[0] * z[1], 1) + '"></td>' +
          '<td style="text-align:center"><select class="in small" data-plit="' + i + '" data-k="fl">' + [["", "Auto"], ["G", "Ground"], ["up", "Upper"], ["all", "Every floor"]].map(function (o) { var cur = x.fl != null ? x.fl : ""; return '<option value="' + o[0] + '"' + (cur === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></td>" +
          '<td class="muted small">' + esc(norm) + "</td></tr>"; }).join("") + "</tbody></table></div>" +
      '<p class="muted small" style="margin:6px 0 0">Selected: <b>' + on.reduce(function (s, x) { return s + x.n; }, 0) + " rooms / spaces, about " + n1(carpet) + ' m² of rooms</b> (walls, stairs and corridors are added in the layout). Area each = blank uses the size chosen; type a number to fix it.</p></section>';
    /* 5. layouts */
    h += '<section class="panel" style="padding:12px 14px"><div class="row" style="gap:8px;align-items:center;flex-wrap:wrap"><h3 class="grow" style="margin:0">5. Layout options <span class="muted" style="font-weight:500">नक्शे के विकल्प</span></h3><button type="button" class="btn pri" data-plact="make"' + (P.busy ? " disabled" : "") + ">" + (P.busy ? "Working…" : P.res ? "Make layouts again" : "Make layouts / नक्शे बनाएँ") + "</button></div>";
    if (P.res && P.res.err) h += '<div class="ds-msg" role="alert">' + esc(P.res.err) + "</div>";
    else if (P.res) h += resultHtml(P.res);
    else h += '<p class="muted" style="margin:8px 0 0">Press <b>Make layouts</b> to get 3–4 plans to choose from.</p>';
    h += "</section>";
    h += '<p class="muted small">Layouts are made by rules (zones, room sizes, daylight, access, wet areas together, stairs one above the other) and are a starting design: check them with an architect / engineer and the local authority before construction or submission. Norms used: NBC 2016 Parts 3, 4, 9; CBSE Affiliation Bye-laws 2018; AICTE Approval Process Handbook; IPHS 2022; Ministry of Tourism hotel guidelines.</p>';
    return h + "</div>";
  };
  function resultHtml(res) {
    var I = res.info, R = rulesNow(), t = T(), h = '<div class="row" style="gap:12px;flex-wrap:wrap;margin:8px 0" role="status">' +
      [["Floors", I.nF === 1 ? "Ground only" : "G+" + (I.nF - 1)], ["Building", n1(I.W, 2) + " × " + n1(I.D, 2) + " m"], ["Built-up", n1(I.built) + " m²"], ["Coverage", n1(I.cov, 1) + " % / " + R.cov + " %"], ["FAR", I.far.toFixed(2) + " / " + R.far], ["Height", n1(I.height, 1) + " / " + R.h + " m"], ["Occupants (NBC)", "≈ " + I.occ]].map(function (x) { return '<div style="padding:6px 10px;border:1px solid var(--line);border-radius:8px"><div class="muted small">' + x[0] + "</div><b>" + x[1] + "</b></div>"; }).join("") + "</div>";
    if (res.warn.length) h += '<div class="ds-msg" role="note">' + res.warn.map(esc).join("<br>") + "</div>";
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px;margin-top:8px">';
    res.opts.forEach(function (o, i) {
      var f = P.sel[o.id] || 0, sc = o.sc, st = o.stats, col = sc.score >= 75 ? "#1e8e3e" : sc.score >= 50 ? "#b06000" : "#c5221f", notes = [];
      if (sc.notes.win.length) notes.push("No outer wall for daylight: " + sc.notes.win.join(", "));
      if (sc.notes.acc.length) notes.push("Reached only through another room: " + sc.notes.acc.join(", "));
      if (sc.notes.small.length) notes.push("Smaller than chosen: " + sc.notes.small.slice(0, 6).join(", ") + (sc.notes.small.length > 6 ? " …" : ""));
      if (sc.notes.tight.length) notes.push("Narrower than the norm: " + sc.notes.tight.join(", "));
      if (P.vastu && sc.notes.vastu.length) notes.push("Vastu: " + sc.notes.vastu.join("; "));
      var ck = o.chk || { fire: [] }; ck.fire.forEach(function (f) { notes.push("🔥 " + f); }); if (ck.west && ck.west.length) notes.push("☀ Only a west wall (hot afternoons): " + ck.west.slice(0, 5).join(", "));
      h += '<div style="border:1px solid var(--line);border-radius:10px;padding:10px;display:flex;flex-direction:column;gap:8px"><div class="row" style="align-items:center;gap:8px"><b class="grow">' + esc(o.label) + ' <span class="muted small">' + esc(t.mode === "corr" ? (o.dbl ? "rooms both sides of the corridor" : "rooms on one side of the corridor") + ", core " + { L: "at the left end", R: "at the right end", C: "in the middle", LR: "at both ends" }[o.v.core] : (o.v.pass ? "with a passage" : "rooms open off the halls") + ", " + o.v.k + " rows") + "</span></b>" +
        '<span style="font-weight:700;color:' + col + '" title="Layout score">' + sc.score + "/100</span>" + (P.vastu && sc.vastu != null ? '<span class="muted small" title="Vastu match">Vastu ' + sc.vastu + "%</span>" : "") + "</div>";
      if (o.floors.length > 1) h += '<div class="seg" role="group" aria-label="Floor">' + o.floors.map(function (_, k) { return '<button type="button" data-plfl="' + o.id + ":" + k + '" aria-pressed="' + (k === f) + '">' + (k === 0 ? "Ground" : k === 1 ? "First" : k === 2 ? "Second" : "Floor " + k) + "</button>"; }).join("") + "</div>";
      h += '<div style="border:1px solid var(--line);border-radius:6px;overflow:hidden;background:#fff">' + PL.svg(o, f, { facing: P.facing, scale: Math.max(10, Math.min(28, 360 / (o.W + 2.4))), pick: o.id, sel: P.swap && P.swap.opt === o.id && P.swap.fi === f ? P.swap.uid : null }) + "</div>";
      if (ck.cross != null) h += '<div class="small muted">Cross ventilation in ' + ck.cross + " % of the living rooms" + (o.floors.length > 1 ? " · longest walk to a stair ≈ " + ck.travel + " m" : "") + (o.shape ? " · " + o.shape + "-shaped building" : "") + "</div>";
      if (P.swap && P.swap.opt === o.id && P.swap.fi === f) { var selR = o.floors[f].filter(function (x) { return x.uid === P.swap.uid; })[0];
        if (selR) h += '<div style="border:1px dashed #c0392b;border-radius:6px;padding:6px;display:flex;flex-direction:column;gap:4px"><div class="small"><b>' + esc(selR.name) + "</b> " + (selR.w - 0.23).toFixed(2) + " × " + (selR.d - 0.23).toFixed(2) + ' m — move a wall by 15 cm, or tap another room to swap</div><div class="row" style="gap:4px;flex-wrap:wrap">' +
          [["l", -1, "◀ left wall"], ["l", 1, "left wall ▶"], ["r", -1, "◀ right wall"], ["r", 1, "right wall ▶"], ["f", -1, "▼ road-side wall"], ["f", 1, "road-side wall ▲"], ["b", -1, "▼ back wall"], ["b", 1, "back wall ▲"]].map(function (m) { return '<button type="button" class="btn sec small" data-plmv="' + m[0] + ":" + m[1] + '">' + m[2] + "</button>"; }).join("") + '<button type="button" class="btn sec small" data-plmv="x">Done</button></div></div>'; }
      h += '<div class="small">Rooms ' + st.rooms + " · carpet ≈ " + n1(st.carpet) + " m² · built-up ≈ " + n1(st.built) + " m² · efficiency " + st.eff + " % · rough cost <b>" + inr(st.cost) + "</b></div>";
      if (notes.length) h += '<ul class="muted small" style="margin:0;padding-left:18px">' + notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>";
      h += '<div class="row" style="gap:6px;flex-wrap:wrap"><button type="button" class="btn pri grow" data-plbuild="' + i + '">Build ' + esc(o.label) + ' in CAD — 2D, 3D, estimate</button><button type="button" class="btn sec" data-plrep="' + i + '" title="Planning report with room list, norms, Vastu, fire and cost comparison — print or save as PDF">Report / PDF</button></div>';
      h += '<p class="muted small" style="margin:0">Tip: tap a room to move its walls, or tap two rooms to swap them.</p></div>';
    });
    return h + "</div>";
  }
  function cfgNow() { var t = T(); return { type: t.id, items: items().map(function (x) { var y = Object.assign({}, x); if (y.fl === "") delete y.fl; return y; }), plot: { w: +P.plot.w, d: +P.plot.d }, rules: rulesNow(), floors: +P.floors || 0, facing: P.facing, vastu: !!P.vastu, rate: +(P.rate[t.id] || t.rate), frame: P.frame, furn: P.furn, sbc: P.sbc || 150, sanction: P.sanc || {}, name: t.n + " " + P.plot.w + "×" + P.plot.d + " m" }; }
  function make() { P.busy = true; U.render(); setTimeout(function () { try { P.res = PL.generate(cfgNow()); P.sel = {}; } catch (er) { console.error(er); P.res = { err: "Could not make the layouts: " + (er && er.message) }; } P.busy = false; U.render(); }, 30); }
  async function build(i) {
    var o = P.res && P.res.opts[i]; if (!o) return; var cfg = cfgNow(), t = T(), d;
    try { d = PL.toDoc(o, cfg); } catch (er) { console.error(er); U.toast("Could not build the drawing: " + (er && er.message)); return; }
    d.name = cfg.name + " — " + o.label;
    S.tab = "cad"; try { history.replaceState(null, "", "#cad"); } catch (e) {}
    await EP.cad.newDrawing(d.name, "mm", d); window.scrollTo(0, 0);
    var C = S.cad, ed = C && C.ed; if (!ed) return; var done = [];
    try { if (ed.zoomExtents) ed.zoomExtents(); } catch (e) {}
    if (P.mep) { try { U.toast("Placing electrical and plumbing…"); var pers = t.id === "house" ? (vals().persons || 5) : Math.max(5, P.res.info.occ || 10); await PL.autoRun(ed, "MEPAUTO", [t.grp || "C", pers, "All"]); done.push("electrical + plumbing"); } catch (er) { console.warn("MEP", er); } }
    if (P.views) {
      var Ls = ed.doc.d.layers, siteL = Ls["A-SITE"], siteOn = siteL ? siteL.on : true; if (siteL) siteL.on = false;   /* the compound wall would hide the building in the elevations */
      try { U.toast("Drawing elevations, section, dimensions, schedules and the sheet…"); await PL.autoRun(ed, "ELEVATION", ["All"]); done.push("4 elevations"); } catch (er) { console.warn("elevation", er); }
      try { var st = ed.doc.d.ents.filter(function (e) { return e.t === "stair" && e.lvl === "L0"; })[0], ox = cfg.rules.l * 1000, oy = cfg.rules.f * 1000, xs = st ? st.p[0] + 300 : ox + o.W * 500;
        await PL.autoRun(ed, "SECTION", [[xs, oy - 2000], [xs, oy + o.D * 1000 + 2000], "Left", null]); done.push("section A-A"); } catch (er) { console.warn("section", er); }
      try { var B = EP.bim, bs0 = EP.cad.clone(B.ensure(ed.doc.d)), lvls = bs0.levels.filter(function (l) { return /^L\d/.test(l.id); }), nd = 0;
        for (var li = 0; li < lvls.length; li++) { var bsx = EP.cad.clone(B.ensure(ed.doc.d)); bsx.cur = lvls[li].id; ed.doc.set("bim", bsx); var before = {}; ed.doc.d.ents.forEach(function (e) { before[e.id] = 1; });
          await PL.autoRun(ed, "DIMWALLS", ["All"]); ed.doc.d.ents.forEach(function (e) { if (!before[e.id] && e.t === "dim") { e.lvl = lvls[li].id; nd++; } }); }
        var bsy = EP.cad.clone(B.ensure(ed.doc.d)); bsy.cur = "L0"; ed.doc.set("bim", bsy); if (nd) done.push(nd + " dimensions"); } catch (er) { console.warn("dims", er); }
      try { await PL.autoRun(ed, "SCHEDULE", ["Doors", null]); await PL.autoRun(ed, "SCHEDULE", ["Rooms", null]); if (P.frame !== "lb") await PL.autoRun(ed, "SCHEDULE", ["Columns", null]); done.push("door / window, room" + (P.frame !== "lb" ? " and column" : "") + " schedules"); } catch (er) { console.warn("schedule", er); }
      try { var R0 = cfg.rules; await PL.autoRun(ed, "AREASTATEMENT", [String(R0.cov), String(R0.far), String(R0.h), [cfg.plot.w * 1000 + 3000, cfg.plot.d * 1000]]); done.push("area statement"); } catch (er) { console.warn("area", er); }
      try { await PL.autoRun(ed, "SHEET", [undefined, "AllElevations", "Landscape"]); done.push("print sheet"); } catch (er) { console.warn("sheet", er); }
      var sL = ed.doc.d.layers["A-SITE"]; if (sL) sL.on = siteOn !== false; ed.dirty = true;
    }
    try { if (ed.zoomExtents) ed.zoomExtents(); ed.dirty = true; } catch (e) {}
    var fr = ed.doc.d.planner_frame; if (fr) done.push("frame sized for " + fr.w + " kN/m² per floor on SBC " + fr.sbc + " kN/m² (largest column load ≈ " + fr.maxLoad + " kN — check by design)");
    ed.say((t.n + " — " + o.label + " built: " + o.floors.length + " floor(s), " + ed.doc.d.ents.filter(function (e) { return e.t === "room"; }).length + " rooms") + (done.length ? ", " + done.join(", ") : "") + ". Press 3D to see it, Σ Quantities to send the quantities to an estimate. Every wall, door, window and room can be edited like any drawing.");
    U.toast("Built in CAD Studio — 3D button for the model, Σ Quantities for the estimate");
  }
  function setPath(k, val) {
    var t = T();
    if (k === "plot.w" || k === "plot.d") { var n = +val; if (!(n > 3)) { U.toast("Enter the plot size in metres"); return; } P.plot[k.slice(5)] = n; if (!P.rulesEdited) P.rules = null; }
    else if (k.indexOf("r.") === 0) { var R = Object.assign({}, rulesNow()); R[k.slice(2)] = Math.max(0, +val || 0); P.rules = R; P.rulesEdited = true; }
    else if (k === "set") { P.set = val; P.rulesEdited = false; P.rules = null; }
    else if (k === "floors") { P.floors = +val; if (t.mode === "corr" || /school|college|hospital|office|hostel/.test(t.id)) regen(); }
    else if (k === "rate") { P.rate[t.id] = Math.max(0, +val || 0); }
    else if (k === "sbc") { P.sbc = Math.max(50, Math.min(600, +val || 150)); }
    else if (k === "vastu" || k === "furn" || k === "mep" || k === "views") P[k] = !!val;
    else P[k] = val;
    P.res = null; save(); U.render();
  }
  /* swap two rooms: tap one, then another of the same kind (both with or both without an attached toilet) */
  document.addEventListener("click", function (e) {
    var el = e.target.closest && e.target.closest("[data-plroom]"); if (!el || !el.closest(".pl") || !P.res || !P.res.opts) return; var a = el.getAttribute("data-plroom").split("|"), o = P.res.opts.filter(function (x) { return x.id === a[0]; })[0]; if (!o) return; var fi = +a[1], rooms = o.floors[fi], r = rooms.filter(function (x) { return x.uid === a[2]; })[0]; if (!r) return;
    var bad = function (x) { var s2 = x.inst && x.inst.sp; return !s2 || s2.stair || s2.lift || s2.open || s2.unit || x.parent; };
    if (bad(r)) { U.toast("This one cannot be swapped (stair, lift, open space or attached toilet)"); return; }
    if (!P.swap || P.swap.opt !== o.id || P.swap.fi !== fi) { P.swap = { opt: o.id, fi: fi, uid: r.uid }; U.toast(r.name + " picked — move its walls with the buttons, or tap another room to swap"); U.render(); return; }
    if (P.swap.uid === r.uid) { P.swap = null; U.render(); return; }
    var q = rooms.filter(function (x) { return x.uid === P.swap.uid; })[0], kid = function (x) { return rooms.some(function (y) { return y.parent === x.uid; }); };
    if (!q || kid(q) !== kid(r)) { U.toast("Pick two rooms that both have (or both do not have) an attached toilet"); P.swap = null; U.render(); return; }
    ["inst", "key", "name", "z"].forEach(function (k) { var t2 = q[k]; q[k] = r[k]; r[k] = t2; });
    var cfg = cfgNow(); o.sc = PL.score(T(), o, cfg); o.chk = PL.checks(T(), o, cfg); o.stats = PL.stats(T(), o, cfg); P.swap = null; U.toast("Swapped — score " + o.sc.score + "/100"); U.render();
  });
  document.addEventListener("toggle", function (e) { var d2 = e.target; if (d2 && d2.dataset && d2.dataset.pldet) P.open[d2.dataset.pldet] = d2.open; }, true);
  /* planning report: plans, room schedule with norms, Vastu, fire / daylight checks, rules, cost and a comparison with one floor less / more */
  function report(i) {
    var o = P.res && P.res.opts[i]; if (!o) return; var t = T(), cfg = cfgNow(), R = cfg.rules, sd = P.sanc || {}, rate = cfg.rate, foot = PL.footArea(o), plotA = cfg.plot.w * cfg.plot.d, rows = [], vrows = [];
    var dirName = { N: "north", E: "east", S: "south", W: "west" }[P.facing];
    o.floors.forEach(function (rooms, fi) { rooms.forEach(function (r) { if (r.fill) return; var s2 = r.inst && r.inst.sp, A = PL.areaOf(r), cw = Math.max(0, r.w - 0.23), cd = Math.max(0, r.d - 0.23), minA = s2 && s2.minA, minW = s2 && s2.minW, ok = (!minA || A >= minA * 0.97) && (!minW || Math.min(r.w, r.d) >= minW - 0.05);
      rows.push("<tr><td>" + (fi === 0 ? "Ground" : "Floor " + fi) + "</td><td class='l'>" + esc(r.name) + "</td><td>" + cw.toFixed(2) + " × " + cd.toFixed(2) + "</td><td>" + A.toFixed(1) + "</td><td>" + (minA || "–") + " / " + (minW || "–") + "</td><td>" + (ok ? "✓" : "✗") + "</td></tr>");
      if (P.vastu && s2 && s2.vastu) { var dir = PL.dirOf(r.x + r.w / 2 - o.W / 2, r.y + r.d / 2 - o.D / 2, P.facing), hit = s2.vastu.indexOf(dir) >= 0; vrows.push("<tr><td class='l'>" + esc(r.name) + "</td><td>" + dir + "</td><td>" + s2.vastu.join(", ") + "</td><td>" + (hit ? "✓" : "✗") + "</td></tr>"); } }); });
    var cmp = [[o.floors.length, o.stats.built, o.stats.cost, o.stats.built / plotA, o.floors.length * t.h / 1000, "this plan"]];
    [-1, 1].forEach(function (k) { var n = o.floors.length + k; if (n < 1 || (t.single && n !== 1) || n > 8) return; try { var r2 = PL.generate(Object.assign({}, cfg, { floors: n })), b = r2.opts && r2.opts[0]; if (b) cmp.push([n, b.stats.built, b.stats.cost, r2.info.far, r2.info.height, "score " + b.sc.score + "/100" + (r2.warn.length ? " · " + r2.warn.length + " rule note(s)" : "")]); } catch (er) {} });
    var svgs = o.floors.map(function (_, fi) { return "<div class='pl'><h3>" + (fi === 0 ? "Ground floor" : "Floor " + fi) + "</h3>" + PL.svg(o, fi, { facing: P.facing, scale: Math.max(10, Math.min(30, 640 / (o.W + 2.4))) }) + "</div>"; }).join("");
    var sc = o.sc, ck = o.chk || { fire: [] }, notes = [].concat(sc.notes.win.length ? ["No outer wall for daylight: " + sc.notes.win.join(", ")] : [], sc.notes.acc.length ? ["Reached only through another room: " + sc.notes.acc.join(", ")] : [], sc.notes.tight.length ? ["Narrower than the norm: " + sc.notes.tight.join(", ")] : [], ck.fire, ck.west && ck.west.length ? ["Only a west wall: " + ck.west.join(", ")] : []);
    var cov = foot / plotA * 100, far = o.stats.built / plotA, hgt = o.floors.length * t.h / 1000;
    var html = "<!doctype html><html><head><meta charset='utf-8'><title>" + esc(t.n + " — " + o.label) + "</title><style>body{font-family:system-ui,'Segoe UI',Roboto,sans-serif;margin:0;color:#111;font-size:12px}.pg{padding:10mm;max-width:210mm;margin:0 auto}h1{font-size:18px;margin:0}h2{font-size:14px;margin:14px 0 6px;border-bottom:1px solid #999}h3{font-size:12px;margin:8px 0 4px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:3px 5px;text-align:center}td.l{text-align:left}.pl svg{max-width:100%;height:auto}.box{display:flex;gap:6px;flex-wrap:wrap}.box div{border:1px solid #bbb;padding:4px 8px;border-radius:4px}@media print{.noprint{display:none}h2{break-after:avoid}.pl{break-inside:avoid}}</style></head><body><div class='pg'>" +
      "<div class='noprint' style='margin-bottom:8px'><button onclick='print()'>🖨 Print / Save as PDF</button></div>" +
      "<h1>" + esc(t.n) + " — " + esc(o.label) + " · planning report</h1><div>" + esc(sd.owner ? "Owner: " + sd.owner + " · " : "") + esc(sd.addr ? sd.addr + " · " : "") + "Plot " + cfg.plot.w + " × " + cfg.plot.d + " m (" + plotA.toFixed(1) + " m²), road on the " + dirName + " · " + new Date().toLocaleDateString("en-IN") + "</div>" +
      "<h2>Summary</h2><div class='box'>" + [["Floors", o.floors.length === 1 ? "G" : "G+" + (o.floors.length - 1)], ["Building", o.W.toFixed(2) + " × " + o.D.toFixed(2) + " m" + (o.shape ? " (" + o.shape + "-shaped)" : "")], ["Footprint", foot.toFixed(1) + " m²"], ["Built-up", o.stats.built + " m²"], ["Carpet", o.stats.carpet + " m²"], ["Layout score", sc.score + "/100"], ["Vastu", P.vastu && sc.vastu != null ? sc.vastu + " %" : "off"], ["Cross ventilation", ck.cross != null ? ck.cross + " %" : "–"], ["Rough cost", "₹ " + o.stats.cost.toLocaleString("en-IN") + " @ ₹" + rate + "/m²"]].map(function (x) { return "<div><small>" + x[0] + "</small><br><b>" + x[1] + "</b></div>"; }).join("") + "</div>" +
      "<h2>Rules</h2><table><tr><th>Item</th><th>Allowed</th><th>This plan</th><th></th></tr>" + [["Setbacks front / rear / left / right (m)", R.f + " / " + R.r + " / " + R.l + " / " + R.rt, "kept", "✓"], ["Ground coverage", R.cov + " %", cov.toFixed(1) + " %", cov <= R.cov + 0.5 ? "✓" : "✗"], ["FAR", R.far, far.toFixed(2), far <= R.far + 0.01 ? "✓" : "✗"], ["Height (m)", R.h, hgt.toFixed(1), hgt <= R.h + 0.01 ? "✓" : "✗"], ["Occupants (NBC Part 4, " + t.occ + " m² per person)", "–", "≈ " + Math.round(o.stats.built / t.occ), ""]].map(function (x) { return "<tr><td class='l'>" + x[0] + "</td><td>" + x[1] + "</td><td>" + x[2] + "</td><td>" + x[3] + "</td></tr>"; }).join("") + "</table><p><small>Setbacks, coverage, FAR and height are the values entered in the planner — confirm them with the local authority.</small></p>" +
      "<h2>Plans</h2>" + svgs +
      "<h2>Room schedule (NBC 2016 minimum area / width)</h2><table><tr><th>Floor</th><th>Room</th><th>Inside size m</th><th>Area m²</th><th>Min m² / width m</th><th>OK</th></tr>" + rows.join("") + "</table>" +
      (vrows.length ? "<h2>Vastu</h2><table><tr><th>Room</th><th>Direction here</th><th>Preferred</th><th></th></tr>" + vrows.join("") + "</table><p><small>Directions from the centre of the building, with the road on the " + dirName + ". Vastu match " + sc.vastu + " %.</small></p>" : "") +
      "<h2>Checks</h2>" + (notes.length ? "<ul>" + notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>" : "<p>No problems found.</p>") +
      "<h2>One floor less / more</h2><table><tr><th>Floors</th><th>Built-up m²</th><th>Rough cost ₹</th><th>FAR</th><th>Height m</th><th>Note</th></tr>" + cmp.map(function (c) { return "<tr><td>" + (c[0] === 1 ? "G" : "G+" + (c[0] - 1)) + "</td><td>" + c[1] + "</td><td>" + c[2].toLocaleString("en-IN") + "</td><td>" + (+c[3]).toFixed(2) + "</td><td>" + (+c[4]).toFixed(1) + "</td><td>" + esc(c[5]) + "</td></tr>"; }).join("") + "</table>" +
      "<p><small>Rough cost = built-up area × the rate entered; the full estimate comes from the CAD quantities. Layout made by Estimate Pro Building Planner from NBC 2016 and the norms of the building type — a starting design to be checked by an architect / engineer.</small></p>" +
      "<div style='margin-top:16mm;display:flex;justify-content:space-between'><div style='border-top:1px solid #333;width:45%;text-align:center;padding-top:4px'>Owner" + (sd.owner ? ": " + esc(sd.owner) : "") + "</div><div style='border-top:1px solid #333;width:45%;text-align:center;padding-top:4px'>Architect / engineer" + (sd.arch ? ": " + esc(sd.arch) : "") + "</div></div></div></body></html>";
    var w = null; try { w = window.open("", "_blank"); } catch (er) {}
    if (w) { w.document.open(); w.document.write(html); w.document.close(); return; }
    if (EP.download) { EP.download(new Blob([html], { type: "text/html" }), (t.n + " " + o.label).replace(/[^\w]+/g, "_") + "_report.html"); U.toast("Report saved — open it and use Print → Save as PDF"); } else U.toast("Allow pop-ups to see the report");
  }
  document.addEventListener("change", function (e) {
    var el = e.target; if (!el.closest || !el.closest(".pl")) return; var ds = el.dataset;
    if (ds.plf) { setPath(ds.plf, el.type === "checkbox" ? el.checked : el.value); return; }
    if (ds.plsan) { P.sanc = P.sanc || {}; P.sanc[ds.plsan] = el.value; P.open.sanc = true; save(); return; }
    if (ds.plin) { var t = T(), cur = P.inp[t.id] = P.inp[t.id] || {}, def = t.inputs.filter(function (i) { return i.k === ds.plin; })[0]; cur[ds.plin] = el.type === "checkbox" ? (el.checked ? 1 : 0) : Math.max(def.min || 0, Math.min(def.max || 1e6, +el.value || 0)); regen(); U.render(); return; }
    if (ds.plit != null) { var x = items()[+ds.plit]; if (!x) return; var k = ds.k;
      if (k === "on") x.on = el.checked; else if (k === "n") x.n = Math.max(0, Math.round(+el.value || 0)); else if (k === "size") { x.size = el.value; if (!x.occ) delete x.area; } else if (k === "area") { x.area = +el.value > 0 ? +el.value : 0; if (x.occ) x.areaSet = x.area > 0; } else if (k === "fl") x.fl = el.value;
      P.res = null; save(); U.render(); return; }
    if (ds.plact === "addroom" && el.value) { var key = el.value, s = PL.SPACES[key]; items().push({ key: key, n: 1, on: true, size: "M", name: null, fl: s.fl || "" }); P.res = null; save(); U.render(); }
  });
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button"); if (!b || !b.closest(".pl")) return; var ds = b.dataset;
    if (ds.pltype) { if (P.type !== ds.pltype) { P.type = ds.pltype; P.rulesEdited = false; P.rules = null; var t = T(); if (t.plot) P.plot = { w: t.plot[0], d: t.plot[1] }; P.floors = t.single ? 1 : ds.pltype === "house" ? 2 : 0; P.itemsType = null; regen(); } U.render(); return; }
    if (ds.plpre) { var pr = (PRESETS[P.type] || []).filter(function (x) { return x.id === ds.plpre; })[0]; if (!pr) return; P.plot = { w: pr.plot[0], d: pr.plot[1] }; P.inp[P.type] = Object.assign({}, pr.v); P.floors = pr.fl; if (pr.rules) { P.rules = Object.assign({}, pr.rules); P.rulesEdited = true; } else { P.rulesEdited = false; P.rules = null; } regen(); if (pr.size) P.items.forEach(function (x) { if (!x.occ) { x.size = pr.size; delete x.area; } }); save(); make(); return; }
    if (ds.plact === "regen") { regen(); U.render(); return; }
    if (ds.plact === "rules-reset") { P.rulesEdited = false; P.rules = null; P.res = null; save(); U.render(); return; }
    if (ds.plact === "make") { make(); return; }
    if (ds.plfl) { var kv = ds.plfl.split(":"); P.sel[kv[0]] = +kv[1]; U.render(); return; }
    if (ds.plbuild != null) { build(+ds.plbuild); return; }
    if (ds.plrep != null) { report(+ds.plrep); return; }
    if (ds.plmv) { if (ds.plmv === "x" || !P.swap) { P.swap = null; U.render(); return; } var mv = ds.plmv.split(":"), o2 = P.res.opts.filter(function (x) { return x.id === P.swap.opt; })[0]; if (!o2) return;
      var err = PL.moveEdge(o2, P.swap.fi, P.swap.uid, mv[0], 0.15 * +mv[1]); if (err) { U.toast(err); return; } var cfg2 = cfgNow(); o2.sc = PL.score(T(), o2, cfg2); o2.chk = PL.checks(T(), o2, cfg2); o2.stats = PL.stats(T(), o2, cfg2); U.render(); return; }
  });
})();
