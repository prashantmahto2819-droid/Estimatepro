/* Estimate Pro — Design Studio → 3D builders, batch 3 (steel): steel_shed, steel_portal, steel_truss, steel_purlin, steel_beam, steel_column.
   Sections come from the module result's summary (designed sizes) with the input values as fallback; all lengths in mm. Ground level is z = 0,
   plan origin at the centre of the building, x across the span, y along the length. */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {}, T = DS.to3d = DS.to3d || { builders: {} };
  var D2R = Math.PI / 180, STEEL = "steel_member";

  /* ---------- section look-up ---------- */
  function num(x, d) { x = +x; return isFinite(x) ? x : d; }
  function sec(name, fb) {
    name = String(name || fb || "").trim(); var S = DS.sections || {}, m, t, n;
    if ((m = name.match(/BU\s*(\d+)(?:\s*→\s*(\d+))?\s*x\s*(\d+)\s*x\s*(\d+)\s*x\s*(\d+)/))) return { k: "I", D: +m[1], D2: m[2] ? +m[2] : +m[1], B: +m[3], tf: +m[4], tw: +m[5], name: name };
    if ((m = name.match(/ISA\s*(\d+)\s*x\s*(\d+)\s*x\s*(\d+)/))) return { k: "A", a: +m[1], b: +m[2], t: +m[3], dbl: /(^|\s)2\s*-?\s*ISA/.test(name), name: name };
    if ((m = name.match(/(ISMB|ISHB|ISLB|ISWB|ISJB)\s*(\d+)/))) { var key = m[1] + " " + m[2]; t = (S.ISMB && S.ISMB[key]) || (S.ISHB && S.ISHB[key]); n = +m[2]; if (t) return { k: "I", D: t[2], D2: t[2], B: t[3], tf: t[4], tw: t[5], name: key }; return { k: "I", D: n, D2: n, B: Math.max(60, n * 0.4), tf: n * 0.03 + 4, tw: n * 0.018 + 2, name: key }; }
    if ((m = name.match(/ISMC\s*(\d+)/))) { var kc = "ISMC " + m[1]; t = S.ISMC && S.ISMC[kc]; n = +m[1]; if (t) return { k: "C", D: t[2], B: t[3], tf: t[4], tw: t[5], name: kc }; return { k: "C", D: n, B: Math.max(40, n * 0.45), tf: n * 0.06 + 3, tw: n * 0.04 + 2, name: kc }; }
    return null;
  }
  /* find the first section token in a summary text (after an optional label) */
  function pick(text, fb) {
    var s = String(text == null ? "" : text), m = s.match(/(BU\s*\d+(?:\s*→\s*\d+)?\s*x\s*\d+\s*x\s*\d+\s*x\s*\d+|(?:2\s*-\s*)?ISA\s*\d+\s*x\s*\d+\s*x\s*\d+|IS(?:MB|HB|MC|LB|WB)\s*\d+)/);
    return sec(m ? m[1] : null) || sec(fb);
  }
  function pickAfter(text, label, fb) { var s = String(text || ""), i = s.indexOf(label); return pick(i >= 0 ? s.slice(i + label.length) : null, fb); }
  function sm(res, k) { return (res && res.summary && res.summary[k]) || ""; }
  function posn(x, lo, hi, d) { x = num(x, d); return Math.min(hi, Math.max(lo, x)); }

  /* ---------- vector helpers / member frame (same convention as bim/dsmodel.js) ---------- */
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function nrm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function frame(a, b, roll) {
    var t = nrm(sub(b, a)), s = cross(t, [0, 0, 1]); if (Math.hypot(s[0], s[1], s[2]) < 1e-6) s = [1, 0, 0]; s = nrm(s); var u = cross(s, t);
    if (roll) { var r = roll * D2R, c = Math.cos(r), sn = Math.sin(r), s2 = add(mul(s, c), mul(u, sn)), u2 = add(mul(u, c), mul(s, -sn)); s = s2; u = u2; }
    return { t: t, s: s, u: u };
  }
  function len3(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

  /* ---------- section → parts ---------- */
  function Build(H) {
    var P = [];
    function put(p) { if (p) P.push(p); }
    var B = {
      parts: P,
      /* I-section member, depth D at a → D2 at b (tapered = a few steps), top face kept: `up` = which side stays flush when depth varies (0 = centre) */
      ibeam: function (a, b, s, roll, steps) {
        if (!s || len3(a, b) < 5) return;
        var D1 = s.D, D2 = s.D2 || s.D;
        if (Math.abs(D1 - D2) < 2 || !steps) { put(H.ibeam(a, b, s.B, D1, s.tf, s.tw, STEEL, roll)); return; }
        var n = steps; for (var i = 0; i < n; i++) { var f0 = i / n, f1 = (i + 1) / n, p0 = [a[0] + (b[0] - a[0]) * f0, a[1] + (b[1] - a[1]) * f0, a[2] + (b[2] - a[2]) * f0], p1 = [a[0] + (b[0] - a[0]) * f1, a[1] + (b[1] - a[1]) * f1, a[2] + (b[2] - a[2]) * f1], D = D1 + (D2 - D1) * (f0 + f1) / 2; put(H.ibeam(p0, p1, s.B, Math.max(D, 2 * s.tf + 10), s.tf, s.tw, STEEL, roll)); }
      },
      /* channel with its web on side `side` (-1 / +1 along s); roll rotates the section */
      chan: function (a, b, s, roll, side) {
        if (s && s.k === "A") s = { D: s.a, B: s.a, tf: s.t, tw: s.t };
        if (!s || len3(a, b) < 5) return; var f = frame(a, b, roll), sg = side || -1, h = s.D, bf = s.B, tf = Math.max(2, s.tf), tw = Math.max(2, s.tw);
        var wa = add(a, mul(f.s, sg * (bf / 2 - tw / 2))), wb = add(b, mul(f.s, sg * (bf / 2 - tw / 2)));
        put(H.member(wa, wb, tw, h, STEEL, roll));
        [1, -1].forEach(function (uu) { var o = mul(f.u, uu * (h / 2 - tf / 2)); put(H.member(add(a, o), add(b, o), bf, tf, STEEL, roll)); });
      },
      /* angle: two legs; `off` shifts the heel in s; sg = side the horizontal leg points to; bottom = horizontal leg at the bottom */
      angle: function (a, b, s, roll, sOff, sg, uTop, bottom) {
        if (!s || len3(a, b) < 5) return; var f = frame(a, b, roll), L1 = s.a, t = Math.max(2, s.t), sgn = sg || 1;
        function at(ds, du) { var o = add(mul(f.s, ds), mul(f.u, du)); return [add(a, o), add(b, o)]; }
        var v = at(sOff + sgn * t / 2, uTop - L1 / 2), hz = at(sOff + sgn * L1 / 2, bottom ? uTop - L1 + t / 2 : uTop - t / 2);
        put(H.member(v[0], v[1], t, L1, STEEL, roll)); put(H.member(hz[0], hz[1], L1, t, STEEL, roll));
      },
      /* a double angle back-to-back (gusset gap 10) or a single angle, centred on the line a–b */
      angles: function (a, b, s, roll, bottom) {
        if (!s) return; var L1 = s.a, uTop = bottom ? L1 * 0.3 : L1 * 0.7;
        if (s.dbl) { B.angle(a, b, s, roll, -5, -1, uTop, bottom); B.angle(a, b, s, roll, 5, 1, uTop, bottom); } else B.angle(a, b, s, roll, -s.t / 2, 1, uTop, bottom);
      },
      rod: function (a, b, d) { if (len3(a, b) > 5) put(H.member(a, b, d, d, STEEL, 0)); },
      put: put
    };
    return B;
  }

  /* ---------- truss in the x–z plane at y ---------- */
  function truss(Bd, o) {
    /* o: { y, S (span), z0 (bottom chord level), rise, n (panels, even), type, top, bot, vert, diag, drop (px: shift of x origin) } */
    var S = o.S, n = Math.max(4, o.n - (o.n % 2)), y = o.y, z0 = o.z0, R = o.rise, hx = S / 2, i, k;
    function Z(x) { return z0 + R * (1 - Math.abs(x) / hx); }
    function bn(x) { return [x, y, z0]; } function tn(x) { return [x, y, Z(x)]; }
    var xs = []; for (k = 0; k <= n; k++) xs.push(-hx + k * S / n);
    var tc = o.top, bc = o.bot, uOffTop = 0;
    Bd.angles(bn(xs[0]), bn(xs[n]), bc, 0, true);
    var pk = tn(0); Bd.angles(tn(xs[0]), pk, tc, 0, false); Bd.angles(pk, tn(xs[n]), tc, 0, false);
    if (o.type === "Fink") {
      for (i = 0; i < 2; i++) { var sgn = i === 0 ? -1 : 1, xq = sgn * hx / 2, x4 = sgn * hx / 4, x34 = sgn * hx * 0.75;
        Bd.angles(tn(xq), bn(xq), o.vert, 0, false); Bd.angles(tn(xq), bn(0), o.diag, 0, false);
        Bd.angles(tn(x4), bn(xq), o.diag, 0, false); Bd.angles(tn(x34), bn(xq), o.diag, 0, false); }
      Bd.angles(bn(0), tn(0), o.vert, 0, false);
      return;
    }
    for (k = 1; k < n; k++) Bd.angles(bn(xs[k]), tn(xs[k]), o.vert, 0, false);
    for (k = 1; k < n / 2; k++) {
      var L = k, R2 = n - k;
      if (o.type === "Howe") { Bd.angles(tn(xs[L + 1]), bn(xs[L]), o.diag, 0, false); Bd.angles(tn(xs[R2 - 1]), bn(xs[R2]), o.diag, 0, false); }
      else { Bd.angles(tn(xs[L]), bn(xs[L + 1]), o.diag, 0, false); Bd.angles(tn(xs[R2]), bn(xs[R2 - 1]), o.diag, 0, false); }
    }
  }

  /* ---------- generic steel building (portal / PEB / mono / truss on columns) ---------- */
  function building(v, res, H, c) {
    var Bd = Build(H), P = Bd.parts, i, k;
    function asC(x) { return x && x.k === "A" ? { k: "C", D: x.a, B: x.a, tf: x.t, tw: x.t, name: x.name } : x; }
    c.purlin = asC(c.purlin); c.eaveStrut = asC(c.eaveStrut); c.girt = asC(c.girt);
    var span = c.span, Lh = span / 2, bay = c.bay, nb = c.nb, Ltot = bay * nb, eave = c.eave, slope = c.slope * D2R, tn = Math.tan(slope);
    var mono = c.style === "mono", isTruss = c.style === "truss", ridge = mono ? eave + span * tn : eave + Lh * tn;
    if (isTruss) { var rr = c.rise; ridge = eave + rr; }
    var colS = c.col, rafS = c.raf, pH = c.plinth, df = c.df;
    var fx = c.footL, fy = c.footB, fz = c.footD, pedL = c.pedL, pedB = c.pedB, bpL = c.bpL, bpB = c.bpB, bpt = c.bpt;
    var y0 = -Ltot / 2, ys = []; for (i = 0; i <= nb; i++) ys.push(y0 + i * bay);
    function zRoofAt(x) { if (isTruss) return eave + c.rise * (1 - Math.abs(x) / Lh); return mono ? eave + (x + Lh) * tn : eave + (Lh - Math.abs(x)) * tn; }
    var colX = [-Lh, Lh];
    function colTop(x) { return mono ? eave + (x + Lh) * tn : eave; }
    var knee = { x: c.haunchLen };
    /* gable (wind) column option: end frames replaced by gable columns + end rafter */
    var gableCols = !!c.gableCols && !isTruss;

    /* ---- footings ---- */
    ys.forEach(function (y, fi) {
      var endFrame = fi === 0 || fi === nb;
      colX.forEach(function (x) {
        if (gableCols && endFrame) { /* smaller footing under gable column */
          P.push(H.box(x, y, 1500, 1500, -df - 100, -df, "concrete")); P.push(H.box(x, y, 1500, 1500, -df, -df + 300, "concrete")); P.push(H.box(x, y, 450, 450, -df + 300, pH, "concrete")); return; }
        P.push(H.box(x, y, fx + 200, fy + 200, -df - 100, -df, "concrete"));
        P.push(H.box(x, y, fx, fy, -df, -df + fz, "concrete"));
        P.push(H.box(x, y, pedL, pedB, -df + fz, pH, "concrete"));
        P.push(H.box(x, y, bpL, bpB, pH, pH + bpt, "steel_member"));
        var nA = Math.max(2, c.nAnchor), ax = (bpL / 2 - 45) * (nA > 2 ? 1 : 0), ay = bpB / 2 - 45;
        for (var a = 0; a < Math.min(nA, 8); a++) { var bx = nA === 2 ? (a ? -1 : 1) * (bpL / 2 - 45) : ((a % 2) ? 1 : -1) * ax, by = nA === 2 ? 0 : (a < 2 ? -ay : ay); if (nA > 4 && a >= 4) { bx = ((a % 2) ? 1 : -1) * ax; by = 0; } P.push(H.cyl(x + bx, y + by, c.anchorD / 2, pH - c.anchorLen + 150, pH + bpt + 60, "steel_member")); }
      });
    });
    if (c.tie) { var tb = 300, td = 450; [-Lh, Lh].forEach(function (x) { P.push(H.bx(x - tb / 2, y0, x + tb / 2, y0 + Ltot, -td, 0, "concrete")); }); [ys[0], ys[nb]].forEach(function (y) { P.push(H.bx(-Lh, y - tb / 2, Lh, y + tb / 2, -td, 0, "concrete")); }); }

    /* ---- columns, rafters / trusses ---- */
    var zb = pH + bpt;
    ys.forEach(function (y, fi) {
      var endFrame = fi === 0 || fi === nb;
      if (gableCols && endFrame) return;
      colX.forEach(function (x) {
        var top = isTruss ? eave : colTop(x); var s1 = Object.assign({}, colS);
        Bd.ibeam([x, y, zb], [x, y, top], { B: s1.B, tf: s1.tf, tw: s1.tw, D: s1.D2 || s1.D, D2: s1.D }, 90, (s1.D2 && Math.abs(s1.D2 - s1.D) > 2) ? 3 : 0);
      });
      if (isTruss) { truss(Bd, { y: y, S: span, z0: eave, rise: c.rise, n: c.panels, type: c.trussType, top: c.top, bot: c.bot, vert: c.vert, diag: c.diag }); return; }
      if (mono) {
        var a1 = [-Lh, y, colTop(-Lh)], b1 = [Lh, y, colTop(Lh)]; Bd.ibeam(a1, b1, { B: rafS.B, tf: rafS.tf, tw: rafS.tw, D: rafS.D, D2: rafS.D2 || rafS.D }, 0, (rafS.D2 && Math.abs(rafS.D2 - rafS.D) > 2) ? 4 : 0);
        if (c.haunch) { var hl = c.haunchLen; [[-Lh, 1], [Lh, -1]].forEach(function (h) { var xs0 = h[0], dir = h[1]; var za = colTop(xs0); for (var st = 0; st < 3; st++) { var f0 = st / 3, f1 = (st + 1) / 3, xa = xs0 + dir * hl * f0, xb = xs0 + dir * hl * f1, ex = rafS.D * (1.55 - 0.5 * (f0 + f1) / 1) * 0.65; var ea = [xa, y, colTop(xa)], eb = [xb, y, colTop(xb)]; var fr = frame(ea, eb, 0), sh = mul(fr.u, -ex / 2); P.push(H.ibeam(add(ea, sh), add(eb, sh), rafS.B, rafS.D + ex, rafS.tf, rafS.tw, STEEL, 0)); } }); }
      } else {
        [-1, 1].forEach(function (sg) {
          var a1 = [sg * Lh, y, eave], b1 = [0, y, ridge], rs = { B: rafS.B, tf: rafS.tf, tw: rafS.tw, D: rafS.D, D2: rafS.D2 || rafS.D };
          /* tapered rafter runs knee depth → apex depth; direction from knee to apex */
          Bd.ibeam(a1, b1, rs, sg > 0 ? 0 : 0, (rs.D2 && Math.abs(rs.D2 - rs.D) > 2) ? 4 : 0);
          if (c.haunch) { var hl = c.haunchLen, dirv = nrm(sub(b1, a1)); for (var st = 0; st < 3; st++) { var f0 = st / 3, f1 = (st + 1) / 3, ea = add(a1, mul(dirv, hl * f0)), eb = add(a1, mul(dirv, hl * f1)), ex = rafS.D * (1.2 - 0.9 * (f0 + f1) / 2) * 0.9, fr = frame(ea, eb, 0), sh = mul(fr.u, -ex / 2); P.push(H.ibeam(add(ea, sh), add(eb, sh), rafS.B, rafS.D + ex, rafS.tf, rafS.tw, STEEL, 0)); } }
        });
      }
    });
    /* ---- gable columns + end rafter ---- */
    if (gableCols) {
      [ys[0], ys[nb]].forEach(function (y) {
        var gs = c.gc, es = c.er; if (!gs) return;
        var nGc = Math.max(1, Math.ceil(span / c.gcSp)), xsG = []; for (i = 0; i <= nGc; i++) xsG.push(-Lh + i * span / nGc);
        xsG.forEach(function (x, gi) {
          var ztop = zRoofAt(x) - (es ? es.D / 2 : 100) - 20; if (ztop <= zb + 300) return;
          if (x === xsG[0] || x === xsG[nGc]) { Bd.ibeam([x, y, zb], [x, y, ztop], { B: colS.B, tf: colS.tf, tw: colS.tw, D: colS.D2 || colS.D, D2: colS.D }, 90, 0); return; }
          Bd.ibeam([x, y, zb], [x, y, ztop], { B: gs.B, tf: gs.tf, tw: gs.tw, D: gs.D, D2: gs.D }, 90, 0);
        });
        if (es) { if (mono) Bd.ibeam([-Lh, y, colTop(-Lh)], [Lh, y, colTop(Lh)], { B: es.B, tf: es.tf, tw: es.tw, D: es.D, D2: es.D }, 0, 0); else { Bd.ibeam([-Lh, y, eave], [0, y, ridge], { B: es.B, tf: es.tf, tw: es.tw, D: es.D, D2: es.D }, 0, 0); Bd.ibeam([Lh, y, eave], [0, y, ridge], { B: es.B, tf: es.tf, tw: es.tw, D: es.D, D2: es.D }, 0, 0); } }
      });
    }

    /* ---- secondary steel ---- */
    var ps = c.purlin, es2 = c.eaveStrut, gs2 = c.girt, rd = Math.max(rafS.D2 || rafS.D, rafS.D) / 2, ovh = 150;
    var yA = y0 - ovh, yB = y0 + Ltot + ovh;
    /* roof purlins along y on each slope */
    var roofSlopes = mono ? [{ xa: -Lh, xb: Lh }] : (isTruss ? [{ xa: -Lh, xb: 0 }, { xa: Lh, xb: 0 }] : [{ xa: -Lh, xb: 0 }, { xa: Lh, xb: 0 }]);
    var chordOff = isTruss ? (c.top ? c.top.a * 0.7 : 60) : rd;
    roofSlopes.forEach(function (sl) {
      var xa = sl.xa, xb = sl.xb, za = isTruss ? eave + 0 : zRoofAt(xa), zb2 = zRoofAt(xb);
      var run = Math.abs(xb - xa), slopeLen = Math.hypot(run, zb2 - za), np = Math.max(2, Math.ceil(slopeLen / c.pSp)), ang = Math.atan2(zb2 - za, xb - xa) / D2R, dir = xb > xa ? 1 : -1;
      var ux = (xb - xa) / slopeLen, uz = (zb2 - za) / slopeLen;
      /* outward normal of the roof plane (pointing up) */
      var tx = ux, tz = uz; var n1 = [-tz, 0, tx]; if (n1[2] < 0) n1 = [tz, 0, -tx];
      var ph = ps ? ps.D : 125, off = chordOff + ph / 2 + 5;
      var roll = Math.atan2(-n1[0], n1[2]) / D2R; /* section 'up' follows the roof normal */
      for (k = 0; k <= np; k++) {
        var f = k / np, px = xa + (xb - xa) * f, pz = za + (zb2 - za) * f; var pa = [px + n1[0] * off, yA, pz + n1[2] * off], pb = [px + n1[0] * off, yB, pz + n1[2] * off];
        if (ps) Bd.chan(pa, pb, ps, roll, -1); else P.push(H.member(pa, pb, 50, 100, STEEL, roll));
      }
      /* sag rods between purlin lines at mid-bay */
      if (c.sag && np > 1) for (var bi = 0; bi < nb; bi++) for (k = 0; k < np; k++) { var f1 = k / np, f2 = (k + 1) / np, ym = y0 + (bi + 0.5) * bay; var q1 = [xa + (xb - xa) * f1 + n1[0] * off, ym, za + (zb2 - za) * f1 + n1[2] * off], q2 = [xa + (xb - xa) * f2 + n1[0] * off, ym, za + (zb2 - za) * f2 + n1[2] * off]; Bd.rod(q1, q2, c.sagD); }
      /* roof sheeting per bay */
      var so = off + ph / 2 + 10;
      for (var bj = 0; bj < nb; bj++) { var ya = y0 + bj * bay + 8, yb = y0 + (bj + 1) * bay - 8; var A = [xa + n1[0] * so, ya, za + n1[2] * so], Bq = [xb + n1[0] * so, ya, zb2 + n1[2] * so], Cq = [xb + n1[0] * so, yb, zb2 + n1[2] * so], Dq = [xa + n1[0] * so, yb, za + n1[2] * so]; P.push(H.quad(A, Bq, Cq, Dq, "sheet_gi")); }
    });
    /* eave struts (along y at the column tops) */
    colX.forEach(function (x) { var zt = isTruss ? eave : colTop(x); if (es2) Bd.chan([x + (x < 0 ? 1 : -1) * (colS.B * 0 + 0), y0, zt - es2.D / 2 - 5], [x, y0 + Ltot, zt - es2.D / 2 - 5], es2, 0, x < 0 ? -1 : 1); });
    /* girts: along y on both long walls, outside the columns */
    var gz0 = 1200, gSp = c.gSp, cd = (colS.D || 400) / 2;
    if (gs2) colX.forEach(function (x) {
      var side = x < 0 ? -1 : 1, topz = isTruss ? eave : colTop(x), ng = Math.max(1, Math.floor((topz - gz0) / gSp)), xo = x + side * (cd + gs2.B / 2 + 5);
      if (c.open === 2 || (c.open === 1 && side > 0)) return;
      for (k = 0; k <= ng; k++) { var zg = gz0 + k * (topz - gz0) / ng - (k === ng ? gs2.D / 2 + 20 : 0); Bd.chan([xo, y0, zg], [xo, y0 + Ltot, zg], gs2, 0, side > 0 ? -1 : 1); }
    });
    /* end-wall girts (simple rails between frames, outside) */
    if (gs2 && c.walls && !gableCols) [ys[0], ys[nb]].forEach(function (y, ei) {
      var side = ei === 0 ? -1 : 1, yo = y + side * ((colS.B || 200) / 2 + gs2.B / 2 + 5), ng = Math.max(1, Math.floor((eave - gz0) / gSp));
      for (k = 0; k <= ng; k++) { var zg = gz0 + k * (eave - gz0) / ng - (k === ng ? gs2.D / 2 + 20 : 0); Bd.chan([-Lh, yo, zg], [Lh, yo, zg], gs2, 0, side > 0 ? -1 : 1); }
    });
    /* bracing in end bays and 3 braced bays on the walls */
    var bayIdx = [0, nb - 1]; if (nb >= 4) bayIdx.push(Math.floor(nb / 2));
    var rodD = c.rodD || 20, braceS = c.braceS;
    function brace(a, b) { if (braceS && braceS.k === "A") Bd.angles(a, b, Object.assign({}, braceS, { dbl: false }), 0, false); else Bd.rod(a, b, rodD); }
    roofSlopes.forEach(function (sl) {
      var xa = sl.xa, xb = sl.xb, za = isTruss ? eave : zRoofAt(xa), zb2 = zRoofAt(xb), up = (c.purlin ? c.purlin.D : 100) + chordOff + 10;
      [0, nb - 1].forEach(function (bi) { var ya = ys[bi], yb = ys[bi + 1]; var o = 60; brace([xa, ya, za + up], [xb, yb, zb2 + up]); brace([xa, yb, za + up], [xb, ya, zb2 + up]); });
    });
    colX.forEach(function (x) { var side = x < 0 ? -1 : 1, xo = x + side * (cd + 10); if (c.open === 2 || (c.open === 1 && side > 0)) return; var topz = isTruss ? eave : colTop(x); bayIdx.forEach(function (bi) { var ya = ys[bi], yb = ys[bi + 1]; brace([xo, ya, zb + 100], [xo, yb, topz - 250]); brace([xo, yb, zb + 100], [xo, ya, topz - 250]); }); });
    /* ---- wall sheeting ---- */
    if (c.walls) {
      var wo = cd + (gs2 ? gs2.B : 60) + 20;
      colX.forEach(function (x) { var side = x < 0 ? -1 : 1; if (c.open === 2 || (c.open === 1 && side > 0)) return; var topz = isTruss ? eave : colTop(x), xo = x + side * wo; for (var bj = 0; bj < nb; bj++) { var ya = y0 + bj * bay + 8, yb = y0 + (bj + 1) * bay - 8; P.push(H.quad([xo, ya, 0], [xo, yb, 0], [xo, yb, topz], [xo, ya, topz], "sheet_gi")); } });
      [ys[0], ys[nb]].forEach(function (y, ei) {
        var side = ei === 0 ? -1 : 1, yo = y + side * ((colS.B || 200) / 2 + (gs2 ? gs2.B : 60) + 20), nSeg = Math.max(2, Math.round(span / 3000));
        for (k = 0; k < nSeg; k++) { var xa = -Lh + k * span / nSeg, xb = -Lh + (k + 1) * span / nSeg, ta = Math.min(zRoofAt(xa), zRoofAt(xb)) , tb2 = Math.max(zRoofAt(xa), zRoofAt(xb)); var za = zRoofAt(xa) - 150, zb3 = zRoofAt(xb) - 150; P.push(H.quad([xa, yo, 0], [xb, yo, 0], [xb, yo, zb3], [xa, yo, za], "sheet_gi")); }
      });
    }
    /* ---- crane gantry ---- */
    if (c.crane) {
      var cs = c.craneSpan > 0 ? c.craneSpan : span - 1000, rail = c.railH > 0 ? c.railH : eave - 1500, gx = cs / 2, gd = c.gantry || { B: 180, D: 450, tf: 17, tw: 9 };
      [-gx, gx].forEach(function (x) {
        var side = x < 0 ? -1 : 1, zg = rail - gd.D / 2 - 40;
        Bd.ibeam([x, y0, zg], [x, y0 + Ltot, zg], { B: gd.B, tf: gd.tf, tw: gd.tw, D: gd.D, D2: gd.D }, 0, 0);
        P.push(H.member([x, y0, rail], [x, y0 + Ltot, rail], 70, 40, STEEL, 0));
        ys.forEach(function (y) { /* column bracket under the girder */ var xc = side * Lh - side * ((colS.D || 400) / 2); P.push(H.member([xc, y, zg - gd.D / 2 - 120], [x, y, zg - gd.D / 2 - 120], 150, 240, STEEL, 0)); });
      });
      var ym = y0 + Ltot * 0.4; P.push(H.ibeam([-gx, ym, rail + 450], [gx, ym, rail + 450], 200, 500, 16, 9, STEEL, 0));
      P.push(H.box(-gx, ym, 500, 500, rail + 80, rail + 400, STEEL)); P.push(H.box(gx, ym, 500, 500, rail + 80, rail + 400, STEEL)); P.push(H.box(0, ym, 1600, 1200, rail + 100, rail + 900, "steel_member"));
    }
    return P;
  }

  /* ---------- parse the shed / portal result ---------- */
  function footing(res, key, fb) {
    var s = sm(res, key), m = s.match(/([\d.]+)\s*[×x]\s*([\d.]+)\s*[×x]\s*([\d.]+)\s*m/), pm = s.match(/pedestal\s*([\d.]+)\s*[×x]\s*([\d.]+)/);
    var o = { L: m ? +m[1] * 1000 : fb.L, B: m ? +m[2] * 1000 : fb.B, D: m ? +m[3] * 1000 : fb.D, pL: pm ? +pm[1] * 1000 : fb.pL, pB: pm ? +pm[2] * 1000 : fb.pB }; return o;
  }
  function plate(res, fb) { var s = sm(res, "Base plate"), m = s.match(/(\d+)\s*[×x]\s*(\d+)\s*[×x]\s*(\d+)/); return { L: m ? +m[1] : fb.L, B: m ? +m[2] : fb.B, t: m ? +m[3] : fb.t }; }
  function anchors(res, fb) { var s = sm(res, "Anchor bolts"), m = s.match(/(\d+)\s*-\s*M(\d+)\s*[×x]\s*(\d+)/); return { n: m ? +m[1] : fb.n, d: m ? +m[2] : fb.d, L: m ? +m[3] : fb.L }; }
  function mm(x) { return num(x, 0) * 1000; }

  T.reg("steel_shed", function (v, res, H) {
    var style = String(v.style || ""), kind = /Truss/.test(style) ? "truss" : /Mono/.test(style) ? "mono" : "portal", tType = /Howe/.test(style) ? "Howe" : /Fink/.test(style) ? "Fink" : "Pratt";
    var span = posn(mm(v.span), 3000, 120000, 20000), bay = posn(mm(v.bay), 1500, 20000, 6000), nb = Math.max(1, Math.min(40, Math.round(num(v.n_bays, 8)))), eave = posn(mm(v.eave), 2500, 40000, 7000);
    var slope = posn(v.slope, 2, 40, 10), rise = span / Math.max(2, num(v.truss_rise, 5));
    var summ = res && res.summary || {};
    var colS = pick(sm(res, "Columns"), v.col_sec) || sec("ISMB 450"), tr = sm(res, "Rafters / truss"), rafS = kind === "truss" ? null : pick(tr, v.raf_sec) || sec("ISMB 400");
    if (kind === "truss") { var fm = String(sm(res, "Frame")).match(/slope\s*([\d.]+)/); if (fm) rise = (span / 2) * Math.tan(+fm[1] * D2R); }
    if (kind === "portal" && /BU/.test(String(v.style)) && rafS && !rafS.D2) rafS.D2 = Math.max(250, rafS.D * 0.55);
    var peb = /tapered/i.test(style);
    if (peb && colS.k === "I" && !(colS.D2 && colS.D2 !== colS.D)) { colS = Object.assign({}, colS, { D: num(v.peb_col_d, 600), D2: num(v.peb_col_d2, 300), B: num(v.peb_b, 200), tf: num(v.peb_tf, 12), tw: num(v.peb_tw, 6) }); }
    if (peb && rafS && !(rafS.D2 && rafS.D2 !== rafS.D)) rafS = Object.assign({}, rafS, { D: num(v.peb_raf_d, 600), D2: num(v.peb_raf_d2, 300), B: num(v.peb_b, 200), tf: num(v.peb_tf, 12), tw: num(v.peb_tw, 6) });
    if (colS && colS.D2 === undefined) colS = Object.assign({}, colS, { D2: colS.D });
    var hm = String(tr).match(/haunch\s*([\d.]+)\s*m/), haunch = kind !== "truss" && (!!hm || (v.haunch !== false && !peb && !/BU/.test(tr)));
    var ft = footing(res, "Footing F1", { L: 2000, B: 2000, D: 400, pL: 700, pB: 500 }), bp = plate(res, { L: 650, B: 300, t: 20 }), an = anchors(res, { n: num(v.n_anchor, 4), d: num(v.anchor_d, 24), L: 950 });
    var gm = sm(res, "Gable"), gableCols = /Gable \(wind\)/.test(String(v.gable || ""));
    var psm = sm(res, "Purlins"), pm = String(psm).match(/@\s*([\d.]+)\s*m/), purlin = pick(psm, v.purlin_sec) || sec("ISMC 125"), girt = pickAfter("x " + sm(res, "Girts"), "x ", v.girt_sec) || sec("ISMC 100"), gm2 = String(sm(res, "Girts")).match(/@\s*([\d.]+)\s*m/);
    var bs = String(sm(res, "Bracing")), rd = bs.match(/roof RD\s*(\d+)/), esS = pickAfter(bs, "eave strut", v.es_sec) || sec("ISMC 150");
    var c = { style: kind, span: span, bay: bay, nb: nb, eave: eave, slope: slope, rise: rise, panels: Math.max(6, 2 * Math.round(span / 2 / 2500)), trussType: tType,
      col: colS, raf: rafS, haunch: haunch, haunchLen: hm ? +hm[1] * 1000 : span / 10, plinth: posn(mm(v.plinth_h), 0, 2000, 300), df: posn(mm(v.df), 500, 6000, 1500),
      footL: ft.L, footB: ft.B, footD: ft.D, pedL: ft.pL, pedB: ft.pB, bpL: bp.L, bpB: bp.B, bpt: bp.t, nAnchor: an.n, anchorD: an.d, anchorLen: an.L, tie: v.tie_beam !== false,
      purlin: purlin, pSp: pm ? +pm[1] * 1000 : posn(mm(v.purlin_spacing), 600, 3000, 1500), sag: v.sag_rods !== false, sagD: num(v.sag_d, 12), eaveStrut: esS, girt: girt, gSp: gm2 ? +gm2[1] * 1000 : posn(mm(v.girt_spacing), 800, 3000, 1800),
      rodD: rd ? +rd[1] : num(v.brace_rod, 20), braceS: /X-angle|K-bracing/.test(String(v.bracing || "")) ? sec(v.brace_sec) : null,
      gableCols: gableCols, gc: sec(v.gc_sec) || sec("ISMB 250"), er: sec(v.er_sec) || sec("ISMB 200"), gcSp: posn(mm(v.gable_col_sp), 2000, 12000, 5000),
      walls: v.clad_walls !== false, open: /Both/.test(String(v.open_sides)) ? 2 : /One/.test(String(v.open_sides)) ? 1 : 0, crane: !!v.crane, craneSpan: mm(v.crane_span), railH: mm(v.rail_h), gantry: null,
      top: kind === "truss" ? pickAfter(tr, "Top chord", v.top_sec) : null, bot: kind === "truss" ? pickAfter(tr, "Bottom chord", v.bot_sec) : null,
      vert: kind === "truss" ? (pickAfter(tr, "Verticals", null) || pickAfter(tr, "Web struts", v.web_sec)) : null, diag: kind === "truss" ? (pickAfter(tr, "Diagonals", null) || pickAfter(tr, "Web ties", v.web_sec)) : null };
    var gt = String(sm(res, "Crane")).match(/gantry\s*(IS\w+\s*\d+)/); if (gt) c.gantry = sec(gt[1]);
    if (c.gantry) c.gantry = { B: c.gantry.B, D: c.gantry.D, tf: c.gantry.tf, tw: c.gantry.tw };
    if (kind === "truss") { c.top = c.top || sec("ISA 100x100x10"); c.bot = c.bot || sec("ISA 75x75x6"); c.vert = c.vert || sec("ISA 75x75x6"); c.diag = c.diag || sec("ISA 75x75x6"); }
    if (c.raf == null) c.raf = sec("ISMB 300");
    var parts = building(v, res, H, c);
    return { name: "Steel shed – " + style, parts: parts };
  });

  T.reg("steel_portal", function (v, res, H) {
    var span = posn(mm(v.span), 3000, 120000, 20000), L = posn(mm(v.length), 3000, 300000, 48000), bay = posn(mm(v.bay), 1500, 20000, 6000), eave = posn(mm(v.eave), 2500, 40000, 7000), slope = posn(v.slope, 2, 40, 10);
    var fm = String(sm(res, "Frames")).match(/(\d+)\s*nos\s*@\s*([\d.]+)/), nf = fm ? +fm[1] : Math.max(2, Math.round(L / bay) + 1), bsp = fm ? +fm[2] * 1000 : L / Math.max(1, nf - 1), nb = Math.max(1, Math.min(60, nf - 1));
    var colS = pick(sm(res, "Columns"), v.col_sec) || sec("ISMB 500"), rafS = pick(sm(res, "Rafters"), v.raf_sec) || sec("ISMB 500");
    var ft = footing(res, "Footing", { L: 2000, B: 2000, D: 400, pL: 0, pB: 0 }), bp = plate(res, { L: 650, B: 300, t: 20 }), bm = String(sm(res, "Base plate")).match(/(\d+)\s*-\s*M(\d+)/);
    var psm = sm(res, "Purlins"), pm = String(psm).match(/@\s*([\d.]+)\s*m/), purlin = pick(psm, v.purlin_sec) || sec("ISMC 125");
    var bpL = bp.L, bpB = bp.B; var pL = ft.pL || bpL + 200, pB = ft.pB || bpB + 200;
    var c = { style: "portal", span: span, bay: bsp, nb: nb, eave: eave, slope: slope, rise: 0, panels: 8, trussType: "Pratt", col: colS, raf: rafS, haunch: true, haunchLen: span / 10,
      plinth: 300, df: posn(mm(v.df), 500, 6000, 1500), footL: ft.L, footB: ft.B, footD: ft.D, pedL: pL, pedB: pB, bpL: bpL, bpB: bpB, bpt: bp.t, nAnchor: bm ? +bm[1] : num(v.n_bolts, 4), anchorD: bm ? +bm[2] : num(v.bolt_d, 24), anchorLen: 950, tie: true,
      purlin: purlin, pSp: pm ? +pm[1] * 1000 : posn(mm(v.purlin_spacing), 600, 3000, 1400), sag: v.sag_rods !== false, sagD: 12, eaveStrut: purlin, girt: sec("ISMC 100"), gSp: 1800, rodD: 20, braceS: null,
      gableCols: false, walls: v.clad_walls !== false, open: 0, crane: false };
    return { name: "Portal frame shed " + span / 1000 + " m span", parts: building(v, res, H, c) };
  });

  /* ---------- roof truss (stand-alone module) ---------- */
  T.reg("steel_truss", function (v, res, H) {
    var span = posn(mm(v.span), 3000, 80000, 15000), L = posn(mm(v.length), 3000, 300000, 30000), eave = posn(mm(v.eave), 2500, 30000, 6000), n = Math.max(4, Math.min(24, Math.round(num(v.panels, 8)))), rise = span / Math.max(2, num(v.rise_ratio, 5));
    var summ = res && res.summary || {}, fm = String(summ.Truss || "").match(/rise\s*([\d.]+)\s*m,\s*(\d+)\s*panels/); if (fm) { rise = +fm[1] * 1000; n = +fm[2]; }
    var tm = String(summ.Trusses || "").match(/(\d+)\s*nos\s*@\s*([\d.]+)/), nt = tm ? +tm[1] : Math.max(2, Math.round(L / posn(mm(v.bay), 1500, 20000, 5000)) + 1), bay = tm ? +tm[2] * 1000 : L / Math.max(1, nt - 1), nb = Math.max(1, Math.min(40, nt - 1));
    var top = pick(summ["Top chord"], v.top_sec) || sec("2-ISA 65x65x6"), bot = pick(summ["Bottom chord"], v.bot_sec) || sec("2-ISA 50x50x6"), wm = String(summ.Webs || "").split("/"), vert = pick(wm[0], v.web_sec) || sec("ISA 75x75x6"), diag = pick(wm[1] || wm[0], v.web_sec) || sec("ISA 75x75x6");
    var purlin = pick(summ.Purlins, v.purlin_sec) || sec("ISMC 100"), colS = sec("ISMB 300");
    var colHalf = 0; var c = { style: "truss", span: span, bay: bay, nb: nb, eave: eave, slope: Math.atan(rise / (span / 2)) / D2R, rise: rise, panels: n, trussType: /Howe/.test(String(v.type)) ? "Howe" : "Pratt", col: colS, raf: sec("ISMB 300"), haunch: false, haunchLen: 0,
      plinth: 300, df: 1500, footL: 1600, footB: 1600, footD: 350, pedL: 600, pedB: 500, bpL: 450, bpB: 300, bpt: 16, nAnchor: 4, anchorD: 20, anchorLen: 800, tie: false, purlin: purlin, pSp: 1500, sag: v.sag_rods !== false, sagD: 12, eaveStrut: purlin, girt: null, gSp: 1800, rodD: 20, braceS: null,
      gableCols: false, walls: false, open: 0, crane: false, top: top, bot: bot, vert: vert, diag: diag };
    return { name: "Roof truss " + c.trussType + " " + span / 1000 + " m", parts: building(v, res, H, c) };
  });

  /* ---------- purlin: a few bays on two rafters per bay, sag rods and sheeting ---------- */
  T.reg("steel_purlin", function (v, res, H) {
    var Bd = Build(H), P = Bd.parts, bay = posn(mm(v.bay), 1500, 20000, 6000), spc = posn(mm(v.spacing), 400, 4000, 1400), slope = posn(v.slope, 0, 45, 10) * D2R, nSp = v.continuous === false ? 1 : 3;
    var ps = pick(sm(res, "Purlin"), v.sec || (v.family === "ISA" ? "ISA 100x100x8" : "ISMC 125")) || sec("ISMC 125"), nl = 5, rafD = 250, ln = bay * nSp, y0 = -ln / 2, tn = Math.tan(slope), cs = Math.cos(slope), sn = Math.sin(slope);
    /* supports: rafters running up the slope (along x) at each bay line */
    var run = spc * (nl - 1) * cs + 600, sl = run / cs, yy = []; for (var i = 0; i <= nSp; i++) yy.push(y0 + i * bay);
    var xr0 = -run / 2, xr1 = run / 2, zr = function (x) { return 3000 + (x - xr0) * tn; };
    yy.forEach(function (y) { Bd.ibeam([xr0, y, zr(xr0)], [xr1, y, zr(xr1)], { B: 125, tf: 12.5, tw: 7, D: rafD, D2: rafD }, 0, 0); P.push(H.box(xr0 - 150, y, 300, 400, 0, zr(xr0) - rafD / 2 - 10, "concrete")); });
    var n1 = [-sn, 0, cs], off = rafD / 2 + (ps.D || 125) / 2 + 5, roll = slope / D2R;
    for (var k = 0; k < nl; k++) {
      var f = nl === 1 ? 0 : k / (nl - 1), px = xr0 + 300 * cs + spc * cs * k, pz = zr(px); var a = [px + n1[0] * off, y0, pz + n1[2] * off], b = [px + n1[0] * off, y0 + ln, pz + n1[2] * off];
      if (ps.k === "A") { Bd.angles(a, b, Object.assign({}, ps, { dbl: false }), roll, false); } else Bd.chan(a, b, ps, roll, -1);
      for (var s = 0; s < nSp; s++) { /* cleat plate at the rafter */ var yc = yy[s]; P.push(H.member([a[0], yc - 2, a[2] - (ps.D || 125) / 2], [a[0], yc + 2, a[2] - (ps.D || 125) / 2], 100, 8, STEEL, roll)); }
      if (v.sag_rods !== false && k + 1 < nl) for (s = 0; s < nSp; s++) { var ym = y0 + (s + 0.5) * bay, px2 = px + spc * cs, pz2 = zr(px2); Bd.rod([px + n1[0] * off, ym, pz + n1[2] * off], [px2 + n1[0] * off, ym, pz2 + n1[2] * off], 12); }
    }
    var so = off + (ps.D || 125) / 2 + 10; var sa = xr0 + 300 * cs - spc * cs * 0.5, sb = xr0 + 300 * cs + spc * cs * (nl - 1) + spc * cs * 0.5;
    P.push(H.quad([sa + n1[0] * so, y0, zr(sa) + n1[2] * so], [sb + n1[0] * so, y0, zr(sb) + n1[2] * so], [sb + n1[0] * so, y0 + ln, zr(sb) + n1[2] * so], [sa + n1[0] * so, y0 + ln, zr(sa) + n1[2] * so], "sheet_gi"));
    return { name: "Purlin " + ps.name + " (" + nSp + " bay" + (nSp > 1 ? "s" : "") + ")", parts: P };
  });

  /* ---------- steel beam on supports ---------- */
  T.reg("steel_beam", function (v, res, H) {
    var Bd = Build(H), P = Bd.parts, span = posn(mm(v.span), 500, 40000, 6000), cant = /Cantilever/.test(String(v.support || "")), s = pick(sm(res, "Section"), v.sec || "ISMB 300") || sec("ISMB 300"), x0 = -span / 2, x1 = span / 2, zc = 3000, bear = posn(v.bearing, 60, 500, 100), n = Math.max(1, Math.min(4, Math.round(num(v.nos, 1)))), sp = 1500;
    function oneBeam(y) {
      var zt = zc + s.D / 2, zb = zc - s.D / 2;
      if (s.k === "C") Bd.chan([x0, y, zc], [x1, y, zc], s, 0, -1); else Bd.ibeam([x0, y, zc], [x1, y, zc], { B: s.B, tf: s.tf, tw: s.tw, D: s.D, D2: s.D }, 0, 0);
      var sw = Math.max(200, bear + 120), bh = 800, tp = 12, bw = Math.max(s.B + 40, 150);
      if (cant) { /* built into a wall at x0 */ P.push(H.bx(x0 - 450, y - 700, x0, y + 700, zb - 600, zt + 700, "brick")); P.push(H.member([x0, y, zb - tp / 2], [x0 + 400, y, zb - tp / 2], bw + 60, tp, STEEL, 0)); }
      else { [x0, x1].forEach(function (x, i) { var sgn = i === 0 ? 1 : -1; P.push(H.bx(x - sw / 2 - 200, y - 400, x + sw / 2 + 200, y + 400, zb - 650, zb - tp, "concrete")); P.push(H.box(x + sgn * bear / 2 - sgn * 0, y, sw, bw + 20, zb - tp, zb, "steel_member")); }); }
      var st = [cant ? x0 + 60 : x0 + 60, x1 - 60]; if (!cant) st.push(x0 + s.tw + 40); st.forEach(function (x) { var wsd = (s.B - s.tw) / 2; P.push(H.box(x, y + s.tw / 2 + wsd / 2, 8, wsd, zb + s.tf, zt - s.tf, "steel_member")); P.push(H.box(x, y - s.tw / 2 - wsd / 2, 8, wsd, zb + s.tf, zt - s.tf, "steel_member")); });
      if (num(v.point, 0) > 0) { var xp = cant ? x1 - 60 : 0; P.push(H.box(xp, y, 10, s.B, zb + s.tf, zt - s.tf, "steel_member")); P.push(H.cyl(xp, y, 25, zt, zt + 400, "steel_member")); P.push(H.cyl(xp, y, 90, zt + 380, zt + 400, "steel_member", 25)); }
    }
    for (var i = 0; i < n; i++) oneBeam((i - (n - 1) / 2) * sp);
    return { name: "Steel beam " + s.name + (cant ? " (cantilever)" : " (simply supported)"), parts: P };
  });

  /* ---------- steel column + base plate + pedestal ---------- */
  T.reg("steel_column", function (v, res, H) {
    var Bd = Build(H), P = Bd.parts, h = posn(mm(v.height), 1000, 40000, 6000), s = pick(sm(res, "Section"), v.sec || "ISHB 350") || sec("ISHB 350"), bm = String(sm(res, "Base plate")).match(/(\d+)\s*[×x]\s*(\d+)\s*[×x]\s*(\d+)/);
    var bpL = bm ? +bm[1] : Math.max(s.D + 150, 400), bpB = bm ? +bm[2] : Math.max(s.B + 100, 300), tp = bm ? +bm[3] : 20, boltD = posn(v.bolt_d, 12, 50, 24), fixed = /Fixed/.test(String(v.base || "")), pad = 150;
    var ped = 400, zb = ped + tp, nb = fixed || num(v.uplift, 0) > 0 ? 6 : 4;
    P.push(H.box(0, 0, bpL + 2 * pad + 300, bpB + 2 * pad + 300, -700, -700 + 400, "concrete"));
    P.push(H.box(0, 0, bpL + 2 * pad, bpB + 2 * pad, -300, ped, "concrete"));
    P.push(H.box(0, 0, bpL, bpB, ped, ped + tp, "steel_member"));
    for (var a = 0; a < nb; a++) { var cx = (a % 2 ? 1 : -1) * (bpL / 2 - 45) * (nb > 4 && a >= 4 ? 0 : 1), cy = a < 2 ? -(bpB / 2 - 45) : a < 4 ? (bpB / 2 - 45) : (a === 4 ? -(bpB / 2 - 45) * 0 + 0 : 0); if (nb === 6 && a >= 4) { cx = (a === 4 ? -1 : 1) * (bpL / 2 - 45); cy = 0; } P.push(H.cyl(cx, cy, boltD / 2, ped - 450, ped + tp + 70, "steel_member")); P.push(H.box(cx, cy, boltD * 2, boltD * 2, ped + tp + 35, ped + tp + 35 + boltD * 0.8, "steel_member")); }
    var top = zb + h; Bd.ibeam([0, 0, zb], [0, 0, top], { B: s.B, tf: s.tf, tw: s.tw, D: s.D, D2: s.D }, 90, 0);
    /* gusset ribs on a fixed base (along the web) */
    var gh = Math.min(400, h * 0.15); if (fixed) [-1, 1].forEach(function (sg) { var xg = sg * (s.D / 2 + 2); P.push(H.prism([[xg, -s.B / 4], [xg + sg * (bpL / 2 - s.D / 2 - 10), -s.B / 4], [xg, s.B / 4]], zb, zb + 1, "steel_member")); P.push(H.box(sg * (s.D / 2 + (bpL / 2 - s.D / 2) / 2), 0, bpL / 2 - s.D / 2 - 15, 12, zb, zb + gh * 0.5, "steel_member")); P.push(H.box(sg * (s.D / 2 + (bpL / 2 - s.D / 2) / 4), 0, (bpL / 2 - s.D / 2) / 2 - 8, 12, zb + gh * 0.5, zb + gh, "steel_member")); });
    /* cap plate */
    P.push(H.box(0, 0, s.D + 60, s.B + 60, top, top + 12, "steel_member"));
    var nn = Math.max(1, Math.min(4, Math.round(num(v.nos, 1)))); if (nn > 1) { var base = P.slice(); for (var q = 1; q < nn; q++) base.forEach(function (p) { var cp = JSON.parse(JSON.stringify(p)); var dx = q * (bpL + 2 * pad + 1500); if (cp[0] === "b" || cp[0] === "c" || cp[0] === "t") cp[1] += dx; else if (cp[0] === "p") cp[1] = cp[1].map(function (pt) { return [pt[0] + dx, pt[1]]; }); else if (cp[0] === "i" || cp[0] === "m") { cp[1][0] += dx; cp[2][0] += dx; } P.push(cp); }); }
    return { name: "Steel column " + s.name + (fixed ? " – fixed base" : " – pinned base"), parts: P };
  });

  /* two-wheeler / cycle parking shed (modules_extra6 "cycle_shed"): posts, rafters, purlins, sheet roof, pedestals and footings,
     and the floor / kerb / stands chosen in "Along with the design" */
  T.reg("cycle_shed", function (v, res, H) {
    var W = posn(mm(v.width), 1500, 20000, 4500), Lt = posn(mm(v.length), 3000, 300000, 30000), bay = posn(mm(v.bay), 1500, 8000, 3000), Hc = posn(mm(v.height), 1800, 6000, 2400), th = posn(v.slope, 0, 25, 5) * Math.PI / 180, ov = posn(mm(v.overhang), 0, 1500, 300);
    var sch = String(v.scheme || ""), one = /One row/.test(sch), tee = one && /T \(/.test(sch), RL = /Rolled/.test(String(v.members || ""));
    var tube = function (t, fb) { var m = String(t || "").match(/(SHS|RHS)\s*(\d+)\s*[×x]\s*(\d+)\s*[×x]\s*([\d.]+)/); return m ? { k: "T", D: +m[2], B: +m[3], name: m[0] } : fb; };
    var ps = function (k, fbT, fbR) { var t = sm(res, k); return tube(t) || pick(t) || (RL ? sec(fbR) : { k: "T", D: fbT[0], B: fbT[1] }); };
    var post = ps("Posts", [80, 80], "ISMB 125"), raf = ps("Rafters", [122, 61], "ISMC 125"), pur = ps("Purlins", [66, 33], "ISMC 75");
    var nf = Math.max(2, Math.round(Lt / bay) + 1), bsp = Lt / (nf - 1), x0 = -Lt / 2, tn = Math.tan(th), P = [];
    var mem = function (a, b, s, roll) { if (s.k === "I") P.push(H.ibeam(a, b, s.B, s.D, s.tf, s.tw, "steel_member", roll || 0)); else if (s.k === "C") P.push(H.member(a, b, s.B, s.D, "steel_member", roll || 0)); else P.push(H.member(a, b, s.B, s.D, "paint_pure_white", roll || 0)); };
    /* post rows (y) and the roof line z(y) */
    var yLo = -W / 2 + ov, yHi = W / 2 - ov, rows = one ? [tee ? 0 : yLo] : [yLo, yHi], ridge = tee ? 0 : null;
    var zAt = function (y) { return ridge != null ? Hc + (W / 2 - Math.abs(y)) * tn : Hc + (y - yLo) * tn; };
    var fm = String(sm(res, "Footings")).match(/([\d.]+)\s*m sq\s*×\s*(\d+)/), fB = fm ? +fm[1] * 1000 : 900, fT = fm ? +fm[2] : 300, df = posn(mm(v.found_depth), 500, 3000, 1200), pa = posn(mm(v.ped_above), 0, 1000, 300);
    var bm = String(sm(res, "Base")).match(/(\d+)\s*sq\s*×\s*(\d+)/), bpS = bm ? +bm[1] : 250, bpT = bm ? +bm[2] : 12, ped = Math.max(300, bpS + 100);
    for (var i = 0; i < nf; i++) { var x = x0 + i * bsp;
      rows.forEach(function (y) { var zt = zAt(y);
        P.push(H.box(x, y, fB, fB, -df, -df + fT, "concrete"), H.box(x, y, ped, ped, -df + fT, pa, "concrete"), H.box(x, y, bpS, bpS, pa, pa + bpT, "steel_member"));
        mem([x, y, pa + bpT], [x, y, zt - (raf.D || 100)], post, 0); });
      /* rafter across the full width */
      var rd = raf.D || 100; if (ridge != null) { mem([x, -W / 2, zAt(-W / 2) - rd / 2], [x, 0, zAt(0) - rd / 2], raf, 0); mem([x, 0, zAt(0) - rd / 2], [x, W / 2, zAt(W / 2) - rd / 2], raf, 0); }
      else mem([x, -W / 2, zAt(-W / 2) - rd / 2], [x, W / 2, zAt(W / 2) - rd / 2], raf, 0);
      if (one && !tee && i < nf) { var yk = yLo, zk = zAt(yk) - rd; mem([x, yk, zk - Math.min(900, W * 0.25) * tn - 600], [x, yk + Math.min(1200, W * 0.3), zk], { k: "T", D: 60, B: 60 }, 0); }   /* knee brace of the cantilever */
    }
    /* purlins along the length */
    var pm = String(sm(res, "Purlins")).match(/@\s*([\d.]+)\s*m/), psp = pm ? +pm[1] * 1000 : posn(mm(v.purlin_s), 600, 2000, 1200), npl = Math.max(2, Math.round(W / psp) + 1), rdz = raf.D || 100;
    for (var k = 0; k < npl; k++) { var y2 = -W / 2 + 50 + (W - 100) * k / (npl - 1), z2 = zAt(y2) + (pur.D || 60) / 2; mem([x0 - 150, y2, z2], [-x0 + 150, y2, z2], pur, 0); }
    /* roof sheet */
    var zs = function (y) { return zAt(y) + (pur.D || 60) + 5; };
    if (ridge != null) { P.push(H.quad([x0 - 200, -W / 2, zs(-W / 2)], [-x0 + 200, -W / 2, zs(-W / 2)], [-x0 + 200, 0, zs(0)], [x0 - 200, 0, zs(0)], "sheet_blue")); P.push(H.quad([x0 - 200, 0, zs(0)], [-x0 + 200, 0, zs(0)], [-x0 + 200, W / 2, zs(W / 2)], [x0 - 200, W / 2, zs(W / 2)], "sheet_blue")); }
    else P.push(H.quad([x0 - 200, -W / 2, zs(-W / 2)], [-x0 + 200, -W / 2, zs(-W / 2)], [-x0 + 200, W / 2, zs(W / 2)], [x0 - 200, W / 2, zs(W / 2)], "sheet_blue"));
    void rdz;
    /* along with the design: floor, kerb and stands */
    var fl = String(v.x_floor || "");
    if (fl && fl !== "None") P.push(H.box(0, 0, Lt, W, -80, 0, /Paver/.test(fl) ? "paver_grey" : "concrete"));
    if (v.x_kerb) { P.push(H.box(0, -W / 2 - 50, Lt + 200, 100, -200, 100, "concrete"), H.box(0, W / 2 + 50, Lt + 200, 100, -200, 100, "concrete"), H.box(-Lt / 2 - 50, 0, 100, W, -200, 100, "concrete"), H.box(Lt / 2 + 50, 0, 100, W, -200, 100, "concrete")); }
    if (v.x_stand) { var nS = Math.floor(Lt / 900), sides = W >= 4000 ? [-1, 1] : [-1]; sides.forEach(function (sd) { for (var j = 0; j < nS; j++) { var xs = x0 + 450 + j * 900, ys = sd * (W / 2 - 500); P.push(H.member([xs - 120, ys, 0], [xs - 120, ys, 350], 25, 25, "steel_member"), H.member([xs + 120, ys, 0], [xs + 120, ys, 350], 25, 25, "steel_member"), H.member([xs - 120, ys, 350], [xs + 120, ys, 350], 25, 25, "steel_member")); } }); }
    return { name: "Two-wheeler parking shed " + (W / 1000) + " × " + (Lt / 1000) + " m" + (RL ? " (rolled)" : " (tubular)"), parts: P };
  });
})();
