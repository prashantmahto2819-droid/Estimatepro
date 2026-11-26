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
    var gen = function (v, floors, compact) { try { var its = T.program(v, floors).filter(function (x) { return !x.off && !(compact && /^(dining|store|pooja|utility)$/.test(x.key)); }); var r = PL.generate({ type: o.type, items: its, plot: o.plot, rules: o.rules, plotArea: o.plotArea, floors: floors, facing: o.facing || "E", vastu: false, rate: 0 });
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

/* building in phases: the whole design (foundation, columns and stair sized for every floor) now, only some floors built now.
   Split of the rough cost by the programme shares: foundation in full now, the frame / walls / finishes of the floors built now,
   a temporary roof waterproofing now and again later, about 3 % more for coming back later (setting up again, joints, scaffolding). */
(function () {
  var PL = window.EP.plan;
  PL.phaseSplit = function (o, cost, now) {
    var n = o.floors.length; now = Math.max(1, Math.min(n, now | 0)); if (now >= n) return null;
    var perF = 24 + 12 + 10 + 8 + 8 + 11 + 5 + 3, p1 = 3 + 14 + perF * now / n + 2, p2 = perF * (n - now) / n + 2 + 3;
    return { now: now, n: n, c1: cost * p1 / 100, c2: cost * p2 / 100, extra: cost * 5 / 100,
      notes: ["Foundation, columns and stair are designed for " + (n === 1 ? "G" : "G+" + (n - 1)) + " now, so the upper floors need no strengthening later.",
        "Column bars are left 750 mm above the roof (lapping length), with a 75 mm M20 cover cap and bitumen paint against rust.",
        "The stair goes up to the roof now; a temporary roof waterproofing (and a parapet) is laid till the next phase.",
        "Keep the drawings, the soil report and the design: the upper floors are built to the same drawings."] };
  };
})();

/* walk-through: a camera path on the ground floor — from the gate to the main door, then room to room through the doors
   (living / hall rooms first, then dining, kitchen, bed rooms), going back the way it came; saved on layer A-CAMPATH so that
   3D → Tour walks it and ● Record makes the video */
(function () {
  var PL = window.EP.plan;
  PL.walkPath = function (d) {
    var E = d.ents, byId = {}; E.forEach(function (e) { byId[e.id] = e; });
    var rooms = E.filter(function (e) { return e.t === "room" && e.lvl === "L0" && e.pts && e.pts.length > 2; });
    var inPoly = function (p, P) { var c = false; for (var i = 0, j = P.length - 1; i < P.length; j = i++) { if ((P[i][1] > p[1]) !== (P[j][1] > p[1]) && p[0] < (P[j][0] - P[i][0]) * (p[1] - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; } return c; };
    var cen = function (P) { var x = 0, y = 0; P.forEach(function (q) { x += q[0]; y += q[1]; }); return [x / P.length, y / P.length]; };
    var roomAt = function (p) { return rooms.filter(function (r) { return inPoly(p, r.pts); })[0] || null; };
    var doors = [], mainD = null;
    E.forEach(function (e) { if ((e.t !== "door" && e.t !== "opening") || e.lvl !== "L0" && byId[e.host] && byId[e.host].lvl !== "L0") return; var w = byId[e.host]; if (!w || w.t !== "wall" || w.lvl !== "L0" || w.site) return;
      var L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]); if (L < 1) return; var u = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L], n = [-u[1], u[0]], p = [w.a[0] + u[0] * e.at, w.a[1] + u[1] * e.at];
      var A = roomAt([p[0] + n[0] * 400, p[1] + n[1] * 400]), Bq = roomAt([p[0] - n[0] * 400, p[1] - n[1] * 400]), dd = { p: p, n: n, a: A, b: Bq, main: !!e.main };
      if (A !== Bq) doors.push(dd); if (e.main) mainD = dd; });
    if (!mainD) return null;
    /* rooms open to each other without a wall between them (living + dining, lobby + passage …) are connected too */
    var bb = function (P) { var xs = P.map(function (q) { return q[0]; }), ys = P.map(function (q) { return q[1]; }); return [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)]; };
    var walls = E.filter(function (e) { return e.t === "wall" && e.lvl === "L0" && !e.site; }), segD = function (p, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
    rooms.forEach(function (r1, i) { var A = bb(r1.pts); rooms.forEach(function (r2, j) { if (j <= i) return; var Bb = bb(r2.pts), m = null;
      var ox = Math.min(A[2], Bb[2]) - Math.max(A[0], Bb[0]), oy = Math.min(A[3], Bb[3]) - Math.max(A[1], Bb[1]);
      if (ox >= 900 && ((Bb[1] - A[3] >= 0 && Bb[1] - A[3] <= 350) || (A[1] - Bb[3] >= 0 && A[1] - Bb[3] <= 350))) { var y = Bb[1] >= A[3] ? (A[3] + Bb[1]) / 2 : (Bb[3] + A[1]) / 2; m = [(Math.max(A[0], Bb[0]) + Math.min(A[2], Bb[2])) / 2, y]; }
      else if (oy >= 900 && ((Bb[0] - A[2] >= 0 && Bb[0] - A[2] <= 350) || (A[0] - Bb[2] >= 0 && A[0] - Bb[2] <= 350))) { var x = Bb[0] >= A[2] ? (A[2] + Bb[0]) / 2 : (Bb[2] + A[0]) / 2; m = [x, (Math.max(A[1], Bb[1]) + Math.min(A[3], Bb[3])) / 2]; }
      if (m && !walls.some(function (w) { return segD(m, w.a, w.b) < 160; })) doors.push({ p: m, a: r1, b: r2 }); }); });
    var inside = mainD.a || mainD.b, outN = mainD.a ? [-mainD.n[0], -mainD.n[1]] : mainD.n, pts = [];
    var push = function (q) { var l = pts[pts.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 300) pts.push([Math.round(q[0]), Math.round(q[1]), 0]); };
    push([mainD.p[0] + outN[0] * 6000, mainD.p[1] + outN[1] * 6000]); push([mainD.p[0] + outN[0] * 800, mainD.p[1] + outN[1] * 800]); push(mainD.p);
    var rank = function (r) { var n = (r.name || "").toLowerCase(); return /living|drawing|hall|lobby|lounge|reception|foyer/.test(n) ? 0 : /dining/.test(n) ? 1 : /kitchen/.test(n) ? 2 : /master/.test(n) ? 3 : /bed|room/.test(n) ? 4 : /toilet|bath|wc|store|duct|utility|stair|wash|shaft|lift/.test(n) ? 9 : 5; };
    var seen = {}, count = 0;
    (function visit(r, from) { if (!r || seen[r.id] || count > 9) return; seen[r.id] = 1; count++; push(cen(r.pts));
      var nx = doors.filter(function (dd) { return (dd.a === r || dd.b === r) && dd !== from; }).map(function (dd) { return { d: dd, r: dd.a === r ? dd.b : dd.a }; }).filter(function (x) { return x.r && !seen[x.r.id] && rank(x.r) < 9; });
      nx.sort(function (x, y) { return rank(x.r) - rank(y.r); });
      nx.forEach(function (x) { if (seen[x.r.id] || count > 9) return; push(x.d.p); visit(x.r, x.d); push(x.d.p); push(cen(r.pts)); }); })(inside, mainD);
    return pts.length >= 3 ? pts : null;
  };
})();
