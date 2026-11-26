/* Building Planner — budget first: "I have ₹ X" → what can be built on this plot.
   Rough cost = built-up area × rate × style factor (land, approvals and furnishing not included). */
(function () {
  var EP = window.EP = window.EP || {}, PL = EP.plan = EP.plan || {};
  /* the design style moves the rate: plain finishes cost less, tiles / domes / cladding more */
  PL.STYLE_RATE = { economy: 0.85, public: 0.95, traditional: 1.0, modern: 1.0, colonial: 1.08, kerala: 1.1, contemporary: 1.12, domed: 1.15 };
  PL.styleFactor = function (des) { return (des && PL.STYLE_RATE[des.style]) || 1; };

  /* tries the usual sizes for this building type and keeps those within the budget and the plot's rules.
     o: { type, plot, rules, rate, factor, budget (₹), facing } → { rows: [{ v, floors, built, cost, label, beds }], area, note } */
  PL.budgetPlan = function (o) {
    var T = PL.TYPES[o.type], rate = o.rate * (o.factor || 1), area = o.budget / rate, rows = [];
    var gen = function (v, floors, compact) { try { var its = T.program(v, floors).filter(function (x) { return !x.off && !(compact && /^(dining|store|pooja|utility)$/.test(x.key)); }); var r = PL.generate({ type: o.type, items: its, plot: o.plot, rules: o.rules, floors: floors, facing: o.facing || "E", vastu: false, rate: 0 });
      if (!r || r.err || !r.opts || !r.opts.length) return null; if ((r.warn || []).some(function (w) { return /^(FAR|Height|Ground coverage|The rooms)/.test(w); })) return null;
      var built = r.opts[0].stats ? r.opts[0].stats.built : r.info.built; return { built: built, cost: built * rate, nF: r.info.nF }; } catch (e) { return null; } };
    var base = {}; T.inputs.forEach(function (i) { base[i.k] = i.def; });
    if (o.type === "house") {
      for (var b = 1; b <= 5; b++) for (var f = 1; f <= 3; f++) { if (f * T.h / 1000 > (o.rules.h || 15)) continue;
        [false, true].forEach(function (cp) { var v = Object.assign({}, base, { beds: b, attached: Math.max(1, b - 1), persons: b + 2, cars: b >= 3 && !cp ? 1 : 0, kitchenOpen: cp ? 1 : 0 }), g = gen(v, f, cp); if (!g || g.cost > o.budget * 1.05) return;
          rows.push({ v: v, compact: cp, floors: f, built: g.built, cost: g.cost, beds: b, label: b + " BHK, " + (f === 1 ? "ground floor only" : "G+" + (f - 1)) + (v.cars ? ", car parking" : "") + (cp ? " — compact (kitchen with dining, no separate store / pooja / utility)" : "") + (g.cost > o.budget ? " — a little over" : "") }); }); }
      /* best use of the money first: more bed rooms, then fewer floors (cheaper to build and to climb) */
      rows.sort(function (a, b) { return b.beds - a.beds || (a.compact ? 1 : 0) - (b.compact ? 1 : 0) || a.floors - b.floors || b.cost - a.cost; });
      var seen = {}; rows = rows.filter(function (r) { if (seen[r.beds]) return false; seen[r.beds] = 1; return true; }).slice(0, 4);
    } else if (o.type === "apartment") {
      [1, 2, 3].forEach(function (bhk) { var v = Object.assign({}, base, { bhk: bhk }), lo = 2, hi = 60, best = null;
        while (lo <= hi) { var m = (lo + hi) >> 1; v.flats = m; var g = gen(v, 0); if (g && g.cost <= o.budget * 1.03) { best = { n: m, g: g }; lo = m + 1; } else hi = m - 1; }
        if (best) rows.push({ v: Object.assign({}, v, { flats: best.n }), floors: 0, built: best.g.built, cost: best.g.cost, beds: bhk, label: best.n + " flats of " + bhk + " BHK, " + best.g.nF + " storeys" }); });
    } else {
      /* other buildings: scale the usual program down / up until it fits the money */
      var g0 = gen(base, 0); if (g0) rows.push({ v: base, floors: 0, built: g0.built, cost: g0.cost, label: "Usual size for a " + T.n.toLowerCase() + " (" + g0.nF + " storeys)" });
    }
    var note = "₹" + fmt(o.budget) + " at about ₹" + fmt(rate) + " per m² builds about " + Math.round(area) + " m² (" + Math.round(area * 10.764) + " sq ft) of floor area.";
    return { rows: rows, area: area, rate: rate, note: note };
  };
  function fmt(n) { n = Math.round(n); if (n >= 1e7) return (n / 1e7).toFixed(2).replace(/\.?0+$/, "") + " crore"; if (n >= 1e5) return (n / 1e5).toFixed(2).replace(/\.?0+$/, "") + " lakh"; return n.toLocaleString("en-IN"); }
  PL.fmtRs = fmt;
})();

/* construction programme (weeks) and payment stages for a planned building — typical Indian RCC-frame practice:
   a floor's frame (columns, beams, slab with 14 days' curing) takes about 3–4 weeks; walls follow each slab; finishes run floor by floor.
   Durations grow with the floor area (√ of footprint / 100 m²). */
