/* Design Studio — diagnosis / sensitivity / fix suggestions (DS.diagnose).
   "Kaha galti hui hai aur kya parameter hona chahiye":
   1. limits(spec, vals, mode, ctx)  – inputs at their min / max or on the unsafe side of the load-guide value (no runs).
   2. job(spec, vals, mode, project, company, ctx) – a stepper: call .step() until it returns false (the UI does this in
      small chunks so the page stays responsive), then .result():
      • sens   – every input nudged down / up (±10 %, ints ±1, selects to the neighbouring option, bools toggled) and the
                 effect on status, max utilisation, failures, steel and concrete;
      • issues – every FAIL / WARN check (and checks above 90 % utilisation) with the inputs that help it, ranked, and
                 for the best few the value they need to reach (searched step by step) so the check passes. */
(function () {
  "use strict";
  var DS = window.DS = window.DS || {};
  var GIVEN = /Load|Wind|Soil|Mine dumper|Hydrology|Hydraulics|Traffic|Subgrade|Seismic|Site|Crane|Forces|Road|Quantity|My analysis/i;
  var LAYOUT = /^Geometry$|^Size$/i;
  var BARS = [6, 8, 10, 12, 16, 20, 25, 28, 32, 36, 40];
  var SKIP = /^(city|perm|style|title|name|notes?|vehicle|location|dumper_model|fill_disp)$/i;
  // which direction is the SAFE side for a value (used against the load-guide recommendation)
  var SAFE_DIR = { ll: 1, floor_ll: 1, dl: 1, floor_dl: 1, finish: 1, roof_ll: 1, roof_dl: 1, sheet_dl: 1, services: 1, wall_dl: 1, surcharge: 1,
    gamma: 1, soil_gamma: 1, k1: 1, cover: 1, fck: 1, Vb_custom: 1, barrier_load: 1, sbc: -1, phi: -1, mu: -1, mu_soil: -1, wc: -1 };
  var ALIAS = { soil_gamma: "gamma", mu_soil: "mu" };

  function C() { return DS.core; }
  function params(spec, mode, vals) { return spec.params.filter(function (p) { return p.modes.indexOf(mode) >= 0 && p.kind !== "text" && !SKIP.test(p.key) && !(vals && p.when && !p.when(vals)); }); }
  function cls(p) { return GIVEN.test(p.group || "") ? "given" : LAYOUT.test(p.group || "") ? "layout" : "choice"; }
  function clamp(p, x) { if (p.min != null && x < p.min) x = p.min; if (p.max != null && x > p.max) x = p.max; if (p.kind === "int") x = Math.round(x); return x; }
  function nice(x) { var a = Math.abs(x); if (a >= 100) return Math.round(x); if (a >= 10) return Math.round(x * 10) / 10; if (a >= 1) return Math.round(x * 100) / 100; return Math.round(x * 1000) / 1000; }
  /* k-th step from the original value in direction dir (+1 / −1); null if no such value */
  function stepVal(p, v0, dir, k) {
    if (p.kind === "bool") return k === 1 ? !v0 : null;
    if (p.kind === "select") { var i = p.options.map(String).indexOf(String(v0)); if (i < 0) return null; var j = i + dir * k; return j >= 0 && j < p.options.length ? p.options[j] : null; }
    var v = +v0; if (!isFinite(v)) return null;
    var x;
    if (/dia/i.test(p.key) && BARS.indexOf(v) >= 0) { var bi = BARS.indexOf(v) + dir * k; if (bi < 0 || bi >= BARS.length) return null; x = clamp(p, BARS[bi]); return x === v ? null : x; }
    if (p.kind === "int") x = v + dir * k;
    else if (v === 0) { if (dir < 0) return null; x = (p.step || (p.max != null && p.min != null ? (p.max - p.min) / 20 : 1)) * k; }
    else x = nice(v * (1 + dir * 0.1 * k));
    if (/(^|_)s$|spacing|pitch/i.test(p.key) && v >= 50) x = Math.round(x / 5) * 5;
    x = clamp(p, x);
    if (x <= 0 && v > 0) return null;
    return x === v ? null : x;
  }
  function key(s) { return s.section + "|" + s.label; }
  function metrics(res) {
    var c = res.calc, checks = {};
    c.steps.forEach(function (s) {
      if (s.status !== "PASS" && s.status !== "FAIL" && s.status !== "WARN") return;
      var u = s.utilisation != null && isFinite(s.utilisation) ? s.utilisation : (s.status === "PASS" ? null : (s.status === "FAIL" ? 9 : 1.05));
      var k = key(s), o = checks[k];
      if (!o || (u != null && (o.u == null || u > o.u)) || (s.status === "FAIL" && o.st !== "FAIL")) checks[k] = { u: u, st: s.status === "FAIL" || (o && o.st === "FAIL") ? "FAIL" : (s.status === "WARN" || (o && o.st === "WARN") ? "WARN" : "PASS"), value: s.value, clause: s.clause, label: s.label, section: s.section };
    });
    var steel = 0; res.bbs.forEach(function (b) { steel += b.weight || 0; });
    var conc = 0, sst = 0;
    res.quantities.forEach(function (q) { var u = String(q.unit || "").toLowerCase(); if (/^(cum|m3|m³|cu\.?m)$/.test(u) && /RCC|PCC|concrete/i.test(q.description)) conc += q.quantity; if (/^(kg|t|mt|tonne)$/.test(u) && /steel|purlin|plate|bolt/i.test(q.description) && !/reinforcement/i.test(q.description)) sst += (u === "kg" ? q.quantity : q.quantity * 1000); });
    return { status: res.status, util: c.max_utilisation, fails: c.failures.length, warns: c.warnings.length, steel: steel, conc: conc, sst: sst, checks: checks };
  }
  function fmtv(p, v) { return typeof v === "boolean" ? (v ? "Yes" : "No") : String(v) + (p.unit && typeof v === "number" ? " " + p.unit : ""); }

  var Dg = DS.diagnose = { metrics: metrics, stepVal: stepVal, cls: cls,
    CLS_LABEL: { choice: "Design choice (change freely)", layout: "Geometry (change if the layout permits)", given: "Load / site data (change only if the actual condition is different)" } };

  /* ---------------- limits & load-guide hints (no runs) ---------------- */
  Dg.limits = function (spec, vals, mode, ctx) {
    var out = [], site = ctx && ctx.site === "mine" ? "mine" : "general", LG = DS.loadguide && DS.loadguide.params;
    params(spec, mode, vals).forEach(function (p) {
      var v = vals[p.key];
      if (p.kind === "float" || p.kind === "int") {
        if (p.min != null && +v <= p.min && !(p.min === 0 && +v === 0)) out.push({ key: p.key, label: p.label, level: "warn", text: "At the minimum allowed (" + fmtv(p, p.min) + "). Lower values are not accepted; if a check fails, other inputs must compensate – see the diagnosis." });
        else if (p.max != null && +v >= p.max) out.push({ key: p.key, label: p.label, level: "warn", text: "At the maximum allowed (" + fmtv(p, p.max) + ")." });
      }
      var g = LG && (LG[p.key] || LG[ALIAS[p.key]]), r = g && g[site], dir = SAFE_DIR[p.key];
      if (r && dir && typeof r.value === "number" && typeof +v === "number" && isFinite(+v)) {
        if (dir > 0 && +v < r.value * 0.999) out.push({ key: p.key, label: p.label, level: site === "mine" ? "dan" : "warn", rec: r.value, text: "Below the usual " + (site === "mine" ? "mining-area" : "general") + " value " + fmtv(p, r.value) + " – unsafe side. " + r.note });
        if (dir < 0 && +v > r.value * 1.001) out.push({ key: p.key, label: p.label, level: site === "mine" ? "dan" : "warn", rec: r.value, text: "Above the usual " + (site === "mine" ? "mining-area" : "general") + " value " + fmtv(p, r.value) + " – unsafe side unless tested. " + r.note });
      } else if (r && typeof r.value === "string" && p.kind === "select" && p.key === "exposure") {
        var E = ["Mild", "Moderate", "Severe", "Very severe", "Extreme"];
        if (E.indexOf(String(v)) < E.indexOf(r.value)) out.push({ key: p.key, label: p.label, level: site === "mine" ? "dan" : "warn", rec: r.value, text: "Milder than the usual " + r.value + ". " + r.note });
      }
    });
    return out;
  };
  Dg.hint = function (key, ctx) {
    var LG = DS.loadguide && DS.loadguide.params, g = LG && (LG[key] || LG[ALIAS[key]]); if (!g) return null;
    var site = ctx && ctx.site === "mine" ? "mine" : "general"; return g[site] || g.general || null;
  };

  /* ---------------- sensitivity + fix search (stepper) ---------------- */
  Dg.job = function (spec, vals, mode, project, company, ctx, opts) {
    opts = opts || {};
    var run = function (v) { return metrics(C().run_module(spec, v, mode, project, company, ctx)); };
    var base = null, P = params(spec, mode, vals), queue = [], sens = [], issues = null, fixQ = [], done = false, total = 0, count = 0, maxSteps = opts.maxSteps || 6;
    P.forEach(function (p) { [-1, 1].forEach(function (d) { var x = stepVal(p, vals[p.key], d, 1); if (x !== null) queue.push({ p: p, dir: d, to: x }); }); });
    total = 1 + queue.length;
    function withV(p, x) { var v = Object.assign({}, vals); v[p.key] = x; return v; }
    function buildIssues() {
      issues = [];
      Object.keys(base.checks).forEach(function (k) {
        var b = base.checks[k]; if (!(b.st !== "PASS" || (b.u != null && b.u > 0.9))) return;
        var cands = [];
        sens.forEach(function (s) {
          [s.minus, s.plus].forEach(function (v, i) {
            if (!v) return; var a = v.m.checks[k]; if (!a) return;
            var gain = (b.u != null && a.u != null) ? b.u - a.u : 0; var fixed = b.st !== "PASS" && a.st === "PASS";
            if (gain > 2e-3 || fixed) cands.push({ s: s, dir: i ? 1 : -1, to: v.to, gain: gain + (fixed ? 1 : 0), after: a, newFails: v.m.fails });
          });
        });
        var rank = { choice: 0, layout: 1, given: 2 };
        cands.sort(function (x, y) { return (rank[x.s.cls] - rank[y.s.cls]) || (y.gain - x.gain); });
        // keep the best per parameter, best 6 overall but at least the top 2 of each class present
        var seen = {}, list = [];
        cands.forEach(function (c) { if (seen[c.s.key]) return; seen[c.s.key] = 1; list.push(c); });
        var byGain = list.slice().sort(function (x, y) { return y.gain - x.gain; });
        var pick = list.filter(function (c) { return c.s.cls !== "given"; }).slice(0, 4).concat(list.filter(function (c) { return c.s.cls === "given"; }).slice(0, 2));
        if (!pick.length) pick = byGain.slice(0, 4);
        var it = { key: k, label: b.label, section: b.section, value: b.value, clause: b.clause, st: b.st, u: b.u, fixes: pick.map(function (c) { return { key: c.s.key, label: c.s.label, unit: c.s.unit, cls: c.s.cls, from: c.s.from, dir: c.dir, to: c.to, u: c.after.u, st: c.after.st, newFails: c.newFails, searched: false }; }) };
        issues.push(it);
        if (it.st !== "PASS") it.fixes.forEach(function (f) { if (f.st !== "PASS") fixQ.push({ issue: it, fix: f, k: 2 }); });
      });
      issues.sort(function (a, b) { var o = { FAIL: 0, WARN: 1, PASS: 2 }; return (o[a.st] - o[b.st]) || ((b.u || 0) - (a.u || 0)); });
      total += fixQ.length * 3;
    }
    var J = {
      progress: function () { return Math.min(0.99, count / Math.max(1, total)); },
      step: function () {
        if (done) return false;
        count++;
        if (!base) { base = run(vals); return true; }
        if (queue.length) {
          var q = queue.shift(), p = q.p, m;
          try { m = run(withV(p, q.to)); } catch (e) { m = null; }
          var s = sens.filter(function (x) { return x.key === p.key; })[0];
          if (!s) { s = { key: p.key, label: p.label, unit: p.unit || "", group: p.group, cls: cls(p), kind: p.kind, from: vals[p.key], minus: null, plus: null }; sens.push(s); }
          if (m) s[q.dir < 0 ? "minus" : "plus"] = { to: q.to, m: m };
          return true;
        }
        if (!issues) { buildIssues(); return true; }
        if (fixQ.length) {
          var f = fixQ[0], p2 = spec.params.filter(function (x) { return x.key === f.fix.key; })[0], x = stepVal(p2, vals[p2.key], f.fix.dir, f.k);
          if (x === null || f.k > maxSteps) { f.fix.searched = true; fixQ.shift(); return true; }
          var m2; try { m2 = run(withV(p2, x)); } catch (e) { m2 = null; }
          var a = m2 && m2.checks[f.issue.key];
          if (a && (a.st === "PASS" || f.fix.u == null || a.u == null || a.u < f.fix.u)) { f.fix.to = x; f.fix.u = a.u; f.fix.st = a.st; f.fix.newFails = m2.fails; }
          if (!a || a.st === "PASS") { f.fix.searched = true; fixQ.shift(); } else f.k++;
          return true;
        }
        done = true; return false;
      },
      result: function () {
        return { base: base, sens: sens, issues: issues || [], done: done };
      }
    };
    return J;
  };
  Dg.runAll = function (spec, vals, mode, project, company, ctx, opts) { var j = Dg.job(spec, vals, mode, project, company, ctx, opts); var n = 0; while (j.step() && n++ < 5000) {} return j.result(); };

  /* plain-language effect of a nudge */
  Dg.effect = function (base, v) {
    if (!v) return "—";
    var m = v.m, t = [];
    if (m.status !== base.status) t.push(base.status + " → " + m.status);
    var du = m.util - base.util; if (Math.abs(du) >= 0.005) t.push("max util " + base.util.toFixed(2) + " → " + m.util.toFixed(2));
    if (m.fails !== base.fails) t.push((m.fails > base.fails ? "+" : "") + (m.fails - base.fails) + " failed check" + (Math.abs(m.fails - base.fails) > 1 ? "s" : ""));
    var ds = m.steel - base.steel; if (Math.abs(ds) >= 0.5 && Math.abs(ds) >= 0.005 * base.steel) t.push("rebar " + (ds > 0 ? "+" : "") + Math.round(ds) + " kg");
    var dss = m.sst - base.sst; if (Math.abs(dss) >= 1 && Math.abs(dss) >= 0.005 * base.sst) t.push("steel " + (dss > 0 ? "+" : "") + Math.round(dss) + " kg");
    var dc = m.conc - base.conc; if (Math.abs(dc) >= 0.005 && Math.abs(dc) >= 0.005 * base.conc) t.push("concrete " + (dc > 0 ? "+" : "") + dc.toFixed(2) + " m³");
    return t.length ? t.join(" · ") : "no change";
  };
})();
