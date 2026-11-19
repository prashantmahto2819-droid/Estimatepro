/* Minimal XLSX writer: styles, merges, formulas, column widths, print setup.
   No dependencies. Produces a standard .xlsx (zip, stored) that Excel / LibreOffice open. */
(function () {
  "use strict";
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  var enc = new TextEncoder();
  function zip(files) { // files: [{name, data:string}]
    var parts = [], central = [], off = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    });
    var csize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  function x(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""); }
  function col(n) { var s = ""; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function ref(r, c) { return col(c) + (r + 1); }

  /* Style ids (cellXfs order below) */
  var S = { def: 0, title: 1, bold: 2, head: 3, text: 4, num: 5, qty: 6, btext: 7, bnum: 8, center: 9, itext: 10, bqty: 11, sign: 12, signb: 13, note: 14, num0: 15, hitext: 16, subtitle: 17, dim: 18 };
  var STYLES =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="#,##0.000"/><numFmt numFmtId="166" formatCode="#,##0"/></numFmts>' +
    '<fonts count="5"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font><font><b/><sz val="12"/><name val="Arial"/></font><font><i/><sz val="10"/><name val="Arial"/></font><font><i/><sz val="9"/><color rgb="FF555555"/><name val="Arial"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE3EAF1"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF7F8C99"/></left><right style="thin"><color rgb="FF7F8C99"/></right><top style="thin"><color rgb="FF7F8C99"/></top><bottom style="thin"><color rgb="FF7F8C99"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="19">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="165" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  /* Additional styles registered at run time (appended after the fixed ids above, which never change).
     XW.style({font: {b, i, sz, color, name}, fill: "RRGGBB", border: "RRGGBB" (thin box), numFmt: "0.00",
               wrap: true, valign: "top"|"center", halign: "left"|"center"|"right"}) → style id */
  var EX = { numFmts: [], fonts: [], fills: [], borders: [], xfs: [], keys: {}, fmtIds: {} };
  var BUILTIN_FMT = { "General": 0, "0": 1, "0.00": 2, "#,##0": 3, "#,##0.00": 4, "0%": 9, "0.00%": 10 };
  function exIndex(list, base, xml) { var i = list.indexOf(xml); if (i < 0) { list.push(xml); i = list.length - 1; } return base + i; }
  function style(o) {
    o = o || {}; var key = JSON.stringify(o); if (EX.keys[key] != null) return EX.keys[key];
    var f = o.font || {}, numId = 0, fontId = 0, fillId = 0, borderId = 0;
    if (o.numFmt) {
      if (BUILTIN_FMT[o.numFmt] != null) numId = BUILTIN_FMT[o.numFmt];
      else if (o.numFmt === "#,##0.000") numId = 165;
      else { if (EX.fmtIds[o.numFmt] == null) { EX.fmtIds[o.numFmt] = 167 + EX.numFmts.length; EX.numFmts.push('<numFmt numFmtId="' + EX.fmtIds[o.numFmt] + '" formatCode="' + x(o.numFmt) + '"/>'); } numId = EX.fmtIds[o.numFmt]; }
    }
    fontId = exIndex(EX.fonts, 5, "<font>" + (f.b ? "<b/>" : "") + (f.i ? "<i/>" : "") + '<sz val="' + (f.sz || 10) + '"/>' + (f.color ? '<color rgb="FF' + f.color + '"/>' : "") + '<name val="' + x(f.name || "Arial") + '"/></font>');
    if (o.fill) fillId = exIndex(EX.fills, 3, '<fill><patternFill patternType="solid"><fgColor rgb="FF' + o.fill + '"/><bgColor indexed="64"/></patternFill></fill>');
    if (o.border) { var sd = '<color rgb="FF' + o.border + '"/>'; borderId = exIndex(EX.borders, 2, '<border><left style="thin">' + sd + '</left><right style="thin">' + sd + '</right><top style="thin">' + sd + '</top><bottom style="thin">' + sd + "</bottom><diagonal/></border>"); }
    var al = (o.halign ? ' horizontal="' + o.halign + '"' : "") + (o.valign ? ' vertical="' + o.valign + '"' : "") + (o.wrap ? ' wrapText="1"' : "");
    EX.xfs.push('<xf numFmtId="' + numId + '" fontId="' + fontId + '" fillId="' + fillId + '" borderId="' + borderId + '" xfId="0"' + (numId ? ' applyNumberFormat="1"' : "") +
      ' applyFont="1"' + (fillId ? ' applyFill="1"' : "") + (borderId ? ' applyBorder="1"' : "") + (al ? ' applyAlignment="1"><alignment' + al + "/></xf>" : "/>"));
    return (EX.keys[key] = 19 + EX.xfs.length - 1);
  }
  function stylesXml() {
    if (!EX.xfs.length) return STYLES;
    function grow(s, tag, n, extra) { return s.replace(new RegExp("<" + tag + ' count="(\\d+)">'), function (m, c) { return "<" + tag + ' count="' + (+c + n) + '">'; }).replace("</" + tag + ">", extra.join("") + "</" + tag + ">"); }
    var s = grow(STYLES, "numFmts", EX.numFmts.length, EX.numFmts);
    s = grow(s, "fonts", EX.fonts.length, EX.fonts); s = grow(s, "fills", EX.fills.length, EX.fills);
    s = grow(s, "borders", EX.borders.length, EX.borders); return grow(s, "cellXfs", EX.xfs.length, EX.xfs);
  }

  function Sheet(name, opt) {
    this.name = String(name).replace(/[\[\]\*\?\/\\:]/g, " ").slice(0, 31);
    this.opt = opt || {}; this.rows = {}; this.merges = []; this.heights = {}; this.max = -1; this.breaks = [];
  }
  Sheet.prototype.set = function (r, c, v, s, f) { (this.rows[r] = this.rows[r] || {})[c] = { v: v, s: s || 0, f: f }; if (r > this.max) this.max = r; return ref(r, c); };
  Sheet.prototype.merge = function (r1, c1, r2, c2) { if (r2 > r1 || c2 > c1) this.merges.push(ref(r1, c1) + ":" + ref(r2, c2)); };
  Sheet.prototype.height = function (r, h) { this.heights[r] = h; };
  Sheet.prototype.pageBreak = function (r) { if (r > 0) this.breaks.push(r); };
  Sheet.prototype.xml = function () {
    var o = this.opt, cols = o.cols || [];
    var h = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0"' + (o.gridLines ? "" : ' showGridLines="0"') + (o.freeze ? ">" + freezePane(o.freeze) + "</sheetView>" : "/>") + '</sheetViews><sheetFormatPr defaultRowHeight="14"/>';
    if (cols.length) h += "<cols>" + cols.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join("") + "</cols>";
    h += "<sheetData>";
    for (var r = 0; r <= this.max; r++) {
      var row = this.rows[r]; if (!row && this.heights[r] == null) continue;
      h += '<row r="' + (r + 1) + '"' + (this.heights[r] != null ? ' ht="' + this.heights[r] + '" customHeight="1"' : "") + ">";
      if (row) Object.keys(row).map(Number).sort(function (a, b) { return a - b; }).forEach(function (c) {
        var cell = row[c], a = ' r="' + ref(r, c) + '" s="' + cell.s + '"';
        if (cell.f) { h += "<c" + a + "><f>" + x(cell.f) + "</f>" + (typeof cell.v === "number" && isFinite(cell.v) ? "<v>" + cell.v + "</v>" : "") + "</c>"; }
        else if (typeof cell.v === "number" && isFinite(cell.v)) h += "<c" + a + "><v>" + cell.v + "</v></c>";
        else if (cell.v == null || cell.v === "") h += "<c" + a + "/>";
        else h += "<c" + a + ' t="inlineStr"><is><t xml:space="preserve">' + x(cell.v) + "</t></is></c>";
      });
      h += "</row>";
    }
    h += "</sheetData>";
    if (this.merges.length) h += '<mergeCells count="' + this.merges.length + '">' + this.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join("") + "</mergeCells>";
    h += '<printOptions horizontalCentered="1"/><pageMargins left="0.5" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
      '<pageSetup paperSize="9" orientation="' + (o.landscape ? "landscape" : "portrait") + '" fitToWidth="1" fitToHeight="0"/>' +
      '<headerFooter><oddFooter>&amp;C' + x(this.name) + ' – page &amp;P of &amp;N</oddFooter></headerFooter>';
    if (this.breaks.length) h += '<rowBreaks count="' + this.breaks.length + '" manualBreakCount="' + this.breaks.length + '">' + this.breaks.map(function (b) { return '<brk id="' + b + '" max="16383" man="1"/>'; }).join("") + "</rowBreaks>";
    return h + "</worksheet>";
  };
  /* opt.freeze = "C4" freezes the rows above / columns left of that cell; opt.gridLines = true shows gridlines */
  function freezePane(cell) {
    var m = /^([A-Z]+)(\d+)$/.exec(cell), c = 0; for (var i = 0; i < m[1].length; i++) c = c * 26 + m[1].charCodeAt(i) - 64;
    var xs = c - 1, ys = +m[2] - 1, pane = xs && ys ? "bottomRight" : xs ? "topRight" : "bottomLeft";
    return "<pane" + (xs ? ' xSplit="' + xs + '"' : "") + (ys ? ' ySplit="' + ys + '"' : "") + ' topLeftCell="' + cell + '" activePane="' + pane + '" state="frozen"/><selection pane="' + pane + '"/>';
  }
  function Book() { this.sheets = []; }
  Book.prototype.sheet = function (name, opt) { var s = new Sheet(name, opt); this.sheets.push(s); return s; };
  Book.prototype.blob = function () {
    var sh = this.sheets, files = [];
    files.push({ name: "[Content_Types].xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sh.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join("") + "</Types>" });
    files.push({ name: "_rels/.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' });
    files.push({ name: "xl/workbook.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>' + sh.map(function (s, i) { return '<sheet name="' + x(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join("") + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' });
    files.push({ name: "xl/_rels/workbook.xml.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sh.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join("") + '<Relationship Id="rId' + (sh.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' });
    files.push({ name: "xl/styles.xml", data: stylesXml() });
    sh.forEach(function (s, i) { files.push({ name: "xl/worksheets/sheet" + (i + 1) + ".xml", data: s.xml() }); });
    return zip(files);
  };
  window.XW = { book: function () { return new Book(); }, S: S, ref: ref, col: col, style: style };
})();