(function () {
  var PL = window.EP.plan;
  PL.schedule = function (o, cost) {
    var nF = o.floors.length, foot = PL.footArea(o), k = Math.max(0.8, Math.min(2.5, Math.sqrt(foot / 100))), fin = Math.pow(nF, 0.7), st = [], r1 = function (v) { return Math.max(1, Math.round(v)); };
    var add = function (n, hi, start, wk, share, grp) { var s = { n: n, hi: hi, start: Math.round(start), wk: r1(wk), share: share, grp: grp }; st.push(s); return s.start + s.wk; };
    var t = add("Site set-out and excavation", "लेआउट और खुदाई", 0, 1 * k, 3, "found");
    t = add("Foundation and plinth (PCC, footings, plinth beam, DPC, filling)", "नींव और प्लिंथ", t, 4 * k, 14, "found");
    var plinth = t, slabEnd = [], wallsEnd = 0;
    for (var f = 0; f < nF; f++) { var fe = add((f === 0 ? "Ground" : "Floor " + f) + " — columns, beams, slab + curing", (f === 0 ? "ग्राउंड" : f + "वीं मंज़िल") + " — कॉलम, बीम, छत", t, 4 * k, 24 / nF, "frame"); slabEnd.push(fe);
      wallsEnd = add((f === 0 ? "Ground" : "Floor " + f) + " — brick walls, lintels", (f === 0 ? "ग्राउंड" : f + "वीं मंज़िल") + " — ईंट की दीवार, लिंटल", fe, 3 * k, 12 / nF, "walls"); t = fe; }
    var wp = add("Terrace waterproofing and parapet", "छत वॉटरप्रूफ़िंग और मुंडेर", t, 1, 2, "frame");
    var mep = add("Electrical and plumbing pipes (in walls and floors)", "बिजली और प्लंबिंग की पाइपें", Math.max(slabEnd[0] + 1, wallsEnd - 2 * k), 2 * k * Math.sqrt(nF), 10, "mep");
    var pl = add("Plaster — inside and outside", "प्लास्टर — अंदर और बाहर", Math.max(wallsEnd, mep - 1), 4 * k * fin, 8, "finish");
    var dw = add("Doors, windows and grills", "दरवाज़े, खिड़कियाँ, ग्रिल", pl - 2 * k, 2 * k, 8, "finish");
    var fl = add("Flooring, tiling and dado", "फ़र्श और टाइल", pl, 4 * k * fin, 11, "finish");
    var pt = add("Painting (putty, primer, two coats)", "पुताई / पेंट", Math.max(fl, dw), 3 * k * fin, 5, "finish");
    var end = add("Fittings, outside works, cleaning and handover", "फ़िटिंग, बाहरी काम, हैंडओवर", pt, 2 * k, 3, "finish");
    /* client's payments, each due when its stage is done */
    var pay = [["Agreement / start of work", "अनुबंध / काम शुरू", 0, 10], ["Plinth complete", "प्लिंथ पूरा", plinth, 15]];
    slabEnd.forEach(function (w, i) { pay.push([(i === nF - 1 ? "Top" : i === 0 ? "Ground floor" : "Floor " + i) + " roof slab cast", (i === 0 ? "ग्राउंड" : i + "वीं मंज़िल") + " की छत ढलाई", w, 30 / nF]); });
    pay.push(["Brick walls complete", "दीवारें पूरी", wallsEnd, 10], ["Plaster complete", "प्लास्टर पूरा", pl, 10], ["Flooring, doors and windows complete", "फ़र्श, दरवाज़े, खिड़कियाँ पूरी", Math.max(fl, dw), 15], ["Handover", "हैंडओवर", end, 10]);
    pay = pay.map(function (p) { return { n: p[0], hi: p[1], wk: Math.round(p[2]), pct: p[3], amt: cost * p[3] / 100 }; });
    return { stages: st, weeks: end, months: Math.round(end / 4.33 * 10) / 10, pay: pay };
  };
  /* the programme as HTML (bars by week) for the report and the proposal */
  PL.scheduleHTML = function (S, cost, opts) {
    opts = opts || {}; var W = S.weeks, col = { found: "#8d6e63", frame: "#1565c0", walls: "#ef6c00", mep: "#6a1b9a", finish: "#2e7d32" };
    var rows = S.stages.map(function (s) { return "<tr><td class='l'>" + s.n + (opts.hi ? "<br><small>" + s.hi + "</small>" : "") + "</td><td>" + (s.start + 1) + "–" + (s.start + s.wk) + "</td><td style='width:45%'><div style='position:relative;height:10px;background:#eee'><div style='position:absolute;left:" + (s.start / W * 100).toFixed(1) + "%;width:" + Math.max(1, s.wk / W * 100).toFixed(1) + "%;top:0;bottom:0;background:" + col[s.grp] + "'></div></div></td>" + (opts.money ? "<td>" + Math.round(s.share) + " %</td>" : "") + "</tr>"; }).join("");
    return "<table><tr><th>Work</th><th>Weeks</th><th>Programme — " + W + " weeks ≈ " + S.months + " months</th>" + (opts.money ? "<th>Share</th>" : "") + "</tr>" + rows + "</table>";
  };
  PL.payHTML = function (S, opts) {
    opts = opts || {}; return "<table><tr><th>#</th><th>Stage</th><th>Due about week</th><th>%</th><th>Amount ₹</th></tr>" + S.pay.map(function (p, i) { return "<tr><td>" + (i + 1) + "</td><td class='l'>" + p.n + (opts.hi ? " <small>(" + p.hi + ")</small>" : "") + "</td><td>" + p.wk + "</td><td>" + (Math.round(p.pct * 10) / 10) + "</td><td>" + Math.round(p.amt).toLocaleString("en-IN") + "</td></tr>"; }).join("") + "</table>";
  };
})();
