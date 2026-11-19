/* Design Studio — review (port of civilest/design/review.py)
   Phase 5 – Drawing review.

   1. DXF (AutoCAD / any CAD, ASCII DXF R12–2018): parsed without third-party libraries → entity
      statistics, layers, all text, dimensions, rebar / section call-outs, and a rendered preview.
   2. PDF: text extracted from content streams (works for CAD-exported vector PDFs with standard fonts).
   3. Rule-based review: a checklist per drawing type (RCC, steel, road / culvert, general) + IS 456 /
      IS 800 detailing rules applied to every call-out found + comparison with a design produced in
      the Design Studio ("what is missing / what differs").
   4. Optional AI review of PDF / image drawings through the Anthropic Messages API using the
      user's own API key (never stored).

   JS API (DS.review, same names as Python)
       parse_dxf(text) → DXFDoc {version, units, layers, counts, entities, texts, dims, blocks, extents, warnings}
           entities: {type, layer, g}  (g: {<group code>: [values…], type, pts?})
           texts: [text, layer, x, y, height]   dims: [measurement | null, text override, layer]
       clean_mtext(s), _pairs(text) → [[code, value]…], _f(g, code, idx = 0), _fl(g, code)
       dxf_preview(doc, title = "Uploaded drawing", max_entities = 20000) → DS.drawing.Sheet
       pdf_text(u8, inflate, max_streams = 400) → string      inflate(u8) → Uint8Array, SYNC, throws on bad data
                                                               (Node: require("zlib").inflateSync); optional
       pdf_text_async(u8, max_streams = 400) → Promise<string> uses DecompressionStream("deflate") when available
       extract(texts) → {spaced, counted, concrete, steel, sections, covers, scales, bolts, has}
       review(texts, drawing_type, doc = null, design = null) → {findings: [Finding], extract, compare, score}
       Finding {severity, item, detail, suggestion}, CHECKLIST, DRAWING_TYPES, INSUNITS, STD_DIAS
       _design_callouts(design), _design_sections(design)
       AI_MODELS, ai_prompt(drawing_type, context = ""), dxf_summary_text(doc, limit = 400)
       ai_review(api_key, model, data_u8, mime, drawing_type, context = "", extra_text = "", timeout = 180)
           → Promise<string markdown>; rejects with Error("API error <status>: …")
   Python regular expressions are translated to Unicode-aware JS (\w, \b, \d, \s, ".", "$" keep Python
   semantics), and int() / float() / str.strip() / splitlines() follow Python rules.
*/
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var M = DS.review = {};
  function C() { return DS.core; }
  function D() { return DS.drawing; }

  /* ------------------------------------------------------------------ Python compatibility helpers */
  var W_CLS = "\\p{L}\\p{N}_";
  var WS_CLS = "\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
  var WB = "(?:(?<=[" + W_CLS + "])(?![" + W_CLS + "])|(?<![" + W_CLS + "])(?=[" + W_CLS + "]))";
  /* Translate a Python `re` (str) pattern into a JS RegExp with identical semantics for the constructs used here.
     flags: "i" (re.I), "s" (re.S). Always global + unicode. */
  function pyre(src, flags) {
    flags = flags || "";
    var out = "", inCls = false, i = 0, dotall = flags.indexOf("s") >= 0;
    while (i < src.length) {
      var c = src[i];
      if (c === "\\") {
        var n = src[i + 1];
        if (n === "w") out += inCls ? W_CLS : "[" + W_CLS + "]";
        else if (n === "d") out += "\\p{Nd}";
        else if (n === "s") out += inCls ? WS_CLS : "[" + WS_CLS + "]";
        else if (n === "b" && !inCls) out += WB;
        else out += c + n;
        i += 2; continue;
      }
      if (inCls) { if (c === "]") inCls = false; out += c; i++; continue; }
      if (c === "[") {
        inCls = true; out += c; i++;
        if (src[i] === "^") { out += "^"; i++; }
        if (src[i] === "]") { out += "\\]"; i++; }
        continue;
      }
      if (c === ".") out += dotall ? "[\\s\\S]" : "[^\\n]";
      else if (c === "$") out += "(?=\\n?(?![\\s\\S]))";
      else out += c;
      i++;
    }
    return new RegExp(out, "gu" + (flags.indexOf("i") >= 0 ? "i" : ""));
  }
  M._pyre = pyre;
  function finditer(re, s) { re.lastIndex = 0; return Array.from(s.matchAll(re)); }
  function search(re, s) { re.lastIndex = 0; var r = re.test(s); re.lastIndex = 0; return r; }
  function fullmatch(re, s) {        // whole-string match
    var r = new RegExp("^(?:" + re.source + ")$", re.flags.replace("g", ""));
    return r.test(s);
  }
  function sub(re, s, rep) { re.lastIndex = 0; return s.replace(re, typeof rep === "function" ? rep : function () { return rep; }); }
  function replaceAll(s, a, b) { return s.split(a).join(b); }

  var RE_PYWS_L = new RegExp("^[" + WS_CLS + "]+", "u"), RE_PYWS_R = new RegExp("[" + WS_CLS + "]+$", "u");
  function pystrip(s) { return s.replace(RE_PYWS_L, "").replace(RE_PYWS_R, ""); }
  function cps(s) { return Array.from(s); }
  function head(s, n) { return cps(s).slice(0, n).join(""); }          // s[:n]
  function pyupper(s) { return String(s).toUpperCase(); }
  function pycmp(a, b) {          // Python ordering of str (code points) / numbers / arrays
    if (typeof a === "number" && typeof b === "number") return a < b ? -1 : a > b ? 1 : 0;
    if (Array.isArray(a)) { for (var i = 0; i < Math.min(a.length, b.length); i++) { var r = pycmp(a[i], b[i]); if (r) return r; } return a.length - b.length; }
    var x = cps(a), y = cps(b);
    for (var j = 0; j < Math.min(x.length, y.length); j++) { var p = x[j].codePointAt(0), q = y[j].codePointAt(0); if (p !== q) return p - q; }
    return x.length - y.length;
  }
  function sorted_set(arr) {
    var seen = new Set(), out = [];
    arr.forEach(function (v) { if (!seen.has(v)) { seen.add(v); out.push(v); } });
    return out.sort(pycmp);
  }
  function pymin(a) { var m = a[0]; for (var i = 1; i < a.length; i++) if (a[i] < m) m = a[i]; return m; }
  function pymax(a) { var m = a[0]; for (var i = 1; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }

  /* Unicode decimal digits → ASCII (Python int() / float() accept any Nd digit) */
  var RE_ND = /\p{Nd}/u, RE_ND_G = /\p{Nd}/gu;
  function ndval(ch) {
    var cp = ch.codePointAt(0);
    if (cp >= 48 && cp <= 57) return cp - 48;
    var st = cp;
    while (st > 0 && RE_ND.test(String.fromCodePoint(st - 1))) st--;
    return (cp - st) % 10;
  }
  function asciidigits(s) { return s.replace(RE_ND_G, function (ch) { return String(ndval(ch)); }); }
  function ValueError(msg) { var e = new Error(msg); e.name = "ValueError"; return e; }
  /* int(str) */
  function pyint(s) {
    var t = asciidigits(pystrip(String(s)));
    if (!/^[+-]?\d+(?:_\d+)*$/.test(t)) throw ValueError("invalid literal for int() with base 10: " + JSON.stringify(s));
    return Number(t.replace(/_/g, ""));
  }
  /* float(str) – returns null where Python raises ValueError */
  var DG = "\\d(?:_?\\d)*";
  var RE_FLOAT = new RegExp("^[+-]?(?:(?:" + DG + "(?:\\.(?:" + DG + ")?)?|\\." + DG + ")(?:[eE][+-]?" + DG + ")?|inf(?:inity)?|nan)$", "i");
  function pyfloat(s) {
    var t = asciidigits(pystrip(String(s)));
    if (!RE_FLOAT.test(t)) return null;
    var low = t.toLowerCase(), neg = low[0] === "-";
    if (/inf/.test(low)) return neg ? -Infinity : Infinity;
    if (/nan/.test(low)) return NaN;
    return Number(t.replace(/_/g, ""));
  }
  M._pyint = pyint; M._pyfloat = pyfloat;
  /* str.splitlines() */
  function splitlines(t) {
    if (!t.length) return [];
    var a = t.split(/\r\n|[\n\r\x0b\x0c\x1c\x1d\x1e\x85\u2028\u2029]/);
    if (a[a.length - 1] === "") a.pop();
    return a;
  }
  M._splitlines = splitlines;
  /* repr() of a Python float */
  function frepr(v) {
    if (v == null) return "None";
    if (Number.isInteger(v) && Math.abs(v) < 1e16) return v.toFixed(1);
    return C().pystr(v);
  }
  function pystr(v) { return C().pystr(v); }

  var STD_DIAS = [6, 8, 10, 12, 16, 20, 25, 28, 32, 36, 40];
  M.STD_DIAS = STD_DIAS;

  /* =========================================================================== DXF parsing */
  function DXFDoc() {
    this.version = "";
    this.units = null;
    this.layers = [];
    this.counts = {};
    this.entities = [];       // {type, layer, g}
    this.texts = [];          // [text, layer, x, y, height]
    this.dims = [];           // [measurement or null, text override, layer]
    this.blocks = [];
    this.extents = null;
    this.warnings = [];
  }
  M.DXFDoc = DXFDoc;

  var INSUNITS = { 0: "unitless", 1: "inches", 2: "feet", 4: "millimetres", 5: "centimetres", 6: "metres" };
  M.INSUNITS = INSUNITS;
  function insunits(u) { return u != null && Object.prototype.hasOwnProperty.call(INSUNITS, u) ? INSUNITS[u] : u; }

  function _pairs(text) {
    var lines = splitlines(text), out = [];
    for (var i = 0; i < lines.length - 1; i += 2) {
      var code;
      try { code = pyint(pystrip(lines[i])); } catch (e) { continue; }
      out.push([code, lines[i + 1].replace(/\r+$/, "")]);
    }
    return out;
  }
  M._pairs = _pairs;

  var RE_M1 = pyre("\\\\[Pp]"), RE_M2 = pyre("\\\\[A-Za-z][^;\\\\{}]*;"), RE_M3 = pyre("\\\\[LlOoKk]");
  function clean_mtext(s) {
    s = sub(RE_M1, s, "\n");
    s = sub(RE_M2, s, "");              // \fArial|b0;  \H2.5;  \C1; …
    s = sub(RE_M3, s, "");
    s = replaceAll(replaceAll(s, "{", ""), "}", "");
    s = replaceAll(replaceAll(replaceAll(replaceAll(s, "%%c", "Ø"), "%%C", "Ø"), "%%d", "°"), "%%p", "±");
    s = replaceAll(s, "\\~", " ");
    return pystrip(s);
  }
  M.clean_mtext = clean_mtext;

  function _f(g, code, idx) {
    idx = idx || 0;
    var lst = Object.prototype.hasOwnProperty.call(g, code) ? g[code] : [null];
    var v = lst[idx];
    if (v == null) return null;
    return pyfloat(v);
  }
  function _fl(g, code) {
    var out = [];
    (Object.prototype.hasOwnProperty.call(g, code) ? g[code] : []).forEach(function (v) { var x = pyfloat(v); if (x !== null) out.push(x); });
    return out;
  }
  M._f = _f; M._fl = _fl;
  function get(g, k) { return Object.prototype.hasOwnProperty.call(g, k) ? g[k] : undefined; }
  function truthyList(l) { return l != null && l.length > 0; }

  function parse_dxf(text) {
    if (text.startsWith("AutoCAD Binary DXF")) {
      var bd = new DXFDoc();
      bd.warnings.push("Binary DXF is not supported – save as ASCII DXF (DXFOUT, 'ASCII').");
      return bd;
    }
    var doc = new DXFDoc();
    var section = null, cur = null, last_header_var = null;

    function flush() {
      if (cur === null) return;
      var t = cur.type;
      if (["SECTION", "ENDSEC", "EOF", "TABLE", "ENDTAB", "SEQEND"].indexOf(t) >= 0) { cur = null; return; }
      if (t === "VERTEX") {                                   // old-style POLYLINE vertices
        if (section === "ENTITIES" && doc.entities.length && doc.entities[doc.entities.length - 1].type === "POLYLINE") {
          var g = doc.entities[doc.entities.length - 1].g;
          if (!Object.prototype.hasOwnProperty.call(g, "pts")) g.pts = [];
          g.pts.push([_f(cur, 10), _f(cur, 20)]);
        }
        cur = null; return;
      }
      if (section === "TABLES" && t === "LAYER" && truthyList(get(cur, 2))) doc.layers.push(cur[2][0]);
      else if (section === "BLOCKS" && t === "BLOCK" && truthyList(get(cur, 2))) doc.blocks.push(cur[2][0]);
      else if ((section === "ENTITIES" || section === "BLOCKS") && t !== "BLOCK" && t !== "ENDBLK") {
        var layer = (truthyList(get(cur, 8)) ? cur[8] : ["0"])[0];
        if (section === "ENTITIES") {
          doc.counts[t] = (Object.prototype.hasOwnProperty.call(doc.counts, t) ? doc.counts[t] : 0) + 1;
          doc.entities.push({ type: t, layer: layer, g: cur });
        }
        if (t === "TEXT" || t === "MTEXT" || t === "ATTRIB" || t === "ATTDEF") {
          var raw = (truthyList(get(cur, 3)) ? cur[3] : []).join("") + (truthyList(get(cur, 1)) ? cur[1] : [""])[0];
          var txt = clean_mtext(raw);
          if (txt) doc.texts.push([txt, layer, _f(cur, 10), _f(cur, 20), _f(cur, 40)]);
        } else if (t === "DIMENSION" && section === "ENTITIES") {
          var meas = _f(cur, 42);
          var over = clean_mtext((truthyList(get(cur, 1)) ? cur[1] : [""])[0]);
          doc.dims.push([meas !== null && meas !== 0 ? meas : null, over, layer]);
        }
      }
      cur = null;
    }

    var pairs = _pairs(text);
    for (var i = 0; i < pairs.length; i++) {
      var code = pairs[i][0], val = pairs[i][1];
      if (code === 0) {
        flush();
        if (val === "SECTION") { section = "_pending"; continue; }
        if (val === "ENDSEC") { section = null; continue; }
        cur = { type: val };
        continue;
      }
      if (section === "_pending" && code === 2) { section = pystrip(val); continue; }
      if (section === "HEADER") {
        if (code === 9) last_header_var = pystrip(val);
        else if (last_header_var === "$ACADVER" && code === 1) doc.version = pystrip(val);
        else if (last_header_var === "$INSUNITS" && code === 70) doc.units = pyint(val);
        continue;
      }
      if (cur !== null) {
        if (!Object.prototype.hasOwnProperty.call(cur, code)) cur[code] = [];
        cur[code].push(val);
      }
    }
    flush();
    var xs = [], ys = [];
    doc.entities.forEach(function (e) {
      [[10, 20], [11, 21]].forEach(function (cc) {
        var A = get(e.g, cc[0]) || [], B = get(e.g, cc[1]) || [];
        for (var k = 0; k < Math.min(A.length, B.length); k++) {
          var a = pyfloat(A[k]); if (a === null) continue;
          xs.push(a);
          var b = pyfloat(B[k]); if (b === null) continue;
          ys.push(b);
        }
      });
    });
    if (xs.length) doc.extents = [pymin(xs), pymin(ys), pymax(xs), pymax(ys)];
    return doc;
  }
  M.parse_dxf = parse_dxf;

  function dxf_preview(doc, title, max_entities) {
    title = title == null ? "Uploaded drawing" : title;
    max_entities = max_entities == null ? 20000 : max_entities;
    var Dr = D();
    var v = new Dr.View(title);
    var n = 0;
    function anyNull(a) { return a.some(function (x) { return x === null; }); }
    function closedFlag(g) { var x = pyint((truthyList(get(g, 70)) ? g[70] : ["0"])[0]); return x % 2 !== 0; }
    for (var i = 0; i < doc.entities.length; i++) {
      if (n > max_entities) break;
      var e = doc.entities[i], g = e.g, t = e.type;
      var layer = "OUTLINE";
      if (t === "LINE") {
        var L = [_f(g, 10), _f(g, 20), _f(g, 11), _f(g, 21)];
        if (!anyNull(L)) { v.line(L[0], L[1], L[2], L[3], layer); n++; }
      } else if (t === "LWPOLYLINE") {
        var xs = _fl(g, 10), ys = _fl(g, 20), pts = [];
        for (var k = 0; k < Math.min(xs.length, ys.length); k++) pts.push([xs[k], ys[k]]);
        if (pts.length >= 2) { v.poly(pts, closedFlag(g), layer); n++; }
      } else if (t === "POLYLINE") {
        var pp = (get(g, "pts") || []).filter(function (p) { return !anyNull(p); });
        if (pp.length >= 2) { v.poly(pp, closedFlag(g), layer); n++; }
      } else if (t === "CIRCLE") {
        var c = [_f(g, 10), _f(g, 20), _f(g, 40)];
        if (!anyNull(c)) { v.circle(c[0], c[1], c[2], layer); n++; }
      } else if (t === "ARC") {
        var a = [_f(g, 10), _f(g, 20), _f(g, 40), _f(g, 50), _f(g, 51)];
        if (!anyNull(a)) { v.entities.push(new Dr.Arc(a[0], a[1], a[2], a[3], a[4], layer)); n++; }
      }
    }
    if (doc.extents) {
      doc.texts.slice(0, 600).forEach(function (tx) {
        var x = tx[2], y = tx[3];
        if (x !== null && y !== null) v.text(x, y, head(tx[0].split("\n")[0], 60), 2.0, "TEXT");
      });
    }
    return new Dr.Sheet(title, "REVIEW", [v], [], "", "Uploaded drawing (preview)");
  }
  M.dxf_preview = dxf_preview;

  /* =========================================================================== PDF text */
  /* PDF byte regexes run on a "binary string" (one char per byte); Python bytes \s = [ \t\n\r\f\v] */
  var BWS = "[ \\t\\n\\r\\f\\v]";
  var RE_STREAM = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  var RE_TJ = new RegExp("\\((?:\\\\[\\s\\S]|[^\\\\)])*\\)" + BWS + "*Tj|\\[(?:[\\s\\S]*?)\\]" + BWS + "*TJ", "g");
  var RE_PART = /\(((?:\\[^\n]|[^\\)])*)\)/g;
  var RE_ESC = /\\([nrtbf()\\])/g, RE_OCT = /\\(\d{1,3})/g;
  var ESC = { n: "\n", r: "", t: " ", b: "", f: "", "(": "(", ")": ")", "\\": "\\" };
  var CP1252 = { 0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021,
    0x88: 0x02C6, 0x89: 0x2030, 0x8A: 0x0160, 0x8B: 0x2039, 0x8C: 0x0152, 0x8E: 0x017D, 0x91: 0x2018, 0x92: 0x2019,
    0x93: 0x201C, 0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02DC, 0x99: 0x2122, 0x9A: 0x0161,
    0x9B: 0x203A, 0x9C: 0x0153, 0x9E: 0x017E, 0x9F: 0x0178 };
  function cp1252(bs) {        // bytes.decode("cp1252", "ignore")
    var o = "";
    for (var i = 0; i < bs.length; i++) {
      var b = bs.charCodeAt(i);
      if (b < 0x80 || b >= 0xA0) o += String.fromCharCode(b);
      else if (CP1252[b]) o += String.fromCharCode(CP1252[b]);
    }
    return o;
  }
  function u8ToBin(u8) {
    var s = "", CH = 0x8000;
    for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, Array.prototype.slice.call(u8.subarray(i, i + CH)));
    return s;
  }
  function binToU8(s) { var u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; }
  function toU8(data) {
    if (data == null) return new Uint8Array(0);
    if (typeof data === "string") return binToU8(data);
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    return Uint8Array.from(data);
  }
  M._u8ToBin = u8ToBin; M._binToU8 = binToU8;

  function streams(bin, max_streams) {
    var out = [], k = 0, m;
    RE_STREAM.lastIndex = 0;
    while ((m = RE_STREAM.exec(bin)) !== null) {
      if (m[0].length === 0) RE_STREAM.lastIndex++;
      if (k > max_streams) break;
      out.push(m[1]); k++;
    }
    return out;
  }
  function texts_of(raw, out) {
    RE_TJ.lastIndex = 0;
    var t;
    while ((t = RE_TJ.exec(raw)) !== null) {
      var seg = t[0], parts = [], p;
      RE_PART.lastIndex = 0;
      while ((p = RE_PART.exec(seg)) !== null) parts.push(p[1]);
      var s = parts.join("");
      s = s.replace(RE_ESC, function (_, c) { return ESC[c]; });
      s = s.replace(RE_OCT, function (_, d) {
        if (/[89]/.test(d)) throw ValueError("invalid literal for int() with base 8: '" + d + "'");
        return String.fromCharCode(parseInt(d, 8) & 255);
      });
      out.push(cp1252(s));
    }
  }
  function join_out(out) { return out.filter(function (x) { return pystrip(x).length > 0; }).join("\n"); }

  /* Best-effort text from PDF content streams (FlateDecode or uncompressed).
     inflate(u8) → Uint8Array must be synchronous (e.g. require("zlib").inflateSync); if it throws (or is absent)
     the raw stream is used, like Python's `except zlib.error`. */
  function pdf_text(data, inflate, max_streams) {
    if (typeof inflate === "number" && max_streams == null) { max_streams = inflate; inflate = null; }
    max_streams = max_streams == null ? 400 : max_streams;
    var bin = u8ToBin(toU8(data)), out = [];
    streams(bin, max_streams).forEach(function (raw) {
      if (typeof inflate === "function") {
        try { var r = inflate(binToU8(raw)); if (r != null) raw = u8ToBin(toU8(r)); } catch (e) { /* not zlib data */ }
      }
      texts_of(raw, out);
    });
    return join_out(out);
  }
  M.pdf_text = pdf_text;

  function inflate_stream(u8) {          // DecompressionStream("deflate") → Promise<Uint8Array>
    return new Promise(function (resolve, reject) {
      var ds;
      try { ds = new DecompressionStream("deflate"); } catch (e) { reject(e); return; }
      var w = ds.writable.getWriter(), rd = ds.readable.getReader(), chunks = [], len = 0;
      w.write(u8).catch(function () {});
      w.close().catch(function () {});
      (function pump() {
        rd.read().then(function (r) {
          if (r.done) {
            var o = new Uint8Array(len), off = 0;
            chunks.forEach(function (c) { o.set(c, off); off += c.length; });
            resolve(o); return;
          }
          chunks.push(r.value); len += r.value.length; pump();
        }, reject);
      })();
    });
  }
  M._inflate_stream = inflate_stream;
  /* zlib.decompress ignores data after the end of the zlib stream; DecompressionStream rejects it, so retry
     with trailing whitespace bytes removed (the usual cause: an extra EOL before "endstream"). */
  function inflate_async(u8) {
    return inflate_stream(u8).catch(function (err) {
      var n = u8.length, tries = 0;
      function again() {
        while (n > 0 && tries < 4 && [9, 10, 12, 13, 32, 0].indexOf(u8[n - 1]) >= 0) {
          n--; tries++;
          return inflate_stream(u8.subarray(0, n)).catch(again);
        }
        throw err;
      }
      return again();
    });
  }

  function pdf_text_async(data, max_streams) {
    max_streams = max_streams == null ? 400 : max_streams;
    var bin = u8ToBin(toU8(data));
    var raws = streams(bin, max_streams);
    var have = typeof DecompressionStream !== "undefined";
    return Promise.all(raws.map(function (raw) {
      if (!have) return Promise.resolve(raw);
      return inflate_async(binToU8(raw)).then(function (r) { return u8ToBin(r); }, function () { return raw; });
    })).then(function (decoded) {
      var out = [];
      decoded.forEach(function (raw) { texts_of(raw, out); });
      return join_out(out);
    });
  }
  M.pdf_text_async = pdf_text_async;

  /* =========================================================================== call-out extraction */
  var RE_SPACED = pyre(
    "(?<![\\w.])(?:T|Y|#|Ø|φ|DIA\\.?\\s*)?\\s*(\\d{1,2})\\s*(?:mm)?\\s*(?:Ø|φ|DIA\\.?|MM\\s*DIA|TOR|TMT|#|Y|T)?\\s*" +
    "(?:\\s*(?:TIES|STIRRUPS?|RINGS?|LINKS?|BARS?|LEGGED|L)\\b)?\\s*" +
    "(?:@|-|AT)\\s*(\\d{2,3})\\s*(?:mm)?\\s*(?:C/C|C\\.C\\.|CC|C-C|CTRS?)?", "i");
  var RE_COUNT = pyre("(?<![\\w.])(\\d{1,2})\\s*(?:NOS\\.?|NO\\.?|-|#|×|X)\\s*(?:OF\\s*)?(?:T|Y|#|Ø|φ)?\\s*(\\d{1,2})\\s*" +
    "(?:mm\\s*)?(?:Ø|φ|DIA|#|TOR|TMT|MM)", "i");
  var RE_GRADE_C = pyre("\\bM\\s?-?\\s?(10|15|20|25|30|35|40|45|50|55|60)\\b", "i");
  var RE_GRADE_S = pyre("\\bFe\\s?-?\\s?(250|415|500|550|600)\\s?(D|S)?\\b", "i");
  var RE_STEEL_SEC = pyre("\\b(ISMB|ISHB|ISMC|ISLB|ISWB|ISJB|ISA|ISMB\\s?)\\s?(\\d{2,3}(?:\\s?[xX×]\\s?\\d{2,3}){0,2})", "i");
  var RE_COVER = pyre("(?:CLEAR\\s+)?COVER\\s*(?:=|:|OF|TO)?\\s*(\\d{2,3})\\s*(?:MM)?", "i");
  var RE_SCALE = pyre("\\b1\\s?:\\s?(\\d{1,4})\\b");
  var RE_BOLT = pyre("\\bM\\s?(12|16|20|22|24|27|30|36)\\b(?=[^\\n]{0,30}\\b(?:BOLTS?|ANCHOR|GR\\.?|GRADE|HSFG|" +
    "\\d\\.\\d)\\b)|\\d\\s?-\\s?M\\s?(12|16|20|22|24|27|30|36)\\b", "i");
  M.RE_SPACED = RE_SPACED; M.RE_COUNT = RE_COUNT; M.RE_GRADE_C = RE_GRADE_C; M.RE_GRADE_S = RE_GRADE_S;
  M.RE_STEEL_SEC = RE_STEEL_SEC; M.RE_COVER = RE_COVER; M.RE_SCALE = RE_SCALE; M.RE_BOLT = RE_BOLT;

  var HAS = [
    ["title_block", "DRAWING\\s*(NO|NUMBER|TITLE)|DRG\\.?\\s*NO|TITLE\\s*:|SHEET\\s*(NO|:)"],
    ["checked_approved", "CHECKED|APPROVED|VERIFIED"],
    ["date", "DATE"],
    ["revision", "\\bREV(ISION)?\\b|\\bR\\d\\b"],
    ["notes", "\\bNOTES?\\b"],
    ["units_note", "ALL\\s+DIMENSIONS?.*(MM|METRES?|METERS?)|DIMENSIONS?\\s+IN\\s+(MM|M)"],
    ["north", "\\bNORTH\\b|^N$"],
    ["lap", "\\bLAP|\\bLd\\b|DEVELOPMENT\\s+LENGTH|ANCHORAGE"],
    ["bbs", "BAR\\s+BENDING|\\bBBS\\b|SCHEDULE\\s+OF\\s+(BARS|REINFORCEMENT)"],
    ["sbc", "\\bSBC\\b|BEARING\\s+CAPACITY|SAFE\\s+BEARING"],
    ["is_code", "IS\\s?:?\\s?(456|800|875|1893|13920|3370|2062)|IRC\\s?:?\\s?(6|112|37|78|SP)"],
    ["exposure", "EXPOSURE|MILD|MODERATE|SEVERE"],
    ["stirrup", "STIRRUP|RING|TIE|LINK"],
    ["section_mark", "SECTION\\s+[A-Z0-9]+\\s*-\\s*[A-Z0-9]+|SEC\\.?\\s+[A-Z]-[A-Z]"],
    ["level", "\\b(FFL|PL|GL|NGL|FGL|HFL|LWL|OFL|BED\\s+LEVEL|R\\.?L\\.?)\\b"],
    ["bolt_grade", "\\b(4\\.6|8\\.8|10\\.9)\\b|PROPERTY\\s+CLASS"],
    ["weld", "WELD|FILLET"],
    ["paint", "PAINT|PRIMER|ENAMEL|GALVANI"],
    ["loading", "CLASS\\s*A|70\\s?R|CLASS\\s*AA|IRC\\s*LOADING"],
    ["hfl", "\\bHFL\\b|HIGH\\s+FLOOD"],
    ["camber", "CAMBER|CROSS\\s*FALL|SUPER\\s*ELEVATION"],
    ["chainage", "\\bCH\\.?\\s*\\d|CHAINAGE"],
    ["expansion_joint", "EXPANSION\\s+JOINT|CONTRACTION\\s+JOINT|\\bEJ\\b"],
    ["weep", "WEEP\\s*HOLE"],
    ["anchor", "ANCHOR\\s*BOLT|FOUNDATION\\s+BOLT|HOLDING\\s+DOWN"],
    ["grid", "\\bGRID\\b|^[A-H]$"]
  ].map(function (kv) { return [kv[0], pyre(kv[1])]; });

  function extract(texts) {
    var blob = texts.join("\n");
    var up = pyupper(blob);
    var spaced = [], counted = [];
    texts.forEach(function (t) {
      finditer(RE_SPACED, t).forEach(function (m) {
        var d = pyint(m[1]), s = pyint(m[2]);
        if (6 <= d && d <= 40 && 50 <= s && s <= 450) {
          var pre = pyupper(cps(t.slice(0, m.index)).slice(-14).join(""));
          var dist = ["DIST", "TEMP", "HORIZ", "LONGIT"].some(function (w) { return pre.indexOf(w) >= 0; });
          spaced.push({ dia: d, spacing: s, text: head(pystrip(t), 80), dist: dist });
        }
      });
      finditer(RE_COUNT, t).forEach(function (m) {
        var n = pyint(m[1]), d = pyint(m[2]);
        if (1 <= n && n <= 60 && 6 <= d && d <= 40) counted.push({ n: n, dia: d, text: head(pystrip(t), 80) });
      });
    });
    var has = {};
    HAS.forEach(function (kv) { has[kv[0]] = search(kv[1], up); });
    return {
      spaced: spaced, counted: counted,
      concrete: sorted_set(finditer(RE_GRADE_C, blob).map(function (m) { return pyint(m[1]); })),
      steel: sorted_set(finditer(RE_GRADE_S, blob).map(function (m) { return m[1] + (m[2] || ""); })),
      sections: sorted_set(finditer(RE_STEEL_SEC, blob).map(function (m) {
        return pystrip(pystrip(pyupper(m[1])) + " " + replaceAll(m[2], " ", ""));
      })),
      covers: sorted_set(finditer(RE_COVER, blob).map(function (m) { return pyint(m[1]); })),
      scales: sorted_set(finditer(RE_SCALE, blob).map(function (m) { return pyint(m[1]); })),
      bolts: sorted_set(finditer(RE_BOLT, blob).map(function (m) { return pyint(m[1] || m[2]); })),
      has: has
    };
  }
  M.extract = extract;

  /* =========================================================================== rules */
  var CHECKLIST = {
    "General": [
      ["title_block", "Critical", "Title block (drawing title / number / sheet)",
        "Add a title block: project, drawing title, drawing number, sheet, scale, date."],
      ["checked_approved", "Important", "Drawn / checked / approved signatures",
        "Add drawn-by, checked-by and approved-by fields for accountability."],
      ["date", "Important", "Date of issue", "Add issue date."],
      ["revision", "Advisory", "Revision block", "Add a revision table (rev no., date, description)."],
      ["notes", "Important", "General notes", "Add general notes: materials, codes, units, tolerances."],
      ["units_note", "Important", "Units statement ('All dimensions in mm')", "State units of dimensions and levels."],
      ["level", "Advisory", "Levels (GL / FFL / PL / RL)", "Show reference levels on sections and elevations."],
      ["section_mark", "Advisory", "Section markers (Section A-A)", "Cut and label sections referenced from plans."]
    ],
    "RCC structural": [
      ["is_code", "Important", "Design code reference (IS 456 / IS 13920)", "Note: 'Designed as per IS 456:2000'."],
      ["exposure", "Advisory", "Exposure condition", "State exposure condition (IS 456 Table 3) for cover & grade."],
      ["lap", "Critical", "Lap / development length note", "Add lap length (e.g. 50Ø in tension) and Ld note."],
      ["bbs", "Important", "Bar bending schedule", "Provide BBS with bar marks, shape codes, cut lengths."],
      ["stirrup", "Important", "Stirrups / ties shown", "Show stirrup / tie size, legs and spacing."],
      ["sbc", "Important", "Safe bearing capacity / founding level", "State SBC and founding depth on foundation drawings."]
    ],
    "Steel structural": [
      ["is_code", "Important", "Design code reference (IS 800)", "Note: 'Designed as per IS 800:2007'."],
      ["bolt_grade", "Critical", "Bolt grade / property class", "Specify bolts (e.g. M20 gr 8.8) and hole sizes."],
      ["weld", "Important", "Weld sizes & type", "Specify fillet weld size / length or full-penetration butt welds."],
      ["paint", "Important", "Painting / corrosion protection", "Specify surface preparation, primer, finish coats."],
      ["anchor", "Critical", "Anchor (holding-down) bolts", "Detail anchor bolt size, grade, embedment, projection."],
      ["grid", "Advisory", "Column grid lines", "Show grid lines and labels on plans / elevations."]
    ],
    "Road / culvert / drain": [
      ["loading", "Critical", "Design live loading (IRC Class A / 70R)", "State IRC loading used for design."],
      ["is_code", "Important", "IRC code references", "Cite IRC 6 / IRC 112 / IRC SP-13 / IRC 37 as applicable."],
      ["hfl", "Important", "HFL / LWL / bed level (culverts)", "Show HFL, LWL and bed levels on culvert sections."],
      ["camber", "Advisory", "Camber / cross-fall (roads)", "Show cross-fall (2.5 % bituminous, 2 % CC)."],
      ["chainage", "Advisory", "Chainage", "Mark chainage of the structure / section."],
      ["expansion_joint", "Advisory", "Expansion / contraction joints", "Show joint locations & details."],
      ["weep", "Important", "Weep holes & filter media (walls / culverts)", "Provide weep holes with filter."],
      ["lap", "Important", "Lap / development length note", "Add lap length note."]
    ]
  };
  M.CHECKLIST = CHECKLIST;
  var DRAWING_TYPES = Object.keys(CHECKLIST).slice(1).concat(["General only"]);
  M.DRAWING_TYPES = DRAWING_TYPES;
  function inChecklist(k) { return Object.prototype.hasOwnProperty.call(CHECKLIST, k); }

  function Finding(severity, item, detail, suggestion) {
    this.severity = severity; this.item = item; this.detail = detail; this.suggestion = suggestion == null ? "" : suggestion;
  }
  M.Finding = Finding;

  var RE_FRAMED = pyre("\\bBEAM|\\bCOLUMN|\\bCOL\\b|LINTEL|\\bPLINTH");
  var RE_FOUNDED = pyre("FOOTING|FOUNDATION|\\bRAFT|\\bPILE");
  var RE_DIMTXT = pyre("[\\d.,]+");

  function review(texts, drawing_type, doc, design) {
    doc = doc === undefined ? null : doc; design = design === undefined ? null : design;
    var ex = extract(texts);
    var f = [];
    function add(sev, item, detail, sug) { f.push(new Finding(sev, item, detail, sug == null ? "" : sug)); }

    var groups = ["General"].concat(inChecklist(drawing_type) ? [drawing_type] : []);
    var up = pyupper(texts.join("\n"));
    var framed = ex.counted.length > 0 || search(RE_FRAMED, up);
    var founded = search(RE_FOUNDED, up);
    groups.forEach(function (g) {
      CHECKLIST[g].forEach(function (r) {
        var key = r[0], sev = r[1], item = r[2], sug = r[3];
        if (key === "stirrup" && !framed) return;
        if (key === "sbc" && !founded) return;
        if (!ex.has[key]) add(sev, item, "Not found in drawing text", sug);
      });
    });
    if (!ex.scales.length) add("Important", "Scale", "No scale (1:n) found", "State the scale of every view (or 'NTS').");
    // materials
    if (drawing_type === "RCC structural" || drawing_type === "Road / culvert / drain") {
      if (!ex.concrete.length) add("Critical", "Concrete grade", "No concrete grade (M20/M25 …) found", "Specify grade of concrete.");
      else if (pymin(ex.concrete) < 20 && drawing_type === "RCC structural")
        add("Important", "Concrete grade", "Grade M" + pystr(pymin(ex.concrete)) + " found – below M20 minimum for RCC",
          "IS 456 Table 5: RCC minimum M20 (mild exposure).");
      if (!ex.steel.length) add("Critical", "Reinforcement grade", "No Fe415 / Fe500 found", "Specify grade of reinforcement.");
      if (!ex.covers.length) add("Critical", "Clear cover", "No clear cover stated", "State nominal cover per IS 456 Table 16.");
      else if (pymin(ex.covers) < 20) add("Critical", "Clear cover", "Cover " + pystr(pymin(ex.covers)) + " mm < 20 mm", "IS 456 cl 26.4.2.");
    }
    if (drawing_type === "Steel structural") {
      if (!ex.sections.length) add("Important", "Member sizes", "No rolled section call-outs (ISMB / ISA …) found", "Label every member.");
      if (!ex.bolts.length) add("Important", "Bolt sizes", "No bolt sizes (M16 / M20 …) found", "Specify bolt diameters.");
    }
    // call-out rules (IS 456 cl 26)
    ex.spaced.forEach(function (b) {
      if (STD_DIAS.indexOf(b.dia) < 0) add("Important", "Non-standard bar diameter", pystr(b.dia) + " mm in '" + b.text + "'", "Use IS 1786 sizes.");
      var lim = b.dist ? 450 : 300;
      if (b.spacing > lim)
        add("Critical", "Bar spacing > " + lim + " mm", "'" + b.text + "'",
          "IS 456 cl 26.3.3: main bars ≤ 3d or 300 mm; distribution ≤ 5d or 450 mm.");
      if (b.spacing < 75 && b.dia >= 16) add("Important", "Very close bar spacing", "'" + b.text + "'", "Check concreting / aggregate clearance.");
    });
    ex.counted.forEach(function (b) {
      if (STD_DIAS.indexOf(b.dia) < 0) add("Important", "Non-standard bar diameter", pystr(b.dia) + " mm in '" + b.text + "'", "Use IS 1786 sizes.");
      if (pyupper(b.text).indexOf("COL") >= 0 && (b.n < 4 || b.dia < 12))
        add("Critical", "Column reinforcement", "'" + b.text + "'", "IS 456 cl 26.5.3.1: ≥ 4 bars of ≥ 12 mm.");
    });
    if (drawing_type === "RCC structural" && !(ex.spaced.length || ex.counted.length))
      add("Critical", "Reinforcement call-outs", "No bar call-outs recognised (e.g. 12Ø@150, 4-16Ø)",
        "Label every bar set with dia, number / spacing and bar mark.");
    // DXF hygiene
    if (doc !== null) {
      var dim_layer = doc.entities.filter(function (e) { return pyupper(e.layer).indexOf("DIM") >= 0; }).length;
      if ((doc.counts.DIMENSION || 0) === 0 && dim_layer === 0)
        add("Important", "Dimensions", "No DIMENSION entities or dimension layer found", "Dimension all members, openings and levels.");
      if (doc.entities.length && new Set(doc.entities.map(function (e) { return e.layer; })).size <= 1)
        add("Advisory", "Layers", "All entities on a single layer", "Use layers: outline, rebar, dims, text, hidden.");
      if (!(doc.units === null || doc.units === undefined || doc.units === 4 || doc.units === 6))
        add("Advisory", "Drawing units", "$INSUNITS = " + pystr(insunits(doc.units)), "Set drawing units to millimetres.");
      var over = doc.dims.filter(function (d) { return d[1] && d[1] !== "<>" && fullmatch(RE_DIMTXT, replaceAll(d[1], " ", "")); });
      over.slice(0, 20).forEach(function (d) {
        var meas = d[0], txt = d[1];
        var val = pyfloat(replaceAll(txt, ",", ""));
        if (val === null) return;                                  // ValueError → pass
        var measTruthy = meas !== null && meas !== 0;              // NaN is truthy in Python
        if (measTruthy && Math.abs(val - meas) > Math.max(1.0, 0.01 * meas))
          add("Critical", "Dimension text overridden", "Shows " + txt + " but measures " + C().pyfmt(meas, ",.1f"),
            "Remove text overrides or correct geometry.");
      });
    }
    // comparison with a design from the Design Studio
    var compare = [];
    if (design !== null) {
      var designed = _design_callouts(design);
      var found = ex.spaced.map(function (b) { return [b.dia, b.spacing]; });
      var found_n = ex.counted.map(function (b) { return [b.n, b.dia]; });
      var G = function (x) { return C().pyfmt(x, "g"); };
      designed.forEach(function (item) {
        var ok;
        if ("spacing" in item) {
          ok = found.some(function (p) { return p[0] === item.dia && p[1] <= item.spacing; });
          compare.push({ "Designed": G(item.dia) + "Ø @ " + G(item.spacing) + " (" + item.where + ")",
            "In drawing": ok ? "✔ found (same or closer)" : "✘ not found", "Status": ok ? "OK" : "CHECK" });
          if (!ok)
            add("Critical", "Designed reinforcement not shown",
              G(item.dia) + "Ø @ " + G(item.spacing) + " c/c (" + item.where + ") not found in the drawing",
              "Show the designed bars or justify the change.");
        } else {
          ok = found_n.some(function (p) { return p[1] === item.dia && p[0] >= item.n; });
          compare.push({ "Designed": pystr(item.n) + "-" + G(item.dia) + "Ø (" + item.where + ")",
            "In drawing": ok ? "✔ found" : "✘ not found", "Status": ok ? "OK" : "CHECK" });
          if (!ok)
            add("Critical", "Designed reinforcement not shown",
              pystr(item.n) + "-" + G(item.dia) + "Ø (" + item.where + ") not found", "Show the designed bars.");
        }
      });
      _design_sections(design).forEach(function (sec) {
        var key = pyupper(replaceAll(sec, " ", ""));
        var ok = ex.sections.some(function (s) { return pyupper(replaceAll(s, " ", "")).indexOf(key) >= 0; });
        compare.push({ "Designed": sec, "In drawing": ok ? "✔ found" : "✘ not found", "Status": ok ? "OK" : "CHECK" });
      });
    }
    var order = { "Critical": 0, "Important": 1, "Advisory": 2 };
    var ord = function (x) { return Object.prototype.hasOwnProperty.call(order, x.severity) ? order[x.severity] : 3; };
    f = f.map(function (x, i) { return [x, i]; }).sort(function (a, b) { return (ord(a[0]) - ord(b[0])) || (a[1] - b[1]); })
      .map(function (p) { return p[0]; });
    var W8 = { "Critical": 15, "Important": 6, "Advisory": 2 };
    var score = Math.max(0, 100 - f.reduce(function (s, x) {
      if (!Object.prototype.hasOwnProperty.call(W8, x.severity)) throw new Error("KeyError: " + x.severity);
      return s + W8[x.severity];
    }, 0));
    return { findings: f, extract: ex, compare: compare, score: score };
  }
  M.review = review;

  var RE_DC1 = pyre("(\\d{1,2})Ø\\s*@\\s*(\\d{2,3})"), RE_DC2 = pyre("(\\d{1,2})-(\\d{1,2})Ø");
  function _design_callouts(design) {
    var out = [];
    design.calc.steps.forEach(function (s) {
      if (typeof s.value !== "string") return;
      if (s.label.indexOf("Bar choice – ") === 0) return;   // DS.detailing reasoning text (repeats / pre-tightening bars)
      finditer(RE_DC1, s.value).forEach(function (m) {
        out.push({ dia: pyint(m[1]), spacing: pyint(m[2]), where: head(s.label, 50) });
      });
      finditer(RE_DC2, s.value).forEach(function (m) {
        out.push({ n: pyint(m[1]), dia: pyint(m[2]), where: head(s.label, 50) });
      });
    });
    var seen = new Set(), uniq = [];
    out.forEach(function (o) {
      var k = JSON.stringify(Object.keys(o).sort().map(function (key) { return [key, o[key]]; }));
      if (!seen.has(k)) { seen.add(k); uniq.push(o); }
    });
    return uniq.slice(0, 40);
  }
  M._design_callouts = _design_callouts;

  var RE_DSEC = pyre("\\b(IS(?:MB|HB|MC|A)\\s?\\d{2,3}(?:x\\d{2,3}x\\d{1,2})?)");
  function _design_sections(design) {
    var secs = [];
    Object.keys(design.summary).forEach(function (k) {
      finditer(RE_DSEC, pystr(design.summary[k])).forEach(function (m) { secs.push(m[1]); });
    });
    return sorted_set(secs);
  }
  M._design_sections = _design_sections;

  /* =========================================================================== AI review (user's own key) */
  var AI_MODELS = ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-4-5-20251001"];
  M.AI_MODELS = AI_MODELS;

  function ai_prompt(drawing_type, context) {
    context = context == null ? "" : context;
    var items = [];
    ["General", drawing_type].forEach(function (g) {
      if (inChecklist(g)) CHECKLIST[g].forEach(function (r) { items.push("- " + r[2]); });
    });
    var checklist = items.join("\n");
    return (
      "You are a senior Indian structural / civil design reviewer. Review the attached drawing " +
      "(type: " + drawing_type + ") against Indian practice (IS 456, IS 800, IS 875, IS 1893, IS 13920, SP 34, " +
      "IRC 6/112/SP-13/37 as relevant).\n\n" +
      "Report in this exact structure (Markdown):\n" +
      "1. **What the drawing shows** – 3–5 lines.\n" +
      "2. **Critical issues** – safety / code violations (detailing, cover, spacing, laps, missing members).\n" +
      "3. **Missing information** – items a site engineer would need but cannot find.\n" +
      "4. **Improvements** – clarity, presentation, layering, dimensions, notes.\n" +
      "5. **Quantities that can be read** – member sizes / bar call-outs you can read reliably.\n" +
      "For every point cite the clause where applicable, and say 'cannot read' rather than guess.\n\n" +
      "Checklist to cover:\n" + checklist + "\n" + (context ? "\nDesign context from the user:\n" + context + "\n" : ""));
  }
  M.ai_prompt = ai_prompt;

  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function b64encode(u8) {
    var out = [], i;
    for (i = 0; i + 2 < u8.length; i += 3) {
      var n = (u8[i] << 16) | (u8[i + 1] << 8) | u8[i + 2];
      out.push(B64[n >> 18 & 63] + B64[n >> 12 & 63] + B64[n >> 6 & 63] + B64[n & 63]);
    }
    var r = u8.length - i;
    if (r === 1) { var a = u8[i] << 16; out.push(B64[a >> 18 & 63] + B64[a >> 12 & 63] + "=="); }
    else if (r === 2) { var b = (u8[i] << 16) | (u8[i + 1] << 8); out.push(B64[b >> 18 & 63] + B64[b >> 12 & 63] + B64[b >> 6 & 63] + "="); }
    return out.join("");
  }
  M._b64encode = b64encode;

  /* json.dumps(v) with Python defaults (ensure_ascii=True, separators ", " / ": ") */
  function pyjson(v) {
    if (v === null || v === undefined) return "null";
    if (v === true) return "true";
    if (v === false) return "false";
    if (typeof v === "number") {
      if (!isFinite(v)) return isNaN(v) ? "NaN" : (v > 0 ? "Infinity" : "-Infinity");
      return Number.isInteger(v) ? String(v) : C().pystr(v);
    }
    if (typeof v === "string") {
      return "\"" + v.replace(/[^ -~]|["\\]/g, function (ch) {
        switch (ch) {
          case "\"": return "\\\""; case "\\": return "\\\\"; case "\n": return "\\n"; case "\r": return "\\r";
          case "\t": return "\\t"; case "\b": return "\\b"; case "\f": return "\\f";
          default: return "\\u" + ("000" + ch.charCodeAt(0).toString(16)).slice(-4);
        }
      }) + "\"";
    }
    if (Array.isArray(v)) return "[" + v.map(pyjson).join(", ") + "]";
    return "{" + Object.keys(v).map(function (k) { return pyjson(String(k)) + ": " + pyjson(v[k]); }).join(", ") + "}";
  }
  M._pyjson = pyjson;

  var API_URL = "https://api.anthropic.com/v1/messages";
  M.API_URL = API_URL;
  /* Build {url, headers, body} exactly as the Python version sends it */
  function ai_request(api_key, model, data, mime, drawing_type, context, extra_text) {
    context = context == null ? "" : context; extra_text = extra_text == null ? "" : extra_text;
    var u8 = toU8(data), content = [];
    if (u8.length && mime === "application/pdf")
      content.push({ type: "document", source: { type: "base64", media_type: mime, data: b64encode(u8) } });
    else if (u8.length && ["image/png", "image/jpeg", "image/webp", "image/gif"].indexOf(mime) >= 0)
      content.push({ type: "image", source: { type: "base64", media_type: mime, data: b64encode(u8) } });
    var prompt = ai_prompt(drawing_type, context);
    if (extra_text) prompt += "\n\nText and entities extracted from the CAD file:\n" + head(extra_text, 60000);
    content.push({ type: "text", text: prompt });
    var headers = { "x-api-key": pystrip(api_key), "anthropic-version": "2023-06-01", "content-type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true" };
    var body = { model: model, max_tokens: 4000, messages: [{ role: "user", content: content }] };
    return { url: API_URL, headers: headers, body: pyjson(body) };
  }
  M._ai_request = ai_request;

  function _parse_ai_response(status, text) {
    if (status !== 200) {
      var msg = text;
      try {
        var j = JSON.parse(text);
        if (j && typeof j === "object" && !Array.isArray(j)) {
          var e = Object.prototype.hasOwnProperty.call(j, "error") ? j.error : {};
          if (e && typeof e === "object" && Object.prototype.hasOwnProperty.call(e, "message")) msg = e.message;
        }
      } catch (err) { msg = text; }
      throw new Error("API error " + status + ": " + head(typeof msg === "string" ? msg : pystr(msg), 400));
    }
    var out = JSON.parse(text);
    return (out.content || []).filter(function (b) { return b && b.type === "text"; })
      .map(function (b) { return b.text == null ? "" : b.text; }).join("\n");
  }
  M._parse_ai_response = _parse_ai_response;

  /* Call the Anthropic Messages API. Returns Promise<Markdown text>; rejects with Error("API error …"). */
  function ai_review(api_key, model, data, mime, drawing_type, context, extra_text, timeout) {
    timeout = timeout == null ? 180 : timeout;
    var req;
    try { req = ai_request(api_key, model, data, mime, drawing_type, context, extra_text); } catch (e) { return Promise.reject(e); }
    var opts = { method: "POST", headers: req.headers, body: req.body };
    var timer = null;
    if (typeof AbortController !== "undefined" && timeout) {
      var ac = new AbortController(); opts.signal = ac.signal;
      timer = setTimeout(function () { ac.abort(); }, timeout * 1000);
    }
    var fetchFn = window.fetch;
    if (typeof fetchFn !== "function") return Promise.reject(new Error("fetch is not available"));
    return fetchFn.call(window, req.url, opts).then(function (resp) {
      return resp.text().then(function (text) { return _parse_ai_response(resp.status, text); });
    }).then(function (r) { if (timer) clearTimeout(timer); return r; }, function (e) { if (timer) clearTimeout(timer); throw e; });
  }
  M.ai_review = ai_review;

  function dxf_summary_text(doc, limit) {
    limit = limit == null ? 400 : limit;
    var counts = Object.keys(doc.counts).map(function (k) { return [k, doc.counts[k]]; }).sort(pycmp);
    var lines = ["DXF version " + doc.version + ", units " + pystr(insunits(doc.units)),
      "Entity counts: " + counts.map(function (kv) { return kv[0] + " " + pystr(kv[1]); }).join(", "),
      "Layers: " + doc.layers.slice(0, 80).join(", ")];
    doc.texts.slice(0, limit).forEach(function (t) { lines.push("TEXT [" + t[1] + "]: " + t[0]); });
    doc.dims.slice(0, 200).forEach(function (d) { lines.push("DIM [" + d[2] + "]: measured " + frepr(d[0]) + " text '" + d[1] + "'"); });
    return lines.join("\n");
  }
  M.dxf_summary_text = dxf_summary_text;
})();
