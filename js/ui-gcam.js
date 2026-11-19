/* Estimate Pro — GPS camera (site photos with location stamp).
   * Opens the phone camera inside the app, follows GPS (accuracy shown), and stamps every photo with
     place / address, latitude-longitude, accuracy, altitude, date-time (IST), project name and a note,
     plus a small map when there is network. Latitude/longitude and time are also written in the photo's
     EXIF, so the photo stays geotagged in Google Photos / file properties.
   * Photos are kept on the phone first (work without network) and uploaded to the private Storage bucket
     "site-photos" when the network is there (supabase/photos.sql). Gallery: Estimates → Site photos. */
(function () {
  "use strict";
  var EP = window.EP, S = EP.S, U = EP.ui, esc = U.esc;
  S.cam = { site: "", note: "", pos: null, gpsErr: "", addr: null, facing: "environment", shot: null, busy: false, srvOk: true, list: null, scope: "est", local: [], urls: {}, sel: null, view: null };
  var C = S.cam, stream = null, watchId = null, box = null, lastGeo = 0, geoKey = "";
  function db() { return U.db(); }
  function me() { return S.me && S.me.id; }
  /* anonymous ID for offline / no-login use; photos migrate to real ID on sign-in */
  function anonId() { try { var k = "ep_anon_cam", v = localStorage.getItem(k); if (!v) { v = (crypto.randomUUID ? crypto.randomUUID() : "anon-" + Date.now() + "-" + Math.random().toString(36).slice(2)); localStorage.setItem(k, v); } return v; } catch (e) { return "anon-fallback"; } }
  function owner() { return me() || anonId(); }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ist(d) { var t = new Date(d.getTime() + (330 + d.getTimezoneOffset()) * 60000); return t; }
  function stampTime(d) { var t = ist(d), h = t.getHours(), ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return pad(t.getDate()) + "/" + pad(t.getMonth() + 1) + "/" + t.getFullYear() + " " + pad(h) + ":" + pad(t.getMinutes()) + ":" + pad(t.getSeconds()) + " " + ap + " GMT +05:30"; }
  function dms(v, pos, neg) { var a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = ((a - d) * 60 - m) * 60; return d + "°" + m + "'" + s.toFixed(1) + '"' + (v >= 0 ? pos : neg); }
  try { S.cam.site = localStorage.getItem("ep_cam_site") || ""; } catch (e) {}

  /* ---------- location ---------- */
  function startGps() {
    if (!navigator.geolocation) { C.gpsErr = "This phone / browser has no GPS access."; return; }
    if (watchId != null) return;
    watchId = navigator.geolocation.watchPosition(function (p) {
      var c = p.coords; C.pos = { lat: c.latitude, lng: c.longitude, acc: c.accuracy, alt: c.altitude, head: c.heading, at: p.timestamp }; C.gpsErr = "";
      lookupAddr(); paintStatus();
    }, function (e) {
      C.gpsErr = e.code === 1 ? "Location permission is off. Allow location for this site in the browser / phone settings." : e.code === 3 ? "Waiting for GPS… go to open sky." : "GPS not available right now.";
      paintStatus();
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  }
  function stopGps() { if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId); watchId = null; }
  var addrCache = {};
  try { addrCache = JSON.parse(localStorage.getItem("ep_addr") || "{}") || {}; } catch (e) { addrCache = {}; }
  async function lookupAddr() {
    var p = C.pos; if (!p) return;
    var k = p.lat.toFixed(3) + "," + p.lng.toFixed(3);
    if (addrCache[k]) { C.addr = addrCache[k]; geoKey = k; return; }
    if (k === geoKey || Date.now() - lastGeo < 2500 || !navigator.onLine) return;
    geoKey = k; lastGeo = Date.now();
    try {
      var ctl = new AbortController(), tm = setTimeout(function () { ctl.abort(); }, 6000);
      var r = await fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&addressdetails=1&accept-language=en&lat=" + p.lat.toFixed(6) + "&lon=" + p.lng.toFixed(6), { signal: ctl.signal, headers: { Accept: "application/json" } });
      clearTimeout(tm); if (!r.ok) return;
      var j = await r.json(), a = j.address || {};
      var place = [a.village || a.suburb || a.hamlet || a.neighbourhood || a.town || a.city || "", a.city || a.town || a.county || "", a.state_district || "", a.state || "", a.country || ""].filter(function (x, i, arr) { return x && arr.indexOf(x) === i; });
      var v = { title: place.slice(0, 4).join(", "), full: String(j.display_name || "").replace(/, \d{6},/, function (m) { return m; }) };
      addrCache[k] = v; C.addr = v; try { var keys = Object.keys(addrCache); if (keys.length > 300) delete addrCache[keys[0]]; localStorage.setItem("ep_addr", JSON.stringify(addrCache)); } catch (e) {}
      paintStatus();
    } catch (e) { geoKey = ""; }
  }

  /* ---------- small map (OpenStreetMap tiles, only with network) ---------- */
  function tileImg(z, x, y) {
    return new Promise(function (res) {
      var im = new Image(), done = false; im.crossOrigin = "anonymous";
      var t = setTimeout(function () { if (!done) { done = true; res(null); } }, 3500);
      im.onload = function () { if (!done) { done = true; clearTimeout(t); res(im); } };
      im.onerror = function () { if (!done) { done = true; clearTimeout(t); res(null); } };
      im.src = "https://tile.openstreetmap.org/" + z + "/" + x + "/" + y + ".png";
    });
  }
  async function miniMap(lat, lng) {
    if (!navigator.onLine || window.EP_NO_TILES) return null;
    var z = 16, n = Math.pow(2, z), lr = lat * Math.PI / 180;
    var px = (lng + 180) / 360 * n * 256, py = (1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * n * 256;
    var x0 = Math.floor((px - 128) / 256), y0 = Math.floor((py - 128) / 256);
    var ims = await Promise.all([[0, 0], [1, 0], [0, 1], [1, 1]].map(function (d) { return tileImg(z, x0 + d[0], y0 + d[1]); }));
    if (ims.some(function (x) { return !x; })) return null;
    var cv = document.createElement("canvas"); cv.width = cv.height = 256; var g = cv.getContext("2d");
    var ox = px - 128 - x0 * 256, oy = py - 128 - y0 * 256;
    [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(function (d, i) { g.drawImage(ims[i], d[0] * 256 - ox, d[1] * 256 - oy); });
    g.fillStyle = "#d93025"; g.strokeStyle = "#fff"; g.lineWidth = 3;
    g.beginPath(); g.arc(128, 100, 13, Math.PI, 0); g.lineTo(128, 128); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#fff"; g.beginPath(); g.arc(128, 100, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(255,255,255,.8)"; g.fillRect(150, 242, 106, 14); g.fillStyle = "#333"; g.font = "10px sans-serif"; g.fillText("© OpenStreetMap", 154, 253);
    try { cv.toDataURL(); } catch (e) { return null; }   // never let a tainted map spoil the photo
    return cv;
  }

  /* ---------- stamp ---------- */
  function wrap(g, text, maxW) { var words = String(text).split(/\s+/), lines = [], cur = ""; words.forEach(function (w) { var t = cur ? cur + " " + w : w; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }); if (cur) lines.push(cur); return lines; }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath(); }
  function drawStamp(g, W, H, m, map) {
    var f = Math.max(14, Math.round(Math.min(W, H * 1.4) / 44)), lh = Math.round(f * 1.38), pad2 = Math.round(f * 0.8), mg = Math.round(f * 0.6);
    var p = m.lat != null ? m : null, lines = [];
    var title = (m.address && m.address.title) || (p ? "Lat " + p.lat.toFixed(6) + "°, Long " + p.lng.toFixed(6) + "°" : "Location not available");
    var mapW = map ? Math.round(f * 7.2) : 0, tx = mg + pad2 + (map ? mapW + pad2 : 0), maxW = W - tx - mg - pad2;
    g.font = "600 " + Math.round(f * 1.12) + "px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    var tl = wrap(g, title, maxW).slice(0, 2);
    g.font = f + "px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    if (m.address && m.address.full) lines = lines.concat(wrap(g, m.address.full, maxW).slice(0, 2));
    if (p) lines.push("Lat " + p.lat.toFixed(6) + "°  Long " + p.lng.toFixed(6) + "°" + (p.acc != null ? "  ±" + Math.round(p.acc) + " m" : "") + (p.alt != null ? "  Alt " + Math.round(p.alt) + " m" : ""));
    if (p) lines.push(dms(p.lat, "N", "S") + "  " + dms(p.lng, "E", "W"));
    lines.push(stampTime(new Date(m.taken_at)));
    var proj = [m.site, m.note].filter(Boolean).join(" · ");
    if (proj) lines = lines.concat(wrap(g, proj, maxW).slice(0, 2));
    var bh = pad2 * 2 + tl.length * Math.round(lh * 1.1) + lines.length * lh; if (map) bh = Math.max(bh, mapW + pad2 * 2);
    var by = H - bh - mg;
    g.save(); g.fillStyle = "rgba(0,0,0,.58)"; roundRect(g, mg, by, W - mg * 2, bh, Math.round(f * 0.5)); g.fill();
    if (map) { g.drawImage(map, mg + pad2, by + pad2, mapW, mapW); g.strokeStyle = "rgba(255,255,255,.85)"; g.lineWidth = Math.max(2, f / 10); g.strokeRect(mg + pad2, by + pad2, mapW, mapW); }
    g.fillStyle = "#fff"; g.textBaseline = "top"; var y = by + pad2;
    g.font = "600 " + Math.round(f * 1.12) + "px system-ui, -apple-system, Segoe UI, Roboto, sans-serif"; tl.forEach(function (l) { g.fillText(l, tx, y); y += Math.round(lh * 1.1); });
    g.font = f + "px system-ui, -apple-system, Segoe UI, Roboto, sans-serif"; lines.forEach(function (l) { g.fillText(l, tx, y); y += lh; });
    // badge on top of the band
    g.font = "600 " + Math.round(f * 0.78) + "px system-ui, sans-serif"; var bt = "📍 Estimate Pro · GPS Camera", bw = g.measureText(bt).width + f;
    g.fillStyle = "rgba(15,63,98,.9)"; roundRect(g, W - mg - bw, by - Math.round(f * 1.5), bw, Math.round(f * 1.3), Math.round(f * 0.3)); g.fill();
    g.fillStyle = "#fff"; g.fillText(bt, W - mg - bw + f / 2, by - Math.round(f * 1.5) + Math.round(f * 0.22));
    g.restore();
  }

  /* ---------- EXIF (GPS + time) ---------- */
  function exif(m) {
    var d = new Date(m.taken_at), t = ist(d), dt = t.getFullYear() + ":" + pad(t.getMonth() + 1) + ":" + pad(t.getDate()) + " " + pad(t.getHours()) + ":" + pad(t.getMinutes()) + ":" + pad(t.getSeconds());
    function asc(s) { s = String(s).replace(/[^\x20-\x7e]/g, "?") + "\0"; return { type: 2, count: s.length, bytes: Array.prototype.map.call(s, function (c) { return c.charCodeAt(0); }) }; }
    function rat(list) { var b = []; list.forEach(function (r) { [r[0], r[1]].forEach(function (v) { b.push(v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255); }); }); return { type: 5, count: list.length, bytes: b }; }
    function lng4(v) { return { type: 4, count: 1, bytes: [v >>> 24 & 255, v >>> 16 & 255, v >>> 8 & 255, v & 255] }; }
    function byt(arr) { return { type: 1, count: arr.length, bytes: arr }; }
    function dmsR(v) { var a = Math.abs(v), dd = Math.floor(a), mm = Math.floor((a - dd) * 60), ss = Math.round(((a - dd) * 60 - mm) * 60 * 10000); return [[dd, 1], [mm, 1], [ss, 10000]]; }
    var gps = null;
    if (m.lat != null) {
      var u = d; gps = { 0: byt([2, 3, 0, 0]), 1: asc(m.lat >= 0 ? "N" : "S"), 2: rat(dmsR(m.lat)), 3: asc(m.lng >= 0 ? "E" : "W"), 4: rat(dmsR(m.lng)),
        7: rat([[u.getUTCHours(), 1], [u.getUTCMinutes(), 1], [u.getUTCSeconds(), 1]]), 29: asc(u.getUTCFullYear() + ":" + pad(u.getUTCMonth() + 1) + ":" + pad(u.getUTCDate())) };
      if (m.alt != null) { gps[5] = byt([m.alt < 0 ? 1 : 0]); gps[6] = rat([[Math.round(Math.abs(m.alt) * 100), 100]]); }
      if (m.acc != null) gps[31] = rat([[Math.round(m.acc * 100), 100]]);
    }
    var ifd0 = { 0x010E: asc([m.site, m.note].filter(Boolean).join(" - ") || "Site photo"), 0x010F: asc("Estimate Pro"), 0x0131: asc("Estimate Pro GPS Camera"), 0x0132: asc(dt), 0x8769: lng4(0) };
    if (gps) ifd0[0x8825] = lng4(0);
    var exifIfd = { 0x9003: asc(dt), 0x9004: asc(dt), 0x9011: asc("+05:30") };
    // layout: header(8) | IFD0 | data0 | ExifIFD | dataE | GPSIFD | dataG
    function size(ifd) { var ks = Object.keys(ifd), ds = 0; ks.forEach(function (k) { var n = ifd[k].bytes.length; if (n > 4) ds += n + (n & 1); }); return { ifd: 2 + ks.length * 12 + 4, data: ds }; }
    var s0 = size(ifd0), sE = size(exifIfd), sG = gps ? size(gps) : { ifd: 0, data: 0 };
    var o0 = 8, oE = o0 + s0.ifd + s0.data, oG = oE + sE.ifd + sE.data, total = oG + sG.ifd + sG.data;
    ifd0[0x8769] = lng4(oE); if (gps) ifd0[0x8825] = lng4(oG);
    var b = new Uint8Array(total), dv = new DataView(b.buffer);
    b.set([0x4d, 0x4d, 0, 42, 0, 0, 0, 8], 0);
    function write(ifd, off, sz) {
      var ks = Object.keys(ifd).map(Number).sort(function (a, c) { return a - c; }), dp = off + sz.ifd;
      dv.setUint16(off, ks.length);
      ks.forEach(function (k, i) {
        var e = ifd[k], p = off + 2 + i * 12; dv.setUint16(p, k); dv.setUint16(p + 2, e.type); dv.setUint32(p + 4, e.count);
        if (e.bytes.length <= 4) b.set(e.bytes, p + 8); else { dv.setUint32(p + 8, dp); b.set(e.bytes, dp); dp += e.bytes.length + (e.bytes.length & 1); }
      });
      dv.setUint32(off + 2 + ks.length * 12, 0);
    }
    write(ifd0, o0, s0); write(exifIfd, oE, sE); if (gps) write(gps, oG, sG);
    var head = [0x45, 0x78, 0x69, 0x66, 0, 0], len = head.length + total + 2, app1 = new Uint8Array(len + 2);
    app1.set([0xff, 0xe1, len >> 8 & 255, len & 255], 0); app1.set(head, 4); app1.set(b, 10);
    return app1;
  }
  async function withExif(blob, m) {
    try {
      var buf = new Uint8Array(await blob.arrayBuffer()); if (buf[0] !== 0xff || buf[1] !== 0xd8) return blob;
      var i = 2; if (buf[2] === 0xff && buf[3] === 0xe0) i = 4 + (buf[4] << 8 | buf[5]);   // drop the JFIF APP0 segment
      var ap = exif(m), out = new Uint8Array(2 + ap.length + buf.length - i);
      out.set([0xff, 0xd8], 0); out.set(ap, 2); out.set(buf.subarray(i), 2 + ap.length);
      return new Blob([out], { type: "image/jpeg" });
    } catch (e) { return blob; }
  }
  U.camExif = exif;

  /* ---------- take the photo ---------- */
  function toBlob(cv, q) { return new Promise(function (res) { cv.toBlob(function (b) { res(b); }, "image/jpeg", q); }); }
  async function compose(src, sw, sh) {
    var k = Math.min(1, 1920 / Math.max(sw, sh)), W = Math.round(sw * k), H = Math.round(sh * k);
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H; var g = cv.getContext("2d");
    g.drawImage(src, 0, 0, W, H);
    var p = C.pos, m = { id: (crypto.randomUUID ? crypto.randomUUID() : EP.uid() + "-" + Date.now()), owner: owner(), site: (C.site || "").trim().slice(0, 120), note: (C.note || "").trim().slice(0, 300), taken_at: new Date().toISOString(),
      lat: p ? p.lat : null, lng: p ? p.lng : null, acc: p ? p.acc : null, alt: p && p.alt != null ? p.alt : null, heading: p && p.head != null ? p.head : null, address: C.addr && p && C.addr === addrCache[p.lat.toFixed(3) + "," + p.lng.toFixed(3)] ? C.addr : null };
    var map = p ? await miniMap(p.lat, p.lng) : null;
    drawStamp(g, W, H, m, map);
    var blob = await withExif(await toBlob(cv, 0.86), m);
    var tk = 360 / Math.max(W, H), tc = document.createElement("canvas"); tc.width = Math.round(W * tk); tc.height = Math.round(H * tk); tc.getContext("2d").drawImage(cv, 0, 0, tc.width, tc.height);
    m.thumb = tc.toDataURL("image/jpeg", 0.62); m.bytes = blob.size;
    return { m: m, blob: blob };
  }
  async function capture() {
    var v = box && box.querySelector("video"); if (!v || !v.videoWidth) { U.toast("Camera is not ready — use “Phone camera”"); return; }
    C.busy = true; paint();
    try { var r = await compose(v, v.videoWidth, v.videoHeight); showShot(r); } catch (e) { console.error(e); U.toast("Couldn't take the photo"); }
    C.busy = false; paint();
  }
  async function fromFile(file) {
    if (!file) return; C.busy = true; paint();
    try {
      var bmp = window.createImageBitmap ? await createImageBitmap(file, { imageOrientation: "from-image" }).catch(function () { return null; }) : null, w, h;
      if (!bmp) { bmp = await new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = URL.createObjectURL(file); }); w = bmp.naturalWidth; h = bmp.naturalHeight; } else { w = bmp.width; h = bmp.height; }
      showShot(await compose(bmp, w, h));
    } catch (e) { console.error(e); U.toast("Couldn't read the photo"); }
    C.busy = false; paint();
  }
  function showShot(r) { if (C.shot && C.shot.url) URL.revokeObjectURL(C.shot.url); C.shot = { m: r.m, blob: r.blob, url: URL.createObjectURL(r.blob) }; paint(); }
  function fname(m) { var t = ist(new Date(m.taken_at)); return "GPS_" + t.getFullYear() + pad(t.getMonth() + 1) + pad(t.getDate()) + "_" + pad(t.getHours()) + pad(t.getMinutes()) + pad(t.getSeconds()) + (m.site ? "_" + m.site.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) : "") + ".jpg"; }
  function download(blob, name) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  async function share(blob, m) {
    var f = new File([blob], fname(m), { type: "image/jpeg" });
    if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: "Site photo", text: (m.site || "") + (m.lat != null ? " · " + m.lat.toFixed(6) + ", " + m.lng.toFixed(6) : "") }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    download(blob, fname(m));
  }

  /* ---------- keep on the phone, upload when there is network ---------- */
  function idxKey() { return "photos:" + owner(); }
  async function localList() { return (U.off ? await U.off.get(idxKey()) : null) || []; }
  /* every change of the local photo list goes through this queue, so a save and an upload running together never overwrite each other */
  var idxQ = Promise.resolve();
  function editIdx(fn) { var p = idxQ.then(async function () { var L = await localList(), N = fn(L.slice()); await U.off.putStrict(idxKey(), N); C.local = N; return N; }); idxQ = p.catch(function () {}); return p; }
  /* the photo is stored as bytes (ArrayBuffer): some phones / in-app browsers cannot keep a Blob in IndexedDB */
  function recBlob(rec) { if (!rec) return null; if (rec.blob instanceof Blob) return rec.blob; if (rec.buf) return new Blob([rec.buf], { type: rec.type || "image/jpeg" }); return null; }
  async function saveLocal(m, blob) {
    if (!U.off || !window.indexedDB) throw new Error("this browser cannot keep photos on the phone");
    var meta = Object.assign({}, m), buf = await blob.arrayBuffer();
    await U.off.putStrict("photo:" + m.id, { meta: meta, buf: buf, type: blob.type || "image/jpeg" });
    var chk = await U.off.get("photo:" + m.id); if (!recBlob(chk)) throw new Error("the photo could not be kept on this phone (storage full?)");
    await editIdx(function (L) { return [Object.assign({ local: true }, meta)].concat(L.filter(function (x) { return x.id !== m.id; })); });
  }
  async function upload(meta, blob) {
    var path = me() + "/photos/" + meta.id + ".jpg";
    var up = await db().storage.from("site-photos").upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (up.error) return up.error;
    var row = { id: meta.id, owner: me(), path: path, site: meta.site || "", taken_at: meta.taken_at, lat: meta.lat, lng: meta.lng, acc: meta.acc, alt: meta.alt, heading: meta.heading, address: meta.address ? (meta.address.full || meta.address.title || "") : "", note: meta.note || "", thumb: meta.thumb || "", bytes: blob.size };
    var r = await db().from("site_photos").insert(row);
    if (r.error && !/duplicate|23505/.test(r.error.message || r.error.code || "")) return r.error;
    return null;
  }
  var syncing = false, again = false;
  U.camSync = async function () {
    if (!me() || !U.off || !navigator.onLine) return;
    if (syncing) { again = true; return; } syncing = true;
    try {
      var L = await localList(), done = [], up = 0, failed = false;
      for (var i = 0; i < L.length; i++) {
        var x = L[i], rec = await U.off.get("photo:" + x.id), b = recBlob(rec); if (!b) continue;
        var err = await upload(rec.meta || x, b);
        if (err) { failed = true; if (!U.off.isNet(err)) { C.upErr = err.message || String(err); } continue; }
        done.push(x.id); up++;
      }
      if (done.length) {
        await editIdx(function (N) { return N.filter(function (y) { return done.indexOf(y.id) < 0; }); });   // drop only what was uploaded; photos saved meanwhile stay
        for (var j = 0; j < done.length; j++) await U.off.put("photo:" + done[j], null);
      }
      if (up && !failed) C.upErr = "";
      if (up) { U.toast(up + " site photo" + (up === 1 ? "" : "s") + " uploaded"); C.list = null; U.render(); }
    } catch (e) { console.warn("photo sync", e); }
    finally { syncing = false; if (again) { again = false; setTimeout(U.camSync, 1500); } }
  };
  window.addEventListener("online", function () { setTimeout(U.camSync, 4000); });
  async function keepShot() {
    var s = C.shot; if (!s || C.busy) return; C.busy = true; paint();
    try {
      await saveLocal(s.m, s.blob);
    } catch (e) {
      console.error(e);
      // could not keep it on the phone: try to put it online straight away
      var err = navigator.onLine && me() ? await upload(s.m, s.blob).catch(function (x) { return x; }) : new Error("no network / not signed in");
      if (err) { C.busy = false; paint(); U.toast("Photo NOT saved — " + ((e && e.message) || "storage error") + ". Use “Share / Download” to keep it. · फ़ोटो सेव नहीं हुई, Share / Download से रख लें।"); return; }
      U.toast("Photo saved online in GPS Photos");
      URL.revokeObjectURL(s.url); C.shot = null; C.busy = false; C.list = null; paint(); U.render(); return;
    }
    if (U.logAct) U.logAct("photo", (s.m.site || "GPS photo") + (s.m.lat != null ? " " + s.m.lat.toFixed(5) + "," + s.m.lng.toFixed(5) : ""));
    URL.revokeObjectURL(s.url); C.shot = null; C.busy = false; C.list = null;
    U.toast((me() && navigator.onLine ? "Photo saved in GPS Photos" : me() ? "Photo saved on this phone — it uploads when the network is back" : "Photo saved on this phone — sign in to sync online") + " · kept for " + KEEP + " days");
    paint(); U.render(); if (me()) U.camSync();
  }

  /* ---------- camera screen (its own layer, outside the app view) ---------- */
  async function startCam() {
    stopCam();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { C.camErr = "In-app camera is not available in this browser — use “Phone camera”."; paint(); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: C.facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      C.camErr = ""; var v = box && box.querySelector("video"); if (v) { v.srcObject = stream; v.play().catch(function () {}); }
    } catch (e) { C.camErr = /NotAllowed|Permission/i.test(e.name || e.message) ? "Camera permission is off. Allow the camera for this site, or use “Phone camera”." : "Couldn't open the camera — use “Phone camera”."; }
    paint();
  }
  function stopCam() { if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } }
  U.openCam = function () {
    C.shot = null; C.camErr = "";
    if (!box) { box = document.createElement("div"); box.id = "gcam"; box.className = "gcam"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", "GPS camera"); document.body.appendChild(box); }
    box.hidden = false; document.documentElement.classList.add("gcam-on");
    box.innerHTML = "<video playsinline muted autoplay></video><img class='gcam-shot' alt='Photo with location stamp' hidden><div class='gcam-top'><button type='button' class='gcam-x' id='gcam-close' aria-label='Close camera'>✕</button><div class='gcam-st' id='gcam-st' role='status' aria-live='polite'></div></div><div class='gcam-bot' id='gcam-bot'></div><input type='file' id='gcam-file' accept='image/*' capture='environment' hidden>";
    paint(); startGps(); startCam();
  };
  function closeCam() { stopCam(); stopGps(); if (C.shot && C.shot.url) URL.revokeObjectURL(C.shot.url); C.shot = null; if (box) { box.hidden = true; box.innerHTML = ""; } document.documentElement.classList.remove("gcam-on"); U.render(); }
  function paintStatus() {
    var st = box && box.querySelector("#gcam-st"); if (!st) return;
    var p = C.pos, good = p && p.acc <= 20, ok = p && p.acc <= 60;
    st.innerHTML = (p ? "<span class='gcam-dot " + (good ? "g" : ok ? "y" : "r") + "'></span><b>GPS ±" + Math.round(p.acc) + " m</b> · " + p.lat.toFixed(6) + ", " + p.lng.toFixed(6) + (C.addr && C.addr.title ? "<br><span>" + esc(C.addr.title) + "</span>" : (navigator.onLine ? "" : "<br><span>No network — address and map are skipped, coordinates are stamped</span>")) : "<span class='gcam-dot r'></span>" + esc(C.gpsErr || "Finding your location… (स्थान खोजा जा रहा है)")) + (C.camErr ? "<br><span class='gcam-err'>" + esc(C.camErr) + "</span>" : "");
  }
  function paint() {
    if (!box || box.hidden) return;
    var v = box.querySelector("video"), im = box.querySelector(".gcam-shot"), bot = box.querySelector("#gcam-bot");
    if (C.shot) { im.src = C.shot.url; im.hidden = false; v.style.visibility = "hidden"; } else { im.hidden = true; v.style.visibility = ""; }
    if (C.shot) {
      bot.innerHTML = "<div class='gcam-row'><button type='button' class='btn ghost' id='gcam-retake'>↺ Retake</button><button type='button' class='btn sec' id='gcam-share'>Share / Download</button><button type='button' class='btn pri' id='gcam-keep'" + (C.busy ? " disabled" : "") + ">✓ Save photo</button></div>";
    } else {
      bot.innerHTML = "<div class='gcam-row gcam-fields'><input class='in' id='gcam-site' placeholder='Site / place (optional), e.g. Gevra OB dump' value='" + esc(C.site) + "' maxlength='120' aria-label='Site or place name'><input class='in' id='gcam-note' placeholder='Note: e.g. Ch. 120 m, drain left side (टिप्पणी)' value='" + esc(C.note) + "' maxlength='300' aria-label='Note on the photo'></div>" +
        "<div class='gcam-row'><button type='button' class='btn ghost' id='gcam-pick' title='Open the phone camera app or pick a photo'>📁 Phone camera</button><button type='button' class='gcam-shoot' id='gcam-shoot' aria-label='Take photo'" + (C.busy ? " disabled" : "") + "><span></span></button><button type='button' class='btn ghost' id='gcam-flip' aria-label='Switch camera'>⟲ Switch</button></div><div class='gcam-note'>Photos are kept for " + KEEP + " days, then deleted — download them in <b>GPS Photos</b>. · फ़ोटो " + KEEP + " दिन बाद डिलीट हो जाती हैं, डाउनलोड कर लें।</div>";
    }
    paintStatus();
  }

  /* ---------- ZIP (stored, no compression — JPGs are already compressed) ---------- */
  var CRC = null;
  function crc32(u8) { if (!CRC) { CRC = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } } var x = 0xffffffff; for (var i = 0; i < u8.length; i++) x = CRC[(x ^ u8[i]) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; }
  async function makeZip(files) {
    var parts = [], central = [], off = 0, enc = new TextEncoder();
    for (var i = 0; i < files.length; i++) {
      var f = files[i], data = new Uint8Array(await f.blob.arrayBuffer()), name = enc.encode(f.name), crc = crc32(data), d = ist(new Date(f.at || Date.now()));
      var tm = d.getHours() << 11 | d.getMinutes() << 5 | (d.getSeconds() >> 1), dt = (d.getFullYear() - 1980) << 9 | (d.getMonth() + 1) << 5 | d.getDate();
      var h = new DataView(new ArrayBuffer(30)); h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, tm, true); h.setUint16(12, dt, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      var c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, tm, true); c.setUint16(14, dt, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      parts.push(h.buffer, name, data); central.push(c.buffer, name); off += 30 + name.length + data.length;
    }
    var csize = central.reduce(function (a, b) { return a + (b.byteLength || b.length); }, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(central, [e.buffer]), { type: "application/zip" });
  }
  U.camZip = makeZip;

  /* ---------- GPS Photos tab: all my photos, separate from estimates ---------- */
  S.cam.q = ""; S.cam.selIds = {};
  var KEEP = 45, DAY = 864e5;
  U.camKeepDays = KEEP;
  function daysLeft(x) { return KEEP - Math.floor((Date.now() - Date.parse(x.taken_at)) / DAY); }
  function leftBadge(n) { return n <= 0 ? "<span class='badge dan'>Deletes today</span>" : "<span class='badge " + (n <= 7 ? "dan" : n <= 15 ? "warn" : "") + "'>Auto-delete in " + n + " day" + (n === 1 ? "" : "s") + "</span>"; }
  /* photos are kept for 45 days after they are taken, then removed (own photos by the owner's app; everybody's by the super admin's app) */
  var purging = false;
  async function purge() {
    if (purging || !owner()) return; purging = true;
    try {
      var cut = new Date(Date.now() - KEEP * DAY).toISOString(), n = 0;
      var L = await localList(), old = L.filter(function (x) { return x.taken_at < cut; });
      if (old.length) { for (var i = 0; i < old.length; i++) await U.off.put("photo:" + old[i].id, null); await editIdx(function (N) { return N.filter(function (x) { return x.taken_at >= cut; }); }); n += old.length; }
      if (navigator.onLine && me()) {
        var q = db().from("site_photos").select("id,path,owner,taken_at").lt("taken_at", cut).limit(500); if (!S.me.isOwner) q = q.eq("owner", me());
        var r = await q;
        if (!r.error) for (var j = 0; j < (r.data || []).length; j++) { var x = r.data[j]; var st = await db().storage.from("site-photos").remove([x.path]); if (st.error) continue; var d = await db().from("site_photos").delete().eq("id", x.id); if (!d.error) { n++; if (C.list) C.list = C.list.filter(function (y) { return y.id !== x.id; }); } }
      }
      if (n) U.render();
    } catch (e) { /* tables not there yet */ } finally { purging = false; }
  }
  U.camPurge = purge;
  U.camExpiring = function () { return allPhotos().filter(function (x) { return daysLeft(x) <= 7; }).length; };
  async function loadList() {
    C.list = C.list || []; C.local = await localList(); purge();
    if (!me()) { C.list = []; C.srvOk = false; U.render(); return; }
    var r = await db().from("site_photos").select("id,owner,path,site,taken_at,lat,lng,acc,alt,address,note,thumb,bytes").eq("owner", me()).order("taken_at", { ascending: false }).limit(1000);
    if (r.error) { if (!U.off || !U.off.isNet(r.error)) { C.srvOk = false; C.srvErr = r.error.message; } C.list = []; }
    else { C.list = r.data || []; C.srvOk = true; }
    U.render();
  }
  function allPhotos() {
    var loc = (C.local || []).map(function (x) { return Object.assign({ local: true }, x); });
    return loc.concat((C.list || []).filter(function (x) { return !loc.some(function (y) { return y.id === x.id; }); })).sort(function (a, b) { return String(b.taken_at).localeCompare(String(a.taken_at)); });
  }
  function addrOf(x) { return typeof x.address === "string" ? x.address : (x.address && (x.address.full || x.address.title)) || ""; }
  function dayOf(x) { var t = ist(new Date(x.taken_at)); return t.getFullYear() + "-" + pad(t.getMonth() + 1) + "-" + pad(t.getDate()); }
  function dayLabel(k) { var p = k.split("-"); var d = new Date(+p[0], +p[1] - 1, +p[2]); return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }
  function shown() { var q = (C.q || "").trim().toLowerCase(); return allPhotos().filter(function (x) { return !q || [x.site, x.note, addrOf(x), dayOf(x), stampTime(new Date(x.taken_at))].join(" ").toLowerCase().indexOf(q) >= 0; }); }
  function selected() { return shown().filter(function (x) { return C.selIds[x.id]; }); }
  U.views.photos = function () {
    if (C.owner !== (S.me && S.me.id)) { C.owner = S.me && S.me.id; C.list = null; C.selIds = {}; }
    if (C.list === null) loadList();
    var L = shown(), sel = selected(), h = "<div style='display:flex;flex-direction:column;gap:12px;max-width:1200px'>";
    h += "<div class='row' style='gap:8px;align-items:center;flex-wrap:wrap'><h1 class='grow' style='margin:0'>GPS Photos · जीपीएस फ़ोटो</h1><button type='button' class='btn pri' data-camopen=''>📷 Take GPS photo</button></div>";
    h += "<p class='muted' style='margin:0;font-size:13px'>Your own photo album, separate from estimates. Every photo shows the place, latitude-longitude, accuracy, date-time and your site name / note on the picture and inside the file (EXIF). Select photos to download them (one JPG, or a ZIP for many), share them or print a photo sheet. Without network photos stay on this phone and upload by themselves later.</p>";
    var soon = L.filter(function (x) { return daysLeft(x) <= 7; }).length;
    h += "<div class='camwarn' role='alert'><b>⚠ Photos are deleted automatically " + KEEP + " days after they are taken.</b> Download the photos you need to your computer / phone (select → Download) before that. <br><b>⚠ फ़ोटो खींचने के " + KEEP + " दिन बाद अपने आप डिलीट हो जाती हैं।</b> ज़रूरी फ़ोटो समय रहते अपने कंप्यूटर / फ़ोन में डाउनलोड कर लें।" + (soon ? "<br><b class='camsoon'>" + soon + " photo" + (soon === 1 ? " is" : "s are") + " deleted within 7 days — download now.</b> <button type='button' class='btn pri sm' id='cam-selsoon'>Select these</button>" : "") + "</div>";
    if (!C.srvOk || C.upErr) h += "<div class='ds-msg' role='note'>Photos are kept on this phone for now. To keep them online (and see them on your other devices) the super admin must run <code>supabase/photos.sql</code> once in Supabase → SQL Editor." + (C.srvErr || C.upErr ? " <span class='muted'>(" + esc(C.upErr || C.srvErr) + ")</span>" : "") + "</div>";
    h += "<div class='panel campbar' style='padding:10px 12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap'><input class='in grow' id='cam-q' placeholder='Search: site, note, place, date (2026-10-18)…' value='" + esc(C.q) + "' aria-label='Search photos' style='min-width:200px'>" +
      "<span class='muted' style='font-size:13px'>" + sel.length + " of " + L.length + " selected</span><button type='button' class='btn ghost sm' id='cam-selall'>" + (sel.length && sel.length === L.length ? "Clear selection" : "Select all") + "</button>" +
      "<button type='button' class='btn sec sm' id='cam-dlsel'" + (sel.length ? "" : " disabled") + ">⬇ Download" + (sel.length > 1 ? " (ZIP)" : "") + "</button><button type='button' class='btn sec sm' id='cam-sharesel'" + (sel.length ? "" : " disabled") + ">Share</button><button type='button' class='btn sec sm' id='cam-report'" + (sel.length ? "" : " disabled") + ">Photo sheet (print / PDF)</button><button type='button' class='btn ghost sm' id='cam-delsel'" + (sel.length ? "" : " disabled") + ">Delete</button></div>";
    if (C.list === null) return h + "<div class='panel empty'>Loading photos…</div></div>";
    if (!L.length) return h + "<div class='panel empty'>" + (C.q ? "No photo matches the search." : "No photos yet. Tap <b>📷 Take GPS photo</b> at site.") + "</div></div>";
    var days = {}, order = []; L.forEach(function (x) { var k = dayOf(x); if (!days[k]) { days[k] = []; order.push(k); } days[k].push(x); });
    order.forEach(function (k) {
      var D = days[k], allSel = D.every(function (x) { return C.selIds[x.id]; }), sites = D.map(function (x) { return x.site; }).filter(function (s, i, a) { return s && a.indexOf(s) === i; });
      h += "<section class='panel' style='padding:12px;display:flex;flex-direction:column;gap:10px'><div class='row' style='gap:8px;align-items:center;flex-wrap:wrap'><label class='row grow' style='gap:8px;align-items:center'><input type='checkbox' data-camday='" + k + "'" + (allSel ? " checked" : "") + " aria-label='Select all photos of " + esc(dayLabel(k)) + "'><h3 style='margin:0'>" + esc(dayLabel(k)) + " <span class='muted' style='font-weight:400'>· " + D.length + " photo" + (D.length === 1 ? "" : "s") + (sites.length ? " · " + esc(sites.join(", ")) : "") + "</span></h3></label></div><div class='camgrid'>";
      h += D.map(function (x) {
        var t = new Date(x.taken_at), addr = addrOf(x), on = !!C.selIds[x.id];
        return "<figure class='camcard" + (on ? " sel" : "") + "'><label class='camchk'><input type='checkbox' data-camsel='" + esc(x.id) + "'" + (on ? " checked" : "") + " aria-label='Select photo'></label><button type='button' class='camthumb' data-camview='" + esc(x.id) + "' aria-label='Open photo'><img src='" + esc(x.thumb || "") + "' alt='GPS photo " + esc(stampTime(t)) + "' loading='lazy'></button><figcaption>" + (x.site ? "<b>" + esc(x.site) + "</b><br>" : "") + esc(stampTime(t)) + (x.lat != null ? "<br>" + (+x.lat).toFixed(6) + ", " + (+x.lng).toFixed(6) + (x.acc != null ? " · ±" + Math.round(x.acc) + " m" : "") : "<br><span class='muted'>No location</span>") + (addr ? "<br><span class='muted'>" + esc(String(addr).slice(0, 90)) + "</span>" : "") + (x.note ? "<br>" + esc(x.note) : "") + (x.local ? "<br><span class='badge warn'>On this phone · uploads later</span>" : "") + "<br>" + leftBadge(daysLeft(x)) +
          "<div class='row' style='gap:4px;flex-wrap:wrap;margin-top:4px'>" + (x.lat != null ? "<a class='btn ghost sm' href='https://www.google.com/maps?q=" + (+x.lat).toFixed(6) + "," + (+x.lng).toFixed(6) + "' target='_blank' rel='noopener'>Map</a>" : "") + "<button type='button' class='btn ghost sm' data-camdl='" + esc(x.id) + "'>Download</button><button type='button' class='btn ghost sm' data-camdel='" + esc(x.id) + "'>Delete</button></div></figcaption></figure>";
      }).join("") + "</div></section>";
    });
    if (C.view) { var v = L.filter(function (x) { return x.id === C.view; })[0]; if (v) h += "<div class='camview' id='camview' role='dialog' aria-label='Photo'><img src='" + esc(C.urls[v.id] || v.thumb || "") + "' alt='GPS photo'><div class='row' style='gap:8px'><button type='button' class='btn sec sm' data-camdl='" + esc(v.id) + "'>Download</button><button type='button' class='btn sec sm' id='camview-x'>Close</button></div></div>"; }
    return h + "</div>";
  };
  async function blobOf(x) {
    if (x.local) { var rec = U.off ? await U.off.get("photo:" + x.id) : null; return recBlob(rec); }
    var r = await db().storage.from("site-photos").download(x.path); return r.error ? null : r.data;
  }
  async function urlOf(x) {
    if (C.urls[x.id]) return C.urls[x.id];
    var b = await blobOf(x); if (!b) return null; C.urls[x.id] = URL.createObjectURL(b); return C.urls[x.id];
  }
  function findPhoto(id) { return allPhotos().filter(function (x) { return x.id === id; })[0]; }
  function uniqName(used, n) { var b = n.replace(/\.jpg$/, ""), k = n, i = 2; while (used[k]) k = b + "_" + (i++) + ".jpg"; used[k] = 1; return k; }
  async function filesOf(list) { var out = [], used = {}, miss = 0; for (var i = 0; i < list.length; i++) { var b = await blobOf(list[i]); if (!b) { miss++; continue; } out.push({ name: uniqName(used, fname(list[i])), blob: b, at: list[i].taken_at }); } if (miss) U.toast(miss + " photo(s) could not be loaded"); return out; }
  async function dlSel() {
    var list = selected(); if (!list.length) return; U.toast("Preparing " + list.length + " photo" + (list.length === 1 ? "" : "s") + "…");
    var fs = await filesOf(list); if (!fs.length) return;
    if (fs.length === 1) { download(fs[0].blob, fs[0].name); return; }
    var days = list.map(dayOf).filter(function (d, i, a) { return a.indexOf(d) === i; }).sort();
    download(await makeZip(fs), "GPS_photos_" + days[0] + (days.length > 1 ? "_to_" + days[days.length - 1] : "") + ".zip");
  }
  async function shareSel() {
    var fs = await filesOf(selected()); if (!fs.length) return;
    var files = fs.map(function (f) { return new File([f.blob], f.name, { type: "image/jpeg" }); });
    if (navigator.canShare && navigator.canShare({ files: files })) { try { await navigator.share({ files: files, title: "GPS photos" }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    U.toast("Sharing many files is not supported here — downloading instead"); if (fs.length === 1) download(fs[0].blob, fs[0].name); else download(await makeZip(fs), "GPS_photos.zip");
  }
  async function delPhotos(list) {
    var locIds = list.filter(function (x) { return x.local; }).map(function (x) { return x.id; }), srv = list.filter(function (x) { return !x.local; });
    for (var i = 0; i < locIds.length; i++) await U.off.put("photo:" + locIds[i], null);
    if (locIds.length) await editIdx(function (N) { return N.filter(function (y) { return locIds.indexOf(y.id) < 0; }); });
    for (var j = 0; j < srv.length; j++) { var r1 = await db().from("site_photos").delete().eq("id", srv[j].id); if (U.fail(r1, "Couldn't delete the photo.")) break; await db().storage.from("site-photos").remove([srv[j].path]); C.list = (C.list || []).filter(function (y) { return y.id !== srv[j].id; }); }
    list.forEach(function (x) { delete C.selIds[x.id]; });
    U.toast(list.length === 1 ? "Photo deleted" : list.length + " photos deleted"); U.render();
  }
  async function report() {
    var items = selected(); if (!items.length) return;
    var w = window.open("", "_blank"); if (!w) { U.toast("Allow pop-ups to open the photo sheet"); return; }
    w.document.write("<!doctype html><meta charset='utf-8'><title>Photo sheet</title><body style='font-family:system-ui,sans-serif;margin:16px'><p>Preparing photos…</p></body>");
    var cards = [];
    for (var i = 0; i < items.length; i++) { var x = items[i], b = await blobOf(x); var du = b ? await new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsDataURL(b); }) : x.thumb; cards.push({ x: x, src: du }); }
    var sites = items.map(function (x) { return x.site; }).filter(function (s, i, a) { return s && a.indexOf(s) === i; });
    var html = "<!doctype html><html><head><meta charset='utf-8'><title>GPS photos</title><style>body{font-family:system-ui,Segoe UI,Roboto,sans-serif;margin:0;color:#111}h1{font-size:18px;margin:0 0 4px}.pg{padding:14mm 12mm}.ph{break-inside:avoid;margin:0 0 8mm}.ph img{width:100%;max-height:115mm;object-fit:contain;border:1px solid #ccc}.ph p{margin:3px 0;font-size:12px}.top{display:flex;justify-content:space-between;gap:12px;font-size:12px;margin-bottom:8mm;border-bottom:1px solid #999;padding-bottom:4px}@media print{.noprint{display:none}}</style></head><body><div class='pg'><div class='noprint' style='margin-bottom:10px'><button onclick='print()'>Print / Save as PDF</button></div><div class='top'><div><h1>Site photographs</h1>" + esc(sites.join(", ")) + "</div><div style='text-align:right'>" + esc(S.me.name || "") + "<br>" + cards.length + " photo" + (cards.length === 1 ? "" : "s") + "</div></div>" +
      cards.map(function (c, i) { var x = c.x, addr = addrOf(x); return "<div class='ph'><img src='" + c.src + "' alt=''><p><b>Photo " + (i + 1) + "</b>" + (x.site ? " · " + esc(x.site) : "") + " · " + esc(stampTime(new Date(x.taken_at))) + (x.lat != null ? " · Lat " + (+x.lat).toFixed(6) + ", Long " + (+x.lng).toFixed(6) + (x.acc != null ? " (±" + Math.round(x.acc) + " m)" : "") : "") + "</p>" + (addr ? "<p>" + esc(addr) + "</p>" : "") + (x.note ? "<p>Note: " + esc(x.note) + "</p>" : "") + "</div>"; }).join("") + "</div></body></html>";
    w.document.open(); w.document.write(html); w.document.close();
  }

  /* ---------- events ---------- */
  document.addEventListener("click", async function (ev) {
    var t = ev.target.closest && ev.target.closest("button"); if (!t) return;
    var ds = t.dataset;
    if (ds.camopen != null) U.openCam();
    else if (t.id === "gcam-close") closeCam();
    else if (t.id === "gcam-shoot") capture();
    else if (t.id === "gcam-pick") { var f = document.getElementById("gcam-file"); if (f) f.click(); }
    else if (t.id === "gcam-flip") { C.facing = C.facing === "environment" ? "user" : "environment"; startCam(); }
    else if (t.id === "gcam-retake") { if (C.shot) URL.revokeObjectURL(C.shot.url); C.shot = null; paint(); }
    else if (t.id === "gcam-share") { if (C.shot) share(C.shot.blob, C.shot.m); }
    else if (t.id === "gcam-keep") keepShot();
    else if (ds.camview) { C.view = ds.camview; U.render(); var x = findPhoto(ds.camview); if (x) { await urlOf(x); U.render(); } }
    else if (t.id === "camview-x") { C.view = null; U.render(); }
    else if (ds.camdl) { var x2 = findPhoto(ds.camdl); if (!x2) return; var b = await blobOf(x2); if (!b) { U.toast("Couldn't load the photo"); return; } share(b, x2); }
    else if (ds.camdel) { if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again to delete"; return; } var x3 = findPhoto(ds.camdel); if (x3) delPhotos([x3]); }
    else if (t.id === "cam-selall") { var L = shown(), all = L.length && L.every(function (x) { return C.selIds[x.id]; }); C.selIds = {}; if (!all) L.forEach(function (x) { C.selIds[x.id] = 1; }); U.render(); }
    else if (t.id === "cam-selsoon") { C.selIds = {}; shown().forEach(function (x) { if (daysLeft(x) <= 7) C.selIds[x.id] = 1; }); U.render(); }
    else if (t.id === "cam-dlsel") dlSel();
    else if (t.id === "cam-sharesel") shareSel();
    else if (t.id === "cam-report") report();
    else if (t.id === "cam-delsel") { var sl = selected(); if (!sl.length) return; if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "Click again to delete " + sl.length; return; } delPhotos(sl); }
  });
  document.addEventListener("change", function (ev) {
    var t = ev.target, ds = t.dataset || {};
    if (t.id === "gcam-file") { fromFile(t.files && t.files[0]); t.value = ""; }
    else if (ds.camsel) { if (t.checked) C.selIds[ds.camsel] = 1; else delete C.selIds[ds.camsel]; U.render(); }
    else if (ds.camday) { shown().filter(function (x) { return dayOf(x) === ds.camday; }).forEach(function (x) { if (t.checked) C.selIds[x.id] = 1; else delete C.selIds[x.id]; }); U.render(); }
  });
  document.addEventListener("input", function (ev) {
    var t = ev.target;
    if (t.id === "gcam-note") C.note = t.value;
    else if (t.id === "gcam-site") { C.site = t.value; try { localStorage.setItem("ep_cam_site", t.value); } catch (e) {} }
    else if (t.id === "cam-q") { C.q = t.value; U.render(); }
  });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && box && !box.hidden) closeCam(); else if (ev.key === "Escape" && C.view) { C.view = null; U.render(); } });

  /* header button + upload pending photos after sign-in */
  U.camButton = function () { return '<button type="button" class="btn sec sm cam-btn" data-camopen="" title="GPS camera: site photo with location, date and time' + (me() ? '' : ' (offline mode · ऑफ़लाइन मोड)') + '">📷 <span>GPS Camera</span></button>'; };

  /* migrate anonymous photos to the signed-in user */
  U.camMigrate = async function () {
    if (!U.off || !me()) return;
    var aKey = "ep_anon_cam", anon; try { anon = localStorage.getItem(aKey); } catch (e) { return; }
    if (!anon || anon === me()) { try { localStorage.removeItem(aKey); } catch (e) {} return; }
    var oldIdx = (await U.off.get("photos:" + anon)) || [];
    if (!oldIdx.length) { try { localStorage.removeItem(aKey); } catch (e) {} return; }
    var curIdx = (await U.off.get("photos:" + me())) || [];
    var moved = 0;
    for (var i = 0; i < oldIdx.length; i++) {
      var p = oldIdx[i], rec = await U.off.get("photo:" + p.id);
      if (rec && rec.meta) rec.meta.owner = me();
      if (rec) await U.off.putStrict("photo:" + p.id, rec);
      p.owner = me(); p.local = true;
      if (!curIdx.some(function (y) { return y.id === p.id; })) curIdx.unshift(p);
      moved++;
    }
    await U.off.putStrict("photos:" + me(), curIdx);
    await U.off.put("photos:" + anon, null);
    try { localStorage.removeItem(aKey); } catch (e) {}
    C.local = curIdx; C.list = null;
    if (moved) U.toast(moved + " photo" + (moved === 1 ? "" : "s") + " from offline session linked to your account · ऑफ़लाइन फ़ोटो आपके अकाउंट से जुड़ गईं");
    U.camSync();
  };

  var started = false;
  setInterval(function () { if (me() && !started && U.off) { started = true; setTimeout(function () { U.camMigrate(); U.camSync(); if (C.list === null) loadList(); else purge(); }, 6000); } if (!me()) started = false; }, 3000);
})();
