/* Design Studio — modules_extra7: PORTABLE SHELTER / GUMTI for mines (new module).
   A small heat-proof cabin (typ. 2.0 × 2.0 m, 2.8 m high) that is shifted round the mine by crane / Hydra on the four lifting hooks at
   the roof corners: MS tube frame on a channel base skid, insulated walls (MS / PPGI sheet + EPS thermocol or PUF + plywood lining),
   insulated roof with an optional second (ventilated) roof, plywood floor, door, windows, lights, fan and seating.
   Checks: heat gain through the shell (U-values from the layer build-up, sol-air temperatures, people, lights) and the AC size if
   cooled; weight; lifting (4-leg sling, lifting lug, corner post in tension, base skid carrying the floor while hanging); wind
   overturning / sliding when it stands loose (IS 875-3); ventilation and head-room (NBC 2016).
   DGMS (Tech) Circular (SOMA)/02 of 22-04-2026 on heat stress asks for readily accessible cool rest shelters, cool drinking water
   (10–15 °C) and first-aid arrangements. Rates are indicative market rates (Non-SOR) — confirm with local vendors before use. */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var C = DS.core, F = C.pyfmt;
  var M = DS.modules_extra7 = {};
  function CM() { return DS.common; } function DR() { return DS.drawing; }
  function row() { return CM().row.apply(null, arguments); } function Q() { return CM().Q.apply(null, arguments); }
  function num(v, d) { var x = Number(v); return isFinite(x) ? x : (d || 0); } function G(x) { return F(x, "g"); }
  var NS = "Non-SOR — indicative market rate, confirm";
  function P(key, label, def, unit, o) { if (unit && typeof unit === "object") { o = unit; unit = ""; } return C.Param(Object.assign({ key: key, label: label, default: def, unit: unit || "", modes: ["design"] }, o || {})); }

  /* ---------- build-ups: layers [name, thickness mm, conductivity W/mK, kg/m², rate ₹/m²] ---------- */
  var WALLS = [
    { n: "MS sheet 1.6 mm outside + EPS thermocol 50 mm + 12 mm BWP plywood inside (laminate finish)", L: [["MS sheet 1.6 mm", 1.6, 50, 12.6, 0], ["EPS thermocol 50 mm (15 kg/m³)", 50, 0.036, 0.8, 320], ["BWP plywood 12 mm + 1 mm laminate", 13, 0.13, 8.5, 1150]], outer: "MS sheet 1.6 mm (16 G)", key: "ms_eps" },
    { n: "PUF sandwich panel 50 mm (0.5 mm PPGI both faces)", L: [["PUF sandwich panel 50 mm, PPGI 0.5 both faces", 50, 0.022, 10.5, 1350]], outer: null, key: "puf" },
    { n: "PUF sandwich panel 50 mm + 9 mm plywood lining inside", L: [["PUF sandwich panel 50 mm, PPGI 0.5 both faces", 50, 0.022, 10.5, 1350], ["BWP plywood 9 mm + 1 mm laminate lining", 10, 0.13, 6.5, 950]], outer: null, key: "puf_ply" },
    { n: "GI sheet 0.8 mm + glass wool 50 mm + 9 mm plywood inside", L: [["GI sheet 0.8 mm", 0.8, 50, 6.4, 0], ["Glass wool 50 mm (32 kg/m³) with vapour barrier", 50, 0.04, 1.6, 380], ["BWP plywood 9 mm + 1 mm laminate lining", 10, 0.13, 6.5, 950]], outer: "GI sheet 0.8 mm", key: "gi_gw" }
  ];
  var ROOFS = [
    { n: "Pyramid (hip) roof, 800 rise — PUF panel 50 mm on MS hip rafters, 300 overhang", L: [["PUF roof panel 50 mm on the slopes", 50, 0.022, 11, 1450]], dbl: false, pyr: true },
    { n: "PUF roof panel 50 mm + second GI sheet roof on purlins (150 mm ventilated gap)", L: [["PUF roof panel 50 mm", 50, 0.022, 11, 1450]], dbl: true },
    { n: "PUF roof panel 50 mm only", L: [["PUF roof panel 50 mm", 50, 0.022, 11, 1450]], dbl: false },
    { n: "MS sheet 2 mm + EPS 75 mm + 9 mm plywood ceiling + second GI sheet roof", L: [["MS sheet 2 mm (14 G)", 2, 50, 15.7, 0], ["EPS thermocol 75 mm", 75, 0.036, 1.2, 450], ["BWP plywood 9 mm ceiling", 9, 0.13, 5.5, 850]], dbl: true, ms: 2 }
  ];
  var FLOORS = [
    { n: "MS chequered plate 4 mm + 18 mm BWP plywood + vinyl sheet", ply: 18, chq: 4, vinyl: true, mat: false },
    { n: "18 mm marine plywood on MS joists + 6 mm rubber mat", ply: 18, chq: 0, vinyl: false, mat: true },
    { n: "MS chequered plate 5 mm only", ply: 0, chq: 5, vinyl: false, mat: false }
  ];
  var FRAMES = [
    { n: "SHS 40×40×2.6 posts and rings, ISMC 75 base skid", post: [40, 2.6, 2.93], skid: ["ISMC 75", 6.8] },
    { n: "SHS 50×50×2.9 posts and rings, ISMC 100 base skid", post: [50, 2.9, 4.11], skid: ["ISMC 100", 9.2] },
    { n: "SHS 72×72×3.2 posts and rings, ISMC 100 base skid (heavy duty)", post: [72, 3.2, 6.6], skid: ["ISMC 100", 9.2] }
  ];
  var HOOKS = ["4 hooks at the corners of the wall top (4-leg sling)", "1 hook at the roof apex (single-point lift)"];
  var SEATS = ["Plywood bench along two walls (450 high, 400 deep)", "Plywood bench along one wall + small table", "2 chairs + a small table", "None"];
  var FANS = ["Wall fan 400 mm", "Ceiling fan 900 mm", "Exhaust fan 300 mm", "None"];
  var PAINTS = ["Heat-reflective white outside (cool coat)", "Safety yellow walls, heat-reflective white roof", "Synthetic enamel (any colour)"];
  function pickN(list, v) { v = String(v || ""); return list.filter(function (x) { return x.n === v; })[0] || list[0]; }

  function run_gumti(inp) {
    var c = new C.Calc("Portable shelter / gumti for mines");
    var L = num(inp.L, 2), W = num(inp.W, 2), H = num(inp.H, 2.8), nos = Math.max(1, Math.round(num(inp.nos, 1)));
    var wall = pickN(WALLS, inp.wall), roof = pickN(ROOFS, inp.roof), flr = pickN(FLOORS, inp.floor), fr = pickN(FRAMES, inp.frame);
    var nWin = Math.max(0, Math.round(num(inp.windows, 3))), dW = /800/.test(String(inp.door)) ? 0.8 : 0.75, dH = 2.0, ww = num(inp.win_w, 1.2), wh = 0.6, wS = ww;
    var skidH = fr.skid[0] === "ISMC 75" ? 0.075 : 0.1, dbl = roof.dbl, pyr = !!roof.pyr, rise = pyr ? num(inp.rise, 0.8) : 0, ov = pyr ? 0.3 : 0, Hroof = pyr ? rise : dbl ? 0.25 : 0.06, flTh = (flr.ply + flr.chq + 50) / 1000, Hwall = H - skidH;
    var clearH = Hwall - flTh - (pyr ? 0 : 0.06), Afl = L * W, per = 2 * (L + W), apex = /apex/.test(String(inp.hook || ""));
    var Ra = (L + 2 * ov) * Math.sqrt(Math.pow((W + 2 * ov) / 2, 2) + rise * rise) + (W + 2 * ov) * Math.sqrt(Math.pow((L + 2 * ov) / 2, 2) + rise * rise), Aroof = pyr ? Ra : (L + 0.1) * (W + 0.1);
    c.section("Size");
    c.let("Outside size L × W, wall height (with skid)", "", F(L, ".2f") + " × " + F(W, ".2f") + ", " + F(H, ".2f") + (pyr ? " + roof rise " + F(rise, ".2f") + " = " + F(H + rise, ".2f") : " (top of roof " + F(H + Hroof, ".2f") + ")"), "m");
    c.check("Clear head-room inside", clearH, 2.4, { unit: "m", mode: ">=", clause: "NBC 2016 Part 3 (2.4 m for a cabin / store) — practice", note: "floor build-up " + G(Math.round(flTh * 1000)) + " mm, roof panel 60 mm" });
    var Aop = dW * dH + nWin * ww * wh, Awall = per * Hwall - Aop;
    c.check("Window area for light and air ≥ 1/10 of the floor", nWin * ww * wh, Afl / 10, { unit: "m²", mode: ">=", clause: "NBC 2016 Part 8 cl 4.2.1 (1/10 of floor area)" });

    /* ----- heat gain ----- */
    c.section("Heat — how much the shell keeps out");
    var Rsi = 0.13, Rso = 0.04, RL = function (Ls) { return Ls.reduce(function (a, l) { return a + l[1] / 1000 / l[2]; }, 0); };
    var Uw = c.calc("U-value of the wall: 1 / (Rsi + Σ t/k + Rso)", "Uw", "1/(Rsi + R + Rso)", "W/m²K", "IS 3792 / ECBC method", { Rsi: Rsi, R: Math.round(RL(wall.L) * 1000) / 1000, Rso: Rso });
    var Ur = c.calc("U-value of the roof", "Ur", "1/(Rsi + R + Rso)", "W/m²K", "IS 3792 / ECBC method", { Rsi: 0.10, R: Math.round(RL(roof.L) * 1000) / 1000, Rso: Rso });
    var To = num(inp.t_out, 45), Ti = num(inp.t_in, 30), refl = /reflective/.test(String(inp.paint)), dTr = (dbl ? 6 : pyr ? 16 : 22) * (refl ? 0.7 : 1), dTw = 8 * (refl && /white outside/.test(String(inp.paint)) ? 0.7 : 1);
    c.info("Outside design temperature " + G(To) + " °C, inside " + G(Ti) + " °C", "sol-air excess on the roof " + F(dTr, ".1f") + " K" + (dbl ? " (shaded by the second roof)" : pyr ? " (sloped roof, attic air below)" : "") + (refl ? ", reflective coat × 0.7" : "") + "; walls " + F(dTw, ".1f") + " K", "ASHRAE / ISHRAE practice [APPROX]");
    var nP = Math.max(1, Math.round(num(inp.persons, 4)));
    var Qw = Uw * Awall * (To - Ti + dTw), Qr = Ur * Aroof * (To - Ti + dTr), Qg = 5.8 * nWin * ww * wh * (To - Ti) + nWin * ww * wh * 0.6 * (inp.x_canopy ? 60 : 180), Qd = 2.5 * dW * dH * (To - Ti);
    var Qp = nP * 130, Ql = num(inp.lights, 2) * 20 + (inp.fan === "None" ? 0 : 60), Qinf = 0.33 * 1.0 * L * W * clearH * (To - Ti);
    var Qt = c.calc("Total heat gain (walls + roof + windows + door + people 130 W + lights / fan + air leakage 1 ACH)", "Q", "Qw + Qr + Qg + Qd + Qp + Ql + Qinf", "W", "ISHRAE practice", { Qw: Math.round(Qw), Qr: Math.round(Qr), Qg: Math.round(Qg), Qd: Math.round(Qd), Qp: Qp, Ql: Ql, Qinf: Math.round(Qinf) });
    var Ubare = 1 / (Rsi + Rso + 0.0001), Qbare = Ubare * (Awall * (To - Ti + 12) + Aroof * (To - Ti + 30)) + Qp + Ql;
    c.info("Same box in bare MS sheet (no insulation)", "≈ " + F(Qbare / 1000, ".1f") + " kW — the insulated shell keeps out about " + F(100 * (1 - Qt / Qbare), ".0f") + " % of that heat", "for comparison");
    var tr = Qt * 1.15 / 3517, acT = tr <= 0.8 ? 0.75 : tr <= 1.0 ? 1.0 : tr <= 1.5 ? 1.5 : 2.0;
    c.let("Cooling needed (+15 % margin) → split AC", "TR", F(tr, ".2f") + " TR → " + G(acT) + " ton", "", "1 TR = 3.517 kW");

    /* ----- weight ----- */
    c.section("Weight");
    var pw = fr.post[2], kgFrame = (4 * Hwall + 2 * per + 2 * dH + 2 * (dW + 0.1) + nWin * 2 * (ww + wh) + 2 * W + (pyr ? 4 * Math.sqrt(Math.pow(Math.hypot(L, W) / 2 + ov * 1.41, 2) + rise * rise) + 2 * (L + W + 4 * ov) : 0)) * pw;
    var skidKg = (2 * L + 3 * W) * fr.skid[1], kgWallM = wall.L.reduce(function (a, l) { return a + l[3]; }, 0), kgRoofM = roof.L.reduce(function (a, l) { return a + l[3]; }, 0) + (dbl ? 6.5 : 0);
    var kgFloorM = flr.chq * 7.85 + flr.ply * 0.6 + (flr.vinyl ? 2 : 0) + (flr.mat ? 7 : 0) + 6;
    var kgIn = (inp.seat === "None" ? 0 : /two walls/.test(String(inp.seat)) ? 45 : 35) + 25 + (inp.x_ac ? 45 : 0) + (inp.x_solar ? 70 : 0);
    var Wt = c.calc("Empty weight (frame + skid + walls + roof + floor + door / windows + fittings)", "Wt", "kgF + kgS + Aw*mw + Ar*mr + Af*mf + 60 + kgI", "kg", "", { kgF: Math.round(kgFrame), kgS: Math.round(skidKg), Aw: Math.round(Awall * 100) / 100, mw: Math.round(kgWallM * 10) / 10, Ar: Math.round(Aroof * 100) / 100, mr: Math.round(kgRoofM * 10) / 10, Af: Math.round(Afl * 100) / 100, mf: Math.round(kgFloorM * 10) / 10, kgI: kgIn });

    /* ----- lifting ----- */
    c.section(apex ? "Lifting on one hook at the roof apex" : "Lifting on the four hooks at the wall-top corners");
    var ang = num(inp.sling_ang, 60), DAF = 1.5, swl, T, tL = num(inp.lug_t, 12) + (apex ? 4 : 0), dh = apex ? 32 : 26, eL = apex ? 45 : 35, fu = 410;
    if (apex) {
      if (!pyr) c.warn("Apex hook needs the pyramid roof", "choose the pyramid roof, or use the four corner hooks", "");
      T = c.calc("Load on the apex hook (whole weight × dynamic factor 1.5)", "T", "DAF*Wt*9.81/1000", "kN", "lifting practice", { DAF: DAF, Wt: Math.round(Wt) });
      swl = Math.max(1, Math.ceil(T * 1000 / 9.81 / 500) * 0.5);
      c.info("Shackle / sling", "single sling or hook block SWL ≥ " + F(swl, ".1f") + " t; the cabin swings — use two tag lines", "IS 6132 / IS 2762");
      var hd = Math.hypot(L, W) / 2, th = Math.atan2(rise, hd), Th = c.calc("Tension in one hip rafter (4 hips meet at the apex hub)", "Th", "T/(4*sin(th))", "kN", "statics", { T: Math.round(T * 100) / 100, th: Math.round(th * 1000) / 1000 });
      var Ah = 4 * fr.post[0] * fr.post[1] - 4 * fr.post[1] * fr.post[1];
      c.check("Hip rafter SHS " + fr.post[0] + "×" + fr.post[0] + "×" + fr.post[1] + " in tension", Th, Ah * 310 / 1.1 / 1000, { unit: "kN", clause: "IS 800 cl 6.2" });
      var Hring = c.calc("Outward pull of the hips on the eave ring (taken by the top ring in tension)", "Hr", "Th*cos(th)/sqrt(2)", "kN", "statics", { Th: Math.round(Th * 100) / 100, th: Math.round(th * 1000) / 1000 });
      c.check("Eave ring in tension", Hring, Ah * 310 / 1.1 / 1000, { unit: "kN", clause: "IS 800 cl 6.2" });
      c.info("Apex hub", "16 mm hub plate with 4 hip rafters welded all round; lifting eye " + tL + " mm plate, hole Ø" + dh + ", 2 gussets", "practice");
    } else {
      T = c.calc("Force in one sling leg (only 2 of 4 legs assumed to carry, dynamic factor 1.5)", "T", "DAF*Wt*9.81/1000/(2*sin(a))", "kN", "lifting practice (BS EN 13155 / ASME B30.20 style)", { DAF: DAF, Wt: Math.round(Wt), a: ang * Math.PI / 180 });
      swl = Math.max(1, Math.ceil(T * 1000 / 9.81 / 500) * 0.5);
      c.info("Shackle / sling", "4-leg chain or wire-rope sling, each leg SWL ≥ " + F(swl, ".1f") + " t, legs at " + G(ang) + "° or steeper; bow shackles SWL ≥ " + F(swl, ".1f") + " t" + (pyr ? "; legs pass clear of the roof overhang (lugs stand out 150 beyond the eave)" : ""), "IS 6132 / IS 2762");
    }
    var Rb = c.calc("Lug plate " + G(tL) + " mm, hole Ø" + dh + ", " + eL + " mm steel beyond the hole: tear-out capacity", "Rt", "2*e*t*0.6*fu/1.25/1000", "kN", "IS 800 cl 10.3 / pin-plate practice", { e: eL, t: tL, fu: fu });
    c.check("Lug tear-out", T, Rb, { unit: "kN", clause: "IS 800" });
    var wl = apex ? 4 * 100 : 2 * 100, sw = 6, Rw = c.calc("Lug weld: " + (apex ? "4" : "2") + " × 100 mm fillet " + sw + " mm", "Rw", "Lw*0.7*s*fu/(sqrt(3)*1.25)/1000", "kN", "IS 800 cl 10.5.7", { Lw: wl, s: sw, fu: fu });
    c.check("Lug weld", T, Rw, { unit: "kN", clause: "IS 800 cl 10.5.7" });
    var Ap = 4 * fr.post[0] * fr.post[1] - 4 * fr.post[1] * fr.post[1];
    var Tp = apex ? c.calc("Tension in a corner post while hanging (walls + floor hang from the eave ring)", "Tp", "DAF*Wt*9.81/1000/4", "kN", "", { DAF: DAF, Wt: Math.round(Wt) }) : c.calc("Tension in a corner post while hanging (vertical part of the sling force)", "Tp", "T*sin(a)", "kN", "", { T: Math.round(T * 100) / 100, a: ang * Math.PI / 180 });
    var Tdg = c.calc("Post SHS " + fr.post[0] + "×" + fr.post[0] + "×" + fr.post[1] + " tension capacity (yield)", "Tdg", "A*fy/1.1/1000", "kN", "IS 800 cl 6.2", { A: Math.round(Ap), fy: 310 });
    c.check("Corner post in tension", Tp, Tdg, { unit: "kN", clause: "IS 800 cl 6.2" });
    var Zs = fr.skid[0] === "ISMC 75" ? 20.3e3 : 37.3e3, wfl = (kgFloorM * W / 2 + 0.5 * 150 * W / 2 / 2) * 9.81 / 1000 * DAF;
    var Ms = c.calc("Base skid (" + fr.skid[0] + ") carrying half the floor while hanging, span L between the corner posts", "Ms", "w*L**2/8", "kN·m", "", { w: Math.round(wfl * 1000) / 1000, L: L });
    c.check("Base skid bending", Ms, Zs * 250 / 1.1 / 1e6, { unit: "kN·m", clause: "IS 800 cl 8.2 (Ze·fy/γm0)" });
    c.info("Lifting rule", "Lift only empty (people out, loose things out); tag lines on two corners; test-load the lugs to 1.25 × the working load once after fabrication and stencil the SWL on the roof", "lifting practice");

    /* ----- wind ----- */
    c.section("Wind — standing loose on the bench / pedestals");
    var vb = num(inp.vb, 39), Vz = c.calc("Design wind speed (k1 1.0, k2 0.91 for 3 m in terrain 2, k3 1.0)", "Vz", "vb*1.0*0.91*1.0", "m/s", "IS 875-3:2015 cl 6.3", { vb: vb });
    var pz = 0.6 * Vz * Vz / 1000, Fw = c.calc("Wind force on the long face (Cf 1.3 for a box)", "Fw", "1.3*pz*Lf*H", "kN", "IS 875-3 Table 23 [APPROX]", { pz: Math.round(pz * 1000) / 1000, Lf: Math.max(L, W), H: H + Hroof * 0.5 });
    var Mo = Fw * (H + Hroof * 0.5) / 2, Mr = Wt * 9.81 / 1000 * Math.min(L, W) / 2;
    var fos = c.calc("Overturning: resisting (empty weight) / overturning", "FOS", "Mr/Mo", "", "IS 875 / practice — need 1.5", { Mr: Math.round(Mr * 100) / 100, Mo: Math.round(Mo * 100) / 100 });
    var tie = fos < 1.5 ? (1.5 * Mo - Mr) / Math.min(L, W) : 0;
    if (fos < 1.5) c.warn("Tie it down", "the empty gumti can overturn in a " + G(vb) + " m/s wind: tie the two windward skid ends down (chain + anchor / ground block) for " + F(tie, ".1f") + " kN each, or keep it on bolted pedestals", "IS 875-3");
    else c.ok("Stable against overturning when empty", true, { detail: "FOS " + F(fos, ".2f") + " ≥ 1.5" });
    var mu = 0.4, Ffr = mu * Wt * 9.81 / 1000 / 1.5; c.ok("Sliding: wind force " + F(Fw, ".2f") + " kN vs friction 0.4 × weight / 1.5 = " + F(Ffr, ".2f") + " kN", Fw <= Ffr, { detail: Fw <= Ffr ? "does not slide" : "can slide in a storm — bolt the skid to the pedestals or chain it to ground anchors (" + F((Fw - Ffr) / 2, ".1f") + " kN shear per side)", clause: "practice", warn_only: true });

    /* ----- quantities (per gumti × nos) ----- */
    var q = [], N = nos;
    q.push(Q("MS frame in SHS " + fr.post[0] + "×" + fr.post[0] + "×" + fr.post[1] + " (corner & door posts, top and bottom rings, window frames), cut, welded, primed", "kg", [row("Frame members ≈ " + F(kgFrame / pw, ".1f") + " m × " + G(pw) + " kg/m", N, kgFrame)], null, 95, NS));
    q.push(Q("Base skid " + fr.skid[0] + " (2 runners + 3 cross members) with welded ends, primed", "kg", [row("Skid ≈ " + F(2 * L + 3 * W, ".1f") + " m × " + G(fr.skid[1]) + " kg/m", N, skidKg)], null, 90, NS));
    q.push(apex ? Q("Apex hub 16 mm with lifting eye " + G(tL) + " mm (hole Ø" + dh + "), 2 gussets, hip rafters welded all round, load-tested", "each", [row("Apex", N)], null, 1800, NS) : Q("Lifting lug " + G(tL) + " mm plate with Ø" + dh + " hole at each wall-top corner, welded to the corner post with 6 mm fillet both sides, load-tested", "each", [row("Four corners", N * 4)], null, 650, NS));
    wall.L.forEach(function (l) { if (l[4]) q.push(Q("Walls — " + l[0], "sqm", [row("Four walls less door / windows", N, Awall)], null, l[4], NS)); });
    if (wall.outer) q.push(Q("Walls — outer " + wall.outer + " welded / riveted to the frame, joints sealed", "kg", [row("Outer skin " + F(Awall, ".2f") + " m² × " + G(wall.L[0][3]) + " kg/m²", N, Awall * wall.L[0][3])], null, 85, NS));
    roof.L.forEach(function (l) { if (l[4]) q.push(Q("Roof — " + l[0], "sqm", [row(pyr ? "Four slopes of the pyramid roof incl. 300 overhang" : "Roof " + F(L + 0.1, ".2f") + " × " + F(W + 0.1, ".2f"), N, Aroof)], null, l[4], NS)); });
    if (roof.ms) q.push(Q("Roof — MS sheet " + roof.ms + " mm, sloped 1:40 to the back, welded", "kg", [row("Roof sheet", N, (L + 0.1) * (W + 0.1) * roof.ms * 7.85)], null, 85, NS));
    if (pyr) { q.push(Q("Hip ridge capping and eave flashing, 0.5 mm pre-coated sheet", "m", [row("4 hips + eaves", N, 4 * Math.sqrt(Math.pow(Math.hypot(L + 2 * ov, W + 2 * ov) / 2, 2) + rise * rise) + 2 * (L + W + 4 * ov))], null, 220, NS)); q.push(Q("Ceiling under the pyramid roof: 9 mm plywood / PVC panel on MS grid (closes the attic, adds insulation)", "sqm", [row("Ceiling", N, L - 0.1, W - 0.1)], null, 900, NS)); }
    if (dbl) { q.push(Q("Second roof: 0.5 mm pre-coated GI profile sheet on SHS 40×40 purlins / stools, 150 mm ventilated gap, 300 mm overhang", "sqm", [row("Second roof", N, L + 0.6, W + 0.6)], null, 650, NS)); q.push(Q("Purlins / stools for the second roof, SHS 40×40×2.6", "kg", [row("3 purlins + 6 stools", N, (3 * (L + 0.6) + 6 * 0.15) * 2.93)], null, 95, NS)); }
    if (flr.chq) q.push(Q("Floor — MS chequered plate " + flr.chq + " mm on the skid with joists at 600", "kg", [row("Floor plate " + F(Afl, ".2f") + " m² × " + F(flr.chq * 7.85 + 2, ".1f") + " kg/m²", N, Afl * (flr.chq * 7.85 + 2))], null, 88, NS));
    if (flr.ply) q.push(Q("Floor — " + flr.ply + " mm BWP / marine plywood screwed down", "sqm", [row("Floor", N, L - 0.1, W - 0.1)], null, 1650, NS));
    if (flr.vinyl) q.push(Q("Floor — vinyl sheet 1.5 mm, coved 100 mm up the walls", "sqm", [row("Floor", N, L - 0.1, W - 0.1)], null, 420, NS));
    if (flr.mat) q.push(Q("Floor — 6 mm rubber mat (anti-slip)", "sqm", [row("Floor", N, L - 0.1, W - 0.1)], null, 650, NS));
    q.push(Q("Door " + G(dW * 1000) + " × 2000, MS frame, PUF-filled insulated shutter, 3 hinges, tower bolt, lock & handle" + (/closer/.test(String(inp.door)) ? ", hydraulic door closer" : ""), "each", [row("Door", N)], null, /closer/.test(String(inp.door)) ? 12500 : 9500, NS));
    if (nWin) q.push(Q("Window " + G(ww * 1000) + " × 600 two-track sliding aluminium with 5 mm toughened glass, mosquito mesh and MS grill (12 mm bars @ 100)", "each", [row("Windows", N * nWin)], null, ww >= 1.0 ? 6800 : 4800, NS));
    q.push(Q("Silicone sealing of all joints, aluminium beading inside at corners and ceiling", "m", [row("Corners + ceiling + openings", N, 4 * Hwall + 2 * per + 2 * (dW + dH) + nWin * 2 * (ww + wh))], null, 60, NS));
    q.push(Q("Painting outside — " + String(inp.paint || PAINTS[0]) + ", over primer", "sqm", [row("Walls + roof edge", N, per * Hwall + per * 0.15)], null, refl ? 190 : 140, NS));
    if (refl) q.push(Q("Heat-reflective (cool roof) coating on the roof, SRI ≥ 80", "sqm", [row("Roof", N, pyr ? Aroof : (L + (dbl ? 0.6 : 0.1)) * (W + (dbl ? 0.6 : 0.1)))], null, 220, NS));
    var benchL = /two walls/.test(String(inp.seat)) ? L + W - 0.9 : /one wall/.test(String(inp.seat)) ? Math.max(L, W) - 0.2 : 0;
    if (benchL) q.push(Q("Plywood bench 18 mm BWP with laminate, 450 high × 400 deep, on MS angle brackets (storage below)", "m", [row("Bench along the wall" + (benchL > Math.max(L, W) ? "s" : ""), N, benchL)], null, 3800, NS));
    if (/table/.test(String(inp.seat))) q.push(Q("Small table 600 × 450, plywood top on MS legs / wall-folding", "each", [row("Table", N)], null, 3500, NS));
    if (/chairs/.test(String(inp.seat))) q.push(Q("Plastic / moulded chairs with arms", "each", [row("Chairs", N * 2)], null, 900, NS));
    var nL = Math.max(0, Math.round(num(inp.lights, 2)));
    q.push(Q("Electrical: MCB DB 4-way with RCCB 30 mA, 2.5 / 1.5 sq mm FR wiring in conduit, industrial 3-pin inlet socket outside", "job", [row("Wiring of the cabin", N)], null, 6500, NS));
    if (nL) q.push(Q("LED batten 20 W (4 ft) with fitting", "each", [row("Lights", N * nL)], null, 650, NS));
    var nS = Math.max(0, Math.round(num(inp.sockets, 2))); if (nS) q.push(Q("Switch socket 6 / 16 A (mobile charging, kettle)", "each", [row("Sockets", N * nS)], null, 450, NS));
    if (inp.fan && inp.fan !== "None") q.push(Q(String(inp.fan) + " with regulator / switch", "each", [row("Fan", N)], null, /Ceiling/.test(inp.fan) ? 2600 : /Exhaust/.test(inp.fan) ? 1600 : 2400, NS));
    /* along with the gumti */
    var sum2 = [];
    if (inp.x_ac) { q.push(Q("Split AC " + G(acT) + " ton (5-star, inverter) with outdoor unit on an MS bracket, copper piping, drain pipe", "each", [row("AC", N)], null, acT <= 1 ? 32000 : acT <= 1.5 ? 38000 : 48000, NS)); sum2.push("split AC " + G(acT) + " T"); }
    if (inp.x_water) { q.push(Q("Drinking water: bottle-type water cooler / dispenser (hot & cold) with 20 L jar stand — DGMS asks for cool water 10–15 °C", "each", [row("Water dispenser", N)], null, 9500, NS)); sum2.push("water cooler"); }
    if (inp.x_first) { q.push(Q("First-aid box (as per Mines Rules) with ORS packets and a heat-stress chart", "each", [row("First-aid box", N)], null, 2500, NS)); sum2.push("first aid + ORS"); }
    if (inp.x_fire) { q.push(Q("Fire extinguisher ABC (MAP 90) 4 kg with bracket", "each", [row("Extinguisher", N)], null, 2200, NS)); sum2.push("fire extinguisher"); }
    if (inp.x_canopy) { q.push(Q("Sunshade / canopy 600 mm deep over the door and windows, MS frame with pre-coated sheet", "m", [row("Over door + windows", N, dW + 0.4 + nWin * (ww + 0.3))], null, 1400, NS)); sum2.push("sunshades"); }
    if (inp.x_solar) { q.push(Q("Off-grid solar: 2 × 540 Wp panels on the roof frame, 1.5 kVA solar inverter, 150 Ah tubular battery in a box", "set", [row("Solar set", N)], null, 62000, NS)); sum2.push("solar 1.08 kWp + battery"); }
    if (inp.x_earth) { q.push(Q("Earthing: GI pipe earth electrode with chamber, GI strip to the frame at two points", "set", [row("Earthing", N)], null, 5500, NS)); sum2.push("earthing"); }
    if (inp.x_pedestal) { q.push(Q("Pedestals: 4 PCC blocks 450 × 450 × 450 (M20) with a 12 mm plate and 2 anchor bolts for the skid", "cum", [row("4 pedestals", N * 4, 0.45, 0.45, 0.45)], null, 9000, NS)); sum2.push("4 pedestals"); }
    if (inp.x_sign) { q.push(Q("Signage: name / number plate, 'Rest shelter' sign, notice board 600 × 450 and SWL stencil on the roof", "set", [row("Signs", N)], null, 2800, NS)); sum2.push("signs + notice board"); }
    if (inp.x_gutter) { q.push(Q("Rain gutter on the low edge of the roof with a 75 mm down pipe", "m", [row("Gutter", N, L + 0.6)], null, 550, NS)); sum2.push("gutter"); }
    if (inp.x_transport) { q.push(Q("Loading, transport to the mine and placing by Hydra / crane", "trip", [row("Placing", N)], null, 6000, NS)); sum2.push("transport & placing"); }

    var seats = benchL ? Math.floor(benchL / 0.5) : /chairs/.test(String(inp.seat)) ? 2 : 0;
    var summary = { "Gumti": nos + " no. " + F(L, ".2f") + " × " + F(W, ".2f") + " m, walls " + F(H, ".2f") + " m" + (pyr ? " + pyramid roof " + F(rise, ".2f") + " m" : "") + " (clear inside " + F(clearH, ".2f") + " m)", "Frame": fr.n, "Walls": wall.n + " — U = " + F(Uw, ".2f") + " W/m²K", "Roof": roof.n + " — U = " + F(Ur, ".2f") + " W/m²K",
      "Floor": flr.n, "Door / windows": "door " + G(dW * 1000) + " × 2000 insulated, " + nWin + " windows " + G(ww * 1000) + " × 600 sliding", "Inside": nL + " LED battens, " + (inp.fan || "no fan") + ", " + nS + " sockets; " + (inp.seat || "no seats") + (seats ? " (" + seats + " seats)" : ""),
      "Heat gain": F(Qt / 1000, ".2f") + " kW (bare MS box ≈ " + F(Qbare / 1000, ".1f") + " kW) → " + G(acT) + " ton AC if cooled", "Weight": "≈ " + F(Wt, ".0f") + " kg empty", "Lifting": apex ? "1 lifting eye " + G(tL) + " mm at the roof apex, sling SWL ≥ " + F(swl, ".1f") + " t" : "4 lugs " + G(tL) + " mm at the wall-top corners, sling legs SWL ≥ " + F(swl, ".1f") + " t at " + G(ang) + "°",
      "Wind": fos < 1.5 ? "tie down — " + F(tie, ".1f") + " kN at each windward end" : "stable empty (FOS " + F(fos, ".2f") + ")", "Along with": sum2.join(", ") || "—" };
    var sheet = drawing(inp, L, W, H, Hwall, skidH, Hroof, dbl, dW, dH, nWin, ww, wall, roof, flr, fr, tL, benchL, summary, pyr, rise, ov, apex);
    var refs = ["DGMS (Tech) Circular (SOMA)/02, 22-04-2026 — heat stress: cool rest shelters, cool drinking water, first aid", "IS 875-3:2015 — wind", "IS 800:2007 — steel (lugs, welds, members)", "NBC 2016 Parts 3 & 8 — head-room, light and ventilation", "IS 3792 / ECBC 2017 — thermal transmittance (U-value)", "IS 2762 / IS 6132 — slings and shackles"];
    return C.DesignResult({ module: "mine_gumti", title: "Portable shelter / gumti for mines", inputs: inp, calc: c, summary: summary, drawings: [sheet], quantities: q, bbs: [], tables: {}, references: refs });
  }
  M.run_gumti = run_gumti;

  function drawing(inp, L, W, H, Hw, sk, Hr, dbl, dW, dH, nWin, ww, wall, roof, flr, fr, tL, benchL, S, pyr, rise, ov, apex) {
    var D_ = DR(), Lm = L * 1000, Wm = W * 1000, Hm = H * 1000, skm = sk * 1000, t = 80, wwm = ww * 1000, ovm = ov * 1000, rm = rise * 1000, sill = 1100;
    /* plan: door on the front wall near the right corner, windows on the other three walls (as in the usual gumti drawing) */
    var p = new D_.View("Plan");
    p.rect(0, 0, Lm, Wm, "OUTLINE"); p.rect(t, t, Lm - 2 * t, Wm - 2 * t, "THIN");
    if (pyr) { p.rect(-ovm, -ovm, Lm + 2 * ovm, Wm + 2 * ovm, "HIDDEN"); p.line(-ovm, -ovm, Lm + ovm, Wm + ovm, "HIDDEN"); p.line(Lm + ovm, -ovm, -ovm, Wm + ovm, "HIDDEN"); }
    var dx = Lm - 150 - dW * 1000; p.line(dx, 0, dx + dW * 1000, 0, "OUTLINE"); p.line(dx, t, dx, t + dW * 1000, "THIN"); p.line(dx, t + dW * 1000, dx + dW * 1000, t, "THIN"); p.text(dx + dW * 500, -300, "DOOR " + G(dW * 1000) + " × 2000", 1.8, { anchor: "middle" });
    var wins = [["back", Lm / 2 - wwm / 2, Wm - t, wwm, t], ["left", 0, Wm / 2 - wwm / 2, t, wwm], ["right", Lm - t, Wm / 2 - wwm / 2, t, wwm], ["front", 150, 0, wwm, t]].slice(0, nWin);
    wins.forEach(function (w) { p.rect(w[1], w[2], w[3], w[4], "STEEL", "steel"); });
    if (benchL) { p.rect(t, Wm - t - 400, Lm - 2 * t, 400, "THIN"); if (benchL > Math.max(L, W)) p.rect(t, t + 300, 400, Wm - 2 * t - 700, "THIN"); p.text(Lm / 2, Wm - t - 250, "BENCH 450 H", 1.6, { anchor: "middle" }); }
    [[0, 0], [Lm, 0], [Lm, Wm], [0, Wm]].forEach(function (q) { p.rect(q[0] - 25, q[1] - 25, 50, 50, "STEEL", "steel"); });
    p.dim(0, -700, Lm, -700, 6, G(Lm)); p.dim(-500 - ovm, 0, -500 - ovm, Wm, 6, G(Wm));
    p.text(Lm / 2, Wm / 2, "PORTABLE SHELTER (GUMTI)", 2.0, { anchor: "middle" });
    /* front elevation */
    var e = new D_.View("Front elevation"), zt = Hm;
    [0.1, 0.5, 0.9].forEach(function (f) { e.rect(Lm * f - 75, 0, 150, skm, "STEEL", "steel"); }); e.rect(0, skm, Lm, Hm - skm, "OUTLINE");
    if (pyr) { e.poly([[-ovm, zt], [Lm / 2, zt + rm], [Lm + ovm, zt]], false, "OUTLINE"); e.line(-ovm, zt, Lm + ovm, zt, "OUTLINE"); }
    else { e.rect(-30, zt, Lm + 60, 60, "OUTLINE"); if (dbl) { e.line(-300, zt + 220, Lm + 300, zt + 250, "STEEL"); } }
    e.rect(dx, skm + 60, dW * 1000, dH * 1000, "OUTLINE");
    if (wins.some(function (w) { return w[0] === "front"; })) { e.rect(150, skm + sill, wwm, 600, "STEEL"); e.line(150 + wwm / 2, skm + sill, 150 + wwm / 2, skm + sill + 600, "STEEL"); }
    if (inp.x_canopy) e.line(dx - 200, skm + 60 + dH * 1000 + 150, dx + dW * 1000 + 200, skm + 60 + dH * 1000 + 150, "STEEL");
    if (apex && pyr) { e.circle(Lm / 2, zt + rm + 110, 60, "STEEL"); e.text(Lm / 2 + 150, zt + rm + 150, "LIFTING EYE " + G(tL) + " mm AT THE APEX", 1.6); }
    else { [0, Lm].forEach(function (x) { e.circle(x + (x ? 120 : -120), zt + 80, 40, "STEEL"); }); e.text(-ovm, zt + rm + 300, "LIFTING LUG " + G(tL) + " mm AT EACH WALL-TOP CORNER", 1.6); }
    e.line(-500, 0, Lm + 500, 0, "SOIL"); e.dim(-400 - ovm, 0, -400 - ovm, Hm, 6, G(Hm)); if (pyr) e.dim(-400 - ovm, Hm, -400 - ovm, Hm + rm, 6, G(rm)); e.dim(0, -500, Lm, -500, 6, G(Lm));
    /* side elevation with the window */
    var sv = new D_.View("Side elevation");
    [0.1, 0.5, 0.9].forEach(function (f) { sv.rect(Wm * f - 40, 0, 80, skm, "STEEL", "steel"); }); sv.rect(0, skm, Wm, Hm - skm, "OUTLINE");
    if (pyr) sv.poly([[-ovm, zt], [Wm / 2, zt + rm], [Wm + ovm, zt]], true, "OUTLINE");
    sv.rect(Wm / 2 - wwm / 2, skm + sill, wwm, 600, "STEEL"); sv.line(Wm / 2, skm + sill, Wm / 2, skm + sill + 600, "STEEL"); sv.line(Wm / 2 - wwm / 2, skm + sill, Wm / 2, skm + sill + 600, "THIN"); sv.line(Wm / 2 - wwm / 2, skm + sill + 600, Wm / 2, skm + sill, "THIN");
    sv.dim(Wm / 2 - wwm / 2, skm + sill + 800, Wm / 2 + wwm / 2, skm + sill + 800, -4, G(wwm)); sv.line(-500, 0, Wm + 500, 0, "SOIL");
    /* wall build-up */
    var s = new D_.View("Wall build-up (outside → inside)"), x0 = 0, hh = 900;
    wall.L.forEach(function (l, k) { var w = Math.max(30, l[1] * 6); s.rect(x0, 0, w, hh, "OUTLINE", k === 0 ? "steel" : null); s.text(x0 + w / 2, hh + 120 + k * 220, l[0], 1.5); x0 += w + 10; });
    var notes = ["Frame " + fr.n + "; all joints fully welded, tube ends capped; zinc-rich primer + 2 coats.",
      "Walls: " + wall.n + ". Roof: " + roof.n + ". Floor: " + flr.n + ".",
      (apex ? "Lifting: one eye " + G(tL) + " mm on a 16 mm hub at the roof apex, 4 hip rafters welded all round; " : "Lifting: four lugs " + G(tL) + " mm (Ø26 holes) welded to the corner posts at the wall top, 6 mm fillet both sides; 4-leg sling at 60° or steeper; ") + "lift EMPTY; SWL stencilled; load-test to 1.25 × working load after fabrication.",
      "Electrical: DB with RCCB 30 mA, FR wiring in conduit, outdoor 3-pin industrial inlet; frame earthed at two points.",
      "Heat: " + S["Heat gain"] + ". DGMS circular (SOMA)/02 of 22-04-2026: cool rest shelter, drinking water 10–15 °C, first aid.",
      "Wind: " + S["Wind"] + "."];
    return new D_.Sheet("Portable shelter / gumti for mines", "MG-01", [p, e, sv, s], notes);
  }

  var GA = "Along with the gumti (साथ में)";
  var PARAMS = [
    P("L", "Length (outside)", 2.0, "m", { min: 1.5, max: 6.0, step: 0.1, group: "Size" }),
    P("W", "Width (outside)", 2.0, "m", { min: 1.5, max: 3.0, step: 0.1, group: "Size" }),
    P("H", "Wall height (bottom of skid to the eave)", 2.8, "m", { min: 2.4, max: 3.3, step: 0.05, group: "Size" }),
    P("rise", "Pyramid roof rise", 0.8, "m", { min: 0.3, max: 1.2, step: 0.05, group: "Size", help: "only for the pyramid roof" }),
    P("nos", "How many gumtis", 1, "nos", { min: 1, max: 50, step: 1, group: "Size" }),
    P("persons", "Persons resting inside at a time", 4, "nos", { min: 1, max: 10, step: 1, group: "Size" }),
    P("frame", "Frame and base skid", FRAMES[0].n, { kind: "select", options: FRAMES.map(function (x) { return x.n; }), group: "Build-up" }),
    P("wall", "Walls (heat-proof)", WALLS[0].n, { kind: "select", options: WALLS.map(function (x) { return x.n; }), group: "Build-up" }),
    P("roof", "Roof", ROOFS[0].n, { kind: "select", options: ROOFS.map(function (x) { return x.n; }), group: "Build-up" }),
    P("floor", "Floor", FLOORS[0].n, { kind: "select", options: FLOORS.map(function (x) { return x.n; }), group: "Build-up" }),
    P("paint", "Outside paint", PAINTS[0], { kind: "select", options: PAINTS, group: "Build-up" }),
    P("door", "Door", "Insulated MS door 750 × 2000 with lock", { kind: "select", options: ["Insulated MS door 750 × 2000 with lock", "Insulated MS door 800 × 2000 with lock + hydraulic closer"], group: "Inside" }),
    P("windows", "Windows (sliding, with grill) — back, left, right, front", 3, "nos", { min: 0, max: 4, step: 1, group: "Inside" }),
    P("win_w", "Window width (height 600)", 1.2, "m", { kind: "select", options: [0.6, 0.9, 1.2], group: "Inside" }),
    P("lights", "LED battens 20 W", 2, "nos", { min: 0, max: 6, step: 1, group: "Inside" }),
    P("fan", "Fan", FANS[0], { kind: "select", options: FANS, group: "Inside" }),
    P("sockets", "Sockets (mobile charging etc.)", 2, "nos", { min: 0, max: 6, step: 1, group: "Inside" }),
    P("seat", "Seating", SEATS[0], { kind: "select", options: SEATS, group: "Inside" }),
    P("x_ac", "Split AC (size worked out from the heat gain)", false, { kind: "bool", group: GA }),
    P("x_water", "Drinking-water cooler / dispenser (DGMS: 10–15 °C water)", true, { kind: "bool", group: GA }),
    P("x_first", "First-aid box with ORS", true, { kind: "bool", group: GA }),
    P("x_fire", "Fire extinguisher ABC 4 kg", true, { kind: "bool", group: GA }),
    P("x_canopy", "Sunshades over the door and windows", true, { kind: "bool", group: GA }),
    P("x_solar", "Off-grid solar (2 panels + inverter + battery) — no power line needed", false, { kind: "bool", group: GA }),
    P("x_earth", "Earthing", true, { kind: "bool", group: GA }),
    P("x_pedestal", "4 concrete pedestals with anchor bolts (to sit on / tie down)", false, { kind: "bool", group: GA }),
    P("x_sign", "Signs, notice board and SWL stencil", true, { kind: "bool", group: GA }),
    P("x_gutter", "Rain gutter", false, { kind: "bool", group: GA }),
    P("x_transport", "Transport and placing by Hydra / crane", false, { kind: "bool", group: GA }),
    P("t_out", "Outside design temperature", 45, "°C", { min: 35, max: 50, step: 1, group: "Climate & lifting" }),
    P("t_in", "Inside temperature aimed at", 30, "°C", { min: 22, max: 32, step: 1, group: "Climate & lifting", help: "24–26 °C with an AC, about 30–32 °C with only a fan" }),
    P("vb", "Basic wind speed Vb", 39, "m/s", { kind: "select", options: [33, 39, 44, 47, 50], group: "Climate & lifting", help: "IS 875-3 Annex A — Korba / Bilaspur / Raigarh: 39 m/s (verify)" }),
    P("hook", "Lifting hooks", HOOKS[0], { kind: "select", options: HOOKS, group: "Climate & lifting" }),
    P("sling_ang", "Sling leg angle from horizontal", 60, "°", { kind: "select", options: [45, 60, 75], group: "Climate & lifting" }),
    P("lug_t", "Lifting lug plate thickness", 12, "mm", { kind: "select", options: [10, 12, 16], group: "Climate & lifting" })
  ];
  M.PARAMS = PARAMS;
  C.register({ id: "mine_gumti", phase: 2, category: "Steel structures", name: "Portable shelter / gumti for mines (heat-proof, liftable)", icon: "🏠",
    description: "Small heat-proof rest cabin (typ. 2 × 2 m, 2.8 m walls, 0.8 m pyramid roof) shifted round the mine by crane / Hydra on its hooks (four at the wall-top corners or one at the roof apex): MS tube frame on a channel skid, MS / PPGI sheet with EPS thermocol or PUF and plywood lining, pyramid roof in PUF panels (or a flat roof with a second ventilated roof), plywood floor, insulated door, windows, LED lights, fan, sockets and plywood bench. " +
      "Heat gain and AC size from the wall / roof U-values, weight, lifting lugs, sling and post checks, wind overturning (IS 875-3), head-room and ventilation (NBC); options — AC, water cooler, first aid, extinguisher, sunshades, solar, earthing, pedestals, signs; full material list with rates and drawing.",
    params: PARAMS, run: run_gumti, references: ["DGMS (Tech) Circular (SOMA)/02 of 2026", "IS 875-3:2015", "IS 800:2007", "NBC 2016", "IS 3792"], modes: ["design"] });
})();
