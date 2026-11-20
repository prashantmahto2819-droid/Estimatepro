/* Estimate Pro CAD — the 2D editor: canvas view (pan / zoom), rendering, picking, object snaps, ortho / polar / object-snap tracking,
   grips, selection (pick, window, crossing), command line with coordinate entry, and the async prompt system used by the commands (tools.js).

   Coordinate entry at any point prompt (numbers in the display unit, e.g. 12'6" or 3.5m are understood):
     x,y  absolute      @dx,dy  relative to the last point      @d<a  polar relative      d<a  polar from origin
     a single number = that distance in the direction of the cursor (direct distance entry; with ORTHO / POLAR it follows the tracking line) */
(function () {
  "use strict";
  var EP = window.EP = window.EP || {}, G = EP.geom, CAD = EP.cad, UN = EP.units;
  var SNAP_ORDER = ["end", "int", "mid", "cen", "qua", "nod", "ins", "per", "tan", "nea"];
  var SNAP_NAME = { end: "Endpoint", mid: "Midpoint", cen: "Centre", qua: "Quadrant", int: "Intersection", per: "Perpendicular", tan: "Tangent", nea: "Nearest", nod: "Node", ins: "Insertion", grid: "Grid", trk: "Tracking", pol: "Polar" };

  function Editor(host, doc, opt) {
    opt = opt || {};
    this.host = host; this.doc = doc; this.opt = opt;
    this.view = { x: 0, y: 0, s: 0.2 };              // world centre, pixels per mm
    this.sel = new Set(); this.hover = null; this.preview = null; this.snapPt = null; this.track = []; this.acq = [];
    this.set = Object.assign({ osnap: true, modes: { end: 1, mid: 1, cen: 1, int: 1, per: 1, nea: 0, qua: 1, tan: 1, nod: 1, ins: 1 }, grid: true, gsnap: false, ortho: false, polar: true, polarInc: 15, otrack: true, lwt: false, bg: "dark", cross: true }, opt.settings || {});
    this.last = null; this.prompt = null; this.cmd = null; this.busy = false; this.log = []; this.clip = null; this.isolated = null; this.images = {};
    this.iso = false; this._isoZ = 0; /* isometric 2D view */
    this.build(); var self = this;
    doc.on(function () { self.dirty = true; if (self.onChange) self.onChange(); }); doc.onLive = function () { self.dirty = true; };
    this.zoomExtents(); this.loop();
  }
  var P = Editor.prototype;

  /* ---------- DOM ---------- */
  P.build = function () {
    var h = this.host; h.classList.add("cad");
    h.innerHTML = "<div class='cad-main'><div class='cad-cv' tabindex='0' aria-label='Drawing area'><canvas></canvas><div class='cad-tip' hidden></div><div class='cad-coords'></div></div></div>" +
      "<div class='cad-cmd'><div class='cad-log' aria-live='polite'></div><div class='cad-pr'><span class='cad-pt'>Command:</span><input class='cad-in' autocomplete='off' spellcheck='false' aria-label='Command line'></div></div>";
    this.cvWrap = h.querySelector(".cad-cv"); this.cv = h.querySelector("canvas"); this.ctx = this.cv.getContext("2d"); this.tipEl = h.querySelector(".cad-tip"); this.coordEl = h.querySelector(".cad-coords");
    this.logEl = h.querySelector(".cad-log"); this.ptEl = h.querySelector(".cad-pt"); this.inEl = h.querySelector(".cad-in");
    var self = this;
    this.ro = new ResizeObserver(function () { self.resize(); }); this.ro.observe(this.cvWrap);
    this.bindInput();
  };
  P.resize = function () {
    var r = this.cvWrap.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; if (!r.width || !r.height) return;
    this.W = r.width; this.H = r.height; this.dpr = dpr; this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr); this.cv.style.width = r.width + "px"; this.cv.style.height = r.height + "px";
    if (!this.sized) { this.sized = true; this.zoomExtents(); } this.dirty = true;
  };
  P.loop = function () { var self = this; if (this.dead) return; if (this.dirty) { this.dirty = false; try { this.render(); } catch (e) { console.error(e); } } requestAnimationFrame(function () { self.loop(); }); };
  P.destroy = function () { this.dead = true; if (this.ro) this.ro.disconnect(); };

  /* ---------- view ---------- */
  P.w2s = function (p) {
    if (this.iso) {
      /* isometric axonometric: 30° projection with z-height offset */
      var COS30 = 0.866025, SIN30 = 0.5, x = p[0], y = p[1], z = this._isoZ || 0;
      var ix = (x - y) * COS30, iy = -(x + y) * SIN30 - z;
      return [(ix - this.view.x) * this.view.s + this.W / 2, this.H / 2 - (iy - this.view.y) * this.view.s];
    }
    return [(p[0] - this.view.x) * this.view.s + this.W / 2, this.H / 2 - (p[1] - this.view.y) * this.view.s];
  };
  /* elevation (mm) of the plane that clicks land on in the isometric view: set by a tool (ed.wpZ), else the floor of the current level */
  P.workZ = function () { if (this.wpZ != null) return this.wpZ; if (!EP.bim || !this.doc.d.bim) return 0; var bs = EP.bim.ensure(this.doc.d), lv = EP.bim.level(this.doc.d, bs.cur); return lv ? lv.elev : 0; };
  P.s2w = function (x, y) {
    if (this.iso) {
      /* inverse of isometric projection (z=0 plane) */
      var COS30 = 0.866025, SIN30 = 0.5;
      var ix = (x - this.W / 2) / this.view.s + this.view.x, iy = (this.H / 2 - y) / this.view.s + this.view.y + this.workZ();
      var wx = ix / (2 * COS30) - iy / (2 * SIN30), wy = -ix / (2 * COS30) - iy / (2 * SIN30);
      return [wx, wy];
    }
    return [(x - this.W / 2) / this.view.s + this.view.x, (this.H / 2 - y) / this.view.s + this.view.y];
  };
  P.zoomAt = function (sx, sy, f) { var w = this.s2w(sx, sy); this.view.s = Math.max(1e-7, Math.min(1e5, this.view.s * f)); var w2 = this.s2w(sx, sy); this.view.x += w[0] - w2[0]; this.view.y += w[1] - w2[1]; this.dirty = true; };
  P.zoomBox = function (b, pad) { if (!b || !this.W) return; var w = Math.max(b[2] - b[0], 1e-6), h = Math.max(b[3] - b[1], 1e-6); pad = pad == null ? 0.08 : pad; this.view.x = (b[0] + b[2]) / 2; this.view.y = (b[1] + b[3]) / 2; this.view.s = Math.min(this.W / w, this.H / h) * (1 - 2 * pad); if (!isFinite(this.view.s) || this.view.s <= 0) this.view.s = 0.2; this.dirty = true; };
  P.zoomExtents = function () {
    var b = this.doc.extents(true); if (!b) { b = [-1000, -1000, 10000, 7000]; } if (b[2] - b[0] < 1 && b[3] - b[1] < 1) b = [b[0] - 500, b[1] - 500, b[2] + 500, b[3] + 500];
    if (this.iso && EP.bim) {
      /* compute iso-projected bounding box including all levels */
      var COS30 = 0.866025, SIN30 = 0.5, bs = EP.bim.ensure(this.doc.d), maxZ = 0;
      bs.levels.forEach(function (l) { var top = l.elev + l.h; if (top > maxZ) maxZ = top; });
      var corners = [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]], ib = [Infinity, Infinity, -Infinity, -Infinity];
      [0, maxZ].forEach(function (z) { corners.forEach(function (c) { var ix = (c[0] - c[1]) * COS30, iy = -(c[0] + c[1]) * SIN30 - z; if (ix < ib[0]) ib[0] = ix; if (iy < ib[1]) ib[1] = iy; if (ix > ib[2]) ib[2] = ix; if (iy > ib[3]) ib[3] = iy; }); });
      this.zoomBox(ib);
    } else this.zoomBox(b);
  };
  P.du = function () { return (this.doc.d.units && this.doc.d.units.disp) || "mm"; };
  P.fmt = function (mm) { var u = this.du(), pr = this.doc.d.units.prec; return UN.fmtLen(mm, u, pr == null ? undefined : pr); };
  P.fmtA = function (mm2) { var u = this.du(), au = u === "ftin" || u === "ft" || u === "in" ? "ft2" : "m2"; return UN.fmtArea(mm2, au, 3); };

  /* ---------- rendering ---------- */
  P.colors = function () { return this.set.bg === "light" ? { bg: "#ffffff", grid: "#e4e8ee", grid2: "#c9d1db", axis: "#9aa6b5", sel: "#1a73e8", hov: "#ff9800", cross: "#555", grip: "#1a73e8", txt: "#111" } : { bg: "#1f232b", grid: "#2a2f39", grid2: "#353c49", axis: "#4b5568", sel: "#4aa3ff", hov: "#ffb74d", cross: "#c8d0dc", grip: "#4aa3ff", txt: "#eee" }; };
  P.render = function () {
    var c = this.ctx, W = this.W, H = this.H, dpr = this.dpr || 1, K = this.colors(), self = this, doc = this.doc; if (EP.bim) EP.bim.ctx.doc = doc;
    if (!W) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = K.bg; c.fillRect(0, 0, W, H);
    this.drawGrid(K);
    var a = this.s2w(0, H), b = this.s2w(W, 0), vis = doc.idx.query(a[0], a[1], b[0], b[1]), order = {}; doc.d.ents.forEach(function (e, i) { order[e.id] = i; });
    vis.sort(function (p, q) { var ip = p.t === "image" ? 0 : p.t === "hatch" ? 1 : 2, iq = q.t === "image" ? 0 : q.t === "hatch" ? 1 : 2; return ip - iq || order[p.id] - order[q.id]; });
    vis.forEach(function (e) { if (!doc.visible(e) || (self.isolated && !self.isolated.has(e.id))) return; self.drawEnt(c, e, null); });
    // selection & hover highlight
    this.sel.forEach(function (id) { var e = doc.get(id); if (e && doc.visible(e)) self.drawEnt(c, e, K.sel, true); });
    if (this.hover && !this.sel.has(this.hover)) { var he = doc.get(this.hover); if (he) this.drawEnt(c, he, K.hov, true); }
    // preview of the running command
    if (this.preview) { var pv = this.preview(this.cursorW || [0, 0]); (pv || []).forEach(function (e) { self.drawEnt(c, e, e._pc || K.sel, false, true); }); }
    if (!this.cmd || this.cmd.grips) this.drawGrips(c, K);
    if (this.iso) this._isoZ = this.workZ();
    // tracking lines
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    (this.track || []).forEach(function (t) { var p = self.w2s(t[0]), q = self.w2s(t[1]); c.strokeStyle = "#2ec27e"; c.setLineDash([4, 4]); c.lineWidth = 1; c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); c.stroke(); c.setLineDash([]); });
    this.acq.forEach(function (p) { var s = self.w2s(p.p); c.strokeStyle = "#2ec27e"; c.lineWidth = 1; c.beginPath(); c.moveTo(s[0] - 4, s[1]); c.lineTo(s[0] + 4, s[1]); c.moveTo(s[0], s[1] - 4); c.lineTo(s[0], s[1] + 4); c.stroke(); });
    // selection window
    if (this.win) { var w0 = this.win.a, w1 = this.win.b, x0 = Math.min(w0[0], w1[0]), y0 = Math.min(w0[1], w1[1]), cr = w1[0] < w0[0]; c.fillStyle = cr ? "rgba(46,194,126,.12)" : "rgba(74,163,255,.12)"; c.strokeStyle = cr ? "#2ec27e" : "#4aa3ff"; c.setLineDash(cr ? [5, 4] : []); c.fillRect(x0, y0, Math.abs(w1[0] - w0[0]), Math.abs(w1[1] - w0[1])); c.strokeRect(x0 + 0.5, y0 + 0.5, Math.abs(w1[0] - w0[0]), Math.abs(w1[1] - w0[1])); c.setLineDash([]); }
    // snap marker
    if (this.iso && this.snapPt && this.snapPt.z != null) this._isoZ = this.snapPt.z;
    if (this.snapPt && this.snapPt.k !== "free") this.drawSnap(c, this.snapPt);
    // cursor
    if (this.cursorS && this.set.cross && !this.panning) { var s = this.cursorS, L = this.prompt && (this.prompt.kind === "point" || this.prompt.kind === "dist") ? 40 : 0; c.strokeStyle = K.cross; c.lineWidth = 1; c.beginPath(); if (L) { c.moveTo(s[0] - L, s[1] + 0.5); c.lineTo(s[0] + L, s[1] + 0.5); c.moveTo(s[0] + 0.5, s[1] - L); c.lineTo(s[0] + 0.5, s[1] + L); } c.rect(s[0] - 4.5, s[1] - 4.5, 9, 9); c.stroke(); }
    // compass / viewcube
    this.drawCompass(c, K);
  };
  P.drawGrid = function (K) {
    var c = this.ctx, s = this.view.s, self = this, u = UN.get(this.du() === "ftin" ? "ft" : this.du()) || UN.get("mm"), base = u.f, step = base;
    if (this.iso) {
      /* in isometric mode just draw origin cross and skip normal grid */
      var o = this.w2s([0, 0]); c.strokeStyle = K.axis; c.lineWidth = 1; c.globalAlpha = 0.3;
      var COS30 = 0.866025, SIN30 = 0.5, len = Math.max(this.W, this.H) * 2;
      c.beginPath(); c.moveTo(o[0] - len * COS30, o[1] + len * SIN30); c.lineTo(o[0] + len * COS30, o[1] - len * SIN30); c.stroke(); /* X axis */
      c.beginPath(); c.moveTo(o[0] - len * COS30, o[1] - len * SIN30); c.lineTo(o[0] + len * COS30, o[1] + len * SIN30); c.stroke(); /* Y axis */
      c.beginPath(); c.moveTo(o[0], o[1] - len); c.lineTo(o[0], o[1] + len); c.stroke(); /* Z axis */
      c.globalAlpha = 1;
      return;
    }
    var cand = [1, 2, 5]; outer: for (var e = -4; e < 9; e++) for (var i = 0; i < 3; i++) { step = cand[i] * Math.pow(10, e) * (u.dim === "L" ? (this.du() === "ftin" || this.du() === "ft" ? 304.8 : base) : 1) / (this.du() === "ftin" || this.du() === "ft" ? 1 : 1); if (step * s >= 14) break outer; }
    this.gridStep = step;
    var a = this.s2w(0, this.H), b = this.s2w(this.W, 0);
    if (this.set.grid) {
      c.lineWidth = 1;
      [[step, K.grid], [step * 5, K.grid2]].forEach(function (g) {
        var st = g[0]; if (st * s < 6) return; c.strokeStyle = g[1]; c.beginPath();
        for (var x = Math.ceil(a[0] / st) * st; x <= b[0]; x += st) { var sx = Math.round(self.w2s([x, 0])[0]) + 0.5; c.moveTo(sx, 0); c.lineTo(sx, self.H); }
        for (var y = Math.ceil(a[1] / st) * st; y <= b[1]; y += st) { var sy = Math.round(self.w2s([0, y])[1]) + 0.5; c.moveTo(0, sy); c.lineTo(self.W, sy); }
        c.stroke();
      });
    }
    var o = this.w2s([0, 0]); c.strokeStyle = K.axis; c.lineWidth = 1; c.beginPath(); c.moveTo(o[0], 0); c.lineTo(o[0], this.H); c.moveTo(0, o[1]); c.lineTo(this.W, o[1]); c.stroke();
    // UCS icon
    if (this.iso) {
      var ox = 30, oy = this.H - 30, COS30 = 0.866025, SIN30 = 0.5, al = 28;
      c.strokeStyle = "#e55"; c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox + al * COS30, oy + al * SIN30); c.stroke();
      c.strokeStyle = "#5c5"; c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox - al * COS30, oy + al * SIN30); c.stroke();
      c.strokeStyle = "#55e"; c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox, oy - al); c.stroke();
      c.fillStyle = K.axis; c.font = "10px sans-serif"; c.fillText("X", ox + al * COS30 + 3, oy + al * SIN30); c.fillText("Y", ox - al * COS30 - 10, oy + al * SIN30); c.fillText("Z", ox + 3, oy - al - 2);
    } else {
      c.strokeStyle = "#e55"; c.beginPath(); c.moveTo(14, this.H - 14); c.lineTo(44, this.H - 14); c.stroke(); c.strokeStyle = "#5c5"; c.beginPath(); c.moveTo(14, this.H - 14); c.lineTo(14, this.H - 44); c.stroke();
      c.fillStyle = K.axis; c.font = "10px sans-serif"; c.fillText("X", 46, this.H - 10); c.fillText("Y", 10, this.H - 48);
    }
  };
  /* ---------- compass / direction widget (top-right) ---------- */
  P._compassR = 42; P._compassM = 16; /* radius, margin from edge */
  P._compassXY = function () { return [this.W - this._compassR - this._compassM, this._compassR + this._compassM]; };
  P.drawCompass = function (c, K) {
    var cx = this._compassXY()[0], cy = this._compassXY()[1], R = this._compassR, r2 = R - 12;
    var north = EP.bim ? (EP.bim.sunCfg(this.doc.d).north || 0) : 0;
    var nRad = -north * Math.PI / 180; /* north rotation in canvas coords (CW from top) */
    var dark = this.set.bg !== "light";
    /* outer ring */
    c.save();
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2);
    c.fillStyle = dark ? "rgba(30,34,44,0.85)" : "rgba(235,238,244,0.85)";
    c.fill();
    c.lineWidth = 2; c.strokeStyle = dark ? "rgba(100,110,130,0.6)" : "rgba(160,170,185,0.6)"; c.stroke();
    /* inner circle */
    c.beginPath(); c.arc(cx, cy, R - 16, 0, Math.PI * 2);
    c.fillStyle = dark ? "rgba(50,55,70,0.7)" : "rgba(210,215,225,0.7)";
    c.fill(); c.lineWidth = 1; c.strokeStyle = dark ? "rgba(80,88,105,0.5)" : "rgba(175,182,195,0.5)"; c.stroke();
    /* direction labels (N/E/S/W) around ring */
    var dirs = [["N", 0], ["E", Math.PI / 2], ["S", Math.PI], ["W", -Math.PI / 2]];
    c.textAlign = "center"; c.textBaseline = "middle";
    dirs.forEach(function (d) {
      var a = nRad + d[1], lx = cx + Math.sin(a) * (R - 6), ly = cy - Math.cos(a) * (R - 6);
      c.font = d[0] === "N" ? "bold 11px sans-serif" : "10px sans-serif";
      c.fillStyle = d[0] === "N" ? "#e54" : (dark ? "#bcc4d4" : "#555e6e");
      c.fillText(d[0], lx, ly);
    });
    /* north indicator triangle */
    var ntx = cx + Math.sin(nRad) * r2, nty = cy - Math.cos(nRad) * r2;
    c.beginPath();
    c.moveTo(ntx + Math.sin(nRad) * 6, nty - Math.cos(nRad) * 6);
    c.lineTo(ntx + Math.cos(nRad) * 3, nty + Math.sin(nRad) * 3);
    c.lineTo(ntx - Math.cos(nRad) * 3, nty - Math.sin(nRad) * 3);
    c.closePath(); c.fillStyle = "#e54"; c.fill();
    /* centre label: TOP or ISO */
    c.font = "bold 10px sans-serif";
    c.fillStyle = dark ? "#8899bb" : "#4a5568";
    c.fillText(this.iso ? "ISO" : "TOP", cx, cy);
    /* subtle tick marks (8 directions) */
    for (var i = 0; i < 8; i++) {
      var ta = nRad + i * Math.PI / 4;
      c.beginPath(); c.moveTo(cx + Math.sin(ta) * (R - 1), cy - Math.cos(ta) * (R - 1));
      c.lineTo(cx + Math.sin(ta) * (R - (i % 2 === 0 ? 5 : 3)), cy - Math.cos(ta) * (R - (i % 2 === 0 ? 5 : 3)));
      c.strokeStyle = dark ? "rgba(140,150,170,0.5)" : "rgba(120,130,150,0.5)"; c.lineWidth = 1; c.stroke();
    }
    c.restore();
  };
  /* hit-test compass: returns "N","E","S","W","C" or null */
  P.compassHit = function (sx, sy) {
    var pt = this._compassXY(), cx = pt[0], cy = pt[1], R = this._compassR;
    var dx = sx - cx, dy = sy - cy, d = Math.hypot(dx, dy);
    if (d > R + 4) return null;
    if (d < R - 16) return "C"; /* centre = toggle iso */
    var a = Math.atan2(dx, -dy); /* angle from top, CW */
    var north = EP.bim ? (EP.bim.sunCfg(this.doc.d).north || 0) : 0;
    a = a + north * Math.PI / 180; /* compensate north rotation */
    a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (a < Math.PI / 4 || a > Math.PI * 7 / 4) return "N";
    if (a < Math.PI * 3 / 4) return "E";
    if (a < Math.PI * 5 / 4) return "S";
    return "W";
  };
  P.lineDash = function (e) { var lt = this.doc.ltOf(e), pat = CAD.LTYPES[lt]; if (!pat || !pat.length) return []; var k = (this.doc.d.ltscale || 1) * ((this.doc.d.dim && this.doc.d.dim.sc) || 1) * this.view.s; return pat.map(function (x) { return Math.max(0.5, x * k); }); };
  P.drawEnt = function (c, e, col, hl, prev) {
    var doc = this.doc, self = this, dpr = this.dpr || 1, s = this.view.s, K = this.colors(), bgMode = this.set.bg;
    var color = col || doc.colorOf(e, bgMode), lw = hl ? 2 : (this.set.lwt ? Math.max(1, doc.lwOf(e) * 3.78 * 0.6) : 1);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.strokeStyle = color; c.fillStyle = color; c.lineWidth = lw; c.setLineDash(hl ? [6, 3] : (prev ? [] : this.lineDash(e)));
    var w2s = function (p) { return self.w2s(p); };
    if (this.iso) this._isoZ = 0; /* default z for non-BIM entities */
    if (EP.bim && EP.bim.TYPES[e.t]) return this.drawBim(c, e, color, hl, prev);
    if (e.t === "text") return this.drawText(c, e, color);
    if (e.t === "point") { var q = w2s(e.p); c.beginPath(); c.arc(q[0], q[1], 2.5, 0, 6.3); c.fill(); return; }
    if (e.t === "image") return this.drawImage(c, e, hl, color);
    if (e.t === "dim") return this.drawDim(c, e, color);
    if (e.t === "hatch") return this.drawHatch(c, e, color, hl);
    if (e.t === "leader") { this.pathSegs(c, G.polySegs(e.pts, false)); c.stroke(); if (e.pts.length > 1) this.arrowS(c, e.pts[0], G.norm(G.sub(e.pts[0], e.pts[1])), ((doc.d.dim || {}).ar || 2.5) * ((doc.d.dim || {}).sc || 1), color); if (e.s) this.drawText(c, { p: e.pts[e.pts.length - 1], s: e.s, h: ((doc.d.dim || {}).th || 2.5) * ((doc.d.dim || {}).sc || 1), al: "lm" }, color); return; }
    if (e.t === "insert") { var B = doc.d.blocks[e.block]; if (!B) return; var M = G.mInsert(e, B.base); B.ents.forEach(function (x) { var y = G.xform(x, M); if (!y.layer || y.layer === "0") y.layer = e.layer; if (y.color == null && e.color != null) y.color = e.color; self.drawEnt(c, y, col, hl, prev); }); return; }
    var S = prev ? G.segsOf(e, doc.d.blocks) : doc.segs(e);
    if (e.t === "pline" && e.w && !hl) { c.lineWidth = Math.max(1, e.w * s); c.lineJoin = "round"; }
    this.pathSegs(c, S); c.stroke(); c.lineJoin = "miter";
  };
  /* z (mm) at which a BIM entity is drawn in the isometric view: level elevation + its own base / top offset */
  P.isoBase = function (e) { var B = EP.bim, lv = B.level(this.doc.d, e.lvl || (B.hostOf && B.hostOf(this.doc, e) || {}).lvl); return (lv ? lv.elev : 0) + (e.base || 0) + (e.z || 0) + (e.t === "roof" || e.t === "slab" ? (e.off || 0) : 0); };
  P.drawBim = function (c, e, color, hl, prev) {
    var B = EP.bim, doc = this.doc, self = this; B.ctx.doc = doc; var pl = B.plan(doc, e), mat = { brick: "rgba(181,92,69,.35)", block: "rgba(160,160,160,.35)", rcc: "rgba(150,150,150,.55)", stone: "rgba(141,132,120,.4)" };
    /* set iso z-offset from entity level */
    if (this.iso) { var lv = B.level(doc.d, e.lvl || (B.hostOf && B.hostOf(doc, e) || {}).lvl); this._isoZ = (lv ? lv.elev : 0) + (e.base || 0) + (e.t === "roof" || e.t === "slab" ? (e.off || 0) : 0); }
    if (!hl && !prev) pl.fill.forEach(function (f) {
      c.beginPath();
      if (f.circle) {
        if (self.iso) { /* circle → polyline in iso */
          for (var ci = 0; ci <= 24; ci++) { var ca = ci * Math.PI * 2 / 24, cp = [f.circle.c[0] + f.circle.r * Math.cos(ca), f.circle.c[1] + f.circle.r * Math.sin(ca)], cq = self.w2s(cp); if (ci) c.lineTo(cq[0], cq[1]); else c.moveTo(cq[0], cq[1]); } c.closePath();
        } else { var q = self.w2s(f.circle.c); c.arc(q[0], q[1], f.circle.r * self.view.s, 0, 6.3); }
      }
      else { [f.pts].concat(f.holes || []).forEach(function (P) { P.forEach(function (p, i) { var q = self.w2s(p); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.closePath(); }); }
      c.fillStyle = f.col || (e.t === "column" ? "rgba(140,140,140,.75)" : (mat[e.mat] || mat.brick)); c.fill("evenodd");
    });
    c.strokeStyle = color; c.setLineDash(hl ? [6, 3] : []);
    if (this.iso && e.t === "dsmodel") { var baseZ = this._isoZ, grp = {}; pl.segs.forEach(function (sg) { var k = Math.round(sg.z || 0); (grp[k] = grp[k] || []).push(sg); }); Object.keys(grp).forEach(function (k) { self._isoZ = baseZ + (+k); self.pathSegs(c, grp[k]); c.stroke(); }); this._isoZ = baseZ; }
    else { this.pathSegs(c, pl.segs); c.stroke(); }
    if (pl.dashed.length) { c.setLineDash(hl ? [6, 3] : [6, 4]); this.pathSegs(c, pl.dashed); c.stroke(); c.setLineDash([]); }
    if (B.EXT && B.EXT[e.t] && B.EXT[e.t].labels && !prev) { var th0 = 2.5 * ((doc.d.dim && doc.d.dim.sc) || 100); B.EXT[e.t].labels(doc, e, th0).forEach(function (l) { self.drawText(c, l, color); }); }
    if (e.t === "room" && e.name && !prev) { var bb = B.polyBox(e.pts); this.drawText(c, { p: [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2], s: e.name + "\n" + (B.area(e.pts) / 1e6).toFixed(2) + " m²", h: 2.5 * ((doc.d.dim && doc.d.dim.sc) || 100), al: "cm" }, color); }
    if ((e.t === "door" || e.t === "window") && e.mark && !prev) { var pp = B.place(doc, e); if (pp) this.drawText(c, { p: G.add(pp.p, G.mul(pp.n, (e.flip ? -1 : 1) * -(pp.w.th / 2 + 2.5 * ((doc.d.dim && doc.d.dim.sc) || 100)))), s: e.mark, h: 2 * ((doc.d.dim && doc.d.dim.sc) || 100), al: "cm" }, color); }
  };
  P.pathSegs = function (c, S) {
    var self = this, last = null; c.beginPath();
    for (var i = 0; i < S.length; i++) {
      var sg = S[i];
      if (sg.k === "L") { var a = self.w2s(sg.a), b = self.w2s(sg.b); if (!last || Math.abs(last[0] - a[0]) > 0.05 || Math.abs(last[1] - a[1]) > 0.05) c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); last = b; }
      else if (self.iso) {
        /* in iso mode, arcs become ellipses — approximate with line segments */
        var sa = sg.s, ea = sg.full ? sg.s + G.TAU : sg.e, span = G.an(ea - sa), nSeg = Math.max(8, Math.round(Math.abs(span) * 12 / Math.PI));
        for (var j = 0; j <= nSeg; j++) { var t = sa + span * j / nSeg, pt = self.w2s(G.polar(sg.c, sg.r, t)); if (j === 0) c.moveTo(pt[0], pt[1]); else c.lineTo(pt[0], pt[1]); } last = null;
      }
      else { var cc = self.w2s(sg.c), r = sg.r * self.view.s, st = self.w2s(G.polar(sg.c, sg.r, sg.s)); if (r > 2e5) { var e2 = self.w2s(G.polar(sg.c, sg.r, sg.e)); c.moveTo(st[0], st[1]); c.lineTo(e2[0], e2[1]); last = null; continue; } c.moveTo(st[0], st[1]); c.arc(cc[0], cc[1], r, -sg.s, -(sg.full ? sg.s + G.TAU : sg.e), true); last = null; }
    }
  };
  P.drawText = function (c, e, color) {
    var px = (e.h || 2.5) * this.view.s, q = this.w2s(e.p), lines = String(e.s || "").split("\n");
    if (px < 1.2) { c.globalAlpha = 0.5; c.fillRect(q[0], q[1] - 1, Math.max(1, lines[0].length * px * 0.6), 1); c.globalAlpha = 1; return; }
    c.save(); c.translate(q[0], q[1]); c.rotate(-(e.rot || 0) * Math.PI / 180);
    c.font = px.toFixed(2) + "px " + (e.font || "Arial, Helvetica, sans-serif"); c.fillStyle = color;
    var al = e.al || "l", hz = al[0], vt = al[1] || "";
    c.textAlign = hz === "c" ? "center" : hz === "r" ? "right" : "left"; c.textBaseline = "alphabetic";
    var lh = px * 1.5, n = lines.length, y0 = vt === "t" ? px : vt === "m" ? px / 2 - (n - 1) * lh / 2 : vt === "b" ? -(n - 1) * lh : (e.mt ? px - 0 : 0) - (e.mt ? 0 : 0);
    if (e.mt && !vt) y0 = px;
    lines.forEach(function (l, i) { c.fillText(l, 0, y0 + i * lh); });
    c.restore();
  };
  P.drawImage = function (c, e, hl, color) {
    var im = this.images[e.asset], pts = G.rectPts(e).map(this.w2s, this);
    if (im && im.complete && im.naturalWidth) {
      c.save(); c.globalAlpha = e.op == null ? 0.6 : e.op; var p0 = pts[0], p1 = pts[1], p3 = pts[3];
      c.setTransform((p1[0] - p0[0]) / im.naturalWidth * this.dpr, (p1[1] - p0[1]) / im.naturalWidth * this.dpr, (p0[0] - p3[0]) / im.naturalHeight * this.dpr, (p0[1] - p3[1]) / im.naturalHeight * this.dpr, p3[0] * this.dpr, p3[1] * this.dpr);
      c.drawImage(im, 0, 0); c.restore();
    }
    if (hl || !im) { c.beginPath(); pts.forEach(function (p, i) { if (i) c.lineTo(p[0], p[1]); else c.moveTo(p[0], p[1]); }); c.closePath(); c.stroke(); }
  };
  P.arrowS = function (c, p, dir, len, color) { var b = G.add(p, G.mul(dir, len)), n = G.mul(G.perp(dir), len / 6), q = [p, G.add(b, n), G.sub(b, n)].map(this.w2s, this); c.beginPath(); c.moveTo(q[0][0], q[0][1]); c.lineTo(q[1][0], q[1][1]); c.lineTo(q[2][0], q[2][1]); c.closePath(); c.fill(); };
  P.dimEnt = function (e) { var st = this.doc.d.dim || {}; return Object.assign({ st: st, sc: st.sc || 1 }, e); };
  P.dimText = function (e, val) {
    if (e.txt) return e.txt.replace("<>", this.dimVal(e, val));
    return (e.kind === "rad" ? "R" : e.kind === "dia" ? "Ø" : "") + this.dimVal(e, val);
  };
  P.dimVal = function (e, val) { if (e.kind === "ang") return UN.trimNum(val, 1) + "°"; var st = this.doc.d.dim || {}, u = st.unit || this.du(); return u === "ftin" ? UN.fmtFtIn(val) : UN.fmtLen(val, u, st.prec == null ? { mm: 0, cm: 1, m: 3, in: 1, ft: 2 }[u] : st.prec, false); };
  P.drawDim = function (c, e, color) {
    var de = this.dimEnt(e), g = G.dimGeom(de), self = this; if (!g) return;
    c.beginPath(); g.lines.forEach(function (l) { var a = self.w2s(l[0]), b = self.w2s(l[1]); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }); c.stroke();
    g.arrows.forEach(function (a) { self.arrowS(c, a[0], a[1], g.ar, color); });
    this.drawText(c, { p: g.tp, s: this.dimText(e, g.val), h: (de.st.th || 2.5) * de.sc, rot: g.tr * 180 / Math.PI, al: "cb" }, color);
  };
  P.drawHatch = function (c, e, color, hl) {
    var self = this, doc = this.doc;
    c.beginPath(); e.loops.forEach(function (L) { G.loopPts(L).forEach(function (p, i) { var q = self.w2s(p); if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.closePath(); });
    if (e.pat === "SOLID") { c.globalAlpha = hl ? 0.35 : (e.op == null ? 1 : e.op); c.fill("evenodd"); c.globalAlpha = 1; return; }
    if (hl) { c.stroke(); return; }
    var cc = doc.c ? doc.c(e) : {}; if (!cc.hl) cc.hl = CAD.hatchLines(e, 40000);
    var H = cc.hl; if (H.tooDense) { c.globalAlpha = 0.25; c.fill("evenodd"); c.globalAlpha = 1; return; }
    c.setLineDash([]); c.lineWidth = 1; c.beginPath();
    H.segs.forEach(function (sg) { var a = self.w2s([sg[0], sg[1]]), b = self.w2s([sg[2], sg[3]]); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }); c.stroke();
    if (H.dots.length && this.view.s * (e.sc || 1) > 0.3) H.dots.forEach(function (d) { var q = self.w2s(d); c.fillRect(q[0] - 0.6, q[1] - 0.6, 1.2, 1.2); });
  };
  P.drawSnap = function (c, sp) {
    var s = this.w2s(sp.p), r = 6; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.strokeStyle = "#ffd400"; c.lineWidth = 2; c.setLineDash([]); c.beginPath();
    switch (sp.k) {
      case "end": c.rect(s[0] - r, s[1] - r, 2 * r, 2 * r); break;
      case "mid": c.moveTo(s[0], s[1] - r); c.lineTo(s[0] + r, s[1] + r); c.lineTo(s[0] - r, s[1] + r); c.closePath(); break;
      case "cen": c.arc(s[0], s[1], r, 0, 6.3); break;
      case "qua": c.moveTo(s[0], s[1] - r); c.lineTo(s[0] + r, s[1]); c.lineTo(s[0], s[1] + r); c.lineTo(s[0] - r, s[1]); c.closePath(); break;
      case "int": c.moveTo(s[0] - r, s[1] - r); c.lineTo(s[0] + r, s[1] + r); c.moveTo(s[0] + r, s[1] - r); c.lineTo(s[0] - r, s[1] + r); break;
      case "per": c.moveTo(s[0] - r, s[1] + r); c.lineTo(s[0] + r, s[1] + r); c.moveTo(s[0] - r, s[1] + r); c.lineTo(s[0] - r, s[1] - r); c.moveTo(s[0] - r, s[1]); c.lineTo(s[0], s[1]); c.lineTo(s[0], s[1] + r); break;
      case "tan": c.arc(s[0], s[1], r * 0.7, 0, 6.3); c.moveTo(s[0] - r, s[1] - r); c.lineTo(s[0] + r, s[1] - r); break;
      case "nea": c.moveTo(s[0] - r, s[1] - r); c.lineTo(s[0] + r, s[1] + r); c.lineTo(s[0] - r, s[1] + r); c.lineTo(s[0] + r, s[1] - r); c.closePath(); break;
      case "nod": c.arc(s[0], s[1], r, 0, 6.3); c.moveTo(s[0] - r, s[1] - r); c.lineTo(s[0] + r, s[1] + r); c.moveTo(s[0] + r, s[1] - r); c.lineTo(s[0] - r, s[1] + r); break;
      case "ins": c.rect(s[0] - r, s[1] - r, r, r); c.rect(s[0], s[1], r, r); break;
      default: c.moveTo(s[0] - r, s[1]); c.lineTo(s[0] + r, s[1]); c.moveTo(s[0], s[1] - r); c.lineTo(s[0], s[1] + r);
    }
    c.stroke();
    if (sp.k !== "grid" && sp.k !== "pol" && sp.k !== "trk") { c.font = "11px sans-serif"; var t = SNAP_NAME[sp.k] || ""; var w = c.measureText(t).width; c.fillStyle = "rgba(0,0,0,.75)"; c.fillRect(s[0] + 10, s[1] + 8, w + 8, 16); c.fillStyle = "#ffd400"; c.fillText(t, s[0] + 14, s[1] + 20); }
  };

  /* ---------- grips ---------- */
  P.gripsOf = function (e) {
    var g = [];
    switch (e.t) {
      case "line": g.push({ p: e.a, k: "a" }, { p: e.b, k: "b" }, { p: G.mid(e.a, e.b), k: "mid" }); break;
      case "pline": case "spline": case "leader": e.pts.forEach(function (p, i) { g.push({ p: p, k: "v" + i }); }); break;
      case "circle": g.push({ p: e.c, k: "c" }); [0, 90, 180, 270].forEach(function (a) { g.push({ p: G.polar(e.c, e.r, a * Math.PI / 180), k: "r" }); }); break;
      case "arc": var s = G.segsOf(e)[0]; g.push({ p: e.c, k: "c" }, { p: G.segStart(s), k: "a1" }, { p: G.segEnd(s), k: "a2" }, { p: G.segAt(s, 0.5), k: "r" }); break;
      case "ellipse": g.push({ p: e.c, k: "c" }); break;
      case "text": case "point": case "insert": g.push({ p: e.p, k: "p" }); break;
      case "image": g.push({ p: e.p, k: "p" }); break;
      case "dim": ["a", "b", "p"].forEach(function (k) { if (e[k]) g.push({ p: e[k], k: k }); }); if (e.c) g.push({ p: e.c, k: "c" }); break;
      case "xline": case "ray": g.push({ p: e.p, k: "p" }); break;
      case "hatch": break;
    }
    return g;
  };
  P.drawGrips = function (c, K) {
    if (this.sel.size > 300) return; var self = this; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.setLineDash([]);
    this.sel.forEach(function (id) { var e = self.doc.get(id); if (!e || !self.doc.editable(e)) return; self.gripsOf(e).forEach(function (gp) { var s = self.w2s(gp.p); c.fillStyle = self.hotGrip && self.hotGrip.id === id && self.hotGrip.k === gp.k ? "#ff4d4d" : K.grip; c.fillRect(s[0] - 4, s[1] - 4, 8, 8); c.strokeStyle = "#fff"; c.lineWidth = 1; c.strokeRect(s[0] - 4.5, s[1] - 4.5, 9, 9); }); });
  };
  P.gripAt = function (sx, sy) {
    var self = this, hit = null; if (this.sel.size > 300) return null;
    this.sel.forEach(function (id) { if (hit) return; var e = self.doc.get(id); if (!e || !self.doc.editable(e)) return; self.gripsOf(e).forEach(function (gp) { var s = self.w2s(gp.p); if (!hit && Math.abs(s[0] - sx) <= 6 && Math.abs(s[1] - sy) <= 6) hit = { id: id, k: gp.k, p: gp.p }; }); });
    return hit;
  };
  P.applyGrip = function (e, k, p, orig) {
    var o = CAD.clone(e), d = G.sub(p, orig);
    switch (e.t) {
      case "line": if (k === "a") o.a = p; else if (k === "b") o.b = p; else { o.a = G.add(e.a, d); o.b = G.add(e.b, d); } break;
      case "pline": case "spline": case "leader": var i = +k.slice(1); o.pts[i] = [p[0], p[1]].concat(e.pts[i].length > 2 ? [e.pts[i][2]] : []); break;
      case "circle": if (k === "c") o.c = p; else o.r = G.dist(e.c, p); break;
      case "arc": if (k === "c") o.c = p; else if (k === "r") o.r = G.dist(e.c, p); else if (k === "a1") o.a1 = G.ang(e.c, p) * 180 / Math.PI; else o.a2 = G.ang(e.c, p) * 180 / Math.PI; break;
      case "ellipse": o.c = p; break;
      case "dim": o[k] = p; break;
      default: if (o.p) o.p = p;
    }
    return o;
  };

  /* ---------- picking ---------- */
  P.pick = function (sx, sy, filter) {
    if (EP.bim) EP.bim.ctx.doc = this.doc; var w = this.s2w(sx, sy), tol = 6 / this.view.s, doc = this.doc, best = null, self = this;
    doc.idx.query(w[0] - tol, w[1] - tol, w[0] + tol, w[1] + tol).forEach(function (e) {
      if (!doc.visible(e) || (self.isolated && !self.isolated.has(e.id)) || (filter && !filter(e))) return;
      var d = self.distTo(e, w); if (d <= tol && (!best || d < best.d || (d === best.d && e.t !== "hatch" && e.t !== "image"))) best = { e: e, d: d };
    });
    return best ? best.e : null;
  };
  P.distTo = function (e, w) {
    if (EP.bim && EP.bim.TYPES[e.t]) {
      var pl = EP.bim.plan(this.doc, e), inside = pl.fill.some(function (f) { return f.circle ? G.dist(w, f.circle.c) <= f.circle.r : G.inPoly(w, f.pts) && !(f.holes || []).some(function (h) { return G.inPoly(w, h); }); });
      if (inside) return 0;
      var mm = Infinity; pl.segs.concat(pl.dashed).forEach(function (sg) { var d0 = G.closest(sg, w).d; if (d0 < mm) mm = d0; });
      if ((e.t === "slab" || e.t === "room" || e.t === "roof") && G.inPoly(w, e.pts)) mm = Math.min(mm, 4 / this.view.s);
      return mm;
    }
    if (e.t === "text") { var tb = G.textBox(e); return G.inPoly(w, tb) ? 0 : Math.min.apply(null, G.polySegs(tb, true).map(function (s) { return G.closest(s, w).d; })); }
    if (e.t === "point") return G.dist(e.p, w);
    if (e.t === "hatch") { var inside = false; e.loops.forEach(function (L) { if (G.inPoly(w, G.loopPts(L))) inside = !inside; }); return inside ? 3 / this.view.s : Infinity; }
    if (e.t === "image") return G.inPoly(w, G.rectPts(e)) ? 4 / this.view.s : Infinity;
    if (e.t === "dim") { var g = G.dimGeom(this.dimEnt(e)); if (!g) return Infinity; var d = Math.min.apply(null, g.lines.map(function (l) { return G.closest({ k: "L", a: l[0], b: l[1] }, w).d; })); return Math.min(d, G.dist(g.tp, w)); }
    var S = this.doc.segs(e), m = Infinity; for (var i = 0; i < S.length; i++) { var c = G.closest(S[i], w).d; if (c < m) m = c; } return m;
  };
  P.inWindow = function (a, b, crossing) {
    var x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]), x1 = Math.max(a[0], b[0]), y1 = Math.max(a[1], b[1]), doc = this.doc, self = this, out = [];
    var rect = [{ k: "L", a: [x0, y0], b: [x1, y0] }, { k: "L", a: [x1, y0], b: [x1, y1] }, { k: "L", a: [x1, y1], b: [x0, y1] }, { k: "L", a: [x0, y1], b: [x0, y0] }];
    doc.idx.query(x0, y0, x1, y1).forEach(function (e) {
      if (!doc.visible(e) || (self.isolated && !self.isolated.has(e.id))) return;
      var bb = doc.bbox(e); if (!isFinite(bb[0]) && e.t !== "xline" && e.t !== "ray") return;
      var inside = bb[0] >= x0 && bb[1] >= y0 && bb[2] <= x1 && bb[3] <= y1;
      if (inside) { out.push(e); return; }
      if (!crossing) return;
      if (bb[2] < x0 || bb[0] > x1 || bb[3] < y0 || bb[1] > y1) return;
      var S = e.t === "text" ? G.polySegs(G.textBox(e), true) : doc.segs(e), hit = false;
      for (var i = 0; i < S.length && !hit; i++) { var s = S[i], sp = G.segStart(s); if (sp[0] >= x0 && sp[0] <= x1 && sp[1] >= y0 && sp[1] <= y1) hit = true; for (var j = 0; j < 4 && !hit; j++) if (G.intersect(s, rect[j]).length) hit = true; }
      if (!hit && (e.t === "hatch" || e.t === "image")) hit = self.distTo(e, [(x0 + x1) / 2, (y0 + y1) / 2]) < Infinity;
      if (hit) out.push(e);
    });
    return out;
  };
  P.expandGroups = function (ids) { var doc = this.doc, set = new Set(ids), grps = {}; ids.forEach(function (id) { var e = doc.get(id); if (e && e.grp) grps[e.grp] = 1; }); if (Object.keys(grps).length) doc.d.ents.forEach(function (e) { if (e.grp && grps[e.grp]) set.add(e.id); }); return Array.from(set); };

  /* ---------- object snaps ---------- */
  P.snap = function (sx, sy, from) {
    if (EP.bim) EP.bim.ctx.doc = this.doc; var w = this.s2w(sx, sy), ap = 12 / this.view.s, doc = this.doc, self = this, best = null, M = this.set.modes;
    function cand(p, k, pr) { var d; if (self.iso) { var sp = self.w2s(p); d = Math.hypot(sp[0] - sx, sp[1] - sy) / self.view.s; } else d = G.dist(p, w); if (d > ap) return; var score = d * (1 + 0.15 * SNAP_ORDER.indexOf(k)); if (!best || score < best.score) best = { p: p, k: k, score: score, z: self._isoZ }; }
    if (this.set.osnap && !this.noSnap) {
      var ents = (this.iso ? doc.d.ents : doc.idx.query(w[0] - ap, w[1] - ap, w[0] + ap, w[1] + ap)).filter(function (e) { return doc.visible(e) && (!self.isolated || self.isolated.has(e.id)) && e.t !== "image"; }), segs = [];
      ents.forEach(function (e) {
        if (self.iso) self._isoZ = EP.bim && EP.bim.TYPES[e.t] ? self.isoBase(e) : 0;
        if (e.t === "point" && M.nod) cand(e.p, "nod");
        if ((e.t === "wall" || e.t === "beam") && M.end) { cand(e.a, "end"); cand(e.b, "end"); if (M.mid) cand(G.mid(e.a, e.b), "mid"); }
        if ((e.t === "column" || e.t === "footing") && M.ins) cand(e.p, "ins");
        if ((e.t === "text" || e.t === "insert") && M.ins) cand(e.p, "ins");
        if (e.t === "dim") { if (M.end) ["a", "b", "p"].forEach(function (k) { if (e[k]) cand(e[k], "end"); }); return; }
        if (e.t === "text") return;
        var S = doc.segs(e);
        if (e.t === "hatch") return;
        var zb0 = self._isoZ;
        S.forEach(function (s) {
          if (self.iso && s.z != null) self._isoZ = zb0 + s.z;
          if (s.inf) { segs.push(s); if (M.nea) cand(G.closest(s, w).p, "nea"); return; }
          segs.push(s);
          if (s.k === "L") { if (M.end) { cand(s.a, "end"); cand(s.b, "end"); } if (M.mid) cand(G.mid(s.a, s.b), "mid"); }
          else {
            if (M.cen) { cand(s.c, "cen"); if (G.dist(w, s.c) < s.r + ap && G.dist(w, s.c) > s.r - ap) { var ss = self.w2s(s.c); if (Math.abs(G.dist(w, s.c) - s.r) < ap) {} } }
            if (!s.full && M.end) { cand(G.segStart(s), "end"); cand(G.segEnd(s), "end"); }
            if (!s.full && M.mid) cand(G.segAt(s, 0.5), "mid");
            if (M.qua) for (var q = 0; q < 4; q++) { var t = q * Math.PI / 2; if (G.onArc(s, t)) cand(G.polar(s.c, s.r, t), "qua"); }
          }
          if (M.nea) cand(G.closest(s, w).p, "nea");
          if (from && M.per) { var f = G.perpFoot(s, from, false); if (f) cand(f, "per"); }
          if (from && M.tan && s.k === "A") G.tangentPts(s.c, s.r, from).forEach(function (tp) { if (G.onArc(s, G.ang(s.c, tp))) cand(tp, "tan"); });
        });
      });
      if (this.iso) this._isoZ = 0;
      // centre snap when the cursor is on a circle's edge
      if (M.cen) ents.forEach(function (e) { if ((e.t === "circle" || e.t === "arc") && Math.abs(G.dist(w, e.c) - e.r) < ap) { var d = G.dist(w, e.c); if (!best || best.k === "nea") best = { p: e.c, k: "cen", score: ap * 0.9 }; } });
      if (M.int && !this.iso && segs.length < 400) for (var i = 0; i < segs.length; i++) for (var j = i + 1; j < segs.length; j++) G.intersect(segs[i], segs[j]).forEach(function (p) { cand(p, "int"); });
    }
    return best;
  };
  /* final cursor point: object snap → tracking (ortho / polar / object snap tracking) → grid snap → free */
  P.resolve = function (sx, sy) {
    var w = this.s2w(sx, sy), from = this.prompt && this.prompt.base, os = this.snap(sx, sy, from); this.track = [];
    if (os) { this.acquire(os); return { p: os.p, k: os.k }; }
    if (from && (this.set.ortho || this.set.polar) && this.prompt && this.prompt.kind !== "sel") {
      var v = G.sub(w, from), d = G.len(v), a = Math.atan2(v[1], v[0]);
      if (this.set.ortho) { var o = Math.abs(v[0]) >= Math.abs(v[1]) ? [from[0] + v[0], from[1]] : [from[0], from[1] + v[1]]; this.track = [[from, o]]; return { p: o, k: "free", dir: G.norm(G.sub(o, from)) }; }
      var inc = (this.set.polarInc || 15) * Math.PI / 180, an = Math.round(a / inc) * inc;
      if (Math.abs(a - an) * d * this.view.s < 10 && d > 0) { var pp = G.polar(from, d * Math.cos(a - an), an); this.track = [[from, G.polar(from, Math.max(d * 2, 1e3 / this.view.s), an)]]; this.trackInfo = this.fmt(G.dist(from, pp)) + " < " + Math.round(an * 180 / Math.PI) + "°"; return { p: pp, k: "pol", dir: [Math.cos(an), Math.sin(an)] }; }
    }
    if (this.set.otrack && this.acq.length) {
      var tol = 8 / this.view.s, hits = [];
      this.acq.forEach(function (q) { if (Math.abs(w[0] - q.p[0]) < tol) hits.push({ p: [q.p[0], w[1]], ln: [q.p, [q.p[0], w[1]]], ax: "x", v: q.p[0] }); if (Math.abs(w[1] - q.p[1]) < tol) hits.push({ p: [w[0], q.p[1]], ln: [q.p, [w[0], q.p[1]]], ax: "y", v: q.p[1] }); });
      var hx = hits.filter(function (h) { return h.ax === "x"; })[0], hy = hits.filter(function (h) { return h.ax === "y"; })[0];
      if (hx && hy) { this.track = [hx.ln, hy.ln].map(function (l) { return l; }); var ip = [hx.v, hy.v]; this.track = [[hx.ln[0], ip], [hy.ln[0], ip]]; return { p: ip, k: "trk" }; }
      if (hx || hy) { var h = hx || hy; this.track = [h.ln]; return { p: h.p, k: "trk" }; }
    }
    if (this.set.gsnap && this.gridStep) { var st = this.gridStep; return { p: [Math.round(w[0] / st) * st, Math.round(w[1] / st) * st], k: "grid" }; }
    return { p: w, k: "free" };
  };
  P.acquire = function (os) {
    if (!this.set.otrack || os.k === "nea") return; var self = this, key = os.p[0].toFixed(4) + "," + os.p[1].toFixed(4);
    clearTimeout(this.acqT); this.acqT = setTimeout(function () { if (!self.acq.some(function (q) { return q.key === key; })) { self.acq.push({ p: os.p, key: key }); if (self.acq.length > 6) self.acq.shift(); self.dirty = true; } }, 450);
  };

  /* ---------- prompts (async) ---------- */
  P.ask = function (pr) {
    var self = this; if (this.prompt && this.prompt.reject) { var old = this.prompt; this.prompt = null; old.reject(new Error("replaced")); }
    return new Promise(function (res, rej) { pr.resolve = res; pr.reject = rej; self.prompt = pr; self.showPrompt(); self.dirty = true; });
  };
  P.showPrompt = function () {
    var p = this.prompt; if (!p) { this.ptEl.textContent = this.cmd ? this.cmd.name + ":" : "Command:"; return; }
    var kw = (p.kw || []).map(function (k) { return k; }); this.ptEl.innerHTML = "";
    var span = document.createElement("span"); span.textContent = p.msg + (p.def != null ? " <" + p.defTxt + ">" : "") + (kw.length ? " [" : "") ; this.ptEl.appendChild(span);
    var self = this; kw.forEach(function (k, i) { var b = document.createElement("button"); b.type = "button"; b.className = "cad-kw"; b.textContent = k; b.onclick = function () { self.answer(k); }; self.ptEl.appendChild(b); if (i < kw.length - 1) self.ptEl.appendChild(document.createTextNode("/")); });
    if (kw.length) this.ptEl.appendChild(document.createTextNode("]")); this.ptEl.appendChild(document.createTextNode(":"));
  };
  P.getPoint = function (msg, o) { o = o || {}; return this.ask({ kind: "point", msg: msg, base: o.base || null, kw: o.kw, def: o.def, defTxt: o.defTxt, allowNone: o.allowNone || o.opt }); };
  P.getDist = function (msg, o) { o = o || {}; return this.ask({ kind: "dist", msg: msg, base: o.base || null, kw: o.kw, def: o.def, defTxt: o.def != null ? this.fmt(o.def) : "", ang: o.ang }); };
  P.getAngle = function (msg, o) { o = o || {}; return this.ask({ kind: "dist", msg: msg, base: o.base || null, kw: o.kw, def: o.def, defTxt: o.def != null ? o.def + "°" : "", ang: true }); };
  P.getText = function (msg, o) { o = o || {}; return this.ask({ kind: "text", msg: msg, def: o.def, defTxt: o.def, kw: o.kw, raw: true }); };
  P.getKw = function (msg, kw, def) { return this.ask({ kind: "kw", msg: msg, kw: kw, def: def, defTxt: def }); };
  P.getEnt = function (msg, o) { o = o || {}; return this.ask({ kind: "ent", msg: msg, filter: o.filter, kw: o.kw, allowNone: o.allowNone }); };
  P.getSel = function (msg, o) {
    o = o || {}; var self = this;
    if (this.sel.size && !o.fresh) { var ids = Array.from(this.sel); return Promise.resolve(ids); }
    return this.ask({ kind: "sel", msg: msg || "Select objects", single: o.single }).then(function () { var ids = Array.from(self.sel); return ids; });
  };
  P.answer = function (val) { var p = this.prompt; if (!p) return; this.prompt = null; this.track = []; p.resolve(val); this.showPrompt(); this.dirty = true; };
  P.cancelPrompt = function () { var p = this.prompt; this.prompt = null; this.preview = null; this.track = []; if (p) p.reject(new Error("cancel")); this.showPrompt(); this.dirty = true; };

  /* typed text → answer for the current prompt */
  P.typed = function (txt) {
    var p = this.prompt, t = txt.trim();
    if (!p) return false;
    if (p.kind === "text") { this.answer(t === "" && p.def != null ? p.def : txt); return true; }
    if (t === "") { if (p.def != null) { this.answer(p.def); return true; } if (p.kind === "sel") { this.answer(true); return true; } if (p.kind === "ent" && !p.allowNone) { this.cancelPrompt(); return true; } if ((p.kind === "point" || p.kind === "dist") && !p.allowNone) { this.say(p.kind === "point" ? "A point is needed — click or type x,y (Esc cancels)." : "A distance is needed (Esc cancels)."); return true; } this.answer(null); return true; }
    var kw = (p.kw || []).filter(function (k) { var u = t.toUpperCase(); return k.toUpperCase() === u || k.replace(/[^A-Z]/g, "") === u || k.toUpperCase().indexOf(u) === 0; })[0];
    if (kw) { this.answer(kw); return true; }
    if (p.kind === "point") { var pt = this.parsePoint(t, p.base); if (pt) { this.last = pt; this.answer(pt); return true; } this.say("Point or option keyword required."); return true; }
    if (p.kind === "dist") { var v = /,/.test(t) && p.base && this.parsePoint(t, p.base) ? null : p.ang ? UN.parseAng(t) : UN.parseLen(t, this.du()); if (v != null) { this.answer(v); return true; } var pt2 = this.parsePoint(t, p.base); if (pt2 && p.base) { this.answer(p.ang ? G.ang(p.base, pt2) * 180 / Math.PI : G.dist(p.base, pt2)); return true; } this.say("Requires a " + (p.ang ? "number (angle in degrees)" : "distance") + "."); return true; }
    if (p.kind === "kw") { this.say("Choose one of: " + p.kw.join(", ")); return true; }
    return false;
  };
  P.parsePoint = function (t, base) {
    var du = this.du(), rel = t[0] === "@", abs = t[0] === "#", s = t.replace(/^[@#]/, "");
    var pol = s.match(/^(.+)<(.+)$/), L = function (x) { return UN.parseLen(x, du); };
    if (pol) { var d = L(pol[1]), a = UN.parseAng(pol[2]); if (d == null || a == null) return null; var o = rel ? (this.last || [0, 0]) : [0, 0]; return G.polar(o, d, a * Math.PI / 180); }
    var xy = s.split(/\s*[,;]\s*/); if (xy.length === 2) { var x = L(xy[0]), y = L(xy[1]); if (x == null || y == null) return null; var o2 = rel ? (this.last || [0, 0]) : [0, 0]; return [o2[0] + x, o2[1] + y]; }
    if (!rel && !abs && base) { var dd = L(s); if (dd == null) return null; var dir = this.curDir || (this.cursorW ? G.norm(G.sub(this.cursorW, base)) : [1, 0]); if (!G.len(dir)) dir = [1, 0]; return G.add(base, G.mul(dir, dd)); }
    return null;
  };
  P.say = function (msg) { this.log.push(msg); if (this.log.length > 200) this.log.shift(); var el = this.logEl; var d = document.createElement("div"); d.textContent = msg; el.appendChild(d); while (el.children.length > 60) el.removeChild(el.firstChild); el.scrollTop = el.scrollHeight; if (this.onSay) this.onSay(msg); };

  /* ---------- running commands ---------- */
  P.run = function (name, fn, opts) {
    var self = this; opts = opts || {};
    if (this.cmd) this.stop(true);
    var C = this.cmd = { name: name, grips: !!opts.grips }; this.say("Command: " + name); this.showPrompt();
    this.doc.begin(name);
    var done = function (ok) { if (self.cmd !== C) return; self.cmd = null; self.prompt = null; self.preview = null; self.track = []; self.curDir = null; if (ok === false) self.doc.cancel(); else self.doc.commit(); self.showPrompt(); self.dirty = true; if (self.onCmdEnd) self.onCmdEnd(name); };
    var pr; try { pr = Promise.resolve(fn(this)); } catch (e) { pr = Promise.reject(e); }
    return pr.then(function () { done(true); }, function (e) { var cancelled = e && (e.message === "cancel" || e.message === "replaced"); if (!cancelled) { console.error(e); self.say("Error: " + (e.message || e)); } else if (self.cmd === C) self.say("*Cancel*"); done(cancelled && !opts.keepOnCancel ? (opts.undoOnCancel ? false : true) : true); });
  };
  P.stop = function (silent) { if (!this.cmd) return; var c = this.cmd; if (this.prompt) this.cancelPrompt(); else { this.cmd = null; this.doc.commit(); } if (!silent) this.say("*Cancel*"); };
  P.exec = function (line) {
    var t = line.trim(); if (!t) { if (this.lastCmd) return this.exec(this.lastCmd); return; }
    var name = t.split(/\s+/)[0].toUpperCase().replace(/^_/, ""), C = CAD.commands, alias = CAD.aliases[name] || name, def = C[alias];
    if (!def) { this.say("Unknown command \"" + name + "\". Type HELP for the list."); return; }
    this.lastCmd = alias; return this.run(alias, def.fn, def);
  };

  /* ---------- input ---------- */
  P.bindInput = function () {
    var self = this, cv = this.cvWrap, down = null, pinch = null, touches = {};
    function pos(ev) { var r = cv.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
    cv.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });
    cv.addEventListener("wheel", function (ev) { ev.preventDefault(); var p = pos(ev); self.zoomAt(p[0], p[1], Math.pow(1.0015, -ev.deltaY * (ev.deltaMode ? 30 : 1))); self.move(p); }, { passive: false });
    cv.addEventListener("pointerdown", function (ev) {
      cv.focus({ preventScroll: true }); var p = pos(ev); touches[ev.pointerId] = p;
      if (Object.keys(touches).length === 2) { var k = Object.keys(touches), a = touches[k[0]], b = touches[k[1]]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; down = null; self.win = null; return; }
      cv.setPointerCapture(ev.pointerId);
      /* compass click */
      var ch = self.compassHit(p[0], p[1]);
      if (ch) {
        if (ch === "C") { /* toggle iso */
          if (CAD.ACTIONS.iso) CAD.ACTIONS.iso(self, self._ctx || {});
          else { self.iso = !self.iso; self.dirty = true; self.zoomExtents(); }
        } else if (ch === "N" || ch === "S" || ch === "E" || ch === "W") {
          /* if 3D view is active, orbit to that direction */
          if (self._ctx && self._ctx.v3 && self._ctx.v3.ok && self._ctx.v3mode !== "off") {
            var vmap = { N: "back", S: "front", E: "right", W: "left" };
            self._ctx.v3.frame(vmap[ch]);
          }
        }
        down = null; return;
      }
      if (ev.button === 1 || ev.button === 2 || self.spaceDown || self.panMode) { down = { pan: true, p: p, v: Object.assign({}, self.view) }; self.panning = true; return; }
      down = { p: p, t: Date.now(), touch: ev.pointerType === "touch" };
      if (!self.prompt || self.prompt.kind === "sel") { var gp = !self.prompt && self.gripAt(p[0], p[1]); if (gp) { down.grip = gp; self.hotGrip = gp; } }
    });
    cv.addEventListener("pointermove", function (ev) {
      var p = pos(ev); if (touches[ev.pointerId]) touches[ev.pointerId] = p;
      if (pinch && Object.keys(touches).length === 2) { var k = Object.keys(touches), a = touches[k[0]], b = touches[k[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; self.zoomAt(c[0], c[1], d / pinch.d); var w0 = self.s2w(pinch.c[0], pinch.c[1]), w1 = self.s2w(c[0], c[1]); self.view.x += w0[0] - w1[0]; self.view.y += w0[1] - w1[1]; pinch.d = d; pinch.c = c; return; }
      if (down && down.pan) { self.view.x = down.v.x - (p[0] - down.p[0]) / self.view.s; self.view.y = down.v.y + (p[1] - down.p[1]) / self.view.s; self.dirty = true; return; }
      if (down && !down.grip && (!self.prompt || self.prompt.kind === "sel") && Math.hypot(p[0] - down.p[0], p[1] - down.p[1]) > 6) { if (down.touch && !self.prompt && !self.cmd && self.sel.size === 0 && !self.touchSel) { down.pan = true; down.v = Object.assign({}, self.view); self.panning = true; return; } self.win = { a: down.p, b: p }; }
      self.move(p);
    });
    function up(ev) {
      var p = pos(ev); delete touches[ev.pointerId]; if (pinch) { if (Object.keys(touches).length < 2) pinch = null; return; }
      if (!down) return; var d = down; down = null; self.panning = false;
      if (d.pan) { self.dirty = true; return; }
      if (d.grip) { self.hotGrip = null; if (Math.hypot(p[0] - d.p[0], p[1] - d.p[1]) > 3) { var r = self.resolve(p[0], p[1]), e = self.doc.get(d.grip.id); if (e) { self.doc.begin("Grip edit"); self.doc.mod(e.id, self.applyGrip(e, d.grip.k, r.p, d.grip.p)); self.doc.commit(); } } else self.gripCmd(d.grip); self.dirty = true; return; }
      if (self.win) { var w = self.win; self.win = null; var a = self.s2w(w.a[0], w.a[1]), b = self.s2w(w.b[0], w.b[1]), found = self.inWindow(a, b, w.b[0] < w.a[0]); self.addSel(found.map(function (e) { return e.id; }), ev.shiftKey); if (self.prompt && self.prompt.kind === "sel" && self.prompt.single && self.sel.size) self.answer(true); self.dirty = true; return; }
      self.click(p, ev);
    }
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", function (ev) { delete touches[ev.pointerId]; down = null; pinch = null; self.win = null; self.panning = false; });
    cv.addEventListener("pointerleave", function () { self.cursorS = null; self.dirty = true; self.tipEl.hidden = true; });
    cv.addEventListener("dblclick", function (ev) { var p = pos(ev); if (!self.prompt) { var e = self.pick(p[0], p[1]); if (e && self.onEdit) self.onEdit(e); else if (!e) self.zoomExtents(); } });
    // keyboard: typing goes to the command line
    cv.addEventListener("keydown", function (ev) { self.key(ev, false); });
    this.inEl.addEventListener("keydown", function (ev) { self.key(ev, true); });
    window.addEventListener("keyup", function (ev) { if (ev.key === " ") self.spaceDown = false; });
  };
  P.key = function (ev, inInput) {
    var k = ev.key, self = this, ctrl = ev.ctrlKey || ev.metaKey, inp = this.inEl;
    if (ctrl && (k === "z" || k === "Z")) { ev.preventDefault(); if (ev.shiftKey) this.redo(); else this.undo(); return; }
    if (ctrl && (k === "y" || k === "Y")) { ev.preventDefault(); this.redo(); return; }
    if (ctrl && (k === "a" || k === "A") && !inInput) { ev.preventDefault(); this.selectAll(); return; }
    if (ctrl && (k === "c" || k === "C") && !inInput) { ev.preventDefault(); this.exec("COPYCLIP"); return; }
    if (ctrl && (k === "x" || k === "X") && !inInput) { ev.preventDefault(); this.exec("CUTCLIP"); return; }
    if (ctrl && (k === "v" || k === "V") && !inInput) { ev.preventDefault(); this.exec("PASTECLIP"); return; }
    var fk = { F3: "osnap", F7: "grid", F8: "ortho", F9: "gsnap", F10: "polar", F11: "otrack" }[k];
    if (fk) { ev.preventDefault(); this.toggle(fk); return; }
    if (k === "Escape") { ev.preventDefault(); inp.value = ""; if (this.cmd || this.prompt) this.stop(); else { this.sel.clear(); this.acq = []; this.emitSel(); } this.dirty = true; return; }
    if (k === "Delete" && !inInput && !this.prompt) { ev.preventDefault(); this.exec("ERASE"); return; }
    var textPr = this.prompt && this.prompt.kind === "text";
    if (k === "Enter" || (k === " " && !textPr)) {
      ev.preventDefault(); var v = inp.value; inp.value = "";
      if (this.prompt) { if (v.trim() || !textPr) this.say((this.prompt.msg || "") + ": " + v); this.typed(v); }
      else this.exec(v);
      return;
    }
    if (!inInput && k.length === 1 && !ctrl && !ev.altKey) { ev.preventDefault(); inp.focus(); inp.value += k; return; }
    if (!inInput && k === "Backspace") { ev.preventDefault(); inp.focus(); inp.value = inp.value.slice(0, -1); }
    if (inInput && (k === "ArrowUp")) { ev.preventDefault(); if (this.lastCmd && !inp.value) inp.value = this.lastCmd; }
  };
  P.toggle = function (k) { this.set[k] = !this.set[k]; if (k === "ortho" && this.set.ortho) this.set.polar = false; if (k === "polar" && this.set.polar) this.set.ortho = false; this.say({ osnap: "Object snap", grid: "Grid", ortho: "Ortho", gsnap: "Grid snap", polar: "Polar tracking", otrack: "Object snap tracking", lwt: "Lineweight display" }[k] + " " + (this.set[k] ? "on" : "off")); this.dirty = true; if (this.onSettings) this.onSettings(); };
  P.move = function (p) {
    this.cursorS = p; var r = (this.prompt && (this.prompt.kind === "point" || this.prompt.kind === "dist")) || this.cmd ? this.resolve(p[0], p[1]) : { p: this.s2w(p[0], p[1]), k: "free" };
    this.snapPt = r; this.cursorW = r.p; this.curDir = r.dir || null;
    if (!this.prompt || this.prompt.kind === "sel" || this.prompt.kind === "ent") { var h = this.pick(p[0], p[1], this.prompt && this.prompt.filter); this.hover = h ? h.id : null; } else this.hover = null;
    var u = this.du(), tip = "", base = this.prompt && this.prompt.base;
    this.coordEl.textContent = this.fmt(r.p[0]) + ", " + this.fmt(r.p[1]);
    if (base && this.prompt && (this.prompt.kind === "point" || this.prompt.kind === "dist")) tip = (this.prompt.ang ? "Angle " + UN.trimNum(G.ang(base, r.p) * 180 / Math.PI, 1) + "°" : this.fmt(G.dist(base, r.p)) + " < " + UN.trimNum((G.ang(base, r.p) * 180 / Math.PI + 360) % 360, 1) + "°");
    if (tip) { this.tipEl.hidden = false; this.tipEl.textContent = tip; this.tipEl.style.left = (p[0] + 18) + "px"; this.tipEl.style.top = (p[1] + 18) + "px"; } else this.tipEl.hidden = true;
    this.dirty = true;
  };
  P.click = function (p, ev) {
    var pr = this.prompt;
    if (pr && (pr.kind === "kw" || pr.kind === "num") && pr.def != null) { this.say("→ " + pr.def + " (default; type another value to change)"); this.answer(pr.def); return; }   // a click on the drawing accepts the default
    if (pr && (pr.kind === "point" || pr.kind === "dist")) {
      var r = this.resolve(p[0], p[1]);
      if (pr.kind === "point") { this.last = r.p; this.answer(r.p); }
      else if (pr.base) this.answer(pr.ang ? G.ang(pr.base, r.p) * 180 / Math.PI : G.dist(pr.base, r.p));
      else { var self = this; this.prompt = null; this.getPoint("Second point", { base: r.p }).then(function (q) { pr.resolve = pr.resolve; pr.resolve(G.dist(r.p, q)); }, function (e) { pr.reject(e); }); }
      return;
    }
    if (pr && pr.kind === "ent") { var e = this.pick(p[0], p[1], pr.filter); if (e) { this.answer({ e: e, p: this.s2w(p[0], p[1]) }); } else if (pr.allowNone) this.answer(null); return; }
    var hit = this.pick(p[0], p[1]);
    if (hit) { var ids = this.expandGroups([hit.id]); if (ev && ev.shiftKey && this.sel.has(hit.id)) { ids.forEach(function (id) { this.sel.delete(id); }, this); this.emitSel(); } else this.addSel(ids, false); if (pr && pr.kind === "sel" && pr.single) this.answer(true); }
    else if (!pr && !(ev && ev.shiftKey)) { this.sel.clear(); this.emitSel(); }
    this.dirty = true;
  };
  P.addSel = function (ids, remove) { var self = this; ids = this.expandGroups(ids); ids.forEach(function (id) { var e = self.doc.get(id); if (!e) return; if (remove) self.sel.delete(id); else self.sel.add(id); }); this.emitSel(); };
  P.emitSel = function () { this.dirty = true; if (this.onSel) this.onSel(this.sel); };
  P.selectAll = function () { var self = this; this.sel = new Set(this.doc.d.ents.filter(function (e) { return self.doc.visible(e); }).map(function (e) { return e.id; })); this.emitSel(); };
  P.gripCmd = function (gp) { var self = this, e = this.doc.get(gp.id); if (!e) return; this.run("GRIP", function (ed) { ed.preview = function (w) { return [ed.applyGrip(e, gp.k, w, gp.p)]; }; return ed.getPoint("Specify stretch point", { base: gp.p }).then(function (q) { ed.doc.mod(e.id, ed.applyGrip(e, gp.k, q, gp.p)); }); }); };
  P.undo = function () { if (this.cmd) { this.stop(true); } var l = this.doc.undo(); this.say(l != null ? "Undo " + (l || "") : "Nothing to undo"); this.cleanSel(); };
  P.redo = function () { var l = this.doc.redo(); this.say(l != null ? "Redo " + (l || "") : "Nothing to redo"); this.cleanSel(); };
  P.cleanSel = function () { var self = this; Array.from(this.sel).forEach(function (id) { if (!self.doc.get(id)) self.sel.delete(id); }); this.emitSel(); };

  CAD.Editor = Editor; CAD.SNAP_NAME = SNAP_NAME;
})();
