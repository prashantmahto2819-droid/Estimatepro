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
