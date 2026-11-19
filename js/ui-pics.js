/* Item pictures on hover: Suggested items rows (and the search list's description popup).
   Shows the super admin's real photo when there is one (this item, else all items of this kind), otherwise the built-in drawing.
   Everybody gets "Photos on Google" for this item; the super admin can upload a photo for this item or for every item of its kind. */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc;
  var P = { map: null, loading: false, el: null, for: null, hideT: null, pinned: false };
  function db() { return U.db && U.db(); }
  function loadMap() {
    if (P.map || P.loading || !db()) return; P.loading = true;
    db().from("item_pics").select("key,path,updated_at").then(function (r) {
      P.loading = false; P.map = {}; if (r.error) return;
      (r.data || []).forEach(function (x) { P.map[x.key] = x; }); if (P.for) paint();
    });
  }
  function url(x) { try { return db().storage.from("item-pics").getPublicUrl(x.path).data.publicUrl + "?v=" + Date.parse(x.updated_at); } catch (e) { return ""; } }
  function itemOf(book, code) { var it = book && EP.item ? EP.item(book, code) : null; return it; }
  /* picture block used by both popups */
  U.picBlock = function (book, code, desc, unit) {
    loadMap();
    var pic = EP.itemPic ? EP.itemPic(desc, unit) : null, m = P.map || {}, real = m[book + "|" + code] || (pic && m["kind:" + pic.key]);
    var img = real ? '<img alt="" src="' + esc(url(real)) + '" onerror="this.replaceWith(document.createRange().createContextualFragment(this.dataset.f))" data-f="' + esc(pic ? pic.svg : "") + '">' : (pic ? pic.svg : "");
    return '<div class="ip-img">' + img + '</div><div class="ip-cap"><span>' + (real ? "📷 Photo" : "✏️ Drawing") + (pic ? " · " + esc(pic.label) : "") + "</span></div>";
  };
  function el() { if (!P.el) { P.el = document.createElement("div"); P.el.id = "ip-pop"; P.el.hidden = true; document.body.appendChild(P.el);
      P.el.addEventListener("mouseenter", function () { clearTimeout(P.hideT); }); P.el.addEventListener("mouseleave", function () { if (!P.pinned) later(); }); } return P.el; }
  function info(row) { var k = (row.dataset.pic || "|").split("|"), d = row.querySelector(".sg-desc"), it = itemOf(k[0], k.slice(1).join("|")); return { book: k[0], code: k.slice(1).join("|"), desc: it ? it.desc : (row.dataset.pdesc || (d ? d.getAttribute("title") || d.textContent : "")), unit: it ? it.unit : (row.dataset.punit || (row.querySelector(".sg-u") || {}).textContent || "") }; }
  function paint() {
    var row = P.for; if (!row || !document.body.contains(row)) { hide(); return; }
    var x = info(row), pic = EP.itemPic ? EP.itemPic(x.desc, x.unit) : null, q = x.desc.split(/ — |:/)[0].replace(/^(providing|supplying|laying|fixing|and|&|,|\s)+/ig, "").slice(0, 90);
    var h = U.picBlock(x.book, x.code, x.desc, x.unit) + (row.tagName === "TR" ? '<div class="ip-desc">' + esc(x.desc) + "</div>" : "") + '<div class="ip-act"><a class="btn ghost sm" target="_blank" rel="noopener" href="https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(q) + '">🔎 Photos on Google</a>';
    if (S.me && S.me.isOwner && P.map) h += '<button type="button" class="btn ghost sm" data-ipup="' + esc(x.book + "|" + x.code) + '">📷 Photo for this item</button>' + (pic ? '<button type="button" class="btn ghost sm" data-ipup="kind:' + pic.key + '">📷 For all “' + esc(pic.label) + '” items</button>' : "");
    var t = el(); t.innerHTML = h + "</div>"; t.hidden = false;
    var r = row.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight, w = Math.min(360, W - 24); t.style.width = w + "px";
    var th = t.offsetHeight, left = r.left + Math.min(r.width * 0.35, 260), top = r.bottom + 4;
    if (W < 700) left = (W - w) / 2; if (left + w > W - 12) left = W - w - 12; if (top + th > H - 8) top = Math.max(8, r.top - th - 4);
    t.style.left = Math.max(12, left) + "px"; t.style.top = top + "px";
  }
  function show(row, pin) { clearTimeout(P.hideT); if (P.for === row && !P.el.hidden) { if (pin) P.pinned = true; return; } P.for = row; P.pinned = !!pin; paint(); }
  function hide() { if (P.el) P.el.hidden = true; P.for = null; P.pinned = false; }
  function later() { clearTimeout(P.hideT); P.hideT = setTimeout(hide, 250); }
  var hoverT = null;
  document.addEventListener("mouseover", function (e) {
    var row = e.target.closest && (e.target.closest(".sg-row[data-pic]") || (e.target.closest("tr[data-pic] td.pc") && e.target.closest("tr[data-pic]")));
    if (row) { clearTimeout(hoverT); if (row !== P.for) hoverT = setTimeout(function () { show(row); }, 350); else clearTimeout(P.hideT); }
    else if (P.for && !P.pinned && !(e.target.closest && e.target.closest("#ip-pop"))) { clearTimeout(hoverT); later(); }
  });
  document.addEventListener("click", async function (e) {
    var b = e.target.closest && e.target.closest("[data-picb]");
    if (b) { e.preventDefault(); e.stopPropagation(); var row = b.closest("[data-pic]"); if (P.for === row && P.pinned) hide(); else { P.for = null; show(row, true); } return; }
    var up = e.target.closest && e.target.closest("[data-ipup]");
    if (up) { e.preventDefault(); upload(up.dataset.ipup); return; }
    if (P.for && P.pinned && !(e.target.closest && e.target.closest("#ip-pop"))) hide();
  }, true);
  window.addEventListener("scroll", function () { if (P.for && !P.pinned) hide(); else if (P.for) paint(); }, true);
  function upload(key) {
    var inp = document.createElement("input"); inp.type = "file"; inp.accept = "image/*";
    inp.onchange = async function () {
      var f = inp.files && inp.files[0]; if (!f) return; U.toast("Uploading photo…");
      try {
        var blob = await shrink(f), path = key.replace(/[^a-z0-9.:_-]+/gi, "_") + "-" + Date.now().toString(36) + ".jpg";
        var r = await db().storage.from("item-pics").upload(path, blob, { contentType: "image/jpeg", upsert: true }); if (r.error) throw r.error;
        var r2 = await db().from("item_pics").upsert({ key: key, path: path, updated_at: new Date().toISOString() }); if (r2.error) throw r2.error;
        (P.map = P.map || {})[key] = { key: key, path: path, updated_at: new Date().toISOString() }; paint();
        U.toast(key.indexOf("kind:") === 0 ? "Photo saved — shown for all items of this kind" : "Photo saved for this item — everyone sees it");
      } catch (er) { U.toast("Couldn't upload: " + (er.message || er) + (/row-level|policy|not found|bucket/i.test(er.message || "") ? " (run item_pics.sql in Supabase first)" : "")); }
    };
    inp.click();
  }
  /* photos are kept small: longest side 900 px, JPEG */
  function shrink(f) { return new Promise(function (ok, bad) { var u = URL.createObjectURL(f), im = new Image(); im.onload = function () { var k = Math.min(1, 900 / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob(function (b) { b ? ok(b) : bad(new Error("could not read the photo")); }, "image/jpeg", 0.85); }; im.onerror = function () { bad(new Error("not an image")); }; im.src = u; }); }
})();
