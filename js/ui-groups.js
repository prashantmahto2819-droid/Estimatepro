/* Estimate Pro — groups / companies.
   * Super admin: create groups and add users (Users tab).
   * Members: "Send to group" puts a copy of the open estimate in the chosen members' Estimates (RPC send_estimate),
     marked with who sent it, so it can be checked / edited and sent back. */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc;
  S.grp = { teams: [], members: [], mates: [], newName: "", send: { open: false, sel: {}, note: "", busy: false } };
  function db() { return U.db(); }

  U.loadGroups = async function () {
    try {
      var m = await db().rpc("my_team_mates2"); if (m.error) m = await db().rpc("my_team_mates"); if (!m.error) S.grp.mates = m.data || [];
      var mt = await db().rpc("my_teams"); if (mt.error && U.off && U.off.isNet(mt.error)) return; S.grp.myTeams = mt.error ? [] : (mt.data || []);
      var adm = S.grp.myTeams.filter(function (x) { return x.my_role === "admin"; });
      S.grp.adminTeam = adm.length ? adm[0].team_id : null; S.grp.adminTeamName = adm.length ? adm[0].team : "";
      S.me.groupAdmin = !!adm.length && !S.me.isOwner;
      if (S.me.groupAdmin) {
        var ids = [S.me.id]; S.grp.mates.forEach(function (x) { if (x.my_role === "admin" && ids.indexOf(x.user_id) < 0) { ids.push(x.user_id); S.names[x.user_id] = { name: x.full_name || x.email }; } });
        S.est.users = ids;
      }
      if (S.me && S.me.isOwner) {
        var t = await db().from("teams").select("id,name,created_at").order("name"), mm = await db().from("team_members").select("team_id,user_id,role");
        if (!t.error) S.grp.teams = t.data || []; if (!mm.error) S.grp.members = mm.data || [];
      }
      // group rates: shared by the group admin with every member (personal rates still win)
      var tr = S.grp.myTeams.length ? await db().from("team_rates").select("team_id,id,data,updated_by,updated_at") : { data: [] }, o = {};
      if (!tr.error) (tr.data || []).forEach(function (row) { var x = Object.assign({}, row.data || {}); x.by = row.updated_by; x.at = Date.parse(row.updated_at); x.team = true; o[row.id] = x; });
      if (!tr.error) { S.ovrTeam = o; if (U.mergeOvr) U.mergeOvr(); if (U.off) U.off.saveRates(); }
      U.render();
    } catch (e) { /* tables not there yet */ }
  };
  function uname(id) { var u = (S.est.usersInfo || []).filter(function (x) { return x.id === id; })[0]; return u ? (u.full_name || u.email) : (U.nameOf ? U.nameOf(id) : id); }

  /* ----- super admin panel (Users tab) ----- */
  U.groupsPanel = function () {
    var G = S.grp, users = S.est.usersInfo || [];
    var h = "<div class='panel' style='padding:12px;display:flex;flex-direction:column;gap:10px'><div class='row' style='gap:8px;flex-wrap:wrap;align-items:center'><h3 class='grow' style='margin:0'>Groups / companies</h3>" +
      "<input class='in' id='grp-new' placeholder='New group name (e.g. SECL Gevra Area – Civil)' value='" + esc(G.newName) + "' style='min-width:260px' aria-label='New group name'><button type='button' class='btn pri sm' id='grp-add'>+ Create group</button></div>" +
      "<p class='muted' style='margin:0;font-size:13px'>People in the same group can send a copy of their estimate to each other for checking or editing. A user can be in more than one group.</p>";
    if (!G.teams.length) h += "<div class='empty'>No groups yet.</div>";
    G.teams.forEach(function (t) {
      var mem = G.members.filter(function (m) { return m.team_id === t.id; }).map(function (m) { return m.user_id; });
      h += "<div class='grpbox'><div class='row' style='gap:8px;flex-wrap:wrap;align-items:center'><strong class='grow'>" + esc(t.name) + " <span class='muted' style='font-weight:400'>(" + mem.length + " member" + (mem.length === 1 ? "" : "s") + ")</span></strong>" +
        "<select class='in' data-grpadd='" + esc(t.id) + "' aria-label='Add a user to " + esc(t.name) + "'><option value=''>+ Add user…</option>" + users.filter(function (u) { return mem.indexOf(u.id) < 0; }).map(function (u) { return "<option value='" + esc(u.id) + "'>" + esc((u.full_name || "") + " " + (u.email ? "<" + u.email + ">" : "")) + "</option>"; }).join("") + "</select>" +
        "<button type='button' class='btn ghost sm' data-grpren='" + esc(t.id) + "'>Rename</button><button type='button' class='btn ghost sm' data-grpdel='" + esc(t.id) + "'>Delete group</button></div>" +
        "<div class='row' style='gap:6px;flex-wrap:wrap;margin-top:6px'>" + (mem.length ? mem.map(function (id) { var mr = (G.members.filter(function (m) { return m.team_id === t.id && m.user_id === id; })[0] || {}).role; return "<span class='badge " + (mr === "admin" ? "ok" : "info") + "' style='display:inline-flex;gap:6px;align-items:center'>" + esc(uname(id)) + (mr === "admin" ? " · group admin" : "") + " " + (U.levelSelect ? U.levelSelect(t.id, id) : "") + " <button type='button' class='btn ghost sm' data-grprole='" + esc(t.id + "|" + id + "|" + (mr === "admin" ? "member" : "admin")) + "' title='" + (mr === "admin" ? "Make a normal member" : "Make group admin: can add/remove members, see their projects and set group rates") + "'>" + (mr === "admin" ? "Make member" : "Make admin") + "</button><button type='button' class='btn ghost sm' data-grprm='" + esc(t.id + "|" + id) + "' aria-label='Remove " + esc(uname(id)) + " from the group'>✕</button></span>"; }).join("") : "<span class='muted'>No members yet.</span>") + "</div></div>";
    });
    return h + "</div>";
  };

  /* ----- estimate: send to group + "sent by" banner ----- */
  U.sendButton = function () {
    var e = S.est.cur; if (!e || S.est.owner !== S.me.id || !S.grp.mates.length) return "";
    return '<button class="btn sec sm" id="grp-send-open" type="button" title="Send a copy of this estimate to people in your group">Send to group</button>';
  };
  U.sendPanel = function () {
    var e = S.est.cur, G = S.grp, s = G.send, h = "";
    if (e && e.doc && e.doc.sentFrom) { var f = e.doc.sentFrom; h += "<div class='ds-msg' role='note' style='margin:6px 0'><b>Received from " + esc(f.name || "") + "</b>" + (f.email ? " (" + esc(f.email) + ")" : "") + (f.at ? " on " + esc(U.when(f.at)) : "") + (f.note ? ": “" + esc(f.note) + "”" : "") + ". This is your own copy — change it freely and use <i>Send to group</i> to send it back.</div>"; }
    if (!s.open || !e) return h;
    var byTeam = {}; G.mates.forEach(function (m) { (byTeam[m.team] = byTeam[m.team] || []).push(m); });
    h += "<div class='panel' style='padding:12px;margin:6px 0;display:flex;flex-direction:column;gap:8px'><strong>Send a copy of “" + esc(e.name) + "” to</strong>";
    Object.keys(byTeam).forEach(function (t) {
      var seen = {};
      h += "<div><div class='lbl'>" + esc(t) + "</div><div class='row' style='gap:10px;flex-wrap:wrap'>" + byTeam[t].filter(function (m) { if (seen[m.user_id]) return false; seen[m.user_id] = 1; return true; }).map(function (m) { return "<label class='row' style='gap:6px'><input type='checkbox' data-grpsel='" + esc(m.user_id) + "'" + (s.sel[m.user_id] ? " checked" : "") + "> " + esc(m.full_name || m.email) + " <span class='muted' style='font-size:12px'>" + esc(m.email || "") + "</span></label>"; }).join("") + "</div></div>";
    });
    h += "<input class='in' id='grp-note' placeholder='Message (optional), e.g. please check Part B quantities' value='" + esc(s.note) + "' aria-label='Message'>";
    h += "<div class='row' style='gap:8px'><button type='button' class='btn pri sm' id='grp-send'" + (s.busy ? " disabled" : "") + ">" + (s.busy ? "Sending…" : "Send copy") + "</button><button type='button' class='btn ghost sm' id='grp-send-close'>Cancel</button><span class='muted' style='font-size:12px'>They get their own copy; your estimate is not changed.</span></div></div>";
    return h;
  };

  async function send() {
    var e = S.est.cur, s = S.grp.send, ids = Object.keys(s.sel).filter(function (k) { return s.sel[k]; });
    if (!ids.length) { U.toast("Tick at least one person"); return; }
    s.busy = true; U.render();
    try { if (U.saveNow) await U.saveNow(); } catch (x) { /* autosave */ }
    var r = await db().rpc("send_estimate", { est: e.id, to_ids: ids, note: s.note || "" });
    s.busy = false;
    if (U.fail(r, "Couldn't send the estimate.")) { U.render(); return; }
    if (U.logAct) U.logAct("est_send", e.name + " → " + ids.length + " member(s)");
    s.open = false; s.sel = {}; s.note = ""; U.render(); U.toast("Sent to " + r.data + " " + (r.data === 1 ? "person" : "people"));
  }

  document.addEventListener("click", async function (ev) {
    var t = ev.target.closest && ev.target.closest("button"); if (!t) return;
    var ds = t.dataset, G = S.grp;
    if (t.id === "grp-add") { var nm = (document.getElementById("grp-new") || {}).value || ""; nm = nm.trim(); if (!nm) { U.toast("Type a group name"); return; }
      var r = await db().from("teams").insert({ name: nm.slice(0, 120) }); if (U.fail(r, "Couldn't create the group.")) return; G.newName = ""; U.toast("Group created"); U.loadGroups(); }
    else if (ds.grpdel) { if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again to delete"; return; }
      var r2 = await db().from("teams").delete().eq("id", ds.grpdel); if (U.fail(r2, "Couldn't delete the group.")) return; U.toast("Group deleted"); U.loadGroups(); }
    else if (ds.grpren) { var cur = G.teams.filter(function (x) { return x.id === ds.grpren; })[0], nn = prompt("New name of the group", cur ? cur.name : ""); if (!nn || !nn.trim()) return;
      var r5 = await db().from("teams").update({ name: nn.trim().slice(0, 120) }).eq("id", ds.grpren); if (U.fail(r5, "Couldn't rename.")) return; U.loadGroups(); }
    else if (ds.grprole) { var gr = ds.grprole.split("|"); var r9 = await db().from("team_members").update({ role: gr[2] }).eq("team_id", gr[0]).eq("user_id", gr[1]); if (U.fail(r9, "Couldn't change.")) return; U.toast(gr[2] === "admin" ? "Now a group admin" : "Now a member"); U.loadGroups(); }
    else if (ds.grprm) { var p = ds.grprm.split("|"); var r3 = await db().from("team_members").delete().eq("team_id", p[0]).eq("user_id", p[1]); if (U.fail(r3, "Couldn't remove.")) return; U.loadGroups(); }
    else if (t.id === "grp-send-open") { G.send.open = !G.send.open; U.render(); }
    else if (t.id === "grp-send-close") { G.send.open = false; U.render(); }
    else if (t.id === "grp-send") { send(); }
  });
  document.addEventListener("change", async function (ev) {
    var t = ev.target, ds = t.dataset || {};
    if (ds.grpadd && t.value) { var r = await db().from("team_members").insert({ team_id: ds.grpadd, user_id: t.value }); if (U.fail(r, "Couldn't add the user.")) return; U.toast("Added to the group"); U.loadGroups(); }
    else if (ds.grpsel) { S.grp.send.sel[ds.grpsel] = t.checked; }
    else if (t.id === "grp-note") { S.grp.send.note = t.value; }
    else if (t.id === "grp-new") { S.grp.newName = t.value; }
  });
})();
