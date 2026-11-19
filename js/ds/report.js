/* Design Studio — report (port of civilest/design/report.py)

   DS.report.to_excel_formula(expr, variables) → "=..." Excel formula of the recorded Python expression with the
       variable values substituted (throws Error for an unsupported construct, like Python's ValueError).
   DS.report.excel_report(res, project, mode, company) → {blob, map, book}
       blob: the .xlsx as a Blob (written with window.XW, js/xlsxw.js — must be loaded first);
       map:  {formula_rows: {stepIndex(1-based): excelRow(1-based)}}  (Python returns (bytes, this dict));
       book: the XW book (e.g. to add sheets before calling book.blob() again).
   DS.report.html_report(res, project, mode, drawings = true, company) → self-contained HTML string.
   DS.report.svg_data_uri(svg) → "data:image/svg+xml;base64,...".
   (to_estimate_items is not ported: the host app maps design quantities to estimate items itself.)

   Note: JS numbers carry no int / float distinction, so a variable value is always spelled as a Python float
   ("25.0", the common case in the Python modules); where Python held an int it writes "25". The Excel value is identical. Literals in the expression keep their
   Python spelling (2 → "2", 2.0 → "2.0", 1e3 → "1000.0"). */
(function () {
  "use strict";
  /* inputs that apply to this run (e.g. railway ballast / tracks only for railway loading) */
  function shownKeys(res) {
    var sp = window.DS && DS.core && DS.core.MODULES[res.module], v = res.inputs || {};
    return Object.keys(v).filter(function (k) { var p = sp && sp.params.filter(function (x) { return x.key === k; })[0]; return !(p && p.when && !p.when(v)); });
  }
  var DS = window.DS = window.DS || {};
  var M = DS.report = {};
  function C() { return DS.core; }

  /* ======================================================================= python expression → Excel */
  var FUNCS = { sqrt: "SQRT", min: "MIN", max: "MAX", abs: "ABS", sin: "SIN", cos: "COS", tan: "TAN", atan: "ATAN", asin: "ASIN",
    acos: "ACOS", radians: "RADIANS", degrees: "DEGREES", log10: "LOG10", log: "LN", exp: "EXP" };
  var OPS = { "+": "+", "-": "-", "*": "*", "/": "/", "**": "^" };
  var CMP = { ">": ">", ">=": ">=", "<": "<", "<=": "<=", "==": "=", "!=": "<>" };

  /* Python repr(float) */
  function floatRepr(v) {
    if (isNaN(v)) return "nan";
    if (!isFinite(v)) return v > 0 ? "inf" : "-inf";
    if (v === 0) return 1 / v < 0 ? "-0.0" : "0.0";
    var a = Math.abs(v);
    if (a >= 1e16 || a < 1e-4) return C().pyfmt(v, ".15g");   // repr would contain "e" → f"{v:.15g}"
    var s = String(v);
    return /[.e]/.test(s) ? s : s + ".0";
  }
  /* _num: bool → TRUE/FALSE, int → str, float → repr (or .15g when repr has an exponent) */
  function num(v, isFloat) {
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (typeof v !== "number") { var f = parseFloat(v); if (typeof v !== "string" || isNaN(f) && !/^\s*[-+]?(nan|inf)/i.test(v)) throw new Error("not a number: " + v); v = f; isFloat = true; }
    if (!isFloat && Number.isInteger(v)) return String(v);
    return floatRepr(v);
  }
  M._num = num;

  function tokenize(s) {
    var t = [], i = 0, re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z_0-9]*)|(\*\*|\/\/|<=|>=|==|!=|[-+*\/%()<>,]))/y;
    while (i < s.length) {
      if (/^\s*$/.test(s.slice(i))) break;
      re.lastIndex = i; var m = re.exec(s); if (!m) throw new Error("SyntaxError near '" + s.slice(i) + "'");
      if (m[1] != null) t.push({ k: "n", v: m[1] });
      else if (m[2] != null) t.push({ k: /^(if|else|and|or|not)$/.test(m[2]) ? m[2] : "id", v: m[2] });
      else t.push({ k: m[3] });
      i = re.lastIndex;
    }
    return t;
  }
  /* parse to a small AST with Python's node kinds and precedence */
  function parse(src) {
    var t = tokenize(src), p = 0;
    function peek(k) { return t[p] && t[p].k === k; }
    function eat(k) { if (!peek(k)) throw new Error("SyntaxError: expected " + k + " in '" + src + "'"); return t[p++]; }
    function expr() { var a = orT(); if (peek("if")) { p++; var c = orT(); eat("else"); var b = expr(); return { k: "IfExp", test: c, body: a, orelse: b }; } return a; }
    function boolT(op, sub) { return function () { var v = [sub()]; while (peek(op)) { p++; v.push(sub()); } return v.length > 1 ? { k: "BoolOp", op: op, values: v } : v[0]; }; }
    function notT() { if (peek("not")) { p++; return { k: "UnaryOp", op: "not", operand: notT() }; } return cmp(); }
    var andT = boolT("and", notT), orT = boolT("or", andT);
    function cmp() {
      var a = arith(), ops = [], comps = [];
      while (t[p] && CMP[t[p].k] !== undefined) { ops.push(t[p++].k); comps.push(arith()); }
      return ops.length ? { k: "Compare", left: a, ops: ops, comparators: comps } : a;
    }
    function arith() { var a = term(); while (peek("+") || peek("-")) { var o = t[p++].k; a = { k: "BinOp", op: o, left: a, right: term() }; } return a; }
    function term() { var a = factor(); while (peek("*") || peek("/") || peek("//") || peek("%")) { var o = t[p++].k; a = { k: "BinOp", op: o, left: a, right: factor() }; } return a; }
    function factor() { if (peek("-") || peek("+")) { var o = t[p++].k; return { k: "UnaryOp", op: o, operand: factor() }; } return power(); }
    function power() { var a = atom(); if (peek("**")) { p++; return { k: "BinOp", op: "**", left: a, right: factor() }; } return a; }
    function atom() {
      var k = t[p];
      if (!k) throw new Error("SyntaxError: unexpected end of '" + src + "'");
      if (k.k === "n") { p++; return { k: "Constant", text: k.v }; }
      if (k.k === "(") { p++; var a = expr(); eat(")"); return a; }
      if (k.k === "id") {
        p++;
        if (peek("(")) {
          p++; var args = [];
          if (!peek(")")) { args.push(expr()); while (peek(",")) { p++; if (peek(")")) break; args.push(expr()); } }
          eat(")");
          return { k: "Call", func: k.v, args: args };
        }
        if (k.v === "True" || k.v === "False" || k.v === "None") return { k: "Constant", value: k.v === "None" ? null : k.v === "True" };
        return { k: "Name", id: k.v };
      }
      throw new Error("SyntaxError: unexpected '" + k.k + "' in '" + src + "'");
    }
    var tree = expr(); if (p !== t.length) throw new Error("SyntaxError: unexpected '" + (t[p].v || t[p].k) + "' in '" + src + "'");
    return tree;
  }

  M.to_excel_formula = function (expr, variables) {
    variables = variables || {};
    function tr(n) {
      switch (n.k) {
        case "Constant":
          if (n.text != null) return num(parseFloat(n.text), /[.eE]/.test(n.text));
          if (n.value === null) throw new Error("None");
          return num(n.value);
        case "Name":
          if (n.id === "pi") return "PI()";
          if (Object.prototype.hasOwnProperty.call(variables, n.id)) { var s = num(variables[n.id], true); return s.charAt(0) === "-" ? "(" + s + ")" : s; }
          throw new Error(n.id);
        case "BinOp":
          if (OPS[n.op]) return "(" + tr(n.left) + OPS[n.op] + tr(n.right) + ")";
          throw new Error("BinOp");
        case "UnaryOp":
          if (n.op === "-") return "(-" + tr(n.operand) + ")";
          if (n.op === "+") return tr(n.operand);
          throw new Error("UnaryOp");
        case "Call":
          var f = n.func, args = n.args.map(tr);
          if (FUNCS[f]) return FUNCS[f] + "(" + args.join(",") + ")";
          if (f === "round") return "ROUND(" + args[0] + "," + (args.length > 1 ? args[1] : 0) + ")";
          if (f === "ceil") return "(-INT(-(" + args[0] + ")))";
          if (f === "floor") return "INT(" + args[0] + ")";
          throw new Error(f);
        case "IfExp": return "IF(" + tr(n.test) + "," + tr(n.body) + "," + tr(n.orelse) + ")";
        case "Compare":
          if (n.ops.length === 1) return "(" + tr(n.left) + CMP[n.ops[0]] + tr(n.comparators[0]) + ")";
          throw new Error("Compare");
        case "BoolOp": return (n.op === "and" ? "AND" : "OR") + "(" + n.values.map(tr).join(",") + ")";
      }
      throw new Error(n.k);
    }
    return "=" + tr(parse(String(expr)));
  };

  /* ======================================================================= Excel workbook */
  var BOXC = "BFBFBF";
  function st(o) { return window.XW.style(o); }
  var STATUS_FILL = { PASS: "E2EFDA", FAIL: "F8CBAD", WARN: "FFF2CC", INFO: "EDEDED" };
  function today() { var d = new Date(); function z(n) { return (n < 10 ? "0" : "") + n; } return z(d.getDate()) + "-" + z(d.getMonth() + 1) + "-" + d.getFullYear(); }
  function isNum(v) { return typeof v === "number"; }

  M.excel_report = function (res, project, mode, company) {
    project = project || ""; mode = mode || "design";
    var Cc = C(), X = window.XW, wb = X.book();
    var S_HEAD = st({ font: { b: 1, color: "FFFFFF", sz: 10 }, fill: "1F3864", border: BOXC, wrap: 1, valign: "center" });
    /* _put(ws, r, c, v, font=F_N, fmt=None, fill=None, wrap=False) — r, c 1-based like openpyxl */
    function put(ws, r, c, v, bold, fmt, fill, wrap) {
      var s = st({ font: bold ? { b: 1, sz: 10 } : { sz: 10 }, fill: fill || undefined, border: BOXC, numFmt: fmt || undefined, wrap: wrap ? 1 : undefined, valign: "top" });
      var isF = typeof v === "string" && v.charAt(0) === "=" && v.length > 1;
      if (isF) ws.set(r - 1, c - 1, null, s, v.slice(1)); else ws.set(r - 1, c - 1, v == null ? "" : v, s);
    }
    function hdr(ws, r, cols) { cols.forEach(function (h, j) { ws.set(r - 1, j, h, S_HEAD); }); }

    var ws = wb.sheet("Summary", { cols: [48, 60, 14, 14, 10, 14, 26], gridLines: true });
    ws.set(0, 0, res.title + " – design summary", st({ font: { b: 1, sz: 14, color: "1F3864" } }));
    var firm = (company || {}).firm || "";
    ws.set(1, 0, (firm ? firm + "  |  " : "") + project + "  |  Mode: " + (Cc.MODE_LABEL[mode] || mode) + "  |  " + today() + "  |  Status: " + res.status,
      st({ font: { i: 1, sz: 10 } }));
    var r = 4;
    hdr(ws, r, ["Item", "Value"]);
    Object.keys(res.summary).forEach(function (k) { r++; put(ws, r, 1, k, true); put(ws, r, 2, Cc.pystr(res.summary[k]), false, null, null, true); });
    r += 2;
    hdr(ws, r, ["Input", "Value"]);
    shownKeys(res).forEach(function (k) { var v = res.inputs[k]; r++; put(ws, r, 1, k); put(ws, r, 2, isNum(v) ? v : Cc.pystr(v)); });
    r += 2;
    hdr(ws, r, ["What is missing / to verify", "Severity", "Clause"]);
    res.calc.missing.forEach(function (m) { r++; put(ws, r, 1, m.text, false, null, null, true); put(ws, r, 2, m.severity); put(ws, r, 3, m.clause); });
    r += 2;
    hdr(ws, r, ["Thumb rule", "Rule", "Thumb value", "Design value", "Unit", "Difference %", "Source"]);
    res.calc.thumbs.forEach(function (t) {
      r++;
      put(ws, r, 1, t.item); put(ws, r, 2, t.rule, false, null, null, true);
      put(ws, r, 3, Cc.pyround(t.thumb_value, 3), false, "0.00"); put(ws, r, 4, Cc.pyround(t.design_value, 3), false, "0.00");
      put(ws, r, 5, t.unit);
      put(ws, r, 6, "=IF(D" + r + "=0,\"\",(C" + r + "-D" + r + ")/D" + r + "*100)", false, "0.0");
      put(ws, r, 7, t.source);
    });
    r += 2;
    ws.set(r - 1, 0, Cc.DISCLAIMER, st({ font: { i: 1, sz: 9, color: "7F7F7F" } }));

    /* ------------------------------------------------------------- calculation sheet */
    var wc = wb.sheet("Calculation", { cols: [5, 40, 9, 34, 40, 9, 13, 18, 7, 24, 8, 30], freeze: "C4", gridLines: true });
    wc.set(0, 0, res.title + " – calculation (every formula re-computed by Excel in column G)", st({ font: { b: 1, sz: 12, color: "1F3864" } }));
    hdr(wc, 3, ["#", "Description", "Symbol", "Formula", "Substituted values", "Unit", "Excel result", "App result", "Match",
      "Clause / reference", "Status", "Note"]);
    r = 3;
    var sec = null, rows = {}, S_SECF = st({ fill: "D9E1F2" }), S_SEC = st({ font: { b: 1, sz: 10, color: "1F3864" }, fill: "D9E1F2" });
    res.calc.steps.forEach(function (s, idx) {
      var i = idx + 1;
      if (s.section !== sec) {
        sec = s.section; r++;
        for (var j = 1; j < 13; j++) wc.set(r - 1, j - 1, "", S_SECF);
        wc.set(r - 1, 0, sec, S_SEC);
      }
      r++;
      put(wc, r, 1, i); put(wc, r, 2, s.label, false, null, null, true); put(wc, r, 3, s.symbol);
      put(wc, r, 4, s.formula, false, null, null, true); put(wc, r, 5, s.substituted, false, null, null, true); put(wc, r, 6, s.unit);
      var excel = null;
      if (s.expr && isNum(s.value) && isFinite(s.value)) { try { excel = M.to_excel_formula(s.expr, s.variables); } catch (e) { excel = null; } }
      if (excel) {
        wc.set(r - 1, 6, s.value, st({ font: { b: 1, sz: 10 }, border: BOXC, numFmt: "0.0000", valign: "top" }), excel.slice(1));
        put(wc, r, 8, s.value, false, "0.0000");
        put(wc, r, 9, '=IF(ABS(G' + r + '-H' + r + ')<=1E-6*MAX(1,ABS(H' + r + ')),"✔","✘")');
        rows[i] = r;
      } else {
        var v = s.value;
        put(wc, r, 7, null);
        put(wc, r, 8, isNum(v) ? v : Cc.pystr(v), false, null, null, true);
        put(wc, r, 9, null);
      }
      put(wc, r, 10, s.clause, false, null, null, true);
      put(wc, r, 11, s.status, false, null, STATUS_FILL[s.status]);
      put(wc, r, 12, s.note, false, null, null, true);
    });

    /* ------------------------------------------------------------- BBS */
    if (res.bbs.length) {
      var wbb = wb.sheet("BBS", { cols: [22, 7, 9, 26, 7, 13, 14, 9, 13, 26, 70], gridLines: true });
      hdr(wbb, 1, ["Member", "Mark", "Dia (mm)", "Shape", "Nos", "Cut length (m)", "Total length (m)", "kg/m", "Weight (kg)", "Note", "How the cut length is found (IS 2502 / SP 34)"]);
      res.bbs.forEach(function (b, bi) {
        var k = bi + 2;
        [b.member, b.mark, b.dia, b.shape, b.nos, b.cut_length].forEach(function (v, jj) { put(wbb, k, jj + 1, v, false, jj + 1 === 6 ? "0.000" : null); });
        put(wbb, k, 7, "=E" + k + "*F" + k, false, "0.00");
        put(wbb, k, 8, "=C" + k + "^2/162", false, "0.000");
        put(wbb, k, 9, "=G" + k + "*H" + k, false, "#,##0.00");
        put(wbb, k, 10, b.note);
        put(wbb, k, 11, b.formula || "");
      });
      var n = res.bbs.length + 1;
      put(wbb, n + 1, 8, "TOTAL", true);
      put(wbb, n + 1, 9, "=SUM(I2:I" + n + ")", true, "#,##0.00");
    }

    /* ------------------------------------------------------------- quantities */
    var wq = wb.sheet("Quantities", { cols: [40, 7, 40, 8, 10, 10, 10, 13, 12, 15, 24], gridLines: true });
    hdr(wq, 1, ["Item", "Unit", "Description of measurement", "Nos", "L", "B", "D", "Quantity", "Rate (₹)", "Amount (₹)", "SOR link"]);
    var k = 1, amounts = [];
    res.quantities.forEach(function (q) {
      var linked = !!(q.link && q.link.length);
      k++;
      put(wq, k, 1, q.description, true, null, null, true); put(wq, k, 2, q.unit);
      var start = k + 1;
      q.rows.forEach(function (rr) {
        k++;
        put(wq, k, 3, rr.description != null ? rr.description : "", false, null, null, true);
        [[4, "nos"], [5, "length"], [6, "breadth"], [7, "depth"]].forEach(function (jk) { put(wq, k, jk[0], rr[jk[1]], false, "0.000"); });
        var sign = rr.deduction ? "-" : "";
        put(wq, k, 8, "=" + sign + "IF(COUNT(D" + k + ":G" + k + ")=0,0,PRODUCT(D" + k + ":G" + k + "))", false, "#,##0.000");
      });
      k++;
      put(wq, k, 3, "Total", true);
      put(wq, k, 8, "=SUM(H" + start + ":H" + (k - 1) + ")", true, "#,##0.000");
      put(wq, k, 9, !linked ? q.rate : null, false, "#,##0.00");
      put(wq, k, 10, !linked ? "=IF(I" + k + "=\"\",\"\",H" + k + "*I" + k + ")" : null, true, "#,##0.00");
      put(wq, k, 11, linked ? q.link[0] + " " + q.link[1] : "Non-SOR (market rate)");
      amounts.push(k);
    });
    k += 2;
    put(wq, k, 9, "Non-SOR total", true);
    put(wq, k, 10, amounts.length ? "=" + amounts.map(function (x) { return "N(J" + x + ")"; }).join("+") : 0, true, "#,##0.00");

    /* ------------------------------------------------------------- references */
    var wr = wb.sheet("References", { cols: [90], gridLines: true });
    hdr(wr, 1, ["Codes & books used"]);
    res.references.forEach(function (ref, ri) { put(wr, ri + 2, 1, ref); });
    return { blob: wb.blob(), map: { formula_rows: rows }, book: wb };
  };

  /* ======================================================================= HTML report */
  var CSS = "\nbody{font-family:Arial,Helvetica,sans-serif;color:#1f2933;margin:24px;font-size:13px;background:#fff}\n" +
    "h1{color:#1f3864;font-size:22px;margin:0 0 4px} h2{color:#1f3864;border-bottom:2px solid #1f3864;padding-bottom:3px;\n" +
    "margin-top:28px;font-size:17px} h3{color:#334e68;font-size:14px;margin:18px 0 6px}\n" +
    "table{border-collapse:collapse;width:100%;margin:6px 0 12px} th{background:#1f3864;color:#fff;text-align:left;\n" +
    "padding:5px 6px;font-size:12px} td{border:1px solid #d9e2ec;padding:4px 6px;vertical-align:top;font-size:12px}\n" +
    ".PASS{background:#e2efda}.FAIL{background:#f8cbad}.WARN{background:#fff2cc}.INFO{background:#f0f4f8}\n" +
    ".badge{display:inline-block;padding:3px 10px;border-radius:10px;font-weight:bold;color:#fff}\n" +
    ".b-PASS{background:#2f855a}.b-CHECK{background:#b7791f}.b-FAIL{background:#c53030}\n" +
    ".muted{color:#627d98}.mono{font-family:Consolas,Menlo,monospace}.sheet{border:1px solid #d9e2ec;margin:10px 0;page-break-inside:avoid}\n" +
    "@media print{body{margin:10mm}h2{page-break-after:avoid}.sheet{page-break-before:always}}\n";
  /* html.escape(quote=True) */
  function e(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;"); }
  M._escape = e;

  /* pandas DataFrame.to_html(index=False, float_format=lambda x: f"{x:,.2f}", border=0) for a C.table {columns, rows}.
     Column kind is inferred: all numbers with any fraction → float (float_format), all integral numbers → int. */
  function tableHtml(t) {
    var Cc = C(), ncol = t.columns.length, kinds = [];
    for (var j = 0; j < ncol; j++) {
      var vals = t.rows.map(function (r) { return r[j]; }), nums = vals.filter(function (v) { return typeof v === "number"; });
      var allNum = vals.every(function (v) { return typeof v === "number" || v == null; }) && nums.length > 0;
      kinds.push(allNum ? (nums.every(function (v) { return Number.isInteger(v); }) && nums.length === vals.length ? "int" : "float") : "object");
    }
    function cell(v, kind) {
      if (v == null) return kind === "object" ? "None" : "NaN";
      if (typeof v === "number") {
        if (isNaN(v)) return "NaN";
        if (kind === "int") return String(v);
        if (kind === "object" && Number.isInteger(v)) return String(v);
        return Cc.pyfmt(v, ",.2f");
      }
      return e(Cc.pystr(v));
    }
    var o = ['<table class="dataframe">', "  <thead>", '    <tr style="text-align: right;">'];
    t.columns.forEach(function (c) { o.push("      <th>" + e(Cc.pystr(c)) + "</th>"); });
    o.push("    </tr>", "  </thead>", "  <tbody>");
    t.rows.forEach(function (r) { o.push("    <tr>"); for (var j = 0; j < ncol; j++) o.push("      <td>" + cell(r[j], kinds[j]) + "</td>"); o.push("    </tr>"); });
    o.push("  </tbody>", "</table>");
    return o.join("\n");
  }
  M._table_html = tableHtml;

  M.html_report = function (res, project, mode, drawings, company) {
    project = project || ""; mode = mode || "design"; if (drawings === undefined) drawings = true;
    var Cc = C(), co = company || {}, out = [];
    function g(k) { return co[k] || ""; }
    var addr = [g("address"), g("phone"), g("email"), co.gstin ? "GSTIN " + co.gstin : ""].filter(function (x) { return x; }).join(" · ");
    out.push("<!doctype html><html><head><meta charset='utf-8'><title>" + e(res.title) + " – calculation report</title><style>" + CSS + "</style></head><body>");
    out.push((co.firm ? "<div style='border-bottom:3px solid #1f3864;margin-bottom:10px;padding-bottom:6px'><b style='font-size:18px;" +
      "color:#1f3864'>" + e(g("firm")) + "</b><br><span class='muted'>" + e(addr) + "</span></div>" : "") +
      "<h1>" + e(res.title) + "</h1><div class='muted'>" + e(project) + " · " + e(Cc.MODE_LABEL[mode] || mode) + " · " + today() + " · CivilEst Pro – Design Studio</div>");
    out.push("<p><span class='badge b-" + res.status + "'>" + res.status + "</span> &nbsp; Max. utilisation <b>" + Cc.pyfmt(res.calc.max_utilisation, ".2f") +
      "</b> · " + res.calc.failures.length + " failed checks · " + res.calc.missing.length + " items to verify</p>");
    out.push("<h2>1. Summary</h2><table>" + Object.keys(res.summary).map(function (k) { return "<tr><td><b>" + e(k) + "</b></td><td>" + e(Cc.pystr(res.summary[k])) + "</td></tr>"; }).join("") + "</table>");
    out.push("<h2>2. Inputs</h2><table>" + shownKeys(res).map(function (k) { return "<tr><td>" + e(k) + "</td><td>" + e(Cc.pystr(res.inputs[k])) + "</td></tr>"; }).join("") + "</table>");
    out.push("<h2>3. Calculation</h2>");
    var sec = null;
    res.calc.steps.forEach(function (s, idx) {
      if (s.section !== sec) {
        if (sec !== null) out.push("</table>");
        sec = s.section;
        out.push("<h3>" + e(sec) + "</h3><table><tr><th>#</th><th>Description</th><th>Formula / substitution</th><th>Result</th><th>Clause</th><th>Status</th></tr>");
      }
      var val = typeof s.value === "string" ? s.value : Cc.fmt_num(s.value);
      var f = s.formula ? "<span class='mono'>" + e(s.symbol) + " = " + e(s.formula) + "</span><br><span class='mono muted'>= " + e(s.substituted) + "</span>" : e(s.symbol);
      out.push("<tr class='" + s.status + "'><td>" + (idx + 1) + "</td><td>" + e(s.label) + (s.note ? "<br><span class=muted>" + e(s.note) + "</span>" : "") + "</td>" +
        "<td>" + f + "</td><td><b>" + e(Cc.pystr(val)) + "</b> " + e(s.unit) + "</td><td>" + e(s.clause) + "</td><td>" + s.status + "</td></tr>");
    });
    if (sec !== null) out.push("</table>");
    out.push("<h2>4. What is missing / to verify</h2><table><tr><th>Severity</th><th>Item</th><th>Clause</th></tr>" +
      res.calc.missing.map(function (m) {
        return "<tr class='" + (m.severity === "Critical" ? "FAIL" : m.severity === "Important" ? "WARN" : "INFO") + "'><td>" + m.severity + "</td><td>" + e(m.text) + "</td><td>" + e(m.clause) + "</td></tr>";
      }).join("") + "</table>");
    if (res.calc.thumbs.length) {
      out.push("<h2>5. Thumb rule vs design</h2><table><tr><th>Item</th><th>Rule</th><th>Thumb</th><th>Design</th><th>Diff.</th><th>Source</th></tr>" +
        res.calc.thumbs.map(function (t) {
          return "<tr><td>" + e(t.item) + "</td><td>" + e(t.rule) + "</td><td>" + Cc.fmt_num(t.thumb_value) + " " + e(t.unit) + "</td>" +
            "<td>" + Cc.fmt_num(t.design_value) + " " + e(t.unit) + "</td><td>" + Cc.pyfmt(t.diff_pct || 0, "+.0f") + " %</td><td>" + e(t.source) + "</td></tr>";
        }).join("") + "</table>");
    }
    Object.keys(res.tables).forEach(function (name) { out.push("<h3>" + e(name) + "</h3>" + tableHtml(res.tables[name])); });
    if (res.bbs.length) {
      var tot = Cc.sum(res.bbs.map(function (b) { return b.weight; }));
      out.push("<h2>6. Bar bending schedule</h2><table><tr><th>Member</th><th>Mark</th><th>Dia</th><th>Shape</th><th>Nos</th><th>Cut length m</th><th>Total m</th><th>Weight kg</th><th>How the cut length is found</th></tr>" +
        res.bbs.map(function (b) {
          return "<tr><td>" + e(b.member) + "</td><td>" + e(b.mark) + "</td><td>" + Cc.pyfmt(b.dia, "g") + "</td><td>" + e(b.shape) + "</td>" +
            "<td>" + Cc.pystr(b.nos) + "</td><td>" + Cc.pyfmt(b.cut_length, ".3f") + "</td><td>" + Cc.pyfmt(b.total_length, ".1f") + "</td>" +
            "<td>" + Cc.pyfmt(b.weight, ",.1f") + "</td><td style='font-size:11px'>" + e(b.formula || "") + "</td></tr>";
        }).join("") + "<tr><td colspan=7><b>Total</b></td><td><b>" + Cc.pyfmt(tot, ",.1f") + "</b></td><td></td></tr></table>" +
        "<p style='font-size:11px'>" + e((DS.bbs && DS.bbs.RULES) || "") + "</p>");
    }
    out.push("<h2>7. Quantities</h2><table><tr><th>Item</th><th>Unit</th><th>Quantity</th><th>SOR / rate</th></tr>" +
      res.quantities.map(function (q) {
        var linked = !!(q.link && q.link.length);
        return "<tr><td>" + e(q.description) + "</td><td>" + e(q.unit) + "</td><td>" + Cc.pyfmt(q.quantity, ",.3f") + "</td>" +
          "<td>" + (linked ? e(q.link[0] + " " + q.link[1]) : "₹ " + Cc.pyfmt(q.rate, ",.2f") + " (Non-SOR)") + "</td></tr>";
      }).join("") + "</table>");
    out.push("<h2>8. References</h2><ul>" + res.references.map(function (r) { return "<li>" + e(r) + "</li>"; }).join("") + "</ul>");
    if (drawings && res.drawings.length) {
      out.push("<h2>9. Drawings</h2>");
      res.drawings.forEach(function (sh) { out.push("<div class='sheet'>" + DS.drawing.to_svg(sh, 1100) + "</div>"); });
    }
    if (co.firm) {
      out.push("<table style='margin-top:30px'><tr><th>Designed by</th><th>Checked by</th><th>Approved by</th></tr>" +
        "<tr><td style='height:50px'>" + e(g("designed_by")) + "</td><td>" + e(g("checked_by")) + "</td><td>" + e(g("approved_by")) + "</td></tr></table>");
    }
    out.push("<p class='muted'><i>" + e(Cc.DISCLAIMER) + "</i></p></body></html>");
    return out.join("\n");
  };

  /* ======================================================================= helpers */
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function b64(u8) {
    var s = "", i;
    for (i = 0; i + 2 < u8.length; i += 3) { var n = (u8[i] << 16) | (u8[i + 1] << 8) | u8[i + 2]; s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63]; }
    var rem = u8.length - i;
    if (rem === 1) { var a = u8[i] << 16; s += B64[a >> 18] + B64[(a >> 12) & 63] + "=="; }
    else if (rem === 2) { var b = (u8[i] << 16) | (u8[i + 1] << 8); s += B64[b >> 18] + B64[(b >> 12) & 63] + B64[(b >> 6) & 63] + "="; }
    return s;
  }
  M.svg_data_uri = function (svg) { return "data:image/svg+xml;base64," + b64(new TextEncoder().encode(svg)); };
})();
