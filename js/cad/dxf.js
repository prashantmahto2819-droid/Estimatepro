/* Estimate Pro CAD — DXF import (R12 … 2018 ASCII) and export (R12, opens in every CAD program).
   Import: LINE, LWPOLYLINE, POLYLINE(2D/3D), CIRCLE, ARC, ELLIPSE, SPLINE, TEXT, MTEXT, ATTRIB, POINT, INSERT (+ arrays), DIMENSION (its block),
           HATCH (polyline and line/arc/ellipse/spline edges), SOLID, 3DFACE, TRACE, LEADER, XLINE, RAY; layers with colour / linetype / lineweight /
           on-off / frozen / locked; blocks; $INSUNITS (or the unit chosen by the user) → model millimetres; OCS mirrored entities (extrusion 0,0,-1).
   Not imported (counted and reported): 3DSOLID / REGION / BODY (ACIS), MESH, IMAGE, OLE2FRAME, WIPEOUT, VIEWPORT, MLINE, paper-space entities.
   DWG is a closed Autodesk format: convert DWG → DXF with the free ODA File Converter first. */
(function () {
  "use strict";
  var EP = window.EP = window.EP || {}, G = EP.geom, CAD = EP.cad = EP.cad || {};
  var UNITS = { 0: null, 1: 25.4, 2: 304.8, 3: 1609344, 4: 1, 5: 10, 6: 1000, 7: 1e6, 8: 25.4e-6, 9: 0.0254, 10: 914.4, 14: 100, 15: 10000 };
  var UNIT_NAME = { 1: "inches", 2: "feet", 3: "miles", 4: "millimetres", 5: "centimetres", 6: "metres", 7: "kilometres", 10: "yards" };

  function tokens(text) {
    var L = text.split(/\r\n|\r|\n/), out = [];
    for (var i = 0; i + 1 < L.length; i += 2) { var c = parseInt(L[i].trim(), 10); if (isNaN(c)) { i--; continue; } out.push([c, L[i + 1].replace(/\s+$/, "")]); }
    return out;
  }
  function decodeText(s) {
    s = String(s || "");
    s = s.replace(/%%[cC]/g, "Ø").replace(/%%[dD]/g, "°").replace(/%%[pP]/g, "±").replace(/%%[uUoO]/g, "").replace(/%%%/g, "%");
    s = s.replace(/\\U\+([0-9A-Fa-f]{4})/g, function (m, h) { return String.fromCharCode(parseInt(h, 16)); });
    return s;
  }
  function mtextPlain(s) {
    s = decodeText(s);
    s = s.replace(/\\P/g, "\n").replace(/\\~/g, " ").replace(/\\[ACFHQTW][^;]*;/gi, "").replace(/\\S([^;]*)\^([^;]*);/g, "$1/$2").replace(/\\S([^;]*)#([^;]*);/g, "$1/$2").replace(/\\[LlOoKk]/g, "").replace(/\\p[^;]*;/g, "");
    s = s.replace(/[{}]/g, "").replace(/\\\\/g, "\\");
    return s;
  }
  function aciOrTrue(rec) { var tc = rec[420]; if (tc != null) { var v = +tc; return "#" + ("00000" + v.toString(16)).slice(-6); } var c = rec[62]; if (c == null) return null; c = +c; if (c === 256 || c === 0) return null; return Math.abs(c); }

  /* group the token stream into records: { type, codes: [[c, v]…], 10: first value… } */
  function records(T, i, endTypes) {
    var out = [], cur = null;
    for (; i < T.length; i++) {
      var c = T[i][0], v = T[i][1];
      if (c === 0) { if (cur) out.push(cur); if (endTypes.indexOf(v) >= 0) return { recs: out, i: i }; cur = { type: v, codes: [] }; continue; }
      if (cur) { cur.codes.push([c, v]); if (cur[c] === undefined) cur[c] = v; }
    }
    if (cur) out.push(cur); return { recs: out, i: i };
  }
  function all(rec, code) { return rec.codes.filter(function (x) { return x[0] === code; }).map(function (x) { return x[1]; }); }

  function parse(text, opts) {
    opts = opts || {};
    var T = tokens(text), header = {}, layers = {}, blocks = {}, ents = [], skipped = {}, i = 0, ltypes = {};
    function skip(t) { skipped[t] = (skipped[t] || 0) + 1; }
    while (i < T.length) {
      if (T[i][0] === 0 && T[i][1] === "SECTION" && T[i + 1] && T[i + 1][0] === 2) {
        var name = T[i + 1][1]; i += 2;
        if (name === "HEADER") { var key = null; for (; i < T.length && !(T[i][0] === 0 && T[i][1] === "ENDSEC"); i++) { if (T[i][0] === 9) key = T[i][1]; else if (key && header[key] === undefined) header[key] = T[i][1]; } }
        else if (name === "TABLES") {
          var r = records(T, i, ["ENDSEC"]); i = r.i;
          r.recs.forEach(function (x) {
            if (x.type === "LAYER" && x[2] != null) { var col = x[62] != null ? +x[62] : 7, fl = +(x[70] || 0); layers[x[2]] = { color: x[420] != null ? aciOrTrue(x) : Math.abs(col) || 7, lw: x[370] != null && +x[370] >= 0 ? +x[370] / 100 : 0.25, lt: (x[6] || "CONTINUOUS").toUpperCase(), on: col >= 0, frz: !!(fl & 1), lock: !!(fl & 4) }; }
            if (x.type === "LTYPE" && x[2]) { var dashes = all(x, 49).map(Number); ltypes[x[2].toUpperCase()] = dashes; }
          });
        }
        else if (name === "BLOCKS") {
          var rb = records(T, i, ["ENDSEC"]); i = rb.i; var curB = null, bl = [];
          rb.recs.forEach(function (x) {
            if (x.type === "BLOCK") { curB = { name: x[2] || x[3], base: [+(x[10] || 0), +(x[20] || 0)], raw: [], flags: +(x[70] || 0) }; return; }
            if (x.type === "ENDBLK") { if (curB) bl.push(curB); curB = null; return; }
            if (curB) curB.raw.push(x);
          });
          bl.forEach(function (b) { blocks[b.name] = b; });
        }
        else if (name === "ENTITIES") { var re = records(T, i, ["ENDSEC"]); i = re.i; ents = re.recs; }
        else { while (i < T.length && !(T[i][0] === 0 && T[i][1] === "ENDSEC")) i++; }
      }
      i++;
    }
    // units
    var ins = header.$INSUNITS != null ? +header.$INSUNITS : 0, k = opts.unitMm || UNITS[ins] || null, guessed = false;
    if (!k) { k = 1; guessed = true; }
    var res = { layers: layers, blocks: {}, ents: [], skipped: skipped, header: header, insunits: ins, unitName: UNIT_NAME[ins] || "not set", k: k, guessed: guessed, ltypes: ltypes };
    var S = function (v) { return +v * k; };
    function conv(list, out, inBlock) {
      for (var j = 0; j < list.length; j++) {
        var x = list[j], t = x.type;
        if (!inBlock && +(x[67] || 0) === 1) { skip("paper space"); continue; }
        var base = { layer: x[8] || "0" }, col = aciOrTrue(x); if (col != null) base.color = col;
        if (x[6] && !/^BY(LAYER|BLOCK)$/i.test(x[6])) base.lt = x[6].toUpperCase();
        if (x[370] != null && +x[370] >= 0) base.lw = +x[370] / 100;
        var ocs = +(x[230] || 1) < 0, fx = function (p) { return ocs ? [-p[0], p[1]] : p; };
        var P = function (cx, cy) { return fx([S(x[cx] || 0), S(x[cy] || 0)]); };
        var e = null;
        switch (t) {
          case "LINE": e = { t: "line", a: [S(x[10]), S(x[20])], b: [S(x[11]), S(x[21])] }; break;
          case "POINT": e = { t: "point", p: [S(x[10]), S(x[20])] }; break;
          case "CIRCLE": e = { t: "circle", c: P(10, 20), r: S(x[40]) }; break;
          case "ARC": var a1 = +x[50], a2 = +x[51]; if (ocs) { var t1 = 180 - a2, t2 = 180 - a1; a1 = t1; a2 = t2; } e = { t: "arc", c: P(10, 20), r: S(x[40]), a1: a1, a2: a2 }; break;
          case "ELLIPSE":
            var mj = [S(x[11]), S(x[21])], rx = Math.hypot(mj[0], mj[1]), rot = Math.atan2(mj[1], mj[0]) * 180 / Math.PI, p1 = +(x[41] || 0), p2 = x[42] != null ? +x[42] : Math.PI * 2;
            e = { t: "ellipse", c: [S(x[10]), S(x[20])], rx: rx, ry: rx * +x[40], rot: rot };
            if (Math.abs(p2 - p1 - Math.PI * 2) > 1e-6 && Math.abs(p2 - p1) > 1e-9) { e.a1 = p1 * 180 / Math.PI; e.a2 = p2 * 180 / Math.PI; }
            if (+(x[230] || 1) < 0) { e.c[0] = -e.c[0]; e.rot = 180 - e.rot; if (e.a1 != null) { var b1 = -e.a2, b2 = -e.a1; e.a1 = b1; e.a2 = b2; } }
            break;
          case "LWPOLYLINE":
            var pts = [], bul = 0; x.codes.forEach(function (cv) { if (cv[0] === 10) pts.push([S(cv[1]), 0, 0]); else if (cv[0] === 20 && pts.length) pts[pts.length - 1][1] = S(cv[1]); else if (cv[0] === 42 && pts.length) pts[pts.length - 1][2] = +cv[1]; });
            if (ocs) pts = pts.map(function (p) { return [-p[0], p[1], -p[2]]; });
            e = { t: "pline", pts: pts, closed: !!(+(x[70] || 0) & 1) }; if (+(x[43] || 0) > 0) e.w = S(x[43]); bul = bul; break;
          case "POLYLINE":
            var fl = +(x[70] || 0); if (fl & 16 || fl & 64) { skip("POLYLINE mesh"); while (j + 1 < list.length && list[j + 1].type !== "SEQEND") j++; j++; continue; }
            var vp = []; while (j + 1 < list.length && list[j + 1].type === "VERTEX") { j++; var v = list[j], vf = +(v[70] || 0); if (vf & 16) continue; vp.push([S(v[10] || 0), S(v[20] || 0), +(v[42] || 0)]); }
            if (j + 1 < list.length && list[j + 1].type === "SEQEND") j++;
            if (ocs) vp = vp.map(function (p) { return [-p[0], p[1], -p[2]]; });
            e = { t: "pline", pts: vp, closed: !!(fl & 1) }; break;
          case "SPLINE":
            var fit = [], ctr = [], knots = all(x, 40).map(Number), deg = +(x[71] || 3);
            x.codes.forEach(function (cv) { if (cv[0] === 11) fit.push([S(cv[1]), 0]); else if (cv[0] === 21 && fit.length) fit[fit.length - 1][1] = S(cv[1]); else if (cv[0] === 10) ctr.push([S(cv[1]), 0]); else if (cv[0] === 20 && ctr.length) ctr[ctr.length - 1][1] = S(cv[1]); });
            var closedS = !!(+(x[70] || 0) & 1);
            if (ctr.length >= 2 && knots.length === ctr.length + deg + 1) e = { t: "pline", pts: bspline(ctr, knots, deg, all(x, 41).map(Number)).map(function (p) { return [p[0], p[1], 0]; }), closed: closedS };
            else if (fit.length >= 2) e = { t: "spline", pts: fit, closed: closedS };
            else if (ctr.length >= 2) e = { t: "pline", pts: ctr.map(function (p) { return [p[0], p[1], 0]; }), closed: closedS };
            break;
          case "TEXT": case "ATTRIB":
            if (t === "ATTRIB" && (+(x[70] || 0) & 1)) break;
            var h72 = +(x[72] || 0), v73 = +(x[t === "ATTRIB" ? 74 : 73] || 0), useAl = (h72 || v73) && x[11] != null;
            e = { t: "text", p: useAl ? [S(x[11]), S(x[21])] : [S(x[10]), S(x[20])], s: decodeText(x[1]), h: S(x[40] || 2.5), rot: +(x[50] || 0), al: ({ 0: "l", 1: "c", 2: "r", 3: "l", 4: "c", 5: "l" }[h72] || "l") + ({ 0: "", 1: "b", 2: "m", 3: "t" }[v73] || (h72 === 4 ? "m" : "")) };
            if (ocs) { e.p[0] = -e.p[0]; e.rot = 180 - e.rot; }
            break;
          case "MTEXT":
            var txt = all(x, 3).join("") + (x[1] || ""), att = +(x[71] || 1), rotM = x[50] != null ? +x[50] : (x[11] != null ? Math.atan2(+x[21], +x[11]) * 180 / Math.PI : 0);
            e = { t: "text", p: [S(x[10]), S(x[20])], s: mtextPlain(txt), h: S(x[40] || 2.5), rot: rotM, al: ["l", "c", "r"][(att - 1) % 3] + ["t", "m", "b"][Math.floor((att - 1) / 3)], mt: true }; break;
          case "INSERT":
            var nm = x[2], cols = +(x[70] || 1), rows = +(x[71] || 1), dc = S(x[44] || 0), dr = S(x[45] || 0), rr = +(x[50] || 0) * Math.PI / 180;
            for (var ci = 0; ci < Math.max(1, cols); ci++) for (var ri = 0; ri < Math.max(1, rows); ri++) {
              var off = [ci * dc * Math.cos(rr) - ri * dr * Math.sin(rr), ci * dc * Math.sin(rr) + ri * dr * Math.cos(rr)], ip = [S(x[10] || 0) + off[0], S(x[20] || 0) + off[1]];
              var ie = Object.assign({ t: "insert", block: nm, p: ocs ? [-ip[0], ip[1]] : ip, sx: +(x[41] || 1) * (ocs ? -1 : 1), sy: +(x[42] || 1), rot: ocs ? -(+(x[50] || 0)) : +(x[50] || 0) }, base);
              out.push(ie);
            }
            // attributes that follow
            while (j + 1 < list.length && (list[j + 1].type === "ATTRIB" || list[j + 1].type === "SEQEND")) { j++; if (list[j].type === "ATTRIB") conv([list[j]], out, inBlock); }
            continue;
          case "DIMENSION":
            if (x[2] && blocks[x[2]]) e = { t: "insert", block: x[2], p: [0, 0], sx: 1, sy: 1, rot: 0, dimtxt: x[1] || "" };
            else skip("DIMENSION without block"); break;
          case "HATCH": e = hatch(x, S); if (e && ocs) { e.loops = e.loops.map(function (L) { return L.map(function (p) { return [-p[0], p[1], -(p[2] || 0)]; }); }); } break;
          case "SOLID": case "TRACE": case "3DFACE":
            var q = [[S(x[10]), S(x[20])], [S(x[11]), S(x[21])], [S(x[t === "3DFACE" ? 12 : 13] || x[12]), S(x[t === "3DFACE" ? 22 : 23] || x[22])], [S(x[t === "3DFACE" ? 13 : 12] || x[12]), S(x[t === "3DFACE" ? 23 : 22] || x[22])]];
            if (G.eq(q[2], q[3], 1e-9)) q.pop();
            e = t === "3DFACE" ? { t: "pline", pts: q.map(function (p) { return [p[0], p[1], 0]; }), closed: true } : { t: "hatch", pat: "SOLID", loops: [q.map(function (p) { return [p[0], p[1], 0]; })] }; break;
          case "LEADER": var lp = []; x.codes.forEach(function (cv) { if (cv[0] === 10) lp.push([S(cv[1]), 0]); else if (cv[0] === 20 && lp.length) lp[lp.length - 1][1] = S(cv[1]); }); e = { t: "leader", pts: lp }; break;
          case "XLINE": case "RAY": e = { t: t.toLowerCase(), p: [S(x[10]), S(x[20])], dir: [+x[11], +x[21]] }; break;
          case "SEQEND": case "VERTEX": case "ATTDEF": continue;
          default: skip(t); continue;
        }
        if (e) out.push(Object.assign(e, base));
      }
      return out;
    }
    Object.keys(blocks).forEach(function (n) { var b = blocks[n]; res.blocks[n] = { base: [S(b.base[0]), S(b.base[1])], ents: conv(b.raw, [], true), anon: n[0] === "*" }; });
    res.ents = conv(ents, [], false);
    // drop empty / missing block inserts
    res.ents = res.ents.filter(function (e) { return e.t !== "insert" || (res.blocks[e.block] && res.blocks[e.block].ents.length); });
    Object.keys(res.layers).forEach(function (n) { var L = res.layers[n]; if (ltypes[L.lt] === undefined && L.lt !== "CONTINUOUS" && !CAD.LTYPES[L.lt]) L.lt = "DASHED"; });
    res.ents.concat([].concat.apply([], Object.keys(res.blocks).map(function (n) { return res.blocks[n].ents; }))).forEach(function (e) { if (!res.layers[e.layer]) res.layers[e.layer] = { color: 7, lw: 0.25, lt: "CONTINUOUS", on: true, frz: false, lock: false }; });
    return res;
  }

  function hatch(x, S) {
    var C = x.codes, i = 0, loops = [], pat = (x[2] || "ANSI31").toUpperCase(), solid = +(x[70] || 0) === 1;
    while (i < C.length && C[i][0] !== 91) i++;
    if (i >= C.length) return null;
    var nPaths = +C[i][1]; i++;
    function rd(code) { while (i < C.length && C[i][0] !== code) i++; if (i >= C.length) return null; return C[i++][1]; }
    for (var p = 0; p < nPaths; p++) {
      var flags = +rd(92), loop = [];
      if (flags & 2) {
        var hasB = +rd(72), closed = +rd(73), nv = +rd(93);
        for (var v = 0; v < nv; v++) { var X = S(rd(10)), Y = S(rd(20)), B = 0; if (hasB) { if (C[i] && C[i][0] === 42) { B = +C[i][1]; i++; } } loop.push([X, Y, B]); }
      } else {
        var ne = +rd(93);
        for (var k = 0; k < ne; k++) {
          var et = +rd(72);
          if (et === 1) { var a = [S(rd(10)), S(rd(20))], b = [S(rd(11)), S(rd(21))]; addPt(loop, a, 0); addPt(loop, b, 0); }
          else if (et === 2) { var c = [S(rd(10)), S(rd(20))], r = S(rd(40)), s0 = +rd(50), s1 = +rd(51), ccw = +rd(73);
            var A0 = s0 * Math.PI / 180, A1 = s1 * Math.PI / 180; if (!ccw) { A0 = -A0; A1 = -A1; }
            var P0 = G.polar(c, r, A0), P1 = G.polar(c, r, A1), sw = ccw ? G.an(A1 - A0) : -G.an(A0 - A1); addPt(loop, P0, Math.tan(sw / 4)); addPt(loop, P1, 0); }
          else if (et === 3) { var ec = [S(rd(10)), S(rd(20))], mj = [S(rd(11)), S(rd(21))], rat = +rd(40), e0 = +rd(50), e1 = +rd(51), eccw = +rd(73), rx = Math.hypot(mj[0], mj[1]);
            var pts = G.approxEllipse({ c: ec, rx: rx, ry: rx * rat, rot: Math.atan2(mj[1], mj[0]) * 180 / Math.PI, a1: eccw ? e0 : -e1, a2: eccw ? e1 : -e0 }, 48); if (!eccw) pts.reverse(); pts.forEach(function (q) { addPt(loop, q, 0); }); }
          else if (et === 4) { var deg = +rd(94); rd(73); rd(74); var nk = +rd(95), nc = +rd(96), kn = [], cp = []; for (var q1 = 0; q1 < nk; q1++) kn.push(+rd(40)); for (var q2 = 0; q2 < nc; q2++) cp.push([S(rd(10)), S(rd(20))]);
            bspline(cp, kn, deg, []).forEach(function (q) { addPt(loop, q, 0); }); }
        }
      }
      if (loop.length > 2) { if (G.eq(loop[0], loop[loop.length - 1], 1e-6)) loop.pop(); loops.push(loop); }
      // skip source boundary handles
      if (C[i] && C[i][0] === 97) { var nb = +C[i][1]; i++; for (var h = 0; h < nb && C[i] && C[i][0] === 330; h++) i++; }
    }
    if (!loops.length) return null;
    var e = { t: "hatch", pat: solid ? "SOLID" : (EP.cad.HATCH && EP.cad.HATCH[pat] ? pat : "ANSI31"), loops: loops, sc: +(x[41] || 1), ang: +(x[52] || 0) };
    if (!solid && !(EP.cad.HATCH && EP.cad.HATCH[pat])) e.patSrc = pat;
    return e;
  }
  function addPt(loop, p, b) { if (loop.length && G.eq(loop[loop.length - 1], p, 1e-6)) { if (b) loop[loop.length - 1][2] = b; return; } loop.push([p[0], p[1], b]); }
  /* non-uniform B-spline (de Boor), weights optional */
  function bspline(P, U, p, W) {
    var n = P.length, out = [], a = U[p], b = U[n], steps = Math.max(16, n * 8);
    for (var s = 0; s <= steps; s++) {
      var u = a + (b - a) * s / steps; if (s === steps) u = b - 1e-10;
      var k = p; while (k < n - 1 && U[k + 1] <= u) k++;
      var d = [];
      for (var j = 0; j <= p; j++) { var w = W.length ? W[k - p + j] : 1, q = P[k - p + j]; d.push([q[0] * w, q[1] * w, w]); }
      for (var r = 1; r <= p; r++) for (var j2 = p; j2 >= r; j2--) { var i2 = k - p + j2, den = U[i2 + p - r + 1] - U[i2], al = den ? (u - U[i2]) / den : 0; d[j2] = [0, 1, 2].map(function (z) { return (1 - al) * d[j2 - 1][z] + al * d[j2][z]; }); }
      out.push([d[p][0] / d[p][2], d[p][1] / d[p][2]]);
    }
    return out;
  }

  /* guess the unit of a drawing with no $INSUNITS from the size of its extents */
  function guessUnit(res) {
    var b = [Infinity, Infinity, -Infinity, -Infinity];
    res.ents.forEach(function (e) { if (e.t === "xline" || e.t === "ray") return; try { var x = G.bbox(e, res.blocks); if (isFinite(x[0])) { G.ext(b, [x[0], x[1]]); G.ext(b, [x[2], x[3]]); } } catch (er) {} });
    if (!isFinite(b[0])) return { unit: "mm", size: 0 };
    var W = Math.max(b[2] - b[0], b[3] - b[1]);
    return { unit: W < 300 ? "m" : "mm", size: W, ext: b };   // a building plan 10–300 units wide is most likely in metres; thousands → mm
  }

  /* ---------- export DXF R12 ---------- */
  function exportDxf(doc, opts) {
    opts = opts || {};
    var d = doc.d || doc, o = [], dimSt = d.dim || {};
    function w(c, v) { o.push(c, v); }
    function n(v) { return (Math.round(v * 1e6) / 1e6).toString(); }
    function aci(c, layer) { if (c == null) return null; if (typeof c === "number") return c; return CAD.hexToAci(c); }
    function common(e) { w(8, (e.layer || "0").replace(/[<>\/\\":;?*|=`]/g, "_")); var c = aci(e.color); if (c != null) w(62, c); if (e.lt) w(6, e.lt); }
    var ext = (doc.extents ? doc.extents(false) : null) || [0, 0, 1000, 1000];
    w(0, "SECTION"); w(2, "HEADER"); w(9, "$ACADVER"); w(1, "AC1009"); w(9, "$INSBASE"); w(10, 0); w(20, 0); w(30, 0);
    w(9, "$EXTMIN"); w(10, n(ext[0])); w(20, n(ext[1])); w(30, 0); w(9, "$EXTMAX"); w(10, n(ext[2])); w(20, n(ext[3])); w(30, 0);
    w(9, "$LIMMIN"); w(10, n(ext[0])); w(20, n(ext[1])); w(9, "$LIMMAX"); w(10, n(ext[2])); w(20, n(ext[3])); w(9, "$LUNITS"); w(70, 2); w(9, "$DIMSCALE"); w(40, n(dimSt.sc || 1)); w(0, "ENDSEC");
    // tables
    w(0, "SECTION"); w(2, "TABLES");
    var lts = { CONTINUOUS: [] }; Object.keys(d.layers).forEach(function (k) { var lt = d.layers[k].lt || "CONTINUOUS"; lts[lt] = CAD.LTYPES[lt] || []; }); d.ents.forEach(function (e) { if (e.lt) lts[e.lt] = CAD.LTYPES[e.lt] || []; });
    w(0, "TABLE"); w(2, "LTYPE"); w(70, Object.keys(lts).length);
    Object.keys(lts).forEach(function (k) { var pat = lts[k], tot = pat.reduce(function (a, b) { return a + b; }, 0); w(0, "LTYPE"); w(2, k); w(70, 0); w(3, k === "CONTINUOUS" ? "Solid line" : k); w(72, 65); w(73, pat.length); w(40, n(tot)); pat.forEach(function (x, i) { w(49, n(i % 2 ? -x : x)); }); });
    w(0, "ENDTAB");
    var lnames = Object.keys(d.layers); w(0, "TABLE"); w(2, "LAYER"); w(70, lnames.length);
    lnames.forEach(function (k) { var L = d.layers[k], c = aci(L.color) || 7; w(0, "LAYER"); w(2, k.replace(/[<>\/\\":;?*|=`]/g, "_")); w(70, (L.frz ? 1 : 0) | (L.lock ? 4 : 0)); w(62, L.on === false ? -c : c); w(6, L.lt || "CONTINUOUS"); });
    w(0, "ENDTAB"); w(0, "TABLE"); w(2, "STYLE"); w(70, 1); w(0, "STYLE"); w(2, "STANDARD"); w(70, 0); w(40, 0); w(41, 1); w(50, 0); w(71, 0); w(42, 2.5); w(3, "txt"); w(4, ""); w(0, "ENDTAB");
    w(0, "ENDSEC");
    // blocks
    w(0, "SECTION"); w(2, "BLOCKS");
    Object.keys(d.blocks || {}).forEach(function (bn) { var B = d.blocks[bn], nm = bn.replace(/^\*/, "A$"); w(0, "BLOCK"); w(8, "0"); w(2, nm); w(70, 0); w(10, n(B.base[0])); w(20, n(B.base[1])); w(30, 0); w(3, nm); B.ents.forEach(function (e) { ent(e); }); w(0, "ENDBLK"); w(8, "0"); });
    w(0, "ENDSEC");
    w(0, "SECTION"); w(2, "ENTITIES");
    d.ents.forEach(function (e) { if (opts.visibleOnly && doc.visible && !doc.visible(e)) return; ent(e); });
    w(0, "ENDSEC"); w(0, "EOF");
    function poly(pts, closed, e) { w(0, "POLYLINE"); common(e); w(66, 1); w(10, 0); w(20, 0); w(30, 0); w(70, closed ? 1 : 0); if (e.w) { w(40, n(e.w)); w(41, n(e.w)); } pts.forEach(function (p) { w(0, "VERTEX"); w(8, (e.layer || "0")); w(10, n(p[0])); w(20, n(p[1])); w(30, 0); if (p[2]) w(42, n(p[2])); }); w(0, "SEQEND"); w(8, e.layer || "0"); }
    function text(p, s, h, rot, al, e) {
      String(s).split("\n").forEach(function (line, li) {
        var r = (rot || 0) * Math.PI / 180, dy = -li * h * 1.5, q = [p[0] - dy * Math.sin(r), p[1] + dy * Math.cos(r)], hz = { l: 0, c: 1, r: 2 }[(al || "l")[0]] || 0, vt = { b: 1, m: 2, t: 3 }[(al || "")[1]] || 0;
        w(0, "TEXT"); common(e); w(10, n(q[0])); w(20, n(q[1])); w(30, 0); w(40, n(h)); w(1, line.replace(/Ø/g, "%%c").replace(/°/g, "%%d").replace(/±/g, "%%p")); if (rot) w(50, n(rot));
        if (hz || vt) { w(72, hz); w(11, n(q[0])); w(21, n(q[1])); w(31, 0); if (vt) w(73, vt); }
      });
    }
    function ent(e) {
      switch (e.t) {
        case "line": w(0, "LINE"); common(e); w(10, n(e.a[0])); w(20, n(e.a[1])); w(30, 0); w(11, n(e.b[0])); w(21, n(e.b[1])); w(31, 0); break;
        case "point": w(0, "POINT"); common(e); w(10, n(e.p[0])); w(20, n(e.p[1])); w(30, 0); break;
        case "circle": w(0, "CIRCLE"); common(e); w(10, n(e.c[0])); w(20, n(e.c[1])); w(30, 0); w(40, n(e.r)); break;
        case "arc": w(0, "ARC"); common(e); w(10, n(e.c[0])); w(20, n(e.c[1])); w(30, 0); w(40, n(e.r)); w(50, n(((e.a1 % 360) + 360) % 360)); w(51, n(((e.a2 % 360) + 360) % 360)); break;
        case "pline": poly(e.pts, e.closed, e); break;
        case "ellipse": poly(G.approxEllipse(e, 96), e.a1 == null, e); break;
        case "spline": poly(G.splinePts(e, 12), !!e.closed, e); break;
        case "leader": poly(e.pts, false, e); if (e.pts.length > 1) arrow(e.pts[0], G.norm(G.sub(e.pts[0], e.pts[1])), (dimSt.ar || 2.5) * (dimSt.sc || 1), e); if (e.s) text(e.pts[e.pts.length - 1], e.s, (dimSt.th || 2.5) * (dimSt.sc || 1), 0, "l", e); break;
        case "text": text(e.p, e.s, e.h, e.rot, e.al, e); break;
        case "xline": case "ray": var s = G.segsOf(e)[0]; w(0, "LINE"); common(e); w(10, n(s.a[0])); w(20, n(s.a[1])); w(30, 0); w(11, n(s.b[0])); w(21, n(s.b[1])); w(31, 0); break;
        case "insert": w(0, "INSERT"); common(e); w(2, e.block.replace(/^\*/, "A$")); w(10, n(e.p[0])); w(20, n(e.p[1])); w(30, 0); w(41, n(e.sx == null ? 1 : e.sx)); w(42, n(e.sy == null ? (e.sx == null ? 1 : e.sx) : e.sy)); w(43, 1); if (e.rot) w(50, n(e.rot)); break;
        case "hatch":
          e.loops.forEach(function (L) { poly(L, true, e); });
          if (e.pat === "SOLID") { e.loops.forEach(function (L) { var P = G.loopPts(L); if (P.length === 3 || P.length === 4) { w(0, "SOLID"); common(e); [0, 1, 3, 2].forEach(function (k, i) { var q = P[Math.min(k, P.length - 1)]; w(10 + i, n(q[0])); w(20 + i, n(q[1])); w(30 + i, 0); }); } }); }
          else { var H = CAD.hatchLines(e); H.segs.forEach(function (s) { w(0, "LINE"); common(e); w(10, n(s[0])); w(20, n(s[1])); w(30, 0); w(11, n(s[2])); w(21, n(s[3])); w(31, 0); }); H.dots.forEach(function (q) { w(0, "POINT"); common(e); w(10, n(q[0])); w(20, n(q[1])); w(30, 0); }); }
          break;
        case "dim":
          var g = G.dimGeom(Object.assign({ st: dimSt, sc: dimSt.sc }, e)); if (!g) break;
          g.lines.forEach(function (l) { w(0, "LINE"); common(e); w(10, n(l[0][0])); w(20, n(l[0][1])); w(30, 0); w(11, n(l[1][0])); w(21, n(l[1][1])); w(31, 0); });
          g.arrows.forEach(function (a) { arrow(a[0], a[1], g.ar, e); });
          text(g.tp, e.txt || CAD.dimText ? (e.txt || CAD.dimText(doc, e, g.val)) : String(Math.round(g.val)), (dimSt.th || 2.5) * (dimSt.sc || 1), g.tr * 180 / Math.PI, "cb", e);
          break;
        case "image": poly(G.rectPts(e).map(function (p) { return [p[0], p[1], 0]; }), true, e); break;
        default: break;
      }
    }
    function arrow(p, dir, len, e) { var b = G.add(p, G.mul(dir, len)), nn = G.mul(G.perp(dir), len / 6), q1 = G.add(b, nn), q2 = G.sub(b, nn); w(0, "SOLID"); common(e); w(10, n(p[0])); w(20, n(p[1])); w(30, 0); w(11, n(q1[0])); w(21, n(q1[1])); w(31, 0); w(12, n(q2[0])); w(22, n(q2[1])); w(32, 0); w(13, n(q2[0])); w(23, n(q2[1])); w(33, 0); }
    return o.join("\n") + "\n";
  }

  Object.assign(CAD, { parseDxf: parse, exportDxf: exportDxf, guessUnit: guessUnit, DXF_UNITS: UNITS, bspline: bspline, mtextPlain: mtextPlain });
})();
