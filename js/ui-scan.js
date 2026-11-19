/* Estimate Pro — Document scanner (CamScanner-style).
   * Capture with the live camera (batch: keep shooting), the phone's camera app, or import photos / a PDF.
   * Every page is processed automatically: edges found and cropped flat (perspective corrected), shadows removed,
     light and colour balanced ("Magic"). Everything can be changed by hand: corners, rotation, filter, brightness,
     contrast, sharpness.
   * Export: PDF (A4 / Letter / Legal / fit to image, margins, quality, 2 pages per sheet for ID cards, watermark),
     JPG / PNG (one file or ZIP), one long image, share, print, and text (OCR, English + Hindi).
   * Documents stay on this device (IndexedDB) until deleted. */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc;
  var SC = S.scan = { docs: null, busy: "", q: "" };
  var urls = {};

  /* ---------- storage (IndexedDB) ---------- */
  var dbp = null;
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok, bad) {
      var r = indexedDB.open("ep_scans", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("docs", { keyPath: "id" }); };
      r.onsuccess = function () { ok(r.result); }; r.onerror = function () { bad(r.error); };
    });
    return dbp;
  }
  async function tx(mode, fn) { var d = await idb(); return new Promise(function (ok, bad) { var t = d.transaction("docs", mode), st = t.objectStore("docs"), res = fn(st); t.oncomplete = function () { ok(res && res.result !== undefined ? res.result : res); }; t.onerror = function () { bad(t.error); }; }); }
  var DAY = 86400000;
  function me() { return S.me && S.me.id; }
  function putLocal(d) { return tx("readwrite", function (s) { return s.put(d); }); }
  function mine(d) { return !d.own || d.own === me(); }
  async function loadDocs() {
    try { var all = await tx("readonly", function (s) { return s.getAll(); }); SC.docs = (all || []).filter(mine).sort(function (a, b) { return b.at - a.at; }); } catch (e) { SC.docs = []; SC.err = "This browser can't keep scans (" + e.message + ")."; }
    SC.docs.forEach(mapPages); U.render(); pull();
  }
  async function saveDoc(d) { d.at = Date.now(); d.ct = d.ct || d.at; d.own = d.own || me(); d.dirty = 1; mapPages(d); await putLocal(d); queueSync(d); }
  async function delDoc(id) {
    await tx("readwrite", function (s) { return s.delete(id); });
    if (!me()) return; var t = tomb(); t[id] = me(); setTomb(t); await retryDeletes();
  }

  /* ---------- online copy: Supabase table scan_docs + private bucket "scans" → same scans on every device ---------- */
  var BK = "scans", syncQ = {}, syncing = {}, pdoc = {}, fetching = {};
  function cdb() { try { return U.db && U.db(); } catch (e) { return null; } }
  function mapPages(d) { d.pages.forEach(function (p) { pdoc[p.id] = d; }); }
  function cpath(did, pid, t) { return me() + "/" + did + "/" + pid + (t ? "_t" : "") + ".jpg"; }
  function look(p) { return JSON.stringify([p.q, p.rot || 0, p.f, p.br || 0, p.ct || 0, p.sh || 0]); }
  function meta(p) { return { id: p.id, w: p.w, h: p.h, q: p.q, rot: p.rot || 0, f: p.f, br: p.br || 0, ct: p.ct || 0, sh: p.sh || 0, tw: p.tw, th: p.th }; }
  function tomb() { try { return JSON.parse(localStorage.getItem("ep_scan_del") || "{}"); } catch (e) { return {}; } }
  function setTomb(t) { try { localStorage.setItem("ep_scan_del", JSON.stringify(t)); } catch (e) {} }
  async function retryDeletes() {
    var c = cdb(), t = tomb(), ids = Object.keys(t).filter(function (k) { return t[k] === me(); }); if (!c || !ids.length) return;
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i], r = await c.from("scan_docs").delete().eq("id", id); if (r.error) { SC.cloudErr = r.error.message; continue; }
      var ls = await c.storage.from(BK).list(me() + "/" + id, { limit: 1000 });
      if (!ls.error && ls.data && ls.data.length) await c.storage.from(BK).remove(ls.data.map(function (o) { return me() + "/" + id + "/" + o.name; }));
      delete t[id]; setTomb(t);
    }
  }
  function queueSync(d) { if (!me() || !cdb()) return; clearTimeout(syncQ[d.id]); syncQ[d.id] = setTimeout(function () { syncDoc(d); }, 1200); }
  async function syncDoc(d) {
    if (syncing[d.id]) { syncing[d.id] = 2; return; } syncing[d.id] = 1;
    try {
      var c = cdb(), st = c.storage.from(BK);
      for (var i = 0; i < d.pages.length; i++) {
        var p = d.pages[i];
        if (!p.up && p.src) { var r = await st.upload(cpath(d.id, p.id), p.src, { contentType: "image/jpeg", upsert: true }); if (r.error) throw r.error; p.up = 1; }
        if (p.tdirty !== 0 && p.thumb) { var r2 = await st.upload(cpath(d.id, p.id, 1), p.thumb, { contentType: "image/jpeg", upsert: true }); if (r2.error) throw r2.error; p.tdirty = 0; }
      }
      var u = await c.from("scan_docs").upsert({ id: d.id, owner: me(), name: d.name, folder: d.folder || "", pages: d.pages.map(meta), created_at: new Date(d.ct || d.at).toISOString(), updated_at: new Date(d.at).toISOString() });
      if (u.error) throw u.error;
      var gone = (d.cpages || []).filter(function (id) { return !d.pages.some(function (p) { return p.id === id; }); });
      if (gone.length) await st.remove([].concat.apply([], gone.map(function (id) { return [cpath(d.id, id), cpath(d.id, id, 1)]; })));
      d.cpages = d.pages.map(function (p) { return p.id; }); d.cloud = 1; d.dirty = 0; await putLocal(d); SC.cloudErr = "";
    } catch (e) { console.warn("scan upload", e); SC.cloudErr = (e && e.message) || "upload failed"; }
    var again = syncing[d.id] === 2; syncing[d.id] = 0; if (again) syncDoc(d); else if (S.tab === "scan" && !E) refreshBadges();
  }
  function refreshBadges() { (SC.docs || []).forEach(function (d) { var b = document.querySelector("[data-scst='" + d.id + "']"); if (b) b.outerHTML = cloudBadge(d); }); }
  function cloudBadge(d) { return "<span data-scst='" + d.id + "' class='muted' style='font-size:11px'>" + (d.cloud && !d.dirty ? "☁ saved online" : "⏳ not online yet") + "</span>"; }
  /* bring scans made on other devices; send scans that are only on this device */
  async function pull() {
    var c = cdb(); if (!c || !me() || SC.pulling) return; SC.pulling = 1;
    try {
      await retryDeletes();
      var r = await c.from("scan_docs").select("id,name,folder,pages,created_at,updated_at").eq("owner", me()).order("updated_at", { ascending: false }).limit(2000);
      if (r.error) { SC.cloudErr = r.error.message; return; }
      var loc = {}, seen = {}, changed = false, dead = tomb(); (SC.docs || []).forEach(function (d) { loc[d.id] = d; });
      for (var i = 0; i < r.data.length; i++) {
        var row = r.data[i], L = loc[row.id], at = Date.parse(row.updated_at); seen[row.id] = 1;
        if (dead[row.id]) continue;
        if (L && (L.dirty || L.at >= at)) { if (L.dirty) queueSync(L); continue; }
        var old = {}; if (L) L.pages.forEach(function (p) { old[p.id] = p; });
        var d = { id: row.id, name: row.name, folder: row.folder || "", at: at, ct: Date.parse(row.created_at), own: me(), cloud: 1, dirty: 0, cpages: row.pages.map(function (m) { return m.id; }),
          pages: row.pages.map(function (m) { var o = old[m.id]; return Object.assign({}, m, { src: o ? o.src : null, thumb: o && look(o) === look(m) ? o.thumb : null, up: 1, tdirty: 0 }); }) };
        await putLocal(d); mapPages(d); loc[d.id] = d; changed = true;
      }
      Object.keys(loc).forEach(function (id) { var L = loc[id]; if (seen[id]) return; if (L.cloud && !L.dirty) { delete loc[id]; changed = true; tx("readwrite", function (s) { return s.delete(id); }); } else queueSync(L); });
      if (changed) { SC.docs = Object.keys(loc).map(function (k) { return loc[k]; }).sort(function (a, b) { return b.at - a.at; }); if (S.tab === "scan" && !E) U.render(); }
    } catch (e) { SC.cloudErr = e.message; } finally { SC.pulling = 0; }
  }
  /* full photo of a page: on this device, else download it once */
  async function srcOf(p) {
    if (p.src) return p.src; var d = pdoc[p.id], c = cdb(); if (!d || !c || !me()) throw new Error("This page is saved online — connect to the internet to open it");
    SC.busy = "Downloading page…"; paintBusy();
    try { var r = await c.storage.from(BK).download(cpath(d.id, p.id)); if (r.error) throw new Error("Couldn't download the page (" + r.error.message + ")"); p.src = r.data; await putLocal(d); return p.src; }
    finally { SC.busy = ""; paintBusy(); }
  }
  function fetchThumb(p) {
    var d = pdoc[p.id], c = cdb(); if (fetching[p.id] || !d || !c || !me()) return; fetching[p.id] = 1;
    c.storage.from(BK).download(cpath(d.id, p.id, 1)).then(async function (r) {
      var b = r.error ? null : r.data; if (!b) { try { b = await refreshThumbFrom(p); } catch (e) { b = null; } }
      if (b) { p.thumb = b; await putLocal(d); document.querySelectorAll("img[data-tp='" + p.id + "']").forEach(function (im) { im.src = thumbUrl(p); }); }
    }).finally(function () { fetching[p.id] = 0; });
  }
  async function refreshThumbFrom(p) { await srcOf(p); await refreshThumb(p); return p.thumb; }
  /* phone memory: drop full photos of old scans that are already saved online (they download again when opened) */
  async function freeOld() {
    var cut = Date.now() - 30 * DAY, n = 0, bytes = 0;
    for (var i = 0; i < (SC.docs || []).length; i++) { var d = SC.docs[i]; if (!d.cloud || d.dirty || (d.ct || d.at) > cut) continue; var ch = false; d.pages.forEach(function (p) { if (p.src && p.up) { bytes += p.src.size || 0; p.src = null; ch = true; n++; } }); if (ch) await putLocal(d); }
    return { n: n, mb: (bytes / 1048576).toFixed(1) };
  }

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function stamp() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + "." + pad(d.getMinutes()); }
  function fname(s) { return String(s || "Scan").replace(/[\\/:*?"<>|]+/g, "_").trim() || "Scan"; }

  /* ---------- image helpers ---------- */
  function loadImg(blob) { return new Promise(function (ok, bad) { var u = URL.createObjectURL(blob), im = new Image(); im.onload = function () { ok(im); setTimeout(function () { URL.revokeObjectURL(u); }, 1000); }; im.onerror = function () { URL.revokeObjectURL(u); bad(new Error("Not an image")); }; im.src = u; }); }
  function canvas(w, h) { var c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function toBlob(c, type, q) { return new Promise(function (ok) { c.toBlob(function (b) { ok(b); }, type || "image/jpeg", q == null ? 0.9 : q); }); }
  /* keep originals at most 3000 px on the long side (phone photos are 4000+) */
  async function normalise(blob) {
    var im = await loadImg(blob), k = Math.min(1, 3000 / Math.max(im.naturalWidth, im.naturalHeight)), c = canvas(im.naturalWidth * k, im.naturalHeight * k);
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    return { blob: await toBlob(c, "image/jpeg", 0.92), w: c.width, h: c.height, cv: c };
  }

  /* ---------- automatic edge detection: largest bright region (paper) → its 4 corners ---------- */
  /* find the paper: bright, low-colour area → largest blob (thin links to other bright things cut off) → convex hull → best 4-corner fit.
     Tried on brightness and on "whiteness" (bright and grey, so a wooden / coloured table is not paper); the shape that fits a 4-corner page best wins. */
  function detect(cv) {
    var W = cv.width, H = cv.height, k = 420 / Math.max(W, H), w = Math.max(8, Math.round(W * k)), h = Math.max(8, Math.round(H * k)), sc = canvas(w, h), x = sc.getContext("2d"), n = w * h, i;
    x.filter = "blur(1.5px)"; x.drawImage(cv, 0, 0, w, h); x.filter = "none";
    var d = x.getImageData(0, 0, w, h).data, L = new Uint8Array(n), Wt = new Uint8Array(n);
    for (i = 0; i < n; i++) { var r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2], l = r * 0.3 + g * 0.59 + b * 0.11, sat = Math.max(r, g, b) - Math.min(r, g, b); L[i] = l; Wt[i] = Math.max(0, Math.min(255, l - 1.2 * sat)); }
    var best = null;
    [L, Wt].forEach(function (G) { var c = blobQuad(G, w, h); if (c && (!best || c.score > best.score)) best = c; });
    if (!best || best.score < 0.6) return full(W, H, 0.03);
    return best.q.map(function (p) { return [Math.min(W, Math.max(0, p[0] / k)), Math.min(H, Math.max(0, p[1] / k))]; });
  }
  function otsu(G) { var hist = new Array(256).fill(0), i, tot = G.length, sum = 0; for (i = 0; i < tot; i++) hist[G[i]]++; for (i = 0; i < 256; i++) sum += i * hist[i]; var sB = 0, wB = 0, best = 0, th = 128; for (i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; var wF = tot - wB; if (!wF) break; sB += i * hist[i]; var mB = sB / wB, mF = (sum - sB) / wF, bt = wB * wF * (mB - mF) * (mB - mF); if (bt > best) { best = bt; th = i; } } return th; }
  function morph(M, w, h, grow) { var O = new Uint8Array(M.length); for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) { var v = grow ? 0 : 1; for (var dy = -1; dy <= 1 && (grow ? !v : v); dy++) for (var dx = -1; dx <= 1; dx++) { var yy = y + dy, xx = x + dx, m = yy >= 0 && yy < h && xx >= 0 && xx < w ? M[yy * w + xx] : 0; if (grow ? m : !m) { v = grow ? 1 : 0; break; } } O[y * w + x] = v; } return O; }
  function blobQuad(G, w, h) {
    var n = w * h, th = otsu(G), M = new Uint8Array(n), i;
    for (i = 0; i < n; i++) M[i] = G[i] > th ? 1 : 0;
    M = morph(morph(M, w, h, false), w, h, false);              // cut thin bridges to other bright things
    var lab = new Int32Array(n), stack = new Int32Array(n), id = 0, bestId = 0, bestN = 0;
    for (i = 0; i < n; i++) {
      if (lab[i] || !M[i]) continue; id++; var sp = 0, cnt = 0; stack[sp++] = i; lab[i] = id;
      while (sp) { var p = stack[--sp], px = p % w; cnt++;
        if (px > 0 && !lab[p - 1] && M[p - 1]) { lab[p - 1] = id; stack[sp++] = p - 1; }
        if (px < w - 1 && !lab[p + 1] && M[p + 1]) { lab[p + 1] = id; stack[sp++] = p + 1; }
        if (p >= w && !lab[p - w] && M[p - w]) { lab[p - w] = id; stack[sp++] = p - w; }
        if (p < n - w && !lab[p + w] && M[p + w]) { lab[p + w] = id; stack[sp++] = p + w; } }
      if (cnt > bestN) { bestN = cnt; bestId = id; }
    }
    if (!bestId) return null;
    var C = new Uint8Array(n); for (i = 0; i < n; i++) C[i] = lab[i] === bestId ? 1 : 0;
    C = morph(morph(C, w, h, true), w, h, true);                 // give back what the cut took off the edges
    var area = 0, pts = []; for (var y = 0; y < h; y++) { var first = -1, last = -1; for (var x = 0; x < w; x++) if (C[y * w + x]) { area++; if (first < 0) first = x; last = x; } if (first >= 0) { pts.push([first, y], [last + 1, y], [first, y + 1], [last + 1, y + 1]); } }
    var frac = area / n; if (frac < 0.12 || frac > 0.985) return null;
    var hull = convexHull(pts); if (hull.length < 4) return null;
    var q = quadFromHull(hull), qa = Math.abs(polyArea(q)); if (qa < n * 0.1) return null;
    // score: how well the blob fills the 4-corner shape (a page ≈ 1), minus a little if it touches the whole frame
    var edge = 0; q.forEach(function (p) { if (p[0] < 2 || p[1] < 2 || p[0] > w - 2 || p[1] > h - 2) edge++; });
    return { q: orderQuad(q), score: Math.min(area / qa, qa / area) - edge * 0.05 };
  }
  function convexHull(P) {
    P = P.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], up = [], i; for (i = 0; i < P.length; i++) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], P[i]) <= 0) lo.pop(); lo.push(P[i]); }
    for (i = P.length - 1; i >= 0; i--) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], P[i]) <= 0) up.pop(); up.push(P[i]); }
    up.pop(); lo.pop(); return lo.concat(up);
  }
  /* reduce the hull to 4 corners: repeatedly drop the corner whose removal loses the least area */
  function quadFromHull(Hl) {
    var p = Hl.map(function (v, i) { return { v: v, i: i }; });
    function tri(a, b, c) { return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2; }
    while (p.length > 4) { var bi = 0, bv = Infinity; for (var i = 0; i < p.length; i++) { var v = tri(p[(i - 1 + p.length) % p.length].v, p[i].v, p[(i + 1) % p.length].v); if (v < bv) { bv = v; bi = i; } } p.splice(bi, 1); }
    // dropping hull points cuts the corners a little: lay each side along its longest straight hull edge and meet the sides again
    var N = Hl.length, lines = [];
    for (var s2 = 0; s2 < 4; s2++) {
      var a = p[s2].i, b = p[(s2 + 1) % 4].i, bestL = -1, ln = null;
      for (var t = a; t !== b; t = (t + 1) % N) { var u = Hl[t], w2 = Hl[(t + 1) % N], l = Math.hypot(w2[0] - u[0], w2[1] - u[1]); if (l > bestL) { bestL = l; ln = [u, w2]; } }
      lines.push(ln);
    }
    var size = Math.hypot(p[0].v[0] - p[2].v[0], p[0].v[1] - p[2].v[1]);
    return p.map(function (c, k) {
      var A = lines[(k + 3) % 4], B = lines[k], x1 = A[0][0], y1 = A[0][1], x2 = A[1][0], y2 = A[1][1], x3 = B[0][0], y3 = B[0][1], x4 = B[1][0], y4 = B[1][1];
      var den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4); if (Math.abs(den) < 1e-9) return c.v;
      var px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / den, py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den;
      return Math.hypot(px - c.v[0], py - c.v[1]) < size * 0.035 ? [px, py] : c.v;
    });
  }
  function orderQuad(q) {   // clockwise from top-left
    var cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
    q = q.slice().sort(function (a, b) { return Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx); });
    var s = 0, m = Infinity; q.forEach(function (p, i) { if (p[0] + p[1] < m) { m = p[0] + p[1]; s = i; } });
    return q.slice(s).concat(q.slice(0, s));
  }
  function polyArea(q) { var a = 0; for (var i = 0; i < 4; i++) { var p = q[i], n = q[(i + 1) % 4]; a += p[0] * n[1] - n[0] * p[1]; } return a / 2; }
  function full(W, H, m) { var dx = W * (m || 0), dy = H * (m || 0); return [[dx, dy], [W - dx, dy], [W - dx, H - dy], [dx, H - dy]]; }
  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

  /* ---------- perspective correction: unit square → quad (Heckbert), sampled bilinearly ---------- */
  function sq2quad(q) {
    var x0 = q[0][0], y0 = q[0][1], x1 = q[1][0], y1 = q[1][1], x2 = q[2][0], y2 = q[2][1], x3 = q[3][0], y3 = q[3][1];
    var sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3, g = 0, hh = 0;
    if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) { var dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, den = dx1 * dy2 - dx2 * dy1; if (Math.abs(den) > 1e-12) { g = (sx * dy2 - dx2 * sy) / den; hh = (dx1 * sy - sx * dy1) / den; } }
    return { a: x1 - x0 + g * x1, b: x3 - x0 + hh * x3, c: x0, d: y1 - y0 + g * y1, e: y3 - y0 + hh * y3, f: y0, g: g, h: hh };
  }
  function warp(src, q, maxSide) {
    var Wo = Math.max(dist(q[0], q[1]), dist(q[3], q[2])), Ho = Math.max(dist(q[0], q[3]), dist(q[1], q[2])), k = Math.min(1, maxSide / Math.max(Wo, Ho));
    Wo = Math.max(1, Math.round(Wo * k)); Ho = Math.max(1, Math.round(Ho * k));
    var sw = src.width, sh = src.height, sd = src.getContext("2d").getImageData(0, 0, sw, sh).data, out = canvas(Wo, Ho), ox = out.getContext("2d"), od = ox.createImageData(Wo, Ho), o = od.data, M = sq2quad(q);
    for (var y = 0; y < Ho; y++) {
      var v = (y + 0.5) / Ho;
      for (var x = 0; x < Wo; x++) {
        var u = (x + 0.5) / Wo, z = M.g * u + M.h * v + 1, X = (M.a * u + M.b * v + M.c) / z - 0.5, Y = (M.d * u + M.e * v + M.f) / z - 0.5;
        if (X < 0) X = 0; if (Y < 0) Y = 0; if (X > sw - 1) X = sw - 1; if (Y > sh - 1) Y = sh - 1;
        var xi = X | 0, yi = Y | 0, fx = X - xi, fy = Y - yi, x1 = xi + 1 < sw ? xi + 1 : xi, y1 = yi + 1 < sh ? yi + 1 : yi;
        var i00 = (yi * sw + xi) * 4, i10 = (yi * sw + x1) * 4, i01 = (y1 * sw + xi) * 4, i11 = (y1 * sw + x1) * 4, oi = (y * Wo + x) * 4;
        for (var ch = 0; ch < 3; ch++) o[oi + ch] = (sd[i00 + ch] * (1 - fx) + sd[i10 + ch] * fx) * (1 - fy) + (sd[i01 + ch] * (1 - fx) + sd[i11 + ch] * fx) * fy;
        o[oi + 3] = 255;
      }
    }
    ox.putImageData(od, 0, 0); return out;
  }
  function rotate(c, deg) {
    deg = ((deg % 360) + 360) % 360; if (!deg) return c;
    var r = deg === 90 || deg === 270, o = canvas(r ? c.height : c.width, r ? c.width : c.height), x = o.getContext("2d");
    x.translate(o.width / 2, o.height / 2); x.rotate(deg * Math.PI / 180); x.drawImage(c, -c.width / 2, -c.height / 2); return o;
  }

  /* ---------- filters ---------- */
  var FILTERS = [["auto", "Auto (Magic)"], ["original", "Original"], ["enhance", "Lighten / no shadow"], ["gray", "Grayscale"], ["bw", "Black & white"], ["bw2", "B&W (strong)"], ["color", "Vivid colour"]];
  /* local mean of the luminance with an integral image (window r) — the paper's light level at each point */
  function localMean(L, w, h, r) {
    var I = new Float64Array((w + 1) * (h + 1)), x, y;
    for (y = 1; y <= h; y++) { var row = 0; for (x = 1; x <= w; x++) { row += L[(y - 1) * w + x - 1]; I[y * (w + 1) + x] = I[(y - 1) * (w + 1) + x] + row; } }
    var M = new Float32Array(w * h);
    for (y = 0; y < h; y++) { var y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (x = 0; x < w; x++) { var x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1); M[y * w + x] = (I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0]) / ((x1 - x0) * (y1 - y0)); } }
    return M;
  }
  /* light level of the paper at every point, ignoring the ink: brightest value in each small cell (text removed),
     smoothed, then spread back over the page — dividing by it removes shadows and uneven light */
  function paperLight(L, w, h) {
    var cs = Math.max(6, Math.round(Math.max(w, h) / 70)), gw = Math.ceil(w / cs), gh = Math.ceil(h / cs), G = new Float32Array(gw * gh), x, y, gx, gy;
    for (gy = 0; gy < gh; gy++) for (gx = 0; gx < gw; gx++) {
      var mx = 0, m2 = 0, y1 = Math.min(h, (gy + 1) * cs), x1 = Math.min(w, (gx + 1) * cs);
      for (y = gy * cs; y < y1; y++) for (x = gx * cs; x < x1; x++) { var v = L[y * w + x]; if (v > mx) { m2 = mx; mx = v; } else if (v > m2) m2 = v; }
      G[gy * gw + gx] = m2 || mx;   // second brightest: one hot pixel does not count
    }
    // grow the light into cells that are all ink (bold text, stamps), then smooth
    for (var pass = 0; pass < 2; pass++) { var T = new Float32Array(G); for (gy = 0; gy < gh; gy++) for (gx = 0; gx < gw; gx++) { var b = G[gy * gw + gx]; for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var yy = gy + dy, xx = gx + dx; if (yy >= 0 && yy < gh && xx >= 0 && xx < gw && G[yy * gw + xx] > b) b = G[yy * gw + xx]; } T[gy * gw + gx] = b; } G = T; }
    for (pass = 0; pass < 3; pass++) { var T2 = new Float32Array(gw * gh); for (gy = 0; gy < gh; gy++) for (gx = 0; gx < gw; gx++) { var s2 = 0, c = 0; for (var ey = -1; ey <= 1; ey++) for (var ex = -1; ex <= 1; ex++) { var y2 = gy + ey, x2 = gx + ex; if (y2 >= 0 && y2 < gh && x2 >= 0 && x2 < gw) { s2 += G[y2 * gw + x2]; c++; } } T2[gy * gw + gx] = s2 / c; } G = T2; }
    var M = new Float32Array(w * h);
    for (y = 0; y < h; y++) { var fy = Math.min(gh - 1.001, Math.max(0, (y + 0.5) / cs - 0.5)), y0 = fy | 0, ty = fy - y0;
      for (x = 0; x < w; x++) { var fx = Math.min(gw - 1.001, Math.max(0, (x + 0.5) / cs - 0.5)), x0 = fx | 0, tx = fx - x0, x1b = Math.min(gw - 1, x0 + 1), y1b = Math.min(gh - 1, y0 + 1);
        M[y * w + x] = Math.max(1, (G[y0 * gw + x0] * (1 - tx) + G[y0 * gw + x1b] * tx) * (1 - ty) + (G[y1b * gw + x0] * (1 - tx) + G[y1b * gw + x1b] * tx) * ty); } }
    return M;
  }
  function pct(arr, p) { var hst = new Uint32Array(256), n = 0; for (var i = 0; i < arr.length; i += 4) { hst[arr[i] | 0]++; n++; } var t = n * p, s = 0; for (var v = 0; v < 256; v++) { s += hst[v]; if (s >= t) return v; } return 255; }
  function applyFilter(c, f, br, ct, shp) {
    var w = c.width, h = c.height, x = c.getContext("2d"), id = x.getImageData(0, 0, w, h), d = id.data, n = w * h, i, L, M;
    if (f !== "original" && f !== "color") {
      L = new Float32Array(n); for (i = 0; i < n; i++) L[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
      M = paperLight(L, w, h);
    }
    if (f === "auto" || f === "enhance") {
      for (i = 0; i < n; i++) { var kk = Math.min(4, 248 / M[i]); for (var ch = 0; ch < 3; ch++) d[i * 4 + ch] = Math.min(255, d[i * 4 + ch] * kk); }
      // white balance: make the paper neutral white (removes yellow / blue light casts)
      var sr = 0, sg = 0, sb = 0, cnt = 0; for (i = 0; i < n; i++) if (L[i] > M[i] * 0.9) { sr += d[i * 4]; sg += d[i * 4 + 1]; sb += d[i * 4 + 2]; cnt++; }
      if (cnt > n * 0.05) { var mr = sr / cnt, mg = sg / cnt, mb = sb / cnt, mm = Math.max(mr, mg, mb), fr = Math.min(1.35, mm / mr), fg = Math.min(1.35, mm / mg), fb = Math.min(1.35, mm / mb); for (i = 0; i < n * 4; i += 4) { d[i] = Math.min(255, d[i] * fr); d[i + 1] = Math.min(255, d[i + 1] * fg); d[i + 2] = Math.min(255, d[i + 2] * fb); } }
      if (f === "enhance") for (i = 0; i < n; i++) { var gv = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = gv; }
      // stretch: darkest 1 % → black, paper → white, a little more contrast, keep colour ink saturated
      var lo = Math.min(120, pct(d, 0.01)), k2 = 255 / Math.max(40, 250 - lo);
      for (i = 0; i < n * 4; i += 4) for (var c2 = 0; c2 < 3; c2++) { var vv = (d[i + c2] - lo) * k2; d[i + c2] = vv < 0 ? 0 : vv > 255 ? 255 : vv; }
      if (f === "auto") satBoost(d, 1.18);
    } else if (f === "gray") {
      for (i = 0; i < n; i++) { var gg = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = gg; }
      autoLevels(d, n);
    } else if (f === "bw" || f === "bw2") {
      var off = f === "bw2" ? 0.86 : 0.76;   // a pixel darker than this share of the local paper light is ink
      for (i = 0; i < n; i++) { var ink = L[i] < M[i] * off; var o2 = ink ? 0 : 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = o2; }
    } else if (f === "color") { autoLevels(d, n); satBoost(d, 1.35); }
    if (br || ct) { var cf = (100 + (ct || 0)) / 100, ad = (br || 0) * 2.55; for (i = 0; i < n * 4; i += 4) for (var c3 = 0; c3 < 3; c3++) { var v3 = (d[i + c3] - 128) * cf + 128 + ad; d[i + c3] = v3 < 0 ? 0 : v3 > 255 ? 255 : v3; } }
    x.putImageData(id, 0, 0);
    if (shp) sharpen(c, shp);
    return c;
  }
  function autoLevels(d, n) { var lo = pct(d, 0.01), hi = 255, hst = new Uint32Array(256), i; for (i = 0; i < n * 4; i += 4) hst[d[i] | 0]++; var s = 0; for (var v = 255; v >= 0; v--) { s += hst[v]; if (s >= n * 0.02) { hi = v; break; } } var k = 255 / Math.max(30, hi - lo); for (i = 0; i < n * 4; i += 4) for (var c = 0; c < 3; c++) { var x = (d[i + c] - lo) * k; d[i + c] = x < 0 ? 0 : x > 255 ? 255 : x; } }
  function satBoost(d, s) { for (var i = 0; i < d.length; i += 4) { var r = d[i], g = d[i + 1], b = d[i + 2], l = r * 0.3 + g * 0.59 + b * 0.11; d[i] = clamp(l + (r - l) * s); d[i + 1] = clamp(l + (g - l) * s); d[i + 2] = clamp(l + (b - l) * s); } }
  function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
  function sharpen(c, amt) {
    var w = c.width, h = c.height, x = c.getContext("2d"), s = x.getImageData(0, 0, w, h), o = x.createImageData(w, h), a = s.data, b = o.data, k = amt / 100;
    for (var y = 0; y < h; y++) for (var xx = 0; xx < w; xx++) { var i = (y * w + xx) * 4;
      for (var ch = 0; ch < 3; ch++) { var cN = y > 0 ? a[i - w * 4 + ch] : a[i + ch], cS = y < h - 1 ? a[i + w * 4 + ch] : a[i + ch], cW = xx > 0 ? a[i - 4 + ch] : a[i + ch], cE = xx < w - 1 ? a[i + 4 + ch] : a[i + ch];
        b[i + ch] = clamp(a[i + ch] + k * (4 * a[i + ch] - cN - cS - cW - cE)); } b[i + 3] = 255; }
    x.putImageData(o, 0, 0);
  }
  /* the whole page pipeline: crop flat → rotate → filter */
  async function render(pg, maxSide) {
    var im = await loadImg(await srcOf(pg)), sc = canvas(pg.w, pg.h); sc.getContext("2d").drawImage(im, 0, 0, pg.w, pg.h);
    var out = warp(sc, pg.q, maxSide || 2400); out = rotate(out, pg.rot || 0);
    return applyFilter(out, pg.f || "auto", pg.br || 0, pg.ct || 0, pg.sh || 0);
  }
  async function refreshThumb(pg) { var c = await render(pg, 700); pg.thumb = await toBlob(c, "image/jpeg", 0.8); pg.tdirty = 1; pg.tw = c.width; pg.th = c.height; }

  /* ---------- new pages from photos / camera / PDF: auto crop + auto light & colour ---------- */
  async function addImages(doc, blobs, msg) {
    for (var i = 0; i < blobs.length; i++) {
      SC.busy = (msg || "Processing") + " page " + (i + 1) + " of " + blobs.length + "…"; paintBusy();
      try { var nm = await normalise(blobs[i]), pg = { id: uid(), src: nm.blob, w: nm.w, h: nm.h, q: detect(nm.cv), rot: 0, f: "auto", br: 0, ct: 0, sh: 20 }; await refreshThumb(pg); doc.pages.push(pg); }
      catch (e) { U.toast("Skipped one file: " + e.message); }
    }
    SC.busy = ""; paintBusy();
  }
  var pdfjs = null;
  async function pdfToImages(file) {
    if (!pdfjs) { pdfjs = await import(new URL("vendor/pdfjs/pdf.min.mjs", location.href).href); pdfjs.GlobalWorkerOptions.workerSrc = new URL("vendor/pdfjs/pdf.worker.min.mjs", location.href).href; }
    var pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise, out = [];
    for (var p = 1; p <= Math.min(pdf.numPages, 60); p++) { SC.busy = "Reading PDF page " + p + " of " + pdf.numPages + "…"; paintBusy(); var pg = await pdf.getPage(p), vp = pg.getViewport({ scale: 2 }), c = canvas(vp.width, vp.height); await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise; out.push(await toBlob(c, "image/jpeg", 0.92)); }
    return out;
  }
  async function importFiles(doc, files) {
    var blobs = [];
    for (var i = 0; i < files.length; i++) { var f = files[i]; if (/pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)) { try { blobs = blobs.concat(await pdfToImages(f)); } catch (e) { U.toast("Couldn't read the PDF: " + e.message); } } else blobs.push(f); }
    if (!blobs.length) return;
    await addImages(doc, blobs);
    // pages from a PDF are usually already flat: keep them uncropped
    if (files.length === 1 && /pdf/i.test(files[0].type || files[0].name)) for (var j = doc.pages.length - blobs.length; j < doc.pages.length; j++) { doc.pages[j].q = full(doc.pages[j].w, doc.pages[j].h, 0); await refreshThumb(doc.pages[j]); }
  }
  function pickFiles(accept, capture) { return new Promise(function (ok) { var i = document.createElement("input"); i.type = "file"; i.accept = accept; i.multiple = !capture; if (capture) i.setAttribute("capture", "environment"); i.onchange = function () { ok(Array.from(i.files || [])); }; i.click(); }); }

  /* ---------- live camera (batch: shoot page after page) ---------- */
  var cam = null;
  async function liveCamera(doc) {
    var ov = document.createElement("div"); ov.className = "scan-ov scan-cam";
    ov.innerHTML = "<video playsinline muted autoplay></video><div class='scan-cam-bar'><button type='button' class='btn ghost' data-sc='camclose'>✕ Done</button><span class='scan-cam-n'>0 pages</span><button type='button' class='scan-shutter' data-sc='shoot' aria-label='Take page'></button><button type='button' class='btn ghost' data-sc='camapp'>Phone camera</button></div>";
    document.body.appendChild(ov);
    var vid = ov.querySelector("video"), shots = [];
    try { var st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false }); vid.srcObject = st; cam = { st: st, ov: ov, vid: vid, shots: shots, doc: doc }; }
    catch (e) { ov.remove(); U.toast("Camera not available here — using the phone camera app instead"); var fs = await pickFiles("image/*", true); if (fs.length) await addImages(doc, fs); if (doc.pages.length) { await saveDoc(doc); SC.docs = null; openEditor(doc, doc.pages.length - 1); } return; }
  }
  async function camShoot() {
    if (!cam) return; var v = cam.vid; if (!v.videoWidth) return;
    var c = canvas(v.videoWidth, v.videoHeight); c.getContext("2d").drawImage(v, 0, 0); cam.shots.push(await toBlob(c, "image/jpeg", 0.95));
    var n = cam.ov.querySelector(".scan-cam-n"); if (n) n.textContent = cam.shots.length + " page" + (cam.shots.length === 1 ? "" : "s");
    cam.ov.classList.add("flash"); setTimeout(function () { cam && cam.ov.classList.remove("flash"); }, 120);
  }
  async function camClose(useApp) {
    if (!cam) return; var c = cam; cam = null; c.st.getTracks().forEach(function (t) { t.stop(); }); c.ov.remove();
    var shots = c.shots;
    if (useApp) { var fs = await pickFiles("image/*", true); shots = shots.concat(fs); }
    if (shots.length) await addImages(c.doc, shots);
    if (c.doc.pages.length) { await saveDoc(c.doc); SC.docs = null; openEditor(c.doc, Math.max(0, c.doc.pages.length - shots.length)); }
  }

  /* ---------- editor (full-screen, not redrawn by the app) ---------- */
  var E = null;
  function newDoc() { return { id: uid(), name: "Scan " + stamp(), at: Date.now(), pages: [], folder: SC.folder && SC.folder !== "*" ? SC.folder : "" }; }
  try { SC.folder = localStorage.getItem("ep_scan_folder") || "*"; } catch (e) { SC.folder = "*"; }
  SC.pick = {};
  function openEditor(doc, pi) {
    if (E) E.ov.remove();
    var ov = document.createElement("div"); ov.className = "scan-ov scan-ed"; document.body.appendChild(ov);
    E = { ov: ov, doc: doc, i: Math.min(pi || 0, Math.max(0, doc.pages.length - 1)), mode: "filter", drag: null, prev: null, dirty: true };
    paintEditor(); showPage();
  }
  function cur() { return E && E.doc.pages[E.i]; }
  function paintEditor() {
    if (!E) return; var d = E.doc, pg = cur();
    var h = "<div class='scan-top'><button type='button' class='btn ghost sm' data-sc='edclose'>← Back</button><input class='in small' data-sc-name='1' value='" + esc(d.name) + "' aria-label='Document name' style='flex:1;min-width:120px'><button type='button' class='btn pri sm' data-sc='export'>Export / Share</button></div>";
    h += "<div class='scan-selbar'><span>✔ " + selPages().length + "/" + d.pages.length + " pages for export</span><button type='button' class='btn ghost sm' data-sc='selall'>All</button><button type='button' class='btn ghost sm' data-sc='selnone'>None</button></div>";
    h += "<div class='scan-body'><div class='scan-strip'>" + d.pages.map(function (p, i) { return "<div class='scan-thw'><button type='button' class='scan-th" + (i === E.i ? " on" : "") + "' data-scpg='" + i + "'><img alt='' data-tp='" + p.id + "' src='" + thumbUrl(p) + "'><span>" + (i + 1) + "</span></button><input type='checkbox' class='scan-ck' data-scck='" + p.id + "'" + (isSel(p) ? " checked" : "") + " aria-label='Select page " + (i + 1) + "'></div>"; }).join("") +
      "<button type='button' class='scan-th add' data-sc='addcam'>📷<span>Camera</span></button><button type='button' class='scan-th add' data-sc='addfile'>➕<span>Import</span></button></div>";
    h += "<div class='scan-main'><div class='scan-stage'><canvas class='scan-cv'></canvas>" + (SC.busy ? "<div class='scan-busy'>" + esc(SC.busy) + "</div>" : "") + "</div>";
    if (pg) {
      var crop = E.mode === "crop";
      h += "<div class='scan-tools'><div class='seg'><button type='button' data-sc='mode-crop' aria-pressed='" + crop + "'>✂ Crop</button><button type='button' data-sc='mode-filter' aria-pressed='" + !crop + "'>🎨 Result</button></div>" +
        "<button type='button' class='btn ghost sm' data-sc='rotl' title='Rotate left'>⟲</button><button type='button' class='btn ghost sm' data-sc='rotr' title='Rotate right'>⟳</button>" +
        (crop ? "<button type='button' class='btn sec sm' data-sc='autocrop'>Auto crop</button><button type='button' class='btn ghost sm' data-sc='fullcrop'>Whole photo</button><button type='button' class='btn pri sm' data-sc='mode-filter'>Done ✓</button>"
              : "<button type='button' class='btn sec sm' data-sc='autoall'>✨ Auto</button><button type='button' class='btn ghost sm' data-sc='adj' aria-pressed='" + !!E.adj + "'>⚙ Adjust</button><button type='button' class='btn ghost sm' data-sc='moveup' title='Move page up'>↑</button><button type='button' class='btn ghost sm' data-sc='movedn' title='Move page down'>↓</button><button type='button' class='btn ghost sm' data-sc='retake'>Retake</button><button type='button' class='btn ghost sm' data-sc='delpg'>🗑 Delete</button>") + "</div>";
      if (crop) h += "<div class='scan-hint'>Drag the round corners (or the edge middles) to the paper's corners. A zoom window shows where your finger is.</div>";
      else {
        h += "<div class='scan-filters'>" + FILTERS.map(function (f) { return "<button type='button' class='scan-f" + ((pg.f || "auto") === f[0] ? " on" : "") + "' data-scf='" + f[0] + "'>" + esc(f[1]) + "</button>"; }).join("") + "</div>";
        if (E.adj) h += "<div class='scan-sl'><label>Brightness <input type='range' min='-60' max='60' value='" + (pg.br || 0) + "' data-scs='br'></label><label>Contrast <input type='range' min='-50' max='80' value='" + (pg.ct || 0) + "' data-scs='ct'></label><label>Sharpness <input type='range' min='0' max='100' value='" + (pg.sh || 0) + "' data-scs='sh'></label><button type='button' class='btn ghost sm' data-sc='applyall'>Use this look on all pages</button></div>";
      }
    } else h += "<p class='muted' style='padding:12px'>No pages yet — take a photo or import one.</p>";
    h += "</div></div>";
    E.ov.innerHTML = h; E.cv = E.ov.querySelector(".scan-cv");
  }
  /* pages ticked for export (all, unless some are unticked) */
  function isSel(p) { return !E || !E.unsel || !E.unsel[p.id]; }
  function selPages() { return E ? E.doc.pages.filter(isSel) : []; }
  var BLANK = "data:image/svg+xml," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='70' height='99'><rect width='70' height='99' fill='#e8e8e8'/><text x='35' y='54' font-size='11' text-anchor='middle' fill='#888'>loading</text></svg>");
  function thumbUrl(p) { if (!p.thumb && !p.src) { fetchThumb(p); return BLANK; } if (!p.thumb) fetchThumb(p); var b = p.thumb || p.src, k = p.id + ":" + b.size; if (!urls[k]) urls[k] = URL.createObjectURL(b); return urls[k]; }
  /* draw the current page: crop mode = original photo + corner handles; result mode = processed preview */
  async function showPage() {
    if (!E || !E.cv) return; var pg = cur(), cv = E.cv, st = E.ov.querySelector(".scan-stage"); if (!pg) return;
    var bw = st.clientWidth || 600, bh = st.clientHeight || 500, x = cv.getContext("2d");
    if (E.mode === "crop") {
      var im = E.srcImg && E.srcImg.pid === pg.id ? E.srcImg : null;
      if (!im) { im = await loadImg(await srcOf(pg)); im.pid = pg.id; E.srcImg = im; }
      var dpr = Math.min(3, window.devicePixelRatio || 1), pad = 22, k = Math.min((bw - 2 * pad) / pg.w, (bh - 2 * pad) / pg.h);
      var cw = Math.round(pg.w * k + 2 * pad), ch = Math.round(pg.h * k + 2 * pad);
      cv.style.width = cw + "px"; cv.style.height = ch + "px"; cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
      E.k = k * dpr; E.pad = pad * dpr; E.dpr = dpr; drawQuad();
    } else {
      var c = await render(pg, 1600), dp = Math.min(3, window.devicePixelRatio || 1), k2 = Math.min(bw / c.width, bh / c.height, 1.5), w2 = Math.round(c.width * k2), h2 = Math.round(c.height * k2);
      cv.style.width = w2 + "px"; cv.style.height = h2 + "px"; cv.width = Math.round(w2 * dp); cv.height = Math.round(h2 * dp); x.imageSmoothingQuality = "high"; x.drawImage(c, 0, 0, cv.width, cv.height);
    }
  }
  /* image point ↔ canvas point (canvas = device pixels, photo drawn with a margin) */
  function toCv(p) { return [E.pad + p[0] * E.k, E.pad + p[1] * E.k]; }
  function handles(pg) { var q = pg.q, hs = q.map(function (p, i) { return { c: i, p: p }; }); for (var i = 0; i < 4; i++) { var a = q[i], b = q[(i + 1) % 4]; hs.push({ e: i, p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }); } return hs; }
  function drawQuad() {
    var pg = cur(), cv = E.cv, x = cv.getContext("2d"), d = E.dpr || 1, q = pg.q.map(toCv), im = E.srcImg;
    x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = "#2a323b"; x.fillRect(0, 0, cv.width, cv.height);
    x.drawImage(im, E.pad, E.pad, pg.w * E.k, pg.h * E.k);
    x.fillStyle = "rgba(0,0,0,.5)"; x.beginPath(); x.rect(E.pad, E.pad, pg.w * E.k, pg.h * E.k); x.moveTo(q[0][0], q[0][1]); for (var i = 3; i >= 0; i--) x.lineTo(q[i][0], q[i][1]); x.closePath(); x.fill("evenodd");
    x.strokeStyle = "#19a974"; x.lineWidth = 2.5 * d; x.beginPath(); q.forEach(function (p, i) { i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); }); x.closePath(); x.stroke();
    var lp = E.drag && E.drag.c != null; if (lp) snapNow();   // zoom window shows the photo + line, without the round handle on top
    handles(pg).forEach(function (h, n) {
      var p = toCv(h.p), on = E.drag && (E.drag.c === h.c && h.c != null || E.drag.e === h.e && h.e != null);
      x.beginPath(); if (h.c != null) x.arc(p[0], p[1], (on ? 13 : 10) * d, 0, 7); else { x.rect(p[0] - 7 * d, p[1] - 7 * d, 14 * d, 14 * d); }
      x.fillStyle = on ? "rgba(25,169,116,.9)" : "rgba(25,169,116,.45)"; x.fill(); x.lineWidth = 2 * d; x.strokeStyle = "#fff"; x.stroke();
    });
    if (lp) loupe(x, toCv(pg.q[E.drag.c]));
  }
  function snapNow() { var cv = E.cv; if (!E.snap || E.snap.width !== cv.width || E.snap.height !== cv.height) { E.snap = document.createElement("canvas"); E.snap.width = cv.width; E.snap.height = cv.height; } var sx = E.snap.getContext("2d"); sx.clearRect(0, 0, cv.width, cv.height); sx.drawImage(cv, 0, 0); }
  /* zoom window in the corner away from the finger: shows the exact spot under the finger */
  function loupe(x, p) {
    var d = E.dpr || 1, R = 55 * d, Z = 2.5, cv = E.cv, left = p[0] > cv.width / 2, cx = left ? R + 8 * d : cv.width - R - 8 * d, cy = p[1] > cv.height / 2 ? R + 8 * d : cv.height - R - 8 * d;
    x.save(); x.beginPath(); x.arc(cx, cy, R, 0, 7); x.clip(); x.fillStyle = "#000"; x.fillRect(cx - R, cy - R, 2 * R, 2 * R);
    x.drawImage(E.snap, p[0] - R / Z, p[1] - R / Z, 2 * R / Z, 2 * R / Z, cx - R, cy - R, 2 * R, 2 * R);
    x.strokeStyle = "#ff3b30"; x.lineWidth = 1.5 * d; x.beginPath(); x.moveTo(cx - 10 * d, cy); x.lineTo(cx + 10 * d, cy); x.moveTo(cx, cy - 10 * d); x.lineTo(cx, cy + 10 * d); x.stroke(); x.restore();
    x.beginPath(); x.arc(cx, cy, R, 0, 7); x.lineWidth = 3 * d; x.strokeStyle = "#fff"; x.stroke();
  }
  function evPt(e) { var r = E.cv.getBoundingClientRect(); return [(e.clientX - r.left) * E.cv.width / r.width, (e.clientY - r.top) * E.cv.height / r.height]; }
  document.addEventListener("pointerdown", function (e) {
    if (!E || E.mode !== "crop" || e.target !== E.cv) return; var p = evPt(e), pg = cur(), best = null, bd = 34 * (E.dpr || 1);
    handles(pg).forEach(function (h) { var c = toCv(h.p), dd = Math.hypot(c[0] - p[0], c[1] - p[1]) - (h.c != null ? 4 : 0); if (dd < bd) { bd = dd; best = h; } });
    if (!best) return;
    // drag relative to where the finger touched, so the corner does not jump under the finger
    E.drag = { c: best.c, e: best.e, start: p, q0: pg.q.map(function (a) { return a.slice(); }) }; E.cv.setPointerCapture(e.pointerId); e.preventDefault(); drawQuad();
  });
  document.addEventListener("pointermove", function (e) {
    if (!E || !E.drag) return; var D = E.drag, p = evPt(e), pg = cur(), dx = (p[0] - D.start[0]) / E.k, dy = (p[1] - D.start[1]) / E.k;
    function mv(i) { pg.q[i] = [Math.max(0, Math.min(pg.w, D.q0[i][0] + dx)), Math.max(0, Math.min(pg.h, D.q0[i][1] + dy))]; }
    if (D.c != null) mv(D.c); else { mv(D.e); mv((D.e + 1) % 4); }
    drawQuad(); e.preventDefault();
  });
  function endDrag() { if (E && E.drag) { E.drag = null; drawQuad(); touch(); } }
  document.addEventListener("pointerup", endDrag); document.addEventListener("pointercancel", endDrag);
  var saveT = null;
  function touch(rethumb) {
    var pg = cur(); clearTimeout(saveT);
    saveT = setTimeout(async function () { if (!E) return; if (pg) await refreshThumb(pg); await saveDoc(E.doc); if (E) { var t = E.ov.querySelector(".scan-th.on img"); if (t && pg) t.src = thumbUrl(pg); } SC.docs = null; }, rethumb === false ? 50 : 400);
  }
  async function step(fn, keepMode) { var pg = cur(); if (!pg) return; await fn(pg); if (!keepMode) { paintEditor(); } await showPage(); touch(); }

  /* ---------- export ---------- */
  var PAGE = { a4: [595.28, 841.89, "A4"], letter: [612, 792, "Letter"], legal: [612, 1008, "Legal"], fit: null };
  var QUAL = { high: [2400, 0.9, "High (best for printing)"], med: [1700, 0.82, "Medium"], small: [1200, 0.65, "Small file (for WhatsApp / email)"] };
  var X = { fmt: "pdf", size: "a4", margin: "0", qual: "med", per: "1", wm: "", sel: null };
  function exportPanel() {
    var d = E.doc, h = "<div class='scan-exp'><div class='scan-exp-box'><div class='row' style='justify-content:space-between;align-items:center'><h3 style='margin:0'>Export “" + esc(d.name) + "”</h3><button type='button' class='btn ghost sm' data-sc='expclose'>✕</button></div>";
    function rad(name, val, opts) { return "<div class='seg' role='group'>" + opts.map(function (o) { return "<button type='button' data-scx='" + name + "|" + o[0] + "' aria-pressed='" + (val === o[0]) + "'>" + esc(o[1]) + "</button>"; }).join("") + "</div>"; }
    h += "<div class='scan-exp-row'><span>Format</span>" + rad("fmt", X.fmt, [["pdf", "PDF"], ["jpg", "JPG"], ["png", "PNG"], ["long", "One long image"], ["txt", "Text (OCR)"]]) + "</div>";
    if (X.fmt === "pdf") {
      h += "<div class='scan-exp-row'><span>Page size</span>" + rad("size", X.size, [["a4", "A4"], ["letter", "Letter"], ["legal", "Legal"], ["fit", "Same as image"]]) + "</div>";
      h += "<div class='scan-exp-row'><span>Margin</span>" + rad("margin", X.margin, [["0", "None"], ["18", "Small"], ["36", "Normal"]]) + "</div>";
      h += "<div class='scan-exp-row'><span>Pages per sheet</span>" + rad("per", X.per, [["1", "1"], ["2", "2 (ID card / both sides)"]]) + "</div>";
    }
    if (X.fmt !== "txt") h += "<div class='scan-exp-row'><span>Quality</span>" + rad("qual", X.qual, Object.keys(QUAL).map(function (k) { return [k, QUAL[k][2]]; })) + "</div>" +
      "<div class='scan-exp-row'><span>Watermark</span><input class='in small' data-scwm='1' value='" + esc(X.wm) + "' placeholder='optional, e.g. SECL Gevra — copy' style='flex:1'></div>";
    if (X.fmt === "txt") h += "<p class='muted' style='margin:0;font-size:12px'>Reads the text of every page (English + Hindi). The first time it downloads the reading engine (about 10 MB), so it needs network.</p>";
    var ns = selPages().length;
    h += "<div class='scan-exp-row'><span>Pages</span><span class='muted'>" + (ns === d.pages.length ? "All " + ns : ns + " selected of " + d.pages.length) + " page" + (d.pages.length === 1 ? "" : "s") + " — tick / untick pages in the strip to choose</span></div>";
    h += "<div class='row' style='gap:8px;flex-wrap:wrap'><button type='button' class='btn pri' data-sc='dosave'>⬇ Download</button>" + (navigator.share ? "<button type='button' class='btn sec' data-sc='doshare'>Share…</button>" : "") + (X.fmt !== "txt" ? "<button type='button' class='btn sec' data-sc='doprint'>Print</button>" : "") + "</div><div class='scan-exp-msg muted'></div></div></div>";
    var old = E.ov.querySelector(".scan-exp"); if (old) old.remove(); E.ov.insertAdjacentHTML("beforeend", h);
  }
  function expMsg(t) { var m = E && E.ov.querySelector(".scan-exp-msg"); if (m) m.textContent = t; }
  async function finalCanvases() {
    var q = QUAL[X.qual], out = [];
    var P = selPages(); if (!P.length) throw new Error("No page is selected");
    for (var i = 0; i < P.length; i++) { expMsg("Preparing page " + (i + 1) + " of " + P.length + "…"); var c = await render(P[i], q[0]); if (X.wm) watermark(c, X.wm); out.push(c); }
    return out;
  }
  function watermark(c, t) { var x = c.getContext("2d"), s = Math.max(c.width, c.height) / 14; x.save(); x.translate(c.width / 2, c.height / 2); x.rotate(-Math.atan2(c.height, c.width)); x.font = "bold " + Math.round(s) + "px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = "rgba(200,0,0,.16)"; x.fillText(t, 0, 0); x.restore(); }
  /* minimal PDF writer: one JPEG (DCTDecode) per image, placed on the page */
  async function makePdf(cvs) {
    var q = QUAL[X.qual], enc = new TextEncoder(), parts = [], offs = [], len = 0, objs = 0;
    function push(x) { var b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); len += b.length; }
    function obj(body) { objs++; offs[objs] = len; push(objs + " 0 obj\n"); if (Array.isArray(body)) body.forEach(push); else push(body); push("\nendobj\n"); return objs; }
    push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
    var imgs = [];
    for (var i = 0; i < cvs.length; i++) { var b = new Uint8Array(await (await toBlob(cvs[i], "image/jpeg", q[1])).arrayBuffer()); imgs.push({ w: cvs[i].width, h: cvs[i].height, b: b }); }
    var per = X.per === "2" ? 2 : 1, sheets = [], m = +X.margin || 0;
    for (var s = 0; s < imgs.length; s += per) sheets.push(imgs.slice(s, s + per));
    var catalog = 1, pagesId = 2; objs = 2; // reserve
    var kids = [];
    sheets.forEach(function (sh) {
      var ps = PAGE[X.size], pw, ph;
      if (!ps) { var f = 72 / 150; pw = Math.max.apply(null, sh.map(function (im) { return im.w; })) * f + 2 * m; ph = sh.reduce(function (a, im) { return a + im.h * f; }, 0) + 2 * m; }
      else { pw = ps[0]; ph = ps[1]; if (per === 1 && sh[0].w > sh[0].h) { pw = ps[1]; ph = ps[0]; } }
      var cs = "", res = "";
      sh.forEach(function (im, j) {
        var id = obj(["<< /Type /XObject /Subtype /Image /Width " + im.w + " /Height " + im.h + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + im.b.length + " >>\nstream\n", im.b, "\nendstream"]);
        var boxH = (ph - 2 * m - (per - 1) * m) / per, boxW = pw - 2 * m, k = Math.min(boxW / im.w, boxH / im.h), dw = im.w * k, dh = im.h * k, dx = (pw - dw) / 2, dy = ph - m - j * (boxH + m) - (boxH + dh) / 2 - dh / 2 + dh / 2 - dh;
        dy = ph - m - j * (boxH + m) - (boxH - dh) / 2 - dh;
        cs += "q " + dw.toFixed(2) + " 0 0 " + dh.toFixed(2) + " " + dx.toFixed(2) + " " + dy.toFixed(2) + " cm /Im" + j + " Do Q\n"; res += "/Im" + j + " " + id + " 0 R ";
      });
      var csId = obj("<< /Length " + enc.encode(cs).length + " >>\nstream\n" + cs + "endstream");
      kids.push(obj("<< /Type /Page /Parent " + pagesId + " 0 R /MediaBox [0 0 " + pw.toFixed(2) + " " + ph.toFixed(2) + "] /Resources << /XObject << " + res + ">> >> /Contents " + csId + " 0 R >>"));
    });
    offs[pagesId] = len; push(pagesId + " 0 obj\n<< /Type /Pages /Kids [" + kids.map(function (k) { return k + " 0 R"; }).join(" ") + "] /Count " + kids.length + " >>\nendobj\n");
    offs[catalog] = len; push(catalog + " 0 obj\n<< /Type /Catalog /Pages " + pagesId + " 0 R >>\nendobj\n");
    var xref = len, x = "xref\n0 " + (objs + 1) + "\n0000000000 65535 f \n"; for (var n = 1; n <= objs; n++) x += String(offs[n]).padStart(10, "0") + " 00000 n \n";
    push(x + "trailer\n<< /Size " + (objs + 1) + " /Root " + catalog + " 0 R /Info << /Producer (Estimate Pro scanner) /Title (" + E.doc.name.replace(/[()\\]/g, "") + ") >> >>\nstartxref\n" + xref + "\n%%EOF");
    return new Blob(parts, { type: "application/pdf" });
  }
  async function longImage(cvs) { var w = Math.max.apply(null, cvs.map(function (c) { return c.width; })), hs = cvs.map(function (c) { return c.height * w / c.width; }), o = canvas(w, hs.reduce(function (a, b) { return a + b; }, 0)), x = o.getContext("2d"), y = 0; x.fillStyle = "#fff"; x.fillRect(0, 0, o.width, o.height); cvs.forEach(function (c, i) { x.drawImage(c, 0, y, w, hs[i]); y += hs[i]; }); return toBlob(o, "image/jpeg", QUAL[X.qual][1]); }
  var tess = null;
  function loadTess() { if (tess) return tess; tess = new Promise(function (ok, bad) { var s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"; s.onload = function () { ok(window.Tesseract); }; s.onerror = function () { tess = null; bad(new Error("The text reader couldn't be downloaded (no network?)")); }; document.head.appendChild(s); }); return tess; }
  async function ocr() {
    var T = await loadTess(), txt = [];
    var P = selPages(); if (!P.length) throw new Error("No page is selected");
    for (var i = 0; i < P.length; i++) { expMsg("Reading text, page " + (i + 1) + " of " + P.length + "… (first time downloads the language files)"); var c = await render(P[i], 2200); var r = await T.recognize(c, "eng+hin"); txt.push("— Page " + (i + 1) + " —\n" + (r && r.data ? r.data.text : "")); }
    return new Blob([txt.join("\n\n")], { type: "text/plain;charset=utf-8" });
  }
  async function buildFiles() {
    var nm = fname(E.doc.name);
    if (X.fmt === "txt") return [{ name: nm + ".txt", blob: await ocr() }];
    var cvs = await finalCanvases();
    if (X.fmt === "pdf") { expMsg("Making the PDF…"); return [{ name: nm + ".pdf", blob: await makePdf(cvs) }]; }
    if (X.fmt === "long") return [{ name: nm + ".jpg", blob: await longImage(cvs) }];
    var ext = X.fmt === "png" ? "png" : "jpg", out = [];
    for (var i = 0; i < cvs.length; i++) out.push({ name: nm + (cvs.length > 1 ? "_p" + pad(i + 1) : "") + "." + ext, blob: await toBlob(cvs[i], ext === "png" ? "image/png" : "image/jpeg", QUAL[X.qual][1]), at: Date.now() });
    return out;
  }
  function download(blob, name) { var a = document.createElement("a"), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 4000); }
  function kb(b) { return b.size > 1048576 ? (b.size / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b.size / 1024)) + " KB"; }
  async function doExport(how) {
    if (!E || SC.exporting) return; SC.exporting = true;
    try {
      var fs = await buildFiles();
      if (how === "share" && navigator.share) {
        var files = fs.map(function (f) { return new File([f.blob], f.name, { type: f.blob.type }); });
        if (!navigator.canShare || navigator.canShare({ files: files })) { await navigator.share({ files: files, title: E.doc.name }); expMsg("Shared."); return; }
        expMsg("Sharing these files isn't supported here — downloading instead.");
      }
      if (how === "print") { printIt(fs); return; }
      if (fs.length === 1) download(fs[0].blob, fs[0].name); else download(await U.camZip(fs), fname(E.doc.name) + "_" + X.fmt + ".zip");
      expMsg("Done — " + fs.map(function (f) { return f.name + " (" + kb(f.blob) + ")"; }).join(", "));
    } catch (e) { if (e && e.name === "AbortError") expMsg(""); else expMsg("Couldn't export: " + (e && e.message || e)); }
    finally { SC.exporting = false; }
  }
  function printIt(fs) {
    var w = window.open("", "_blank"); if (!w) { expMsg("Allow pop-ups to print."); return; }
    var imgs = fs.filter(function (f) { return /image/.test(f.blob.type); });
    if (!imgs.length) { var u = URL.createObjectURL(fs[0].blob); w.location = u; return; }
    w.document.write("<!doctype html><title>" + esc(E.doc.name) + "</title><style>@page{margin:8mm}body{margin:0}img{display:block;max-width:100%;max-height:100vh;margin:0 auto;page-break-after:always}</style>" + imgs.map(function (f) { return "<img src='" + URL.createObjectURL(f.blob) + "'>"; }).join("") + "<script>window.onload=function(){setTimeout(function(){print()},300)}<\/script>");
    w.document.close(); expMsg("Print window opened.");
  }

  /* ---------- editor events ---------- */
  document.addEventListener("click", async function (e) {
    if (!E && !cam) return;
    var t = e.target.closest && e.target.closest("button"); if (!t) return;
    var a = t.dataset.sc, pg = cur();
    if (cam) { if (a === "shoot") camShoot(); else if (a === "camclose") camClose(false); else if (a === "camapp") camClose(true); return; }
    if (!E || !E.ov.contains(t)) return;
    if (t.dataset.scpg != null) { E.i = +t.dataset.scpg; E.srcImg = null; paintEditor(); showPage(); return; }
    if (t.dataset.scf) { await step(function (p) { p.f = t.dataset.scf; }); return; }
    if (t.dataset.scx) { var kv = t.dataset.scx.split("|"); X[kv[0]] = kv[1]; exportPanel(); return; }
    switch (a) {
      case "edclose": await saveDoc(E.doc); E.ov.remove(); E = null; SC.docs = null; U.render(); return;
      case "mode-crop": E.mode = "crop"; paintEditor(); showPage(); return;
      case "adj": E.adj = !E.adj; paintEditor(); showPage(); return;
      case "mode-filter": E.mode = "filter"; paintEditor(); showPage(); touch(); return;
      case "rotl": await step(function (p) { p.rot = ((p.rot || 0) + 270) % 360; }); return;
      case "rotr": await step(function (p) { p.rot = ((p.rot || 0) + 90) % 360; }); return;
      case "autocrop": await step(async function (p) { var im = await loadImg(await srcOf(p)), c = canvas(p.w, p.h); c.getContext("2d").drawImage(im, 0, 0, p.w, p.h); p.q = detect(c); }); return;
      case "fullcrop": await step(function (p) { p.q = full(p.w, p.h, 0); }); return;
      case "autoall": await step(async function (p) { var im = await loadImg(await srcOf(p)), c = canvas(p.w, p.h); c.getContext("2d").drawImage(im, 0, 0, p.w, p.h); p.q = detect(c); p.f = "auto"; p.br = 0; p.ct = 0; p.sh = 20; }); E.mode = "filter"; paintEditor(); showPage(); U.toast("Auto crop, light and colour applied"); return;
      case "applyall": E.doc.pages.forEach(function (p) { p.f = pg.f; p.br = pg.br; p.ct = pg.ct; p.sh = pg.sh; }); SC.busy = "Updating pages…"; paintEditor(); for (var i = 0; i < E.doc.pages.length; i++) await refreshThumb(E.doc.pages[i]); SC.busy = ""; await saveDoc(E.doc); paintEditor(); showPage(); U.toast("Same look on all " + E.doc.pages.length + " pages"); return;
      case "moveup": case "movedn": var j = E.i + (a === "moveup" ? -1 : 1); if (j < 0 || j >= E.doc.pages.length) return; var P = E.doc.pages; var tmp = P[E.i]; P[E.i] = P[j]; P[j] = tmp; E.i = j; paintEditor(); showPage(); touch(false); return;
      case "delpg": if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Tap again to delete"; return; } E.doc.pages.splice(E.i, 1); E.i = Math.max(0, E.i - 1); E.srcImg = null; paintEditor(); showPage(); await saveDoc(E.doc); return;
      case "retake": var fs0 = await pickFiles("image/*", true); if (!fs0.length) return; var tmpDoc = { pages: [] }; await addImages(tmpDoc, fs0); if (tmpDoc.pages[0]) { E.doc.pages[E.i] = tmpDoc.pages[0]; E.srcImg = null; } paintEditor(); showPage(); await saveDoc(E.doc); return;
      case "addcam": var d0 = E.doc; await saveDoc(d0); E.ov.remove(); E = null; await liveCamera(d0); return;
      case "addfile": var fs1 = await pickFiles("image/*,application/pdf"); if (!fs1.length) return; var n0 = E.doc.pages.length; await importFiles(E.doc, fs1); E.i = Math.min(n0, E.doc.pages.length - 1); paintEditor(); showPage(); await saveDoc(E.doc); return;
      case "export": await saveDoc(E.doc); exportPanel(); return;
      case "selall": E.unsel = {}; paintEditor(); showPage(); return;
      case "selnone": E.unsel = {}; E.doc.pages.forEach(function (p) { E.unsel[p.id] = 1; }); paintEditor(); showPage(); return;
      case "expclose": var ex = E.ov.querySelector(".scan-exp"); if (ex) ex.remove(); return;
      case "dosave": doExport("save"); return;
      case "doshare": doExport("share"); return;
      case "doprint": doExport("print"); return;
    }
  });
  document.addEventListener("change", function (e) {
    var t = e.target; if (!E || !t.dataset || !t.dataset.scck) return; E.unsel = E.unsel || {}; if (t.checked) delete E.unsel[t.dataset.scck]; else E.unsel[t.dataset.scck] = 1;
    var sb = E.ov.querySelector(".scan-selbar span"); if (sb) sb.textContent = selPages().length + " of " + E.doc.pages.length + " pages selected for export";
  });
  document.addEventListener("input", function (e) {
    if (!E) return; var t = e.target, pg = cur();
    if (t.dataset.scName) { E.doc.name = t.value; touch(false); return; }
    if (t.dataset.scwm != null) { X.wm = t.value; return; }
    if (t.dataset.scs && pg) { pg[t.dataset.scs] = +t.value; clearTimeout(E.slT); E.slT = setTimeout(function () { showPage(); touch(); }, 120); }
  });
  window.addEventListener("resize", function () { if (E) showPage(); });
  function paintBusy() { if (E) { var b = E.ov.querySelector(".scan-busy"); if (SC.busy) { if (!b) { var st = E.ov.querySelector(".scan-stage"); if (st) st.insertAdjacentHTML("beforeend", "<div class='scan-busy'></div>"); b = E.ov.querySelector(".scan-busy"); } if (b) b.textContent = SC.busy; } else if (b) b.remove(); } else if (S.tab === "scan") { var g = document.getElementById("scan-busy"); if (g) g.textContent = SC.busy; } }

  /* ---------- Scanner tab: my scanned documents ---------- */
  U.views.scan = function () {
    if (SC.docs === null) { SC.docs = undefined; loadDocs(); }
    var all = SC.docs || [], folders = {}; all.forEach(function (d) { if (d.folder) folders[d.folder] = (folders[d.folder] || 0) + 1; }); (SC.extraFolders || []).forEach(function (f) { if (!(f in folders)) folders[f] = 0; });
    if (SC.folder !== "*" && SC.folder !== "" && !(SC.folder in folders)) folders[SC.folder] = 0;
    var docs = all.filter(function (d) { return (!SC.oldOnly || (d.ct || d.at) < Date.now() - 30 * DAY) && (SC.folder === "*" || (d.folder || "") === SC.folder) && (!SC.q || d.name.toLowerCase().indexOf(SC.q.toLowerCase()) >= 0); });
    var h = "<div style='display:flex;flex-direction:column;gap:12px;max-width:1200px'><div class='row' style='justify-content:space-between;flex-wrap:wrap;gap:8px'><h1 style='margin:0'>Scanner · स्कैनर</h1><div class='row' style='gap:8px;flex-wrap:wrap'><button type='button' class='btn pri' data-scn='cam'>📷 Scan with camera</button><button type='button' class='btn sec' data-scn='app'>Phone camera app</button><button type='button' class='btn sec' data-scn='file'>📁 Import photos / PDF</button></div></div>";
    h += "<p class='muted' style='margin:0'>Scan bills, measurement sheets, letters and drawings like CamScanner. Each page is cropped flat, shadows removed and light / colour set automatically — change anything by hand. Export as PDF (A4 / Letter / Legal), JPG, PNG, one long image or text (OCR). " + (me() ? "Scans are saved online in your account, so they open on all your devices (phone, laptop). Nothing is deleted automatically." : "Sign in to keep scans online on all your devices.") + "</p>";
    var cut = Date.now() - 30 * DAY, old = all.filter(function (d) { return (d.ct || d.at) < cut; }), snooze = 0; try { snooze = +localStorage.getItem("ep_scan_remind") || 0; } catch (er) {}
    if (old.length && snooze < Date.now()) h += "<div class='panel' style='border-left:4px solid #e0a000;display:flex;flex-direction:column;gap:6px'><strong>⚠️ " + old.length + " scan" + (old.length === 1 ? " is" : "s are") + " older than 30 days · " + old.length + " स्कैन 30 दिन से पुराने हैं</strong><span class='muted' style='font-size:13px'>Please clear memory: delete the scans you no longer need, or free phone space (the online copy stays). कृपया मेमोरी क्लियर करें — जो स्कैन ज़रूरी नहीं उन्हें delete करें। Auto delete नहीं होता।</span><div class='row' style='gap:6px;flex-wrap:wrap'><button type='button' class='btn sec sm' data-scold='1'>Show old scans</button>" + (me() ? "<button type='button' class='btn sec sm' data-scfree='1'>Free phone space</button>" : "") + "<button type='button' class='btn ghost sm' data-scsnooze='1'>Remind me in 7 days</button></div></div>";
    if (SC.oldOnly) h += "<div class='row' style='gap:8px;flex-wrap:wrap;align-items:center'><span class='badge'>Showing scans older than 30 days</span><button type='button' class='btn ghost sm' data-scpickall='1'>Select all shown</button><button type='button' class='btn ghost sm' data-scold='0'>Show all scans</button></div>";
    if (SC.cloudErr && me()) h += "<div class='muted' style='font-size:12px'>Online save problem: " + esc(SC.cloudErr) + " — scans are kept on this phone and will upload when it works.</div>";
    h += "<div class='row' style='gap:6px;flex-wrap:wrap;align-items:center'><strong>Folder / project:</strong><div class='seg' role='group' aria-label='Folder'><button type='button' data-scfold='*' aria-pressed='" + (SC.folder === "*") + "'>All (" + all.length + ")</button><button type='button' data-scfold='' aria-pressed='" + (SC.folder === "") + "'>No folder</button>" + Object.keys(folders).sort().map(function (f) { return "<button type='button' data-scfold='" + esc(f) + "' aria-pressed='" + (SC.folder === f) + "'>📁 " + esc(f) + " (" + folders[f] + ")</button>"; }).join("") + "</div><button type='button' class='btn ghost sm' data-scnewf='1'>+ New folder</button>" +
      (SC.folder !== "*" && SC.folder !== "" ? "<span class='muted' style='font-size:12px'>New scans go into 📁 " + esc(SC.folder) + "</span>" : "<span class='muted' style='font-size:12px'>Open a folder first to put new scans in it</span>") + "</div>";
    var pk = Object.keys(SC.pick).filter(function (k) { return SC.pick[k]; });
    if (pk.length) h += "<div class='row' style='gap:8px;flex-wrap:wrap;align-items:center'><strong>" + pk.length + " document" + (pk.length === 1 ? "" : "s") + " selected</strong><button type='button' class='btn pri sm' data-scmerge='1'>Combine &amp; export</button><select class='in small' data-scmove='1'><option value=''>Move to folder…</option><option value='-none-'>No folder</option>" + Object.keys(folders).sort().map(function (f) { return "<option value='" + esc(f) + "'>" + esc(f) + "</option>"; }).join("") + "</select><button type='button' class='btn ghost sm' data-scdelsel='1'>Delete selected</button><button type='button' class='btn ghost sm' data-scpicknone='1'>Clear selection</button></div>";
    h += "<div id='scan-busy' class='muted'>" + esc(SC.busy || "") + "</div>" + (SC.err ? "<div class='badge dan'>" + esc(SC.err) + "</div>" : "");
    if (SC.docs === undefined) return h + "<div class='empty'>Loading…</div></div>";
    if (SC.docs.length > 4) h += "<input class='in' id='scan-q' placeholder='Search scans by name' value='" + esc(SC.q) + "'>";
    if (!docs.length) return h + "<div class='panel empty'>No scans yet. Tap 📷 <strong>Scan with camera</strong>.</div></div>";
    h += "<div class='scan-grid'>" + docs.map(function (d) { var p = d.pages[0]; return "<div class='scan-card" + (SC.pick[d.id] ? " on" : "") + "'><label class='scan-pick'><input type='checkbox' data-scpick='" + d.id + "'" + (SC.pick[d.id] ? " checked" : "") + "> select</label><button type='button' class='scan-card-img' data-scopen='" + d.id + "'>" + (p ? "<img alt='' data-tp='" + p.id + "' src='" + thumbUrl(p) + "'>" : "<span class='muted'>empty</span>") + "</button><div class='scan-card-t'><strong>" + esc(d.name) + "</strong><span class='muted' style='font-size:12px'>" + (d.folder ? "📁 " + esc(d.folder) + " · " : "") + d.pages.length + " page" + (d.pages.length === 1 ? "" : "s") + " · " + new Date(d.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) + "</span>" + (me() ? cloudBadge(d) : "") + "</div><div class='row' style='gap:4px'><button type='button' class='btn ghost sm' data-scopen='" + d.id + "'>Open</button><button type='button' class='btn ghost sm' data-scexp='" + d.id + "'>PDF</button><button type='button' class='btn ghost sm' data-scdel='" + d.id + "'>Delete</button></div></div>"; }).join("") + "</div>";
    return h + "</div>";
  };
  document.addEventListener("click", async function (e) {
    if (S.tab !== "scan" || E || cam) return; var t = e.target.closest && e.target.closest("button"); if (!t) return; var ds = t.dataset;
    if (ds.scn) {
      var d = newDoc();
      if (ds.scn === "cam") { await liveCamera(d); return; }
      var fs = ds.scn === "app" ? await pickFiles("image/*", true) : await pickFiles("image/*,application/pdf");
      if (!fs.length) return; await importFiles(d, fs); if (!d.pages.length) return; await saveDoc(d); SC.docs = null; openEditor(d); return;
    }
    if (ds.scfold != null) { SC.folder = ds.scfold; try { localStorage.setItem("ep_scan_folder", SC.folder); } catch (er) {} SC.pick = {}; U.render(); return; }
    if (ds.scnewf) { var nmf = (window.prompt("Folder / project name (e.g. Gevra pump house, Bills Nov 2026)") || "").trim(); if (!nmf) return; SC.extraFolders = (SC.extraFolders || []).concat([nmf]); SC.folder = nmf; try { localStorage.setItem("ep_scan_folder", nmf); } catch (er) {} U.render(); return; }
    if (ds.scpicknone) { SC.pick = {}; U.render(); return; }
    if (ds.scold != null) { SC.oldOnly = ds.scold === "1"; if (SC.oldOnly) SC.folder = "*"; SC.pick = {}; U.render(); return; }
    if (ds.scsnooze) { try { localStorage.setItem("ep_scan_remind", String(Date.now() + 7 * DAY)); } catch (er) {} U.render(); return; }
    if (ds.scpickall) { var cutA = Date.now() - 30 * DAY; (SC.docs || []).forEach(function (x) { if ((x.ct || x.at) < cutA) SC.pick[x.id] = true; }); U.render(); return; }
    if (ds.scfree) { var fr = await freeOld(); U.render(); U.toast(fr.n ? "Freed " + fr.mb + " MB on this phone (" + fr.n + " pages). They stay online and download again when opened." : "Nothing to free — old scans are not online yet, or already freed."); return; }
    if (ds.scdelsel) { var ids = Object.keys(SC.pick).filter(function (k) { return SC.pick[k]; }); if (!ids.length) return; if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Tap again to delete " + ids.length; return; } SC.busy = "Deleting…"; U.render(); for (var di = 0; di < ids.length; di++) await delDoc(ids[di]); SC.busy = ""; SC.pick = {}; SC.docs = null; U.render(); U.toast(ids.length + " scan" + (ids.length === 1 ? "" : "s") + " deleted (also online)"); return; }
    if (ds.scmerge) {
      var chosen = (SC.docs || []).filter(function (x) { return SC.pick[x.id]; }).sort(function (a, b) { return a.at - b.at; }); if (!chosen.length) return;
      var m = { id: uid(), name: chosen.length === 1 ? chosen[0].name : (SC.folder !== "*" && SC.folder ? SC.folder : "Combined") + " " + stamp(), at: Date.now(), folder: chosen[0].folder || "", pages: [] };
      SC.busy = "Combining…"; U.render();
      try { for (var ci = 0; ci < chosen.length; ci++) for (var cj = 0; cj < chosen[ci].pages.length; cj++) { var cp = chosen[ci].pages[cj]; if (chosen.length > 1) await srcOf(cp); m.pages.push(Object.assign({}, cp, { id: uid(), up: 0, tdirty: 1 })); } }
      catch (er) { SC.busy = ""; U.render(); U.toast(er.message); return; } SC.busy = "";
      if (chosen.length > 1) { await saveDoc(m); SC.docs = null; } else m = chosen[0];
      SC.pick = {}; openEditor(m); X.fmt = "pdf"; exportPanel(); U.toast(chosen.length > 1 ? "Combined " + chosen.length + " documents (" + m.pages.length + " pages) into a new document" : "Opened for export"); return;
    }
    var doc = ds.scopen || ds.scexp || ds.scdel ? (SC.docs || []).filter(function (x) { return x.id === (ds.scopen || ds.scexp || ds.scdel); })[0] : null;
    if (ds.scopen && doc) { openEditor(doc); return; }
    if (ds.scexp && doc) { openEditor(doc); X.fmt = "pdf"; exportPanel(); return; }
    if (ds.scdel && doc) { if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Tap again"; return; } await delDoc(doc.id); SC.docs = null; U.render(); U.toast("Scan deleted"); }
  });
  U.scanApi = { detect: detect, render: render, addImages: addImages, newDoc: newDoc, openEditor: openEditor, exportPanel: exportPanel, buildFiles: buildFiles, X: X, saveDoc: saveDoc, loadDocs: loadDocs, editor: function () { return E; } };
  document.addEventListener("input", function (e) { if (e.target.id === "scan-q") { SC.q = e.target.value; U.render(); } });
  document.addEventListener("change", async function (e) {
    if (S.tab !== "scan" || E) return; var t = e.target, ds = t.dataset || {};
    if (ds.scpick) { SC.pick[ds.scpick] = t.checked; U.render(); return; }
    if (ds.scmove && t.value) { var to = t.value === "-none-" ? "" : t.value; var list = (SC.docs || []).filter(function (x) { return SC.pick[x.id]; }); for (var i = 0; i < list.length; i++) { list[i].folder = to; await saveDoc(list[i]); } SC.pick = {}; SC.docs = null; U.render(); U.toast("Moved " + list.length + " document" + (list.length === 1 ? "" : "s") + (to ? " to 📁 " + to : " out of the folder")); }
  });
})();
