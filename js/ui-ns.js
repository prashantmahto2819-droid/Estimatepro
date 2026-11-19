/* Estimate Pro — non-schedule (NS) items: rate analysis builder, market-rate quotations,
   "make NS from a SOR item", personal NS library, and smarter item search. */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc, inr = U.inr;
  var E = function () { return U.est; };
  S.nsLib = []; S.nsUi = { q: {}, quotes: {} };
  var SEC = [["M", "Material"], ["L", "Labour"], ["C", "Carriage"], ["P", "Machinery"]];
  var SECN = { M: "MATERIAL", L: "LABOUR", C: "CARRIAGE", P: "MACHINERY" };

  /* ---------- smarter search: Hindi / site words, short forms, typo tolerance ---------- */
  var SYN = {
    gitti: ["aggregate"], giti: ["aggregate"], gitty: ["aggregate"], rodi: ["aggregate"], ballast: ["aggregate", "ballast"],
    sariya: ["reinforcement", "steel"], saria: ["reinforcement", "steel"], sarya: ["reinforcement", "steel"], rebar: ["reinforcement"], tmt: ["tmt", "reinforcement"],
    ret: ["sand"], reti: ["sand"], balu: ["sand"], bajri: ["sand", "aggregate"],
    eent: ["brick"], int: ["brick"], eet: ["brick"], ent: ["brick"],
    khudai: ["excavation"], khodai: ["excavation"], khudayi: ["excavation"], mitti: ["earth", "soil"],
    bharai: ["filling"], bharav: ["filling"], bharaav: ["filling"],
    dhalai: ["concrete"], dhalaai: ["concrete"], concreting: ["concrete"],
    putai: ["white washing", "distemper"], putaai: ["white washing", "distemper"], safedi: ["white washing"], chuna: ["lime", "white washing"],
    rangai: ["paint"], rang: ["paint"], painting: ["paint"],
    farsh: ["flooring", "floor"], chhat: ["roof"], chhath: ["roof"], chat: ["roof"],
    pathar: ["stone"], patthar: ["stone"], murum: ["moorum"], murram: ["moorum"], murrum: ["moorum"],
    darwaza: ["door"], darwaja: ["door"], khidki: ["window"], chaukhat: ["frame"], chokhat: ["frame"],
    jali: ["grill", "mesh"], jaali: ["grill", "mesh"], nali: ["drain"], naali: ["drain"], nala: ["drain"],
    plaster: ["plaster"], plastar: ["plaster"], lipai: ["plaster"],
    tiles: ["tile"], tyle: ["tile"], kota: ["kota stone"],
    pcc: ["cement concrete"], rcc: ["reinforced cement concrete"], cc: ["cement concrete"],
    ms: ["mild steel", "m.s."], gi: ["galvanised", "g.i."], di: ["ductile iron", "d.i."], ci: ["cast iron", "c.i."],
    wbm: ["water bound macadam"], dbm: ["dense bituminous macadam"], bc: ["bituminous concrete"], bm: ["bituminous macadam"],
    gsb: ["granular sub-base", "granular sub base"], wmm: ["wet mix macadam"], sdbc: ["semi dense bituminous"], pqc: ["pavement quality concrete"], dlc: ["dry lean concrete"],
    bandhai: ["binding", "bending"], bandai: ["binding", "bending"], katai: ["cutting"], kataai: ["cutting"], todna: ["dismantling", "demolishing"], todai: ["dismantling", "demolishing"], tudai: ["dismantling", "demolishing"],
    ghisai: ["polishing", "rubbing"], ghutai: ["rubbing"], chinai: ["masonry", "brick work"], jodai: ["masonry", "joint"], sadak: ["road"], pul: ["bridge"], pulia: ["culvert"], puliya: ["culvert"],
    shuttering: ["shuttering", "centering"],
 formwork: ["centering", "shuttering"],
    waterproofing: ["water proofing"], dpc: ["damp proof course"], upvc: ["upvc", "unplasticised"], cpvc: ["cpvc"], swr: ["swr"]
  };
  function alts(w) { var a = [w]; if (SYN[w]) a = a.concat(SYN[w]); if (w.length > 3 && /s$/.test(w)) a.push(w.slice(0, -1)); return a; }
  function lev1(a, b, max) { // bounded edit distance
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var prev = [], cur, i, j; for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) { cur = [i]; var best = i; for (j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); if (cur[j] < best) best = cur[j]; } if (best > max) return max + 1; prev = cur; }
    return prev[b.length];
  }
  var tokCache = new WeakMap();
  function toks(it) { var t = tokCache.get(it); if (!t) { t = it.desc.toLowerCase().split(/[^a-z0-9]+/).filter(function (x) { return x.length > 2; }); tokCache.set(it, t); } return t; }
  function fuzzyHas(it, w) { if (w.length < 5) return false; var max = w.length >= 8 ? 2 : 1; return toks(it).some(function (t) { return Math.abs(t.length - w.length) <= max && lev1(w, t, max) <= max; }); }
  function recentKey() { return "ep_recent_" + (S.me && S.me.id || ""); }
  U.recent = function () { try { return JSON.parse(localStorage.getItem(recentKey()) || "[]"); } catch (e) { return []; } };
  U.pushRecent = function (b, c) { try { var r = U.recent().filter(function (x) { return !(x[0] === b && x[1] === c); }); r.unshift([b, c]); localStorage.setItem(recentKey(), JSON.stringify(r.slice(0, 15))); } catch (e) {} };
  /* opts: { book: "all" | id, fuzzy: true } → [{b, it, s, fz}] */
  U.searchItems = function (q, lim, opts) {
    opts = opts || {}; q = String(q || "").trim().toLowerCase(); if (!q) return [];
    var words = q.split(/\s+/).filter(Boolean), out = [], rec = {}; U.recent().forEach(function (x, i) { rec[x[0] + "|" + x[1]] = 15 - i; });
    var books = Object.keys(EP.BOOKS).filter(function (b) { return !opts.book || opts.book === "all" || opts.book === b; });
    function scan(fuzzy) {
      var need = fuzzy && words.length >= 2 ? words.length - 1 : words.length;
      books.forEach(function (b) {
        EP.BOOKS[b].list.forEach(function (it) {
          var c = it.code.toLowerCase(), s = 0;
          if (c === q) s = 200; else if (c.indexOf(q) === 0) s = 150;
          else {
            var dd = it.desc.toLowerCase(), hit = 0, sc = 0, fz = 0, miss = 0;
            for (var i = 0; i < words.length; i++) {
              var w = words[i], best = -1, a = alts(w);
              for (var j = 0; j < a.length; j++) { var pos = dd.indexOf(a[j]); if (pos >= 0 && (best < 0 || pos < best)) best = pos; else if (pos < 0 && best < 0 && c.indexOf(a[j]) >= 0) best = 0; }
              if (best >= 0) { hit++; sc += /^[\d.:x×\/-]+$/.test(w) ? 1 : 1 + 4 * (1 - Math.min(best, 400) / 400); }
              else if (fuzzy && fuzzyHas(it, w)) { hit++; fz++; sc += 1; }
              else { miss++; if (words.length - miss < need) break; }
            }
            if (hit >= need && hit > 0) s = 40 + sc - fz * 3 - miss * 8 - Math.min(8, dd.length / 150);
          }
          if (s) { s += (rec[b + "|" + it.code] || 0) * 0.6; out.push({ b: b, it: it, s: s, fz: fuzzy }); }
        });
      });
    }
    scan(false);
    if (!out.length && opts.fuzzy !== false) scan(true);
    out.sort(function (a, b) { return b.s - a.s; });
    return out.slice(0, lim || 30);
  };
  U.nsLibSearch = function (q) {
    q = String(q || "").trim().toLowerCase(); if (!q) return [];
    var words = q.split(/\s+/);
    return S.nsLib.filter(function (n) { var d = (n.name || "").toLowerCase(); return words.every(function (w) { return alts(w).some(function (a) { return d.indexOf(a) >= 0; }); }); }).slice(0, 8);
  };

  /* ---------- NS library (Supabase: user_ns) ---------- */
  U.loadNs = async function () {
    var r = await U.db().from("user_ns").select("id,name,unit,data,updated_at").order("updated_at", { ascending: false });
    if (r.error) { console.error(r.error); return; }
    S.nsLib = r.data || []; U.render();
  };
  function nsRateOf(data) { var c = EP.nsCalc(data || {}); return c ? c.rate : EP.ev(data && data.sor); }
  async function saveToLib(it) {
    var x = it.x || {}; if (!(x.desc || "").trim()) { U.toast("Write the item description first."); return; }
    var data = JSON.parse(JSON.stringify({ desc: x.desc, unit: x.unit || "", src: x.src || "", why: x.why || "", sor: x.sor || "", an: x.an || "", ns: x.ns || null }));
    var body = { name: x.desc.trim().slice(0, 500), unit: x.unit || "", data: data }, r;
    var mine = x.libId && S.nsLib.some(function (n) { return n.id === x.libId; });
    if (mine) r = await U.db().from("user_ns").update(body).eq("id", x.libId).select("id").single();
    else r = await U.db().from("user_ns").insert(Object.assign({ owner: S.me.id }, body)).select("id").single();
    if (U.fail(r, "Couldn't save to your NS library.")) return;
    if (!mine && r.data) E().change(function () { it.x.libId = r.data.id; }, false);
    U.toast(mine ? "NS library item updated" : "Saved to your NS library"); U.loadNs();
  }
  async function delLib(id) {
    var r = await U.db().from("user_ns").delete().eq("id", id); if (U.fail(r, "Couldn't delete.")) return;
    S.nsLib = S.nsLib.filter(function (n) { return n.id !== id; }); U.toast("Removed from your NS library"); U.render();
  }
  U.nsLibSection = function () {
    var h = '<div class="panel form"><h3>My NS items (non-schedule items with analysis)</h3><p class="muted" style="margin:0">Save any non-SOR item with its rate analysis from an estimate (<em>Save to my NS library</em>). It then appears in item search in every estimate, marked <span class="badge">My NS</span>, with rates recalculated from current basic rates.</p>';
    if (!S.nsLib.length) return h + '<div class="empty">No NS items saved yet.</div></div>';
    h += '<div class="tw"><table class="t"><thead><tr><th>Description</th><th>Unit</th><th class="num">Rate today ₹</th><th>Updated</th><th></th></tr></thead><tbody>';
    h += S.nsLib.map(function (n) { var r = nsRateOf(n.data); return "<tr><td class='desc' style='max-width:520px'>" + esc(n.name) + "</td><td>" + esc(n.unit) + "</td><td class='num'>" + (r != null ? inr(r) : "—") + "</td><td>" + U.when(n.updated_at) + "</td><td><button class='btn ghost sm' data-nslibdel='" + esc(n.id) + "'>Delete</button></td></tr>"; }).join("");
    return h + "</tbody></table></div></div>";
  };

  /* ---------- line picker search (basic rates + SOR items) ---------- */
  function basicSearch(q, lim) {
    q = q.trim().toLowerCase(); if (!q) return [];
    var words = q.split(/\s+/), out = [];
    Object.keys(EP.BOOKS).forEach(function (b) {
      var B = EP.BOOKS[b]; if (!B.basic) return;
      Object.keys(B.basic).forEach(function (c) {
        if (/^H\d{3}$/.test(c)) return;   // HEMM-only rates (HPC wages, HEMM diesel) are not offered for other analyses
        var x = B.basic[c], d = String(x[0] || "").toLowerCase(), cc = c.toLowerCase();
        if (cc === q) { out.push({ b: b, c: c, x: x, s: 9 }); return; }
        if (words.every(function (w) { return alts(w).some(function (a) { return d.indexOf(a) >= 0 || cc.indexOf(a) === 0; }); })) out.push({ b: b, c: c, x: x, s: (EP.usage[b] && EP.usage[b][c] ? Math.min(5, Math.log(1 + EP.usage[b][c])) : 0) });
      });
    });
    out.sort(function (a, b) { return b.s - a.s; });
    return out.slice(0, lim || 14);
  }
  function pickerDd(it) {
    var q = S.nsUi.q[it.id] || ""; if (!q.trim()) return "";
    var bs = basicSearch(q, 12), is = U.searchItems(q, 10), h = '<div class="dd ns-dd">';
    if (!bs.length && !is.length) return h + '<div class="empty">Nothing found. Use “+ Market rate / other line” instead.</div></div>';
    h += bs.map(function (r) { var rate = EP.basicAn(r.c, r.b), mcn = isMachine(r.b, r.c); return '<button type="button" data-' + (mcn ? "nsaddmcb" : "nsaddb") + '="' + it.id + "|" + r.b + "|" + esc(r.c) + '"><span><span class="badge ' + (mcn ? "ed" : "info") + '">' + (mcn ? "Machine" : "Basic rate") + '</span><br><span class="muted" style="font-size:11px">' + esc(EP.BOOKS[r.b].name) + " · " + esc(r.c) + '</span></span><span class="desc">' + esc(r.x[0]) + '</span><span class="num">₹' + inr(rate) + "/" + esc(r.x[1] || "") + "</span></button>"; }).join("");
    h += is.map(function (r) { var rate = EP.anRate(r.b, r.it.code); return '<button type="button" data-nsaddi="' + it.id + "|" + r.b + "|" + esc(r.it.code) + '"><span><span class="badge">SOR item</span><br><span class="muted" style="font-size:11px">' + esc(EP.BOOKS[r.b].name) + " · " + esc(r.it.code) + '</span></span><span class="desc">' + esc(r.it.desc) + '</span><span class="num">₹' + inr(rate) + "/" + esc(r.it.unit) + "</span></button>"; }).join("");
    return h + "</div>";
  }

  /* ---------- machine lines ---------- */
  function isMachine(b, c) {
    var B = EP.BOOKS[b], x = B && B.basic && B.basic[c]; if (!x) return false;
    var u = String(x[1] || "").toLowerCase();
    if (!/^(hour|day|shift|month)/.test(u)) return false;
    if (/^P&M-/.test(c)) return true;
    if ((b === "cpwd" || b === "cpwd23") && /^01\d\d$/.test(c)) return false; // CPWD labour codes
    return /hire|excavator|tipper|truck|loader|roller|crane|compressor|mixer|pump|dozer|grader|paver|jcb|machine|plant|generator|rig|winch|vibrator|trailer|tractor/i.test(x[0]);
  }
  function pmInfo(l) { var B = EP.BOOKS.mp, p = l.c && B && B.pm ? B.pm[l.c] : null; return p && p[2] ? p : null; }
  function mcDetail(it, l, cl, k, idp, dis) {
    var mc = cl.mc || {}, B = l.b && EP.BOOKS[l.b], bx = B && B.basic && l.c ? B.basic[l.c] : null, pi = pmInfo(l), nm = (l.d || "") + " " + (bx ? bx[0] : "");
    function inp(f, ph, w, lab) { return "<label class='bf'><span>" + lab + "</span><input class='in small n' style='width:" + (w || 70) + "px' id='" + idp + f + "' data-nsl='" + k + "|" + f + "' value='" + esc(l[f] == null ? "" : l[f]) + "' placeholder='" + esc(ph == null ? "" : ph) + "'" + dis + "></label>"; }
    function sel(f, opts, v, lab) { return "<label class='bf'><span>" + lab + "</span><select class='in small' data-nsl='" + k + "|" + f + "'" + dis + ">" + opts.map(function (o) { return "<option value='" + o[0] + "'" + (String(v) === String(o[0]) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></label>"; }
    var h = "<tr class='ks mc-row'><td></td><td colspan='8'><div class='bbs'><div class='bbs-r'>";
    h += sel("hm", [["", "Hire rate (quotation / SOR)"], ["own", "Owning & operating cost (SECL / CMPDI HEMM)"]], l.hm || "", "Costing");
    if (l.hm === "own") {
      /* the SECL / CMPDI cost-analysis sheet, typed straight into its rows: grey figures are worked out, white boxes are yours */
      var o = mc.own || {}, B0 = EP.HEMM_BASE, rw = {}; (o.rows || []).forEach(function (r) { rw[r[0] || "8r"] = r[2]; });
      function ti(f, ph, w) { return "<input class='in small n' style='width:" + (w || 64) + "px' id='" + idp + f + "' data-nsl='" + k + "|" + f + "' value='" + esc(l[f] == null ? "" : l[f]) + "' placeholder='" + esc(ph == null ? "" : ph) + "'" + dis + " aria-label='" + f + "'>"; }
      function ts(f, opts, v) { return "<select class='in small' data-nsl='" + k + "|" + f + "'" + dis + ">" + opts.map(function (x) { return "<option value='" + x[0] + "'" + (String(v) === String(x[0]) ? " selected" : "") + ">" + esc(x[1]) + "</option>"; }).join("") + "</select>"; }
      function v(x) { return typeof x === "number" ? inr(x) : esc(x == null ? "" : x); }
      function tr(no, label, val, bold) { return "<tr><td>" + no + "</td><td>" + (bold ? "<strong>" + label + "</strong>" : label) + "</td><td class='num'>" + (bold ? "<strong>" + val + "</strong>" : val) + "</td></tr>"; }
      h += sel("qm", [["h", "Enter hours"], ["out", "From output per hour"]], l.qm || "h", "Hours");
      if (l.qm === "out") h += inp("out", "", 70, "Output per hour") + inp("wq", String(EP.ev((it.x.ns || {}).bq) || 1), 70, "Work qty") + inp("eff", "100", 52, "Efficiency %");
      h += inp("minh", "", 56, "Min. hours") + "</div>";
      h += "<table class='t hemm' style='margin-top:6px;max-width:820px'><thead><tr><th>#</th><th>Cost analysis — " + esc(l.d || "HEMM equipment") + " (white boxes are editable)</th><th class='num'>Value</th></tr></thead><tbody>" +
        tr("1", "Capital cost / fixed cost (₹ lakh)", ti("cap", "₹ lakh", 80)) + tr("2", "Cost of equipment", "1 no") + tr("3", "Total capital cost (₹ lakh)", v(rw["3"])) +
        tr("4", "Yearly depreciation @ " + ti("dep", B0.dep, 58) + " %", v(rw["4"])) +
        tr("5", "Average yearly interest @ " + ti("int", B0.int, 58) + " % " + ts("inth", [["1", "on half the capital"], ["0", "on full capital"]], l.inth == null ? "1" : l.inth), v(rw["5"])) +
        tr("6", "Yearly repair @ " + ti("rep", B0.rep, 58) + " %", v(rw["6"])) + tr("7", "Overhead " + ti("oh", B0.oh, 50) + " % of capital cost", v(rw["7"])) +
        tr("8", "Total (₹ lakh)", v(rw["8"]), true) + tr("", "Total (₹)", v(rw["8r"])) +
        tr("9", "Standard utilisation per shift as per CMPDI " + ti("utl", B0.utl, 50) + " %", v(rw["9"])) +
        tr("10", "Working hours a year = " + ti("days", B0.days, 52) + " days × " + ti("shf", B0.shf, 40) + " shifts × " + ti("hps", B0.hps, 40) + " h × utilisation", ti("hrsx", EP.r2(o.hrsC || 0), 80)) +
        tr("11", "Hourly cost / rate (A) " + ts("ra", [["", "exact"], ["1", "say (round to ₹1)"]], l.ra || ""), ti("ax", EP.r2(l.ra === "1" ? Math.round(o.Acalc || 0) : (o.Acalc || 0)), 80), true) +
        tr("12", "Diesel per hour as per norms (litre)", ti("lph", "L/h", 64)) +
        tr("13", "Cost of diesel @ ₹ " + ti("dsl", EP.r2(EP.hemmDiesel() || 0), 64) + " /litre", v(rw["13"])) +
        tr("14", "Lubricant cost @ " + ti("lub", B0.lub, 50) + " % of diesel cost", v(rw["14"])) +
        tr("15", "Operator cost per hour: " + ts("opc", EP.HPC.map(function (x) { return [x[0], "HPC " + x[2] + " ₹" + EP.r2(EP.hpcRate(x[0]) || 0)]; }), l.opc || "sk") + " ₹ " + ti("opw", EP.r2(EP.hemmOperator(l.opc) || 0), 70) + " /day ÷ " + ti("hpd", B0.hpd, 40) + " h", v(rw["15"])) +
        tr("15a", "Helper cost per hour: " + ts("hlc", [["", "no helper"]].concat(EP.HPC.map(function (x) { return [x[0], "HPC " + x[2] + " ₹" + EP.r2(EP.hpcRate(x[0]) || 0)]; })), l.hlc || "") + " ₹ " + ti("hlw", l.hlc ? EP.r2(EP.hemmHelper(l.hlc) || 0) : "0", 70) + " /day", v(rw["15a"] != null ? rw["15a"] : 0)) +
        tr("16", "Total (B) = 13 + 14 + 15 + 15a", v(rw["16"]), true) + tr("17", "Total (A + B) per hour", v(rw["17"]), true) +
        "<tr><td></td><td class='muted' style='font-size:12px'>18 – 22: Add 1% WC, total, add 15% CP, total cost per hour = the add-on rows of this analysis below</td><td></td></tr></tbody></table>" +
        (mc.hHow ? "<div>Hours = " + esc(mc.hHow) + " = <strong>" + EP.r3(mc.hours || 0) + "</strong></div>" : "");
      h += "<div class='muted' style='font-size:11px'>Grey figures in a box = worked out, or the live basic rate: H001 diesel and HPC wages H101–H104 (unskilled / semi-skilled / skilled / highly skilled, CIL order w.e.f. 01.10.2026) — Basic rates → CPWD DSOR 2023 → “HEMM (HPC wages, diesel)”. Type in a box to use your own figure; clear it to go back. Row 10 and row 11 boxes override the worked-out hours / hourly cost A.</div>";
      return h + "</div></td></tr>";
    }
    if (bx) h += "<span class='bf'><span>Hire rate (live)</span><strong style='padding:6px 0'>₹" + inr(mc.base) + " " + esc(EP.MC_UNITS[mc.unit] || bx[1]) + "</strong></span>";
    else { var nq = (l.qs || []).filter(function (z) { return EP.ev(z.r) != null; }).length; h += sel("rb", Object.keys(EP.MC_UNITS).map(function (u) { return [u, EP.MC_UNITS[u]]; }), l.rb || "hour", "Hire rate basis") + (nq ? "<span class='bf'><span>Hire rate (quotes)</span><strong style='padding:6px 0'>₹" + inr(mc.base) + "</strong></span>" : inp("r", "₹", 90, "Hire rate ₹")); }
    if (mc.unit === "day" || mc.unit === "month" || l.dry) h += inp("hpd", "8", 52, "Working h/day");
    h += sel("dry", [["", "Wet hire: incl. fuel & operator"], ["1", "Dry hire: + fuel + operator"]], l.dry ? "1" : "", "Hire type");
    if (l.dry) h += inp("lph", /backhoe|jcb|3dx|3cx/i.test(nm) ? "4–8" : /excavator/i.test(nm) ? "13–16" : "L/h", 60, "Fuel L/hour") + inp("dsl", EP.mcDiesel() != null ? EP.r2(EP.mcDiesel()) : "", 70, "Diesel ₹/L") + inp("opw", EP.mcOperator() != null ? EP.r2(EP.mcOperator()) : "", 70, "Operator ₹/day");
    h += "</div><div class='bbs-r'>" + sel("qm", [["h", "Enter hours"], ["out", "From output per hour"]], l.qm || "h", "Hours");
    if (l.qm === "out") h += inp("out", pi ? pi[2] : "", 70, "Output per hour" + (pi && pi[1] ? " (" + pi[1].replace(/\s+/g, " ") + ")" : "")) + inp("wq", String(EP.ev((it.x.ns || {}).bq) || 1), 70, "Work qty") + inp("eff", "100", 52, "Efficiency %");
    h += inp("minh", "", 56, "Min. hours") + "</div>";
    h += "<div class='bbs-out'><span>Cost per hour <strong>₹" + (mc.rate != null ? inr(mc.rate) : "—") + "</strong></span><span class='muted'>" + esc(mc.how || "") + "</span>" + (mc.hHow ? "<span>Hours = " + esc(mc.hHow) + " = <strong>" + EP.r3(mc.hours || 0) + "</strong></span>" : "") + "</div>";
    if (pi) h += "<div class='muted' style='font-size:11px'>MoRTH SDB output for " + esc(l.c) + ": " + esc(pi[0]) + " — " + esc(pi[1]) + " " + esc(pi[2]) + ". SDB / PWD hourly usage rates already include fuel, operator and repairs (wet rate).</div>";
    else if (l.dry) h += "<div class='muted' style='font-size:11px'>Typical diesel use: backhoe loader (JCB 3DX class) 4–8 L/hour; 20-tonne excavator 13–16 L/hour. Check on site — it varies with load and idling.</div>";
    return h + "</div></td></tr>";
  }

  /* ---------- NS analysis panel (inside a non-SOR item) ---------- */
  U.nsPanel = function (it, R) {
    var x = it.x || {}, ns = x.ns, c = EP.nsCalc(x), unit = x.unit || "unit", dis = R ? " disabled" : "";
    var h = '<div class="ns-box"><div class="row" style="justify-content:space-between;align-items:center;gap:8px"><h3 style="margin:0">Rate analysis of this NS item</h3>';
    if (!R) h += '<div class="row" style="gap:6px">' + (ns ? '<button type="button" class="btn sec sm" data-nssave="' + it.id + '">' + (x.libId ? "Update in my NS library" : "Save to my NS library") + "</button>" : "") + "</div>";
    h += "</div>";
    if (!ns) {
      var ready = U.nsReady && U.nsReady(x.desc);
      if (ready && !R) h += '<div class="ds-msg" style="border-color:var(--ok);margin:4px 0"><b>Ready rate analysis available</b> – materials, labour and add-ons for this item (≈ ₹' + inr((EP.nsCalc({ ns: ready.an }) || {}).rate || 0) + ' per ' + esc(ready.u || unit) + '). <button type="button" class="btn pri sm" data-nsready="' + it.id + '">Use the ready analysis</button></div>';
      h += '<p class="muted" style="margin:0">Build the rate from basic rates (CPWD / MPPWD labour, material, machinery at current rates), other SOR items, and market rates with quotations. Water charges, contractor\'s profit & overheads and cess are added as in CPWD analyses.</p>';
      if (!R) h += '<div class="row" style="gap:6px;flex-wrap:wrap"><button type="button" class="btn pri sm" data-nsstart="' + it.id + '|cpwd23">Start analysis (CPWD DAR 2023: 1% water + GST ×0.2127 + 15% CPOH + 1% cess)</button><button type="button" class="btn sec sm" data-nsstart="' + it.id + '|cpwd">Start analysis (CPWD 2021: 1% water + 15% CPOH + 1% cess)</button><button type="button" class="btn sec sm" data-nsstart="' + it.id + '|mp">Start analysis (MPPWD add-ons: 10% overhead + 10% profit)</button><button type="button" class="btn sec sm" data-nsstart="' + it.id + '|mp25">Start analysis (MPPWD 2025 / MoRTH: 12% overhead + 10% profit)</button><button type="button" class="btn sec sm" data-nsstart="' + it.id + '|em22">Start analysis (CPWD E&amp;M 2022: GST ×0.1405 + 15% overheads &amp; profit)</button><button type="button" class="btn sec sm" data-nsstart="' + it.id + '|secl">Start analysis (SECL: 1% WC + 15% CP)</button></div>';
      if (!R) h += '<div class="row" style="gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px"><strong style="font-size:13px">HEMM hire (SECL / CMPDI):</strong><select class="in small" id="nshemm0-' + it.id + '" aria-label="Machine">' + Object.keys(EP.HEMM).map(function (k) { return '<option value="' + k + '">' + esc(k === "blank" ? "Other machine (blank)" : EP.HEMM[k].d) + "</option>"; }).join("") + '</select><button type="button" class="btn sec sm" data-nsstart="' + it.id + '|hemm">Start HEMM analysis per hour (owning + operating + 1% WC + 15% CP)</button></div>';
      if (!R) h += '<div class="row" style="gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px"><strong style="font-size:13px">Or start from an SOR item\'s analysis:</strong><select class="in small" id="nscp-b-' + it.id + '" aria-label="Rate book">' + ["cpwd23", "cpwd", "mp25", "mp", "em22"].filter(function (b) { return EP.BOOKS[b]; }).map(function (b) { return '<option value="' + b + '">' + esc(EP.BOOKS[b].name) + "</option>"; }).join("") + '</select><input class="in small" id="nscp-c-' + it.id + '" placeholder="Item code, e.g. 13.61.1" style="width:170px"><button type="button" class="btn sec sm" data-nscopy="' + it.id + '">Copy its analysis here</button><span class="muted" style="font-size:12px">All its materials, labour and add-ons come in at today\'s rates — then change what differs.</span></div>';
      return h + "</div>";
    }
    if (!c) c = { lines: [], sub: 0, adds: (ns.A || []).map(function (z) { return { pct: EP.ev(z.p) || 0, label: z.l, amt: 0, run: 0 }; }), total: 0, basis: EP.ev(ns.bq) || 1, raw: 0, rate: 0 };
    if (!ns.L.length) h += '<div class="badge info" style="white-space:normal;align-self:flex-start">Add lines below: search a basic rate (cement, beldar, mason, 20 mm aggregate, mixer…) or an SOR item, or add a market-rate line with quotations.</div>';
    if (ns.note) h += '<div class="badge warn" style="white-space:normal">' + esc(ns.note) + "</div>";
    h += '<div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end"><label class="fld"><span class="lbl">Analysis for (qty)</span><input class="in n small" style="width:90px" id="ns-bq-' + it.id + '" data-nsf="' + it.id + '|bq" value="' + esc(ns.bq || "1") + '"' + dis + '></label><span class="muted" style="padding-bottom:8px">' + esc(unit) + '</span><label class="fld"><span class="lbl">Round the rate to</span><select class="in small" data-nsf="' + it.id + '|rnd"' + dis + ">" + [["0.05", "₹0.05 (CPWD)"], ["1", "₹1 (MPPWD)"], ["0.01", "₹0.01"]].map(function (o) { return '<option value="' + o[0] + '"' + (String(ns.rnd == null ? "0.05" : ns.rnd) === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" + (!R && EP.ev(ns.bq) && EP.ev(ns.bq) !== 1 ? '<button type="button" class="btn sec sm" style="margin-bottom:4px" data-nsper1="' + it.id + '">Show per 1 ' + esc(unit) + ' (÷ ' + esc(String(EP.ev(ns.bq))) + ' all quantities)</button>' : "") + "</div>";
    // lines
    h += "<div class='mtw'><table class='t mt ns-t'><thead><tr><th>#</th><th>Source</th><th>Description</th><th>Unit</th><th class='num'>Qty</th><th class='num'>Rate ₹</th><th class='num'>Amount ₹</th><th>Head</th><th></th></tr></thead><tbody>";
    var sec = null;
    c.lines.forEach(function (cl, i) {
      var l = cl.l, k = it.id + "|" + i, idp = "ns-" + it.id + "-" + i + "-";
      if (l.sec !== sec) { sec = l.sec; h += "<tr class='kh'><td></td><td colspan='8'><strong>" + (SECN[sec] || "OTHER") + "</strong></td></tr>"; }
      var src = l.t === "mc" ? "<span class='badge ed'>Machine</span><br><span class='muted' style='font-size:11px'>" + (l.c ? esc((EP.BOOKS[l.b] || {}).name || l.b) + " " + esc(l.c) : "Market hire") + "</span>" : l.t === "b" ? "<span class='badge info'>Basic</span><br><span class='muted' style='font-size:11px'>" + esc((EP.BOOKS[l.b] || {}).name || l.b) + " " + esc(l.c) + "</span>" : l.t === "i" ? "<span class='badge'>SOR item</span><br><span class='muted' style='font-size:11px'>" + esc((EP.BOOKS[l.b] || {}).name || l.b) + " " + esc(l.c) + "</span>" : "<span class='badge warn'>Market</span>";
      var nq = (l.qs || []).filter(function (z) { return EP.ev(z.r) != null; }).length;
      h += "<tr><td class='num'>" + (i + 1) + "</td><td style='white-space:nowrap'>" + src + "</td>";
      if (l.t === "mc") {
        h += "<td><input class='in small wide' id='" + idp + "d' data-nsl='" + k + "|d' value='" + esc(l.d || "") + "' placeholder='" + esc(cl.desc && l.c ? cl.desc : "e.g. Hydraulic excavator 0.9 cum (JCB / Tata Hitachi)") + "' aria-label='Machine'" + dis + "></td><td>hour</td>";
      } else if (l.t === "m") {
        h += "<td><input class='in small wide' id='" + idp + "d' data-nsl='" + k + "|d' value='" + esc(l.d || "") + "' placeholder='e.g. Epoxy grout (market rate)' aria-label='Description'" + dis + "></td><td><input class='in small' style='width:70px' id='" + idp + "u' data-nsl='" + k + "|u' value='" + esc(l.u || "") + "' aria-label='Unit'" + dis + "></td>";
      } else h += "<td><textarea class='in small wide' rows='2' style='resize:vertical;min-width:220px' id='" + idp + "dd' data-nsl='" + k + "|dd' aria-label='Description (edit for this analysis)' title='Edit the wording for this analysis. Clear it to go back to the book description.'" + dis + ">" + esc(cl.desc) + "</textarea>" + (l.dd ? "<span class='muted' style='font-size:11px'>edited · clear to restore book text</span>" : "") + "</td><td>" + esc(cl.unit) + "</td>";
      if (l.t === "mc" && l.qm === "out") h += "<td class='num'><strong>" + (cl.q != null ? EP.r3(cl.q) : "—") + "</strong><br><span class='muted' style='font-size:11px'>hours (from output)</span></td>";
      else h += "<td class='num'><input class='in small n' style='width:80px' id='" + idp + "q' data-nsl='" + k + "|q' value='" + esc(l.q == null ? "" : l.q) + "' placeholder='" + (l.t === "mc" ? "hours" : "") + "' aria-label='Quantity'" + dis + "></td>";
      if (l.t === "mc") h += "<td class='num'>" + (cl.r != null ? inr(cl.r) : "—") + "<br><span class='muted' style='font-size:11px'>per hour</span></td>";
      else if (l.t === "m" && !nq) h += "<td class='num'><input class='in small n' style='width:96px' id='" + idp + "r' data-nsl='" + k + "|r' value='" + esc(l.r || "") + "' aria-label='Rate'" + dis + "></td>";
      else h += "<td class='num'>" + (cl.r != null ? inr(cl.r) : "—") + (l.t === "m" ? "<br><span class='muted' style='font-size:11px'>" + (l.pick === "avg" ? "average" : "lowest") + " of " + nq + " quote" + (nq > 1 ? "s" : "") + "</span>" : l.t === "i" && l.use === "sor" ? "<br><span class='muted' style='font-size:11px'>SOR rate</span>" : "<br><span class='muted' style='font-size:11px'>live</span>") + "</td>";
      h += "<td class='num'><strong>" + inr(cl.amt) + "</strong></td>";
      h += "<td><select class='in small' data-nsl='" + k + "|sec' aria-label='Head'" + dis + ">" + SEC.map(function (s) { return "<option value='" + s[0] + "'" + (l.sec === s[0] ? " selected" : "") + ">" + s[1] + "</option>"; }).join("") + "</select></td><td style='white-space:nowrap'>";
      if (!R) {
        if (l.t === "mc") { if (!l.c) h += "<button type='button' class='btn ghost sm' data-nsquotes='" + k + "' title='Hire rate quotations'>Quotes" + (nq ? " (" + nq + ")" : "") + "</button>"; }
        else if (l.t === "m") h += "<button type='button' class='btn ghost sm' data-nsquotes='" + k + "' title='Market rate quotations'>Quotes" + (nq ? " (" + nq + ")" : "") + "</button>";
        else h += "<button type='button' class='btn ghost sm' data-nsown='" + k + "' title='Replace the live rate with your own market rate'>Own rate</button>";
        h += "<button type='button' class='btn ghost sm' data-nsmv='" + k + "|-1' aria-label='Move up'>↑</button><button type='button' class='btn ghost sm' data-nsmv='" + k + "|1' aria-label='Move down'>↓</button><button type='button' class='btn ghost sm' data-nsdel='" + k + "' aria-label='Remove line'>✕</button>";
      }
      h += "</td></tr>";
      if (l.t === "mc") h += mcDetail(it, l, cl, k, idp, dis);
      if ((l.t === "m" || (l.t === "mc" && !l.c)) && S.nsUi.quotes[k]) {
        var qs = l.qs || [];
        h += "<tr class='ks'><td></td><td colspan='8'><div class='ns-q'><strong>Market rate justification</strong> <span class='muted'>(take at least 3 quotations; enter rates without GST, delivered at site)</span>";
        h += "<table class='t'><thead><tr><th>Firm / supplier</th><th>Quotation date</th><th class='num'>Rate ₹ " + esc(l.t === "mc" ? (EP.MC_UNITS[l.rb || "hour"] || "per hour") : "per " + (l.u || "unit")) + "</th><th></th></tr></thead><tbody>";
        qs.forEach(function (z, j) { var qk = k + "|" + j, qid = idp + "q" + j + "-"; h += "<tr><td><input class='in small' style='width:100%;min-width:220px' id='" + qid + "v' data-nsqt='" + qk + "|v' value='" + esc(z.v || "") + "' aria-label='Supplier'" + dis + "></td><td><input class='in small' type='date' id='" + qid + "dt' data-nsqt='" + qk + "|dt' value='" + esc(z.dt || "") + "' aria-label='Date'" + dis + "></td><td class='num'><input class='in small n' id='" + qid + "r' data-nsqt='" + qk + "|r' value='" + esc(z.r || "") + "' aria-label='Rate'" + dis + "></td><td>" + (R ? "" : "<button type='button' class='btn ghost sm' data-nsqdel='" + qk + "'>✕</button>") + "</td></tr>"; });
        h += "</tbody></table>";
        if (!R) h += "<div class='row' style='gap:8px;flex-wrap:wrap;align-items:center'><button type='button' class='btn sec sm' data-nsqadd='" + k + "'>+ Quotation</button><label class='row' style='gap:6px;align-items:center'>Adopt <select class='in small' data-nsl='" + k + "|pick'><option value='low'" + (l.pick !== "avg" ? " selected" : "") + ">lowest</option><option value='avg'" + (l.pick === "avg" ? " selected" : "") + ">average</option></select> rate</label></div>";
        h += "</div></td></tr>";
      }
    });
    h += "<tr class='ks'><td></td><td colspan='5'><strong>Total of lines</strong></td><td class='num'><strong>" + inr(c.sub) + "</strong></td><td colspan='2'></td></tr>";
    c.adds.forEach(function (a, j) {
      var ak = it.id + "|" + j, aid = "ns-" + it.id + "-a" + j + "-";
      h += "<tr><td></td><td colspan='2'><span class='row' style='gap:6px;flex-wrap:nowrap;align-items:center'>Add <input class='in small n' style='width:64px' id='" + aid + "p' data-nsa='" + ak + "|p' value='" + esc((ns.A[j] || {}).p || "") + "' aria-label='Percent'" + dis + ">% <input class='in small wide' id='" + aid + "l' data-nsa='" + ak + "|l' value='" + esc((ns.A[j] || {}).l || "") + "' aria-label='Add-on name'" + dis + "></span></td><td colspan='3' class='muted' style='font-size:12px'>on ₹" + inr(a.run - a.amt) + "</td><td class='num'>" + inr(a.amt) + "</td><td></td><td>" + (R ? "" : "<button type='button' class='btn ghost sm' data-nsadel='" + ak + "' aria-label='Remove add-on'>✕</button>") + "</td></tr>";
    });
    h += "<tr class='ks'><td></td><td colspan='5'><strong>Cost for " + esc(String(c.basis)) + " " + esc(unit) + "</strong></td><td class='num'><strong>" + inr(c.total) + "</strong></td><td colspan='2'></td></tr>";
    h += "</tbody></table></div>";
    if (!R) {
      h += "<div class='row' style='gap:6px;flex-wrap:wrap;align-items:flex-start'><div style='position:relative;flex:1;min-width:260px'><input class='in' style='width:100%' id='ns-q-" + it.id + "' data-nsq='" + it.id + "' value='" + esc(S.nsUi.q[it.id] || "") + "' placeholder='Add a basic rate or SOR item: cement, beldar, mason, 20 mm aggregate, mixer, 4.1.3…' autocomplete='off' aria-label='Search basic rates and SOR items'>" + pickerDd(it) + "</div>";
      h += "<button type='button' class='btn sec sm' data-nsaddmc='" + it.id + "'>+ Machine / equipment (hourly)</button><span class='row' style='gap:4px;align-items:center'><select class='in small' id='nshemm-" + it.id + "' aria-label='HEMM machine'>" + Object.keys(EP.HEMM).map(function (k) { return "<option value='" + k + "'>" + esc(k === "blank" ? "Other machine (blank)" : EP.HEMM[k].d) + "</option>"; }).join("") + "</select><button type='button' class='btn sec sm' data-nshemm='" + it.id + "'>+ HEMM (owning &amp; operating)</button></span><button type='button' class='btn sec sm' data-nsaddm='" + it.id + "|M'>+ Market rate / other line</button><button type='button' class='btn sec sm' data-nsaddm='" + it.id + "|L'>+ Labour line (own rate)</button><button type='button' class='btn sec sm' data-nsaadd='" + it.id + "'>+ Add-on %</button></div>";
    }
    h += "<div class='ns-res'><span>Rate per " + esc(unit) + " = ₹" + inr(c.total) + " ÷ " + esc(String(c.basis)) + " = ₹" + inr(c.raw) + "</span><span>Say <strong>₹" + inr(c.rate) + "</strong> per " + esc(unit) + "</span>" + "<label class='row' style='gap:6px;align-items:center'><span>Adopt rate ₹</span><input class='in small n' style='width:110px' id='nsadopt-" + it.id + "' data-nsadopt='" + it.id + "' value='" + esc(x.an != null && x.an !== "" ? x.an : "") + "' placeholder='" + inr(c.rate) + "'" + dis + " aria-label='Adopted rate (blank = analysis)'><span class='muted' style='font-size:12px'>per " + esc(unit) + " (blank = analysis)</span></label>" +
      (EP.ev(x.sor) != null || EP.ev(x.an) != null ? "<span class='badge warn'>Typed rate in use: ₹" + inr(EP.ev(x.an) != null ? EP.ev(x.an) : EP.ev(x.sor)) + "</span>" : "") + "</div>";
    if (!R) h += "<div class='row' style='gap:6px'><button type='button' class='btn ghost sm' data-nsclear='" + it.id + "'>Remove analysis</button></div>";
    return h + "</div>";
  };

  /* ---------- actions ---------- */
  function ns(it) { it.x = it.x || {}; return it.x.ns; }
  function upd(id, fn, rr) { var it = E().findItem(id); if (!it) return; E().change(function () { fn(it, it.x.ns); }, rr); }
  function focusLater(id) { setTimeout(function () { var n = document.getElementById(id); if (n) n.focus(); }, 40); }
  document.addEventListener("input", function (e) {
    var t = e.target, ds = t.dataset; if (!U.est || E().ro()) return;
    if (ds.nsq) { S.nsUi.q[ds.nsq] = t.value; U.render(); return; }
    if (ds.nsf) { var f = ds.nsf.split("|"); if (f[1] === "rnd") return; upd(f[0], function (it, n) { n[f[1]] = t.value; }); return; }
    if (ds.nsl) { var p = ds.nsl.split("|"); if (/^(sec|pick|rb|dry|qm|hm|inth|ra|opc|hlc)$/.test(p[2])) return; if (p[2] === "dd") { upd(p[0], function (it, n) { var L = n.L[+p[1]], inf = EP.nsLineInfo(Object.assign({}, L, { dd: "" })), v = t.value.trim(); if (!v || v === inf.desc) delete L.dd; else L.dd = t.value; }, false); return; }
    upd(p[0], function (it, n) { n.L[+p[1]][p[2]] = t.value; }, p[2] !== "d" && p[2] !== "u"); return; }
    if (ds.nsqt) { var q = ds.nsqt.split("|"); upd(q[0], function (it, n) { n.L[+q[1]].qs[+q[2]][q[3]] = t.value; }, q[3] === "r"); return; }
    if (ds.nsa) { var a = ds.nsa.split("|"); upd(a[0], function (it, n) { n.A[+a[1]][a[2]] = t.value; }, a[2] === "p"); return; }
  });
  document.addEventListener("change", function (e) {
    var t = e.target, ds = t.dataset; if (!U.est || E().ro()) return;
    if (ds.nsf && ds.nsf.split("|")[1] === "rnd") { upd(ds.nsf.split("|")[0], function (it, n) { n.rnd = t.value; }); return; }
    if (ds.nsl) { var p = ds.nsl.split("|"); if (/^(sec|pick|rb|dry|qm|hm|inth|ra|opc|hlc)$/.test(p[2])) upd(p[0], function (it, n) { n.L[+p[1]][p[2]] = t.value; }); }
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && e.target.dataset && e.target.dataset.nsq) { S.nsUi.q[e.target.dataset.nsq] = ""; U.render(); } });
  document.addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t || !U.est) return;
    var ds = t.dataset;
    if (ds.nsquotes) { S.nsUi.quotes[ds.nsquotes] = !S.nsUi.quotes[ds.nsquotes]; U.render(); return; }
    if (ds.nslibdel) { if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again"; return; } delLib(ds.nslibdel); return; }
    if (E().ro()) return;
    var p;
    if (ds.nsready) { var rd = U.nsReady && U.nsReady((E().findItem(ds.nsready).x || {}).desc); if (rd) upd(ds.nsready, function (it) { it.x.ns = JSON.parse(JSON.stringify(rd.an)); it.x.src = "NS item — ready rate analysis (edit quotes)"; }); return; }
    if (ds.nsstart && ds.nsstart.split("|")[1] !== "hemm") { p = ds.nsstart.split("|"); upd(p[0], function (it) { it.x.ns = { bq: "1", rnd: p[1] === "mp" || p[1] === "mp25" || p[1] === "em22" ? "1" : p[1] === "secl" ? "0.01" : "0.05", L: [], A: JSON.parse(JSON.stringify(EP.NS_ADDS[p[1]])) }; }); focusLater("ns-q-" + p[0]); return; }
    if (ds.nsaddb || ds.nsaddi) { p = (ds.nsaddb || ds.nsaddi).split("|"); var bk = p[1], code = p.slice(2).join("|"), isB = !!ds.nsaddb;
      var sec = isB ? ((EP.BOOKS[bk].basic[code] || [])[4] === "L" || /^L-|^01[0-9][0-9]$/.test(code) ? "L" : /^P&M|hire|mixer|vibrator|roller/i.test(code + " " + (EP.BOOKS[bk].basic[code] || [""])[0]) ? "P" : "M") : "M";
      upd(p[0], function (it, n) { n.L.push(isB ? { t: "b", b: bk, c: code, q: "1", sec: sec } : { t: "i", b: bk, c: code, q: "1", sec: sec, use: "an" }); });
      S.nsUi.q[p[0]] = ""; U.render(); var it0 = E().findItem(p[0]); focusLater("ns-" + p[0] + "-" + (it0.x.ns.L.length - 1) + "-q"); return; }
    if (ds.nshemm) { // HEMM machine costed SECL / CMPDI way (owning + operating per hour)
      var hk = (document.getElementById("nshemm-" + ds.nshemm) || {}).value || "jcb", pre = EP.HEMM[hk] || EP.HEMM.blank;
      upd(ds.nshemm, function (it, n) { n.L.push(Object.assign({ t: "mc", hm: "own", q: "1", qm: "h", sec: "P" }, EP.HEMM_BASE, pre)); });
      S.nsUi.q[ds.nshemm] = ""; U.render(); return;
    }
    if (ds.nsstart && ds.nsstart.split("|")[1] === "hemm") { // one-click: SECL add-ons + one HEMM machine, rate per hour
      p = ds.nsstart.split("|"); var hk2 = (document.getElementById("nshemm0-" + p[0]) || {}).value || "jcb";
      upd(p[0], function (it) { it.x.ns = { bq: "1", rnd: "0.01", L: [Object.assign({ t: "mc", hm: "own", q: "1", qm: "h", sec: "P" }, EP.HEMM_BASE, EP.HEMM[hk2])], A: JSON.parse(JSON.stringify(EP.NS_ADDS.secl)) }; if (!it.x.unit) it.x.unit = "hour"; if (!it.x.src) it.x.src = "Analysis (SECL HEMM owning & operating cost)"; });
      return;
    }
    if (ds.nsaddmc || ds.nsaddmcb) {
      p = (ds.nsaddmc || ds.nsaddmcb).split("|"); var mcid = p[0];
      upd(mcid, function (it, n) { n.L.push(ds.nsaddmcb ? { t: "mc", b: p[1], c: p.slice(2).join("|"), d: "", q: "", qm: "h", sec: "P" } : { t: "mc", d: "", rb: "hour", r: "", q: "", qm: "h", sec: "P", pick: "low", qs: [] }); });
      S.nsUi.q[mcid] = ""; U.render(); var itm = E().findItem(mcid); focusLater("ns-" + mcid + "-" + (itm.x.ns.L.length - 1) + (ds.nsaddmcb ? "-q" : "-d")); return;
    }
    if (ds.nsaddm) { p = ds.nsaddm.split("|"); upd(p[0], function (it, n) { n.L.push({ t: "m", d: "", u: p[1] === "L" ? "day" : "", q: "1", r: "", sec: p[1], pick: "low", qs: [] }); }); var it1 = E().findItem(p[0]); focusLater("ns-" + p[0] + "-" + (it1.x.ns.L.length - 1) + "-d"); return; }
    if (ds.nsown) { p = ds.nsown.split("|"); upd(p[0], function (it, n) { var l = n.L[+p[1]], inf = EP.nsLineInfo(l), r = EP.nsLineRate(l); n.L[+p[1]] = { t: "m", d: inf.desc + " (market rate)", u: inf.unit, q: l.q, r: r != null ? String(EP.r2(r)) : "", sec: l.sec, pick: "low", qs: [] }; }); return; }
    if (ds.nsdel) { p = ds.nsdel.split("|"); upd(p[0], function (it, n) { n.L.splice(+p[1], 1); }); return; }
    if (ds.nsmv) { p = ds.nsmv.split("|"); upd(p[0], function (it, n) { var i = +p[1], j = i + (+p[2]); if (j < 0 || j >= n.L.length) return; var tmp = n.L[i]; n.L[i] = n.L[j]; n.L[j] = tmp; }); return; }
    if (ds.nsqadd) { p = ds.nsqadd.split("|"); upd(p[0], function (it, n) { var l = n.L[+p[1]]; l.qs = l.qs || []; if (!l.qs.length && EP.ev(l.r) != null) l.qs.push({ v: "", dt: "", r: l.r }); l.qs.push({ v: "", dt: "", r: "" }); }); focusLater("ns-" + p[0] + "-" + p[1] + "-q" + (E().findItem(p[0]).x.ns.L[+p[1]].qs.length - 1) + "-v"); return; }
    if (ds.nsqdel) { p = ds.nsqdel.split("|"); upd(p[0], function (it, n) { n.L[+p[1]].qs.splice(+p[2], 1); }); return; }
    if (ds.nsaadd) { upd(ds.nsaadd, function (it, n) { n.A.push({ p: "", l: "" }); }); focusLater("ns-" + ds.nsaadd + "-a" + (E().findItem(ds.nsaadd).x.ns.A.length - 1) + "-p"); return; }
    if (ds.nsadel) { p = ds.nsadel.split("|"); upd(p[0], function (it, n) { n.A.splice(+p[1], 1); }); return; }
    if (ds.nsclear) { if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again to remove the analysis"; return; } upd(ds.nsclear, function (it) { delete it.x.ns; }); return; }
    if (ds.nssave) { saveToLib(E().findItem(ds.nssave)); return; }
    if (ds.nsper1) { // turn an analysis "for 10 sqm" into the same analysis for 1 sqm (rate unchanged)
      upd(ds.nsper1, function (it, n) {
        var bq = EP.ev(n.bq); if (!bq || bq === 1) return;
        n.L.forEach(function (l) { if (l.t === "mc" && l.qm === "out") return; var q = EP.ev(l.q); if (q != null) l.q = String(+(q / bq).toPrecision(6)); });
        n.bq = "1";
      });
      U.toast("Quantities divided — the analysis is now for 1 unit (the rate is the same)"); return;
    }
    if (ds.nscopy) { // copy a SOR item's analysis into this NS item (its own description, unit and measurements stay)
      var cb = (document.getElementById("nscp-b-" + ds.nscopy) || {}).value, cc = ((document.getElementById("nscp-c-" + ds.nscopy) || {}).value || "").trim();
      if (!cb || !cc) { U.toast("Type the SOR item code first, e.g. 13.61.1"); return; }
      if (!EP.item(cb, cc)) { U.toast("Item " + cc + " is not in " + EP.BOOKS[cb].name); return; }
      var mk = EP.nsFromItem(cb, cc); if (!mk) { U.toast("This item can't be copied."); return; }
      var tgt = E().findItem(ds.nscopy), su = EP.item(cb, cc).unit, tu = (tgt.x || {}).unit || "";
      upd(ds.nscopy, function (it) { it.x.ns = mk.ns; if (!it.x.unit) it.x.unit = su; if (!it.x.src || /^analysis rate$/i.test(it.x.src)) it.x.src = "Analysis based on " + (EP.BOOKS[cb].short || cb) + " " + cc; it.x.ref = cb + "|" + cc; });
      U.toast("Analysis of " + cc + " copied — rate per " + su + (tu && EP.unitConv(tu, su) !== 1 && tu.toLowerCase() !== su.toLowerCase() ? ". Note: this item's unit is " + tu + "; set “Analysis for (qty)” to match." : "."));
      return;
    }
    if (ds.tons) { // turn a SOR item into an NS item with its analysis, keeping measurements
      if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again: make an NS copy to modify"; return; }
      var src = E().findItem(ds.tons), made = EP.nsFromItem(src.b, src.c); if (!made) { U.toast("This item can't be copied."); return; }
      var nid = EP.uid();
      E().change(function (d) { var i = d.items.indexOf(src); d.items.splice(i + 1, 0, { id: nid, part: src.part, b: "x", x: Object.assign(made, { sor: "", an: "" }), q: src.q || "", rem: "", meas: JSON.parse(JSON.stringify(src.meas || [])), from: src.b + "|" + src.c }); });
      S.est.open = {}; S.est.open[nid] = true; U.render(); U.toast("NS copy added below the original. Change its analysis, then delete the original if not needed."); return;
    }
    if (ds.addns) { // add an item from my NS library
      var lib = S.nsLib.filter(function (n) { return n.id === ds.addns; })[0]; if (!lib) return;
      var xid = EP.uid(), data = JSON.parse(JSON.stringify(lib.data || {})), dd0 = E().doc(), dupNs = dd0 && E().dupe(dd0, E().curPart(), "x", null, lib.id);
      if (dupNs) { S.est.addQ = ""; S.est.open = {}; S.est.open[dupNs.id] = true; U.render(); U.toast(E().dupeMsg(dd0, dupNs)); return; }
      E().change(function (d) { d.items.push({ id: xid, part: E().curPart(), b: "x", x: Object.assign({ desc: lib.name, unit: lib.unit, src: "NS item (my library)" }, data, { libId: lib.id }), q: "", rem: "", meas: [] }); });
      S.est.addQ = ""; S.est.open = {}; S.est.open[xid] = true; U.render(); return;
    }
    if (ds.addxq) { // create a new NS item from the search text
      var yid = EP.uid(), txt = S.est.addQ || "";
      E().change(function (d) { d.items.push({ id: yid, part: E().curPart(), b: "x", x: { desc: txt.charAt(0).toUpperCase() + txt.slice(1), unit: "", sor: "", an: "", src: "NS item — rate analysis attached" }, q: "", rem: "", meas: [] }); });
      S.est.addQ = ""; S.est.open = {}; S.est.open[yid] = true; U.render(); focusLater("x-unit-" + yid); return;
    }
  });
})();
