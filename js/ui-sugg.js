/* Estimate Pro — "Suggested items": work-type categories (buildings, roads, drains, garden, dust suppression,
   interior, cladding …) with the usual SOR items grouped by stage, plus common non-SOR items. Tick and add to a part. */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc, inr = U.inr;
  var G = { data: null, err: false, loading: false, g: null, c: null, sel: {}, q: "", ed: null };
  try { G.ed = localStorage.getItem("ep_sugg_ed"); } catch (e) {}
  function ed() { if (!G.ed || !EP.BOOKS[G.ed]) G.ed = EP.BOOKS.cpwd23 ? "cpwd23" : "cpwd"; return G.ed; }
  /* template item → [book, code]; CPWD entries ["C", code2021, code2023] follow the chosen edition */
  function res(it) {
    if (!Array.isArray(it)) return null;
    if (it[0] !== "C") return it;
    var e = ed(), c = e === "cpwd23" ? it[2] : it[1];
    if (c && EP.item(e, c)) return [e, c];
    var o = e === "cpwd23" ? "cpwd" : "cpwd23", c2 = o === "cpwd23" ? it[2] : it[1];
    return c2 && EP.item(o, c2) ? [o, c2] : null;
  }
  function nsRate(it) { if (!it.an) return null; var c = EP.nsCalc({ ns: it.an }); return c && c.rate ? c.rate : null; }
  function E() { return U.est; }
  function load() {
    if (G.data || G.loading) return; G.loading = true;
    fetch("templates.json").then(function (r) { if (!r.ok) throw new Error("templates"); return r.json(); })
      .then(function (j) { G.data = j; G.g = j.groups[0].id; G.loading = false; U.render(); })
      .catch(function () { G.err = true; G.loading = false; U.render(); });
  }
  /* ready NS analysis for a description (items added earlier, or typed with the same text) */
  function norm(t) { return String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
  U.nsReady = function (desc) {
    if (!G.data) { load(); return null; }
    var n = norm(desc), best = null;
    if (!n) return null;
    G.data.groups.forEach(function (g) { g.cats.forEach(function (c) { c.sec.forEach(function (s) { s.it.forEach(function (it) {
      if (best || Array.isArray(it) || !it.an) return;
      var m = norm(it.ns); if (m === n || (n.length > 25 && (m.indexOf(n) === 0 || n.indexOf(m) === 0))) best = it;
    }); }); }); });
    return best;
  };
  function grp() { return (G.data.groups.filter(function (g) { return g.id === G.g; })[0]) || G.data.groups[0]; }
  function cat() { var c = null; G.data.groups.forEach(function (g) { g.cats.forEach(function (x) { if (x.id === G.c) c = x; }); }); return c; }
  function key(it) { var r = res(it); return r ? r[0] + "|" + r[1] : "ns|" + it.ns; }
  function info(it) {
    if (!Array.isArray(it)) return { code: "NS", desc: it.ns, unit: it.u, rate: it.r != null ? it.r : nsRate(it), mkt: it.r != null, book: "Non-SOR", hint: it.hint, ns: true, an: !!it.an };
    var r = res(it); if (!r) return null;
    var x = EP.item(r[0], r[1]); if (!x) return null;
    var a = EP.anRate ? EP.anRate(r[0], r[1]) : null;
    return { code: x.code, desc: x.desc, unit: x.unit, rate: x.sor, upd: a, book: (EP.BOOKS[r[0]] || {}).name || r[0], b: r[0], other: it[0] === "C" && r[0] !== ed() };
  }
  function inPart(d, part) {
    var s = {}; EP.partItems(d, part).forEach(function (i) { if (i.b === "x") s["ns|" + ((i.x || {}).desc || "")] = 1; else s[i.b + "|" + i.c] = 1; }); return s;
  }
  function count(c) { return c.sec.reduce(function (n, s) { return n + s.it.length; }, 0); }
  function matches(inf) { if (!G.q) return true; var q = G.q.toLowerCase().split(/\s+/); var t = (inf.code + " " + inf.desc).toLowerCase(); return q.every(function (w) { return t.indexOf(w) >= 0; }); }

  U.suggView = function (d) {
    load();
    var h = '<div class="sg">';
    if (G.err) return h + '<div class="panel empty">Couldn\'t load the suggested items list. Check your connection and reload.</div></div>';
    if (!G.data) return h + '<div class="panel empty">Loading suggested items…</div></div>';
    var R = E().ro(), part = E().curPart();
    h += '<div class="sg-intro muted">Pick the schedule and the type of work, tick the items you need and add them to a part in one go. Then open each item to enter its measurements. Items marked <span class="badge warn">NS</span> are not in any SOR — they come in as non-SOR items for a market rate or rate analysis. <b>Market items 2026</b> and <b>E&amp;M</b> carry indicative rates (≈) — replace them with quotations.</div>';
    var e0 = ed();
    h += '<div class="sg-ed"><span class="lbl">CPWD items from</span><div class="seg" role="group" aria-label="CPWD schedule">' + [["cpwd23", "DSOR 2023 (DAR 2023 analysis)"], ["cpwd", "DSR 2021"]].filter(function (x) { return EP.BOOKS[x[0]]; }).map(function (x) { return '<button type="button" data-sged="' + x[0] + '" aria-pressed="' + (e0 === x[0]) + '">' + x[1] + "</button>"; }).join("") + '</div><span class="muted" style="font-size:12px">Choose first — the CPWD items below switch to this schedule. MPPWD road and Horticulture items stay the same.</span></div>';
    var dep = EP.dept ? EP.dept() : null, GR = G.data.groups.filter(function (g) { return !dep || dep.groups(g.id); });
    if (GR.length && !GR.some(function (g) { return g.id === G.g; })) { G.g = GR[0].id; G.c = null; }
    if (dep && dep.id !== "civil") h += '<div class="badge info" style="white-space:normal">Department: ' + esc(dep.name) + " (" + dep.status + ") — " + esc(dep.blurb) + "</div>";
    h += '<div class="seg wrap sg-groups" role="group" aria-label="Work type">' + GR.map(function (g) { return '<button type="button" data-sgg="' + g.id + '" aria-pressed="' + (g.id === G.g && !G.c) + '">' + esc(g.t) + ' <span class="cnt">' + esc(g.hi) + "</span></button>"; }).join("") + "</div>";
    var c = G.c ? cat() : null;
    if (!c) {
      var g = grp();
      h += '<div class="sg-cards">' + g.cats.map(function (x) { return '<button type="button" class="panel sg-card" data-sgc="' + x.id + '"><strong>' + esc(x.t) + '</strong><span class="sg-hi">' + esc(x.hi) + '</span><span class="muted">' + esc(x.d) + '</span><span class="badge info">' + count(x) + " items · " + x.sec.length + " stages</span></button>"; }).join("") + "</div>";
      return h + "</div>";
    }
    var have = inPart(d, part), nSel = Object.keys(G.sel).length;
    h += '<div class="panel sg-cat"><div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-start"><button type="button" class="btn ghost sm" id="sg-back">← All ' + esc(grp().t.toLowerCase()) + '</button><div class="grow" style="min-width:200px"><h3 style="margin:0">' + esc(c.t) + ' <span class="sg-hi">' + esc(c.hi) + '</span></h3><div class="muted">' + esc(c.d) + '</div></div><input class="in" id="sg-q" placeholder="Filter these items…" value="' + esc(G.q) + '" aria-label="Filter items" autocomplete="off" style="max-width:240px"></div>';
    c.sec.forEach(function (s, si) {
      var rows = s.it.map(function (it) { return { it: it, inf: info(it) }; }).filter(function (r) { return r.inf && matches(r.inf); });
      if (!rows.length) return;
      var all = rows.every(function (r) { return G.sel[key(r.it)]; });
      h += '<div class="sg-sec"><label class="sg-sh"><input type="checkbox" data-sgall="' + si + '"' + (all ? " checked" : "") + (R ? " disabled" : "") + "> <strong>" + esc(s.t) + '</strong> <span class="muted">(' + rows.length + ")</span></label>";
      rows.forEach(function (r) {
        var k = key(r.it), inf = r.inf, on = !!G.sel[k], got = have[k];
        var rb = res(r.it) || [];
        h += '<label class="sg-row' + (on ? " on" : "") + '" data-pic="' + esc(rb.length === 2 && !inf.ns ? rb[0] + "|" + rb[1] : "|") + '"><input type="checkbox" data-sgk="' + esc(k) + '"' + (on ? " checked" : "") + (R ? " disabled" : "") + '><span class="sg-code">' + (inf.ns ? '<span class="badge warn">NS</span>' : "<strong>" + esc(inf.code) + '</strong><span class="muted">' + esc(inf.book) + "</span>") + '<button type="button" class="pic-b" data-picb="1" title="Picture of this item" aria-label="Picture of this item">🖼</button></span><span class="sg-desc" title="' + esc(inf.desc) + '">' + esc(inf.desc) + (inf.hint ? '<span class="muted sg-hint">Rate: ' + esc(inf.hint) + (inf.an ? ' · <span class="badge info">rate analysis ready</span>' : "") + "</span>" : "") + (inf.other ? ' <span class="badge warn">not in the chosen schedule — ' + esc(inf.book) + "</span>" : "") + (got ? ' <span class="badge ed">Already in this part</span>' : "") + '</span><span class="sg-u">' + esc(inf.unit) + '</span><span class="sg-r num">' + (inf.rate != null ? (inf.ns ? "≈ " : "") + "₹" + inr(inf.rate) + (inf.upd != null && Math.abs(inf.upd - inf.rate) > 0.004 ? '<br><span class="badge ed">₹' + inr(inf.upd) + "</span>" : "") : '<span class="muted">your rate</span>') + "</span></label>";
      });
      h += "</div>";
    });
    h += "</div>";
    if (!R) h += '<div class="sg-bar panel"><span class="grow"><strong>' + nSel + "</strong> item" + (nSel === 1 ? "" : "s") + " selected</span>" + (nSel ? '<button type="button" class="btn ghost sm" id="sg-clear">Clear</button>' : "") + '<label class="row" style="gap:6px">Add to <select class="in" id="sg-part" aria-label="Part">' + d.parts.map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === part ? " selected" : "") + ">" + esc(p.name) + "</option>"; }).join("") + '</select></label><button type="button" class="btn pri" id="sg-add"' + (nSel ? "" : " disabled") + ">Add selected</button></div>";
    return h + "</div>";
  };
  U.suggOpen = function () { S.est.sub = "sugg"; U.render(); window.scrollTo({ top: 0 }); };

  function addSelected() {
    var d = E().doc(); if (!d || E().ro()) return;
    var part = (document.getElementById("sg-part") || {}).value || E().curPart(), have = inPart(d, part), keys = [], skipped = 0;
    // keep the template order
    G.data.groups.forEach(function (g) { g.cats.forEach(function (c) { c.sec.forEach(function (s) { s.it.forEach(function (it) { var k = key(it); if (G.sel[k] && keys.indexOf(k) < 0) keys.push(k); }); }); }); });
    var added = 0;
    E().change(function (dd) {
      keys.forEach(function (k) {
        if (have[k]) { skipped++; return; }
        have[k] = 1;
        var p = k.split("|"), id = EP.uid();
        if (p[0] === "ns") {
          var src = null; G.data.groups.forEach(function (g) { g.cats.forEach(function (c) { c.sec.forEach(function (s) { s.it.forEach(function (it) { if (!Array.isArray(it) && "ns|" + it.ns === k) src = it; }); }); }); });
          var xx = { desc: src.ns, unit: src.u, sor: src.r != null ? String(src.r) : "", an: "", src: src.an ? "NS item — rate analysis attached" : src.r != null ? "Indicative market rate 2026 — replace with quotation" : "As per market quote" };
          if (src.an) xx.ns = JSON.parse(JSON.stringify(src.an));
          dd.items.push({ id: id, part: part, b: "x", x: xx, q: "", rem: "", meas: [] });
        } else dd.items.push({ id: id, part: part, b: p[0], c: p.slice(1).join("|"), q: "", rem: "", meas: [] });
        added++;
      });
    });
    G.sel = {};
    U.toast(added + " item" + (added === 1 ? "" : "s") + " added" + (skipped ? " (" + skipped + " already there)" : "") + " — open each with “Measure” to enter quantities");
    return part;
  }

  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("button"); if (!t || !t.closest(".sg")) return;
    if (t.dataset.sged) { G.ed = t.dataset.sged; G.sel = {}; try { localStorage.setItem("ep_sugg_ed", G.ed); } catch (x) {} U.render(); return; }
    if (t.dataset.sgg) { G.g = t.dataset.sgg; G.c = null; G.q = ""; U.render(); return; }
    if (t.dataset.sgc) { G.c = t.dataset.sgc; G.q = ""; U.render(); window.scrollTo({ top: 0 }); return; }
    if (t.id === "sg-back") { G.c = null; G.q = ""; U.render(); return; }
    if (t.id === "sg-clear") { G.sel = {}; U.render(); return; }
    if (t.id === "sg-add") { var part = addSelected(); S.est.part = part; S.est.sub = "items"; U.render(); window.scrollTo({ top: 0 }); }
  });
  document.addEventListener("change", function (e) {
    var t = e.target; if (!t.closest || !t.closest(".sg")) return;
    if (t.dataset.sgk) { if (t.checked) G.sel[t.dataset.sgk] = 1; else delete G.sel[t.dataset.sgk]; U.render(); return; }
    if (t.dataset.sgall != null) {
      var c = cat(), s = c && c.sec[+t.dataset.sgall]; if (!s) return;
      s.it.forEach(function (it) { var inf = info(it); if (!inf || !matches(inf)) return; if (t.checked) G.sel[key(it)] = 1; else delete G.sel[key(it)]; });
      U.render();
    }
  });
  document.addEventListener("input", function (e) {
    if (e.target.id !== "sg-q") return; G.q = e.target.value; var pos = e.target.selectionStart; U.render();
    var n = document.getElementById("sg-q"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) {} }
  });
})();
