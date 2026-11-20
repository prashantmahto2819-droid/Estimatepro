/* Estimate Pro — change the SOR item of an estimate line without touching its measurement, and share one measurement
   between several items.
   * Replace: the line keeps its measurement rows, part and remark; only book + item code change. If the new item is in
     another unit of the same kind (kg → tonne, cum → litre …) the measurement stays in its own unit and a factor converts
     the net quantity (it.qu / it.qk). Analysis edits made for the old item are removed.
   * Upgrade: suggests DSR 2021 → DSOR 2023 and MPPWD 2017 → MPPWD 2025 replacements for all items at once.
   * Share: adds a "same as item …" row to other items (or to a new item) so one measurement feeds 2–3 items. */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc, inr = U.inr;
  S.rep = { open: {}, q: {}, share: {}, sel: {}, up: null };
  function E() { return U.est; }
  var NEWER = { cpwd: "cpwd23", mp: "mp25" };
  var STOP = { the: 1, and: 1, with: 1, for: 1, including: 1, all: 1, complete: 1, per: 1, from: 1, into: 1, upto: 1, "as": 1, etc: 1, any: 1, its: 1, this: 1, that: 1, are: 1, not: 1, has: 1, been: 1, shall: 1, other: 1, specified: 1, specifications: 1, specification: 1, clause: 1, relevant: 1, direction: 1, engineer: 1, charge: 1, required: 1, providing: 1, laying: 1, work: 1, works: 1 };
  var TOK = {};
  function toks(s) { var o = {}; String(s || "").toLowerCase().replace(/[^a-z0-9.]+/g, " ").split(" ").forEach(function (w) { w = w.replace(/^\.+|\.+$/g, ""); if (w.length > 2 && !STOP[w]) o[w] = 1; }); return o; }
  function bookToks(b) {
    if (TOK[b]) return TOK[b];
    var B = EP.BOOKS[b]; TOK[b] = (B ? B.list : []).map(function (it) { return { it: it, t: toks(it.desc) }; });
    return TOK[b];
  }
  function sim(a, b) { var n = 0, m = 0, k; for (k in a) { m++; if (b[k]) n++; } for (k in b) if (!a[k]) m++; return m ? n / m : 0; }
  function unitOk(u0, u1) { if (!u0 || !u1) return false; if (String(u0).toLowerCase() === String(u1).toLowerCase()) return 2; return EP.unitConv(u0, u1) ? 1 : 0; }
  /* best replacement candidates for an item */
  U.repCands = function (it, onlyBook, lim) {
    var inf = EP.itemInfo(it), t0 = toks(inf.desc), out = [];
    var books = onlyBook ? [onlyBook] : Object.keys(EP.BOOKS).filter(function (b) { return b.indexOf("u:") !== 0 || true; });
    books.forEach(function (b) {
      bookToks(b).forEach(function (x) {
        if (b === it.b && x.it.code === it.c) return;
        var sc = sim(t0, x.t);
        if (sc < 0.12) return;
        var uo = unitOk(inf.unit, x.it.unit); sc += uo === 2 ? 0.12 : uo === 1 ? 0.06 : -0.1;
        if (x.it.code === it.c) sc += 0.15;
        if (NEWER[it.b] === b) sc += 0.05;
        out.push({ b: b, it: x.it, s: sc });
      });
    });
    out.sort(function (a, b) { return b.s - a.s; });
    return out.slice(0, lim || 8);
  };
  function searchAll(q, it) {
    q = String(q || "").trim().toLowerCase(); if (!q) return [];
    var w = q.split(/\s+/), out = [];
    Object.keys(EP.BOOKS).forEach(function (b) { EP.BOOKS[b].list.forEach(function (x) { var c = x.code.toLowerCase(), d = x.desc.toLowerCase(), s = c === q ? 3 : c.indexOf(q) === 0 ? 2 : w.every(function (y) { return d.indexOf(y) >= 0 || c.indexOf(y) >= 0; }) ? 1 : 0; if (s && !(b === it.b && x.code === it.c)) out.push({ b: b, it: x, s: s }); }); });
    out.sort(function (a, b) { return b.s - a.s; });
    return out.slice(0, 20);
  }
  function candRow(it, c, kind) {
    var B = EP.BOOKS[c.b], inf = EP.itemInfo(it), uo = unitOk(inf.unit, c.it.unit);
    return "<tr><td style='white-space:nowrap'>" + esc(B.short) + "<br><strong>" + esc(c.it.code) + "</strong></td><td><div class='desc' title='" + esc(c.it.desc) + "'>" + esc(c.it.desc) + "</div></td><td>" + esc(c.it.unit) +
      (uo === 1 ? "<br><span class='badge info' style='white-space:normal'>" + esc(inf.unit) + " → " + esc(c.it.unit) + " converted</span>" : uo === 0 ? "<br><span class='badge warn' style='white-space:normal'>different unit — check measurement</span>" : "") + "</td><td class='num'>" + inr(c.it.sor) + "</td><td class='num'>" + inr(EP.anRate(c.b, c.it.code)) + "</td>" +
      "<td><button type='button' class='btn " + (kind === "new" ? "sec" : "pri") + " sm' data-" + (kind === "new" ? "repnew" : "rep") + "='" + esc(it.id + "|" + c.b + "|" + c.it.code) + "'>" + (kind === "new" ? "Add as new item" : "Use this") + "</button></td></tr>";
  }
  function candTable(it, list, kind) {
    if (!list.length) return "<div class='muted' style='font-size:12px'>Nothing found.</div>";
    return "<div class='tw'><table class='t'><thead><tr><th>SOR item</th><th>Description</th><th>Unit</th><th class='num'>SOR ₹</th><th class='num'>Updated ₹</th><th></th></tr></thead><tbody>" + list.map(function (c) { return candRow(it, c, kind); }).join("") + "</tbody></table></div>";
  }

  /* ---------- in the measurement panel ---------- */
  U.replaceTools = function (d, it, R) {
    if (R || it.b === "x") return "";
    var op = !!S.rep.open[it.id], sh = !!S.rep.share[it.id];
    var users = d.items.filter(function (x) { return x.id !== it.id && (x.meas || []).some(function (r) { return EP.isRef(r) && r.ref === it.id; }); });
    var h = "<div class='row' style='gap:8px;flex-wrap:wrap;align-items:center'>" +
      "<button type='button' class='btn " + (op ? "pri" : "sec") + " sm' data-repopen='" + it.id + "'>" + (op ? "Close" : "Change SOR item (keep measurement)") + "</button>" +
      "<button type='button' class='btn " + (sh ? "pri" : "sec") + " sm' data-shopen='" + it.id + "'>" + (sh ? "Close" : "Use this measurement in other items") + "</button>" +
      (users.length ? "<span class='muted' style='font-size:12px'>This measurement is also used in: " + users.map(function (x) { return esc((d.parts.length > 1 ? (d.parts.filter(function (p) { return p.id === x.part; })[0] || {}).name + " " : "") + "item " + EP.slOf(d, x) + " (" + EP.itemInfo(x).code + ")"); }).join(", ") + "</span>" : "") +
      (EP.itemQk(it) !== 1 ? "<span class='badge info'>Measured in " + esc(it.qu) + ", converted × " + esc(String(+(+EP.itemQk(it)).toPrecision(6))) + " to " + esc(EP.itemInfo(it).unit) + "</span>" : "") + "</div>";
    if (op) {
      var nb = NEWER[it.b], sug = U.repCands(it, null, 6), q = S.rep.q[it.id] || "";
      h += "<div class='panel' style='padding:10px;display:flex;flex-direction:column;gap:8px'><strong>Replace " + esc((EP.BOOKS[it.b] || {}).short + " " + it.c) + " by another SOR item — measurement rows, part and remark stay as they are</strong>" +
        (nb && EP.BOOKS[nb] ? "<div class='lbl'>Best matches in " + esc(EP.BOOKS[nb].name) + "</div>" + candTable(it, U.repCands(it, nb, 4), "rep") : "") +
        "<div class='lbl'>Similar items in all books</div>" + candTable(it, sug, "rep") +
        "<label class='fld'><span class='lbl'>Or search any book (code or words)</span><input class='in' id='repq-" + it.id + "' data-repq='" + it.id + "' value='" + esc(q) + "' placeholder='e.g. 5.2.2 or rcc wall'></label>" + (q ? candTable(it, searchAll(q, it), "rep") : "") +
        "<p class='muted' style='margin:0;font-size:12px'>Rates and analysis come from the new item. Analysis edits and a rate typed for the old item are removed.</p></div>";
    }
    if (sh) {
      var others = d.items.filter(function (x) { return x.id !== it.id; }), sel = S.rep.sel[it.id] || {}, q2 = S.rep.q["n" + it.id] || "";
      h += "<div class='panel' style='padding:10px;display:flex;flex-direction:column;gap:8px'><strong>Use the quantity of this item (" + esc(EP.itemInfo(it).code) + ", " + U.qfmt(EP.itemQty(d, it)) + " " + esc(EP.itemInfo(it).unit) + ") in other items</strong>" +
        (others.length ? "<div class='tw'><table class='t'><tbody>" + others.map(function (x) {
          var linked = (x.meas || []).some(function (r) { return EP.isRef(r) && r.ref === it.id; }), xi = EP.itemInfo(x);
          return "<tr><td><input type='checkbox' data-shsel='" + it.id + "|" + x.id + "'" + (sel[x.id] ? " checked" : "") + (linked ? " disabled" : "") + " aria-label='Select'></td><td>" + esc((d.parts.filter(function (p) { return p.id === x.part; })[0] || {}).name + " · item " + EP.slOf(d, x)) + "</td><td><strong>" + esc(xi.code) + "</strong> " + esc(xi.desc.slice(0, 110)) + "</td><td>" + esc(xi.unit) + "</td><td>" + (linked ? "<span class='badge ok'>linked</span> <button type='button' class='btn ghost sm' data-shun='" + it.id + "|" + x.id + "'>Remove link</button>" : "") + "</td></tr>";
        }).join("") + "</tbody></table></div><div class='row'><button type='button' class='btn pri sm' data-shgo='" + it.id + "'>Link selected items</button><span class='muted' style='font-size:12px'>Adds a “same as item " + EP.slOf(d, it) + "” row (× 1, change the factor there if needed, e.g. 0.6 for backfilling).</span></div>" : "<div class='muted'>No other items yet.</div>") +
        "<label class='fld'><span class='lbl'>Or add a NEW item that uses this measurement (search code or words)</span><input class='in' id='repn-" + it.id + "' data-repn='" + it.id + "' value='" + esc(q2) + "' placeholder='e.g. disposal, backfilling, dewatering'></label>" +
        (q2 ? candTable(it, searchAll(q2, { b: "", c: "" }), "new") : "<div class='lbl'>Suggestions</div>" + candTable(it, U.repCands(it, null, 4), "new")) + "</div>";
    }
    return h;
  };

  function doReplace(id, b, c) {
    var it0 = E().findItem(id); if (!it0) return;
    var u0 = it0.qu || EP.itemInfo(it0).unit, nb = EP.BOOKS[b], ni = nb && nb.idx[c]; if (!ni) return;
    var u1 = ni.unit, k = String(u0).toLowerCase() === String(u1).toLowerCase() ? 1 : EP.unitConv(u0, u1), msg = "";
    E().change(function () {
      var it = E().findItem(id), had = (it.meas || []).length;
      var old = (EP.BOOKS[it.b] || {}).short + " " + it.c;
      it.b = b; it.c = c; delete it.ab; delete it.anr;
      if (k && k !== 1) {
        if (had) { it.qu = u0; it.qk = String(+k.toPrecision(10)); }
        else if (EP.ev(it.q) != null) it.q = String(+(EP.ev(it.q) * k).toPrecision(10));
        msg = " Quantity converted " + u0 + " → " + u1 + " (× " + (+k.toPrecision(6)) + ").";
      } else { delete it.qu; delete it.qk; if (!k) msg = " Unit changed from " + u0 + " to " + u1 + " — please check the measurement."; }
      if (!it.rem) it.rem = ""; it.repFrom = old;
      EP.bump();
    });
    S.rep.open[id] = false; U.toast("Item changed to " + nb.short + " " + c + "." + msg); U.render();
  }
  function addNewUsing(srcId, b, c) {
    var src = E().findItem(srcId); if (!src) return;
    var d = E().doc(), id = EP.uid ? EP.uid() : "i" + Date.now();
    E().change(function (dd) { dd.items.push({ id: id, part: src.part, b: b, c: c, q: "", meas: [{ k: "ref", ref: srcId, m: "x", n: "", d: "" }] }); EP.bump(); });
    U.toast("Added " + EP.BOOKS[b].short + " " + c + " using the measurement of item " + EP.slOf(d, src)); U.render();
  }

  /* ---------- bulk upgrade (in the Analysis check tab) ---------- */
  U.upgradeView = function (d) {
    var old = d.items.filter(function (x) { return NEWER[x.b] && EP.BOOKS[NEWER[x.b]]; });
    if (!old.length) return "";
    var U2 = S.rep.up;
    if (!U2) return "<div class='badge info' style='white-space:normal;align-self:flex-start'>" + old.length + " item(s) are from older books (CPWD DSR 2021 / MPPWD SOR 2017). <button type='button' class='btn sec sm' data-upopen='1'>Move them to DSOR 2023 / MPPWD SOR 2025 (measurements kept)</button></div>";
    var h = "<div class='panel' style='padding:10px;display:flex;flex-direction:column;gap:8px'><div class='row'><strong class='grow'>Move items to the newer SOR — measurements stay, only the item changes</strong><button type='button' class='btn ghost sm' data-upopen='0'>Close</button></div>";
    h += "<div class='tw'><table class='t'><thead><tr><th></th><th>Item</th><th>Now</th><th>Change to</th><th class='num'>Rate now ₹</th><th class='num'>New rate ₹</th></tr></thead><tbody>";
    old.forEach(function (it) {
      var inf = EP.itemInfo(it), nb = NEWER[it.b], cs = U.repCands(it, nb, 3), ch = U2[it.id];
      if (ch === undefined) { ch = cs[0] && cs[0].s >= 0.45 ? cs[0].it.code : ""; U2[it.id] = ch; }
      var lr = EP.lineRates(d, it);
      h += "<tr><td><input type='checkbox' data-upchk='" + it.id + "'" + (ch ? " checked" : "") + " aria-label='Change this item'></td><td class='num'>" + esc((d.parts.length > 1 ? (d.parts.filter(function (p) { return p.id === it.part; })[0] || {}).name + " · " : "") + EP.slOf(d, it)) + "</td><td><strong>" + esc((EP.BOOKS[it.b] || {}).short + " " + it.c) + "</strong><div class='desc'>" + esc(inf.desc.slice(0, 120)) + "</div></td><td><select class='in small' data-upsel='" + it.id + "' style='max-width:360px'><option value=''>— keep —</option>" +
        cs.map(function (c) { return "<option value='" + esc(c.it.code) + "'" + (c.it.code === ch ? " selected" : "") + ">" + esc(c.it.code + " · " + c.it.unit + " · " + c.it.desc.slice(0, 70)) + " (match " + Math.round(Math.min(1, c.s) * 100) + "%)</option>"; }).join("") + "</select></td><td class='num'>" + inr(lr.a) + "</td><td class='num'>" + (ch ? inr(EP.anRate(nb, ch)) : "") + "</td></tr>";
    });
    h += "</tbody></table></div><div class='row'><button type='button' class='btn pri sm' data-upgo='1'>Change the ticked items</button><span class='muted' style='font-size:12px'>Check each suggestion — the match is by description. Units of the same kind are converted automatically.</span></div></div>";
    return h;
  };

  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("button"); if (!t) return;
    var ds = t.dataset;
    if (ds.repopen) { S.rep.open[ds.repopen] = !S.rep.open[ds.repopen]; U.render(); }
    else if (ds.shopen) { S.rep.share[ds.shopen] = !S.rep.share[ds.shopen]; U.render(); }
    else if (ds.rep) { var p = ds.rep.split("|"); doReplace(p[0], p[1], p.slice(2).join("|")); }
    else if (ds.repnew) { var n = ds.repnew.split("|"); addNewUsing(n[0], n[1], n.slice(2).join("|")); }
    else if (ds.shgo) {
      var sel = S.rep.sel[ds.shgo] || {}, ids = Object.keys(sel).filter(function (k) { return sel[k]; });
      if (!ids.length) { U.toast("Tick the items first"); return; }
      E().change(function () { ids.forEach(function (x) { var it = E().findItem(x); if (!it) return; it.meas = it.meas || []; if (!it.meas.length && EP.ev(it.q) != null) it.meas.push({ k: "+", d: "Quantity typed earlier", q: String(EP.ev(it.q)) }); it.meas.push({ k: "ref", ref: ds.shgo, m: "x", n: "", d: "" }); }); EP.bump(); });
      S.rep.sel[ds.shgo] = {}; U.toast("Linked " + ids.length + " item(s) to this measurement");
    }
    else if (ds.shun) { var u = ds.shun.split("|"); E().change(function () { var it = E().findItem(u[1]); if (it) it.meas = (it.meas || []).filter(function (r) { return !(EP.isRef(r) && r.ref === u[0]); }); EP.bump(); }); }
    else if (ds.upopen != null) { S.rep.up = ds.upopen === "1" ? {} : null; U.render(); }
    else if (ds.upgo) {
      var up = S.rep.up || {}, n2 = 0;
      Object.keys(up).forEach(function (id) { var cb = document.querySelector("input[data-upchk='" + id + "']"); var it = E().findItem(id); if (up[id] && cb && cb.checked && it) { doReplace(id, NEWER[it.b], up[id]); n2++; } });
      S.rep.up = null; U.toast(n2 + " item(s) moved to the newer SOR — measurements kept"); U.render();
    }
  });
  document.addEventListener("input", function (e) {
    var t = e.target, ds = t.dataset || {};
    if (ds.repq) { S.rep.q[ds.repq] = t.value; clearTimeout(S.rep._t); S.rep._t = setTimeout(function () { U.render(); }, 250); }
    else if (ds.repn) { S.rep.q["n" + ds.repn] = t.value; clearTimeout(S.rep._t); S.rep._t = setTimeout(function () { U.render(); }, 250); }
  });
  document.addEventListener("change", function (e) {
    var t = e.target, ds = t.dataset || {};
    if (ds.shsel) { var p = ds.shsel.split("|"); S.rep.sel[p[0]] = S.rep.sel[p[0]] || {}; S.rep.sel[p[0]][p[1]] = t.checked; }
    else if (ds.upsel) { S.rep.up = S.rep.up || {}; S.rep.up[ds.upsel] = t.value; U.render(); }
  });
})();
