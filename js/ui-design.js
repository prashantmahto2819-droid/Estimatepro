/* Estimate Pro — Design Studio tab: 30 structural design modules (steel sheds, drains / culverts / retaining
   walls / tank / pavement, RCC elements, bridges & frames) in Design / Check-my-design / Thumb-rule modes,
   transparent calculation with formula checker, missing-items list, drawings (PDF / DXF / SVG), BBS,
   Excel calculation workbook, quantities → estimate, drawing review and code references.
   The engine (js/ds/*.js) is a verified port of the CivilEst Pro Python Design Studio; it loads on first use. */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc, inr = U.inr;
  var FILES = ["core", "materials", "loads", "sections", "steel", "rcc", "detailing", "bbs", "frame2d", "thumbrules", "drawing", "common", "modules_steel", "modules_infra", "modules_rcc", "modules_bridge", "modules_shed", "modules_extra", "modules_extra2", "modules_extra3", "modules_extra4", "modules_extra5", "modules_extra6", "loadguide", "site", "diagnose", "report", "review", "to3d", "to3d_b1", "to3d_b1b", "to3d_b2", "to3d_b3"]; // modules_shed: complete steel shed; loadguide/site/diagnose: load guide, mining-area profile, fix suggestions
  var CATEGORY_ORDER = ["Steel structures", "Drains, culverts & roads", "Masonry, water & site works", "RCC building", "Bridges & frames"];
  var CAT_HI = { "Steel structures": "स्टील स्ट्रक्चर", "Drains, culverts & roads": "नाली, पुलिया, सड़क", "RCC building": "आरसीसी भवन", "Bridges & frames": "पुल एवं फ्रेम", "Masonry, water & site works": "ईंट चिनाई, पानी व साइट कार्य" };
  var ST_CLS = { PASS: "ok", CHECK: "warn", FAIL: "dan" };
  var D = S.ds = { loaded: false, loading: false, err: "", view: "design", cat: null, mid: null, modes: {}, inputs: {}, sub: "drawings", sheet: 0, secs: "", only: false, fc: null, fcv: {}, res: null, key: "", runErr: "", cpwd: "cpwd23", part: "", rv: {}, ctx: { site: "general", detail: "practice" }, dg: null, lgf: "all", lgq: "", dest: "open", destEst: "", newName: "", siteCfg: {}, bbsCfg: {}, bbsEdits: {} };
  try { var saved = JSON.parse(localStorage.getItem("ep_ds") || "{}"); if (saved.inputs) D.inputs = saved.inputs; if (saved.modes) D.modes = saved.modes; if (saved.mid) D.mid = saved.mid; if (saved.people) D.people = saved.people; if (saved.ctx) D.ctx = Object.assign(D.ctx, saved.ctx); if (saved.siteCfg) D.siteCfg = saved.siteCfg; if (saved.bbsCfg) D.bbsCfg = saved.bbsCfg; if (saved.bbsEdits) D.bbsEdits = saved.bbsEdits; } catch (e) {}
  D.people = D.people || { designed_by: "", checked_by: "", approved_by: "" };
  function persist() { try { localStorage.setItem("ep_ds", JSON.stringify({ inputs: D.inputs, modes: D.modes, mid: D.mid, people: D.people, ctx: D.ctx, siteCfg: D.siteCfg, bbsCfg: D.bbsCfg, bbsEdits: D.bbsEdits })); } catch (e) {} }

  function load() {
    if (D.loaded || D.loading) return; D.loading = true;
    var i = 0;
    (function next() {
      if (i >= FILES.length) { D.loaded = true; D.loading = false; if (!D.mid || !DS.core.MODULES[D.mid]) D.mid = byCat()[CATEGORY_ORDER[0]][0]; U.render(); return; }
      var s = document.createElement("script"); s.src = "js/ds/" + FILES[i++] + ".js?v=7";
      s.onload = next; s.onerror = function () { D.loading = false; D.err = "The design engine didn't load (" + s.src + "). Check your connection and reload."; U.render(); };
      document.head.appendChild(s);
    })();
  }
  function MODS() { return DS.core.MODULES; }
  function byCat() { var o = {}; CATEGORY_ORDER.forEach(function (c) { o[c] = []; }); Object.keys(MODS()).forEach(function (m) { var c = MODS()[m].category; (o[c] = o[c] || []).push(m); }); return o; }
  function spec() { return MODS()[D.mid]; }
  function mode() { var sp = spec(), m = D.modes[D.mid]; return sp.modes.indexOf(m) >= 0 ? m : sp.modes[0]; }
  function values() { var sp = spec(), v = DS.core.inputs_with_defaults(sp, D.inputs[D.mid] || {}); if ("location" in v && "vehicle" in v && DS.modules_infra && DS.modules_infra._cv_norm) v = DS.modules_infra._cv_norm(v); return v; }
  function company() {
    var d = S.est && S.est.cur ? S.est.cur.doc : null, h = d ? d.header : (S.me.defaults && S.me.defaults.header) || {};
    return { firm: h.org || "ESTIMATE PRO · DESIGN STUDIO", address: h.office || "", tagline: h.project || "Structural / civil design", designed_by: D.people.designed_by || "", checked_by: D.people.checked_by || "", approved_by: D.people.approved_by || "", drawn_by: "" };
  }
  function project() { var d = S.est && S.est.cur ? S.est.cur.doc : null; return d ? (d.header.work || S.est.cur.name || "") : ""; }
  function editKey() { return D.mid + "|" + (D.mid && MODS()[D.mid] ? mode() : ""); }
  function ctx() { return { site: D.ctx.site === "mine" ? "mine" : "general", detail: D.ctx.detail === "code" ? "code" : "practice", site_cfg: D.siteCfg, bbs_cfg: D.bbsCfg, bbs_edits: D.bbsEdits[editKey()] || null }; }
  function run() {
    var sp = spec(), md = mode(), v = values(), key = D.mid + "|" + md + "|" + JSON.stringify(v) + "|" + project() + "|" + JSON.stringify(company()) + "|" + JSON.stringify(ctx());
    if (key === D.key) return D.res;
    D.key = key; D.runErr = ""; D.res = null; D.fc = null; D.fcv = {};
    try {
      D.res = DS.core.run_module(sp, v, md, project(), company(), ctx());
      D.res.drawings.forEach(function (sh) { sh.drawn_by = "Estimate Pro – Design Studio"; });
      if (D.sheet >= D.res.drawings.length) D.sheet = 0;
    } catch (e) { D.runErr = e && e.message ? e.message : String(e); console.error(e); }
    return D.res;
  }
  function fmt(v) { return typeof v === "string" ? v : DS.core.fmt_num(v); }
  function dl(data, name, type) { var b = data instanceof Blob ? data : new Blob([data], { type: type || "application/octet-stream" }); if (EP.download) EP.download(b, name); else { var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; a.click(); } }

  /* ------------------------------------------------------------------ view */
  U.views.design = function () {
    load();
    var h = '<div class="ds"><div class="row" style="flex-wrap:wrap;gap:10px;align-items:flex-end"><div class="grow"><h1 style="margin:0">Design Studio <span class="muted" style="font-size:.55em;font-weight:500">डिज़ाइन स्टूडियो</span></h1><p class="muted" style="margin:2px 0 0;max-width:900px">Design, check or size by thumb rule — steel sheds, drains, culverts, retaining walls, water tank, pavements, RCC elements, bridges and building frames. Every formula with its IS / IRC clause, drawings (PDF / DXF), BBS and quantities straight into your estimate.</p></div>' +
      '<div class="seg" role="group" aria-label="Design Studio section">' + [["design", "Design"], ["loads", "Load guide"], ["review", "Drawing review"], ["ref", "Codes & thumb rules"]].map(function (x) { return '<button type="button" data-dsv="' + x[0] + '" aria-pressed="' + (D.view === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div></div>";
    if (D.err) return h + '<div class="panel empty">' + esc(D.err) + "</div></div>";
    if (!D.loaded) return h + '<div class="panel empty">Loading the design engine…</div></div>';
    h += '<div class="ds-disc badge warn" style="white-space:normal;line-height:1.45;padding:6px 10px">' + esc(DS.core.DISCLAIMER) + "</div>";
    if (D.view === "review") return h + viewReview() + "</div>";
    if (D.view === "ref") return h + viewRef() + "</div>";
    if (D.view === "loads") return h + viewLoads() + "</div>";
    return h + viewDesign() + "</div>";
  };

  function viewDesign() {
    var bc = byCat(), sp = spec(), md = mode(), v = values();
    var h = '<div class="ds-pick">';
    CATEGORY_ORDER.forEach(function (c) {
      if (!bc[c] || !bc[c].length) return;
      h += '<div class="ds-cat"><div class="lbl">' + esc(c) + ' <span class="muted" style="text-transform:none;letter-spacing:0">' + esc(CAT_HI[c] || "") + '</span></div><div class="ds-mods">' + bc[c].map(function (m) { var s = MODS()[m]; return '<button type="button" class="ds-mod" data-dsm="' + m + '" aria-pressed="' + (m === D.mid) + '"><span class="ds-ic" aria-hidden="true">' + esc(s.icon) + "</span>" + esc(s.name) + "</button>"; }).join("") + "</div></div>";
    });
    h += "</div>";
    h += '<div class="panel ds-in"><div class="row" style="flex-wrap:wrap;gap:10px;align-items:flex-start"><div class="grow" style="min-width:260px"><h2 style="margin:0">' + esc(sp.icon + " " + sp.name) + '</h2><p class="muted" style="margin:4px 0 0">' + esc(sp.description) + "</p></div>" +
      '<div class="seg" role="group" aria-label="Mode">' + sp.modes.map(function (m) { return '<button type="button" data-dsmode="' + m + '" aria-pressed="' + (m === md) + '" title="' + esc(DS.core.MODE_LABEL[m]) + '">' + esc({ design: "Design", check: "Check my design", thumb: "Thumb rule", free: "Free / custom (my dimensions)" }[m] || m) + "</button>"; }).join("") + "</div></div>";
    h += '<p class="muted" style="margin:6px 0 0;font-size:13px">' + esc(DS.core.MODE_LABEL[md]) + "</p>";
    var cx = ctx();
    h += '<div class="row ds-ctx" style="gap:10px;flex-wrap:wrap;align-items:center"><span class="lbl" style="margin:0">Site</span><div class="seg" role="group" aria-label="Site condition">' + [["general", "General site"], ["mine", "⛏️ Mining area (SECL)"]].map(function (x) { return '<button type="button" data-dsctx="site:' + x[0] + '" aria-pressed="' + (cx.site === x[0]) + '">' + x[1] + "</button>"; }).join("") + '</div><span class="lbl" style="margin:0">Bar detailing</span><div class="seg" role="group" aria-label="Detailing rule">' + [["practice", "Good practice"], ["code", "IS code minimum"]].map(function (x) { return '<button type="button" data-dsctx="detail:' + x[0] + '" aria-pressed="' + (cx.detail === x[0]) + '">' + x[1] + "</button>"; }).join("") + "</div></div>";
    h += '<p class="muted" style="margin:0;font-size:12.5px">' + (cx.site === "mine" ? "Mining area: exposure Severe, M30, 45–50 mm cover, SBC × 0.8, soil γ 20, φ ≤ 28°, μ ≤ 0.45, surcharge ≥ 24 kN/m², imposed load × 1.10, coal dust on roofs, k1 1.07 — applied automatically (design mode) and reported in the calculation. खदान क्षेत्र: अतिरिक्त सुरक्षा।" : "General site: your inputs are used as given. Switch to Mining area for SECL / Korba / Gevra sites (extra factor of safety).") + " " + (cx.detail === "code" ? "Bars: IS 456 minimum sizes." : "Bars: site practice sizes (e.g. slab ≥ 10Ø main, footing ≥ 12Ø, column ties ≥ 8Ø).") + "</p>";
    if (cx.site === "mine" && DS.site && DS.site.CFG_FIELDS) {
      var SC = DS.site, chg = SC.changed ? (SC.setCfg(D.siteCfg), SC.changed()) : [];
      h += '<details class="ds-grp"' + (chg.length ? " open" : "") + '><summary>⚙️ Site values for this mining area (editable' + (chg.length ? " – " + chg.length + " changed" : "") + ')</summary><p class="muted" style="margin:4px 0;font-size:12.5px">Change these to suit the actual site (soil report, mine road, CHP nearness). 0 switches a rule off. Values are kept in this browser and listed in the calculation.</p><div class="ds-fields">' +
        SC.CFG_FIELDS.map(function (f) { var k = f[0], cur = SC.cfg[k], dflt = SC.DEFAULTS[k];
          return '<label class="fld"><span class="lbl2">' + esc(f[1]) + (f[2] ? ' <span class="muted">(' + esc(f[2]) + ")</span>" : "") + "</span>" + (f[3] ? '<select class="in" data-dssite="' + k + '">' + f[3].map(function (o) { return "<option" + (o === cur ? " selected" : "") + ">" + esc(o) + "</option>"; }).join("") + "</select>" : '<input class="in n" inputmode="decimal" data-dssite="' + k + '" value="' + esc(String(cur)) + '">') + '<span class="ds-hint">default ' + esc(String(dflt)) + "</span></label>"; }).join("") +
        '</div><button type="button" class="btn ghost sm" id="ds-site-reset">↺ Reset site values</button></details>';
    }
    var res0 = run(), lim = {};
    if (res0 && DS.diagnose) DS.diagnose.limits(sp, res0.inputs || v, md, cx).forEach(function (l) { (lim[l.key] = lim[l.key] || []).push(l); });
    var groups = [], gmap = {};
    sp.params.forEach(function (p) { if (p.modes.indexOf(md) < 0) return; if (p.when && !p.when(v)) return; if (!gmap[p.group]) { gmap[p.group] = []; groups.push(p.group); } gmap[p.group].push(p); });
    groups.forEach(function (g, gi) {
      h += '<details class="ds-grp"' + (gi < 2 || /^My/.test(g) ? " open" : "") + "><summary>" + (/^My/.test(g) ? "✏️ " : "") + esc(g) + '</summary><div class="ds-fields">';
      gmap[g].forEach(function (p) {
        var cur = v[p.key], id = "dsp-" + D.mid + "-" + p.key, lab = esc(md === "free" ? String(p.label).replace(/\s*\(check\)/i, "").replace(/\(check, /i, "(").replace(/,? ?check\)/i, ")") : p.label) + (p.unit ? ' <span class="muted">(' + esc(p.unit) + ")</span>" : ""), tip = p.help ? ' title="' + esc(p.help) + '"' : "";
        var hint = fieldHint(p, cur, cx, lim[p.key]);
        if (p.kind === "bool") h += '<label class="fld ds-chk"' + tip + '><input type="checkbox" id="' + id + '" data-dsp="' + p.key + '"' + (cur ? " checked" : "") + "> " + lab + "</label>";
        else if (p.kind === "select") h += '<label class="fld"' + tip + '><span class="lbl2">' + lab + '</span><select class="in" id="' + id + '" data-dsp="' + p.key + '">' + (p.filter ? p.options.filter(function (o) { return p.filter(o, v); }) : p.options).map(function (o) { return '<option value="' + esc(String(o)) + '"' + (String(o) === String(cur) ? " selected" : "") + ">" + esc(String(o)) + "</option>"; }).join("") + "</select>" + hint + "</label>";
        else h += '<label class="fld"' + tip + '><span class="lbl2">' + lab + '</span><input class="in' + (p.kind === "text" ? "" : " n") + '" id="' + id + '" data-dsp="' + p.key + '" value="' + esc(cur == null ? "" : String(cur)) + '"' + (p.kind === "text" ? "" : ' inputmode="decimal"') + (p.min != null ? ' data-min="' + p.min + '"' : "") + (p.max != null ? ' data-max="' + p.max + '"' : "") + ">" + hint + "</label>";
      });
      h += "</div></details>";
    });
    h += '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:6px"><button type="button" class="btn ghost sm" id="ds-reset">↺ Reset inputs</button><button type="button" class="btn ghost sm" id="ds-save">💾 Save inputs (.json)</button><label class="btn ghost sm" style="cursor:pointer">📂 Load inputs<input type="file" id="ds-load" accept=".json" hidden></label></div></div>';

    var res = run();
    if (!res) return h + '<div class="panel" style="padding:14px;border-left:4px solid var(--danger)"><strong>Design could not be completed with these inputs:</strong> ' + esc(D.runErr) + "</div>";
    var c = res.calc;
    h += '<div class="ds-stat"><span class="badge ' + ST_CLS[res.status] + '" style="font-size:14px;padding:2px 14px">' + res.status + "</span><span>Max. utilisation <b>" + DS.core.pyfmt(c.max_utilisation, ".2f") + "</b> · " + c.failures.length + " failed · " + c.warnings.length + " warnings · " + c.missing.length + " items to verify</span></div>";
    var sm = Object.keys(res.summary);
    if (res.site_adjust && res.site_adjust.length) h += '<div class="ds-msg warn" style="margin:0"><b>⛏️ Mining-area values used in this run</b> (your inputs are kept; the design used the safer value): ' + res.site_adjust.map(function (a) { return esc(a.label) + " <b>" + esc(String(a.from)) + " → " + esc(String(a.to)) + "</b>"; }).join(" · ") + "</div>";
    if (sm.length) h += '<div class="ds-sum">' + sm.map(function (k) { return '<div class="stat"><div class="lbl">' + esc(k) + '</div><div class="v sm">' + esc(String(res.summary[k])) + "</div></div>"; }).join("") + "</div>";
    var tabs = [["drawings", "📐 Drawings (" + res.drawings.length + ")"], ["calc", "🧾 Calculation"], ["fc", "🔎 Formula checker"], ["miss", "🩺 Missing, checks & fixes (" + (c.failures.length + c.warnings.length + c.missing.length) + ")"], ["thumb", "👍 Thumb rules"], ["bbs", "🔩 BBS"], ["qty", "📦 Quantities → Estimate"], ["rep", "⬇️ Reports"]];
    h += '<div class="seg wrap ds-tabs" role="group" aria-label="Result">' + tabs.map(function (t) { return '<button type="button" data-dst="' + t[0] + '" aria-pressed="' + (D.sub === t[0]) + '">' + t[1] + "</button>"; }).join("") + "</div>";
    h += '<div class="panel ds-out">' + ({ drawings: tDrawings, calc: tCalc, fc: tFormula, miss: tMissing, thumb: tThumb, bbs: tBBS, qty: tQty, rep: tReports }[D.sub] || tDrawings)(res) + "</div>";
    return h;
  }

  /* small note under an input: typical value from the load guide (general / mining area) + limit / unsafe-side flags */
  function fieldHint(p, cur, cx, lims) {
    var h = "", g = DS.diagnose && DS.diagnose.hint(p.key, cx);
    if (g && g.value != null) {
      var same = String(g.value) === String(cur) || (+g.value === +cur && isFinite(+cur));
      var canUse = !same && (p.kind !== "select" || p.options.some(function (o) { return String(o) === String(g.value); }));
      h += '<span class="ds-hint" title="' + esc(g.note || "") + '">' + (cx.site === "mine" ? "⛏️ Mine" : "Typical") + ": " + esc(String(g.value)) + (p.unit && typeof g.value === "number" ? " " + esc(p.unit) : "") + " – " + esc(String(g.note || "").slice(0, 70)) + (String(g.note || "").length > 70 ? "…" : "") + (canUse ? ' <button type="button" class="linkbtn" data-dsuse="' + esc(p.key) + '" data-val="' + esc(String(g.value)) + '">Use</button>' : "") + "</span>";
    }
    (lims || []).forEach(function (l) { if (/^Below the usual|^Above the usual|^Milder/.test(l.text) && g) h += '<span class="ds-hint ' + l.level + '">⚠ ' + esc(l.text.split(" – ")[0].split(". ")[0]) + "</span>"; else if (!/^Below the usual|^Above the usual|^Milder/.test(l.text)) h += '<span class="ds-hint warn">⚠ ' + esc(l.text.split(". ")[0]) + "</span>"; });
    return h;
  }
  /* ---- diagnosis: run the sensitivity / fix search in small chunks so the page stays responsive */
  function startDiag() {
    if (!DS.diagnose || !D.res) return;
    var key = D.key, job = DS.diagnose.job(spec(), values(), mode(), project(), company(), ctx());
    D.dg = { key: key, job: job, out: null, prog: 0 };
    (function tick() {
      if (!D.dg || D.dg.key !== key || D.dg.job !== job) return;
      var t0 = Date.now(), more = true;
      try { while (more && Date.now() - t0 < 35) more = job.step(); } catch (e) { console.error(e); more = false; D.dg.err = e.message || String(e); }
      D.dg.prog = job.progress();
      if (more) { var el = document.getElementById("ds-dgprog"); if (el) el.textContent = Math.round(D.dg.prog * 100) + " %"; var bar = document.getElementById("ds-dgbar"); if (bar) bar.style.width = Math.round(D.dg.prog * 100) + "%"; setTimeout(tick, 0); return; }
      D.dg.out = job.result(); if (D.view === "design" && D.sub === "miss") U.render();
    })();
  }
  function dgCur() { return D.dg && D.dg.key === D.key ? D.dg : null; }
  function vtxt(v, unit) { return typeof v === "boolean" ? (v ? "Yes" : "No") : esc(String(v)) + (unit && typeof v === "number" ? " " + esc(unit) : ""); }
  function tDiag(res) {
    var dg = dgCur(), c = res.calc, need = c.failures.length + c.warnings.length;
    var h = '<div class="ds-dg"><div class="row" style="gap:8px;flex-wrap:wrap;align-items:center"><h3 style="margin:0" class="grow">🩺 Diagnosis – where it fails and what to change <span class="muted" style="font-weight:400;font-size:13px">कहाँ गलती है, क्या बदलें</span></h3>';
    if (!dg) {
      if (need) { setTimeout(function () { if (!dgCur()) { startDiag(); } }, 0); }
      return h + '<button type="button" class="btn sec sm" id="ds-dg">Run diagnosis</button></div><p class="muted" style="margin:4px 0 0;font-size:13px">' + (need ? "Starting…" : "All checks pass. Run the diagnosis to see which inputs are close to the limit and what happens if a value is taken lower or higher.") + "</p></div>";
    }
    if (!dg.out) return h + '<span class="muted">Trying each input lower / higher… <b id="ds-dgprog">' + Math.round(dg.prog * 100) + ' %</b></span></div><div class="ds-prog"><i id="ds-dgbar" style="width:' + Math.round(dg.prog * 100) + '%"></i></div></div>';
    var o = dg.out, CL = DS.diagnose.CLS_LABEL, ic = { choice: "🛠️", layout: "📏", given: "📋" };
    h += '<button type="button" class="btn ghost sm" id="ds-dg">↻ Run again</button></div>';
    if (!o.issues.length) h += '<p class="badge ok" style="white-space:normal">No failing, warning or highly-utilised (&gt; 90 %) checks. Max utilisation ' + o.base.util.toFixed(2) + ".</p>";
    o.issues.forEach(function (it) {
      var cl = it.st === "FAIL" ? "dan" : it.st === "WARN" ? "warn" : "";
      h += '<div class="ds-msg ' + cl + '"><div><b>' + (it.st === "FAIL" ? "❌ " : it.st === "WARN" ? "⚠️ " : "🔶 ") + esc(it.label) + "</b> — " + esc(fmt(it.value)) + (it.u != null && it.u < 9 ? " · utilisation <b>" + it.u.toFixed(2) + "</b>" : "") + ' <span class="muted">(' + esc(it.section) + (it.clause ? " · " + esc(it.clause) : "") + ")</span></div>";
      if (!it.fixes.length) h += '<div class="muted" style="font-size:13px">No single input of this module changes this check — it is a code / practice rule or depends on data outside the module. Read the note in the Calculation tab.</div>';
      else h += '<ul class="ds-fix">' + it.fixes.map(function (f) {
        var ok = f.st === "PASS", arrow = f.dir > 0 ? "increase" : "reduce";
        return "<li>" + ic[f.cls] + " <b>" + esc(f.label) + "</b>: " + (typeof f.from === "boolean" ? "change " + vtxt(f.from) + " → <b>" + vtxt(f.to) + "</b>" : arrow + " " + vtxt(f.from, f.unit) + " → <b>" + vtxt(f.to, f.unit) + "</b>") + " " + (ok ? '<span class="badge ok">check passes' + (f.u != null && f.u < 9 ? " (" + f.u.toFixed(2) + ")" : "") + "</span>" : '<span class="badge warn">improves' + (f.u != null && f.u < 9 ? " to " + f.u.toFixed(2) : "") + " – not enough alone</span>") + (f.newFails ? ' <span class="muted" style="font-size:12px">· ' + f.newFails + " check(s) still failing after this change</span>" : "") + (f.cls === "given" ? ' <span class="muted" style="font-size:12px">· only if the actual site / load is really this</span>' : "") + ' <button type="button" class="linkbtn" data-dsapply="' + esc(f.key) + '" data-val="' + esc(JSON.stringify(f.to)) + '">Apply</button></li>';
      }).join("") + "</ul>";
      h += "</div>";
    });
    h += '<p class="muted" style="font-size:12px;margin:2px 0">' + Object.keys(CL).map(function (k) { return ic[k] + " " + CL[k]; }).join(" · ") + ". Apply one change at a time and re-check — a change can affect other checks.</p>";
    var rows = o.sens.filter(function (x) { return x.minus || x.plus; }).map(function (x) { return [ic[x.cls] + " " + x.label + (x.unit ? " (" + x.unit + ")" : ""), String(x.from), x.minus ? String(x.minus.to) + ": " + DS.diagnose.effect(o.base, x.minus) : "—", x.plus ? String(x.plus.to) + ": " + DS.diagnose.effect(o.base, x.plus) : "—"]; });
    h += '<details class="ds-grp"><summary>📊 What happens if an input is taken lower / higher (sensitivity of all ' + rows.length + " inputs)</summary>" + tableHtml({ columns: ["Input", "Now", "Lower → effect", "Higher → effect"], rows: rows }) + "</details>";
    return h + "</div>";
  }
  function tDrawings(res) {
    if (!res.drawings.length) return '<p class="muted">No drawings for this module.</p>';
    var sh = res.drawings[D.sheet] || res.drawings[0];
    var h = '<div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end"><label class="fld grow" style="min-width:240px"><span class="lbl">Sheet</span><select class="in" id="ds-sheet">' + res.drawings.map(function (s, i) { return '<option value="' + i + '"' + (i === D.sheet ? " selected" : "") + ">" + esc(s.number + " – " + s.title) + "</option>"; }).join("") + '</select></label><button type="button" class="btn pri sm" id="ds-pdf">⬇️ All sheets – PDF (A3)</button><button type="button" class="btn sec sm" id="ds-dxf">⬇️ All sheets – DXF (AutoCAD)</button><button type="button" class="btn sec sm" id="ds-svg">⬇️ This sheet – SVG</button><button type="button" class="btn sec sm" id="ds-cad" title="Open all sheets in CAD Studio to edit, add dimensions, plot or take off quantities">✏️ Open in CAD Studio</button>' + (DS.to3d && DS.to3d.has(D.mid) ? '<button type="button" class="btn pri sm" id="ds-3d" title="Build a 3D model from these dimensions and open it in CAD Studio (3D view)">🧊 Send to CAD Studio as 3D</button>' : '') + '</div>';
    h += '<div class="ds-sheet">' + DS.drawing.to_svg(sh, 1600).replace(/^<\?xml[^>]*>/, "") + "</div>";
    h += '<p class="muted" style="font-size:12px;margin:6px 0 0">DXF is drawn 1:1 in millimetres on layers OUTLINE / REBAR / STEEL / DIM / TEXT — dimensions can be measured directly in AutoCAD, BricsCAD, LibreCAD or QCAD. The title block uses the header of the open estimate (Header, parts & GST → saved firms).</p>';
    return h;
  }
  function tCalc(res) {
    var secs = []; res.calc.steps.forEach(function (s) { if (secs.indexOf(s.section) < 0) secs.push(s.section); });
    var h = '<div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end"><label class="fld"><span class="lbl">Section</span><select class="in" id="ds-secs"><option value="">All sections</option>' + secs.map(function (s) { return '<option' + (s === D.secs ? " selected" : "") + ">" + esc(s) + "</option>"; }).join("") + '</select></label><label class="fld ds-chk"><input type="checkbox" id="ds-only"' + (D.only ? " checked" : "") + "> Only checks</label></div>";
    h += '<div class="tw"><table class="t ds-calc"><thead><tr><th class="num">#</th><th>Description</th><th>Symbol</th><th>Formula</th><th>Substituted</th><th class="num">Result</th><th>Unit</th><th>Clause</th><th>Status</th></tr></thead><tbody>';
    var lastSec = null;
    res.calc.steps.forEach(function (s, i) {
      if (D.secs && s.section !== D.secs) return; if (D.only && ["PASS", "FAIL", "WARN"].indexOf(s.status) < 0) return;
      if (s.section !== lastSec) { lastSec = s.section; h += '<tr class="ds-sec"><td colspan="9">' + esc(s.section) + "</td></tr>"; }
      h += '<tr class="st-' + (s.status || "").toLowerCase() + '"><td class="num">' + (i + 1) + "</td><td>" + esc(s.label) + (s.note ? '<div class="muted" style="font-size:11px">' + esc(s.note) + "</div>" : "") + "</td><td>" + esc(s.symbol) + '</td><td class="mono">' + esc(s.formula) + '</td><td class="mono">' + esc(s.substituted) + '</td><td class="' + (typeof s.value === "number" ? "num" : "ds-val") + '">' + esc(fmt(s.value)) + "</td><td>" + esc(s.unit) + '</td><td class="muted" style="font-size:12px">' + esc(s.clause) + "</td><td>" + (s.status ? '<span class="badge ' + ({ PASS: "ok", FAIL: "dan", WARN: "warn", INFO: "info" }[s.status] || "") + '">' + s.status + "</span>" : "") + (s.expr ? ' <button type="button" class="btn ghost sm" data-dsfc="' + i + '" title="Check this formula">🔎</button>' : "") + "</td></tr>";
    });
    h += "</tbody></table></div>";
    Object.keys(res.tables).forEach(function (name) { h += "<h3>" + esc(name) + "</h3>" + tableHtml(res.tables[name]); });
    return h;
  }
  function tableHtml(t) { return '<div class="tw"><table class="t"><thead><tr>' + t.columns.map(function (c) { return "<th>" + esc(String(c)) + "</th>"; }).join("") + "</tr></thead><tbody>" + t.rows.map(function (r) { return "<tr>" + r.map(function (x) { return "<td>" + esc(typeof x === "number" ? DS.core.fmt_num(x) : String(x == null ? "" : x)) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>"; }
  function tFormula(res) {
    var steps = []; res.calc.steps.forEach(function (s, i) { if (s.expr) steps.push(i); });
    if (!steps.length) return '<p class="muted">This module has no re-evaluable formulas.</p>';
    if (D.fc == null || steps.indexOf(D.fc) < 0) D.fc = steps[0];
    var s = res.calc.steps[D.fc];
    var h = '<label class="fld"><span class="lbl">Choose a formula to check</span><select class="in" id="ds-fcpick">' + steps.map(function (i) { var x = res.calc.steps[i]; return '<option value="' + i + '"' + (i === D.fc ? " selected" : "") + ">" + (i + 1) + ". " + esc(x.label) + "  [" + esc(x.symbol) + "]</option>"; }).join("") + "</select></label>";
    h += '<div class="ds-fc"><div><b>' + esc(s.symbol) + ' = <span class="mono">' + esc(s.formula) + "</span></b></div><div class='muted'>Clause: " + esc(s.clause || "—") + '</div><div>Substituted: <span class="mono">' + esc(s.substituted) + "</span> = <b>" + esc(fmt(s.value)) + " " + esc(s.unit) + "</b></div></div>";
    var vars = Object.keys(s.variables).filter(function (k) { return typeof s.variables[k] === "number"; });
    var nv = Object.assign({}, s.variables), ovr = D.fcv[D.fc] || {};
    Object.keys(ovr).forEach(function (k) { var x = EP.ev(ovr[k]); if (x != null) nv[k] = x; });
    h += '<div class="tw"><table class="t" style="max-width:560px"><thead><tr><th>Variable</th><th class="num">App value</th><th class="num">Your value</th></tr></thead><tbody>' + vars.map(function (k) { return "<tr><td class='mono'>" + esc(k) + "</td><td class='num'>" + esc(DS.core.fmt_num(s.variables[k])) + "</td><td class='num'><input class='in small n' id='dsfv-" + esc(k) + "' data-dsfv='" + esc(k) + "' value='" + esc(ovr[k] != null ? ovr[k] : "") + "' placeholder='" + esc(DS.core.pyfmt(s.variables[k], ".6g")) + "'></td></tr>"; }).join("") + "</tbody></table></div>";
    try {
      var nw = DS.core.safe_eval(s.expr, nv), again = DS.core.safe_eval(s.expr, s.variables), same = Math.abs(again - s.value) <= 1e-9 * Math.max(1, Math.abs(s.value));
      h += '<div class="ds-sum"><div class="stat"><div class="lbl">App result</div><div class="v sm">' + esc(fmt(s.value) + " " + s.unit) + '</div></div><div class="stat"><div class="lbl">Result with your values</div><div class="v sm">' + esc(DS.core.fmt_num(nw) + " " + s.unit) + (typeof s.value === "number" && s.value ? ' <span class="muted" style="font-size:13px">(' + DS.core.pyfmt((nw - s.value) / s.value * 100, "+.2f") + " %)</span>" : "") + '</div></div><div class="stat"><div class="lbl">Independent re-evaluation</div><div class="v sm">' + (same ? "✔ matches" : "✘ differs") + "</div></div></div>";
    } catch (e) { h += '<p class="badge dan">Could not evaluate: ' + esc(e.message) + "</p>"; }
    return h + '<p class="muted" style="font-size:12px">Change any variable to see its effect on this formula. To change the whole design, edit the inputs above — every step is recalculated.</p>';
  }
  function tMissing(res) {
    var c = res.calc, h = tDiag(res);
    var lims = DS.diagnose ? DS.diagnose.limits(spec(), res.inputs || values(), mode(), ctx()) : [];
    if (lims.length) h += "<h3>🎚️ Inputs at a limit or on the unsafe side</h3>" + lims.map(function (l) { return '<div class="ds-msg ' + (l.level === "dan" ? "dan" : "warn") + '"><b>' + esc(l.label) + "</b> — " + esc(l.text) + (l.rec != null ? ' <button type="button" class="linkbtn" data-dsuse="' + esc(l.key) + '" data-val="' + esc(String(l.rec)) + '">Use ' + esc(String(l.rec)) + "</button>" : "") + "</div>"; }).join("");
    if (c.failures.length) h += "<h3>❌ Failed checks — the design does not satisfy these</h3>" + c.failures.map(function (s) { return '<div class="ds-msg dan"><b>' + esc(s.label) + "</b> — " + esc(fmt(s.value)) + " <span class='muted'>(" + esc(s.clause) + ")</span>" + (s.note ? "<div><i>" + esc(s.note) + "</i></div>" : "") + "</div>"; }).join("");
    if (c.warnings.length) h += "<h3>⚠️ Warnings</h3>" + c.warnings.map(function (s) { return '<div class="ds-msg warn"><b>' + esc(s.label) + "</b> — " + esc(fmt(s.value)) + " <span class='muted'>(" + esc(s.clause) + ")</span></div>"; }).join("");
    var ord = ["Critical", "Important", "Advisory"], ic = { Critical: "🔴", Important: "🟠", Advisory: "🔵" };
    h += "<h3>🧩 What is missing / still to be designed or verified</h3>";
    h += c.missing.slice().sort(function (a, b) { return ord.indexOf(a.severity) - ord.indexOf(b.severity); }).map(function (m) { return '<div class="ds-msg"><b>' + ic[m.severity] + " " + m.severity + "</b> – " + esc(m.text) + (m.clause ? '<div class="muted" style="font-size:12px">' + esc(m.clause) + "</div>" : "") + "</div>"; }).join("");
    if (!(c.failures.length || c.warnings.length || c.missing.length)) h += '<p class="badge ok">Nothing missing for the scope of this module.</p>';
    return h;
  }
  function tThumb(res) {
    var t = res.calc.thumbs; if (!t.length) return '<p class="muted">No thumb rules for this module.</p>';
    return tableHtml({ columns: ["Item", "Rule", "Thumb value", "Design value", "Unit", "Difference %", "Source"], rows: t.map(function (x) { return [x.item, x.rule, DS.core.pyround(x.thumb_value, 2), DS.core.pyround(x.design_value, 2), x.unit, DS.core.pyround(x.diff_pct || 0, 1), x.source]; }) }) + '<p class="muted" style="font-size:12px">Thumb rules are for a quick sense-check; the code design governs.</p>';
  }
  function tBBS(res) {
    if (!res.bbs.length) return '<p class="muted">No reinforcement schedule (steel structure or hydraulic module).</p>';
    var C_ = DS.core, BB = DS.bbs, tot = C_.sum(res.bbs.map(function (b) { return b.weight; })), byd = {}, ed = D.bbsEdits[editKey()] || {};
    res.bbs.forEach(function (b) { var k = +b.dia; byd[k] = byd[k] || { L: 0, W: 0 }; byd[k].L += b.total_length; byd[k].W += b.weight; });
    var inp = function (b, f, v) { var e = ed[b.mark] && ed[b.mark][f] != null; return '<input class="in n small' + (e ? " ds-edited" : "") + '" style="width:' + (f === "cut" ? 78 : 62) + 'px" data-dsbe="' + esc(b.mark) + "|" + f + '" value="' + esc(String(v)) + '" title="' + (b.app ? "App value: " + (f === "nos" ? b.app.nos : f === "cut" ? b.app.cut : b.app.dia) : "Edit to suit the site") + '">'; };
    var h = '<p class="muted" style="margin:0;font-size:12.5px">Nos, cut length and Ø are editable – the weight, the steel quantity going to the estimate, the BBS drawing sheet, Excel and report follow your values. Edited rows are marked.</p>';
    h += '<div class="tw"><table class="t"><thead><tr><th>Member</th><th>Mark</th><th>Dia</th><th>Shape</th><th class="num">Nos</th><th class="num">Cut length (m)</th><th class="num">Total (m)</th><th class="num">Weight (kg)</th><th>How the cut length is found</th><th>Note</th></tr></thead><tbody>' +
      res.bbs.map(function (b) { return "<tr" + (b.edited ? ' class="ds-edrow"' : "") + "><td>" + esc(b.member) + "</td><td>" + esc(b.mark) + (b.edited ? ' <span class="badge warn">edited</span>' : "") + "</td><td>" + inp(b, "dia", b.dia) + "</td><td>" + esc(b.shape) + "</td><td class='num'>" + inp(b, "nos", b.nos) + "</td><td class='num'>" + inp(b, "cut", b.cut_length) + "</td><td class='num'>" + C_.pyround(b.total_length, 2) + "</td><td class='num'>" + C_.pyround(b.weight, 2) + "</td><td style='font-size:12px'>" + esc(b.formula || "") + "</td><td style='font-size:12px'>" + esc(b.note) + "</td></tr>"; }).join("") + "</tbody></table></div>";
    if (Object.keys(ed).length) h += '<button type="button" class="btn ghost sm" id="ds-bbs-unedit">↺ Undo my BBS edits (back to the app values)</button>';
    h += "<h3>Steel abstract by diameter</h3>" + tableHtml({ columns: ["Dia (mm)", "kg/m (d²/162)", "Total length (m)", "Weight (kg)"], rows: Object.keys(byd).map(Number).sort(function (a, b) { return a - b; }).map(function (k) { return [k, C_.pyround(k * k / 162, 3), C_.pyround(byd[k].L, 1), C_.pyround(byd[k].W, 1)]; }) }) +
      '<div class="row" style="gap:10px;align-items:center"><div class="stat"><div class="lbl">Total reinforcement</div><div class="v sm">' + C_.pyfmt(tot, ",.1f") + ' kg</div></div><button type="button" class="btn sec sm" id="ds-bbscsv">⬇️ BBS (.csv)</button></div>';
    // editable rules
    BB.setCfg(D.bbsCfg); var chg = BB.changed();
    h += '<details class="ds-grp"' + (chg.length ? " open" : "") + '><summary>⚙️ BBS rules (editable' + (chg.length ? " – " + chg.length + " changed from IS / SP 34" : "") + ')</summary><p class="muted" style="margin:4px 0;font-size:12.5px">Defaults follow IS 2502 / SP 34 / IS 456. Change them to your site / department practice; every module\'s BBS is recalculated and the change is listed in the calculation.</p><div class="ds-fields">' +
      BB.CFG_FIELDS.map(function (f) { return '<label class="fld"><span class="lbl2">' + esc(f[1]) + ' <span class="muted">(' + esc(f[2]) + ')</span></span><input class="in n" inputmode="decimal" data-dsbbsr="' + f[0] + '" value="' + esc(String(BB.cfg[f[0]])) + '"><span class="ds-hint">IS default ' + esc(String(BB.DEFAULTS[f[0]])) + "</span></label>"; }).join("") +
      '</div><button type="button" class="btn ghost sm" id="ds-bbs-reset">↺ Reset to IS / SP 34 defaults</button></details>';
    return h;
  }
  /* quantity → estimate item mapping */
  /* SOR matches for design quantities (unit must match): CPWD codes are the same in DSR 2021 and DSOR 2023 */
  var BELOW = /footing|pedestal|foundation|drain|box culvert|retaining|water tank|pits|base\b/i, BRIDGE = /deck|T-beam|superstructure|crash barrier|bridge/i;
  function gradeIdx(desc) { var m = /\bM(\d{2})\b/.exec(desc); return m ? { 25: 1, 30: 2, 35: 3, 40: 4, 50: 5 }[+m[1]] : null; }
  var RULES = [
    [/^Earth work in excavation/i, function () { return ["c", "2.8.1"]; }],
    [/^PCC 1:4:8/i, function () { return ["c", "4.1.8"]; }],
    [/^Filling available excavated earth|^Backfilling behind wall/i, function () { return ["c", "2.25"]; }],
    [/^PCC M15/i, function () { return ["m", "12.3"]; }],
    [/^RCC M\d\d/i, function (d) { if (BRIDGE.test(d)) return null; var g = gradeIdx(d); return g ? ["c", "5.33." + (BELOW.test(d) ? 1 : 2) + "." + g] : null; }],
    [/shuttering/i, function (d) { if (BRIDGE.test(d)) return null; return ["c", /foundation|pedestal|footing/i.test(d) ? "5.9.1" : /wall|drain|box culvert|tank/i.test(d) ? "5.9.2" : /slab/i.test(d) ? "5.9.3" : /column/i.test(d) && !/beam/i.test(d) ? "5.9.6" : /stair/i.test(d) ? "5.9.7" : "5.9.5"]; }],
    [/^Reinforcement TMT/i, function (d, q, mid) { if (BRIDGE.test(d) || /bridge/.test(mid)) return null; return ["c", /footing|drain|culvert|retaining|tank/.test(mid) || BELOW.test(d) ? "5.22.6" : "5.22A.6"]; }],
    [/^Structural steel in roof trusses|^Structural steel in portal|^Structural steel beams|^Structural steel columns/i, function () { return ["c", "10.2"]; }],
    [/^Secondary steel|^Purlins/i, function () { return ["c", "10.1"]; }],
    [/^Base plates/i, function () { return ["c", "10.2"]; }],
    [/profiled roofing sheet|wall cladding sheet/i, function () { return ["c", "12.50"]; }],
    [/^Filter media/i, function () { return ["m", "13.11"]; }],
    [/^Backfilling with granular/i, function () { return ["m", "13.10.A"]; }],
    [/^Boulder apron|stone pitching/i, function () { return ["m", "15.1.A"]; }],
    [/sub-grade/i, function () { return ["m", "3.10"]; }], [/^Granular sub-base/i, function () { return ["m", "4.1"]; }], [/^Wet mix macadam/i, function () { return ["m", "4.11"]; }],
    [/^Prime coat/i, function () { return ["m", "5.1"]; }], [/^Tack coat/i, function () { return ["m", "5.2(i)"]; }],
    [/^Dense bituminous macadam/i, function () { return ["m", "5.5a)(i)"]; }], [/^Bituminous concrete/i, function () { return ["m", "5.6a)(i)"]; }]
  ];
  function unitOk(a, b) { var n = function (u) { u = String(u || "").toLowerCase().replace(/[^a-z]/g, ""); return { rm: "metre", m: "metre", metre: "metre", nos: "each", no: "each", each: "each" }[u] || u; }; return n(a) === n(b); }
  function ruleItem(q) {
    for (var i = 0; i < RULES.length; i++) {
      if (!RULES[i][0].test(q.description)) continue;
      var r = RULES[i][1](q.description, q, D.mid); if (!r) return null;
      var cands = r[0] === "c" ? [D.cpwd, D.cpwd === "cpwd23" ? "cpwd" : "cpwd23"] : ["mp"];
      for (var k = 0; k < cands.length; k++) { var it = EP.BOOKS[cands[k]] && EP.item(cands[k], r[1]); if (it && unitOk(it.unit, q.unit)) return { b: cands[k], c: r[1] }; }
      return null;
    }
    return null;
  }
  function mapItem(q) {
    var ru = ruleItem(q); if (ru) return ru;
    if (q.link) {
      var bk = q.link[0], code = q.link[1];
      if (/^CPWD/.test(bk)) { var pref = D.cpwd, other = pref === "cpwd23" ? "cpwd" : "cpwd23"; if (EP.item(pref, code)) return { b: pref, c: code }; if (EP.item(other, code)) return { b: other, c: code }; }
      if (/^MPPWD/.test(bk) && EP.item("mp", code)) return { b: "mp", c: code };
    }
    return null;
  }
  function measRows(q) { return q.rows.map(function (r) { var o = { k: r.deduction ? "-" : "+", d: r.description || "" }; if (r.nos != null && r.nos !== "") o.n = String(r.nos); if (r.length != null) o.l = String(r.length); if (r.breadth != null) o.b = String(r.breadth); if (r.depth != null) o.h = String(r.depth); return o; }); }
  function tQty(res) {
    var est = S.est && S.est.cur, h = "";
    if (!D.dest) D.dest = "open";
    h += tableHtml({ columns: ["Item", "Unit", "Quantity", "Goes into the estimate as"], rows: res.quantities.map(function (q) { var m = mapItem(q), it = m && EP.item(m.b, m.c); return [q.description, q.unit, DS.core.pyround(q.quantity, 3), m ? (EP.BOOKS[m.b].name + " " + m.c + (it ? " · ₹" + inr(it.sor) + "/" + it.unit : "")) : "Non-SOR · indicative ₹" + inr(q.rate) + " (edit)"]; }) });
    var mine = (S.est && S.est.mine) || [], canOpen = !!(est && !U.est.ro());
    if (D.dest === "open" && !canOpen) D.dest = mine.length ? "other" : "new";
    if (D.dest === "other" && !mine.filter(function (x) { return !est || x.id !== est.id || !canOpen; }).length) D.dest = canOpen ? "open" : "new";
    var others = mine.filter(function (x) { return !canOpen || x.id !== est.id; });
    if (D.dest === "other" && !others.some(function (x) { return x.id === D.destEst; })) D.destEst = others[0] ? others[0].id : "";
    h += '<div class="ds-dest"><div class="lbl" style="margin-bottom:4px">Add these quantities to</div><div class="seg wrap" role="group" aria-label="Destination">' +
      [["open", "📂 Open estimate" + (canOpen ? ": " + est.name : ""), !canOpen], ["other", "🗂️ Another of my estimates", !others.length], ["new", "➕ New estimate", false]].map(function (x) { return '<button type="button" data-dsdest="' + x[0] + '" aria-pressed="' + (D.dest === x[0]) + '"' + (x[2] ? " disabled" : "") + ">" + esc(x[1]) + "</button>"; }).join("") + "</div>";
    var partSel = function (doc) { return '<label class="fld"><span class="lbl">Part</span><select class="in" id="ds-part"><option value="__new"' + (D.part === "__new" || !D.part ? " selected" : "") + ">New part: Design – " + esc(res.title) + "</option>" + doc.parts.map(function (p) { return '<option value="' + esc(p.id) + '"' + (D.part === p.id ? " selected" : "") + ">Existing: " + esc(p.name) + "</option>"; }).join("") + "</select></label>"; };
    h += '<div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end;margin-top:8px">';
    if (D.dest === "open") h += partSel(est.doc);
    else if (D.dest === "other") { var oe = others.filter(function (x) { return x.id === D.destEst; })[0]; h += '<label class="fld"><span class="lbl">Estimate</span><select class="in" id="ds-destest">' + others.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === D.destEst ? " selected" : "") + ">" + esc(x.name || "Untitled estimate") + "</option>"; }).join("") + "</select></label>" + (oe ? partSel(oe.doc) : ""); }
    else h += '<label class="fld grow" style="min-width:240px"><span class="lbl">Name of the new estimate</span><input class="in" id="ds-newname" value="' + esc(D.newName || ("Design – " + res.title + (project() ? " – " + project() : "")).slice(0, 90)) + '"></label>';
    h += '<label class="fld"><span class="lbl">CPWD items from</span><select class="in" id="ds-cpwd">' + [["cpwd23", "DSOR 2023"], ["cpwd", "DSR 2021"]].filter(function (x) { return EP.BOOKS[x[0]]; }).map(function (x) { return '<option value="' + x[0] + '"' + (D.cpwd === x[0] ? " selected" : "") + ">" + x[1] + "</option>"; }).join("") + '</select></label><button type="button" class="btn pri" id="ds-addq"' + (D.adding ? " disabled" : "") + ">" + (D.adding ? "Adding…" : "➕ Add quantities (with measurements)") + "</button></div></div>";
    if (D.added) h += '<div class="ds-msg" style="border-color:var(--ok)">✅ ' + esc(D.added) + ' <button type="button" class="linkbtn" id="ds-openest">Open the estimate →</button></div>';
    return h + '<p class="muted" style="font-size:12px">SOR-linked items use the schedule rate; an item already in the part gets the new measurement rows added to it (one item once per part). Others come in as Non-SOR items at the indicative rate — edit the rate or make an analysis. A new estimate gets your default header / firm.</p>';
  }
  function applyQty(res, pid) {
    var added = 0, merged = 0;
    U.est.change(function (d) {
      if (!pid || pid === "__new" || !d.parts.some(function (p) { return p.id === pid; })) { pid = EP.uid(); d.parts.push({ id: pid, name: ("Design – " + res.title).slice(0, 60) }); }
      res.quantities.forEach(function (q) {
        var m = mapItem(q), rows = measRows(q);
        if (m) {
          var ex = U.est.dupe(d, pid, m.b, m.c);
          if (ex) { ex.meas = (ex.meas || []).concat([{ k: "h", d: "From Design Studio: " + res.title }]).concat(rows); merged++; return; }
          d.items.push({ id: EP.uid(), part: pid, b: m.b, c: m.c, q: "", rem: "", meas: [{ k: "h", d: q.description }].concat(rows) });
        } else d.items.push({ id: EP.uid(), part: pid, b: "x", x: { desc: q.description, unit: q.unit, sor: q.rate ? String(DS.core.pyround(q.rate, 2)) : "", an: "", src: "Design Studio — indicative rate, replace with quotation / analysis" }, q: "", rem: q.note || "", meas: rows });
        added++;
      });
      d.designs = (d.designs || []).concat([{ module: D.mid, mode: mode(), site: ctx().site, title: res.title, inputs: values(), status: res.status, at: new Date().toISOString(), part: pid }]);
    }, false);
    S.est.part = pid;
    return { added: added, merged: merged };
  }
  async function addQty() {
    var res = D.res; if (!res || D.adding) return;
    var sel = document.getElementById("ds-part"), pid = sel ? sel.value : "__new", dest = D.dest;
    D.adding = true; D.added = ""; U.render();
    try {
      if (dest === "other") { if (!D.destEst || !(await U.est.select(D.destEst))) throw new Error("Couldn't open that estimate"); }
      else if (dest === "new") {
        var nm = ((document.getElementById("ds-newname") || {}).value || D.newName || ("Design – " + res.title)).trim();
        var nd = U.est.newDoc(); nd.parts[0].name = ("Design – " + res.title).slice(0, 60);
        if (project() === "" && nd.header) nd.header.work = nm;
        var id = await U.est.create(nm, nd); if (!id || !S.est.cur || S.est.cur.id !== id) throw new Error("Couldn't create the estimate");
        pid = S.est.cur.doc.parts[0].id; D.newName = "";
      } else if (!S.est.cur || U.est.ro()) throw new Error("Open an estimate first");
      var r = applyQty(res, pid);
      D.added = r.added + " items added" + (r.merged ? " (" + r.merged + " merged into existing items)" : "") + " to “" + (S.est.cur.name || "estimate") + "” – part “" + ((S.est.cur.doc.parts.filter(function (p) { return p.id === S.est.part; })[0] || {}).name || "") + "”.";
      D.dest = "open"; D.part = S.est.part;
      U.toast(D.added);
    } catch (e) { U.toast(e.message || String(e)); }
    D.adding = false; U.render();
  }
  function tReports(res) {
    return '<div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn pri" id="ds-xls">⬇️ Calculation workbook (.xlsx, live formulas)</button><button type="button" class="btn sec" id="ds-html">⬇️ Full report (.html → print to PDF)</button><button type="button" class="btn sec" id="ds-pdf2">⬇️ Drawings (PDF)</button></div>' +
      '<div class="grid3" style="margin-top:10px">' + [["designed_by", "Designed by"], ["checked_by", "Checked by"], ["approved_by", "Approved by"]].map(function (f) { return '<label class="fld"><span class="lbl">' + f[1] + ' (title block)</span><input class="in" id="dsppl-' + f[0] + '" data-dsppl="' + f[0] + '" value="' + esc(D.people[f[0]] || "") + '"></label>'; }).join("") + "</div>" +
      '<p class="muted" style="font-size:12px">The workbook repeats every formula as a live Excel formula next to the app value with a ✔/✘ match column, plus BBS and quantity sheets. Open the HTML report in a browser and print to PDF for submission.</p>';
  }

  /* ------------------------------------------------------------------ drawing review */
  function viewReview() {
    var R = D.rv, RV = DS.review, h = '<div class="panel" style="padding:14px 16px;display:flex;flex-direction:column;gap:10px"><p style="margin:0">Upload a drawing to check it against Indian codes and detailing practice. <b>DXF</b> is read completely (text, layers, dimensions, bar call-outs); <b>PDF</b> text is extracted where possible; <b>images</b> need the optional AI review.</p>';
    h += '<div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end"><label class="fld grow"><span class="lbl">Drawing file</span><input type="file" class="in" id="rv-file" accept=".dxf,.pdf,.png,.jpg,.jpeg,.webp"></label><label class="fld"><span class="lbl">Drawing type</span><select class="in" id="rv-type">' + RV.DRAWING_TYPES.map(function (t) { return "<option" + (t === R.type ? " selected" : "") + ">" + esc(t) + "</option>"; }).join("") + '</select></label><label class="fld ds-chk"><input type="checkbox" id="rv-cmp"' + (R.cmp ? " checked" : "") + (D.res ? "" : " disabled") + "> Compare with current design" + (D.res ? " (" + esc(D.res.title) + ")" : "") + "</label></div>";
    if (R.name) h += '<div class="muted">File: <b>' + esc(R.name) + "</b></div>";
    (R.warnings || []).forEach(function (w) { h += '<div class="badge warn" style="white-space:normal">' + esc(w) + "</div>"; });
    var out = R.out;
    if (out) {
      var cnt = function (sev) { return out.findings.filter(function (f) { return f.severity === sev; }).length; };
      h += '<div class="ds-sum"><div class="stat"><div class="lbl">Review score</div><div class="v">' + out.score + ' / 100</div></div><div class="stat"><div class="lbl">Critical</div><div class="v">' + cnt("Critical") + '</div></div><div class="stat"><div class="lbl">Important</div><div class="v">' + cnt("Important") + '</div></div><div class="stat"><div class="lbl">Advisory</div><div class="v">' + cnt("Advisory") + "</div></div></div>";
      h += tableHtml({ columns: ["Severity", "Item", "Found", "Suggestion"], rows: out.findings.map(function (f) { return [f.severity, f.item, f.detail, f.suggestion]; }) });
      if (out.compare && out.compare.length) h += "<h3>Design ↔ drawing comparison</h3>" + tableHtml(DS.core.table(out.compare));
      var ex = out.extract;
      h += '<details><summary>What was read from the drawing</summary><div class="mono" style="font-size:12px;white-space:pre-wrap">' + esc(JSON.stringify({ "Concrete grades": ex.concrete, "Steel grades": ex.steel, "Covers (mm)": ex.covers, "Scales 1:": ex.scales, "Steel sections": ex.sections, "Bolts M": ex.bolts }, null, 1)) + "</div>" + ((ex.spaced || []).concat(ex.counted || []).length ? tableHtml(DS.core.table((ex.spaced || []).concat(ex.counted || []))) : "") + (R.doc ? '<div class="mono" style="font-size:12px;white-space:pre-wrap">' + esc(JSON.stringify({ "DXF version": R.doc.version, Units: RV.INSUNITS[R.doc.units] || R.doc.units, Layers: (R.doc.layers || []).slice(0, 60), Entities: R.doc.counts }, null, 1)) + "</div>" : "") + "</details>";
      if (R.doc && R.doc.entities && R.doc.entities.length) h += "<h3>Preview</h3><div class='ds-sheet'>" + DS.drawing.to_svg(RV.dxf_preview(R.doc, R.name), 1500).replace(/^<\?xml[^>]*>/, "") + "</div>";
    } else if (R.name && !R.busy) h += '<p class="muted">No text could be read from this file' + (R.isImg ? " (image)" : "") + ". Use the AI review below" + (R.isImg ? "" : ", or upload the DXF") + ".</p>";
    if (R.busy) h += '<p class="muted">Reading the drawing…</p>';
    if (R.name) {
      h += '<details' + (R.aiOpen ? " open" : "") + ' id="rv-ai"><summary>🤖 AI review (optional — your own Anthropic API key)</summary><p class="muted" style="font-size:12px">The drawing and the checklist are sent to the Anthropic API with your key for this request only; the key is not stored. API usage is billed to your account.</p>' +
        '<div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end"><label class="fld grow"><span class="lbl">API key</span><input class="in" type="password" id="rv-key" autocomplete="off"></label><label class="fld"><span class="lbl">Model</span><select class="in" id="rv-model">' + RV.AI_MODELS.map(function (m) { return "<option" + (m === R.model ? " selected" : "") + ">" + m + "</option>"; }).join("") + '</select></label></div><label class="fld"><span class="lbl">Context for the reviewer (optional)</span><textarea class="in" rows="2" id="rv-ctx">' + esc(R.ctx || (R.cmp && D.res ? "Design summary: " + Object.keys(D.res.summary).map(function (k) { return k + ": " + D.res.summary[k]; }).join("; ") : "")) + '</textarea></label><button type="button" class="btn pri sm" id="rv-go"' + (R.aiBusy ? " disabled" : "") + ">" + (R.aiBusy ? "Reviewing the drawing…" : "Run AI review") + "</button>" + (R.ai ? '<div class="ds-ai">' + esc(R.ai).replace(/\n/g, "<br>") + "</div>" : "") + (R.aiErr ? '<p class="badge dan" style="white-space:normal">' + esc(R.aiErr) + "</p>" : "") + "</details>";
    }
    return h + "</div>";
  }
  function doReview() {
    var R = D.rv, RV = DS.review;
    if (!R.bytes) return;
    R.warnings = []; R.out = null; R.doc = null; R.isImg = /\.(png|jpe?g|webp)$/i.test(R.name);
    var finish = function (texts) {
      try { R.out = (texts.length || R.doc) ? RV.review(texts, R.type || RV.DRAWING_TYPES[0], R.doc, R.cmp && D.res ? D.res : null) : null; } catch (e) { R.warnings.push("Review failed: " + e.message); }
      R.busy = false; U.render();
    };
    if (/\.dxf$/i.test(R.name)) {
      var txt; try { txt = new TextDecoder("utf-8", { fatal: true }).decode(R.bytes); } catch (e) { txt = new TextDecoder("latin1").decode(R.bytes); }
      try { R.doc = RV.parse_dxf(txt); R.warnings = (R.doc.warnings || []).slice(); finish(R.doc.texts.map(function (t) { return t[0]; })); } catch (e) { R.warnings.push("Could not read the DXF: " + e.message); finish([]); }
    } else if (/\.pdf$/i.test(R.name)) {
      R.busy = true; U.render();
      RV.pdf_text_async(R.bytes).then(function (t) { var lines = String(t).split(/\r?\n/).filter(function (l) { return l.trim(); }); if (lines.length < 5) R.warnings.push("Little or no text could be extracted from this PDF (scanned or outlined fonts). Use the AI review below, or upload the DXF."); finish(lines); }).catch(function (e) { R.warnings.push("Could not read the PDF: " + e.message); finish([]); });
    } else finish([]);
  }

  /* ------------------------------------------------------------------ references */
  /* ---- Load guide: simplified loads for general and mining sites, with "use this value" for the open module */
  function viewLoads() {
    var LG = DS.loadguide, sp = spec(), md = mode(), v = values(), f = D.lgf, q = (D.lgq || "").toLowerCase();
    var h = '<div class="panel ds-in"><div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end"><div class="grow" style="min-width:260px"><h2 style="margin:0">Load guide <span class="muted" style="font-size:.6em;font-weight:500">भार मार्गदर्शिका</span></h2><p class="muted" style="margin:4px 0 0">Plain-language loads for general sites and SECL coal-mine sites — unit weights, imposed loads, dumpers and HEMM, CHP, electrical, railway, road, surcharge, wind and seismic — with how to apply each value. Tags: <b>[CODE]</b> mandatory · <b>[GP]</b> good practice · <b>[ASSUMPTION]</b> verify before issue.</p></div>' +
      '<div class="seg" role="group" aria-label="Show">' + [["all", "All"], ["general", "General site"], ["mine", "⛏️ Mining area"], ["railway", "🚆 Railway"]].map(function (x) { return '<button type="button" data-lgf="' + x[0] + '" aria-pressed="' + (f === x[0]) + '">' + x[1] + "</button>"; }).join("") + '</div><label class="fld"><span class="lbl">Search</span><input class="in" id="lg-q" value="' + esc(D.lgq || "") + '" placeholder="e.g. dumper, coal, crane"></label></div></div>';
    // values for the open module
    var rows = sp.params.filter(function (p) { return p.modes.indexOf(md) >= 0 && LG.params[p.key]; });
    if (rows.length) {
      h += '<div class="panel ds-out"><h3 style="margin:0">For the open module: ' + esc(sp.icon + " " + sp.name) + '</h3><div class="tw"><table class="t"><thead><tr><th>Input</th><th class="num">Your value</th><th>General site</th><th>⛏️ Mining area</th></tr></thead><tbody>' + rows.map(function (p) {
        var g = LG.params[p.key], cell = function (x, site) { if (!x) return "—"; var can = String(x.value) !== String(v[p.key]) && (p.kind !== "select" || p.options.some(function (o) { return String(o) === String(x.value); })); return "<b>" + esc(String(x.value)) + "</b> " + esc(p.unit && typeof x.value === "number" ? p.unit : "") + '<div class="muted" style="font-size:12px">' + esc(x.note || "") + "</div>" + (can ? '<button type="button" class="linkbtn" data-dsuse="' + esc(p.key) + '" data-val="' + esc(String(x.value)) + '" data-lg="1">Use ' + (site === "mine" ? "mine" : "general") + " value</button>" : ""); };
        return "<tr><td>" + esc(p.label) + "</td><td class='num'>" + esc(String(v[p.key])) + "</td><td>" + cell(g.general, "general") + "</td><td>" + cell(g.mine, "mine") + "</td></tr>";
      }).join("") + "</tbody></table></div><p class='muted' style='font-size:12px;margin:0'>Tip: choose <b>Mining area</b> on the Design page and the safer mining values are applied automatically during the design.</p></div>";
    }
    LG.categories.forEach(function (cat) {
      if (f !== "all" && cat.site !== "both" && cat.site !== f) return;
      var items = cat.items.filter(function (it) { return !q || (it.name + " " + it.note + " " + it.apply + " " + cat.title).toLowerCase().indexOf(q) >= 0; });
      if (!items.length) return;
      h += '<details class="ds-grp"' + (q ? " open" : "") + "><summary>" + esc(cat.title) + ' <span class="muted" style="font-weight:400">' + esc(cat.hi || "") + (cat.site === "mine" ? " · ⛏️ mine" : "") + " · " + items.length + "</span></summary>" + tableHtml({ columns: ["Item", "Value", "Unit", "How to apply", "Impact / factor", "Note", "Source"], rows: items.map(function (it) { return [it.name, String(it.value), it.unit, it.apply, it.impact, it.note, it.source]; }) }) + "</details>";
    });
    if (f === "all" || f === "mine") {
      var mp = LG.mine_profile;
      h += '<details class="ds-grp"' + (q ? "" : " open") + "><summary>⛏️ Mining-area factor of safety and checklist</summary>";
      h += tableHtml({ columns: ["Check", "Minimum FoS"], rows: [["Overturning", mp.stability_fos.overturning + " (seismic " + mp.stability_fos.overturning_seismic + ")"], ["Sliding", mp.stability_fos.sliding + " (seismic " + mp.stability_fos.sliding_seismic + ")"], ["Uplift (sumps, boxes, tanks)", mp.stability_fos.uplift], ["Bearing on ultimate capacity", mp.stability_fos.bearing_fos_on_ultimate], ["SBC on mine / reclaimed ground", "× " + mp.sbc_reduction_factor.value + " (" + mp.sbc_reduction_factor.note + ")"], ["Imposed-load dynamic factor", mp.live_load_dynamic_factor.value + " general, " + mp.live_load_dynamic_factor.vibrating + " vibrating floors"], ["Crack width (mm)", "general " + mp.crack_width.general + " · water-retaining " + mp.crack_width.water_retaining + " · aggressive " + mp.crack_width.aggressive]] });
      var B = mp.blast_ppv_limits;
      h += "<h4>Blast vibration – peak particle velocity limits (" + esc(B.unit) + ")</h4>" + tableHtml({ columns: ["Structure (not owned by the mine)"].concat(B.bands), rows: Object.keys(B.not_owner).map(function (k) { return [k.replace(/_/g, " ")].concat(B.not_owner[k]); }) }) + '<p class="muted" style="font-size:12px">' + esc(B.source + " · " + B.note) + "</p>";
      h += "<h4>Checklist</h4>" + mp.checklist.map(function (x) { return '<div class="ds-msg ' + (x.level === "critical" ? "dan" : x.level === "important" ? "warn" : "") + '"><b>' + esc(x.level) + "</b> – " + esc(x.text) + "</div>"; }).join("");
      h += "<h4>Dumper presets</h4>" + tableHtml({ columns: ["Class", "GVW (t)", "Front axle share", "Tyre width (m)", "Rear track (m)", "Wheelbase (m)"], rows: LG.dumpers.map(function (d) { return [d.name, d.gvw_t, d.front_frac, d.tyre_b, d.track_r, d.wheelbase]; }) });
      h += "</details>";
    }
    return h;
  }
  function viewRef() {
    var refs = {}; Object.keys(MODS()).forEach(function (m) { (MODS()[m].references || []).forEach(function (r) { (refs[r] = refs[r] || []).push(MODS()[m].name); }); });
    var rows = Object.keys(refs).sort().map(function (r) { return [r, refs[r].filter(function (x, i, a) { return a.indexOf(x) === i; }).sort().join(", ")]; });
    return '<div class="panel" style="padding:14px 16px"><h3 style="margin-top:0">Codes and reference books used by the modules</h3>' + tableHtml({ columns: ["Reference", "Used in"], rows: rows }) + '<p class="muted" style="font-size:12px">Keep licensed copies of the IS / IRC codes — the app implements their clauses and formulas, not their text.</p><h3>Thumb rules (quick checks for estimators and site engineers)</h3>' + tableHtml(DS.thumbrules.table()) + "</div>";
  }

  /* ------------------------------------------------------------------ events */
  function setInput(k, val) { var sp = spec(), p = sp.params.filter(function (x) { return x.key === k; })[0]; if (!p) return; var cur = D.inputs[D.mid] = D.inputs[D.mid] || {};
    if (p.kind === "bool") cur[k] = !!val; else if (p.kind === "select") { var o = p.options.filter(function (x) { return String(x) === String(val); })[0]; cur[k] = o === undefined ? val : o; } else if (p.kind === "text") cur[k] = String(val);
    else { var n = EP.ev(val); if (n == null) { U.toast("Enter a number for " + p.label); return; } if (p.min != null && n < p.min) n = p.min; if (p.max != null && n > p.max) n = p.max; if (p.kind === "int") n = Math.round(n); cur[k] = n; }
    // keep dependent selects valid (e.g. culvert location → live-load options of that location only)
    var vv = DS.core.inputs_with_defaults(sp, cur);
    sp.params.forEach(function (q) { if (q.kind !== "select" || !q.filter) return; var ok = q.options.filter(function (o) { return q.filter(o, vv); }); if (ok.length && !ok.some(function (o) { return String(o) === String(vv[q.key]); })) { cur[q.key] = ok[0]; vv[q.key] = ok[0]; } });
    persist(); U.render(); }
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("button"); if (!t || !t.closest(".ds")) return; var ds = t.dataset;
    if (ds.dsv) { D.view = ds.dsv; U.render(); return; }
    if (ds.dsm) { D.mid = ds.dsm; D.sheet = 0; D.secs = ""; persist(); U.render(); return; }
    if (ds.dsmode) { D.modes[D.mid] = ds.dsmode; persist(); U.render(); return; }
    if (ds.dst) { D.sub = ds.dst; U.render(); return; }
    if (ds.dsctx) { var kv = ds.dsctx.split(":"); D.ctx[kv[0]] = kv[1]; D.dg = null; persist(); U.render(); return; }
    if (ds.lgf) { D.lgf = ds.lgf; U.render(); return; }
    if (ds.dsuse) { setInput(ds.dsuse, ds.val); U.toast("Set " + ds.dsuse + " = " + ds.val + (ds.lg ? " — back on the Design page the result is updated" : "")); return; }
    if (ds.dsapply) { var val; try { val = JSON.parse(ds.val); } catch (er) { val = ds.val; } setInput(ds.dsapply, val); U.toast("Applied – result recalculated. Run the diagnosis again if anything still fails."); return; }
    if (ds.dsdest) { D.dest = ds.dsdest; D.part = ""; D.added = ""; U.render(); return; }
    if (ds.dsfc) { D.fc = +ds.dsfc; D.sub = "fc"; U.render(); return; }
    var res = D.res, mid = D.mid;
    if (t.id === "ds-reset") { delete D.inputs[mid]; persist(); U.render(); return; }
    if (t.id === "ds-save") { dl(JSON.stringify({ module: mid, mode: mode(), inputs: values() }, null, 1), mid + "_inputs.json", "application/json"); return; }
    if (!res) return;
    if (t.id === "ds-pdf" || t.id === "ds-pdf2") { dl(new Blob([DS.drawing.to_pdf(res.drawings)], { type: "application/pdf" }), mid + "_drawings.pdf"); return; }
    if (t.id === "ds-3d") { var m3 = DS.to3d && DS.to3d.build(mid, values(), res); if (!m3 || !m3.parts.length) { U.toast("3D model is not available for this module yet"); return; } if (EP.cad && EP.cad.sendModel) EP.cad.sendModel(m3, (res.title || mid) + " – 3D model", mid); return; }
    if (t.id === "ds-cad") { if (EP.cad && EP.cad.openSheets) { var m4 = null; try { m4 = DS.to3d && DS.to3d.build(mid, values(), res); } catch (er) { console.error(er); } EP.cad.openSheets(res.drawings, (res.title || mid) + " – drawings", m4, mid); } return; }
    if (t.id === "ds-dxf") { dl(new Blob([DS.drawing.to_dxf(res.drawings)], { type: "application/dxf" }), mid + "_drawings.dxf"); return; }
    if (t.id === "ds-svg") { var sh = res.drawings[D.sheet]; dl(new Blob([DS.drawing.to_svg(sh, 1600)], { type: "image/svg+xml" }), mid + "_" + sh.number + ".svg"); return; }
    if (t.id === "ds-bbscsv") { var csv = [["Member", "Mark", "Dia", "Shape", "Nos", "Cut length (m)", "Total (m)", "Weight (kg)", "Note", "How the cut length is found"]].concat(res.bbs.map(function (b) { return [b.member, b.mark, b.dia, b.shape, b.nos, b.cut_length, DS.core.pyround(b.total_length, 2), DS.core.pyround(b.weight, 2), b.note, b.formula || ""]; })).map(function (r) { return r.map(function (x) { x = String(x == null ? "" : x); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(","); }).join("\n"); dl(new Blob(["﻿" + csv], { type: "text/csv" }), mid + "_bbs.csv"); return; }
    if (t.id === "ds-xls") { try { var x = DS.report.excel_report(res, project(), mode(), company()); dl(x.blob, mid + "_calculation.xlsx"); } catch (er) { console.error(er); U.toast("Couldn't create the workbook: " + er.message); } return; }
    if (t.id === "ds-html") { dl(new Blob([DS.report.html_report(res, project(), mode(), true, company())], { type: "text/html" }), mid + "_report.html"); return; }
    if (t.id === "ds-addq") { addQty(); return; }
    if (t.id === "ds-dg") { startDiag(); U.render(); return; }
    if (t.id === "ds-site-reset") { D.siteCfg = {}; persist(); U.render(); return; }
    if (t.id === "ds-bbs-reset") { D.bbsCfg = {}; persist(); U.render(); return; }
    if (t.id === "ds-bbs-unedit") { delete D.bbsEdits[editKey()]; persist(); U.render(); return; }
    if (t.id === "ds-openest") { U.setTab("estimates"); return; }
    if (t.id === "rv-go") {
      var R = D.rv, key = (document.getElementById("rv-key") || {}).value || ""; if (!key) { U.toast("Enter your Anthropic API key"); return; }
      R.model = (document.getElementById("rv-model") || {}).value; R.ctx = (document.getElementById("rv-ctx") || {}).value; R.aiBusy = true; R.ai = ""; R.aiErr = ""; R.aiOpen = true; U.render();
      var mime = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" }[(R.name.split(".").pop() || "").toLowerCase()] || "";
      DS.review.ai_review(key, R.model || DS.review.AI_MODELS[0], R.doc ? new Uint8Array(0) : R.bytes, mime, R.type || DS.review.DRAWING_TYPES[0], R.ctx || "", R.doc ? DS.review.dxf_summary_text(R.doc) : "")
        .then(function (txt) { R.ai = txt; }).catch(function (er) { R.aiErr = er.message || String(er); }).then(function () { R.aiBusy = false; U.render(); });
      return;
    }
  });
  document.addEventListener("change", function (e) {
    var t = e.target; if (!t.closest || !t.closest(".ds")) return;
    if (t.dataset.dsp) { setInput(t.dataset.dsp, t.type === "checkbox" ? t.checked : t.value); return; }
    if (t.id === "ds-sheet") { D.sheet = +t.value; U.render(); return; }
    if (t.id === "ds-secs") { D.secs = t.value; U.render(); return; }
    if (t.id === "ds-only") { D.only = t.checked; U.render(); return; }
    if (t.id === "ds-fcpick") { D.fc = +t.value; U.render(); return; }
    if (t.dataset.dsfv) { var o = D.fcv[D.fc] = D.fcv[D.fc] || {}; if (t.value.trim()) o[t.dataset.dsfv] = t.value; else delete o[t.dataset.dsfv]; U.render(); return; }
    if (t.id === "ds-part") { D.part = t.value; return; }
    if (t.dataset.dssite) { var sv_ = t.value.trim(); if (sv_ === "") delete D.siteCfg[t.dataset.dssite]; else D.siteCfg[t.dataset.dssite] = t.dataset.dssite === "exposure" ? sv_ : EP.ev(sv_); persist(); U.render(); return; }
    if (t.dataset.dsbbsr) { var bv = EP.ev(t.value); if (t.value.trim() === "" || bv == null) delete D.bbsCfg[t.dataset.dsbbsr]; else D.bbsCfg[t.dataset.dsbbsr] = bv; persist(); U.render(); return; }
    if (t.dataset.dsbe) {
      var pr = t.dataset.dsbe.split("|"), mk = pr[0], fld = pr[1], ek = editKey(), ev = EP.ev(t.value), row = (D.res && D.res.bbs || []).filter(function (b) { return b.mark === mk; })[0];
      var all = D.bbsEdits[ek] = D.bbsEdits[ek] || {}, e = all[mk] = all[mk] || {};
      var appv = row && row.app ? (fld === "cut" ? row.app.cut : fld === "nos" ? row.app.nos : row.app.dia) : null;
      if (t.value.trim() === "" || ev == null || (appv != null && +ev === +appv)) delete e[fld]; else e[fld] = ev;
      if (!Object.keys(e).length) delete all[mk]; if (!Object.keys(all).length) delete D.bbsEdits[ek];
      persist(); U.render(); return;
    }
    if (t.id === "ds-destest") { D.destEst = t.value; D.part = ""; U.render(); return; }
    if (t.id === "ds-newname") { D.newName = t.value; return; }
    if (t.id === "lg-q") { D.lgq = t.value; U.render(); return; }
    if (t.id === "ds-cpwd") { D.cpwd = t.value; U.render(); return; }
    if (t.dataset.dsppl) { D.people[t.dataset.dsppl] = t.value; persist(); D.key = ""; U.render(); return; }
    if (t.id === "ds-load" && t.files && t.files[0]) {
      t.files[0].text().then(function (txt) { try { var j = JSON.parse(txt); if (!j.module || !MODS()[j.module]) throw new Error("not a Design Studio inputs file"); D.mid = j.module; D.inputs[j.module] = j.inputs || {}; if (j.mode) D.modes[j.module] = j.mode; persist(); U.render(); U.toast("Inputs loaded"); } catch (er) { U.toast("Invalid inputs file: " + er.message); } });
      return;
    }
    if (t.id === "rv-file" && t.files && t.files[0]) { var f = t.files[0]; f.arrayBuffer().then(function (b) { D.rv.bytes = new Uint8Array(b); D.rv.name = f.name; D.rv.ai = ""; D.rv.aiErr = ""; doReview(); U.render(); }); return; }
    if (t.id === "rv-type") { D.rv.type = t.value; doReview(); U.render(); return; }
    if (t.id === "rv-cmp") { D.rv.cmp = t.checked; doReview(); U.render(); return; }
  });
})();
