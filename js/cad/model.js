/* Estimate Pro CAD — drawing document, layers, history (undo / redo) and spatial index.
   All geometry is stored in model millimetres. Display units only change how numbers are shown and typed.

   doc = { v: 1, name, units: { disp: "mm"|"cm"|"m"|"in"|"ft"|"ftin", prec, ang: "deg" },
           layers: { name: { color: ACI 1-255 | "#rrggbb", lw: mm, lt: "CONTINUOUS"|"DASHED"|…, on, lock, frz } },
           cur: { layer, color, lw, lt }, ents: [entity], blocks: { name: { base: [x, y], ents: [] } },
           dim: { th: 2.5, ar: 2.5, sc: 100, prec: null, unit: null }, sheet: { size: "A3", scale: 100, title, number, … },
           assets: { id: { name, w, h, mime } }, meta: { created, imported } }
   entity = { id, t, layer, color?, lw?, lt?, grp?, tag?, …geometry (see geom.js) } */
(function () {
  "use strict";
  var EP = window.EP = window.EP || {}, G = EP.geom;
  var uid = function () { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); };

  /* AutoCAD colour index → rgb (1-9 standard + an approximation of the 10-249 hue wheel + greys) */
  var ACI = ["#000000", "#ff0000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff", "#ffffff", "#808080", "#c0c0c0"];
  (function () {
    for (var i = 10; i < 250; i++) {
      var h = Math.floor((i - 10) / 10) * 15, v = (i - 10) % 10, sat = v % 2 === 0 ? 1 : 0.5, val = [1, 1, 0.8, 0.8, 0.6, 0.6, 0.5, 0.5, 0.3, 0.3][v];
      var c = val * sat, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = val - c, r, g, b;
      if (h < 60) { r = c; g = x; b = 0; } else if (h < 120) { r = x; g = c; b = 0; } else if (h < 180) { r = 0; g = c; b = x; } else if (h < 240) { r = 0; g = x; b = c; } else if (h < 300) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
      ACI[i] = "#" + [r + m, g + m, b + m].map(function (q) { return ("0" + Math.round(q * 255).toString(16)).slice(-2); }).join("");
    }
    ["#333333", "#505050", "#696969", "#828282", "#bebebe", "#ffffff"].forEach(function (c, k) { ACI[250 + k] = c; });
  })();
  function hexToAci(hex) { var best = 7, bd = 1e9, r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); for (var i = 1; i < 256; i++) { var c = ACI[i], d = Math.pow(r - parseInt(c.slice(1, 3), 16), 2) + Math.pow(g - parseInt(c.slice(3, 5), 16), 2) + Math.pow(b - parseInt(c.slice(5, 7), 16), 2); if (d < bd) { bd = d; best = i; } } return best; }
  var LTYPES = { CONTINUOUS: [], DASHED: [12, 6], HIDDEN: [6, 3], CENTER: [30, 6, 6, 6], PHANTOM: [30, 6, 6, 6, 6, 6], DOT: [0.5, 4], DASHDOT: [12, 4, 0.5, 4], BORDER: [12, 4, 12, 4, 0.5, 4] };
  var LW = [0, 0.05, 0.09, 0.13, 0.15, 0.18, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.53, 0.6, 0.7, 0.8, 0.9, 1, 1.06, 1.2, 1.4, 1.58, 2, 2.11];

  /* civil / architectural layer set used by new drawings */
  var STD_LAYERS = [["0", 7, 0.25], ["WALL", 7, 0.5], ["COLUMN", 1, 0.5], ["BEAM", 5, 0.35, "HIDDEN"], ["DOOR-WIN", 4, 0.25], ["FURNITURE", 8, 0.18], ["DIM", 3, 0.18], ["TEXT", 2, 0.18], ["HATCH", 9, 0.13], ["CENTRE", 1, 0.18, "CENTER"], ["GRID", 8, 0.13, "CENTER"], ["ROAD", 30, 0.35], ["DRAIN", 140, 0.35], ["LEVELS", 6, 0.18], ["DEFPOINTS", 8, 0.13], ["UNDERLAY", 9, 0.13]];
  function newDoc(name, disp) {
    var L = {}; STD_LAYERS.forEach(function (x) { L[x[0]] = { color: x[1], lw: x[2], lt: x[3] || "CONTINUOUS", on: true, lock: false, frz: false }; });
    return { v: 1, name: name || "Drawing 1", units: { disp: disp || "mm", prec: null, ang: "deg" }, layers: L, cur: { layer: "0", color: null, lw: null, lt: null },
      ents: [], blocks: {}, dim: { th: 2.5, ar: 2.5, sc: 100, gap: 1, exo: 1.25, exe: 1.25 }, sheet: { size: "A3", scale: 100, title: name || "", number: "D-01" }, assets: {}, meta: { created: Date.now() } };
  }

  /* ---------- document wrapper with history ---------- */
  function Doc(d) {
    this.d = d; this.map = {}; this.undoS = []; this.redoS = []; this.tx = null; this.rev = 0; this.listeners = [];
    var self = this; d.ents.forEach(function (e) { if (!e.id) e.id = uid(); self.map[e.id] = e; });
    this.cache = new WeakMap(); this.idx = new Grid(this);
  }
  Doc.prototype.on = function (fn) { this.listeners.push(fn); };
  Doc.prototype.emit = function (why) { this.rev++; this.idx.dirty = true; var self = this; this.listeners.forEach(function (f) { f(why, self); }); };
  Doc.prototype.begin = function (label) { if (!this.tx) this.tx = { label: label || "", ops: [] }; return this; };
  Doc.prototype.commit = function () {
    var tx = this.tx; this.tx = null; if (!tx || !tx.ops.length) return false;
    this.undoS.push(tx); if (this.undoS.length > 300) this.undoS.shift(); this.redoS = []; this.emit("edit"); return true;
  };
  Doc.prototype.cancel = function () { var tx = this.tx; if (!tx) return; this.tx = null; for (var i = tx.ops.length - 1; i >= 0; i--) this.apply(tx.ops[i], true); this.rebuild(); this.cache = new WeakMap(); this.emit("cancel"); };
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  Doc.prototype.apply = function (op, back) {
    var d = this.d, self = this;
    if (op.k === "add" || op.k === "del") {
      var adding = (op.k === "add") !== !!back;
      if (adding) { var e = clone(op.e); d.ents.splice(Math.min(op.at == null ? d.ents.length : op.at, d.ents.length), 0, e); self.map[e.id] = e; }
      else { var i = d.ents.findIndex(function (x) { return x.id === op.e.id; }); if (i >= 0) d.ents.splice(i, 1); delete self.map[op.e.id]; }
    } else if (op.k === "mod") {
      var t = self.map[op.id]; if (!t) return; var src = back ? op.before : op.after; Object.keys(t).forEach(function (k) { if (k !== "id") delete t[k]; }); Object.assign(t, clone(src)); self.cache.delete(t);
    } else if (op.k === "doc") { d[op.key] = clone(back ? op.before : op.after); if (op.key === "blocks") self.cache = new WeakMap(); }
  };
  var BIMT = { wall: 1, door: 1, window: 1, opening: 1, road: 1, culvert: 1, footing: 1, column: 1 };
  Doc.prototype.rec = function (op) { var auto = !this.tx; if (auto) this.begin(""); this.tx.ops.push(op); this.apply(op, false); this.idx.dirty = true; if (this.touchesBim(op)) this.cache = new WeakMap(); if (auto) this.commit(); else if (this.onLive) this.onLive(op); };   // objects made inside a running command show at once
  Doc.prototype.touchesBim = function (op) { var e = op.e || (op.id && this.map[op.id]) || (op.after); return !!(e && (BIMT[e.t] || (op.after && BIMT[op.after.t]))); };
  Doc.prototype.add = function (e) {
    e = clone(e); if (!e.id || this.map[e.id]) e.id = uid(); if (!e.layer) e.layer = this.d.cur.layer;
    if (this.d.cur.color != null && e.color === undefined) e.color = this.d.cur.color; if (this.d.cur.lw != null && e.lw === undefined) e.lw = this.d.cur.lw; if (this.d.cur.lt && e.lt === undefined) e.lt = this.d.cur.lt;
    Object.keys(e).forEach(function (k) { if (e[k] === undefined) delete e[k]; });
    this.rec({ k: "add", e: clone(e) }); return this.map[e.id];
  };
  Doc.prototype.del = function (id) { var e = this.map[id]; if (!e) return; var at = this.d.ents.indexOf(e); this.rec({ k: "del", e: clone(e), at: at }); };
  Doc.prototype.mod = function (id, after) {   // after: the full new entity (id kept)
    var e = this.map[id]; if (!e) return; var b = clone(e), a = clone(after); a.id = id; delete b.id; delete a.id;
    if (JSON.stringify(a) === JSON.stringify(b)) return; this.rec({ k: "mod", id: id, before: b, after: a });
  };
  Doc.prototype.set = function (key, val) { this.rec({ k: "doc", key: key, before: clone(this.d[key]), after: clone(val) }); };
  Doc.prototype.undo = function () { var tx = this.undoS.pop(); if (!tx) return null; for (var i = tx.ops.length - 1; i >= 0; i--) this.apply(tx.ops[i], true); this.redoS.push(tx); this.rebuild(); this.cache = new WeakMap(); this.emit("undo"); return tx.label; };
  Doc.prototype.redo = function () { var tx = this.redoS.pop(); if (!tx) return null; tx.ops.forEach(function (op) { this.apply(op, false); }, this); this.undoS.push(tx); this.rebuild(); this.cache = new WeakMap(); this.emit("redo"); return tx.label; };
  Doc.prototype.rebuild = function () { var m = {}; this.d.ents.forEach(function (e) { m[e.id] = e; }); this.map = m; };
  Doc.prototype.flush = function () { this.cache = new WeakMap(); this.idx.dirty = true; };
  Doc.prototype.get = function (id) { return this.map[id]; };
  Doc.prototype.layer = function (name) { return this.d.layers[name] || this.d.layers["0"]; };
  Doc.prototype.visible = function (e) {
    var L = this.d.layers[e.layer]; if (L && (!L.on || L.frz)) return false;
    var b = this.d.bim; if (b && !b.showAll) { var lv = e.lvl || (e.host && this.map[e.host] ? this.map[e.host].lvl : null); if (lv && lv !== b.cur) return false; }
    return true;
  };
  Doc.prototype.editable = function (e) { var L = this.d.layers[e.layer]; return this.visible(e) && !(L && L.lock); };
  Doc.prototype.colorOf = function (e, bg) {
    var c = e.color == null ? this.layer(e.layer).color : e.color;
    if (typeof c === "number") { if ((c === 7 || c === 255) && bg === "light") return "#111111"; return ACI[c] || "#ffffff"; }
    if (bg === "light" && /^#f{6}$/i.test(c)) return "#111111"; return c || "#ffffff";
  };
  Doc.prototype.lwOf = function (e) { return e.lw == null ? (this.layer(e.layer).lw || 0.25) : e.lw; };
  Doc.prototype.ltOf = function (e) { return e.lt || this.layer(e.layer).lt || "CONTINUOUS"; };
  Doc.prototype.c = function (e) { var c = this.cache.get(e); if (!c) { c = {}; this.cache.set(e, c); } return c; };
  /* building elements take their plan outline from "the current document" (EP.bim.ctx.doc). If that was not this document yet
     (a drawing just opened), their outline came back empty and the empty result was cached — they could not be picked, snapped to
     or zoomed to until the next edit. So point the context at this document before measuring. */
  function bimCtx(doc) { var Bm = window.EP && window.EP.bim; if (Bm && Bm.ctx) Bm.ctx.doc = doc; }
  Doc.prototype.segs = function (e) { var c = this.c(e); if (!c.s) { bimCtx(this); c.s = G.segsOf(e, this.d.blocks); } return c.s; };
  Doc.prototype.bbox = function (e) { var c = this.c(e); if (!c.bb) { bimCtx(this); c.bb = G.bbox(e, this.d.blocks); } return c.bb; };
  Doc.prototype.extents = function (onlyVisible) {
    var b = [Infinity, Infinity, -Infinity, -Infinity], self = this;
    this.d.ents.forEach(function (e) { if (onlyVisible && !self.visible(e)) return; if (e.t === "xline" || e.t === "ray") return; var x = self.bbox(e); if (isFinite(x[0])) { G.ext(b, [x[0], x[1]]); G.ext(b, [x[2], x[3]]); } });
    return isFinite(b[0]) ? b : null;
  };
  Doc.prototype.json = function () { return JSON.parse(JSON.stringify(this.d)); };

  /* ---------- uniform grid spatial index (rebuilt lazily after edits) ---------- */
  function Grid(doc) { this.doc = doc; this.dirty = true; this.cells = {}; this.cs = 1000; this.big = []; }
  Grid.prototype.build = function () {
    var doc = this.doc, ex = doc.extents(false), n = doc.d.ents.length; this.cells = {}; this.big = [];
    if (!ex) { this.dirty = false; return; }
    var W = Math.max(ex[2] - ex[0], ex[3] - ex[1], 1); this.cs = Math.max(W / Math.max(8, Math.sqrt(n) * 2), 1e-3);
    var self = this;
    doc.d.ents.forEach(function (e) {
      if (e.t === "xline" || e.t === "ray") { self.big.push(e); return; }
      var b = doc.bbox(e); if (!isFinite(b[0])) return;
      var x0 = Math.floor(b[0] / self.cs), y0 = Math.floor(b[1] / self.cs), x1 = Math.floor(b[2] / self.cs), y1 = Math.floor(b[3] / self.cs);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) { self.big.push(e); return; }
      for (var i = x0; i <= x1; i++) for (var j = y0; j <= y1; j++) { var k = i + "," + j; (self.cells[k] = self.cells[k] || []).push(e); }
    });
    this.dirty = false;
  };
  Grid.prototype.query = function (x0, y0, x1, y1) {
    if (this.dirty) this.build();
    var out = [], seen = {}, cs = this.cs, i0 = Math.floor(x0 / cs), j0 = Math.floor(y0 / cs), i1 = Math.floor(x1 / cs), j1 = Math.floor(y1 / cs);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 20000) return this.doc.d.ents.slice();
    for (var i = i0; i <= i1; i++) for (var j = j0; j <= j1; j++) { var c = this.cells[i + "," + j]; if (c) for (var k = 0; k < c.length; k++) { var e = c[k]; if (!seen[e.id]) { seen[e.id] = 1; out.push(e); } } }
    this.big.forEach(function (e) { if (!seen[e.id]) out.push(e); });
    return out;
  };

  EP.cad = EP.cad || {};
  Object.assign(EP.cad, { ACI: ACI, hexToAci: hexToAci, LTYPES: LTYPES, LW: LW, STD_LAYERS: STD_LAYERS, newDoc: newDoc, Doc: Doc, uid: uid, clone: clone });
})();
