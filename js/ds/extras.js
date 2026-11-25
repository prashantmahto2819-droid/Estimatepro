/* Design Studio — "Along with the design": optional allied works that follow from a design, so the quantities of the whole job
   come out together (floor, kerb, drain, stands, lights, plinth protection …). Each entry adds a last input group to an existing
   module and appends its quantities (and a summary line) after the module has run. Loaded after all modules.
   CPWD DSR 2021 codes (16.91.1 / 16.91.2 paver, 16.78.2 GSB, 4.1.3 / 4.1.8 PCC, 11.3.1 CC flooring, 11.4 hardener floor,
   16.69 precast kerb, 4.17 plinth protection, 2.8.1 excavation); lights: DSR (E&M) 2022 1.10.3 point wiring, 1.35 fitting,
   1.14.1 circuit wiring. Fittings, stands and racks are non-SOR at indicative market rates — confirm before use. */
(function () {
  "use strict";
  var DS = window.DS; if (!DS || !DS.core) return;
  var C = DS.core;
  function CM() { return DS.common; } function row() { return CM().row.apply(null, arguments); } function Q() { return CM().Q.apply(null, arguments); }
  function num(v) { var x = Number(v); return isFinite(x) ? x : 0; } function CP() { return CM().CPWD; } var EM = "DSR_EM_2022";
  var GRP = "Along with the design (साथ के काम)";
  function P(key, label, def, unit, o) { if (unit && typeof unit === "object") { o = unit; unit = ""; } return C.Param(Object.assign({ key: key, label: label, default: def, unit: unit || "", group: GRP }, o || {})); }

  var FLOOR = ["None", "Paver block 60 mm (M35) on sand, GSB 100", "Paver block 80 mm (M30) on sand, GSB 150", "PCC 1:2:4, 100 mm", "CC flooring 40 mm (1:2:4) on PCC 1:4:8, 100 mm", "Hardener-topped floor 52 mm on PCC 1:4:8, 100 mm"];
  /* floor of A m² inside a W × L outline */
  function floor(kind, A, tag) {
    var q = [], ex = function (d) { q.push(Q("Earth work in excavation / levelling for the floor bed", "cum", [row(tag + " — floor area × " + d + " m", 1, A, d)], [CP(), "2.8.1"])); };
    if (/^Paver block 60/.test(kind)) { ex(0.21); q.push(Q("Granular sub-base, close graded (Grade II), 100 mm", "cum", [row(tag, 1, A, 0.10)], [CP(), "16.78.2"])); q.push(Q("Chamfered-edge CC paver block 60 mm M35, on 50 mm sand bed, joints filled", "sqm", [row(tag, 1, A)], [CP(), "16.91.1"])); }
    else if (/^Paver block 80/.test(kind)) { ex(0.28); q.push(Q("Granular sub-base, close graded (Grade II), 150 mm", "cum", [row(tag, 1, A, 0.15)], [CP(), "16.78.2"])); q.push(Q("Chamfered-edge CC paver block 80 mm M30, on 50 mm sand bed, joints filled", "sqm", [row(tag, 1, A)], [CP(), "16.91.2"])); }
    else if (/^PCC 1:2:4/.test(kind)) { ex(0.10); q.push(Q("PCC 1:2:4 floor 100 mm (finished smooth, panels with joints)", "cum", [row(tag, 1, A, 0.10)], [CP(), "4.1.3"])); }
    else if (/^CC flooring/.test(kind)) { ex(0.15); q.push(Q("PCC 1:4:8 base 100 mm", "cum", [row(tag, 1, A, 0.10)], [CP(), "4.1.8"])); q.push(Q("Cement concrete flooring 1:2:4, 40 mm, finished with a floating coat", "sqm", [row(tag, 1, A)], [CP(), "11.3.1"])); }
    else if (/^Hardener/.test(kind)) { ex(0.16); q.push(Q("PCC 1:4:8 base 100 mm", "cum", [row(tag, 1, A, 0.10)], [CP(), "4.1.8"])); q.push(Q("Cement concrete flooring 52 mm with concrete hardener topping", "sqm", [row(tag, 1, A)], [CP(), "11.4"])); }
    return q;
  }
  function lights(n, run, what, rate) {
    if (!n) return [];
    return [Q("Point wiring for the light points (" + what + ")", "point", [row("One per fitting", n)], [EM, "1.10.3"]),
      Q("Installation of the light fittings", "each", [row("Fittings", n)], [EM, "1.35"]),
      Q("Supply of LED fitting — " + what, "each", [row("Fittings", n)], null, rate, "Non-SOR — indicative market rate, confirm"),
      Q("Circuit wiring 2 × 1.5 + 1.5 sq mm from the DB to the first point", "metre", [row("Run", 1, run)], [EM, "1.14.1"])];
  }

  var EXTRA = {
    cycle_shed: {
      params: [P("x_floor", "Floor under the shed", FLOOR[1], { kind: "select", options: FLOOR.slice() }),
        P("x_kerb", "Precast kerb / edging round the floor (100 × 300)", true, { kind: "bool" }),
        P("x_drain", "PCC saucer drain along the open side (450 wide)", true, { kind: "bool" }),
        P("x_stand", "Two-wheeler stands / wheel stoppers", true, { kind: "bool" }),
        P("x_light", "LED lights under the roof (one per bay)", true, { kind: "bool" })],
      add: function (inp, res) {
        var W = num(inp.width), L = num(inp.length), A = W * L, nb = Math.max(1, Math.round(L / Math.max(num(inp.bay), 1))), q = [], sum = [];
        if (inp.x_floor && inp.x_floor !== "None") { q = q.concat(floor(String(inp.x_floor), A, "Floor " + W.toFixed(2) + " × " + L.toFixed(2))); sum.push(String(inp.x_floor).split(",")[0] + " " + A.toFixed(1) + " m²"); }
        if (inp.x_kerb) { q.push(Q("Precast CC kerb / edging 100 × 300 mm round the floor", "cum", [row("Perimeter", 1, 2 * (W + L), 0.10, 0.30)], [CP(), "16.69"])); sum.push("kerb " + (2 * (W + L)).toFixed(1) + " m"); }
        if (inp.x_drain) { q.push(Q("Earth work for the saucer drain", "cum", [row("Along the open side", 1, L + 1, 0.60, 0.15)], [CP(), "2.8.1"]), Q("PCC 1:2:4 saucer drain 450 wide × 75 thick", "cum", [row("Along the open side", 1, L + 1, 0.45, 0.075)], [CP(), "4.1.3"])); sum.push("drain " + (L + 1).toFixed(1) + " m"); }
        if (inp.x_stand) { var n2 = Math.floor(L / 0.9) * (W >= 4 ? 2 : 1); q.push(Q("Two-wheeler parking stand / wheel stopper (MS, painted, fixed to the floor)", "each", [row("One per vehicle at 0.9 m", n2)], null, 1500, "Non-SOR — indicative market rate, confirm")); sum.push(n2 + " stands"); }
        if (inp.x_light) { q = q.concat(lights(nb, L + 10, "LED batten 20 W, IP65", 900)); sum.push(nb + " LED lights"); }
        return { q: q, s: sum.join(", ") };
      }
    }
  };
  var SHED = {
    params: [P("x_floor", "Floor inside the shed", FLOOR[0], { kind: "select", options: FLOOR.slice() }),
      P("x_plinth", "Plinth protection round the shed (900 wide, CC 1:3:6, 50 mm)", false, { kind: "bool" }),
      P("x_light", "LED high-bay lights (about 1 per 50 m²)", false, { kind: "bool" })],
    dims: function (inp) { var span = num(inp.span), L = num(inp.length) || num(inp.bay) * Math.max(1, Math.round(num(inp.n_bays))); return [span, L]; },
    add: function (inp, res) {
      var d = SHED.dims(inp), W = d[0], L = d[1], A = W * L, q = [], sum = [];
      if (!(A > 0)) return { q: q, s: "" };
      if (inp.x_floor && inp.x_floor !== "None") { q = q.concat(floor(String(inp.x_floor), A, "Shed floor " + W.toFixed(2) + " × " + L.toFixed(2))); sum.push(String(inp.x_floor).split(",")[0] + " " + A.toFixed(0) + " m²"); }
      if (inp.x_plinth) { q.push(Q("Plinth protection 50 mm CC 1:3:6 on 75 mm brick ballast, 900 wide", "sqm", [row("Round the shed", 1, 2 * (W + L) + 4 * 0.9, 0.9)], [CP(), "4.17"])); sum.push("plinth protection " + (2 * (W + L)).toFixed(0) + " m"); }
      if (inp.x_light) { var n = Math.max(2, Math.ceil(A / 50)); q = q.concat(lights(n, L + W + 15, "LED high-bay 100 W", 6500)); sum.push(n + " high-bay lights"); }
      return { q: q, s: sum.join(", ") };
    }
  };
  ["steel_shed", "steel_portal", "steel_truss"].forEach(function (id) { EXTRA[id] = SHED; });
  EXTRA.boundary_wall = {
    params: [P("x_gate", "Main gate width (0 = no gate)", 4.0, "m", { min: 0, max: 10, step: 0.5 }),
      P("x_wicket", "Wicket gate 1.0 m beside the main gate", true, { kind: "bool" })],
    add: function (inp) {
      var H = num(inp.height), g = num(inp.x_gate), w = inp.x_wicket ? 1.0 : 0, q = [], A2 = (g + w) * H;
      if (!(A2 > 0)) return { q: q, s: "" };
      q.push(Q("MS gate in built-up / framed sections (≈ 30 kg/m² of gate), with hinges, tower bolts and locking arrangement", "kg", [row("Main gate " + g.toFixed(2) + " × " + H.toFixed(2) + " m", g > 0 ? 1 : 0, g, H, 30), row("Wicket gate 1.00 × " + H.toFixed(2) + " m", w ? 1 : 0, 1.0, H, 30)].filter(function (r) { return r.nos; }), [CP(), "10.25.2"]));
      q.push(Q("Painting the gates, synthetic enamel two coats over primer (both faces)", "sqm", [row("Gates", 2, g + w, H)], [CP(), "13.61.1"]));
      return { q: q, s: (g > 0 ? "main gate " + g.toFixed(1) + " m" : "") + (w ? (g > 0 ? " + " : "") + "wicket gate" : "") };
    }
  };

  Object.keys(EXTRA).forEach(function (id) {
    var spec = C.MODULES[id], X = EXTRA[id]; if (!spec || spec._extras) return;
    spec._extras = true; X.params.forEach(function (p) { spec.params.push(p); });
    var run0 = spec.run;
    spec.run = function (inp, mode) {
      var res = run0.apply(this, arguments);
      try { var a = X.add(inp, res, mode); if (a && a.q && a.q.length) { res.quantities = (res.quantities || []).concat(a.q); if (a.s && res.summary) res.summary["Along with the design"] = a.s; } }
      catch (e) { if (res && res.calc && res.calc.warn) res.calc.warn("Along with the design", "could not add the allied works: " + e.message, ""); }
      return res;
    };
  });
  DS.extras = { EXTRA: EXTRA, FLOOR: FLOOR };
})();
