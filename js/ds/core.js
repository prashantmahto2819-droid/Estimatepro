/* Design Studio — core (port of civilest/design/core.py).
   Transparent calculation recording: every number goes through Calc with its formula (a Python-style
   expression string, re-evaluable), the substituted variables, unit, IS / IRC clause and PASS / FAIL.
   Also: Python-compatible helpers (format specs, round, str) used by every ported module. */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var C = DS.core = {};

  /* ------------------------------------------------------------------ Python-compatible helpers */
  function isInt(v) { return typeof v === "number" && isFinite(v) && Math.floor(v) === v; }
  /* round half to even, as Python's round() */
  C.pyround = function (x, n) {
    if (typeof x !== "number" || !isFinite(x)) return x;
    n = n || 0;
    var m = Math.pow(10, n), y = x * m, f = Math.floor(y), d = y - f;
    var r = Math.abs(d - 0.5) < 1e-9 ? (f % 2 === 0 ? f : f + 1) : Math.round(y);
    if (Math.abs(d - 0.5) < 1e-9 && n >= 0 && n <= 30 && Math.abs(x) < 1e15) {
      // near a tie: decide from the exact decimal expansion of the double, as Python does (185.535 → 185.53, 0.0875 → 0.087)
      var a = Math.abs(x), s = a.toFixed(Math.min(100, n + 60)), dot = s.indexOf("."), rest = s.slice(dot + 1 + n);
      var base = +(s.slice(0, dot) + s.slice(dot + 1, dot + 1 + n));
      var up = /^50*$/.test(rest) ? base % 2 === 1 : rest[0] >= "5";
      r = (up ? base + 1 : base) * (x < 0 ? -1 : 1);
    }
    return n ? r / m : r;
  };
  function groupThousands(intStr) { return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function fixed(x, p) {
    var a = Math.abs(x), y = a * Math.pow(10, p);
    // exact tie only (y = a·10^p is rounded; e.g. 4.35*10 === 43.5 although 4.35 is really 4.3499…): check the exact decimal expansion
    if (p <= 6 && Number.isInteger(y * 2) && !Number.isInteger(y) && y < 1e15 && /^50*$/.test(a.toFixed(Math.min(100, p + 60)).split(".")[1].slice(p))) { var f = Math.floor(y), r = f % 2 === 0 ? f : f + 1; return (r / Math.pow(10, p)).toFixed(p); }
    return a.toFixed(p);
  }
  function expStr(x, p, upper) {
    var s = Math.abs(x).toExponential(p); var m = /^(.*)e([+-])(\d+)$/.exec(s);
    var e = m[3].length < 2 ? "0" + m[3] : m[3]; s = m[1] + (upper ? "E" : "e") + m[2] + e; return s;
  }
  function gStr(x, p, alt) {
    if (p === 0) p = 1; if (x === 0) return "0";
    var ex = Math.floor(Math.log10(Math.abs(x)));
    // use toExponential to get the exponent after rounding
    var t = Math.abs(x).toExponential(p - 1); ex = +t.split("e")[1];
    var s;
    if (ex >= -4 && ex < p) { s = Math.abs(x).toFixed(Math.max(0, p - 1 - ex)); if (!alt && s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, ""); }
    else { s = expStr(x, p - 1); if (!alt) s = s.replace(/\.?0+e/, "e"); }
    return s;
  }
  /* Python format(value, spec): [[fill]align][sign][,][.precision][type] */
  C.pyfmt = function (v, spec) {
    spec = spec || "";
    if (typeof v === "boolean") v = v ? 1 : 0;
    var m = /^(?:(.)?([<>^=]))?([+\- ])?(#)?(0)?(\d+)?(,)?(?:\.(\d+))?([bcdeEfFgGnosxX%])?$/.exec(spec);
    if (!m) return String(v);
    var fill = m[1] || (m[5] ? "0" : " "), align = m[2] || (m[5] ? "=" : null), sign = m[3] || "-", width = +(m[6] || 0), comma = !!m[7], prec = m[8] != null ? +m[8] : null, type = m[9] || "";
    var s;
    if (typeof v !== "number") { s = String(v); if (prec != null && type === "s") s = s.slice(0, prec); align = align || "<"; }
    else {
      var neg = v < 0 || (v === 0 && 1 / v < 0), a = Math.abs(v);
      if (!isFinite(v)) s = isNaN(v) ? "nan" : "inf";
      else if (type === "f" || type === "F") s = fixed(a, prec == null ? 6 : prec);
      else if (type === "e" || type === "E") s = expStr(a, prec == null ? 6 : prec, type === "E");
      else if (type === "g" || type === "G") s = gStr(a, prec == null ? 6 : prec, !!m[4]);
      else if (type === "%") s = fixed(a * 100, prec == null ? 6 : prec) + "%";
      else if (type === "d") s = String(Math.round(a));
      else if (type === "") { s = prec != null ? gStr(a, prec, false) : C.pystr(a); }
      else s = String(a);
      if (comma && /^\d/.test(s)) { var parts = s.split("."); parts[0] = groupThousands(parts[0]); s = parts.join("."); }
      var sg = neg && s !== "0" && !/^0(\.0*)?$/.test(s) ? "-" : (neg && type === "f" ? "-" : (sign === "+" ? "+" : sign === " " ? " " : ""));
      if (neg && /^0(\.0*)?$/.test(s) && (type === "f" || type === "F")) sg = "-";
      if (!neg && sign === "+") sg = "+";
      if (align === "=") { while ((sg + s).length < width) s = fill + s; return sg + s; }
      s = sg + s; align = align || ">";
    }
    if (s.length < width) {
      var pad = width - s.length;
      if (align === "<") s = s + Array(pad + 1).join(fill);
      else if (align === "^") s = Array(Math.floor(pad / 2) + 1).join(fill) + s + Array(Math.ceil(pad / 2) + 1).join(fill);
      else s = Array(pad + 1).join(fill) + s;
    }
    return s;
  };
  /* Python str() of a number: ints as "5", floats as repr ("5.0" cannot be told apart in JS → "5") */
  C.pystr = function (v) {
    if (v === true) return "True"; if (v === false) return "False"; if (v == null) return "None";
    if (typeof v !== "number") return String(v);
    if (!isFinite(v)) return isNaN(v) ? "nan" : (v > 0 ? "inf" : "-inf");
    if (isInt(v) && Math.abs(v) < 1e16) return String(v);
    var a = Math.abs(v);
    if (a >= 1e16 || a < 1e-4) { var s = v.toExponential(); s = s.replace(/e([+-])(\d)$/, "e$10$2"); return s; }
    return String(v);
  };
  C.isInt = isInt;
  C.sum = function (a) { return a.reduce(function (s, x) { return s + x; }, 0); };
  C.range = function (a, b, st) { if (b == null) { b = a; a = 0; } st = st || 1; var r = []; for (var i = a; st > 0 ? i < b : i > b; i += st) r.push(i); return r; };

  /* ------------------------------------------------------------------ safe Python-expression evaluator */
  var SAFE = {
    sqrt: Math.sqrt, pi: Math.PI, sin: Math.sin, cos: Math.cos, tan: Math.tan, atan: Math.atan, asin: Math.asin, acos: Math.acos,
    radians: function (d) { return d * Math.PI / 180; }, degrees: function (r) { return r * 180 / Math.PI; },
    log10: Math.log10, log: function (x, b) { return b == null ? Math.log(x) : Math.log(x) / Math.log(b); }, exp: Math.exp,
    min: function () { var a = arguments.length === 1 && Array.isArray(arguments[0]) ? arguments[0] : [].slice.call(arguments); return Math.min.apply(null, a); },
    max: function () { var a = arguments.length === 1 && Array.isArray(arguments[0]) ? arguments[0] : [].slice.call(arguments); return Math.max.apply(null, a); },
    abs: Math.abs, ceil: Math.ceil, floor: Math.floor, round: function (x, n) { return C.pyround(x, n); }, True: 1, False: 0
  };
  C.SAFE = SAFE;
  function tokenize(s) {
    var t = [], i = 0, re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z_0-9]*)|(\*\*|\/\/|<=|>=|==|!=|[-+*\/%()<>,]))/y;
    while (i < s.length) {
      if (/^\s*$/.test(s.slice(i))) break;
      re.lastIndex = i; var m = re.exec(s); if (!m) throw new Error("bad formula near '" + s.slice(i) + "'");
      if (m[1] != null) t.push({ k: "n", v: parseFloat(m[1]) }); else if (m[2] != null) t.push({ k: /^(if|else|and|or|not)$/.test(m[2]) ? m[2] : "id", v: m[2] }); else t.push({ k: m[3] });
      i = re.lastIndex;
    }
    return t;
  }
  var cache = {};
  C.compile = function (src) {
    if (cache[src]) return cache[src];
    var t = tokenize(src), p = 0;
    function peek(k) { return t[p] && t[p].k === k; }
    function eat(k) { if (!peek(k)) throw new Error("expected " + k + " in formula '" + src + "'"); return t[p++]; }
    function expr() { var a = orT(); if (peek("if")) { p++; var c = orT(); eat("else"); var b = expr(); return function (e) { return c(e) ? a(e) : b(e); }; } return a; }
    function orT() { var a = andT(); while (peek("or")) { p++; var b = andT(); a = (function (x, y) { return function (e) { var v = x(e); return v ? v : y(e); }; })(a, b); } return a; }
    function andT() { var a = notT(); while (peek("and")) { p++; var b = notT(); a = (function (x, y) { return function (e) { var v = x(e); return v ? y(e) : v; }; })(a, b); } return a; }
    function notT() { if (peek("not")) { p++; var a = notT(); return function (e) { return !a(e); }; } return cmp(); }
    function cmp() {
      var a = arith(), ops = [], rs = [];
      while (t[p] && /^(<|>|<=|>=|==|!=)$/.test(t[p].k)) { ops.push(t[p++].k); rs.push(arith()); }
      if (!ops.length) return a;
      return function (e) { var l = a(e); for (var i = 0; i < ops.length; i++) { var r = rs[i](e), o = ops[i]; var ok = o === "<" ? l < r : o === ">" ? l > r : o === "<=" ? l <= r : o === ">=" ? l >= r : o === "==" ? l === r : l !== r; if (!ok) return false; l = r; } return true; };
    }
    function arith() { var a = term(); while (peek("+") || peek("-")) { var o = t[p++].k, b = term(); a = (function (x, y, o) { return o === "+" ? function (e) { return x(e) + y(e); } : function (e) { return x(e) - y(e); }; })(a, b, o); } return a; }
    function term() {
      var a = factor();
      while (peek("*") || peek("/") || peek("//") || peek("%")) {
        var o = t[p++].k, b = factor();
        a = (function (x, y, o) {
          if (o === "*") return function (e) { return x(e) * y(e); };
          if (o === "/") return function (e) { var d = y(e); if (d === 0) throw new Error("division by zero"); return x(e) / d; };
          if (o === "//") return function (e) { return Math.floor(x(e) / y(e)); };
          return function (e) { var m = y(e); return ((x(e) % m) + m) % m; };
        })(a, b, o);
      }
      return a;
    }
    function factor() { if (peek("-")) { p++; var a = factor(); return function (e) { return -a(e); }; } if (peek("+")) { p++; return factor(); } return power(); }
    function power() { var a = atom(); if (peek("**")) { p++; var b = factor(); return function (e) { return Math.pow(a(e), b(e)); }; } return a; }
    function atom() {
      var k = t[p];
      if (!k) throw new Error("unexpected end of formula '" + src + "'");
      if (k.k === "n") { p++; return function () { return k.v; }; }
      if (k.k === "(") { p++; var a = expr(); eat(")"); return a; }
      if (k.k === "id") {
        p++; var name = k.v;
        if (peek("(")) {
          p++; var args = [];
          if (!peek(")")) { args.push(expr()); while (peek(",")) { p++; args.push(expr()); } }
          eat(")");
          return function (e) { var f = SAFE[name]; if (typeof f !== "function") throw new Error("unknown function '" + name + "'"); return f.apply(null, args.map(function (g) { return g(e); })); };
        }
        return function (e) { if (Object.prototype.hasOwnProperty.call(e, name)) { var v = e[name]; return typeof v === "boolean" ? (v ? 1 : 0) : v; } if (name in SAFE && typeof SAFE[name] !== "function") return SAFE[name]; throw new Error("unknown name '" + name + "' in formula"); };
      }
      throw new Error("unexpected '" + k.k + "' in formula '" + src + "'");
    }
    var f = expr(); if (p !== t.length) throw new Error("unexpected '" + (t[p].v || t[p].k) + "' in formula '" + src + "'");
    cache[src] = f; return f;
  };
  C.names = function (src) { return tokenize(src).filter(function (x) { return x.k === "id"; }).map(function (x) { return x.v; }); };
  C.safe_eval = function (expr, vars) {
    var f = C.compile(String(expr)); vars = vars || {};
    C.names(expr).forEach(function (n) { if (!(n in SAFE) && !(n in vars)) throw new Error("unknown name '" + n + "' in formula"); });
    var v = f(vars); return typeof v === "boolean" ? (v ? 1 : 0) : v;
  };

  /* fmt_num exactly as Python */
  C.fmt_num = function (v, sig) {
    sig = sig || 4;
    if (typeof v === "boolean") return v ? "True" : "False";
    if (typeof v !== "number") return String(v);
    if (isInt(v) && !v.__float) return Math.abs(v) >= 10000 ? C.pyfmt(v, ",") : String(v);
    if (v === 0) return "0";
    var a = Math.abs(v);
    if (a >= 1e5 || a < 1e-3) return C.pyfmt(v, ".3e");
    if (a >= 100) return a < 1e4 ? C.pyfmt(v, ",.1f") : C.pyfmt(v, ",.0f");
    return C.pyfmt(v, "." + sig + "g");
  };
  C.pretty = function (expr) { return expr.replace(/\*\*/g, "^").replace(/\*/g, "×").replace(/sqrt/g, "√"); };
  C.substitute = function (expr, vars) {
    return C.pretty(expr.replace(/\b([A-Za-z_][A-Za-z_0-9]*)\b/g, function (m, n) { return Object.prototype.hasOwnProperty.call(vars, n) && typeof vars[n] !== "function" ? C.fmt_num(vars[n]) : n; }));
  };

  /* ------------------------------------------------------------------ records */
  function Step(section, label, symbol, expr, variables, value, unit, clause, status, note, utilisation) {
    this.section = section; this.label = label; this.symbol = symbol; this.expr = expr || ""; this.variables = variables || {};
    this.value = value; this.unit = unit || ""; this.clause = clause || ""; this.status = status || ""; this.note = note || "";
    this.utilisation = utilisation == null ? null : utilisation;
  }
  Object.defineProperty(Step.prototype, "formula", { get: function () { return this.expr ? C.pretty(this.expr) : ""; } });
  Object.defineProperty(Step.prototype, "substituted", { get: function () { return this.expr ? C.substitute(this.expr, this.variables) : ""; } });
  C.Step = Step;

  /* opts: {unit, clause, note}. Positional strings are also accepted: calc(label, sym, expr, unit, clause, note, vars) */
  function O(a, b, c) { if (a && typeof a === "object") return a; return { unit: a, clause: b, note: c }; }

  function Calc(title) { this.title = title; this.steps = []; this.missing = []; this.thumbs = []; this._section = "General"; }
  Calc.prototype.section = function (name) { this._section = name; };
  /* let(label, symbol, value, unit|opts, clause, note) */
  Calc.prototype.let = function (label, symbol, value, unit, clause, note) {
    var o = O(unit, clause, note); this.steps.push(new Step(this._section, label, symbol, "", {}, value, o.unit, o.clause, "", o.note)); return value;
  };
  /* calc(label, symbol, expr, unit|opts, clause, note, vars)  — vars is always the last object argument */
  Calc.prototype.calc = function (label, symbol, expr) {
    var a = [].slice.call(arguments, 3), vars = {}, o;
    if (a.length && a[a.length - 1] && typeof a[a.length - 1] === "object" && !Array.isArray(a[a.length - 1])) vars = a.pop();
    if (a.length === 1 && a[0] && typeof a[0] === "object") o = a[0]; else o = { unit: a[0], clause: a[1], note: a[2] };
    if (vars && (vars.unit !== undefined || vars.clause !== undefined) && vars.vars) { o = vars; vars = vars.vars; }
    var val = C.safe_eval(expr, vars);
    this.steps.push(new Step(this._section, label, symbol, expr, Object.assign({}, vars), val, o.unit, o.clause, "", o.note)); return val;
  };
  /* check(label, demand, capacity, {unit, clause, mode, note, symbol}) */
  Calc.prototype.check = function (label, demand, capacity, opts) {
    opts = opts || {}; var mode = opts.mode || "<=", ok, util;
    if (mode === "<=") { ok = demand <= capacity * (1 + 1e-9); util = capacity ? demand / capacity : Infinity; }
    else { ok = demand >= capacity * (1 - 1e-9); util = demand ? capacity / demand : Infinity; }
    var txt = (C.fmt_num(demand) + " " + mode + " " + C.fmt_num(capacity) + " " + (opts.unit || "")).trim();
    this.steps.push(new Step(this._section, label, opts.symbol || "check", "", {}, txt, "", opts.clause, ok ? "PASS" : "FAIL", opts.note, util));
    return ok;
  };
  /* ok(label, condition, {detail, clause, warn_only}) */
  Calc.prototype.ok = function (label, condition, opts) {
    opts = opts || {}; var st = condition ? "PASS" : (opts.warn_only ? "WARN" : "FAIL");
    this.steps.push(new Step(this._section, label, "check", "", {}, opts.detail || "", "", opts.clause, st)); return !!condition;
  };
  Calc.prototype.info = function (label, text, clause) { this.steps.push(new Step(this._section, label, "", "", {}, text, "", clause, "INFO")); };
  Calc.prototype.warn = function (label, text, clause) { this.steps.push(new Step(this._section, label, "", "", {}, text, "", clause, "WARN")); };
  Calc.prototype.miss = function (text, clause, severity) { this.missing.push({ severity: severity || "Important", text: text, clause: clause || "" }); };
  Calc.prototype.thumb = function (item, thumb_value, design_value, unit, rule, source) {
    this.thumbs.push({ item: item, thumb_value: thumb_value, design_value: design_value, unit: unit, rule: rule, source: source || "",
      get diff_pct() { return this.design_value ? (this.thumb_value - this.design_value) / this.design_value * 100 : null; } });
  };
  Object.defineProperty(Calc.prototype, "failures", { get: function () { return this.steps.filter(function (s) { return s.status === "FAIL"; }); } });
  Object.defineProperty(Calc.prototype, "warnings", { get: function () { return this.steps.filter(function (s) { return s.status === "WARN"; }); } });
  Object.defineProperty(Calc.prototype, "max_utilisation", { get: function () { var u = this.steps.map(function (s) { return s.utilisation; }).filter(function (x) { return x != null && isFinite(x); }); return u.length ? Math.max.apply(null, u) : 0; } });
  C.Calc = Calc;

  /* ------------------------------------------------------------------ outputs */
  C.QtyItem = function (o) {
    var q = { description: o.description, unit: o.unit, rows: o.rows || [], link: o.link || null, rate: o.rate || 0, note: o.note || "" };
    Object.defineProperty(q, "quantity", { enumerable: false, get: function () {
      var tot = 0; this.rows.forEach(function (r) { var vals = ["nos", "length", "breadth", "depth"].map(function (k) { return r[k]; }).filter(function (v) { return v !== undefined && v !== null && v !== ""; }); if (vals.length) tot += (r.deduction ? -1 : 1) * vals.reduce(function (a, b) { return a * b; }, 1); }); return tot; } });
    return q;
  };
  C.bar_weight = function (dia) { return dia * dia / 162.0; };
  C.BBSRow = function (o) {
    var b = { member: o.member, mark: o.mark, dia: o.dia, shape: o.shape, nos: o.nos, cut_length: o.cut_length, note: o.note || "" };
    Object.defineProperty(b, "total_length", { enumerable: false, get: function () { return this.nos * this.cut_length; } });
    Object.defineProperty(b, "weight", { enumerable: false, get: function () { return this.total_length * C.bar_weight(this.dia); } });
    return b;
  };
  /* pandas.DataFrame replacement: {columns, rows} */
  C.table = function (data, columns) {
    if (Array.isArray(data)) {
      if (data.length && !Array.isArray(data[0]) && typeof data[0] === "object") { var cols = columns || Object.keys(data[0]); return { columns: cols, rows: data.map(function (r) { return cols.map(function (c) { return r[c]; }); }) }; }
      return { columns: columns || [], rows: data.map(function (r) { return r.slice(); }) };
    }
    var keys = Object.keys(data), n = keys.length ? data[keys[0]].length : 0, rows = [];
    for (var i = 0; i < n; i++) rows.push(keys.map(function (k) { return data[k][i]; }));
    return { columns: keys, rows: rows };
  };
  C.DesignResult = function (o) {
    var r = { module: o.module, title: o.title, inputs: o.inputs || {}, calc: o.calc, summary: o.summary || {}, drawings: o.drawings || [], quantities: o.quantities || [], bbs: o.bbs || [], tables: o.tables || {}, references: o.references || [] };
    Object.defineProperty(r, "status", { enumerable: false, get: function () {
      if (this.calc.failures.length) return "FAIL";
      if (this.calc.warnings.length || this.calc.missing.some(function (m) { return m.severity === "Critical"; })) return "CHECK";
      return "PASS"; } });
    return r;
  };

  /* ------------------------------------------------------------------ registry */
  C.Param = function (o) {
    return Object.assign({ unit: "", kind: "float", options: null, min: null, max: null, step: null, help: "", group: "Inputs", modes: ["design", "check", "thumb"] }, o);
  };
  C.MODULES = {};
  /* bayList("1,3" | "1-2" | "2 to 4" | "", nBays) → sorted 0-based bay indices, or null for "all bays" (blank / "all") */
  C.bayList = function (txt, nb) {
    var t = String(txt == null ? "" : txt).trim().toLowerCase();
    if (!t || t === "all") return null;
    var out = {};
    t.replace(/to/g, "-").split(/[,;\s]+/).forEach(function (tok) {
      var m = tok.match(/^(\d+)(?:-(\d+))?$/); if (!m) return;
      var a = +m[1], b = m[2] ? +m[2] : a; if (a > b) { var x = a; a = b; b = x; }
      for (var i = a; i <= b; i++) if (i >= 1 && i <= nb) out[i - 1] = true;
    });
    return Object.keys(out).map(Number).sort(function (a, b) { return a - b; });
  };

  /* floor inside / under a shed: shared inputs and quantity items (filling, PCC 1:2:4 floor, finish, PCC apron) */
  C.floorParams = function (group) {
    var g = group || "Floor & sides", P = function (k, l, d, u, o) { return C.Param(Object.assign({ key: k, label: l, "default": d, unit: u || "", group: g }, o || {})); };
    return [P("floor_pcc", "Floor: PCC 1:2:4 thickness (0 = none; pavers / CC flooring: choose under “Along with the design”)", 0, "mm", { min: 0, max: 200, step: 25 }),
      P("fill_type", "Filling under the floor", "Excavated earth (CPWD 2.25)", "", { kind: "select", options: ["Excavated earth (CPWD 2.25)", "Brought local earth incl. royalty (CPWD 2.25(a))", "Sand (CPWD 2.27)"] }),
      P("fill_t", "Filling thickness (0 = none)", 200, "mm", { min: 0, max: 1500, step: 25 }),
      P("floor_finish", "Floor finish", "None (PCC only)", "", { kind: "select", options: ["None (PCC only)", "Neat cement punning", "CC flooring 1:2:4, 40 mm with neat cement finish"] }),
      P("apron_w", "PCC apron around (0 = none)", 0, "m", { min: 0, max: 2, step: 0.15 })];
  };
  C.floorQty = function (Q, row, inp, W, L) {
    /* the "Along with the design" floor (x_floor: pavers, CC flooring …) and plinth protection, when chosen, replace the PCC floor / apron here; the filling applies to either */
    var xf = inp.x_floor && inp.x_floor !== "None", q = [], B = "CPWD_DSR_2021", t = Number(inp.floor_pcc) || 0, ft = Number(inp.fill_t) || 0, ty = String(inp.fill_type || ""), ff = String(inp.floor_finish || ""), ap = Number(inp.apron_w) || 0;
    if (inp.x_plinth) ap = 0;
    if ((t > 0 || xf) && ft > 0) q.push(Q((/Sand/.test(ty) ? "Sand filling" : /brought/i.test(ty) ? "Filling with brought local earth (incl. royalty)" : "Filling with available excavated earth") + " under floor, " + ft + " mm, in layers, rammed & watered", "cum", [row("Floor area", 1, W, L, ft / 1000)], [B, /Sand/.test(ty) ? "2.27" : /brought/i.test(ty) ? "2.25(a)" : "2.25"]));
    if (xf) return q.concat(ap > 0 ? [Q("PCC 1:4:8 apron " + ap + " m wide, 75 mm, around", "cum", [row("Perimeter", 1, 2 * (W + L) + 4 * ap, ap, 0.075)], [B, "4.1.8"])] : []);
    if (t > 0) q.push(Q("PCC 1:2:4 floor " + t + " mm thick", "cum", [row("Floor (width × length)", 1, W, L, t / 1000)], [B, "4.1.3"]));
    if (t > 0 && /punning/i.test(ff)) q.push(Q("Neat cement punning on floor", "sqm", [row("Floor", 1, W, L)], [B, "13.18"]));
    if (t > 0 && /40 mm/.test(ff)) q.push(Q("Cement concrete flooring 1:2:4, 40 mm, floating coat of neat cement", "sqm", [row("Floor", 1, W, L)], [B, "11.3.1"]));
    if (ap > 0) q.push(Q("PCC 1:4:8 apron " + ap + " m wide, 75 mm, around", "cum", [row("Perimeter", 1, 2 * (W + L) + 4 * ap, ap, 0.075)], [B, "4.1.8"]));
    return q;
  };

  C.register = function (spec) {
    spec = Object.assign({ references: [], modes: ["design", "check", "thumb"] }, spec);
    /* "free" design: the user's own dimensions (check-mode inputs), bars / sections sized by the app, other checks as suggestions */
    if (spec.modes.indexOf("check") >= 0 && spec.modes.indexOf("free") < 0 && spec.params.some(function (p) { return p.modes.indexOf("check") >= 0 && p.modes.indexOf("design") < 0; })) {
      spec.modes = spec.modes.concat(["free"]);
      spec.params = spec.params.map(function (p) { return p.modes.indexOf("check") >= 0 && p.modes.indexOf("free") < 0 ? Object.assign({}, p, { modes: p.modes.concat(["free"]) }) : p; });
    }
    spec.defaults = function () { var d = {}; spec.params.forEach(function (p) { d[p.key] = p.default; }); return d; };
    C.MODULES[spec.id] = spec; return spec;
  };
  C.MODE_LABEL = { design: "Design (app sizes the member)", check: "Check my design (I give sizes / steel)", thumb: "Thumb rule sizing, then code check",
    free: "Free / custom design – your dimensions; the app sizes bars & sections for them; other checks shown only as suggestions" };

  var STD_NOTES = {
    "IS 456": ["Designed as per IS 456:2000 (limit state) and detailed as per SP 34; ductile detailing to IS 13920 where applicable.",
      "Laps (IS 456 cl 26.2.5.1): tension max(Ld, 30φ), compression max(Ld, 24φ), direct tension (hoops / ties) 2Ld – values in the BBS; laps staggered, not more than 50 % at a section. Ld as per IS 456 cl 26.2.1.",
      "All dimensions in mm and levels in m unless noted otherwise. Do not scale the drawing."],
    "IS 800": ["Designed as per IS 800:2007 (limit state); steel to IS 2062, bolts to IS 1367 (gr 4.6 / 8.8 as noted).",
      "All welds 6 mm continuous fillet unless noted; electrodes to IS 814.",
      "Surface preparation SA 2.5, one coat zinc-rich primer + two coats enamel / PU paint.",
      "All dimensions in mm unless noted otherwise. Do not scale the drawing."],
    "IRC": ["Designed as per IRC 6:2017 (loads) and IRC 112:2020 (concrete) / IRC SP-13 for culverts.",
      "HFL, LWL, bed level and chainage to be filled from hydraulic / survey data before issue.",
      "Lap length 50Ø staggered; all dimensions in mm and levels in m unless noted."]
  };
  C.STD_NOTES = STD_NOTES;

  /* BBS drawing sheet(s): schedule with the cut-length formula of every row, abstract by diameter and total */
  C.bbs_sheets = function (result) {
    var D = DS.drawing;
    result.drawings = result.drawings.filter(function (sh) { return sh.number.indexOf("BBS") !== 0; });
    if (!result.bbs.length) return;
      var rows = result.bbs.map(function (b) { return [b.member, b.mark, C.pyfmt(b.dia, "g"), b.shape, b.nos, C.pyfmt(b.cut_length, ".3f"), C.pyfmt(b.total_length, ".1f"), C.pyfmt(b.weight, ".1f"), b.formula || ""]; });
      var tot = C.sum(result.bbs.map(function (b) { return b.weight; }));
      // abstract by diameter (for ordering steel)
      var byd = {}; result.bbs.forEach(function (b) { var k = +b.dia; byd[k] = byd[k] || { L: 0, W: 0 }; byd[k].L += b.total_length; byd[k].W += b.weight; });
      Object.keys(byd).map(Number).sort(function (a, b) { return a - b; }).forEach(function (k) { rows.push(["Abstract", "", C.pyfmt(k, "g"), "all bars " + C.pyfmt(k, "g") + "Ø", "", "", C.pyfmt(byd[k].L, ".1f"), C.pyfmt(byd[k].W, ".1f"), "kg/m = " + C.pyfmt(k * k / 162, ".3f")]); });
      rows.push(["TOTAL", "", "", "", "", "", "", C.pyfmt(tot, ",.1f"), "= " + C.pyfmt(tot / 1000, ".3f") + " t"]);
      for (var k = 0; k < rows.length; k += 26) {
        result.drawings.push(new D.Sheet("Bar bending schedule – " + result.title, "BBS-" + C.pyfmt(Math.floor(k / 26) + 1, "02d"),
          [D.table_view("Bar bending schedule (BBS)", ["Member", "Mark", "Dia", "Shape", "Nos", "Cut m", "Total m", "Wt kg", "How the cut length is found"], rows.slice(k, k + 26), [26, 10, 8, 38, 11, 13, 14, 15, 94], { text_h: 1.8, row_h: 6.0, char_w: 0.82 })],
          ["Cut length = out-to-out segments − bend deductions (45° 1d, 90° 2d, 135° 3d) + hooks (180° 9d; stirrup 135° hook max(10d, 75 mm)) – IS 2502 / SP 34.",
            "Laps max(Ld, 30φ) (IS 456 cl 26.2.5.1) where a bar is longer than the 12 m stock length; Ld = 0.87 fy φ / (4 τbd).",
            "Weight = d²/162 kg/m. Cut lengths exclude wastage (add 3–5 % when ordering).", "Bar shapes as per IS 2502 / SP 34."]));
      }
    var ref = result.drawings.filter(function (sh) { return sh.number.indexOf("BBS") !== 0; })[0];
    if (ref) result.drawings.forEach(function (sh) { if (sh.number.indexOf("BBS") === 0) { if (ref.project) sh.project = ref.project; if (ref.company) sh.company = Object.assign({}, ref.company); if (ref.drawn_by) sh.drawn_by = ref.drawn_by; } });
    var ed = result.bbs.filter(function (b) { return b.edited; }).length;
    if (ed) result.drawings.filter(function (sh) { return sh.number.indexOf("BBS") === 0; }).forEach(function (sh) { sh.notes.push(ed + " row(s) edited by the user – marked \"edited\" in the last column."); });
  };
  C.finalize = function (result, project, company) {
    var refs = result.references.join(" "), extra = [];
    if (refs.indexOf("IS 800") >= 0) extra = extra.concat(STD_NOTES["IS 800"]);
    if (refs.indexOf("IRC 6") >= 0 || refs.indexOf("IRC 112") >= 0) extra = extra.concat(STD_NOTES.IRC);
    if (refs.indexOf("IS 456") >= 0 && refs.indexOf("IRC 6") < 0 && refs.indexOf("IS 800") < 0) extra = extra.concat(STD_NOTES["IS 456"]);
    else if (refs.indexOf("IS 456") >= 0 && refs.indexOf("IS 800") >= 0) extra.push(STD_NOTES["IS 456"][1]);
    var D = DS.drawing;
    if (result.bbs.length && !result.drawings.some(function (sh) { return sh.number.indexOf("BBS") === 0; })) C.bbs_sheets(result);
    result.drawings.forEach(function (sh) {
      var have = sh.notes.join(" ").toUpperCase();
      extra.forEach(function (n) {
        var key = n.slice(0, 22).toUpperCase();
        if (have.indexOf(key) >= 0 || (n.toUpperCase().indexOf("ALL DIMENSIONS") >= 0 && have.indexOf("ALL DIMENSIONS") >= 0)) return;
        if (n.toUpperCase().indexOf("WELDS") >= 0 && have.indexOf("WELDS") >= 0) return;
        if (sh.number.indexOf("BBS") !== 0) { have += " " + n.toUpperCase(); sh.notes.push(n); }
      });
      if (project) sh.project = project;
      if (company) sh.company = Object.assign({}, company);
    });
    return result;
  };
  C.inputs_with_defaults = function (spec, given) { var v = spec.defaults(); Object.keys(given || {}).forEach(function (k) { if (k in v && given[k] != null) v[k] = given[k]; }); return v; };
  /* Run context — read by modules / detailing rules / site checks:
     site:   "general" | "mine" (mining area: blasting, heavy dumpers, aggressive water, disturbed ground)
     detail: "practice" (IS 13920 / SP 34 / CPWD practice minimum bar sizes — default) | "code" (bare IS 456 minimums) */
  C.CTX_DEFAULT = { site: "general", detail: "practice" };
  C.ctx = Object.assign({}, C.CTX_DEFAULT);
  /* validate_inputs(spec, inputs, mode) → list of messages (empty = OK). Numeric inputs used in this mode must be finite;
     a dimension / load declared positive (min > 0) must be > 0, and no input declared with min ≥ 0 may be negative.
     run_module throws the joined messages; the Design Studio shows them in its "could not be completed" panel. */
  C.validate_inputs = function (spec, inputs, mode) {
    var bad = [], md = spec.modes.indexOf(mode) >= 0 ? mode : spec.modes[0];
    spec.params.forEach(function (p) {
      if (!inputs || !(p.key in inputs) || inputs[p.key] == null || inputs[p.key] === "") return;
      if (p.options || p.kind === "text" || p.kind === "bool" || typeof p.default !== "number" || p.modes.indexOf(md) < 0) return;
      var v = Number(inputs[p.key]), nm = p.label + (p.unit ? " (" + p.unit + ")" : "");
      if (!isFinite(v)) bad.push(nm + " must be a number");
      else if (p.min != null && p.min > 0 && v <= 0) bad.push(nm + " must be greater than 0 (minimum " + C.pystr(p.min) + ")");
      else if (p.min != null && p.min >= 0 && v < 0) bad.push(nm + " cannot be negative");
    });
    return bad;
  };
  C.run_module = function (spec, inputs, mode, project, company, ctx) {
    var bad = C.validate_inputs(spec, inputs, mode);
    if (bad.length) { var ve = new Error("Please correct the inputs – " + bad.join("; ") + "."); ve.validation = bad; throw ve; }
    C.ctx = Object.assign({}, C.CTX_DEFAULT, ctx || {});
    if (DS.site && DS.site.before) inputs = DS.site.before(spec, Object.assign({}, inputs || {}), mode, C.ctx);
    if (DS.bbs && DS.bbs.setCfg) DS.bbs.setCfg(C.ctx.bbs_cfg || {});
    var res = C.run_module0(spec, inputs, mode, project, company);
    if (DS.site && DS.site.after) DS.site.after(spec, res, mode, C.ctx);
    if (C.ctx.bbs_edits && res.bbs && res.bbs.length) C.apply_bbs_edits(res, C.ctx.bbs_edits);
    if (DS.bbs && DS.bbs.changed && DS.bbs.changed().length && res.bbs.length)
      res.calc.info("BBS rules changed by the user", DS.bbs.changed().map(function (k) { return k + " = " + DS.bbs.cfg[k] + " (IS / SP 34 default " + DS.bbs.DEFAULTS[k] + ")"; }).join("; "), "BBS settings");
    return res;
  };
  /* user edits of BBS rows {mark: {nos, cut, dia}} – the row, the rebar quantity rows built from it and the BBS sheet follow */
  C.apply_bbs_edits = function (res, edits) {
    var n = 0;
    res.bbs.forEach(function (b) {
      var e = edits[b.mark]; if (!e) return;
      var o = { nos: b.nos, cut: b.cut_length, dia: b.dia }, key0 = b.member + " " + b.mark + " " + C.pyfmt(b.dia, "g") + "Ø";
      if (e.nos != null && isFinite(+e.nos) && +e.nos >= 0) b.nos = Math.round(+e.nos);
      if (e.cut != null && isFinite(+e.cut) && +e.cut > 0) b.cut_length = Math.round(+e.cut * 1000) / 1000;
      if (e.dia != null && isFinite(+e.dia) && +e.dia > 0) b.dia = +e.dia;
      if (b.nos === o.nos && b.cut_length === o.cut && b.dia === o.dia) return;
      b.edited = true; b.app = o; n++;
      b.formula = "edited by user (app: " + o.nos + " nos × " + C.pyfmt(o.cut, ".3f") + " m, " + C.pyfmt(o.dia, "g") + "Ø) – " + (b.formula || "");
      res.quantities.forEach(function (q) {
        q.rows.forEach(function (r) {
          if (String(r.description || "").indexOf(key0) < 0 || String(r.description).indexOf("(Nos × L m × kg/m)") < 0) return;
          r.description = r.description.replace(key0, b.member + " " + b.mark + " " + C.pyfmt(b.dia, "g") + "Ø");
          r.nos = b.nos; r.length = b.cut_length; r.breadth = Math.round(b.dia * b.dia / 162 * 1000) / 1000;
        });
      });
    });
    if (n) { C.bbs_sheets(res); res.summary["BBS"] = n + " row(s) edited by the user"; }
    return n;
  };
  C.run_module0 = function (spec, inputs, mode, project, company) {
    var vals = C.inputs_with_defaults(spec, inputs); mode = spec.modes.indexOf(mode) >= 0 ? mode : spec.modes[0];
    if (mode === "free") return C.finalize(C.run_free(spec, vals), project || "", company || null);
    return C.finalize(spec.run(vals, mode), project || "", company || null);
  };
  /* ---------- free / custom design ----------
     Runs the module in check mode with the user's dimensions; reinforcement / section inputs of the "My design" group are adjusted
     step by step (spacing ↓, then bar dia / section ↑, then number of bars ↑) only for the member whose steel / strength check fails.
     Remaining failures become suggestions (WARN); seismic / ductile-detailing steps are reported as skipped. */
  C.FREE_SKIP = /seism|earthquake|IS 1893|IS 13920|ductil/i;
  var FREE_STEEL = /steel|bars?\b|crack|reinforc|bending|moment|shear|deflection|tension|capacity|interaction|bolt|anchor|weld|span \/ eff|Ld\b|development|compression|buckling|combined|torsion/i;
  var FREE_ADJ = /\bdia\b|diameter|spacing|\bbars?\b|no\. of|section|bolt|stirrup|link|tie/i;
  var STOP = { bar: 1, bars: 1, dia: 1, diameter: 1, spacing: 1, main: 1, section: 1, check: 1, each: 1, face: 1, faces: 1, both: 1, number: 1, of: 1, nos: 1, mm: 1, the: 1, and: 1, top: 0, bottom: 0, my: 1, size: 1 };
  function freeAdjustable(spec) {
    return spec.params.filter(function (p) { return p.modes.indexOf("check") >= 0 && p.modes.indexOf("design") < 0 && FREE_ADJ.test(p.label) && p.kind !== "text"; }).map(function (p) {
      var base = String(p.label).toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z ]/g, " ");
      var kw = base.split(/\s+/).filter(function (w) { return w.length >= 3 && !STOP[w]; });
      var kind = /spacing/i.test(p.label) ? "s" : (p.kind === "int" ? "n" : (p.options && p.options.length && typeof p.options[0] !== "number" && isNaN(Number(p.options[0]))) ? "sec" : "d");
      return { p: p, kw: kw, kind: kind };
    });
  }
  C.free_adjustable = freeAdjustable;
  C.run_free = function (spec, vals) {
    var adj = freeAdjustable(spec), v = Object.assign({}, vals), r = null, done = {}, nchg = {}, best = null;
    function nFail(res) { return res.calc.failures.filter(function (s) { return FREE_STEEL.test(s.label) && !C.FREE_SKIP.test(s.section + " " + s.label); }).length; }
    for (var it = 0; it < 60; it++) {
      r = spec.run(v, "check");
      var fails = r.calc.failures.filter(function (s) { return FREE_STEEL.test(s.label) && !C.FREE_SKIP.test(s.section + " " + s.label); });
      if (!best || fails.length < best.n) best = { n: fails.length, v: Object.assign({}, v), done: JSON.parse(JSON.stringify(done)) };
      if (!fails.length || !adj.length) break;
      var txt = fails.map(function (s) { return (s.section + " " + s.label).toLowerCase(); });
      var hit = adj.filter(function (a) { return !a.kw.length || a.kw.some(function (w) { return txt.some(function (t) { return t.indexOf(w) >= 0; }); }); });
      if (!hit.length) hit = adj;
      // per member keyword group: one step – spacing first, then dia / section, then count
      var groups = {}, changed = false;
      hit.forEach(function (a) { var g = a.kw.join(" ") || "*"; (groups[g] = groups[g] || []).push(a); });
      Object.keys(groups).forEach(function (g) {
        var order = ["s", "d", "sec", "n"], list = groups[g].slice().sort(function (x, y) { return order.indexOf(x.kind) - order.indexOf(y.kind); });
        for (var i = 0; i < list.length; i++) {
          var a = list[i], p = a.p, cur = v[p.key], nv = cur;
          if (a.kind === "s") { var mn = Math.max(p.min != null ? p.min : 75, 75); nv = Math.max(mn, Number(cur) - 25); if (nv >= Number(cur)) continue; }
          else if (a.kind === "d" && p.options) { var opts = p.options.map(Number).filter(function (x) { return x > Number(cur); }).sort(function (x, y) { return x - y; }); if (!opts.length) continue; nv = opts[0];
            list.forEach(function (b) { if (b.kind === "s") v[b.p.key] = Math.min(Number(b.p.max || 200), Math.max(Number(v[b.p.key]), 150)); }); }
          else if (a.kind === "d") { nv = Number(cur) + (p.step || 2); if (p.max != null && nv > p.max) continue; }
          else if (a.kind === "sec") { var ix = p.options.indexOf(cur); if (ix < 0 || ix >= p.options.length - 1) continue; nv = p.options[ix + 1]; }
          else if (a.kind === "n") { nv = Number(cur) + 1; if (p.max != null && nv > p.max) continue; }
          if ((nchg[p.key] || 0) >= (a.kind === "sec" ? 6 : 10)) continue;
          nchg[p.key] = (nchg[p.key] || 0) + 1; v[p.key] = nv; changed = true; done[p.key] = [vals[p.key], nv, p.label]; break;
        }
      });
      if (!changed) break;
    }
    if (best && nFail(r) > best.n) { v = best.v; done = best.done; r = spec.run(v, "check"); }
    // remaining failures → suggestions; seismic skipped
    var c = r.calc;
    c.steps.forEach(function (s) {
      if (C.FREE_SKIP.test(s.section + " " + s.label)) { if (s.status) { s.status = "INFO"; s.note = (s.note ? s.note + "; " : "") + "skipped in free design – check separately if the site needs it"; } return; }
      if (s.status === "FAIL") { s.status = "WARN"; s.label = "Suggestion – " + s.label; }
    });
    var ch = Object.keys(done).map(function (k) { return done[k][2].replace(/\s*\(check[^)]*\)/i, "") + ": " + C.pystr(done[k][0]) + " → " + C.pystr(done[k][1]); });
    c.steps.unshift(new Step("Free design", "Free / custom design", "", "", {}, "Your dimensions are used as given. " + (ch.length ? "Bars / sections changed by the app so that the steel & strength checks pass: " + ch.join("; ") + "." : "Your bars / sections already pass the steel & strength checks.") +
      " Other code checks are shown as suggestions (orange) and do not block the design or the drawings; seismic / ductile detailing is skipped.", "", "", "INFO"));
    r.inputs = v; r.free = { changes: done };
    if (r.summary) r.summary["Free design"] = ch.length ? ch.join("; ") : "your bars / sections kept";
    return r;
  };
  C.ceil_to = function (x, step) { return Math.ceil(x / step - 1e-9) * step; };
  C.floor_to = function (x, step) { return Math.floor(x / step + 1e-9) * step; };
  C.interp = function (x, xs, ys) {
    if (x <= xs[0]) return ys[0]; if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    for (var i = 1; i < xs.length; i++) if (x <= xs[i]) { var t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]); return ys[i - 1] + t * (ys[i] - ys[i - 1]); }
    return ys[ys.length - 1];
  };
  C.DISCLAIMER = "Design aid only. Results must be checked and signed by a qualified structural engineer. Code clause numbers refer to the editions named; keep licensed copies of IS / IRC codes.";
})();
