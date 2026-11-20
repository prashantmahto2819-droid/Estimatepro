/* Estimate Pro BIM — "runs": decoration and cladding drawn by points, from a start point to an end point (and round corners).
   entity { t: "run", kind, pts: [[x, y]…], closed, side: 1 | -1, z, h, mw, led, ledLook, look, lvl }
   Two families:
   - profile runs: a moulding / light section swept along the line with mitred corners (cornice, band, skirting, LED strip…)
   - panel runs: cladding built module by module along the line up to a height (WPC louvres, ACP panels, fins…), with
     optional LED lines in the joints, at the top / bottom, or both.
   The line is the wall face; the run stands out on the chosen side. Commands: RUN (MOULDING, LEDLINE), CLADDING (WPC, ACP). */
(function () {
  "use strict";
  var EP = window.EP, CAD = EP.cad, G = EP.geom, B = EP.bim; if (!B || !CAD) return;
  B.TYPES.run = 1; B.EXT = B.EXT || {};
  var Gc = "plaster_grc", Wp = "plaster_pop_white";
  /* profile: [[offset0, offset1, z0, z1, look | null (= the run's own material)]…], mm; z = default height of its underside above the floor */
  var RUNS = B.RUNS = {
    cornice: { n: "Cornice moulding 150 (inside, wall top)", fam: "p", z: 2850, look: Wp, key: "run_cornice", pr: [[0, 40, 0, 30], [0, 70, 30, 60], [0, 110, 60, 85], [0, 150, 85, 120], [0, 120, 120, 135], [0, 170, 135, 150]] },
    cornice_ext: { n: "External cornice 300 (cement / GRC)", fam: "p", z: 2900, look: Gc, key: "run_cornice", pr: [[0, 60, 0, 50], [0, 110, 50, 100], [0, 180, 100, 160], [0, 250, 160, 230], [0, 220, 230, 255], [0, 320, 255, 300]] },
    band: { n: "Plaster band 150 × 40", fam: "p", z: 3000, look: Gc, key: "run_band", pr: [[0, 25, 0, 20], [0, 40, 20, 130], [0, 25, 130, 150]] },
    band_flat: { n: "Flat plaster band 230 × 20", fam: "p", z: 900, look: Gc, key: "run_band", pr: [[0, 20, 0, 230]] },
    groove_band: { n: "Band with groove 230", fam: "p", z: 900, look: Gc, key: "run_band", pr: [[0, 50, 0, 90], [0, 20, 90, 140], [0, 50, 140, 230]] },
    dado_rail: { n: "Dado / chair rail", fam: "p", z: 900, look: Wp, key: "run_band", pr: [[0, 15, 0, 15], [0, 35, 15, 50], [0, 20, 50, 70]] },
    skirting: { n: "Moulded skirting 150", fam: "p", z: 0, look: Wp, key: "skirting", pr: [[0, 20, 0, 110], [0, 30, 110, 135], [0, 15, 135, 150]] },
    skirting_tile: { n: "Tile / stone skirting 100", fam: "p", z: 0, look: "granite_black", key: "skirting", pr: [[0, 12, 0, 100]] },
    plinth_band: { n: "Plinth band 450 (offset)", fam: "p", z: 0, look: Gc, key: "run_band", pr: [[0, 40, 0, 400], [0, 25, 400, 450]] },
    sill_band: { n: "Sill / coping band with drip 75", fam: "p", z: 825, look: Gc, key: "run_band", pr: [[0, 100, 0, 25], [0, 120, 25, 75]] },
    pelmet: { n: "Curtain pelmet / cove box 150 × 150", fam: "p", z: 2550, look: "gypsum_white", key: "false_ceiling", pr: [[130, 150, 0, 150], [0, 150, 138, 150], [100, 114, 110, 122, "led"]], led: 1 },
    led_strip: { n: "LED strip (surface)", fam: "p", z: 2700, look: "led_warm", key: "led_strip", pr: [[0, 10, 0, 14, "led"]], led: 1 },
    led_profile: { n: "LED profile light (aluminium channel)", fam: "p", z: 2400, look: "aluminium", key: "led_strip", pr: [[0, 22, 0, 4], [0, 22, 26, 30], [0, 6, 4, 26], [6, 24, 5, 25, "led"]], led: 1 },
    led_cove: { n: "Cove LED (hidden behind an upstand)", fam: "p", z: 2500, look: "gypsum_white", key: "led_strip", pr: [[0, 90, 0, 12], [78, 90, 12, 70], [20, 36, 12, 24, "led"]], led: 1 },
    led_floor: { n: "Skirting / floor LED line", fam: "p", z: 0, look: "aluminium", key: "led_strip", pr: [[0, 14, 0, 6], [0, 14, 24, 30], [2, 16, 6, 24, "led"]], led: 1 },
    led_neon: { n: "Neon flex line (colour)", fam: "p", z: 2200, look: "led_pink", key: "led_strip", pr: [[0, 16, 0, 16, "led"]], led: 1, ledLook: "led_pink" },
    wpc_louvre: { n: "WPC louvre (fluted) cladding", fam: "c", z: 0, h: 2700, look: "wpc_brown", key: "wall_panel", mw: 40, gen: "batten", bw: 25, dp: 25, back: 8 },
    wpc_louvre_wide: { n: "WPC louvre — wide ribs", fam: "c", z: 0, h: 2700, look: "wpc_grey", key: "wall_panel", mw: 90, gen: "batten", bw: 60, dp: 30, back: 8 },
    charcoal_louvre: { n: "Charcoal louvre panel", fam: "c", z: 0, h: 2700, look: "panel_charcoal", key: "wall_panel", mw: 30, gen: "batten", bw: 18, dp: 12, back: 6 },
    wood_batten: { n: "Wooden battens on wall", fam: "c", z: 0, h: 2700, look: "wood_teak", key: "wall_panel", mw: 80, gen: "batten", bw: 40, dp: 40, back: 0 },
    wpc_plank: { n: "WPC planks (horizontal) cladding", fam: "c", z: 0, h: 2700, look: "wpc_brown", key: "wall_panel", mw: 2900, rh: 150, gen: "grid", dp: 20, gv: 6 },
    acp_panels: { n: "ACP panel cladding (grid with grooves)", fam: "c", z: 0, h: 3000, look: "acp_silver", key: "acp_panel", mw: 1220, rh: 1000, gen: "grid", dp: 50, gv: 14 },
    acp_planks: { n: "ACP vertical planks (wooden look)", fam: "c", z: 0, h: 3000, look: "acp_wood_teak", key: "acp_panel", mw: 300, rh: 0, gen: "grid", dp: 40, gv: 8 },
    hpl_panels: { n: "HPL / exterior laminate panels", fam: "c", z: 0, h: 3000, look: "hpl_wood", key: "wall_panel", mw: 1220, rh: 1500, gen: "grid", dp: 30, gv: 8 },
    stone_strips: { n: "Stone strip cladding", fam: "c", z: 0, h: 3000, look: "stone_cladding_slate", key: "stone_veneer", mw: 100000, rh: 0, gen: "grid", dp: 30, gv: 0 },
    alu_fins: { n: "Aluminium / ACP fins (vertical, standing out)", fam: "c", z: 0, h: 3000, look: "aluminium_wood", key: "acp_panel", mw: 300, gen: "batten", bw: 50, dp: 200, back: 0 },
    glass_panels: { n: "Back-painted glass panels", fam: "c", z: 0, h: 2700, look: "glass_white_lacquer", key: "wall_panel", mw: 900, rh: 0, gen: "grid", dp: 12, gv: 3 }
  };
  B.RUN_LED = [["", "No LED"], ["joint", "LED in the vertical joints"], ["top", "LED line at the top"], ["bottom", "LED line at the bottom"], ["both", "LED lines at top and bottom"], ["all", "LED in the joints, top and bottom"]];
  B.RUN_LEDLOOKS = ["led_warm", "led_cool", "led_daylight", "led_amber", "led_blue", "led_green", "led_pink"];
  function def(e) { return RUNS[e.kind] || RUNS.band; }
  function path(e) { var p = e.pts.map(function (q) { return [q[0], q[1]]; }); return p; }
  function runLen(e) { var p = path(e), L = 0; for (var i = 0; i + 1 < p.length; i++) L += G.dist(p[i], p[i + 1]); if (e.closed && p.length > 2) L += G.dist(p[p.length - 1], p[0]); return L; }
  /* the line moved sideways by off (positive = the run's side), corners mitred */
  function offsetPath(p, off, closed, side) {
    var n = p.length, out = [], o = off * side;
    function nrm(a, b) { var u = G.norm(G.sub(b, a)); return [u[1], -u[0]]; }   /* right-hand side of the direction of travel */
    for (var i = 0; i < n; i++) {
      var prev = i > 0 ? p[i - 1] : closed ? p[n - 1] : null, next = i < n - 1 ? p[i + 1] : closed ? p[0] : null, n1 = prev ? nrm(prev, p[i]) : null, n2 = next ? nrm(p[i], next) : null, m;
      if (n1 && n2) { var s = [n1[0] + n2[0], n1[1] + n2[1]], l = Math.hypot(s[0], s[1]); if (l < 1e-6) m = n1; else { var c = (s[0] * n1[0] + s[1] * n1[1]) / l, k = Math.min(1 / Math.max(c, 0.2), 4); m = [s[0] / l * k, s[1] / l * k]; } } else m = n1 || n2 || [0, 0];
      out.push([p[i][0] + m[0] * o, p[i][1] + m[1] * o]);
    }
    return out;
  }
  function segsOf(p, closed) { var s = []; for (var i = 0; i + 1 < p.length; i++) s.push([p[i], p[i + 1]]); if (closed && p.length > 2) s.push([p[p.length - 1], p[0]]); return s; }
  function ledLookOf(e) { var D = def(e), id = e.ledLook || D.ledLook || (D.led && /^led_/.test(e.look || D.look) ? (e.look || D.look) : "led_warm"); return B.LOOKS[id] ? id : "led_warm"; }
  B.runLedLen = function (e) {
    var D = def(e), L = runLen(e); if (D.fam === "p") return D.led ? L : 0;
    var m = e.led || "", H = e.h || D.h, mw = e.mw || D.mw, n = 0; if (m === "top" || m === "bottom") n += L; if (m === "both" || m === "all") n += 2 * L;
    if (m === "joint" || m === "all") { var step = D.gen === "batten" ? Math.max(mw * 8, 600) : mw; segsOf(path(e), e.closed).forEach(function (s) { n += Math.max(0, Math.floor(G.dist(s[0], s[1]) / step)) * H; }); }
    return n;
  };
  function mesh(M, doc, e, H) {
    var D = def(e), L = B.level(doc.d, e.lvl), z0 = (L ? L.elev : 0) + (e.z == null ? D.z : e.z), side = +e.side === -1 ? -1 : 1, p = path(e); if (p.length < 2) return;
    var own = B.look(e.look && B.LOOKS[e.look] ? e.look : D.look, e.col), led = B.look(ledLookOf(e));
    if (D.fam === "p") {
      D.pr.forEach(function (r) { var a = offsetPath(p, r[0], e.closed, side), b = offsetPath(p, r[1], e.closed, side), n = p.length, cnt = e.closed && n > 2 ? n : n - 1;
        for (var i = 0; i < cnt; i++) { var j = (i + 1) % n; H.prism(M, [a[i], a[j], b[j], b[i]], z0 + r[2], z0 + r[3], r[4] === "led" ? led : r[4] ? B.look(r[4]) : own); } });
      if (D.led && H.lights) { var Lt = runLen(e), nL = Math.max(1, Math.min(8, Math.round(Lt / 1500))), acc = 0, sg = segsOf(p, e.closed), tot = Lt / nL, need = tot / 2; sg.forEach(function (s) { var l = G.dist(s[0], s[1]); while (need <= acc + l && l > 0) { var t = (need - acc) / l, q = [s[0][0] + (s[1][0] - s[0][0]) * t, s[0][1] + (s[1][1] - s[0][1]) * t]; H.lights.push([q[0] / 1000, q[1] / 1000, (z0 + 20) / 1000, 0.6]); need += tot; } acc += l; }); }
      return;
    }
    var Hh = e.h || D.h, mw = Math.max(10, e.mw || D.mw), z1 = z0 + Hh, mode = e.led || "", joint = mode === "joint" || mode === "all", top = mode === "top" || mode === "both" || mode === "all", bot = mode === "bottom" || mode === "both" || mode === "all";
    segsOf(p, e.closed).forEach(function (s) {
      var a = s[0], b = s[1], len = G.dist(a, b); if (len < 5) return; var u = G.norm(G.sub(b, a)), nv = [u[1] * side, -u[0] * side];
      var at = function (d, off) { return [a[0] + u[0] * d + nv[0] * off, a[1] + u[1] * d + nv[1] * off]; }, strip = function (d0, d1, o0, o1, za, zb, look) { if (d1 - d0 < 0.5 || zb - za < 0.5) return; H.boxAlong(M, at(d0, (o0 + o1) / 2), at(d1, (o0 + o1) / 2), Math.abs(o1 - o0), za, zb, look); };
      var zb0 = z0 + (bot ? 30 : 0), zt1 = z1 - (top ? 30 : 0);
      if (D.gen === "batten") {
        if (D.back) strip(0, len, 0, D.back, z0, z1, own);
        var n = Math.max(1, Math.floor((len + (mw - D.bw)) / mw)), start = (len - ((n - 1) * mw + D.bw)) / 2, every = Math.max(1, Math.round(Math.max(mw * 8, 600) / mw));
        for (var i = 0; i < n; i++) { var d0 = start + i * mw; strip(d0, d0 + D.bw, D.back, D.back + D.dp, zb0, zt1, own); if (joint && i < n - 1 && i % every === every - 1) strip(d0 + D.bw + 1, d0 + mw - 1, D.back, D.back + Math.min(10, D.dp * 0.5), zb0, zt1, led); }
      } else {
        var gv = D.gv || 0, nx = Math.max(1, Math.round(len / mw)), cw = len / nx, rh = e.rh != null ? e.rh : D.rh, nz = rh > 0 ? Math.max(1, Math.round((zt1 - zb0) / rh)) : 1, ch = (zt1 - zb0) / nz;
        if (gv) strip(0, len, 0, D.dp - 6, z0, z1, B.look("aluminium_anodised_black"));
        for (var ix = 0; ix < nx; ix++) for (var iz = 0; iz < nz; iz++) strip(ix * cw + gv / 2, (ix + 1) * cw - gv / 2, gv ? D.dp - 6 : 0, D.dp, zb0 + iz * ch + gv / 2, zb0 + (iz + 1) * ch - gv / 2, own);
        if (joint) for (var jx = 1; jx < nx; jx++) strip(jx * cw - Math.max(gv, 16) / 2, jx * cw + Math.max(gv, 16) / 2, D.dp - 5, D.dp + 2, zb0, zt1, led);
      }
      if (top) strip(0, len, 2, D.dp + (D.back || 0) + 3, z1 - 30, z1, led); if (bot) strip(0, len, 2, D.dp + (D.back || 0) + 3, z0, z0 + 30, led);
      if (mode && H.lights) { var nl = Math.max(1, Math.min(4, Math.round(len / 2000))); for (var k = 0; k < nl; k++) { var q = at(len * (k + 0.5) / nl, D.dp + 150); H.lights.push([q[0] / 1000, q[1] / 1000, (top && !bot ? z1 - 100 : bot && !top ? z0 + 150 : (z0 + z1) / 2) / 1000, 0.55]); } }
    });
  }
  B.EXT.run = {
    plan: function (doc, e) { var D = def(e), p = path(e), side = +e.side === -1 ? -1 : 1, w = D.fam === "p" ? Math.max.apply(null, D.pr.map(function (r) { return r[1]; })) : (D.dp + (D.back || 0)), o = offsetPath(p, w, e.closed, side);
      var segs = G.polySegs(p, !!e.closed).concat(G.polySegs(o, !!e.closed)); if (!e.closed) { segs.push({ k: "L", a: p[0], b: o[0] }); segs.push({ k: "L", a: p[p.length - 1], b: o[o.length - 1] }); }
      return { segs: segs, fill: [], dashed: [] }; },
    labels: function () { return []; },
    xform: function (e, M) { var o = JSON.parse(JSON.stringify(e)); o.pts = e.pts.map(function (p) { return G.mApply(M, p); }); var det = M[0] * M[3] - M[1] * M[2]; if (det < 0) o.side = +e.side === -1 ? 1 : -1; return o; },
    qty: function (doc, e) { var D = def(e), L = runLen(e), z = e.lvl ? B.below(doc.d, e.lvl) : "super", m = function (v) { return (v / 1000).toFixed(2); }, rows = [];
      if (e.noq === true) return rows;
      if (D.fam === "p") { if (D.key !== "led_strip") rows.push({ k: D.key, dim: "L", v: L, label: D.n, f: m(L) + " m run", z: z }); }
      else { var Hh = e.h || D.h; rows.push({ k: D.key, dim: "A", v: L * Hh, label: D.n, f: m(L) + " × " + m(Hh), z: z }); }
      var ll = B.runLedLen(e); if (ll > 0) rows.push({ k: "led_strip", dim: "L", v: ll, label: "LED strip / profile light", f: m(ll) + " m run", z: z });
      return rows; },
    mesh: mesh
  };
  B.runLen = runLen;
  B.MAP = B.MAP || {}; ["run_cornice", "run_band", "led_strip"].forEach(function (k) { if (!(k in B.MAP)) B.MAP[k] = null; });

  var cmds = CAD.commands, AL = CAD.aliases;
  function cmd(name, al, fn) { cmds[name] = { fn: fn }; (al || []).forEach(function (a) { AL[a] = name; }); }
  function kwOf(fam) { var o = {}; Object.keys(RUNS).forEach(function (k) { if (RUNS[k].fam === fam) o[k.split("_").map(function (w) { return w[0].toUpperCase() + w.slice(1); }).join("")] = k; }); return o; }
  async function draw(ed, fam) {
    B.ensure(ed.doc.d); var KW = kwOf(fam), names = Object.keys(KW), memo = fam === "p" ? "runKind" : "cladKind", cur = ed[memo] && RUNS[ed[memo]] && RUNS[ed[memo]].fam === fam ? ed[memo] : KW[names[0]];
    var kind = cur, side = ed.runSide === -1 ? -1 : 1, lvl = B.ensure(ed.doc.d).cur, pts = [], D = RUNS[kind];
    var head = function () { return RUNS[kind].n + " — start point"; };
    while (true) {
      var p = await ed.getPoint(pts.length ? "Next point (Enter to finish)" : head(), { opt: pts.length > 0, base: pts.length ? pts[pts.length - 1] : null, kw: pts.length ? (pts.length > 2 ? ["Undo", "Close", "Flip"] : ["Undo", "Flip"]) : ["Type", "Flip"] });
      if (p === "Type") { var pick = await ed.getKw("Which one?", names, names.filter(function (n) { return KW[n] === kind; })[0]); kind = KW[pick] || kind; ed[memo] = kind; continue; }
      if (p === "Flip") { side = -side; ed.runSide = side; ed.say("It now stands out on the other side of the line."); }
      else if (p === "Undo") { if (pts.length) pts.pop(); }
      else if (p === "Close") { ed.preview = null; ed.doc.add({ t: "run", kind: kind, pts: pts, closed: true, side: side, lvl: lvl }); ed.say(RUNS[kind].n + " added, " + (B.runLen({ pts: pts, closed: true }) / 1000).toFixed(2) + " m. Height, size, material and LED are in Properties."); return; }
      else if (p == null) break; else pts.push([p[0], p[1]]);
      (function (k, sd) { ed.preview = pts.length ? function (w) { return [{ t: "run", kind: k, pts: pts.concat([[w[0], w[1]]]), side: sd, lvl: lvl }]; } : null; })(kind, side);
    }
    ed.preview = null; if (pts.length < 2) return; ed[memo] = kind;
    ed.doc.add({ t: "run", kind: kind, pts: pts, closed: false, side: side, lvl: lvl });
    ed.say(RUNS[kind].n + " added, " + (B.runLen({ pts: pts }) / 1000).toFixed(2) + " m. Height, size, material and LED are in Properties.");
  }
  cmd("RUN", ["MOULDING", "MOLDING", "CORNICE", "LEDLINE", "LEDSTRIP", "SKIRTING"], function (ed) { return draw(ed, "p"); });
  cmd("CLADDING", ["CLAD", "WPC", "ACP", "LOUVRE"], function (ed) { return draw(ed, "c"); });
})();
