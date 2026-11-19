/* Estimate Pro — rate books, rate engine, measurement maths, estimate model */
(function () {
  "use strict";
  var EP = window.EP = window.EP || {};
  var S = EP.S = { ovr: {}, userSors: [], basis: "an" };
  var BOOKS = EP.BOOKS = {}; // id -> {id,name,short,long,list,idx,ch,kind}
  var cp = null;

  /* ---------- helpers ---------- */
  EP.r2 = function (n) { return Math.round((n + Number.EPSILON) * 100) / 100; };
  EP.r3 = function (n) { return Math.round((n + Number.EPSILON) * 1000) / 1000; };
  EP.r05 = function (n) { return Math.round(Math.round(n / 0.05) * 0.05 * 100) / 100; };
  EP.enc = function (c) { return String(c).replace(/[^A-Za-z0-9_.\-]/g, function (ch) { return "~" + ch.charCodeAt(0).toString(16); }); };
  EP.uid = function () { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3); };

  /* Safe arithmetic: numbers, + - * / x × ( ) and spaces. "15x45" → 675. Returns null when blank or invalid. */
  EP.ev = function (s) {
    if (s == null) return null; if (typeof s === "number") return isFinite(s) ? s : null;
    s = String(s).trim().replace(/,/g, "").replace(/[x×X]/g, "*"); if (!s) return null;
    var i = 0;
    function ws() { while (s[i] === " ") i++; }
    function num() { ws(); var m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(s.slice(i)); if (!m) throw 0; i += m[0].length; return parseFloat(m[0]); }
    function fac() { ws(); if (s[i] === "-") { i++; return -fac(); } if (s[i] === "+") { i++; return fac(); } if (s[i] === "(") { i++; var v = expr(); ws(); if (s[i] !== ")") throw 0; i++; return v; } return num(); }
    function term() { var v = fac(); for (;;) { ws(); if (s[i] === "*") { i++; v *= fac(); } else if (s[i] === "/") { i++; var d = fac(); if (!d) throw 0; v /= d; } else return v; } }
    function expr() { var v = term(); for (;;) { ws(); if (s[i] === "+") { i++; v += term(); } else if (s[i] === "-") { i++; v -= term(); } else return v; } }
    try { var v = expr(); ws(); return i === s.length && isFinite(v) ? v : null; } catch (e) { return null; }
  };

  /* ---------- books ---------- */
  function addBook(id, meta, list, ch, extra) {
    var b = Object.assign({ id: id, name: meta.name, short: meta.short, long: meta.long, kind: meta.kind || "plain", list: list, idx: {}, ch: ch || {}, an: null, basic: null, round: 0.05 }, extra || {});
    list.forEach(function (it) { b.idx[it.code] = it; });
    BOOKS[id] = b; return b;
  }
  EP.loadBuiltIn = function (cpwd, mppwd, hort, cpwd23, mppwd25, em22) {
    cp = EP.cp = cpwd;
    var cl = cpwd.items.map(function (x) { return { code: x[0], desc: x[1], unit: x[2], sor: x[3], book: x[4], esta: x[5], src: x[6], ch: x[0].split(".")[0] }; });
    var cch = {}; cl.forEach(function (o) { cch[o.ch] = EP.CP_CH[o.ch] || "Chapter " + o.ch; });
    addBook("cpwd", { name: "CPWD DSR 2021", short: "SOR CPWD 2021", long: "CPWD Delhi Schedule of Rates 2021, Vol. 1 & 2 (updated Dec 2021)", kind: "cpwd" }, cl, cch, { an: cpwd.an, basic: cpwd.basic, round: 0.05, basicNote: "CPWD DSR 2021", adjNote: "difference between the printed DSR 2021 rate and its analysis" });
    if (cpwd23) {
      var c3 = cpwd23.items.map(function (x) { return { code: x[0], desc: x[1], unit: x[2], sor: x[3], book: x[4], esta: x[5], src: x[6], ch: x[0].split(".")[0] }; });
      var c3ch = {}; c3.forEach(function (o) { c3ch[o.ch] = EP.CP_CH[o.ch] || "Chapter " + o.ch; });
      addBook("cpwd23", { name: "CPWD DSOR 2023", short: "DSOR CPWD 2023", long: "CPWD Delhi Schedule of Rates 2023, Vol. 1 & 2, with Delhi Analysis of Rates 2023 (basic rates as on 01.04.2023)", kind: "cpwd" }, c3, c3ch, { an: cpwd23.an, basic: cpwd23.basic, round: 0.05, basicNote: "CPWD DAR 2023" });
    }
    addBook("mp", { name: "MPPWD SOR 2017", short: "MPPWD SOR 2017", long: "MPPWD SOR 2017 — Roads & Bridges (w.e.f. 29.08.2017)" }, mppwd.items.map(function (x) { return { code: x[0], desc: x[1], unit: x[2], sor: x[3], ch: String(x[4]), book: x[5] != null ? x[5] : null }; }), mppwd.ch, { an: mppwd.an || null, basic: mppwd.basic || null, pm: mppwd.pm || {}, round: 1, basicNote: "MPPWD Road analysis (basic rates as on 01.04.2026)",
      adjNote: "difference of this SOR item (specification / binder / lead) from the standard MoRTH analysis", refLabel: function (an) { return an.src ? "based on MoRTH Standard Data Book analysis " + an.src : ""; } });
    addBook("hort", { name: "DSR Horticulture 2018", short: "DSOR Horticulture 2018", long: "CPWD DSR (Horticulture & Landscaping) 2018" }, hort.items.map(function (x) { return { code: x[0], desc: x[1], unit: x[2], sor: x[3], ch: x[4] }; }), hort.ch);
    EP.usage = {};
    addLate(mppwd25, em22);
  };
  /* books that may arrive after the app is already usable (loaded in the background) */
  function addLate(mppwd25, em22) {
    if (mppwd25) {
      addBook("mp25", { name: "MPPWD SOR 2025", short: "MPPWD SOR 2025", long: "MPPWD Schedule of Rates for Road & Bridge Works (in force from 11.04.2025)" }, mppwd25.items.map(function (x) { return { code: x[0], desc: x[1], unit: x[2], sor: x[3], ch: String(x[4]), book: x[5] != null ? x[5] : null }; }), mppwd25.ch,
        { an: mppwd25.an || null, basic: mppwd25.basic || null, pm: {}, round: 1, meta: mppwd25.meta, basicNote: "MoRTH SDB 2019 analysis, basic rates at the SOR 2025 price level",
          adjNote: "difference of the printed SOR 2025 rate from the standard MoRTH analysis (specification / binder / lead / local rates)", refLabel: function (an) { return an.src ? "based on MoRTH Standard Data Book 2019 analysis " + an.src : ""; } });
    }
    if (em22) {
      addBook("em22", { name: "CPWD DSR (E&M) 2022", short: "DSR (E&M) 2022", long: "CPWD Delhi Schedule of Rates (E&M) 2022 with Delhi Analysis of Rates (E&M) 2022, including Correction Slip No. 1 of both", kind: "cpwd" },
        em22.items.map(function (x) { return { code: x[0], desc: x[1], unit: x[2], sor: x[3], ch: String(x[4]), book: x[5] != null ? x[5] : null }; }), em22.ch,
        { an: em22.an || null, basic: em22.basic || null, round: 1, meta: em22.meta, basicNote: "CPWD DAR (E&M) 2022",
          adjNote: "difference between the printed DSR (E&M) 2022 rate and its DAR analysis", refLabel: function (an) { return an.src || ""; } });
    }
    ["cpwd", "cpwd23", "mp25", "mp", "em22"].forEach(function (bk) { var B = BOOKS[bk]; if (!B || EP.usage[bk]) return; EP.usage[bk] = {}; if (B.an) for (var k in B.an) B.an[k].L.forEach(function (l) { if (l[0]) EP.usage[bk][l[0]] = (EP.usage[bk][l[0]] || 0) + 1; }); });
  }
  EP.loadLate = function (mppwd25, em22) { addLate(mppwd25, em22); if (EP._approved) EP.addApproved(EP._approved); EP.bump(); };
  EP.loadUserSors = function (sors, items) {
    Object.keys(BOOKS).forEach(function (k) { if (k.indexOf("u:") === 0) delete BOOKS[k]; });
    S.userSors = sors;
    sors.forEach(function (s) {
      var its = items.filter(function (i) { return i.sor_id === s.id; }).map(function (i) { return { code: i.code, desc: i.descr, unit: i.unit || "", sor: i.rate != null ? +i.rate : null, an: i.an_rate != null ? +i.an_rate : null, anNote: i.an_note || "", ch: i.chapter || "" }; });
      var ch = {}; its.forEach(function (i) { if (i.ch) ch[i.ch] = i.ch; });
      addBook("u:" + s.id, { name: s.name, short: s.short || s.name, long: s.name + " (uploaded by you)", kind: "user" }, its, ch);
    });
  };
  EP.CP_CH = { 1: "Carriage of materials", 2: "Earth work", 3: "Mortars", 4: "Concrete work", 5: "Reinforced cement concrete", 6: "Brick work", 7: "Stone work", 8: "Marble & granite work", 9: "Wood & PVC work", 10: "Steel work", 11: "Flooring", 12: "Roofing", 13: "Finishing", 14: "Repairs to buildings", 15: "Dismantling & demolishing", 16: "Road work", 17: "Sanitary installations", 18: "Water supply", 19: "Drainage", 20: "Pile work", 21: "Aluminium work", 22: "Water proofing", 23: "Horticulture & landscape", 24: "Rain water harvesting", 25: "Conservation of heritage buildings", 26: "Miscellaneous" };

  /* ---------- rate engine (any book with analyses + basic rates) ---------- */
  function BK(b) { return BOOKS[b || "cpwd"]; }
  function basicBook(c, b) { var B = BK(b), x = B && B.basic && B.basic[c]; return x ? (x[3] != null ? x[3] : x[2]) : null; }
  function basicOvr(c, b) { return S.ovr[(b || "cpwd") + ":b:" + EP.enc(c)]; }
  /* Library default rate of a material / machinery basic rate (kind T / M): DSR 2023 books carry two more numbers per row —
     [5] the rate used in the 2021 analysis file (market rate) and [6] the 2021 DSR rate. Labour is never changed. Source is a device setting:
     "an" = 2021 analysed (default), "dsr" = 2021 DSR, "book" = printed 2023 rate. A rate typed by the user always wins. */
  var RSRC = "an"; try { RSRC = localStorage.getItem("ep_rsrc") || "an"; } catch (e) { /* private mode */ }
  EP.rateSrc = function (v) { if (v) { RSRC = v; try { localStorage.setItem("ep_rsrc", v); } catch (e) { /* ignore */ } memo = {}; } return RSRC; };
  function basicDef(c, b) {
    var B = BK(b), x = B && B.basic && B.basic[c]; if (!x) return null;
    var pr = x[3] != null ? x[3] : x[2]; if (x[4] === "L" || RSRC === "book" || x.length < 6) return pr;
    var v = RSRC === "dsr" ? x[6] : x[5]; return v != null ? v : pr;
  }
  /* ---------- one master SOR per kind: S.ovr["cfg:link:L"|"cfg:link:T"|"cfg:link:M"] = { src: book id } ----------
     Every other SOR then takes the master's current rate for the matching labour / material / machine (its own typed rate still wins).
     Matching: CPWD 2021 ↔ 2023 by code (same item); other books by trade and class for labour, by the same name for materials / machines; units must agree. */
  var KINDN = { L: "labour", T: "materials", M: "machinery" }, LMAP = {};
  /* stored under an id the rate tables already accept (book:b:…) */
  EP.linkId = function (kind) { return "cpwd:b:@link:" + kind; };
  EP.linkSrc = function (kind) { var o = S.ovr && S.ovr[EP.linkId(kind)]; return o && o.src && BOOKS[o.src] && BOOKS[o.src].basic ? o.src : null; };
  function nname(t) {
    return String(t || "").toLowerCase().replace(/\*?note.*$/, "").replace(/\b(ist|i)\s*class\b|\bgrade\s*(1|i)\b|\bfirst class\b/g, " 1st class ").replace(/\b(iind|ii)\s*class\b|\bgrade\s*(2|ii)\b|\bsecond class\b/g, " 2nd class ")
      .replace(/[^a-z0-9.]+/g, " ").replace(/\s+/g, " ").trim();
  }
  var TRADES = [["unsk", /\b(beldar|coolie|mazdoor|khallasi|unskilled)\b/], ["bhisti", /\bbhisti\b/], ["chowkidar", /\b(chowkidar|watchman)\b/], ["mali", /\b(mali|gardener)\b/], ["mate", /\b(mate|mistri|supervisor)\b/],
    ["mason", /\bmason\b/], ["carpenter", /\bcarpenter\b/], ["blacksmith", /\bblacksmith\b/], ["fitter", /\bfitter\b/], ["painter", /\bpainter\b/], ["plumber", /\bplumber\b/], ["welder", /\bwelder\b/],
    ["electrician", /\b(electrician|wireman)\b/], ["driller", /\bdriller\b/], ["blaster", /\bblaster\b/], ["chiseller", /\bchiseller\b/], ["driver", /\bdriver\b/], ["glazier", /\bglazier\b/], ["polisher", /\bpolisher\b/], ["cleaner", /\bcleaner\b/]];
  function labKey(name) {
    var n = nname(name); if (/\bskilled\b/.test(n) && !/\bunskilled\b/.test(n) && /mazdoor/.test(n)) return null;
    var tr = null; for (var i = 0; i < TRADES.length; i++) { var m = TRADES[i][1].exec(n); if (m && (!tr || m.index < tr.i)) tr = { k: TRADES[i][0], i: m.index }; }
    if (!tr) return null; if (tr.k === "unsk" && /\bskilled\b/.test(n) && !/\bunskilled\b/.test(n)) return null;
    if (tr.k === "unsk" || tr.k === "bhisti" || tr.k === "chowkidar" || tr.k === "mali" || tr.k === "mate") return tr.k;
    return tr.k + (/2nd class|assistant/.test(n) ? "2" : /1st class|head|special/.test(n) ? "1" : "0");
  }
  /* same code in CPWD 2021 / 2023: the same item unless the names share almost no words */
  function sameItem(a, b) { var A = nname(a).split(" "), Bw = nname(b).split(" "), ka = labKey(a), kb = labKey(b); if (ka && kb) return ka === kb; var inB = {}; Bw.forEach(function (w) { inB[w] = 1; }); var com = A.filter(function (w) { return w.length > 2 && inB[w]; }).length; return com >= Math.min(2, Math.min(A.length, Bw.length)) || nname(a).slice(0, 15) === nname(b).slice(0, 15); }
  function unitK(fu, tu) { if (nname(fu) === nname(tu)) return 1; var k = EP.unitConv(fu, tu); return k ? 1 / k : null; }   // target rate = source rate × k
  function fam(b) { return b === "cpwd" || b === "cpwd23" ? "cpwd" : b === "mp" || b === "mp25" ? "mp" : b; }
  function linkMap(src, tgt) {
    var key = src + ">" + tgt; if (LMAP[key]) return LMAP[key];
    var S0 = BOOKS[src].basic, T0 = BOOKS[tgt].basic, map = {}, byName = {}, byLab = {};
    Object.keys(S0).forEach(function (c) { var x = S0[c]; byName[x[4] + "|" + nname(x[0])] = byName[x[4] + "|" + nname(x[0])] || c; if (x[4] === "L") { var lk = labKey(x[0]); if (lk && (!byLab[lk] || nname(x[0]) === "beldar")) byLab[lk] = c; } });
    Object.keys(T0).forEach(function (c) {
      var x = T0[c], hit = null;
      if (fam(src) === fam(tgt) && S0[c] && S0[c][4] === x[4] && sameItem(S0[c][0], x[0])) hit = c;
      if (!hit) hit = byName[x[4] + "|" + nname(x[0])] || null;
      if (!hit && x[4] === "L") { var lk = labKey(x[0]); if (lk) hit = byLab[lk] || (/[01]$/.test(lk) ? byLab[lk.slice(0, -1) + (lk.slice(-1) === "0" ? "1" : "0")] : null) || null; }
      if (!hit) return; var k = unitK(S0[hit][1], x[1]); if (k == null) return;
      map[c] = { c: hit, k: k };
    });
    return (LMAP[key] = map);
  }
  EP.linkOf = function (c, b) { if (/^H\d{3}$/.test(c)) return null; var B = BK(b), x = B && B.basic && B.basic[c]; if (!x) return null; var src = EP.linkSrc(x[4]); if (!src || src === b) return null; var m = linkMap(src, b)[c]; return m ? { b: src, c: m.c, k: m.k, name: BOOKS[src].basic[m.c][0] } : null; };
  EP.linkStats = function (src, tgt, kind) { var T0 = BOOKS[tgt] && BOOKS[tgt].basic; if (!T0 || src === tgt) return null; var m = linkMap(src, tgt), all = 0, hit = 0; Object.keys(T0).forEach(function (c) { if (T0[c][4] !== kind) return; all++; if (m[c]) hit++; }); return { all: all, hit: hit }; };
  EP.KINDN = KINDN;
  EP.basicBase = function (c, b) { var lr = linkedRate(c, b); return lr != null ? lr : basicDef(c, b); };
  function linkedRate(c, b) { var l = EP.linkOf(c, b); if (!l) return null; var v = basicAn(l.c, l.b); return v == null ? null : v * l.k; }
  function basicOvrX(c, b) { var o = basicOvr(c, b); if (o) return o; var d = basicAn(c, b), pr = basicBook(c, b); return d != null && pr != null && Math.abs(d - pr) > 1e-9 ? { r: d, lib: true } : undefined; }
  function basicAn(c, b) { var o = basicOvr(c, b); if (o && o.r != null) return o.r; var lr = linkedRate(c, b); return lr != null ? lr : basicDef(c, b); }
  EP.basicBook = basicBook; EP.basicOvr = basicOvr; EP.basicAn = basicAn; EP.basicDef = basicDef;
  EP.basicRef = function (c, b) { var B = BK(b), x = B && B.basic && B.basic[c]; return x && x.length > 5 ? { an: x[5], dsr: x[6] } : null; };
  EP.itemOvr = function (b, c) { return S.ovr[b + ":i:" + EP.enc(c)]; };
  EP.item = function (b, c) { var bk = BOOKS[b]; return bk ? bk.idx[c] : null; };
  EP.sorRate = function (b, c) { var it = EP.item(b, c); return it ? it.sor : null; };
  EP.anOf = function (b, c) { var B = BOOKS[b]; return B && B.an ? B.an[c] || null : null; };
  EP.hasAn = function (b, c) { return !!EP.anOf(b, c); };
  /* analysis attached by description although its rate differs a lot from the printed SOR rate (MPPWD 2025 / MoRTH) */
  EP.farNote = function (b, c) { var an = EP.anOf(b, c); if (!an || an.far == null) return ""; var B = BOOKS[b] || {};
    return "Check the analysis before you proceed: the MoRTH Standard Data Book analysis with the same description works out " + (an.an_rate ? "to ₹" + Math.round(an.an_rate).toLocaleString("en-IN") + " against the printed " + (B.short || "SOR") + " rate ₹" + Math.round(an.s).toLocaleString("en-IN") + " — " : "") + "a difference of " + (an.far >= 0 ? "+" : "") + an.far + "% from the SOR. The difference is shown as a highlighted adjustment line; edit the analysis lines if the item needs it."; };
  EP.roundRate = function (b, r) { var st = (BOOKS[b] && BOOKS[b].round) || 0.05; return st === 1 ? Math.round(r) : EP.r05(r); };
  function childFactor(b, c, depth) {
    var it = BK(b).idx[c], an = BK(b).an && BK(b).an[c], base = (it && it.book) || (!it && an && an.s);
    if (!base) return 1;
    var r = anRateRaw(b, c, depth + 1); return r ? r / base : 1;
  }
  /* ---------- units: families and conversion (kg ↔ quintal ↔ tonne, litre ↔ KL ↔ cum, sqm ↔ sqft ↔ 10 sqm, metre ↔ km, each ↔ 100/1000 nos) ---------- */
  var UF = { kg: ["mass", 1, "kg"], kgs: ["mass", 1, "kg"], quintal: ["mass", 100, "quintal"], qtl: ["mass", 100, "quintal"], tonne: ["mass", 1000, "tonne"], mt: ["mass", 1000, "tonne"], t: ["mass", 1000, "tonne"], ton: ["mass", 1000, "tonne"],
    litre: ["vol", 0.001, "litre"], liter: ["vol", 0.001, "litre"], ltr: ["vol", 0.001, "litre"], l: ["vol", 0.001, "litre"], kl: ["vol", 1, "KL"], cum: ["vol", 1, "cum"], "cu.m": ["vol", 1, "cum"], cft: ["vol", 0.0283168, "cft"],
    sqm: ["area", 1, "sqm"], "10 sqm": ["area", 10, "10 sqm"], "100 sqm": ["area", 100, "100 sqm"], sqft: ["area", 0.092903, "sqft"], hectare: ["area", 10000, "hectare"],
    metre: ["len", 1, "metre"], meter: ["len", 1, "metre"], m: ["len", 1, "metre"], rm: ["len", 1, "metre"], rmt: ["len", 1, "metre"], km: ["len", 1000, "km"], cm: ["len", 0.01, "cm"], mm: ["len", 0.001, "mm"], "100 m": ["len", 100, "100 m"],
    each: ["cnt", 1, "each"], no: ["cnt", 1, "each"], nos: ["cnt", 1, "each"], number: ["cnt", 1, "each"], "100 nos": ["cnt", 100, "100 nos"], "1000 nos": ["cnt", 1000, "1000 nos"],
    // aliases as in units.js
    "sq.m": ["area", 1, "sqm"], "sq. m": ["area", 1, "sqm"], "sq m": ["area", 1, "sqm"], sqmt: ["area", 1, "sqm"], "sq.mtr": ["area", 1, "sqm"], sqmtr: ["area", 1, "sqm"], "sq km": ["area", 1e6, "sq km"], sqkm: ["area", 1e6, "sq km"],
    set: ["cnt", 1, "each"], job: ["cnt", 1, "each"], point: ["cnt", 1, "each"] };
  EP.unitInfo = function (u) { var k = String(u || "").toLowerCase().replace(/\.$/, "").replace(/\s+/g, " ").trim(); return UF[k] || null; };
  EP.unitFamily = function (u) { var i = EP.unitInfo(u); if (!i) return []; var seen = {}; return Object.keys(UF).filter(function (k) { var x = UF[k]; if (x[0] !== i[0] || seen[x[2]]) return false; seen[x[2]] = 1; return true; }).map(function (k) { return UF[k][2]; }); };
  /* factor k so that quantity_in_"to" = quantity_in_"from" × k */
  EP.unitConv = function (from, to) { var a = EP.unitInfo(from), b = EP.unitInfo(to); return a && b && a[0] === b[0] ? a[1] / b[1] : null; };
  /* rate of a line added to an analysis by the user: typed rate, else live basic rate / SOR item rate */
  EP.extraRate = function (x) {
    if (x.r != null && x.r !== "") return +x.r;
    if (x.t === "b" && x.b && x.c) { var v = basicAn(x.c, x.b); return v != null ? v : null; }
    if (x.t === "i" && x.b && x.c && BOOKS[x.b]) { var a = EP.anRate(x.b, x.c); return a != null ? a : null; }
    return null;
  };
  /* Build-up of an analysis with current basic rates (+ optional line edits). Anchored on the book's own build-up rate. */
  EP.build = function (c, ov, depth, b, anX) {
    b = b || "cpwd"; var B = BK(b), an = anX || EP.anOf(b, c); if (!an) return null; depth = depth || 0;
    var it = B.idx[c]; var anchor = (it && it.book) || an.s; if (!anchor) return null;
    function calc(useOv) {
      var lines = an.L.map(function (l, i) {
        var lo = useOv && ov && ov.lines ? ov.lines[i] : null;
        var k = useOv && lo && lo.u ? EP.unitConv(l[4], lo.u) : null, unit = k ? lo.u : l[4];
        var q = l[5] != null && k ? l[5] * k : l[5], r = l[2] != null && k ? l[2] / k : l[2];
        if (lo && lo.q != null) q = lo.q;
        if (useOv) {
          if (lo && lo.r != null) r = lo.r;
          else if (l[0] && B.basic && B.basic[l[0]] && basicOvrX(l[0], b) && l[2] === 0) r = basicAn(l[0], b) / (k || 1);
          else if (l[0] && B.basic && B.basic[l[0]] && basicOvrX(l[0], b) && basicBook(l[0], b)) r = (k ? l[2] / k : l[2]) * basicAn(l[0], b) / basicBook(l[0], b);
          else if (l[0] && B.an && B.an[l[0]] && l[0] !== c && depth < 3) r = (k ? l[2] / k : l[2]) * childFactor(b, l[0], depth);
        }
        var amt = (r != null && q != null) ? r * q / (l[3] || 1) : (l[6] || 0);
        var dsc = lo && lo.d ? lo.d : l[1], sc = lo && lo.sec ? lo.sec : l[7];
        if (lo && lo.x) return { code: l[0], desc: dsc, per: l[3], unit: unit, unit0: l[4], k: k || 1, sec: sc, q: q, r: r, amt: 0, removed: true };
        return { code: l[0], desc: dsc, per: l[3], unit: unit, unit0: l[4], k: k || 1, sec: sc, q: q, r: r, amt: amt, edDesc: !!(lo && lo.d) };
      });
      if (useOv && ov && ov.extra) ov.extra.forEach(function (x, j) {
        var r = EP.extraRate(x), q = x.q != null ? +x.q : null;
        lines.push({ code: x.c || "", desc: x.d || "", per: 1, unit: x.u || "", unit0: x.u || "", k: 1, sec: x.sec || "M", q: q, r: r, amt: r != null && q != null ? r * q : 0, extra: j, src: x.t || "m", book: x.b || "" });
      });
      return { lines: lines, sub: lines.reduce(function (a, x) { return a + x.amt; }, 0) };
    }
    var o0 = calc(false), o1 = calc(true);
    function addons(res, base, useOv) {
      var run = res.sub, out = [];
      an.A.forEach(function (a, j) {
        var pct = useOv && ov && ov.adds && ov.adds[j] != null ? ov.adds[j] : a[0];
        var ex = 0; if (a[4]) res.lines.forEach(function (x, i) { var f = an.L[i] ? an.L[i][8] : ({ R: "R", L: "L", P: "T" }[x.sec] || ""); if (f && a[4].indexOf(f) >= 0) ex += x.amt; });
        var add = a[2] ? a[3] * (base.sub ? res.sub / base.sub : 1) : (run - ex) * pct / 100;
        run += add; out.push({ pct: pct, label: a[1], except: !!a[2], part: !!a[4] && Math.abs(ex) > 0.0001, amt: add, run: run });
      });
      return { adds: out, total: run };
    }
    var a0 = addons(o0, o0, false), a1 = addons(o1, o0, true);
    var ratio = a0.total ? a1.total / a0.total : 1;
    var basis = an.b || 1, rate = anchor * ratio, adj = rate * basis - a1.total, adj0 = adj;
    if (Math.abs(adj) < 0.005 * Math.max(1, Math.abs(rate * basis))) adj = 0;
    var noAdj = !!((an.pure && a1.total > 0) || (ov && (ov.noAdj || ov.basis) && (adj || ov.basis)));
    if (ov && ov.basis > 0) basis = +ov.basis;
    if (noAdj) { rate = a1.total / basis; adj = 0; }
    return { rate: rate, anchor: anchor, lines: o1.lines, adds: a1.adds, sub: o1.sub, total: a1.total, basis: basis, say: an.s, src: an.src || "", note: an.note || "",
      adj: adj, adjPct: a1.total ? adj / a1.total * 100 : 0, adjNote: B.adjNote || "difference between the book's printed rate and its standard analysis", ref: B.refLabel ? B.refLabel(an) : "", far: an.far != null ? an.far : null, noAdj: noAdj, adjDropped: noAdj && !an.pure ? adj0 : 0, admin: !!an.admin };
  };
  /* Library-level analysis ("updated") rate. Default: the item's rate analysis with current basic rates; items without analysis: SOR. */
  function anRateRaw(b, c, depth) {
    var s = EP.sorRate(b, c), o = EP.itemOvr(b, c), it = EP.item(b, c);
    if (o && o.mode === "manual" && o.manual != null) return o.manual;
    if (o && o.mode === "sor") return s;
    if (EP.hasAn(b, c)) { var bu = EP.build(c, o && o.mode === "build" ? o : null, depth, b); return bu ? EP.roundRate(b, bu.rate) : s; }
    if (it && it.an != null) return it.an;
    return s;
  }
  var memo = {};
  EP.bump = function () { memo = {}; };
  EP.anRate = function (b, c) { var k = b + "|" + c; if (!(k in memo)) memo[k] = anRateRaw(b, c, 0); return memo[k]; };
  EP.modeLabel = function (b, c) {
    var o = EP.itemOvr(b, c), it = EP.item(b, c);
    if (o && o.mode === "manual") return "Entered rate";
    if (o && o.mode === "sor") return "SOR rate";
    if (o && o.mode === "build") return "Edited build-up";
    if (EP.hasAn(b, c)) return "Analysis";
    if (it && it.an != null) return "Entered rate";
    return "SOR rate";
  };

  /* ---------- estimate model ---------- */
  EP.newDoc = function (defaults) {
    var d = defaults || {};
    return { v: 2, header: Object.assign({ org: "", office: "", project: "", work: "" }, d.header || {}),
      signs: (d.signs && d.signs.length ? d.signs : [{ title: "Project Engineer (Civil)", place: "" }, { title: "AM / AE (Civil)", place: "" }, { title: "EA / OS (Civil)", place: "" }]).map(function (x) { return { title: x.title || "", place: x.place || "" }; }),
      gst: d.gst != null ? d.gst : 18, basis: "an", parts: [{ id: "A", name: "Part A" }], items: [] };
  };
  /* Convert an old flat estimate (lines) to the new document */
  EP.migrate = function (row) {
    if (row.data && row.data.v === 2) return row.data;
    var d = EP.newDoc(); d.gst = row.gst == null ? 18 : +row.gst;
    (row.lines || []).forEach(function (l) { d.items.push({ id: EP.uid(), part: "A", b: l.b, c: l.c, q: l.q != null ? String(l.q) : "", rem: l.rem || "", meas: [] }); });
    return d;
  };
  /* Steel unit weights. Bars: IS 1786 (d²/162.2). Beams/channels: IS 808:1989 tables. Angles, flats, squares, plates: from nominal size × 7850 kg/cum. */
  function r2(n) { return Math.round(n * 100) / 100; }
  var ST = [];
  // IS 1786 nominal mass (kg/m), same table as EP.barWt (rebar.js)
  var BARW = EP.BAR_WT = { 6: 0.222, 8: 0.395, 10: 0.617, 12: 0.888, 16: 1.58, 20: 2.47, 25: 3.85, 28: 4.83, 32: 6.31, 36: 7.99, 40: 9.87 };
  [6, 8, 10, 12, 16, 20, 25, 28, 32, 36, 40].forEach(function (d) { ST.push(["TMT / round bar " + d + " mm", BARW[d], "IS 1786", "Bars (IS 1786)"]); });
  [[100, 11.5], [125, 13.0], [150, 14.9], [175, 19.3], [200, 25.4], [225, 31.2], [250, 37.3], [300, 46.0], [350, 52.4], [400, 61.6], [450, 72.4], [500, 86.9], [550, 103.7], [600, 122.6]].forEach(function (x) { ST.push(["ISMB " + x[0], x[1], "IS 808", "Beams ISMB (IS 808)"]); });
  [[75, 7.14], [100, 9.56], [125, 13.1], [150, 16.8], [175, 19.6], [200, 22.3], [225, 26.1], [250, 30.6], [300, 36.3], [350, 42.7], [400, 50.1]].forEach(function (x) { ST.push(["ISMC " + x[0], x[1], "IS 808", "Channels ISMC (IS 808)"]); });
  [[20, 3], [25, 3], [25, 5], [30, 3], [30, 5], [35, 5], [40, 5], [40, 6], [45, 5], [45, 6], [50, 5], [50, 6], [55, 6], [60, 6], [60, 8], [65, 6], [65, 8], [70, 6], [75, 6], [75, 8], [80, 8], [90, 8], [100, 8], [100, 10], [110, 10], [130, 10], [150, 12], [200, 16]].forEach(function (x) { ST.push(["ISA " + x[0] + "x" + x[0] + "x" + x[1], r2(x[1] * (2 * x[0] - x[1]) * 0.00785), "IS 808 size", "Equal angles ISA"]); });
  [[20, 3], [25, 3], [25, 5], [25, 6], [30, 5], [40, 5], [40, 6], [50, 5], [50, 6], [50, 8], [65, 8], [75, 8], [100, 10]].forEach(function (x) { ST.push(["Flat " + x[0] + "x" + x[1] + " mm", r2(x[0] * x[1] * 0.00785), "7850 kg/cum", "Flats"]); });
  [10, 12, 16, 20, 25].forEach(function (a) { ST.push(["Square bar " + a + " mm", r2(a * a * 0.00785), "7850 kg/cum", "Square bars"]); });
  [3, 4, 5, 6, 8, 10, 12, 16, 20, 25].forEach(function (t) { ST.push(["MS plate " + t + " mm (per sqm)", r2(t * 7.85), "7850 kg/cum", "Plates (kg per sqm)"]); });
  EP.STEEL = ST;
  EP.steel = function (name) { for (var i = 0; i < ST.length; i++) if (ST[i][0] === name) return ST[i]; return null; };
  EP.REFMODE = { x: "× factor", kgcum: "kg per cum of selected item", pct: "% of selected item (×7850 kg/cum)" };
  /* Special steel choices: manual kg/m, or steel as % of a concrete volume measured in the same row */
  EP.STEEL_SPECIAL = [["__manual", "Manual weight — type kg/m in Factor"], ["__pct", "Steel % of concrete — type % in Factor (No×L×B×D × % × 7850)"]];
  function hasDims(r) { return [r.n, r.l, r.b, r.h, r.f, r.q].some(function (v) { return EP.ev(v) != null; }); }
  EP.hasDims = hasDims;
  /* kg → unit of the measurement rows of an item (1 for kg items; 0.001 tonne, 0.01 quintal). Rows are in it.qu when it.qk is set. */
  EP.rowKgFactor = function (it) {
    if (!it || !EP.unitFactor) return 1;
    var u = EP.itemQk(it) !== 1 ? it.qu : EP.itemInfo(it).unit; return EP.unitFactor(u);
  };
  /* does this row give a weight in kg (steel section / manual kg per m / steel % / thumb-rule kg)? */
  EP.rowIsKg = function (r) { return !!r && r.k !== "bbs" && ((r.k === "ref" || r.k === "refm") ? (r.m === "pct" || r.m === "kgcum") : !!r.sec); };
  EP.rowQty = function (doc, r, depth, it) {
    if (!r || r.k === "st" || r.k === "nt") return null;
    if (r.k === "h" && !hasDims(r)) return null;
    if (r.k === "bbs") return EP.bbs ? EP.bbs(doc, r).qty : 0;
    var kf = EP.rowIsKg(r) ? EP.rowKgFactor(it) : 1;
    if (r.k === "pc") {   /* % extra (wastage, laps, 5 % steel extra…) on the rows above it */
      var rows = (it && it.meas) || [], ix = rows.indexOf(r), base = 0, pc = EP.ev(r.f);
      for (var j = 0; j < ix; j++) { var x = rows[j]; if (x.k === "st" || x.k === "nt" || x.k === "pc" || (x.k === "h" && !hasDims(x))) continue; var qx = EP.rowQty(doc, x, depth, it) || 0; base += EP.isDed(x) ? -qx : qx; }
      return base * (pc == null ? 0 : pc) / 100;
    }
    if (r.k === "ref" || r.k === "refm") {
      var t = doc.items.filter(function (i) { return i.id === r.ref; })[0]; if (!t || (depth || 0) > 5) return 0;
      var m = EP.ev(r.n), cnt = EP.ev(r.no), base = EP.itemQty(doc, t, (depth || 0) + 1) * (cnt == null ? 1 : cnt);
      if (r.m === "pct") return base * (m == null ? 0 : m) / 100 * 7850 * kf;
      return base * (m == null ? 1 : m) * kf;
    }
    var mq = EP.ev(r.q); if (mq != null) return mq;
    var dims = [r.n, r.l, r.b, r.h].map(EP.ev).filter(function (v) { return v != null; }), fac = EP.ev(r.f);
    if (r.sec === "__pct") { if (!dims.length) return 0; return dims.reduce(function (a, v) { return a * v; }, 1) * (fac == null ? 0 : fac) / 100 * 7850 * kf; }
    var f = dims.concat(fac != null ? [fac] : []);
    if (!f.length) return 0;
    return f.reduce(function (a, v) { return a * v; }, 1) * kf;
  };
  EP.measSum = function (doc, it, depth) {
    var plus = 0, minus = 0, n = 0;
    (it.meas || []).forEach(function (r) { if (r.k === "st" || r.k === "nt" || (r.k === "h" && !hasDims(r))) return; n++; var q = EP.rowQty(doc, r, depth, it) || 0; if (EP.isDed(r)) minus += q; else plus += q; });
    return { plus: plus, minus: minus, net: plus - minus, n: n };
  };
  EP.isDed = function (r) { return r.k === "-" || r.k === "refm"; };
  EP.isRef = function (r) { return r.k === "ref" || r.k === "refm"; };
  /* Totals inside a measurement:
     "st" sub-total = rows since the previous sub-total or net total (a deductions-only block shows its positive total);
     "nt" net total = all additions − all deductions since the previous net total (sub-totals are ignored). */
  EP.subTotal = function (doc, it, ri) {
    var rows = it.meas || [], me = rows[ri] || { k: "st" }, p = 0, m = 0, np = 0;
    for (var i = ri - 1; i >= 0; i--) {
      var r = rows[i];
      if (r.k === "nt") break;
      if (r.k === "st") { if (me.k === "st") break; continue; }
      var q = EP.rowQty(doc, r, 0, it); if (q == null) continue;
      if (EP.isDed(r)) m += q; else { p += q; np++; }
    }
    if (me.k === "nt") return p - m;
    return np ? p - m : m;
  };
  /* it.qk / it.qu: the measurement rows are in unit it.qu and are converted to the item's unit with factor it.qk
     (set when an item is replaced by one of another unit, e.g. kg → tonne) */
  EP.itemQk = function (it) { var k = EP.ev(it && it.qk); return k == null || !it.qu ? 1 : k; };
  EP.itemQty = function (doc, it, depth) {
    var m = EP.measSum(doc, it, depth);
    if (m.n) { var qq = EP.r3(m.net * EP.itemQk(it)); return it.qceil && EP.itemQk(it) !== 1 ? Math.ceil(qq - 1e-9) : qq; }
    var v = EP.ev(it.q); return v == null ? 0 : v;
  };
  /* ---------- Non-schedule (NS) item rate analysis ----------
     x.ns = { bq: "1" (analysis for this many units), rnd: "0.05"|"1"|"0.01",
              L: [{ t: "b" basic rate | "i" SOR item | "m" market / other, b: book, c: code, d: desc, u: unit, q: qty, r: rate,
                    sec: "M"|"L"|"C"|"P", qs: [{ v: vendor, dt: date, r: rate }], pick: "low"|"avg", use: "an"|"sor" }],
              A: [{ p: percent, l: label }] }  (add-ons compound: each % is on the running total, as in CPWD analyses) */
  EP.NS_ADDS = { cpwd23: [{ p: "1", l: "Water charges" }, { p: "21.27", l: "GST on works contract (multiplying factor 0.2127)" }, { p: "15", l: "Contractor's profit and overheads" }, { p: "1", l: "Labour cess" }],
                 cpwd: [{ p: "1", l: "Water charges" }, { p: "15", l: "Contractor's profit and overheads" }, { p: "1", l: "Labour cess" }],
                 secl: [{ p: "1", l: "WC (water charges)" }, { p: "15", l: "CP (contractor's profit)" }],
                 mp: [{ p: "10", l: "Overhead charges" }, { p: "10", l: "Contractor's profit" }],
                 em22: [{ p: "14.05", l: "GST 12 % on works contract (multiplying factor 0.1405)" }, { p: "15", l: "Overheads & profit" }],
                 mp25: [{ p: "12", l: "Overhead charges (MoRTH SDB 2019, small project)" }, { p: "10", l: "Contractor's profit" }] };
  function quoteRate(l) {
    var qs = (l.qs || []).map(function (x) { return EP.ev(x.r); }).filter(function (v) { return v != null && v > 0; });
    if (qs.length) return l.pick === "avg" ? qs.reduce(function (a, b) { return a + b; }, 0) / qs.length : Math.min.apply(null, qs);
    return null;
  }
  /* ----- machine lines (t: "mc"): hire rate per hour / day / shift / month → cost per hour; hours entered or from output -----
     l: { t:"mc", b, c (basic code, optional), d (name), rb: "hour"|"day"|"shift"|"month", r (market rate), hpd (hours/day, 8),
          dry (true = hire excludes fuel & operator), lph (fuel litres/hour), dsl (diesel ₹/litre), opw (operator ₹/day),
          qm: "h" (hours entered in q) | "out" (from output), out (output per hour), wq (work quantity, default = analysis qty), eff (%), minh (minimum hours) } */
  EP.MC_UNITS = { hour: "per hour", day: "per day", shift: "per 8-hour shift", month: "per month (26 days)" };
  function liveBasic(b, c) { return BOOKS[b] && BOOKS[b].basic && BOOKS[b].basic[c] ? basicAn(c, b) : null; }
  EP.mcDiesel = function () { return liveBasic("cpwd", "1235"); };   // CPWD basic: Diesel (litre)
  EP.mcOperator = function () { return liveBasic("cpwd", "0127"); }; // CPWD basic: Driver for road roller, mixer, trucks (day)
  /* ---------- HEMM owning & operating cost (SECL / CMPDI method) ----------
     A (owning, per hour) = capital × (depreciation + interest on half the capital + repair + overhead) % ÷ working hours a year
       working hours = days × shifts × hours per shift × utilisation %
     B (operating, per hour) = diesel L/h × ₹/L + lubricant % of diesel + operator ₹/day ÷ h + helper ₹/day ÷ h */
  EP.HEMM_BASE = { dep: "10.55", int: "9", inth: "1", rep: "10.55", oh: "1", days: "300", shf: "3", hps: "8", utl: "58", lub: "15", hpd: "8", hlw: "0" };
  EP.HEMM = {
    jcb: { d: "JCB / backhoe loader (3DX class)", cap: "30", lph: "4", ra: "1" },
    pc210: { d: "Excavator (Poclain) PC 210 / 220", cap: "70", lph: "13" },
    pc300: { d: "Excavator (Poclain) PC 300", cap: "80", lph: "23" },
    blank: { d: "", cap: "", lph: "" }
  };
  EP.hemmDiesel = function () { var v = liveBasic("cpwd23", "H001"); return v != null ? v : EP.mcDiesel(); };
  /* HPC (High Power Committee) wages for contractors' workers in CIL mines — basic rates H101–H104 of CPWD DSOR 2023 (edit them in Basic rates when the VDA changes) */
  EP.HPC = [["u", "H101", "Unskilled"], ["ss", "H102", "Semi-skilled / unskilled supervisory"], ["sk", "H103", "Skilled"], ["hs", "H104", "Highly skilled"]];
  EP.hpcRate = function (cat) { var x = EP.HPC.filter(function (h) { return h[0] === cat; })[0]; return x ? liveBasic("cpwd23", x[1]) : null; };
  EP.hemmOperator = function (cat) { var v = EP.hpcRate(cat || "sk"); return v != null ? v : EP.mcOperator(); };
  EP.hemmHelper = function (cat) { return EP.hpcRate(cat || "ss"); };
  EP.hemmCalc = function (l) {
    var g = function (k) { var v = EP.ev(l[k]); return v == null ? EP.ev(EP.HEMM_BASE[k]) : v; };
    var cap = (EP.ev(l.cap) || 0) * 100000, dep = g("dep") || 0, int = g("int") || 0, inth = (l.inth == null ? EP.HEMM_BASE.inth : l.inth) !== "0", rep = g("rep") || 0, oh = g("oh") || 0;
    var yrPct = dep + (inth ? int / 2 : int) + rep + oh, yr = cap * yrPct / 100;
    var hrsC = (g("days") || 0) * (g("shf") || 0) * (g("hps") || 0) * (g("utl") || 0) / 100, hrs = EP.ev(l.hrsx) > 0 ? EP.ev(l.hrsx) : hrsC;
    var A = hrs ? yr / hrs : 0; if (l.ra === "1") A = Math.round(A); var Ax = EP.ev(l.ax); if (Ax != null) A = Ax;
    var hpd = g("hpd") || 8, lph = EP.ev(l.lph) || 0, dsl = EP.ev(l.dsl); if (dsl == null) dsl = EP.hemmDiesel() || 0;
    var opw = EP.ev(l.opw); if (opw == null) opw = EP.hemmOperator(l.opc) || 0;
    var hlw = EP.ev(l.hlw); if (hlw == null) hlw = l.hlc ? EP.hemmHelper(l.hlc) || 0 : 0;
    var fuel = lph * dsl, lub = fuel * (g("lub") || 0) / 100, op = opw / hpd, hlp = hlw / hpd, B = fuel + lub + op + hlp;
    var L = function (v) { return EP.r2(v / 100000); }, Araw = Ax != null ? Ax : hrs ? yr / hrs : 0;
    /* the same rows, in the same order, as the SECL / CMPDI "Cost analysis HEMM equipment" sheet */
    var rows = [
      ["1", "Capital cost / fixed cost (₹ lakh)", L(cap)], ["2", "Cost of equipment", "1 no"], ["3", "Total capital cost (₹ lakh)", L(cap)],
      ["4", "Yearly depreciation @ " + dep + "%", L(cap * dep / 100)], ["5", "Average yearly interest @ " + int + "%" + (inth ? " (on half the capital)" : ""), L(cap * (inth ? int / 2 : int) / 100)],
      ["6", "Yearly repair @ " + rep + "%", L(cap * rep / 100)], ["7", "Overhead " + oh + "% of capital cost", L(cap * oh / 100)], ["8", "Total (₹ lakh)", L(yr)], ["", "Total (₹)", EP.r2(yr)],
      ["9", "Standard utilisation per shift as per CMPDI", g("utl") + "%"], ["10", EP.ev(l.hrsx) > 0 ? "Working hours a year (entered)" : "Working hours a year = " + g("days") + " days × " + g("shf") + " shifts × " + g("hps") + " h × " + g("utl") + "%", EP.r2(hrs)],
      ["11", "Hourly cost / rate (A)" + (Ax != null ? " (entered)" : l.ra === "1" ? " — say" : ""), EP.r2(l.ra === "1" && Ax == null ? Math.round(Araw) : Araw)],
      ["12", "Diesel per hour as per norms (litre)", lph], ["13", "Cost of diesel @ ₹" + EP.r2(dsl) + "/litre", EP.r2(lph * dsl)], ["14", "Lubricant cost @ " + (g("lub") || 0) + "% of diesel cost", EP.r2(lph * dsl * (g("lub") || 0) / 100)],
      ["15", "Operator cost per hour (₹" + EP.r2(opw) + "/day ÷ " + hpd + " h)", EP.r2(opw / hpd)]];
    if (hlw) rows.push(["15a", "Helper cost per hour (₹" + EP.r2(hlw) + "/day ÷ " + hpd + " h)", EP.r2(hlw / hpd)]);
    rows.push(["16", "Total (B) = 13 + 14 + 15" + (hlw ? " + 15a" : ""), EP.r2(B0x())], ["17", "Total (A + B) per hour", EP.r2((l.ra === "1" && Ax == null ? Math.round(Araw) : Araw) + B0x())]);
    function B0x() { return lph * dsl * (1 + (g("lub") || 0) / 100) + opw / hpd + hlw / hpd; }
    return { rows: rows, hrsC: hrsC, Acalc: hrs ? yr / hrs : 0, cap: cap, dep: dep, int: int, inth: inth, rep: rep, oh: oh, yrPct: yrPct, yr: yr, hrs: hrs, A: A, lph: lph, dsl: dsl, fuel: fuel, lubPct: g("lub") || 0, lub: lub, opw: opw, op: op, hlw: hlw, hlp: hlp, hpd: hpd, B: B, rate: A + B,
      howA: "A owning: ₹" + EP.r2(cap / 100000) + " lakh × (" + dep + "% depreciation + " + int + "% interest" + (inth ? " on half" : "") + " + " + rep + "% repair + " + oh + "% overhead) = ₹" + EP.r2(yr / 100000) + " lakh a year ÷ " + EP.r2(hrs) + " h (" + g("days") + " days × " + g("shf") + " shifts × " + g("hps") + " h × " + g("utl") + "%) = ₹" + EP.r2(A) + "/h",
      howB: "B operating: diesel " + lph + " L/h × ₹" + EP.r2(dsl) + " = ₹" + EP.r2(fuel) + " + lubricant " + (g("lub") || 0) + "% = ₹" + EP.r2(lub) + " + operator ₹" + EP.r2(opw) + "/day ÷ " + hpd + " h = ₹" + EP.r2(op) + (hlw ? " + helper ₹" + EP.r2(hlw) + "/day ÷ " + hpd + " h = ₹" + EP.r2(hlp) : "") + " = ₹" + EP.r2(B) + "/h" };
  };
  EP.nsMc = function (l, ns) {
    if (l.hm === "own") {
      var hc = EP.hemmCalc(l), hrs0, hH = "";
      if (l.qm === "out") { var o0 = EP.ev(l.out), w0 = EP.ev(l.wq), e0 = EP.ev(l.eff) || 100, b0 = EP.ev(ns && ns.bq) || 1; if (w0 == null) w0 = b0; hrs0 = o0 ? w0 / o0 * 100 / e0 : 0; hH = w0 + " ÷ " + (o0 || 0) + " per hour" + (e0 !== 100 ? " ÷ " + e0 + "% efficiency" : ""); }
      else hrs0 = EP.ev(l.q);
      var mh0 = EP.ev(l.minh); if (mh0 && hrs0 != null && hrs0 < mh0) { hrs0 = mh0; hH += (hH ? "; " : "") + "minimum " + mh0 + " h"; }
      return { rate: hc.rate, base: hc.rate, unit: "hour", perH: hc.rate, fuel: hc.fuel, op: hc.op, hours: hrs0, own: hc, how: hc.howA + "; " + hc.howB + "; A + B = ₹" + EP.r2(hc.rate) + "/h", hHow: hH };
    }
    var B = l.b && BOOKS[l.b], bx = B && B.basic && l.c ? B.basic[l.c] : null;
    var base = bx ? basicAn(l.c, l.b) : (quoteRate(l) != null ? quoteRate(l) : EP.ev(l.r));
    var unit = bx ? String(bx[1] || "hour").toLowerCase() : (l.rb || "hour");
    if (/^h/.test(unit)) unit = "hour"; else if (/^d/.test(unit)) unit = "day"; else if (/^shift/.test(unit)) unit = "shift"; else if (/^m/.test(unit)) unit = "month";
    var hpd = EP.ev(l.hpd) || 8, div = unit === "hour" ? 1 : unit === "day" ? hpd : unit === "shift" ? 8 : unit === "month" ? hpd * 26 : 1;
    var perH = base != null ? base / div : null, how = [];
    if (base != null) how.push(unit === "hour" ? "₹" + EP.r2(base) + "/hour" : "₹" + EP.r2(base) + " " + (EP.MC_UNITS[unit] || unit) + " ÷ " + div + " h");
    var fuel = 0, op = 0;
    if (l.dry) {
      var lph = EP.ev(l.lph) || 0, dsl = EP.ev(l.dsl); if (dsl == null) dsl = EP.mcDiesel() || 0;
      var opw = EP.ev(l.opw); if (opw == null) opw = EP.mcOperator() || 0;
      fuel = lph * dsl; op = opw / hpd;
      if (lph) how.push("+ fuel " + lph + " L/h × ₹" + EP.r2(dsl));
      if (opw) how.push("+ operator ₹" + EP.r2(opw) + "/day ÷ " + hpd + " h");
    } else how.push("(incl. fuel & operator)");
    var rate = perH != null ? perH + fuel + op : null;
    var hours, hHow = "";
    if (l.qm === "out") {
      var out = EP.ev(l.out), wq = EP.ev(l.wq), eff = EP.ev(l.eff) || 100, bq = EP.ev(ns && ns.bq) || 1; if (wq == null) wq = bq;
      hours = out ? wq / out * 100 / eff : 0;
      hHow = wq + " ÷ " + (out || 0) + " per hour" + (eff !== 100 ? " ÷ " + eff + "% efficiency" : "");
    } else hours = EP.ev(l.q);
    var minh = EP.ev(l.minh);
    if (minh && hours != null && hours < minh) { hours = minh; hHow += (hHow ? "; " : "") + "minimum " + minh + " h"; }
    return { rate: rate, base: base, unit: unit, perH: perH, fuel: fuel, op: op, hours: hours, how: how.join(" "), hHow: hHow };
  };
  EP.nsLineRate = function (l, ns) {
    if (l.t === "mc") return EP.nsMc(l, ns).rate;
    if (l.t === "b") { var v = basicAn(l.c, l.b); return v == null ? EP.ev(l.r) : v; }
    if (l.t === "i") { var ir = l.use === "sor" ? EP.sorRate(l.b, l.c) : EP.anRate(l.b, l.c); return ir == null ? EP.ev(l.r) : ir; }
    var qr = quoteRate(l); if (qr != null) return qr;
    return EP.ev(l.r);
  };
  EP.nsLineInfo = function (l) {
    if (l.t === "mc") { var Bm = l.b && BOOKS[l.b], xm = Bm && Bm.basic && l.c ? Bm.basic[l.c] : null; return { desc: l.d || (xm ? xm[0] : "Machine"), unit: "hour" }; }
    if (l.t === "b") { var B = BOOKS[l.b], x = B && B.basic && B.basic[l.c]; return { desc: l.dd || (x ? x[0] : l.d || l.c), unit: x ? x[1] : l.u || "" }; }
    if (l.t === "i") { var it = EP.item(l.b, l.c); return { desc: l.dd || (it ? it.desc : l.d || l.c), unit: it ? it.unit : l.u || "" }; }
    return { desc: l.d || "", unit: l.u || "" };
  };
  EP.nsCalc = function (x) {
    var ns = x && x.ns; if (!ns || !ns.L || !ns.L.length) return null;
    var lines = ns.L.map(function (l) {
      var inf = EP.nsLineInfo(l), r, q, mc = null;
      if (l.t === "mc") { mc = EP.nsMc(l, ns); r = mc.rate; q = mc.hours; } else { r = EP.nsLineRate(l, ns); q = EP.ev(l.q); }
      return { l: l, desc: inf.desc, unit: inf.unit, r: r, q: q, mc: mc, amt: r != null && q != null ? r * q : 0 };
    });
    var sub = lines.reduce(function (a, v) { return a + v.amt; }, 0), run = sub;
    var adds = (ns.A || []).map(function (a) { var p = EP.ev(a.p) || 0, amt = run * p / 100; run += amt; return { pct: p, label: a.l || "", amt: amt, run: run }; });
    var bq = EP.ev(ns.bq); if (!bq || bq <= 0) bq = 1;
    var raw = run / bq, st = EP.ev(ns.rnd == null ? "0.05" : ns.rnd) || 0.01;
    var rate = st === 0.05 ? EP.r05(raw) : Math.round(raw / st) * st;
    return { lines: lines, sub: sub, adds: adds, total: run, basis: bq, raw: raw, rate: EP.r2(rate) };
  };
  /* Make an NS analysis from a book item (its current analysis, or its rate as a single line) */
  EP.nsFromItem = function (b, c) {
    var B = BOOKS[b], it = EP.item(b, c); if (!it) return null;
    var ns = { bq: "1", rnd: B && B.round === 1 ? "1" : "0.05", L: [], A: [] };
    var bu = EP.hasAn(b, c) ? EP.build(c, null, 0, b) : null;
    if (bu) {
      ns.bq = String(bu.basis || 1);
      bu.lines.forEach(function (l) {
        if (l.q == null && !l.amt) return;
        var per = l.per && l.per !== 1 ? l.per : 1, q = l.q != null ? EP.r3(l.q / per) : 1, sec = l.sec || "M";
        if (l.code && B.basic && B.basic[l.code]) ns.L.push({ t: "b", b: b, c: l.code, q: String(q), sec: sec });
        else if (l.code && B.an && B.an[l.code] && l.code !== c) ns.L.push({ t: "i", b: b, c: l.code, q: String(q), sec: sec, use: "an" });
        else ns.L.push({ t: "m", d: l.desc || "", u: l.unit || "", r: String(EP.r2(l.r != null ? l.r : l.amt)), q: String(l.q != null ? q : 1), sec: sec });
      });
      ns.A = bu.adds.filter(function (a) { return !a.except; }).map(function (a) { return { p: String(a.pct), l: String(a.label || "").replace(/^\s*\d+(\.\d+)?\s*%\s*/, "").replace(/^./, function (ch) { return ch.toUpperCase(); }) }; });
      if (bu.adds.some(function (a) { return a.except || a.part; })) ns.note = "Some add-ons of the original analysis apply to part of the cost only; they are applied here on the full cost. Check before use.";
    } else {
      ns.L.push({ t: "i", b: b, c: c, q: "1", sec: "M", use: "an" });
      ns.A = [];
    }
    return { desc: it.desc, unit: it.unit, src: "NS item, based on " + (B ? B.short : b) + " " + c + " (modified)", ns: ns };
  };
  EP.itemInfo = function (it) {
    if (it.b === "x") { var x = it.x || {}; return { desc: x.desc || "(describe the item)", unit: x.unit || "", src: x.src || "Non-SOR item", code: "" }; }
    var bk = BOOKS[it.b], i = bk && bk.idx[it.c];
    return { desc: i ? i.desc : "(item " + it.c + " not found in " + (bk ? bk.name : "this SOR") + ")", unit: i ? i.unit : "", src: (bk ? bk.short : it.b) + " " + it.c, code: it.c, missing: !i };
  };
  /* Rates used in an estimate line: s = SOR (estimate) rate, a = updated rate */
  /* Analysis of an estimate line: library analysis + library edits (build mode) + this estimate's own edits (it.ab) */
  EP.itemOv = function (it) {
    if (!it || it.b === "x") return null;
    var o = EP.itemOvr(it.b, it.c), base = o && o.mode === "build" ? o : null, ab = it.ab;
    if (!EP.hasEstEdits(it) || (ab && ab.custom && EP.hasAn(it.b, it.c))) return base;
    var m = { lines: {}, adds: {}, extra: [] };
    [base, ab].forEach(function (src) { if (!src) return; Object.keys(src.lines || {}).forEach(function (i) { m.lines[i] = Object.assign({}, m.lines[i] || {}, src.lines[i]); }); Object.keys(src.adds || {}).forEach(function (j) { m.adds[j] = src.adds[j]; }); });
    m.extra = (ab.extra || []).slice(); if (ab.noAdj) m.noAdj = 1; if (ab.basis) m.basis = ab.basis;
    return m;
  };
  /* an analysis built by the user for an SOR item that has none in the book (it.ab.custom) */
  EP.customAn = function (it) {
    if (!it || it.b === "x" || !it.ab || !it.ab.custom || EP.hasAn(it.b, it.c)) return null;
    var A = (it.ab.cA || []).map(function (a) { return [+a[0] || 0, a[1] || "", 0, 0, "R"]; }), s = EP.sorRate(it.b, it.c);
    return { s: s, b: 1, L: [], A: A, src: "", note: "Rate analysis made for this estimate", custom: true };
  };
  /* an analysis made in an estimate (it.ab, custom) → book analysis entry (used for admin approval) */
  EP.anFromCustom = function (it) {
    var bu = EP.itemBuild(it); if (!bu) return null;
    var L = bu.lines.filter(function (l) { return !l.removed; }).map(function (l) {
      var src = l.extra != null ? (it.ab.extra || [])[l.extra] || {} : {}, code = l.code || "";
      if (src.t === "b" && src.b && src.b !== it.b) code = "";          // another book's basic rate: keep the rate, not the link
      return [code, l.desc || "", l.r != null ? +(+l.r).toFixed(4) : null, null, l.unit || "", l.q != null ? +(+l.q).toFixed(6) : null, +(+l.amt).toFixed(2), l.sec || "M", l.sec === "R" ? "R" : ""];
    });
    var A = bu.adds.map(function (a) { return [a.pct, a.label || "", 0, +(+a.amt).toFixed(2), "R"]; });
    return { s: +(+bu.rate).toFixed(2), b: bu.basis || 1, L: L, A: A, src: "", note: "", pure: true, admin: true };
  };
  /* analyses approved by the admin: become the item's analysis for everybody */
  EP.addApproved = function (rows) {
    if (rows !== EP._approved) EP._approved = (EP._approved || []).concat(rows || []);
    (rows || []).forEach(function (r) {
      var B = BOOKS[r.book]; if (!B || !r.data) return;
      if (B.an && B.an[r.code] && !B.an[r.code].admin) return;            // never replace a book's own analysis
      B.an = B.an || {}; B.an[r.code] = Object.assign({}, r.data, { pure: true, admin: true, at: r.approved_at });
    });
    EP.bump();
  };
  EP.removeApproved = function (book, code) { if (EP._approved) EP._approved = EP._approved.filter(function (r) { return !(r.book === book && r.code === code); }); var B = BOOKS[book]; if (B && B.an && B.an[code] && B.an[code].admin) delete B.an[code]; EP.bump(); };
  EP.adminNote = "Not from the SOR — drafted copy, analysed by admin. Please check.";
  EP.itemHasAn = function (it) { return !!(it && it.b !== "x" && (EP.hasAn(it.b, it.c) || EP.customAn(it))); };
  EP.itemBuild = function (it) {
    if (!it || it.b === "x") return null;
    if (EP.hasAn(it.b, it.c)) return EP.build(it.c, EP.itemOv(it), 0, it.b);
    var cx = EP.customAn(it); if (!cx) return null;
    var ov = EP.itemOv(it) || {}; ov.basis = it.ab.basis || 1; ov.noAdj = 1;
    var bu = EP.build(it.c, ov, 0, it.b, cx); if (bu) { bu.custom = true; bu.adjDropped = 0; } return bu;
  };
  EP.hasEstEdits = function (it) { var ab = it && it.ab; return !!(ab && (Object.keys(ab.lines || {}).length || Object.keys(ab.adds || {}).length || (ab.extra || []).length || ab.noAdj || ab.basis || ab.custom) && !(ab.custom && EP.hasAn(it.b, it.c))); };
  EP.lineRates = function (doc, it) {
    var s, a, how;
    if (it.b === "x") { var x = it.x || {}, nc = EP.nsCalc(x); s = EP.ev(x.sor); a = EP.ev(x.an); if (nc) { if (s == null) s = nc.rate; if (a == null) a = nc.rate; how = "NS item analysis"; } else { if (a == null) a = s; how = x.src || "Non-SOR"; } }
    else {
      s = EP.sorRate(it.b, it.c);
      var o = EP.itemOvr(it.b, it.c), lib = EP.anRate(it.b, it.c);
      if (doc.basis === "sor" && !(o && (o.mode === "manual" || o.mode === "build"))) { a = s; how = "SOR rate"; }
      else { a = lib; how = EP.modeLabel(it.b, it.c); }
    }
    if (it.b !== "x" && EP.hasEstEdits(it) && doc.basis !== "sor") { var bu = EP.itemBuild(it); if (bu && !(bu.custom && !(bu.total > 0))) { a = EP.roundRate(it.b, bu.rate); how = bu.custom ? "Rate analysis made for this estimate" : "Analysis edited for this estimate"; } }
    var ov = EP.ev(it.anr); if (ov != null) { a = ov; how = "Entered for this estimate"; }
    var q = EP.itemQty(doc, it);
    return { s: s, a: a, q: q, sa: s != null ? EP.r2(s * q) : 0, aa: a != null ? EP.r2(a * q) : 0, how: how };
  };
  EP.partItems = function (doc, pid) { return doc.items.filter(function (i) { return i.part === pid; }); };
  EP.totals = function (doc) {
    var parts = doc.parts.map(function (p) {
      var s = 0, a = 0; EP.partItems(doc, p.id).forEach(function (it) { var r = EP.lineRates(doc, it); s += r.sa; a += r.aa; });
      return { id: p.id, name: p.name, s: EP.r2(s), a: EP.r2(a) };
    });
    var s = parts.reduce(function (x, p) { return x + p.s; }, 0), a = parts.reduce(function (x, p) { return x + p.a; }, 0), g = (+doc.gst || 0) / 100;
    return { parts: parts, s: EP.r2(s), a: EP.r2(a), sg: EP.r2(s * g), ag: EP.r2(a * g), sT: EP.r2(s * (1 + g)), aT: EP.r2(a * (1 + g)) };
  };
  EP.slOf = function (doc, it) { return EP.partItems(doc, it.part).indexOf(it) + 1; };
})();
