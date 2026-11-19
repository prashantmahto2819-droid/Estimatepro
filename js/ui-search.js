/* Estimate Pro — Global search across estimates, drawings, and photos.
   Triggered by the search bar in the app header or Ctrl+K / Cmd+K. */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc;

  S.gsearch = { q: "", results: null, open: false, loading: false };
  var G = S.gsearch, debounce = 0;

  function me() { return S.me && S.me.id; }
  function db() { return U.db(); }

  /* ---------- search across all data sources ---------- */
  async function search(q) {
    q = (q || "").trim().toLowerCase();
    if (!q || q.length < 2) { G.results = null; G.loading = false; U.render(); return; }
    G.loading = true; U.render();
    var results = [];

    /* 1. Estimates (search name, client, items) */
    if (me()) {
      try {
        var er = await db().from("estimates").select("id,owner,name,gst,data,updated_at").or("owner.eq." + me() + ",id.in.(select est_id from shares where uid='" + me() + "')").order("updated_at", { ascending: false }).limit(200);
        if (!er.error && er.data) {
          er.data.forEach(function (e) {
            var name = (e.name || "").toLowerCase(), match = name.indexOf(q) >= 0;
            if (!match && e.data) {
              var d = typeof e.data === "string" ? e.data : JSON.stringify(e.data);
              match = d.toLowerCase().indexOf(q) >= 0;
            }
            if (match) results.push({ type: "estimate", id: e.id, title: e.name || "Untitled", sub: "Estimate · updated " + new Date(e.updated_at).toLocaleDateString("en-IN"), icon: "📋", data: e });
          });
        }
      } catch (e) { /* estimates not available */ }

      /* also check offline estimates */
      if (U.off) {
        try {
          var offList = await U.off.getList(me());
          if (offList) offList.forEach(function (e) {
            if (results.some(function (r) { return r.id === e.id; })) return;
            var name = (e.name || "").toLowerCase(), match = name.indexOf(q) >= 0;
            if (!match && e.data) match = JSON.stringify(e.data).toLowerCase().indexOf(q) >= 0;
            if (match) results.push({ type: "estimate", id: e.id, title: e.name || "Untitled", sub: "Estimate (on this device)", icon: "📋", data: e });
          });
        } catch (e) {}
      }
    }

    /* 2. CAD drawings (search in open documents) */
    if (S.cad && S.cad.docs) {
      Object.keys(S.cad.docs).forEach(function (k) {
        var doc = S.cad.docs[k];
        if (!doc || !doc.ents) return;
        var title = doc.name || k, matched = title.toLowerCase().indexOf(q) >= 0;
        if (!matched) {
          for (var i = 0; i < doc.ents.length && !matched; i++) {
            var e = doc.ents[i]; if (!e) continue;
            if (e.type === "TEXT" || e.type === "MTEXT" || e.type === "DIM") {
              var txt = (e.text || e.val || "").toLowerCase();
              if (txt.indexOf(q) >= 0) matched = true;
            }
          }
        }
        if (matched) results.push({ type: "drawing", id: k, title: title, sub: "CAD Drawing", icon: "📐" });
      });
    }

    /* 3. Photos (search site, note, address) */
    if (me()) {
      try {
        var pr = await db().from("site_photos").select("id,site,taken_at,lat,lng,address,note,thumb").eq("owner", me()).order("taken_at", { ascending: false }).limit(500);
        if (!pr.error && pr.data) {
          pr.data.forEach(function (p) {
            var hay = [p.site, p.note, p.address, p.taken_at].join(" ").toLowerCase();
            if (hay.indexOf(q) >= 0) results.push({ type: "photo", id: p.id, title: p.site || "GPS Photo", sub: new Date(p.taken_at).toLocaleDateString("en-IN") + (p.lat ? " · " + (+p.lat).toFixed(4) + ", " + (+p.lng).toFixed(4) : "") + (p.note ? " · " + p.note : ""), icon: "📷", thumb: p.thumb });
          });
        }
      } catch (e) {}
    }

    /* also search local photos */
    if (U.off) {
      try {
        var owner = me() || (window.localStorage && localStorage.getItem("ep_anon_cam"));
        if (owner) {
          var localPhotos = (await U.off.get("photos:" + owner)) || [];
          localPhotos.forEach(function (p) {
            if (results.some(function (r) { return r.id === p.id; })) return;
            var hay = [p.site, p.note, typeof p.address === "string" ? p.address : (p.address && (p.address.full || p.address.title)) || "", p.taken_at].join(" ").toLowerCase();
            if (hay.indexOf(q) >= 0) results.push({ type: "photo", id: p.id, title: p.site || "GPS Photo (on phone)", sub: new Date(p.taken_at).toLocaleDateString("en-IN") + " · on this device", icon: "📷", thumb: p.thumb });
          });
        }
      } catch (e) {}
    }

    G.results = results;
    G.loading = false;
    U.render();
  }

  /* ---------- render ---------- */
  U.globalSearch = function () {
    if (!G.open) return "";
    var h = "<div class='gsearch-overlay' id='gsearch-overlay'><div class='gsearch-box'>";
    h += "<div class='gsearch-head'><input class='in gsearch-in' id='gsearch-q' placeholder='Search estimates, drawings, photos… · खोजें' value='" + esc(G.q) + "' autofocus><button type='button' class='btn ghost sm' id='gsearch-close'>✕</button></div>";

    if (G.loading) {
      h += "<div class='gsearch-body'><p class='muted' style='text-align:center;padding:24px'>Searching… · खोजा जा रहा है</p></div>";
    } else if (G.results && G.results.length === 0) {
      h += "<div class='gsearch-body'><p class='muted' style='text-align:center;padding:24px'>No results for \"" + esc(G.q) + "\" · कुछ नहीं मिला</p></div>";
    } else if (G.results) {
      h += "<div class='gsearch-body'>";
      var groups = { estimate: [], drawing: [], photo: [] };
      G.results.forEach(function (r) { if (groups[r.type]) groups[r.type].push(r); });
      [{ key: "estimate", label: "Estimates · एस्टिमेट" }, { key: "drawing", label: "Drawings · ड्राइंग" }, { key: "photo", label: "Photos · फ़ोटो" }].forEach(function (g) {
        var items = groups[g.key]; if (!items.length) return;
        h += "<div class='gsearch-group'><h4>" + g.label + " <span class='muted'>(" + items.length + ")</span></h4>";
        items.slice(0, 20).forEach(function (r) {
          h += "<button type='button' class='gsearch-item' data-gstype='" + r.type + "' data-gsid='" + esc(r.id) + "'>" + (r.thumb ? "<img class='gsearch-thumb' src='" + esc(r.thumb) + "' alt=''>" : "<span class='gsearch-icon'>" + r.icon + "</span>") + "<div class='gsearch-text'><b>" + esc(r.title) + "</b><br><span class='muted'>" + esc(r.sub) + "</span></div></button>";
        });
        if (items.length > 20) h += "<p class='muted' style='padding:4px 12px;font-size:12px'>+" + (items.length - 20) + " more</p>";
        h += "</div>";
      });
      h += "</div>";
    } else {
      h += "<div class='gsearch-body'><p class='muted' style='text-align:center;padding:24px'>Type to search · खोजने के लिए लिखें<br><span style='font-size:12px'>Ctrl+K to open · Esc to close</span></p></div>";
    }

    h += "</div></div>";
    return h;
  };

  U.openSearch = function () { G.open = true; G.q = ""; G.results = null; U.render(); setTimeout(function () { var el = document.getElementById("gsearch-q"); if (el) el.focus(); }, 100); };
  U.closeSearch = function () { G.open = false; G.q = ""; G.results = null; U.render(); };

  /* ---------- events ---------- */
  document.addEventListener("input", function (ev) {
    if (ev.target.id !== "gsearch-q") return;
    G.q = ev.target.value;
    clearTimeout(debounce);
    debounce = setTimeout(function () { search(G.q); }, 350);
  });

  document.addEventListener("click", function (ev) {
    var t = ev.target;
    if (t.id === "gsearch-close" || t.id === "gsearch-overlay") { U.closeSearch(); return; }
    var item = t.closest && t.closest("[data-gsid]");
    if (!item) return;
    U.closeSearch();
    var type = item.dataset.gstype, id = item.dataset.gsid;
    if (type === "estimate") {
      if (U.openEstimate) U.openEstimate(id);
      else if (U.go) U.go("est/" + id);
    } else if (type === "drawing") {
      if (U.openDrawing) U.openDrawing(id);
      else if (U.go) U.go("cad");
    } else if (type === "photo") {
      if (S.cam) { S.cam.view = id; if (U.go) U.go("photos"); U.render(); }
    }
  });

  /* Ctrl+K / Cmd+K shortcut */
  document.addEventListener("keydown", function (ev) {
    if ((ev.ctrlKey || ev.metaKey) && ev.key === "k") {
      ev.preventDefault();
      if (G.open) U.closeSearch(); else U.openSearch();
    }
    if (ev.key === "Escape" && G.open) { U.closeSearch(); }
  });

  /* header search button */
  U.searchButton = function () {
    return '<button type="button" class="btn ghost sm" id="gsearch-btn" title="Search everything · Ctrl+K" aria-label="Global search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="22" y2="22"/></svg> <span class="hide-sm">Search</span></button>';
  };

  document.addEventListener("click", function (ev) {
    if (ev.target.closest && ev.target.closest("#gsearch-btn")) U.openSearch();
  });

  /* CSS */
  var style = document.createElement("style");
  style.textContent = ".gsearch-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;justify-content:center;padding-top:min(15vh,120px)}.gsearch-box{background:#fff;border-radius:12px;width:min(640px,95vw);max-height:70vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3);animation:gsearch-in .15s ease-out}@keyframes gsearch-in{from{opacity:0;transform:translateY(-12px)}}.gsearch-head{display:flex;gap:8px;padding:12px 16px;border-bottom:1px solid #e5e7eb}.gsearch-in{flex:1;font-size:16px;border:none;outline:none;background:transparent}.gsearch-body{overflow-y:auto;padding:8px 0;flex:1}.gsearch-group h4{padding:8px 16px 4px;margin:0;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280}.gsearch-item{display:flex;gap:10px;align-items:center;width:100%;padding:8px 16px;border:none;background:none;cursor:pointer;text-align:left;font:inherit;color:inherit}.gsearch-item:hover{background:#f3f4f6}.gsearch-icon{font-size:20px;width:36px;text-align:center;flex-shrink:0}.gsearch-thumb{width:36px;height:36px;object-fit:cover;border-radius:4px;flex-shrink:0}.gsearch-text{min-width:0;overflow:hidden}.gsearch-text b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gsearch-text .muted{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}@media(prefers-color-scheme:dark){.gsearch-box{background:#1f2937;color:#f3f4f6}.gsearch-head{border-color:#374151}.gsearch-item:hover{background:#374151}.gsearch-group h4{color:#9ca3af}}";
  document.head.appendChild(style);
})();
