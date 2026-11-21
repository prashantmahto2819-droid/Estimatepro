/* Design Studio — drawing (port of civilest/design/drawing.py)
   Drawing engine: one geometry model → SVG (screen), DXF R12 (AutoCAD / any CAD) and PDF (print).

   Model
       Sheet  – an A3 drawing with title block, general notes and one or more views
       View   – a titled group of entities in MODEL millimetres with a preferred scale
       Entities: Line, PLine (polyline / polygon with optional fill), Circle, Arc, Text, Dim

   SVG / PDF place every view on the A3 sheet, choosing a standard scale that fits.
   DXF writes every view at 1 : 1 in model millimetres (views laid side by side), with text
   heights multiplied by the view scale, so dimensions can be measured directly in CAD.
   No third-party libraries. Output is byte-identical to the Python version (PDF streams are
   uncompressed in both).

   JS API (positional, same defaults as Python)
       new Line(x1, y1, x2, y2, layer = "OUTLINE")
       new PLine(pts, closed = false, layer = "OUTLINE", fill = null)          pts: [[x, y], …]
       new Circle(cx, cy, r, layer = "OUTLINE", fill = null)
       new Arc(cx, cy, r, a1, a2, layer = "OUTLINE")                           degrees, CCW
       new Text(x, y, text, h = 2.5, layer = "TEXT", anchor = "start", rot = 0)
       new Dim(x1, y1, x2, y2, offset = 8, text = null, layer = "DIM")
       new View(title, entities = [], scale = null)
           .line(x1, y1, x2, y2, layer), .rect(x, y, w, h, layer, fill), .poly(pts, closed, layer, fill),
           .circle(cx, cy, r, layer, fill), .text(x, y, s, h, layer, anchor, rot), .dim(x1, y1, x2, y2, offset, text),
           .bar_dot(cx, cy, dia), .bbox() → [x0, y0, x1, y1]
       new Sheet(title, number = "D-01", views = [], notes = [], project = "", drawn_by = "CivilEst Pro – Design Studio",
                 company = {})   .add(view) → view
       layout(sheet) → [[view, scale, ox, oy, title_x, title_y]…], drawing_area() → [x0, y0, x1, y1]
       to_svg(sheet, width_px = 1400) → string, to_dxf(sheets) → string, to_pdf(sheets) → Uint8Array
       rebar_label(n, dia, spacing = null, mark = ""), diagram_view(title, xs, ys, length_mm, height_mm, unit, labels = true),
       table_view(title, header, rows, col_w, row_h = 7, text_h = 2.2)
       Python keyword args: the last argument of View.text / rect / poly / circle / dim, of table_view and of
       diagram_view may be an options object, e.g. v.text(x, y, "A", 2.6, {anchor: "middle"}).
*/
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var D = DS.drawing = {};
  function C() { return DS.core; }

  /* ------------------------------------------------------------------ constants */
  // layer: [DXF colour index, SVG/PDF rgb, line width mm, dash]
  var LAYERS = {
    OUTLINE: [7, [0.08, 0.08, 0.10], 0.50, null],
    CONCRETE: [8, [0.30, 0.30, 0.33], 0.35, null],
    HIDDEN: [8, [0.40, 0.40, 0.44], 0.25, [3, 1.5]],
    REBAR: [1, [0.78, 0.06, 0.06], 0.60, null],
    STEEL: [5, [0.08, 0.22, 0.62], 0.50, null],
    DIM: [3, [0.00, 0.40, 0.18], 0.18, null],
    TEXT: [7, [0.08, 0.08, 0.10], 0.25, null],
    CENTER: [4, [0.05, 0.50, 0.60], 0.18, [8, 1.5, 1, 1.5]],
    GRID: [4, [0.05, 0.50, 0.60], 0.18, [8, 1.5, 1, 1.5]],
    LOAD: [6, [0.62, 0.12, 0.52], 0.30, null],
    SOIL: [32, [0.50, 0.36, 0.16], 0.30, null],
    WATER: [150, [0.12, 0.42, 0.78], 0.25, [4, 2]],
    TITLE: [7, [0.08, 0.08, 0.10], 0.35, null],
    TITLEB: [7, [0.08, 0.08, 0.10], 0.35, null],
    FRAME: [7, [0.08, 0.08, 0.10], 0.70, null],
    THIN: [7, [0.35, 0.35, 0.38], 0.18, null],
    DIAGRAM: [2, [0.72, 0.42, 0.02], 0.35, null]
  };
  var FILLS = { "concrete": [0.88, 0.88, 0.86], "steel": [0.80, 0.85, 0.95], "soil": [0.93, 0.88, 0.78],
    "water": [0.85, 0.92, 1.00], "rebar": [0.80, 0.10, 0.10], "diagram+": [0.99, 0.90, 0.75],
    "diagram-": [0.80, 0.90, 0.99], "black": [0.1, 0.1, 0.12], "brick": [0.95, 0.80, 0.70] };
  var STD_SCALES = [1, 2, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000, 1500, 2000];
  var A3 = [420.0, 297.0];
  var MARGIN = 10.0;            // SP 46:2003 – 10 mm border on A3 …
  var MARGIN_L = 20.0;          // … 20 mm on the binding (left) edge
  var RIGHT_W = 122.0;          // right-hand strip: general notes, revision table, title block
  var TITLE_H = 74.0;           // title block height
  var REV_H = 22.0;             // revision table height
  var TXT = 2.5;                // SP 46 standard text height (mm)
  var TXT_VIEW = 3.5;           // view titles
  var TXT_TITLE = 5.0;          // drawing title
  D.LAYERS = LAYERS; D.FILLS = FILLS; D.STD_SCALES = STD_SCALES; D.A3 = A3; D.MARGIN = MARGIN; D.MARGIN_L = MARGIN_L;
  D.RIGHT_W = RIGHT_W; D.TITLE_H = TITLE_H; D.REV_H = REV_H; D.TXT = TXT; D.TXT_VIEW = TXT_VIEW; D.TXT_TITLE = TXT_TITLE;

  /* ------------------------------------------------------------------ Python-compatible formatting */
  /* f"{x:.{p}f}" exactly (round-half-even on the exact binary value, "-0.00" for negative zero / tiny negatives) */
  function F(x, p) {
    if (typeof x === "boolean") x = x ? 1 : 0;
    if (!isFinite(x)) return isNaN(x) ? "nan" : (x > 0 ? "inf" : "-inf");
    var neg = x < 0 || (x === 0 && 1 / x < 0), a = Math.abs(x), s = a.toFixed(p);
    if (a < 1e21) {
      var y = a * Math.pow(10, p), fr = y - Math.floor(y);
      if (Math.abs(fr - 0.5) < 1e-6) {                 // possible exact tie: JS rounds half up, Python half even
        var ex = a.toFixed(Math.min(100, p + 60)), dot = ex.indexOf(".");
        var tail = ex.slice(dot + 1 + p);
        if (/^50*$/.test(tail)) {
          var digits = (p ? ex.slice(0, dot) + ex.slice(dot + 1, dot + 1 + p) : ex.slice(0, dot));
          var last = +digits[digits.length - 1];
          if (last % 2 === 0) {                          // round down (keep even)
            s = p ? digits.slice(0, digits.length - p).replace(/^$/, "0") + "." + digits.slice(digits.length - p) : digits;
          }
        }
      }
    } else s = BigInt(a).toString() + (p ? "." + "0".repeat(p) : "");
    return (neg ? "-" : "") + s;
  }
  D._F = F;
  function G(x) { return C().pyfmt(x, "g"); }
  function pystr(v) { return C().pystr(v); }
  /* Python str() of a float field that may be integral (e.g. 420.0) */
  function fstr(v) { return Number.isInteger(v) ? v.toFixed(1) : pystr(v); }

  /* code-point aware string helpers */
  function cps(s) { return Array.from(s); }
  function plen(s) { return cps(s).length; }
  function head(s, n) {   // s[:n] with Python slice semantics
    var a = cps(s); if (n < 0) n = Math.max(0, a.length + n); return a.slice(0, n).join("");
  }
  var PY_WS = /[\t\n\x0b\x0c\r\x1c-\x1f \x85\xa0\u{1680}\u{2000}-\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}]+/u;
  function pysplit(s) { return s.split(PY_WS).filter(function (w) { return w.length > 0; }); }
  function pyupper(s) { return String(s).toUpperCase(); }
  /* str.isdigit(): Nd plus the "Digit" numeric type (superscripts, circled digits …) */
  var DIGIT_EXTRA = /[\u{b2}\u{b3}\u{b9}\u{1369}-\u{1371}\u{19da}\u{2070}\u{2074}-\u{2079}\u{2080}-\u{2089}\u{2460}-\u{2468}\u{2474}-\u{247c}\u{2488}-\u{2490}\u{24ea}\u{24f5}-\u{24fd}\u{24ff}\u{2776}-\u{277e}\u{2780}-\u{2788}\u{278a}-\u{2792}\u{10a40}-\u{10a43}\u{10e60}-\u{10e68}\u{11052}-\u{1105a}\u{1f100}-\u{1f10a}]/u;
  var RE_UP = /\p{Uppercase}/u, RE_ND = /\p{Nd}/u;
  function isUpperOrDigit(ch) { return RE_UP.test(ch) || RE_ND.test(ch) || DIGIT_EXTRA.test(ch); }
  D._isUpperOrDigit = isUpperOrDigit;
  function pyround(x, n) { return C().pyround(x, n); }
  function radians(d) { return d * (Math.PI / 180.0); }
  function degrees(r) { return r * (180.0 / Math.PI); }
  function pymod(a, b) { var r = a % b; return r !== 0 && (r < 0) !== (b < 0) ? r + b : r; }
  function today(fmt) {
    var d = new Date(), dd = ("0" + d.getDate()).slice(-2), mm = ("0" + (d.getMonth() + 1)).slice(-2), y = String(d.getFullYear());
    return fmt === "y" ? dd + "-" + mm + "-" + y.slice(-2) : dd + "-" + mm + "-" + y;
  }
  function opt(args, n) {   // pull a trailing options object (Python keyword args) off an arguments list
    var a = [].slice.call(args);
    var o = a.length && a[a.length - 1] && typeof a[a.length - 1] === "object" && !Array.isArray(a[a.length - 1]) && a.length > n ? a.pop() : {};
    return { a: a, o: o };
  }
  function pick(a, o, i, key, def) { var v = key in o ? o[key] : a[i]; return v === undefined ? def : v; }

  /* ------------------------------------------------------------------ entities */
  function Line(x1, y1, x2, y2, layer) { this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2; this.layer = layer == null ? "OUTLINE" : layer; }
  function PLine(pts, closed, layer, fill) { this.pts = pts; this.closed = !!closed; this.layer = layer == null ? "OUTLINE" : layer; this.fill = fill == null ? null : fill; }
  function Circle(cx, cy, r, layer, fill) { this.cx = cx; this.cy = cy; this.r = r; this.layer = layer == null ? "OUTLINE" : layer; this.fill = fill == null ? null : fill; }
  function Arc(cx, cy, r, a1, a2, layer) { this.cx = cx; this.cy = cy; this.r = r; this.a1 = a1; this.a2 = a2; this.layer = layer == null ? "OUTLINE" : layer; }
  function Text(x, y, text, h, layer, anchor, rot) {
    this.x = x; this.y = y; this.text = text; this.h = h == null ? 2.5 : h; this.layer = layer == null ? "TEXT" : layer;
    this.anchor = anchor == null ? "start" : anchor; this.rot = rot == null ? 0.0 : rot;
  }
  /* Aligned linear dimension between p1 and p2; offset in paper mm.
     + offset = right-hand side of p1→p2 (below a left→right dim, right of a bottom→top dim). */
  function Dim(x1, y1, x2, y2, offset, text, layer) {
    this.x1 = x1; this.y1 = y1; this.x2 = x2; this.y2 = y2; this.offset = offset == null ? 8.0 : offset;
    this.text = text == null ? null : text; this.layer = layer == null ? "DIM" : layer;
  }
  D.Line = Line; D.PLine = PLine; D.Circle = Circle; D.Arc = Arc; D.Text = Text; D.Dim = Dim;

  function View(title, entities, scale) {
    this.title = title; this.entities = entities || []; this.scale = scale == null ? null : scale;
  }
  // convenience builders -------------------------------------------------
  View.prototype.line = function (x1, y1, x2, y2, layer) {
    var p = opt(arguments, 4), a = p.a, o = p.o;
    this.entities.push(new Line(x1, y1, x2, y2, pick(a, o, 4, "layer", "OUTLINE")));
  };
  View.prototype.rect = function (x, y, w, h, layer, fill) {
    var p = opt(arguments, 4), a = p.a, o = p.o;
    this.entities.push(new PLine([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true, pick(a, o, 4, "layer", "OUTLINE"), pick(a, o, 5, "fill", null)));
  };
  View.prototype.poly = function (pts, closed, layer, fill) {
    var p = opt(arguments, 1), a = p.a, o = p.o;
    this.entities.push(new PLine(Array.from(pts), pick(a, o, 1, "closed", false), pick(a, o, 2, "layer", "OUTLINE"), pick(a, o, 3, "fill", null)));
  };
  View.prototype.circle = function (cx, cy, r, layer, fill) {
    var p = opt(arguments, 3), a = p.a, o = p.o;
    this.entities.push(new Circle(cx, cy, r, pick(a, o, 3, "layer", "OUTLINE"), pick(a, o, 4, "fill", null)));
  };
  View.prototype.text = function (x, y, s, h, layer, anchor, rot) {
    var p = opt(arguments, 3), a = p.a, o = p.o;
    this.entities.push(new Text(x, y, pystr(s), pick(a, o, 3, "h", 2.5), pick(a, o, 4, "layer", "TEXT"), pick(a, o, 5, "anchor", "start"), pick(a, o, 6, "rot", 0.0)));
  };
  View.prototype.dim = function (x1, y1, x2, y2, offset, text) {
    var p = opt(arguments, 4), a = p.a, o = p.o;
    this.entities.push(new Dim(x1, y1, x2, y2, pick(a, o, 4, "offset", 8.0), pick(a, o, 5, "text", null)));
  };
  View.prototype.bar_dot = function (cx, cy, dia) {
    this.entities.push(new Circle(cx, cy, Math.max(dia / 2, 1.0), "REBAR", "rebar"));
  };
  View.prototype.bbox = function () {
    var xs = [], ys = [];
    this.entities.forEach(function (e) {
      if (e instanceof Line) { xs.push(e.x1, e.x2); ys.push(e.y1, e.y2); }
      else if (e instanceof PLine) { e.pts.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); }); }
      else if (e instanceof Circle || e instanceof Arc) { xs.push(e.cx - e.r, e.cx + e.r); ys.push(e.cy - e.r, e.cy + e.r); }
      else if (e instanceof Dim) { xs.push(e.x1, e.x2); ys.push(e.y1, e.y2); }
      else if (e instanceof Text) { xs.push(e.x); ys.push(e.y); }
    });
    if (!xs.length) return [0, 0, 1, 1];
    return [amin(xs), amin(ys), amax(xs), amax(ys)];
  };
  function amin(a) { var m = a[0]; for (var i = 1; i < a.length; i++) if (a[i] < m) m = a[i]; return m; }
  function amax(a) { var m = a[0]; for (var i = 1; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }
  D.View = View;

  function Sheet(title, number, views, notes, project, drawn_by, company) {
    this.title = title;
    this.number = number == null ? "D-01" : number;
    this.views = views || [];
    this.notes = notes || [];
    this.project = project == null ? "" : project;
    this.drawn_by = drawn_by == null ? "CivilEst Pro – Design Studio" : drawn_by;
    this.company = company || {};       // firm header: firm, tagline, address, designed_by …
  }
  Sheet.prototype.add = function (view) { this.views.push(view); return view; };
  D.Sheet = Sheet;

  /* =========================================================================== layout */
  function _cols(n) { return n === 1 ? 1 : n <= 4 ? 2 : 3; }
  D._cols = _cols;

  function drawing_area() {
    var W = A3[0], H = A3[1];
    var x0 = MARGIN_L + 4, y0 = MARGIN + 10;                // leave room for the footer line
    var x1 = W - MARGIN - RIGHT_W - 4, y1 = H - MARGIN - 4;
    return [x0, y0, x1, y1];
  }
  D.drawing_area = drawing_area;

  /* Return [[view, scale, ox, oy, title_x, title_y]] – model (x, y) → paper (ox + x/s, oy + y/s).
     View titles are placed *below* each view (SP 46 practice). */
  function layout(sheet) {
    var ar = drawing_area(), ax0 = ar[0], ay0 = ar[1], ax1 = ar[2], ay1 = ar[3];
    var n = Math.max(sheet.views.length, 1);
    var pad_x = 28.0, pad_top = 12.0, pad_bot = 34.0;
    var boxes = sheet.views.map(function (v) { return v.bbox(); });

    function worst_need(cols) {
      var rows_ = Math.ceil(n / cols);
      var cw_ = (ax1 - ax0) / cols, ch_ = (ay1 - ay0) / rows_;
      var need_ = 0.0;
      sheet.views.forEach(function (v_, i) {
        var b = boxes[i];
        need_ = Math.max(need_, (b[2] - b[0]) / Math.max(cw_ - pad_x, 10) / Math.max(v_.scale || 1, 1) * (v_.scale || 1),
          (b[3] - b[1]) / Math.max(ch_ - pad_top - pad_bot, 10));
      });
      // prefer layouts where every view gets a large scale (small "need"), then more columns
      return need_;
    }

    var cols = 1;
    if (sheet.views.length) {
      var best = null;
      for (var k = 1; k <= Math.min(n, 3); k++) {
        var key = [pyround(worst_need(k), 3), -k];
        if (best === null || key[0] < best[0] || (key[0] === best[0] && key[1] < best[1])) { best = key; cols = k; }
      }
    }
    var rows = Math.ceil(n / cols);
    var cw = (ax1 - ax0) / cols, ch = (ay1 - ay0) / rows;
    var placed = [];
    sheet.views.forEach(function (v, k) {
      var b = boxes[k], x0 = b[0], y0 = b[1], x1 = b[2], y1 = b[3];
      var bw = Math.max(x1 - x0, 1e-6), bh = Math.max(y1 - y0, 1e-6);
      var need = Math.max(bw / Math.max(cw - pad_x, 10), bh / Math.max(ch - pad_top - pad_bot, 10));
      var s = need;
      for (var q = 0; q < STD_SCALES.length; q++) if (STD_SCALES[q] >= need) { s = STD_SCALES[q]; break; }
      if (v.scale && v.scale >= need) s = v.scale;
      var r = Math.floor(k / cols), c = k % cols;
      var cx0 = ax0 + c * cw;
      var cy_top = ay0 + (rows - r) * ch;
      var ox = cx0 + (cw - bw / s) / 2 - x0 / s;
      var avail = ch - pad_top - pad_bot;
      var oy = cy_top - pad_top - (avail - bh / s) / 2 - y1 / s;
      var title_y = oy + y0 / s - 24.0;
      placed.push([v, s, ox, oy, cx0 + cw / 2, Math.max(title_y, cy_top - ch + 6)]);
    });
    return placed;
  }
  D.layout = layout;

  /* Approximate Helvetica width for cap-height h (font size = 1.39 h). */
  function _text_w(s, h, bold) {
    var a = cps(s), caps = 0;
    for (var i = 0; i < a.length; i++) if (isUpperOrDigit(a[i])) caps++;
    var k = bold ? 1.10 : 1.0;
    return k * h * (0.76 * caps + 0.62 * (a.length - caps));
  }
  D._text_w = _text_w;

  /* Flatten the sheet into paper-space primitives: [kind, data, layer]. */
  function _paper_prims(sheet) {
    var prims = [];
    layout(sheet).forEach(function (pl) {
      var v = pl[0], s = pl[1], ox = pl[2], oy = pl[3], tx = pl[4], ty = pl[5];
      var T = function (x, y) { return [ox + x / s, oy + y / s]; };
      var title = pyupper(v.title);
      prims.push(["text", [tx, ty, title, TXT_VIEW, "middle", 0.0], "TITLEB"]);
      var tw = _text_w(title, TXT_VIEW, true);
      prims.push(["line", [tx - tw / 2, ty - 1.2, tx + tw / 2, ty - 1.2], "TITLE"]);
      prims.push(["line", [tx - tw / 2, ty - 1.9, tx + tw / 2, ty - 1.9], "THIN"]);
      prims.push(["text", [tx, ty - 6.0, s >= 1 ? "SCALE 1:" + G(s) : "NTS", TXT, "middle", 0.0], "TEXT"]);
      v.entities.forEach(function (e) {
        var p, q;
        if (e instanceof Line) { p = T(e.x1, e.y1); q = T(e.x2, e.y2); prims.push(["line", [p[0], p[1], q[0], q[1]], e.layer]); }
        else if (e instanceof PLine) prims.push(["pline", [e.pts.map(function (pt) { return T(pt[0], pt[1]); }), e.closed, e.fill], e.layer]);
        else if (e instanceof Circle) { p = T(e.cx, e.cy); prims.push(["circle", [p[0], p[1], e.r / s, e.fill], e.layer]); }
        else if (e instanceof Arc) { p = T(e.cx, e.cy); prims.push(["arc", [p[0], p[1], e.r / s, e.a1, e.a2], e.layer]); }
        else if (e instanceof Text) {
          var h = e.h >= 2.0 ? Math.max(e.h * 1.05, TXT) : e.h;
          p = T(e.x, e.y); prims.push(["text", [p[0], p[1], e.text, h, e.anchor, e.rot], e.layer]);
        } else if (e instanceof Dim) {
          p = T(e.x1, e.y1); q = T(e.x2, e.y2);
          _dim_prims(p[0], p[1], q[0], q[1], e.offset, e.text || _dim_text(Math.hypot(e.x2 - e.x1, e.y2 - e.y1))).forEach(function (x) { prims.push(x); });
        }
      });
    });
    return prims.concat(_frame_prims(sheet));
  }
  D._paper_prims = _paper_prims;

  /* Border, right-hand strip with general notes, revision table and title block (SP 46 style). */
  function _frame_prims(sheet) {
    var W = A3[0], H = A3[1], P = [];
    function box(x0, y0, x1, y1, layer) { P.push(["pline", [[[x0, y0], [x1, y0], [x1, y1], [x0, y1]], true, null], layer || "TITLE"]); }
    function hl(x0, x1, y, layer) { P.push(["line", [x0, y, x1, y], layer || "THIN"]); }
    function vl(x, y0, y1, layer) { P.push(["line", [x, y0, x, y1], layer || "THIN"]); }
    function tx(x, y, t, h, layer, anchor) { P.push(["text", [x, y, t, h == null ? TXT : h, anchor || "start", 0.0], layer || "TEXT"]); }

    // trimmed sheet edge + drawing frame
    box(MARGIN_L, MARGIN, W - MARGIN, H - MARGIN, "FRAME");
    // right strip
    var rx0 = W - MARGIN - RIGHT_W, rx1 = W - MARGIN;
    vl(rx0, MARGIN, H - MARGIN, "TITLE");
    var ty0 = MARGIN, ty1 = MARGIN + TITLE_H;
    var ry0 = ty1, ry1 = ty1 + REV_H;
    hl(rx0, rx1, ty1, "TITLE");
    hl(rx0, rx1, ry1, "TITLE");
    // ---- title block
    var cx = rx0 + 3;
    var y = ty1 - 5.0;
    var co = sheet.company || {};
    var get = function (k) { var v = co[k]; return v == null ? "" : v; };
    var firm = pyupper(get("firm") || "CIVILEST PRO  ·  DESIGN STUDIO");
    var fh = _text_w(firm, 3.0, true) <= RIGHT_W - 6 ? 3.0 : 2.4;
    tx(cx, y, head(firm, Math.trunc((RIGHT_W - 6) / (0.84 * fh))), fh, "TITLEB");
    var sub = [get("address"), get("phone"), get("gstin") && "GSTIN " + get("gstin")].filter(function (x) { return x; }).join(" · ") ||
      get("tagline") || "STRUCTURAL / CIVIL";
    tx(cx, y - 3.9, head(sub, Math.trunc((RIGHT_W - 6) / (0.62 * 1.9))), 1.9, "TEXT");
    y -= 2.4;
    hl(rx0, rx1, y - 3.1);
    y -= 8.3;
    tx(cx, y, "PROJECT", 2.0, "TEXT");
    _wrap(pyupper(sheet.project || "—"), Math.trunc((RIGHT_W - 26) / (0.86 * 2.8))).slice(0, 2).forEach(function (line, k) {
      tx(cx + 19, y - k * 3.8, line, 2.8, "TITLEB");
    });
    y -= 9.5;
    hl(rx0, rx1, y + 2.6);
    tx(cx, y - 1.5, "DRAWING", 2.0, "TEXT");
    var th_ = _text_w(pyupper(sheet.title), TXT_TITLE, true) <= RIGHT_W - 26 ? TXT_TITLE : 3.6;
    var tlines = _wrap(pyupper(sheet.title), Math.trunc((RIGHT_W - 26) / (0.86 * th_))).slice(0, 2);
    tlines.forEach(function (line, k) { tx(cx + 19, y - 1.5 - k * (th_ + 1.4), line, th_, "TITLEB"); });
    y -= 13.0;
    hl(rx0, rx1, y + 2.6, "TITLE");
    // 2 × 4 grid of fields
    var cells = [["DRG. NO.", sheet.number], ["SHEET", "1 OF 1"], ["SCALE", "AS SHOWN"],
      ["DATE", today()], ["DESIGNED", get("designed_by")],
      ["CHECKED", get("checked_by")], ["DRAWN", get("drawn_by") || "CE-DS"],
      ["APPROVED", get("approved_by")]];
    var gy_top = y + 2.6;
    var rh = (gy_top - ty0) / 4;
    var colw = RIGHT_W / 2;
    cells.forEach(function (cell, k) {
      var lab = cell[0], val = cell[1];
      var r_ = Math.floor(k / 2), c_ = k % 2;
      var x = rx0 + c_ * colw;
      var yy = gy_top - (r_ + 1) * rh;
      if (c_ === 1) vl(x, yy, yy + rh);
      hl(rx0, rx1, yy);
      tx(x + 2, yy + rh - 3.0, lab, 1.9, "TEXT");
      tx(x + 2, yy + 1.8, head(pystr(val), 26), lab === "DRG. NO." ? 2.8 : TXT, lab === "DRG. NO." ? "TITLEB" : "TEXT");
    });
    // ---- revision table
    tx(cx, ry1 - 4.5, "REVISIONS", 2.5, "TITLEB");
    hl(rx0, rx1, ry1 - 6.5);
    [[0, "REV"], [12, "DATE"], [34, "DESCRIPTION"], [100, "BY"]].forEach(function (cl) {
      var off = cl[0], lab = cl[1];
      tx(rx0 + 2 + off, ry1 - 10.5, lab, 2.0, "TEXT");
      if (off) vl(rx0 + off, ry0, ry1 - 6.5);
    });
    hl(rx0, rx1, ry1 - 12.5);
    tx(rx0 + 4, ry1 - 17.0, "0", 2.2);
    tx(rx0 + 14, ry1 - 17.0, today("y"), 2.2);
    tx(rx0 + 36, ry1 - 17.0, "FIRST ISSUE (FOR APPROVAL)", 2.2);
    // ---- general notes
    var ny = H - MARGIN - 6.0;
    tx(cx, ny, "GENERAL NOTES", 3.5, "TITLEB");
    hl(rx0 + 3, rx0 + 3 + _text_w("GENERAL NOTES", 3.5, true), ny - 1.2, "TITLE");
    ny -= 7.0;
    var h = TXT;
    var width_chars = Math.trunc((RIGHT_W - 11) / (0.64 * h));
    var lines = sheet.notes.map(function (note, i) { return [(i + 1) + ".", _wrap(note, width_chars)]; });
    var total = 0; lines.forEach(function (l) { total += l[1].length; });
    var room = (ny - ry1 - 4) / (h * 1.45);
    if (total > room) {                                   // shrink to fit, never below 2.0 mm
      h = Math.max(2.0, TXT * room / Math.max(total, 1));
      width_chars = Math.trunc((RIGHT_W - 11) / (0.64 * h));
      lines = sheet.notes.map(function (n, i) { return [(i + 1) + ".", _wrap(n, width_chars)]; });
    }
    lines.forEach(function (l) {
      var num = l[0], wrapped = l[1];
      for (var j = 0; j < wrapped.length; j++) {
        if (ny < ry1 + 3) break;
        if (j === 0) tx(cx, ny, num, h);
        tx(cx + 5.5, ny, wrapped[j], h);
        ny -= h * 1.45;
      }
      ny -= 0.8;
    });
    // footer
    tx(MARGIN_L + 3, MARGIN + 3.5, "Design aid – to be checked and signed by a qualified structural engineer before " +
      "construction.  All dimensions in mm, levels in m, unless noted.", 2.0);
    return P;
  }
  D._frame_prims = _frame_prims;

  function _wrap(s, n) {
    var words = pysplit(String(s)), out = [], cur = "";
    words.forEach(function (w) {
      if (plen(cur) + plen(w) + 1 > n) { out.push(cur); cur = w; }
      else cur = (cur + " " + w).replace(/^\s+|\s+$/g, "");
    });
    if (cur) out.push(cur);
    return out.length ? out : [""];
  }
  D._wrap = _wrap;

  function _dim_text(v) { return v >= 1 ? F(v, 0).replace(/\B(?=(\d{3})+(?!\d))/g, ",") : F(v, 1); }
  D._dim_text = _dim_text;

  function _dim_prims(x1, y1, x2, y2, off, text) {
    var L = Math.hypot(x2 - x1, y2 - y1);
    if (L < 1e-6) return [];
    var ux = (x2 - x1) / L, uy = (y2 - y1) / L;
    var nx = uy, ny = -ux;
    var a1 = [x1 + nx * off, y1 + ny * off];
    var a2 = [x2 + nx * off, y2 + ny * off];
    var sgn = off >= 0 ? 1 : -1;
    var ext = 1.5 * sgn;
    var pr = [["line", [x1 + nx * sgn * 1.0, y1 + ny * sgn * 1.0, a1[0] + nx * ext, a1[1] + ny * ext], "DIM"],
      ["line", [x2 + nx * sgn * 1.0, y2 + ny * sgn * 1.0, a2[0] + nx * ext, a2[1] + ny * ext], "DIM"],
      ["line", [a1[0], a1[1], a2[0], a2[1]], "DIM"]];
    var t = 1.2;  // oblique tick
    [a1, a2].forEach(function (p) {
      var px = p[0], py = p[1];
      pr.push(["line", [px - (ux + nx) * t, py - (uy + ny) * t, px + (ux + nx) * t, py + (uy + ny) * t], "DIM"]);
    });
    var ang = degrees(Math.atan2(uy, ux));
    if (ang > 90 || ang <= -90) ang -= ang > 0 ? 180 : -180;
    var f = sgn > 0 ? 3.4 : -1.2;          // keep the text on the outer side of the dimension line
    var mx = (a1[0] + a2[0]) / 2 + nx * f, my = (a1[1] + a2[1]) / 2 + ny * f;
    pr.push(["text", [mx, my, text, TXT, "middle", ang], "DIM"]);
    return pr;
  }
  D._dim_prims = _dim_prims;

  /* =========================================================================== SVG */
  function _rgb(c) {
    return "#" + c.map(function (v) { var n = Math.trunc(v * 255); return (n < 16 ? "0" : "") + n.toString(16); }).join("");
  }
  function _esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  D._rgb = _rgb; D._esc = _esc;
  function layerOf(layer) { return Object.prototype.hasOwnProperty.call(LAYERS, layer) ? LAYERS[layer] : LAYERS.OUTLINE; }

  function to_svg(sheet, width_px) {
    if (width_px == null) width_px = 1400;
    var W = A3[0], H = A3[1];
    var k = 1.0;  // 1 user unit = 1 paper mm
    var out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + fstr(W) + " " + fstr(H) + '" width="' + pystr(width_px) + '" ' +
      'height="' + F(width_px * H / W, 0) + '" style="background:#fff;font-family:Arial,Helvetica,sans-serif">',
      '<rect x="0" y="0" width="' + fstr(W) + '" height="' + fstr(H) + '" fill="#ffffff"/>'];
    /* material hatches for the on-screen / SVG sheet (PDF and DXF keep flat fills): concrete stipple, soil and brick hatch, water lines */
    var pat = function (id, w, h, bg, body) { return '<pattern id="dsf-' + id + '" patternUnits="userSpaceOnUse" width="' + w + '" height="' + h + '"><rect width="' + w + '" height="' + h + '" fill="' + _rgb(bg) + '"/>' + body + "</pattern>"; };
    out.push("<defs>" +
      pat("concrete", 7, 7, FILLS.concrete, '<g fill="#8f8f8a"><circle cx="1.1" cy="1.4" r="0.16"/><circle cx="4.6" cy="0.8" r="0.13"/><circle cx="3.1" cy="3.6" r="0.17"/><circle cx="6.1" cy="4.4" r="0.13"/><circle cx="1.5" cy="5.6" r="0.14"/><circle cx="4.9" cy="6.1" r="0.12"/></g><g fill="none" stroke="#8f8f8a" stroke-width="0.12"><path d="M5.3 2.2l0.7 0.2l-0.5 0.6z"/><path d="M2.2 2.3l0.6 -0.5l0.3 0.7z"/><path d="M0.5 3.7l0.7 0.1l-0.4 0.6z"/><path d="M3.4 5.2l0.6 0.3l-0.6 0.4z"/></g>') +
      pat("soil", 5, 5, FILLS.soil, '<g stroke="#9a7b4a" stroke-width="0.14" fill="none"><path d="M0 5L5 0M-1 1L1 -1M4 6L6 4"/><path d="M0.6 2.2h1.1M3 3.9h1.2"/></g>') +
      pat("brick", 2.4, 2.4, FILLS.brick, '<path d="M0 2.4L2.4 0M-0.6 0.6L0.6 -0.6M1.8 3L3 1.8" stroke="#b0553a" stroke-width="0.13" fill="none"/>') +
      pat("water", 9, 3, FILLS.water, '<path d="M0.8 1h3.4M5.4 2.3h2.6" stroke="#3b7fc4" stroke-width="0.14" fill="none"/>') +
      "</defs>");
    var PATS = { concrete: 1, soil: 1, brick: 1, water: 1 };
    var fillOf = function (f) { return PATS[f] ? "url(#dsf-" + f + ")" : _rgb(FILLS[f]); };
    var fy = function (y) { return H - y; };
    _paper_prims(sheet).forEach(function (pr) {
      var kind = pr[0], d = pr[1], layer = pr[2];
      var L = layerOf(layer), col = L[1], lw = L[2], dash = L[3];
      var stroke = 'stroke="' + _rgb(col) + '" stroke-width="' + F(lw * k, 2) + '" fill="none"';
      if (dash) stroke += ' stroke-dasharray="' + dash.map(pystr).join(",") + '"';
      var st;
      if (kind === "line") {
        out.push('<line x1="' + F(d[0], 2) + '" y1="' + F(fy(d[1]), 2) + '" x2="' + F(d[2], 2) + '" y2="' + F(fy(d[3]), 2) + '" ' + stroke + "/>");
      } else if (kind === "pline") {
        var pts = d[0], closed = d[1], fill = d[2];
        var ps = pts.map(function (p) { return F(p[0], 2) + "," + F(fy(p[1]), 2); }).join(" ");
        var tag = closed ? "polygon" : "polyline";
        st = !fill ? stroke : stroke.replace('fill="none"', 'fill="' + fillOf(fill) + '"');
        out.push("<" + tag + ' points="' + ps + '" ' + st + "/>");
      } else if (kind === "circle") {
        var x = d[0], y = d[1], r = d[2], fl = d[3];
        st = !fl ? stroke : stroke.replace('fill="none"', 'fill="' + _rgb(FILLS[fl]) + '"');
        out.push('<circle cx="' + F(x, 2) + '" cy="' + F(fy(y), 2) + '" r="' + F(Math.max(r, 0.25), 2) + '" ' + st + "/>");
      } else if (kind === "arc") {
        var ax = d[0], ay = d[1], ar = d[2], a1 = d[3], a2 = d[4];
        var p1 = [ax + ar * Math.cos(radians(a1)), ay + ar * Math.sin(radians(a1))];
        var p2 = [ax + ar * Math.cos(radians(a2)), ay + ar * Math.sin(radians(a2))];
        var large = pymod(a2 - a1, 360) > 180 ? 1 : 0;
        out.push('<path d="M ' + F(p1[0], 2) + " " + F(fy(p1[1]), 2) + " A " + F(ar, 2) + " " + F(ar, 2) + " 0 " + large + " 0 " +
          F(p2[0], 2) + " " + F(fy(p2[1]), 2) + '" ' + stroke + "/>");
      } else if (kind === "text") {
        var tx = d[0], ty = d[1], s = d[2], h = d[3], anchor = d[4], rot = d[5];
        var tr = rot ? ' transform="rotate(' + F(-rot, 1) + " " + F(tx, 2) + " " + F(fy(ty), 2) + ')"' : "";
        var weight = layer === "TITLEB" ? ' font-weight="bold"' : "";
        out.push('<text x="' + F(tx, 2) + '" y="' + F(fy(ty), 2) + '" font-size="' + F(h, 2) + '" fill="' + _rgb(col) + '" ' +
          'text-anchor="' + anchor + '"' + weight + tr + ">" + _esc(s) + "</text>");
      }
    });
    out.push("</svg>");
    return out.join("\n");
  }
  D.to_svg = to_svg;

  /* =========================================================================== DXF R12 */
  var _DXF_REPL = [["Ø", "%%c"], ["φ", "%%c"], ["°", "%%d"], ["±", "%%p"], ["×", "x"], ["²", "2"], ["³", "3"], ["–", "-"], ["—", "-"],
    ["≥", ">="], ["≤", "<="], ["₹", "Rs."], ["√", "sqrt"], ["Σ", "Sum"], ["·", "."], ["→", "->"], ["µ", "u"],
    ["γ", "g"], ["τ", "tau"], ["σ", "s"], ["λ", "lambda"], ["α", "a"], ["β", "b"], ["θ", "theta"], ["δ", "d"]];
  D._DXF_REPL = _DXF_REPL;

  function _dxf_text(s) {
    _DXF_REPL.forEach(function (ab) { s = s.split(ab[0]).join(ab[1]); });
    return cps(s).map(function (ch) { return ch.codePointAt(0) < 128 ? ch : "?"; }).join("");
  }
  D._dxf_text = _dxf_text;

  /* All sheets/views at 1:1 model millimetres, arranged in rows (one row per sheet). */
  function to_dxf(sheets) {
    var ents = [];
    function g(code, val) { ents.push(code + "\n" + val); }
    function line(x1, y1, x2, y2, layer) {
      g(0, "LINE"); g(8, layer); g(10, F(x1, 3)); g(20, F(y1, 3)); g(30, 0);
      g(11, F(x2, 3)); g(21, F(y2, 3)); g(31, 0);
    }
    function text(x, y, s, h, layer, anchor, rot) {
      if (anchor == null) anchor = "start";
      g(0, "TEXT"); g(8, layer); g(10, F(x, 3)); g(20, F(y, 3)); g(30, 0);
      g(40, F(h, 3)); g(1, _dxf_text(s));
      if (rot) g(50, F(rot, 2));
      if (anchor !== "start") {
        g(72, anchor === "middle" ? 1 : 2);
        g(11, F(x, 3)); g(21, F(y, 3)); g(31, 0);
      }
    }
    var y_cursor = 0.0;
    sheets.forEach(function (sh) {
      var x_cursor = 0.0, row_h = 0.0, sheet_views = [];
      sh.views.forEach(function (v) {
        var b = v.bbox(), x0 = b[0], y0 = b[1], x1 = b[2], y1 = b[3];
        var s = v.scale || Math.max(1.0, Math.max(x1 - x0, y1 - y0) / 150.0);
        sheet_views.push([v, s, x0, y0, x1, y1]);
        row_h = Math.max(row_h, y1 - y0 + 40 * s);
      });
      text(0, y_cursor + 30 * Math.max(1.0, row_h / 400), sh.number + "  " + sh.title, 8 * Math.max(1.0, row_h / 400), "TITLE");
      sheet_views.forEach(function (sv) {
        var v = sv[0], s = sv[1], x0 = sv[2], y0 = sv[3], x1 = sv[4], y1 = sv[5];
        var dx = x_cursor - x0, dy = y_cursor - y0 - (y1 - y0);
        text(x_cursor, dy + y1 + 12 * s, pyupper(v.title + " (1:" + G(s) + ")"), 4 * s, "TITLE");
        v.entities.forEach(function (e) {
          if (e instanceof Line) line(e.x1 + dx, e.y1 + dy, e.x2 + dx, e.y2 + dy, e.layer);
          else if (e instanceof PLine) {
            var pts = e.pts.concat(e.closed ? [e.pts[0]] : []);
            for (var i = 0; i + 1 < pts.length; i++) line(pts[i][0] + dx, pts[i][1] + dy, pts[i + 1][0] + dx, pts[i + 1][1] + dy, e.layer);
          } else if (e instanceof Circle) {
            g(0, "CIRCLE"); g(8, e.layer); g(10, F(e.cx + dx, 3)); g(20, F(e.cy + dy, 3));
            g(30, 0); g(40, F(e.r, 3));
          } else if (e instanceof Arc) {
            g(0, "ARC"); g(8, e.layer); g(10, F(e.cx + dx, 3)); g(20, F(e.cy + dy, 3));
            g(30, 0); g(40, F(e.r, 3)); g(50, F(e.a1, 3)); g(51, F(e.a2, 3));
          } else if (e instanceof Text) text(e.x + dx, e.y + dy, e.text, e.h * s, e.layer, e.anchor, e.rot);
          else if (e instanceof Dim) {
            _dim_prims(e.x1 / s, e.y1 / s, e.x2 / s, e.y2 / s, e.offset,
              e.text || _dim_text(Math.hypot(e.x2 - e.x1, e.y2 - e.y1))).forEach(function (pr) {
              var d = pr[1];
              if (pr[0] === "line") line(d[0] * s + dx, d[1] * s + dy, d[2] * s + dx, d[3] * s + dy, pr[2]);
              else text(d[0] * s + dx, d[1] * s + dy, d[2], d[3] * s, pr[2], d[4], d[5]);
            });
          }
        });
        x_cursor += (x1 - x0) + 60 * s;
      });
      // title block & notes as text to the right of the sheet's views
      var th = 3.5 * Math.max(1.0, row_h / 300);
      var ty = y_cursor - th * 2;
      [["PROJECT", sh.project || "-"], ["DRAWING TITLE", sh.title], ["DRAWING NO", sh.number],
        ["DATE", today()], ["DRAWN BY", sh.drawn_by],
        ["CHECKED BY", "-"], ["APPROVED BY", "-"], ["SCALE", "AS NOTED (MODEL 1:1, MM)"]].forEach(function (lv) {
        text(x_cursor, ty, lv[0] + ": " + pystr(lv[1]), th, "TITLE");
        ty -= th * 1.8;
      });
      if (sh.notes.length) {
        ty -= th;
        text(x_cursor, ty, "NOTES", th * 1.3, "TITLE");
        ty -= th * 2;
        sh.notes.forEach(function (note, i) {
          text(x_cursor, ty, (i + 1) + ". " + note, th, "TEXT");
          ty -= th * 1.8;
        });
      }
      text(x_cursor, ty - th, "ALL DIMENSIONS IN MM UNLESS NOTED OTHERWISE.", th, "TEXT");
      y_cursor -= row_h + 200;
    });
    var hd = ["0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009", "9", "$INSBASE", "10", "0.0", "20",
      "0.0", "30", "0.0", "0", "ENDSEC"];
    var tables = ["0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LTYPE", "70", "3",
      "0", "LTYPE", "2", "CONTINUOUS", "70", "0", "3", "Solid line", "72", "65", "73", "0", "40", "0.0",
      "0", "LTYPE", "2", "DASHED", "70", "0", "3", "Dashed", "72", "65", "73", "2", "40", "15.0",
      "49", "10.0", "49", "-5.0",
      "0", "LTYPE", "2", "CENTER", "70", "0", "3", "Center", "72", "65", "73", "4", "40", "40.0",
      "49", "25.0", "49", "-5.0", "49", "5.0", "49", "-5.0",
      "0", "ENDTAB", "0", "TABLE", "2", "LAYER", "70", String(Object.keys(LAYERS).length)];
    Object.keys(LAYERS).forEach(function (name) {
      var col = LAYERS[name][0], dash = LAYERS[name][3];
      var lt = !dash ? "CONTINUOUS" : (dash.length > 2 ? "CENTER" : "DASHED");
      tables.push("0", "LAYER", "2", name, "70", "0", "62", String(col), "6", lt);
    });
    tables.push("0", "ENDTAB", "0", "ENDSEC");
    var body = ["0", "SECTION", "2", "ENTITIES"].concat(ents.join("\n").split("\n"), ["0", "ENDSEC", "0", "EOF"]);
    return hd.concat(tables, body).join("\n") + "\n";
  }
  D.to_dxf = to_dxf;

  /* =========================================================================== PDF (vector, Helvetica) */
  var _PDF_REPL = [["φ", "dia "], ["₹", "Rs."], ["≥", ">="], ["≤", "<="], ["√", "sqrt"], ["Σ", "Sum"], ["→", "->"], ["γ", "g"],
    ["τ", "tau"], ["σ", "s"], ["λ", "lambda"], ["α", "a"], ["β", "b"], ["θ", "theta"], ["δ", "d"], ["π", "pi"], ["ε", "e"]];
  D._PDF_REPL = _PDF_REPL;
  /* cp1252 code page: U+0080…U+009F are not encodable; these map into 0x80–0x9F */
  var CP1252 = { 0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88,
    0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93,
    0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B,
    0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F };
  function cp1252(cp) {
    if (cp < 0x80 || (cp >= 0xA0 && cp <= 0xFF)) return cp;
    return Object.prototype.hasOwnProperty.call(CP1252, cp) ? CP1252[cp] : 0x3F;
  }
  function _pdf_str(s) {
    _PDF_REPL.forEach(function (ab) { s = s.split(ab[0]).join(ab[1]); });
    var out = [];
    cps(s).forEach(function (chs) {
      var ch = cp1252(chs.codePointAt(0)), c = String.fromCharCode(ch);
      if (c === "(" || c === ")" || c === "\\") out.push("\\" + c);
      else if (ch < 32 || ch > 126) out.push("\\" + ("00" + ch.toString(8)).slice(-3));
      else out.push(c);
    });
    return out.join("");
  }
  D._pdf_str = _pdf_str;
  function _text_width(s, h) { return _text_w(s, h); }

  function bytesOf(str) {   // latin-1 string → bytes
    var b = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) b[i] = str.charCodeAt(i) & 0xFF;
    return b;
  }

  function to_pdf(sheets) {
    var pt = 72 / 25.4;
    var W = A3[0] * pt, H = A3[1] * pt;
    var pages = [];
    sheets.forEach(function (sh) {
      var c = ["1 J 1 j"];
      _paper_prims(sh).forEach(function (pr) {
        var kind = pr[0], d = pr[1], layer = pr[2];
        var L = layerOf(layer), col = L[1], lw = L[2], dash = L[3], f;
        c.push(F(col[0], 3) + " " + F(col[1], 3) + " " + F(col[2], 3) + " RG " + F(lw * pt, 2) + " w");
        c.push(dash ? "[" + dash.map(function (x) { return F(x * pt, 1); }).join(" ") + "] 0 d" : "[] 0 d");
        if (kind === "line") {
          c.push(F(d[0] * pt, 2) + " " + F(d[1] * pt, 2) + " m " + F(d[2] * pt, 2) + " " + F(d[3] * pt, 2) + " l S");
        } else if (kind === "pline") {
          var pts = d[0], closed = d[1], fill = d[2];
          if (!pts.length) return;
          var seg = [F(pts[0][0] * pt, 2) + " " + F(pts[0][1] * pt, 2) + " m"].concat(
            pts.slice(1).map(function (p) { return F(p[0] * pt, 2) + " " + F(p[1] * pt, 2) + " l"; }));
          if (fill) {
            f = FILLS[fill];
            c.push(F(f[0], 3) + " " + F(f[1], 3) + " " + F(f[2], 3) + " rg");
            c.push(seg.join(" ") + (closed ? " h B" : " S"));
          } else c.push(seg.join(" ") + (closed ? " h S" : " S"));
        } else if (kind === "circle") {
          var x = d[0] * pt, y = d[1] * pt, r = Math.max(d[2], 0.25) * pt, cf = d[3];
          var kk = 0.5523 * r;
          var path = F(x + r, 2) + " " + F(y, 2) + " m " + F(x + r, 2) + " " + F(y + kk, 2) + " " + F(x + kk, 2) + " " + F(y + r, 2) + " " + F(x, 2) + " " + F(y + r, 2) + " c " +
            F(x - kk, 2) + " " + F(y + r, 2) + " " + F(x - r, 2) + " " + F(y + kk, 2) + " " + F(x - r, 2) + " " + F(y, 2) + " c " +
            F(x - r, 2) + " " + F(y - kk, 2) + " " + F(x - kk, 2) + " " + F(y - r, 2) + " " + F(x, 2) + " " + F(y - r, 2) + " c " +
            F(x + kk, 2) + " " + F(y - r, 2) + " " + F(x + r, 2) + " " + F(y - kk, 2) + " " + F(x + r, 2) + " " + F(y, 2) + " c";
          if (cf) { f = FILLS[cf]; c.push(F(f[0], 3) + " " + F(f[1], 3) + " " + F(f[2], 3) + " rg " + path + " B"); }
          else c.push(path + " S");
        } else if (kind === "arc") {
          var ax = d[0], ay = d[1], ar = d[2], a1 = d[3], a2 = d[4];
          var n = 16, span = pymod(a2 - a1, 360) || 360, ap = [];
          for (var i = 0; i <= n; i++) ap.push([ax + ar * Math.cos(radians(a1 + span * i / n)), ay + ar * Math.sin(radians(a1 + span * i / n))]);
          c.push(F(ap[0][0] * pt, 2) + " " + F(ap[0][1] * pt, 2) + " m " +
            ap.slice(1).map(function (p) { return F(p[0] * pt, 2) + " " + F(p[1] * pt, 2) + " l"; }).join(" ") + " S");
        } else if (kind === "text") {
          var tx0 = d[0], ty0 = d[1], s = d[2], h = d[3], anchor = d[4], rot = d[5];
          var size = h * pt * 1.40;           // cap height ≈ 0.72 × font size → h is the cap height
          var wdt = _text_width(s, h);
          var dx = anchor === "middle" ? -wdt / 2 : anchor === "end" ? -wdt : 0;
          var a = radians(rot), ca = Math.cos(a), sa = Math.sin(a);
          var tx = (tx0 + dx * ca) * pt, ty = (ty0 + dx * sa) * pt;
          var fnt = layer === "TITLEB" ? "F2" : "F1";
          c.push(F(col[0], 3) + " " + F(col[1], 3) + " " + F(col[2], 3) + " rg BT /" + fnt + " " + F(size, 2) + " Tf " +
            F(ca, 4) + " " + F(sa, 4) + " " + F(-sa, 4) + " " + F(ca, 4) + " " + F(tx, 2) + " " + F(ty, 2) + " Tm (" + _pdf_str(s) + ") Tj ET");
        }
      });
      pages.push(c.join("\n"));
    });
    var objs = [];
    objs.push("<< /Type /Catalog /Pages 2 0 R >>");
    var kids = pages.map(function (_, i) { return (4 + 2 * i) + " 0 R"; }).join(" ");
    objs.push("<< /Type /Pages /Kids [" + kids + "] /Count " + pages.length + " >>");
    objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    pages.forEach(function (content, i) {
      objs.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + F(W, 2) + " " + F(H, 2) + "] " +
        "/Resources << /Font << /F1 3 0 R /F2 " + (3 + 2 * pages.length + 1) + " 0 R >> >> " +
        "/Contents " + (5 + 2 * i) + " 0 R >>");
      objs.push("<< /Length " + content.length + " >>\nstream\n" + content + "\nendstream");
    });
    objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    var out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", offsets = [];
    objs.forEach(function (o, i) {
      offsets.push(out.length);
      out += (i + 1) + " 0 obj\n" + o + "\nendobj\n";
    });
    var xref = out.length;
    out += "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
    offsets.forEach(function (off) { out += ("000000000" + off).slice(-10) + " 00000 n \n"; });
    out += "trailer\n<< /Size " + (objs.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
    return bytesOf(out);
  }
  D.to_pdf = to_pdf;

  /* =========================================================================== helpers for modules */
  function rebar_label(n, dia, spacing, mark) {
    var base = spacing == null ? pystr(n) + "-" + G(dia) + "Ø" : G(dia) + "Ø @ " + G(spacing) + " c/c";
    return ((mark || "") + " " + base).replace(/^\s+|\s+$/g, "");
  }
  D.rebar_label = rebar_label;

  /* iteration order of the Python set {a, b} of non-negative ints (8-slot table, CPython probing) */
  function _set2_order(a, b) {
    if (a === b) return [a];
    var ia = a & 7, ib = b & 7, perturb = b;
    while (ib === ia) { perturb = Math.floor(perturb / 32); ib = (ib * 5 + 1 + perturb) & 7; }
    return ia < ib ? [a, b] : [b, a];
  }
  D._set2_order = _set2_order;

  /* Bending moment / shear force style diagram (values scaled to height_mm). */
  function diagram_view(title, xs, ys, length_mm, height_mm, unit, labels) {
    if (labels && typeof labels === "object") labels = labels.labels;
    if (labels === undefined) labels = true;
    var v = new View(title);
    v.line(0, 0, length_mm, 0, "OUTLINE");
    var m = Math.max(amax(ys.map(Math.abs)), 1e-9);
    var xl = xs[xs.length - 1], n = Math.min(xs.length, ys.length), pts = [];
    for (var i = 0; i < n; i++) pts.push([xl ? xs[i] / xl * length_mm : 0, ys[i] / m * height_mm]);
    var pos = [[0, 0]].concat(pts, [[length_mm, 0]]);
    v.poly(pos, true, "DIAGRAM", "diagram+");
    if (labels) {
      var imax = 0, imin = 0;
      for (var k = 1; k < ys.length; k++) { if (ys[k] > ys[imax]) imax = k; if (ys[k] < ys[imin]) imin = k; }
      var idx = _set2_order(imax, imin);
      idx.forEach(function (j) {
        if (Math.abs(ys[j]) > 1e-6) {
          v.text(pts[j][0], pts[j][1] + (ys[j] >= 0 ? 3 : -6) * length_mm / 200, F(ys[j], 1) + " " + unit,
            2.4, "DIAGRAM", "middle");
        }
      });
    }
    return v;
  }
  D.diagram_view = diagram_view;

  /* A schedule drawn as a table (paper-mm units; place on a sheet with scale 1:1). */
  function table_view(title, header, rows, col_w, row_h, text_h) {
    var p = opt(arguments, 4), a = p.a, o = p.o;
    row_h = pick(a, o, 4, "row_h", 7.0); text_h = pick(a, o, 5, "text_h", 2.2);
    var cw_f = o.char_w || 0.70;                  // character width / text height used to clip cell text
    var v = new View(title, null, 1);
    var W = 0; col_w.forEach(function (w) { W += w; });
    var n = rows.length + 1;
    var H = n * row_h;
    v.rect(0, 0, W, H, "OUTLINE");
    for (var k = 1; k < n; k++) v.line(0, H - k * row_h, W, H - k * row_h, k === 1 ? "OUTLINE" : "CONCRETE");
    var x = 0;
    col_w.slice(0, -1).forEach(function (w) { x += w; v.line(x, 0, x, H, "CONCRETE"); });
    [header].concat(rows).forEach(function (cells, r) {
      x = 0;
      var y = H - (r + 1) * row_h + (row_h - text_h) / 2;
      var nc = Math.min(col_w.length, cells.length);
      for (var i = 0; i < nc; i++) {
        var w = col_w[i];
        v.text(x + 1.5, y, head(pystr(cells[i]), Math.trunc((w - 2) / (cw_f * text_h))), text_h, r === 0 ? "TITLEB" : "TEXT");
        x += w;
      }
    });
    return v;
  }
  D.table_view = table_view;
})();
