/* Estimate Pro — review workflow (JE → AE → EE), estimate versions + comparison, audit trail.
   * Versions: a saved copy of the estimate with the rates/amounts worked out at that time (calc), numbered v1, v2…
   * Review: the owner sends a version to an officer of his group; each officer comments, forwards to the next level,
     returns it (to the owner or to someone who handled it before) or approves it (final).
   * Audit: every save records what changed (item added/removed, quantity, rate, GST…) with who and when;
     the database also logs every library / group / personal rate change (rate_log). */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc, inr = U.inr;
  S.rv = { list: [], levels: {}, open: null, steps: {}, ver: {}, vers: {}, cmp: { a: "", b: "cur", all: false }, audit: {}, rlog: {}, form: { to: "", comment: "", busy: false, vnote: "" }, act: { to: "", comment: "", back: "" }, notes: {}, ok: true };
  function db() { return U.db(); }
  function me() { return S.me.id; }
  var LV = { CE: 1, SE: 2, EE: 3, AE: 4, AEE: 4, JE: 5 };
  var STAT = { in_review: ["Under review", "info"], returned: ["Returned", "warn"], approved: ["Approved", "ok"], withdrawn: ["Withdrawn", ""] };
  var ACT = { submit: "Sent for review", forward: "Recommended & forwarded", "return": "Returned", approve: "Approved", comment: "Remark", withdraw: "Withdrawn" };
  function when(t) { if (!t) return ""; var d = new Date(t); return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) + " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); }
  function short(s, n) { s = String(s || ""); return s.length > (n || 90) ? s.slice(0, n || 90) + "…" : s; }

  /* ---------- calc: what the app works out for a document (stored with every version) ---------- */
  U.calcOf = function (d) {
    var T = EP.totals(d), items = [];
    d.parts.forEach(function (p) {
      EP.partItems(d, p.id).forEach(function (it, i) {
        var inf = EP.itemInfo(it), r = EP.lineRates(d, it);
        items.push({ id: it.id, part: p.id, pn: p.name, sl: i + 1, b: it.b, c: it.c || "", code: inf.code || "NS", desc: short(inf.desc, 160), unit: inf.unit, q: +(+r.q || 0).toFixed(3), s: r.s, a: r.a, sa: r.sa, aa: r.aa, how: r.how || "" });
      });
    });
    return { gst: +d.gst || 0, s: T.s, a: T.a, total: T.aT, totalS: T.sT, parts: T.parts, items: items, n: items.length };
  };

  /* ---------- loading ---------- */
  U.loadReviews = async function () {
    try {
      var r = await db().from("est_reviews").select("*").order("updated_at", { ascending: false });
      if (r.error) { S.rv.ok = false; return; }
      S.rv.ok = true; S.rv.list = r.data || [];
      var tm = await db().from("team_members").select("team_id,user_id,level");
      if (!tm.error) { var L = {}; (tm.data || []).forEach(function (m) { L[m.team_id + "|" + m.user_id] = m.level || ""; }); S.rv.levels = L; }
      U.render();
    } catch (e) { S.rv.ok = false; }
  };
  U.reviewsWaiting = function () { return S.rv.list.filter(function (r) { return r.status === "in_review" && r.holder === me(); }).length + S.rv.list.filter(function (r) { return r.status === "returned" && r.owner === me(); }).length; };
  function levelOf(uid) { var best = ""; Object.keys(S.rv.levels).forEach(function (k) { var p = k.split("|"); if (p[1] === uid) { var l = S.rv.levels[k]; if (l && (!best || (LV[l] || 6) < (LV[best] || 6))) best = l; } }); return best; }
  function mates() { var seen = {}, out = []; (S.grp.mates || []).forEach(function (m) { if (seen[m.user_id]) return; seen[m.user_id] = 1; out.push({ id: m.user_id, name: m.full_name || m.email, email: m.email, lv: S.rv.levels[m.team_id + "|" + m.user_id] || levelOf(m.user_id) }); }); out.sort(function (a, b) { return (LV[b.lv] || 6) - (LV[a.lv] || 6) || String(a.name).localeCompare(b.name); }); return out; }
  function mateOpts(sel, skip) { return "<option value=''>Choose officer…</option>" + mates().filter(function (m) { return (skip || []).indexOf(m.id) < 0; }).map(function (m) { return "<option value='" + esc(m.id) + "'" + (sel === m.id ? " selected" : "") + ">" + esc((m.lv ? m.lv + " · " : "") + m.name) + "</option>"; }).join(""); }
  async function loadVersions(eid, force) {
    if (S.rv.vers[eid] && !force) return;
    S.rv.vers[eid] = S.rv.vers[eid] || [];
    var r = await db().from("estimate_versions").select("id,no,name,note,kind,calc,total,created_by,created_by_name,created_at").eq("estimate_id", eid).order("no", { ascending: false });
    if (r.error) { S.rv.vers[eid] = []; S.rv.ok = false; U.render(); return; }
    S.rv.vers[eid] = r.data || []; U.render();
  }
  async function loadSteps(rid) {
    var r = await db().from("est_review_steps").select("*").eq("review_id", rid).order("at");
    if (!r.error) { S.rv.steps[rid] = r.data || []; U.render(); }
  }
  async function loadAudit(eid) {
    var r = await db().from("estimate_audit").select("*").eq("estimate_id", eid).order("at", { ascending: false }).limit(500);
    S.rv.audit[eid] = r.error ? [] : (r.data || []);
    var d = S.est.cur && S.est.cur.id === eid ? S.est.cur.doc : null, ids = {};
    if (d) d.items.forEach(function (it) { if (it.b !== "x" && it.c) ids[it.b + ":i:" + EP.enc(it.c)] = it; });
    var keys = Object.keys(ids);
    if (keys.length) { var q = await db().from("rate_log").select("*").in("rate_id", keys.slice(0, 300)).order("at", { ascending: false }).limit(300); S.rv.rlog[eid] = q.error ? [] : (q.data || []); }
    else S.rv.rlog[eid] = [];
    U.render();
  }
  function revOf(eid) { return S.rv.list.filter(function (r) { return r.estimate_id === eid; })[0] || null; }

  /* ---------- banner on top of an estimate ---------- */
  function banner(e) {
    var rv = revOf(e.id), d = e.doc, h = "";
    if (rv && rv.status === "in_review") h = "<b>Under review</b> with " + esc((rv.holder_level ? rv.holder_level + " " : "") + rv.holder_name) + " (v" + rv.version_no + "). Changes you make now are not seen by the checking officer until you send a new version.";
    else if (rv && rv.status === "returned") h = "<b>Returned with remarks</b> — open <i>Versions & review</i> to see them, correct the estimate and send it again.";
    var ap = d.approval;
    if (ap && ap.by) {
      var vs = S.rv.vers[e.id] || [], v = vs.filter(function (x) { return x.no === ap.version; })[0], changed = v && v.calc && Math.abs((+v.calc.total || 0) - EP.totals(d).aT) > 0.5;
      h = "<b>Approved</b> by " + esc((ap.level ? ap.level + " " : "") + ap.by) + " on " + esc(U.when(ap.at)) + " (version " + esc(ap.version) + ")." + (changed ? " <span class='badge warn'>Changed after approval: total now ₹" + inr(EP.totals(d).aT) + " vs ₹" + inr(v.calc.total) + " approved</span>" : "");
    }
    if (!h) return "";
    return "<div class='ds-msg rvbar" + (ap && ap.by ? " ok" : "") + "' role='note' style='margin:6px 0'>" + h + " <button type='button' class='btn ghost sm' data-sub='versions'>Open</button></div>";
  }
  var sp = U.sendPanel;
  U.sendPanel = function () { var e = S.est.cur, h = ""; if (e && e.doc) { if (!S.rv.vers[e.id] && S.rv.ok) loadVersions(e.id); h = banner(e); } return h + (sp ? sp() : ""); };

  /* ---------- comparison of two calcs ---------- */
  function key(x) { return x.id || (x.part + "|" + x.b + "|" + x.c); }
  U.diffCalc = function (A, B) {
    var a = {}, rows = [], seen = {};
    (A.items || []).forEach(function (x) { a[key(x)] = x; });
    (B.items || []).forEach(function (y) {
      var k = key(y), x = a[k]; seen[k] = 1;
      if (!x) { rows.push({ st: "added", x: null, y: y, d: y.aa || 0 }); return; }
      var dq = Math.abs((x.q || 0) - (y.q || 0)) > 0.0005, dr = Math.abs((x.a || 0) - (y.a || 0)) > 0.004, ds = Math.abs((x.s || 0) - (y.s || 0)) > 0.004;
      rows.push({ st: dq || dr || ds ? "changed" : "same", x: x, y: y, d: (y.aa || 0) - (x.aa || 0), dq: dq, dr: dr || ds });
    });
    (A.items || []).forEach(function (x) { if (!seen[key(x)]) rows.push({ st: "removed", x: x, y: null, d: -(x.aa || 0) }); });
    var n = { added: 0, removed: 0, changed: 0, same: 0 }; rows.forEach(function (r) { n[r.st]++; });
    rows.sort(function (p, q) { var o = { added: 1, removed: 2, changed: 0, same: 3 }; return o[p.st] - o[q.st] || Math.abs(q.d) - Math.abs(p.d); });
    return { rows: rows, n: n, dT: (B.total || 0) - (A.total || 0), dA: (B.a || 0) - (A.a || 0) };
  };
  function sgn(v, money) { if (Math.abs(v) < (money ? 0.005 : 0.0005)) return "<span class='muted'>0</span>"; return "<span class='" + (v > 0 ? "up" : "dn") + "'>" + (v > 0 ? "▲ +" : "▼ −") + (money ? inr(Math.abs(v)) : U.qfmt(Math.abs(v))) + "</span>"; }
  U.compareHtml = function (A, B, la, lb, all) {
    var D = U.diffCalc(A, B), pc = A.total ? D.dT / A.total * 100 : 0;
    var h = "<div class='stats'><div class='stat'><div class='lbl'>" + esc(la) + " grand total</div><div class='v'>₹" + inr(A.total) + "</div></div><div class='stat'><div class='lbl'>" + esc(lb) + " grand total</div><div class='v'>₹" + inr(B.total) + "</div></div><div class='stat'><div class='lbl'>Difference</div><div class='v'>" + sgn(D.dT, true) + (A.total ? " <span class='muted' style='font-size:13px'>(" + (pc >= 0 ? "+" : "") + pc.toFixed(2) + "%)</span>" : "") + "</div></div><div class='stat'><div class='lbl'>Items</div><div class='v' style='font-size:14px'>" + D.n.added + " added · " + D.n.removed + " removed · " + D.n.changed + " changed</div></div></div>";
    if ((A.gst || 0) !== (B.gst || 0)) h += "<p class='muted' style='margin:4px 0'>GST changed: " + esc(A.gst) + "% → " + esc(B.gst) + "%</p>";
    var parts = {}; (A.parts || []).forEach(function (p) { parts[p.id] = { n: p.name, a: p.a, b: 0 }; }); (B.parts || []).forEach(function (p) { parts[p.id] = parts[p.id] || { n: p.name, a: 0 }; parts[p.id].b = p.a; parts[p.id].n = p.name; });
    var pk = Object.keys(parts); if (pk.length > 1) h += "<div class='tw'><table class='t'><thead><tr><th>Part</th><th class='num'>" + esc(la) + " ₹</th><th class='num'>" + esc(lb) + " ₹</th><th class='num'>Change ₹</th></tr></thead><tbody>" + pk.map(function (k) { var p = parts[k]; return "<tr><td>" + esc(p.n) + "</td><td class='num'>" + inr(p.a) + "</td><td class='num'>" + inr(p.b) + "</td><td class='num'>" + sgn(p.b - p.a, true) + "</td></tr>"; }).join("") + "</tbody></table></div>";
    var rows = D.rows.filter(function (r) { return all || r.st !== "same"; });
    h += "<div class='tw'><table class='t cmp'><thead><tr><th>Change</th><th>Part · Sl</th><th>Item</th><th>Description</th><th>Unit</th><th class='num'>Qty " + esc(la) + "</th><th class='num'>Qty " + esc(lb) + "</th><th class='num'>Rate " + esc(la) + "</th><th class='num'>Rate " + esc(lb) + "</th><th class='num'>Amount " + esc(la) + "</th><th class='num'>Amount " + esc(lb) + "</th><th class='num'>± ₹</th></tr></thead><tbody>";
    h += rows.map(function (r) {
      var x = r.x || {}, y = r.y || {}, z = r.y || r.x, lab = { added: "<span class='badge ok'>Added</span>", removed: "<span class='badge dan'>Removed</span>", changed: "<span class='badge warn'>Changed</span>", same: "<span class='muted'>—</span>" }[r.st];
      return "<tr class='c-" + r.st + "'><td>" + lab + "</td><td>" + esc(z.pn || z.part) + " · " + esc(r.y ? y.sl : x.sl) + "</td><td><strong>" + esc(z.code) + "</strong></td><td><div class='desc' title='" + esc(z.desc) + "'>" + esc(z.desc) + "</div></td><td>" + esc(z.unit) + "</td>" +
        "<td class='num'>" + (r.x ? U.qfmt(x.q) : "") + "</td><td class='num" + (r.dq ? " hl" : "") + "'>" + (r.y ? U.qfmt(y.q) : "") + "</td><td class='num'>" + (r.x ? inr(x.a) : "") + "</td><td class='num" + (r.dr ? " hl" : "") + "'>" + (r.y ? inr(y.a) : "") + "</td><td class='num'>" + (r.x ? inr(x.aa) : "") + "</td><td class='num'>" + (r.y ? inr(y.aa) : "") + "</td><td class='num'>" + sgn(r.d, true) + "</td></tr>";
    }).join("") || "<tr><td colspan='12' class='empty'>No differences in items.</td></tr>";
    return h + "</tbody></table></div>";
  };

  /* ---------- review timeline + item remarks ---------- */
  function timeline(rid) {
    var st = S.rv.steps[rid]; if (!st) { loadSteps(rid); return "<div class='muted'>Loading…</div>"; }
    if (!st.length) return "";
    return "<ol class='rvline'>" + st.map(function (s) {
      var notes = (s.notes || []).filter(function (n) { return n && n.note; });
      return "<li class='a-" + esc(s.action) + "'><div><b>" + esc(ACT[s.action] || s.action) + "</b> by " + esc((s.by_level ? s.by_level + " " : "") + s.by_name) + (s.to_name ? " → " + esc((s.to_level ? s.to_level + " " : "") + s.to_name) : "") + (s.version_no ? " · v" + s.version_no : "") + " <span class='muted' style='font-size:12px'>" + esc(when(s.at)) + "</span></div>" +
        (s.comment ? "<div class='rvc'>“" + esc(s.comment) + "”</div>" : "") +
        (notes.length ? "<ul class='rvn'>" + notes.map(function (n) { return "<li><b>" + esc((n.pn || "") + " Sl " + (n.sl || "") + " " + (n.code || "")) + "</b>: " + esc(n.note) + "</li>"; }).join("") + "</ul>" : "") + "</li>";
    }).join("") + "</ol>";
  }
  function itemNotes(rid) { var m = {}; (S.rv.steps[rid] || []).forEach(function (s) { (s.notes || []).forEach(function (n) { if (n && n.note && n.id) (m[n.id] = m[n.id] || []).push((s.by_level ? s.by_level + " " : "") + s.by_name + ": " + n.note); }); }); return m; }

  /* ---------- estimate sub-tab: Versions & review ---------- */
  U.versionsView = function (d) {
    var e = S.est.cur, mine = S.est.owner === me(), R = U.est.ro(), vs = S.rv.vers[e.id], F = S.rv.form;
    if (!S.rv.ok) return "<div class='panel'><b>Versions, review and history need a one-time database update.</b> <span class='muted'>Ask the super admin to run <code>supabase/workflow.sql</code> in Supabase → SQL Editor.</span></div>";
    if (!vs) { loadVersions(e.id); return "<div class='panel empty'>Loading versions…</div>"; }
    if (!S.allBooks) return "<div class='panel empty'>Loading the remaining rate books (MPPWD 2025, E&M 2022)…</div>";
    var rv = revOf(e.id), h = "";
    // review box
    h += "<div class='panel' style='padding:12px;display:flex;flex-direction:column;gap:8px'><div class='row' style='gap:8px;align-items:center;flex-wrap:wrap'><h3 class='grow' style='margin:0'>Check & approval (JE → AE → EE)</h3>" + (rv ? "<span class='badge " + STAT[rv.status][1] + "'>" + STAT[rv.status][0] + (rv.status === "in_review" ? " · with " + esc((rv.holder_level ? rv.holder_level + " " : "") + rv.holder_name) : "") + (rv.status === "approved" ? " · " + esc((rv.approved_level ? rv.approved_level + " " : "") + rv.approved_by_name) : "") + "</span>" : "") + "</div>";
    if (rv) h += timeline(rv.id);
    if (mine && !R) {
      if (!S.grp.mates.length) h += "<p class='muted' style='margin:0'>To send this estimate for checking you must be in a group with your AE / EE. The super admin (or your group admin) can add you to one in the Users tab.</p>";
      else if (rv && rv.status === "in_review" && rv.holder !== me()) h += "<div class='row' style='gap:8px;flex-wrap:wrap'><input class='in grow' id='rv-wcomment' placeholder='Reason (optional)' aria-label='Reason to withdraw'><button type='button' class='btn ghost sm' data-rvact='withdraw' data-rid='" + esc(rv.id) + "'>Withdraw from review</button></div>";
      else h += "<div class='row' style='gap:8px;flex-wrap:wrap;align-items:center'><select class='in' id='rv-to' aria-label='Send to'>" + mateOpts(F.to || (rv && rv.status === "returned" ? lastReturner(rv) : "")) + "</select><input class='in grow' id='rv-comment' placeholder='" + (rv && rv.status === "returned" ? "What did you correct? (e.g. Part B quantities revised as per remarks)" : "Message, e.g. Estimate for road repair at Gevra, please check") + "' value='" + esc(F.comment) + "' aria-label='Message'><button type='button' class='btn pri sm' id='rv-submit'" + (F.busy ? " disabled" : "") + ">" + (F.busy ? "Sending…" : (rv && rv.status === "returned" ? "Send corrected version" : "Send for review")) + "</button></div><p class='muted' style='margin:0;font-size:12px'>A new version (v" + ((vs[0] ? vs[0].no : 0) + 1) + ") is saved and sent. The officer sees exactly this version, can add remarks on each item, forward it to the next level, return it or approve it.</p>";
    }
    h += "</div>";
    // versions
    h += "<div class='panel' style='padding:12px;display:flex;flex-direction:column;gap:8px'><div class='row' style='gap:8px;align-items:center;flex-wrap:wrap'><h3 class='grow' style='margin:0'>Versions</h3>" + (R ? "" : "<input class='in' id='rv-vnote' placeholder='Note for this version (e.g. after site visit)' value='" + esc(F.vnote) + "' style='min-width:240px' aria-label='Version note'><button type='button' class='btn sec sm' id='rv-vsave'>Save version now</button>") + "</div>";
    h += "<div class='tw'><table class='t'><thead><tr><th>Version</th><th>Saved</th><th>By</th><th>Note</th><th class='num'>Items</th><th class='num'>Grand total ₹</th><th></th></tr></thead><tbody>" + (vs.map(function (v) {
      var kind = { submit: "<span class='badge info'>Sent for review</span> ", restore: "<span class='badge'>Before restore</span> ", manual: "" }[v.kind] || "";
      return "<tr><td><b>v" + v.no + "</b>" + (d.approval && d.approval.version === v.no ? " <span class='badge ok'>Approved</span>" : "") + "</td><td>" + esc(when(v.created_at)) + "</td><td>" + esc(v.created_by_name || "") + "</td><td>" + kind + esc(v.note || "") + "</td><td class='num'>" + ((v.calc && v.calc.n) || 0) + "</td><td class='num'>" + inr(v.total || (v.calc && v.calc.total) || 0) + "</td><td><button class='btn ghost sm' data-rvcmp='" + v.no + "'>Compare with current</button>" + (R ? "" : "<button class='btn ghost sm' data-rvrestore='" + v.no + "'>Restore</button>") + "</td></tr>";
    }).join("") || "<tr><td colspan='7' class='empty'>No versions yet. Save one before big changes, or send the estimate for review (a version is saved automatically).</td></tr>") + "</tbody></table></div></div>";
    // compare
    if (vs.length) {
      var C = S.rv.cmp, opts = function (sel) { return "<option value='cur'" + (sel === "cur" ? " selected" : "") + ">Current (unsaved changes included)</option>" + vs.map(function (v) { return "<option value='" + v.no + "'" + (String(sel) === String(v.no) ? " selected" : "") + ">v" + v.no + " — " + esc(U.when(v.created_at)) + (v.note ? " · " + esc(short(v.note, 30)) : "") + "</option>"; }).join(""); };
      if (!C.a) C.a = String(vs[0].no);
      var ca = calcFor(C.a, vs, d), cb = calcFor(C.b, vs, d);
      h += "<div class='panel' style='padding:12px;display:flex;flex-direction:column;gap:8px'><div class='row' style='gap:8px;align-items:center;flex-wrap:wrap'><h3 class='grow' style='margin:0'>Compare two versions</h3><select class='in' id='rv-ca' aria-label='Older version'>" + opts(C.a) + "</select><span>→</span><select class='in' id='rv-cb' aria-label='Newer version'>" + opts(C.b) + "</select><label class='row' style='gap:6px'><input type='checkbox' id='rv-call'" + (C.all ? " checked" : "") + "> Show unchanged items</label></div>" +
        (ca && cb ? U.compareHtml(ca, cb, lab(C.a), lab(C.b), C.all) : "<div class='empty'>Version not found.</div>") + "</div>";
    }
    return h;
  };
  function lab(v) { return v === "cur" ? "Current" : "v" + v; }
  function calcFor(v, vs, d) { if (v === "cur") return U.calcOf(d); var x = vs.filter(function (y) { return String(y.no) === String(v); })[0]; return x && x.calc ? x.calc : null; }
  function lastReturner(rv) { var st = (S.rv.steps[rv.id] || []).filter(function (s) { return s.action === "return"; }); return st.length ? st[st.length - 1].by : ""; }

  async function saveVersion(note, kind) {
    var e = S.est.cur; if (!e) return null;
    if (U.saveNow) await U.saveNow();
    var r = await db().rpc("save_version", { est: e.id, note: note || "", calc: U.calcOf(e.doc), kind: kind || "manual" });
    if (U.fail(r, "Couldn't save the version. Has workflow.sql been run?")) return null;
    if (U.logAct) U.logAct("version", e.name + " v" + r.data);
    await loadVersions(e.id, true); return r.data;
  }
  async function submit() {
    var e = S.est.cur, F = S.rv.form, to = (document.getElementById("rv-to") || {}).value || F.to, cm = (document.getElementById("rv-comment") || {}).value || "";
    if (!to) { U.toast("Choose the officer to send it to"); return; }
    F.busy = true; U.render();
    var n = await saveVersion(cm || "Sent for review", "submit");
    if (n == null) { F.busy = false; U.render(); return; }
    var r = await db().rpc("review_submit", { est: e.id, ver: n, to_id: to, comment: cm });
    F.busy = false;
    if (U.fail(r, "Couldn't send for review.")) { U.render(); return; }
    e.doc.approval = null; F.to = ""; F.comment = "";
    if (U.logAct) U.logAct("review_submit", e.name + " v" + n);
    U.toast("Version " + n + " sent for review"); await U.loadReviews(); var rv = revOf(e.id); if (rv) loadSteps(rv.id);
  }
  async function restore(no) {
    var e = S.est.cur, r = await db().from("estimate_versions").select("data").eq("estimate_id", e.id).eq("no", no).single();
    if (U.fail(r, "Couldn't load the version.") || !r.data || !r.data.data) return;
    var keep = await saveVersion("Before restoring v" + no, "restore"); if (keep == null) return;
    var nd = JSON.parse(JSON.stringify(r.data.data)); nd.approval = e.doc.approval || null; delete nd.sentFrom; if (e.doc.sentFrom) nd.sentFrom = e.doc.sentFrom;
    e.doc = nd; if (U.saveNow) await U.saveNow(); auditFlush(true);
    U.toast("Restored v" + no + " (the previous state is saved as v" + keep + ")"); U.render();
  }

  /* ---------- Reviews tab (inbox for checking officers) ---------- */
  U.views.reviews = function () {
    var L = S.rv.list, h = "<div style='display:flex;flex-direction:column;gap:12px;max-width:1200px'><div class='row' style='align-items:center;gap:8px'><h1 class='grow' style='margin:0'>Reviews · जाँच और स्वीकृति</h1><button type='button' class='btn ghost sm' id='rv-reload'>Refresh</button></div>";
    if (!S.rv.ok) return h + "<div class='panel'>The review workflow needs a one-time database update: run <code>supabase/workflow.sql</code> in Supabase → SQL Editor.</div></div>";
    if (S.rv.open) return h + reviewDetail(S.rv.open) + "</div>";
    var groups = [["Waiting for me", L.filter(function (r) { return r.status === "in_review" && r.holder === me(); })], ["Returned to me", L.filter(function (r) { return r.status === "returned" && r.owner === me(); })], ["Sent by me", L.filter(function (r) { return r.owner === me() && !(r.status === "returned"); })], ["Handled by me earlier / my members", L.filter(function (r) { return r.owner !== me() && r.holder !== me(); })]];
    groups.forEach(function (g) {
      h += "<div class='panel' style='padding:12px'><h3 style='margin:0 0 8px'>" + g[0] + " <span class='muted' style='font-weight:400'>(" + g[1].length + ")</span></h3>" + (g[1].length ? "<div class='tw'><table class='t'><thead><tr><th>Estimate</th><th>Prepared by</th><th>Status</th><th>With</th><th class='num'>Version</th><th>Last action</th><th></th></tr></thead><tbody>" + g[1].map(function (r) { return "<tr><td>" + esc(r.name) + "</td><td>" + esc(r.owner_name) + "</td><td><span class='badge " + STAT[r.status][1] + "'>" + STAT[r.status][0] + "</span></td><td>" + esc((r.holder_level ? r.holder_level + " " : "") + (r.holder_name || (r.status === "approved" ? "— (" + (r.approved_level ? r.approved_level + " " : "") + r.approved_by_name + ")" : "—"))) + "</td><td class='num'>v" + esc(r.version_no) + "</td><td>" + esc(when(r.updated_at)) + "</td><td><button class='btn " + (r.holder === me() && r.status === "in_review" ? "pri" : "sec") + " sm' data-rvopen='" + esc(r.id) + "'>" + (r.holder === me() && r.status === "in_review" ? "Check now" : "Open") + "</button></td></tr>"; }).join("") + "</tbody></table></div>" : "<div class='muted'>Nothing here.</div>") + "</div>";
    });
    return h + "<p class='muted' style='font-size:13px'>Designations (JE / AE / EE …) are set by the super admin or group admin in the Users tab. The estimate owner sends a version from <i>Estimates → Versions & review</i>.</p></div>";
  };
  function reviewDetail(rid) {
    var rv = S.rv.list.filter(function (r) { return r.id === rid; })[0]; if (!rv) return "<div class='panel empty'>Review not found. <button class='btn ghost sm' id='rv-back'>← Back</button></div>";
    var V = S.rv.ver[rid];
    if (!V || V.no !== rv.version_no) { loadReviewVersions(rv); return "<div class='panel empty'>Loading v" + rv.version_no + "…</div>"; }
    var c = V.calc || { items: [] }, mine = rv.holder === me() && rv.status === "in_review", notes = itemNotes(rid), A = S.rv.act, N = S.rv.notes;
    var h = "<div class='panel' style='padding:12px;display:flex;flex-direction:column;gap:8px'><div class='row' style='gap:8px;align-items:center;flex-wrap:wrap'><button type='button' class='btn ghost sm' id='rv-back'>← All reviews</button><h3 class='grow' style='margin:0'>" + esc(rv.name) + " · v" + rv.version_no + "</h3><span class='badge " + STAT[rv.status][1] + "'>" + STAT[rv.status][0] + "</span>" + (rv.owner !== me() ? "<button type='button' class='btn sec sm' data-rvcopy='" + esc(rid) + "' title='Puts an editable copy of this version in your Estimates (to check measurements in detail)'>Open editable copy</button>" : "<button type='button' class='btn sec sm' data-rvgo='" + esc(rv.estimate_id) + "'>Open my estimate</button>") + "</div>";
    h += "<div class='muted' style='font-size:13px'>Prepared by <b>" + esc(rv.owner_name) + "</b> · Grand total (with GST " + esc(c.gst) + "%) <b>₹" + inr(c.total) + "</b> · " + (c.n || 0) + " items · rates as worked out by the sender when v" + rv.version_no + " was saved.</div>" + timeline(rid) + "</div>";
    // item table with remarks
    h += "<div class='panel' style='padding:0;overflow:hidden'><div class='tw' style='border:0;border-radius:0'><table class='t'><thead><tr><th>Part · Sl</th><th>Item</th><th>Description</th><th>Unit</th><th class='num'>Qty</th><th class='num'>Rate ₹</th><th class='num'>Amount ₹</th><th style='min-width:220px'>Remark</th></tr></thead><tbody>";
    h += (c.items || []).map(function (x) { var old = notes[x.id] || []; return "<tr><td>" + esc(x.pn) + " · " + esc(x.sl) + "</td><td><strong>" + esc(x.code) + "</strong></td><td><div class='desc' title='" + esc(x.desc) + "'>" + esc(x.desc) + "</div>" + (x.how && x.how !== "SOR rate" ? "<span class='badge ed'>" + esc(x.how) + "</span>" : "") + "</td><td>" + esc(x.unit) + "</td><td class='num'>" + U.qfmt(x.q) + "</td><td class='num'>" + inr(x.a) + "</td><td class='num'>" + inr(x.aa) + "</td><td>" + old.map(function (o) { return "<div class='rvold'>" + esc(o) + "</div>"; }).join("") + "<input class='in small' style='width:100%' data-rvnote='" + esc(x.id) + "' value='" + esc(N[x.id] || "") + "' placeholder='Remark on this item' aria-label='Remark on item " + esc(x.code) + "'></td></tr>"; }).join("");
    h += "</tbody></table></div></div>";
    if (V.prev && V.prev.calc) h += "<details class='panel' style='padding:12px'" + (S.rv.showPrev ? " open" : "") + " id='rv-prevdet'><summary><b>What changed since v" + V.prev.no + "</b> (the previous version sent for review)</summary>" + U.compareHtml(V.prev.calc, c, "v" + V.prev.no, "v" + V.no, false) + "</details>";
    // actions
    var handlers = []; (S.rv.steps[rid] || []).forEach(function (s) { if (s.by && s.by !== me() && s.by !== rv.owner && handlers.indexOf(s.by) < 0) handlers.push(s.by); });
    h += "<div class='panel' style='padding:12px;display:flex;flex-direction:column;gap:8px'><textarea class='in' id='rv-acomment' rows='2' placeholder='Overall remark (shown to everyone in this review)' aria-label='Overall remark'>" + esc(A.comment) + "</textarea>";
    if (mine) {
      h += "<div class='row' style='gap:8px;flex-wrap:wrap;align-items:center'><button type='button' class='btn pri sm' data-rvact='approve' data-rid='" + esc(rid) + "'>Approve (final)</button>" +
        "<span class='muted'>or</span><select class='in' id='rv-fto' aria-label='Forward to'>" + mateOpts(A.to, [rv.owner]) + "</select><button type='button' class='btn sec sm' data-rvact='forward' data-rid='" + esc(rid) + "'>Recommend & forward</button>" +
        "<span class='muted'>or</span><select class='in' id='rv-rto' aria-label='Return to'><option value=''>" + esc(rv.owner_name) + " (prepared it)</option>" + handlers.map(function (u) { var s = (S.rv.steps[rid] || []).filter(function (x) { return x.by === u; })[0]; return "<option value='" + esc(u) + "'" + (A.back === u ? " selected" : "") + ">" + esc((s.by_level ? s.by_level + " " : "") + s.by_name) + "</option>"; }).join("") + "</select><button type='button' class='btn ghost sm' data-rvact='return' data-rid='" + esc(rid) + "'>Return with remarks</button></div>";
    }
    h += "<div class='row' style='gap:8px'><button type='button' class='btn ghost sm' data-rvact='comment' data-rid='" + esc(rid) + "'>Add remark only</button><span class='muted' style='font-size:12px'>" + (mine ? "Item remarks typed above go with whichever button you press." : "This estimate is not waiting for you; you can still add remarks.") + "</span></div></div>";
    return h;
  }
  async function loadReviewVersions(rv) {
    S.rv.ver[rv.id] = { no: -1 };
    var r = await db().from("estimate_versions").select("no,calc,created_at,kind").eq("estimate_id", rv.estimate_id).order("no", { ascending: false });
    if (r.error) { S.rv.ver[rv.id] = { no: rv.version_no, calc: null }; U.render(); return; }
    var vs = r.data || [], cur = vs.filter(function (v) { return v.no === rv.version_no; })[0] || { no: rv.version_no, calc: null }, prev = vs.filter(function (v) { return v.no < rv.version_no && v.kind === "submit"; })[0] || null;
    S.rv.ver[rv.id] = { no: cur.no, calc: cur.calc, prev: prev }; if (!S.rv.steps[rv.id]) loadSteps(rv.id); U.render();
  }
  async function act(kind, rid) {
    var A = S.rv.act, cm = ((document.getElementById(kind === "withdraw" ? "rv-wcomment" : "rv-acomment") || {}).value || "").trim(), to = null;
    var rv = S.rv.list.filter(function (r) { return r.id === rid; })[0] || {}, cc = (S.rv.ver[rid] && S.rv.ver[rid].calc) || { items: [] };
    var notes = Object.keys(S.rv.notes).filter(function (k) { return S.rv.notes[k] && S.rv.notes[k].trim(); }).map(function (k) { var x = (cc.items || []).filter(function (i) { return i.id === k; })[0] || {}; return { id: k, pn: x.pn || "", sl: x.sl || "", code: x.code || "", note: S.rv.notes[k].trim().slice(0, 500) }; });
    if (kind === "forward") { to = (document.getElementById("rv-fto") || {}).value || A.to; if (!to) { U.toast("Choose the officer to forward to"); return; } }
    if (kind === "return") { to = (document.getElementById("rv-rto") || {}).value || null; if (!cm && !notes.length) { U.toast("Write what needs correcting before returning"); return; } }
    if (kind === "comment" && !cm && !notes.length) { U.toast("Write a remark first"); return; }
    if (kind === "approve" && !confirm("Approve " + (rv.name || "this estimate") + " (v" + rv.version_no + ") as final?")) return;
    var r = await db().rpc("review_act", { rid: rid, act: kind, comment: cm, notes: notes, to_id: to });
    if (U.fail(r, "Couldn't save.")) return;
    S.rv.act = { to: "", comment: "", back: "" }; S.rv.notes = {};
    if (U.logAct) U.logAct("review_" + kind, rv.name || "");
    U.toast({ approve: "Approved", forward: "Forwarded", "return": "Returned with remarks", comment: "Remark added", withdraw: "Withdrawn" }[kind]);
    await U.loadReviews(); loadSteps(rid);
  }

  /* ---------- audit trail ---------- */
  var base = {}, auditT = 0;
  function own(it) { return JSON.stringify([it.anr || "", it.ab || null, it.x || null]); }
  function snap(d) {
    var o = { gst: String(d.gst), basis: d.basis || "", items: {} };
    d.items.forEach(function (it) { var inf = EP.itemInfo(it), r = EP.lineRates(d, it), p = (d.parts.filter(function (x) { return x.id === it.part; })[0] || {}).name || it.part; o.items[it.id] = { code: inf.code || "NS", desc: short(inf.desc, 60), part: p, q: +(+r.q || 0).toFixed(3), a: r.a == null ? null : +(+r.a).toFixed(2), how: r.how || "", own: own(it), m: (it.meas || []).length }; });
    return o;
  }
  function diffSnap(A, B) {
    var out = [];
    if (A.gst !== B.gst) out.push({ field: "GST %", old: A.gst, new: B.gst });
    if (A.basis !== B.basis) out.push({ field: "Rate basis", old: A.basis, new: B.basis });
    Object.keys(B.items).forEach(function (k) {
      var x = A.items[k], y = B.items[k], at = { part: y.part, item: k, code: y.code };
      if (!x) { out.push(Object.assign({ field: "Item added", old: "", new: y.desc + " · qty " + y.q }, at)); return; }
      if (x.q !== y.q) out.push(Object.assign({ field: "Quantity", old: String(x.q), new: String(y.q) + (x.m !== y.m ? " (" + y.m + " measurement rows)" : "") }, at));
      else if (x.m !== y.m) out.push(Object.assign({ field: "Measurement rows", old: String(x.m), new: String(y.m) }, at));
      if (x.a !== y.a) out.push(Object.assign({ field: x.own === y.own ? "Rate (rate library / basic rate changed)" : "Rate", old: x.a == null ? "" : String(x.a), new: (y.a == null ? "" : String(y.a)) + (y.how ? " — " + y.how : "") }, at));
      else if (x.own !== y.own) out.push(Object.assign({ field: "Analysis / rate details", old: x.how, new: y.how }, at));
    });
    Object.keys(A.items).forEach(function (k) { if (!B.items[k]) { var x = A.items[k]; out.push({ part: x.part, item: k, code: x.code, field: "Item removed", old: x.desc + " · qty " + x.q, new: "" }); } });
    // an old-format estimate gets new item ids when it is loaded again: an "added" + "removed" pair of the same item is no change
    var rm = out.filter(function (c) { return c.field === "Item removed"; });
    return out.filter(function (c) {
      if (c.field !== "Item added") return true;
      var y = B.items[c.item], i = rm.findIndex(function (r) { var x = A.items[r.item]; return x && x.code === y.code && x.part === y.part && x.q === y.q && x.a === y.a; });
      if (i < 0) return true; rm[i].drop = 1; rm.splice(i, 1); return false;
    }).filter(function (c) { return !c.drop; });
  }
  async function auditFlush(now) {
    clearTimeout(auditT); auditT = 0;
    var e = S.est.cur; if (!e || U.est.ro() || !base[e.id] || !S.rv.ok) return;
    var b = snap(e.doc), ch = diffSnap(base[e.id], b); base[e.id] = b;
    if (!ch.length) return;
    var nm = S.me.name || S.me.email || "", rows = ch.slice(0, 200).map(function (c) { return { estimate_id: e.id, user_id: me(), user_name: nm, part: String(c.part || ""), item: String(c.item || ""), code: String(c.code || ""), field: c.field, old: String(c.old == null ? "" : c.old).slice(0, 400), new: String(c.new == null ? "" : c.new).slice(0, 400) }; });
    var r = await db().from("estimate_audit").insert(rows);
    if (r.error) { if (/does not exist|relation|schema cache/i.test(r.error.message || "")) S.rv.ok = false; return; }
    if (S.rv.audit[e.id]) { S.rv.audit[e.id] = rows.map(function (x) { return Object.assign({ at: new Date().toISOString() }, x); }).concat(S.rv.audit[e.id]); if (S.est.sub === "history") U.render(); }
  }
  U.auditTick = function (e) { if (!e || !base[e.id]) return; clearTimeout(auditT); auditT = setTimeout(auditFlush, 8000); };
  U.auditFlush = auditFlush;
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") auditFlush(true); });
  window.addEventListener("pagehide", function () { auditFlush(true); });
  var ve = U.views.estimates;
  U.views.estimates = function () {
    var e = S.est.cur;
    if (auditT && base.__cur && (!e || base.__cur !== e.id)) auditFlush(true);
    if (e && !base[e.id] && S.allBooks) base[e.id] = snap(e.doc);
    base.__cur = e ? e.id : null;
    return ve();
  };

  U.historyView = function (d) {
    var e = S.est.cur, A = S.rv.audit[e.id], RL = S.rv.rlog[e.id];
    if (!S.rv.ok) return "<div class='panel'><b>History needs a one-time database update.</b> <span class='muted'>Run <code>supabase/workflow.sql</code> in Supabase → SQL Editor.</span></div>";
    if (!A) { loadAudit(e.id); return "<div class='panel empty'>Loading history…</div>"; }
    var q = (S.rv.hq || "").toLowerCase(), f = function (x) { return !q || [x.user_name, x.code, x.field, x.old, x.new, x.part].join(" ").toLowerCase().indexOf(q) >= 0; };
    var h = "<div class='panel' style='padding:12px;display:flex;flex-direction:column;gap:8px'><div class='row' style='gap:8px;align-items:center;flex-wrap:wrap'><h3 class='grow' style='margin:0'>Who changed what (audit trail)</h3><input class='in' id='rv-hq' placeholder='Filter: item code, person, field…' value='" + esc(S.rv.hq || "") + "' aria-label='Filter history'><button type='button' class='btn ghost sm' id='rv-hload'>Refresh</button></div>";
    h += "<div class='tw'><table class='t'><thead><tr><th>When</th><th>Who</th><th>Part</th><th>Item</th><th>What</th><th>Old</th><th>New</th></tr></thead><tbody>" + (A.filter(f).map(function (x) { return "<tr><td style='white-space:nowrap'>" + esc(when(x.at)) + "</td><td>" + esc(x.user_name || "") + "</td><td>" + esc(x.part) + "</td><td><strong>" + esc(x.code) + "</strong></td><td>" + esc(x.field) + "</td><td>" + esc(x.old) + "</td><td>" + esc(x.new) + "</td></tr>"; }).join("") || "<tr><td colspan='7' class='empty'>No changes recorded yet. Changes are recorded from now on, a few seconds after each edit.</td></tr>") + "</tbody></table></div></div>";
    var rl = (RL || []).filter(function (x) { return !q || [x.by_name, x.rate_id].join(" ").toLowerCase().indexOf(q) >= 0; });
    h += "<div class='panel' style='padding:12px;display:flex;flex-direction:column;gap:8px'><h3 style='margin:0'>Rate changes of the items in this estimate</h3><p class='muted' style='margin:0;font-size:13px'>Changes to the shared rate library, your group's rates and your own rates for these items (recorded by the database).</p>";
    h += "<div class='tw'><table class='t'><thead><tr><th>When</th><th>Who</th><th>Applies to</th><th>Item</th><th>Change</th><th>Old</th><th>New</th></tr></thead><tbody>" + (rl.map(function (x) { var p = String(x.rate_id).split(":"), code = decodeURIComponent(String(p.slice(2).join(":")).replace(/~([0-9a-f]{2})/g, "%$1")); return "<tr><td style='white-space:nowrap'>" + esc(when(x.at)) + "</td><td>" + esc(x.by_name || "") + "</td><td>" + esc({ library: "Everyone (library)", group: "My group", mine: "Only me" }[x.scope] || x.scope) + "</td><td>" + esc(((EP.BOOKS[p[0]] || {}).short || p[0]) + " " + code) + "</td><td>" + esc({ insert: "Set", update: "Changed", "delete": "Reset to SOR" }[x.op] || x.op) + "</td><td>" + esc(rateTxt(x.old)) + "</td><td>" + esc(rateTxt(x.new)) + "</td></tr>"; }).join("") || "<tr><td colspan='7' class='empty'>No rate changes recorded for these items.</td></tr>") + "</tbody></table></div></div>";
    return h;
  };
  function rateTxt(d) { if (!d) return ""; if (d.mode === "manual" || d.rate != null) return "₹" + (d.rate != null ? d.rate : d.r) + (d.note ? " (" + d.note + ")" : ""); if (d.mode === "build") return "Analysis edited"; if (d.mode) return d.mode; return short(JSON.stringify(d), 60); }

  /* ---------- designation (level) setting, used in the Users tab ---------- */
  U.levelSelect = function (team, uid) {
    var cur = S.rv.levels[team + "|" + uid] || "";
    return "<select class='in small' data-rvlvl='" + esc(team + "|" + uid) + "' aria-label='Designation' title='Designation for the review workflow' style='width:auto'>" + ["", "JE", "AE", "EE", "SE", "CE"].concat(cur && !LV[cur] ? [cur] : []).map(function (l) { return "<option value='" + l + "'" + (l === cur ? " selected" : "") + ">" + (l || "Designation…") + "</option>"; }).join("") + "</select>";
  };

  /* ---------- events ---------- */
  document.addEventListener("click", async function (ev) {
    var t = ev.target.closest && ev.target.closest("button"); if (!t) return;
    var ds = t.dataset;
    if (t.id === "rv-submit") submit();
    else if (t.id === "rv-vsave") { var n = await saveVersion((document.getElementById("rv-vnote") || {}).value || "", "manual"); if (n != null) { S.rv.form.vnote = ""; U.toast("Saved as version " + n); } }
    else if (ds.rvcmp) { S.rv.cmp.a = ds.rvcmp; S.rv.cmp.b = "cur"; U.render(); setTimeout(function () { var x = document.getElementById("rv-ca"); if (x) x.scrollIntoView({ block: "center" }); }, 60); }
    else if (ds.rvrestore) { if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again to restore v" + ds.rvrestore; return; } restore(+ds.rvrestore); }
    else if (ds.rvact) act(ds.rvact, ds.rid);
    else if (ds.rvopen) { S.rv.open = ds.rvopen; S.rv.notes = {}; S.rv.act = { to: "", comment: "", back: "" }; loadSteps(ds.rvopen); U.render(); window.scrollTo(0, 0); }
    else if (t.id === "rv-back") { S.rv.open = null; U.render(); }
    else if (t.id === "rv-reload") { S.rv.ver = {}; U.loadReviews(); }
    else if (t.id === "rv-hload") loadAudit(S.est.cur.id);
    else if (ds.rvcopy) { var r = await db().rpc("review_copy", { rid: ds.rvcopy }); if (U.fail(r, "Couldn't make a copy.")) return; U.toast("Copy added to your Estimates"); S.est.selId = r.data; S.est.sub = "items"; await U.watchEst(S.me.id, true); U.setTab("estimates"); }
    else if (ds.rvgo) { await U.est.select(ds.rvgo); S.est.sub = "versions"; U.setTab("estimates"); }
  });
  document.addEventListener("input", function (ev) {
    var t = ev.target, ds = t.dataset || {};
    if (ds.rvnote) S.rv.notes[ds.rvnote] = t.value;
    else if (t.id === "rv-acomment") S.rv.act.comment = t.value;
    else if (t.id === "rv-comment") S.rv.form.comment = t.value;
    else if (t.id === "rv-vnote") S.rv.form.vnote = t.value;
    else if (t.id === "rv-hq") { S.rv.hq = t.value; U.render(); }
  });
  document.addEventListener("change", async function (ev) {
    var t = ev.target, ds = t.dataset || {};
    if (t.id === "rv-ca") { S.rv.cmp.a = t.value; U.render(); }
    else if (t.id === "rv-cb") { S.rv.cmp.b = t.value; U.render(); }
    else if (t.id === "rv-call") { S.rv.cmp.all = t.checked; U.render(); }
    else if (t.id === "rv-to") S.rv.form.to = t.value;
    else if (t.id === "rv-fto") S.rv.act.to = t.value;
    else if (t.id === "rv-rto") S.rv.act.back = t.value;
    else if (ds.rvlvl) { var p = ds.rvlvl.split("|"); var r = await db().rpc("set_member_level", { t: p[0], u: p[1], lvl: t.value }); if (U.fail(r, "Couldn't set the designation. Has workflow.sql been run?")) return; S.rv.levels[ds.rvlvl] = t.value; U.toast(t.value ? "Designation set: " + t.value : "Designation cleared"); }
  });
  document.addEventListener("toggle", function (e) { if (e.target.id === "rv-prevdet") S.rv.showPrev = e.target.open; }, true);
})();
