/* Design Studio — common (port of civilest/design/common.py): indicative rates, quantity builders,
   BBS rows and standard drawing views (I-section, isolated footing, frame BMD, beam section). */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var C = DS.core, F = C.pyfmt;
  var M = DS.common = {};
  M.CPWD = "CPWD_DSR_2021"; M.MPPWD = "MPPWD_SOR_2017";
  M.RATE = {
    steel_struct: 110.0, steel_light: 115.0, rebar: 85.0, rcc_m25: 8900.0, rcc_m30: 9600.0, rcc_m35: 10200.0,
    shutter_found: 450.0, shutter_wall: 650.0, shutter_slab: 650.0, roof_sheet: 750.0, wall_sheet: 680.0, anchor_bolt: 150.0,
    grout: 18000.0, backfill: 650.0, filter_media: 1700.0, weep_hole: 250.0, bearing_elast: 1.2, wearing_coat: 650.0,
    crash_barrier: 6500.0, expansion_joint: 18000.0, hume_np4_900: 6500.0, hume_np4_1200: 9800.0
  };
  /* Q(description, unit, rows, link=null, rate=0, note="") — positional QtyItem like Python */
  M.Q = function (description, unit, rows, link, rate, note) { return C.QtyItem({ description: description, unit: unit, rows: rows, link: link || null, rate: rate || 0, note: note || "" }); };
  /* B(member, mark, dia, shape, nos, cut_length, note="") — positional BBSRow like Python */
  M.B = function (member, mark, dia, shape, nos, cut_length, note) { return C.BBSRow({ member: member, mark: mark, dia: dia, shape: shape, nos: nos, cut_length: cut_length, note: note || "" }); };
  M.rcc_rate = function (fck) { return fck >= 35 ? M.RATE.rcc_m35 : fck >= 30 ? M.RATE.rcc_m30 : M.RATE.rcc_m25; };
  M.kg_row = function (desc, nos, length, kg_per_m) {
    return { description: desc + " (Nos × L m × kg/m)", nos: nos, length: C.pyround(length, 3), breadth: C.pyround(kg_per_m, 3), depth: null };
  };
  /* row(desc, nos=null, length=null, breadth=null, depth=null, deduction=false) — or row(desc, {nos, length, …}) */
  M.row = function (desc, nos, length, breadth, depth, deduction) {
    if (nos && typeof nos === "object") { var o = nos; nos = o.nos; length = o.length; breadth = o.breadth; depth = o.depth; deduction = o.deduction; }
    var r = { description: desc, nos: nos == null ? null : nos, length: length == null ? null : C.pyround(length, 3),
      breadth: breadth == null ? null : C.pyround(breadth, 3), depth: depth == null ? null : C.pyround(depth, 3) };
    if (deduction) r.deduction = true;
    return r;
  };
  function kw(args, n, names, defs) { // positional + trailing options → array of values
    var a = [].slice.call(args), o = {};
    if (a.length > n && a[a.length - 1] && typeof a[a.length - 1] === "object" && !Array.isArray(a[a.length - 1])) o = a.pop();
    return names.map(function (nm, i) { var v = a[n + i]; if (nm in o) v = o[nm]; return v === undefined ? defs[i] : v; });
  }

  /* footing_bbs(name, n_footings, L, B, D_mm, bars, cover=50, mark_prefix="F")
     U-bars of the bottom mesh: run = side − 2c, legs = max(12d, 150) ≤ D − 2c, two 90° bends (DS.bbs) */
  M.footing_bbs = function (name, n_footings, L, B, D_mm, bars) {
    var k_ = kw(arguments, 6, ["cover", "mark_prefix"], [50.0, "F"]), cover = k_[0], mp = k_[1], out = [], BB = DS.bbs;
    [["L", L, B], ["B", B, L]].forEach(function (t, i) {
      var dirn = t[0], span = t[1], across = t[2], b = bars["bars_" + dirn];
      var n = BB.count(across * 1000, b.spacing, cover);
      var leg = Math.min(BB.leg(b.dia, BB.cfg.ftg_leg_min), D_mm - 2 * cover), an = b.anchor, why = "";
      if (an) {   // anchorage data from rcc.isolated_footing: leg = min(D − 2c, max(BBS minimum, Ld − (projection − 75)))
        leg = an.leg != null ? an.leg : Math.min(D_mm - 2 * cover, Math.ceil(Math.max(BB.leg(b.dia, BB.cfg.ftg_leg_min), an.Ld - (an.proj - 75)) / 5) * 5);
        why = "; leg = min(D − 2c, ⌈max(" + Math.round(BB.leg(b.dia, BB.cfg.ftg_leg_min)) + ", Ld " + Math.round(an.Ld) + " − (" + Math.round(an.proj) + " − 75))⌉5) = " + Math.round(leg) + " mm";
      }
      var o = BB.ubar(b.dia, span * 1000 - 2 * cover, leg);
      if (why) o.f += why;
      out.push(BB.row(name, mp + (i + 1), b.dia, "U (90° bends both ends)", n * n_footings, o, "bars along " + dirn + " @ " + F(b.spacing, "g") + " c/c"));
    });
    return out;
  };
  /* column_bbs(name, n_cols, height, n_bars, dia, tie_dia, tie_s, b, D, cover=40, lap_d=null, mark_prefix="C", starter=0, conf, fck=25, fy=500)
     main bars: storey height + lap (IS 456 cl 26.2.5.1, tension lap max(Ld, 30φ) – columns see reversal) [+ starter];
     ties: closed, 135° hooks (DS.bbs.stirrup); number with IS 13920 confining zones when given */
  M.column_bbs = function (name, n_cols, height, n_bars, dia, tie_dia, tie_s, b, D) {
    var k_ = kw(arguments, 9, ["cover", "lap_d", "mark_prefix", "starter", "conf", "fck", "fy"], [40.0, null, "C", 0.0, null, 25, 500]), cover = k_[0], lap_d = k_[1], mp = k_[2], starter = k_[3];
    var conf = k_[4], fck = k_[5], fy = k_[6], BB = DS.bbs;
    var lap = lap_d ? lap_d * dia : BB.lap(dia, fck, fy);
    var main = BB.stock({ cut: Math.round((height * 1000 + starter * 1000 + lap)) / 1000, f: "storey " + Math.round(height * 1000) + (starter ? " + starter " + Math.round(starter * 1000) : "") + " + lap " + Math.round(lap) + " (" + (lap_d ? lap_d + "d" : "max(Ld, 30d)") + ") = " + Math.round(height * 1000 + starter * 1000 + lap) + " mm" }, dia, fck, fy);
    var ties = conf && conf.s && DS.detailing ? DS.detailing.count_zoned(height * 1000, tie_s, conf.s, conf.lo, 2)
      : Math.floor(height * 1000 / tie_s) + 1;
    var tie = BB.stirrup(tie_dia, b, D, cover);
    return [BB.row(name, mp + "1", dia, "straight + lap", n_bars * n_cols, main, "lap " + Math.round(lap) + " mm"),
      BB.row(name, mp + "2", tie_dia, "closed tie, 135° hooks", ties * n_cols, tie, "@ " + F(tie_s, "g") + " c/c" +
        (conf && conf.s ? ", " + F(conf.s, "g") + " c/c over " + F(conf.lo, "g") + " at ends" : ""))];
  };
  /* footing_qty(title, n, L, B, D_mm, fck, depth_below_gl=1.5, pcc=0.10, pedestal=null, bbs=null, grade="Fe500") */
  M.footing_qty = function (title, n, L, B, D_mm, fck) {
    var k_ = kw(arguments, 6, ["depth_below_gl", "pcc", "pedestal", "bbs", "grade"], [1.5, 0.10, null, null, "Fe500"]), dgl = k_[0], pcc = k_[1], ped = k_[2], bbs = k_[3];
    var grade = /^Fe/.test(String(k_[4])) ? String(k_[4]).split(" ")[0] : "Fe" + F(Number(k_[4]), "g");
    var D = D_mm / 1000, work = 0.30, exc_depth = dgl + pcc, row = M.row;
    var q = [M.Q("Earth work in excavation for foundations, all kinds of soil", "cum", [row(title + " – pits", n, L + 2 * work, B + 2 * work, exc_depth)], [M.CPWD, "2.8.1"]),
      M.Q("PCC 1:4:8 below footings", "cum", [row(title + " – levelling course", n, L + 0.2, B + 0.2, pcc)], [M.CPWD, "4.1.8"]),
      M.Q("RCC M" + F(fck, "g") + " in footings & pedestals (excl. steel & shuttering)", "cum",
        [row(title + " – pads", n, L, B, D)].concat(ped ? [row(title + " – pedestals", n, ped[0], ped[1], ped[2])] : []), null, M.rcc_rate(fck)),
      M.Q("Centering & shuttering for foundations / pedestals", "sqm",
        [row(title + " – pad sides", n, 2 * (L + B), null, D)].concat(ped ? [row(title + " – pedestal sides", n, 2 * (ped[0] + ped[1]), null, ped[2])] : []), null, M.RATE.shutter_found)];
    var vol_struct = L * B * D + (ped ? ped[0] * ped[1] * Math.max(dgl - D, 0) : 0);
    var back = (L + 2 * work) * (B + 2 * work) * exc_depth - (L + 0.2) * (B + 0.2) * pcc - vol_struct;
    q.push(M.Q("Filling available excavated earth in trenches / pits", "cum", [row(title + " – backfill", n, back)], [M.CPWD, "2.25"]));
    if (bbs && bbs.length) q.push(M.Q("Reinforcement TMT " + grade + " – cutting, bending, placing", "kg",
      bbs.map(function (r) { return M.kg_row(r.member + " " + r.mark + " " + F(r.dia, "g") + "Ø", r.nos, r.cut_length, r.dia * r.dia / 162); }), null, M.RATE.rebar));
    return q;
  };
  /* footing_views(L, B, D_mm, col_b, col_D, bars, cover=50, depth_below_gl=1.5, pcc=0.10, pedestal_h=0, label="Footing") */
  M.footing_views = function (L, B, D_mm, col_b, col_D, bars) {
    var k_ = kw(arguments, 6, ["cover", "depth_below_gl", "pcc", "pedestal_h", "label"], [50.0, 1.5, 0.10, 0.0, "Footing"]);
    var cover = k_[0], dgl = k_[1], pcc = k_[2], pedestal_h = k_[3], label = k_[4], View = DS.drawing.View;
    var Lm = L * 1000, Bm = B * 1000, D = D_mm, bl = bars.bars_L, bb = bars.bars_B;
    var plan = new View(label + " – plan");
    plan.rect(0, 0, Lm, Bm, "OUTLINE");
    plan.rect((Lm - col_D) / 2, (Bm - col_b) / 2, col_D, col_b, "CONCRETE", "concrete");
    for (var k = 0; k < 5; k++) {
      var y = cover + (Bm - 2 * cover) * k / 4; plan.line(cover, y, Lm - cover, y, "REBAR");
      var x = cover + (Lm - 2 * cover) * k / 4; plan.line(x, cover, x, Bm - cover, "REBAR");
    }
    plan.text(Lm / 2, -0.12 * Bm, F(bl.dia, "g") + "Ø @ " + F(bl.spacing, "g") + " c/c (along L)", 2.4, { anchor: "middle" });
    plan.text(-0.06 * Lm, Bm / 2, F(bb.dia, "g") + "Ø @ " + F(bb.spacing, "g") + " c/c (along B)", 2.4, { anchor: "middle", rot: 90 });
    plan.dim(0, Bm, Lm, Bm, -8);
    plan.dim(Lm, 0, Lm, Bm, 8);
    var sec = new View(label + " – section"), gl = dgl * 1000;
    sec.rect(-100, -pcc * 1000, Lm + 200, pcc * 1000, "CONCRETE", "concrete");
    sec.rect(0, 0, Lm, D, "OUTLINE", "concrete");
    var ph = Math.max(gl - D, 0) + pedestal_h * 1000;
    sec.rect((Lm - col_D) / 2, D, col_D, ph, "OUTLINE", "concrete");
    sec.line(-0.25 * Lm, gl, Lm * 1.25, gl, "SOIL");
    sec.text(Lm * 1.25, gl + 60, "GL", 2.4, { anchor: "end" });
    var yb = cover + bl.dia / 2;
    sec.poly([[cover, D - cover], [cover, yb], [Lm - cover, yb], [Lm - cover, D - cover]], false, "REBAR");
    for (var j = 0; j < 9; j++) sec.bar_dot(cover + bb.dia + (Lm - 2 * cover - 2 * bb.dia) * j / 8, yb + bl.dia, bb.dia);
    sec.dim(0, 0, Lm, 0, 10);
    sec.dim(Lm, 0, Lm, D, 8);
    sec.dim(Lm + 0.12 * Lm, 0, Lm + 0.12 * Lm, gl, 12, F(gl, ",.0f") + " below GL");
    sec.text(-160, -pcc * 600, "PCC 1:4:8, " + F(pcc * 1000, ".0f") + " thk", 2.2, { anchor: "end" });
    return [plan, sec];
  };
  M.i_section_view = function (sec, title) {
    var v = new DS.drawing.View(title), h = sec.h, b = sec.b, tf = sec.tf, tw = sec.tw, pts;
    if (sec.family === "ISMC") pts = [[0, 0], [b, 0], [b, tf], [tw, tf], [tw, h - tf], [b, h - tf], [b, h], [0, h]];
    else { var x0 = (b - tw) / 2; pts = [[0, 0], [b, 0], [b, tf], [x0 + tw, tf], [x0 + tw, h - tf], [b, h - tf], [b, h], [0, h], [0, h - tf], [x0, h - tf], [x0, tf], [0, tf]]; }
    v.poly(pts, true, "STEEL", "steel");
    v.dim(0, h, b, h, -6);
    v.dim(b, 0, b, h, -6);
    v.text(b / 2, -0.25 * h, sec.name, 2.6, { anchor: "middle" });
    v.text(b / 2, -0.38 * h, F(sec.w, ".1f") + " kg/m", 2.2, { anchor: "middle" });
    return v;
  };
  /* frame_bmd_view(frame, result, title, scale_mm=null, labels=true, member_ids=null) */
  M.frame_bmd_view = function (frame, result, title) {
    var k_ = kw(arguments, 3, ["scale_mm", "labels", "member_ids"], [null, true, null]), scale_mm = k_[0], labels = k_[1], member_ids = k_[2];
    var v = new DS.drawing.View(title);
    var ids = member_ids != null ? member_ids : C.range(frame.members.length);
    var allM = []; ids.forEach(function (m) { result.diagram(m, 15).forEach(function (r) { allM.push(Math.abs(r[3])); }); });
    var mmax = allM.length ? Math.max.apply(null, allM) : 1.0;
    var xs = frame.nodes.map(function (p) { return p[0]; }), ys = frame.nodes.map(function (p) { return p[1]; });
    var span = Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, ys) - Math.min.apply(null, ys), 1.0);
    var off = scale_mm || (0.12 * span * 1000);
    ids.forEach(function (m) {
      var mem = frame.members[m], p1 = frame.nodes[mem.i], p2 = frame.nodes[mem.j], x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1];
      v.line(x1 * 1000, y1 * 1000, x2 * 1000, y2 * 1000, "OUTLINE");
      var g = frame.geom(mem), c = g[1], s = g[2], nyx = -s, nyy = c;
      var d = result.diagram(m, 15), pts = [[x1 * 1000, y1 * 1000]];
      d.forEach(function (r) { var x = r[0], Mv = r[3], px = (x1 + c * x) * 1000, py = (y1 + s * x) * 1000, k = -Mv / mmax * off; pts.push([px + nyx * k, py + nyy * k]); });
      pts.push([x2 * 1000, y2 * 1000]);
      v.poly(pts, true, "DIAGRAM", "diagram+");
      if (labels) [d[0], d[Math.floor(d.length / 2)], d[d.length - 1]].forEach(function (r) {
        var x = r[0], Mv = r[3];
        if (Math.abs(Mv) > 0.05 * mmax) { var px = (x1 + c * x) * 1000, py = (y1 + s * x) * 1000, k = -Mv / mmax * off * 1.25; v.text(px + nyx * k, py + nyy * k, F(Mv, ".1f"), 2.0, "DIAGRAM", "middle"); }
      });
    });
    return v;
  };
  /* stirrup_section_view(b, D, cover, top=[n,dia], bot=[n,dia], stirrup=[legs,dia,s], title, flange=null) */
  M.stirrup_section_view = function (b, D, cover, top, bot, stirrup, title, flange) {
    if (flange && !Array.isArray(flange) && typeof flange === "object") flange = flange.flange;
    var v = new DS.drawing.View(title);
    if (flange) { var bf = flange[0], Df = flange[1]; v.poly([[-(bf - b) / 2, D], [b + (bf - b) / 2, D], [b + (bf - b) / 2, D - Df], [b, D - Df], [b, 0], [0, 0], [0, D - Df], [-(bf - b) / 2, D - Df]], true, "OUTLINE", "concrete"); }
    else v.rect(0, 0, b, D, "OUTLINE", "concrete");
    var sd = stirrup[1];
    v.rect(cover, cover, b - 2 * cover, D - 2 * cover, "REBAR");
    [[bot, cover + sd + bot[1] / 2], [top, D - cover - sd - top[1] / 2]].forEach(function (t) {
      var n = t[0][0], dia = t[0][1], y = t[1]; if (!n) return;
      var n_ = Math.trunc(n);
      for (var k = 0; k < n_; k++) { var x = cover + sd + dia / 2 + (b - 2 * cover - 2 * sd - dia) * (n_ > 1 ? k / (n_ - 1) : 0.5); v.bar_dot(x, y, dia); }
    });
    v.dim(0, 0, b, 0, 8);
    v.dim(b, 0, b, D, -8);
    v.text(b + 0.25 * b, 0.75 * D, "TOP " + C.pystr(top[0]) + "-" + F(top[1], "g") + "Ø", 2.5);
    v.text(b + 0.25 * b, 0.25 * D, "BOTTOM " + C.pystr(bot[0]) + "-" + F(bot[1], "g") + "Ø", 2.5);
    v.text(b + 0.25 * b, 0.50 * D, "STIRRUPS " + C.pystr(stirrup[0]) + "L-" + F(stirrup[1], "g") + "Ø @ " + F(stirrup[2], "g"), 2.5);
    return v;
  };
  M.slab_bars_count = function (width_m, spacing, cover) { cover = cover == null ? 25.0 : cover; return Math.floor((width_m * 1000 - 2 * cover) / spacing) + 1; };
  M.area_per_m = function (dia, spacing) { return 1000 * DS.materials.bar_area(dia) / spacing; };
})();
